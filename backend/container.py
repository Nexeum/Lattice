import os
import re
import subprocess
import json
import io
import tarfile
import threading
import datetime
import asyncio
from fastapi import FastAPI, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
import docker
import gridfs
import psutil
import requests
import time
from pymongo import MongoClient, ReturnDocument
from bson.objectid import ObjectId
from auth_shared import require_user, require_user_query, require_admin, decode_token, cors_origins, MONGO_URL

def api_client_from_env():
    """Low-level APIClient resolved like docker.from_env (DOCKER_HOST, then
    the active docker context) — needed for interactive exec sockets."""
    from docker.context import ContextAPI
    from docker.utils import kwargs_from_env
    params = kwargs_from_env()
    if 'base_url' not in params:
        for key, value in ContextAPI.kwargs_from_context().items():
            params.setdefault(key, value)
    return docker.APIClient(**params)

client = docker.from_env()
api_client = api_client_from_env()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def restart_docker_service(container):
    exec_id = container.exec_run("sh -c 'service docker stop'", privileged=True)
    exec_id = container.exec_run("sh -c 'service docker start'", privileged=True)
    return exec_id.output.decode("utf-8")

def get_container_ip(id):
    client = docker.from_env()
    container = client.containers.get(id)
    return container.attrs['NetworkSettings']['IPAddress']

@app.get('/container/{container_id}/ip')
async def get_container_ip(container_id: str, user=Depends(require_user)):
    try:
        container = client.containers.get(container_id)
        ip_address = container.attrs['NetworkSettings']['IPAddress']
        return {'ip_address': ip_address}
    except Exception as e:
        return {'error': str(e)}

@app.post('/exe/{container_id}/{command}')
async def execute_command(container_id: str, command: str, host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    try:
        container = docker_client.containers.get(container_id)
        exec_id = container.exec_run(f"sh -c '{command}'", privileged=True)
        output = exec_id.output.decode("utf-8")

        if exec_id.exit_code != 0:
            return {'error': output}
        else:
            return {'output': output}
    except Exception as e:
        return {'error': str(e)}
    
@app.post('/node/{outer_container_id}/{inner_container_id}/{command}')
async def execute_nested_command(outer_container_id: str, inner_container_id: str, command: str, host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    try:
        outer_container = docker_client.containers.get(outer_container_id)
        nested_command = f"docker exec --privileged {inner_container_id} sh -c '{command}'"
        exec_id = outer_container.exec_run(nested_command, privileged=True)
        output = exec_id.output.decode("utf-8")

        if exec_id.exit_code != 0:
            return {'error': output}
        else:
            return {'output': output}
    except Exception as e:
        return {'error': str(e)}
    
NODE_IMAGE = "docker:dind"
NODE_DAEMON_TIMEOUT_SECONDS = 30

@app.post("/containermain/{id}")
async def create_container_main(id: str, host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    containers = {container.name: container for container in docker_client.containers.list(all=True)}
    if id in containers:
        return {"message": f"Container {id} already exists"}
    container = docker_client.containers.run(
        NODE_IMAGE,
        detach=True,
        name=id,
        privileged=True,
        environment={"DOCKER_TLS_CERTDIR": ""},
        volumes=["/var/lib/docker"],
    )
    record_event(id, "workspace_provisioned", f"workspace {id} provisioned", user.get("user_id"))
    for _ in range(NODE_DAEMON_TIMEOUT_SECONDS):
        check = container.exec_run("docker info --format {{.ServerVersion}}")
        if check.exit_code == 0:
            inner_version = check.output.decode("utf-8").strip()
            return {"message": f"Node {id} ready (inner Docker {inner_version})"}
        time.sleep(1)
    return {"message": f"Node {id} created; inner Docker daemon is still starting"}

@app.get("/containers/{container_id}/ps")
async def list_containers(container_id: str, host: str = None, user=Depends(require_user)):
    container = get_client(host).containers.get(container_id)
    exec_id = container.exec_run("sh -c 'docker ps -a --format \"{{.ID}},{{.Names}},{{.Image}},{{.Status}}\"'", privileged=True)
    containers_info = exec_id.output.decode("utf-8").split("\n")
    containers_with_ip = []
    for container_info in containers_info:
        if container_info and container_info.count(",") == 3:
            container_id, name, image, status = container_info.split(",")
            ip_exec_id = container.exec_run("sh -c 'docker inspect --format \"{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}\" " + container_id + "'", privileged=True)
            ip = ip_exec_id.output.decode("utf-8").strip()
            containers_with_ip.append({"ID": container_id, "Name": name, "Image": image, "Status": status, "IP": ip})
    return {"output": containers_with_ip}

@app.get("/containers")
async def get_containers(host: str = None, user=Depends(require_user)):
    cli_env = docker_cli_env(host)
    ensure_sampler_started()
    try:
        output = subprocess.check_output(["docker", "ps", "-a", "--format", "{{json .}}"], env=cli_env)
        containers = [json.loads(line) for line in output.splitlines()]
        containers = [c for c in containers if not c['Names'].startswith('k8s_')]
        modified_containers = []

        for container in containers:
            inspect_output = subprocess.check_output(["docker", "inspect", container['ID']], env=cli_env)
            inspect_data = json.loads(inspect_output)

            network_settings = inspect_data[0]['NetworkSettings']
            if network_settings['Networks']:
                container['IP'] = list(network_settings['Networks'].values())[0]['IPAddress']
            else:
                container['IP'] = 'N/A'

            if network_settings['Ports']:
                container['Port'] = list(network_settings['Ports'].keys())[0]
            else:
                container['Port'] = 'N/A'

            container['Status'] = inspect_data[0]['State']['Status']
            modified_containers.append(container)

        return modified_containers
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to get containers', 'message': str(e)})

@app.get("/container/{id}/metrics")
async def get_container_metrics(id: str, host: str = None, user=Depends(require_user)):
    cli_env = docker_cli_env(host)
    try:
        output = subprocess.check_output(["docker", "stats", id, "--no-stream", "--format", "{{json .}}"], env=cli_env)
        metrics = json.loads(output)
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to get container metrics', 'message': str(e)})
    
@app.get("/container/{container_id}/{name}/{image}/{shell}")
async def create_container(container_id: str, name: str, image: str, shell: str, user=Depends(require_user)):
    container = client.containers.get(container_id)
    exec_id = container.exec_run(f"sh -c 'docker run -dit --privileged --name {name} {image} {shell}'", privileged=True)
    return {"output": exec_id.output.decode("utf-8")}

PACKAGES_SERVICE_URL = os.environ.get("LATTICE_PACKAGES_URL", "http://localhost:5003")
PLUGINS_DIR = "/opt/lattice/plugins"

def fetch_package_or_404(package_id: str, authorization: str = None):
    headers = {"Authorization": authorization} if authorization else {}
    response = requests.get(f"{PACKAGES_SERVICE_URL}/packages/{package_id}", headers=headers, timeout=15)
    if response.status_code != 200:
        raise HTTPException(status_code=404, detail="Package not found")
    package = response.json()
    files = [f for f in package.get("files", []) if f.get("content") is not None]
    if not files:
        raise HTTPException(status_code=400, detail="Package has no files to install")
    return package, files

def build_package_tar(package_name: str, files: list) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        for file in files:
            data = file["content"].encode("utf-8")
            info = tarfile.TarInfo(name=f"{package_name}/{file['name']}")
            info.size = len(data)
            info.mode = 0o755
            tar.addfile(info, io.BytesIO(data))
    buffer.seek(0)
    return buffer.read()

def run_install_script(container, package_name: str, files: list, docker_exec_prefix: str = ""):
    if not any(f["name"] == "install.sh" for f in files):
        return None
    script_path = f"{PLUGINS_DIR}/{package_name}/install.sh"
    command = f"{docker_exec_prefix}sh {script_path}"
    exec_id = container.exec_run(f"sh -c '{command}'", privileged=True)
    return exec_id.output.decode("utf-8")

@app.post("/container/{container_id}/install/{package_id}")
async def install_package(container_id: str, package_id: str, host: str = None, user=Depends(require_user), authorization: str = Header(None)):
    try:
        package, files = fetch_package_or_404(package_id, authorization)
        package_name = package.get("name", package_id)
        container = get_client(host).containers.get(container_id)

        container.exec_run(f"sh -c 'mkdir -p {PLUGINS_DIR}'", privileged=True)
        container.put_archive(PLUGINS_DIR, build_package_tar(package_name, files))
        install_output = run_install_script(container, package_name, files)
        record_event(container.name, "plugin_installed", f"plugin {package_name} installed", user.get("user_id"))

        return {
            "installed": package_name,
            "path": f"{PLUGINS_DIR}/{package_name}",
            "files": [f["name"] for f in files],
            "installOutput": install_output,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to install package', 'message': str(e)})

@app.post("/node/{outer_container_id}/{inner_container_id}/install/{package_id}")
async def install_package_nested(outer_container_id: str, inner_container_id: str, package_id: str, host: str = None, user=Depends(require_user), authorization: str = Header(None)):
    try:
        package, files = fetch_package_or_404(package_id, authorization)
        package_name = package.get("name", package_id)
        outer = get_client(host).containers.get(outer_container_id)

        staging_dir = "/opt/lattice/.staging"
        outer.exec_run(f"sh -c 'mkdir -p {staging_dir}'", privileged=True)
        outer.put_archive(staging_dir, build_package_tar(package_name, files))

        copy_command = (
            f"docker exec {inner_container_id} mkdir -p {PLUGINS_DIR} && "
            f"docker cp {staging_dir}/{package_name} {inner_container_id}:{PLUGINS_DIR}/"
        )
        copy_exec = outer.exec_run(f"sh -c '{copy_command}'", privileged=True)
        if copy_exec.exit_code != 0:
            raise HTTPException(status_code=500, detail={
                'error': 'Failed to copy package into nested container',
                'message': copy_exec.output.decode("utf-8"),
            })

        install_output = run_install_script(
            outer, package_name, files,
            docker_exec_prefix=f"docker exec {inner_container_id} ",
        )
        record_event(outer.name, "plugin_installed",
                     f"plugin {package_name} installed in {inner_container_id}", user.get("user_id"))

        return {
            "installed": package_name,
            "target": inner_container_id,
            "path": f"{PLUGINS_DIR}/{package_name}",
            "files": [f["name"] for f in files],
            "installOutput": install_output,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to install package', 'message': str(e)})

# ---------------------------------------------------------------------------
# Stacks (deploy a multi-service template into a workspace parent)
# ---------------------------------------------------------------------------

STACK_MAX_SERVICES = 10
STACK_MAX_REPLICAS = 10
STACK_NAME_SANITIZE_RE = re.compile(r"[^a-z0-9-]")
STACK_RESTART_POLICIES = ("no", "always")
STACK_PROBE_TYPES = ("http", "tcp", "cmd")

def parse_stack_probe(name, probe):
    """Validate one service's probe spec ({"type": "http"|"tcp"|"cmd", ...});
    raises 400 on anything malformed."""
    if not isinstance(probe, dict):
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} probe must be an object")
    probe_type = probe.get("type")
    if probe_type not in STACK_PROBE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} probe type must be http, tcp or cmd")
    if probe_type == "cmd":
        command = str(probe.get("command") or "").strip()
        if not command:
            raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} cmd probe needs a command")
        return {"type": "cmd", "command": command}
    try:
        port = int(probe.get("port"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} probe needs an integer port")
    if not 1 <= port <= 65535:
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} probe port must be 1-65535")
    validated = {"type": probe_type, "port": port}
    if probe_type == "http":
        validated["path"] = str(probe.get("path") or "/")
    return validated

def parse_stack_autoscale(name, autoscale):
    """Validate one service's autoscale spec ({"min", "max", "targetCPU"});
    raises 400 on anything malformed."""
    if not isinstance(autoscale, dict):
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} autoscale must be an object")
    minimum = autoscale.get("min", 1)
    maximum = autoscale.get("max")
    target = autoscale.get("targetCPU")
    if not isinstance(minimum, int) or not isinstance(maximum, int) \
            or isinstance(minimum, bool) or isinstance(maximum, bool) \
            or not 1 <= minimum <= maximum <= STACK_MAX_REPLICAS:
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} autoscale needs ints 1 <= min <= max <= {STACK_MAX_REPLICAS}")
    if not isinstance(target, (int, float)) or isinstance(target, bool) or not 0 < target <= 100:
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} autoscale targetCPU must be a number in (0, 100]")
    return {"min": minimum, "max": maximum, "targetCPU": float(target)}

def parse_stack_services(files):
    """Validate a stack plugin's stack.json: {"services": [{"name", "image",
    "shell"?, "replicas"?, "restart"?, "memory"?, "cpus"?, "probe"?,
    "autoscale"?}]}. Names are sanitized to [a-z0-9-]; an autoscale spec
    implies restart "always"; raises 400 on anything malformed."""
    by_name = {f["name"]: f for f in files}
    stack_file = by_name.get("stack.json")
    if not stack_file or not stack_file.get("content"):
        raise HTTPException(status_code=400, detail="Package has no stack.json")
    try:
        parsed = json.loads(stack_file["content"])
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: {e}")
    services = parsed.get("services") if isinstance(parsed, dict) else None
    if not isinstance(services, list) or not services:
        raise HTTPException(status_code=400, detail="Invalid stack.json: services must be a non-empty list")
    if len(services) > STACK_MAX_SERVICES:
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: at most {STACK_MAX_SERVICES} services allowed")
    validated = []
    for service in services:
        if not isinstance(service, dict):
            raise HTTPException(status_code=400, detail="Invalid stack.json: each service must be an object")
        name = STACK_NAME_SANITIZE_RE.sub("", str(service.get("name") or "").lower())
        image = str(service.get("image") or "").strip()
        shell = str(service.get("shell") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Invalid stack.json: each service needs a name ([a-z0-9-])")
        if not image:
            raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} has no image")
        replicas = service.get("replicas", 1)
        if not isinstance(replicas, int) or isinstance(replicas, bool) or not 1 <= replicas <= STACK_MAX_REPLICAS:
            raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} replicas must be an int between 1 and {STACK_MAX_REPLICAS}")
        restart = service.get("restart", "no")
        if restart not in STACK_RESTART_POLICIES:
            raise HTTPException(status_code=400, detail=f'Invalid stack.json: service {name} restart must be "always" or "no"')
        memory = str(service.get("memory") or "").strip()
        cpus = str(service.get("cpus") or "").strip()
        probe = parse_stack_probe(name, service["probe"]) if service.get("probe") is not None else None
        autoscale = parse_stack_autoscale(name, service["autoscale"]) if service.get("autoscale") is not None else None
        if autoscale:
            restart = "always"
        validated.append({
            "name": name, "image": image, "shell": shell,
            "replicas": replicas, "restart": restart,
            "memory": memory, "cpus": cpus,
            "probe": probe, "autoscale": autoscale,
        })
    return validated

def run_stack_container(parent, service, index):
    """docker run one replica (<service>-<index>) inside the parent; returns
    (ok, last_line) and never raises. Restart policy is deliberately NOT
    passed to docker — the reconciler owns it."""
    command = f"docker run -dit --privileged --name {service['name']}-{index}"
    if service.get("memory"):
        command += f" --memory {service['memory']}"
    if service.get("cpus"):
        command += f" --cpus {service['cpus']}"
    command += f" {service['image']}"
    if service.get("shell"):
        command += f" {service['shell']}"
    try:
        exec_result = parent.exec_run(f"sh -c '{command}'", privileged=True)
        output = exec_result.output.decode("utf-8", errors="replace").strip()
        last_line = output.splitlines()[-1].strip() if output else ""
        ok = exec_result.exit_code == 0 and "error" not in last_line.lower()
        return ok, last_line
    except Exception as e:
        return False, str(e)

def deploy_stack_service(parent, service):
    """docker run every replica of one service inside the parent; returns one
    result per container and never raises."""
    results = []
    for index in range(1, service["replicas"] + 1):
        ok, output = run_stack_container(parent, service, index)
        results.append({"name": f"{service['name']}-{index}", "ok": ok, "output": output})
    return results

def pick_auto_host():
    """ECS-style placement: among "local" plus every registered host, pick the
    reachable one whose docker runs the fewest containers."""
    candidates = ["local"] + [doc.get("name", "") for doc in docker_hosts.find()]
    best_host, best_count = None, None
    for name in candidates:
        try:
            count = len(get_client(name).containers.list())
        except Exception:
            continue
        if best_count is None or count < best_count:
            best_host, best_count = name, count
    if best_host is None:
        raise HTTPException(status_code=503, detail="No docker host is reachable")
    return best_host

@app.post("/container/{parent_id}/stack/{package_id}")
async def deploy_stack(parent_id: str, package_id: str, host: str = None, user=Depends(require_user), authorization: str = Header(None)):
    try:
        package, files = fetch_package_or_404(package_id, authorization)
        services = parse_stack_services(files)
        host = pick_auto_host() if host == "auto" else (host or "local")
        parent = get_client(host).containers.get(parent_id)
        actor = user.get("user_id")
        deployed = []
        for service in services:
            results = deploy_stack_service(parent, service)
            deployed.extend(results)
            event_type = "service_deployed" if all(r["ok"] for r in results) else "service_failed"
            record_event(parent.name, event_type,
                         f"service {service['name']} x{service['replicas']} ({service['image']})", actor)
        deployments.update_one(
            {"parent_name": parent.name},
            {"$set": {
                "parent_id": parent.id,
                "parent_name": parent.name,
                "host": host,
                "package_id": package_id,
                "services": services,
                "updated_at": utc_now_iso(),
            }},
            upsert=True,
        )
        ensure_reconciler_started()
        return {"deployed": deployed, "host": host}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to deploy stack', 'message': str(e)})

# ---------------------------------------------------------------------------
# CI runs (GitHub-Actions-style pipelines for plugins)
# ---------------------------------------------------------------------------

ci_db = MongoClient(MONGO_URL)['kubehub']
ci_runs = ci_db['ci_runs']
artifacts_fs = gridfs.GridFS(ci_db, collection="ci_artifacts")

CI_IMAGE = "alpine:3.19"
CI_STEP_TIMEOUT_SECONDS = 120
CI_ARTIFACT_MAX_FILE_BYTES = 10 * 1024 * 1024
CI_ARTIFACT_MAX_FILES = 20
CI_CONCURRENCY = int(os.environ.get("LATTICE_CI_CONCURRENCY", "2"))
# "awaiting_approval" is deliberately NOT active: the SSE stream emits it as
# the final state and closes; approve/reject continue the run out-of-band.
CI_ACTIVE_STATUSES = {"queued", "starting", "running"}
CI_WORKER_IDLE_SLEEP_SECONDS = 1

_ci_workers_lock = threading.Lock()
_ci_workers_started = False

def utc_now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def serialize_run(doc):
    doc = dict(doc)
    doc["_id"] = str(doc["_id"])
    doc.pop("files", None)
    return doc

def plan_ci_steps(files):
    """Pipeline definition: lattice-ci.json wins; it is either the legacy array
    [{name, run}] or an object {"image": ..., "steps": [{name, run}]}. Falls
    back to conventional steps derived from well-known files. Returns
    (image, steps)."""
    by_name = {f["name"]: f for f in files}
    ci_file = by_name.get("lattice-ci.json")
    image = CI_IMAGE
    if ci_file and ci_file.get("content"):
        try:
            parsed = json.loads(ci_file["content"])
            raw_steps = parsed
            if isinstance(parsed, dict):
                raw_steps = parsed.get("steps")
                if isinstance(parsed.get("image"), str) and parsed["image"].strip():
                    image = parsed["image"].strip()
            steps = [
                {"name": str(s["name"]), "run": str(s["run"])}
                for s in raw_steps
                if isinstance(s, dict) and s.get("name") and s.get("run")
            ]
            if steps:
                return image, steps
        except (ValueError, TypeError, KeyError):
            pass

    steps = []
    if "install.sh" in by_name:
        steps.append({"name": "Install", "run": "sh install.sh"})
    if "test.sh" in by_name:
        steps.append({"name": "Test", "run": "sh test.sh"})
    if not steps:
        steps.append({"name": "Validate files", "run": "ls -la"})
    return image, steps

def plan_ci_deploy(files):
    """CD half of the pipeline definition: the object form of lattice-ci.json
    may carry {"deploy": {"workspace": "<parent container name>",
    "environment"?: "<environment name>"}}. Returns the validated deploy
    config, or None when absent/malformed (the run is then CI-only)."""
    by_name = {f["name"]: f for f in files}
    ci_file = by_name.get("lattice-ci.json")
    if not ci_file or not ci_file.get("content"):
        return None
    try:
        parsed = json.loads(ci_file["content"])
    except (ValueError, TypeError):
        return None
    deploy = parsed.get("deploy") if isinstance(parsed, dict) else None
    if not isinstance(deploy, dict):
        return None
    workspace = str(deploy.get("workspace") or "").strip()
    if not workspace:
        return None
    environment = str(deploy.get("environment") or "").strip() or None
    return {"workspace": workspace, "environment": environment}

def create_ci_runner(run):
    """Create the runner container for a claimed run. This is the slow part
    (image pull) and happens while the run is in the "starting" state."""
    runner = client.containers.run(
        run.get("image", CI_IMAGE), "sleep 600", detach=True,
        name=f"lattice-ci-{str(run['_id'])[-8:]}-{int(time.time())}",
    )
    runner.exec_run("sh -c 'mkdir -p /work'")
    runner.put_archive("/work", build_package_tar(run["package_name"], run["files"]))
    return runner

def execute_ci_step(runner, run_id, workdir, index, step):
    started = time.time()
    ci_runs.update_one(
        {"_id": run_id},
        {"$set": {f"steps.{index}.status": "running",
                  f"steps.{index}.started_at": utc_now_iso()}},
    )
    exec_result = runner.exec_run(
        f"sh -c 'cd {workdir} && timeout {CI_STEP_TIMEOUT_SECONDS} sh -c \"{step['run']}\"'"
    )
    output = exec_result.output.decode("utf-8", errors="replace")
    step_status = "success" if exec_result.exit_code == 0 else "failed"
    ci_runs.update_one(
        {"_id": run_id},
        {"$set": {
            f"steps.{index}.status": step_status,
            f"steps.{index}.output": output[-20000:],
            f"steps.{index}.exit_code": exec_result.exit_code,
            f"steps.{index}.duration_seconds": round(time.time() - started, 2),
        }},
    )
    return step_status

def capture_ci_artifacts(runner, run):
    """Capture whatever the run's steps left in /work/<pkg>/artifacts into
    GridFS (regular files <= 10 MB, capped at 20) and $set the manifest on the
    run doc. Runs on success AND failure — failed builds' dumps are gold.
    Missing directory means no artifacts; never raises."""
    try:
        bits, _ = runner.get_archive(f"/work/{run['package_name']}/artifacts")
        archive = io.BytesIO(b"".join(bits))
        artifacts = []
        with tarfile.open(fileobj=archive) as tar:
            for member in tar.getmembers():
                if len(artifacts) >= CI_ARTIFACT_MAX_FILES:
                    break
                if not member.isreg() or member.size > CI_ARTIFACT_MAX_FILE_BYTES:
                    continue
                relative_name = member.name.split("/", 1)[1] if "/" in member.name else member.name
                if not relative_name:
                    continue
                data = tar.extractfile(member).read()
                gridfs_id = artifacts_fs.put(
                    data, filename=relative_name, metadata={"run_id": str(run["_id"])},
                )
                artifacts.append({"id": str(gridfs_id), "name": relative_name, "size": len(data)})
        if artifacts:
            ci_runs.update_one({"_id": run["_id"]}, {"$set": {"artifacts": artifacts}})
    except Exception:
        pass

def post_ci_webhook(run, status, finished_at):
    """Best-effort notification at the end of a run. No-op unless
    LATTICE_CI_WEBHOOK_URL is set; never raises."""
    webhook_url = os.environ.get("LATTICE_CI_WEBHOOK_URL")
    if not webhook_url:
        return
    try:
        requests.post(webhook_url, json={
            "package": run.get("package_name"),
            "run": run.get("number"),
            "status": status,
            "trigger": run.get("trigger"),
            "finished_at": finished_at,
        }, timeout=5)
    except Exception:
        pass

def deploy_run_stack(parent, run, files, actor):
    """Stack half of execute_run_deploy: the same per-service pipeline as the
    /container/{parent}/stack endpoint (docker run per replica + events +
    deployments upsert + reconciler). Returns (ok, detail)."""
    services = parse_stack_services(files)
    deployed = []
    for service in services:
        results = deploy_stack_service(parent, service)
        deployed.extend(results)
        event_type = "service_deployed" if all(r["ok"] for r in results) else "service_failed"
        record_event(parent.name, event_type,
                     f"service {service['name']} x{service['replicas']} ({service['image']})", actor)
    deployments.update_one(
        {"parent_name": parent.name},
        {"$set": {
            "parent_id": parent.id,
            "parent_name": parent.name,
            "host": "local",
            "package_id": run.get("package_id"),
            "services": services,
            "updated_at": utc_now_iso(),
        }},
        upsert=True,
    )
    ensure_reconciler_started()
    started = sum(1 for r in deployed if r["ok"])
    return started == len(deployed), f"stack deployed: {started}/{len(deployed)} containers started"

def execute_run_deploy(run, actor=None):
    """Execute a run's CD phase against its target workspace, using the file
    snapshot stored on the run doc (not the live package). Packages with a
    stack.json go through the stack pipeline; anything else installs as a
    plugin under /opt/lattice/plugins/<name>. Deploys target the local host,
    resolving the parent by exact container name. Stores deploy_result on the
    run, records a deployed/deploy_failed event, and never raises."""
    deploy = run.get("deploy") or {}
    workspace = str(deploy.get("workspace") or "")
    files = [f for f in run.get("files", []) if f.get("content") is not None]
    package_name = run.get("package_name", "package")
    try:
        if not workspace:
            raise ValueError("run has no deploy workspace")
        if not files:
            raise ValueError("run has no files to deploy")
        try:
            parent = client.containers.get(workspace)
        except docker.errors.NotFound:
            raise ValueError(f"workspace {workspace} not found")
        if any(f["name"] == "stack.json" for f in files):
            ok, detail = deploy_run_stack(parent, run, files, actor)
        else:
            parent.exec_run(f"sh -c 'mkdir -p {PLUGINS_DIR}'", privileged=True)
            parent.put_archive(PLUGINS_DIR, build_package_tar(package_name, files))
            run_install_script(parent, package_name, files)
            ok, detail = True, f"installed {package_name} at {PLUGINS_DIR}/{package_name}"
    except HTTPException as e:
        ok, detail = False, str(e.detail)
    except Exception as e:
        ok, detail = False, str(e)
    result = {"ok": ok, "detail": detail[:500]}
    ci_runs.update_one({"_id": run["_id"]}, {"$set": {"deploy_result": result}})
    record_event(workspace, "deployed" if ok else "deploy_failed",
                 f"run #{run.get('number')} of {package_name}: {result['detail']}", actor)
    return result

def finalize_ci_run(run, status):
    """Close out a run once its steps (and runner) are done. Successful runs
    that carry a deploy config move on to the CD phase: a protected target
    environment parks the run at "awaiting_approval" (finished_at stays null
    until approve/reject); otherwise the deploy executes inline and decides
    the final status."""
    run_id = run["_id"]
    deploy = run.get("deploy")
    if status == "success" and deploy:
        environment = environments.find_one({"name": deploy["environment"]}) if deploy.get("environment") else None
        if environment and environment.get("protected"):
            ci_runs.update_one({"_id": run_id}, {"$set": {"status": "awaiting_approval"}})
            record_event(deploy.get("workspace"), "deploy_pending",
                         f"run #{run.get('number')} of {run.get('package_name')} awaits approval for {deploy['environment']}")
            return
        result = execute_run_deploy(run)
        status = "success" if result["ok"] else "failed"
    finished_at = utc_now_iso()
    ci_runs.update_one(
        {"_id": run_id},
        {"$set": {"status": status, "finished_at": finished_at}},
    )
    post_ci_webhook(run, status, finished_at)

def execute_ci_run(run):
    """Execute a claimed run (status already "starting"). Creates the runner
    container, transitions to "running", executes steps, and finalizes."""
    run_id = run["_id"]
    steps = run.get("steps", [])
    workdir = f"/work/{run['package_name']}"
    runner = None
    status = "success"
    try:
        runner = create_ci_runner(run)
        ci_runs.update_one({"_id": run_id}, {"$set": {"status": "running"}})
        for index, step in enumerate(steps):
            if execute_ci_step(runner, run_id, workdir, index, step) == "failed":
                status = "failed"
                remaining = {
                    f"steps.{i}.status": "skipped" for i in range(index + 1, len(steps))
                }
                if remaining:
                    ci_runs.update_one({"_id": run_id}, {"$set": remaining})
                break
    except Exception as e:
        status = "failed"
        ci_runs.update_one({"_id": run_id}, {"$set": {"error": str(e)}})
    finally:
        # The runner goes away before any deploy: artifacts are already
        # captured and the CD phase targets the workspace, not the runner.
        if runner is not None:
            capture_ci_artifacts(runner, run)
            try:
                runner.remove(force=True)
            except Exception:
                pass
        finalize_ci_run(run, status)

def claim_next_ci_run():
    """Atomically claim the oldest queued run, moving it to "starting"."""
    return ci_runs.find_one_and_update(
        {"status": "queued"},
        {"$set": {"status": "starting", "started_at": utc_now_iso()}},
        sort=[("created_at", 1)],
        return_document=ReturnDocument.AFTER,
    )

def ci_worker_loop():
    while True:
        try:
            run = claim_next_ci_run()
        except Exception:
            run = None
        if run is None:
            time.sleep(CI_WORKER_IDLE_SLEEP_SECONDS)
            continue
        try:
            execute_ci_run(run)
        except Exception as e:
            finished_at = utc_now_iso()
            ci_runs.update_one(
                {"_id": run["_id"]},
                {"$set": {"status": "failed", "error": str(e),
                          "finished_at": finished_at}},
            )
            post_ci_webhook(run, "failed", finished_at)

def mark_interrupted_ci_runs():
    """Fail runs left in-flight by a previous process (service restart)."""
    ci_runs.update_many(
        {"status": {"$in": ["starting", "running"]}},
        {"$set": {"status": "failed",
                  "error": "interrupted by service restart",
                  "finished_at": utc_now_iso()}},
    )

def ensure_ci_workers_started():
    """Lazily start the bounded worker pool on first trigger. Not started at
    import time because this module is also imported by tooling."""
    global _ci_workers_started
    with _ci_workers_lock:
        if _ci_workers_started:
            return
        mark_interrupted_ci_runs()
        for index in range(CI_CONCURRENCY):
            threading.Thread(
                target=ci_worker_loop, name=f"lattice-ci-worker-{index}", daemon=True,
            ).start()
        _ci_workers_started = True

def attach_queue_positions(docs):
    """Serialize run docs, adding 1-based queue_position (ordered by
    created_at across ALL packages) to queued runs. Computed at read time."""
    serialized = []
    positions = None
    for doc in docs:
        out = serialize_run(doc)
        if doc.get("status") == "queued":
            if positions is None:
                queued = ci_runs.find({"status": "queued"}, {"_id": 1}).sort("created_at", 1)
                positions = {q["_id"]: pos for pos, q in enumerate(queued, start=1)}
            position = positions.get(doc["_id"])
            if position is not None:
                out["queue_position"] = position
        serialized.append(out)
    return serialized

@app.post("/ci/{package_id}/run")
async def trigger_ci_run(package_id: str, trigger: str = "manual", user=Depends(require_user), authorization: str = Header(None)):
    package, files = fetch_package_or_404(package_id, authorization)
    package_name = package.get("name", package_id)
    image, steps = plan_ci_steps(files)

    last = ci_runs.find_one({"package_id": package_id}, sort=[("number", -1)])
    run_doc = {
        "package_id": package_id,
        "package_name": package_name,
        "number": (last["number"] + 1) if last else 1,
        "status": "queued",
        "trigger": trigger,
        "image": image,
        "deploy": plan_ci_deploy(files),
        "created_at": utc_now_iso(),
        "started_at": None,
        "finished_at": None,
        "files": files,
        "steps": [
            {"name": s["name"], "run": s["run"], "status": "queued",
             "output": "", "exit_code": None, "duration_seconds": None}
            for s in steps
        ],
    }
    run_id = ci_runs.insert_one(run_doc).inserted_id
    ensure_ci_workers_started()
    return serialize_run(ci_runs.find_one({"_id": run_id}))

@app.get("/ci/{package_id}/runs")
async def list_ci_runs(package_id: str, user=Depends(require_user)):
    docs = ci_runs.find({"package_id": package_id}).sort("number", -1).limit(30)
    return attach_queue_positions(list(docs))

def find_ci_run_or_404(run_id: str):
    try:
        doc = ci_runs.find_one({"_id": ObjectId(run_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid run id")
    if not doc:
        raise HTTPException(status_code=404, detail="Run not found")
    return doc

@app.get("/ci/runs/{run_id}")
async def get_ci_run(run_id: str, user=Depends(require_user)):
    return attach_queue_positions([find_ci_run_or_404(run_id)])[0]

CI_STREAM_MAX_SECONDS = 600
CI_STREAM_POLL_SECONDS = 0.5

@app.get("/ci/runs/{run_id}/stream")
async def stream_ci_run(run_id: str, user=Depends(require_user_query)):
    try:
        object_id = ObjectId(run_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid run id")
    if not ci_runs.find_one({"_id": object_id}):
        raise HTTPException(status_code=404, detail="Run not found")

    async def gen():
        last_payload = None
        deadline = time.time() + CI_STREAM_MAX_SECONDS
        while time.time() < deadline:
            doc = ci_runs.find_one({"_id": object_id})
            if not doc:
                break
            payload = json.dumps(serialize_run(doc))
            if payload != last_payload:
                last_payload = payload
                yield f"data: {payload}\n\n"
            if doc.get("status") not in CI_ACTIVE_STATUSES:
                break
            await asyncio.sleep(CI_STREAM_POLL_SECONDS)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )

@app.get("/ci/runs/{run_id}/artifacts/{artifact_id}")
async def download_ci_artifact(run_id: str, artifact_id: str, user=Depends(require_user_query)):
    """Download one captured artifact (?token= auth so browsers can use plain
    links)."""
    try:
        grid_out = artifacts_fs.get(ObjectId(artifact_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if (grid_out.metadata or {}).get("run_id") != run_id:
        raise HTTPException(status_code=404, detail="Artifact not found")
    filename = (grid_out.filename or "artifact").replace('"', "")
    return StreamingResponse(
        grid_out,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def require_deploy_actor(run, user, authorization):
    """Approve/reject permission: admins always; otherwise the package owner,
    fetched live from the packages service with the caller's token. Legacy
    ownerless packages are open to any authenticated user."""
    if user.get("role") == "admin":
        return
    headers = {"Authorization": authorization} if authorization else {}
    try:
        response = requests.get(
            f"{PACKAGES_SERVICE_URL}/packages/{run['package_id']}",
            headers=headers, timeout=15,
        )
    except Exception:
        raise HTTPException(status_code=403, detail="Could not verify package ownership")
    if response.status_code != 200:
        raise HTTPException(status_code=403, detail="Could not verify package ownership")
    owner = response.json().get("owner")
    if owner and owner != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Only the package owner or an admin can decide this deploy")

@app.post("/ci/runs/{run_id}/approve")
async def approve_ci_deploy(run_id: str, user=Depends(require_user), authorization: str = Header(None)):
    """Release a run parked at awaiting_approval: the deploy executes
    synchronously in the request (a handful of docker execs) and decides the
    final status."""
    run = find_ci_run_or_404(run_id)
    require_deploy_actor(run, user, authorization)
    claimed = ci_runs.find_one_and_update(
        {"_id": run["_id"], "status": "awaiting_approval"},
        {"$set": {"status": "running"}},
        return_document=ReturnDocument.AFTER,
    )
    if claimed is None:
        raise HTTPException(status_code=409, detail="Run is not awaiting approval")
    result = execute_run_deploy(claimed, actor=user.get("user_id"))
    status = "success" if result["ok"] else "failed"
    finished_at = utc_now_iso()
    ci_runs.update_one(
        {"_id": run["_id"]},
        {"$set": {"status": status, "finished_at": finished_at}},
    )
    post_ci_webhook(claimed, status, finished_at)
    return serialize_run(ci_runs.find_one({"_id": run["_id"]}))

@app.post("/ci/runs/{run_id}/reject")
async def reject_ci_deploy(run_id: str, user=Depends(require_user), authorization: str = Header(None)):
    run = find_ci_run_or_404(run_id)
    require_deploy_actor(run, user, authorization)
    finished_at = utc_now_iso()
    updated = ci_runs.find_one_and_update(
        {"_id": run["_id"], "status": "awaiting_approval"},
        {"$set": {"status": "failed", "error": "Deploy rejected",
                  "finished_at": finished_at}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise HTTPException(status_code=409, detail="Run is not awaiting approval")
    record_event((run.get("deploy") or {}).get("workspace"), "deploy_rejected",
                 f"run #{run.get('number')} of {run.get('package_name')} deploy rejected",
                 user.get("user_id"))
    post_ci_webhook(updated, "failed", finished_at)
    return serialize_run(updated)

CI_BADGE_LABEL = "lattice ci"
CI_BADGE_UNKNOWN_STYLE = ("unknown", "#9f9f9f")
CI_BADGE_STATUS_STYLES = {
    "success": ("passing", "#4c1"),
    "failed": ("failing", "#e05d44"),
    "queued": ("pending", "#dfb317"),
    "starting": ("pending", "#dfb317"),
    "running": ("pending", "#dfb317"),
    "awaiting_approval": ("pending", "#dfb317"),
}
CI_BADGE_CHAR_WIDTH = 7
CI_BADGE_PADDING = 10

def build_badge_svg(label, value, color):
    """Hand-built flat two-segment shields-style badge (no image deps)."""
    label_width = len(label) * CI_BADGE_CHAR_WIDTH + CI_BADGE_PADDING
    value_width = len(value) * CI_BADGE_CHAR_WIDTH + CI_BADGE_PADDING
    total_width = label_width + value_width
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="20" '
        f'role="img" aria-label="{label}: {value}">'
        f'<clipPath id="r"><rect width="{total_width}" height="20" rx="3" fill="#fff"/></clipPath>'
        f'<g clip-path="url(#r)">'
        f'<rect width="{label_width}" height="20" fill="#555"/>'
        f'<rect x="{label_width}" width="{value_width}" height="20" fill="{color}"/>'
        f'</g>'
        f'<g fill="#fff" text-anchor="middle" '
        f'font-family="DejaVu Sans Mono,Menlo,monospace" font-size="11">'
        f'<text x="{label_width / 2}" y="14">{label}</text>'
        f'<text x="{label_width + value_width / 2}" y="14">{value}</text>'
        f'</g></svg>'
    )

@app.get("/ci/{package_id}/badge.svg")
async def get_ci_badge(package_id: str):
    """Deliberately unauthenticated (like shields.io): README-embeddable
    badge that only exposes the pass/fail state of the latest run."""
    latest = ci_runs.find_one({"package_id": package_id}, sort=[("number", -1)])
    status = latest.get("status") if latest else None
    value, color = CI_BADGE_STATUS_STYLES.get(status, CI_BADGE_UNKNOWN_STYLE)
    return Response(
        content=build_badge_svg(CI_BADGE_LABEL, value, color),
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-cache"},
    )

# ---------------------------------------------------------------------------
# Environments (GitHub-style CD deploy targets; protected ones gate deploys)
# ---------------------------------------------------------------------------

environments = ci_db['environments']

ENVIRONMENT_NAME_SANITIZE_RE = re.compile(r"[^a-zA-Z0-9._-]")

@app.get("/environments")
async def list_environments(user=Depends(require_user)):
    return [
        {"id": str(doc["_id"]), "name": doc.get("name", ""), "protected": bool(doc.get("protected"))}
        for doc in environments.find().sort("name", 1)
    ]

@app.post("/environments")
async def create_environment(body: dict, user=Depends(require_admin)):
    name = ENVIRONMENT_NAME_SANITIZE_RE.sub("", str(body.get("name") or "").strip())
    if not name:
        raise HTTPException(status_code=400, detail="name is required ([a-zA-Z0-9._-])")
    if environments.find_one({"name": name}):
        raise HTTPException(status_code=409, detail=f"Environment {name} already exists")
    protected = bool(body.get("protected"))
    inserted_id = environments.insert_one({"name": name, "protected": protected}).inserted_id
    return {"id": str(inserted_id), "name": name, "protected": protected}

@app.delete("/environments/{environment_id}")
async def delete_environment(environment_id: str, user=Depends(require_admin)):
    try:
        object_id = ObjectId(environment_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid environment id")
    if not environments.find_one_and_delete({"_id": object_id}):
        raise HTTPException(status_code=404, detail="Environment not found")
    return {"deleted": environment_id}

# ---------------------------------------------------------------------------
# Events (kubectl-events-style audit trail per workspace parent)
# ---------------------------------------------------------------------------

events = ci_db['events']

EVENTS_TTL_SECONDS = 604800  # 7 days
EVENTS_DEFAULT_LIMIT = 50
EVENTS_MAX_LIMIT = 200

_events_index_lock = threading.Lock()
_events_index_created = False

def ensure_events_index():
    """Lazily create the TTL index that expires events after 7 days. Safe to
    call on every write."""
    global _events_index_created
    with _events_index_lock:
        if _events_index_created:
            return
        try:
            events.create_index("ts_date", expireAfterSeconds=EVENTS_TTL_SECONDS)
        except Exception:
            pass
        _events_index_created = True

def record_event(parent_id, type, message, actor=None):
    """Append one audit event for a workspace parent; best-effort, never
    raises (events must not break the action they describe)."""
    try:
        ensure_events_index()
        now = datetime.datetime.now(datetime.timezone.utc)
        events.insert_one({
            "parent_id": parent_id,
            "type": type,
            "message": message,
            "actor": actor,
            "ts": now.isoformat(),
            "ts_date": now,
        })
    except Exception:
        pass

@app.get("/events")
async def list_events(parent: str = None, limit: int = EVENTS_DEFAULT_LIMIT, user=Depends(require_user)):
    limit = max(1, min(limit, EVENTS_MAX_LIMIT))
    query = {"parent_id": parent} if parent else {}
    cursor = events.find(
        query, {"_id": 0, "ts": 1, "type": 1, "message": 1, "actor": 1},
    ).sort("ts_date", -1).limit(limit)
    return list(cursor)

# ---------------------------------------------------------------------------
# Multi-host registry (Docker remotes)
# ---------------------------------------------------------------------------

docker_hosts = ci_db['docker_hosts']

HOST_URL_PREFIXES = ("tcp://", "ssh://", "unix://")
HOST_PROBE_TIMEOUT_SECONDS = 2
HOST_CONNECT_TIMEOUT_SECONDS = 5
HOST_CLIENT_TIMEOUT_SECONDS = 30

_host_clients_lock = threading.Lock()
_host_clients = {}        # url -> docker.DockerClient (long-lived, 30s timeout)
_host_api_clients = {}    # url -> docker.APIClient (terminal exec sockets)
_host_probe_clients = {}  # url -> docker.DockerClient (status pings, 2s timeout)

def lookup_host_or_404(host: str):
    doc = docker_hosts.find_one({"name": host})
    if not doc:
        raise HTTPException(status_code=404, detail="Unknown host")
    return doc

def get_client(host: str = None):
    """DockerClient for a `host` query param. None/""/"local" resolves to the
    module-level client; anything else is looked up by name in docker_hosts
    and connected lazily (cached per url)."""
    if host in (None, "", "local"):
        return client
    url = lookup_host_or_404(host)["url"]
    with _host_clients_lock:
        if url not in _host_clients:
            _host_clients[url] = docker.DockerClient(
                base_url=url, timeout=HOST_CLIENT_TIMEOUT_SECONDS,
            )
        return _host_clients[url]

def get_api_client(host: str = None):
    """Low-level APIClient counterpart of get_client (interactive exec)."""
    if host in (None, "", "local"):
        return api_client
    url = lookup_host_or_404(host)["url"]
    with _host_clients_lock:
        if url not in _host_api_clients:
            _host_api_clients[url] = docker.APIClient(base_url=url)
        return _host_api_clients[url]

def docker_cli_env(host: str = None):
    """Env for subprocess docker CLI calls: None for local (inherit), else a
    copy of the environment with DOCKER_HOST pointing at the remote."""
    if host in (None, "", "local"):
        return None
    return {**os.environ, "DOCKER_HOST": lookup_host_or_404(host)["url"]}

def probe_host_status(url: str) -> str:
    try:
        with _host_clients_lock:
            probe = _host_probe_clients.get(url)
        if probe is None:
            probe = docker.DockerClient(base_url=url, timeout=HOST_PROBE_TIMEOUT_SECONDS)
            with _host_clients_lock:
                _host_probe_clients[url] = probe
        probe.ping()
        return "up"
    except Exception:
        return "down"

def drop_cached_host_clients(url: str):
    with _host_clients_lock:
        for cache in (_host_clients, _host_api_clients, _host_probe_clients):
            dropped = cache.pop(url, None)
            if dropped is not None:
                try:
                    dropped.close()
                except Exception:
                    pass

@app.get("/hosts")
async def list_hosts(user=Depends(require_user)):
    try:
        client.ping()
        local_status = "up"
    except Exception:
        local_status = "down"
    hosts = [{"id": "local", "name": "local", "url": None, "status": local_status}]
    for doc in docker_hosts.find():
        hosts.append({
            "id": str(doc["_id"]),
            "name": doc.get("name", ""),
            "url": doc.get("url", ""),
            "status": probe_host_status(doc.get("url", "")),
        })
    return hosts

@app.post("/hosts")
async def add_host(body: dict, user=Depends(require_admin)):
    name = str(body.get("name") or "").strip()
    url = str(body.get("url") or "").strip()
    if not name or not url:
        raise HTTPException(status_code=400, detail="name and url are required")
    if name == "local":
        raise HTTPException(status_code=400, detail='"local" is a reserved host name')
    if not url.startswith(HOST_URL_PREFIXES):
        raise HTTPException(status_code=400, detail="url must start with tcp://, ssh:// or unix://")
    try:
        docker.DockerClient(base_url=url, timeout=HOST_CONNECT_TIMEOUT_SECONDS).ping()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not connect: {e}")
    inserted_id = docker_hosts.insert_one({"name": name, "url": url}).inserted_id
    return {"id": str(inserted_id), "name": name, "url": url, "status": "up"}

@app.delete("/hosts/{host_id}")
async def delete_host(host_id: str, user=Depends(require_admin)):
    try:
        object_id = ObjectId(host_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid host id")
    doc = docker_hosts.find_one_and_delete({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Host not found")
    if doc.get("url"):
        drop_cached_host_clients(doc["url"])
    return {"deleted": host_id}

# ---------------------------------------------------------------------------
# Metrics history sampler (local containers only)
# ---------------------------------------------------------------------------

metrics_samples = ci_db['metrics_samples']

METRICS_SAMPLE_INTERVAL_SECONDS = 30
METRICS_TTL_SECONDS = 172800  # 48h
METRICS_HISTORY_MAX_MINUTES = 1440

_sampler_lock = threading.Lock()
_sampler_started = False

def parse_percent(value):
    """Docker stats formats percentages as "1.23%"."""
    try:
        return float(str(value).strip().rstrip("%"))
    except (ValueError, TypeError):
        return 0.0

def sample_container_metrics():
    """One docker stats pass over all running local containers."""
    output = subprocess.check_output(
        ["docker", "stats", "--no-stream", "--format", "{{json .}}"]
    )
    now = datetime.datetime.now(datetime.timezone.utc)
    docs = []
    for line in output.splitlines():
        if not line.strip():
            continue
        stats = json.loads(line)
        if stats.get("Name", "").startswith("k8s_"):
            continue
        docs.append({
            "container_id": stats.get("ID", "")[:12],
            "name": stats.get("Name", ""),
            "cpu": parse_percent(stats.get("CPUPerc")),
            "mem": parse_percent(stats.get("MemPerc")),
            "ts": now.isoformat(),
            "ts_date": now,
        })
    if docs:
        metrics_samples.insert_many(docs)

def metrics_sampler_loop():
    while True:
        try:
            sample_container_metrics()
        except Exception:
            pass
        time.sleep(METRICS_SAMPLE_INTERVAL_SECONDS)

def ensure_sampler_started():
    """Lazily start the single sampler daemon thread (and the TTL index that
    expires samples after 48h). Safe to call on every request."""
    global _sampler_started
    with _sampler_lock:
        if _sampler_started:
            return
        try:
            metrics_samples.create_index("ts_date", expireAfterSeconds=METRICS_TTL_SECONDS)
        except Exception:
            pass
        threading.Thread(
            target=metrics_sampler_loop, name="lattice-metrics-sampler", daemon=True,
        ).start()
        _sampler_started = True

@app.get("/containers/{container_id}/metrics/history")
async def get_container_metrics_history(container_id: str, minutes: int = 60, user=Depends(require_user)):
    ensure_sampler_started()
    minutes = max(1, min(minutes, METRICS_HISTORY_MAX_MINUTES))
    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=minutes)
    cursor = metrics_samples.find(
        {"container_id": container_id[:12], "ts_date": {"$gte": since}},
        {"_id": 0, "ts": 1, "cpu": 1, "mem": 1},
    ).sort("ts", 1)
    return {"samples": list(cursor)}

# ---------------------------------------------------------------------------
# Deployments (desired state) + reconciler loop (the k8s core)
# ---------------------------------------------------------------------------

deployments = ci_db['deployments']

RECONCILE_INTERVAL_SECONDS = 15
PROBE_FAILURE_THRESHOLD = 3
HPA_SCALE_DOWN_FACTOR = 0.5

_reconciler_lock = threading.Lock()
_reconciler_started = False
_probe_failures = {}         # "parent:child" -> consecutive probe failures
_reconcile_last_error = {}   # parent_name -> last recorded error message
_last_desired_replicas = {}  # "parent:service" -> replicas at last reconcile

def parent_ps(parent):
    """docker ps -a inside the parent -> {container name: status}."""
    exec_result = parent.exec_run(
        "sh -c 'docker ps -a --format \"{{.ID}},{{.Names}},{{.Image}},{{.Status}}\"'",
        privileged=True,
    )
    statuses = {}
    for line in exec_result.output.decode("utf-8", errors="replace").splitlines():
        parts = line.split(",", 3)
        if len(parts) == 4:
            statuses[parts[1]] = parts[3]
    return statuses

def parent_stats(parent):
    """One docker stats pass inside the parent -> {container name: cpu %}.
    Called at most once per parent per tick and shared across services."""
    exec_result = parent.exec_run(
        "sh -c 'docker stats --no-stream --format \"{{.Name}},{{.CPUPerc}}\"'",
        privileged=True,
    )
    cpu_by_name = {}
    for line in exec_result.output.decode("utf-8", errors="replace").splitlines():
        if "," in line:
            name, percent = line.split(",", 1)
            cpu_by_name[name] = parse_percent(percent)
    return cpu_by_name

def child_ip(parent, child_name):
    """A child's IP on the parent's default bridge (names don't resolve
    there, so probes must target the IP)."""
    exec_result = parent.exec_run(
        "sh -c 'docker inspect --format \"{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}\" " + child_name + "'",
        privileged=True,
    )
    return exec_result.output.decode("utf-8", errors="replace").strip()

def run_probe(parent, child_name, probe):
    """Execute one probe against a child from inside the parent; True when
    healthy."""
    if probe["type"] == "cmd":
        check = parent.exec_run(
            f"sh -c 'docker exec {child_name} sh -c \"{probe['command']}\"'", privileged=True,
        )
        return check.exit_code == 0
    ip = child_ip(parent, child_name)
    if not ip:
        return False
    if probe["type"] == "http":
        check = parent.exec_run(
            f"sh -c 'wget -qO- --timeout=3 http://{ip}:{probe['port']}{probe['path']} >/dev/null'",
            privileged=True,
        )
    else:
        check = parent.exec_run(f"sh -c 'nc -z -w 3 {ip} {probe['port']}'", privileged=True)
    return check.exit_code == 0

def reconcile_probe(parent, parent_name, service, child):
    """Track consecutive probe failures; restart the child at the threshold."""
    key = f"{parent_name}:{child}"
    if run_probe(parent, child, service["probe"]):
        _probe_failures.pop(key, None)
        return
    failures = _probe_failures.get(key, 0) + 1
    if failures >= PROBE_FAILURE_THRESHOLD:
        parent.exec_run(f"sh -c 'docker restart {child}'", privileged=True)
        record_event(parent_name, "probe_restart", f"probe failed {failures}x, restarted {child}")
        _probe_failures.pop(key, None)
    else:
        _probe_failures[key] = failures

def excess_replicas(service_name, desired, statuses):
    """Container names <service>-i present in the parent with i above the
    desired replica count."""
    pattern = re.compile(re.escape(service_name) + r"-(\d+)$")
    return [
        child for child in statuses
        if (match := pattern.fullmatch(child)) and int(match.group(1)) > desired
    ]

def reconcile_service(parent, parent_name, service, statuses):
    """Drive one service towards its desired state: recreate missing replicas,
    restart exited ones (restart=always), remove excess indexes."""
    name = service["name"]
    desired = service["replicas"]
    key = f"{parent_name}:{name}"
    previous_desired = _last_desired_replicas.get(key)
    _last_desired_replicas[key] = desired

    for index in range(1, desired + 1):
        child = f"{name}-{index}"
        status = statuses.get(child)
        if status is None:
            ok, _ = run_stack_container(parent, service, index)
            if ok:
                grown = previous_desired is not None and index > previous_desired
                record_event(parent_name, "scale_up" if grown else "self_heal",
                             f"started missing replica {child}")
        elif status.startswith("Up"):
            if service.get("probe"):
                reconcile_probe(parent, parent_name, service, child)
        elif service["restart"] == "always":
            parent.exec_run(f"sh -c 'docker start {child}'", privileged=True)
            record_event(parent_name, "service_restarted", f"restarted exited replica {child}")

    for child in excess_replicas(name, desired, statuses):
        parent.exec_run(f"sh -c 'docker rm -f {child}'", privileged=True)
        _probe_failures.pop(f"{parent_name}:{child}", None)
        record_event(parent_name, "scale_down", f"removed excess replica {child}")

def reconcile_autoscale(doc, service_index, service, cpu_by_name):
    """One HPA step per tick: compare the service's average CPU against
    targetCPU and move desired replicas by at most one. Only the doc changes
    here — the next tick creates/removes the containers."""
    autoscale = service["autoscale"]
    replicas = service["replicas"]
    samples = [
        cpu_by_name[f"{service['name']}-{i}"]
        for i in range(1, replicas + 1)
        if f"{service['name']}-{i}" in cpu_by_name
    ]
    if not samples:
        return
    average = sum(samples) / len(samples)
    desired = replicas
    event_type = None
    if average > autoscale["targetCPU"] and replicas < autoscale["max"]:
        desired, event_type = replicas + 1, "scale_up hpa"
    elif average < autoscale["targetCPU"] * HPA_SCALE_DOWN_FACTOR and replicas > autoscale["min"]:
        desired, event_type = replicas - 1, "scale_down hpa"
    if event_type is None:
        return
    deployments.update_one(
        {"_id": doc["_id"]},
        {"$set": {f"services.{service_index}.replicas": desired, "updated_at": utc_now_iso()}},
    )
    record_event(doc["parent_name"], event_type,
                 f"{service['name']} avg cpu {round(average, 1)}% -> replicas {desired}")

def reconcile_deployment(doc):
    parent = get_client(doc.get("host")).containers.get(doc["parent_name"])
    statuses = parent_ps(parent)
    services = doc.get("services", [])
    cpu_by_name = parent_stats(parent) if any(s.get("autoscale") for s in services) else {}
    for index, service in enumerate(services):
        reconcile_service(parent, doc["parent_name"], service, statuses)
        if service.get("autoscale"):
            reconcile_autoscale(doc, index, service, cpu_by_name)

def reconciler_loop():
    while True:
        try:
            docs = list(deployments.find())
        except Exception:
            docs = []
        for doc in docs:
            parent_name = doc.get("parent_name", "")
            try:
                reconcile_deployment(doc)
                _reconcile_last_error.pop(parent_name, None)
            except Exception as e:
                message = str(e)
                if _reconcile_last_error.get(parent_name) != message:
                    _reconcile_last_error[parent_name] = message
                    record_event(parent_name, "reconcile_error", message[:500])
        time.sleep(RECONCILE_INTERVAL_SECONDS)

def ensure_reconciler_started():
    """Lazily start the single reconciler daemon thread. Safe to call on
    every deploy/read."""
    global _reconciler_started
    with _reconciler_lock:
        if _reconciler_started:
            return
        threading.Thread(
            target=reconciler_loop, name="lattice-reconciler", daemon=True,
        ).start()
        _reconciler_started = True

@app.get("/deployments/{parent}")
async def get_deployment(parent: str, user=Depends(require_user)):
    ensure_reconciler_started()
    doc = deployments.find_one({"$or": [{"parent_name": parent}, {"parent_id": parent}]})
    if not doc:
        raise HTTPException(status_code=404, detail="Deployment not found")
    try:
        parent_container = get_client(doc.get("host")).containers.get(doc["parent_name"])
        statuses = parent_ps(parent_container)
    except Exception:
        statuses = {}
    services = []
    for service in doc.get("services", []):
        containers = [
            {"name": f"{service['name']}-{i}",
             "status": statuses.get(f"{service['name']}-{i}", "missing")}
            for i in range(1, service["replicas"] + 1)
        ]
        services.append({
            "name": service["name"],
            "image": service["image"],
            "replicas": service["replicas"],
            "running": sum(1 for c in containers if c["status"].startswith("Up")),
            "restart": service["restart"],
            "memory": service["memory"],
            "cpus": service["cpus"],
            "probe": service["probe"],
            "autoscale": service["autoscale"],
            "containers": containers,
        })
    return {
        "parent_id": doc.get("parent_id"),
        "parent_name": doc.get("parent_name"),
        "host": doc.get("host"),
        "package_id": doc.get("package_id"),
        "updated_at": doc.get("updated_at"),
        "services": services,
    }

@app.post("/container/{container_id}/start")
async def start_container(container_id: str, host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    try:
        container = docker_client.containers.get(container_id)
        container.start()
        record_event(container.name, "container_started", f"container {container.name} started", user.get("user_id"))
        return {"message": f"Container {container_id} started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to start container', 'message': str(e)})

@app.get("/system/health")
async def get_system_health(user=Depends(require_user)):
    try:
        return {
            "cpu": psutil.cpu_percent(interval=0.3),
            "memory": psutil.virtual_memory().percent,
            "storage": psutil.disk_usage("/").percent,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to get system health', 'message': str(e)})

@app.websocket("/ws/terminal/{container_id}")
async def terminal_websocket(websocket: WebSocket, container_id: str, token: str = None, inner: str = None, host: str = None):
    try:
        decode_token(token or "")
    except Exception:
        await websocket.close(code=4401)
        return
    try:
        ws_api_client = get_api_client(host)
    except Exception:
        await websocket.close(code=4404)
        return
    await websocket.accept()

    sock = None
    try:
        cmd = ["docker", "exec", "-it", inner, "sh"] if inner else ["sh"]
        exec_id = ws_api_client.exec_create(container_id, cmd, tty=True, stdin=True)
        sock = ws_api_client.exec_start(exec_id, tty=True, socket=True)
        sock._sock.setblocking(True)
    except Exception:
        await websocket.close(code=1011)
        return

    loop = asyncio.get_running_loop()

    async def pump_output():
        try:
            while True:
                data = await loop.run_in_executor(None, sock._sock.recv, 4096)
                if not data:
                    await websocket.close(code=1000)
                    break
                await websocket.send_bytes(data)
        except Exception:
            pass

    reader = asyncio.ensure_future(pump_output())
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("bytes") is not None:
                sock._sock.send(message["bytes"])
            elif message.get("text") is not None:
                try:
                    control = json.loads(message["text"])
                    if control.get("type") == "resize":
                        ws_api_client.exec_resize(
                            exec_id, height=int(control["rows"]), width=int(control["cols"])
                        )
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        reader.cancel()
        try:
            sock.close()
        except Exception:
            pass
        try:
            await websocket.close(code=1000)
        except Exception:
            pass

@app.websocket("/ws/logs/{container_id}")
async def logs_websocket(websocket: WebSocket, container_id: str, token: str = None, inner: str = None, host: str = None):
    try:
        decode_token(token or "")
    except Exception:
        await websocket.close(code=4401)
        return
    try:
        docker_client = get_client(host)
        ws_api_client = get_api_client(host)
    except Exception:
        await websocket.close(code=4404)
        return
    await websocket.accept()

    stream = None
    try:
        if inner:
            exec_id = ws_api_client.exec_create(
                container_id,
                ["docker", "logs", "-f", "--tail", "200", inner],
                tty=False, stdin=False,
            )
            stream = ws_api_client.exec_start(exec_id, stream=True)
        else:
            stream = docker_client.containers.get(container_id).logs(
                stream=True, follow=True, tail=200, timestamps=False,
            )
    except Exception as e:
        try:
            await websocket.send_text(f"error: {e}\n")
        except Exception:
            pass
        await websocket.close(code=1000)
        return

    loop = asyncio.get_running_loop()

    async def pump_logs():
        """Both branches yield a blocking chunk generator; drain it off the
        event loop and forward each chunk as a text frame."""
        try:
            while True:
                chunk = await loop.run_in_executor(None, next, stream, None)
                if chunk is None:
                    break
                await websocket.send_text(chunk.decode("utf-8", errors="replace"))
        except Exception:
            pass
        try:
            await websocket.close(code=1000)
        except Exception:
            pass

    reader = asyncio.ensure_future(pump_logs())
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
    finally:
        reader.cancel()
        try:
            stream.close()
        except Exception:
            pass
        try:
            await websocket.close(code=1000)
        except Exception:
            pass

@app.get("/topology")
async def get_topology(host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    try:
        networks = []
        for network in docker_client.networks.list():
            network.reload()
            attached = [
                {
                    "id": c.short_id,
                    "name": c.name,
                    "image": c.image.tags[0] if c.image.tags else c.attrs['Config']['Image'],
                    "status": c.status,
                    "ip": network.attrs['Containers'].get(c.id, {}).get('IPv4Address', '').split('/')[0],
                }
                for c in network.containers
                if not c.name.startswith('k8s_')
            ]
            if not attached and network.name in ('none', 'host'):
                continue
            networks.append({
                "id": network.short_id,
                "name": network.name,
                "driver": network.attrs.get('Driver', ''),
                "containers": attached,
            })
        return {"networks": networks}
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to get topology', 'message': str(e)})
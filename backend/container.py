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
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
import docker
import gridfs
import psutil
import requests
import time
import numpy as np
from pymongo import MongoClient, ReturnDocument
from bson.objectid import ObjectId
from concurrent.futures import ThreadPoolExecutor, as_completed
from auth_shared import require_user, require_user_query, decode_token, cors_origins, MONGO_URL

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

def make_request(ip):
    try:
        start_time = time.time()
        response = requests.get(f'http://{ip}', timeout=5)
        response_time = time.time() - start_time

        if response.status_code == 200:
            return response_time
        else:
            print(f'Error: Received status code {response.status_code}')
            return None
    except requests.RequestException as e:
        print(f'Request Exception: {e}')
        return None
    
def get_average_response_time(ip, num_requests=100):
    with ThreadPoolExecutor(max_workers=10) as executor:
        response_times = list(filter(None, executor.map(lambda _: make_request(ip), range(num_requests))))

    if response_times:
        average_response_time = sum(response_times) / len(response_times)
        return average_response_time
    else:
        return None

def get_qps(ip, num_requests=100):
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=10) as executor:
        executor.map(lambda _: make_request(ip), range(num_requests))

    end_time = time.time()
    elapsed_time = end_time - start_time

    qps = num_requests / elapsed_time if elapsed_time > 0 else 0
    return qps

def start_overload_test(container_id):
    container = client.containers.get(container_id)
    ports = container.attrs['NetworkSettings']['Ports']
    if not ports:
            ip = get_container_ip(id)
    else:
            port_mapping = next(iter(ports.values()))[0]
            port = port_mapping['HostPort']
            ip = f"localhost:{port}"

    print(f'IP: {ip}')
            
    latencies = []

    test_duration = 10
    start_time = time.time()

    while (time.time() - start_time) < test_duration:
        latency = make_request(ip)
        latencies.append(latency)

    latencies = np.array(latencies)
    p99 = np.percentile(latencies, 99)
    p95 = np.percentile(latencies, 95)
    p90 = np.percentile(latencies, 90)
    mean = np.mean(latencies)
    max_latency = np.max(latencies)
    min_latency = np.min(latencies)

    print(f"p99: {p99}")
    print(f"p95: {p95}")
    print(f"p90: {p90}")
    print(f"mean: {mean}")
    print(f"max: {max_latency}")
    print(f"min: {min_latency}")

    return {
        "p99": p99,
        "p95": p95,
        "p90": p90,
        "mean": mean,
        "max": max_latency,
        "min": min_latency
    }

@app.get("/container/{id}/overload")
async def start_overload_test_endpoint(id: str, user=Depends(require_user)):
    return start_overload_test(id)

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

@app.get("/container/{id}/aprox")
async def read_metrics(id: str, user=Depends(require_user)):
    try:
        container = client.containers.get(id)
        ports = container.attrs['NetworkSettings']['Ports']
        if not ports:
            ip = get_container_ip(id)
        else:
            port_mapping = next(iter(ports.values()))[0]
            port = port_mapping['HostPort']
            ip = f"localhost:{port}"
        average_response_time = get_average_response_time(ip)
        qps = get_qps(ip)

        return {
            "averageResponseTime": average_response_time,
            "qps": qps
        }
    except Exception as e:
        return {"error": str(e)}

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
STACK_NAME_SANITIZE_RE = re.compile(r"[^a-z0-9-]")

def parse_stack_services(files):
    """Validate a stack plugin's stack.json: {"services": [{"name", "image",
    "shell"?}]}. Names are sanitized to [a-z0-9-]; raises 400 on anything
    malformed."""
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
        validated.append({"name": name, "image": image, "shell": shell})
    return validated

def deploy_stack_service(parent, service):
    """docker run one service inside the parent; never raises."""
    command = f"docker run -dit --privileged --name {service['name']} {service['image']}"
    if service["shell"]:
        command += f" {service['shell']}"
    try:
        exec_result = parent.exec_run(f"sh -c '{command}'", privileged=True)
        output = exec_result.output.decode("utf-8", errors="replace").strip()
        last_line = output.splitlines()[-1].strip() if output else ""
        ok = exec_result.exit_code == 0 and "error" not in last_line.lower()
        return {"name": service["name"], "ok": ok, "output": last_line}
    except Exception as e:
        return {"name": service["name"], "ok": False, "output": str(e)}

@app.post("/container/{parent_id}/stack/{package_id}")
async def deploy_stack(parent_id: str, package_id: str, host: str = None, user=Depends(require_user), authorization: str = Header(None)):
    try:
        package, files = fetch_package_or_404(package_id, authorization)
        services = parse_stack_services(files)
        parent = get_client(host).containers.get(parent_id)
        return {"deployed": [deploy_stack_service(parent, service) for service in services]}
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
        if runner is not None:
            capture_ci_artifacts(runner, run)
            try:
                runner.remove(force=True)
            except Exception:
                pass
        finished_at = utc_now_iso()
        ci_runs.update_one(
            {"_id": run_id},
            {"$set": {"status": status, "finished_at": finished_at}},
        )
        post_ci_webhook(run, status, finished_at)

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

@app.get("/ci/runs/{run_id}")
async def get_ci_run(run_id: str, user=Depends(require_user)):
    try:
        doc = ci_runs.find_one({"_id": ObjectId(run_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid run id")
    if not doc:
        raise HTTPException(status_code=404, detail="Run not found")
    return attach_queue_positions([doc])[0]

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
async def add_host(body: dict, user=Depends(require_user)):
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
async def delete_host(host_id: str, user=Depends(require_user)):
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

@app.post("/container/{container_id}/start")
async def start_container(container_id: str, host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    try:
        container = docker_client.containers.get(container_id)
        container.start()
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
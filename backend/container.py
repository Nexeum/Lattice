import os
import re
import socket
import subprocess
import json
import io
import tarfile
import threading
import datetime
import asyncio
from fastapi import FastAPI, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect, UploadFile, File, Form
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

def _run_in_container(container, command):
    """Run a shell command inside a container without the single-quote clash of
    an `sh -c '...'` wrapper: the command is base64-encoded and decoded inside,
    so quotes, pipes and redirects survive intact. Returns (exit_code, output)."""
    import base64
    encoded = base64.b64encode(command.encode("utf-8")).decode("ascii")
    wrapper = f"echo {encoded} | base64 -d | sh"
    exec_id = container.exec_run(["sh", "-c", wrapper], privileged=True)
    return exec_id.exit_code, exec_id.output.decode("utf-8", errors="replace")

@app.post('/exec')
async def execute_command_body(body: dict, host: str = None, user=Depends(require_user)):
    """Preferred exec endpoint: command travels in the JSON body, so slashes and
    quotes never break routing. Body: {container_id, command, inner?}."""
    docker_client = get_client(host)
    container_id = body.get("container_id")
    command = body.get("command", "")
    inner = body.get("inner")
    if not container_id or not command:
        raise HTTPException(status_code=400, detail="container_id and command are required")
    try:
        container = docker_client.containers.get(container_id)
        if inner:
            command = f"docker exec {inner} sh -c \"$(echo {__import__('base64').b64encode(command.encode()).decode()} | base64 -d)\""
        code, output = _run_in_container(container, command)
        return {'exit_code': code, 'output': output} if code == 0 else {'exit_code': code, 'error': output, 'output': output}
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

def create_dind_parent(docker_client, name: str):
    """docker run one privileged docker:dind parent (the containermain
    shape); the caller decides whether to wait for the inner daemon."""
    return docker_client.containers.run(
        NODE_IMAGE,
        detach=True,
        name=name,
        privileged=True,
        environment={"DOCKER_TLS_CERTDIR": ""},
        volumes=["/var/lib/docker"],
    )

def wait_for_inner_daemon(container):
    """Poll docker info inside a fresh DinD parent until the inner daemon
    answers; returns the inner server version, or None on timeout."""
    for _ in range(NODE_DAEMON_TIMEOUT_SECONDS):
        check = container.exec_run("docker info --format {{.ServerVersion}}")
        if check.exit_code == 0:
            return check.output.decode("utf-8").strip()
        time.sleep(1)
    return None

@app.post("/containermain/{id}")
async def create_container_main(id: str, host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    containers = {container.name: container for container in docker_client.containers.list(all=True)}
    if id in containers:
        return {"message": f"Container {id} already exists"}
    container = create_dind_parent(docker_client, id)
    record_event(id, "workspace_provisioned", f"workspace {id} provisioned", user.get("user_id"))
    inner_version = wait_for_inner_daemon(container)
    if inner_version is not None:
        return {"message": f"Node {id} ready (inner Docker {inner_version})"}
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
# Secrets vault (per-workspace env-style secrets; values never leave the API)
# ---------------------------------------------------------------------------

_secrets_db = MongoClient(MONGO_URL)['kubehub']
secrets = _secrets_db['secrets']

SECRET_KEY_SANITIZE_RE = re.compile(r"[^A-Z0-9_]")
# Whole-value secret reference in a stack env: "${SECRET_KEY}" and nothing else.
SECRET_REF_RE = re.compile(r"^\$\{([A-Z0-9_]+)\}$")

def sanitize_secret_key(raw) -> str:
    """Env-style key: uppercased, restricted to [A-Z0-9_]."""
    return SECRET_KEY_SANITIZE_RE.sub("", str(raw or "").upper())

def resolve_secrets(parent_name: str) -> dict:
    """All secrets for a workspace as {key: value}. Values are read here and
    only ever injected into container env — never returned to callers."""
    return {doc["key"]: doc.get("value", "")
            for doc in secrets.find({"parent_name": parent_name})}

@app.post("/container/{parent_id}/secrets")
async def set_secret(parent_id: str, body: dict, host: str = None, user=Depends(require_user)):
    """Upsert one secret for a workspace. Body: {key, value}. The value is
    stored but never echoed back, and the value is kept out of the event log."""
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    key = sanitize_secret_key(body.get("key") if isinstance(body, dict) else None)
    if not key:
        raise HTTPException(status_code=400, detail="key is required ([A-Z0-9_])")
    if not isinstance(body, dict) or "value" not in body:
        raise HTTPException(status_code=400, detail="value is required")
    value = str(body.get("value"))
    secrets.update_one(
        {"parent_name": parent.name, "key": key},
        {"$set": {"parent_name": parent.name, "key": key, "value": value},
         "$setOnInsert": {"created_at": utc_now_iso()}},
        upsert=True,
    )
    record_event(parent.name, "secret_set", f"secret {key} set", user.get("user_id"))
    return {"key": key}

@app.get("/container/{parent_id}/secrets")
async def list_secrets(parent_id: str, host: str = None, user=Depends(require_user)):
    """List a workspace's secret keys — KEYS ONLY, values never leave here."""
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    return [{"key": doc["key"]}
            for doc in secrets.find({"parent_name": parent.name}).sort("key", 1)]

@app.delete("/container/{parent_id}/secrets/{key}")
async def delete_secret(parent_id: str, key: str, host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    sanitized = sanitize_secret_key(key)
    if not secrets.find_one_and_delete({"parent_name": parent.name, "key": sanitized}):
        raise HTTPException(status_code=404, detail="Secret not found")
    record_event(parent.name, "secret_deleted", f"secret {sanitized} deleted", user.get("user_id"))
    return {"deleted": sanitized}

# ---------------------------------------------------------------------------
# Stacks (deploy a multi-service template into a workspace parent)
# ---------------------------------------------------------------------------

STACK_MAX_SERVICES = 10
STACK_MAX_REPLICAS = 10
STACK_NAME_SANITIZE_RE = re.compile(r"[^a-z0-9-]")
STACK_RESTART_POLICIES = ("no", "always")
STACK_PROBE_TYPES = ("http", "tcp", "cmd")
STACK_ENV_KEY_RE = re.compile(r"^[A-Za-z0-9_]+$")
STACK_VOLUME_NAME_SANITIZE_RE = re.compile(r"[^a-z0-9-]")
STACK_MAX_ENV = 50
STACK_MAX_VOLUMES = 20

def parse_stack_env(name, env):
    """Validate one service's env spec: a flat dict {KEY: value} with keys in
    [A-Za-z0-9_] and values coerced to str. A value may be a whole-value secret
    reference "${SECRET_KEY}" (resolved at run time). Raises 400 when
    malformed."""
    if not isinstance(env, dict):
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} env must be an object")
    if len(env) > STACK_MAX_ENV:
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} has too many env vars (max {STACK_MAX_ENV})")
    validated = {}
    for key, value in env.items():
        if not isinstance(key, str) or not STACK_ENV_KEY_RE.match(key):
            raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} env key {key!r} must match [A-Za-z0-9_]")
        if isinstance(value, bool) or value is None or isinstance(value, (dict, list)):
            raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} env {key} value must be a scalar")
        validated[key] = str(value)
    return validated

def parse_stack_volumes(name, volumes):
    """Validate one service's volumes spec: a list of "volname:/container/path".
    volname is sanitized to [a-z0-9-] and the path must be absolute. Raises 400
    when malformed. Returns [{"name", "path"}]."""
    if not isinstance(volumes, list):
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} volumes must be a list")
    if len(volumes) > STACK_MAX_VOLUMES:
        raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} has too many volumes (max {STACK_MAX_VOLUMES})")
    validated = []
    for entry in volumes:
        if not isinstance(entry, str) or ":" not in entry:
            raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} volume must be \"volname:/path\"")
        raw_name, path = entry.split(":", 1)
        volname = STACK_VOLUME_NAME_SANITIZE_RE.sub("", raw_name.lower())
        if not volname:
            raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} volume needs a name ([a-z0-9-])")
        if not path.startswith("/"):
            raise HTTPException(status_code=400, detail=f"Invalid stack.json: service {name} volume path must start with /")
        validated.append({"name": volname, "path": path})
    return validated

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
    "autoscale"?, "env"?, "volumes"?}]}. Names are sanitized to [a-z0-9-]; an
    autoscale spec implies restart "always"; env is a {KEY: value} dict (values
    may be "${SECRET_KEY}" refs); volumes are "volname:/path" strings; raises
    400 on anything malformed."""
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
        env = parse_stack_env(name, service["env"]) if service.get("env") is not None else {}
        volumes = parse_stack_volumes(name, service["volumes"]) if service.get("volumes") is not None else []
        if autoscale:
            restart = "always"
        validated.append({
            "name": name, "image": image, "shell": shell,
            "replicas": replicas, "restart": restart,
            "memory": memory, "cpus": cpus,
            "probe": probe, "autoscale": autoscale,
            "env": env, "volumes": volumes,
        })
    return validated

def informative_docker_line(output):
    """Docker's last error line is often the useless '--help' hint; prefer the
    line that actually says what went wrong."""
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if not lines:
        return ""
    for line in reversed(lines):
        if "--help" in line:
            continue
        if "error" in line.lower() or "conflict" in line.lower():
            return line
    return next((l for l in reversed(lines) if "--help" not in l), lines[-1])

VOLUME_NAME_PREFIX = "lat-vol-"

def parent_short(parent) -> str:
    """Stable short slug of a parent for namespacing its named volumes; kept in
    [a-z0-9-] and truncated so the resulting volume name stays sane."""
    return STACK_VOLUME_NAME_SANITIZE_RE.sub("", parent.name.lower())[:12] or parent.id[:12]

def namespaced_volume_name(parent, volname: str) -> str:
    """A service volume's real (per-workspace) docker volume name inside the
    parent: lat-vol-<parentShort>-<volname>."""
    return f"{VOLUME_NAME_PREFIX}{parent_short(parent)}-{volname}"

def shell_single_quote(value: str) -> str:
    """Wrap a value in single quotes safe for POSIX sh, escaping embedded
    single quotes as '\\'' — so e.g. p@ss'w0rd becomes 'p@ss'\\''w0rd'. The
    whole run_stack_container command runs via parent.exec_run("sh -c '...'"),
    so env values must survive that outer sh -c intact."""
    return "'" + value.replace("'", "'\\''") + "'"

def run_stack_container(parent, service, index):
    """docker run one replica (<service>-<index>) inside the parent; returns
    (ok, informative_line) and never raises. Restart policy is deliberately NOT
    passed to docker — the reconciler owns it. Idempotent: an existing
    container with the same name is replaced (docker compose up semantics).
    Env vars (with ${SECRET} refs resolved against the workspace vault) and
    named volumes (namespaced per workspace, auto-created by docker) ride
    along with the service spec."""
    name = f"{service['name']}-{index}"
    command = f"docker rm -f {name} >/dev/null 2>&1; docker run -dit --privileged --name {name}"
    if service.get("memory"):
        command += f" --memory {service['memory']}"
    if service.get("cpus"):
        command += f" --cpus {service['cpus']}"
    notes = []
    env = service.get("env") or {}
    if env:
        vault = resolve_secrets(parent.name)
        for key, raw_value in env.items():
            match = SECRET_REF_RE.match(str(raw_value))
            if match:
                secret_key = match.group(1)
                if secret_key not in vault:
                    notes.append(f"unknown secret {secret_key}")
                value = vault.get(secret_key, "")
            else:
                value = str(raw_value)
            command += f" -e {key}={shell_single_quote(value)}"
    for volume in service.get("volumes") or []:
        real = namespaced_volume_name(parent, volume["name"])
        command += f" -v {real}:{volume['path']}"
    command += f" {service['image']}"
    if service.get("shell"):
        command += f" {service['shell']}"
    try:
        # List form (not the f"sh -c '{command}'" string form used elsewhere):
        # docker-py shlex.splits a *string* cmd, which mangles the '\'' escapes
        # in single-quoted env values. Passing the argv list skips that split,
        # so the command reaches a real sh unchanged and the quoting holds.
        exec_result = parent.exec_run(["sh", "-c", command], privileged=True)
        output = exec_result.output.decode("utf-8", errors="replace").strip()
        line = informative_docker_line(output)
        ok = exec_result.exit_code == 0 and "error" not in line.lower()
        if notes:
            line = (line + " (" + "; ".join(notes) + ")").strip()
        return ok, line
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
# Persistent volumes (per-workspace named docker volumes, lat-vol-<short>-*)
# ---------------------------------------------------------------------------

@app.get("/container/{parent_id}/volumes")
async def list_volumes(parent_id: str, host: str = None, user=Depends(require_user)):
    """List a workspace's persistent named volumes (lat-vol-<parentShort>-*),
    with the prefix stripped and the mount-as name a stack.json would use."""
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    prefix = f"{VOLUME_NAME_PREFIX}{parent_short(parent)}-"
    exec_result = parent.exec_run(
        "sh -c 'docker volume ls --format \"{{.Name}}\"'", privileged=True)
    volumes = []
    for line in exec_result.output.decode("utf-8", errors="replace").splitlines():
        real = line.strip()
        if real.startswith(prefix):
            short = real[len(prefix):]
            volumes.append({"name": short, "mountable_as": f"{short}:/path"})
    return volumes

@app.delete("/container/{parent_id}/volumes/{name}")
async def delete_volume(parent_id: str, name: str, host: str = None, user=Depends(require_user)):
    """Remove one workspace volume by its short name. Docker refuses to remove a
    volume still in use — that surfaces as a 409 carrying docker's message."""
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    short = STACK_VOLUME_NAME_SANITIZE_RE.sub("", name.lower())
    if not short:
        raise HTTPException(status_code=400, detail="Invalid volume name")
    real = namespaced_volume_name(parent, short)
    exec_result = parent.exec_run(
        ["sh", "-c", f"docker volume rm {real}"], privileged=True)
    output = exec_result.output.decode("utf-8", errors="replace").strip()
    if exec_result.exit_code != 0:
        raise HTTPException(status_code=409, detail=output or f"Failed to remove volume {short}")
    record_event(parent.name, "volume_deleted", f"volume {short} deleted", user.get("user_id"))
    return {"deleted": short}

# ---------------------------------------------------------------------------
# Export a running workspace as a reproducible stack template
# ---------------------------------------------------------------------------

EXPORT_ENV_SKIP_KEYS = ("PATH",)

def export_child_service(parent, child_name: str):
    """Best-effort: docker inspect one running child inside the parent and shape
    it into a stack.json service ({name, image, env, volumes}). Returns None on
    any inspect failure (the caller skips it)."""
    fmt = "{{json .Config.Image}}|{{json .Config.Env}}|{{json .Mounts}}"
    exec_result = parent.exec_run(
        ["sh", "-c", f"docker inspect --format '{fmt}' {child_name}"], privileged=True)
    if exec_result.exit_code != 0:
        return None
    raw = exec_result.output.decode("utf-8", errors="replace").strip()
    try:
        image_json, env_json, mounts_json = raw.split("|", 2)
        image = json.loads(image_json)
        env_list = json.loads(env_json) or []
        mounts = json.loads(mounts_json) or []
    except (ValueError, TypeError):
        return None
    env = {}
    for entry in env_list:
        if "=" not in entry:
            continue
        key, value = entry.split("=", 1)
        if key in EXPORT_ENV_SKIP_KEYS:
            continue
        env[key] = value
    volumes = []
    prefix = f"{VOLUME_NAME_PREFIX}{parent_short(parent)}-"
    for mount in mounts:
        if mount.get("Type") != "volume":
            continue
        source = mount.get("Name", "")
        destination = mount.get("Destination", "")
        if not destination:
            continue
        short = source[len(prefix):] if source.startswith(prefix) else source
        volumes.append(f"{short}:{destination}")
    return {"name": child_name, "image": image, "env": env, "volumes": volumes}

@app.get("/container/{parent_id}/export")
async def export_workspace(parent_id: str, host: str = None, user=Depends(require_user)):
    """Snapshot a running workspace as a stack.json-shaped template: every
    running child except the editor and expose sidecars, with its image, env
    (all non-PATH vars) and named-volume mounts. Best-effort — children that
    fail to inspect are skipped."""
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    exec_result = parent.exec_run(
        "sh -c 'docker ps --format \"{{.Names}}\"'", privileged=True)
    services = []
    for line in exec_result.output.decode("utf-8", errors="replace").splitlines():
        child = line.strip()
        if not child or is_snapshot_exempt(child):
            continue
        service = export_child_service(parent, child)
        if service is not None:
            services.append(service)
    record_event(parent.name, "workspace_exported",
                 f"exported {len(services)} services as a stack", user.get("user_id"))
    return {"stack": {"services": services}, "services": len(services)}

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

IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")

def child_ip(parent, child_name):
    """A child's IP on the parent's default bridge (names don't resolve
    there, so probes must target the IP). Returns None when the child is
    missing or has no IP yet — docker inspect errors must never be
    mistaken for an address."""
    exec_result = parent.exec_run(
        "sh -c 'docker inspect --format \"{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}\" " + child_name + "'",
        privileged=True,
    )
    value = exec_result.output.decode("utf-8", errors="replace").strip()
    if exec_result.exit_code != 0 or not IPV4_RE.match(value):
        return None
    return value

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
            reap_expired_previews()
        except Exception:
            pass
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
            "env": list((service.get("env") or {}).keys()),
            "volumes": service.get("volumes") or [],
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

# ---------------------------------------------------------------------------
# Exposures (publish a nested child on the host via chained socat proxies)
# ---------------------------------------------------------------------------

exposures = ci_db['exposures']

EXPOSE_IMAGE = "alpine/socat"
EXPOSE_PORT_MIN = 42000
EXPOSE_PORT_MAX = 42999
EXPOSE_NAME_PREFIX = "lattice-expose-"

def require_local_host(host: str = None):
    """Expose/editor/snapshot features only drive the local daemon; a remote
    `host` query param is rejected up front."""
    if host not in (None, "", "local"):
        raise HTTPException(status_code=400, detail="Expose/editor/snapshots are local-only for now")

def expose_inner_name(child: str, port: int) -> str:
    """The socat sidecar inside the parent (parent interfaces -> child)."""
    return f"{EXPOSE_NAME_PREFIX}{child}-{port}"

def expose_host_name(parent_id: str, host_port: int) -> str:
    """The socat container on the host (localhost -> parent interfaces)."""
    return f"{EXPOSE_NAME_PREFIX}{parent_id[:12]}-{host_port}"

def pick_expose_port() -> int:
    """A free port in the expose range: not claimed by a recorded exposure and
    actually bindable on the host right now."""
    taken = {doc.get("host_port") for doc in exposures.find({}, {"host_port": 1})}
    for port in range(EXPOSE_PORT_MIN, EXPOSE_PORT_MAX + 1):
        if port in taken:
            continue
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(("0.0.0.0", port))
            return port
        except OSError:
            continue
    raise HTTPException(status_code=503, detail=f"No free expose port left in {EXPOSE_PORT_MIN}-{EXPOSE_PORT_MAX}")

def parent_bridge_ip(parent) -> str:
    """The parent's IP on the host daemon's bridge — where the host socat
    forwards to."""
    parent.reload()
    settings = parent.attrs['NetworkSettings']
    ip = settings.get('IPAddress')
    if not ip:
        for network in (settings.get('Networks') or {}).values():
            if network.get('IPAddress'):
                ip = network['IPAddress']
                break
    if not ip:
        raise HTTPException(status_code=500, detail=f"Parent {parent.name} has no bridge IP")
    return ip

def serialize_exposure(doc):
    return {
        "id": str(doc["_id"]),
        "child": doc["child"],
        "port": doc["port"],
        "hostPort": doc["host_port"],
        "url": f"http://localhost:{doc['host_port']}",
    }

def ensure_exposure(parent, child: str, port: int, actor=None):
    """Idempotently publish child:port two layers up: a socat inside the
    parent bridges the child to the parent's interfaces, and a socat on the
    host bridges the parent to localhost (same port number on both hops).
    Returns the exposure doc — the existing one when child+port is already
    exposed."""
    existing = exposures.find_one({"parent_id": parent.id, "child": child, "port": port})
    if existing:
        return existing
    ip = child_ip(parent, child)
    if not ip:
        raise HTTPException(status_code=400, detail=f"Child {child} has no IP inside {parent.name} (is it running?)")
    bridge_port = pick_expose_port()
    inner = parent.exec_run(
        f"sh -c 'docker run -d --name {expose_inner_name(child, port)} "
        f"-p {bridge_port}:{bridge_port} {EXPOSE_IMAGE} "
        f"tcp-listen:{bridge_port},fork,reuseaddr tcp:{ip}:{port}'",
        privileged=True,
    )
    if inner.exit_code != 0:
        raise HTTPException(status_code=500, detail={
            'error': 'Failed to start expose proxy inside parent',
            'message': inner.output.decode("utf-8", errors="replace"),
        })
    try:
        client.containers.run(
            EXPOSE_IMAGE,
            f"tcp-listen:{bridge_port},fork,reuseaddr tcp:{parent_bridge_ip(parent)}:{bridge_port}",
            detach=True,
            name=expose_host_name(parent.id, bridge_port),
            ports={f"{bridge_port}/tcp": bridge_port},
            labels={"lattice-expose": "1"},
        )
    except Exception as e:
        parent.exec_run(f"sh -c 'docker rm -f {expose_inner_name(child, port)}'", privileged=True)
        raise HTTPException(status_code=500, detail={'error': 'Failed to start expose proxy on host', 'message': str(e)})
    doc = {
        "parent_id": parent.id,
        "parent_name": parent.name,
        "child": child,
        "port": port,
        "host_port": bridge_port,
        "created_at": utc_now_iso(),
    }
    doc["_id"] = exposures.insert_one(doc).inserted_id
    record_event(parent.name, "exposed",
                 f"{child}:{port} exposed at http://localhost:{bridge_port}", actor)
    return doc

def teardown_exposure(doc):
    """Best-effort removal of both socat proxies; already-gone containers (or
    a gone parent) don't error."""
    try:
        client.containers.get(expose_host_name(doc["parent_id"], doc["host_port"])).remove(force=True)
    except Exception:
        pass
    try:
        parent = client.containers.get(doc["parent_id"])
        parent.exec_run(
            f"sh -c 'docker rm -f {expose_inner_name(doc['child'], doc['port'])}'",
            privileged=True,
        )
    except Exception:
        pass

@app.post("/container/{parent_id}/expose/{child}")
async def expose_child(parent_id: str, child: str, body: dict, host: str = None, user=Depends(require_user)):
    require_local_host(host)
    port = body.get("port") if isinstance(body, dict) else None
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        raise HTTPException(status_code=400, detail="body needs an integer port (1-65535)")
    try:
        parent = client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    try:
        return serialize_exposure(ensure_exposure(parent, child, port, user.get("user_id")))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to expose child', 'message': str(e)})

@app.get("/exposures")
async def list_exposures(parent: str = None, user=Depends(require_user)):
    query = {"$or": [{"parent_name": parent}, {"parent_id": parent}]} if parent else {}
    return [serialize_exposure(doc) for doc in exposures.find(query).sort("created_at", -1)]

@app.delete("/exposures/{exposure_id}")
async def delete_exposure(exposure_id: str, user=Depends(require_user)):
    try:
        object_id = ObjectId(exposure_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid exposure id")
    doc = exposures.find_one_and_delete({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Exposure not found")
    teardown_exposure(doc)
    record_event(doc.get("parent_name"), "unexposed",
                 f"{doc.get('child')}:{doc.get('port')} unexposed from host port {doc.get('host_port')}",
                 user.get("user_id"))
    return {"deleted": exposure_id}

# ---------------------------------------------------------------------------
# Editor (one-click code-server child inside a workspace parent)
# ---------------------------------------------------------------------------

EDITOR_CHILD_NAME = "editor"
EDITOR_IMAGE = "codercom/code-server:latest"
EDITOR_PORT = 8080

def ensure_editor_child(parent):
    """Idempotently run (or restart) the code-server child inside the parent.
    The first use pulls the image inside the parent (~350 MB), so this exec
    can take minutes — exec_run blocks without a timeout, which is what we
    want here."""
    status = parent_ps(parent).get(EDITOR_CHILD_NAME)
    if status is None:
        exec_result = parent.exec_run(
            f"sh -c 'docker run -d --name {EDITOR_CHILD_NAME} "
            f"-v /opt/lattice:/home/coder/project {EDITOR_IMAGE} "
            f"--auth none --bind-addr 0.0.0.0:{EDITOR_PORT}'",
            privileged=True,
        )
        if exec_result.exit_code != 0:
            raise HTTPException(status_code=500, detail={
                'error': 'Failed to start editor',
                'message': exec_result.output.decode("utf-8", errors="replace"),
            })
    elif not status.startswith("Up"):
        parent.exec_run(f"sh -c 'docker start {EDITOR_CHILD_NAME}'", privileged=True)

@app.post("/container/{parent_id}/editor")
async def open_editor(parent_id: str, host: str = None, user=Depends(require_user)):
    require_local_host(host)
    try:
        parent = client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    try:
        ensure_editor_child(parent)
        exposure = ensure_exposure(parent, EDITOR_CHILD_NAME, EDITOR_PORT, user.get("user_id"))
        url = f"http://localhost:{exposure['host_port']}"
        record_event(parent.name, "editor_opened", f"editor ready at {url}", user.get("user_id"))
        return {"url": url, "status": "ready"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to open editor', 'message': str(e)})

@app.get("/container/{parent_id}/editor")
async def get_editor(parent_id: str, host: str = None, user=Depends(require_user)):
    require_local_host(host)
    try:
        parent = client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    try:
        exists = EDITOR_CHILD_NAME in parent_ps(parent)
        exposure = exposures.find_one(
            {"parent_id": parent.id, "child": EDITOR_CHILD_NAME, "port": EDITOR_PORT})
        url = f"http://localhost:{exposure['host_port']}" if exposure else None
        return {"exists": exists, "url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to inspect editor', 'message': str(e)})

# ---------------------------------------------------------------------------
# Snapshots (docker-commit the children of a workspace; restore later)
# ---------------------------------------------------------------------------

snapshots = ci_db['snapshots']

SNAPSHOT_NAME_SANITIZE_RE = re.compile(r"[^a-z0-9-]")

def is_snapshot_exempt(child_name: str) -> bool:
    """Expose sidecars and the editor are infrastructure, not workload: they
    are neither committed by a snapshot nor removed by a restore."""
    return child_name == EDITOR_CHILD_NAME or child_name.startswith(EXPOSE_NAME_PREFIX)

def snapshot_candidates(parent):
    """Running children of the parent eligible for a snapshot ->
    [{name, image}]."""
    exec_result = parent.exec_run(
        "sh -c 'docker ps --format \"{{.Names}},{{.Image}}\"'", privileged=True,
    )
    children = []
    for line in exec_result.output.decode("utf-8", errors="replace").splitlines():
        if "," not in line:
            continue
        name, image = line.split(",", 1)
        if not is_snapshot_exempt(name):
            children.append({"name": name, "image": image})
    return children

def serialize_snapshot(doc):
    return {
        "id": str(doc["_id"]),
        "parent_id": doc.get("parent_id"),
        "parent_name": doc.get("parent_name"),
        "name": doc.get("name"),
        "created_at": doc.get("created_at"),
        "created_by": doc.get("created_by"),
        "children": doc.get("children", []),
    }

def find_snapshot_or_404(snapshot_id: str):
    try:
        doc = snapshots.find_one({"_id": ObjectId(snapshot_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid snapshot id")
    if not doc:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return doc

@app.post("/container/{parent_id}/snapshots")
async def create_snapshot(parent_id: str, body: dict, host: str = None, user=Depends(require_user)):
    require_local_host(host)
    name = SNAPSHOT_NAME_SANITIZE_RE.sub("", str(body.get("name") or "").lower())
    if not name:
        raise HTTPException(status_code=400, detail="name is required ([a-z0-9-])")
    try:
        parent = client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    if snapshots.find_one({"parent_id": parent.id, "name": name}):
        raise HTTPException(status_code=409, detail=f"Snapshot {name} already exists for this workspace")
    try:
        candidates = snapshot_candidates(parent)
        if not candidates:
            raise HTTPException(status_code=400, detail="Workspace has no running children to snapshot")
        children = []
        for child in candidates:
            snap_image = f"lattice-snap-{name}-{child['name']}".lower()
            commit = parent.exec_run(
                f"sh -c 'docker commit {child['name']} {snap_image}'", privileged=True,
            )
            if commit.exit_code != 0:
                raise HTTPException(status_code=500, detail={
                    'error': f"Failed to commit {child['name']}",
                    'message': commit.output.decode("utf-8", errors="replace"),
                })
            children.append({"name": child["name"], "snap_image": snap_image,
                             "original_image": child["image"]})
        doc = {
            "parent_id": parent.id,
            "parent_name": parent.name,
            "name": name,
            "created_at": utc_now_iso(),
            "created_by": user.get("user_id"),
            "children": children,
        }
        doc["_id"] = snapshots.insert_one(doc).inserted_id
        record_event(parent.name, "snapshot_created",
                     f"snapshot {name} captured {len(children)} children", user.get("user_id"))
        return serialize_snapshot(doc)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to create snapshot', 'message': str(e)})

@app.get("/snapshots")
async def list_snapshots(parent: str = None, user=Depends(require_user)):
    query = {"$or": [{"parent_name": parent}, {"parent_id": parent}]} if parent else {}
    return [serialize_snapshot(doc) for doc in snapshots.find(query).sort("created_at", -1)]

@app.post("/snapshots/{snapshot_id}/restore")
async def restore_snapshot(snapshot_id: str, host: str = None, user=Depends(require_user)):
    require_local_host(host)
    doc = find_snapshot_or_404(snapshot_id)
    try:
        parent = client.containers.get(doc["parent_id"])
    except Exception:
        raise HTTPException(status_code=404, detail=f"Workspace {doc.get('parent_name')} not found")
    try:
        for child in parent_ps(parent):
            if not is_snapshot_exempt(child):
                parent.exec_run(f"sh -c 'docker rm -f {child}'", privileged=True)
        restored = []
        for child in doc.get("children", []):
            exec_result = parent.exec_run(
                f"sh -c 'docker run -dit --name {child['name']} {child['snap_image']}'",
                privileged=True,
            )
            output = exec_result.output.decode("utf-8", errors="replace").strip()
            last_line = output.splitlines()[-1].strip() if output else ""
            restored.append({"name": child["name"],
                             "ok": exec_result.exit_code == 0,
                             "output": last_line})
        started = sum(1 for r in restored if r["ok"])
        record_event(doc["parent_name"], "snapshot_restored",
                     f"snapshot {doc['name']} restored {started}/{len(restored)} children",
                     user.get("user_id"))
        return {"restored": restored}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to restore snapshot', 'message': str(e)})

@app.delete("/snapshots/{snapshot_id}")
async def delete_snapshot(snapshot_id: str, user=Depends(require_user)):
    doc = find_snapshot_or_404(snapshot_id)
    snapshots.delete_one({"_id": doc["_id"]})
    try:
        parent = client.containers.get(doc["parent_id"])
        for child in doc.get("children", []):
            parent.exec_run(f"sh -c 'docker rmi {child['snap_image']}'", privileged=True)
    except Exception:
        pass
    return {"deleted": snapshot_id}

# ---------------------------------------------------------------------------
# Preview environments (ephemeral per-changeset workspaces, Vercel-style)
# ---------------------------------------------------------------------------

PREVIEW_NAME_PREFIX = "lat-prev-"
PREVIEW_TTL_MINUTES = 60
PREVIEW_JANITOR_INTERVAL_SECONDS = 60
PREVIEW_CREATED_FRACTION_RE = re.compile(r"(\.\d{6})\d+")  # ns -> µs for fromisoformat

_preview_last_sweep = 0.0  # monotonic-ish gate; only the reconciler thread writes it

def fetch_changeset_or_404(package_id: str, changeset_id: str, authorization: str = None):
    headers = {"Authorization": authorization} if authorization else {}
    response = requests.get(
        f"{PACKAGES_SERVICE_URL}/packages/{package_id}/changesets/{changeset_id}",
        headers=headers, timeout=15,
    )
    if response.status_code != 200:
        raise HTTPException(status_code=404, detail="Changeset not found")
    return response.json()

def overlay_changeset_files(package_files: list, changeset_files: list) -> list:
    """Effective preview content: the package's files overlaid with the
    changeset's files — the changeset wins by name."""
    by_name = {f["name"]: f for f in package_files}
    for file in changeset_files:
        if file.get("name") and file.get("content") is not None:
            by_name[file["name"]] = file
    return list(by_name.values())

def preview_parent_name(changeset_id: str) -> str:
    suffix = STACK_NAME_SANITIZE_RE.sub("", changeset_id[-8:].lower())
    if not suffix:
        raise HTTPException(status_code=400, detail="Invalid changeset id")
    return f"{PREVIEW_NAME_PREFIX}{suffix}"

def ensure_preview_parent(name: str):
    """Idempotently create the ephemeral DinD parent for a preview on the
    local daemon; reused as-is when it already exists."""
    try:
        return client.containers.get(name)
    except docker.errors.NotFound:
        pass
    parent = create_dind_parent(client, name)
    wait_for_inner_daemon(parent)
    return parent

def parse_container_created(raw: str):
    """Docker reports Created with nanosecond precision; trim to µs so
    fromisoformat accepts it. Returns an aware datetime or None."""
    try:
        trimmed = PREVIEW_CREATED_FRACTION_RE.sub(r"\1", raw).replace("Z", "+00:00")
        return datetime.datetime.fromisoformat(trimmed)
    except (TypeError, ValueError):
        return None

def cleanup_preview_exposures(parent_name: str, parent_id: str = None):
    """Best-effort removal of exposure docs (and their host-side socat) left
    behind by a preview parent."""
    query = {"parent_name": parent_name}
    if parent_id:
        query = {"$or": [{"parent_name": parent_name}, {"parent_id": parent_id}]}
    for doc in exposures.find(query):
        teardown_exposure(doc)
        exposures.delete_one({"_id": doc["_id"]})

def reap_expired_previews():
    """Janitor (runs inside the reconciler loop, at most once per minute):
    remove lat-prev-* parents older than PREVIEW_TTL_MINUTES. Previews are
    local-only, so only the local daemon is swept."""
    global _preview_last_sweep
    now = time.time()
    if now - _preview_last_sweep < PREVIEW_JANITOR_INTERVAL_SECONDS:
        return
    _preview_last_sweep = now
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=PREVIEW_TTL_MINUTES)
    for container in client.containers.list(all=True):
        if not container.name.startswith(PREVIEW_NAME_PREFIX):
            continue
        created = parse_container_created(container.attrs.get("Created", ""))
        if created is None or created >= cutoff:
            continue
        try:
            container.remove(force=True)
            cleanup_preview_exposures(container.name, container.id)
            record_event(container.name, "preview_expired",
                         f"preview {container.name} expired after {PREVIEW_TTL_MINUTES} minutes")
        except Exception:
            pass

@app.post("/preview/{package_id}/changesets/{changeset_id}")
async def create_preview(package_id: str, changeset_id: str, user=Depends(require_user), authorization: str = Header(None)):
    package, package_files = fetch_package_or_404(package_id, authorization)
    changeset = fetch_changeset_or_404(package_id, changeset_id, authorization)
    files = overlay_changeset_files(package_files, changeset.get("files") or [])
    parent_name = preview_parent_name(changeset_id)
    actor = user.get("user_id")
    try:
        parent = ensure_preview_parent(parent_name)
        ensure_reconciler_started()  # the reconciler loop hosts the janitor
        if any(f["name"] == "stack.json" for f in files):
            # Previews are deliberately NOT upserted into deployments: the
            # reconciler must not resurrect what the janitor is about to reap.
            services = parse_stack_services(files)
            deployed = []
            for service in services:
                deployed.extend(deploy_stack_service(parent, service))
            record_event(parent_name, "preview_created",
                         f"preview of {package_id}@{changeset_id} deployed {len(services)} services", actor)
            return {"parent": parent_name, "kind": "stack", "deployed": deployed,
                    "expires_in_minutes": PREVIEW_TTL_MINUTES}
        package_name = package.get("name", package_id)
        parent.exec_run(f"sh -c 'mkdir -p {PLUGINS_DIR}'", privileged=True)
        parent.put_archive(PLUGINS_DIR, build_package_tar(package_name, files))
        run_install_script(parent, package_name, files)
        record_event(parent_name, "preview_created",
                     f"preview of {package_id}@{changeset_id} installed plugin {package_name}", actor)
        return {"parent": parent_name, "kind": "plugin", "installed": package_name,
                "expires_in_minutes": PREVIEW_TTL_MINUTES}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to create preview', 'message': str(e)})

@app.get("/previews")
async def list_previews(user=Depends(require_user)):
    ensure_reconciler_started()
    try:
        output = subprocess.check_output(["docker", "ps", "-a", "--format", "{{json .}}"])
        previews = []
        for line in output.splitlines():
            if not line.strip():
                continue
            info = json.loads(line)
            if info.get("Names", "").startswith(PREVIEW_NAME_PREFIX):
                previews.append({
                    "name": info.get("Names", ""),
                    "status": info.get("Status", ""),
                    "created": info.get("RunningFor", ""),
                })
        return previews
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to list previews', 'message': str(e)})

@app.delete("/previews/{name}")
async def delete_preview(name: str, user=Depends(require_user)):
    if not name.startswith(PREVIEW_NAME_PREFIX):
        raise HTTPException(status_code=400, detail=f"Not a preview container (expected {PREVIEW_NAME_PREFIX}*)")
    try:
        preview = client.containers.get(name)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Preview not found")
    try:
        parent_id = preview.id
        preview.remove(force=True)
        cleanup_preview_exposures(name, parent_id)
        return {"deleted": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to delete preview', 'message': str(e)})

# ---------------------------------------------------------------------------
# GitHub watches (mini-Heroku: poll a branch, build + redeploy on new commits)
# ---------------------------------------------------------------------------

watches = ci_db['watches']

GITHUB_REPO_RE = re.compile(r"^https://github\.com/[\w.-]+/[\w.-]+/?$")
GITHUB_BRANCH_RE = re.compile(r"^[\w./-]+$")
GITHUB_API_TIMEOUT_SECONDS = 10
WATCH_POLL_INTERVAL_SECONDS = 120
# Unauthenticated GitHub API allows 60 requests/hour; with a 120s pass and the
# 180s per-watch floor below this comfortably supports ~2 watches.
WATCH_MIN_CHECK_INTERVAL_SECONDS = 180
WATCH_ERROR_MAX_CHARS = 500

_watch_poller_lock = threading.Lock()
_watch_poller_started = False

def serialize_watch(doc):
    doc = dict(doc)
    doc["_id"] = str(doc["_id"])
    return doc

def find_watch_or_404(watch_id: str):
    try:
        doc = watches.find_one({"_id": ObjectId(watch_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid watch id")
    if not doc:
        raise HTTPException(status_code=404, detail="Watch not found")
    return doc

def github_latest_sha(repo: str, branch: str) -> str:
    owner_repo = repo.rstrip("/").removeprefix("https://github.com/")
    response = requests.get(
        f"https://api.github.com/repos/{owner_repo}/commits/{branch}",
        headers={"User-Agent": "lattice", "Accept": "application/vnd.github+json"},
        timeout=GITHUB_API_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()["sha"]

def run_watch_build(parent, watch, sha: str):
    """Build the repo inside the parent (BuildKit in dind clones git contexts
    itself) and swap the running service container on success. The build exec
    deliberately has no timeout. Returns (ok, detail)."""
    service = watch["service"]
    tag = f"watch-{service}:{sha[:7]}"
    build_command = f"docker build -t {tag} {watch['repo'].rstrip('/')}.git#{watch['branch']}"
    build = parent.exec_run(f"sh -c '{build_command}'", privileged=True)
    output = build.output.decode("utf-8", errors="replace")
    if build.exit_code != 0:
        return False, output[-WATCH_ERROR_MAX_CHARS:]
    parent.exec_run(f"sh -c 'docker rm -f {service}'", privileged=True)
    run = parent.exec_run(f"sh -c 'docker run -dit --name {service} {tag}'", privileged=True)
    if run.exit_code != 0:
        return False, run.output.decode("utf-8", errors="replace")[-WATCH_ERROR_MAX_CHARS:]
    return True, tag

def update_watch(doc, fields: dict):
    fields = {**fields, "last_checked": utc_now_iso()}
    watches.update_one({"_id": doc["_id"]}, {"$set": fields})
    return watches.find_one({"_id": doc["_id"]})

def poll_watch(doc, actor=None):
    """One poll cycle for one watch: compare the branch head against last_sha
    and build + redeploy inside the parent when it moved. Never raises;
    returns the refreshed doc."""
    try:
        sha = github_latest_sha(doc["repo"], doc["branch"])
    except Exception as e:
        return update_watch(doc, {"last_status": "error",
                                  "last_error": str(e)[:WATCH_ERROR_MAX_CHARS]})
    if sha == doc.get("last_sha"):
        return update_watch(doc, {})
    try:
        parent = client.containers.get(doc["parent_name"])
        doc = update_watch(doc, {"last_status": "building"})
        record_event(doc["parent_name"], "github_build",
                     f"building {doc['service']} from {doc['repo']}@{sha[:7]}", actor)
        ok, detail = run_watch_build(parent, doc, sha)
        if ok:
            record_event(doc["parent_name"], "github_deploy",
                         f"deployed {doc['service']} at {sha[:7]}", actor)
            return update_watch(doc, {"last_status": "ok", "last_sha": sha, "last_error": None})
        record_event(doc["parent_name"], "github_build_failed",
                     f"build of {doc['service']} at {sha[:7]} failed", actor)
        return update_watch(doc, {"last_status": "error", "last_error": detail})
    except Exception as e:
        return update_watch(doc, {"last_status": "error",
                                  "last_error": str(e)[:WATCH_ERROR_MAX_CHARS]})

def watch_poller_loop():
    while True:
        try:
            docs = list(watches.find())
        except Exception:
            docs = []
        now = datetime.datetime.now(datetime.timezone.utc)
        for doc in docs:
            try:
                last_checked = doc.get("last_checked")
                if last_checked:
                    age = (now - datetime.datetime.fromisoformat(last_checked)).total_seconds()
                    if age < WATCH_MIN_CHECK_INTERVAL_SECONDS:
                        continue
                poll_watch(doc)
            except Exception:
                pass
        time.sleep(WATCH_POLL_INTERVAL_SECONDS)

def ensure_watch_poller_started():
    """Lazily start the single watch poller daemon thread. Safe to call on
    every write/read."""
    global _watch_poller_started
    with _watch_poller_lock:
        if _watch_poller_started:
            return
        threading.Thread(
            target=watch_poller_loop, name="lattice-watch-poller", daemon=True,
        ).start()
        _watch_poller_started = True

@app.post("/watches")
async def create_watch(body: dict, user=Depends(require_user)):
    repo = str(body.get("repo") or "").strip()
    branch = str(body.get("branch") or "main").strip() or "main"
    service = STACK_NAME_SANITIZE_RE.sub("", str(body.get("service") or "").lower())
    parent_name = str(body.get("parent") or "").strip()
    if not GITHUB_REPO_RE.match(repo):
        raise HTTPException(status_code=400, detail="repo must look like https://github.com/user/repo")
    if not GITHUB_BRANCH_RE.match(branch):
        raise HTTPException(status_code=400, detail="branch may only contain [\\w./-]")
    if not service:
        raise HTTPException(status_code=400, detail="service is required ([a-z0-9-])")
    if not parent_name:
        raise HTTPException(status_code=400, detail="parent is required")
    try:
        parent = client.containers.get(parent_name)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    doc = {
        "repo": repo,
        "branch": branch,
        "service": service,
        "parent_name": parent.name,
        "last_sha": None,
        "last_status": "idle",
        "last_error": None,
        "last_checked": None,
        "created_by": user.get("user_id"),
        "created_at": utc_now_iso(),
    }
    doc["_id"] = watches.insert_one(doc).inserted_id
    record_event(parent.name, "watch_created",
                 f"watching {repo}@{branch} -> {service}", user.get("user_id"))
    ensure_watch_poller_started()
    return serialize_watch(doc)

@app.get("/watches")
async def list_watches(parent: str = None, user=Depends(require_user)):
    ensure_watch_poller_started()
    query = {"parent_name": parent} if parent else {}
    return [serialize_watch(doc) for doc in watches.find(query).sort("created_at", -1)]

@app.delete("/watches/{watch_id}")
async def delete_watch(watch_id: str, user=Depends(require_user)):
    doc = find_watch_or_404(watch_id)
    watches.delete_one({"_id": doc["_id"]})
    return {"deleted": watch_id}

@app.post("/watches/{watch_id}/check")
async def check_watch(watch_id: str, user=Depends(require_user)):
    doc = find_watch_or_404(watch_id)
    ensure_watch_poller_started()
    return serialize_watch(poll_watch(doc, actor=user.get("user_id")))

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

# ---------------------------------------------------------------------------
# Cron jobs (k8s CronJob-style: run a one-off container on a cron schedule)
# ---------------------------------------------------------------------------

cronjobs = ci_db['cronjobs']

CRON_NAME_SANITIZE_RE = re.compile(r"[^a-z0-9-]")
CRON_OUTPUT_MAX_CHARS = 500
CRON_ENV_MAX = 50
CRON_SCHEDULER_INTERVAL_SECONDS = 60

# 5-field cron ranges (min hour dom mon dow); dow 0-6 (Sunday=0).
CRON_FIELD_RANGES = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 6))

_cron_scheduler_lock = threading.Lock()
_cron_scheduler_started = False
_cron_last_fired = {}   # "cronjob_id" -> "YYYY-MM-DDTHH:MM" minute already fired


def parse_cron_field(field, low, high):
    """Expand one cron field into a set of matching ints, supporting `*`,
    `*/n`, `a-b`, `a,b,c` and plain ints. Raises ValueError when malformed or
    out of range so the caller can turn it into a 400."""
    values = set()
    for part in field.split(","):
        part = part.strip()
        if not part:
            raise ValueError(f"empty term in {field!r}")
        step = 1
        if "/" in part:
            base, _, step_raw = part.partition("/")
            step = int(step_raw)
            if step <= 0:
                raise ValueError(f"step must be positive in {part!r}")
        else:
            base = part
        if base == "*":
            start, end = low, high
        elif "-" in base:
            start_raw, _, end_raw = base.partition("-")
            start, end = int(start_raw), int(end_raw)
        else:
            start = end = int(base)
        if start < low or end > high or start > end:
            raise ValueError(f"term {part!r} out of range [{low},{high}]")
        values.update(range(start, end + 1, step))
    return values


def parse_cron_expr(expr):
    """Parse a 5-field cron expression into a list of matching-int sets. Raises
    ValueError when it does not have exactly 5 fields or any field is bad."""
    fields = str(expr or "").split()
    if len(fields) != 5:
        raise ValueError("cron expression must have exactly 5 fields")
    return [parse_cron_field(field, low, high)
            for field, (low, high) in zip(fields, CRON_FIELD_RANGES)]


def cron_matches(expr, dt):
    """True when the datetime `dt` (UTC, minute resolution) satisfies the cron
    expression. Uses Python's weekday convention mapped to cron's (Sunday=0)."""
    minutes, hours, doms, months, dows = parse_cron_expr(expr)
    cron_dow = (dt.weekday() + 1) % 7  # Mon=0..Sun=6 -> Sun=0..Sat=6
    return (dt.minute in minutes and dt.hour in hours
            and dt.day in doms and dt.month in months and cron_dow in dows)


def serialize_cronjob(doc):
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


def find_cronjob_or_404(cronjob_id):
    try:
        doc = cronjobs.find_one({"_id": ObjectId(cronjob_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cronjob id")
    if not doc:
        raise HTTPException(status_code=404, detail="Cronjob not found")
    return doc


def parse_cron_env(env):
    """Validate an optional cron env spec: a flat dict {KEY: scalar} with keys in
    [A-Za-z0-9_], values coerced to str. Values may be a whole-value secret
    reference "${SECRET_KEY}" resolved at run time. Raises 400 when malformed."""
    if env is None:
        return {}
    if not isinstance(env, dict):
        raise HTTPException(status_code=400, detail="env must be an object")
    if len(env) > CRON_ENV_MAX:
        raise HTTPException(status_code=400, detail=f"too many env vars (max {CRON_ENV_MAX})")
    validated = {}
    for key, value in env.items():
        if not isinstance(key, str) or not STACK_ENV_KEY_RE.match(key):
            raise HTTPException(status_code=400, detail=f"env key {key!r} must match [A-Za-z0-9_]")
        if isinstance(value, bool) or value is None or isinstance(value, (dict, list)):
            raise HTTPException(status_code=400, detail=f"env {key} value must be a scalar")
        validated[key] = str(value)
    return validated


def run_cronjob(doc):
    """Run one cronjob once, right now, as a one-off `docker run --rm` container
    inside the parent. Env ${SECRET} refs resolve against the workspace vault
    exactly like stacks. Captures exit code + last output line into last_status/
    last_output/last_run. Never raises — a broken cronjob must not take down the
    scheduler or the request that triggered it."""
    fields = {
        "last_run": utc_now_iso(),
        "last_status": "error",
        "last_output": "",
    }
    try:
        parent = client.containers.get(doc["parent_name"])
        name = f"cron-{doc['name']}-{int(time.time())}"
        command = f"docker run --rm --name {name}"
        env = doc.get("env") or {}
        if env:
            vault = resolve_secrets(doc["parent_name"])
            for key, raw_value in env.items():
                match = SECRET_REF_RE.match(str(raw_value))
                value = vault.get(match.group(1), "") if match else str(raw_value)
                command += f" -e {key}={shell_single_quote(value)}"
        command += f" {doc['image']} sh -c {shell_single_quote(doc['command'])}"
        # List form (not the f"sh -c '{command}'" string form): docker-py
        # shlex.splits a string cmd and mangles the '\'' escapes in the
        # single-quoted command/env values, so pass the argv list instead.
        exec_result = parent.exec_run(["sh", "-c", command], privileged=True)
        output = exec_result.output.decode("utf-8", errors="replace")
        last_line = next((l for l in reversed(output.splitlines()) if l.strip()), "")
        fields["last_status"] = "ok" if exec_result.exit_code == 0 else "error"
        fields["last_output"] = (last_line or output).strip()[-CRON_OUTPUT_MAX_CHARS:]
    except Exception as e:
        fields["last_output"] = str(e)[-CRON_OUTPUT_MAX_CHARS:]
    cronjobs.update_one({"_id": doc["_id"]}, {"$set": fields})
    return cronjobs.find_one({"_id": doc["_id"]})


def cron_scheduler_loop():
    """Sleep until the top of the next minute, then fire every enabled cronjob
    whose schedule matches this minute and that has not already fired this
    minute. Sequential — cron jobs are short."""
    while True:
        now = datetime.datetime.now(datetime.timezone.utc)
        time.sleep(max(1, 60 - now.second))
        now = datetime.datetime.now(datetime.timezone.utc)
        stamp = now.strftime("%Y-%m-%dT%H:%M")
        try:
            docs = list(cronjobs.find({"enabled": True}))
        except Exception:
            docs = []
        for doc in docs:
            key = str(doc["_id"])
            if _cron_last_fired.get(key) == stamp:
                continue
            try:
                if cron_matches(doc.get("schedule", ""), now):
                    _cron_last_fired[key] = stamp
                    run_cronjob(doc)
            except Exception:
                pass


def ensure_cron_scheduler_started():
    """Lazily start the single cron scheduler daemon thread. Safe to call on
    every write/read."""
    global _cron_scheduler_started
    with _cron_scheduler_lock:
        if _cron_scheduler_started:
            return
        threading.Thread(
            target=cron_scheduler_loop, name="lattice-cron-scheduler", daemon=True,
        ).start()
        _cron_scheduler_started = True


@app.post("/container/{parent_id}/cronjobs")
async def create_cronjob(parent_id: str, body: dict, host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="body must be an object")
    name = CRON_NAME_SANITIZE_RE.sub("", str(body.get("name") or "").lower())
    if not name:
        raise HTTPException(status_code=400, detail="name is required ([a-z0-9-])")
    schedule = str(body.get("schedule") or "").strip()
    try:
        parse_cron_expr(schedule)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid schedule: {e}")
    image = str(body.get("image") or "").strip()
    if not image:
        raise HTTPException(status_code=400, detail="image is required")
    command = str(body.get("command") or "").strip()
    if not command:
        raise HTTPException(status_code=400, detail="command is required")
    env = parse_cron_env(body.get("env"))
    doc = {
        "parent_name": parent.name,
        "parent_id": parent.id,
        "name": name,
        "schedule": schedule,
        "image": image,
        "command": command,
        "env": env,
        "last_run": None,
        "last_status": "idle",
        "last_output": None,
        "next_run": None,
        "created_by": user.get("user_id"),
        "created_at": utc_now_iso(),
        "enabled": True,
    }
    doc["_id"] = cronjobs.insert_one(doc).inserted_id
    record_event(parent.name, "cronjob_created",
                 f"cronjob {name} ({schedule}) -> {image}", user.get("user_id"))
    ensure_cron_scheduler_started()
    return serialize_cronjob(doc)


@app.get("/container/{parent_id}/cronjobs")
async def list_cronjobs(parent_id: str, host: str = None, user=Depends(require_user)):
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    ensure_cron_scheduler_started()
    return [serialize_cronjob(doc)
            for doc in cronjobs.find({"parent_name": parent.name}).sort("created_at", -1)]


@app.delete("/container/{parent_id}/cronjobs/{cronjob_id}")
async def delete_cronjob(parent_id: str, cronjob_id: str, host: str = None, user=Depends(require_user)):
    doc = find_cronjob_or_404(cronjob_id)
    cronjobs.delete_one({"_id": doc["_id"]})
    _cron_last_fired.pop(str(doc["_id"]), None)
    record_event(doc.get("parent_name"), "cronjob_deleted",
                 f"cronjob {doc.get('name')} deleted", user.get("user_id"))
    return {"deleted": cronjob_id}


@app.post("/container/{parent_id}/cronjobs/{cronjob_id}/run")
async def run_cronjob_now(parent_id: str, cronjob_id: str, host: str = None, user=Depends(require_user)):
    doc = find_cronjob_or_404(cronjob_id)
    updated = run_cronjob(doc)
    record_event(doc.get("parent_name"), "cronjob_run",
                 f"cronjob {doc.get('name')} run manually", user.get("user_id"))
    return serialize_cronjob(updated)


@app.post("/cronjobs/{cronjob_id}/toggle")
async def toggle_cronjob(cronjob_id: str, user=Depends(require_user)):
    doc = find_cronjob_or_404(cronjob_id)
    enabled = not doc.get("enabled", True)
    cronjobs.update_one({"_id": doc["_id"]}, {"$set": {"enabled": enabled}})
    record_event(doc.get("parent_name"), "cronjob_toggled",
                 f"cronjob {doc.get('name')} {'enabled' if enabled else 'disabled'}",
                 user.get("user_id"))
    return serialize_cronjob(cronjobs.find_one({"_id": doc["_id"]}))

# ---------------------------------------------------------------------------
# File manager (upload/download/list files inside a nested child)
# ---------------------------------------------------------------------------

UPLOAD_STAGING_DIR = "/opt/lattice/.upload"
DOWNLOAD_STAGING_DIR = "/opt/lattice/.download"
FILE_MANAGER_ABS_PATH_RE = re.compile(r"^/[^\0]*$")


def build_single_file_tar(filename: str, data: bytes) -> bytes:
    """Tar one in-memory file (no leading directory) for put_archive."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        info = tarfile.TarInfo(name=filename)
        info.size = len(data)
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(data))
    buffer.seek(0)
    return buffer.read()


@app.post("/container/{parent_id}/{child}/upload")
async def upload_file_to_child(parent_id: str, child: str, file: UploadFile = File(...),
                               path: str = Form("/root"), host: str = None,
                               user=Depends(require_user)):
    """Upload a file into a nested child: put_archive the bytes into the parent's
    own filesystem at a staging dir, then `docker cp` it from the parent into the
    child at the destination directory."""
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    filename = os.path.basename(file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=400, detail="filename is required")
    dest_dir = str(path or "/root").strip() or "/root"
    if not FILE_MANAGER_ABS_PATH_RE.match(dest_dir):
        raise HTTPException(status_code=400, detail="path must be an absolute directory")
    try:
        data = await file.read()
        parent.exec_run(["sh", "-c", f"mkdir -p {shell_single_quote(UPLOAD_STAGING_DIR)}"], privileged=True)
        parent.put_archive(UPLOAD_STAGING_DIR, build_single_file_tar(filename, data))
        staged = f"{UPLOAD_STAGING_DIR}/{filename}"
        copy_command = (
            f"docker exec {shell_single_quote(child)} mkdir -p {shell_single_quote(dest_dir)} && "
            f"docker cp {shell_single_quote(staged)} "
            f"{shell_single_quote(child)}:{shell_single_quote(dest_dir + '/')}"
        )
        exec_result = parent.exec_run(["sh", "-c", copy_command], privileged=True)
        parent.exec_run(["sh", "-c", f"rm -f {shell_single_quote(staged)}"], privileged=True)
        if exec_result.exit_code != 0:
            raise HTTPException(status_code=500, detail={
                "error": "Failed to copy file into child",
                "message": exec_result.output.decode("utf-8", errors="replace"),
            })
        record_event(parent.name, "file_uploaded",
                     f"{filename} -> {child}:{dest_dir}", user.get("user_id"))
        return {"name": filename, "path": f"{dest_dir}/{filename}", "ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": "Failed to upload file", "message": str(e)})


@app.get("/container/{parent_id}/{child}/download")
async def download_file_from_child(parent_id: str, child: str, path: str,
                                   host: str = None, user=Depends(require_user_query)):
    """Download an absolute file path from a nested child (?token= auth so plain
    browser links work): `docker cp` it from the child into the parent's staging
    dir, read it back with get_archive, extract the single file bytes and stream
    it as an attachment."""
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    src = str(path or "").strip()
    if not FILE_MANAGER_ABS_PATH_RE.match(src):
        raise HTTPException(status_code=400, detail="path must be an absolute file path")
    base = os.path.basename(src.rstrip("/")) or "download"
    staged = f"{DOWNLOAD_STAGING_DIR}/{base}"
    try:
        parent.exec_run(["sh", "-c", f"mkdir -p {shell_single_quote(DOWNLOAD_STAGING_DIR)}"], privileged=True)
        copy_command = (
            f"docker cp {shell_single_quote(child)}:{shell_single_quote(src)} "
            f"{shell_single_quote(staged)}"
        )
        exec_result = parent.exec_run(["sh", "-c", copy_command], privileged=True)
        if exec_result.exit_code != 0:
            raise HTTPException(status_code=404, detail="File not found in child")
        bits, _ = parent.get_archive(staged)
        archive = io.BytesIO(b"".join(bits))
        payload = b""
        with tarfile.open(fileobj=archive) as tar:
            member = next((m for m in tar.getmembers() if m.isreg()), None)
            if member is None:
                raise HTTPException(status_code=404, detail="File not found in child")
            payload = tar.extractfile(member).read()
        parent.exec_run(["sh", "-c", f"rm -f {shell_single_quote(staged)}"], privileged=True)
        filename = base.replace('"', "")
        return StreamingResponse(
            io.BytesIO(payload),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": "Failed to download file", "message": str(e)})


@app.get("/container/{parent_id}/{child}/ls")
async def list_child_files(parent_id: str, child: str, path: str = "/root",
                           host: str = None, user=Depends(require_user)):
    """Simple file browser: `ls -la <path>` inside the child (via docker exec
    from the parent). Returns raw listing lines or an error."""
    docker_client = get_client(host)
    try:
        parent = docker_client.containers.get(parent_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Parent container not found")
    target = str(path or "/root").strip() or "/root"
    if not FILE_MANAGER_ABS_PATH_RE.match(target):
        raise HTTPException(status_code=400, detail="path must be an absolute directory")
    command = f"docker exec {shell_single_quote(child)} ls -la {shell_single_quote(target)}"
    exec_result = parent.exec_run(["sh", "-c", command], privileged=True)
    output = exec_result.output.decode("utf-8", errors="replace")
    if exec_result.exit_code != 0:
        return {"path": target, "error": output.strip()}
    entries = [line for line in output.splitlines() if line.strip()]
    return {"path": target, "entries": entries}
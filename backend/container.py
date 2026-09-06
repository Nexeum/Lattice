import os
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
import psutil
import requests
import time
import numpy as np
from pymongo import MongoClient
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
async def execute_command(container_id: str, command: str, user=Depends(require_user)):
    try:
        container = client.containers.get(container_id)
        exec_id = container.exec_run(f"sh -c '{command}'", privileged=True)
        output = exec_id.output.decode("utf-8")

        if exec_id.exit_code != 0:
            return {'error': output}
        else:
            return {'output': output}
    except Exception as e:
        return {'error': str(e)}
    
@app.post('/node/{outer_container_id}/{inner_container_id}/{command}')
async def execute_nested_command(outer_container_id: str, inner_container_id: str, command: str, user=Depends(require_user)):
    try:
        outer_container = client.containers.get(outer_container_id)
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
async def create_container_main(id: str, user=Depends(require_user)):
    containers = {container.name: container for container in client.containers.list(all=True)}
    if id in containers:
        return {"message": f"Container {id} already exists"}
    container = client.containers.run(
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
async def list_containers(container_id: str, user=Depends(require_user)):
    container = client.containers.get(container_id)
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
async def get_containers(user=Depends(require_user)):
    try:
        output = subprocess.check_output(["docker", "ps", "-a", "--format", "{{json .}}"])
        containers = [json.loads(line) for line in output.splitlines()]
        containers = [c for c in containers if not c['Names'].startswith('k8s_')]
        modified_containers = []

        for container in containers:
            inspect_output = subprocess.check_output(["docker", "inspect", container['ID']])
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
async def get_container_metrics(id: str, user=Depends(require_user)):
    try:
        output = subprocess.check_output(["docker", "stats", id, "--no-stream", "--format", "{{json .}}"])
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
async def install_package(container_id: str, package_id: str, user=Depends(require_user), authorization: str = Header(None)):
    try:
        package, files = fetch_package_or_404(package_id, authorization)
        package_name = package.get("name", package_id)
        container = client.containers.get(container_id)

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
async def install_package_nested(outer_container_id: str, inner_container_id: str, package_id: str, user=Depends(require_user), authorization: str = Header(None)):
    try:
        package, files = fetch_package_or_404(package_id, authorization)
        package_name = package.get("name", package_id)
        outer = client.containers.get(outer_container_id)

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
# CI runs (GitHub-Actions-style pipelines for plugins)
# ---------------------------------------------------------------------------

ci_db = MongoClient(MONGO_URL)['kubehub']
ci_runs = ci_db['ci_runs']

CI_IMAGE = "alpine:3.19"
CI_STEP_TIMEOUT_SECONDS = 120

def utc_now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def serialize_run(doc):
    doc = dict(doc)
    doc["_id"] = str(doc["_id"])
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

def execute_ci_run(run_id, package_name, files, steps, image=CI_IMAGE):
    workdir = f"/work/{package_name}"
    runner = None
    status = "success"
    try:
        runner = client.containers.run(
            image, "sleep 600", detach=True,
            name=f"lattice-ci-{str(run_id)[-8:]}-{int(time.time())}",
        )
        runner.exec_run("sh -c 'mkdir -p /work'")
        runner.put_archive("/work", build_package_tar(package_name, files))

        for index, step in enumerate(steps):
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
            if step_status == "failed":
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
            try:
                runner.remove(force=True)
            except Exception:
                pass
        ci_runs.update_one(
            {"_id": run_id},
            {"$set": {"status": status, "finished_at": utc_now_iso()}},
        )

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
        "status": "running",
        "trigger": trigger,
        "image": image,
        "created_at": utc_now_iso(),
        "finished_at": None,
        "steps": [
            {"name": s["name"], "run": s["run"], "status": "queued",
             "output": "", "exit_code": None, "duration_seconds": None}
            for s in steps
        ],
    }
    run_id = ci_runs.insert_one(run_doc).inserted_id

    thread = threading.Thread(
        target=execute_ci_run, args=(run_id, package_name, files, steps, image), daemon=True
    )
    thread.start()
    return serialize_run(ci_runs.find_one({"_id": run_id}))

@app.get("/ci/{package_id}/runs")
async def list_ci_runs(package_id: str, user=Depends(require_user)):
    docs = ci_runs.find({"package_id": package_id}).sort("number", -1).limit(30)
    return [serialize_run(d) for d in docs]

@app.get("/ci/runs/{run_id}")
async def get_ci_run(run_id: str, user=Depends(require_user)):
    try:
        doc = ci_runs.find_one({"_id": ObjectId(run_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid run id")
    if not doc:
        raise HTTPException(status_code=404, detail="Run not found")
    return serialize_run(doc)

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
            if doc.get("status") != "running":
                break
            await asyncio.sleep(CI_STREAM_POLL_SECONDS)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )

@app.post("/container/{container_id}/start")
async def start_container(container_id: str, user=Depends(require_user)):
    try:
        container = client.containers.get(container_id)
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
async def terminal_websocket(websocket: WebSocket, container_id: str, token: str = None, inner: str = None):
    try:
        decode_token(token or "")
    except Exception:
        await websocket.close(code=4401)
        return
    await websocket.accept()

    sock = None
    try:
        cmd = ["docker", "exec", "-it", inner, "sh"] if inner else ["sh"]
        exec_id = api_client.exec_create(container_id, cmd, tty=True, stdin=True)
        sock = api_client.exec_start(exec_id, tty=True, socket=True)
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
                        api_client.exec_resize(
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

@app.get("/topology")
async def get_topology(user=Depends(require_user)):
    try:
        networks = []
        for network in client.networks.list():
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
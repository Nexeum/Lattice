import subprocess
import json
from fastapi import FastAPI, HTTPException
from starlette.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
import docker
import requests
import time
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed

client = docker.from_env()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
            ip = f"10.8.8.247:{port}"

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
async def start_overload_test_endpoint(id: str):
    return start_overload_test(id)

@app.get('/container/{container_id}/ip')
async def get_container_ip(container_id: str):
    try:
        container = client.containers.get(container_id)
        ip_address = container.attrs['NetworkSettings']['IPAddress']
        return {'ip_address': ip_address}
    except Exception as e:
        return {'error': str(e)}

@app.post('/exe/{container_id}/{command}')
async def execute_command(container_id: str, command: str):
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
async def execute_nested_command(outer_container_id: str, inner_container_id: str, command: str):
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
    
@app.post("/containermain/{id}")
async def create_container_main(id: str):
    containers = {container.name: container for container in client.containers.list(all=True)}
    if id in containers:
        return {"message": f"Container {id} already exists"}
    container = client.containers.run("nexeum/containex", "sh", detach=True, tty=True, name=id, privileged=True)
    exec_output = restart_docker_service(container)
    return {"message": exec_output, "exec_output": exec_output}

@app.get("/containers/{container_id}/ps")
async def list_containers(container_id: str):
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
async def get_containers():
    try:
        output = subprocess.check_output(["docker", "ps", "-a", "--format", "{{json .}}"])
        containers = [json.loads(line) for line in output.splitlines()]
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
async def get_container_metrics(id: str):
    try:
        output = subprocess.check_output(["docker", "stats", id, "--no-stream", "--format", "{{json .}}"])
        metrics = json.loads(output)
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail={'error': 'Failed to get container metrics', 'message': str(e)})
    
@app.get("/container/{container_id}/{name}/{image}/{shell}")
async def create_container(container_id: str, name: str, image: str, shell: str):
    container = client.containers.get(container_id)
    exec_id = container.exec_run(f"sh -c 'docker run -dit --privileged --name {name} {image} {shell}'", privileged=True)
    return {"output": exec_id.output.decode("utf-8")}

@app.get("/container/{id}/aprox")
async def read_metrics(id: str):
    try:
        container = client.containers.get(id)
        ports = container.attrs['NetworkSettings']['Ports']
        if not ports:
            ip = get_container_ip(id)
        else:
            port_mapping = next(iter(ports.values()))[0]
            port = port_mapping['HostPort']
            ip = f"10.8.8.247:{port}"
        average_response_time = get_average_response_time(ip)
        qps = get_qps(ip)

        return {
            "averageResponseTime": average_response_time,
            "qps": qps
        }
    except Exception as e:
        return {"error": str(e)}
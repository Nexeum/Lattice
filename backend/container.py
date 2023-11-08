import subprocess
import json
from fastapi import FastAPI, HTTPException
from starlette.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, WebSocket
import docker
import requests
import time

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

def get_average_response_time(ip):
    response_times = []
    for _ in range(100):
        start_time = time.time()
        response = requests.get(f'http://{ip}/get')
        response_time = time.time() - start_time
        response_times.append(response_time)

    average_response_time = sum(response_times) / len(response_times)
    return average_response_time

def get_qps(ip):
    num_requests = 100
    start_time = time.time()

    for _ in range(num_requests):
        response = requests.get(f'http://{ip}/get')

    end_time = time.time()
    elapsed_time = end_time - start_time

    qps = num_requests / elapsed_time
    return qps

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
        if container_info:
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
        ip = get_container_ip(id)
        average_response_time = await get_average_response_time(ip)
        qps = await get_qps(ip)

        return {
            "averageResponseTime": average_response_time,
            "qps": qps
        }
    except Exception as e:
        return {"error": str(e)}
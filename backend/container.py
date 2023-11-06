import subprocess
import json
from fastapi import FastAPI, HTTPException
from starlette.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, WebSocket
import docker

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

@app.post("/containermain/{id}")
async def create_container(id: str):
    containers = {container.name: container for container in client.containers.list(all=True)}
    if id in containers:
        exec_output = restart_docker_service(containers[id])
        return {"message": f"Container {id} already exists", "exec_output": exec_output}
    container = client.containers.run("nexeum/containex", "sh", detach=True, tty=True, name=id, privileged=True)
    exec_output = restart_docker_service(container)
    return {"message": exec_output, "exec_output": exec_output}

@app.get("/containers/{container_id}/ps")
async def list_containers(container_id: str):
    container = client.containers.get(container_id)
    exec_id = container.exec_run("sh -c 'docker ps -a'", privileged=True)
    return {"output": exec_id.output.decode("utf-8")}

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
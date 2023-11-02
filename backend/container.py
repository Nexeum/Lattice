import subprocess
import json
from flask import Flask, jsonify, request
from flask_cors import CORS, cross_origin

app = Flask(__name__)
CORS(app)

@app.route('/containers', methods=['GET'])
@cross_origin()
def get_containers():
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

        return jsonify(modified_containers)
    except Exception as e:
        return jsonify({'error': 'Failed to get containers', 'message': str(e)}), 500
    
@app.route('/container/<id>/metrics', methods=['GET'])
@cross_origin()
def get_container_metrics(id):
    try:
        output = subprocess.check_output(["docker", "stats", id, "--no-stream", "--format", "{{json .}}"])
        metrics = json.loads(output)
        return jsonify(metrics)
    except Exception as e:
        return jsonify({'error': 'Failed to get container metrics', 'message': str(e)}), 500

if __name__ == "__main__":
    app.run(host='127.0.0.1', port=5001, debug=True)
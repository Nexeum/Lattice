#!/usr/bin/env bash

function start_uvicorn() {
  local work_dir="$1"
  local app_name="$2"
  local port="$3"

  osascript -e "tell app \"Terminal\" 
      do script \"cd \\\"$work_dir\\\" && uvicorn $app_name:app --reload --log-level debug --port $port\"
  end tell"

  if [[ $? -ne 0 ]]; then
    echo "Failed to start Uvicorn instance in $work_dir with app $app_name on port $port"
    exit 1
  fi
}

# Configurations
declare -a configs=(
  "$(pwd) app 5000"
  "$(pwd) container 5001"
  "$(pwd) room 5002"
  "$(pwd) package 5003"
  "$(pwd) tars 5004"
)

# Start Uvicorn instances
for config in "${configs[@]}"; do
  start_uvicorn $config
done

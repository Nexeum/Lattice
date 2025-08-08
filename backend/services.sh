#!/bin/bash

# Función para ejecutar cada servicio en una nueva pestaña de Terminal
run_service() {
    local title=$1
    local port=$2
    local module=$3
    
    osascript -e "
        tell application \"Terminal\"
            do script \"cd '$(pwd)' && source venv/bin/activate && echo 'Starting $title on port $port' && uvicorn $module:app --reload --log-level debug --port $port\"
        end tell
    "
}

# Ejecutar cada servicio
run_service "App" 5000 "app"
run_service "Container" 5001 "container" 
run_service "Room" 5002 "room"
run_service "Package" 5003 "package"
run_service "Tars" 5004 "tars"

echo "Todos los servicios iniciados en pestañas separadas"
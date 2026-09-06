# Lattice

Local Docker orchestration platform. Manage workspaces backed by Docker-in-Docker containers, spawn nested containers inside them, install plugins into any level of the hierarchy, run per-plugin CI pipelines, and explore the whole thing through a live network topology — all from a web dashboard.

## Features

- **Workspaces (rooms):** each workspace auto-provisions its own Docker-in-Docker parent container (`docker:dind`). Nodes (children) are created inside it, and DinD children can host their own containers.
- **Terminal:** xterm.js shell that executes inside the workspace parent or any selected child (Docker-in-Docker exec).
- **Plugins:** GitHub-style plugin registry backed by MongoDB + GridFS — file browser, README rendering, stars, uploads.
- **CI pipelines:** GitHub-Actions-style runs per plugin. Each run executes the plugin's steps (`lattice-ci.json`, or `install.sh` / `test.sh` by convention) inside an ephemeral container, with per-step status and logs. Uploads trigger runs automatically.
- **Plugin installs:** install a plugin's files into the workspace parent or any nested child (`/opt/lattice/plugins/<name>`, running `install.sh` when present).
- **Network topology:** React Flow map of workspaces, containers and Docker networks.
- **Live metrics:** CPU, memory, network and block I/O per container (`docker stats`), plus host health.

## Architecture

| Service | Port | Purpose |
|---------|------|---------|
| `backend/app.py` | 5005 | Auth (JWT), users (MongoDB) |
| `backend/container.py` | 5001 | Docker engine API: containers, DinD nodes, exec, metrics, topology, plugin installs, CI runs |
| `backend/room.py` | 5002 | Workspaces CRUD (MongoDB) |
| `backend/package.py` | 5003 | Plugin registry (MongoDB + GridFS) |
| `frontend/` | 3000 | React dashboard (CRA + Tailwind) |

> Port 5000 is intentionally avoided: macOS AirPlay Receiver occupies it.

## Requirements

- Docker (Docker Desktop, colima, etc.)
- Python 3.11+
- Node.js 18+
- MongoDB on `localhost:27017` (e.g. `docker run -d --name lattice-mongo -p 27017:27017 mongo:7`)

## Getting started

```bash
# Backend
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./orquestador.sh          # or start each uvicorn service manually

# Frontend
cd frontend
npm install
npm start                 # http://localhost:3000
```

Register a user from the UI and sign in. Every backend service exposes Swagger docs at `/docs` (e.g. http://localhost:5001/docs).

## CLI

`bin/lattice` is a small bash client for the local APIs:

```bash
export PATH="$PWD/bin:$PATH"

lattice login you@example.com
lattice create my-plugin --version 1.0.0
lattice push <package_id>              # uploads the current directory's files
lattice install <package_id> <container_id>
lattice exec <container_id> ls -la
```

## CI pipeline definition

A plugin's pipeline is resolved in this order:

1. `lattice-ci.json` — `[{"name": "Build", "run": "sh build.sh"}, ...]`
2. Conventions: `install.sh` → Install step, `test.sh` → Test step
3. Fallback: a file validation step

Runs execute in a disposable `alpine:3.19` container with the plugin files mounted at `/work/<plugin>`.

from fastapi import FastAPI, HTTPException, Depends, Header
from typing import List
from datetime import datetime, timezone
from pymongo import MongoClient
from bson.objectid import ObjectId
from bson.errors import InvalidId
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
import gridfs
from gridfs.errors import NoFile
import io
import json
import os
import tarfile
import requests

from auth_shared import MONGO_URL, cors_origins, require_user, require_user_query

CONTAINERS_SERVICE_URL = os.environ.get("LATTICE_CONTAINERS_URL", "http://localhost:5001")

# Instantiation of FastAPI
app = FastAPI()

# Settings CORS (Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = MongoClient(MONGO_URL)
db = client['kubehub']
collection = db['package']
changesets = db['changesets']
releases = db['releases']
users_collection = client['lattice_db']['user']
fs = gridfs.GridFS(db)

def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()

def can_write(package, user):
    """Write access: legacy packages (no owner) are open; otherwise the owner,
    any collaborator, or an admin."""
    owner = package.get("owner")
    if not owner:
        return True
    if user.get("role") == "admin":
        return True
    return user["user_id"] == owner or user["user_id"] in package.get("collaborators", [])

def require_owner_or_admin(package, user):
    if user.get("role") == "admin":
        return
    if package.get("owner") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the owner or an admin can manage collaborators")

def find_package_or_404(package_id: str):
    try:
        package = collection.find_one({"_id": ObjectId(package_id)})
    except InvalidId:
        package = None
    if package is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return package

def resolve_user_email(user_id: str):
    """Best-effort lookup of a user's email in the identity database."""
    user_doc = None
    try:
        user_doc = users_collection.find_one({"_id": ObjectId(user_id)})
    except (InvalidId, TypeError):
        pass
    if user_doc is None:
        user_doc = users_collection.find_one({"_id": user_id})
    return user_doc.get("email") if user_doc else None

def collaborator_list(package):
    return [
        {"id": user_id, "email": resolve_user_email(user_id)}
        for user_id in package.get("collaborators", [])
    ]

def trigger_ci_push(package_id: str, authorization: str):
    """Fire the CI pipeline (push trigger); never fail the caller if CI is down."""
    try:
        requests.post(
            f"{CONTAINERS_SERVICE_URL}/ci/{package_id}/run",
            params={"trigger": "push"},
            headers={"Authorization": authorization},
            timeout=5,
        )
    except Exception:
        pass

def namespaced_filename(package_id: str, name: str):
    return f"{package_id}:{name}"

def load_file_content(package_id: str, name: str):
    """Reads the latest version of a file, trying the namespaced filename first
    and falling back to the plain (legacy) filename."""
    try:
        grid_out = fs.get_last_version(filename=namespaced_filename(package_id, name))
    except NoFile:
        grid_out = fs.get_last_version(filename=name)
    return grid_out.read().decode('utf-8')

def serialize_package_with_files(package):
    package["_id"] = str(package["_id"])
    for file in package["files"]:
        try:
            file["content"] = load_file_content(package["_id"], file["name"])
        except NoFile:
            raise HTTPException(status_code=404, detail=f"File {file['name']} not found")
    return package

def find_file_versions(package_id: str, name: str):
    """All GridFS versions of a file (legacy plain name + namespaced), oldest first."""
    versions = list(fs.find({"filename": name}).sort("uploadDate", 1))
    versions += list(fs.find({"filename": namespaced_filename(package_id, name)}).sort("uploadDate", 1))
    versions.sort(key=lambda grid_out: grid_out.upload_date)
    return versions

@app.get("/packages")
async def get_packages(user=Depends(require_user)):
    packages = list(collection.find())
    for package in packages:
        package["_id"] = str(package["_id"])
    return packages

@app.post("/packages")
async def create_package(package: dict, user=Depends(require_user)):
    package["stars"] = 0
    package["language"] = package.get("language", "Not Recognized")
    package["files"] = []
    package["owner"] = user["user_id"]
    result = collection.insert_one(package)
    package["_id"] = str(result.inserted_id)
    return package

@app.get("/packages/{package_id}")
async def get_package(package_id: str, user=Depends(require_user)):
    package = collection.find_one({"_id": ObjectId(package_id)})
    if package is not None:
        return serialize_package_with_files(package)
    else:
        raise HTTPException(status_code=404, detail="Package not found")

@app.put("/packages/{package_id}")
async def update_package(package_id: str, package: dict, user=Depends(require_user)):
    existing_package = find_package_or_404(package_id)
    if not can_write(existing_package, user):
        raise HTTPException(status_code=403, detail="You do not have write access to this plugin")
    collection.update_one({"_id": ObjectId(package_id)}, {"$set": package})
    updated_package = collection.find_one({"_id": ObjectId(package_id)})
    if updated_package is not None:
        updated_package["_id"] = str(updated_package["_id"])
        return updated_package
    else:
        raise HTTPException(status_code=404, detail="Package not found")

@app.delete("/packages/{package_id}")
async def delete_package(package_id: str, user=Depends(require_user)):
    package = collection.find_one({"_id": ObjectId(package_id)})
    if package is not None:
        owner = package.get("owner")
        if owner and owner != user["user_id"] and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only the owner can delete this plugin")
    collection.delete_one({"_id": ObjectId(package_id)})
    return {"message": "Package deleted successfully"}

@app.post("/packages/{package_id}/files")
async def upload_file_to_package(package_id: str, file: UploadFile = File(...),
                                 user=Depends(require_user), authorization: str = Header(None)):
    package = collection.find_one({"_id": ObjectId(package_id)})
    if package is None:
        raise HTTPException(status_code=404, detail="Package not found")

    contents = await file.read()

    if not can_write(package, user):
        # Outside contributor: capture the file as a changeset ("pull request")
        # instead of writing to the package.
        changeset_id = upsert_pending_changeset(package_id, user, file.filename, contents)
        return JSONResponse(
            status_code=202,
            content={
                "changeset_id": changeset_id,
                "status": "pending",
                "message": "Contribution submitted for review",
            },
        )

    # Store the file content in GridFS under a package-namespaced filename
    fs.put(contents, filename=namespaced_filename(package_id, file.filename))

    file_info = {"name": file.filename, "size": len(contents)}
    if any(f.get("name") == file.filename for f in package.get("files", [])):
        collection.update_one(
            {"_id": ObjectId(package_id), "files.name": file.filename},
            {"$set": {"files.$.size": len(contents)}},
        )
    else:
        collection.update_one({"_id": ObjectId(package_id)}, {"$push": {"files": file_info}})

    # Fire the CI pipeline (push trigger); never fail the upload if CI is down
    trigger_ci_push(package_id, authorization)

    return {"message": "File uploaded successfully"}

@app.get("/packages/{package_id}/files/{name}/versions")
async def get_file_versions(package_id: str, name: str, user=Depends(require_user)):
    package = collection.find_one({"_id": ObjectId(package_id)})
    if package is None:
        raise HTTPException(status_code=404, detail="Package not found")

    versions = find_file_versions(package_id, name)
    return [
        {
            "id": str(grid_out._id),
            "version": index,
            "uploadDate": grid_out.upload_date.isoformat(),
            "length": grid_out.length,
        }
        for index, grid_out in enumerate(versions)
    ]

@app.get("/packages/{package_id}/files/{name}/versions/{version_id}")
async def get_file_version(package_id: str, name: str, version_id: str, user=Depends(require_user)):
    try:
        grid_out = fs.get(ObjectId(version_id))
    except (NoFile, InvalidId):
        raise HTTPException(status_code=404, detail="Version not found")

    return {
        "name": name,
        "content": grid_out.read().decode('utf-8', errors="replace"),
        "uploadDate": grid_out.upload_date.isoformat(),
    }

@app.post("/packages/{package_id}/files/{name}/rollback/{version_id}")
async def rollback_file_version(package_id: str, name: str, version_id: str, user=Depends(require_user)):
    package = collection.find_one({"_id": ObjectId(package_id)})
    if package is None:
        raise HTTPException(status_code=404, detail="Package not found")

    if not can_write(package, user):
        raise HTTPException(status_code=403, detail="You do not have write access to this plugin")

    try:
        grid_out = fs.get(ObjectId(version_id))
    except (NoFile, InvalidId):
        raise HTTPException(status_code=404, detail="Version not found")

    contents = grid_out.read()

    # Append-only history: the rolled-back content becomes a new namespaced version
    fs.put(contents, filename=namespaced_filename(package_id, name))

    if not any(file["name"] == name for file in package["files"]):
        file_info = {"name": name, "size": len(contents)}
        collection.update_one({"_id": ObjectId(package_id)}, {"$push": {"files": file_info}})

    updated_package = collection.find_one({"_id": ObjectId(package_id)})
    return serialize_package_with_files(updated_package)

# ---------------------------------------------------------------------------
# Collaborators
# ---------------------------------------------------------------------------

@app.get("/packages/{package_id}/collaborators")
async def get_collaborators(package_id: str, user=Depends(require_user)):
    # Read-only visibility for everyone; mutations stay owner/admin-gated.
    package = find_package_or_404(package_id)
    return collaborator_list(package)

@app.post("/packages/{package_id}/collaborators")
async def add_collaborator(package_id: str, body: dict, user=Depends(require_user)):
    package = find_package_or_404(package_id)
    require_owner_or_admin(package, user)

    email = (body.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user_doc = users_collection.find_one({"email": email})
    if user_doc is None:
        raise HTTPException(status_code=404, detail="No user found with that email")

    collaborator_id = str(user_doc["_id"])
    collection.update_one(
        {"_id": ObjectId(package_id)},
        {"$addToSet": {"collaborators": collaborator_id}},
    )
    updated_package = collection.find_one({"_id": ObjectId(package_id)})
    return collaborator_list(updated_package)

@app.delete("/packages/{package_id}/collaborators/{collaborator_id}")
async def remove_collaborator(package_id: str, collaborator_id: str, user=Depends(require_user)):
    package = find_package_or_404(package_id)
    require_owner_or_admin(package, user)

    collection.update_one(
        {"_id": ObjectId(package_id)},
        {"$pull": {"collaborators": collaborator_id}},
    )
    updated_package = collection.find_one({"_id": ObjectId(package_id)})
    return collaborator_list(updated_package)

# ---------------------------------------------------------------------------
# Changesets (plugin "pull requests")
# ---------------------------------------------------------------------------

def upsert_pending_changeset(package_id: str, user, filename: str, contents: bytes):
    """One pending changeset per (package, author): upsert the file into it."""
    now = utc_now_iso()
    file_entry = {"name": filename, "content": contents.decode("utf-8", errors="replace")}

    existing = changesets.find_one(
        {"package_id": package_id, "author": user["user_id"], "status": "pending"}
    )
    if existing is not None:
        files = [entry for entry in existing["files"] if entry["name"] != filename]
        files.append(file_entry)
        changesets.update_one(
            {"_id": existing["_id"]},
            {"$set": {"files": files, "updated_at": now}},
        )
        return str(existing["_id"])

    changeset = {
        "package_id": package_id,
        "author": user["user_id"],
        "author_email": resolve_user_email(user["user_id"]),
        "files": [file_entry],
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    result = changesets.insert_one(changeset)
    return str(result.inserted_id)

def find_changeset_or_404(package_id: str, changeset_id: str):
    try:
        changeset = changesets.find_one({"_id": ObjectId(changeset_id), "package_id": package_id})
    except InvalidId:
        changeset = None
    if changeset is None:
        raise HTTPException(status_code=404, detail="Changeset not found")
    return changeset

@app.get("/packages/{package_id}/changesets")
async def get_changesets(package_id: str, user=Depends(require_user)):
    find_package_or_404(package_id)
    docs = list(changesets.find({"package_id": package_id}))
    docs.sort(key=lambda doc: doc.get("created_at", ""), reverse=True)
    docs.sort(key=lambda doc: 0 if doc.get("status") == "pending" else 1)
    return [
        {
            "_id": str(doc["_id"]),
            "author": doc.get("author"),
            "author_email": doc.get("author_email"),
            "status": doc.get("status"),
            "files": [entry["name"] for entry in doc.get("files", [])],
            "created_at": doc.get("created_at"),
        }
        for doc in docs[:50]
    ]

@app.get("/packages/{package_id}/changesets/{changeset_id}")
async def get_changeset(package_id: str, changeset_id: str, user=Depends(require_user)):
    find_package_or_404(package_id)
    changeset = find_changeset_or_404(package_id, changeset_id)
    changeset["_id"] = str(changeset["_id"])
    return changeset

@app.post("/packages/{package_id}/changesets/{changeset_id}/approve")
async def approve_changeset(package_id: str, changeset_id: str,
                            user=Depends(require_user), authorization: str = Header(None)):
    package = find_package_or_404(package_id)
    if not can_write(package, user):
        raise HTTPException(status_code=403, detail="You do not have write access to this plugin")

    changeset = find_changeset_or_404(package_id, changeset_id)
    if changeset.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Changeset is not pending")

    # Apply each file exactly like a normal upload
    for entry in changeset.get("files", []):
        contents = entry["content"].encode("utf-8")
        fs.put(contents, filename=namespaced_filename(package_id, entry["name"]))
        if any(file["name"] == entry["name"] for file in package.get("files", [])):
            collection.update_one(
                {"_id": ObjectId(package_id), "files.name": entry["name"]},
                {"$set": {"files.$.size": len(contents)}},
            )
        else:
            file_info = {"name": entry["name"], "size": len(contents)}
            collection.update_one({"_id": ObjectId(package_id)}, {"$push": {"files": file_info}})

    changesets.update_one(
        {"_id": changeset["_id"]},
        {"$set": {"status": "approved", "approved_by": user["user_id"], "updated_at": utc_now_iso()}},
    )

    # One CI push trigger for the whole changeset
    trigger_ci_push(package_id, authorization)

    return {"message": "Changeset approved", "changeset_id": changeset_id, "status": "approved"}

@app.post("/packages/{package_id}/changesets/{changeset_id}/reject")
async def reject_changeset(package_id: str, changeset_id: str, user=Depends(require_user)):
    package = find_package_or_404(package_id)
    changeset = find_changeset_or_404(package_id, changeset_id)

    # Reviewers may reject; authors may withdraw their own
    if not can_write(package, user) and changeset.get("author") != user["user_id"]:
        raise HTTPException(status_code=403, detail="You cannot reject this changeset")

    if changeset.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Changeset is not pending")

    changesets.update_one(
        {"_id": changeset["_id"]},
        {"$set": {"status": "rejected", "rejected_by": user["user_id"], "updated_at": utc_now_iso()}},
    )
    return {"message": "Changeset rejected", "changeset_id": changeset_id, "status": "rejected"}

# ---------------------------------------------------------------------------
# Releases
# ---------------------------------------------------------------------------

@app.post("/packages/{package_id}/releases")
async def create_release(package_id: str, body: dict, user=Depends(require_user)):
    package = find_package_or_404(package_id)
    if not can_write(package, user):
        raise HTTPException(status_code=403, detail="You do not have write access to this plugin")

    version = (body.get("version") or "").strip()
    if not version:
        raise HTTPException(status_code=400, detail="Version is required")
    if releases.find_one({"package_id": package_id, "version": version}) is not None:
        raise HTTPException(status_code=400, detail=f"Release {version} already exists for this package")

    # Snapshot the current file contents
    snapshot = []
    for file in package.get("files", []):
        try:
            content = load_file_content(package_id, file["name"])
        except NoFile:
            raise HTTPException(status_code=404, detail=f"File {file['name']} not found")
        snapshot.append({"name": file["name"], "content": content})

    release = {
        "package_id": package_id,
        "version": version,
        "notes": body.get("notes", ""),
        "files": snapshot,
        "created_by": user["user_id"],
        "created_at": utc_now_iso(),
    }
    result = releases.insert_one(release)
    release["_id"] = str(result.inserted_id)
    return release

@app.get("/packages/{package_id}/releases")
async def get_releases(package_id: str, user=Depends(require_user)):
    find_package_or_404(package_id)
    docs = list(releases.find({"package_id": package_id}))
    docs.sort(key=lambda doc: doc.get("created_at", ""), reverse=True)
    return [
        {
            "_id": str(doc["_id"]),
            "version": doc.get("version"),
            "notes": doc.get("notes"),
            "files": [entry["name"] for entry in doc.get("files", [])],
            "created_at": doc.get("created_at"),
        }
        for doc in docs
    ]

@app.get("/packages/{package_id}/releases/{release_id}/download")
async def download_release(package_id: str, release_id: str, user=Depends(require_user_query)):
    package = find_package_or_404(package_id)
    try:
        release = releases.find_one({"_id": ObjectId(release_id), "package_id": package_id})
    except InvalidId:
        release = None
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")

    # Build an in-memory tar.gz of the snapshot files
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for entry in release.get("files", []):
            data = entry["content"].encode("utf-8")
            info = tarfile.TarInfo(name=entry["name"])
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    buffer.seek(0)

    filename = f"{package.get('name', 'package')}-{release['version']}.tar.gz"
    return StreamingResponse(
        buffer,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

# ---------------------------------------------------------------------------
# Catalog (curated one-click templates)
# ---------------------------------------------------------------------------
# Pure data. Every image runs with zero env/config; shell values (none used)
# must be a single token because the deployer appends them to `docker run`.

CATALOG = [
    {
        "key": "web-nginx",
        "name": "Nginx Web Server",
        "description": "Two nginx replicas with an HTTP health probe, restarted automatically.",
        "icon": "\U0001F310",  # globe
        "category": "Web",
        "kind": "stack",
        "files": {
            "stack.json": json.dumps({
                "services": [
                    {
                        "name": "web",
                        "image": "nginx:alpine",
                        "replicas": 2,
                        "restart": "always",
                        "probe": {"type": "http", "port": 80, "path": "/"},
                    }
                ]
            }, indent=2),
            "README.md": (
                "# Nginx Web Server\n\n"
                "Deploys 2 replicas of `nginx:alpine` with `restart: always`.\n\n"
                "Each replica has an HTTP health probe on port 80 (`/`), so the\n"
                "reconciler will replace any replica that stops answering.\n"
            ),
        },
    },
    {
        "key": "redis-cache",
        "name": "Redis Cache",
        "description": "A single Redis instance with a TCP health probe on port 6379.",
        "icon": "⚡",  # high voltage
        "category": "Databases",
        "kind": "stack",
        "files": {
            "stack.json": json.dumps({
                "services": [
                    {
                        "name": "redis",
                        "image": "redis:alpine",
                        "replicas": 1,
                        "restart": "always",
                        "probe": {"type": "tcp", "port": 6379},
                    }
                ]
            }, indent=2),
            "README.md": (
                "# Redis Cache\n\n"
                "Deploys 1 replica of `redis:alpine` with `restart: always`.\n\n"
                "A TCP health probe on port 6379 keeps the instance monitored;\n"
                "Redis runs with its default config and needs no environment.\n"
            ),
        },
    },
    {
        "key": "uptime-kuma",
        "name": "Uptime Kuma",
        "description": "Self-hosted uptime monitoring dashboard, running out of the box.",
        "icon": "\U0001F4C8",  # chart increasing
        "category": "Monitoring",
        "kind": "stack",
        "files": {
            "stack.json": json.dumps({
                "services": [
                    {
                        "name": "kuma",
                        "image": "louislam/uptime-kuma:1",
                        "replicas": 1,
                        "restart": "always",
                    }
                ]
            }, indent=2),
            "README.md": (
                "# Uptime Kuma\n\n"
                "Deploys 1 replica of `louislam/uptime-kuma:1` with `restart: always`.\n\n"
                "Uptime Kuma is a self-hosted monitoring tool with a web UI on\n"
                "port 3001. It requires no environment variables to start.\n"
            ),
        },
    },
    {
        "key": "httpd-static",
        "name": "Apache httpd",
        "description": "Apache httpd serving its default static site.",
        "icon": "\U0001F4C4",  # page facing up
        "category": "Web",
        "kind": "stack",
        "files": {
            "stack.json": json.dumps({
                "services": [
                    {
                        "name": "httpd",
                        "image": "httpd:alpine",
                        "replicas": 1,
                        "restart": "always",
                    }
                ]
            }, indent=2),
            "README.md": (
                "# Apache httpd\n\n"
                "Deploys 1 replica of `httpd:alpine` with `restart: always`.\n\n"
                "Serves the default \"It works!\" page on port 80 with zero\n"
                "configuration.\n"
            ),
        },
    },
    {
        "key": "whoami-lb",
        "name": "Whoami Load Balancer Demo",
        "description": "Three whoami replicas with CPU autoscaling (2-5) - the reconciler demo.",
        "icon": "\U0001F500",  # shuffle
        "category": "Demos",
        "kind": "stack",
        "files": {
            "stack.json": json.dumps({
                "services": [
                    {
                        "name": "whoami",
                        "image": "traefik/whoami:latest",
                        "replicas": 3,
                        "restart": "always",
                        "autoscale": {"min": 2, "max": 5, "targetCPU": 70},
                    }
                ]
            }, indent=2),
            "README.md": (
                "# Whoami Load Balancer Demo\n\n"
                "Deploys 3 replicas of `traefik/whoami:latest`, each answering HTTP\n"
                "on port 80 with its own container identity.\n\n"
                "The service declares `autoscale: {min: 2, max: 5, targetCPU: 70}`,\n"
                "so the reconciler will scale the replica count between 2 and 5\n"
                "based on CPU usage - a live demo of autoscaling.\n"
            ),
        },
    },
    {
        "key": "postgres-adminer",
        "name": "Postgres + Adminer",
        "description": "PostgreSQL 16 with a persistent volume plus the Adminer web UI.",
        "icon": "\U0001F418",  # elephant
        "category": "Databases",
        "kind": "stack",
        "files": {
            "stack.json": json.dumps({
                "services": [
                    {
                        "name": "db",
                        "image": "postgres:16-alpine",
                        "replicas": 1,
                        "restart": "always",
                        "env": {
                            "POSTGRES_PASSWORD": "lattice",
                            "POSTGRES_USER": "lattice",
                            "POSTGRES_DB": "app",
                        },
                        "volumes": ["pgdata:/var/lib/postgresql/data"],
                        "probe": {"type": "tcp", "port": 5432},
                    },
                    {
                        "name": "adminer",
                        "image": "adminer:latest",
                        "replicas": 1,
                        "restart": "always",
                    },
                ]
            }, indent=2),
            "README.md": (
                "# Postgres + Adminer\n\n"
                "Deploys `postgres:16-alpine` with a persistent `pgdata` volume and\n"
                "the `adminer:latest` web database client.\n\n"
                "Default credentials: user `lattice`, password `lattice`, database `app`.\n"
                "Expose the `adminer` service on port `8080` to reach the UI, then log\n"
                "in against the `db` container. Edit `stack.json` to swap the plaintext\n"
                "password for a `${SECRET_KEY}` reference once you have a secret.\n"
            ),
        },
    },
    {
        "key": "wordpress",
        "name": "WordPress + MariaDB",
        "description": "WordPress backed by MariaDB 11 with a persistent database volume.",
        "icon": "\U0001F4DD",  # memo
        "category": "Web",
        "kind": "stack",
        "files": {
            "stack.json": json.dumps({
                "services": [
                    {
                        "name": "db",
                        "image": "mariadb:11",
                        "replicas": 1,
                        "restart": "always",
                        "env": {
                            "MARIADB_ROOT_PASSWORD": "lattice",
                            "MARIADB_DATABASE": "wordpress",
                            "MARIADB_USER": "wp",
                            "MARIADB_PASSWORD": "wp",
                        },
                        "volumes": ["wpdb:/var/lib/mysql"],
                    },
                    {
                        "name": "wordpress",
                        "image": "wordpress:latest",
                        "replicas": 1,
                        "restart": "always",
                        "env": {
                            "WORDPRESS_DB_HOST": "db",
                            "WORDPRESS_DB_USER": "wp",
                            "WORDPRESS_DB_PASSWORD": "wp",
                            "WORDPRESS_DB_NAME": "wordpress",
                        },
                    },
                ]
            }, indent=2),
            "README.md": (
                "# WordPress + MariaDB\n\n"
                "Deploys `wordpress:latest` backed by `mariadb:11` with a persistent\n"
                "`wpdb` volume. Default DB credentials: user `wp`, password `wp`,\n"
                "database `wordpress` (root password `lattice`).\n\n"
                "Expose the `wordpress` service on port `80` to run the installer.\n\n"
                "Caveat: the template sets `WORDPRESS_DB_HOST=db`, assuming the\n"
                "containers resolve each other by name. On the parent's default bridge\n"
                "network, name-based DNS between children is not guaranteed - if\n"
                "WordPress cannot reach the database, look up the `db` container's IP\n"
                "and set `WORDPRESS_DB_HOST` to that address instead.\n"
            ),
        },
    },
    {
        "key": "minio",
        "name": "MinIO Object Storage",
        "description": "S3-compatible object storage (Bitnami MinIO) with a persistent volume.",
        "icon": "\U0001FAA3",  # bucket
        "category": "Storage",
        "kind": "stack",
        "files": {
            "stack.json": json.dumps({
                "services": [
                    {
                        "name": "minio",
                        "image": "bitnami/minio:latest",
                        "replicas": 1,
                        "restart": "always",
                        "env": {
                            "MINIO_ROOT_USER": "lattice",
                            "MINIO_ROOT_PASSWORD": "lattice123",
                        },
                        "volumes": ["miniodata:/bitnami/minio/data"],
                    }
                ]
            }, indent=2),
            "README.md": (
                "# MinIO Object Storage\n\n"
                "Deploys `bitnami/minio:latest` (starts with no custom command) with a\n"
                "persistent `miniodata` volume. It is S3-compatible object storage.\n\n"
                "Default credentials: root user `lattice`, root password `lattice123`.\n"
                "Expose the console on port `9001` (the S3 API listens on `9000`).\n"
                "Swap the password for a `${SECRET_KEY}` reference for real use.\n"
            ),
        },
    },
    {
        "key": "grafana",
        "name": "Grafana",
        "description": "Grafana OSS dashboards with a persistent data volume.",
        "icon": "\U0001F4CA",  # bar chart
        "category": "Monitoring",
        "kind": "stack",
        "files": {
            "stack.json": json.dumps({
                "services": [
                    {
                        "name": "grafana",
                        "image": "grafana/grafana-oss:latest",
                        "replicas": 1,
                        "restart": "always",
                        "env": {
                            "GF_SECURITY_ADMIN_USER": "admin",
                            "GF_SECURITY_ADMIN_PASSWORD": "lattice",
                        },
                        "volumes": ["grafana:/var/lib/grafana"],
                    }
                ]
            }, indent=2),
            "README.md": (
                "# Grafana\n\n"
                "Deploys `grafana/grafana-oss:latest` with a persistent `grafana`\n"
                "volume for dashboards and settings.\n\n"
                "Default credentials: user `admin`, password `lattice`.\n"
                "Expose the `grafana` service on port `3000` to open the UI, then add\n"
                "your data sources. Move the admin password to a `${SECRET_KEY}` ref\n"
                "for production.\n"
            ),
        },
    },
    {
        "key": "docker-101",
        "name": "Docker 101",
        "description": "A guided hands-on lab: run, inspect and remove your first container.",
        "icon": "\U0001F393",  # graduation cap
        "category": "Learning",
        "kind": "lab",
        "files": {
            "lab.json": json.dumps({
                "title": "Docker 101",
                "steps": [
                    {
                        "title": "Run your first container",
                        "instructions": "Open the Terminal and run:\n\n    docker run -d --name hello nginx:alpine\n",
                        "check": "docker ps --format '{{.Names}}' | grep -q '^hello$'",
                    },
                    {
                        "title": "Inspect it",
                        "instructions": "Find its IP:\n\n    docker inspect hello\n",
                        "check": "docker inspect hello >/dev/null 2>&1",
                    },
                    {
                        "title": "Clean up",
                        "instructions": "Remove it:\n\n    docker rm -f hello\n",
                        "check": "! docker ps -a --format '{{.Names}}' | grep -q '^hello$'",
                    },
                ],
            }, indent=2),
            "README.md": (
                "# Docker 101 (Lab)\n\n"
                "A three-step guided lab that teaches the basic container\n"
                "lifecycle:\n\n"
                "1. **Run your first container** - start an nginx container named `hello`.\n"
                "2. **Inspect it** - use `docker inspect` to look at its details.\n"
                "3. **Clean up** - remove the container with `docker rm -f`.\n\n"
                "Each step has an automatic check command that verifies your work\n"
                "before letting you move on.\n"
            ),
        },
    },
]

CATALOG_BY_KEY = {entry["key"]: entry for entry in CATALOG}

def catalog_entry_summary(entry):
    """Public view of a catalog entry: no file contents, plus a small preview
    (services for stacks, step count for labs) parsed from the entry itself."""
    summary = {
        "key": entry["key"],
        "name": entry["name"],
        "description": entry["description"],
        "icon": entry["icon"],
        "category": entry["category"],
        "kind": entry["kind"],
    }
    if entry["kind"] == "stack":
        parsed = json.loads(entry["files"]["stack.json"])
        summary["services"] = [
            {
                "name": service.get("name"),
                "image": service.get("image"),
                "replicas": service.get("replicas", 1),
            }
            for service in parsed.get("services", [])
        ]
    else:
        parsed = json.loads(entry["files"]["lab.json"])
        summary["steps"] = len(parsed.get("steps", []))
    return summary

@app.get("/catalog")
async def get_catalog(user=Depends(require_user)):
    return [catalog_entry_summary(entry) for entry in CATALOG]

@app.post("/catalog/{key}/install")
async def install_catalog_entry(key: str, user=Depends(require_user)):
    entry = CATALOG_BY_KEY.get(key)
    if entry is None:
        raise HTTPException(status_code=404, detail="Catalog entry not found")

    if collection.find_one({"name": entry["name"]}) is not None:
        raise HTTPException(status_code=409, detail="Already installed")

    package = {
        "name": entry["name"],
        "description": entry["description"],
        "icon": entry["icon"],
        "category": entry["category"],
        "owner": user["user_id"],
        "official": True,
        "tags": ["official", entry["kind"]],
        "version": "1.0.0",
        "stars": 0,
        "files": [],
    }
    result = collection.insert_one(package)
    package_id = str(result.inserted_id)

    # Store files exactly like uploads (namespaced GridFS), but without CI.
    file_infos = []
    for name, content in entry["files"].items():
        data = content.encode("utf-8")
        fs.put(data, filename=namespaced_filename(package_id, name))
        file_infos.append({"name": name, "size": len(data)})

    collection.update_one(
        {"_id": result.inserted_id},
        {"$set": {"files": file_infos}},
    )

    installed = collection.find_one({"_id": result.inserted_id})
    return serialize_package_with_files(installed)

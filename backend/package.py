from fastapi import FastAPI, HTTPException, Depends, Header
from typing import List
from pymongo import MongoClient
from bson.objectid import ObjectId
from bson.errors import InvalidId
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
import gridfs
from gridfs.errors import NoFile
import os
import requests

from auth_shared import MONGO_URL, cors_origins, require_user

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
fs = gridfs.GridFS(db)

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
        if owner and owner != user["user_id"]:
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

    # Store the file content in GridFS under a package-namespaced filename
    fs.put(contents, filename=namespaced_filename(package_id, file.filename))

    file_info = {"name": file.filename, "size": len(contents)}
    collection.update_one({"_id": ObjectId(package_id)}, {"$push": {"files": file_info}})

    # Fire the CI pipeline (push trigger); never fail the upload if CI is down
    try:
        requests.post(
            f"{CONTAINERS_SERVICE_URL}/ci/{package_id}/run",
            params={"trigger": "push"},
            headers={"Authorization": authorization},
            timeout=5,
        )
    except Exception:
        pass

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

    owner = package.get("owner")
    if owner and owner != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the owner can roll back this plugin")

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

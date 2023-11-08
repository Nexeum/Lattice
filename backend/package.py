from fastapi import FastAPI, HTTPException
from typing import List
from pymongo import MongoClient
from bson.objectid import ObjectId
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File

# Instantiation of FastAPI
app = FastAPI()

# Settings CORS (Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = MongoClient('mongodb://localhost:27017/')
db = client['kubehub']
collection = db['package']

@app.get("/packages")
async def get_packages():
    packages = list(collection.find())
    for package in packages:
        package["_id"] = str(package["_id"])
    return packages

@app.post("/packages")
async def create_package(package: dict):
    package["stars"] = 0
    package["language"] = package.get("language", "Not Recognized")
    package["files"] = []
    result = collection.insert_one(package)
    package["_id"] = str(result.inserted_id)
    return package

@app.get("/packages/{package_id}")
async def get_package(package_id: str):
    package = collection.find_one({"_id": ObjectId(package_id)})
    if package is not None:
        package["_id"] = str(package["_id"])
        return package
    else:
        raise HTTPException(status_code=404, detail="Package not found")

@app.put("/packages/{package_id}")
async def update_package(package_id: str, package: dict):
    collection.update_one({"_id": ObjectId(package_id)}, {"$set": package})
    updated_package = collection.find_one({"_id": ObjectId(package_id)})
    if updated_package is not None:
        updated_package["_id"] = str(updated_package["_id"])
        return updated_package
    else:
        raise HTTPException(status_code=404, detail="Package not found")

@app.delete("/packages/{package_id}")
async def delete_package(package_id: str):
    collection.delete_one({"_id": ObjectId(package_id)})
    return {"message": "Package deleted successfully"}

@app.post("/packages/{package_id}/files")
async def upload_file_to_package(package_id: str, file: UploadFile = File(...)):
    package = collection.find_one({"_id": ObjectId(package_id)})
    if package is None:
        raise HTTPException(status_code=404, detail="Package not found")

    contents = await file.read()

    file_info = {"name": file.filename, "size": len(contents)}
    collection.update_one({"_id": ObjectId(package_id)}, {"$push": {"files": file_info}})

    return {"message": "File uploaded successfully"}
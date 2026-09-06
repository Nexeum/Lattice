from fastapi import FastAPI, HTTPException, Depends
from typing import List
from pymongo import MongoClient
from bson.objectid import ObjectId
from fastapi.middleware.cors import CORSMiddleware

from auth_shared import MONGO_URL, cors_origins, require_user

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
collection = db['rooms']

@app.get("/rooms")
async def get_rooms(user=Depends(require_user)):
    rooms = list(collection.find())
    for room in rooms:
        room["_id"] = str(room["_id"])
    return rooms

@app.post("/rooms")
async def create_room(room: dict, user=Depends(require_user)):
    result = collection.insert_one(room)
    room["_id"] = str(result.inserted_id)
    return room

@app.get("/rooms/{room_id}")
async def get_room(room_id: str, password: str = None, user=Depends(require_user)):
    room = collection.find_one({"_id": ObjectId(room_id)})
    if room is not None:
        room["_id"] = str(room["_id"])
        return room
    else:
        raise HTTPException(status_code=404, detail="Room not found")

@app.put("/rooms/{room_id}")
async def update_room(room_id: str, room: dict, user=Depends(require_user)):
    collection.update_one({"_id": ObjectId(room_id)}, {"$set": room})
    updated_room = collection.find_one({"_id": ObjectId(room_id)})
    if updated_room is not None:
        updated_room["_id"] = str(updated_room["_id"])
        return updated_room
    else:
        raise HTTPException(status_code=404, detail="Room not found")

@app.delete("/rooms/{room_id}")
async def delete_room(room_id: str, user=Depends(require_user)):
    collection.delete_one({"_id": ObjectId(room_id)})
    return {"message": "Room deleted successfully"}

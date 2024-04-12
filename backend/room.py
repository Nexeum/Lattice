from fastapi import FastAPI, HTTPException
from typing import List
from pymongo import MongoClient
from bson.objectid import ObjectId
from fastapi.middleware.cors import CORSMiddleware

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

client = MongoClient('mongodb://10.8.8.247:27017/')
db = client['kubehub']
collection = db['rooms']

@app.get("/rooms")
async def get_rooms():
    rooms = list(collection.find())
    for room in rooms:
        room["_id"] = str(room["_id"])
    return rooms

@app.post("/rooms")
async def create_room(room: dict):
    result = collection.insert_one(room)
    room["_id"] = str(result.inserted_id)
    return room

@app.get("/rooms/{room_id}")
async def get_room(room_id: str, password: str = None):
    room = collection.find_one({"_id": ObjectId(room_id)})
    if room is not None:
        room["_id"] = str(room["_id"])
        return room
    else:
        raise HTTPException(status_code=404, detail="Room not found")

@app.put("/rooms/{room_id}")
async def update_room(room_id: str, room: dict):
    collection.update_one({"_id": ObjectId(room_id)}, {"$set": room})
    updated_room = collection.find_one({"_id": ObjectId(room_id)})
    if updated_room is not None:
        updated_room["_id"] = str(updated_room["_id"])
        return updated_room
    else:
        raise HTTPException(status_code=404, detail="Room not found")

@app.delete("/rooms/{room_id}")
async def delete_room(room_id: str):
    collection.delete_one({"_id": ObjectId(room_id)})
    return {"message": "Room deleted successfully"}
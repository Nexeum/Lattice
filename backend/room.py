from fastapi import FastAPI, HTTPException, Depends, Body
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

# Auth users live in the auth service's database (same Mongo instance).
users_collection = MongoClient(MONGO_URL)['lattice_db']['user']

NOT_MEMBER_DETAIL = "You are not a member of this workspace"


def is_admin(user: dict) -> bool:
    return user.get("role") == "admin"


def is_owner(room: dict, user: dict) -> bool:
    """Exact ownership match against the caller's user_id."""
    owner = room.get("owner")
    return bool(owner) and owner == user.get("user_id")


def _is_legacy_owner(room: dict) -> bool:
    """Legacy rooms have no owner or an owner that is not a user_id
    (older docs stored an email or the string "local")."""
    owner = room.get("owner")
    if not owner:
        return True
    try:
        ObjectId(owner)
        return False
    except Exception:
        return True


def can_see(room: dict, user: dict) -> bool:
    """Public rooms: everyone. Private rooms: owner, members, admins.
    Legacy rooms with a non-user_id owner stay visible to all."""
    if not room.get("is_private"):
        return True
    if is_admin(user) or is_owner(room, user):
        return True
    if user.get("user_id") in room.get("members", []):
        return True
    return _is_legacy_owner(room)


def can_modify(room: dict, user: dict) -> bool:
    """Ownership actions: exact owner match or admin. Legacy/unowned rooms
    are only modifiable by admins."""
    return is_admin(user) or is_owner(room, user)


def get_room_or_404(room_id: str) -> dict:
    try:
        oid = ObjectId(room_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Room not found")
    room = collection.find_one({"_id": oid})
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


def serialize_room(room: dict) -> dict:
    room["_id"] = str(room["_id"])
    return room


def resolve_members(room: dict) -> List[dict]:
    """Resolve owner + member ids to [{"id", "email"}], skipping unresolvable ids."""
    ids = []
    for uid in [room.get("owner"), *room.get("members", [])]:
        if uid and uid not in ids:
            ids.append(uid)
    resolved = []
    for uid in ids:
        try:
            user_doc = users_collection.find_one({"_id": ObjectId(uid)})
        except Exception:
            user_doc = None
        if user_doc and user_doc.get("email"):
            resolved.append({"id": uid, "email": user_doc["email"]})
    return resolved


@app.get("/rooms")
async def get_rooms(user=Depends(require_user)):
    rooms = [room for room in collection.find() if can_see(room, user)]
    return [serialize_room(room) for room in rooms]


@app.post("/rooms")
async def create_room(room: dict, user=Depends(require_user)):
    # Owner is always the authenticated caller; never trust the body.
    room = {k: v for k, v in room.items() if k not in ("_id", "owner", "members")}
    room["owner"] = user["user_id"]
    room["members"] = []
    result = collection.insert_one(room)
    room["_id"] = str(result.inserted_id)
    return room


@app.get("/rooms/{room_id}")
async def get_room(room_id: str, password: str = None, user=Depends(require_user)):
    room = get_room_or_404(room_id)
    if not can_see(room, user):
        raise HTTPException(status_code=403, detail=NOT_MEMBER_DETAIL)
    return serialize_room(room)


@app.put("/rooms/{room_id}")
async def update_room(room_id: str, room: dict, user=Depends(require_user)):
    existing = get_room_or_404(room_id)
    if not can_modify(existing, user):
        raise HTTPException(status_code=403, detail="Only the owner or an admin can modify this workspace")
    # _id is immutable; owner/members are managed server-side.
    updates = {k: v for k, v in room.items() if k not in ("_id", "owner", "members")}
    if updates:
        collection.update_one({"_id": existing["_id"]}, {"$set": updates})
    updated_room = collection.find_one({"_id": existing["_id"]})
    if updated_room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return serialize_room(updated_room)


@app.delete("/rooms/{room_id}")
async def delete_room(room_id: str, user=Depends(require_user)):
    room = get_room_or_404(room_id)
    if not can_modify(room, user):
        raise HTTPException(status_code=403, detail="Only the owner or an admin can delete this workspace")
    collection.delete_one({"_id": room["_id"]})
    return {"message": "Room deleted successfully"}


# Members management (owner or admin)
@app.post("/rooms/{room_id}/members")
async def add_member(room_id: str, email: str = Body(..., embed=True), user=Depends(require_user)):
    room = get_room_or_404(room_id)
    if not can_modify(room, user):
        raise HTTPException(status_code=403, detail="Only the owner or an admin can manage members")
    if not email or not email.strip():
        raise HTTPException(status_code=400, detail="Email is required")

    member = users_collection.find_one({"email": email.strip()})
    if member is None:
        raise HTTPException(status_code=404, detail="No user with that email")

    collection.update_one(
        {"_id": room["_id"]},
        {"$addToSet": {"members": str(member["_id"])}},
    )
    updated = collection.find_one({"_id": room["_id"]})
    response = serialize_room(updated)
    response["member_emails"] = [m["email"] for m in resolve_members(updated)]
    return response


@app.delete("/rooms/{room_id}/members/{user_id}")
async def remove_member(room_id: str, user_id: str, user=Depends(require_user)):
    room = get_room_or_404(room_id)
    if not can_modify(room, user):
        raise HTTPException(status_code=403, detail="Only the owner or an admin can manage members")

    collection.update_one({"_id": room["_id"]}, {"$pull": {"members": user_id}})
    updated = collection.find_one({"_id": room["_id"]})
    return serialize_room(updated)


@app.get("/rooms/{room_id}/members")
async def list_members(room_id: str, user=Depends(require_user)):
    room = get_room_or_404(room_id)
    if not can_modify(room, user):
        raise HTTPException(status_code=403, detail="Only the owner or an admin can view members")
    return resolve_members(room)

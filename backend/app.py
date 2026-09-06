from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from bson.objectid import ObjectId
from bson import json_util
import jwt, datetime
import hashlib
import bcrypt
from fastapi import Body

from auth_shared import SECRET_KEY, MONGO_URL, cors_origins, require_admin

VALID_ROLES = ("admin", "user")
DEFAULT_ROLE = "user"

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

# Database
client = MongoClient(MONGO_URL)

db = client['lattice_db']

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# JWT
def generate_token(user_id: str, role: str = DEFAULT_ROLE):
    try:
        payload = {
            'user_id': user_id,
            'role': role if role in VALID_ROLES else DEFAULT_ROLE,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
        return token
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def verify_token(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

def legacy_hash(password: str):
    return hashlib.sha1(hashlib.md5(password.encode()).digest()).hexdigest()

def check_password(user: dict, password: str):
    """Returns True if the password matches; silently migrates legacy hashes to bcrypt."""
    stored = user.get('password', '')
    if stored.startswith('$2'):
        return bcrypt.checkpw(password.encode(), stored.encode())
    if stored == legacy_hash(password):
        new_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        db.user.update_one({"_id": user['_id']}, {"$set": {"password": new_hash}})
        return True
    return False

def user_role(user: dict):
    """Users without a role field are treated as plain users."""
    role = user.get('role')
    return role if role in VALID_ROLES else DEFAULT_ROLE

def find_user_or_404(user_id: str):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=404, detail='User not found')
    user = db.user.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    return user

def admin_count():
    return db.user.count_documents({"role": "admin"})

def public_user(user: dict):
    return {"id": str(user['_id']), "email": user.get('email'), "role": user_role(user)}

# Routes
@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.post("/login")
async def login(email: str = Body(...), password: str = Body(...)):
    if not email or not password:
        raise HTTPException(status_code=400, detail='Email and password are required')

    user = db.user.find_one({"email": email})

    if user and check_password(user, password):
        user_id = str(user['_id'])
        token = generate_token(user_id, user_role(user))
        return {'token': token}
    else:
        raise HTTPException(status_code=401, detail='Invalid email or password')

@app.post("/refresh")
async def refresh(payload: dict = Depends(verify_token)):
    # Re-read the user doc so role changes (promotions/demotions) take effect.
    try:
        user = db.user.find_one({"_id": ObjectId(payload['user_id'])})
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=401, detail='User no longer exists')
    return {'token': generate_token(str(user['_id']), user_role(user))}

@app.post("/register")
async def register(email: str = Body(...), password: str = Body(...)):
    if not email or not password:
        raise HTTPException(status_code=400, detail='Email and password are required')

    existing_user = db.user.find_one({"email": email})
    if existing_user:
        raise HTTPException(status_code=400, detail='Email already registered')

    hashed_password = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    # First user ever registered becomes the admin; everyone else is a plain user.
    role = "admin" if db.user.count_documents({}) == 0 else DEFAULT_ROLE

    new_user = {"email": email, "password": hashed_password, "role": role}
    db.user.insert_one(new_user)

    return {"message": "User registered successfully"}

@app.get("/userData")
async def get_user_data(payload: dict = Depends(verify_token)):
    user_id = payload['user_id']

    user = db.user.find_one({"_id": ObjectId(user_id)})

    if user:
        safe_user = {k: v for k, v in user.items() if k != 'password'}
        safe_user['role'] = user_role(user)
        return json_util.dumps({'data': safe_user})
    else:
        raise HTTPException(status_code=404, detail='User not found')

@app.get("/getuserid")
async def get_user_id(payload: dict = Depends(verify_token)):
    user_id = payload['user_id']

    return json_util.dumps({'data': user_id})

# Admin user management
@app.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    return [public_user(u) for u in db.user.find({}, {"password": 0})]

@app.put("/users/{user_id}/role")
async def set_user_role(user_id: str, role: str = Body(..., embed=True),
                        admin: dict = Depends(require_admin)):
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail='Role must be "admin" or "user"')

    target = find_user_or_404(user_id)

    # Never allow the last admin to be demoted (covers self-demotion too).
    if user_role(target) == "admin" and role != "admin" and admin_count() <= 1:
        raise HTTPException(status_code=400, detail='Cannot demote the last admin')

    db.user.update_one({"_id": target['_id']}, {"$set": {"role": role}})
    updated = db.user.find_one({"_id": target['_id']})
    return public_user(updated)

@app.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin.get('user_id'):
        raise HTTPException(status_code=400, detail='Cannot delete yourself')

    target = find_user_or_404(user_id)

    if user_role(target) == "admin" and admin_count() <= 1:
        raise HTTPException(status_code=400, detail='Cannot delete the last admin')

    db.user.delete_one({"_id": target['_id']})
    return {"message": "User deleted successfully"}

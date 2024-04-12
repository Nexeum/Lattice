from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from bson.objectid import ObjectId
from bson import json_util
import jwt, datetime
import hashlib
from fastapi import Body


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

# Secret key for JWT
SECRET_KEY = "kubehub"

# Database
client = MongoClient('mongodb://10.8.8.247:27017/')
db = client['kubehub']

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# JWT
def generate_token(user_id: str):
    try:
        payload = {
            'user_id': user_id,
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
    
# Routes
@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.post("/login")
async def login(email: str = Body(...), password: str = Body(...)):
    if not email or not password:
        raise HTTPException(status_code=400, detail='Email and password are required')

    hashed_password = hashlib.sha1(hashlib.md5(password.encode()).digest()).hexdigest()

    user = db.user.find_one({"email": email, "password": hashed_password})

    if user:
        user_id = str(user['_id'])
        token = generate_token(user_id)
        return {'token': token}
    else:
        raise HTTPException(status_code=401, detail='Invalid email or password')

@app.post("/register")
async def register(email: str = Body(...), password: str = Body(...)):
    if not email or not password:
        raise HTTPException(status_code=400, detail='Email and password are required')

    existing_user = db.user.find_one({"email": email})
    if existing_user:
        raise HTTPException(status_code=400, detail='Email already registered')

    hashed_password = hashlib.sha1(hashlib.md5(password.encode()).digest()).hexdigest()

    new_user = {"email": email, "password": hashed_password}
    db.user.insert_one(new_user)

    return {"message": "User registered successfully"}

@app.get("/userData")
async def get_user_data(payload: dict = Depends(verify_token)):
    user_id = payload['user_id']

    user = db.user.find_one({"_id": ObjectId(user_id)})

    if user:
        return json_util.dumps({'data': user})
    else:
        raise HTTPException(status_code=404, detail='User not found')
    
@app.get("/getuserid")
async def get_user_id(payload: dict = Depends(verify_token)):
    user_id = payload['user_id']

    return json_util.dumps({'data': user_id})

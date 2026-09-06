"""Shared auth/config helpers for all Lattice backend services.

SECRET_KEY and Mongo/CORS settings come from the environment so no service
hardcodes credentials. Import require_user as a FastAPI dependency to protect
endpoints; require_user_query covers WebSocket/SSE clients that cannot send
an Authorization header.
"""
import os

import jwt
from fastapi import Header, HTTPException, Query

SECRET_KEY = os.environ.get("LATTICE_SECRET_KEY", "lattice_secret")
MONGO_URL = os.environ.get("LATTICE_MONGO_URL", "mongodb://localhost:27017/")


def cors_origins():
    raw = os.environ.get("LATTICE_CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def decode_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_user(authorization: str = Header(None)):
    """FastAPI dependency: validates the Bearer token, returns the JWT payload."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return decode_token(authorization[len("Bearer "):])


def require_user_query(token: str = Query(None)):
    """Same as require_user but reads ?token= (for SSE/WebSocket clients)."""
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    return decode_token(token)


def require_admin(authorization: str = Header(None)):
    """require_user plus an admin role check (tokens without a role are plain users)."""
    payload = require_user(authorization)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return payload

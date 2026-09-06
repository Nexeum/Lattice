"""Unit tests for auth_shared: token decoding and the auth dependencies."""
import datetime

import jwt
import pytest
from fastapi import HTTPException

import auth_shared
from auth_shared import decode_token, require_user, require_user_query


def make_token(payload=None, expires_in_seconds=3600):
    body = {"user_id": "abc123"}
    if payload:
        body.update(payload)
    body["exp"] = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        seconds=expires_in_seconds
    )
    return jwt.encode(body, auth_shared.SECRET_KEY, algorithm="HS256")


class TestDecodeToken:
    def test_round_trip_returns_payload(self):
        token = make_token({"user_id": "user-42"})
        payload = decode_token(token)
        assert payload["user_id"] == "user-42"

    def test_expired_token_raises_401(self):
        token = make_token(expires_in_seconds=-60)
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Token expired"

    def test_garbage_token_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            decode_token("not-a-jwt")
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid token"

    def test_token_signed_with_wrong_key_raises_401(self):
        token = jwt.encode({"user_id": "x"}, "wrong-secret", algorithm="HS256")
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.status_code == 401


class TestRequireUser:
    def test_valid_bearer_token_returns_payload(self):
        token = make_token({"user_id": "user-7"})
        payload = require_user(authorization=f"Bearer {token}")
        assert payload["user_id"] == "user-7"

    def test_missing_header_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            require_user(authorization=None)
        assert exc_info.value.status_code == 401

    def test_malformed_header_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            require_user(authorization="Basic dXNlcjpwYXNz")
        assert exc_info.value.status_code == 401

    def test_bearer_with_invalid_token_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            require_user(authorization="Bearer garbage")
        assert exc_info.value.status_code == 401


class TestRequireUserQuery:
    def test_valid_token_returns_payload(self):
        token = make_token({"user_id": "user-9"})
        payload = require_user_query(token=token)
        assert payload["user_id"] == "user-9"

    def test_missing_token_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            require_user_query(token=None)
        assert exc_info.value.status_code == 401


def test_cors_origins_splits_and_strips(monkeypatch):
    monkeypatch.setenv("LATTICE_CORS_ORIGINS", "http://a.test, http://b.test ,")
    assert auth_shared.cors_origins() == ["http://a.test", "http://b.test"]

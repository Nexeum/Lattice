"""Unit tests for the auth service's password helpers (app.py).

Imports the module directly; MongoClient is lazy so no database is needed.
The legacy-migration path writes to Mongo, so the db handle is replaced with
a fake that records the update instead.
"""
import hashlib

import bcrypt
import pytest

import app as auth_service


class FakeUserCollection:
    def __init__(self):
        self.update_calls = []

    def update_one(self, query, update):
        self.update_calls.append((query, update))


class FakeDb:
    def __init__(self):
        self.user = FakeUserCollection()


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(auth_service, "db", db)
    return db


class TestLegacyHash:
    def test_is_sha1_of_md5_digest(self):
        password = "hunter2"
        expected = hashlib.sha1(hashlib.md5(password.encode()).digest()).hexdigest()
        assert auth_service.legacy_hash(password) == expected

    def test_is_deterministic(self):
        assert auth_service.legacy_hash("abc") == auth_service.legacy_hash("abc")
        assert auth_service.legacy_hash("abc") != auth_service.legacy_hash("abd")


class TestCheckPasswordBcrypt:
    def test_accepts_correct_password(self, fake_db):
        hashed = bcrypt.hashpw(b"s3cret", bcrypt.gensalt()).decode()
        user = {"_id": "u1", "password": hashed}
        assert auth_service.check_password(user, "s3cret") is True
        assert fake_db.user.update_calls == []  # no migration needed

    def test_rejects_wrong_password(self, fake_db):
        hashed = bcrypt.hashpw(b"s3cret", bcrypt.gensalt()).decode()
        user = {"_id": "u1", "password": hashed}
        assert auth_service.check_password(user, "wrong") is False
        assert fake_db.user.update_calls == []


class TestCheckPasswordLegacyMigration:
    def test_recognizes_legacy_digest_and_migrates_to_bcrypt(self, fake_db):
        user = {"_id": "u1", "password": auth_service.legacy_hash("oldpass")}
        assert auth_service.check_password(user, "oldpass") is True

        assert len(fake_db.user.update_calls) == 1
        query, update = fake_db.user.update_calls[0]
        assert query == {"_id": "u1"}
        new_hash = update["$set"]["password"]
        assert new_hash.startswith("$2")
        assert bcrypt.checkpw(b"oldpass", new_hash.encode())

    def test_rejects_wrong_password_against_legacy_hash(self, fake_db):
        user = {"_id": "u1", "password": auth_service.legacy_hash("oldpass")}
        assert auth_service.check_password(user, "wrong") is False
        assert fake_db.user.update_calls == []

    def test_rejects_user_with_no_password(self, fake_db):
        assert auth_service.check_password({"_id": "u1"}, "anything") is False

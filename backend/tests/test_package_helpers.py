"""Unit tests for the pure helper in package.py (GridFS naming scheme).

room.py has no pure helpers (all handlers hit Mongo directly), so it is not
covered here.
"""
import package


def test_namespaced_filename_joins_id_and_name():
    assert package.namespaced_filename("65f0", "install.sh") == "65f0:install.sh"


def test_namespaced_filename_preserves_name_with_colons():
    assert package.namespaced_filename("abc", "a:b.txt") == "abc:a:b.txt"

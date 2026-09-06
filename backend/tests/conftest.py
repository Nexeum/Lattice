"""Puts the backend directory on sys.path so tests can import the service
modules (app, container, package, auth_shared) directly."""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

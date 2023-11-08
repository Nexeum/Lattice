start cmd /k uvicorn app:app --reload --log-level debug --port 5000
start cmd /k uvicorn container:app --reload --log-level debug --port 5001
start cmd /k uvicorn room:app --reload --log-level debug --port 5002
start cmd /k uvicorn package:app --reload --log-level debug --port 5003
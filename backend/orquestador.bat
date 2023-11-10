wt --title "App" -d . powershell -NoExit uvicorn app:app --reload --log-level debug --port 5000 ^
; new-tab --title "Container" -d . powershell -NoExit uvicorn container:app --reload --log-level debug --port 5001 ^
; new-tab --title "Room" -d . powershell -NoExit uvicorn room:app --reload --log-level debug --port 5002 ^
; new-tab --title "Package" -d . powershell -NoExit uvicorn package:app --reload --log-level debug --port 5003
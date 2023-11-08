@echo off
set /p email="Enter email: "
set /p password="Enter password: "
set /p id="Enter package id: "

:: Create .innoxus directory
if not exist .innoxus mkdir .innoxus

:: Login and get token
for /f "tokens=2 delims=: " %%a in ('curl -X POST -H "Content-Type: application/json" -d "{\"email\":\"%email%\",\"password\":\"%password%\"}" http://localhost:5000/login') do set "token=%%~a"

:: Remove quotes from token
set token=%token:"=%

:: Check if login was successful
if not "%token%"=="" (
    echo Login successful
) else (
    echo Login failed
    exit /b
)

:: Upload files
for %%G in (*.*) do (
    if not "%%~nxG"==".innoxus" (
        echo Uploading %%G...
        curl -X POST -H "Content-Type: multipart/form-data" -F "file=@%%G" http://localhost:5003/packages/%id%/files
    )
)
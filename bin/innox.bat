@echo off
set configFile=.innoxus\config.bat

if exist %configFile% (
    call %configFile%
) else (
    set /p email="Enter email: "
    set /p password="Enter password: "

    echo set email=%email% > %configFile%
    echo set password=%password% >> %configFile%
)

set /p id="Enter package id: "

if not exist .innoxus mkdir .innoxus

for /f "tokens=2 delims=: " %%a in ('curl -X POST -H "Content-Type: application/json" -d "{\"email\":\"%email%\",\"password\":\"%password%\"}" http://localhost:5000/login') do set "token=%%~a"

set token=%token:"=%

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
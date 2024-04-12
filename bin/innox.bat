@echo off
setlocal enabledelayedexpansion

:: Configuration
set configFile=.innoxus\config.bat
set serverURL=http://127.0.0.1:5000
set uploadURL=http://10.8.8.247:5003
set excludedFiles=innox.bat .innoxus

:: Check if config file exists
if exist %configFile% (
    call %configFile%
) else (
    :: Get user credentials
    set /p email="Enter email: "
    call :getPassword
    echo set email=%email% > %configFile%
    echo set password=%password% >> %configFile%
)

:: Get package id
set /p id="Enter package id: "

:: Create .innoxus directory if it doesn't exist
if not exist .innoxus mkdir .innoxus

:: Login
for /f "tokens=2 delims=: " %%a in ('curl -X POST -H "Content-Type: application/json" -d "{\"email\":\"%email%\",\"password\":\"%password%\"}" %serverURL%/login') do set "token=%%~a"
set token=%token:"=%

:: Check login status
if not "%token%"=="" (
    echo Login successful
) else (
    echo Login failed
    exit /b
)

:: Upload 
for %%G in (*.*) do (
    set skip=
    for %%F in (%excludedFiles%) do (
        if "%%~nxG"=="%%F" set skip=1
    )
    if not defined skip (
        :: Upload file
        curl -X POST -H "Content-Type: multipart/form-data" -F "file=@%%G" http://10.8.8.247:5003/packages/%id%/files
    )
)

:: End of script
exit /b

:: Function to get password securely
:getPassword
set "psCommand=powershell -Command "$pword = read-host 'Enter Password' -AsSecureString ; ^
                   $BSTR=[System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pword); ^
                   [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)""
for /f "usebackq delims=" %%p in (`%psCommand%`) do set password=%%p
goto :eof
@echo off
REM The Hallway editor. Starts its little server on this machine and opens the
REM editor in the browser. Close this window (or press Ctrl+C) to stop it.
REM A shortcut to this is made by install-shortcut.ps1.

title Hallway Editor
cd /d "%~dp0..\.."

REM Already running? Then just open it.
netstat -an | find "127.0.0.1:8778" | find "LISTENING" >nul
if not errorlevel 1 (
    start http://localhost:8778/
    exit /b 0
)

echo.
echo   HALLWAY EDITOR
echo   ==============
echo.
echo   The editor opens in your browser in a moment:
echo   http://localhost:8778/
echo.
echo   Leave this window open while you edit.
echo   Close it, or press Ctrl+C, to stop.
echo.

start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8778/"

node tools\hallway-editor\server.js

REM Only reached if the server stops by itself: keep the window open so the reason can be read.
echo.
echo   The editor's server stopped. Any error is shown above.
echo.
pause

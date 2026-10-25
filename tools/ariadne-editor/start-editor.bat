@echo off
REM Ariadne's Thread: the level editor. Starts its little server on this
REM machine and opens the editor in the browser. Close this window (or press
REM Ctrl+C) to stop it. A shortcut to this is made by install-shortcut.ps1.

title Ariadne's Thread - Level Editor
cd /d "%~dp0..\.."

echo.
echo   ARIADNE'S THREAD - LEVEL EDITOR
echo   ===============================
echo.
echo   The editor opens in your browser in a moment:
echo   http://localhost:8777/
echo.
echo   Leave this window open while you edit.
echo   Close it, or press Ctrl+C, to stop.
echo.

start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8777/"

node tools\ariadne-editor\server.js

REM Only reached if the server stops by itself: keep the window open so the reason can be read.
echo.
echo   The editor's server stopped. Any error is shown above.
echo.
pause

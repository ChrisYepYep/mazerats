@echo off
REM Starts the Maze Rats site on this machine and opens it in a browser.
REM Double-click the "Maze Rats Dev Server" shortcut on the Desktop to run it.
REM Close this window (or press Ctrl+C) to stop the server.

title Maze Rats - Local Dev Server
cd /d "%~dp0"

echo.
echo   MAZE RATS - local dev server
echo   ============================
echo.
echo   Starting... this takes about 10 seconds.
echo   The site will open in your browser automatically.
echo.
echo   Leave this window open while you work.
echo   Close it, or press Ctrl+C, to stop the server.
echo.

REM Give Netlify a head start before the browser opens, so the first page
REM load doesn't land on a server that isn't listening yet.
start "" /b cmd /c "timeout /t 12 /nobreak >nul && start http://localhost:8888/admin.html"

call netlify dev

REM Only reached if netlify exits by itself, which means something failed --
REM keep the window open so the error is readable instead of vanishing.
echo.
echo   The server stopped. Any error is shown above.
echo.
pause

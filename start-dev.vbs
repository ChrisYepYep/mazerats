' Opens the Maze Rats dev-server console (tools/dev-console.ps1).
'
' Exists purely to keep PowerShell's own window off the screen. Launching the
' script directly — even with -WindowStyle Hidden — flashes a black console
' for a moment before the form appears, because the host window is created
' before the script can hide it. WScript starts it with the window state set
' from the outside, so nothing ever shows but the console itself.

Dim shell, here
Set shell = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' 0 = hidden window, False = don't wait for it to exit.
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "tools\dev-console.ps1""", 0, False

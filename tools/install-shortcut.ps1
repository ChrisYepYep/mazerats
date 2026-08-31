<#
    Puts a "Maze Rats Dev Server" shortcut on the Desktop.

    The console is launched through start-dev.vbs (see the note at the top
    of that file: it exists so no PowerShell window flashes up behind the
    console), which means the shortcut has to point at wscript.exe with the
    script as an argument rather than at anything double-clickable. That is
    fiddly enough to get wrong by hand, and it has to be redone on every
    machine the repo is copied to, so it lives here instead of in a
    README step.

    Every path is derived from where THIS FILE is, so the checkout can sit
    anywhere — no path in here is written down.

      powershell -ExecutionPolicy Bypass -File tools/install-shortcut.ps1

    Run it again after moving the repo; it overwrites the existing shortcut
    rather than making a second one.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Vbs      = Join-Path $RepoRoot "start-dev.vbs"
$Icon     = Join-Path $PSScriptRoot "mazerats.ico"
$Link     = Join-Path ([Environment]::GetFolderPath("Desktop")) "Maze Rats Dev Server.lnk"

if (-not (Test-Path $Vbs)) { throw "start-dev.vbs is missing from $RepoRoot" }

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($Link)
# wscript.exe, not the .vbs itself: a shortcut straight to the script would
# run under whatever .vbs is associated with, which on a locked-down machine
# is often a text editor.
$sc.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$sc.Arguments = '"' + $Vbs + '"'
$sc.WorkingDirectory = $RepoRoot
if (Test-Path $Icon) { $sc.IconLocation = $Icon + ",0" }
$sc.Description = "Maze Rats dev tools - local server, furni scans, messages"
$sc.Save()

Write-Host "Shortcut created: $Link"
Write-Host "  -> $Vbs"

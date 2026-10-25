<#
    Puts an "Ariadne Level Editor" shortcut on the Desktop (14 Oct 2026),
    the way tools/install-shortcut.ps1 does for the dev server.

    The shortcut runs start-editor.bat through cmd.exe (a signed Windows
    program, so Smart App Control lets it start), which starts the editor's
    server and opens the editor in the browser.

      powershell -ExecutionPolicy Bypass -File tools/ariadne-editor/install-shortcut.ps1

    Run it again after moving the repo; it overwrites the shortcut.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Bat  = Join-Path $PSScriptRoot "start-editor.bat"
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Icon = Join-Path (Split-Path -Parent $PSScriptRoot) "mazerats.ico"
$Link = Join-Path ([Environment]::GetFolderPath("Desktop")) "Ariadne Level Editor.lnk"

if (-not (Test-Path $Bat)) { throw "start-editor.bat is missing from $PSScriptRoot" }

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($Link)
$sc.TargetPath = Join-Path $env:WINDIR "System32\cmd.exe"
$sc.Arguments = '/c "' + $Bat + '"'
$sc.WorkingDirectory = $Repo
if (Test-Path $Icon) { $sc.IconLocation = $Icon + ",0" }
$sc.Description = "Ariadne's Thread level editor"
$sc.Save()

Write-Host "Shortcut created: $Link"
Write-Host "  -> $Bat"

<#
    The Maze Rats dev server, as a little console you open and close.

    Replaces "keep a black terminal window open for as long as you are
    working". Netlify's CLI still runs in a real process — this just owns it:
    starts it hidden, watches whether it is actually up, shows what it is
    saying, and kills the whole process tree on request. Closing this window
    stops the server, because a hidden server nobody can see is worse than no
    server at all.

    Styled after the site's own Habbo console (see .console-modal in
    css/style.css) — same yellow chrome, same recessed dark screen, same
    Volter Goldfish face, which is already installed system-wide here.

    Launched by start-dev.vbs (via the Desktop shortcut) so no PowerShell
    window flashes up behind it. Run directly for debugging:

      powershell -ExecutionPolicy Bypass -File tools/dev-console.ps1
#>

Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

<# Windows applies the launching process's requested window state to the
   FIRST top-level window that process shows — and start-dev.vbs deliberately
   launches PowerShell hidden, to keep a console from flashing up. The form is
   that first window, so it inherits SW_HIDE and never appears: the process
   sits there alive, with a real window, invisible. Diagnosed by enumerating
   top-level windows and finding "Maze Rats Dev Server" present but flagged
   hidden while an identical test form launched normally was visible.

   So the form is shown explicitly once it has a handle, which overrides the
   inherited state. #>
Add-Type -Namespace Native -Name Win -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
"@
$SW_SHOW = 5

$RepoRoot = Split-Path -Parent $PSScriptRoot
$IconPath = Join-Path $PSScriptRoot "mazerats.ico"
$LogPath  = Join-Path $env:TEMP "mazerats-dev-server.log"
$Port     = 8888
$SiteUrl  = "http://localhost:$Port/admin.html"

# ---------- palette, lifted from the site's console ----------
$Yellow     = [System.Drawing.Color]::FromArgb(255, 255, 203, 0)    # #ffcb00
$YellowDark = [System.Drawing.Color]::FromArgb(255, 199, 158, 0)
$ScreenBg   = [System.Drawing.Color]::FromArgb(255, 42, 46, 46)
$ScreenText = [System.Drawing.Color]::FromArgb(255, 238, 238, 238)
$Dim        = [System.Drawing.Color]::FromArgb(255, 150, 155, 155)
$Ink        = [System.Drawing.Color]::FromArgb(255, 36, 21, 5)
$Good       = [System.Drawing.Color]::FromArgb(255, 120, 220, 130)
$Bad        = [System.Drawing.Color]::FromArgb(255, 235, 110, 100)
$Busy       = [System.Drawing.Color]::FromArgb(255, 245, 195, 70)

function New-Font([single]$size, [System.Drawing.FontStyle]$style) {
    # The site's face if Windows has it, else something monospaced — never
    # the default proportional UI font, which makes this look like a form.
    foreach ($name in @("Volter (Goldfish)", "Consolas", "Courier New")) {
        $f = New-Object System.Drawing.Font($name, $size, $style)
        if ($f.Name -eq $name) { return $f }
        $f.Dispose()
    }
    return New-Object System.Drawing.Font("Consolas", $size, $style)
}
$FontTitle  = New-Font 11 ([System.Drawing.FontStyle]::Bold)
$FontBody   = New-Font 9  ([System.Drawing.FontStyle]::Regular)
$FontButton = New-Font 9  ([System.Drawing.FontStyle]::Bold)
$FontStatus = New-Font 10 ([System.Drawing.FontStyle]::Bold)

# ---------- state ----------
$script:ServerProcess = $null
$script:Starting = $false
$script:LastLogLength = 0
$script:OwnsServer = $false      # did WE start it? governs whether we stop it

# ---------- the window ----------
$form = New-Object System.Windows.Forms.Form
$form.Text = "Maze Rats Dev Server"
$form.ClientSize = New-Object System.Drawing.Size(320, 400)
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.StartPosition = "CenterScreen"
$form.BackColor = $Yellow
if (Test-Path $IconPath) { $form.Icon = New-Object System.Drawing.Icon($IconPath) }

$title = New-Object System.Windows.Forms.Label
$title.Text = "MAZE RATS"
$title.Font = $FontTitle
$title.ForeColor = $Ink
$title.AutoSize = $false
$title.TextAlign = "MiddleCenter"
$title.SetBounds(0, 10, 320, 22)
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "local dev server"
$subtitle.Font = $FontBody
$subtitle.ForeColor = $YellowDark
$subtitle.AutoSize = $false
$subtitle.TextAlign = "MiddleCenter"
$subtitle.SetBounds(0, 30, 320, 16)
$form.Controls.Add($subtitle)

# The recessed screen: a dark panel with a 1px black edge, same idea as
# .console-screen's border + inset shadow.
$screenWrap = New-Object System.Windows.Forms.Panel
$screenWrap.SetBounds(16, 54, 288, 208)
$screenWrap.BackColor = [System.Drawing.Color]::Black
$screenWrap.Padding = New-Object System.Windows.Forms.Padding(1)
$form.Controls.Add($screenWrap)

<# Explicit bounds rather than Dock Top + Dock Fill. Docked siblings are laid
   out in z-order, and getting that wrong put the log's first lines UNDERNEATH
   the status label — the box looked permanently empty because the only two
   lines in it were behind something else. Fixed positions inside a
   fixed-size window cannot express that bug. #>
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "CHECKING..."
$statusLabel.Font = $FontStatus
$statusLabel.ForeColor = $Busy
$statusLabel.BackColor = $ScreenBg
$statusLabel.AutoSize = $false
$statusLabel.TextAlign = "MiddleCenter"
$statusLabel.SetBounds(1, 1, 286, 32)
$screenWrap.Controls.Add($statusLabel)

$log = New-Object System.Windows.Forms.TextBox
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = "Vertical"
$log.BorderStyle = "None"
$log.BackColor = $ScreenBg
$log.ForeColor = $Dim
$log.Font = $FontBody
$log.SetBounds(1, 35, 286, 172)
$log.Text = ""
$log.TabStop = $false
# One log line per display line. Wrapped, a timestamped line broke across two
# rows mid-path and the column of times — the thing that makes it scannable —
# stopped lining up. Anything past the right edge is clipped, which is fine:
# this is a reassurance display, and its own messages are short by design.
$log.WordWrap = $false
$screenWrap.Controls.Add($log)

function Style-Button($b, [int]$x, [int]$y, [int]$w) {
    $b.SetBounds($x, $y, $w, 34)
    $b.Font = $FontButton
    $b.FlatStyle = "Flat"
    $b.FlatAppearance.BorderSize = 2
    $b.FlatAppearance.BorderColor = $Ink
    $b.BackColor = $Yellow
    $b.ForeColor = $Ink
    $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    # Buttons draw through TextRenderer (GDI) by default, and this pixel font
    # gives its space glyph no advance width down that path — "OPEN ADMIN
    # PAGE" came out as "OPENADMINPAGE". Labels already use GDI+, which
    # spaces it correctly, so put the buttons on the same renderer.
    $b.UseCompatibleTextRendering = $true
    $form.Controls.Add($b)
}

$startBtn = New-Object System.Windows.Forms.Button
$startBtn.Text = "START"
Style-Button $startBtn 16 274 136

$stopBtn = New-Object System.Windows.Forms.Button
$stopBtn.Text = "STOP"
Style-Button $stopBtn 168 274 136

$openBtn = New-Object System.Windows.Forms.Button
# Doubled spaces on purpose. Volter's space is narrow next to its wide bold
# caps, so "OPEN ADMIN PAGE" reads as one long word at this size.
$openBtn.Text = "OPEN  ADMIN  PAGE"
Style-Button $openBtn 16 316 288

$hint = New-Object System.Windows.Forms.Label
$hint.Text = "Closing this window stops the server."
$hint.Font = $FontBody
$hint.ForeColor = $YellowDark
$hint.AutoSize = $false
$hint.TextAlign = "MiddleCenter"
$hint.SetBounds(0, 358, 320, 18)
$form.Controls.Add($hint)

# ---------- helpers ----------

function Write-Line([string]$text) {
    $stamp = (Get-Date).ToString("HH:mm:ss")
    $log.AppendText("$stamp  $text`r`n")
}

<# Whether anything is listening on the dev port. This, not "is our process
   alive", is what actually answers "can I use the site" — netlify's CLI
   spawns children and stays alive for a while before it binds, and a server
   somebody started in a terminal counts just as much as one we started. #>
function Test-Port {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $wait = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $wait.AsyncWaitHandle.WaitOne(250)) { return $false }
        $client.EndConnect($wait)
        return $true
    } catch { return $false } finally { $client.Dispose() }
}

function Set-Status([string]$text, $colour) {
    $statusLabel.Text = $text
    $statusLabel.ForeColor = $colour
}

function Start-Server {
    if (Test-Port) { Write-Line "Already running on port $Port."; return }
    $script:Starting = $true
    $script:LastLogLength = 0
    Set-Status "STARTING…" $Busy
    Write-Line "Starting Netlify dev…"
    if (Test-Path $LogPath) { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue }

    # netlify is a .cmd shim, so it has to go through cmd. Output is
    # redirected to a file rather than a pipe: a pipe nobody drains fills its
    # buffer and blocks the server partway through booting.
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/c netlify dev > `"$LogPath`" 2>&1"
    $psi.WorkingDirectory = $RepoRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $script:ServerProcess = [System.Diagnostics.Process]::Start($psi)
    $script:OwnsServer = $true
}

function Stop-Server {
    $stopped = $false
    if ($null -ne $script:ServerProcess -and -not $script:ServerProcess.HasExited) {
        # /T because killing the cmd shim leaves node — the actual server —
        # orphaned and still holding the port.
        & taskkill /PID $script:ServerProcess.Id /T /F 2>&1 | Out-Null
        $stopped = $true
    }
    if (-not $stopped -and (Test-Port)) {
        # Started outside this window (or by a previous run of it). Find
        # whoever holds the port and stop that instead.
        $owners = & cmd /c "netstat -ano -p tcp | findstr LISTENING | findstr :$Port" 2>$null
        foreach ($line in $owners) {
            $procId = ($line -split '\s+' | Where-Object { $_ } | Select-Object -Last 1)
            if ($procId -match '^\d+$' -and [int]$procId -gt 4) {
                & taskkill /PID $procId /T /F 2>&1 | Out-Null
                $stopped = $true
            }
        }
    }
    $script:ServerProcess = $null
    $script:Starting = $false
    $script:OwnsServer = $false
    if ($stopped) { Write-Line "Stopped." } else { Write-Line "Nothing was running." }
}

<# Tails the log file the server is writing. Opened share-read every tick
   rather than held open, because the writing process has it open too. #>
function Update-Log {
    if (-not (Test-Path $LogPath)) { return }
    try {
        $stream = [System.IO.File]::Open($LogPath, "Open", "Read", "ReadWrite")
        try {
            if ($stream.Length -le $script:LastLogLength) { return }
            $stream.Seek($script:LastLogLength, "Begin") | Out-Null
            $reader = New-Object System.IO.StreamReader($stream)
            $fresh = $reader.ReadToEnd()
            $script:LastLogLength = $stream.Length
        } finally { $stream.Dispose() }
    } catch { return }

    foreach ($line in ($fresh -split "`r?`n")) {
        # Netlify's output is heavily ANSI-coloured and full of box-drawing
        # for its banner; neither survives a TextBox, so both are dropped.
        $clean = [regex]::Replace($line, "\x1B\[[0-9;]*[A-Za-z]", "")
        $clean = ($clean -replace "[╭╮╰╯│─┌┐└┘├┤┬┴┼╔╗╚╝║═]", "").Trim()
        if ($clean.Length -eq 0) { continue }
        if ($clean -match "^(⬥|◈|\*)?\s*$") { continue }
        $clean = ($clean -replace "^[⬥◈]\s*", "")
        if ($clean.Length -gt 60) { $clean = $clean.Substring(0, 57) + "…" }
        Write-Line $clean
    }
    # Keep the box from growing without bound over a long session.
    if ($log.Lines.Count -gt 300) {
        $log.Lines = $log.Lines[-200..-1]
    }
    $log.SelectionStart = $log.TextLength
    $log.ScrollToCaret()
}

# ---------- polling ----------
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
    Update-Log
    $up = Test-Port
    if ($up) {
        if ($script:Starting) {
            $script:Starting = $false
            Write-Line "Ready at localhost:$Port"
        }
        Set-Status "RUNNING" $Good
        $startBtn.Enabled = $false
        $stopBtn.Enabled = $true
        $openBtn.Enabled = $true
    } elseif ($script:Starting) {
        Set-Status "STARTING…" $Busy
        $startBtn.Enabled = $false
        $stopBtn.Enabled = $true
        $openBtn.Enabled = $false
        # The CLI dying before it ever binds is the one failure that would
        # otherwise leave this spinning on "STARTING…" forever.
        if ($null -ne $script:ServerProcess -and $script:ServerProcess.HasExited) {
            $script:Starting = $false
            Write-Line "Netlify exited before the server came up."
            Write-Line "The log above should say why."
        }
    } else {
        Set-Status "STOPPED" $Bad
        $startBtn.Enabled = $true
        $stopBtn.Enabled = $false
        $openBtn.Enabled = $false
    }
})

# ---------- wiring ----------
$startBtn.Add_Click({ Start-Server })
$stopBtn.Add_Click({ Stop-Server })
$openBtn.Add_Click({ Start-Process $SiteUrl })

$form.Add_Shown({
    # See the SW_HIDE note at the top — without this the window exists but
    # is never painted when launched from the .vbs.
    [void][Native.Win]::ShowWindow($form.Handle, $SW_SHOW)
    [void][Native.Win]::SetForegroundWindow($form.Handle)
    $timer.Start()
    if (Test-Port) {
        Write-Line "Found a server already running on port $Port."
    } else {
        Write-Line "Ready. Press START."
    }
})

# A server left running by a window nobody has open is a process the user
# has no way to find; so closing here stops it, and says so on the form.
$form.Add_FormClosing({
    $timer.Stop()
    if ($script:OwnsServer) { Stop-Server }
})

[void]$form.ShowDialog()

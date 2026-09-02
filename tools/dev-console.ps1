<#
    The Maze Rats dev tools, as the site's own Habbo console.

    Not "a WinForms window with yellow in it" — the actual sprites the
    website loads (assets/img/console/), at the measurements in
    .console-modal, at the size the website itself draws it. Everything is
    custom-painted: Windows' title bar is gone, and the close and minimise
    buttons are the console's own 13x13 sprites.

    Geometry is the stylesheet's, verbatim. Frame 257x294, border slice 14,
    screen at 14,26 sized 229x206, tab strip 48 tall pinned to the bottom.
    $Scale drives every position through Px(), so the whole console can be
    drawn larger by changing one number and nothing else.

    Tabs: SERVER runs the dev server, MESSAGES reads what people sent through
    the console on the website, FURNI runs the scans that used to live only
    in the admin page, and OPTIONS holds the two settings a scan
    actually needs asking about — how sure a match has to be, and which
    furni it must never record. The fourth slot was reserved for whatever
    earned it; a scan you cannot aim is a scan you have to babysit, so this
    did.

    Launched by start-dev.vbs (via the Desktop shortcut) so no PowerShell
    window flashes up behind it. Run directly for debugging:

      powershell -ExecutionPolicy Bypass -File tools/dev-console.ps1
#>

Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

<# NOTHING HAPPENING AT ALL IS THE WORST FAILURE THIS TOOL CAN HAVE.

   start-dev.vbs launches PowerShell with its window hidden, on purpose, so
   that no black console flashes up behind the form. The cost is that
   anything written to that hidden console is written to nobody: a missing
   sprite, an unreadable icon, a syntax error after an edit — any of them
   killed the script before the form appeared, and double-clicking the
   Desktop shortcut simply did nothing. No window, no error, nothing to
   search for. (Verified by renaming one sprite: zero new processes, and a
   shortcut that appeared to be broken.)

   A trap at script scope catches terminating errors anywhere below, and
   with $ErrorActionPreference = "Stop" that is very nearly everything. The
   message box is the only channel guaranteed to reach someone who launched
   this from an icon. #>
trap {
    $detail = "$($_.Exception.Message)`r`n`r`nLine $($_.InvocationInfo.ScriptLineNumber) of $(Split-Path -Leaf $PSCommandPath)"
    try {
        [System.Windows.Forms.MessageBox]::Show(
            "The Maze Rats dev console couldn't start.`r`n`r`n$detail",
            "Maze Rats", "OK", "Error") | Out-Null
    } catch {
        # Even the message box failed — the assemblies themselves must be
        # unavailable. Fall back to the hidden console so that running this
        # from a terminal still shows something.
        Write-Error $detail
    }
    exit 1
}

<# A process launched hidden hands SW_HIDE to the first top-level window it
   opens — which is this form, leaving it alive, real and invisible.
   start-dev.vbs launches hidden on purpose (no console flash), so the form
   is shown explicitly once it has a handle. Also used for dragging a window
   that has no title bar to drag by. #>
Add-Type -Namespace Native -Name Win -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ReleaseCapture();
[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
[DllImport("shell32.dll")] public static extern int SetCurrentProcessExplicitAppUserModelID(string id);
"@

<# The taskbar showed PowerShell's blue prompt icon, not the console.

   Setting Form.Icon is not enough: without an explicit AppUserModelID the
   shell groups the window under the process that hosts it — powershell.exe,
   launched by wscript.exe — and uses THAT executable's icon for the taskbar
   button. Giving the process its own identity detaches it from the host, and
   the window's own icon is used.

   Must be called before the first window exists, so it lives up here. #>
[void][Native.Win]::SetCurrentProcessExplicitAppUserModelID("OriginsMazeRats.DevConsole")

# A plain Panel repaints in visible bands while this much art is being
# drawn; UserPaint + OptimizedDoubleBuffer is what makes it a clean frame.
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @"
using System.Windows.Forms;
public class ConsoleSurface : Panel {
    public ConsoleSurface() {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                 ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }
}
"@

$SW_SHOW = 5
$WM_NCLBUTTONDOWN = 0xA1
$HTCAPTION = 2

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ArtDir   = Join-Path $RepoRoot "assets\img\console"
$IconPath = Join-Path $PSScriptRoot "mazerats.ico"
$LogPath  = Join-Path $env:TEMP "mazerats-dev-server.log"
$ScanLog  = Join-Path $env:TEMP "mazerats-furni-scan.log"
# Written by furni-scan-local.js for the whole life of a scan. See
# Measure-ScanRunning for why a scan announces itself in a file at all.
$ScanLock = Join-Path $PSScriptRoot ".cache\furni-scan.pid"
$Port     = 8888
$AdminUrl = "http://localhost:$Port/admin.html"

<# ---------- geometry, straight from css/style.css ----------

   $Scale is spelled out rather than $S because PowerShell variable names are
   CASE-INSENSITIVE: `$s = $Slice` inside a function is not a new local, it
   overwrites $S. That is exactly what happened here — the scale became 14,
   the nine-slice border's tile step went from 8px to 56px, and the frame
   drew corner artwork all the way along every edge. Nothing warned; the
   picture was just wrong. #>
$Scale = 1                                  # 1 = exactly the size the website draws it
function Px([int]$n) { return $n * $Scale }

<# The fractional twin of Px(), for font SIZES only.

   Every POSITION in this window has to land on a whole pixel, which is why
   Px() takes an int. A font size is the one measurement that does not:
   .console-tab-label asks for 0.4rem, and 6.4px is a size the rasteriser
   can hit exactly. Rounding it would be choosing a different size than the
   stylesheet asked for, on the grounds that the number looked untidy. #>
function PxF([single]$n) { return $n * $Scale }

$FrameW = 257; $FrameH = 294            # .console-frame
$Slice  = 14                            # .console-border border-width
$ScreenX = 14; $ScreenY = 26            # .console-screen
$ScreenW = 229; $ScreenH = 206
$ScreenR = 15                           # .console-screen border-radius
$TabH = 48                              # .console-buttons

<# .console-page's padding — 9px 10px 4px 11px, which is NOT symmetrical and
   was being drawn as a flat 8 all round. The extra pixel on the left and
   the near-absent bottom are what sit the page's text where the website
   sits it, tight under the title and clear of the rim below.

   Measured from the screen's CONTENT box, not its border box: box-sizing is
   border-box site-wide, so .console-screen's 229x206 includes its own 1px
   black edge and the padding starts one pixel further in on every side. #>
$PagePadT = 9; $PagePadR = 10; $PagePadB = 4; $PagePadL = 11

# Window buttons: close where the site has it (.console-close-btn, top 6px /
# right 14px / 13x13), minimise beside it. Fixed, so they are worked out here
# once instead of inside a paint that runs hundreds of times a drag.
$WinBtnY = Px 6
$WinBtnS = Px 13
$CloseX  = (Px $FrameW) - (Px 14) - $WinBtnS
$MinX    = $CloseX - (Px 15)

# ---------- palette ----------
$Yellow    = [System.Drawing.Color]::FromArgb(255, 255, 203, 0)   # #ffcb00
$Brown     = [System.Drawing.Color]::FromArgb(255, 153, 102, 0)   # #996600
$BrownDim  = [System.Drawing.Color]::FromArgb(255, 123, 74, 0)    # #7b4a00
$Screen    = [System.Drawing.Color]::FromArgb(255, 238, 238, 238) # #eeeeee
$ScreenDim = [System.Drawing.Color]::FromArgb(255, 186, 186, 186)
$Good      = [System.Drawing.Color]::FromArgb(255, 130, 226, 138)
$Bad       = [System.Drawing.Color]::FromArgb(255, 255, 128, 128) # .is-error
$Busy      = [System.Drawing.Color]::FromArgb(255, 250, 200, 90)
# .console-screen's own shadows, alpha and all — 0.45, 0.5 and 0.4 of 255.
$Shade     = [System.Drawing.Color]::FromArgb(115, 0, 0, 0)       # rgba(0,0,0,.45)
$Highlight = [System.Drawing.Color]::FromArgb(128, 255, 255, 255) # rgba(255,255,255,.5)
$Rim       = [System.Drawing.Color]::FromArgb(102, 0, 0, 0)       # .console-screen-shadow

function New-Sprite([string]$name) {
    $p = Join-Path $ArtDir "$name.png"
    if (-not (Test-Path $p)) { throw "missing console sprite: $p" }
    # Loaded through a MemoryStream so the file is not left locked, which
    # Image.FromFile does for the lifetime of the bitmap.
    $bytes = [System.IO.File]::ReadAllBytes($p)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    return [System.Drawing.Image]::FromStream($ms)
}

$SprBorder  = New-Sprite "cnsl-frame-border"
$SprPattern = New-Sprite "cnsl-top-pattern"
$SprClose   = New-Sprite "cnsl-top-x-close"
$SprMin     = New-Sprite "cnsl-top-minimise"
$SprTile    = New-Sprite "cnsl-bg-tile"

<# The four tab sprites, reused as-is from the website's console rather than
   redrawn, so these are the same buttons rather than an imitation of them.
   The icons were chosen for fit: a magnifier for searching out furni, a face
   for messages people send, and the question mark for the settings that
   decide what a scan counts as an answer. #>
$Tabs = @(
    @{ Key = "server";   Label = "SERVER";   Art = "people";  W = 46 }
    @{ Key = "messages"; Label = "MESSAGES"; Art = "contact"; W = 46 }
    @{ Key = "furni";    Label = "FURNI";    Art = "search";  W = 46 }
    @{ Key = "options";  Label = "OPTIONS";  Art = "qmark";   W = 48 }
)
foreach ($t in $Tabs) {
    $t.On  = New-Sprite ("cnsl-tab-" + $t.Art + "-active")
    $t.Off = New-Sprite ("cnsl-tab-" + $t.Art + "-inactive")
}

<# ---------- fonts ----------

   The console draws in the site's own two font FILES, loaded straight out
   of assets/fonts into a PrivateFontCollection, rather than trusting the
   machine to have them installed. Two reasons, and the second is the one
   that was actually breaking things:

     - a checkout on someone else's PC has the fonts sitting right there in
       the repo, so the console looks like the console without anybody
       having to install a typeface first; and

     - "Volter (Goldfish)" and "Volter-Bold (Goldfish)" are two SEPARATE
       FAMILIES, not two weights of one. (The website gets away with saying
       font-weight: 700 because its @font-face rules re-register the bold
       file AS the 700 weight of the regular family — see css/style.css.
       Nothing does that for GDI.) Asking the regular family for
       FontStyle::Bold therefore does not find the bold file at all: GDI
       synthesises one, by stamping the regular glyphs twice a pixel apart.
       On a 10px pixel font that is not a heavier letter, it is a smeared
       one — which is precisely what had happened to "Maze Rats" in the
       title bar, and to every page heading under it.

   So weight here is chosen by picking a family, never by asking for a bold
   STYLE. The collection is private to this process: nothing is installed on
   the machine and nothing needs cleaning up afterwards. #>
$script:Fonts = New-Object System.Drawing.Text.PrivateFontCollection
foreach ($file in @("VolterGoldfish.ttf", "VolterGoldfishBold.ttf")) {
    $p = Join-Path $RepoRoot "assets\fonts\$file"
    if (Test-Path $p) { $script:Fonts.AddFontFile($p) }
}
$FaceRegular = "Volter (Goldfish)"
$FaceBold    = "Volter-Bold (Goldfish)"

function New-Font([string]$family, [single]$px) {
    # Sized in PIXELS, not points: the stylesheet's rem values are pixel
    # measurements and Volter is a pixel font — points would land it between
    # its own grid steps and blur it.
    #
    # Weight comes from WHICH FAMILY is asked for, never from a FontStyle —
    # see the note above. Always Regular here, deliberately.
    foreach ($f in $script:Fonts.Families) {
        if ($f.Name -eq $family) {
            return New-Object System.Drawing.Font($f, $px, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
        }
    }
    # Only reachable if the repo's own font files have gone missing.
    return New-Object System.Drawing.Font("Consolas", $px, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
}
<# Body text is ONE size, and it is the stylesheet's: .console-blurb is
   font-size 0.5625rem / font-weight 400, which at the site's 16px root is
   9px regular. The log lines used to be drawn a pixel smaller than
   everything around them — close enough to look deliberate, wrong enough
   that the console's own text did not match the console's own text. There
   is no "small" font here now; there is the body font. #>
$FontTitle = New-Font $FaceBold    (Px 10)   # .console-title 0.6rem/700
$FontHead  = New-Font $FaceBold    (Px 9)    # .console-page-title 0.5625rem/700
$FontBody  = New-Font $FaceRegular (Px 9)    # .console-blurb / .console-btn, 0.5625rem/400
<# .console-tab-label, 0.4rem/400 — 6.4px, the stylesheet's own value.

   This was briefly raised to 8px on the grounds that 6.4 came out as mush.
   It did, but the size was never the reason: the labels were being drawn
   through TextRenderer with ClearType on (see the note over $TextFormat),
   and subpixel smoothing at 6.4px destroys a pixel font. Rendered aliased
   through GDI+ the same 6.4px is clean two-colour type, and "MESSAGES" —
   the longest of the four — measures 35px inside its 46px tab. #>
$FontTab   = New-Font $FaceRegular (PxF 6.4)

<# ---------- scan settings ----------

   The two things a scan needs told before it is worth pressing anything,
   and the OPTIONS page is where they are told.

   Strictness lives in tools/.cache/, which is already git-ignored for the
   sprite cache: it is a preference about how one person likes to run scans
   on one machine, not a fact about the project, so a checkout somewhere
   else opens on the archive's own default instead of inheriting whatever
   the last person happened to leave selected.

   The omit list is the opposite, and lives in tools/furni-omit.txt, which
   IS committed. Which furni the matcher reliably gets wrong is a finding
   about the archive — the next person should not have to rediscover it. #>
$SettingsPath = Join-Path $PSScriptRoot ".cache\dev-console.json"
$OmitPath     = Join-Path $PSScriptRoot "furni-omit.txt"

# The same four levels the scanner knows (--strictness), each carrying the
# coverage it stands for, so the page can show what is actually being asked
# for rather than only naming it. Keep in step with STRICTNESS in
# tools/furni-scan-local.js — that file is where the numbers are argued for.
$StrictLevels = @(
    @{ Key = "loose";     Label = "LOOSE";     Pct = "10%"; Note = "More finds, more mistakes." }
    @{ Key = "normal";    Label = "NORMAL";    Pct = "15%"; Note = "The archive's own setting." }
    @{ Key = "strict";    Label = "STRICT";    Pct = "20%"; Note = "Fewer mistakes, fewer finds." }
    @{ Key = "strictest"; Label = "STRICTEST"; Pct = "25%"; Note = "Only the plainly visible." }
)
$script:Strictness = "normal"
$script:OmitNames  = @()
$script:OmitStamp  = $null

function Get-StrictLevel {
    foreach ($l in $StrictLevels) { if ($l.Key -eq $script:Strictness) { return $l } }
    return $StrictLevels[1]
}

<# UTF-8 with NO byte-order mark.

   Set-Content -Encoding UTF8 writes one on Windows PowerShell 5.1, and both
   files this window writes are read back by something that does not expect
   it: Node reads furni-omit.txt as utf8 and would carry a zero-width
   character into the first line, and ConvertFrom-Json is entitled to refuse
   a document that starts with one. Harmless today only because the omit
   file's first line is always a comment. #>
function Write-TextFile([string]$path, [string]$text) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $text, $utf8)
}

function Load-Settings {
    if (-not (Test-Path $SettingsPath)) { return }
    try {
        $s = Get-Content $SettingsPath -Raw | ConvertFrom-Json
        # Checked against the list rather than trusted: this file can be
        # hand-edited or left half-written by a machine that lost power, and
        # an unknown word here would go straight to the scanner as a
        # threshold and stop the scan dead.
        $prop = $s.PSObject.Properties["strictness"]
        if ($null -ne $prop) {
            foreach ($l in $StrictLevels) { if ($l.Key -eq $prop.Value) { $script:Strictness = $l.Key } }
        }
        <# The maze selection survives a restart deliberately: a scan of four
           mazes that gets interrupted is resumed by reopening the window and
           pressing the same button, and having to reselect them first would
           be the moment someone accidentally rescans all 562 images. It is
           the FURNI page's job to make sure that selection is never a
           surprise — see the summary line it draws above the buttons. #>
        $sel = $s.PSObject.Properties["mazes"]
        if ($null -ne $sel -and $null -ne $sel.Value) {
            $script:SelectedMazes = @($sel.Value | ForEach-Object { "$_" } | Where-Object { $_ })
        }
    } catch { }
}

function Save-Settings {
    try {
        $dir = Split-Path -Parent $SettingsPath
        if (-not (Test-Path $dir)) { [void](New-Item -ItemType Directory -Path $dir -Force) }
        # @() so the value is an array before ConvertTo-Json sees it, and
        # Load-Settings re-wraps in @() on the way back in. Between them, one
        # selected maze survives as a one-element list rather than as a bare
        # string that would be read back as its own length in characters.
        Write-TextFile $SettingsPath (@{
            strictness = $script:Strictness
            mazes      = @($script:SelectedMazes)
        } | ConvertTo-Json)
    } catch { }
}

<# Re-reads the omit list when it has actually changed on disk.

   EDIT LIST opens the file in whatever the machine uses for .txt, and there
   is no moment this window can know the person has finished typing in it —
   so the file is the truth and this only ever mirrors it. Called from the
   timer rather than from paint: paint runs on every hover, and a page that
   stats a file to draw a hover highlight is the sort of thing that made
   this window feel slow in the first place. #>
function Refresh-Omit {
    $stamp = $null
    try { if (Test-Path $OmitPath) { $stamp = (Get-Item $OmitPath).LastWriteTimeUtc } } catch { }
    if ($stamp -eq $script:OmitStamp) { return $false }
    $script:OmitStamp = $stamp
    $names = @()
    if ($null -ne $stamp) {
        try {
            foreach ($line in [System.IO.File]::ReadAllLines($OmitPath)) {
                $n = ($line -replace "#.*$", "").Trim()
                if ($n) { $names += $n }
            }
        } catch { }
    }
    $script:OmitNames = $names
    return $true
}

<# Writes the list back, header and all.

   The file stays the single source of truth — the scanner reads it, a
   terminal run and a console run therefore obey exactly the same list, and
   it is committed so the next person inherits the findings. What changed is
   who does the typing: this used to open the file in Notepad, which meant
   leaving the console to use the console, and meant knowing the exact
   spelling of a furni name from memory. Now the window edits it.

   The header is rewritten from here rather than preserved from the file,
   so the explanation at the top cannot drift away from the format the
   editor actually produces. #>
$OmitHeader = @(
    "# Furni the scan must never add."
    "#"
    "# Edited from the dev console: OPTIONS -> EDIT LIST. Editable by hand"
    "# too -- one name per line, '#' starts a comment, case is ignored, and"
    "# '*' matches any run of characters, so ""Dungeon Floor*"" covers every"
    "# colour of it without listing them all."
    "#"
    "# This is for the handful of furni that keep turning up in rooms that do"
    "# not contain them -- usually something large, flat and common that finds"
    "# honest agreement against the wrong background. Raising the strictness"
    "# for the whole archive to silence one of those costs real finds"
    "# everywhere else, so they are dealt with one by one here instead."
    "#"
    "# Only scans are governed by this list. Furni added by hand in the admin"
    "# page stays put whatever is written here."
    "#"
    "# Takes effect on the next scan; nothing needs restarting."
    ""
)
function Save-Omit {
    try {
        $lines = @($OmitHeader) + @($script:OmitNames)
        Write-TextFile $OmitPath (($lines -join "`r`n") + "`r`n")
        # Forced, rather than waiting for the timer to notice the file's own
        # timestamp move: the press that caused this should redraw the list
        # it just changed, not the one after it.
        $script:OmitStamp = $null
        [void](Refresh-Omit)
    } catch { }
}

function Add-Omit([string]$name) {
    $n = "$name".Trim()
    if (-not $n) { return }
    foreach ($e in $script:OmitNames) { if ($e -ieq $n) { return } }
    $script:OmitNames = @(@($script:OmitNames) + @($n) | Sort-Object)
    Save-Omit
}

function Remove-Omit([string]$name) {
    $script:OmitNames = @(@($script:OmitNames) | Where-Object { $_ -ine $name })
    Save-Omit
}

<# ---------- the furni names the editor searches ----------

   1,200-odd names, flattened out of the catalogue by tools/list-furni.js
   because the catalogue itself is a Node module and this is PowerShell.
   Read from disk, kept in memory, and searched on every keystroke.

   A lower-cased copy is kept alongside. Searching means comparing the query
   against every name, and doing that with ToLower() inside the loop
   allocated twelve hundred strings per keystroke for nothing. #>
$NamesPath = Join-Path $PSScriptRoot ".cache\furni-names.txt"
$script:FurniNames = @()
$script:FurniLower = @()
$script:NamesStamp = $null
$script:NamesError = @()     # ditto, for the furni catalogue names
$script:OmitQuery = ""
$script:OmitMatches = @()
$script:OmitScroll = 0

function Refresh-FurniNames {
    $stamp = $null
    try { if (Test-Path $NamesPath) { $stamp = (Get-Item $NamesPath).LastWriteTimeUtc } } catch { }
    if ($stamp -eq $script:NamesStamp) { return $false }
    $script:NamesStamp = $stamp
    $names = @()
    if ($null -ne $stamp) {
        try { $names = @([System.IO.File]::ReadAllLines($NamesPath) | Where-Object { $_.Trim() }) } catch { }
    }
    $script:FurniNames = $names
    $script:FurniLower = @($names | ForEach-Object { $_.ToLowerInvariant() })
    Update-OmitMatches
    return $true
}

# Fetched once, in the background, and only if it is missing — this is a
# network round trip to the catalogue, and it must never be something the
# window sits and waits on.
function Start-NamesFetch {
    if (Test-Path $NamesPath) { return }
    $script:NamesError = @()
    Start-Job "furni-names" "tools\list-furni.js" "" {
        param($ok, $output)
        # Refresh-FurniNames picks the file up on the next tick either way;
        # this only has to account for the case where it never appears.
        if ($ok) { return }
        $script:NamesError = Format-JobError $output
    } | Out-Null
}

<# Recomputed when the query changes, never while painting. Paint runs on
   every hover; a search that ran there would scan the catalogue to decide
   the colour of a highlight.

   Names that BEGIN with what was typed come first. Searching "bonsai" for a
   Bonsai Tree and getting "Charcoal Leaf Bonsai" three rows above it is the
   difference between a search box and a filter. #>
<# ---------- running the repo's node tools without freezing the window ----------

   Three things in here shell out to node: the messages list, the furni
   catalogue names, and the maze list. All three used to do it their own way,
   and both ways were wrong.

   MESSAGES ran node SYNCHRONOUSLY, on the UI thread. Measured at 0.4s
   against a healthy database — but it is a network round trip with no
   timeout, so an unreachable database froze the whole window for the
   MongoDB driver's full 30-second server-selection wait: no repaint, no
   drag, no close button. The "Loading..." it painted first never even
   appeared, because Invalidate only QUEUES a repaint and the thread that
   would service it was the thread that was blocked.

   The other two ran in the background, correctly, but threw their output
   away — no redirect, CreateNoWindow. So every failure was silent: on a
   machine that had not run `npm install`, the maze selector sat on
   "Fetching the maze list..." for ever and never said that node had exited
   immediately with "Cannot find module 'mongodb'".

   One runner now does all three. It starts the tool, captures stdout and
   stderr to a file, and the timer notices when the process exits and hands
   the output to a completion handler. Nothing blocks, and a failure has
   somewhere to be reported. #>

$JobTimeoutSeconds = 45
$script:Jobs = @{}

<# key      names the job, and its log file, so a second start while one is
            already running is ignored rather than racing it
   relPath  the tool, relative to the repo root
   toolArgs extra arguments, already quoted if they need it
   onDone   { param($ok, $output) } — $ok is "exit code 0", $output is
            everything the tool wrote, stdout and stderr together #>
function Start-Job([string]$key, [string]$relPath, [string]$toolArgs, [scriptblock]$onDone) {
    $running = $script:Jobs[$key]
    if ($null -ne $running -and $null -ne $running.Process -and -not $running.Process.HasExited) { return $false }

    $log = Join-Path $env:TEMP ("mazerats-job-" + $key + ".log")
    if (Test-Path $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    # Redirected to a FILE rather than a pipe, for the reason Start-Server
    # gives: a pipe nobody drains fills up and blocks the writer.
    $psi.Arguments = "/c node `"" + (Join-Path $RepoRoot $relPath) + "`" " + $toolArgs + " > `"$log`" 2>&1"
    $psi.WorkingDirectory = $RepoRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    try {
        $proc = [System.Diagnostics.Process]::Start($psi)
    } catch {
        # node missing from PATH entirely is the one failure that happens
        # before there is any output to read.
        & $onDone $false ("Could not run node. Is Node.js installed and on PATH?`n" + $_.Exception.Message)
        return $true
    }
    $script:Jobs[$key] = @{ Process = $proc; Log = $log; Started = [datetime]::UtcNow; OnDone = $onDone }
    return $true
}

<# Called once a tick. Collects anything that has finished, and gives up on
   anything that has not finished in time — a tool that hangs (a database
   that accepts the connection and then never answers) would otherwise leave
   its page saying "Loading..." for the rest of the session. #>
function Poll-Jobs {
    $changed = $false
    foreach ($key in @($script:Jobs.Keys)) {
        $job = $script:Jobs[$key]
        if ($null -eq $job -or $null -eq $job.Process) { $script:Jobs.Remove($key); continue }

        if (-not $job.Process.HasExited) {
            if (([datetime]::UtcNow - $job.Started).TotalSeconds -lt $JobTimeoutSeconds) { continue }
            try { & taskkill /PID $job.Process.Id /T /F 2>&1 | Out-Null } catch { }
            $script:Jobs.Remove($key)
            & $job.OnDone $false "Gave up waiting after $JobTimeoutSeconds seconds."
            $changed = $true
            continue
        }

        $ok = ($job.Process.ExitCode -eq 0)
        $out = ""
        try { $out = [System.IO.File]::ReadAllText($job.Log) } catch { }
        $script:Jobs.Remove($key)
        & $job.OnDone $ok $out
        $changed = $true
    }
    return $changed
}

<# Turns a tool's output into something that fits the screen. Node's stack
   traces are the common failure here and their first line is the one worth
   showing — the rest is this machine's directory layout. #>
function Format-JobError([string]$output) {
    $lines = @()
    foreach ($raw in (($output -replace "`r", "") -split "`n")) {
        $t = (To-Ascii $raw).Trim()
        if (-not $t) { continue }
        if ($t -match "^\s*at ") { continue }              # stack frames
        if ($t -match "^Require stack:") { break }         # and the paths after it
        if ($t -match "^node:internal") { continue }       # node's own preamble
        if ($t -match "^throw err;?$" -or $t -eq "^") { continue }
        $lines += $t
    }
    <# A thrown Error carries its own one-line summary, and everything
       printed before it is the runtime describing where it was standing at
       the time. Show from that line on: "Error: Cannot find module
       'mongodb'" is the whole answer, and the two lines above it were
       nothing but a file path inside node itself.

       Our own tools do not throw for the expected failures — tools/_env.js
       prints a written explanation and exits — so when there is no Error:
       line, everything survives. #>
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^[A-Za-z]*Error:") { return @($lines[$i..($lines.Count - 1)]) }
    }
    if (-not $lines.Count) { $lines = @("It failed without saying why.") }
    return $lines
}

<# ---------- which mazes a scan covers ----------

   Empty means the whole archive, which is what every scan did before this
   existed and is still the default. A selection narrows all three scan
   buttons to those mazes — FULL RESCAN of two mazes is a full rescan of two
   mazes — by handing the scanner the --ids it has always understood.

   The strictness and the omit list are untouched by any of this. They are
   properties of how a scan judges a match, not of what it is pointed at, so
   they apply to a two-maze run exactly as they do to the whole archive.

   Kept in the settings file with the strictness, and shown on the FURNI
   page above the buttons in brighter text whenever it is not "all mazes" —
   a narrowed scan that looks identical to a full one is how someone
   rescans three mazes, sees "Done", and believes the archive was done. #>
$MazePath = Join-Path $PSScriptRoot ".cache\maze-list.txt"
$script:Mazes = @()              # @{ Id; Name; Images }
$script:MazeStamp = $null
$script:MazeError = @()      # why the last maze-list fetch failed, if it did
$script:MazeQuery = ""
$script:MazeMatches = @()
$script:MazeScroll = 0
$script:SelectedMazes = @()      # ids; empty = the whole archive

function Refresh-Mazes {
    $stamp = $null
    try { if (Test-Path $MazePath) { $stamp = (Get-Item $MazePath).LastWriteTimeUtc } } catch { }
    if ($stamp -eq $script:MazeStamp) { return $false }
    $script:MazeStamp = $stamp
    $rows = @()
    if ($null -ne $stamp) {
        try {
            foreach ($line in [System.IO.File]::ReadAllLines($MazePath)) {
                if (-not $line.Trim()) { continue }
                $parts = $line -split "`t"
                if ($parts.Count -lt 2) { continue }
                <# Folded to ASCII here, once, rather than at every paint.
                   Maze names are typed by hand in the admin page and several
                   carry decoration Volter has no glyph for — "*ÕMaze
                   EmpireÕ*" would otherwise be painted in whatever fallback
                   font Windows picked for the odd character, mid-name. #>
                $rows += @{
                    Id     = $parts[0].Trim()
                    Name   = (To-Ascii $parts[1].Trim())
                    Images = if ($parts.Count -ge 3 -and $parts[2] -match '^\d+$') { [int]$parts[2] } else { 0 }
                }
            }
        } catch { }
    }
    $script:Mazes = $rows
    Update-MazeMatches
    return $true
}

function Start-MazeFetch {
    $script:MazeError = @()
    Start-Job "maze-list" "tools\list-mazes.js" "" {
        param($ok, $output)
        if ($ok) { return }
        $script:MazeError = Format-JobError $output
    } | Out-Null
}

# Unlike the furni catalogue, this is worth re-fetching on demand: mazes get
# added to the archive all the time, and a selector that cannot see the maze
# you just added is a selector you stop trusting.
function Update-MazeMatches {
    $q = $script:MazeQuery.Trim().ToLowerInvariant()
    $hits = if ($q) { @($script:Mazes | Where-Object { $_.Name.ToLowerInvariant().Contains($q) }) }
            else { @($script:Mazes) }
    <# Picked mazes float to the top — but ONLY here, which is to say when
       the page is opened or the filter changes, never when something is
       ticked.

       Reordering on every toggle was the first attempt and it is actively
       hostile: tick a maze, it jumps to the top, and the row now under the
       cursor is a different maze — so ticking four in a row ticks two you
       wanted and two you did not. Ordering settles when you arrive and stays
       put while you work. #>
    $script:MazeMatches = @(@($hits | Where-Object { Test-MazeSelected $_.Id }) +
                            @($hits | Where-Object { -not (Test-MazeSelected $_.Id) }))
}

function Test-MazeSelected([string]$id) {
    foreach ($s in $script:SelectedMazes) { if ($s -eq $id) { return $true } }
    return $false
}

function Toggle-Maze([string]$id) {
    if (Test-MazeSelected $id) {
        $script:SelectedMazes = @(@($script:SelectedMazes) | Where-Object { $_ -ne $id })
    } else {
        $script:SelectedMazes = @(@($script:SelectedMazes) + @($id))
    }
    Save-Settings
}

function Update-OmitMatches {
    $q = $script:OmitQuery.Trim().ToLowerInvariant()
    if (-not $q) { $script:OmitMatches = @(); return }
    $starts = New-Object System.Collections.ArrayList
    $inside = New-Object System.Collections.ArrayList
    for ($i = 0; $i -lt $script:FurniLower.Count; $i++) {
        $l = $script:FurniLower[$i]
        if ($l.StartsWith($q)) { [void]$starts.Add($script:FurniNames[$i]) }
        elseif ($l.Contains($q)) { [void]$inside.Add($script:FurniNames[$i]) }
    }
    $script:OmitMatches = @($starts) + @($inside)
}

# ---------- state ----------
$script:Page = "server"
$script:ServerProcess = $null
$script:ScanProcess = $null
$script:Starting = $false
$script:OwnsServer = $false
$script:ServerLines = New-Object System.Collections.ArrayList
$script:FurniLines = New-Object System.Collections.ArrayList
$script:MessageLines = New-Object System.Collections.ArrayList
$script:LogRead = 0
$script:ScanRead = 0
$script:SawForeignScan = $false   # a scan running that this window did not start
$script:PortUp = $false          # measured by the timer, never by paint
$script:ScanRunning = $false     # ditto - see the note above Measure-Port
$script:Hot = ""            # which hit region the mouse is over
$script:Buttons = @()       # rebuilt every paint, used for hit-testing

# ---------- window ----------
$form = New-Object System.Windows.Forms.Form
$form.Text = "Maze Rats Dev Server"
$form.FormBorderStyle = "None"
$form.ClientSize = New-Object System.Drawing.Size((Px $FrameW), (Px $FrameH))
$form.StartPosition = "CenterScreen"
$form.BackColor = $Yellow
# In the taskbar with the console icon, as a real window — despite having
# no title bar of its own to put that icon in.
$form.ShowInTaskbar = $true
if (Test-Path $IconPath) { $form.Icon = New-Object System.Drawing.Icon($IconPath) }

# The frame's own rounded corners (border-radius: 16px), so the desktop shows
# through where the sprite is transparent instead of a square of yellow.
<# AddArc takes the bounding box of the WHOLE ellipse, so a corner of radius
   R needs a 2R box. Passing R produced corners of half the intended radius,
   which cut a visible diagonal chamfer straight through the border sprite's
   own arc — the frame looked chipped at all four corners.

   16 is not arbitrary either: the border sprite is a circle of radius 16
   inscribed in its 32x32 tile (centre 15.5,15.5), so a 16px corner is
   exactly the curve the artwork draws. #>
$radius = Px 16
$arcBox = $radius * 2
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp.AddArc(0, 0, $arcBox, $arcBox, 180, 90)
$gp.AddArc((Px $FrameW) - $arcBox, 0, $arcBox, $arcBox, 270, 90)
$gp.AddArc((Px $FrameW) - $arcBox, (Px $FrameH) - $arcBox, $arcBox, $arcBox, 0, 90)
$gp.AddArc(0, (Px $FrameH) - $arcBox, $arcBox, $arcBox, 90, 90)
$gp.CloseFigure()
$form.Region = New-Object System.Drawing.Region($gp)

$surface = New-Object ConsoleSurface
$surface.Dock = "Fill"
$surface.BackColor = $Yellow
$form.Controls.Add($surface)

# ---------- drawing helpers ----------

function Draw-Sprite($g, $img, [int]$x, [int]$y, [int]$w, [int]$h) {
    $dst = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $g.DrawImage($img, $dst, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel)
}

<# Nine-slice, the same thing border-image does for .console-border.

   The sprite is 32x32 sliced at 14, so the four corners are 14x14 and the
   piece that runs between them is the 4px middle band — NOT another 14px of
   corner. Tiling with the corner width instead of the middle band was the
   first attempt and it stamped corner artwork all the way along every edge.

   Tiled rather than stretched (border-image-repeat: repeat) because these
   edges are a repeating dotted pattern; stretching smears it. #>
function Draw-Border($g, [int]$w, [int]$h) {
    $sl = $Slice; $d = Px $sl
    $iw = $SprBorder.Width; $ih = $SprBorder.Height
    $midW = $iw - 2 * $sl          # 4px of tileable horizontal edge
    $midH = $ih - 2 * $sl
    $src = { param($sx,$sy,$sw,$sh,$dx,$dy,$dw,$dh)
        $g.DrawImage($SprBorder,
            (New-Object System.Drawing.Rectangle([int]$dx,[int]$dy,[int]$dw,[int]$dh)),
            [int]$sx, [int]$sy, [int]$sw, [int]$sh, [System.Drawing.GraphicsUnit]::Pixel) }

    & $src 0 0 $sl $sl 0 0 $d $d
    & $src ($iw-$sl) 0 $sl $sl ($w-$d) 0 $d $d
    & $src 0 ($ih-$sl) $sl $sl 0 ($h-$d) $d $d
    & $src ($iw-$sl) ($ih-$sl) $sl $sl ($w-$d) ($h-$d) $d $d

    # Top and bottom: the middle band, repeated. The last tile is clipped to
    # whatever gap is left rather than overhanging the far corner.
    $step = Px $midW
    for ($x = $d; $x -lt $w - $d; $x += $step) {
        $tw = [Math]::Min($step, $w - $d - $x)
        $sw = [Math]::Max(1, [int]($tw / $Scale))
        & $src $sl 0 $sw $sl $x 0 $tw $d
        & $src $sl ($ih-$sl) $sw $sl $x ($h-$d) $tw $d
    }
    $step = Px $midH
    for ($y = $d; $y -lt $h - $d; $y += $step) {
        $th = [Math]::Min($step, $h - $d - $y)
        $sh = [Math]::Max(1, [int]($th / $Scale))
        & $src 0 $sl $sl $sh 0 $y $d $th
        & $src ($iw-$sl) $sl $sl $sh ($w-$d) $y $d $th
    }
}

function Draw-Tiled($g, $img, [int]$x, [int]$y, [int]$w, [int]$h, [int]$offsetY = 0) {
    $tw = $img.Width * $Scale; $th = $img.Height * $Scale
    $clip = $g.Clip
    <# Intersect, NOT replace.

       SetClip(Rectangle) with no CombineMode throws the existing clip away.
       The screen's tiles are drawn inside a clip set to the rounded screen
       path — and this quietly replaced that path with a plain rectangle, so
       the ground filled all four square corners and only the black outline
       was ever actually round. The rounding read as a line drawn ON a square
       screen rather than the shape of the screen itself, which is exactly
       what still looked wrong about the corners after the radius was fixed. #>
    $g.SetClip((New-Object System.Drawing.Rectangle($x, $y, $w, $h)), [System.Drawing.Drawing2D.CombineMode]::Intersect)
    for ($ty = $y + ($offsetY * $Scale) - $th; $ty -lt $y + $h; $ty += $th) {
        for ($tx = $x; $tx -lt $x + $w; $tx += $tw) {
            Draw-Sprite $g $img $tx $ty $tw $th
        }
    }
    $g.Clip = $clip
}

<# ---------- rounded shapes and CSS shadows ----------

   A rounded rectangle whose radius means what border-radius means.

   AddArc takes the bounding box of the WHOLE ellipse, so a corner of radius
   R needs a 2R box. The frame's own corners were fixed for this once (see
   $arcBox above) — the SCREEN's were not, and had been drawing at half the
   stylesheet's 15px ever since: a chamfer where the website has a curve, on
   the one shape in the window the eye actually follows. One function now,
   so there is no third place left to get it wrong. #>
function New-RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    if ($d -le 0) {
        $p.AddRectangle((New-Object System.Drawing.RectangleF($x, $y, $w, $h)))
        return $p
    }
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}


<# One end of the console's top grip: the dotted tile, clipped to a box with
   only its OUTER top corner rounded, so the dots follow the frame's corner
   in rather than sitting in a square block against it. Matches
   .console-top-pattern::before / ::after, radius and all — the frame's own
   outline is a quarter circle of radius 12 centred on (12, 12), and the
   strip stands 4px inside it, so 8px here is concentric with it.

   GDI+ has no single-corner rounded rectangle, so this rounds all four of an
   OVERSIZED one and lets the three that are not wanted fall outside the area
   being drawn: the box grows by 2r away from the corner that matters, which
   puts the other arcs past the edges Draw-Tiled clips to.

   The clip is hard-edged, since SmoothingMode is left at None throughout
   this window (see Build-Chrome) — a staircase, like the rest of the art. #>
function Draw-Grip($g, [int]$x, [int]$y, [int]$w, [int]$h, [string]$corner) {
    if ($w -le 0) { return }
    $r = Px 8
    $grow = $r * 2
    $boxX = if ($corner -eq "left") { $x } else { $x - $grow }
    $path = New-RoundRect $boxX $y ($w + $grow) ($h + $grow) $r
    $old = $g.Clip
    $g.SetClip($path, [System.Drawing.Drawing2D.CombineMode]::Intersect)
    # -1: this tile keeps its dots on its ODD rows, and the band wants one
    # on its first line.
    Draw-Tiled $g $SprPattern $x $y $w $h -1
    $g.Clip = $old
    $path.Dispose()
}

function Copy-PathShifted($path, [single]$dx, [single]$dy) {
    $c = $path.Clone()
    $m = New-Object System.Drawing.Drawing2D.Matrix
    $m.Translate($dx, $dy)
    $c.Transform($m); $m.Dispose()
    return $c
}

<# box-shadow with no blur and no spread, which is every shadow the console
   screen has. CSS paints one as the element's own shape, offset, behind the
   element — so that is literally what this does: the shape again, moved,
   drawn before the screen itself covers the overlap. #>
function Draw-OffsetShadow($g, $path, [single]$dx, [single]$dy, $colour) {
    $s = Copy-PathShifted $path $dx $dy
    $b = New-Object System.Drawing.SolidBrush($colour)
    $g.FillPath($b, $s)
    $b.Dispose(); $s.Dispose()
}

<# ...and the inset version — .console-screen-shadow, the recessed inner rim
   the screen's contents sit down inside.

   An inset shadow fills the part of the box its own offset copy does NOT
   cover, so it is a subtraction rather than a band: Region(shape) minus
   Region(shape, moved). Drawn that way deliberately. Four straight bands
   would be a pixel-for-pixel match along the flat edges and wrong in all
   four corners, cutting a square shoulder across the 15px curve — which is
   exactly the part of this the eye is already looking at. #>
function Draw-InsetShadow($g, $path, [single]$dx, [single]$dy, $colour) {
    $r = New-Object System.Drawing.Region($path)
    $s = Copy-PathShifted $path $dx $dy
    $r.Exclude($s)
    $b = New-Object System.Drawing.SolidBrush($colour)
    $g.FillRegion($b, $r)
    $b.Dispose(); $s.Dispose(); $r.Dispose()
}

<# Text goes through GDI+ (Graphics.DrawString), NOT TextRenderer.

   This used to be the other way round, on the stated grounds that "GDI+
   anti-aliases even with TextRenderingHint set". That is not true, and
   believing it cost this window every crisp letter it was supposed to have.

   The actual relationship is the opposite one: TextRenderingHint is a GDI+
   property, and TextRenderer is GDI — it does not read the hint at all. So
   setting SingleBitPerPixelGridFit and then drawing through TextRenderer
   asks for no smoothing and gets the machine's ClearType anyway. Measured
   rather than argued: the title band, which should hold exactly two colours
   (#ffcb00 and #996600), held twenty-three — every letter of "Maze Rats"
   fringed red and green, on a pixel font, at 10px. Drawn through DrawString
   with the same hint, the same band holds two.

   GenericTypographic instead of the default StringFormat for the same
   reason NoPadding mattered before: the default adds its own side bearing,
   which throws off every centred label by an amount that changes with the
   string. #>
$TextFormat = [System.Drawing.StringFormat]::GenericTypographic

# One brush per colour for the life of the window. Text is drawn a few dozen
# times a frame and the palette is six colours; allocating and disposing a
# SolidBrush per call is pure garbage for no gain.
$script:Brushes = @{}
function Get-Brush($colour) {
    $k = $colour.ToArgb()
    if (-not $script:Brushes.ContainsKey($k)) {
        $script:Brushes[$k] = New-Object System.Drawing.SolidBrush($colour)
    }
    return $script:Brushes[$k]
}

function Measure-Text($g, [string]$text, $font) {
    return $g.MeasureString($text, $font, [System.Drawing.PointF]::new(0, 0), $TextFormat)
}

function Draw-Text($g, [string]$text, $font, $colour, [int]$x, [int]$y) {
    $g.DrawString($text, $font, (Get-Brush $colour), [System.Drawing.PointF]::new($x, $y), $TextFormat)
}

function Draw-TextCentred($g, [string]$text, $font, $colour, [int]$cx, [int]$y) {
    $size = Measure-Text $g $text $font
    Draw-Text $g $text $font $colour ([int]($cx - $size.Width / 2)) $y
}

# Trims a string until it fits, so nothing has to guess a character count for
# a proportional font in a box whose width depends on $Scale.
function Fit-Text($g, [string]$text, $font, [int]$w, [string]$cut = ".") {
    if ((Measure-Text $g $text $font).Width -le $w) { return $text }
    for ($n = $text.Length - 1; $n -gt 1; $n--) {
        $try = $text.Substring(0, $n) + $cut
        if ((Measure-Text $g $try $font).Width -le $w) { return $try }
    }
    return ""
}

<# An in-screen button, styled like .console-btn: 1px #eeeeee border, 2px
   radius, transparent fill, and a faint wash on hover. Registered into
   $script:Buttons so the click handler can find it without a second copy of
   the layout maths. #>
function Draw-Button($g, [string]$id, [string]$text, [int]$x, [int]$y, [int]$w, [int]$h, [bool]$enabled) {
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $colour = if ($enabled) { $Screen } else { [System.Drawing.Color]::FromArgb(255, 110, 110, 110) }
    if ($enabled -and $script:Hot -eq $id) {
        $wash = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 238, 238, 238))
        $g.FillRectangle($wash, $rect); $wash.Dispose()
    }
    $pen = New-Object System.Drawing.Pen($colour, $Scale)
    $g.DrawRectangle($pen, $rect); $pen.Dispose()
    $size = Measure-Text $g $text $FontBody
    Draw-Text $g $text $FontBody $colour ([int]($x + ($w - $size.Width) / 2)) ([int]($y + ($h - $size.Height) / 2))
    $script:Buttons += @{ Id = $id; Rect = $rect; Enabled = $enabled }
}

<# A clickable line of text: the hover wash from .console-btn, without the
   border. A list of a dozen bordered boxes would read as a form; the
   website's own lists (.console-contributor and friends) are plain lines
   too. #>
<# Keeps a scroll position inside a list that may have changed under it.

   Done at PAINT time, not where the wheel is read, because paint is the only
   place that knows both how many rows fit and how long the list currently
   is — and the list moves on its own: typing a letter narrows it, removing
   an entry shortens it. A position left over from a longer list would
   otherwise show an empty screen with nothing to explain why. #>
function Limit-Scroll([int]$scroll, [int]$count, [int]$rows) {
    $max = [Math]::Max(0, $count - $rows)
    if ($scroll -gt $max) { return $max }
    if ($scroll -lt 0) { return 0 }
    return $scroll
}

function Draw-Row($g, [string]$id, [string]$text, $colour, [int]$x, [int]$y, [int]$w, [int]$rowH) {
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $rowH)
    if ($script:Hot -eq $id) {
        $g.FillRectangle((Get-Brush ([System.Drawing.Color]::FromArgb(38, 238, 238, 238))), $rect)
    }
    Draw-Text $g (Fit-Text $g $text $FontBody $w) $FontBody $colour $x $y
    $script:Buttons += @{ Id = $id; Rect = $rect; Enabled = $true }
}

<# .console-hashline — the dashed rule under every page title. Actual '-'
   characters rather than a drawn line, which is what the stylesheet does
   too: a clean 1px rule looks wrong against sprite-sheet chrome. #>
function Draw-Hashline($g, [int]$x, [int]$y, [int]$w) {
    # Built long and then trimmed to the box, rather than divided out from a
    # single dash's width — a dash carries side bearing, so n * dashWidth
    # overshoots and the rule ran out past the screen's own edge.
    Draw-Text $g (Fit-Text $g ("-" * 80) $FontBody $w "") $FontBody $ScreenDim $x $y
}

function Draw-Lines($g, $lines, [int]$x, [int]$y, [int]$w, [int]$h) {
    $lineH = [int]((Measure-Text $g "Ag" $FontBody).Height)
    $max = [Math]::Floor($h / $lineH)
    $start = [Math]::Max(0, $lines.Count - $max)
    $clip = $g.Clip
    # Intersect, for the same reason as Draw-Tiled: the caller has already
    # clipped to the screen and this must narrow that, not discard it.
    $g.SetClip((New-Object System.Drawing.Rectangle($x, $y, $w, $h)), [System.Drawing.Drawing2D.CombineMode]::Intersect)
    for ($i = $start; $i -lt $lines.Count; $i++) {
        Draw-Text $g (Fit-Text $g $lines[$i] $FontBody $w) $FontBody $ScreenDim $x ($y + ($i - $start) * $lineH)
    }
    $g.Clip = $clip
}

# ---------- pages ----------

function Draw-PageServer($g, [int]$x, [int]$y, [int]$w, [int]$h) {
    Draw-Text $g "Local Dev Server" $FontHead $Screen $x $y
    Draw-Hashline $g $x ($y + (Px 11)) $w
    $up = Test-Port
    $statusText = if ($up) { "RUNNING" } elseif ($script:Starting) { "STARTING" } else { "STOPPED" }
    $statusCol  = if ($up) { $Good } elseif ($script:Starting) { $Busy } else { $Bad }
    Draw-Text $g $statusText $FontHead $statusCol ($x + $w - [int](Measure-Text $g $statusText $FontHead).Width) $y

    $rowY = $y + (Px 24)
    $bw = [int](($w - (Px 8)) / 2)
    Draw-Button $g "srv-start" "START" $x $rowY $bw (Px 18) (-not $up -and -not $script:Starting)
    Draw-Button $g "srv-stop"  "STOP"  ($x + $bw + (Px 8)) $rowY $bw (Px 18) ($up -or $script:Starting)
    $rowY += Px 24
    Draw-Button $g "srv-open" "OPEN  ADMIN  PAGE" $x $rowY $w (Px 18) $up

    $logY = $rowY + (Px 26)
    Draw-Lines $g $script:ServerLines $x $logY $w ($h - ($logY - $y))
}

function Draw-PageFurni($g, [int]$x, [int]$y, [int]$w, [int]$h) {
    Draw-Text $g "Furni Scans" $FontHead $Screen $x $y
    Draw-Hashline $g $x ($y + (Px 11)) $w
    $running = Test-ScanRunning
    if ($running) {
        Draw-Text $g "SCANNING" $FontHead $Busy ($x + $w - [int](Measure-Text $g "SCANNING" $FontHead).Width) $y
    }
    <# What the next press will actually do, said before it is pressed.

       All three settings live somewhere other than this page, and a scan run
       with the wrong ones is not obviously wrong — it is just quietly a
       different archive. One line here costs nothing and means the buttons
       below never have to be trusted blind.

       The scope goes LAST and in the bright ink whenever it is not the whole
       archive, because it is the one of the three that can make a scan look
       finished when most of the work was never attempted. #>
    $lvl = Get-StrictLevel
    $picked = $script:SelectedMazes.Count
    $summary = $lvl.Label.ToLower() + " " + $lvl.Pct
    if ($script:OmitNames.Count -gt 0) { $summary += "  -  " + $script:OmitNames.Count + " omit" }
    $summary += if ($picked -eq 0) { "  -  all mazes" }
                elseif ($picked -eq 1) { "  -  1 maze" }
                else { "  -  $picked mazes" }
    Draw-Text $g $summary $FontBody $(if ($picked) { $Screen } else { $ScreenDim }) $x ($y + (Px 22))

    $rowY = $y + (Px 37)
    <# While a scan runs, the three start buttons are disabled and the only
       live control is STOP — so they are not drawn at all, and the log takes
       the three rows back. It needs them precisely then: that is when it is
       carrying progress, an ETA and any failures, and it had been squeezed
       to three lines at exactly the moment it had the most to say. #>
    if ($running) {
        Draw-Button $g "furni-stop" "STOP  SCAN" $x $rowY $w (Px 18) $true
        $rowY += Px 18
    } else {
        Draw-Button $g "furni-all"  "FULL  RESCAN"      $x $rowY $w (Px 18) $true
        $rowY += Px 21
        Draw-Button $g "furni-add"  "FIND  NEW  FURNI"  $x $rowY $w (Px 18) $true
        $rowY += Px 21
        Draw-Button $g "furni-new"  "UNSCANNED  ONLY"   $x $rowY $w (Px 18) $true
        $rowY += Px 21
        Draw-Button $g "furni-mazes" "MAZE  SELECTOR"   $x $rowY $w (Px 18) $true
        $rowY += Px 18
    }

    $logY = $rowY + (Px 8)
    Draw-Lines $g $script:FurniLines $x $logY $w ($h - ($logY - $y))
}

function Draw-PageMessages($g, [int]$x, [int]$y, [int]$w, [int]$h) {
    Draw-Text $g "Messages" $FontHead $Screen $x $y
    Draw-Hashline $g $x ($y + (Px 11)) $w
    Draw-Button $g "msg-refresh" "REFRESH" ($x + $w - (Px 52)) ($y - (Px 3)) (Px 52) (Px 14) $true
    Draw-Lines $g $script:MessageLines $x ($y + (Px 22)) $w ($h - (Px 22))
}

<# The maze selector.

   A checklist rather than a dropdown, because more than one maze can be
   picked and a dropdown that stays open while you tick things is just a
   list with extra steps. Same shape as the omit editor next door — type to
   narrow, press a row to toggle — so there is one way to pick things out of
   a long list in this window rather than two.

   Selected mazes are pinned to the top of the list. With 38 mazes and ten
   rows visible, a selection made three screens down would otherwise be
   invisible from the moment it was made, and the count in the heading would
   be the only evidence it happened. #>
function Draw-PageMazes($g, [int]$x, [int]$y, [int]$w, [int]$h) {
    Draw-Text $g "Maze Selector" $FontHead $Screen $x $y
    Draw-Button $g "mazes-back" "BACK" ($x + $w - (Px 34)) ($y - (Px 3)) (Px 34) (Px 14) $true
    Draw-Hashline $g $x ($y + (Px 11)) $w

    $boxY = $y + (Px 20); $boxH = Px 14
    $pen = New-Object System.Drawing.Pen($Screen, $Scale)
    $g.DrawRectangle($pen, (New-Object System.Drawing.Rectangle($x, $boxY, ($w - $Scale), $boxH))); $pen.Dispose()
    $typed = $script:MazeQuery
    $shown = if ($typed) { $typed } else { "Type to filter mazes" }
    $col   = if ($typed) { $Screen } else { [System.Drawing.Color]::FromArgb(255, 130, 130, 130) }
    $tx = $x + (Px 4); $ty = $boxY + (Px 3)
    Draw-Text $g (Fit-Text $g $shown $FontBody ($w - (Px 12))) $FontBody $col $tx $ty
    if ($typed) {
        $cw = [int](Measure-Text $g $typed $FontBody).Width
        $g.FillRectangle((Get-Brush $Screen), ($tx + $cw + $Scale), $ty, $Scale, (Px 8))
    }

    $picked = $script:SelectedMazes.Count
    $head = if ($picked -eq 0) { "None picked = every maze" } else { "$picked picked" }
    Draw-Text $g $head $FontBody $(if ($picked) { $Screen } else { $ScreenDim }) $x ($y + (Px 38))
    # Only offered when it would do something, and it is the one control here
    # that undoes a whole page of clicking.
    if ($picked -gt 0) {
        Draw-Button $g "mazes-clear" "CLEAR" ($x + $w - (Px 34)) ($y + (Px 36)) (Px 34) (Px 12) $true
    }

    $rowH = [int]((Measure-Text $g "Ag" $FontBody).Height) + (Px 2)
    $listY = $y + (Px 51)
    $hintY = $y + $h - (Px 10)
    $rows = [Math]::Max(1, [Math]::Floor(($hintY - $listY - (Px 2)) / $rowH))

    if ($script:Mazes.Count -eq 0) {
        <# Says what actually went wrong, rather than "Fetching..." for ever.
           The old wording was a guess at the cause AND a lie about the
           state: on a machine that had not run `npm install`, node exited
           immediately with "Cannot find module 'mongodb'" and this sat
           claiming to be fetching for the rest of the session. #>
        if ($script:MazeError.Count) {
            Draw-Text $g "Couldn't load the maze list:" $FontBody $Bad $x $listY
            $i = 1
            foreach ($line in $script:MazeError) {
                if ($i -ge $rows) { break }
                Draw-Text $g (Fit-Text $g $line $FontBody $w) $FontBody $ScreenDim $x ($listY + $i * $rowH)
                $i++
            }
            Draw-Button $g "mazes-refresh" "RETRY" ($x + $w - (Px 44)) ($hintY - (Px 2)) (Px 44) (Px 12) $true
        } else {
            Draw-Text $g "Fetching the maze list..." $FontBody $ScreenDim $x $listY
        }
        return
    }

    # Already filtered and ordered by Update-MazeMatches — deliberately not
    # re-derived here, so a toggle cannot rearrange the list under the cursor.
    $all = @($script:MazeMatches)

    if ($all.Count -eq 0) {
        Draw-Text $g "No maze matches that." $FontBody $ScreenDim $x $listY
        return
    }

    $script:MazeScroll = Limit-Scroll $script:MazeScroll $all.Count $rows

    for ($i = 0; $i -lt [Math]::Min($rows, $all.Count - $script:MazeScroll); $i++) {
        $m = $all[$i + $script:MazeScroll]
        $on = Test-MazeSelected $m.Id
        $mark = if ($on) { "[x] " } else { "[ ] " }
        $count = if ($m.Images) { "  " + $m.Images } else { "" }
        <# The image count is trimmed off first if the row is too narrow —
           Fit-Text would otherwise eat the end of the NAME, which is the
           part being chosen between. #>
        $name = Fit-Text $g ($mark + $m.Name) $FontBody ($w - (Px 18))
        $label = $name + $count
        <# The row carries the maze's OWN id, not its position. A position
           would have to be resolved back through the same filtering and
           ordering the paint used, from a click handler that has no idea
           what was on screen — and would silently toggle the wrong maze the
           moment those two derivations drifted apart. #>
        Draw-Row $g ("maze-tog:" + $m.Id) $label $(if ($on) { $Screen } else { $ScreenDim }) $x ($listY + $i * $rowH) $w $rowH
    }

    if ($all.Count -gt $rows) {
        $from = $script:MazeScroll + 1
        $to = [Math]::Min($all.Count, $script:MazeScroll + $rows)
        Draw-Text $g "$from-$to of $($all.Count)  -  scroll" $FontBody $ScreenDim $x $hintY
    } else {
        Draw-Text $g "$($all.Count) mazes" $FontBody $ScreenDim $x $hintY
    }
    Draw-Button $g "mazes-refresh" "REFRESH" ($x + $w - (Px 44)) ($hintY - (Px 2)) (Px 44) (Px 12) $true
}

<# The settings a scan is aimed with.

   Both are deliberately one control each. The strictness button cycles
   rather than offering a number to type, because the useful range is four
   values wide and a free number invites the one mistake that matters here —
   a threshold below 0.10, where _furni-match.js's own notes say the results
   are noise without exception. The omit list is a text file rather than a
   picker, because the catalogue is 1,278 furni long and the answer is
   almost always three or four of them, typed once. #>
function Draw-PageOptions($g, [int]$x, [int]$y, [int]$w, [int]$h) {
    Draw-Text $g "Scan Options" $FontHead $Screen $x $y
    Draw-Hashline $g $x ($y + (Px 11)) $w

    $lvl = Get-StrictLevel
    Draw-Text $g "How sure a match must be" $FontBody $ScreenDim $x ($y + (Px 22))
    Draw-Button $g "opt-strict" ($lvl.Label + "   " + $lvl.Pct) $x ($y + (Px 35)) $w (Px 18) $true
    Draw-Text $g $lvl.Note $FontBody $ScreenDim $x ($y + (Px 57))

    Draw-Hashline $g $x ($y + (Px 73)) $w

    Draw-Text $g "Furni to never add" $FontBody $ScreenDim $x ($y + (Px 84))
    $n = $script:OmitNames.Count
    $count = if ($n -eq 0) { "Nothing omitted" }
             elseif ($n -eq 1) { "1 name on the list" }
             else { "$n names on the list" }
    Draw-Text $g $count $FontBody $Screen $x ($y + (Px 97))
    Draw-Button $g "opt-omit" "EDIT  LIST" $x ($y + (Px 110)) $w (Px 18) $true
    Draw-Text $g "Search the catalogue and" $FontBody $ScreenDim $x ($y + (Px 132))
    Draw-Text $g "pick what to leave out." $FontBody $ScreenDim $x ($y + (Px 144))
    Draw-Text $g "Applies to the next scan." $FontBody $ScreenDim $x ($y + (Px 156))
}

<# The omit list, edited in the console.

   Two modes in one page, chosen by whether anything has been typed. Empty
   box: the list as it stands, and a press removes. Typing: what the
   catalogue has that matches, and a press adds. That is deliberately not
   two panes — the screen is 229x206, and a search box with its own results
   pane AND a separate list pane below would leave three rows for each. One
   list at a time gets ten.

   Enter adds whatever is typed, matched or not, which is the only way to
   enter a wildcard: "Dungeon Floor*" is not a furni name and will never
   appear in the catalogue, but it is exactly the sort of thing this list is
   for. #>
function Draw-PageOmit($g, [int]$x, [int]$y, [int]$w, [int]$h) {
    Draw-Text $g "Omit Furni" $FontHead $Screen $x $y
    Draw-Button $g "omit-back" "BACK" ($x + $w - (Px 34)) ($y - (Px 3)) (Px 34) (Px 14) $true
    Draw-Hashline $g $x ($y + (Px 11)) $w

    # .console-input — a 1px #eeeeee box with the query in it. Always focused:
    # there is nothing else on this page that could want the keyboard, so a
    # click-to-focus step would be ceremony with no second state.
    $boxY = $y + (Px 20); $boxH = Px 14
    $pen = New-Object System.Drawing.Pen($Screen, $Scale)
    $g.DrawRectangle($pen, (New-Object System.Drawing.Rectangle($x, $boxY, ($w - $Scale), $boxH))); $pen.Dispose()
    $typed = $script:OmitQuery
    $shown = if ($typed) { $typed } else { "Type to search furni" }
    $col   = if ($typed) { $Screen } else { [System.Drawing.Color]::FromArgb(255, 130, 130, 130) }
    $tx = $x + (Px 4); $ty = $boxY + (Px 3)
    Draw-Text $g (Fit-Text $g $shown $FontBody ($w - (Px 12))) $FontBody $col $tx $ty
    if ($typed) {
        $cw = [int](Measure-Text $g $typed $FontBody).Width
        $g.FillRectangle((Get-Brush $Screen), ($tx + $cw + $Scale), $ty, $Scale, (Px 8))
    }

    $rowH = [int]((Measure-Text $g "Ag" $FontBody).Height) + (Px 2)
    $headY = $y + (Px 38)
    $listY = $y + (Px 50)
    $hintY = $y + $h - (Px 10)
    $rows = [Math]::Max(1, [Math]::Floor(($hintY - $listY - (Px 2)) / $rowH))

    if ($typed) {
        $all = @($script:OmitMatches)
        if ($script:FurniNames.Count -eq 0) {
            if ($script:NamesError.Count) {
                Draw-Text $g "Couldn't load the furni list:" $FontBody $Bad $x $headY
                $i = 0
                foreach ($line in $script:NamesError) {
                    if ($i -ge 2) { break }
                    Draw-Text $g (Fit-Text $g $line $FontBody $w) $FontBody $ScreenDim $x ($listY + $i * $rowH)
                    $i++
                }
                # The fallback is worth repeating precisely here: without the
                # catalogue there is nothing to search, but a name typed in
                # full still works, and so does a wildcard.
                Draw-Text $g "Enter still adds what you type." $FontBody $ScreenDim $x ($listY + ($i + 1) * $rowH)
            } else {
                Draw-Text $g "Fetching the furni list..." $FontBody $ScreenDim $x $headY
                Draw-Text $g "Enter still adds what you" $FontBody $ScreenDim $x $listY
                Draw-Text $g "typed, exactly as typed." $FontBody $ScreenDim $x ($listY + $rowH)
            }
            return
        }
        Draw-Text $g ("" + $all.Count + " found  -  press to add") $FontBody $ScreenDim $x $headY
        if ($all.Count -eq 0) {
            Draw-Text $g "Nothing matches. Enter adds" $FontBody $ScreenDim $x $listY
            Draw-Text $g "it anyway (wildcards, too)." $FontBody $ScreenDim $x ($listY + $rowH)
        }
        $script:OmitScroll = Limit-Scroll $script:OmitScroll $all.Count $rows
        for ($i = 0; $i -lt [Math]::Min($rows, $all.Count - $script:OmitScroll); $i++) {
            $name = $all[$i + $script:OmitScroll]
            $on = $false
            foreach ($e in $script:OmitNames) { if ($e -ieq $name) { $on = $true } }
            # Already-omitted matches are shown, not hidden: their absence
            # would read as "the catalogue doesn't have it" and send someone
            # off to type it again.
            $label = if ($on) { "* $name" } else { "  $name" }
            $colour = if ($on) { [System.Drawing.Color]::FromArgb(255, 130, 130, 130) } else { $Screen }
            # Row ids are positions into $all, so they must be positions in
            # the WHOLE list, not in the visible window.
            Draw-Row $g ("omit-add:" + ($i + $script:OmitScroll)) $label $colour $x ($listY + $i * $rowH) $w $rowH
        }
        <# The bottom line is the range while there is more than one screenful
           and the Enter hint otherwise. "Keep typing" used to be the whole
           answer here, which was no answer at all: searching "poster" finds
           sixty, and narrowing further is not the same thing as being able
           to look at them. The wildcard hint is not lost by this — the case
           that actually needs it is an empty result, which says so above. #>
        if ($all.Count -gt $rows) {
            $from = $script:OmitScroll + 1
            $to = [Math]::Min($all.Count, $script:OmitScroll + $rows)
            Draw-Text $g "$from-$to of $($all.Count)  -  scroll" $FontBody $ScreenDim $x $hintY
        } else {
            Draw-Text $g "Enter adds what you typed" $FontBody $ScreenDim $x $hintY
        }
    } else {
        $list = @($script:OmitNames)
        Draw-Text $g ("On the list: " + $list.Count + "  -  press to remove") $FontBody $ScreenDim $x $headY
        if ($list.Count -eq 0) {
            Draw-Text $g "Nothing is being omitted." $FontBody $ScreenDim $x $listY
            Draw-Text $g "Every scan records whatever" $FontBody $ScreenDim $x ($listY + $rowH)
            Draw-Text $g "it can find." $FontBody $ScreenDim $x ($listY + 2 * $rowH)
        }
        $script:OmitScroll = Limit-Scroll $script:OmitScroll $list.Count $rows
        for ($i = 0; $i -lt [Math]::Min($rows, $list.Count - $script:OmitScroll); $i++) {
            Draw-Row $g ("omit-del:" + ($i + $script:OmitScroll)) ("- " + $list[$i + $script:OmitScroll]) $Screen $x ($listY + $i * $rowH) $w $rowH
        }
        if ($list.Count -gt $rows) {
            $from = $script:OmitScroll + 1
            $to = [Math]::Min($list.Count, $script:OmitScroll + $rows)
            Draw-Text $g "$from-$to of $($list.Count)  -  scroll" $FontBody $ScreenDim $x $hintY
        }
    }
}

# ---------- the whole frame ----------

<# THE CHROME IS PAINTED ONCE, NOT ON EVERY FRAME.

   Everything in this window that never changes — the nine-slice border, the
   dotted top strip, the title band, the two window buttons, and the screen's
   shadows, tiles and edge — used to be rebuilt from scratch on every single
   invalidate. That is several hundred DrawImage calls (the screen's tile
   alone is a 32x32 sprite stamped across a 229x206 hole) for a frame in
   which the only thing that actually moved was a hover highlight — and a
   drag is one invalidate per mouse message, which is why the window felt
   heavy to move.

   Now it is rendered into a bitmap the first time it is wanted, and a paint
   is one blit plus the parts that genuinely vary: the page's text, the rim
   drawn over it, and the tab strip. Nothing in here depends on state, so the
   cache never needs rebuilding — if $Scale ever became adjustable while the
   window was open, this is the one thing that would have to go with it. #>
$script:Chrome = $null

# Built once and kept: every shadow, the clip for the tiles, and the rim over
# the top are all this same shape, and rebuilding it per paint was a
# meaningful share of what was left after the chrome cache.
$script:ScreenPath = New-RoundRect (Px $ScreenX) (Px $ScreenY) (Px $ScreenW) (Px $ScreenH) (Px $ScreenR)

function Build-Chrome {
    $W = Px $FrameW; $H = Px $FrameH
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit

    $bg = New-Object System.Drawing.SolidBrush($Yellow)
    $g.FillRectangle($bg, 0, 0, $W, $H); $bg.Dispose()

    <# Order matters, and it is the stylesheet's own stacking order.
       .console-border sits at z-index 1 and .console-top-pattern at 3, so
       the top strip is drawn OVER the border and its corners — the CSS
       even says so out loud. Painting it first (the obvious reading order)
       let the border's opaque corner tiles cover both ends of it, which is
       what made the strip look like a floating block of dots rather than
       part of the chrome. #>
    Draw-Border $g $W $H

    <# The top strip: a grip either side of the title, matching
       .console-top-pattern. It was a fill of the dotted tile across the
       whole 23px strip, with the title's own opaque yellow band laid over
       it to mask the dots behind the letters. It is the drag strip the
       photo frames have always had now — the same tile, ended properly
       rather than covered over.

       It fills the strip bar 3px along the bottom, and its outer top
       corners are rounded so the dots follow the frame's own curve in
       rather than sitting in a square block against it. It is pulled up
       1px because this tile keeps its dots on its ODD rows, and the band
       wants one on its first line.

       It stops for the title, and only for the title. The window buttons
       are drawn over it further down, which is how Habbo's own console has
       it: the strip runs the width of the bar and the close box sits on
       top of it. Both sprites are fully opaque, so they cover the dots
       where they sit.

       The title's own numbers are unchanged. The stylesheet bottom-aligns
       the text inside the strip rather than centring it — the title sits
       low, tight to the screen below it, which is what makes it read as
       part of the chrome instead of floating in the strip — and the 4px
       either side of it is the padding .console-title carries, which the
       grips keep their distance from rather than from the letters. #>
    $titleText = "Maze Rats"
    $tsize = Measure-Text $g $titleText $FontTitle
    $tw = [int]$tsize.Width + (Px 8)
    $tx = [int](($W - $tw) / 2)

    $stripX = Px 4
    $stripR = $W - (Px 4)
    $stripY = Px 4
    # Down to 3px short of .console-screen's own top at 26.
    $gripH  = (Px 23) - (Px 4)
    $gripGap = Px 6

    Draw-Grip $g $stripX $stripY (($tx - $gripGap) - $stripX) $gripH "left"
    $gripFrom = $tx + $tw + $gripGap
    Draw-Grip $g $gripFrom $stripY ($stripR - $gripFrom) $gripH "right"

    $bandY = Px 4
    $bandH = Px 20
    $textY = $bandY + $bandH - (Px 2) - [int]$tsize.Height
    Draw-TextCentred $g $titleText $FontTitle $Brown ([int]($W / 2)) $textY

    Draw-Sprite $g $SprMin   $MinX   $WinBtnY $WinBtnS $WinBtnS
    Draw-Sprite $g $SprClose $CloseX $WinBtnY $WinBtnS $WinBtnS

    <# .console-screen — a tiled dark ground inside a 1px black edge, at the
       stylesheet's own 15px radius, sitting in its own four shadows.

       Painted in the order CSS paints them, which is last-listed first and
       all of them behind the box: 4px of black off the left and 2px off the
       top read as recessed, and the 1px of white down the right and along
       the bottom is the light that implies. They were simply missing before
       — the screen was a rounded hole with nothing underneath it, which is
       why it looked stuck ON the chrome rather than set INTO it. #>
    <# Every one of these is drawn HARD-EDGED (SmoothingMode stays None).

       They were antialiased at first, on the reasoning that a curve wants
       smoothing. It is the wrong reasoning for this window. Everything else
       here is pixel art placed on whole pixels, and a browser's own
       border-radius blends across roughly one pixel — GDI+'s antialiasing
       spreads a 1px pen across two at half coverage each, so the screen came
       out ringed by a soft grey halo that read as a fat, blurry, two-pixel
       edge, and the corners as blobs. Hard edges give the staircase the rest
       of the artwork already has. #>
    $sx = Px $ScreenX; $sy = Px $ScreenY; $sw = Px $ScreenW; $sh = Px $ScreenH
    Draw-OffsetShadow $g $script:ScreenPath 0 (Px 1) $Highlight
    Draw-OffsetShadow $g $script:ScreenPath (Px 1) 0 $Highlight
    Draw-OffsetShadow $g $script:ScreenPath 0 (-(Px 2)) $Shade
    Draw-OffsetShadow $g $script:ScreenPath (-(Px 4)) 0 $Shade

    # Clipped to the path before the tiles go down, so the rounding is a real
    # cut rather than a rounded outline sitting on square corners.
    $oldClip = $g.Clip
    $g.SetClip($script:ScreenPath)
    Draw-Tiled $g $SprTile $sx $sy $sw $sh
    $g.Clip = $oldClip

    <# The black edge, inset by half a pen width.

       box-sizing is border-box site-wide, so .console-screen's 229x206
       INCLUDES its own 1px border. Stroking the outer path put that line
       half outside the box, where it antialiased a grey half-pixel onto the
       yellow the whole way round and left the corners reading soft and a
       size too big. Half a pixel in, it lands exactly on the boundary the
       browser draws it on. Hard-edged like everything else here: an
       antialiased 1px pen is a 2px grey smudge, which is what made this
       edge look thick and soft. #>
    $half = $Scale / 2.0
    $inner = New-RoundRect ($sx + $half) ($sy + $half) ($sw - $Scale) ($sh - $Scale) ((Px $ScreenR) - $half)
    $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, $Scale)
    $g.DrawPath($edge, $inner); $edge.Dispose(); $inner.Dispose()

    $g.Dispose()
    return $bmp
}

$surface.Add_Paint({
    param($sender, $e)
    $g = $e.Graphics
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
    $script:Buttons = @()

    if ($null -eq $script:Chrome) { $script:Chrome = Build-Chrome }
    $g.DrawImageUnscaled($script:Chrome, 0, 0)

    $W = Px $FrameW; $H = Px $FrameH

    # Drawn into the chrome above; only their hit regions are needed here.
    $script:Buttons += @{ Id = "win-min";   Rect = (New-Object System.Drawing.Rectangle($MinX,   $WinBtnY, $WinBtnS, $WinBtnS)); Enabled = $true }
    $script:Buttons += @{ Id = "win-close"; Rect = (New-Object System.Drawing.Rectangle($CloseX, $WinBtnY, $WinBtnS, $WinBtnS)); Enabled = $true }

    # .console-page, at the stylesheet's own asymmetric padding, measured in
    # from the screen's content box (inside the 1px edge).
    $sx = Px $ScreenX; $sy = Px $ScreenY; $sw = Px $ScreenW; $sh = Px $ScreenH
    $padX = $sx + (Px 1) + (Px $PagePadL)
    $padY = $sy + (Px 1) + (Px $PagePadT)
    $padW = $sw - (Px 2) - (Px $PagePadL) - (Px $PagePadR)
    $padH = $sh - (Px 2) - (Px $PagePadT) - (Px $PagePadB)

    # Clipped to the screen, not merely positioned inside it: overflow is
    # hidden on .console-screen, and a long enough log line or furni name
    # would otherwise paint straight out across the yellow.
    $oldClip = $g.Clip
    $g.SetClip($script:ScreenPath)
    switch ($script:Page) {
        "server"   { Draw-PageServer   $g $padX $padY $padW $padH }
        "furni"    { Draw-PageFurni    $g $padX $padY $padW $padH }
        "messages" { Draw-PageMessages $g $padX $padY $padW $padH }
        # A sub-page of OPTIONS rather than a fifth tab: there are four tab
        # sprites and the omit editor is where EDIT LIST goes, not somewhere
        # you would navigate to cold.
        "omit"     { Draw-PageOmit     $g $padX $padY $padW $padH }
        # Likewise a sub-page, of FURNI: it is where MAZE SELECTOR goes.
        "mazes"    { Draw-PageMazes    $g $padX $padY $padW $padH }
        default    { Draw-PageOptions  $g $padX $padY $padW $padH }
    }
    $g.Clip = $oldClip

    <# .console-screen-shadow — the recessed inner rim, painted AFTER the
       page's own content. That is the whole reason it is a separate element
       on the website too: a parent's box-shadow paints before its children,
       so the rim would otherwise sit under the text instead of over it like
       the inner edge of a glass. Hard-edged, for the reason given over the
       screen's own shadows: smoothed, these four bands stopped being bands
       and became a vignette. #>
    Draw-InsetShadow $g $script:ScreenPath 0 (Px 6) $Rim
    Draw-InsetShadow $g $script:ScreenPath (Px 6) 0 $Rim
    Draw-InsetShadow $g $script:ScreenPath (-(Px 6)) 0 $Rim
    Draw-InsetShadow $g $script:ScreenPath 0 (-(Px 3)) $Rim

    # .console-buttons — native-width tabs, butted together, centred as a
    # group. Live rather than cached: which one is active changes.
    $totalW = 0; foreach ($t in $Tabs) { $totalW += Px $t.W }
    $tabX = [int](($W - $totalW) / 2)
    $tabY = $H - (Px $TabH)
    foreach ($t in $Tabs) {
        $tw2 = Px $t.W
        # The omit editor is a sub-page of OPTIONS, so OPTIONS stays lit
        # while you are in it — nothing else would be, and an unlit tab strip
        # reads as "you are nowhere".
        $active = ($script:Page -eq $t.Key) -or
                  ($t.Key -eq "options" -and $script:Page -eq "omit") -or
                  ($t.Key -eq "furni"   -and $script:Page -eq "mazes")
        Draw-Sprite $g $(if ($active) { $t.On } else { $t.Off }) $tabX $tabY $tw2 (Px $TabH)
        if ($t.Label) {
            $col = if ($active) { $Brown } else { $BrownDim }
            Draw-TextCentred $g $t.Label $FontTab $col ($tabX + [int]($tw2 / 2)) ($tabY + (Px 27))
        }
        $script:Buttons += @{ Id = "tab-" + $t.Key; Rect = (New-Object System.Drawing.Rectangle($tabX, $tabY, $tw2, (Px $TabH))); Enabled = $true }
        $tabX += $tw2
    }
})

# ---------- server control ----------

<# WHY THESE ARE CACHED, WHY PAINT MUST NEVER CALL THEM, AND WHY THE TIMER
   MUST NOT EITHER — AT LEAST NOT THE WAY IT USED TO.

   Round one: the paint handler asked the world for the truth instead of
   drawing what it already knew, so the frame rate was capped by a socket
   timeout and a process enumeration, and a drag meant hundreds of both.
   Moving the measuring into the timer fixed paint.

   It did not fix the window. WinForms timers tick on the UI thread — the
   same thread that has to answer WM_PAINT and WM_MOUSEMOVE — so all the
   move did was relocate the stall:

     the old Test-Port      opened a TCP connection and waited up to 120ms,
                            once a second, forever
     the old Test-ScanRunning  enumerated every process on the machine via
                            CIM: 200-500ms, worse under load, and worst
                            exactly while a scan had sixteen workers running

   A window that goes deaf for a fifth of a second every three seconds does
   not read as "briefly busy", it reads as broken — and it was at its worst
   during a scan, which is when someone is most likely to be watching it.

   So neither question is asked that way any more. Both are now answered
   from something already in memory or already on disk, in microseconds, and
   the timer can afford to ask both every single tick.

   The port is read out of the OS's own TCP listener table — the same list
   netstat prints. No socket is opened, so there is nothing to time out on,
   and it answers immediately whether the port is up or down. (The socket
   version's 120ms was pure cost even on success: connecting to a live
   server still costs a handshake.) #>
function Measure-Port {
    try {
        $props = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties()
        foreach ($ep in $props.GetActiveTcpListeners()) {
            if ($ep.Port -eq $Port) { return $true }
        }
        return $false
    } catch { return $false }
}
function Test-Port { return $script:PortUp }

function Add-Line($list, [string]$text) {
    [void]$list.Add($text)
    while ($list.Count -gt 200) { $list.RemoveAt(0) }
}

function Start-Server {
    if (Test-Port) { Add-Line $script:ServerLines "Already running."; return }
    $script:Starting = $true
    $script:LogRead = 0
    Add-Line $script:ServerLines "Starting Netlify dev..."
    if (Test-Path $LogPath) { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue }
    # Output to a file, not a pipe: a pipe nobody drains fills and blocks the
    # server partway through booting.
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
        # /T because killing the cmd shim orphans node, which keeps the port.
        & taskkill /PID $script:ServerProcess.Id /T /F 2>&1 | Out-Null
        $stopped = $true
    }
    if (-not $stopped -and (Test-Port)) {
        $owners = & cmd /c "netstat -ano -p tcp | findstr LISTENING | findstr :$Port" 2>$null
        foreach ($line in $owners) {
            $procId = ($line -split '\s+' | Where-Object { $_ } | Select-Object -Last 1)
            if ($procId -match '^\d+$' -and [int]$procId -gt 4) {
                & taskkill /PID $procId /T /F 2>&1 | Out-Null; $stopped = $true
            }
        }
    }
    $script:ServerProcess = $null
    $script:Starting = $false
    $script:OwnsServer = $false
    Add-Line $script:ServerLines $(if ($stopped) { "Stopped." } else { "Nothing was running." })
}

<# Whether a scan is running ANYWHERE, not just one this window started.
   The scan is a detached process that outlives the console, so closing and
   reopening loses the handle while the scan carries on — and two concurrent
   scans would each write a whole maze's furni object over the other's, so
   the second run would silently undo the first. It therefore cannot be
   answered from a variable, which cannot see across restarts.

   It used to be answered by asking Windows for every process and matching
   this script's name in their command lines. Correct, and far too expensive
   to ask once a second on the UI thread — see the note above Measure-Port.

   Now the scan announces itself instead: furni-scan-local.js writes its own
   pid to tools/.cache/furni-scan.pid on the way in and removes it on the
   way out, so the question is a directory lookup and, at most, one process
   handle. The pid matters because the STOP button kills the scan outright
   and a killed process never cleans up after itself; a file naming a pid
   that is gone is recognisably stale, whereas a bare marker file would
   leave this window insisting a scan was running until someone deleted it
   by hand.

   The name is checked as well as the pid: Windows reuses pids, and a stale
   file whose number has come round again on some unrelated program would
   otherwise disable every scan button on the page with no way to clear it. #>
function Measure-ScanRunning {
    if ($null -ne $script:ScanProcess -and -not $script:ScanProcess.HasExited) { return $true }
    if (-not (Test-Path $ScanLock)) { return $false }
    $text = ""
    try { $text = [System.IO.File]::ReadAllText($ScanLock).Trim() } catch { return $false }
    if ($text -notmatch '^\d+$') { return $false }
    try {
        $p = Get-Process -Id ([int]$text) -ErrorAction Stop
        if ($p.ProcessName -eq "node") { return $true }
    } catch { }
    Remove-Item $ScanLock -Force -ErrorAction SilentlyContinue
    return $false
}
function Test-ScanRunning { return $script:ScanRunning }

function Start-Scan([string]$mode) {
    if (Test-ScanRunning) {
        Add-Line $script:FurniLines "A scan is already running."
        return
    }
    # NOT $args. Inside a function that is one of PowerShell's automatic
    # variables (the unbound arguments), and quietly shadowing it here is the
    # same class of trap this file already carries a warning about over
    # $Scale — it works until the day it does not, and gives no clue why.
    $scanArgs = @((Join-Path $RepoRoot "tools\furni-scan-local.js"))
    switch ($mode) {
        "add" { $scanArgs += "--additive" }
        "new" { $scanArgs += "--only-unscanned" }
    }
    <# Always passed, even when it is the default, so the scan's own log says
       what it ran at. The omit list is NOT passed: the scanner reads
       tools/furni-omit.txt itself, which keeps a scan started from a
       terminal and a scan started from this window obeying exactly the same
       list rather than two copies of one that can drift apart. #>
    $scanArgs += @("--strictness", $script:Strictness)
    <# A selection narrows the run to those mazes, whichever button started
       it: --ids is orthogonal to --additive and --only-unscanned, so "find
       new furni in these three mazes" is just both flags at once. No ids at
       all means the whole archive, which is the scanner's own default. #>
    if ($script:SelectedMazes.Count -gt 0) {
        $scanArgs += @("--ids", ($script:SelectedMazes -join ","))
    }
    $script:ScanRead = 0
    if (Test-Path $ScanLog) { Remove-Item $ScanLog -Force -ErrorAction SilentlyContinue }
    Add-Line $script:FurniLines $(switch ($mode) {
        "add" { "Looking for new furni..." }
        "new" { "Scanning unscanned images..." }
        default { "Full rescan started..." }
    })
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/c node " + (($scanArgs | ForEach-Object { "`"$_`"" }) -join " ") + " > `"$ScanLog`" 2>&1"
    $psi.WorkingDirectory = $RepoRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $script:ScanProcess = [System.Diagnostics.Process]::Start($psi)
}

<# Stops a scan, whether or not this window started it.

   Safe to do at any point: the scanner writes each image's result as it
   lands rather than batching them at the end, so a scan killed halfway has
   simply done the first half — and `--only-unscanned` picks the rest up
   later. Nothing is left half-written.

   /T because node is a child of the cmd shim used to redirect its output;
   killing the shim alone leaves the scan running with nothing watching it. #>
function Stop-Scan {
    $killed = $false
    if ($null -ne $script:ScanProcess -and -not $script:ScanProcess.HasExited) {
        & taskkill /PID $script:ScanProcess.Id /T /F 2>&1 | Out-Null
        $script:ScanProcess = $null
        $killed = $true
    }
    # A scan this window did not start has no handle here, so it is found the
    # same way Measure-ScanRunning finds it — by the pid it wrote down.
    if (Test-Path $ScanLock) {
        try {
            $text = [System.IO.File]::ReadAllText($ScanLock).Trim()
            if ($text -match '^\d+$') {
                $p = Get-Process -Id ([int]$text) -ErrorAction SilentlyContinue
                if ($null -ne $p -and $p.ProcessName -eq "node") {
                    & taskkill /PID $text /T /F 2>&1 | Out-Null
                    $killed = $true
                }
            }
        } catch { }
        # Removed here rather than left for the next Measure-ScanRunning to
        # notice: taskkill /F gives the scan no chance to tidy up, and the
        # buttons should come back the moment STOP is pressed, not a tick
        # later once something else has worked out that the pid is gone.
        Remove-Item $ScanLock -Force -ErrorAction SilentlyContinue
    }
    $script:ScanRunning = $false
    $script:SawForeignScan = $false
    Add-Line $script:FurniLines $(if ($killed) { "Scan stopped. Finished images are saved." } else { "No scan was running." })
}

<# Reads the messages in the BACKGROUND. This used to call node inline, on
   the UI thread, which is the one thing this window must never do — see the
   note over Start-Job for what that cost. The "Loading..." line below now
   actually appears, because the thread that paints it is free to do so. #>
function Load-Messages {
    $script:MessageLines.Clear()
    Add-Line $script:MessageLines "Loading..."
    $surface.Invalidate()
    Start-Job "messages" "tools\list-messages.js" "--limit 12" {
        param($ok, $output)
        $script:MessageLines.Clear()
        if (-not $ok) {
            Add-Line $script:MessageLines "Couldn't read the messages:"
            foreach ($l in (Format-JobError $output)) { Add-Line $script:MessageLines $l }
            return
        }
        foreach ($raw in (($output -replace "`r", "") -split "`n")) {
            $t = To-Ascii $raw.TrimEnd()
            if ($t.Length -gt 120) { $t = $t.Substring(0, 117) + "..." }
            Add-Line $script:MessageLines $t
        }
        if (-not $script:MessageLines.Count) { Add-Line $script:MessageLines "No messages yet." }
    } | Out-Null
}

<# Tails a log a separate process is writing. Opened share-read each tick
   rather than held, because the writer has it open too. #>
function Read-Tail([string]$path, [ref]$cursor) {
    $fresh = ""
    if (-not (Test-Path $path)) { return @() }
    try {
        $sl = [System.IO.File]::Open($path, "Open", "Read", "ReadWrite")
        try {
            if ($sl.Length -le $cursor.Value) { return @() }
            [void]$sl.Seek($cursor.Value, "Begin")
            $r = New-Object System.IO.StreamReader($sl)
            $fresh = $r.ReadToEnd()
            $cursor.Value = $sl.Length
        } finally { $sl.Dispose() }
    } catch { return @() }

    $out = @()
    foreach ($line in ($fresh -split "`r?`n")) {
        # Netlify colours everything and draws a box around its banner;
        # neither survives being painted as plain text.
        $clean = [regex]::Replace($line, "\x1B\[[0-9;]*[A-Za-z]", "")
        $clean = ($clean -replace "[─-╿▀-▟]", "").Trim()
        $clean = ($clean -replace "^[◈⬥●\*]\s*", "")
        $clean = To-Ascii $clean
        if ($clean.Length -eq 0) { continue }
        if ($clean.Length -gt 120) { $clean = $clean.Substring(0, 117) + "..." }
        $out += $clean
    }
    return $out
}

<# Volter Goldfish is a pixel font with a small glyph set, and GDI+ silently
   substitutes another font for anything it lacks — an em-dash in Netlify's
   output came out as a musical note, mid-sentence, in the wrong typeface.
   Rather than police what each tool prints, everything painted into the
   screen is folded to the ASCII the font actually has. #>
function To-Ascii([string]$text) {
    if (-not $text) { return "" }
    $t = $text -replace "[‐-―]", "-"      # hyphens and dashes
    $t = $t -replace "[‘’‛]", "'"
    $t = $t -replace "[“”]", '"'
    $t = $t -replace "…", "..."
    $t = $t -replace "·", "-"                   # middot, used by netlify
    $t = $t -replace "[^\x20-\x7E]", ""              # anything still exotic
    return $t
}

# ---------- interaction ----------

function Hit([int]$x, [int]$y) {
    foreach ($b in $script:Buttons) {
        if ($b.Rect.Contains($x, $y)) { return $b }
    }
    return $null
}

<# Only the two controls involved are redrawn, not the window.

   A hover changes at most 36x18 pixels, twice — the button being left and
   the button being entered. Invalidating the whole surface for that made
   every pass of the mouse across the screen a full repaint, which is the
   other half of why this felt heavy (the chrome cache above is the first).

   The button rects are known because the last paint registered them, and
   painting a sub-rectangle still runs the whole layout, so $script:Buttons
   comes back complete either way — the clip only decides which pixels
   actually reach the screen. #>
$surface.Add_MouseMove({
    param($sender, $e)
    $b = Hit $e.X $e.Y
    $id = if ($null -ne $b -and $b.Enabled) { $b.Id } else { "" }
    if ($id -ne $script:Hot) {
        $was = $script:Hot
        $script:Hot = $id
        $surface.Cursor = if ($id) { [System.Windows.Forms.Cursors]::Hand } else { [System.Windows.Forms.Cursors]::Default }
        foreach ($btn in $script:Buttons) {
            if ($btn.Id -eq $was -or $btn.Id -eq $id) {
                # Grown by a pixel so an antialiased edge cannot leave a
                # sliver of the old highlight behind on the boundary.
                $r = $btn.Rect
                $surface.Invalidate((New-Object System.Drawing.Rectangle(
                    ($r.X - 1), ($r.Y - 1), ($r.Width + 2), ($r.Height + 2))))
            }
        }
    }
})

$surface.Add_MouseDown({
    param($sender, $e)
    $b = Hit $e.X $e.Y
    if ($null -eq $b) {
        # Anywhere that isn't a control drags the window — there is no title
        # bar to grab, so the yellow chrome is the handle.
        [void][Native.Win]::ReleaseCapture()
        [void][Native.Win]::SendMessage($form.Handle, $WM_NCLBUTTONDOWN, $HTCAPTION, 0)
        return
    }
    if (-not $b.Enabled) { return }
    switch ($b.Id) {
        "win-close" { $form.Close() }
        "win-min"   { $form.WindowState = "Minimized" }
        "srv-start" { Start-Server }
        "srv-stop"  { Stop-Server }
        "srv-open"  { Start-Process $AdminUrl }
        "furni-all" { Start-Scan "all" }
        "furni-add" { Start-Scan "add" }
        "furni-new" { Start-Scan "new" }
        "furni-stop" { Stop-Scan }
        "msg-refresh" { Load-Messages }
        <# Cycles, and wraps. Four values with no ordering control of their
           own in a 229px screen: a second button to go back would cost more
           room than pressing this one three more times. #>
        "opt-strict" {
            $i = 0
            for ($n = 0; $n -lt $StrictLevels.Count; $n++) {
                if ($StrictLevels[$n].Key -eq $script:Strictness) { $i = $n }
            }
            $script:Strictness = $StrictLevels[($i + 1) % $StrictLevels.Count].Key
            Save-Settings
        }
        "opt-omit" {
            $script:Page = "omit"
            $script:OmitQuery = ""
            $script:OmitScroll = 0
            Update-OmitMatches
            # Only now, and only if it has never been fetched: nobody should
            # pay for a catalogue download to look at the SERVER tab.
            Start-NamesFetch
        }
        "omit-back" { $script:Page = "options"; $script:OmitQuery = ""; $script:OmitScroll = 0; Update-OmitMatches }
        "furni-mazes" {
            $script:Page = "mazes"
            $script:MazeQuery = ""
            $script:MazeScroll = 0
            Update-MazeMatches
            # Only fetched if there is nothing to show. Pressing REFRESH is
            # how you ask for a fresh list once there is one.
            if ($script:Mazes.Count -eq 0) { Start-MazeFetch }
        }
        "mazes-back"  { $script:Page = "furni"; $script:MazeQuery = ""; Update-MazeMatches }
        "mazes-clear" { $script:SelectedMazes = @(); Save-Settings; Update-MazeMatches }
        "mazes-refresh" { Start-MazeFetch; Add-Line $script:FurniLines "Refreshing the maze list..." }
        default {
            if ($b.Id -like "tab-*") {
                $script:Page = $b.Id.Substring(4)
                if ($script:Page -eq "messages" -and $script:MessageLines.Count -eq 0) { Load-Messages }
            }
            <# The list rows carry their own index in the id, because the
               row's meaning is "whatever is showing in that position right
               now" — the same position means a different furni one keystroke
               later. Read back against the same array the paint drew from. #>
            elseif ($b.Id -like "omit-add:*") {
                $i = [int]$b.Id.Substring(9)
                $all = @($script:OmitMatches)
                if ($i -lt $all.Count) { Add-Omit $all[$i] }
            }
            elseif ($b.Id -like "omit-del:*") {
                $i = [int]$b.Id.Substring(9)
                $list = @($script:OmitNames)
                if ($i -lt $list.Count) { Remove-Omit $list[$i] }
            }
            # Carries the maze id itself, so no lookup can go wrong.
            elseif ($b.Id -like "maze-tog:*") { Toggle-Maze $b.Id.Substring(9) }
        }
    }
    $surface.Invalidate()
})

<# The wheel scrolls both long lists — the mazes, and the omit page's search
   results and omitted list alike.

   Filtering is not a substitute for scrolling on either page. You can only
   filter for something whose name you already know, and searching the
   catalogue for "poster" finds sixty: "+50 more, keep typing" told you they
   existed and gave you no way to look at them.

   Delta is in WHEEL_DELTA units of 120, not pixels; three rows per notch is
   what the rest of Windows does. The upper bound is left to the paint — see
   Limit-Scroll — since only it knows how many rows fit. #>
$surface.Add_MouseWheel({
    param($sender, $e)
    $step = [int]($e.Delta / 120) * 3
    switch ($script:Page) {
        "mazes" { $script:MazeScroll = [Math]::Max(0, $script:MazeScroll - $step) }
        "omit"  { $script:OmitScroll = [Math]::Max(0, $script:OmitScroll - $step) }
        default { return }
    }
    $surface.Invalidate()
})

<# ---------- typing ----------

   KeyPreview puts the form ahead of its children for key messages, which
   matters because the only child is a Panel and a Panel does not take
   focus — without it nothing in this window would ever see a keystroke.

   Everything is ignored unless the omit editor is open. There is no focus
   model here and no second field to tab between: on that page the keyboard
   goes to the search box, and everywhere else it goes nowhere.

   KeyPress rather than KeyDown for the characters, because KeyPress is
   already the shifted, layout-mapped character — KeyDown would hand back
   VK codes and leave this file reimplementing a keyboard layout. #>
$form.KeyPreview = $true

$form.Add_KeyPress({
    param($sender, $e)
    if ($script:Page -ne "omit" -and $script:Page -ne "mazes") { return }
    $ch = $e.KeyChar
    if ([int]$ch -lt 32 -or [int]$ch -gt 126) { return }   # printable ASCII only
    if ($script:Page -eq "mazes") {
        if ($script:MazeQuery.Length -lt 40) {
            $script:MazeQuery += $ch
            # Back to the top: the list under the old scroll position has
            # nothing to do with what was just typed.
            $script:MazeScroll = 0
            Update-MazeMatches
        }
    } elseif ($script:OmitQuery.Length -lt 40) {
        $script:OmitQuery += $ch
        $script:OmitScroll = 0
        Update-OmitMatches
    }
    $e.Handled = $true
    $surface.Invalidate()
})

$form.Add_KeyDown({
    param($sender, $e)
    if ($script:Page -eq "mazes") {
        switch ($e.KeyCode) {
            "Back" {
                if ($script:MazeQuery.Length -gt 0) {
                    $script:MazeQuery = $script:MazeQuery.Substring(0, $script:MazeQuery.Length - 1)
                    $script:MazeScroll = 0
                    Update-MazeMatches
                }
            }
            # Ticks the top row of whatever is showing — type three letters,
            # press Enter, carry on typing the next one.
            "Return" {
                $all = @($script:MazeMatches)
                if ($all.Count -gt 0) { Toggle-Maze $all[$script:MazeScroll].Id }
            }
            "Escape" {
                if ($script:MazeQuery) { $script:MazeQuery = ""; $script:MazeScroll = 0; Update-MazeMatches }
                else { $script:Page = "furni" }
            }
            "Down" { $script:MazeScroll++ }
            "Up"   { if ($script:MazeScroll -gt 0) { $script:MazeScroll-- } }
            default { return }
        }
        $e.Handled = $true
        $e.SuppressKeyPress = $true
        $surface.Invalidate()
        return
    }
    if ($script:Page -ne "omit") { return }
    switch ($e.KeyCode) {
        "Back" {
            if ($script:OmitQuery.Length -gt 0) {
                $script:OmitQuery = $script:OmitQuery.Substring(0, $script:OmitQuery.Length - 1)
                $script:OmitScroll = 0
                Update-OmitMatches
            }
        }
        # Same two keys as the maze selector, for people who would rather not
        # reach for the wheel.
        "Down" { $script:OmitScroll++ }
        "Up"   { if ($script:OmitScroll -gt 0) { $script:OmitScroll-- } }
        <# Adds what was TYPED, not the first match. The two are usually the
           same thing, but the one case where they differ is the case this
           exists for: a wildcard is never in the catalogue, so "the top
           result" would be the wrong answer or no answer at all. #>
        "Return" {
            if ($script:OmitQuery.Trim()) {
                Add-Omit $script:OmitQuery
                $script:OmitQuery = ""
                # The box is now empty, so the page is about to show the
                # omitted list instead of the matches — a scroll position
                # from the search results means nothing to it.
                $script:OmitScroll = 0
                Update-OmitMatches
            }
        }
        "Escape" {
            # Clears the box first, and only leaves the page once it is
            # already empty — one key, and never a surprise exit mid-search.
            if ($script:OmitQuery) { $script:OmitQuery = ""; $script:OmitScroll = 0; Update-OmitMatches }
            else { $script:Page = "options" }
        }
        default { return }
    }
    $e.Handled = $true
    $e.SuppressKeyPress = $true
    $surface.Invalidate()
})

# ---------- polling ----------
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
    $changed = $false

    # The measuring happens here, once, and the result is what paint reads.
    $wasUp = $script:PortUp
    $script:PortUp = Measure-Port
    if ($wasUp -ne $script:PortUp) { $changed = $true }

    # Every tick now, not every third: the throttle existed only because
    # asking cost half a second (see Measure-ScanRunning), and a scan's
    # buttons coming back two seconds after it ended was the price of it.
    $wasScan = $script:ScanRunning
    $script:ScanRunning = Measure-ScanRunning
    if ($wasScan -ne $script:ScanRunning) { $changed = $true }

    <# A scan that started somewhere else — a terminal, or another copy of
       this window — while this one was open.

       It was detected (SCANNING lit up, STOP worked) but the log pane went
       on showing the PREVIOUS scan's output, because only Start-Scan resets
       the read cursor and clears the file. The result read as live progress
       for a run that had nothing to do with the lines on screen, which is
       worse than showing nothing: the counts were real, just from the wrong
       scan. Say plainly whose scan it is and that its progress is not
       available here. #>
    if ($script:ScanRunning -and -not $wasScan -and $null -eq $script:ScanProcess) {
        $script:SawForeignScan = $true
        $script:FurniLines.Clear()
        Add-Line $script:FurniLines "A scan started outside this window."
        Add-Line $script:FurniLines "Its progress is not shown here,"
        Add-Line $script:FurniLines "but STOP SCAN will still stop it."
    }

    # Anything spawned by Start-Job that has finished, timed out, or failed.
    if (Poll-Jobs) { $changed = $true }

    # Both of these are files something else may have written — the omit
    # list can still be edited by hand, and the furni names arrive from a
    # background fetch that finishes whenever it finishes.
    if (Refresh-Omit) { $changed = $true }
    if (Refresh-FurniNames) { $changed = $true }
    if (Refresh-Mazes) { $changed = $true }

    foreach ($l in (Read-Tail $LogPath ([ref]$script:LogRead))) { Add-Line $script:ServerLines $l; $changed = $true }
    foreach ($l in (Read-Tail $ScanLog ([ref]$script:ScanRead))) { Add-Line $script:FurniLines $l; $changed = $true }

    if ($script:Starting -and $script:PortUp) {
        $script:Starting = $false
        Add-Line $script:ServerLines "Ready at localhost:$Port"
        $changed = $true
    }
    if ($script:Starting -and $null -ne $script:ServerProcess -and $script:ServerProcess.HasExited) {
        $script:Starting = $false
        Add-Line $script:ServerLines "Netlify exited before the server came up."
        $changed = $true
    }
    if ($null -ne $script:ScanProcess -and $script:ScanProcess.HasExited) {
        Add-Line $script:FurniLines "Scan finished."
        $script:ScanProcess = $null
        $changed = $true
    }
    # A scan started before this window opened leaves its last lines in the
    # log; once it is gone, say so rather than sitting on SCANNING forever.
    if ($script:SawForeignScan -and -not $script:ScanRunning) {
        $script:SawForeignScan = $false
        Add-Line $script:FurniLines "Scan finished."
        $changed = $true
    }

    # Repaint only when there is something new to show. A window that
    # redraws itself once a second for no reason is a window that feels
    # slow to drag.
    if ($changed) { $surface.Invalidate() }
})

$form.Add_Shown({
    [void][Native.Win]::ShowWindow($form.Handle, $SW_SHOW)
    [void][Native.Win]::SetForegroundWindow($form.Handle)
    Load-Settings
    [void](Refresh-Omit)
    [void](Refresh-FurniNames)
    # After Load-Settings, so the restored selection is what orders the list.
    [void](Refresh-Mazes)
    <# Measured before the first line is written, not left to the timer a
       second later. Test-Port only ever reports what was last measured, and
       nothing had been: opening the console onto an already-running server
       always greeted it with "Ready. Press START." and a STOPPED badge that
       corrected itself a beat after the window appeared. Cheap enough to
       just ask now that neither of these opens a socket. #>
    $script:PortUp = Measure-Port
    $script:ScanRunning = Measure-ScanRunning
    $timer.Start()
    Add-Line $script:ServerLines $(if (Test-Port) { "Server already running." } else { "Ready. Press START." })
    if (Test-ScanRunning) {
        # Same situation as the timer's foreign-scan branch, just noticed at
        # startup rather than as a transition — and the same warning applies
        # about the log holding some earlier run's lines.
        $script:SawForeignScan = $true
        $script:FurniLines.Clear()
        Add-Line $script:FurniLines "A scan is already running, started"
        Add-Line $script:FurniLines "outside this window. Its progress is"
        Add-Line $script:FurniLines "not shown here, but STOP SCAN works."
    }
    $surface.Invalidate()
})

$form.Add_FormClosing({
    $timer.Stop()
    # A server left running by a window nobody has open is a process with no
    # visible owner, so closing here stops it.
    if ($script:OwnsServer) { Stop-Server }
})

[void]$form.ShowDialog()

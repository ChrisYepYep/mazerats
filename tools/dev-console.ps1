<#
    The Maze Rats dev tools, as the site's own Habbo console.

    Not "a WinForms window with yellow in it" — the actual sprites the
    website uses (assets/img/console/), at the actual measurements from
    .console-modal in css/style.css, drawn at 2x with nearest-neighbour so
    the pixel art stays pixel art. Everything is custom-painted: Windows'
    title bar is gone, and the close and minimise buttons are the console's
    own 13x13 sprites.

    Geometry is the stylesheet's, doubled. Frame 257x294, border slice 14,
    screen at 14,26 sized 229x206, tab strip 48 tall pinned to the bottom.
    Change SCALE and every part follows, because nothing is hardcoded in
    window pixels — see $Scale and the Px helper.

    Tabs: SERVER runs the dev server, FURNI runs the scans that used to live
    only in the admin page, MESSAGES reads what people sent through the
    console on the website. The fourth is deliberately inert for now.

    Launched by start-dev.vbs (via the Desktop shortcut) so no PowerShell
    window flashes up behind it. Run directly for debugging:

      powershell -ExecutionPolicy Bypass -File tools/dev-console.ps1
#>

Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

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
"@

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
$Port     = 8888
$AdminUrl = "http://localhost:$Port/admin.html"

<# ---------- geometry, straight from css/style.css ----------

   $Scale is spelled out rather than $S because PowerShell variable names are
   CASE-INSENSITIVE: `$s = $Slice` inside a function is not a new local, it
   overwrites $S. That is exactly what happened here — the scale became 14,
   the nine-slice border's tile step went from 8px to 56px, and the frame
   drew corner artwork all the way along every edge. Nothing warned; the
   picture was just wrong. #>
$Scale = 2                                  # everything below is in site pixels
function Px([int]$n) { return $n * $Scale }

$FrameW = 257; $FrameH = 294            # .console-frame
$Slice  = 14                            # .console-border border-width
$ScreenX = 14; $ScreenY = 26            # .console-screen
$ScreenW = 229; $ScreenH = 206
$TabH = 48                              # .console-buttons

# ---------- palette ----------
$Yellow    = [System.Drawing.Color]::FromArgb(255, 255, 203, 0)   # #ffcb00
$Brown     = [System.Drawing.Color]::FromArgb(255, 153, 102, 0)   # #996600
$BrownDim  = [System.Drawing.Color]::FromArgb(255, 123, 74, 0)    # #7b4a00
$Screen    = [System.Drawing.Color]::FromArgb(255, 238, 238, 238) # #eeeeee
$ScreenDim = [System.Drawing.Color]::FromArgb(255, 186, 186, 186)
$Good      = [System.Drawing.Color]::FromArgb(255, 130, 226, 138)
$Bad       = [System.Drawing.Color]::FromArgb(255, 255, 128, 128) # .is-error
$Busy      = [System.Drawing.Color]::FromArgb(255, 250, 200, 90)

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
   for messages people send, and the question mark for the slot that has no
   job yet. #>
$Tabs = @(
    @{ Key = "server";   Label = "SERVER";   Art = "people";  W = 46 }
    @{ Key = "furni";    Label = "FURNI";    Art = "search";  W = 46 }
    @{ Key = "messages"; Label = "MESSAGES"; Art = "contact"; W = 46 }
    @{ Key = "spare";    Label = "";         Art = "qmark";   W = 48 }
)
foreach ($t in $Tabs) {
    $t.On  = New-Sprite ("cnsl-tab-" + $t.Art + "-active")
    $t.Off = New-Sprite ("cnsl-tab-" + $t.Art + "-inactive")
}

function New-Font([single]$px, [System.Drawing.FontStyle]$style) {
    # Sized in PIXELS, not points: the stylesheet's rem values are pixel
    # measurements and Volter is a pixel font — points would land it between
    # its own grid steps and blur it.
    foreach ($n in @("Volter (Goldfish)", "Consolas", "Courier New")) {
        $f = New-Object System.Drawing.Font($n, $px, $style, [System.Drawing.GraphicsUnit]::Pixel)
        if ($f.Name -eq $n) { return $f }
        $f.Dispose()
    }
    return New-Object System.Drawing.Font("Consolas", $px, $style, [System.Drawing.GraphicsUnit]::Pixel)
}
$FontTitle = New-Font (Px 10) ([System.Drawing.FontStyle]::Bold)     # .console-title 0.6rem
$FontHead  = New-Font (Px 9)  ([System.Drawing.FontStyle]::Bold)     # .console-page-title
$FontBody  = New-Font (Px 9)  ([System.Drawing.FontStyle]::Regular)
$FontSmall = New-Font (Px 8)  ([System.Drawing.FontStyle]::Regular)
$FontTab   = New-Font (Px 7)  ([System.Drawing.FontStyle]::Regular)  # .console-tab-label

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
$radius = Px 16
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp.AddArc(0, 0, $radius, $radius, 180, 90)
$gp.AddArc((Px $FrameW) - $radius, 0, $radius, $radius, 270, 90)
$gp.AddArc((Px $FrameW) - $radius, (Px $FrameH) - $radius, $radius, $radius, 0, 90)
$gp.AddArc(0, (Px $FrameH) - $radius, $radius, $radius, 90, 90)
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
    $g.SetClip((New-Object System.Drawing.Rectangle($x, $y, $w, $h)))
    for ($ty = $y + ($offsetY * $Scale) - $th; $ty -lt $y + $h; $ty += $th) {
        for ($tx = $x; $tx -lt $x + $w; $tx += $tw) {
            Draw-Sprite $g $img $tx $ty $tw $th
        }
    }
    $g.Clip = $clip
}

function Draw-Text($g, [string]$text, $font, $colour, [int]$x, [int]$y) {
    $brush = New-Object System.Drawing.SolidBrush($colour)
    $g.DrawString($text, $font, $brush, [single]$x, [single]$y)
    $brush.Dispose()
}

function Draw-TextCentred($g, [string]$text, $font, $colour, [int]$cx, [int]$y) {
    $size = $g.MeasureString($text, $font)
    Draw-Text $g $text $font $colour ([int]($cx - $size.Width / 2)) $y
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
    $size = $g.MeasureString($text, $FontBody)
    Draw-Text $g $text $FontBody $colour ([int]($x + ($w - $size.Width) / 2)) ([int]($y + ($h - $size.Height) / 2))
    $script:Buttons += @{ Id = $id; Rect = $rect; Enabled = $enabled }
}

<# .console-hashline — the dashed rule under every page title. Actual '-'
   characters rather than a drawn line, which is what the stylesheet does
   too: a clean 1px rule looks wrong against sprite-sheet chrome. #>
function Draw-Hashline($g, [int]$x, [int]$y, [int]$w) {
    $dashW = $g.MeasureString("-", $FontBody).Width
    $n = [Math]::Max(1, [int]($w / [Math]::Max(1, $dashW - (Px 1))))
    Draw-Text $g ("-" * $n) $FontBody $ScreenDim $x $y
}

function Draw-Lines($g, $lines, [int]$x, [int]$y, [int]$w, [int]$h) {
    $lineH = [int]($g.MeasureString("Ag", $FontSmall).Height)
    $max = [Math]::Floor($h / $lineH)
    $start = [Math]::Max(0, $lines.Count - $max)
    $clip = $g.Clip
    $g.SetClip((New-Object System.Drawing.Rectangle($x, $y, $w, $h)))
    for ($i = $start; $i -lt $lines.Count; $i++) {
        Draw-Text $g $lines[$i] $FontSmall $ScreenDim $x ($y + ($i - $start) * $lineH)
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
    Draw-Text $g $statusText $FontHead $statusCol ($x + $w - [int]$g.MeasureString($statusText, $FontHead).Width) $y

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
        Draw-Text $g "SCANNING" $FontHead $Busy ($x + $w - [int]$g.MeasureString("SCANNING", $FontHead).Width) $y
    }
    $rowY = $y + (Px 24)
    Draw-Button $g "furni-all"  "FULL  RESCAN"      $x $rowY $w (Px 18) (-not $running)
    $rowY += Px 24
    Draw-Button $g "furni-add"  "FIND  NEW  FURNI"  $x $rowY $w (Px 18) (-not $running)
    $rowY += Px 24
    Draw-Button $g "furni-new"  "UNSCANNED  ONLY"   $x $rowY $w (Px 18) (-not $running)

    $logY = $rowY + (Px 26)
    Draw-Lines $g $script:FurniLines $x $logY $w ($h - ($logY - $y))
}

function Draw-PageMessages($g, [int]$x, [int]$y, [int]$w, [int]$h) {
    Draw-Text $g "Messages" $FontHead $Screen $x $y
    Draw-Hashline $g $x ($y + (Px 11)) $w
    Draw-Button $g "msg-refresh" "REFRESH" ($x + $w - (Px 52)) ($y - (Px 3)) (Px 52) (Px 14) $true
    Draw-Lines $g $script:MessageLines $x ($y + (Px 22)) $w ($h - (Px 22))
}

function Draw-PageSpare($g, [int]$x, [int]$y, [int]$w, [int]$h) {
    Draw-Text $g "Not In Use" $FontHead $Screen $x $y
    Draw-Hashline $g $x ($y + (Px 11)) $w
    Draw-Text $g "This slot is spare." $FontBody $ScreenDim $x ($y + (Px 26))
    Draw-Text $g "Something will earn it" $FontBody $ScreenDim $x ($y + (Px 38))
    Draw-Text $g "eventually." $FontBody $ScreenDim $x ($y + (Px 50))
}

# ---------- the whole frame ----------

$surface.Add_Paint({
    param($sender, $e)
    $g = $e.Graphics
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
    $script:Buttons = @()

    $W = Px $FrameW; $H = Px $FrameH

    $bg = New-Object System.Drawing.SolidBrush($Yellow)
    $g.FillRectangle($bg, 0, 0, $W, $H); $bg.Dispose()

    # .console-top-pattern — inset 3px, 23 tall, tile lowered 2px in place
    Draw-Tiled $g $SprPattern (Px 3) (Px 3) ($W - (Px 3)) (Px 23) 2

    Draw-Border $g $W $H

    # .console-title — its own opaque yellow band masks the pattern behind it
    $titleText = "Maze Rats"
    $tsize = $g.MeasureString($titleText, $FontTitle)
    $tw = [int]$tsize.Width + (Px 8)
    $tx = [int](($W - $tw) / 2)
    $tb = New-Object System.Drawing.SolidBrush($Yellow)
    $g.FillRectangle($tb, $tx, (Px 4), $tw, (Px 20)); $tb.Dispose()
    Draw-TextCentred $g $titleText $FontTitle $Brown ([int]($W / 2)) (Px 6)

    # Window buttons: close where the site has it, minimise beside it.
    $closeX = $W - (Px 14) - (Px 13)
    $minX = $closeX - (Px 15)
    Draw-Sprite $g $SprMin   $minX   (Px 6) (Px 13) (Px 13)
    Draw-Sprite $g $SprClose $closeX (Px 6) (Px 13) (Px 13)
    $script:Buttons += @{ Id = "win-min";   Rect = (New-Object System.Drawing.Rectangle($minX,   (Px 6), (Px 13), (Px 13))); Enabled = $true }
    $script:Buttons += @{ Id = "win-close"; Rect = (New-Object System.Drawing.Rectangle($closeX, (Px 6), (Px 13), (Px 13))); Enabled = $true }

    <# .console-screen — tiled dark ground inside a 1px black edge, with the
       stylesheet's own 15px corner radius. Clipped to that same path before
       the tiles go down, so the rounding is a real cut rather than a rounded
       outline sitting on square corners. #>
    $sx = Px $ScreenX; $sy = Px $ScreenY; $sw = Px $ScreenW; $sh = Px $ScreenH
    $sr = Px 15
    $sp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $sp.AddArc($sx, $sy, $sr, $sr, 180, 90)
    $sp.AddArc($sx + $sw - $sr, $sy, $sr, $sr, 270, 90)
    $sp.AddArc($sx + $sw - $sr, $sy + $sh - $sr, $sr, $sr, 0, 90)
    $sp.AddArc($sx, $sy + $sh - $sr, $sr, $sr, 90, 90)
    $sp.CloseFigure()

    $oldClip = $g.Clip
    $g.SetClip($sp)
    Draw-Tiled $g $SprTile $sx $sy $sw $sh
    $g.Clip = $oldClip
    # Antialiased only for this outline: a hard-edged arc at 2x shows its
    # stair-steps, and this is the one curve the eye follows.
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, $Scale)
    $g.DrawPath($edge, $sp); $edge.Dispose()
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $sp.Dispose()

    $padX = $sx + (Px 8); $padY = $sy + (Px 8)
    $padW = $sw - (Px 16); $padH = $sh - (Px 16)
    switch ($script:Page) {
        "server"   { Draw-PageServer   $g $padX $padY $padW $padH }
        "furni"    { Draw-PageFurni    $g $padX $padY $padW $padH }
        "messages" { Draw-PageMessages $g $padX $padY $padW $padH }
        default    { Draw-PageSpare    $g $padX $padY $padW $padH }
    }

    # .console-buttons — native-width tabs, butted together, centred as a group
    $totalW = 0; foreach ($t in $Tabs) { $totalW += Px $t.W }
    $tabX = [int](($W - $totalW) / 2)
    $tabY = $H - (Px $TabH)
    foreach ($t in $Tabs) {
        $tw2 = Px $t.W
        $active = ($script:Page -eq $t.Key)
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

function Test-Port {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $w = $c.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $w.AsyncWaitHandle.WaitOne(120)) { return $false }
        $c.EndConnect($w); return $true
    } catch { return $false } finally { $c.Dispose() }
}

function Add-Line($list, [string]$text) {
    $stamp = (Get-Date).ToString("HH:mm:ss")
    [void]$list.Add("$stamp $text")
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
   the second run would silently undo the first. Asked of the OS rather than
   remembered in a variable, because a variable cannot see across restarts. #>
function Test-ScanRunning {
    if ($null -ne $script:ScanProcess -and -not $script:ScanProcess.HasExited) { return $true }
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop
        foreach ($p in $procs) {
            if ($p.CommandLine -and $p.CommandLine -match "furni-scan-local\.js") { return $true }
        }
    } catch { }
    return $false
}

function Start-Scan([string]$mode) {
    if (Test-ScanRunning) {
        Add-Line $script:FurniLines "A scan is already running."
        return
    }
    $args = @((Join-Path $RepoRoot "tools\furni-scan-local.js"))
    switch ($mode) {
        "add" { $args += "--additive" }
        "new" { $args += "--only-unscanned" }
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
    $psi.Arguments = "/c node " + (($args | ForEach-Object { "`"$_`"" }) -join " ") + " > `"$ScanLog`" 2>&1"
    $psi.WorkingDirectory = $RepoRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $script:ScanProcess = [System.Diagnostics.Process]::Start($psi)
}

function Load-Messages {
    $script:MessageLines.Clear()
    Add-Line $script:MessageLines "Loading..."
    $surface.Invalidate()
    try {
        $out = & node (Join-Path $RepoRoot "tools\list-messages.js") --limit 12 2>&1
        $script:MessageLines.Clear()
        foreach ($l in $out) {
            $t = To-Ascii ("$l".TrimEnd())
            if ($t.Length -gt 52) { $t = $t.Substring(0, 49) + "..." }
            [void]$script:MessageLines.Add($t)
        }
    } catch {
        $script:MessageLines.Clear()
        [void]$script:MessageLines.Add("Couldn't read messages.")
    }
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
        if ($clean.Length -gt 46) { $clean = $clean.Substring(0, 43) + "..." }
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

$surface.Add_MouseMove({
    param($sender, $e)
    $b = Hit $e.X $e.Y
    $id = if ($null -ne $b -and $b.Enabled) { $b.Id } else { "" }
    if ($id -ne $script:Hot) {
        $script:Hot = $id
        $surface.Cursor = if ($id) { [System.Windows.Forms.Cursors]::Hand } else { [System.Windows.Forms.Cursors]::Default }
        $surface.Invalidate()
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
        "msg-refresh" { Load-Messages }
        default {
            if ($b.Id -like "tab-*") {
                $script:Page = $b.Id.Substring(4)
                if ($script:Page -eq "messages" -and $script:MessageLines.Count -eq 0) { Load-Messages }
            }
        }
    }
    $surface.Invalidate()
})

# ---------- polling ----------
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
    foreach ($l in (Read-Tail $LogPath ([ref]$script:LogRead))) { Add-Line $script:ServerLines $l }
    foreach ($l in (Read-Tail $ScanLog ([ref]$script:ScanRead))) { Add-Line $script:FurniLines $l }

    if ($script:Starting -and (Test-Port)) {
        $script:Starting = $false
        Add-Line $script:ServerLines "Ready at localhost:$Port"
    }
    if ($script:Starting -and $null -ne $script:ServerProcess -and $script:ServerProcess.HasExited) {
        $script:Starting = $false
        Add-Line $script:ServerLines "Netlify exited before the server came up."
    }
    if ($null -ne $script:ScanProcess -and $script:ScanProcess.HasExited) {
        Add-Line $script:FurniLines "Scan finished."
        $script:ScanProcess = $null
    }
    # A scan started before this window opened leaves its last lines in the
    # log; once it is gone, say so rather than sitting on SCANNING forever.
    if ($script:SawForeignScan -and -not (Test-ScanRunning)) {
        $script:SawForeignScan = $false
        Add-Line $script:FurniLines "Scan finished."
    }
    $surface.Invalidate()
})

$form.Add_Shown({
    [void][Native.Win]::ShowWindow($form.Handle, $SW_SHOW)
    [void][Native.Win]::SetForegroundWindow($form.Handle)
    $timer.Start()
    Add-Line $script:ServerLines $(if (Test-Port) { "Server already running." } else { "Ready. Press START." })
    if (Test-ScanRunning) {
        $script:SawForeignScan = $true
        Add-Line $script:FurniLines "A scan is already running."
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

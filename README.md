# Maze Rats

A Habbo Hotel: Origins maze room archive — the site at
[mazerats.net](https://mazerats.net), plus the tools that keep it fed.

The site itself is plain HTML, CSS and JavaScript served by Netlify, with
Netlify Functions in front of MongoDB. There is no build step: what is in
this repo is what gets served.

---

## Running it on a new machine

Everything below is a one-off. After it, the whole thing is one shortcut on
the Desktop.

### 1. Install the two things this needs

- **[Node.js](https://nodejs.org)** 18 or newer.
- **The Netlify CLI**, which is what actually serves the site locally:

```bash
npm install -g netlify-cli
```

### 2. Get the code and its dependencies

```bash
git clone <this repo> && cd MazeRatsWebsite && npm install
```

### 3. Add the credentials

Copy `.env.example` to `.env` and fill it in. The values are live
credentials for the real site, so they are not in this repo — ask whoever
runs it. Nothing works without `MONGODB_URI`.

```bash
cp .env.example .env
```

### 4. Put the console on the Desktop

```bash
powershell -ExecutionPolicy Bypass -File tools/install-shortcut.ps1
```

That is the whole setup. Double-click **Maze Rats Dev Server** and the
console opens.

> The shortcut works out every path from where the repo actually sits, so
> the folder can live anywhere and can be moved later — just run the
> installer again afterwards.

---

## The dev console

`tools/dev-console.ps1`, launched by the shortcut. It is the site's own
Habbo console, drawn with the same sprites the website loads, running as a
real window — four tabs across the bottom:

| Tab | What it does |
| --- | --- |
| **SERVER** | Starts and stops the local dev server, and opens the admin page. Closing the console stops a server it started. |
| **MESSAGES** | The most recent messages people have sent through the console on the live site. |
| **FURNI** | Runs the furni scans. Full rescan, find-new-only, or unscanned-only, over the whole archive or just the mazes you pick — and stops one that is already running, including one this window did not start. |
| **OPTIONS** | How sure a match has to be, and which furni a scan must never record. |

Everything it needs is in the repo — including the fonts, which it loads
from `assets/fonts` rather than expecting them to be installed.

### Scan options

**Strictness** decides how much of a furni's sprite has to actually be
visible before the scan believes it is there. Four settings, cycled by
pressing the button:

| | Coverage | |
| --- | --- | --- |
| `LOOSE` | 10% | More finds, and roughly half the extra is wrong |
| `NORMAL` | 15% | What the archive was scanned at |
| `STRICT` | 20% | Fewer mistakes, loses some real finds |
| `STRICTEST` | 25% | Only what is plainly visible |

The reasoning behind 15% — including the room-by-room comparison it came
from — is written up at the top of `netlify/functions/_furni-match.js`. It
is worth reading before moving it far.

**Omit list** — furni a scan must never add. Some large, flat, common
sprites find honest agreement against the wrong background and keep turning
up in rooms that do not contain them; raising the strictness for the whole
archive to silence one of those costs real finds everywhere else, so they
are named individually instead.

Press **EDIT LIST**, type, and the catalogue is searched as you go. Press a
result to add it, press an entry in the list to remove it. `Enter` adds
whatever you typed even if it is not a real furni name, which is how you
enter a wildcard: `Dungeon Floor*` covers every colour of it.

The list is `tools/furni-omit.txt` and it is committed, so it travels with
the repo — which furni the matcher gets wrong is a finding about the
archive, not a local preference. Only scans obey it; furni added by hand in
the admin page always stay.

**Maze selector** — which mazes a scan covers. Press **MAZE SELECTOR** on
the FURNI page, type to filter, press a maze to tick it. Pick as many as you
like; picking none means the whole archive, which is the default.

A selection narrows all three scan buttons, so `FULL RESCAN` with two mazes
ticked is a full rescan of those two. The strictness and the omit list are
unaffected by it — they decide how a match is judged, not what the scan is
pointed at — so all three apply together.

The FURNI page always shows the scope above the buttons, in brighter text
whenever it is not "all mazes":

```
normal 15%  -  2 omit  -  2 mazes
```

The selection is remembered between sessions, so an interrupted scan can be
resumed by reopening the console and pressing the same button. That is also
why the line above exists — a narrowed scan that looked identical to a full
one would be how someone rescans three mazes, sees "Done", and believes the
archive was done.

Press **REFRESH** in the selector after adding a maze in the admin page;
the list is cached in `tools/.cache/`.

---

## Running the scans from a terminal

The console is a front end to `tools/furni-scan-local.js`, which is usable
directly and takes more options than the console exposes:

```bash
node tools/furni-scan-local.js --dry-run                 # plan only, no writes
node tools/furni-scan-local.js --only-unscanned          # skip finished images
node tools/furni-scan-local.js --additive                # only ADD new finds
node tools/furni-scan-local.js --maze "Old School Maze"
node tools/furni-scan-local.js --strictness strict
node tools/furni-scan-local.js --coverage 0.22           # or the raw number
node tools/furni-scan-local.js --omit "Bonsai Tree,Dungeon Floor*"
node tools/furni-scan-local.js --no-omit                 # ignore the list
```

A run reads `tools/furni-omit.txt` itself, so a terminal scan and a console
scan obey exactly the same list.

Interrupting is always safe: every image is written as it lands, so
`--only-unscanned` picks up exactly where it stopped.

Other tools worth knowing about:

| | |
| --- | --- |
| `tools/list-furni.js` | Flattens the catalogue to names, for the console's omit search |
| `tools/list-mazes.js` | Lists every maze with its image count, for the maze selector |
| `tools/furni-verify.js` | Draws each candidate match beside the room pixels it claims, for judging a threshold by eye |
| `tools/list-messages.js` | The console messages, in the terminal |

---

## Layout

```
admin.html, home.html, index.html    the site
css/, js/, assets/                   its stylesheet, scripts, art and fonts
netlify/functions/                   the API, and the furni matcher
tools/                               the dev console and its scan tools
tools/.cache/                        sprite cache, furni names, local prefs
                                       (git-ignored, rebuilt on demand)
```

`tools/.cache/` is disposable. Deleting it costs one slow first scan while
the sprite library refills, and nothing else.

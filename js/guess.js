/* Guess the Maze — one puzzle a day, cut out of the archive itself.

   A crop of a real room from a real maze, and six guesses. Every wrong one
   widens the view a little, so the picture argues its way from "an abstract
   patch of pixels" to "oh, THAT one" rather than simply being right or
   wrong at the first look.

   Nothing here is authored. The archive already holds five hundred-odd room
   screenshots across thirty-odd mazes; the whole puzzle is choosing one of
   them well and deciding where to cut.

   ----------------------------------------------------------------------
   Choosing where to cut

   Habbo room screenshots are an isometric room floating on a large black
   background, so a crop taken at random is very often a square of nothing.
   The obvious guard — "the crop must contain at least N colours" — is too
   weak on its own in both directions: black plus three pixels of
   anti-aliasing passes it, and a big flat single-colour floor tile passes it
   too while being completely unguessable.

   So a candidate is scored on three things instead, and the best of forty is
   taken rather than the first that qualifies:

     1. How much of it is NOT background. The background colour is learned
        from the image's own corners rather than assumed to be black, so a
        room shot on a lighter ground is judged on its own terms. This is the
        signal that actually kills empty crops.
     2. How many distinct colours it holds. Twelve, not four — furni are
        colourful and flat floor is not.
     3. How varied it is, as mean deviation from the crop's own average.
        This is what separates "a wall" from "a corner with things in it".

   The three are combined rather than used as gates, so a crop that is a
   little plain but very busy can still win, and vice versa.
   ---------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
    const stage = document.getElementById("guess-stage");
    const canvas = document.getElementById("guess-canvas");
    const statusEl = document.getElementById("guess-status");
    const form = document.getElementById("guess-form");
    const input = document.getElementById("guess-input");
    const suggestEl = document.getElementById("guess-suggest");
    const submitBtn = document.getElementById("guess-submit");
    const skipBtn = document.getElementById("guess-skip");
    const rowsEl = document.getElementById("guess-rows");
    const outcomeEl = document.getElementById("guess-outcome");
    const shareBtn = document.getElementById("guess-share");
    const countEl = document.getElementById("guess-count");

    const TRIES = 6;
    const STORE_KEY = "mazerats_guess";

    let ROOMS = [];
    let puzzle = null;      // { maze, imageUrl, cx, cy }
    let state = null;       // { day, guesses: [], done, won }
    let sourceImage = null;

    // ---------- a stable random, one puzzle per day ----------

    /* The same puzzle for everyone, everywhere, without a server deciding.

       The date in UTC is the seed, so the day turns over at the same instant
       for every player rather than at each player's local midnight — two
       people comparing grids in a Discord channel are then always talking
       about the same picture. */
    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    // mulberry32 — small, fast, and good enough that consecutive days do not
    // visibly rhyme. The point is reproducibility, not cryptography.
    function seededRandom(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function seedFrom(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    // ---------- picking the day's room ----------

    /* Every room picture in the archive, as one flat pool.

       Entrance shots are left out on purpose: they are the image most likely
       to carry the maze's name on a wall or a sign, and they are also the
       thumbnail shown on the archive's own rows, so they are the one picture
       a regular visitor could recognise without having walked the maze. */
    function puzzlePool() {
        const pool = [];
        ROOMS.forEach(room => {
            if (!room.name) return;
            (room.gallery || []).forEach(g => {
                if (g && g.image) pool.push({ maze: room, image: g.image });
            });
        });
        return pool;
    }

    // ---------- reading the picture ----------

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // Same origin (everything goes through /.netlify/images), so the
            // canvas is never tainted and getImageData works — which the
            // whole scoring pass depends on.
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("image failed"));
            img.src = src;
        });
    }

    /* The colour the picture sits on, learned rather than assumed.

       Sampled from all four corners and taken as the most common of them, so
       a room shot against something other than black is still judged
       correctly. */
    function backgroundOf(data, w, h) {
        const at = (x, y) => {
            const i = (y * w + x) * 4;
            return [data[i], data[i + 1], data[i + 2]];
        };
        const corners = [at(2, 2), at(w - 3, 2), at(2, h - 3), at(w - 3, h - 3)];
        const tally = new Map();
        corners.forEach(c => {
            const k = c.join(",");
            tally.set(k, (tally.get(k) || 0) + 1);
        });
        let best = corners[0], bestN = 0;
        tally.forEach((n, k) => {
            if (n > bestN) { bestN = n; best = k.split(",").map(Number); }
        });
        return best;
    }

    // Generous, because Habbo's backgrounds are flat but its PNG edges are
    // not: a pixel within this distance of the ground colour is ground.
    const BG_TOLERANCE = 26;

    function scoreCrop(data, w, bg, x0, y0, size) {
        const step = Math.max(1, Math.floor(size / 40));   // ~1600 samples, whatever the size
        let samples = 0, solid = 0, sum = 0;
        const colours = new Set();
        const lums = [];

        for (let y = y0; y < y0 + size; y += step) {
            for (let x = x0; x < x0 + size; x += step) {
                const i = (y * w + x) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                samples++;
                if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > BG_TOLERANCE) solid++;
                // Quantised, so two shades a hair apart are not counted as
                // two different colours.
                colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
                const l = 0.299 * r + 0.587 * g + 0.114 * b;
                lums.push(l);
                sum += l;
            }
        }
        if (!samples) return 0;

        const solidFrac = solid / samples;
        // Below this the crop is mostly empty ground and no amount of
        // colour elsewhere in it should rescue it.
        if (solidFrac < 0.85) return 0;
        if (colours.size < 12) return 0;

        const mean = sum / lums.length;
        let dev = 0;
        for (const l of lums) dev += Math.abs(l - mean);
        const variance = (dev / lums.length) / 128;   // 0..~1

        /* Weighted rather than gated. Fullness is the floor the crop has
           already cleared, so it counts least here; how much is GOING ON in
           it is what makes a picture worth guessing from. */
        return solidFrac * 0.3
            + Math.min(1, colours.size / 90) * 0.35
            + Math.min(1, variance) * 0.35;
    }

    /* Where to cut. Returns the centre of the best-scoring square found, in
       pixels, or null if the picture has nothing worth cropping — a room
       shot that is almost all background, which does happen. */
    function findCropCentre(img, rand) {
        const w = img.naturalWidth, h = img.naturalHeight;
        const probe = document.createElement("canvas");
        probe.width = w; probe.height = h;
        const ctx = probe.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, w, h);
        const bg = backgroundOf(data, w, h);

        // Scored at the size the puzzle OPENS at — the tightest crop is the
        // one that has to be interesting, since it is the one most players
        // will be looking at when they guess.
        const size = Math.round(Math.min(w, h) * 0.16);
        if (size < 24) return null;

        let best = null, bestScore = 0;
        for (let i = 0; i < 40; i++) {
            const x0 = Math.floor(rand() * (w - size));
            const y0 = Math.floor(rand() * (h - size));
            const s = scoreCrop(data, w, bg, x0, y0, size);
            if (s > bestScore) { bestScore = s; best = { x: x0 + size / 2, y: y0 + size / 2 }; }
        }
        return best;
    }

    // ---------- drawing ----------

    /* Each wrong guess widens the view around the same centre, so the reveal
       reads as stepping back from one spot rather than as being shown a
       different picture each time. The last step is nearly half the image,
       which is usually enough to place the room without simply giving it. */
    const REVEAL = [0.16, 0.21, 0.27, 0.34, 0.42, 0.52];

    function draw() {
        if (!sourceImage || !puzzle) return;
        const img = sourceImage;
        const step = Math.min(state.guesses.length, REVEAL.length - 1);
        const frac = state.done && !state.won ? 1 : REVEAL[step];

        const w = img.naturalWidth, h = img.naturalHeight;
        const size = Math.round(Math.min(w, h) * frac);

        // Clamped so an expanding crop near an edge slides inward instead of
        // running off and drawing blank canvas.
        const half = size / 2;
        const cx = Math.max(half, Math.min(w - half, puzzle.cx));
        const cy = Math.max(half, Math.min(h - half, puzzle.cy));

        const out = canvas.getContext("2d");
        const side = canvas.width;
        out.imageSmoothingEnabled = false;   // pixel art: never blur it
        out.clearRect(0, 0, side, side);

        if (state.done && !state.won) {
            // The whole picture at the end, letterboxed rather than cropped:
            // the answer should be the room as it really is.
            const scale = Math.min(side / w, side / h);
            const dw = w * scale, dh = h * scale;
            out.drawImage(img, (side - dw) / 2, (side - dh) / 2, dw, dh);
            return;
        }
        out.drawImage(img, cx - half, cy - half, size, size, 0, 0, side, side);
    }

    // ---------- the day's state, remembered ----------

    function loadState() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { saved = null; }
        // Yesterday's game is not this one. A stored day that isn't today is
        // dropped rather than migrated.
        if (saved && saved.day === today()) return saved;
        return { day: today(), guesses: [], done: false, won: false };
    }

    function saveState() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }

    // ---------- rendering the board ----------

    function renderRows() {
        const rows = [];
        for (let i = 0; i < TRIES; i++) {
            const g = state.guesses[i];
            if (!g) {
                rows.push(`<li class="guess-row is-empty"><span class="guess-row-n">${i + 1}</span><span class="guess-row-text"></span></li>`);
            } else if (g.skipped) {
                rows.push(`<li class="guess-row is-skip"><span class="guess-row-n">${i + 1}</span><span class="guess-row-text">Skipped</span></li>`);
            } else {
                const right = g.correct;
                rows.push(`<li class="guess-row ${right ? "is-right" : "is-wrong"}">
                    <span class="guess-row-n">${i + 1}</span>
                    <span class="guess-row-text">${escapeHtml(g.name)}</span>
                    <span class="guess-row-mark" aria-hidden="true">${right ? "✓" : "✕"}</span>
                </li>`);
            }
        }
        rowsEl.innerHTML = rows.join("");
        countEl.textContent = state.done
            ? ""
            : `${TRIES - state.guesses.length} of ${TRIES} guesses left`;
    }

    function renderOutcome() {
        if (!state.done) {
            outcomeEl.hidden = true;
            form.hidden = false;
            skipBtn.hidden = false;
            return;
        }
        form.hidden = true;
        skipBtn.hidden = true;
        outcomeEl.hidden = false;

        const maze = puzzle.maze;
        const n = state.guesses.filter(g => !g.skipped).length;
        outcomeEl.innerHTML = `
            <p class="guess-verdict">${state.won
                ? `Got it in ${n} ${n === 1 ? "guess" : "guesses"}.`
                : "Out of guesses."}</p>
            <p class="guess-answer">It was <strong>${escapeHtml(maze.name)}</strong>${maze.creator ? ` by ${escapeHtml(maze.creator)}` : ""}.</p>
            <p class="guess-links">
                <a href="home.html#maze-${encodeURIComponent(maze.id)}">Open it in the archive</a>
            </p>`;
        shareBtn.hidden = false;
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // ---------- guessing ----------

    function normalise(s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function submitGuess(name, skipped) {
        if (state.done) return;
        const correct = !skipped && normalise(name) === normalise(puzzle.maze.name);
        state.guesses.push({ name, correct, skipped: !!skipped });
        if (correct) { state.done = true; state.won = true; }
        else if (state.guesses.length >= TRIES) { state.done = true; state.won = false; }
        saveState();
        renderRows();
        renderOutcome();
        draw();
        input.value = "";
        hideSuggest();
    }

    // ---------- the name picker ----------

    function hideSuggest() {
        suggestEl.hidden = true;
        suggestEl.innerHTML = "";
    }

    function showSuggest() {
        const q = normalise(input.value);
        if (!q) return hideSuggest();
        const already = new Set(state.guesses.map(g => normalise(g.name)));
        const hits = ROOMS
            .filter(r => r.name && normalise(r.name).includes(q) && !already.has(normalise(r.name)))
            .sort((a, b) => compareNames(a.name, b.name))
            .slice(0, 6);
        if (!hits.length) return hideSuggest();
        suggestEl.innerHTML = hits
            .map(r => `<button type="button" class="guess-suggest-item" data-name="${escapeHtml(r.name)}">${escapeHtml(r.name)}</button>`)
            .join("");
        suggestEl.hidden = false;
    }

    input.addEventListener("input", showSuggest);
    input.addEventListener("focus", showSuggest);
    suggestEl.addEventListener("click", e => {
        const btn = e.target.closest(".guess-suggest-item");
        if (!btn) return;
        input.value = btn.dataset.name;
        hideSuggest();
        input.focus();
    });
    document.addEventListener("click", e => {
        if (!e.target.closest(".guess-entry")) hideSuggest();
    });

    form.addEventListener("submit", e => {
        e.preventDefault();
        const typed = input.value.trim();
        if (!typed) return;
        /* Only a real maze name counts. A typo would otherwise burn a guess
           on a maze that does not exist, which is a bad way to lose — the
           picker above is there precisely so nobody has to spell "Laberinto
           Cooperativo" correctly. */
        const match = ROOMS.find(r => r.name && normalise(r.name) === normalise(typed));
        if (!match) {
            statusEl.textContent = "No maze in the archive by that name — pick one from the list.";
            statusEl.hidden = false;
            return;
        }
        statusEl.hidden = true;
        submitGuess(match.name, false);
    });

    skipBtn.addEventListener("click", () => submitGuess("", true));

    // ---------- sharing ----------

    /* The spoiler-free grid, which is the whole social mechanic: it says how
       it went and nothing about what the answer was. */
    shareBtn.addEventListener("click", async () => {
        const squares = state.guesses
            .map(g => (g.correct ? "🟩" : g.skipped ? "⬜" : "🟥"))
            .join("");
        const score = state.won ? `${state.guesses.length}/${TRIES}` : `X/${TRIES}`;
        const text = `Maze Rats — Guess the Maze ${state.day}\n${score} ${squares}\nmazerats.net/guess`;
        try {
            await navigator.clipboard.writeText(text);
            shareBtn.textContent = "Copied";
        } catch (e) {
            // Clipboard needs a secure context and permission; neither is
            // guaranteed. Falling back to a selectable box beats a button
            // that silently does nothing.
            const box = document.createElement("textarea");
            box.className = "guess-share-fallback";
            box.readOnly = true;
            box.value = text;
            shareBtn.insertAdjacentElement("afterend", box);
            box.select();
            shareBtn.textContent = "Copy this";
        }
        setTimeout(() => { shareBtn.textContent = "Share"; }, 2200);
    });

    // ---------- start ----------

    async function start() {
        try {
            ROOMS = await Api.getRooms();
        } catch (e) {
            statusEl.textContent = "The archive could not be loaded, so there is no puzzle today. Try again in a moment.";
            statusEl.hidden = false;
            return;
        }

        const pool = puzzlePool();
        if (!pool.length) {
            statusEl.textContent = "There are no room pictures in the archive to make a puzzle from yet.";
            statusEl.hidden = false;
            return;
        }

        state = loadState();
        const rand = seededRandom(seedFrom(today()));

        /* Walks the shuffled pool until one of them yields a usable crop,
           rather than trusting the first pick. A room shot that is mostly
           background scores nothing anywhere in it, and the day's puzzle
           should not be "a black square" because the dice landed there.

           Capped so a badly scanned archive cannot spin: after twelve
           attempts it takes the last one regardless, which is still a real
           room from a real maze. */
        const order = pool.map((p, i) => ({ p, k: rand(), i }))
            .sort((a, b) => a.k - b.k)
            .map(o => o.p);

        for (let i = 0; i < Math.min(12, order.length); i++) {
            const pick = order[i];
            let img;
            try { img = await loadImage(imgCdn(pick.image, 900, null, 82)); } catch (e) { continue; }
            const centre = findCropCentre(img, seededRandom(seedFrom(today() + ":" + i)));
            if (!centre && i < Math.min(12, order.length) - 1) continue;
            sourceImage = img;
            puzzle = {
                maze: pick.maze,
                imageUrl: pick.image,
                cx: centre ? centre.x : img.naturalWidth / 2,
                cy: centre ? centre.y : img.naturalHeight / 2
            };
            break;
        }

        if (!puzzle) {
            statusEl.textContent = "Today's picture could not be prepared. Try again in a moment.";
            statusEl.hidden = false;
            return;
        }

        stage.classList.add("is-ready");
        renderRows();
        renderOutcome();
        draw();
        if (!state.done) input.focus();
    }

    start();
});

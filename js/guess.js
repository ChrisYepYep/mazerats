/* Guess the Maze — five rooms a day, cut out of the archive itself.

   A crop of a real room from a real maze, and four guesses at which maze it
   is. Every wrong one widens the view a little, so the picture argues its
   way from "an abstract patch of pixels" to "oh, THAT one" rather than
   simply being right or wrong at first sight. Five of those makes a sitting
   — one was over before it had started.

   Nothing here is authored. The archive already holds five hundred-odd room
   screenshots across thirty-odd mazes; the whole game is choosing five of
   them well and deciding where to cut.

   It lives in a window on the homepage rather than on a page of its own,
   opened by the tab on the right-hand edge of the archive. A daily game
   nobody can find is a daily game nobody plays.

   ----------------------------------------------------------------------
   Choosing where to cut

   Habbo room screenshots are a small isometric room floating on a large
   black background, so a crop taken at random is very often a square of
   nothing. The obvious guard — "the crop must contain at least N colours" —
   is too weak in both directions: black plus three pixels of anti-aliasing
   passes it, and a big flat single-colour floor tile passes it too while
   being completely unguessable.

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
(function () {
    "use strict";

    const ROUNDS = 5;
    const TRIES = 4;
    const STATE_KEY = "mazerats_guess_v2";
    const STATS_KEY = "mazerats_guess_stats";

    /* Each wrong guess widens the view around the same centre, so the reveal
       reads as stepping back from one spot rather than as being shown a
       different picture each time. The last step is about half the image,
       which is usually enough to place a room without simply giving it. */
    const REVEAL = [0.16, 0.24, 0.34, 0.46];

    let el = {};          // the window's elements, filled by mount()
    let ROOMS = [];
    let pool = [];
    let state = null;     // this day's play
    let stats = null;     // the running record across days
    let round = null;     // { maze, image, cx, cy, img } for the round in play
    let preparing = false;

    // ---------- a stable random, one set of rooms per day ----------

    /* The same five rooms for everyone, everywhere, without a server
       deciding. The date in UTC is the seed, so the day turns over at the
       same instant for every player rather than at each player's local
       midnight — two people comparing grids in a Discord channel are then
       always talking about the same rooms. */
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

    // ---------- choosing the day's five rooms ----------

    /* Every room picture in the archive, as one flat pool.

       Entrance shots are left out on purpose: they are the image most likely
       to carry the maze's name on a wall or a sign, and they are also the
       thumbnail on the archive's own rows, so they are the one picture a
       regular visitor could recognise without ever having walked the maze. */
    function buildPool() {
        const out = [];
        ROOMS.forEach(room => {
            if (!room.name || !room.id) return;
            (room.gallery || []).forEach(g => {
                if (g && g.image) out.push({ maze: room, image: g.image });
            });
        });
        return out;
    }

    /* The day's five, drawn so that no maze appears twice.

       Five rounds all from the same maze would be five chances at one
       answer, which is both easier and duller than five different ones.
       Falls back to allowing repeats only if the archive is too small to
       fill five rounds otherwise, which it is not today and might be on a
       fresh install. */
    function pickDay() {
        const rand = seededRandom(seedFrom(today()));
        const shuffled = pool
            .map(p => ({ p, k: rand() }))
            .sort((a, b) => a.k - b.k)
            .map(o => o.p);

        const chosen = [];
        const usedMazes = new Set();
        for (const item of shuffled) {
            if (chosen.length >= ROUNDS) break;
            if (usedMazes.has(item.maze.id)) continue;
            usedMazes.add(item.maze.id);
            chosen.push(item);
        }
        for (const item of shuffled) {
            if (chosen.length >= ROUNDS) break;
            if (!chosen.includes(item)) chosen.push(item);
        }
        return chosen;
    }

    // ---------- reading the picture ----------

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // Same origin (everything goes through /.netlify/images), so the
            // canvas is never tainted and getImageData works — which the
            // whole scoring pass below depends on.
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("image failed"));
            img.src = src;
        });
    }

    /* The colour the picture sits on, learned rather than assumed. Sampled
       from all four corners and taken as the most common of them, so a room
       shot against something other than black is still judged correctly. */
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
        const step = Math.max(1, Math.floor(size / 40));   // ~1600 samples at any size
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
        // Below this the crop is mostly empty ground, and no amount of colour
        // elsewhere in it should rescue it.
        if (solidFrac < 0.85) return 0;
        if (colours.size < 12) return 0;

        const mean = sum / lums.length;
        let dev = 0;
        for (const l of lums) dev += Math.abs(l - mean);
        const variance = (dev / lums.length) / 128;   // 0..~1

        /* Weighted rather than gated. Fullness is a floor the crop has
           already cleared, so it counts least; how much is GOING ON in it is
           what makes a picture worth guessing from. */
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

        // Scored at the size the round OPENS at — the tightest crop is the
        // one that has to be interesting, since it is what most players are
        // looking at when they make their first guess.
        const size = Math.round(Math.min(w, h) * REVEAL[0]);
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

    function draw() {
        if (!round || !round.img) return;
        const img = round.img;
        const result = state.results[state.round];
        const guessCount = result ? result.guesses.length : 0;
        const solvedOrSpent = result && result.done;

        const step = Math.min(guessCount, REVEAL.length - 1);
        const frac = solvedOrSpent ? 1 : REVEAL[step];

        const w = img.naturalWidth, h = img.naturalHeight;
        const out = el.canvas.getContext("2d");
        const side = el.canvas.width;
        out.imageSmoothingEnabled = false;   // pixel art: never blur it
        out.clearRect(0, 0, side, side);

        if (solvedOrSpent) {
            // The whole picture once the round is over, letterboxed rather
            // than cropped: the answer should be the room as it really is.
            const scale = Math.min(side / w, side / h);
            const dw = w * scale, dh = h * scale;
            out.drawImage(img, (side - dw) / 2, (side - dh) / 2, dw, dh);
            return;
        }

        const size = Math.round(Math.min(w, h) * frac);
        // Clamped so an expanding crop near an edge slides inward instead of
        // running off and drawing blank canvas.
        const half = size / 2;
        const cx = Math.max(half, Math.min(w - half, round.cx));
        const cy = Math.max(half, Math.min(h - half, round.cy));
        out.drawImage(img, cx - half, cy - half, size, size, 0, 0, side, side);
    }

    // ---------- what is remembered ----------

    function blankDay() {
        return {
            day: today(),
            round: 0,
            // One entry per round: { guesses: [{name, correct}], done, won }
            results: Array.from({ length: ROUNDS }, () => ({ guesses: [], done: false, won: false })),
            done: false
        };
    }

    function loadState() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        // Yesterday's game is not this one, and a stored day from a older
        // shape is not either — both are dropped rather than migrated.
        if (saved && saved.day === today() && Array.isArray(saved.results) && saved.results.length === ROUNDS) {
            return saved;
        }
        return blankDay();
    }

    function saveState() {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }

    function loadStats() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(STATS_KEY) || "null"); } catch (e) { s = null; }
        return s && typeof s === "object"
            ? { days: 0, solved: 0, rounds: 0, streak: 0, best: 0, lastDay: "", ...s }
            : { days: 0, solved: 0, rounds: 0, streak: 0, best: 0, lastDay: "" };
    }

    function saveStats() {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* private mode */ }
    }

    function yesterdayOf(iso) {
        const d = new Date(iso + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    /* Banked once, when the fifth round finishes.

       The streak counts days FINISHED, not days opened — otherwise it
       rewards clicking the tab and closing it, which is not the habit worth
       encouraging. Recorded against the day itself rather than a counter, so
       replaying the same day (a second tab, a refresh) cannot inflate it. */
    function bankDay() {
        if (stats.lastDay === state.day) return;
        const solved = state.results.filter(r => r.won).length;
        stats.streak = stats.lastDay === yesterdayOf(state.day) ? stats.streak + 1 : 1;
        stats.best = Math.max(stats.best, stats.streak);
        stats.days += 1;
        stats.rounds += ROUNDS;
        stats.solved += solved;
        stats.lastDay = state.day;
        saveStats();
    }

    // ---------- preparing a round ----------

    /* Walks the day's picks for this round until one yields a usable crop.

       A room shot that is mostly background scores nothing anywhere in it,
       and a round should not be "a black square" because the dice landed
       there. If the round's own picture cannot be cropped it falls back to
       the middle of it, which is still a real room from a real maze. */
    async function prepareRound() {
        if (preparing) return;
        preparing = true;
        round = null;
        setBusy(true);

        const picks = pickDay();
        const pick = picks[state.round];
        if (!pick) { preparing = false; setBusy(false); return; }

        let img = null;
        try {
            img = await loadImage(imgCdn(pick.image, 900, null, 82));
        } catch (e) {
            el.status.textContent = "That room's picture would not load. Skipping to the next.";
            el.status.hidden = false;
            preparing = false;
            setBusy(false);
            return;
        }

        const centre = findCropCentre(img, seededRandom(seedFrom(today() + ":" + state.round)));
        round = {
            maze: pick.maze,
            image: pick.image,
            img,
            cx: centre ? centre.x : img.naturalWidth / 2,
            cy: centre ? centre.y : img.naturalHeight / 2
        };
        preparing = false;
        setBusy(false);
        renderAll();
    }

    function setBusy(on) {
        el.window.classList.toggle("is-busy", on);
    }

    // ---------- guessing ----------

    function normalise(s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function currentResult() {
        return state.results[state.round];
    }

    function submitGuess(name) {
        const result = currentResult();
        if (!result || result.done || !round) return;

        const correct = normalise(name) === normalise(round.maze.name);
        result.guesses.push({ name, correct });
        if (correct) { result.done = true; result.won = true; }
        else if (result.guesses.length >= TRIES) { result.done = true; result.won = false; }

        if (result.done && state.round === ROUNDS - 1) {
            state.done = true;
            bankDay();
        }
        saveState();
        renderAll();
    }

    function nextRound() {
        if (state.round >= ROUNDS - 1) return;
        state.round += 1;
        saveState();
        el.input.value = "";
        hideSuggest();
        prepareRound();
        renderAll();
    }

    // ---------- the name picker ----------

    function hideSuggest() {
        el.suggest.hidden = true;
        el.suggest.innerHTML = "";
    }

    function showSuggest() {
        const q = normalise(el.input.value);
        if (!q) return hideSuggest();
        const result = currentResult();
        const already = new Set((result ? result.guesses : []).map(g => normalise(g.name)));
        const hits = ROOMS
            .filter(r => r.name && normalise(r.name).includes(q) && !already.has(normalise(r.name)))
            .sort((a, b) => compareNames(a.name, b.name))
            .slice(0, 6);
        if (!hits.length) return hideSuggest();
        el.suggest.innerHTML = hits
            .map(r => `<button type="button" class="guess-suggest-item" data-name="${escapeHtml(r.name)}">${escapeHtml(r.name)}</button>`)
            .join("");
        el.suggest.hidden = false;
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // ---------- the board ----------

    /* One square per round, in the order they were played.

       The colour says how it went WITHOUT naming anything, which is what
       makes the grid safe to paste into a channel where other people have
       not played yet. */
    function squareFor(result) {
        if (!result || !result.done) return "⬛";
        if (!result.won) return "🟥";
        const n = result.guesses.length;
        return n === 1 ? "🟩" : n === 2 ? "🟨" : "🟧";
    }

    function renderPips() {
        el.pips.innerHTML = state.results.map((r, i) => {
            const cls = !r.done
                ? (i === state.round ? "is-current" : "is-todo")
                : r.won
                    ? `is-won g${Math.min(r.guesses.length, 4)}`
                    : "is-lost";
            return `<li class="guess-pip ${cls}" title="Room ${i + 1}"><span>${i + 1}</span></li>`;
        }).join("");
    }

    function renderTries() {
        const result = currentResult();
        const rows = [];
        for (let i = 0; i < TRIES; i++) {
            const g = result.guesses[i];
            if (!g) {
                rows.push(`<li class="guess-try is-empty"></li>`);
            } else {
                rows.push(`<li class="guess-try ${g.correct ? "is-right" : "is-wrong"}">
                    <span class="guess-try-text">${escapeHtml(g.name)}</span>
                    <span class="guess-try-mark" aria-hidden="true">${g.correct ? "✓" : "✕"}</span>
                </li>`);
            }
        }
        el.tries.innerHTML = rows.join("");
    }

    function renderAll() {
        if (!state) return;
        const result = currentResult();
        const roundOver = result.done;

        el.roundLabel.textContent = `Room ${state.round + 1} of ${ROUNDS}`;
        el.triesLeft.textContent = roundOver
            ? ""
            : `${TRIES - result.guesses.length} ${TRIES - result.guesses.length === 1 ? "guess" : "guesses"} left`;

        renderPips();
        renderTries();
        draw();

        // The entry form is only up while a round is live.
        el.form.hidden = roundOver || state.done;
        el.status.hidden = true;

        // Between rounds: what it was, and the way on.
        if (roundOver && !state.done) {
            el.between.hidden = false;
            el.between.innerHTML = `
                <p class="guess-reveal">${result.won ? "Got it." : "Not this time."}
                    It was <strong>${escapeHtml(round ? round.maze.name : "")}</strong>${round && round.maze.creator ? ` by ${escapeHtml(round.maze.creator)}` : ""}.</p>
                <button type="button" class="guess-btn" id="guess-next">Next room &rsaquo;</button>`;
            const next = document.getElementById("guess-next");
            if (next) next.addEventListener("click", nextRound);
        } else {
            el.between.hidden = true;
            el.between.innerHTML = "";
        }

        renderSummary();
    }

    /* The end of the day: how it went, the streak it fed, and the grid.

       The countdown is the thing that makes it a habit rather than a one-off
       — "back in 6 hours" is a reason to return that "come back tomorrow"
       never quite is. */
    function renderSummary() {
        if (!state.done) {
            el.summary.hidden = true;
            el.summary.innerHTML = "";
            return;
        }
        const solved = state.results.filter(r => r.won).length;
        el.summary.hidden = false;
        el.summary.innerHTML = `
            <p class="guess-score"><strong>${solved} of ${ROUNDS}</strong> rooms found</p>
            <p class="guess-grid" aria-label="Result grid">${state.results.map(squareFor).join("")}</p>
            <dl class="guess-stats">
                <div><dt>Streak</dt><dd>${stats.streak}</dd></div>
                <div><dt>Best</dt><dd>${stats.best}</dd></div>
                <div><dt>Days played</dt><dd>${stats.days}</dd></div>
                <div><dt>Rooms found</dt><dd>${stats.rounds ? Math.round((stats.solved / stats.rounds) * 100) : 0}%</dd></div>
            </dl>
            <div class="guess-summary-actions">
                <button type="button" class="guess-btn" id="guess-share">Copy result</button>
            </div>
            <p class="guess-next-up" id="guess-next-up"></p>
            <ul class="guess-answers">
                ${state.results.map((r, i) => {
                    const p = pickDay()[i];
                    return `<li class="${r.won ? "is-won" : "is-lost"}">
                        <span class="guess-answers-n">${i + 1}</span>
                        <a href="home.html#maze-${encodeURIComponent(p.maze.id)}">${escapeHtml(p.maze.name)}</a>
                    </li>`;
                }).join("")}
            </ul>`;

        const share = document.getElementById("guess-share");
        if (share) share.addEventListener("click", () => copyResult(share));
        tickCountdown();
    }

    let countdownTimer = null;
    function tickCountdown() {
        const target = document.getElementById("guess-next-up");
        if (!target) return;
        clearInterval(countdownTimer);
        const update = () => {
            const now = new Date();
            const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
            const ms = next - now;
            if (ms <= 0) { target.textContent = "Five new rooms are ready — reopen to play."; return; }
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            target.textContent = `Five new rooms in ${h}h ${m}m.`;
        };
        update();
        countdownTimer = setInterval(update, 30000);
    }

    async function copyResult(btn) {
        const solved = state.results.filter(r => r.won).length;
        const when = new Date(state.day + "T00:00:00Z")
            .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
        const text = `Maze Rats · Guess the Maze\n${when} — ${solved}/${ROUNDS}\n${state.results.map(squareFor).join("")}\n${location.origin}/guess`;
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = "Copied";
        } catch (e) {
            // The clipboard needs a secure context and permission, and has
            // neither guaranteed. A selectable box beats a button that
            // silently does nothing.
            const box = document.createElement("textarea");
            box.className = "guess-share-fallback";
            box.readOnly = true;
            box.value = text;
            btn.insertAdjacentElement("afterend", box);
            box.select();
            btn.textContent = "Copy this";
        }
        setTimeout(() => { btn.textContent = "Copy result"; }, 2200);
    }

    // ---------- opening and closing ----------

    let started = false;

    async function start() {
        if (started) return;
        started = true;

        if (!ROOMS.length) {
            try { ROOMS = await Api.getRooms(); } catch (e) { ROOMS = []; }
        }
        pool = buildPool();
        if (!pool.length) {
            el.status.textContent = "There are no room pictures in the archive to make a puzzle from yet.";
            el.status.hidden = false;
            setBusy(false);
            return;
        }
        stats = loadStats();
        state = loadState();
        await prepareRound();
        renderAll();
    }

    function open() {
        el.overlay.classList.add("open");
        document.body.classList.add("modal-open");
        el.window.focus();
        start();
        if (state && !state.done && !currentResult().done) el.input.focus();
    }

    function close() {
        el.overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
        clearInterval(countdownTimer);
        // A pasted /guess link should not leave the address bar claiming the
        // game is open once it has been closed.
        if (location.pathname === "/guess") history.replaceState({}, "", "/home.html");
    }

    // ---------- wiring ----------

    function mount() {
        el = {
            overlay: document.getElementById("guess-overlay"),
            window: document.getElementById("guess-window"),
            close: document.getElementById("guess-close"),
            canvas: document.getElementById("guess-canvas"),
            roundLabel: document.getElementById("guess-round"),
            triesLeft: document.getElementById("guess-tries-left"),
            pips: document.getElementById("guess-pips"),
            tries: document.getElementById("guess-tries"),
            form: document.getElementById("guess-form"),
            input: document.getElementById("guess-input"),
            suggest: document.getElementById("guess-suggest"),
            between: document.getElementById("guess-between"),
            summary: document.getElementById("guess-summary"),
            status: document.getElementById("guess-status"),
            tab: document.getElementById("daily-tab")
        };
        if (!el.overlay || !el.tab) return;

        el.tab.addEventListener("click", open);
        el.close.addEventListener("click", close);
        el.overlay.addEventListener("click", e => { if (e.target === el.overlay) close(); });
        document.addEventListener("keydown", e => {
            if (e.key !== "Escape" || !el.overlay.classList.contains("open")) return;
            if (!el.suggest.hidden) hideSuggest();
            else close();
        });

        el.input.addEventListener("input", showSuggest);
        el.input.addEventListener("focus", showSuggest);
        el.suggest.addEventListener("click", e => {
            const btn = e.target.closest(".guess-suggest-item");
            if (!btn) return;
            el.input.value = btn.dataset.name;
            hideSuggest();
            el.input.focus();
        });
        el.overlay.addEventListener("click", e => {
            if (!e.target.closest(".guess-entry")) hideSuggest();
        }, true);

        el.form.addEventListener("submit", e => {
            e.preventDefault();
            const typed = el.input.value.trim();
            if (!typed) return;
            /* Only a real maze name counts. A typo would otherwise burn a
               guess on a maze that does not exist, which is a bad way to
               lose — the picker is there precisely so nobody has to spell
               "Laberinto Cooperativo" correctly. */
            const match = ROOMS.find(r => r.name && normalise(r.name) === normalise(typed));
            if (!match) {
                el.status.textContent = "No maze in the archive by that name — pick one from the list.";
                el.status.hidden = false;
                return;
            }
            el.input.value = "";
            hideSuggest();
            submitGuess(match.name);
        });

        // /guess is a rewrite to this page (see netlify.toml), so a pasted
        // link opens the game rather than dropping someone on the archive
        // wondering what they were sent.
        if (location.pathname === "/guess") open();
    }

    document.addEventListener("DOMContentLoaded", mount);
})();

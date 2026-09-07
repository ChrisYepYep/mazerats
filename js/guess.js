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
   The deck

   The window holds seven sheets, not one panel that keeps rewriting itself:
   the splash, one per room, and the results. Whatever you have not reached
   yet waits tucked along the bottom edge showing its own labelled tab, and
   each sheet rises over the last when you get to it. Three things fall out
   of that which a single panel could not do:

     - the day has a visible shape. Four tabs still showing along the bottom
       is "four rooms left", read without counting anything;
     - a room that is finished is not erased to make way for the next one.
       It is still there, underneath, exactly as you left it;
     - the results are somewhere you ARRIVE at, rather than something that
       appears in the space room five used to occupy.

   The mechanic is borrowed from the archive window's own results frame (see
   .featured-frame in css/style.css), which slides down inside a clipped box
   until only a sliver shows. Same idea, seven of them, in a stack.

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
     2. How many distinct colours it holds, quantised so near-identical
        shades do not each count.
     3. How much the brightness varies across it — a busy patch of wall and
        a flat one can hold the same colours and be worth very different
        amounts to guess from.

   The first is a floor (below 85% solid, the crop scores nothing at all);
   the other two are weighted, not gated, so a crop that is a little plain
   but very busy can still win, and vice versa.
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

    let el = {};          // the window's shared elements, filled by mount()
    let sheets = [];      // the deck, in order: intro, 5 rooms, results
    let ROOMS = [];
    let pool = [];
    let state = null;     // this day's play
    let stats = null;     // the running record across days
    let rounds = [];      // { maze, image, cx, cy, img } per round, once ready
    let preparing = {};   // round index -> true while its picture is loading

    /* Which sheet is up. Not saved: the splash is where the window opens
       every time, including part-way through a day, because it is the one
       place that says what the game is and carries the streak. Reopening
       mid-day and being dropped straight back into room 3 with no
       explanation is a worse first second than one click. */
    let view = "intro";   // "intro" | "round" | "results"

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

    // Worked out once a day rather than on every render — renderSummary used
    // to call pickDay() once per answer row, which re-shuffled the whole
    // pool five times to read five values off it.
    let picksCache = { day: "", picks: [] };
    function picks() {
        if (picksCache.day !== today()) picksCache = { day: today(), picks: pickDay() };
        return picksCache.picks;
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

    function draw(i) {
        const sheet = roundSheet(i);
        const data = rounds[i];
        if (!sheet || !data || !data.img) return;

        const img = data.img;
        const result = state.results[i];
        const guessCount = result ? result.guesses.length : 0;
        const solvedOrSpent = result && result.done;

        const step = Math.min(guessCount, REVEAL.length - 1);
        const frac = solvedOrSpent ? 1 : REVEAL[step];

        const w = img.naturalWidth, h = img.naturalHeight;
        const canvas = sheet.refs.canvas;
        const out = canvas.getContext("2d");
        const side = canvas.width;
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
        const cx = Math.max(half, Math.min(w - half, data.cx));
        const cy = Math.max(half, Math.min(h - half, data.cy));
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
        // Yesterday's game is not this one, and a stored day from an older
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

    /* Fetches and scores one room's picture. Safe to call for a round that
       is already ready or already loading, which is what lets the next
       round be started quietly in the background (see below) without any
       coordination at the call sites. */
    async function prepareRound(i) {
        if (i == null || i < 0 || i >= ROUNDS) return;
        if (rounds[i] || preparing[i]) return;
        const pick = picks()[i];
        if (!pick) return;

        preparing[i] = true;
        setBusy(i, true);

        let img = null;
        try {
            img = await loadImage(imgCdn(pick.image, 900, null, 82));
        } catch (e) {
            preparing[i] = false;
            setBusy(i, false);
            const sheet = roundSheet(i);
            if (sheet) {
                sheet.refs.status.textContent = "That room's picture would not load. Try again in a moment.";
                sheet.refs.status.hidden = false;
            }
            return;
        }

        const centre = findCropCentre(img, seededRandom(seedFrom(today() + ":" + i)));
        rounds[i] = {
            maze: pick.maze,
            image: pick.image,
            img,
            cx: centre ? centre.x : img.naturalWidth / 2,
            cy: centre ? centre.y : img.naturalHeight / 2
        };
        preparing[i] = false;
        setBusy(i, false);
        renderRound(i);

        /* The next room's picture, fetched while this one is being played.
           A sheet rising to reveal a blank square it then fills in a second
           later undoes most of what the animation is for. */
        if (i + 1 < ROUNDS) prepareRound(i + 1);
    }

    function setBusy(i, on) {
        const sheet = roundSheet(i);
        if (sheet) sheet.el.classList.toggle("is-busy", on);
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
        if (!result || result.done || !rounds[state.round]) return;

        const correct = normalise(name) === normalise(rounds[state.round].maze.name);
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
        prepareRound(state.round);
        goTo("round");
    }

    // ---------- the name picker ----------

    /* The whole archive, listed and scrollable, from the moment a room
       opens. Typing filters the list rather than summoning it.

       An autocomplete that only appears once you have typed something is
       help for people who could already half-name the answer, which is the
       group that needed it least. Nobody can name thirty mazes from
       memory, and being able to read down them and go "that one" is most
       of how this is actually played.

       Names already tried this room stay in place, struck through and
       unclickable, rather than being removed: a list that reshuffles under
       the cursor between guesses is harder to use than one that holds
       still, and seeing what you have ruled out is the useful part. */
    function renderSuggest(sheet) {
        const box = sheet.refs.suggest;
        const result = state.results[sheet.roundIndex];
        if (!result || result.done) { box.innerHTML = ""; return; }

        const q = normalise(sheet.refs.input.value);
        const spent = new Set((result.guesses || []).map(g => normalise(g.name)));

        const names = ROOMS.filter(r => r.name).sort((a, b) => compareNames(a.name, b.name));
        const hits = q ? names.filter(r => normalise(r.name).includes(q)) : names;

        if (!hits.length) {
            box.innerHTML = `<p class="guess-suggest-empty">No maze in the archive matches that.</p>`;
            return;
        }

        box.innerHTML = hits.map(r => {
            const key = normalise(r.name);
            const isSpent = spent.has(key);
            const cls = isSpent ? "is-spent" : (q && key === q ? "is-picked" : "");
            return `<button type="button" class="guess-suggest-item ${cls}" data-name="${escapeHtml(r.name)}"${isSpent ? " disabled" : ""}>${escapeHtml(r.name)}</button>`;
        }).join("");
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // ---------- the deck ----------

    function roundSheet(i) {
        return sheets.find(s => s.kind === "round" && s.roundIndex === i) || null;
    }

    /* Where the sheet in play sits in the deck. Everything after it is still
       tucked along the bottom; everything before it is finished and sits
       underneath, covered. */
    function liveIndex() {
        if (view === "intro") return 0;
        if (view === "results") return sheets.length - 1;
        return 1 + state.round;
    }

    /* Places every sheet. The tucked ones are ordered so the LAST sheet
       shows the lowest sliver and the next one up shows the highest, which
       is what makes the bottom edge read as a stack of pages rather than a
       pile in no particular order. */
    function layout() {
        const live = liveIndex();
        const tuckedCount = sheets.length - 1 - live;
        // Read by the live sheet's own padding, so its content never ends up
        // underneath the tabs of the sheets still waiting below it.
        el.deck.style.setProperty("--tucked", tuckedCount);

        sheets.forEach((s, i) => {
            const isLive = i === live;
            const isTucked = i > live;
            s.el.classList.toggle("is-live", isLive);
            s.el.classList.toggle("is-tucked", isTucked);
            s.el.style.zIndex = String(i);
            /* How far below the sheet in play this one sits. The CSS lifts
               the ground 2% per step, so the tabs along the bottom read as
               separate pages rather than one striped block. Measured from
               the live sheet, not from the top of the deck, so the sheet
               you are on is always the darkest — and room 5 sits on the
               same ground room 1 did. */
            s.el.style.setProperty("--shade", String(Math.max(0, i - live)));
            s.el.style.transform = isTucked
                ? `translateY(calc(100% - ${sheets.length - i} * var(--tuck)))`
                : "translateY(0)";
            /* inert rather than aria-hidden: it takes the sheet out of the
               tab order AND out of the accessibility tree in one, so a
               finished room sitting underneath cannot be tabbed into by
               someone who cannot see that it is covered. */
            s.el.toggleAttribute("inert", !isLive);
        });
    }

    /* Moves to a sheet. Everything that should happen on arrival happens
       here rather than at each call site: the deck is re-placed, the sheet
       is rendered, and whatever wants the caret gets it. */
    function goTo(next) {
        view = next;
        renderAll();
        if (!el.overlay.classList.contains("open")) return;

        const live = sheets[liveIndex()];
        if (!live) return;
        if (live.kind === "round" && !state.results[live.roundIndex].done) {
            live.refs.input.focus({ preventScroll: true });
        } else {
            // Not the input: on a finished room or the results there isn't
            // one, and the sheet itself is what has just arrived.
            live.el.querySelector(".guess-sheet-inner").focus({ preventScroll: true });
        }
    }

    // ---------- rendering ----------

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

    function pipsHtml(activeRound) {
        return state.results.map((r, i) => {
            const cls = !r.done
                ? (i === activeRound ? "is-current" : "is-todo")
                : r.won
                    ? `is-won g${Math.min(r.guesses.length, 4)}`
                    : "is-lost";
            const how = !r.done
                ? (i === activeRound ? "in play" : "not yet played")
                : r.won
                    ? `found in ${r.guesses.length}`
                    : "not found";
            return `<li class="guess-pip ${cls}"><span aria-hidden="true">${i + 1}</span>
                <span class="visually-hidden">Room ${i + 1}, ${how}</span></li>`;
        }).join("");
    }

    function renderRound(i) {
        const sheet = roundSheet(i);
        if (!sheet) return;
        const refs = sheet.refs;
        const result = state.results[i];
        const roundOver = result.done;
        const data = rounds[i];
        const left = TRIES - result.guesses.length;

        refs.label.textContent = `Room ${i + 1} of ${ROUNDS}`;
        refs.triesLeft.textContent = roundOver ? "" : `${left} ${left === 1 ? "guess" : "guesses"} left`;
        refs.triesLeft.classList.toggle("is-low", !roundOver && left === 1);

        /* Says out loud that the picture changed. Without it a wrong guess
           widens the crop by a step that is easy to miss, and the game reads
           as "same square, one life gone" instead of "here, have more". */
        refs.flag.textContent = roundOver
            ? (result.won ? "The whole room" : "The whole room")
            : `View ${Math.min(result.guesses.length + 1, REVEAL.length)} of ${REVEAL.length}`;

        refs.pips.innerHTML = pipsHtml(i);

        const rows = [];
        for (let n = 0; n < TRIES; n++) {
            const g = result.guesses[n];
            if (!g) {
                rows.push(`<li class="guess-try is-empty"></li>`);
            } else {
                rows.push(`<li class="guess-try ${g.correct ? "is-right" : "is-wrong"}">
                    <span class="guess-try-text">${escapeHtml(g.name)}</span>
                    <span class="guess-try-mark" aria-hidden="true">${g.correct ? "✓" : "✕"}</span>
                </li>`);
            }
        }
        refs.tries.innerHTML = rows.join("");

        draw(i);

        // The entry form is only up while the round is live. The name list
        // lives inside it, so it goes with it.
        refs.form.hidden = roundOver;
        renderSuggest(sheet);

        if (roundOver) {
            const maze = data ? data.maze : null;
            const last = i === ROUNDS - 1;
            refs.between.hidden = false;
            refs.between.innerHTML = `
                <p class="guess-reveal">
                    <span class="guess-reveal-verdict ${result.won ? "is-won" : "is-lost"}">${result.won ? "Got it." : "Not this time."}</span>
                    It was <strong>${escapeHtml(maze ? maze.name : "")}</strong>${maze && maze.creator ? ` by ${escapeHtml(maze.creator)}` : ""}.
                </p>
                ${maze ? `<a class="guess-reveal-link" href="home.html#maze-${encodeURIComponent(maze.id)}">See it in the archive &rsaquo;</a>` : ""}
                <button type="button" class="guess-btn guess-btn--lead guess-advance">${last ? "See how you did &rsaquo;" : `Room ${i + 2} &rsaquo;`}</button>`;
            const advance = refs.between.querySelector(".guess-advance");
            if (advance) advance.addEventListener("click", () => (last ? goTo("results") : nextRound()));
        } else {
            refs.between.hidden = true;
            refs.between.innerHTML = "";
        }
    }

    function renderIntro() {
        const done = state.done;
        const played = state.results.some(r => r.guesses.length);
        el.play.innerHTML = done
            ? "See today's results &rsaquo;"
            : played
                ? `Back to room ${state.round + 1} &rsaquo;`
                : "Start room 1 &rsaquo;";

        el.splashDate.textContent = new Date(today() + "T00:00:00Z")
            .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

        /* The foot of the splash is the only place a streak makes sense: on
           a room sheet it would be a distraction from the picture, and on
           the results it is already in the table. Nothing is shown at all
           until there is something to show — a counter reading zero is a
           worse greeting than no counter. */
        if (stats.days) {
            const pct = stats.rounds ? Math.round((stats.solved / stats.rounds) * 100) : 0;
            el.splashFoot.innerHTML = `Streak <strong>${stats.streak}</strong>
                &nbsp;·&nbsp; Best <strong>${stats.best}</strong>
                &nbsp;·&nbsp; <strong>${pct}%</strong> of rooms found across ${stats.days} ${stats.days === 1 ? "day" : "days"}`;
            el.splashFoot.hidden = false;
        } else {
            el.splashFoot.hidden = true;
            el.splashFoot.innerHTML = "";
        }
    }

    /* The end of the day: how it went, the streak it fed, and the grid.

       The countdown is the thing that makes it a habit rather than a one-off
       — "back in 6 hours" is a reason to return that "come back tomorrow"
       never quite is. */
    function renderSummary() {
        if (!state.done) {
            /* Reachable before the fifth room is finished only by tabbing
               the deck open in a browser that ignores inert, so it says
               where it is rather than showing an empty box. */
            el.summary.innerHTML = `<p class="guess-summary-waiting">The scores land here once all five rooms are done.</p>`;
            return;
        }
        const solved = state.results.filter(r => r.won).length;
        const day = picks();
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
            <h4 class="guess-answers-head">Today's five</h4>
            <ul class="guess-answers">
                ${state.results.map((r, i) => {
                    const p = day[i];
                    if (!p) return "";
                    return `<li class="${r.won ? "is-won" : "is-lost"}">
                        <span class="guess-answers-n" aria-hidden="true">${i + 1}</span>
                        <a href="home.html#maze-${encodeURIComponent(p.maze.id)}">${escapeHtml(p.maze.name)}</a>
                        <span class="guess-answers-mark">${r.won ? `found in ${r.guesses.length}` : "missed"}</span>
                    </li>`;
                }).join("")}
            </ul>`;

        const share = document.getElementById("guess-share");
        if (share) share.addEventListener("click", () => copyResult(share));
        tickCountdown();
    }

    function renderAll() {
        if (!state) return;
        renderIntro();
        for (let i = 0; i < ROUNDS; i++) renderRound(i);
        renderSummary();
        layout();
        updateTabs();
    }

    /* The labels on the sheets still waiting at the bottom. Fixed text —
       the results tab carried the score for a while, which put the day's
       answer on a tab that is on screen the whole time you are still
       playing the rooms it is scoring. */
    function updateTabs() {
        sheets.forEach(s => {
            if (!s.refs.tabLabel) return;
            s.refs.tabLabel.textContent = s.kind === "round"
                ? `Room ${s.roundIndex + 1}`
                : "Results";
        });
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
            el.play.disabled = true;
            el.play.textContent = "Nothing to play yet";
            el.splashFoot.textContent = "There are no room pictures in the archive to make a puzzle from yet.";
            el.splashFoot.hidden = false;
            return;
        }
        stats = loadStats();
        state = loadState();

        /* Placed with the animation switched off, so opening the window
           shows the deck already stacked rather than seven sheets flying
           into position. */
        el.deck.classList.add("is-settling");
        renderAll();
        void el.deck.offsetHeight;        // commit the placement before easing is restored
        el.deck.classList.remove("is-settling");

        prepareRound(state.round);
    }

    function open() {
        el.overlay.classList.add("open");
        document.body.classList.add("modal-open");
        view = "intro";
        el.window.focus();
        start().then(() => { if (state) goTo("intro"); });
    }

    function close() {
        el.overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
        clearInterval(countdownTimer);
        el.tab.focus({ preventScroll: true });
        // A pasted /guess link should not leave the address bar claiming the
        // game is open once it has been closed.
        if (location.pathname === "/guess") history.replaceState({}, "", "/home.html");
    }

    // ---------- wiring ----------

    /* Builds the five room sheets from the template and caches every element
       each one needs, so nothing downstream has to query the DOM by index or
       invent unique ids for five copies of the same markup. */
    function buildDeck() {
        const tpl = document.getElementById("guess-round-template");
        const results = el.deck.querySelector('[data-kind="results"]');
        if (!tpl || !results) return false;

        for (let i = 0; i < ROUNDS; i++) {
            const node = tpl.content.firstElementChild.cloneNode(true);
            el.deck.insertBefore(node, results);
        }

        sheets = Array.from(el.deck.querySelectorAll(".guess-sheet")).map(node => {
            const kind = node.dataset.kind;
            const refs = {
                tab: node.querySelector(".guess-sheet-tab"),
                tabLabel: node.querySelector(".guess-sheet-tab-label"),
                canvas: node.querySelector(".guess-canvas"),
                label: node.querySelector(".guess-round"),
                triesLeft: node.querySelector(".guess-tries-left"),
                flag: node.querySelector(".guess-picture-flag"),
                pips: node.querySelector(".guess-pips"),
                tries: node.querySelector(".guess-tries"),
                status: node.querySelector(".guess-status"),
                form: node.querySelector(".guess-entry"),
                input: node.querySelector(".guess-input"),
                suggest: node.querySelector(".guess-suggest"),
                between: node.querySelector(".guess-between")
            };
            // Focusable so goTo can put the caret on a sheet that has no
            // field to put it in — the results, or a finished room.
            const inner = node.querySelector(".guess-sheet-inner");
            if (inner) inner.tabIndex = -1;
            return { el: node, kind, roundIndex: -1, refs };
        });

        let n = 0;
        sheets.forEach(s => { if (s.kind === "round") s.roundIndex = n++; });
        sheets.filter(s => s.kind === "round").forEach(wireRound);
        return true;
    }

    function wireRound(sheet) {
        const refs = sheet.refs;

        refs.input.addEventListener("input", () => renderSuggest(sheet));

        /* Fills the field rather than spending the guess outright. With the
           whole archive listed and scrolling under the pointer, a stray
           click would otherwise cost a life — and there is a Guess button
           two inches away to confirm with. */
        refs.suggest.addEventListener("click", e => {
            const btn = e.target.closest(".guess-suggest-item");
            if (!btn || btn.disabled) return;
            refs.input.value = btn.dataset.name;
            renderSuggest(sheet);
            refs.input.focus({ preventScroll: true });
        });

        refs.form.addEventListener("submit", e => {
            e.preventDefault();
            const typed = refs.input.value.trim();
            if (!typed) return;
            /* Only a real maze name counts. A typo would otherwise burn a
               guess on a maze that does not exist, which is a bad way to
               lose — the picker is there precisely so nobody has to spell
               "Laberinto Cooperativo" correctly. */
            const match = ROOMS.find(r => r.name && normalise(r.name) === normalise(typed));
            if (!match) {
                refs.status.textContent = "No maze in the archive by that name — pick one from the list.";
                refs.status.hidden = false;
                return;
            }
            refs.input.value = "";
            refs.status.hidden = true;
            submitGuess(match.name);
        });
    }

    function mount() {
        el = {
            overlay: document.getElementById("guess-overlay"),
            window: document.getElementById("guess-window"),
            close: document.getElementById("guess-close"),
            deck: document.getElementById("guess-deck"),
            play: document.getElementById("guess-play"),
            splashDate: document.getElementById("guess-splash-date"),
            splashFoot: document.getElementById("guess-splash-foot"),
            summary: document.getElementById("guess-summary"),
            tab: document.getElementById("daily-tab")
        };
        if (!el.overlay || !el.deck || !el.tab) return;
        if (!buildDeck()) return;

        el.tab.addEventListener("click", open);
        el.close.addEventListener("click", close);
        el.overlay.addEventListener("click", e => { if (e.target === el.overlay) close(); });

        el.play.addEventListener("click", () => {
            if (!state) return;
            if (state.done) return goTo("results");
            prepareRound(state.round);
            goTo("round");
        });

        /* Escape closes the window outright. It used to have to close the
           name list first, but the list is part of the board now rather
           than something floating over it, so there is nothing to dismiss
           on the way out. */
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && el.overlay.classList.contains("open")) close();
        });

        // /guess is a rewrite to this page (see netlify.toml), so a pasted
        // link opens the game rather than dropping someone on the archive
        // wondering what they were sent.
        if (location.pathname === "/guess") open();
    }

    document.addEventListener("DOMContentLoaded", mount);
})();

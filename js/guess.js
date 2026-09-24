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
    const TRIES = 3;

    /* Five names offered a round, one of them right.

       The room used to be named against the whole archive — a scrolling list
       of every maze, filtered by typing. That is a recall question, and
       recall is the wrong question to ask about a picture: somebody who
       looks at a crop and thinks "that green floor is the co-op one" still
       could not produce the words "Laberinto Cooperativo" from nothing, so
       the game was testing whether you could name the archive rather than
       whether you could read a room.

       Five is the number that keeps a wrong guess meaningful. With three
       tries against five names, guessing blind wins three rounds in five —
       enough that a lucky day is possible, not enough that anybody arrives
       at a good week without recognising rooms. Four names and three tries
       would make the third guess a certainty. */
    const OPTIONS = 5;

    /* Both bumped when the round became multiple choice.

       The day: a state saved under the old shape holds up to four guesses
       against a game that now allows three, and its results would be scored
       against a POINTS array one entry shorter — so it is not read at all
       rather than migrated, which is the same clean break _v3 made when
       scoring arrived.

       The running record: every total in it was counted at 100/70/45/25, so
       carried forward it would read as one number made of two different
       scales — an all-time total nobody can now match a day against, and a
       "best day" that a perfect day under the new scoring cannot beat.
       Starting the count again is the honest version of that.

       What this CANNOT reset is a signed-in player's totals, and the reason
       is worth knowing before anyone reads a number here and believes it:
       for an account, these figures are not this file's at all. They are
       recomputed on every open by statsFor in
       netlify/functions/player-data.js, counted from the guess_scores rows
       that were actually recorded — old-scale points included — and merged
       over whatever is stored here. Only a signed-out player's record lives
       in this key alone. Genuinely levelling the two scales means rescoring
       or retiring those rows, which is a decision about the leaderboard
       rather than about local storage. */
    const STATE_KEY = "mazerats_guess_v4";
    const STATS_KEY = "mazerats_guess_stats_v3";

    /* Each wrong guess widens the view around the same centre, so the reveal
       reads as stepping back from one spot rather than as being shown a
       different picture each time. Three steps rather than four, and spread
       wider to cover the same ground: the last is still about half the
       image, which is usually enough to place a room without simply giving
       it away. */
    const REVEAL = [0.16, 0.28, 0.44];

    /* What a room is worth, by the view you named it on. Steeply weighted
       toward the first: the whole game is whether you can place a room from
       a scrap of it, so recognising it from the tightest crop should be
       worth appreciably more than getting there by elimination. Falling
       away rather than halving, so a third-view save is still clearly
       worth more than a miss.

       500 is still a perfect day, which is a number a player can hold in
       their head and the number the two games next door also add up to —
       and the same array is used by the server to score a submitted day
       (see netlify/functions/guess-scores.js), so the two can never
       disagree about what a round was worth. Change one, change both. */
    const POINTS = [100, 60, 30];

    function pointsFor(result) {
        if (!result || !result.done || !result.won) return 0;
        return POINTS[Math.min(result.guesses.length, POINTS.length) - 1] || 0;
    }

    function dayPoints() {
        return state.results.reduce((n, r) => n + pointsFor(r), 0);
    }

    let el = {};          // the window's shared elements, filled by mount()
    let sheets = [];      // the deck, in order: intro, 5 rooms, results
    let ROOMS = [];
    let roomsDay = "";    // the UTC day ROOMS was fetched on; see start()
    let pool = [];
    let state = null;     // this day's play
    let stats = null;     // the running record across days
    let rounds = [];      // { maze, image, cx, cy, img } per round, once ready
    let preparing = {};   // round index -> true while its picture is loading
    let dealGen = 0;      // bumped whenever the deal is thrown away; see forgetDeal

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

    /* The local copy of seedFrom is gone.

       It was a duplicate of window.Daily.seedFrom — identical FNV-1a, same
       constants — from before js/daily.js existed. Every caller here now
       goes through Daily.daySeed instead, so that a featured day (see
       FEATURED_DAYS in js/daily.js) rerolls this game along with the other
       two, and a second hashing function sitting unused beside it is a
       thing somebody would eventually reach for again and quietly opt out
       of that. */

    // ---------- choosing the day's five rooms ----------

    /* Every room picture in the archive, as one flat pool.

       Entrance shots are left out on purpose: they are the image most likely
       to carry the maze's name on a wall or a sign, and they are also the
       thumbnail on the archive's own rows, so they are the one picture a
       regular visitor could recognise without ever having walked the maze. */
    /* Hallways are not in it, and the same test runs on the server before
       it derives the answers (netlify/functions/guess-scores.js). The
       archive lists the hallway and should — it is part of the history —
       but it is a corridor between mazes, so a round asking which maze a
       picture of it came from has no answer, and offering its name as one
       of the five is offering something that cannot be right. See
       Daily.isHallway. */
    /* And only mazes that were in the archive before the day being dealt
       began. A maze catalogued at lunchtime used to join the pool the
       moment it was saved — and because the day is one shuffle of the whole
       pool, one new maze re-dealt all five rooms for everybody who loaded
       the page after it. It now joins at the next midnight. The server
       applies the same test before it scores; see existedBefore in
       js/daily.js and netlify/functions/_daily.js. */
    function buildPool(forDay) {
        const out = [];
        ROOMS.forEach(room => {
            if (!room.name || !room.id) return;
            if (window.Daily.isHallway(room)) return;
            if (!window.Daily.existedBefore(room, forDay)) return;
            (room.gallery || []).forEach(g => {
                if (g && g.image) out.push({ maze: room, image: g.image });
            });
        });
        return out.sort(poolOrder);
    }

    /* The pool is put in a fixed order before the day's shuffle runs, and
       this is not tidiness — it is what makes the day's five REPRODUCIBLE.

       The shuffle draws one random number per pool entry in sequence, so
       which five come out depends on what order the pool was in. Left as it
       arrived, that order is MongoDB's natural order, which is not promised
       to be stable: rewriting a document can move it. An admin saving an
       edit at noon would then quietly deal a different five for the rest of
       the day — and the server, which derives the same day independently to
       check submitted scores (netlify/functions/guess-scores.js), would
       start rejecting correct answers.

       Sorted on id then image, both plain string comparisons rather than
       localeCompare, so the browser and Node cannot disagree about the
       order the way two locales could. */
    function poolOrder(a, b) {
        if (a.maze.id !== b.maze.id) return a.maze.id < b.maze.id ? -1 : 1;
        if (a.image !== b.image) return a.image < b.image ? -1 : 1;
        return 0;
    }

    /* The day's five, drawn so that no maze appears twice.

       Five rounds all from the same maze would be five chances at one
       answer, which is both easier and duller than five different ones.
       Falls back to allowing repeats only if the archive is too small to
       fill five rounds otherwise, which it is not today and might be on a
       fresh install. */
    function pickDay(forDay) {
        // Through Daily.daySeedFor so a featured day (see FEATURED_DAYS in
        // js/daily.js) rerolls this game along with the other two — and for
        // the NAMED day, never the clock's; see picks() below.
        const rand = seededRandom(window.Daily.daySeedFor(forDay, "guess"));
        const pool = buildPool(forDay);
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
    /* KEYED ON state.day, NOT today(). This cache used to reset itself
       whenever the clock's day changed, which at midnight meant a player
       part-way through was quietly handed a different five: the answer
       names, the options and the next picture all moved to the new day
       while state.day, the pictures already prepared and the day submitted
       to the server stayed on the old one. The day being played is pinned
       in state.day when it begins, and every draw is made for that day. */
    let picksCache = { day: "", picks: [] };
    function picks() {
        const forDay = state ? state.day : today();
        if (picksCache.day !== forDay) picksCache = { day: forDay, picks: pickDay(forDay) };
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
        // And against the account, so a day begun on a phone can be
        // finished at a desk. Coalesced and fire-and-forget in Account.
        if (window.Account && Account.current) Account.saveState({ guess: state });
    }

    /* Takes the account's copy of today if it is further on than this
       device's. "Further on" is counted in guesses actually made, which is
       the only measure that cannot go backwards — round number alone would
       let a device that had merely opened room 3 overwrite one that had
       played four rooms properly.

       Only ever adopts, never overwrites the server with less: a device
       that is behind pulls forward, and one that is ahead pushes on its
       next save. */
    function adoptAccountDay(saved) {
        if (!saved || saved.day !== today()) return false;
        if (!Array.isArray(saved.results) || saved.results.length !== ROUNDS) return false;
        const count = s => s.results.reduce((n, r) => n + ((r.guesses || []).length), 0);
        if (count(saved) <= count(state)) return false;
        state = {
            day: saved.day,
            round: saved.round || 0,
            results: saved.results,
            done: Boolean(saved.done)
        };
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
        return true;
    }

    function loadStats() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(STATS_KEY) || "null"); } catch (e) { s = null; }
        const blank = { days: 0, solved: 0, rounds: 0, streak: 0, best: 0, points: 0, bestDay: 0, lastDay: "" };
        return s && typeof s === "object" ? { ...blank, ...s } : blank;
    }

    function saveStats() {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* private mode */ }
    }

    function yesterdayOf(iso) {
        const d = new Date(iso + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    /* The streak as it stands NOW. stats.streak is the run as it was when
       last banked, so the splash showed a run that ended days ago as if it
       were still going. It is only alive if the last day played is today
       or yesterday (UTC); otherwise it is 0 until the next day is banked. */
    function liveStreak() {
        const t = today();
        return stats.lastDay === t || stats.lastDay === yesterdayOf(t) ? stats.streak : 0;
    }

    /* Banked once, when the fifth round finishes.

       The streak counts days FINISHED, not days opened — otherwise it
       rewards clicking the tab and closing it, which is not the habit worth
       encouraging. Recorded against the day itself rather than a counter, so
       replaying the same day (a second tab, a refresh) cannot inflate it. */
    /* THE SUBMISSION IS NOT BEHIND THE GUARD. It used to be: the early
       return below also skipped submitDay, which was harmless until an
       administrator gave a player their day back. The reset clears the day
       and deletes the scored row, but stats.lastDay still says this day was
       banked — so the replay finished, returned early, and never reached
       the server, leaving the player off a board they had just been
       specifically put back on. Now the streak and totals are still counted
       once per day (the guard), and the day is always sent; sending a day
       the server already has is answered "already" and changes nothing, so
       there is no double-counting on either side. */
    function bankDay() {
        if (stats.lastDay !== state.day) countDay();
        submitDay();
    }

    function countDay() {
        const solved = state.results.filter(r => r.won).length;
        const scored = dayPoints();
        stats.streak = stats.lastDay === yesterdayOf(state.day) ? stats.streak + 1 : 1;
        stats.best = Math.max(stats.best, stats.streak);
        stats.days += 1;
        stats.rounds += ROUNDS;
        stats.solved += solved;
        stats.points += scored;
        stats.bestDay = Math.max(stats.bestDay, scored);
        stats.lastDay = state.day;
        saveStats();

        /* The day is sent by bankDay, straight after this, for the same
           reason the streak is banked here: this is the moment the day is
           finished and can no longer change. Only lands on the board if
           someone is signed in — see submitDay, which is a no-op otherwise.
           The local record above is kept either way, so playing signed out
           still counts for the player's own streak and totals. */
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
        const forDay = state.day;
        const gen = dealGen;

        let img = null;
        try {
            img = await loadImage(imgCdn(pick.image, 900, null, 82));
        } catch (e) {
            if (gen !== dealGen) return;
            preparing[i] = false;
            setBusy(i, false);
            const sheet = roundSheet(i);
            if (sheet) {
                sheet.refs.status.textContent = "That room's picture would not load. Try again in a moment.";
                sheet.refs.status.hidden = false;
            }
            return;
        }
        /* The day moved on while the picture was on its way — the window
           was reopened on a new day, or an administrator's reset landed —
           and this picture belongs to the deal that has just been thrown
           away. Filing it would put yesterday's room into today's round. */
        if (gen !== dealGen) return;

        const centre = findCropCentre(img, seededRandom(window.Daily.daySeedFor(forDay, "guess:crop", i)));
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
        const pressedAt = optionsRound(state.round).findIndex(n => n === name);
        renderAll();
        settleFocus(state.round, result, name, pressedAt);
    }

    /* Where the keyboard goes after a guess, and what is said out loud.

       renderOptions rewrites the five buttons on every guess, so the one
       that was pressed stops existing and focus fell to <body>: a keyboard
       player was thrown back to the top of the page after every answer,
       and a screen reader was told nothing about whether it was right.

       A round still live puts the focus on the next name still pressable
       after the one just spent (wrapping round), so the player carries on
       from where they were in the list. A round that is over puts it on
       the button that leaves it — "Room 3 ›" — which is the only thing
       left to do on that sheet, with the verdict above it announced by the
       sheet's live region. */
    function settleFocus(i, result, name, pressedAt) {
        const sheet = roundSheet(i);
        if (!sheet) return;
        let target = null;
        if (result.done) {
            target = sheet.refs.between.querySelector(".guess-advance");
        } else {
            const all = Array.from(sheet.refs.options.querySelectorAll(".guess-option"));
            for (let step = 1; step <= all.length && !target; step++) {
                const candidate = all[(Math.max(0, pressedAt) + step) % all.length];
                if (!candidate.disabled) target = candidate;
            }
        }
        if (target) target.focus({ preventScroll: true });

        const left = TRIES - result.guesses.length;
        const maze = rounds[i] ? rounds[i].maze : null;
        announce(sheet, result.done
            ? (result.won
                ? `Got it. It was ${name}. Plus ${pointsFor(result)} points.`
                : `Not this time. It was ${maze ? maze.name : "another maze"}.`)
            : `Not ${name}. The view widens. ${left} ${left === 1 ? "guess" : "guesses"} left.`);
    }

    function announce(sheet, text) {
        const live = sheet && sheet.refs.live;
        if (!live) return;
        // Emptied first, so the same words twice running are still read.
        live.textContent = "";
        setTimeout(() => { live.textContent = text; }, 30);
    }

    function nextRound() {
        if (state.round >= ROUNDS - 1) return;
        state.round += 1;
        saveState();
        prepareRound(state.round);
        goTo("round");
    }

    // ---------- the five names ----------

    /* A seeded shuffle of a list, without disturbing the caller's copy.

       Every draw in this file has to come out the same for everyone on the
       same day, which means no Math.random and a fixed order going in —
       see poolOrder above for what happens when the order going in is left
       to the database. */
    function shuffledBy(list, seed) {
        const rand = seededRandom(seed);
        return list
            .map(item => ({ item, k: rand() }))
            .sort((a, b) => a.k - b.k)
            .map(o => o.item);
    }

    /* The five names a round offers, the right one among them.

       The four decoys are not drawn at random. A crop of a dim stone
       corridor offered against four bright Christmas mazes is a round you
       win without looking at the picture — the wrong answers rule
       themselves out, and the question stops being about the room. So a
       decoy is preferred from a maze that shares a tag with the answer:
       same theme, same sort of build, the kind of maze the picture could
       plausibly have come from. Only when there are not four of those does
       it fall back to the rest of the archive.

       That is the same reasoning Odd One Out uses to choose its imposter,
       and for the same reason — see the note at the top of
       js/oddoneout.js.

       Settled by the day, the round and the answer's own id, so the five
       are the same five for everybody, survive a reload, and do not shift
       under a player who guesses once and comes back after lunch. */
    function optionsFor(i) {
        const pick = picks()[i];
        if (!pick) return [];
        const answer = pick.maze;

        const tagsOf = r => (r.tags || []).map(t => String(t).toLowerCase()).filter(Boolean);
        const mine = new Set(tagsOf(answer));

        /* Sorted before anything is drawn from it, for the same reason the
           picture pool is: an unordered list makes an unreproducible shuffle.

           And hallways are out of the DECOYS too, not just the answers. A
           name in this list is a claim that the picture might have come from
           it, and the hallway is the one room on the site where that can
           never be true — so it reads as the odd one out to anybody who
           knows the archive, which quietly narrows five names to four. */
        /* existedBefore for the same reason the picture pool has it: a maze
           catalogued mid-day would otherwise slip into the decoys for new
           page loads, so two players on the same day would be offered
           different five names. The server does not check the options, but
           players compare notes. */
        const others = ROOMS
            .filter(r => r.name && r.id && r.id !== answer.id && !window.Daily.isHallway(r))
            .filter(r => window.Daily.existedBefore(r, state.day))
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

        const seed = window.Daily.daySeedFor(state.day, "guess:options", i, answer.id);
        const related = others.filter(r => tagsOf(r).some(t => mine.has(t)));
        const relatedIds = new Set(related.map(r => r.id));
        const rest = others.filter(r => !relatedIds.has(r.id));

        const decoys = shuffledBy(related, seed)
            .concat(shuffledBy(rest, seed ^ 0x9e3779b9))
            .slice(0, OPTIONS - 1);

        /* Shuffled again with the answer in it, or the right name would sit
           in first place every round — which is a game about noticing where
           the list stops being sorted. */
        return shuffledBy([answer].concat(decoys), seed ^ 0x85ebca6b).map(r => r.name);
    }

    // Worked out once a day rather than on every render, exactly as picks()
    // is: renderAll redraws all five rounds on every guess, and rebuilding
    // five shuffles of the archive each time is five shuffles nobody asked
    // for. Keyed on state.day, not the clock, for the reason given at
    // picks().
    let optionsCache = { day: "", rounds: [] };
    function optionsRound(i) {
        if (optionsCache.day !== state.day) optionsCache = { day: state.day, rounds: [] };
        if (!optionsCache.rounds[i]) optionsCache.rounds[i] = optionsFor(i);
        return optionsCache.rounds[i];
    }

    /* The five buttons.

       While the round is live they are the guess: pressing one spends it.
       There is no separate confirm, because with five large named buttons
       the press IS the choice — the field-and-confirm pair the old list
       needed existed to protect against a stray click in a scrolling list
       of thirty-eight names, and that list is gone.

       They stay on screen after the round ends rather than being hidden,
       wearing the answer: the right name marked as right whether or not it
       was picked, and the wrong picks marked as wrong. A multiple choice
       question should be answered where it was asked. */
    function renderOptions(sheet) {
        const box = sheet.refs.options;
        const result = state.results[sheet.roundIndex];
        if (!box || !result) return;

        /* The answer comes from picks(), not from rounds[] — the day's five
           mazes are known the moment the archive has loaded, whereas
           rounds[] is not filled until each picture has been fetched and
           cropped. Read from picks(), the names are on screen with the
           sheet; read from rounds[], they appeared a beat later, which made
           the board look like it was still deciding. */
        const pick = picks()[sheet.roundIndex];
        if (!pick) { box.innerHTML = ""; return; }

        const spent = new Set((result.guesses || []).map(g => normalise(g.name)));
        const answer = normalise(pick.maze.name);
        const over = result.done;

        box.innerHTML = optionsRound(sheet.roundIndex).map(name => {
            const key = normalise(name);
            const isAnswer = key === answer;
            const wasTried = spent.has(key);
            // is-idle is a name that was never tried and was not the answer.
            // Only reachable once the round is over — while it is live an
            // untouched name is simply a name you can still press.
            const cls = over
                ? (isAnswer ? "is-answer" : wasTried ? "is-wrong" : "is-idle")
                : (wasTried ? "is-wrong" : "");
            const mark = over && isAnswer ? "✓" : wasTried ? "✕" : "";
            return `<button type="button" class="guess-option ${cls}" data-name="${escapeHtml(name)}"${wasTried || over ? " disabled" : ""}>
                <span class="guess-option-name">${escapeHtml(name)}</span>
                ${mark ? `<span class="guess-option-mark" aria-hidden="true">${mark}</span>` : ""}
            </button>`;
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
        // Fetched on arrival rather than on open: most sittings never reach
        // this sheet, and a board nobody is looking at is a request nobody
        // asked for.
        if (next === "results") {
            submitIfOwed();
            loadBoards();
        }
        if (!el.overlay.classList.contains("open")) return;

        const live = sheets[liveIndex()];
        if (!live) return;
        /* The sheet itself takes the focus, never one of the five names.

           It used to land on the text field, which was right when there was
           one: the caret arriving in the box was the invitation to type.
           Landing on the first OPTION would be a different thing entirely —
           a highlighted answer, offered before the picture has been looked
           at, one keypress from being spent. So the sheet is what arrives,
           and Tab reaches the names in the order they are drawn. */
        const inner = live.el.querySelector(".guess-sheet-inner");
        if (inner) inner.focus({ preventScroll: true });
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
           as "same square, one life gone" instead of "here, have more".

           One label once the round is over, whichever way it went. It was a
           ternary on result.won with the same string on both sides — the
           leftover of a version that meant to say something different for
           a win — but what the flag describes is the PICTURE, and a round
           won or lost shows the same thing: the whole room, uncropped (see
           draw). Whether it was won is said by the verdict directly
           underneath, so saying it here too would be the same news twice. */
        refs.flag.textContent = roundOver
            ? "The whole room"
            : `View ${Math.min(result.guesses.length + 1, REVEAL.length)} of ${REVEAL.length}`;

        refs.pips.innerHTML = pipsHtml(i);

        draw(i);

        /* The five names stay up after the round ends, wearing the answer —
           see renderOptions. There is no longer a separate list of guesses
           made: with the options themselves marked, a second list saying the
           same thing in a different order was the same information twice. */
        renderOptions(sheet);

        if (roundOver) {
            const maze = data ? data.maze : null;
            const last = i === ROUNDS - 1;
            refs.between.hidden = false;
            const scored = pointsFor(result);
            refs.between.innerHTML = `
                <p class="guess-reveal">
                    <span class="guess-reveal-verdict ${result.won ? "is-won" : "is-lost"}">${result.won ? "Got it." : "Not this time."}</span>
                    It was <strong>${escapeHtml(maze ? maze.name : "")}</strong>${maze && maze.creator ? ` by ${escapeHtml(maze.creator)}` : ""}.
                </p>
                <!-- Says what the round was worth AND what it could have
                     been, because the second half is the part that teaches
                     the scoring: "+45, 100 on the first view" explains the
                     whole system in one line, once. -->
                <p class="guess-reveal-points ${result.won ? "is-won" : "is-lost"}">
                    ${result.won
                        ? `<strong>+${scored}</strong> ${result.guesses.length === 1
                            ? "— named on the first view"
                            : `for view ${result.guesses.length}${" · "}${POINTS[0]} on the first`}`
                        : `<strong>+0</strong> — no points for a room you don't place`}
                </p>
                ${maze ? `<a class="guess-reveal-link" href="/home#maze-${encodeURIComponent(maze.id)}">See it in the archive &rsaquo;</a>` : ""}
                <button type="button" class="guess-btn guess-btn--lead guess-advance">${last ? "See how you did &rsaquo;" : `Room ${i + 2} &rsaquo;`}</button>`;
            const advance = refs.between.querySelector(".guess-advance");
            if (advance) advance.addEventListener("click", () => (last ? goTo("results") : nextRound()));
            revealBetween(sheet, refs.between);
        } else {
            refs.between.hidden = true;
            refs.between.innerHTML = "";
        }
    }

    /* Brings the result and the button that leaves the round onto the
       screen, on the screens where they do not already fit.

       A finished round is the round PLUS the reveal underneath it — the
       verdict, the maze's name, what it scored, the link into the archive
       and "Room 3 ›" — and that block is 158px that was not there a moment
       ago. On a desktop the sheet has the room and nothing moves. On a phone
       it does not: measured at 375x667 the whole block landed between 25px
       and 186px BELOW the bottom edge of the deck, so what the player saw
       when they answered was the five names with a tick on one of them and
       no indication the round had produced anything, let alone a way out of
       it. The sheet scrolls, so it was all reachable — by a scroll nobody
       had a reason to try, inside a window with no scrollbar on it.

       Only when it is genuinely off-screen. The check is against the sheet's
       own scrolling box rather than a width, because the thing that decides
       this is how much room is left, and a short landscape window on a
       desktop has the same problem as a phone.

       And the picture is left where it is. It could be shrunk instead, but
       the arithmetic does not work: at 667px there is no size of picture,
       down to nothing at all, that fits the reveal in as well as the five
       names. Scrolling to the answer is the honest fix, and it also keeps
       the room available to scroll back up to, which is the one thing a
       player might actually want to look at again after being told what
       it was. */
    function revealBetween(sheet, between) {
        const box = sheet.el.querySelector(".guess-sheet-inner");
        if (!box || !between) return;

        /* Measured as the difference between two rectangles inside the SAME
           sheet, and measured now rather than on the next frame.

           Both of those are the same decision. A sheet arriving is a sheet
           part way through a 0.44s transform, so its rectangle is wherever
           the animation has got to — but the box and the block inside it are
           carried by that transform together, so the distance BETWEEN them
           is the same at every point in the slide. Nothing has to settle
           before this can be asked, which means it does not have to wait for
           a frame, which means it cannot be lost on the frame that never
           comes: rAF does not fire in a background tab, and the first
           version of this quietly did nothing at all under a throttled one.

           Setting innerHTML above has already forced the layout this reads,
           so there is no measurement here that the line before it did not
           already pay for. */
        const room = between.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;
        if (room <= 0) return;      // already on screen; nothing to do

        /* scrollIntoView would also scroll the deck and the page behind it —
           the deck is a clipped box that can still be scrolled
           programmatically, and nothing scrolls it back. Moving the one box
           that is meant to move avoids the whole question. */
        box.scrollTo({
            top: box.scrollTop + room + 8,      // 8px so it is not flush
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth"
        });
    }

    function renderIntro() {
        const done = state.done;
        const played = state.results.some(r => r.guesses.length);
        el.play.innerHTML = done
            ? "See today's results &rsaquo;"
            : played
                ? `Back to room ${state.round + 1} &rsaquo;`
                : "Start room 1 &rsaquo;";

        // The day being PLAYED, which is today except for a game begun
        // before midnight and still being finished.
        el.splashDate.textContent = new Date(state.day + "T00:00:00Z")
            .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

        /* The foot of the splash is the only place a streak makes sense: on
           a room sheet it would be a distraction from the picture, and on
           the results it is already in the table. Nothing is shown at all
           until there is something to show — a counter reading zero is a
           worse greeting than no counter. */
        if (stats.days) {
            const pct = stats.rounds ? Math.round((stats.solved / stats.rounds) * 100) : 0;
            el.splashFoot.innerHTML = `Streak <strong>${liveStreak()}</strong>
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
        const scored = dayPoints();
        // picks() was read here only to name the five mazes in the answer
        // list below, which is gone — and it is not a free call: it deals
        // the whole day off a seeded shuffle of every room picture in the
        // archive.
        el.summary.innerHTML = `
            <p class="guess-points"><strong>${scored}</strong><span>points</span></p>
            <p class="guess-score">${solved} of ${ROUNDS} rooms found</p>
            <p class="guess-grid" aria-label="Result grid">${state.results.map(squareFor).join("")}</p>
            <dl class="guess-stats">
                <div><dt>Streak</dt><dd>${stats.streak}</dd></div>
                <div><dt>Best day</dt><dd>${stats.bestDay}</dd></div>
                <div><dt>Days played</dt><dd>${stats.days}</dd></div>
                <div><dt>All-time</dt><dd>${stats.points}</dd></div>
            </dl>
            <div class="guess-summary-actions">
                <button type="button" class="guess-btn" id="guess-share">Copy result</button>
            </div>
            <p class="guess-next-up" id="guess-next-up"></p>

            <!-- Filled in by renderBoards once the scores come back, so the
                 results are readable the instant the day ends rather than
                 waiting on the network. A slot, swapped for the one
                 long-lived boards element below. -->
            <div id="guess-boards-slot"></div>`;
        const slot = document.getElementById("guess-boards-slot");
        if (slot) slot.replaceWith(boardsElement());

        /* The day's five mazes, named and linked, used to be listed here.

           They are gone because of where this card ends up. It is the thing
           somebody screenshots into a channel the moment they finish, and
           everyone else in that channel has the same five rooms waiting for
           them — so the list turned every shared result into a spoiler for
           the people it was being shared with. The grid above says how the
           day went and names nothing, which is exactly why it is safe to
           paste; the answers underneath undid that.

           Nothing is lost from the play itself: each maze is already named
           at the end of its own round, on the sheet where it was guessed,
           with a link into the archive. */

        const share = document.getElementById("guess-share");
        if (share) share.addEventListener("click", () => copyResult(share));
        tickCountdown();
        renderBoards();
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

    // ---------- the leaderboards ----------

    /* Two boards: who scored best today, and who has scored most across
       every day. Both come from one endpoint and one request, because they
       are always read together and a results panel that fills in twice
       reads as broken.

       Held at module scope rather than re-fetched per render — renderAll
       runs on every guess, and the board does not change between them. */
    const BOARDS_URL = "/.netlify/functions/guess-scores";
    let boards = null;
    let boardsState = "idle";   // idle | loading | ready | failed

    /* `force` is the call submitDay makes once the day has been recorded,
       and it has two jobs the ordinary call does not.

       It goes past every cache in the way (the `fresh` parameter makes it a
       different URL, so neither the browser's thirty seconds nor anything
       at the edge can answer it with a board from before the row existed).

       And it is never dropped. It used to return early if a load was
       already running — which it usually was, because arriving on the
       results sheet starts one — so the refresh after submitting was
       swallowed and the player was shown the board without themselves on
       it. A forced call during a load now waits its turn and runs after.

       For state.day, the day that was played, rather than today(). */
    let boardsQueued = false;
    async function loadBoards(force) {
        if (boardsState === "loading") {
            if (force) boardsQueued = true;
            return;
        }
        if (boards && !force) return;
        boardsState = "loading";
        renderBoards();
        const base = `${BOARDS_URL}?day=${encodeURIComponent(state.day)}`;
        try {
            const res = await fetch(force ? `${base}&fresh=${Date.now()}` : base, {
                headers: { "Accept": "application/json" },
                credentials: "same-origin"
            });
            if (!res.ok) throw new Error(String(res.status));
            boards = await res.json();
            boardsState = "ready";
        } catch (e) {
            // A board that will not load is a disappointment, not a
            // failure of the game — the day's own result is already on
            // screen and stays there.
            boardsState = "failed";
        }
        renderBoards();
        if (boardsQueued) {
            boardsQueued = false;
            loadBoards(true);
        }
    }

    /* A finished day this visit has not sent yet, sent now.

       submitDay used to run only as the fifth room ended. So a player who
       finished signed out and then signed in (which reloads the page) was
       never put on the board, and neither was one whose POST failed. Now
       the day is also sent when its results are reached, or the window is
       opened, with someone signed in: once per visit, as Odd One Out's
       wireResults does. Repeats are harmless (the server answers
       "already"). Only while the server still takes the day: today, or
       yesterday inside the five-minute grace (dayIsOpen in
       netlify/functions/_daily.js). */
    let postedDay = "";   // the day sent (or on its way) this visit
    const DAY_GRACE_MS = 5 * 60 * 1000;

    function dayStillOpen(day) {
        const t = today();
        if (day === t) return true;
        return day === yesterdayOf(t) && Date.now() - Date.parse(t + "T00:00:00Z") < DAY_GRACE_MS;
    }

    function submitIfOwed() {
        if (!state || !state.done || postedDay === state.day) return;
        if (!window.Account || !Account.current) return;
        if (!dayStillOpen(state.day)) return;
        submitDay();
    }

    /* Posts the finished day. Silent by design: whether a score reached the
       board is not something to interrupt someone's result with, and the
       board itself is the confirmation. Signed out, this does nothing at
       all — there is no name to put on a row. */
    async function submitDay() {
        if (!window.Account || !Account.current) return;
        const forDay = state.day;
        postedDay = forDay;
        const rounds = state.results.map((r, i) => {
            const winning = r.won ? r.guesses[r.guesses.length - 1] : null;
            return {
                tries: r.guesses.length,
                won: Boolean(r.won),
                // Sent so the server can check the answer against the day's
                // real one and score the round itself, rather than taking a
                // number from the page on trust.
                answer: winning ? winning.name : null
            };
        });
        let sent = false;
        try {
            const res = await fetch(BOARDS_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ day: forDay, rounds })
            });
            sent = res.ok;
        } catch (e) { /* the local record is already kept; nothing to say */ }
        /* A failed POST used to be the end of it. Now the day is marked as
           still owed, so the next time the results are reached this visit
           (submitIfOwed) it is sent again. Nothing below is worth doing
           for a day the server has not got. */
        if (!sent) {
            if (postedDay === forDay) postedDay = "";
            return;
        }

        /* Re-read the account's totals now the day has been recorded, so
           the results panel shows the counted truth rather than this
           device's guess at it — they differ for anyone who has played
           elsewhere today, or signed in part-way through. */
        const remote = await Account.fetchState();
        if (remote && remote.stats) {
            stats = { ...stats, ...remote.stats };
            renderSummary();
        }
        loadBoards(true);
        // And the combined column, which was drawn from a read made before
        // this day's row existed. The one other time it is fetched.
        refreshCombined(true);
    }

    /* The four spans a board can cover. Today first, because that is the
       one everybody has just played; all time last, because on a board
       that has been running a while it is the least reachable and the
       least encouraging. A week and a month exist precisely so that
       somebody arriving in November is not forty days behind. */
    const BOARD_RANGES = [
        { key: "day", label: "Today", empty: "Nobody has finished today yet." },
        { key: "week", label: "This week", empty: "No scores this week yet." },
        { key: "month", label: "This month", empty: "No scores this month yet." },
        { key: "allTime", label: "All time", empty: "No scores recorded yet." }
    ];
    let boardRange = "day";

    /* Someone else's day, as five squares. Safe to show beside a name
       because it says how each round went and nothing whatever about what
       was in it — the same reason the shareable grid is safe to paste into
       a channel where people have not played yet.

       Only today's board carries one; a month's total has no single day to
       draw. Rows recorded before the grid was stored come back null and
       simply render nothing rather than five wrong squares. */
    function miniGrid(grid) {
        if (!Array.isArray(grid) || grid.length !== ROUNDS) return "";
        const cells = grid.map(n => {
            const cls = n >= 1 && n <= 4 ? `is-won g${n}` : "is-lost";
            return `<span class="guess-board-cell ${cls}"></span>`;
        }).join("");
        const solved = grid.filter(n => n > 0).length;
        return `<span class="guess-board-grid" role="img"
                      aria-label="${solved} of ${ROUNDS} found">${cells}</span>`;
    }

    function boardRows(list, mine, empty) {
        if (!list || !list.length) {
            return `<li class="guess-board-empty">${escapeHtml(empty)}</li>`;
        }
        /* Ties share a place — 1, 1, 3 — numbered by the same Daily.ranks
           that numbers the board beside this one, so the two columns cannot
           disagree about what a tie is. Positional numbering is the fallback
           only for a page somehow without js/daily.js. */
        const place = window.Daily && Daily.ranks ? Daily.ranks(list) : list.map((r, i) => i + 1);
        return list.map((row, i) => `
            <li class="guess-board-row${mine && row.id === mine ? " is-me" : ""}">
                <span class="guess-board-rank" aria-hidden="true">${place[i]}</span>
                ${row.avatar
                    ? `<img class="guess-board-face" src="${escapeHtml(row.avatar)}" alt="" aria-hidden="true" loading="lazy">`
                    : `<span class="guess-board-face is-blank" aria-hidden="true"></span>`}
                <span class="guess-board-name">${escapeHtml(row.name || "Someone")}</span>
                ${miniGrid(row.grid)}
                <span class="guess-board-score">${row.points}</span>
            </li>`).join("");
    }

    /* Splits the board area into this game's board and the combined one, and
       hands the second column to js/daily.js.

       Guess the Maze keeps its own board code and its own endpoint — it came
       first, is scored by netlify/functions/guess-scores.js against its own
       POINTS array, and its rows carry a grid the game beside it does not.
       What it does NOT need its own copy of is the day added up across every
       game, so that half is drawn by the shared renderer in js/daily.js.

       Built once and remembered: renderBoards runs again on every range
       switch, and rebuilding the pair each time would throw the combined
       board away and re-fetch it for a press that has nothing to do with
       it. */
    /* ONE boards element for the day, built once and moved rather than
       rebuilt.

       renderSummary rewrites the results card with innerHTML, and renderAll
       calls it on every guess, every range switch's parent redraw, and
       every stats refresh. The board area used to be part of that markup,
       so each rewrite threw the combined board away and boardColumns built
       a new one — which fetched the combined scores again. Once the day was
       done that was a request to the most expensive read on the site every
       time anything on the card changed. Now the element outlives the
       markup around it: renderSummary drops a slot where it goes and swaps
       this in, and the combined board inside it is fetched once per day —
       again only when the day is thrown away (forgetDeal) or a fresh
       submission needs the player to see themselves (refreshCombined). */
    let boardsHost = null;
    let boardPanel = null;
    function boardsElement() {
        if (boardsHost) return boardsHost;
        boardsHost = document.createElement("div");
        boardsHost.className = "guess-boards";
        boardsHost.id = "guess-boards";
        boardsHost.innerHTML = `
            <div class="guess-boards-pair">
                <div class="guess-boards-own"></div>
                <div class="guess-boards-all"></div>
            </div>`;
        boardPanel = boardsHost.querySelector(".guess-boards-own");
        refreshCombined(false);
        return boardsHost;
    }

    function refreshCombined(fresh) {
        if (!boardsHost || !window.Daily || !Daily.combinedBoard) return;
        Daily.combinedBoard(boardsHost.querySelector(".guess-boards-all"), { day: state.day, fresh });
    }

    function boardColumns() {
        // Only once the results card has placed it; before that there is
        // nowhere on screen for a board to go.
        return boardsHost && boardsHost.isConnected ? boardPanel : null;
    }

    function renderBoards() {
        const host = boardColumns();
        if (!host) return;

        const me = window.Account && Account.current ? Account.current.id : null;

        if (boardsState === "loading" || boardsState === "idle") {
            host.innerHTML = `<p class="guess-board-note">Fetching the scores…</p>`;
            return;
        }
        if (boardsState === "failed") {
            host.innerHTML = `<p class="guess-board-note">The scoreboard could not be reached just now.</p>`;
            return;
        }

        /* The prompt to sign in belongs here and only here — at the moment
           there is a score worth putting somewhere. Asking on the way IN to
           a game nobody has played yet is asking for a login to do nothing
           with. */
        const invite = me ? "" : `
            <p class="guess-board-note guess-board-invite">
                Your ${dayPoints()} points are saved on this device.
                <button type="button" class="guess-btn" id="guess-board-signin">Sign in with Discord to be listed</button>
            </p>`;

        const range = BOARD_RANGES.find(r => r.key === boardRange) || BOARD_RANGES[0];
        const list = boards[range.key];

        /* One board with a range switch rather than four stacked boards.
           Four would be most of a screen of names, and three of them are
           the same names in a different order — the switch says "the same
           board over a different span", which is what it is. */
        const tabs = BOARD_RANGES.map(r => `
            <button type="button" class="guess-board-range${r.key === boardRange ? " is-on" : ""}"
                    data-range="${r.key}" aria-pressed="${r.key === boardRange}">${escapeHtml(r.label)}</button>`).join("");

        // What the span actually covers, since "this week" is a Monday, not
        // a rolling seven days, and that is worth being plain about.
        const span = boardRange === "week" && boards.weekFrom
            ? `Since ${niceDate(boards.weekFrom)}`
            : boardRange === "month" && boards.monthFrom
                ? `Since ${niceDate(boards.monthFrom)}`
                : boardRange === "day"
                    ? "Your five against everyone else's"
                    : "Every day the game has run";

        host.innerHTML = `
            ${invite}
            <div class="guess-board">
                <div class="guess-board-ranges" role="group" aria-label="Which span the board covers">${tabs}</div>
                <p class="guess-board-span">${escapeHtml(span)}</p>
                <ol class="guess-board-list">${boardRows(list, me, range.empty)}</ol>
            </div>`;

        host.querySelectorAll(".guess-board-range").forEach(btn => {
            btn.addEventListener("click", () => {
                boardRange = btn.dataset.range;
                // Everything is already in hand — one request fetched all
                // four — so switching is a redraw, not a round trip.
                renderBoards();
            });
        });

        const signin = document.getElementById("guess-board-signin");
        if (signin) signin.addEventListener("click", () => window.Account && Account.signIn());
    }

    function niceDate(iso) {
        return new Date(iso + "T00:00:00Z")
            .toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
    }

    let countdownTimer = null;
    function tickCountdown() {
        const target = document.getElementById("guess-next-up");
        if (!target) return;
        clearInterval(countdownTimer);
        /* Counted to the midnight AFTER THE DAY PLAYED, not after today.

           It used to take tomorrow's midnight from the clock on every tick,
           so the target moved on at the same instant it was reached: a
           results card left open overnight went from "0h 0m" straight to
           "23h 59m", and the "ready" line below was unreachable code. Now
           the target is fixed by state.day, so once it passes the card says
           the new rooms are there — and reopening the window deals them
           (see open()). */
        const next = new Date(state.day + "T00:00:00Z");
        next.setUTCDate(next.getUTCDate() + 1);
        const update = () => {
            const ms = next - new Date();
            if (ms <= 0) {
                target.textContent = "Five new rooms are ready — close this and reopen it to play.";
                clearInterval(countdownTimer);
                return;
            }
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
        const text = `Maze Rats · Guess the Maze\n${when} — ${solved}/${ROUNDS} · ${dayPoints()} pts\n${state.results.map(squareFor).join("")}\n${location.origin}/guess`;
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = "Copied";
        } catch (e) {
            // The clipboard needs a secure context and permission, and has
            // neither guaranteed. A selectable box beats a button that
            // silently does nothing.
            //
            // The same box every time. Each failed press used to insert a
            // new one, so a player pressing again (as anybody would when
            // nothing seemed to happen) grew a column of identical boxes.
            const holder = btn.parentElement || btn;
            let box = holder.querySelector(".guess-share-fallback");
            if (!box) {
                box = document.createElement("textarea");
                box.className = "guess-share-fallback";
                box.readOnly = true;
                btn.insertAdjacentElement("afterend", box);
            }
            box.value = text;
            box.select();
            btn.textContent = "Copy this";
        }
        setTimeout(() => { btn.textContent = "Copy result"; }, 2200);
    }

    // ---------- opening and closing ----------

    let started = false;

    /* Set when the archive could not be reached, so the splash's button
       means "try again" rather than "start". */
    let unavailable = false;

    async function start(retrying) {
        if (started) return;
        started = true;
        unavailable = false;

        /* Rooms read on an earlier UTC day are not the archive today is
           dealt from: a maze added yesterday joins today's rotation (see
           existedBefore in js/daily.js), and the server reads the archive
           as it is now. A tab left open overnight used to deal today from
           yesterday's copy, a different five from the server's. start()
           always deals today, so a stale copy is dropped here. */
        if (ROOMS.length && roomsDay !== today()) ROOMS = [];

        if (!ROOMS.length) {
            /* A retry has to get past Api's own memo first: getRooms keeps
               its promise for the life of the page, fallback included, so
               asking again would hand back the same answer that failed. */
            if (retrying && typeof Api !== "undefined" && Api._inflight) delete Api._inflight.rooms;
            try {
                ROOMS = await (Api.roomsForToday ? Api.roomsForToday() : Api.getRooms());
                roomsDay = Api.roomsDay || today();
            } catch (e) { ROOMS = []; }

            /* THE BUNDLED FALLBACK IS NOT AN ARCHIVE TO DEAL FROM. When the
               live rooms cannot be reached, js/api.js hands back the one
               maze in js/rooms-data.js and marks "room data" degraded. The
               game used to deal from it regardless: five rounds of that one
               maze's pictures, every answer the same name — a day nobody
               else was playing, which the server (reading the real archive)
               would then score against a different five and find all wrong.
               Odd One Out has always ended up at "nothing to deal" here,
               because one maze cannot fill its rounds; this says the same,
               and offers the retry. */
            if (typeof Api !== "undefined" && Api._degraded && Api._degraded.has("room data")) {
                ROOMS = [];
                unavailable = true;
                started = false;
                el.play.disabled = false;
                el.play.textContent = "Try again";
                el.splashFoot.textContent = "The archive is not answering just now, so there is nothing to deal.";
                el.splashFoot.hidden = false;
                return;
            }
        }
        pool = buildPool(today());
        if (!pool.length) {
            el.play.disabled = true;
            el.play.textContent = "Nothing to play yet";
            el.splashFoot.textContent = "There are no room pictures in the archive to make a puzzle from yet.";
            el.splashFoot.hidden = false;
            return;
        }
        el.play.disabled = false;
        stats = loadStats();
        state = loadState();

        /* Signed in, the account is the better record of both: the day in
           progress may have been played further on another device, and the
           running totals are counted from the scores actually recorded
           rather than from whatever this browser happens to remember.

           Awaited, because both change what the deck is about to show. It
           is one request, and only for someone who is signed in. */
        if (window.Account) {
            await Account.ready();
            if (Account.current) {
                const remote = await Account.fetchState();
                if (remote) {
                    adoptAccountDay(remote.guess);
                    if (remote.stats) stats = { ...stats, ...remote.stats };
                }
            }
        }

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
        claimAdminReset()
            .then(() => { if (dayHasTurned()) forgetDeal(); })
            .then(() => start())
            .then(() => {
                if (!state) return;
                goTo("intro");
                // A finished day not yet on the board (signed in since, or
                // the first POST failed); see submitIfOwed.
                submitIfOwed();
            });
    }

    /* A tab left open overnight.

       start() runs once per page load, so a player who finished yesterday
       and reopened the window this morning without reloading was shown
       yesterday's results — the whole deck, the countdown at zero, and no
       way to today's rooms short of a refresh nobody would think to do.

       The day turns over here, on open, when the day in memory is not
       today's AND it is finished or untouched. A day part-way through is
       left alone: somebody on room three at midnight finishes the five
       they started rather than having them swapped mid-sitting, and the
       result goes to the server under the day it was dealt for. Inside the
       five-minute grace (dayIsOpen in netlify/functions/_daily.js) that is
       recorded; after it, it is kept on this device only — which is the
       honest outcome for a game begun yesterday, and far better than a
       mixed day filed against the wrong date. The open after that one ends
       starts today. */
    function dayHasTurned() {
        if (!started || !state || state.day === today()) return false;
        const played = state.results.some(r => r.guesses.length);
        return state.done || !played;
    }

    /* Throws away everything dealt for the day in memory, so start() deals
       afresh. dealGen is what stops a picture still on its way for the old
       day from being filed into the new one (see prepareRound). */
    function forgetDeal() {
        dealGen += 1;
        started = false;
        state = null;
        rounds = [];
        preparing = {};
        picksCache = { day: "", picks: [] };
        optionsCache = { day: "", rounds: [] };
        boards = null;
        boardsState = "idle";
        boardsQueued = false;
        if (boardsHost) boardsHost.remove();
        boardsHost = null;
        boardPanel = null;
        clearInterval(countdownTimer);
    }

    /* A day given back by an administrator.

       On EVERY open rather than once per page load. It lived inside start()
       at first, which runs exactly once — so a player who had already opened
       the game in that tab could be reset, reopen, and find their finished
       day still sitting there. The window is the thing being opened; the
       claim belongs with it.

       All three copies of the day have to go, and this is the one the server
       cannot reach: the scored row and the account's mirror are deleted by
       netlify/functions/daily-games.js, and localStorage by this. Missing
       the account mirror is what made the first version of this appear to do
       nothing — the game cleared its own copy and then adopted the finished
       day straight back off the account. */
    async function claimAdminReset() {
        if (!window.Daily) return;
        let given = false;
        try { given = await window.Daily.claimReset("guess"); } catch (e) { given = false; }
        if (!given) return;
        try { localStorage.removeItem(STATE_KEY); } catch (e) { /* private mode */ }
        /* And the copy in memory, which start() will not rebuild for a page
           that has already run it. Without this the deck redraws from the
           day that was just taken away.

           renderAll, NOT buildDeck: buildDeck clones five round sheets and
           inserts them, so calling it a second time leaves a deck of ten.
           renderAll is what start() itself uses to draw the sheets from
           whatever state holds.

           Unless the day in memory is not today's, in which case the
           pictures already prepared belong to a different deal altogether
           and the whole of it goes (forgetDeal); start() then deals today
           from the cleared storage. */
        if (started && state && state.day !== today()) {
            forgetDeal();
            return;
        }
        state = blankDay();
        saveState();
        // The board in hand was read before the day was given back, with the
        // player's old row on it; the replay should fetch its own.
        boards = null;
        boardsState = "idle";
        if (started) {
            renderAll();
            prepareRound(state.round);
        }
    }

    function close() {
        el.overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
        clearInterval(countdownTimer);
        // Back to whatever opened the window, when there is something to
        // go back to. The side menu closes itself before opening this, so
        // the spine is the sensible landing place — but a pasted /guess
        // link has no opener at all, hence the guard.
        const opener = document.getElementById("side-spine");
        if (opener) opener.focus({ preventScroll: true });
        // A pasted /guess link should not leave the address bar claiming the
        // game is open once it has been closed.
        if (location.pathname === "/guess") history.replaceState({}, "", "/home");
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
                status: node.querySelector(".guess-status"),
                options: node.querySelector(".guess-options"),
                between: node.querySelector(".guess-between")
            };
            // Focusable so goTo can put the caret on a sheet that has no
            // field to put it in — the results, or a finished room.
            const inner = node.querySelector(".guess-sheet-inner");
            if (inner) inner.tabIndex = -1;

            /* A live region per room, for the verdict — see settleFocus.

               Its own element rather than role="status" on the reveal
               block, because that block is hidden until the round ends and
               then filled in the same moment it is shown, and a region that
               appears already holding its words is one screen readers
               commonly do not announce. This one is in the sheet from the
               start, empty, and only its text changes. visually-hidden is
               the site's class (the pips use it too), so nothing on screen
               moves. */
            if (kind === "round" && inner) {
                refs.live = document.createElement("p");
                refs.live.className = "visually-hidden";
                refs.live.setAttribute("role", "status");
                refs.live.setAttribute("aria-live", "polite");
                inner.appendChild(refs.live);
            }
            return { el: node, kind, roundIndex: -1, refs };
        });

        let n = 0;
        sheets.forEach(s => { if (s.kind === "round") s.roundIndex = n++; });
        sheets.filter(s => s.kind === "round").forEach(wireRound);
        return true;
    }

    /* Delegated to the box rather than bound to five buttons, because the
       five are rewritten on every render — a listener per button would be
       re-attached on every guess, and the round only has three. */
    function wireRound(sheet) {
        sheet.refs.options.addEventListener("click", e => {
            const btn = e.target.closest(".guess-option");
            if (!btn || btn.disabled) return;
            sheet.refs.status.hidden = true;
            submitGuess(btn.dataset.name);
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
            spine: document.getElementById("side-spine")
        };
        /* Not the opener. The game used to require its own tab to exist
           before it would set itself up, which meant replacing the tabs
           with a menu silently stopped the deck from ever being built —
           the window opened onto two sheets instead of seven. What this
           file actually needs is its own markup; who offers it is not its
           business (see window.openGuessGame). */
        if (!el.overlay || !el.deck) return;
        if (!buildDeck()) return;

        el.close.addEventListener("click", close);
        el.overlay.addEventListener("click", e => { if (e.target === el.overlay) close(); });

        el.play.addEventListener("click", () => {
            // The archive was unreachable last time; this press is the retry.
            if (unavailable) {
                el.play.disabled = true;
                el.play.textContent = "Dealing…";
                start(true).then(() => { if (state) goTo("intro"); });
                return;
            }
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

    /* How today is going, for the menu that offers the game.

       Read from storage rather than from `state`, deliberately: the game
       does not load its state until the window is first opened, and the
       menu has to be able to say "3 of 5" before anyone has opened
       anything. Storage is the same source of truth either way.

       Exposed as a function rather than a value because it is asked the
       moment the menu opens, which can be at any point in a visit. */
    window.GuessStatus = function () {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        if (!saved || saved.day !== today() || !Array.isArray(saved.results)) {
            return { started: false, done: 0, total: ROUNDS, finished: false, points: 0 };
        }
        const done = saved.results.filter(r => r && r.done).length;
        const points = saved.results.reduce((n, r) => {
            if (!r || !r.done || !r.won) return n;
            return n + (POINTS[Math.min(r.guesses.length, POINTS.length) - 1] || 0);
        }, 0);
        return {
            started: saved.results.some(r => r && r.guesses && r.guesses.length),
            done,
            total: ROUNDS,
            finished: Boolean(saved.done),
            points
        };
    };

    /* The one way in, published for whatever offers it. The side menu asks
       for the game by name rather than reaching for a button that may or may
       not be in the markup — which is what it used to do, and what broke the
       moment the tabs were replaced. */
    window.openGuessGame = function () { open(); };

    /* mount() now, if the document is already parsed.

       This file is no longer a <script src> in home.html — js/daily-loader.js
       fetches it the first time somebody asks for the game, which is long
       after DOMContentLoaded has been and gone. Listening for an event that
       has already fired means mount() never runs and the window opens empty.
       Both branches, because the deep-link path (/guess, /odd)
       still loads it while the document is parsing. */
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
})();

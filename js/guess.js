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
    /* v5: the day became the server's deal (netlify/functions/_deal.js),
       and a round's answer is only known once the server has said so. A
       v4 day was dealt by this page, from a different seed, and carries
       names the server never offered — so, as before, it is dropped rather
       than migrated. `v` inside the saved day says the same thing to the
       account's mirror of it (see adoptAccountDay). */
    const STATE_KEY = "mazerats_guess_v5";
    const STATE_VERSION = 5;
    /* v4: the rounds went from 100 points to 10 (see POINTS), so a running
       record counted on the old scale starts again rather than carrying
       totals nobody can now match a day against. */
    const STATS_KEY = "mazerats_guess_stats_v4";

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

       Ten a round, so 50 is a perfect day — the same as Odd One Out next
       door, and small enough that the speed bonus (up to 36 for each room
       named right, a point for every second under 37 it took — and no room
       can be named in under a second, because the server refuses a first
       guess sooner than MIN_MOVE_MS; added on the board, see
       netlify/functions/_speed.js) is worth playing for. The same
       array is kept by the server to score a submitted day (see
       netlify/functions/guess-scores.js), so the two can never disagree
       about what a round was worth. Change one, change both. */
    const POINTS = [10, 6, 3];

    function pointsFor(result) {
        if (!result || !result.done || !result.won) return 0;
        return POINTS[Math.min(result.guesses.length, POINTS.length) - 1] || 0;
    }

    function dayPoints() {
        return state.results.reduce((n, r) => n + pointsFor(r), 0);
    }

    let el = {};          // the window's shared elements, filled by mount()
    let sheets = [];      // the deck, in order: intro, 5 rooms, results
    /* The day's deal as the server handed it: { day, rounds }, each round
       { image, options, crop } — the picture, the five names offered, and
       the seed for where to cut. Nothing in it says which name is right;
       a round's answer arrives in the verdict that ends it and is kept in
       state.results[i].answer. null until it has arrived. */
    let deal = null;
    let state = null;     // this day's play
    let stats = null;     // the running record across days, as SHOWN — see shownStats
    let rounds = [];      // { image, cx, cy, img } per round, once ready
    let preparing = {};   // round index -> true while its picture is loading
    let unloadable = {};  // round index -> true once its picture has failed for good; see prepareRound
    let dealGen = 0;      // bumped whenever the deal is thrown away; see forgetDeal
    let guessing = false; // a guess on its way to be judged

    /* Which sheet is up. Not saved: the splash is where the window opens
       every time, including part-way through a day, because it is the one
       place that says what the game is and carries the streak. Reopening
       mid-day and being dropped straight back into room 3 with no
       explanation is a worse first second than one click. */
    let view = "intro";   // "intro" | "round" | "results"

    // ---------- the day, and a stable random for the crop ----------

    /* The same five rooms for everyone, everywhere — dealt by the server
       now (see the header of netlify/functions/_deal.js for why the page
       stopped dealing them). The day is UTC, so it turns over at the same
       instant for every player; read through Daily.today, which is
       corrected to the server's clock, so a device whose clock is wrong
       agrees with everybody else about which day it is. */
    function today() {
        return window.Daily && Daily.today ? Daily.today() : new Date().toISOString().slice(0, 10);
    }

    // mulberry32 — small, fast, and good enough that consecutive days do not
    // visibly rhyme. The point is reproducibility, not cryptography. Only
    // the crop draws from it now, from the seed each round is dealt with.
    function seededRandom(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ---------- the day's five rooms ----------

    /* Chosen by the server now: five pictures from five different mazes,
       entrance shots and hallways left out, only mazes catalogued before
       the day began — all of it moved to dealGuess in
       netlify/functions/_deal.js, with the notes on why each rule exists.

       KEYED ON state.day, NOT today(). A deal is only ever the deal for the
       day being played, pinned in state.day when it begins, so a player
       part-way through at midnight is never quietly handed a different five
       — the answer names, the options and the next picture all moving to
       the new day while the pictures already prepared and the day submitted
       stayed on the old one. */
    function picks() {
        return deal && state && deal.day === state.day ? deal.rounds : [];
    }

    // ---------- reading the picture ----------

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // Same origin, so the canvas is never tainted and getImageData
            // works — which the whole scoring pass below depends on. The
            // deal's picture is a deal-image address
            // (netlify/functions/deal-image.js), on this origin.
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
        if (sheet && !data && unloadable[i]) return drawUnavailable(sheet);
        if (!sheet || !data || !data.img) return;
        sheet.refs.canvas.setAttribute("aria-label", "A cropped piece of a maze room from the archive");

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
            // (As deal-image serves it: a 16:10 frame of the screenshot, so
            // the very widest shots lose a little at the sides — see ONE
            // SIZE PER GAME in deal-image.js, 28 Sept 2026.)
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

    /* The frame of a room whose picture would not load (see prepareRound):
       said in the frame itself, where the picture would be, rather than
       left as an empty square that looks like one still on its way. Drawn
       in a mid grey, which reads on the dark frame in either theme. */
    function drawUnavailable(sheet) {
        const canvas = sheet.refs.canvas;
        const out = canvas.getContext("2d");
        const side = canvas.width;
        out.clearRect(0, 0, side, side);
        out.fillStyle = "#8a8a8a";
        out.textAlign = "center";
        out.textBaseline = "middle";
        out.font = `${Math.round(side / 18)}px sans-serif`;
        out.fillText("Picture unavailable", side / 2, side / 2);
        canvas.setAttribute("aria-label", "This room's picture is unavailable");
    }

    // ---------- what is remembered ----------

    /* `mode` is settled by the day's first guess — "account" when somebody
       is signed in to have their guesses recorded, "anon" when not — and
       kept (see submitGuess). `posted` is whether the finished day reached
       the server, saved WITH the day so a submission that failed is sent
       again on the next open rather than forgotten with the visit. */
    function blankDay(forDay) {
        return {
            v: STATE_VERSION,
            day: forDay || today(),
            round: 0,
            // One entry per round: { guesses: [{name, correct}], done, won,
            // answer } — answer is { id, name, slug, creator } once the
            // server has ended the round, and null until then.
            results: Array.from({ length: ROUNDS }, () => ({ guesses: [], done: false, won: false, answer: null })),
            done: false,
            mode: null,
            posted: false
        };
    }

    // The stored day, if it is one of this shape; otherwise null.
    function readSaved() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        return saved && saved.v === STATE_VERSION && typeof saved.day === "string" &&
            Array.isArray(saved.results) && saved.results.length === ROUNDS ? saved : null;
    }

    // Guesses made, plus one for a finished day — how far on a copy of the
    // day is, when two copies of the same day have to be told apart.
    const progressOf = s => (s ? s.results.reduce((n, r) => n + ((r.guesses || []).length), 0) + (s.done ? 1 : 0) : -1);

    /* Saved, but not over a copy another tab has taken further.

       Two tabs of the game used to overwrite each other's day: each saved
       its state whole, so whichever tab guessed last wrote its copy over the
       other's, guesses and all. The stored copy is read first now, and if
       it is the same day and further on it is adopted rather than
       overwritten; the `storage` listener in mount() keeps a tab that is
       only watching up to date too. A signed-in player's guesses are the
       server's to settle anyway (the first recorded move per round wins). */
    function saveState() {
        const stored = readSaved();
        // Never a practice run's copy over the real day that replaced it
        // (see PRACTICE in refreshDay).
        if (stored && state && stored.day === state.day && progressOf(stored) > progressOf(state) &&
                !(stored.practice && !state.practice)) {
            state = Object.assign(stored, { posted: Boolean(stored.posted || state.posted) });
            return;
        }
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
    /* Only a mirror of THIS shape (`v`) and of the day being played: the
       mirror can still hold a day saved by the page before the server dealt
       it, whose names belong to a deal nobody is playing. The server's own
       record of a signed-in player's guesses (applyRecorded) is applied
       after this and wins over it. */
    function adoptAccountDay(saved) {
        if (!saved || saved.v !== STATE_VERSION || !state || saved.day !== state.day) return false;
        if (!Array.isArray(saved.results) || saved.results.length !== ROUNDS) return false;
        if (progressOf(saved) <= progressOf(state)) return false;
        // A practice run mirrored before the launch cut, once the cut has
        // passed: put away, not adopted (see PRACTICE in refreshDay).
        if (saved.practice && !practiceUntil) return false;
        state = Object.assign(blankDay(saved.day), {
            round: saved.round || 0,
            results: saved.results,
            done: Boolean(saved.done),
            mode: saved.mode || null,
            posted: Boolean(saved.posted)
        }, practiceUntil ? { practice: practiceUntil } : {});
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
        return true;
    }

    /* THE RUNNING RECORD, AND WHOSE IT IS.

       This device keeps its own record under STATS_KEY — the only record a
       signed-out player has. A signed-in player's figures are the
       account's, counted by the server from the days actually recorded
       (statsFor in netlify/functions/player-data.js).

       The two used to be merged into one object, and that object was what
       got saved: so signing in once wrote the account's totals over this
       device's own signed-out record for good, and signing out again showed
       the account's figures as if they were the device's. Now they are
       kept apart. `localStats` is the device's and the only one saved
       here; `accountStats` is the account's and lives in memory, for this
       visit only. `stats` is whichever is being shown — see shownStats. */
    let localStats = null;
    let accountStats = null;

    function loadStats() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(STATS_KEY) || "null"); } catch (e) { s = null; }
        const blank = { days: 0, solved: 0, rounds: 0, streak: 0, best: 0, points: 0, bestDay: 0, lastDay: "" };
        return s && typeof s === "object" ? { ...blank, ...s } : blank;
    }

    function saveStats() {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(localStats)); } catch (e) { /* private mode */ }
    }

    // The account's figures while somebody is signed in and they have been
    // read; the device's otherwise.
    function shownStats() {
        stats = accountStats && window.Account && Account.current ? accountStats : localStats;
        return stats;
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
        shownStats();
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
        // Fresh from storage first: another tab may have banked this day
        // already, and the guard below only sees that in a fresh copy.
        localStats = loadStats();
        // A practice run is not a day played: the real one after the launch
        // cut is what the streak and totals count (30 Sept 2026).
        if (localStats.lastDay !== state.day && !state.practice) countDay();
        submitDay();
    }

    /* Counted into the device's own record, which is saved; and into the
       account's figures in memory too, so the card is right straight away —
       submitDay then replaces those with the server's own count.

       In BASE points (dayPoints), on both sides. The account's count
       (statsFor in netlify/functions/player-data.js) added the speed bonus
       for a while, so the same card read "50 points" for a perfect day and
       "Best day 83" under it when signed in, and 50 and 50 signed out. It
       counts base points now, as this does: every number on the card is in
       the units the card scores the day in, as on Odd One Out's. The boards
       and the Profile still rank by, and show, the total. */
    function countDay() {
        const solved = state.results.filter(r => r.won).length;
        const scored = dayPoints();
        const count = s => {
            /* Never a day older than the last one banked, as bankDay in
               js/oddoneout.js has it (30 Sept 2026): a day begun before
               midnight and finished in the grace, after the new day was
               already played in another tab, moved lastDay backwards and
               restarted the streak at 1. ISO days compare as strings. */
            if (s.lastDay && s.lastDay >= state.day) return;
            s.streak = s.lastDay === yesterdayOf(state.day) ? s.streak + 1 : 1;
            s.best = Math.max(s.best, s.streak);
            s.days += 1;
            s.rounds += ROUNDS;
            s.solved += solved;
            s.points += scored;
            s.bestDay = Math.max(s.bestDay, scored);
            s.lastDay = state.day;
        };
        count(localStats);
        saveStats();
        if (accountStats && accountStats.lastDay !== state.day) count(accountStats);
        shownStats();

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
    /* A PICTURE THAT WILL NOT LOAD no longer stops the day.

       The deal is stored for the day (netlify/functions/_deal.js), so a
       picture deleted or replaced in the archive after it was dealt leaves
       a room pointing at nothing. The failure used to say "try again in a
       moment" with nothing to press, and submitGuess refuses a room whose
       picture is not in hand — so the room could not be played, the day
       could not be finished, and it never reached the board.

       Now a failure is tried again by itself, twice, a few seconds apart
       (PICTURE_RETRY_MS: a bad moment on the connection, or the image CDN
       warming up, is the usual cause). After that the room is marked
       `unloadable`: the frame says so, the status line offers a retry, and
       the five names can still be pressed — a room named without its
       picture is a poor round, but a day that can be finished is better
       than one that cannot. A picture that arrives later (a retry that
       works) is drawn as normal. */
    const PICTURE_RETRY_MS = [2000, 6000];
    async function prepareRound(i, attempt) {
        if (i == null || i < 0 || i >= ROUNDS) return;
        if (rounds[i] || preparing[i]) return;
        const pick = picks()[i];
        /* Not handed out yet (ONE ROUND AT A TIME in js/daily.js): asked
           for only once the room is the one on screen, never from the
           splash — for room 1 the asking is the start, and the clock must
           not start before Play is pressed. */
        if (!pick) {
            if (view === "round" && state && i === state.round && deal && i < deal.rounds.length) fetchRound(i);
            return;
        }
        const tried = attempt || 0;

        preparing[i] = true;
        setBusy(i, true);
        const gen = dealGen;

        /* The deal-image address as it is, not wrapped in imgCdn (28 Sept
           2026). deal-image serves every Guess picture through the image CDN
           at one fixed 704x440 JPEG, so no picture's size or shape says which
           maze it is (ONE SIZE PER GAME in deal-image.js). This used to ask
           for it again at w=900 with the aspect kept, which was the leak
           when the picture came as uploaded; on the fixed picture it could
           only re-encode it a second time, since the CDN never enlarges. The
           crop below reads naturalWidth/naturalHeight, so it takes the
           fixed size as it comes. */
        let img = null;
        try {
            img = await loadImage(pick.image);
        } catch (e) {
            if (gen !== dealGen) return;
            preparing[i] = false;
            if (tried < PICTURE_RETRY_MS.length) {
                // Still busy-looking while it waits, as a load would be.
                setTimeout(() => { if (gen === dealGen) prepareRound(i, tried + 1); }, PICTURE_RETRY_MS[tried]);
                return;
            }
            setBusy(i, false);
            unloadable[i] = true;
            pictureUnavailable(i);
            renderRound(i);
            // The next room is not held up by this one's picture.
            if (i + 1 < ROUNDS) prepareRound(i + 1);
            return;
        }
        /* The day moved on while the picture was on its way — the window
           was reopened on a new day, or an administrator's reset landed —
           and this picture belongs to the deal that has just been thrown
           away. Filing it would put yesterday's room into today's round. */
        if (gen !== dealGen) return;

        /* Where to cut, from the seed the round was dealt with — the same
           for every player, and handed out by the server rather than
           derived here, so nothing about a day can be worked out in the
           page before it is dealt. */
        const centre = findCropCentre(img, seededRandom(pick.crop >>> 0));
        rounds[i] = {
            image: pick.image,
            img,
            cx: centre ? centre.x : img.naturalWidth / 2,
            cy: centre ? centre.y : img.naturalHeight / 2
        };
        preparing[i] = false;
        setBusy(i, false);
        if (unloadable[i]) {
            // A retry that worked: the unavailable notice goes with it.
            unloadable[i] = false;
            const sheet = roundSheet(i);
            if (sheet) { sheet.refs.status.hidden = true; sheet.refs.status.textContent = ""; }
        }
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

    /* The rooms handed out so far, kept beside the day under a key of their
       own (30 Sept 2026). A deal reply no longer carries every room — see
       ONE ROUND AT A TIME in js/daily.js — and signed out it carries none,
       so a reload part-way through plays on from these. Not in STATE_KEY,
       because the state is mirrored to the account (saveState) and this is
       nothing the account needs. */
    const DEALT_KEY = "mazerats_guess_dealt";
    function keepDealt() {
        if (!deal) return;
        /* The kept copy merged in first, so a tab that is behind (another
           tab has been handed later rooms since) never writes its shorter
           list over the longer one (30 Sept 2026). */
        mergeKeptDealt();
        try { localStorage.setItem(DEALT_KEY, JSON.stringify({ day: deal.day, rounds: deal.rounds })); } catch (e) { /* private mode */ }
    }
    function mergeKeptDealt() {
        if (!deal) return;
        let kept = null;
        try { kept = JSON.parse(localStorage.getItem(DEALT_KEY) || "null"); } catch (e) { kept = null; }
        if (kept && kept.day === deal.day) Daily.mergeRounds(deal.rounds, kept.rounds);
    }

    /* A room whose picture and names this page does not have: room 1
       before the start's reply has brought it, or a later one whose `next`
       was lost (a reply that fell over, a reload with nothing kept). Room 1
       is asked for through Daily.opening. A later one is in a deal asked
       for again when signed in, since the server's record says it has been
       reached; signed out the server keeps no record, so the guess that
       ended the room before is sent again, unrecorded and `final` as it
       was, and its answer hands this room out as it did the first time. */
    let fetchingRound = -1;
    async function fetchRound(i) {
        if (fetchingRound === i || !deal || !state) return;
        fetchingRound = i;
        const gen = dealGen;
        const forDay = state.day;
        const list = picks();
        setBusy(i, true);
        if (i === 0) {
            Daily.takeRound(list, await Daily.opening("guess", forDay, BOARDS_URL));
        } else {
            const reply = await Daily.deal("guess", forDay, BOARDS_URL);
            if (reply && reply.day === forDay) Daily.mergeRounds(list, reply.rounds);
            /* A day begun signed out and now signed in, with the rooms it was
               handed not on this device — the account's mirror brought the
               day here from another one (adoptAccountDay). The server has no
               record to hand them out from, and the signed-out way below is
               closed to a signed-in request, so this used to end in "could
               not be dealt" and a Try again that could never work. Recording
               the day's guesses (as the next guess would anyway) hands each
               room after them out again (30 Sept 2026). */
            if (!list[i] && state && state.mode === "anon" && signedIn() && state.day === forDay) {
                await adoptRecorded(roundSheet(i));
            }
            const before = state && state.results[i - 1];
            const last = before && before.done && before.guesses[before.guesses.length - 1];
            if (!list[i] && state && state.mode === "anon" && last && !signedIn()) {
                const again = await Daily.move("guess", forDay, i - 1, { guess: last.name, final: true }, { anon: true, url: BOARDS_URL });
                Daily.takeRound(list, again.body && again.body.next);
            }
        }
        fetchingRound = -1;
        if (gen !== dealGen || !state || state.day !== forDay || picks() !== list) return;
        setBusy(i, false);
        if (list[i]) {
            keepDealt();
            renderRound(i);
            prepareRound(i);
            return;
        }
        const sheet = roundSheet(i);
        if (sheet && state.round === i) {
            statusWithAction(sheet, "This room could not be dealt just now.", "Try again", () => {
                sheet.refs.status.hidden = true;
                fetchRound(i);
            });
        }
    }

    /* The status line of a room whose picture has failed for good, with a
       button to try it once more. Written as elements, so the handler is
       bound to exactly this button; the status line is role="status", so
       the words are read out as they arrive. */
    function pictureUnavailable(i) {
        const sheet = roundSheet(i);
        if (!sheet) return;
        const status = sheet.refs.status;
        status.textContent = "This room's picture wouldn't load. You can still name it from the five below. ";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "guess-btn";
        retry.textContent = "Try the picture again";
        retry.addEventListener("click", () => {
            retry.disabled = true;
            status.textContent = "Loading the picture again…";
            unloadable[i] = false;
            // One try from a button, no automatic ones after it: the
            // player has already waited through those once.
            prepareRound(i, PICTURE_RETRY_MS.length);
        });
        status.appendChild(retry);
        status.hidden = false;
    }

    // ---------- guessing ----------

    function currentResult() {
        return state.results[state.round];
    }

    const signedIn = () => Boolean(window.Account && Account.current);

    /* A guess, sent to be judged. The page no longer knows which of the
       five names is right, so every guess is a question to the server, and
       the round moves on when the answer comes back — with the maze's name
       once the round is over, and not before.

       For a signed-in player the server also RECORDS it, and it counts the
       guesses: a round's view number is how many the server received, not a
       number this page reports (it used to be, and "1" was worth ten points
       a round to anybody who wrote it). The first recorded guesses stand —
       if another tab or device has played this round, the answer carries
       that round as the server has it, and that is what is shown.

       The mode is settled by the day's first guess, as Odd One Out's is
       (see choose in js/oddoneout.js): a day begun signed out is sent with
       `anon` while the player stays signed out, is not recorded, and is
       filed from this page's own guesses with no bonus once finished. If
       they sign in part-way, the day becomes recorded — the server refuses
       `anon` from a signed-in request now — by recording the guesses
       already made first (adoptRecorded), still untimed. Signed out, the server cannot
       count, so the page says when a guess is its last (`final`) to be told
       the answer.

       While a guess is on its way the other names are ignored; one that
       could not be judged leaves the round as it was, says so, and can
       simply be made again. */
    async function submitGuess(name, again) {
        const index = state.round;
        const result = currentResult();
        // Not before the picture is on screen: a guess at a room nobody has
        // seen yet is not a guess about the room. Unless the picture has
        // failed for good (unloadable — see prepareRound), when the names
        // are all there is, and refusing them was what stopped the day.
        if (!result || result.done || guessing || !picks()[index] || !(rounds[index] || unloadable[index])) return;
        const forDay = state.day;
        const final = result.guesses.length + 1 >= TRIES;

        guessing = true;
        const sheet = roundSheet(index);
        if (sheet) sheet.el.classList.add("is-busy");
        /* The mode, settled by the day's first guess — but not on a sign-in
           check that FAILED rather than answered (Account.unsure; see
           js/account.js), which used to settle a signed-in player's day as
           unrecorded. Asked again first; still unsure, the guess goes out
           without `anon` and the server's `recorded` settles it, since the
           server can read the session even when this page could not ask. As
           choose() in js/oddoneout.js. */
        if (!state.mode) {
            if (window.Account && Account.unsure) { try { await Account.refresh(); } catch (e) { /* still unsure */ } }
            if (signedIn()) state.mode = "account";
            else if (!(window.Account && Account.unsure)) state.mode = "anon";
        }
        /* A day begun signed out, and the player has signed in since: its
           guesses so far are recorded first (adoptRecorded), and this one
           and the rest go out recorded too. The server no longer answers
           `anon` from a signed-in request — see the note at the POST in
           netlify/functions/guess-scores.js. */
        if (state.mode === "anon" && signedIn()) {
            const adopted = await adoptRecorded(sheet);
            if (!state || state.day !== forDay || state.round !== index) { guessing = false; return; }
            // "signed-out": the server saw no session after all, so the day
            // carries on as it was, unrecorded.
            if (!adopted) {
                guessing = false;
                if (sheet) sheet.el.classList.remove("is-busy");
                guessFailed(sheet);
                return;
            }
            // The round in hand may have been finished by the replay (another
            // device played it first): nothing left to guess in it.
            if (currentResult().done) {
                guessing = false;
                if (sheet) sheet.el.classList.remove("is-busy");
                renderAll();
                return;
            }
        }
        const wasMode = state.mode;
        const reply = await Daily.move("guess", forDay, index, { guess: name, final }, { anon: wasMode === "anon", url: BOARDS_URL });
        guessing = false;
        if (sheet) sheet.el.classList.remove("is-busy");
        if (!state || state.day !== forDay || state.round !== index) return;

        const body = reply.body || {};
        /* Sent as signed out, and the server can see a session this page
           could not (a sign-in in another tab, a check that failed on load):
           the day's guesses so far are recorded and this one is made again,
           recorded. Once — `again` stops a loop. As choose() in
           js/oddoneout.js. */
        if (Daily.refusedAsSignedIn(reply)) {
            if (window.Account) { try { await Account.refresh(); } catch (e) { /* the server already said */ } }
            if (!state || state.day !== forDay || state.round !== index) return;
            if (!again) {
                guessing = true;
                if (sheet) sheet.el.classList.add("is-busy");
                const adopted = await adoptRecorded(sheet);
                guessing = false;
                if (sheet) sheet.el.classList.remove("is-busy");
                if (!state || state.day !== forDay || state.round !== index) return;
                if (adopted === true) {
                    if (currentResult().done) { renderAll(); return; }
                    return submitGuess(name, true);
                }
            }
            guessFailed(sheet);
            return;
        }
        /* Signed out, and this network has asked for more verdicts today
           than anybody playing could (claimAnonMove in
           netlify/functions/_speed.js). Signing in carries on recorded. */
        if (reply.status === 429 && body.reason === "anon-limit") {
            if (sheet) statusWithAction(sheet,
                "Too many signed-out guesses have come from your network today. Sign in to carry on — your guesses so far are kept.",
                "Sign in", () => { if (window.Account && Account.signIn) Account.signIn(); });
            return;
        }
        if (reply.status !== 200) {
            /* The day has closed under a round not yet begun — a window
               opened before midnight: today's deal is fetched and played
               instead (see refreshDay). Or the server's record disagrees
               with this page's (a reset elsewhere): read it again —
               refreshDay takes the server's record for a signed-in day, and
               clears one the server has nothing for (a reset). */
            if ((reply.status === 400 && !anyGuesses()) || reply.status === 409) {
                await refreshDay();
                renderAll();
                prepareRound(state.round);
                // A practice run put away (409 "practice-over"): back to the
                // splash, which says so, for the fresh day.
                if (practiceEnded) goTo("intro");
                return;
            }
            /* The day has closed under a round in progress. It used to fall
               to "try it again" below, which could never work: a guess made
               at 00:06 on a room begun at 23:58 asked to be retried for as
               long as the window was open. Now it says the day is over and
               offers today's rooms; the guesses made stay on this device. */
            if (reply.status === 400 && (/not open/i.test(String(body.error || "")) || !dayStillOpen(forDay))) {
                if (sheet) statusWithAction(sheet,
                    "This day's rooms closed at five past midnight (UTC), so that guess can't count. Your guesses so far are kept on this device.",
                    "Play today's rooms", async () => {
                        forgetDeal();
                        await start();
                        if (state) goTo("intro");
                    });
                return;
            }
            if (sheet) {
                sheet.refs.status.textContent = "That guess did not reach the server, so it has not counted. Try it again.";
                sheet.refs.status.hidden = false;
                announce(sheet, sheet.refs.status.textContent);
            }
            return;
        }
        /* Answered but NOT RECORDED while this day was meant to be: the
           server did not see the session. It used to switch the day to
           unrecorded silently, and a day recorded in part can be filed from
           neither part — so the whole day was lost to the board. Now the
           sign-in is asked again: back, and the guess is made again,
           recorded this time (once — see `again`); gone, and the guess is
           not taken, and the player is offered a way back in (signing in
           reloads the page, and the recorded rooms come back from the
           server) or to carry on unlisted knowing what that costs. */
        if (wasMode === "account" && !body.recorded) {
            let back = false;
            try { back = Boolean(await Account.refresh()); } catch (e) { back = false; }
            if (!state || state.day !== forDay || state.round !== index) return;
            if (back && !again) return submitGuess(name, true);
            if (!back && Account.unsure) {
                if (sheet) {
                    sheet.refs.status.textContent = "That guess did not reach the server, so it has not counted. Try it again.";
                    sheet.refs.status.hidden = false;
                    announce(sheet, sheet.refs.status.textContent);
                }
                return;
            }
            if (sheet) signInLapsed(sheet);
            return;
        }
        // The first guess of a day whose sign-in could not be checked: the
        // server's answer says which kind of day it is.
        if (!state.mode) state.mode = body.recorded ? "account" : "anon";

        /* The day's first verdict, given after the launch cut, on a day the
           deal marked practice (dealt at 07:59, played from 08:00): the day
           is the real one, and is carded, shared and banked as it — see
           choose in js/oddoneout.js (1 Oct 2026; Daily.afterPractice). */
        if (!anyGuesses() && state.practice && Daily.afterPractice && Daily.afterPractice(body)) {
            delete state.practice;
            practiceUntil = null;
        }

        if (Array.isArray(body.guesses)) {
            // The round as the server has it — which, if another tab got
            // there first, is not quite what was just pressed.
            result.guesses = body.guesses.map(g => ({ name: g.name, correct: Boolean(g.correct) }));
            result.done = Boolean(body.done);
            result.won = Boolean(body.won);
        } else {
            result.guesses.push({ name, correct: Boolean(body.correct) });
            result.won = Boolean(body.correct);
            result.done = result.won || result.guesses.length >= TRIES;
        }
        if (body.answer) result.answer = body.answer;
        /* The next room comes with the answer that ends this one, and only
           then (ONE ROUND AT A TIME in js/daily.js); its picture is fetched
           while this room's reveal is up, as it always was. */
        if (Daily.takeRound(picks(), body.next)) {
            keepDealt();
            prepareRound(index + 1);
        }

        practiceEnded = false;         // said once, on the fresh day's splash
        if (result.done && state.round === ROUNDS - 1) {
            state.done = true;
            bankDay();
            Daily.track("finish", "guess");
        }
        saveState();
        const pressedAt = optionsRound(state.round).findIndex(n => n === name);
        renderAll();
        settleFocus(state.round, result, name, pressedAt);
    }

    const anyGuesses = () => Boolean(state && state.results.some(r => r.guesses.length));

    function guessFailed(sheet) {
        if (!sheet) return;
        sheet.refs.status.textContent = "That guess did not reach the server, so it has not counted. Try it again.";
        sheet.refs.status.hidden = false;
        announce(sheet, sheet.refs.status.textContent);
    }

    /* A day begun signed out, recorded now the player is signed in: every
       guess already made is sent again, in order, as a recorded guess (see
       Daily.replay in js/daily.js for the why, and for why the day stays
       untimed and earns no bonus, as a day begun signed out always has).
       Each round comes back as the server has it — a room another device
       finished first included — and that is what is kept.

       Answers true when every guess is on file and the day is now an
       account day; "signed-out" when the server turned out not to see a
       session after all, and the day carries on unrecorded as it was;
       false when a guess could not be recorded just now, which trying again
       repeats harmlessly (a guess already on file answers `repeat` or
       `already`). As adoptRecorded in js/oddoneout.js. */
    async function adoptRecorded(sheet) {
        const forDay = state.day;
        const list = [];
        state.results.forEach((r, i) => r.guesses.forEach(g => list.push({ round: i, data: { guess: g.name } })));
        const status = sheet && sheet.refs.status;
        if (status && list.length) { status.textContent = "Signed in — recording your guesses so far first…"; status.hidden = false; }
        const { ok, replies } = await Daily.replay("guess", forDay, list, { url: BOARDS_URL });
        if (status) { status.hidden = true; status.textContent = ""; }
        if (!state || state.day !== forDay) return false;
        replies.forEach((r, k) => {
            const b = r.body || {};
            if (r.status === 200 && Daily.takeRound(picks(), b.next)) keepDealt();
            const result = state.results[list[k].round];
            if (r.status !== 200 || !b.recorded || !Array.isArray(b.guesses) || !result) return;
            result.guesses = b.guesses.map(g => ({ name: g.name, correct: Boolean(g.correct) }));
            result.done = Boolean(b.done);
            result.won = Boolean(b.won);
            if (b.answer) result.answer = b.answer;
        });
        const last = replies[replies.length - 1];
        if (!ok && last && last.status === 200 && last.body && last.body.recorded === false) {
            if (window.Account) { try { await Account.refresh(); } catch (e) { /* signed out either way */ } }
            return "signed-out";
        }
        if (!ok) { saveState(); return false; }
        state.mode = "account";
        saveState();
        return true;
    }

    /* A room's status line with buttons under the words, for the two
       refusals that need the player to choose something (see submitGuess).
       Elements rather than markup, so each handler is bound to exactly its
       button; the line is role="status", so the words are read out too.
       `actions` is a list of [label, run]. */
    function statusWithAction(sheet, text, ...rest) {
        const actions = [];
        for (let k = 0; k + 1 < rest.length; k += 2) actions.push([rest[k], rest[k + 1]]);
        const status = sheet.refs.status;
        status.textContent = text + " ";
        actions.forEach(([label, run]) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "guess-btn";
            btn.textContent = label;
            btn.addEventListener("click", () => { btn.disabled = true; run(); });
            status.appendChild(btn);
        });
        status.hidden = false;
    }

    function signInLapsed(sheet) {
        statusWithAction(sheet,
            "You've been signed out, so that guess wasn't recorded. Sign in again to carry on — the rooms already recorded are kept.",
            "Sign in again", () => { if (window.Account && Account.signIn) Account.signIn(); },
            "Carry on unlisted", () => {
                /* Unrecorded from here, so this day can't reach the board:
                   its first rooms are on file and the rest would not be,
                   and a day is filed whole or not at all. */
                state.mode = "anon";
                saveState();
                sheet.refs.status.textContent = "Carrying on without recording. Guess again.";
            });
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
        const maze = result.answer;
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

       Chosen by the server with the rest of the deal (dealGuess in
       netlify/functions/_deal.js, where the decoy rules now live) and
       handed over as five names, so they are the same five for everybody,
       survive a reload, and do not shift under a player who guesses once
       and comes back after lunch — and the page cannot tell which is right
       by looking. OPTIONS is how many there are. */
    function optionsRound(i) {
        const pick = picks()[i];
        return pick && Array.isArray(pick.options) ? pick.options.slice(0, OPTIONS) : [];
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

        /* The names come from the deal, not from rounds[] — they are known
           the moment the deal arrives, whereas rounds[] is not filled until
           each picture has been fetched and cropped; read from rounds[],
           they appeared a beat later, which made the board look like it was
           still deciding. The answer is the one the server named when it
           ended the round (result.answer), and there is none before that. */
        const pick = picks()[sheet.roundIndex];
        if (!pick) { box.innerHTML = ""; return; }

        /* Compared as the names themselves, not normalised (30 Sept 2026):
           a guess is always one of these five strings, and so is the
           answer, since the server deals both — and two names that
           normalise alike ("Maze-1", "Maze 1") both wore the tick. */
        const spent = new Set((result.guesses || []).map(g => g.name));
        const answer = result.answer ? result.answer.name : null;
        const over = result.done;

        box.innerHTML = optionsRound(sheet.roundIndex).map(name => {
            const isAnswer = name === answer;
            const wasTried = spent.has(name);
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
        if (next === "round") {
            startClock();
            // The room in hand, now it is on screen: asked for here if it
            // has not been handed out yet (see prepareRound).
            prepareRound(state.round);
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
        // Pressing a name hides the status line (wireRound); a room still
        // without its picture keeps saying so, and keeps its retry.
        if (unloadable[i] && !rounds[i] && !roundOver && refs.status.hidden) pictureUnavailable(i);

        /* The five names stay up after the round ends, wearing the answer —
           see renderOptions. There is no longer a separate list of guesses
           made: with the options themselves marked, a second list saying the
           same thing in a different order was the same information twice. */
        renderOptions(sheet);

        if (roundOver) {
            // Named by the server in the verdict that ended the round.
            const maze = result.answer;
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
                     the scoring: "+6, 10 on the first view" explains the
                     whole system in one line, once. -->
                <p class="guess-reveal-points ${result.won ? "is-won" : "is-lost"}">
                    ${result.won
                        ? `<strong>+${scored}</strong> ${result.guesses.length === 1
                            ? "— named on the first view"
                            : `for view ${result.guesses.length}${" · "}${POINTS[0]} on the first`}`
                        : `<strong>+0</strong> — no points for a room you don't place`}
                </p>
                ${maze ? `<a class="guess-reveal-link" href="${window.RecordAddress ? window.RecordAddress.of("maze", maze) : `/maze/${encodeURIComponent(maze.id)}`}">See it in the archive &rsaquo;</a>` : ""}
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

    /* The speed bonus, told on the splash with the rest of the rules. The
       rules are markup in home.html, and the scoring half of them lives
       here and on the server, so the sentence is written from the real
       numbers — POINTS above and Daily.SPEED_BONUS_MAX, which
       tools/check-daily-parity.js holds to netlify/functions/_speed.js —
       and added to the second rule, the one about guesses and views, as a
       sentence rather than a fourth rule: the splash is centred in a sheet
       of fixed height, and a whole extra rule is the thing most likely to
       push it past that on a short screen. Once, and not at all if the
       markup already carries it (data-bonus-rule), so writing it into
       home.html later needs no change here. */
    function addBonusRule() {
        const rules = el.deck && el.deck.querySelector('[data-kind="intro"] .guess-rules');
        if (!rules || rules.querySelector("[data-bonus-rule]") || !window.Daily || !Daily.bonusRule) return;
        const p = rules.querySelectorAll("li p")[1] || rules.querySelector("li:last-child p");
        if (!p) return;
        const extra = document.createElement("span");
        extra.setAttribute("data-bonus-rule", "");
        extra.textContent = " " + Daily.bonusRule(`${POINTS[0]} on the first view, ${POINTS[1]} on the second and ${POINTS[2]} on the third`, "naming the maze");
        p.appendChild(extra);
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
        /* Except once, straight after a practice run from before launch
           has been put away (30 Sept 2026; see PRACTICE in refreshDay). */
        if (practiceEnded && !played) {
            el.splashFoot.textContent = "The site's open, so your practice run is put away. These five count.";
            el.splashFoot.hidden = false;
        } else if (stats.days) {
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
        const bonus = bonusText();
        shownStats();
        /* The big number stays the base points, the unit the stats
           underneath count in; the line under it is the speed bonus and the
           total the boards show (see Daily.bonusLine in js/daily.js). */
        el.summary.innerHTML = `
            <p class="guess-points"><strong>${scored}</strong><span>points</span></p>
            <p class="daily-bonus" id="guess-bonus"${bonus ? "" : " hidden"}>${escapeHtml(bonus)}</p>
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

    /* The day as the server filed it — { day, points, bonus } — from
       submitDay's answer, or from the deal's `score` when the window opens
       on a day already filed. The only source of a speed bonus, since only
       the server keeps the time. In memory only: every open brings it back
       with the deal. As `served` in js/oddoneout.js. */
    let served = null;

    /* PRACTICE (30 Sept 2026), as in js/oddoneout.js: `practiceUntil` is
       the launch cut while the last deal said the day is still in practice
       time, else null; a day begun then carries `practice` (the cut) and is
       put away for a fresh one once the cut has passed (refreshDay).
       `practiceEnded` is that having just happened, for the splash. */
    let practiceUntil = null;
    let practiceEnded = false;

    function bonusText() {
        const s = served && state && served.day === state.day ? served : null;
        return Daily.bonusLine({ score: s, signedIn: signedIn(), mode: state ? state.mode : null,
            practice: (state && state.practice) || null, day: state ? state.day : null });
    }

    function drawBonus() {
        const line = document.getElementById("guess-bonus");
        if (!line) return;
        const text = bonusText();
        line.textContent = text;
        line.hidden = !text;
    }

    function renderAll() {
        if (!state) return;
        shownStats();
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

       It goes past every cache in the way (the `mine` parameter, which the
       server honours for the player whose day was just filed, so neither
       the browser nor the edge can answer it with a board from before the
       row existed).

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
        /* Through Daily.request, which gives up after ten seconds: a bare
           fetch the network swallowed left "Fetching the scores…" up for
           good, and — because a load in progress queues every later one —
           no refresh could ever get past it. A board that will not load is
           a disappointment, not a failure of the game; the day's own result
           is already on screen and stays there. */
        // `mine`, not a throwaway `fresh`, since 1 Oct 2026 — see boardUrl
        // in js/daily.js and BOARD_VARY in netlify/functions/daily-scores.js.
        const { status, body } = await Daily.request(force ? `${base}&mine=1` : base, {
            headers: { "Accept": "application/json" }
        });
        if (status === 200 && body) {
            boards = body;
            boardsState = "ready";
        } else {
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
       opened, with someone signed in, until it lands: `posted` is saved
       with the day once the server has it (or has refused it for good), as
       Odd One Out's wireResults does, so a failure on one visit is retried
       on the next. Repeats are harmless (the server answers "already", with
       the score it already has). Only while the server still takes the
       day: today, or yesterday inside the five-minute grace (dayIsOpen in
       netlify/functions/_daily.js). */
    let postedDay = "";   // the day on its way this visit, so it is not sent twice at once
    const DAY_GRACE_MS = 5 * 60 * 1000;

    function dayStillOpen(day) {
        const t = today();
        if (day === t) return true;
        const now = window.Daily && Daily.now ? Daily.now() : Date.now();
        return day === yesterdayOf(t) && now - Date.parse(t + "T00:00:00Z") < DAY_GRACE_MS;
    }

    /* The speed bonus's clock, started by the server the first time a
       signed-in player goes into a room of the day (see Daily.start and
       netlify/functions/_speed.js). Only before any guess has been made:
       a day part-played before signing in has no clock and no bonus,
       rather than a clock that timed only the rooms that were left. Nothing
       here or anywhere in the game shows a time; the bonus lands on the
       board. */
    function startClock() {
        if (!state || state.done || !dayStillOpen(state.day) || state.mode === "anon") return;
        if (state.results.some(r => r.guesses.length)) return;
        if (window.Daily && Daily.start) Daily.start("guess", state.day, BOARDS_URL);
    }

    /* The end of a room is no longer marked separately: the guess that
       ends it IS the mark, recorded by the server with the guess (see
       submitGuess and netlify/functions/_speed.js). */

    /* Fileable, not merely open: a finished day whose guesses were all
       recorded before the day closed is still taken by the server after
       it (LATE FILING in netlify/functions/guess-scores.js), for as long as
       Daily.fileable says. This used to stop at dayStillOpen, so a day
       whose POST fell over at 00:04 was never sent again from 00:05 on —
       five recorded rooms and no row. */
    function submitIfOwed() {
        if (!state || !state.done || state.posted || postedDay === state.day) return;
        if (!window.Account || !Account.current) return;
        if (!(Daily.fileable ? Daily.fileable(state.day) : dayStillOpen(state.day))) return;
        submitDay();
    }

    /* Posts the finished day. Silent by design: whether a score reached the
       board is not something to interrupt someone's result with, and the
       board itself is the confirmation. Signed out, this does nothing at
       all — there is no name to put on a row.

       For a day played signed in the server scores it from the guesses it
       recorded, and the rounds sent here are ignored. For a day played
       signed out they are all it has — each round's guesses in order, which
       it judges against the day it dealt (scoreClaim in
       netlify/functions/guess-scores.js). Never a count of tries or a
       claimed answer: the server works both out. */
    async function submitDay() {
        if (!window.Account || !Account.current || !state) return;
        const forDay = state.day;
        if (postedDay === forDay) return;
        postedDay = forDay;
        const rounds = state.results.map(r => ({ guesses: r.guesses.map(g => g.name) }));
        const { status, body } = await Daily.request(BOARDS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ day: forDay, rounds })
        });
        if (postedDay === forDay) postedDay = "";
        /* A failed POST used to be the end of it. Now the day stays owed —
           `posted` unset, and saved that way — so it is sent again when the
           results are next reached or the window next opened, on this visit
           or a later one. Only a refusal that settles the day is given up
           on — Daily.filed decides, the same rule Odd One Out's submission
           follows. It used to be anything not worth an immediate retry,
           which counted a lapsed session (401), a server record behind this
           page's (409 "unfinished") and a day still inside late filing as
           settled, and so lost each of them for good. Nothing below is
           worth doing for a day the server has not got. */
        const outcome = Daily.filed(status, body, forDay);
        const sent = outcome.ok;
        // The filed day's base and bonus — just now, or already on file —
        // for the line under the points.
        if (sent && body && Number.isFinite(body.points)) {
            served = { day: forDay, points: body.points, bonus: body.bonus || 0, practised: Boolean(body.practised) };
            if (state && state.day === forDay) drawBonus();
        }
        /* A practice run, answered and not filed: marked one if this page
           had not already (begun before the cut, finished after it), and
           the card says so (30 Sept 2026). */
        if (outcome.practice && body && state && state.day === forDay) {
            if (!state.practice) state.practice = typeof body.practice === "string" ? body.practice : true;
            served = null;
            drawBonus();
        }
        if (state && state.day === forDay && outcome.final) {
            state.posted = true;
            saveState();
        }
        /* The server has fewer rooms recorded than this page finished (see
           applyRecorded): read the day again, which brings the missing rooms
           back up to be played, for a day played signed in. A day carried
           on unlisted after its first rooms were recorded can never be
           filed, so it is settled instead of being sent again forever. */
        if (state && state.day === forDay && body && body.reason === "unfinished") {
            if (state.mode === "account") {
                if (await refreshDay()) {
                    renderAll();
                    prepareRound(state.round);
                    goTo(state.done ? "results" : "intro");
                }
            } else {
                state.posted = true;
                saveState();
            }
            return;
        }
        if (!sent) return;

        /* Re-read the account's totals now the day has been recorded, so
           the results panel shows the counted truth rather than this
           device's guess at it — they differ for anyone who has played
           elsewhere today, or signed in part-way through. Kept in memory
           only (accountStats), never saved over this device's own record. */
        const remote = await Account.fetchState();
        if (remote && remote.stats) {
            accountStats = { ...localStats, ...remote.stats };
            renderSummary();
        }
        loadBoards(true);
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

    /* The player's own row, by the public id the boards send now and `me`
       hands back as Account.current.publicId (29 Sept 2026; see
       netlify/functions/_publicid.js), then by the raw id for a board
       answer cached from before the deploy. Daily.isMine when js/daily.js
       is on the page, which it is beside every game; the copy is for when
       it is not, like the positional ranks below. `who` is Account.current,
       or null. */
    function isMine(row, who) {
        if (window.Daily && Daily.isMine) return Daily.isMine(row, who);
        if (!row || !row.id || !who) return false;
        return (Boolean(who.publicId) && row.id === who.publicId) || row.id === who.id;
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
            <li class="guess-board-row${isMine(row, mine) ? " is-me" : ""}">
                <span class="guess-board-rank" aria-hidden="true">${place[i]}</span>
                ${row.avatar
                    ? `<img class="guess-board-face" src="${escapeHtml(row.avatar)}" alt="" aria-hidden="true" loading="lazy">`
                    : `<span class="guess-board-face is-blank" aria-hidden="true"></span>`}
                <span class="guess-board-name">${escapeHtml(row.name || "Someone")}</span>
                ${miniGrid(row.grid)}
                ${scoreCell(row)}
            </li>`).join("");
    }

    /* The total, and on the day's board the time taken beside it — drawn
       by the same Daily.scoreCell as the column next to this one, so the
       two boards cannot write a time differently. The plain total is the
       fallback only for a page somehow without js/daily.js. */
    function scoreCell(row) {
        if (window.Daily && Daily.scoreCell) return Daily.scoreCell(row);
        return `<span class="guess-board-score">${escapeHtml(row.points)}</span>`;
    }

    /* Guess the Maze keeps its own board code and its own endpoint — it came
       first, is scored by netlify/functions/guess-scores.js against its own
       POINTS array, and its rows carry a grid the game beside it does not. */
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
       this in.

       This game's board only. The board of every game added together sat
       beside it and made the card two boards wide; it lives in the
       Leaderboards window now (js/leaderboards.js, "All dailies"). */
    let boardsHost = null;
    let boardPanel = null;
    function boardsElement() {
        if (boardsHost) return boardsHost;
        boardsHost = document.createElement("div");
        boardsHost.className = "guess-boards";
        boardsHost.id = "guess-boards";
        boardsHost.innerHTML = `<div class="guess-boards-own"></div>`;
        boardPanel = boardsHost.querySelector(".guess-boards-own");
        return boardsHost;
    }

    function boardColumns() {
        // Only once the results card has placed it; before that there is
        // nowhere on screen for a board to go.
        return boardsHost && boardsHost.isConnected ? boardPanel : null;
    }

    function renderBoards() {
        const host = boardColumns();
        if (!host) return;

        // The whole account, not its id — see isMine.
        const me = window.Account && Account.current ? Account.current : null;

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
           with.

           Signed in with no nickname, the same spot says which name the
           score went up under and offers to choose another (28 Sept 2026;
           Account.nickHintHtml in js/account.js draws it, answers its
           button, and takes it off the card once a nickname is set). Only
           for a day played signed in (mode "account"): a day carried on
           unlisted went up under no name at all. */
        const listed = !!(state && state.mode === "account");
        // Nothing for a practice run, which goes on no board (30 Sept 2026).
        const invite = state && state.practice ? "" : me ? (listed && window.Account && Account.nickHintHtml ? Account.nickHintHtml() : "") : `
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
                // The redraw took the pressed tab away, and the keyboard's
                // place with it; the same tab in the new markup gets it back
                // (30 Sept 2026, as Daily.boards).
                const again = host.querySelector(`.guess-board-range[data-range="${boardRange}"]`);
                if (again) again.focus({ preventScroll: true });
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
        /* A practice run of launch day counts to the CUT instead (1 Oct
           2026): the real rooms are today's, from 08:00, and "Five new
           rooms in 16h" under "nothing counts until 08:00" said the
           opposite. A practice run of an earlier day counts to its
           midnight as any day does. */
        const cut = typeof state.practice === "string" ? Date.parse(state.practice) : NaN;
        const launchDay = Number.isFinite(cut) && new Date(cut).toISOString().slice(0, 10) === state.day;
        const update = () => {
            // The server's now, not the device's: a wrong clock counted down
            // to a midnight that was not the day's.
            const at = window.Daily && Daily.now ? Daily.now() : Date.now();
            if (launchDay) {
                const left = cut - at;
                if (left <= 0) {
                    target.textContent = "Today's real rooms are open — close this and reopen it to play.";
                    // The bonus line above too (2 Oct 2026): it went on
                    // saying "nothing counts until … 08:00 UTC" after 08:00.
                    drawBonus();
                    clearInterval(countdownTimer);
                    return;
                }
                target.textContent = `Today's real rooms in ${Math.floor(left / 3600000)}h ${Math.floor((left % 3600000) / 60000)}m.`;
                return;
            }
            const ms = next - at;
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

    /* The pasted result, in the one format both games share (Daily.shareText
       in js/daily.js). The points are the total the boards rank by — the
       server's filed figure with its speed bonus once it has answered,
       labelled "incl. speed", and the base points until then
       (Daily.shareScore). */
    function shareText() {
        const s = served && served.day === state.day ? served : null;
        return Daily.shareText(Object.assign({
            game: "Guess the Maze",
            day: state.day,
            right: state.results.filter(r => r.won).length,
            of: ROUNDS,
            grid: state.results.map(squareFor).join(""),
            path: "guess",
            practice: Boolean(state.practice)
        }, Daily.shareScore(s, dayPoints())));
    }

    async function copyResult(btn) {
        const text = shareText();
        Daily.track("share", "guess");
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = "Copied";
        } catch (e) {
            // Refused: a selectable box to copy it from by hand (see
            // Daily.shareFallback).
            Daily.shareFallback(btn, text);
            btn.textContent = "Copy this";
        }
        setTimeout(() => { btn.textContent = "Copy result"; }, 2200);
    }

    // ---------- opening and closing ----------

    let started = false;

    /* Set when the archive could not be reached, so the splash's button
       means "try again" rather than "start". */
    let unavailable = false;

    /* The day to play, from the server, and the state of play to go with it.

       WHICH DAY is the server's to say: an earlier day part-way through (in
       memory or in storage) is asked for by name so it can be finished,
       which the server allows only inside the midnight grace; otherwise the
       server's today, whatever this device's clock says.

       THE STATE is this device's copy of that day if it has one, else a
       blank one, with the server's record of a signed-in player's guesses
       laid over it wherever that is further on (applyRecorded) — so a
       reload neither loses a guess nor offers a round already played. A day
       the server already has on file is marked posted.

       A new deal throws away the pictures prepared for the old one (dealGen,
       as in forgetDeal). Answers whether a deal was had. */
    let recorded = null;   // the server's record of this player's guesses, from the last deal
    async function refreshDay() {
        const saved = readSaved();
        const carry = [state, saved].find(s => s && s.v === STATE_VERSION && s.day !== today() &&
            !s.done && s.results.some(r => r.guesses.length)) || null;
        let reply = carry ? await Daily.deal("guess", carry.day, BOARDS_URL) : null;
        if (!reply) reply = await Daily.deal("guess", null, BOARDS_URL);
        if (!reply) return false;

        /* A finished day that never reached the board, about to be put away
           for a different one, is filed first. Only today's or a carried
           day is ever kept, so a day whose submission fell over just before
           00:05 was replaced here by today's and never sent again; the
           server still files it for a while if its guesses were recorded in
           time (LATE FILING in netlify/functions/guess-scores.js, and
           Daily.fileable). Its answer changes nothing here: that day is
           over on this device either way. */
        const owed = [state, saved].find(s => s && s.v === STATE_VERSION && s.day !== reply.day && s.done && !s.posted);
        if (owed && signedIn() && Daily.fileable && Daily.fileable(owed.day)) {
            await Daily.request(BOARDS_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ day: owed.day, rounds: owed.results.map(r => ({ guesses: r.guesses.map(g => g.name) })) })
            });
        }

        const previous = deal;
        if (!deal || deal.day !== reply.day) {
            dealGen += 1;
            rounds = [];
            preparing = {};
            unloadable = {};
        }
        deal = { day: reply.day, rounds: reply.rounds };
        /* The rooms already handed out for this day — in memory, and kept
           on this device — laid into the slots the reply left empty (ONE
           ROUND AT A TIME in js/daily.js; signed out, it leaves them all). */
        if (previous && previous.day === reply.day) Daily.mergeRounds(deal.rounds, previous.rounds);
        mergeKeptDealt();
        keepDealt();
        // A day already filed brings its own figures, bonus included, so a
        // results card reopened later says what the board says.
        if (reply.score && Number.isFinite(reply.score.points)) {
            served = { day: reply.day, points: reply.score.points, bonus: reply.score.bonus || 0, practised: Boolean(reply.score.practised) };
        } else if (Array.isArray(reply.progress)) {
            /* And a day the server says is NOT on file forgets the figures
               kept for it, as in js/oddoneout.js: after an administrator's
               reset a page that was not reloaded showed the old row's
               "50 + N speed bonus = …" on the replayed day until the new
               submission answered, and for good if it failed. Only when
               `progress` is an array — the server's word that it read this
               player's day (28 Sept 2026). */
            served = null;
        }
        const mine = [state, saved].filter(s => s && s.v === STATE_VERSION && s.day === reply.day)
            .sort((a, b) => progressOf(b) - progressOf(a))[0];
        state = mine || blankDay(reply.day);

        /* PRACTICE (30 Sept 2026; PRACTICE BEFORE LAUNCH in
           netlify/functions/_speed.js). While the server says the day is in
           practice time, the day is a practice run; once it says not, a day
           marked so is put away and today starts fresh, signed in or out —
           see the same step in js/oddoneout.js for why. The server's copy
           is set aside on its side (practiceOver, or a guess's 409), and
           the start this page remembers goes too (Daily.forgetStarts), so
           the real day's first room is timed. */
        practiceUntil = typeof reply.practiceUntil === "string" ? reply.practiceUntil : null;
        if (state.practice && !practiceUntil) {
            state = blankDay(reply.day);
            served = null;
            practiceEnded = true;
            boards = null;
            boardsState = "idle";
            Daily.forgetStarts("guess");
        }
        if (practiceUntil) state.practice = practiceUntil;
        recorded = Array.isArray(reply.progress) ? reply.progress : null;
        recordedFiled = Boolean(reply.filed);
        if (applyRecorded() === "reset") await Daily.claimReset("guess");
        if (reply.filed) state.posted = true;
        saveState();
        return true;
    }

    /* The server's record of the day, laid over this page's copy. It is
       what the day will be scored from, so where the two differ it is the
       one to show.

       `recorded` is an array only when the server knew who was asking —
       null signed out, or when the record could not be read — so an array,
       even an empty one, is the server's word on this player's day.

       A day played signed in (mode "account") takes the server's record
       WHEREVER IT DIFFERS, shorter included: every guess such a day keeps
       was recorded before it was kept (see submitGuess), so a server with
       fewer has lost some — an administrator's reset while the window was
       open, or a guess taken while the session had lapsed, before that was
       caught. Keeping the longer local copy is what used to loop: every
       guess after it was refused as out of order, the 409 read the day
       again, the day again kept the local copy, and so on. And an EMPTY
       record for such a day is a day given back (the reset clears
       daily_starts), so the day here is cleared too, and the caller claims
       the reset's ticket so the next open does not wipe the replay; this
       answers "reset" to say so. A day already filed is left alone — a
       reset deletes the filed row, so `filed` means none happened.

       Any other day takes the record only when it is at least as far on,
       as it always has (guesses made on another device). */
    let recordedFiled = false;
    function applyRecorded() {
        if (!state) return;
        const accountDay = state.mode === "account" && !recordedFiled && Array.isArray(recorded);
        if (accountDay && !recorded.length) {
            if (!anyGuesses()) return;
            state = blankDay(state.day);
            return "reset";
        }
        const rec = recorded || [];
        if (!rec.length) return;
        const total = rec.reduce((n, r) => n + r.guesses.length, 0) +
            (rec.length === ROUNDS && rec[ROUNDS - 1].done ? 1 : 0);
        if (!accountDay && total < progressOf(state)) return;
        state.results = Array.from({ length: ROUNDS }, (_, i) => (rec[i]
            ? {
                guesses: rec[i].guesses.map(g => ({ name: g.name, correct: Boolean(g.correct) })),
                done: Boolean(rec[i].done), won: Boolean(rec[i].won), answer: rec[i].answer || null
            }
            : { guesses: [], done: false, won: false, answer: null }));
        state.mode = "account";
        const next = state.results.findIndex(r => !r.done);
        state.done = next === -1;
        /* The room in hand: the first one not over, or the last — except
           that a room just finished, whose reveal is still showing, stays
           in hand until its "Room N ›" is pressed, as it would have. */
        const kept = state.round === next - 1 && state.results[state.round] && state.results[state.round].done;
        state.round = next === -1 ? ROUNDS - 1 : kept ? state.round : next;
    }

    async function start() {
        if (started) return;
        started = true;
        unavailable = false;

        localStats = loadStats();
        accountStats = null;
        // Whether somebody is signed in decides what a guess does, so it
        // is known before anything is dealt. A failure reads as signed out.
        if (window.Account) { try { await Account.ready(); } catch (e) { /* signed out */ } }
        /* A check on page load that could not be made at all (Account.unsure
           — a network blink, not an answer) is asked once more, since the
           window is usually opened well after the load. Settling on a failed
           check is how a signed-in player used to play a whole day
           unrecorded; submitGuess asks again at the first guess if it is
           still unsure. */
        if (window.Account && Account.unsure) { try { await Account.refresh(); } catch (e) { /* still unsure */ } }

        /* THE DAY IS THE SERVER'S. It used to be dealt here from the
           archive — and when the archive could not be reached, from the
           one-maze fallback in js/rooms-data.js, which dealt a day nobody
           else was playing. Now a deal that cannot be had is simply no
           game yet, and the splash's button becomes the retry. */
        if (!(await refreshDay())) {
            unavailable = true;
            started = false;
            el.play.disabled = false;
            el.play.textContent = "Try again";
            el.splashFoot.textContent = "The archive is not answering just now, so there is nothing to deal.";
            el.splashFoot.hidden = false;
            return;
        }
        if (!deal.rounds.length) {
            started = false;
            el.play.disabled = true;
            el.play.textContent = "Nothing to play yet";
            el.splashFoot.textContent = "There are no room pictures in the archive to make a puzzle from yet.";
            el.splashFoot.hidden = false;
            return;
        }
        el.play.disabled = false;

        /* Signed in, the account knows better than this browser: the day in
           progress may have been played further on another device, and the
           running totals are counted from the scores actually recorded. The
           account's mirror of the day is adopted if it is further on, and
           then the server's own record of the guesses (applyRecorded) is
           laid over both, because it is the one the day is scored from. The
           totals are kept in memory only — see localStats.

           Awaited, because both change what the deck is about to show. It
           is one request, and only for someone who is signed in. */
        if (window.Account && Account.current) {
            const remote = await Account.fetchState();
            if (remote) {
                adoptAccountDay(remote.guess);
                if (remote.stats) accountStats = { ...localStats, ...remote.stats };
                // "reset": the mirror held a day the server no longer has —
                // see applyRecorded — so the reset's ticket is spent here.
                if (applyRecorded() === "reset") await Daily.claimReset("guess");
                saveState();
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

    // Whatever had focus when the window opened, for close() to hand back
    // to — as js/oddoneout.js does. Only recorded on a real open.
    let opener = null;
    // Set once open() has waited for the first "who am I", so it only ever
    // waits the once.
    let waitedForAccount = false;

    function open() {
        /* Locked out of the games — a ban, or a nickname the admins asked
           to change (29 Sept 2026; Account.mayPlay in js/account.js). Every
           way in comes through here (the side menu, the Leaderboards'
           Play, a pasted /guess), so this is the one gate. It says why in
           a window of its own and nothing is dealt. js/daily-loader.js may
           already have opened this window empty while the file downloaded,
           so that is shut again. Signed out and unbanned, mayPlay is true
           and nothing changes.

           Before the first "who am I" has answered, mayPlay knows nobody and
           says yes, so a pasted /guess or a quick Play dealt a locked player
           a round they only heard was refused at their first pick. So it
           waits for that answer, then comes back through here. */
        if (!waitedForAccount && window.Account && typeof Account.mayPlay === "function" && !Account.known && typeof Account.ready === "function") {
            waitedForAccount = true;
            Promise.resolve().then(() => Account.ready()).catch(() => {}).then(() => open());
            return;
        }
        // A daily game: signed in with a nickname (4 Oct 2026, the owner's).
        if (window.Account && typeof Account.mayPlay === "function" && !Account.mayPlay({ daily: true })) {
            el.overlay.classList.remove("open");
            if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
            // A pasted /guess should not leave the address bar on a game
            // that never opened.
            if (location.pathname === "/guess") history.replaceState({}, "", "/home");
            return;
        }
        if (!el.overlay.classList.contains("open")) {
            const active = document.activeElement;
            opener = active && active !== document.body && !el.overlay.contains(active) ? active : null;
        }
        el.overlay.classList.add("open");
        document.body.classList.add("modal-open");
        // The tab names the game while it is open, as the Alt Codes and the
        // Guides do (PageMeta in js/site.js; 30 Sept 2026).
        if (window.PageMeta) window.PageMeta.set("guess", "Guess the Maze — Maze Rats", "https://mazerats.net/guess");
        view = "intro";
        el.window.focus();
        // Counted once per open (Daily.track; 30 Sept 2026).
        Daily.track("open", "guess");
        /* The loading bar while the day is dealt (4 Oct 2026, the owner's):
           the window used to stand empty, or on a splash whose Play did
           nothing, until the server answered. Down again below, whatever
           happened. */
        Daily.waiting(el.deck, true, "Dealing today's rooms");
        let reopened = false;
        claimAdminReset()
            .then(() => { if (dayHasTurned()) forgetDeal(); reopened = started; })
            .then(() => start())
            .then(async () => {
                /* REOPENED IN THE SAME VISIT (30 Sept 2026). start() runs
                   once per page load, so a window closed and opened again
                   showed the day as this page last had it, and never asked
                   the server — rooms played since on another device, a day
                   filed there, or an administrator's reset all waited for a
                   reload. Odd One Out reads the day again on every open;
                   this now does too, for a signed-in player on today's day
                   (the server keeps no record of anybody else), and for a
                   practice run, which the launch cut may have put away since
                   (see PRACTICE in refreshDay). refreshDay lays the server's
                   record over this page's copy (applyRecorded). */
                if (!reopened || !state) return;
                if (!((signedIn() && state.day === today()) || state.practice)) return;
                const wasDone = Boolean(state.done);
                if (await refreshDay()) {
                    /* Finished elsewhere since this page last looked (1 Oct
                       2026): the day is banked into this device's record,
                       and the account's figures are read again, as start()
                       reads them — the card's Streak, Days played and
                       All-time were behind until a reload. Odd One Out
                       does the same on its reopen. */
                    if (state && state.done && !wasDone) {
                        localStats = loadStats();
                        if (localStats.lastDay !== state.day && !state.practice) countDay();
                        if (window.Account && Account.current) {
                            const remote = await Account.fetchState();
                            if (remote && remote.stats) accountStats = { ...localStats, ...remote.stats };
                        }
                        shownStats();
                    }
                    renderAll();
                    prepareRound(state.round);
                }
            })
            // A throw above must not skip the splash: the window would open
            // on no view at all.
            .catch(() => {})
            .then(() => {
                Daily.waiting(el.deck, false);
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
        unloadable = {};
        deal = null;
        recorded = null;
        recordedFiled = false;
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
        // The server's record went with the reset (daily-games.js clears
        // daily_starts), so the copy of it held here goes too.
        recorded = null;
        state = blankDay(deal ? deal.day : today());
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
        if (window.PageMeta) window.PageMeta.restore("guess");
        clearInterval(countdownTimer);
        /* Back to whatever opened the window, as js/oddoneout.js does. This
           always went to the side menu's spine, which was right only when
           the side menu was the opener: from the Leaderboards window's
           "Play" or the console's Profile it dropped the keyboard somewhere
           the player had never been. The opener may be gone or hidden by now
           (the side menu closes itself before opening this, and a pasted
           /guess link has no opener at all), so the spine is still the
           fallback. */
        const back = opener;
        opener = null;
        const usable = node => !!(node && document.body.contains(node) && node.getClientRects().length
            && !(node.closest && node.closest("[inert]")));
        const landing = usable(back) ? back : document.getElementById("side-spine");
        if (landing) landing.focus({ preventScroll: true });
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
        addBonusRule();

        el.close.addEventListener("click", close);
        el.overlay.addEventListener("click", e => { if (e.target === el.overlay) close(); });

        el.play.addEventListener("click", async () => {
            // The archive was unreachable last time; this press is the retry.
            if (unavailable) {
                el.play.disabled = true;
                el.play.textContent = "Dealing…";
                start().then(() => { if (state) goTo("intro"); });
                return;
            }
            if (!state) return;
            if (state.done) return goTo("results");
            /* The day turned while the splash was up and nothing has been
               played: today's deal first. A window opened at 23:55 and
               started at 00:10 used to play yesterday's five, whose guesses
               were then refused (after the grace) or never recorded — a
               sitting that silently did not count. A day already under way
               is left to finish, as dayHasTurned says. */
            if (state.day !== today() && !anyGuesses()) {
                el.play.disabled = true;
                forgetDeal();
                await start();
                el.play.disabled = false;
                if (!state || unavailable) return;
            }
            prepareRound(state.round);
            goTo("round");
        });

        /* Another tab playing the same day. `storage` fires in every OTHER
           tab when one saves, so a tab left open on room 2 hears that the
           other has reached room 4 and moves with it, instead of offering
           rooms already played and later saving its older copy over the
           newer one (see saveState). Only the same day, and only forwards;
           never while this tab's own guess is out. */
        window.addEventListener("storage", e => {
            if (e.key !== STATE_KEY || !state || guessing) return;
            const other = readSaved();
            if (!other || other.day !== state.day || progressOf(other) <= progressOf(state)) return;
            if (other.practice && !state.practice) return;   // a practice run put away here
            const wasDone = state.done;
            state = other;
            // The rooms the other tab was handed, kept before it saved.
            if (deal && deal.day === state.day) mergeKeptDealt();
            if (state.done && !wasDone) bankDay();
            if (started) {
                renderAll();
                if (!state.done) prepareRound(state.round);
            }
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
        // A practice run the launch cut has passed is not today's play (as
        // OddOneOutStatus; 30 Sept 2026).
        const now = window.Daily && Daily.now ? Daily.now() : Date.now();
        const practiceOver = saved && typeof saved.practice === "string" && Date.parse(saved.practice) <= now;
        if (!saved || saved.day !== today() || !Array.isArray(saved.results) || practiceOver) {
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

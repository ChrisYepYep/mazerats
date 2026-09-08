/* Odd One Out — four rooms, three from one maze, and one that wandered in.

   Five of those a day. The three that belong are three different rooms from
   the same maze, so the answer is never "the one that looks different from
   the other three" in the obvious sense — every room looks different from
   every other room. What gives the imposter away is the thing underneath a
   maze: the palette its builder reached for, the floor they used
   everywhere, how densely they furnish, whether they build tall.

   That is a genuinely different question from the one Guess the Maze asks.
   There you are recognising a place you have been. Here you can win without
   knowing any of the four mazes by name, purely on style — which is why it
   works for somebody who has never walked one of them.

   ----------------------------------------------------------------------
   Choosing the imposter

   At random it is usually too easy: a bright Christmas maze dropped among
   three shots of a grey dungeon is spotted in a second, and the round
   teaches nobody anything.

   So the imposter is preferred from a maze that shares a tag with the one
   it is hiding in — same theme, same sort of build — and only falls back to
   any other maze when nothing shares a tag. The round is then decided by
   how the two builders differ inside the same idea, which is the whole
   point of the game. */
(function () {
    "use strict";

    const ROUNDS = 5;
    const PER_ROUND = 4;           // three from the maze, one from elsewhere
    const POINTS_EACH = 100;       // a perfect day is 500, as in both games next door
    const STATE_KEY = "mazerats_odd_v1";
    const STATS_KEY = "mazerats_odd_stats_v1";

    const day = () => window.Daily.today();

    let pool = [];                 // mazes with enough pictures to hide one in
    let state = null;
    let stats = null;
    let el = {};
    let showSplash = true;

    // ---------- the pool ----------

    /* Every maze with at least three gallery shots, because three is what a
       round needs from the home maze.

       Entrance and finish pictures are left out for the same reason Guess
       the Maze leaves them out: the entrance is the thumbnail the archive
       lists the maze under, and it is the picture most likely to carry the
       maze's name on a wall. A round that can be won by having scrolled the
       archive is not a round about style. */
    function buildPool(rooms) {
        return (rooms || [])
            .filter(room => room && room.id && room.name)
            .map(room => ({
                id: room.id,
                name: room.name,
                by: room.creator || "",
                tags: (room.tags || []).map(t => String(t).toLowerCase()),
                shots: (room.gallery || []).map(g => g && g.image).filter(Boolean)
            }))
            .filter(maze => maze.shots.length >= PER_ROUND - 1)
            // Sorted before the day's shuffle — see Daily.shuffle for why the
            // order going in decides what comes out.
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }

    const shares = (a, b) => a.tags.some(t => t && b.tags.includes(t));

    /* The day's five rounds.

       Each round takes a home maze, three of its pictures, and one picture
       from an imposter — preferring an imposter that shares a tag, and
       taking any other maze when none does. A maze is used as home once at
       most: five rounds of the same builder is one round asked five times.

       Everything is drawn from one seeded shuffle per round rather than
       Math.random, so every player gets the same five and a refresh does not
       reshuffle the day. */
    function pickDay() {
        const rounds = [];
        const usedHome = new Set();
        const homes = window.Daily.shuffle(pool, window.Daily.seedFrom("odd:" + day()));

        for (const home of homes) {
            if (rounds.length >= ROUNDS) break;
            if (usedHome.has(home.id)) continue;

            const seed = window.Daily.seedFrom("odd:" + day() + ":" + home.id);
            const others = pool.filter(m => m.id !== home.id && m.shots.length);
            const related = others.filter(m => shares(home, m));
            const from = related.length ? related : others;
            const imposter = window.Daily.shuffle(from, seed)[0];
            if (!imposter) continue;

            const mine = window.Daily.shuffle(home.shots, seed).slice(0, PER_ROUND - 1);
            if (mine.length < PER_ROUND - 1) continue;
            const theirs = window.Daily.shuffle(imposter.shots, seed)[0];

            const tiles = window.Daily.shuffle(
                mine.map(image => ({ image, maze: home, odd: false }))
                    .concat([{ image: theirs, maze: imposter, odd: true }]),
                window.Daily.seedFrom("odd:tiles:" + day() + ":" + home.id)
            );

            usedHome.add(home.id);
            rounds.push({ home, imposter, tiles });
        }
        return rounds;
    }

    let dealtCache = { day: "", rounds: [] };
    function dealt() {
        if (dealtCache.day !== day()) dealtCache = { day: day(), rounds: pickDay() };
        return dealtCache.rounds;
    }

    // ---------- the state of play ----------

    function blankDay() {
        return { day: day(), picks: [], done: false };
    }

    function loadState() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        state = saved && saved.day === day() && Array.isArray(saved.picks) ? saved : blankDay();
    }

    function saveState() {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }

    function loadStats() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(STATS_KEY) || "null"); } catch (e) { s = null; }
        /* Merged over the defaults rather than trusted whole: a stats object
           saved by an earlier shape of this game is still an object, so it
           passes any "is this a thing" test while missing half the fields —
           which is how "Best day undefined" ended up on the results card. */
        stats = Object.assign({ days: 0, streak: 0, bestDay: 0, points: 0, lastDay: "" },
            s && typeof s === "object" ? s : null);
    }

    function saveStats() {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* private mode */ }
    }

    // Days played, not days won — see the same decision in js/ratrospect.js.
    function bankDay() {
        if (stats.lastDay === day()) return;
        stats.streak = stats.lastDay === window.Daily.dayBefore(day()) ? stats.streak + 1 : 1;
        stats.days += 1;
        stats.bestDay = Math.max(stats.bestDay || 0, score());
        stats.points = (stats.points || 0) + score();
        stats.lastDay = day();
        saveStats();
    }

    const score = () => state.picks.filter(p => p.right).length * POINTS_EACH;
    const roundNow = () => state.picks.length;
    const finished = () => state.done || roundNow() >= dealt().length;

    function choose(tileIndex) {
        if (finished()) return;
        const round = dealt()[roundNow()];
        if (!round) return;
        const tile = round.tiles[tileIndex];
        if (!tile) return;

        state.picks.push({ tile: tileIndex, right: Boolean(tile.odd) });
        if (state.picks.length >= dealt().length) state.done = true;
        saveState();
        if (state.done) bankDay();
        render();
    }

    // ---------- drawing it ----------

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function render() {
        if (!el.body) return;
        const rounds = dealt();
        if (!rounds.length) {
            el.body.innerHTML = `<p class="daily-note">The archive is not answering just now — try again in a moment.</p>`;
            return;
        }
        if (finished()) { el.body.innerHTML = resultsHtml(); return wireResults(); }
        if (showSplash) { el.body.innerHTML = splashHtml(); return wireSplash(); }
        el.body.innerHTML = roundHtml(rounds[roundNow()]);
        wireRound();
    }

    /* The rules, on the way in. This game's premise cannot be worked out by
       looking at it: four pictures of four different rooms look exactly like
       four pictures of four different rooms, and nothing on screen says that
       three of them share a builder. Told once, in a sentence, it becomes a
       game; left unsaid, it is a shrug and a guess. */
    function splashHtml() {
        const started = state.picks.length > 0;
        return `
            <div class="daily-splash">
                <p class="daily-splash-eyebrow">Every day, five rounds</p>
                <h3 class="daily-splash-title">ODD ONE OUT</h3>
                <p class="daily-splash-blurb">Four rooms. Three of them are from the same maze,
                    and one has wandered in from somewhere else. Find the intruder.</p>
                <ol class="daily-rules">
                    <li><span class="daily-rules-n" aria-hidden="true">1</span>
                        <p>The three that belong are <strong>different rooms</strong>, so they will not look alike — go on the building instead.</p></li>
                    <li><span class="daily-rules-n" aria-hidden="true">2</span>
                        <p>The floor, the palette, how densely it is furnished: a maze is <strong>one builder's habits</strong>, room after room.</p></li>
                    <li><span class="daily-rules-n" aria-hidden="true">3</span>
                        <p>One pick a round, <strong>a hundred points</strong> for each one you spot. No lives — every round is played.</p></li>
                </ol>
                <button type="button" class="guess-btn guess-btn--lead" id="odd-start">
                    ${started ? "Back to the rooms" : "Show me the first four"} &rsaquo;
                </button>
                ${stats.streak > 1 ? `<p class="daily-note">${stats.streak} day streak.</p>` : ""}
            </div>`;
    }

    function roundHtml(round) {
        const tiles = round.tiles.map((tile, i) => `
            <button type="button" class="odd-tile" data-tile="${i}" aria-label="Picture ${i + 1}">
                <img src="${escapeHtml(tile.image)}" alt="" loading="lazy">
            </button>`).join("");

        return `
            <div class="daily-head">
                <p class="daily-step">Round <strong>${roundNow() + 1}</strong> of ${dealt().length}</p>
                <p class="daily-points">${score()}<span> pts</span></p>
            </div>
            <p class="daily-ask">Three of these are the same maze. Which one is not?</p>
            <div class="odd-grid">${tiles}</div>
            <p class="daily-note">Go on the building rather than the room: the floor, the palette,
                how densely it is furnished.</p>`;
    }

    function resultsHtml() {
        const rounds = dealt();
        const right = state.picks.filter(p => p.right).length;
        /* A wrong pick is always one of the home maze's own pictures — there
           is only one intruder in the four — so naming the maze you chose
           reads as nonsense: "was hiding in Alt Maze, you said Alt Maze".
           What actually happened is that you took one of the three that
           belonged, and that is what the row says. */
        const rows = state.picks.map((pick, i) => {
            const round = rounds[i];
            return `<li class="${pick.right ? "is-won" : "is-lost"}">
                    <span class="guess-answers-n" aria-hidden="true">${i + 1}</span>
                    <span class="daily-answers-name">${escapeHtml(round.imposter.name)}</span>
                    <span class="guess-answers-mark">in ${escapeHtml(round.home.name)}</span>
                    <span class="guess-answers-mark daily-answers-points">${pick.right ? "+" + POINTS_EACH : "—"}</span>
                </li>`;
        }).join("");

        return `
            <div class="guess-summary daily-summary">
                <p class="guess-score daily-verdict">${verdictFor(right)}</p>
                <p class="guess-points"><strong>${score()}</strong><span>points</span></p>
                <p class="guess-next-up">${right} of ${rounds.length} spotted</p>
                <p class="guess-grid" aria-label="Result grid">${shareGrid()}</p>
                <dl class="guess-stats">
                    <div><dt>Streak</dt><dd>${stats.streak}</dd></div>
                    <div><dt>Best day</dt><dd>${stats.bestDay}</dd></div>
                    <div><dt>Days played</dt><dd>${stats.days}</dd></div>
                    <div><dt>All-time</dt><dd>${stats.points}</dd></div>
                </dl>
                <div class="guess-summary-actions">
                    <button type="button" class="guess-btn" id="odd-share">Copy result</button>
                </div>
                <p class="daily-note" id="odd-foot">Four more rooms tomorrow.</p>

                <h4 class="guess-answers-head">Who was hiding where</h4>
                <ul class="guess-answers">${rows}</ul>
            </div>`;
    }

    /* Something a person might say, rather than a status line — see the
       same decision in js/ratrospect.js. */
    function verdictFor(right) {
        if (right === ROUNDS) return "All five. Nothing got past you.";
        if (right === ROUNDS - 1) return "One slipped through.";
        if (right === 0) return "Not a single one. Brutal.";
        return right + " of " + ROUNDS + " — those builders know what they are doing.";
    }

    const shareGrid = () => state.picks.map(p => (p.right ? "🟩" : "🟥")).join("");

    function shareText() {
        return `Odd One Out ${day()} — ${score()}/${dealt().length * POINTS_EACH}\n${shareGrid()}\n${location.origin}/odd`;
    }

    function wireSplash() {
        const start = document.getElementById("odd-start");
        if (start) start.addEventListener("click", () => { showSplash = false; render(); });
    }

    function wireRound() {
        el.body.querySelectorAll(".odd-tile").forEach(btn => {
            btn.addEventListener("click", () => choose(Number(btn.dataset.tile)));
        });
    }

    function wireResults() {
        const share = document.getElementById("odd-share");
        if (share) {
            share.addEventListener("click", async () => {
                const foot = document.getElementById("odd-foot");
                try {
                    await navigator.clipboard.writeText(shareText());
                    if (foot) foot.textContent = "Copied — paste it wherever you like.";
                } catch (e) {
                    if (foot) foot.textContent = "Could not copy it — your browser said no.";
                }
            });
        }
    }

    // ---------- the window ----------

    async function open() {
        if (!el.overlay) return;
        el.overlay.classList.add("open");
        document.body.classList.add("modal-open");
        el.window.focus();
        if (!pool.length) {
            el.body.innerHTML = `<p class="daily-note">Dealing…</p>`;
            let rooms = [];
            // Api is a top-level const in js/api.js — a global binding, but not
            // a property of window. Called bare, as the other games call it.
            try { rooms = await Api.getRooms(); } catch (e) { rooms = []; }
            pool = buildPool(rooms);
        }
        // See the same claim in js/ratrospect.js.
        if (await window.Daily.claimReset("odd")) {
            try { localStorage.removeItem(STATE_KEY); } catch (e) { /* private mode */ }
        }
        loadState();
        loadStats();
        showSplash = true;
        render();
    }

    function close() {
        if (!el.overlay) return;
        el.overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
    }

    function mount() {
        el = {
            overlay: document.getElementById("odd-overlay"),
            window: document.getElementById("odd-window"),
            close: document.getElementById("odd-close"),
            body: document.getElementById("odd-body")
        };
        if (!el.overlay || !el.body) return;

        el.close.addEventListener("click", close);
        el.overlay.addEventListener("click", e => { if (e.target === el.overlay) close(); });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && el.overlay.classList.contains("open")) close();
        });

        if (location.pathname === "/odd") open();
    }

    window.OddOneOutStatus = function () {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        if (!saved || saved.day !== window.Daily.today() || !Array.isArray(saved.picks)) {
            return { started: false, done: 0, total: ROUNDS, finished: false, points: 0 };
        }
        return {
            started: saved.picks.length > 0,
            done: saved.picks.length,
            total: ROUNDS,
            finished: Boolean(saved.done),
            points: saved.picks.filter(p => p && p.right).length * POINTS_EACH
        };
    };

    window.openOddOneOut = function () { open(); };

    document.addEventListener("DOMContentLoaded", mount);
})();

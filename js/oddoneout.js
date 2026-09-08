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
        stats = s && typeof s === "object" ? s : { played: 0, streak: 0, best: 0, bestScore: 0, lastDay: "" };
    }

    function saveStats() {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* private mode */ }
    }

    // Days played, not days won — see the same decision in js/ratrospect.js.
    function bankDay() {
        if (stats.lastDay === day()) return;
        stats.streak = stats.lastDay === window.Daily.dayBefore(day()) ? stats.streak + 1 : 1;
        stats.played += 1;
        stats.best = Math.max(stats.best || 0, stats.streak);
        stats.bestScore = Math.max(stats.bestScore || 0, score());
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
            el.body.innerHTML = `<p class="odd-empty">The archive is not answering just now — try again in a moment.</p>`;
            return;
        }
        el.body.innerHTML = finished() ? resultsHtml() : roundHtml(rounds[roundNow()]);
        wire();
    }

    function roundHtml(round) {
        const tiles = round.tiles.map((tile, i) => `
            <button type="button" class="odd-tile" data-tile="${i}" aria-label="Picture ${i + 1}">
                <img src="${escapeHtml(tile.image)}" alt="" loading="lazy">
            </button>`).join("");

        return `
            <div class="odd-head">
                <p class="odd-progress">Round <strong>${roundNow() + 1}</strong> of ${dealt().length}</p>
                <p class="odd-score">${score()} pts</p>
            </div>
            <p class="odd-ask">Three of these are the same maze. Which one is not?</p>
            <div class="odd-grid">${tiles}</div>
            <p class="odd-hint">Go on the building rather than the room: the floor, the palette,
                how densely it is furnished.</p>`;
    }

    function resultsHtml() {
        const rounds = dealt();
        const right = state.picks.filter(p => p.right).length;
        /* A wrong pick is always one of the home maze's own pictures — there
           is only one imposter in the four — so naming the maze you chose
           reads as nonsense: "was hiding in Alt Maze, you said Alt Maze".
           What actually happened is that you took one of the three that
           belonged, and that is what it says. */
        const rows = state.picks.map((pick, i) => {
            const round = rounds[i];
            return `<li class="odd-result${pick.right ? " is-right" : " is-wrong"}">
                    <span class="odd-result-mark" aria-hidden="true">${pick.right ? "✓" : "✗"}</span>
                    <span class="odd-result-text">
                        <strong>${escapeHtml(round.imposter.name)}</strong> was hiding in
                        ${escapeHtml(round.home.name)}${pick.right ? "" : " — you took one of the three that belonged"}
                    </span>
                </li>`;
        }).join("");

        return `
            <div class="odd-done">
                <p class="odd-done-eyebrow">That is the day</p>
                <p class="odd-done-score">${score()}<span> / ${rounds.length * POINTS_EACH}</span></p>
                <p class="odd-done-line">${right} of ${state.picks.length} spotted${
                    stats.streak > 1 ? ` · ${stats.streak} day streak` : ""}</p>
                <p class="odd-grid-share" aria-hidden="true">${shareGrid()}</p>
                <ul class="odd-results">${rows}</ul>
                <div class="odd-done-actions">
                    <button type="button" class="guess-btn" id="odd-share">Copy result</button>
                </div>
                <p class="odd-foot" id="odd-foot">Four more rooms tomorrow.</p>
            </div>`;
    }

    const shareGrid = () => state.picks.map(p => (p.right ? "🟩" : "🟥")).join("");

    function shareText() {
        return `Odd One Out ${day()} — ${score()}/${dealt().length * POINTS_EACH}\n${shareGrid()}\n${location.origin}/odd`;
    }

    function wire() {
        el.body.querySelectorAll(".odd-tile").forEach(btn => {
            btn.addEventListener("click", () => choose(Number(btn.dataset.tile)));
        });
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
            el.body.innerHTML = `<p class="odd-empty">Dealing…</p>`;
            let rooms = [];
            // Api is a top-level const in js/api.js — a global binding, but not
            // a property of window. Called bare, as the other games call it.
            try { rooms = await Api.getRooms(); } catch (e) { rooms = []; }
            pool = buildPool(rooms);
        }
        loadState();
        loadStats();
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

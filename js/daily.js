/* What a "day" is, and how a day picks the same things for everybody.

   Two games now deal a set from the archive once a day, and both need the
   same three answers: when the day turns over, how a date becomes a seed,
   and what a seeded shuffle does with it. Written once here because the
   moment there are two copies there are two day boundaries, and the first
   anyone hears about that is somebody in Discord saying their five rooms
   are not your five rooms.

   None of this is security. A determined reader can work out today's answers
   from the page — that is true of every daily game that ships its own data —
   and the point is reproducibility, not secrecy. */
window.Daily = (function () {
    "use strict";

    /* The date in UTC, so the day turns over at the same instant for
       everybody rather than at each player's local midnight. Two people
       comparing grids in a channel are then always talking about the same
       puzzle, whichever side of the world they are on. */
    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    // mulberry32 — small, fast, and good enough that consecutive days do not
    // visibly rhyme.
    function seededRandom(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // FNV-1a. Any string in, one stable number out.
    function seedFrom(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /* A shuffle that depends only on the seed and the order it was handed.

       That second half is the part that bites: the shuffle draws one number
       per entry in sequence, so which items come out depends on what order
       they went in. A list left in the order the database returned it is not
       a stable order — rewriting a document can move it — and an admin
       saving an edit at noon would quietly deal a different set for the rest
       of the day. Every caller sorts its pool by something of its own first,
       and this leaves that order alone. */
    function shuffle(list, seed) {
        const rand = seededRandom(seed);
        return list
            .map(item => ({ item, k: rand() }))
            .sort((a, b) => a.k - b.k)
            .map(o => o.item);
    }

    // Yesterday's key, for deciding whether a streak survived.
    function dayBefore(iso) {
        const d = new Date(iso + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    /* Has an administrator given this player their day back?

       A game's day lives in this browser, which no server can reach into, so
       a reset is left here as a ticket for the game to collect: the page
       asks on the way in, clears its own stored day if there is one waiting,
       and tells the server the ticket is spent. Whichever device they open
       it on next is where it lands.

       Never throws and never blocks the game. A player who is not signed in
       has no ticket by definition, and an endpoint that is having a bad
       afternoon must not be the reason somebody cannot play — so anything
       going wrong here is read as "no reset waiting", which is true far more
       often than not. */
    async function claimReset(game) {
        try {
            const res = await fetch("/.netlify/functions/daily-games?mine=1", { credentials: "same-origin" });
            if (!res.ok) return false;
            const body = await res.json();
            if (!body || !Array.isArray(body.games) || !body.games.includes(game)) return false;
            // Spend it BEFORE clearing, so a failure here cannot leave a
            // ticket that wipes the player's day again on every open.
            await fetch("/.netlify/functions/daily-games?mine=1", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ game })
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    /* ---------- the leaderboards ----------

       Ratrospect and Odd One Out share a board endpoint and, from here
       down, share the drawing of it too: same spans, same rows, same look
       as Guess the Maze, which is where the classes come from. Three daily
       games with three subtly different boards would be three things to
       keep in step for no gain to anybody reading them.

       What each game passes in is what it DID — which gap a card went into,
       which tile was picked. Never a score: the server derives the day and
       works the points out for itself. See netlify/functions/daily-scores.js. */
    const SCORES_URL = "/.netlify/functions/daily-scores";

    const escapeHtml = str => String(str == null ? "" : str)
        .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    /* Posts a finished day. Silent by design — whether a score reached a
       board is not something to interrupt somebody's result with, and the
       board underneath is the confirmation. Signed out it still posts and
       is told, politely, that there is no name to put on a row. */
    async function submit(game, day, moves) {
        try {
            const res = await fetch(SCORES_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ game, day, moves })
            });
            return res.ok ? await res.json() : null;
        } catch (e) {
            // The local record is already kept; there is nothing to say.
            return null;
        }
    }

    const RANGES = [
        { key: "day", label: "Today", empty: "Nobody has finished today yet." },
        { key: "week", label: "This week", empty: "No scores this week yet." },
        { key: "month", label: "This month", empty: "No scores this month yet." },
        { key: "allTime", label: "All time", empty: "No scores recorded yet." }
    ];

    function niceDate(iso) {
        const d = new Date(iso + "T00:00:00Z");
        return d.toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" });
    }

    /* Someone else's day, as five squares. Safe beside a name because it
       says how each round went and nothing about what was in it. */
    function miniGrid(grid) {
        if (!Array.isArray(grid) || !grid.length) return "";
        const cells = grid.map(n => `<span class="guess-board-cell ${n ? "is-won g1" : "is-lost"}"></span>`).join("");
        const solved = grid.filter(Boolean).length;
        return `<span class="guess-board-grid" role="img" aria-label="${solved} of ${grid.length} right">${cells}</span>`;
    }

    function rows(list, mine, empty) {
        if (!list || !list.length) return `<li class="guess-board-empty">${escapeHtml(empty)}</li>`;
        return list.map((row, i) => `
            <li class="guess-board-row${mine && row.id === mine ? " is-me" : ""}">
                <span class="guess-board-rank" aria-hidden="true">${i + 1}</span>
                ${row.avatar
                    ? `<img class="guess-board-face" src="${escapeHtml(row.avatar)}" alt="" aria-hidden="true" loading="lazy">`
                    : `<span class="guess-board-face is-blank" aria-hidden="true"></span>`}
                <span class="guess-board-name">${escapeHtml(row.name || "Someone")}</span>
                ${miniGrid(row.grid)}
                <span class="guess-board-score">${row.points}</span>
            </li>`).join("");
    }

    /* Draws the board into a host element and keeps it there: one fetch
       brings all four spans, so the tabs are a redraw rather than a round
       trip. Never throws — a board that will not load is a disappointment,
       not a failure of the game, and the day's own result is already on
       screen either way. */
    function boards(host, game, opts) {
        if (!host) return;
        const o = opts || {};
        let data = null;
        let range = "day";

        const me = () => (window.Account && Account.current ? Account.current.id : null);

        function draw() {
            if (!data) {
                host.innerHTML = `<p class="guess-board-note">Fetching the scores…</p>`;
                return;
            }
            if (data === "failed") {
                host.innerHTML = `<p class="guess-board-note">The scoreboard could not be reached just now.</p>`;
                return;
            }
            const invite = me() ? "" : `
                <p class="guess-board-note guess-board-invite">
                    Your ${o.points || 0} points are saved on this device.
                    <button type="button" class="guess-btn" data-daily-signin>Sign in with Discord to be listed</button>
                </p>`;
            const spec = RANGES.find(r => r.key === range) || RANGES[0];
            const span = range === "week" && data.weekFrom ? `Since ${niceDate(data.weekFrom)}`
                : range === "month" && data.monthFrom ? `Since ${niceDate(data.monthFrom)}`
                    : range === "day" ? "Your day against everyone else's"
                        : "Every day the game has run";
            const tabs = RANGES.map(r => `
                <button type="button" class="guess-board-range${r.key === range ? " is-on" : ""}"
                        data-range="${r.key}" aria-pressed="${r.key === range}">${escapeHtml(r.label)}</button>`).join("");

            host.innerHTML = `
                ${invite}
                <div class="guess-board">
                    <div class="guess-board-ranges" role="group" aria-label="Which span the board covers">${tabs}</div>
                    <p class="guess-board-span">${escapeHtml(span)}</p>
                    <ol class="guess-board-list">${rows(data[range], me(), spec.empty)}</ol>
                </div>`;

            host.querySelectorAll(".guess-board-range").forEach(btn => {
                btn.addEventListener("click", () => { range = btn.dataset.range; draw(); });
            });
            const signin = host.querySelector("[data-daily-signin]");
            if (signin && window.Account && Account.signIn) {
                signin.addEventListener("click", () => Account.signIn());
            }
        }

        draw();
        fetch(`${SCORES_URL}?game=${encodeURIComponent(game)}&day=${encodeURIComponent(today())}`, {
            headers: { Accept: "application/json" },
            credentials: "same-origin"
        })
            .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then(body => { data = body; draw(); })
            .catch(() => { data = "failed"; draw(); });
    }

    return { today, seededRandom, seedFrom, shuffle, dayBefore, claimReset, submit, boards };
})();

/* What a "day" is for the daily games, and the requests they share.

   THE DAY IS NO LONGER DEALT HERE. It used to be: this file carried the
   seed arithmetic and the shuffle, both games dealt their day in the
   browser from the edge-cached /rooms list, and the server re-dealt it at
   submission to check what came back. That made the answers readable from
   the page, made tomorrow's rooms visible to anybody who set their device's
   clock forward, and scored correct picks as wrong whenever the archive was
   edited mid-day. The day is now dealt once on the server, stored, and
   handed to the page without its answers (netlify/functions/_deal.js);
   each pick is sent as it is made and the server says whether it was right.

   What is left here is the calendar, corrected to the server's clock, and
   the requests both games make: the deal, each move, the finished day, and
   the boards. */
window.Daily = (function () {
    "use strict";

    /* How far this device's clock is from the server's, in ms, as last
       measured. Every deal reply carries the server's `now`, and the
       difference is kept (and remembered, so the menu is right before a game
       has been opened this visit). A device whose clock is wrong by a day no
       longer thinks it is a different day from everybody else — which,
       while the day was read off the device alone, broke the game for an
       honest player with a wrong clock and showed tomorrow's rooms to a
       dishonest one. The server decides which day is open either way; this
       only makes the page agree with it. */
    const OFFSET_KEY = "mazerats_clock_offset";
    let clockOffset = 0;
    try { clockOffset = Number(localStorage.getItem(OFFSET_KEY)) || 0; } catch (e) { clockOffset = 0; }

    function setServerNow(ms) {
        if (!Number.isFinite(ms)) return;
        clockOffset = ms - Date.now();
        // Under a minute is network latency, not a wrong clock; not worth a
        // write, and storing it would only move today() by jitter.
        if (Math.abs(clockOffset) < 60000) clockOffset = 0;
        try { localStorage.setItem(OFFSET_KEY, String(clockOffset)); } catch (e) { /* private mode */ }
    }

    // The server's idea of now, as near as this page can tell.
    function now() {
        return Date.now() + clockOffset;
    }

    /* The date in UTC, so the day turns over at the same instant for
       everybody rather than at each player's local midnight. Two people
       comparing grids in a channel are then always talking about the same
       puzzle, whichever side of the world they are on. */
    function today() {
        return new Date(now()).toISOString().slice(0, 10);
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

    /* The seed arithmetic, the shuffle, the featured-day salt and the
       archive filters (existedBefore, isHallway) that used to follow here
       are gone from the browser: they existed so the page could deal the
       day, and the page no longer does. Their one copy is on the server —
       netlify/functions/_daily.js and _deal.js — where the featured-day
       salt (js/featured-days.js) is still applied, now under a secret. What
       stays is seededRandom above, which Guess the Maze uses to choose
       where to crop a picture from the seed the deal hands it. */

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
    // Each request gets the same 10s cap api.js's _getWithFallback gives its
    // first attempt. Without one a stalled request never settled, so the
    // game waiting on this sat on "Dealing…" (or never started) for good;
    // an abort throws into the catch below and reads as "no reset waiting".
    // The timer is cleared only after the body is read, since res.json()
    // can stall just as well as the headers.
    const CLAIM_TIMEOUT_MS = 10000;
    async function fetchWithTimeout(url, init, readBody) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CLAIM_TIMEOUT_MS);
        try {
            const res = await fetch(url, Object.assign({}, init, { signal: controller.signal }));
            const body = readBody && res.ok ? await res.json() : null;
            return { res, body };
        } finally {
            clearTimeout(timeout);
        }
    }

    async function claimReset(game) {
        try {
            const { res, body } = await fetchWithTimeout("/.netlify/functions/daily-games?mine=1", { credentials: "same-origin" }, true);
            if (!res.ok) return false;
            if (!body || !Array.isArray(body.games) || !body.games.includes(game)) return false;
            // Spend it BEFORE clearing, so a failure here cannot leave a
            // ticket that wipes the player's day again on every open.
            const { res: spent } = await fetchWithTimeout("/.netlify/functions/daily-games?mine=1", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ game })
            }, false);
            // fetch only throws on a network failure; a 4xx/5xx came back
            // as "spent" all the same, so the day was cleared while the
            // ticket stayed, to clear it again on the next open.
            return spent.ok;
        } catch (e) {
            return false;
        }
    }

    /* ---------- the leaderboards ----------

       Odd One Out reads from the shared board endpoint — which served
       Ratrospect too, until that game was dropped — and, from here down,
       shares the drawing of it: same spans, same rows, same look as Guess
       the Maze, which is where the classes come from. Daily games with
       subtly different boards would be several things to keep in step for
       no gain to anybody reading them.

       What each game passes in is what it DID — which tile was picked,
       which name was guessed. Never a score: the server judges each move
       against the day it dealt and works the points out for itself. See
       netlify/functions/daily-scores.js. */
    const SCORES_URL = "/.netlify/functions/daily-scores";

    const escapeHtml = str => String(str == null ? "" : str)
        .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    /* Every request the games make, with the same 10s cap as the reset
       claim above. The submit, the boards and the moves all used to be a
       bare fetch, so a request the network swallowed never settled: the
       board said "Fetching the scores…" for good, and Guess the Maze's
       submitIfOwed never ran again because the POST it was waiting on never
       finished. An abort is a failure like any other now.

       Answers { status, body }: status 0 for no answer at all (offline,
       timed out), and the body parsed whenever there is one, errors
       included, because a refusal's reason is worth reading. Never throws. */
    const REQUEST_TIMEOUT_MS = CLAIM_TIMEOUT_MS;
    async function request(url, init) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(url, Object.assign({ credentials: "same-origin" }, init, { signal: controller.signal }));
            let body = null;
            try { body = await res.json(); } catch (e) { body = null; }
            return { status: res.status, body };
        } catch (e) {
            return { status: 0, body: null };
        } finally {
            clearTimeout(timeout);
        }
    }

    const post = (url, data) => request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    /* The day's deal, from the server: the pictures to play (and for Guess
       the Maze the names offered), never the answers. `day` is only passed
       to carry on with a day begun before midnight; without it the server
       says which day it is. The reply's `now` corrects this page's clock
       (setServerNow). `url` is Guess the Maze's own endpoint.

       Answers the reply's body, or null when the server could not be
       reached or would not deal — the games then say so and offer a retry,
       as they did when the archive could not be read. */
    async function deal(game, day, url) {
        const qs = url ? `?deal=1` : `?game=${encodeURIComponent(game)}&deal=1`;
        const { status, body } = await request((url || SCORES_URL) + qs + (day ? `&day=${encodeURIComponent(day)}` : ""), {
            headers: { Accept: "application/json" }
        });
        if (body && Number.isFinite(body.now)) setServerNow(body.now);
        return status === 200 && body && Array.isArray(body.rounds) ? body : null;
    }

    /* One move — a tile picked, a name guessed — sent the moment it is made,
       and the server's verdict back. `data` is the game's own part of it
       ({ tile } or { guess }), `anon` a day begun signed out (see the note
       at the POST in daily-scores.js).

       A signed-in player's move waits for the day's start to have landed,
       or the server would find no clock and time nothing. A move the server
       calls too fast (MIN_MOVE_MS in netlify/functions/_speed.js) is sent
       again once the time it names has passed — a genuinely quick player
       loses nothing but that fraction of a second. A request that fell over
       is tried once more straight away.

       Answers { status, body } like request: 200 with the verdict, or
       whatever the last attempt got. */
    async function move(game, day, round, data, opts) {
        const o = opts || {};
        const key = game + ":" + day;
        if (!o.anon && startsInFlight.has(key)) await startsInFlight.get(key);
        const payload = Object.assign({ game, day, action: "move", round }, data, o.anon ? { anon: true } : {});
        let reply = { status: 0, body: null };
        for (let attempt = 0; attempt < 4; attempt++) {
            reply = await post(o.url || SCORES_URL, payload);
            if (reply.status === 429 && reply.body && reply.body.retryInMs > 0) {
                await new Promise(resolve => setTimeout(resolve, Math.min(reply.body.retryInMs, 3000) + 50));
                continue;
            }
            if (reply.status === 0 && attempt === 0) continue;
            break;
        }
        return reply;
    }

    /* Posts a finished day. Silent by design — whether a score reached a
       board is not something to interrupt somebody's result with, and the
       board underneath is the confirmation. Signed out it still posts and
       is told, politely, that there is no name to put on a row.

       `moves` is only read by the server for a day played signed out (it
       scores a signed-in day from the moves it recorded). Answers
       { ok, body, retry }: `ok` when the day is on file (just now, or
       already), `retry` when it is worth sending again later — no answer,
       or a server that could not answer — as opposed to a refusal that
       will only be refused again. */
    async function submit(game, day, moves) {
        const { status, body } = await post(SCORES_URL, { game, day, moves });
        const ok = status === 200 && body && (body.recorded || body.reason === "already");
        return { ok: Boolean(ok), body, retry: !ok && (status === 0 || status >= 500 || status === 429) };
    }

    /* Starts the clock for the day's speed bonus. The server keeps the time
       — the page never sends one and never shows one — so all this does is
       say "a signed-in player has just gone into today's first round", and
       the server writes down when it heard. Only the first call for a day
       ever counts there (see netlify/functions/_speed.js), so a reload or a
       second device changes nothing.

       Each game calls it on the way into its first round and only while no
       round has been played: a day already under way before sign-in has no
       clock on file and so no bonus, and starting one half-way through
       would time only the rounds left.

       Signed out it sends nothing; there is nobody to time. Once per game
       and day per visit, unless the request fell over, in which case the
       next call tries again. `url` is for Guess the Maze, which keeps its
       own endpoint; every other game starts through this one. Silent and
       never throws, like submit.

       Kept while in flight, so a move made before the start has landed
       waits for it (see move) — the round marks that used to follow it are
       gone: a round's end is now the move that finished it, recorded with
       the pick. */
    const startSent = new Set();
    const startsInFlight = new Map();
    function start(game, day, url) {
        const key = game + ":" + day;
        if (startSent.has(key) || !window.Account) return Promise.resolve();
        startSent.add(key);
        const job = (async () => {
            try { await Account.ready(); } catch (e) { startSent.delete(key); return; }
            if (!Account.current) { startSent.delete(key); return; }
            const { status } = await post(url || SCORES_URL, { game, day, action: "start" });
            // A refusal (a closed day, say) will be refused again; only a
            // server that could not answer is worth another go.
            if (status === 0 || status >= 500) startSent.delete(key);
        })().catch(() => { startSent.delete(key); });
        startsInFlight.set(key, job);
        job.then(() => { if (startsInFlight.get(key) === job) startsInFlight.delete(key); });
        return job;
    }

    /* A time taken, as a board writes it: "1:42", or "1:02:05" past the
       hour. Only ever drawn on a single day's board, small, beside the
       total it helped earn. Published so Guess the Maze writes it the
       same way. */
    function clock(ms) {
        if (!Number.isFinite(ms) || ms < 0) return "";
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = String(s % 60).padStart(2, "0");
        return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
    }

    /* The score cell: the total, and on a single day's board the time
       beside it in smaller type. Only a day's rows carry `ms` (see
       daily-scores.js), so a week or a month shows the total alone. */
    function scoreCell(row) {
        const t = clock(row.ms);
        return `<span class="guess-board-score">${escapeHtml(row.points)}${t
            ? ` <span class="guess-board-time" title="Time taken">${t}</span>` : ""}</span>`;
    }

    const RANGES = [
        { key: "day", label: "Today", empty: "Nobody has finished today yet." },
        { key: "week", label: "This week", empty: "No scores this week yet." },
        { key: "month", label: "This month", empty: "No scores this month yet." },
        { key: "allTime", label: "All time", empty: "No scores recorded yet." }
    ];

    // "en-GB" so a date on a leaderboard row is written the same way as the
    // date under the game's own title — see longDate in js/oddoneout.js.
    function niceDate(iso) {
        const d = new Date(iso + "T00:00:00Z");
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
    }

    /* Someone else's day, as five squares. Safe beside a name because it
       says how each round went and nothing about what was in it. */
    function miniGrid(grid) {
        if (!Array.isArray(grid) || !grid.length) return "";
        const cells = grid.map(n => `<span class="guess-board-cell ${n ? "is-won g1" : "is-lost"}"></span>`).join("");
        const solved = grid.filter(Boolean).length;
        return `<span class="guess-board-grid" role="img" aria-label="${solved} of ${grid.length} right">${cells}</span>`;
    }

    /* How many of the day's games a row's points came from.

       Only ever drawn on the combined board, where it is the thing that
       stops the ranking being misread: without it, a player on 60 and a
       player on 180 look like one is three times better, when in fact one
       played a single game well and the other played both.

       Out of DAILY_GAME_COUNT, not a written-in 3: it said "/3" long after
       a third game was dropped and only two daily games were left (Guess
       the Maze and Odd One Out, the two the combined board adds up). This
       file keeps no list of the games to count, so the number is here,
       beside the one place it is drawn; js/leaderboards.js draws the same
       pill with its own "/2". */
    const DAILY_GAME_COUNT = 2;
    function gamesPill(n) {
        if (!n) return "";
        return `<span class="guess-board-games" title="${n} of ${DAILY_GAME_COUNT} games played">${n}<span aria-hidden="true">/${DAILY_GAME_COUNT}</span></span>`;
    }

    /* The number beside each row, with ties sharing one: 1, 1, 3.

       Numbered by position, two players on the same points were first and
       second, and which was which came down to the order the database
       handed them back in — a ranking nobody earned. Standard competition
       ranking instead: level players share a place, and the next place
       along skips by however many shared the last. The list is already
       sorted, so a row only has to look at the one above it.

       LEVEL MEANS LEVEL ON WHAT THE BOARD RANKS BY. The daily boards put
       rounds right first and points second (see board() in
       netlify/functions/guess-scores.js), so two rows only tie when both
       their `solved` and their points match — a 4-right day on more points
       sits below a 5-right day, and must not share its place. A board
       whose rows carry no `solved` (Fallin' Furni's) ties on points alone,
       as it always did.

       Published so Guess the Maze numbers its own board the same way. */
    function ranks(list) {
        const out = [];
        const level = (a, b) => a.points === b.points && (a.solved == null ? null : a.solved) === (b.solved == null ? null : b.solved);
        (list || []).forEach((row, i) => {
            out.push(i > 0 && level(row, list[i - 1]) ? out[i - 1] : i + 1);
        });
        return out;
    }

    function rows(list, mine, empty) {
        if (!list || !list.length) return `<li class="guess-board-empty">${escapeHtml(empty)}</li>`;
        const place = ranks(list);
        return list.map((row, i) => `
            <li class="guess-board-row${mine && row.id === mine ? " is-me" : ""}">
                <span class="guess-board-rank" aria-hidden="true">${place[i]}</span>
                ${row.avatar
                    ? `<img class="guess-board-face" src="${escapeHtml(row.avatar)}" alt="" aria-hidden="true" loading="lazy">`
                    : `<span class="guess-board-face is-blank" aria-hidden="true"></span>`}
                <span class="guess-board-name">${escapeHtml(row.name || "Someone")}</span>
                ${row.games ? gamesPill(row.games) : miniGrid(row.grid)}
                ${scoreCell(row)}
            </li>`).join("");
    }

    /* Past the fifteen-second edge cache, for the one fetch that needs it.

       The boards sit behind BOARD_CDN_CACHE, which is right for everybody
       idly opening the results — and wrong for the player who has just
       submitted, because the copy the edge is holding was made before their
       row existed, so the board they are shown is the one board on the site
       guaranteed not to have them on it. A throwaway query parameter is a
       different cache key, which is all it takes; the endpoint ignores it.
       Only ever passed straight after a submit, so it costs one uncached
       read per player per day. */
    function boardUrl(base, fresh) {
        return fresh ? `${base}&fresh=${Date.now()}` : base;
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

        /* This game's board only. The board of every game added together
           sat beside it and made the card two boards wide; it lives in the
           Leaderboards window now (js/leaderboards.js, "All dailies"). */
        host.innerHTML = `<div class="guess-boards-own"></div>`;
        const panel = host.querySelector(".guess-boards-own");
        /* The day the board is FOR is the day that was played, which the
           game passes in — not today(), which a round finished a minute past
           midnight has already moved on from. */
        const forDay = o.day || today();

        const me = () => (window.Account && Account.current ? Account.current.id : null);

        function draw() {
            if (!data) {
                panel.innerHTML = `<p class="guess-board-note">Fetching the scores…</p>`;
                return;
            }
            if (data === "failed") {
                panel.innerHTML = `<p class="guess-board-note">The scoreboard could not be reached just now.</p>`;
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

            panel.innerHTML = `
                ${invite}
                <div class="guess-board">
                    <div class="guess-board-ranges" role="group" aria-label="Which span the board covers">${tabs}</div>
                    <p class="guess-board-span">${escapeHtml(span)}</p>
                    <ol class="guess-board-list">${rows(data[range], me(), spec.empty)}</ol>
                </div>`;

            panel.querySelectorAll(".guess-board-range").forEach(btn => {
                btn.addEventListener("click", () => { range = btn.dataset.range; draw(); });
            });
            const signin = panel.querySelector("[data-daily-signin]");
            if (signin && window.Account && Account.signIn) {
                signin.addEventListener("click", () => Account.signIn());
            }
        }

        draw();
        // Through request(), so a stalled read ends in "could not be
        // reached" after ten seconds rather than "Fetching…" for good.
        request(boardUrl(`${SCORES_URL}?game=${encodeURIComponent(game)}&day=${encodeURIComponent(forDay)}`, o.fresh), {
            headers: { Accept: "application/json" }
        }).then(({ status, body }) => {
            data = status === 200 && body ? body : "failed";
            draw();
        });
    }

    /* isHallway lived here too, for the games to keep hallways out of the
       day they dealt. The server deals now, and its copy (isHallway in
       netlify/functions/_daily.js) is the one that decides; js/home.js keeps
       the archive's own reading of the tag, as it always did. */

    return {
        today, now, setServerNow, seededRandom, dayBefore, request,
        claimReset, deal, move, submit, start, clock, scoreCell, boards, ranks
    };
})();

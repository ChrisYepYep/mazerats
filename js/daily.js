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

    /* ---------- A DAY WORTH ARRIVING ON ----------

       Every day's puzzle is derived from its own date, which is exactly
       right 364 days a year: nobody chooses it, everybody gets the same
       one, and there is nothing to maintain. It is wrong for precisely one
       day — the day the site opens, when more people will play their first
       ever round than on any other day, and the round they get is whatever
       the 3rd of October happens to hash to.

       So a date here can be given a SALT, which is stirred into every seed
       the three games derive for that day. It does not choose the mazes;
       it rerolls them. Change the salt, deploy, look at what the games
       deal, and keep the one you like.

       WHY A SALT AND NOT A HAND-PICKED LIST. A list means a new data shape,
       an admin screen to edit it, validation for maze ids that might have
       been renamed since, and three games each needing to be taught to
       accept an override — a fair amount of machinery, all of it capable
       of dealing a broken day if any part of it is wrong. A salt cannot
       produce an invalid round, because it produces exactly the same kind
       of round the other 364 days produce. It is one line, it is reviewed
       like code, and the worst it can do is deal a day somebody did not
       prefer.

       CHANGE IT BEFORE THE DAY, NOT DURING IT. The salt is part of the
       seed, so changing it mid-day re-deals the puzzle under anyone already
       playing and orphans the scores already submitted. It is committed
       code and only moves on a deploy, which makes that hard to do by
       accident — but it is the one rule.

       An empty table is the normal state. Once launch day has passed this
       can go back to being empty, or keep an entry for the next occasion.

       THE TABLE ITSELF LIVES IN js/featured-days.js, which the server
       reads too — it used to be written out here and again in
       netlify/functions/_daily.js, and two copies of it is precisely the
       thing that deals one puzzle in the browser and checks a different
       one on the server. One file, both sides. See that file's header.

       The `|| {}` is not a fallback so much as a floor: a page that loaded
       daily.js without featured-days.js would apply no salt and desync
       from the server, so the pairing is asserted at build time by
       tools/check-daily-parity.js rather than papered over here. This
       keeps the failure to "no featured days" instead of a TypeError. */
    const FEATURED_DAYS = (typeof globalThis !== "undefined" && globalThis.FEATURED_DAYS) || {};

    function saltFor(iso) {
        const salt = FEATURED_DAYS[iso];
        return salt ? ":" + salt : "";
    }

    /* The seed a game should use for a given day, salt included.

       Every seed the three games derive goes through here rather than
       calling seedFrom with a hand-built string, so a featured day reaches
       all of them and none can be forgotten. `parts` is whatever else that
       particular seed is made of — a round index, a maze id — and the day
       and the salt are added here. */
    function daySeed(...parts) {
        return daySeedFor(today(), ...parts);
    }

    /* The same seed for a NAMED day rather than whatever today is.

       What a game should actually deal from. daySeed reads the clock every
       time it is called, which is fine for a round started and finished
       inside one day and wrong for the one that crosses midnight: Odd One
       Out was re-dealt under the player between one pick and the next, so
       rounds one to three came from yesterday, four and five from today, and
       the mixed result was filed under today — where the unique index then
       refused the player's real go at today. A game pins the day it started
       on and passes it here for every draw.

       Built exactly as daySeed builds it, and as daySeed(day, ...parts)
       does on the server (netlify/functions/_daily.js), which already took
       the day as its first argument; tools/check-daily-parity.js compares
       this one's numbers against the server's too. */
    function daySeedFor(day, ...parts) {
        return seedFrom(parts.join(":") + ":" + day + saltFor(day));
    }

    /* Whether a maze was in the archive before a given day began — the
       browser's half of existedBefore in netlify/functions/_daily.js, which
       has the full reasoning. In short: a maze catalogued mid-day joins the
       rotation at the next midnight rather than re-dealing the day under
       everybody already playing it. createdAt is stamped by the server on
       insert and never rewritten; a record older than the stamp has none
       and counts as always having been there. */
    function existedBefore(record, day) {
        const stamp = record && typeof record.createdAt === "string" ? record.createdAt.slice(0, 10) : "";
        return !stamp || stamp < day;
    }

    // Whether today is one of the featured days, for anything that wants to
    // say so out loud.
    function isFeaturedDay() {
        return Boolean(FEATURED_DAYS[today()]);
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
        // The last pick's mark first, or that round earns no bonus. See mark.
        await settled(game, day);
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
       never throws, like submit. */
    const startSent = new Set();
    async function start(game, day, url) {
        const key = game + ":" + day;
        if (startSent.has(key) || !window.Account) return;
        try { await Account.ready(); } catch (e) { return; }
        if (!Account.current) return;
        startSent.add(key);
        try {
            const res = await fetch(url || SCORES_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ game, day, action: "start" })
            });
            // A refusal (a closed day, say) will be refused again; only a
            // server that could not answer is worth another go.
            if (res.status >= 500) startSent.delete(key);
        } catch (e) {
            startSent.delete(key);
        }
    }

    /* Marks the end of one round, for the speed bonus. As with start, the
       server writes down when it heard, and only the first mark for a round
       ever counts (see netlify/functions/_speed.js) — so this is called
       once, at the moment a round is over in live play, and never when a
       finished day is only being shown again.

       Once per round per visit. A request that fell over (no connection,
       or a server that could not answer) is tried once more straight away:
       later would stamp a later time, and a round timed late is only ever
       worth less. A refusal is not retried. Silent and never throws.

       The last round's mark and the day's submission leave together, and
       the server needs the mark first or that round earns nothing — so
       each mark in flight is kept, and settled() below lets a submission
       wait for them. */
    const markSent = new Set();
    const marksInFlight = new Map();
    function mark(game, day, round, url) {
        const key = game + ":" + day + ":" + round;
        if (markSent.has(key) || !window.Account) return Promise.resolve();
        markSent.add(key);
        const send = () => fetch(url || SCORES_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ game, day, action: "mark", round })
        }).then(res => res.status < 500, () => false);
        const job = (async () => {
            try { await Account.ready(); } catch (e) { return; }
            if (!Account.current) return;
            if (!(await send())) await send();
        })().catch(() => {});
        const dayKey = game + ":" + day;
        if (!marksInFlight.has(dayKey)) marksInFlight.set(dayKey, new Set());
        marksInFlight.get(dayKey).add(job);
        job.then(() => marksInFlight.get(dayKey).delete(job));
        return job;
    }

    /* Waits for a day's marks still on their way, but never for long: a
       mark that is stuck costs that round its bonus, and a submission that
       never leaves would cost the whole day. */
    const MARK_WAIT_MS = 4000;
    function settled(game, day) {
        const jobs = [...(marksInFlight.get(game + ":" + day) || [])];
        if (!jobs.length) return Promise.resolve();
        return Promise.race([
            Promise.all(jobs),
            new Promise(resolve => setTimeout(resolve, MARK_WAIT_MS))
        ]);
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
        fetch(boardUrl(`${SCORES_URL}?game=${encodeURIComponent(game)}&day=${encodeURIComponent(forDay)}`, o.fresh), {
            headers: { Accept: "application/json" },
            credentials: "same-origin"
        })
            .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then(body => { data = body; draw(); })
            .catch(() => { data = "failed"; draw(); });
    }

    /* A hallway is not a maze, and none of the games may deal one.

       The archive has always known this — js/home.js leaves hallways out of
       the maze count, the walked tally and the featured rows — but it knew
       it only for itself, and the games build their pools straight from the
       rooms the API returns. So "Origins Maze Rats Hallway" was a round of
       Guess the Maze with nothing in it to guess, and one of the five names
       offered against rooms that really were mazes.

       Here rather than in each game because all three need it, and matched
       against the server's own copy in netlify/functions/_daily.js: the
       browser deals the day and the server re-derives it to score what comes
       back, so a room excluded on one side and not the other is the two
       sides playing different games. Same reason daySeed is written twice.

       The archive keeps its own copy in js/home.js and that is deliberate —
       home.js does not load daily.js's answer for anything else, and the
       archive's counts must not start depending on the games' module. Two
       readings of one tag, which is a tag neither of them defines. */
    const HALLWAY_TAG = "hallway";

    function isHallway(record) {
        return (record && Array.isArray(record.tags) ? record.tags : [])
            .some(t => String(t).trim().toLowerCase() === HALLWAY_TAG);
    }

    return {
        today, seededRandom, seedFrom, daySeed, daySeedFor, isFeaturedDay, shuffle, dayBefore,
        claimReset, submit, start, mark, settled, clock, scoreCell, boards, ranks, isHallway, existedBefore
    };
})();

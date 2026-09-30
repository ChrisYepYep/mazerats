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
            /* Only a ticket for TODAY clears anything (30 Sept 2026). A
               reset gives back the day it was made on, and a ticket claimed
               days later used to wipe whatever day this page was in the
               middle of, which nobody had reset. A ticket for another day
               is spent and nothing else happens. The server says each
               ticket's day (`tickets`; a server from before says only
               `games`, which are today's). */
            const tickets = body && Array.isArray(body.tickets) ? body.tickets
                : (body && Array.isArray(body.games) ? body.games.map(g => ({ game: g, day: today() })) : []);
            const ticket = tickets.find(t => t && t.game === game);
            if (!ticket) return false;
            const current = ticket.day === today();
            // Spend it BEFORE clearing, so a failure here cannot leave a
            // ticket that wipes the player's day again on every open.
            const { res: spent } = await fetchWithTimeout("/.netlify/functions/daily-games?mine=1", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ game })
            }, false);
            if (!current) return false;
            // fetch only throws on a network failure; a 4xx/5xx came back
            // as "spent" all the same, so the day was cleared while the
            // ticket stayed, to clear it again on the next open.
            if (!spent.ok) return false;
            /* The reset deleted the day's clock on the server (forgetDay in
               netlify/functions/_speed.js), so this page's memory of having
               started it is now wrong. start() remembers a start per game
               and day for the whole visit, and a page that was not reloaded
               used to replay the reset day without sending one: the server
               found no clock at round 0, wrote the replay as noClock, and
               the day the reset was meant to give back earned no speed
               bonus at all. So every start this page remembers for the game
               is forgotten here, whatever the day (28 Sept 2026). */
            forgetStarts(game);
            return true;
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
            /* A 403 saying the player is banned, or must choose a new
               nickname before playing (29 Sept 2026): the window that says
               so is js/account.js's (Account.writeRefused), shown here once
               for every request the games make, so neither game has to
               know. The games still see the refusal and treat it as they
               treat any other a pick or guess could not survive. */
            if (res.status === 403 && body && (body.banned || body.nickRequired)
                && window.Account && typeof Account.writeRefused === "function") {
                try { Account.writeRefused(403, body, "play"); } catch (e) { /* the refusal stands either way */ }
            }
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
       at the POST in daily-scores.js). The server refuses `anon` from a
       request that carries a session — 400, reason "signed-in" — and the
       game answers that by recording the day instead (see replay below).
       `untimed` sends a signed-in move WITHOUT starting the day's clock
       first, for replay only.

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
        /* A signed-in round 0 move whose start this page never saw land
           sends the start again first, and waits for it. The start used to
           be tried once, as the first pictures came up, and a request that
           fell over there made the WHOLE day untimed: the server, finding
           no start when the first move arrived, wrote the day as noClock
           (rowForMove in netlify/functions/_speed.js) and no round of it
           could earn a bonus. Only round 0, because only round 0 can still
           be timed — a start that lands after it has been played would
           find the untimed row already there and change nothing. start()
           itself does nothing signed out, or when the server has already
           refused it (a closed day), so this cannot loop. */
        if (!o.anon && !o.untimed && round === 0 && !startConfirmed.has(key)) await start(game, day, o.url);
        // `replay` marks a move sent again by replay() below, which the
        // server reads as "this day is not to be timed" (28 Sept 2026).
        const payload = Object.assign({ game, day, action: "move", round }, data,
            o.anon ? { anon: true } : {}, o.replay ? { replay: true } : {});
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

    /* Whether a move's answer is the server refusing `anon` because the
       request carried a session (see move). */
    const refusedAsSignedIn = reply => Boolean(reply && reply.status === 400 && reply.body && reply.body.reason === "signed-in");

    /* A day begun signed out, RECORDED after the player has signed in part
       of the way through it.

       The server used to answer a signed-in player's `anon` moves without
       recording them, so a day begun signed out simply carried on
       unrecorded and was filed from the page's own moves at the end
       (scoreClaim). It refuses those now — they were a free answer check
       for anyone signed in — and a day half recorded and half not can be
       filed from neither half. So the moves already made are sent again,
       in order, as recorded moves, and the day carries on recorded from
       there.

       UNTIMED. No start is sent first, so the server writes the day as
       noClock (rowForMove in netlify/functions/_speed.js) and it earns no
       speed bonus — exactly what a day begun signed out always earned.
       Starting a clock here would time a replay, and a replay of moves
       already made takes a second a round, which would be most of the
       bonus for nothing.

       And untimed even when another device has already started the day's
       clock. That case used to time the replay against the other device's
       start, which sounded honest and was not: the rounds after the first
       landed a second or so apart as the replay ran through them, and each
       earned nearly the whole round's bonus for moves made long before. So
       every replayed move now carries `replay: true`, and the server, on
       recording one, marks the day's row noClock for good — the day earns
       no bonus whichever device started a clock (rowForMove in
       netlify/functions/_speed.js; 28 Sept 2026).

       SAFE TO REPEAT. A round the server already has answers `already`
       (Odd One Out) or `already`/`repeat` (Guess the Maze) with the
       server's own record, so a replay cut off half-way can simply be run
       again, and a round another device played first comes back as the
       server has it. Each round's first move waits MIN_MOVE_MS after the
       round before, as any recorded move does; move() waits it out.

       `list` is [{ round, data }] in the order made. Answers
       { ok, replies }: ok only if every move came back recorded. */
    async function replay(game, day, list, opts) {
        const o = opts || {};
        const replies = [];
        for (const item of list || []) {
            const reply = await move(game, day, item.round, item.data, { url: o.url, untimed: true, replay: true });
            replies.push(reply);
            if (reply.status !== 200 || !reply.body || !reply.body.recorded) return { ok: false, replies };
        }
        return { ok: true, replies };
    }

    /* ---------- the speed bonus, as the games show it ----------

       The most a round's bonus can be: 36, a point for every second under
       37 a right answer took, and no round can be answered in under a
       second (ROUND_BONUS_SECONDS and MIN_MOVE_MS in
       netlify/functions/_speed.js, where HOW BIG IT IS has the arithmetic).
       Written here once, for both games' rules, and compared with the
       server's figure by tools/check-daily-parity.js. */
    const SPEED_BONUS_MAX = 36;

    /* The line under a finished day's points, saying what the speed bonus
       made of it. Pure — every case is decided from what is passed in, so
       the parity check can run it — and the same for both games.

       `score` is the day as the SERVER filed it ({ points, bonus }): the
       finishing submission's answer, or the deal's `score` on a reload. It
       is the only source of a bonus, because only the server keeps the
       time. The card's big number stays the base points — the unit the
       card's own streak and best-day figures count in (statsFor in
       netlify/functions/player-data.js) — and this line carries the bonus
       and the total beside it, the total being the number the boards and
       the Profile rank and show. So every number on the card is labelled
       with what it counts, and the total matches the board underneath.

         filed, with a bonus      "50 + 161 speed bonus = 211 on the boards"
         filed, no bonus, begun signed out
                                  "No speed bonus: this day began signed out."
         filed, no bonus          "No speed bonus this time."
         signed in, not filed yet nothing, until the submission answers
         signed out               "Sign in before you play to earn a speed
                                   bonus as well." — a signed-out day earns
                                   none, so it never shows one. */
    function bonusLine(opts) {
        const o = opts || {};
        const s = o.score;
        if (s && Number.isFinite(Number(s.points))) {
            const points = Number(s.points) || 0;
            const bonus = Number(s.bonus) || 0;
            if (bonus > 0) return `${points} + ${bonus} speed bonus = ${points + bonus} on the boards`;
            return o.mode === "anon" ? "No speed bonus: this day began signed out." : "No speed bonus this time.";
        }
        if (!o.signedIn) return "Sign in before you play to earn a speed bonus as well.";
        return "";
    }

    /* The rule both splashes add, in the site's plain words, from the real
       numbers. `each` is what a right answer scores ("10", or Guess the
       Maze's "10 on the first view"). */
    function bonusRule(each, verb) {
        return `Right answers score ${each}, plus a speed bonus of up to ${SPEED_BONUS_MAX} for ${verb} quickly when you're signed in.`;
    }

    /* ---------- the result as it is pasted ----------

       One share text for both games (30 Sept 2026). The two used to be
       written separately and had drifted: Guess the Maze said how many
       rooms were found and its points, Odd One Out gave its points over
       fifty and no name for the site — so two results pasted one under the
       other from the same menu read like two different sites' output. Now
       both are built here, in the same four lines:

         Maze Rats · Odd One Out
         30 Sept 2026 — 4/5 · 187 pts
         🟩🟩🟥🟩🟩
         https://mazerats.net/odd

       `right`/`of` is what the game counts a day in (rooms found, imposters
       spotted); `points` is the total the boards rank by, speed bonus
       included, which only the server knows — so a game passes
       dayTotal(served, base), which falls back to the base points when no
       filed figure has come back (signed out, or not answered yet), rather
       than a figure the page does not have. The address is the site's own,
       not location.origin, so a result copied on a preview or from
       localhost still points somewhere a friend can open. Pure, so the
       parity check and node can run it. */
    const SHARE_SITE = "https://mazerats.net";

    function shareDate(day) {
        return new Date(day + "T00:00:00Z")
            .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    }

    function dayTotal(served, base) {
        if (served && Number.isFinite(Number(served.points))) {
            return (Number(served.points) || 0) + (Number(served.bonus) || 0);
        }
        return base;
    }

    function shareText(o) {
        return `Maze Rats · ${o.game}\n` +
            `${shareDate(o.day)} — ${o.right}/${o.of} · ${o.points} pts\n` +
            `${o.grid}\n` +
            `${SHARE_SITE}/${o.path}`;
    }

    /* When the clipboard says no — it needs a secure context and
       permission, and has neither guaranteed — the text goes in a
       selectable box after the button, to be copied by hand. A box beats a
       button that silently does nothing. The same box every time: each
       failed press used to insert a new one, so a player pressing again
       (as anybody would when nothing seemed to happen) grew a column of
       identical boxes. Styled by .guess-share-fallback in css/style.css. */
    function shareFallback(btn, text) {
        const holder = btn.parentElement || btn;
        let box = holder.querySelector(".guess-share-fallback");
        if (!box) {
            box = document.createElement("textarea");
            box.className = "guess-share-fallback";
            box.readOnly = true;
            box.setAttribute("aria-label", "Your result, to copy");
            btn.insertAdjacentElement("afterend", box);
        }
        box.value = text;
        box.select();
        return box;
    }

    /* Posts a finished day. Silent by design — whether a score reached a
       board is not something to interrupt somebody's result with, and the
       board underneath is the confirmation. Signed out it still posts and
       is told, politely, that there is no name to put on a row.

       `moves` is only read by the server for a day played signed out (it
       scores a signed-in day from the moves it recorded). Answers
       { ok, body, retry, final } — see filed() below for what each means,
       and for why `final`, not "not retry", is what marks a day posted. */
    async function submit(game, day, moves) {
        const { status, body } = await post(SCORES_URL, { game, day, moves });
        return Object.assign({ body }, filed(status, body, day));
    }

    /* How long after a day a finished day of it may still be filed: the
       server takes a finished day late when every move was recorded before
       the day closed (LATE FILING in netlify/functions/daily-scores.js),
       for as long as it still has the moves — two days, the life of a row
       in daily_starts (_speed.js). Past that, nothing can file it. */
    const LATE_FILE_DAYS = 2;
    function fileable(day) {
        if (typeof day !== "string") return false;
        let earliest = today();
        for (let i = 0; i < LATE_FILE_DAYS; i++) earliest = dayBefore(earliest);
        return day >= earliest && day <= today();
    }

    /* What a finishing submission's answer means for the day, for both
       games (Guess the Maze posts to its own endpoint and asks this too):

         ok      the day is on file — just now, or already
         retry   worth sending again soon: no answer, or a server that
                 could not give one
         final   the day is settled, filed or not, and should be marked
                 posted so it is never sent again

       FINAL IS NARROWER THAN "NOT RETRY", which is what the games used to
       mark posted on. Three answers that are not worth an immediate retry
       can still end with the day filed, and marking them posted lost the
       day for good:
         - signed out (a 200 saying so, or Guess the Maze's 401): the
           session lapsed; signing in again files it;
         - 409 "unfinished": the server's record is behind the page's, and
           the game reads the day again to finish it (see refreshDay in
           either game);
         - 400 "That day is not open" while the day is still fileable: a
           server from before LATE FILING, or a clock a moment out; the
           next open tries again, until fileable() says no more.
       Any other refusal (a bad request, a day with nothing to deal) will
       be refused again and is final. */
    function filed(status, body, day) {
        const b = body || {};
        const ok = Boolean(status === 200 && (b.recorded || b.reason === "already"));
        if (ok) return { ok, retry: false, final: true };
        const retry = status === 0 || status >= 500 || status === 429;
        const later = retry ||
            (status === 200 && b.reason === "signed-out") ||
            status === 401 ||
            (status === 409 && b.reason === "unfinished") ||
            (status === 400 && /not open/i.test(String(b.error || "")) && fileable(day));
        return { ok, retry, final: !later };
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
    // The starts the server has said it has (a 200), which move() reads to
    // know whether round 0 is going out with a clock behind it.
    const startConfirmed = new Set();
    // Round 0 as each start's reply handed it out, per "game:day" (see
    // opening below).
    const openings = new Map();
    function start(game, day, url) {
        const key = game + ":" + day;
        if (startSent.has(key) || !window.Account) return startsInFlight.get(key) || Promise.resolve();
        startSent.add(key);
        const job = (async () => {
            try { await Account.ready(); } catch (e) { startSent.delete(key); return; }
            if (!Account.current) { startSent.delete(key); return; }
            const { status, body } = await post(url || SCORES_URL, { game, day, action: "start" });
            if (status === 200) startConfirmed.add(key);
            if (status === 200 && body && body.next) openings.set(key, body.next);
            // A refusal (a closed day, say) will be refused again; only a
            // server that could not answer is worth another go.
            if (status === 0 || status >= 500) startSent.delete(key);
        })().catch(() => { startSent.delete(key); });
        startsInFlight.set(key, job);
        job.then(() => { if (startsInFlight.get(key) === job) startsInFlight.delete(key); });
        return job;
    }

    /* ONE ROUND AT A TIME (30 Sept 2026). The deal reply no longer hands
       out every round's pictures before the day has started — that let a
       player study all five and then answer each at the one-second floor
       for nearly the whole speed bonus. A round's pictures now arrive in
       the reply that ends the round before it (`next` on a move's answer),
       round 0's in the start's, and a deal reply carries only the rounds
       the server's record says this player has reached (null for the rest,
       signed out all null) — see ONE ROUND AT A TIME in
       netlify/functions/_deal.js. Each game keeps the rounds it has been
       handed with its saved day, so a reload signed out still has them.

       opening() is round 0: from the start's reply when a signed-in start
       is sent (start above), otherwise by asking the same endpoint plainly,
       which for a signed-out player records nothing and answers the round.
       Answers the round ({ round: 0, ... }) or null. */
    async function opening(game, day, url) {
        const key = game + ":" + day;
        if (!openings.has(key)) await start(game, day, url);
        if (openings.has(key)) return openings.get(key);
        const { status, body } = await post(url || SCORES_URL, { game, day, action: "start" });
        if (status === 200 && body && body.next) {
            openings.set(key, body.next);
            if (body.started) startConfirmed.add(key);
        }
        return openings.get(key) || null;
    }

    /* A round handed out (`next`), put into the game's list of rounds if
       that slot is still empty. Answers whether it was. */
    function takeRound(rounds, next) {
        if (!Array.isArray(rounds) || !next || !Number.isInteger(next.round)) return false;
        if (next.round < 0 || next.round >= rounds.length || rounds[next.round]) return false;
        const copy = Object.assign({}, next);
        delete copy.round;
        rounds[next.round] = copy;
        return true;
    }

    /* Fills the empty slots of `into` from `from` (a saved copy of the same
       day's rounds), in place. */
    function mergeRounds(into, from) {
        if (!Array.isArray(into) || !Array.isArray(from)) return;
        for (let i = 0; i < into.length && i < from.length; i++) {
            if (!into[i] && from[i] && typeof from[i] === "object") into[i] = from[i];
        }
    }

    /* Forgets every start this page remembers for one game, on any day —
       for claimReset, after an admin reset has deleted the clock on the
       server. The keys are "game:day", so the prefix is the game and the
       colon (28 Sept 2026). */
    function forgetStarts(game) {
        const prefix = game + ":";
        for (const key of Array.from(openings.keys())) if (key.startsWith(prefix)) openings.delete(key);
        for (const key of Array.from(startSent)) if (key.startsWith(prefix)) startSent.delete(key);
        for (const key of Array.from(startConfirmed)) if (key.startsWith(prefix)) startConfirmed.delete(key);
        for (const key of Array.from(startsInFlight.keys())) if (key.startsWith(prefix)) startsInFlight.delete(key);
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

    /* Whether a board row is the signed-in player's own (29 Sept 2026).

       The boards no longer send the Discord id: a row's `id` is a public
       one (publicIdOf in netlify/functions/_publicid.js), and `me` hands the
       player their own as Account.current.publicId. The raw id is still
       tried second, for a board answer from before the deploy that the edge
       or the browser is still holding — a Discord id and a public id can
       never be mistaken for each other (digits only, and 17 to 20 of them,
       against 16 characters of base64url), so the fallback cannot match
       somebody else's row. `who` is Account.current, or null. Published as
       Daily.isMine for the other boards. */
    function isMine(row, who) {
        if (!row || !row.id || !who) return false;
        return (Boolean(who.publicId) && row.id === who.publicId) || row.id === who.id;
    }

    function rows(list, who, empty) {
        if (!list || !list.length) return `<li class="guess-board-empty">${escapeHtml(empty)}</li>`;
        const place = ranks(list);
        return list.map((row, i) => `
            <li class="guess-board-row${isMine(row, who) ? " is-me" : ""}">
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

        // The whole account, not its id: rows() matches on the public id
        // first (see isMine).
        const me = () => (window.Account && Account.current ? Account.current : null);

        function draw() {
            if (!data) {
                panel.innerHTML = `<p class="guess-board-note">Fetching the scores…</p>`;
                return;
            }
            if (data === "failed") {
                panel.innerHTML = `<p class="guess-board-note">The scoreboard could not be reached just now.</p>`;
                return;
            }
            /* Signed in with no nickname, the line that says which name the
               score went up under, and a way to choose another (28 Sept
               2026). Account.nickHintHtml draws it, answers its button and
               takes it away again once a nickname is set. Not for a day
               the game says was played unlisted (opts.listed === false),
               which went up under no name at all. */
            const invite = me() ? (o.listed !== false && window.Account && Account.nickHintHtml ? Account.nickHintHtml() : "") : `
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
        claimReset, deal, move, replay, refusedAsSignedIn, submit, filed, fileable, start, opening, takeRound, mergeRounds,
        clock, scoreCell, boards, ranks, isMine,
        SPEED_BONUS_MAX, bonusLine, bonusRule,
        shareDate, dayTotal, shareText, shareFallback
    };
})();

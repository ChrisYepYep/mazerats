/* /.netlify/functions/player-data — the things a signed-in visitor's browser
   would otherwise remember on its own.

   GET   returns this player's stored state
   PUT   merges a patch into it

   Two kinds of thing live here, and they are kept differently on purpose.

   WALKED MAZES, and the SAVED list of ones to go and walk, are both sets —
   and a set is the one shape that merges without a rule to argue about:
   signing in on a second device unions the two lists and nobody loses a
   tick. So the client sends the whole set and the server unions it in.
   Which is also why removing from either has to be said out loud: a
   shorter list is not a deletion, so DELETE takes the one id to drop.

   THE DAY'S GAME is a single in-progress blob for today only. Yesterday's
   is meaningless — the rooms have changed — so it is replaced outright when
   the day rolls over rather than accumulated.

   STATS ARE NOT STORED AT ALL. Days played, points, streak and the rest are
   worked out here from guess_scores, which already holds one authoritative
   row per player per day (see guess-scores.js). Storing a second copy would
   mean deciding what happens when a device that has been playing signed out
   arrives with its own totals — and there is no honest answer to that, only
   a choice between double-counting and throwing history away. Derived, the
   question never arises. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom, sessionRevoked, clearCookie } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
const { today } = require("./_daily");
const { launchCut, afterLaunch } = require("./daily-scores");
const { writeRefusal } = require("./_bans");
// notePractised — NO SPEED BONUS AFTER PRACTICE in _speed.js (1 Oct 2026).
const speed = require("./_speed");

const COLLECTION = "player_state";
const SCORES = "guess_scores";
const ROUNDS = 5;

// Generous enough for an archive many times this size, small enough that a
// crafted request cannot fill the database with one call.
const MAX_WALKED = 5000;
const MAX_ID = 80;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

/* One document per player. Via ensureUniqueIndex, which THROWS on failure:
   it was createIndex(...).catch(() => {}) with the flag set anyway, so an
   index that never got built was remembered as built, and two first saves
   racing each other could each upsert a document of their own. */
async function ensureIndexes(col) {
    await ensureUniqueIndex(col, "playerId");
}

/* How far into a day a saved game is, for telling a stale device from a
   current one. A finished day outranks any unfinished one; otherwise more
   guesses made, and more rounds closed, is further along. */
function progressOf(g) {
    if (!g || !Array.isArray(g.results)) return -1;
    let n = g.done ? 1e6 : 0;
    g.results.forEach(r => {
        n += (Array.isArray(r && r.guesses) ? r.guesses.length : 0) + (r && r.done ? 1 : 0);
    });
    return n;
}

function cleanWalked(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    const seen = new Set();
    for (const id of list) {
        if (typeof id !== "string") continue;
        const v = id.slice(0, MAX_ID);
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
        if (out.length >= MAX_WALKED) break;
    }
    return out;
}

/* The in-progress day, checked for shape rather than for truth. Nothing
   here is scored — the leaderboard has its own endpoint and its own
   checking (see guess-scores.js) — so this is only "is it the right sort of
   object, and is it small". The worst a forged one can do is give its own
   owner a wrong-looking board on their next device. */
function cleanGuess(g) {
    if (!g || typeof g !== "object") return null;
    if (typeof g.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(g.day)) return null;
    if (!Array.isArray(g.results) || g.results.length !== ROUNDS) return null;

    /* v, mode, posted and each round's answer are KEPT. They used to be
       stripped here, and the mirror was dead from the day the page started
       checking them: js/guess.js only adopts a mirror whose `v` is its own
       STATE_VERSION (adoptAccountDay), because a copy without it may be a
       day the page dealt itself before the server dealt the days — so every
       mirror this wrote was ignored, and a day begun on a phone could not be
       carried on at a desk. `mode` is what the day is filed as (recorded or
       not), `posted` whether it reached the board, and `answer` the maze a
       finished round turned out to be, which the page only ever learns from
       the server's verdict and cannot show again without. All four are
       still checked for shape and size, like everything else here. */
    const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
    const answerOf = a => (a && typeof a === "object" && typeof a.name === "string"
        ? { id: str(a.id, 80), name: str(a.name, 120), slug: typeof a.slug === "string" ? a.slug.slice(0, 120) : null, creator: str(a.creator, 120) }
        : null);

    const results = g.results.map(r => {
        const guesses = Array.isArray(r && r.guesses) ? r.guesses.slice(0, 8) : [];
        return {
            guesses: guesses.map(x => ({
                name: typeof (x && x.name) === "string" ? x.name.slice(0, 120) : "",
                correct: Boolean(x && x.correct)
            })),
            done: Boolean(r && r.done),
            won: Boolean(r && r.won),
            answer: answerOf(r && r.answer)
        };
    });

    const round = Number(g.round);
    const v = Number(g.v);
    /* `practice` is KEPT too (30 Sept 2026): the launch cut, on a day played
       before the site opened (PRACTICE BEFORE LAUNCH in _speed.js). It was
       stripped with everything else not listed, so the mirror of a practice
       run came back with nothing saying it was one — and js/guess.js, which
       puts a practice run away once the cut has passed, adopted it from the
       account as the real launch day (adoptAccountDay reads this very flag
       to refuse it). A day begun signed out was then shown finished and
       could not be played at all. The PUT below stamps it from the server's
       own clock as well; this only keeps what a page sent, as a date. */
    const practice = typeof g.practice === "string" && g.practice.length <= 40 && Number.isFinite(Date.parse(g.practice))
        ? g.practice : null;
    return {
        v: Number.isInteger(v) && v > 0 && v < 1000 ? v : null,
        day: g.day,
        round: Number.isInteger(round) && round >= 0 && round < ROUNDS ? round : 0,
        results,
        done: Boolean(g.done),
        mode: g.mode === "account" || g.mode === "anon" ? g.mode : null,
        posted: Boolean(g.posted),
        ...(practice ? { practice } : {})
    };
}

/* A mirrored practice run the launch cut has since passed (30 Sept 2026).
   It is not the day any more — the page starts the real one fresh at the
   cut — so it is read as no game at all: never handed back to a device,
   and never the copy that wins the merge against the real day's saves. */
const practiceOver = g => Boolean(g && typeof g.practice === "string" && Date.parse(g.practice) <= Date.now());
const liveGuess = g => (g && !practiceOver(g) ? g : null);

function yesterdayOf(iso) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

// May a saved game be for this day? Today or yesterday, UTC — see the PUT.
function guessDayOpen(day) {
    const now = today();
    return day === now || day === yesterdayOf(now);
}

/* Everything the results panel wants to say about a player, counted from
   the rows that were actually recorded. The streak walks backwards from the
   most recent day rather than being kept as a number, so it cannot drift
   out of step with the days it is meant to describe. */
async function statsFor(db, playerId) {
    /* From launch day on, as the boards and the Profile count (see launchDay
       in daily-scores.js). Without it a player who tested before launch saw
       their test days in this panel while the Profile said they had played
       one day. No launch date set means nothing is cut. */
    /* And from the launch INSTANT, not just its day: the site opens at
       08:00 UTC, and a day cut alone counted anything played on 3 Oct
       before the doors opened — the owner's own early checks included. */
    const launch = await launchCut(db);
    const query = launch ? { playerId, day: { $gte: launch.day }, ...afterLaunch(launch) } : { playerId };
    const rows = await db.collection(SCORES)
        .find(query, { projection: { _id: 0, day: 1, points: 1, solved: 1 } })
        .sort({ day: 1 })
        .toArray();

    if (!rows.length) {
        return { days: 0, points: 0, solved: 0, rounds: 0, bestDay: 0, streak: 0, best: 0, lastDay: "" };
    }

    /* Points and best day are BASE points — what each day scored for its
       rooms, without the speed bonus — because these figures are drawn on
       Guess the Maze's own results card, beside the day's own score, and
       that score is the base too. The card does show the bonus now, but on
       a line of its own under the score that names it and the total it
       makes ("50 + 161 speed bonus = 211 on the boards" — Daily.bonusLine
       in js/daily.js), so every figure on the card still says which it is.

       They were totals (base plus bonus, as the boards and the Profile
       count) for a while, and that made the one card count two ways: a
       perfect day read "50 points" at the top and "Best day 83" underneath
       it for a signed-in player, while the same card signed out — counted
       on the device, which never knows a bonus (js/guess.js, countDay) —
       said 50 and 50. Base on both sides is the version where every number
       on the card is in the units the card itself scores in, and it is the
       same as Odd One Out's card, which only ever counts base. The boards
       and the Profile rank by the total and still show it; a signed-out
       player's days carry no bonus anyway, so for them the two were always
       the same number. */
    let points = 0, solved = 0, bestDay = 0;
    rows.forEach(r => {
        const base = Number(r.points) || 0;
        points += base;
        solved += r.solved || 0;
        bestDay = Math.max(bestDay, base);
    });

    const days = rows.map(r => r.day);
    const daySet = new Set(days);
    const lastDay = days[days.length - 1];

    /* The run ending on the most recent day played — but only if that day is
       today or yesterday. Without the check a player who stopped a week ago
       was still shown their old run as a current streak; a run that has
       ended is a best, not a streak. The same rule as gameStats in
       player-profile.js, so the two pages cannot disagree. */
    let streak = 0;
    const day = today();
    if (lastDay === day || lastDay === yesterdayOf(day)) {
        for (let d = lastDay; daySet.has(d); d = yesterdayOf(d)) streak++;
    }

    // And the longest run anywhere in the record.
    let best = 0, run = 0;
    days.forEach((d, i) => {
        run = (i > 0 && days[i - 1] === yesterdayOf(d)) ? run + 1 : 1;
        best = Math.max(best, run);
    });

    return { days: rows.length, points, solved, rounds: rows.length * ROUNDS, bestDay, streak, best, lastDay };
}

exports.handler = async (event) => {
    const player = playerFrom(event);
    if (!player) return json(401, { error: "Not signed in" });

    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed" });
    }
    const col = db.collection(COLLECTION);
    /* Only a write can make a second document, so only a write is refused
       when the unique index cannot be confirmed; a GET reads on regardless. */
    try {
        await ensureIndexes(col);
    } catch (e) {
        console.error("player-data: unique index unavailable", e);
        if (event.httpMethod !== "GET") return json(503, { error: "Could not save your progress just now" });
    }

    /* A banned player's progress is not written (29 Sept 2026; see _bans.js):
       every write here — the ticks, the saves, a removal — answers 403
       { error, banned }, soft or full. Reading their own progress is a read,
       and goes on. A bans lookup that fails is a 503, as the write would be. */
    if (event.httpMethod !== "GET") {
        const refusal = await writeRefusal(db, event, player.id);
        if (refusal) return refusal;
    }

    if (event.httpMethod === "GET") {
        /* A REVOKED SESSION reads nothing either (1 Oct 2026; SESSION
           VERSIONS in _player.js). Every write here was already refused to
           it (writeRefusal), and the Profile signs it out — but this read
           still handed a device signed out "on every device" the account's
           ticks, saves, day in progress and stats. One indexed read; it
           fails OPEN, as the write check's non-game path does, since the
           read is the player's own and a blip should not hide it. */
        try {
            const row = await db.collection("players").findOne({ id: String(player.id) }, { projection: { _id: 0, sv: 1, svStrict: 1 } });
            if (sessionRevoked(player, row)) {
                const out = json(401, { error: "Not signed in" });
                out.headers = { ...out.headers, "Set-Cookie": clearCookie() };
                return out;
            }
        } catch (e) {
            console.error("player-data: could not check the session; reading on", e);
        }
        try {
            const [doc, stats] = await Promise.all([
                col.findOne({ playerId: player.id }, { projection: { _id: 0, walked: 1, saved: 1, guess: 1 } }),
                statsFor(db, player.id)
            ]);
            return json(200, {
                walked: (doc && doc.walked) || [],
                saved: (doc && doc.saved) || [],
                guess: liveGuess(doc && doc.guess),
                stats
            });
        } catch (e) {
            console.error("player-data: read failed", e);
            return json(500, { error: "Could not read your saved progress" });
        }
    }

    if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }
        // "null" is valid JSON and not a body; body.walked on it was a
        // TypeError and a bare 500 (28 Sept 2026).
        if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });

        const set = { playerId: player.id, updatedAt: new Date().toISOString() };
        let addWalked = null;
        let addSaved = null;

        if (body.walked !== undefined) {
            addWalked = cleanWalked(body.walked);
            if (addWalked === null) return json(400, { error: "Bad walked list" });
        }
        /* The to-walk list. Same set semantics as walked and for the same
           reason — two devices adding different mazes must both keep
           theirs — so it takes the same union treatment and the same
           explicit removal. */
        if (body.saved !== undefined) {
            addSaved = cleanWalked(body.saved);
            if (addSaved === null) return json(400, { error: "Bad saved list" });
        }
        if (body.guess !== undefined) {
            // null is a legitimate value: it is how the client says "the day
            // rolled over, there is nothing in progress".
            const g = body.guess === null ? null : cleanGuess(body.guess);
            if (body.guess !== null && g === null) return json(400, { error: "Bad game state" });
            /* Only today's game, or yesterday's. Any other day was accepted,
               and a later day always wins the merge below — so a game filed
               against 2099-01-01 sat there for good, and every real day's
               save after it was dropped as stale. The page only ever saves
               the day it dealt (js/guess.js keeps state.day), which is today
               or, for a sitting that crossed midnight, yesterday.

               Out of range is IGNORED rather than refused. This field shares
               a coalesced PUT with the walked and saved lists (js/account.js),
               and a 400 would throw away the ticks sent alongside it; a
               device whose clock has run a day ahead loses only a copy of a
               game it still has in localStorage. */
            /* A day saved before the launch cut is a practice run whatever
               the page said, stamped from this server's clock and the site's
               launchAt (launchCut in daily-scores.js) — so a page that never
               knew, or a mirror written in the minute a deal reply was
               stale, still carries the mark. A settings read that fails
               leaves the page's own mark, if any. */
            let cut = null;
            if (g) {
                try { cut = await launchCut(db); } catch (e) { cut = null; }
            }
            if (g && !g.practice) {
                if (cut && g.day <= cut.day && Date.now() < Date.parse(cut.at)) g.practice = cut.at;
            }
            /* A practice copy of launch day with a guess in it is a practice
               run this account played — signed out, perhaps, and only
               signed into now — so the real day earns no speed bonus (NO
               SPEED BONUS AFTER PRACTICE in _speed.js; 1 Oct 2026). A copy
               for any other day is no concern of the cut's. A note that
               fails to write is only logged: this save carries the ticks
               too, and the page's own `practised` on its start is the other
               witness to the same run. */
            if (g && g.practice && cut && g.day === cut.day && g.results.some(r => r.guesses.length)) {
                try { await speed.notePractised(db, "guess", g.day, player.id, "mirror"); } catch (e) {
                    console.warn("player-data: could not note a practice run", e && e.message);
                }
            }
            if (g === null || guessDayOpen(g.day)) set.guess = g;
        }

        try {
            /* $addToSet with $each rather than a plain overwrite: two
               devices ticking different mazes at the same time both keep
               their ticks, and re-sending the same list changes nothing. */
            const update = { $set: set };
            const add = {};
            /* $slice caps the array ITSELF, not just this request.

               MAX_WALKED limited one payload, which is what the comment on it
               claims — but $addToSet unions across calls, so nothing stopped
               five thousand fresh ids arriving again and again until the
               document reached Mongo's 16MB ceiling and every further save
               for that player failed permanently. A per-request cap on an
               accumulating field is not a cap.

               $each with $slice needs $push rather than $addToSet, so the
               de-duplication $addToSet was here for has to be done by hand —
               which is what mergeSet below does, against the list already
               stored. Positive $slice keeps the FIRST n, so the ticks a
               player has had longest are the ones that survive; silently
               dropping their oldest history instead would be the worse half
               to lose. */
            if (addWalked) add.walked = { $each: addWalked, $slice: MAX_WALKED };
            if (addSaved) add.saved = { $each: addSaved, $slice: MAX_WALKED };
            if (Object.keys(add).length) update.$push = add;

            /* Read-then-merge, because $push cannot de-duplicate. A second
               device re-sending its whole list is the normal case, not the
               exception, so without this every sync would append the same ids
               again and fill the cap with copies. */
            const current = (Object.keys(add).length || "guess" in set)
                ? (await col.findOne({ playerId: player.id }, { projection: { _id: 0, walked: 1, saved: 1, guess: 1 } }) || {})
                : {};

            /* The day's game is never walked BACKWARDS. It used to be
               replaced outright, so a second device still holding an early
               copy of today — or yesterday's, or the "nothing in progress"
               null a rolled-over tab sends — could overwrite a finished day
               with a less-finished one, and the player's next device would
               offer them rounds they had already played. The incoming copy
               is dropped when the stored one is for a LATER day, or for the
               same day and further along (progressOf); a null only clears a
               game from a day before today. The response carries the stored
               copy back, so the stale device catches up. */
            /* Unless the stored copy is from a day that has not happened —
               one written before the day was checked (see the PUT above).
               It is no game at all, and letting it win would block every
               real save for as long as the clock takes to catch up. */
            /* And unless it is a practice run the cut has passed
               (practiceOver): the real launch day's first saves are always
               "behind" a finished practice run of the same day, and were
               dropped as stale all day long (30 Sept 2026). */
            if ("guess" in set && current.guess && !(String(current.guess.day) > today()) && !practiceOver(current.guess)) {
                const held = current.guess;
                const incoming = set.guess;
                const stale = incoming === null
                    ? held.day === today()
                    : held.day > incoming.day || (held.day === incoming.day && progressOf(held) > progressOf(incoming));
                if (stale) delete set.guess;
            }

            if (Object.keys(add).length) {
                const only = (incoming, held) => {
                    const have = new Set(held || []);
                    return incoming.filter(id => !have.has(id));
                };
                if (addWalked) add.walked.$each = only(addWalked, current.walked);
                if (addSaved) add.saved.$each = only(addSaved, current.saved);
                // Nothing new on either side is a no-op rather than a write.
                if (!add.walked?.$each.length) delete add.walked;
                if (!add.saved?.$each.length) delete add.saved;
                if (!Object.keys(add).length) delete update.$push;
            }

            await col.updateOne({ playerId: player.id }, update, { upsert: true });

            const [doc, stats] = await Promise.all([
                col.findOne({ playerId: player.id }, { projection: { _id: 0, walked: 1, saved: 1, guess: 1 } }),
                statsFor(db, player.id)
            ]);
            return json(200, {
                walked: (doc && doc.walked) || [],
                saved: (doc && doc.saved) || [],
                guess: liveGuess(doc && doc.guess),
                stats
            });
        } catch (e) {
            console.error("player-data: save failed", e);
            return json(500, { error: "Could not save your progress" });
        }
    }

    /* Removing a tick has to be its own thing: the whole point of
       $addToSet above is that sending a shorter list never deletes, so
       un-ticking a maze needs to say so explicitly. */
    if (event.httpMethod === "DELETE") {
        const q = event.queryStringParameters || {};
        // Which list, said in the parameter name itself.
        const field = q.saved !== undefined ? "saved" : "walked";
        const id = String(q[field] || "").slice(0, MAX_ID);
        if (!id) return json(400, { error: "Nothing named to remove" });
        try {
            await col.updateOne({ playerId: player.id }, { $pull: { [field]: id } });
            return json(200, { removed: id, from: field });
        } catch (e) {
            console.error("player-data: remove failed", e);
            return json(500, { error: "Could not remove it" });
        }
    }

    // Through json() like every other answer here, so it carries the
    // security headers and no-store too (30 Sept 2026).
    return json(405, { error: "Method not allowed" });
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("player-data", exports.handler);

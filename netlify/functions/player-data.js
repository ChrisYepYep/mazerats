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
const { getDb } = require("./_db");
const { playerFrom } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");

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

let ensured = false;
async function ensureIndexes(col) {
    if (ensured) return;
    await col.createIndex({ playerId: 1 }, { unique: true }).catch(() => {});
    ensured = true;
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

    const results = g.results.map(r => {
        const guesses = Array.isArray(r && r.guesses) ? r.guesses.slice(0, 8) : [];
        return {
            guesses: guesses.map(x => ({
                name: typeof (x && x.name) === "string" ? x.name.slice(0, 120) : "",
                correct: Boolean(x && x.correct)
            })),
            done: Boolean(r && r.done),
            won: Boolean(r && r.won)
        };
    });

    const round = Number(g.round);
    return {
        day: g.day,
        round: Number.isInteger(round) && round >= 0 && round < ROUNDS ? round : 0,
        results,
        done: Boolean(g.done)
    };
}

function yesterdayOf(iso) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

/* Everything the results panel wants to say about a player, counted from
   the rows that were actually recorded. The streak walks backwards from the
   most recent day rather than being kept as a number, so it cannot drift
   out of step with the days it is meant to describe. */
async function statsFor(db, playerId) {
    const rows = await db.collection(SCORES)
        .find({ playerId }, { projection: { _id: 0, day: 1, points: 1, solved: 1 } })
        .sort({ day: 1 })
        .toArray();

    if (!rows.length) {
        return { days: 0, points: 0, solved: 0, rounds: 0, bestDay: 0, streak: 0, best: 0, lastDay: "" };
    }

    let points = 0, solved = 0, bestDay = 0;
    rows.forEach(r => {
        points += r.points || 0;
        solved += r.solved || 0;
        bestDay = Math.max(bestDay, r.points || 0);
    });

    const days = rows.map(r => r.day);
    const daySet = new Set(days);
    const lastDay = days[days.length - 1];

    // The run ending on the most recent day played.
    let streak = 0;
    for (let d = lastDay; daySet.has(d); d = yesterdayOf(d)) streak++;

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
    await ensureIndexes(col);

    if (event.httpMethod === "GET") {
        try {
            const [doc, stats] = await Promise.all([
                col.findOne({ playerId: player.id }, { projection: { _id: 0, walked: 1, saved: 1, guess: 1 } }),
                statsFor(db, player.id)
            ]);
            return json(200, {
                walked: (doc && doc.walked) || [],
                saved: (doc && doc.saved) || [],
                guess: (doc && doc.guess) || null,
                stats
            });
        } catch (e) {
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
            set.guess = g;
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
            if (Object.keys(add).length) {
                const current = await col.findOne(
                    { playerId: player.id },
                    { projection: { _id: 0, walked: 1, saved: 1 } }
                ) || {};
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
                guess: (doc && doc.guess) || null,
                stats
            });
        } catch (e) {
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
            return json(500, { error: "Could not remove it" });
        }
    }

    return { statusCode: 405, body: "" };
};

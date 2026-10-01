/* /.netlify/functions/daily-games — the daily games, from the admin's side.

   Two games run a puzzle a day: Guess the Maze and Odd One Out. This
   endpoint is how an administrator looks at one player's standing in them
   and, where it is warranted, gives a day back.

   ----------------------------------------------------------------------
   Where a day actually lives, which is the whole difficulty

   Both keep a scored row per player per day — Guess the Maze in
   guess_scores, Odd One Out in daily_scores, which it has shared in its time
   with Ratrospect and with One Wall, both since dropped. Neither keeps the
   day IN PROGRESS there: that lives in the player's own browser, in
   localStorage, which is not something a server can reach into.

   So a reset is two things, and it does both:

     · the scored row for today is deleted, so the day can be played and
       submitted again;

     · a TICKET is written here, and the game claims it the next time that
       player opens it. The page asks "is there a reset waiting for me",
       clears its own stored day if there is, and says so. That is what
       reaches into the browser, and it is the only thing that can.

   A ticket is therefore a promise rather than an act: it takes effect when
   the player next opens the game, on whichever device they open it on. The
   admin page says exactly that rather than claiming the day is already
   gone.

   Both halves need the player to be signed in with Discord, because that is
   the only thing that makes a player identifiable across a page load. Play
   from a signed-out browser is anonymous by construction and cannot be
   addressed by anybody, including us. */
const crypto = require("crypto");
const { getDb, ensureUniqueIndex } = require("./_db");
const { hasAccount, canWrite, refuseWrite, roleOf, WRITE_SCOPES, usernameFromToken, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { playerFrom } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
// Points here are totals, the day's score plus its speed bonus, as every
// public board and the Profile count them (see _speed.js). forgetDay is the
// reset's reach into the day's clock and recorded moves — see the reset.
const { TOTAL, totalOf, forgetDay, progressFor, isPractice, notePractised } = require("./_speed");
// The launch cut, for a reset of a practised launch day (1 Oct 2026).
const { launchCut } = require("./daily-scores");

const SCORES = "guess_scores";
const RESETS = "daily_resets";
/* Guess the Maze keeps a THIRD copy of the day, and missing it is what made
   the first version of this reset appear to do nothing at all.

   A signed-in player's day in progress is mirrored onto their account in
   player_state.guess, so a day begun on a phone can be finished on a laptop
   (see netlify/functions/player-data.js). On opening, the game clears its
   local day, then asks the account for its state and adopts whatever comes
   back — so deleting the score row and the browser copy while leaving this
   one simply restored the finished day a moment later.

   A reset therefore clears all three: the scored row, the account's mirror,
   and — by ticket — the browser's own copy. */
const PLAYER_STATE = "player_state";

/* The games this endpoint knows about, and where each keeps its scores.

   Guess the Maze has always had its own collection. The other two had none
   at all until they were given leaderboards; they now write to
   daily_scores, one row per player per day per game. `collection` is what a
   reset has to clear on top of the ticket it always writes. */
/* The retired games are out of this list, and that is a decision rather than
   a tidy-up: it means an admin can no longer give back a Ratrospect or One
   Wall day. Neither game can be played, so there is no day left to give —
   and leaving the rows in would offer a reset for something the player has
   no way to replay, which is a button that does nothing dressed as one that
   does.

   Their rows are still in daily_scores under game: "ratrospect" and
   "onewall", untouched. Nothing reads them now; nothing deletes them
   either. */
const GAMES = [
    { key: "guess", name: "Guess the Maze", collection: "guess_scores", filter: {} },
    { key: "odd", name: "Odd One Out", collection: "daily_scores", filter: { game: "odd" } }
];

const isGame = key => GAMES.some(g => g.key === key);

/* A player's stand-in id, for an admin role that may not see Discord ids
   (see the GET below): an HMAC of the id under SESSION_SECRET, so it is
   the same on every request and cannot be turned back into the id by
   anybody without the secret. Without a secret (a local setup) it is a
   plain hash — still not the id on screen, which is all a missing secret
   has left to protect anywhere on the site. */
function standIn(id) {
    const secret = process.env.SESSION_SECRET;
    const h = secret ? crypto.createHmac("sha256", secret) : crypto.createHash("sha256");
    return "p_" + h.update("daily-games-player:" + String(id)).digest("hex").slice(0, 20);
}

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// The same day boundary the pages use: UTC, so an admin and a player never
// disagree about which day "today" is. See js/daily.js.
const today = () => new Date().toISOString().slice(0, 10);

/* One pending ticket per player per game: asking twice is the same ask.

   Through ensureUniqueIndex, which lets a failure THROW. This used to be
   createIndex(...).catch(() => {}) with the flag set regardless, so an index
   that could not be built was marked done and the one-ticket rule quietly
   stopped being enforced. A unique index is a correctness rule, not a speed
   hint (see _db.js), so failing to build it now fails the request. */
async function ensureIndexes(col) {
    await ensureUniqueIndex(col, ["playerId", "game"]);
}

exports.handler = async (event) => {
    let db, scores, resets;
    try {
        db = await getDb();
        scores = db.collection(SCORES);
        resets = db.collection(RESETS);
        await ensureIndexes(resets);
    } catch (e) {
        /* No `detail`. This answer goes to anybody, before any sign-in
           check, and the driver's message can name the cluster host. The
           log has it. */
        console.error("daily-games: database unavailable", e);
        return json(500, { error: "Database connection failed" });
    }

    /* Everything past the connect in one catch. Only the connect was
       guarded, so any read or write below that failed — the player's ticket
       check, the admin's list, a reset — was an unhandled rejection and
       Netlify's bare 502, which neither the games nor the admin panel can
       read. The reason goes to the log, as above, not into the reply. */
    try {
        return await route(event, db, scores, resets);
    } catch (e) {
        /* hasAccount and canWrite THROW when the accounts cannot be read,
           rather than answering "no" — see isAuthUnavailable in _auth.js.
           That is a 503 the admin page knows to retry, not the generic 500
           below, and certainly not the 401 that would sign a working
           session out. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("daily-games: request failed", e);
        return json(500, { error: "The daily games could not be reached just now" });
    }
};

async function route(event, db, scores, resets) {
    const params = event.queryStringParameters || {};

    /* ---------- the player's half ----------

       Asked by the games themselves, with the player's own cookie and no
       admin token in sight. It answers only about the caller: there is no
       way to ask this about somebody else. */
    if (params.mine === "1") {
        const player = playerFrom(event);
        if (!player) return json(200, { games: [] });

        if (event.httpMethod === "POST") {
            // Claimed: the page has cleared its stored day, so the ticket is
            // spent. Deleted rather than marked, because a ticket that has
            // been used is not a record of anything worth keeping.
            let body = {};
            try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
            // `null` parses cleanly and then has no .game to read.
            if (!body || typeof body !== "object") body = {};
            if (!isGame(body.game)) return json(400, { error: "Unknown game" });
            await resets.deleteOne({ playerId: player.id, game: body.game });
            return json(200, { cleared: body.game });
        }

        /* WHICH DAY A TICKET GIVES BACK (30 Sept 2026). A reset gives back
           today's day and no other (the POST below), but its ticket had no
           day on it and never expired — so a player who did not open the
           game for a week claimed it a week later, and the claim wiped the
           day they were in the middle of, which nobody had reset. Each
           ticket now carries its `day` (a ticket from before this, its `at`
           date, which is the same thing), and `games` lists only today's;
           the page checks the day again as it claims, and a stale ticket is
           spent without touching anything (claimReset in js/daily.js). */
        const pending = await resets.find({ playerId: player.id }).toArray();
        const tickets = pending.map(r => ({ game: r.game, day: r.day || String(r.at || "").slice(0, 10) || null }));
        return json(200, {
            games: tickets.filter(t => t.day === today()).map(t => t.game),
            tickets
        });
    }

    // ---------- everything below is the admin's half ----------

    // A live account, not only a signed token: this lists players by name
    // and Discord id. See hasAccount in _auth.js.
    if (!(await hasAccount(event))) return UNAUTHORIZED;

    if (event.httpMethod === "GET") {
        /* The players worth listing are the ones the site has actually seen
           play: everyone with a scored row, plus anyone with a ticket
           waiting. A search box over Discord's whole user list would be a
           different feature and a worse one. */
        /* Everyone the games have seen. Guess the Maze's own collection is
           the older and larger one; the other two live in daily_scores, and
           a player who has only ever played those must still be findable
           here. */
        /* Only the live games' rows. daily_scores still holds every
           Ratrospect and One Wall day (see the note on GAMES above), and
           counting them here gave a player days and points for games that
           cannot be played or reset — figures the admin would be deciding
           a reset on. The filter is built from GAMES so it moves with it.

           Both aggregations are sorted before they are grouped, so `$last`
           is the player's newest name rather than whichever row Mongo's
           natural order happened to put last. */
        /* Who may see (and search by) Discord ids — see DISCORD IDS ONLY
           FOR THOSE WHO CAN ACT ON THEM, below. Read first now, because the
           search is part of the aggregations. */
        const seesIds = (WRITE_SCOPES[await roleOf(event)] || []).includes("site");
        const q = String(params.q || "").trim().toLowerCase();

        /* THE SEARCH GOES IN BEFORE THE LIMIT (30 Sept 2026). It used to be
           applied to the list afterwards, and the list is the 200 players
           seen most recently — so anybody further down could not be found
           by name at all, however exactly it was typed. Now `q` is a $match
           after the grouping and ahead of the $limit, on the name the rows
           carry and, joined from `players`, the player's current nickname
           and Discord name (a nickname changed since their last day is not
           on their rows yet). And on the id, for a role that sees ids.

           The search finds the matching players first, in each collection,
           and the two aggregations below are then run over exactly those
           players — rather than searching each list on its own, which would
           give a player whose Guess rows matched and whose Odd One Out rows
           carried an older name only half their days and points. */
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const liveDaily = GAMES.filter(g => g.collection === "daily_scores").map(g => g.filter.game);
        let only = [];
        if (q) {
            const like = { $regex: escaped, $options: "i" };
            const searchIn = (col, first) => col.aggregate(first.concat([
                { $sort: { day: 1, at: 1 } },
                { $group: { _id: "$playerId", name: { $last: "$name" }, lastDay: { $max: "$day" } } },
                { $lookup: { from: "players", localField: "_id", foreignField: "id", as: "profile" } },
                {
                    $match: {
                        $or: [{ name: like }, { "profile.nick": like }, { "profile.name": like }]
                            .concat(seesIds ? [{ _id: { $regex: escaped } }] : [])
                    }
                },
                { $sort: { lastDay: -1, _id: 1 } },
                { $limit: 200 },
                { $project: { _id: 1 } }
            ])).toArray();
            const [a, b] = await Promise.all([
                searchIn(scores, []),
                searchIn(db.collection("daily_scores"), [{ $match: { game: { $in: liveDaily } } }])
            ]);
            only = [{ $match: { playerId: { $in: [...new Set(a.concat(b).map(r => r._id))] } } }];
        }
        const knownDaily = await db.collection("daily_scores").aggregate([
            { $match: { game: { $in: liveDaily } } },
            ...only,
            { $sort: { day: 1, at: 1 } },
            { $group: { _id: "$playerId", name: { $last: "$name" }, avatar: { $last: "$avatar" }, days: { $sum: 1 }, points: { $sum: TOTAL }, lastDay: { $max: "$day" } } },
            { $sort: { lastDay: -1, _id: 1 } },
            { $limit: 200 }
        ]).toArray();

        const known = await scores.aggregate([
            ...only,
            { $sort: { day: 1, at: 1 } },
            {
                $group: {
                    _id: "$playerId",
                    name: { $last: "$name" },
                    avatar: { $last: "$avatar" },
                    days: { $sum: 1 },
                    points: { $sum: TOTAL },
                    lastDay: { $max: "$day" }
                }
            },
            { $sort: { lastDay: -1, _id: 1 } },
            { $limit: 200 }
        ]).toArray();
        // Every row the aggregations sent back has already passed the search.
        const matched = new Set(known.concat(knownDaily).map(r => r._id));

        const pending = await resets.find({}).toArray();
        const byPlayer = new Map();
        const addRow = row => {
            const seen = byPlayer.get(row._id);
            if (!seen) {
                byPlayer.set(row._id, {
                    id: row._id,
                    name: row.name || "Someone",
                    avatar: row.avatar || null,
                    days: row.days,
                    points: row.points,
                    lastDay: row.lastDay,
                    pending: []
                });
                return;
            }
            // Somebody who plays more than one of them: their days and
            // points are the total across all three, and the most recent
            // day is whichever game they played last.
            seen.days += row.days;
            seen.points += row.points;
            if (!seen.lastDay || (row.lastDay && row.lastDay > seen.lastDay)) seen.lastDay = row.lastDay;
            if (!seen.avatar && row.avatar) seen.avatar = row.avatar;
        };
        known.forEach(addRow);
        knownDaily.forEach(addRow);
        pending.forEach(t => {
            if (!byPlayer.has(t.playerId)) {
                byPlayer.set(t.playerId, {
                    id: t.playerId, name: t.name || "Someone", avatar: t.avatar || null,
                    days: 0, points: 0, lastDay: null, pending: []
                });
            }
            byPlayer.get(t.playerId).pending.push(t.game);
        });

        /* DISCORD IDS ONLY FOR THOSE WHO CAN ACT ON THEM. The list went out
           with each player's Discord id to every role that can log in —
           viewers and wizards included, neither of whom can reset a day —
           and the search matched on the id too, so a viewer could confirm
           anybody's id a digit at a time. A role without the "site" write
           scope (WRITE_SCOPES in _auth.js) now gets a stand-in instead:
           the same player always gets the same one, so the admin page
           still selects a player and asks for their detail with it (it
           treats the id as opaque), and the detail is looked up by mapping
           it back here. Search is by name only for them. */
        const players = [...byPlayer.values()];
        // The scored players were searched above; a player with only a
        // ticket waiting is matched on the ticket's name here.
        const filtered = q
            ? players.filter(p => matched.has(p.id) || p.name.toLowerCase().includes(q) || (seesIds && p.id.includes(q)))
            : players;

        /* A player's standing in each game, so the admin is deciding with
           the facts in front of them rather than pressing a button and
           hoping. Only asked for one player at a time — the day's row for
           every player in every game is a report, not a control. */
        /* BY ID, NOT FROM THE LIST (30 Sept 2026). A stand-in used to be
           mapped back by looking through `players` — the same 200, searched
           — so a player past them, or not matching the search box, had no
           detail. A role that sees ids asks by the id itself; a stand-in is
           mapped back over every player id the games and the tickets hold
           (distinct, one HMAC each — a few thousand at most). */
        let detail = null;
        let asked = null;
        if (params.playerId && seesIds) {
            asked = String(params.playerId);
        } else if (params.playerId) {
            const want = String(params.playerId);
            const [a, b] = await Promise.all([
                scores.distinct("playerId"),
                db.collection("daily_scores").distinct("playerId", { game: { $in: liveDaily } })
            ]);
            asked = a.concat(b, pending.map(t => t.playerId)).find(id => id && standIn(id) === want) || null;
        }
        if (asked) {
            const id = asked;
            const waiting = pending.filter(t => t.playerId === id).map(t => t.game);

            // Each game's own rows, from wherever that game keeps them.
            const perGame = await Promise.all(GAMES.map(async g => {
                const rows = await db.collection(g.collection)
                    .find(Object.assign({ playerId: id }, g.filter), { projection: { _id: 0 } })
                    .sort({ day: -1 }).limit(30).toArray();
                const todayRow = rows.find(r => r.day === today());
                return {
                    key: g.key,
                    name: g.name,
                    scored: true,
                    playedToday: Boolean(todayRow),
                    todayPoints: todayRow ? totalOf(todayRow) : null,
                    days: rows.length,
                    resetWaiting: waiting.includes(g.key),
                    rows
                };
            }));

            detail = {
                id: seesIds ? id : standIn(id),
                games: perGame.map(({ rows, ...rest }) => rest),
                /* The recent list is Guess the Maze's, because it is the one
                   with a solved-out-of-five to show and the longest history.
                   A merged list of three games' days would need a column to
                   say which game each row was, which is a report rather than
                   the thing this panel is for. */
                recent: (perGame.find(g => g.key === "guess") || { rows: [] }).rows
                    .slice(0, 8).map(r => ({ day: r.day, points: totalOf(r), solved: r.solved }))
            };
        }

        const shown = seesIds ? filtered : filtered.map(p => Object.assign({}, p, { id: standIn(p.id) }));
        return json(200, { today: today(), games: GAMES, players: shown, detail });
    }

    if (event.httpMethod === "POST") {
        // canWrite, not isAuthorized: a viewer is a real account and passes
        // the gate above quite correctly, and still may not change anything.
        //
        // AWAITED. canWrite is async (it looks the account's role up), so
        // the bare call returned a Promise — which is truthy, so the `!`
        // made it false every time and a viewer sailed straight through to
        // deleting a player's scored day. Every other endpoint awaits it.
        //
        // Refused through refuseWrite rather than a bare READ_ONLY: a
        // session whose account was deleted, or whose password has changed
        // since, also fails canWrite, and READ_ONLY told the admin page it
        // was "view-only" — so it kept a dead session. refuseWrite answers
        // those with the 401 the page signs out on (see _auth.js).
        if (!(await canWrite(event))) return await refuseWrite(event);

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
        if (!body || typeof body !== "object") body = {};
        const game = String(body.game || "");
        const playerId = String(body.playerId || "");
        if (!isGame(game)) return json(400, { error: "Unknown game" });
        if (!playerId) return json(400, { error: "Which player?" });

        const meta = GAMES.find(g => g.key === game);
        const by = usernameFromToken(event) || "an admin";
        let deleted = 0;

        if (body.action === "cancel") {
            // Called off before the player ever saw it.
            const gone = await resets.deleteOne({ playerId, game });
            return json(200, { cancelled: Boolean(gone.deletedCount), game });
        }

        let mirrorCleared = false;
        let clockCleared = 0;
        {
            /* A practice run of launch day goes with the reset like any
               other row (forgetDay below), and until the player's next
               start set it aside it was the server's only witness that they
               had seen the day's answers — so a launch day reset before then
               came back with the speed bonus. Noted first, as dropPractice
               notes it (NO SPEED BONUS AFTER PRACTICE in _speed.js; 1 Oct
               2026), and before anything is deleted, so a note that fails
               leaves the day as it was and the reset is tried again. */
            const cut = await launchCut(db).catch(() => null);
            if (cut && cut.day === today()) {
                const row = await progressFor(db, meta.key, today(), playerId);
                if (isPractice(row, cut)) await notePractised(db, meta.key, today(), playerId, "reset");
            }

            // Today only. Deleting a player's whole history is a different
            // and much larger decision than giving them today back, and it
            // is not one a single button should be able to make.
            const gone = await db.collection(meta.collection)
                .deleteOne(Object.assign({ playerId, day: today() }, meta.filter));
            deleted = gone.deletedCount || 0;

            /* And the account's mirror of the day in progress, which is the
               copy the game reads back the instant it has cleared its own.
               Only cleared if it is TODAY's: a mirror left over from
               yesterday is already ignored by the game, and removing it
               would be tidying up something nobody asked about. */
            const state = meta.key === "guess"
                ? await db.collection(PLAYER_STATE).findOne({ playerId }, { projection: { guess: 1 } })
                : null;
            if (state && state.guess && state.guess.day === today()) {
                await db.collection(PLAYER_STATE).updateOne({ playerId }, { $set: { guess: null } });
                mirrorCleared = true;
            }

            /* And the day's clock and recorded moves (daily_starts — see
               _speed.js), which the reset used to leave behind. That row is
               what the day is SCORED from now, not only timed: left in
               place, the replay found its first round already picked and
               was answered "already" on every move, and its clock was still
               the one started before the reset — so the day given back was
               neither playable nor fairly timed. Today's row for this game
               only, like the score row above. */
            clockCleared = await forgetDay(db, meta.key, today(), playerId);
        }

        /* The name on the ticket is the one the boards show: the player's
           nickname when they have one, from their players row (28 Sept
           2026; see player-nick.js, which renames tickets on a change too).
           The Guess the Maze row stays the fallback, for a player with no
           players row. */
        const [player, profile] = await Promise.all([
            scores.findOne({ playerId }, { projection: { name: 1, avatar: 1 } }),
            db.collection("players").findOne({ id: playerId }, { projection: { _id: 0, name: 1, nick: 1, avatar: 1 } })
        ]);
        const ticketName = (profile && (profile.nick || profile.name)) || (player ? player.name : null);
        await resets.updateOne(
            { playerId, game },
            {
                $set: {
                    playerId, game, by,
                    // The day given back — the only day the claim may clear
                    // (see the player's half above).
                    day: today(),
                    name: ticketName || null,
                    avatar: player ? player.avatar : (profile ? profile.avatar || null : null),
                    at: new Date().toISOString()
                }
            },
            { upsert: true }
        );

        return json(200, {
            game,
            playerId,
            scoreRowsDeleted: deleted,
            accountDayCleared: mirrorCleared,
            movesCleared: clockCleared > 0,
            /* Said plainly so the admin page can say it too: the browser
               half has not happened yet and will not until the player opens
               the game. */
            ticket: "waiting"
        });
    }

    return json(405, { error: "Method not allowed" });
}

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("daily-games", exports.handler);

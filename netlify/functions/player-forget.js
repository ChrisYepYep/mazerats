/* /.netlify/functions/player-forget — "forget a player", from the Warren.
   (28 Sept 2026)

   The privacy policy promises that a player who asks can have their
   account deleted "permanently and in full" — profile, scores, leaderboard
   entries, Fallin' Furni run records, completed mazes. Until this existed
   nothing could do it short of somebody typing deleteMany into the Atlas
   console by hand, collection by collection, from memory. This is that
   list written down once, where the next collection to hold a player's id
   has somewhere obvious to be added.

   Owner only, both halves. It is the most destructive thing a Warren
   account can do to somebody who is not an admin, it cannot be undone, and
   the preview lists a person by Discord id, which only the "site" roles
   see anywhere else (see standIn in daily-games.js).

     GET  ?q=<Discord id, name or @username>
          A dry run: who that is, and how much of them there is in each
          place. Nothing changes. A name that matches several players answers
          with `matches` and no counts, so the owner picks the right one and
          asks again by id — a forget is never aimed by name.
     POST { id, confirm: true }
          Does it, and answers with what it did.

   WHAT IS DELETED, and what is only UNLINKED (see PLACES below). A player's
   own rows — their profile, their saved and walked mazes, every daily and
   Fallin' Furni score, their run log, their clocks and tickets — go. Things
   they SENT us that are now part of somebody else's work stay, with their
   name and id taken off: an Add Maze Info lead's words and pictures are
   the archive's evidence, and a contact message is the owner's
   correspondence; both lose `from` (the Discord id, username and display
   name), and nothing else about them is touched. What they typed
   themselves — a Habbo name on a lead, a message — was never tied to the
   Discord account except through `from`, and is theirs to ask about
   separately, as the policy says.

   NOT HERE, on purpose:
     - daily_anon_moves: keyed by a hashed network, not a player, and gone
       after two days anyway (see _speed.js).
     - site_events: carries a per-tab session id and never an account.
     - admin_activity: the admins' own log. A forget is itself written
       there, by id and never by name (below), and ages out with the rest
       after ninety days.
     - ff_runs rows from before playerId was stored, which carry only a
       display name. A display name is not unique, and deleting another
       player's runs because they share it would be worse than keeping
       these; they age out on the log's own 180-day TTL.
     - The player's session cookie. It is a signed JWT with nothing stored
       behind it, so there is nothing here to revoke; it stays valid until
       it expires (thirty days, see _player.js) or they sign out. Anything
       they play with it in the meantime is new data, and a fresh Discord
       sign-in starts a fresh profile row, joinedAt and all.

   LEADERBOARDS: nothing is cached for long. The daily boards are edge-
   cached for fifteen seconds (BOARD_CDN_CACHE in _cache.js) and Guess the
   Maze's for thirty in the browser; Fallin' Furni's is never cached. The
   one warm-instance cache is player-profile.js's everybody's-totals map,
   five minutes, and it holds numbers for ranking, not names. So a
   forgotten player is off every board within half a minute, and out of
   the rank arithmetic within five. */
const { getDb } = require("./_db");
const { isAuthorized, roleOf, usernameFromToken, sessionOf, UNAUTHORIZED, forbidden, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { record } = require("./_audit");
const { SECURITY_HEADERS } = require("./_headers");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

const NOT_OWNER = () => forbidden("Only an owner can forget a player.");
// No detail: the driver's message can name the cluster host. The log has it.
const UNAVAILABLE = () => json(503, { error: "The database is unavailable just now. Please try again in a moment." });

/* Discord ids are snowflakes, all digits; anything that has ever been
   stored as a playerId came from Discord through _player.js. Held to a
   plain shape anyway, since it is spliced into one regex below and there
   is no reason to accept anything that could not be an id. */
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
const SNOWFLAKE = /^\d{5,25}$/;
const QUERY_MAX = 64;
const MATCHES_MAX = 20;

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---- PLACES: every collection a signed-in player's data lives in.

   Found by reading every function that calls playerFrom (_player.js) and
   following what it writes. `label` is what the counts are reported as —
   the collection, plus the field for the unlinks — and is part of the
   contract with the Warren (FORGET_LABELS in js/admin-players.js), which lists them as they come.

   `filter(id)` finds the player's rows. `unlink`, when present, is the
   update that takes the player off a row instead of deleting it. */
const PLACES = [
    // discord-auth.js: one row per Discord account — name, username,
    // avatar, joinedAt, seenAt. What the Profile page's "joined" reads.
    { label: "players", collection: "players", filter: id => ({ id }) },
    // player-data.js: walked and saved mazes, and Guess the Maze's day in
    // progress mirrored for another device.
    { label: "player_state", collection: "player_state", filter: id => ({ playerId: id }) },
    // guess-scores.js: a scored day each, with name and avatar — the board.
    { label: "guess_scores", collection: "guess_scores", filter: id => ({ playerId: id }) },
    // daily-scores.js: Odd One Out (and the retired Ratrospect and One Wall
    // days, still stored) — the board, name and avatar on each row.
    { label: "daily_scores", collection: "daily_scores", filter: id => ({ playerId: id }) },
    // _speed.js: each day's start time and recorded moves.
    { label: "daily_starts", collection: "daily_starts", filter: id => ({ playerId: id }) },
    // daily-games.js: a reset ticket waiting to be collected, name on it.
    { label: "daily_resets", collection: "daily_resets", filter: id => ({ playerId: id }) },
    // ff-scores.js: the Fallin' Furni board, one best row per player.
    { label: "ff_scores", collection: "ff_scores", filter: id => ({ playerId: id }) },
    // ff-scores.js: the same, per tournament.
    { label: "ff_tournament", collection: "ff_tournament", filter: id => ({ playerId: id }) },
    // ff-scores.js: run tokens issued to the player (short-lived anyway).
    { label: "ff_run_tokens", collection: "ff_run_tokens", filter: id => ({ playerId: id }) },
    // ff-runs.js: the run log — display name, id, address, the whole run.
    // The policy names "your Fallin' Furni run records", so these go whole.
    { label: "ff_runs", collection: "ff_runs", filter: id => ({ playerId: id }) },
    // dead-end-leads.js: today's and yesterday's upload byte counters,
    // _id "p:<id>:<day>". Two-day TTL, but they carry the id till then.
    { label: "dead_end_upload_quotas", collection: "dead_end_upload_quotas", filter: id => ({ _id: { $regex: `^p:${escapeRegex(id)}:` } }) },

    // ---- unlinked, not deleted

    // dead-end-leads.js: `from` is { id, name, username, verified }. The
    // lead's words and pictures stay; who sent it does not.
    { label: "dead_end_leads.from", collection: "dead_end_leads", filter: id => ({ "from.id": id }),
        unlink: { $set: { from: null } } },
    // dead-end-leads.js: the retry key "p:<id>". clientRef goes with it,
    // as forgetOldSenders does for the same reason: a row whose sender is
    // unset but whose clientRef is a string stays in the partial unique
    // index as (null, clientRef), and would collide with the next one.
    { label: "dead_end_leads.sender", collection: "dead_end_leads", filter: id => ({ sender: `p:${id}` }),
        unlink: { $unset: { sender: "", clientRef: "" } } },
    // dead-end-leads.js: each screenshot's uploader. A claimed one is part
    // of a lead now and stays as it; an unclaimed one is swept within the
    // day by sweepOrphans, which does not need to know whose it was.
    { label: "dead_end_uploads.playerId", collection: "dead_end_uploads", filter: id => ({ playerId: id }),
        unlink: { $unset: { playerId: "" } } },
    // contact.js: `from` as a lead's, and `discord`, which for a signed-in
    // sender IS their Discord display name (never the typed field).
    { label: "contact_messages.from", collection: "contact_messages", filter: id => ({ "from.id": id }),
        unlink: { $set: { from: null, discord: null } } }
];

async function countAll(db, id) {
    const counts = {};
    const found = await Promise.all(PLACES.map(p => db.collection(p.collection).countDocuments(p.filter(id))));
    PLACES.forEach((p, i) => { counts[p.label] = found[i]; });
    return counts;
}

const total = (counts) => Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);

const shapePlayer = (row) => ({
    id: String(row.id),
    name: row.name || null,
    username: row.username || null,
    nick: row.nick || null,
    avatar: row.avatar || null
});

/* Who an id is, when there is no players row to say — a profile write that
   failed at sign-in (discord-auth.js lets it), or one already forgotten
   while a stale session kept playing. The newest name any board row has. */
async function playerFromRows(db, id) {
    for (const collection of ["guess_scores", "daily_scores", "ff_scores"]) {
        const rows = await db.collection(collection).find({ playerId: id }, { projection: { _id: 0, name: 1, avatar: 1, at: 1 } })
            .sort({ at: -1 }).limit(1).toArray();
        if (rows.length) return { id, name: rows[0].name || null, username: null, avatar: rows[0].avatar || null };
    }
    return { id, name: null, username: null, avatar: null };
}

async function preview(db, q) {
    const players = db.collection("players");

    // An id first, when it looks like one.
    if (SNOWFLAKE.test(q)) {
        const row = await players.findOne({ id: q });
        const counts = await countAll(db, q);
        if (row || total(counts)) {
            return json(200, { player: row ? shapePlayer(row) : await playerFromRows(db, q), matches: [], counts });
        }
        // Digits that are nobody's id may still be somebody's name.
    }

    /* Then a name: the display name, the Discord username or the chosen
       nickname (28 Sept 2026: the boards show nicknames now, so that is the
       name a request to be forgotten is most likely to give), whole and
       case-blind; failing that, anything containing it. A leading "@" is
       how a username is usually written. */
    const bare = q.replace(/^@/, "");
    if (!bare) return json(404, { error: "No player by that id or name." });
    const whole = { $regex: `^${escapeRegex(bare)}$`, $options: "i" };
    let rows = await players.find({ $or: [{ name: whole }, { username: whole }, { nick: whole }] }, { projection: { _id: 0 } })
        .limit(MATCHES_MAX).toArray();
    if (!rows.length) {
        const part = { $regex: escapeRegex(bare), $options: "i" };
        rows = await players.find({ $or: [{ name: part }, { username: part }, { nick: part }] }, { projection: { _id: 0 } })
            .limit(MATCHES_MAX).toArray();
    }
    if (!rows.length) return json(404, { error: "No player by that id or name." });
    if (rows.length > 1) {
        return json(200, { player: null, matches: rows.map(r => { const p = shapePlayer(r); return { id: p.id, name: p.name, username: p.username, nick: p.nick }; }), counts: {} });
    }
    const player = shapePlayer(rows[0]);
    return json(200, { player, matches: [], counts: await countAll(db, player.id) });
}

async function forget(db, id) {
    /* Side by side: they are independent, and a forget that stopped halfway
       because one collection answered slowly would be the worst outcome.
       If any of them throws, the handler answers 503 and the owner runs it
       again — every step is idempotent, so a second run finishes the job
       and reports only what the first one missed. */
    const done = await Promise.all(PLACES.map(async p => {
        const col = db.collection(p.collection);
        const res = p.unlink ? await col.updateMany(p.filter(id), p.unlink) : await col.deleteMany(p.filter(id));
        return p.unlink ? (res.modifiedCount || 0) : (res.deletedCount || 0);
    }));
    const counts = {};
    PLACES.forEach((p, i) => { counts[p.label] = done[i]; });
    return counts;
}

exports.handler = async (event) => {
    if (!isAuthorized(event)) return UNAUTHORIZED;
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    /* The owner check, as the other owner-only routes make it — but with
       the null role told apart: a token for an account deleted, or signed
       out by a password change, is a 401 the Warren signs out on, not a 403
       telling an owner they are not one (see refuseWrite in _auth.js). */
    let role;
    try {
        role = await roleOf(event);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return UNAVAILABLE();
    }
    if (role === null) return UNAUTHORIZED;
    if (role !== "owner") return NOT_OWNER();

    let body = null;
    if (event.httpMethod === "POST") {
        try {
            body = JSON.parse(event.body || "");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });
        if (typeof body.id !== "string" || !ID_SHAPE.test(body.id)) return json(400, { error: "Which player? Send their Discord id." });
        // Exactly true: a forget is never the default of anything.
        if (body.confirm !== true) return json(400, { error: "A forget has to be confirmed." });
    } else {
        const q = String((event.queryStringParameters || {}).q || "").trim();
        if (!q || q.length > QUERY_MAX) return json(400, { error: "Give a Discord id or a name to look for." });
        body = { q };
    }

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("player-forget: database connection failed", e);
        return UNAVAILABLE();
    }

    try {
        if (event.httpMethod === "GET") return await preview(db, body.q);

        /* Logged before it happens, as every write is (recordWrite in
           _audit.js records the attempt), and by hand rather than through
           isOwnerWrite because that takes its target from the query string
           and this one is in the body. The id, never the name: the log is
           kept for ninety days and the point of this is that the name is
           not. */
        await record(event, "write", {
            username: usernameFromToken(event),
            session: sessionOf(event),
            method: "POST",
            endpoint: "player-forget",
            target: body.id
        });
        const counts = await forget(db, body.id);
        if (!total(counts)) return json(404, { error: "Nothing is stored for that player." });
        return json(200, { forgotten: body.id, counts });
    } catch (e) {
        console.error("player-forget: request failed", e);
        // Only a database fault is an outage; anything else is a bug, and
        // calling it one would file it in the Errors tab as the database.
        if (e && /^Mongo/.test(e.name || "")) return UNAVAILABLE();
        return json(500, { error: "Something went wrong with that request." });
    }
};

// For the tests, and for anyone adding the next place a player's id lives.
exports.PLACES = PLACES;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("player-forget", exports.handler);

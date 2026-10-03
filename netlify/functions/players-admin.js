/* /.netlify/functions/players-admin — the Warren's Players panel: everybody
   who has signed in with Discord, and their nicknames. (29 Sept 2026)

   The owner asked for every nickname to be listed somewhere in the Warren
   beside the Discord account that holds it, with every Discord user who
   has signed in, and for the admins to be able to add, change and remove
   nicknames. Until this, the `players` collection (written at each sign-in
   by discord-auth.js) could only be read in the Atlas console, and the only
   thing the Warren could do to a player was forget them outright.

   Admin token, like every other Warren call. The panel is js/admin-players.js.

     GET  ?q=&filter=&sort=&limit=&skip=
          The list. `q` is a nickname, a Discord name, an @username or the
          start of a Discord id; `filter` is all | nick | nonick | locked |
          unasked | flagged | banned; `sort` is seen (last signed in, the
          default) | joined | name | nick; `limit` 1-500 (100 by default);
          `skip` for the next page. Answers
            { players: [...], total, counts: { all, nick, locked, flagged, banned }, now }
          `total` is how many match; `counts` are the whole collection's,
          for the nav badge and the filter buttons.

          BANS (29 Sept 2026; see _bans.js and bans.js). Every row, in the
          list and the detail, carries `ban`: the most severe ACTIVE ban on
          the account or on the network code their row keeps, as { level,
          until, kind }, or null; and `hasNetHash`, whether that code is on
          file (so the Warren can offer "ban their network" — the code
          itself is never sent). "banned" filters to the rows with such a
          ban, and counts.banned counts them. Bans are made in bans.js.

     GET  ?id=<Discord id>
          One player, with everything the list has plus their nickname
          history, today's own changes, and their activity broken down.
          Answers { player, now }.

     PUT  { id, nick?, locked?, resetPrompt? }
          nick         a string sets it, "" or null clears it — the ADMIN
                       OVERRIDE: the same rules the player is held to
                       (shapeProblem and takenBy in player-nick.js) and the
                       same renaming of their board rows (renameRows), but
                       not their five-a-day limit, which is there to stop a
                       player using the boards as a message board, not to
                       stop the admins tidying up after one.
          locked       true locks the nickname: the player's own changes are
                       refused until it is unlocked (see LOCKED in
                       player-nick.js). false unlocks.
          resetPrompt  true shows the player the first-sign-in "Choose a
                       nickname?" window again, on their next visit.
          An admin's own nickname is never flagged, and setting or clearing
          one takes off any flag and any rejection the player's had: the
          admins chose it, so there is nothing left to review.
          Answers { player } as the detail has it, without the activity.

     PUT  { id, review: "allow" | "reject", seen? }        (29 Sept 2026)
          THE REVIEW of a nickname — see FLAGGED in player-nick.js for the
          owner's decision this carries out. On its own: not with nick,
          locked or resetPrompt, since each is a different judgement.
          allow   the nickname stays and is fine: nickFlag and nickRejected
                  go. For a flagged player, or to take back a rejection.
          reject  the nickname stays for now, but the player is asked on
                  their next visit (and every visit after, until they act)
                  to choose another: nickRejected { at, by } is set and
                  nickFlag goes. For any player with a nickname — a flagged
                  one, or one the filter missed. It does not lock, and does
                  not clear: the owner's "if no action is taken, nothing
                  happens and the user keeps their nickname".
          `seen` is the nickname the admin was looking at. When it is sent
          and the player has changed their nickname since, the answer is
          409 { changed: true } and nothing is written, so an Allow meant
          for "Mod Squad" can never wave through whatever replaced it.
          Both write a history entry { nick, at, by, action: "allowed" |
          "rejected" } and an audit row. Reject also puts the name on the
          row's nickTurnedDown and Allow takes it off, as setting or
          locking a name does (30 Sept 2026; TURNED DOWN in player-nick.js).

     PUT  { id, unTurnDown: "<name key>" }                 (30 Sept 2026)
          Takes one name off the row's nickTurnedDown, so the player may
          choose it again — for a player who has moved off a turned-down
          name and the admins have changed their minds about it. The key is
          exactly as the detail's `nickTurnedDown` lists it (the stored
          nameKey). On its own, like a review. Audited; answers { player }.

   Refusals: 401 no session, 403 a role that may not (below), 400 a bad
   request or a nickname the rules refuse ({ error, field: "nick" }), 404
   nobody by that id, 409 the nickname is somebody else's, 413 too large,
   503 the database. Never cached.

   WHO MAY. Owners and admins read and write. A view-only account reads, as
   it reads every other panel — but not Discord ids: those are shown only to
   the "site" roles anywhere in the Warren (see standIn in daily-games.js),
   so a viewer gets a stand-in `ref` in place of `id` and asks for the
   detail by that. An atlas-only account has no business with the player
   list and is refused (403). The write check is canWrite's rule made by
   hand, as player-forget.js and site-errors.js make it, so the audit row
   can name the player and what was done to them (the plain canWrite takes
   its target from the query string, and this one's is in the body).

   WHAT IS SENT, and nothing more: the Discord id, display name, @username
   and avatar; the nickname, when it was set and whether it is locked (and
   by whom); the word filter's flag and the admins' rejection, when there
   is one; whether the prompt has been answered; first and last sign-in;
   the activity counts; and, in the detail only, the last ten nickname
   changes and the turned-down names (nickTurnedDown, as stored, since
   30 Sept 2026 — so they can be taken off; unTurnDown). Not the other name
   keys, not the session version, not the day's change counter as stored, and
   nothing from any other collection but counts. The forget is not here:
   it stays player-forget.js's, owner only, and the panel calls that.

   ACTIVITY is counted for the players on the page being answered only, one
   query per collection (not per player): the daily games' days and points
   (guess_scores and daily_scores), the Fallin' Furni best (ff_scores keeps
   one best row each), and Missing Pieces submissions (dead_end_leads by
   the sender's id). A count that fails is left off rather than failing the
   list. The detail adds the per-game split, Fallin' Furni run and
   tournament counts and contact messages.

   FROM LAUNCH (29 Sept 2026, the owner's "Players tab activity counts
   start at launch"). The daily-game days and points are counted as the
   boards count them: from launch day, and on it only what was filed after
   the doors opened (launchCut / afterLaunch in daily-scores.js, the one
   place that rule lives), and only the live daily games — the retired
   Ratrospect and One Wall rows are left out, as the combined board leaves
   them out. The Fallin' Furni best counts only when it was set on or after
   the game's own launch (settings.ffLaunchAt, else launchAt), as
   player-profile.js and the board have it. Otherwise the panel showed the
   owner's rehearsal runs as a player's record. No launchAt, no cut. The
   run, tournament, message and Missing Pieces counts are not cut: they
   are what the player has sent or done, not a score. */
const crypto = require("crypto");
const { getDb, ensureUniqueIndex } = require("./_db");
const {
    isAuthorized, roleOf, usernameFromToken, sessionOf, WRITE_SCOPES,
    UNAUTHORIZED, forbidden, refuseWrite, AUTH_UNAVAILABLE, isAuthUnavailable
} = require("./_auth");
const { record } = require("./_audit");
const { SECURITY_HEADERS } = require("./_headers");
const { nameKey } = require("./_player");
const nickRules = require("./player-nick");
// Each row's ban and the "banned" filter (29 Sept 2026).
const Bans = require("./_bans");
/* The launch cut the boards use (29 Sept 2026; see ACTIVITY in the header).
   daily-scores.js requires nothing of this file, so there is no cycle. */
const { launchCut, afterLaunch } = require("./daily-scores");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// No detail: the driver's message can name the cluster host. The log has it.
const UNAVAILABLE = () => json(503, { error: "The database is unavailable just now. Please try again in a moment." });
const NO_ATLAS = () => forbidden("This account can only see the atlas.");

const LIMIT_DEFAULT = 100;
const LIMIT_MAX = 500;
const SKIP_MAX = 100000;
const QUERY_MAX = 64;
const MAX_BODY = 2048;
// Discord ids are snowflakes; held to a plain shape anyway (as in
// player-forget.js), since one goes into a regex below.
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
const REF_SHAPE = /^p_[0-9a-f]{20}$/;
const FILTERS = ["all", "nick", "nonick", "locked", "unasked", "flagged", "banned"];
const REVIEWS = ["allow", "reject"];
/* A flagged row, as a Mongo filter (29 Sept 2026). On the flag's `reason`
   being a string rather than on nickFlag existing, for the same reason the
   nickKey index is partial on the string type: a stray `nickFlag: null`
   must never count as something waiting for an admin. */
const FLAGGED = { "nickFlag.reason": { $type: "string" } };
const SORTS = ["seen", "joined", "name", "nick"];

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const today = () => new Date().toISOString().slice(0, 10);
const str = v => (typeof v === "string" && v ? v : null);

/* A viewer's handle on a player instead of their Discord id: an HMAC under
   SESSION_SECRET, the same on every request and not reversible without the
   secret. The same idea as daily-games.js's standIn, salted differently so
   the two cannot be matched against each other. */
function standIn(id) {
    const secret = process.env.SESSION_SECRET;
    const h = secret ? crypto.createHmac("sha256", secret) : crypto.createHash("sha256");
    return "p_" + h.update("players-admin:" + String(id)).digest("hex").slice(0, 20);
}

// Only a Discord CDN picture is passed on: the page puts it in an <img>.
function avatarOf(row) {
    const a = str(row.avatar);
    return a && /^https:\/\/cdn\.discordapp\.com\//.test(a) ? a : null;
}

/* ---- what one player looks like to the panel ---- */

/* The word filter's flag and the admins' rejection (29 Sept 2026; see
   FLAGGED in player-nick.js), each as plain strings or null — a row
   written by hand in Atlas with half a flag still reads as something. */
function flagOf(row) {
    const f = row.nickFlag;
    if (!f || typeof f !== "object" || !str(f.reason)) return null;
    return { reason: str(f.reason), word: str(f.word), at: str(f.at) };
}
function rejectionOf(row) {
    const r = row.nickRejected;
    if (!r || typeof r !== "object") return null;
    return { at: str(r.at), by: str(r.by) };
}

/* `bans` is _bans.js's accountBans snapshot (29 Sept 2026), or undefined
   where none was read — the row then says `ban: null`. */
function shape(row, seesIds, act, bans) {
    const nick = str(row.nick);
    const name = str(row.name);
    return {
        id: seesIds ? String(row.id) : null,
        ref: seesIds ? String(row.id) : standIn(row.id),
        name,
        username: str(row.username),
        // A Discord avatar address carries the Discord id in its path, so a
        // view-only account that is given a stand-in `ref` gets no avatar.
        avatar: seesIds ? avatarOf(row) : null,
        nick,
        displayName: nick || name || "Someone",
        nickAt: str(row.nickAt),
        nickLocked: row.nickLocked === true,
        nickLockedBy: row.nickLocked === true ? str(row.nickLockedBy) : null,
        nickLockedAt: row.nickLocked === true ? str(row.nickLockedAt) : null,
        nickFlag: flagOf(row),
        nickRejected: rejectionOf(row),
        // They pressed "Refuse" on the request (see REFUSED in player-nick.js).
        nickRefused: row.nickRefused === true,
        nickAsked: row.nickAsked === true,
        /* BANS (29 Sept 2026; see _bans.js). `ban` is the most severe active
           ban on their account or on their network code, as { level, until,
           kind }, or null. `hasNetHash` says whether the Warren can ban
           their network — only the fact, never the code itself. */
        ban: Bans.banOfPlayer(bans, row),
        hasNetHash: typeof row.netHash === "string" && row.netHash.length > 0,
        joinedAt: str(row.joinedAt),
        seenAt: str(row.seenAt),
        activity: act || null
    };
}

function history(row) {
    const list = Array.isArray(row.nickHistory) ? row.nickHistory : [];
    return list
        .filter(h => h && typeof h === "object")
        /* `action` only on the review's entries ("allowed" | "rejected";
           29 Sept 2026), and left off the rest, as the row leaves it off. */
        .map(h => Object.assign({ nick: str(h.nick), at: str(h.at), by: str(h.by) }, str(h.action) ? { action: str(h.action) } : {}))
        .reverse();                                 // newest first
}

function detailShape(row, seesIds, act, bans) {
    const out = shape(row, seesIds, act, bans);
    out.nickHistory = history(row);
    out.changesToday = row.nickDay === today() ? Math.max(0, Number(row.nickCount) || 0) : 0;
    out.changesPerDay = nickRules.CHANGES_PER_DAY;
    /* The names the admins have turned down (30 Sept 2026; TURNED DOWN in
       player-nick.js), oldest first, as the row stores them — boiled-down
       nameKeys, not the names as written — so the panel can offer to take
       one off (unTurnDown, below). */
    out.nickTurnedDown = (Array.isArray(row.nickTurnedDown) ? row.nickTurnedDown : [])
        .filter(k => typeof k === "string" && k);
    /* What OriginsBot said (3 Oct 2026; see _originsbot.js): the linked
       Habbo name and hotel, whether it became their nickname, and why not
       when it did not — `clash` (the name, or one that folds to it, is held
       by somebody it could not be taken from) or `unusable` (the boards
       cannot draw it). null when they have never been looked up. A Habbo
       name, never another player's id, so it is shown to every role. */
    const h = row.habbo && typeof row.habbo === "object" ? row.habbo : null;
    out.habbo = h ? {
        name: str(h.name), hotel: str(h.hotel), applied: str(h.applied),
        clash: !!h.clash, unusable: str(h.unusable), checkedAt: str(h.checkedAt)
    } : null;
    return out;
}

/* The ban snapshot for an answer to a write, where failing to read it must
   not fail the write that has already happened: the row then says ban: null. */
async function bansOr(db) {
    try {
        return await Bans.accountBans(db);
    } catch (e) {
        console.warn("players-admin: could not read bans for the answer", e.message);
        return undefined;
    }
}

/* ---- the list's question, as a Mongo filter ---- */

/* `bans` is needed for the "banned" filter only (29 Sept 2026): the
   accountBans snapshot, turned into "their id has an account ban, or their
   network code has a network-code ban". */
function bannedFilter(bans) {
    const ids = bans ? [...bans.byPlayer.keys()] : [];
    const hashes = bans ? [...bans.byHash.keys()] : [];
    return { $or: [{ id: { $in: ids } }, { netHash: { $in: hashes } }] };
}

function listFilter(filter, q, seesIds, bans) {
    const and = [];
    if (filter === "banned") and.push(bannedFilter(bans));
    if (filter === "nick") and.push({ nick: { $type: "string" } });
    // Cleared nicknames are $unset (player-nick.js), but a stray null or ""
    // still reads as none.
    if (filter === "nonick") and.push({ $or: [{ nick: { $exists: false } }, { nick: null }, { nick: "" }] });
    if (filter === "locked") and.push({ nickLocked: true });
    if (filter === "unasked") and.push({ nickAsked: { $ne: true } });
    if (filter === "flagged") and.push(FLAGGED);
    if (q) {
        const bare = q.replace(/^@/, "").trim();
        if (bare) {
            const rx = { $regex: escapeRegex(bare), $options: "i" };
            const or = [{ name: rx }, { username: rx }, { nick: rx }];
            /* Through the keys as well, so "Chris R" finds "chris.r" and
               "Zoe" finds "Zoë" — the same folding that decides whether a
               nickname is taken. */
            const key = nameKey(bare);
            if (key) {
                const krx = { $regex: escapeRegex(key) };
                or.push({ nameKey: krx }, { usernameKey: krx }, { nickKey: krx });
            }
            // The start of a Discord id — only for the roles that see ids.
            if (seesIds && /^\d{3,25}$/.test(bare)) or.push({ id: { $regex: "^" + bare } });
            and.push({ $or: or });
        }
    }
    return and.length ? (and.length === 1 ? and[0] : { $and: and }) : {};
}

const SORT_SPECS = {
    seen: { seenAt: -1, id: 1 },
    joined: { joinedAt: -1, id: 1 },
    name: { name: 1, id: 1 },
    nick: { nick: 1, id: 1 }
};
// Names sorted as a reader sorts them, not by code point ("adam" beside
// "Adam", not after "Zed").
const COLLATION = { locale: "en", strength: 2 };

async function pageOf(players, filter, sort, skip, limit) {
    const projection = { _id: 0, nickHistory: 0, nameKey: 0, usernameKey: 0, nickKey: 0 };
    const find = (f, s, sk, lim) => players.find(f, { projection, collation: COLLATION })
        .sort(s).skip(sk).limit(lim).toArray();
    if (sort !== "nick") return find(filter, SORT_SPECS[sort], skip, limit);

    /* By nickname, the players who HAVE one first, A to Z, then everybody
       else by when they last signed in. A plain sort on `nick` puts the
       thousands with none at the top, which is the opposite of the reason
       for choosing it. Two reads, stitched at the page boundary. */
    const has = { nick: { $type: "string" } };
    const hasNone = { $or: [{ nick: { $exists: false } }, { nick: null }, { nick: "" }] };
    const withNick = Object.keys(filter).length ? { $and: [filter, has] } : has;
    const without = Object.keys(filter).length ? { $and: [filter, hasNone] } : hasNone;
    const nNick = await players.countDocuments(withNick);
    const out = skip < nNick ? await find(withNick, SORT_SPECS.nick, skip, limit) : [];
    if (out.length < limit) {
        const rest = await find(without, SORT_SPECS.seen, Math.max(0, skip - nNick), limit - out.length);
        out.push(...rest);
    }
    return out;
}

/* ---- activity: one query per collection, for the given players ---- */

const pointsSum = { $sum: { $add: [{ $ifNull: ["$points", 0] }, { $ifNull: ["$bonus", 0] }] } };

// See FROM LAUNCH in the header: the day half and the instant half of the cut.
const sinceLaunch = cut => (cut ? { day: { $gte: cut.day }, ...afterLaunch(cut) } : {});
// The daily games still running; the retired ones' rows stay out of the counts.
const LIVE_DAILY = ["odd"];

/* Where Fallin' Furni's best starts counting, as an ISO instant, or null:
   its own ffLaunchAt when set, else the site's launch (see FROM LAUNCH). */
async function ffLaunchFrom(db, cutP) {
    const [doc, cut] = await Promise.all([
        db.collection("settings").findOne({ _id: "site" }, { projection: { _id: 0, ffLaunchAt: 1 } }),
        cutP
    ]);
    const own = doc && doc.ffLaunchAt ? Date.parse(doc.ffLaunchAt) : NaN;
    if (!isNaN(own)) return new Date(own).toISOString();
    return cut ? cut.at : null;
}
// A row's `at` as an ISO string, whether it was stored as one or as a Date.
const isoOf = v => {
    const t = v instanceof Date ? v.getTime() : Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : "";
};

async function activityFor(db, ids, full) {
    if (!ids.length) return new Map();
    const inIds = { $in: ids };
    /* One settings read for the cut, shared by both daily jobs. If it
       fails, both do, and allSettled reports the daily counts as unknown
       (null) rather than counting from the beginning of time. */
    const cutP = launchCut(db);
    const jobs = {
        guess: cutP.then(cut => db.collection("guess_scores").aggregate([
            { $match: { playerId: inIds, ...sinceLaunch(cut) } },
            { $group: { _id: "$playerId", days: { $sum: 1 }, points: pointsSum, last: { $max: "$day" } } }
        ]).toArray()),
        daily: cutP.then(cut => db.collection("daily_scores").aggregate([
            { $match: { playerId: inIds, game: { $in: LIVE_DAILY }, ...sinceLaunch(cut) } },
            { $group: { _id: { p: "$playerId", g: "$game" }, days: { $sum: 1 }, points: pointsSum, last: { $max: "$day" } } }
        ]).toArray()),
        /* ff_scores keeps one best row a player, so the cut is applied to
           the rows fetched rather than in the query: a best set before the
           game's launch is simply not a best yet. In code, too, because a
           row's `at` has been both a Date and an ISO string over the game's
           life, and a string $gte in the query would pass over the Dates. */
        ff: Promise.all([
            db.collection("ff_scores").find({ playerId: inIds },
                { projection: { _id: 0, playerId: 1, points: 1, levels: 1, ms: 1, at: 1 } }).toArray(),
            ffLaunchFrom(db, cutP)
        ]).then(([rows, from]) => (from ? rows.filter(r => isoOf(r.at) >= from) : rows)),
        leads: db.collection("dead_end_leads").aggregate([
            { $match: { "from.id": inIds } },
            { $group: { _id: { p: "$from.id", s: "$status" }, n: { $sum: 1 } } }
        ]).toArray()
    };
    if (full) {
        jobs.runs = db.collection("ff_runs").countDocuments({ playerId: inIds });
        jobs.tournaments = db.collection("ff_tournament").countDocuments({ playerId: inIds });
        jobs.messages = db.collection("contact_messages").countDocuments({ "from.id": inIds });
    }
    const keys = Object.keys(jobs);
    const settled = await Promise.allSettled(keys.map(k => jobs[k]));
    const got = {};
    keys.forEach((k, i) => {
        if (settled[i].status === "fulfilled") got[k] = settled[i].value;
        else console.error(`players-admin: ${k} count failed`, settled[i].reason);
    });

    const out = new Map(ids.map(id => [id, {
        dailyDays: got.guess && got.daily ? 0 : null,
        dailyPoints: got.guess && got.daily ? 0 : null,
        games: full ? {} : undefined,
        ffBest: got.ff ? null : undefined,
        leads: got.leads ? 0 : null,
        leadsAccepted: got.leads ? 0 : null
    }]));
    const bump = (id, game, r) => {
        const a = out.get(id);
        if (!a) return;
        if (a.dailyDays != null) {
            a.dailyDays += Number(r.days) || 0;
            a.dailyPoints += Number(r.points) || 0;
        }
        if (full) a.games[game] = { days: Number(r.days) || 0, points: Number(r.points) || 0, last: str(r.last) };
    };
    if (got.guess && got.daily) {
        got.guess.forEach(r => bump(r._id, "guess", r));
        got.daily.forEach(r => r._id && bump(r._id.p, String(r._id.g || "other"), r));
    }
    (got.ff || []).forEach(r => {
        const a = out.get(r.playerId);
        // isoOf, not new Date(r.at).toISOString(): an `at` that does not
        // parse threw a RangeError there and took the whole list down with
        // it (30 Sept 2026) — a bad row should cost its own date, not the panel.
        if (a) a.ffBest = { points: Number(r.points) || 0, levels: Number(r.levels) || 0, ms: Number(r.ms) || null, at: isoOf(r.at) || null };
    });
    (got.leads || []).forEach(r => {
        const a = r._id && out.get(r._id.p);
        if (!a) return;
        a.leads += Number(r.n) || 0;
        if (r._id.s === "accepted") a.leadsAccepted += Number(r.n) || 0;
    });
    if (full) {
        // Only ever asked for one player, so the counts are theirs.
        const a = out.get(ids[0]);
        a.ffRuns = typeof got.runs === "number" ? got.runs : null;
        a.ffTournaments = typeof got.tournaments === "number" ? got.tournaments : null;
        a.messages = typeof got.messages === "number" ? got.messages : null;
    }
    // Undefined fields left off, so the answer only says what it knows.
    out.forEach(a => Object.keys(a).forEach(k => { if (a[k] === undefined) delete a[k]; }));
    return out;
}

/* ---- the handler ---- */

async function readRole(event) {
    const role = await roleOf(event);
    if (role === null) return { refusal: UNAUTHORIZED };
    if (!["owner", "admin", "viewer"].includes(role)) return { refusal: NO_ATLAS() };
    return { role, seesIds: (WRITE_SCOPES[role] || []).includes("site") };
}

async function list(event, db, seesIds) {
    const p = event.queryStringParameters || {};
    const q = String(p.q || "").trim();
    if (q.length > QUERY_MAX) return json(400, { error: `Search for at most ${QUERY_MAX} characters.` });
    const filter = FILTERS.includes(p.filter) ? p.filter : "all";
    const sort = SORTS.includes(p.sort) ? p.sort : "seen";
    const limit = Math.min(LIMIT_MAX, Math.max(1, parseInt(p.limit, 10) || LIMIT_DEFAULT));
    const skip = Math.min(SKIP_MAX, Math.max(0, parseInt(p.skip, 10) || 0));

    const players = db.collection("players");
    // Every active account and network-code ban, for `ban` on each row and
    // the "banned" filter and count (29 Sept 2026). A handful of rows.
    const bans = await Bans.accountBans(db);
    const where = listFilter(filter, q, seesIds, bans);
    const [rows, total, all, nick, locked, flagged, banned] = await Promise.all([
        pageOf(players, where, sort, skip, limit),
        players.countDocuments(where),
        players.countDocuments({}),
        players.countDocuments({ nick: { $type: "string" } }),
        players.countDocuments({ nickLocked: true }),
        // What the nav badge lights up for (29 Sept 2026).
        players.countDocuments(FLAGGED),
        players.countDocuments(bannedFilter(bans))
    ]);
    const act = await activityFor(db, rows.map(r => String(r.id)), false);
    return json(200, {
        players: rows.map(r => shape(r, seesIds, act.get(String(r.id)), bans)),
        total,
        counts: { all, nick, locked, flagged, banned },
        now: new Date().toISOString()
    });
}

/* The players row an `id` parameter names: a Discord id for the roles that
   see them, a stand-in for a viewer. A viewer's stand-in is found by
   working it out for each id — a few thousand hashes at the most, for a
   panel a viewer opens a row of now and then. */
async function findRow(players, raw, seesIds) {
    if (seesIds && ID_SHAPE.test(raw) && !REF_SHAPE.test(raw)) return players.findOne({ id: raw }, { projection: { _id: 0 } });
    if (!REF_SHAPE.test(raw)) return null;
    const ids = await players.find({}, { projection: { _id: 0, id: 1 } }).toArray();
    const hit = ids.find(r => standIn(r.id) === raw);
    return hit ? players.findOne({ id: hit.id }, { projection: { _id: 0 } }) : null;
}

async function detail(event, db, seesIds) {
    const raw = String((event.queryStringParameters || {}).id || "").trim();
    if (!raw || raw.length > 64) return json(400, { error: "Which player?" });
    const row = await findRow(db.collection("players"), raw, seesIds);
    if (!row) return json(404, { error: "No player by that id." });
    const [act, bans] = await Promise.all([activityFor(db, [String(row.id)], true), Bans.accountBans(db)]);
    return json(200, { player: detailShape(row, seesIds, act.get(String(row.id)), bans), now: new Date().toISOString() });
}

async function update(event, db, role) {
    if (!(WRITE_SCOPES[role] || []).includes("site")) return refuseWrite(event);

    if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    let body;
    try {
        body = JSON.parse(event.body || "");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });
    if (typeof body.id !== "string" || !ID_SHAPE.test(body.id)) return json(400, { error: "Which player? Send their Discord id." });

    const hasNick = Object.prototype.hasOwnProperty.call(body, "nick");
    if (body.unTurnDown !== undefined) {
        if (typeof body.unTurnDown !== "string" || !body.unTurnDown || body.unTurnDown.length > 64) {
            return json(400, { error: "unTurnDown is one of their turned-down names, as the list has it." });
        }
        if (hasNick || body.locked !== undefined || body.resetPrompt !== undefined || body.review !== undefined) {
            return json(400, { error: "Taking a name off the turned-down list goes on its own." });
        }
        return await unTurnDown(event, db, body);
    }
    if (body.review !== undefined) {
        if (!REVIEWS.includes(body.review)) return json(400, { error: "review is allow or reject." });
        if (hasNick || body.locked !== undefined || body.resetPrompt !== undefined) return json(400, { error: "A review goes on its own." });
        if (body.seen !== undefined && body.seen !== null && typeof body.seen !== "string") return json(400, { error: "seen is the nickname you were looking at." });
        return await review(event, db, body);
    }
    if (hasNick && body.nick !== null && typeof body.nick !== "string") return json(400, { error: "A nickname has to be text.", field: "nick" });
    if (body.locked !== undefined && typeof body.locked !== "boolean") return json(400, { error: "locked is true or false." });
    if (body.resetPrompt !== undefined && body.resetPrompt !== true) return json(400, { error: "resetPrompt can only be true." });
    if (!hasNick && body.locked === undefined && body.resetPrompt === undefined) return json(400, { error: "Nothing to change." });

    const nick = hasNick ? (body.nick === null ? "" : nickRules.normalise(body.nick)) : null;
    if (hasNick && nick) {
        const wrong = nickRules.shapeProblem(nick);
        if (wrong) return json(400, { error: wrong, field: "nick" });
    }

    const players = db.collection("players");
    if (hasNick && nick) {
        try {
            await ensureUniqueIndex(players, "id");
            await nickRules.ensureNickIndex(players);
        } catch (e) {
            console.error("players-admin: index unavailable", e);
            return UNAVAILABLE();
        }
    }

    // Only ever changes a player who exists; it never makes a row.
    const row = await players.findOne({ id: body.id }, { projection: { _id: 0 } });
    if (!row) return json(404, { error: "No player by that id." });

    const who = usernameFromToken(event) || "unknown";
    const now = new Date().toISOString();
    const had = str(row.nick) || "";
    const $set = {}, $unset = {};
    let $push = null;
    const did = [];

    const nickChanges = hasNick && nick !== had;
    const key = nick ? nameKey(nick) : null;
    if (nickChanges) {
        if (nick) {
            if (await nickRules.takenBy(players, body.id, key)) return json(409, { error: nickRules.TAKEN_MESSAGE, field: "nick" });
            Object.assign($set, { nick, nickKey: key, nickAt: now });
            did.push("nickname set");
        } else {
            Object.assign($unset, { nick: "", nickKey: "" });
            $set.nickAt = now;
            did.push("nickname cleared");
        }
        /* The admins' own choice is not run past the word filter, and ends
           any review the player's name was under (29 Sept 2026): the name
           the flag or the rejection was about is gone, and what replaces
           it is the admins' judgement already. */
        Object.assign($unset, { nickFlag: "", nickRejected: "", nickRefused: "" });
        $push = nickRules.historyPush(nick || null, now, "admin:" + who);
    }
    /* A name the admins set or lock is theirs now, so it comes off the
       turned-down list (30 Sept 2026; see TURNED DOWN in player-nick.js):
       the player may keep it, or come back to it, once it is unlocked. */
    const settled = nickChanges ? key : (body.locked === true && had ? nameKey(had) : null);
    if (settled && Array.isArray(row.nickTurnedDown) && row.nickTurnedDown.includes(settled)) {
        $set.nickTurnedDown = nickRules.turnedDownWithout(row.nickTurnedDown, settled);
    }
    /* A name the admins set over OriginsBot's lock is the admins' now
       (3 Oct 2026; see _originsbot.js): the lock stays, but it is theirs,
       so the Warren and the player's Profile stop calling it their Habbo
       name. */
    if (nickChanges && row.nickLocked === true && row.nickLockedBy === "OriginsBot" && body.locked !== false) {
        Object.assign($set, { nickLockedBy: who, nickLockedAt: now });
    }
    if (body.locked === true && row.nickLocked !== true) {
        Object.assign($set, { nickLocked: true, nickLockedBy: who, nickLockedAt: now });
        /* The other way round from Reject unlocking: a name the admins lock
           is one they have settled, so a rejection standing on it goes,
           rather than leaving a player told to change a name they cannot. */
        if (row.nickRejected) Object.assign($unset, { nickRejected: "", nickRefused: "" });
        did.push("locked");
    }
    if (body.locked === false && row.nickLocked === true) {
        Object.assign($unset, { nickLocked: "", nickLockedBy: "", nickLockedAt: "" });
        did.push("unlocked");
    }
    if (body.resetPrompt === true) {
        $set.nickAsked = false;
        did.push("prompt reset");
    }

    if (did.length) {
        /* Logged before it happens, as every write is (the attempt, not the
           outcome — see recordWrite in _audit.js): the player by id, never
           by name, as player-forget.js does, and what was done. */
        await record(event, "write", {
            username: who,
            session: sessionOf(event),
            method: "PUT",
            endpoint: "players-admin",
            target: `${body.id}: ${did.join(", ")}`.slice(0, 200)
        });
        const upd = {};
        if (Object.keys($set).length) upd.$set = $set;
        if (Object.keys($unset).length) upd.$unset = $unset;
        if ($push) upd.$push = $push;
        try {
            await players.updateOne({ id: body.id }, upd);
        } catch (e) {
            // The unique index: somebody took it between the check and now.
            if (e && e.code === 11000) return json(409, { error: nickRules.TAKEN_MESSAGE, field: "nick" });
            throw e;
        }
        if (nickChanges) {
            /* The name given here is only the fallback (29 Sept 2026):
               renameRows reads the players row as it stands after this
               write and renames to THAT, so an override crossing the
               player's own change in player-nick.js cannot leave the boards
               on whichever of the two happened to write last. */
            await nickRules.renameRows(db, body.id, nick || str(row.name) || "Someone", nick || null);
        }
    }

    const after = await players.findOne({ id: body.id }, { projection: { _id: 0 } });
    return json(200, { player: detailShape(after || row, true, null, await bansOr(db)), changed: did });
}

/* THE REVIEW, allow or reject (29 Sept 2026; see the header's second PUT,
   and FLAGGED in player-nick.js). update() has already checked the role
   and the body's shape. */
async function review(event, db, body) {
    const players = db.collection("players");
    const row = await players.findOne({ id: body.id }, { projection: { _id: 0 } });
    if (!row) return json(404, { error: "No player by that id." });

    const had = str(row.nick);
    const changedSince = () => json(409, {
        error: had ? `Their nickname has changed to ${had} since you loaded it. Have a look at the new one.` : "They've removed their nickname since you loaded it.",
        changed: true
    });
    if (body.seen !== undefined && (body.seen || "") !== (had || "")) return changedSince();

    const flag = flagOf(row);
    const rejected = rejectionOf(row);
    const who = usernameFromToken(event) || "unknown";
    const now = new Date().toISOString();
    let upd, did;
    if (body.review === "allow") {
        /* Nothing to allow is not an error — two admins pressing Allow on
           the same flag is the likeliest way to get here — and nothing is
           written or logged for it, as a no-op nickname save isn't. */
        if (!flag && !rejected) return json(200, { player: detailShape(row, true, null, await bansOr(db)), changed: [] });
        upd = { $unset: { nickFlag: "", nickRejected: "", nickRefused: "" }, $push: nickRules.historyPush(had, now, "admin:" + who, "allowed") };
        // Allowed is no longer turned down (see TURNED DOWN in player-nick.js).
        if (had && Array.isArray(row.nickTurnedDown) && row.nickTurnedDown.includes(nameKey(had))) {
            upd.$set = { nickTurnedDown: nickRules.turnedDownWithout(row.nickTurnedDown, nameKey(had)) };
        }
        did = "nickname allowed";
    } else {
        if (!had) return json(400, { error: "They have no nickname to reject — the boards show their Discord name." });
        // Already asked, and nothing new flagged since: asking twice adds nothing.
        if (rejected && !flag) return json(200, { player: detailShape(row, true, null, await bansOr(db)), changed: [] });
        upd = {
            /* And the name stays turned down after it is gone, so clearing
               it and setting it again later is refused too (30 Sept 2026;
               see TURNED DOWN in player-nick.js). */
            $set: { nickRejected: { at: now, by: who }, nickTurnedDown: nickRules.turnedDownWith(row.nickTurnedDown, nameKey(had)) },
            // A fresh rejection asks afresh: an earlier Refuse is forgotten.
            // And it unlocks the nickname: a locked name the player is told
            // to change is a name they cannot change, and every game stays
            // shut with nothing they can do about it (29 Sept 2026).
            $unset: { nickFlag: "", nickRefused: "", nickLocked: "", nickLockedBy: "", nickLockedAt: "" },
            $push: nickRules.historyPush(had, now, "admin:" + who, "rejected")
        };
        did = "nickname rejected";
    }

    // Logged before it happens, as update() logs: by id, never by name.
    await record(event, "write", {
        username: who,
        session: sessionOf(event),
        method: "PUT",
        endpoint: "players-admin",
        target: `${body.id}: ${did}`.slice(0, 200)
    });
    /* On the nickname as it was READ, not just the id: a player saving a
       new name between that read and this write would otherwise have the
       review meant for the old one land on the new one — an Allow waving
       through a name nobody has looked at, or a Reject asking them to
       change a name they already changed. */
    // (No nickname: $in null also matches a field that isn't there at all.)
    const res = await players.updateOne({ id: body.id, nick: had ? had : { $in: [null, ""] } }, upd);
    if (!res || !res.matchedCount) {
        const now2 = await players.findOne({ id: body.id }, { projection: { _id: 0, nick: 1 } });
        if (!now2) return json(404, { error: "No player by that id." });
        return json(409, { error: "Their nickname changed while this was saving. Have a look at the new one.", changed: true });
    }
    const after = await players.findOne({ id: body.id }, { projection: { _id: 0 } });
    return json(200, { player: detailShape(after || row, true, null, await bansOr(db)), changed: [did] });
}

/* UN-TURNING-DOWN a name (30 Sept 2026; see the header's third PUT, and
   TURNED DOWN in player-nick.js). update() has already checked the role
   and the body's shape. The list holds nameKeys, so `unTurnDown` is one of
   those exactly as stored, and it is matched as it comes rather than
   boiled down again. A key that is not on the list changes nothing and is
   not an error — two admins pressing it at once — as Allow on nothing isn't.

   A rejection standing on their CURRENT nickname is left as it is: that is
   Allow's to lift, and while it stands player-nick.js still refuses the
   same name respelt, list or no list. */
async function unTurnDown(event, db, body) {
    const players = db.collection("players");
    const row = await players.findOne({ id: body.id }, { projection: { _id: 0 } });
    if (!row) return json(404, { error: "No player by that id." });
    const list = Array.isArray(row.nickTurnedDown) ? row.nickTurnedDown : [];
    if (!list.includes(body.unTurnDown)) {
        return json(200, { player: detailShape(row, true, null, await bansOr(db)), changed: [] });
    }
    const who = usernameFromToken(event) || "unknown";
    // Logged before it happens, as update() logs: by id, never by name.
    await record(event, "write", {
        username: who,
        session: sessionOf(event),
        method: "PUT",
        endpoint: "players-admin",
        target: `${body.id}: turned-down name removed`.slice(0, 200)
    });
    // $pull rather than writing the list back, so a name turned down by a
    // Reject landing at the same moment is not lost.
    await players.updateOne({ id: body.id }, { $pull: { nickTurnedDown: body.unTurnDown } });
    const after = await players.findOne({ id: body.id }, { projection: { _id: 0 } });
    return json(200, { player: detailShape(after || row, true, null, await bansOr(db)), changed: ["turned-down name removed"] });
}

exports.handler = async (event) => {
    const method = event.httpMethod;
    if (method !== "GET" && method !== "PUT") return json(405, { error: "Method not allowed" });
    if (!isAuthorized(event)) return UNAUTHORIZED;
    try {
        const { role, seesIds, refusal } = await readRole(event);
        if (refusal) return refusal;
        let db;
        try {
            db = await getDb();
        } catch (e) {
            console.error("players-admin: database connection failed", e);
            return UNAVAILABLE();
        }
        if (method === "PUT") return await update(event, db, role);
        if ((event.queryStringParameters || {}).id != null) return await detail(event, db, seesIds);
        return await list(event, db, seesIds);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("players-admin: request failed", e);
        // Only a database fault is an outage; anything else is a bug, and
        // calling it one would file it in the Errors tab as the database.
        if (e && /^Mongo/.test(e.name || "")) return UNAVAILABLE();
        return json(500, { error: "Something went wrong with that request." });
    }
};

// For the tests.
exports.standIn = standIn;
exports.listFilter = listFilter;
exports.FLAGGED = FLAGGED;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("players-admin", exports.handler);

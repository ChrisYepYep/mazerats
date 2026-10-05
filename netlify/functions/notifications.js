/* /.netlify/functions/notifications — CONSOLE NOTIFICATIONS (5 Oct 2026,
   the owner's).

   A short message that waits for a visitor in the Habbo Console: the
   header's console button turns to its alert picture (console-icon-alert.gif)
   while one is unread, and opening the console shows it, centred on the
   screen, with an OK. Two ways one is made:

     - by the site itself: an event entry approved in the Warren tells the
       player who sent it ("Your event entry for <event> was approved! Good
       luck!"; event-entries.js, through notifyPlayers below);
     - by an admin in the Warren, to everyone or to chosen players.

   STORED in `notifications`, one row each:
     { nid, text, audience: "all" | "players", to: [player ids] (players
       only), kind: "admin" | "entry", ref (the entry, for "entry"), at, by,
       withdrawn (true once taken back) }
   What a player has seen is on their own players row, `noticesSeen` (the
   newest SEEN_KEEP nids). Somebody signed out can still be sent one meant
   for everyone: they are told it, and their browser keeps what they have
   seen (js/console.js). An everyone-notice is offered for BROADCAST_DAYS,
   so a first visit next year is not met by this autumn's news.

   GET                   the caller's unseen notices: [{ nid, text, at }],
                         oldest first. Signed out, the everyone-notices.
   POST { seen: [nid] }  marks them seen (signed in; signed out is a 200
                         that changes nothing — the browser keeps its own).
   POST { deleted: [nid] }  takes them off the caller's own list for good
                         (noticesDeleted on their players row; the console's
                         Delete, 5 Oct 2026), and marks them seen. Signed
                         out, the browser keeps that too.
   With the Warren's admin token (Authorization), ?admin=1:
     GET                 the latest LIST_MAX sent, each with how many have
                         seen it, and for chosen players who they were.
     POST { text, audience, to }   sends one.
     DELETE &nid=        withdraws one: nobody who has not seen it will. */
const crypto = require("crypto");
const { getDb, ensureUniqueIndex, ensureIndex } = require("./_db");
const { livePlayerFrom } = require("./_player");
const { isAuthorized, canWrite, refuseWrite, usernameFromToken, sessionOf, roleOf, forbidden, WRITE_SCOPES, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { record } = require("./_audit");
const { SECURITY_HEADERS } = require("./_headers");

const COLLECTION = "notifications";
const TEXT_MAX = 300;
const TO_MAX = 200;
const SEEN_KEEP = 200;
const LIST_MAX = 60;
const BROADCAST_DAYS = 30;
const HISTORY_MAX = 30;
const MAX_BODY = 16 * 1024;
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
const NID_SHAPE = /^[0-9a-f]{16}$/;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});
const UNAVAILABLE = () => json(503, { error: "Notifications can't be read just now." });

let indexed = null;
function ensureIndexes(db) {
    if (!indexed) {
        const col = db.collection(COLLECTION);
        indexed = Promise.all([
            ensureUniqueIndex(col, "nid"),
            ensureIndex(col, { audience: 1, at: -1 }),
            ensureIndex(col, { to: 1 }),
            // The Warren's "read by" counts look players up by what they have read.
            ensureIndex(db.collection("players"), { noticesSeen: 1 })
        ]).catch(e => { indexed = null; console.error("notifications: could not build indexes", e); });
    }
    return indexed;
}

// The same check player-nick.js makes: a POST naming another site is refused.
function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try {
        return new URL(origin).host === host;
    } catch (e) {
        return false;
    }
}

const cleanText = t => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
const broadcastSince = () => new Date(Date.now() - BROADCAST_DAYS * 24 * 60 * 60 * 1000).toISOString();

/* Sends one notice to the players named, from anywhere on the server. Never
   throws: a notice that could not be stored is logged and the caller's own
   work (an entry approved) stands. Returns the nid, or null. */
async function notifyPlayers(db, ids, text, extra = {}) {
    const to = [...new Set((ids || []).filter(x => x != null && x !== "").map(String))];
    const body = cleanText(text).slice(0, TEXT_MAX);
    if (!to.length || !body) return null;
    try {
        await ensureIndexes(db);
        const nid = crypto.randomBytes(8).toString("hex");
        await db.collection(COLLECTION).insertOne({
            nid, text: body, audience: "players", to,
            kind: extra.kind || "admin", ...(extra.ref ? { ref: String(extra.ref) } : {}),
            at: new Date().toISOString(), by: extra.by || "site"
        });
        return nid;
    } catch (e) {
        console.error("notifications: could not store a notice", e);
        return null;
    }
}

/* ---- a visitor's own ---- */

async function mine(event, db) {
    const player = await livePlayerFrom(db, event);
    const col = db.collection(COLLECTION);
    const since = broadcastSince();
    const query = player
        ? { withdrawn: { $ne: true }, $or: [{ audience: "all", at: { $gte: since } }, { audience: "players", to: String(player.id) }] }
        : { withdrawn: { $ne: true }, audience: "all", at: { $gte: since } };
    // The newest fifty, then oldest first for the queue of unread ones.
    const [newest, row] = await Promise.all([
        col.find(query, { projection: { _id: 0, nid: 1, text: 1, at: 1 } }).sort({ at: -1 }).limit(50).toArray(),
        player ? db.collection("players").findOne({ id: String(player.id) }, { projection: { _id: 0, noticesSeen: 1, noticesDeleted: 1 } }) : null
    ]);
    // Deleted from their own list (the console's Delete): gone for them alone.
    const deleted = new Set(row && Array.isArray(row.noticesDeleted) ? row.noticesDeleted : []);
    const kept = newest.filter(r => !deleted.has(r.nid));
    const rows = kept.slice().reverse();
    const seen = new Set(row && Array.isArray(row.noticesSeen) ? row.noticesSeen : []);
    /* ?all=1 (5 Oct 2026, the owner's): every notice the caller has been
       sent, read or not, newest first — the console's Notifications page. */
    if ((event.queryStringParameters || {}).all === "1") {
        return json(200, {
            signedIn: !!player,
            notices: kept.slice(0, HISTORY_MAX).map(r => ({ ...r, seen: seen.has(r.nid) }))
        });
    }
    return json(200, { signedIn: !!player, notices: rows.filter(r => !seen.has(r.nid)) });
}

async function markSeen(event, db) {
    if (!sameOrigin(event)) return json(403, { error: "Forbidden" });
    if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    const idsIn = list => (Array.isArray(list) ? list.filter(n => typeof n === "string" && NID_SHAPE.test(n)).slice(0, 50) : []);
    const gone = idsIn(body && body.deleted);
    // A deleted notice is read as well, so it never comes back as unread.
    const nids = [...new Set([...idsIn(body && body.seen), ...gone])];
    if (!nids.length) return json(400, { error: "seen or deleted is a list of notice ids." });
    const player = await livePlayerFrom(db, event);
    if (!player) return json(200, { ok: true, kept: "browser" });
    if (gone.length) {
        const players = db.collection("players");
        const who = { id: String(player.id) };
        await players.updateOne(who, { $pull: { noticesDeleted: { $in: gone } } });
        await players.updateOne(who, { $push: { noticesDeleted: { $each: gone, $slice: -SEEN_KEEP } } });
    }
    /* Two updates, each atomic, rather than read-then-write (the bug scan,
       5 Oct 2026): two tabs pressing OK on different notices at once each
       wrote back the list as it read it, and one lost the other's. Taken
       out, then added at the end, the newest SEEN_KEEP kept. */
    const players = db.collection("players");
    const who = { id: String(player.id) };
    await players.updateOne(who, { $pull: { noticesSeen: { $in: nids } } });
    await players.updateOne(who, { $push: { noticesSeen: { $each: nids, $slice: -SEEN_KEEP } } });
    return json(200, { ok: true });
}

/* ---- the Warren ---- */

/* `seesIds`: the reader can edit the site (owner, admin). A view-only
   account is shown who a notice went to by nickname only, with no Discord
   id or Discord name — as the Players tab does (seesIds in players-admin.js;
   the bug scan, 5 Oct 2026). */
async function adminList(db, seesIds) {
    await ensureIndexes(db);
    const rows = await db.collection(COLLECTION).find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(LIST_MAX).toArray();
    const players = db.collection("players");
    const ids = [...new Set(rows.filter(r => r.audience === "players").flatMap(r => r.to || []))];
    const named = ids.length
        ? await players.find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, nick: 1, name: 1, username: 1 } }).toArray()
        : [];
    const nameOf = new Map(named.map(p => [String(p.id), p.nick || p.name || p.username || "Someone"]));
    const nickOf = new Map(named.filter(p => p.nick).map(p => [String(p.id), p.nick]));
    const counts = await Promise.all(rows.map(r => players.countDocuments(
        r.audience === "players" ? { id: { $in: r.to || [] }, noticesSeen: r.nid } : { noticesSeen: r.nid })));
    return json(200, {
        notices: rows.map((r, i) => ({
            nid: r.nid,
            text: r.text,
            audience: r.audience,
            kind: r.kind || "admin",
            at: r.at,
            by: r.by || null,
            withdrawn: r.withdrawn === true,
            seen: counts[i],
            to: r.audience === "players" ? (r.to || []).map(id => (seesIds
                ? { id, name: nameOf.get(String(id)) || "A player no longer here" }
                : { id: null, name: nickOf.get(String(id)) || "A player" })) : null
        }))
    });
}

async function adminSend(event, db) {
    if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    const text = cleanText(body && body.text);
    if (!text) return json(400, { error: "Write the notification first.", field: "text" });
    if (text.length > TEXT_MAX) return json(400, { error: `Keep it to ${TEXT_MAX} characters.`, field: "text" });
    const audience = body.audience === "all" ? "all" : body.audience === "players" ? "players" : null;
    if (!audience) return json(400, { error: "Send it to everyone or to chosen players." });
    let to = [];
    if (audience === "players") {
        to = [...new Set((Array.isArray(body.to) ? body.to : []).filter(x => typeof x === "string" && ID_SHAPE.test(x)))];
        if (!to.length) return json(400, { error: "Choose at least one player." });
        if (to.length > TO_MAX) return json(400, { error: `At most ${TO_MAX} players at once.` });
        const found = await db.collection("players").countDocuments({ id: { $in: to } });
        if (found !== to.length) return json(400, { error: "Some of those players aren't here any more. Choose them again." });
    }
    await ensureIndexes(db);
    const who = usernameFromToken(event) || "unknown";
    const nid = crypto.randomBytes(8).toString("hex");
    await db.collection(COLLECTION).insertOne({
        nid, text, audience, ...(audience === "players" ? { to } : {}),
        kind: "admin", at: new Date().toISOString(), by: who
    });
    await record(event, "write", {
        username: who, session: sessionOf(event), method: "POST", endpoint: "notifications",
        target: `notification to ${audience === "all" ? "everyone" : to.length + (to.length === 1 ? " player" : " players")}: ${text}`.slice(0, 200)
    });
    return json(200, { nid });
}

async function adminWithdraw(event, db) {
    const nid = String((event.queryStringParameters || {}).nid || "");
    if (!NID_SHAPE.test(nid)) return json(400, { error: "Which notification?" });
    const res = await db.collection(COLLECTION).updateOne({ nid }, { $set: { withdrawn: true } });
    if (!res.matchedCount) return json(404, { error: "No such notification." });
    const who = usernameFromToken(event) || "unknown";
    await record(event, "write", {
        username: who, session: sessionOf(event), method: "DELETE", endpoint: "notifications",
        target: `notification ${nid} withdrawn`
    });
    return json(200, { nid, withdrawn: true });
}

exports.handler = async (event) => {
    const method = event.httpMethod;
    const admin = (event.queryStringParameters || {}).admin === "1";
    if (admin) {
        if (!["GET", "POST", "DELETE"].includes(method)) return json(405, { error: "Method not allowed" });
        if (!isAuthorized(event)) return UNAUTHORIZED;
    } else if (method !== "GET" && method !== "POST") {
        return json(405, { error: "Method not allowed" });
    }
    try {
        if (admin && method !== "GET" && !(await canWrite(event, "site"))) return refuseWrite(event);
        let db;
        try {
            db = await getDb();
        } catch (e) {
            console.error("notifications: database connection failed", e);
            return UNAVAILABLE();
        }
        if (admin) {
            if (method === "GET") {
                /* The account looked up, not just its token's signature: a
                   deleted account or a changed password is refused, and an
                   Atlas-only one has no business here (readRole in
                   players-admin.js; the bug scan, 5 Oct 2026). */
                const role = await roleOf(event);
                if (role === null) return UNAUTHORIZED;
                if (!["owner", "admin", "viewer"].includes(role)) return forbidden("This account can't see notifications.");
                return await adminList(db, (WRITE_SCOPES[role] || []).includes("site"));
            }
            if (method === "POST") return await adminSend(event, db);
            return await adminWithdraw(event, db);
        }
        if (method === "POST") return await markSeen(event, db);
        return await mine(event, db);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("notifications: request failed", e);
        if (e && /^Mongo/.test(e.name || "")) return UNAVAILABLE();
        return json(500, { error: "Something went wrong with that request." });
    }
};

exports.notifyPlayers = notifyPlayers;

/* Failures reported to /warren's Errors tab: see withErrorReporting in
   _errors.js. Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("notifications", exports.handler);

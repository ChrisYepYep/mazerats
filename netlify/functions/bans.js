/* /.netlify/functions/bans — the Warren's ban list. Admin-only, every
   method: a visitor has no business reading who is banned. The checks
   themselves live in _bans.js (every player and visitor write, the sign-in,
   `me` and the boards); this function only manages the list.

   BANNED BY NETWORK. A ban used to hold only the address an admin typed,
   and was matched against that exact address — which on IPv6 banned one
   address out of the eighteen quintillion the sender's /64 holds, and the
   next message came from the one beside it. Each ban now also stores `net`,
   the subscriber that address belongs to (subscriberOf in _net.js: the /64
   for IPv6, the address itself for IPv4), and a caller matches if EITHER
   their address or their network is on the list. `ip` stays exactly what it
   was, so the ban list in Warren reads and shows the same rows.

   ----------------------------------------------------------------------
   MODERATION (29 Sept 2026). See _bans.js for the owner's decisions — two
   levels ("soft": everything but reading; "full": the whole site), four
   targets (a Discord account, an address, a network, a signed-in player's
   network code) and cool-downs (a ban with an end). This file grows to
   match, and keeps every route the Warren already calls working as it was:

     GET                 the list, newest first. Each row:
                           { id, kind, value, name, level, until, reason,
                             by, at, active }
                         plus, for the old Bans panel and the Messages and
                         Missing Pieces "Ban" buttons, the old fields
                         { ip, net, createdAt, createdBy } where a row has
                         them. `name` is the player's current display name
                         (nick, else Discord name) for a "player" ban and a
                         "nethash" ban made from a player; `active` is false
                         for a cool-down that has ended (see the TTL below).
                         Owners and admins see the targets; every other role
                         gets `value`, `ip`, `net` and `playerId` as null —
                         what "masked, as today" meant for addresses, and a
                         Discord id is kept from a viewer everywhere else in
                         the Warren too (players-admin.js).

     POST { ip, reason? }                       THE OLD ONE, unchanged: a
                         soft, permanent ban on that address and its network.
                         Stored as a "net" ban on the network that keeps the
                         address in `ip`, which is exactly what the old
                         document meant. 201 with the row, 409 if already
                         banned.

     POST { kind, value?, playerId?, level, duration?, until?, reason? }
                         THE NEW ONE.
                           kind      "player" | "ip" | "net" | "nethash"
                           value     a Discord id; an address; an address or
                                     a /64; a network code
                           playerId  instead of value, for "player"; and for
                                     "nethash", whose player's stored netHash
                                     is looked up (409 { noNetHash: true } if
                                     they have none yet — they have not
                                     signed in or loaded a page since it was
                                     first stored)
                           level     "soft" | "full"
                           duration  "1h" | "24h" | "7d", or
                           until     an ISO time in the future; neither is
                                     permanent, both is refused
                         An "ip" given a /64 is a "net" ban: a /64 is a
                         network. 201 with the row; 409 { id } when that
                         target already has an active ban (edit that one).

     PUT { id, level?, until?, duration?, reason? }
                         Edits one. `until: null` makes it permanent. Old
                         documents can be edited too, which gives them a
                         level and an end. 200 with the row.

     DELETE ?id=         lifts one.
     DELETE ?ip=         lifts every ban that address is caught by — its own
                         and its network's, old or new — for "Unban" on a
                         message, which has the address and not the ban.

   Writes are owners' and admins' ("site" scope) and each is audit-logged
   with what was banned; the check is canWrite's rule made by hand, as
   players-admin.js makes it, so the audit row can say WHO was banned (the
   plain canWrite reads its target off the query string, and these are in
   the body). Every write empties _bans.js's memo in this instance.

   THE UNIQUE INDEX ON `ip`, and why it is rebuilt. The list used to keep one
   ban per address with a plain unique index on `ip`. A "player" or
   "nethash" ban has no address, and a plain unique index counts every
   document without the field as ip: null — so the second such ban would be
   refused as a duplicate. The index is replaced, once, by the same rule
   made PARTIAL (only documents whose `ip` is a string), which keeps one ban
   per address and lets any number of bans have none. See ensureBanIndexes. */
const crypto = require("crypto");
const netModule = require("net");
const { getDb, ensureIndex } = require("./_db");
const { hasAccount, roleOf, refuseWrite, WRITE_SCOPES, usernameFromToken, sessionOf, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { record } = require("./_audit");
const { subscriberOf } = require("./_net");
const { SECURITY_HEADERS } = require("./_headers");
const Bans = require("./_bans");

/* The indexes, asked for once per warm instance and never allowed to block a
   ban — a build that failed used to throw out of every ban from then on (the
   same bargain auth.js's ensureUsernameIndex makes: a duplicate ban is
   untidy, a ban that cannot be made is a hole).

     ip       unique, PARTIAL on a string ip — see the header. An old plain
              unique index on ip is dropped first, once, if one is there.
     net      the old lookup.
     kind+value  _bans.js's lookup.
     until    the TTL that sweeps ended cool-downs (see ENDED COOL-DOWNS in
              _bans.js): a week past the end, and only on documents whose
              `until` is a Date, so a permanent ban is never touched. */
const IP_INDEX = "ip_unique_when_set";
const ENDED_KEPT_SECONDS = 7 * 24 * 60 * 60;
let banIndexing = null;
function ensureBanIndexes(bans) {
    if (!banIndexing) {
        banIndexing = (async () => {
            try {
                if (typeof bans.indexes === "function") {
                    const existing = await bans.indexes();
                    const plain = existing.find(ix => ix && ix.key && Object.keys(ix.key).length === 1 && ix.key.ip === 1 &&
                        ix.unique && !ix.partialFilterExpression);
                    if (plain) await bans.dropIndex(plain.name);
                }
                await bans.createIndex({ ip: 1 }, { unique: true, name: IP_INDEX, partialFilterExpression: { ip: { $type: "string" } } });
            } catch (e) {
                console.error("bans: the partial unique index on bans.ip is unavailable", e);
            }
            await ensureIndex(bans, { net: 1 });
            await ensureIndex(bans, { kind: 1, value: 1 });
            try {
                await bans.createIndex({ until: 1 }, {
                    name: "until_ttl", expireAfterSeconds: ENDED_KEPT_SECONDS,
                    partialFilterExpression: { until: { $type: "date" } }
                });
            } catch (e) {
                console.warn("bans: TTL on bans.until unavailable; ended cool-downs are ignored but kept", e.message);
            }
        })().catch(() => {});
    }
    return banIndexing;
}

/* Bans made before `net` existed get one, and bans made before every row
   had an `id` get one (the Warren lifts and edits by it), once per warm
   instance, the first time the list is opened. Until then an old ban still
   matches its exact address, as it always did; this only widens an IPv6 one
   to its /64. Only documents with no `kind` — a new "ip" ban keeps its one
   address. Never allowed to fail the request it rides on. */
let backfilled = false;
async function backfillOld(bans) {
    if (backfilled) return;
    backfilled = true;
    try {
        const old = await bans.find({ kind: { $exists: false }, $or: [{ net: { $exists: false } }, { id: { $exists: false } }] },
            { projection: { _id: 1, ip: 1, net: 1, id: 1 } }).toArray();
        for (const b of old) {
            const $set = {};
            if (b.net === undefined && typeof b.ip === "string" && b.ip.trim()) $set.net = subscriberOf(b.ip);
            if (b.id === undefined) $set.id = crypto.randomUUID();
            if (Object.keys($set).length) await bans.updateOne({ _id: b._id }, { $set });
        }
    } catch (e) {
        backfilled = false;
        console.warn("bans: could not backfill old bans", e.message);
    }
}

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

const REASON_MAX = 200;
const MAX_BODY = 2048;
// A Discord id, held to a plain shape as players-admin.js holds it.
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
// A network code as _bans.js's netHashOf makes it.
const HASH_SHAPE = /^[A-Za-z0-9_-]{22}$/;
const DURATIONS = { "1h": 60 * 60 * 1000, "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000 };
// A custom end further off than this is a typo, not a cool-down: make it permanent instead.
const UNTIL_MAX_MS = 5 * 365 * 24 * 60 * 60 * 1000;

// Anything off the wire is text or it is nothing: `(body.x || "").trim()`
// throws outright on an object, turning a crafted request into an unhandled
// 500. Coerced first, then refused by the ordinary checks below.
const text = (v) => (typeof v === "string" ? v : "");

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("bans: database connection failed", e);
        return json(500, { error: "Database connection failed" });
    }
    const bans = db.collection("bans");

    /* The whole of the rest inside one try. The reads and writes below had
       nothing around them, so a database that dropped mid-request answered
       with Lambda's errorType and stack trace in the body — and hasAccount
       and roleOf throw when the account lookup itself cannot be made (see
       lookUpRole in _auth.js), which must come back as a 503 the admin page
       retries, not a 401 that signs it out. */
    try {
        return await handle(event, db, bans);
    } catch (e) {
        console.error("bans: request failed", e);
        /* Only the tagged lookup failure is an outage to retry; anything
           else is a fault, and answering it as "unavailable" hid it. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return json(500, { error: "Something went wrong with that request." });
    }
};

/* ---- one row as the Warren sees it ---- */

function isoOf(v) {
    if (v === undefined || v === null || v === "") return null;
    const t = v instanceof Date ? v.getTime() : Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function rowOf(doc, names, full, now = Date.now()) {
    const kind = Bans.kindOf(doc);
    const legacy = !Bans.KINDS.includes(doc.kind);
    /* An old document's target is its address; its `net` goes with it (it
       bans both — see the header). */
    const value = legacy ? (typeof doc.ip === "string" ? doc.ip : null) : (typeof doc.value === "string" ? doc.value : null);
    const namedId = doc.kind === "player" ? value : (doc.kind === "nethash" && typeof doc.playerId === "string" ? doc.playerId : null);
    const until = Bans.untilOf(doc);
    const out = {
        id: typeof doc.id === "string" ? doc.id : null,
        kind,
        value: full ? value : null,
        name: namedId ? (names.get(namedId) || null) : null,
        level: Bans.levelOf(doc),
        until: until ? until.toISOString() : null,
        reason: typeof doc.reason === "string" ? doc.reason : "",
        by: typeof doc.by === "string" ? doc.by : (typeof doc.createdBy === "string" ? doc.createdBy : ""),
        at: isoOf(doc.at) || isoOf(doc.createdAt),
        active: Bans.isActive(doc, now),
        // The old fields, for the panel and buttons written against them.
        createdAt: isoOf(doc.createdAt) || isoOf(doc.at),
        createdBy: typeof doc.createdBy === "string" ? doc.createdBy : (typeof doc.by === "string" ? doc.by : "")
    };
    if (legacy) out.legacy = true;
    if (full) {
        if (typeof doc.ip === "string") out.ip = doc.ip;
        if (typeof doc.net === "string") out.net = doc.net;
        if (namedId && doc.kind === "nethash") out.playerId = namedId;
    }
    return out;
}

// Each named player's current display name, in one read. Never fails the list.
async function namesFor(db, ids) {
    const want = [...new Set(ids.filter(Boolean))];
    const names = new Map();
    if (!want.length) return names;
    try {
        const rows = await db.collection("players").find({ id: { $in: want } }, { projection: { _id: 0, id: 1, nick: 1, name: 1 } }).toArray();
        rows.forEach(r => names.set(String(r.id), (typeof r.nick === "string" && r.nick) || r.name || null));
    } catch (e) {
        console.warn("bans: could not read player names for the list", e.message);
    }
    return names;
}

async function rowsFor(db, docs, full) {
    const ids = docs.map(d => (d.kind === "player" ? d.value : d.kind === "nethash" ? d.playerId : null)).filter(x => typeof x === "string");
    const names = await namesFor(db, ids);
    const now = Date.now();
    return docs.map(d => rowOf(d, names, full, now));
}

/* ---- reading what an admin sent ---- */

/* An address, as net.isIP knows one, or a /64 ("2001:db8:1:2::/64", or any
   address in it followed by /64). Returns { ip } | { net } | null. */
function targetOf(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s || s.length > 64) return null;
    const slash = /^(.+)\/(\d{1,3})$/.exec(s);
    if (slash) {
        // Only a /64: it is the unit a subscriber is handed, and the one
        // every other ban and cap on the site counts in.
        if (slash[2] !== "64" || netModule.isIP(slash[1]) !== 6) return null;
        return { net: subscriberOf(slash[1]) };
    }
    return netModule.isIP(s) ? { ip: s } : null;
}

/* When a ban ends, from a body: { until: Date|null } or { error }. Absent
   both is permanent; `until: null` is permanent too (the PUT's "make it
   permanent"). */
function endOf(body, now = Date.now()) {
    const hasDuration = body.duration !== undefined && body.duration !== null;
    const hasUntil = body.until !== undefined;
    if (hasDuration && hasUntil && body.until !== null) return { error: "Send a duration or an end time, not both." };
    if (hasDuration) {
        if (!Object.prototype.hasOwnProperty.call(DURATIONS, body.duration)) return { error: "duration is 1h, 24h or 7d." };
        return { until: new Date(now + DURATIONS[body.duration]) };
    }
    if (!hasUntil || body.until === null || body.until === "") return { until: null };
    if (typeof body.until !== "string") return { error: "until is an ISO time." };
    const t = Date.parse(body.until);
    if (!Number.isFinite(t)) return { error: "until is an ISO time." };
    if (t <= now) return { error: "That end time has already passed." };
    if (t - now > UNTIL_MAX_MS) return { error: "That end time is years away — make it permanent instead." };
    return { until: new Date(t) };
}

function parseBody(event) {
    if (String(event.body || "").length > MAX_BODY) return { error: json(413, { error: "Too large" }) };
    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return { error: json(400, { error: "Invalid request body" }) };
    }
    // "null" parses too, and body.ip then threw — a 500 for a request that
    // is only malformed.
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: json(400, { error: "Invalid request body" }) };
    return { body };
}

async function audit(event, method, target) {
    await record(event, "write", {
        username: usernameFromToken(event) || "unknown",
        session: sessionOf(event),
        method,
        endpoint: "bans",
        target: String(target).slice(0, 200)
    });
}

const ALREADY = (id) => json(409, { error: "That's already banned — edit the ban that's there instead.", id: id || null });

async function handle(event, db, bans) {
    // hasAccount, not just a valid token: the ban list is a list of IP
    // addresses, and a deleted account's token should not keep reading it.
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    await backfillOld(bans);

    // Reading the ban list is part of viewing the admin page, so it stops at
    // the check above. Everything past here changes something.
    if (event.httpMethod === "GET") {
        /* The targets themselves only for the site scope — the rule
           dead-end-leads.js and contact.js draw. A viewer or an atlas
           account can see that bans exist, why, and who made them; a list
           of people's IP addresses and Discord ids is for the accounts that
           can act on it. Through roleOf, not canWrite: this is a read, and
           canWrite writes the action log. */
        const role = await roleOf(event);
        const full = (WRITE_SCOPES[role] || []).includes("site");
        const all = await bans.find({}, { projection: { _id: 0 } }).toArray();
        const rows = await rowsFor(db, all, full);
        rows.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
        return json(200, rows);
    }

    /* The write rule made by hand (see the header): owners and admins.
       refuseWrite words the refusal, and answers a deleted account's token
       with the 401 it has earned. */
    const role = await roleOf(event);
    if (!(WRITE_SCOPES[role] || []).includes("site")) return await refuseWrite(event);
    const who = usernameFromToken(event) || "";

    if (event.httpMethod === "POST") {
        const parsed = parseBody(event);
        if (parsed.error) return parsed.error;
        const body = parsed.body;
        const reason = text(body.reason).trim();
        if (reason.length > REASON_MAX) {
            return json(400, { error: `Reason is too long — keep it under ${REASON_MAX} characters` });
        }
        await ensureBanIndexes(bans);
        return body.kind === undefined ? await createOld(event, db, bans, body, reason, who) : await createNew(event, db, bans, body, reason, who);
    }

    if (event.httpMethod === "PUT") {
        const parsed = parseBody(event);
        if (parsed.error) return parsed.error;
        return await edit(event, db, bans, parsed.body, who);
    }

    if (event.httpMethod === "DELETE") {
        // Accepts either handle: id for the Unban button on a listed ban,
        // ip for unbanning straight from a contact message (where the id
        // of the ban itself isn't to hand).
        const params = event.queryStringParameters || {};
        const id = text(params.id);
        const ip = text(params.ip).trim();
        if (!id && !ip) return json(400, { error: "Missing ban id or ip" });

        await audit(event, "DELETE", id ? `lift ${id}` : `lift ip:${ip}`);
        /* By address, EVERY ban that address is caught by: its own, and
           one on its network, old documents and new. A message's sender can
           be banned by a row for a different address in the same /64, and
           "Unban" on that message has to lift what is actually stopping
           them, or it answers 404 and they stay banned. */
        const net = subscriberOf(ip);
        const result = id
            ? await bans.deleteOne({ id })
            : await bans.deleteMany({ $or: [{ ip }, { net }, { kind: "ip", value: ip }, { kind: "net", value: net }] });
        Bans.invalidate();
        if (result.deletedCount === 0) return json(404, { error: "Ban not found" });
        return json(200, { deleted: id || ip });
    }

    return json(405, { error: "Method not allowed" });
}

/* ---- POST { ip, reason }: the old ban, as it always was ---- */
async function createOld(event, db, bans, body, reason, who) {
    const ip = text(body.ip).trim();
    if (!ip) return json(400, { error: "A ban needs an IP address" });
    // A typo stored here would be a permanent ban that matches nobody.
    if (!netModule.isIP(ip)) return json(400, { error: "That is not an IP address" });

    /* Already covered by its network counts as already banned too: a second
       address from a /64 that is on the list adds nothing, and a second row
       would only mean two to lift later. Only an ACTIVE ban covers it; an
       ended cool-down on the same address is cleared out of the way. */
    const net = subscriberOf(ip);
    const covering = await bans.find({ $or: [{ ip }, { net }, { kind: "ip", value: ip }, { kind: "net", value: net }] },
        { projection: { _id: 0 } }).toArray();
    const live = covering.find(d => Bans.isActive(d) && (Bans.banMatches(d, { ip, net }) || d.ip === ip));
    if (live) return json(409, { error: "That IP is already banned", id: live.id || null });
    await clearEnded(bans, { ip });

    const now = new Date();
    const entry = {
        id: crypto.randomUUID(),
        ip,
        net,
        reason,
        createdAt: now.toISOString(),
        createdBy: who,
        // The same ban in the new words (see the header): the network, soft, for ever.
        kind: "net",
        value: net,
        level: "soft",
        until: null,
        by: who,
        at: now
    };
    await audit(event, "POST", `ban net:${net} (from ${ip}) soft permanent`);
    try {
        await bans.insertOne({ ...entry });
    } catch (e) {
        if (e.code === 11000) return json(409, { error: "That IP is already banned" });
        throw e;
    }
    Bans.invalidate();
    const [row] = await rowsFor(db, [entry], true);
    return json(201, row);
}

// Ended cool-downs on the same target, out of the way of a new ban (and of
// the unique index on ip). An active one never reaches here.
async function clearEnded(bans, filter) {
    try {
        const old = await bans.find(filter, { projection: { _id: 0, id: 1, until: 1 } }).toArray();
        const ended = old.filter(d => !Bans.isActive(d) && d.id).map(d => d.id);
        if (ended.length) await bans.deleteMany({ id: { $in: ended } });
    } catch (e) {
        console.warn("bans: could not clear ended cool-downs", e.message);
    }
}

/* ---- POST { kind, ... }: the new ban ---- */
async function createNew(event, db, bans, body, reason, who) {
    let kind = body.kind;
    if (!Bans.KINDS.includes(kind)) return json(400, { error: "kind is player, ip, net or nethash." });
    if (!Bans.LEVELS.includes(body.level)) return json(400, { error: "level is soft or full." });
    const end = endOf(body);
    if (end.error) return json(400, { error: end.error });

    const value = text(body.value).trim();
    const playerId = text(body.playerId).trim();
    let target = null;
    let fromPlayer = null;

    if (kind === "player") {
        const id = value || playerId;
        if (!ID_SHAPE.test(id)) return json(400, { error: "Which player? Send their Discord id." });
        target = id;
    } else if (kind === "ip" || kind === "net") {
        const t = targetOf(value);
        if (!t) return json(400, { error: "Send an IP address or an IPv6 /64." });
        // A /64 is a network, whatever it was sent as; a "net" ban on an
        // address is on that address's network.
        if (t.net || kind === "net") {
            kind = "net";
            target = t.net || subscriberOf(t.ip);
        } else {
            target = t.ip;
        }
    } else {
        // nethash: from a player's stored code, or a code given outright.
        if (playerId) {
            if (!ID_SHAPE.test(playerId)) return json(400, { error: "Which player? Send their Discord id." });
            const row = await db.collection("players").findOne({ id: playerId }, { projection: { _id: 0, netHash: 1 } });
            if (!row) return json(404, { error: "No player by that id." });
            if (typeof row.netHash !== "string" || !row.netHash) {
                return json(409, { error: "There's no network on file for this player yet. It's stored the next time they sign in or load a page.", noNetHash: true });
            }
            target = row.netHash;
            fromPlayer = playerId;
        } else if (HASH_SHAPE.test(value)) {
            target = value;
        } else {
            return json(400, { error: "Send the player's Discord id as playerId." });
        }
    }

    /* The same target, old documents included: an address is also held by
       any document with that `ip`, a network by any with that `net` (the
       old ones, and the old POST's). */
    const sameTarget = kind === "ip" ? { $or: [{ kind, value: target }, { ip: target }] }
        : kind === "net" ? { $or: [{ kind, value: target }, { net: target }] }
        : { kind, value: target };
    const existing = await bans.find(sameTarget, { projection: { _id: 0 } }).toArray();
    const live = existing.find(d => Bans.isActive(d));
    if (live) return ALREADY(live.id);
    await clearEnded(bans, sameTarget);

    const now = new Date();
    const doc = {
        id: crypto.randomUUID(),
        kind,
        value: target,
        level: body.level,
        until: end.until,
        reason,
        by: who,
        at: now,
        // The old fields, so the old list and DELETE ?ip= still see it.
        createdAt: now.toISOString(),
        createdBy: who
    };
    if (kind === "ip") doc.ip = target;
    if (kind === "net") doc.net = target;
    if (fromPlayer) doc.playerId = fromPlayer;

    const shown = kind === "nethash" ? `nethash${fromPlayer ? ` of player ${fromPlayer}` : ""}` : `${kind}:${target}`;
    await audit(event, "POST", `ban ${shown} ${body.level} ${end.until ? "until " + end.until.toISOString() : "permanent"}`);
    try {
        await bans.insertOne({ ...doc });
    } catch (e) {
        if (e.code === 11000) return ALREADY(null);
        throw e;
    }
    Bans.invalidate();
    const [row] = await rowsFor(db, [doc], true);
    return json(201, row);
}

/* ---- PUT { id, level?, until?, duration?, reason? } ---- */
async function edit(event, db, bans, body, who) {
    const id = text(body.id);
    if (!id) return json(400, { error: "Which ban? Send its id." });
    const $set = {};
    if (body.level !== undefined) {
        if (!Bans.LEVELS.includes(body.level)) return json(400, { error: "level is soft or full." });
        $set.level = body.level;
    }
    if (body.until !== undefined || (body.duration !== undefined && body.duration !== null)) {
        const end = endOf(body);
        if (end.error) return json(400, { error: end.error });
        $set.until = end.until;
    }
    if (body.reason !== undefined) {
        if (typeof body.reason !== "string") return json(400, { error: "reason is text." });
        const reason = body.reason.trim();
        if (reason.length > REASON_MAX) return json(400, { error: `Reason is too long — keep it under ${REASON_MAX} characters` });
        $set.reason = reason;
    }
    if (!Object.keys($set).length) return json(400, { error: "Nothing to change." });

    const before = await bans.findOne({ id }, { projection: { _id: 0 } });
    if (!before) return json(404, { error: "Ban not found" });
    const said = Object.entries($set).map(([k, v]) => `${k}=${v instanceof Date ? v.toISOString() : v === null ? "permanent" : k === "reason" ? "…" : v}`).join(" ");
    await audit(event, "PUT", `edit ${id}: ${said}`);
    $set.editedBy = who;
    $set.editedAt = new Date();
    await bans.updateOne({ id }, { $set });
    Bans.invalidate();
    const after = await bans.findOne({ id }, { projection: { _id: 0 } });
    const [row] = await rowsFor(db, [after || before], true);
    return json(200, row);
}

// For the tests.
exports.targetOf = targetOf;
exports.endOf = endOf;
exports._resetForTests = () => { banIndexing = null; backfilled = false; };

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("bans", exports.handler);

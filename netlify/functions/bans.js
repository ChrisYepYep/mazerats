/* /.netlify/functions/bans — admin-only list of banned contact-form IPs.
   Every method here is behind the same x-admin-token gate as the
   GET/DELETE half of contact.js: unlike rooms/events/contributors there is
   no public half at all, since a visitor has no business knowing whether
   an address is banned (see the silent-accept in contact.js for why that
   matters). The ban check itself lives in contact.js and dead-end-leads.js,
   through isBanned in _net.js — this function only manages the list.

   BANNED BY NETWORK. A ban used to hold only the address an admin typed,
   and was matched against that exact address — which on IPv6 banned one
   address out of the eighteen quintillion the sender's /64 holds, and the
   next message came from the one beside it. Each ban now also stores `net`,
   the subscriber that address belongs to (subscriberOf in _net.js: the /64
   for IPv6, the address itself for IPv4), and a caller matches if EITHER
   their address or their network is on the list. `ip` stays exactly what it
   was, so the ban list in Warren reads and shows the same rows. */
const crypto = require("crypto");
const { getDb, ensureUniqueIndex, ensureIndex } = require("./_db");
const { hasAccount, canWrite, refuseWrite, roleOf, WRITE_SCOPES, usernameFromToken, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { subscriberOf } = require("./_net");
const { SECURITY_HEADERS } = require("./_headers");

/* The one-ban-per-address index, asked for once per warm instance and never
   allowed to block a ban.

   This used to be ensureUniqueIndex inside the POST, awaited bare — so a
   build that failed (duplicate addresses already stored would stop it) threw
   out of every ban from then on, and since ensureUniqueIndex only remembers
   successes, it was retried and failed again on every single request. The
   ban list could no longer be added to at all, over an index. Now it is
   tried once, logged if it fails, and the insert carries on without it —
   the same bargain auth.js's ensureUsernameIndex makes: a duplicate ban is
   untidy, a ban that cannot be made is a hole. */
let banIndexing = null;
function ensureBanIndex(bans) {
    if (!banIndexing) {
        banIndexing = ensureUniqueIndex(bans, "ip").catch(e => {
            console.error("bans: unique index on bans.ip unavailable", e);
        }).then(() => ensureIndex(bans, { net: 1 })).catch(() => {});
    }
    return banIndexing;
}

/* Bans made before `net` existed get one, once per warm instance, the first
   time the list is opened. Until then they still match their exact address,
   as they always did; this only widens an IPv6 one to its /64. The list is
   a handful of rows, so reading the lot is nothing. Never allowed to fail
   the request it rides on. */
let netsBackfilled = false;
async function backfillNets(bans) {
    if (netsBackfilled) return;
    netsBackfilled = true;
    try {
        const old = await bans.find({ net: { $exists: false } }, { projection: { _id: 1, ip: 1 } }).toArray();
        for (const b of old) {
            if (typeof b.ip === "string" && b.ip.trim()) {
                await bans.updateOne({ _id: b._id }, { $set: { net: subscriberOf(b.ip) } });
            }
        }
    } catch (e) {
        netsBackfilled = false;
        console.warn("bans: could not backfill networks", e.message);
    }
}

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

const REASON_MAX = 200;

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
       and canWrite now throw when the account lookup itself cannot be made
       (see lookUpRole in _auth.js), which must come back as a 503 the admin
       page retries, not a 401 that signs it out. */
    try {
        return await handle(event, bans);
    } catch (e) {
        console.error("bans: request failed", e);
        /* Only the tagged lookup failure is an outage to retry; anything
           else is a fault, and answering it as "unavailable" hid it. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return json(500, { error: "Something went wrong with that request." });
    }
};

async function handle(event, bans) {
    // hasAccount, not just a valid token: the ban list is a list of IP
    // addresses, and a deleted account's token should not keep reading it.
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    await backfillNets(bans);

    // Reading the ban list is part of viewing the admin page, so it stops at
    // the check above. Everything past here changes something.
    if (event.httpMethod === "GET") {
        /* The addresses themselves only for the site scope — the rule
           dead-end-leads.js and contact.js draw. A viewer or an atlas
           account can see that bans exist, why, and who made them; a list
           of people's IP addresses is for the accounts that can act on it.
           Through roleOf, not canWrite: this is a read, and canWrite writes
           the action log. */
        const role = await roleOf(event);
        const full = (WRITE_SCOPES[role] || []).includes("site");
        // `net` goes with `ip`: the /64 is an address too, near enough.
        const all = await bans.find({}, { projection: full ? { _id: 0 } : { _id: 0, ip: 0, net: 0 } }).sort({ createdAt: -1 }).toArray();
        return json(200, all);
    }

    // canWrite, not isAuthorized: a viewer is a real logged-in account and
    // passes isAuthorized quite correctly — it just isn't allowed to change
    // anything. See _auth.js. refuseWrite words the refusal, and answers a
    // deleted account's token with the 401 it has earned.
    if (!(await canWrite(event))) return await refuseWrite(event);

    if (event.httpMethod === "POST") {
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }
        // "null" parses too, and body.ip then threw — a 500 for a request
        // that is only malformed.
        if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });

        const ip = text(body.ip).trim();
        const reason = text(body.reason).trim();
        if (!ip) return json(400, { error: "A ban needs an IP address" });
        if (reason.length > REASON_MAX) {
            return json(400, { error: `Reason is too long — keep it under ${REASON_MAX} characters` });
        }

        // One ban per address, enforced by Mongo rather than a
        // check-then-insert — same reasoning as rooms.js/contributors.js,
        // except here a collision is simply "already banned" and there is
        // no second id to fall back to, so it reports that plainly. See
        // ensureBanIndex for why a failed build no longer stops the ban.
        await ensureBanIndex(bans);
        /* Already covered by its network counts as already banned too: a
           second address from a /64 that is on the list adds nothing, and
           a second row would only mean two to lift later. */
        const net = subscriberOf(ip);
        if (await bans.findOne({ $or: [{ ip }, { net }] }, { projection: { _id: 1 } })) {
            return json(409, { error: "That IP is already banned" });
        }

        const entry = {
            id: crypto.randomUUID(),
            ip,
            net,
            reason,
            createdAt: new Date().toISOString(),
            createdBy: usernameFromToken(event) || ""
        };

        try {
            await bans.insertOne({ ...entry });
        } catch (e) {
            if (e.code === 11000) return json(409, { error: "That IP is already banned" });
            throw e;
        }
        return json(201, entry);
    }

    if (event.httpMethod === "DELETE") {
        // Accepts either handle: id for the Unban button on a listed ban,
        // ip for unbanning straight from a contact message (where the id
        // of the ban itself isn't to hand).
        const params = event.queryStringParameters || {};
        const id = text(params.id);
        const ip = text(params.ip).trim();
        if (!id && !ip) return json(400, { error: "Missing ban id or ip" });

        /* By address, EVERY ban that address is caught by: its own, and
           one on its network. A message's sender can be banned by a row for
           a different address in the same /64 now, and "Unban" on that
           message has to lift what is actually stopping them, or it
           answers 404 and they stay banned. */
        const result = id
            ? await bans.deleteOne({ id })
            : await bans.deleteMany({ $or: [{ ip }, { net: subscriberOf(ip) }] });
        if (result.deletedCount === 0) return json(404, { error: "Ban not found" });
        return json(200, { deleted: id || ip });
    }

    return json(405, { error: "Method not allowed" });
}

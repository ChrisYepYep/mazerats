/* /.netlify/functions/bans — admin-only list of banned contact-form IPs.
   Every method here is behind the same x-admin-token gate as the
   GET/DELETE half of contact.js: unlike rooms/events/contributors there is
   no public half at all, since a visitor has no business knowing whether
   an address is banned (see the silent-accept in contact.js for why that
   matters). The ban check itself lives in contact.js — this function only
   manages the list. */
const crypto = require("crypto");
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, canWrite, usernameFromToken, UNAUTHORIZED, READ_ONLY } = require("./_auth");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

const REASON_MAX = 200;

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const bans = db.collection("bans");

    if (!isAuthorized(event)) return UNAUTHORIZED;

    // Reading the ban list is part of viewing the admin page, so it stops at
    // isAuthorized above. Everything past here changes something.
    if (event.httpMethod === "GET") {
        const all = await bans.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
        return json(200, all);
    }

    // canWrite, not isAuthorized: a viewer is a real logged-in account and
    // passes isAuthorized quite correctly — it just isn't allowed to change
    // anything. See _auth.js.
    if (!(await canWrite(event))) return READ_ONLY;

    if (event.httpMethod === "POST") {
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }

        const ip = (body.ip || "").trim();
        const reason = (body.reason || "").trim();
        if (!ip) return json(400, { error: "A ban needs an IP address" });
        if (reason.length > REASON_MAX) {
            return json(400, { error: `Reason is too long — keep it under ${REASON_MAX} characters` });
        }

        // One ban per address, enforced by Mongo rather than a
        // check-then-insert — same reasoning as rooms.js/contributors.js,
        // except here a collision is simply "already banned" and there is
        // no second id to fall back to, so it reports that plainly.
        await ensureUniqueIndex(bans, "ip");

        const entry = {
            id: crypto.randomUUID(),
            ip,
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
        const id = params.id;
        const ip = params.ip;
        if (!id && !ip) return json(400, { error: "Missing ban id or ip" });

        const result = await bans.deleteOne(id ? { id } : { ip: ip.trim() });
        if (result.deletedCount === 0) return json(404, { error: "Ban not found" });
        return json(200, { deleted: id || ip });
    }

    return json(405, { error: "Method not allowed" });
};

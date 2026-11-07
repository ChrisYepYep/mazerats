/* /.netlify/functions/hallway-progress — what a signed-in player has found in
   the Hallway, kept against their account so they can carry on from any
   device (7 Nov 2026, the owner's: "guests save in the browser; signed-in save
   to their account"). Guests never come here: hallway progress stays in their
   browser, and is merged in here the first time they sign in.

   GET   { scraps: [id, ...], key: bool, lost: { day, streak, shelf: [...] }, hunts: { id: { found: [...], done } } }
   POST  the same shape, or any part of it. It only ever adds: scraps and found
         clues are added to, the key can't be lost, a hunt can't be un-finished,
         and an older Lost Property day can't overwrite a newer one. So two
         devices, or a guest's browser signing in, can't undo anything.

   One document per player, in `hallway_progress`. This is the player's own
   record and nothing is ranked from it: anything that does rank (a hunt's
   finishing order) has to be decided on the server, not read from here.

   Signed in, with a live session, and not banned: the same gate every player
   write goes through (writeRefusal in _bans.js). */
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom, sessionRevoked } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
const { writeRefusal } = require("./_bans");

const COLLECTION = "hallway_progress";
const MAX_BODY = 16 * 1024;
const MAX_LIST = 400;
const ID = /^[\w .:'-]{1,60}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

/* The request came from this site: player-data.js's check. */
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

const ids = (list) => (Array.isArray(list) ? [...new Set(list.filter((s) => typeof s === "string" && ID.test(s)))].slice(0, MAX_LIST) : []);

const view = (doc) => {
    const d = doc || {};
    const lost = d.lost || {};
    return {
        scraps: ids(d.scraps),
        key: d.key === true,
        lost: { day: DAY.test(lost.day || "") ? lost.day : "", streak: Number.isInteger(lost.streak) && lost.streak > 0 ? lost.streak : 0, shelf: ids(lost.shelf) },
        hunts: d.hunts && typeof d.hunts === "object" ? d.hunts : {}
    };
};

/* What's in the request, and nothing else. Anything malformed is left out
   rather than refused, so one bad field can't lose the rest. */
function cleanBody(body) {
    const out = { scraps: ids(body.scraps), key: body.key === true, lost: null, hunts: {} };
    const l = body.lost;
    if (l && typeof l === "object" && DAY.test(l.day || "") && Number.isInteger(l.streak) && l.streak >= 0 && l.streak < 100000) out.lost = { day: l.day, streak: l.streak, shelf: ids(l.shelf) };
    if (body.hunts && typeof body.hunts === "object" && !Array.isArray(body.hunts)) {
        for (const [id, h] of Object.entries(body.hunts).slice(0, 50)) {
            if (!ID.test(id) || id.includes(".") || !h || typeof h !== "object") continue;
            out.hunts[id] = { found: ids(h.found), done: h.done === true };
        }
    }
    return out;
}

/* The update for what's been sent: each part can only move forwards. */
function mergeInto(doc, clean) {
    const was = view(doc);
    const next = {
        scraps: [...new Set([...was.scraps, ...clean.scraps])].slice(0, MAX_LIST),
        key: was.key || clean.key,
        lost: was.lost,
        hunts: { ...was.hunts }
    };
    if (clean.lost && clean.lost.day >= was.lost.day) {
        next.lost = { day: clean.lost.day, streak: clean.lost.streak, shelf: [...new Set([...was.lost.shelf, ...clean.lost.shelf])].slice(0, MAX_LIST) };
    } else if (clean.lost) {
        next.lost = { ...was.lost, shelf: [...new Set([...was.lost.shelf, ...clean.lost.shelf])].slice(0, MAX_LIST) };
    }
    for (const [id, h] of Object.entries(clean.hunts)) {
        const old = was.hunts[id] || { found: [], done: false };
        next.hunts[id] = { found: [...new Set([...(old.found || []), ...h.found])].slice(0, MAX_LIST), done: old.done === true || h.done };
        if (old.place) next.hunts[id].place = old.place;
    }
    return next;
}

async function handler(event) {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (event.httpMethod === "POST") {
        if (!sameOrigin(event)) return json(403, { error: "Not from this site" });
        if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    }
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("hallway-progress: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    /* As advent.js: a failed players read must not look like being signed out. */
    const player = playerFrom(event);
    if (!player) return json(401, { error: "Not signed in" });
    let row;
    try {
        row = await db.collection("players").findOne({ id: String(player.id) }, { projection: { _id: 0, sv: 1, svStrict: 1 } });
    } catch (e) {
        console.error("hallway-progress: could not read the players row", e);
        return json(503, { error: "Your progress couldn't be reached just now" });
    }
    if (sessionRevoked(player, row)) return json(401, { error: "Not signed in" });

    const col = db.collection(COLLECTION);
    if (event.httpMethod === "GET") {
        try {
            return json(200, view(await col.findOne({ playerId: player.id }, { projection: { _id: 0 } })));
        } catch (e) {
            console.error("hallway-progress: read failed", e);
            return json(500, { error: "Couldn't read your progress" });
        }
    }

    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });
    const refusal = await writeRefusal(db, event, player.id);
    if (refusal) return refusal;

    const clean = cleanBody(body);
    try {
        await ensureUniqueIndex(col, ["playerId"]);
    } catch (e) {
        console.error("hallway-progress: unique index unavailable", e);
        return json(503, { error: "Couldn't save just now" });
    }
    /* Read, merge, write only if nobody else has written since: two tabs saving
       at once retry against each other instead of one losing its scrap. */
    try {
        for (let tries = 0; tries < 4; tries++) {
            const doc = await col.findOne({ playerId: player.id }, { projection: { _id: 0 } });
            const next = mergeInto(doc, clean);
            /* your place in a hunt is decided here, the moment you first finish it */
            for (const [id, h] of Object.entries(clean.hunts)) { const was = doc && doc.hunts && doc.hunts[id]; if (h.done && !(was && was.done)) next.hunts[id].place = (await col.countDocuments({ ["hunts." + id + ".done"]: true })) + 1; }
            const rev = (doc && doc.rev) || 0;
            const set = { ...next, rev: rev + 1, updatedAt: new Date().toISOString() };
            try {
                const r = await col.updateOne(doc ? { playerId: player.id, rev } : { playerId: player.id, rev: { $exists: false } }, { $set: set }, { upsert: !doc });
                if (r.matchedCount || r.upsertedCount) return json(200, view(next));
            } catch (e) {
                if (!(e && e.code === 11000)) throw e;
            }
        }
        return json(409, { error: "Too many saves at once" });
    } catch (e) {
        console.error("hallway-progress: save failed", e);
        return json(500, { error: "Couldn't save your progress" });
    }
}

exports.handler = handler;
exports._for = { cleanBody, mergeInto, view };

/* Failures reported to /warren's Errors tab, and the site-wide rate limit:
   see withErrorReporting in _errors.js. */
exports.handler = require("./_errors").withErrorReporting("hallway-progress", exports.handler);

/* /.netlify/functions/palettes — the recolour engine's saved presets.

   GET                      every preset, for the editor and for the site
   GET ?id=slug             one, which is what a visitor wearing it fetches
   POST   {name, palette}   create, admin
   PUT    {id, ...}         update or rename, admin
   DELETE ?id=slug          remove, admin

   ----------------------------------------------------------------------
   WHAT A PRESET IS, AND WHAT IT DELIBERATELY IS NOT

   It is two flat maps of what CHANGED — a variable name to a colour, a
   scanned declaration key to a colour — plus two anchor colours per sprite
   group. Nothing else. It is not a stylesheet and it holds no images.

   That is what keeps it small enough to be worth storing and readable enough
   to be worth diffing, but the real reason is forward compatibility: a preset
   that listed every colour would be a snapshot of style.css on the day it was
   saved, and would start fighting the site the moment a rule was edited.
   Listing only the differences means a colour nobody touched keeps whatever
   the stylesheet says today, and a preset saved last year still works against
   a stylesheet that has gained fifty rules since.

   The art is rebuilt from the anchors in the browser on load, so there are no
   generated PNGs here to store, serve, invalidate or forget to clean up.

   ----------------------------------------------------------------------
   THE VALUES ARE CHECKED, not trusted

   Everything in a preset ends up inside a <style> element on every visitor's
   page, which is the one place where an unchecked string is worth being
   careful about. A colour that does not parse as a colour is dropped rather
   than stored, and a key that does not look like a scanned key is dropped
   with it — so a preset cannot carry `}` out of its declaration and start
   writing rules of its own. */
const { getDb } = require("./_db");
const { isAuthorized, canWrite, refuseWrite, usernameFromToken, UNAUTHORIZED } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson } = require("./_cache");

const COLLECTION = "palettes";
const MAX_NAME = 60;
const MAX_ENTRIES = 1200;          // the whole stylesheet is ~300; this is slack, not a target

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    body: JSON.stringify(data)
});

/* #abc, #aabbcc, #aabbccdd, rgb() and rgba() — the forms the engine emits and
   nothing else. Anything with a brace, a semicolon or a url() in it is not a
   colour and has no business in a stylesheet this builds. */
const COLOUR = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$/;
const VAR_NAME = /^--[a-z0-9-]{1,60}$/i;
/* A scanned key is "property|colour" and both halves are already constrained.
   Checked rather than assumed, because this is the string that becomes a
   property name in generated CSS. */
const DECL_KEY = /^[a-z-]{1,40}\|[#a-z0-9(),.%\s-]{1,80}$/i;

const slug = (s) => String(s || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function cleanMap(raw, keyTest) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    let n = 0;
    for (const k of Object.keys(raw)) {
        if (n >= MAX_ENTRIES) break;
        const v = String(raw[k] == null ? "" : raw[k]).trim();
        if (!keyTest.test(k) || !COLOUR.test(v)) continue;
        out[k] = v;
        n++;
    }
    return out;
}

function cleanSprites(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const g of Object.keys(raw).slice(0, 24)) {
        if (!/^[a-z0-9-]{1,24}$/i.test(g)) continue;
        const v = raw[g] || {};
        const dark = String(v.dark || "").trim(), light = String(v.light || "").trim();
        if (!COLOUR.test(dark) || !COLOUR.test(light)) continue;
        out[g] = { dark, light };
    }
    return out;
}

const clean = (doc) => ({
    id: doc.id,
    name: doc.name,
    palette: doc.palette || { vars: {}, decls: {}, sprites: {} },
    basedOn: doc.basedOn || null,
    at: doc.at,
    updatedAt: doc.updatedAt || doc.at,
    by: doc.by || null
});

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("palettes: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const col = db.collection(COLLECTION);
    const params = event.queryStringParameters || {};

    /* PUBLIC, because the site has to be able to fetch the palette it is
       wearing before it can paint anything. There is nothing private in one:
       it is a list of colours, and every one of them is on screen anyway. */
    if (event.httpMethod === "GET") {
        try {
            if (params.id) {
                const one = await col.findOne({ id: slug(params.id) }, { projection: { _id: 0 } });
                /* Through the edge, on the archive's own policy. Every visitor
                   wearing a palette asks for it on every page, and it was the
                   one per-page public read still going to Mongo each time. A
                   minute's staleness after an edit is the same promise rooms
                   and events make (see _cache.js). The 404 is not cached, so a
                   palette created a moment ago is not hidden behind one. */
                return one ? cachedJson(event, clean(one)) : json(404, { error: "No palette by that name." });
            }
            const all = await col.find({}, { projection: { _id: 0 } }).sort({ at: 1 }).toArray();
            return json(200, { count: all.length, palettes: all.map(clean) });
        } catch (e) {
            console.error("palettes: read failed", e);
            return json(503, { error: "Palettes could not be read just now." });
        }
    }

    /* Returned as they are, not wrapped in json().

       UNAUTHORIZED and READ_ONLY from _auth.js are already whole responses
       — statusCode, headers and a JSON body. Passing one to json() put the
       entire response object INTO the body, so this endpoint answered 401
       with {"statusCode":401,"headers":{…}} where every other endpoint
       answers {"error":"Unauthorized"}. The status was right and the
       refusal held, but a caller reading .error off it got undefined and
       would have shown an empty message. This was the only file in
       netlify/functions doing it. */
    if (!isAuthorized(event)) return UNAUTHORIZED;
    // Async, and the scope is the site-wide one a palette plainly is.
    // refuseWrite, not READ_ONLY: a wizard account is not view-only, it is
    // out of scope here, and was being told the wrong one of the two.
    if (!await canWrite(event, "site")) return await refuseWrite(event);
    const who = usernameFromToken(event);

    let body = {};
    try { body = JSON.parse(event.body || "{}"); }
    catch (e) { return json(400, { error: "Invalid request body" }); }

    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
        const name = String(body.name || "").trim().slice(0, MAX_NAME);
        if (!name) return json(400, { error: "A palette needs a name." });
        const id = slug(body.id || name);
        if (!id) return json(400, { error: "That name has no letters or numbers in it." });

        const palette = {
            vars: cleanMap(body.palette && body.palette.vars, VAR_NAME),
            decls: cleanMap(body.palette && body.palette.decls, DECL_KEY),
            sprites: cleanSprites(body.palette && body.palette.sprites)
        };

        const existing = await col.findOne({ id });
        /* A POST to a name already taken is the duplicate button's job, not a
           silent overwrite — somebody who meant to replace one sends a PUT. */
        if (event.httpMethod === "POST" && existing) {
            return json(409, { error: "There is already a palette called that." });
        }
        const now = new Date();
        const doc = {
            id, name, palette,
            basedOn: body.basedOn ? slug(body.basedOn) : (existing ? existing.basedOn : null),
            at: existing ? existing.at : now,
            updatedAt: now,
            by: who || null
        };
        await col.replaceOne({ id }, doc, { upsert: true });
        return json(existing ? 200 : 201, clean(doc));
    }

    if (event.httpMethod === "DELETE") {
        const id = slug(params.id || body.id);
        if (!id) return json(400, { error: "Which palette?" });
        const r = await col.deleteOne({ id });
        /* And if the site was wearing it, it stops. settings.palette is a
           name, not a copy (see settings.js), so deleting the live palette
           left the setting pointing at nothing: every visitor's page asked
           for it, got a 404, and the admin's selector showed a palette that
           no longer existed. Conditional on the name, so a delete can never
           clear a DIFFERENT palette someone chose in the meantime. */
        let unset = false;
        if (r.deletedCount === 1) {
            const s = await db.collection("settings").updateOne({ _id: "site", palette: id }, { $set: { palette: null } });
            unset = s.modifiedCount === 1;
        }
        return json(200, { deleted: r.deletedCount === 1, ...(unset ? { clearedLive: true } : {}) });
    }

    return json(405, { error: "Method not allowed" });
};

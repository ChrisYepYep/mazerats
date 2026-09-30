/* /.netlify/functions/palettes — the recolour engine's saved presets.

   GET                      every preset, for the editor and for the site
   GET ?id=slug             one, which is what a visitor wearing it fetches
   POST   {name, palette}   create, admin
   PUT    {id, ...}         update or rename, admin; with expectUpdatedAt,
                            refused (409) if it has been saved since
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
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, canWrite, refuseWrite, usernameFromToken, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
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

/* Trimmed AFTER the cut (30 Sept 2026). It used to trim and then cut, so a
   long name whose 40th character fell on a gap — "Halloween Pumpkin Patch at
   the Maze Rat Warren" — was stored as "...-maze-rat-", and every later
   lookup slugged the incoming id again and lost the hyphen: a 404 for every
   visitor wearing it, a 409 on save, a delete that removed nothing. */
const slug = (s) => String(s || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 40).replace(/-+$/, "");
/* An id that ARRIVES is looked up as it is when it already has the shape of a
   stored one, and only slugged when it does not. Slugging is for turning a
   name into an id; running it over an id is what broke the rows above, and
   a row saved under the old rule has to stay findable and deletable. */
const STORED_ID = /^[a-z0-9-]{1,40}$/;
const asId = (s) => STORED_ID.test(String(s || "")) ? String(s) : slug(s);
const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

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

/* `by` is an admin's username, and the reads here are public — so it went
   out to every visitor wearing a palette, and into the edge cache with it:
   a free list of the accounts worth guessing passwords for. It is only
   added for a caller that has a valid admin token (the editor), and never
   on the edge-cached ?id= read, which is shared by everybody. */
/* THE THEME A PALETTE IS WORN OVER (28 Sept 2026).

   A palette is a diff against the stylesheet that was running while it was
   edited — and that is style.css PLUS whichever built-in theme the editor's
   page was wearing at the time, because the recolour engine catalogues every
   sheet the page has loaded (see scan in js/recolour.js). So a palette made
   while the site was on Pumpkin can hold colours that only exist in
   css/theme-pumpkin.css, and every colour it does not mention is Pumpkin's.
   Worn over Classic it would be a different palette from the one on screen
   when it was saved.

   baseTheme records that theme, and the Controls panel wears the palette
   over it (settings.theme and settings.palette in one PUT — see
   js/admin.js). Rows saved before this field existed have none, and are read
   as Classic: until today the editor told anybody working over a theme to
   switch the site to Classic first, because the theme painted over its
   preview, and the built-in-theme loader in js/admin-recolour.js builds its
   copies against Classic too. So Classic is what those palettes were judged
   against.

   Shape-checked only, like basedOn. The list of themes that exist is
   VALID_THEMES in settings.js, which refuses an unknown one when the palette
   is put live; the panel falls back to Classic for a name it has no button
   for, so a stale value can never block going live. */
const THEME_NAME = /^[a-z]{1,20}$/;
const cleanTheme = (t) => THEME_NAME.test(String(t || "")) ? String(t) : null;

const clean = (doc, withBy) => ({
    id: doc.id,
    name: doc.name,
    palette: doc.palette || { vars: {}, decls: {}, sprites: {} },
    basedOn: doc.basedOn || null,
    baseTheme: cleanTheme(doc.baseTheme) || "classic",
    at: doc.at,
    updatedAt: doc.updatedAt || doc.at,
    ...(withBy ? { by: doc.by || null } : {})
});

/* The three refusals a save can meet, each given from two places — the read
   before the write and the write itself (29 Sept 2026) — so they are written
   once here and the editor sees the same words whichever one caught it. */
const DUPLICATE = { error: "There is already a palette called that." };
const DELETED = { error: "That palette has been deleted since you opened it. Use Save as new to keep your colours.", stale: true, deleted: true };
const staleAnswer = (row) => ({
    error: "Somebody saved this palette" + (row.by ? " (" + row.by + ")" : "") +
        " after you opened it. Load it again to see theirs, or use Save as new to keep yours.",
    stale: true,
    updatedAt: row.updatedAt || row.at
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
                const one = await col.findOne({ id: asId(params.id) },{ projection: { _id: 0 } });
                /* Through the edge, on the archive's own policy. Every visitor
                   wearing a palette asks for it on every page, and it was the
                   one per-page public read still going to Mongo each time. A
                   minute's staleness after an edit is the same promise rooms
                   and events make (see _cache.js). The 404 is not cached, so a
                   palette created a moment ago is not hidden behind one. */
                return one ? cachedJson(event, clean(one)) : json(404, { error: "No palette by that name." });
            }
            const all = await col.find({}, { projection: { _id: 0 } }).sort({ at: 1 }).toArray();
            const signedIn = isAuthorized(event);
            return json(200, { count: all.length, palettes: all.map(p => clean(p, signedIn)) });
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
       netlify/functions doing it.

       The write half inside one try, as the GET above is: the saves and the
       settings update had nothing around them, so a database that dropped
       mid-save answered with Lambda's stack trace — and canWrite now throws
       when the account lookup cannot be made (lookUpRole in _auth.js),
       which has to reach the editor as a 503, not the 401 that signs it
       out. */
    try {
        return await write(event, db, col, params);
    } catch (e) {
        console.error("palettes: write failed", e);
        /* Only the tagged lookup failure is an outage to retry; anything
           else is a fault, and answering it as "unavailable" hid it. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return json(500, { error: "The palette could not be saved." });
    }
};

async function write(event, db, col, params) {
    if (!isAuthorized(event)) return UNAUTHORIZED;
    // Async, and the scope is the site-wide one a palette plainly is.
    // refuseWrite, not READ_ONLY: a wizard account is not view-only, it is
    // out of scope here, and was being told the wrong one of the two.
    if (!await canWrite(event, "site")) return await refuseWrite(event);
    const who = usernameFromToken(event);

    let body = {};
    try { body = JSON.parse(event.body || "{}"); }
    catch (e) { return json(400, { error: "Invalid request body" }); }
    // "null" parses too, and has no .name to read.
    if (!body || typeof body !== "object") body = {};

    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
        const name = String(body.name || "").trim().slice(0, MAX_NAME);
        if (!name) return json(400, { error: "A palette needs a name." });
        // A PUT names a row that exists, so its id is taken as sent (asId);
        // a POST's is made from the name.
        let id = event.httpMethod === "PUT" && body.id ? asId(body.id) : slug(body.id || name);
        if (!id) return json(400, { error: "That name has no letters or numbers in it." });

        const palette = {
            vars: cleanMap(body.palette && body.palette.vars, VAR_NAME),
            decls: cleanMap(body.palette && body.palette.decls, DECL_KEY),
            sprites: cleanSprites(body.palette && body.palette.sprites)
        };

        /* THE UNIQUE INDEX ON id (29 Sept 2026). Every check below is a read
           followed by a write, and two saves in flight both read before
           either writes — so on its own "is that name taken?" answered no to
           both of two racing POSTs, and the second upsert quietly replaced
           the first. The index is what makes the answer hold: whichever
           insert lands second fails with E11000, and that is turned into the
           same 409 the read would have given (see DUPLICATE below).

           Memoised per warm instance by ensureUniqueIndex. A build that
           fails (a pair of duplicate ids already stored, say) is logged and
           NOT allowed to stop the save: the read-side checks still catch
           every save that is not an exact race, and taking the recolour
           editor down over an index would be the wrong trade three days
           before launch. The log line is how it gets noticed. */
        try { await ensureUniqueIndex(col, "id"); }
        catch (e) { console.error("palettes: unique index on id could not be built", e); }

        let existing = await col.findOne({ id });
        /* An id sent with a PUT that matches no row is about to be upserted
           into a new one, and a new row gets an id by today's rule — not a
           stray "--" or trailing hyphen that asId let through for lookup. */
        if (event.httpMethod === "PUT" && !existing && id !== slug(id)) {
            id = slug(id);
            if (!id) return json(400, { error: "That name has no letters or numbers in it." });
            existing = await col.findOne({ id });
        }
        /* A POST to a name already taken is the duplicate button's job, not a
           silent overwrite — somebody who meant to replace one sends a PUT.

           Taken means a row with that NAME, not that id (30 Sept 2026). A
           rename keeps its id, so after "Autumn" became "Harvest" the id
           "autumn" belonged to a palette nobody called Autumn any more, and a
           new Autumn was refused with "already a palette called that" for
           ever. Now a name nobody has gets the next free numbered id
           ("autumn-2") instead; only a name somebody really has is refused.
           Palettes are a few dozen rows, so the names are read whole. */
        if (event.httpMethod === "POST") {
            const rows = await col.find({}, { projection: { _id: 0, id: 1, name: 1 } }).toArray();
            if (rows.some(r => sameName(r.name, name))) return json(409, DUPLICATE);
            if (existing) {
                const taken = new Set(rows.map(r => r.id));
                let n = 2, next;
                do {
                    const tail = "-" + n++;
                    next = id.slice(0, 40 - tail.length).replace(/-+$/, "") + tail;
                } while (taken.has(next));
                id = next;
                existing = null;
            }
        }
        /* And a PUT may not RENAME onto a name another palette has (30 Sept
           2026). Only the POST asked, so Save over "Autumn" with the name
           box changed to "Harvest" — which another palette was already
           called — stored two palettes of the same name, and the Controls
           card and the loader then offered two identical buttons. The
           palette's own row is not a clash with itself. */
        if (event.httpMethod === "PUT") {
            const rows = await col.find({}, { projection: { _id: 0, id: 1, name: 1 } }).toArray();
            if (rows.some(r => r.id !== id && sameName(r.name, name))) return json(409, DUPLICATE);
        }
        /* THE STALE-WRITE CHECK (28 Sept 2026). The editor can now load any
           saved palette and save it back, which makes two admins editing the
           same one — or one admin in two tabs — an ordinary afternoon rather
           than a curiosity. A PUT replaces the whole document, so without
           this the second Save silently threw away every colour the first
           one had changed.

           So a PUT may carry the updatedAt it was loaded at, and is refused
           when the stored one has moved on since; the editor keeps its
           colours in memory and offers "Save as new". Optional, so an older
           caller (or an import script) that sends none still saves as it
           always did. A palette DELETED since it was loaded is refused the
           same way, rather than quietly upserted back into existence under a
           name somebody had just removed. Legacy rows with no updatedAt are
           compared on `at`, which is what clean() has always reported as
           their updatedAt. */
        const checked = event.httpMethod === "PUT" && !!body.expectUpdatedAt;
        if (checked) {
            const expected = new Date(body.expectUpdatedAt).getTime();
            if (!existing) return json(409, DELETED);
            const stored = existing.updatedAt || existing.at;
            if (stored && !isNaN(expected) && new Date(stored).getTime() !== expected) {
                return json(409, staleAnswer(existing));
            }
        }
        const now = new Date();
        const doc = {
            id, name, palette,
            basedOn: body.basedOn ? asId(body.basedOn) :(existing ? existing.basedOn : null),
            // Sent by the editor on every save; an older caller that sends
            // none keeps what the row had (see THE THEME A PALETTE IS WORN
            // OVER, above).
            baseTheme: cleanTheme(body.baseTheme) || (existing ? cleanTheme(existing.baseTheme) : null),
            at: existing ? existing.at : now,
            updatedAt: now,
            by: who || null
        };
        /* THE WRITE ITSELF IS THE CHECK (29 Sept 2026). The stale-write check
           above compares against a row read a moment ago, and then the save
           used to replace unconditionally — so two admins who loaded the
           same version and pressed Save together both passed the comparison
           and both "won", the second silently throwing away the first's
           colours: the very thing the check exists to stop.

           So a checked PUT now writes only if the row is STILL at the version
           it was read at: the filter carries the stored updatedAt (or, for a
           legacy row that has none, the absence of one plus its `at`), and a
           write that matches nothing lost the race and gets the same 409 as
           a stale load. One document, one update, so Mongo decides the winner
           atomically. It is an updateOne of every field rather than a
           replaceOne because `doc` IS every field a palette row has (the
           palette maps are $set whole, so a colour removed in the editor is
           removed here too) — and $set cannot touch _id, which a replace
           would have to be careful about.

           A POST inserts rather than upserts, so the unique index can refuse
           the loser of two racing creations; an unchecked PUT (an old caller,
           an import script) upserts as it always has, and the index turns a
           racing creation there into the same 409. */
        try {
            if (event.httpMethod === "POST") {
                await col.insertOne({ ...doc });
            } else if (checked) {
                const version = existing.updatedAt
                    ? { updatedAt: existing.updatedAt }
                    : { updatedAt: { $exists: false }, at: existing.at != null ? existing.at : null };
                const r = await col.updateOne({ id, ...version }, { $set: doc });
                if (!r || r.matchedCount !== 1) {
                    const now2 = await col.findOne({ id });
                    return json(409, now2 ? staleAnswer(now2) : DELETED);
                }
            } else {
                await col.replaceOne({ id }, doc, { upsert: true });
            }
        } catch (e) {
            if (e && e.code === 11000) return json(409, DUPLICATE);
            throw e;
        }
        return json(existing ? 200 : 201, clean(doc, true));
    }

    if (event.httpMethod === "DELETE") {
        const id = asId(params.id || body.id);
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
}

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("palettes", exports.handler);

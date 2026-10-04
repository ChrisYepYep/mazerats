/* /.netlify/functions/whats-new — the hand-made part of What's New.
   (4 Oct 2026, the owner's.)

   What's New is drawn by js/home.js from the archive itself — every maze,
   event and guide on the day it was added or last edited, with a line of
   what changed (netlify/functions/_changes.js). This is what the admins add
   to that and change about it, from the Warren's What's New panel
   (js/admin-whats-new.js). One collection, `whats_new`, two kinds of row:

   POSTS — entries of their own:
     { id, type: "post", kind: "news" | "note", day: "YYYY-MM-DD",
       title, text, image, link, target, createdAt, updatedAt }
       news   site news: a title, a few lines, an optional picture
              (uploaded to the "news/" image folder) and an optional link
       note   a line about a maze or event already in the archive; `target`
              names it ("maze:<id>" / "event:<id>", recordKey in js/home.js)
              and the entry opens it

   OVERRIDES — changes to one automatic entry, keyed by the entry it
   changes ("maze:<id>", "event:<id>", "guide:<id>"):
     { id: "o:" + target, type: "override", target,
       hidden, day, activity: "added" | "updated", text, updatedAt }
       hidden    off What's New altogether
       day       filed under this day instead
       activity  labelled Added or Updated, whatever the dates say
       text      this line instead of the automatic "what changed" one
     An override with nothing left in it is deleted rather than kept empty.

   GET          { posts, overrides } for everybody, through the edge as rooms
                and events are (cachedJson); ?full=1 for a Warren account
                skips the edge, so the panel reads its own save straight away.
   POST         a new post                         (body: the post)
   PUT          an edited post                     (body: the post, with id)
                or an override                     (body: { override: {...} })
   DELETE ?id=  a post, or an override ("o:maze:...")
   Every write needs a Warren account with the "site" scope (canWrite). */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, hasAccount, canWrite, refuseWrite, AUTH_UNAVAILABLE, isAuthUnavailable, UNAUTHORIZED } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson } = require("./_cache");

const COLLECTION = "whats_new";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TARGET = /^(maze|event|guide):[^\s]{1,200}$/;
const NOTE_TARGET = /^(maze|event):[^\s]{1,200}$/;
const TITLE_MAX = 120;
const TEXT_MAX = 600;
const URL_MAX = 400;
const MAX_BODY = 16 * 1024;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

/* A real calendar day, and a sensible one (4 Oct 2026, the bug scan): from
   2024, before the archive's oldest records, to a month ahead. A post dated
   in 9999 sat at the top of the log for good and kept the side menu's
   "lately" count up. */
const realDay = s => {
    if (typeof s !== "string" || !DAY.test(s)) return false;
    const d = new Date(s + "T12:00:00Z");
    if (isNaN(d) || d.toISOString().slice(0, 10) !== s) return false;
    const ahead = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
    return s >= "2024-01-01" && s <= ahead;
};
const text = (v, max) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");

/* A picture: one uploaded to this site's image store, or an https address.
   A link: a path on this site ("/guides", "/maze/alt-maze") or an https
   address. Anything else is refused rather than stored and later drawn. */
function okImage(v) {
    if (v === "" || v == null) return "";
    if (typeof v !== "string" || v.length > URL_MAX) return null;
    if (/^\/\.netlify\/functions\/image\?key=[\w./%-]+$/.test(v)) return v;
    // Only this site's own uploads (4 Oct 2026): the page's Content Security
    // Policy would block a picture from most other sites anyway.
    return null;
}
function okLink(v) {
    if (v === "" || v == null) return "";
    if (typeof v !== "string" || v.length > URL_MAX) return null;
    /* A path on this site — never "/\host", which a browser reads as another
       site (4 Oct 2026, the bug scan): no backslash anywhere. */
    if (/^\/(?![/\\])[^\s"'<>\\]*$/.test(v)) return v;
    if (/^https:\/\/[^\s"'<>]+$/.test(v)) return v;
    return null;
}

// A post's fields, checked. { fields } or { error }.
function cleanPost(b) {
    const kind = b.kind === "note" ? "note" : b.kind === "news" ? "news" : null;
    if (!kind) return { error: "A post is either news or a note." };
    if (!realDay(b.day)) return { error: "The date has to be a real day (YYYY-MM-DD)." };
    /* hidden: off the log without being deleted (4 Oct 2026, the owner's:
       every entry can be hidden on its own, posts as well as the automatic
       ones). */
    const out = { kind, day: b.day, text: text(b.text, TEXT_MAX), hidden: b.hidden === true };
    if (kind === "news") {
        out.title = text(b.title, TITLE_MAX);
        if (!out.title) return { error: "News needs a title." };
        const image = okImage(b.image);
        if (image === null) return { error: "That picture address can't be used." };
        const link = okLink(b.link);
        if (link === null) return { error: "A link is a path on this site (/guides) or an https:// address." };
        out.image = image;
        out.link = link;
        out.target = "";
    } else {
        if (typeof b.target !== "string" || !NOTE_TARGET.test(b.target)) return { error: "Choose the maze or event the note is about." };
        if (!out.text) return { error: "A note needs some text." };
        out.target = b.target;
        out.title = "";
        out.image = "";
        out.link = "";
    }
    return { fields: out };
}

// An override's fields, checked. { fields, empty } or { error }.
function cleanOverride(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "Invalid override" };
    if (typeof o.target !== "string" || !TARGET.test(o.target)) return { error: "Unknown entry" };
    const fields = { target: o.target };
    if (o.hidden === true) fields.hidden = true;
    if (o.day != null && o.day !== "") {
        if (!realDay(o.day)) return { error: "The date has to be a real day (YYYY-MM-DD)." };
        fields.day = o.day;
    }
    if (o.activity === "added" || o.activity === "updated") fields.activity = o.activity;
    const t = text(o.text, TEXT_MAX);
    if (t) fields.text = t;
    const empty = !fields.hidden && !fields.day && !fields.activity && !fields.text;
    return { fields, empty };
}

function newId(day) {
    return `p-${day}-${Math.random().toString(36).slice(2, 8)}`;
}

async function read(col) {
    const rows = await col.find({}, { projection: { _id: 0 } }).toArray();
    return {
        posts: rows.filter(r => r.type === "post").sort((a, b) => String(b.day).localeCompare(String(a.day))),
        overrides: rows.filter(r => r.type === "override")
    };
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(503, { error: "Database connection failed" });
    }
    const col = db.collection(COLLECTION);

    if (event.httpMethod === "GET") {
        try {
            const full = (event.queryStringParameters || {}).full === "1";
            if (full && !(await hasAccount(event))) {
                return { statusCode: 302, headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store", Location: "/.netlify/functions/whats-new" }, body: "" };
            }
            const data = await read(col);
            if (full) return json(200, data);
            return cachedJson(event, data, { vary: "full" });
        } catch (e) {
            if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
            console.error("whats-new: read failed", e);
            return json(503, { error: "What's New could not be read just now." });
        }
    }

    try {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await canWrite(event))) return await refuseWrite(event);
        if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });

        if (event.httpMethod === "DELETE") {
            const id = String((event.queryStringParameters || {}).id || "");
            if (!id || id.length > 260) return json(400, { error: "Nothing named to delete" });
            await col.deleteOne({ id });
            return json(200, { deleted: id });
        }

        let body;
        try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });
        await ensureUniqueIndex(col, "id");
        const now = new Date().toISOString();

        // An override: set, or cleared away when nothing is left in it.
        if (event.httpMethod === "PUT" && body.override !== undefined) {
            const c = cleanOverride(body.override);
            if (c.error) return json(400, { error: c.error });
            const id = "o:" + c.fields.target;
            if (c.empty) {
                await col.deleteOne({ id });
                return json(200, { override: null, target: c.fields.target });
            }
            const row = { id, type: "override", ...c.fields, updatedAt: now };
            await col.replaceOne({ id }, row, { upsert: true });
            return json(200, { override: row });
        }

        if (event.httpMethod === "POST") {
            const c = cleanPost(body);
            if (c.error) return json(400, { error: c.error });
            const row = { id: newId(c.fields.day), type: "post", ...c.fields, createdAt: now, updatedAt: now };
            await col.insertOne({ ...row });
            return json(201, row);
        }

        if (event.httpMethod === "PUT") {
            if (typeof body.id !== "string" || !body.id.startsWith("p-")) return json(400, { error: "Missing post id" });
            const c = cleanPost(body);
            if (c.error) return json(400, { error: c.error });
            const res = await col.findOneAndUpdate(
                { id: body.id, type: "post" },
                { $set: { ...c.fields, updatedAt: now } },
                { returnDocument: "after", projection: { _id: 0 } }
            );
            if (!res) return json(404, { error: "That post has gone - reload the list." });
            return json(200, res);
        }

        return json(405, { error: "Method not allowed" });
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("whats-new: write failed", e);
        return json(500, { error: "That couldn't be saved." });
    }
};

/* Failures reported to /warren's Errors tab: see withErrorReporting in
   _errors.js. Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("whats-new", exports.handler);
// For the tests.
exports._cleanPost = cleanPost;
exports._cleanOverride = cleanOverride;

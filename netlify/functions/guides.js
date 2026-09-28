/* /.netlify/functions/guides — the Guides section's store.

   GET            the published guides, whole (they are small), for the
                  homepage's Guides window. Cached at the edge like the
                  archive.
   GET ?full=1    every guide, drafts included, for /warren. Admin only,
                  never cached.
   POST           a new guide.            } site-scope write, as rooms.js
   PUT            an edit to one.         } and events.js; a PUT carries
   DELETE ?id=    removes one.            } _baseRev (see below)

   Deleting a guide removes only its record. Its uploaded pictures are
   cleared by the /warren panel that asked for the delete (js/admin-guides.js,
   removeGuide), the same way every other replaced or dropped guide picture
   is cleared: by the page that knows which uploads it made.

   A GUIDE is a title, a category, a short summary, an optional thumbnail
   (when there is none the pages use the first section picture; see
   thumbOf in js/guide-text.js), and an ordered list of sections — each a heading, a body in the
   small text format js/guide-text.js renders, and an optional picture. `status` is "draft" or "published"; only published guides
   ever leave this function without a token.

   THE ADDRESS IS THE SLUG (/guides/<slug>), and it follows the title: see
   _slugs.js. The id is fixed when the guide is created and still answers as
   an old address, so renaming a guide never breaks a link somebody shared.

   WHAT'S NEW. A guide reaches the homepage's update log the way a maze
   does: `publishedAt` is when it first went public ("Added"), and a later
   day's `updatedAt` with `changes` is an edit ("Updated"). Edits to a draft
   stamp nothing public — a guide nobody can see has no news. The change
   keys are the log's own (see CHANGE_WORDS in js/home.js), accumulated
   over a day the way _changes.js does it, so an afternoon of saves reads
   as one line.

   TAKEN DOWN AND PUT BACK. While a guide is published its record IS the
   public copy. The moment it is unpublished, what the public last saw
   (the words, the pictures, and the log line's date and changes) is kept
   in `publicCopy`, because the draft edits that follow move updatedAt and
   leave `changes` behind from whatever day they were written. Publishing
   it again is described against that copy, not against the draft, and
   carries the day's changes only if the public line was itself today's.
   publicCopy never leaves this function without a token.

   REV counts saves. The conflict check keys on it, not on updatedAt,
   because updatedAt deliberately stands still for saves a reader would not
   notice (a new list position, say) and a stale form would otherwise pass
   the check after one of those. Guides saved before rev existed have none,
   which counts as 0. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, hasAccount, canWrite, refuseWrite, UNAUTHORIZED, usernameFromToken, isAuthUnavailable, AUTH_UNAVAILABLE } = require("./_auth");
const { cachedJson } = require("./_cache");
const { SECURITY_HEADERS } = require("./_headers");
const { isSafeKey } = require("./_keys");
const { assignSlugs, settleSlug, idFor, recheckSlug, loadRetired, retireAddresses, slugify: slugifyAddress, PROJECTION: SLUG_FIELDS } = require("./_slugs");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

const LIMITS = { title: 120, category: 40, summary: 600, heading: 120, body: 8000, sections: 60 };
const STATUSES = ["draft", "published"];
const CONFLICT = "Someone else saved this guide since you opened it - reload it to see their changes.";

/* An asked-for id (the starter guide's) tidied into an address: the one
   rule every address is made by (_slugs.js — accents folded, Habbo's
   picture glyphs left out), rather than a copy of it kept here. */
function slugify(text) {
    return slugifyAddress(text) || "guide";
}

const text = (v, max) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");

/* A guide picture is one of two things and nothing else: an image uploaded
   through /warren (upload.js, folder "guides/"), or one shipped with the
   site under assets/img/guides/ (the starter guide's rooms). Anything else
   is dropped rather than stored, so a guide can never point a visitor's
   browser somewhere this site did not put a picture. */
const UPLOADED = "/.netlify/functions/image?key=";
function cleanImage(v) {
    if (typeof v !== "string") return "";
    const s = v.trim();
    if (!s) return "";
    if (s.startsWith(UPLOADED)) {
        const key = s.slice(UPLOADED.length);
        return key.startsWith("guides/") && isSafeKey(key) ? s : "";
    }
    return /^\/assets\/img\/guides\/[a-z0-9][a-z0-9/_-]*\.(png|jpe?g|gif|webp)$/i.test(s) && !s.includes("..") ? s : "";
}

/* The body as it will be stored, or an error message for a 400. Unknown
   fields are not carried across: the record is rebuilt from the fields a
   guide has. */
function shape(body) {
    if (!body || typeof body !== "object") return "Invalid request body";
    const title = text(body.title, LIMITS.title);
    if (!title) return "A guide needs a title.";
    const status = body.status === undefined ? "draft" : body.status;
    if (!STATUSES.includes(status)) return `"status" must be draft or published.`;
    if (body.sections !== undefined && !Array.isArray(body.sections)) return `"sections" must be a list.`;
    const sections = (body.sections || []).slice(0, LIMITS.sections).map(s => ({
        heading: text(s && s.heading, LIMITS.heading),
        body: text(s && s.body, LIMITS.body),
        image: cleanImage(s && s.image)
    })).filter(s => s.heading || s.body || s.image);
    // The order guides are listed in; lower first, ties by newest.
    const order = Number.isFinite(Number(body.order)) ? Math.max(-9999, Math.min(9999, Math.round(Number(body.order)))) : 0;
    return {
        title,
        category: text(body.category, LIMITS.category).replace(/[<>"'`]/g, ""),
        summary: text(body.summary, LIMITS.summary),
        thumb: cleanImage(body.thumb),
        sections,
        status,
        order
    };
}

/* What an edit to a published guide changed, in the update log's keys.
   Text (title, category, summary) -> "text"; the sections' words or their
   number -> "sections"; any picture -> "images". */
function describe(before, after) {
    const keys = new Set();
    if (["title", "category", "summary"].some(f => (before[f] || "") !== (after[f] || ""))) keys.add("text");
    const bs = before.sections || [], as = after.sections || [];
    const words = list => JSON.stringify(list.map(s => [s.heading || "", s.body || ""]));
    const pics = (g, list) => JSON.stringify([g.thumb || "", list.map(s => s.image || "")]);
    if (words(bs) !== words(as)) keys.add("sections");
    if (pics(before, bs) !== pics(after, as)) keys.add("images");
    return [...keys];
}

// The day's list so far, when the last public edit was today (UTC, as the
// log's other records are). Tomorrow starts a fresh one. `pub` is a record
// the public saw as it stands: a published guide, or a publicCopy.
function carried(pub) {
    const today = new Date().toISOString().slice(0, 10);
    return pub && String(pub.updatedAt || "").slice(0, 10) === today && Array.isArray(pub.changes) ? pub.changes : [];
}

// What the public saw of a published guide, kept when it is taken down.
function publicSnapshot(g) {
    return {
        title: g.title || "", category: g.category || "", summary: g.summary || "",
        thumb: g.thumb || "", sections: g.sections || [],
        updatedAt: g.updatedAt || g.publishedAt || "",
        changes: Array.isArray(g.changes) ? g.changes : []
    };
}

const revOf = g => Number(g && g.rev) || 0;

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("guides: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const guides = db.collection("guides");
    const params = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
        const full = params.full === "1";
        // A live account, not just a signature: drafts are admin-only, and a
        // deleted or password-reset account's old token must not read them.
        if (full && !(await hasAccount(event))) return UNAUTHORIZED;
        let list;
        try {
            list = await guides.find({}, { projection: { _id: 0 } })
                .sort({ order: 1, publishedAt: -1, createdAt: -1 })
                .toArray();
        } catch (e) {
            console.error("guides: read failed", e);
            return json(503, { error: "The guides could not be read just now." });
        }
        // The public copy leaves out who wrote what, the save counter, and
        // what a taken-down guide used to say: none of it is anybody's
        // business but the admins'.
        /* Every guide's address, worked out over drafts as well as published
           ones: a draft holds its address too, and working it out over the
           published ones alone would let the page and the share function
           disagree the moment a draft shared a name (see _slugs.js). */
        // With the deleted guides' addresses, as share.js and the sitemap
        // work them out — see _slugs.js.
        const retired = await loadRetired(db, "guide").catch(e => {
            console.error("guides: retired addresses unreadable", e);
            return [];
        });
        const slugs = assignSlugs(list, "guide", retired);
        list.forEach(g => { g.slug = slugs.get(g.id) || g.id; });
        if (!full) {
            list = list.filter(g => g.status === "published")
                .map(({ updatedBy, createdBy, rev, publicCopy, slugAliases, slugManual, ...g }) => g);
        }
        return cachedJson(event, list, { cache: !full });
    }

    // A write that fails part-way (the database dropping mid-request, say)
    // answers in JSON like every other refusal, so /warren shows a message
    // rather than Netlify's bare error page.
    try {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await canWrite(event))) return await refuseWrite(event);
        const who = usernameFromToken(event) || "";

        if (event.httpMethod === "DELETE") {
            const id = String(params.id || "");
            if (!id) return json(400, { error: "Missing guide id" });
            // Its addresses stay reserved, so a link to it answers 410 rather
            // than opening whichever guide takes the title next — see rooms.js.
            const all = await guides.find({}, { projection: SLUG_FIELDS }).toArray();
            const doomed = all.find(r => r && r.id === id);
            if (!doomed) return json(404, { error: "Guide not found" });
            await retireAddresses(db, "guide", doomed, assignSlugs(all, "guide", await loadRetired(db, "guide")).get(id));
            const result = await guides.deleteOne({ id });
            if (!result.deletedCount) return json(404, { error: "Guide not found" });
            return json(200, { deleted: id });
        }

        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }
        const guide = shape(body);
        if (typeof guide === "string") return json(400, { error: guide });
        const now = new Date().toISOString();

        if (event.httpMethod === "POST") {
            await ensureUniqueIndex(guides, "id");
            guide.slug = body.slug;
            guide._slugAuto = body._slugAuto;
            const everyGuide = () => guides.find({}, { projection: SLUG_FIELDS }).toArray();
            const retired = await loadRetired(db, "guide");
            const slugProblem = settleSlug(await everyGuide(), "guide", null, guide, retired);
            if (slugProblem) return json(400, { error: slugProblem });
            /* An id the caller asked for (the starter guide's) is kept as
               asked where it is free; otherwise the settled address, or the
               nearest thing nothing answers to — see idFor in _slugs.js. */
            const wanted = (typeof body.id === "string" && slugify(body.id)) || guide.slug;
            let id = idFor(await everyGuide(), "guide", wanted, retired);
            for (let attempt = 0; ; attempt++) {
                const record = {
                    ...guide, id,
                    createdAt: now, createdBy: who,
                    updatedAt: now, updatedBy: who,
                    publishedAt: guide.status === "published" ? now : null,
                    changes: [],
                    rev: 1
                };
                try {
                    await guides.insertOne(record);
                    const { _id, ...clean } = record;
                    // The same address settled twice at once — see recheckSlug
                    // in _slugs.js.
                    return json(201, (await recheckSlug(guides, "guide", id, retired)) || clean);
                } catch (e) {
                    // Same attempt-and-retry as rooms.js: the unique index, not a
                    // prior lookup, is what stops two guides sharing an address.
                    if (e.code === 11000 && attempt < 50) { id = idFor(await everyGuide(), "guide", wanted, retired); continue; }
                    throw e;
                }
            }
        }

        if (event.httpMethod === "PUT") {
            const id = String(body.id || "");
            if (!id) return json(400, { error: "Missing guide id" });
            const before = await guides.findOne({ id });
            if (!before) return json(404, { error: "Guide not found" });

            /* Two admins editing one guide: the form sends the rev it was
               opened at, and a save from a stale form is refused rather than
               written over the newer one (the same check rooms.js makes).
               _baseUpdatedAt is still honoured for a /warren tab loaded
               before rev existed, which never sends _baseRev. */
            const baseRev = body._baseRev;
            const baseAt = body._baseUpdatedAt;
            if (baseRev !== undefined && baseRev !== null) {
                if (Number(baseRev) !== revOf(before)) return json(409, { error: CONFLICT });
            } else if (baseAt !== undefined && baseAt !== null && String(before.updatedAt || "") !== String(baseAt)) {
                return json(409, { error: CONFLICT });
            }

            const update = { ...guide, updatedAt: now, updatedBy: who, rev: revOf(before) + 1 };
            // Its address, which follows a new title (see _slugs.js).
            update.slug = body.slug;
            update._slugAuto = body._slugAuto;
            const retired = await loadRetired(db, "guide");
            const slugProblem = settleSlug(await guides.find({}, { projection: SLUG_FIELDS }).toArray(), "guide", before, update, retired);
            if (slugProblem) return json(400, { error: slugProblem });
            const wasPublic = before.status === "published";
            if (guide.status === "published" && !before.publishedAt) {
                // Its first day in public: that is the "Added" line, with nothing
                // to list as changed.
                update.publishedAt = now;
                update.changes = [];
            } else if (guide.status === "published" && !wasPublic) {
                /* Back in public after being taken down: described against
                   what the public last saw, not against the draft, and with
                   that copy's own day of changes (only if it was today). A
                   guide taken down before publicCopy existed has none; the
                   draft is the best guess there, with no list carried. */
                const pub = before.publicCopy || null;
                const keys = describe(pub || before, guide);
                if (pub && !keys.length) {
                    // Put back exactly as it was: the log line it had.
                    update.updatedAt = pub.updatedAt || before.publishedAt;
                    update.changes = pub.changes || [];
                } else {
                    update.changes = [...new Set([...carried(pub), ...keys])];
                }
                update.publicCopy = null;
            } else if (guide.status === "published" && wasPublic) {
                const keys = describe(before, guide);
                if (!keys.length) {
                    // Nothing a reader would notice: keep the day's line as it
                    // was and do not move the date the log ranks on.
                    delete update.updatedAt;
                } else {
                    update.changes = [...new Set([...carried(before), ...keys])];
                }
            } else if (wasPublic) {
                // Taken down: remember what the public saw, for putting back.
                update.publicCopy = publicSnapshot(before);
            }
            const result = await guides.findOneAndUpdate(
                { id, rev: before.rev === undefined ? { $exists: false } : before.rev },
                { $set: update },
                { returnDocument: "after", projection: { _id: 0 } }
            );
            const saved = result && (result.value !== undefined ? result.value : result);
            if (!saved || !saved.id) return json(409, { error: CONFLICT });
            return json(200, (await recheckSlug(guides, "guide", id, retired)) || saved);
        }

        return json(405, { error: "Method not allowed" });
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("guides: write failed", e);
        return json(500, { error: "Something went wrong saving the guides. Try again in a minute." });
    }
};

/* The account checks above (hasAccount, canWrite and the rest) throw when
   the database cannot say who is asking, rather than answering "nobody" —
   answering nobody signed admins out over a blip (see _auth.js). Caught
   here, so that moment is a readable "try again" instead of the platform's
   own error page and stack trace. Anything else still fails as it did. */
const handleRequest = exports.handler;
exports.handler = async (event) => {
    try {
        return await handleRequest(event);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        throw e;
    }
};

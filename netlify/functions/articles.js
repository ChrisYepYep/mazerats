/* /.netlify/functions/articles: the site's own articles (2 Nov 2026, the
   owner's: "a way to announce the winner on the website").

   Not to be confused with article.js, which reads a Habbo Origins article
   into an event once. These are written here, in the Warren's What's New
   panel (js/admin-articles.js), and read in a window of their own on the
   homepage (js/articles.js) at /article/<slug>.

   GET            the published articles, newest first, whole, for the
                  homepage. Cached at the edge like the archive (cachedJson).
   GET ?full=1    every article, drafts included, for the Warren. A live
                  account only, never cached. With &retired=1,
                  { records, retired }: the list and the deleted articles'
                  addresses, for the Address field.
   POST           a new article.             } site-scope writes (canWrite),
   PUT            an edit to one, with the   } as guides.js; a PUT carries
                  rev it was opened at        } _baseRev
                  or { id, whatsNewHidden }: the What's New panel's
                  Hide/Show, which changes nothing else
   DELETE ?id=    removes one; its addresses stay reserved (_slugs.js).

   AN ARTICLE is
     title, summary          the name, and a line or two under it (cards,
                             link previews, What's New's line by default)
     thumb                   its picture on What's New, the spotlight, the
                             list and link previews
     gallery                 [{ image, caption }]: the strip at the top of
                             the window, like a maze's
     body                    the text, in js/article-text.js's format (the
                             guides' format, quotes, pictures and embeds);
                             never HTML
     justify                 true: the text set justified, both edges straight
     embedData               { ref: object }, what an embed block keeps
                             beyond its attributes (_article-embeds.js)
     eventId                 the event it is about, or "": the article links
                             to it and the event's window links back
     status                  "draft" (the Warren's only) or "published"
     author                  the Warren account that wrote it, from the
                             session, never from the request
     publishedAt             when it first went public: the byline's date
     editedAt                when what a reader reads (title, summary,
                             pictures, text, event) last changed after it
                             first went public: the reader's "Updated" date.
                             A spotlight or What's New change isn't one.
     wn                      its What's New entry: { day, title, text,
                             badge, badgeText, hidden, image }, each "" for
                             the article's own (the day it was published,
                             its title, its summary, "Article", its thumb)
     spotlight...            the spotlight's fields, exactly as an event's
                             (_spotlight.js)
   Every picture is one uploaded to the "articles/" folder (upload.js).

   THE TEXT IS CHECKED, NOT CLEANED. Nothing in it is ever markup: the page
   escapes it all and writes the few tags the format makes (GuideText). What
   the server checks is what the format adds: every ![caption](picture) must
   be an "articles/" upload, and every {{embed}} line a type, names and
   values on the allow-list (_article-embeds.js), or the save is refused
   saying which. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, hasAccount, canWrite, refuseWrite, UNAUTHORIZED, usernameFromToken, isAuthUnavailable, AUTH_UNAVAILABLE } = require("./_auth");
const { cachedJson } = require("./_cache");
const { SECURITY_HEADERS } = require("./_headers");
const { isSafeKey } = require("./_keys");
const { checkSpotlight, SPOTLIGHT_FIELDS } = require("./_spotlight");
const { checkEmbeds } = require("./_article-embeds");
const { assignSlugs, settleSlug, idFor, recheckSlug, loadRetired, retireAddresses, PROJECTION: SLUG_FIELDS } = require("./_slugs");
const ArticleText = require("../../js/article-text.js");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

const LIMITS = { title: 120, summary: 300, body: 40000, caption: 200, gallery: 30, wnTitle: 120, wnText: 600, badge: 14 };
const MAX_REQUEST = 160 * 1024;
const STATUSES = ["draft", "published"];
const BADGES = ["added", "updated", "news", "note", "custom"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const CONFLICT = "Someone else saved this article since you opened it - reload it to see their changes.";
const UPLOADED = "/.netlify/functions/image?key=";
// Never in the public copy: who saved what, the save counter, the address book.
const PRIVATE = ["createdBy", "updatedBy", "rev", "slugAliases", "slugManual", "_id"];

const text = (v, max) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");
const line = (v, max) => text(v, max).replace(/\s+/g, " ");

/* A real calendar day, from 2024 to a month ahead, as whats-new.js holds
   a post's day. */
function realDay(s) {
    if (typeof s !== "string" || !DAY.test(s)) return false;
    const d = new Date(s + "T12:00:00Z");
    if (isNaN(d) || d.toISOString().slice(0, 10) !== s) return false;
    const ahead = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
    return s >= "2024-01-01" && s <= ahead;
}

/* An "articles/" upload's address, or "" for none; null for anything else,
   which is refused rather than dropped (a picture lost without a word is
   the guides' old lesson, see guides.js). */
function picture(v) {
    if (v === "" || v == null) return "";
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s.startsWith(UPLOADED)) return null;
    const key = s.slice(UPLOADED.length);
    return key.startsWith("articles/") && isSafeKey(key) ? s : null;
}

/* The request as it will be stored, or a message for a 400. Unknown fields
   are not carried across: the record is rebuilt from an article's fields. */
function shape(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return "Invalid request body";
    const title = line(b.title, LIMITS.title);
    if (!title) return "An article needs a title.";
    const status = b.status === undefined ? "draft" : b.status;
    if (!STATUSES.includes(status)) return `"status" must be draft or published.`;
    const thumb = picture(b.thumb);
    if (thumb === null) return "The thumbnail has to be a picture uploaded here.";

    if (b.gallery !== undefined && b.gallery !== null && !Array.isArray(b.gallery)) return `"gallery" must be a list.`;
    const gallery = [];
    for (const g of b.gallery || []) {
        const image = picture(g && typeof g === "object" ? g.image : g);
        if (!image) return "Every picture in the gallery has to be one uploaded here.";
        gallery.push({ image, caption: line(g && g.caption, LIMITS.caption) });
    }
    if (gallery.length > LIMITS.gallery) return `The gallery can hold at most ${LIMITS.gallery} pictures.`;

    if (b.body !== undefined && b.body !== null && typeof b.body !== "string") return `"body" must be text.`;
    if (typeof b.body === "string" && b.body.length > LIMITS.body + 2000) return `The article's text is too long: keep it under ${LIMITS.body} characters.`;
    const body = text(b.body, LIMITS.body);
    // Every picture line names an "articles/" upload (the pattern holds it to that folder; this is the key check).
    const bad = ArticleText.pictures(body).find(p => !isSafeKey(p.key));
    if (bad) return "A picture in the text isn't one uploaded here.";

    if (b.eventId !== undefined && b.eventId !== null && b.eventId !== "" && (typeof b.eventId !== "string" || !ID.test(b.eventId))) {
        return "That isn't an event in the archive.";
    }

    const w = b.wn && typeof b.wn === "object" && !Array.isArray(b.wn) ? b.wn : {};
    const wn = {
        day: w.day === "" || w.day == null ? "" : w.day,
        title: line(w.title, LIMITS.wnTitle),
        text: text(w.text, LIMITS.wnText),
        badge: BADGES.includes(w.badge) ? w.badge : "",
        badgeText: "",
        hidden: w.hidden === true,
        image: picture(w.image)
    };
    if (wn.day && !realDay(wn.day)) return "The What's New date has to be a real day (YYYY-MM-DD).";
    if (wn.image === null) return "The What's New picture has to be one uploaded here.";
    if (wn.badge === "custom") {
        wn.badgeText = line(w.badgeText, LIMITS.badge);
        if (!wn.badgeText) return "Type what the What's New label should say, or pick one from the list.";
    }

    const out = {
        title,
        summary: text(b.summary, LIMITS.summary),
        thumb,
        gallery,
        body,
        // The text set justified (3 Nov 2026, the owner's Justify button).
        justify: b.justify === true,
        eventId: typeof b.eventId === "string" ? b.eventId : "",
        status,
        wn
    };
    // The spotlight, as an event's: every field, so unticking one clears it.
    SPOTLIGHT_FIELDS.forEach(k => { out[k] = b[k] === undefined ? (k === "spotlight" ? false : "") : b[k]; });
    out.spotlightCaptionAt = out.spotlightCaptionAt || "bottom";
    out.spotlightCaptionAtHome = out.spotlightCaptionAtHome || "bottom";
    const spot = checkSpotlight(out);
    if (spot) return spot;
    const embeds = checkEmbeds(ArticleText.embeds(body), b.embedData, out);
    if (embeds.error) return embeds.error;
    out.embedData = embeds.embedData;
    return out;
}

const revOf = a => Number(a && a.rev) || 0;
// What a reader reads: a change to any of these after it went public sets editedAt.
const READ_FIELDS = ["title", "summary", "thumb", "gallery", "body", "justify", "embedData", "eventId"];
const publicCopy = a => {
    const out = { ...a };
    PRIVATE.forEach(k => { delete out[k]; });
    return out;
};

// The public list as last read here, for a ?fresh without an account (see guides.js).
const FRESH_LIST_MS = 1000;
let publicMemo = null;

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("articles: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const articles = db.collection("articles");
    const params = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
        const full = params.full === "1";
        // A live account, not just a signature: drafts are the Warren's.
        if (full && !(await hasAccount(event))) return UNAUTHORIZED;
        /* ?fresh=<time>: js/articles.js asking past the edge for an article
           it could not find in the cached list (one just published). As
           guides.js: an admin's is read afresh, anybody else's is answered
           from a list read in the last second. */
        const fresh = Object.prototype.hasOwnProperty.call(params, "fresh");
        const freshRead = fresh && !full && await hasAccount(event).catch(() => false);
        if (fresh && !full && !freshRead && publicMemo && Date.now() - publicMemo.at < FRESH_LIST_MS) {
            const res = cachedJson(event, publicMemo.list, { cache: false });
            res.headers = { ...res.headers, "Netlify-Vary": "query=full|fresh" };
            return res;
        }
        const readAt = Date.now();
        let list;
        try {
            list = await articles.find({}, { projection: { _id: 0 } })
                .sort({ publishedAt: -1, createdAt: -1 })
                .toArray();
        } catch (e) {
            console.error("articles: read failed", e);
            return json(503, { error: "The articles could not be read just now." });
        }
        // Addresses over drafts as well, as share.js and the sitemap work them out (_slugs.js).
        const retired = await loadRetired(db, "article").catch(e => {
            console.error("articles: retired addresses unreadable", e);
            return [];
        });
        const slugs = assignSlugs(list, "article", retired);
        list.forEach(a => { a.slug = slugs.get(a.id) || a.id; });
        if (!full) {
            list = list.filter(a => a.status === "published").map(publicCopy);
            publicMemo = { at: readAt, list };
        }
        if (full && params.retired === "1") return cachedJson(event, { records: list, retired }, { cache: false });
        const res = cachedJson(event, list, { cache: !full && !fresh });
        res.headers = { ...res.headers, "Netlify-Vary": "query=full|fresh" };
        return res;
    }

    try {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await canWrite(event))) return await refuseWrite(event);
        if (String(event.body || "").length > MAX_REQUEST) return json(413, { error: "That's too much to save at once." });
        publicMemo = null;
        const who = usernameFromToken(event) || "";

        if (event.httpMethod === "DELETE") {
            const id = typeof params.id === "string" ? params.id : "";
            if (!id || id.length > 120) return json(400, { error: "Missing article id" });
            const all = await articles.find({}, { projection: SLUG_FIELDS }).toArray();
            const doomed = all.find(r => r && r.id === id);
            if (!doomed) return json(404, { error: "Article not found" });
            await retireAddresses(db, "article", doomed, assignSlugs(all, "article", await loadRetired(db, "article")).get(id));
            const result = await articles.deleteOne({ id });
            if (!result.deletedCount) return json(404, { error: "Article not found" });
            // Its "posted to Discord" goes with it (whats-new-discord.js).
            await db.collection("whats_new").deleteOne({ id: "d:article:" + id }).catch(() => {});
            return json(200, { deleted: id });
        }

        let body;
        try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });
        const now = new Date().toISOString();

        /* The What's New panel's Hide and Show: wn.hidden alone, with no
           rev check (it changes nothing an open edit holds). */
        if (event.httpMethod === "PUT" && typeof body.whatsNewHidden === "boolean" && Object.keys(body).every(k => k === "id" || k === "whatsNewHidden")) {
            const id = typeof body.id === "string" ? body.id : "";
            if (!id) return json(400, { error: "Missing article id" });
            const res = await articles.findOneAndUpdate(
                { id },
                { $set: { "wn.hidden": body.whatsNewHidden } },
                { returnDocument: "after", projection: { _id: 0 } }
            );
            const saved = res && (res.value !== undefined ? res.value : res);
            if (!saved || !saved.id) return json(404, { error: "That article has gone - reload the list." });
            return json(200, saved);
        }

        const article = shape(body);
        if (typeof article === "string") return json(400, { error: article });
        if (article.eventId) {
            const ev = await db.collection("events").findOne({ id: article.eventId }, { projection: { _id: 0, id: 1 } });
            if (!ev) return json(400, { error: "That event isn't in the archive any more. Pick another, or none." });
        }

        if (event.httpMethod === "POST") {
            await ensureUniqueIndex(articles, "id");
            article.slug = typeof body.slug === "string" ? body.slug : "";
            article._slugAuto = body._slugAuto === true;
            const everyArticle = () => articles.find({}, { projection: SLUG_FIELDS }).toArray();
            const retired = await loadRetired(db, "article");
            const slugProblem = settleSlug(await everyArticle(), "article", null, article, retired);
            if (slugProblem) return json(400, { error: slugProblem });
            let id = idFor(await everyArticle(), "article", article.slug, retired);
            for (let attempt = 0; ; attempt++) {
                const record = {
                    ...article, id,
                    author: who,
                    createdAt: now, createdBy: who,
                    updatedAt: now, updatedBy: who,
                    publishedAt: article.status === "published" ? now : null,
                    rev: 1
                };
                try {
                    await articles.insertOne(record);
                    const { _id, ...clean } = record;
                    return json(201, (await recheckSlug(articles, "article", id, retired)) || clean);
                } catch (e) {
                    // The unique index decides a clash, as in guides.js.
                    if (e.code === 11000 && attempt < 50) { id = idFor(await everyArticle(), "article", article.slug, retired); continue; }
                    throw e;
                }
            }
        }

        if (event.httpMethod === "PUT") {
            const id = typeof body.id === "string" ? body.id : "";
            if (!id) return json(400, { error: "Missing article id" });
            const before = await articles.findOne({ id });
            if (!before) return json(404, { error: "Article not found" });
            // A save from a form opened at an older rev is refused, not written over the newer one.
            if (body._baseRev === undefined || body._baseRev === null || Number(body._baseRev) !== revOf(before)) {
                return json(409, { error: CONFLICT });
            }
            const update = { ...article, updatedAt: now, updatedBy: who, rev: revOf(before) + 1 };
            update.slug = typeof body.slug === "string" ? body.slug : "";
            update._slugAuto = body._slugAuto === true;
            const retired = await loadRetired(db, "article");
            const slugProblem = settleSlug(await articles.find({}, { projection: SLUG_FIELDS }).toArray(), "article", before, update, retired);
            if (slugProblem) return json(400, { error: slugProblem });
            // Its first day in public is its byline's date, kept through later unpublishing.
            if (article.status === "published" && !before.publishedAt) update.publishedAt = now;
            // Its "Updated" date (3 Nov 2026): the reader's part changed after it first went public.
            // (justify: an article saved before it existed reads as false, not as a change.)
            const readOf = (r, k) => JSON.stringify(k === "justify" ? r[k] === true : r[k] ?? null);
            if (before.publishedAt && READ_FIELDS.some(k => readOf(article, k) !== readOf(before, k))) update.editedAt = now;
            const res = await articles.findOneAndUpdate(
                { id, rev: before.rev === undefined ? { $exists: false } : before.rev },
                { $set: update },
                { returnDocument: "after", projection: { _id: 0 } }
            );
            const saved = res && (res.value !== undefined ? res.value : res);
            if (!saved || !saved.id) return json(409, { error: CONFLICT });
            return json(200, (await recheckSlug(articles, "article", id, retired)) || saved);
        }

        return json(405, { error: "Method not allowed" });
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("articles: write failed", e);
        return json(500, { error: "Something went wrong saving the article. Try again in a minute." });
    }
};

/* The account checks throw when the database cannot say who is asking
   (_auth.js): a readable "try again" rather than the platform's error page. */
const handleRequest = exports.handler;
exports.handler = async (event) => {
    try {
        return await handleRequest(event);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        throw e;
    }
};

/* Failures reported to /warren's Errors tab: see withErrorReporting in
   _errors.js. Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("articles", exports.handler);
// For the tests.
exports._shape = shape;

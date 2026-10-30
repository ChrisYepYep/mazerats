/* /.netlify/functions/whats-new-discord — one What's New entry, posted to
   the Maze Rats Discord.  (28 Oct 2026, the owner's)

   The owner's decisions: posting is BY HAND, from the Warren's What's New
   panel (js/admin-whats-new.js), one entry at a time, and ANY entry can go —
   the automatic ones (a maze, event or guide added or updated) as well as
   the news posts and notes written there. (Posting on its own was tried on
   30 Oct 2026 and taken out the same day, the owner's: by hand only.)

   It goes through a channel WEBHOOK, not a bot: Discord's
   "Integrations → Webhooks" on the channel gives an address, kept in the
   DISCORD_WHATSNEW_WEBHOOK environment variable (never in the repo — whoever
   has it can post to that channel). Unset, the panel says so and nothing is
   sent.

   POST { key, activity, label, line, day }   a Warren account with "site"
       key       "maze:<id>" / "event:<id>" / "guide:<id>" for an automatic
                 entry, "post:<id>" for a news post or note
       activity  added | updated | news | note — the entry's colour
       label     the word on the entry's label, as the panel shows it
       line      the line under it, as the panel shows it (an override's
                 own text, or the automatic "what changed")
       day       the day the entry is filed under (YYYY-MM-DD), kept on the
                 row so a later day's entry for the same record is still due
     The panel sends what it shows, so what goes to Discord is what the
     admin was looking at. The record itself — its name, address and
     picture — is read here, through share.js's cards, so the post carries
     the same title, words and picture its link unfurls with.

   A hidden entry, a draft guide and anything gone from the archive are
   refused. Each post is remembered in whats_new as
     { id: "d:" + key, type: "discord", key, postedAt, day, via, count }
   (via "hand" or "auto")
   and whats-new.js hands those to the panel (?full=1 only), which marks the
   entry as posted and asks before posting it twice.

   Mentions are switched off on every post (allowed_mentions), so an
   "@everyone" typed into a line is only text.

   And one at a time (30 Oct 2026, the bug scan; the owner's "Fix all"):
   the row is claimed (sendingAt) before anything is sent, so a second
   tab or a second admin pressing Discord on the same entry meanwhile is
   told so rather than posting it twice. A claim is let go when the post
   fails, and one older than CLAIM_MS is taken as abandoned. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, canWrite, refuseWrite, AUTH_UNAVAILABLE, isAuthUnavailable, UNAUTHORIZED } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { resolveSlug, loadRetired, PROJECTION: SLUG_FIELDS } = require("./_slugs");
const { cards } = require("./share");

const COLLECTION = { maze: "rooms", event: "events", guide: "guides" };
const KEY = /^(maze|event|guide|post):[^\s]{1,200}$/;
const WEBHOOK = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const MAX_BODY = 4 * 1024;
/* Five seconds, not eight (30 Oct 2026, the bug scan): with a cold
   database before it, eight could run into the function's own ten-second
   limit, which ended it after the post went and before it was noted. */
const SEND_MS = 5000;
// How long a claim holds off a second post: well past the function's own life.
const CLAIM_MS = 60 * 1000;
// The entries' colours on the site (.wn-verb in css/style.css).
const COLOURS = { added: 0x6f8f4f, updated: 0xab8b64, news: 0xc1b7a7, note: 0x7f94a8 };
const KIND_WORD = { maze: "maze", event: "event", guide: "guide" };

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});
const text = (v, max) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");

/* Words for an embed's description, as the site shows them (30 Oct 2026,
   the bug scan; the owner's "Fix all"): without the picture characters
   Discord has no font for (plainGlyphs in share.js), and with Discord's
   own markdown escaped, so a "*", "_", "||" or "# " typed for the site is
   not turned into italics, a spoiler or a heading there. Titles, author
   and footer are left as they are: plainTitle has already cleaned the
   title, and the other two are never formatted. */
function discordText(v) {
    return cards.plainGlyphs(v)
        // "<" too: "<@123>" draws as a mention even with pings off.
        /* A bare address is left whole: Discord links it as typed, and a
           backslash inside one (twitch.tv/vincent\_leet) went into the link. */
        .replace(/(https?:\/\/\S+)|[\\*_~|`>#[\]<]/g, (m, url) => url || "\\" + m)
        // A list or numbered line ("- ", "1. ") at the start of a line.
        // The mark is escaped, so "1." becomes "1\." ("\1." would show the backslash).
        .replace(/^(\s*)([-+])(?=\s)/gm, "$1\\$2")
        .replace(/^(\s*\d+)\.(?=\s)/gm, "$1\\.")
        .trim();
}

/* Where links in a post point. Never a local run's own address: a post
   sent while testing on localhost would hand the whole server dead links. */
function origin() {
    const o = cards.originOf();
    return /^https:\/\//.test(o) && !/localhost|127\.0\.0\.1/.test(o) ? o : "https://mazerats.net";
}

// A path on this site made whole; an https address as it is; else none.
function absolute(site, link) {
    if (typeof link !== "string" || !link) return "";
    if (/^https:\/\//.test(link)) return link;
    return /^\/(?![/\\])/.test(link) ? site + link : "";
}

/* What the label says in Discord. The site's own words, with what it is
   about added where the site leaves that to the picture beside it:
   "New maze", "Event updated". A label of the admin's own stands as typed. */
function heading(kind, activity, label) {
    const what = KIND_WORD[kind];
    if (what && (activity === "added" || activity === "updated") && (!label || /^(added|updated)$/i.test(label))) {
        return activity === "added" ? `New ${what}` : `${what[0].toUpperCase()}${what.slice(1)} updated`;
    }
    return label || (activity === "news" ? "News" : activity === "note" ? "Note" : "What's New");
}

// The record an entry is about, and its current address; null when it is not public.
async function recordOf(db, kind, id) {
    const coll = db.collection(COLLECTION[kind]);
    const record = await coll.findOne({ id }, { projection: { _id: 0 } });
    if (!record || (kind === "guide" && record.status !== "published")) return null;
    const [all, retired] = await Promise.all([
        coll.find({}, { projection: { ...SLUG_FIELDS, status: 1 } }).toArray(),
        loadRetired(db, kind).catch(() => [])
    ]);
    const hit = resolveSlug(all, kind, id, retired);
    return { record, slug: (hit && hit.slug) || id };
}

/* The Discord embed for one entry, from what the panel sent and what the
   database holds. { embed } or { error }. */
async function build(db, col, b) {
    const key = String(b.key || "");
    if (!KEY.test(key)) return { error: "Unknown entry" };
    const activity = Object.prototype.hasOwnProperty.call(COLOURS, b.activity) ? b.activity : "news";
    const label = text(b.label, 30);
    const line = text(b.line, 600);
    const site = origin();
    const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const embed = { color: COLOURS[activity], footer: { text: "What's New on Maze Rats" } };

    if (kind === "post") {
        const p = await col.findOne({ id, type: "post" }, { projection: { _id: 0 } });
        if (!p) return { error: "That post has gone - reload the list." };
        if (p.hidden === true) return { error: "That post is hidden from What's New. Show it first." };
        if (p.kind === "news") {
            embed.author = { name: heading("", activity, label) };
            embed.title = cards.plainTitle(p.title).slice(0, 256);
            const url = absolute(site, p.link);
            if (url) embed.url = url;
            if (discordText(p.text)) embed.description = discordText(p.text);
            /* Every news post carries the same banner (28 Oct 2026, the
               owner's): "MAZERATS.NET — Every maze. One place." over the
               maze. The picture uploaded in the Warren was the small icon
               beside the entry, lost in Discord; the site's log now shows a
               piece of this banner instead (NEWS_THUMB in js/home.js). */
            /* The slim 600x77 strip since 30 Oct 2026 (the owner's), under
               a new name: Discord keeps its copy of a picture by address,
               and the posts already sent keep the old card they went with. */
            // Framed (30 Oct 2026, the owner's): an 8px radius, a 1px black border with a light line inside it
            // on the top and left and a dark one on the right and bottom, and a 2px solid shadow. A file of its
            // own, so Discord, which keeps a picture by its address, does not go on showing the plain one.
            embed.image = { url: `${site}/assets/img/discord-news-banner-framed.png` };
            return { embed };
        }
        // A note: its words, on the card of the maze or event it is about.
        // A row with no target is refused below, not a 500 (30 Oct 2026, the bug scan).
        const target = typeof p.target === "string" ? p.target : "";
        const [tk, tid] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
        if (!COLLECTION[tk]) return { error: "That note's maze or event is unknown." };
        const found = await recordOf(db, tk, tid);
        if (!found) return { error: "The maze or event that note is about is gone from the archive." };
        const tags = cards.tagsFor(tk, found.record, site, found.slug);
        embed.author = { name: heading("", activity, label) };
        embed.title = tags.title.slice(0, 256);
        embed.url = tags.canonical;
        embed.description = discordText(p.text) || discordText(tags.description);
        embed.image = { url: tags.image };
        return { embed };
    }

    const override = await col.findOne({ id: "o:" + key, type: "override" }, { projection: { _id: 0, hidden: 1 } });
    if (override && override.hidden) return { error: "That entry is hidden from What's New. Show it first." };
    const found = await recordOf(db, kind, id);
    if (!found) return { error: kind === "guide" ? "That guide isn't published." : "That's gone from the archive." };
    const tags = cards.tagsFor(kind, found.record, site, found.slug);
    embed.author = { name: heading(kind, activity, label) };
    embed.title = tags.title.slice(0, 256);
    embed.url = tags.canonical;
    // The What's New line first, as on the site, then what the thing is.
    embed.description = [discordText(line), discordText(tags.description)].filter(Boolean).join("\n\n");
    embed.image = { url: tags.image };
    return { embed };
}

/* The entry's row, claimed for this post (see the header): true, or false
   when another post of it is under way. A row that has never been posted
   is made as "discord-sending", which whats-new.js does not hand the panel,
   so a claim never reads as posted. The filter misses a fresh claim, the
   upsert then meets the unique id and Mongo refuses it (E11000): that
   refusal is the answer, atomically, however close the two presses. */
async function claim(col, id, key, now) {
    const stale = new Date(Date.parse(now) - CLAIM_MS).toISOString();
    try {
        await col.updateOne(
            { id, $or: [{ sendingAt: { $exists: false } }, { sendingAt: { $lt: stale } }] },
            { $set: { sendingAt: now }, $setOnInsert: { type: "discord-sending", key } },
            { upsert: true }
        );
        return true;
    } catch (e) {
        if (e && e.code === 11000) return false;
        throw e;
    }
}

// This post's claim, let go after a failed send: the row gone if it was only the claim.
async function letGo(col, id, now) {
    try {
        await col.deleteOne({ id, type: "discord-sending", sendingAt: now });
        await col.updateOne({ id, sendingAt: now }, { $unset: { sendingAt: "" } });
    } catch (e) {
        // Left, it lapses by itself after CLAIM_MS.
        console.error("whats-new-discord: claim not let go", e);
    }
}

// Sent, or an { error } worded for the panel. Swappable for the tests.
let send = async (webhook, payload) => {
    let res;
    try {
        res = await fetch(`${webhook}?wait=true`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(SEND_MS)
        });
    } catch (e) {
        /* No answer is not "not sent" (30 Oct 2026, the bug scan): Discord
           may have taken the post and been slow to say so, and "Try again"
           posted it twice. */
        return { error: "Discord didn't answer in time. The post may have gone anyway: check the channel before trying again." };
    }
    if (res.ok) return {};
    if (res.status === 429) return { error: "Discord says that's too many posts at once. Try again in a few seconds.", rateLimited: true };
    if (res.status === 401 || res.status === 404) return { error: "Discord doesn't know that webhook any more. It may have been deleted in the channel's settings." };
    const detail = await res.text().catch(() => "");
    console.error("whats-new-discord: Discord refused", res.status, detail.slice(0, 500));
    return { error: `Discord refused the post (${res.status}).` };
};

/* One entry to the channel: built, claimed, sent and noted. { status, data }.

   The row also keeps the DAY of the entry that went (body.day, the entry's
   day as the panel works it out): the key names a record,
   not a day, and a maze posted when it was added has a new entry each later
   day it is edited, which is due to go in its turn. `via` says how. */
async function postOne(db, col, webhook, body, via) {
    const built = await build(db, col, body);
    if (built.error) return { status: 400, data: { error: built.error } };

    const now = new Date().toISOString();
    // The key as checked in build: a ["maze:x"] passed the test as a string and was stored as a list.
    const key = String(body.key);
    const id = "d:" + key;
    const day = typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : now.slice(0, 10);
    // The unique id is what makes the claim atomic, so it is made sure of first.
    await ensureUniqueIndex(col, "id");
    if (!(await claim(col, id, key, now))) {
        return { status: 409, data: { error: "That entry is being posted to Discord right now. Wait a moment, then reload the list to see it.", sending: true } };
    }

    const sent = await send(webhook, { embeds: [built.embed], allowed_mentions: { parse: [] } });
    if (sent.error) {
        await letGo(col, id, now);
        return { status: 502, data: { error: sent.error, rateLimited: !!sent.rateLimited } };
    }

    /* It HAS gone to Discord by now (30 Oct 2026, the bug scan): a
       failure to note that answered "That couldn't be posted.", and the
       admin posted it again. Logged, and the panel told it went. */
    let row;
    try {
        row = await col.findOneAndUpdate(
            { id },
            { $set: { type: "discord", key, postedAt: now, day, via }, $unset: { sendingAt: "" }, $inc: { count: 1 } },
            { upsert: true, returnDocument: "after", projection: { _id: 0 } }
        );
    } catch (e) {
        console.error("whats-new-discord: posted, but not noted", e);
        row = { id, type: "discord", key, postedAt: now, day, via, count: 1 };
    }
    return { status: 200, data: { discord: row } };
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    try {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await canWrite(event))) return await refuseWrite(event);
        if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
        const webhook = String(process.env.DISCORD_WHATSNEW_WEBHOOK || "").trim();
        if (!webhook) return json(503, { error: "No Discord channel is set up yet: DISCORD_WHATSNEW_WEBHOOK isn't set on Netlify." });
        if (!WEBHOOK.test(webhook)) return json(503, { error: "DISCORD_WHATSNEW_WEBHOOK on Netlify isn't a Discord webhook address." });

        let body;
        try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });

        let db;
        try { db = await getDb(); } catch (e) { return json(503, { error: "Database connection failed" }); }
        const out = await postOne(db, db.collection("whats_new"), webhook, body, "hand");
        return json(out.status, out.data);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("whats-new-discord: failed", e);
        return json(500, { error: "That couldn't be posted." });
    }
};

/* Failures reported to /warren's Errors tab: see withErrorReporting in
   _errors.js. Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("whats-new-discord", exports.handler);
// For the tests.
exports._build = build;
exports._heading = heading;
exports._setSend = fn => { send = fn; };

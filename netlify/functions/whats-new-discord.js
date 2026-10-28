/* /.netlify/functions/whats-new-discord — one What's New entry, posted to
   the Maze Rats Discord.  (28 Oct 2026, the owner's)

   The owner's decisions: posting is BY HAND, from the Warren's What's New
   panel (js/admin-whats-new.js), one entry at a time, and ANY entry can go —
   the automatic ones (a maze, event or guide added or updated) as well as
   the news posts and notes written there. Nothing is posted on its own.

   It goes through a channel WEBHOOK, not a bot: Discord's
   "Integrations → Webhooks" on the channel gives an address, kept in the
   DISCORD_WHATSNEW_WEBHOOK environment variable (never in the repo — whoever
   has it can post to that channel). Unset, the panel says so and nothing is
   sent.

   POST { key, activity, label, line }   a Warren account with "site"
       key       "maze:<id>" / "event:<id>" / "guide:<id>" for an automatic
                 entry, "post:<id>" for a news post or note
       activity  added | updated | news | note — the entry's colour
       label     the word on the entry's label, as the panel shows it
       line      the line under it, as the panel shows it (an override's
                 own text, or the automatic "what changed")
     The panel sends what it shows, so what goes to Discord is what the
     admin was looking at. The record itself — its name, address and
     picture — is read here, through share.js's cards, so the post carries
     the same title, words and picture its link unfurls with.

   A hidden entry, a draft guide and anything gone from the archive are
   refused. Each post is remembered in whats_new as
     { id: "d:" + key, type: "discord", key, postedAt, count }
   and whats-new.js hands those to the panel (?full=1 only), which marks the
   entry as posted and asks before posting it twice.

   Mentions are switched off on every post (allowed_mentions), so an
   "@everyone" typed into a line is only text. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, canWrite, refuseWrite, AUTH_UNAVAILABLE, isAuthUnavailable, UNAUTHORIZED } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { resolveSlug, loadRetired, PROJECTION: SLUG_FIELDS } = require("./_slugs");
const { cards } = require("./share");

const COLLECTION = { maze: "rooms", event: "events", guide: "guides" };
const KEY = /^(maze|event|guide|post):[^\s]{1,200}$/;
const WEBHOOK = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const MAX_BODY = 4 * 1024;
const SEND_MS = 8000;
// The entries' colours on the site (.wn-verb in css/style.css).
const COLOURS = { added: 0x6f8f4f, updated: 0xab8b64, news: 0xc1b7a7, note: 0x7f94a8 };
const KIND_WORD = { maze: "maze", event: "event", guide: "guide" };

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});
const text = (v, max) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");

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
            if (p.text) embed.description = p.text;
            /* No picture (28 Oct 2026, the owner's): a news post's picture is
               the small icon the log shows beside the entry, and in Discord
               it was either lost under the post or a stray square in the
               corner. */
            return { embed };
        }
        // A note: its words, on the card of the maze or event it is about.
        const [tk, tid] = [p.target.slice(0, p.target.indexOf(":")), p.target.slice(p.target.indexOf(":") + 1)];
        if (!COLLECTION[tk]) return { error: "That note's maze or event is unknown." };
        const found = await recordOf(db, tk, tid);
        if (!found) return { error: "The maze or event that note is about is gone from the archive." };
        const tags = cards.tagsFor(tk, found.record, site, found.slug);
        embed.author = { name: heading("", activity, label) };
        embed.title = tags.title.slice(0, 256);
        embed.url = tags.canonical;
        embed.description = p.text || tags.description;
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
    embed.description = [line, tags.description].filter(Boolean).join("\n\n");
    embed.image = { url: tags.image };
    return { embed };
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
        return { error: "Discord didn't answer. Try again in a moment." };
    }
    if (res.ok) return {};
    if (res.status === 429) return { error: "Discord says that's too many posts at once. Try again in a few seconds." };
    if (res.status === 401 || res.status === 404) return { error: "Discord doesn't know that webhook any more. It may have been deleted in the channel's settings." };
    const detail = await res.text().catch(() => "");
    console.error("whats-new-discord: Discord refused", res.status, detail.slice(0, 500));
    return { error: `Discord refused the post (${res.status}).` };
};

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
        const col = db.collection("whats_new");
        const built = await build(db, col, body);
        if (built.error) return json(400, { error: built.error });

        const sent = await send(webhook, { embeds: [built.embed], allowed_mentions: { parse: [] } });
        if (sent.error) return json(502, { error: sent.error });

        const now = new Date().toISOString();
        const id = "d:" + body.key;
        await ensureUniqueIndex(col, "id");
        const row = await col.findOneAndUpdate(
            { id },
            { $set: { type: "discord", key: body.key, postedAt: now }, $inc: { count: 1 } },
            { upsert: true, returnDocument: "after", projection: { _id: 0 } }
        );
        return json(200, { discord: row });
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

/* whats-new-autopost — What's New posted to the Maze Rats Discord on its
   own.  (30 Oct 2026, the owner's: "make it so the what's new automatically
   posts to discord, rather than having to do it manually")

   A SCHEDULED function (netlify.toml: every ten minutes), never called over
   HTTP. Each run looks at the log as the Warren's What's New panel works it
   out (js/admin-whats-new.js, entries) and posts every entry that is due,
   through the same postOne as the panel's Discord button
   (whats-new-discord.js), so the post reads the same, takes the same claim,
   and is marked posted on the same row.

   DUE means all of:
     - new since automatic posting was switched on (`since` below): turning
       it on never sends the whole history;
     - not hidden, a published guide, and a record still in the archive
       (build in whats-new-discord.js refuses the rest);
     - SETTLED: half an hour since the record or post was last saved. An
       afternoon's edits go as one post with all its changes, a typo found
       a minute after saving is in it, and there is time to Hide or Amend an
       entry in the Warren before it goes;
     - not posted already for its DAY. The Discord row is per record
       ("d:maze:<id>") and keeps the day of the entry that went (`day`; for
       rows older than that, the day it was posted), so a maze posted when it
       was added is due again when a later day's edits make it "Updated".
       A news post or note goes once.
   At most four a run, oldest first, a second apart (a webhook allows five
   in two seconds); the rest wait ten minutes. A 429 ends the run.

   THE SWITCH is one row in whats_new,
     { id: "discord-auto", type: "discord-auto", on, since, updatedAt }
   set from the panel through whats-new.js. With no row yet (the first run
   after this is deployed) it is made, on, from now. Turning it back on
   moves `since` to then, so what was edited while it was off is not sent
   in a burst.

   Never from a local run: netlify dev talks to the live database (see the
   project notes), and a local copy posting would post for real. */
const { getDb } = require("./_db");
const { postOne, WEBHOOK } = require("./whats-new-discord");

const SETTLE_MS = 30 * 60 * 1000;
const MAX_PER_RUN = 4;
const GAP_MS = 1100;
const SWITCH_ID = "discord-auto";
// The day every record catalogued before createdAt existed shares (BACKFILL in js/admin-whats-new.js).
const BACKFILL = "2026-08-21";
// The automatic change lines, as the homepage and the panel word them (CHANGE_WORDS in js/home.js).
const CHANGE_WORDS = {
    "imagery-added": "Added room imagery", "imagery": "Room imagery updated", "thumb": "Thumbnail updated",
    "furni": "Updated furni listing", "markers": "Entrance or finish updated", "status": "Status changed",
    "difficulty": "Difficulty re-rated", "tags": "Tags updated", "dates": "Dates updated", "links": "Links updated",
    "text": "Changes made to texts", "details": "Details updated", "sections": "Sections rewritten", "images": "Pictures updated"
};
const VERBS = { added: "Added", updated: "Updated", news: "News", note: "Note" };

const dayOf = v => String(v || "").slice(0, 10);
const time = v => { const t = Date.parse(v); return isNaN(t) ? 0 : t; };

/* One record's latest entry, as the panel reads it (autoEntry and entries in
   js/admin-whats-new.js, kept in step by hand): its day, label and line,
   the Warren's override applied. `at` is when it happened, `touched` when
   the record was last saved. */
function recordEntry(item, kind, o) {
    const archived = String((kind === "guide" ? item.publishedAt : item.createdAt) || BACKFILL);
    const updated = item.updatedAt ? String(item.updatedAt) : "";
    const auto = updated && dayOf(updated) > dayOf(archived) ? "updated" : "added";
    const words = (Array.isArray(item.changes) ? item.changes : []).map(k => CHANGE_WORDS[k]).filter(Boolean).join(" · ");
    const activity = (o && o.activity) || auto;
    return {
        key: `${kind}:${item.id}`,
        hidden: !!(o && o.hidden),
        day: (o && o.day) || dayOf(auto === "updated" ? updated : archived),
        activity,
        label: VERBS[activity],
        line: (o && o.text) || (auto === "updated" ? words : ""),
        at: auto === "updated" ? updated : archived,
        touched: Math.max(time(updated), time(archived))
    };
}

// A news post's or note's entry, as the panel reads it.
function postEntry(p) {
    const activity = p.badge && p.badge !== "custom" ? p.badge : p.kind;
    return {
        key: `post:${p.id}`,
        hidden: p.hidden === true,
        day: String(p.day || ""),
        activity,
        label: p.badge === "custom" && p.badgeText ? p.badgeText : VERBS[activity] || "News",
        line: String(p.text || ""),
        at: String(p.createdAt || ""),
        touched: Math.max(time(p.createdAt), time(p.updatedAt))
    };
}

// The entries due now, oldest first (see the header).
function dueEntries({ rooms, events, guides, rows }, since, now) {
    const overrides = new Map(rows.filter(r => r.type === "override").map(o => [o.target, o]));
    const posted = new Map(rows.filter(r => r.type === "discord").map(d => [d.key, d]));
    const today = new Date(now).toISOString().slice(0, 10);
    const all = [
        ...rooms.map(r => recordEntry(r, "maze", overrides.get(`maze:${r.id}`))),
        ...events.map(e => recordEntry(e, "event", overrides.get(`event:${e.id}`))),
        ...guides.filter(g => g && g.status === "published" && g.publishedAt).map(g => recordEntry(g, "guide", overrides.get(`guide:${g.id}`))),
        /* A note about something gone from the archive would be refused on
           every run, holding a place in the four, so it is left out here. */
        ...rows.filter(r => r.type === "post" && (r.kind === "news"
            || (r.kind === "note" && ((/^maze:/.test(r.target) && rooms.some(x => `maze:${x.id}` === r.target))
                || (/^event:/.test(r.target) && events.some(x => `event:${x.id}` === r.target)))))).map(postEntry)
    ];
    return all.filter(e => {
        if (e.hidden || !e.at || time(e.at) < since) return false;
        if (now - e.touched < SETTLE_MS) return false;
        if (e.day > today) return false;
        const d = posted.get(e.key);
        if (!d) return true;
        if (e.key.startsWith("post:")) return false;
        return (d.day || dayOf(d.postedAt)) < e.day;
    }).sort((a, b) => time(a.at) - time(b.at));
}

const wait = ms => new Promise(r => setTimeout(r, ms));

exports.handler = async () => {
    const done = data => ({ statusCode: 200, body: JSON.stringify(data) });
    if (process.env.NETLIFY_DEV === "true") return done({ skipped: "local run" });
    const webhook = String(process.env.DISCORD_WHATSNEW_WEBHOOK || "").trim();
    if (!WEBHOOK.test(webhook)) return done({ skipped: "no webhook" });

    const db = await getDb();
    const col = db.collection("whats_new");
    const now = Date.now();
    const sw = await col.findOne({ id: SWITCH_ID }, { projection: { _id: 0 } });
    if (!sw) {
        // The first run: on, from now.
        const at = new Date(now).toISOString();
        await col.updateOne({ id: SWITCH_ID }, { $setOnInsert: { type: SWITCH_ID, on: true, since: at, updatedAt: at } }, { upsert: true });
        return done({ started: at });
    }
    if (sw.on !== true) return done({ skipped: "switched off" });

    const fields = { _id: 0, id: 1, createdAt: 1, publishedAt: 1, updatedAt: 1, changes: 1, status: 1 };
    const [rooms, events, guides, rows] = await Promise.all([
        db.collection("rooms").find({}, { projection: fields }).toArray(),
        db.collection("events").find({}, { projection: fields }).toArray(),
        db.collection("guides").find({}, { projection: fields }).toArray(),
        col.find({}, { projection: { _id: 0 } }).toArray()
    ]);
    const due = dueEntries({ rooms, events, guides, rows }, time(sw.since), now);
    const sent = [], failed = [];
    for (const e of due.slice(0, MAX_PER_RUN)) {
        if (sent.length || failed.length) await wait(GAP_MS);
        const out = await postOne(db, col, webhook, { key: e.key, activity: e.activity, label: e.label, line: e.line, day: e.day }, "auto");
        if (out.status === 200) { sent.push(e.key); continue; }
        // Refused for good (gone, hidden meanwhile): skipped now, and again next time, quietly.
        failed.push(`${e.key}: ${out.data && out.data.error}`);
        if (out.status === 502 && out.data && out.data.rateLimited) break;
    }
    if (failed.length) console.warn("whats-new-autopost: not posted", failed);
    return done({ due: due.length, sent, failed });
};

// For the tests.
exports._dueEntries = dueEntries;
exports._recordEntry = recordEntry;
exports._postEntry = postEntry;

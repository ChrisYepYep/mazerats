/* /.netlify/functions/dead-end-leads — Missing Pieces: what visitors send in
   from the console's Add Info form, and what admins do with it.

   (Named "dead ends" in code from the feature's first draft; everything a
   person reads calls it Missing Pieces.)

   See js/dead-ends.js for what a record can be missing and dead-ends.js for
   how one is marked. A LEAD is one visitor's answer about one maze or event
   — or about a maze not in the archive yet, which is what the console's old
   "submit a maze" form was for: a list of items (a builder, a date, some
   room images...), and who to thank. Nothing a visitor sends is public until
   an admin accepts it — the words live in `dead_end_leads`, and the pictures
   in the image store under tips/, which image.js refuses to serve to anyone
   who is not signed in to /warren.

   ---------------------------------------------------------------- PUBLIC

   POST ?action=upload {dataUrl}
       One screenshot, before the lead that uses it. Returns { key }.
       SIGNED-IN VISITORS ONLY (Discord). Words can come from anyone, the way
       the contact form's can; pictures cannot. Anonymous image upload is how
       a small site ends up hosting things it never wanted to, and a Discord
       name on every file is what makes a picture answerable for.

       Sent separately, one per request, because a Netlify Function takes a
       6MB body and four room screenshots do not fit in one. Each upload is
       recorded against the uploader in `dead_end_uploads`, and a lead may
       only claim uploads its own sender made — so one visitor cannot attach
       another's file by guessing its key. An upload nobody claims within a
       day is swept away (see sweepOrphans).

   POST {type, id | name, habboName, items[{kind, value, images[]}], website}
       The lead itself. type is maze, event, or "new" (with `name` in place
       of `id`). Each item is one LEAD_KINDS answer. `website` is the
       honeypot, exactly as on the contact form. Throttled per address, and
       silently swallowed for a banned one.

   ----------------------------------------------------------------- ADMIN

   GET ?status=new|accepted|rejected|all       any admin account
   PATCH {id, status, note, resolve[], promote, credit}      canWrite
       Accept or reject. Accepting can also:
         promote  copy the lead's screenshots out of quarantine into the
                  record's own image folder and hand back their public
                  URLs, ready to drop into the maze form;
         resolve  take pieces off the record's dead-end flag;
         credit   add the sender to the Contributors list for this record.
       Rejecting deletes the screenshots.
   DELETE ?id=                                 canWrite
       Gone entirely, screenshots and all. */
const crypto = require("crypto");
const { getDb, ensureUniqueIndex, ensureIndex } = require("./_db");
const { hasAccount, canWrite, refuseWrite, roleOf, WRITE_SCOPES, usernameFromToken, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { playerFrom } = require("./_player");
const { clientIp, clientNet, claimNotifySlot, isBanned, forgetOldAddresses } = require("./_net");
const { SECURITY_HEADERS } = require("./_headers");
const { imagesStore } = require("./_images");
const DeadEnds = require("../../js/dead-ends.js");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// Anything off the wire is text or it is nothing — see contact.js for why a
// stringified object is worse than an empty field.
const text = (v) => (typeof v === "string" ? v : "");

const COLLECTION_OF = { maze: "rooms", event: "events" };
const NAME_OF = { maze: "name", event: "title" };

const HABBO_NAME_MAX = 60;
const REVIEW_NOTE_MAX = 500;

/* Throttles. Leads are cheap to read and cheap to reject, so the limit is
   about not being flooded rather than about cost; uploads are the expensive
   thing and get the tighter rope, counted per ADDRESS and per SIGNED-IN
   PLAYER, so neither a new Discord account nor a new address resets it.

   "Address" means the subscriber — `net`, from _net.js — not the exact IP.
   Counting the exact address let anyone on IPv6 take a fresh allowance with
   every one of the /64's addresses, which is to say an unlimited one. */
const LEAD_LIMIT = 6;
const UPLOAD_LIMIT = 12;
const WINDOW_MS = 10 * 60 * 1000;
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

/* BYTES, not just files. The caps above count uploads, and each may be 4MB,
   so twelve every ten minutes was ~7GB a day into the image store from one
   signed-in visitor, and nothing at all bounded the site as a whole. Two
   daily ceilings now: one per player (two full eight-picture submissions
   and change), and one across everybody, which is what actually protects
   the store from many accounts at once. Counted on a per-day document in
   UPLOAD_QUOTAS, bumped and read back in one atomic step and taken back
   out if the upload is then refused. */
const UPLOAD_QUOTAS = "dead_end_upload_quotas";
const PLAYER_BYTES_PER_DAY = 48 * 1024 * 1024;
const GLOBAL_BYTES_PER_DAY = 500 * 1024 * 1024;

/* How many orphaned uploads each sweep clears. The admin's queue read
   used to take 40, which a single day of abandoned forms could outrun; it
   now takes far more, and every upload also sweeps a few (see handleUpload),
   so the store is kept tidy by the traffic that fills it and not only by
   an admin happening to look. */
const SWEEP_BATCH = 200;
const UPLOAD_SWEEP_BATCH = 5;

// Lead emails per clock hour, across every sender — see claimNotifySlot in
// _net.js. Leads past it are saved as always; only the email is skipped.
const EMAILS_PER_HOUR = 12;
const EMAIL_TIMEOUT_MS = 5000;
// How long an accept's claim on copying a lead's images holds before a
// later accept may take it over — see "PROMOTE" in handleReview. Longer
// than any function may run, so a live copy is never trampled.
const PROMOTE_CLAIM_MS = 2 * 60 * 1000;

/* The file types a screenshot can be, recognised by their first bytes
   rather than by what the data URL claims. The claim is the uploader's; the
   bytes are the file. A "PNG" that does not start like one is refused. */
const SIGNATURES = [
    { mime: "image/png",  ext: "png",  test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    { mime: "image/jpeg", ext: "jpg",  test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: "image/gif",  ext: "gif",  test: (b) => b.length > 6 && b.toString("ascii", 0, 4) === "GIF8" },
    { mime: "image/webp", ext: "webp", test: (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" }
];

function sniff(buffer) {
    return SIGNATURES.find(s => s.test(buffer)) || null;
}

// clientIp and clientNet come from _net.js: Netlify's own value only, never
// x-forwarded-for.

function slugify(v) {
    return String(v || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "record";
}

// A quiet success, for a bot or a banned address — see contact.js.
const decoy = () => json(201, { id: crypto.randomUUID(), status: "new" });

/* Built once per warm instance, each index on its own, and never allowed to
   stop a request.

   This used to await the two unique builds bare, and set its flag only if
   every build succeeded. So one that failed — duplicates already stored
   would do it — threw out of the handler's connect block as "the database
   is not answering" on EVERY lead and upload from then on (ensureUniqueIndex
   remembers only successes, so each request tried again, and failed again).
   Missing Pieces would have stopped taking submissions over an index. Now
   each build is caught and logged on its own, the way auth.js's
   ensureUsernameIndex does, and the whole set is memoised as one promise so
   concurrent requests share a single attempt. What a missing index costs
   is said beside each one: the id and key are random UUIDs, and the
   clientRef check has its findOne. */
let indexing = null;
function ensureIndexes(db) {
    if (!indexing) indexing = buildIndexes(db);
    return indexing;
}

async function buildIndexes(db) {
    const leads = db.collection("dead_end_leads");
    const uploads = db.collection("dead_end_uploads");
    const attempt = async (what, build) => {
        try {
            await build();
        } catch (e) {
            console.error(`dead-end-leads: ${what} index unavailable`, e);
        }
    };
    await attempt("leads.id", () => ensureUniqueIndex(leads, "id"));
    await attempt("uploads.key", () => ensureUniqueIndex(uploads, "key"));
    // ensureIndex swallows its own failures already.
    await ensureIndex(leads, { status: 1, createdAt: -1 });
    await ensureIndex(leads, { ip: 1, createdAt: -1 });
    await ensureIndex(leads, { net: 1, createdAt: -1 });
    await ensureIndex(leads, { type: 1, recordId: 1 });
    await ensureIndex(uploads, { ip: 1, at: -1 });
    await ensureIndex(uploads, { net: 1, at: -1 });
    await ensureIndex(uploads, { playerId: 1, at: -1 });
    await ensureIndex(uploads, { claimed: 1, at: 1 });
    // The byte-quota day counters sweep themselves after two days.
    await attempt("upload quota TTL", () =>
        db.collection(UPLOAD_QUOTAS).createIndex({ at: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 }));
    /* One lead per (sender, clientRef) — see handleLead. Partial, so the
       leads sent before clientRef existed (and any sent without one) are not
       all "duplicates" of each other under a missing value. Built here
       rather than through ensureUniqueIndex, which knows no partial
       filter; if it cannot be built, the findOne check in handleLead still
       catches every retry that is not a dead-heat race, and the log says
       why. */
    await attempt("clientRef", () => leads.createIndex({ sender: 1, clientRef: 1 }, {
        unique: true,
        partialFilterExpression: { clientRef: { $type: "string" } }
    }));
}

/* isBanned is _net.js's now, shared with contact.js: it matches the
   caller's address OR its network, so a ban on an IPv6 sender holds across
   their whole /64. See bans.js. */

/* Thirty days on, a lead and an upload record lose the sender's address —
   see forgetOldAddresses in _net.js, and the privacy policy, which promises
   it. The words, the pictures and who signed them stay. A lead sent without
   signing in also has the address in `sender` ("ip:<address>", the
   clientRef bookkeeping in handleLead), which a retry stops mattering to
   within minutes, so that goes too; a signed-in sender's "p:<id>" is not an
   address and stays. Both collections date their rows with Date objects. */
async function forgetOldSenders(db) {
    await forgetOldAddresses(db.collection("dead_end_leads"), {
        extra: { filter: { sender: { $regex: "^ip:" } }, unset: { sender: "" } }
    });
    await forgetOldAddresses(db.collection("dead_end_uploads"), { field: "at" });
}

/* Uploads nobody claimed. Swept when an admin opens the queue and, a few at
   a time, on every upload (see SWEEP_BATCH) rather than on a timer, because
   this site has no timers — and a bounded batch, so a large backlog is
   cleared over a few visits instead of making one of them slow. The blobs
   are deleted side by side rather than one after another, so a batch costs
   about one round trip. The blob goes first: a record without its blob is
   harmless, a blob with no record pointing at it is exactly the litter this
   exists to prevent. */
async function sweepOrphans(db, limit = SWEEP_BATCH) {
    const uploads = db.collection("dead_end_uploads");
    const cutoff = new Date(Date.now() - ORPHAN_AGE_MS);
    const stale = await uploads.find({ claimed: false, at: { $lt: cutoff } }, { projection: { key: 1 } }).limit(limit).toArray();
    if (!stale.length) return;
    const store = imagesStore();
    await Promise.all(stale.map(u => Promise.resolve().then(() => store.delete(u.key)).catch(() => { /* already gone */ })));
    await uploads.deleteMany({ key: { $in: stale.map(u => u.key) } });
}

/* Bumps today's byte counters for one upload — the player's and everybody's
   — and says whether both are still inside their quota. Over either, both
   bumps are taken back, so an upload that was refused does not count
   against the quota as though it had been stored, and the answer is false. Same one-round-trip counter as
   track.js's overGlobal. */
async function withinByteQuota(db, playerId, bytes) {
    const col = db.collection(UPLOAD_QUOTAS);
    const day = new Date(Math.floor(Date.now() / 86400000) * 86400000);
    const stamp = day.toISOString().slice(0, 10);
    const bump = (id, n) => col.findOneAndUpdate(
        { _id: id },
        { $inc: { bytes: n }, $setOnInsert: { at: day } },
        { upsert: true, returnDocument: "after" }
    ).then(doc => {
        const row = doc && doc.value !== undefined ? doc.value : doc;
        return (row && row.bytes) || 0;
    });
    const ids = [`p:${playerId}:${stamp}`, `all:${stamp}`];
    const [mine, everyone] = await Promise.all([bump(ids[0], bytes), bump(ids[1], bytes)]);
    if (mine <= PLAYER_BYTES_PER_DAY && everyone <= GLOBAL_BYTES_PER_DAY) return true;
    await Promise.all(ids.map(id => col.updateOne({ _id: id }, { $inc: { bytes: -bytes } }))).catch(() => {});
    return false;
}

async function deleteImages(db, keys) {
    if (!keys.length) return;
    const store = imagesStore();
    for (const key of keys) {
        try { await store.delete(key); } catch (e) { /* already gone */ }
    }
    await db.collection("dead_end_uploads").deleteMany({ key: { $in: keys } });
}

// Best-effort, exactly as contact.js's is: a lead is saved whether or not
// the email goes.
async function notify(lead, recordName) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.CONTACT_NOTIFY_EMAIL;
    if (!apiKey || !to) return;
    const from = process.env.CONTACT_FROM_EMAIL || "Maze Rats <onboarding@resend.dev>";
    const lines = lead.items.map(it =>
        `${DeadEnds.leadKindLabel(it.kind, lead.type)}: ${it.value || ""}${it.images.length ? ` (${it.images.length} image${it.images.length === 1 ? "" : "s"})` : ""}`);
    /* Bounded, as contact.js's is. The lead is saved and the sender's reply
       waits on this, so a Resend that hung held the request open until the
       platform killed it — and the sender saw a failure for a lead that had
       arrived, and sent it again. Aborted, it is one more failed
       notification in the catch below. */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
    try {
        await fetch("https://api.resend.com/emails", {
            method: "POST",
            signal: controller.signal,
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                from,
                to,
                subject: `Missing Pieces: ${recordName}${lead.type === "new" ? " (not in the archive)" : ""}`,
                // The handle and id beside the display name, which alone
                // identifies nobody — see contact.js.
                text: `${lead.from ? `From ${lead.from.name} (Discord, signed in${lead.from.username ? `, @${lead.from.username}` : ""}, id ${lead.from.id})\n` : ""}${lead.habboName ? `Habbo: ${lead.habboName}\n` : ""}\n${lines.join("\n")}\n\nReview it in Warren, under Missing Pieces.`
            })
        });
    } catch (e) {
        console.warn("dead-end-leads: email notification failed", e.message);
    } finally {
        clearTimeout(timer);
    }
}

// ------------------------------------------------------------ POST: upload

async function handleUpload(event, db) {
    const player = playerFrom(event);
    if (!player) return json(401, { error: "Sign in with Discord to send screenshots." });

    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }
    // "null" parses too, and body.dataUrl then threw a 500.
    if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });

    const ip = clientIp(event);
    const net = clientNet(event);
    if (await isBanned(db, event)) return json(201, { key: `tips/void/${crypto.randomUUID()}.png` });

    const uploads = db.collection("dead_end_uploads");
    const countRecent = () => uploads.countDocuments({
        at: { $gte: new Date(Date.now() - WINDOW_MS) },
        $or: [{ playerId: player.id }, ...(net ? [{ net }] : [])]
    });
    // A cheap early refusal only; the real check is after the insert below.
    if (await countRecent() >= UPLOAD_LIMIT) {
        return json(429, { error: "That is a lot of screenshots at once. Give it ten minutes." });
    }

    const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(text(body.dataUrl));
    if (!match) return json(400, { error: "Expected a screenshot" });
    const buffer = Buffer.from(match[1], "base64");
    if (!buffer.length) return json(400, { error: "That file is empty" });
    if (buffer.length > DeadEnds.IMAGE_MAX_BYTES) {
        return json(400, { error: "Keep each screenshot under 4MB" });
    }
    const kind = sniff(buffer);
    if (!kind) return json(400, { error: "Screenshots only: PNG, JPG, GIF or WebP" });

    const day = new Date().toISOString().slice(0, 10);
    const key = `tips/${day}/${crypto.randomUUID()}.${kind.ext}`;
    /* INSERT FIRST, THEN COUNT, the way contact.js does. The count above ran
       before anything was written, so a burst of parallel uploads all saw
       the same total, all fitted under the cap, and all got in — twelve an
       address became as many as could be fired at once. With the row in
       first, every request's count includes every other request's row, so
       no more than the cap survive. The blob is written only after the row
       has survived, so a refused upload never costs any storage; if the
       blob write then fails, the row goes too rather than pointing at
       nothing. */
    await uploads.insertOne({
        key,
        contentType: kind.mime,
        bytes: buffer.length,
        playerId: player.id,
        ip,
        net,
        at: new Date(),
        claimed: false
    });
    if (await countRecent() > UPLOAD_LIMIT) {
        await uploads.deleteOne({ key });
        return json(429, { error: "That is a lot of screenshots at once. Give it ten minutes." });
    }
    // The day's bytes, after the count so a burst refused there costs none.
    if (!(await withinByteQuota(db, player.id, buffer.length))) {
        await uploads.deleteOne({ key });
        return json(429, { error: "That is as many screenshots as can be taken today. Try again tomorrow." });
    }
    try {
        await imagesStore().set(key, buffer, { metadata: { contentType: kind.mime } });
    } catch (e) {
        await uploads.deleteOne({ key }).catch(() => {});
        throw e;
    }
    // A few of yesterday's abandoned uploads out as this one comes in — see
    // SWEEP_BATCH. Never allowed to fail the upload it rides on.
    await sweepOrphans(db, UPLOAD_SWEEP_BATCH).catch(() => {});
    return json(201, { key });
}

// -------------------------------------------------------------- POST: lead

async function handleLead(event, db) {
    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }

    // "null" parses too, and body.website then threw a 500.
    if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });

    if (text(body.website).trim()) return decoy();

    /* THE SAME LEAD SENT TWICE. js/console-info.js stamps each submission
       with a random clientRef and sends the SAME one again if it retries —
       after a timeout, a dropped connection, a double press — because a
       request that timed out on the visitor's side has often landed on
       ours, and every retry used to become another lead in the queue (with
       another email). Strict, because it is stored and indexed: a string
       of up to 64 URL-safe characters, or absent. Absent keeps the old
       behaviour, so an older cached copy of the console still works. */
    const hasRef = body.clientRef !== undefined && body.clientRef !== null;
    const clientRef = hasRef ? body.clientRef : null;
    if (hasRef && (typeof clientRef !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(clientRef))) {
        return json(400, { error: "Invalid request body" });
    }

    /* WHAT IT IS ABOUT: a maze or event already in the archive (type + id),
       or — the old "submit a maze" — one that is not in it yet ("new", with
       the name the visitor gave it). */
    const type = text(body.type);
    const recordId = type === "new" ? null : text(body.id).trim();
    const newName = type === "new" ? text(body.name).trim() : "";
    const habboName = text(body.habboName).trim();

    if (type === "new") {
        if (!newName) return json(400, { error: "What is the maze called?" });
        if (newName.length > DeadEnds.NEW_NAME_MAX) return json(400, { error: "That name is too long" });
    } else if (!COLLECTION_OF[type] || !recordId || recordId.length > 200) {
        return json(400, { error: "Which maze or event is this about?" });
    }
    if (habboName.length > HABBO_NAME_MAX) return json(400, { error: "That Habbo name is too long" });

    /* WHAT THEY ARE ADDING: a list of items, each one kind of answer (see
       LEAD_KINDS in js/dead-ends.js) with a value, images, or both. Hotel
       and difficulty answers must be one of the archive's own values, since
       they are picked from a list rather than typed. */
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return json(400, { error: "Choose something to add." });
    if (rawItems.length > DeadEnds.LEAD_ITEMS_MAX) return json(400, { error: "That is a lot at once. Send the rest separately." });
    const items = [];
    let imageCount = 0;
    for (const raw of rawItems) {
        if (!raw || typeof raw !== "object") return json(400, { error: "Invalid item" });
        const kind = text(raw.kind);
        if (!DeadEnds.isLeadKind(type, kind)) return json(400, { error: "Unknown thing to add" });
        const value = text(raw.value).trim();
        const keys = Array.isArray(raw.images) ? raw.images.filter(k => typeof k === "string") : [];
        if (value.length > DeadEnds.LEAD_ITEM_MAX) return json(400, { error: `Keep each answer under ${DeadEnds.LEAD_ITEM_MAX} characters` });
        if (keys.length && kind !== "images") return json(400, { error: "Images go with Add images" });
        if (kind === "hotel" && value && DeadEnds.HOTELS.indexOf(value) === -1) return json(400, { error: "Unknown hotel" });
        if (kind === "difficulty" && value && !DeadEnds.DIFFICULTIES.some(d => d.key === value)) return json(400, { error: "Unknown difficulty" });
        if (!value && !keys.length) continue;           // an empty row is ignored, not refused
        imageCount += keys.length;
        items.push({ kind, value, keys });
    }
    if (!items.length) return json(400, { error: "Fill in what you're adding." });
    if (imageCount > DeadEnds.LEAD_IMAGES_MAX) {
        return json(400, { error: `Up to ${DeadEnds.LEAD_IMAGES_MAX} images per submission` });
    }

    const ip = clientIp(event);
    // What the throttle counts, and what a ban matches besides the address.
    const net = clientNet(event);
    if (await isBanned(db, event)) return decoy();

    const leads = db.collection("dead_end_leads");
    const player = playerFrom(event);
    /* Who "the same sender" is, for clientRef: the Discord account when
       signed in (a phone changes address mid-retry; the account does not),
       otherwise the address. Neither — no session and no address — means
       nobody to match against, and the lead is simply taken as new. */
    const sender = player ? `p:${player.id}` : (ip ? `ip:${ip}` : null);
    const dedupe = Boolean(clientRef && sender);
    const earlier = () => leads.findOne({ sender, clientRef }, { projection: { _id: 0, id: 1, status: 1 } });
    /* Before the throttle and before any image is claimed: a retry of a lead
       that landed must not count against the sender, and its images are
       already claimed by the first copy, so letting it run on would fail
       with "one of those images has gone missing". */
    if (dedupe) {
        const prior = await earlier();
        if (prior) return json(200, { id: prior.id, status: prior.status, duplicate: true });
    }
    const TOO_MANY_LEADS = "Thanks for all of these. Give it ten minutes before sending more.";
    const countRecentLeads = () => leads.countDocuments({ net, createdAt: { $gte: new Date(Date.now() - WINDOW_MS) } });
    // A cheap early refusal only; the real check follows the insert below.
    if (net && await countRecentLeads() >= LEAD_LIMIT) {
        return json(429, { error: TOO_MANY_LEADS });
    }

    let recordName = newName;
    if (type !== "new") {
        const record = await db.collection(COLLECTION_OF[type])
            .findOne({ id: recordId }, { projection: { _id: 0, [NAME_OF[type]]: 1 } });
        if (!record) return json(404, { error: "That maze or event is not in the archive" });
        recordName = record[NAME_OF[type]] || recordId;
    }

    /* Every image across every item, claimed atomically one at a time: the
       filter demands the upload is this player's AND still unclaimed, so two
       leads racing for the same file cannot both have it, and nobody can
       claim somebody else's by knowing its key. `images` is kept flat on the
       lead as well as per item, because accepting, rejecting and deleting a
       lead act on all of its pictures at once. */
    const images = [];
    if (imageCount) {
        if (!player) return json(401, { error: "Sign in with Discord to send images." });
        const uploads = db.collection("dead_end_uploads");
        for (const item of items) {
            item.images = [];
            for (const key of item.keys) {
                const claimed = await uploads.findOneAndUpdate(
                    { key, playerId: player.id, claimed: false },
                    { $set: { claimed: true } },
                    { returnDocument: "after" }
                );
                const doc = claimed && (claimed.value !== undefined ? claimed.value : claimed);
                if (!doc || !doc.key) {
                    // Hand back anything already claimed for this lead.
                    await uploads.updateMany({ key: { $in: images.map(i => i.key) } }, { $set: { claimed: false } });
                    /* A retry racing its own first copy loses the images to
                       it, and lands here rather than at the check above. If
                       that first copy has been saved by now, it is the
                       answer, not an error. */
                    if (dedupe) {
                        const prior = await earlier();
                        if (prior) return json(200, { id: prior.id, status: prior.status, duplicate: true });
                    }
                    return json(400, { error: "One of those images has gone missing. Add it again." });
                }
                const img = { key: doc.key, contentType: doc.contentType, bytes: doc.bytes };
                item.images.push(img);
                images.push(img);
            }
        }
    }
    items.forEach(item => { if (!item.images) item.images = []; delete item.keys; });

    const lead = {
        id: crypto.randomUUID(),
        type,
        recordId,
        recordName,
        items,
        habboName,
        images,
        // username: Discord's unique handle beside the display name — see
        // signPlayer in _player.js, and contact.js for why it matters.
        from: player ? { id: player.id, name: player.name, username: player.username || null, verified: true } : null,
        ip,
        net,
        status: "new",
        createdAt: new Date(),
        // Only when there is one: the unique index is partial on a string
        // clientRef, and a lead without one has no business in it.
        ...(dedupe ? { clientRef, sender } : {})
    };
    /* Insert, re-count, and take it back if it went over — see contact.js.
       Counting only before the insert let a parallel burst all see room for
       one more. Taking it back hands its images back unclaimed (they are
       still the sender's, and the orphan sweep will collect them if nothing
       else does), and it happens before the email, so a refused lead costs
       nobody an inbox. */
    try {
        await leads.insertOne(lead);
    } catch (e) {
        /* Two copies of the same submission in a dead heat, both past the
           findOne above: the (sender, clientRef) index lets one in. The
           loser gives back any images it claimed and answers with the
           winner, exactly as a later retry would have been answered. */
        if (!(dedupe && e && e.code === 11000)) throw e;
        if (images.length) {
            await db.collection("dead_end_uploads").updateMany({ key: { $in: images.map(i => i.key) } }, { $set: { claimed: false } });
        }
        const prior = await earlier();
        if (!prior) throw e;
        return json(200, { id: prior.id, status: prior.status, duplicate: true });
    }
    if (net && await countRecentLeads() > LEAD_LIMIT) {
        await leads.deleteOne({ id: lead.id });
        if (images.length) {
            await db.collection("dead_end_uploads").updateMany({ key: { $in: images.map(i => i.key) } }, { $set: { claimed: false } });
        }
        return json(429, { error: TOO_MANY_LEADS });
    }
    if (await claimNotifySlot(db, "dead-end-leads", EMAILS_PER_HOUR)) await notify(lead, recordName);
    return json(201, { id: lead.id, status: "new" });
}

// ------------------------------------------------------------ PATCH: review

async function handleReview(event, db) {
    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }
    // "null" parses too, and body.id then threw a 500.
    if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });
    const id = text(body.id);
    const status = text(body.status);
    const note = text(body.note).trim();
    if (!id) return json(400, { error: "Missing lead id" });
    if (status !== "accepted" && status !== "rejected" && status !== "new") {
        return json(400, { error: "status must be accepted, rejected or new" });
    }
    if (note.length > REVIEW_NOTE_MAX) return json(400, { error: "Keep the note shorter" });

    const leads = db.collection("dead_end_leads");
    let lead = await leads.findOne({ id });
    if (!lead) return json(404, { error: "No such lead" });

    const reviewer = usernameFromToken(event);
    const out = { id, status };
    const reviewed = { status, reviewNote: note, reviewedBy: reviewer, reviewedAt: new Date() };

    if (status === "accepted") {
        /* ACCEPTING HAPPENS ONCE, and the status flips BEFORE anything else.

           This used to promote and credit first and write the status last,
           so a double-click (or two admins at once) ran the whole accept
           twice: two sets of copied images, two credits. And accept, reopen,
           accept did the same thing more slowly. Now the move to "accepted"
           is a single conditional update that only one request can win, and
           the side effects below each check the lead's own record of having
           already happened (`promoted`, `credited`) before doing it again. */
        const won = await leads.findOneAndUpdate(
            { id, status: { $ne: "accepted" } },
            { $set: reviewed },
            { returnDocument: "before" }
        );
        const before = won && (won.value !== undefined ? won.value : won);
        if (!before || !before.id) {
            /* Already accepted: keep the note — and FINISH, rather than
               repeat. This used to return here having done nothing else,
               which was right for a double-click and wrong for everything
               that matters: the status flips first, so an accept whose
               image copy or credit then threw left a lead marked accepted
               with half its work undone, and pressing Accept again (the
               obvious thing to do after an error) answered 200 and did none
               of the rest. The lead was simply stuck.

               So it falls through to the three steps below, each of which
               checks its own marker — `promoted`, `resolved`, `credited` —
               and claims it before acting, so work that did complete is not
               done twice and a click racing the winner does not duplicate
               what the winner is still doing. */
            await leads.updateOne({ id }, { $set: reviewed });
            out.alreadyAccepted = true;
            lead = (await leads.findOne({ id })) || lead;
            if (Array.isArray(lead.promoted) && lead.promoted.length) out.promoted = lead.promoted;
        } else {
            lead = before;
        }

        /* PROMOTE: copy the screenshots out of quarantine into the record's
           own folder, where image.js serves them to everybody. Copied, not
           moved — the lead keeps its originals until it is deleted, so the
           review history still shows what was sent. The copies are named
           under rooms/, the folder upload.js writes for the archive, so the
           maze form treats them like any image it uploaded itself.
           A lead that was promoted on an earlier accept hands back the
           copies it already has instead of making a second set. */
        if (body.promote && Array.isArray(lead.promoted) && lead.promoted.length) {
            out.promoted = lead.promoted;
        } else if (body.promote && lead.images && lead.images.length) {
            /* Claimed first, like `credited` below, now that a second press
               of Accept runs this too (see alreadyAccepted above): two
               requests arriving together would otherwise both find no
               `promoted` and both copy the set. The claim is a timestamp
               rather than a flag so that one left behind by a request that
               died mid-copy — the platform's timeout, not a catchable
               throw — lapses on its own after PROMOTE_CLAIM_MS instead of
               blocking the lead forever. */
            const claimedAt = new Date();
            const claim = await leads.updateOne(
                {
                    id,
                    $and: [
                        { $or: [{ promoted: { $exists: false } }, { promoted: { $size: 0 } }, { promoted: null }] },
                        { $or: [{ promoting: null }, { promoting: { $lt: new Date(Date.now() - PROMOTE_CLAIM_MS) } }] }
                    ]
                },
                { $set: { promoting: claimedAt } }
            );
            if (!claim.modifiedCount) {
                // Somebody else is copying them right now; theirs will land.
                out.promoteBusy = true;
            } else try {
                const store = imagesStore();
                const urls = [];
                let n = 0;
                for (const img of lead.images) {
                    const got = await store.getWithMetadata(img.key, { type: "arrayBuffer" });
                    if (!got) continue;
                    const ext = (img.key.split(".").pop() || "png").replace(/[^a-z]/g, "");
                    // A maze not in the archive yet has no id; its images go
                    // under the name it was sent with, ready for when it is added.
                    const key = `rooms/${slugify(lead.recordId || lead.recordName)}/${Date.now()}-lead-${++n}.${ext}`;
                    await store.set(key, Buffer.from(got.data), { metadata: { contentType: img.contentType || (got.metadata && got.metadata.contentType) || "image/png" } });
                    urls.push(`/.netlify/functions/image?key=${key}`);
                }
                out.promoted = urls;
                await leads.updateOne({ id }, urls.length
                    ? { $set: { promoted: urls }, $unset: { promoting: "" } }
                    : { $unset: { promoting: "" } });
            } catch (e) {
                await leads.updateOne({ id, promoting: claimedAt }, { $unset: { promoting: "" } }).catch(() => {});
                throw e;
            }
        }

        /* RESOLVE: the pieces this lead answered come off the record's flag.

           `resolved` on the lead remembers which pieces it has already taken
           off, and only the rest are pulled. Now that a second Accept
           finishes a half-done one rather than stopping (see alreadyAccepted
           above), this is what keeps it from pulling a piece an admin has
           deliberately put BACK on the flag since the first accept. Pulling
           is harmless to repeat otherwise, so two racing accepts need no
           claim here. */
        const resolve = Array.isArray(body.resolve) && lead.type !== "new"
            ? body.resolve.filter(k => typeof k === "string" && DeadEnds.isPiece(lead.type, k))
            : [];
        const done = Array.isArray(lead.resolved) ? lead.resolved : [];
        const toResolve = resolve.filter(k => done.indexOf(k) === -1);
        if (toResolve.length) {
            const flags = db.collection("dead_ends");
            const key = `${lead.type}:${lead.recordId}`;
            await flags.updateOne({ key }, { $pull: { pieces: { $in: toResolve } }, $set: { updatedAt: new Date().toISOString(), updatedBy: reviewer } });
            // A flag left with nothing to ask for is no flag.
            await flags.deleteOne({ key, pieces: { $size: 0 } });
            await leads.updateOne({ id }, { $addToSet: { resolved: { $each: toResolve } } });
        }
        if (resolve.length) out.resolved = resolve;

        /* CREDIT: the sender joins Contributors for this record, in the
           same shape the admin's own contributor form writes (see
           js/admin.js, "console: contributors") — mazes[] and events[]
           of ids, types[], a manual `extra`, and `count` as their sum. The
           name is the Habbo name they gave, falling back to their Discord
           one; an existing contributor is matched on it case-insensitively
           so a lead does not create a second copy of a regular.

           Credited once per lead, ever. `credited` is claimed on the lead
           with a conditional update BEFORE the contributor row is touched,
           so accept -> reopen -> accept (or two accepts racing) cannot add
           the same credit twice; and released again if the crediting fails,
           so a failed attempt can be retried. */
        if (body.credit && lead.credited) {
            out.alreadyCredited = lead.credited;
        } else if (body.credit) {
            const name = (text(body.creditName).trim() || lead.habboName || (lead.from && lead.from.name) || "").slice(0, HABBO_NAME_MAX);
            const claim = name ? await leads.updateOne({ id, credited: null }, { $set: { credited: name } }) : null;
            if (claim && !claim.modifiedCount) out.alreadyCredited = true;
            if (claim && claim.modifiedCount) try {
                const contributors = db.collection("contributors");
                /* A maze not in the archive yet has no id to list the credit
                   against, so it counts as one of their "other" contributions
                   (the admin form's `extra`) instead. */
                const isNew = lead.type === "new";
                const listField = lead.type === "event" ? "events" : "mazes";
                const typeLabel = lead.images && lead.images.length
                    ? (lead.type === "event" ? "Event Images" : "Room Images")
                    : "Historical Data";
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                /* A read-modify-write on somebody else's row, so it is made
                   conditional on the row being as it was read — the same
                   updatedAt check contributors.js makes of the admin form.
                   Without it, an admin saving this contributor between the
                   read and the write lost their save (or this credit lost
                   to theirs). A row that moved is simply read again; the
                   credit is additive, so re-applying it to the newer row is
                   always right. updatedAt is stamped too, so a contributor
                   form opened before this accept is refused on Save instead
                   of quietly writing the credit away. */
                let existing = null;
                for (let attempt = 0; attempt < 5; attempt++) {
                    existing = await contributors.findOne({ username: { $regex: `^${escaped}$`, $options: "i" } });
                    if (!existing) break;
                    const list = Array.isArray(existing[listField]) ? existing[listField] : [];
                    if (!isNew && list.indexOf(lead.recordId) === -1) list.push(lead.recordId);
                    const types = Array.isArray(existing.types) ? existing.types : [];
                    if (types.indexOf(typeLabel) === -1) types.push(typeLabel);
                    const mazes = listField === "mazes" ? list : (existing.mazes || []);
                    const events = listField === "events" ? list : (existing.events || []);
                    let extra = existing.extra != null ? existing.extra : Math.max(0, (existing.count || 0) - (existing.mazes || []).length - (existing.events || []).length);
                    if (isNew) extra += 1;
                    // null matches a row with no updatedAt at all, as well
                    // as one holding null — Mongo's own rule for equality.
                    const was = existing.updatedAt == null ? null : existing.updatedAt;
                    const res = await contributors.updateOne(
                        { id: existing.id, updatedAt: was },
                        { $set: { [listField]: list, types, extra, count: mazes.length + events.length + extra, updatedAt: new Date().toISOString() } }
                    );
                    if (res.modifiedCount || res.matchedCount) break;
                    if (attempt === 4) throw new Error("The contributor kept changing while the credit was being added - try again.");
                }
                if (existing) {
                    out.credited = existing.username;
                } else {
                    await ensureUniqueIndex(contributors, "id");
                    let cid = slugify(name);
                    const record = {
                        username: name,
                        types: [typeLabel],
                        mazes: !isNew && listField === "mazes" ? [lead.recordId] : [],
                        events: !isNew && listField === "events" ? [lead.recordId] : [],
                        extra: isNew ? 1 : 0,
                        count: 1
                    };
                    for (let attempt = 0, suffix = 2; ; attempt++) {
                        try {
                            await contributors.insertOne({ ...record, id: cid });
                            break;
                        } catch (e) {
                            if (e.code === 11000 && attempt < 20) { cid = `${slugify(name)}-${suffix++}`; continue; }
                            throw e;
                        }
                    }
                    out.credited = name;
                }
            } catch (e) {
                await leads.updateOne({ id }, { $unset: { credited: "" } }).catch(() => {});
                throw e;
            }
        }
        // The status (and `promoted`, if any) was written above.
        return json(200, out);
    }

    // Rejecting throws the screenshots away; the words stay for the record.
    if (status === "rejected" && lead.images && lead.images.length) {
        await deleteImages(db, lead.images.map(i => i.key));
        out.imagesDeleted = lead.images.length;
    }

    /* On a reject the per-item lists are emptied as well as the flat one.
       Only `images` used to be cleared, so a rejected lead went on listing,
       item by item, keys whose files had just been deleted — broken
       pictures in the review history, and names a later accept would try
       to copy. */
    await leads.updateOne({ id }, {
        $set: {
            ...reviewed,
            ...(status === "rejected" ? { images: [] } : {}),
            // $[] refuses a document with no `items` at all, hence the guard.
            ...(status === "rejected" && Array.isArray(lead.items) ? { "items.$[].images": [] } : {})
        }
    });
    return json(200, out);
}

// ------------------------------------------------------------------ handler

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
        /* Indexes are made by the requests that write, not by every read —
           an anonymous GET has no business building anything, even
           something as harmless as an index. */
        if (event.httpMethod !== "GET") await ensureIndexes(db);
    } catch (e) {
        console.error("dead-end-leads: database connection failed", e);
        return json(503, { error: "The archive's database is not answering. Try again in a minute." });
    }
    const q = event.queryStringParameters || {};

    try {
        // Cannot throw, and runs at most hourly; see forgetOldSenders.
        if (event.httpMethod === "POST" || event.httpMethod === "GET") await forgetOldSenders(db);

        if (event.httpMethod === "POST") {
            return q.action === "upload" ? await handleUpload(event, db) : await handleLead(event, db);
        }

        if (event.httpMethod === "GET") {
            if (!(await hasAccount(event))) return UNAUTHORIZED;
            await sweepOrphans(db).catch(() => {});
            const status = text(q.status) || "new";
            const filter = status === "all" ? {} : { status };
            /* WHO MAY SEE WHERE A LEAD CAME FROM. Every lead carries the
               sender's IP address and, if they were signed in, their
               Discord id — and this read was gated on hasAccount alone, so
               a viewer or an atlas account could list the addresses of
               everybody who had ever sent one. Those two are what a ban and
               a follow-up need, and both of those are the site scope's
               jobs, so only an owner or admin gets them; everyone else sees
               the lead with the name but without the address or the id.

               Asked through roleOf rather than canWrite, because canWrite
               writes the action log and this is a read. `sender` is the
               clientRef bookkeeping (see handleLead) — it holds the same
               address or id, and nobody needs it on screen. */
            const role = await roleOf(event);
            const full = (WRITE_SCOPES[role] || []).includes("site");
            // `net` is limiter bookkeeping (see handleLead), shown to nobody.
            const projection = full
                ? { _id: 0, sender: 0, net: 0 }
                : { _id: 0, sender: 0, net: 0, ip: 0, "from.id": 0 };
            const list = await db.collection("dead_end_leads")
                .find(filter, { projection })
                .sort({ createdAt: -1 })
                .limit(300)
                .toArray();
            const counts = await db.collection("dead_end_leads").aggregate([
                { $group: { _id: "$status", n: { $sum: 1 } } }
            ]).toArray();
            const byStatus = { new: 0, accepted: 0, rejected: 0 };
            counts.forEach(c => { byStatus[c._id] = c.n; });
            return json(200, { leads: list, counts: byStatus });
        }

        // refuseWrite answers a missing account with the 401 this did by
        // hand, and words the refusal for a viewer and an atlas account.
        if (!(await canWrite(event))) return await refuseWrite(event);

        if (event.httpMethod === "PATCH") return await handleReview(event, db);

        if (event.httpMethod === "DELETE") {
            const id = text(q.id);
            if (!id) return json(400, { error: "Missing lead id" });
            const lead = await db.collection("dead_end_leads").findOne({ id });
            if (!lead) return json(404, { error: "No such lead" });
            await deleteImages(db, (lead.images || []).map(i => i.key));
            await db.collection("dead_end_leads").deleteOne({ id });
            return json(200, { deleted: id });
        }

        return json(405, { error: "Method not allowed" });
    } catch (e) {
        console.error("dead-end-leads: request failed", e);
        /* The guards throw when the account lookup cannot be made (see
           lookUpRole in _auth.js): a 503 to retry, never the 401 the admin
           page would read as signed out. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return json(500, { error: "Something went wrong with that lead." });
    }
};

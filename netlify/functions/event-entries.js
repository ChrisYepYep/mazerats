/* /.netlify/functions/event-entries — Event Submission, from the console's
   Contact page (30 Sept 2026, the owner's request).

   An ENTRY is one visitor's go at an event: the Habbo Origins name they
   entered under and one picture (a screenshot of the finished maze, the
   room they built, whatever the event asked for). Nothing about it is
   public. The row lives in `event_entries`, and the picture in the image
   store under entries/, which image.js serves only to somebody signed in to
   /warren — exactly the quarantine Missing Pieces' tips/ has.

   WHICH EVENT an entry is for is decided HERE, not by the form. The owner
   picks it in the Warren's Event Entries panel (PUT ?action=open), and the
   console only asks which one it is so it can say "Entering: Vermin's
   Vault". Left on Automatic, it is the one event whose dates say it is
   running right now — and none when there is no such event, or more than
   one (the launch evening has three at once), rather than a guess. An entry
   made with no event is still kept, with event null, for the owner to read.
   Deciding it server-side means a form left open over a change of event,
   or a hand-made request, cannot file an entry under an event of its
   choosing.

   ---------------------------------------------------------------- PUBLIC

   GET  ?action=open
        { event: { id, title } | null, closed, message? } — what the form
        shows. `closed` is true while the Warren has entries set to Closed,
        or a picked event isn't running (before its start or after its end,
        2 Oct 2026), with `message` saying which; the POST then answers 403
        { error: message, closed: true }. Two entries an event at most per
        entrant (EVENT_ENTRIES); a third is 429 { error, eventFull: true }.

   POST { habboName, dataUrl, website, clientRef }
        The entry. `habboName` is required, 60 characters at most, as on
        the contact form. `dataUrl` is the picture as a data: URL, PNG or
        JPG by its first bytes (not by what the URL claims), 4MB at
        most — the form shrinks a bigger one before it sends. One request,
        not an upload and then an entry as Add Maze Info does: there is only
        ever one picture, and 4MB of it fits a function's 6MB body.
        `website` is the honeypot. `clientRef` makes a retry the same entry
        (see handlePost). Signed in or not — a signed-in entrant's Discord
        account is recorded from the session, never from the body.

   ----------------------------------------------------------------- ADMIN

   GET  ?status=new|reviewed|winner|rejected|all&event=<id>|none&page=N
        Any Warren account. Newest first, PAGE_SIZE a page, with counts by
        status (the nav badge is `counts.new`). Only the site roles are sent
        where an entry came from (its address and Discord id), as with the
        contact messages and Missing Pieces leads.
   PUT  ?id=  { status?, note? }                  canWrite
   PUT  ?action=open  { mode: auto|none|event|closed, eventId }   canWrite
   DELETE ?id=                                    canWrite — the picture too.

   ------------------------------------------- THE PRIZE WHEEL (2 Nov 2026)

   GET  ?names=1&event=<id>|none                  Any Warren account.
        { entrants: [{ name, entryIds, won }], truncated, prize }: the
        event's approved and winning entries in ONE projected read, grouped
        by name (ignoring case), oldest first. `won` is true for an entrant
        with any winning entry for the event, so the wheel can leave them
        out. It replaced thirty-a-page reads of eight queries each. `prize`
        is the event's prize line ("" for none), read alongside.
   GET  ?action=draws&event=<id>|none             Any Warren account.
        { draws }: the event's draw log, newest first, DRAW_LIST at most,
        each without its `replay` (below), which only one draw is read with:
   GET  ?action=draw&id=<drawId>                  Any Warren account.
        { draw }: one draw, whole (2 Nov 2026: for an article's replay).
   PUT  ?action=draw&id=<drawId>  { eventId, name, entryIds, onWheel,
        leftOutWinners, drawnAt, prize, replay }  canWrite: one draw, logged
        once (the id is the wheel's own, so a retry is the same row).
        `replay` (2 Nov 2026, optional) is the wheel as it spun, kept so an
        article can replay the draw (js/article-wheel.js): { names, the
        display names in wheel order, one per slice; colours, each slice's
        place in the wheel's palette; win, the winning slice, whose name is
        the draw's; from, where, turns, decel, the spin's numbers, `where`
        inside the winning slice }. Checked strictly (cleanReplay); one that
        fails is left off, and the draw is logged without it.
   PUT  ?action=prize&event=<id>|none  { text }   canWrite: the prize line
        the wheel shows under the event's name (PRIZE_MAX, one line; empty
        takes it away). One row per event in event_entry_prizes.
   PUT  ?action=void-draw&id=<drawId>  { reason: respin|absent }  canWrite
   PUT  ?action=winner&draw=<drawId>  { eventId, entryIds }       canWrite
        Marks EVERY approved entry the entrant has for the event a winner
        (by id, and by name for the ones the wheel didn't list), and the
        draw saved.

   Every write passes canWrite, which is where the admin action log is
   written (see _audit.js); the id rides in the query string so the log
   says which entry. */
const crypto = require("crypto");
const { getDb, ensureUniqueIndex, ensureIndex } = require("./_db");
const { hasAccount, canWrite, refuseWrite, roleOf, WRITE_SCOPES, usernameFromToken, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { playerFrom } = require("./_player");
const { clientIp, clientNet, forgetOldAddresses } = require("./_net");
const { writeRefusal } = require("./_bans");
const { SECURITY_HEADERS } = require("./_headers");
const { imagesStore } = require("./_images");
const { notifyPlayers } = require("./notifications");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// Anything off the wire is text or it is nothing — see contact.js.
const text = (v) => (typeof v === "string" ? v : "");
// A one-line field, as one line — see the POST's habboName.
const oneLine = (s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

const COLLECTION = "event_entries";
const CONFIG = "event_entries_config";
const QUOTAS = "event_entry_quotas";
// The Prize Wheel's draw log (2 Nov 2026): every draw, saved or not.
const DRAWS = "event_entry_draws";
// ...and each event's prize line (2 Nov 2026, the owner's), _id the event id or "none".
const PRIZES = "event_entry_prizes";
const PRIZE_MAX = 80;
// The private folder image.js guards — keep the two in step.
const KEY_PREFIX = "entries/";

const HABBO_NAME_MAX = 60;          // the contact form's username rule
const NOTE_MAX = 500;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
/* The whole request, read before it is parsed. A 4MB picture is 5.6MB as
   base64; anything much past that is not a form this site sent. */
const BODY_MAX_CHARS = Math.floor(5.75 * 1024 * 1024);
const PAGE_SIZE = 30;

const STATUSES = ["new", "reviewed", "winner", "rejected"];

/* The wheel's limits (2 Nov 2026). An entrant has two entries an event at
   most (EVENT_ENTRIES), so ten ids is room to spare; the names read stops
   at NAMES_MAX rows and says so. */
const NAMES_MAX = 5000;
const DRAW_LIST = 200;
const DRAWS_PER_EVENT = 2000;
const ENTRY_IDS_MAX = 10;
const DRAW_REASONS = ["respin", "absent"];
/* A draw's replay (2 Nov 2026): no more slices than this (js/wheel-draw.js's
   SNAP_MAX; past it the names are too small to draw anyway), five colours
   (its JEWELS), and the spin's numbers within the ranges the wheel picks. */
const REPLAY_MAX = 400;
const REPLAY_COLOURS = 5;
const DRAW_ID = /^[A-Za-z0-9-]{8,64}$/;
const ENTRY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/* Throttles. An entry is one picture, so the caps are tighter than a lead's:
   a few in ten minutes (a wrong picture sent, then the right one), a day's
   worth per player — or per network for a signed-out entrant (1 Oct 2026;
   see the POST) — and a ceiling across everybody an hour, which
   is what holds when many addresses arrive at once. Bytes are capped per day
   too, per sender and for the whole site, on the same one-round-trip counter
   dead-end-leads.js keeps for its uploads. Raised (30 Sept 2026, the
   owner's): 5 in ten minutes a network, 600 an hour for the site — a
   launch-night event can have a room full of entrants on one address. */
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LIMIT = 10;
const GLOBAL_PER_HOUR = 600;
/* Per network over ALL its entries, signed in or not (1 Oct 2026, the
   owner's numbers). Looser than an account's own, so a household or a LAN
   party still fits; a farm of alt Discord accounts on one address doesn't. */
const NET_WINDOW_LIMIT = 15;
const NET_DAY_LIMIT = 40;
const SENDER_BYTES_PER_DAY = 40 * 1024 * 1024;
const GLOBAL_BYTES_PER_DAY = 400 * 1024 * 1024;
// Entries one entrant may make for one event: theirs, and a correction.
const EVENT_ENTRIES = 2;

// How long an event with no usable end date runs — js/event-status.js's rule.
const DEFAULT_EVENT_MS = 3 * 60 * 60 * 1000;

/* By their first bytes. PNG and JPG ONLY (30 Sept 2026, the owner's): an
   entry is a screenshot, and those are the two a screenshot comes as — a
   GIF or a WebP is refused, whatever it is labelled. */
const SIGNATURES = [
    { mime: "image/png",  ext: "png",  test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    { mime: "image/jpeg", ext: "jpg",  test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }
];
const sniff = (buffer) => SIGNATURES.find(s => s.test(buffer)) || null;

// A quiet success for the honeypot, as contact.js gives one.
const decoy = () => json(201, { id: crypto.randomUUID(), status: "new", event: null });

/* The request came from this site — player-nick.js's check. A browser always
   sends Origin on a POST; one naming another site is refused. */
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

/* Once per warm instance, each build on its own and never allowed to fail a
   request — see buildIndexes in dead-end-leads.js for why. */
let indexing = null;
function ensureIndexes(db) {
    if (!indexing) indexing = buildIndexes(db).catch(() => {});
    return indexing;
}
async function buildIndexes(db) {
    const col = db.collection(COLLECTION);
    const attempt = async (what, build) => {
        try { await build(); } catch (e) { console.error(`event-entries: ${what} index unavailable`, e); }
    };
    await attempt("id", () => ensureUniqueIndex(col, "id"));
    await ensureIndex(col, { createdAt: -1 });
    await ensureIndex(col, { status: 1, createdAt: -1 });
    await ensureIndex(col, { eventId: 1, createdAt: -1 });
    await ensureIndex(col, { net: 1, createdAt: -1 });
    await ensureIndex(col, { "from.id": 1, createdAt: -1 });
    // The wheel's draw log (2 Nov 2026).
    await attempt("draw id", () => ensureUniqueIndex(db.collection(DRAWS), "id"));
    await ensureIndex(db.collection(DRAWS), { eventId: 1, drawnAt: -1 });
    // The byte-quota day counters sweep themselves after two days.
    await attempt("quota TTL", () => db.collection(QUOTAS).createIndex({ at: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 }));
    // One entry per (sender, clientRef); partial, as the leads' is.
    await attempt("clientRef", () => col.createIndex({ sender: 1, clientRef: 1 }, {
        unique: true,
        partialFilterExpression: { clientRef: { $type: "string" } }
    }));
}

/* Thirty days on, an entry loses the address it came from (and `sender`,
   which holds it for an anonymous entrant) — the privacy policy's promise,
   kept the way contact.js and dead-end-leads.js keep it. The picture, the
   Habbo name and a signed-in entrant's Discord account stay until deleted. */
function forgetOldSenders(db) {
    return forgetOldAddresses(db.collection(COLLECTION), {
        extra: {
            filter: { $or: [
                { sender: { $regex: "^ip:" } },
                { sender: { $exists: false }, clientRef: { $exists: true } }
            ] },
            unset: { sender: "", clientRef: "" }
        }
    });
}

/* ---- WHICH EVENT ---- */

// js/event-status.js's "live", on the stored strings.
function isLive(ev, now) {
    const start = ev && ev.date ? Date.parse(ev.date) : NaN;
    if (!Number.isFinite(start)) return false;
    let end = ev.endDate ? Date.parse(ev.endDate) : NaN;
    if (!Number.isFinite(end) || end <= start) end = start + DEFAULT_EVENT_MS;   // as js/event-status.js
    return start <= now && now < end;
}

/* Modes: auto, none (kept, filed under no event), event (one picked), and
   closed (30 Sept 2026, the owner's): no entries at all — the POST is
   refused and the console's form says so before anybody fills it in. */
const MODES = ["auto", "none", "event", "closed"];
const CLOSED = "Entries are closed just now.";
// An entry the database or the picture store could not take (see the POST).
const UNSAVED = "Your entry couldn't be saved just now. Try again in a minute.";

async function readConfig(db) {
    const row = await db.collection(CONFIG).findOne({ _id: "open" });
    const mode = row && (row.mode === "none" || row.mode === "event" || row.mode === "closed") ? row.mode : "auto";
    return { mode, eventId: mode === "event" && typeof row.eventId === "string" ? row.eventId : null };
}

/* An event's running time, [start, end) in ms — isLive's rule — or null
   for an event with no usable start date. */
function spanOf(ev) {
    const start = ev && ev.date ? Date.parse(ev.date) : NaN;
    if (!Number.isFinite(start)) return null;
    let end = ev.endDate ? Date.parse(ev.endDate) : NaN;
    if (!Number.isFinite(end) || end <= start) end = start + DEFAULT_EVENT_MS;   // as js/event-status.js
    return { start, end };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// "19:05 UTC on 3 October", the site's UTC wording.
function utcWhen(ms) {
    const d = new Date(ms);
    const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    return `${hm} UTC on ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/* The event an entry made now belongs to: { id, title } or null.

   A PICKED event takes entries only while it runs (2 Oct 2026, the
   owner's): from its start to its end, as its dates in the archive say,
   so a launch-day pick of Vermin's Vault opens at 19:05 by itself and
   shuts when the event does. Outside that it comes back with `shut` —
   "before" or "after" — and the times, and nothing is taken (see
   entryState). An event with no start date stays open while it's picked. */
async function currentEvent(db) {
    const config = await readConfig(db);
    if (config.mode === "none" || config.mode === "closed") return null;
    const events = db.collection("events");
    const shape = { projection: { _id: 0, id: 1, title: 1, date: 1, endDate: 1 } };
    if (config.mode === "event") {
        const ev = config.eventId ? await events.findOne({ id: config.eventId }, shape) : null;
        // Chosen, then deleted: nothing, rather than an id nobody can read.
        if (!ev) return null;
        const out = { id: ev.id, title: ev.title || ev.id };
        const span = spanOf(ev);
        if (span) {
            const now = Date.now();
            out.opensAt = new Date(span.start).toISOString();
            out.closesAt = new Date(span.end).toISOString();
            if (now < span.start) out.shut = "before";
            else if (now >= span.end) out.shut = "after";
        }
        return out;
    }
    /* Automatic: the live event. Two at once (26 Oct 2026) — a long one
       like Vermin's Vault (3 Oct to 1 Nov) overlaps every short one, and
       "only when exactly one is live" filed those hours under no event —
       goes to the SHORTEST, the one an entry made now is most likely for;
       of two as long, the one that started most recently. */
    const now = Date.now();
    const live = (await events.find({}, shape).toArray()).filter(ev => ev && ev.id && isLive(ev, now));
    if (!live.length) return null;
    const ranked = live.map(ev => ({ ev, span: spanOf(ev) })).sort((a, b) => {
        const la = a.span ? a.span.end - a.span.start : Infinity;
        const lb = b.span ? b.span.end - b.span.start : Infinity;
        if (la !== lb) return la - lb;
        return (b.span ? b.span.start : -Infinity) - (a.span ? a.span.start : -Infinity);
    });
    const pick = ranked[0].ev;
    return { id: pick.id, title: pick.title || pick.id };
}

/* Whether an entry can be made now, and under which event: { ev, closed,
   message }. Closed by the Warren, or a picked event that hasn't started or
   has ended (see currentEvent), whose words say which. */
async function entryState(db) {
    if ((await readConfig(db)).mode === "closed") return { ev: null, closed: true, message: CLOSED };
    const ev = await currentEvent(db);
    if (ev && ev.shut === "before") {
        return { ev, closed: true, message: `Entries for ${ev.title} open at ${utcWhen(Date.parse(ev.opensAt))}.` };
    }
    if (ev && ev.shut === "after") return { ev, closed: true, message: `Entries for ${ev.title} have closed.` };
    return { ev, closed: false, message: "" };
}

/* ---- the byte quota ---- */

async function withinByteQuota(db, senderKey, bytes) {
    const col = db.collection(QUOTAS);
    const day = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS);
    const stamp = day.toISOString().slice(0, 10);
    const bump = (id, n) => col.findOneAndUpdate(
        { _id: id },
        { $inc: { bytes: n }, $setOnInsert: { at: day } },
        { upsert: true, returnDocument: "after" }
    ).then(doc => {
        const row = doc && doc.value !== undefined ? doc.value : doc;
        return (row && row.bytes) || 0;
    });
    /* The sender as a one-way code, not the address itself: this counter
       outlives nothing (two days, see the TTL), but an address has no
       business in it at all. */
    const who = senderKey ? crypto.createHash("sha256").update(`event-entries:${senderKey}`).digest("hex").slice(0, 32) : "";
    const ids = [...(who ? [`s:${who}:${stamp}`] : []), `all:${stamp}`];
    const totals = await Promise.all(ids.map(id => bump(id, bytes)));
    const mine = senderKey ? totals[0] : 0;
    const everyone = totals[totals.length - 1];
    const refund = () => Promise.all(ids.map(id => col.updateOne({ _id: id }, { $inc: { bytes: -bytes } }))).catch(() => {});
    /* Within the quota, the answer is how to give the bytes back (30 Sept
       2026): a picture the store then failed to take was never kept, and
       used to go on counting against the sender's day all the same. */
    if (mine <= SENDER_BYTES_PER_DAY && everyone <= GLOBAL_BYTES_PER_DAY) return refund;
    await refund();
    return null;
}

// ------------------------------------------------------------------ POST

async function handlePost(event, db) {
    if (!sameOrigin(event)) return json(403, { error: "Not from this site" });
    // Closed: refused before the body (up to 5.75MB) is even read.
    const state = await entryState(db);
    if (state.closed) return json(403, { error: state.message, closed: true });

    let raw = event.body || "";
    if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
    if (raw.length > BODY_MAX_CHARS) return json(413, { error: "That picture is too big. Keep it under 4MB." });

    let body;
    try {
        body = JSON.parse(raw || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }
    if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });

    if (text(body.website).trim()) return decoy();

    // The retry marker: up to 64 URL-safe characters, or absent (see
    // dead-end-leads.js, where this was worked out first).
    const hasRef = body.clientRef !== undefined && body.clientRef !== null;
    const clientRef = hasRef ? body.clientRef : null;
    if (hasRef && (typeof clientRef !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(clientRef))) {
        return json(400, { error: "Invalid request body" });
    }

    /* One line (30 Sept 2026): a name is typed into a one-line box, and the
       Warren's "Usernames (.txt)" writes one name to a line for the draw —
       so a hand-made request with a line break in the name put a second,
       invented name on the list. Control characters and every run of
       whitespace (line and paragraph separators included) become a space. */
    const habboName = oneLine(text(body.habboName));
    if (!habboName) return json(400, { error: "What's your Habbo Origins username?" });
    if (habboName.length > HABBO_NAME_MAX) {
        return json(400, { error: `Username is too long. Please keep it to ${HABBO_NAME_MAX} characters or fewer.` });
    }

    // `*`, not `+`: an empty file's data: URL has nothing after the comma,
    // and is told "That file is empty." below, not "Add a picture".
    const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=\s]*)$/.exec(text(body.dataUrl));
    if (!match) return json(400, { error: "Add a picture of your entry." });
    const buffer = Buffer.from(match[1], "base64");
    if (!buffer.length) return json(400, { error: "That file is empty." });
    if (buffer.length > IMAGE_MAX_BYTES) return json(400, { error: "That picture is too big. Keep it under 4MB." });
    const kind = sniff(buffer);
    if (!kind) return json(400, { error: "Pictures only: PNG or JPG." });

    const ip = clientIp(event);
    const net = clientNet(event);
    const player = playerFrom(event);
    /* Banned, or signed in under a nickname the admins turned down: the
       site's own refusal (403 banned / nickRequired, or 503), which the
       console shows as its "Can't Send" window. `game` because an entry is
       a go at an event — and it also refuses a revoked session. */
    const refusal = await writeRefusal(db, event, player ? player.id : null, { game: true });
    if (refusal) return refusal;

    const entries = db.collection(COLLECTION);
    // Who "the same sender" is, for clientRef and for the per-sender caps.
    const sender = player ? `p:${player.id}` : (ip ? `ip:${ip}` : null);
    const dedupe = Boolean(clientRef && sender);
    // `correction` too (2 Oct 2026): a retried correction was answered as a first entry.
    const earlier = () => entries.findOne({ sender, clientRef }, { projection: { _id: 0, id: 1, status: 1, eventId: 1, eventTitle: 1, correction: 1 } });
    const answer = (row, code) => json(code, {
        id: row.id, status: row.status,
        event: row.eventId ? { id: row.eventId, title: row.eventTitle || row.eventId } : null,
        // The console's thanks says whether a correction can still follow.
        ...(row.eventId ? { correction: row.correction === true } : {}),
        ...(code === 200 ? { duplicate: true } : {})
    });
    if (dedupe) {
        const prior = await earlier();
        if (prior) return answer(prior, 200);
    }

    /* Counted by account for a signed-in entrant, and by network for a
       signed-out one; a caller with neither (no address from Netlify) is
       held by the global cap alone.

       By account ALONE when signed in (1 Oct 2026). It used to be network OR
       account, so neither a new address nor a new account reset it — but
       then one household, LAN party or mobile address (CGNAT shares one
       IPv4 between strangers) shared ONE day's ten entries between everyone
       on it, and the eleventh was refused whoever sent it. A signed-out
       entrant is counted by network among the signed-out entries only, so
       a signed-in housemate's entries never use up theirs either. What
       holds a crowd of fresh Discord accounts is the network's own looser
       cap over everything it sends, signed in or not (1 Oct 2026), then the
       hourly site-wide cap and the byte quotas. */
    const who = player ? [{ "from.id": player.id }] : (net ? [{ net, from: null }] : []);
    const since = (ms) => new Date(Date.now() - ms);
    const countMine = (ms) => (who.length ? entries.countDocuments({ createdAt: { $gte: since(ms) }, $or: who }) : Promise.resolve(0));
    const countNet = (ms) => (net ? entries.countDocuments({ createdAt: { $gte: since(ms) }, net }) : Promise.resolve(0));
    const countAll = () => entries.countDocuments({ createdAt: { $gte: since(60 * 60 * 1000) } });
    const TOO_MANY = "That's a lot of entries at once. Give it ten minutes.";
    const TOO_MANY_TODAY = "That's as many entries as can be sent today. Try again tomorrow.";
    const NET_TOO_MANY = "That's a lot of entries from this network at once. Give it ten minutes.";
    const NET_TOO_MANY_TODAY = "That's as many entries as can be sent from this network today. Try again tomorrow.";
    const BUSY = "Lots of entries are arriving just now. Try again in a few minutes.";
    // Cheap early refusals; the real checks follow the insert below.
    if (await countMine(WINDOW_MS) >= WINDOW_LIMIT) return json(429, { error: TOO_MANY });
    if (await countMine(DAY_MS) >= DAY_LIMIT) return json(429, { error: TOO_MANY_TODAY });
    if (await countNet(WINDOW_MS) >= NET_WINDOW_LIMIT) return json(429, { error: NET_TOO_MANY });
    if (await countNet(DAY_MS) >= NET_DAY_LIMIT) return json(429, { error: NET_TOO_MANY_TODAY });
    if (await countAll() >= GLOBAL_PER_HOUR) return json(429, { error: BUSY });

    const ev = state.ev;
    /* TWO ENTRIES AN EVENT (2 Oct 2026, the owner's): the entry, and one more
       in case it needs correcting. Counted by account when signed in, and by
       Habbo name on the same network when not. The second is marked as the
       correction, for the Warren. Counted before the insert for the words
       and again after it, like the caps above, so two tabs sending at once
       can't make it three. */
    const nameKey = habboName.toLowerCase();
    const mineForEvent = ev ? (player ? { eventId: ev.id, "from.id": player.id } : { eventId: ev.id, from: null, net, nameKey }) : null;
    const countForEvent = () => (mineForEvent ? entries.countDocuments(mineForEvent) : Promise.resolve(0));
    const EVENT_FULL = ev ? `You've already sent two entries for ${ev.title}: your entry and its correction. That's as many as there can be.` : "";
    const before = await countForEvent();
    if (before >= EVENT_ENTRIES) return json(429, { error: EVENT_FULL, eventFull: true });
    const day = new Date().toISOString().slice(0, 10);
    const key = `${KEY_PREFIX}${day}/${crypto.randomUUID()}.${kind.ext}`;
    const entry = {
        id: crypto.randomUUID(),
        habboName,
        nameKey,
        ...(ev && before >= 1 ? { correction: true } : {}),
        eventId: ev ? ev.id : null,
        eventTitle: ev ? ev.title : null,
        image: { key, contentType: kind.mime, bytes: buffer.length },
        // From the session, never the body — see contact.js.
        from: player ? { id: player.id, name: player.name, username: player.username || null, nick: player.nick || null, verified: true } : null,
        ip,
        net,
        status: "new",
        note: "",
        createdAt: new Date(),
        ...(dedupe ? { clientRef, sender } : {})
    };

    /* INSERT FIRST, THEN COUNT, and take it back if it went over — see
       contact.js. The picture is written only once the row has survived, so
       a refused entry never costs storage; a failed write takes the row
       with it rather than leaving it pointing at nothing. */
    try {
        await entries.insertOne(entry);
    } catch (e) {
        if (!(dedupe && e && e.code === 11000)) throw e;
        const prior = await earlier();
        if (!prior) throw e;
        return answer(prior, 200);
    }
    const takeBack = () => entries.deleteOne({ id: entry.id });
    if (await countMine(WINDOW_MS) > WINDOW_LIMIT) { await takeBack(); return json(429, { error: TOO_MANY }); }
    if (await countMine(DAY_MS) > DAY_LIMIT) { await takeBack(); return json(429, { error: TOO_MANY_TODAY }); }
    if (await countNet(WINDOW_MS) > NET_WINDOW_LIMIT) { await takeBack(); return json(429, { error: NET_TOO_MANY }); }
    if (await countNet(DAY_MS) > NET_DAY_LIMIT) { await takeBack(); return json(429, { error: NET_TOO_MANY_TODAY }); }
    if (await countAll() > GLOBAL_PER_HOUR) { await takeBack(); return json(429, { error: BUSY }); }
    if (await countForEvent() > EVENT_ENTRIES) { await takeBack(); return json(429, { error: EVENT_FULL, eventFull: true }); }
    const quotaKey = player ? `p:${player.id}` : net;
    const refundBytes = await withinByteQuota(db, quotaKey, buffer.length);
    if (!refundBytes) {
        await takeBack();
        return json(429, { error: TOO_MANY_TODAY });
    }
    try {
        await imagesStore().set(key, buffer, { metadata: { contentType: kind.mime } });
    } catch (e) {
        await takeBack().catch(() => {});
        await refundBytes();
        /* The store not answering is an outage to wait out, said as one (1
           Oct 2026): rethrown, it reached the handler's 500 "Something went
           wrong with that entry", which reads as the entrant's fault and
           filed a fault, not an outage, in the Errors tab. Nothing is kept,
           so Send again is safe; the same clientRef is a fresh entry. */
        console.error("event-entries: picture store failed", e && e.message);
        return json(503, { error: UNSAVED });
    }
    return answer(entry, 201);
}

// ------------------------------------------------------------------- GET

async function handleList(event, db, q) {
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    const status = text(q.status) || "all";
    if (status !== "all" && !STATUSES.includes(status)) return json(400, { error: "Unknown status" });
    const eventFilter = text(q.event);
    const filter = {};
    if (status !== "all") filter.status = status;
    if (eventFilter === "none") filter.eventId = null;
    else if (eventFilter) filter.eventId = eventFilter;
    const page = Math.max(0, Math.min(10000, parseInt(q.page, 10) || 0));

    /* Where an entry came from — its address and the entrant's Discord id —
       only for the site roles, the line contact.js draws. `net` and
       `sender` are bookkeeping, shown to nobody. */
    const role = await roleOf(event);
    const full = (WRITE_SCOPES[role] || []).includes("site");
    const projection = full
        ? { _id: 0, net: 0, sender: 0, clientRef: 0 }
        // And their Discord name and handle (5 Oct 2026): the Warren shows
        // the other roles nicknames only.
        : { _id: 0, net: 0, sender: 0, clientRef: 0, ip: 0, "from.id": 0, "from.name": 0, "from.username": 0 };

    const entries = db.collection(COLLECTION);
    let cursor = entries.find(filter, { projection }).sort({ createdAt: -1 });
    if (page && typeof cursor.skip === "function") cursor = cursor.skip(page * PAGE_SIZE);
    const [list, total, ...byStatus] = await Promise.all([
        cursor.limit(PAGE_SIZE).toArray(),
        entries.countDocuments(filter),
        ...STATUSES.map(s => entries.countDocuments({ status: s }))
    ]);
    const counts = {};
    STATUSES.forEach((s, i) => { counts[s] = byStatus[i]; });
    const [config, open] = await Promise.all([readConfig(db), currentEvent(db)]);
    return json(200, { entries: list, total, page, pageSize: PAGE_SIZE, counts, config, open });
}

// ------------------------------------------------------------------- PUT

async function handleOpen(event, db) {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });
    const mode = text(body.mode);
    if (!MODES.includes(mode)) return json(400, { error: "mode must be auto, none, event or closed" });
    const eventId = mode === "event" ? text(body.eventId).trim() : null;
    if (mode === "event") {
        if (!eventId || eventId.length > 200) return json(400, { error: "Which event?" });
        const ev = await db.collection("events").findOne({ id: eventId }, { projection: { _id: 0, id: 1 } });
        if (!ev) return json(404, { error: "That event is not in the archive" });
    }
    await db.collection(CONFIG).updateOne(
        { _id: "open" },
        { $set: { mode, eventId, setBy: usernameFromToken(event), setAt: new Date() } },
        { upsert: true }
    );
    return json(200, { config: await readConfig(db), open: await currentEvent(db) });
}

async function handleReview(event, db, id) {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });
    const set = {};
    if (body.status !== undefined) {
        const status = text(body.status);
        if (!STATUSES.includes(status)) return json(400, { error: "status must be new, reviewed, winner or rejected" });
        set.status = status;
    }
    if (body.note !== undefined) {
        const note = text(body.note).trim();
        if (note.length > NOTE_MAX) return json(400, { error: "Keep the note shorter" });
        set.note = note;
    }
    if (!Object.keys(set).length) return json(400, { error: "Nothing to change" });
    /* Who did what, said separately (3 Oct 2026). reviewedBy was stamped on
       every PUT, a note on its own included, and the Warren then read
       "Winner by X" for an admin who had only typed a note on somebody
       else's winner. It moves now only when the status does; a note that
       changes gets its own noteBy and noteAt. */
    const current = await db.collection(COLLECTION).findOne({ id }, { projection: { _id: 0, status: 1, note: 1, from: 1, eventTitle: 1, approvalNoticed: 1 } });
    if (!current) return json(404, { error: "No such entry" });
    const who = usernameFromToken(event);
    const now = new Date();
    if (set.status !== undefined && set.status !== (current.status || "new")) {
        set.reviewedBy = who;
        set.reviewedAt = now;
    }
    if (set.note !== undefined && set.note !== (current.note || "")) {
        set.noteBy = who;
        set.noteAt = now;
    }
    /* APPROVED: THE PLAYER IS TOLD (5 Oct 2026, the owner's). The first time
       an entry is approved, the player who sent it — known only when they
       were signed in to send it — gets a notice in the Habbo Console on their
       next visit (notifications.js). Once per entry: approved, changed and
       approved again does not tell them twice.
       From the bug scan (5 Oct 2026): a Winner is approved too — the
       Warren offers Winner straight from New, and the sender was told
       they'd hear when it was approved; the once is CLAIMED atomically, so
       two admins approving together send one notice; and the claim is let
       go again if the notice could not be stored, so the next approve
       tries again. */
    const APPROVED = ["reviewed", "winner"];
    const approving = APPROVED.includes(set.status) && !APPROVED.includes(current.status || "new") &&
        !current.approvalNoticed && !!(current.from && current.from.id);
    const res = await db.collection(COLLECTION).updateOne({ id }, { $set: set });
    if (!res.matchedCount) return json(404, { error: "No such entry" });
    if (approving) {
        const claim = await db.collection(COLLECTION).updateOne({ id, approvalNoticed: { $ne: true } }, { $set: { approvalNoticed: true } });
        if (claim.modifiedCount) {
            const what = current.eventTitle ? String(current.eventTitle) : "the event";
            const nid = await notifyPlayers(db, [current.from.id], `Your event entry for ${what} was approved! Good luck!`, { kind: "entry", ref: id, by: who || "site" });
            if (!nid) await db.collection(COLLECTION).updateOne({ id }, { $unset: { approvalNoticed: "" } }).catch(() => {});
        }
    }
    return json(200, { id, ...set });
}

// ------------------------------------------------ THE PRIZE WHEEL (2 Nov 2026)

function bodyOf(event) {
    try {
        const b = JSON.parse(event.body || "{}");
        return b && typeof b === "object" && !Array.isArray(b) ? b : null;
    } catch (e) {
        return null;
    }
}
// An event as the wheel names it: an id, or "none" for entries filed under
// no event (stored as null). undefined when it is neither.
function wheelEvent(v) {
    const s = text(v).trim();
    if (!s || s.length > 200) return undefined;
    return s === "none" ? null : s;
}
// A list of entry ids, each once; null when it isn't one.
function entryIdList(v) {
    if (!Array.isArray(v) || v.length > ENTRY_IDS_MAX) return null;
    const out = [];
    for (const x of v) {
        if (typeof x !== "string" || !ENTRY_ID.test(x)) return null;
        if (!out.includes(x)) out.push(x);
    }
    return out;
}

/* The wheel's entrants in one read (2 Nov 2026, the security scan): it used
   to page through the list thirty at a time, each page eight queries. Only
   the fields the wheel shows. Grouped by name, ignoring case, as the
   Warren's Usernames (.txt) is, so a correction is not a second slice; a
   name with ANY winning entry for the event is `won`, which is what keeps a
   past winner off the wheel even where an older entry of theirs is still
   only approved (marked before this file marked them all). */
async function handleNames(event, db, q) {
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    const eventId = wheelEvent(q.event);
    if (eventId === undefined) return json(400, { error: "Which event?" });
    const [rows, prize] = await Promise.all([
        db.collection(COLLECTION).find(
            { eventId, status: { $in: ["reviewed", "winner"] } },
            { projection: { _id: 0, id: 1, habboName: 1, status: 1 } }
        ).sort({ createdAt: 1 }).limit(NAMES_MAX).toArray(),
        db.collection(PRIZES).findOne({ _id: eventId === null ? "none" : eventId }, { projection: { _id: 0, text: 1 } })
    ]);
    const byName = new Map();
    rows.forEach(x => {
        const name = oneLine(text(x.habboName));
        if (!name) return;
        const key = name.toLowerCase();
        if (!byName.has(key)) byName.set(key, { name, entryIds: [], won: false });
        const who = byName.get(key);
        if (typeof x.id === "string") who.entryIds.push(x.id);
        if (x.status === "winner") who.won = true;
    });
    return json(200, {
        entrants: Array.from(byName.values()),
        truncated: rows.length >= NAMES_MAX,
        prize: prize && typeof prize.text === "string" ? prize.text : ""
    });
}

/* The prize line (2 Nov 2026, the owner's): what the draw is for, shown on
   the wheel under the event's name. One line, PRIZE_MAX at most; empty
   takes it away. Kept per event, so it is the same on every device and
   comes back when the event is picked again. */
async function handlePrize(event, db, q) {
    const eventId = wheelEvent(q.event);
    if (eventId === undefined) return json(400, { error: "Which event?" });
    const body = bodyOf(event);
    if (!body || typeof body.text !== "string") return json(400, { error: "Invalid request body" });
    const prize = oneLine(body.text);
    if (prize.length > PRIZE_MAX) return json(400, { error: `Keep the prize to ${PRIZE_MAX} characters.` });
    const col = db.collection(PRIZES);
    const _id = eventId === null ? "none" : eventId;
    if (!prize) await col.deleteOne({ _id });
    else await col.updateOne({ _id }, { $set: { text: prize, setBy: usernameFromToken(event), setAt: new Date() } }, { upsert: true });
    return json(200, { prize });
}

/* A draw's replay, checked (2 Nov 2026; see the header): the object to
   keep, or null for one that isn't exactly the wheel that drew `name` with
   `onWheel` slices. Nothing in it but display names and numbers. */
const TAU = Math.PI * 2;
function cleanReplay(v, name, onWheel) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const { names, colours, win, from, where, turns, decel } = v;
    if (!Array.isArray(names) || names.length < 1 || names.length > REPLAY_MAX || names.length !== onWheel) return null;
    const n = names.length;
    const clean = [];
    for (const x of names) {
        if (typeof x !== "string") return null;
        const s = oneLine(x);
        if (!s || s.length > HABBO_NAME_MAX) return null;
        clean.push(s);
    }
    if (!Array.isArray(colours) || colours.length !== n || colours.some(c => !Number.isInteger(c) || c < 0 || c >= REPLAY_COLOURS)) return null;
    if (!Number.isInteger(win) || win < 0 || win >= n || clean[win] !== name) return null;
    const num = x => typeof x === "number" && Number.isFinite(x);
    if (!num(from) || Math.abs(from) > TAU) return null;
    // Inside the winning slice: the wheel never stops on a divider.
    if (!num(where) || where <= win * TAU / n || where >= (win + 1) * TAU / n) return null;
    if (!Number.isInteger(turns) || turns < 6 || turns > 8) return null;
    if (!num(decel) || decel < 8.6 || decel > 10.2) return null;
    return { names: clean, colours: colours.slice(), win, from, where, turns, decel };
}

async function handleDrawList(event, db, q) {
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    const eventId = wheelEvent(q.event);
    if (eventId === undefined) return json(400, { error: "Which event?" });
    // Without the replays: up to 400 names each, read one at a time (handleDrawOne).
    const draws = await db.collection(DRAWS).find({ eventId }, { projection: { _id: 0, replay: 0 } })
        .sort({ drawnAt: -1 }).limit(DRAW_LIST).toArray();
    return json(200, { draws });
}

// One draw, its replay included (2 Nov 2026: for an article).
async function handleDrawOne(event, db, q) {
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    const id = text(q.id);
    if (!DRAW_ID.test(id)) return json(400, { error: "Which draw?" });
    const draw = await db.collection(DRAWS).findOne({ id }, { projection: { _id: 0 } });
    if (!draw) return json(404, { error: "That draw isn't in the log." });
    return json(200, { draw });
}

/* One draw into the log, the moment the wheel lands. The id is made by the
   wheel, so a retry (a lost answer, or a draw kept in the tab over an
   expired session and logged after signing in again) is the same row, not a
   second one. Who drew it is the session's account, never the body's; when,
   the wheel's own time if it is a believable one (up to a day old). */
async function handleDrawLog(event, db, q) {
    const id = text(q.id);
    if (!DRAW_ID.test(id)) return json(400, { error: "Which draw?" });
    const body = bodyOf(event);
    if (!body) return json(400, { error: "Invalid request body" });
    const eventId = wheelEvent(body.eventId);
    if (eventId === undefined) return json(400, { error: "Which event?" });
    const name = oneLine(text(body.name));
    if (!name || name.length > HABBO_NAME_MAX) return json(400, { error: "Which name was drawn?" });
    const entryIds = entryIdList(body.entryIds === undefined ? [] : body.entryIds);
    if (!entryIds) return json(400, { error: "Invalid entry ids" });
    const onWheel = body.onWheel;
    if (typeof onWheel !== "number" || !Number.isInteger(onWheel) || onWheel < 1 || onWheel > 100000) return json(400, { error: "How many were on the wheel?" });
    // The prize line it was drawn for, as the wheel showed it (2 Nov 2026).
    const prize = oneLine(text(body.prize));
    if (prize.length > PRIZE_MAX) return json(400, { error: "Invalid prize" });
    const now = Date.now();
    const said = Date.parse(text(body.drawnAt));
    const drawnAt = new Date(Number.isFinite(said) && said <= now + 5 * 60 * 1000 && said >= now - DAY_MS ? said : now);
    const draws = db.collection(DRAWS);
    const prior = await draws.findOne({ id }, { projection: { _id: 0 } });
    if (prior) return json(200, { draw: prior });
    if (await draws.countDocuments({ eventId }) >= DRAWS_PER_EVENT) return json(429, { error: "That event's draw log is full." });
    // The wheel as it spun (2 Nov 2026): kept when it checks out, else the draw alone.
    const replay = cleanReplay(body.replay, name, onWheel);
    await draws.updateOne({ id }, { $setOnInsert: {
        eventId, name, entryIds, byHand: !entryIds.length, onWheel,
        leftOutWinners: body.leftOutWinners === true, prize,
        ...(replay ? { replay } : {}),
        status: "drawn", drawnBy: usernameFromToken(event), drawnAt, loggedAt: new Date(now)
    } }, { upsert: true });
    return json(201, { draw: await draws.findOne({ id }, { projection: { _id: 0 } }) });
}

/* A draw set aside: spun again, or the winner wasn't in the room. A saved
   draw stays saved (409); voiding twice is the same answer. */
async function handleDrawVoid(event, db, q) {
    const id = text(q.id);
    if (!DRAW_ID.test(id)) return json(400, { error: "Which draw?" });
    const body = bodyOf(event);
    if (!body) return json(400, { error: "Invalid request body" });
    const reason = text(body.reason);
    if (!DRAW_REASONS.includes(reason)) return json(400, { error: "reason must be respin or absent" });
    const draws = db.collection(DRAWS);
    const res = await draws.updateOne({ id, status: "drawn" },
        { $set: { status: "void", reason, voidedBy: usernameFromToken(event), voidedAt: new Date() } });
    const row = await draws.findOne({ id }, { projection: { _id: 0 } });
    if (!row) return json(404, { error: "That draw isn't in the log." });
    if (!res.matchedCount && row.status !== "void") return json(409, { error: "That draw is saved as the winner, so it stays.", draw: row });
    return json(200, { draw: row });
}

/* Mark as Winner. EVERY approved entry the entrant has for the event, not
   just the newest (2 Nov 2026, the bug scan): marking one left the other,
   an entry and its correction, approved, and so on the next wheel. The ids
   the wheel sent must all be this event's and approved (or already
   winners); the rest of that name's approved entries for the event go with
   them. The draw, when named, is marked saved. */
async function handleWinner(event, db, q) {
    const body = bodyOf(event);
    if (!body) return json(400, { error: "Invalid request body" });
    const eventId = wheelEvent(body.eventId);
    if (eventId === undefined) return json(400, { error: "Which event?" });
    const ids = entryIdList(body.entryIds);
    if (!ids || !ids.length) return json(400, { error: "Which entries?" });
    const drawId = text(q.draw);
    if (drawId && !DRAW_ID.test(drawId)) return json(400, { error: "Which draw?" });
    const entries = db.collection(COLLECTION);
    const named = await entries.find({ id: { $in: ids }, eventId },
        { projection: { _id: 0, id: 1, habboName: 1, nameKey: 1, status: 1 } }).toArray();
    if (named.length !== ids.length) return json(404, { error: "Those entries aren't all in this event any more. Refresh the wheel." });
    if (named.some(x => x.status !== "reviewed" && x.status !== "winner")) {
        return json(409, { error: "One of those entries is no longer approved. Refresh the wheel." });
    }
    const keys = Array.from(new Set(named.map(x => oneLine(text(x.nameKey || x.habboName)).toLowerCase()).filter(Boolean)));
    const who = usernameFromToken(event);
    const now = new Date();
    const res = await entries.updateMany(
        { eventId, status: "reviewed", $or: [{ id: { $in: ids } }, { nameKey: { $in: keys } }] },
        { $set: { status: "winner", reviewedBy: who, reviewedAt: now } }
    );
    let draw = null;
    if (drawId) {
        const draws = db.collection(DRAWS);
        await draws.updateOne({ id: drawId, status: "drawn" }, { $set: { status: "saved", savedBy: who, savedAt: now } });
        draw = await draws.findOne({ id: drawId }, { projection: { _id: 0 } });
    }
    return json(200, { marked: res.modifiedCount || 0, draw });
}

// --------------------------------------------------------------- handler

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
        // Built by the requests that write, not by an anonymous read.
        if (event.httpMethod !== "GET") await ensureIndexes(db);
    } catch (e) {
        console.error("event-entries: database connection failed", e);
        return json(503, { error: UNSAVED });
    }
    const q = event.queryStringParameters || {};

    try {
        // The wheel's reads are one query each (2 Nov 2026); the list's
        // own read, every minute, does the sweep.
        if (event.httpMethod === "GET" && q.names === "1") return await handleNames(event, db, q);
        if (event.httpMethod === "GET" && q.action === "draws") return await handleDrawList(event, db, q);
        if (event.httpMethod === "GET" && q.action === "draw") return await handleDrawOne(event, db, q);

        if (event.httpMethod === "POST" || event.httpMethod === "GET") await forgetOldSenders(db);

        if (event.httpMethod === "POST") return await handlePost(event, db);

        if (event.httpMethod === "GET") {
            if (q.action === "open") {
                const state = await entryState(db);
                return json(200, {
                    event: state.ev ? { id: state.ev.id, title: state.ev.title } : null,
                    closed: state.closed,
                    ...(state.closed ? { message: state.message } : {}),
                    // When the answer next changes by itself, so an open form can ask again then.
                    ...(state.ev && state.ev.shut === "before" ? { changesAt: state.ev.opensAt }
                        : state.ev && !state.ev.shut && state.ev.closesAt ? { changesAt: state.ev.closesAt } : {})
                });
            }
            return await handleList(event, db, q);
        }

        if (event.httpMethod !== "PUT" && event.httpMethod !== "DELETE") return json(405, { error: "Method not allowed" });
        if (!(await canWrite(event))) return await refuseWrite(event);

        if (event.httpMethod === "PUT") {
            if (q.action === "open") return await handleOpen(event, db);
            if (q.action === "draw") return await handleDrawLog(event, db, q);
            if (q.action === "void-draw") return await handleDrawVoid(event, db, q);
            if (q.action === "winner") return await handleWinner(event, db, q);
            if (q.action === "prize") return await handlePrize(event, db, q);
            if (q.action) return json(400, { error: "Unknown action" });
            const id = text(q.id);
            if (!id) return json(400, { error: "Missing entry id" });
            return await handleReview(event, db, id);
        }

        // DELETE: the picture first — a row without its picture is harmless,
        // a picture no row points at is litter nothing will ever sweep.
        const id = text(q.id);
        if (!id) return json(400, { error: "Missing entry id" });
        const entries = db.collection(COLLECTION);
        const row = await entries.findOne({ id }, { projection: { _id: 0, id: 1, image: 1 } });
        if (!row) return json(404, { error: "No such entry" });
        const key = row.image && typeof row.image.key === "string" ? row.image.key : "";
        /* A failed delete keeps the row (30 Sept 2026). The store answers a
           key that is already gone without throwing, so a throw here is the
           store being unreachable — and carrying on to delete the row made
           exactly the orphan the order above exists to prevent. The Warren
           says "Not deleted", and pressing Delete again finishes it. */
        if (key.startsWith(KEY_PREFIX)) {
            try {
                await imagesStore().delete(key);
            } catch (e) {
                console.error("event-entries: picture delete failed", key, e && e.message);
                return json(503, { error: "The picture couldn't be deleted just now. Try again in a minute." });
            }
        }
        await entries.deleteOne({ id });
        return json(200, { deleted: id });
    } catch (e) {
        console.error("event-entries: request failed", e);
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        /* ...and so is the database dropping mid-request (1 Oct 2026), as
           bans.js, auth.js and players-admin.js tell it apart: an entrant is
           told to try again in a minute rather than that something went
           wrong with their entry, and the Warren gets the 503 it retries. */
        if (e && /^Mongo/.test(e.name || "")) {
            return event.httpMethod === "POST" ? json(503, { error: UNSAVED }) : AUTH_UNAVAILABLE;
        }
        return json(500, { error: "Something went wrong with that entry." });
    }
};

/* Failures reported to /warren's Errors tab: see withErrorReporting in
   _errors.js. Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("event-entries", exports.handler);

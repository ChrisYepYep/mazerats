/* Is this request banned — and how badly. (29 Sept 2026)

   The one ban check for the whole site. Until today the only bans were on
   the contact form and Missing Pieces: an IP address (and its IPv6 /64)
   that got a silent, fake success (isBanned in _net.js). The owner's
   decisions for launch widen that into moderation proper:

     TWO LEVELS.
       "soft"  everything but reading. The archive stays browsable, but they
               cannot sign in, play any game or appear on any board, set a
               nickname, or send a contact message, a Missing Pieces lead or
               its screenshots.
       "full"  the whole site. Every page shows a banned screen; only the
               privacy policy stays readable.

     FOUR TARGETS, one ban document each:
       { kind: "player",  value: <Discord id> }
       { kind: "ip",      value: <one address> }
       { kind: "net",     value: <the subscriber: an IPv4 address as it is,
                                  or an IPv6 /64, as subscriberOf in _net.js> }
       { kind: "nethash", value: <the scrambled network code a signed-in
                                  player's row keeps; see netHashOf below> }
     beside { level, until, reason, by, at }. `until` is a Date for a
     cool-down (Warren offers 1h / 24h / 7d / custom) and null for a
     permanent ban. No device mark and no fingerprinting: the owner's rule.

     THE OLD DOCUMENTS still count, exactly as they did. They look like
     { id, ip, net, reason, createdAt, createdBy } with no `kind` at all,
     and each one bans its address OR its network (see bans.js for why the
     network), at level "soft", for ever. Nothing migrates them; they are
     simply read that way here, and bans.js lets the Warren edit them.

   WHICH BAN WINS when several match one request (the account, the address,
   the /64 and the network code can each have their own): "full" beats
   "soft"; at the same level a permanent ban beats a cool-down; between two
   cool-downs the one that ends later wins. That one ban is what `me`
   reports and what a refusal quotes.

   ENDED COOL-DOWNS are ignored everywhere, by comparing `until` with the
   clock on every read — never by trusting that they have been deleted. They
   are ALSO swept up by a TTL index on `until` (bans.js builds it), set a week
   past the end rather than at it, so the Warren's Bans panel can show a
   cool-down that has just run out ("active: false") before Mongo tidies it
   away. The TTL only ever touches documents whose `until` is a Date, so a
   permanent ban (until: null) and every old document are never swept.

   WHAT THE SERVER CAN AND CANNOT BLOCK. Every WRITE a player or visitor makes
   asks writeRefusal below and is refused with 403 { error, banned: { level,
   until } } — soft and full alike, so a full ban is a server-side refusal of
   the same writes. What a full ban adds is the blocking of READS, and that
   is done by the page (js/account.js, from `me.ban` — see discord-auth.js),
   not here: the pages are static files served straight from Netlify's CDN,
   and refusing them server-side would need an edge function in front of
   every page, which this site does not have. The reads are the public
   archive anyway, so a determined banned visitor reading the JSON by hand
   learns nothing that is not public; the banned screen is for everybody
   else's benefit, not a lock.

   CHEAP ON PURPOSE. Every game move asks this, so the answer is memoised per
   warm instance for MEMO_MS per (player, address) pair, and bans.js empties
   the memo whenever it changes a ban in the same instance. Another instance
   may keep a lifted or new ban for up to MEMO_MS — thirty seconds of a ban
   landing late is the price of not reading the bans collection on every
   pick of every round.

   FAILING. banFor, for READS (`me`, the sign-in), fails OPEN: a database
   blip must not show everybody on the site a banned screen or refuse every
   sign-in. writeRefusal, for WRITES, answers a lookup it could not make as
   the 503 each write already gives for a database it cannot reach — the
   write was going to need that database anyway. */
const crypto = require("crypto");
const { clientIp, subscriberOf } = require("./_net");
const { SECURITY_HEADERS } = require("./_headers");

const COLLECTION = "bans";
const KINDS = ["player", "ip", "net", "nethash"];
const LEVELS = ["soft", "full"];
const MEMO_MS = 30 * 1000;
// A warm instance meets at most a few thousand visitors between cold
// starts; past this the memo is simply emptied rather than managed.
const MEMO_MAX = 5000;

/* ---- THE NETWORK CODE (29 Sept 2026).

   So the Warren can ban a signed-in troll's NETWORK without the site
   keeping their address: the sign-in and every `me` (discord-auth.js) store
   on the players row `netHash`, an HMAC of the network they came from under
   SESSION_SECRET, and never the address itself. A "nethash" ban is on that
   code, and matches any later request whose own network hashes the same —
   signed in or not, on any account.

   The NETWORK (subscriberOf: the IPv4 address, or the IPv6 /64), not the
   address, for the reason bans went by network in the first place: an IPv6
   visitor can step to the next address in their /64 on every request.

   Keyed, so it cannot be walked back: an unkeyed hash of an IPv4 address is
   four billion guesses away from the address. The "mazerats-net:" tag keeps
   it from ever equalling anything else the site signs under the same secret
   (compare _publicid.js's domain tag). 22 characters of base64url is 132
   bits — no two networks will ever share one. No secret, no code: null,
   and nothing is stored or matched. The privacy policy says all this in
   plain words (js/privacy-content.js). */
function netHashOf(net) {
    const secret = process.env.SESSION_SECRET;
    if (!secret || !net) return null;
    return crypto.createHmac("sha256", secret).update("mazerats-net:" + String(net)).digest("base64url").slice(0, 22);
}

// The request's own network code, or null with no address to go on.
function netHashFor(event) {
    const ip = clientIp(event);
    return ip ? netHashOf(subscriberOf(ip)) : null;
}

/* ---- reading one ban document ---- */

// "full" only when it says so: anything else, and every old document, soft.
const levelOf = (doc) => (doc && doc.level === "full" ? "full" : "soft");

/* The end of a cool-down as a Date, or null for a permanent ban. Stored as a
   Date by bans.js; a string is read too, in case one is ever typed into
   Atlas by hand. An `until` that cannot be read at all counts as permanent:
   a ban whose end nobody can tell is not one to quietly drop. */
function untilOf(doc) {
    const u = doc && doc.until;
    if (u === undefined || u === null || u === "") return null;
    const t = u instanceof Date ? u.getTime() : Date.parse(u);
    return Number.isFinite(t) ? new Date(t) : null;
}

function isActive(doc, now = Date.now()) {
    const u = untilOf(doc);
    return !u || u.getTime() > now;
}

// The contract's `kind`; an old document is an address ban (see the header).
const kindOf = (doc) => (doc && KINDS.includes(doc.kind) ? doc.kind : "ip");

/* True when `a` is the more severe of two bans — see WHICH BAN WINS. */
function severer(a, b) {
    if (!b) return true;
    const la = levelOf(a) === "full" ? 1 : 0;
    const lb = levelOf(b) === "full" ? 1 : 0;
    if (la !== lb) return la > lb;
    const ua = untilOf(a), ub = untilOf(b);
    if (!ua || !ub) return !ua && !!ub;
    return ua.getTime() > ub.getTime();
}

// The most severe ACTIVE ban among `docs`, or null.
function mostSevere(docs, now = Date.now()) {
    let best = null;
    for (const d of docs || []) if (d && isActive(d, now) && severer(d, best)) best = d;
    return best;
}

// What callers are given: never the target itself, never who made it.
function summary(doc) {
    if (!doc) return null;
    const u = untilOf(doc);
    return {
        level: levelOf(doc),
        until: u ? u.toISOString() : null,
        reason: typeof doc.reason === "string" ? doc.reason : "",
        kind: kindOf(doc)
    };
}

/* Does this document ban a request with these keys? An old document (no
   kind) bans its address or its network, exactly as isBanned always read
   it; a new one bans only its own kind's value. The query below already
   narrowed to documents that might; this is the exact answer, so a kind
   "ip" document that also carries `ip` for the Warren's old list (see
   bans.js) can never widen to the network by accident. */
function banMatches(doc, keys) {
    switch (doc && doc.kind) {
        case "player": return !!keys.playerId && doc.value === keys.playerId;
        case "ip": return !!keys.ip && doc.value === keys.ip;
        case "net": return !!keys.net && doc.value === keys.net;
        case "nethash": return !!keys.hash && doc.value === keys.hash;
        default:
            if (doc && doc.kind !== undefined && doc.kind !== null) return false;   // a kind we do not know bans nothing
            return (!!keys.ip && doc.ip === keys.ip) || (!!keys.net && doc.net === keys.net);
    }
}

function keysOf(event, playerId) {
    const ip = clientIp(event);
    const net = ip ? subscriberOf(ip) : null;
    return {
        playerId: playerId === undefined || playerId === null || playerId === "" ? null : String(playerId),
        ip, net,
        hash: net ? netHashOf(net) : null
    };
}

/* ---- the memo (see CHEAP ON PURPOSE) ----

   Holds the matching documents, not the verdict, so a cool-down that ends
   inside the thirty seconds is let go on time: the verdict is worked out
   from them afresh, against the clock, on every read. */
const memo = new Map();

function invalidate() {
    memo.clear();
}

/* Every ban document that matches this request, active or not — THROWS on a
   database error; the two wrappers below decide what that means. */
async function matchingBans(db, keys) {
    const or = [];
    if (keys.playerId) or.push({ kind: "player", value: keys.playerId });
    if (keys.ip) or.push({ ip: keys.ip }, { kind: "ip", value: keys.ip });
    if (keys.net) or.push({ net: keys.net }, { kind: "net", value: keys.net });
    if (keys.hash) or.push({ kind: "nethash", value: keys.hash });
    if (!or.length) return [];

    const memoKey = `${keys.playerId || ""}|${keys.ip || ""}`;
    const hit = memo.get(memoKey);
    if (hit && Date.now() - hit.at < MEMO_MS) return hit.docs;

    const found = await db.collection(COLLECTION)
        .find({ $or: or }, { projection: { _id: 0, kind: 1, value: 1, ip: 1, net: 1, level: 1, until: 1, reason: 1 } })
        .toArray();
    const docs = found.filter(d => banMatches(d, keys));
    if (memo.size >= MEMO_MAX) memo.clear();
    memo.set(memoKey, { at: Date.now(), docs });
    return docs;
}

/* The most severe ACTIVE ban on this request — its player id when one is
   given, its address, its /64 and its network code — as { level, until,
   reason, kind }, or null. THROWS on a database error: for callers that
   must tell "not banned" from "could not tell". */
async function lookUp(db, event, playerId) {
    const docs = await matchingBans(db, keysOf(event, playerId));
    return summary(mostSevere(docs));
}

/* The same, failing OPEN (see FAILING): for `me` and the sign-in. */
async function banFor(db, event, playerId) {
    try {
        return await lookUp(db, event, playerId);
    } catch (e) {
        console.error("bans: could not look up bans; letting this read through", e);
        return null;
    }
}

/* ---- refusing a write ---- */

const reply = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// "until Wed, 30 Sep 2026 14:00:00 GMT" — the page words it better from
// `banned.until`; this is the sentence for anything that shows `error` raw.
function bannedWords(ban) {
    const until = ban.until ? ` until ${new Date(ban.until).toUTCString()}` : "";
    return ban.level === "full"
        ? `You've been banned from Maze Rats${until}.`
        : `You've been banned from playing and posting on Maze Rats${until}. You can still read the archive.`;
}

function bannedReply(ban) {
    return reply(403, { error: bannedWords(ban), banned: { level: ban.level, until: ban.until } });
}

const NICK_REQUIRED_MESSAGE = "Set a new nickname to play.";
const nickRequiredReply = () => reply(403, { error: NICK_REQUIRED_MESSAGE, nickRequired: true });
const unavailableReply = () => reply(503, { error: "That can't be saved just now. Try again in a minute." });

/* The gate every player or visitor WRITE goes through. Returns the response
   to send instead — 403 banned, 403 nickRequired, or 503 — or null to carry
   on.

   `playerId` is the signed-in player's, or null for a signed-out visitor
   (whose network is still checked). `game: true` for a game's writes, which
   also refuses a player whose nickname the admins have rejected until they
   choose another (nickRejected, see FLAGGED in player-nick.js; the owner's
   decision of 29 Sept 2026: the window that asks can be refused, and
   refusing lets them browse but not play). That is one indexed read of the
   players row, not memoised: it has to see the new nickname the moment it
   is saved. A ban is checked first, so a banned player is told about the
   ban rather than about their nickname. */
async function writeRefusal(db, event, playerId, { game = false } = {}) {
    let ban;
    try {
        ban = await lookUp(db, event, playerId);
    } catch (e) {
        console.error("bans: could not look up bans for a write", e);
        return unavailableReply();
    }
    if (ban) return bannedReply(ban);
    if (game && playerId) {
        try {
            const row = await db.collection("players").findOne({ id: String(playerId) }, { projection: { _id: 0, nickRejected: 1 } });
            if (row && row.nickRejected && typeof row.nickRejected === "object") return nickRequiredReply();
        } catch (e) {
            console.error("bans: could not read the players row for a game write", e);
            return unavailableReply();
        }
    }
    return null;
}

/* ---- the boards ----

   The ids among `ids` whose ACCOUNT has an active ban — kind "player" only,
   as the owner put it: a banned account does not appear on any board. A
   network ban does not hide anybody's rows (it would hide whoever else
   shares the network — a school, a phone network), and stops them adding
   new ones anyway. One $in read per board response, like nickedAmong in
   _publicid.js. Fails OPEN — an unreadable bans collection shows the board
   as it is rather than no board at all. */
async function bannedAmong(db, ids) {
    const want = [...new Set((ids || []).filter(x => x !== undefined && x !== null && x !== "").map(String))];
    if (!want.length) return new Set();
    try {
        const rows = await db.collection(COLLECTION)
            .find({ kind: "player", value: { $in: want } }, { projection: { _id: 0, value: 1, until: 1 } })
            .toArray();
        const now = Date.now();
        return new Set(rows.filter(r => isActive(r, now)).map(r => String(r.value)));
    } catch (e) {
        console.error("bans: could not read account bans for a board; showing it unfiltered", e);
        return new Set();
    }
}

/* Several board lists at once, each row carrying its RAW player id as `id`
   (the shape publicLists in _publicid.js takes, and should be called BEFORE
   it, while the id is still the raw one): one read for the lot, and every
   banned account's rows left out. New arrays; the lists passed in are left
   alone. A board already cut to its top N simply shows one fewer row per
   banned player in it — a ban is rare, and re-running the aggregation for a
   replacement row is not worth it. */
async function withoutBanned(db, lists, idOf = (r) => r && r.id) {
    const banned = await bannedAmong(db, lists.flat().map(idOf));
    if (!banned.size) return lists.map(l => (l || []).slice());
    return lists.map(list => (list || []).filter(r => !banned.has(String(idOf(r)))));
}

/* ---- for the Warren (players-admin.js) ----

   Every ACTIVE ban on an account or a network code, for marking the players
   list: { byPlayer: Map(id -> doc), byHash: Map(netHash -> doc) }, each the
   most severe for its key. The ban list is a handful of rows. THROWS — the
   Warren answers 503 for a database it cannot read, as everywhere else. */
async function accountBans(db) {
    const rows = await db.collection(COLLECTION)
        .find({ kind: { $in: ["player", "nethash"] } }, { projection: { _id: 0, kind: 1, value: 1, level: 1, until: 1, reason: 1 } })
        .toArray();
    const now = Date.now();
    const byPlayer = new Map(), byHash = new Map();
    for (const r of rows) {
        if (!isActive(r, now) || typeof r.value !== "string") continue;
        const map = r.kind === "player" ? byPlayer : byHash;
        if (severer(r, map.get(r.value))) map.set(r.value, r);
    }
    return { byPlayer, byHash };
}

// The one ban to show beside a player: their account's or their network's.
function banOfPlayer(snapshot, row) {
    if (!snapshot || !row) return null;
    const best = mostSevere([snapshot.byPlayer.get(String(row.id)), typeof row.netHash === "string" ? snapshot.byHash.get(row.netHash) : null].filter(Boolean));
    if (!best) return null;
    const s = summary(best);
    return { level: s.level, until: s.until, kind: s.kind };
}

module.exports = {
    COLLECTION, KINDS, LEVELS, MEMO_MS,
    netHashOf, netHashFor,
    levelOf, untilOf, isActive, kindOf, severer, mostSevere, summary, banMatches,
    banFor, lookUp, invalidate,
    writeRefusal, bannedReply, NICK_REQUIRED_MESSAGE,
    bannedAmong, withoutBanned,
    accountBans, banOfPlayer
};

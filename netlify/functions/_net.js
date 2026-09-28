/* Who is asking, as far as a rate limit is concerned.

   Every public throttle on this site used to count the caller's EXACT
   address, and on IPv6 that is not a caller: a subscriber is handed a whole
   /64 — eighteen quintillion addresses — and can put a fresh one on every
   request without trying. So the login cap, the contact and Missing Pieces
   caps and the upload caps could all be walked past by anybody on a modern
   connection, one new address at a time. track.js had already learnt this and
   counted by the /64; the helper lived there, and nothing else used it. Here
   now, so every limiter counts the same unit.

   For COUNTING, and now for BANS too: a ban matches the address an admin
   typed or its whole subscriber (see isBanned below, and bans.js). The
   activity log and the ban list still show the address itself — a /64 is
   the right unit to throttle and block, and the wrong one to show. */

/* Netlify's own value only. x-forwarded-for is client-settable, so honouring
   it would let a caller rotate the header and walk straight past every cap;
   and a missing address is null, never a shared literal like "unknown",
   which would let unrelated visitors rate-limit each other. */
function clientIp(event) {
    return ((event && event.headers) || {})["x-nf-client-connection-ip"] || null;
}

/* The part of an address that identifies one subscriber: IPv4 as it is, an
   IPv4 dressed as IPv6 (::ffff:1.2.3.4) as the IPv4 underneath, and any
   other IPv6 as its first four groups — the /64 — after expanding "::".
   Moved here from track.js unchanged. */
function subscriberOf(ip) {
    const s = String(ip).trim().toLowerCase().replace(/%.*$/, "");     // a zone id is local noise
    if (!s.includes(":")) return s;
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
    if (mapped) return mapped[1];
    const halves = s.split("::");
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
    // A trailing dotted quad fills two groups, not one.
    const width = (list) => list.length + (list.length && list[list.length - 1].includes(".") ? 1 : 0);
    const groups = halves.length > 1
        ? [...head, ...Array(Math.max(0, 8 - width(head) - width(tail))).fill("0"), ...tail]
        : head;
    return groups.slice(0, 4).map(g => (parseInt(g, 16) || 0).toString(16)).join(":") + "::/64";
}

/* The caller's subscriber, or null when Netlify gave no address — callers
   treat null exactly as they treated a missing address before. */
function clientNet(event) {
    const ip = clientIp(event);
    return ip ? subscriberOf(ip) : null;
}

/* ---- A CEILING ON NOTIFICATION EMAILS, for the whole site at once.

   Every contact message and every Missing Pieces lead sends the owner an
   email through Resend, and the per-caller caps above are the only thing
   between a flood and the account's sending quota. No per-caller cap
   survives an attacker with enough addresses (see track.js, which learnt
   this first), and an exhausted quota does not only mean a noisy inbox: it
   means the NEXT real message, and every password-free alert after it, goes
   nowhere until the quota resets.

   So each kind of notification gets `max` sends per clock hour, counted on
   one document per (kind, hour) and bumped in the same atomic step that
   reads it back — the insert-then-count idea in one round trip, so a
   parallel burst cannot all see room together. Over it, the email is
   skipped; the message itself is saved exactly as before and is waiting in
   Warren. Returns true when this send may go ahead.

   Fails OPEN on a database error: the message is already saved by then, and
   a notification lost to a counter hiccup is worse than one extra email. */
const NOTIFY_LIMITS = "notify_limits";
let notifyIndexed = null;

async function claimNotifySlot(db, kind, max) {
    try {
        const col = db.collection(NOTIFY_LIMITS);
        // The counters sweep themselves; memoised per warm instance.
        if (!notifyIndexed) {
            notifyIndexed = col.createIndex({ at: 1 }, { expireAfterSeconds: 2 * 60 * 60 }).catch(() => {});
        }
        const hour = new Date(Math.floor(Date.now() / 3600000) * 3600000);
        const doc = await col.findOneAndUpdate(
            { _id: `${kind}:${hour.toISOString()}` },
            { $inc: { n: 1 }, $setOnInsert: { at: hour } },
            { upsert: true, returnDocument: "after" }
        );
        // Either driver shape: the document, or { value: document }.
        const row = doc && doc.value !== undefined ? doc.value : doc;
        const n = row && row.n;
        if (typeof n === "number" && n > max) {
            console.warn(`${kind}: over ${max} notification emails this hour, skipping this one`);
            return false;
        }
        return true;
    } catch (e) {
        console.warn(`${kind}: notification cap unavailable`, e.message);
        return true;
    }
}

/* ---- IS THIS CALLER BANNED — by address, or by network.

   The one ban check, for every public form that honours bans (contact.js
   and dead-end-leads.js). Each copy used to ask for its exact address,
   which a ban on an IPv6 address could not hold: the sender's next message
   came from another address in the same /64. A ban now carries `net` as
   well as `ip` (see bans.js), and matches either — so the address itself,
   as before, OR any address on the banned network. A ban made before `net`
   existed has none, and matches its exact address alone until bans.js gives
   it one.

   False for a caller with no address at all, as each copy was: there is
   nothing to match, and a missing header is not a reason to swallow a
   message. Throws if the database does; each caller already answers that. */
async function isBanned(db, event) {
    const ip = clientIp(event);
    if (!ip) return false;
    const net = subscriberOf(ip);
    return (await db.collection("bans").countDocuments({ $or: [{ ip }, { net }] }, { limit: 1 })) > 0;
}

/* ---- ADDRESSES KEPT FOR THIRTY DAYS, and not a day more.

   A contact message and a Missing Pieces lead each keep the sender's IP
   address (and `net`, the subscriber it belongs to) for two jobs: the
   per-sender caps, which look back ten minutes, and a ban, which an admin
   makes while the message is fresh. Neither needs the address a month on,
   so after IP_KEEP_MS it is taken off the stored row — the message itself,
   and who signed it, stay until an admin deletes them. The privacy policy
   (js/privacy-content.js) promises exactly this; change one, change both.

   There is no timer on this site, so it is done by the traffic: the GET and
   POST paths of each function call this, and it runs at most once an hour
   per warm instance per collection (one updateMany over the rows past the
   cut-off that still hold an address). The memo is claimed BEFORE the
   update, so a burst of requests shares one run; a run that fails simply
   lets the next request try again.

   `field` is the row's date and `iso` says whether it is stored as an ISO
   string (contact.js's createdAt) or a Date (dead-end-leads.js's) — the
   comparison has to be made in the same type, or it matches nothing.
   `extra` is an optional second filter-and-unset for a field that holds the
   address in another form (dead-end-leads.js's `sender`, "ip:<address>").
   Never throws: a failed purge must not fail the request it rides on. */
const IP_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const FORGET_EVERY_MS = 60 * 60 * 1000;
const lastForget = new Map();

async function forgetOldAddresses(col, { field = "createdAt", iso = false, extra = null } = {}) {
    const name = col.collectionName || String(col);
    const now = Date.now();
    if (now - (lastForget.get(name) || 0) < FORGET_EVERY_MS) return;
    lastForget.set(name, now);
    const cutoffDate = new Date(now - IP_KEEP_MS);
    const cutoff = iso ? cutoffDate.toISOString() : cutoffDate;
    try {
        await col.updateMany(
            { [field]: { $lt: cutoff }, $or: [{ ip: { $exists: true } }, { net: { $exists: true } }] },
            { $unset: { ip: "", net: "" } }
        );
        if (extra) {
            await col.updateMany({ [field]: { $lt: cutoff }, ...extra.filter }, { $unset: extra.unset });
        }
    } catch (e) {
        lastForget.delete(name);
        console.warn(`${name}: could not forget old addresses`, e.message);
    }
}

module.exports = { clientIp, subscriberOf, clientNet, claimNotifySlot, isBanned, forgetOldAddresses, IP_KEEP_MS };

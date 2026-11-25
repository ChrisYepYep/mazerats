/* GUEST RATS: playing the daily games signed out (25 Nov 2026, the owner's).

   A visitor who presses "Play as a guest" becomes "Guest Rat N" and stays
   it. The number is the SAME one Pura Panic gives its guests
   (pura-scores.js): one counter, one kind of signed token, so a browser is
   one Guest Rat across the site. The token names a number and nothing else.

     Pura Panic   keeps the token in the browser's storage and sends it
     the dailies  keep it in an HttpOnly cookie (COOKIE below), set by
                  daily-guest.js, because the deal, the moves and the boards
                  all have to know who is asking

   daily-guest.js takes the browser's Pura token when it has one, and hands
   one back when it has not, so whichever is played first decides.

   IT IS THE BROWSER, NOT THE ADDRESS. A household, a school and a phone
   network each share one address, and a phone changes its own. The network
   only limits how many NEW numbers it can be given in a day (NEW_PER_DAY),
   by the scrambled code _bans.js makes of it. Clearing the cookies is a new
   guest, up to that limit.

   A guest's rows are keyed "guestrat:N" in the same collections as
   everybody's. That can never be a Discord id, which is all digits. */
const jwt = require("jsonwebtoken");
const { playerFrom, livePlayerFrom, parseCookies, publicName } = require("./_player");
const { publicIdOf } = require("./_publicid");

const COOKIE = "mr_guest";
// Pura Panic's, and it must stay so: tokens already in browsers carry it.
const RAT_AUDIENCE = "mazerats-pura-guestrat";
// Chrome's own ceiling on a cookie's life.
const MAX_AGE = 400 * 24 * 60 * 60;
const NEW_PER_DAY = 10;
const CAPS = "guest_caps";
const PREFIX = "guestrat:";

function signRat(n) {
    if (!process.env.SESSION_SECRET) return null;
    return jwt.sign({ n }, process.env.SESSION_SECRET, { audience: RAT_AUDIENCE, algorithm: "HS256" });
}
function readRat(token) {
    if (!token || typeof token !== "string" || !process.env.SESSION_SECRET) return null;
    try {
        const c = jwt.verify(token, process.env.SESSION_SECRET, { audience: RAT_AUDIENCE, algorithms: ["HS256"] });
        return c && Number.isInteger(c.n) && c.n > 0 ? c.n : null;
    } catch (e) {
        return null;
    }
}
async function nextRat(db) {
    const bump = () => db.collection("counters").findOneAndUpdate(
        { _id: "pura_guest_rat" }, { $inc: { n: 1 } }, { upsert: true, returnDocument: "after" });
    /* Two first-ever bumps racing can have the second's upsert refused with
       E11000; by then the counter exists, so the same bump again is an
       ordinary update (26 Oct 2026; bump in track.js does the same). */
    let r;
    try { r = await bump(); }
    catch (e) { if (!(e && e.code === 11000)) throw e; r = await bump(); }
    const doc = r && r.ok !== undefined && r.value !== undefined ? r.value : r;
    return doc && Number.isInteger(doc.n) ? doc.n : null;
}

const guestId = n => PREFIX + n;
const isGuestId = id => typeof id === "string" && /^guestrat:\d+$/.test(id);
const guestName = n => "Guest Rat " + n;

// A guest in the shape playerFrom answers, for the code that takes either.
function asPlayer(n) {
    return { id: guestId(n), name: guestName(n), avatar: null, username: null, nick: null, guest: true, n };
}
// What the page is told: Account.guest in js/account.js.
function guestView(n) {
    return { n, name: guestName(n), publicId: publicIdOf(guestId(n)) };
}

// The guest this browser is, or null. Never asked about a signed-in one.
function guestFrom(event) {
    const h = (event && event.headers) || {};
    const n = readRat(parseCookies(h.cookie || h.Cookie || "")[COOKIE]);
    return n ? asPlayer(n) : null;
}

// Who is playing a daily game: the account, or the guest, or nobody.
function dailyPlayerFrom(event) {
    return playerFrom(event) || guestFrom(event);
}
/* The same for reads, where a session ended elsewhere is nobody
   (livePlayerFrom) — and is not quietly this browser's guest either. */
async function liveDailyPlayerFrom(db, event) {
    return playerFrom(event) ? livePlayerFrom(db, event) : guestFrom(event);
}

function setGuestCookie(token) {
    return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}
function clearGuestCookie() {
    return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/* Whether this network has had its new guests for the day. Fails OPEN, as
   Pura's caps do: a counter that cannot be read stops nobody playing. */
let capsIndexed = false;
async function overNewGuests(db, net) {
    if (!net) return false;
    const day = new Date().toISOString().slice(0, 10);
    const col = db.collection(CAPS);
    try {
        if (!capsIndexed) {
            capsIndexed = true;
            await col.createIndex({ at: 1 }, { expireAfterSeconds: 2 * 24 * 3600 }).catch(() => { capsIndexed = false; });
        }
        const bump = () => col.findOneAndUpdate({ _id: `${net}:${day}` },
            { $inc: { n: 1 }, $setOnInsert: { at: new Date() } },
            { upsert: true, returnDocument: "after", projection: { n: 1 } });
        let r;
        try { r = await bump(); }
        catch (e) { if (!(e && e.code === 11000)) throw e; r = await bump(); }
        const doc = r && r.ok !== undefined && r.value !== undefined ? r.value : r;
        return Boolean(doc && Number(doc.n) > NEW_PER_DAY);
    } catch (e) {
        console.error("guest: could not count a new guest", e);
        return false;
    }
}

/* SIGNING IN TAKES THE GUEST'S DAYS WITH IT (25 Nov 2026, the owner's): on
   a first sign-in, or any sign-in to an account with no daily games on it.
   Called from the sign-in (discord-auth.js) with the guest cookie's player.

   All or nothing by account: an account with a single day, begun or filed,
   in either game keeps its own record, and the guest's stays the guest's.
   Then the day in hand, if the guest had begun it, is noted on the account
   as one whose answers are known (REPLAYED in _speed.js), so playing it
   again signed in files the base points and no speed bonus.

   Answers true when the days moved. Never throws. */
const DAY_ROWS = ["guess_scores", "daily_scores", "daily_starts"];
async function claimGuestDays(db, guest, player) {
    if (!guest || !player) return false;
    const from = guest.id, to = String(player.id);
    try {
        const own = await Promise.all(DAY_ROWS.map(c => db.collection(c).findOne({ playerId: to }, { projection: { _id: 1 } })));
        if (own.some(Boolean)) {
            const speed = require("./_speed");
            const begun = await db.collection("daily_starts").find({ playerId: from }, { projection: { _id: 0, game: 1, day: 1 } }).toArray();
            for (const s of begun) {
                const mine = await db.collection("daily_starts").findOne({ playerId: to, game: s.game, day: s.day }, { projection: { _id: 1 } });
                if (!mine) await speed.notePractised(db, s.game, s.day, to, speed.REPLAYED);
            }
            return false;
        }
        const name = await publicName(db, player);
        let moved = 0;
        for (const c of DAY_ROWS) {
            const set = c === "daily_starts" ? { playerId: to } : { playerId: to, name, avatar: player.avatar || null };
            const r = await db.collection(c).updateMany({ playerId: from }, { $set: set });
            moved += (r && r.modifiedCount) || 0;
        }
        return moved > 0;
    } catch (e) {
        console.error("guest: could not move a guest's days to an account", e);
        return false;
    }
}

module.exports = {
    COOKIE, RAT_AUDIENCE, NEW_PER_DAY, signRat, readRat, nextRat,
    guestId, isGuestId, guestName, guestView, guestFrom, dailyPlayerFrom, liveDailyPlayerFrom,
    setGuestCookie, clearGuestCookie, overNewGuests, claimGuestDays
};

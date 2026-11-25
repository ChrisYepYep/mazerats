/* /.netlify/functions/daily-guest — "Play as a guest" (25 Nov 2026).

   POST {rat?}   this browser's Guest Rat for the daily games: the one its
                 cookie already names; else the one its Pura Panic token
                 names (`rat`); else a new number, up to a few a day from
                 one network. Answers { guest, rat } and sets the cookie.
                 See _guest.js. */
const { getDb } = require("./_db");
const { SECURITY_HEADERS } = require("./_headers");
const { playerFrom } = require("./_player");
const { writeRefusal, netHashFor } = require("./_bans");
const guests = require("./_guest");

const json = (statusCode, data, headers = {}) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "private, no-store", ...headers },
    body: JSON.stringify(data)
});

// Only from this site's own pages; the same check as player-nick.js.
function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try { return new URL(origin).host === host; } catch (e) { return false; }
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" }, { Allow: "POST" });
    if (!sameOrigin(event)) return json(403, { error: "Not from this site" });
    if (String(event.body || "").length > 2000) return json(413, { error: "Too large" });
    if (playerFrom(event)) return json(409, { error: "You're signed in." });
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
    if (!body || typeof body !== "object") body = {};

    let db;
    try { db = await getDb(); } catch (e) { return json(503, { error: "That can't be done just now. Try again in a minute." }); }

    const had = guests.guestFrom(event);
    let n = had ? had.n : guests.readRat(body.rat);
    const refusal = await writeRefusal(db, event, n ? guests.guestId(n) : null);
    if (refusal) return refusal;

    if (!n) {
        if (await guests.overNewGuests(db, netHashFor(event))) {
            return json(429, { error: "Too many new guests from your network today. Sign in with Discord to play, or try again tomorrow." });
        }
        try { n = await guests.nextRat(db); } catch (e) { console.error("daily-guest: could not number a guest", e); }
    }
    const token = n ? guests.signRat(n) : null;
    if (!token) return json(503, { error: "That can't be done just now. Try again in a minute." });
    return json(200, { guest: guests.guestView(n), rat: { n, token } }, { "Set-Cookie": guests.setGuestCookie(token) });
};

exports.handler = require("./_errors").withErrorReporting("daily-guest", exports.handler);

/* Who the visitor is, for the parts of the site that are about a PERSON
   rather than about the archive.

   Deliberately separate from _auth.js. That file answers "is this an
   administrator, and what may they change"; this one answers "which Discord
   account is this, if any". They share nothing but the signing secret, and
   keeping them apart is the point: a player token must never be mistakable
   for an admin token, so the two use different cookies, different claim
   shapes, and different verification here. A player session grants exactly
   one thing — a name to put on a leaderboard row.

   The session is an HttpOnly cookie rather than a token in localStorage.
   That means page script cannot read it, so an injected script cannot walk
   off with somebody's session, and it means the token never passes through
   a URL where it would be written into browser history and server logs. */
const jwt = require("jsonwebtoken");

const COOKIE = "mr_player";
const MAX_AGE = 60 * 60 * 24 * 30;      // 30 days

/* Namespaced so a player token can never be replayed as an admin one: the
   admin verifier does not check this claim, but it also does not issue
   tokens carrying it, and the check below refuses anything without it. A
   stolen admin JWT presented as a player cookie fails here. */
const AUDIENCE = "mazerats-player";

function parseCookies(header) {
    const out = {};
    String(header || "").split(";").forEach(part => {
        const eq = part.indexOf("=");
        if (eq < 0) return;
        const k = part.slice(0, eq).trim();
        const v = part.slice(eq + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    });
    return out;
}

function cookieHeader(event) {
    const h = event.headers || {};
    return h.cookie || h.Cookie || "";
}

function signPlayer(player) {
    return jwt.sign(
        { sub: player.id, name: player.name, avatar: player.avatar || null },
        process.env.SESSION_SECRET,
        { expiresIn: MAX_AGE, audience: AUDIENCE }
    );
}

/* The signed-in player, or null. Never throws: every caller treats "not
   signed in" and "token no longer valid" the same way, and an endpoint
   should not 500 because somebody's cookie expired. */
function playerFrom(event) {
    if (!process.env.SESSION_SECRET) return null;
    const token = parseCookies(cookieHeader(event))[COOKIE];
    if (!token) return null;
    try {
        const claims = jwt.verify(token, process.env.SESSION_SECRET, { audience: AUDIENCE });
        if (!claims || !claims.sub) return null;
        return { id: String(claims.sub), name: claims.name || "Someone", avatar: claims.avatar || null };
    } catch (e) {
        return null;
    }
}

/* Secure is set unconditionally, including under `netlify dev` on plain
   http://localhost — browsers make an explicit exception for localhost, so
   the cookie still works there, and this way the production attribute is
   never one forgotten branch away from being dropped.

   SameSite=Lax rather than Strict: the sign-in comes back as a top-level
   navigation FROM discord.com, and Strict would withhold the cookie on
   exactly that request, so the visitor would land back on the site still
   signed out. Lax sends it on a top-level GET, which is that case and not
   much else. */
function setCookie(token) {
    return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

function clearCookie() {
    return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

module.exports = { COOKIE, AUDIENCE, MAX_AGE, signPlayer, playerFrom, setCookie, clearCookie, parseCookies };

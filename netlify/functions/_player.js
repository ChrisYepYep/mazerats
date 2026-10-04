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

/* Every cookie on the domain arrives in the one header, not only ours — and
   decodeURIComponent throws a URIError on any stray "%" that is not a valid
   escape. One malformed cookie set by anything at all (an analytics script,
   a hand-edited value, a different app on a sibling path) used to take down
   every playerFrom caller with a stack trace in the response, because
   playerFrom's own try only wraps the verify. So each value decodes on its
   own and a bad one is kept raw: it is almost certainly not ours, and if it
   is, the verify below refuses it the ordinary way. */
function parseCookies(header) {
    const out = {};
    String(header || "").split(";").forEach(part => {
        const eq = part.indexOf("=");
        if (eq < 0) return;
        const k = part.slice(0, eq).trim();
        const v = part.slice(eq + 1).trim();
        if (!k) return;
        try {
            out[k] = decodeURIComponent(v);
        } catch (e) {
            out[k] = v;
        }
    });
    return out;
}

function cookieHeader(event) {
    const h = event.headers || {};
    return h.cookie || h.Cookie || "";
}

/* `username` is Discord's unique handle, carried beside the display name.
   The display name is what people see on a board, but it is not unique —
   two people can both be "Chris" — so anything that has to say WHO sent
   something (the contact form's "(signed in)", see contact.js) needs the
   handle and the id as well. Sessions minted before it existed simply lack
   it until their next sign-in; callers treat it as optional.

   `nick` and `nickAsked` ride along too (28 Sept 2026) — the nickname a
   player chose for the site (player-nick.js) and whether they have been
   offered the chance to choose one. `name` stays the DISCORD display name
   and is never overwritten with the nick, because the admin-facing places
   (contact.js, dead-end-leads.js) need to know who somebody is on Discord;
   what the public sees is shownName below. The claims are a convenience,
   not the record: the players row is, and every board write reads the nick
   from there (publicName), so a session minted before a nick was set on
   another device cannot put the Discord name back on a board.

   `sv`, the session version (30 Sept 2026), when the players row had one to
   give — see SESSION VERSIONS below. */
function signPlayer(player) {
    return jwt.sign(
        {
            sub: player.id, name: player.name, avatar: player.avatar || null, username: player.username || null,
            nick: typeof player.nick === "string" && player.nick ? player.nick : null,
            // Unknown stays unknown (null) rather than becoming "not asked" —
            // see playerView.
            nickAsked: typeof player.nickAsked === "boolean" ? player.nickAsked : null,
            ...(isSv(player.sv) ? { sv: player.sv } : {})
        },
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
        // algorithms named for the same reason _auth.js names them: what
        // counts as a valid signature should not be inferred from the key.
        const claims = jwt.verify(token, process.env.SESSION_SECRET, { audience: AUDIENCE, algorithms: ["HS256"] });
        if (!claims || !claims.sub) return null;
        return {
            id: String(claims.sub), name: claims.name || "Someone", avatar: claims.avatar || null,
            username: typeof claims.username === "string" && claims.username ? claims.username : null,
            nick: typeof claims.nick === "string" && claims.nick ? claims.nick : null,
            /* null, not false, for a session minted before the claim
               existed: "never asked" and "we cannot tell" are different
               answers, and `me` (discord-auth.js) only falls back on this
               when the players row cannot be read. */
            nickAsked: typeof claims.nickAsked === "boolean" ? claims.nickAsked : null,
            // null for a session minted before session versions existed.
            sv: isSv(claims.sv) ? claims.sv : null
        };
    } catch (e) {
        return null;
    }
}

/* ---- SESSION VERSIONS (30 Sept 2026) ----

   A player session is a signed cookie with nothing stored behind it, so
   until now nothing could end one early: a forgotten player's phone went on
   playing, and writing new rows, for up to thirty days. Now the players row
   carries `sv`, a number written at sign-in (discord-auth.js), and every
   session signed from that row carries the same number. A session whose
   number no longer matches the row's has been revoked:

     - the row's sv has been changed (newSv, below), or
     - the row is GONE while the session still carries a number — which is
       what a forget does (player-forget.js deletes the row), and it stays
       true if the player later signs in again somewhere else, because the
       new row gets a new number.

   Checked only where the players row is read anyway — `me` in
   discord-auth.js, the nickname writes in player-nick.js — never with a
   read of its own. A session from before sv existed carries none, and
   keeps working until it expires as it always did; `me` swaps it for one
   that carries the row's number the next time it re-signs the cookie —
   unless the row has been signed out everywhere (svStrict, below).

   A timestamp rather than a counter, so a row made again after a forget
   can never hand out a number an old session already has. */
function isSv(v) {
    return typeof v === "number" && Number.isFinite(v);
}
function newSv() {
    return Date.now();
}

/* True when `player`'s session has been revoked, given the players row as
   read: the row, null for "read, and there is no row", or undefined for
   "could not be read" — which revokes nothing, since a database blink must
   not sign anybody out.

   AND A SESSION WITH NO NUMBER, ONCE THE ROW SAYS SO (1 Oct 2026). "Sign
   out on every device" (discord-auth.js) gives the row a new sv and sets
   `svStrict`. Without that flag a session from before session versions
   was not only spared — `me` re-signed it with the row's NEW number (see
   svFor), so a copied pre-sv cookie came out of "every device" holding a
   fresh, current session. With it, a session carrying no number is
   revoked like any other the row has moved on from. */
/* AND A SESSION WITH NO NUMBER WHOSE ROW IS GONE (3 Oct 2026). Every
   signed-in player has a row — the sign-in makes it — so a numberless
   session (one from before session versions, or one a sign-in issued while
   the database was down and could not stamp it) finding NO row means the
   player was forgotten. It used to pass, and player-nick.js's upsert then
   made the row again, fresh number and all, which `me` signed into the
   cookie: the forgotten account came back without a sign-in. Revoked now,
   like a numbered one. */
function sessionRevoked(player, row) {
    if (!player || row === undefined) return false;
    if (!isSv(player.sv)) return row === null || !!(row && row.svStrict === true);
    if (row === null) return true;
    return isSv(row.sv) && row.sv !== player.sv;
}

/* The number a re-signed session should carry: the row's when it has one,
   otherwise whatever the session had. */
function svFor(player, row) {
    if (row && isSv(row.sv)) return row.sv;
    return player && isSv(player.sv) ? player.sv : null;
}

/* ---- WHAT THE SITE CALLS A PLAYER (28 Sept 2026) ----

   The nickname when they have chosen one, and their Discord display name
   when they have not. Every public place a player's name appears — each
   board row, the Profile, the Fallin' Furni title screen — shows this and
   never `name` or `username` directly, so a player who has picked a
   nickname is never shown by their Discord identity anywhere public. */
function shownName(player) {
    if (!player) return "Someone";
    return (typeof player.nick === "string" && player.nick) || player.name || "Someone";
}

/* The name to WRITE onto a board row, read from the players row rather
   than the cookie. One indexed read per score submitted, which is a handful
   a day per player; what it buys is that a nick set (or cleared) on a phone
   is what the laptop's next score carries, even though the laptop's session
   was signed before the change and still says otherwise. If the read fails
   the session's own idea is used — a score should not be refused because
   the players row was briefly out of reach. */
async function publicName(db, player) {
    if (!player) return "Someone";
    try {
        const row = await db.collection("players").findOne({ id: player.id }, { projection: { _id: 0, nick: 1 } });
        if (row) return (typeof row.nick === "string" && row.nick) || player.name || "Someone";
    } catch (e) { /* fall through to the session */ }
    return shownName(player);
}

/* A name boiled down to what a person would READ as the same name: lower
   case, accents off, and only the letters and digits left — so "Chris R",
   "chris.r" and "ChrisR" are one name, and so are "Zoë" and "Zoe".

   It is the `nickKey` the unique index is on (player-nick.js), which is
   what makes two nicknames that only differ in spacing or punctuation
   count as taken, and the `nameKey`/`usernameKey` discord-auth.js stores
   beside each Discord name, which the Warren's Players search reads (they
   used to refuse a nickname for being somebody else's Discord name; that
   rule went on 29 Sept 2026). The few letters that do not decompose are
   spelled out by hand. */
function nameKey(s) {
    return String(s || "")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ß/g, "ss").replace(/ø/g, "o").replace(/ı/g, "i")
        .replace(/[^a-z0-9]/g, "");
}

/* The player as `me` and player-nick.js answer with it: the session's
   identity, brought up to date from the players row when there is one.
   `row` is that row or null. The shape is the contract with js/account.js
   (Account.current):
     name         the Discord display name, as it always was
     nick         the chosen nickname, or null
     displayName  nick || name — what the site shows
     nickAsked    whether the first-sign-in prompt has been shown
     nickLocked   the admins have locked the nickname (29 Sept 2026; see
                  LOCKED in player-nick.js): the page hides the field and
                  says why. False when there is no row to ask.
     nickRejected the admins have reviewed the nickname from the Warren and
                  asked for a different one (29 Sept 2026; see FLAGGED in
                  player-nick.js): the page asks the player, once a visit,
                  to choose another, and the Profile says so. Only ever a
                  boolean here — who rejected it, and when, stay on the row
                  for the admins. False when there is no row to ask: the
                  ask can wait for a visit when the database is answering,
                  and nothing is lost by it, since the row keeps it until
                  the player acts.
                  Since 29 Sept 2026 the ask cannot be closed — "Save
                  nickname" or "Refuse" — and while it stands every game
                  write is refused (writeRefusal in _bans.js).
     nickRefused  the player pressed "Refuse" on that window (player-nick.js,
                  { refuse: true }): they browse on, the nickname and the
                  rejection stay, and the games stay locked until they set
                  a new one (what the page shows meanwhile is
                  js/account.js's to decide). A new nickname clears it with
                  nickRejected. False when there is no row to ask.
   A row without nickAsked is a player from before nicknames existed, and
   counts as not asked, so they are offered it once. With no row at all the
   session's claim decides, and a session too old to have one is treated as
   asked: prompting on "we could not tell" would nag the people who have
   already answered every time the database blinked. */
function playerView(player, row) {
    if (!player) return null;
    const nick = row ? ((typeof row.nick === "string" && row.nick) || null) : player.nick || null;
    const name = (row && row.name) || player.name || "Someone";
    const nickAsked = row ? row.nickAsked === true : player.nickAsked !== false;
    return {
        id: player.id,
        name,
        username: (row && row.username) || player.username || null,
        avatar: row ? (row.avatar || null) : (player.avatar || null),
        nick,
        displayName: nick || name,
        nickAsked,
        nickLocked: !!(row && row.nickLocked === true),
        // Locked because it is their Habbo name, from OriginsBot (3 Oct
        // 2026; see _originsbot.js), so the Profile can say so — and only
        // while the nickname still IS that name: one the admins have
        // changed since is theirs, whoever locked it first.
        nickHabbo: !!(row && row.nickLocked === true && row.nickLockedBy === "OriginsBot" &&
            row.habbo && typeof row.nick === "string" && row.nick === row.habbo.applied),
        nickRejected: !!(row && row.nickRejected && typeof row.nickRejected === "object"),
        nickRefused: !!(row && row.nickRefused === true)
    };
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

/* The session's player, or null if there is none OR it has been ended —
   signed out on every device, or forgotten (4 Oct 2026, the bug scan). For
   the reads that answer about the caller's own account and had taken the
   cookie alone on trust: one indexed read of the row's session versions.
   Fails closed to null if the database cannot say. */
async function livePlayerFrom(db, event) {
    const player = playerFrom(event);
    if (!player) return null;
    try {
        const row = await db.collection("players").findOne({ id: String(player.id) }, { projection: { _id: 0, sv: 1, svStrict: 1 } });
        return sessionRevoked(player, row) ? null : player;
    } catch (e) {
        return null;
    }
}

module.exports = { COOKIE, AUDIENCE, MAX_AGE, signPlayer, playerFrom, livePlayerFrom, setCookie, clearCookie, parseCookies, shownName, publicName, playerView, nameKey,
    sessionRevoked, svFor, newSv };

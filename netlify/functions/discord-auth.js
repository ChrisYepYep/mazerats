/* /.netlify/functions/discord-auth — signing in with Discord.

   Groundwork, deliberately. Nothing on the site REQUIRES an account: the
   archive is public, the daily game is playable signed out, and the only
   thing a session buys today is a name on a leaderboard row. What it lays
   down is the identity plumbing — a players collection, a session cookie,
   and a "who am I" endpoint — that anything later (marking mazes walked
   across devices, submissions, favourites) can be built on without
   revisiting the login itself.

   Four actions, all GET but the sign-out, because two of them are browser
   navigations:

     start     the visitor is sent to Discord to approve
     callback  Discord sends them back here with a code
     me        the page asks who is signed in (fetch, not navigation), and
               since 29 Sept 2026 whether the visitor is banned:
               { player: {... nickRefused }, ban: { level, until, reason } | null }
               for signed-in and signed-out visitors alike (see meReply)
     signout   clears the cookie — POST, from this site only (30 Sept 2026);
               with &everywhere=1 every other device's session too (1 Oct 2026)

   The OAuth scopes asked for are "identify" and nothing else: an id, a
   display name and an avatar. Not email, not guilds, not anything that
   would have to appear in the privacy policy as data we hold about a
   person's Discord account.

   ----------------------------------------------------------------------
   On the state parameter

   The state is a short-lived signed token holding a random nonce and where
   to return to, and the same nonce is dropped in a separate cookie. On the
   way back, both must be present and must agree. That is what stops a
   third party from feeding somebody a crafted callback URL and logging
   them into an account that is not theirs, and because it is signed, it is
   also what stops the return path being turned into an open redirect. */
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getDb, ensureUniqueIndex } = require("./_db");
const { signPlayer, playerFrom, setCookie, clearCookie, parseCookies, playerView, nameKey, sessionRevoked, svFor, newSv } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
// The caller's own public board id, for `me` (29 Sept 2026).
const { publicIdOf } = require("./_publicid");
// Bans on `me` and at sign-in, and the network code (29 Sept 2026).
const { banFor, netHashFor } = require("./_bans");
// The Habbo name as the nickname, from OriginsBot (3 Oct 2026).
const originsBot = require("./_originsbot");

const STATE_COOKIE = "mr_oauth";
const STATE_TTL = 10 * 60;                 // ten minutes to finish a login

/* ONE STATE COOKIE PER ATTEMPT (1 Oct 2026). There used to be one
   `mr_oauth` cookie, so starting a second sign-in — in another tab, or
   pressing Sign in again before Discord answered — overwrote the first
   attempt's nonce, and that one came back "Discord sign-in did not work".
   Each attempt now has its own, named by the first 12 hex of its nonce
   (48 bits: two attempts in one ten-minute window never share one), and
   the callback reads the one its state names. The plain `mr_oauth` is
   still accepted for a sign-in that was under way when this deployed;
   nothing sets it any more. */
const stateCookieName = (nonce) => `${STATE_COOKIE}_${String(nonce || "").slice(0, 12)}`;
const clearStateCookie = (name) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
// How many attempts' cookies may stand at once — see `start`.
const MAX_STATE_COOKIES = 4;
const STATE_AUDIENCE = "mazerats-oauth-state";
const DISCORD_API = "https://discord.com/api/v10";
// The token exchange and the profile read together — see the callback.
const DISCORD_TIMEOUT_MS = 5000;

const json = (statusCode, data, extra) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store", ...(extra || {}) },
    body: JSON.stringify(data)
});

const redirect = (location, cookies) => ({
    statusCode: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
    multiValueHeaders: cookies && cookies.length ? { "Set-Cookie": cookies } : undefined,
    body: ""
});

/* Where the site lives, for building the OAuth redirect URI. Taken from
   Netlify's own URL env var in production and from the request itself under
   `netlify dev`, so the same code works in both without a second setting to
   keep in step. */
function siteOrigin(event) {
    if (process.env.DISCORD_REDIRECT_ORIGIN) return process.env.DISCORD_REDIRECT_ORIGIN.replace(/\/$/, "");
    if (process.env.URL) return process.env.URL.replace(/\/$/, "");
    const h = event.headers || {};
    const proto = h["x-forwarded-proto"] || "http";
    const host = h["x-forwarded-host"] || h.host || "localhost:8888";
    return `${proto}://${host}`;
}

/* A clean path, not the function's own URL with ?action=callback on it.

   Two reasons. It is the address that has to be typed into Discord's
   developer portal by hand, and a bare path is one less thing to get
   wrong than a query string. And OAuth providers differ on whether they
   accept a query string in a registered redirect URI at all — this side-
   steps the question entirely.

   /auth/discord/callback is a 200 rewrite to this function (see
   netlify.toml). Note what that means: a rewrite forwards the INCOMING
   query string, not the one written in the rewrite target, so the action
   cannot be smuggled through it — which is exactly the trap the share
   links fell into. The action is read off the path instead (see
   actionFrom). */
const redirectUri = (event) => `${siteOrigin(event)}/auth/discord/callback`;

/* The same check as player-nick.js's sameOrigin (30 Sept 2026), for the
   sign-out: a browser always sends Origin on a POST, and one naming another
   site is refused. No Origin at all is allowed through, as it is there. */
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

/* Explicit ?action wins; otherwise the path says. Anything unrecognised is
   "me", which is the harmless read-only one. */
function actionFrom(event) {
    const named = (event.queryStringParameters || {}).action;
    if (named) return named;
    const path = String(event.path || event.rawUrl || "");
    if (path.includes("/auth/discord/callback")) return "callback";
    if (path.includes("/auth/discord/start")) return "start";
    return "me";
}

/* Only ever a path on this site. The return address rides through Discord
   inside the signed state, but signed is not the same as safe — this is
   what makes an absolute URL, a protocol-relative "//evil.example", or a
   javascript: URI impossible to smuggle back. */
function safeReturn(to) {
    const raw = typeof to === "string" ? to : "";
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/home";
    /* And nothing a Location header cannot carry (30 Sept 2026): a CR, LF
       or other control character in `to` made the redirect's header
       invalid, and the sign-in ended on the platform's error page instead
       of back on the site. A backslash too — browsers read "/\evil" as
       "//evil"; the origin in front of it makes that harmless today, but
       nothing about a return path needs one. */
    if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/home";
    /* And nothing past ASCII left raw (30 Sept 2026). A browser always sends
       the page's address percent-encoded, but `to` is decoded from the query
       string on its way in, so a hand-made "?to=/%C3%A9" arrived as "/é" —
       and a Location header is Latin-1 at best: the character went out
       mangled, or took the redirect down with it. Spaces and anything past
       "~" are encoded again, one code point at a time; a lone surrogate,
       which cannot be, sends them home. */
    try {
        return raw.replace(/[^\x21-\x7e]/gu, c => encodeURIComponent(c));
    } catch (e) {
        return "/home";
    }
}

/* A Discord display name. Discord has two shapes: modern accounts have a
   unique username and an optional global_display_name, older ones carry a
   four-digit discriminator. Preferring the display name is what people
   expect to see next to their own score. */
function displayName(user) {
    const name = user.global_name || user.username || "Someone";
    /* Forty CHARACTERS, not forty UTF-16 units (1 Oct 2026): Discord display
       names are often emoji, and .slice(0, 40) could stop halfway through
       one, leaving a lone surrogate that every board, the header and the
       Warren drew as a broken glyph. */
    return Array.from(String(name)).slice(0, 40).join("");
}

/* And the unique handle, which displayName above deliberately passes over.
   Kept beside it because a display name identifies nobody — see signPlayer
   in _player.js. Discord's usernames are at most 32 characters of a narrow
   alphabet (plus "#1234" on the oldest accounts), so 40 is slack. */
function uniqueName(user) {
    const handle = typeof user.username === "string" ? user.username : "";
    const withTag = user.discriminator && user.discriminator !== "0" ? `${handle}#${user.discriminator}` : handle;
    return withTag.slice(0, 40) || null;
}

function avatarUrl(user) {
    if (!user.avatar) return null;
    const ext = String(user.avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=64`;
}

/* "Who am I", with the nickname (28 Sept 2026).

   It used to answer from the cookie alone. It now reads the player's row as
   well, because the nickname and whether they have been asked for one are
   things that can change on ANOTHER device: a nick set on a phone has to be
   what the laptop's header says on its next page load, and a prompt
   dismissed on one should not come back on the other. One indexed read per
   page load for a signed-in visitor, and none at all for anybody else.

   When the row disagrees with the cookie about the nickname, a fresh cookie
   goes back with the answer, so the session catches up without anybody
   signing in again. Nothing else re-issues it here: a session that is
   already right keeps its expiry, rather than every page view quietly
   extending it.

   If the row cannot be read the cookie answers on its own, as it always did
   (see playerView in _player.js for what that means for the prompt). */
/* `ban` (29 Sept 2026; see _bans.js): the most severe active ban on this
   visitor — their account when signed in, and their address, /64 and
   network code either way — as { level, until, reason }, or null. It is
   what the page shows the banned screen from: a "full" ban blocks every
   page but the privacy policy, and a "soft" one the games, the boards'
   "you", sign-in and the forms. That blocking of READS is the page's (static
   pages cannot be refused from here without an edge function; see _bans.js),
   so this answers a banned visitor like anybody else — with the ban in it.
   Signed out, this is now one memoised bans read per page load where it used
   to be none; the lookup fails OPEN (banFor), so a database blip shows
   nobody a banned screen. Never cached: json() says no-store. */
/* The REASON only to the person it was written about (1 Oct 2026): an
   account ban's own player, or the player a "nethash" ban was taken from
   (fromPlayer, see summary in _bans.js), signed in. An address, /64 or
   network ban is shared by everybody behind it — a school, a flat, a whole
   CGNAT mobile address — and its reason, typed about somebody else, could
   name them or the incident. Everyone else gets the level and the end with
   the reason "", which the page already shows as no Reason line. */
function banView(ban, player) {
    if (!ban) return null;
    const own = !!player && (ban.kind === "player" || (ban.kind === "nethash" && ban.fromPlayer === player.id));
    return { level: ban.level, until: ban.until, reason: own ? ban.reason : "" };
}

/* THE NETWORK CODE (29 Sept 2026; see netHashOf in _bans.js): the sign-in
   and every `me` keep on the players row `netHash`, a keyed one-way code of
   the network the player is on — never the address — and `netHashAt`, when
   it was last seen, so the Warren can ban a signed-in troll's network. On
   `me` it is written only when it has changed or is a day old, not on every
   page load. Never allowed to fail the answer. */
const NET_HASH_REFRESH_MS = 24 * 60 * 60 * 1000;
// How long `me` waits for that write — see meReply.
const NET_HASH_WAIT_MS = 1000;
// And for an OriginsBot lookup and what it writes — see meReply.
const ORIGINSBOT_WAIT_MS = 4000;
function netHashUpdate(event, row) {
    const netHash = netHashFor(event);
    if (!netHash) return null;
    const at = row && Date.parse(row.netHashAt);
    if (row && row.netHash === netHash && Number.isFinite(at) && Date.now() - at < NET_HASH_REFRESH_MS) return null;
    return { netHash, netHashAt: new Date().toISOString() };
}

/* THE PROFILE INTRODUCTION (4 Oct 2026, the owner's), once per player:
     "new"        signed in for the first time a moment ago — the page takes
                  them straight to Edit Profile in the console
     "returning"  signed in before profiles existed — the page asks them,
                  once, to add theirs ("We added profiles, add yours!")
     null         already introduced (profileIntroAt, set by player-nick.js
                  when the page shows either), or no row to tell from.
   "A moment ago" is PROFILE_NEW_MS after joinedAt: the sign-in lands on the
   page within seconds, and a new player who leaves before it does is
   greeted as returning next time, which reads just as well. Answer only:
   the cookie never carries it. */
const PROFILE_NEW_MS = 30 * 60 * 1000;
function profileIntroOf(row) {
    if (!row || row.profileIntroAt) return null;
    const joined = Date.parse(row.joinedAt);
    return Number.isFinite(joined) && Date.now() - joined < PROFILE_NEW_MS ? "new" : "returning";
}

async function meReply(event) {
    const player = playerFrom(event);
    let db = null;
    try {
        db = await getDb();
    } catch (e) {
        db = null;
    }
    /* The bans and the players row side by side (30 Sept 2026). They are
       independent, and this answers every page load of every signed-in
       visitor: one after the other, a slow cluster cost each of them its
       socket allowance in turn (_db.js), and two of those is past the
       page's own ten-second leash on `me` (js/account.js), which then shows
       a signed-in player signed out. Neither can reject — banFor fails open
       by itself, and the row read is caught here.

       A row that could not be read is `undefined`, not null (30 Sept 2026):
       null means the read worked and there is no row, which for a session
       carrying a session version means it was revoked (sessionRevoked in
       _player.js), and a database blink must never read as that. */
    let [banned, row] = db ? await Promise.all([
        banFor(db, event, player ? player.id : null),
        player
            ? db.collection("players").findOne({ id: player.id }, { projection: { _id: 0 } }).catch(() => undefined)
            : null
    ]) : [null, undefined];
    if (!player) return json(200, { player: null, ban: banView(banned, null) });
    /* Revoked — forgotten from the Warren, or its session version changed
       (see SESSION VERSIONS in _player.js): answered as signed out, and the
       cookie is cleared so the page stops sending it. */
    if (sessionRevoked(player, row)) {
        return json(200, { player: null, ban: banView(banned, null) }, { "Set-Cookie": clearCookie() });
    }
    const ban = banView(banned, player);
    /* THE HABBO NAME (3 Oct 2026; see _originsbot.js): once a week per
       player, OriginsBot is asked for it, and a name it gives becomes the
       nickname. Not for a banned visitor. Bounded by the lookup's own
       2.5-second deadline, inside the page's ten; when the nickname changed
       the row is read again, so the fresh cookie below carries it. */
    /* Held for ORIGINSBOT_WAIT_MS at most (3 Oct 2026): the lookup has its
       own 2.5 seconds, but taking a name from another player then renames
       both players' board rows, and on a slow cluster that is more than
       this answer should wait for. Past it, `me` answers as it stands; the
       work finishes on its own, and the next page load reads the result. */
    if (row && !banned && originsBot.due(row)) {
        let timer;
        const changed = await Promise.race([
            originsBot.refresh(db, row),
            new Promise(resolve => { timer = setTimeout(() => resolve(false), ORIGINSBOT_WAIT_MS); })
        ]).finally(() => clearTimeout(timer));
        if (changed) {
            row = await db.collection("players").findOne({ id: player.id }, { projection: { _id: 0 } }).catch(() => row) || row;
        }
    }
    if (row) {
        const fresh = netHashUpdate(event, row);
        if (fresh) {
            /* Held for NET_HASH_WAIT_MS at most: it is bookkeeping, not the
               answer, and a write that does not land is simply made again by
               the next `me`, since netHashAt has not moved. */
            let timer;
            await Promise.race([
                db.collection("players").updateOne({ id: player.id }, { $set: fresh })
                    .catch(e => console.warn("discord-auth: could not store the network code", e.message)),
                new Promise(resolve => { timer = setTimeout(resolve, NET_HASH_WAIT_MS); })
            ]).finally(() => clearTimeout(timer));
        }
    }
    const view = playerView(player, row);
    /* `publicId` beside the rest (29 Sept 2026): the id the public boards
       key this player's rows by instead of their Discord id (see
       _publicid.js), so the page can still pick out "you". Added to the
       answer only — the cookie below is signed from `view` as before and
       never carries it; it is derived from the id every time. */
    const answer = { ...view, publicId: publicIdOf(view.id), profileIntro: profileIntroOf(row) };
    /* Re-signed, too, when the row has a session version the cookie lacks —
       a session from before they existed — so it becomes one that can be
       revoked. The version rides in the cookie only, never in the answer. */
    const sv = svFor(player, row);
    const stale = row && ((view.nick || null) !== (player.nick || null) || view.nickAsked !== player.nickAsked ||
        sv !== player.sv);
    if (stale && process.env.SESSION_SECRET) {
        return json(200, { player: answer, ban }, { "Set-Cookie": setCookie(signPlayer({ ...view, sv })) });
    }
    return json(200, { player: answer, ban });
}

exports.handler = async (event) => {
    const action = actionFrom(event);

    if (action === "me") {
        return meReply(event);
    }

    /* POST only, and only from this site (30 Sept 2026). As a GET, any page
       anywhere could sign a visitor out with an <img src> pointing here —
       harmless to their data, but a nuisance a stranger should not be able
       to cause. Nothing on the site navigates here: every Sign out is a
       button that goes through Account.signOut in js/account.js, which
       POSTs. The Origin check is player-nick.js's. */
    if (action === "signout") {
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" }, { Allow: "POST" });
        if (!sameOrigin(event)) return json(403, { error: "Not from this site" });
        /* SIGN OUT EVERYWHERE (1 Oct 2026): ?everywhere=1 also gives the
           players row a new session version (see SESSION VERSIONS in
           _player.js), so the session on every OTHER device — a phone, a
           shared computer, a copied cookie — reads as revoked at its next
           `me` or write. Only a signed-in caller's own row; signed out it is
           the plain sign-out. If the row cannot be written the cookie is
           KEPT and 503 said, so the page does not claim the other devices
           are signed out when they are not. `svStrict` revokes a session
           from before session versions too, which carries no number: it
           used to run on, and `me` even re-signed it with the NEW number
           (see sessionRevoked in _player.js). */
        if ((event.queryStringParameters || {}).everywhere === "1") {
            const player = playerFrom(event);
            if (player) {
                /* Only from a session that is still current (1 Oct 2026).
                   Matched on the row as an update filter, so an old cookie
                   the row has already moved on from — a copied one, say,
                   from before the last "every device" — cannot go on
                   signing the real player out of everything for the rest of
                   its thirty days. It gets the plain sign-out. */
                const current = typeof player.sv === "number"
                    ? { $or: [{ sv: player.sv }, { sv: { $exists: false } }] }
                    : { svStrict: { $ne: true } };
                try {
                    const db = await getDb();
                    await db.collection("players").updateOne({ id: player.id, ...current }, { $set: { sv: newSv(), svStrict: true } });
                } catch (e) {
                    console.warn("discord-auth: could not sign out everywhere", e && e.message);
                    return json(503, { error: "Couldn't sign out your other devices just now. Try again in a minute." });
                }
            }
        }
        return json(200, { player: null }, { "Set-Cookie": clearCookie() });
    }

    if (!process.env.SESSION_SECRET) {
        return json(500, { error: "SESSION_SECRET is not set" });
    }
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
        // Said plainly, because the only person who will ever see this is
        // whoever is setting the site up.
        return json(503, { error: "Discord sign-in is not configured on this deploy (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)." });
    }

    // ---------- send them to Discord ----------
    if (action === "start") {
        const q = event.queryStringParameters || {};
        const nonce = crypto.randomBytes(16).toString("hex");
        const to = safeReturn(q.to);
        /* Set only on the retry below, and carried through Discord so the
           callback can tell "we already tried the quiet way" from "first
           attempt". Without it the retry could bounce forever. */
        const retried = q.consent === "1";
        /* Its own audience, like the admin and player tokens, so that no
           JWT this site signs can stand in for another kind. It carries no
           `sub` and the admin verifier demands its own audience, so it was
           never usable as an admin token; this closes the other direction. */
        const state = jwt.sign({ nonce, to, retried }, process.env.SESSION_SECRET, { expiresIn: STATE_TTL, audience: STATE_AUDIENCE });

        const authorize = new URL(`${DISCORD_API}/oauth2/authorize`);
        authorize.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID);
        authorize.searchParams.set("redirect_uri", redirectUri(event));
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("scope", "identify");
        authorize.searchParams.set("state", state);

        /* prompt=none skips Discord's "you have already authorised this"
           screen on a return visit, so signing back in is one hop rather
           than two. Discord documents that only for someone who HAS already
           authorised, and says nothing about what it does for someone who
           has not — which is every first sign-in, including the very first
           one anybody makes. Rather than assume, the callback retries with
           prompt=consent if Discord comes back saying it needed to ask. */
        authorize.searchParams.set("prompt", retried ? "consent" : "none");

        /* At most a handful at once (1 Oct 2026). An attempt abandoned
           part-way — Discord's page closed, Back pressed — leaves its cookie
           for the ten minutes, and every one rides on every request to the
           site. Past MAX_STATE_COOKIES the older ones, which are almost
           certainly abandoned, are cleared as this one is set, so pressing
           Sign in over and over can never swell the Cookie header. */
        const jar = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie));
        const older = Object.keys(jar).filter(k => /^mr_oauth_[0-9a-f]{12}$/.test(k));
        return redirect(authorize.toString(), [
            `${stateCookieName(nonce)}=${nonce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_TTL}`,
            ...(older.length >= MAX_STATE_COOKIES ? older.map(clearStateCookie) : [])
        ]);
    }

    // ---------- and catch them coming back ----------
    if (action === "callback") {
        const q = event.queryStringParameters || {};
        const origin = siteOrigin(event);
        // This attempt's own state cookie, once the state says which it is,
        // and the plain one (see ONE STATE COOKIE PER ATTEMPT). Only ever
        // this attempt's: another tab's sign-in in progress is left alone.
        let claims = null;
        const spent = () => [clearStateCookie(STATE_COOKIE),
            ...(claims && claims.nonce ? [clearStateCookie(stateCookieName(claims.nonce))] : [])];
        const fail = (why) => redirect(`${origin}/home?signin=${encodeURIComponent(why)}`, spent());

        // The state is read before the error is acted on, because whether an
        // error is worth retrying depends on what we already tried.
        if (q.state) {
            // algorithms named, for the same reason _auth.js and _player.js
            // name theirs: what counts as a valid signature should not be
            // inferred from the key. This was the one verify on the site that
            // did not say so — not a bug today, since jsonwebtoken 9 already
            // refuses "none" and will not check an asymmetric token against a
            // string secret, but the whole point of pinning it is to not
            // depend on that staying true.
            try { claims = jwt.verify(q.state, process.env.SESSION_SECRET, { algorithms: ["HS256"], audience: STATE_AUDIENCE }); } catch (e) { claims = null; }
        }

        if (q.error) {
            // access_denied is a person pressing Cancel. Nothing to retry.
            if (q.error === "access_denied") return fail("cancelled");
            /* Anything else on a prompt=none attempt is Discord saying it
               needed to ask after all — which is exactly what a first-ever
               sign-in looks like. Go round once more with the approval
               screen shown, and only give up if that fails too. */
            if (claims && !claims.retried) {
                const to = safeReturn(claims.to);
                return redirect(
                    `${origin}/auth/discord/start?consent=1&to=${encodeURIComponent(to)}`,
                    spent()
                );
            }
            return fail("failed");
        }

        if (!q.code || !q.state) return fail("failed");
        if (!claims) return fail("expired");
        const jar = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie));
        const cookieNonce = jar[stateCookieName(claims.nonce)] || jar[STATE_COOKIE];
        // Both halves, and they must match. Either one alone proves nothing.
        if (!cookieNonce || cookieNonce !== claims.nonce) return fail("failed");

        /* Both calls to Discord share one deadline, as habbo.js bounds its
           own. Unbounded, a Discord that accepted the connection and then
           said nothing held this function open until the platform killed
           it, and the visitor was left on a blank error page halfway
           through signing in instead of being sent home with "failed" —
           which is what an abort now does, through the catch below. */
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);
        let user;
        try {
            const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
                method: "POST",
                signal: controller.signal,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: process.env.DISCORD_CLIENT_ID,
                    client_secret: process.env.DISCORD_CLIENT_SECRET,
                    grant_type: "authorization_code",
                    code: q.code,
                    redirect_uri: redirectUri(event)
                })
            });
            if (!tokenRes.ok) return fail("failed");
            const grant = await tokenRes.json();

            const meRes = await fetch(`${DISCORD_API}/users/@me`, {
                signal: controller.signal,
                headers: { Authorization: `Bearer ${grant.access_token}` }
            });
            if (!meRes.ok) return fail("failed");
            user = await meRes.json();
        } catch (e) {
            return fail("failed");
        } finally {
            clearTimeout(timer);
        }
        if (!user || !user.id) return fail("failed");

        /* What is kept: the Discord id, the name and avatar to draw a
           leaderboard row with, the unique username (so an admin reading a
           signed-in message can tell one "Chris" from another — see
           contact.js), and two timestamps. Not the access token —
           it is used here to read the profile and then dropped, because
           nothing on this site acts on anyone's behalf on Discord, and a
           stored token would be a credential worth stealing for no benefit
           at all. */
        const player = {
            id: String(user.id),
            name: displayName(user),
            username: uniqueName(user),
            avatar: avatarUrl(user)
        };

        /* A BANNED ACCOUNT OR NETWORK DOES NOT SIGN IN (29 Sept 2026; see
           _bans.js) — soft or full, by account, address, /64 or network
           code. Sent home with ?signin=banned, so the page can say why, and
           no session cookie is set. A signed-out `me` asks by network only,
           so it reports a network ban's level and end; an account ban's
           refusal is known to the page by the ?signin=banned alone.

           A banned ACCOUNT's existing row still gets the network code it
           came from, so the Warren can go on to ban the network it is
           trying from. No row is ever made for a refused sign-in.

           The lookup fails OPEN (banFor), as the rest of this callback does
           on a database it cannot reach: the session is still issued, and
           every write that session makes asks the bans again for itself
           (writeRefusal), failing closed. */
        let db = null;
        try {
            db = await getDb();
        } catch (e) {
            db = null;
        }
        const ban = db ? await banFor(db, event, player.id) : null;
        if (ban) {
            const netHash = netHashFor(event);
            if (netHash && ban.kind === "player") {
                await db.collection("players").updateOne({ id: player.id },
                    { $set: { netHash, netHashAt: new Date().toISOString() } }).catch(() => {});
            }
            return fail("banned");
        }

        try {
            if (!db) throw new Error("no database");
            const players = db.collection("players");
            /* Its own failure is not the sign-in's (5 Oct 2026, the bug scan):
               an index that could not be built threw here and the upsert
               below never ran, so a new player had no row and their first
               `me` signed them out, every time. The index is asked for again
               on the next sign-in; the write goes ahead now. */
            await ensureUniqueIndex(players, "id").catch(e => console.error("discord-auth: could not build the players id index", e));
            const now = new Date().toISOString();
            /* The nickname half (28 Sept 2026; see player-nick.js).

               nameKey and usernameKey are the Discord name and handle boiled
               down (nameKey in _player.js), written on every sign-in so they
               follow a Discord rename. They were what let a nickname be
               refused for being somebody else's Discord name; that rule
               went on 29 Sept 2026 (see player-nick.js), and they stay
               because the Warren's Players search (players-admin.js) finds
               "chris.r" by typing "Chris R" through them.

               nickAsked: false only on INSERT — a brand-new player, who is
               offered a nickname once. A player from before nicknames has
               no field at all, which playerView reads as not asked too, so
               everybody already signed up is offered it once after this
               deploys. That is on purpose. Never set here on an update:
               re-signing in must not bring back a prompt somebody has
               answered.

               Then the row is read back, so the session carries the nick
               and the answer from the start — `me` would correct it on the
               first page load anyway, but a board write in between would
               otherwise have only the Discord name to go on (publicName
               reads the row regardless). */
            /* netHash and netHashAt (29 Sept 2026): the network code — see
               netHashUpdate above and netHashOf in _bans.js. Only when there
               is an address to make it from. */
            const netHash = netHashFor(event);
            await players.updateOne(
                { id: player.id },
                {
                    $set: {
                        name: player.name, username: player.username, avatar: player.avatar, seenAt: now,
                        nameKey: nameKey(player.name), usernameKey: nameKey(player.username),
                        ...(netHash ? { netHash, netHashAt: now } : {})
                    },
                    $setOnInsert: { id: player.id, joinedAt: now, nickAsked: false, sv: newSv() }
                },
                { upsert: true }
            );
            /* The Habbo name from OriginsBot (3 Oct 2026; see _originsbot.js),
               before the row is read for the session, so a first sign-in's
               cookie already carries it and the nickname prompt is never
               offered to somebody who has one. At most 2.5 seconds; a
               lookup that fails leaves the sign-in exactly as it was. */
            const full = await players.findOne({ id: player.id }, { projection: { _id: 0 } });
            if (full && originsBot.due(full)) await originsBot.refresh(db, full);
            let row = await players.findOne({ id: player.id }, { projection: { _id: 0, nick: 1, nickAsked: 1, sv: 1 } });
            /* A row from before session versions (30 Sept 2026; see SESSION
               VERSIONS in _player.js) is given one now — only if it still
               has none, so two sign-ins at once agree on the same number —
               and read back. */
            if (row && typeof row.sv !== "number") {
                await players.updateOne({ id: player.id, sv: { $exists: false } }, { $set: { sv: newSv() } });
                row = await players.findOne({ id: player.id }, { projection: { _id: 0, nick: 1, nickAsked: 1, sv: 1 } });
            }
            if (row) {
                player.nick = (typeof row.nick === "string" && row.nick) || null;
                player.nickAsked = row.nickAsked === true;
                // Only from a row that was read: a session carrying a number
                // with no row behind it counts as forgotten.
                if (typeof row.sv === "number") player.sv = row.sv;
            }
        } catch (e) {
            // The session is still worth issuing — the profile row is a
            // convenience, and the next sign-in will write it. The nick
            // claims are left unset, so `me` asks the row once it can.
        }

        return redirect(`${origin}${safeReturn(claims.to)}`, [
            setCookie(signPlayer(player)),
            ...spent()
        ]);
    }

    return json(400, { error: "Unknown action" });
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("discord-auth", exports.handler);
// For the tests (4 Oct 2026).
exports.profileIntroOf = profileIntroOf;

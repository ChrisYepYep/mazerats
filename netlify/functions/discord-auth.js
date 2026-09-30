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
     signout   clears the cookie — POST, from this site only (30 Sept 2026)

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
const { signPlayer, playerFrom, setCookie, clearCookie, parseCookies, playerView, nameKey } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
// The caller's own public board id, for `me` (29 Sept 2026).
const { publicIdOf } = require("./_publicid");
// Bans on `me` and at sign-in, and the network code (29 Sept 2026).
const { banFor, netHashFor } = require("./_bans");

const STATE_COOKIE = "mr_oauth";
const STATE_TTL = 10 * 60;                 // ten minutes to finish a login
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
    return raw;
}

/* A Discord display name. Discord has two shapes: modern accounts have a
   unique username and an optional global_display_name, older ones carry a
   four-digit discriminator. Preferring the display name is what people
   expect to see next to their own score. */
function displayName(user) {
    const name = user.global_name || user.username || "Someone";
    return String(name).slice(0, 40);
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
const banView = (ban) => (ban ? { level: ban.level, until: ban.until, reason: ban.reason } : null);

/* THE NETWORK CODE (29 Sept 2026; see netHashOf in _bans.js): the sign-in
   and every `me` keep on the players row `netHash`, a keyed one-way code of
   the network the player is on — never the address — and `netHashAt`, when
   it was last seen, so the Warren can ban a signed-in troll's network. On
   `me` it is written only when it has changed or is a day old, not on every
   page load. Never allowed to fail the answer. */
const NET_HASH_REFRESH_MS = 24 * 60 * 60 * 1000;
function netHashUpdate(event, row) {
    const netHash = netHashFor(event);
    if (!netHash) return null;
    const at = row && Date.parse(row.netHashAt);
    if (row && row.netHash === netHash && Number.isFinite(at) && Date.now() - at < NET_HASH_REFRESH_MS) return null;
    return { netHash, netHashAt: new Date().toISOString() };
}

async function meReply(event) {
    const player = playerFrom(event);
    let db = null;
    try {
        db = await getDb();
    } catch (e) {
        db = null;
    }
    const ban = db ? banView(await banFor(db, event, player ? player.id : null)) : null;
    if (!player) return json(200, { player: null, ban });
    let row = null;
    try {
        if (db) row = await db.collection("players").findOne({ id: player.id }, { projection: { _id: 0 } });
    } catch (e) {
        row = null;
    }
    if (row) {
        const fresh = netHashUpdate(event, row);
        if (fresh) {
            try {
                await db.collection("players").updateOne({ id: player.id }, { $set: fresh });
            } catch (e) {
                console.warn("discord-auth: could not store the network code", e.message);
            }
        }
    }
    const view = playerView(player, row);
    /* `publicId` beside the rest (29 Sept 2026): the id the public boards
       key this player's rows by instead of their Discord id (see
       _publicid.js), so the page can still pick out "you". Added to the
       answer only — the cookie below is signed from `view` as before and
       never carries it; it is derived from the id every time. */
    const answer = { ...view, publicId: publicIdOf(view.id) };
    const stale = row && ((view.nick || null) !== (player.nick || null) || view.nickAsked !== player.nickAsked);
    if (stale && process.env.SESSION_SECRET) {
        return json(200, { player: answer, ban }, { "Set-Cookie": setCookie(signPlayer(view)) });
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

        return redirect(authorize.toString(), [
            `${STATE_COOKIE}=${nonce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_TTL}`
        ]);
    }

    // ---------- and catch them coming back ----------
    if (action === "callback") {
        const q = event.queryStringParameters || {};
        const origin = siteOrigin(event);
        const fail = (why) => redirect(`${origin}/home?signin=${encodeURIComponent(why)}`, [
            `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
        ]);

        // The state is read before the error is acted on, because whether an
        // error is worth retrying depends on what we already tried.
        let claims = null;
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
                    [`${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`]
                );
            }
            return fail("failed");
        }

        if (!q.code || !q.state) return fail("failed");
        if (!claims) return fail("expired");
        const cookieNonce = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie))[STATE_COOKIE];
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
            await ensureUniqueIndex(players, "id");
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
                    $setOnInsert: { id: player.id, joinedAt: now, nickAsked: false }
                },
                { upsert: true }
            );
            const row = await players.findOne({ id: player.id }, { projection: { _id: 0, nick: 1, nickAsked: 1 } });
            if (row) {
                player.nick = (typeof row.nick === "string" && row.nick) || null;
                player.nickAsked = row.nickAsked === true;
            }
        } catch (e) {
            // The session is still worth issuing — the profile row is a
            // convenience, and the next sign-in will write it. The nick
            // claims are left unset, so `me` asks the row once it can.
        }

        return redirect(`${origin}${safeReturn(claims.to)}`, [
            setCookie(signPlayer(player)),
            `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
        ]);
    }

    return json(400, { error: "Unknown action" });
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("discord-auth", exports.handler);

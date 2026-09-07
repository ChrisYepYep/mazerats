/* /.netlify/functions/discord-auth — signing in with Discord.

   Groundwork, deliberately. Nothing on the site REQUIRES an account: the
   archive is public, the daily game is playable signed out, and the only
   thing a session buys today is a name on a leaderboard row. What it lays
   down is the identity plumbing — a players collection, a session cookie,
   and a "who am I" endpoint — that anything later (marking mazes walked
   across devices, submissions, favourites) can be built on without
   revisiting the login itself.

   Three actions, all GET, because two of them are browser navigations:

     start     the visitor is sent to Discord to approve
     callback  Discord sends them back here with a code
     me        the page asks who is signed in (fetch, not navigation)
     signout   clears the cookie

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
const { signPlayer, playerFrom, setCookie, clearCookie, parseCookies } = require("./_player");

const STATE_COOKIE = "mr_oauth";
const STATE_TTL = 10 * 60;                 // ten minutes to finish a login
const DISCORD_API = "https://discord.com/api/v10";

const json = (statusCode, data, extra) => ({
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(extra || {}) },
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

const redirectUri = (event) => `${siteOrigin(event)}/.netlify/functions/discord-auth?action=callback`;

/* Only ever a path on this site. The return address rides through Discord
   inside the signed state, but signed is not the same as safe — this is
   what makes an absolute URL, a protocol-relative "//evil.example", or a
   javascript: URI impossible to smuggle back. */
function safeReturn(to) {
    const raw = typeof to === "string" ? to : "";
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/home.html";
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

function avatarUrl(user) {
    if (!user.avatar) return null;
    const ext = String(user.avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=64`;
}

exports.handler = async (event) => {
    const action = (event.queryStringParameters || {}).action || "me";

    if (action === "me") {
        const player = playerFrom(event);
        return json(200, { player });
    }

    if (action === "signout") {
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
        const nonce = crypto.randomBytes(16).toString("hex");
        const to = safeReturn((event.queryStringParameters || {}).to);
        const state = jwt.sign({ nonce, to }, process.env.SESSION_SECRET, { expiresIn: STATE_TTL });

        const authorize = new URL(`${DISCORD_API}/oauth2/authorize`);
        authorize.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID);
        authorize.searchParams.set("redirect_uri", redirectUri(event));
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("scope", "identify");
        authorize.searchParams.set("state", state);
        // Skips Discord's "you have already authorised this" screen on a
        // return visit, so signing back in is one hop rather than two.
        authorize.searchParams.set("prompt", "none");

        return redirect(authorize.toString(), [
            `${STATE_COOKIE}=${nonce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_TTL}`
        ]);
    }

    // ---------- and catch them coming back ----------
    if (action === "callback") {
        const q = event.queryStringParameters || {};
        const origin = siteOrigin(event);
        const fail = (why) => redirect(`${origin}/home.html?signin=${encodeURIComponent(why)}`, [
            `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
        ]);

        // The visitor pressed Cancel on Discord's own screen. Not an error.
        if (q.error) return fail("cancelled");
        if (!q.code || !q.state) return fail("failed");

        let claims;
        try {
            claims = jwt.verify(q.state, process.env.SESSION_SECRET);
        } catch (e) {
            return fail("expired");
        }
        const cookieNonce = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie))[STATE_COOKIE];
        // Both halves, and they must match. Either one alone proves nothing.
        if (!cookieNonce || cookieNonce !== claims.nonce) return fail("failed");

        let user;
        try {
            const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
                method: "POST",
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
                headers: { Authorization: `Bearer ${grant.access_token}` }
            });
            if (!meRes.ok) return fail("failed");
            user = await meRes.json();
        } catch (e) {
            return fail("failed");
        }
        if (!user || !user.id) return fail("failed");

        /* What is kept: the Discord id, the name and avatar to draw a
           leaderboard row with, and two timestamps. Not the access token —
           it is used here to read the profile and then dropped, because
           nothing on this site acts on anyone's behalf on Discord, and a
           stored token would be a credential worth stealing for no benefit
           at all. */
        const player = {
            id: String(user.id),
            name: displayName(user),
            avatar: avatarUrl(user)
        };
        try {
            const db = await getDb();
            const players = db.collection("players");
            await ensureUniqueIndex(players, "id");
            const now = new Date().toISOString();
            await players.updateOne(
                { id: player.id },
                {
                    $set: { name: player.name, avatar: player.avatar, seenAt: now },
                    $setOnInsert: { id: player.id, joinedAt: now }
                },
                { upsert: true }
            );
        } catch (e) {
            // The session is still worth issuing — the profile row is a
            // convenience, and the next sign-in will write it.
        }

        return redirect(`${origin}${safeReturn(claims.to)}`, [
            setCookie(signPlayer(player)),
            `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
        ]);
    }

    return json(400, { error: "Unknown action" });
};

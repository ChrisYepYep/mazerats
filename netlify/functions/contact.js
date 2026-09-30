/* /.netlify/functions/contact — the homepage console's Contact Us page.
   POST is public (anyone can submit); GET/DELETE are admin-only, same
   x-admin-token gate as rooms.js/events.js/contributors.js, since these
   are private submissions rather than public site content. */
const crypto = require("crypto");
const { getDb } = require("./_db");
const { hasAccount, canWrite, refuseWrite, roleOf, WRITE_SCOPES, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { playerFrom } = require("./_player");
const { clientIp, clientNet, claimNotifySlot, forgetOldAddresses } = require("./_net");
// The ban check (29 Sept 2026) — see the POST.
const { writeRefusal } = require("./_bans");
const { SECURITY_HEADERS } = require("./_headers");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

/* Anything off the wire is text or it is nothing. `(body.x || "").trim()`
   throws on an object or an array, and this endpoint takes an unauthenticated
   POST from anyone — so `{"message":{}}` was a one-line 500 with a stack
   trace in the body. Worse, it threw ABOVE the rate limit and the ban check
   below, so the cheapest way to hammer this function was also the one route
   that no throttle was watching.

   Anything that is not a string becomes EMPTY rather than being stringified.
   `String({})` is "[object Object]" — fifteen perfectly valid characters that
   sail through the length checks below and land in the database as somebody's
   message. A field that arrived as the wrong type has no text in it, so it is
   refused by the emptiness check the same way a blank form would be. */
const text = (v) => (typeof v === "string" ? v : "");

const MESSAGE_MAX = 2000;
const USERNAME_MAX = 60;
const DISCORD_MAX = 60;

// Per-IP submission cap — checked against contact_messages' own createdAt/
// ip fields rather than a separate store, since Netlify Functions don't
// keep reliable in-memory state between invocations.
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// How long the notification email may take before it is given up on. See
// sendNotificationEmail.
const EMAIL_TIMEOUT_MS = 5000;

// Emails per clock hour, across every sender — see claimNotifySlot in
// _net.js. Messages past it are still saved; only the email is skipped.
const EMAILS_PER_HOUR = 12;

/* Counted by `net`, the sender's subscriber (see _net.js), not by `ip`. The
   exact address was one fresh IPv6 address away from a fresh allowance, so
   five messages per ten minutes was five per address for as many addresses
   as a /64 holds. Messages saved before `net` existed simply are not
   counted, which only matters for the ten minutes after a deploy. */
function countRecent(messages, net) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    return messages.countDocuments({ net, createdAt: { $gte: since } });
}

/* The index that count runs on. Without it every submission scans the whole
   collection, and the public can make as many submissions as the cap
   allows. createIndex is a no-op when the index exists; asked once per warm
   container, and never allowed to fail a submission. */
let indexed = false;
async function ensureIndexes(messages) {
    if (indexed) return;
    await messages.createIndex({ ip: 1, createdAt: 1 }).catch(() => {});
    await messages.createIndex({ net: 1, createdAt: 1 }).catch(() => {});
    indexed = true;
}

/* clientIp (and clientNet) now come from _net.js: only the Netlify-computed
   value — never x-forwarded-for, which is client-settable, so trusting it as
   a fallback would let an attacker send an arbitrary/rotating value to dodge
   the rate limit below entirely. Netlify always sets this header in
   production; if it's ever missing, it is null and the caller just skips
   rate-limiting for that one request rather than trusting spoofable data —
   falling back to a shared literal like "unknown" would instead let
   unrelated visitors prematurely rate-limit each other. */

// ", @handle, id 1234" — the parts of a signed-in sender that actually
// identify them. The handle is absent on a session minted before it was
// carried; the id never is.
function signedInAs(from) {
    return `${from.username ? `, @${from.username}` : ""}, id ${from.id}`;
}

// Best-effort — a missing API key/recipient (not yet configured in the
// Netlify dashboard) or a failed request just skips the notification
// rather than failing the whole submission, since the message is already
// safely saved to the database either way. Both RESEND_API_KEY and
// CONTACT_NOTIFY_EMAIL are env vars set in Netlify's own dashboard, never
// committed to the repo — so the destination address stays server-side
// only and is never shipped to the client.
async function sendNotificationEmail({ username, discord, message, verified, sender }) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.CONTACT_NOTIFY_EMAIL;
    if (!apiKey || !to) {
        console.warn("contact.js: RESEND_API_KEY/CONTACT_NOTIFY_EMAIL not set — skipping email notification");
        return;
    }
    const from = process.env.CONTACT_FROM_EMAIL || "Maze Rats <onboarding@resend.dev>";

    /* Bounded, as habbo.js bounds its fetches. The message is already saved
       when this runs and the reply waits on it, so a Resend that hung used
       to hold the request open until the platform killed it — and the sender
       saw a failure for a message that had in fact arrived, and sent it
       again. Aborted, it lands in the catch below like any other failed
       notification, and the sender gets their 201. */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from,
                to,
                subject: `New Maze Rats contact message${username ? ` from ${username}` : ""}`,
                // "(signed in)" is the useful half: it says the Discord name
                // came from Discord rather than from a text field anyone
                // could have typed anything into. It carries the unique
                // handle and the id with it, because the display name alone
                // is not unique — "Chris (signed in)" proved only that SOME
                // Chris had signed in. See signPlayer in _player.js.
                text: `${username ? `Origins username: ${username}\n` : ""}${discord ? `Discord: ${discord}${verified ? ` (signed in${sender ? signedInAs(sender) : ""})` : ""}\n` : ""}${username || discord ? "\n" : ""}${message}`
            })
        });
        if (!res.ok) console.warn("contact.js: email notification failed", res.status, await res.text());
    } catch (e) {
        console.warn("contact.js: email notification failed", e.message);
    } finally {
        clearTimeout(timer);
    }
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("contact: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const messages = db.collection("contact_messages");

    /* A sender's address comes off their message after thirty days — see
       forgetOldAddresses in _net.js, which also says why it rides on
       requests. createdAt here is an ISO string, hence `iso`. At most once
       an hour per warm instance, and it cannot fail the request. */
    if (event.httpMethod === "POST" || event.httpMethod === "GET") {
        await forgetOldAddresses(messages, { iso: true });
    }

    if (event.httpMethod === "POST") {
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }
        // "null" parses without complaint, and body.website then throws
        // out of the handler with a stack trace — on the public POST.
        if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });

        // Honeypot — a field real visitors never see or fill (hidden off-
        // screen in home.html, see .console-hp-field), so anything that
        // does fill it is almost certainly a bot. Reply with a normal-
        // looking success instead of an error so it doesn't learn to work
        // around this — just skip the DB write and email entirely.
        if (text(body.website).trim()) {
            return json(201, { id: crypto.randomUUID(), username: "", discord: "", message: "", createdAt: new Date().toISOString() });
        }

        const message = text(body.message).trim();
        const username = text(body.username).trim();
        const discord = text(body.discord).trim();
        if (!message) return json(400, { error: "Message can't be empty" });
        /* Exactly MESSAGE_MAX is allowed (30 Sept 2026): the form's
           textarea carries maxlength="2000" (home.html), so a message typed
           right up to that limit has to land, and the old "keep it under
           2000" told the sender the opposite of what was checked. */
        if (message.length > MESSAGE_MAX) return json(400, { error: `Your message is too long. Please keep it to ${MESSAGE_MAX} characters or fewer.` });
        if (username.length > USERNAME_MAX) return json(400, { error: `Username is too long — keep it under ${USERNAME_MAX} characters` });
        if (discord.length > DISCORD_MAX) return json(400, { error: `Discord username is too long — keep it under ${DISCORD_MAX} characters` });

        const ip = clientIp(event);
        // What the caps count.
        const net = clientNet(event);

        /* Who sent it, if they were signed in — taken from the session
           cookie rather than from the request body, which is the whole
           point of recording it. A typed Discord handle is a claim; this
           is Discord's own answer, so an admin reading the message can
           tell the difference between "says they are markeh" and "is".

           Never required. Signing in is optional everywhere on this site
           and the contact form is no exception; an anonymous message lands
           exactly as it always has. */
        const player = playerFrom(event);

        /* BANNED: 403, said plainly (29 Sept 2026). A banned address used to
           get the honeypot's silent, normal-looking success, so as not to
           tell whoever it was that they had been noticed. That secret is
           out now by design: a banned visitor is shown a banned screen (the
           page reads `me.ban`, discord-auth.js), so a fake "sent!" here would
           only contradict it. writeRefusal (_bans.js) matches the account,
           the address, its /64 and its network code, soft or full, ignores
           an ended cool-down, and answers 503 itself if the bans cannot be
           read — the message could not have been saved then either. */
        const refusal = await writeRefusal(db, event, player ? player.id : null);
        if (refusal) return refusal;

        if (ip) {
            /* The read in a try, like the insert below. A database that
               answered the connect and then failed here threw straight out
               of the handler — Netlify's bare 502, with nothing the form
               knows how to show. */
            try {
                // A cheap early refusal for the caller already well over the cap.
                // Not the real check — see after the insert below for that.
                if (await countRecent(messages, net) >= RATE_LIMIT_COUNT) {
                    return json(429, { error: "Too many messages sent — please wait a bit before trying again." });
                }
            } catch (e) {
                console.error("contact: could not check the sender", e);
                return json(503, { error: "Your message could not be saved just now. Please try again in a minute." });
            }
        }

        // `player` is read above, before the ban check.
        const from = player
            ? { id: player.id, name: player.name, username: player.username || null, verified: true }
            : null;

        const entry = {
            id: crypto.randomUUID(),
            username,
            // A signed-in sender's own Discord name beats a typed one, and
            // the typed field is not even shown to them (see js/console.js).
            discord: player ? player.name : discord,
            message,
            createdAt: new Date().toISOString()
        };
        /* INSERT FIRST, THEN COUNT — and take it back if it went over.

           Counting before inserting is a check-then-act race: a burst of
           requests fired together all count the same four earlier messages,
           all see room for one more, and all get in. Inserting first means
           every request's own row is already visible to every other
           request's count, so however they interleave, no more than the cap
           can come out of the window with their row still standing. Under a
           real race this can refuse one more than it strictly had to, which
           is the direction to be wrong in. The email goes only after the
           check, so a refused message costs nobody an inbox. */
        try {
            await ensureIndexes(messages);
            await messages.insertOne({ ...entry, from, ip, net });
            if (net && await countRecent(messages, net) > RATE_LIMIT_COUNT) {
                await messages.deleteOne({ id: entry.id });
                return json(429, { error: "Too many messages sent — please wait a bit before trying again." });
            }
        } catch (e) {
            console.error("contact: could not save a message", e);
            return json(503, { error: "Your message could not be saved just now. Please try again in a minute." });
        }
        if (await claimNotifySlot(db, "contact", EMAILS_PER_HOUR)) {
            await sendNotificationEmail({ username, discord: entry.discord, message, verified: Boolean(player), sender: from });
        }
        return json(201, entry);
    }

    /* The admin half inside one try. The read and the delete had nothing
       around them, so a database that dropped mid-request answered with
       Lambda's stack trace; and hasAccount/canWrite now throw when the
       account lookup cannot be made (lookUpRole in _auth.js), which must
       reach the admin page as a 503 it retries — the 401 it used to be
       read as a dead session and signed the admin out. */
    try {
        return await manage(event, messages);
    } catch (e) {
        console.error("contact: admin request failed", e);
        /* Only the tagged lookup failure is an outage to retry; anything
           else is a fault, and answering it as "unavailable" hid it. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return json(500, { error: "Something went wrong with that request." });
    }
};

async function manage(event, messages) {
    if (!(await hasAccount(event))) return UNAUTHORIZED;

    // Reading the messages is part of viewing the admin page, so it stops at
    // isAuthorized above. Deleting one does not.
    if (event.httpMethod === "GET") {
        /* WHO MAY SEE WHERE A MESSAGE CAME FROM — the rule dead-end-leads.js
           already draws for its leads. Every message carries the sender's IP
           and, if they were signed in, their Discord id, and this read was
           gated on hasAccount alone, so a viewer or an atlas account could
           list the address of everybody who had ever written in. Those two
           are what a ban and a follow-up need, and both are the site
           scope's jobs; everyone else reads the message without them.
           `net` is limiter bookkeeping (see countRecent) and nobody needs
           it on screen. Through roleOf, not canWrite, because canWrite
           writes the action log and this is a read. */
        const role = await roleOf(event);
        const full = (WRITE_SCOPES[role] || []).includes("site");
        const projection = full
            ? { _id: 0, net: 0 }
            : { _id: 0, net: 0, ip: 0, "from.id": 0 };
        const all = await messages.find({}, { projection }).sort({ createdAt: -1 }).toArray();
        return json(200, all);
    }

    // canWrite, not isAuthorized: a viewer is a real logged-in account and
    // passes isAuthorized quite correctly — it just isn't allowed to change
    // anything. See _auth.js. refuseWrite words the refusal, and answers a
    // deleted account's token with the 401 it has earned.
    if (!(await canWrite(event))) return await refuseWrite(event);

    if (event.httpMethod === "DELETE") {
        const id = (event.queryStringParameters || {}).id;
        if (!id) return json(400, { error: "Missing message id" });
        const result = await messages.deleteOne({ id });
        if (result.deletedCount === 0) return json(404, { error: "Message not found" });
        return json(200, { deleted: id });
    }

    return json(405, { error: "Method not allowed" });
}

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("contact", exports.handler);

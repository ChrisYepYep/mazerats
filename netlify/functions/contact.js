/* /.netlify/functions/contact — the homepage console's Contact Us page.
   POST is public (anyone can submit); GET/DELETE are admin-only, same
   x-admin-token gate as rooms.js/events.js/contributors.js, since these
   are private submissions rather than public site content. */
const crypto = require("crypto");
const { getDb } = require("./_db");
const { isAuthorized, UNAUTHORIZED } = require("./_auth");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

const MESSAGE_MAX = 2000;
const USERNAME_MAX = 60;
const DISCORD_MAX = 60;

// Per-IP submission cap — checked against contact_messages' own createdAt/
// ip fields rather than a separate store, since Netlify Functions don't
// keep reliable in-memory state between invocations.
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function clientIp(event) {
    // Only the Netlify-computed value — never x-forwarded-for, which is
    // client-settable, so trusting it as a fallback would let an attacker
    // send an arbitrary/rotating value to dodge the rate limit below
    // entirely. Netlify always sets this header in production; if it's
    // ever missing, returns null and the caller just skips rate-limiting
    // for that one request rather than trusting spoofable data — falling
    // back to a shared literal like "unknown" would instead let unrelated
    // visitors prematurely rate-limit each other.
    return event.headers["x-nf-client-connection-ip"] || null;
}

// Best-effort — a missing API key/recipient (not yet configured in the
// Netlify dashboard) or a failed request just skips the notification
// rather than failing the whole submission, since the message is already
// safely saved to the database either way. Both RESEND_API_KEY and
// CONTACT_NOTIFY_EMAIL are env vars set in Netlify's own dashboard, never
// committed to the repo — so the destination address stays server-side
// only and is never shipped to the client.
async function sendNotificationEmail({ username, discord, message }) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.CONTACT_NOTIFY_EMAIL;
    if (!apiKey || !to) {
        console.warn("contact.js: RESEND_API_KEY/CONTACT_NOTIFY_EMAIL not set — skipping email notification");
        return;
    }
    const from = process.env.CONTACT_FROM_EMAIL || "Maze Rats <onboarding@resend.dev>";

    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from,
                to,
                subject: `New Maze Rats contact message${username ? ` from ${username}` : ""}`,
                text: `${username ? `Origins username: ${username}\n` : ""}${discord ? `Discord: ${discord}\n` : ""}${username || discord ? "\n" : ""}${message}`
            })
        });
        if (!res.ok) console.warn("contact.js: email notification failed", res.status, await res.text());
    } catch (e) {
        console.warn("contact.js: email notification failed", e.message);
    }
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const messages = db.collection("contact_messages");

    if (event.httpMethod === "POST") {
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }

        // Honeypot — a field real visitors never see or fill (hidden off-
        // screen in home.html, see .console-hp-field), so anything that
        // does fill it is almost certainly a bot. Reply with a normal-
        // looking success instead of an error so it doesn't learn to work
        // around this — just skip the DB write and email entirely.
        if ((body.website || "").trim()) {
            return json(201, { id: crypto.randomUUID(), username: "", discord: "", message: "", createdAt: new Date().toISOString() });
        }

        const message = (body.message || "").trim();
        const username = (body.username || "").trim();
        const discord = (body.discord || "").trim();
        if (!message) return json(400, { error: "Message can't be empty" });
        if (message.length > MESSAGE_MAX) return json(400, { error: `Message is too long — keep it under ${MESSAGE_MAX} characters` });
        if (username.length > USERNAME_MAX) return json(400, { error: `Username is too long — keep it under ${USERNAME_MAX} characters` });
        if (discord.length > DISCORD_MAX) return json(400, { error: `Discord username is too long — keep it under ${DISCORD_MAX} characters` });

        const ip = clientIp(event);
        if (ip) {
            const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
            const recentCount = await messages.countDocuments({ ip, createdAt: { $gte: since } });
            if (recentCount >= RATE_LIMIT_COUNT) {
                return json(429, { error: "Too many messages sent — please wait a bit before trying again." });
            }
        }

        const entry = { id: crypto.randomUUID(), username, discord, message, createdAt: new Date().toISOString() };
        await messages.insertOne({ ...entry, ip });
        await sendNotificationEmail({ username, discord, message });
        return json(201, entry);
    }

    if (!isAuthorized(event)) return UNAUTHORIZED;

    if (event.httpMethod === "GET") {
        const all = await messages.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
        return json(200, all);
    }

    if (event.httpMethod === "DELETE") {
        const id = (event.queryStringParameters || {}).id;
        if (!id) return json(400, { error: "Missing message id" });
        const result = await messages.deleteOne({ id });
        if (result.deletedCount === 0) return json(404, { error: "Message not found" });
        return json(200, { deleted: id });
    }

    return json(405, { error: "Method not allowed" });
};

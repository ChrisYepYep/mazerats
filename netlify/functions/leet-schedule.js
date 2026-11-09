/* /.netlify/functions/leet-schedule — The Leet Show's next streams, for the Hallway's posters (9 Nov 2026, his: "I think he uses
   schedules on twitch, the channel is https://www.twitch.tv/vincentleet").

   GET only, public, cached like every public read here (cachedJson: the edge keeps a copy for a minute), so Twitch is asked at most about
   once a minute however many people are walking the Hallway. Answers:
       { ok: true, channel, times: [{ start, end, title }], live: { since, title } | null, vacation: { start, end } | null }
   or { ok: false, reason } when it can't ask (not set up yet, Twitch down): the posters then use the times typed in the Hallway editor.

   Needs a Twitch application (dev.twitch.tv/console, any name, no redirect needed) and its two values in Netlify's environment:
       TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
   An app access token (client credentials) is enough for everything asked here: the channel's id, its stream schedule, and whether
   it's live now. The channel can be changed with LEET_TWITCH_LOGIN. */
"use strict";
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson } = require("./_cache");

const LOGIN = (process.env.LEET_TWITCH_LOGIN || "vincentleet").toLowerCase();
const HELIX = "https://api.twitch.tv/helix/";
const TIMEOUT = 6000;
/* (9 Nov scan, findings 1 and 10) The answer reads no query parameter, so every spelling of the address shares the edge's one copy
   (vary "_", a name nobody sends: without it `?x=<random>` skipped the cache and asked Twitch every time, on the site's one app token).
   And a short stale window: the archive's day-long one could keep showing ON NOW! for a day after a stream ended. */
const LEET_CDN = "public, durable, s-maxage=60, stale-while-revalidate=120";
const ONE = { cdn: LEET_CDN, vary: "_" };

/* kept between calls while the function stays warm */
let token = null, tokenUntil = 0, userId = null;

async function call(url, opts = {}) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), TIMEOUT);
    try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); }
}
async function appToken(id, secret, fresh) {
    if (!fresh && token && Date.now() < tokenUntil) return token;
    const r = await call("https://id.twitch.tv/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }).toString() });
    if (!r.ok) throw new Error("token " + r.status);
    const j = await r.json(); token = j.access_token; tokenUntil = Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000; return token;
}
/* a Helix GET, getting a new token once if the old one has been turned down */
async function helix(path, id, secret) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const r = await call(HELIX + path, { headers: { "Client-Id": id, Authorization: "Bearer " + await appToken(id, secret, attempt > 0) } });
        if (r.status === 401 && attempt === 0) continue;
        return r;
    }
}

async function handler(event) {
    if (event.httpMethod !== "GET") return { statusCode: 405, headers: { ...SECURITY_HEADERS, Allow: "GET" }, body: "" };
    const id = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
    if (!id || !secret) return cachedJson(event, { ok: false, reason: "not set up", channel: LOGIN, times: [], live: null }, ONE);
    try {
        if (!userId) {
            const r = await helix("users?login=" + encodeURIComponent(LOGIN), id, secret); if (!r.ok) throw new Error("users " + r.status);
            const u = ((await r.json()).data || [])[0]; if (!u) return cachedJson(event, { ok: false, reason: "no such channel", channel: LOGIN, times: [], live: null }, ONE);
            userId = u.id;
        }
        const [sr, lr] = await Promise.all([helix("schedule?first=10&broadcaster_id=" + userId, id, secret), helix("streams?user_id=" + userId, id, secret)]);
        /* no schedule at all is a 404, not an error */
        let times = [], vacation = null;
        if (sr.ok) {
            const d = (await sr.json()).data || {};
            times = (d.segments || []).filter(s => s && s.start_time && !s.canceled_until).map(s => ({ start: s.start_time, end: s.end_time || null, title: String(s.title || "").slice(0, 140) }));
            if (d.vacation && d.vacation.start_time) vacation = { start: d.vacation.start_time, end: d.vacation.end_time || null };
        } else if (sr.status !== 404) throw new Error("schedule " + sr.status);
        let live = null;
        if (lr.ok) { const s = ((await lr.json()).data || [])[0]; if (s && s.type === "live") live = { since: s.started_at, title: String(s.title || "").slice(0, 140) }; }
        /* streams inside the vacation are not happening */
        if (vacation) times = times.filter(t => !(t.start >= vacation.start && (!vacation.end || t.start <= vacation.end)));
        return cachedJson(event, { ok: true, channel: LOGIN, times, live, vacation }, ONE);
    } catch (e) {
        return cachedJson(event, { ok: false, reason: "twitch unreachable", channel: LOGIN, times: [], live: null }, { cache: false });
    }
}

exports.handler = handler;
/* the site-wide rate limit and the Warren's Errors tab, as every other function (9 Nov scan, finding 1) */
exports.handler = require("./_errors").withErrorReporting("leet-schedule", exports.handler);

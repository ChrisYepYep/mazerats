/* /.netlify/functions/leet-schedule — The Leet Show's next streams, for the Hallway's posters (9 Nov 2026, his: "I think he uses
   schedules on twitch, the channel is https://www.twitch.tv/vincentleet").

   No Twitch application (9 Nov 2026, his: "I'm not getting the developer app"). Twitch publishes two things anyone can read:
     - the channel's schedule as a calendar (iCalendar), https://api.twitch.tv/helix/schedule/icalendar?broadcaster_id=<id>, the same
       schedule the channel page shows when he's offline. A weekly slot comes as one event with a weekly rule, in his own time zone;
     - whether he's live: the channel's preview picture is there while he's live, and redirects to Twitch's "no preview" picture when not.
   His channel's id (27688495, vincentleet) is written here, as finding it needs the app; LEET_TWITCH_ID changes it.

   GET only, public, cached like every public read here (cachedJson: the edge keeps a copy for a minute), so Twitch is asked at most about
   once a minute however many people are walking the Hallway. Answers:
       { ok: true, channel, times: [{ start, end, title }], live: { since, title } | null, vacation: null }
   or { ok: false, reason } when Twitch can't be reached: the posters then use the times typed in the Hallway editor. */
"use strict";
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson } = require("./_cache");

const LOGIN = (process.env.LEET_TWITCH_LOGIN || "vincentleet").toLowerCase();
const ID = String(process.env.LEET_TWITCH_ID || "27688495").replace(/\D/g, "");
const TIMEOUT = 6000, AHEAD_DAYS = 42, MAX = 10;
/* (9 Nov scan, findings 1 and 10) The answer reads no query parameter, so every spelling of the address shares the edge's one copy
   (vary "_", a name nobody sends), and a short stale window, so ON NOW! can't outlive a stream by a day. */
const LEET_CDN = "public, durable, s-maxage=60, stale-while-revalidate=120";
const ONE = { cdn: LEET_CDN, vary: "_" };

async function call(url, opts = {}) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), TIMEOUT);
    try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); }
}

/* ---- the calendar ---- */
/* a wall-clock time in a time zone, as a moment: guess it's UTC, see what the zone's clock says then, and correct (twice, for the hour a
   clock change moves) */
function zoned(y, mo, d, h, mi, s, tz) {
    const want = Date.UTC(y, mo - 1, d, h, mi, s); let t = want;
    let fmt; try { fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch (e) { return want; }
    for (let i = 0; i < 3; i++) { const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value])); const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second); if (seen === want) break; t += want - seen; }
    return t;
}
/* one calendar time: "20260508T210000" with its TZID, or "...Z" in UTC, or a whole day */
function when(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(String(value).trim()); if (!m) return NaN;
    const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1, 7).map(v => +(v || 0));
    if (m[7] || !params.TZID) return Date.UTC(y, mo - 1, d, h, mi, s);
    return zoned(y, mo, d, h, mi, s, params.TZID.replace(/^\/+/, ""));
}
/* the calendar's events: its lines unfolded, each event's properties with their parameters */
function events(text) {
    const lines = String(text).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n"), out = []; let ev = null;
    for (const line of lines) {
        if (line === "BEGIN:VEVENT") { ev = {}; continue; }
        if (line === "END:VEVENT") { if (ev) out.push(ev); ev = null; continue; }
        if (!ev) continue;
        const c = line.indexOf(":"); if (c < 0) continue;
        const [name, ...ps] = line.slice(0, c).split(";"), params = {}; for (const p of ps) { const e = p.indexOf("="); if (e > 0) params[p.slice(0, e).toUpperCase()] = p.slice(e + 1); }
        const key = name.toUpperCase(), value = line.slice(c + 1);
        (ev[key] = ev[key] || []).push({ value, params });
    }
    return out;
}
const DAYCODE = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
/* every start of an event between from and to: its own, or each one its weekly or daily rule gives (in its own zone, so a clock change
   keeps the hour), less the ones taken out */
function starts(ev, from, to) {
    const ds = ev.DTSTART && ev.DTSTART[0]; if (!ds) return [];
    const t0 = when(ds.value, ds.params); if (isNaN(t0)) return [];
    const de = ev.DTEND && ev.DTEND[0], len = de ? Math.max(0, when(de.value, de.params) - t0) : 3 * 3600000;
    const ex = new Set(); for (const e of (ev.EXDATE || [])) for (const v of e.value.split(",")) { const t = when(v, e.params); if (!isNaN(t)) ex.add(t); }
    const rr = ev.RRULE && ev.RRULE[0] ? Object.fromEntries(ev.RRULE[0].value.split(";").map(kv => kv.split("=")).map(([k, v]) => [k.toUpperCase(), v])) : null;
    const out = [], push = t => { if (!ex.has(t) && t + len > from && t < to) out.push({ start: t, end: t + len }); };
    if (!rr) { push(t0); return out; }
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(ds.value), tz = ds.params.TZID ? ds.params.TZID.replace(/^\/+/, "") : null;
    const [h, mi, s] = [+(m[4] || 0), +(m[5] || 0), +(m[6] || 0)], at = (y, mo, d) => tz ? zoned(y, mo, d, h, mi, s, tz) : Date.UTC(y, mo - 1, d, h, mi, s);
    const until = rr.UNTIL ? when(rr.UNTIL, {}) : Infinity, count = rr.COUNT ? +rr.COUNT : Infinity, step = Math.max(1, +(rr.INTERVAL || 1));
    const days = rr.BYDAY ? rr.BYDAY.split(",").map(c => DAYCODE[c.slice(-2)]).filter(v => v !== undefined) : null;
    let n = 0; const base = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    for (let k = 0; k < 2000; k++) {
        const day = new Date(base + k * 86400000), y = day.getUTCFullYear(), mo = day.getUTCMonth() + 1, d = day.getUTCDate(), wd = day.getUTCDay();
        let hit;
        if (rr.FREQ === "DAILY") hit = k % step === 0;
        else if (rr.FREQ === "WEEKLY") hit = Math.floor(k / 7) % step === 0 && (days ? days.includes(wd) : wd === new Date(base).getUTCDay());
        else { if (k === 0) hit = true; else break; }
        if (!hit) continue;
        const t = at(y, mo, d); if (t > until || n >= count) break; n++;
        if (t > to) break; push(t);
    }
    return out;
}
function schedule(text, now) {
    const evs = events(text), from = now - 6 * 3600000, to = now + AHEAD_DAYS * 86400000, all = [];
    /* a single occurrence moved or cancelled comes as its own event with RECURRENCE-ID: it replaces that one of the series */
    const moved = new Set(); for (const ev of evs) if (ev["RECURRENCE-ID"]) { const r = ev["RECURRENCE-ID"][0]; moved.add(when(r.value, r.params)); }
    for (const ev of evs) {
        const cancelled = ev.STATUS && /CANCEL/i.test(ev.STATUS[0].value), title = String((ev.SUMMARY && ev.SUMMARY[0].value) || "").replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ").slice(0, 140);
        for (const s of starts(ev, from, to)) { if (!ev["RECURRENCE-ID"] && moved.has(s.start)) continue; if (cancelled) continue; all.push({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString(), title }); }
    }
    return all.sort((a, b) => a.start < b.start ? -1 : 1).slice(0, MAX);
}

/* ---- live: the preview picture is there only while he's live ---- */
async function isLive() {
    const r = await call("https://static-cdn.jtvnw.net/previews-ttv/live_user_" + encodeURIComponent(LOGIN) + "-80x45.jpg", { method: "GET", redirect: "manual" });
    if (r.status === 200) return true;
    if (r.status >= 300 && r.status < 400) return false;
    throw new Error("preview " + r.status);
}

async function handler(event) {
    if (event.httpMethod !== "GET") return { statusCode: 405, headers: { ...SECURITY_HEADERS, Allow: "GET" }, body: "" };
    try {
        const now = Date.now();
        const [cal, live] = await Promise.all([
            call("https://api.twitch.tv/helix/schedule/icalendar?broadcaster_id=" + ID).then(async r => { if (r.status === 404) return ""; if (!r.ok) throw new Error("calendar " + r.status); return r.text(); }),
            isLive().catch(() => false)
        ]);
        const times = schedule(cal, now), on = times.find(t => Date.parse(t.start) <= now && now < Date.parse(t.end));
        return cachedJson(event, { ok: true, channel: LOGIN, times: times.filter(t => Date.parse(t.end) > now), live: live ? { since: null, title: on ? on.title : "" } : null, vacation: null }, ONE);
    } catch (e) {
        return cachedJson(event, { ok: false, reason: "twitch unreachable", channel: LOGIN, times: [], live: null }, { cache: false });
    }
}

exports.handler = handler;
exports.schedule = schedule;      // for tools/test-leet-schedule.js
/* the site-wide rate limit and the Warren's Errors tab, as every other function (9 Nov scan, finding 1) */
exports.handler = require("./_errors").withErrorReporting("leet-schedule", exports.handler);

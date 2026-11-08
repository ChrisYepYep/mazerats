/* /.netlify/functions/hallway-lost — Lost Property: what's lost, where, the
   clock, and the weekly board (8 Nov 2026, the owner's: a 15-minute limit to
   find each thing and a score, with a leaderboard; then "Server should pick ...
   i don't want people ruining it with exploits", and guests on the board as
   "Visitor 001" etc., "randomly generated though, not going up from 1").

   GET [?v=token]               this week's board: the top 20, and your own row.
                                { week, from, to, rows: [...], me }
   POST {act: "start", v?}      hustle asks you to find something. THIS picks
                                the thing and its spot from the published map's
                                spots, preferring things you haven't found, and
                                starts the clock on its own time. One search
                                open per player; a new one replaces it.
                                { k, spot: {level, x, y}, left, limit, v? }
   POST {act: "swap", v?}       "ask for a different one": another thing, the
                                clock starts again.
   POST {act: "hint", v?}       a clue was asked for: counted here. { hints }
   POST {act: "found", k, at: {level, x, y}, v?}
                                you picked it up. Only the thing this search
                                was sent for, only at the spot this function
                                put it, only once; the points are worked out
                                here from its own clock and its own count of
                                clues.
   POST {act: "cancel", v?}     you left the Hallway: the search ends, no
                                points and no miss (his: come back and ask
                                hustle again).

   WHO. Signed in with a nickname: the player, under their nickname, as the
   daily games are. Anybody else (signed out, or signed in with no nickname
   yet) plays as a Visitor: a token this function signs, holding a random id
   and a random number, shown as "Visitor 042". A number is drawn at random
   from those no Visitor has (three digits while any are free, then four),
   so the numbers say nothing about how many came before. New Visitors are
   capped per network per hour (NEW_PER_HOUR); a browser keeps its token.

   WHAT'S STILL TAKEN ON TRUST. The page has to be told where the thing is to
   draw it, so a script could read the spot and post a find. What it can't do
   is choose an easy thing, see the spot before the clock starts, skip the
   clue count (clues are counted here), finish quicker than MIN_SECS, find
   something it wasn't sent for, or put more than DAY_CAP finds a day on the
   board.

   POINTS: 100 for finding it at all, up to 900 more for speed (all of it at
   once, none at the 15-minute limit), and 150 for each of the three clues you
   didn't need: 1430 at most.

   One row per player per week in `hallway_lost`; the open search in
   `hallway_lost_open`; what each has found, for choosing, in
   `hallway_lost_seen`; Visitor numbers in `hallway_lost_visitors`. */
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
const { writeRefusal, withoutBanned, netHashFor } = require("./_bans");
const { publicLists } = require("./_publicid");
const { publishedMap, _reset: resetMap } = require("./_hallway-map");
const THINGS = require("./_hallway-lost-things.json");

const COLLECTION = "hallway_lost";
const LIMIT_SECS = 15 * 60;
const GRACE_SECS = 20;          // the page's clock and this one can differ by a few seconds
const MIN_SECS = 20;
const DAY_CAP = 20;
const TOP = 20;
const MAX_BODY = 2048;
const NEW_PER_HOUR = 10;
const VISITOR_AUDIENCE = "mazerats-hallway-visitor";
const ID = /^[\w .:'-]{1,60}$/;

const json = (statusCode, data) => ({ statusCode, headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" }, body: JSON.stringify(data) });

function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try { return new URL(origin).host === host; } catch (e) { return false; }
}

/* The week a time falls in: Monday to Sunday, UTC, named by its Monday. */
function weekOf(ms) {
    const d = new Date(ms), day = (d.getUTCDay() + 6) % 7, mon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
    const iso = t => new Date(t).toISOString().slice(0, 10);
    return { week: iso(mon), from: iso(mon), to: iso(mon + 6 * 864e5) };
}

/* The points for a find taking `secs`, with `hints` clues asked for. */
function pointsFor(secs, hints) {
    const s = Math.max(MIN_SECS, secs);
    if (s > LIMIT_SECS + GRACE_SECS) return 0;
    const speed = Math.max(0, 1 - Math.min(s, LIMIT_SECS) / LIMIT_SECS);
    return Math.round((100 + 900 * speed) / 10) * 10 + 150 * Math.max(0, 3 - Math.max(0, hints | 0));
}

/* ---- the spots: the published map's, as the editor's Lost Property tab saves them ----
   map.lostSpots: [{ level, x, y, skip: [k...] }], level a floor's id; the first
   spots were [floorName, x, y]. Basement floors never count. Kept for a minute. */
const OLD_SPOTS = [["Ground", 58, 46], ["Ground", 75, 15], ["Ground", 83, 15], ["Ground", 91, 15], ["Floor 1", 71, -10], ["Floor 1", 151, -16], ["Floor 2", 60, -21], ["Ground", 94, -7], ["Ground", 73, 3], ["Ground", 86, 3], ["Floor 1", 36, -1], ["Floor 2", 20, 15], ["Floor 2", 26, 5], ["Floor 2", 26, 8], ["Ground", 96, -8], ["Ground", 78, 2], ["Ground", 67, 0], ["Floor 1", 83, -12], ["Ground", 71, 4], ["Ground", 74, 15], ["Ground", 82, 15], ["Ground", 84, 5], ["Ground", 58, 38]];
function spotsOf(map) {
    const levels = map && Array.isArray(map.levels) ? map.levels : [], out = [];
    const list = map && Array.isArray(map.lostSpots) ? map.lostSpots : OLD_SPOTS;
    for (const s of list) {
        const raw = Array.isArray(s) ? { name: s[0], x: s[1], y: s[2] } : s;
        if (!raw || !Number.isInteger(raw.x) || !Number.isInteger(raw.y)) continue;
        const l = levels.length ? levels.find(q => raw.level !== undefined ? q.id === raw.level : q.name === raw.name) : null;
        if (levels.length && (!l || l.k < 0)) continue;
        out.push({ level: l ? l.id : null, name: l ? l.name : raw.name, x: raw.x, y: raw.y, skip: Array.isArray(raw.skip) ? raw.skip.map(String) : [] });
    }
    return out;
}
const liveSpots = async () => spotsOf(await publishedMap());
const sameSpot = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && (a.level === b.level || a.level === null || b.level === null);

/* What to send them for: a thing they haven't found yet if there is one (his: avoid repeats), never the one they
   were just sent for, at a spot that suits it (skip lists the things that don't show well there). */
function choose(spots, seen, notK) {
    const all = THINGS.filter(t => t.k !== notK), fresh = all.filter(t => !seen.has(t.k)), pool = fresh.length ? fresh : all;
    const r = n => crypto.randomInt(n);
    for (const t of pool.map(x => [r(1e9), x]).sort((a, b) => a[0] - b[0]).map(x => x[1])) {
        const fit = spots.filter(s => !s.skip.includes(t.k));
        if (fit.length) return { k: t.k, spot: fit[r(fit.length)] };
    }
    return null;
}

/* ---- Visitors ---- */
function signVisitor(v, n) {
    if (!process.env.SESSION_SECRET) return null;
    return jwt.sign({ v, n }, process.env.SESSION_SECRET, { audience: VISITOR_AUDIENCE, algorithm: "HS256" });
}
function readVisitor(token) {
    if (!token || typeof token !== "string" || token.length > 400 || !process.env.SESSION_SECRET) return null;
    try {
        const c = jwt.verify(token, process.env.SESSION_SECRET, { audience: VISITOR_AUDIENCE, algorithms: ["HS256"] });
        return c && typeof c.v === "string" && /^[a-f0-9]{16}$/.test(c.v) && Number.isInteger(c.n) && c.n >= 0 ? { v: c.v, n: c.n } : null;
    } catch (e) { return null; }
}
const visitorName = n => "Visitor " + String(n).padStart(n < 1000 ? 3 : 4, "0");
async function newVisitor(db, event) {
    const net = netHashFor(event), hour = Math.floor(Date.now() / 3600000);
    if (net) {
        try {
            const caps = db.collection(COLLECTION + "_caps");
            await caps.createIndex({ at: 1 }, { expireAfterSeconds: 2 * 3600 }).catch(() => {});
            const r = await caps.findOneAndUpdate({ _id: net + ":" + hour }, { $inc: { n: 1 }, $setOnInsert: { at: new Date(hour * 3600000) } }, { upsert: true, returnDocument: "after" });
            const doc = r && r.value !== undefined ? r.value : r;
            if (doc && doc.n > NEW_PER_HOUR) return "busy";
        } catch (e) { console.error("hallway-lost: couldn't count new visitors", e); }
    }
    const col = db.collection(COLLECTION + "_visitors");
    await ensureUniqueIndex(col, ["n"]);
    const v = crypto.randomBytes(8).toString("hex");
    for (let i = 0; i < 40; i++) {
        const n = i < 30 ? crypto.randomInt(1, 1000) : crypto.randomInt(1000, 10000);
        try { await col.insertOne({ n, v, at: new Date() }); return { v, n }; }
        catch (e) { if (!(e && e.code === 11000)) throw e; }
    }
    return null;
}

/* Who's playing: { id, name, token? } — a nicknamed player, or a Visitor (minted if `mint`). */
async function whoIs(db, event, body, mint) {
    const player = playerFrom(event);
    if (player) {
        const row = await db.collection("players").findOne({ id: String(player.id) }, { projection: { _id: 0, nick: 1 } });
        if (row && typeof row.nick === "string" && row.nick) return { id: String(player.id), name: row.nick, player: true };
    }
    const had = readVisitor(body && body.v);
    if (had) return { id: "visitor:" + had.v, name: visitorName(had.n), player: false };
    if (!mint) return null;
    const made = await newVisitor(db, event);
    if (made === "busy") return "busy";
    if (!made) return null;
    const token = signVisitor(made.v, made.n);
    if (!token) return null;
    return { id: "visitor:" + made.v, name: visitorName(made.n), player: false, token };
}

async function board(db, wk, meId) {
    const col = db.collection(COLLECTION);
    const raw = await col.find({ week: wk.week, points: { $gt: 0 } }, { projection: { _id: 0, playerId: 1, name: 1, points: 1, finds: 1, best: 1 } }).sort({ points: -1, best: -1, at: 1 }).limit(TOP + 15).toArray();
    const rows = raw.map(r => ({ id: r.playerId, name: r.name || "", points: r.points, finds: r.finds || 0, best: r.best || 0 }));
    const isVisitor = r => String(r.id).startsWith("visitor:");
    const [players] = await withoutBanned(db, [rows.filter(r => !isVisitor(r))]);
    const keep = new Set(players.map(r => r.id)), kept = rows.filter(r => isVisitor(r) || keep.has(r.id)), top = kept.slice(0, TOP);
    let me = null;
    if (meId) {
        const mine = await col.findOne({ playerId: meId, week: wk.week }, { projection: { _id: 0, points: 1, finds: 1, best: 1, name: 1 } });
        if (mine && mine.points > 0) {
            const above = await col.countDocuments({ week: wk.week, points: { $gt: mine.points } });
            me = { name: mine.name || "", points: mine.points, finds: mine.finds || 0, best: mine.best || 0, rank: above + 1 };
        }
    }
    const [pub] = await publicLists(db, [top.filter(r => !isVisitor(r)).map(r => ({ ...r }))]);
    const pubById = new Map(top.filter(r => !isVisitor(r)).map((r, i) => [r.id, pub[i]]));
    const out = top.map((r, i) => isVisitor(r) ? { name: r.name, points: r.points, finds: r.finds, best: r.best, id: null, avatar: null, visitor: true, rank: i + 1 } : { ...pubById.get(r.id), rank: i + 1 });
    return { ...wk, rows: out, me };
}

async function handler(event) {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (event.httpMethod === "POST") {
        if (!sameOrigin(event)) return json(403, { error: "Not from this site" });
        if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    }
    let db;
    try { db = await getDb(); } catch (e) { console.error("hallway-lost: database connection failed", e); return json(503, { error: "Database connection failed" }); }
    const now = Date.now(), wk = weekOf(now);

    if (event.httpMethod === "GET") {
        try {
            const q = event.queryStringParameters || {}, who = await whoIs(db, event, { v: q.v }, false);
            return json(200, await board(db, wk, who && who !== "busy" ? who.id : null));
        } catch (e) { console.error("hallway-lost: board read failed", e); return json(500, { error: "Couldn't read the board" }); }
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });
    const act = body.act;
    if (!["start", "swap", "hint", "found", "cancel"].includes(act)) return json(400, { error: "Invalid request" });
    const k = typeof body.k === "string" && ID.test(body.k) ? body.k : null;
    if (act === "found" && (!k || !body.at || typeof body.at !== "object")) return json(400, { error: "Invalid request" });

    const player = playerFrom(event);
    /* banned players and networks, revoked sessions: the games' gate (a Visitor has no account, so only the network counts) */
    const refusal = await writeRefusal(db, event, player ? player.id : null, { game: true });
    if (refusal) return refusal;

    let who;
    try { who = await whoIs(db, event, body, act === "start"); } catch (e) { console.error("hallway-lost: who", e); return json(503, { error: "Couldn't start just now" }); }
    if (who === "busy") return json(429, { error: "Too many new visitors from here just now. Try again later." });
    if (!who) return json(act === "start" ? 503 : 409, { error: act === "start" ? "Couldn't start just now" : "No search open" });

    const id = who.id, opens = db.collection(COLLECTION + "_open"), col = db.collection(COLLECTION), seenCol = db.collection(COLLECTION + "_seen");
    try {
        await ensureUniqueIndex(opens, ["playerId"]);
        await ensureUniqueIndex(col, ["playerId", "week"]);
        await ensureUniqueIndex(seenCol, ["playerId"]);
    } catch (e) { console.error("hallway-lost: unique index unavailable", e); return json(503, { error: "Couldn't save just now" }); }

    try {
        if (act === "start" || act === "swap") {
            const was = await opens.findOne({ playerId: id }, { projection: { _id: 0, k: 1 } });
            if (act === "swap" && !was) return json(409, { error: "No search open" });
            const seenRow = await seenCol.findOne({ playerId: id }, { projection: { _id: 0, ks: 1 } });
            const pick = choose(await liveSpots(), new Set((seenRow && seenRow.ks) || []), was && was.k);
            if (!pick) return json(503, { error: "Nothing to find just now" });
            const spot = { level: pick.spot.level, name: pick.spot.name, x: pick.spot.x, y: pick.spot.y };
            await opens.updateOne({ playerId: id }, { $set: { playerId: id, k: pick.k, spot, t0: now, hints: 0 } }, { upsert: true });
            const out = { k: pick.k, spot, left: LIMIT_SECS * 1000, limit: LIMIT_SECS, name: who.name };
            if (who.token) out.v = who.token;
            return json(200, out);
        }
        if (act === "hint") {
            const r = await opens.findOneAndUpdate({ playerId: id }, { $inc: { hints: 1 } }, { returnDocument: "after" });
            const o = r && r.value !== undefined ? r.value : r;
            if (!o) return json(409, { error: "No search open" });
            return json(200, { hints: o.hints });
        }
        if (act === "cancel") {
            await opens.deleteOne({ playerId: id });
            return json(200, { ok: true });
        }
        /* found: only the search that's open, at the spot it was put, and only once */
        const at = { level: body.at.level === null || typeof body.at.level === "string" ? body.at.level : undefined, x: body.at.x, y: body.at.y };
        const open = await opens.findOne({ playerId: id, k });
        if (!open || !open.t0) return json(409, { error: "No search open for that" });
        if (!sameSpot(open.spot, at)) return json(409, { error: "That isn't where it was" });
        const gone = await opens.findOneAndDelete({ playerId: id, k, t0: open.t0 });
        const o = gone && (gone.value !== undefined ? gone.value : gone);
        if (!o) return json(409, { error: "No search open for that" });
        await seenCol.updateOne({ playerId: id }, { $addToSet: { ks: k } }, { upsert: true });
        const secs = Math.round((now - o.t0) / 1000), points = pointsFor(secs, o.hints);
        if (!points) return json(200, { points: 0, secs, late: true, week: wk.week });
        const today = new Date(now).toISOString().slice(0, 10), was = await col.findOne({ playerId: id, week: wk.week }, { projection: { _id: 0, day: 1, dayFinds: 1 } });
        const dayFinds = was && was.day === today ? (was.dayFinds || 0) : 0;
        if (dayFinds >= DAY_CAP) return json(200, { points, secs, hints: o.hints, capped: true, week: wk.week });
        await col.updateOne({ playerId: id, week: wk.week }, {
            $inc: { points, finds: 1 }, $max: { best: points },
            $set: { name: who.name, day: today, dayFinds: dayFinds + 1, at: new Date(now).toISOString() }
        }, { upsert: true });
        return json(200, { points, secs, hints: o.hints, week: wk.week });
    } catch (e) {
        console.error("hallway-lost: write failed", e);
        return json(500, { error: "Couldn't save that" });
    }
}

exports.handler = handler;
exports._for = { pointsFor, weekOf, spotsOf, choose, visitorName, LIMIT_SECS, THINGS, resetSpots: () => resetMap() };
exports.handler = require("./_errors").withErrorReporting("hallway-lost", exports.handler);

/* /.netlify/functions/hallway-lost — Lost Property: what's lost, where, the
   clock, and the weekly board (8 Nov 2026, the owner's: a 15-minute limit to
   find each thing and a score, with a leaderboard; then "Server should pick ...
   i don't want people ruining it with exploits", and guests on the board as
   "Visitor 001" etc., "randomly generated though, not going up from 1").

   GET [X-Hallway-Visitor: token]  this week's board: the top 20, and your own row.
                                (?v=token too, from pages older than 9 Nov.)
                                { week, from, to, rows: [...], me }
   POST {act: "start", v?}      hustle asks you to find something. THIS picks
                                the thing and its spot from the published map's
                                spots, preferring things you haven't found, and
                                starts the clock on its own time. One search
                                open per player; asked again while it's still
                                open, it hands back that one, clock running
                                (resumed: true). Once it's over, a new one.
                                { k, spot: {level, x, y}, left, limit, hints, swapsLeft, v? }
   POST {act: "swap", v?}       "ask for a different one": another thing, on
                                the same clock, MAX_SWAPS times a search; then
                                409 { noSwaps: true }.
   POST {act: "hint", v?}       a clue was asked for: counted here. { hints }
   POST {act: "found", k, at: {level, x, y}, v?}
                                you handed it in at the desk (posted at the
                                desk since 15 Nov 2026, not on picking it up).
                                Not in the search's first HANDIN_MIN_SECS:
                                409 { closed: true, wait: ms }, the search
                                kept open. Only the thing this search
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
   is choose an easy thing (a swap or a fresh start doesn't restart the clock,
   and swaps are few), see the spot before the clock starts, skip the
   clue count (clues are counted here), find
   something it wasn't sent for, or put more than DAY_CAP finds a day on the
   board. Since 15 Nov 2026 it can't post a find in a search's first two
   minutes (HANDIN_MIN_SECS, the owner's answer to the scan's finding 7):
   the desk is closed until then, which the page tells the player only if
   they get there early.

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
const { publishedMap, standableOn, pickUpFrom, _reset: resetMap } = require("./_hallway-map");
const THINGS = require("./_hallway-lost-things.json");

const COLLECTION = "hallway_lost";
const LIMIT_SECS = 15 * 60;
const GRACE_SECS = 20;          // the page's clock and this one can differ by a few seconds
const MIN_SECS = 20;
const HANDIN_MIN_SECS = 120;    // the desk takes nothing in a search's first two minutes (15 Nov 2026, the owner's)
const DAY_CAP = 20;
const TOP = 20;
const MAX_BODY = 2048;
const NEW_PER_HOUR = 10;
const MAX_SWAPS = 2;            // "ask for a different one", per search (9 Nov scan, finding 2)
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
   spots were [floorName, x, y]. Basement floors never count. Kept for a minute.
   A spot nobody can pick up is never dealt (9 Nov scan, Hallway content finding 1: G 96,-8 was under a table with a chair on every side,
   so every search sent there could only end as a miss): it has to be standable, or have a free tile beside it, by the same rule as the
   page's reachFrom (live-lost.js), worked out from the map here (_hallway-map.js pickUpFrom). So a map edit can't make another one. */
const OLD_SPOTS = [["Ground", 58, 46], ["Ground", 75, 15], ["Ground", 83, 15], ["Ground", 91, 15], ["Floor 1", 71, -10], ["Floor 1", 151, -16], ["Floor 2", 60, -21], ["Ground", 94, -7], ["Ground", 73, 3], ["Ground", 86, 3], ["Floor 1", 36, -1], ["Floor 2", 20, 15], ["Floor 2", 26, 5], ["Floor 2", 26, 8], ["Ground", 78, 2], ["Ground", 67, 0], ["Floor 1", 83, -12], ["Ground", 71, 4], ["Ground", 74, 15], ["Ground", 82, 15], ["Ground", 84, 5], ["Ground", 58, 38]];
function spotsOf(map) {
    if (!map) return [];                // no map to be read just now: nothing is dealt (10 Nov scan, server finding 3), never the old fixed spots
    const levels = map && Array.isArray(map.levels) ? map.levels.filter(q => q && typeof q === "object") : [], out = [], frees = new Map();      // a null floor threw on every start (15 Nov scan, finding 9)
    const list = map && Array.isArray(map.lostSpots) ? map.lostSpots : OLD_SPOTS;
    for (const s of list) {
        const raw = Array.isArray(s) ? { name: s[0], x: s[1], y: s[2] } : s;
        if (!raw || !Number.isInteger(raw.x) || !Number.isInteger(raw.y)) continue;
        if (raw.noReach) continue;            // the editor found nobody can get there (10 Nov scan, server finding 10)
        const l = levels.length ? levels.find(q => raw.level != null ? q.id === raw.level : q.name === raw.name) : null;      // null goes by name, as the page does
        if (levels.length && (!l || l.k < 0)) continue;
        if (l) { if (!frees.has(l)) frees.set(l, standableOn(map, l)); if (!pickUpFrom(map, l, raw.x, raw.y, frees.get(l)).length) continue; }
        out.push({ level: l ? l.id : null, name: l ? l.name : raw.name, x: raw.x, y: raw.y, skip: Array.isArray(raw.skip) ? raw.skip.map(String) : [] });
    }
    return out;
}
/* worked out once per map read (publishedMap keeps one for a minute), not on every start */
let spotMemo = { map: undefined, spots: [] };
const liveSpots = async () => { const m = await publishedMap(); if (!m) return []; if (spotMemo.map !== m) spotMemo = { map: m, spots: spotsOf(m) }; return spotMemo.spots; };
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
const OPEN_TTL_DAYS = 2;
let capsIndex = false, tidyIndexes = false;
async function newVisitor(db, event) {
    const net = netHashFor(event), hour = Math.floor(Date.now() / 3600000);
    if (net) {
        try {
            const caps = db.collection(COLLECTION + "_caps");
            if (!capsIndex) { capsIndex = true; await caps.createIndex({ at: 1 }, { expireAfterSeconds: 2 * 3600 }).catch(() => {}); }      // once per warm instance, not every new Visitor (15 Nov scan, finding 10)
            const r = await caps.findOneAndUpdate({ _id: net + ":" + hour }, { $inc: { n: 1 }, $setOnInsert: { at: new Date(hour * 3600000) } }, { upsert: true, returnDocument: "after" });
            const doc = r && r.value !== undefined ? r.value : r;
            if (doc && doc.n > NEW_PER_HOUR) return "busy";
        } catch (e) { console.error("hallway-lost: couldn't count new visitors", e); }
    }
    const v = crypto.randomBytes(8).toString("hex"), n = await drawNumber(db, v);
    return n ? { v, n } : null;
}
/* (9 Nov scan, finding 3) Numbers used to be held for all time, and drawn by trial: 30 tries at three digits, then 10 at four. Past the
   first ~1000 Visitors every new one cost 30 failed inserts, and the whole space ran out at about 9,900, locking every signed-out player
   out of Lost Property for good. Now a number comes back once its Visitor hasn't started a search for VISITOR_IDLE_DAYS (a TTL on `at`,
   which each start renews; a Visitor coming back after that is given a new number on the same id, keeping their record), a few tries
   per size and then a bigger size, and a size found full is skipped for a while on this instance. */
const VISITOR_IDLE_DAYS = 56, TRIES = 6, SIZES = [[1, 1000], [1000, 10000], [10000, 100000]], fullUntil = new Map();
let visitorIndexes = false;
async function visitorsCol(db) {
    const col = db.collection(COLLECTION + "_visitors");
    await ensureUniqueIndex(col, ["n"]);
    if (!visitorIndexes) { visitorIndexes = true; await col.createIndex({ at: 1 }, { expireAfterSeconds: VISITOR_IDLE_DAYS * 86400 }).catch(e => console.error("hallway-lost: visitors' TTL index", e)); await col.createIndex({ v: 1 }).catch(() => {}); }
    return col;
}
async function drawNumber(db, v) {
    const col = await visitorsCol(db), now = Date.now();
    for (let s = 0; s < SIZES.length; s++) {
        if ((fullUntil.get(s) || 0) > now && s < SIZES.length - 1) continue;
        for (let i = 0; i < TRIES; i++) {
            const n = crypto.randomInt(SIZES[s][0], SIZES[s][1]);
            try { await col.insertOne({ n, v, at: new Date() }); return n; }
            catch (e) { if (!(e && e.code === 11000)) throw e; }
        }
        fullUntil.set(s, now + 10 * 60e3);
    }
    return 0;
}
/* a Visitor starting a search: their number's kept another VISITOR_IDLE_DAYS; if it was let go while they were away, a new one */
async function keepVisitor(db, had) {
    const col = await visitorsCol(db), r = await col.findOneAndUpdate({ v: had.v, n: had.n }, { $set: { at: new Date() } }, { returnDocument: "after" });
    const doc = r && r.value !== undefined ? r.value : r;
    if (doc) return { kept: true, v: had.v, n: had.n };
    const n = await drawNumber(db, had.v);
    return n ? { v: had.v, n } : null;
}

/* Who's playing: { id, name, token? } — a nicknamed player, or a Visitor (minted if `mint`). */
async function whoIs(db, event, body, mint) {
    const player = playerFrom(event);
    if (player) {
        const row = await db.collection("players").findOne({ id: String(player.id) }, { projection: { _id: 0, nick: 1 } });
        if (row && typeof row.nick === "string" && row.nick) return { id: String(player.id), name: row.nick, player: true };
    }
    const had = readVisitor(body && body.v);
    if (had && mint) {
        const again = await keepVisitor(db, had);
        /* (10 Nov scan, server finding 19) no number to be had: not the old one, which may be another Visitor's now */
        if (!again) return null;
        if (!again.kept) { const token = signVisitor(again.v, again.n); if (!token) return null; return { id: "visitor:" + had.v, name: visitorName(again.n), player: false, token }; }
    }
    if (had) return { id: "visitor:" + had.v, name: visitorName(had.n), player: false };
    if (!mint) return null;
    const made = await newVisitor(db, event);
    if (made === "busy") return "busy";
    if (!made) return null;
    const token = signVisitor(made.v, made.n);
    if (!token) return null;
    return { id: "visitor:" + made.v, name: visitorName(made.n), player: false, token };
}

let boardIndex = false;
async function board(db, wk, meId) {
    const col = db.collection(COLLECTION);
    /* (10 Nov scan, server finding 11) the board's read and sort, by week, without scanning every week ever */
    if (!boardIndex) { boardIndex = true; await col.createIndex({ week: 1, points: -1, best: -1, at: 1 }).catch(e => console.error("hallway-lost: board index", e)); }
    const raw = await col.find({ week: wk.week, points: { $gt: 0 } }, { projection: { _id: 0, playerId: 1, name: 1, points: 1, finds: 1, best: 1 } }).sort({ points: -1, best: -1, at: 1 }).limit(TOP + 15).toArray();
    const rows = raw.map(r => ({ id: r.playerId, name: r.name || "", points: r.points, finds: r.finds || 0, best: r.best || 0 }));
    const isVisitor = r => String(r.id).startsWith("visitor:");
    const [players] = await withoutBanned(db, [rows.filter(r => !isVisitor(r))]);
    const keep = new Set(players.map(r => r.id)), kept = rows.filter(r => isVisitor(r) || keep.has(r.id)), top = kept.slice(0, TOP);
    let me = null;
    if (meId) {
        const mine = await col.findOne({ playerId: meId, week: wk.week }, { projection: { _id: 0, points: 1, finds: 1, best: 1, name: 1 } });
        if (mine && mine.points > 0) {
            /* ranked as the board is (9 Nov scan, finding 9): on it, your place in it; below it, the players above you the board would
               show, so banned players (and players with no nickname, whom the board leaves off too) don't push you down */
            const at = top.findIndex(r => r.id === meId);
            let rank;
            if (at >= 0) rank = at + 1;
            else {
                const ups = await col.find({ week: wk.week, points: { $gt: mine.points } }, { projection: { _id: 0, playerId: 1 } }).limit(5000).toArray();
                const upRows = ups.map(r => ({ id: r.playerId })), upVisitors = upRows.filter(isVisitor).length;
                const [upPlayers] = await withoutBanned(db, [upRows.filter(r => !isVisitor(r))]);
                rank = upVisitors + upPlayers.length + 1;
            }
            me = { name: mine.name || "", points: mine.points, finds: mine.finds || 0, best: mine.best || 0, rank };
        }
    }
    const [pub] = await publicLists(db, [top.filter(r => !isVisitor(r)).map(r => ({ ...r }))]);
    const pubById = new Map(top.filter(r => !isVisitor(r)).map((r, i) => [r.id, pub[i]]));
    /* each player under the nickname they have now, not the one they had at their last find (10 Nov scan, server finding 12) */
    const nickIds = top.filter(r => !isVisitor(r)).map(r => String(r.id)).concat(me && meId && !isVisitor({ id: meId }) ? [String(meId)] : []), nicks = new Map();
    if (nickIds.length) { try { for (const p of await db.collection("players").find({ id: { $in: nickIds } }, { projection: { _id: 0, id: 1, nick: 1 } }).toArray()) if (typeof p.nick === "string" && p.nick) nicks.set(String(p.id), p.nick); } catch (e) { console.error("hallway-lost: nicknames", e); } }
    if (me && nicks.has(String(meId))) me.name = nicks.get(String(meId));
    const out = top.map((r, i) => isVisitor(r) ? { name: r.name, points: r.points, finds: r.finds, best: r.best, id: null, avatar: null, visitor: true, rank: i + 1 } : { ...pubById.get(r.id), name: nicks.get(String(r.id)) || r.name, rank: i + 1 });
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
            /* the Visitor's token in a header, not the address, where request logs keep it (9 Nov scan, finding 11); ?v= still read
               for pages loaded before this */
            const q = event.queryStringParameters || {}, h = event.headers || {}, tok = h["x-hallway-visitor"] || h["X-Hallway-Visitor"] || q.v;
            const who = await whoIs(db, event, { v: tok }, false);
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
    /* only while the Hallway is open, or for an admin walking it before then (10 Nov scan, server finding 7: _hallway-open.js) */
    const open = await require("./_hallway-open").hallwayOpen(db, event);
    if (open === null) return json(503, { error: "Couldn't save just now" });
    if (!open) return json(403, { error: "The Hallway isn't open yet" });
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
    /* (15 Nov scan, server finding 10) rows nobody tidied: an open search goes OPEN_TTL_DAYS after its start, and what a player has found
       VISITOR_IDLE_DAYS after their last find, as a Visitor's number does. Once per warm instance. */
    if (!tidyIndexes) {
        tidyIndexes = true;
        await opens.createIndex({ at: 1 }, { expireAfterSeconds: OPEN_TTL_DAYS * 86400 }).catch(e => console.error("hallway-lost: open searches' TTL index", e));
        await seenCol.createIndex({ at: 1 }, { expireAfterSeconds: VISITOR_IDLE_DAYS * 86400 }).catch(e => console.error("hallway-lost: seen TTL index", e));
    }

    try {
        /* (9 Nov scan, finding 2) Re-rolling was free: start and swap each put a new thing at a new spot on a new clock, so a script could
           roll until the spot was a step away. Now the clock is the search's, not the thing's: a swap keeps it running, and there are only
           MAX_SWAPS of them a search (counted on the open row); a start while a search is still open hands back that same search, on its
           own clock, rather than a fresh one. */
        if (act === "start" || act === "swap") {
            const was = await opens.findOne({ playerId: id }, { projection: { _id: 0, k: 1, spot: 1, t0: 1, hints: 1, swaps: 1, cancelled: 1 } });
            const live = was && was.t0 && now - was.t0 <= (LIMIT_SECS + GRACE_SECS) * 1000 ? was : null;
            const answer = (o, extra) => { const out = { k: o.k, spot: o.spot, left: Math.max(0, LIMIT_SECS * 1000 - (now - o.t0)), limit: LIMIT_SECS, name: who.name, hints: o.hints || 0, swapsLeft: Math.max(0, MAX_SWAPS - (o.swaps || 0)), ...(extra || {}) }; if (who.token) out.v = who.token; return json(200, out); };
            if (act === "swap" && (!live || live.cancelled)) return json(409, { error: "No search open" });
            /* a search given up is taken up again on its own clock, the same thing at the same spot (10 Nov scan, server finding 4: start,
               cancel, start re-rolled the thing, the spot and the clock as often as anyone liked) */
            if (act === "start" && live && live.k && live.spot) { if (live.cancelled) await opens.updateOne({ playerId: id, t0: live.t0 }, { $set: { cancelled: 0 } }); return answer(live, { resumed: true }); }
            if (act === "swap" && (live.swaps || 0) >= MAX_SWAPS) return json(409, { error: "No more swaps for this one", noSwaps: true, swapsLeft: 0 });
            const seenRow = await seenCol.findOne({ playerId: id }, { projection: { _id: 0, ks: 1 } });
            const pick = choose(await liveSpots(), new Set((seenRow && seenRow.ks) || []), was && was.k);
            if (!pick) return json(503, { error: "Nothing to find just now" });
            const spot = { level: pick.spot.level, name: pick.spot.name, x: pick.spot.x, y: pick.spot.y };
            /* a fresh start clears the last search's `cancelled` (15 Nov scan, server finding 1: leave mid-search, come back after the 15
               minutes, and the new search was born cancelled, so its first find was refused); `at` is the row's date for its TTL (finding 10) */
            const row = act === "swap" ? { k: pick.k, spot, t0: live.t0, hints: 0, swaps: (live.swaps || 0) + 1 } : { k: pick.k, spot, t0: now, hints: 0, swaps: 0, cancelled: 0, at: new Date(now) };
            /* a swap only lands on the search it was asked of: two at once can't both spend the same swap */
            const f = act === "swap" ? { playerId: id, t0: live.t0, swaps: live.swaps ? live.swaps : { $in: [0, null] } } : { playerId: id };
            const r = await opens.updateOne(f, { $set: { playerId: id, ...row } }, { upsert: act === "start" });
            if (act === "swap" && !r.matchedCount) return json(409, { error: "No more swaps for this one", noSwaps: true, swapsLeft: 0 });
            return answer(row);
        }
        if (act === "hint") {
            const r = await opens.findOneAndUpdate({ playerId: id }, { $inc: { hints: 1 } }, { returnDocument: "after" });
            const o = r && r.value !== undefined ? r.value : r;
            if (!o) return json(409, { error: "No search open" });
            return json(200, { hints: o.hints });
        }
        if (act === "cancel") {
            await opens.updateOne({ playerId: id }, { $set: { cancelled: now } });
            return json(200, { ok: true });
        }
        /* found: only the search that's open, at the spot it was put, and only once */
        const at = { level: body.at.level === null || typeof body.at.level === "string" ? body.at.level : undefined, x: body.at.x, y: body.at.y };
        const open = await opens.findOne({ playerId: id, k });
        if (!open || !open.t0 || open.cancelled) return json(409, { error: "No search open for that" });
        if (!sameSpot(open.spot, at)) return json(409, { error: "That isn't where it was" });
        /* the desk is shut for the first HANDIN_MIN_SECS of a search (15 Nov 2026, the owner's, not announced): the search stays open and the
           page says when to come back. A script posting the moment it starts gets nothing until then. */
        const wait = HANDIN_MIN_SECS * 1000 - (now - open.t0);
        if (wait > 0) return json(409, { error: "The desk is closed", closed: true, wait });
        const gone =await opens.findOneAndDelete({ playerId: id, k, t0: open.t0 });
        const o = gone && (gone.value !== undefined ? gone.value : gone);
        if (!o) return json(409, { error: "No search open for that" });
        await seenCol.updateOne({ playerId: id }, { $addToSet: { ks: k }, $set: { at: new Date(now) } }, { upsert: true });
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
exports._for = { pointsFor, weekOf, spotsOf, choose, visitorName, LIMIT_SECS, THINGS, resetSpots: () => { resetMap(); spotMemo = { map: undefined, spots: [] }; } };
exports.handler = require("./_errors").withErrorReporting("hallway-lost", exports.handler);

/* /.netlify/functions/hallway-progress — what a signed-in player has found in
   the Hallway, kept against their account so they can carry on from any
   device (7 Nov 2026, the owner's: "guests save in the browser; signed-in save
   to their account"). Guests never come here: hallway progress stays in their
   browser, and is merged in here the first time they sign in.

   GET   { scraps: [id, ...], key: bool, lost: { day, streak, shelf: [...], points, best, missed }, hunts: { id: { found: [...], done } } }
   POST  the same shape, or any part of it. It only ever adds: scraps and found
         clues are added to, the key can't be lost, a hunt can't be un-finished,
         and an older Lost Property day can't overwrite a newer one. So two
         devices, or a guest's browser signing in, can't undo anything.

   One document per player, in `hallway_progress`. This is the player's own
   record and nothing is ranked from it: anything that does rank (a hunt's
   finishing order) has to be decided on the server, not read from here.

   HUNTS ARE CHECKED HERE (8 Nov 2026, the owner's: "Server should check").
   A hunt has to be one on the published map, and its clues only count in
   order: clue 2 isn't taken until clue 1 is in. Each clue's time in is kept
   (`at`). A save takes one new clue at most, and only MIN_CLUE_MS or more
   after the clue before it came in (9 Nov scan); the page sends what it has
   again until the server has caught up (progress.js), so a guest's whole
   hunt arriving at sign-in goes in a clue at a time. A hunt is finished,
   with its place and the key, when every clue is in: a page saying "done"
   decides nothing. The key comes only from a finished hunt. With the map
   unreadable, clues are kept but nothing finishes until it's back.

   STILL TAKEN ON TRUST: that a clue was really found. A script can still
   finish a hunt by posting its clues one by one, MIN_CLUE_MS apart; only a
   per-clue proof from the server (a token given out when a clue is opened)
   would stop that, and that's the owner's call.

   PLACES come from a counter per hunt in `hallway_hunt_places`, taken with
   one atomic $inc, so two players finishing at once can't share a place
   (9 Nov scan, finding 5). Not per player, so player-forget leaves it.

   Signed in, with a live session, and not banned: the same gate every player
   write goes through (writeRefusal in _bans.js). */
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom, sessionRevoked } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
const { writeRefusal } = require("./_bans");
const { publishedMap } = require("./_hallway-map");

const COLLECTION = "hallway_progress";
const PLACES = "hallway_hunt_places";
const MAX_BODY = 16 * 1024;
const MAX_LIST = 400;
const ID = /^[\w .:'-]{1,60}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MIN_CLUE_MS = 8000;
const CLUE = /^c\d{1,3}$/;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

/* The request came from this site: player-data.js's check. */
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

const ids = (list) => (Array.isArray(list) ? [...new Set(list.filter((s) => typeof s === "string" && ID.test(s)))].slice(0, MAX_LIST) : []);

const num = v => (Number.isInteger(v) && v > 0 && v < 1e9 ? v : 0);
const view = (doc) => {
    const d = doc || {};
    const lost = d.lost || {};
    return {
        scraps: ids(d.scraps),
        key: d.key === true,
        lost: { day: DAY.test(lost.day || "") ? lost.day : "", streak: Number.isInteger(lost.streak) && lost.streak > 0 ? lost.streak : 0, shelf: ids(lost.shelf), points: num(lost.points), best: num(lost.best), missed: num(lost.missed) },
        hunts: Object.fromEntries(Object.entries(d.hunts && typeof d.hunts === "object" ? d.hunts : {}).map(([id, h]) => [id, { found: ids(h && h.found), done: !!(h && h.done), ...(h && h.place ? { place: h.place } : {}) }]))
    };
};

/* What's in the request, and nothing else. Anything malformed is left out
   rather than refused, so one bad field can't lose the rest. */
function cleanBody(body) {
    const out = { scraps: ids(body.scraps), key: body.key === true, lost: null, hunts: {} };
    const l = body.lost;
    /* a day after tomorrow is a wrong clock, not a day: it would hold the count still for good (8 Nov 2026) */
    const latest = new Date(Date.now() + 36 * 3600e3).toISOString().slice(0, 10);
    if (l && typeof l === "object" && DAY.test(l.day || "") && l.day <= latest && Number.isInteger(l.streak) && l.streak >= 0 && l.streak < 100000) out.lost = { day: l.day, streak: l.streak, shelf: ids(l.shelf), points: num(l.points), best: num(l.best), missed: num(l.missed) };
    if (body.hunts && typeof body.hunts === "object" && !Array.isArray(body.hunts)) {
        for (const [id, h] of Object.entries(body.hunts).slice(0, 50)) {
            if (!ID.test(id) || id.includes(".") || !h || typeof h !== "object") continue;
            out.hunts[id] = { found: ids(h.found), done: h.done === true };
        }
    }
    return out;
}

/* The hunts on the published map: id -> its clues. null when the map can't be read. */
const huntsOf = map => map && Array.isArray(map.levels) ? new Map((Array.isArray(map.hunts) ? map.hunts : []).filter(h => h && typeof h.id === "string" && Array.isArray(h.clues) && h.clues.length).map(h => [h.id, h.clues])) : null;

/* HOW LONG BEFORE THE NEXT CLUE (15 Nov scan, server finding on the hunts: a script posting every clue 8 s apart finished a five-clue hunt,
   with a place and the key, in 32 seconds, the first clue with no wait at all). The server has the map, so:
   - clue n is taken only once the walk from clue n-1 could have been made: the tiles between them (the longer of across and down, as a
     Habbo walks diagonally at the same speed), less one at each end for picking it up from beside it, at MS_PER_TILE, the walk's own speed
     (editor.js). Never less than MIN_CLUE_MS. Only between two clues lying on tiles of the same floor: a clue that's clicked on the wall
     can be clicked from anywhere on its floor, and a change of floor can be a lift, so those count MIN_CLUE_MS alone.
   - the wait is held to WALK_CAP_MS at most, so progress.js's catch-up (a try every 9 s, three that don't move and it waits for the next
     visit) always gets an honest player's clue in; a clue posted early is never lost, only taken a little later.
   - clue 0 is taken MIN_CLUE_MS after the server first heard of the hunt from this player (`started`, the hunt's first save). Not the walk
     from the entrance the scan suggested: the hunts board opens from the menu wherever you are, so nobody has to start from there. The
     page saving an empty `found` when a hunt is picked (live-hunts.js) starts that clock without the player noticing; until it does,
     clue 0 goes in on progress.js's first catch-up, 9 s after it was found.
   A player using the page's "fast" or "travel" cheats has their clues taken on this clock, not theirs. */
const MS_PER_TILE = 500, WALK_CAP_MS = 24000;
const tileOf = c => c && typeof c === "object" && typeof c.level === "string" && c.art !== "none" && Number.isFinite(c.x) && Number.isFinite(c.y) ? c : null;
function clueWaitMs(clues, i) {
    if (!i) return MIN_CLUE_MS;
    const a = tileOf(clues[i - 1]), b = tileOf(clues[i]);
    const walk = a && b && a.level === b.level ? Math.max(0, Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) - 2) * MS_PER_TILE : 0;
    return Math.max(MIN_CLUE_MS, Math.min(WALK_CAP_MS, walk));
}

/* The update for what's been sent: each part can only move forwards. */
function mergeInto(doc, clean, map, now = Date.now()) {
    const was = view(doc), rawHunts = (doc && doc.hunts) || {};
    const next = {
        scraps: [...new Set([...was.scraps, ...clean.scraps])].slice(0, MAX_LIST),
        key: was.key,
        lost: was.lost,
        hunts: { ...rawHunts }          // as stored, with each clue's time in
    };
    /* "Brought back" is a running total: whichever device or day says more is right, so an old tab or a guest's browser signing in can't take it down (8 Nov 2026) */
    if (clean.lost && clean.lost.day >= was.lost.day) {
        next.lost = { day: clean.lost.day, streak: Math.max(clean.lost.streak, was.lost.streak), shelf: [...new Set([...was.lost.shelf, ...clean.lost.shelf])].slice(0, MAX_LIST) };
    } else if (clean.lost) {
        next.lost = { ...was.lost, shelf: [...new Set([...was.lost.shelf, ...clean.lost.shelf])].slice(0, MAX_LIST) };
    }
    /* Lost Property's own totals (8 Nov 2026): points, best find and misses only go up. They're the player's record, not the board: hallway-lost.js keeps that, on its own clock */
    if (clean.lost) for (const k of ["points", "best", "missed"]) next.lost[k] = Math.max(was.lost[k] || 0, clean.lost[k] || 0);
    /* (9 Nov scan, findings 4 and 6) One POST of every clue used to pass the in-order check, and the hunt finished at any save once
       (n-1) x MIN_CLUE_MS had gone by since c0: a scripted finish and a place in two requests. Now a save takes at most ONE new clue per
       hunt, and only once MIN_CLUE_MS has passed since the clue before it came in; the page sends its whole found list each time, and
       progress.js sends it again a little later when the server is behind (a guest's hunt merged at sign-in comes in clue by clue that
       way). Clues found before 8 Nov have no time in: they're given this save's, so the next clue is timed from now rather than never. */
    const defs = huntsOf(map);
    for (const [id, h] of Object.entries(clean.hunts)) {
        /* (10 Nov scan, server findings 2 and 18) with the map unreadable just now, nothing new is taken: it used to keep every clue sent, in
           any order, and the first save once the map was back finished the hunt with a place and the key */
        if (!defs) continue;
        const clues = defs.get(id);
        if (clues === undefined) continue;                   // not a hunt on the map
        const n = clues.length;
        if (!rawHunts[id] && Object.keys(next.hunts).length >= 100) continue;
        const old = rawHunts[id] || { found: [], done: false }, found = ids(old.found).filter(k => CLUE.test(k)), at = { ...(old.at || {}) };
        for (const k of found) if (typeof at[k] !== "number") at[k] = now;
        /* when the server first heard of this hunt from this player: clue 0's clock (a row from before 15 Nov starts it now) */
        const started = typeof old.started === "number" ? old.started : now;
        for (let i = 0; i < n; i++) {
            const k = "c" + i; if (found.includes(k)) continue; if (!h.found.includes(k)) break;
            const prev = i ? at["c" + (i - 1)] : started; if (typeof prev === "number" && now - prev < clueWaitMs(clues, i)) break;
            found.push(k); at[k] = now; break;                      // one a save
        }
        next.hunts[id] = { found: found.slice(0, MAX_LIST), done: old.done === true, at, started };
        if (old.place) next.hunts[id].place = old.place;
    }
    /* finished: every clue in (each was timed as it came, above). A row saved before the times, not in this save, gets its times now */
    for (const [id, h] of Object.entries(next.hunts)) {
        if (h.done) continue; const n = defs && defs.get(id) ? defs.get(id).length : 0; if (!n) continue;
        const raw = clean.hunts[id] ? h : rawHunts[id] || h, at = { ...(raw.at || {}) }, found = ids(raw.found);
        for (const k of found) if (CLUE.test(k) && typeof at[k] !== "number") at[k] = now;
        if (!Array.from({ length: n }, (_, i) => "c" + i).every(k => found.includes(k))) { if (!clean.hunts[id] && raw.at === undefined && found.length) next.hunts[id] = { ...raw, found, at }; continue; }
        next.hunts[id] = { ...raw, found, at, done: true };
    }
    next.key = was.key || Object.values(next.hunts).some(h => h.done);
    return next;
}

/* The next finishing place in a hunt: one atomic $inc on its counter (9 Nov scan, finding 5: counting the finished rows, then writing,
   gave two players finishing together the same place). A hunt's counter starts from the finishers already saved, the first time it's
   needed. A save that then fails leaves a gap in the places, never a shared one. */
async function nextPlace(db, col, id) {
    const places = db.collection(PLACES), key = "hunt:" + id;
    for (let tries = 0; tries < 3; tries++) {
        const r = await places.findOneAndUpdate({ _id: key }, { $inc: { n: 1 } }, { returnDocument: "after" });
        const doc = r && r.value !== undefined ? r.value : r;
        if (doc && Number.isInteger(doc.n)) return doc.n;
        const already = await col.countDocuments({ ["hunts." + id + ".done"]: true });
        try { await places.insertOne({ _id: key, n: already + 1 }); return already + 1; }
        catch (e) { if (!(e && e.code === 11000)) throw e; }      // another finisher made it first: take the next from it
    }
    throw new Error("hunt place counter unavailable");
}

async function handler(event) {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (event.httpMethod === "POST") {
        if (!sameOrigin(event)) return json(403, { error: "Not from this site" });
        if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    }
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("hallway-progress: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    /* As advent.js: a failed players read must not look like being signed out. */
    const player = playerFrom(event);
    if (!player) return json(401, { error: "Not signed in" });
    let row;
    try {
        row = await db.collection("players").findOne({ id: String(player.id) }, { projection: { _id: 0, sv: 1, svStrict: 1 } });
    } catch (e) {
        console.error("hallway-progress: could not read the players row", e);
        return json(503, { error: "Your progress couldn't be reached just now" });
    }
    if (sessionRevoked(player, row)) return json(401, { error: "Not signed in" });

    const col = db.collection(COLLECTION);
    if (event.httpMethod === "GET") {
        try {
            return json(200, view(await col.findOne({ playerId: player.id }, { projection: { _id: 0 } })));
        } catch (e) {
            console.error("hallway-progress: read failed", e);
            return json(500, { error: "Couldn't read your progress" });
        }
    }

    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });
    /* only while the Hallway is open, or for an admin walking it before then (10 Nov scan, server finding 7: _hallway-open.js) */
    const open = await require("./_hallway-open").hallwayOpen(db, event);
    if (open === null) return json(503, { error: "Couldn't save just now" });
    if (!open) return json(403, { error: "The Hallway isn't open yet" });
    const refusal = await writeRefusal(db, event, player.id);
    if (refusal) return refusal;

    const clean = cleanBody(body);
    try {
        await ensureUniqueIndex(col, ["playerId"]);
    } catch (e) {
        console.error("hallway-progress: unique index unavailable", e);
        return json(503, { error: "Couldn't save just now" });
    }
    /* Read, merge, write only if nobody else has written since: two tabs saving
       at once retry against each other instead of one losing its scrap. */
    try {
        const drawn = new Map();        // a place is drawn once per hunt per request, so a retry below doesn't take a second
        for (let tries = 0; tries < 4; tries++) {
            const doc = await col.findOne({ playerId: player.id }, { projection: { _id: 0 } });
            const next = mergeInto(doc, clean, await publishedMap());
            /* your place in a hunt is decided here, the moment it's first finished */
            for (const [id, h] of Object.entries(next.hunts)) { const was = doc && doc.hunts && doc.hunts[id]; if (h.done && !(was && was.done)) { if (!drawn.has(id)) drawn.set(id, await nextPlace(db, col, id)); next.hunts[id].place = drawn.get(id); } }
            const rev = (doc && doc.rev) || 0;
            const set = { ...next, rev: rev + 1, updatedAt: new Date().toISOString() };
            try {
                const r = await col.updateOne(doc ? { playerId: player.id, rev } : { playerId: player.id, rev: { $exists: false } }, { $set: set }, { upsert: !doc });
                if (r.matchedCount || r.upsertedCount) return json(200, view(next));
            } catch (e) {
                if (!(e && e.code === 11000)) throw e;
            }
        }
        return json(409, { error: "Too many saves at once" });
    } catch (e) {
        console.error("hallway-progress: save failed", e);
        return json(500, { error: "Couldn't save your progress" });
    }
}

exports.handler = handler;
exports._for = { cleanBody, mergeInto, view };

/* Failures reported to /warren's Errors tab, and the site-wide rate limit:
   see withErrorReporting in _errors.js. */
exports.handler = require("./_errors").withErrorReporting("hallway-progress", exports.handler);

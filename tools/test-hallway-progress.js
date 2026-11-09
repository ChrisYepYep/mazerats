/* The Hallway's progress store against a fake database: nothing here can reach the real one (local dev points at production Mongo, so this replaces _db, _player and _bans before the function loads).
   node tools/test-hallway-progress.js */
let siteState = "live";
const Module = require("module"), path = require("path"), assert = require("assert");
const docs = new Map(); let refuse = null, me = { id: "p1" }, indexed = 0, clock = Date.UTC(2026, 10, 8, 12), MAP = { levels: [{ id: "g", k: 0 }], hunts: [{ id: "keys", clues: [{}, {}, {}] }, { id: "quick", clues: [{}, {}] }] };
const realNow = Date.now; Date.now = () => clock;
const col = {
    async countDocuments(q) { const k = Object.keys(q)[0].split(".")[1]; let n = 0; for (const d of docs.values()) if (d.hunts && d.hunts[k] && d.hunts[k].done) n++; return n; },
    async findOne(q) { const d = docs.get(q.playerId); return d ? JSON.parse(JSON.stringify(d)) : null; },
    async updateOne(f, u, o) { const d = docs.get(f.playerId); const noRev = f.rev && f.rev.$exists === false; if (d && noRev) { const e = new Error("dup"); e.code = 11000; throw e; } if (d && d.rev !== f.rev) return { matchedCount: 0 }; if (!d && !(o && o.upsert)) return { matchedCount: 0 }; docs.set(f.playerId, { playerId: f.playerId, ...(d || {}), ...u.$set }); return d ? { matchedCount: 1 } : { upsertedCount: 1 }; }
};
/* the places counter (9 Nov scan, finding 5) */
const counters = new Map(), places = {
    async findOneAndUpdate(f, u) { const d = counters.get(f._id); if (!d) return null; d.n += u.$inc.n; return { ...d }; },
    async insertOne(d) { if (counters.has(d._id)) { const e = new Error("dup"); e.code = 11000; throw e; } counters.set(d._id, { ...d }); }
};
const fakes = {
    "./_db": { getDb: async () => ({ collection: n => n === "players" ? { findOne: async () => ({}) } : n === "settings" ? { findOne: async () => ({ hallwayState: siteState }) } : n === "hallway_hunt_places" ? places : col }), ensureUniqueIndex: async () => { indexed++; } },
    "./_player": { playerFrom: e => e.headers.me ? { id: e.headers.me } : me, sessionRevoked: () => false },
    "./_bans": { writeRefusal: async () => refuse },
    "./_hallway-map": { publishedMap: async () => MAP },
    "./_errors": { withErrorReporting: (n, f) => f },
    "./_headers": { SECURITY_HEADERS: {} }
};
const load0 = Module._load; Module._load = function (req, parent, ...r) { if (fakes[req] && parent && /hallway-progress/.test(parent.filename)) return fakes[req]; return load0.call(this, req, parent, ...r); };
const { handler } = require(path.join(__dirname, "..", "netlify", "functions", "hallway-progress.js"));
const call = async (method, body, headers = {}) => { const r = await handler({ httpMethod: method, headers: { host: "x.test", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
(async () => {
    let r = await call("GET"); assert.deepStrictEqual(r.body, { scraps: [], key: false, lost: { day: "", streak: 0, shelf: [], points: 0, best: 0, missed: 0 }, hunts: {} }, "starts empty");
    r = await call("POST", { scraps: ["a", "b"], key: true }); assert.equal(r.status, 200); assert.deepStrictEqual(r.body.scraps, ["a", "b"]); assert.equal(r.body.key, false, "the page can't just say it has the key");
    r = await call("POST", { scraps: ["b", "c"] }); assert.deepStrictEqual(r.body.scraps, ["a", "b", "c"], "scraps only add");
    r = await call("POST", { lost: { day: "2026-11-07", streak: 3, shelf: ["duck"] } }); assert.equal(r.body.lost.streak, 3);
    r = await call("POST", { lost: { day: "2026-11-05", streak: 1, shelf: ["coin"] } }); assert.equal(r.body.lost.day, "2026-11-07", "an older day can't win"); assert.equal(r.body.lost.streak, 3); assert.deepStrictEqual(r.body.lost.shelf, ["duck", "coin"], "but what it found still counts");
    /* hunts, checked against the map */
    r = await call("POST", { hunts: { keys: { found: ["c0", "c1", "c2"], done: true } } }); assert.deepStrictEqual(r.body.hunts.keys, { found: ["c0"], done: false }, "a whole hunt at once: one clue a save (9 Nov scan, finding 4)");
    clock += 3e3; r = await call("POST", { hunts: { keys: { found: ["c0", "c1", "c2"] } } }); assert.deepStrictEqual(r.body.hunts.keys.found, ["c0"], "and not sooner than MIN_CLUE_MS after the one before");
    r = await call("POST", { hunts: { nope: { found: ["c0"], done: true } } }); assert.ok(!("nope" in r.body.hunts), "only hunts on the map");
    me = { id: "p9" }; r = await call("POST", { hunts: { keys: { found: ["c1", "c2"], done: true } } }); assert.deepStrictEqual(r.body.hunts.keys.found, [], "clues only in order");
    r = await call("POST", { hunts: { keys: { found: ["c0"] } } }); clock += 9e3; r = await call("POST", { hunts: { keys: { found: ["c0", "c1"] } } }); clock += 9e3; r = await call("POST", { hunts: { keys: { found: ["c0", "c1", "c2", "c7"], done: true } } });
    assert.deepStrictEqual(r.body.hunts.keys, { found: ["c0", "c1", "c2"], done: true, place: 1 }, "played through: finished, first"); assert.equal(r.body.key, true, "the key comes with it");
    r = await call("POST", { hunts: { keys: { found: [], done: false } } }); assert.equal(r.body.hunts.keys.done, true, "a hunt can't be un-finished");
    me = { id: "p1" }; clock += 60e3; r = await call("POST", { scraps: ["later"] }); assert.deepStrictEqual(r.body.hunts.keys, { found: ["c0"], done: false }, "a save that doesn't send the hunt takes nothing for it");
    /* the page sending its list again, as progress.js does while the server's behind: a clue each time */
    r = await call("POST", { hunts: { keys: { found: ["c0", "c1", "c2"], done: true } } }); assert.deepStrictEqual(r.body.hunts.keys.found, ["c0", "c1"]);
    clock += 9e3; r = await call("POST", { hunts: { keys: { found: ["c0", "c1", "c2"], done: true } } }); assert.deepStrictEqual(r.body.hunts.keys, { found: ["c0", "c1", "c2"], done: true, place: 2 }, "caught up: finished, second"); assert.equal(r.body.key, true);
    /* two finishing at once can't share a place */
    for (const p of ["r1", "r2"]) { me = { id: p }; for (const f of [["c0"], ["c0", "c1"], ["c0", "c1"]]) { clock += 9e3; await call("POST", { hunts: { keys: { found: f } } }); } }
    clock += 9e3; const [ra, rb] = await Promise.all(["r1", "r2"].map(p => call("POST", { hunts: { keys: { found: ["c0", "c1", "c2"] } } }, { me: p })));
    assert.deepStrictEqual([ra.body.hunts.keys.place, rb.body.hunts.keys.place].sort(), [3, 4], "places from the counter: " + ra.body.hunts.keys.place + ", " + rb.body.hunts.keys.place);
    /* a row from before the times (finding 6): its clues get this save's time, and the next one is timed from there */
    docs.set("old", { playerId: "old", rev: 1, hunts: { keys: { found: ["c0", "c1"], done: false } } }); me = { id: "old" };
    r = await call("POST", { hunts: { keys: { found: ["c0", "c1", "c2"] } } }); assert.deepStrictEqual(r.body.hunts.keys.found, ["c0", "c1"], "timed from now, not taken at once"); assert.equal(typeof docs.get("old").hunts.keys.at.c1, "number");
    clock += 9e3; r = await call("POST", { hunts: { keys: { found: ["c0", "c1", "c2"] } } }); assert.equal(r.body.hunts.keys.done, true, "and it can finish (it never could)");
    docs.set("old2", { playerId: "old2", rev: 1, hunts: { keys: { found: ["c0", "c1", "c2"], done: false } } }); me = { id: "old2" }; r = await call("POST", { scraps: ["x"] }); assert.equal(r.body.hunts.keys.done, true, "an old complete row finishes at its next save");
    me = { id: "p1" };
    r = await call("POST", { scraps: ["b"], key: false }); assert.equal(r.body.key, true, "the key can't be lost");
    MAP = null; r = await call("POST", { hunts: { quick: { found: ["c0", "c1"], done: true } } }); assert.equal(r.body.hunts.quick, undefined, "no map to read just now: nothing new is taken (10 Nov scan, server finding 2)"); MAP = { levels: [{ id: "g", k: 0 }], hunts: [{ id: "keys", clues: [{}, {}, {}] }, { id: "quick", clues: [{}, {}] }] };
    clock += 30e3; r = await call("POST", {}); assert.equal(r.body.hunts.quick, undefined, "and nothing finishes when it's back"); r = await call("POST", { hunts: { quick: { found: ["c0", "c1"] } } }); assert.deepStrictEqual(r.body.hunts.quick.found, ["c0"], "once it is, one clue a save as ever");
    r = await call("POST", { scraps: ["<script>", 5, "ok"], hunts: { "a.b": { found: [] }, $set: { found: [] } }, lost: { day: "nonsense", streak: 2 } }); assert.ok(r.body.scraps.includes("ok")); assert.ok(!r.body.scraps.includes("<script>"), "bad ids dropped"); assert.ok(!("a.b" in r.body.hunts) && !("$set" in r.body.hunts), "bad hunt ids dropped"); assert.equal(r.body.lost.day, "2026-11-07");
    r = await call("POST", {}, { origin: "https://evil.test" }); assert.equal(r.status, 403, "other sites refused");
    refuse = { statusCode: 403, body: JSON.stringify({ error: "banned" }) }; r = await call("POST", { scraps: ["z"] }); assert.equal(r.status, 403, "bans stop writes"); r = await call("GET"); assert.equal(r.status, 200, "bans don't stop reads"); assert.ok(!r.body.scraps.includes("z")); refuse = null;
    me = null; r = await call("GET"); assert.equal(r.status, 401, "signed out"); me = { id: "p2" };
    r = await handler({ httpMethod: "POST", headers: {}, body: "x".repeat(20000) }); assert.equal(r.statusCode, 413);
    /* two tabs at once: neither loses its scrap */
    const [a, b] = await Promise.all([call("POST", { scraps: ["left"] }), call("POST", { scraps: ["right"] })]); r = await call("GET"); assert.ok(r.body.scraps.includes("left") && r.body.scraps.includes("right"), "racing saves both land");
    r = await call("POST", { lost: { day: "2026-11-08", streak: 4, shelf: [], points: 900, best: 600, missed: 1 } }); r = await call("POST", { lost: { day: "2026-11-08", streak: 4, shelf: [], points: 300, best: 100, missed: 0 } }); assert.equal(r.body.lost.points, 900, "points never go down"); assert.equal(r.body.lost.best, 600); assert.equal(r.body.lost.missed, 1);
    r = await call("POST", { lost: { day: "2026-11-09", streak: 2, shelf: [] } }); assert.equal(r.body.lost.streak, 4, "brought back never goes down");
    r = await call("POST", { lost: { day: "2099-01-01", streak: 9, shelf: [] } }); assert.notEqual(r.body.lost.day, "2099-01-01", "a date in the future is refused");
    /* (10 Nov scan, server finding 7) closed: no writes */
    { siteState = "coming-soon"; require("../netlify/functions/_hallway-open")._reset(); const r2 = await call("POST", { scraps: ["zz"] }); assert.equal(r2.status, 403, "closed: refused"); siteState = "live"; require("../netlify/functions/_hallway-open")._reset(); }
    Date.now = realNow; console.log("hallway-progress: all good", "(index ensured " + indexed + " times)");
})().catch(e => { console.error(e); process.exit(1); });

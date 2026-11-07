/* The Hallway's progress store against a fake database: nothing here can reach the real one (local dev points at production Mongo, so this replaces _db, _player and _bans before the function loads).
   node tools/test-hallway-progress.js */
const Module = require("module"), path = require("path"), assert = require("assert");
const docs = new Map(); let refuse = null, me = { id: "p1" }, indexed = 0;
const col = {
    async countDocuments(q) { const k = Object.keys(q)[0].split(".")[1]; let n = 0; for (const d of docs.values()) if (d.hunts && d.hunts[k] && d.hunts[k].done) n++; return n; },
    async findOne(q) { const d = docs.get(q.playerId); return d ? JSON.parse(JSON.stringify(d)) : null; },
    async updateOne(f, u, o) { const d = docs.get(f.playerId); const noRev = f.rev && f.rev.$exists === false; if (d && noRev) { const e = new Error("dup"); e.code = 11000; throw e; } if (d && d.rev !== f.rev) return { matchedCount: 0 }; if (!d && !(o && o.upsert)) return { matchedCount: 0 }; docs.set(f.playerId, { playerId: f.playerId, ...(d || {}), ...u.$set }); return d ? { matchedCount: 1 } : { upsertedCount: 1 }; }
};
const fakes = {
    "./_db": { getDb: async () => ({ collection: n => n === "players" ? { findOne: async () => ({}) } : col }), ensureUniqueIndex: async () => { indexed++; } },
    "./_player": { playerFrom: () => me, sessionRevoked: () => false },
    "./_bans": { writeRefusal: async () => refuse },
    "./_errors": { withErrorReporting: (n, f) => f },
    "./_headers": { SECURITY_HEADERS: {} }
};
const load0 = Module._load; Module._load = function (req, parent, ...r) { if (fakes[req] && parent && /hallway-progress/.test(parent.filename)) return fakes[req]; return load0.call(this, req, parent, ...r); };
const { handler } = require(path.join(__dirname, "..", "netlify", "functions", "hallway-progress.js"));
const call = async (method, body, headers = {}) => { const r = await handler({ httpMethod: method, headers: { host: "x.test", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
(async () => {
    let r = await call("GET"); assert.deepStrictEqual(r.body, { scraps: [], key: false, lost: { day: "", streak: 0, shelf: [] }, hunts: {} }, "starts empty");
    r = await call("POST", { scraps: ["a", "b"], key: true }); assert.equal(r.status, 200); assert.deepStrictEqual(r.body.scraps, ["a", "b"]); assert.equal(r.body.key, true);
    r = await call("POST", { scraps: ["b", "c"], key: false }); assert.deepStrictEqual(r.body.scraps, ["a", "b", "c"], "scraps only add"); assert.equal(r.body.key, true, "the key can't be lost");
    r = await call("POST", { lost: { day: "2026-11-07", streak: 3, shelf: ["duck"] } }); assert.equal(r.body.lost.streak, 3);
    r = await call("POST", { lost: { day: "2026-11-05", streak: 1, shelf: ["coin"] } }); assert.equal(r.body.lost.day, "2026-11-07", "an older day can't win"); assert.equal(r.body.lost.streak, 3); assert.deepStrictEqual(r.body.lost.shelf, ["duck", "coin"], "but what it found still counts");
    r = await call("POST", { hunts: { keys: { found: ["c1"], done: true } } }); r = await call("POST", { hunts: { keys: { found: ["c2"], done: false } } }); assert.deepStrictEqual(r.body.hunts.keys, { found: ["c1", "c2"], done: true, place: 1 }, "a hunt can't be un-finished");
    r = await call("POST", { scraps: ["<script>", 5, "ok"], hunts: { "a.b": { found: [] }, $set: { found: [] } }, lost: { day: "nonsense", streak: 2 } }); assert.ok(r.body.scraps.includes("ok")); assert.ok(!r.body.scraps.includes("<script>"), "bad ids dropped"); assert.ok(!("a.b" in r.body.hunts) && !("$set" in r.body.hunts), "bad hunt ids dropped"); assert.equal(r.body.lost.day, "2026-11-07");
    r = await call("POST", {}, { origin: "https://evil.test" }); assert.equal(r.status, 403, "other sites refused");
    refuse = { statusCode: 403, body: JSON.stringify({ error: "banned" }) }; r = await call("POST", { scraps: ["z"] }); assert.equal(r.status, 403, "bans stop writes"); r = await call("GET"); assert.equal(r.status, 200, "bans don't stop reads"); assert.ok(!r.body.scraps.includes("z")); refuse = null;
    me = null; r = await call("GET"); assert.equal(r.status, 401, "signed out"); me = { id: "p2" };
    r = await handler({ httpMethod: "POST", headers: {}, body: "x".repeat(20000) }); assert.equal(r.statusCode, 413);
    /* two tabs at once: neither loses its scrap */
    const [a, b] = await Promise.all([call("POST", { scraps: ["left"] }), call("POST", { scraps: ["right"] })]); r = await call("GET"); assert.ok(r.body.scraps.includes("left") && r.body.scraps.includes("right"), "racing saves both land");
    console.log("hallway-progress: all good", "(index ensured " + indexed + " times)");
})().catch(e => { console.error(e); process.exit(1); });

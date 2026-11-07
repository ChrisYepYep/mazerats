/* Lost Property's clock and board against a fake database: nothing here can reach the real one (local dev points at production Mongo, so this replaces _db, _player and _bans before the function loads).
   node tools/test-hallway-lost.js */
const Module = require("module"), path = require("path"), assert = require("assert");
const store = { hallway_lost: [], hallway_lost_open: [] }, players = { p1: { nick: "Ratty" }, p2: { nick: "Zed" }, p3: { nick: "" } };
let me = { id: "p1" }, refuse = null, clock = Date.UTC(2026, 10, 9, 12, 0, 0), banned = new Set();
const matches = (d, q) => Object.entries(q).every(([k, v]) => v && typeof v === "object" && "$gt" in v ? d[k] > v.$gt : d[k] === v);
const coll = name => ({
    find(q) { let rows = store[name].filter(d => matches(d, q)); const api = { sort(s) { const [[k, dir]] = Object.entries(s); rows = rows.sort((a, b) => (a[k] - b[k]) * dir); return api; }, limit(n) { rows = rows.slice(0, n); return api; }, toArray: async () => JSON.parse(JSON.stringify(rows)) }; return api; },
    async findOne(q) { const d = store[name].find(d => matches(d, q)); return d ? JSON.parse(JSON.stringify(d)) : null; },
    async countDocuments(q) { return store[name].filter(d => matches(d, q)).length; },
    async findOneAndDelete(q) { const i = store[name].findIndex(d => matches(d, q)); if (i < 0) return null; const [d] = store[name].splice(i, 1); return d; },
    async updateOne(f, u, o = {}) { let d = store[name].find(x => matches(x, f)); if (!d) { if (!o.upsert) return { matchedCount: 0 }; d = { ...f }; store[name].push(d); } for (const [k, v] of Object.entries(u.$set || {})) d[k] = v; for (const [k, v] of Object.entries(u.$inc || {})) d[k] = (d[k] || 0) + v; for (const [k, v] of Object.entries(u.$max || {})) d[k] = Math.max(d[k] || 0, v); return { matchedCount: 1 }; },
    collectionName: name
});
const fakes = {
    "./_db": { getDb: async () => ({ collection: n => n === "players" ? { findOne: async q => players[q.id] || null } : coll(n) }), ensureUniqueIndex: async () => {} },
    "./_player": { playerFrom: () => me, sessionRevoked: () => false },
    "./_bans": { writeRefusal: async () => refuse, withoutBanned: async (db, lists) => lists.map(l => l.filter(r => !banned.has(r.id) && players[r.id] && players[r.id].nick)) },
    "./_publicid": { publicLists: async (db, lists) => lists.map(l => l.map(r => ({ ...r, id: "pub-" + r.id, avatar: null }))) },
    "./_errors": { withErrorReporting: (n, f) => f },
    "./_headers": { SECURITY_HEADERS: {} }
};
const load0 = Module._load; Module._load = function (req, parent, ...r) { if (fakes[req] && parent && /hallway-lost/.test(parent.filename)) return fakes[req]; return load0.call(this, req, parent, ...r); };
const realNow = Date.now; Date.now = () => clock;
const fn = require(path.join(__dirname, "..", "netlify", "functions", "hallway-lost.js")), { pointsFor } = fn._for;
const call = async (method, body, headers = {}) => { const r = await fn.handler({ httpMethod: method, headers: { host: "x.test", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
(async () => {
    assert.equal(pointsFor(0, 0), pointsFor(20, 0), "nothing counts as quicker than MIN_SECS"); assert.equal(pointsFor(0, 0), 1430);
    assert.equal(pointsFor(20, 0), Math.round((100 + 900 * (1 - 20 / 900)) / 10) * 10 + 450);
    assert.equal(pointsFor(900, 3), 100, "at the limit with every clue: just the finding");
    assert.equal(pointsFor(2000, 0), 0, "too late: nothing");
    let r = await call("GET"); assert.equal(r.status, 200); assert.deepStrictEqual(r.body.rows, []); assert.equal(r.body.week, "2026-11-09", "weeks start on Monday");
    r = await call("POST", { act: "found", k: "duck" }); assert.equal(r.status, 409, "nothing found without a search open");
    r = await call("POST", { act: "start", k: "duck" }); assert.equal(r.status, 200); assert.equal(r.body.limit, 900);
    clock += 300e3; await call("POST", { act: "hint" }); clock += 60e3;
    r = await call("POST", { act: "found", k: "duck" }); assert.equal(r.status, 200); assert.equal(r.body.secs, 360); assert.equal(r.body.points, pointsFor(360, 1));
    const first = r.body.points;
    r = await call("POST", { act: "found", k: "duck" }); assert.equal(r.status, 409, "a find pays once");
    r = await call("POST", { act: "start", k: "lamp" }); r = await call("POST", { act: "found", k: "coin" }); assert.equal(r.status, 409, "only the thing you were sent for");
    clock += 1000e3; r = await call("POST", { act: "found", k: "lamp" }); assert.equal(r.body.late, true); assert.equal(r.body.points, 0, "past the limit pays nothing");
    me = { id: "p2" }; await call("POST", { act: "start", k: "rose" }); clock += 25e3; r = await call("POST", { act: "found", k: "rose" }); const second = r.body.points;
    r = await call("GET"); assert.deepStrictEqual(r.body.rows.map(x => [x.name, x.points, x.rank]), [[second > first ? "Zed" : "Ratty", Math.max(first, second), 1], [second > first ? "Ratty" : "Zed", Math.min(first, second), 2]]); assert.ok(r.body.rows.every(x => /^pub-/.test(x.id)), "public ids only"); assert.equal(r.body.me.rank, second > first ? 1 : 2);
    banned.add("p2"); r = await call("GET"); assert.equal(r.body.rows.length, 1, "banned players off the board"); banned.clear();
    /* the day's cap */
    me = { id: "p1" }; let capped = false; for (let i = 0; i < 25; i++) { await call("POST", { act: "start", k: "t" + i }); clock += 30e3; r = await call("POST", { act: "found", k: "t" + i }); if (r.body.capped) capped = true; }
    assert.ok(capped, "past the day's cap a find doesn't go on the board"); assert.equal(store.hallway_lost.find(d => d.playerId === "p1").dayFinds, 20);
    refuse = { statusCode: 403, body: JSON.stringify({ error: "nickname" }) }; r = await call("POST", { act: "start", k: "x" }); assert.equal(r.status, 403, "no nickname, no board"); refuse = null;
    r = await call("POST", { act: "start", k: "<b>" }); assert.equal(r.status, 400, "bad ids refused");
    r = await call("POST", { act: "start", k: "x" }, { origin: "https://evil.test" }); assert.equal(r.status, 403, "other sites refused");
    me = null; r = await call("POST", { act: "start", k: "x" }); assert.equal(r.status, 401); r = await call("GET"); assert.equal(r.status, 200, "anyone can read the board"); assert.equal(r.body.me, null);
    Date.now = realNow; console.log("hallway-lost: all good");
})().catch(e => { console.error(e); process.exit(1); });

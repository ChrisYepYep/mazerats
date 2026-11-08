/* Lost Property's server against a fake database and a fake map: nothing here can reach the real ones (local dev points at production Mongo, so this
   replaces _db, _player, _bans and _blobs before the function loads).
   node tools/test-hallway-lost.js */
const Module = require("module"), path = require("path"), assert = require("assert");
process.env.SESSION_SECRET = "test-secret-only";
const store = { hallway_lost: [], hallway_lost_open: [], hallway_lost_seen: [], hallway_lost_visitors: [], hallway_lost_caps: [] }, players = { p1: { nick: "Ratty" }, p2: { nick: "Zed" }, p3: { nick: "" } };
let me = { id: "p1" }, refuse = null, clock = Date.UTC(2026, 10, 9, 12, 0, 0), banned = new Set(), net = "netA";
const MAP = { levels: [{ id: "g", name: "Ground", k: 0 }, { id: "f1", name: "Floor 1", k: 1 }, { id: "b", name: "Basement", k: -1 }], lostSpots: [{ level: "g", x: 5, y: 6, skip: [] }, { level: "f1", x: 9, y: 2, skip: [] }, { level: "b", x: 1, y: 1 }] };
const matches = (d, q) => Object.entries(q).every(([k, v]) => v && typeof v === "object" && "$gt" in v ? d[k] > v.$gt : d[k] === v);
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const upd = (d, u) => { for (const [k, v] of Object.entries(u.$set || {})) d[k] = v; for (const [k, v] of Object.entries(u.$inc || {})) d[k] = (d[k] || 0) + v; for (const [k, v] of Object.entries(u.$max || {})) d[k] = Math.max(d[k] || 0, v); for (const [k, v] of Object.entries(u.$addToSet || {})) { d[k] = d[k] || []; if (!d[k].includes(v)) d[k].push(v); } };
const coll = name => ({
    find(q) { let rows = store[name].filter(d => matches(d, q)); const api = { sort(s) { const [[k, dir]] = Object.entries(s); rows = rows.sort((a, b) => (a[k] - b[k]) * dir); return api; }, limit(n) { rows = rows.slice(0, n); return api; }, toArray: async () => clone(rows) }; return api; },
    async findOne(q) { return clone(store[name].find(d => matches(d, q))); },
    async countDocuments(q) { return store[name].filter(d => matches(d, q)).length; },
    async findOneAndDelete(q) { const i = store[name].findIndex(d => matches(d, q)); if (i < 0) return null; const [d] = store[name].splice(i, 1); return d; },
    async findOneAndUpdate(f, u, o = {}) { let d = store[name].find(x => matches(x, f)); if (!d) { if (!o.upsert) return null; d = { ...f }; for (const [k, v] of Object.entries(u.$setOnInsert || {})) d[k] = v; store[name].push(d); } upd(d, u); return clone(d); },
    async updateOne(f, u, o = {}) { let d = store[name].find(x => matches(x, f)); if (!d) { if (!o.upsert) return { matchedCount: 0 }; d = { ...f }; store[name].push(d); } upd(d, u); return { matchedCount: 1 }; },
    async insertOne(d) { if (name === "hallway_lost_visitors" && store[name].some(x => x.n === d.n)) { const e = new Error("dup"); e.code = 11000; throw e; } store[name].push(clone(d)); },
    async deleteOne(q) { const i = store[name].findIndex(d => matches(d, q)); if (i >= 0) store[name].splice(i, 1); },
    async createIndex() {}, collectionName: name
});
const fakes = {
    "./_db": { getDb: async () => ({ collection: n => n === "players" ? { findOne: async q => players[q.id] || null } : coll(n) }), ensureUniqueIndex: async () => {} },
    "./_player": { playerFrom: () => me, sessionRevoked: () => false },
    "./_bans": { writeRefusal: async () => refuse, netHashFor: () => net, withoutBanned: async (db, lists) => lists.map(l => l.filter(r => !banned.has(r.id) && players[r.id] && players[r.id].nick)) },
    "./_publicid": { publicLists: async (db, lists) => lists.map(l => l.map(r => ({ ...r, id: "pub-" + r.id, avatar: null }))) },
    "./_hallway-map": { publishedMap: async () => MAP, _reset: () => {} },
    "./_blobs": { blobStore: () => ({ get: async (k, o) => k === "manifest" ? { mapVersion: "v1" } : k === "map/v1" ? JSON.stringify(MAP) : null }) },
    "./_errors": { withErrorReporting: (n, f) => f },
    "./_headers": { SECURITY_HEADERS: {} }
};
const load0 = Module._load; Module._load = function (req, parent, ...r) { if (fakes[req] && parent && /hallway-lost\.js$/.test(parent.filename)) return fakes[req]; return load0.call(this, req, parent, ...r); };
const realNow = Date.now; Date.now = () => clock;
const fn = require(path.join(__dirname, "..", "netlify", "functions", "hallway-lost.js")), { pointsFor, spotsOf, THINGS } = fn._for;
const call = async (method, body, headers = {}, qs) => { const r = await fn.handler({ httpMethod: method, headers: { host: "x.test", ...headers }, queryStringParameters: qs || {}, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
const findIt = async (o, extra = {}) => call("POST", { act: "found", k: o.k, at: { level: o.spot.level, x: o.spot.x, y: o.spot.y }, ...extra });
(async () => {
    assert.equal(pointsFor(0, 0), pointsFor(20, 0), "nothing counts as quicker than MIN_SECS"); assert.equal(pointsFor(0, 0), 1430);
    assert.equal(pointsFor(900, 3), 100, "at the limit with every clue: just the finding");
    assert.equal(pointsFor(2000, 0), 0, "too late: nothing");
    assert.equal(spotsOf(MAP).length, 2, "Basement spots never count"); assert.equal(spotsOf({ levels: [{ id: "g", name: "Ground", k: 0 }] }).length > 0, true, "the first spots, by floor name, still work");
    let r = await call("GET"); assert.equal(r.status, 200); assert.deepStrictEqual(r.body.rows, []); assert.equal(r.body.week, "2026-11-09", "weeks start on Monday");
    r = await call("POST", { act: "found", k: "duck", at: { level: "g", x: 5, y: 6 } }); assert.equal(r.status, 409, "nothing found without a search open");
    /* the server picks */
    r = await call("POST", { act: "start" }); assert.equal(r.status, 200); const o1 = r.body; assert.ok(THINGS.some(t => t.k === o1.k), "a real thing"); assert.ok(["g", "f1"].includes(o1.spot.level), "at a real spot"); assert.equal(o1.left, 900e3); assert.equal(o1.v, undefined, "a nicknamed player needs no visitor token");
    r = await call("POST", { act: "found", k: o1.k, at: { level: o1.spot.level, x: o1.spot.x + 1, y: o1.spot.y } }); assert.equal(r.status, 409, "not where it was put");
    clock += 300e3; r = await call("POST", { act: "hint" }); assert.equal(r.body.hints, 1); clock += 60e3;
    r = await findIt(o1); assert.equal(r.status, 200); assert.equal(r.body.secs, 360); assert.equal(r.body.points, pointsFor(360, 1), "clues counted here");
    const first = r.body.points;
    r = await findIt(o1); assert.equal(r.status, 409, "a find pays once");
    /* no repeats until everything's been found */
    const got = new Set([o1.k]); for (let i = 0; i < THINGS.length - 1; i++) { r = await call("POST", { act: "start" }); assert.ok(!got.has(r.body.k), "nothing found twice while there's something new: " + r.body.k); got.add(r.body.k); clock += 30e3; await findIt(r.body); }
    assert.equal(got.size, THINGS.length); r = await call("POST", { act: "start" }); assert.equal(r.status, 200, "then anything again");
    /* swap: something else, the clock again */
    const before = r.body; clock += 100e3; r = await call("POST", { act: "swap" }); assert.notEqual(r.body.k, before.k, "a different one"); const sw = r.body; r = await findIt(before); assert.equal(r.status, 409, "the old one's gone");
    clock += 25e3; r = await findIt(sw); assert.equal(r.body.secs, 25, "the clock started again on a swap");
    /* cancel: leaving ends it, no points */
    r = await call("POST", { act: "start" }); const c = r.body; await call("POST", { act: "cancel" }); r = await findIt(c); assert.equal(r.status, 409, "cancelled");
    /* too late */
    r = await call("POST", { act: "start" }); const late = r.body; clock += 1000e3; r = await findIt(late); assert.equal(r.body.late, true); assert.equal(r.body.points, 0, "past the limit pays nothing");
    /* skip: a thing never goes where it doesn't suit */
    MAP.lostSpots[0].skip = THINGS.map(t => t.k); fn._for.resetSpots(); for (let i = 0; i < 8; i++) { r = await call("POST", { act: "start" }); assert.equal(r.body.spot.level, "f1", "skipped everywhere on Ground"); } MAP.lostSpots[0].skip = []; fn._for.resetSpots();
    /* Visitors */
    me = null; r = await call("POST", { act: "hint" }); assert.equal(r.status, 409, "a visitor with no token has nothing open");
    r = await call("POST", { act: "start" }); assert.equal(r.status, 200); const v1 = r.body.v; assert.ok(v1, "a visitor gets a token"); assert.match(r.body.name, /^Visitor \d{3}$/);
    const vn = r.body.name; clock += 40e3; r = await call("POST", { act: "found", k: r.body.k, at: r.body.spot, v: v1 }); assert.ok(r.body.points > 0);
    r = await call("POST", { act: "start", v: v1 }); assert.equal(r.body.v, undefined, "a visitor keeps their token"); assert.equal(r.body.name, vn);
    r = await call("POST", { act: "start", v: v1.slice(0, -2) + "xx" }); assert.ok(r.body.v && r.body.name !== vn, "a forged token is a new visitor");
    const nums = store.hallway_lost_visitors.map(x => x.n); assert.ok(nums.every(n => n >= 1 && n < 1000), "three digits");
    /* random numbers, not counting up: a run of new visitors */
    net = null; const many = []; for (let i = 0; i < 30; i++) { r = await call("POST", { act: "start" }); many.push(+r.body.name.slice(8)); } assert.equal(new Set(many).size, many.length, "each number once"); assert.ok(many.some((n, i) => i && n < many[i - 1]), "not in order");
    net = "netB"; for (let i = 0; i < 10; i++) await call("POST", { act: "start" }); r = await call("POST", { act: "start" }); assert.equal(r.status, 429, "new visitors capped per network per hour");
    /* the board: players and visitors, banned players off, visitor's own row */
    me = { id: "p2" }; r = await call("POST", { act: "start" }); clock += 25e3; await findIt(r.body);
    me = null; r = await call("GET", undefined, {}, { v: v1 }); assert.ok(r.body.rows.some(x => x.name === vn && x.visitor && x.id === null), "visitors on the board, with no id"); assert.equal(r.body.me.name, vn, "a visitor's own row");
    assert.ok(r.body.rows.filter(x => !x.visitor).every(x => /^pub-/.test(x.id)), "public ids only");
    banned.add("p2"); r = await call("GET"); assert.ok(!r.body.rows.some(x => x.name === "Zed"), "banned players off the board"); banned.clear();
    /* a signed-in player with no nickname plays as a Visitor */
    me = { id: "p3" }; net = "netC"; r = await call("POST", { act: "start" }); assert.match(r.body.name, /^Visitor/); assert.ok(r.body.v);
    /* the day's cap */
    me = { id: "p1" }; clock += 864e5; let capped = false; for (let i = 0; i < 25; i++) { r = await call("POST", { act: "start" }); clock += 30e3; r = await findIt(r.body); if (r.body.capped) capped = true; }
    assert.ok(capped, "past the day's cap a find doesn't go on the board");
    refuse = { statusCode: 403, body: JSON.stringify({ error: "banned" }) }; r = await call("POST", { act: "start" }); assert.equal(r.status, 403, "banned refused"); refuse = null;
    r = await call("POST", { act: "found", k: "<b>", at: { level: "g", x: 1, y: 1 } }); assert.equal(r.status, 400, "bad ids refused");
    r = await call("POST", { act: "start" }, { origin: "https://evil.test" }); assert.equal(r.status, 403, "other sites refused");
    r = await call("POST", { act: "nonsense" }); assert.equal(r.status, 400);
    Date.now = realNow; console.log("hallway-lost: all good (" + THINGS.length + " things, first find " + first + ")");
})().catch(e => { console.error(e); process.exit(1); });

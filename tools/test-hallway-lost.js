/* Lost Property's server against a fake database and a fake map: nothing here can reach the real ones (local dev points at production Mongo, so this
   replaces _db, _player, _bans and _blobs before the function loads).
   node tools/test-hallway-lost.js */
const Module = require("module"), path = require("path"), assert = require("assert");
process.env.SESSION_SECRET = "test-secret-only";
const store = { settings: [{ _id: "site", hallwayState: "live" }], hallway_lost: [], hallway_lost_open: [], hallway_lost_seen: [], hallway_lost_visitors: [], hallway_lost_caps: [] }, players = { p1: { nick: "Ratty" }, p2: { nick: "Zed" }, p3: { nick: "" } };
let me = { id: "p1" }, refuse = null, clock = Date.UTC(2026, 10, 9, 12, 0, 0), banned = new Set(), net = "netA";
/* floor everywhere from 0,0 to 19,19 (cells are 2x2); on Ground a table at 12,12..12,13 with a chair on every side and a wall of floor's end above it,
   as G 96,-8 was (9 Nov scan): its spot can never be dealt */
const CELLS = []; for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) CELLS.push(x + "," + y);
const BOXED = [{ k: "table", x: 12, y: 12, len: 2, rot: 1 }, { k: "chair", x: 11, y: 12 }, { k: "chair", x: 11, y: 13 }, { k: "chair", x: 13, y: 12 }, { k: "chair", x: 13, y: 13 }, { k: "chair", x: 11, y: 11 }, { k: "chair", x: 12, y: 11 }, { k: "chair", x: 13, y: 11 }];
const MAP = { levels: [{ id: "g", name: "Ground", k: 0, cells: CELLS, props: [{ k: "chair", x: 5, y: 6 }, ...BOXED] }, { id: "f1", name: "Floor 1", k: 1, cells: CELLS }, { id: "b", name: "Basement", k: -1, cells: CELLS }], lostSpots: [{ level: "g", x: 5, y: 6, skip: [] }, { level: "f1", x: 9, y: 2, skip: [] }, { level: "b", x: 1, y: 1 }, { level: "g", x: 12, y: 12, skip: [] }] };
const matches = (d, q) => Object.entries(q).every(([k, v]) => v && typeof v === "object" && "$gt" in v ? d[k] > v.$gt : v && typeof v === "object" && "$in" in v ? v.$in.includes(d[k] === undefined ? null : d[k]) : d[k] === v);
let inserts = 0;
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const upd = (d, u) => { for (const [k, v] of Object.entries(u.$set || {})) d[k] = v; for (const [k, v] of Object.entries(u.$inc || {})) d[k] = (d[k] || 0) + v; for (const [k, v] of Object.entries(u.$max || {})) d[k] = Math.max(d[k] || 0, v); for (const [k, v] of Object.entries(u.$addToSet || {})) { d[k] = d[k] || []; if (!d[k].includes(v)) d[k].push(v); } };
const coll = name => ({
    find(q) { let rows = store[name].filter(d => matches(d, q)); const api = { sort(s) { const [[k, dir]] = Object.entries(s); rows = rows.sort((a, b) => (a[k] - b[k]) * dir); return api; }, limit(n) { rows = rows.slice(0, n); return api; }, toArray: async () => clone(rows) }; return api; },
    async findOne(q) { return clone(store[name].find(d => matches(d, q))); },
    async countDocuments(q) { return store[name].filter(d => matches(d, q)).length; },
    async findOneAndDelete(q) { const i = store[name].findIndex(d => matches(d, q)); if (i < 0) return null; const [d] = store[name].splice(i, 1); return d; },
    async findOneAndUpdate(f, u, o = {}) { let d = store[name].find(x => matches(x, f)); if (!d) { if (!o.upsert) return null; d = { ...f }; for (const [k, v] of Object.entries(u.$setOnInsert || {})) d[k] = v; store[name].push(d); } upd(d, u); return clone(d); },
    async updateOne(f, u, o = {}) { let d = store[name].find(x => matches(x, f)); if (!d) { if (!o.upsert) return { matchedCount: 0 }; d = { ...f }; store[name].push(d); } upd(d, u); return { matchedCount: 1 }; },
    async insertOne(d) { inserts++; if (name === "hallway_lost_visitors" && store[name].some(x => x.n === d.n)) { const e = new Error("dup"); e.code = 11000; throw e; } store[name].push(clone(d)); },
    async deleteOne(q) { const i = store[name].findIndex(d => matches(d, q)); if (i >= 0) store[name].splice(i, 1); },
    async createIndex() {}, collectionName: name
});
const fakes = {
    "./_db": { getDb: async () => ({ collection: n => n === "players" ? { findOne: async q => players[q.id] || null, find: q => ({ toArray: async () => Object.entries(players).filter(([id]) => !q.id || !q.id.$in || q.id.$in.includes(id)).map(([id, p]) => ({ id, ...p })) }) } : coll(n) }), ensureUniqueIndex: async () => {} },
    "./_player": { playerFrom: () => me, sessionRevoked: () => false },
    "./_bans": { writeRefusal: async () => refuse, netHashFor: () => net, withoutBanned: async (db, lists) => lists.map(l => l.filter(r => !banned.has(r.id) && players[r.id] && players[r.id].nick)) },
    "./_publicid": { publicLists: async (db, lists) => lists.map(l => l.map(r => ({ ...r, id: "pub-" + r.id, avatar: null }))) },
    "./_hallway-map": { ...require(path.join(__dirname, "..", "netlify", "functions", "_hallway-map.js")), publishedMap: async () => MAP, _reset: () => {} },
    "./_blobs": { blobStore: () => ({ get: async (k, o) => k === "manifest" ? { mapVersion: "v1" } : k === "map/v1" ? JSON.stringify(MAP) : null }) },
    "./_errors": { withErrorReporting: (n, f) => f },
    "./_headers": { SECURITY_HEADERS: {} }
};
const load0 = Module._load; Module._load = function (req, parent, ...r) { if (fakes[req] && parent && /hallway-lost\.js$/.test(parent.filename)) return fakes[req]; return load0.call(this, req, parent, ...r); };
const realNow = Date.now; Date.now = () => clock;
const fn = require(path.join(__dirname, "..", "netlify", "functions", "hallway-lost.js")), { pointsFor, spotsOf, THINGS, visitorName } = fn._for;
const call = async (method, body, headers = {}, qs) => { const r = await fn.handler({ httpMethod: method, headers: { host: "x.test", ...headers }, queryStringParameters: qs || {}, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
/* the desk is shut for a search's first two minutes (15 Nov 2026): a find waits for it, as a player coming back would */
const findIt = async (o, extra = {}) => { const open = (store.hallway_lost_open || []).find(r => r.k === o.k && r.t0 && (!me || r.playerId === me.id)); if (open && clock < open.t0 + 120e3) clock = open.t0 + 120e3; return call("POST", { act: "found", k: o.k, at: { level: o.spot.level, x: o.spot.x, y: o.spot.y }, ...extra }); };
(async () => {
    assert.equal(pointsFor(0, 0), pointsFor(20, 0), "nothing counts as quicker than MIN_SECS"); assert.equal(pointsFor(0, 0), 1430);
    assert.equal(pointsFor(900, 3), 100, "at the limit with every clue: just the finding");
    assert.equal(pointsFor(2000, 0), 0, "too late: nothing");
    /* (10 Nov 2026, his) a spot under a table can be picked up from a chair beside it you can sit on, by sitOn's own rule: at 12,12 the chair at 11,12 is got into through the chair at 11,11 from the free 10,11 */
    assert.equal(spotsOf(MAP).length, 3, "Basement spots never count; one boxed in by chairs counts from a chair"); assert.ok(spotsOf(MAP).some(s => s.x === 12 && s.y === 12), "a spot with a chair beside it you can sit on is dealt");
    { const walled = []; for (let x = 15; x <= 17; x++) for (let y = 15; y <= 17; y++) if (x !== 16 || y !== 16) walled.push({ k: "plant", x, y }); const M2 = { levels: [{ id: "g", name: "Ground", k: 0, cells: CELLS, props: [{ k: "table", x: 16, y: 16 }, ...walled] }], lostSpots: [{ level: "g", x: 16, y: 16 }] }; assert.equal(spotsOf(M2).length, 0, "a spot walled in by things nobody sits on is never dealt"); }
    assert.equal(spotsOf(null).length, 0, "no map to read: nothing dealt, never the old fixed spots");
    const bigCells = []; for (let x = 20; x < 80; x++) for (let y = -10; y < 30; y++) bigCells.push(x + "," + y);
    assert.equal(spotsOf({ levels: [{ id: "g", name: "Ground", k: 0, cells: bigCells }] }).length > 0, true, "the first spots, by floor name, still work");
    assert.ok(!fn._for.spotsOf({ levels: [{ id: "g", name: "Ground", k: 0, cells: bigCells }] }).some(s => s.x === 96 && s.y === -8), "G 96,-8 is out of the first spots");
    let r = await call("GET"); assert.equal(r.status, 200); assert.deepStrictEqual(r.body.rows, []); assert.equal(r.body.week, "2026-11-09", "weeks start on Monday");
    r = await call("POST", { act: "found", k: "duck", at: { level: "g", x: 5, y: 6 } }); assert.equal(r.status, 409, "nothing found without a search open");
    /* the server picks */
    r = await call("POST", { act: "start" }); assert.equal(r.status, 200); const o1 = r.body; assert.ok(THINGS.some(t => t.k === o1.k), "a real thing"); assert.ok(["g", "f1"].includes(o1.spot.level), "at a real spot"); assert.equal(o1.left, 900e3); assert.equal(o1.v, undefined, "a nicknamed player needs no visitor token");
    r = await call("POST", { act: "found", k: o1.k, at: { level: o1.spot.level, x: o1.spot.x + 1, y: o1.spot.y } }); assert.equal(r.status, 409, "not where it was put");
    /* (15 Nov 2026) the desk is closed for the first two minutes: refused with how long to wait, and the search kept */
    clock += 60e3; r = await call("POST", { act: "found", k: o1.k, at: { level: o1.spot.level, x: o1.spot.x, y: o1.spot.y } }); assert.equal(r.status, 409); assert.equal(r.body.closed, true, "desk closed"); assert.equal(r.body.wait, 60e3, "a minute to wait"); assert.ok(store.hallway_lost_open.find(x => x.k === o1.k), "the search is still open"); clock -= 60e3;
    clock += 300e3; r = await call("POST", { act: "hint" }); assert.equal(r.body.hints, 1); clock += 60e3;
    r = await findIt(o1); assert.equal(r.status, 200); assert.equal(r.body.secs, 360); assert.equal(r.body.points, pointsFor(360, 1), "clues counted here");
    const first = r.body.points;
    r = await findIt(o1); assert.equal(r.status, 409, "a find pays once");
    /* no repeats until everything's been found */
    const got = new Set([o1.k]); for (let i = 0; i < THINGS.length - 1; i++) { r = await call("POST", { act: "start" }); assert.ok(!got.has(r.body.k), "nothing found twice while there's something new: " + r.body.k); got.add(r.body.k); clock += 30e3; await findIt(r.body); }
    assert.equal(got.size, THINGS.length); r = await call("POST", { act: "start" }); assert.equal(r.status, 200, "then anything again");
    /* start again while it's open: the same search, clock running (9 Nov scan, finding 2) */
    const before = r.body; assert.equal(before.swapsLeft, 2); clock += 50e3; r = await call("POST", { act: "start" }); assert.equal(r.body.k, before.k, "asking again gives the same thing"); assert.deepStrictEqual(r.body.spot, before.spot); assert.equal(r.body.resumed, true); assert.equal(r.body.left, 850e3, "on its own clock");
    /* swap: something else, on the same clock, twice at most */
    clock += 50e3; r = await call("POST", { act: "swap" }); assert.notEqual(r.body.k, before.k, "a different one"); assert.equal(r.body.left, 800e3, "the clock keeps going"); assert.equal(r.body.swapsLeft, 1); const sw = r.body; r = await findIt(before); assert.equal(r.status, 409, "the old one's gone");
    r = await call("POST", { act: "swap" }); assert.equal(r.status, 200); assert.equal(r.body.swapsLeft, 0); const sw2 = r.body;
    r = await call("POST", { act: "swap" }); assert.equal(r.status, 409, "no third swap"); assert.equal(r.body.noSwaps, true);
    r = await findIt(sw); assert.equal(r.status, 409, "the swapped-away one's gone too");
    clock += 25e3; r = await findIt(sw2); assert.equal(r.body.secs, 125, "the clock never started again");
    /* cancel: leaving ends it, no points */
    r = await call("POST", { act: "start" }); const c = r.body; await call("POST", { act: "cancel" }); r = await findIt(c); assert.equal(r.status, 409, "cancelled");
    /* (10 Nov scan, server finding 4) start again after a cancel: the same search, on its own clock, not a fresh roll */
    clock += 30e3; r = await call("POST", { act: "start" }); assert.equal(r.body.k, c.k, "same thing"); assert.equal(r.body.spot.x, c.spot.x, "same spot"); assert.equal(r.body.resumed, true); assert.ok(r.body.left <= c.left - 30e3, "same clock");
    clock += 5e3; r = await findIt(c); assert.equal(r.status, 200, "taken up again, it can be found"); assert.ok(r.body.secs >= 35);
    /* too late */
    r = await call("POST", { act: "start" }); const late = r.body; clock += 1000e3; r = await findIt(late); assert.equal(r.body.late, true); assert.equal(r.body.points, 0, "past the limit pays nothing");
    /* skip: a thing never goes where it doesn't suit */
    MAP.lostSpots[0].skip = MAP.lostSpots[3].skip = THINGS.map(t => t.k); fn._for.resetSpots(); for (let i = 0; i < 8; i++) { r = await call("POST", { act: "start" }); assert.equal(r.body.spot.level, "f1", "skipped everywhere on Ground"); await call("POST", { act: "cancel" }); } MAP.lostSpots[0].skip = MAP.lostSpots[3].skip = []; fn._for.resetSpots();
    /* after its time's up, a start is a new search */
    r = await call("POST", { act: "start" }); const old = r.body; clock += 1000e3; r = await call("POST", { act: "start" }); assert.ok(!r.body.resumed, "an expired search isn't handed back"); assert.equal(r.body.left, 900e3); r = await call("POST", { act: "swap" }); assert.equal(r.status, 200); clock += 1000e3; r = await call("POST", { act: "swap" }); assert.equal(r.status, 409, "no swapping an expired search"); await call("POST", { act: "cancel" }); void old;
    /* (15 Nov scan, server finding 1) leave mid-search, come back after the 15 minutes: the new search isn't born cancelled */
    clock += 16 * 60e3; r = await call("POST", { act: "start" }); assert.ok(!r.body.resumed, "a new search"); assert.ok(!store.hallway_lost_open.find(o => o.playerId === "p1").cancelled, "not marked cancelled");
    clock += 30e3; r = await call("POST", { act: "swap" }); assert.equal(r.status, 200, "it can be swapped"); const swapped = r.body;
    clock += 30e3; r = await findIt(swapped); assert.equal(r.status, 200, "and its first find counts"); assert.ok(r.body.points > 0);
    /* Visitors */
    me = null; r = await call("POST", { act: "hint" }); assert.equal(r.status, 409, "a visitor with no token has nothing open");
    r = await call("POST", { act: "start" }); assert.equal(r.status, 200); const v1 = r.body.v; assert.ok(v1, "a visitor gets a token"); assert.match(r.body.name, /^Visitor \d{3}$/);
    const vn = r.body.name; clock += 130e3; r = await call("POST", { act: "found", k: r.body.k, at: r.body.spot, v: v1 }); assert.ok(r.body.points > 0);
    r = await call("POST", { act: "start", v: v1 }); assert.equal(r.body.v, undefined, "a visitor keeps their token"); assert.equal(r.body.name, vn);
    r = await call("POST", { act: "start", v: v1.slice(0, -2) + "xx" }); assert.ok(r.body.v && r.body.name !== vn, "a forged token is a new visitor");
    const nums = store.hallway_lost_visitors.map(x => x.n); assert.ok(nums.every(n => n >= 1 && n < 1000), "three digits");
    /* random numbers, not counting up: a run of new visitors */
    net = null; const many = []; for (let i = 0; i < 30; i++) { r = await call("POST", { act: "start" }); many.push(+r.body.name.slice(8)); } assert.equal(new Set(many).size, many.length, "each number once"); assert.ok(many.some((n, i) => i && n < many[i - 1]), "not in order");
    net = "netB"; for (let i = 0; i < 10; i++) await call("POST", { act: "start" }); r = await call("POST", { act: "start" }); assert.equal(r.status, 429, "new visitors capped per network per hour");
    /* (9 Nov scan, finding 3) a start keeps a Visitor's number; one let go while they were away (the TTL) gets them a new number on the same id */
    const v1Row = store.hallway_lost_visitors.find(x => visitorName(x.n) === vn); const was = v1Row.at; clock += 5e3; r = await call("POST", { act: "start", v: v1 }); assert.equal(r.body.name, vn); assert.ok(store.hallway_lost_visitors.find(x => x.v === v1Row.v).at >= was, "the number's kept another while");
    await call("POST", { act: "cancel", v: v1 }); store.hallway_lost_visitors.splice(store.hallway_lost_visitors.indexOf(v1Row), 1);
    r = await call("POST", { act: "start", v: v1 }); assert.ok(r.body.v && r.body.v !== v1, "a new token"); const back = store.hallway_lost_visitors.find(x => x.v === v1Row.v); assert.ok(back, "on the same id"); assert.equal(r.body.name, visitorName(back.n));
    await call("POST", { act: "cancel", v: r.body.v });
    /* a full three-digit space: a few tries, then four digits, and the next one goes straight there */
    const keep = store.hallway_lost_visitors.slice(); store.hallway_lost_visitors.length = 0; for (let n = 1; n < 1000; n++) store.hallway_lost_visitors.push({ n, v: "f".repeat(16) });
    net = null; inserts = 0; r = await call("POST", { act: "start" }); assert.match(r.body.name, /^Visitor \d{4}$/, "four digits once three are gone"); assert.ok(inserts <= 7, "a few tries, not 30: " + inserts);
    inserts = 0; r = await call("POST", { act: "start" }); assert.ok(inserts <= 1, "a full size is skipped for a while: " + inserts);
    store.hallway_lost_visitors.length = 0; store.hallway_lost_visitors.push(...keep);
    /* the board: players and visitors, banned players off, visitor's own row */
    me = { id: "p2" }; r = await call("POST", { act: "start" }); clock += 25e3; await findIt(r.body);
    /* (10 Nov scan, server finding 12) a renamed player is on the board under the name they have now */
    { const was = players.p1.nick; players.p1.nick = "Renamed"; r = await call("GET"); assert.ok(r.body.rows.some(x => x.name === "Renamed"), "the board uses today's nickname"); assert.ok(!r.body.rows.some(x => x.name === was), "not the old one"); players.p1.nick = was; }
    me = null; r = await call("GET", undefined, {}, { v: v1 }); assert.ok(r.body.rows.some(x => x.name === vn && x.visitor && x.id === null), "visitors on the board, with no id"); assert.equal(r.body.me.name, vn, "a visitor's own row (the old ?v= still works)");
    r = await call("GET", undefined, { "x-hallway-visitor": v1 }); assert.equal(r.body.me && r.body.me.name, vn, "the token in its header (9 Nov scan, finding 11)");
    assert.ok(r.body.rows.filter(x => !x.visitor).every(x => /^pub-/.test(x.id)), "public ids only");
    banned.add("p2"); r = await call("GET"); assert.ok(!r.body.rows.some(x => x.name === "Zed"), "banned players off the board"); banned.clear();
    /* (9 Nov scan, finding 9) your own rank leaves out banned players, as the board does: on the board and below it */
    { const wk = store.hallway_lost[0].week, saved = store.hallway_lost.slice(); store.hallway_lost.length = 0; players.pb = { nick: "Bad" };
      store.hallway_lost.push({ playerId: "pb", week: wk, points: 9000, name: "Bad" }, { playerId: "p2", week: wk, points: 5000, name: "Zed" });
      for (let i = 0; i < 40; i++) { players["q" + i] = { nick: "Q" + i }; store.hallway_lost.push({ playerId: "q" + i, week: wk, points: 4000 - i, name: "Q" + i }); }
      banned.add("pb"); me = { id: "p2" }; r = await call("GET"); assert.equal(r.body.rows[0].name, "Zed"); assert.equal(r.body.me.rank, 1, "first on the board, first in your own row");
      me = { id: "q39" }; r = await call("GET"); assert.equal(r.body.me.rank, 41, "below the board: the banned one above isn't counted");
      banned.clear(); store.hallway_lost.length = 0; store.hallway_lost.push(...saved); }
    /* a signed-in player with no nickname plays as a Visitor */
    me = { id: "p3" }; net = "netC"; r = await call("POST", { act: "start" }); assert.match(r.body.name, /^Visitor/); assert.ok(r.body.v);
    /* the day's cap */
    /* an hour into a fresh UTC day: 25 finds two minutes apart (the closed desk) mustn't run past midnight, where the cap starts again */
    me = { id: "p1" }; clock = Math.ceil(clock / 864e5) * 864e5 + 3600e3; let capped = false; for (let i = 0; i < 25; i++) { r = await call("POST", { act: "start" }); clock += 30e3; r = await findIt(r.body); if (r.body.capped) capped = true; }
    assert.ok(capped, "past the day's cap a find doesn't go on the board");
    refuse = { statusCode: 403, body: JSON.stringify({ error: "banned" }) }; r = await call("POST", { act: "start" }); assert.equal(r.status, 403, "banned refused"); refuse = null;
    r = await call("POST", { act: "found", k: "<b>", at: { level: "g", x: 1, y: 1 } }); assert.equal(r.status, 400, "bad ids refused");
    r = await call("POST", { act: "start" }, { origin: "https://evil.test" }); assert.equal(r.status, 403, "other sites refused");
    r = await call("POST", { act: "nonsense" }); assert.equal(r.status, 400);
    /* (10 Nov scan, server finding 7) closed: no searches */
    { store.settings[0].hallwayState = "maintenance"; require("../netlify/functions/_hallway-open")._reset(); const r2 = await call("POST", { act: "start" }); assert.equal(r2.status, 403, "closed: refused"); store.settings[0].hallwayState = "live"; require("../netlify/functions/_hallway-open")._reset(); }
    Date.now = realNow; console.log("hallway-lost: all good (" + THINGS.length + " things, first find " + first + ")");
})().catch(e => { console.error(e); process.exit(1); });

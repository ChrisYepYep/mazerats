/* The page's progress store (tools/hallway-editor/progress.js) against the real hallway-progress function, which runs on a fake database:
   a guest's finished hunt signing in has to reach the server even though it now takes one clue a save, 8 seconds apart (9 Nov 2026 scan,
   finding 4). Nothing here reaches the real database. node tools/test-hallway-progress-client.js */
const Module = require("module"), path = require("path"), fs = require("fs"), vm = require("vm"), assert = require("assert");
let clock = Date.UTC(2026, 10, 9, 12); const realNow = Date.now; Date.now = () => clock;
const docs = new Map(), MAP = { levels: [{ id: "g", k: 0 }], hunts: [{ id: "keys", clues: [{}, {}, {}] }] };
const col = {
    async countDocuments(q) { const k = Object.keys(q)[0].split(".")[1]; let n = 0; for (const d of docs.values()) if (d.hunts && d.hunts[k] && d.hunts[k].done) n++; return n; },
    async findOne(q) { const d = docs.get(q.playerId); return d ? JSON.parse(JSON.stringify(d)) : null; },
    async updateOne(f, u, o) { const d = docs.get(f.playerId); if (d && d.rev !== f.rev) return { matchedCount: 0 }; docs.set(f.playerId, { playerId: f.playerId, ...(d || {}), ...u.$set }); return d ? { matchedCount: 1 } : { upsertedCount: 1 }; },
    async findOneAndUpdate() { return null; }, async insertOne() {}
};
const fakes = {
    "./_db": { getDb: async () => ({ collection: n => n === "players" ? { findOne: async () => ({}) } : n === "settings" ? { findOne: async () => ({ hallwayState: "live" }) } : col }), ensureUniqueIndex: async () => {} },
    "./_player": { playerFrom: () => ({ id: "p1" }), sessionRevoked: () => false },
    "./_bans": { writeRefusal: async () => null },
    "./_hallway-map": { publishedMap: async () => MAP },
    "./_errors": { withErrorReporting: (n, f) => f },
    "./_headers": { SECURITY_HEADERS: {} }
};
const load0 = Module._load; Module._load = function (req, parent, ...r) { if (fakes[req] && parent && /hallway-progress/.test(parent.filename)) return fakes[req]; return load0.call(this, req, parent, ...r); };
const { handler } = require(path.join(__dirname, "..", "netlify", "functions", "hallway-progress.js"));

/* the page: localStorage, fetch to the handler, and timers we run by hand */
const ls = new Map(), timers = []; let posts = 0;
const localStorage = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
const fetch = async (url, o = {}) => { if (o.method === "POST") posts++; const r = await handler({ httpMethod: o.method || "GET", headers: { host: "x.test" }, body: o.body }); return { ok: r.statusCode < 400, status: r.statusCode, json: async () => JSON.parse(r.body) }; };
const win = { localStorage, fetch, setTimeout: (f, ms) => { timers.push({ f, at: clock + ms }); return timers.length; }, clearTimeout: id => { if (timers[id - 1]) timers[id - 1].f = null; }, console };
win.window = win; vm.createContext(win);
/* a guest finished the whole hunt in this browser */
ls.set("hallway-progress", JSON.stringify({ hunts: { keys: { found: ["c0", "c1", "c2"], done: true } } }));
vm.runInContext(fs.readFileSync(path.join(__dirname, "hallway-editor", "progress.js"), "utf8"), win);
const settle = () => new Promise(r => setImmediate(r));
const runTimers = async () => { const due = timers.filter(t => t.f && t.at <= clock); for (const t of due) { const f = t.f; t.f = null; f(); } for (let i = 0; i < 20; i++) await settle(); };

(async () => {
    const P = win.HallwayProgress; await P.load(); for (let i = 0; i < 20; i++) await settle();
    assert.deepStrictEqual(docs.get("p1").hunts.keys.found, ["c0"], "the first save takes one clue");
    assert.ok(ls.has("hallway-progress"), "what's still to go stays in the browser meanwhile");
    assert.equal(P.get().hunts.keys.done, true, "the page still shows it found");
    clock += 9000; await runTimers(); assert.deepStrictEqual(docs.get("p1").hunts.keys.found, ["c0", "c1"], "sent again: the next clue");
    clock += 9000; await runTimers(); assert.equal(docs.get("p1").hunts.keys.done, true, "and then it's finished on the server");
    assert.ok(!ls.has("hallway-progress"), "caught up: the browser's copy is done with");
    const n = posts; clock += 9000; await runTimers(); assert.equal(posts, n, "nothing more is sent once it's caught up");
    /* playing signed in: two clues found within a few seconds of each other still both land */
    MAP.hunts.push({ id: "two", clues: [{}, {}] });
    P.save({ hunts: { two: { found: ["c0"] } } }); for (let i = 0; i < 20; i++) await settle(); clock += 3000;
    P.save({ hunts: { two: { found: ["c0", "c1"], done: true } } }); for (let i = 0; i < 20; i++) await settle();
    assert.deepStrictEqual(docs.get("p1").hunts.two.found, ["c0"], "too soon for the second");
    clock += 9000; await runTimers(); assert.equal(docs.get("p1").hunts.two.done, true, "sent again, it finishes");
    Date.now = realNow; console.log("hallway progress (page): all good");
})().catch(e => { console.error(e); process.exit(1); });

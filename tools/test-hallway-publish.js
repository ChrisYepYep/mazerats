/* The Hallway's publish (netlify/functions/hallway.js) against fake Blobs and a fake admin: nothing here can reach the real store
   (9 Nov 2026 scan, findings 7 and 8). node tools/test-hallway-publish.js */
const Module = require("module"), path = require("path"), assert = require("assert"), crypto = require("crypto");
const F = path.join(__dirname, "..", "netlify", "functions");
const mem = new Map(), meta = new Map();
let clock = Date.UTC(2026, 10, 9, 12); const realNow = Date.now; Date.now = () => clock;
const store = {
    async get(k, o = {}) { if (!mem.has(k)) return null; const v = mem.get(k); if (o.type === "json") return JSON.parse(v); if (o.type === "arrayBuffer") return v; return typeof v === "string" ? v : Buffer.from(v).toString(); },
    async set(k, v, o) { mem.set(k, v); meta.set(k, (o && o.metadata) || {}); }, async delete(k) { mem.delete(k); meta.delete(k); },
    async getMetadata(k) { return mem.has(k) ? { etag: "e", metadata: meta.get(k) || {} } : null; },
    async list({ prefix }) { return { blobs: [...mem.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
};
const fakes = {
    [path.join(F, "_blobs.js")]: { blobStore: () => store },
    [path.join(F, "_auth.js")]: { hasLiveSession: async () => true, canWrite: async () => true, refuseWrite: async () => ({ statusCode: 403, body: "{}" }), UNAUTHORIZED: { statusCode: 401, body: "{}" } },
    [path.join(F, "_errors.js")]: { withErrorReporting: (n, h) => async e => { try { return await h(e); } catch (err) { return { statusCode: 500, body: JSON.stringify({ error: "THREW " + err.message }) }; } } }
};
const load0 = Module._load; Module._load = function (req, parent, isMain) { try { const f = Module._resolveFilename(req, parent, isMain); if (fakes[f]) return fakes[f]; } catch (e) { /* not ours */ } return load0.apply(this, arguments); };
const { handler } = require(path.join(F, "hallway.js"));
const post = async b => { const r = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify(b), queryStringParameters: {} }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), crypto.randomBytes(20)]), h = b => crypto.createHash("sha1").update(b).digest("hex").slice(0, 20);
const up = p => post({ action: "tile", hash: h(p), png: p.toString("base64") });
(async () => {
    const map = { levels: [{ id: "1" }] };
    /* finding 8: null tiles or lift is a 400 */
    for (const manifest of [{ tiles: null, lift: {} }, { tiles: {}, lift: null }]) { const r = await post({ action: "publish", map, manifest }); assert.equal(r.status, 400, "null " + JSON.stringify(manifest) + " is refused, not thrown"); }
    /* finding 7b: a lift-only change is a new version, and the old lift picture is kept for pages still on it */
    const a = png(), b = png(), t0 = png(); await up(a); await up(b); await up(t0);
    const r1 = await post({ action: "publish", map, manifest: { tiles: { t: h(t0) }, lift: { x: h(a) } } }), r2 = await post({ action: "publish", map, manifest: { tiles: { t: h(t0) }, lift: { x: h(b) } } });
    assert.equal(r1.status, 200); assert.equal(r2.status, 200); assert.notEqual(r1.body.version, r2.body.version, "the lift is part of the version");
    assert.ok(mem.has("tile/" + h(a)), "the first publish's lift picture is still there");
    /* finding 7a: a picture sent for another publish, not yet published, survives this one's tidy-up while it's fresh */
    const c = png(); await up(c); clock += 60e3; const d = png(); await up(d);
    clock += 60e3; let r = await post({ action: "publish", map: { levels: [{ id: "2" }] }, manifest: { tiles: { t: h(d) }, lift: {} } }); assert.equal(r.status, 200);
    assert.ok(mem.has("tile/" + h(c)), "a picture sent two minutes ago, for a publish still on its way, is kept");
    r = await post({ action: "publish", map: { levels: [{ id: "3" }] }, manifest: { tiles: { t: h(c) }, lift: {} } }); assert.equal(r.status, 200, "and that other publish then finds it");
    /* ...but once it's old and unnamed it goes, as before */
    const e = png(); await up(e); clock += 11 * 60e3;
    for (let i = 4; i < 8; i++) { r = await post({ action: "publish", map: { levels: [{ id: "L" + i }] }, manifest: { tiles: { t: h(d) }, lift: {} } }); assert.equal(r.status, 200); }
    assert.ok(!mem.has("tile/" + h(e)), "an old picture nobody names is tidied away");
    /* a picture from before tiles were timed (no metadata) is tidied as it always was */
    mem.set("tile/" + "f".repeat(20), Buffer.from("x")); meta.set("tile/" + "f".repeat(20), {});
    r = await post({ action: "publish", map: { levels: [{ id: "9" }] }, manifest: { tiles: { t: h(d) }, lift: {} } }); assert.ok(!mem.has("tile/" + "f".repeat(20)), "untimed old pictures still go");
    Date.now = realNow; console.log("hallway publish: all good");
})().catch(e => { console.error(e); process.exit(1); });

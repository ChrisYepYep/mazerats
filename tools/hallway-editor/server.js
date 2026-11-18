/* The Hallway editor's little server. Local only: never published (tools/ isn't in dist).

     GET  /                 the editor
     GET  /api/map          the saved map
     POST /api/map          saves it, keeping the last 40 in .history/
     POST /api/version      { map, liftOpen } -> { v, report }: registers a map to draw
     GET  /api/tile?v&tx&ty a 512px square of it, as a PNG
     GET  /api/whole?v      the whole map rectangle, as a PNG
     GET  /api/names        the mazes A to Z (live list if it can be had, else the cached one)

   Drawing happens on worker threads. This thread only answers, so it never gets stuck behind
   a queue of pictures, and a picture nobody is waiting for any more is never drawn.

   Start it with start-editor.bat here, or `node tools/hallway-editor/server.js`,
   then open http://localhost:8778/ */
"use strict";
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Worker } = require("worker_threads");
const W = require("./render/hw3.js");
const { encodePng } = require("../png-encode.js");

const PORT = Number(process.env.PORT) || 8778;
const MAP = process.env.HALLWAY_MAP || path.join(__dirname, "map.json");     // HALLWAY_MAP: a copy to open instead, for a test editor beside his own
/* (10 Nov scan, server findings 5 and 6) a test map keeps its own history, so its saves never push the real map's backups out; it must exist; and it can't publish */
const TEST_MAP = !!process.env.HALLWAY_MAP;
if (TEST_MAP && !fs.existsSync(MAP)) { console.error("HALLWAY_MAP: there's no file at " + MAP); process.exit(1); }
const HISTORY = TEST_MAP ? path.join(path.dirname(MAP), ".history-" + path.basename(MAP, ".json")) : path.join(__dirname, ".history");
const KEEP = 40, TILE = 512, CACHE_MAX = 900;
const SIGN_MAX = { w: 400, h: 200 }, WHOLE_MAX = 12000;     // the biggest sign the editor makes; the whole-map picture's longest side
/* (10 Nov 2026, editor speed) up to 12 threads, leaving a few cores for the page and everything else. The page can only ask for 6 squares at
   once, so it says which it wants next (/api/warm) and the other threads draw those ahead */
const THREADS = Math.max(2, Math.min(12, os.cpus().length - 4));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2" };

/* his globe lamp picture: when it's saved, every picture of the map has to be redrawn */
const LAMP_ART = path.join(__dirname, "art", "lamps", "globe-lamp.png");
const WALL_ART = path.join(__dirname, "art", "lamps", "globe-wall-light.png");
const BACK_ART = path.join(__dirname, "art", "lamps", "globe-wall-light-back.png");
const SCONCE_ART = path.join(__dirname, "art", "lamps", "wall-light.png");
const TABLE_ART = path.join(__dirname, "art", "lamps", "globe-table-lamp.png");
const artStamp = () => { let t = 0; for (const f of [LAMP_ART, WALL_ART, BACK_ART, SCONCE_ART, TABLE_ART]) { try { t += fs.statSync(f).mtimeMs; } catch (e) { /* not there */ } } return t; };
let artAt = artStamp();
let publishing = { running: false, at: 0, of: 0, error: null };
for (const f of [LAMP_ART, WALL_ART, BACK_ART, SCONCE_ART, TABLE_ART]) fs.watchFile(f, { interval: 400 }, () => {
    artAt = artStamp();
    /* the ghost that follows the mouse when placing one */
    const furni = () => require("child_process").execFile(process.execPath, [path.join(__dirname, "make-furni-art.js")], () => {});
    /* the table lamp's picture for the palette comes from make-ideas-art.js, lamp only (18 Nov 2026): a full run rewrote every art/wall/i_*.png,
       i_key.png and anything else he'd replaced by hand, and the Lost Property list */
    if (f === TABLE_ART) require("child_process").execFile(process.execPath, [path.join(__dirname, "make-ideas-art.js"), "--lamp-only"], err => { if (err) console.error("make-ideas-art --lamp-only: " + err.message); furni(); });
    else furni();
});

let names = W.H.names2();
let namesFrom = "cached list";
let difficulty = {};            // a maze's name -> easy, medium, hard, very-hard, extreme
/* The live list, if the site will give it. Failure is fine: the cached list stands. */
https.get("https://mazerats.net/.netlify/functions/rooms", { timeout: 8000 }, res => {
    let s = ""; res.on("data", d => s += d);
    res.on("end", () => {
        try {
            const j = JSON.parse(s), rooms = j.rooms || (Array.isArray(j) ? j : null);
            if (!rooms || !rooms.length) return;
            /* every maze in the archive gets a door, closed ones too: it's an archive */
            const list = rooms.filter(r => r && r.name).map(r => W.H.clean(String(r.name))).filter(Boolean);
            if (list.length > 10) { names = list.sort((a, c) => a.replace(/[^A-Za-z0-9]/g, "").toLowerCase().localeCompare(c.replace(/[^A-Za-z0-9]/g, "").toLowerCase())); namesFrom = "live archive"; for (const r of rooms) if (r && r.name && r.difficulty) difficulty[W.H.clean(String(r.name))] = String(r.difficulty).toLowerCase().trim().replace(/\s+/g, "-"); }
        } catch (e) { /* the cached list stands */ }
    });
}).on("error", () => {});

/* ---------- the pool ---------- */
const versions = new Map();     // v -> { text, liftOpen }
const cache = new Map();        // "v|tx|ty" -> PNG buffer, oldest first
const queue = [];               // jobs waiting for a thread
const pool = [];
let nextId = 1;
function spawn() {
    const t = { worker: new Worker(path.join(__dirname, "render", "worker.js")), job: null, known: new Set() };
    t.worker.on("message", m => {
        const job = t.job; t.job = null;
        if (job && m.id === job.id) {
            /* the thread forgot the map: sent once more, and if it asks again the square fails rather than bouncing for ever (15 Nov scan, editor 17) */
            if (m.needMap && !job.retried) { job.retried = true; t.known.delete(job.v); queue.unshift(job); }
            else if (m.needMap) job.done(null, "That map couldn't be drawn.");
            else if (m.error) { console.error(m.error); job.done(null, m.error); }
            else job.done(Buffer.from(m.png));
        }
        pump();
    });
    t.worker.on("error", e => { console.error(e); const job = t.job; t.job = null; if (job) job.done(null, String(e)); pool.splice(pool.indexOf(t), 1); spawn(); pump(); });
    pool.push(t);
}
for (let i = 0; i < THREADS; i++) spawn();
/* squares only drawn ahead never take the last 6 threads: those stay free for what the page asks for, so asking never waits behind them */
const aheadOnly = j => !!j.entry && !j.entry.waiters.length, AHEAD_MAX = Math.max(0, THREADS - 6);      // none with 6 threads or fewer (10 Nov scan b, server 6)
function pump() {
    for (const t of pool) {
        if (t.job) continue;
        let job = null, ahead = pool.filter(p => p.job && aheadOnly(p.job)).length;
        for (let i = 0; i < queue.length; i++) {
            const q = queue[i];
            if (q.gone()) { queue.splice(i--, 1); if (q.drop) q.drop(); continue; }     // nobody is waiting for it now
            if (aheadOnly(q) && ahead >= AHEAD_MAX) continue;
            job = q; queue.splice(i, 1); break;
        }
        if (!job) return;
        const ver = versions.get(job.v);
        /* this thread still takes the next one: `continue` left it idle till the next pump (10 Nov scan b, server 2) */
        if (!ver) { job.done(null, "That map has gone."); return pump(); }
        t.job = job;
        const msg = { id: job.id, v: job.v, x: job.x, y: job.y, w: job.w, h: job.h, names, liftOpen: ver.liftOpen, cut: ver.cut, light: job.light };
        if (!t.known.has(job.v)) { msg.mapText = ver.text; t.known.add(job.v); }
        t.worker.postMessage(msg);
    }
}
function draw(res, key, rect, v) {
    const send = (buf, err) => {
        if (res.writableEnded || res.destroyed) return;
        if (!buf) { res.writeHead(500); return res.end(String(err || "Couldn't draw")); }
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }); res.end(buf);
    };
    if (key && cache.has(key)) return send(cache.get(key));
    let closed = false;
    res.on("close", () => { closed = true; });
    /* already being drawn, or waiting to be (drawn ahead): wait for that one, and if it's still waiting, it goes first */
    const same = key && drawing.get(key);
    if (same) { same.waiters.push({ send, gone: () => closed }); const at = queue.indexOf(same.job); if (at > 0) { queue.splice(at, 1); queue.unshift(same.job); } return; }
    queueJob(key, rect, v, { send, gone: () => closed });
    pump();
}
/* one drawing, for whoever's waiting for it; a square drawn ahead has nobody yet, and is wanted as long as its map is the newest asked ahead for */
const drawing = new Map();      // key -> { job, waiters }
let warmV = null;
function queueJob(key, rect, v, waiter) {
    const entry = { waiters: waiter ? [waiter] : [], ahead: !waiter };
    const job = { id: nextId++, v, ...rect,
        drop: () => { if (key && drawing.get(key) === entry) drawing.delete(key); },
        /* wanted while anyone waits for it, or while it's on the newest list drawn ahead (a request that joined it and left doesn't drop it: 10 Nov scan b, server 4) */
        gone: () => entry.waiters.every(w => w.gone()) && !(entry.ahead && v === warmV),
        done: (buf, err) => {
            if (key) drawing.delete(key);
            if (buf && key) { cache.set(key, buf); while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }
            for (const w of entry.waiters) w.send(buf, err);
        } };
    entry.job = job; job.entry = entry;
    if (key) drawing.set(key, entry);
    /* asked for: ahead of everything only drawn ahead */
    const firstAhead = waiter ? queue.findIndex(q => q.entry && !q.entry.waiters.length) : -1;
    if (firstAhead >= 0) queue.splice(firstAhead, 0, job); else queue.push(job);
    return job;
}

/* at most 8 MB (the map is about 0.2 MB): anything bigger is refused, not held in memory (15 Nov scan, editor 17) */
const BODY_MAX = 8 * 1024 * 1024;
class TooBig extends Error {}
function body(req, max = BODY_MAX) { return new Promise((ok, no) => { const c = []; let n = 0, over = false; req.on("data", d => { n += d.length; if (n > max) { if (!over) { over = true; c.length = 0; no(new TooBig("That's too big to send (over " + Math.round(max / 1048576) + " MB).")); } return; } c.push(d); }); req.on("end", () => ok(Buffer.concat(c).toString("utf8"))); req.on("error", no); }); }
/* the saved file's mark: the page sends it back with a save, so a save from another tab since it opened is caught (15 Nov scan, editor 1) */
const markOf = text => crypto.createHash("sha1").update(text).digest("hex").slice(0, 20);
const fileMark = () => { try { return markOf(fs.readFileSync(MAP)); } catch (e) { return null; } };
const isRect = r => !!r && typeof r === "object" && ["x", "y", "w", "h"].every(k => Number.isFinite(r[k])) && r.w > 0 && r.h > 0;
function json(res, code, o) { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); }

http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    /* This page and nothing else: any website could otherwise write to it while it's running */
    const hostOk = /^(localhost|127\.0\.0\.1):\d+$/.test(req.headers.host || ""), origin = req.headers.origin;
    if (!hostOk || (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) || (req.method === "POST" && url.pathname === "/api/map" && !/^application\/json/.test(req.headers["content-type"] || ""))) { res.writeHead(403); return res.end("Not from here"); }
    if (req.method !== "GET" && req.method !== "HEAD" && origin && new URL(origin).host !== req.headers.host) { res.writeHead(403); return res.end("Not from here"); }      // any write, not only a POST, from this page alone (18 Nov scan)
    try {
        if (url.pathname === "/api/map" && req.method === "GET") {
            let text; try { text = fs.readFileSync(MAP); } catch (e) { return json(res, 500, { error: "The map file couldn't be read." }); }
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Map-Mark": markOf(text) });
            return res.end(text);
        }
        if (url.pathname === "/api/map" && req.method === "POST") {
            const map = JSON.parse(await body(req));
            /* a map with at least one floor and its rectangle (15 Nov scan, editor 17: {"levels":[]} was saved as a 13-byte map) */
            if (!map || !Array.isArray(map.levels) || !map.levels.length || !isRect(map.rect)) return json(res, 400, { error: "That isn't a whole map (it needs at least one floor and its edges), so it wasn't saved." });
            /* saved from another tab since this one read it: asked about, not overwritten (?force=1 is the answer "replace it") */
            const base = req.headers["x-map-base"], now = fileMark();
            if (base && now && base !== now && url.searchParams.get("force") !== "1") return json(res, 409, { error: "This map has been saved from another tab or window since this one opened it.", mark: now });
            fs.mkdirSync(HISTORY, { recursive: true });
            if (fs.existsSync(MAP)) fs.copyFileSync(MAP, path.join(HISTORY, `map-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
            const old = fs.readdirSync(HISTORY).sort(); while (old.length > KEEP) fs.unlinkSync(path.join(HISTORY, old.shift()));
            /* written beside it and swapped in, so a crash part way never leaves half a map (15 Nov scan, editor 17) */
            const out = JSON.stringify(map), tmp = MAP + ".saving";
            fs.writeFileSync(tmp, out);
            try { fs.renameSync(tmp, MAP); } catch (e) { fs.writeFileSync(MAP, out); try { fs.unlinkSync(tmp); } catch (e2) { /* left beside it */ } }      // the file held open by something else: written in place, as before
            return json(res, 200, { saved: true, at: Date.now(), mark: markOf(out) });
        }
        if (url.pathname === "/api/version" && req.method === "POST") {
            const o = JSON.parse(await body(req));
            if (!o || !o.map || typeof o.map !== "object" || !Array.isArray(o.map.levels)) return json(res, 400, { error: "No map to draw." });
            const text = JSON.stringify(o.map);
            const v = crypto.createHash("sha1").update(text + (o.liftOpen ? "1" : "0") + names.length + artAt + JSON.stringify(o.cut || 0)).digest("hex").slice(0, 16);
            if (!versions.has(v)) { versions.set(v, { text, liftOpen: !!o.liftOpen, cut: o.cut || null }); while (versions.size > 14) { const oldV = versions.keys().next().value; versions.delete(oldV); for (const k of cache.keys()) if (k.startsWith(oldV + "|")) cache.delete(k); } }
            let report = null;
            try { report = W.fromMap(JSON.parse(text), names).report; } catch (e) { report = { error: String(e.message || e) }; }
            return json(res, 200, { v, report, tile: TILE });
        }
        if (url.pathname === "/api/art") return json(res, 200, { at: artAt });
        /* Publish: its own process, since it draws the whole map four times over */
        if (url.pathname === "/api/publish") {
            if (req.method === "GET") return json(res, 200, publishing);
            /* only a POST starts one (18 Nov scan): a HEAD, which a web page can send here without saying where it's from, started a publish too */
            if (req.method !== "POST") { res.writeHead(405, { Allow: "GET, POST" }); return res.end(); }
            if (TEST_MAP && req.method === "POST") return json(res, 403, { error: "This is a test editor (HALLWAY_MAP): it doesn't publish." });
            if (publishing.running) return json(res, 409, { error: "Already publishing." });
            publishing = { running: true, at: 0, of: 0, error: null };
            const child = require("child_process").fork(path.join(__dirname, "publish.js"), [], { silent: true });
            let errors = "";
            child.stdout.on("data", d => { const m = /progress (\d+) of (\d+)/.exec(String(d)); if (m) { publishing.at = +m[1]; publishing.of = +m[2]; } });
            child.stderr.on("data", d => { errors += d; });
            child.on("exit", code => { publishing = { running: false, at: 0, of: 0, error: code ? (errors.trim().split("\n").pop() || "It stopped.") : null }; });
            return json(res, 200, publishing);
        }
        /* the Events Gallery's exhibits (12 Nov 2026): the site's public events, as visitors see them (no hidden or admin-only ones), and
           their pictures; read from the live site, nothing is ever written there */
        if (url.pathname === "/api/events") {
            return https.get("https://mazerats.net/.netlify/functions/events", { timeout: 15000 }, up => { const a = []; up.on("data", d => a.push(d)); up.on("end", () => { res.writeHead(up.statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" }); res.end(Buffer.concat(a)); }); }).on("error", e => json(res, 502, { error: String(e.message) }));
        }
        if (url.pathname === "/api/eventimg") {
            const u = url.searchParams.get("u") || "";
            if (!/^\/(\.netlify\/functions\/image\?|assets\/)/.test(u)) return json(res, 400, { error: "not a picture of the site's" });
            return https.get("https://mazerats.net" + u, { timeout: 15000 }, up => { const a = []; up.on("data", d => a.push(d)); up.on("end", () => { res.writeHead(up.statusCode, { "Content-Type": up.headers["content-type"] || "image/png", "Cache-Control": "max-age=86400" }); res.end(Buffer.concat(a)); }); }).on("error", e => json(res, 502, { error: String(e.message) }));
        }
        if (url.pathname === "/api/archive") {
            /* the rooms' mazes, read from the live archive; nothing is ever written there */
            return https.get("https://mazerats.net/.netlify/functions/rooms", { timeout: 15000 }, up => { const a = []; up.on("data", d => a.push(d)); up.on("end", () => { res.writeHead(up.statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" }); res.end(Buffer.concat(a)); }); }).on("error", e => json(res, 502, { error: String(e.message) }));
        }
        if (url.pathname === "/api/lift") {
            /* one lift on a see-through picture, doors part way open, to animate over the map */
            const slide = Math.max(0, Math.min(1, Number(url.searchParams.get("slide")) || 0)), bw = 180, bh = 200, ax = 40, ay = 160, b = new W.Buf(bw, bh);
            for (let i = 0; i < b.d.length; i += 4) { b.d[i] = 255; b.d[i + 1] = 0; b.d[i + 2] = 255; b.d[i + 3] = 255; }
            const fake = { b, z: 0, ox: ax, oy: ay, lamps: [], sprites: [], S(x, y) { return [Math.round((x - y) * 16) + ax, Math.round((x + y) * 8) + ay]; }, WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; } };
            W.lift(fake, 0, 0, slide >= 1 ? { open: true } : { slide });
            W.recolour(b, url.searchParams.get("way") || "oxblood", [0, 0, bw, bh]);
            for (let i = 0; i < b.d.length; i += 4) if (b.d[i] === 255 && b.d[i + 1] === 0 && b.d[i + 2] === 255) b.d[i + 3] = 0;
            res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Anchor": ax + "," + ay });
            return res.end(encodePng(bw, bh, b.d));
        }
        if (url.pathname === "/api/sign") {
            /* one sign on a see-through picture, for showing it live while it's dragged. Small enough to draw right here. */
            /* sizes capped (15 Nov scan, editor 6: w=40000 locked this server up at 9 GB); SIGN_MAX matches the editor's own limit */
            const q = url.searchParams, clampTo = (v, hi) => Math.max(0, Math.min(hi, Math.round(Number(v) || 0))), sw = clampTo(q.get("w"), SIGN_MAX.w), sh = clampTo(q.get("h"), SIGN_MAX.h), name = (q.get("name") || "").slice(0, 120);
            const bw = Math.max(sw, 240) + 40, bh = (bw >> 1) + Math.max(sh, 100) + 60, cx = bw >> 1, cy = bh - (bw >> 2) - 20;
            const b = new W.Buf(bw, bh);
            for (let i = 0; i < b.d.length; i += 4) { b.d[i] = 255; b.d[i + 1] = 0; b.d[i + 2] = 255; b.d[i + 3] = 255; }
            if (q.get("stair")) W.stairPlaque(b, cx, cy, name);
            else W.signIso(b, cx, cy, name, { alongY: q.get("y") === "1", max: 14, w: sw || undefined, h: sh || undefined, way: q.get("way") });
            for (let i = 0; i < b.d.length; i += 4) {
                if (b.d[i + 1] !== 0 || b.d[i] !== b.d[i + 2]) continue;
                if (b.d[i] === 255) b.d[i + 3] = 0;                     // nothing painted here
                else { b.d[i] = 0; b.d[i + 2] = 0; b.d[i + 3] = 115; }  // the shadow it throws, darkened from the blank
            }
            res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Anchor": cx + "," + cy });
            return res.end(encodePng(bw, bh, b.d));
        }
        /* the squares the page will ask for next, drawn ahead on the threads it can't reach (it only asks 6 at a time). A newer map's list
           replaces an older one's: the older squares still waiting are let go */
        if (url.pathname === "/api/warm" && req.method === "POST") {
            const o = JSON.parse(await body(req)), v = String(o.v || "");
            if (!versions.has(v) || !Array.isArray(o.tiles)) return json(res, 404, { error: "No such map" });
            warmV = v; let n = 0;
            for (const t of o.tiles.slice(0, 64)) {
                const tx = Number(t[0]), ty = Number(t[1]), w = String(t[2] || ""), m = w === "+x" || W.LIGHTS[w.replace("+x", "")] ? w : undefined; if (!Number.isInteger(tx) || !Number.isInteger(ty)) continue;
                const key = `${v}|${tx}|${ty}|${m || ""}`; if (cache.has(key) || drawing.has(key)) continue;
                queueJob(key, { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE, light: m }, v, null); n++;
            }
            pump();
            return json(res, 200, { queued: n, threads: THREADS });
        }
        if (url.pathname === "/api/tile") {
            const v = url.searchParams.get("v"), tx = Number(url.searchParams.get("tx")), ty = Number(url.searchParams.get("ty"));
            if (!versions.has(v) || !Number.isInteger(tx) || !Number.isInteger(ty)) { res.writeHead(404); return res.end("No such tile"); }
            const askedFor = url.searchParams.get("m") || "", light = askedFor === "+x" || W.LIGHTS[askedFor.replace("+x", "")] ? askedFor : undefined;
            return draw(res, `${v}|${tx}|${ty}|${light || ""}`, { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE, light }, v);
        }
        if (url.pathname === "/api/whole") {
            const v = url.searchParams.get("v"), ver = versions.get(v);
            if (!ver) { res.writeHead(404); return res.end("No such map"); }
            const r = JSON.parse(ver.text).rect;
            /* a rectangle too big to draw in memory is refused, not tried (15 Nov scan, editor 6) */
            if (!isRect(r) || r.w > WHOLE_MAX || r.h > WHOLE_MAX) { res.writeHead(413); return res.end("The map's edges are too far apart to draw as one picture."); }
            return draw(res, null, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w) & ~1, h: Math.round(r.h) & ~1 }, v);
        }
        if (url.pathname === "/api/preview" && req.method === "POST") {
            const name = String(url.searchParams.get("name") || "preview").replace(/[^a-z0-9-]/gi, "");
            const dir = path.join(__dirname, "previews"); fs.mkdirSync(dir, { recursive: true });
            const c = []; let n = 0; for await (const d of req) { n += d.length; if (n > 200 * 1048576) return json(res, 413, { error: "Too big." }); c.push(d); }      // a few minutes of sound at most
            fs.writeFileSync(path.join(dir, (name || "preview") + ".wav"), Buffer.concat(c));
            return json(res, 200, { saved: name });
        }
        if (url.pathname === "/api/names") { const font = {}; for (const ch in W.H.VOL.vb) font[ch] = W.H.VOL.vb[ch].w; return json(res, 200, { names, from: namesFrom, font, difficulty }); }
        const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
        const file = path.resolve(__dirname, rel);
        if (!file.startsWith(__dirname + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
        fs.createReadStream(file).pipe(res);
    } catch (e) {
        if (e instanceof TooBig) { if (!res.headersSent) json(res, 413, { error: e.message }); return; }
        console.error(e);
        if (!res.headersSent) json(res, 500, { error: String(e && e.message || e) });
    }
}).on("error", e => {
    /* one plain line, not a stack (15 Nov scan, editor 17) */
    console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is already in use: the editor is probably running already. Open http://localhost:${PORT}/ or close the other one first.` : "The editor's server couldn't start: " + (e.message || e));
    process.exit(1);
}).listen(PORT, "127.0.0.1", () => console.log(`Hallway editor: http://localhost:${PORT}/  (${THREADS} drawing threads)`));

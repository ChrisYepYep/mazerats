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
const MAP = path.join(__dirname, "map.json");
const HISTORY = path.join(__dirname, ".history");
const KEEP = 40, TILE = 512, CACHE_MAX = 900;
const THREADS = Math.max(2, Math.min(6, os.cpus().length - 1));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2" };

/* his globe lamp picture: when it's saved, every picture of the map has to be redrawn */
const LAMP_ART = path.join(__dirname, "art", "lamps", "globe-lamp.png");
const WALL_ART = path.join(__dirname, "art", "lamps", "globe-wall-light.png");
const BACK_ART = path.join(__dirname, "art", "lamps", "globe-wall-light-back.png");
const SCONCE_ART = path.join(__dirname, "art", "lamps", "wall-light.png");
const artStamp = () => { let t = 0; for (const f of [LAMP_ART, WALL_ART, BACK_ART, SCONCE_ART]) { try { t += fs.statSync(f).mtimeMs; } catch (e) { /* not there */ } } return t; };
let artAt = artStamp();
let publishing = { running: false, at: 0, of: 0, error: null };
for (const f of [LAMP_ART, WALL_ART, BACK_ART, SCONCE_ART]) fs.watchFile(f, { interval: 400 }, () => {
    artAt = artStamp();
    /* and the ghost that follows the mouse when placing one */
    require("child_process").execFile(process.execPath, [path.join(__dirname, "make-furni-art.js")], () => {});
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
            if (m.needMap) { t.known.delete(job.v); queue.unshift(job); }
            else if (m.error) { console.error(m.error); job.done(null, m.error); }
            else job.done(Buffer.from(m.png));
        }
        pump();
    });
    t.worker.on("error", e => { console.error(e); const job = t.job; t.job = null; if (job) job.done(null, String(e)); pool.splice(pool.indexOf(t), 1); spawn(); pump(); });
    pool.push(t);
}
for (let i = 0; i < THREADS; i++) spawn();
function pump() {
    for (const t of pool) {
        if (t.job) continue;
        let job;
        while ((job = queue.shift()) && job.gone()) { /* nobody is waiting for it now */ }
        if (!job) return;
        const ver = versions.get(job.v);
        if (!ver) { job.done(null, "That map has gone."); continue; }
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
    queue.push({ id: nextId++, v, ...rect, gone: () => closed, done: (buf, err) => {
        if (buf && key) { cache.set(key, buf); while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }
        send(buf, err);
    } });
    pump();
}

function body(req) { return new Promise((ok, no) => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => ok(Buffer.concat(c).toString("utf8"))); req.on("error", no); }); }
function json(res, code, o) { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); }

http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
        if (url.pathname === "/api/map" && req.method === "GET") {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            return fs.createReadStream(MAP).pipe(res);
        }
        if (url.pathname === "/api/map" && req.method === "POST") {
            const map = JSON.parse(await body(req));
            if (!map || !Array.isArray(map.levels)) return json(res, 400, { error: "Not a map." });
            fs.mkdirSync(HISTORY, { recursive: true });
            if (fs.existsSync(MAP)) fs.copyFileSync(MAP, path.join(HISTORY, `map-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
            const old = fs.readdirSync(HISTORY).sort(); while (old.length > KEEP) fs.unlinkSync(path.join(HISTORY, old.shift()));
            fs.writeFileSync(MAP, JSON.stringify(map));
            return json(res, 200, { saved: true, at: Date.now() });
        }
        if (url.pathname === "/api/version" && req.method === "POST") {
            const o = JSON.parse(await body(req)), text = JSON.stringify(o.map);
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
            if (publishing.running) return json(res, 409, { error: "Already publishing." });
            publishing = { running: true, at: 0, of: 0, error: null };
            const child = require("child_process").fork(path.join(__dirname, "publish.js"), [], { silent: true });
            let errors = "";
            child.stdout.on("data", d => { const m = /progress (\d+) of (\d+)/.exec(String(d)); if (m) { publishing.at = +m[1]; publishing.of = +m[2]; } });
            child.stderr.on("data", d => { errors += d; });
            child.on("exit", code => { publishing = { running: false, at: 0, of: 0, error: code ? (errors.trim().split("\n").pop() || "It stopped.") : null }; });
            return json(res, 200, publishing);
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
            const q = url.searchParams, sw = Number(q.get("w")) || 0, sh = Number(q.get("h")) || 0, name = q.get("name") || "";
            const bw = Math.max(sw, 240) + 40, bh = (bw >> 1) + Math.max(sh, 100) + 60, cx = bw >> 1, cy = bh - (bw >> 2) - 20;
            const b = new W.Buf(bw, bh);
            for (let i = 0; i < b.d.length; i += 4) { b.d[i] = 255; b.d[i + 1] = 0; b.d[i + 2] = 255; b.d[i + 3] = 255; }
            if (q.get("stair")) W.stairPlaque(b, cx, cy, name, { left: q.get("left") === "1" });
            else W.signIso(b, cx, cy, name, { alongY: q.get("y") === "1", max: 14, w: sw || undefined, h: sh || undefined, way: q.get("way") });
            for (let i = 0; i < b.d.length; i += 4) {
                if (b.d[i + 1] !== 0 || b.d[i] !== b.d[i + 2]) continue;
                if (b.d[i] === 255) b.d[i + 3] = 0;                     // nothing painted here
                else { b.d[i] = 0; b.d[i + 2] = 0; b.d[i + 3] = 115; }  // the shadow it throws, darkened from the blank
            }
            res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Anchor": cx + "," + cy });
            return res.end(encodePng(bw, bh, b.d));
        }
        if (url.pathname === "/api/tile") {
            const v = url.searchParams.get("v"), tx = Number(url.searchParams.get("tx")), ty = Number(url.searchParams.get("ty"));
            if (!versions.has(v) || !Number.isInteger(tx) || !Number.isInteger(ty)) { res.writeHead(404); return res.end("No such tile"); }
            const light = W.LIGHTS[url.searchParams.get("m")] ? url.searchParams.get("m") : undefined;
            return draw(res, `${v}|${tx}|${ty}|${light || ""}`, { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE, light }, v);
        }
        if (url.pathname === "/api/whole") {
            const v = url.searchParams.get("v"), ver = versions.get(v);
            if (!ver) { res.writeHead(404); return res.end("No such map"); }
            const r = JSON.parse(ver.text).rect;
            return draw(res, null, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w) & ~1, h: Math.round(r.h) & ~1 }, v);
        }
        if (url.pathname === "/api/preview" && req.method === "POST") {
            const name = String(url.searchParams.get("name") || "preview").replace(/[^a-z0-9-]/gi, "");
            const dir = path.join(__dirname, "previews"); fs.mkdirSync(dir, { recursive: true });
            const c = []; for await (const d of req) c.push(d);
            fs.writeFileSync(path.join(dir, name + ".wav"), Buffer.concat(c));
            return json(res, 200, { saved: name });
        }
        if (url.pathname === "/api/names") { const font = {}; for (const ch in W.H.VOL.vb) font[ch] = W.H.VOL.vb[ch].w; return json(res, 200, { names, from: namesFrom, font, difficulty }); }
        const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
        const file = path.resolve(__dirname, rel);
        if (!file.startsWith(__dirname + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
        fs.createReadStream(file).pipe(res);
    } catch (e) {
        console.error(e);
        if (!res.headersSent) json(res, 500, { error: String(e && e.message || e) });
    }
}).listen(PORT, "127.0.0.1", () => console.log(`Hallway editor: http://localhost:${PORT}/  (${THREADS} drawing threads)`));

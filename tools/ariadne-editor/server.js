/* Ariadne's Thread: the level editor's own little server (14 Oct 2026).

   Serves the site's files to this machine only, so the editor can load the
   game, and writes what the editor saves:
     POST /api/save   { id: "mine-2", spec }  the passage's file in
                      assets/ariadne-levels/, the old one kept first in
                      tools/ariadne-editor/.history/, then js/rat-race-levels.js
                      written again from them all (bundle.js).
     GET  /api/history?id=mine-2              the kept versions, newest first
     GET  /api/history?id=mine-2&name=...     one of them
     POST /api/index  { index }               the list of zones and passages
   Nothing here is published: Netlify's build deletes tools/ariadne-editor.

   Start it with "Ariadne Level Editor.bat" in the site's folder (or
   `node tools/ariadne-editor/server.js`), then open http://localhost:8777/ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { build, format, readIndex, LEVELS, ROOT } = require("./bundle.js");

const PORT = Number(process.env.PORT) || 8777;
const HISTORY = path.join(__dirname, ".history");
const KEEP = 40;
const EPIC = path.join(__dirname, "epic-cache");
const TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8"
};
const loopback = req => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
const send = (res, code, body, type) => { res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const ID = /^[a-z]+-\d{1,2}$/;

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []; let n = 0;
        req.on("data", c => { n += c.length; if (n > 40e6) { reject(new Error("too big")); req.destroy(); } else chunks.push(c); });
        req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { reject(e); } });
        req.on("error", reject);
    });
}
function readRaw(req, max) {
    return new Promise((resolve, reject) => {
        const chunks = []; let n = 0;
        req.on("data", c => { n += c.length; if (n > max) { reject(new Error("too big")); req.destroy(); } else chunks.push(c); });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function keepOld(id) {
    const file = path.join(LEVELS, id + ".json");
    if (!fs.existsSync(file)) return;
    const dir = path.join(HISTORY, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, path.join(dir, stamp() + ".json"));
    const all = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
    for (const f of all.slice(0, Math.max(0, all.length - KEEP))) fs.unlinkSync(path.join(dir, f));
}
// A level must at least be a map and a list of objects before it is written over a good one.
function check(spec) {
    if (!spec || !Array.isArray(spec.tiles) || !spec.tiles.length || !spec.tiles.every(r => typeof r === "string")) return "no map";
    if (!Array.isArray(spec.objects)) return "no objects";
    const w = spec.tiles[0].length;
    if (!spec.tiles.every(r => r.length === w)) return "rows of different lengths";
    return null;
}

async function api(req, res, url) {
    if (url.pathname === "/api/save" && req.method === "POST") {
        const body = await readBody(req);
        const id = String(body.id || "");
        if (!ID.test(id)) return send(res, 400, { error: "bad id" });
        const known = readIndex().zones.some(z => z.passages.includes(id));
        if (!known) return send(res, 400, { error: "not a passage in index.json" });
        const bad = check(body.spec);
        if (bad) return send(res, 400, { error: bad });
        const spec = Object.assign({}, body.spec); delete spec.id;
        keepOld(id);
        const tmp = path.join(LEVELS, id + ".json.tmp");
        fs.writeFileSync(tmp, format(spec));
        fs.renameSync(tmp, path.join(LEVELS, id + ".json"));
        // (the file is safe either way; a bundle that cannot be made yet, while passages are still being written, is said so)
        let r = null, bundleError = null;
        try { r = build(); } catch (e) { bundleError = String(e && e.message || e); }
        return send(res, 200, { ok: true, id, bundle: r, bundleError, at: new Date().toISOString() });
    }
    if (url.pathname === "/api/index" && req.method === "POST") {
        const body = await readBody(req);
        const idx = body.index;
        if (!idx || !Array.isArray(idx.zones) || !idx.zones.every(z => z.name && Array.isArray(z.passages) && z.passages.every(p => ID.test(p)))) return send(res, 400, { error: "bad index" });
        fs.mkdirSync(LEVELS, { recursive: true });
        fs.writeFileSync(path.join(LEVELS, "index.json"), JSON.stringify(idx, null, 2) + "\n");
        return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/history" && req.method === "GET") {
        const id = url.searchParams.get("id") || "", name = url.searchParams.get("name");
        if (!ID.test(id)) return send(res, 400, { error: "bad id" });
        const dir = path.join(HISTORY, id);
        if (name) {
            if (!/^[\w-]+\.json$/.test(name)) return send(res, 400, { error: "bad name" });
            const f = path.join(dir, name);
            if (!fs.existsSync(f)) return send(res, 404, { error: "none" });
            return send(res, 200, fs.readFileSync(f, "utf8"));
        }
        const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse() : [];
        return send(res, 200, { id, versions: list.map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size })) });
    }
    /* (22 Oct 2026, the owner's: "make it so these load quicker in the editor when first listening to them") the
       epic soundtracks, once made, kept here as WAVs (tools/ariadne-editor/epic-cache/, not in git), named by the
       version and a key of the score and the recordings it was made from: a new score or new recordings, a new key
       GET  /api/epic?id=hybrid&key=...   the kept one, or 404
       POST /api/epic?id=hybrid&key=...   (the WAV) kept, and that version's older ones let go
       GET  /api/epic?key=...             the versions kept under that key */
    if (url.pathname === "/api/epic") {
        const id = url.searchParams.get("id") || "", key = url.searchParams.get("key") || "";
        if (!/^[0-9a-f]{8,64}$/.test(key) || (id && !/^[a-z]+(-made)?$/.test(id))) return send(res, 400, { error: "bad id or key" });
        fs.mkdirSync(EPIC, { recursive: true });
        if (req.method === "GET" && !id) return send(res, 200, { kept: fs.readdirSync(EPIC).filter(f => f.endsWith("-" + key + ".wav")).map(f => f.slice(0, -(key.length + 5))) });
        const file = path.join(EPIC, id + "-" + key + ".wav");
        if (req.method === "GET") {
            if (!fs.existsSync(file)) return send(res, 404, { error: "none" });
            res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": fs.statSync(file).size, "Cache-Control": "no-store" });
            return fs.createReadStream(file).pipe(res);
        }
        if (req.method === "POST") {
            const wav = await readRaw(req, 120e6);
            if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") return send(res, 400, { error: "not a WAV" });
            fs.writeFileSync(file + ".tmp", wav); fs.renameSync(file + ".tmp", file);
            // (hybrid's older ones, not hybrid-made's)
            for (const f of fs.readdirSync(EPIC)) if (f !== path.basename(file) && f.startsWith(id + "-") && /^[0-9a-f]+\.wav$/.test(f.slice(id.length + 1))) fs.unlinkSync(path.join(EPIC, f));
            return send(res, 200, { ok: true, bytes: wav.length });
        }
    }
    return send(res, 404, { error: "no such call" });
}

function serveFile(res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") { res.writeHead(302, { Location: "/tools/ariadne-editor/" }); return res.end(); }
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, "no", "text/plain");
    fs.stat(file, (err, st) => {
        if (err || !st.isFile()) return send(res, 404, "not found", "text/plain");
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
        fs.createReadStream(file).pipe(res);
    });
}

function handler(req, res) {
    if (!loopback(req)) { res.writeHead(403); return res.end(); }
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return api(req, res, url).catch(e => send(res, 500, { error: String(e && e.message || e) }));
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "no", "text/plain");
    serveFile(res, url);
}

// on both of this machine's own addresses, and no other
let up = 0;
for (const host of ["127.0.0.1", "::1"]) {
    const srv = http.createServer(handler);
    srv.on("error", e => { if (host === "::1") return; console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is in use: the editor may already be running (http://localhost:${PORT}/)` : e); process.exitCode = 1; });
    srv.listen(PORT, host, () => { if (++up === 1) console.log(`Ariadne's Thread level editor: http://localhost:${PORT}/`); });
}

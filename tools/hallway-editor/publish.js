/* Publishes the hallway to the site: node publish.js [path to a map], or the editor's Publish button.

   Everything goes in assets/hallway/ in the site, and the live page only ever shows what's there, so
   nothing you do in the editor reaches anybody until you publish and then deploy:
       manifest.json    the version, and which picture each square of the map is at each time of day
       tiles/           the map's pictures, drawn here by the editor's own renderer, so what's walked is
                        pixel for pixel what's on the editor's screen. Named by their contents: a publish
                        only adds the squares that changed, and browsers can keep them for good
       lift/            the lift doors' frames, as /api/lift draws them
       app/             the editor's own code and art, and play.html, the page that walks the hallway

   Lines of "progress n of m" go to the console, for the Publish button. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), os = require("os"), { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const W = require("./render/hw3.js"), { encodePng } = require("../png-encode.js");
const HERE = __dirname, SITE = path.join(HERE, "..", ".."), OUT = path.join(SITE, "assets", "hallway");
const MOODS = ["day", "dusk", "night", "dawn"], TILE = 512;
/* what the page needs of the editor: its code, its look and its art, and not the tools that made them */
const APP = ["editor.js", "editor.css", "hallway-audio.js", "progress.js", "lift-sounds.js", "furni-parts.js", "wall-items.js", "colour-picker.js", "play.js", "play.css", "live-moving.js", "live-basement.js", "live-lost.js", "live-arcade.js", "live-arrows.js", "live-theatre.js", "stamp-font.js", "live-leet.js", "live-gallery.js", "live-hunts.js", "live-xmas.js", "live-xmas-early.js", "hunts-editor.js", "lost-editor.js", "edit.js", "render/edge-items.js", "render/rope-barrier.js", "render/garland.js", "ideas/iso3d.js", "render/hall-window.js", "rooms.css", "room-starter.js", "room-view.js", "rooms-editor.js"];

/* art/'s scratch pictures stay at home (9 Nov scan, build 5): make-renderer.js's isScratch says which */
const { isScratch } = require("./make-renderer.js");
function copyDir(from, to, rel = "") {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
        const a = path.join(from, e.name), b = path.join(to, e.name), r = rel ? rel + "/" + e.name : e.name;
        if (e.isDirectory()) copyDir(a, b, r); else if (!isScratch(r)) fs.copyFileSync(a, b);
    }
}
/* a directory rename, tried again while Windows says the folder is busy */
function renameRetry(from, to) {
    for (let i = 0; ; i++) {
        try { return fs.renameSync(from, to); } catch (e) {
            if (i >= 6 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (i + 1));      // a short wait, synchronously, as the rest of finish() is
        }
    }
}
/* black, or the shade the renderer leaves past the picture's edge */
function isBlank(d) { for (let i = 0; i < d.length; i += 4) if ((d[i] || d[i + 1] || d[i + 2]) && !(d[i] === 7 && d[i + 1] === 6 && d[i + 2] === 10)) return false; return true; }
const liftFile = (way, f) => encodeURIComponent(way).replace(/%/g, "_") + "-" + f + ".png";

/* one lighting set: every square of it, written to tiles/ unless a square with the same picture is there already */
/* The file holds two maps (12 Nov 2026): the Hallways (the file itself, less its gallery) and the Events Gallery (its "gallery"), each
   drawn on its own; the gallery's squares are named "g:" in the manifest */
const mapPart = (text, which) => { const m = JSON.parse(text); if (which === "gallery") return m.gallery; delete m.gallery; return m; };
function drawLight(mapFile, light, which = "hallway") {
    const text = fs.readFileSync(mapFile, "utf8"), load = () => mapPart(text, which), names = W.H.names2(), tiles = {}, used = [], pre = which === "gallery" ? "g:" : "";
    /* the failing lights only where the Basement shows, and at Christmas only where something Christmassy is there too */
    const FP = require("./furni-parts.js"), xmasToo = light === "failing+x" ? FP.xmasTiles(load()) : null;
    const onlyBasement = light.startsWith("failing") ? new Set([...FP.basementTiles(load())].filter(k => !xmasToo || xmasToo.has(k))) : null;
    const world = W.build({ map: load(), names, light }), b = world.b, o = world.at(0, 0, 0);
    /* A square of the editor's picture is tile-sized in map pixels, counted from the map's origin, which the whole picture has moved */
    const tx0 = Math.floor(-o[0] / TILE), ty0 = Math.floor(-o[1] / TILE), tx1 = Math.ceil((b.w - o[0]) / TILE), ty1 = Math.ceil((b.h - o[1]) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (onlyBasement && !onlyBasement.has(tx + "," + ty)) continue;
        const v = b.crop(o[0] + tx * TILE, o[1] + ty * TILE, TILE, TILE); if (isBlank(v.d)) continue;
        const px = Buffer.from(v.d); for (let i = 0; i < px.length; i += 4) { if (px[i] === 7 && px[i + 1] === 6 && px[i + 2] === 10) px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = 255; }
        const png = encodePng(TILE, TILE, px), hash = crypto.createHash("sha1").update(png).digest("hex").slice(0, 20), name = hash + ".png", file = path.join(OUT, "tiles", name);
        if (!fs.existsSync(file)) fs.writeFileSync(file, png);
        used.push(name); tiles[pre + light + "|" + tx + "," + ty] = name;
    }
    return { tiles, used };
}

async function main() {
    const mapFile = process.argv[2] || path.join(HERE, "map.json"), text = fs.readFileSync(mapFile, "utf8"), load = () => JSON.parse(text), map = load();
    /* The names are locked to their doors in the map, so the live list isn't needed, except for a map from before that */
    const names = W.H.names2();
    fs.mkdirSync(path.join(OUT, "tiles"), { recursive: true });
    /* New things go in beside the old, and swap in at the end: a publish that fails part way leaves the last good one whole */
    const LIFT_NEW = path.join(OUT, "lift.new"), APP_NEW = path.join(OUT, "app.new");
    fs.rmSync(LIFT_NEW, { recursive: true, force: true }); fs.rmSync(APP_NEW, { recursive: true, force: true }); fs.mkdirSync(LIFT_NEW, { recursive: true });
    const tiles = {}, used = new Set();
    /* Christmas from the data, not a hand list (9 Nov scan: garlands, the giant tree and i_swag didn't count). The Basement's
       blackout gets a Christmas set of its own where the two meet, so its garlands and window snow go dark rather than vanish */
    const FP = require("./furni-parts.js"), lightsOf = m => { const hasXmas = FP.hasXmas(m), xmasSq = hasXmas ? FP.xmasTiles(m) : new Set(), failingX = [...FP.basementTiles(m)].some(k => xmasSq.has(k));
        return [...MOODS, "failing", ...(hasXmas ? MOODS.map(q => q + "+x") : []), ...(failingX ? ["failing+x"] : [])]; };
    const jobs = [...lightsOf(mapPart(text, "hallway")).map(light => ({ which: "hallway", light })), ...(map.gallery && (map.gallery.levels || []).length ? lightsOf(mapPart(text, "gallery")).map(light => ({ which: "gallery", light })) : [])];
    const lights = jobs.map(j => j.which + "|" + j.light), steps = lights.length + 1;
    /* each lighting set drawn in a thread of its own, several at once (8 Nov 2026: one after another took five minutes), each square
       written as it's drawn; the same squares, named by their contents, as before */
    let done = 0; const drawn = new Map();
    const one = job => new Promise((res, rej) => {
        const light = job.which + "|" + job.light, w = new Worker(__filename, { workerData: { mapFile, light: job.light, which: job.which } });
        w.once("message", got => { drawn.set(light, got); for (const n of got.used) used.add(n); done++; console.log(`progress ${done} of ${steps}`); res(); });
        w.once("error", rej); w.once("exit", code => { if (code) rej(new Error("Drawing " + job.which + " " + job.light + " stopped (" + code + ")")); });
    });
    const queue = [...jobs], threads = Math.max(1, Math.min(queue.length, os.cpus().length - 2, 6));
    await Promise.all(Array.from({ length: threads }, async () => { while (queue.length) await one(queue.shift()); }));
    /* in the same order whichever finished first, so the same map always makes the same version */
    for (const light of lights) Object.assign(tiles, drawn.get(light).tiles);
    /* Christmas keeps only what it changes; the page falls back on the plain square */
    for (const k of Object.keys(tiles)) { if (!k.includes("+x|")) continue; if (tiles[k] === tiles[k.replace("+x", "")]) delete tiles[k]; }
    /* The lift's doors, in each floor's colours */
    const ways = new Set([...map.levels, ...((map.gallery && map.gallery.levels) || [])].map(l => l.colour ? "hex:" + l.colour : l.way));
    for (const way of ways) for (let f = 0; f < 6; f++) {
        const slide = f / 5, bw = 180, bh = 200, ax = 40, ay = 160, b = new W.Buf(bw, bh);
        for (let i = 0; i < b.d.length; i += 4) { b.d[i] = 255; b.d[i + 1] = 0; b.d[i + 2] = 255; b.d[i + 3] = 255; }
        const fake = { b, z: 0, ox: ax, oy: ay, lamps: [], sprites: [], S(x, y) { return [Math.round((x - y) * 16) + ax, Math.round((x + y) * 8) + ay]; }, WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; } };
        W.lift(fake, 0, 0, slide >= 1 ? { open: true } : { slide });
        W.recolour(b, way, [0, 0, bw, bh]);
        for (let i = 0; i < b.d.length; i += 4) if (b.d[i] === 255 && b.d[i + 1] === 0 && b.d[i + 2] === 255) b.d[i + 3] = 0;
        fs.writeFileSync(path.join(LIFT_NEW, liftFile(way, f)), encodePng(bw, bh, b.d));
    }

    /* The page: the editor's own, with its tools left off, and the art it asks for */
    const app = APP_NEW;
    fs.mkdirSync(path.join(app, "render"), { recursive: true });
    for (const f of APP) { fs.mkdirSync(path.dirname(path.join(app, f)), { recursive: true }); fs.copyFileSync(path.join(HERE, f), path.join(app, f)); }
    copyDir(path.join(HERE, "art"), path.join(app, "art"));
    const version = finish(text, tiles, app, LIFT_NEW);
    /* Only now are the pictures nothing names any more taken away */
    for (const f of fs.readdirSync(path.join(OUT, "tiles"))) if (!used.has(f)) fs.unlinkSync(path.join(OUT, "tiles", f));
    console.log(`progress ${steps} of ${steps}`);
    console.log(`published ${version}: ${used.size} pictures`);
}

/* The version last, so the live page is never told about pictures that aren't there yet */
function finish(text, tiles, app, liftNew) {
    const version = crypto.createHash("sha1").update(text + JSON.stringify(tiles)).digest("hex").slice(0, 16);
    let html = fs.readFileSync(path.join(HERE, "index.html"), "utf8");
    html = html.replace("<!-- The Hallway editor. Local only: served by tools/hallway-editor/server.js, never published. -->", "<!-- The Hallway, for walking. Made by tools/hallway-editor/publish.js from the editor's page: don't edit it here. -->")
        .replace(/<link rel="stylesheet" href="editor\.css">/, `<link rel="stylesheet" href="editor.css?v=${version}">\n    <link rel="stylesheet" href="play.css?v=${version}">`)
        .replace(/<script src="hallway-audio\.js"><\/script>/, `<script src="play.js?v=${version}"></script>\n<script src="hallway-audio.js"></script>`)
        .replace(/<script src="editor\.js"><\/script>/, `<script src="editor.js?v=${version}"></script>`);
    if (!/play\.js/.test(html) || !/play\.css/.test(html)) throw new Error("Couldn't make play.html: index.html has changed");
    fs.writeFileSync(path.join(app, "play.html"), html.replace(/<title>[^<]*<\/title>/, "<title>The Hallway · Maze Rats</title>"));      // the visitors' page, not the editor (10 Nov scan, live 18)
    /* And the editor for the Warren: the same page, with the renderer running in the browser */
    require("./make-renderer.js").make(path.join(app, "renderer-worker.js"));
    let edit = fs.readFileSync(path.join(HERE, "index.html"), "utf8");
    edit = edit.replace("<!-- The Hallway editor. Local only: served by tools/hallway-editor/server.js, never published. -->", "<!-- The Hallway editor, for the Warren. Made by tools/hallway-editor/publish.js from the local editor's page: don't edit it here. -->")
        .replace(/<link rel="stylesheet" href="editor\.css">/, `<link rel="stylesheet" href="editor.css?v=${version}">`)
        .replace(/<script src="hallway-audio\.js"><\/script>/, `<script src="edit.js?v=${version}"></script>\n<script src="hallway-audio.js"></script>`)
        .replace(/<script src="editor\.js"><\/script>/, `<script src="editor.js?v=${version}"></script>`);
    if (!/edit\.js/.test(edit)) throw new Error("Couldn't make edit.html: index.html has changed");
    fs.writeFileSync(path.join(app, "edit.html"), edit);
    /* The swap (9 Nov scan, build 4): the live one is moved aside, not deleted, until the new one is in its place, so a rename
       Windows refuses (antivirus or the indexer holding a file just written) never leaves the site with neither. A refusal of
       that sort is tried again a few times; if the new one still won't go in, the old one goes back */
    for (const [fresh, name] of [[app, "app"], [liftNew, "lift"]]) {
        const live = path.join(OUT, name), old = path.join(OUT, name + ".old");
        if (!fs.existsSync(live) && fs.existsSync(old)) renameRetry(old, live);      // a publish stopped dead mid-swap last time: its old one is the last good one
        fs.rmSync(old, { recursive: true, force: true });
        const hadLive = fs.existsSync(live);
        if (hadLive) renameRetry(live, old);
        try { renameRetry(fresh, live); } catch (e) { if (hadLive) renameRetry(old, live); throw e; }
        fs.rmSync(old, { recursive: true, force: true });
    }
    fs.writeFileSync(path.join(OUT, "map.json"), text);
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ version, tile: TILE, moods: MOODS, publishedAt: new Date().toISOString(), tiles }));
    return version;
}
if (!isMainThread) parentPort.postMessage(drawLight(workerData.mapFile, workerData.light, workerData.which));
else if (require.main === module) main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
module.exports = { main, liftFile, finish };

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
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const W = require("./render/hw3.js"), { encodePng } = require("../png-encode.js");
const HERE = __dirname, SITE = path.join(HERE, "..", ".."), OUT = path.join(SITE, "assets", "hallway");
const MOODS = ["day", "dusk", "night", "dawn"], TILE = 512;
/* what the page needs of the editor: its code, its look and its art, and not the tools that made them */
const APP = ["editor.js", "editor.css", "hallway-audio.js", "progress.js", "lift-sounds.js", "furni-parts.js", "wall-items.js", "colour-picker.js", "play.js", "play.css", "live-moving.js", "live-basement.js", "live-lost.js", "live-hunts.js", "live-xmas.js", "live-xmas-early.js", "hunts-editor.js", "edit.js", "render/edge-items.js", "render/rope-barrier.js", "rooms.css", "room-starter.js", "room-view.js", "rooms-editor.js"];

function copyDir(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
        const a = path.join(from, e.name), b = path.join(to, e.name);
        if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
    }
}
/* black, or the shade the renderer leaves past the picture's edge */
function isBlank(d) { for (let i = 0; i < d.length; i += 4) if ((d[i] || d[i + 1] || d[i + 2]) && !(d[i] === 7 && d[i + 1] === 6 && d[i + 2] === 10)) return false; return true; }
const liftFile = (way, f) => encodeURIComponent(way).replace(/%/g, "_") + "-" + f + ".png";

function main() {
    const mapFile = process.argv[2] || path.join(HERE, "map.json"), text = fs.readFileSync(mapFile, "utf8"), load = () => JSON.parse(text), map = load();
    /* The names are locked to their doors in the map, so the live list isn't needed, except for a map from before that */
    const names = W.H.names2();
    fs.mkdirSync(path.join(OUT, "tiles"), { recursive: true });
    /* New things go in beside the old, and swap in at the end: a publish that fails part way leaves the last good one whole */
    const LIFT_NEW = path.join(OUT, "lift.new"), APP_NEW = path.join(OUT, "app.new");
    fs.rmSync(LIFT_NEW, { recursive: true, force: true }); fs.rmSync(APP_NEW, { recursive: true, force: true }); fs.mkdirSync(LIFT_NEW, { recursive: true });
    const tiles = {}, used = new Set(), total = MOODS.length + 1, onlyBasement = require("./furni-parts.js").basementTiles(load());
    let done = 0;
    const hasXmas = load().levels.some(l => (l.props || []).some(p => /^(xmas|gift\d|snowman)/.test(p.k)) || (l.wallItems || []).some(q => /^i_(garland|window|bunting|festoon|wreath|stockings|holly|canes)/.test(q.k)));
    for (const light of [...MOODS, "failing", ...(hasXmas ? MOODS.map(m => m + "+x") : [])]) {
        const world = W.build({ map: load(), names, light }), b = world.b, o = world.at(0, 0, 0);
        /* A square of the editor's picture is tile-sized in map pixels, counted from the map's origin, which the whole picture has moved */
        const tx0 = Math.floor(-o[0] / TILE), ty0 = Math.floor(-o[1] / TILE), tx1 = Math.ceil((b.w - o[0]) / TILE), ty1 = Math.ceil((b.h - o[1]) / TILE);
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
            if (light === "failing" && !onlyBasement.has(tx + "," + ty)) continue;
            const v = b.crop(o[0] + tx * TILE, o[1] + ty * TILE, TILE, TILE); if (isBlank(v.d)) continue;
            const px = Buffer.from(v.d); for (let i = 0; i < px.length; i += 4) { if (px[i] === 7 && px[i + 1] === 6 && px[i + 2] === 10) px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = 255; }
            const png = encodePng(TILE, TILE, px), hash = crypto.createHash("sha1").update(png).digest("hex").slice(0, 20), name = hash + ".png", file = path.join(OUT, "tiles", name);
            if (!fs.existsSync(file)) fs.writeFileSync(file, png);
            used.add(name); tiles[light + "|" + tx + "," + ty] = name;
        }
        done++; console.log(`progress ${done} of ${total + 1}`);
    }
    /* Christmas keeps only what it changes; the page falls back on the plain square */
    for (const k of Object.keys(tiles)) { if (!k.includes("+x|")) continue; if (tiles[k] === tiles[k.replace("+x", "")]) delete tiles[k]; }
    /* The lift's doors, in each floor's colours */
    const ways = new Set(map.levels.map(l => l.colour ? "hex:" + l.colour : l.way));
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
    for (const f of APP) fs.copyFileSync(path.join(HERE, f), path.join(app, f));
    copyDir(path.join(HERE, "art"), path.join(app, "art"));
    const version = finish(text, tiles, app, LIFT_NEW);
    /* Only now are the pictures nothing names any more taken away */
    for (const f of fs.readdirSync(path.join(OUT, "tiles"))) if (!used.has(f)) fs.unlinkSync(path.join(OUT, "tiles", f));
    console.log(`progress ${total + 1} of ${total + 1}`);
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
    fs.writeFileSync(path.join(app, "play.html"), html);
    /* And the editor for the Warren: the same page, with the renderer running in the browser */
    require("./make-renderer.js").make(path.join(app, "renderer-worker.js"));
    let edit = fs.readFileSync(path.join(HERE, "index.html"), "utf8");
    edit = edit.replace("<!-- The Hallway editor. Local only: served by tools/hallway-editor/server.js, never published. -->", "<!-- The Hallway editor, for the Warren. Made by tools/hallway-editor/publish.js from the local editor's page: don't edit it here. -->")
        .replace(/<link rel="stylesheet" href="editor\.css">/, `<link rel="stylesheet" href="editor.css?v=${version}">`)
        .replace(/<script src="hallway-audio\.js"><\/script>/, `<script src="edit.js?v=${version}"></script>\n<script src="hallway-audio.js"></script>`)
        .replace(/<script src="editor\.js"><\/script>/, `<script src="editor.js?v=${version}"></script>`);
    if (!/edit\.js/.test(edit)) throw new Error("Couldn't make edit.html: index.html has changed");
    fs.writeFileSync(path.join(app, "edit.html"), edit);
    for (const [fresh, name] of [[app, "app"], [liftNew, "lift"]]) { const live = path.join(OUT, name); fs.rmSync(live, { recursive: true, force: true }); fs.renameSync(fresh, live); }
    fs.writeFileSync(path.join(OUT, "map.json"), text);
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ version, tile: TILE, moods: MOODS, publishedAt: new Date().toISOString(), tiles }));
    return version;
}
if (require.main === module) main();
module.exports = { main, liftFile };

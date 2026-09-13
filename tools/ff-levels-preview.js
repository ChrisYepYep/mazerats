/* Draws a Fallin' Furni level to a PNG so it can be looked at without
   playing five rounds to reach it.

   This is a REVIEWER'S picture, not the game's. The floor and walls are flat
   colour out of js/room-patterns.js rather than the client's stencils,
   because what needs checking here is the SHAPE of a room — where the host
   nook is, whether the queue reaches the door, whether the drop zone is clear
   — and a plain floor shows that better than a patterned one. The furni is
   the real thing, composed from js/furni-library.js exactly as the room
   composes it, because that is the half that can be wrong.

     the yellow outline   the drop zone
     the green tile       where the player starts
     the red tiles        floor the decor blocks

   usage:
     node tools/ff-levels-preview.js                    every level, one sheet
     node tools/ff-levels-preview.js --only 6,7,8       just those
     node tools/ff-levels-preview.js --out preview.png
     node tools/ff-levels-preview.js --scale 2
     node tools/ff-levels-preview.js --from levels.json   draw a file instead of
                                                          the database, so a
                                                          design can be looked
                                                          at before it is
                                                          written
*/

const fs = require("fs");
const path = require("path");
const { decodePng } = require("./png-decode.js");
const { encodePng } = require("./png-encode.js");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i > -1 ? argv[i + 1] : d; };
const ONLY = opt("only") ? new Set(opt("only").split(",").map(Number)) : null;
const OUT = opt("out", path.join(__dirname, ".cache", "levels-preview.png"));
const SCALE = Number(opt("scale", 2));
const SITE = opt("site", "http://localhost:8888");

global.window = {};
require(path.join(__dirname, "..", "js", "room-layouts.js"));
require(path.join(__dirname, "..", "js", "room-patterns.js"));
eval(fs.readFileSync(path.join(__dirname, "..", "js", "furni-library.js"), "utf8"));
const LAYOUTS = global.window.RoomLayouts;
const PATTERNS = global.window.RoomPatterns;
const LIB = global.window.FurniLibrary;
const baseClass = (c) => String(c).replace(/\*\d+$/, "");

/* See the note in ff-levels-build.js: a footprint turns with the FACING a
   rotation resolves to, not with the parity of the rotation index. */
const MIRROR_OF = (d) => (6 - d + 8) % 8;
function facingOf(className, rotation) {
    const rec = LIB[baseClass(className)];
    if (!rec || !rec.s) return null;
    const byState = rec.s[0] || rec.s[Object.keys(rec.s)[0]];
    const drawn = Object.keys(byState).map(Number).sort((a, b) => a - b);
    if (!drawn.length) return null;
    const list = drawn.concat(drawn.slice().reverse().map(MIRROR_OF));
    return list[(Number(rotation) || 0) % list.length];
}

const TW = 64, TH = 32, HW = 32, HH = 16, WALL = 96;

const cache = new Map();
const sprite = (file) => {
    if (!cache.has(file)) {
        try { const d = decodePng(fs.readFileSync(path.join(__dirname, "..", "assets", "furni", file))); cache.set(file, { w: d.w, h: d.h, data: d.rgba }); }
        catch { cache.set(file, null); }
    }
    return cache.get(file);
};

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
function colourOf(kind, pattern, id, fallback) {
    const list = PATTERNS[kind] || [];
    const p = list.find(q => q.id === pattern) || list[0];
    const c = (p && (p.colours || []).find(q => q.id === id)) || (p && p.colours && p.colours[0]);
    return c && /^#[0-9a-f]{6}$/i.test(c.rgb) ? hex(c.rgb) : fallback;
}

/* The same projection the room uses: a tile's centre is
   ((x - y) * HALF_W, (x + y) * HALF_H) from the room's origin. */
function render(level, meta) {
    const model = LAYOUTS.get(level.model || "a");
    const cols = model.cols, rows = model.rows;
    const originX = rows * HW + 40;
    const W = (cols + rows) * HW + 80;
    const H = (cols + rows) * HH + WALL + 90;
    const originY = WALL + 40;

    const px = Buffer.alloc(W * H * 4);
    const bg = [26, 25, 31];
    for (let i = 0; i < W * H; i++) { px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255; }
    const put = (x, y, c, a) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const o = (y * W + x) * 4, f = (a === undefined ? 255 : a) / 255;
        px[o] = px[o] * (1 - f) + c[0] * f;
        px[o + 1] = px[o + 1] * (1 - f) + c[1] * f;
        px[o + 2] = px[o + 2] * (1 - f) + c[2] * f;
    };
    const centre = (tx, ty) => [originX + (tx - ty) * HW, originY + (tx + ty) * HH];

    const floorCol = colourOf("floors", level.floor?.pattern, level.floor?.colour, [200, 186, 148]);
    const wallCol = colourOf("walls", level.wall?.pattern, level.wall?.colour, [190, 190, 200]);
    const isFloor = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && model.mask[y][x] === "0";

    // walls: a band behind the top-left and top-right edges of the floor
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (!isFloor(x, y)) continue;
        const [cx, cy] = centre(x, y);
        if (!isFloor(x, y - 1)) for (let i = 0; i < WALL; i++)
            for (let dx = -HW; dx < 0; dx++) {
                const t = Math.abs(dx) / HW;
                put(cx + dx, cy - Math.round(HH * (1 - t)) - i, wallCol);
            }
        if (!isFloor(x - 1, y)) for (let i = 0; i < WALL; i++)
            for (let dx = 0; dx < HW; dx++) {
                const t = dx / HW;
                put(cx + dx, cy - Math.round(HH * t) - i, wallCol.map(v => Math.round(v * 0.82)));
            }
    }

    // what the decor blocks, for the red tint
    const blocked = new Set();
    for (const d of level.decor || []) {
        const m = meta[d.className] || {};
        if (m.stand) continue;
        const swap = facingOf(d.className, d.rotation) === 2 || facingOf(d.className, d.rotation) === 6;
        const fw = swap ? (m.y || 1) : (m.x || 1), fh = swap ? (m.x || 1) : (m.y || 1);
        for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) blocked.add(`${d.x + dx},${d.y + dy}`);
    }
    const zone = (level.zones || [])[0]?.area;
    const inZone = (x, y) => zone && x >= zone.x && y >= zone.y && x < zone.x + zone.w && y < zone.y + zone.h;

    // floor diamonds
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (!isFloor(x, y)) continue;
        const [cx, cy] = centre(x, y);
        let col = floorCol;
        if (blocked.has(`${x},${y}`)) col = [Math.min(255, floorCol[0] + 60), Math.round(floorCol[1] * 0.6), Math.round(floorCol[2] * 0.6)];
        else if (inZone(x, y)) col = [Math.min(255, floorCol[0] + 22), Math.min(255, floorCol[1] + 16), Math.round(floorCol[2] * 0.8)];
        if (level.start && level.start.x === x && level.start.y === y) col = [70, 210, 130];
        for (let dy = -HH; dy < HH; dy++) {
            const span = HW - Math.abs(dy) * 2;
            for (let dx = -span; dx < span; dx++) {
                const edge = span - Math.abs(dx) <= 2;
                put(cx + dx, cy + dy, edge ? col.map(v => Math.round(v * 0.86)) : col);
            }
        }
    }
    // zone border
    if (zone) for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) {
        if (!isFloor(x, y)) continue;
        const edge = x === zone.x || y === zone.y || x === zone.x + zone.w - 1 || y === zone.y + zone.h - 1;
        if (!edge) continue;
        const [cx, cy] = centre(x, y);
        for (let dy = -HH; dy < HH; dy++) {
            const span = HW - Math.abs(dy) * 2;
            for (const dx of [-span, span - 1]) put(cx + dx, cy + dy, [255, 210, 74]);
        }
    }

    // furni, back to front
    const drawList = [];
    for (const d of level.decor || []) {
        const cls = baseClass(d.className);
        const rec = LIB[cls];
        if (!rec) continue;
        const states = rec.s[d.state] || rec.s[0] || rec.s[Object.keys(rec.s)[0]];
        if (!states) continue;
        const drawn = Object.keys(states).map(Number).sort((a, b) => a - b);
        const list = drawn.map(dd => ({ dir: dd, mirror: false })).concat(drawn.slice().reverse().map(dd => ({ dir: dd, mirror: true })));
        const v = list[(Number(d.rotation) || 0) % list.length];
        const box = states[v.dir];
        if (!box) continue;
        const ax = v.mirror ? box.w - box.ax - TW : box.ax;
        const [cx, cy] = centre(d.x, d.y);
        drawList.push({ d, box, ax, mirror: v.mirror, dir: v.dir, state: d.state || 0,
            ox: Math.round(cx - HW - ax), oy: Math.round(cy - box.ay), depth: d.x + d.y });
    }
    drawList.sort((a, b) => a.depth - b.depth);
    /* A GLOW IS NOT A BLACK BOX. A part the class's .props marks ink 33 — a
       lamp's light, a candle's halo — is drawn ADDITIVELY, so its black
       contributes nothing and only the light lands. Painted normally it is a
       dark rectangle sat over the room, which is exactly what the first run of
       this showed for every lit candelabra and oil lamp. js/room-furni.js has
       the same rule; the library carries the parts as `add`. */
    const add = (x, y, c, a) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const o = (y * W + x) * 4, f = (a === undefined ? 255 : a) / 255;
        px[o] = Math.min(255, px[o] + c[0] * f);
        px[o + 1] = Math.min(255, px[o + 1] + c[1] * f);
        px[o + 2] = Math.min(255, px[o + 2] + c[2] * f);
    };
    for (const it of drawList) {
        const rec = LIB[baseClass(it.d.className)];
        for (const p of it.box.p) {
            const s = sprite(`${baseClass(it.d.className)}_${p.f || `${it.state}_${it.dir}`}_${p.k}.png`);
            if (!s) continue;
            const glow = !!(rec && rec.add && rec.add[p.k]);
            const blend = (rec && rec.bl && rec.bl[p.k]) || 0;
            const bx = it.mirror ? it.ox + it.box.w - p.ox - p.w : it.ox + p.ox;
            for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
                const o = (y * s.w + x) * 4;
                if (!s.data[o + 3]) continue;
                const sx = it.mirror ? bx + (s.w - 1 - x) : bx + x;
                const a = blend ? s.data[o + 3] * blend / 100 : s.data[o + 3];
                const c = [s.data[o], s.data[o + 1], s.data[o + 2]];
                (glow ? add : put)(sx, it.oy + p.oy + y, c, a);
            }
        }
    }
    return { px, W, H };
}

(async () => {
    const meta = (await fetch(`${SITE}/.netlify/functions/furni-meta`).then(r => r.json())).items || {};
    const FROM = opt("from");
    const res = FROM ? JSON.parse(fs.readFileSync(FROM, "utf8"))
        : await fetch(`${SITE}/.netlify/functions/ff-levels`).then(r => r.json());
    const levels = (res.levels || res).filter(l => !ONLY || ONLY.has(l.order)).sort((a, b) => a.order - b.order);
    if (!levels.length) { console.log("no levels"); return; }

    const shots = levels.map(l => ({ l, img: render(l, meta) }));
    const COLS = Math.min(3, shots.length);
    const cw = Math.max(...shots.map(s => s.img.W)), ch = Math.max(...shots.map(s => s.img.H));
    const rows = Math.ceil(shots.length / COLS);
    const W = cw * COLS, H = ch * rows;
    const out = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { out[i * 4] = 18; out[i * 4 + 1] = 17; out[i * 4 + 2] = 22; out[i * 4 + 3] = 255; }
    shots.forEach((s, i) => {
        const gx = (i % COLS) * cw, gy = Math.floor(i / COLS) * ch;
        for (let y = 0; y < s.img.H; y++) for (let x = 0; x < s.img.W; x++) {
            const o = (y * s.img.W + x) * 4, d = ((gy + y) * W + gx + x) * 4;
            out[d] = s.img.px[o]; out[d + 1] = s.img.px[o + 1]; out[d + 2] = s.img.px[o + 2]; out[d + 3] = 255;
        }
    });

    const SW = W * SCALE, SH = H * SCALE;
    const big = Buffer.alloc(SW * SH * 4);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        const s = (Math.floor(y / SCALE) * W + Math.floor(x / SCALE)) * 4, d = (y * SW + x) * 4;
        big[d] = out[s]; big[d + 1] = out[s + 1]; big[d + 2] = out[s + 2]; big[d + 3] = 255;
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, encodePng(SW, SH, big));
    console.log(`${shots.length} levels -> ${OUT}  ${SW}x${SH}`);
    shots.forEach(s => console.log(`  ${s.l.order}. ${s.l.name} (${LAYOUTS.get(s.l.model || "a").name})`));
})();

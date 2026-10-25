/* The frozen HUD panel's icicles (css/fallinfurni.css, .ff-hud::after),
   drawn as pixel art for the panel's own width — every icicle placed once,
   so nothing repeats: a thin rim of melt-water ice along the bottom edge,
   and icicles growing from it in uneven clusters, each its own length and
   thickness, tapering to a point, lit from the left, some with a drop of
   water forming under the tip, smaller ones on the rounded corners.

   usage: node tools/ff-icicles.js [outDir]
     writes icicles.svg, icicles.uri.txt (paste into the CSS) and
     icicles-preview.png to outDir (default: the current folder) */
const fs = require("fs");
const path = require("path");
const out = process.argv[2] || ".";
const { encodePng } = require("./png-encode.js");

const W = 200, H = 24;          // the strip's canvas
const PX0 = 4, PX1 = 196;       // the panel's outer edges, across
const EDGE = 2;                 // the first row below the panel's bottom edge
const R = 8;                    // its corner radius

// A fixed seed, so the same icicles come out every time.
let seed = 0x1ce1c1e5;
function rand() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

/* Where the panel stops at column x: EDGE along the straight, rising round
   the corners. Null outside it. */
function edgeAt(x) {
    const cx = x + 0.5;
    if (cx < PX0 || cx > PX1) return null;
    let d = 0;
    if (cx < PX0 + R) d = PX0 + R - cx;
    else if (cx > PX1 - R) d = cx - (PX1 - R);
    return Math.round(EDGE - (R - Math.sqrt(Math.max(0, R * R - d * d))));
}

const px = Array.from({ length: H }, () => new Array(W).fill(null));
const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y][x] = c; };
const get = (x, y) => (x >= 0 && x < W && y >= 0 && y < H ? px[y][x] : null);

/* THE RIM: one to two pixels of ice along the edge, its lower line uneven
   — the water that ran down and froze before the icicles formed. */
const rimBottom = new Array(W).fill(null);
let rimDepth = 1;
for (let x = 0; x < W; x++) {
    const e = edgeAt(x);
    if (e === null) continue;
    if (rand() < 0.22) rimDepth = rimDepth === 1 ? 2 : 1;
    const inCorner = x < PX0 + R - 1 || x > PX1 - R;
    const depth = inCorner ? 1 : rimDepth;
    set(x, e - 1, "K");                         // frost over the border
    for (let k = 0; k < depth; k++) set(x, e + k, k === 0 ? "B" : "S");
    rimBottom[x] = e + depth;                   // the first row below the rim
}

/* THE ICICLES, walked along the edge with gaps of their own: mostly short,
   some middling, a few long — the long ones with smaller ones crowding
   them, as icicles grow where the drip is. */
const icicles = [];
let x = PX0 + 3;
while (x < PX1 - 3) {
    const corner = x < PX0 + R || x > PX1 - R - 1;
    const r = rand();
    let len = r < 0.5 ? 2 + Math.floor(rand() * 4)       // 2-5
        : r < 0.84 ? 6 + Math.floor(rand() * 4)           // 6-9
        : 10 + Math.floor(rand() * 7);                    // 10-16
    if (corner) len = Math.min(len, 2 + Math.floor(rand() * 3));
    const width = len >= 10 ? 3 : len >= 5 ? 2 : 1;
    icicles.push({ x, len, width, bead: len >= 7 && rand() < 0.35 });
    // A long one draws a short neighbour close beside it.
    if (len >= 8 && rand() < 0.7) {
        const nx = x + width + 1;
        if (nx < PX1 - 3) icicles.push({ x: nx, len: 2 + Math.floor(rand() * 4), width: 1, bead: false });
        x = nx + 2 + Math.floor(rand() * 4);
    } else {
        x += width + 1 + Math.floor(rand() * (r < 0.5 ? 6 : 8));
    }
}

for (const ic of icicles) {
    const top = Math.max(...Array.from({ length: ic.width }, (_, i) => rimBottom[ic.x + i] || 0));
    if (!top) continue;
    for (let k = 0; k < ic.len; k++) {
        // Tapering: full width near the root, a single pixel at the point.
        const w = Math.max(1, Math.round(ic.width * Math.pow(1 - k / ic.len, 0.75)));
        const x0 = ic.x + Math.floor((ic.width - w) / 2);
        const y = top + k;
        for (let i = 0; i < w; i++) {
            let c = "B";
            if (w >= 2 && i === 0) c = "K";              // the lit side
            if (w >= 2 && i === w - 1) c = "S";          // the shaded side
            if (w === 1) c = k < ic.len - 1 ? "S" : "T"; // a thin one, or the point
            if (k === ic.len - 1 && w === 1) c = "T";
            set(x0 + i, y, c);
        }
    }
    // A drop forming: one bright pixel, a pixel below the point, unoutlined.
    if (ic.bead) set(ic.x + Math.floor((ic.width - 1) / 2), top + ic.len + 1, "D");
}

/* THE OUTLINE, round every icicle that is more than a sliver: a cool blue,
   left, right and under the point. The rim is left open, so it reads as
   part of the panel rather than a separate shelf. */
const isIce = (c) => c && c !== "O" && c !== "D";
for (let y = EDGE; y < H; y++) {
    for (let x = 0; x < W; x++) {
        if (get(x, y)) continue;
        const e = edgeAt(x);
        if (e !== null && y < (rimBottom[x] || e)) continue;
        const nearThick = [[-1, 0], [1, 0], [0, -1]].some(([dx, dy]) => {
            const c = get(x + dx, y + dy);
            if (!isIce(c)) return false;
            // Only round icicles (below the rim), not along the rim itself.
            const rb = rimBottom[x + dx];
            return rb !== null && y + dy >= rb;
        });
        if (nearThick) set(x, y, "O");
    }
}

const C = {
    O: [92, 146, 186], K: [255, 255, 255], B: [222, 243, 255], S: [158, 210, 242], T: [191, 230, 255], D: [240, 251, 255]
};

// SVG: one path per colour, a rect per run along each row.
const paths = {};
for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
        const c = px[y][x];
        if (!c) { x++; continue; }
        let x2 = x;
        while (x2 + 1 < W && px[y][x2 + 1] === c) x2++;
        (paths[c] = paths[c] || []).push(`M${x} ${y}h${x2 - x + 1}v1h-${x2 - x + 1}z`);
        x = x2 + 1;
    }
}
const hex = (rgb) => "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("");
const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' shape-rendering='crispEdges'>` +
    Object.entries(paths).map(([c, d]) => `<path fill='${hex(C[c])}' d='${d.join("")}'/>`).join("") + "</svg>";
const uri = "data:image/svg+xml," + svg.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23");
fs.writeFileSync(path.join(out, "icicles.svg"), svg);
fs.writeFileSync(path.join(out, "icicles.uri.txt"), uri);

// Preview: the panel's bottom on the room's dark, six times over.
const S = 6, PH = 16;
const ph = PH + H;
const rgba = Buffer.alloc(W * S * ph * S * 4);
const put = (x, y, rgb) => {
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const o = (((y * S + j) * W * S) + (x * S + i)) * 4;
        rgba[o] = rgb[0]; rgba[o + 1] = rgb[1]; rgba[o + 2] = rgb[2]; rgba[o + 3] = 255;
    }
};
for (let y = 0; y < ph; y++) for (let x = 0; x < W; x++) {
    let rgb = [40, 30, 22];
    const e = edgeAt(x);
    // The panel above its bottom edge (rows before PH are the panel's body).
    if (e !== null && y - PH < e) rgb = y - PH === e - 1 ? [242, 251, 255] : [150, 208, 240];
    put(x, y, rgb);
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y][x]) put(x, y + PH, C[px[y][x]]);
fs.writeFileSync(path.join(out, "icicles-preview.png"), encodePng(W * S, ph * S, rgba));
console.log("icicles", icicles.length, "svg bytes", svg.length);

/* The coffee-filled HUD panel's pixel art (css/fallinfurni.css,
   .ff-hud-coffee): the crema on the coffee's surface, the same crema
   thinning and then gone to lace for the last seconds, and three wisps of
   steam. Each drawn once from a
   fixed seed, so no stretch of foam and no two wisps are the same.

   usage: node tools/ff-coffee.js [outDir] [--css css/fallinfurni.css]
     writes coffee-preview.png to outDir (default: the current folder) and,
     with --css, puts the new URIs into that file's --coffee-* lines. */
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const cssAt = args.indexOf("--css");
const cssPath = cssAt >= 0 ? args.splice(cssAt, 2)[1] : null;
const out = args[0] || ".";
const { encodePng } = require("./png-encode.js");

// A fixed seed, so the same art comes out every time.
let seed = 0xc0ffee42;
function rand() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

const C = {
    F: [246, 230, 196],     // foam lit from above
    L: [228, 196, 146],     // foam
    M: [205, 160, 104],     // foam in shade
    P: [168, 116, 66],      // a pore, or crema thinning into the coffee
    G: [255, 248, 226],     // a glint
    W: [255, 255, 255]      // steam (drawn with its own alpha)
};

/* THE CREMA: a strip wider than the panel, so it can sway a few pixels
   either way without an end showing. Row 2 is the coffee's surface; the
   foam's bumps rise at most two rows over it, never more than a pixel up
   or down a column, and nothing is ever drawn above them.

   ONE crema, dissolving in three stages as the coffee runs out (the
   owner's: "when it gets low and splits it looks a bit off"; the old broken
   strip was a different random layout swapped in at once, its islands
   standing proud of the surface with flecks floating over it):
     0  full: a thick foam, pores and glints;
     1  thinning: the bumps settle, the foam thins, and small holes open
        where the same noise is weakest, showing the coffee through;
     2  lace: the holes have grown into gaps, the foam lies flat in low
        islands with rounded ends, and a thin film of crema runs unbroken
        along the whole surface between them — so the surface line never
        breaks, the way a real cup's last foam clings on as a lace.
   Each stage is the one before with more taken away: the holes open where
   a fixed 2D noise is lowest, so the gaps of stage 2 grow out of the holes
   of stage 1 rather than appearing somewhere new. */
const CW = 212, CH = 6, SURFACE = 2;
const bumps = [];
{
    let h = 1;
    for (let x = 0; x < CW; x++) {
        const r = rand();
        if (r < 0.28) h = Math.min(2, h + 1); else if (r < 0.56) h = Math.max(0, h - 1);
        bumps.push(h);
    }
}
// Smooth value noise: random corners every 5 columns and 2 rows, blended.
const NX = 5, NY = 2;
const grid = Array.from({ length: Math.ceil(CH / NY) + 2 }, () =>
    Array.from({ length: Math.ceil(CW / NX) + 2 }, () => rand()));
function noise(x, y) {
    const gx = x / NX, gy = y / NY, ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy;
    const s = (t) => t * t * (3 - 2 * t);
    const a = grid[iy][ix], b = grid[iy][ix + 1], c = grid[iy + 1][ix], d = grid[iy + 1][ix + 1];
    return (a + (b - a) * s(fx)) + ((c + (d - c) * s(fx)) - (a + (b - a) * s(fx))) * s(fy);
}
// Per-pixel grain, fixed, so every stage agrees on its pores and glints.
const grain = Array.from({ length: CH }, () => Array.from({ length: CW }, () => rand()));

function crema(stage) {
    const px = Array.from({ length: CH }, () => new Array(CW).fill(null));
    const OPEN = [-1, 0.3, 0.6][stage];              // noise below this is a hole
    const maxBump = [2, 1, 0][stage];
    const depth = [CH - 1, CH - 2, SURFACE + 1][stage]; // the foam's lowest row
    const foam = (x, y) => {
        if (x < 0 || x >= CW) return false;
        const top = SURFACE - Math.min(bumps[x], maxBump);
        if (y < top || y > depth) return false;
        if (stage === 1) {
            /* Thinning: the top skin holds, and the holes open inside the
               foam under it — where the noise is weakest, and a scatter of
               single pores growing into pinholes. */
            if (y > SURFACE && (noise(x, y) < OPEN || grain[y][x] < 0.14)) return false;
            return true;
        }
        // Holes only at or under the surface, never notches in the bumps.
        if (y >= SURFACE && noise(x, y) < OPEN) return false;
        // Over a hole, the bump above it goes too.
        if (y < SURFACE && noise(x, SURFACE) < OPEN) return false;
        return true;
    };
    for (let x = 0; x < CW; x++) {
        for (let y = 0; y < CH; y++) {
            if (!foam(x, y)) continue;
            let c = "L";
            if (!foam(x, y - 1)) c = "F";                       // lit from above
            else if (!foam(x, y + 1)) c = "M";                  // its underside
            if (stage === 2 && (!foam(x - 1, y) || !foam(x + 1, y)) && c === "F") c = "L"; // an island's rounded end
            if (c === "L" && grain[y][x] < 0.07) c = "P";        // a pore
            px[y][x] = c;
        }
        // Thinning into the coffee: a ragged row under the foam.
        const under = depth + 1;
        if (under < CH && foam(x, depth)) {
            const g = grain[under][x];
            px[under][x] = g < 0.45 ? "P" : g < 0.6 ? "M" : null;
        }
        // The lace's film: crema left on the surface wherever the foam has gone.
        if (stage === 2 && !px[SURFACE][x]) px[SURFACE][x] = grain[SURFACE][x] < 0.18 ? "M" : "P";
    }
    // A sparkle of glints along the lit tops, fewer as it dies.
    for (let x = 3; x < CW; x += 9 + Math.floor(grain[0][x] * 14)) {
        if (stage === 2 && grain[1][x] < 0.5) continue;
        for (let y = 0; y < CH; y++) if (px[y][x] === "F") { px[y][x] = "G"; break; }
    }
    return px;
}

/* STEAM: a 1px wisp curling up from the cup's rim, a sine of its own
   phase and sway, thinning as it rises — each pixel's alpha falls with
   height, and the top third breaks into separate puffs. */
const SW = 9, SH = 11;
function steam(phase, sway) {
    const px = Array.from({ length: SH }, () => new Array(SW).fill(null));
    let prev = null;
    for (let y = SH - 1; y >= 0; y--) {
        const up = (SH - 1 - y) / (SH - 1);
        // A full S over its height, swinging wider as it rises.
        const x = Math.round(4 + sway * Math.sin(phase + up * Math.PI * 2.1) * (0.45 + 0.75 * up));
        if (up > 0.66 && (y + Math.round(phase)) % 3 === 0) { prev = null; continue; } // a break near the top
        const a = +(0.8 - 0.55 * up).toFixed(2);
        px[y][Math.max(0, Math.min(SW - 1, x))] = { c: "W", a };
        // A swing of two pixels in one row gets the pixel between, so the line never breaks.
        if (prev !== null && Math.abs(x - prev) > 1) px[y][(x + prev) >> 1] = { c: "W", a };
        prev = x;
        // Thicker near the rim: a fainter pixel beside the lowest few.
        if (up < 0.3) {
            const nx = x + (Math.sin(phase + up * 5) > 0 ? 1 : -1);
            if (nx >= 0 && nx < SW) px[y][nx] = { c: "W", a: +(a * 0.45).toFixed(2) };
        }
    }
    return px;
}

const hex = (rgb) => "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("");
function toSvg(px) {
    const H = px.length, W = px[0].length;
    const paths = {};
    for (let y = 0; y < H; y++) {
        let x = 0;
        while (x < W) {
            const p = px[y][x];
            if (!p) { x++; continue; }
            const key = typeof p === "string" ? p : `${p.c}@${p.a}`;
            let x2 = x;
            const same = (q) => q && (typeof q === "string" ? q : `${q.c}@${q.a}`) === key;
            while (x2 + 1 < W && same(px[y][x2 + 1])) x2++;
            (paths[key] = paths[key] || []).push(`M${x} ${y}h${x2 - x + 1}v1h-${x2 - x + 1}z`);
            x = x2 + 1;
        }
    }
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' shape-rendering='crispEdges'>` +
        Object.entries(paths).map(([k, d]) => {
            const [c, a] = k.split("@");
            return `<path fill='${hex(C[c])}'${a ? ` fill-opacity='${a}'` : ""} d='${d.join("")}'/>`;
        }).join("") + "</svg>";
}
const uriOf = (svg) => "data:image/svg+xml," +
    svg.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23");

const art = {
    "crema": crema(0),
    "crema-thin": crema(1),
    "crema-lace": crema(2),
    "steam-a": steam(0.4, 1.4),
    "steam-b": steam(2.3, 1.9),
    "steam-c": steam(4.1, 1.1)
};

if (cssPath) {
    let css = fs.readFileSync(cssPath, "utf8");
    for (const [name, px] of Object.entries(art)) {
        const re = new RegExp(`(--coffee-${name}: )url\\("[^"]*"\\);`);
        if (!re.test(css)) throw new Error(`no --coffee-${name} line in ${cssPath}`);
        css = css.replace(re, `$1url("${uriOf(toSvg(px))}");`);
    }
    fs.writeFileSync(cssPath, css);
    console.log("wrote the URIs into", cssPath);
}

// Preview: each piece on the coffee, six times over, stacked.
const S = 6, BG = [92, 52, 24], DARK = [26, 18, 11];
const rows = Object.values(art);
const PW = CW + 4, PH = rows.reduce((n, px) => n + px.length + 3, 1);
const rgba = Buffer.alloc(PW * S * PH * S * 4);
const put = (x, y, rgb, a = 1) => {
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const o = (((y * S + j) * PW * S) + (x * S + i)) * 4;
        for (let k = 0; k < 3; k++) rgba[o + k] = Math.round(rgba[o + k] * (1 - a) + rgb[k] * a);
        rgba[o + 3] = 255;
    }
};
let oy = 1;
for (const [name, px] of Object.entries(art)) {
    // The crema as it sits: the panel's dark above the surface, coffee below.
    const steamy = name.startsWith("steam");
    for (let y = -1; y < px.length + 1; y++) for (let x = 0; x < PW; x++) put(x, oy + y, steamy || y < SURFACE ? DARK : BG);
    for (let y = 0; y < px.length; y++) for (let x = 0; x < px[0].length; x++) {
        const p = px[y][x];
        if (p) put(x + 2, oy + y, C[typeof p === "string" ? p : p.c], typeof p === "string" ? 1 : p.a);
    }
    oy += px.length + 3;
}
fs.writeFileSync(path.join(out, "coffee-preview.png"), encodePng(PW * S, PH * S, rgba));
console.log("preview", path.join(out, "coffee-preview.png"));

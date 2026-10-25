/* The frozen HUD panel's snow cap (css/fallinfurni.css, .ff-hud::before),
   drawn as pixel art from a height field: an SVG data URI for the CSS, and an
   enlarged PNG preview of it on a slice of the panel.

   usage: node tools/ff-snowcap.js [outDir]
     writes snowcap.svg, snowcap.uri.txt (paste into the CSS) and
     snowcap-preview.png to outDir (default: the current folder) */
const fs = require("fs");
const path = require("path");
const out = process.argv[2] || ".";
const { encodePng } = require("./png-encode.js");

const W = 200, H = 22;          // the cap's canvas
const PX0 = 4, PX1 = 196;       // the panel's outer edges, across
const EDGE = 10;                // the panel's top edge, down
const R = 8;                    // its corner radius

// The panel's top boundary at column x (following the rounded corners).
function edgeAt(x) {
    const cx = x + 0.5;
    if (cx < PX0 + R) { const d = PX0 + R - cx; return EDGE + R - Math.sqrt(Math.max(0, R * R - d * d)); }
    if (cx > PX1 - R) { const d = cx - (PX1 - R); return EDGE + R - Math.sqrt(Math.max(0, R * R - d * d)); }
    return EDGE;
}

// The drift's depth: a few long swells and short lumps, tapered at the ends.
const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const depth = [];
for (let x = 0; x < W; x++) {
    if (x < PX0 || x >= PX1) { depth.push(0); continue; }
    const u = x - PX0;
    let h = 5.2
        + 2.4 * Math.sin(u / 192 * Math.PI * 2 * 2.3 + 0.6)
        + 1.5 * Math.sin(u / 192 * Math.PI * 2 * 5.1 + 2.1)
        + 0.8 * Math.sin(u / 192 * Math.PI * 2 * 11.7 + 0.3);
    const ends = Math.min(smooth((u + 1) / 16), smooth((192 - u) / 16));
    h = 1 + (h - 1) * ends;
    depth.push(Math.max(1, Math.round(h)));
}
// No step steeper than two pixels, so the silhouette reads as drifted snow.
for (let pass = 0; pass < 3; pass++) {
    for (let x = 1; x < W; x++) {
        if (depth[x] - depth[x - 1] > 2) depth[x] = depth[x - 1] + 2;
        if (depth[x - 1] - depth[x] > 2) depth[x - 1] = depth[x] + 2;
    }
}

/* Drips over the edge, by centre and length: three wide where they leave the
   edge, narrowing to a point. None now (25 Oct 2026): on the panel's pale
   top they lost their white and showed only as outlined "v"s, and the
   icicles under the panel (tools/ff-icicles.js) do that job. */
const DRIP_CENTRES = [];
const drip = new Map();
for (const [c, len] of DRIP_CENTRES) {
    drip.set(c, Math.max(drip.get(c) || 0, len));
    for (const side of [c - 1, c + 1]) drip.set(side, Math.max(drip.get(side) || 0, Math.ceil(len / 2)));
}

// The grid: which pixels are snow.
const snow = Array.from({ length: H }, () => new Array(W).fill(false));
const top = new Array(W).fill(null), bottom = new Array(W).fill(null);
for (let x = PX0; x < PX1; x++) {
    const e = Math.round(edgeAt(x));
    const t = e - depth[x];
    const b = e + 1 + (drip.get(x) || 0);
    top[x] = t; bottom[x] = b;
    for (let y = Math.max(0, t); y <= Math.min(H - 1, b); y++) snow[y][x] = true;
}

// Colours: outline, crest, body, shade, deep shade, glint.
const C = {
    O: [92, 146, 186], K: [255, 255, 255], B: [232, 246, 255], S: [196, 228, 247], D: [160, 207, 237], G: [255, 255, 255]
};
const px = Array.from({ length: H }, () => new Array(W).fill(null));
const isSnow = (x, y) => x >= 0 && x < W && y >= 0 && y < H && snow[y][x];
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        if (snow[y][x]) {
            const t = top[x], e = Math.round(edgeAt(x));
            let c = "B";
            if (y === t) c = "K";                                   // the crest catches the light
            else if (y === t + 1 && !isSnow(x - 1, y - 1)) c = "K"; // and its left-facing side
            // A right-facing drop in the drift is in shadow.
            if (c === "B" && !isSnow(x + 1, y) && y > t) c = "S";
            // A sparse sparkle of lighter grains through the body.
            if (c === "B" && ((x * 7 + y * 13) % 23 === 0)) c = "K";
            if (y === e - 1 && c === "B") c = "S";                  // its underside, sitting on the panel
            if (y >= e) c = "S";                                    // over the panel's edge
            if (y > e + 1) c = "K";                                 // a drip: bright snow, hanging
            if (y > e + 1 && !isSnow(x + 1, y)) c = "S";            // its shaded right side
            if (y === bottom[x] && y > e + 1 && drip.has(x) && !drip.has(x - 1)) c = "S";
            px[y][x] = c;
        } else if (isSnow(x, y + 1) || isSnow(x - 1, y) || isSnow(x + 1, y) || isSnow(x, y - 1)) {
            /* Outline round the drift above the panel's edge, and round the
               drips below it — never a line along the whole underside, which
               would sit on the ice as a stripe. */
            const e = Math.round(edgeAt(x));
            const underDrip = isSnow(x, y - 1) && (drip.get(x) || 0) > 0;
            const besideDrip = y > e + 1 &&
                ((isSnow(x - 1, y) && (drip.get(x - 1) || 0) > 0) || (isSnow(x + 1, y) && (drip.get(x + 1) || 0) > 0));
            if (y < e || underDrip || besideDrip) px[y][x] = "O";
        }
    }
}
// Glints: a few crest pixels, and two little cross sparkles just above.
for (const x of [24, 61, 118, 158, 183]) if (top[x] != null) px[top[x]][x] = "G";
for (const [x, dy] of [[80, 3], [150, 2]]) {
    const y = top[x] - dy - 1;
    if (y - 1 >= 0) for (const [ax, ay] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (!px[y + ay][x + ax]) px[y + ay][x + ax] = "G";
}

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
fs.writeFileSync(path.join(out, "snowcap.svg"), svg);
fs.writeFileSync(path.join(out, "snowcap.uri.txt"), uri);

// Preview: the cap on a slice of the frozen panel, six times over.
const S = 6, PH = 40;
const pw = W, ph = H + PH;
const rgba = Buffer.alloc(pw * S * ph * S * 4);
const put = (x, y, rgb) => {
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const o = (((y * S + j) * pw * S) + (x * S + i)) * 4;
        rgba[o] = rgb[0]; rgba[o + 1] = rgb[1]; rgba[o + 2] = rgb[2]; rgba[o + 3] = 255;
    }
};
for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    // Backdrop: the room's dark, then the panel's ice below its edge.
    let rgb = [40, 30, 22];
    if (x >= PX0 && x < PX1 && y >= edgeAt(x)) {
        const t = Math.min(1, (y - EDGE) / PH);
        rgb = [Math.round(214 - 64 * t), Math.round(242 - 34 * t), Math.round(255 - 15 * t)];
        if (y < Math.round(edgeAt(x)) + 1) rgb = [242, 251, 255];
    }
    put(x, y, rgb);
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y][x]) put(x, y, C[px[y][x]]);
fs.writeFileSync(path.join(out, "snowcap-preview.png"), encodePng(pw * S, ph * S, rgba));
console.log("svg bytes", svg.length, "uri bytes", uri.length);

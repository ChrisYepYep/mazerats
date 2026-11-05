/* Mock-up renderer for the archive hallway. Pure pixel work in Node. */
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "../../..").replace(/\\/g, "/") + "/";
const { readPng } = require(R + "tools/png-decode.js");
const { encodePng } = require(R + "tools/png-encode.js");
const S = path.resolve(__dirname, "../art").replace(/\\/g, "/");
const PIECES = S + "/hall/hh_room_hallway/";

const cache = {};
const piece = n => cache[n] || (cache[n] = readPng(PIECES + n + ".png"));
const load = p => cache[p] || (cache[p] = readPng(p));
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

class Buf {
    constructor(w, h, c) {
        this.w = w; this.h = h; this.d = Buffer.alloc(w * h * 4);
        const [r, g, b] = hex(c || "000000");
        for (let i = 0; i < w * h; i++) { this.d[i * 4] = r; this.d[i * 4 + 1] = g; this.d[i * 4 + 2] = b; this.d[i * 4 + 3] = 255; }
    }
    set(x, y, c) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const p = (y * this.w + x) * 4; this.d[p] = c[0]; this.d[p + 1] = c[1]; this.d[p + 2] = c[2];
    }
    get(x, y) { const p = (y * this.w + x) * 4; return [this.d[p], this.d[p + 1], this.d[p + 2]]; }
    rect(x, y, w, h, c) { const k = typeof c === "string" ? hex(c) : c; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, k); }
    blit(im, x0, y0, o) {
        o = o || {};
        const sc = o.scale || 1, w = im.w, h = im.h;
        const dw = im.d ? 0 : 0;
        const src = im.rgba;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const sx = o.flip ? w - 1 - x : x;
            const s = (y * w + sx) * 4;
            if (src[s + 3] < 128) continue;
            for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) this.set(x0 + x * sc + b, y0 + y * sc + a, [src[s], src[s + 1], src[s + 2]]);
        }
    }
    crop(x, y, w, h) {
        const o = new Buf(w, h, "07060a");
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const X = x + i, Y = y + j;
            if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
            o.set(i, j, this.get(X, Y));
        }
        return o;
    }
    paste(b, x, y, sc) {
        sc = sc || 1;
        for (let j = 0; j < b.h * sc; j++) for (let i = 0; i < b.w * sc; i++) this.set(x + i, y + j, b.get(Math.floor(i / sc), Math.floor(j / sc)));
    }
    /* box-averaged shrink, only ever for the whole-hallway overviews */
    shrink(n) {
        const o = new Buf(Math.floor(this.w / n), Math.floor(this.h / n));
        for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) {
            let r = 0, g = 0, b = 0;
            for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) { const k = this.get(i * n + c, j * n + a); r += k[0]; g += k[1]; b += k[2]; }
            o.set(i, j, [r / (n * n), g / (n * n), b / (n * n)]);
        }
        return o;
    }
    /* Scale2x (EPX): a clean double of pixel art */
    scale2x() {
        const o = new Buf(this.w * 2, this.h * 2);
        const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            const P = this.get(x, y);
            const A = y > 0 ? this.get(x, y - 1) : P, B = x < this.w - 1 ? this.get(x + 1, y) : P, C = x > 0 ? this.get(x - 1, y) : P, D = y < this.h - 1 ? this.get(x, y + 1) : P;
            let e0 = P, e1 = P, e2 = P, e3 = P;
            if (!eq(C, B) && !eq(A, D)) {
                if (eq(C, A)) e0 = A; if (eq(A, B)) e1 = B; if (eq(C, D)) e2 = C; if (eq(D, B)) e3 = B;
            }
            o.set(x * 2, y * 2, e0); o.set(x * 2 + 1, y * 2, e1); o.set(x * 2, y * 2 + 1, e2); o.set(x * 2 + 1, y * 2 + 1, e3);
        }
        return o;
    }
    save(p) { fs.writeFileSync(p, encodePng(this.w, this.h, this.d)); }
}

/* ---------- fonts ---------- */
const dump = fs.readFileSync(S + "/fontdump.html", "latin1");
const m = /<pre id="o">([\s\S]*?)<\/pre>/.exec(dump);
const VOL = JSON.parse(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
function textW(s, f) { let w = 0; for (const ch of s) w += (VOL[f || "v"][ch] || VOL.v[" "]).w; return w; }
function text(buf, s, x, y, c, o) {
    o = o || {}; const f = o.font || "v", sc = o.scale || 1, k = typeof c === "string" ? hex(c) : c;
    if (o.center) x -= Math.round(textW(s, f) * sc / 2);
    for (const ch of s) {
        const g = VOL[f][ch] || VOL.v[" "];
        g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) buf.set(x + (i - 1) * sc + b, y + (j - 2) * sc + a, k); });
        x += g.w * sc;
    }
    return x;
}

/* The little 3x5 capitals for half-scale signs */
const F3 = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100", G: "011100101101011",
    H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101",
    O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010", U: "101101101101111",
    V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010", Z: "111001010100111",
    0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110", 4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
    " ": "000000000000000", "%": "101001010100101", "(": "010100100100010", ")": "010001001001010", ".": "000000000000010", ",": "000000000010100", "?": "110001010000010", "$": "011110010011110", "!": "010010010000010", "'": "010010000000000", "-": "000000111000000", "_": "000000000000111"
};

/* ---------- geometry ---------- */
const TW = 32, TH = 16;
class World {
    constructor(cfg) {
        this.cfg = cfg;
        const L = cfg.L, W = cfg.W, A = cfg.A || 0;
        this.ox = (W + A + 10) * 16 + 40; this.oy = (A + 10) * 8 + 170;
        const w = (L + W + 2 * A + 20) * 16 + 80, h = (L + W + 2 * A + 20) * 8 + 300;
        this.b = new Buf(w, h, cfg.void || "07060a");
        this.floorMask = new Uint8Array(w * h);
        this.sprites = []; this.post = []; this.lamps = [];
    }
    S(x, y) { return [Math.round((x - y) * 16) + this.ox, Math.round((x + y) * 8) + this.oy]; }
    /* a point on a wall along x at depth y, h px up: u is px across from x */
    WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; }
    /* a point on a wall along y at x (faces +x); u px across going -> up-right from (x,y) */
    WY(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] - Math.floor(u / 2) - h]; }
    isCross(X) { return (this.cfg.cross || []).find(c => X >= c && X < c + this.cfg.C); }
    tileIn(X, Y) {
        const c = this.cfg, L = c.L, W = c.W;
        if (X < 0 || X >= L) return false;
        if (Y >= 0 && Y < W) return true;
        if (c.A && this.isCross(X) !== undefined && Y >= -c.A && Y < W + c.A) return true;
        return false;
    }
}

const srcStraightX = piece("floor_mat_straight");
const srcStraightY = piece("floor_mat_straight");
const srcCross = piece("floor_mat_middle_crossroad");
const srcPlain = piece("floor_plain_tiles");

function modPx(im, flip, mx, my, dx, dy) {
    /* apex of the 8x8 module at (129,0) in the piece, tile pos (mx,my) */
    const px = (mx - my) * 16 + 128 + dx, py = (mx + my) * 8 + dy;
    const sx = flip ? im.w - 1 - px - (im.w - 257 - 1) : px;
    if (sx < 0 || py < 0 || sx >= im.w || py >= im.h) return null;
    const s = (py * im.w + sx) * 4;
    if (im.rgba[s + 3] < 128) return null;
    return [im.rgba[s], im.rgba[s + 1], im.rgba[s + 2]];
}

/* map a corridor cross-position Y (0..W) to a module tile, keeping trim and widening the core */
const acrossMap = (Y, W) => {
    /* Y 0,1 and the last two are plain parquet (null); then the module's own edge and trim; a widened core */
    if (Y < 2 || Y >= W - 2) return null;
    const y = Y - 2, n = W - 4;
    return y < 3 ? y : (y >= n - 3 ? y - (n - 8) : 3 + ((y - 3) % 2));
};
const plainAt = (X, Y, dx, dy) => modPx(srcPlain, false, 2 + (((X % 4) + 4) % 4), 2 + (((Y % 4) + 4) % 4), dx, dy);

function floorPass(w, filter) {
    const c = w.cfg, b = w.b;
    for (let sy = 0; sy < b.h; sy++) for (let sx = 0; sx < b.w; sx++) {
        const rx = sx - w.ox, ry = sy - w.oy;
        const fx = (rx + 2 * ry) / 32, fy = (2 * ry - rx) / 32;
        const X = Math.floor(fx), Y = Math.floor(fy);
        if (!w.tileIn(X, Y) || !filter(X, Y)) continue;
        const dx = rx - (X - Y) * 16, dy = ry - (X + Y) * 8;
        let col = null;
        const cr = w.isCross(X);
        if (cr !== undefined) {
            const a = X - cr, C = c.C, A = c.A, W = c.W;
            const cx = 2, cw = C - 4;                     // carpet across the crossing
            const inX = a >= cx && a < cx + cw;
            if (Y >= 0 && Y < W && inX) {
                /* the square middle, with the medallion at its centre */
                const ma = a - cx - (cw - 4) / 2, mb = Y - (W - 4) / 2;
                if (ma >= 0 && ma < 4 && mb >= 0 && mb < 4) col = modPx(srcCross, false, 2 + ma, 2 + mb, dx, dy);
                else col = modPx(srcStraightX, true, 2 + (X % 4), 4, dx, dy);
            } else if (Y >= 0 && Y < W) {
                { const my = acrossMap(Y, W); col = my === null ? plainAt(X, Y, dx, dy) : modPx(srcStraightX, true, 2 + (X % 4), my, dx, dy); }
            } else if (inX) {
                /* the side arm: same carpet, turned to run along y */
                const YY = Y < 0 ? Y + A : Y - W;              // 0..A-1 outward
                const out = Y < 0 ? A - 1 - YY : YY;           // 0 at the corridor, A-1 at the end
                if (out >= A - 1) col = modPx(srcPlain, false, 2 + (X % 4), 2 + (((Y % 4) + 4) % 4), dx, dy);
                else { const aa = acrossMap(a - cx + 2, cw + 4); col = aa === null ? plainAt(X, Y, dx, dy) : modPx(srcStraightY, false, aa, 2 + (((Y % 4) + 4) % 4), dx, dy); }
            } else {
                col = modPx(srcPlain, false, 2 + (X % 4), 2 + (((Y % 4) + 4) % 4), dx, dy);
            }
        } else {
            const my = acrossMap(Y, c.W);
            col = my === null ? plainAt(X, Y, dx, dy) : modPx(srcStraightX, true, 2 + (X % 4), my, dx, dy);
        }
        if (col) { b.set(sx, sy, col); w.floorMask[sy * b.w + sx] = 1; }
    }
}

function edgePass(w) {
    /* the slab's thickness below its visible edges */
    const b = w.b, ND = 13;
    const pal = ["000000", "c79556", "b1804a", "9d7146", "9d7146", "895e39", "000000", "895e39", "4d2312", "895e39", "4d2312", "000000"].map(hex);
    for (let sx = 0; sx < b.w; sx++) for (let sy = b.h - ND - 2; sy > 0; sy--) {
        if (!w.floorMask[sy * b.w + sx] || w.floorMask[(sy + 1) * b.w + sx]) continue;
        const rx = sx - w.ox, ry = sy - w.oy;
        const fy = (2 * ry - rx) / 32, fx = (rx + 2 * ry) / 32;
        /* only the near edges, never the seam behind the main wall */
        const X = Math.floor(fx), Y = Math.floor(fy);
        if (Y < 0) continue;
        for (let d = 0; d < pal.length; d++) {
            if (w.floorMask[(sy + 1 + d) * b.w + sx]) break;
            let k = pal[d];
            if (d >= 1 && d <= 5 && ((sx >> 1) & 3) === 0) k = k.map(v => Math.round(v * .86));
            b.set(sx, sy + 1 + d, k);
        }
    }
}

/* The client's wall piece is 8 tiles of wall (128px) plus a 10px end post, on the right of the x piece and the left of
   the y piece. The wall repeats from fixed points on the map, so a long wall is one unbroken pattern however the floor
   is cut up; the post only goes where the wall really ends (o.noEnd: the wall carries on past this run). */
const WALL_MOD = 128, WALL_POST = 10, WALL_START = 24;
function wallRunX(w, x0, x1, y, o) {
    const raw = w.tallX || piece("wall_upper_right_basic"), seam = w.seamX || raw, T = w.wallTop || 101, b = w.b;
    const column = (p, i, im = seam, limit = 1e9) => {
        let n = 0;
        for (let j = 0; j < im.h; j++) {
            if (j - T > Math.floor(i / 2)) continue;
            const s = (j * im.w + i) * 4; if (im.rgba[s + 3] < 128) continue;
            if (n++ >= limit) break;
            b.set(p[0] + i, p[1] - T + j, [im.rgba[s], im.rgba[s + 1], im.rgba[s + 2]]);
        }
    };
    const half = o && o.half, none = o && o.none, gone = half && (at => half(at) || none(at)), ends = [], lowEnds = [], lowStarts = [];
    for (let x = Math.floor(x0 / 8) * 8; x < x1; x += 8) {
        const p = w.S(x, y);
        if (p[0] > b.w + 20 || p[0] + 160 < -20 || p[1] - T > b.h + 100 || p[1] + 100 < -20) continue;
        for (let i = 0; i < WALL_MOD; i++) {
            const at = x * 16 + i; if (at < x0 * 16 || at >= x1 * 16) continue;
            if (o && o.col) o.col(at);
            /* a stretch set to half height: the low panelled wall instead. The full wall beside it ends properly, as at any wall's end. */
            if (none && none(at)) continue;
            if (half && half(at)) { o.halfCol(at, p[0] + i, p[1] + Math.floor(i / 2)); if (((at % 16) + 16) % 16 === 15 && at + 1 < x1 * 16 && none(at + 1)) lowEnds.push(Math.floor(at / 16) + 1); if (((at % 16) + 16) % 16 === 0 && (at === x0 * 16 ? !o.noStart : none(at - 1))) lowStarts.push(at / 16); continue; }
            const t = Math.floor(at / 16); let from = null;
            if (half) { if (gone((t - 1) * 16) && !o.seamless((t - 1) * 16)) from = t; else if (gone((t - 2) * 16) && !o.seamless((t - 2) * 16)) from = t - 1; }
            if (from !== null && at < from * 16 + WALL_START) column(w.S(from, y), at - from * 16, raw);
            else if (!(o && o.noStart) && at < x0 * 16 + WALL_START) column(w.S(x0, y), at - x0 * 16, raw);
            else column(p, i);
            if (half && ((at % 16) + 16) % 16 === 15 && at + 1 < x1 * 16 && gone(at + 1) && !o.seamless(at + 1)) ends.push(t + 1);
        }
    }
    for (const e of ends) { const p = w.S(e - 8, y); if (o.col) o.col(e * 16 - 1); for (let i = WALL_MOD; i < WALL_MOD + WALL_POST; i++) column(p, i, raw); }
    for (const e of lowEnds) { if (o.col) o.col(e * 16 - 1); o.halfEnd(w.S(e, y)); }
    for (const e of lowStarts) { if (o.col) o.col(e * 16); o.halfStart(w.S(e, y)); }
    if (!(o && o.noEnd)) {
        if (o && o.col) o.col(x1 * 16 - 1);
        if (none && none(x1 * 16 - 1)) { /* nothing there to end */ }
        else if (half && half(x1 * 16 - 1)) o.halfEnd(w.S(x1, y));
        else { const p = w.S(x1 - 8, y); for (let i = WALL_MOD; i < WALL_MOD + WALL_POST; i++) column(p, i, raw, o && o.endKeep); }
    }
}

function wallRunY(w, x, y0, y1, o) {
    /* along y at fixed x, facing +x. Runs up-right as y falls. */
    const raw = w.tallY || piece("wall_upper_left_basic"), seam = w.seamY || raw, T = w.wallTop || 101, b = w.b, W = WALL_MOD + WALL_POST;
    const column = (p, i, im = seam, limit = 1e9) => {
        let n = 0;
        for (let j = 0; j < im.h; j++) {
            if (j - T > Math.floor((W - i) / 2)) continue;
            const s = (j * im.w + i) * 4; if (im.rgba[s + 3] < 128) continue;
            if (n++ >= limit) break;
            b.set(p[0] - W + i, p[1] - T + j, [im.rgba[s], im.rgba[s + 1], im.rgba[s + 2]]);
        }
    };
    const half = o && o.half, none = o && o.none, gone = half && (at => half(at) || none(at)), ends = [], lowEnds = [], lowStarts = [];
    for (let y = Math.floor(y0 / 8) * 8; y < y1; y += 8) {
        const p = w.S(x, y);                                     // apex of the module this piece stands on
        if (p[0] - W > b.w + 20 || p[0] < -20 || p[1] - T > b.h + 100 || p[1] + 100 < -20) continue;
        for (let i = WALL_POST; i < W; i++) {
            const at = y * 16 + (W - i); if (at <= y0 * 16 || at > y1 * 16) continue;
            if (o && o.col) o.col(at);
            if (none && none(at)) continue;
            if (half && half(at)) { o.halfCol(at, p[0] - W + i, p[1] + Math.floor((W - i) / 2)); if (((at % 16) + 16) % 16 === 0 && at < y1 * 16 && none(at + 1)) lowEnds.push(at / 16); if (((at % 16) + 16) % 16 === 1 && (at === y0 * 16 + 1 ? !o.noStart : none(at - 1))) lowStarts.push((at - 1) / 16); continue; }
            const t = Math.floor((at - 1) / 16); let from = null;
            if (half) { if (gone((t - 1) * 16 + 1) && !o.seamless((t - 1) * 16 + 1)) from = t; else if (gone((t - 2) * 16 + 1) && !o.seamless((t - 2) * 16 + 1)) from = t - 1; }
            if (from !== null && at <= from * 16 + WALL_START) column(w.S(x, from), W - (at - from * 16), raw);
            else if (!(o && o.noStart) && at <= y0 * 16 + WALL_START) column(w.S(x, y0), W - (at - y0 * 16), raw);
            else column(p, i);
            if (half && ((at % 16) + 16) % 16 === 0 && at < y1 * 16 && gone(at + 1) && !o.seamless(at + 1)) ends.push(at / 16);
        }
    }
    for (const e of ends) { const p = w.S(x, e - 8); if (o.col) o.col(e * 16); for (let i = 0; i < WALL_POST; i++) column(p, i, raw); }
    for (const e of lowEnds) { if (o.col) o.col(e * 16); o.halfEnd(w.S(x, e)); }
    for (const e of lowStarts) { if (o.col) o.col(e * 16 + 1); o.halfStart(w.S(x, e)); }
    if (!(o && o.noEnd)) {
        if (o && o.col) o.col(y1 * 16);
        if (none && none(y1 * 16)) { /* nothing there to end */ }
        else if (half && half(y1 * 16)) o.halfEnd(w.S(x, y1));
        else { const p = w.S(x, y1 - 8); for (let i = 0; i < WALL_POST; i++) column(p, i, raw, o && o.endKeep); }
    }
}

/* ---------- custom art ---------- */
const C = {
    k: hex("000000"), d0: hex("240a02"), d1: hex("450e00"), d2: hex("5a1a06"), d3: hex("712f16"), d4: hex("7d4122"), d5: hex("925030"), d6: hex("af6947"), d7: hex("cb8444"),
    b1: hex("7a4a14"), b2: hex("b47a22"), b3: hex("ddaa63"), b4: hex("f2be70"), b5: hex("ffe7a8"),
    ink: hex("1c0c06"), plate: hex("2b1006"), glow: hex("ffd98a")
};

function door(w, x, y, o) {
    /* A hotel door set into a wall along x: 2 tiles across, 2 panels, brass kick
       and handle, a fanlight over it. u = px across, h = px up. */
    o = o || {};
    const b = w.b, DW = 32, DH = 62;
    const pal = o.pal || {};
    const leaf = pal.leaf || [C.d3, C.d4, C.d5, C.d2, C.d6];   // base, lit, hi, shade, edge
    for (let u = -4; u < DW + 4; u++) for (let h = 0; h < DH + 7; h++) {
        const P = o.mapY ? w.WY(x, y, DW - 1 - u, h) : w.WX(x, y, u, h);
        let c = null;
        const fr = u < 0 || u >= DW || h >= DH;               // the frame
        if (fr) {
            const outer = u === -4 || u === DW + 3 || h === DH + 6;
            const inner = u === -1 || u === DW || h === DH;
            if (outer) c = C.k;
            else if (h === DH + 5 ) c = C.d7;
            else if (inner) c = C.d1;
            else if (u === -3 || h === DH + 4) c = C.d6;
            else if (u >= DW && u === DW + 2) c = C.d2;
            else c = C.d5;
            /* the lintel's little keystone */
            if (h >= DH + 1 && h <= DH + 4 && u >= 13 && u <= 18) c = (u === 13 || h === DH + 4) ? C.b4 : C.b2;
            if (h >= DH + 1 && h <= DH + 4 && (u === 12 || u === 19)) c = C.d1;
        } else if (o.open) {
            /* open: the leaf has swung in; the dark room beyond */
            const leafW = 7;
            if (u < 3) c = u === 0 ? C.d1 : C.d2;                 // jamb in shadow
            else if (u < 3 + leafW) {
                const v = h - (u - 3);                            // leaf recedes as it swings
                c = v > DH - 3 ? hex("0a0506") : u === 3 + leafW - 1 ? C.d5 : ((u & 1) ? C.d3 : C.d2);
                if (v < 2) c = hex("0a0506");
            }
            else {
                const fl = Math.max(0, 8 - h);
                c = h < 7 ? [20 + fl * 4, 12 + fl * 2, 12] : [8, 6, 10];
                if (h === 0) c = C.b2;
            }
        } else {
            /* the jamb the viewer can see, then the door leaf */
            if (u < 2) c = u === 0 ? C.d0 : C.d1;
            else if (h >= DH - 2) c = C.d1;
            else if (h === 0) c = C.k;
            else {
                const lu = u - 2, W = DW - 2;
                c = leaf[0];
                if (lu === 0) c = leaf[4]; else if (lu === W - 1) c = leaf[3];
                const inP = (a, bb) => h >= a && h < bb && lu >= 4 && lu < W - 4;
                const top = inP(33, 57), bot = inP(8, 29);
                if (top || bot) {
                    const a = top ? 33 : 8, bb = top ? 57 : 29;
                    if (lu === 4 || h === bb - 1) c = leaf[3];
                    else if (lu === W - 5 || h === a) c = leaf[2];
                    else if (lu === 5 || h === bb - 2) c = C.d2;
                    else c = ((lu + (h >> 1)) % 7 === 0) ? leaf[0] : leaf[1];
                }
                if (h >= 1 && h <= 5) c = h === 5 ? C.b4 : (h === 1 ? C.b1 : C.b2);    // kick plate
            }
            /* handle on the free side */
            if (u >= DW - 6 && u <= DW - 4 && h >= 28 && h <= 32) c = (h === 32) ? C.b5 : (u === DW - 6 ? C.b1 : C.b3);
            if (o.hover && !fr) c = c.map((v, i) => Math.min(255, v + [26, 18, 4][i]));
        }
        if (c) b.set(P[0], P[1], c);
    }
    /* the door's number-free name sign goes on the wallpaper above */
    if (o.name) w.post.push({ kind: "signX", x: o.mapY ? x : x + 1, y: o.mapY ? y - 1 : y, h: DH + 11, name: o.name, hover: o.hover, alongY: !!o.mapY });
    /* a mat on the floor in front */
    w.mats = w.mats || [];
    if (!o.mapY) w.mats.push({ x, y: y, n: 1, hover: o.hover });
}

function mats(w) {
    /* a short brass-edged runner in front of each far door */
    const b = w.b;
    for (const m of (w.mats || [])) {
        const a = w.S(m.x, m.y);
        for (let t = 0; t < 32; t++) for (let v = 0; v < 18; v++) {
            /* t along x (px), v along y (px) */
            const sx = a[0] + t - v, sy = a[1] + Math.floor(t / 2) + Math.floor(v / 2);
            if (!w.floorMask[sy * b.w + sx]) continue;
            let c = (t + v) % 2 ? hex("3a0a12") : hex("4c1018");
            if (v === 0 || v === 17 || t < 1 || t > 30) c = C.k;
            else if (v === 1 || v === 16 || t < 2 || t > 29) c = C.b3;
            else if (v === 3 || v === 14 || t === 3 || t === 28) c = hex("6e1a14");
            b.set(sx, sy, c);
            if (sx - 1 >= 0) b.set(sx - 1, sy, c);    // close the 2:1 gaps
        }
    }
}

const FloorLamps = require("./floor-lamps.js");
/* A round pleated shade, seen from above, lit from inside: a soft ramp across and up it, with pleats that only
   just show. yb is the middle of its bottom edge, H its height, rb and rt its radius at bottom and top. */
const SHADES = {
    lit: { ramp: ["fff6d6", "ffeebf", "ffe2a6", "fbd28d", "f0bd74", "dda45e", "c48a4a"], glow: "fffdf0", inner: "b98244" },
    off: { ramp: ["efe2c4", "e6d7b6", "dccca8", "cfbd96", "bfab84", "ab9570", "927d5a"], glow: "6e5c42", inner: "54462f" },
    dead: { ramp: ["7a6a52", "705f49", "665641", "5a4b39", "4e4131", "43372a", "382e23"], glow: "2a2018", inner: "3a2e22" }
};
function pleatedShade(b, cx, yb, H, rb, rt, kind, colour) {
    const S = SHADES[kind] || SHADES.lit, tone = c => colour && kind === "lit" ? FloorLamps.tintGlow(c, colour) : c, RAMP = S.ramp.map(hex).map(tone), glow = tone(hex(S.glow)), inner = tone(hex(S.inner)), yt = yb - H, ry = Math.max(2, Math.round(rb / 3));
    for (let i = -rb; i <= rb; i++) {
        const ai = Math.abs(i), bottom = yb + Math.round(ry * Math.sqrt(1 - (i * i) / (rb * rb)));
        const top = ai <= rt ? yt - Math.round(Math.sqrt(1 - (i * i) / (rt * rt))) : Math.round(yt + (ai - rt) / (rb - rt) * (yb - yt));
        for (let Y = top; Y <= bottom; Y++) {
            const across = (i + rb) / (2 * rb), down = (Y - top) / Math.max(1, bottom - top);
            const form = Math.abs(across - .38) * 6.2 + (1 - down) * 1.6 + ((i + 40) % 2 ? .45 : 0);
            b.set(cx + i, Y, RAMP[Math.max(0, Math.min(6, Math.round(form)))]);
        }
        b.set(cx + i, top - 1, C.k); b.set(cx + i, bottom + 1, C.k);
        b.set(cx + i, bottom, i < 1 ? C.b4 : i < 4 ? C.b3 : C.b2);           // the brass trim along the bottom edge
    }
    for (let Y = yt; Y <= yb; Y++) { const r = Math.round(rt + (rb - rt) * (Y - yt) / (yb - yt)) + 1; b.set(cx - r, Y, C.k); b.set(cx + r, Y, C.k); }
    /* the open top, with the bulb's glow inside */
    for (let i = -rt + 1; i <= rt - 1; i++) { b.set(cx + i, yt - (Math.abs(i) < rt - 1 ? 1 : 0), Math.abs(i) < 2 ? glow : inner); if (Math.abs(i) < rt - 1) b.set(cx + i, yt, Math.abs(i) < 2 ? glow : inner); }
}
function lamp(w, x, y, o) {
    /* A small brass wall light that stands out from the wall: an oval plate flat on the wall, a swan-neck arm
       leaving it square to the wall, a turned cup, and a round pleated shade seen from above, lit from inside.
       Every brass part is built as a shape first and then outlined, so its black line never breaks. */
    o = o || {};
    const b = w.b, h0 = w.lampH === undefined ? 66 : w.lampH, at = (u, h) => o.mapY ? w.WY(x, y, u, h0 + h) : w.WX(x, y, u, h0 + h);
    const A = at(0, 0), out = o.mapY ? 1 : -1, dead = !!o.dead;      // out: straight out from the wall, on screen
    /* his picture, if there is one */
    const drawnArt = !o.drawn && FloorLamps.sconce(out, !!w.lightsOff || dead, o.colour);
    if (drawnArt) {
        for (const [dx, dy, c, glass] of drawnArt) {
            const X = A[0] + dx, Y = A[1] + dy; b.set(X, Y, c);
            if (X >= 0 && Y >= 0 && X < b.w && Y < b.h) { const v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; if (w.keep) w.keep[Y * b.w + X] = v; if (glass && w.glowing) w.glowing[Y * b.w + X] = v; }
        }
        const pa = o.mapY ? w.WY(x, y, 0, h0 + 4) : w.WX(x, y, 0, h0 + 4);
        w.lamps.push({ x: pa[0], y: pa[1], dead, weak: !!o.weak, tx: x, ty: y, i: (w.lamps || []).length, colour: o.colour });
        return;
    }
    const solid = (cells, colour) => {
        const seen = new Set(cells.map(q => q[0] + "," + q[1]));
        for (const [X, Y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((X + dx) + "," + (Y + dy))) b.set(X + dx, Y + dy, C.k);
        for (const q of cells) b.set(q[0], q[1], colour(q[0], q[1]));
    };
    /* the plate, on the wall */
    const plate = [];
    for (let u = -2; u <= 2; u++) for (let h = -5; h <= 3; h++) if ((u * u) / 6.25 + ((h + 1) * (h + 1)) / 20.25 <= 1) { const P = at(u, h); plate.push([P[0], P[1], u, h]); }
    solid(plate.map(q => [q[0], q[1]]), (X, Y) => { const q = plate.find(p => p[0] === X && p[1] === Y), lit = q[2] * out < 0 ? 0 : 1; return q[3] >= 2 ? C.b4 : q[3] <= -4 ? C.b1 : lit ? C.b3 : C.b2; });
    /* the arm: a curve out from the plate, down a little, then up into the cup */
    const REACH = 11, P0 = [0, -1], P1 = [out * 7, 10], P2 = [out * REACH, -2], arm = new Map();
    for (let t = 0; t <= 1.0001; t += .02) {
        const mt = 1 - t, X = A[0] + Math.round(mt * mt * P0[0] + 2 * mt * t * P1[0] + t * t * P2[0]), Y = A[1] + Math.round(mt * mt * P0[1] + 2 * mt * t * P1[1] + t * t * P2[1]);
        arm.set(X + "," + Y, [X, Y]);
    }
    const armCells = [...arm.values()], topOf = new Map(); for (const [X, Y] of armCells) if (!topOf.has(X) || Y < topOf.get(X)) topOf.set(X, Y);
    solid(armCells, (X, Y) => (X - A[0]) * out < 4 ? C.b2 : C.b3);
    const cx = A[0] + P2[0], cup = A[1] + P2[1];
    /* the cup and collar under the shade */
    const cupCells = []; for (let i = -2; i <= 2; i++) for (let j = 0; j <= 1; j++) if (Math.abs(i) < 2 || j === 0) cupCells.push([cx + i, cup - 1 + j]);
    solid(cupCells, (X) => X < cx ? C.b4 : X === cx ? C.b3 : C.b1);
    pleatedShade(b, cx, cup - 4, 8, 6, 4, dead ? "dead" : w.lightsOff ? "off" : "lit", o.colour);
    const p = o.mapY ? w.WY(x, y, 0, h0 + 4) : w.WX(x, y, 0, h0 + 4);
    w.lamps.push({ x: p[0], y: p[1], dead, weak: !!o.weak, tx: x, ty: y, i: (w.lamps || []).length, colour: o.colour });
}

/* the pillar made taller: its shaft row repeated, so the cap and the plinth keep their size */
const stretchedMemo = new Map();
function stretched(part, by) {
    const key = part + "|" + by; let m = stretchedMemo.get(key); if (m) return m;
    const im = piece(part), SHAFT = 30, h = im.h + by, rgba = Buffer.alloc(im.w * h * 4);
    for (let y = 0; y < h; y++) { const from = y <= SHAFT ? y : y <= SHAFT + by ? SHAFT : y - by; im.rgba.copy(rgba, y * im.w * 4, from * im.w * 4, (from + 1) * im.w * 4); }
    m = { w: im.w, h, rgba }; stretchedMemo.set(key, m); return m;
}
function furni(w, name, tx, ty, o) {
    /* standard placement: loc = the tile's left corner */
    o = o || {};
    if (o.layer === undefined && ty < 0 && w.inRecess) { }
    const a = w.S(tx, ty);
    const loc = [a[0] - 16, a[1] + 8];
    (ty < 0 && !w.noRecess ? (w.recess = w.recess || []) : w.sprites).push({ depth: tx + ty + (o.dz || 0), ftx: tx, fty: ty, draw: () => {
        for (const part of [].concat(name)) {
            const im = o.stretch ? stretched(part, o.stretch) : piece(part);
            const reg = REG[part] || [0, 0];
            const x0 = o.flip ? loc[0] + 32 + reg[0] - im.w : loc[0] - reg[0];
            const X0 = x0 + (o.ox || 0), Y0 = loc[1] - reg[1] + (o.oy || 0) - (o.stretch || 0);
            w.b.blit(im, X0, Y0, { flip: o.flip });
            /* a piece that keeps its own colours on every floor: note what it painted, so the recolouring leaves it */
            if (o.keepColour && w.keep) for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) {
                if (im.rgba[(j * im.w + i) * 4 + 3] < 128) continue;
                const X = X0 + (o.flip ? im.w - 1 - i : i), Y = Y0 + j; if (X < 0 || Y < 0 || X >= w.b.w || Y >= w.b.h) continue;
                const p = (Y * w.b.w + X) * 4;
                /* tint: a part of it that takes the floor's colour after all, like a sofa's cushions */
                const t = o.tint && o.tint([w.b.d[p], w.b.d[p + 1], w.b.d[p + 2]], part, i, j);
                if (t) { w.b.d[p] = t[0]; w.b.d[p + 1] = t[1]; w.b.d[p + 2] = t[2]; }
                w.keep[Y * w.b.w + X] = ((w.b.d[p] << 16) | (w.b.d[p + 1] << 8) | w.b.d[p + 2]) + 1;
            }
        }
    }});
}
const REGS = JSON.parse(fs.readFileSync(S + "/regs.json", "utf8"));
const REG = REGS.hall;

function avatar(w, who, tx, ty, dir, row) {
    w.sprites.push({ depth: tx + ty + .5, draw: () => {
        const a = w.S(tx, ty);
        const sheet = load(R + "assets/img/standins/" + who + "-s.png");
        const cw = 33, ch = 56, cx = dir * cw, cy = row * ch;
        const x0 = a[0] - 16, y0 = a[1] + 8 - (ch - 6);
        /* a soft pixel shadow */
        for (let j = -3; j <= 3; j++) for (let i = -9; i <= 9; i++) if (i * i / 81 + j * j / 9 < 1) {
            const X = a[0] + i, Y = a[1] + 8 + j;
            if ((X + Y) % 2 === 0) { const k = w.b.get(X, Y); w.b.set(X, Y, k.map(v => v * .55)); }
        }
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
            const s = ((cy + j) * sheet.w + cx + i) * 4;
            if (sheet.rgba[s + 3] < 128) continue;
            w.b.set(x0 + i, y0 + j, [sheet.rgba[s], sheet.rgba[s + 1], sheet.rgba[s + 2]]);
        }
    }});
    w.avatarAt = { who, tx, ty, dir, row };
}

function booth(w, tx, ty) {
    /* TELEPORT. Custom: a tall panelled cabinet with a lit arched door, on one tile. */
    (ty < 0 ? (w.recess = w.recess || []) : w.sprites).push({ depth: tx + ty + .9, draw: () => {
        const b = w.b, H = 72;
        const a = w.S(tx, ty);            // apex
        const left = [a[0] - 16, a[1] + 8], bottom = [a[0], a[1] + 16], right = [a[0] + 16, a[1] + 8];
        const set = (x, y, c) => b.set(x, y, c);
        /* the +y face: from left corner to bottom corner (u 0..16), the door */
        for (let u = 0; u < 16; u++) for (let h = 0; h < H; h++) {
            const x = left[0] + u, y = left[1] + Math.floor(u / 2) - h;
            let c = C.d4;
            if (u === 0 || h === H - 1 || h === 0) c = C.k;
            else if (u === 15) c = C.d6;
            else if (h >= H - 5) c = h === H - 2 ? C.d7 : C.d5;
            else if (h <= 4) c = h === 4 ? C.b4 : C.b2;
            else {
                /* arched window */
                const cu = 7.5, half = 5.5, top = H - 12, spring = top - 5;
                const du = Math.abs(u - cu);
                const inside = u >= 2 && u <= 13 && h >= 8 && (h <= spring || ((u - cu) * (u - cu)) / (half * half) + ((h - spring) * (h - spring)) / 25 <= 1);
                if (inside) {
                    const shine = (h + u * 2) % 19 < 3;
                    c = shine ? hex("e6fbff") : ((h >> 2) + (u >> 1)) % 2 ? hex("6fd8e8") : hex("49b6d8");
                    if (u === 2 || du > half - .9) c = C.b4;
                } else c = (u + h) % 5 === 0 ? C.d3 : C.d4;
            }
            set(x, y, c);
        }
        /* the +x face: from bottom corner to right corner, plain panels */
        for (let u = 0; u < 17; u++) for (let h = 0; h < H; h++) {
            const x = bottom[0] + u, y = bottom[1] - Math.floor(u / 2) - h;
            let c = C.d2;
            if (u === 16 || h === H - 1 || h === 0) c = C.k;
            else if (u === 0) c = C.d3;
            else if (h >= H - 5) c = h === H - 2 ? C.d5 : C.d3;
            else if (h <= 4) c = h === 4 ? C.b2 : C.b1;
            else if (u >= 3 && u <= 13 && h >= 10 && h <= H - 11) c = (u === 3 || h === H - 11) ? C.d1 : (u === 13 || h === 10) ? C.d3 : C.d2;
            else c = C.d2;
            set(x, y, c);
        }
        /* the lid */
        for (let i = -16; i <= 16; i++) { const hh = 8 - Math.ceil(Math.abs(i) / 2); for (let j = -hh; j <= hh; j++) {
            const x = a[0] + i, y = a[1] + 8 + j - H;
            set(x, y, Math.abs(j) === hh ? C.k : (i < 0 ? C.d7 : C.d6));
        } }
        /* a small lit lantern on top */
        for (let j = 0; j < 7; j++) for (let i = -2; i <= 2; i++) set(a[0] + i, a[1] + 6 - H - j, (j === 6 || j === 0 || Math.abs(i) === 2) ? C.k : hex("8fe8f6"));
    }});
    const p = w.S(tx, ty);
    w.lamps.push({ x: p[0], y: p[1] - 20, cyan: true, tx, ty });
}

function nearFrame(w, x, o) {
    /* A near-side doorway stands on the slab's near edge. We see its OUTER face, so
       the sign reads the right way round; a heavy frame with a pediment, and a
       step down into the dark. Between its posts you see the hall behind. */
    o = o || {};
    const y = w.cfg.W, DW = 32, DH = 66;
    w.sprites.push({ depth: x + y + 1.1, draw: () => {
        const b = w.b;
        for (const pu of [-7, DW]) for (let u = 0; u < 7; u++) for (let h = -13; h < DH + 2; h++) {
            const P = w.WX(x, y, pu + u, h);
            let c = u === 0 || u === 6 ? C.k : u === 1 ? C.d6 : u === 5 ? C.d2 : (u === 3 ? C.d5 : C.d4);
            if (h <= 0) c = (h === -13 || u === 0 || u === 6) ? C.k : (h >= -1 ? C.k : C.d2);
            if (h > 0 && h <= 7 && u > 0 && u < 6) c = h === 7 ? C.b4 : h === 1 ? C.b1 : C.b2;
            b.set(P[0], P[1], c);
        }
        /* the lintel */
        for (let u = -7; u < DW + 7; u++) for (let h = DH; h < DH + 17; h++) {
            const P = w.WX(x, y, u, h);
            let c = (u % 3 === 0) ? C.d3 : C.d4;
            if (h === DH || h === DH + 16 || u === -7 || u === DW + 6) c = C.k;
            else if (h === DH + 15) c = C.d7;
            else if (h === DH + 14) c = C.d5;
            else if (h === DH + 1) c = C.d1;
            else if (h === DH + 13) c = C.d2;
            b.set(P[0], P[1], c);
        }
        /* the sill, and the dark step under it */
        for (let u = 0; u < DW; u++) for (let d = -13; d <= 1; d++) {
            const P = w.WX(x, y, u, d);
            b.set(P[0], P[1], d === 1 ? C.b4 : d === 0 ? C.b2 : d === -1 ? C.k : d === -13 ? C.k : hex("120806"));
        }
    }});
    w.post.push({ kind: "signX", x: x + 1, y, h: DH + 22, name: o.name, near: true, hover: o.hover });
}

function rail(w, x0, x1) {
    /* a low panelled wall along the near edge, in the client's low-wall colours */
    if (x1 <= x0) return;
    const y = w.cfg.W, H = 15;
    w.sprites.push({ depth: x0 + y + 1, draw: () => {
        const b = w.b, px = (x1 - x0) * 16;
        for (let u = 0; u <= px; u++) for (let h = -13; h <= H; h++) {
            const P = w.WX(x0, y, u, h);
            let c = (u % 4 === 0) ? C.d2 : (u % 4 === 1 ? C.d4 : C.d3);
            if (h === H) c = C.k; else if (h === H - 1) c = C.d7; else if (h === H - 2) c = C.d5; else if (h === H - 3) c = C.k;
            if (h <= 0) c = (h === -13) ? C.k : (h <= -1 ? ((u % 4 === 0) ? C.d1 : C.d2) : C.k);
            b.set(P[0], P[1], c);
        }
        for (let h = -13; h <= H; h++) { const P = w.WX(x0, y, px, h); b.set(P[0] + 1, P[1], C.k); const Q = w.WX(x0, y, 0, h); b.set(Q[0] - 1, Q[1], C.k); }
    }});
}

function wrap(name, max) {
    const lines = []; let cur = "";
    for (const word of name.split(" ")) {
        if (cur && (cur + " " + word).length > max) { lines.push(cur); cur = word; }
        else cur = cur ? cur + " " + word : word;
    }
    if (cur) lines.push(cur);
    return lines;
}

/* the sign: a sheared plate, its letters stepping down with it but kept upright */
function signX(buf, w, s, sc, oxy) {
    const fine = sc === 2;
    const lines = wrap(s.name, s.max || (fine ? 24 : 18));
    const measure = t => fine ? textW(t, "vb") + 1 : t.length * 4 - 1;
    const tw = Math.max(...lines.map(measure));
    const pad = fine ? 7 : 4, lh = fine ? 11 : 6, PH = lines.length * lh + (fine ? 8 : 4);
    const PW = tw + pad * 2;
    const p0 = w.S(s.x, s.y);
    const sh = s.alongY ? -1 : 1;
    const base = oxy(p0[0], p0[1]);
    const cx = base[0], cy = base[1] - s.h * sc;
    const ink = s.hover ? hex("ffe7a8") : C.b4;
    const bg = s.hover ? hex("4a1c0a") : C.plate;
    /* plate, centred on cx */
    for (let u = 0; u < PW; u++) for (let v = 0; v < PH; v++) {
        const X = cx - (PW >> 1) + u, Y = cy + sh * Math.floor((u - (PW >> 1)) / 2) - v;
        let c = bg;
        const edge = u === 0 || u === PW - 1 || v === 0 || v === PH - 1;
        const rim = u === 1 || u === PW - 2 || v === 1 || v === PH - 2;
        if (edge) c = C.k; else if (fine && rim) c = (v === PH - 2 || u === 1) ? C.b4 : C.b1; else if (!fine && v === PH - 2) c = C.b2;
        buf.set(X, Y, c);
    }
    /* letters */
    lines.forEach((ln, li) => {
        const lw = measure(ln);
        let u = (PW >> 1) - (lw >> 1) - (PW >> 1);
        const topV = PH - (fine ? 5 : 3) - li * lh;
        for (const ch of ln) {
            const Y0 = cy + sh * Math.floor(u / 2) - topV;
            if (fine) {
                const g = VOL.vb[ch] || VOL.vb[" "];
                g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") buf.set(cx + u + i - 1, Y0 + j - 3, ink); });
                u += g.w;
            } else {
                const g = F3[ch] || F3[" "];
                for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === "1") buf.set(cx + u + i, Y0 + j, ink);
                u += 4;
            }
        }
    });
}

function drawSprites(w) { w.sprites.sort((a, b) => a.depth - b.depth).forEach(s => s.draw()); }
function drawPost(w) { for (const s of w.post) if (s.kind === "signX") signX(w.b, w, s, 1, (x, y) => [x, y]); }

/* ---------- lighting moods ---------- */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function lightPass(w, mood, cam) {
    const b = w.b;
    const M = MOODS[mood];
    if (!M) return;
    const lamps = w.lamps.filter(l => !l.dead);
    /* lamp grid for speed */
    const grid = new Map(), G = 256;
    for (const l of lamps) { const k = (l.x / G | 0) + "," + (l.y / G | 0); (grid.get(k) || grid.set(k, []).get(k)).push(l); }
    const camS = cam ? w.S(cam[0], cam[1]) : null;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const p = (y * b.w + x) * 4;
        let r = b.d[p], g = b.d[p + 1], bl = b.d[p + 2];
        if (r < 12 && g < 11 && bl < 14) continue;     // the void stays
        let L = M.ambient, warm = 0, cy = 0;
        const gx = x / G | 0, gy = y / G | 0;
        for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
            const list = grid.get((gx + c) + "," + (gy + a)); if (!list) continue;
            for (const l of list) {
                const dx = (x - l.x), dy = (y - l.y - 30) * 1.7;
                const d = Math.sqrt(dx * dx + dy * dy) / (M.radius * (l.weak ? .55 : 1));
                if (d < 1) {
                    const f = (1 - d) * (1 - d);
                    if (l.cyan) cy += f * .9; else { L += f * M.power * (l.weak ? .6 : 1); warm += f; }
                }
            }
        }
        if (cam && M.fadeFrom) {
            /* the hall swallows itself the further it runs from where you stand */
            const fx = ((x - w.ox) + 2 * (y - w.oy)) / 32;
            const dd = Math.abs(fx - cam[0]);
            if (dd > M.fadeFrom) L *= Math.max(0, 1 - (dd - M.fadeFrom) / M.fadeLen);
        }
        if (camS && M.own) {
            const dx = x - camS[0], dy = (y - camS[1] + 8) * 1.8;
            const d = Math.sqrt(dx * dx + dy * dy) / M.ownR;
            if (d < 1) L += (1 - d) * M.own;
        }
        /* colour grade */
        let [gr, gg, gb] = M.grade;
        if (M.sallow) {
            const lum = r * .3 + g * .59 + bl * .11;
            r = r + (lum - r) * M.sallow; g = g + (lum - g) * M.sallow; bl = bl + (lum - bl) * M.sallow;
        }
        /* quantise the light with an ordered dither so it stays pixel art */
        const n = M.steps, t = BAYER[(y & 3) * 4 + (x & 3)] / 16;
        const q = Math.floor(L * n + t + 1e-6) / n;
        const qw = Math.floor(Math.min(1, warm) * n + t) / n;
        const qc = Math.floor(Math.min(1, cy) * n + t) / n;
        const mix = 1 - Math.min(1, qw * 1.0);
        const R0 = r * q * (gr * mix + (1.12) * (1 - mix)) + qc * 10;
        const G0 = g * q * (gg * mix + (0.98) * (1 - mix)) + qc * 46;
        const B0 = bl * q * (gb * mix + (0.74) * (1 - mix)) + qc * 58;
        b.d[p] = Math.min(255, R0); b.d[p + 1] = Math.min(255, G0); b.d[p + 2] = Math.min(255, B0);
    }
}
const MOODS = {
    lit: null,
    afterhours: { ambient: .5, power: .95, radius: 165, steps: 6, grade: [.8, .84, 1.1], fadeFrom: 20, fadeLen: 26, own: .5, ownR: 120 },
    forgotten: { ambient: .8, power: .25, radius: 120, steps: 5, grade: [1.0, .96, .66], sallow: .42, fadeFrom: 26, fadeLen: 30 }
};

/* grime for the Forgotten Floor: blotches on carpet and wall, in pixel blocks */
function grime(w, seed) {
    const b = w.b; let s = seed || 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const blots = [];
    for (let i = 0; i < w.cfg.L * .42; i++) blots.push({ x: rnd() * w.cfg.L, y: rnd() * w.cfg.W, r: 14 + rnd() * 26 });
    for (const bl of blots) {
        const a = w.S(bl.x, bl.y);
        for (let j = -bl.r; j <= bl.r; j++) for (let i = -bl.r * 2; i <= bl.r * 2; i++) {
            const X = Math.round(a[0] + i), Y = Math.round(a[1] + j);
            if (X < 0 || Y < 0 || X >= b.w || Y >= b.h || !w.floorMask[Y * b.w + X]) continue;
            const d = (i * i) / (4 * bl.r * bl.r) + (j * j) / (bl.r * bl.r);
            const n = BAYER[(Y & 3) * 4 + (X & 3)] / 16;
            if (d + n * .5 < .85) { const k = b.get(X, Y); b.set(X, Y, [k[0] * .8, k[1] * .78, k[2] * .62]); }
        }
    }
}

/* ---------- a whole hallway ---------- */
function clean(n) { return n.replace(/[^\x20-\x7e]/g, "").replace(/\*/g, "").replace(/\[|\]/g, "").trim().replace(/\s+/g, " "); }
function names() {
    const raw = fs.readFileSync(R + "tools/.cache/maze-list.txt", "utf8").split(/\r?\n/).filter(Boolean).map(l => clean(l.split("\t")[1]).toUpperCase());
    return raw.sort((a, c) => a.replace(/[^A-Z0-9]/g, "").localeCompare(c.replace(/[^A-Z0-9]/g, "")));
}

function build(cfg) {
    /* cfg: layout "both" | "cross" | "far"; mood; avatar placement */
    const list = names();
    const BAY = 6, W = cfg.W || 12;
    let L, cross = [], A = 0, CL = 0, far = [], near = [], tele = [];
    const openIdx = cfg.open;
    if (cfg.layout === "far") {
        /* every door on the far wall, a booth bay every 10 doors */
        let x = 6, n = 0;
        for (const nm of list) {
            far.push({ x, name: nm }); x += BAY; n++;
            if (n % 10 === 0 && n < list.length) { tele.push({ x: x + 2, y: 0 }); x += BAY; }
        }
        L = x + 4;
    } else if (cfg.layout === "both") {
        let x = 6, i = 0, n = 0;
        while (i < list.length) {
            far.push({ x, name: list[i++] });
            if (i < list.length) near.push({ x, name: list[i++] });
            x += BAY; n++;
            if (n % 7 === 0) { tele.push({ x: x + 2, y: 0 }); x += BAY; }
        }
        L = x + 4;
    } else {
        /* crossings every 5 pairs */
        A = 7; CL = 16;
        let x = 6, i = 0, n = 0;
        while (i < list.length) {
            far.push({ x, name: list[i++] });
            if (i < list.length) near.push({ x, name: list[i++] });
            x += BAY; n++;
            if (n % 5 === 0 && i < list.length) { cross.push(x); x += CL + 2; }
        }
        L = x + 4;
    }
    const w = new World({ L, W, A, C: CL, cross, void: cfg.void });
    w.far = far; w.near = near; w.L = L; w.cross = cross; w.tele = tele;

    /* ---- what stands in the hall, gathered first so each layer can be drawn in turn ---- */
    tele.forEach(t => {
        booth(w, t.x, t.y);
        w.post.push({ kind: "signX", x: t.x + .5, y: 0, h: 80, name: "TELEPORT" });
    });
    cross.forEach(c => {
        booth(w, c + 7, -A); booth(w, c + 9, -A);
        (w.recessPost = w.recessPost || []).push({ kind: "signX", x: c + 8.5, y: -A, h: 80, name: "TELEPORTS" });
    });
    const sofaRow = (x, y) => { furni(w, ["hw_sofa3_a_0_2_0", "hw_sofa3_b_0_2_0"], x, y, { flip: true }); furni(w, "hw_sofa2_a_0_2_0", x + 1, y, { flip: true }); furni(w, "hw_sofa1_a_0_2_0", x + 2, y, { flip: true }); };
    if (cfg.dress !== false) {
        far.forEach((d, i) => {
            if (i % 4 === 1) furni(w, "hw_plant_a_0_0_0", d.x + 3, 0);
            if (i % 4 === 3) furni(w, "hw_ero1_a_0_0_0", d.x + 3, 0);
        });
        cross.forEach(c => {
            sofaRow(c + 2, -A); sofaRow(c + 11, -A);
            furni(w, "hw_plant_a_0_0_0", c + 1, -A);
            furni(w, "hw_plant_a_0_0_0", c + 14, -A);
            furni(w, "hw_statue_a_0_0_0", c + 1, W + A - 2);
            furni(w, "hw_statue_a_0_0_0", c + 14, W + A - 2);
        });
    }

    /* near side: doorways and a low wall between them, broken at the crossings */
    {
        const stops = [...near.map(d => [d.x - 1, d.x + 3]), ...cross.map(c => [c, c + CL])].sort((p, q) => p[0] - q[0]);
        if (cfg.layout !== "far" || true) {
            let last = 0;
            for (const st of stops) { rail(w, last, st[0]); last = st[1]; }
            rail(w, last, L);
        }
        near.forEach(d => nearFrame(w, d.x, { name: d.name }));
    }
    if (cfg.avatar && !cfg.noActor) avatar(w, cfg.avatar.who || "m1", cfg.avatar.x, cfg.avatar.y, cfg.avatar.dir, cfg.avatar.row);

    /* ---- recess: its walls, floor and furniture all sit behind the long wall ---- */
    for (const c of cross) {
        wallRunX(w, c, c + CL, -A);
        wallRunY(w, c, -A, 0);
        lamp(w, c + 5, -A, { dead: !!cfg.deadEvery }); lamp(w, c + 11, -A);
    }
    floorPass(w, (X, Y) => Y < 0);
    (w.recess || []).sort((a, c) => a.depth - c.depth).forEach(s => s.draw());
    if (!cfg.noPost) (w.recessPost || []).forEach(s => signX(w.b, w, s, 1, (x, y) => [x, y]));

    /* ---- the long wall ---- */
    let from = 0;
    for (const c of [...cross, L]) { wallRunX(w, from, c, 0); from = c + CL; }
    wallRunY(w, 0, 0, W);
    door(w, 0, Math.floor(W / 2) + 1, { mapY: true, name: "BACK TO THE ARCHIVE" });

    far.forEach((d, i) => {
        door(w, d.x, 0, { name: d.name, open: openIdx === i, hover: cfg.hover === i, pal: cfg.pal });
        const dead = cfg.deadEvery && ((i * 7 + 3) % cfg.deadEvery === 0);
        lamp(w, d.x - 1, 0, { dead: !!dead, weak: !!(cfg.deadEvery && (i * 5) % 4 === 0) });
    });
    floorPass(w, (X, Y) => Y >= 0);
    edgePass(w);
    mats(w);
    if (cfg.grime) grime(w);
    if (cfg.hiliter) { const a = w.S(cfg.hiliter[0], cfg.hiliter[1]); w.b.blit(piece("hiliter_pub"), a[0] - 16, a[1]); }
    drawSprites(w);
    lightPass(w, cfg.mood || "lit", cfg.cam);
    if (!cfg.noPost) drawPost(w);
    return w;
}

function view(w, cx, cy, vw, vh) {
    const c = w.S(cx, cy);
    return w.b.crop(c[0] - (vw >> 1), c[1] - (vh >> 1), vw, vh);
}

module.exports = { pleatedShade, Buf, World, build, view, text, textW, hex, names, piece, load, signX, S, R, C, wrap, door, lamp, furni, wallRunX, wallRunY, modPx, acrossMap, BAYER, REG, clean, F3, VOL };

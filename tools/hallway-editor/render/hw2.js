/* Second pass: the hallway as stacked floors filling the page. Doors only on the
   two walls you can see. Each floor is rendered on its own, recoloured and lit on
   its own, then laid over the floor above it. */
const fs = require("fs");
const H = require("./hw.js");
const { Buf, hex, piece, load, C, modPx, acrossMap, BAYER } = H;
const { readPng } = require(H.R + "tools/png-decode.js");
const AVD = H.S + "/av/", TELE = H.S + "/tele/hh_furni_special_50/";
const VOID = [7, 6, 10];
H.names2 = () => fs.readFileSync(H.R + "tools/.cache/maze-list.txt", "utf8").split(/\r?\n/).filter(Boolean).map(l => H.clean(l.split("\t")[1])).sort((a, c) => a.replace(/[^A-Za-z0-9]/g, "").toLowerCase().localeCompare(c.replace(/[^A-Za-z0-9]/g, "").toLowerCase()));

/* ---- real client teleports ---- */
const TREG = JSON.parse(fs.readFileSync(H.S + "/regs.json", "utf8")).tele;
function teleport(w, kind, tx, ty, o) {
    /* The Imperial Teleport, s_doorD. Direction 4 faces +y; flipped, it faces +x for the other wall. */
    o = o || {};
    w.sprites.push({ depth: tx + ty + .9, draw: () => {
        const a = w.S(tx, ty), loc = [a[0] - 16, a[1] + 8];
        const parts = o.open ? ["c", "b", "a"] : ["b"];
        for (const p of parts) {
            const n = `s_${kind}_${p}_0_1_1_4_${o.open ? 1 : 0}`;
            const im = load(TELE + n + ".png"), reg = TREG[n];
            const x0 = o.flip ? loc[0] + 32 + reg[0] - im.w : loc[0] - reg[0];
            w.b.blit(im, x0, loc[1] - reg[1], { flip: o.flip });
        }
    }});
    const p = w.S(tx, ty);
    w.lamps.push({ x: p[0], y: p[1] - 30, tele: true });
}

/* ---- tiles drawn directly, so a floor or a step can sit at any height ---- */
const straight = piece("floor_mat_straight"), crossPc = piece("floor_mat_middle_crossroad"), plain = piece("floor_plain_tiles");
const m4 = v => ((v % 4) + 4) % 4;
function tile(w, X, Y, sample, lift) {
    const a = w.S(X, Y);
    for (let dy = 0; dy < 16; dy++) {
        const half = dy < 8 ? dy * 2 + 2 : (15 - dy) * 2 + 2;
        for (let dx = -half; dx <= half; dx++) {
            const c = sample(dx, dy);
            if (c) w.b.set(a[0] + dx, a[1] + dy - (lift || 0), c);
        }
    }
}
function floorSample(w, X, Y) {
    const W = w.W, plainS = (dx, dy) => modPx(plain, false, 2 + m4(X), 2 + m4(Y), dx, dy);
    const runX = my => my === null ? plainS : (dx, dy) => modPx(straight, true, 2 + m4(X), my, dx, dy);
    const runY = my => my === null ? plainS : (dx, dy) => modPx(straight, false, my, 2 + m4(Y), dx, dy);
    if (w.chevron && X < W && Y < W) {
        const ma = X - (W - 4) / 2 - 1, mb = Y - (W - 4) / 2 - 1;
        if (ma >= 0 && ma < 4 && mb >= 0 && mb < 4) return (dx, dy) => modPx(crossPc, false, 2 + ma, 2 + mb, dx, dy);
        const a = Math.min(X, Y);
        const my = a < 2 ? null : a < 5 ? a - 2 : 4;
        return X <= Y ? runY(my) : runX(my);
    }
    if (w.chevron && Y >= W) return runY(acrossMap(X, W));
    return runX(acrossMap(Y, W));
}

/* ---- stairs: a flight rising 16px a tile, carpet running up it, brass on every nosing ---- */
const RISE = 16;
function stairsX(w, a) {
    /* on the wing along x: climbs toward -y, from y=7 up to the floor above at y=0 */
    const WD = 6, N = 7, b = w.b;
    for (let Y = 0; Y < N; Y++) {
        const e = (N - Y) * RISE;
        for (let i = 0; i < WD; i++) tile(w, a + i, Y, (dx, dy) => modPx(straight, false, i + 1, 2 + m4(Y), dx, dy), e);
        /* the riser under this step's front edge */
        for (let u = 0; u < WD * 16; u++) for (let h = 0; h < RISE; h++) {
            const P = w.WX(a, Y + 1, u, e - h);
            const inRun = u >= 16 && u < WD * 16 - 16;
            let c = inRun ? ((u & 1) ? hex("510000") : hex("730000")) : ((u >> 1) % 4 === 0 ? C.d2 : C.d3);
            if (h === 0) c = C.b4; else if (h === 1) c = C.b2; else if (h === 2 || h === RISE - 1) c = C.k;
            b.set(P[0], P[1], c);
        }
    }
    /* the visible side of the flight, and a rail along each side */
    for (let v = 0; v <= N * 16; v++) {
        const top = Math.ceil(v / 16) * RISE;
        for (let h = 0; h <= top; h++) {
            const P = w.WY(a + WD, N, v, h);
            let c = (v >> 1) % 5 === 0 ? C.d2 : C.d3;
            if (h === top) c = C.k; else if (h === top - 1) c = C.d6; else if (h === 0) c = C.k;
            b.set(P[0], P[1], c);
        }
    }
    for (const side of [0, WD]) for (let v = 0; v <= N * 16; v++) {
        const hh = Math.round(v) + 16;
        const P = w.WY(a + side, N, v, hh);
        b.set(P[0], P[1], C.k); b.set(P[0], P[1] + 1, C.b4); b.set(P[0], P[1] + 2, C.b2); b.set(P[0], P[1] + 3, C.k);
        if (v % 16 === 8) for (let h = 0; h < 15; h++) { const Q = w.WY(a + side, N, v, hh - 3 - h); b.set(Q[0], Q[1], C.b1); b.set(Q[0] + 1, Q[1], C.k); }
    }
}
function stairsY(w, a) {
    /* on the wing along y: climbs toward -x, from x=7 up to the floor above at x=0 */
    const WD = 6, N = 7, b = w.b;
    for (let X = 0; X < N; X++) {
        const e = (N - X) * RISE;
        for (let i = 0; i < WD; i++) tile(w, X, a + i, (dx, dy) => modPx(straight, true, 2 + m4(X), i + 1, dx, dy), e);
        for (let u = 0; u < WD * 16; u++) for (let h = 0; h < RISE; h++) {
            const P = w.WY(X + 1, a + WD, u, e - h);
            const inRun = u >= 16 && u < WD * 16 - 16;
            let c = inRun ? ((u & 1) ? hex("510000") : hex("730000")) : ((u >> 1) % 4 === 0 ? C.d2 : C.d3);
            if (h === 0) c = C.b4; else if (h === 1) c = C.b2; else if (h === 2 || h === RISE - 1) c = C.k;
            b.set(P[0], P[1], c);
        }
    }
    for (let v = 0; v <= N * 16; v++) {
        const top = Math.ceil(v / 16) * RISE;
        for (let h = 0; h <= top; h++) {
            const P = w.WX(N, a + WD, -v, h);
            const fix = [P[0], w.S(N, a + WD)[1] + Math.floor(-v / -2) * -1 - h];
            let c = (v >> 1) % 5 === 0 ? C.d1 : C.d2;
            if (h === top) c = C.k; else if (h === top - 1) c = C.d5; else if (h === 0) c = C.k;
            b.set(fix[0], fix[1], c);
        }
    }
    for (const side of [0, WD]) for (let v = 0; v <= N * 16; v++) {
        const hh = v + 16, base = w.S(N, a + side);
        const x = base[0] - v, y = base[1] - Math.floor(v / 2) - hh;
        b.set(x, y, C.k); b.set(x, y + 1, C.b4); b.set(x, y + 2, C.b2); b.set(x, y + 3, C.k);
        if (v % 16 === 8) for (let h = 0; h < 15; h++) { b.set(x, y + 3 + h, C.b1); b.set(x + 1, y + 3 + h, C.k); }
    }
}

/* ---- low walls along the near edges ---- */
function railX(w, x0, x1, y) {
    if (x1 <= x0) return;
    const R = 15, px = (x1 - x0) * 16;
    for (let u = 0; u <= px; u++) for (let h = 0; h <= R; h++) {
        const P = w.WX(x0, y, u, h);
        let c = (u % 4 === 0) ? C.d2 : (u % 4 === 1 ? C.d4 : C.d3);
        if (h === R) c = C.k; else if (h === R - 1) c = C.d7; else if (h === R - 2) c = C.d5; else if (h === R - 3) c = C.k;
        w.b.set(P[0], P[1], c);
    }
}
function railY(w, x, y0, y1) {
    if (y1 <= y0) return;
    const R = 15, px = (y1 - y0) * 16;
    for (let u = 0; u <= px; u++) for (let h = 0; h <= R; h++) {
        const P = w.WY(x, y1, u, h);
        let c = (u % 4 === 0) ? C.d1 : (u % 4 === 1 ? C.d3 : C.d2);
        if (h === R) c = C.k; else if (h === R - 1) c = C.d6; else if (h === R - 2) c = C.d4; else if (h === R - 3) c = C.k;
        w.b.set(P[0], P[1], c);
    }
}
function mat(w, x, y, alongY) {
    for (let t = 0; t < 32; t++) for (let v = 0; v < 18; v++) {
        const a = alongY ? w.S(x, y - 2) : w.S(x, y);
        /* t along the wall, v out from it */
        const sx = alongY ? a[0] - t + v : a[0] + t - v;
        const sy = a[1] + Math.floor(t / 2) + Math.floor(v / 2);
        let c = (t + v) % 2 ? hex("3a0a12") : hex("4c1018");
        if (v === 0 || v === 17 || t < 1 || t > 30) c = C.k;
        else if (v === 1 || v === 16 || t < 2 || t > 29) c = C.b3;
        else if (v === 3 || v === 14 || t === 3 || t === 28) c = hex("6e1a14");
        w.b.set(sx, sy, c); w.b.set(alongY ? sx + 1 : sx - 1, sy, c);
    }
}
const identity = (x, y) => [x, y];

/* ---- colourways: exact client colours swapped, group by group ---- */
const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
const fromHsl = ([h, s, l]) => { h = ((h % 360) + 360) % 360 / 360; const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255].map(Math.round); const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(v => Math.round(v * 255)); };
const colours = n => { const im = piece(n), out = new Set(); for (let i = 0; i < im.rgba.length; i += 4) if (im.rgba[i + 3] > 128) out.add((im.rgba[i] << 16) | (im.rgba[i + 1] << 8) | im.rgba[i + 2]); return out; };
const GROUPS = (() => {
    const parquet = colours("floor_plain_tiles");
    const low = colours("wall_lower_left");
    const carpet = new Set([...colours("floor_mat_straight"), ...colours("floor_mat_middle_crossroad"), ...colours("floor_mat_upper_crossroad")].filter(c => !parquet.has(c)));
    const wall = colours("wall_upper_right_basic");
    const g = new Map();
    const hx = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    for (const c of parquet) if (c) g.set(c, "parquet");
    for (const c of low) if (c) g.set(c, "wood");
    for (const k of ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"]) { const v = C[k]; g.set((v[0] << 16) | (v[1] << 8) | v[2], "wood"); }
    for (const c of wall) { if (!c || g.has(c)) continue; const [h] = toHsl(hx(c)); g.set(c, (h > 55 && h < 240) ? "paperB" : "paperA"); }
    for (const c of carpet) if (c) g.set(c, "carpet");
    return g;
})();
/* each group: [hue, saturation multiplier, lightness multiplier]; no entry leaves it as the client has it */
const WAYS = {
    crimson: { label: "Crimson (the client's)" },
    royal: { label: "Royal blue", carpet: [224, 1.0, 1.15], paperA: [46, .75, 1.0], paperB: [222, .9, .85], wood: [24, .7, .8] },
    emerald: { label: "Emerald", carpet: [150, .95, 1.05], paperA: [52, .5, 1.15], paperB: [152, .75, .85], wood: [28, .6, .75] },
    plum: { label: "Plum", carpet: [292, .85, 1.15], paperA: [330, .55, 1.0], paperB: [268, .55, .85], wood: [340, .45, .7] },
    teal: { label: "Deep teal", carpet: [186, .9, 1.05], paperA: [172, .3, 1.05], paperB: [195, .55, .75], wood: [200, .25, .6], parquet: [36, .45, .9] },
    mustard: { label: "Mustard 70s", carpet: [38, 1.0, 1.35], paperA: [24, .8, .95], paperB: [90, .35, .9], wood: [30, .8, .8] },
    ghost: { label: "Ghost grey", carpet: [350, .14, 1.45], paperA: [40, .08, 1.05], paperB: [200, .08, .95], wood: [30, .12, .85], parquet: [40, .12, .85] },
    bubblegum: { label: "Sugar pink", carpet: [334, .8, 1.7], paperA: [340, .6, 1.2], paperB: [190, .4, 1.15], wood: [10, .35, 1.05], parquet: [30, .5, 1.1] }
};
function recolour(b, name) {
    const W = WAYS[name];
    if (!W || name === "crimson") return;
    const memo = new Map();
    for (let p = 0; p < b.d.length; p += 4) {
        const c = (b.d[p] << 16) | (b.d[p + 1] << 8) | b.d[p + 2];
        let m = memo.get(c);
        if (m === undefined) {
            const g = GROUPS.get(c), spec = g && W[g];
            if (spec) { const [, s, l] = toHsl([b.d[p], b.d[p + 1], b.d[p + 2]]); m = fromHsl([spec[0], Math.min(1, s * spec[1]), Math.min(.96, l * spec[2])]); }
            else m = null;
            memo.set(c, m);
        }
        if (m) { b.d[p] = m[0]; b.d[p + 1] = m[1]; b.d[p + 2] = m[2]; }
    }
}

/* ---- ambient lighting: three channels, stepped and dithered so it stays pixel art ---- */
const LIGHTS = {
    full: null,
    warm: { label: "Warm sconces", amb: [.62, .6, .6], lamp: () => [1.0, .72, .38], r: 165, p: .8, steps: 8 },
    midnight: { label: "After midnight", amb: [.26, .3, .46], lamp: i => i % 4 === 2 ? null : [1.15, .78, .42], r: 175, p: 1.05, steps: 8, own: .55, ownR: 125 },
    neon: { label: "Neon hum", amb: [.26, .2, .38], lamp: i => i % 2 ? [1.25, .28, .85] : [.2, .95, 1.2], r: 165, p: 1.1, steps: 8, own: .3, ownR: 105 },
    moon: { label: "Moonlight", amb: [.24, .3, .48], lamp: i => i % 5 === 0 ? [.95, .7, .4] : null, r: 150, p: .8, steps: 8, shafts: [.55, .7, 1.05], own: .3, ownR: 105 },
    backrooms: { label: "Fluorescent hum", amb: [.74, .72, .46], lamp: i => i % 5 === 3 ? null : [.5, .52, .3], r: 130, p: .55, steps: 8, sallow: .4 },
    emergency: { label: "Emergency power", amb: [.3, .1, .1], lamp: i => i % 3 === 0 ? [1.3, .22, .12] : null, r: 215, p: 1.2, steps: 8, own: .35, ownR: 105 }
};
function light(w, b, name, cam, dim) {
    const M = LIGHTS[name];
    if (!M && !dim) return;
    const lamps = M ? w.lamps.map((l, i) => { const c = l.tele ? [.35, .7, 1] : M.lamp(i); return c ? { ...l, c } : null; }).filter(Boolean) : [];
    const n = M ? M.steps : 8;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const p = (y * b.w + x) * 4;
        if (b.d[p] === VOID[0] && b.d[p + 1] === VOID[1] && b.d[p + 2] === VOID[2]) continue;
        let L = M ? [...M.amb] : [1, 1, 1];
        for (const l of lamps) {
            const dx = x - l.x; if (dx > M.r || dx < -M.r) continue;
            const dy = (y - l.y - 34) * 1.6; if (dy > M.r || dy < -M.r) continue;
            const d = Math.sqrt(dx * dx + dy * dy) / M.r;
            if (d < 1) { const f = (1 - d) * (1 - d) * M.p; L[0] += f * l.c[0]; L[1] += f * l.c[1]; L[2] += f * l.c[2]; }
        }
        if (M && M.shafts) {
            /* slanted bars of moonlight, in floor coordinates */
            const fx = ((x - w.ox) + 2 * (y - w.oy)) / 32, fy = (2 * (y - w.oy) - (x - w.ox)) / 32;
            const s = (fx + fy * .6);
            if (((s % 11) + 11) % 11 < 2.2) { L[0] += M.shafts[0]; L[1] += M.shafts[1]; L[2] += M.shafts[2]; }
        }
        if (M && M.own && cam) {
            const dx = x - cam[0], dy = (y - cam[1] + 20) * 1.5;
            const d = Math.sqrt(dx * dx + dy * dy) / M.ownR;
            if (d < 1) { const f = (1 - d) * M.own; L[0] += f; L[1] += f; L[2] += f; }
        }
        if (dim) L = L.map(v => v * dim);
        let r = b.d[p], g = b.d[p + 1], bl = b.d[p + 2];
        if (M && M.sallow) { const lum = r * .3 + g * .59 + bl * .11; r += (lum - r) * M.sallow; g += (lum - g) * M.sallow; bl += (lum - bl) * M.sallow; }
        const t = BAYER[(y & 3) * 4 + (x & 3)] / 16;
        const q = v => Math.floor(v * n + t + 1e-6) / n;
        b.d[p] = Math.min(255, r * q(L[0])); b.d[p + 1] = Math.min(255, g * q(L[1])); b.d[p + 2] = Math.min(255, bl * q(L[2]));
    }
}

/* ---- avatars ---- */
function avatarFile(size, dir, action, frame) { return load(`${AVD}${size}-${dir}-${action}-${frame}.png`); }

/* ---- the building ---- */
function build(cfg) {
    const shape = cfg.shape || "chevron", chevron = shape === "chevron", W = cfg.W || 14, STOREY = 114;
    const LX = chevron ? 80 : 170, LY = chevron ? 80 : 0;
    const top = cfg.top === undefined ? -4 : cfg.top, bot = cfg.bot === undefined ? 5 : cfg.bot;
    const REAL = [2, 1, 0];     // floor index by level: level 2 is the ground, you climb from there
    const stepY = chevron ? 16 * W + STOREY : 8 * W + STOREY, stepX = chevron ? 0 : -16 * W;
    const span = (LX + LY + W + 8) * 16;
    const terraceOx = (bot + 2) * 16 * W;
    const pw = chevron ? (LX + 8) * 32 + 60 : terraceOx + (-top) * 16 * W + LX * 16 + 300;
    const ph = (LX + LY) * 8 + stepY * (bot - top + 1) + 500;
    const ox0 = chevron ? pw >> 1 : terraceOx, oy0 = 200 - top * stepY;
    const master = new Buf(pw, ph, "07060a");
    const w = {
        W, chevron, ox: 0, oy: 0, b: null, lamps: [], sprites: [],
        S(x, y) { return [Math.round((x - y) * 16) + this.ox, Math.round((x + y) * 8) + this.oy]; },
        WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; },
        WY(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] - Math.floor(u / 2) - h]; }
    };
    const origin = n => [ox0 + (n * stepX), oy0 + n * stepY];
    const at = (n, x, y) => { const o = origin(n); return [Math.round((x - y) * 16) + o[0], Math.round((x + y) * 8) + o[1]]; };
    /* split the 39 mazes over three real floors */
    const names = H.names2();
    const perFloor = 13;
    const floors = { 2: names.slice(0, 13), 1: names.slice(13, 26), 0: names.slice(26) };
    const DX = chevron ? [3, 10, 27, 34, 41, 48, 55] : [2, 9, 16, 33, 40, 47, 54, 67, 74, 81, 88, 95, 102];
    const DY = chevron ? [5, 12, 29, 36, 43, 50] : [];
    const STAIR = chevron ? 16 : 23;
    const camPx = cfg.avatar ? at(cfg.avatar.n, cfg.avatar.x, cfg.avatar.y) : null;
    const layer = new Buf(pw, ph, "07060a");

    for (let n = top; n <= bot; n++) {
        const o = origin(n);
        w.ox = o[0]; w.oy = o[1]; w.lamps = []; w.sprites = []; w.mats = [];
        layer.d.fill(0);
        for (let i = 0; i < layer.d.length; i += 4) { layer.d[i] = VOID[0]; layer.d[i + 1] = VOID[1]; layer.d[i + 2] = VOID[2]; layer.d[i + 3] = 255; }
        w.b = layer;
        const real = floors[n];
        const seqX = real ? real.slice(0, 7) : [], seqY = real ? real.slice(7) : [];

        /* walls */
        H.wallRunX(w, 0, LX, 0);
        H.wallRunY(w, 0, 0, chevron ? LY : W);

        /* floor */
        for (let Y = 0; Y < (chevron ? LY : W); Y++) for (let X = 0; X < LX; X++) {
            if (chevron && X >= W && Y >= W) continue;
            const smp = floorSample(w, X, Y);
            tile(w, X, Y, smp);
        }
        /* slab edges */
        const pal = ["000000", "c79556", "b1804a", "9d7146", "9d7146", "895e39", "000000", "895e39", "4d2312", "895e39", "4d2312", "000000"].map(hex);
        const slab = (fn, len) => { for (let u = 0; u <= len; u++) pal.forEach((c, d) => { const P = fn(u, -1 - d); layer.set(P[0], P[1], d >= 1 && d <= 5 && ((u >> 1) & 3) === 0 ? c.map(v => v * .86 | 0) : c); }); };
        if (chevron) {
            slab((u, h) => w.WX(W, W, u, h), (LX - W) * 16);
            slab((u, h) => w.WY(W, LY, u, h), (LY - W) * 16);
        } else slab((u, h) => w.WX(0, W, u, h), LX * 16);
        slab((u, h) => w.WY(LX, W, u, h), W * 16);

        /* doors, lamps, signs on the two visible walls only */
        const pending = [];
        DX.forEach((x, i) => {
            const name = seqX[i];
            H.door(w, x, 0, { open: cfg.open && cfg.open[0] === n && cfg.open[1] === "x" && cfg.open[2] === i, hover: cfg.hover && cfg.hover[0] === n && cfg.hover[1] === "x" && cfg.hover[2] === i });
            mat(w, x, 0, false);
            H.lamp(w, x + 5.5, 0, {});
            if (name) pending.push({ x: x + 1, y: 0, h: 34, name, max: 17, hover: cfg.hover && cfg.hover[0] === n && cfg.hover[1] === "x" && cfg.hover[2] === i });
        });
        if (chevron) DY.forEach((y, i) => {
            const name = seqY[i];
            H.door(w, 0, y, { mapY: true });
            mat(w, 0, y, true);
            H.lamp(w, 0, y + 3.5, { mapY: true });
            if (name) pending.push({ x: 0, y: y - 1, h: 34, name, max: 17, alongY: true });
        });
        /* the flights up to the floor above */
        if (n > top) { stairsX(w, STAIR); if (chevron) stairsY(w, STAIR); }
        const upper = floors[n - 1];
        if (upper) {
            const lab = `Up to Floor ${3 - (n - 1)} (${upper[0][0].toUpperCase()} to ${upper[upper.length - 1][0].toUpperCase()})`;
            pending.push({ x: STAIR + 6, y: 2.5, h: 6, name: lab, max: 13, alongY: true });
            if (chevron) pending.push({ x: 2.5, y: STAIR + 6, h: 6, name: lab, max: 13 });
        }

        /* scenery, including the real teleports either side of each flight */
        const kind = "doorD";
        if (!cfg.noTele) { teleport(w, kind, STAIR + 8, 0); if (chevron) teleport(w, kind, 0, STAIR + 8, { flip: true }); }
        DX.forEach((x, i) => { if (i % 2 === 1 && x + 4 > STAIR + 6) H.furni(w, "hw_plant_a_0_0_0", x + 4, 0); });
        if (chevron) {
            H.furni(w, "hw_statue_a_0_0_0", 0, 0, {});
            const sofa = (x) => { H.furni(w, ["hw_sofa3_a_0_2_0", "hw_sofa3_b_0_2_0"], x, 0, { flip: true }); H.furni(w, "hw_sofa2_a_0_2_0", x + 1, 0, { flip: true }); H.furni(w, "hw_sofa1_a_0_2_0", x + 2, 0, { flip: true }); };
            sofa(61);
        }
        if (cfg.avatar && cfg.avatar.n === n && cfg.avatarS) {
            const a = cfg.avatar;
            w.sprites.push({ depth: a.x + a.y + .5, draw: () => {
                const im = avatarFile("s", a.dir, a.action || "std", a.frame || 0), P = w.S(a.x, a.y);
                layer.blit(im, P[0] - 16, P[1] + 8 - (im.h - 6));
            }});
        }
        w.sprites.sort((p, q) => p.depth - q.depth).forEach(s => s.draw());

        /* the low wall on the near edges, broken where a flight comes up from below */
        const gapX = n < bot ? [STAIR + (chevron ? W : 0), STAIR + (chevron ? W : 0) + 6] : null;
        if (chevron) {
            railX(w, W, gapX ? gapX[0] : LX, W); if (gapX) railX(w, gapX[1], LX, W);
            railY(w, W, W, gapX ? gapX[0] : LY); if (gapX) railY(w, W, gapX[1], LY);
        } else {
            railX(w, 0, gapX ? gapX[0] : LX, W); if (gapX) railX(w, gapX[1], LX, W);
        }

        /* colour, light, then the signs which stay readable under any light */
        const way = (cfg.waysByFloor && cfg.waysByFloor[((n % cfg.waysByFloor.length) + cfg.waysByFloor.length) % cfg.waysByFloor.length]) || cfg.way || "crimson";
        recolour(layer, way);
        const dim = cfg.floorDim ? (n === (cfg.avatar ? cfg.avatar.n : 1) ? 0 : cfg.floorDim) : 0;
        light(w, layer, cfg.light || "full", n === (cfg.avatar && cfg.avatar.n) ? camPx : null, dim || (LIGHTS[cfg.light] && real === undefined ? .7 : 0));
        for (const s of pending) H.signX(layer, w, s, 2, identity);

        /* over the floor above */
        for (let p = 0; p < layer.d.length; p += 4) {
            if (layer.d[p] === VOID[0] && layer.d[p + 1] === VOID[1] && layer.d[p + 2] === VOID[2]) continue;
            master.d[p] = layer.d[p]; master.d[p + 1] = layer.d[p + 1]; master.d[p + 2] = layer.d[p + 2];
        }
    }
    return { b: master, at, cfg };
}

function shot(world, px, py, vw, vh, zoom, o) {
    /* zoom 1: 1:1. zoom 2: doubled. full: Scale2x. Zoomed views get the real m-size Habbo. */
    o = o || {};
    const qw = Math.ceil(vw / zoom), qh = Math.ceil(vh / zoom);
    const cx = px - (qw >> 1), cy = py - (qh >> 1);
    const raw = world.b.crop(cx, cy, qw, qh);
    let out;
    if (zoom === 1) out = raw;
    else if (o.full) out = raw.scale2x();
    else { out = new Buf(qw * zoom, qh * zoom); out.paste(raw, 0, 0, zoom); }
    const a = world.cfg.avatar;
    if (a && zoom === 2 && !world.cfg.avatarS) {
        const im = avatarFile("m", a.dir, a.action || "std", a.frame || 0), P = world.at(a.n, a.x, a.y);
        const fx = (P[0] - cx) * 2, fy = (P[1] + 8 - cy) * 2;
        for (let j = -5; j <= 5; j++) for (let i = -18; i <= 18; i++) if (i * i / 324 + j * j / 25 < 1 && (i + j) % 2 === 0) { const X = fx + i, Y = fy + j; if (X >= 0 && Y >= 0 && X < out.w && Y < out.h) out.set(X, Y, out.get(X, Y).map(v => v * .55)); }
        const M = LIGHTS[world.cfg.light];
        const f = M ? (M.own ? M.amb.map(v => Math.min(1.05, v + M.own + .28)) : M.amb.map(v => Math.min(1.05, v + .3))) : [1, 1, 1];
        const x0 = fx - (im.w >> 1), y0 = fy - im.h + 11;
        for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const q = (j * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue; out.set(x0 + i, y0 + j, [Math.min(255, im.rgba[q] * f[0]), Math.min(255, im.rgba[q + 1] * f[1]), Math.min(255, im.rgba[q + 2] * f[2])]); }
    }
    return out;
}

module.exports = { build, shot, teleport, WAYS, LIGHTS, Buf, H, TELE, TREG, avatarFile, mat, railX, railY };

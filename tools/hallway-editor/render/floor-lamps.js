/* The floor lamps. Each part is a real turned shape: a radius at every height, spun round the lamp's upright and seen
   from the room's own 2:1 view. Every pixel works out which way that surface faces and takes a tone from a hand-made
   ramp, so curves, pleats and panes wrap round the form; the black line goes round the finished silhouette last, so it
   never breaks. About as tall as a Habbo (50px) with a foot narrower than a tile. Drawn on a small grid, then handed
   over with each pixel marked as glowing or not: a lit shade makes its own light and the room's lighting leaves it. */
"use strict";
const fs = require("fs"), path = require("path");
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const ramp = s => s.split(" ").map(hex);
const R = {
    brass: ramp("2e1a07 4a2c0c 6b4412 8e601a b5842a d9aa44 f0cd78 fff0bd"),
    bronze: ramp("140b06 21130a 321d10 472b18 5f3c23 7c5232 a07448 cfa679"),
    antique: ramp("24130a 3a2110 54321a 6e4524 8c5c30 ab7a44 cc9f66 eed09c"),
    shadeLit: ramp("a8622a c67f38 e0a050 f2bd6e fbd58f ffe6ae fff2cd fffbe8"),
    shadeOff: ramp("7d6a4c 94805e aa9672 bdaa86 cdbb98 dccba9 e8d9ba f2e7cd"),
    trimLit: ramp("5e3410 8a5418 b57c28 d9a440 f4cc70"),
    trimOff: ramp("3f2a10 5c3e16 7c5620 9c7230 bc9244"),
    alabLit: ramp("b56f30 d08a42 e8a95c f6c67e ffdd9e ffecbf fff6da fffdf0"),
    alabOff: ramp("8a7a60 a09078 b5a68e c6b9a2 d5cab5 e2d9c7 ece5d6 f6f1e6"),
    inLit: ramp("e8b56c f6cf8c ffe2ad fff1cf fffae8 ffffff"),
    inOff: ramp("7c6a4e 8f7c5e a18f70 b3a182 c4b394 d3c4a8")
};
/* a tone from 0 to 1 on a ramp */
const pick = (r, t) => r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))];
const LIGHT = [-.58, .62, .53], VIEW = [0, .45, .89];
const norm = v => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
const HALF = norm([LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function canvas() {
    const W = 64, H = 84, OX = 32, OY = 72, col = new Array(W * H).fill(null), glow = new Uint8Array(W * H), cell = new Int32Array(W * H);
    const at = (x, y) => { const X = x + OX, Y = y + OY; return X < 0 || Y < 0 || X >= W || Y >= H ? -1 : Y * W + X; };
    const put = (x, y, c, g, id) => { const i = at(x, y); if (i < 0) return; col[i] = c; glow[i] = g ? 1 : 0; cell[i] = id || 0; };
    /* spin a radius round the upright, from height h0 up to h1. Higher points go on last: of two on a line of sight the higher is nearer. */
    const spin = (h0, h1, rf, shade) => {
        for (let h = h0; h <= h1 + 1e-6; h += .125) {
            const t = h1 > h0 ? (h - h0) / (h1 - h0) : 0, r = rf(t); if (r <= 0) continue;
            const dt = .02, dr = (rf(Math.min(1, t + dt)) - rf(Math.max(0, t - dt))) / (dt * 2 * Math.max(.5, h1 - h0));
            for (let i = -Math.floor(r); i <= Math.floor(r); i++) {
                const s = i / r, c = Math.sqrt(Math.max(0, 1 - s * s)), n = norm([s, -dr, c]);
                const y = Math.round(-h + r / 2 * c), o = shade({ s, c, n, t, h, i, r });
                if (o) put(i, y, o.c || o, o.g, o.id);
            }
        }
    };
    /* a flat ring or disc looking up at you */
    const disc = (h, r, shade) => {
        const ry = r / 2, Y0 = Math.round(-h);
        for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) {
            const e = (i * i) / (r * r) + (j * j) / (ry * ry); if (e > 1.02) continue;
            const o = shade(i, j, e); if (o) put(i, Y0 + j, o.c || o, o.g, o.id);
        }
    };
    /* a dark line along the front of an edge, where one part sits on another */
    const crease = (h, r, c) => { for (let i = -Math.floor(r); i <= Math.floor(r); i++) { const s = i / r, y = Math.round(-h + r / 2 * Math.sqrt(1 - s * s)), k = at(i, y); if (k >= 0 && col[k]) { col[k] = c; glow[k] = 0; } } };
    /* lead between panes: wherever two panes meet, one pixel of it */
    const leadLines = (c) => {
        for (let Y = 0; Y < H - 1; Y++) for (let X = 0; X < W - 1; X++) {
            const i = Y * W + X, id = cell[i]; if (!id || !col[i]) continue;
            const a = cell[i + 1], b = cell[i + W];
            if ((a && a !== id) || (b && b !== id)) { col[i] = c; glow[i] = 0; }
        }
    };
    /* the black line round the outside */
    const outline = () => {
        const add = [];
        for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
            if (col[Y * W + X]) continue;
            const f = (a, b) => a >= 0 && b >= 0 && a < W && b < H && col[b * W + a];
            if (f(X - 1, Y) || f(X + 1, Y) || f(X, Y - 1) || f(X, Y + 1)) add.push(Y * W + X);
        }
        for (const i of add) col[i] = [0, 0, 0];
    };
    return { W, H, OX, OY, col, glow, spin, disc, crease, leadLines, outline, putPx: put };
}

/* polished metal: light on the left, a dark band turning away, a little light thrown back at the far edge */
const metal = (r, k = 0) => ({ s, n }) => {
    const d = dot(n, LIGHT), sp = Math.pow(Math.max(0, dot(n, HALF)), 22);
    const back = s > .82 ? .14 : 0;
    return pick(r, .3 + .36 * d + .62 * sp + back + k);
};
const lerp = (a, b, t) => a + (b - a) * t, sine = t => Math.sin(t * Math.PI), ease = t => t * t * (3 - 2 * t);

/* the foot, the same family on each: a moulded edge, a swelling dome, a neck. ribs: the bronze one's rib work */
function foot(g, r, ribs) {
    const m = metal(r);
    g.spin(0, 1.5, () => 6.5, m);
    g.disc(1.5, 6.5, (i, j, e) => e > .68 ? pick(r, i + j < 0 ? .86 : .5) : null);
    g.crease(1.5, 5.1, r[1]);
    g.spin(1.5, 4.5, t => lerp(5.2, 1.7, ease(t)), ribs ? q => { const v = Math.cos(Math.asin(q.s) * ribs); return pick(r, .26 + .36 * dot(q.n, LIGHT) + (v > .35 ? .22 : v < -.35 ? -.1 : 0)); } : m);
    g.spin(4.5, 6, t => 1.7 + .9 * sine(t), m);
    g.crease(4.5, 1.8, r[1]);
}
function collar(g, r, h, rad, tall = 2) {
    g.spin(h, h + tall, t => lerp(rad - .6, rad, sine(t)), metal(r, .05));
    g.crease(h, rad - .6, r[0]);
}

function hotel(g, off) {
    const r = R.brass, stem = metal(r);
    foot(g, r);
    g.spin(6, 13, () => 1.5, stem);
    g.spin(13, 20, t => 1.5 + 1.7 * sine(Math.pow(t, .8)), stem);                 // a turned vase in the stem
    g.crease(13, 1.5, r[1]); g.crease(20, 1.5, r[1]);
    g.spin(20, 29, () => 1.5, stem);
    collar(g, r, 23, 2.6);
    g.spin(29, 34, t => lerp(1.5, 2.6, t), stem);
    /* the shade. Light from the bulb is brightest level with it, and pleats wrap round the drum, closing up at the sides */
    const SH = off ? R.shadeOff : R.shadeLit, TR = off ? R.trimOff : R.trimLit, H0 = 33, H1 = 45, RB = 9.5, RT = 6;
    g.spin(H0, H1, t => lerp(RB, RT, t), ({ s, n, t }) => {
        const th = Math.asin(s), pleat = Math.cos(th * 15);
        if (t < .09 || t > .94) return { c: pick(TR, .5 + (s < 0 ? .3 : -.12) * (1 - Math.abs(s)) - .42 * Math.max(0, s) + (Math.abs(pleat) > .8 && t < .09 ? .1 : 0)), g: !off };
        if (t < .15 || t > .89) return { c: pick(SH, off ? .34 : .24), g: !off };
        if (off) return { c: pick(SH, .54 + .48 * dot(n, LIGHT) + .1 * pleat), g: false };
        const bulb = Math.exp(-((s * s) / .55 + ((t - .42) * (t - .42)) / .28));
        return { c: pick(SH, .08 + .84 * bulb + .1 * pleat - .12 * Math.max(0, s)), g: true };
    });
    /* the open top: the rim, the far wall of the shade lit inside, the top of the bulb, and a finial on its pin */
    const I = off ? R.inOff : R.inLit;
    g.disc(H1 + .5, RT, (i, j, e) => e > .62 ? { c: pick(TR, i + j < 0 ? 1 : .55), g: !off } : { c: pick(I, off ? .2 + .5 * (1 - e) : .25 + .75 * (1 - e)), g: !off });
    g.spin(H1, H1 + 2.5, () => .9, ({ s }) => pick(R.bronze, s < 0 ? .7 : .5));
    g.spin(H1 + 2.5, H1 + 4.5, t => 1.1 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1))) + .4, metal(r, .1));
    g.outline();
    return 38;
}

function torch(g, off) {
    const r = R.brass, stem = metal(r);
    foot(g, r);
    g.spin(6, 20, t => lerp(1.5, 1.1, t), stem);
    g.spin(20, 24, t => 1.2 + 1.5 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1))), stem);        // a turned ball halfway up
    g.crease(20, 1.2, r[1]); g.crease(24, 1.2, r[1]);
    g.spin(24, 34, t => lerp(1.1, 1.3, t), stem);
    /* a flared cup that carries the bowl */
    g.spin(33, 37, t => lerp(1.3, 3.2, t * t), metal(r, .06));
    /* the bowl: alabaster, its flutes running up and opening out; the light comes through it from inside */
    const A = off ? R.alabOff : R.alabLit, H0 = 36, H1 = 47, RB = 2.8, RT = 10;
    const bowl = t => lerp(RB, RT, Math.pow(t, .8));
    g.spin(H0, H1, bowl, ({ s, n, t }) => {
        const flute = Math.cos(Math.asin(s) * 12), band = (t * 9 + Math.sin(s * 4) * .9) % 3 < .34;       // a faint vein through the stone
        if (off) return { c: pick(A, .36 + .5 * dot(n, LIGHT) + .1 * flute - (band ? .05 : 0)), g: false };
        return { c: pick(A, .04 + .58 * t + .15 * flute - .2 * Math.max(0, s) + .12 * (1 - Math.abs(s)) - (band ? .05 : 0)), g: true };
    });
    /* the rim in brass, and inside it the far wall of the bowl going up to white over the bulb */
    const I = off ? R.inOff : R.inLit;
    g.disc(H1 + .5, RT + .4, (i, j, e) => {
        if (e > .74) return { c: pick(r, i + j < 0 ? .86 : j > 0 ? .44 : .62), g: !off };
        const e2 = e / .74, far = j < 0 ? .12 : -.1;
        return { c: pick(I, off ? .1 + .6 * (1 - e2) : .02 + 1.1 * (1 - e2) + far), g: !off };
    });
    g.outline();
    return 45;
}

const JEWEL = { ruby: "d8402a", garnet: "a92a22", amber: "f2a033", honey: "ffcd62", cream: "ffe6a8", emerald: "379c5e", moss: "6c9a3a", teal: "2c8a78" };
/* The same family as the globe: its square foot and straight pole in the same antique metal, in clean upright bands. The shade is a plain dome of a few large panes,
   amber above a ruby border, each a clean run of tone with one thin line of lead between. Tones go by how far across the dome you are, like the metal, so nothing speckles. */
const GLASS = {
    amberLit: ramp("c47a2c e09a3e f4bd62 ffd98e ffecbc"), rubyLit: ramp("7c241c a43428 c84c38 e06c52 f08a6c"),
    amberOff: ramp("5a3a1c 75502a 916a38 ab854c c4a266"), rubyOff: ramp("3c1612 56211a 702e24 8a3e30 a35240")
};
function tiffany(g, off) {
    const r = R.antique, m = clean(r), LEAD = hex("2a170b");
    block(g, r, 0, 2, 6); block(g, r, 2, 3, 3);
    g.spin(3, 31, () => 1, m);
    const H0 = 30, H1 = 40, RD = 10, A = off ? GLASS.amberOff : GLASS.amberLit, B = off ? GLASS.rubyOff : GLASS.rubyLit, BORDER = 3.4, TIER = 6.6;
    const dome = t => RD * Math.pow(Math.max(0, 1 - Math.pow(t, 2.8)), .5);
    g.spin(H0, H1, dome, ({ s, h, i, r: rad }) => {
        const up = h - H0;
        if (up < .9) return pick(r, bandAt(s));                                                       // the metal rim
        if (Math.abs(up - BORDER) < .5 || Math.abs(up - TIER) < .5) return { c: LEAD, g: false };      // the lead between the rows
        /* the panes staggered row on row: two seams in the big row, one above it */
        const row = up < BORDER ? 0 : up < TIER ? 1 : 2, seams = row === 1 ? [-.46, .46] : row === 2 ? [0] : [-.72, 0, .72];
        if (seams.some(q => i === Math.round(q * rad))) return { c: LEAD, g: false };
        const cross = 1 - s * s, shade = off ? bandAt(s) * .9 + .12 : .12 + .88 * cross - .14 * Math.max(0, s);
        return { c: pick(row === 0 ? B : A, row === 0 ? shade - .2 : shade), g: !off };
    });
    /* the crown and a plain knob, in the base's metal */
    g.spin(H1 - 1.5, H1 + .5, t => lerp(3.4, 2.6, t), m);
    g.disc(H1 + .5, 2.6, (i, j) => pick(r, i + j < 0 ? .9 : .6));
    g.outline();
    return 34;
}

/* A low lamp, half the uplighter's height, with a round glass globe. Built from the floor up the way a real one is: a weighted foot with a
   moulded edge, a raised boss the pole screws into with a flange round its base, the pole, then a turned socket with a gallery ring that
   the globe sits in. A sphere is round from every angle, so the globe is a true circle, not a squashed ellipse. */
const GLOBE_LIT = ramp("c98a48 e0a662 f2c488 fbdba8 ffeac6 fff4dd fffaee ffffff"), GLOBE_OFF = ramp("6f6a68 8a8583 a39f9c b9b5b1 ccc8c3 dcd9d4 ebe9e5 ffffff");
/* Clean metal for small turned parts: the tone goes by how far across the part you are, in even upright bands, and a surface sloping up to you is a step lighter.
   Lighting each pixel by its true angle looks mottled at this size, which is what made the first base look amateur. */
const BANDS = [[-1, .34], [-.82, .62], [-.5, .98], [-.22, .78], [.12, .54], [.5, .34], [.84, .18], [1, .3]];
const bandAt = s => { for (let i = 1; i < BANDS.length; i++) if (s <= BANDS[i][0]) { const [x0, a0] = BANDS[i - 1], [x1, a1] = BANDS[i]; return a0 + (a1 - a0) * (s - x0) / (x1 - x0); } return .3; };
const clean = (r, k = 0) => ({ s, n }) => pick(r, bandAt(s) + k + Math.max(0, n[1]) * .16);
/* Straight lines only: he found curved bases too curvy. Flat rounds and straight sides, every part a plain turned shape. */
/* a square block on the 2:1 slant: light top, lit left face, shaded right face, and a bright line along the top's front edges */
function block(g, r, h0, h1, w) {
    for (let x = -w; x <= w; x++) {
        const dy = Math.floor((w - Math.abs(x)) / 2), edge = -h1 + dy;
        for (let y = -h1 - dy; y < edge; y++) g.putPx(x, y, pick(r, x + y + h1 < 0 ? .72 : .62));
        g.putPx(x, edge, pick(r, x <= 0 ? .95 : .7));
        for (let y = edge + 1; y <= -h0 + dy; y++) g.putPx(x, y, pick(r, x < 0 ? .46 : x === 0 ? .36 : .2));
    }
}
const cup = (g, m, from) => g.spin(from, 13, t => lerp(1, 2.5, t), m);
const GLOBE_BASES = {
    /* a square foot in two steps, so its edges run straight along the floor's own lines, and a straight pole */
    square(g, r, m) {
        block(g, r, 0, 2, 6); block(g, r, 2, 3, 3);
        g.spin(3, 11, () => 1, m);
        cup(g, m, 11);
    }
};
const GLOBE = { base: "square", metal: "antique" };
function globe(g, off, opt) {
    const o = opt || GLOBE, r = R[o.metal], m = clean(r);
    GLOBE_BASES[o.base](g, r, m);
    /* the globe, a true circle: light from inside when lit, frosted glass with a highlight when not */
    const RAD = 5.5, CY = 18.5;
    const X0 = -Math.ceil(RAD), Y0 = -Math.ceil(RAD);
    for (let j = Y0; j <= -Y0; j++) for (let i = X0; i <= -X0; i++) {
        const dd = i * i + j * j; if (dd > RAD * RAD) continue;
        const nx = i / RAD, ny = -j / RAD, nz = Math.sqrt(Math.max(0, 1 - dd / (RAD * RAD))), n = [nx, ny, nz], d = dot(n, LIGHT), sp = Math.pow(Math.max(0, dot(n, HALF)), 40);
        let c;
        if (off) c = pick(GLOBE_OFF, .14 + .5 * Math.max(0, d * .5 + .5) + .22 * nz + (sp > .5 ? .5 : 0));
        else c = pick(GLOBE_LIT, .02 + .86 * nz * nz + .12 * Math.max(0, d) - .08 * Math.max(0, nx));
        g.putPx(i, Math.round(-CY) + j, c, true);        // out of the room's lighting either way, which would speckle its smooth shading
    }
    /* the gallery ring holding it, in front of the globe's foot */
    g.spin(13, 14.5, t => lerp(2.8, 3.2, t), metal(r, .1));
    g.crease(13, 2.8, r[0]);
    g.disc(14.5, 3.2, (i, j, e) => j < 0 ? null : e > .55 ? pick(r, i < 0 ? .95 : .6) : null);
    g.outline();
    return 18;
}
const STYLES = { hotel: "Hotel drum", torch: "Uplighter", tiffany: "Stained glass", globe: "Globe" };
const KINDS = { hotel, torch, tiffany, globe };

/* a glowing colour, seen through a shade lit in a colour you chose: the dark of it takes the colour, the brightest stays nearly white */
function tintGlow(c, code) {
    const t = hex(String(code).replace(/^#/, "")), l = (c[0] * .3 + c[1] * .59 + c[2] * .11) / 255, hot = Math.pow(l, 7) * .55;
    return t.map(v => Math.min(255, Math.round(v * (.28 + .86 * l) * (1 - hot) + 255 * hot)));
}
/* The globe lamp is his to draw: art/lamps/globe-lamp.png, lit on the left half, off on the right, at the size it appears. Save over it and the map updates.
   Without a readable file, it falls back on the drawn one. */
const { readPng } = require("../../png-decode.js");
const SHEET = path.join(__dirname, "..", "art", "lamps", "globe-lamp.png"), GLOBE_FOOT_UP = 6, GLOBE_MID = 18, GLOBE_RAD = 5.5, RING_TOP = -13;
let sheet = null;
function globeSheet() {
    try {
        const at = fs.statSync(SHEET).mtimeMs;
        if (!sheet || sheet.at !== at) { const im = readPng(SHEET); sheet = { at, im, memo: new Map() }; }
    } catch (e) { /* half-saved or missing: keep what we had */ }
    return sheet;
}
function pixelsFromSheet(sh, off, colour) {
    const k = (off ? "off" : "lit") + (colour && !off ? colour : ""); if (sh.memo.has(k)) return sh.memo.get(k);
    const { im } = sh, FW = im.w >> 1, OX = FW >> 1, OY = im.h - GLOBE_FOOT_UP, list = [], x0 = off ? FW : 0;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < FW; x++) {
        const q = (y * im.w + x0 + x) * 4; if (im.rgba[q + 3] < 128) continue;
        const dx = x - OX, dy = y - OY, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]];
        /* the glass makes its own light; the metal ring across its foot doesn't */
        const glass = Math.hypot(dx, dy + GLOBE_MID) <= GLOBE_RAD && dy < RING_TOP && !(dy === RING_TOP - 1 && Math.abs(dx) > 2);
        list.push([dx, dy, glass && colour && !off ? tintGlow(c, colour) : c, glass]);
    }
    const v = { list, lightH: 18 }; sh.memo.set(k, v); return v;
}
/* The globe wall light is his to draw too: art/lamps/globe-wall-light.png, 32x24 frames, top row lit, bottom row off, left frame for a wall or face looking left, right frame looking right.
   The point on the wall is at (16, 14) in each frame. */
const WALL_SHEET = path.join(__dirname, "..", "art", "lamps", "globe-wall-light.png");
/* and from behind, for the faces of a pillar turned away from you: globe-wall-light-back.png, the same layout with the fixing point at (16, 17). The pillar hides the plate. */
const BACK_SHEET = path.join(__dirname, "..", "art", "lamps", "globe-wall-light-back.png");
const wallSheets = new Map();
function wallLight(out, off, colour, back) {
    const file = back ? BACK_SHEET : WALL_SHEET; let wallSheet = wallSheets.get(file);
    try {
        const at = fs.statSync(file).mtimeMs;
        if (!wallSheet || wallSheet.at !== at) { const im = readPng(file); wallSheet = { at, im, memo: new Map() }; wallSheets.set(file, wallSheet); }
    } catch (e) { /* half-saved or missing: keep what we had */ }
    if (!wallSheet) return null;
    const k = out + (off ? "off" : "lit") + (colour && !off ? colour : ""); if (wallSheet.memo.has(k)) return wallSheet.memo.get(k);
    const OY = back ? 17 : 14, GY = back ? 10 : 6, { im } = wallSheet, FW = 32, FH = 24, x0 = out < 0 ? 0 : FW, y0 = off ? FH : 0, list = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const X = x0 + x, Y = y0 + y; if (X >= im.w || Y >= im.h) continue;
        const q = (Y * im.w + X) * 4; if (im.rgba[q + 3] < 128) continue;
        const dx = x - 16, dy = y - OY, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]], glass = Math.hypot(dx - out * 8, dy + GY) <= 3.5;
        list.push([dx, dy, glass && colour && !off ? tintGlow(c, colour) : c, glass]);
    }
    wallSheet.memo.set(k, list); return list;
}
/* The wall light is his to draw as well: art/lamps/wall-light.png, 40x40 frames, top row lit, bottom row off, left frame for a back wall, right frame for a left wall, with the point on the wall at (20, 25).
   The shade is whatever sits above the cup, out at the end of the arm: that part makes its own light and takes a light's colour. */
const SCONCE_SHEET = path.join(__dirname, "..", "art", "lamps", "wall-light.png");
let sconceSheet = null;
function sconce(out, off, colour) {
    try {
        const at = fs.statSync(SCONCE_SHEET).mtimeMs;
        if (!sconceSheet || sconceSheet.at !== at) sconceSheet = { at, im: readPng(SCONCE_SHEET), memo: new Map() };
    } catch (e) { /* half-saved or missing: keep what we had */ }
    if (!sconceSheet) return null;
    const k = out + (off ? "off" : "lit") + (colour && !off ? colour : ""); if (sconceSheet.memo.has(k)) return sconceSheet.memo.get(k);
    const { im } = sconceSheet, FW = 40, FH = 40, x0 = out < 0 ? 0 : FW, y0 = off ? FH : 0, list = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const X = x0 + x, Y = y0 + y; if (X >= im.w || Y >= im.h) continue;
        const q = (Y * im.w + X) * 4; if (im.rgba[q + 3] < 128) continue;
        const dx = x - 20, dy = y - 25, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]], glass = !off && dy <= -5 && Math.abs(dx - out * 11) <= 8;
        list.push([dx, dy, glass && colour ? tintGlow(c, colour) : c, glass]);
    }
    sconceSheet.memo.set(k, list); return list;
}
const memo = new Map();
/* every pixel of one design, off or lit: [dx, dy, [r, g, b], glowing], and how far up its light sits */
function pixels(kind, off, colour, opt) {
    if (kind === "globe" && !opt) { const sh = globeSheet(); if (sh) return pixelsFromSheet(sh, off, colour); }
    const k = kind + (off ? "|off" : "|lit") + (colour && !off && kind !== "tiffany" ? colour : "") + JSON.stringify(opt || (kind === "globe" ? GLOBE : 0));
    if (memo.has(k)) return memo.get(k);
    const g = canvas(), lightH = KINDS[kind](g, off, opt), list = [];
    for (let Y = 0; Y < g.H; Y++) for (let X = 0; X < g.W; X++) { const c = g.col[Y * g.W + X]; if (c) { const lit = !!g.glow[Y * g.W + X]; list.push([X - g.OX, Y - g.OY, lit && colour && kind !== "tiffany" ? tintGlow(c, colour) : c, lit]); } }
    const v = { list, lightH };
    memo.set(k, v);
    return v;
}
module.exports = { STYLES, pixels, tintGlow, wallLight, sconce, GLOBE, GLOBE_LIT, GLOBE_OFF };

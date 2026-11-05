/* Third pass: a real floor plan. Every floor is a set of rectangles at a height; walls,
   slab edges and low walls are worked out from which tiles exist. */
const fs = require("fs");
const Parts = require("../furni-parts.js");
const H = require("./hw.js");
const FloorLamps = require("./floor-lamps.js");
const EdgeItems = require("./edge-items.js");
const WALL_ITEM = new Map(require("../wall-items.js").map(i => [i.id, i]));
const wallArtCache = new Map(), wallArt = f => { if (!wallArtCache.has(f)) wallArtCache.set(f, H_readPng(require("path").join(__dirname, "../art/wall", f))); return wallArtCache.get(f); };
const H_readPng = require("path").resolve(__dirname, "../../png-decode.js") && require("../../png-decode.js").readPng;
const W2 = require("./hw2.js");
const { Buf, hex, piece, load, C, modPx, acrossMap, BAYER } = H;
const { teleport, avatarFile } = W2;
const VOID = [7, 6, 10];
const straight = piece("floor_mat_straight"), crossPc = piece("floor_mat_middle_crossroad"), plain = piece("floor_plain_tiles");
const m4 = v => ((v % 4) + 4) % 4;

/* ---- rugs ---- */
const RUG = (() => {
    const parquet = new Set(); for (let i = 0; i < plain.rgba.length; i += 4) if (plain.rgba[i + 3] > 128) parquet.add((plain.rgba[i] << 16) | (plain.rgba[i + 1] << 8) | plain.rgba[i + 2]);
    const at = (a, b) => modPx(straight, true, 0, 0, a - b, Math.floor((a + b) / 2));
    const num = c => c ? (c[0] << 16) | (c[1] << 8) | c[2] : -1;
    const core = new Set([0x510000, 0x730000]);
    const line = []; for (let b = 0; b < 128; b++) line.push(at(68, b));
    let s0 = 0; while (s0 < 128 && (!line[s0] || parquet.has(num(line[s0])) )) s0++;
    let e0 = s0; for (let b = s0; b < 64; b++) if (line[b] && !core.has(num(line[b]))) e0 = b + 1;
    e0 += 2;
    return { ramp: [hex("000000"), ...line.slice(s0, e0).filter(Boolean)], core: e0, at };
})();
const CHAMFER = 30;
function rugAt(R, X, Y, dx, dy) {
    const a = Math.floor(X * 16 + (dx + 2 * dy) / 2), b = Math.floor(Y * 16 + (2 * dy - dx) / 2);
    const a0 = R.x0 * 16, a1 = R.x1 * 16, b0 = R.y0 * 16, b1 = R.y1 * 16;
    if (a < a0 || a >= a1 || b < b0 || b >= b1) return null;
    const da = a - a0, db = a1 - 1 - a, dc = b - b0, dd = b1 - 1 - b;
    const r = Math.min(da, db, dc, dd);
    if (r < RUG.ramp.length) return RUG.ramp[r];
    return R.alongY ? RUG.at(68 + (((b % 32) + 32) % 32), RUG.core + (((a % 16) + 16) % 16)) : RUG.at(68 + (((a % 32) + 32) % 32), RUG.core + (((b % 16) + 16) % 16));
}

/* Touching rugs join: the border is worked out from the shape they make together, so it runs round
   the outside of the whole thing, in and out of its corners, and never across a join. */
function rugField(rugs) {
    const set = new Set();
    for (const r of rugs) for (let X = r.x0; X < r.x1; X++) for (let Y = r.y0; Y < r.y1; Y++) set.add(X + "," + Y);
    /* each joined shape's stripes run along its longer side */
    const along = new Map();
    for (const start of set) {
        if (along.has(start)) continue;
        const q = [start], seen = [start]; along.set(start, false);
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        while (q.length) {
            const k = q.pop(), [X, Y] = k.split(",").map(Number);
            if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
            for (const n of [(X + 1) + "," + Y, (X - 1) + "," + Y, X + "," + (Y + 1), X + "," + (Y - 1)]) if (set.has(n) && !along.has(n)) { along.set(n, false); q.push(n); seen.push(n); }
        }
        const v = (y1 - y0) > (x1 - x0);
        for (const k of seen) along.set(k, v);
    }
    return { set, along, near: new Map() };
}
function rugFieldAt(F, X, Y, dx, dy) {
    const a = Math.floor(X * 16 + (dx + 2 * dy) / 2), b = Math.floor(Y * 16 + (2 * dy - dx) / 2);
    const TX = Math.floor(a / 16), TY = Math.floor(b / 16), key = TX + "," + TY;
    if (!F.set.has(key)) return null;
    let near = F.near.get(key);
    if (!near) {
        near = []; const R = Math.ceil(RUG.ramp.length / 16);
        for (let i = TX - R; i <= TX + R; i++) for (let j = TY - R; j <= TY + R; j++) if (!F.set.has(i + "," + j)) near.push(i * 16, j * 16);
        F.near.set(key, near);
    }
    let r = 1e9;
    for (let n = 0; n < near.length; n += 2) {
        const ax = near[n], by = near[n + 1];
        const da = a < ax ? ax - a - 1 : a >= ax + 16 ? a - ax - 16 : 0, db = b < by ? by - b - 1 : b >= by + 16 ? b - by - 16 : 0;
        const d = Math.max(da, db);
        if (d < r) r = d;
    }
    if (r < RUG.ramp.length) return RUG.ramp[r];
    return F.along.get(key) ? RUG.at(68 + (((b % 32) + 32) % 32), RUG.core + (((a % 16) + 16) % 16)) : RUG.at(68 + (((a % 32) + 32) % 32), RUG.core + (((b % 16) + 16) % 16));
}

/* ---- muted colourways: group -> [hue, sat x, light x] ---- */
const WAYS = {
    oxblood: { label: "Oxblood", carpet: [356, .5, .95], paperA: [18, .38, .92], paperB: [165, .22, .85], wood: [20, .62, .85], parquet: [34, .62, .92] },
    slate: { label: "Slate", carpet: [216, .24, 1.25], paperA: [36, .22, .95], paperB: [214, .2, .85], wood: [24, .4, .72], parquet: [32, .4, .85] },
    sage: { label: "Sage", carpet: [132, .2, 1.2], paperA: [58, .2, 1.0], paperB: [140, .18, .85], wood: [32, .4, .75], parquet: [40, .42, .9] },
    mauve: { label: "Dusty mauve", carpet: [318, .2, 1.25], paperA: [350, .2, 1.0], paperB: [282, .16, .85], wood: [350, .28, .72], parquet: [30, .34, .85] },
    ochre: { label: "Old ochre", carpet: [34, .42, 1.3], paperA: [28, .38, .95], paperB: [72, .16, .85], wood: [28, .55, .78], parquet: [36, .5, .88] },
    teal: { label: "Faded teal", carpet: [184, .26, 1.15], paperA: [168, .14, 1.05], paperB: [196, .2, .8], wood: [26, .32, .65], parquet: [34, .34, .82] },
    clay: { label: "Clay", carpet: [14, .36, 1.25], paperA: [24, .3, 1.02], paperB: [28, .14, .82], wood: [18, .45, .78], parquet: [28, .42, .9] },
    ash: { label: "Ash", carpet: [350, .08, 1.5], paperA: [40, .06, 1.05], paperB: [200, .06, .92], wood: [30, .1, .8], parquet: [40, .1, .85] }
};
const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
const fromHsl = ([h, s, l]) => { h = ((h % 360) + 360) % 360 / 360; const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255].map(Math.round); const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(v => Math.round(v * 255)); };
/* A floor's own colour: one pick changes that floor's main colour, and nothing else. The carpet takes it, and so does the wallpaper's
   darker stripe, kept muted so it sits on the wall as the green does. The light stripe, the wood and the parquet stay as they are on the
   standard floor, so every floor still belongs to the same building. */
const REF = { carpet: "730000", paperA: "be5d44", paperB: "38504f", wood: "712f16", parquet: "b2814b" };
const specFor = (group, h, s, l) => { const [, rs, rl] = toHsl(hex(REF[group])); return [h, s / (rs || 1), l / (rl || 1)]; };
const mixHue = (a, b, t) => { const d = ((b - a + 540) % 360) - 180; return a + d * t; };
/* Ash, in the Glukko Arms' colours: smoke-and-aubergine stone for the paper, near-black timber, moss green for the carpet, and a floor of thick dark oak planks */
{
    const aim = (group, code) => { const [h, s, l] = toHsl(hex(code)); return specFor(group, h, s, l); };
    Object.assign(WAYS.ash, { carpet: aim("carpet", "1c2610"), paperA: aim("paperA", "4d4852"), paperB: aim("paperB", "2c2a33"), wood: aim("wood", "2a2320"), parquet: aim("parquet", "3e2711"), planks: true, maxS: .55 });
}
function wayFromColour(code) {
    const [h, s, l] = toHsl(hex(code.replace(/^#/, ""))), base = WAYS.oxblood;
    return {
        label: code, carpet: specFor("carpet", h, s, l),
        paperA: base.paperA, wood: base.wood, parquet: base.parquet,
        paperB: specFor("paperB", h, Math.min(.34, s * .42 + .03), Math.max(.2, Math.min(.31, l * .55 + .08)))
    };
}
/* a wall's own colours, on top of the floor's */
function wayForWall(base, wall) {
    const one = (group, code) => { if (!code) return base[group]; const [h, s, l] = toHsl(hex(code.replace(/^#/, ""))); return specFor(group, h, s, l); };
    return { ...base, paperA: one("paperA", wall.A), paperB: one("paperB", wall.B), wood: one("wood", wall.wood) };
}
/* The ball post's wood takes the floor's own tone on each floor: its hue and depth of colour, a little lighter since the client drew it darker than the floor */
const POST_LIFT = 1.14, floorTint = name => { const way = wayOf(name) || WAYS.oxblood, spec = way.parquet; return c => { if (c[0] + c[1] + c[2] < 20) return null; const [, s, l] = toHsl(c); return fromHsl([spec[0], Math.min(way.maxS || 1, s * spec[1]), Math.min(1, l * spec[2] * POST_LIFT)]); }; };
const wayOf = name => { if (WAYS[name]) return WAYS[name]; if (typeof name === "string" && name.startsWith("hex:")) return (WAYS[name] = wayFromColour(name.slice(4))); return undefined; };
const colours = n => { const im = piece(n), out = new Set(); for (let i = 0; i < im.rgba.length; i += 4) if (im.rgba[i + 3] > 128) out.add((im.rgba[i] << 16) | (im.rgba[i + 1] << 8) | im.rgba[i + 2]); return out; };
const GROUPS = (() => {
    /* both faces of the wall: the client shades the second face with colours of its own, and any colour left out here
       stays the client's orange on every floor */
    const parquet = colours("floor_plain_tiles"), low = new Set([...colours("wall_lower_left"), ...colours("wall_lower_right")]), wall = new Set([...colours("wall_upper_right_basic"), ...colours("wall_upper_left_basic")]);
    const carpet = new Set([...colours("floor_mat_straight"), ...colours("floor_mat_middle_crossroad")].filter(c => !parquet.has(c)));
    const g = new Map(), hx = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255], num = v => (v[0] << 16) | (v[1] << 8) | v[2];
    for (const c of parquet) if (c) g.set(c, "parquet");
    for (const c of low) if (c) g.set(c, "wood");
    for (const k of ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"]) g.set(num(C[k]), "wood");
    for (const c of wall) { if (!c || g.has(c)) continue; const [h] = toHsl(hx(c)); g.set(c, (h > 55 && h < 240) ? "paperB" : "paperA"); }
    for (const c of carpet) if (c) g.set(c, "carpet");
    for (const h of ["3a0a12", "4c1018", "6e1a14", "510000", "730000", "bc5200", "9d2500"]) g.set(num(hex(h)), "carpet");
    for (const h of ["b2814b", "9e7247"]) g.set(num(hex(h)), "parquet");
    for (const n of ["hw_sofa1_a_0_2_0", "hw_sofa2_a_0_2_0", "hw_sofa3_a_0_2_0", "hw_sofa3_b_0_2_0"]) for (const c of colours(n)) if (c && !g.has(c)) g.set(c, "carpet");
    return g;
})();
function recolour(b, name, box, keep, walls) {
    const W = wayOf(name); if (!W) return;
    const memos = new Map(), memoFor = way => { let q = memos.get(way); if (!q) memos.set(way, q = new Map()); return q; };
    for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
        const p = (y * b.w + x) * 4, c = (b.d[p] << 16) | (b.d[p + 1] << 8) | b.d[p + 2];
        if (keep && keep[y * b.w + x] === c + 1) continue;      // still the piece that keeps its own colours
        const t = walls ? walls.tag[y * b.w + x] : 0, way = t ? walls.ways[t - 1] : W, memo = memoFor(way);
        let m = memo.get(c);
        if (m === undefined) { const g = GROUPS.get(c), spec = g && way[g]; if (spec) { const [, s, l] = toHsl([b.d[p], b.d[p + 1], b.d[p + 2]]); m = fromHsl([spec[0], Math.min(way.maxS || 1, s * spec[1]), Math.min(.92, l * spec[2])]); } else m = null; memo.set(c, m); }
        if (m) { b.d[p] = m[0]; b.d[p + 1] = m[1]; b.d[p + 2] = m[2]; }
    }
}

/* ---- light: only from sources you can see ---- */
const lampKey = (tx, ty) => Math.abs(Math.round(tx * 2) * 31 + Math.round(ty * 2) * 17);
const LIGHTS = {
    day: { label: "Daylight", off: true, amb: [1.1, 1.08, 1.04], lamp: () => null, tiles: 1, px: 1, p: 0 },
    dusk: { label: "Evening", amb: [.52, .41, .38], lamp: () => [1.05, .78, .46], tiles: 7.5, px: 105, p: .95 },
    dawn: { label: "Dawn", amb: [.5, .46, .56], lamp: i => i % 2 ? null : [1.0, .82, .6], tiles: 6.5, px: 95, p: .7 },
    sconces: { label: "Sconces on", amb: [.56, .53, .52], lamp: () => [1.0, .8, .5], tiles: 7.5, px: 105, p: .85 },
    night: { label: "Night lights", amb: [.17, .18, .25], lamp: i => i % 5 === 3 ? null : [1.15, .82, .46], tiles: 7, px: 100, p: 1.25 },
    failing: { label: "Half the bulbs gone", amb: [.2, .19, .22], lamp: i => i % 2 ? null : [1.15, .9, .55], tiles: 8.5, px: 120, p: 1.25 },
    cold: { label: "Cold fluorescent", amb: [.28, .3, .28], lamp: i => i % 4 === 3 ? null : [.72, .9, .82], tiles: 8, px: 110, p: 1.05 },
    gas: { label: "Gaslight", amb: [.16, .13, .12], lamp: i => i % 3 === 2 ? null : [1.25, .68, .28], tiles: 6.5, px: 92, p: 1.35 }
};

/* ---- the iso sign: letters and plate both sheared column by column ---- */
function wrapPx(name, maxW, f) {
    const lines = []; let cur = "";
    for (const word of String(name).split(" ")) {
        const next = cur ? cur + " " + word : word;
        if (cur && H.textW(next, f) > maxW) { lines.push(cur); cur = word; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
}
/* the sign crest's colours: a dark-to-bright ramp in the floor's own carpet colour */
function enamel(way) {
    const W = wayOf(way) || WAYS.oxblood, [h, sm, lm] = W.carpet;
    return [[.62, .17], [.56, .27], [.52, .38], [.5, .56]].map(([s, l]) => fromHsl([h, Math.min(1, s * Math.sqrt(sm)), Math.min(.8, l * Math.sqrt(lm))]));
}
function signIso(b, cx, cy, name, o) {
    /* An engraved hotel plaque: mahogany in a double brass frame with cut corners, a screw at each
       end, a little arched crest on top, a shadow on the wall, and letters cut into it. */
    o = o || {};
    const sh = o.alongY ? -1 : 1, f = o.font || "vb", pad = 12, lh = 10;
    const lines = o.lines || (o.w ? wrapPx(name, o.w - pad * 2, f) : H.wrap(name, o.max || 17));
    const widths = lines.map(t => H.textW(t, f));
    const tw = Math.max(...widths), PW = Math.max(tw + pad * 2, 40, o.w || 0), PH = Math.max(lines.length * lh + 9, o.h || 0);
    const extra = (PH - (lines.length * lh + 9)) >> 1;
    const L = -(PW >> 1), CUT = 4;
    const ink = o.hover ? hex("fff4c8") : (o.ink || hex("f6cf80")), cutInk = hex("170703");
    const wood = o.hover ? [hex("5a2410"), hex("4c1c0c")] : [hex("3a1508"), hex("301006")];
    const put = (u, v, c) => b.set(cx + L + u, cy + sh * Math.floor((L + u) / 2) - v, c);
    const ringOf = (u, v) => { const cu = Math.min(u, PW - 1 - u), cv = Math.min(v, PH - 1 - v); return Math.min(cu, cv, cu + cv - CUT); };
    /* the shadow it throws on the wall, one pixel across and two down */
    for (let u = 0; u < PW; u++) for (let v = 0; v < PH; v++) {
        if (ringOf(u, v) < 0) continue;
        const X = cx + L + u + 1, Y = cy + sh * Math.floor((L + u) / 2) - v + 2;
        if (X >= 0 && Y >= 0 && X < b.w && Y < b.h) { const k = b.get(X, Y); b.set(X, Y, [k[0] * .55, k[1] * .55, k[2] * .55]); }
    }
    /* the crest: a small stepped cap, straight-edged so it sits true on the slant, enamelled in the
       colour of this floor's carpet with a brass stud. Black all round; lit from the left and above. */
    const cm = PW >> 1, E = enamel(o.way);
    const block = (u0, u1, v0, v1) => {
        for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) {
            const edge = u === u0 || u === u1 || v === v1;
            put(u, v, edge ? C.k : v === v1 - 1 ? E[3] : u === u0 + 1 ? E[2] : u === u1 - 1 ? E[0] : E[1]);
        }
    };
    block(cm - 9, cm + 9, PH - 1, PH + 3);                                                        // the lower step
    block(cm - 5, cm + 5, PH + 2, PH + 6);                                                        // the upper step
    /* the stud */
    put(cm - 1, PH + 1, C.b1); put(cm + 1, PH + 1, C.b1); put(cm, PH + 2, C.b1); put(cm, PH, C.b1);
    put(cm, PH + 1, hex("ffe7a8"));
    /* the plaque */
    for (let u = 0; u < PW; u++) for (let v = 0; v < PH; v++) {
        const r = ringOf(u, v);
        if (r < 0) continue;
        let c;
        if (r === 0) c = C.k;
        else if (r === 1) { const lit = (v > PH / 2) || u < 3; c = lit ? hex("ffe7a8") : C.b1; }
        else if (r === 2) c = C.b2;
        else if (r === 3) c = C.k;
        else c = wood[(u + (v >> 1)) % 9 === 0 ? 1 : 0];
        put(u, v, c);
    }
    /* a thin engraved line just inside */
    for (let u = 6; u < PW - 6; u++) { put(u, 5, wood[1]); put(u, PH - 6, hex("5e2c14")); }
    /* a screw at each end */
    for (const su of [7, PW - 8]) {
        const sv = PH >> 1;
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { if (i * i + j * j > 5) continue; put(su + i, sv + j, i * i + j * j > 3 ? C.k : (i + j < 0 ? C.b4 : C.b2)); }
        put(su - 1, sv + 1, C.b1); put(su + 1, sv - 1, C.b1); put(su, sv, C.b1);
    }
    /* letters, with the dark of the cut under each */
    lines.forEach((ln, li) => {
        let U = -(widths[li] >> 1);
        const topV = PH - 7 - li * lh - extra;
        for (const ch of ln) {
            const g = H.VOL[f][ch] || H.VOL[f][" "];
            g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") { const col = U + i - 1, Y = cy + sh * Math.floor(col / 2) - topV + (j - 3); b.set(cx + col, Y + 1, cutInk); } });
            g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") { const col = U + i - 1, Y = cy + sh * Math.floor(col / 2) - topV + (j - 3); b.set(cx + col, Y, ink); } });
            U += g.w;
        }
    });
}

/* ---- the sign at the foot of a staircase ----
   A mahogany plaque in a brass frame, hanging on two chains from an iron arm, standing straight out from the wall: "Floor 1"
   and an arrow pointing diagonally up towards the stairs. Its face runs along the map's y, so it climbs to the right. (ax, ay) is
   the point on the wall at floor level. The size is worked out so the text and arrow always have a clear margin inside the frame;
   editor.js does the same sums to know where it is. */
const PLAQUE = { h: 66, off: 3, H: 30, frame: 2, pad: 4, textFloor: 6, arrowFloor: 16, wordGap: 4 };
const ARROW = ["...111111", "....11111", ".....1111", "....11111", "...111.11", "..111...1", ".111.....", "111......", "11......."];
function plaqueWidth(name) {
    const words = String(name).split(" "), tw = words.reduce((a, t) => a + H.textW(t, "vb"), 0) + (words.length - 1) * PLAQUE.wordGap;
    return Math.max(50, tw + 2 * (PLAQUE.frame + PLAQUE.pad));
}
function stairPlaque(b, ax, ay, name, o) {
    o = o || {};
    const BR = ["7a4a14", "b47a22", "ddaa63", "f2be70", "ffe7a8"].map(hex), WD = ["240a02", "3a1508", "4c1c0c", "5a2410", "7a3a1a", "925030"].map(hex), IRON = ["121016", "26222c", "3c3744", "5a5462"].map(hex);
    const { h, off, H: Hd, textFloor, arrowFloor, wordGap } = PLAQUE, Wd = plaqueWidth(name), L = ax - off - Wd, B = ay - h + Math.floor((Wd + off) / 2);
    const at = (s, t) => [L + s, B - Math.floor(s / 2) - t], put = (s, t, c) => { const q = at(s, t); b.set(q[0], q[1], c); };
    /* a shape, then a black line round the outside of it */
    const outlined = draw => {
        const seen = new Map(), mark = (x, y, c) => { if (x >= 0 && y >= 0 && x < b.w && y < b.h) seen.set(y * b.w + x, c); };
        draw(mark);
        for (const i of seen.keys()) { const x = i % b.w, y = (i / b.w) | 0; for (const [p, q] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((y + q) * b.w + x + p)) b.set(x + p, y + q, C.k); }
        for (const [i, c] of seen) b.set(i % b.w, (i / b.w) | 0, c);
    };
    /* the arm, level with the wall's slope going out, a little scroll under it, and a brass plate on the wall */
    const armH = h + Hd + 8, len = Wd + off + 2;
    outlined(mark => {
        for (let t = -6; t <= 6; t++) for (const u of [-1, 0, 1]) mark(ax + u, ay - armH - t + Math.floor(u / 2), u < 0 ? BR[3] : u ? BR[1] : BR[2]);
        for (let u = 0; u <= len; u++) { const y = ay - armH + Math.floor(u / 2); mark(ax - u, y, IRON[2]); mark(ax - u, y - 1, IRON[3]); }
        for (let a = 0; a < 44; a++) { const th = a / 44 * Math.PI * 1.5, r = 6 * (1 - a / 66); mark(Math.round(ax - 9 + Math.cos(th) * r), Math.round(ay - armH + 9 - Math.sin(th) * r), IRON[2]); }
        const e = [ax - len, ay - armH + Math.floor(len / 2) - 1]; for (const [p, q] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) mark(e[0] + p, e[1] + q, BR[3]);
    });
    /* two chains */
    for (const sc of [6, Wd - 7]) { const top = at(sc, Hd), armY = ay - armH + Math.floor((ax - top[0]) / 2) + 1; for (let y = armY; y < top[1]; y++) b.set(top[0], y, (y - armY) % 3 === 2 ? BR[0] : BR[2]); }
    /* the plaque, with its top edge and outer end showing */
    outlined(mark => {
        const set = (s, t, c) => { const q = at(s, t); mark(q[0], q[1], c); };
        for (let d = 1; d <= 2; d++) {
            for (let s = 0; s < Wd; s++) { const q = at(s, Hd - 1); mark(q[0] - d, q[1] - Math.ceil(d / 2), WD[5]); }
            for (let t = 0; t < Hd; t++) { const q = at(0, t); mark(q[0] - d, q[1] - Math.ceil(d / 2), WD[1]); }
        }
        for (let s = 0; s < Wd; s++) for (let t = 0; t < Hd; t++) { const r = Math.min(s, Wd - 1 - s, t, Hd - 1 - t); set(s, t, r === 0 ? BR[t > Hd / 2 ? 3 : 1] : r === 1 ? BR[0] : WD[(s + (t >> 1)) % 9 ? 1 : 2]); }
    });
    const ink = hex("f6cf80"), cut = hex("170703");
    /* the arrow, centred, pointing up towards the stairs: to the right, or the left when the stairs are that side */
    const a0 = (Wd - 9) >> 1;
    for (const [dt, c] of [[-1, cut], [0, ink]]) ARROW.forEach((row, j) => { for (let i = 0; i < 9; i++) if (row[o.left ? 8 - i : i] === "1") put(a0 + i, arrowFloor + 8 - j + dt, c); });
    /* the words, on their baseline: each letter's picture has blank rows above, and its foot at row 10 */
    const words = String(name).split(" "), tw = words.reduce((a, t) => a + H.textW(t, "vb"), 0) + (words.length - 1) * wordGap;
    let U = (Wd - tw) >> 1;
    for (const word of words) {
        for (const ch of word) {
            const g = H.VOL.vb[ch] || H.VOL.vb[" "];
            for (const [dt, c] of [[-1, cut], [0, ink]]) g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") put(U + i, textFloor + 10 - j + dt, c); });
            U += g.w;
        }
        U += wordGap;
    }
}

/* ---- half-size stairs ---- */
const TR = { run: [hex("510000"), hex("730000")], trim: [hex("bc5200"), hex("9d2500")] };
function treadCol(u, v, wpx) {
    /* u across the flight. Carpet stops one tile short of each side; polished wood outside it. */
    const r = Math.min(u - 16, wpx - 17 - u);
    if (r < 0) return (u === 0 || u === wpx - 1) ? C.k : (u % 3 === 0 ? C.d3 : C.d4);
    if (r < RUG.ramp.length) return RUG.ramp[r];
    return (u % 2) ? TR.run[0] : TR.run[1];
}
/* A flight of stairs, worked out backwards from each pixel: follow the line of sight and take the first
   surface it meets, so treads, risers and the side can't leave gaps or overlap each other. c runs across
   the flight, d along it; it climbs toward -d, a tread half a tile deep and a riser 8px. The carpet goes
   over both tread and riser as one length, so its stripes and border run unbroken up the stairs. */
function carpetTone(c, way) {
    const W = wayOf(way); if (!W) return c;
    const [, s, l] = toHsl(c), spec = W.carpet;
    return fromHsl([spec[0], Math.min(1, s * spec[1]), Math.min(1, l * spec[2])]);
}
/* A sofa keeps its wood on every floor, and only its cushions take the floor's carpet colour */
const CUSHION = new Set(["9d2400", "7e250a", "d34013", "730000", "330000"].map(h => { const c = hex(h); return (c[0] << 16) | (c[1] << 8) | c[2]; }));
/* The frame shares colours with the cushion, so colour alone can't tell them apart: the cushion is whatever joins up with the seat's own red, inside its black line. */
const cushionMasks = new Map();
function cushionMask(part) {
    let m = cushionMasks.get(part); if (m) return m;
    const im = piece(part), at = (x, y) => { const q = (y * im.w + x) * 4; return im.rgba[q + 3] < 128 ? -1 : (im.rgba[q] << 16) | (im.rgba[q + 1] << 8) | im.rgba[q + 2]; };
    m = new Uint8Array(im.w * im.h); const todo = [];
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (at(x, y) === 0x9d2400) { m[y * im.w + x] = 1; todo.push([x, y]); }
    while (todo.length) { const [x, y] = todo.pop(); for (const [X, Y] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (X < 0 || Y < 0 || X >= im.w || Y >= im.h || m[Y * im.w + X] || !CUSHION.has(at(X, Y))) continue; m[Y * im.w + X] = 1; todo.push([X, Y]); } }
    cushionMasks.set(part, m); return m;
}
function cushionTint(way) { return (c, part, i, j) => cushionMask(part)[j * piece(part).w + i] ? carpetTone(c, way).map(v => Math.round(v)) : null; }
/* the floor's own colours, darkest to lightest: steps within a floor are made of them, and so take the floor's colour with it */
const PARQUET = [...colours("floor_plain_tiles")].filter(c => c).map(c => [(c >> 16) & 255, (c >> 8) & 255, c & 255]).sort((a, c) => (a[0] + a[1] + a[2]) - (c[0] + c[1] + c[2]));
const pq = t => PARQUET[Math.max(0, Math.min(PARQUET.length - 1, Math.round(t * (PARQUET.length - 1))))], pqAll = pq;
/* a point on the floor's own tile pattern */
const parquetAt = (x, y) => { const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y; return modPx(plain, false, 2 + m4(X), 2 + m4(Y), Math.round((fx - fy) * 16), Math.floor((fx + fy) * 8)) || pq(.6); };
/* A floor of thick planks, one tile wide, running along x with staggered ends: worked out per pixel from where it falls on the floor, so it runs on unbroken from tile to tile.
   Drawn in the floor's own colours, so the colourway tones them like any floor. */
const PLANK_TONES = PARQUET.filter(c => GROUPS.get((c[0] << 16) | (c[1] << 8) | c[2]) === "parquet"), plq = t => PLANK_TONES[Math.max(0, Math.min(PLANK_TONES.length - 1, Math.round(t * (PLANK_TONES.length - 1))))];
const stepTones = way => (wayOf(way) || {}).planks ? t => plq(t * .62) : pqAll;      // the planks sit low in the floor's range, so a step's lit edge has to as well or it glows
const plankHash = (a, b, c) => { let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const plankAt = (X, Y, dx, dy) => plankAtUnits(X * 32 + 2 * dy + dx, Y * 32 + 2 * dy - dx);
const plankXY = (x, y) => plankAtUnits(Math.floor(x * 32), Math.floor(y * 32));
/* Laid like a brick wall: rows half a tile wide, every plank the same length, and each row's joints exactly halfway along the planks of the rows beside it.
   One thin dark line between planks and nothing else: the body tones stay well clear of the line's, so no grain or shading can sit against it and thicken it. */
const plankAtUnits = (xu, yu) => {
    const W = 16, L = 32 * 3, row = Math.floor(yu / W), ry = ((yu % W) + W) % W;
    const xp = xu + (((row % 2) + 2) % 2 ? L / 2 : 0), n = Math.floor(xp / L), rx = ((xp % L) + L) % L;
    if (ry < 2 || rx < 2) return PLANK_TONES[0];
    const last = PLANK_TONES.length - 1, lo = Math.min(2, last), body = lo + plankHash(row, n, 2) % Math.max(1, Math.min(3, last - lo));
    const g = plankHash(row * 8 + (ry >> 2), n, Math.floor((xp + plankHash(row, ry >> 2, 3) % 40) / 40)) % 9;
    return PLANK_TONES[Math.min(last, g === 0 ? body + 1 : body)];
};
/* The client's own short flights: each step 4px tall and 6px deep. */
const STEP_R = 4, STEP_D = 6 / 16;
/* Steps climbing towards you: the higher floor is nearer than the lower one, so each step's front faces away and only the tops show,
   nearly on top of each other. Drawn from the far step forward; the near side shows the stepped end. */
function flightUpToYou(w, o) {
    const { axis, c0, c1, dStart, steps, zB, carpet, way } = o, alongY = axis === "y", pq = stepTones(way), grainAt = (wayOf(way) || {}).planks ? plankXY : parquetAt;
    const scr = (c, d, z) => alongY ? [Math.round((c - d) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z] : [Math.round((d - c) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z];
    const [ca, cb] = carpet || [1e9, 1e9], put = (q, c) => w.b.set(q[0], q[1], c), toned = new Map();
    const rugAt = (cc, path) => { const r = Math.min(Math.floor((cc - ca) * 16), Math.floor((cb - cc) * 16 - 1e-6)), base = r < RUG.ramp.length ? RUG.ramp[r] : RUG.at(68 + (path % 32), RUG.core + (((Math.floor(cc * 16) % 16) + 16) % 16)), key = (base[0] << 16) | (base[1] << 8) | base[2]; if (!toned.has(key)) toned.set(key, carpetTone(base, way).map(v => Math.round(v))); return toned.get(key); };
    /* Going away from you, each step moves exactly 6 columns along and 1 row, so the steps can be laid as exact pixel strips along the same 2:1 line the floor's edges use.
       Sampling them pixel by pixel lost the lines between steps and made the edges jagged. Each step shows 2 rows past the nearer one: a shaded row along its far edge, then a lit one, then the floor's own grain where more of it shows,
       which is what makes it read as steps. The top one, next to the higher floor, shows all 6. Black only along the far edge of the lowest. */
    const wide = Math.round((c1 - c0) * 16), dim = (c, k) => [c[0] * k | 0, c[1] * k | 0, c[2] * k | 0];
    /* the end you can see first, so the steps lie over its top */
    const pts = [[c1, dStart, 0], [c1, dStart + steps * STEP_D, steps * STEP_R], [c1, dStart + steps * STEP_D, 0]].map(q => scr(q[0], q[1], q[2]));
    const X0 = Math.max(0, Math.min(...pts.map(q => q[0])) - 2), X1 = Math.min(w.b.w - 1, Math.max(...pts.map(q => q[0])) + 2), Y0 = Math.max(0, Math.min(...pts.map(q => q[1])) - 2), Y1 = Math.min(w.b.h - 1, Math.max(...pts.map(q => q[1])) + 2);
    for (let sy = Y0; sy <= Y1; sy++) for (let sx = X0; sx <= X1; sx++) {
        const A = (sx + .5 - w.ox) / 16, B = (sy + .5 - w.oy + zB) / 8, x0 = (A + B) / 2, y0 = (B - A) / 2, c = alongY ? x0 : y0, d = alongY ? y0 : x0, tz = c1 - c, zz = tz * 16, dd = d + tz, k = Math.floor((dd - dStart) / STEP_D);
        if (zz >= 0 && k >= 0 && k < steps && zz <= (k + 1) * STEP_R) w.b.set(sx, sy, pq(.42));
    }
    for (let k = 0; k < steps; k++) {
        const d0 = dStart + k * STEP_D, z = (k + 1) * STEP_R, rows = k === steps - 1 ? 6 : 2;
        /* One row down the screen, in one column, is 1/16 further across AND 1/16 further along, so the pattern has to move both ways or it shears. */
        for (let u = -rows - 1; u < wide; u++) {
            const p = scr(c0 + u / 16, d0, z);
            for (let r = 0; r <= rows; r++) {
                if (r === rows && k < steps - 1) break;
                const cc = c0 + (u + r + .5) / 16, dd = d0 + (r + .5) / 16; if (cc < c0 || cc >= c1) continue;
                const uu = Math.floor((cc - c0) * 16), end = uu === 0 || uu === wide - 1, far = r === 0, onRug = cc >= ca && cc < cb, rc = onRug && rugAt(cc, k * 6 + r);
                const col = far && k === 0 ? C.k : onRug ? (far ? dim(rc, .6) : rc) : far || end ? pq(.3) : r === 1 ? pq(1) : grainAt(alongY ? cc : dd, alongY ? dd : cc);
                w.b.set(p[0], p[1] + r, col);
            }
        }
    }
}
function flight(w, o) {
    const { axis, c0, c1, dTop, steps, zB, carpet, way } = o, alongY = axis === "y", pq = stepTones(way), planks = !!(wayOf(way) || {}).planks, grainAt = planks ? plankXY : parquetAt, tiled = !!o.tiled, woody = tiled || planks, R = o.rise || 8, D = o.tread || .5, dBot = dTop + steps * D, topZ = steps * R;
    const scr = (c, d, z) => alongY ? [Math.round((c - d) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z] : [Math.round((d - c) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z];
    const pts = [[c0, dBot, 0], [c1, dBot, 0], [c0, dTop, topZ], [c1, dTop, topZ], [c1, dTop, 0], [c0, dTop, 0]].map(q => scr(q[0], q[1], q[2]));
    const X0 = Math.max(0, Math.min(...pts.map(q => q[0])) - 2), X1 = Math.min(w.b.w - 1, Math.max(...pts.map(q => q[0])) + 2);
    const Y0 = Math.max(0, Math.min(...pts.map(q => q[1])) - 2), Y1 = Math.min(w.b.h - 1, Math.max(...pts.map(q => q[1])) + 2);
    const [ca, cb] = carpet || [1e9, 1e9], tones = new Map();
    const tone = (c, k) => { const key = (c[0] << 16 | c[1] << 8 | c[2]) + "|" + k; let v = tones.get(key); if (!v) { const t = carpetTone(c, way); v = [Math.min(255, t[0] * k) | 0, Math.min(255, t[1] * k) | 0, Math.min(255, t[2] * k) | 0]; tones.set(key, v); } return v; };
    const wide = Math.round((c1 - c0) * 16);
    const skin = (cc, path, wood, k) => {
        const u = Math.floor((cc - c0) * 16);
        if (u < 1 || u >= wide - 1) return C.k;
        if (cc >= ca && cc < cb) {
            const r = Math.min(Math.floor((cc - ca) * 16), Math.floor((cb - cc) * 16 - 1e-6));
            const base = r < RUG.ramp.length ? RUG.ramp[r] : RUG.at(68 + (path % 32), RUG.core + (((Math.floor(cc * 16) % 16) + 16) % 16));
            return tone(base, k);
        }
        return wood(u);
    };
    for (let sy = Y0; sy <= Y1; sy++) for (let sx = X0; sx <= X1; sx++) {
        const A = (sx + .5 - w.ox) / 16, B = (sy + .5 - w.oy + zB) / 8, x0 = (A + B) / 2, y0 = (B - A) / 2, c = alongY ? x0 : y0, d = alongY ? y0 : x0;
        let best = -1e9, col = null;
        for (let k = 0; k < steps; k++) {
            const front = dBot - k * D, back = front - D;
            /* the tread */
            const tt = (k + 1) * R / 16;
            if (tt > best) {
                const cc = c + tt, dd = d + tt;
                if (cc >= c0 && cc < c1 && dd < front && dd >= back) {
                    const depth = (front - dd) * 16, deep = D * 16 - 1, shade = depth < 1 ? 1.5 : depth >= deep ? .55 : 1.12;
                    best = tt;
                    col = skin(cc, k * 16 + 8 + Math.floor(depth), woody ? () => depth < 1 ? pq(1) : depth >= deep ? pq(.35) : grainAt(alongY ? cc : dd, alongY ? dd : cc) : u => depth < 1 ? C.d6 : depth >= deep ? C.d1 : (((u >> 2) + k) % 3 ? C.d4 : C.d3), shade);
                }
            }
            /* the riser */
            const tr = front - d, zz = tr * 16;
            if (tr > best && zz >= k * R && zz < (k + 1) * R) {
                const cc = c + tr;
                if (cc >= c0 && cc < c1) {
                    const h = zz - k * R, shade = h >= R - 1 ? .42 : h < 1 ? .5 : .66;
                    best = tr;
                    col = skin(cc, k * 16 + Math.floor(h), woody ? u => h >= R - 1 ? pq(0) : h < 1 ? pq(.15) : (u >> 1) % 3 ? pq(.42) : pq(.3) : () => h >= R - 1 ? C.d0 : h < 1 ? C.d1 : C.d2, shade);
                }
            }
        }
        /* the side facing you */
        const ts = c1 - c, ds = d + ts, zs = ts * 16;
        if (ts > best && ds >= dTop && ds < dBot && zs >= 0) {
            const k = Math.floor((dBot - ds) / D), top = (k + 1) * R;
            if (zs < top) { const gap = top - zs; best = ts; col = woody ? (gap < 1 ? pq(1) : gap < 2 ? pq(0) : zs < 1 ? C.k : (Math.floor(ds * 16) >> 1) % 3 ? pq(.55) : pq(.4)) : gap < 1 ? C.d6 : gap < 2 ? C.k : zs < 1 ? C.k : ((Math.floor(ds * 16) >> 1) % 6 === 0 ? C.d2 : C.d3); }
        }
        if (col) w.b.set(sx, sy, col);
    }
    /* handrails: one on the wall, one with spindles on the open side */
    const RAIL = 20, len = steps * 8;
    const railAt = (cRail, i) => { const dd = dBot - i / 16; return scr(cRail, dd, (dBot - dd) * 16 + RAIL); };
    if (o.far !== false && !tiled) for (let i = 0; i <= len; i++) {
        const q = railAt(c0 + .1, i);
        w.b.set(q[0], q[1] - 2, C.k); w.b.set(q[0], q[1] - 1, C.d6); w.b.set(q[0], q[1], C.d4); w.b.set(q[0], q[1] + 1, C.k);
        if (i % 32 === 8) for (let h = 2; h < 5; h++) w.b.set(q[0], q[1] + h, C.b1);
    }
    if (o.near !== false && !tiled) {
        for (let i = 4; i < len; i += 16) { const q = railAt(c1 - .05, i); for (let h = 2; h < RAIL; h++) { w.b.set(q[0], q[1] + h, C.k); w.b.set(q[0] + 1, q[1] + h, C.d5); w.b.set(q[0] + 2, q[1] + h, C.k); } }
        for (let i = 0; i <= len; i++) {
            const q = railAt(c1 - .05, i);
            w.b.set(q[0], q[1] - 2, C.k); w.b.set(q[0], q[1] - 1, C.d6); w.b.set(q[0], q[1], C.d4); w.b.set(q[0], q[1] + 1, C.k);
        }
        /* the newel post at the foot */
        const q = scr(c1 - .05, dBot, 0);
        for (let h = 0; h < RAIL + 5; h++) for (let a = -2; a <= 2; a++) w.b.set(q[0] + a, q[1] - h, Math.abs(a) === 2 ? C.k : a < 0 ? C.d6 : a === 0 ? C.d4 : C.d2);
        for (let a = -1; a <= 1; a++) for (let h = RAIL + 5; h < RAIL + 8; h++) w.b.set(q[0] + a, q[1] - h, h === RAIL + 7 ? C.k : a < 1 ? C.b4 : C.b2);
    }
}
function flightY(w, a, b, yTop, steps, zB) {
    /* climbs toward -y; step 0 is the top. Half a tile deep, 8px rise. */
    const wpx = (b - a) * 16;
    for (let i = 0; i < steps; i++) {
        const y = yTop + i * .5, z = zB + (steps - i) * 8;
        const o = [Math.round((a - y) * 16) + w.ox, Math.round((a + y) * 8) + w.oy - z];
        for (let v = 0; v < 8; v++) for (let u = 0; u < wpx; u++) {
            const sx = o[0] + u - v, sy = o[1] + Math.floor(u / 2) + Math.floor(v / 2);
            let c = treadCol(u, v, wpx);
            if (v >= 7) c = u < 16 || u >= wpx - 16 ? C.d6 : C.b4;
            w.b.set(sx, sy, c); w.b.set(sx - 1, sy, c);
        }
        for (let u = 0; u <= wpx; u++) for (let h = 1; h <= 8; h++) {
            const sx = o[0] + u - 8, sy = o[1] + Math.floor(u / 2) + 4 + h;
            let c = (u >= 16 && u < wpx - 16) ? ((u % 2) ? hex("3a0000") : TR.run[0]) : C.d2;
            if (h === 8) c = C.k; else if (h === 1) c = C.d1;
            w.b.set(sx, sy, c);
        }
    }
    /* the side you can see */
    const yBot = yTop + steps * .5, base = [Math.round((b - yBot) * 16) + w.ox, Math.round((b + yBot) * 8) + w.oy - zB];
    for (let v = 0; v <= steps * 8; v++) {
        const top = (Math.floor(v / 8) + 1) * 8 - 2;
        for (let h = -1; h <= top; h++) {
            const sx = base[0] + v, sy = base[1] - Math.floor(v / 2) - h;
            let c = (v >> 1) % 6 === 0 ? C.d2 : C.d3;
            if (h === top) c = C.d6; else if (h === top - 1) c = C.k; else if (h <= 0) c = C.k;
            w.b.set(sx, sy, c);
        }
    }
    /* handrails with a post on every other step */
    for (const side of [a, b]) {
        const s0 = [Math.round((side - yBot) * 16) + w.ox, Math.round((side + yBot) * 8) + w.oy - zB];
        for (let v = 0; v <= steps * 8; v++) {
            const sx = s0[0] + v, sy = s0[1] - Math.floor(v / 2) - v - 15;
            w.b.set(sx, sy - 1, C.k); w.b.set(sx, sy, C.b4); w.b.set(sx, sy + 1, C.b2); w.b.set(sx, sy + 2, C.k);
            if (v % 16 === 4) for (let h = 3; h < 15; h++) w.b.set(sx, sy + h, C.b1);
        }
        for (let h = 0; h < 20; h++) { w.b.set(s0[0] - 1, s0[1] - h, C.k); w.b.set(s0[0], s0[1] - h, C.d6); w.b.set(s0[0] + 1, s0[1] - h, C.d3); w.b.set(s0[0] + 2, s0[1] - h, C.k); }
        for (let a2 = -1; a2 <= 2; a2++) for (let j = 20; j < 23; j++) w.b.set(s0[0] + a2, s0[1] - j, C.b4);
    }
}
function flightX(w, y0, y1, xTop, steps, zB, o) {
    /* climbs toward -x; step 0 is the top */
    o = o || {};
    const wpx = (y1 - y0) * 16;
    for (let i = 0; i < steps; i++) {
        const x = xTop + i * .5, z = zB + (steps - i) * 8;
        const a = [Math.round((x - y1) * 16) + w.ox, Math.round((x + y1) * 8) + w.oy - z];
        for (let v = 0; v < 8; v++) for (let u = 0; u < wpx; u++) {
            const sx = a[0] + u + v, sy = a[1] - Math.floor(u / 2) + Math.floor(v / 2);
            let c = treadCol(u, v, wpx);
            if (o.band) { const yy = y1 - u / 16, rel = Math.min(yy - o.band[0], o.band[1] - yy); c = rel < 0 ? ((sx >> 1) % 3 ? hex("b2814b") : hex("9e7247")) : rel < 1 ? ((u % 2) ? TR.trim[0] : TR.trim[1]) : ((u % 2) ? TR.run[0] : TR.run[1]); }
            if (v >= 7) c = (o.band ? (y1 - u / 16 < o.band[0] || y1 - u / 16 >= o.band[1]) : (u < 3 || u >= wpx - 3)) ? C.d6 : C.b4;
            w.b.set(sx, sy, c); w.b.set(sx + 1, sy, c);
        }
        for (let u = 0; u <= wpx; u++) for (let h = 1; h <= 8; h++) {
            const sx = a[0] + u + 8, sy = a[1] - Math.floor(u / 2) + 4 + h;
            const yy = y1 - u / 16, inR = (u >= 16 && u < wpx - 16);
            let c = inR ? ((u % 2) ? hex("510000") : hex("3a0000")) : C.d3;
            if (h === 8) c = C.k; else if (h === 1) c = C.d0;
            w.b.set(sx, sy, c);
        }
    }
    if (o.side !== false) {
        /* the side facing you, along the near edge of the flight */
        const xBot = xTop + steps * .5, base = [Math.round((xBot - y1) * 16) + w.ox, Math.round((xBot + y1) * 8) + w.oy - zB];
        for (let v = 0; v <= steps * 8; v++) {
            const top = (Math.floor(v / 8) + 1) * 8 - 2;
            for (let h = -1; h <= top; h++) {
                const sx = base[0] - v, sy = base[1] - Math.floor(v / 2) - h;
                let c = (v >> 1) % 6 === 0 ? C.d3 : C.d4;
                if (h === top) c = C.d7; else if (h === top - 1) c = C.k; else if (h <= 0) c = C.k;
                w.b.set(sx, sy, c);
            }
        }
    }
}

/* ---- a standing lamp: new art, and a real light source ---- */
/* Floor lamps: the art is in floor-lamps.js. A lamp keeps its own colours on every floor, its glowing parts stay out of
   the room's lighting so a lit shade never bleaches, and it leaves a soft shadow at its foot. */
const LAMP_STYLES = FloorLamps.STYLES;
function floorLamp(w, tx, ty, style, colour) {
    const kind = LAMP_STYLES[style] ? style : "hotel", p = w.S(tx + .5, ty + .5);
    w.sprites.push({ depth: tx + ty + .4, draw: () => {
        const bd = w.b, cx = p[0], cy = p[1], art = FloorLamps.pixels(kind, !!w.lightsOff, colour);
        if (w.footShadows) w.footShadows.push([cx, cy]);
        for (const [dx, dy, c, g] of art.list) {
            const X = cx + dx, Y = cy + dy;
            bd.set(X, Y, c);
            if (X < 0 || Y < 0 || X >= bd.w || Y >= bd.h) continue;
            const i = Y * bd.w + X, v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1;
            if (w.keep) w.keep[i] = v;
            if (w.glowing) w.glowing[i] = g ? v : 0;
        }
    }});
    w.lamps.push({ free: true, tx: tx + .5, ty: ty + .5, lz: w.z, x: p[0], y: p[1] - FloorLamps.pixels(kind, false).lightH, colour });
}

/* ---- the entrance ----
   The client's own: an alcove piece the size of an 8-tile stretch of wall, and the arch that stands in front of whoever walks through it, with its
   EXIT sign. Both are stretched to these taller walls below the sign, so the arch is taller and the sign stays by the cap. */
function framed(alcove, arch, dx, dy, flip) {
    const o = { w: alcove.w, h: alcove.h, rgba: Buffer.alloc(alcove.w * alcove.h * 4) };
    for (let j = 0; j < arch.h; j++) for (let i = 0; i < arch.w; i++) { const q = (j * arch.w + i) * 4; if (arch.rgba[q + 3] < 128) continue; const X = flip ? alcove.w - 1 - (dx + i) : dx + i, Y = dy + j; if (X < 0 || Y < 0 || X >= o.w || Y >= o.h) continue; arch.rgba.copy(o.rgba, (Y * o.w + X) * 4, q, q + 4); }
    return o;
}
let portalMemo = null;
const portalArt = () => portalMemo || (portalMemo = (() => {
    const REG_HALL = require("../art/regs.json").hall, reg = n => REG_HALL[n] || [0, 0], eY = piece("entry_upper_right"), eX = piece("entry_upper_left"), m = piece("entry_upper_right_mask"), m2 = piece("entry_upper_left_mask"), rE = reg("entry_upper_right"), rM = reg("entry_upper_right_mask"), rE2 = reg("entry_upper_left"), rM2 = reg("entry_upper_left_mask");
    const mY = framed(eY, m, rE[0] - rM[0], rE[1] - rM[1], false), mX = framed(eX, m2, rE2[0] - rM2[0], rE2[1] - rM2[1], false);
    /* The doorway surround, whole and at its real height, standing on the floor: the arch and the jamb that the client draws in the alcove piece, whose
       mouldings run on from each other. It stops at the outside of its two jambs, with a black end to the moulding. Beside it, and above it, is just the wall.
       lo and hi are the surround's outer columns; the stub columns are the jamb that comes from the alcove piece. */
    const surround = (frame, raw, wall, lo, hi, stub) => {
        const o = { w: frame.w, h: frame.h + WALL_ADD, rgba: Buffer.alloc(frame.w * (frame.h + WALL_ADD) * 4) };
        const copyWall = (r, x) => { if (x < wall.w && r < wall.h) wall.rgba.copy(o.rgba, (r * o.w + x) * 4, (r * wall.w + x) * 4, (r * wall.w + x + 1) * 4); };
        for (let x = 0; x < o.w; x++) {
            if (x < lo || x > hi) { for (let r = 0; r < o.h; r++) copyWall(r, x); continue; }
            const src = stub(x) ? raw : frame; let top = -1;
            for (let j = 0; j < src.h; j++) if (src.rgba[(j * src.w + x) * 4 + 3] >= 128) { top = j; break; }
            if (top < 0) continue;
            for (let r = 0; r < o.h; r++) {
                const sy = r - WALL_ADD;
                if (sy < top) copyWall(r, x);
                else if (sy < src.h) { src.rgba.copy(o.rgba, (r * o.w + x) * 4, (sy * src.w + x) * 4, (sy * src.w + x + 1) * 4); if ((x === lo || x === hi) && sy < top + WALL_CAP) { const q = (r * o.w + x) * 4; o.rgba[q] = o.rgba[q + 1] = o.rgba[q + 2] = 0; o.rgba[q + 3] = 255; } }
            }
        }
        return o;
    };
    return { y: { alcove: tallPiece(eY, false), arch: surround(mY, eY, SEAMY, 28, 120, x => x >= 104) }, x: { alcove: tallPiece(eX, true), arch: surround(mX, eX, SEAMX, 17, 110, x => x <= 36) } };
})());
function drawPortal(w, axis, line, at, part) {
    const b = w.b, T = w.wallTop, art = portalArt()[axis][part];
    const p = axis === "x" ? w.S(at, line) : w.S(line, at), x0 = axis === "x" ? p[0] : p[0] - 138;
    /* the wall carries straight on either side, so its pieces' end posts aren't wanted */
    const i0 = axis === "x" ? 0 : 10, i1 = axis === "x" ? 128 : 138;
    for (let j = 0; j < art.h; j++) for (let i = i0; i < i1; i++) {
        const q = (j * art.w + i) * 4; if (art.rgba[q + 3] < 128) continue;
        /* solid black in the arch only ever hid the avatar in the client: it isn't drawn */
        if (part === "arch" && !art.rgba[q] && !art.rgba[q + 1] && !art.rgba[q + 2] && (i < 8 || i > art.w - 8)) continue;
        b.set(x0 + i, p[1] - T + j, [art.rgba[q], art.rgba[q + 1], art.rgba[q + 2]]);
    }
}

/* A small wall light to match the globe lamp: a little antique bronze plate, a short curved arm, a cup and a round glass globe.
   at(u, h) is a point on the wall; out is which way the wall faces on screen. */
const SG = { plate: ["3a2110", "6e4524", "ab7a44"], arm: ["54321a", "8c5c30"], cup: ["6e4524", "cc9f66"] };
function smallGlobe(w, at, out, o) {
    o = o || {};
    if (!o.drawn) {
        /* his picture, if there is one */
        const art = FloorLamps.wallLight(out, !!w.lightsOff || !!o.dead, o.colour, !!o.back);
        if (art) {
            const a0 = at(0, 0), bb = w.b;
            for (const [dx, dy, c, glass] of art) {
                const X = a0[0] + dx, Y = a0[1] + dy; bb.set(X, Y, c);
                if (X >= 0 && Y >= 0 && X < bb.w && Y < bb.h) { const v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; if (w.keep) w.keep[Y * bb.w + X] = v; if (glass && w.glowing) w.glowing[Y * bb.w + X] = v; }
            }
            return;
        }
    }
    const b = w.b, A = at(0, 0), hx = h => { const v = parseInt(h, 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
    const paint = (X, Y, c, glow) => { b.set(X, Y, c); if (X >= 0 && Y >= 0 && X < b.w && Y < b.h) { const v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; if (w.keep) w.keep[Y * b.w + X] = v; if (glow && w.glowing) w.glowing[Y * b.w + X] = v; } };
    const solid = (cells, colour) => {
        const seen = new Set(cells.map(q => q[0] + "," + q[1]));
        for (const [X, Y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((X + dx) + "," + (Y + dy))) paint(X + dx, Y + dy, [0, 0, 0]);
        for (const q of cells) paint(q[0], q[1], colour(q[0], q[1], q));
    };
    /* the plate on the wall, following its slant */
    if (!o.back) { const plate = []; for (let u = -1; u <= 1; u++) for (let h = -3; h <= 3; h++) if (Math.abs(u) + Math.abs(h) < 4) { const P = at(u, h); plate.push([P[0], P[1], u, h]); }
    solid(plate, (X, Y, q) => hx(SG.plate[q[3] >= 2 ? 2 : q[2] * out < 0 ? 2 : q[2] === 0 ? 1 : 0])); }
    /* the arm: out and down from the plate, up into the cup */
    const cx = A[0] + out * 8, cup = A[1] - (o.back ? 5 : 1), arm = new Map(), endY = o.back ? -3 : 1, bendY = o.back ? 2 : 5;
    for (let t = 0; t <= 1.0001; t += .03) { const m = 1 - t, X = A[0] + Math.round(2 * m * t * out * 4 + t * t * out * 8), Y = A[1] + Math.round(2 * m * t * bendY + t * t * endY); arm.set(X + "," + Y, [X, Y]); }
    solid([...arm.values()], (X) => hx(SG.arm[(X - A[0]) * out < 4 ? 0 : 1]));
    /* the globe, a true circle, with the cup over its foot */
    const R = 3.5, Y0 = cup - 5, ball = [], lit = !w.lightsOff && !o.dead, ramp = lit ? FloorLamps.GLOBE_LIT : FloorLamps.GLOBE_OFF;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { if (i * i + j * j <= R * R) ball.push([cx + i, Y0 + j, i, j]); }
    solid(ball, (X, Y, q) => {
        const nx = q[2] / R, ny = -q[3] / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const t = lit ? .1 + .85 * nz * nz + .1 * Math.max(0, -nx * .6 + ny * .6) : .2 + .5 * Math.max(0, -nx * .6 + ny * .6 + nz * .5) + (q[2] === -1 && q[3] === -2 ? .5 : 0);
        const c = ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1))))];
        return lit && o.colour ? FloorLamps.tintGlow(c, o.colour) : c;
    });
    for (const q of ball) { const X = q[0], Y = q[1], p = (Y * b.w + X) * 4; if (X >= 0 && Y >= 0 && X < b.w && Y < b.h && w.glowing) w.glowing[Y * b.w + X] = ((b.d[p] << 16) | (b.d[p + 1] << 8) | b.d[p + 2]) + 1; }
    const cupCells = []; for (let i = -2; i <= 2; i++) cupCells.push([cx + i, cup]); cupCells.push([cx - 1, cup + 1], [cx, cup + 1], [cx + 1, cup + 1]);
    solid(cupCells, X => hx(SG.cup[X < cx ? 1 : 0]));
}
/* on a pillar, one of its two faces: l is the lit face to the left, r the shaded one to the right. They lean as the room does. */
function pillarLight(w, tx, ty, face, colour, up) {
    /* l and r: the faces towards you. bl and br: the two turned away, 8 rows further up the pillar's diamond, drawn before the pillar so it hides their fixing. */
    const a = w.S(tx, ty), back = face[0] === "b", left = face.endsWith("l"), X = a[0] + (left ? -4 : 6), Y = a[1] + 8 - 102 + 44 - (back ? 8 : 0) - (up || 0), at = (u, h) => [X + u, Y + (left ? 1 : -1) * Math.floor(u / 2) - h];
    w.sprites.push({ depth: tx + ty + (back ? -.05 : .05), ftx: tx, fty: ty, draw: () => smallGlobe(w, at, left ? -1 : 1, { colour, back }) });
    const off = { l: [.5, 1.1], r: [1.1, .5], bl: [-.1, .5], br: [.5, -.1] }[face] || [.5, .5];
    w.lamps.push({ free: true, x: X, y: Y, tx: tx + off[0], ty: ty + off[1], colour, lz: w.z });
}

/* ---- half walls ----
   Where a floor drops to a lower part of itself, the real hallways show a low panelled wall with a rail along the top, which is
   the client's own wall_lower pieces. The piece is 8 tiles of panel plus a 6px end, and repeats from fixed points on the map. */
const LOWX = piece("wall_lower_left"), LOWY = piece("wall_lower_right"), HALF_WALL = 48;
/* which column of the piece: the panelling repeats every 4, and the piece's very ends have a black edge that mustn't repeat */
const lowX = at => 4 + (((at % 120) + 120) % 120), lowY = at => 10 + (((-at % 120) + 120) % 120);
const firstRow = (im, i) => { for (let j = 0; j < im.h; j++) if (im.rgba[(j * im.w + i) * 4 + 3] >= 128) return j; return -1; };
const lastRow = (im, i) => { for (let j = im.h - 1; j >= 0; j--) if (im.rgba[(j * im.w + i) * 4 + 3] >= 128) return j; return -1; };
function halfWallColumn(b, im, i, sx, sy, drop) {
    const r0 = firstRow(im, i), r1 = lastRow(im, i); if (r0 < 0) return;
    /* the rail goes down to the black line under it, so that line is never taken for panelling and repeated halfway down */
    let keepTop = 6; for (let r = r0 + 2; r < Math.min(r1, r0 + 10); r++) { const q = (r * im.w + i) * 4; if (im.rgba[q + 3] >= 128 && im.rgba[q] + im.rgba[q + 1] + im.rgba[q + 2] < 20) { keepTop = r - r0 + 1; break; } }
    const tall = r1 - r0 + 1, keepEnd = Math.min(Math.max(0, tall - keepTop), 6);
    for (let k = 0; k < drop; k++) {
        /* the rail at the top, the foot at the bottom, and the panels repeat between, however deep the drop */
        const r = k < keepTop ? r0 + k : k >= drop - keepEnd ? r1 - (drop - 1 - k) : r0 + keepTop + ((k - keepTop) % Math.max(1, tall - keepTop - keepEnd));
        const q = (r * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue;
        b.set(sx, sy + k, [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]);
    }
}

/* The far end of a low wall, where it starts on its own: the client's own first columns, where the rail runs on past the panelling. Columns that are only rail are drawn as they are. */
function lowWallStart(b, im, cols, anchor, Q, H) {
    const a = firstRow(im, anchor);
    cols.forEach(([i, sx]) => {
        const r0 = firstRow(im, i), r1 = lastRow(im, i); if (r0 < 0) return;
        const sy = Q[1] - H + r0 - a;
        if (r1 - r0 < 10) { for (let r = r0; r <= r1; r++) { const q = (r * im.w + i) * 4; if (im.rgba[q + 3] >= 128) b.set(sx, sy + r - r0, [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]); } }
        else halfWallColumn(b, im, i, sx, sy, H - (r0 - a));
    });
}

/* ---- retaining walls ----
   Where a floor drops, the edge is a real wall exactly as tall as the drop, built the way every wall is. From the floor up: the wood panelling, always
   its full height (a very low wall just shows less of it), then wallpaper, the only part that changes with the height. At the top it meets the floor
   above with the same moulding any wall has under a floor, so it sits cleanly under it. A door makes its whole straight stretch tall enough to hold it;
   that wall stands above the floor behind, so it ends in the wall's own cap. */
const DOOR_WALL = 80, WALL_CAP = 13;
const FLOOR_EDGE = ["000000", "af6947", "925030", "925030", "7d4122", "7d4122", "712f16", "000000", "5a1a06", "450e00", "450e00", "000000"].map(hex);
const railMemo = new Map();
function railRow(im, i) {
    const key = (im === TALLX ? "x" : im === TALLY ? "y" : im === SEAMX ? "sx" : "sy") + i; if (railMemo.has(key)) return railMemo.get(key);
    let r = firstRow(im, i) + WALL_CAP + 8;
    for (; r < im.h; r++) { const q = (r * im.w + i) * 4; if (im.rgba[q + 3] >= 128 && !im.rgba[q] && !im.rgba[q + 1] && !im.rgba[q + 2]) break; }
    railMemo.set(key, r - 3); return r - 3;
}
function shortWallColumn(b, im, i, floorRow, sx, fy, H, capped) {
    const top = firstRow(im, i); if (top < 0) return;
    const rail = railRow(im, i), wood = floorRow - rail + 1, edge = capped ? 0 : FLOOR_EDGE.length;
    for (let k = 0; k < H; k++) {
        const fromTop = H - 1 - k;
        if (fromTop < edge) { b.set(sx, fy - k, FLOOR_EDGE[fromTop]); continue; }
        const src = k < wood ? floorRow - k : rail - 1 - (k - wood);
        if (src < 0 || src >= im.h) continue;
        const q = (src * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue;
        b.set(sx, fy - k, [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]);
    }
    if (capped) for (let n = 0; n < WALL_CAP; n++) { const q = ((top + n) * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue; b.set(sx, fy - H - WALL_CAP + 1 + n, [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]); }
}

/* ---- the plan ---- */
/* d: doors in order, ["x", at] on the back wall, ["y", at] on the left wall.
   l: sconces, same form. props: scenery. band: carpet edges across y; null for bare floor. */
const WALL_ADD = 49, Z1 = 114 + WALL_ADD;
function tallPiece(im, right, top) {
    const o = { w: im.w, h: im.h + WALL_ADD, rgba: Buffer.alloc(im.w * (im.h + WALL_ADD) * 4) };
    const TOP = top === undefined ? 16 : top, P = 32;
    for (let x = 0; x < im.w; x++) {
        const sh = right ? Math.floor(x / 2) : Math.floor((im.w - 1 - x) / 2);
        for (let r = 0; r < o.h; r++) {
            const rel = r - sh;
            const src = rel < TOP ? rel : rel < TOP + WALL_ADD ? TOP + ((rel - TOP) % P) : rel - WALL_ADD;
            const sy = src + sh; if (sy < 0 || sy >= im.h) continue;
            im.rgba.copy(o.rgba, (r * o.w + x) * 4, (sy * im.w + x) * 4, (sy * im.w + x + 1) * 4);
        }
    }
    return o;
}
const TALLX = tallPiece(piece("wall_upper_right_basic"), true), TALLY = tallPiece(piece("wall_upper_left_basic"), false);
/* The piece's first columns are cut on a slant for the corner it would start in, which leaves a notch in the wall's top every
   8 tiles. Along the wall everything repeats 64 across and 32 down, so those columns are redrawn from further along it. A wall's
   true start still uses the client's own slanted cut. */
function seamless(im, right) {
    const o = { w: im.w, h: im.h, rgba: Buffer.from(im.rgba) }, N = 26, POST = 10, W = im.w - POST;
    /* both ends of the 128 columns of wall: x's run 0..127 with the post after, y's 10..137 with the post before */
    const first = right ? 0 : POST;
    for (let k = 0; k < N; k++) for (const [i, from] of [[first + k, first + k + 64], [first + W - 1 - k, first + W - 1 - k - 64]]) {
        const rise = (from - i) / 2 * (right ? 1 : -1);          // along the x wall the top falls to the right; along the y wall it climbs
        for (let r = 0; r < im.h; r++) {
            const R = r + rise; if (R < 0 || R >= im.h) continue;
            const q = (R * im.w + from) * 4;
            im.rgba.copy(o.rgba, (r * im.w + i) * 4, q, q + 4);
        }
    }
    return o;
}
const SEAMX = seamless(TALLX, true), SEAMY = seamless(TALLY, false);

/* The lift. Every part of the surround is a box standing out from the wall, drawn with its
   front, its side and its top, and black round every shape, so it sits in the hall as solidly
   as the client's own furniture. Open, the opening looks into a lit iso cabin. */
function lift(w, x, y, o) {
    o = o || {};
    const b = w.b, DW = 48, DH = 76, cab = 3;
    const O = w.S(x, y);
    /* a point: u along the wall, h up it, v out from it toward you */
    const pt = (u, h, v) => [O[0] + u - v, O[1] + Math.floor(u / 2) + Math.floor(v / 2) - h];
    const put = (u, h, v, c) => { const q = pt(u, h, v); b.set(q[0], q[1], c); };
    /* a solid box: from u0..u1, h0..h1, standing v out. fn colours the front. */
    const box = (u0, u1, h0, h1, v, fn, sideC, topC) => {
        /* right side, then top, then front; the black goes on last */
        for (let t = 0; t <= v; t++) for (let h = h0; h <= h1; h++) { const c = (t === v || h === h0 || h === h1) ? C.k : (sideC || C.d1); put(u1, h, t, c); put(u1, h, t + .5, c); }
        for (let t = 0; t <= v; t++) for (let u = u0; u <= u1; u++) { const c = (u === u0 || u === u1 || t === 0) ? C.k : (topC || C.d6); const q = pt(u, h1, t); b.set(q[0], q[1], c); b.set(q[0] - 1, q[1], c); }
        for (let u = u0; u <= u1; u++) for (let h = h0; h <= h1; h++) {
            let c = (u === u0 || u === u1 || h === h0 || h === h1) ? C.k : fn(u, h);
            if (c) put(u, h, v, c);
        }
    };
    /* the opening's mask, so the cabin can only be seen through it */
    const mask = new Set();
    for (let u = 0; u < DW; u++) for (let h = 0; h < DH; h++) { const q = pt(u, h, 0); mask.add(q[0] + "," + q[1]); }
    const inMask = (X, Y, c) => { if (mask.has(X + "," + Y)) b.set(X, Y, c); };

    if (o.open || o.slide > 0) {
        const back = w.S(x, y - cab), left = w.S(x, y);
        const wood = [hex("6a3b1f"), hex("8a5230"), hex("9c6038"), hex("b87a4a")];
        const lp = w.S(x + 1.5, y + .5); w.lamps.push({ free: true, tx: x + 1.5, ty: y + .5, lz: w.z, x: lp[0], y: lp[1] - 40 });
        /* back wall with panels, a mirror and a handrail */
        for (let u = -40; u < DW + 90; u++) for (let h = 0; h < DH + 40; h++) {
            const X = back[0] + u, Y = back[1] + Math.floor(u / 2) - h;
            let c = wood[1 + ((u >> 3) & 1)];
            if (((u % 16) + 16) % 16 === 0) c = wood[0];
            if (h === 34 || h === 35) c = C.b4; else if (h === 33 || h === 36) c = C.k;
            if (h > 40 && h < 72 && u >= 8 && u < 36) { c = ((u + h) % 9 < 2) ? hex("dfe8e4") : hex("9fb0ac"); if (u === 8 || u === 35 || h === 41 || h === 71) c = C.b2; if (u === 7 || u === 36 || h === 40 || h === 72) c = C.k; }
            if (h === 0) c = C.k;
            inMask(X, Y, c);
        }
        /* side wall with the button panel */
        for (let u = 0; u <= cab * 16; u++) for (let h = 0; h < DH + 40; h++) {
            const X = left[0] + u, Y = left[1] - Math.floor(u / 2) - h;
            let c = wood[(u % 16 < 2) ? 0 : 3];
            if (h === 34 || h === 35) c = C.b4; else if (h === 33 || h === 36) c = C.k;
            if (h >= 44 && h <= 62 && u >= 18 && u <= 28) { c = C.b2; if (u === 18 || u === 28 || h === 44 || h === 62) c = C.k; else if ((u + h) % 4 === 0) c = hex("fff4cf"); }
            if (h === 0) c = C.k;
            inMask(X, Y, c);
        }
        /* inlaid floor */
        for (let a = 0; a < 96; a++) for (let v = 0; v <= cab * 16; v++) {
            const X = back[0] + a - v, Y = back[1] + Math.floor(a / 2) + Math.floor(v / 2);
            let c = ((a >> 3) + (v >> 3)) % 2 ? hex("6b4a30") : hex("8a6642");
            if (v < 2) c = C.k; else if (v < 4) c = C.b2;
            inMask(X, Y, c); inMask(X - 1, Y, c);
        }
        /* the lit panel above, seen from below the head */
        for (let u = 0; u < DW; u++) for (let h = DH - 7; h < DH; h++) { const q = pt(u, h, 0); b.set(q[0], q[1], h === DH - 7 ? C.k : hex("fff0c8")); }
    }
    if (!o.open) {
        /* two doors, set back in the opening, with a black seam and an outline. Opening, each slides away into its own side. */
        const slid = Math.round((o.slide || 0) * DW / 2);
        for (let u = 0; u < DW; u++) for (let h = 0; h < DH; h++) {
            const leaf = u < DW / 2 ? 0 : 1, W = DW / 2, lu = leaf ? u - DW / 2 - slid : u + slid;
            if (lu < 0 || lu >= W) continue;
            let c = C.d3;
            if (lu === 1) c = C.d5; else if (lu === W - 2) c = C.d1;
            const panel = (a, e) => h >= a && h < e && lu >= 4 && lu < W - 3;
            if (panel(38, 72) || panel(11, 32)) {
                const a = h >= 38 ? 38 : 11, e = h >= 38 ? 72 : 32;
                if (lu === 4 || h === e - 1) c = C.d0; else if (lu === W - 4 || h === a) c = C.d5; else if (lu === 5 || h === e - 2) c = C.d1; else c = (lu + (h >> 1)) % 6 === 0 ? C.d3 : C.d4;
            }
            /* a small glazed port with a brass rim and a black line */
            if (h >= 52 && h <= 67 && lu >= 7 && lu <= W - 7) {
                const edge = h === 52 || h === 67 || lu === 7 || lu === W - 7, rim = h === 53 || h === 66 || lu === 8 || lu === W - 8;
                c = edge ? C.k : rim ? C.b3 : ((lu + h) % 6 === 0 ? hex("a8c4bc") : hex("3e524e"));
            }
            /* brass kick plate and pull */
            if (h >= 2 && h <= 7) c = h === 7 ? C.b4 : h === 2 ? C.b1 : C.b2;
            if (h === 8 || h === 1) c = C.k;
            if (h >= 26 && h <= 40) { const pu = leaf ? 2 : W - 3; if (lu === pu) c = C.b4; if (lu === pu + (leaf ? 1 : -1)) c = C.k; }
            if (h === 0 || h === DH - 1 || u === 0 || u === DW - 1 || lu === (leaf ? 0 : W - 1)) c = C.k;
            put(u, h, 0, c);
        }
    }
    /* a brass threshold let into the floor */
    for (let u = 0; u < DW; u++) for (let v = 0; v < 8; v++) { const c = v < 1 ? C.k : v < 3 ? C.b4 : v < 6 ? C.b2 : v < 7 ? C.b1 : C.k; const q = pt(u, 0, v); b.set(q[0], q[1], c); b.set(q[0] - 1, q[1], c); }

    /* side posts: reeded wood on a plinth, standing out 4 */
    const post = (u, h) => { const k = ((u % 3) + 3) % 3; if (h <= 11) return h === 11 ? C.d7 : h === 10 ? C.k : C.d2; return k === 0 ? C.d3 : k === 1 ? C.d5 : C.d4; };
    box(-10, -1, 0, DH + 2, 4, post, C.d1, C.d6);
    box(DW, DW + 9, 0, DH + 2, 4, post, C.d1, C.d6);
    /* the brass strip inside each post */
    for (let h = 1; h < DH + 2; h++) { put(-1, h, 4, C.b4); put(-2, h, 4, C.b2); put(DW, h, 4, C.b1); put(DW + 1, h, 4, C.b2); }
    /* the lintel over the opening */
    box(-10, DW + 9, DH + 2, DH + 13, 5, (u, h) => (h >= DH + 11) ? C.d6 : (h <= DH + 4) ? (h === DH + 3 ? C.b1 : C.b3) : ((u % 4) === 0 ? C.d3 : C.d4), C.d1, C.d7);
    /* a stepped cornice, each step wider and standing further out */
    box(-13, DW + 12, DH + 13, DH + 16, 7, () => C.d4, C.d2, C.d7);
    box(-15, DW + 14, DH + 16, DH + 19, 9, (u, h) => h === DH + 18 ? C.d6 : C.d5, C.d2, hex("e0a058"));
    /* the indicator: a square brass-framed panel with an ivory dial, on the cornice */
    const P0 = 7, P1 = DW - 8, H0 = DH + 19, H1 = DH + 40;
    box(P0, P1, H0, H1, 5, (u, h) => {
        const cx = (P0 + P1) / 2, du = u - cx, dv = h - (H0 + 4), r = Math.sqrt(du * du + dv * dv);
        if (u < P0 + 3 || u > P1 - 3 || h < H0 + 3 || h > H1 - 3) return (u === P0 + 1 || h === H1 - 1) ? C.b4 : (u === P1 - 1 || h === H0 + 1) ? C.b1 : C.b2;
        if (r > 12.5) return C.d1;
        if (r > 11.5) return C.k;
        if (dv < 0) return C.d1;
        if (r < 2) return C.k;
        /* the needle, and five tick marks round the arc */
        if (Math.abs(du - dv * .55) < .8 && r < 10) return C.k;
        const ang = Math.atan2(du, dv) / Math.PI * 4;
        if (r > 8.5 && Math.abs(ang - Math.round(ang)) < .14) return hex("6a5c3e");
        return hex("f0e6c4");
    }, C.d1, C.d6);
    /* a cap on the panel */
    box(P0 - 2, P1 + 2, H1, H1 + 2, 7, () => C.d5, C.d2, C.d7);
    /* the call plate on the wall to the right */
    box(DW + 15, DW + 25, 34, 56, 1, (u, h) => {
        if (u === DW + 16 || h === 55) return C.b4; if (u === DW + 24 || h === 35) return C.b1;
        const cu = DW + 20;
        if (Math.abs(u - cu) <= 2 && h >= 47 && h <= 51) return (Math.abs(u - cu) === 2 || h === 47 || h === 51) ? C.k : hex("fff0c0");
        if (Math.abs(u - cu) <= 2 && h >= 39 && h <= 43) return (Math.abs(u - cu) === 2 || h === 39 || h === 43) ? C.k : C.b3;
        return C.b2;
    }, C.b1, C.b4);
}
function plan() {
    const L = (id, way, patches, extra) => ({ id, way, patches, ...(extra || {}) });
    const levels = [];
    /* the top floor: one way in */
    levels.push(L("F3", "mauve", [
        { x0: 116, x1: 128, y0: -34, y1: -26, z: 3 * Z1, d: [["x", 121]], l: [["x", 118.5], ["x", 125]], props: [["sofa", 124, -34]] },
        { x0: 92, x1: 116, y0: -44, y1: -26, z: 3 * Z1, d: [["y", -38], ["x", 95], ["x", 102], ["x", 110]], l: [["x", 93.5], ["x", 100], ["x", 108], ["x", 114.5]], props: [["plant", 113, -44], ["lamp", 95, -30]] }
    ], { name: "Floor 3", rugs: [{ x0: 94, x1: 114, y0: -42, y1: -38 }, { x0: 105, x1: 109, y0: -40, y1: -35 }] }));
    levels.push(L("F2", "sage", [
        { x0: 92, x1: 116, y0: -26, y1: -18, z: 2 * Z1, d: [["x", 94]], l: [["x", 98], ["x", 110]], props: [["lamp", 113, -21]] },
        { x0: 60, x1: 72, y0: -26, y1: -16, z: 2 * Z1, d: [["y", -20], ["x", 63]], l: [["x", 68]], props: [["shelf", 66, -26], ["plant", 70, -26]] },
        { x0: 72, x1: 92, y0: -26, y1: -10, z: 2 * Z1, d: [["x", 75], ["x", 85]], l: [["x", 73.5], ["x", 81], ["x", 89]] },
        { x0: 116, x1: 134, y0: -26, y1: -10, z: 2 * Z1, d: [["x", 118], ["x", 127]], l: [["x", 117], ["x", 124.5], ["x", 131]], tele: [132, -26] },
        { x0: 134, x1: 150, y0: -28, y1: -16, z: 2 * Z1, d: [["x", 139]], l: [["x", 136.5], ["x", 144]], props: [["sofa", 144, -28]] }
    ], { name: "Floor 2", rugs: [{ x0: 62, x1: 90, y0: -24, y1: -20 }, { x0: 94, x1: 148, y0: -24, y1: -20 }, { x0: 77, x1: 81, y0: -21, y1: -19 }, { x0: 121, x1: 125, y0: -21, y1: -19 }] }));
    levels.push(L("F1", "slate", [
        { x0: 26, x1: 50, y0: -18, y1: -6, z: Z1, d: [["y", -12], ["x", 29], ["x", 36], ["x", 43]], l: [["x", 27.5], ["x", 34], ["x", 41], ["x", 48]], props: [["plant", 47, -18]] },
        { x0: 92, x1: 116, y0: -18, y1: -8, z: Z1, d: [["x", 96], ["x", 103], ["x", 110]], l: [["x", 94.5], ["x", 101], ["x", 108], ["x", 114.5]] },
        { x0: 10, x1: 26, y0: -16, y1: 0, z: Z1, d: [["x", 13], ["x", 20]], l: [["x", 11.5], ["x", 18.5], ["x", 24]] },
        { x0: 50, x1: 72, y0: -16, y1: 0, z: Z1, d: [["x", 52], ["x", 66]], l: [["x", 56], ["x", 62], ["x", 70]], props: [["sofa", 58, -16]], tele: [70, -16] },
        { x0: 72, x1: 92, y0: -10, y1: 2, z: Z1, d: [["x", 87]], l: [["x", 74], ["x", 85], ["x", 90]] },
        { x0: 116, x1: 134, y0: -10, y1: 0, z: Z1, d: [], l: [["x", 117.5], ["x", 131]], props: [["plant", 132, -10]] },
        { x0: 134, x1: 160, y0: -16, y1: 2, z: Z1, d: [["x", 138], ["x", 146]], l: [["x", 136], ["x", 143], ["x", 151]], props: [["sofa", 152, -16]] }
    ], { name: "Floor 1", rugs: [{ x0: 12, x1: 48, y0: -14, y1: -10 }, { x0: 52, x1: 72, y0: -14, y1: -10 }, { x0: 94, x1: 114, y0: -16, y1: -12 }, { x0: 136, x1: 158, y0: -14, y1: -10 }, { x0: 15, x1: 19, y0: -11, y1: -9 }, { x0: 151, x1: 155, y0: -11, y1: -7 }, { x0: 118, x1: 132, y0: -8, y1: -4 }] }));

    /* Ground: the wall still jogs in and out, but toward you it opens into one huge lobby */
    const NEAR = 90;
    const pillars = []; for (let x = 8; x < 200; x += 16) for (let y = 16; y < 76; y += 16) pillars.push(["pillar", x, y]);
    const island = (x, y) => [["sofa", x, y], ["table", x + 1, y + 2], ["lamp", x - 2, y], ["plant", x + 4, y], ["chair", x + 3, y + 3]];
    levels.push(L("G", "oxblood", [
        { x0: 26, x1: 50, y0: -6, y1: NEAR, z: 0, d: [["y", -2], ["x", 30], ["x", 37], ["x", 44]], l: [["x", 28.5], ["x", 35], ["x", 42], ["x", 48]], props: [["sofa", 33, -6], ["table", 40, -5], ["lamp", 36, -4], ["plant", 27, -6], ...island(36, 28), ...island(36, 52)] },
        { x0: 92, x1: 116, y0: -8, y1: NEAR, z: 0, d: [["x", 95], ["x", 110]], l: [["x", 93.5], ["x", 98.5], ["x", 107], ["x", 113.5]], medal: [102, 14], props: [["statue", 103, -8], ["fountain", 98, 30], ["plant", 93, 40], ["lamp", 94, 8], ["lamp", 113, 8], ...island(104, 44)], tele: [109, -8] },
        { x0: 0, x1: 26, y0: 0, y1: NEAR, z: 0, d: [["y", 8], ["y", 15], ["y", 22], ["x", 23]], l: [["x", 0.5], ["x", 11], ["x", 21], ["y", 11], ["y", 18]], lift: 2, props: [["plant", 12, 0], ...island(10, 26), ...island(16, 50)] },
        { x0: 50, x1: 72, y0: 0, y1: NEAR, z: 0, d: [["x", 51]], l: [["x", 55], ["x", 70.5]], props: island(60, 18) },
        { x0: 72, x1: 92, y0: 2, y1: NEAR, z: 0, d: [["x", 75], ["x", 82], ["x", 88]], l: [["x", 74], ["x", 80.5], ["x", 86.5], ["x", 91]], props: island(80, 36) },
        { x0: 116, x1: 134, y0: 0, y1: NEAR, z: 0, d: [["x", 118], ["x", 125]], l: [["x", 117], ["x", 123.5], ["x", 131]], props: [["water", 131, 0], ...island(124, 24)] },
        { x0: 134, x1: 310, y0: 2, y1: NEAR, z: 0, d: [["x", 137], ["x", 144], ["x", 158]], l: [["x", 135.5], ["x", 142], ["x", 149], ["x", 156], ["x", 164]], tele: [165, 2], props: [["plant", 168, 2], ...island(148, 22), ...island(172, 36)] }
    ], { name: "Ground", pillars, rugs: [
        { x0: 15, x1: 19, y0: -1, y1: 8 }, { x0: 59, x1: 63, y0: -1, y1: 8 }, { x0: 151, x1: 155, y0: 1, y1: 10 }, { x0: 92, x1: 98, y0: -5, y1: -1 },
        { x0: 4, x1: 196, y0: 8, y1: 14 },
        { x0: 96, x1: 112, y0: 14, y1: 26 },
        { x0: 6, x1: 24, y0: 24, y1: 34 }, { x0: 32, x1: 50, y0: 26, y1: 36 }, { x0: 56, x1: 72, y0: 18, y1: 26 }, { x0: 76, x1: 90, y0: 34, y1: 44 },
        { x0: 100, x1: 116, y0: 42, y1: 52 }, { x0: 120, x1: 136, y0: 22, y1: 32 }, { x0: 144, x1: 160, y0: 20, y1: 30 }, { x0: 168, x1: 184, y0: 34, y1: 44 },
        { x0: 12, x1: 28, y0: 48, y1: 58 }, { x0: 32, x1: 48, y0: 50, y1: 60 }
    ] }));
    /* pillars are drawn with the first rectangle they stand on */
    const G = levels.find(l => l.id === "G");
    for (const p of G.pillars) { const P = G.patches.find(q => p[1] >= q.x0 && p[1] < q.x1); P.props.push(p); }

    /* closed floors above, following the real floors' edges exactly */
    const byId = id => levels.find(l => l.id === id);
    const real = { 0: byId("G"), 1: byId("F1"), 2: byId("F2"), 3: byId("F3") };
    const xs = new Set([-300, 310]);
    for (const k in real) for (const P of real[k].patches) { xs.add(P.x0); xs.add(P.x1); }
    const X = [...xs].sort((p, q) => p - q);
    const covering = (lv, a) => lv.patches.find(P => a >= P.x0 && a < P.x1);
    const merge = list => { const o = []; for (const P of list) { const l = o[o.length - 1]; if (l && l.x1 === P.x0 && l.y0 === P.y0 && l.y1 === P.y1 && l.z === P.z) l.x1 = P.x1; else o.push(P); } return o; };
    const ways = ["slate", "sage", "mauve", "teal", "clay", "ash", "ochre", "oxblood"];
    let backs = {};
    for (let i = 0; i < X.length - 1; i++) { const a = X[i], g = covering(real[0], a); backs[a] = g ? g.y0 : 0; }
    const out = [];
    for (let k = 1; k <= 6; k++) {
        const list = [], next = {};
        for (let i = 0; i < X.length - 1; i++) {
            const a = X[i], c = X[i + 1], r = real[k] && covering(real[k], a);
            if (r) { next[a] = r.y0; continue; }
            const y1 = backs[a], y0 = y1 - 12;
            /* left of the lobby's end wall, a closed floor runs on towards you above it */
            list.push({ x0: a, x1: c, y0, y1: (a < 0 && k === 1) ? NEAR : y1, z: k * Z1, blank: true });
            next[a] = y0;
        }
        const pats = merge(list);
        out.push({ k, lv: L("C" + k, ways[(k + 2) % 8], pats, { closed: true, dim: Math.max(.34, .6 - k * .04), rugs: pats.filter(P => P.y1 - P.y0 >= 8 && P.x1 - P.x0 >= 12).map(P => ({ x0: P.x0 + 2, x1: P.x1 - 2, y0: P.y0 + 2, y1: P.y0 + 6 })) }), real: real[k] });
        backs = next;
    }
    const seq = [];
    for (let i = out.length - 1; i >= 0; i--) { seq.push(out[i].lv); if (out[i].real) seq.push(out[i].real); }
    seq.push(real[0]);

    /* embedded stairs: each cuts a slot back into the terrace, and a matching hole in the floor above */
    const STAIRS = [
        { kind: "straight", low: "G", up: "F1", a: 14, b: 20, y: 0, z: 0, label: "Up to Floor 1", signX: 11 },
        { kind: "turn", low: "G", up: "F1", a: 58, b: 64, y: 0, z: 0, label: "Up to Floor 1" },
        { kind: "side", low: "G", up: "F1", a: -6, b: 0, x: 92, z: 0, label: "Up to Floor 1" },
        { kind: "straight", low: "G", up: "F1", a: 150, b: 156, y: 2, z: 0, label: "Up to Floor 1" },
        { kind: "straight", low: "F1", up: "F2", a: 76, b: 82, y: -10, z: Z1, label: "Up to Floor 2", signX: 72.5 },
        { kind: "straight", low: "F1", up: "F2", a: 120, b: 126, y: -10, z: Z1, label: "Up to Floor 2", signX: 123 + 8 },
        { kind: "turn", low: "F2", up: "F3", a: 104, b: 110, y: -26, z: 2 * Z1, label: "Up to Floor 3" }
    ];
    cutStairs(byId, STAIRS);
    return seq;
}

function cutStairs(byId, STAIRS) {
    const punch = (lv, r) => {
        const out2 = [];
        for (const P of lv.patches) {
            if (r.x1 <= P.x0 || r.x0 >= P.x1 || r.y1 <= P.y0 || r.y0 >= P.y1) { out2.push(P); continue; }
            const cut = (x0, x1, y0, y1) => { if (x1 > x0 && y1 > y0) { const c = { ...P, x0, x1, y0, y1 }; const inW = dd => dd[0] === "x" ? (y0 === P.y0 && dd[1] >= x0 && dd[1] < x1) : (x0 === P.x0 && dd[1] > y0 && dd[1] <= y1); if (P.d) c.d = P.d.filter(inW); if (P.l) c.l = P.l.filter(inW); if (P.props) c.props = P.props.filter(p => p[1] >= x0 && p[1] < x1 && p[2] >= y0 && p[2] < y1); if (P.tele) c.tele = (P.tele[0] >= x0 && P.tele[0] < x1 && P.tele[1] >= y0 && P.tele[1] < y1) ? P.tele : null; if (P.medal) c.medal = (P.medal[0] >= x0 && P.medal[0] < x1 && P.medal[1] >= y0 && P.medal[1] < y1) ? P.medal : null; out2.push(c); } };
            const mx0 = Math.max(r.x0, P.x0), mx1 = Math.min(r.x1, P.x1);
            cut(P.x0, mx0, P.y0, P.y1); cut(mx1, P.x1, P.y0, P.y1);
            cut(mx0, mx1, P.y0, Math.max(r.y0, P.y0)); cut(mx0, mx1, Math.min(r.y1, P.y1), P.y1);
        }
        lv.patches = out2;
        (lv.holes = lv.holes || []).push(r);
    };
    /* The carpet comes from the rugs you've laid: a rug that reaches the foot or the head of a flight runs
       up it, as wide as it is there. No rug at either end, and the stairs are bare polished wood. */
    const onRug = (lv, X, Y) => (lv.rugs || []).some(r => X >= r.x0 && X < r.x1 && Y >= r.y0 && Y < r.y1);
    const span = (c0, c1, hit) => { let lo = null, hi = null; for (let c = c0 + 1; c < c1 - 1; c++) if (hit(c)) { if (lo === null) lo = c; hi = c + 1; } return lo === null ? null : [lo, hi]; };
    for (const st of STAIRS) {
        const low = byId(st.low), up = byId(st.up), way = low.way;
        const known = low.rugs || up.rugs;
        if (st.kind === "straight") {
            punch(up, { x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y });
            const carpet = !known ? [st.a + 1, st.b - 1] : span(st.a, st.b, x => onRug(low, x, st.y) || onRug(low, x, st.y - 1) || onRug(up, x, st.y - 11) || onRug(up, x, st.y - 10));
            low.patches.push({ x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y, z: st.z, notch: true, upLv: up, sf: [{ axis: "y", c0: st.a, c1: st.b, dTop: st.y - 10, steps: 20, zB: st.z, carpet, way }] });
            (low.stairSigns = low.stairSigns || []).push({ x: st.signX || st.a - 2, y: st.y, z: st.z, name: st.label, sign: st.sign, mid: (st.a + st.b) / 2 });
        } else if (st.kind === "turn") {
            punch(up, { x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y });
            punch(up, { x0: st.a - 4, x1: st.a, y0: st.y - 10, y1: st.y - 6 });
            const Y = st.y, carpet = !known ? [st.a + 1, st.b - 1] : span(st.a, st.b, x => onRug(low, x, Y) || onRug(low, x, Y - 1) || onRug(up, x, Y - 11) || onRug(up, x, Y - 10)) || (span(Y - 10, Y - 6, y => onRug(up, st.a - 5, y)) && [st.a + 1, st.b - 1]);
            const rugged = !!carpet, turnRug = rugged ? rugField([{ x0: st.a, x1: carpet[1], y0: Y - 9, y1: Y - 7 }, { x0: st.a - 2, x1: st.a, y0: Y - 9, y1: Y - 7 }, { x0: carpet[0], x1: carpet[1], y0: Y - 7, y1: Y - 3 }]) : null;
            low.patches.push({ x0: st.a - 4, x1: st.a, y0: Y - 10, y1: Y - 6, z: st.z, notch: true, upLv: up, sf: [{ axis: "x", c0: Y - 10, c1: Y - 6, dTop: st.a - 4, steps: 8, zB: st.z + 96, carpet: rugged ? [Y - 9, Y - 7] : null, way, near: false }] });
            low.patches.push({ x0: st.a, x1: st.b, y0: Y - 10, y1: Y, z: st.z, notch: true, upLv: up, sf: [
                { landing: { x0: st.a, x1: st.b, y0: Y - 10, y1: Y - 6, z: st.z + 96, rug: turnRug } },
                { axis: "y", c0: st.a, c1: st.b, dTop: Y - 6, steps: 12, zB: st.z, carpet, way }
            ] });
            (low.stairSigns = low.stairSigns || []).push({ x: st.b + 6, y: st.y, z: st.z, name: st.label, sign: st.sign, mid: (st.a + st.b) / 2 });
        } else if (st.kind === "sideturn") {
            /* the turning flight mirrored: up -x through a top-left wall to a landing, then -y into the floor above */
            punch(up, { x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b });
            punch(up, { x0: st.x - 10, x1: st.x - 6, y0: st.a - 4, y1: st.a });
            const X = st.x, carpet = !known ? [st.a + 1, st.b - 1] : span(st.a, st.b, y => onRug(low, X, y) || onRug(low, X - 1, y) || onRug(up, X - 11, y) || onRug(up, X - 10, y)) || (span(X - 10, X - 6, x => onRug(up, x, st.a - 5)) && [st.a + 1, st.b - 1]);
            const rugged = !!carpet, turnRug = rugged ? rugField([{ x0: X - 9, x1: X - 7, y0: st.a, y1: carpet[1] }, { x0: X - 9, x1: X - 7, y0: st.a - 2, y1: st.a }, { x0: X - 7, x1: X - 3, y0: carpet[0], y1: carpet[1] }]) : null;
            low.patches.push({ x0: X - 10, x1: X - 6, y0: st.a - 4, y1: st.a, z: st.z, notch: true, upLv: up, sf: [{ axis: "y", c0: X - 10, c1: X - 6, dTop: st.a - 4, steps: 8, zB: st.z + 96, carpet: rugged ? [X - 9, X - 7] : null, way, near: false }] });
            low.patches.push({ x0: X - 10, x1: X, y0: st.a, y1: st.b, z: st.z, notch: true, upLv: up, sf: [
                { landing: { x0: X - 10, x1: X - 6, y0: st.a, y1: st.b, z: st.z + 96, rug: turnRug, edgeX: true } },
                { axis: "x", c0: st.a, c1: st.b, dTop: X - 6, steps: 12, zB: st.z, carpet, way }
            ] });
        } else {
            punch(up, { x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b });
            const carpet = !known ? [st.a + 1, st.b - 1] : span(st.a, st.b, y => onRug(low, st.x, y) || onRug(low, st.x - 1, y) || onRug(up, st.x - 11, y) || onRug(up, st.x - 10, y));
            low.patches.push({ x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b, z: st.z, notch: true, upLv: up, sf: [{ axis: "x", c0: st.a, c1: st.b, dTop: st.x - 10, steps: 20, zB: st.z, carpet, way }] });
        }
    }
}

/* ---- from the editor's map file ----
   A map is levels of 2-tile cells (so floors always fall on whole parquet squares), plus what stands
   on them. Closed floors above the real ones are still worked out here, from the real floors' edges. */
function rectify(cells) {
    const rows = new Map();
    for (const c of cells) { const [cx, cy] = c.split(",").map(Number); if (!rows.has(cy)) rows.set(cy, []); rows.get(cy).push(cx); }
    const open = new Map(), out = [];
    for (const cy of [...rows.keys()].sort((a, b) => a - b)) {
        const xs = rows.get(cy).sort((a, b) => a - b), runs = [];
        for (const x of xs) { const l = runs[runs.length - 1]; if (l && l[1] === x) l[1] = x + 1; else runs.push([x, x + 1]); }
        const seen = new Set();
        for (const [a, b] of runs) {
            const key = a + "," + b, o = open.get(key);
            if (o && o.y1 === cy) { o.y1 = cy + 1; seen.add(key); }
            else { const r = { x0: a, x1: b, y0: cy, y1: cy + 1 }; out.push(r); open.set(key, r); seen.add(key); }
        }
    }
    return out.map(r => ({ x0: r.x0 * 2, x1: r.x1 * 2, y0: r.y0 * 2, y1: r.y1 * 2 }));
}
/* A floor can step up or down within itself, as the real hallways do: l.rise holds a cell's height in pixels, a whole number of
   steps, and the floor is cut into rectangles at each height. A floor with none comes out exactly as before. */
const OLD_HEIGHT = 32;
function patchesByHeight(l) {
    const hs = l.rise || Object.fromEntries(Object.entries(l.heights || {}).map(([k, v]) => [k, v * OLD_HEIGHT])), groups = new Map();
    for (const c of l.cells) { const h = hs[c] || 0; if (!groups.has(h)) groups.set(h, []); groups.get(h).push(c); }
    const out = [];
    for (const [h, cs] of [...groups.entries()].sort((a, c) => a[0] - c[0])) for (const r of rectify(cs)) out.push({ ...r, z: l.k * Z1 + h, up: h });
    return out;
}
function fromMap(map, names) {
    const real = [...map.levels].sort((a, c) => a.k - c.k);
    const lvls = real.map(l => ({ id: l.id, name: l.name, way: l.colour ? "hex:" + l.colour : l.way, k: l.k, rugs: (l.rugs || []).map(r => ({ ...r })), medals: l.medals || [],
        patches: patchesByHeight(l).map(r => ({ ...r, l: [], props: [], teles: [], dn: [] })), src: l }));
    for (const l of lvls) l.below = lvls.find(q => q.k === l.k - 1) || null;
    const byId = id => lvls.find(l => l.id === id);
    const set = lv => { const c = new Set(lv.src.cells); return (X, Y) => c.has(Math.floor(X / 2) + "," + Math.floor(Y / 2)); };

    /* closed floors above, column by column */
    const top = Math.max(...real.map(l => l.k));
    const COLS = []; for (let x = -320; x < 340; x += 2) COLS.push(x);
    const colY = (lv) => { const m = new Map(); for (const c of lv.src.cells) { const [cx, cy] = c.split(",").map(Number); const x = cx * 2, y = cy * 2; if (!m.has(x) || y < m.get(x)) m.set(x, y); } return m; };
    const merge = list => { const o = []; for (const P of list.sort((a, c) => a.x0 - c.x0)) { const l = o[o.length - 1]; if (l && l.x1 === P.x0 && l.y0 === P.y0 && l.y1 === P.y1) l.x1 = P.x1; else o.push(P); } return o; };
    const ways = ["slate", "sage", "mauve", "teal", "clay", "ash", "ochre", "oxblood"];
    const ground = lvls.find(l => l.k === 0);
    const gc = ground ? colY(ground) : new Map();
    const gxs = [...gc.keys()]; const minG = gxs.length ? Math.min(...gxs) : 0, maxG = gxs.length ? Math.max(...gxs) : 0;
    let backs = new Map(); for (const x of COLS) backs.set(x, gc.has(x) ? gc.get(x) : (x < minG ? gc.get(minG) : gc.get(maxG)) || 0);
    const seq = []; const stack = [];
    for (let k = 1; k <= top + 4; k++) {
        const r = lvls.find(l => l.k === k), rc = r ? colY(r) : new Map(), list = [], next = new Map();
        for (const x of COLS) {
            if (rc.has(x)) { next.set(x, rc.get(x)); continue; }
            const y1 = backs.get(x), y0 = y1 - 12;
            list.push({ x0: x, x1: x + 2, y0, y1: (x < minG && k === 1) ? 90 : y1, z: k * Z1, blank: true });
            next.set(x, y0);
        }
        const pats = merge(list);
        stack.push({ closed: { id: "C" + k, way: ways[(k + 2) % 8], patches: pats, closed: true, dim: Math.max(.34, .6 - k * .04), rugs: pats.filter(P => P.y1 - P.y0 >= 8 && P.x1 - P.x0 >= 12).map(P => ({ x0: P.x0 + 2, x1: P.x1 - 2, y0: P.y0 + 2, y1: P.y0 + 6 })) }, real: r });
        backs = next;
    }
    /* The closed, unwalkable floors around the real ones are off for now: past the real floors it's black.
       Set map.closedFloors to true to bring them back. */
    for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].real) seq.push(stack[i].real); if (map.closedFloors) seq.push(stack[i].closed); }
    if (ground) seq.push(ground);
    /* floors below Ground, top down like the rest */
    for (const l of lvls.filter(q => q.k < 0).sort((a, c) => c.k - a.k)) seq.push(l);

    /* stairs: each one cuts its slot and its hole */
    const stairs = (map.stairs || []).filter(st => byId(st.low) && byId(st.up)).map(st => ({ ...st, z: byId(st.low).k * Z1, label: st.label || byId(st.up).name }));
    cutStairs(byId, stairs);
    for (const lv of lvls) for (const P of lv.patches) { P.l = []; P.props = []; P.teles = []; P.dn = []; P.wi = []; }

    /* then everything that stands on or against the floors */
    let ni = 0; const report = { doors: 0, named: 0, lost: [] };
    const pinned = new Set(); for (const l of real) for (const d of (l.doors || [])) if (d.name && !d.spare) pinned.add(d.name);
    const nameList = (names || []).filter(n => !pinned.has(n));
    for (const lv of lvls) {
        const l = lv.src, real2 = lv.patches.filter(P => !P.notch);
        const at = (x, y) => real2.find(P => x >= P.x0 && x < P.x1 && y >= P.y0 && y < P.y1);
        const wells = lv.patches.filter(P => P.notch);
        const onWall = (axis, a, line) => axis === "x" ? real2.find(P => P.y0 === line && a >= P.x0 && a < P.x1) || wells.find(P => P.y0 === line && a >= P.x0 && a < P.x1) : real2.find(P => P.x0 === line && a > P.y0 && a <= P.y1) || wells.find(P => P.x0 === line && a > P.y0 && a <= P.y1);
        const onLanding = (x, y) => wells.find(P => (P.sf || []).some(f => f.landing && x >= f.landing.x0 && x < f.landing.x1 && y >= f.landing.y0 && y < f.landing.y1));
        const ds = [...(l.doors || [])].sort((p, q) => (p.axis === "y" ? 0 : 1) - (q.axis === "y" ? 0 : 1) || p.at - q.at);
        for (const d of ds) {
            /* a door can straddle two lengths of wall: it goes with the one drawn last, or that one paints over it */
            const P = (d.axis === "x"
                ? real2.filter(q => q.y0 === d.line && q.x0 < d.at + 2 && q.x1 > d.at).sort((m, n) => n.x0 - m.x0)[0]
                : real2.filter(q => q.x0 === d.line && q.y0 < d.at && q.y1 > d.at - 2).sort((m, n) => n.y0 - m.y0)[0]) || onWall(d.axis, d.at, d.line);
            report.doors++;
            if (!P) { report.lost.push("door " + d.axis + d.at); continue; }
            const name = d.spare ? null : (d.name || nameList[ni++] || null);
            if (name) report.named++;
            P.dn.push({ d: [d.axis, d.at], name, sign: d.sign });
        }
        for (const q of (l.lamps || [])) { const P = onWall(q.axis, q.at, q.line); if (P) P.l.push([q.axis, q.at, q.colour, q.style, q.h]); }
        for (const q of (l.wallItems || [])) { const P = onWall(q.axis, q.at, q.line); if (P) P.wi.push(q); }
        for (const p of (l.props || [])) { const run = Parts.tiles(p), end = run[run.length - 1], P = onLanding(p.x, p.y) || (Parts.ROWS[p.k] && at(end[0], end[1])) || at(p.x, p.y) || real2[0]; if (!P) continue; const c = new Set(l.cells), against = !c.has(Math.floor(p.x / 2) + "," + Math.floor((p.y - 2) / 2)) || !c.has(Math.floor((p.x - 2) / 2) + "," + Math.floor(p.y / 2)); P.props.push([p.k, p.x, p.y, !against, p.len, p.rot, p.style, p.colour, p.lights, p.lightUp]); }

    }
    for (const q of (map.lifts || (map.lift ? [map.lift] : []))) {
        const li2 = byId(q.level); if (!li2) continue;
        const P = li2.patches.find(r => !r.notch && r.y0 === q.y && q.x >= r.x0 && q.x < r.x1);
        if (P) { (P.liftList = P.liftList || []).push(q.x); } else report.lost.push("lift " + q.x);
    }
    if (map.entrance) { const q = map.entrance, li3 = byId(q.level); if (li3) { (li3.portals = li3.portals || []).push(q); } }
    const li = null;
    if (li) { const P = li.patches.find(q => !q.notch && q.y0 === map.lift.y && map.lift.x >= q.x0 && map.lift.x < q.x1); if (P) P.lift = map.lift.x; else report.lost.push("lift"); }
    seq.report = report;
    return seq;
}

function build(cfg) {
    cfg = cfg || {};
    const names = cfg.names || H.names2();
    const levels = cfg.map ? fromMap(cfg.map, names) : plan();
    /* A to Z along the walking order */
    const QUOTA = cfg.map ? {} : { G: 16, F1: 12, F2: 7, F3: 4 };
    let ni = 0;
    for (const id of Object.keys(QUOTA)) {
        const lv = levels.find(l => l.id === id), q = QUOTA[id];
        const slots = [];
        for (const P of [...lv.patches].sort((a, c) => a.x0 - c.x0)) if (P.d) { P.dn = []; const ord = [...P.d].sort((a, c) => (a[0] === "y" ? 0 : 1) - (c[0] === "y" ? 0 : 1) || a[1] - c[1]); for (const dd of ord) { const it = { d: dd, name: null }; P.dn.push(it); slots.push(it); } }
        slots.forEach((it, i) => { if (Math.floor((i + 1) * q / slots.length) !== Math.floor(i * q / slots.length)) it.name = names[ni++] || null; });
    }
    w_total = ni;
    const MINX = -90, MAXX = 310, MINY = -130, MAXY = 120;
    const pw = (MAXX - MINX + MAXY - MINY) * 16 + 200, zSpan = 1100;
    const ox = (MAXY - MINY) * 16 - (MINX * 16) + 100 - (MAXY * 16 + 0) + 0;
    const oxx = 100 + (MAXY - MINX) * 16;
    const oyy = 100 - (MINX + MINY) * 8 + zSpan;
    const ph = (MAXX + MAXY - MINX - MINY) * 8 + 2 * zSpan + 300;
    const master = cfg.clip ? null : null;
    const cl = cfg.clip;                 // [cx, cy, w, h] in world px around at(); limits the work
    const at = (x, y, z) => [Math.round((x - y) * 16) + oxx, Math.round((x + y) * 8) + oyy - (z || 0)];
    const view = cl ? (() => { const c = at(cl[0], cl[1], cl[2]); return [c[0] - (cl[3] >> 1) - 40, c[1] - (cl[4] >> 1) - 40, c[0] + (cl[3] >> 1) + 40, c[1] + (cl[4] >> 1) + 40]; })() : [0, 0, pw, ph];
    const bw = view[2] - view[0], bh = view[3] - view[1];
    const out = new Buf(bw, bh, "000000"), layer = new Buf(bw, bh, "07060a");
    const furniX = new Int16Array(bw * bh), furniY = new Int16Array(bw * bh), furniC = new Int32Array(bw * bh), NO_FURNI = -32768;
    const wallOwner = new Uint16Array(bw * bh);
    const mask = new Uint8Array(bw * bh), zb = new Int16Array(bw * bh), fc = new Int32Array(bw * bh), done = new Uint8Array(bw * bh);
    const gx = oxx - view[0], gy = oyy - view[1];
    const w = {
        keep: new Int32Array(bw * bh),
        glowing: new Int32Array(bw * bh),
        ox: gx, oy: gy, z: 0, b: layer, lamps: [], sprites: [], mats: [], tallX: TALLX, tallY: TALLY, seamX: SEAMX, seamY: SEAMY, wallTop: 101 + WALL_ADD, lampH: 106,
        S(x, y) { return [Math.round((x - y) * 16) + this.ox, Math.round((x + y) * 8) + this.oy - this.z]; },
        WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; },
        WY(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] - Math.floor(u / 2) - h]; }
    };
    const tileDraw = (X, Y, smp) => {
        const a = w.S(X, Y);
        for (let dy = 0; dy < 16; dy++) { const half = dy < 8 ? dy * 2 + 2 : (15 - dy) * 2 + 2; for (let dx = -half; dx <= half; dx++) { const c = smp(dx, dy); if (c) { const sx = a[0] + dx, sy = a[1] + dy; if (sx >= 0 && sy >= 0 && sx < bw && sy < bh) { layer.set(sx, sy, c); mask[sy * bw + sx] = 1; zb[sy * bw + sx] = w.z; fc[sy * bw + sx] = (c[0] << 16) | (c[1] << 8) | c[2]; } } } }
    };
    const inView = P => { const x0 = (P.x0 - P.y1) * 16 + gx - 200, x1 = (P.x1 - P.y0) * 16 + gx + 200, y0 = (P.x0 + P.y0) * 8 + gy - P.z - 200, y1 = (P.x1 + P.y1) * 8 + gy - P.z + 200; return !(x1 < 0 || x0 > bw || y1 < 0 || y0 > bh); };
    const way = cfg.way, Mname = cfg.light || (cfg.map && cfg.map.light) || "sconces", M = LIGHTS[Mname] || LIGHTS.sconces;
    w.lightsOff = !!M.off;
    let avL = [1, 1, 1];

    for (const lv of levels) {
        const has = new Set();
        for (const P of lv.patches) for (let X = P.x0; X < P.x1; X++) for (let Y = P.y0; Y < P.y1; Y++) has.add(X + "," + Y);
        const holes = new Set(); for (const r of (lv.holes || [])) for (let X = r.x0; X < r.x1; X++) for (let Y = r.y0; Y < r.y1; Y++) holes.add(X + "," + Y);
        if (!lv.patches.some(inView)) continue;
        /* Back walls only: where this floor's edge looks out over the floor below, that's a drop,
           not somewhere a wall belongs. */
        const belowCells = lv.below ? new Set(lv.below.src.cells) : null;
        const aboveLv = lv.src ? levels.find(q => q.src && q.src.k === lv.src.k + 1) : null, aboveCells = aboveLv ? new Set(aboveLv.src.cells) : null;
        /* ...unless there's a floor over it as well: then it's enclosed, and without a wall you'd see straight through */
        /* a door needs a wall to hang in: an edge with a door on it keeps its wall all along */
        const cellsHere = lv.src ? new Set(lv.src.cells) : null, floorAt = (X, Y) => cellsHere.has(Math.floor(X / 2) + "," + Math.floor(Y / 2));
        const doorEdge = (axis, X, Y) => {
            if (!cellsHere) return false;
            const ds = (lv.src.doors || []).filter(d => d.axis === axis && d.line === (axis === "x" ? Y : X));
            if (!ds.length) return false;
            if (axis === "x") { let a = X, b = X; while (floorAt(a - 1, Y) && !floorAt(a - 1, Y - 1)) a--; while (floorAt(b + 1, Y) && !floorAt(b + 1, Y - 1)) b++; return ds.some(d => d.at + 1 >= a && d.at <= b); }
            let a = Y, b = Y; while (floorAt(X, a - 1) && !floorAt(X - 1, a - 1)) a--; while (floorAt(X, b + 1) && !floorAt(X - 1, b + 1)) b++; return ds.some(d => d.at - 1 >= a && d.at - 2 <= b);
        };
        const airBelow = (X, Y) => !!belowCells && belowCells.has(Math.floor(X / 2) + "," + Math.floor(Y / 2)) && !(aboveCells && aboveCells.has(Math.floor(X / 2) + "," + Math.floor(Y / 2)));
        /* does the wall carry on along this line at this tile? Then the run before it has no end post. */
        const tileOf = new Map(); for (const Q of lv.patches) for (let X = Q.x0; X < Q.x1; X++) for (let Y = Q.y0; Y < Q.y1; Y++) tileOf.set(X + "," + Y, Q);
        const shownWalls = new Set((lv.src && lv.src.showWalls) || []), shown = (axis, line, t) => shownWalls.has(axis + "|" + line + "|" + t);
        const backWall = (X, Y, z) => { const Q = tileOf.get(X + "," + Y); return !!Q && (z === undefined || Q.z === z) && Q.y0 === Y && !has.has(X + "," + (Y - 1)) && !holes.has(X + "," + (Y - 1)) && !Q.noBack && (Q.notch || !airBelow(X, Y - 1) || doorEdge("x", X, Y) || shown("x", Y, X)); };
        const sideWall = (X, Y, z) => { const Q = tileOf.get(X + "," + Y); return !!Q && (z === undefined || Q.z === z) && Q.x0 === X && !has.has((X - 1) + "," + Y) && !holes.has((X - 1) + "," + Y) && (Q.notch || !airBelow(X - 1, Y) || doorEdge("y", X, Y) || shown("y", X, Y)); };
        layer.d.fill(0); for (let i = 0; i < layer.d.length; i += 4) { layer.d[i] = VOID[0]; layer.d[i + 1] = VOID[1]; layer.d[i + 2] = VOID[2]; layer.d[i + 3] = 255; }
        mask.fill(0); w.keep.fill(0); w.glowing.fill(0); w.footShadows = [];
        w.lamps = [];
        wallOwner.fill(0);
        const signs = [], pushSign = signs.push.bind(signs); let signPatch = null;
        signs.push = o => pushSign({ ...o, wallZ: signPatch ? signPatch.z : w.z, wallLine: signPatch ? (o.alongY ? signPatch.x0 : signPatch.y0) : null });
        furniX.fill(NO_FURNI);
        const drawSprite = s => {
            if (!s.furni) return s.draw();
            const own = Object.prototype.hasOwnProperty.call(layer, "set"), was = layer.set;
            const touched = [];
            layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) { const i = y * bw + x; furniX[i] = s.tx; furniY[i] = s.ty; touched.push(i); } };
            s.draw();
            if (own) layer.set = was; else delete layer.set;
            for (const i of touched) { const p = i * 4; furniC[i] = (layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]; }
        };
        /* A stairwell goes after everything behind it (to its left, or further back) and before everything in
           front of it (to its right, or nearer), wherever that falls among the floors' usual back-to-front order. */
        const drawList = lv.patches.filter(P => !P.notch).sort((a, c) => a.y0 - c.y0 || a.x0 - c.x0);
        for (const n of lv.patches.filter(P => P.notch).sort((a, c) => a.x0 - c.x0 || a.y0 - c.y0)) {
            const behind = Q => (Q.x1 <= n.x0 && Q.y0 < n.y1) || (Q.x0 < n.x1 && Q.x1 > n.x0 && Q.y1 <= n.y0);
            const inFront = Q => Q.x0 >= n.x1 || (Q.x0 < n.x1 && Q.x1 > n.x0 && Q.y0 >= n.y1);
            let at = 0; drawList.forEach((Q, i) => { if (behind(Q)) at = i + 1; });
            const before = drawList.slice(0, at), after = drawList.slice(at);
            drawList.length = 0; drawList.push(...before.filter(Q => !inFront(Q)), n, ...before.filter(inFront), ...after);
        }
        /* A wall with its own colours: every pixel of it is marked as it's drawn, and anything painted over it clears the mark. */
        const wallList = (lv.src && lv.src.walls) || [], wallWays = wallList.map(q => wayForWall(wayOf(cfg.single || lv.way) || WAYS.oxblood, q)), wallTag = wallList.length ? new Uint8Array(bw * bh) : null;
        const wallC = wallTag ? new Int32Array(bw * bh) : null;
        let curWall = 0;
        const colOf = (axis, line) => wallTag ? at => { const t = Math.floor((axis === "x" ? at : at - 1) / 16); curWall = 1 + wallList.findIndex(q => q.axis === axis && q.line === line && t >= q.a && t < q.b); } : null;
        const tagged = draw => {
            if (!wallTag) return draw();
            const was = layer.set;
            layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) { wallTag[y * bw + x] = curWall; wallC[y * bw + x] = (c[0] << 16) | (c[1] << 8) | c[2]; } };
            draw();
            layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) wallTag[y * bw + x] = 0; };
        };
        /* Walls you've set to half height, tile by tile: the client's low panelled wall, standing on the floor. (halfWalls is the older
           form, by 2-tile section.) */
        const halfSet = new Set((lv.src && lv.src.halfTiles) || []);
        for (const k of ((lv.src && lv.src.halfWalls) || [])) { const [ax, ln, c] = k.split("|"); halfSet.add(ax + "|" + ln + "|" + (+c * 2)); halfSet.add(ax + "|" + ln + "|" + (+c * 2 + 1)); }
        const noneSet = new Set((lv.src && lv.src.noWalls) || []), portalTiles = new Set();
        for (const q of (lv.portals || [])) for (let t = 0; t < 8; t++) { const k = q.axis + "|" + q.line + "|" + (q.at + t); noneSet.add(k); portalTiles.add(k); }
        const halfOf = (axis, line) => {
            if (!halfSet.size && !noneSet.size) return {};
                        return axis === "x"
                ? { seamless: at => portalTiles.has("x|" + line + "|" + Math.floor(at / 16)), none: at => noneSet.has("x|" + line + "|" + Math.floor(at / 16)), half: at => halfSet.has("x|" + line + "|" + Math.floor(at / 16)), halfCol: (at, sx, fy) => halfWallColumn(layer, LOWX, lowX(at), sx, fy - HALF_WALL, HALF_WALL), halfEnd: Q => { for (let k = 0; k < 6; k++) halfWallColumn(layer, LOWX, 128 + k, Q[0] + k, Q[1] + Math.floor(k / 2) - HALF_WALL, HALF_WALL); }, halfStart: Q => lowWallStart(layer, LOWX, [0, 1, 2, 3].map(i => [i, Q[0] + i - 4]), 4, Q, HALF_WALL) }
                : { seamless: at => portalTiles.has("y|" + line + "|" + Math.floor((at - 1) / 16)), none: at => noneSet.has("y|" + line + "|" + Math.floor((at - 1) / 16)), half: at => halfSet.has("y|" + line + "|" + Math.floor((at - 1) / 16)), halfCol: (at, sx, fy) => halfWallColumn(layer, LOWY, lowY(at), sx, fy - HALF_WALL, HALF_WALL), halfEnd: Q => { for (let k = 0; k < 6; k++) halfWallColumn(layer, LOWY, k, Q[0] - 6 + k, Q[1] + Math.floor((6 - k) / 2) - HALF_WALL, HALF_WALL); }, halfStart: Q => lowWallStart(layer, LOWY, [130, 131, 132, 133].map((i, k) => [i, Q[0] + k]), 129, Q, HALF_WALL) };
        };
        /* note every pixel of a wall light as it's drawn, to put it back over the signs later */
        const lampPx = new Map();
        w.noRecess = !!cfg.map;
        const lampNoted = draw => {
            const own = Object.prototype.hasOwnProperty.call(layer, "set"), was = layer.set;
            layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) { const p = (y * bw + x) * 4; lampPx.set(y * bw + x, (layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]); } };
            draw();
            if (own) layer.set = was; else delete layer.set;
        };
        /* Parts of a floor at different heights overlap on screen, so they go strictly back to front, and whatever stands on the
           lower parts goes in among the raised parts, so a raised part in front covers it. A flat floor skips all this. */
        const lowest = Math.min(...lv.patches.map(q => q.z)), uneven = lv.patches.some(q => q.z !== lowest);
        /* see-through: while the editor's key is held, floor above this height isn't drawn, nor anything on it */
        const cut = cfg.cut && lv.src && cfg.cut.level === lv.src.id ? cfg.cut.z : null;
        const isBehind = (A, B) => (A.x1 <= B.x0 && A.y0 < B.y1) || (A.y1 <= B.y0 && A.x0 < B.x1);
        if (uneven) {
            const left = [...drawList]; drawList.length = 0;
            while (left.length) { let i = left.findIndex(A => !left.some(B => B !== A && isBehind(B, A))); if (i < 0) i = 0; drawList.push(left.splice(i, 1)[0]); }
        }
        const raisedLater = uneven ? drawList.filter(q => q.z > lowest && !q.notch) : [];
        for (const q of raisedLater) q.raised = true;
        {
            const behind = (A, B) => (A.x1 <= B.x0 && A.y0 < B.y1) || (A.y1 <= B.y0 && A.x0 < B.x1), left = [...raisedLater], sorted = [];
            while (left.length) { let i = left.findIndex(A => !left.some(B => B !== A && behind(B, A))); if (i < 0) i = 0; sorted.push(left.splice(i, 1)[0]); }
            raisedLater.length = 0; raisedLater.push(...sorted.filter(q => cut === null || q.z <= cut));
        }
        /* Small steps are part of the floor, so they take the light as the floor does. Left to the wall's light they stayed dark, and any step pixel the same colour as the floor
           under it was still counted as floor and lit up, which looked like the floor showing through. */
        const litAsFloor = (z, draw) => {
            const own = Object.prototype.hasOwnProperty.call(layer, "set"), was = layer.set;
            layer.set = function (x, y, c) {
                was.call(layer, x, y, c);
                if (x < 0 || y < 0 || x >= bw || y >= bh) return;
                const i = y * bw + x, q = i * 4; if (Math.abs(layer.d[q] - c[0]) > 1 || Math.abs(layer.d[q + 1] - c[1]) > 1 || Math.abs(layer.d[q + 2] - c[2]) > 1) return;      // something in front kept this pixel
                mask[i] = 1; zb[i] = z; fc[i] = (layer.d[q] << 16) | (layer.d[q + 1] << 8) | layer.d[q + 2];
            };
            draw();
            if (own) layer.set = was; else delete layer.set;
        };
        /* small steps: a flight on the lower floor, climbing away from you */
        const zAt = (X, Y) => { const Q = tileOf.get(X + "," + Y); return Q ? Q.z : null; };
        for (const st of ((lv.src && lv.src.steps) || [])) {
            const alongY = st.axis === "y", back = alongY ? zAt(st.a, st.line - 1) : zAt(st.line - 1, st.a), near = alongY ? zAt(st.a, st.line) : zAt(st.line, st.a), toYou = st.dir === "front";
            if (back === null || near === null) continue;
            const hi = toYou ? near : back, lo = toYou ? back : near;
            if (hi <= lo || (cut !== null && hi > cut)) continue;
            const diff = hi - lo, onR = (X, Y) => (lv.rugs || []).some(r => X >= r.x0 && X < r.x1 && Y >= r.y0 && Y < r.y1);
            let a0 = null, a1 = null; for (let t = st.a + 1; t < st.b - 1; t++) if (alongY ? onR(t, st.line) || onR(t, st.line - 1) : onR(st.line, t) || onR(st.line - 1, t)) { if (a0 === null) a0 = t; a1 = t + 1; }
            const count = Math.round(diff / STEP_R), reach = count * STEP_D, f = { axis: alongY ? "y" : "x", c0: st.a, c1: st.b, dTop: st.line, dStart: st.line - reach, steps: count, rise: STEP_R, tread: STEP_D, zB: lo, carpet: a0 === null ? null : [a0, a1], way: cfg.single || lv.way, tiled: true };
            const along = toYou ? Math.floor(st.line - reach) : st.line;
            const d0 = toYou ? Math.floor(st.line - reach) : st.line, d1 = toYou ? st.line : Math.ceil(st.line + reach);
            const onP = alongY ? tileOf.get(st.a + "," + d0) : tileOf.get(d0 + "," + st.a), whole = onP && (alongY ? onP.x0 <= st.a && onP.x1 >= st.b && onP.y0 <= d0 && onP.y1 >= d1 : onP.x0 <= d0 && onP.x1 >= d1 && onP.y0 <= st.a && onP.y1 >= st.b);
            /* only if it's all on that one part: a flight across two has to wait for both, or the second paints over it */
            (lv.later = lv.later || []).push({ withFloor: true, depth: along + st.a + .5, tx: alongY ? st.a : along, ty: alongY ? along : st.a, rect: alongY ? { x0: st.a, x1: st.b, y0: d0, y1: d1 } : { x0: d0, x1: d1, y0: st.a, y1: st.b }, draw: () => litAsFloor((hi + lo) / 2, () => toYou ? flightUpToYou(w, f) : flight(w, f)) });
        }
        /* every drop, as a straight stretch of wall on the lower floor, drawn with what stands on the floors so the higher floor can't paint over it */
        if (uneven) {
            const T = w.wallTop, stepsOn = (axis, line, t) => ((lv.src && lv.src.steps) || []).some(st => st.axis === axis && st.dir !== "front" && st.line === line && t >= st.a && t < st.b);
            const doorsOn = (lv.src && lv.src.doors) || [], noWall = new Set((lv.src && lv.src.noWalls) || []), lowWall = new Set((lv.src && lv.src.halfTiles) || []);
            const tiled = axis => { const out = new Map(); for (const [key, Q] of tileOf) { if (Q.notch) continue; const [X, Y] = key.split(",").map(Number), B = tileOf.get(axis === "x" ? X + "," + (Y - 1) : (X - 1) + "," + Y); if (!B || B.notch || B.z <= Q.z) continue; const line = axis === "x" ? Y : X, t = axis === "x" ? X : Y; if (stepsOn(axis, line, t)) continue; if (!out.has(line)) out.set(line, []); out.get(line).push({ t, z: Q.z, top: B.z }); } return out; };
            for (const axis of ["x", "y"]) for (const [line, list] of tiled(axis)) {
                list.sort((p, q) => p.t - q.t);
                for (let i = 0; i < list.length;) {
                    let j = i + 1; while (j < list.length && list[j].t === list[j - 1].t + 1 && list[j].z === list[i].z && list[j].top === list[i].top) j++;
                    const a = list[i].t, b = list[j - 1].t + 1, zr = list[i].z, drop = list[i].top - zr; i = j;
                    if (cut !== null && zr + drop > cut) continue;
                    const hasDoor = doorsOn.some(d => d.axis === axis && d.line === line && (axis === "x" ? d.at < b && d.at + 2 > a : d.at - 2 < b && d.at > a)), H = hasDoor ? Math.max(drop, DOOR_WALL) : drop;
                    const col = colOf(axis, line), capped = H > drop, state = t => { const k = axis + "|" + line + "|" + t; return noWall.has(k) ? "none" : lowWall.has(k) ? "half" : "full"; };
                    const onP = tileOf.get(axis === "x" ? a + "," + line : line + "," + a);
                    const liftBy = axis === "x" ? ((cfg.map && cfg.map.lifts) || []).filter(q => lv.src && q.level === lv.src.id && q.y === line && q.x < b + 1 && q.x + 4 > a).map(q => q.x + q.y - .4) : [];
                    (lv.later = lv.later || []).push({ withFloor: true, depth: Math.min((axis === "x" ? a + line : line + a) - .2, ...liftBy), tx: axis === "x" ? a : line, ty: axis === "x" ? line : a, draw: () => tagged(() => {
                        const zs = w.z; w.z = zr;
                        for (let t = a; t < b; t++) {
                            const st = state(t); if (st === "none") continue;
                            for (let u = 0; u < 16; u++) {
                                const at = axis === "x" ? t * 16 + u : t * 16 + 1 + u; if (col) col(at);
                                const low = st === "half";
                                if (axis === "x") {
                                    const m = Math.floor(at / 128) * 8, i2 = ((at % 128) + 128) % 128, p = w.S(m, line), raw = at < a * 16 + 24;
                                    if (low) halfWallColumn(layer, LOWX, lowX(at), p[0] + i2, p[1] + Math.floor(i2 / 2) - H, H);
                                    else if (raw && capped) { const q = w.S(a, line), r = at - a * 16; shortWallColumn(layer, TALLX, r, T + Math.floor(r / 2), q[0] + r, q[1] + Math.floor(r / 2), H, capped); }
                                    else shortWallColumn(layer, SEAMX, i2, T + Math.floor(i2 / 2), p[0] + i2, p[1] + Math.floor(i2 / 2), H, capped);
                                } else {
                                    const m = Math.floor((at - 1) / 128) * 8, d = at - m * 16, i2 = 138 - d, p = w.S(line, m), raw = at <= a * 16 + 24;
                                    if (low) halfWallColumn(layer, LOWY, lowY(at), p[0] - 138 + i2, p[1] + Math.floor(d / 2) - H, H);
                                    else if (raw && capped) { const q = w.S(line, a), r = at - a * 16; shortWallColumn(layer, TALLY, 138 - r, T + Math.floor(r / 2), q[0] - r, q[1] + Math.floor(r / 2), H, capped); }
                                    else shortWallColumn(layer, SEAMY, i2, T + Math.floor(d / 2), p[0] - 138 + i2, p[1] + Math.floor(d / 2), H, capped);
                                }
                            }
                        }
                        /* its far end, finished like any wall's */
                        if (state(b - 1) !== "none" && (capped || state(b - 1) === "half")) {
                            if (col) col(axis === "x" ? b * 16 - 1 : b * 16);
                            const low = state(b - 1) === "half";
                            if (axis === "x") { const q = w.S(b, line); for (let k = 0; k < (low ? 6 : 10); k++) { if (low) halfWallColumn(layer, LOWX, 128 + k, q[0] + k, q[1] + Math.floor(k / 2) - H, H); else shortWallColumn(layer, TALLX, 128 + k, T + Math.floor((128 + k) / 2), q[0] + k, q[1] + Math.floor(k / 2), H, capped); } }
                            else { const q = w.S(line, b); for (let k = 0; k < (low ? 6 : 10); k++) { const span = low ? 6 : 10; if (low) halfWallColumn(layer, LOWY, k, q[0] - span + k, q[1] + Math.floor((span - k) / 2) - H, H); else shortWallColumn(layer, TALLY, k, T + Math.floor((138 - k) / 2), q[0] - span + k, q[1] + Math.floor((span - k) / 2), H, capped); } }
                        }
                        w.z = zs;
                    }) });
                }
            }
        }
        /* decorative floor edges: each run stands with the furniture, on the floor it belongs to, and climbs any small steps it's on */
        if (lv.src && lv.src.edgeItems) {
            const flightLift = (axis, across, along) => {
                for (const st of (lv.src.steps || [])) {
                    /* a run along y sits beside a flight climbing along y */
                    if (st.axis !== axis || across < st.a || across >= st.b) continue;
                    const alongY = st.axis === "y", back = alongY ? zAt(st.a, st.line - 1) : zAt(st.line - 1, st.a), near = alongY ? zAt(st.a, st.line) : zAt(st.line, st.a), toYou = st.dir === "front";
                    if (back === null || near === null) continue;
                    const rise = toYou ? near - back : back - near; if (rise <= 0) continue;
                    const depth = rise / STEP_R * STEP_D, from = toYou ? st.line - depth : st.line, to = from + depth;
                    if (along >= from && along <= to) return rise * (toYou ? along - from : to - along) / depth;
                }
                return 0;
            };
            for (const run0 of EdgeItems.runsOf(lv.src.edgeItems)) {
                const onTile = t => run0.axis === "x" ? [t, run0.dir > 0 ? run0.line : run0.line - 1] : [run0.dir > 0 ? run0.line : run0.line - 1, t];
                /* a raised part draws in its own turn, so a run stops where a raised part does */
                const pieces = []; let a = null, prev = null;
                for (let t = run0.a; t <= run0.b; t++) {
                    const q = t < run0.b ? tileOf.get(onTile(t).join(",")) : null;
                    if (a !== null && (!q || (prev !== q && ((prev && prev.raised) || q.raised)))) { pieces.push({ ...run0, a, b: t }); a = null; }
                    if (a === null && q) a = t;
                    prev = q;
                }
                for (const run of pieces) {
                    const first = onTile(run.a), zBase = zAt(first[0], first[1]); if (zBase === null || (cut !== null && zBase > cut)) continue;
                    /* worked out once, the first time any tile of it is drawn */
                    let px = null;
                    const pixelsOf = () => {
                        if (px) return px;
                        const zs = w.z; w.z = zBase;
                        const at = (fx, fy) => w.S(fx, fy), lift = along => { const t = onTile(Math.floor(along)), z = zAt(t[0], t[1]); return (z === null ? 0 : z - zBase) + flightLift(run.axis === "x" ? "x" : "y", run.axis === "x" ? t[1] : t[0], along); };
                        px = new Map(); for (const q of EdgeItems.pixels(run, at, lift)) { if (!px.has(q[3])) px.set(q[3], []); px.get(q[3]).push(q); }
                        w.z = zs; return px;
                    };
                    /* each tile of it takes its own place among the furniture: a back edge goes behind what stands on that tile, a front edge in front of it */
                    for (let t = run.a; t < run.b; t++) {
                        const tile = onTile(t);
                        const owner = tileOf.get(tile.join(","));
                        (lv.later = lv.later || []).push({ depth: tile[0] + tile[1] + (run.dir > 0 ? -.1 : .6), tx: tile[0], ty: tile[1], furni: true, rect: { x0: tile[0], x1: tile[0] + 1, y0: tile[1], y1: tile[1] + 1 }, foot: run.axis === "x" ? { x0: tile[0], x1: tile[0] + 1, y0: tile[1] + (run.dir > 0 ? 0 : 1), y1: tile[1] + (run.dir > 0 ? 0 : 1) } : { x0: tile[0] + (run.dir > 0 ? 0 : 1), x1: tile[0] + (run.dir > 0 ? 0 : 1), y0: tile[1], y1: tile[1] + 1 }, draw: () => {
                            for (const [X, Y, c] of (pixelsOf().get(t) || [])) {
                                layer.set(X, Y, c);
                                if (w.keep && X >= 0 && Y >= 0 && X < bw && Y < bh) w.keep[Y * bw + X] = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1;
                            }
                        } });
                    }
                }
            }
        }
        /* what stands on a part of the floor goes into the queue. A raised part's goes in before anything is drawn, so the queue can be put in order with all of it there. */
        const queueScenery = P => {
            const zn = w.z, inReach = (x, y, m) => { const sx = (x - y) * 16 + gx, sy = (x + y) * 8 + gy - zn; return sx > -m && sx < bw + m && sy > -m && sy < bh + m; };
            /* scenery */
            w.partAt = q => { const zq = zAt(q.x, q.y); if (cut !== null && zq !== null && zq > cut) return false; w.z = zq === null ? P.z : zq; return true; };
            const here = w.sprites;
            /* how much taller a tall pillar must be for its top to meet the underside of the floor above: that floor's height over this tile, less its 12px edge and the pillar's own 94px */
            const tallBy = (X, Y, z) => { const c = Math.floor(X / 2) + "," + Math.floor(Y / 2), up = ((lv.src ? lv.src.k : 0) + 1) * Z1 + ((aboveLv && aboveLv.src.rise && aboveLv.src.rise[c]) || 0); return Math.max(0, up - 12 - z - 94); };
            /* on a landing: at the landing's height, and drawn here, seen only through the stairwell's opening like the rest of it */
            const landingOf = P.notch ? (P.sf || []).find(f => f.landing) : null, landZ = landingOf ? landingOf.landing.z : null, landingQueue = [];
            if (landingOf) w.partAt = () => { if (cut !== null && landZ > cut) return false; w.z = landZ; return true; };
            for (const p of (P.props || [])) {
                const [k, x, y] = p;
                if (!inReach(x, y, 340)) continue;
                if (landingOf) w.z = landZ;
                w.sprites = landingOf ? landingQueue : (lv.later = lv.later || []);      // one queue for every part of a floor, or a raised part's things paint over what stands on the part next to it      // all in one queue, or what stands against a wall gets painted over by what is behind it
                const from = w.sprites.length;
                if (k === "lamp") floorLamp(w, x, y, p[6], p[7]);
                else for (const q of Parts.parts({ k, x, y, len: p[4], rot: p[5] })) w.partAt(q) && H.furni(w, q.names, q.x, q.y, { flip: q.flip, dz: k === "statue" || k === "fountain" ? 1.5 : 0, stretch: k === "pillartall" ? tallBy(q.x, q.y, w.z) : 0, keepColour: k === "pillar" || k === "pillartall" || k === "ero" || k.startsWith("ero_") || k === "smtable" || k === "ballpost" || k === "shelf" || k === "sofa" || k === "table" || k === "chair", tint: k === "ballpost" || ((k === "pillar" || k === "pillartall") && (wayOf(cfg.single || lv.way) || {}).planks) ? floorTint(cfg.single || lv.way) : (k === "sofa" || k === "chair") && (lv.k !== 0 || (lv.src && lv.src.colour)) ? cushionTint(cfg.single || lv.way) : null });
                if ((k === "pillar" || k === "pillartall") && p[8]) for (const f of p[8]) pillarLight(w, x, y, f, p[7], p[9]);
                w.z = P.z;
                for (let i = from; i < w.sprites.length; i++) { const q = w.sprites[i]; q.tx = q.ftx === undefined ? x : q.ftx; q.ty = q.fty === undefined ? y : q.fty; q.furni = true; if (k === "statue" || k === "fountain") q.foot = { x0: x - 1, x1: x + 2, y0: y - 1, y1: y + 2 }; }      // Ground's sofas and chairs keep their original red
            }
            w.sprites = here;
            return landingQueue;
        };
        /* How a wall ends where it meets another round a corner. On one height it just runs into it. Between heights they still make a corner: the lower wall runs into the higher, and only the part of the higher wall that stands above the lower keeps its end. */
        const cornerEnd = (carriesOn, meets, otherZ, z) => { if (carriesOn) return { noEnd: true }; if (!meets || otherZ === null) return { noEnd: false }; return z > otherZ ? { noEnd: false, endKeep: z - otherZ + 14 } : { noEnd: true }; };
        const drawPatch = P => {
            signPatch = P; w.z = P.z; w.sprites = []; w.mats = [];
            if (P.notch && P.upLv) {
                /* A stairwell is only ever seen through its opening. Each pixel of it is tested against
                   the floor above: if that floor is in the way, the pixel was never visible. */
                const up = P.upLv;
                if (!up.tileSet) { up.tileSet = new Set(); for (const q of up.patches) if (!q.notch) for (let X = q.x0; X < q.x1; X++) for (let Y = q.y0; Y < q.y1; Y++) up.tileSet.add(X + "," + Y); }
                const raw = Buf.prototype.set, zUp = P.z + Z1;
                layer.set = function (x, y, c) {
                    const rx = x - gx, ry = y - gy + zUp;
                    if (up.tileSet.has(Math.floor((rx + 2 * ry) / 32) + "," + Math.floor((2 * ry - rx) / 32))) return;
                    raw.call(layer, x, y, c);
                };
            } else if (P.raised) {
                const raw = Buf.prototype.set, patches = lv.patches;
                layer.set = function (x, y, c) {
                    if (x >= 0 && y >= 0 && x < bw && y < bh) { const o = wallOwner[y * bw + x]; if (o) { const Q = patches[o - 1]; if (!Q.raised && !Q.notch && (P.x1 <= Q.x0 && P.y0 < Q.y1 || P.y1 <= Q.y0 && P.x0 < Q.x1)) return; } }
                    raw.call(layer, x, y, c);
                };
            } else delete layer.set;
            /* note a lower part's walls as they go on */
            const beforeWalls = Object.prototype.hasOwnProperty.call(layer, "set") ? layer.set : null, ownerId = lv.patches.indexOf(P) + 1;
            if (ownerId) { const was = layer.set; layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) wallOwner[y * bw + x] = ownerId; }; }
            /* walls wherever nothing lies behind */
            let run = null;
            for (let X = P.x0; X <= P.x1; X++) { const open = X < P.x1 && !has.has(X + "," + (P.y0 - 1)) && !holes.has(X + "," + (P.y0 - 1)) && !P.noBack && (P.notch || !airBelow(X, P.y0 - 1) || doorEdge("x", X, P.y0) || shown("x", P.y0, X)); if (open && run === null) run = X; if (!open && run !== null) { tagged(() => H.wallRunX(w, run, X, P.y0, { ...cornerEnd(backWall(X, P.y0, P.z), sideWall(X, P.y0 - 1), zAt(X, P.y0 - 1), P.z), noStart: backWall(run - 1, P.y0, P.z), col: colOf("x", P.y0), ...halfOf("x", P.y0) })); run = null; } }
            run = null;
            for (let Y = P.y0; Y <= P.y1; Y++) { const open = Y < P.y1 && !has.has((P.x0 - 1) + "," + Y) && !holes.has((P.x0 - 1) + "," + Y) && (P.notch || !airBelow(P.x0 - 1, Y) || doorEdge("y", P.x0, Y) || shown("y", P.x0, Y)); if (open && run === null) run = Y; if (!open && run !== null) { tagged(() => H.wallRunY(w, P.x0, run, Y, { ...cornerEnd(sideWall(P.x0, Y, P.z), backWall(P.x0 - 1, Y), zAt(P.x0 - 1, Y), P.z), noStart: sideWall(P.x0, run - 1, P.z), col: colOf("y", P.x0), ...halfOf("y", P.x0) })); run = null; } }
            for (const q of (lv.portals || [])) { if (tileOf.get(q.axis === "x" ? q.at + "," + q.line : q.line + "," + q.at) === P) { drawPortal(w, q.axis, q.line, q.at, "alcove"); drawPortal(w, q.axis, q.line, q.at, "arch"); } }
            /* A wall running alongside small steps climbs with them, panelling, paper and cap together, so it flows from the lower floor's wall into the higher one's instead of jumping.
               Each column of it moves up by how far the steps have climbed there; the steps, drawn after, cover what's left at its foot. */
            for (const st of ((lv.src && lv.src.steps) || [])) {
                const alongY = st.axis === "y"; if (st.a !== (alongY ? P.x0 : P.y0)) continue;
                const backZ = alongY ? zAt(st.a, st.line - 1) : zAt(st.line - 1, st.a), nearZ = alongY ? zAt(st.a, st.line) : zAt(st.line, st.a), toYou = st.dir === "front"; if (backZ === null || nearZ === null) continue;
                const hi = toYou ? nearZ : backZ, lo = toYou ? backZ : nearZ; if (hi <= lo || P.z !== lo || (cut !== null && hi > cut)) continue;
                const reach = Math.round((hi - lo) / STEP_R) * STEP_D, from = toYou ? st.line - reach : st.line, rate = STEP_R / STEP_D, d0 = alongY ? P.y0 : P.x0, d1 = alongY ? P.y1 : P.x1;
                for (let k = 0; k <= Math.ceil(reach * 16); k++) {
                    const d = from + k / 16; if (d < d0 || d >= d1) continue;
                    const lift = Math.round(toYou ? (d - from) * rate : (hi - lo) - (d - from) * rate); if (lift <= 0) continue;
                    const sx = Math.round((alongY ? st.a - d : d - st.a) * 16) + gx, foot = Math.round((d + st.a) * 8) + gy - lo; if (sx < 0 || sx >= bw) continue;
                    for (let y = Math.max(lift, foot - Z1 - 20); y <= Math.min(bh - 1, foot + 2); y++) {
                        const i = y * bw + sx; if (wallOwner[i] !== ownerId) continue;
                        const j = (y - lift) * bw + sx;
                        layer.d[j * 4] = layer.d[i * 4]; layer.d[j * 4 + 1] = layer.d[i * 4 + 1]; layer.d[j * 4 + 2] = layer.d[i * 4 + 2];
                        wallOwner[j] = ownerId; if (wallTag) { wallTag[j] = wallTag[i]; wallC[j] = wallC[i]; }
                    }
                }
            }
            if (ownerId) { if (beforeWalls && !wallTag) layer.set = beforeWalls; else if (!wallTag) delete layer.set; else { const wrapped = layer.set; layer.set = beforeWalls || Buf.prototype.set; void wrapped; } }
            /* doors, sconces */
            const zn = w.z;
            const inReach = (x, y, m) => { const sx = (x - y) * 16 + gx, sy = (x + y) * 8 + gy - zn; return sx > -m && sx < bw + m && sy > -m && sy < bh + m; };
            if (P.blank) { for (let X = Math.ceil(P.x0 / 16) * 16 + 4; X < P.x1 - 4; X += 16) { if (inReach(X, P.y0, 340)) { H.door(w, X, P.y0, {}); lampNoted(() => H.lamp(w, X + 6, P.y0, { dead: X % 48 !== 4 })); } } }
            for (const it of (P.dn || [])) {
                const [axis, at2] = it.d;
                if (!(axis === "x" ? inReach(at2, P.y0, 340) : inReach(P.x0, at2, 340))) continue;
                const hover = !!it.name && cfg.hover === it.name, open = !!it.name && cfg.open === it.name;
                /* A door in a retaining wall: drawn after that wall, with what stands on the floor, so the higher floor behind doesn't paint over it. */
                const behindZ = axis === "x" ? zAt(at2, P.y0 - 1) : zAt(P.x0 - 1, at2 - 1);
                if (behindZ !== null && cut !== null && behindZ > cut) continue;
                if (behindZ !== null && behindZ > P.z) {
                    const a = axis === "x" ? at2 : at2 - 2, zHere = P.z, tileLine = axis === "x" ? P.y0 : P.x0;
                    (P.raised ? w.sprites : (lv.later = lv.later || [])).push({ depth: (axis === "x" ? at2 + P.y0 : P.x0 + at2) + .3, tx: axis === "x" ? a : tileLine, ty: axis === "x" ? tileLine : a, draw: () => {
                        const zs = w.z; w.z = zHere;
                        if (axis === "x") H.door(w, at2, tileLine, { hover, open });
                        else H.door(w, tileLine, at2, { mapY: true, hover, open });
                        w.z = zs;
                    } });
                    if (it.name) { if (axis === "x") signs.push({ s: w.WX(at2 + 1, P.y0, 0, 71), name: it.name, hover, sign: { v: 7, ...it.sign } }); else signs.push({ s: w.WY(P.x0, at2 - 1, 0, 71), name: it.name, alongY: true, hover, sign: { v: 7, ...it.sign } }); }
                    continue;
                }
                if (axis === "x") { H.door(w, at2, P.y0, { hover, open }); if (it.name) { const s = w.WX(at2 + 1, P.y0, 0, 71); signs.push({ s, name: it.name, hover, sign: { v: 7, ...it.sign } }); } }
                else { H.door(w, P.x0, at2, { mapY: true, hover, open }); if (it.name) { const s = w.WY(P.x0, at2 - 1, 0, 71); signs.push({ s, name: it.name, alongY: true, hover, sign: { v: 7, ...it.sign } }); } }
            }
            for (const it of (P.wi || [])) {
                const def = WALL_ITEM.get(it.k); if (!def) continue;
                if (!(it.axis === "x" ? inReach(it.at, P.y0, 340) : inReach(P.x0, it.at, 340))) continue;
                const behind = it.axis === "x" ? zAt(Math.floor(it.at), P.y0 - 1) : zAt(P.x0 - 1, Math.floor(it.at - 1)), onDrop = behind !== null && behind > P.z;
                if (onDrop && cut !== null && behind > cut) continue;
                const zHere = P.z, one = () => {
                    const zs = w.z; w.z = zHere;
                    const base = it.axis === "x" ? w.S(it.at, it.line) : w.S(it.line, it.at), cx = Math.round(base[0]), cy = Math.round(base[1] - (it.h === undefined ? 100 : it.h));
                    w.z = zs;
                    for (const l of (it.axis === "x" ? def.x : def.y).layers) {
                        const im = wallArt(l.f);
                        for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) {
                            const q = (j * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue;
                            const X = cx + l.x + (l.flip ? im.w - 1 - i : i), Y = cy + l.y + j, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]];
                            layer.set(X, Y, c);
                            if (X >= 0 && Y >= 0 && X < bw && Y < bh) w.keep[Y * bw + X] = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1;
                        }
                    }
                };
                if (onDrop) (P.raised ? w.sprites : (lv.later = lv.later || [])).push({ depth: (it.axis === "x" ? it.at + P.y0 : P.x0 + it.at) + .35, tx: it.axis === "x" ? Math.floor(it.at) : P.x0, ty: it.axis === "x" ? P.y0 : Math.floor(it.at), draw: one }); else one();
            }
            for (const [axis, at2, lc, style, lampHigh] of (P.l || [])) {
                if (!(axis === "x" ? inReach(at2, P.y0, 340) : inReach(P.x0, at2, 340))) continue;
                const behind = axis === "x" ? zAt(Math.floor(at2), P.y0 - 1) : zAt(P.x0 - 1, Math.floor(at2 - 1)), onDrop = behind !== null && behind > P.z;
                if (onDrop && cut !== null && behind > cut) continue;
                const zHere = P.z, tileX = axis === "x" ? at2 : P.x0, tileY = axis === "x" ? P.y0 : at2;
                const dead = !lc && !M.off && Mname === "failing" && !M.lamp(lampKey(tileX, tileY));
                const one = () => {
                    const usualH = w.lampH, zs = w.z; w.z = zHere; if (lampHigh !== undefined) w.lampH = lampHigh;
                    if (style === "globe") {
                        const h0 = w.lampH === undefined ? 66 : w.lampH, at = (u, h) => axis === "x" ? w.WX(at2, P.y0, u, h0 + h) : w.WY(P.x0, at2, u, h0 + h);
                        lampNoted(() => smallGlobe(w, at, axis === "x" ? -1 : 1, { colour: lc, dead }));
                        const q = at(0, 4); w.lamps.push({ x: q[0], y: q[1], tx: tileX, ty: tileY, i: w.lamps.length, colour: lc, axisY: axis !== "x", dead });
                    } else if (axis === "x") lampNoted(() => H.lamp(w, at2, P.y0, { colour: lc, dead }));
                    else { lampNoted(() => H.lamp(w, P.x0, at2, { mapY: true, colour: lc, dead })); w.lamps[w.lamps.length - 1].axisY = true; }
                    w.lamps[w.lamps.length - 1].lz = zHere;
                    w.lampH = usualH; w.z = zs;
                };
                if (onDrop) (P.raised ? w.sprites : (lv.later = lv.later || [])).push({ depth: tileX + tileY + .35, tx: Math.floor(tileX), ty: Math.floor(tileY), draw: one }); else one();
            }
            for (const l of w.lamps) if (l.lz === undefined) l.lz = w.z;
            /* floor */
            const zf = w.z;
            for (let Y = P.y0; Y < P.y1; Y++) for (let X = P.x0; X < P.x1; X++) {
                const fsx = (X - Y) * 16 + gx, fsy = (X + Y) * 8 + gy - zf;
                if (fsx < -34 || fsx > bw + 34 || fsy < -18 || fsy > bh + 2) continue;
                let smp;
                const plainS = (wayOf(cfg.single || lv.way) || {}).planks ? (dx, dy) => plankAt(X, Y, dx, dy) : (dx, dy) => modPx(plain, false, 2 + m4(X), 2 + m4(Y), dx, dy);
                const med = (P.medal && [{ x: P.medal[0], y: P.medal[1] }] || lv.medals || []).find(m => X >= m.x && X < m.x + 4 && Y >= m.y && Y < m.y + 4);
                if (med) { const ma = X - med.x, mb = Y - med.y; smp = (dx, dy) => modPx(crossPc, false, 2 + ma, 2 + mb, dx, dy); }
                else if (lv.rugs && lv.rugs.length) { const XX = X, YY = Y, F = lv.rugF || (lv.rugF = rugField(lv.rugs)); smp = (dx, dy) => rugFieldAt(F, XX, YY, dx, dy) || plainS(dx, dy); }
                else smp = plainS;
                tileDraw(X, Y, smp);
            }
            /* slab edges */
            const pal = ["000000", "af6947", "925030", "925030", "7d4122", "7d4122", "712f16", "000000", "5a1a06", "450e00", "450e00", "000000"].map(hex);
            const yEdge = [], xEdge = [];
            if (!P.notch) for (let X = P.x0; X < P.x1; X++) if (!has.has(X + "," + P.y1) && !holes.has(X + "," + P.y1)) yEdge.push(X);
            if (!P.notch) for (let Y = P.y0; Y < P.y1; Y++) if (!has.has(P.x1 + "," + Y) && !holes.has(P.x1 + "," + Y)) xEdge.push(Y);
            const near = (x, y) => { const q = w.S(x, y); return q[0] > -40 && q[0] < bw + 40 && q[1] > -40 && q[1] < bh + 40; };
            for (const X of yEdge) if (near(X, P.y1) || near(X + 1, P.y1)) for (let u = 0; u <= (has.has((X + 1) + "," + P.y1) ? 15 : 16); u++) pal.forEach((c, d) => { const Q = w.WX(X, P.y1, u, -1 - d); layer.set(Q[0], Q[1], c); });
            for (const Y of xEdge) if (near(P.x1, Y) || near(P.x1, Y + 1)) for (let u = 0; u <= (has.has(P.x1 + "," + (Y - 1)) ? 15 : 16); u++) pal.forEach((c, d) => { const Q = w.WY(P.x1, Y + 1, u, -1 - d); layer.set(Q[0], Q[1], c); });
            if (P.bridge) {
                /* the deep beam and pillars under the bridge */
                for (let u = 0; u <= (P.y1 - P.y0) * 16; u++) for (let d = 13; d < 26; d++) { const Q = w.WY(P.x1, P.y1, u, -d); layer.set(Q[0], Q[1], d === 25 ? C.k : (u >> 1) % 6 === 0 ? C.d1 : C.d2); }
            }
            /* half-level steps */
            for (const st of (P.steps || [])) flightX(w, st[1], st[2], st[3], st[4], st[5], { side: false, band: [1e6, 1e6 + 1] });
            /* the embedded stairs */
            if (P.notch && P.upLv) {
                const zs = w.z; w.z = P.z + Z1;
                for (let X = P.x0; X < P.x1; X++) if (P.upLv.tileSet.has(X + "," + (P.y0 - 1))) for (let u = 0; u <= 16; u++) pal.forEach((c, d) => { const Q = w.WX(X, P.y0, u, -1 - d); layer.set(Q[0], Q[1], c); });
                for (let Y = P.y0; Y < P.y1; Y++) if (P.upLv.tileSet.has((P.x0 - 1) + "," + Y)) for (let u = 0; u <= 16; u++) pal.forEach((c, d) => { const Q = w.WY(P.x0, Y + 1, u, -1 - d); layer.set(Q[0], Q[1], c); });
                w.z = zs;
            }
            for (const f of (P.sf || [])) {
                if (!f.landing) { flight(w, f); continue; }
                const L = f.landing, zs = w.z; w.z = L.z;
                for (let Y = L.y0; Y < L.y1; Y++) for (let X = L.x0; X < L.x1; X++) { const XX = X, YY = Y; tileDraw(XX, YY, (dx, dy) => (L.rug && rugFieldAt(L.rug, XX, YY, dx, dy)) || ((wayOf(cfg.single || lv.way) || {}).planks ? plankAt(XX, YY, dx, dy) : modPx(plain, false, 2 + m4(XX), 2 + m4(YY), dx, dy))); }
                /* its edge, on the side you can see */
                if (L.edgeX) { for (let X = L.x0; X < L.x1; X++) for (let u = 0; u <= 16; u++) pal.forEach((c, d) => { const Q = w.WX(X, L.y1, u, -1 - d); layer.set(Q[0], Q[1], c); }); }
                else for (let Y = L.y0; Y < L.y1; Y++) for (let u = 0; u <= 16; u++) pal.forEach((c, d) => { const Q = w.WY(L.x1, Y + 1, u, -1 - d); layer.set(Q[0], Q[1], c); });
                w.z = zs;
            }
            for (const fl of (P.fl || [])) flightY(w, fl[1], fl[2], fl[3], fl[4], fl[5]);
            if (P.lift !== undefined) lift(w, P.lift, P.y0, { open: cfg.liftOpen });
            for (const lx of (P.liftList || [])) { const zl = P.z, ly = P.y0; (P.raised ? w.sprites : (lv.later = lv.later || [])).push({ depth: lx + ly - .3, tx: lx, ty: ly, draw: () => { const zs = w.z; w.z = zl; lift(w, lx, ly, { open: cfg.liftOpen }); w.z = zs; } }); }
            /* main flights */
            for (const fl of (P.flights || [])) { flightY(w, fl[1], fl[2], fl[3], fl[4], fl[5]); if (fl[6]) signs.push({ s: w.WY(fl[2], fl[3] + 3.5, 0, 22), name: fl[6], alongY: true }); }
            if (P.side) {
                /* a side-on flight along the wall: climbs -x, then a landing into the floor above */
                const s = P.side, xs = s.x + s.w;
                /* the landing on a solid base */
                const zT = Z1;
                const zsave = w.z;
                for (let u = 0; u < s.w * 16; u++) for (let h = 0; h <= zT; h++) { const Q = w.WX(s.x, s.y + s.w, u, h); let c = (u >> 1) % 6 === 0 ? C.d2 : C.d3; if (h === 0 || h >= zT - 12) c = h === zT ? C.k : C.d5; layer.set(Q[0], Q[1], c); }
                w.z = zT;
                for (let Y = s.y; Y < s.y + s.w; Y++) for (let X = s.x; X < s.x + s.w; X++) tileDraw(X, Y, (dx, dy) => modPx(plain, false, 2 + m4(X), 2 + m4(Y), dx, dy));
                w.z = zsave;
                flightX(w, s.y, s.y + s.w, xs, 14, 0);
            }
            const landingQueue = P.queued ? [] : queueScenery(P);
            if (landingQueue.length) { const zs = w.z; landingQueue.sort((a, c) => a.depth - c.depth).forEach(drawSprite); w.z = zs; }
            if (P.tele && !cfg.noTele) teleport(w, "doorD", P.tele[0], P.tele[1], {});
            for (const t of (P.teles || [])) teleport(w, "doorD", t.x, t.y, { flip: !!t.flip });
            if (cfg.avatarS && cfg.avatar && cfg.avatar.lv === lv.id && cfg.avatar.p === lv.patches.indexOf(P)) { const a = cfg.avatar; w.sprites.push({ depth: a.x + a.y + .5, draw: () => { const im = avatarFile("s", a.dir, a.action || "std", a.frame || 0), Q = w.S(a.x, a.y); layer.blit(im, Q[0] - 16, Q[1] + 8 - (im.h - 6)); } }); }
            if (w.recess) { w.sprites.push(...w.recess); w.recess = []; }
            if (P.rails) w.sprites.push(...P.rails);
            w.sprites.sort((a, c) => a.depth - c.depth).forEach(drawSprite);
        };
        for (const P of raisedLater) { w.z = P.z; w.sprites = []; queueScenery(P); P.queued = true; }
        for (const P of drawList) if (!P.raised) drawPatch(P);
        delete layer.set;
        const later = lv.later ? lv.later.sort((a, c) => a.depth - c.depth || (a.ty || 0) - (c.ty || 0)) : [];
        w.z = lowest;
        /* The raised parts of the floor and everything standing on the floor, put in one order. A thing goes after the part it stands on and before any part or thing that's nearer;
           where that says nothing, the nearer tile goes last. Things are judged by the ground they cover, with a tile's grace, because the art of a long planter spills over its neighbour's tile. */
        {
            const footOf = q => q.foot || q.rect || (q.tx === undefined ? null : { x0: q.tx, x1: q.tx + 1, y0: q.ty, y1: q.ty + 1 });
            const nodes = [...raisedLater.map(P => ({ P, key: P.x0 + P.y0 - .5, foot: P, wait: 0, then: [], done: false })), ...later.map(q => ({ q, key: q.tx === undefined ? 1e9 : q.depth, foot: footOf(q), wait: 0, then: [], done: false }))];
            const before = (A, B) => { A.then.push(B); B.wait++; if (A.P && B.q) B.onFloors = (B.onFloors || 0) + 1; };
            /* small steps and short walls belong to the part they stand on: they go down straight after it */
            for (const n of nodes) if (n.q && n.q.withFloor) { const own = tileOf.get(Math.floor(n.q.tx) + "," + Math.floor(n.q.ty)); if (own && own.raised) n.key = own.x0 + own.y0 - .49; else n.q.withFloor = false; }
            const G = .99, sees = (A, B) => (A.x1 <= B.x0 && A.y0 < B.y1 + G && B.y0 < A.y1 + G) || (A.y1 <= B.y0 && A.x0 < B.x1 + G && B.x0 < A.x1 + G);
            const patchBehind = (A, B) => (A.x1 <= B.x0 && A.y0 < B.y1) || (A.y1 <= B.y0 && A.x0 < B.x1);
            for (let i = 0; i < nodes.length; i++) for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue; const A = nodes[i], B = nodes[j];
                if (A.P && B.P) { if (i < j) before(A, B); continue; }      // the parts keep the order already worked out for them
                if (A.P && B.q) { const R = B.q.rect || B.foot; if (R && R.x0 < A.P.x1 && R.x1 > A.P.x0 && R.y0 < A.P.y1 && R.y1 > A.P.y0) before(A, B); continue; }
                if (A.q && B.P) { const R = A.q.rect || A.foot; if (R && !(R.x0 < B.P.x1 && R.x1 > B.P.x0 && R.y0 < B.P.y1 && R.y1 > B.P.y0) && patchBehind(R, B.P) && !A.q.withFloor) before(A, B); continue; }
                if (A.foot && B.foot && sees(A.foot, B.foot) && !sees(B.foot, A.foot)) before(A, B);
            }
            for (let left = nodes.length; left > 0; left--) {
                let pick = null, stuck = null;
                for (const n of nodes) { if (n.done) continue; if (n.q && !n.onFloors && (!stuck || n.key < stuck.key)) stuck = n;      /* when things can only be ordered by breaking a rule, break it for a thing whose floor is down, never for the floors themselves */ if (n.wait <= 0 && (!pick || n.key < pick.key)) pick = n; }
                pick = pick || stuck || nodes.find(n => n.P && !n.done) || nodes.find(n => !n.done); pick.done = true; for (const n of pick.then) { n.wait--; if (pick.P && n.q) n.onFloors--; }
                w.z = lowest;
                if (pick.P) { drawPatch(pick.P); delete layer.set; } else drawSprite(pick.q);
            }
            later.length = 0;
        }
        w.z = lowest; later.forEach(drawSprite);
        /* A wall with a floor above it, whose edge lies right along the wall's top, goes straight up under that floor with no cap of its own, however low its own floor is:
           from the bottom of the upper floor's edge down to where the plain wallpaper starts, the wallpaper's own repeat, taken from further down the same column. */
        if (aboveLv && !lv.closed) {
            const upSet = new Set(); for (const q of aboveLv.patches) if (!q.notch) for (let X = q.x0; X < q.x1; X++) for (let Y = q.y0; Y < q.y1; Y++) upSet.add(X + "," + Y);
            const upBase = aboveLv.src.k * Z1, upRise = (X, Y) => (aboveLv.src.rise && aboveLv.src.rise[Math.floor(X / 2) + "," + Math.floor(Y / 2)]) || 0, REPEAT = 18, EDGE_ROWS = 13, CAP_ROWS = 24;
            const fill = (sx, y0, y1) => {
                if (sx < 0 || sx >= bw) return;
                for (let y = Math.max(0, y0); y <= y1 && y < bh; y++) {
                    let yy = y; while (yy <= y1) yy += REPEAT; if (yy >= bh) continue;
                    const i = y * bw + sx, j = yy * bw + sx; if (furniX[i] !== NO_FURNI || furniX[j] !== NO_FURNI || lampPx.has(i) || lampPx.has(j)) continue;
                    const a = j * 4, b2 = i * 4; if (layer.d[a] === VOID[0] && layer.d[a + 1] === VOID[1] && layer.d[a + 2] === VOID[2]) continue;
                    layer.d[b2] = layer.d[a]; layer.d[b2 + 1] = layer.d[a + 1]; layer.d[b2 + 2] = layer.d[a + 2];
                    if (wallTag) { wallTag[i] = wallTag[j]; wallC[i] = wallC[j]; }
                }
            };
            for (const [key, Q] of tileOf) {
                if (Q.notch) continue;
                const [X, Y] = key.split(",").map(Number), f = Q.z;
                if (backWall(X, Y) && !noneSet.has("x|" + Y + "|" + X) && !halfSet.has("x|" + Y + "|" + X) && upSet.has(X + "," + (Y - 1)) && !upSet.has(X + "," + Y)) {
                    const zUp = upBase + upRise(X, Y - 1);
                    for (let u = 0; u < 16; u++) { const sx = (X - Y) * 16 + u + gx, base8 = Math.round((X + u / 16 + Y) * 8) + gy; fill(sx, base8 - zUp + EDGE_ROWS, base8 - (f + Z1) + CAP_ROWS - 1); }
                }
                if (sideWall(X, Y) && !noneSet.has("y|" + X + "|" + Y) && !halfSet.has("y|" + X + "|" + Y) && upSet.has((X - 1) + "," + Y) && !upSet.has(X + "," + Y)) {
                    const zUp = upBase + upRise(X - 1, Y);
                    for (let u = 0; u < 16; u++) { const sx = (X - Y) * 16 - u + gx, base8 = Math.round((X + Y + u / 16) * 8) + gy; fill(sx, base8 - zUp + EDGE_ROWS, base8 - (f + Z1) + CAP_ROWS - 1); }
                }
            }
        }
        for (let i = 0; i < furniX.length; i++) if (furniX[i] !== NO_FURNI) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== furniC[i]) furniX[i] = NO_FURNI; }
        /* Where small steps run out to an open edge of the floor, the moulding slopes down the flight like a staircase's closed string,
           over the steps' ends, and what's under it is left empty so the wall below shows through. All along that edge the wall below
           loses its own cap, so the moulding reads the same from end to end. Done last, or the lower parts' edges paint back over it; railings and furniture stay on top. */
        {
            const voidPx = i => { const p = i * 4; layer.d[p] = VOID[0]; layer.d[p + 1] = VOID[1]; layer.d[p + 2] = VOID[2]; };
            const inB = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh, open = (X, Y) => !has.has(X + "," + Y) && !holes.has(X + "," + Y);
            const capDone = new Set(), base = lv.src ? lv.src.k * Z1 : 0;
            /* follow the line of sight up towards you from a point: higher on it is nearer, so a floor or a wall of this floor met on the way is in front of that point */
            const inFront = (x, y, z) => {
                /* tile by tile along the ray, so it costs next to nothing */
                let t = 0, px = Math.floor(x), py = Math.floor(y); const reachT = (Z1 + 64) / 16;
                while (t < reachT) {
                    const tx = px + 1 - x, ty = py + 1 - y, nt = Math.min(tx, ty) + 1e-6, X = Math.floor(x + nt), Y = Math.floor(y + nt), zz = z + nt * 16, Q = tileOf.get(X + "," + Y);
                    if (Q && !Q.notch) { if (zz <= Q.z) return true; const tallAt = (axis, line, t2) => { const k = axis + "|" + line + "|" + t2; return noneSet.has(k) ? 0 : halfSet.has(k) ? HALF_WALL : Z1; }; if ((Y > py && backWall(X, Y) && zz <= Q.z + tallAt("x", Y, X)) || (X > px && sideWall(X, Y) && zz <= Q.z + tallAt("y", X, Y))) return true; }
                    t = nt; px = X; py = Y;
                }
                return false;
            };
            for (const st of ((lv.src && lv.src.steps) || [])) {
                const alongY = st.axis === "y", back = alongY ? zAt(st.a, st.line - 1) : zAt(st.line - 1, st.a), nearer = alongY ? zAt(st.a, st.line) : zAt(st.line, st.a), toYou = st.dir === "front";
                if (back === null || nearer === null) continue;
                const hi = toYou ? nearer : back, lo = toYou ? back : nearer;
                if (hi <= lo || (cut !== null && hi > cut)) continue;
                const reach = Math.round((hi - lo) / STEP_R) * STEP_D, from = toYou ? st.line - reach : st.line, to = toYou ? st.line : st.line + reach, C2 = st.b;
                const pt = d => alongY ? [C2, d] : [d, C2], tileBeyond = d => alongY ? [C2, d] : [d, C2], tileOn = d => alongY ? [C2 - 1, d] : [d, C2 - 1];
                let clear = true; for (let d = Math.floor(from); d < Math.ceil(to); d++) { const q = tileBeyond(d); if (!open(q[0], q[1])) clear = false; }
                if (!clear) continue;
                const rate = STEP_R / STEP_D, LIP = 6;
                /* height along the edge, distance down the flight from its top */
                const zDown = t => t < reach ? Math.min(hi, hi + LIP - t * rate) : Math.max(lo, lo + LIP - (t - reach) * rate);
                const t1 = reach + LIP / rate;
                for (let k = -3; k <= Math.ceil(t1 * 16); k++) {
                    const t = k / 16, d = toYou ? to - t : from + t, [X, Y] = pt(d), sx = Math.round((X - Y) * 16) + gx, rowAt = z => Math.round((X + Y) * 8) + gy - z;
                    const top = rowAt(Math.round(zDown(t))) + 1, bottom = rowAt(lo) + FLOOR_EDGE.length;
                    if (lv.below) { const y0 = rowAt(base) + 13; (lv.below.noCap = lv.below.noCap || []).push([sx, y0, y0 + WALL_CAP - 3]); }
                    for (let y = top; y <= bottom; y++) {
                        if (!inB(sx, y)) continue; const i = y * bw + sx; if (furniX[i] !== NO_FURNI || inFront(X, Y, rowAt(0) - y) || (alongY ? inFront(X, Y + .06, rowAt(0) - y) || inFront(X, Y - .06, rowAt(0) - y) : inFront(X + .06, Y, rowAt(0) - y) || inFront(X - .06, Y, rowAt(0) - y))) continue;
                        if (y - top < FLOOR_EDGE.length) { const c = FLOOR_EDGE[y - top], p = i * 4; layer.d[p] = c[0]; layer.d[p + 1] = c[1]; layer.d[p + 2] = c[2]; } else voidPx(i);
                    }
                }
                /* the wall below loses its cap along this whole edge */
                if (!lv.below) continue;
                const edgeTile = t => { const a = tileOn(t), b = tileBeyond(t); return has.has(a[0] + "," + a[1]) && open(b[0], b[1]); };
                const list = (lv.below.noCap = lv.below.noCap || []);
                const walk = (t0, dir) => { for (let t = t0; edgeTile(t); t += dir) {
                    const key = (alongY ? "y" : "x") + C2 + "|" + t; if (capDone.has(key)) continue; capDone.add(key);
                    const a = tileOn(t); if (zAt(a[0], a[1]) !== base) continue;
                    for (let u = 0; u < 16; u++) { const [X, Y] = pt(t + u / 16), sx = Math.round((X - Y) * 16) + gx, y0 = Math.round((X + Y) * 8) + gy - base + 13; list.push([sx, y0, y0 + WALL_CAP - 3]); }
                } };
                walk(Math.floor(from), -1); walk(Math.floor(from) + 1, 1);
            }
        }
        /* anything painted over a floor pixel since is not floor any more */
        for (let i = 0; i < mask.length; i++) if (mask[i]) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== fc[i]) mask[i] = 0; }
        const stairPlaques = [];
        for (const ss of (lv.stairSigns || [])) { const zs = w.z; w.z = ss.z; const q = w.WX(ss.x, ss.y, 0, 0); stairPlaques.push({ s: q, z: ss.z, line: ss.y, name: ss.name, sign: ss.sign || {}, left: ss.x + ((ss.sign && ss.sign.u) || 0) / 16 > ss.mid }); w.z = zs; }
        if (wallTag) for (let i = 0; i < wallTag.length; i++) if (wallTag[i]) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== wallC[i]) wallTag[i] = 0; }
        /* colour, then light from each lamp, then the signs */
        const colour = cfg.single || lv.way;
        /* only what's still showing: furniture or a nearer wall may have gone over it since */
        for (const [i, c] of lampPx) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== c) lampPx.delete(i); }
        recolour(layer, colour, [0, 0, bw, bh], w.keep, wallTag ? { tag: wallTag, ways: wallWays } : null);
        /* a lamp's foot shadow, on the floor only: after the colouring, since a darkened pixel isn't one of the floor's colours any more */
        for (const [sx, sy] of w.footShadows) for (let j = -5; j <= 6; j++) for (let i = -11; i <= 11; i++) {
            const e = (i * i) / 110 + ((j - 1) * (j - 1)) / 27; if (e > 1) continue;
            const X = sx + i + 1, Y = sy + j; if (X < 0 || Y < 0 || X >= bw || Y >= bh || !mask[Y * bw + X]) continue;
            const k = e < .45 ? .62 : e < .75 ? .74 : .86, q = (Y * bw + X) * 4; layer.d[q] *= k; layer.d[q + 1] *= k; layer.d[q + 2] *= k;
        }
        const dim = lv.closed ? (lv.dim || .5) : 1;
        const lamps = w.lamps.filter(l => !l.tele).map(l => { const key = lampKey(l.tx, l.ty); let c = (lv.closed && key % 3) ? null : M.lamp(l.free || l.colour || Mname !== "failing" ? 0 : key);
            /* a light with its own colour: as strong as the mood's lights, in that colour */
            if (c && l.colour) { const q = hex(l.colour.replace(/^#/, "")), top = Math.max(q[0], q[1], q[2], 1), power = Math.max(...c); c = q.map(v => v / top * power); }
            return c && !l.dead ? { ...l, c } : null; }).filter(Boolean);
        const lightAt = (x, y, isFloor, zv) => {
            const L = [M.amb[0], M.amb[1], M.amb[2]];
            for (const l of lamps) {
                const dxs = x - l.x; if (dxs > 340 || dxs < -340) continue;
                let d;
                if (isFloor) {
                    const rx = x - gx, ry = y - gy + zv, fx = (rx + 2 * ry) / 32, fy = (2 * ry - rx) / 32;
                    const lfx = l.free ? l.tx : l.axisY ? l.tx + 1.6 : l.tx, lfy = l.free ? l.ty : l.axisY ? l.ty : (l.ty + 1.6);
                    d = Math.sqrt((fx - lfx) * (fx - lfx) + (fy - lfy) * (fy - lfy)) / M.tiles;
                    const dz = Math.abs(zv - (l.lz === undefined ? zv : l.lz)); if (dz) d = Math.hypot(d, dz / 16 / M.tiles);
                } else {
                    const dh = y - l.y - dxs / 2 * (l.axisY ? -1 : l.free ? 0 : 1);
                    d = Math.sqrt(dxs * dxs + dh * dh * 1.2) / M.px;
                }
                if (d < 1) { const f = (1 - d) * (1 - d) * M.p; L[0] += f * l.c[0]; L[1] += f * l.c[1]; L[2] += f * l.c[2]; }
            }
            return L;
        };
        const furniLight = new Map();
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
            const p = (y * bw + x) * 4;
            if (layer.d[p] === VOID[0] && layer.d[p + 1] === VOID[1] && layer.d[p + 2] === VOID[2]) continue;
            if (w.glowing[y * bw + x] && w.glowing[y * bw + x] === ((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) + 1) continue;   // a lit shade makes its own light
            /* The light itself is smooth. It used to be cut into 7 steps and dithered with a 4x4 pattern, which covered dark rooms in tiny diamonds.
               Furniture takes the light of the floor it stands on, so it isn't dark on a bright floor. */
            const i0 = y * bw + x, f = mask[i0] === 1;
            let L;
            if (furniX[i0] !== NO_FURNI) { const kt = furniX[i0] + "," + furniY[i0]; L = furniLight.get(kt); if (!L) { const zt = zAt(furniX[i0], furniY[i0]); L = lightAt((furniX[i0] + .5 - furniY[i0] - .5) * 16 + gx, (furniX[i0] + furniY[i0] + 1) * 8 + gy - (zt === null ? lowest : zt), true, zt === null ? lowest : zt); furniLight.set(kt, L); } }
            else L = lightAt(x, y, f, zb[i0]);
            const k0 = L[0] * dim, k1 = L[1] * dim, k2 = L[2] * dim;
            layer.d[p] = Math.min(255, layer.d[p] * k0); layer.d[p + 1] = Math.min(255, layer.d[p + 1] * k1); layer.d[p + 2] = Math.min(255, layer.d[p + 2] * k2);
        }
        /* each lit lamp burns bright, whatever the ambient */
        for (const l of lamps) if (!l.free) for (let j = -3; j <= 9; j++) for (let i = -6; i <= 6; i++) { const X = l.x + i, Y = l.y + j + Math.floor(i / 2) * (l.axisY ? -1 : 1) - 6; if (X < 0 || Y < 0 || X >= bw || Y >= bh) continue; }
        const lampLit = [...lampPx.keys()].map(i => [i, layer.d[i * 4], layer.d[i * 4 + 1], layer.d[i * 4 + 2]]);
        /* A sign hangs on its wall, so anything nearer goes over it: furniture on the room's side of that wall, and floor higher than its wall's foot on the line of sight. */
        const maxZ = uneven ? Math.max(...drawList.map(q => q.z)) : 0;
        const covered = (x, y, z, line, alongY) => {
            const i = y * bw + x; if (line === null) return false;
            if (furniX[i] !== NO_FURNI && (alongY ? furniX[i] : furniY[i]) >= line) return true;
            /* a wall of a part that lies wholly in front of this sign's wall */
            const wo = wallOwner[i]; if (wo) { const Q = lv.patches[wo - 1]; if ((alongY ? Q.x0 : Q.y0) > line) return true; }
            if (!uneven) return false;
            for (let h = z + 4; h <= maxZ; h += 4) { const rx = x - gx, ry = y - gy + h, X = Math.floor((rx + 2 * ry) / 32), Y = Math.floor((2 * ry - rx) / 32), c = zAt(X, Y); if (c !== null && c >= h && (cut === null || c <= cut) && (alongY ? X : Y) >= line) return true; }
            return false;
        };
        /* a sign takes the room's light like the wall it hangs on, but its name stays just readable in the dark */
        const SIGN_MIN_LIGHT = .32;
        const onWall = (z, line, alongY, paint) => { layer.set = function (x, y, c) { if (x >= 0 && y >= 0 && x < bw && y < bh && covered(x, y, z, line, alongY)) return; const L = lightAt(x, y, false, z), keep = SIGN_MIN_LIGHT; Buf.prototype.set.call(layer, x, y, [Math.min(255, c[0] * Math.max(keep, L[0] * dim)), Math.min(255, c[1] * Math.max(keep, L[1] * dim)), Math.min(255, c[2] * Math.max(keep, L[2] * dim))]); }; paint(); delete layer.set; };
        if (!cfg.noSigns) for (const s of signs) if (!lv.closed) {
            const g = s.sign || {}, u = g.u || 0, v = g.v || 0, sh = s.alongY ? -1 : 1;
            if (g.hide) continue;                                       // the editor's showing this one live, being dragged
            onWall(s.wallZ, s.wallLine, !!s.alongY, () => signIso(layer, s.s[0] + u, s.s[1] + sh * Math.floor(u / 2) - v, s.name, { alongY: s.alongY, hover: s.hover, max: 14, w: g.w, h: g.h, way: colour }));
        }
        for (const [i, r, g, b2] of lampLit) { layer.d[i * 4] = r; layer.d[i * 4 + 1] = g; layer.d[i * 4 + 2] = b2; }
        if (!cfg.noSigns && !lv.closed) for (const q of stairPlaques) { if (q.sign.hide) continue; const u = q.sign.u || 0, v = q.sign.blade ? q.sign.v || 0 : 0; onWall(q.z, q.line, false, () => stairPlaque(layer, q.s[0] + u, q.s[1] + Math.floor(u / 2) - v, q.name, { left: q.left })); }
        if (cfg.avatar && cfg.avatar.lv === lv.id) { const P = lv.patches.find(q => cfg.avatar.x >= q.x0 && cfg.avatar.x < q.x1 && cfg.avatar.y >= q.y0 && cfg.avatar.y < q.y1) || lv.patches[0]; const zz = P.z; const c = [Math.round((cfg.avatar.x - cfg.avatar.y) * 16) + gx, Math.round((cfg.avatar.x + cfg.avatar.y) * 8) + gy - zz + 8]; if (c[0] >= 0 && c[1] >= 0 && c[0] < bw && c[1] < bh) avL = lightAt(c[0], c[1], true, zz).map(v => Math.min(1.05, v)); w.avS = [c[0], c[1]]; }
        /* the cap of this floor's wall, wherever the floor above asked for it to go: the wallpaper's own repeat, from further down the same column */
        if (lv.noCap) {
            const REPEAT = 18, isVoid = i => { const p = i * 4; return layer.d[p] === VOID[0] && layer.d[p + 1] === VOID[1] && layer.d[p + 2] === VOID[2]; };
            for (const [sx, y0, y1] of lv.noCap) for (let y = y0; y <= y1; y++) {
                if (sx < 0 || sx >= bw || y < 0 || y >= bh) continue;
                const i = y * bw + sx; if (isVoid(i) || furniX[i] !== NO_FURNI) continue;
                let yy = y; while (yy <= y1) yy += REPEAT; if (yy >= bh) continue;
                const j = yy * bw + sx; if (isVoid(j)) continue;
                layer.d[i * 4] = layer.d[j * 4]; layer.d[i * 4 + 1] = layer.d[j * 4 + 1]; layer.d[i * 4 + 2] = layer.d[j * 4 + 2];
            }
            delete lv.noCap;
        }
        /* In this view a line of sight climbs as it comes toward you, so of two things on one line the
           higher is always the nearer. Everything on a floor stands lower than the underside of the
           floor above. So the floors are drawn from the top down, and a lower one only ever fills
           what is still empty: it can never paint over anything above it. */
        for (let p = 0, i = 0; p < layer.d.length; p += 4, i++) {
            if (done[i]) continue;
            if (layer.d[p] === VOID[0] && layer.d[p + 1] === VOID[1] && layer.d[p + 2] === VOID[2]) continue;
            out.d[p] = layer.d[p]; out.d[p + 1] = layer.d[p + 1]; out.d[p + 2] = layer.d[p + 2]; done[i] = 1;
        }
    }
    return { report: levels.report, b: out, view, at: (x, y, z) => { const c = at(x, y, z); return [c[0] - view[0], c[1] - view[1]]; }, cfg, avL, avS: w.avS, doors: ni };
}
var w_total = 0;

function shot(world, px, py, vw, vh, zoom, o) {
    o = o || {};
    const qw = Math.ceil(vw / zoom), qh = Math.ceil(vh / zoom), cx = px - (qw >> 1), cy = py - (qh >> 1);
    const raw = world.b.crop(cx, cy, qw, qh);
    let out; if (zoom === 1) out = raw; else if (o.full) out = raw.scale2x(); else { out = new Buf(qw * zoom, qh * zoom); out.paste(raw, 0, 0, zoom); }
    const a = world.cfg.avatar;
    if (a && zoom === 2 && !world.cfg.avatarS && world.avS) {
        const im = avatarFile("m", a.dir, a.action || "std", a.frame || 0), fx = (world.avS[0] - cx) * 2, fy = (world.avS[1] - cy) * 2;
        for (let j = -5; j <= 5; j++) for (let i = -18; i <= 18; i++) if (i * i / 324 + j * j / 25 < 1 && (i + j) % 2 === 0) { const X = fx + i, Y = fy + j; if (X >= 0 && Y >= 0 && X < out.w && Y < out.h) out.set(X, Y, out.get(X, Y).map(v => v * .55)); }
        const x0 = fx - (im.w >> 1), y0 = fy - im.h + 11, f = world.avL.map(v => Math.max(.45, v));
        for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const q = (j * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue; out.set(x0 + i, y0 + j, [Math.min(255, im.rgba[q] * f[0]), Math.min(255, im.rgba[q + 1] * f[1]), Math.min(255, im.rgba[q + 2] * f[2])]); }
    }
    return out;
}
module.exports = { smallGlobe, lift, recolour, drawPortal, build, shot, plan, fromMap, WAYS, LIGHTS, LAMP_STYLES, signIso, stairPlaque, plaqueWidth, PLAQUE, floorLamp, H, Buf };

/* The giant Christmas tree that stands in the statue's place under the Christmas skin (make-ideas-art.js writes it as i_bigtree.png and i_bigtree_lights.png).
   A fir grown, not painted. A trunk, then whorls of boughs that leave it level and droop to their tips, each bough with side twigs,
   and needles along every twig. Every needle is a short stroke in 3D, seen in the map's 2:1 view through a depth buffer.
   Shading: a needle on top of its bough catches the light, one underneath is in shadow, and anything recessed behind its neighbours
   goes dark (the gaps between tiers), so the boughs read as shelves.
   Second version, 8 Nov 2026 (his: "improve the lights and baubles, at the moment it's just such a mess of tiny coloured pixels, it's also
   still in a strict triangle shape"; the first is kept in ideas/saved/bigtree-2026-11-08):
   - the outline is a real fir's, not a cone: a narrow spire, sides that swell, tiers spaced wider further down, boughs of very different
     lengths with gaps between them, the lowest ones drooping and tucking under;
   - the lights are fewer and real: proper little bulbs with a hot core, wound round on strands, spaced out so none touch;
   - glass baubles hang under the bough tips, shaded as spheres with a highlight. */
"use strict";
const N = (a, b, c = 0) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); };
/* the outline, from the top (u = 0) to the lowest tier (u = 1), as a share of R: a narrow spire, sides that swell, a rounded foot */
const ENVELOPE = u => { if (u <= 0) return 0; const s = Math.pow(u, .96) * (1 + .08 * Math.sin(Math.PI * u)); return s * (u > .9 ? 1 - .45 * Math.pow((u - .9) / .1, 2) * .2 : 1); };
function grow(o) {
    /* S: the size of the tree's build against the giant one's, for a small tree: its trunk, its bare foot and the gaps between its tiers
       shrink with it, or the trunk shows all the way up (9 Nov 2026, his: small trees). 1 for the giant tree, which stays as it was */
    const { Ht, R, seed = 1 } = o, S = o.scale || 1, W2 = Math.ceil(R * 2.9 + 60), H2 = Ht + 150, ox = W2 >> 1, oy = Ht + 40;
    const SZ = W2 * H2, px = new Float32Array(SZ * 4), owner = new Int8Array(SZ), depth = new Float32Array(SZ).fill(-1e9), tone = new Float32Array(SZ), wood = new Int8Array(SZ);
    let rnd = seed * 9301 + 49297; const rand = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
    const scr = (x, y, z) => [ox + (x - y), oy + (x + y) / 2 - z], near = (x, y) => x + y;
    const plot = (x, y, z, k, isWood) => { if (z < .5) z = .5; const p = scr(x, y, z), X = Math.round(p[0]), Y = Math.round(p[1]); if (X < 0 || Y < 0 || X >= W2 || Y >= H2) return; const i = Y * W2 + X, d = near(x, y); if (d < depth[i]) return; depth[i] = d; owner[i] = 1; tone[i] = k; wood[i] = isWood ? 1 : 0; };
    const LX = -.6, LY = .2, LZ = .77, H0 = 20 * S, uOf = h => (Ht - h) / (Ht - H0), rOf = h => R * ENVELOPE(uOf(h));
    const trunkTop = Ht - 20;
    for (let z = 0; z < trunkTop; z += .5) { const w = Math.max(1, 5.5 * S * (1 - z / Ht)); for (let a = 0; a < 6.3; a += .25) plot(Math.cos(a) * w, Math.sin(a) * w, z, .3 + .55 * Math.max(0, Math.cos(a) * LX + Math.sin(a) * LY), true); }
    /* a needle tuft: needles fan out above and to the sides of the twig, a few below; the ones above take the light */
    const tuft = (x, y, z, dx, dy, dz, out, len, n) => {
        const sx = -dy, sy = dx; /* sideways across the twig, level */
        for (let k = 0; k < n; k++) {
            const a = (rand() * 1.15 - .08) * Math.PI, up = Math.sin(a), side = Math.cos(a), L = len * (.65 + rand() * .45);
            const vx = sx * side * .85 + dx * .55, vy = sy * side * .85 + dy * .55, vz = up * .75 + dz * .4;
            const face = Math.max(0, (sx * side * .5 + x / (Math.hypot(x, y) + 1) * .5) * LX + (sy * side * .5 + y / (Math.hypot(x, y) + 1) * .5) * LY + up * LZ);
            const k0 = Math.max(0, Math.min(1, .16 + .48 * face + .26 * out + .1 * up + (rand() - .5) * .08));
            for (let s = .5; s <= L; s += .5) plot(x + vx * s, y + vy * s, z + vz * s, k0 * (.88 + .12 * s / L), false);
        }
    };
    /* one bough: out from the trunk at angle a and height h, length L, leaving level and drooping to its tip; side twigs as wide as wid allows.
       Its tip is kept, for a bauble to hang from */
    const tips = [];
    const bough = (h, a, L, droop, wid, inner) => {
        const ca = Math.cos(a), sa = Math.sin(a), far = (ca + sa) < -.7, steps = Math.max(10, Math.round(L * 1.6)); let tip = null;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps, d = t * L, x = ca * d, y = sa * d, z = h + L * (.12 * t - droop * .5 * t * t) + (t > .82 ? (t - .82) * L * .3 : 0), dz = .12 - droop * t + (t > .82 ? .3 : 0);
            plot(x, y, z, .25, true); tip = [x, y, z];
            if (far && rand() < .6) continue;
            if (t > .12) tuft(x, y, z, ca, sa, dz, inner ? t * .6 : t, 2.4 + 1.8 * t, 3);
            /* twigs off each side, every 3px, sweeping forward and hanging; shorter towards the tip, so each bough ends in a point */
            if (t > .18 && i % 3 === 0) for (const side of [-1, 1]) {
                const ba = a + side * (.7 + rand() * .4), bl = Math.min(wid, (L - d) * .55 + 2.5) * (.65 + rand() * .45), bc = Math.cos(ba), bs = Math.sin(ba);
                for (let u = .5; u <= bl; u += .7) { const q = u / bl; tuft(x + bc * u, y + bs * u, z - .5 * q * q * bl * .5 + .3 * u * .2, bc, bs, -.3 * q, Math.min(1, (inner ? t * .6 : t) + q * .2), 2.1 + .5 * t, 2); }
            }
        }
        if (!inner) tips.push({ x: tip[0], y: tip[1], z: tip[2], L, h });
    };
    /* the whorls: close together near the top, further apart lower down, so the lower tiers read as shelves with dark gaps between.
       Each whorl's boughs differ a lot in length, and one in six is short, so the outline goes in and out */
    let w = 0;
    for (let h = H0; h < Ht - 4; w++) {
        const u = uOf(h), r = rOf(h); h += (6 + 11 * u) * S;
        if (r < 1.5) continue;
        const n = Math.max(r < 8 ? 3 : 5, Math.round(6.283 * r / (16 + 10 * u))), turn = w * 2.39996, droop = .62 + .3 * u, wid = 6 + 8 * u;
        /* no two tiers alike, and no tree grows evenly all round: some tiers reach further, and one side is fuller than the other */
        const tier = 1 + (N(w, 3, 1) - .5) * .12 * Math.min(1, u * 3);
        for (let b = 0; b < n; b++) {
            const a = turn + b * 6.283 / n + (rand() - .5) * .5, short = rand() < .1, lean = 1 + .07 * Math.sin(a + .9) + .05 * Math.sin(2 * a + w * .8), L = r * tier * lean * (short ? .7 + rand() * .12 : .86 + rand() * .26);
            bough(h - ((6 + 11 * u) * S), a, L, droop * (.85 + rand() * .3), wid, false);
        }
        /* inner boughs between the whorls, so a gap shows dark needles further in, never the room behind */
        if (u > .12) for (let b = 0; b < Math.ceil(n * .6); b++) { const a = turn + 1.2 + b * 6.283 / Math.ceil(n * .6) + (rand() - .5) * .6; bough(h - ((6 + 11 * u) * S) * .5, a, r * (.42 + rand() * .2), droop, wid * .7, true); }
    }
    /* the leader: the trunk's top, needled up to the star, so the tree comes to a fine point */
    for (let h = Ht - 30; h < Ht - 1; h += .7) { const k = (Ht - h) / 30; for (let b = 0; b < 3; b++) { const a = rand() * 6.283; tuft(0, 0, h, Math.cos(a), Math.sin(a), .5, .9, 1 + 4 * k, 2); } }
    /* recess: a pixel set back behind its neighbours (between tiers, deep inside) falls into shadow */
    const R2 = 4, shadeOut = new Float32Array(SZ);
    for (let Y = 0; Y < H2; Y++) for (let X = 0; X < W2; X++) {
        const i = Y * W2 + X; if (!owner[i]) continue; let mx = depth[i];
        for (let dy = -R2; dy <= R2; dy += 2) for (let dx = -R2; dx <= R2; dx += 2) { const XX = X + dx, YY = Y + dy; if (XX < 0 || YY < 0 || XX >= W2 || YY >= H2) continue; const j = YY * W2 + XX; if (owner[j] && depth[j] > mx) mx = depth[j]; }
        let over = 0; for (let k = 1; k <= 5; k++) { const j = (Y - k) * W2 + X; if (Y - k >= 0 && owner[j] && depth[j] > depth[i] + 2) { over = 1 - k / 6; break; } }
        shadeOut[i] = Math.max(0, tone[i] - Math.min(.5, (mx - depth[i]) * .05) - over * .24);
    }
    const GREENS = [[10, 28, 18], [14, 40, 24], [20, 54, 30], [28, 70, 38], [38, 88, 46], [52, 108, 56], [72, 130, 68], [98, 152, 86]];
    const BARK = [[42, 26, 16], [64, 40, 24], [86, 56, 34]];
    for (let i = 0; i < SZ; i++) { if (!owner[i]) continue; const k = shadeOut[i]; const c = wood[i] ? BARK[Math.min(2, Math.floor(k * 3.2))] : GREENS[Math.min(GREENS.length - 1, Math.floor(k * GREENS.length * 1.05))]; px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; }
    /* outline */
    const edge = []; for (let Y = 1; Y < H2 - 1; Y++) for (let X = 1; X < W2 - 1; X++) { const i = Y * W2 + X; if (owner[i]) continue; if (owner[i - 1] || owner[i + 1] || owner[i - W2] || owner[i + W2]) edge.push(i); }
    for (const i of edge) { owner[i] = 1; px[i * 4] = 6; px[i * 4 + 1] = 16; px[i * 4 + 2] = 10; }
    /* what shows of the tree at a 3D point: it is on the outside if nothing nearer covers its pixel */
    const outside = (x, y, z, slack) => { const p = scr(x, y, z), X = Math.round(p[0]), Y = Math.round(p[1]); if (X < 2 || Y < 2 || X >= W2 - 2 || Y >= H2 - 2) return null; const i = Y * W2 + X; return owner[i] && near(x, y) >= depth[i] - slack ? [X, Y] : null; };
    /* --- the lights: strands wound round the tree in a slow spiral, a bulb every 9px or so along them; only bulbs on the outside of the
       needles, and none closer than 7px to another on screen, so each reads as a bulb --- */
    const bulbs = [], taken = (X, Y, d) => bulbs.some(b => Math.abs(b.X - X) < d && Math.abs(b.Y - Y) < d && Math.hypot(b.X - X, b.Y - Y) < d);
    const STRANDS = 9;
    for (let s = 0; s < STRANDS; s++) {
        const a0 = s * 6.283 / STRANDS, turns = 6.5; let last = null;
        for (let t = .02; t < .985; t += .0008) {
            const h = H0 + t * (Ht - H0 - 6), r0 = rOf(h), a = a0 + t * turns * 6.283;
            /* out along the radius to the outermost needles there, then a touch back in, as a strand lies on the boughs */
            let hit = null; for (let rr = r0 * 1.15; rr > r0 * .55; rr -= .5) { const x = Math.cos(a) * rr, y = Math.sin(a) * rr, z = h - rr * .25 + 1.5; const q = outside(x, y, z, 2.5); if (q) { hit = { X: q[0], Y: q[1], x, y, z }; break; } }
            if (!hit) continue;
            if (last && Math.hypot(last.X - hit.X, last.Y - hit.Y) < 11) continue;
            last = hit; if (taken(hit.X, hit.Y, 9.5)) continue;
            bulbs.push({ ...hit, s });
        }
    }
    /* --- baubles: under the outer bough tips that face us, one tip in three or so, none too close together --- */
    const balls = [], free = (X, Y, d) => !balls.some(b => Math.hypot(b.X - X, b.Y - Y) < d) && !bulbs.some(b => Math.hypot(b.X - X, b.Y - Y) < 4.5);
    const order = tips.map((t, i) => ({ t, k: N(i, 5, 9) })).sort((p, q) => p.k - q.k).map(p => p.t);
    for (const t of order) {
        if (t.h > Ht - 40 || t.h < H0 + 4) continue;
        const z = t.z - 3, p = scr(t.x, t.y, z), X = Math.round(p[0]), Y = Math.round(p[1]); if (X < 6 || Y < 6 || X >= W2 - 6 || Y >= H2 - 6) continue;
        /* it must hang in front of what is round it */
        const i = Y * W2 + X; if (owner[i] && near(t.x, t.y) < depth[i] - 3) continue;
        const rad = t.h < Ht * .45 ? 3.4 : t.h < Ht * .7 ? 3 : 2.6;
        if (!free(X, Y, rad * 2 + 7)) continue;
        balls.push({ X, Y, r: rad, d: near(t.x, t.y) });
    }
    return { W2, H2, ox, oy, px, owner, bulbs, balls, star: [ox, oy - Ht - 2] };
}
/* classic glass baubles: red, gold, silver, deep blue, each as a ramp from its shadow to its highlight */
const BAUBLES = [
    { name: "red", ramp: [[70, 8, 14], [128, 16, 24], [184, 30, 36], [222, 70, 70], [250, 160, 150]] },
    { name: "gold", ramp: [[92, 58, 12], [150, 104, 26], [204, 156, 54], [236, 202, 110], [255, 240, 196]] },
    { name: "silver", ramp: [[70, 76, 88], [120, 128, 142], [176, 184, 196], [214, 220, 230], [250, 252, 255]] },
    { name: "blue", ramp: [[14, 24, 70], [26, 48, 128], [46, 86, 186], [104, 146, 226], [196, 220, 255]] }
];
/* old filament bulbs: warm reds, oranges, yellows, greens and blues, each with a hot, nearly white middle */
const BULBS = [[255, 52, 40], [255, 150, 30], [255, 214, 70], [70, 200, 90], [70, 140, 255], [255, 110, 170]];
function art(o = { Ht: 300, R: 80 }) {
    const t = grow({ ...o }), W = t.W2, H = t.H2, needles = new Uint8ClampedArray(W * H * 4), lights = new Uint8ClampedArray(W * H * 4);
    const set = (b, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const q = (y * W + x) * 4; b[q] = c[0]; b[q + 1] = c[1]; b[q + 2] = c[2]; b[q + 3] = 255; };
    const mix = (p, q, k) => p.map((v, i) => Math.round(v + (q[i] - v) * k));
    for (let i = 0; i < W * H; i++) if (t.owner[i]) set(needles, i % W, (i / W) | 0, [t.px[i * 4], t.px[i * 4 + 1], t.px[i * 4 + 2]].map(Math.round));
    /* the baubles, in the needles picture so the mood lights them like the tree; a hook up into the bough, a little gold cap, the glass shaded
       as a sphere lit from the upper left, a dark rim in its own colour, and a warm glint low on the right from the lights round it */
    t.balls.forEach((b, n) => {
        const B = BAUBLES[(n * 7 + 3) % BAUBLES.length].ramp, r = b.r, cx = b.X + .5, cy = b.Y + .5;
        for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
            const dx = (x + .5 - cx) / r, dy = (y + .5 - cy) / r, d2 = dx * dx + dy * dy; if (d2 > 1.12) continue;
            if (d2 > .8) { set(needles, x, y, mix(B[0], [4, 10, 6], .35)); continue; }
            const nz = Math.sqrt(Math.max(0, 1 - d2)), lit = -dx * .55 - dy * .6 + nz * .58;
            set(needles, x, y, B[lit > .78 ? 3 : lit > .38 ? 2 : lit > 0 ? 1 : 0]);
        }
        /* the highlight: a pixel (two on the big ones) up and left of the middle */
        const hx = Math.round(cx - r * .42 - .5), hy = Math.round(cy - r * .42 - .5); set(needles, hx, hy, B[4]); if (r > 3) set(needles, hx + 1, hy, B[3]);
        /* the lights' glint, low on the right */
        set(needles, Math.round(cx + r * .4 - .5), Math.round(cy + r * .45 - .5), mix(B[2], [255, 200, 120], .5));
        /* cap and hook */
        const capY = Math.round(cy - r - .5); for (let x = -1; x <= 0; x++) set(needles, Math.round(cx - .5) + x + (r > 3 ? 0 : 1), capY, x ? [150, 110, 40] : [230, 196, 110]); if (r > 3) set(needles, Math.round(cx - .5) + 1, capY, [110, 76, 24]);
        set(needles, Math.round(cx - .5), capY - 1, [170, 150, 110]);
        /* at night the highlight is the one bit still seen: in the lights picture, a soft warm white */
        set(lights, hx, hy, [236, 226, 206]);
    });
    /* the bulbs: a dark socket, then the glass, its middle running hot */
    const bulbs = [];
    t.bulbs.forEach((b, n) => {
        const C = BULBS[(b.s * 2 + n * 5) % BULBS.length], hot = mix(C, [255, 246, 220], .62), body = C, rim = mix(C, [40, 10, 0], .3), X = b.X, Y = b.Y;
        /* round, not a cross: the corners in a deeper tone of the glass, so it reads as a lit ball of colour */
        set(needles, X, Y - 2, [20, 36, 22]);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) set(lights, X + dx, Y + dy, mix(rim, [20, 30, 20], .25));
        set(lights, X, Y - 1, mix(body, hot, .4)); set(lights, X - 1, Y, mix(body, hot, .3)); set(lights, X + 1, Y, body); set(lights, X, Y + 1, body); set(lights, X, Y, hot);
        bulbs.push([X, Y, C[0], C[1], C[2]]);
    });
    /* the star: eight points, the long four upright and across, gold lit from within */
    const [sx, sy] = t.star, GOLD = [255, 214, 90], GL = [255, 246, 200], GD = [190, 130, 30];
    const ray = (dx, dy, len, w) => { for (let s = 0; s <= len; s += .5) { const ww = w * (1 - s / len); for (let q = -ww; q <= ww; q += .5) set(lights, sx + dx * s - dy * q, sy + dy * s + dx * q, q < -ww * .2 ? GL : q > ww * .4 ? GD : GOLD); } };
    for (const [dx, dy, len, w] of [[0, -1, 13, 3], [0, 1, 9, 2.6], [1, 0, 11, 2.6], [-1, 0, 11, 2.6], [.7, -.7, 7, 1.8], [-.7, -.7, 7, 1.8], [.7, .7, 6, 1.6], [-.7, .7, 6, 1.6]]) ray(dx, dy, len, w);
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.hypot(x, y) < 2.5) set(lights, sx + x, sy + y, GL);
    /* trim both to what either holds */
    let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let i = 0; i < W * H; i++) if (needles[i * 4 + 3] || lights[i * 4 + 3]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, crop = b => { const r = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) r[(y * w + x) * 4 + k] = b[((y + y0) * W + x + x0) * 4 + k]; return { w, h, rgba: r }; };
    return { needles: crop(needles), lights: crop(lights), ox: t.ox - x0, oy: t.oy - y0, w, h, below: y1 - t.oy, bulbs: bulbs.map(b => [b[0] - x0, b[1] - y0, b[2], b[3], b[4]]) };
}
module.exports = { grow, art, ENVELOPE };

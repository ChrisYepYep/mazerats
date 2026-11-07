/* The giant Christmas tree that stands in the statue's place under the Christmas skin (make-ideas-art.js writes it as i_bigtree.png and i_bigtree_lights.png).
   A spruce grown, not painted. A trunk, then whorls of boughs that leave it level and droop to their tips, each bough with side twigs,
   and needles along every twig. Every needle is a short stroke in 3D, seen in the map's 2:1 view through a depth buffer.
   Shading: a needle on top of its bough catches the light, one underneath is in shadow, and anything recessed behind its neighbours
   goes dark (the gaps between tiers), so the boughs read as shelves. Lights hang on strands wound round the tree. */
"use strict";
const N = (a, b, c = 0) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); };
function grow(o) {
    const { Ht, R, night, seed = 1, warmOnly = false, strands = 26 } = o, W2 = Math.ceil(R * 2.6 + 60), H2 = Ht + 140, ox = W2 >> 1, oy = Ht + 40;
    const SZ = W2 * H2, px = new Float32Array(SZ * 4), owner = new Int8Array(SZ), depth = new Float32Array(SZ).fill(-1e9), tone = new Float32Array(SZ), wood = new Int8Array(SZ);
    let rnd = seed * 9301 + 49297; const rand = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
    const scr = (x, y, z) => [ox + (x - y), oy + (x + y) / 2 - z], near = (x, y) => x + y;
    const plot = (x, y, z, k, isWood) => { if (z < .5) z = .5; const p = scr(x, y, z), X = Math.round(p[0]), Y = Math.round(p[1]); if (X < 0 || Y < 0 || X >= W2 || Y >= H2) return; const i = Y * W2 + X, d = near(x, y); if (d < depth[i]) return; depth[i] = d; owner[i] = 1; tone[i] = k; wood[i] = isWood ? 1 : 0; };
    const LX = -.6, LY = .2, LZ = .77;
    const trunkTop = Ht - 20, rOf = h => { const t = (h - 18) / (Ht - 18); return t < 0 || t > 1 ? 0 : R * Math.pow(1 - t, .95); };
    for (let z = 0; z < trunkTop; z += .5) { const w = Math.max(1, 5 * (1 - z / Ht)); for (let a = 0; a < 6.3; a += .25) plot(Math.cos(a) * w, Math.sin(a) * w, z, .3 + .55 * Math.max(0, Math.cos(a) * LX + Math.sin(a) * LY), true); }
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
    let w = 0;
    for (let h = 18; h < Ht - 3; h += h > Ht - 56 ? 4 : 8, w++) {
        const r = rOf(h); if (r < 1.5) continue; const n = Math.max(r < 6 ? 3 : 5, Math.round(6.283 * r / 13)), turn = w * 2.39996;
        for (let b = 0; b < n; b++) {
            const a = turn + b * 6.283 / n + (rand() - .5) * .35, L = r * (.78 + rand() * .4), ca = Math.cos(a), sa = Math.sin(a), far = (ca + sa) < -.7, sag = .75 + .3 * (1 - h / Ht);
            const steps = Math.max(10, Math.round(L * 1.6));
            for (let i = 0; i <= steps; i++) {
                const t = i / steps, d = t * L, x = ca * d, y = sa * d, z = h + L * (.12 * t - sag * .5 * t * t) + (t > .8 ? (t - .8) * L * .35 : 0), dz = .12 - sag * t + (t > .8 ? .35 : 0);
                plot(x, y, z, .25, true);
                if (far && rand() < .6) continue;
                if (t > .12) tuft(x, y, z, ca, sa, dz, t, 2.4 + 1.8 * t, 3);
                /* twigs off each side, every 3px, sweeping forward and hanging */
                if (t > .2 && i % 3 === 0) for (const side of [-1, 1]) {
                    const ba = a + side * (.75 + rand() * .35), bl = Math.min(9, (L - d) * .5 + 3) * (.7 + rand() * .4), bc = Math.cos(ba), bs = Math.sin(ba);
                    for (let u = .5; u <= bl; u += .7) { const q = u / bl; tuft(x + bc * u, y + bs * u, z - .5 * q * q * bl * .5 + .3 * u * .2, bc, bs, -.3 * q, Math.min(1, t + q * .2), 2.1 + .5 * t, 2); }
                }
            }
        }
    }
    /* the leader: the trunk's top, needled up to the star, so the tree comes to a point */
    for (let h = Ht - 30; h < Ht - 1; h += .7) { const k = (Ht - h) / 30; for (let b = 0; b < 3; b++) { const a = rand() * 6.283; tuft(0, 0, h, Math.cos(a), Math.sin(a), .5, .9, 1 + 4 * k, 2); } }
    /* recess: a pixel set back behind its neighbours (between tiers, deep inside) falls into shadow */
    const R2 = 4, shadeOut = new Float32Array(SZ);
    for (let Y = 0; Y < H2; Y++) for (let X = 0; X < W2; X++) {
        const i = Y * W2 + X; if (!owner[i]) continue; let mx = depth[i];
        for (let dy = -R2; dy <= R2; dy += 2) for (let dx = -R2; dx <= R2; dx += 2) { const XX = X + dx, YY = Y + dy; if (XX < 0 || YY < 0 || XX >= W2 || YY >= H2) continue; const j = YY * W2 + XX; if (owner[j] && depth[j] > mx) mx = depth[j]; }
        /* the pixel just above: if a bough above hangs over, this is its underside shadow */
        let over = 0; for (let k = 1; k <= 5; k++) { const j = (Y - k) * W2 + X; if (Y - k >= 0 && owner[j] && depth[j] > depth[i] + 2) { over = 1 - k / 6; break; } }
        shadeOut[i] = Math.max(0, tone[i] - Math.min(.45, (mx - depth[i]) * .045) - over * .22);
    }
    const GREENS = [[10, 28, 18], [14, 40, 24], [20, 54, 30], [28, 70, 38], [38, 88, 46], [52, 108, 56], [72, 130, 68], [98, 152, 86]];
    const BARK = [[42, 26, 16], [64, 40, 24], [86, 56, 34]];
    const m = night ? .58 : 1;
    for (let i = 0; i < SZ; i++) { if (!owner[i]) continue; const k = shadeOut[i]; const c = wood[i] ? BARK[Math.min(2, Math.floor(k * 3.2))] : GREENS[Math.min(GREENS.length - 1, Math.floor(k * GREENS.length * 1.05))]; px[i * 4] = c[0] * m; px[i * 4 + 1] = c[1] * m; px[i * 4 + 2] = c[2] * (night ? .7 : 1); }
    /* outline */
    const edge = []; for (let Y = 1; Y < H2 - 1; Y++) for (let X = 1; X < W2 - 1; X++) { const i = Y * W2 + X; if (owner[i]) continue; if (owner[i - 1] || owner[i + 1] || owner[i - W2] || owner[i + W2]) edge.push(i); }
    for (const i of edge) { owner[i] = 1; px[i * 4] = night ? 3 : 6; px[i * 4 + 1] = night ? 9 : 16; px[i * 4 + 2] = night ? 6 : 10; }
    /* strands of lights wound round the cone, a bulb every few pixels, hung just off the outer needles; only the ones in view */
    const PAL = warmOnly ? [[255, 214, 140], [255, 236, 190], [255, 190, 90], [255, 230, 170]] : [[255, 60, 70], [255, 200, 60], [70, 220, 100], [80, 170, 255], [255, 250, 230], [240, 90, 220], [255, 140, 50]];
    const dots = [], seen = new Set();
    for (let s = 0; s < strands; s++) {
        const a0 = s * 6.283 / strands * 3.1, turns = 7.5, dir = s % 2 ? 1 : -1;
        for (let t = .015; t < .97; t += .0016) {
            const h = 18 + t * (Ht - 22), r = rOf(h) * (.86 + .3 * N(t * 997, s, 7)), a = a0 + dir * t * turns * 6.283, x = Math.cos(a) * r, y = Math.sin(a) * r, z = h - r * .28 - (r > rOf(h) * .95 ? 3 : 0);
            const p = scr(x, y, z), X = Math.round(p[0]), Y = Math.round(p[1]); if (X < 1 || Y < 1 || X >= W2 - 1 || Y >= H2 - 1) continue; const i = Y * W2 + X;
            if (!owner[i] || near(x, y) < depth[i] - 4) continue; const key = (X >> 1) + "," + (Y >> 1); if (seen.has(key)) continue;
            /* spacing along the strand on screen */
            if (dots.length && dots[dots.length - 1][3] === s && Math.hypot(dots[dots.length - 1][0] - X, dots[dots.length - 1][1] - Y) < 4.5) continue;
            seen.add(key); dots.push([X, Y, PAL[(s * 3 + dots.length) % PAL.length], s]);
        }
    }
    return { W2, H2, ox, oy, px, owner, dots: dots.map(d => d.slice(0, 3)), star: [ox, oy - Ht - 2] };
}
/* the two pictures the renderer uses: the tree in daylight colours (the mood darkens it like everything else), and its lights and star,
   which stay lit in every mood. Both trimmed to the same box; ox, oy is the foot of the trunk. */
function art(o = { Ht: 300, R: 80 }) {
    const t = grow({ ...o, night: false }), W = t.W2, H = t.H2, needles = new Uint8ClampedArray(W * H * 4), lights = new Uint8ClampedArray(W * H * 4);
    const set = (b, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const q = (y * W + x) * 4; b[q] = c[0]; b[q + 1] = c[1]; b[q + 2] = c[2]; b[q + 3] = 255; };
    for (let i = 0; i < W * H; i++) if (t.owner[i]) set(needles, i % W, (i / W) | 0, [t.px[i * 4], t.px[i * 4 + 1], t.px[i * 4 + 2]].map(Math.round));
    for (const [x, y, c] of t.dots) { set(lights, x, y, c); if (N(x, y, 3) < .17) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) set(lights, x + dx, y + dy, c); }
    /* the star: eight points, the long four upright and across, gold lit from within */
    const [sx, sy] = t.star, GOLD = [255, 214, 90], GL = [255, 246, 200], GD = [190, 130, 30];
    const ray = (dx, dy, len, w) => { for (let s = 0; s <= len; s += .5) { const ww = w * (1 - s / len); for (let q = -ww; q <= ww; q += .5) set(lights, sx + dx * s - dy * q, sy + dy * s + dx * q, q < -ww * .2 ? GL : q > ww * .4 ? GD : GOLD); } };
    for (const [dx, dy, len, w] of [[0, -1, 13, 3], [0, 1, 9, 2.6], [1, 0, 11, 2.6], [-1, 0, 11, 2.6], [.7, -.7, 7, 1.8], [-.7, -.7, 7, 1.8], [.7, .7, 6, 1.6], [-.7, .7, 6, 1.6]]) ray(dx, dy, len, w);
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.hypot(x, y) < 2.5) set(lights, sx + x, sy + y, GL);
    /* trim both to what either holds */
    let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let i = 0; i < W * H; i++) if (needles[i * 4 + 3] || lights[i * 4 + 3]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, crop = b => { const r = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) r[(y * w + x) * 4 + k] = b[((y + y0) * W + x + x0) * 4 + k]; return { w, h, rgba: r }; };
    return { needles: crop(needles), lights: crop(lights), ox: t.ox - x0, oy: t.oy - y0, w, h, below: y1 - t.oy };
}
module.exports = { grow, art };

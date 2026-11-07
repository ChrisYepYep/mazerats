/* A small ray-caster for making new furniture in the hallway's own projection: 16 units to a tile, screen x = x - y, screen y = (x + y) / 2 - z.
   Every pixel looks along (1,1,1), so there are no gaps or wobbly edges, and a 1px outline and flat shading bands make it read like the client's art.
   A material is { top, x, y, nx, ny, edge, line } of colours (x is the face looking +x, the darker visible side; y the one looking +y, the lighter), or a function (face, p) => colour. */
"use strict";
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const col = c => typeof c === "string" ? hex(c.replace("#", "")) : c;
let nextId = 1;
const box = (x0, x1, y0, y1, z0, z1, mat, o = {}) => ({ kind: "box", x0, x1, y0, y1, z0, z1, mat, id: nextId++, ...o });
const cyl = (cx, cy, r, z0, z1, mat, o = {}) => ({ kind: "cyl", cx, cy, r, z0, z1, mat, id: nextId++, ...o });
const ball = (cx, cy, cz, r, mat, o = {}) => ({ kind: "ball", cx, cy, cz, r, mat, id: nextId++, ...o });
/* flat tones for a material from three colours, plus an outline */
const M = (top, y, x, edge = "1c1103", extra = {}) => ({ top: col(top), y: col(y), x: col(x), edge: col(edge), ...extra });

/* the last point along the ray still inside the primitive, seen from the camera: returns [t, face, local p] */
function hit(pr, ox, oy, oz) {
    if (pr.kind === "box") {
        let px = ox, py = oy, dx = 1, dy = 1;
        if (pr.rot) { const a = -pr.rot, c = Math.cos(a), s = Math.sin(a), rx = ox - pr.px, ry = oy - pr.py; px = pr.px + rx * c - ry * s; py = pr.py + rx * s + ry * c; dx = c - s; dy = s + c; }
        let tN = -1e9, tF = 1e9, face = null;
        const ax = (o, d, a, b, plus, minus) => { if (Math.abs(d) < 1e-9) { if (o < a || o > b) tN = 1e9; return; } const t1 = (a - o) / d, t2 = (b - o) / d, lo = Math.min(t1, t2), hi = Math.max(t1, t2); if (lo > tN) tN = lo; if (hi < tF) { tF = hi; face = t2 > t1 ? plus : minus; } };
        ax(px, dx, pr.x0, pr.x1, "x", "nx"); ax(py, dy, pr.y0, pr.y1, "y", "ny"); ax(oz, 1, pr.z0, pr.z1, "top", "bottom");
        if (tN > tF) return null;
        return [tF, face, [px + dx * tF, py + dy * tF, oz + tF]];
    }
    if (pr.kind === "cyl") {
        const fx = ox - pr.cx, fy = oy - pr.cy, a = 2, b = 2 * (fx + fy), c = fx * fx + fy * fy - pr.r * pr.r, D = b * b - 4 * a * c; if (D < 0) return null;
        const q = Math.sqrt(D), lo = (-b - q) / (2 * a), hi = (-b + q) / (2 * a), zl = pr.z0 - oz, zh = pr.z1 - oz, tN = Math.max(lo, zl), tF = Math.min(hi, zh); if (tN > tF) return null;
        const p = [ox + tF, oy + tF, oz + tF]; return [tF, tF === zh ? "top" : "side", p, [(p[0] - pr.cx) / pr.r, (p[1] - pr.cy) / pr.r, 0]];
    }
    const fx = ox - pr.cx, fy = oy - pr.cy, fz = oz - pr.cz, a = 3, b = 2 * (fx + fy + fz), c = fx * fx + fy * fy + fz * fz - pr.r * pr.r, D = b * b - 4 * a * c; if (D < 0) return null;
    const t = (-b + Math.sqrt(D)) / (2 * a), p = [ox + t, oy + t, oz + t]; return [t, "side", p, [(p[0] - pr.cx) / pr.r, (p[1] - pr.cy) / pr.r, (p[2] - pr.cz) / pr.r]];
}
/* round things: flat bands by the light, which falls from the upper left */
function bands(mat, n) {
    const L = [-.35, .62, .7], l = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    const r = mat.ramp; const i = Math.max(0, Math.min(r.length - 1, Math.floor((l + .35) / 1.35 * r.length))); return col(r[i]);
}
/* the extents of a scene on screen */
function bounds(prims) {
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
    const add = (x, y, z) => { const sx = x - y, sy = (x + y) / 2 - z; a = Math.min(a, sx); b = Math.max(b, sx); c = Math.min(c, sy); d = Math.max(d, sy); };
    for (const p of prims) {
        if (p.kind === "box") { const R = p.rot ? Math.hypot(Math.max(Math.abs(p.x0 - p.px), Math.abs(p.x1 - p.px)), Math.max(Math.abs(p.y0 - p.py), Math.abs(p.y1 - p.py))) : 0; const xs = p.rot ? [p.px - R, p.px + R] : [p.x0, p.x1], ys = p.rot ? [p.py - R, p.py + R] : [p.y0, p.y1]; for (const x of xs) for (const y of ys) for (const z of [p.z0, p.z1]) add(x, y, z); }
        else if (p.kind === "cyl") for (const s of [-1, 1]) for (const u of [-1, 1]) for (const z of [p.z0, p.z1]) add(p.cx + s * p.r, p.cy + u * p.r, z);
        else for (const s of [-1, 1]) for (const u of [-1, 1]) for (const v of [-1, 1]) add(p.cx + s * p.r, p.cy + u * p.r, p.cz + v * p.r);
    }
    return { x0: Math.floor(a) - 2, x1: Math.ceil(b) + 2, y0: Math.floor(c) - 2, y1: Math.ceil(d) + 2 };
}
/* opt.wall = { at, inside(y, z) }: a wall in the plane x=at. Anything behind it only shows through where inside() says so.
   opt.wallY = { at, inside(x, z) }: the same for a wall in the plane y=at. */
function render(prims, opt = {}) {
    const B = opt.bounds || bounds(prims), w = B.x1 - B.x0, h = B.y1 - B.y0, rgba = new Uint8ClampedArray(w * h * 4), ids = new Int32Array(w * h), depth = new Float32Array(w * h), edge = new Array(w * h), lines = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const sx = i + B.x0 + .5, sy = j + B.y0 + .5, ox = sy + sx / 2, oy = sy - sx / 2, oz = 0;
        let best = null, bp = null;
        for (const pr of prims) { const r = hit(pr, ox, oy, oz); if (r && (!best || r[0] > best[0])) { best = r; bp = pr; } }
        const W = opt.wall, Wy = opt.wallY;
        if (W) { const t = W.at - ox; if ((!best || best[0] < t + 1e-6) && !W.inside(oy + t, oz + t)) continue; }
        if (Wy) { const t = Wy.at - oy; if ((!best || best[0] < t + 1e-6) && !Wy.inside(ox + t, oz + t)) continue; }
        if (!best) continue;
        const m = bp.mat, p = best[2]; let c = typeof m === "function" ? m(best[1], p, best[3]) : (best[1] === "top" && m.top) ? m.top : (best[3] && m.ramp) ? bands(m, best[3]) : (m[best[1]] || m.x);
        if (typeof c === "function") c = c(best[1], p, best[3]);
        if (m.tex) { const t = m.tex(best[1], p); if (t) c = col(t); }
        if (!c) continue; c = col(c); if (opt.light) c = opt.light(c, p);
        depth[j * w + i] = best[0]; const q = (j * w + i) * 4; rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = 255; ids[j * w + i] = bp.id + (bp.creases ? ({ top: 0, x: 1000000, y: 2000000, nx: 3000000, ny: 4000000 }[best[1]] || 0) : 0); edge[j * w + i] = m.edge || null; lines[j * w + i] = m.noLine ? 0 : 1;
    }
    /* the outline: the last pixel of an object against anything further away or empty */
    const out = new Uint8ClampedArray(rgba);
    const lum = (i) => i;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const a = j * w + i; if (!ids[a]) continue;
        const open = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !ids[y * w + x];
        const q = a * 4, e = edge[a];
        if (e && (open(i - 1, j) || open(i + 1, j) || open(i, j - 1) || open(i, j + 1))) { out[q] = e[0]; out[q + 1] = e[1]; out[q + 2] = e[2]; continue; }
        if (e && opt.depthEdge) { let hit2 = false; for (const [x, y] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) { if (x < 0 || y < 0 || x >= w || y >= h) continue; if (depth[j * w + i] - depth[y * w + x] > 1.6) { hit2 = true; break; } } if (hit2) { out[q] = e[0]; out[q + 1] = e[1]; out[q + 2] = e[2]; continue; } }
        /* a darker line where one part meets another, on the far side only */
        if (opt.crease !== false && lines[a]) for (const [x, y] of [[i + 1, j], [i, j + 1]]) { if (x < w && y < h && ids[y * w + x] && ids[y * w + x] !== ids[a]) { const nb = (y * w + x) * 4; if (rgba[q] + rgba[q + 1] + rgba[q + 2] >= rgba[nb] + rgba[nb + 1] + rgba[nb + 2] - 8) { out[q] *= .62; out[q + 1] *= .62; out[q + 2] *= .62; break; } } }
    }
    return { w, h, ox: -B.x0, oy: -B.y0, rgba: out };
}
module.exports = { box, cyl, ball, M, render, bounds, col, hex };

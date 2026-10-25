// TEMPORARY mock-up helpers (21 Oct 2026): rubble options and back-wall tones. Delete after.
(function () {
    const TS = 16;
    const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const hashTile = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const SL = { out: "#04050a", body: "#0f1016", mo: ["#171923", "#1e212d"], top: ["#05060a", "#7e89a2", "#626c86", "#4c556c", "#353c50"], side: "#1f2330" };
    function setup(cells) {
        const set = new Set(cells.map(([x, y]) => x + "," + y)), has = (x, y) => set.has(x + "," + y);
        const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
        const tx0 = Math.min(...xs), ty0 = Math.min(...ys), tw = Math.max(...xs) - tx0 + 1, th = Math.max(...ys) - ty0 + 1;
        const W = tw * TS, H = th * TS;
        let sd = (tx0 * 92821 + ty0 * 68917) % 2147483646 + 1;
        const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
        const inCell = (px, py) => {
            if (px < 0 || py < 0 || px >= W || py >= H) return false;
            const cx = tx0 + Math.floor(px / TS), cy = ty0 + Math.floor(py / TS);
            if (!has(cx, cy)) return false;
            if (has(cx, cy - 1)) return true;
            const lx = px % TS, ly = py % TS, R = 8 + ((cx * 7 + cy * 3) % 3);
            for (const [side, ex] of [[-1, lx], [1, TS - 1 - lx]]) {
                if (has(cx + side, cy)) continue;
                const dx = R - ex, dy = R - ly;
                if (dx > 0 && dy > 0 && dx * dx + dy * dy > (R - 0.5) * (R - 0.5)) return false;
            }
            return true;
        };
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const x = c.getContext("2d");
        const px = (X, Y, col) => { x.fillStyle = col; x.fillRect(X, Y, 1, 1); };
        return { has, tx0, ty0, tw, th, W, H, rnd, inCell, c, x, px };
    }

    /* A: SLATE BLOCKS: broken slabs of the wall's own slate, stacked in rough courses, bigger low down; each
       outlined, the wall's lit top along its top edge, a shadowed underside, a crack or two down its face */
    function blocks(cells) {
        const S = setup(cells), { W, H, rnd, inCell, px } = S;
        const own = new Int16Array(W * H).fill(-1), list = [];
        // courses from the bottom up
        let y = H;
        while (y > 0) {
            const lowK = y / H, hgt = Math.round(4 + rnd() * 2 + lowK * 3);
            const y0 = Math.max(0, y - hgt);
            let xx = -Math.floor(rnd() * 5);
            while (xx < W) {
                const w = Math.round(5 + rnd() * 5 + lowK * 4), dy = Math.floor(rnd() * 3) - 1;
                list.push({ x0: xx, x1: xx + w - 1, y0: y0 + dy, y1: y - 1 + (rnd() < 0.3 ? 1 : 0), tone: Math.floor(rnd() * 3), crack: rnd() < 0.6 ? Math.floor(2 + rnd() * (w - 4)) : -1, cl: 0.4 + rnd() * 0.6 });
                xx += w;
            }
            y = y0;
        }
        // nearer (lower) last
        list.sort((a, b) => a.y1 - b.y1);
        const BODY = ["#151720", "#1a1d28", "#20232f"];
        for (const b of list) {
            for (let Y = b.y0; Y <= b.y1; Y++) for (let X = b.x0; X <= b.x1; X++) {
                if (!inCell(X, Y)) continue;
                const eT = Y - b.y0, eB = b.y1 - Y, eL = X - b.x0, eR = b.x1 - X;
                // round corners: a pixel off each, two off the top ones
                const cornerT = (eT === 0 && (eL < 2 || eR < 2)) || (eT === 1 && (eL === 0 || eR === 0));
                const cornerB = eB === 0 && (eL === 0 || eR === 0);
                if (cornerT || cornerB) continue;
                const e = Math.min(eT, eB, eL, eR) === 0 || (eT === 1 && (eL === 1 || eR === 1)) && false;
                let col;
                if (eT === 0 || eB === 0 || eL === 0 || eR === 0 || (eT === 1 && (eL === 0 || eR === 0))) col = SL.out;
                else if (eT === 1) col = eL < (b.x1 - b.x0) * 0.6 ? SL.top[1] : SL.top[2];
                else if (eT === 2) col = SL.top[3];
                else if (eB === 1 || eR === 1) col = "#0a0b10";
                else if (eL === 1) col = "#262a38";
                else if (X === b.x0 + b.crack && eT < 3 + (b.y1 - b.y0) * b.cl) col = SL.out;
                else if (X === b.x0 + b.crack + 1 && eT < 3 + (b.y1 - b.y0) * b.cl) col = "#2a2f3e";
                else col = BODY[b.tone];
                own[Y * W + X] = 1; px(X, Y, col);
            }
        }
        // gaps: deep shadow
        const cover = new Int16Array(W).fill(H); for (let X = 0; X < W; X++) for (let Y = 0; Y < H; Y++) if (own[Y * W + X] >= 0) { cover[X] = Y; break; }
        for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) if (own[Y * W + X] < 0 && inCell(X, Y) && Y > cover[X]) px(X, Y, "#06070b");
        return S;
    }

    /* B: SHARDS: angular broken slate, flat facets: the faces turned up and left catch the wall's top colours,
       the rest dark slate, outlined; packed close, big ones low */
    function shards(cells) {
        const S = setup(cells), { W, H, rnd, inCell, px, tx0, ty0, th } = S;
        const rocks = [];
        for (const [cx, cy] of cells) {
            const X0 = (cx - tx0) * TS, Y0 = (cy - ty0) * TS, low = (cy - ty0 + 1) / th;
            for (let n = 0; n < 5; n++) rocks.push(mk(X0 + rnd() * TS, Y0 + rnd() * TS, 3 + rnd() * (2.5 + 3.5 * low)));
            if (!S.has(cx, cy - 1)) for (let k = 0; k < 3; k++) rocks.push(mk(X0 + 2 + k * 5.5 + rnd() * 2, Y0 + 4 + rnd() * 2, 3 + rnd() * 1.6));
        }
        function mk(cx, cy, r) {
            const n = 5 + Math.floor(rnd() * 2), a0 = rnd() * 6.28, v = [];
            for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.28 + (rnd() - 0.5) * 0.7, rr = r * (0.75 + rnd() * 0.4); v.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * 0.85]); }
            return { cx, cy, r, v, tone: Math.floor(rnd() * 3) };
        }
        const inside = (v, X, Y) => { let ins = false; for (let i = 0, j = v.length - 1; i < v.length; j = i++) { const [xi, yi] = v[i], [xj, yj] = v[j]; if ((yi > Y) !== (yj > Y) && X < (xj - xi) * (Y - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
        const edgeInfo = (v, X, Y) => { let best = 1e9, nx = 0, ny = 0; for (let i = 0, j = v.length - 1; i < v.length; j = i++) { const [ax, ay] = v[j], [bx, by] = v[i], ex = bx - ax, ey = by - ay, L = Math.hypot(ex, ey) || 1; const t = Math.max(0, Math.min(1, ((X - ax) * ex + (Y - ay) * ey) / (L * L))); const d = Math.hypot(X - ax - ex * t, Y - ay - ey * t); if (d < best) { best = d; nx = ey / L; ny = -ex / L; } } return { d: best, nx, ny }; };
        rocks.sort((a, b) => (a.cy + a.r * 0.5) - (b.cy + b.r * 0.5));
        const own = new Int8Array(W * H);
        const BODY = ["#151720", "#1a1d28", "#20232f"];
        for (const rk of rocks) for (let Y = Math.floor(rk.cy - rk.r * 1.4); Y <= rk.cy + rk.r * 1.4; Y++) for (let X = Math.floor(rk.cx - rk.r * 1.6); X <= rk.cx + rk.r * 1.6; X++) {
            if (!inCell(X, Y) || !inside(rk.v, X + 0.5, Y + 0.5)) continue;
            const e = edgeInfo(rk.v, X + 0.5, Y + 0.5);
            // which way the nearest edge faces (outward normal; the polygon's winding decides the sign)
            let nx = e.nx, ny = e.ny; const mx = X + 0.5 - rk.cx, my = Y + 0.5 - rk.cy; if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
            const up = -(nx * 0.55 + ny * 0.85);
            let col;
            if (e.d < 1) col = SL.out;
            else if (e.d < 2.2 && up > 0.45) col = SL.top[1];
            else if (e.d < 3.2 && up > 0.45) col = SL.top[3];
            else if (e.d < 2 && up > 0.05) col = "#2a2f3e";
            else if (e.d < 2 && up < -0.4) col = "#0a0b10";
            else col = BODY[rk.tone];
            own[Y * W + X] = 1; px(X, Y, col);
        }
        const cover = new Int16Array(W).fill(H); for (let X = 0; X < W; X++) for (let Y = 0; Y < H; Y++) if (own[Y * W + X]) { cover[X] = Y; break; }
        for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) if (!own[Y * W + X] && inCell(X, Y) && Y > cover[X] + 1) px(X, Y, "#06070b");
        return S;
    }

    /* C: SLATE BOULDERS: the heap as it is (lumps, big low, small high), in the walls' colours and their flat
       Mario-like shading: an outline, a bright slate rim on the top left, a flat face, a dark band bottom right */
    function boulders2(cells, P) {
        const S = setup(cells), { W, H, rnd, inCell, px, tx0, ty0, th } = S;
        const rocks = [];
        const add = (cx, cy, r) => rocks.push({ cx, cy, r, sq: 0.64 + rnd() * 0.22, ph: [rnd() * 6.3, rnd() * 6.3], am: [0.07 + rnd() * 0.05, 0.03 + rnd() * 0.04], tone: Math.floor(rnd() * 3), crack: rnd(), cx2: rnd() });
        for (const [cx, cy] of cells) {
            const X0 = (cx - tx0) * TS, Y0 = (cy - ty0) * TS, low = (cy - ty0 + 1) / th;
            for (let n = 0; n < 6; n++) add(X0 + 1 + rnd() * (TS - 2), Y0 + 1 + rnd() * (TS - 2), 3.2 + rnd() * (1.8 + 2.4 * low));
            if (!S.has(cx, cy - 1)) for (let k = 0; k < 3; k++) add(X0 + 2.5 + k * 5.5 + rnd() * 1.5, Y0 + 4.5 + rnd() * 1.5, 3 + rnd() * 1.4);
        }
        const reach = (rk, X, Y) => { const dx = X + 0.5 - rk.cx, dy = (Y + 0.5 - rk.cy) / rk.sq, a = Math.atan2(dy, dx), r = rk.r * (1 + rk.am[0] * Math.sin(3 * a + rk.ph[0]) + rk.am[1] * Math.sin(5 * a + rk.ph[1])); return Math.hypot(dx, dy) / r; };
        rocks.sort((p, q) => (p.cy + p.r * 0.5) - (q.cy + q.r * 0.5));
        const own = new Int8Array(W * H);
        for (const rk of rocks) {
            const ccol = Math.round(rk.cx + (rk.cx2 - 0.5) * rk.r * 0.9);
            for (let Y = Math.floor(rk.cy - rk.r - 2); Y <= rk.cy + rk.r + 2; Y++) for (let X = Math.floor(rk.cx - rk.r * 1.3 - 2); X <= rk.cx + rk.r * 1.3 + 2; X++) {
                if (!inCell(X, Y)) continue;
                const d = reach(rk, X, Y); if (d > 1) continue;
                const dx = (X + 0.5 - rk.cx) / rk.r, dy = (Y + 0.5 - rk.cy) / (rk.r * rk.sq);
                const lit = -(dx * 0.5 + dy * 0.87), edgePx = (1 - d) * rk.r * rk.sq * 1.15;
                let col;
                if (edgePx < 1) col = SL.out;
                else if (edgePx < 2 && lit > 0.25) col = P.rim;
                else if (edgePx < 3 && lit > 0.4) col = P.rim2;
                else if (edgePx < 2.2 && lit < -0.35) col = P.shade;
                else if (rk.r > 4.2 && rk.crack < 0.75 && X === ccol && dy > -0.3 && dy < 0.75) col = P.crack;
                else if (rk.r > 4.2 && rk.crack < 0.75 && X === ccol + 1 && dy > -0.3 && dy < 0.75) col = P.crackLit;
                else col = P.body[rk.tone];
                own[Y * W + X] = 1; px(X, Y, col);
            }
        }
        const cover = new Int16Array(W).fill(H); for (let X = 0; X < W; X++) for (let Y = 0; Y < H; Y++) if (own[Y * W + X]) { cover[X] = Y; break; }
        for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) if (!own[Y * W + X] && inCell(X, Y) && Y > cover[X] + 1) px(X, Y, "#0a0b11");
        return S;
    }
    const PAL = {
        mid: { body: ["#252a38", "#2b3141", "#31384a"], rim: "#7e89a2", rim2: "#4c556c", shade: "#14161e", crack: "#0c0d13", crackLit: "#3a4256" },
        light: { body: ["#353c50", "#3d455b", "#454e66"], rim: "#9aa5bd", rim2: "#626c86", shade: "#1e212d", crack: "#151720", crackLit: "#535d76" }
    };
    function boulders(cells) {
        const S = setup(cells), { W, H, rnd, inCell, px, tx0, ty0, th } = S;
        const rocks = [];
        const add = (cx, cy, r) => rocks.push({ cx, cy, r, sq: 0.66 + rnd() * 0.25, ph: [rnd() * 6.3, rnd() * 6.3], am: [0.08 + rnd() * 0.06, 0.04 + rnd() * 0.05], tone: Math.floor(rnd() * 3) });
        for (const [cx, cy] of cells) {
            const X0 = (cx - tx0) * TS, Y0 = (cy - ty0) * TS, low = (cy - ty0 + 1) / th;
            for (let n = 0; n < 5; n++) add(X0 + rnd() * TS, Y0 + rnd() * TS, 2.8 + rnd() * (2.4 + 3 * low));
            if (!S.has(cx, cy - 1)) for (let k = 0; k < 3; k++) add(X0 + 2 + k * 5.5 + rnd() * 2, Y0 + 4 + rnd() * 2, 2.8 + rnd() * 1.6);
        }
        const reach = (rk, X, Y) => { const dx = X + 0.5 - rk.cx, dy = (Y + 0.5 - rk.cy) / rk.sq, a = Math.atan2(dy, dx), r = rk.r * (1 + rk.am[0] * Math.sin(3 * a + rk.ph[0]) + rk.am[1] * Math.sin(5 * a + rk.ph[1])); return Math.hypot(dx, dy) / r; };
        rocks.sort((p, q) => (p.cy + p.r * 0.5) - (q.cy + q.r * 0.5));
        const own = new Int8Array(W * H);
        const BODY = ["#151720", "#1a1d28", "#20232f"];
        for (const rk of rocks) for (let Y = Math.floor(rk.cy - rk.r - 2); Y <= rk.cy + rk.r + 2; Y++) for (let X = Math.floor(rk.cx - rk.r * 1.3 - 2); X <= rk.cx + rk.r * 1.3 + 2; X++) {
            if (!inCell(X, Y)) continue;
            const d = reach(rk, X, Y); if (d > 1) continue;
            const dx = (X + 0.5 - rk.cx) / rk.r, dy = (Y + 0.5 - rk.cy) / (rk.r * rk.sq);
            const lit = -(dx * 0.55 + dy * 0.85);
            const edgePx = (1 - d) * rk.r;   // pixels in from its edge
            let col;
            if (edgePx < 1) col = SL.out;
            else if (edgePx < 2 && lit > 0.35) col = SL.top[1];
            else if (edgePx < 3 && lit > 0.35) col = SL.top[3];
            else if (edgePx < 2 && lit < -0.45) col = "#0a0b10";
            else col = BODY[rk.tone];
            own[Y * W + X] = 1; px(X, Y, col);
        }
        const cover = new Int16Array(W).fill(H); for (let X = 0; X < W; X++) for (let Y = 0; Y < H; Y++) if (own[Y * W + X]) { cover[X] = Y; break; }
        for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) if (!own[Y * W + X] && inCell(X, Y) && Y > cover[X] + 1) px(X, Y, "#06070b");
        return S;
    }

    // the back wall, toned toward the walls' cool slate by k (0: as it is)
    function toneBack(k, dark) {
        const T = window.RatZones.themes.wood;
        if (!T.__origBack) T.__origBack = T.back;
        if (!k) { T.back = T.__origBack; return; }
        T.back = function (x, a) {
            T.__origBack.call(this, x, a);
            const W = a.w * 16, Hh = a.h * 16, img = x.getImageData(0, 0, W, Hh), d = img.data;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2], L = r * 0.3 + g * 0.55 + b * 0.15;
                d[i] = (r + (L * 0.9 - r) * k) * dark; d[i + 1] = (g + (L * 0.97 - g) * k) * dark; d[i + 2] = (b + (L * 1.2 - b) * k) * dark;
            }
            x.putImageData(img, 0, 0);
        };
    }
    /* BIG ROCKS (the owner's: "it might work better if we have big rocks that block the corridor"): the pile cut
       into blocks (up to maxW tiles wide, 2 tall), one big rock filling each, sitting flat on the floor, overlapping
       its neighbour a little; shaded flat in the walls' slate. style: "round" boulders, "slab" angular fallen
       slabs, "pebbles" boulders with small stones wedged at their feet and in the gaps. */
    function bigRocks(cells, style, maxW) {
        const S = setup(cells), { W, H, rnd, px, tx0, ty0, has } = S;
        maxW = maxW || 3;
        const used = new Set(), rects = [];
        const sorted = cells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        for (const [cx, cy] of sorted) {
            if (used.has(cx + "," + cy)) continue;
            let w = 1; while (w < maxW && has(cx + w, cy) && !used.has((cx + w) + "," + cy)) w++;
            let h = 1; while (h < 2) { let ok = true; for (let i = 0; i < w; i++) if (!has(cx + i, cy + h) || used.has((cx + i) + "," + (cy + h))) ok = false; if (!ok) break; h++; }
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used.add((cx + i) + "," + (cy + j));
            rects.push({ x: (cx - tx0) * TS, y: (cy - ty0) * TS, w: w * TS, h: h * TS, floor: !has(cx, cy + h) });
        }
        const P = { body: ["#2b3141", "#30374a", "#353c50"], rim: "#9aa5bd", rim2: "#626c86", rim3: "#4c556c", shade: "#1c1f2a", deep: "#14161e", out: "#04050a", crack: "#11131a", crackLit: "#46506a" };
        const own = new Int8Array(W * H);
        // the further (upper) first, the nearer over them
        rects.sort((a, b) => (a.y + a.h) - (b.y + b.h));
        rects.forEach((r, ri) => {
            const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + (r.floor ? 1 : 0), a = r.w / 2 + 1, b = r.h / 2 + 1.5;
            const ph = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3], am = [0.05 + rnd() * 0.04, 0.03 + rnd() * 0.03, 0.02];
            const tone = Math.floor(rnd() * 3), pw = style === "slab" ? 6 : 2.6;
            // the slab: a few straight facets (a polygon), leaning
            const nv = 6 + Math.floor(rnd() * 2), lean = (rnd() - 0.5) * 0.25;
            const verts = []; for (let i = 0; i < nv; i++) { const t = (i + rnd() * 0.5) / nv * Math.PI * 2; verts.push([Math.cos(t) * (0.92 + rnd() * 0.12), Math.sin(t) * (0.92 + rnd() * 0.12)]); }
            const slabR = (t) => { let best = 2; for (let i = 0; i < nv; i++) { const p = verts[i], q = verts[(i + 1) % nv]; const nx = q[1] - p[1], ny = p[0] - q[0], L = Math.hypot(nx, ny), d = (p[0] * nx + p[1] * ny) / L; const c = (Math.cos(t) * nx + Math.sin(t) * ny) / L; if (c > 0.001) best = Math.min(best, d / c); } return best; };
            const inside = (x, y) => {   // 0 inside .. 1 at the edge (>1 outside), its outward normal
                const dx = (x - cx) / a, dy = (y - cy) / b, t = Math.atan2(dy, dx);
                const R = style === "slab" ? slabR(t + lean) : 1 + am[0] * Math.sin(3 * t + ph[0]) + am[1] * Math.sin(5 * t + ph[1]) + am[2] * Math.sin(9 * t + ph[2]);
                const d = Math.pow(Math.pow(Math.abs(dx), pw) + Math.pow(Math.abs(dy), pw), 1 / pw) / R;
                return { d, t };
            };
            const cracks = []; for (let i = 0; i < (r.w > 16 ? 3 : 2); i++) cracks.push({ x: Math.round(cx + (rnd() - 0.5) * a * 1.1), y0: cy - b * (0.1 + rnd() * 0.3), y1: cy + b * (0.2 + rnd() * 0.5), jog: rnd() < 0.5 ? 1 : -1, at: cy + (rnd() - 0.5) * b * 0.4 });
            for (let y = Math.floor(r.y - 3); y < r.y + r.h; y++) for (let x = Math.floor(r.x - 3); x < r.x + r.w + 3; x++) {
                if (x < 0 || y < 0 || x >= W || y >= H) continue;
                if (!S.has(tx0 + Math.floor(x / TS), ty0 + Math.floor(y / TS))) continue;
                const q = inside(x + 0.5, y + 0.5); if (q.d > 1) continue;
                const e = (1 - q.d) * Math.min(a, b);   // pixels in from the edge, roughly
                const nx = Math.cos(q.t), ny = Math.sin(q.t), lit = -(nx * 0.55 + ny * 0.83);
                let c;
                if (e < 1) c = P.out;
                else if (e < 2.2 && lit > 0.2) c = P.rim;
                else if (e < 3.4 && lit > 0.35) c = P.rim2;
                else if (e < 4.6 && lit > 0.55) c = P.rim3;
                else if (e < 2.4 && lit < -0.3) c = P.deep;
                else if (e < 4.2 && lit < -0.45) c = P.shade;
                else c = P.body[tone];
                if (e >= 2) for (const k of cracks) { const kx = k.x + (y > k.at ? k.jog : 0); if (y >= k.y0 && y <= k.y1) { if (x === kx) c = P.crack; else if (x === kx + 1) c = P.crackLit; } }
                own[y * W + x] = 1; px(x, y, c);
            }
        });
        // pebbles: little stones wedged at the rocks' feet and in the gaps between them
        const spots = [];
        if (style === "pebbles") for (const r of rects) if (r.floor) { const fy = r.y + r.h; spots.push([r.x + 2 + rnd() * 3, fy], [r.x + r.w - 2 - rnd() * 3, fy], [r.x + r.w * (0.3 + rnd() * 0.4), fy]); }
        for (const [sx, fy] of spots) {
            const x0 = Math.round(sx), r = 1.6 + rnd() * 1.4;
            const cy = fy - r - 0.3;
            for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(x0 - r * 1.3 - 1); x <= x0 + r * 1.3 + 1; x++) {
                if (x < 0 || y < 0 || x >= W || y >= H || !S.has(tx0 + Math.floor(x / TS), ty0 + Math.floor(y / TS))) continue;
                const d = Math.hypot((x + 0.5 - x0) / 1.3, y + 0.5 - cy) / r; if (d > 1) continue;
                const lit = -((x + 0.5 - x0) * 0.55 + (y + 0.5 - cy) * 0.83) / r;
                px(x, y, d > 0.72 ? P.out : lit > 0.3 ? P.rim2 : lit < -0.35 ? P.shade : P.body[1]);
            }
        }
        // between rocks, where nothing reaches: shadow
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!own[y * W + x] && S.inCell(x, y)) { let above = false; for (let k = y - 1; k >= 0; k--) if (own[k * W + x]) { above = true; break; } if (above && x > 0 && x < W - 1) px(x, y, "#07080c"); }
        return S;
    }
    window.__mock = { blocks, shards, boulders, toneBack, mid: c => boulders2(c, PAL.mid), light: c => boulders2(c, PAL.light), round: c => bigRocks(c, "round"), slab: c => bigRocks(c, "slab"), pebbles: c => bigRocks(c, "pebbles"), round2: c => bigRocks(c, "round", 2) };
})();

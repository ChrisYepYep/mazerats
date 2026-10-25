/* THE CHRISTMAS SKIN (25 Oct 2026, the owner's: "create a snow/ice skin of
   the maze rats website, for christmas ... it'll need the ability to be
   applied and removed like the recolours").

   Loaded only while the skin is on: js/skin-wear.js decides that, and calls
   SiteSkins.xmas.start() / .stop(). Everything here is drawn in the browser,
   once per element, for that element's own width: the Fallin' Furni HUD's
   snow cap and icicles (tools/ff-snowcap.js, tools/ff-icicles.js)
   generalised from one fixed 200px panel to any box, any corner radius, the
   tops of letters and the outlines of sprites. Seeded from the element and
   its width, so a window gets the same snow on every visit and no two
   pieces share a drift.

   NOTHING HERE MOVES LAYOUT. Every piece is an absolutely positioned,
   pointer-events:none, aria-hidden child, the snowfall is one fixed canvas,
   and a host is only given position:relative when it was static (and given
   it back on stop()). stop() removes every node, timer and observer this
   file made, so taking the skin off leaves the page exactly as it was. */
(function () {
    "use strict";
    if (window.SiteSkins && window.SiteSkins.xmas) return;

    const reduceMq = matchMedia("(prefers-reduced-motion: reduce)");

    // ---------- seeded randomness ----------
    function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function prng(seed) {
        return function () {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

    // ---------- the ice palette: the frozen HUD's, exactly ----------
    const C = {
        O: [92, 146, 186],  K: [255, 255, 255], B: [232, 246, 255], S: [196, 228, 247], D: [160, 207, 237],
        I: [222, 243, 255], J: [158, 210, 242], T: [191, 230, 255], P: [240, 251, 255]
    };

    function Grid(w, h) {
        const px = new Array(w * h).fill(null);
        return {
            w, h,
            get: (x, y) => (x >= 0 && x < w && y >= 0 && y < h ? px[y * w + x] : null),
            set: (x, y, c) => { if (x >= 0 && x < w && y >= 0 && y < h) px[y * w + x] = c; },
            canvas() {
                const cv = document.createElement("canvas");
                cv.width = Math.max(1, w); cv.height = Math.max(1, h);
                const ctx = cv.getContext("2d");
                const img = ctx.createImageData(cv.width, cv.height);
                for (let i = 0; i < px.length; i++) {
                    const c = px[i]; if (!c) continue;
                    const v = Array.isArray(c) ? c : C[c];
                    img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; img.data[i * 4 + 3] = v.length > 3 ? v[3] : 255;
                }
                ctx.putImageData(img, 0, 0);
                return cv;
            }
        };
    }
    // A one-pixel outline round everything drawn, coloured by what it borders.
    function outline(g, pick) {
        const out = [];
        for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
            if (g.get(x, y)) continue;
            for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const c = g.get(x + a, y + b);
                if (c && !c.outline) { const o = pick(c, a, b); if (o) { out.push([x, y, o]); break; } }
            }
        }
        out.forEach(([x, y, o]) => g.set(x, y, o));
    }

    // The top edge of a rounded box, column by column (0 on the straight).
    function boxTop(w, r) {
        const p = [];
        for (let x = 0; x < w; x++) {
            const cx = x + 0.5; let d = 0;
            if (cx < r) d = r - cx; else if (cx > w - r) d = cx - (w - r);
            p.push(r - Math.sqrt(Math.max(0, r * r - d * d)));
        }
        return p;
    }

    /* ---------- SNOW CAP ----------
       profile[x] is where the surface is in column x (0 = the host's top,
       null = nothing to sit on). "box" tapers the drift over each end and
       keeps a one-pixel lining all the way round the corner, which is the
       curl; "text" lets snow lie only where an outline's top is near flat
       (a 2:1 isometric roof holds it, anything steeper sheds it).

       The variety knobs, so a list of rows never reads as one stamp:
         tilt     -1..1  blown towards one end
         bare     [{at, w}] scoured patches where the edge shows through
         slipL/R  a clump slid over that corner, hanging down the side
         clamp    [{x0, x1, max}] kept low where something sits on the edge */
    function snowCap(profile, o) {
        const rnd = prng(o.seed);
        const n = profile.length, PX = 3;
        const lowest = Math.min(0, ...profile.filter((v) => v != null));
        const TOPROOM = Math.ceil(o.depth * 1.9) + 6 - lowest;
        const slip = Math.max(o.slipL || 0, o.slipR || 0);
        const W = n + PX * 2, H = TOPROOM + 4 + (o.mode === "box" ? Math.ceil(o.radius || 0) : 0) + slip;
        const edge = (x) => { const v = profile[x - PX]; return v == null ? null : TOPROOM + v; };

        // Swells measured in pixels, not fractions, so a wide window is not a stretched narrow one.
        const waves = [
            { wl: 150 + rnd() * 140, a: 0.9 + rnd() * 0.7, ph: rnd() * 6.3 },
            { wl: 44 + rnd() * 36,   a: 0.6 + rnd() * 0.5, ph: rnd() * 6.3 },
            { wl: 13 + rnd() * 9,    a: 0.3 + rnd() * 0.3, ph: rnd() * 6.3 }
        ];
        // Drifts where the wind piled it, and thin spots it scoured.
        const mounds = [];
        for (let i = 0, m = Math.max(1, Math.round(n / 160)); i < m; i++)
            mounds.push({ at: n * (0.1 + rnd() * 0.8), w: 12 + rnd() * 34, h: o.depth * (0.3 + rnd() * 0.5) });
        for (let i = 0, m = Math.round(n / 260); i < m; i++)
            mounds.push({ at: n * (0.15 + rnd() * 0.7), w: 8 + rnd() * 16, h: -o.depth * (0.3 + rnd() * 0.3) });
        for (const m of o.drifts || []) mounds.push(m);

        const ok = new Array(n).fill(true);
        if (o.mode === "text") {
            for (let x = 0; x < n; x++) {
                const a = profile[x - 1], b = profile[x], c = profile[x + 1];
                if (b == null || a == null || c == null) { ok[x] = false; continue; }
                ok[x] = Math.abs(c - a) / 2 < 0.6;
            }
        }
        for (const b of o.bare || []) for (let x = Math.max(0, Math.round(b.at - b.w / 2)); x < Math.min(n, b.at + b.w / 2); x++) ok[x] = false;
        // Runs shorter than 6 columns (an apex, a point) cannot hold a drift.
        if (o.mode === "text" || (o.bare && o.bare.length)) for (let x = 0; x < n;) {
            if (!ok[x]) { x++; continue; }
            let e = x; while (e + 1 < n && ok[e + 1]) e++;
            if (e - x + 1 < 6) for (let k = x; k <= e; k++) ok[k] = false;
            x = e + 1;
        }
        const runEnds = new Array(n).fill(9999), runLen = new Array(n).fill(9999);
        for (let x = 0; x < n;) {
            if (!ok[x]) { x++; continue; }
            let e = x; while (e + 1 < n && ok[e + 1]) e++;
            for (let k = x; k <= e; k++) { runEnds[k] = Math.min(k - x, e - k); runLen[k] = e - x + 1; }
            x = e + 1;
        }

        const depth = new Array(W).fill(0);
        const T = o.mode === "box" ? Math.max(14, (o.radius || 0) * 2.2) : 3.5;
        for (let x = 0; x < n; x++) {
            if (!ok[x] || profile[x] == null) continue;
            let h = o.depth;
            for (const wv of waves) h += wv.a * (o.depth / 3.6) * Math.sin(x / wv.wl * Math.PI * 2 + wv.ph);
            for (const m of mounds) h += m.h * Math.exp(-Math.pow((x - m.at) / m.w, 2));
            if (o.tilt) h *= 1 + o.tilt * (x / n - 0.5) * 1.3;
            // Never a wall of it, and a narrow top holds only a dab.
            h = Math.min(h, o.depth * (o.maxMul || 1.6), o.mode === "text" ? runLen[x] / 3 : 99);
            for (const c of o.clamp || []) {
                const d = x < c.x0 ? c.x0 - x : x > c.x1 ? x - c.x1 : 0;
                h = Math.min(h, c.max + d * 0.5);
                if (c.min != null) h = Math.max(h, c.min - d * 0.5);
            }
            const ends = o.mode === "box" && !(o.bare && o.bare.length)
                ? Math.min(smooth((x + 1) / T), smooth((n - x) / T))
                : Math.min(o.mode === "box" ? Math.min(smooth((x + 1) / T), smooth((n - x) / T)) : 1, smooth((runEnds[x] + 1) / 4));
            h = 1 + (h - 1) * ends;
            depth[x + PX] = Math.max(1, Math.round(h));
        }
        for (let pass = 0; pass < 3; pass++) for (let x = 1; x < W; x++) {
            if (depth[x] - depth[x - 1] > 2 && depth[x - 1] > 0) depth[x] = depth[x - 1] + 2;
            if (depth[x - 1] - depth[x] > 2 && depth[x] > 0) depth[x - 1] = depth[x] + 2;
        }

        const g = Grid(W, H);
        const top = new Array(W).fill(null), bot = new Array(W).fill(null);
        const isSnow = new Set();
        const mark = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) isSnow.add(y * W + x); };
        for (let x = 0; x < W; x++) {
            if (!depth[x]) continue;
            const e = Math.round(edge(x));
            const t = e - depth[x]; top[x] = t;
            // A slipped clump: the outermost columns hang further down the side.
            const u = x - PX;
            let b = e + 1;
            if (o.slipL && u < 3) b += Math.round(o.slipL * (1 - u / 3));
            if (o.slipR && u > n - 4) b += Math.round(o.slipR * (1 - (n - 1 - u) / 3));
            bot[x] = b;
            for (let y = Math.max(0, t); y <= b; y++) mark(x, y);
        }
        // Text: a pixel of cornice over each run's ends, hanging past the letter.
        if (o.mode === "text") for (let x = 0; x < W; x++) {
            if (!depth[x]) continue;
            for (const dx of [-1, 1]) {
                const nx = x + dx;
                if (depth[nx]) continue;
                const e = Math.round(edge(x));
                for (let y = top[x] + 1; y <= e; y++) mark(nx, y);
                if (top[nx] == null) top[nx] = top[x] + 1;
            }
        }
        const S_ = (x, y) => isSnow.has(y * W + x);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const ex = edge(x), e = ex == null ? 999 : Math.round(ex);
            if (S_(x, y)) {
                const t = top[x];
                let c = "B";
                if (y === t) c = "K";
                else if (y === t + 1 && !S_(x - 1, y - 1)) c = "K";
                if (c === "B" && !S_(x + 1, y) && y > t) c = "S";
                if (c === "B" && ((x * 7 + y * 13 + o.seed) % 23 === 0)) c = "K";
                if (y === e - 1 && c === "B") c = "S";
                if (y >= e) c = "S";
                if (c === "S" && y >= e && !S_(x + 1, y)) c = "D";
                if (y > e + 1) c = S_(x + 1, y) ? "B" : "S";            // the slipped clump's face
                if (y === bot[x] && y > e + 1) c = "D";
                g.set(x, y, c);
            } else if (S_(x, y + 1) || S_(x - 1, y) || S_(x + 1, y) || S_(x, y - 1)) {
                const hang = (S_(x - 1, y) || S_(x + 1, y) || S_(x, y - 1)) && y > e + 1;
                if (y < e || hang) g.set(x, y, "O");
            }
        }
        if (o.sparkles !== false) for (let i = 0, m = Math.max(1, Math.round(n / 170)); i < m; i++) {
            const x = PX + 10 + Math.floor(rnd() * Math.max(1, n - 20));
            if (top[x] == null) continue;
            const y = top[x] - 3 - Math.floor(rnd() * 2);
            if (y < 1) continue;
            const arms = rnd() < 0.5 ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
            for (const [ax, ay] of arms) if (!g.get(x + ax, y + ay)) g.set(x + ax, y + ay, ax || ay ? "T" : "K");
        }
        return { canvas: g.canvas(), ox: PX, oy: TOPROOM };
    }

    /* ---------- ICICLES ----------
       tools/ff-icicles.js for any width: a rim of melt-water ice, then
       icicles walked along the edge in uneven clusters, long ones crowded by
       short, one to three pixels thick, lit from the left, a drop forming
       under a few, small ones on the corners. maxLen scales it; gap spaces
       it; side (-1/1) crowds it towards one end. */
    function icicles(w, r, o) {
        const rnd = prng(o.seed);
        const k = (o.maxLen || 16) / 16;
        const PX = 3, EDGE = 2, H = Math.ceil((o.maxLen || 16) + 6);
        const W = w + PX * 2;
        const g = Grid(W, H);
        const edgeAt = (x) => {
            const cx = x - PX + 0.5;
            if (cx < 0 || cx > w) return null;
            let d = 0;
            if (cx < r) d = r - cx; else if (cx > w - r) d = cx - (w - r);
            return Math.round(EDGE - (r - Math.sqrt(Math.max(0, r * r - d * d))));
        };
        const rimBottom = new Array(W).fill(null);
        let rimDepth = 1;
        for (let x = 0; x < W; x++) {
            const e = edgeAt(x); if (e === null) continue;
            if (rnd() < 0.22) rimDepth = rimDepth === 1 ? 2 : 1;
            const inCorner = x - PX < r - 1 || x - PX > w - r;
            const depth = inCorner || o.thinRim ? 1 : rimDepth;
            g.set(x, e - 1, "K");
            for (let j = 0; j < depth; j++) g.set(x, e + j, j === 0 ? "I" : "J");
            rimBottom[x] = e + depth;
        }
        const list = [];
        let x = PX + Math.max(3, Math.round(r * 0.4));
        const end = PX + w - Math.max(3, Math.round(r * 0.4));
        const gap = o.gap || 1;
        while (x < end) {
            const u = (x - PX) / w;
            const crowd = o.side ? (o.side > 0 ? 0.35 + u * 1.3 : 1.65 - u * 1.3) : 1;
            const corner = x - PX < r || x - PX > w - r - 1;
            const q = rnd();
            let len = q < 0.5 ? 2 + Math.floor(rnd() * 4) : q < 0.84 ? 6 + Math.floor(rnd() * 4) : 10 + Math.floor(rnd() * 7);
            len = Math.max(2, Math.round(len * k * Math.min(1.25, crowd)));
            if (corner) len = Math.min(len, 2 + Math.floor(rnd() * 3));
            const width = len >= 10 ? 3 : len >= 5 ? 2 : 1;
            list.push({ x, len, width, bead: len >= 7 && rnd() < 0.35 });
            const g2 = gap / Math.max(0.35, crowd);
            if (len >= 8 && rnd() < 0.7) {
                const nx = x + width + 1;
                if (nx < end) list.push({ x: nx, len: Math.max(2, Math.round((2 + Math.floor(rnd() * 4)) * Math.max(0.6, k))), width: 1, bead: false });
                x = nx + 2 + Math.floor(rnd() * 4 * g2);
            } else x += width + 1 + Math.floor(rnd() * (q < 0.5 ? 6 : 8) * g2);
            if (rnd() < 0.08) x += Math.floor(6 + rnd() * 14 * g2);
        }
        for (const ic of list) {
            const t = Math.max(...Array.from({ length: ic.width }, (_, i) => rimBottom[ic.x + i] || 0));
            if (!t) continue;
            for (let j = 0; j < ic.len; j++) {
                const ww = Math.max(1, Math.round(ic.width * Math.pow(1 - j / ic.len, 0.75)));
                const x0 = ic.x + Math.floor((ic.width - ww) / 2);
                for (let i = 0; i < ww; i++) {
                    let c = "I";
                    if (ww >= 2 && i === 0) c = "K";
                    if (ww >= 2 && i === ww - 1) c = "J";
                    if (ww === 1) c = j < ic.len - 1 ? "J" : "T";
                    g.set(x0 + i, t + j, c);
                }
            }
            if (ic.bead) g.set(ic.x + Math.floor((ic.width - 1) / 2), t + ic.len + 1, "P");
        }
        const isIce = (c) => c && c !== "O" && c !== "P";
        for (let y = EDGE; y < H; y++) for (let xx = 0; xx < W; xx++) {
            if (g.get(xx, y)) continue;
            const e = edgeAt(xx);
            if (e !== null && y < (rimBottom[xx] || e)) continue;
            const near = [[-1, 0], [1, 0], [0, -1]].some(([dx, dy]) => {
                const c = g.get(xx + dx, y + dy); if (!isIce(c)) return false;
                const rb = rimBottom[xx + dx]; return rb !== null && y + dy >= rb;
            });
            if (near) g.set(xx, y, "O");
        }
        return { canvas: g.canvas(), ox: PX, oy: EDGE };
    }

    /* ---------- SNOW PILED IN A PANE'S BOTTOM CORNER (a thumbnail) ---------- */
    function paneSnow(w, h, seed, corner) {
        const rnd = prng(seed);
        const g = Grid(w, h);
        const right = corner === "br";
        const wob = []; for (let i = 0; i <= w; i++) wob.push((rnd() - 0.5) * 1.6);
        for (let i = 1; i < w; i++) wob[i] = (wob[i - 1] + wob[i] * 2 + wob[i + 1]) / 4;
        const top = [];
        for (let i = 0; i < w; i++) {
            const u = right ? (w - 1 - i) / (w - 1) : i / (w - 1);
            top.push(Math.round((h - 1) * Math.pow(1 - u, 1.5) + wob[i] * (1 - u)));
        }
        for (let x = 0; x < w; x++) {
            if (top[x] < 1) continue;
            const t = h - top[x];
            for (let y = t; y < h; y++) g.set(x, y, y === t ? "K" : y > h - 3 ? "S" : ((x * 7 + y * 11 + seed) % 19 === 0 ? "K" : "B"));
        }
        outline(g, () => Object.assign(C.O.slice(), { outline: true }));
        return g.canvas();
    }

    /* ---------- SANTA HATS ----------
       Built the way a pixel artist would shade one, not pasted:
         the cone is a tube swept along a curve that rises off the brim and
         flops over to one side, each pixel lit by which way it faces (light
         from the top left), the flopped tip drawn in front of the cone with
         a crease where it folds over;
         the fur is TUFTS: two staggered rows of little round clumps along
         the brim, each one shaded as a ball of its own, so the band has a
         lumpy top and bottom edge rather than being a strip, and the
         pompom is a cluster of the same;
         a selective outline (dark wine against the red, cool grey against
         the fur) and a soft shadow line under the brim to sit it on the
         head. */
    function santaHat(o) {
        const rnd = prng(o.seed || 7);
        const brim = o.brim, hh = o.height, lean = o.lean, tilt = o.tilt || 0;
        const pad = 6;
        const W = brim + Math.abs(lean) + pad * 2 + 4, H = hh + 14;
        const g = Grid(W, H);
        const bx0 = pad + (lean < 0 ? -lean : 0), by = H - 7;       // the brim's left end, its centreline
        const brimY = (x) => by + tilt * ((x - bx0) / brim - 0.5);
        const L = [-0.62, -0.78];                                      // light from the top left

        const RED = { h: [255, 128, 136], r: [236, 72, 88], R: [204, 36, 58], d: [150, 18, 42], D: [96, 10, 30] };
        const FUR = { W: [255, 255, 255], w: [236, 242, 247], s: [204, 216, 228], S: [160, 176, 194] };

        // The cone: a quadratic curve from the brim's middle, up, and over.
        const cx = bx0 + brim / 2, cy = brimY(cx) - 1;
        const P0 = [cx, cy], P1 = [cx + lean * 0.2, cy - hh * 1.45], P2 = [cx + lean, cy - hh * 0.72];
        const B = (t) => [(1 - t) * (1 - t) * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) * (1 - t) * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]];
        const rad = (t) => (brim / 2 - 2.2) * Math.pow(1 - t, 1.25) + 0.8;
        const tOf = new Map();
        for (let i = 0; i <= 200; i++) {
            const t = i / 200, [px, py] = B(t), r = rad(t);
            for (let y = Math.floor(py - r - 1); y <= py + r + 1; y++) for (let x = Math.floor(px - r - 1); x <= px + r + 1; x++) {
                const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.hypot(dx, dy);
                if (d > r) continue;
                // Nothing of the cone below the fur's middle: the brim hides its foot.
                if (y + 0.5 > brimY(x + 0.5) - 0.5) continue;
                const key = y * W + x;
                const prev = tOf.get(key);
                // The later part of the curve is the flopped tip, which hangs in front.
                if (!prev || t > prev.t) tOf.set(key, { t, n: [dx / r, dy / r] });
            }
        }
        for (const [key, v] of tOf) {
            const x = key % W, y = (key - x) / W;
            const lit = v.n[0] * L[0] + v.n[1] * L[1];
            let c = lit > 0.62 ? "h" : lit > 0.22 ? "r" : lit > -0.3 ? "R" : lit > -0.72 ? "d" : "D";
            g.set(x, y, RED[c].concat([255]));
            v.c = c;
        }
        // The crease where the tip folds over the cone, and its shadow.
        for (const [key, v] of tOf) {
            const x = key % W, y = (key - x) / W;
            for (const [a, b] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
                const nb = tOf.get((y + b) * W + (x + a));
                if (nb && v.t - nb.t > 0.28 && b >= 0) { g.set(x + a, y + b, RED.D.concat([255])); }
            }
        }

        // Fur: tufts in two staggered rows, each a little shaded ball.
        const tufts = [];
        const step = 2.3;
        /* furLeft: the band runs that many pixels further left than the
           cone's foot (the owner's, of the peeking rat's: "extend to the left
           a couple of pixels more"). The end tufts are kept low and round,
           and get no extra tuft on top, so a band's corner is a soft curl
           rather than a lump sticking up. */
        const L0 = bx0 - 0.5 - (o.furLeft || 0), L1 = bx0 + brim + 0.5;
        for (let x = L0; x <= L1; x += step) {
            const end = x - L0 < 1.5 || L1 - x < step;
            tufts.push({ x: x + (end ? 0 : (rnd() - 0.5) * 0.7), y: brimY(x) - (end ? 1.0 : 1.7 + (rnd() - 0.5) * 1.6), r: end ? 1.7 : 1.6 + rnd() * 0.8, back: true });
            if (!end && rnd() < 0.35) tufts.push({ x: x + 1.2, y: brimY(x) - 3.2 + rnd() * 0.6, r: 1.1 + rnd() * 0.3, back: true });
        }
        for (let x = bx0 + 0.7 - (o.furLeft || 0), i = 0; x <= bx0 + brim - 0.2; x += step, i++) {
            tufts.push({ x: x + (rnd() - 0.5) * 0.7, y: brimY(x) + 0.9 + (rnd() - 0.5) * 1.4, r: 1.9 + rnd() * 0.9, back: false });
        }
        // The pompom: a fat middle and smaller clumps round it.
        const [tx, ty] = B(1);
        const pom = { x: tx + (lean >= 0 ? 0.8 : -0.8), y: ty + 2.2 };
        tufts.push({ x: pom.x, y: pom.y, r: 3.0, pom: true });
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2 + rnd() * 0.5;
            tufts.push({ x: pom.x + Math.cos(a) * 2.3, y: pom.y + Math.sin(a) * 2.3, r: 1.5 + rnd() * 0.4, pom: true, front: Math.sin(a) > 0.2 });
        }
        const order = tufts.filter((t) => t.back).concat(tufts.filter((t) => !t.back && !t.pom), tufts.filter((t) => t.pom && !t.front), tufts.filter((t) => t.pom && t.front));
        const furAt = new Set();
        for (const t of order) {
            for (let y = Math.floor(t.y - t.r - 1); y <= t.y + t.r + 1; y++) for (let x = Math.floor(t.x - t.r - 1); x <= t.x + t.r + 1; x++) {
                const dx = x + 0.5 - t.x, dy = y + 0.5 - t.y, d = Math.hypot(dx, dy);
                if (d > t.r) continue;
                const lit = (dx * L[0] + dy * L[1]) / t.r;
                // Lighter overall on the pompom and the front row, which catch the light.
                const lift = t.back ? -0.25 : t.pom ? 0.1 : 0;
                const v = lit + lift;
                const c = v > 0.28 ? "W" : v > -0.18 ? "w" : v > -0.6 ? "s" : "S";
                g.set(x, y, FUR[c].concat([255]));
                furAt.add(y * W + x);
            }
        }
        // Red just above the fur sits in its shadow.
        for (const key of furAt) {
            const x = key % W, y = (key - x) / W;
            const up = (y - 1) * W + x;
            if (tOf.has(up) && !furAt.has(up)) {
                const c = tOf.get(up).c;
                g.set(x, y - 1, RED[c === "h" ? "R" : c === "r" ? "d" : "D"].concat([255]));
            }
        }
        // Selective outline: wine against red, cool grey against the fur.
        const isFur = (x, y) => furAt.has(y * W + x);
        const fills = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.get(x, y)) fills.push(y * W + x);
        const filled = new Set(fills);
        const outl = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (filled.has(y * W + x)) continue;
            let fur = false, red = false;
            for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (!filled.has((y + b) * W + (x + a))) continue;
                if (isFur(x + a, y + b)) fur = true; else red = true;
            }
            if (red) outl.push([x, y, [58, 8, 20, 255]]);
            else if (fur) outl.push([x, y, [82, 92, 108, 255]]);
        }
        outl.forEach(([x, y, c]) => g.set(x, y, c));
        // A soft shadow line under the brim, on the head.
        for (let x = 0; x < W; x++) {
            let lowest = -1;
            for (let y = H - 1; y >= 0; y--) if (isFur(x, y)) { lowest = y; break; }
            if (lowest < 0) continue;
            const y = lowest + 2;
            if (!g.get(x, y)) g.set(x, y, [0, 0, 0, 70]);
        }
        const cv = g.canvas();
        cv.brimLeft = bx0; cv.brimY = by;
        return cv;
    }

    /* ---------- FESTOON LIGHTS: C9 bulbs on a sagging flex ----------
       Each bulb breathes on its own cycle (three to five and a half seconds),
       from full down to about a fifth and back, and a swell rolls along the
       string every nine seconds, so the whole thing is plainly alive without
       ever blinking. (Five to nine seconds between a half and full was the
       first go, and the owner's verdict was "basically not visible".) Two layers: the pixel bulbs and their dithered
       halo, and under them a soft ambient pool of each bulb's colour that
       spills onto the bottom of the top bar and the page below it. */
    const BULBS = [
        { lit: [255, 74, 90], dark: [150, 22, 40], hi: [255, 196, 200] },
        { lit: [255, 206, 70], dark: [168, 116, 20], hi: [255, 245, 200] },
        { lit: [82, 214, 106], dark: [24, 112, 48], hi: [208, 250, 214] },
        { lit: [90, 184, 255], dark: [26, 90, 170], hi: [214, 238, 255] },
        { lit: [255, 140, 56], dark: [160, 66, 14], hi: [255, 222, 190] }
    ];
    function festoon(w, seed) {
        const rnd = prng(seed);
        const H = 30;
        const anchors = [0];
        while (anchors[anchors.length - 1] < w) anchors.push(anchors[anchors.length - 1] + 110 + Math.floor(rnd() * 70));
        const wireY = new Array(w).fill(0);
        for (let a = 0; a < anchors.length - 1; a++) {
            const x0 = anchors[a], x1 = anchors[a + 1], sag = 6 + rnd() * 5;
            for (let x = x0; x < Math.min(x1, w); x++) { const t = (x - x0) / (x1 - x0); wireY[x] = 2 + sag * 4 * t * (1 - t); }
        }
        const bulbs = [];
        let ci = Math.floor(rnd() * 5);
        for (let a = 0; a < anchors.length - 1; a++) {
            const x0 = anchors[a], x1 = anchors[a + 1];
            const count = Math.max(3, Math.round((x1 - x0) / 26));
            for (let i = 1; i < count; i++) {
                const x = Math.round(x0 + (x1 - x0) * i / count + (rnd() - 0.5) * 3);
                if (x < 3 || x > w - 4) continue;
                bulbs.push({ x, y: Math.round(wireY[x]), c: BULBS[ci % 5], tilt: Math.round((rnd() - 0.5) * 1.2), phase: rnd(), period: 3 + rnd() * 2.5 });
                ci++;
            }
        }
        const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
        // The level of each bulb at time t (seconds): 0.55..1, never off.
        const level = (b, t) => {
            if (t == null) return 1;
            // Eased so each bulb lingers near full and dips briefly, rather than sitting at half.
            const own = Math.pow(0.5 + 0.5 * Math.sin((t / b.period + b.phase) * Math.PI * 2), 0.7);
            const swell = 0.5 + 0.5 * Math.sin((t / 9 - b.x / 300) * Math.PI * 2);
            return 0.18 + 0.82 * (0.6 * own + 0.4 * swell);
        };
        // One pixel buffer and one canvas for the life of the string, filled afresh each paint.
        const buf = document.createElement("canvas"); buf.width = w; buf.height = H;
        const bctx = buf.getContext("2d");
        const img = bctx.createImageData(w, H), u32 = new Uint32Array(img.data.buffer);
        const g = {
            get: (x, y) => (x >= 0 && x < w && y >= 0 && y < H ? u32[y * w + x] !== 0 : false),
            set: (x, y, c) => {
                if (x < 0 || x >= w || y < 0 || y >= H) return;
                u32[y * w + x] = ((c.length > 3 ? c[3] : 255) << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
            }
        };
        function draw(ctx, t) {
            const began = performance.now();
            u32.fill(0);
            const WIRE = [30, 58, 34], WIRE_HI = [62, 106, 66];
            const lv = bulbs.map((b) => level(b, t));
            bulbs.forEach((b, i) => {
                const cx = b.x + b.tilt, cy = b.y + 6, L = lv[i];
                for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
                    const d = Math.hypot(dx, dy * 1.1);
                    if (d > 6.2 || d < 1.5) continue;
                    if (d > 3.8 && ((cx + dx + cy + dy) & 1)) continue;
                    const a = Math.round((d > 3.8 ? 50 : 90) * L);
                    if (!g.get(cx + dx, cy + dy)) g.set(cx + dx, cy + dy, [...b.c.lit, a]);
                }
            });
            for (let x = 0; x < w; x++) {
                const y = Math.round(wireY[x]), yp = x ? Math.round(wireY[x - 1]) : y;
                for (let yy = Math.min(y, yp); yy <= Math.max(y, yp); yy++) g.set(x, yy, WIRE);
                if (x % 4 === 0) g.set(x, y - 1, WIRE_HI);
            }
            for (const a of anchors) if (a < w) { g.set(a, 0, [150, 160, 170]); g.set(a, 1, [110, 120, 130]); g.set(a + 1, 1, [150, 160, 170]); }
            bulbs.forEach((b, i) => {
                const L = lv[i], c = b.c, x = b.x, y = b.y, cx = x + b.tilt;
                const SOCK = [22, 66, 34], SOCK_HI = [62, 120, 70];
                g.set(x, y + 1, SOCK); g.set(cx - 1, y + 2, SOCK_HI); g.set(cx, y + 2, SOCK_HI); g.set(cx + 1, y + 2, SOCK);
                const body = mix(c.dark, c.lit, L), edge = mix(mix(c.dark, [0, 0, 0], 0.35), c.dark, L);
                const rows = [[3, -1, 1], [4, -2, 2], [5, -2, 2], [6, -2, 2], [7, -1, 1], [8, 0, 0]];
                for (const [dy, a, b2] of rows) for (let dx = a; dx <= b2; dx++) g.set(cx + dx, y + dy, body);
                for (const [dx, dy] of [[2, 4], [2, 5], [2, 6], [1, 7], [0, 8]]) g.set(cx + dx, y + dy, edge);
                const hi = mix(body, c.hi, L);
                for (const [dx, dy] of [[-1, 3], [0, 3], [-2, 4], [-2, 5]]) g.set(cx + dx, y + dy, hi);
                g.set(cx - 1, y + 4, mix(hi, [255, 255, 255], L));
            });
            bctx.putImageData(img, 0, 0);
            ctx.clearRect(0, 0, w, H);
            ctx.drawImage(buf, 0, 0);
            cost.lights = cost.lights * 0.9 + (performance.now() - began) * 0.1;
        }
        // The ambient pool: soft, so it reads as light rather than as pixels.
        const AH = 84, AT = 14;   // its height, and how far it reaches up into the bar
        function ambient(ctx, t) {
            ctx.clearRect(0, 0, w, AH);
            ctx.globalCompositeOperation = "lighter";
            bulbs.forEach((b) => {
                const L = level(b, t);
                const x = b.x + 0.5, y = AT + b.y + 6;
                const R = 40, gr = ctx.createRadialGradient(x, y, 0, x, y, R);
                const [r, g2, bl] = b.c.lit;
                gr.addColorStop(0, `rgba(${r},${g2},${bl},${0.36 * L})`);
                gr.addColorStop(0.35, `rgba(${r},${g2},${bl},${0.13 * L})`);
                gr.addColorStop(0.7, `rgba(${r},${g2},${bl},${0.04 * L})`);
                gr.addColorStop(1, `rgba(${r},${g2},${bl},0)`);
                ctx.fillStyle = gr;
                ctx.fillRect(x - R, y - R, R * 2, R * 2);
            });
            ctx.globalCompositeOperation = "source-over";
        }
        return { draw, ambient, H, AH, AT };
    }

    /* A SPRIG OF HOLLY, pinned to the corner of the M (the owner's: "better
       quality, and have it overlap the 'maze rats' title so it's pinned to
       the top left of the M"). Three leaves fanning out from one point, each
       the true holly shape: scalloped between sharp points, folded along a
       pale midrib, the half that faces the light lit and the other in shade.
       Three glossy berries sit on the point where the leaves meet, which is
       the pin: cv.pinX/pinY say where it is in the canvas. */
    function holly() {
        const W = 26, H = 22, PX = 13, PY = 12;      // the canvas, and the pin
        const g = Grid(W, H);
        const LIT = { h: [176, 236, 150], l: [86, 182, 90], m: [44, 140, 64] };
        const SHADE = { m: [30, 106, 50], d: [18, 74, 36] };
        const RIB = [196, 226, 132], RIB_S = [96, 150, 70];
        const leaves = [
            { tx: -13, ty: -4, w: 4.6, k: 3 },        // out to the left
            { tx: 10, ty: -6, w: 3.9, k: 2.5 },       // up and right, over the M
            { tx: -8, ty: 7, w: 3.3, k: 2 }           // a small one, down and left
        ];
        const owner = new Map();
        leaves.forEach((lf, li) => {
            const len = Math.hypot(lf.tx, lf.ty), ax = lf.tx / len, ay = lf.ty / len;
            const nx = -ay, ny = ax;                                   // across the leaf
            // Which half faces the light (from the top left).
            const litSide = (nx * -0.6 + ny * -0.8) > 0 ? 1 : -1;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const dx = x + 0.5 - PX, dy = y + 0.5 - PY;
                const u = (dx * ax + dy * ay) / len, v = dx * nx + dy * ny;
                if (u < 0.08 || u > 1) continue;
                let hw = lf.w * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.7);
                // Scallops between the points: full width at each point, dipping between.
                const s = (u * lf.k + (v > 0 ? 0.5 : 0)) % 1;
                hw *= 0.48 + 0.52 * Math.pow(Math.abs(1 - 2 * s), 1.3);
                if (Math.abs(v) > hw) continue;
                const side = v * litSide >= 0 ? "lit" : "shade";
                let c;
                if (Math.abs(v) < 0.55) c = side === "lit" ? RIB : RIB_S;
                else if (side === "lit") c = Math.abs(v) < hw * 0.55 ? LIT.l : Math.abs(v) > hw - 0.9 ? LIT.m : LIT.l;
                else c = Math.abs(v) > hw - 0.9 ? SHADE.d : SHADE.m;
                // A glint along the lit half, near the rib, two-thirds of the way out.
                if (side === "lit" && Math.abs(v) >= 0.55 && Math.abs(v) < 1.6 && u > 0.35 && u < 0.7) c = LIT.h;
                const key = y * W + x;
                if (!owner.has(key) || li < owner.get(key)) { owner.set(key, li); g.set(x, y, c); }
            }
        });
        // The berries, on the pin: a dark rim, a lit face and a glint each.
        const BER = { rim: [92, 8, 22], d: [160, 18, 40], m: [214, 40, 58], l: [255, 112, 124], w: [255, 236, 238] };
        for (const [bx, by] of [[PX - 1.6, PY - 0.6], [PX + 1.7, PY - 1.4], [PX + 0.3, PY + 1.9]]) {
            for (let y = Math.floor(by - 3); y <= by + 3; y++) for (let x = Math.floor(bx - 3); x <= bx + 3; x++) {
                const dx = x + 0.5 - bx, dy = y + 0.5 - by, d = Math.hypot(dx, dy);
                if (d > 2.05) continue;
                const lit = (dx * -0.6 + dy * -0.8) / 2;
                g.set(x, y, d > 1.55 ? BER.rim : lit > 0.45 ? BER.l : lit > -0.25 ? BER.m : BER.d);
            }
            g.set(Math.round(bx - 0.9), Math.round(by - 1.1), BER.w);
        }
        outline(g, (c) => Object.assign(c[0] > 150 && c[1] < 120 ? [60, 6, 16] : [10, 34, 16], { outline: true }));
        const cv = g.canvas();
        cv.pinX = PX; cv.pinY = PY;
        return cv;
    }

    // Where a line of text's first letter starts inking, in the element's own box.
    function firstInk(el) {
        const cs = getComputedStyle(el);
        const w = Math.ceil(el.getBoundingClientRect().width), h = Math.ceil(el.getBoundingClientRect().height);
        const cv = document.createElement("canvas"); cv.width = w + 8; cv.height = h + 30;
        const ctx = cv.getContext("2d");
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        try { ctx.letterSpacing = cs.letterSpacing; } catch (e) { /* a pixel out, no more */ }
        const m = ctx.measureText(el.textContent);
        const L = parseFloat(cs.lineHeight) || h, A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
        ctx.fillText(el.textContent, 0, (L - (A + D)) / 2 + A + 15);
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        for (let x = 0; x < cv.width; x++) for (let y = 0; y < cv.height; y++)
            if (d[(y * cv.width + x) * 4 + 3] > 140) {
                let top = y; for (let x2 = x; x2 < x + 3; x2++) for (let y2 = 0; y2 < cv.height; y2++) if (d[(y2 * cv.width + x2) * 4 + 3] > 140) { top = Math.min(top, y2); break; }
                return { x, y: top - 15 };
            }
        return { x: 0, y: 0 };
    }

    // =====================================================================
    // PLACING IT, AND TAKING IT AWAY AGAIN
    // =====================================================================
    let on = false;
    const added = new Set();            // every node this file put in the page
    const madeRelative = new Set();     // every host it gave position:relative
    const hosts = new Map();            // host -> { width, draw, pieces }
    const timers = [];
    let ro = null, mo = null, rafId = 0;

    // Raised with the CSS translate property, which moves nothing else and leaves any transform alone.
    const RAT_LEDGE = 5;
    const lifted = new Map();               // element -> { was, by }
    function lift(el, by) {
        if (!lifted.has(el)) lifted.set(el, { was: el.style.translate, by });
        lifted.get(el).by = by;
        el.style.translate = "0 " + (-by) + "px";
    }
    function ensurePositioned(el) {
        if (getComputedStyle(el).position === "static") { el.style.position = "relative"; madeRelative.add(el); }
    }
    function piece(host, canvas, cls, place) {
        const s = document.createElement("span");
        s.className = "xm-piece " + (cls || "");
        s.setAttribute("aria-hidden", "true");
        s.style.width = canvas.width + "px"; s.style.height = canvas.height + "px";
        s.style.backgroundImage = "url(" + canvas.toDataURL() + ")";
        // Lengths in pixels; z-index is a plain number ("1px" is not a z-index, and is dropped).
        for (const k in place) s.style[k] = typeof place[k] === "number" && k !== "zIndex" ? place[k] + "px" : String(place[k]);
        host.appendChild(s);
        added.add(s);
        return s;
    }
    const radiusOf = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    function borders(el) {
        const c = getComputedStyle(el);
        return { t: parseFloat(c.borderTopWidth) || 0, l: parseFloat(c.borderLeftWidth) || 0, b: parseFloat(c.borderBottomWidth) || 0 };
    }

    /* A host is drawn by a function of its width; when the width changes it
       is drawn again, from scratch, so the snow always fits. */
    function host(el, draw) {
        if (hosts.has(el)) return;
        const rec = { width: -1, draw, pieces: [] };
        hosts.set(el, rec);
        redraw(el);
        if (ro) ro.observe(el);
    }
    function redraw(el) {
        const rec = hosts.get(el);
        if (!rec) return;
        const w = Math.round(el.offsetWidth);
        if (w === rec.width) return;
        /* A host flipping between the same two widths is a feedback loop (a
           scrollbar coming and going), not a resize: after three quick
           flips it keeps the snow it has rather than redrawing forever. */
        const now = performance.now();
        if (w === rec.before && now - (rec.at || 0) < 1500) rec.flips = (rec.flips || 0) + 1; else rec.flips = 0;
        rec.before = rec.width; rec.at = now;
        if (rec.flips >= 3) return;
        rec.pieces.forEach((p) => { p.remove(); added.delete(p); });
        rec.pieces = [];
        rec.width = w;
        if (!w) return;
        const before = new Set(added);
        rec.draw(el, w);
        for (const p of added) if (!before.has(p)) rec.pieces.push(p);
    }

    /* A STAND-IN for a window that clips its own children (the console
       windows: .console-frame is overflow:hidden, for its rounded art), where
       snow put inside would be cut off at the edge. A box in the window's
       parent the same place, size and scale as the window — copied again
       whenever the window's style or class changes (Enlarge scales it) or its
       size does — with the snow inside it. The parent is what moves when the
       window is dragged, so the snow goes with it. */
    const standIns = new Map();       // window -> { box, mo }
    function standIn(el) {
        if (getComputedStyle(el).overflow === "visible" || !el.parentElement) return el;
        let s = standIns.get(el);
        if (!s) {
            const box = document.createElement("div");
            box.className = "xm-standin"; box.setAttribute("aria-hidden", "true");
            el.after(box); added.add(box);
            const sync = () => {
                // A window built and then moved into place takes its stand-in with it.
                if (el.parentNode && (box.parentNode !== el.parentNode || box.previousSibling !== el)) el.after(box);
                const c = getComputedStyle(el);
                box.style.cssText = `position:absolute;pointer-events:none;left:${el.offsetLeft}px;top:${el.offsetTop}px;` +
                    `width:${el.offsetWidth}px;height:${el.offsetHeight}px;transform:${c.transform};transform-origin:${c.transformOrigin};z-index:${c.zIndex === "auto" ? 1 : c.zIndex}`;
            };
            sync();
            const mo2 = new MutationObserver(sync);
            mo2.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
            const ro2 = new ResizeObserver(sync); ro2.observe(el);
            s = { box, sync, stop() { mo2.disconnect(); ro2.disconnect(); } };
            standIns.set(el, s);
        }
        return s.box;
    }
    function capBox(el, w, o) {
        ensurePositioned(el);
        const r = o.radius != null ? o.radius : radiusOf(el);
        const seed = hash((o.key || el.id || el.className) + ":" + w);
        const cap = snowCap(boxTop(w, r), Object.assign({ mode: "box", radius: r, seed }, o));
        const into = standIn(el), b = into === el ? borders(el) : { t: 0, l: 0, b: 0 };
        return piece(into, cap.canvas, "xm-cap", { left: -b.l - cap.ox, top: -b.t - cap.oy, zIndex: o.z != null ? o.z : 2 });
    }
    function icicleBox(el, w, o) {
        ensurePositioned(el);
        const r = o.radius != null ? o.radius : radiusOf(el);
        const ic = icicles(w, r, Object.assign({ seed: hash("ice:" + (o.key || el.id || el.className) + ":" + w) }, o));
        const into = standIn(el), b = into === el ? borders(el) : { t: 0, l: 0, b: 0 };
        // From the bottom, so a window that grows or shrinks keeps them on its edge.
        return piece(into, ic.canvas, "xm-ice", { left: -b.l - ic.ox, top: `calc(100% + ${b.b - ic.oy}px)`, zIndex: o.z != null ? o.z : 2 });
    }
    function capText(el, w, o) {
        ensurePositioned(el);
        const cs = getComputedStyle(el);
        const h = Math.ceil(el.getBoundingClientRect().height);
        const cv = document.createElement("canvas"); cv.width = w + 8; cv.height = h + 30;
        const ctx = cv.getContext("2d");
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        try { ctx.letterSpacing = cs.letterSpacing; } catch (e) { /* older engines: a pixel out, no more */ }
        const m = ctx.measureText(el.textContent);
        const L = parseFloat(cs.lineHeight), A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
        const base = (L - (A + D)) / 2 + A + 15;
        ctx.fillStyle = "#000";
        ctx.fillText(el.textContent, 0, base);
        const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
        const prof = [];
        for (let x = 0; x < w; x++) {
            let top = null;
            for (let y = 0; y < cv.height; y++) if (data[(y * cv.width + x) * 4 + 3] > 140) { top = y - 15; break; }
            prof.push(top);
        }
        const cap = snowCap(prof, { mode: "text", depth: o.depth, seed: hash("txt:" + el.textContent + w), sparkles: true });
        return piece(el, cap.canvas, "xm-cap", { left: -cap.ox, top: -cap.oy });
    }
    // Snow on a sprite: its own outline, read from its alpha. In the parent, since an <img> has no children.
    function capImage(img) {
        const parent = img.parentElement;
        if (!parent) return;
        const m = /url\("?(.*?)"?\)/.exec(getComputedStyle(img).content || "");
        const src = m ? m[1] : img.currentSrc || img.src;
        const im = new Image();
        im.onload = () => {
            if (!on) return;
            const w = img.offsetWidth, h = img.offsetHeight;
            if (!w || !h) return;
            ensurePositioned(parent);
            const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
            const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
            ctx.drawImage(im, 0, 0, w, h);
            const d = ctx.getImageData(0, 0, w, h).data, prof = [];
            for (let x = 0; x < w; x++) { let t = null; for (let y = 0; y < h; y++) if (d[(y * w + x) * 4 + 3] > 140) { t = y; break; } prof.push(t); }
            const cap = snowCap(prof, { mode: "text", depth: 2.4, seed: hash("img:" + src), sparkles: false });
            piece(parent, cap.canvas, "xm-cap", { left: img.offsetLeft - cap.ox, top: img.offsetTop - cap.oy, zIndex: 3 });
        };
        im.src = src;
    }

    // ---------- what goes where ----------
    function decorateWindows() {
        // The console windows too (the game's, Pura Panic's, the site console): every window wears the snow.
        document.querySelectorAll(".chrome-window, .modal, .console-frame").forEach((win) => {
            if (hosts.has(win) || !win.offsetWidth) return;
            const isModal = win.classList.contains("modal");
            host(win, (el, w) => {
                /* THE PEEKING RAT peeks over the SNOW, not the window's edge (the
                   owner's: "the snow should be behind the peeking rat"). Under
                   his body the drift lies flat at RAT_LEDGE deep, so its surface
                   is the ledge; he is lifted by the same so his paws rest on it;
                   and the snow sits behind him. */
                const rat = el.querySelector(":scope > .window-peek-rat");
                const b = borders(el);
                const up = rat && rat.offsetWidth ? RAT_LEDGE : 0;
                const clamp = up ? [{ x0: rat.offsetLeft + b.l + rat.offsetWidth * 0.26, x1: rat.offsetLeft + b.l + rat.offsetWidth * 0.94, max: up, min: up }] : [];
                if (up) lift(rat, up);
                const key = el.id || (isModal ? "modal" : "window");
                capBox(el, w, { depth: w > 420 ? 6 : 4.5, key, z: 1, clamp });
                icicleBox(el, w, { maxLen: w > 420 ? 18 : 12, key, z: isModal ? 5 : 1 });
                hats(el);
            });
        });
    }

    /* Rows come and go as the list is filtered and re-rendered, so they are
       decorated as they appear. Each is keyed to its own text, so a maze
       keeps its own snow wherever it lands, and each draws its own LOOK from
       that key — how deep, blown which way, a bare patch or two, a clump
       slid over a corner, icicles long or short or none — so a column of
       rows never reads as one stamp repeated. */
    function decorateRows() {
        document.querySelectorAll(".chrome-list-row").forEach((row) => {
            if (hosts.has(row) || !row.offsetWidth) return;
            const key = "row:" + (row.textContent || "").replace(/\s+/g, " ").slice(0, 60);
            host(row, (el, w) => {
                const r = prng(hash(key));
                // Four looks, so neighbouring rows read as different snowfalls.
                const look = r();
                const dusting = look < 0.22, drifted = look >= 0.55 && look < 0.82, heavy = look >= 0.82;
                const depth = dusting ? 1.5 + r() * 0.9 : heavy ? 4.8 + r() * 1.6 : 2.4 + r() * 1.8;
                const drifts = [];
                let tilt = (r() - 0.5) * 0.8;
                if (drifted) {
                    // Blown to one end and heaped up against it.
                    const end = r() < 0.5 ? 0.12 : 0.88;
                    tilt = end < 0.5 ? -1.1 : 1.1;
                    drifts.push({ at: w * end, w: 16 + r() * 26, h: depth * (1.1 + r() * 0.7) });
                }
                if (heavy || r() < 0.35) for (let i = 0, m = heavy ? 2 : 1; i < m; i++)
                    drifts.push({ at: w * (0.18 + r() * 0.64), w: 8 + r() * 22, h: depth * (0.6 + r() * 0.8) });
                const bare = [];
                if (!heavy && r() < 0.5) for (let i = 0, m = 1 + Math.floor(r() * 2); i < m; i++) bare.push({ at: w * (0.15 + r() * 0.7), w: 12 + r() * 46 });
                const slipSide = r(), slip = 2 + Math.floor(r() * (heavy ? 6 : 4));
                capBox(el, w, {
                    depth, tilt, bare, drifts, key, maxMul: 2.6, sparkles: r() < 0.3,
                    slipL: !dusting && slipSide < 0.2 ? slip : 0, slipR: !dusting && slipSide > 0.8 ? slip : 0
                });
                const iceRoll = r();
                if (iceRoll > (dusting ? 0.7 : 0.2)) icicleBox(el, w, {
                    maxLen: dusting ? 3 + r() * 2 : heavy ? 7 + r() * 5 : 4 + r() * 5,
                    gap: heavy ? 1.4 + r() * 1.5 : 2 + r() * 3.5, key, thinRim: !heavy,
                    side: iceRoll > 0.72 ? (r() < 0.5 ? -1 : 1) : 0
                });
                const th = el.querySelector(".row-thumb");
                if (th && r() < 0.75) {
                    ensurePositioned(th);
                    const s = hash(key);
                    const rr = Math.max(0, radiusOf(th) - 1) + "px";
                    const left = s % 2 === 1;
                    const p = piece(th, paneSnow(22 + (s % 17), 8 + (s % 6), s, left ? "bl" : "br"), "xm-pane", { bottom: 0, zIndex: 2 });
                    if (left) { p.style.left = "0"; p.style.borderBottomLeftRadius = rr; }
                    else { p.style.right = "0"; p.style.borderBottomRightRadius = rr; }
                    // The row's host record owns the pile too, so a redraw clears it.
                }
            });
        });
    }

    function hats(win) {
        const put = (rat, opts, fx, fy) => {
            if (!rat || !rat.offsetWidth) return;
            const hat = santaHat(opts);
            const x = rat.offsetLeft + rat.offsetWidth * fx - hat.brimLeft;
            const y = rat.offsetTop - (lifted.get(rat) ? lifted.get(rat).by : 0) + rat.offsetHeight * fy - hat.brimY;
            piece(win, hat, "xm-hat", { left: Math.round(x), top: Math.round(y), zIndex: 4 });
        };
        // Brim centred between the ears, tip flopped back off the head.
        put(win.querySelector(":scope > .window-peek-rat"), { brim: 22, height: 17, lean: 15, tilt: 0, seed: 11, furLeft: 2 }, 0.545, 0.185);
        put(win.querySelector(":scope > .window-sleep-rat"), { brim: 18, height: 14, lean: 12, tilt: 2, seed: 29 }, 0.64, 0.42);
    }

    function decorateHeader() {
        const hd = document.querySelector(".site-header");
        if (!hd || hosts.has(hd)) return;
        host(hd, (el, w) => {
            const F = festoon(w, 1225);
            const amb = document.createElement("canvas");
            amb.className = "xm-piece xm-glow"; amb.width = w; amb.height = F.AH;
            amb.style.cssText = `left:0;top:calc(100% - ${F.AT - 1}px);width:${w}px;height:${F.AH}px;z-index:-1`;
            const cv = document.createElement("canvas");
            cv.className = "xm-piece xm-lights"; cv.width = w; cv.height = F.H;
            cv.style.cssText = `left:0;top:calc(100% + 1px);width:${w}px;height:${F.H}px`;
            [amb, cv].forEach((c) => { c.setAttribute("aria-hidden", "true"); el.appendChild(c); added.add(c); });
            const ctx = cv.getContext("2d"), actx = amb.getContext("2d");
            const paint = (t) => { F.draw(ctx, t); F.ambient(actx, t); };
            paint(reduceMq.matches ? null : performance.now() / 1000);
            el.__xmPaint = paint;
            const brand = el.querySelector(".brand");
            // Pinned over the M's top-left corner: the berries sit on it.
            const word = el.querySelector(".brand-text");
            if (word) {
                ensurePositioned(word);
                const ink = firstInk(word), h = holly();
                piece(word, h, "xm-holly", { left: ink.x + 1 - h.pinX, top: ink.y + 1 - h.pinY, zIndex: 3 });
            }
        });
        // One slow clock for the lights: twelve frames a second is plenty for a breath.
        if (!reduceMq.matches) {
            let last = 0;
            const tick = (now) => {
                rafId = requestAnimationFrame(tick);
                if (now - last < 83) return;
                last = now;
                if (hd.__xmPaint) hd.__xmPaint(now / 1000);
            };
            rafId = requestAnimationFrame(tick);
        }
    }

    function decorateMisc() {
        // Snow on the tab icons. Not on the console handset in the top bar (the owner's: "looks odd, remove that").
        document.querySelectorAll(".chrome-nav-icon").forEach((im) => {
            if (im.__xm) return; im.__xm = true; capImage(im);
        });
        // The title's own words only, never the snow this put inside them.
        document.querySelectorAll(".hero-title > span:not(.xm-piece)").forEach((s) => {
            if (!hosts.has(s)) host(s, (el, w) => capText(el, w, { depth: 3.2 }));
        });
        const ft = document.querySelector(".site-footer");
        if (ft && !hosts.has(ft)) host(ft, (el, w) => {
            ensurePositioned(el);
            /* Exactly the footer's width: a full-width piece any wider gives
               the page a horizontal scrollbar, which on a page that just fits
               (the landing page) brought a vertical one, which changed the
               width, which redrew this, round and round — "the landing page
               is shaking". */
            const room = footerRoom(el);
            const cv = document.createElement("canvas");
            cv.className = "xm-piece xm-drift"; cv.setAttribute("aria-hidden", "true");
            cv.width = w; cv.height = room + 8;
            cv.style.cssText = `left:0;top:${2 - cv.height}px;width:${w}px;height:${cv.height}px`;
            el.appendChild(cv); added.add(cv);
            drift = { cv, w, room, profile: driftProfile(w, 1224) };
            paintDrift();
        });
    }

    /* ---------- the snowfall: one fixed canvas ----------
       Gentle most of the time, with the odd bigger flake drifting down among
       the small ones (the owner's: "in the gentle snowfall, have the
       occasional slightly bigger snowflakes fall"). And every minute or two
       a BLIZZARD blows through ("the occasional burst of being a
       blizzard"): eight to fourteen seconds of it, eased in and out, ten
       times the snow (most of it bigger than the gentle fall's) falling
       faster on a gusting wind from one side, the small flakes streaking
       with it. Only more snow: no white haze over the page (tried, and the
       owner's verdict was "don't make the screen go white"). The same pool
       of flakes throughout: a blizzard only lets the rest of it be seen, so
       nothing is created or thrown away. */
    let snow = null;
    let storm = 0;                       // how much of a blizzard it is right now, 0..1
    function snowfall() {
        if (reduceMq.matches) return;
        const cv = document.createElement("canvas");
        cv.className = "xm-snowfall"; cv.setAttribute("aria-hidden", "true");
        document.body.appendChild(cv); added.add(cv);
        const ctx = cv.getContext("2d");
        let W = 0, H = 0, flakes = [], gentle = 0;
        const rnd = prng(20261225);
        const SHAPES = {
            1: [[0, 0]],
            2: [[0, 0], [1, 0], [0, 1], [1, 1]],
            3: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
            // A soft clump, and two crystals: the bigger ones only now and then.
            4: [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3]],
            5: [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4], [1, 1], [3, 1], [1, 3], [3, 3]],
            7: [[3, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
                [2, 4], [3, 4], [4, 4], [1, 5], [3, 5], [5, 5], [3, 6]]
        };
        const MID = { 4: null, 5: [2, 2], 7: [3, 3] };
        // heavy: one of the blizzard's own flakes, which are mostly the middling sizes.
        function make(y, heavy) {
            const r = rnd();
            const size = heavy ? (r < 0.3 ? 1 : r < 0.75 ? 2 : 3)
                : r < 0.48 ? 1 : r < 0.78 ? 2 : r < 0.93 ? 3 : r < 0.975 ? 4 : r < 0.994 ? 5 : 7;
            // The big ones fall slowest and sway widest, as big flakes do.
            const v = size >= 4 ? 14 + rnd() * 8 : 9 + size * 7 + rnd() * 8;
            return { x: rnd() * (W + 200) - 100, y: y != null ? y : -10, size, v, sway: 6 + rnd() * (size >= 4 ? 24 : 16), ph: rnd() * 6.28,
                     f: 0.25 + rnd() * 0.5, a: size === 1 ? 0.55 : size === 2 ? 0.8 : 0.95 };
        }
        function resize() {
            /* A phone's address bar showing or hiding on scroll changes only the
               height: the snow already falling carries on rather than starting over. */
            const wider = innerWidth !== W;
            W = cv.width = innerWidth; H = cv.height = innerHeight;
            gentle = Math.round(W * H / 7000);
            if (wider) flakes = Array.from({ length: gentle * 10 }, (_, i) => make(rnd() * H, i >= gentle));
        }
        resize();

        // The blizzard's clock: the first after a minute or so, then every one to two and a half.
        const t0 = performance.now() / 1000;
        let next = t0 + 50 + rnd() * 50, start = -1, hold = 10, wind = 1, windMax = 110;
        function intensity(t) {
            if (start < 0 && t >= next) { start = t; hold = 8 + rnd() * 6; wind = rnd() < 0.5 ? -1 : 1; windMax = 90 + rnd() * 60; }
            if (start < 0) return 0;
            const u = t - start, IN = 2.5, OUT = 3.5;
            if (u > IN + hold + OUT) { start = -1; next = t + 60 + rnd() * 90; return 0; }
            return u < IN ? smooth(u / IN) : u < IN + hold ? 1 : 1 - smooth((u - IN - hold) / OUT);
        }

        /* Each flake drawn as one small picture, made once (a dozen
           one-pixel fills per flake was most of the cost), and the streaks
           as single fills at a set alpha. */
        const sprites = {};
        for (const size of Object.keys(SHAPES)) for (const a of [0.55, 0.8, 0.95]) {
            const c = document.createElement("canvas"); c.width = c.height = 8;
            const x = c.getContext("2d");
            x.fillStyle = "rgba(255,255,255," + a + ")";
            for (const [dx, dy] of SHAPES[size]) x.fillRect(dx, dy, 1, 1);
            const mid = MID[size];
            if (mid) { x.clearRect(mid[0], mid[1], 1, 1); x.fillStyle = "rgba(190,228,255,0.9)"; x.fillRect(mid[0], mid[1], 1, 1); }
            sprites[size + ":" + a] = c;
        }
        /* NOTHING OVER THE GAME: the room's canvas (and, around the
           homepage's game window, the frame it plays in) is left out of the
           snowfall, so no flake ever crosses a piece of furni. Found again
           twice a second, since a game window can be opened, moved or shut. */
        const KEEP_OUT = "#ff-canvas, .ff-stage, iframe.ff-console-game";
        let holes = [], holesAt = 0;
        function findHoles(now) {
            if (now - holesAt < 500) return;
            holesAt = now;
            holes = [...document.querySelectorAll(KEEP_OUT)].map((e) => e.getBoundingClientRect())
                .filter((r) => r.width && r.height && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W);
        }
        let last = performance.now(), id = 0;
        function frame(now) {
            id = requestAnimationFrame(frame);
            const began = performance.now();
            const dt = Math.min(0.05, (now - last) / 1000); last = now;
            findHoles(now); cost.holes = holes.length;
            const t = now / 1000;
            storm = intensity(t);
            const gust = 1 + 0.35 * Math.sin(t * 1.7) + 0.25 * Math.sin(t * 0.6 + 1);
            const blow = wind * windMax * storm * gust;
            const shown = Math.round(gentle + (flakes.length - gentle) * storm);
            ctx.clearRect(0, 0, W, H);
            const back = blow > 0 ? -1 : 1, streak = storm > 0.3;
            for (let i = 0; i < flakes.length; i++) {
                const f = flakes[i];
                f.y += f.v * (1 + 2.2 * storm) * dt;
                f.x += blow * (0.55 + f.size * 0.12) * dt;
                f.ph += f.f * dt * 2;
                if (f.y > H + 8) Object.assign(f, make(undefined, i >= gentle));
                if (f.x > W + 110) f.x -= W + 220; else if (f.x < -110) f.x += W + 220;
                if (i >= shown) continue;
                const x = Math.round(f.x + Math.sin(f.ph) * f.sway * (1 - 0.6 * storm)), y = Math.round(f.y);
                ctx.drawImage(sprites[f.size + ":" + f.a], x, y);
                // Small flakes streak with the wind in a blizzard: fainter pixels trailing upwind.
                if (streak && f.size <= 3) {
                    ctx.globalAlpha = f.a * 0.5 * storm;
                    ctx.fillStyle = "#fff";
                    ctx.fillRect(x + back * (f.size + 1), y - 1, 2, 1);
                    if (storm > 0.6) { ctx.globalAlpha = f.a * 0.25 * storm; ctx.fillRect(x + back * (f.size + 3), y - 2, 2, 1); }
                    ctx.globalAlpha = 1;
                }
            }
            // Wiped rather than clipped: the game's canvas sits inside its stage, and overlapping holes cancel in a clip.
            for (const r of holes) ctx.clearRect(r.left - 2, r.top - 2, r.width + 4, r.height + 4);
            settle(dt);
            cost.snow = cost.snow * 0.95 + (performance.now() - began) * 0.05;
        }
        id = requestAnimationFrame(frame);
        addEventListener("resize", resize);
        snow = {
            stop() { cancelAnimationFrame(id); removeEventListener("resize", resize); storm = 0; },
            // For trying it out: a blizzard now.
            blizzard() { next = performance.now() / 1000; start = -1; }
        };
    }

    /* THE FOOTER'S SNOW PILES UP. The owner's: "keep it at its current level
       as the default starting level, but have it slowly increase in size
       over time"; then, of a pixel every forty seconds, "wayyyy too slow! It
       should be noticeably getting bigger within a minute or two, it can
       eventually reach and overlap the bottom of the main content window";
       and "make sure the foot snow is smooth, like rolling hills".

       So: FOOTER_START deep on every page, rising FOOTER_RATE pixels a
       second (four times that in a blizzard), until its highest hill climbs
       DRIFT_OVERLAP pixels over the bottom of the main window (footerRoom).
       The shape is long, low swells only, no lumps, and every column is
       within a pixel or so of its neighbours, so the silhouette reads as
       rolling hills; the valleys rise with the hills, so it is the same
       landscape getting deeper. One canvas, repainted in place as it grows. */
    const FOOTER_START = 7, FOOTER_RATE = 0.4, DRIFT_OVERLAP = 22;
    let fallen = 0, footerDepth = FOOTER_START, drift = null;

    // How deep it may grow: up over the main window's bottom edge, or a modest bank where there is none.
    function footerRoom(ft) {
        const top = ft.getBoundingClientRect().top;
        let bottom = null;
        document.querySelectorAll(".chrome-window").forEach((w) => {
            if (w.closest(".modal") || !w.offsetWidth) return;
            const b = w.getBoundingClientRect().bottom;
            if (b <= top + 4 && (bottom == null || b > bottom)) bottom = b;
        });
        const room = bottom == null ? 60 : Math.round(top - bottom) + DRIFT_OVERLAP;
        return Math.max(24, Math.min(260, room));
    }
    // 0..1 along the footer: a few long swells, two to six hundred pixels apart.
    function driftProfile(w, seed) {
        const rnd = prng(seed);
        const waves = [
            { wl: 520 + rnd() * 260, a: 1, ph: rnd() * 6.3 },
            { wl: 230 + rnd() * 120, a: 0.55, ph: rnd() * 6.3 },
            { wl: 120 + rnd() * 50, a: 0.22, ph: rnd() * 6.3 }
        ];
        const out = new Float32Array(w);
        let lo = Infinity, hi = -Infinity;
        for (let x = 0; x < w; x++) {
            let v = 0;
            for (const k of waves) v += k.a * Math.sin(x / k.wl * Math.PI * 2 + k.ph);
            out[x] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
        }
        for (let x = 0; x < w; x++) out[x] = (out[x] - lo) / Math.max(1e-6, hi - lo);
        return out;
    }
    const rgba = (c) => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
    const PX = { O: rgba(C.O), K: rgba(C.K), B: rgba(C.B), S: rgba(C.S), D: rgba(C.D) };
    function paintDrift() {
        if (!drift) return;
        const { cv, w, room, profile } = drift;
        const H = cv.height, depth = Math.min(room, footerDepth);
        const ctx = cv.getContext("2d");
        const img = ctx.createImageData(w, H), px = new Uint32Array(img.data.buffer);
        // Valleys at three fifths of the hills, never thinner than the starting bank.
        const floorH = Math.min(depth, Math.max(FOOTER_START - 2, depth * 0.6));
        const top = new Int16Array(w);
        for (let x = 0; x < w; x++) top[x] = H - 2 - Math.round(floorH + (depth - floorH) * profile[x]);
        for (let x = 0; x < w; x++) {
            const t = top[x];
            // The slope from the smooth curve, not the pixel steps, so the shading runs in a clean band.
            const slope = -(profile[Math.min(w - 1, x + 4)] - profile[Math.max(0, x - 4)]) / 8 * (depth - floorH);   // + going down to the right
            const shadeBand = slope > 0.05 ? Math.min(6, 1 + Math.round(slope * 12)) : 0;  // a right-facing slope is in shade
            const litBand = slope < -0.05 ? 2 : 1;
            for (let y = Math.max(0, t); y < H; y++) {
                let c = PX.B;
                const k = y - t;
                if (k < litBand) c = PX.K;
                else if (k < litBand + shadeBand) c = PX.S;
                if (c === PX.B && ((x * 7 + y * 13) % 23 === 0)) c = PX.K;     // grains of sparkle
                if (y >= H - 4) c = y >= H - 2 ? PX.D : PX.S;                  // where it sits on the footer
                px[y * w + x] = c;
            }
            // The outline along the top, filled down a step where the hill turns.
            const above = Math.min(t, x ? top[x - 1] : t, x < w - 1 ? top[x + 1] : t);
            for (let y = Math.max(0, above - 1); y < t; y++) px[y * w + x] = PX.O;
        }
        ctx.putImageData(img, 0, 0);
        /* A line of the fansites strip the snow has buried right across is
           re-inked for the snow, as the frozen Fallin' Furni panel is: deep
           blue with a white edge. Until then it keeps its own colour. */
        const ftTop = cv.getBoundingClientRect().bottom - 2;
        document.querySelectorAll(".fellow-fansites > p").forEach((p) => {
            const r = p.getBoundingClientRect();
            p.classList.toggle("xm-snowed", ftTop - (r.top + r.height / 2) < floorH - 2);
        });
    }
    function settle(dt) {
        if (!drift) return;
        fallen += dt * FOOTER_RATE * (1 + 3 * storm);
        const d = Math.min(drift.room, FOOTER_START + Math.floor(fallen));
        if (d === footerDepth) return;
        footerDepth = d;
        paintDrift();
    }

    /* ---------- CHRISTMAS TREES IN THE MAZE (the background) ----------
       The owner's: "add Christmas Tree 1 and 2 into the background image of
       the website, in its switched on glowing state … scattered randomly in
       that background maze … make them look like they are actually within
       that maze. It must be random across the page and not just repeated
       tiling."

       The Origins client's own small-scale art: Christmas Tree 1 (s_tree3,
       which has no "on" state) and Christmas Tree 2 (s_tree4) switched on,
       its lights layer drawn additively as the client draws it. One fixed
       canvas under everything, because the maze is a fixed background
       (MazeBG.png tiled at 220px from the window's corner).

       IN the maze, not on it: each tree is put on a patch of real floor
       (the tile's floor colours), and every pixel of it that a wall in front
       would cover is left out. "In front" is read off the picture itself —
       from a wall pixel, walk down the column to where that wall meets the
       floor; if that is lower on the screen than the tree's foot, the wall
       is nearer, and it wins. Then the background's own top-to-bottom shade
       is laid on the tree (the lights only half as much), and a soft shadow
       goes on the floor under it.

       Placed at random over the window (seeded by its size, so it holds
       still), kept apart from each other and out from under the windows,
       the bars and the title, where they would only be hidden. */
    const TILE_PX = 220, TILE_SRC = 200;
    const TREE_SCALE = 0.78;      // the trees, against the client's small scale
    const TREE_ROOM = 7;          // the least clear floor round a tree's foot (in half-steps along a diagonal)
    const AMBIENT = [58, 38, 20]; // the maze's own warm dark, which the trees are graded towards
    const FLOOR = new Set(["31,19,10", "22,13,6", "35,25,18", "26,19,13"]);
    const SHADE = [[0, 0.792], [0.05, 0.7899], [0.10, 0.7771], [0.15, 0.748], [0.20, 0.7015], [0.25, 0.64], [0.30, 0.5685],
                   [0.35, 0.4935], [0.40, 0.422], [0.45, 0.3605], [0.50, 0.314], [0.55, 0.2849], [0.60, 0.2721], [0.65, 0.27], [1, 0.27]];
    function shadeAt(u) {
        for (let i = 1; i < SHADE.length; i++) if (u <= SHADE[i][0]) {
            const [u0, a0] = SHADE[i - 1], [u1, a1] = SHADE[i];
            return a0 + (a1 - a0) * (u - u0) / (u1 - u0);
        }
        return 0.27;
    }
    const loadImg = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
    const pixels = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height); };

    let bgTrees = null;
    async function backgroundTrees() {
        /* Not on an iPhone or iPad: Safari there ignores a fixed background
           and scrolls the maze with the page, and trees pinned to the window
           would slide across its walls. */
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        if (ios) return;
        let art;
        try {
            const [maze, t3, t4a, t4b] = await Promise.all(["/assets/img/MazeBG.png", "/assets/furni/s_tree3_0_0_a.png",
                "/assets/furni/s_tree4_0_0_a.png", "/assets/furni/s_tree4_1_0_b.png"].map(loadImg));
            art = { maze: pixels(maze), t3: pixels(t3), t4a: pixels(t4a), t4b: pixels(t4b) };
        } catch (e) { return; }                   // no art, no trees: nothing else depends on them
        if (!on) return;
        // Floor or wall, for every pixel of the source tile.
        const floor = new Uint8Array(TILE_SRC * TILE_SRC);
        for (let i = 0; i < floor.length; i++) {
            const d = art.maze.data;
            floor[i] = FLOOR.has(d[i * 4] + "," + d[i * 4 + 1] + "," + d[i * 4 + 2]) ? 1 : 0;
        }
        const isFloor = (x, y) => {
            const u = Math.floor((((x % TILE_PX) + TILE_PX) % TILE_PX) / (TILE_PX / TILE_SRC));
            const v = Math.floor((((y % TILE_PX) + TILE_PX) % TILE_PX) / (TILE_PX / TILE_SRC));
            return floor[Math.min(TILE_SRC - 1, v) * TILE_SRC + Math.min(TILE_SRC - 1, u)] === 1;
        };
        // Where the wall at (x, y) stands on the floor: the first floor pixel below it.
        const wallFoot = (x, y) => { for (let k = 1; k < 90; k++) if (isFloor(x, y + k)) return y + k; return y + 90; };

        // The two trees as sprites: their pixels, the lights layer, and where the pot touches the floor.
        function sprite(kind) {
            const W = kind === 3 ? 30 : 38, H = 68;
            const body = new ImageData(W, H), glow = new ImageData(W, H);
            const blit = (src, ox, oy, into) => {
                for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
                    const s = (y * src.width + x) * 4, X = x + ox, Y = y + oy;
                    if (X < 0 || Y < 0 || X >= W || Y >= H || !src.data[s + 3]) continue;
                    const d = (Y * W + X) * 4;
                    for (let c = 0; c < 4; c++) into.data[d + c] = src.data[s + c];
                }
            };
            if (kind === 3) blit(art.t3, 0, 0, body);
            else { blit(art.t4a, 3, 0, body); blit(art.t4b, 0, 6, glow); }
            /* At the MAZE'S scale, not the client's. The maze's corridors are
               about seven tenths of a small-scale Habbo tile, and it is shown
               a tenth enlarged and smoothed; at full size a tree was wider
               than the corridor it stood in and nearly three walls tall. So
               it is drawn at TREE_SCALE, smoothly, the way the maze itself is
               drawn — about two walls tall, and as soft as its surroundings. */
            const sw = Math.round(W * TREE_SCALE), sh = Math.round(H * TREE_SCALE);
            const scaled = (img) => {
                const a = document.createElement("canvas"); a.width = W; a.height = H; a.getContext("2d").putImageData(img, 0, 0);
                const b = document.createElement("canvas"); b.width = sw; b.height = sh;
                const x = b.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
                x.drawImage(a, 0, 0, sw, sh);
                return x.getImageData(0, 0, sw, sh);
            };
            const sBody = scaled(body), sGlow = scaled(glow);
            let foot = 0, sum = 0, n = 0;
            for (let y = sh - 1; y >= 0 && !n; y--) for (let x = 0; x < sw; x++) if (sBody.data[(y * sw + x) * 4 + 3] > 110) { foot = y; sum += x; n++; }
            return { W: sw, H: sh, body: sBody, glow: sGlow, lit: kind === 4, fx: Math.round(sum / Math.max(1, n)), fy: foot };
        }
        const sprites = { 3: sprite(3), 4: sprite(4) };

        const cv = document.createElement("canvas");
        cv.className = "xm-bgtrees"; cv.setAttribute("aria-hidden", "true");
        const lights = document.createElement("canvas");
        lights.className = "xm-bgtrees xm-bgtrees-lights"; lights.setAttribute("aria-hidden", "true");
        document.body.prepend(lights); document.body.prepend(cv);
        added.add(cv); added.add(lights);

        /* Out from under the page's furniture. By the boxes things are drawn
           in, not by asking what is at a point: the archive's gate keeps the
           page hidden while this runs, and a hidden page answers "nothing". A
           box that fills most of the window is a container, not furniture. */
        const BLOCK = ".chrome-window, .modal, .site-header, .site-footer, .fellow-fansites, .side-drawer, h1, h2, p, a, button, img, input, select, iframe, [class*='card'], [class*='btn']";
        function furniture() {
            const W = innerWidth, H = innerHeight, out = [];
            document.querySelectorAll(BLOCK).forEach((e) => {
                if (e.closest(".xm-piece")) return;
                const r = e.getBoundingClientRect();
                if (!r.width || !r.height || r.width * r.height > W * H * 0.6) return;
                if (getComputedStyle(e).display === "none") return;
                out.push(r);
            });
            return out;
        }
        const clearOf = (boxes, x0, y0, x1, y1) => !boxes.some((r) => x0 < r.right + 6 && x1 > r.left - 6 && y0 < r.bottom + 6 && y1 > r.top - 6);
        /* How much clear floor there is around (x, y) along the maze's own
           diagonals (two across for one down), in the tightest of the four
           directions. In a corridor that is the distance to the nearer side
           wall, so the best spot is the middle of the corridor. */
        const DIRS = [[2, 1], [-2, 1], [2, -1], [-2, -1]];
        function clearance(x, y) {
            let least = 99;
            for (const [dx, dy] of DIRS) {
                let k = 0;
                while (k < 24 && isFloor(x + dx * (k + 1) / 2, y + dy * (k + 1) / 2)) k++;
                least = Math.min(least, k);
            }
            return least;
        }
        // The middle of the corridor nearest (x, y), or null if there is none worth standing in.
        function footing(x, y) {
            let best = null, bestC = 0;
            for (let dy = -14; dy <= 14; dy++) for (let dx = -24; dx <= 24; dx += 2) {
                const X = Math.round(x + dx), Y = Math.round(y + dy);
                if (!isFloor(X, Y)) continue;
                const c = clearance(X, Y) - Math.hypot(dx, dy * 2) * 0.02;
                if (c > bestC) { bestC = c; best = [X, Y]; }
            }
            return bestC >= TREE_ROOM ? best : null;
        }

        function draw() {
            const W = innerWidth, H = innerHeight;
            cv.width = lights.width = W; cv.height = lights.height = H;
            const ctx = cv.getContext("2d"), lctx = lights.getContext("2d");
            const out = ctx.createImageData(W, H), lout = lctx.createImageData(W, H);
            const rnd = prng(hash("trees:" + W + "x" + H));
            const want = Math.max(4, Math.min(16, Math.round(W * H / 120000)));
            const placed = [], boxes = furniture();
            for (let tries = 0; tries < want * 30 && placed.length < want; tries++) {
                const x = 20 + rnd() * (W - 40), y = 90 + rnd() * (H - 100);
                const spot = footing(x, y);
                if (!spot) continue;
                if (placed.some((p) => Math.hypot(p[0] - spot[0], (p[1] - spot[1]) * 1.6) < 100)) continue;
                if (!clearOf(boxes, spot[0] - 18, spot[1] - 58, spot[0] + 18, spot[1] + 6)) continue;
                placed.push(spot);
            }
            // Back to front, so a nearer tree covers a farther one.
            placed.sort((a, b) => a[1] - b[1]);
            const stats = [];
            placed.forEach(([sx, sy], i) => {
                const sp = sprites[(hash("k" + i + sx) % 2) ? 4 : 3];
                const ox = sx - sp.fx, oy = sy - sp.fy;
                const st = { x: sx, y: sy, hidden: 0 }; stats.push(st);
                st.lit = sp.lit;
                // The shadow first, on the floor only: a flattened oval, as the maze's floor is.
                for (let dy = -4; dy <= 4; dy++) for (let dx = -9; dx <= 9; dx++) {
                    const e = (dx * dx) / 72 + (dy * dy) / 13;
                    if (e > 1) continue;
                    const X = sx + dx, Y = sy + dy;
                    if (X < 0 || Y < 0 || X >= W || Y >= H || !isFloor(X, Y)) continue;
                    const d = (Y * W + X) * 4;
                    out.data[d + 3] = Math.max(out.data[d + 3], Math.round(110 * (1 - e)));
                }
                const put = (src, into, keep, grade) => {
                    for (let y = 0; y < sp.H; y++) for (let x = 0; x < sp.W; x++) {
                        const s = (y * sp.W + x) * 4, a = src.data[s + 3];
                        if (!a) continue;
                        const X = ox + x, Y = oy + y;
                        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
                        // Hidden where a wall nearer than the tree's foot covers it.
                        if (!isFloor(X, Y) && wallFoot(X, Y) > sy + 1) { st.hidden++; continue; }
                        const f = 1 - shadeAt(Y / H) * keep;
                        const d = (Y * W + X) * 4;
                        let r = src.data[s], g = src.data[s + 1], b = src.data[s + 2];
                        if (grade) {
                            // A little of the maze's ambient in it, and a little less colour: lit by the same dim light.
                            r += (AMBIENT[0] - r) * 0.22; g += (AMBIENT[1] - g) * 0.22; b += (AMBIENT[2] - b) * 0.22;
                            const l = r * 0.3 + g * 0.59 + b * 0.11;
                            r += (l - r) * 0.18; g += (l - g) * 0.18; b += (l - b) * 0.18;
                        }
                        into.data[d] = r * f; into.data[d + 1] = g * f; into.data[d + 2] = b * f;
                        into.data[d + 3] = Math.max(into.data[d + 3], a);
                    }
                };
                put(sp.body, out, 0.95, true);
                put(sp.glow, lout, 0.45, false);
            });
            ctx.putImageData(out, 0, 0);
            lctx.putImageData(lout, 0, 0);
            /* The lit tree lights the maze round it: warm light on the walls
               near it and a pool on the floor at its foot, added like the
               lights themselves, and breathing with them (it is on the same
               layer). */
            lctx.globalCompositeOperation = "lighter";
            for (const t of stats) {
                if (!t.lit) continue;
                const k = 1 - shadeAt(t.y / H) * 0.5;
                const cy = t.y - 22;
                const g = lctx.createRadialGradient(t.x, cy, 0, t.x, cy, 48);
                g.addColorStop(0, "rgba(255,186,96," + (0.16 * k).toFixed(3) + ")");
                g.addColorStop(0.5, "rgba(255,160,70," + (0.06 * k).toFixed(3) + ")");
                g.addColorStop(1, "rgba(255,150,60,0)");
                lctx.fillStyle = g; lctx.fillRect(t.x - 48, cy - 48, 96, 96);
                lctx.save();
                lctx.translate(t.x, t.y); lctx.scale(1, 0.5);
                const p = lctx.createRadialGradient(0, 0, 0, 0, 0, 30);
                p.addColorStop(0, "rgba(255,180,90," + (0.14 * k).toFixed(3) + ")");
                p.addColorStop(1, "rgba(255,160,70,0)");
                lctx.fillStyle = p; lctx.fillRect(-30, -30, 60, 60);
                lctx.restore();
            }
            lctx.globalCompositeOperation = "source-over";
            if (bgTrees) bgTrees.stats = stats;
        }
        bgTrees = { stats: [] };
        draw();
        let t = 0;
        const onResize = () => { clearTimeout(t); t = setTimeout(() => { if (on) draw(); }, 200); };
        addEventListener("resize", onResize);
        Object.assign(bgTrees, { stop() { removeEventListener("resize", onResize); clearTimeout(t); }, redraw: draw });
    }

    function decorateAll() {
        if (!on) return;
        // Rows a re-render threw away: forget them (their pieces went with them).
        for (const [el, rec] of hosts) if (!el.isConnected) { rec.pieces.forEach((p) => added.delete(p)); hosts.delete(el); }
        for (const [el, st] of standIns) if (!el.isConnected) { st.stop(); st.box.remove(); added.delete(st.box); standIns.delete(el); }
        decorateHeader();
        decorateWindows();
        decorateRows();
        decorateMisc();
    }

    /* The countdown, as a slide in the top bar's events ticker: from 1 Dec,
       "24 sleeps 'til Christmas!", down to one on Christmas Eve, then
       "Merry Christmas!" on the day; gone from the 26th. By the visitor's
       own calendar (or the preview's "Pretend it's"). Registered once, and
       silent whenever the skin is off. */
    function countdown() {
        if (!on) return null;
        const d = window.SkinWear && SkinWear.today ? SkinWear.today() : new Date();
        if (d.getMonth() !== 11 || d.getDate() > 25) return null;
        const sleeps = 25 - d.getDate();
        if (sleeps === 0) return { key: "xmas-countdown", title: "Merry Christmas!", when: "From all the Maze Rats" };
        return {
            key: "xmas-countdown",
            title: sleeps + (sleeps === 1 ? " sleep" : " sleeps") + " 'til Christmas!",
            when: sleeps === 1 ? "It's Christmas Eve!" : "Christmas Day, 25 Dec"
        };
    }
    (window.HeaderTickerExtras = window.HeaderTickerExtras || []).push(countdown);

    // What the skin costs a frame, in milliseconds (smoothed): SiteSkins.xmas.cost().
    const cost = { snow: 0, lights: 0 };

    /* IN THE HOMEPAGE'S GAME WINDOW (/fallinfurni/play?embed=1, html.ff-embed)
       the page shows the game's stage and nothing else, and the page around
       the window already has the snow, the lights and the trees. So there the
       skin is its attribute and its palette (js/skin-wear.js) and draws
       nothing: no hidden layers costing the game frames. */
    const embedded = () => document.documentElement.classList.contains("ff-embed");

    function start() {
        if (on) return;
        on = true;
        if (embedded()) return;
        ro = new ResizeObserver((entries) => {
            clearTimeout(ro.t);
            ro.t = setTimeout(() => entries.forEach((e) => redraw(e.target)), 120);
        });
        // New rows and opened windows, decorated as they arrive (batched to a frame).
        let pending = 0;
        mo = new MutationObserver(() => {
            if (pending) return;
            pending = requestAnimationFrame(() => { pending = 0; decorateAll(); });
        });
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
        decorateAll();
        snowfall();
        // After the windows are up, so it can tell where they are.
        timers.push(setTimeout(backgroundTrees, 600));
        // A late font or a late list: one more pass once things settle.
        timers.push(setTimeout(decorateAll, 1500));
        /* And a light look every two seconds for windows and rows that came
           since: a window can finish opening (the game's does) after the last
           change to the page that would have prompted one. */
        timers.push(setInterval(() => { if (on && !document.hidden) { decorateWindows(); decorateRows(); standIns.forEach((v) => v.sync()); } }, 2000));
    }

    function stop() {
        if (!on) return;
        on = false;
        fallen = 0; footerDepth = FOOTER_START; drift = null;
        document.querySelectorAll(".xm-snowed").forEach((p) => p.classList.remove("xm-snowed"));
        if (mo) mo.disconnect(); if (ro) ro.disconnect();
        mo = ro = null;
        cancelAnimationFrame(rafId);
        if (snow) snow.stop(); snow = null;
        if (bgTrees) bgTrees.stop(); bgTrees = null;
        timers.splice(0).forEach((t) => { clearTimeout(t); clearInterval(t); });
        added.forEach((n) => n.remove()); added.clear();
        hosts.forEach((rec, el) => { delete el.__xmPaint; }); hosts.clear();
        document.querySelectorAll(".chrome-nav-icon").forEach((im) => { delete im.__xm; });
        madeRelative.forEach((el) => { el.style.position = ""; }); madeRelative.clear();
        lifted.forEach((v, el) => { el.style.translate = v.was; }); lifted.clear();
        standIns.forEach((v) => v.stop()); standIns.clear();
    }

    (window.SiteSkins = window.SiteSkins || {}).xmas = {
        start, stop,
        // A blizzard now, for trying it out (the console: SiteSkins.xmas.blizzard()).
        blizzard: () => { if (snow) snow.blizzard(); },
        cost: () => ({ snow: +cost.snow.toFixed(2), lights: +cost.lights.toFixed(2), holes: cost.holes }),
        // The footer drift as it will be after this many seconds of gentle snow (for trying it out).
        grow: (secs) => { fallen += secs * FOOTER_RATE; settle(0); return footerDepth; },
        // Where the background trees stood, and how much of each a nearer wall hid.
        trees: () => (bgTrees ? bgTrees.stats : []),
        // The art, for tools and previews.
        art: { snowCap, icicles, paneSnow, santaHat, festoon, holly, boxTop }
    };
})();

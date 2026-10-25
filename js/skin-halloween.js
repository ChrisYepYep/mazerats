/* THE HALLOWEEN SKIN (25 Oct 2026, the owner's: "a halloween skin of the
   website, but instead of snow on top of the windows etc, it'll be green
   slime/goo with some of it drooping down over the content within the
   windows").

   Loaded only while the skin is on: js/skin-wear.js decides that, and calls
   SiteSkins.halloween.start() / .stop(). It is the Christmas skin's sibling
   (js/skin-xmas.js) and keeps its rules:

     Everything is drawn in the browser, once per element, for that
     element's own width, seeded from the element and its width, so nothing
     is ever tiled and a window gets the same goo on every visit.

     NOTHING HERE MOVES LAYOUT. Every piece is an absolutely positioned,
     pointer-events:none, aria-hidden child; a host is only given
     position:relative when it was static, and given it back on stop().
     stop() removes every node, timer, frame and observer this file made.

   The owner's calls after the mock-ups (25 Oct 2026):
     the goo a bit less thick and less saturated than the first pass;
     none on the top bar;
     cobwebs only in a TOP corner of an INNER frame, spun inside it: behind
       its content, and cut to the frame's own rounded corner;
     the console in Witching Hour's purple, but muted (the stylesheet), with
       its tab icons in costume (tools/skin-halloween-tabs.js);
     the ghost hung on a string from the top bar, a little left of the main
       content, swaying.

   Every drip is measured against the text and icons under it and stops
   short of them, so nothing to read is ever covered. */
(function () {
    "use strict";
    if (window.SiteSkins && window.SiteSkins.halloween) return;

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

    // ---------- the goo's colours: soft outline (lit side), outline, deep, shade, body, lit, crest, glint ----------
    const GOO = { Q: [24, 58, 16], O: [14, 30, 9], D: [32, 75, 21], S: [59, 125, 35], B: [95, 176, 52], M: [134, 204, 78], L: [188, 234, 128], H: [242, 251, 226] };

    /* ---------------------------------------------------------------
       THE GOO along one top edge.

         w, r       the element's width and corner radius
         pad        columns either side of it (the side runs hang there)
         up, down   rows above the edge (the mound) and below it
         floor[x]   per canvas column, the first row a drip must not reach
         ceil[x]    per canvas column, the first row the mound may use
         size       "big" | "mid" | "small"
         span       [from, to] as fractions of w: a partial pour
         sideRuns   chance of goo running over each rounded corner
         anim       { i, len, D, neck }: drip i drawn at one stage of its
                    animation, as a drip with a drop (len 0 leaves it out)
         hide       a Set of drip indices left out (animated elsewhere)
         only       [x0, x1]: light and return only that column (frames)

       Every stage draws from its own seeded stream, so changing one drip
       for an animation frame changes nothing else in the picture.
       --------------------------------------------------------------- */
    function goo(o) {
        const stream = (name) => prng(o.seed ^ hash(name));
        const pad = o.pad, W = o.w + pad * 2, E = o.up, H = o.up + o.down, R = o.r;
        const big = o.size === "big", small = o.size === "small";
        /* COLUMN MODE (o.only = [x0, x1]): the shape is still worked out whole
           (that is cheap), but only that column, and a margin round it, is lit
           and drawn, and the canvas returned is just the column. A drip's
           animation frames are drawn this way, forty-eight per drip. */
        const X0 = o.only ? Math.max(0, o.only[0] - 8) : 0, X1 = o.only ? Math.min(W, o.only[1] + 8) : W;
        // Drips animated elsewhere (o.hide, their indices) are left out of this picture.
        const hide = o.hide || null;
        const floor = o.floor || new Array(W).fill(H);
        const ceil = o.ceil || new Array(W).fill(0);
        const m = new Uint8Array(W * H);        // 0 empty, 1 mound, 2 the hanging edge, 3 drip, 4 drop
        const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : m[y * W + x];
        const put = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H && (!m[y * W + x] || v < m[y * W + x])) m[y * W + x] = v; };
        const edgeAt = (x) => {
            const cx = x + 0.5 - pad;
            if (cx < 0 || cx > o.w) return null;
            let d = 0;
            if (cx < R) d = R - cx; else if (cx > o.w - R) d = cx - (o.w - R);
            return Math.round(E + R - Math.sqrt(Math.max(0, R * R - d * d)));
        };
        const sa = (o.span ? o.span[0] : 0) * o.w, sb = (o.span ? o.span[1] : 1) * o.w;
        /* A pour is a puddle: thickest where it landed, thinning to its free
           ends (an end at a corner is not free: it went over it). */
        const env = (u) => {
            if (!o.span) return 1;
            const t = (u - sa) / Math.max(1, sb - sa);
            const l = sa > 0 ? Math.sin(Math.PI / 2 * Math.min(1, Math.max(0, t) * 2)) : 1;
            const r = sb < o.w ? Math.sin(Math.PI / 2 * Math.min(1, Math.max(0, 1 - t) * 2)) : 1;
            return Math.pow(Math.min(l, r), 0.45);
        };
        /* A profile made clean for pixels: rounded to whole rows, no step of
           more than one row between neighbours, and no step shorter than two
           columns — so its outline is long even runs, never a staircase of
           single pixels (which is what read as jagged and "janky"). */
        function clean(f, lo, hi, cut) {
            const v = new Array(W).fill(0);
            // Below `cut` it stops, rather than trailing off as a one-pixel wire.
            for (let x = 0; x < W; x++) v[x] = f[x] > cut ? Math.max(lo, Math.min(hi, Math.round(f[x]))) : 0;
            for (let pass = 0; pass < 4; pass++) for (let x = 1; x < W; x++) {
                if (v[x] && v[x - 1] && v[x] - v[x - 1] > 1) v[x] = v[x - 1] + 1;
                if (v[x] && v[x - 1] && v[x - 1] - v[x] > 1) v[x - 1] = v[x] + 1;
            }
            for (let pass = 0; pass < 3; pass++) for (let x = 1; x < W - 1; x++) {
                if (!v[x - 1] || !v[x] || !v[x + 1]) continue;
                if (v[x - 1] === v[x + 1] && v[x] !== v[x - 1]) v[x] = v[x - 1];
            }
            return v;
        }
        // Two passes of a soft blur, so every swell is a slope and never a spike.
        function soften(f, n) {
            for (let k = 0; k < n; k++) {
                const s = f.slice();
                for (let x = 1; x < W - 1; x++) if (s[x]) f[x] = (s[x - 1] + 2 * s[x] + s[x + 1]) / 4;
            }
            return f;
        }

        /* THE MOUND: what lies on top of the edge. Long slow swells and a few
           heavier pools, tapering to nothing at the ends and at a pour's free
           ends: thick liquid levels out, it does not ripple. */
        const rm = stream("mound");
        const base = big ? 2.4 : small ? 1.4 : o.span ? 2.4 : 1.9;
        const ph = [rm() * 6.3, rm() * 6.3];
        const pools = [];
        for (let i = 0, n = Math.max(2, Math.round(o.w / (big ? 48 : 40))); i < n; i++)
            pools.push({ c: rm() * o.w, a: (big ? 1 : 0.5) + rm() * (big ? 2.6 : 1.4), s: 5 + rm() * (big ? 12 : 8) });
        const tf = new Array(W).fill(0);
        for (let x = 0; x < W; x++) {
            const e = edgeAt(x); if (e === null) continue;
            const u = x - pad;
            if (u < sa || u > sb) continue;
            let h = base + 0.7 * Math.sin(u / 43 + ph[0]) + 0.3 * Math.sin(u / 19 + ph[1]);
            for (const p of pools) h += p.a * Math.exp(-((u - p.c) ** 2) / (2 * p.s * p.s));
            // Fuller nearer the corners than it was: it tapers over the curve itself, not long before it.
            const ends = Math.min(smooth((u + 1) / (R * 0.6 + 6)), smooth((o.w - u) / (R * 0.6 + 6)), env(u));
            tf[x] = Math.max(0, h * ends);
        }
        const depth = clean(soften(tf, 2), 1, E - 2, 1.5);
        // Where something must keep its place on the edge (the peeking rat), the goo stays low.
        // It eases down to that over a dozen pixels either side, rather than stepping.
        for (const c of o.clamp || []) {
            const RAMP = 12;
            for (let x = Math.max(0, Math.round(pad + c.x0 - RAMP)); x <= Math.min(W - 1, Math.round(pad + c.x1 + RAMP)); x++) {
                if (!depth[x]) continue;
                const out = Math.max(0, pad + c.x0 - x, x - (pad + c.x1));
                depth[x] = Math.min(depth[x], Math.round(c.max + (depth[x] - c.max) * smooth(out / RAMP)));
            }
        }
        for (let x = 0; x < W; x++) {
            const e = edgeAt(x); if (e === null || !depth[x]) continue;
            for (let y = Math.max(e - depth[x], ceil[x]); y < e; y++) put(x, y, 1);
        }

        /* THE HANGING EDGE: the goo that has crept over the edge and hangs
           under it, a band one to two rows deep that swells into soft rounded
           lobes. One smooth profile rather than separate beads, so the
           underside is a continuous scalloped curve. */
        const rl = stream("lobes");
        const lobes = [];
        for (let u = Math.max(4, sa + 5); u < Math.min(o.w - 4, sb - 5);) {
            const s = big ? 3.2 + rl() * 3.6 : small ? 2 + rl() * 1.6 : 2.6 + rl() * 2.6;
            const a = (big ? 0.8 : 0.5) + rl() * (big ? 2.6 : small ? 1.2 : 1.8);
            lobes.push({ c: u, s, a });
            u += s * 2.1 + rl() * (big ? 9 : 6);
        }
        const bf = new Array(W).fill(0);
        const band0 = big ? 1.5 : small ? 0.9 : 1.2;
        for (let x = 0; x < W; x++) {
            if (!depth[x]) continue;
            const u = x - pad;
            let b = band0;
            for (const lb of lobes) { const d = Math.abs(u - lb.c) / lb.s; if (d < 1.6) b += lb.a * Math.max(0, Math.cos(Math.min(Math.PI / 2, d * Math.PI / 3.2))) ** 2; }
            const corner = u < R + 2 || u > o.w - R - 2;
            bf[x] = b * Math.min(1, depth[x] / 2) * (corner ? 0.6 : 1);
        }
        const band = clean(soften(bf, 1), 1, 8, 0.5);
        const below = new Array(W).fill(null);          // the first empty row under the goo, per column
        for (let x = 0; x < W; x++) {
            const e = edgeAt(x); if (e === null || !depth[x]) continue;
            const lim = (floor[x] ?? H) - 2;
            let y = e;
            for (; y < e + band[x] && y < lim; y++) put(x, y, 2);
            below[x] = y;
        }

        /* A DRIP, as one smooth outline: it leaves the hanging edge in a
           curve (a fillet, wider at the root), draws in to a neck, and ends in
           a round drop. Every row's half-width comes from that outline and is
           tested at pixel centres, so it is symmetric and its sides are clean.
           Never thinner than two pixels: no pins, no threads. */
        function drip(cx, rootY, wr, neck, D, len) {
            const bulbR = D / 2, cyB = len - bulbR;
            for (let k = 0; k < len; k++) {
                const y = k + 0.5;
                const tStem = Math.min(1, y / Math.max(1, cyB * 0.8));
                let hs = y <= cyB ? neck / 2 + (wr / 2 - neck / 2) * (1 - smooth(tStem)) : 0;
                hs += 2.3 * Math.exp(-y / 1.7);
                const hb = Math.sqrt(Math.max(0, bulbR * bulbR - (y - cyB) ** 2));
                const h = Math.max(hs, hb, y <= cyB ? 1 : 0);
                const v = hb > 0 && hb >= hs - 0.2 ? 4 : 3;
                for (let x = Math.floor(cx - h - 1); x <= Math.ceil(cx + h + 1); x++) if (Math.abs(x + 0.5 - cx) <= h + 0.08) put(x, rootY + k, v);
            }
        }
        // A short one is only a swell: a soft rounded bulge under its lobe.
        function swell(cx, rootY, wr, len) {
            for (let k = 0; k < len; k++) {
                const t = (k + 0.5) / (len + 0.4);
                const h = (wr / 2 + 0.4) * Math.sqrt(Math.max(0, 1 - t * t));
                for (let x = Math.floor(cx - h - 1); x <= Math.ceil(cx + h + 1); x++) if (Math.abs(x + 0.5 - cx) <= h + 0.08) put(x, rootY + k, 4);
            }
        }

        /* THE DRIPS: from the fullest lobes, spaced out, each its own length.
           The list is made the same way whatever the animation asks for, so
           drip i is always the same drip. */
        const rw = stream("walk");
        const drips = [];
        let lastX = -99;
        for (const lb of [...lobes].sort((a, b) => a.c - b.c)) {
            const x = pad + lb.c;
            if (lb.c < R + 6 || lb.c > o.w - R - 6) continue;
            /* Spaced unevenly and not too many: a comb of like drips at a
               steady pitch is what reads as manufactured. Most are swells,
               some drip, now and then one runs long. */
            if (lb.a < (small ? 0.7 : 0.9) || x - lastX < (big ? 30 + rw() * 26 : 18 + rw() * 14) * (o.spacing || 1)) continue;
            if (rw() > (big ? 0.55 : small ? 0.42 : 0.48)) continue;
            const r = rw();
            const kind = r < 0.5 ? "short" : r < 0.86 || small ? "mid" : "long";
            const wr = Math.max(big ? 4 : 3, Math.min(big ? 7 : small ? 4 : 6, Math.round(lb.s * 1.25 + 0.5)));
            let len = kind === "short" ? 3 + Math.floor(rw() * 4) : kind === "mid" ? 10 + Math.floor(rw() * 12) : 22 + Math.floor(rw() * 22);
            if (!big) len = Math.round(len * (small ? 0.55 : 0.8));
            drips.push({ x, wr, len, kind, strand: false });
            lastX = x;
        }
        if (o.anim && drips[o.anim.i]) Object.assign(drips[o.anim.i], { kind: "mid", wr: 6, strand: false, len: o.anim.len, D: o.anim.D, neck: o.anim.neck, anim: true });

        const info = [];
        drips.forEach((d, di) => {
            if (d.anim && !d.len) return;
            if (hide && hide.has(di) && !d.anim) return;
            const cx = Math.round(d.x) + (d.wr % 2 ? 0.5 : 0);
            const cols = [-1, 0, 1].map((i) => below[Math.round(d.x) + i]).filter((v) => v != null);
            const rootY = cols.length ? Math.max(...cols) : E + 1;
            const D = d.D || Math.max(4, Math.min(10, d.wr + (d.kind === "long" ? 3 : 2) - (small ? 1 : 0)));
            let room = H;
            for (let xx = Math.floor(cx - D / 2 - 3); xx <= Math.ceil(cx + D / 2 + 3); xx++) room = Math.min(room, (floor[xx] ?? H) - 3);
            room -= rootY;
            const len = Math.min(d.len, room);
            const rec = { di, cx, rootY, room, wr: d.wr, strand: d.strand, kind: d.kind, D: 0, len };
            if (len < 2) { info.push(rec); return; }
            /* GOO AT REST HAS NO HANGING DROPS (the owner's, 25 Oct: still drops
               "look too phallic — remove any remaining"). A drip at rest is a
               short rounded swell; a drop is only ever one that is moving —
               it swells, lets go, falls and splats (slime, letGo). */
            if (!d.anim) { swell(cx, rootY, d.wr, Math.min(len, (small ? 3 : 4) + (d.kind === "short" ? 0 : 1))); info.push(rec); return; }
            if (len < D + 2) { swell(cx, rootY, d.wr, len); info.push(rec); return; }
            const neck = d.neck || (d.strand ? 2 : Math.max(2, Math.round(d.wr * 0.55)));
            drip(cx, rootY, d.wr, neck, D, len);
            Object.assign(rec, { D, dropTop: rootY + len - D });
            info.push(rec);
        });

        // Goo that went over a rounded corner and a little way down the side: a soft run, no drop on its end.
        const rr = stream("runs");
        for (const side of [0, 1]) {
            if (rr() > (o.sideRuns ?? 0.7) || (side ? sb < o.w : sa > 0)) continue;
            // Only where the goo on top actually reaches the corner: never a run on its own.
            let reaches = false;
            for (let k = 0; k <= R + 6 && !reaches; k++) reaches = depth[side ? pad + o.w - 1 - k : pad + k] > 0;
            if (!reaches) continue;
            const len = (big ? 5 : 3) + Math.floor(rr() * (big ? 4 : 3));
            const w = big ? 4 : 3;
            const cx = side ? pad + o.w : pad;
            const y0 = E + Math.round(R * 0.45);
            /* Round the corner: a ribbon of goo along the curve itself, from
               where the top run stops to where the side run starts, so the two
               are one piece of goo and never a run floating on its own. */
            const c0 = side ? pad + o.w - R - 3 : pad, c1 = side ? pad + o.w : pad + R + 3;
            for (let x = Math.floor(c0); x <= Math.ceil(c1); x++) {
                const e = edgeAt(x); if (e === null) continue;
                for (let y = e - 2; y <= e + 1; y++) put(x, y, 2);
            }
            for (let y = (edgeAt(Math.round(cx) - side) ?? E) - 1; y < y0; y++) for (let i = 0; i < w; i++) put(Math.round(cx - w / 2) + i, y, 2);
            swell(cx, y0, w + 1, len);
        }

        // Last, the outline itself is tidied: no lone pixels, no one-pixel notches.
        for (let pass = 0; pass < 2; pass++) {
            const src = m.slice();
            for (let y = 1; y < H - 1; y++) for (let x = Math.max(1, X0); x < Math.min(W - 1, X1); x++) {
                const i = y * W + x;
                const n = (src[i - 1] ? 1 : 0) + (src[i + 1] ? 1 : 0) + (src[i - W] ? 1 : 0) + (src[i + W] ? 1 : 0);
                if (!src[i] && n >= 3 && y < (floor[x] ?? H) - 2) m[i] = src[i - W] || src[i - 1] || src[i + 1] || src[i + W];
                else if (src[i] && n <= 1 && src[i] < 4) m[i] = 0;
            }
        }

        /* ---------- LIGHT ----------
           Each pixel's distance to the goo's edge gives it a thickness, as a
           rounded cross-section; the slope of that thickness gives it a
           surface direction; and that is lit from the upper left and front.
           So every lobe, drip and drop is shaded as the round thing it is,
           the same way, with a glint where the light catches it. */
        const dist = new Float32Array(W * H);
        const BIG = 1e9;
        for (let i = 0; i < W * H; i++) dist[i] = m[i] ? BIG : 0;
        const relax = (i, j, c) => { if (dist[j] + c < dist[i]) dist[i] = dist[j] + c; };
        for (let y = 0; y < H; y++) for (let x = X0; x < X1; x++) {
            const i = y * W + x; if (!m[i]) continue;
            if (x === 0 || y === 0) { dist[i] = Math.min(dist[i], 1); continue; }
            relax(i, i - 1, 1); relax(i, i - W, 1); relax(i, i - W - 1, 1.414); if (x < W - 1) relax(i, i - W + 1, 1.414);
        }
        for (let y = H - 1; y >= 0; y--) for (let x = X1 - 1; x >= X0; x--) {
            const i = y * W + x; if (!m[i]) continue;
            if (x === W - 1 || y === H - 1) { dist[i] = Math.min(dist[i], 1); continue; }
            relax(i, i + 1, 1); relax(i, i + W, 1); relax(i, i + W + 1, 1.414); if (x > 0) relax(i, i + W - 1, 1.414);
        }
        const R0 = big ? 3.4 : small ? 2.2 : 2.8;
        const ht = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) if (m[i]) { const d = Math.min(R0, dist[i] - 0.4) / R0; ht[i] = R0 * Math.sqrt(Math.max(0, 1 - (1 - Math.max(0, d)) ** 2)); }
        // Softened once, so the surface turns gradually and its tones come out as clean areas, not speckle.
        {
            const src = ht.slice();
            for (let y = 1; y < H - 1; y++) for (let x = Math.max(1, X0); x < Math.min(W - 1, X1); x++) {
                const i = y * W + x; if (!m[i]) continue;
                ht[i] = (4 * src[i] + 2 * (src[i - 1] + src[i + 1] + src[i - W] + src[i + W]) + src[i - W - 1] + src[i - W + 1] + src[i + W - 1] + src[i + W + 1]) / 16;
            }
        }
        const hAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : ht[y * W + x];
        const L = [-0.4, -0.55, 0.73], Ln = Math.hypot(...L); L[0] /= Ln; L[1] /= Ln; L[2] /= Ln;
        const Hv = [L[0], L[1], L[2] + 1], Hn = Math.hypot(...Hv); Hv[0] /= Hn; Hv[1] /= Hn; Hv[2] /= Hn;
        const px = new Array(W * H).fill(null);
        for (let y = 0; y < H; y++) for (let x = X0; x < X1; x++) {
            const i = y * W + x, v = m[i]; if (!v) continue;
            const gx = (hAt(x + 1, y) - hAt(x - 1, y)) / 2, gy = (hAt(x, y + 1) - hAt(x, y - 1)) / 2;
            const nl = Math.hypot(gx, gy, 1), n = [-gx / nl, -gy / nl, 1 / nl];
            const diff = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
            const spec = Math.pow(Math.max(0, n[0] * Hv[0] + n[1] * Hv[1] + n[2] * Hv[2]), 30);
            let tone = 0.22 + 0.78 * diff;
            // Jelly: light gathers in the lower half of a hanging drop.
            if ((v === 4 || v === 5) && n[1] > 0.15 && dist[i] > 1.6) tone += 0.14;
            let c = tone < 0.3 ? "D" : tone < 0.52 ? "S" : tone < 0.81 ? "B" : tone < 0.93 ? "M" : "L";
            if (spec > 0.55 && dist[i] > 1.2) c = "H";
            px[i] = c;
        }
        // A lone pixel of one tone among four of another takes theirs: clean areas, no salt and pepper.
        {
            const src = px.slice();
            for (let y = 1; y < H - 1; y++) for (let x = Math.max(1, X0); x < Math.min(W - 1, X1); x++) {
                const i = y * W + x, c = src[i]; if (!c || c === "H") continue;
                const n = [src[i - 1], src[i + 1], src[i - W], src[i + W]].filter(Boolean);
                if (n.length >= 3 && n.every((v) => v === n[0]) && n[0] !== c && n[0] !== "H") px[i] = n[0];
            }
        }
        // Glints stay small: a bright pixel or two, never a line along the crest.
        for (let y = 0; y < H; y++) {
            let runLen = 0;
            for (let x = X0; x <= X1; x++) {
                if (x < X1 && px[y * W + x] === "H") { runLen++; continue; }
                if (runLen > 3) for (let k = x - runLen + 3; k < x; k++) px[y * W + k] = "L";
                runLen = 0;
            }
        }

        // ---------- outline, and a soft shadow on whatever is underneath ----------
        const isG = (x, y) => at(x, y) !== 0;
        for (let y = 0; y < H; y++) for (let x = X0; x < X1; x++) {
            if (at(x, y)) continue;
            const below = isG(x, y + 1), right = isG(x + 1, y), above = isG(x, y - 1), left = isG(x - 1, y);
            if (below || right) px[y * W + x] = above || left ? "O" : "Q";
            else if (above || left) px[y * W + x] = "O";
        }
        // The picture: the whole edge, or in column mode just the column.
        const ox = o.only ? o.only[0] : 0, CW = o.only ? o.only[1] - o.only[0] : W;
        const cv = document.createElement("canvas");
        cv.width = CW; cv.height = H;
        const ctx = cv.getContext("2d");
        const img = ctx.createImageData(CW, H);
        for (let y = 0; y < H; y++) for (let x = ox; x < ox + CW; x++) {
            const i = y * W + x, j = (y * CW + x - ox) * 4, c = px[i];
            if (c) { const v = GOO[c]; img.data[j] = v[0]; img.data[j + 1] = v[1]; img.data[j + 2] = v[2]; img.data[j + 3] = 255; continue; }
            const e = edgeAt(x);
            if (e !== null && y <= e) continue;
            let a = 0;
            if (y && x && (px[i - W - 1] || (px[i - W] && px[i - 1]))) a = 0.4;
            else if (y > 1 && x > 1 && px[i - 2 * W - 2]) a = 0.18;
            if (a) { img.data[j] = 4; img.data[j + 1] = 10; img.data[j + 2] = 2; img.data[j + 3] = Math.round(a * 255); }
        }
        ctx.putImageData(img, 0, 0);
        return { canvas: cv, W, H, info };
    }

    // ---------- small sprites, one character a pixel ----------
    function sprite(rows, pal) {
        const w = Math.max(...rows.map(r => r.length)), h = rows.length;
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); } }));
        return cv;
    }
    const BAT_PAL = { x: "#0b0612", m: "#2b1a3a", e: "#ffcf3a", h: "#4b3266" };
    const BAT = [[
        "x.............x",
        "xh...........hx",
        "xmh...x.x...hmx",
        ".xmh..xxx..hmx.",
        ".xmmhxexexhmmx.",
        "..xmmxxxxxmmx..",
        "...xx.xxx.xx...",
        "......x.x......",
        "..............."], [
        "......x.x......",
        "......xxx......",
        ".....xexexh....",
        "..xhhxxxxxhhx..",
        ".xmmmmxxxmmmmx.",
        "xmmx.xxxxx.xmmx",
        "xmx...x.x...xmx",
        "xx...........xx",
        "x.............x"]];
    const GHOST_PAL = { o: "#5d5683", w: "#f5f3ff", g: "#cbc5ea", k: "#1a1326", p: "#f2a7c0" };
    const GHOST = [
        "....oooooo....",
        "..oowwwwwwoo..",
        ".owwwwwwwwwwo.",
        ".owwwwwwwwwgo.",
        "owwwkkwwkkwwgo",
        "owwwkkwwkkwwgo",
        "owwpwwwwwwpwgo",
        "owwwwwkkwwwwgo",
        "owwwwwkkwwwggo",
        "owwwwwwwwwwggo",
        "owwwwwwwwwwggo",
        "owwwwwwwwwgggo",
        "owwgwwwwwwgggo",
        "owgo.owwo.ogo.",
        ".oo...oo...o.."];
    const SPIDER_PAL = { x: "#0b0612", h: "#3a2a4a", r: "#ff3b2f" };
    const SPIDER = [
        "x...x.x...x",
        ".x..x.x..x.",
        "..x.hxh.x..",
        "xx.xxxxx.xx",
        "..xxrxrxx..",
        ".x.xxxxx.x.",
        "x..x.x.x..x",
        "..x.....x.."];
    const HAT_PAL = { k: "#0b0612", p: "#3d2456", l: "#6a3f8f", g: "#78d832", G: "#3f8f18", y: "#ffd34d" };
    const HAT = [
        "......................kk......",
        "....................kklk......",
        "..................kklpk.......",
        "................kklppk........",
        "...............klpppk.........",
        "..............klppppk.........",
        ".............klpppppk.........",
        "............klppppppk.........",
        "...........klpppppppk.........",
        "..........klppppppppk.........",
        "..........kGGGGGGGGGGk........",
        ".........kGgyyyyygggGk........",
        ".........kGgyGGGygggGk........",
        ".........kGgyyyyygggGk........",
        "...kkkkkkklppppppppppkkkkkkk..",
        "..klllllpppppppppppppppppppk..",
        "...kkkkkkkkkkkkkkkkkkkkkkkk..."];

    // A cobweb: spokes from a corner, threads sagging between them.
    function cobweb(size, flipX, seed) {
        const rand = prng(seed);
        const pts = new Map();
        const plot = (x, y, a) => {
            x = Math.round(x); y = Math.round(y);
            if (x < 0 || y < 0 || x >= size || y >= size) return;
            const k = y * size + x; pts.set(k, Math.max(pts.get(k) || 0, a));
        };
        const line = (x0, y0, x1, y1, a) => {
            const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
            for (let i = 0; i <= n; i++) plot(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, a);
        };
        const spokes = [];
        for (let i = 0; i < 5; i++) {
            const ang = (i / 4) * Math.PI / 2 + (rand() - 0.5) * 0.12, len = size * (0.82 + rand() * 0.18);
            spokes.push([Math.cos(ang), Math.sin(ang)]);
            line(0, 0, Math.cos(ang) * len, Math.sin(ang) * len, 0.62);
        }
        for (const rr of [0.22, 0.38, 0.55, 0.72, 0.88]) for (let i = 0; i < 4; i++) {
            const [ax, ay] = spokes[i], [bx, by] = spokes[i + 1];
            const ra = size * rr * (0.95 + rand() * 0.1), rb = size * rr * (0.95 + rand() * 0.1);
            const A = [ax * ra, ay * ra], B = [bx * rb, by * rb];
            let prev = A;
            for (let s = 1; s <= 24; s++) {
                const t = s / 24, sag = Math.sin(Math.PI * t) * size * rr * 0.12;
                const P = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], len = Math.hypot(P[0], P[1]);
                const Q = [P[0] - P[0] / len * sag, P[1] - P[1] / len * sag];
                line(prev[0], prev[1], Q[0], Q[1], 0.42);
                prev = Q;
            }
        }
        const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
        const ctx = cv.getContext("2d"), img = ctx.createImageData(size, size);
        for (const [k, a] of pts) {
            const x = flipX ? size - 1 - (k % size) : k % size, y = Math.floor(k / size);
            img.data.set([226, 222, 240, Math.round(a * 255)], (y * size + x) * 4);
        }
        ctx.putImageData(img, 0, 0);
        return cv;
    }

    function moon(r) {
        const s = r * 2 + 14, c = s / 2;
        const cv = document.createElement("canvas"); cv.width = s; cv.height = s;
        const ctx = cv.getContext("2d"), img = ctx.createImageData(s, s);
        const craters = [[-0.35, -0.2, 0.22], [0.25, 0.3, 0.16], [0.3, -0.38, 0.11], [-0.1, 0.45, 0.09], [-0.5, 0.25, 0.08], [0.05, -0.05, 0.07]];
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
            let col = null;
            if (d <= r) {
                const l = ((dx + 0.35 * r) ** 2 + (dy + 0.35 * r) ** 2) / (r * 1.35) ** 2;
                col = l < 0.28 ? [252, 248, 224] : l < 0.62 ? [238, 231, 192] : l < 0.95 ? [222, 213, 170] : [204, 194, 150];
                for (const [cx, cy, cr] of craters) {
                    const q = Math.hypot(dx - cx * r, dy - cy * r);
                    if (q <= cr * r) col = q > cr * r - 1.2 && (dx - cx * r + dy - cy * r) < 0 ? [196, 186, 142] : [222, 213, 170];
                }
                if (d > r - 1) col = [186, 176, 132];
                col.push(255);
            } else if (d <= r + 2) col = [236, 240, 200, 90];
            else if (d <= r + 4) col = [236, 240, 200, 46];
            else if (d <= r + 7) col = [236, 240, 200, 18];
            if (col) img.data.set(col, (y * s + x) * 4);
        }
        ctx.putImageData(img, 0, 0);
        return cv;
    }

    // ---------- the bookkeeping: everything made is remembered, so stop() can undo it ----------
    let on = false;
    const added = new Set();
    const restore = new Map();          // element -> { prop: old value } for styles this file set
    const hosts = new Map();            // host -> { width, key, draw, keyOf, pieces }
    const timers = [];
    let ro = null, mo = null, rafId = 0;
    const tickers = new Set();          // per-frame painters (the ghost)

    function setStyle(el, prop, value) {
        const r = restore.get(el) || {};
        if (!(prop in r)) r[prop] = el.style[prop];
        restore.set(el, r);
        el.style[prop] = value;
    }
    function ensurePositioned(el) { if (getComputedStyle(el).position === "static") setStyle(el, "position", "relative"); }
    function borders(el) {
        const c = getComputedStyle(el);
        return { t: parseFloat(c.borderTopWidth) || 0, l: parseFloat(c.borderLeftWidth) || 0, r: parseFloat(c.borderRightWidth) || 0, b: parseFloat(c.borderBottomWidth) || 0 };
    }
    const radiusOf = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;

    const UNITLESS = new Set(["zIndex", "opacity"]);
    function piece(host, canvas, cls, place) {
        const s = document.createElement("span");
        s.className = "hw-piece " + (cls || "");
        s.setAttribute("aria-hidden", "true");
        s.style.width = canvas.width + "px"; s.style.height = canvas.height + "px";
        s.style.backgroundImage = "url(" + canvas.toDataURL() + ")";
        // A number is pixels, except where the property has no unit (a z-index
        // given as 40 became "40px", which the browser drops, so no piece's
        // stacking ever applied).
        for (const k in place) s.style[k] = typeof place[k] === "number" && !UNITLESS.has(k) ? place[k] + "px" : place[k];
        host.appendChild(s);
        added.add(s);
        return s;
    }

    /* A host is drawn by a function of its width (and, for a window whose
       contents are swapped, a key): when either changes it is drawn again. */
    function host(el, draw, keyOf) {
        if (hosts.has(el)) { const rec = hosts.get(el); if (keyOf && keyOf(el) !== rec.key) { rec.width = -1; redraw(el); } return; }
        hosts.set(el, { width: -1, key: null, draw, keyOf, pieces: [] });
        redraw(el);
        if (ro) ro.observe(el);
    }
    function redraw(el) {
        const rec = hosts.get(el);
        if (!rec) return;
        const w = Math.round(el.offsetWidth), key = rec.keyOf ? rec.keyOf(el) : null;
        if (w === rec.width && key === rec.key) return;
        rec.pieces.forEach((p) => { p.remove(); added.delete(p); });
        rec.pieces = [];
        rec.width = w; rec.key = key;
        if (!w) return;
        const before = new Set(added);
        rec.draw(el, w);
        for (const p of added) if (!before.has(p)) rec.pieces.push(p);
    }

    /* What a drip must not cover, inside `scope`: its text, its icons and
       form fields (wholly), and its larger pictures (all but their top
       22px). As per-column limits on the canvas whose top left is (ox, oy)
       in the viewport: floor[x] for things below the edge, ceil[x] for
       things above it. */
    function limits(scope, ox, oy, W, H, edgeY) {
        const floor = new Array(W).fill(H), ceil = new Array(W).fill(0);
        const mark = (r, giveTop) => {
            if (!r.width || !r.height || r.right < ox || r.left > ox + W || r.bottom < oy || r.top > oy + H) return;
            const x0 = Math.max(0, Math.floor(r.left - ox) - 1), x1 = Math.min(W - 1, Math.ceil(r.right - ox) + 1);
            const ty = Math.floor(r.top + giveTop - oy), by = Math.ceil(r.bottom - oy);
            for (let x = x0; x <= x1; x++) {
                if (ty >= edgeY - 1) floor[x] = Math.min(floor[x], ty - 1);
                else if (by > 0) ceil[x] = Math.max(ceil[x], Math.min(edgeY, by + 1));
            }
        };
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        while (walker.nextNode()) {
            const n = walker.currentNode, el = n.parentElement;
            if (!n.nodeValue.trim() || !el || el.closest(".hw-piece")) continue;
            if (getComputedStyle(el).visibility === "hidden") continue;
            range.selectNodeContents(n);
            for (const r of range.getClientRects()) mark(r, 0);
        }
        scope.querySelectorAll("img, svg, input, select, textarea, video, [class*=icon]").forEach((el) => {
            if (el.classList.contains("hw-piece") || el.matches(".window-peek-rat, .window-sleep-rat")) return;
            const r = el.getBoundingClientRect();
            const icon = r.width < 72 && r.height < 72;
            mark(r, icon || el.matches("input, select, textarea, [class*=icon]") ? 0 : r.width > 200 ? 22 : 9);
        });
        // Small buttons drawn as pictures (a window's close box): wholly.
        scope.querySelectorAll("button").forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 40 && r.height < 40) mark(r, 0);
        });
        return { floor, ceil };
    }

    /* Goo on el's top edge, as a piece of `into` (el itself unless it clips,
       when its parent). The one drip with the most room may be animated: the
       picture is drawn without it and its column becomes a strip of frames. */
    function slime(el, w, o) {
        const into = o.into || el;
        ensurePositioned(into);
        const pad = o.pad ?? 6, up = o.up ?? 11, down = o.down ?? 60;
        const er = el.getBoundingClientRect(), ir = into.getBoundingClientRect(), ib = borders(into);
        const ox = er.left - pad, oy = er.top - up, W = w + pad * 2, H = up + down;
        const lim = limits(o.scope || el, ox, oy, W, H, up);
        const spec = Object.assign({ w, r: o.r ?? radiusOf(el), pad, up, down, floor: lim.floor, ceil: lim.ceil, seed: hash((o.key || el.id || el.className) + ":" + w) }, o);
        const place = { left: ox - ir.left - ib.l + into.scrollLeft, top: oy - ir.top - ib.t + into.scrollTop, zIndex: o.z ?? 3 };
        let g = goo(spec);
        /* THE ANIMATED DRIPS (the owner's, 25 Oct: "more animated drops and
           splats"): up to o.animate of them (a number; true is one), the ones
           with room to stretch, at least 44px apart, nearest the middle first.
           Each is left out of the still picture and gets a column of frames of
           its own, at its own point in the cycle. */
        const want = o.animate === true ? 1 : (o.animate | 0);
        const chosen = [];
        if (want) {
            const pool = g.info.filter((d) => d.room >= 16 && d.cx > 12 && d.cx < W - 12)
                .sort((a, b) => Math.abs(a.cx - W / 2) - Math.abs(b.cx - W / 2));
            for (const d of pool) {
                if (chosen.length >= want) break;
                if (!chosen.some((c) => Math.abs(c.cx - d.cx) < 44)) chosen.push(d);
            }
        }
        if (!chosen.length) return piece(into, g.canvas, "hw-goo", place);
        const hidden = new Set(chosen.map((d) => d.di));
        g = goo(Object.assign({}, spec, { hide: hidden }));
        const gctx = g.canvas.getContext("2d");
        chosen.forEach((d) => gctx.clearRect(Math.round(d.cx) - 10, 0, 20, H));
        const base = piece(into, g.canvas, "hw-goo", place);
        chosen.forEach((cand, n) => animateDrip(into, o.scope || el, spec, place, cand, hidden, H, n));
        return base;
    }

    /* ONE DRIP'S ANIMATION, 48 frames of 0.15s: it swells a pixel at a time,
       slowly and then faster as the weight builds (36 frames), thins at the
       neck at the last, springs back when the drop lets go (4 frames), and
       rests as a swell (8). Frame 36 is the moment it lets go: the drop is
       then its own piece, falling under gravity to the edge beneath it and
       splatting there (letGo). The frames are stepped by the drip clock, so
       the moment of letting go is known exactly. A short drip (little room
       under it, a row's) makes a smaller drop. */
    function animateDrip(into, scope, spec, place, cand, hidden, H, n) {
        const M = Math.max(8, Math.min(28, cand.room - 8)), roomy = M >= 16;
        const FRAMES = [];
        for (let i = 0; i < RELEASE; i++) FRAMES.push({ len: Math.round(3 + (M - 3) * Math.pow(i / (RELEASE - 1), 2.1)),
            D: roomy ? (i < 12 ? 6 : i < 24 ? 8 : 9) : (i < 18 ? 5 : 6), neck: i < 33 ? (roomy ? 5 : 4) : 3 });
        [Math.round(M * 0.42), Math.round(M * 0.2) + 2, 5, 4].forEach((len) => FRAMES.push({ len: Math.max(3, len), D: 6, neck: 5 }));
        for (let i = 0; i < 8; i++) FRAMES.push({ len: 3, D: 6, neck: 5 });
        const c0 = Math.round(cand.cx) - 10, cw = 20, col = [c0, c0 + cw];
        // A frame, drawn once for each distinct stage (the rest and spring-back frames repeat).
        const drawn = new Map();
        const frame = (fr) => {
            const k = fr.len + ":" + fr.D + ":" + fr.neck;
            if (!drawn.has(k)) drawn.set(k, goo(Object.assign({}, spec, { hide: hidden, only: col, anim: Object.assign({ i: cand.di }, fr) })));
            return drawn.get(k);
        };
        /* At once, the drip at rest, so the edge is whole from the first paint;
           its forty-eight frames are drawn after, in idle time, one drip at a
           time, and it starts to move when they are ready. Drawing them all up
           front held the page for two seconds. */
        const strip = piece(into, frame(FRAMES[FRAMES.length - 1]).canvas, "hw-drip", Object.assign({}, place, { left: place.left + c0, width: cw }));
        const d = { strip, drop: null, D: 6, cw, into, scope, off: hash(spec.seed + ":" + n) % CYCLE, last: -1, ready: false };
        dripping.add(d);
        idle(() => {
            if (!on || !strip.isConnected) return;
            const sheet = document.createElement("canvas"); sheet.width = cw * FRAMES.length; sheet.height = H;
            const sctx = sheet.getContext("2d");
            FRAMES.forEach((fr, k) => sctx.drawImage(frame(fr).canvas, k * cw, 0));
            strip.style.width = cw + "px";
            strip.style.backgroundImage = "url(" + sheet.toDataURL() + ")";
            // The drop that lets go: cut from the last full frame, so it is the very same drop.
            const full = frame(FRAMES[RELEASE - 1]);
            const rec = full.info.find((x) => x.di === cand.di);
            if (rec && rec.D) {
                d.D = rec.D;
                const y0 = rec.dropTop - 1, dh = rec.D + 4;
                const dc = document.createElement("canvas"); dc.width = cw; dc.height = dh;
                dc.getContext("2d").drawImage(full.canvas, 0, y0, cw, dh, 0, 0, cw, dh);
                d.drop = piece(into, dc, "hw-fall", Object.assign({}, place, { left: place.left + c0, top: place.top + y0 }));
            }
            d.ready = true;
            runDrips();
        });
    }

    // Work for when the page is idle, one job at a time, so nothing holds up a frame.
    const idleJobs = [];
    let idleBusy = false;
    function idle(job) {
        idleJobs.push(job);
        if (idleBusy) return;
        idleBusy = true;
        const next = () => {
            const job = idleJobs.shift();
            if (!job) { idleBusy = false; return; }
            try { job(); } finally {
                if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 400 });
                else later(next, 16);
            }
        };
        if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 400 }); else later(next, 16);
    }

    /* ---------- THE DRIP CLOCK ----------
       Every animated drip on the page, stepped through its frames on one
       requestAnimationFrame, each at its own point in the cycle. Frame
       RELEASE is the moment its drop lets go. For reduced motion: the drip
       rests at a mid frame, and nothing falls. */
    const CYCLE = 7200, FRAME_MS = 150, RELEASE = 36, GRAVITY = 1500, MIN_FALL = 40;
    const dripping = new Set();
    let dripRaf = 0;
    const pend = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { pend.delete(t); fn(); }, ms); pend.add(t); };
    function runDrips() {
        if (reduceMq.matches) { dripping.forEach((d) => { if (d.ready) d.strip.style.backgroundPositionX = (-14 * d.cw) + "px"; }); return; }
        if (dripRaf || !dripping.size) return;
        const tick = (now) => {
            dripRaf = dripping.size ? requestAnimationFrame(tick) : 0;
            dripping.forEach((d) => {
                if (!d.strip.isConnected) { dripping.delete(d); return; }
                if (!d.ready) return;
                const f = Math.floor(((now + d.off) % CYCLE) / FRAME_MS);
                if (f === d.last) return;
                d.strip.style.backgroundPositionX = (-f * d.cw) + "px";
                // Letting go, seen as it happens (not on the first frame drawn, mid-cycle).
                if (d.last !== -1 && d.last < RELEASE && f >= RELEASE && d.drop) letGo(d);
                d.last = f;
            });
        };
        dripRaf = requestAnimationFrame(tick);
    }

    /* THE DROP LETS GO and falls under gravity to the edge beneath it, and
       splats there (the owner's: "the drop should fall down to whatever
       frame/button edge is beneath it and splat — not the first edge it
       finds, that would be too close"). Where it lands is worked out at the
       moment it lets go, so a list scrolled since still gets it right. */
    function letGo(d) {
        const drop = d.drop, r = drop.getBoundingClientRect();
        if (!r.width) return;
        const x = r.left + r.width / 2, bottom = r.top + 1 + d.D;
        const land = landing(d.scope, x, bottom);
        const dist = Math.max(6, Math.round(land - bottom));
        drop.style.opacity = "1";
        // Falling from rest: distance grows with the square of time, which this curve is exactly.
        const ms = Math.sqrt(2 * dist / GRAVITY) * 1000;
        drop.animate([{ transform: "translateY(0)" }, { transform: "translateY(" + dist + "px)" }],
            { duration: ms, easing: "cubic-bezier(0.333, 0, 0.667, 0.333)" });
        // Landing on a timer of the fall's own length, not the animation's finish
        // event, which waits on a painted frame (a background tab never sends it).
        later(() => { drop.style.opacity = "0"; if (on && d.strip.isConnected) splat(d.into, x, land, d.D); }, ms);
    }

    /* Where it lands: the top edge of the nearest frame, row, button, tab
       or field under it that is at least MIN_FALL below — so not the frame
       edge just under the window's top, but the next thing down — and that
       can be seen (not scrolled out of a list). Failing all of that, a
       little way down. */
    const SURFACES = "button, .btn, [class*='btn'], [class*='tab'], .chrome-list-row, .chrome-frame, [class*='frame'], [class*='card'], [class*='panel'], input, select, textarea, [class*='badge']";
    function landing(scope, x, y0) {
        let best = Infinity;
        scope.querySelectorAll(SURFACES).forEach((el) => {
            if (el.closest(".hw-piece") || !el.offsetWidth) return;
            const r = el.getBoundingClientRect();
            if (x < r.left + 3 || x > r.right - 3 || r.top < y0 + MIN_FALL || r.top >= best || r.top > innerHeight) return;
            if (!shown(el, r.top, scope)) return;
            best = r.top;
        });
        if (best === Infinity) best = Math.min(scope.getBoundingClientRect().bottom - 4, y0 + 120);
        return best;
    }
    // A top edge that can be seen: inside every box between it and the scope that clips.
    function shown(el, top, scope) {
        for (let p = el.parentElement; p && p !== scope; p = p.parentElement) {
            if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowY)) continue;
            const pr = p.getBoundingClientRect();
            if (top < pr.top || top > pr.bottom - 2) return false;
        }
        return true;
    }

    /* THE SPLAT, in five frames: it lands and squashes flat, two droplets
       jump out and up, come down either side, and the puddle sits there
       for a moment before fading. Drawn once per drop size, shaded in the
       goo's own colours: lit on top, outlined. */
    const splatSheets = new Map();
    function splatSheet(D) {
        if (splatSheets.has(D)) return splatSheets.get(D);
        const w = D + 26, h = 13, cx = w / 2, base = h - 1, r0 = D / 2;
        /* Per frame: the puddle's half-width and height, how high its two
           ends rise (the crown), and the droplets — [dx, height off the
           surface], or [dx, 0, true] for one that has landed as a bead. */
        const F = [
            { bw: r0 + 1.5, bh: 4, rim: 0, drops: [] },                                                   // squashed on impact
            { bw: r0 + 3.5, bh: 3, rim: 1, drops: [[-(r0 + 5), 5], [r0 + 5, 6]] },                        // spreads; two jump out
            { bw: r0 + 5, bh: 3, rim: 2, drops: [[-(r0 + 8), 7], [r0 + 8, 8]] },                          // the crown, droplets at the top
            { bw: r0 + 5.5, bh: 2, rim: 1, drops: [[-(r0 + 10), 3], [r0 + 10, 3]] },                      // falling back
            { bw: r0 + 5.5, bh: 2, rim: 0, drops: [[-(r0 + 11), 0, true], [r0 + 11, 0, true]] }          // settled, two beads beside it
        ];
        const cv = document.createElement("canvas"); cv.width = w * F.length; cv.height = h;
        const ctx = cv.getContext("2d");
        F.forEach((fr, k) => {
            const grid = new Array(w * h).fill(null);
            const set = (x, y, c) => { if (x >= 0 && x < w && y >= 0 && y < h) grid[y * w + x] = c; };
            // the puddle: a flattened half-ellipse on the surface, its two ends lifted into a crown
            const hwAt = (y) => fr.bw * Math.sqrt(Math.max(0, 1 - ((y + 0.5) / fr.bh) ** 2 * 0.85));
            for (let y = 0; y < fr.bh; y++) {
                const hw = hwAt(y);
                for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) set(x, base - y, "B");
            }
            for (let j = 1; j <= fr.rim; j++) for (const side of [-1, 1]) {
                const x = Math.round(cx + side * (fr.bw - 1.5)) - (side < 0 ? 0 : 1);
                set(x, base - fr.bh + 1 - j, "B"); set(x + side, base - fr.bh + 1 - j + 1, "B");
            }
            // the droplets: two by two (with the outline, a round drop at this size), or a two-pixel bead where one has landed
            for (const [dx, up, bead] of fr.drops) {
                const x = Math.round(cx + dx), y = base - up;
                if (bead) { set(x, base, "B"); set(x + 1, base, "B"); continue; }
                set(x, y, "B"); set(x + 1, y, "B"); set(x, y + 1, "B"); set(x + 1, y + 1, "B");
            }
            // shade it as the round things they are: lit from the upper left, darker underneath
            const lit = grid.slice();
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if (!grid[y * w + x]) continue;
                const above = y > 0 && grid[(y - 1) * w + x], left = x > 0 && grid[y * w + x - 1], below = y < h - 1 && grid[(y + 1) * w + x];
                lit[y * w + x] = !above ? (x < cx ? "L" : "M") : !left ? "M" : (!below && y < base) || y === base && x > cx + 1 ? "S" : "B";
            }
            // a glint on the puddle, left of centre
            if (fr.bh >= 3) lit[(base - fr.bh + 2) * w + Math.round(cx - fr.bw * 0.4)] = "H";
            // one dark outline round the lot, never below the surface line
            const out = lit.slice();
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if (lit[y * w + x]) continue;
                const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => x + i >= 0 && x + i < w && y + j >= 0 && y + j < h && lit[(y + j) * w + x + i]);
                if (n) out[y * w + x] = "O";
            }
            out.forEach((c, i) => { if (!c) return; ctx.fillStyle = "rgb(" + GOO[c].join(",") + ")"; ctx.fillRect(k * w + (i % w), Math.floor(i / w), 1, 1); });
        });
        const rec = { url: cv.toDataURL(), w, h, n: F.length };
        splatSheets.set(D, rec);
        return rec;
    }
    function splat(into, x, landY, D) {
        const s = splatSheet(D), ir = into.getBoundingClientRect(), b = borders(into);
        const el = document.createElement("span");
        el.className = "hw-piece hw-splat"; el.setAttribute("aria-hidden", "true");
        // Its bottom row on the surface's top edge: the puddle sits on it.
        el.style.cssText = "left:" + Math.round(x - ir.left - b.l + into.scrollLeft - s.w / 2) + "px;top:" + Math.round(landY - ir.top - b.t + into.scrollTop - s.h) +
            "px;width:" + s.w + "px;height:" + s.h + "px;background-image:url(" + s.url + ");z-index:40";
        into.appendChild(el); added.add(el);
        let f = 0;
        const step = () => {
            if (!el.isConnected) return;
            el.style.backgroundPositionX = (-f * s.w) + "px";
            if (++f < s.n) later(step, [60, 80, 110, 90][f - 1] || 80);
            else later(() => { el.style.opacity = "0"; later(() => { el.remove(); added.delete(el); }, 700); }, 1200);
        };
        step();
    }

    // A cobweb spun inside an inner frame's top corner: under its content, cut to its curve.
    function innerWeb(frame, side, size, seed) {
        ensurePositioned(frame);
        setStyle(frame, "isolation", "isolate");
        const cs = getComputedStyle(frame);
        const bw = parseFloat(cs.borderTopWidth) || 0;
        const r = Math.max(0, (parseFloat(side === "left" ? cs.borderTopLeftRadius : cs.borderTopRightRadius) || 0) - bw);
        const web = cobweb(size, side === "right", seed);
        const ctx = web.getContext("2d"), img = ctx.getImageData(0, 0, size, size);
        for (let y = 0; y < r; y++) for (let x = 0; x < size; x++) {
            const cx = side === "right" ? size - 1 - x : x;
            if (cx < r && Math.hypot(r - (cx + 0.5), r - (y + 0.5)) > r) img.data[(y * size + x) * 4 + 3] = 0;
        }
        ctx.putImageData(img, 0, 0);
        return piece(frame, web, "hw-web", { top: 0, [side]: 0, zIndex: -1 });
    }

    // ---------- what goes where ----------
    /* A row gets one or two short pours, not a strip along its whole top:
       poured goo gathers where it lands and drips from there. A pour that
       starts near an end goes over the corner. Some rows stay clean. */
    const rowLook = (key) => {
        const r = prng(hash(key)), look = r();
        const pour = (from, to) => {
            const a = from + r() * (to - from), b = Math.min(1, a + 0.2 + r() * 0.2);
            return [a < from + 0.06 && from === 0 ? 0 : a, b > 0.95 ? 1 : b];
        };
        if (look < 0.25) return [];
        if (look < 0.75) return [pour(0, 0.62)];
        return [pour(0, 0.3), pour(0.52, 0.72)];
    };

    function decorateWindows() {
        document.querySelectorAll(".chrome-window, .modal").forEach((win) => {
            if (!win.offsetWidth) return;
            const isModal = win.classList.contains("modal");
            const keyOf = (el) => isModal ? "modal:" + ((el.querySelector(".chrome-titlebar") || el).textContent || "").trim().slice(0, 60) : el.id || "window";
            host(win, (el, w) => {
                const b = borders(el);
                // The peeking rat stays on top of the goo, its paws over it, and the goo stays low under it.
                const peek = el.querySelector(":scope > .window-peek-rat");
                const clamp = [];
                if (peek && peek.offsetWidth) {
                    setStyle(peek, "zIndex", "41");
                    clamp.push({ x0: peek.offsetLeft + b.l + peek.offsetWidth * 0.12, x1: peek.offsetLeft + b.l + peek.offsetWidth * 0.95, max: 1 });
                }
                slime(el, w, { size: "big", r: 12, pad: 8, up: 15, down: isModal ? 90 : 80, key: keyOf(el), z: 40, animate: 3, clamp });
                if (peek && peek.offsetWidth) {
                    const k = peek.offsetWidth / 78;
                    piece(el, sprite(HAT, HAT_PAL), "hw-hat", { left: Math.round(peek.offsetLeft + 37 * k), top: Math.round(peek.offsetTop - 7 * k), zIndex: 42 });
                }
                // The moon beside the archive. (A maze window's skull candle went, 25 Oct: the owner's "remove that".)
                if (el.id === "browse-window" && innerWidth >= 1100 && !EMBED) night(el, b);
            }, keyOf);
        });
    }

    /* The moon in the sky beside the archive window, placed from its outer
       corner. A piece of the page rather than of the window, so when the bat
       game clears the stage it stays up in the sky while the window goes. */
    function night(win, b) {
        const r = win.getBoundingClientRect();
        const mx = Math.round(r.left + scrollX) - 216, my = Math.round(r.top + scrollY) - 67;
        /* MOONLIGHT (the owner's: "some nice glow and highlights caused by the
           moon"). Two still layers behind everything on the page (z-index -1,
           over the page's own background, under its content): a halo round
           the moon, and a faint cool wash spreading from it down and to the
           right across the page. The lit edges it makes are in the
           stylesheet (the top and left of windows and the title, which face
           it). Nothing here moves or repaints. */
        const cx = mx + 33, cy = my + 33;     // the moon's centre: moon(26) is 66px square
        const glow = (cls, size, bg) => {
            const s = document.createElement("span");
            s.className = "hw-piece " + cls; s.setAttribute("aria-hidden", "true");
            Object.assign(s.style, { left: (cx - size / 2) + "px", top: (cy - size / 2) + "px", width: size + "px", height: size + "px", zIndex: "-1", background: bg });
            document.body.appendChild(s); added.add(s);
        };
        // The wash covers the page exactly (never past its edge, where it would add a scrollbar), lit from the moon's centre.
        const wash = document.createElement("span");
        wash.className = "hw-piece hw-moonwash"; wash.setAttribute("aria-hidden", "true");
        Object.assign(wash.style, { left: "0", top: "0", width: document.documentElement.clientWidth + "px", height: document.documentElement.scrollHeight + "px", zIndex: "-1",
            background: `radial-gradient(circle 1200px at ${cx}px ${cy}px, rgba(150, 175, 255, 0.11), rgba(150, 175, 255, 0.05) 45%, rgba(150, 175, 255, 0) 100%)` });
        document.body.appendChild(wash); added.add(wash);
        glow("hw-moonglow", 300, "radial-gradient(closest-side, rgba(238, 240, 214, 0.30), rgba(220, 228, 255, 0.12) 40%, rgba(200, 215, 255, 0) 100%)");
        piece(document.body, moon(26), "hw-moon", { left: mx, top: my, zIndex: 0 });
    }

    /* BATS, gliding about the page: each comes in from off one edge, wanders
       for a while on smooth curving paths, steering toward one loose point
       after another with a limited turn, its speed easing up and down, and
       then heads off another edge. They flap all the while but never bob:
       the flight is all in the path. A few at a time, near ones larger and
       quicker, far ones (one in four) smaller and slower. One fixed canvas under the
       top bar, drawn at whole pixels so they stay crisp; nothing flies for
       reduced motion.

       Two things kept bats circling low on the page for good (fixed 25 Oct
       2026): the bottom "exit" was worked out as 85% of the screen plus 50px,
       which on most screens is still ON it, so a leaving bat never left; and a
       bat steering at a point inside its own turning circle orbits it for
       ever. Exits are now all truly off screen, a bat counts as arrived
       anywhere inside its turning circle, and it gives up on any point it has
       chased for five seconds.

       THE SECRET GAME (the owner's, 25 Oct 2026): click a bat and it stops
       dead, flips upside down and drops off the bottom of the page, for 100
       points (150 for a small, far one), and a score counter appears. Once that is showing, a click that
       misses a bat it was aimed at (within MISS_R of one) costs MISS points;
       clicks anywhere else are the page's, and cost nothing. A hit takes its
       click, so a bat over a link is not also a click on the link. A game lasts
       the page (a reload starts afresh, the owner's); the best is kept
       (localStorage).

       IT GETS HARDER (the owner's): only once it has started (the first hit),
       the longer it has been going the more bats there are at once, the
       sooner the next arrives and the quicker they fly.
       Clicking the score opens a card to copy or save (shareCard below).

       NOT ON FALLIN' FURNI'S GAME, where a full-screen layer redrawn every
       frame would sit over the room and cost a real-time game its frames:
       none on /fallinfurni/play, and none in the homepage's game window
       (html.ff-embed), whose page outside already has its own. Nor a hit
       through anything stacked over the bats (a window, the console, the
       game window): those clicks are theirs. And only on the homepage
       (PLAYABLE). */
    const HIT = 100, HIT_SMALL = 150, MISS = 25, MISS_R = 60;
    const BEST_KEY = "mazerats_batgame_best";
    const EMBED = document.documentElement.classList.contains("ff-embed");
    const GAME_PAGE = EMBED || /^\/fallinfurni\/play\/?$/.test(location.pathname) || !!document.getElementById("ff-canvas");
    /* The game is the homepage's alone (the owner's): body[data-page="home"],
       which a maze's own address (/maze/...) is too, as that is the homepage
       with the maze's window open. Everywhere else the bats are scenery: no
       listeners are added, so every click is the page's. */
    let PLAYABLE = false;     // read in decorateBats, once the body is there
    const ABOVE_BATS = ".site-header, .modal-overlay, .console-modal, .ff-console, #ff-overlay, .hw-batscore, .hw-share";
    /* THE SHARE CARD (the owner's): the score as a picture to copy or save,
       "Defeated 50 bats on MazeRats.net! / Scoring / 5,130 points!", on a
       night sky with the moon and a few bats (two
       of them shot). Drawn at a pixel art 360x200, in Volter at 9px and its
       multiples only, and handed over at twice that, every pixel a clean
       2x2 block, which is the size the window shows it: any other scale
       there blurs the small type. In the site's own window, as the Mazer Card is. */
    const CARD_W = 360, CARD_H = 200, CARD_K = 2;
    function drawCard({ score, kills }) {
        const fmt = (n) => n.toLocaleString("en-GB");
        const cv = document.createElement("canvas"); cv.width = CARD_W; cv.height = CARD_H;
        let g = cv.getContext("2d"); g.imageSmoothingEnabled = false;
        // The sky, darkest at the top, in ten small flat steps, and a scatter of stars.
        for (let i = 0; i < 10; i++) { const t = i / 9; g.fillStyle = "rgb(" + [18 + 16 * t, 10 + 11 * t, 26 + 22 * t].map(Math.round) + ")"; g.fillRect(0, i * 20, CARD_W, 20); }
        const r = prng(hash("card:" + kills));
        g.fillStyle = "rgba(240,232,255,0.7)";
        for (let i = 0; i < 26; i++) g.fillRect(Math.floor(r() * CARD_W), 24 + Math.floor(r() * (CARD_H - 40)), 1, 1);
        g.drawImage(moon(16), CARD_W - 62, 20);
        // Bats: two flying, two shot and falling (turned over, wings down).
        const bat = (x, y, k, f, shot) => {
            const s = sprite(BAT[f], BAT_PAL);
            g.save(); g.translate(x, y); if (shot) g.scale(1, -1);
            g.drawImage(s, -Math.round(s.width * k / 2), -Math.round(s.height * k / 2), s.width * k, s.height * k); g.restore();
        };
        bat(36, 58, 2, 0, false); bat(300, 118, 1, 1, false); bat(70, 150, 1, 1, true); bat(318, 160, 2, 1, true);
        // The art twice over, nearest neighbour.
        const out = document.createElement("canvas"); out.width = CARD_W * CARD_K; out.height = CARD_H * CARD_K;
        const o = out.getContext("2d"); o.imageSmoothingEnabled = false;
        o.drawImage(cv, 0, 0, out.width, out.height);
        /* THE WORDS are drawn straight onto the finished card at its own size,
           never drawn small and scaled: Volter is a bitmap face on a 9px cell,
           clean only at 9px or a whole multiple of it, set at whole pixels with
           no scale on the context. So a 9px line is set at 18px here (the
           card's 2x), an 18px one at 36px, the score at 108px; every line
           starts on a whole pixel (centring rounds), with a shadow a whole
           card pixel (2px) down and right. (The 25 Oct "distorted" footer was
           a centred line starting on a half pixel and then scaled.) */
        const K = CARD_K;
        const face = (px, bold) => (bold ? "bold " : "") + (px * K) + "px 'Volter Goldfish'";
        // The words, and their shadows, go on layers of their own, each snapped to whole pixels at the end.
        const layer = () => { const c = document.createElement("canvas"); c.width = out.width; c.height = out.height; const x = c.getContext("2d"); x.textAlign = "left"; x.textBaseline = "alphabetic"; return x; };
        const t = layer(), sh = layer();
        const put = (s, x, y, px, colour, bold, shadow) => {
            t.font = sh.font = face(px, bold);
            const [ox, oy] = gridOffset(face(px, bold));
            const d = (shadow || 1) * K;
            sh.fillStyle = "#0b0612"; sh.fillText(s, x + d + ox, y * K + d + oy);
            t.fillStyle = colour; t.fillText(s, x + ox, y * K + oy);
        };
        const widthOf = (s, px, bold) => { t.font = face(px, bold); return t.measureText(s).width; };
        const centred = (s, y, px, colour, bold) => put(s, Math.round((out.width - widthOf(s, px, bold)) / 2), y, px, colour, bold);
        // Signed in, the card says who: their nickname (or display name) over the line.
        const who = (() => { try { const p = window.Account && Account.current; return p ? String(p.nick || (Account.nameOf ? Account.nameOf(p) : "") || "").trim() : ""; } catch (e) { return ""; } })();
        if (who) centred(who, 40, 18, "#ffd34d");
        const line1 = "Defeated " + fmt(kills) + (kills === 1 ? " bat" : " bats") + " on MazeRats.net!";
        centred(line1, who ? 64 : 66, widthOf(line1, 18) <= out.width - 24 * K ? 18 : 9, "#f4e6ff");
        /* THE SCORE, as big as fits (54 or 36), set by its ink rather than its
           type boxes (the owner's: "Scoring" tight to the top left of the
           number, "points!" much closer beside it). "Scoring" starts where
           the number's first digit starts, two card pixels clear above its
           shadow; "points!" sits on the number's baseline two card pixels
           clear of its shadow. The three are centred as one group. All in
           the card's own pixels (out), on whole pixels. */
        const num = fmt(score);
        const big = widthOf(num, 54, true) > out.width - 120 * K ? 36 : 54;
        const ink = (str, px, bold) => { t.font = face(px, bold); const m = t.measureText(str); return { l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent }; };
        const nI = ink(num, big, true), pI = ink("points!", 18), sI = ink("Scoring", 18);
        const numShadow = 2 * K, gapP = numShadow + 2 * K;
        const groupW = (nI.l + nI.r) + gapP + (pI.l + pI.r);
        const inkLeft = Math.round((out.width - groupW) / 2);
        const numX = inkLeft + Math.round(nI.l), base = 146 * K;
        put(num, numX, base / K, big, "#9fe068", true, 2);
        const pX = Math.round(inkLeft + nI.l + nI.r + gapP + pI.l);
        put("points!", pX, base / K, 18, "#b8a9c9");
        const sBase = Math.round(base - nI.a - (K + 2 * K) - sI.d);
        put("Scoring", inkLeft + Math.round(sI.l), sBase / K, 18, "#b8a9c9");
        centred("Happy Halloween from Origins Maze Rats!", CARD_H - 12, 9, "#7a6494");
        for (const x of [sh, t]) {
            const im = x.getImageData(0, 0, out.width, out.height), d = im.data;
            for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
            x.putImageData(im, 0, 0);
            o.drawImage(x.canvas, 0, 0);
        }
        return out;
    }
    /* Where a face's outlines sit against the pixel grid: the browser sets
       Volter's glyphs a fraction of a pixel off it at some sizes, which shows
       as rows of half-shaded pixels. Measured once per face by drawing a
       sample at each quarter-pixel nudge and keeping the one with the fewest
       part-covered pixels. */
    const gridOffsets = new Map();
    function gridOffset(font) {
        if (gridOffsets.has(font)) return gridOffsets.get(font);
        const c = document.createElement("canvas"); c.width = 400; c.height = 160;
        const g = c.getContext("2d");
        g.font = font; g.textBaseline = "alphabetic"; g.fillStyle = "#fff";
        let best = [0, 0], bestN = Infinity;
        for (const oy of [0, 0.25, 0.5, 0.75, -0.25, -0.5]) for (const ox of [0, 0.25, 0.5, -0.25, -0.5]) {
            g.clearRect(0, 0, c.width, c.height);
            g.fillText("HMgdefq0123", 8 + ox, 110 + oy);
            const d = g.getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 3; i < d.length; i += 4) if (d[i] > 24 && d[i] < 232) n++;
            if (n < bestN) { bestN = n; best = [ox, oy]; }
        }
        gridOffsets.set(font, best);
        return best;
    }
    let shareOpen = null;
    async function shareCard(stats) {
        if (shareOpen) return;
        if (document.fonts) await Promise.all(["18px 'Volter Goldfish'", "bold 18px 'Volter Goldfish'"].map((f) => document.fonts.load(f))).catch(() => {});
        const wrap = document.createElement("div");
        wrap.innerHTML = `
            <div class="modal-overlay open hw-share">
                <div class="modal confirm-modal hw-share-window" role="dialog" aria-modal="true" aria-labelledby="hw-share-title" tabindex="-1">
                    <div class="chrome-titlebar">
                        <h2 id="hw-share-title">${stats.final ? "Game Over" : "Bat Score"}</h2>
                        <button type="button" class="chrome-close" aria-label="Close"><img src="/assets/img/modal_topclose_x.png" alt="" aria-hidden="true"></button>
                    </div>
                    <div class="chrome-frame">
                        <div class="modal-body hw-share-body">
                            <p class="hw-share-lead" role="status">Copy and paste it anywhere!</p>
                            <div class="hw-share-stage"></div>
                            <button type="button" class="hw-share-signin" data-share="signin" hidden>Sign in to get your name on the card!</button>
                            <div class="confirm-actions hw-share-actions">
                                <button type="button" class="guess-btn guess-btn--lead" data-share="copy">Copy Image</button>
                                <button type="button" class="guess-btn" data-share="save">Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        const overlay = wrap.firstElementChild;
        const card = drawCard(stats);
        card.className = "hw-share-card"; card.setAttribute("role", "img");
        card.setAttribute("aria-label", "Defeated " + stats.kills + " bats on MazeRats.net, scoring " + stats.score + " points");
        overlay.querySelector(".hw-share-stage").appendChild(card);
        const lead = overlay.querySelector(".hw-share-lead");
        const blob = () => new Promise((ok) => card.toBlob(ok, "image/png"));
        if (!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem)) {
            overlay.querySelector('[data-share="copy"]').remove();
            lead.textContent = "Save it and share it anywhere.";
        }
        // Signed out, a line above the buttons offers the name on the card: the line is the sign-in.
        const signedIn = !!(window.Account && Account.current);
        const signin = overlay.querySelector(".hw-share-signin");
        if (!signedIn && window.Account && Account.signIn) signin.hidden = false;
        /* Counted (js/track.js) once a card is copied or saved, not when it
           opens: End game opens it every time, so an open is no sign of a share. */
        let counted = false;
        const shared = () => { if (counted) return; counted = true; if (window.Track) Track.event("bat-share"); };
        const returnTo = document.activeElement;
        const close = () => {
            overlay.remove(); added.delete(overlay); shareOpen = null;
            removeEventListener("keydown", onKey, true);
            if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
            if (returnTo && returnTo.focus) returnTo.focus();
        };
        const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
        overlay.addEventListener("click", async (e) => {
            if (e.target === overlay || e.target.closest(".chrome-close")) { close(); return; }
            const act = e.target.closest("[data-share]");
            if (!act) return;
            if (act.dataset.share === "signin") { Account.signIn(); return; }
            if (act.dataset.share === "copy") {
                try {
                    // A promise inside the item, so Safari keeps the click's permission.
                    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob() })]);
                    lead.textContent = "Copied! Paste it anywhere.";
                    shared();
                } catch (err) { lead.textContent = "Couldn't copy it. Use Save instead."; }
            } else {
                const url = URL.createObjectURL(await blob());
                const a = document.createElement("a");
                a.href = url; a.download = "maze-rats-bat-score-" + stats.score + ".png";
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
                lead.textContent = "Saved.";
                shared();
            }
        });
        addEventListener("keydown", onKey, true);
        document.body.appendChild(overlay); added.add(overlay);
        document.body.classList.add("modal-open");
        shareOpen = { close };
        overlay.querySelector(".hw-share-window").focus();
    }

    let bats = null;
    function decorateBats() {
        if (bats || reduceMq.matches || GAME_PAGE) return;
        PLAYABLE = !!document.body && document.body.dataset.page === "home";
        const cv = document.createElement("canvas");
        cv.className = "hw-bats"; cv.setAttribute("aria-hidden", "true");
        document.body.appendChild(cv); added.add(cv);
        const ctx = cv.getContext("2d");
        const frames = BAT.map((f) => sprite(f, BAT_PAL));
        /* The small, far bats (the owner's: too many, and hard to see): one in
           four, drawn at full strength in lighter wings, with a faint pale rim
           round them so they read against the dark page. Their own frames. */
        const SMALL_PAL = { x: "#1a0f26", m: "#4a3366", e: "#ffd84a", h: "#7552a0" };
        const smallFrames = BAT.map((rows) => {
            const s = sprite(rows, SMALL_PAL);
            const o = document.createElement("canvas"); o.width = s.width + 2; o.height = s.height + 2;
            const g = o.getContext("2d");
            const sd = s.getContext("2d").getImageData(0, 0, s.width, s.height).data;
            g.fillStyle = "rgba(214,200,255,0.42)";
            for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
                const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < s.width && yy < s.height && sd[(yy * s.width + xx) * 4 + 3] > 0;
                if (!on(x - 1, y - 1) && (on(x - 2, y - 1) || on(x, y - 1) || on(x - 1, y - 2) || on(x - 1, y))) g.fillRect(x, y, 1, 1);
            }
            g.drawImage(s, 1, 1);
            return o;
        });
        const rnd = prng(31102026);
        let W = 0, H = 0;
        const resize = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; ctx.imageSmoothingEnabled = false; };
        resize();
        const flock = [], falling = [], floaters = [];
        const pick = () => ({ x: W * (0.08 + rnd() * 0.84), y: 70 + rnd() * Math.max(60, H * 0.62) });
        const offEdge = () => {
            const side = Math.floor(rnd() * 4), m = 60;
            return side === 0 ? { x: -m, y: rnd() * H * 0.8 } : side === 1 ? { x: W + m, y: rnd() * H * 0.8 }
                : side === 2 ? { x: rnd() * W, y: -m } : { x: rnd() * W, y: H + m };
        };
        // How far into the game: seconds played while the score is up.
        const getS = (store, k) => { try { return Number(store.getItem(k)) || 0; } catch (e) { return 0; } };
        const putS = (store, k, v) => { try { store.setItem(k, String(v)); } catch (e) { /* private mode */ } };
        let clock = 0, board = null;
        /* The ramp, from calm (a few at a time, minutes apart) to a swarm: one
           more bat allowed every 15 seconds up to 14, the next arriving sooner
           (3s down to 0.5s), and every bat a little quicker (up to 1.8x by
           four minutes). Only while playing. */
        const maxBats = () => board ? Math.min(14, 4 + Math.floor(clock / 15)) : 3;
        /* Between games the sky is never empty for long (the owner's: there
           were long spells with none): a new bat every 3 to 7 seconds, and
           sooner (within one or two) while fewer than two are about. */
        const gap = () => board ? Math.max(0.5, 3 - clock / 25) * (0.6 + rnd() * 0.8)
            : flock.length < 2 ? 0.6 + rnd() * 1.2 : 3 + rnd() * 4;
        const pace = () => board ? 1 + Math.min(0.8, clock / 300) : 1;
        const spawn = (inside) => {
            const near = rnd() < 0.75;
            const p = inside ? pick() : offEdge(), t = pick();
            const base = ((near ? 85 : 55) + rnd() * 30) * pace();
            flock.push({
                x: p.x, y: p.y, head: Math.atan2(t.y - p.y, t.x - p.x), target: t, chase: 0,
                base, speed: base, k: near ? 2 : 1, a: 1,
                turn: 1.1 + rnd() * 0.9, life: 12 + rnd() * 16, age: 0, leaving: false,
                flap: 0.1 + rnd() * 0.05, ph: rnd() * 6.3, face: 1
            });
        };
        spawn(true);
        if (rnd() < 0.6) spawn(false);

        // ---------- the game ----------
        let score = 0, kills = 0, best = getS(localStorage, BEST_KEY);
        const fmt = (n) => n.toLocaleString("en-GB");
        /* The score: the bat, the number and the best are one button that opens
           the share card. Under it, End game.

           THE STAGE CLEARS (the owner's): the first hit starts a game, and the
           page's content slides up out of the page and the fellow fansites
           and footer down out of it, leaving the sky: the top bar (and the
           ghost hanging from it), the moon and the bats. End game slides it
           all back, calms the swarm and ends that game: the next hit starts a
           new one from nothing. The best is kept. All of it is transforms on
           html.hw-batgame (css/skin-halloween.css), so no box moves. */
        /* Under the top bar, wherever it ends: 58px was its height on a wide
           screen, and on a phone the bar wraps to twice that and covered the
           score. Followed as the bar changes height (the ticker's row). */
        const head = document.querySelector(".site-header");
        const placeBoard = () => {
            if (!board) return;
            const bottom = head ? Math.max(0, head.getBoundingClientRect().bottom) : 50;
            board.style.top = Math.round(bottom + 8) + "px";
        };
        const headWatch = head && window.ResizeObserver ? new ResizeObserver(placeBoard) : null;
        if (headWatch) headWatch.observe(head);
        function showBoard() {
            if (board) return;
            board = document.createElement("div");
            board.className = "hw-batscore";
            const open = document.createElement("button");
            open.type = "button"; open.className = "hw-batscore-open"; open.title = "Share your score";
            const icon = sprite(BAT[0], BAT_PAL); icon.className = "hw-batscore-bat";
            const n = document.createElement("span"); n.className = "hw-batscore-n"; n.setAttribute("role", "status");
            const b = document.createElement("span"); b.className = "hw-batscore-best";
            open.append(icon, n, b);
            open.addEventListener("click", () => shareCard({ score, kills, best }));
            const end = document.createElement("button"); end.type = "button"; end.className = "hw-batscore-end"; end.textContent = "End game";
            end.addEventListener("click", endGame);
            board.append(open, end);
            document.body.appendChild(board); added.add(board);
            placeBoard();
            root.classList.add("hw-batgame");
            reported = false;
            if (window.Track) Track.event("bat-start");
            paintBoard();
        }
        /* Counted in the Warren's Activity (js/track.js): a game's start, its
           end with the score as a band (never the score itself), and each
           share card copied or saved. Never a hit or a miss. A game still running when
           the page goes is ended then, from capture listeners on window, so
           the event is queued before track.js's own listeners send the batch. */
        let reported = true;
        const band = (n) => n < 100 ? "0-99" : n < 500 ? "100-499" : n < 1000 ? "500-999" : n < 2500 ? "1000-2499" : "2500+";
        const reportEnd = () => { if (reported) return; reported = true; if (window.Track) Track.event("bat-end", band(score)); };
        const onLeave = (e) => { if (board && (e.type === "pagehide" || document.visibilityState === "hidden")) reportEnd(); };
        if (PLAYABLE) {
            addEventListener("pagehide", onLeave, true);
            addEventListener("visibilitychange", onLeave, true);
        }
        function endGame() {
            reportEnd();
            // The final score, as the card to copy or save (the owner's: End game brings it up).
            if (kills > 0) shareCard({ score, kills, best, final: true });
            if (board) { board.remove(); added.delete(board); board = null; }
            root.classList.remove("hw-batgame");
            score = 0; kills = 0; clock = 0;
            // The swarm thins out: the extra bats head off.
            flock.slice(maxBats()).forEach((b) => { b.leaving = true; b.target = offEdge(); b.chase = 0; });
        }
        function paintBoard() {
            if (!board) return;
            board.querySelector(".hw-batscore-n").textContent = fmt(score);
            board.querySelector(".hw-batscore-best").textContent = "BEST " + fmt(best);
        }
        function bump(by, x, y) {
            score = Math.max(0, score + by);
            if (score > best) { best = score; putS(localStorage, BEST_KEY, best); }
            paintBoard();
            if (board) { board.classList.remove("is-hit", "is-miss"); void board.offsetWidth; board.classList.add(by > 0 ? "is-hit" : "is-miss"); }
            floaters.push({ x, y, t: 0, text: (by > 0 ? "+" : "−") + Math.abs(by), good: by > 0 });
        }
        // The bat (if any) under a point: its drawn box, a little generous, the nearest first.
        const batAt = (x, y) => {
            let found = null, bestD = Infinity;
            for (const b of flock) {
                const hw = 15 * b.k / 2 + (b.k === 1 ? 7 : 5), hh = 9 * b.k / 2 + (b.k === 1 ? 7 : 5);
                if (Math.abs(x - b.x) <= hw && Math.abs(y - b.y) <= hh) {
                    const d = (x - b.x) ** 2 + (y - b.y) ** 2;
                    if (d < bestD) { bestD = d; found = b; }
                }
            }
            return found;
        };
        const nearBat = (x, y) => flock.some((b) => (x - b.x) ** 2 + (y - b.y) ** 2 <= MISS_R * MISS_R);
        let swallowUntil = 0;
        // A click on anything stacked over the bats (a window, the console, the game) is that thing's.
        const covered = (x, y) => { const t = document.elementFromPoint(x, y); return !!(t && t.closest(ABOVE_BATS)); };
        /* A finger can't aim past a bat the way a pointer can: a tap on a link,
           a button or a maze's row is that thing's, even with a bat passing over
           it, or opening a maze would clear the page into a game instead. */
        const PRESSABLE = "a, button, input, select, textarea, label, summary, [role=button], .chrome-list-row";
        const pressable = (e) => e.pointerType !== "mouse" && !!(e.target && e.target.closest && e.target.closest(PRESSABLE));
        const onDown = (e) => {
            if (e.button > 0 || covered(e.clientX, e.clientY) || pressable(e)) return;
            const b = batAt(e.clientX, e.clientY);
            if (b) {
                // Shot: it stops dead, flips over and drops off the bottom.
                flock.splice(flock.indexOf(b), 1);
                falling.push({ x: b.x, y: b.y, vy: -40, k: b.k, a: b.a, face: b.face });
                e.preventDefault(); e.stopPropagation();
                swallowUntil = performance.now() + 600;
                kills++;
                showBoard();
                // The small, far bats are the harder shot (the owner's: 150 for those).
                bump(b.k === 1 ? HIT_SMALL : HIT, e.clientX, e.clientY - 8);
            } else if (board && nearBat(e.clientX, e.clientY)) {
                bump(-MISS, e.clientX, e.clientY - 8);
            }
        };
        // The click that follows a hit belongs to the bat, not to whatever is under it.
        const onClick = (e) => { if (performance.now() < swallowUntil) { e.preventDefault(); e.stopPropagation(); swallowUntil = 0; } };
        let aimX = -1, aimY = -1;
        const onMove = (e) => { aimX = e.clientX; aimY = e.clientY; };
        if (PLAYABLE) {
            document.addEventListener("pointerdown", onDown, true);
            document.addEventListener("click", onClick, true);
            document.addEventListener("pointermove", onMove, { passive: true });
        }
        const root = document.documentElement;

        let next = 4 + rnd() * 6, last = performance.now(), id = 0;
        const frame = (now) => {
            id = requestAnimationFrame(frame);
            const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
            next -= dt;
            if (board) clock += dt;
            if (!flock.length && next > 1.5) next = 1.5;     // the last one just left: the next is close behind
            if (next <= 0) { if (flock.length < maxBats()) spawn(false); next = gap(); }
            ctx.clearRect(0, 0, W, H);
            for (let i = flock.length - 1; i >= 0; i--) {
                const b = flock[i];
                b.age += dt; b.chase += dt;
                if (!b.leaving && b.age > b.life) { b.leaving = true; b.target = offEdge(); b.chase = 0; }
                const dx = b.target.x - b.x, dy = b.target.y - b.y;
                // Arrived (anywhere inside its turning circle), or given up on it: a new point.
                const reach = Math.max(70, (b.speed / b.turn) * 1.3);
                if (!b.leaving && (dx * dx + dy * dy < reach * reach || b.chase > 5)) { b.target = pick(); b.chase = 0; }
                // turn toward the target, never faster than the bat can (a leaving bat that is slow to go turns harder)
                let want = Math.atan2(dy, dx) - b.head;
                while (want > Math.PI) want -= 2 * Math.PI;
                while (want < -Math.PI) want += 2 * Math.PI;
                const turn = b.leaving && b.chase > 6 ? b.turn * 2.5 : b.turn;
                b.head += Math.max(-turn * dt, Math.min(turn * dt, want));
                // speed eases with the turn: slower round a bend, quicker on the straight
                const goal = b.base * (1 - 0.35 * Math.min(1, Math.abs(want) / 1.2)) * (1 + 0.15 * Math.sin(b.age * 0.9 + b.ph));
                b.speed += (goal - b.speed) * Math.min(1, dt * 1.5);
                b.x += Math.cos(b.head) * b.speed * dt;
                b.y += Math.sin(b.head) * b.speed * dt;
                if (b.leaving && (b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80)) { flock.splice(i, 1); continue; }
                // face the way it is going, with a little hysteresis so it does not flicker on a vertical
                const vx = Math.cos(b.head);
                if (vx > 0.15) b.face = 1; else if (vx < -0.15) b.face = -1;
                const f = (b.k === 1 ? smallFrames : frames)[Math.floor((b.age + b.ph) / b.flap) & 1];
                ctx.globalAlpha = b.a;
                ctx.save();
                ctx.translate(Math.round(b.x), Math.round(b.y));
                if (b.face < 0) ctx.scale(-1, 1);
                ctx.drawImage(f, Math.round(-f.width * b.k / 2), Math.round(-f.height * b.k / 2), f.width * b.k, f.height * b.k);
                ctx.restore();
            }
            // Shot bats: wings still, upside down, falling off the bottom.
            for (let i = falling.length - 1; i >= 0; i--) {
                const b = falling[i];
                b.vy += 900 * dt; b.y += b.vy * dt;
                if (b.y > H + 40) { falling.splice(i, 1); continue; }
                // the wings-down frame, so turned over its ears and eyes are plainly at the bottom
                const f = (b.k === 1 ? smallFrames : frames)[1];
                ctx.globalAlpha = b.a;
                ctx.save();
                ctx.translate(Math.round(b.x), Math.round(b.y));
                ctx.scale(b.face < 0 ? -1 : 1, -1);
                ctx.drawImage(f, Math.round(-f.width * b.k / 2), Math.round(-f.height * b.k / 2), f.width * b.k, f.height * b.k);
                ctx.restore();
            }
            // +100 / −25, rising and fading where the shot landed.
            ctx.font = "18px 'Volter Goldfish', monospace";
            ctx.textAlign = "center";
            for (let i = floaters.length - 1; i >= 0; i--) {
                const p = floaters[i];
                p.t += dt;
                if (p.t > 0.9) { floaters.splice(i, 1); continue; }
                const y = Math.round(p.y - 26 * (p.t / 0.9));
                ctx.globalAlpha = 1 - Math.max(0, (p.t - 0.45) / 0.45);
                ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillText(p.text, Math.round(p.x) + 1, y + 1);
                ctx.fillStyle = p.good ? "#9fe068" : "#ff6b5a"; ctx.fillText(p.text, Math.round(p.x), y);
            }
            ctx.globalAlpha = 1;
            // Over a bat, the pointer says it can be clicked.
            if (PLAYABLE) root.classList.toggle("hw-bat-aim", aimX >= 0 && !!batAt(aimX, aimY) && !covered(aimX, aimY));
        };
        id = requestAnimationFrame(frame);
        addEventListener("resize", resize);
        bats = { stop() {
            cancelAnimationFrame(id); removeEventListener("resize", resize);
            if (headWatch) headWatch.disconnect();
            document.removeEventListener("pointerdown", onDown, true);
            document.removeEventListener("click", onClick, true);
            document.removeEventListener("pointermove", onMove);
            removeEventListener("pagehide", onLeave, true);
            removeEventListener("visibilitychange", onLeave, true);
            root.classList.remove("hw-bat-aim", "hw-batgame");
        } };
    }

    /* The rows go on in idle time, a few at a time (8ms of work a turn). Each
       one measures the page and then adds to it, so decorating thirty at once
       was thirty forced layouts in a row, over a second before the page
       answered; the windows above still go on at once. */
    let rowsQueued = false;
    function decorateRows() {
        if (rowsQueued) return;
        rowsQueued = true;
        idle(() => {
            rowsQueued = false;
            if (!on) return;
            const t0 = performance.now();
            for (const row of document.querySelectorAll(".chrome-list-row")) {
                if (hosts.has(row) || !row.offsetWidth) continue;
                const key = "row:" + (row.textContent || "").replace(/\s+/g, " ").slice(0, 60);
                const pours = rowLook(key);
                if (!pours.length) continue;
                host(row, (el, w) => pours.forEach((span, i) =>
                    slime(el, w, { size: "mid", r: 6, pad: 5, up: 8, down: 26, span, key: key + ":" + i, z: 5, sideRuns: 1, animate: i === 0 && hash(key) % 3 === 0 ? 1 : 0 })));
                if (performance.now() - t0 > 8) { decorateRows(); return; }
            }
        });
    }

    // Panels inside windows: a partial pour each, and a cobweb where the owner wants one.
    const PANELS = [
        ["#modal-thumb-frame", { size: "mid", r: 6, pad: 4, up: 8, down: 40, z: 6, span: [0.18, 0.86], sideRuns: 0, animate: 1 }],
        [".modal-meta", { size: "small", r: 0, pad: 0, up: 6, down: 22, z: 6, span: [0.55, 1], sideRuns: 0 }],
        [".room-desc-panel", { size: "mid", r: 6, pad: 3, up: 7, down: 34, z: 6, span: [0, 0.42], sideRuns: 0.9, animate: 1 }],
        [".guides-card", { size: "mid", r: 6, pad: 4, up: 8, down: 40, z: 6, span: [0.42, 1], sideRuns: 1, animate: 1 }],
        [".guides-card-thumb", { size: "small", r: 3, pad: 3, up: 6, down: 30, z: 7, span: [0, 0.7], sideRuns: 1 }]
    ];
    function decoratePanels() {
        for (const [sel, o] of PANELS) document.querySelectorAll(sel).forEach((el) => {
            if (!el.offsetWidth) return;
            const keyOf = () => (el.closest(".modal") ? ((el.closest(".modal").querySelector(".chrome-titlebar") || {}).textContent || "") : "") + sel;
            host(el, (e, w) => slime(e, w, Object.assign({ key: keyOf() }, o)), keyOf);
        });
        const webs = [
            // top left, where the skin nudges the tally line right to clear it (css/skin-halloween.css)
            [document.querySelector("#featured-frame > .chrome-frame"), "left", 48, 3],
            [document.querySelector(".room-desc-panel"), "right", 50, 13],
            [(document.getElementById("guides-body") || {}).parentElement, "right", 56, 31]
        ];
        for (const [el, side, size, seed] of webs) {
            if (!el || !el.offsetWidth || el.__hwWeb) continue;
            el.__hwWeb = true;
            innerWeb(el, side, size, seed);
        }
    }

    function decorateConsole() {
        const modal = document.getElementById("console-modal"), frame = document.getElementById("console-frame"), screen = document.getElementById("console-screen");
        if (!modal || !frame || !frame.offsetWidth) return;
        // The frame clips to its curve, so its goo hangs from the modal around it.
        host(frame, (el, w) => slime(el, w, { into: modal, size: "mid", r: 14, pad: 6, up: 10, down: 60, z: 10, key: "console", sideRuns: 1 }));
        if (screen && screen.offsetWidth) host(screen, (el) => {
            // a ghost in the machine: barely there, low in the glass
            const g = sprite(GHOST, GHOST_PAL);
            piece(el, g, "hw-glass-ghost", { right: 30, bottom: 8, width: 42, height: 45, backgroundSize: "42px 45px", zIndex: 3 });
        });
    }

    /* The ghost, hung on a thread from the top bar a little left of the main
       content, swinging like a pendulum. He stays upright and the thread is
       redrawn as a 1px line each frame, so nothing is ever rotated (a rotated
       sprite goes jaggy). Twelve frames a second is plenty for a slow swing. */
    const SWING = 8, PERIOD = 6, LEN = 214, GS = 2;
    function decorateHeader() {
        const hd = document.querySelector(".site-header");
        // Inside the homepage's game window there is no page around it to hang from: the page outside has him.
        if (!hd || hosts.has(hd) || EMBED) return;
        host(hd, (el, w) => {
            const hr = el.getBoundingClientRect();
            const main = document.getElementById("browse-window") || [...document.querySelectorAll("main > *, main .container > *")].sort((a, b) => b.offsetWidth - a.offsetWidth)[0];
            const mr = main && main.getBoundingClientRect();
            // Beside the main content, in the margin: where there is none (a phone), he does not hang at all.
            const pivot = mr ? mr.left - hr.left - 74 : -1;
            const b = borders(el);
            if (pivot > 40) {
                const gw = GHOST[0].length * GS, gh = GHOST.length * GS;
                const reach = Math.ceil(LEN * Math.sin(SWING * Math.PI / 180));
                const cw = reach * 2 + gw + 4, ch = LEN + gh + 2;
                const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
                cv.className = "hw-piece hw-ghost"; cv.setAttribute("aria-hidden", "true");
                cv.style.cssText = `left:${Math.round(pivot - cw / 2)}px;top:calc(100% + ${b.b}px);width:${cw}px;height:${ch}px;z-index:2`;
                el.appendChild(cv); added.add(cv);
                const ctx = cv.getContext("2d"), body = sprite(GHOST, GHOST_PAL);
                ctx.imageSmoothingEnabled = false;
                const px = Math.round(cw / 2);
                let lastDeg = null;
                const paint = (t) => {
                    const deg = t == null ? 0 : SWING * Math.sin(t * 2 * Math.PI / PERIOD);
                    const rounded = Math.round(deg * 4) / 4;
                    if (rounded === lastDeg) return;
                    lastDeg = rounded;
                    const a = rounded * Math.PI / 180, ex = px + Math.sin(a) * LEN, ey = Math.cos(a) * LEN;
                    ctx.clearRect(0, 0, cw, ch);
                    ctx.fillStyle = "rgba(232,226,246,0.7)";
                    const n = Math.max(Math.abs(ex - px), ey);
                    for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(px + (ex - px) * i / n), Math.round(ey * i / n), 1, 1);
                    ctx.fillStyle = "rgba(246,242,255,0.95)";
                    ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 2, 3, 2);         // the knot on his head
                    ctx.globalAlpha = 0.9;
                    ctx.drawImage(body, Math.round(ex - gw / 2), Math.round(ey) - 1, gw, gh);
                    ctx.globalAlpha = 1;
                };
                paint(null);
                if (!reduceMq.matches) tickers.add(paint);
                cv.__hwPaint = paint;
            }
        });
        if (!reduceMq.matches && !rafId) {
            let last = 0;
            const tick = (now) => {
                rafId = requestAnimationFrame(tick);
                if (now - last < 83) return;
                last = now;
                tickers.forEach((p) => p(now / 1000));
            };
            rafId = requestAnimationFrame(tick);
        }
    }

    // A graveyard at the foot of the page, either side of the fellow fansites.
    // Rows re-rendered away take their goo with them, and stop being watched.
    function prune() {
        hosts.forEach((rec, el) => {
            if (el.isConnected) return;
            rec.pieces.forEach((p) => { p.remove(); added.delete(p); });
            if (ro) ro.unobserve(el);
            hosts.delete(el);
        });
    }

    function decorateAll() {
        if (!on) return;
        prune();
        decorateHeader();
        decorateWindows();
        decorateRows();
        decoratePanels();
        decorateConsole();
        decorateBats();
    }

    function start() {
        if (on) return;
        on = true;
        /* Inside the homepage's Fallin' Furni window (html.ff-embed) the page
           around it already wears the skin: here it is the attribute and the
           palette only, as Christmas does, with no goo or drips under the game. */
        if (EMBED) return;
        ro = new ResizeObserver((entries) => {
            clearTimeout(ro.t);
            ro.t = setTimeout(() => entries.forEach((e) => redraw(e.target)), 120);
        });
        let pending = 0;
        mo = new MutationObserver((records) => {
            /* Our own pieces coming and going, or changing (the drip clock sets
               a strip's frame every step), are not the page changing: a change
               to an hw-piece's own style used to re-run the whole decoration
               pass on every frame of every drip. */
            const ours = (n) => n.classList && n.classList.contains("hw-piece");
            if (pending || records.every((r) => r.type === "childList"
                ? [...r.addedNodes, ...r.removedNodes].every(ours)
                : ours(r.target))) return;
            pending = requestAnimationFrame(() => { pending = 0; decorateAll(); });
        });
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
        decorateAll();
        timers.push(setTimeout(decorateAll, 1500));
    }

    function stop() {
        if (!on) return;
        on = false;
        if (mo) mo.disconnect(); if (ro) ro.disconnect();
        mo = ro = null;
        cancelAnimationFrame(rafId); rafId = 0;
        cancelAnimationFrame(dripRaf); dripRaf = 0; dripping.clear();
        pend.forEach(clearTimeout); pend.clear();
        // The queue's flags too: with its jobs and timers gone, nothing else would clear them.
        idleJobs.length = 0; idleBusy = false; rowsQueued = false;
        if (bats) bats.stop(); bats = null;
        if (shareOpen) shareOpen.close();
        tickers.clear();
        timers.splice(0).forEach(clearTimeout);
        added.forEach((n) => n.remove()); added.clear();
        hosts.clear();
        document.querySelectorAll("*").forEach((el) => { if (el.__hwWeb) delete el.__hwWeb; });
        restore.forEach((r, el) => { for (const k in r) el.style[k] = r[k]; }); restore.clear();
    }

    (window.SiteSkins = window.SiteSkins || {}).halloween = {
        start, stop,
        // The art, for tools and previews.
        art: { goo, cobweb, moon, sprite, BAT, BAT_PAL, GHOST, GHOST_PAL, SPIDER, SPIDER_PAL, HAT, HAT_PAL }
    };
})();

/* The Hallway's things that move on their own: the rat between its holes, dust in the sun's beams, and the screensaver.
   All of it sits on HallwayLive in editor.js and only runs while somebody is walking. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const screensaver = { on: false, floors: [], i: 0, t0: 0, was: null, raf: 0 };
    const rand = (a, b) => a + Math.random() * (b - a);
    const inView = (v, p, m) => p[0] > v.x0 - m && p[0] < v.x1 + m && p[1] > v.y0 - m && p[1] < v.y1 + m;
    const toMap = (c, ox, oy) => { c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; };

    /* ---------- the rat: hole to hole, by the tiles, not often ---------- */
    const RAT_EVERY = window.HALLWAY_RAT_EVERY || [120000, 240000], RAT_SPEED = 7.5, IN_WALL = 1.1;
    let rat = null, ratDue = performance.now() + rand(20000, 60000), sheet = null, sheetImg = null;
    const ratCanvas = document.createElement("canvas"); ratCanvas.width = 33; ratCanvas.height = 56; const ratCtx = ratCanvas.getContext("2d", { willReadFrequently: true });
    function loadRat() { if (sheet !== null) return; sheet = false; const img = new Image(); img.onload = () => { sheetImg = img; }; img.src = "art/ideas/rat.png"; fetch("art/ideas/rat.json").then(r => r.json()).then(j => { sheet = j; }).catch(() => { sheet = false; }); }
    const front = q => q.axis === "y" ? [q.line, Math.floor(q.at)] : [Math.floor(q.at), q.line];
    /* the fewest turns: a step costs 2, a turn 3 more, tiles of the floor only and no climbing */
    function tileRoute(l, a, b, limit) {
        const free = LIVE.tileFree(l), STEPS = [[1, 0], [0, 1], [-1, 0], [0, -1]], buckets = [[[a[0], a[1], -1, null]]], seen = new Set();
        for (let cost = 0; cost < buckets.length && cost < limit * 2 + 30; cost++) for (const n of buckets[cost] || []) {
            const key = n[0] + "," + n[1] + "," + n[2]; if (seen.has(key)) continue; seen.add(key);
            if (n[0] === b[0] && n[1] === b[1]) { const out = []; for (let q = n; q; q = q[3]) out.unshift([q[0], q[1]]); return out; }
            const z = LIVE.nodeZ(l, n[0], n[1]);
            STEPS.forEach(([dx, dy], d) => { const X = n[0] + dx, Y = n[1] + dy; if (!free(X, Y) && !(X === b[0] && Y === b[1])) return; if (Math.abs(LIVE.nodeZ(l, X, Y) - z) > 16) return; const c = cost + 2 + (n[2] >= 0 && n[2] !== d ? 3 : 0); (buckets[c] = buckets[c] || []).push([X, Y, d, n]); });
        }
        return null;
    }
    function ratTrip(l, a, b) {
        const fa = front(a), fb = front(b), route = tileRoute(l, fa, fb, 44); if (!route) return null;
        const pts = [a.axis === "y" ? [a.line - IN_WALL, a.at] : [a.at, a.line - IN_WALL], a.axis === "y" ? [a.line + .5, a.at] : [a.at, a.line + .5]];
        for (const t of route) pts.push([t[0] + .5, t[1] + .5]);
        pts.push(b.axis === "y" ? [b.line + .5, b.at] : [b.at, b.line + .5], b.axis === "y" ? [b.line - IN_WALL, b.at] : [b.at, b.line - IN_WALL]);
        /* straight runs in one go */
        const legs = []; for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i], n = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]); if (n < .001) continue; const dir = Math.abs(q[0] - p[0]) > Math.abs(q[1] - p[1]) ? (q[0] > p[0] ? "x" : "nx") : (q[1] > p[1] ? "y" : "ny"), last = legs[legs.length - 1]; if (last && last.dir === dir) { last.q = q; last.n += n; } else legs.push({ p, q, n, dir }); }
        return { l, a, b, legs, total: legs.reduce((s, g) => s + g.n, 0), from: performance.now() };
    }
    function ratStart() {
        const w = LIVE.walker, l = LIVE.floor; if (!w || !l || !sheet || !sheetImg) return false;
        const holes = (l.wallItems || []).filter(q => q.k === "i_rathole"); if (holes.length < 2) return false;
        const v = LIVE.view(), z = q => LIVE.nodeZ(l, front(q)[0], front(q)[1]), seen = holes.filter(q => inView(v, q.axis === "y" ? LIVE.mapPoint(q.line, q.at, z(q)) : LIVE.mapPoint(q.at, q.line, z(q)), 40));
        if (!seen.length) return false;
        const a = seen[Math.floor(Math.random() * seen.length)], others = holes.filter(q => q !== a).sort(() => Math.random() - .5);
        for (const b of others) { const t = ratTrip(l, a, b); if (t) { rat = t; LIVE.wake(); return true; } }
        return false;
    }
    /* what shows at a hole: everything on the floor side of the wall, and the arch */
    function archClip(c, X, Y, axis) {
        const sl = axis === "y" ? -.5 : .5; c.beginPath(); c.moveTo(X - 300, Y - 300 * sl); c.lineTo(X - 5.5, Y - 5.5 * sl);
        for (let a = 0; a <= 12; a++) { const th = Math.PI * a / 12, u = -Math.cos(th) * 5.5; c.lineTo(X + u, Y + u * sl - Math.sin(th) * 9); }
        c.lineTo(X + 300, Y + 300 * sl); c.lineTo(X + 300, Y + 400); c.lineTo(X - 300, Y + 400); c.closePath(); c.clip();
    }
    function ratNow(now) {
        let d = (now - rat.from) / 1000 * RAT_SPEED; if (d >= rat.total) { rat = null; ratDue = now + rand(RAT_EVERY[0], RAT_EVERY[1]); return null; }
        let i = 0; while (i < rat.legs.length - 1 && d > rat.legs[i].n) { d -= rat.legs[i].n; i++; }
        const g = rat.legs[i], f = Math.min(1, d / g.n);
        return { x: g.p[0] + (g.q[0] - g.p[0]) * f, y: g.p[1] + (g.q[1] - g.p[1]) * f, dir: g.dir, first: i === 0, last: i === rat.legs.length - 1 };
    }
    function drawRat(c, ox, oy, now, nearer) {
        if (!rat || !LIVE.walker || !sheet) return; const r = ratNow(now); if (!r) return;
        const w = LIVE.walker, l = rat.l, nearerNow = r.x + r.y > w.x + w.y + 1; if (nearerNow !== nearer) return;
        const tx = Math.floor(r.x), ty = Math.floor(r.y), hole = r.first ? rat.a : r.last ? rat.b : null, base = hole ? front(hole) : [tx, ty], z = LIVE.nodeZ(l, base[0], base[1]) || 0, p = LIVE.mapPoint(r.x, r.y, z);
        const frames = sheet[r.dir], s = frames[Math.floor(now / 1000 * 26) % frames.length], X = Math.round(p[0]), Y = Math.round(p[1]), x0 = X - 16, y0 = Y - 50;
        ratCtx.clearRect(0, 0, 33, 56); ratCtx.imageSmoothingEnabled = false; ratCtx.drawImage(sheetImg, s.x, 0, s.w, s.h, 16 - s.ox, 50 - s.oy, s.w, s.h);
        LIVE.as({ x: tx, y: ty, z, l, dir: 2, frame: 0, st: null }, () => { LIVE.cutInFront(ratCtx, x0, y0); LIVE.tint(ratCtx); });
        toMap(c, ox, oy);
        if (hole) {
            const inside = hole.axis === "y" ? r.x < hole.line + 1.2 : r.y < hole.line + 1.2;
            if (inside) { const A = hole.axis === "y" ? LIVE.mapPoint(hole.line, hole.at, z) : LIVE.mapPoint(hole.at, hole.line, z); archClip(c, A[0], A[1] + LIVE_FOOT, hole.axis);
                const depth = (hole.axis === "y" ? hole.line - r.x : hole.line - r.y) + .4; if (depth > 0) { ratCtx.save(); ratCtx.globalCompositeOperation = "source-atop"; ratCtx.fillStyle = `rgba(0,0,0,${Math.min(.92, depth * 1.2)})`; ratCtx.fillRect(0, 0, 33, 56); ratCtx.restore(); } }
        }
        c.drawImage(ratCanvas, x0, y0);
    }
    const LIVE_FOOT = -2;     // the arch stands this far off the tile's line
    LIVE.add({ active: () => !!rat && !!LIVE.walker, under: (c, ox, oy, now) => drawRat(c, ox, oy, now, false), over: (c, ox, oy, now) => drawRat(c, ox, oy, now, true) });
    setInterval(() => { if (document.hidden || rat || screensaver.on) return; const now = performance.now(); if (now < ratDue || !LIVE.walker) return; loadRat(); if (!ratStart()) ratDue = now + 15000; }, 1000);
    window.HallwayRat = { run() { loadRat(); return new Promise(res => { const t = setInterval(() => { if (sheet && sheetImg) { clearInterval(t); res(ratStart()); } }, 50); }); }, get on() { return !!rat; }, get trip() { return rat; } };

    /* ---------- dust in the sun: small, soft, gliding, spread across the pixels it's between so nothing ticks ---------- */
    const SUN = [1, .34, -.92];
    const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
    function sunAmount() { const m = LIVE.mood(); if (!m) return 0; return (m.a === "day" ? 1 - m.f : 0) + (m.b === "day" ? m.f : 0); }
    function dustWindows() {
        const l = LIVE.floor; if (!l || !l.wallItems || !LIVE.walker) return []; const v = LIVE.view(), out = [];
        for (const q of l.wallItems) { if (q.k !== "i_window") continue; const t = q.axis === "y" ? [q.line, Math.floor(q.at)] : [Math.floor(q.at), q.line], z = LIVE.nodeZ(l, t[0], t[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, q.at, z) : LIVE.mapPoint(q.at, q.line, z); if (inView(v, a, 160)) out.push({ q, z }); }      /* the motes reach about 100px from the window: 260 kept the map repainting with none on screen (10 Nov scan, live 8) */
        return out;
    }
    function drawDust(c, ox, oy, now) {
        const sun = sunAmount(); if (sun <= 0 || screensaver.on) return; const t = now / 1000; toMap(c, ox, oy);
        for (const { q, z } of dustWindows()) {
            const W = q.w || 52, b = q.b || 0, top = q.top || 78, start = q.at - W / 32, n = Math.max(10, Math.min(46, Math.round(W * (top - b) / 110))), seed = q.at * 3 + q.line;
            for (let i = 0; i < n; i++) {
                /* each mote drifts down the beam at its own pace and sways as it goes, fading in and out at the beam's ends (14 Nov 2026, his: "the dust
                   specks ... don't appear to be moving, because it's so slow": they only swayed 4px over half a minute) */
                const wy = hash(i, seed) * W, wz = b + hash(i + 40, seed) * (top - b), far = wz / -SUN[2], ph = i * 1.3 + seed, pace = 1.6 + hash(i + 120, seed) * 2.4;
                const k = ((hash(i + 80, seed) * far + t * pace) % far + far) % far, ends = Math.min(1, Math.min(k, far - k) / 10);
                const mx = k * SUN[0] + Math.sin(t * .55 + ph) * 5, my = wy + k * SUN[1] + Math.cos(t * .68 + ph) * 5, mz = wz + k * SUN[2] + Math.sin(t * .42 + ph) * 4;
                const A = (q.axis === "y" ? LIVE.mapPoint(q.line + mx / 16, start + my / 16, z + Math.max(1, mz)) : LIVE.mapPoint(start + my / 16, q.line + mx / 16, z + Math.max(1, mz))), X = A[0], Y = A[1] - 6;
                const al = (.42 + Math.sin(t * 1.4 + ph) * .16) * sun * ends, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
                for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) { c.fillStyle = `rgba(255,240,200,${al * w})`; c.fillRect(x0 + dx, y0 + dy, 1, 1); }
            }
        }
    }
    LIVE.add({ active: () => !screensaver.on && !matchMedia("(prefers-reduced-motion: reduce)").matches && sunAmount() > 0 && dustWindows().length > 0, over: drawDust });      // still under reduced motion (10 Nov scan b, live 12)

    /* ---------- the screensaver: a minute idle, it zooms to 2x and bounces round the map like the DVD logo (dvdTick). Any input ends it ---------- */
    const IDLE_MS = window.HALLWAY_IDLE_MS || 60000, SPEED = 13, EASE = 1.6, FADE = 1.6, MAX_LEN = 2100, SS_ZOOM = 2, ZOOM_S = 1.5;
    const routes = new Map();
    /* the furthest apart two tiles can be, keeping off the walls */
    function floorRoute(l) {
        const key = l.cells.length; if (routes.has(l) && routes.get(l).key === key) return routes.get(l); const cells = new Set(l.cells), nb = ([a, b]) => [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]], dist = new Map(); let wave = [];
        for (const c of l.cells) { const v = c.split(",").map(Number); if (nb(v).some(n => !cells.has(n.join(",")))) { dist.set(c, 1); wave.push(v); } }
        while (wave.length) { const nx = []; for (const v of wave) for (const n of nb(v)) { const k = n.join(","); if (cells.has(k) && !dist.has(k)) { dist.set(k, dist.get(v.join(",")) + 1); nx.push(n); } } wave = nx; }
        const ok = c => (dist.get(c) || 0) >= 2, bfs = st => { const prev = new Map([[st, null]]), q = [st]; let last = st; for (let i = 0; i < q.length; i++) { last = q[i]; for (const n of nb(q[i].split(",").map(Number))) { const k = n.join(","); if (ok(k) && !prev.has(k)) { prev.set(k, q[i]); q.push(k); } } } return { prev, last, n: q.length }; };
        let best = null; const done = new Set(); for (const c of l.cells) { if (!ok(c) || done.has(c)) continue; const r = bfs(c); for (const k of r.prev.keys()) done.add(k); if (!best || r.n > best.n) best = { ...r, st: c }; }
        if (!best) { routes.set(l, { key, pts: [] }); return routes.get(l); }
        const r1 = bfs(best.st), r2 = bfs(r1.last), path = []; for (let c = r2.last; c; c = r2.prev.get(c)) path.push(c);
        const z = l.k * 163, rise = l.rise || {}; let pts = path.map(c => { const [cx, cy] = c.split(",").map(Number), r = rise[c] || 0; return [(cx - cy) * 32, (cx + cy) * 16 + 16 - z - r - 60]; });
        const smooth = (a, n) => a.map((_, i) => { let x = 0, y = 0, m = 0; for (let d = -n; d <= n; d++) { const q = a[Math.max(0, Math.min(a.length - 1, i + d))]; x += q[0]; y += q[1]; m++; } return [x / m, y / m]; }); pts = smooth(smooth(smooth(smooth(pts, 6), 6), 5), 4);
        let len = 0; const route = [pts[0]], seg = [0]; for (let i = 1; i < pts.length && len < MAX_LEN; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); route.push(pts[i]); seg.push(len); }
        const out = { key, pts: route, seg, len, secs: len / SPEED }; routes.set(l, out); return out;
    }
    const along = (r, d) => { let lo = 0, hi = r.seg.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.seg[m] <= d) lo = m; else hi = m; } const k = (d - r.seg[lo]) / Math.max(1e-6, r.seg[hi] - r.seg[lo]), a = r.pts[lo], b = r.pts[hi]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
    function ssStart() {
        const map = LIVE.map; if (!map || screensaver.on || !LIVE.walker) return false;
        /* not from the Basement: it has no route of its own, and gliding off to Ground from there is wrong */
        if (LIVE.floor && LIVE.floor.k < 0) return false;
        if (!map.rect) return false;
        /* the bounce (dvdTick): zoomed to 2x where you were looking, then off in one of the four slanted ways */
        const cam = LIVE.cam, z0 = LIVE.zoom || 1;
        Object.assign(screensaver, { on: true, floors: [], i: 0, cam: { x: cam.x, y: cam.y }, phase: "zoom", z0, zoomS: Math.abs(SS_ZOOM - z0) < .01 ? .01 : ZOOM_IN_S, t0: performance.now(), last: performance.now(), was: { cam, zoom: LIVE.zoom }, fade: 0, dim: 0,
            dir: { x: Math.random() < .5 ? -1 : 1, y: Math.random() < .5 ? -1 : 1 }, pos: { x: cam.x, y: cam.y }, vel: { x: 0, y: 0 }, turn: { x: null, y: null }, base: null, X: 0, Y: 0 });
        /* daytime: the evening comes on five seconds in (14 Nov 2026, his) */
        if (LIVE.eveningIn) LIVE.eveningIn(5);
        /* the music plays on (8 Nov 2026, his: it should keep playing when the screensaver starts) */
        LIVE.holdCamera(true); document.body.classList.add("hw-screensaver");
        if (!screensaver.title) { const t = screensaver.title = document.createElement("div"); t.className = "hw-ss-title"; t.setAttribute("aria-hidden", "true"); /* the Hallway's own card, and under it the way out on a little brass-edged plate to match (9 Nov 2026, his) */
            const big = document.createElement("img"), small = document.createElement("div"); big.className = "hw-ss-card"; big.src = "/assets/img/hallway-plaque-420.png"; big.srcset = "/assets/img/hallway-plaque-420.png 1x, /assets/img/hallway-plaque-420@2x.png 2x"; big.width = 420; big.height = 248; big.alt = ""; big.addEventListener("error", () => { const t2 = document.createElement("div"); t2.className = "hw-ss-name"; t2.textContent = "Maze Rats Hallway"; big.replaceWith(t2); });
            /* the way out: a slim plate in the card's own oak, brass and raised brass capitals (9 Nov 2026, his: the pixel lettering looked grim) */
            const tap = matchMedia("(pointer: coarse)").matches, words = tap ? "Tap to return to the Hallway" : "Click or press any key to return to the Hallway";
            small.className = "hw-ss-plate"; const plate = document.createElement("img"); const pb = "/assets/img/hallway-plate-" + (tap ? "tap" : "key"); plate.src = pb + ".png"; plate.srcset = pb + ".png 1x, " + pb + "@2x.png 2x"; plate.alt = words; plate.width = tap ? 393 : 599; plate.height = 56;
            plate.addEventListener("error", () => { small.className = "hw-ss-hint"; small.textContent = words; }); small.appendChild(plate); t.append(big, small); (document.getElementById("stage") || document.body).appendChild(t); }
        screensaver.title.classList.remove("on"); void screensaver.title.offsetWidth; screensaver.title.classList.add("on");
        LIVE.wake(); screensaver.raf = requestAnimationFrame(dvdTick); return true;
    }
    function ssEnd() {
        if (!screensaver.on) return; screensaver.on = false; cancelAnimationFrame(screensaver.raf); document.body.classList.remove("hw-screensaver"); if (screensaver.title) screensaver.title.classList.remove("on"); LIVE.forceMood(null); const w = screensaver.was;
        if (w.zoom && LIVE.zoomRaw) LIVE.zoomRaw(w.zoom);      /* your own zoom back */
        LIVE.camera(w.cam.x, w.cam.y); LIVE.holdCamera(false); LIVE.markActive(); LIVE.wake();
    }
    /* ---- The bounce (14 Nov 2026, his: "make it just bounce from one side of the map to the other, like the classic DVD player screensaver").
       The camera goes in a straight line on the floor's own slant, two across for one down, and turns back off whichever side of the map it
       meets, as the DVD logo does: no easing, no slowing (his: "it slows right down to a stutter"). At 2x it moves in whole steps of exactly
       two screen pixels across and one down, counted in screen pixels, so every line in the picture moves together and nothing shimmers (the
       flicker was across and down rounding at different moments). First it zooms to 2x where you were, slowly, easing in and out. */
    const DVD_SPEED = 34, ZOOM_IN_S = 4;          // screen pixels across a second, at 2x; how long the zoom takes
    const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    function dvdBounds(z) {
        const r = LIVE.map && LIVE.map.rect, v = LIVE.view(), hw = (v.x1 - v.x0) / 2, hh = (v.y1 - v.y0) / 2; if (!r) return null;
        const b = { x0: Math.ceil((r.x + hw) * z), x1: Math.floor((r.x + r.w - hw) * z), y0: Math.ceil((r.y + hh) * z), y1: Math.floor((r.y + r.h - hh) * z) };
        if (b.x1 < b.x0) b.x0 = b.x1 = Math.round((r.x + r.w / 2) * z); if (b.y1 < b.y0) b.y0 = b.y1 = Math.round((r.y + r.h / 2) * z);
        return b;
    }
    /* Moving from the first frame, while it zooms (14 Nov 2026, his: "the camera movement should start at the same time that zoom starts"). A side
       met swings that half of the way round over TURN_S rather than flipping, timed so the swing's turning point is the side itself (his:
       "the bounce is good, but make it smoother"). On the straight, at 2x, it's shown in whole steps of two across and one down from where the
       straight began, so lines still move together; only mid-swing and mid-zoom does each way round on its own. */
    const TURN_S = 1.4;
    function dvdTick(now) {
        if (!screensaver.on) return; screensaver.raf = requestAnimationFrame(dvdTick);
        const s = screensaver, dt = Math.min(.1, (now - s.last) / 1000); s.last = now; s.dim = Math.min(1, s.dim + dt / 2.5);
        /* the zoom, eased in and out */
        let z = LIVE.zoom;
        if (s.phase === "zoom") { const k = smooth((now - s.t0) / 1000 / s.zoomS); z = k >= 1 ? SS_ZOOM : s.z0 + (SS_ZOOM - s.z0) * k; if (LIVE.zoomRaw && LIVE.zoom !== z) LIVE.zoomRaw(z); if (k >= 1) s.phase = "move"; }
        const bd = dvdBounds(z); if (!bd) return;
        const b = { x0: bd.x0 / z, x1: bd.x1 / z, y0: bd.y0 / z, y1: bd.y1 / z }, V = DVD_SPEED / SS_ZOOM;      // in map pixels
        /* each way: its speed (a turn eases it from one sign to the other), and whether to start turning: when the swing that's left would
           just reach the side */
        for (const ax of ["x", "y"]) {
            const lo = ax === "x" ? b.x0 : b.y0, hi = ax === "x" ? b.x1 : b.y1, sp = ax === "x" ? V : V / 2, T = s.turn[ax];
            if (hi - lo < 1) { s.pos[ax] = (lo + hi) / 2; s.vel[ax] = 0; s.turn[ax] = null; continue; }
            if (T) { const u = (now - T.t0) / 1000 / TURN_S; if (u >= 1) { s.turn[ax] = null; s.dir[ax] = -s.dir[ax]; s.vel[ax] = s.dir[ax] * sp; s.base = null; } else s.vel[ax] = s.dir[ax] * sp * Math.cos(Math.PI * u); }
            else { s.vel[ax] = s.dir[ax] * sp; const room = s.dir[ax] > 0 ? hi - s.pos[ax] : s.pos[ax] - lo; if (room <= sp * TURN_S / Math.PI) s.turn[ax] = { t0: now }; }
            s.pos[ax] = Math.max(lo, Math.min(hi, s.pos[ax] + s.vel[ax] * dt));
        }
        /* shown: in locked steps on the straight at 2x, else to the nearest screen pixel each way */
        let X, Y;
        if (s.phase === "move" && !s.turn.x && !s.turn.y && z === SS_ZOOM) {
            const DX = s.pos.x * z, DY = s.pos.y * z;
            if (!s.base) s.base = { x: Math.round(DX), y: Math.round(DY), dx: s.dir.x, dy: s.dir.y };
            const n = Math.max(0, Math.floor(Math.abs(DX - s.base.x) / 2));
            X = s.base.x + 2 * n * s.base.dx; Y = s.base.y + n * s.base.dy;
            if (Math.abs(Y - DY) > 2) { s.base = { x: Math.round(DX), y: Math.round(DY), dx: s.dir.x, dy: s.dir.y }; X = s.base.x; Y = s.base.y; }
        } else { s.base = null; X = Math.round(s.pos.x * z); Y = Math.round(s.pos.y * z); }
        s.X = X; s.Y = Y; LIVE.camera(X / z, Y / z);
        /* the tiles about to show, asked for ahead of time in the light they'll be in */
        if (Math.floor(now / 500) !== s.asked) { s.asked = Math.floor(now / 500); const md = LIVE.mood(), moods = md ? [...new Set([md.a, md.b])] : [], v = LIVE.view(), hw = (v.x1 - v.x0) / 2, hh = (v.y1 - v.y0) / 2, ax = s.pos.x + s.dir.x * 160, ay = s.pos.y + s.dir.y * 80;
            for (let y = ay - hh; y <= ay + hh + 512; y += 512) for (let x = ax - hw; x <= ax + hw + 512; x += 512) for (const m of moods) LIVE.loadMood(m, x, y); }
    }
    LIVE.add({ active: () => screensaver.on, over(c) { const W = c.canvas.width, Hh = c.canvas.height, dim = .38 * (screensaver.dim || 0), f = screensaver.fade || 0; c.fillStyle = `rgba(0,0,0,${dim + (1 - dim) * f})`; c.fillRect(0, 0, W, Hh); } });
    setInterval(() => { if (!screensaver.on && !document.hidden && LIVE.walker && LIVE.idleFor > IDLE_MS && !LIVE.busy) ssStart(); }, 1000);
    /* the tap that ends it goes no further, so it doesn't send you walking */
    const stop = e => { if (!screensaver.on) return; e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); ssEnd(); };
    /* only a click, a tap or a key ends it: moving the mouse or the wheel doesn't */
    for (const ev of ["pointerdown", "mousedown", "keydown", "touchstart"]) window.addEventListener(ev, stop, { capture: true, passive: false });
    window.addEventListener("wheel", e => { if (screensaver.on) { e.preventDefault(); e.stopPropagation(); } }, { capture: true, passive: false });
    let lastMove = null; window.addEventListener("pointermove", e => { const was = lastMove; lastMove = [e.clientX, e.clientY]; if (!was || Math.hypot(e.clientX - was[0], e.clientY - was[1]) < 3) return; if (!screensaver.on) LIVE.markActive(); }, { capture: true, passive: true });
    window.HallwayScreensaver = { start: ssStart, stop: ssEnd, get on() { return screensaver.on; }, get state() { const f = screensaver.floors && screensaver.floors[screensaver.i]; return { phase: screensaver.phase, X: screensaver.X, Y: screensaver.Y, dx: screensaver.dir && screensaver.dir.x, dy: screensaver.dir && screensaver.dir.y, turning: !!(screensaver.turn && (screensaver.turn.x || screensaver.turn.y)), zoom: LIVE.zoom, mood: JSON.stringify(LIVE.mood()), floor: f && f.l.name }; } };
})();

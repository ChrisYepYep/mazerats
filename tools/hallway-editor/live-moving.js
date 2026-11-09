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
        for (const q of l.wallItems) { if (q.k !== "i_window") continue; const t = q.axis === "y" ? [q.line, Math.floor(q.at)] : [Math.floor(q.at), q.line], z = LIVE.nodeZ(l, t[0], t[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, q.at, z) : LIVE.mapPoint(q.at, q.line, z); if (inView(v, a, 260)) out.push({ q, z }); }
        return out;
    }
    function drawDust(c, ox, oy, now) {
        const sun = sunAmount(); if (sun <= 0 || screensaver.on) return; const t = now / 1000; toMap(c, ox, oy);
        for (const { q, z } of dustWindows()) {
            const W = q.w || 52, b = q.b || 0, top = q.top || 78, start = q.at - W / 32, n = Math.max(10, Math.min(46, Math.round(W * (top - b) / 110))), seed = q.at * 3 + q.line;
            for (let i = 0; i < n; i++) {
                const wy = hash(i, seed) * W, wz = b + hash(i + 40, seed) * (top - b), far = wz / -SUN[2], k = hash(i + 80, seed) * far, ph = i * 1.3 + seed;
                const mx = k * SUN[0] + Math.sin(t * .19 + ph) * 4, my = wy + k * SUN[1] + Math.cos(t * .23 + ph) * 4, mz = wz + k * SUN[2] + Math.sin(t * .13 + ph) * 3;
                const A = (q.axis === "y" ? LIVE.mapPoint(q.line + mx / 16, start + my / 16, z + Math.max(1, mz)) : LIVE.mapPoint(start + my / 16, q.line + mx / 16, z + Math.max(1, mz))), X = A[0], Y = A[1] - 6;
                const al = (.42 + Math.sin(t * .7 + ph) * .16) * sun, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
                for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) { c.fillStyle = `rgba(255,240,200,${al * w})`; c.fillRect(x0 + dx, y0 + dy, 1, 1); }
            }
        }
    }
    LIVE.add({ active: () => !screensaver.on && sunAmount() > 0 && dustWindows().length > 0, over: drawDust });

    /* ---------- the screensaver: a minute idle, the camera glides along a floor's paths, on the player's own map and inside its limits. Any input ends it ---------- */
    const IDLE_MS = window.HALLWAY_IDLE_MS || 60000, SPEED = 13, EASE = 1.6, FADE = 1.6, MAX_LEN = 2100;
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
        const floors = map.levels.filter(l => l.k >= 0 && l.cells && l.cells.length).map(l => ({ l, r: floorRoute(l) })).filter(f => f.r.len > 400); if (!floors.length) return false;
        /* the floor you're on, from the point on its path nearest where you were looking, going whichever way has further to go */
        const cam = LIVE.cam; let i = Math.max(0, floors.findIndex(f => f.l === LIVE.floor)), r = floors[i].r, best = 0, bd = 1e12; r.pts.forEach((p, k) => { const d = (p[0] - cam.x) ** 2 + (p[1] - cam.y) ** 2; if (d < bd) { bd = d; best = k; } });
        Object.assign(screensaver, { on: true, floors, i, d: r.seg[best], dir: r.seg[best] > r.len / 2 ? -1 : 1, cam: { x: cam.x, y: cam.y }, phase: "move", t0: performance.now(), last: performance.now(), was: { cam }, fade: 0, dim: 0 });
        /* the music plays on (8 Nov 2026, his: it should keep playing when the screensaver starts) */
        LIVE.holdCamera(true); document.body.classList.add("hw-screensaver");
        if (!screensaver.title) { const t = screensaver.title = document.createElement("div"); t.className = "hw-ss-title"; t.setAttribute("aria-hidden", "true"); /* the Hallway's own card, and under it the way out on a little brass-edged plate to match (9 Nov 2026, his) */
            const big = document.createElement("img"), small = document.createElement("div"); big.className = "hw-ss-card"; big.src = "/assets/img/hallway-plaque@2x.png"; big.alt = ""; big.addEventListener("error", () => { const t2 = document.createElement("div"); t2.className = "hw-ss-name"; t2.textContent = "Maze Rats Hallway"; big.replaceWith(t2); });
            /* the way out: a slim plate in the card's own oak, brass and raised brass capitals (9 Nov 2026, his: the pixel lettering looked grim) */
            const tap = matchMedia("(pointer: coarse)").matches, words = tap ? "Tap to return to the Hallway" : "Click or press any key to return to the Hallway";
            small.className = "hw-ss-plate"; const plate = document.createElement("img"); plate.src = "/assets/img/hallway-plate-" + (tap ? "tap" : "key") + "@2x.png"; plate.alt = words; plate.width = tap ? 336 : 507; plate.height = 50;
            plate.addEventListener("error", () => { small.className = "hw-ss-hint"; small.textContent = words; }); small.appendChild(plate); t.append(big, small); (document.getElementById("stage") || document.body).appendChild(t); }
        screensaver.title.classList.remove("on"); void screensaver.title.offsetWidth; screensaver.title.classList.add("on");
        LIVE.wake(); screensaver.raf = requestAnimationFrame(ssTick); return true;
    }
    function ssEnd() {
        if (!screensaver.on) return; screensaver.on = false; cancelAnimationFrame(screensaver.raf); document.body.classList.remove("hw-screensaver"); if (screensaver.title) screensaver.title.classList.remove("on"); LIVE.forceMood(null); const w = screensaver.was;
        LIVE.camera(w.cam.x, w.cam.y); LIVE.holdCamera(false); LIVE.markActive(); LIVE.wake();
    }
    function ssTick(now) {
        if (!screensaver.on) return; screensaver.raf = requestAnimationFrame(ssTick);
        const dt = Math.min(.1, (now - screensaver.last) / 1000); screensaver.last = now; const t = (now - screensaver.t0) / 1000;
        screensaver.dim = Math.min(1, screensaver.dim + dt / 2.5);
        let f = screensaver.floors[screensaver.i], r = f.r;
        if (screensaver.phase === "move") {
            screensaver.d += screensaver.dir * SPEED * dt;
            if ((screensaver.dir < 0 && screensaver.d <= 0) || (screensaver.dir > 0 && screensaver.d >= r.len)) { screensaver.d = Math.max(0, Math.min(r.len, screensaver.d)); if (screensaver.floors.length > 1) { screensaver.phase = "out"; screensaver.t0 = now; } else screensaver.dir = -screensaver.dir; }
        } else if (screensaver.phase === "out") {
            screensaver.fade = Math.min(1, t / FADE);
            if (t >= FADE) { screensaver.i = (screensaver.i + 1) % screensaver.floors.length; f = screensaver.floors[screensaver.i]; r = f.r; screensaver.d = 0; screensaver.dir = 1; const p = along(r, 0); screensaver.cam = { x: p[0], y: p[1] }; screensaver.phase = "in"; screensaver.t0 = now; }
        } else if (screensaver.phase === "in") {
            screensaver.fade = Math.max(0, 1 - t / FADE); screensaver.d += SPEED * dt; if (t >= FADE) screensaver.phase = "move";
        }
        /* the camera follows a point on the path on a soft spring, so no turn is ever sudden; from where you were looking, it eases in */
        const p = along(r, screensaver.d), k = 1 - Math.exp(-dt / EASE); let mx = (p[0] - screensaver.cam.x) * k, my = (p[1] - screensaver.cam.y) * k; const sp = Math.hypot(mx, my), cap = SPEED * 1.6 * dt; if (sp > cap) { mx *= cap / sp; my *= cap / sp; } screensaver.cam.x += mx; screensaver.cam.y += my; LIVE.camera(screensaver.cam.x, screensaver.cam.y); const real = LIVE.cam; screensaver.stuck = Math.hypot(real.x - screensaver.cam.x, real.y - screensaver.cam.y) > 2; screensaver.cam = { x: real.x, y: real.y };
        /* the time of day stays as it was (9 Nov 2026, his): a time you chose holds, and the day and night cycle runs on from where it was.
           The tiles about to show are asked for now, in the light they'll be in, so nothing arrives late */
        const md = LIVE.mood(), moods = md ? [...new Set([md.a, md.b])] : [];
        if (Math.floor(now / 500) !== screensaver.asked) { screensaver.asked = Math.floor(now / 500); const a = along(r, Math.max(0, Math.min(r.len, screensaver.d + screensaver.dir * 8 * SPEED))), v = LIVE.view(), hw = (v.x1 - v.x0) / 2, hh = (v.y1 - v.y0) / 2; for (let y = a[1] - hh; y <= a[1] + hh + 512; y += 512) for (let x = a[0] - hw; x <= a[0] + hw + 512; x += 512) for (const m of moods) LIVE.loadMood(m, x, y); }
    }
    LIVE.add({ active: () => screensaver.on, over(c) { const W = c.canvas.width, Hh = c.canvas.height, dim = .38 * (screensaver.dim || 0), f = screensaver.fade || 0; c.fillStyle = `rgba(0,0,0,${dim + (1 - dim) * f})`; c.fillRect(0, 0, W, Hh); } });
    setInterval(() => { if (!screensaver.on && !document.hidden && LIVE.walker && LIVE.idleFor > IDLE_MS && !LIVE.busy) ssStart(); }, 1000);
    /* the tap that ends it goes no further, so it doesn't send you walking */
    const stop = e => { if (!screensaver.on) return; e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); ssEnd(); };
    /* only a click, a tap or a key ends it: moving the mouse or the wheel doesn't */
    for (const ev of ["pointerdown", "mousedown", "keydown", "touchstart"]) window.addEventListener(ev, stop, { capture: true, passive: false });
    window.addEventListener("wheel", e => { if (screensaver.on) { e.preventDefault(); e.stopPropagation(); } }, { capture: true, passive: false });
    let lastMove = null; window.addEventListener("pointermove", e => { const was = lastMove; lastMove = [e.clientX, e.clientY]; if (!was || Math.hypot(e.clientX - was[0], e.clientY - was[1]) < 3) return; if (!screensaver.on) LIVE.markActive(); }, { capture: true, passive: true });
    window.HallwayScreensaver = { start: ssStart, stop: ssEnd, get on() { return screensaver.on; }, get state() { const f = screensaver.floors && screensaver.floors[screensaver.i]; return { phase: screensaver.phase, i: screensaver.i, floor: f && f.l.name, d: Math.round(screensaver.d), len: f && Math.round(f.r.len), dir: screensaver.dir, stuck: screensaver.stuck }; } };
})();

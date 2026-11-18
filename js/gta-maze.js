/* MAZE MAPS: the GTA skin's radar maze (19 Nov 2026; the owner's design,
   from the radar mock-ups v1-v4).

   Click the radar (or Drive in the phone's Maze Maps app) and the radar
   grows into a wide window with a street-map maze in it: the pink blip is
   you, the waypoint flag is the way out, and police blips (1 on Level 1,
   2 from Level 2; never more) patrol the streets, and give chase only
   when you come near. Touch one and you're BUSTED: the level
   starts again. Reach the flag and the level is passed, paying STREET CASH,
   the skin's own money (kept by js/skin-gta.js, shown only in the skin).

   Each level is a bigger map, 12x7 blocks growing to 20x12 by Level 8,
   then new layouts at that size. Bigger than the window, the map follows
   you, can be dragged to look ahead, and an orange arrow on the edge
   points at the flag.

   Mazes are made up here, never a real Maze Rats room (the owner's rule).

   Loaded by js/skin-gta.js the first time it is wanted. GtaMaze.mount(host,
   opts) builds a game in `host` and answers { destroy, focus, retry }.
   opts: { compact (the phone), level, bank, onPassed, onBusted, onClose }. */
(function () {
    "use strict";

    const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };

    /* ---- THE LEVELS */
    function sizeOf(level) {
        const k = Math.min(level, 8) - 1;
        return [12 + Math.round(k * 8 / 7), 7 + Math.round(k * 5 / 7)];
    }
    /* THE COPS PATROL (19 Nov 2026, the owner's: slower, "roaming around
       rather than chasing", two at most). Cells a second; you do 5. Was
       2.9 rising to 4.1, then 2.3 to 3.4. */
    const copsOf = (level) => (level >= 2 ? 2 : 1);
    const copSpeed = (level) => Math.min(2.4, 1.7 + 0.1 * (level - 1));
    const SPOT = 4;            // how near (in cells, along the grid) before a cop gives chase
    const PLAYER_SPEED = 5;
    const payOf = (level) => 500 * level;

    /* ---- THE MAZE: a grid of tiles, odd rows and columns the blocks' cells.
       1 is road, 0 is a block. A depth-first carve, then some walls knocked
       through so the streets loop: a dead end is death with a cop behind. */
    function makeMaze(nx, ny, rnd) {
        const W = 2 * nx + 1, H = 2 * ny + 1, g = Array.from({ length: H }, () => new Uint8Array(W));
        const seen = new Uint8Array(nx * ny), stack = [[0, 0]];
        seen[0] = 1; g[1][1] = 1;
        while (stack.length) {
            const [x, y] = stack[stack.length - 1];
            const nb = [];
            for (const [dx, dy] of Object.values(DIRS)) {
                const a = x + dx, b = y + dy;
                if (a >= 0 && b >= 0 && a < nx && b < ny && !seen[b * nx + a]) nb.push([a, b, dx, dy]);
            }
            if (!nb.length) { stack.pop(); continue; }
            const [a, b, dx, dy] = nb[Math.floor(rnd() * nb.length)];
            seen[b * nx + a] = 1; g[2 * y + 1 + dy][2 * x + 1 + dx] = 1; g[2 * b + 1][2 * a + 1] = 1;
            stack.push([a, b]);
        }
        // Loops: about one wall in eight between neighbours knocked through.
        let want = Math.round(nx * ny * 0.13), tries = 0;
        while (want > 0 && tries++ < 5000) {
            const x = 1 + Math.floor(rnd() * (W - 2)), y = 1 + Math.floor(rnd() * (H - 2));
            if (g[y][x]) continue;
            const across = x % 2 === 0 && y % 2 === 1, down = x % 2 === 1 && y % 2 === 0;
            if (across || down) { g[y][x] = 1; want--; }
        }
        return g;
    }
    function rng(seed) { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

    // Steps from a cell to every cell, along the roads (for the par time and the cops' spawn).
    function distances(g, nx, ny, from) {
        const d = new Int32Array(nx * ny).fill(-1), q = [from];
        d[from[1] * nx + from[0]] = 0;
        while (q.length) {
            const [x, y] = q.shift();
            for (const [dx, dy] of Object.values(DIRS)) {
                const a = x + dx, b = y + dy;
                if (a < 0 || b < 0 || a >= nx || b >= ny || d[b * nx + a] >= 0 || !g[2 * y + 1 + dy][2 * x + 1 + dx]) continue;
                d[b * nx + a] = d[y * nx + x] + 1; q.push([a, b]);
            }
        }
        return d;
    }

    /* ---- MOUNT */
    function mount(host, opts) {
        opts = opts || {};
        const compact = !!opts.compact;
        const R = compact ? 18 : 20, WL = compact ? 5 : 6, P = R + WL;     // road, block, cell pitch (CSS px)
        let level = Math.max(1, opts.level || 1);

        host.innerHTML =
            `<div class="gm-hud"><span class="gm-lv"></span><span class="gm-stars" aria-hidden="true"></span><span class="gm-cash"></span>` +
            `<button type="button" class="gm-x" aria-label="Close Maze Maps">✕</button></div>` +
            `<div class="gm-view"><canvas class="gm-cv" aria-label="Maze Maps: drive the pink blip to the flag" role="img"></canvas>` +
            `<div class="gm-say" hidden></div><div class="gm-card" hidden></div></div>` +
            `<div class="gm-foot">${compact ? "Hold the pad, or drag on the map" : "Hold arrows / WASD · drag the map to look"}</div>` +
            (compact ? `<div class="gm-pad" aria-label="Steer"><button type="button" data-dir="up" aria-label="Up">▲</button><button type="button" data-dir="left" aria-label="Left">◀</button><button type="button" data-dir="right" aria-label="Right">▶</button><button type="button" data-dir="down" aria-label="Down">▼</button></div>` : "");
        host.classList.add("gm", compact ? "gm-compact" : "gm-wide");
        const view = host.querySelector(".gm-view"), cv = host.querySelector(".gm-cv"), ctx = cv.getContext("2d");
        const say = host.querySelector(".gm-say"), card = host.querySelector(".gm-card");

        let VW = 336, VH = 208, dpr = 1;
        function size() {
            const r = view.getBoundingClientRect();
            VW = Math.max(160, Math.round(r.width)) || 336; VH = Math.max(120, Math.round(r.height)) || 208;
            dpr = Math.min(3, window.devicePixelRatio || 1);
            cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
            cv.style.width = VW + "px"; cv.style.height = VH + "px";
        }

        // ---- the level's state
        let g, nx, ny, MW, MH, mapCv, me, cops, exit, par, t0, state, bustedHere, camX, camY, dragged, raf = 0, last = 0, clock = 0;
        const px = (c) => WL + c * P + R / 2;      // a cell's (or a point between cells') centre, in map px

        function paintMap(rnd) {
            mapCv = document.createElement("canvas");
            mapCv.width = Math.ceil(MW * dpr); mapCv.height = Math.ceil(MH * dpr);
            const m = mapCv.getContext("2d");
            m.scale(dpr, dpr);
            // The blocks: one dark mass, its lots in slightly different greys (GTA V's map).
            m.fillStyle = "#35373a"; m.fillRect(0, 0, MW, MH);
            const H = g.length, W = g[0].length, X = (i) => Math.floor(i / 2) * P + (i % 2 ? WL : 0), S = (i) => (i % 2 ? R : WL);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!g[y][x]) {
                const r = rnd();
                m.fillStyle = r < 0.4 ? "#3a3c3f" : r < 0.7 ? "#323437" : "#3d3f42";
                m.fillRect(X(x), X(y), S(x), S(y));
            }
            // The streets: a dark kerb under grey tarmac.
            const seg = (w, col) => {
                m.lineWidth = w; m.strokeStyle = col; m.lineCap = "square"; m.beginPath();
                for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
                    if (cx < nx - 1 && g[2 * cy + 1][2 * cx + 2]) { m.moveTo(px(cx), px(cy)); m.lineTo(px(cx + 1), px(cy)); }
                    if (cy < ny - 1 && g[2 * cy + 2][2 * cx + 1]) { m.moveTo(px(cx), px(cy)); m.lineTo(px(cx), px(cy + 1)); }
                }
                m.stroke();
            };
            seg(R - 2, "#232427");
            seg(R - 5, "#aeb0b3");
        }

        function newLevel(keepMap) {
            if (!keepMap) {
                [nx, ny] = sizeOf(level);
                const rnd = rng(Date.now() ^ (level * 7919));
                g = makeMaze(nx, ny, rnd);
                MW = WL + nx * P; MH = WL + ny * P;
                paintMap(rnd);
                exit = [nx - 1, ny - 1];
                par = Math.max(4, distances(g, nx, ny, [0, 0])[exit[1] * nx + exit[0]] / 3.2);
            }
            me = { x: 0, y: 0, tx: 0, ty: 0, dir: null, moving: false };
            // Cops start well away from you, and come out one by one.
            const far = distances(g, nx, ny, [0, 0]);
            const spots = [[nx - 1, 0], [0, ny - 1], [Math.floor(nx / 2), Math.floor(ny / 2)], [nx - 1, Math.floor(ny / 2)]]
                .filter(([x, y]) => far[y * nx + x] >= 6);
            cops = [];
            for (let i = 0; i < copsOf(level); i++) {
                const [x, y] = spots[i % spots.length] || [nx - 1, 0];
                cops.push({ x, y, tx: x, ty: y, dir: null, moving: false, wait: 0.9 + i * 1.4, phase: i * 0.37, kind: i });
            }
            state = "play"; bustedHere = bustedHere || false; t0 = 0; clock = 0; dragged = false;
            camX = 0; camY = 0;
            hud();
            card.hidden = true;
            flash("Level " + level, 1100);
        }

        let sayTimer = 0;
        function flash(text, ms) {
            say.textContent = text; say.hidden = false;
            clearTimeout(sayTimer); sayTimer = setTimeout(() => { say.hidden = true; }, ms);
        }
        function hud() {
            host.querySelector(".gm-lv").textContent = "Level " + level;
            host.querySelector(".gm-stars").textContent = "★".repeat(copsOf(level));
            host.querySelector(".gm-cash").textContent = money(opts.bank ? opts.bank.street() : 0);
        }

        // ---- moving on the grid of cells
        const open = (x, y, d) => {
            const [dx, dy] = DIRS[d], a = x + dx, b = y + dy;
            return a >= 0 && b >= 0 && a < nx && b < ny && g[2 * y + 1 + dy][2 * x + 1 + dx] === 1;
        };
        const opposite = { up: "down", down: "up", left: "right", right: "left" };
        function stepTo(ent, d) { const [dx, dy] = DIRS[d]; ent.tx = ent.x + dx; ent.ty = ent.y + dy; ent.dir = d; ent.moving = true; }
        // Moves an entity `dist` cells towards its target; answers true on arriving.
        function advance(ent, dist) {
            const dx = ent.tx - ent.x, dy = ent.ty - ent.y, left = Math.abs(dx) + Math.abs(dy);
            if (left <= dist) { ent.x = ent.tx; ent.y = ent.ty; ent.moving = false; return dist - left; }
            ent.x += Math.sign(dx) * dist; ent.y += Math.sign(dy) * dist; return -1;
        }

        function movePlayer(dt) {
            let budget = PLAYER_SPEED * dt;
            /* ONLY WHILE A KEY IS HELD (19 Nov 2026, the owner's: "no movement
               if there's no input"). Let go and the blip finishes the step it
               is on, to the next junction, and stops there. Several held: the
               newest that can be taken. */
            const wants = inputs();
            // Turning round is allowed at any moment, mid-street.
            if (me.moving && wants[0] && wants[0] === opposite[me.dir]) {
                me.tx -= DIRS[me.dir][0]; me.ty -= DIRS[me.dir][1];     // back to the cell just left
                me.dir = wants[0];
            }
            for (let guard = 0; guard < 4 && budget > 0; guard++) {
                if (!me.moving) {
                    const cx = Math.round(me.x), cy = Math.round(me.y);
                    me.x = cx; me.y = cy;
                    const go = wants.find((d) => open(cx, cy, d));
                    if (go) stepTo(me, go);
                    else { me.dir = null; return; }
                    if (!t0) t0 = clock || 0.0001;
                }
                const left = advance(me, budget);
                if (left < 0) return;
                budget = left;
                if (me.x === exit[0] && me.y === exit[1]) { passed(); return; }
            }
        }

        // Near you: straight for you. Otherwise null: the cop wanders.
        function copTarget(c) {
            return Math.abs(c.x - me.x) + Math.abs(c.y - me.y) <= SPOT ? [me.x, me.y] : null;
        }
        function moveCop(c, dt) {
            if (c.wait > 0) { c.wait -= dt; return; }
            let budget = copSpeed(level) * dt;
            for (let guard = 0; guard < 4 && budget > 0; guard++) {
                if (!c.moving) {
                    const target = copTarget(c);
                    let best = null, bestD = Infinity;
                    const choices = Object.keys(DIRS).filter((d) => open(c.x, c.y, d));
                    const ahead = choices.filter((d) => d !== opposite[c.dir]), pick = ahead.length ? ahead : choices;
                    if (!target) {
                        // Patrolling: on along the street, and at a junction a turn now and then.
                        best = c.dir && pick.includes(c.dir) && Math.random() < 0.55 ? c.dir : pick[Math.floor(Math.random() * pick.length)];
                    } else pick.forEach((d) => {
                        const [dx, dy] = DIRS[d], ax = c.x + dx - target[0], ay = c.y + dy - target[1], dd = ax * ax + ay * ay;
                        if (dd < bestD) { bestD = dd; best = d; }
                    });
                    if (!best) return;
                    stepTo(c, best);
                }
                const left = advance(c, budget);
                if (left < 0) return;
                budget = left;
            }
        }

        // ---- the camera: on the blip, unless dragged; back on it when the blip nears an edge
        function camera(dt, snap) {
            const maxX = Math.max(0, MW - VW), maxY = Math.max(0, MH - VH);
            const bx = px(me.x), by = px(me.y);
            let wantX = camX, wantY = camY;
            /* Dragged away, the map stays there until the blip moves again (the owner's, 19 Nov 2026:
               it kept springing back while being looked round). */
            if (dragged && me.moving) dragged = false;
            if (!dragged) { wantX = bx - VW / 2; wantY = by - VH / 2; }
            wantX = Math.max(0, Math.min(maxX, wantX)); wantY = Math.max(0, Math.min(maxY, wantY));
            const k = snap ? 1 : 1 - Math.exp(-dt * 8);
            if (!dragged) { camX += (wantX - camX) * k; camY += (wantY - camY) * k; }
            if (MW < VW) camX = -(VW - MW) / 2;
            if (MH < VH) camY = -(VH - MH) / 2;
        }

        // ---- drawing
        function blip(x, y, fill, glow, r) {
            const gr = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2);
            gr.addColorStop(0, glow); gr.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill();
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
            ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r - 1.6, 0, 7); ctx.fill();
            // a soft highlight, top left
            const hl = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x - r * 0.35, y - r * 0.4, r * 0.8);
            hl.addColorStop(0, "rgba(255,255,255,.45)"); hl.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(x, y, r - 1.6, 0, 7); ctx.fill();
        }
        function flag(x, y) {
            // A white flag on a pole, outlined 3px in black (the owner's).
            const s = R / 20;
            ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
            ctx.lineJoin = "round"; ctx.lineCap = "round";
            const shape = () => { ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(-4, -8); ctx.lineTo(7, -4.5); ctx.lineTo(-4, -1); };
            ctx.lineWidth = 6; ctx.strokeStyle = "#000"; shape(); ctx.stroke();     // centred on the edge: 3px shows outside it
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(7, -4.5); ctx.lineTo(-4, -1); ctx.closePath(); ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(-4, -8); ctx.stroke();
            ctx.restore();
        }
        function arrowTo(tx, ty) {
            // Off screen: an orange arrow on the window's edge, pointing at the flag.
            const cx = VW / 2, cy = VH / 2, dx = tx - cx, dy = ty - cy, inset = 14;
            const k = Math.min((VW / 2 - inset) / Math.abs(dx || 1e-6), (VH / 2 - inset) / Math.abs(dy || 1e-6));
            const ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx);
            ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
            ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.moveTo(11, 1.5); ctx.lineTo(-7, -7.5); ctx.lineTo(-7, 10.5); ctx.fill();
            ctx.fillStyle = "#1e1f21"; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -8.5); ctx.lineTo(-7, 8.5); ctx.fill();
            ctx.fillStyle = "#ffa23a"; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5.5, -6.5); ctx.lineTo(-5.5, 0); ctx.fill();
            ctx.fillStyle = "#e06a12"; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5.5, 6.5); ctx.lineTo(-5.5, 0); ctx.fill();
            ctx.strokeStyle = "rgba(255,220,170,.8)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4.5, -5.2); ctx.lineTo(6.5, -0.4); ctx.stroke();
            ctx.restore();
        }
        function draw() {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = "#35373a"; ctx.fillRect(0, 0, VW, VH);
            ctx.drawImage(mapCv, -camX, -camY, MW, MH);
            ctx.save(); ctx.translate(-camX, -camY);
            const fx = px(exit[0]), fy = px(exit[1]);
            flag(fx, fy);
            cops.forEach((c) => {
                const red = Math.floor(clock * 3.2 + c.phase * 2) % 2 === 0;
                blip(px(c.x), px(c.y), red ? "#ff2e3d" : "#3d7bff", red ? "rgba(255,40,50,.55)" : "rgba(60,120,255,.55)", R * 0.27);
            });
            blip(px(me.x), px(me.y), "#ff5fa2", "rgba(255,95,162,.5)", R * 0.31);
            ctx.restore();
            if (fx - camX < 0 || fx - camX > VW || fy - camY < 0 || fy - camY > VH) arrowTo(fx - camX, fy - camY);
        }

        // ---- the loop
        function frame(t) {
            raf = 0;
            const dt = Math.min(0.05, last ? (t - last) / 1000 : 0);
            last = t;
            if (state === "play") {
                clock += dt;
                movePlayer(dt);
                if (state === "play") {
                    cops.forEach((c) => moveCop(c, dt));
                    const hit = cops.some((c) => c.wait <= 0 && Math.hypot(px(c.x) - px(me.x), px(c.y) - px(me.y)) < R * 0.55);
                    if (hit) busted();
                }
            } else clock += dt;
            camera(dt);
            draw();
            if (alive) raf = requestAnimationFrame(frame);
        }

        function passed() {
            state = "passed";
            const secs = clock - (t0 || 0);
            const result = opts.bank ? opts.bank.pass(level, secs, payOf(level), par, bustedHere) : { paid: payOf(level), best: false };
            hud();
            card.innerHTML = `<h3>Mission passed</h3><p>Level ${level} · <b>+${esc(money(result.paid))}</b> · ${secs.toFixed(1)}s` +
                `${result.note ? `<br><small>${esc(result.note)}</small>` : ""}</p>` +
                `<button type="button" class="gm-next">Level ${level + 1} ▸</button>`;
            card.hidden = false;
            card.querySelector(".gm-next").focus({ preventScroll: true });
            bustedHere = false;
            if (opts.onPassed) opts.onPassed(level, result);
        }
        function busted() {
            state = "busted";
            bustedHere = true;
            if (opts.bank) opts.bank.bust();
            card.innerHTML = `<h3 class="is-bust">Busted</h3><p>Level ${level} · cash already banked stays</p><button type="button" class="gm-retry">Try again ▸</button>`;
            card.hidden = false;
            if (opts.onBusted) opts.onBusted(level);
        }
        function retry() { if (state === "busted") { newLevel(true); host.focus({ preventScroll: true }); } }
        function next() { if (state === "passed") { level++; newLevel(false); host.focus({ preventScroll: true }); } }

        // ---- input: what is held down right now
        const CODES = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
        let held = [], padDir = null, touchDir = null;
        const keyDir = (e) => CODES[e.code] || KEYS[e.key];
        function inputs() {
            const out = [];
            [touchDir, padDir].concat(held.map((c) => c.dir).reverse()).forEach((d) => { if (d && !out.includes(d)) out.push(d); });
            return out;
        }
        function onKeyUp(e) {
            const id = e.code || e.key;
            held = held.filter((h) => h.id !== id && !(h.key && h.key.toLowerCase() === String(e.key).toLowerCase()));
        }
        function onBlur() { held = []; padDir = null; touchDir = null; }
        function onKey(e) {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
            const a = document.activeElement;
            if (a && a !== host && !host.contains(a) && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
            const d = keyDir(e);
            if (d) {
                e.preventDefault();
                const id = e.code || e.key;
                if (!held.some((h) => h.id === id)) held.push({ id, key: e.key, dir: d });
                return;
            }
            if ((e.key === " " || e.key === "Enter") && state !== "play") {
                if (a && a.tagName === "BUTTON" && host.contains(a)) return;   // the button's own click does it
                e.preventDefault();
                if (state === "busted") retry(); else next();
            }
        }
        // Swipes and the pad on a phone; a drag on a computer looks around.
        let drag = null;
        function onDown(e) {
            if (e.button != null && e.button !== 0) return;
            drag = { x: e.clientX, y: e.clientY, cx: camX, cy: camY, moved: false, id: e.pointerId, touch: e.pointerType === "touch" };
            try { cv.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        }
        function onMove(e) {
            if (!drag || e.pointerId !== drag.id) return;
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
            // A finger held and dragged on the map steers, for as long as it is down.
            if (drag.touch && Math.abs(dx) + Math.abs(dy) > 18) touchDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
            if (!drag.touch && drag.moved && (MW > VW || MH > VH)) {
                dragged = true;
                camX = Math.max(0, Math.min(Math.max(0, MW - VW), drag.cx - dx));
                camY = Math.max(0, Math.min(Math.max(0, MH - VH), drag.cy - dy));
                if (MW < VW) camX = -(VW - MW) / 2;
                if (MH < VH) camY = -(VH - MH) / 2;
            }
        }
        function onUp(e) {
            if (!drag || e.pointerId !== drag.id) return;
            touchDir = null;
            drag = null;
        }
        function onClick(e) {
            const b = e.target.closest("button");
            if (!b) return;
            if (b.classList.contains("gm-x")) { if (opts.onClose) opts.onClose(); }
            else if (b.classList.contains("gm-next")) next();
            else if (b.classList.contains("gm-retry")) retry();
        }
        function onPad(e) {
            const b = e.target.closest("[data-dir]");
            if (!b) return;
            e.preventDefault();
            padDir = b.dataset.dir;
            try { b.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        }
        function onPadUp() { padDir = null; }
        function onVis() { last = 0; }

        let alive = true;
        const ro = window.ResizeObserver ? new ResizeObserver(() => { size(); camera(0, true); if (!raf && alive) draw(); }) : null;
        host.tabIndex = -1;
        document.addEventListener("keydown", onKey, true);
        document.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("blur", onBlur);
        cv.addEventListener("pointerdown", onDown);
        cv.addEventListener("pointermove", onMove);
        cv.addEventListener("pointerup", onUp);
        cv.addEventListener("pointercancel", onUp);
        host.addEventListener("click", onClick);
        const pad = host.querySelector(".gm-pad");
        if (pad) { pad.addEventListener("pointerdown", onPad); ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => pad.addEventListener(t, onPadUp)); }
        document.addEventListener("visibilitychange", onVis);
        if (ro) ro.observe(view);

        size();
        newLevel(false);
        camera(0, true);
        draw();
        raf = requestAnimationFrame(frame);

        return {
            destroy() {
                alive = false;
                cancelAnimationFrame(raf); raf = 0;
                clearTimeout(sayTimer);
                document.removeEventListener("keydown", onKey, true);
                document.removeEventListener("keyup", onKeyUp, true);
                window.removeEventListener("blur", onBlur);
                document.removeEventListener("visibilitychange", onVis);
                if (ro) ro.disconnect();
                host.innerHTML = "";
                host.classList.remove("gm", "gm-compact", "gm-wide");
            },
            focus() { host.focus({ preventScroll: true }); },
            retry,
            resize() { size(); camera(0, true); draw(); },
            // For testing on the dev server only.
            _t: location.hostname === "localhost" ? { get me() { return me; }, get cops() { return cops; }, get exit() { return exit; } } : undefined,
            get level() { return level; },
            get state() { return state; }
        };
    }

    window.GtaMaze = { mount, sizeOf, copsOf };
})();

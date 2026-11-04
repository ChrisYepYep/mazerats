/* ===========================================================
   Maze Rats: the Prize Wheel's drawing, its spin and its sound
   (2 Nov 2026, taken out of js/prize-wheel.js)

   One copy of everything that makes the wheel look, turn and sound the way
   it does, shared by the Warren's live wheel (js/prize-wheel.js) and an
   article's replay of a draw (js/article-wheel.js), so a replay is the
   same wheel and not a lookalike. Moved here unchanged: the live wheel
   draws pixel for pixel as it did.

     PARTS    drawRim(px), drawGloss(px) and drawDisk(px, names, opts) each
              return a canvas px square, drawn on the 720 x 720 plan below
              (the rim and its sockets, the still gloss over the disk, and
              the turning disk: slices, names, pegs and the maze in the hub).
     FRAME    render(canvas, parts, state) puts them together for one
              frame: the disk turned by state.rot, a slice lit up, the bulbs.
     SPIN     plan() works the whole spin out before it starts, so it lands
              exactly where the draw said; at(spin, s) is where it is s
              seconds in. A replay given the same plan turns the same way.
     SOUND    sound(muteKey): Web Audio, made on the first press, never
              before (a page may not start sound by itself).
     SNAPSHOT snapshot(row, title): what an article keeps of a draw.

   Nothing here touches the page except the canvases it is handed.
   =========================================================== */
(function (root) {
    "use strict";

    const WHEEL = 720;                       // the wheel canvas, square
    const CX = WHEEL / 2, CY = WHEEL / 2;
    const R_OUT = 350, R_DISK = 308, R_HUB = 76, R_BULB = 329;
    const BULBS = 40;
    const TAU = Math.PI * 2;
    const JEWELS = [
        ["#5a1f17", "#923826"],   // crimson
        ["#2c1d40", "#53397a"],   // purple
        ["#13324a", "#25607f"],   // frost blue
        ["#4a3018", "#80572b"],   // classic amber
        ["#1f3a1e", "#3d6e36"]    // moss
    ];
    /* Montserrat, the wordmark's face, not the pixel one (1 Nov 2026, the
       owner's: Silkscreen's capitals were hard to read turned on their
       side, and they lost the names' own capitals). */
    const NAME_FONT = "'Montserrat', 'Roboto', sans-serif";
    const NAME_WEIGHT = 700;
    const nameFont = size => `${NAME_WEIGHT} ${size}px ${NAME_FONT}`;

    // The spin's fixed parts, in seconds (the decel is the draw's own).
    const WIND_UP = 0.55, ACCEL = 0.9;

    const mod = (a, m) => ((a % m) + m) % m;

    // A seeded generator for the decoration only (the medallion's maze).
    function seeded(seed) {
        return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    }

    // A canvas px square, its context set to draw on the 720 plan.
    function offscreen(px) {
        const c = document.createElement("canvas");
        c.width = c.height = px;
        const ctx = c.getContext("2d");
        const k = c.width / WHEEL;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        return [c, ctx];
    }

    /* The hub's maze (1 Nov 2026, the owner's: the first was random arcs
       and spokes that only looked like a maze). A real one now: a perfect
       maze on a polar grid, carved by a seeded backtracker so it is the same
       every time, with its way in at the top of the outer wall and its goal
       in the middle. Returns its walls as one path. */
    function thetaMaze(r0, r1, seed) {
        const cells = [6, 12, 12, 24];
        const rings = cells.length, step = (r1 - r0) / rings;
        const R = seeded(seed);
        const open = new Set();
        const id = (i, j) => i + ":" + j;
        const link = (a, b) => { open.add(a + "|" + b); open.add(b + "|" + a); };
        const linked = (a, b) => open.has(a + "|" + b);
        function neighbours(i, j) {
            const n = cells[i], out = [[i, (j + 1) % n], [i, (j + n - 1) % n]];
            if (i > 0) out.push([i - 1, Math.floor(j * cells[i - 1] / n)]);
            if (i < rings - 1) {
                const k = cells[i + 1] / n;
                for (let m = 0; m < k; m++) out.push([i + 1, j * k + m]);
            }
            return out;
        }
        const seen = new Set([id(rings - 1, 0)]);
        const stack = [[rings - 1, 0]];
        while (stack.length) {
            const [i, j] = stack[stack.length - 1];
            const next = neighbours(i, j).filter(([a, b]) => !seen.has(id(a, b)));
            if (!next.length) { stack.pop(); continue; }
            const [a, b] = next[Math.floor(R() * next.length)];
            link(id(i, j), id(a, b));
            seen.add(id(a, b));
            stack.push([a, b]);
        }
        // angles start at the top, like the slices
        const ang = (i, j) => j / cells[i] * TAU - Math.PI / 2;
        const p = new Path2D();
        for (let i = 0; i < rings; i++) {
            const n = cells[i], rIn = r0 + i * step;
            for (let j = 0; j < n; j++) {
                const a0 = ang(i, j), a1 = ang(i, j + 1);
                // the cell's inner wall: open into the middle from cell 0
                // of the first ring, else where it was carved through
                const inward = i === 0 ? j === 0 : linked(id(i, j), id(i - 1, Math.floor(j * cells[i - 1] / n)));
                if (!inward) { p.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn); p.arc(0, 0, rIn, a0, a1); }
                // its wall with the cell before it, going round
                if (!linked(id(i, j), id(i, (j + n - 1) % n))) {
                    p.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn);
                    p.lineTo(Math.cos(a0) * (rIn + step), Math.sin(a0) * (rIn + step));
                }
            }
        }
        // the outer wall, with the way in at the top
        const n = cells[rings - 1], gap = TAU / n;
        p.moveTo(Math.cos(-Math.PI / 2 + gap) * r1, Math.sin(-Math.PI / 2 + gap) * r1);
        p.arc(0, 0, r1, -Math.PI / 2 + gap, -Math.PI / 2 + TAU);
        return p;
    }

    // The rim: drawn once per size. The bulbs go on top each frame.
    function drawRim(px) {
        const [c, ctx] = offscreen(px);
        ctx.translate(CX, CY);
        // a soft shadow under the whole wheel
        const sh = ctx.createRadialGradient(0, 10, R_OUT - 30, 0, 10, R_OUT + 14);
        sh.addColorStop(0, "rgba(0,0,0,.55)"); sh.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 10, R_OUT + 14, 0, TAU); ctx.fill();
        // the wooden ring
        const g = ctx.createRadialGradient(0, 0, R_DISK, 0, 0, R_OUT);
        g.addColorStop(0, "#2a1a0b"); g.addColorStop(0.35, "#5a3a1a"); g.addColorStop(0.7, "#4a2f14"); g.addColorStop(1, "#2a1a0b");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R_OUT, 0, TAU); ctx.fill();
        // its top-lit sheen
        const lg = ctx.createLinearGradient(0, -R_OUT, 0, R_OUT);
        lg.addColorStop(0, "rgba(255,226,170,.16)"); lg.addColorStop(0.5, "rgba(255,226,170,0)"); lg.addColorStop(1, "rgba(0,0,0,.25)");
        ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(0, 0, R_OUT, 0, TAU); ctx.arc(0, 0, R_DISK, 0, TAU, true); ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = "#0b0704"; ctx.beginPath(); ctx.arc(0, 0, R_OUT - 2, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(227,196,143,.45)"; ctx.beginPath(); ctx.arc(0, 0, R_OUT - 6, 0, TAU); ctx.stroke();
        // the bulbs' sockets
        for (let i = 0; i < BULBS; i++) {
            const a = (i + 0.5) / BULBS * TAU - Math.PI / 2, x = Math.cos(a) * R_BULB, y = Math.sin(a) * R_BULB;
            ctx.fillStyle = "#1a1007"; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, TAU); ctx.fill();
            ctx.strokeStyle = "#8a6c48"; ctx.lineWidth = 1.5; ctx.stroke();
        }
        return c;
    }

    // The gloss: a still highlight over the turning disk, so it reads as a
    // curved, lacquered face rather than a flat picture going round.
    function drawGloss(px) {
        const [c, ctx] = offscreen(px);
        ctx.translate(CX, CY);
        ctx.save();
        ctx.beginPath(); ctx.arc(0, 0, R_DISK, 0, TAU); ctx.clip();
        const g = ctx.createRadialGradient(-R_DISK * 0.35, -R_DISK * 0.45, 10, -R_DISK * 0.2, -R_DISK * 0.25, R_DISK * 1.1);
        g.addColorStop(0, "rgba(255,240,210,.20)"); g.addColorStop(0.45, "rgba(255,240,210,.05)"); g.addColorStop(1, "rgba(0,0,0,.28)");
        ctx.fillStyle = g; ctx.fillRect(-R_DISK, -R_DISK, R_DISK * 2, R_DISK * 2);
        // an inner shadow under the rim's lip
        const s = ctx.createRadialGradient(0, 0, R_DISK - 22, 0, 0, R_DISK);
        s.addColorStop(0, "rgba(0,0,0,0)"); s.addColorStop(1, "rgba(0,0,0,.45)");
        ctx.fillStyle = s; ctx.fillRect(-R_DISK, -R_DISK, R_DISK * 2, R_DISK * 2);
        ctx.restore();
        // the brass lip between the rim and the disk
        ctx.lineWidth = 5; ctx.strokeStyle = "#e3c48f"; ctx.beginPath(); ctx.arc(0, 0, R_DISK + 1, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.strokeStyle = "#0b0704"; ctx.beginPath(); ctx.arc(0, 0, R_DISK + 4, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, R_DISK - 2, 0, TAU); ctx.stroke();
        return c;
    }

    // Each slice's span, in the disk's own angles: 0 is the pointer at rot 0.
    function spans(weights) {
        const total = weights.reduce((n, w) => n + w, 0) || 1;
        let a = 0;
        return weights.map(w => { const s = a; a += w / total * TAU; return [s, a]; });
    }

    // The palette's place for slice i of n.
    function jewelIndex(i, n) {
        let k = i % JEWELS.length;
        // the last slice never matches the first it sits beside
        if (n > 1 && i === n - 1 && k === 0) k = 2;
        return k;
    }
    const sliceColour = (i, n) => JEWELS[jewelIndex(i, n)];

    /* One size for every name on the wheel, so it reads as a set (1 Nov
       2026, the owner's: names were too big and one was cut off): the
       slices' own limit, brought down until the long names fit too, but
       not below seven-tenths of it for the sake of one very long name;
       that name alone shrinks further, and loses its end only past half. */
    function nameSize(ctx, names, base, room) {
        let size = base;
        names.forEach(name => {
            ctx.font = nameFont(base);
            const w = ctx.measureText(name).width;
            if (w > room) size = Math.min(size, base * room / w);
        });
        return Math.max(size, base * 0.7);
    }
    function fitName(ctx, name, size, room) {
        let fs = size;
        ctx.font = nameFont(fs);
        let w = ctx.measureText(name).width;
        if (w > room) {
            fs = Math.max(7, size * 0.5, size * room / w);
            ctx.font = nameFont(fs);
            w = ctx.measureText(name).width;
        }
        let text = name;
        if (w > room) {
            while (text.length > 1 && ctx.measureText(text + "…").width > room) text = text.slice(0, -1);
            text += "…";
        }
        return text;
    }

    /* The disk: names (in wheel order), opts.weights (one each when left
       out) and opts.colours (each slice's place in JEWELS, as a draw
       recorded them; the usual order when left out). */
    function drawDisk(px, names, opts) {
        const [c, ctx] = offscreen(px);
        ctx.translate(CX, CY);
        const n = names.length;
        const weights = opts && Array.isArray(opts.weights) ? opts.weights : names.map(() => 1);
        const colours = opts && Array.isArray(opts.colours) && opts.colours.length === n ? opts.colours : null;
        const sp = spans(weights);
        if (!n) {
            ctx.fillStyle = "#24170b"; ctx.beginPath(); ctx.arc(0, 0, R_DISK, 0, TAU); ctx.fill();
        }
        sp.forEach(([a0, a1], i) => {
            if (a1 - a0 <= 0.0001) return;
            const [dark, light] = colours ? JEWELS[colours[i]] || sliceColour(i, n) : sliceColour(i, n);
            const g = ctx.createRadialGradient(0, 0, R_HUB, 0, 0, R_DISK);
            g.addColorStop(0, light); g.addColorStop(1, dark);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R_DISK, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.closePath(); ctx.fill();
        });
        // the dividers
        if (n > 1) {
            ctx.strokeStyle = "rgba(227,196,143,.55)"; ctx.lineWidth = n > 80 ? 0.8 : 1.6;
            sp.forEach(([a0]) => {
                const a = a0 - Math.PI / 2;
                ctx.beginPath(); ctx.moveTo(Math.cos(a) * R_HUB, Math.sin(a) * R_HUB); ctx.lineTo(Math.cos(a) * R_DISK, Math.sin(a) * R_DISK); ctx.stroke();
            });
        }
        // the names, outward along each slice, right up to the rim
        const outer = R_DISK - 26, inner = R_HUB + 16, room = outer - inner;
        if (n) {
            // the slice's height where a long name's inner end sits caps it
            const base = Math.min(22, (TAU / n) * (inner + room * 0.4) * 0.72);
            const size = nameSize(ctx, names, base, room);
            if (size >= 7) sp.forEach(([a0, a1], i) => {
                const am = (a0 + a1) / 2 - Math.PI / 2;
                ctx.save();
                ctx.rotate(am);
                const text = fitName(ctx, names[i], size, room);
                ctx.textAlign = "right"; ctx.textBaseline = "middle";
                ctx.fillStyle = "rgba(0,0,0,.6)";
                ctx.fillText(text, outer + 1.2, 2.2);
                ctx.fillStyle = "#f8ecd0";
                ctx.fillText(text, outer, 1);
                ctx.restore();
            });
        }
        // the pegs the pointer clicks over, one on each divider
        const pegR = n > 120 ? 0 : n > 60 ? 2.6 : 4.2;
        if (pegR) sp.forEach(([a0]) => {
            const a = a0 - Math.PI / 2, r = R_DISK - 9;
            const x = Math.cos(a) * r, y = Math.sin(a) * r;
            ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.beginPath(); ctx.arc(x + 0.8, y + 1.6, pegR, 0, TAU); ctx.fill();
            const g = ctx.createRadialGradient(x - pegR * 0.4, y - pegR * 0.4, 0.5, x, y, pegR);
            g.addColorStop(0, "#fff4d6"); g.addColorStop(0.5, "#e3c48f"); g.addColorStop(1, "#8a6c48");
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, pegR, 0, TAU); ctx.fill();
        });
        drawHub(ctx);
        return c;
    }

    /* The hub: a brass medallion with the maze standing up out of it, its
       walls lit from the top left like the rest of the wheel. */
    const HUB_MAZE = { path: null };
    function drawHub(ctx) {
        const rIn = 13, rOut = R_HUB - 12;
        if (!HUB_MAZE.path) HUB_MAZE.path = thetaMaze(rIn, rOut, 20261101);
        const walls = HUB_MAZE.path;
        // its shadow on the slices, and a dark ring round it
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,.65)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 5;
        ctx.fillStyle = "#0b0704"; ctx.beginPath(); ctx.arc(0, 0, R_HUB + 4, 0, TAU); ctx.fill();
        ctx.restore();
        // the bezel
        const bz = ctx.createLinearGradient(-R_HUB, -R_HUB, R_HUB, R_HUB);
        bz.addColorStop(0, "#fff1c4"); bz.addColorStop(0.45, "#d6b47c"); bz.addColorStop(1, "#6e5030");
        ctx.fillStyle = bz; ctx.beginPath(); ctx.arc(0, 0, R_HUB, 0, TAU); ctx.fill();
        // the sunken floor the maze stands on
        const fl = ctx.createRadialGradient(-12, -14, 4, 0, 0, R_HUB - 6);
        fl.addColorStop(0, "#a8834f"); fl.addColorStop(1, "#5e4325");
        ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(0, 0, R_HUB - 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(20,12,4,.7)"; ctx.lineWidth = 1.5; ctx.stroke();
        // the walls: shadow, body, then a lit top edge
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.save(); ctx.translate(1.2, 1.8);
        ctx.strokeStyle = "rgba(25,14,4,.6)"; ctx.lineWidth = 4.4; ctx.stroke(walls);
        ctx.restore();
        const wg = ctx.createLinearGradient(-rOut, -rOut, rOut, rOut);
        wg.addColorStop(0, "#fff0c8"); wg.addColorStop(0.5, "#e6c88e"); wg.addColorStop(1, "#b48d58");
        ctx.strokeStyle = wg; ctx.lineWidth = 3.4; ctx.stroke(walls);
        ctx.save(); ctx.translate(-0.5, -0.6);
        ctx.strokeStyle = "rgba(255,252,240,.55)"; ctx.lineWidth = 1; ctx.stroke(walls);
        ctx.restore();
        // the goal in the middle: a little gold cheese-coloured gem
        ctx.fillStyle = "#2a1a0b"; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, TAU); ctx.fill();
        const gem = ctx.createRadialGradient(-1.6, -1.8, 0.5, 0, 0, 5.5);
        gem.addColorStop(0, "#fffbe6"); gem.addColorStop(0.45, "#f2c94c"); gem.addColorStop(1, "#a8761c");
        ctx.fillStyle = gem; ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, TAU); ctx.fill();
    }

    /* The bulbs' brightness, 0 to 1, for bulb i at time t (ms): a slow
       breathing alternation at rest, a chase while it spins (chase is the
       spin's own count), all flashing as it lands, a fast chase under the
       reveal. */
    function bulbState(mode, i, t, chase) {
        if (mode === "landing" || mode === "reveal") {
            if (mode === "landing") return Math.floor(t / 110) % 2 ? 1 : 0.15;
            return ((i + Math.floor(t / 70)) % 4 === 0) ? 1 : 0.35;
        }
        if (mode === "spinning") {
            const phase = Math.floor(chase);
            return (i + phase) % 3 === 0 ? 1 : 0.18;
        }
        const s = 0.5 + 0.5 * Math.sin(t / 650 + (i % 2) * Math.PI);
        return 0.25 + 0.75 * s;
    }

    /* One frame onto canvas: parts { rim, gloss, disk } (all canvas.width
       square), and state { rot, t, bulb(i) -> 0..1, lit: [a0, a1] the slice
       to light up or null, litFrom: when it began }. */
    function render(canvas, parts, state) {
        const ctx = canvas.getContext("2d");
        const k = canvas.width / WHEEL;
        const rot = state.rot;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(parts.rim, 0, 0);
        ctx.save();
        ctx.translate(CX * k, CY * k);
        ctx.rotate(rot);
        ctx.translate(-CX * k, -CY * k);
        ctx.drawImage(parts.disk, 0, 0);
        // the winning slice, lit up as it lands
        const sp = state.lit;
        if (sp) {
            const pulse = 0.5 + 0.5 * Math.sin((state.t - state.litFrom) / 95);
            ctx.setTransform(k, 0, 0, k, 0, 0);
            ctx.translate(CX, CY); ctx.rotate(rot);
            ctx.fillStyle = `rgba(255,236,190,${0.14 + 0.26 * pulse})`;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R_DISK, sp[0] - Math.PI / 2, sp[1] - Math.PI / 2); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = `rgba(255,241,196,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 4; ctx.stroke();
        }
        ctx.restore();
        ctx.drawImage(parts.gloss, 0, 0);
        // the bulbs
        ctx.setTransform(k, 0, 0, k, 0, 0);
        ctx.translate(CX, CY);
        for (let i = 0; i < BULBS; i++) {
            const a = (i + 0.5) / BULBS * TAU - Math.PI / 2, x = Math.cos(a) * R_BULB, y = Math.sin(a) * R_BULB;
            const on = state.bulb(i);
            const halo = ctx.createRadialGradient(x, y, 1, x, y, 20);
            halo.addColorStop(0, `rgba(255,214,130,${0.55 * on})`); halo.addColorStop(1, "rgba(255,214,130,0)");
            ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.fill();
            const b = ctx.createRadialGradient(x - 1.8, y - 1.8, 0.5, x, y, 6.5);
            b.addColorStop(0, on > 0.6 ? "#ffffff" : "#e8d2a6");
            b.addColorStop(0.5, `rgb(${Math.round(120 + 135 * on)},${Math.round(84 + 141 * on)},${Math.round(40 + 120 * on)})`);
            b.addColorStop(1, `rgb(${Math.round(70 + 120 * on)},${Math.round(46 + 100 * on)},${Math.round(20 + 50 * on)})`);
            ctx.fillStyle = b; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, TAU); ctx.fill();
        }
    }

    // ------------------------------------------------------------ the spin

    /* The whole spin is one curve worked out before it starts, so it lands
       exactly where the draw said: a short pull back (the wind-up), a
       smooth push up to full speed, then a long friction-like slowing whose
       speed falls as (1 - u)^2, so it creeps over the last few pegs.
       from: the disk's rotation now; where: the disk's angle to stop under
       the pointer; n: slices; turns: whole turns on top; decel: seconds.
       The pointer reads the disk's angle -rot, so it shows `where` when
       rot = -where (mod 2pi). */
    function plan(from, where, n, turns, decel) {
        const delta = turns * TAU + mod(-where - from, TAU);
        const back = Math.min(0.16, TAU / n * 0.6 + 0.05);
        const vmax = delta / (ACCEL / 2 + decel / 3);
        return { from, delta, windUp: WIND_UP, accel: ACCEL, decel, back, vmax };
    }
    // [rot, speed] at s seconds into the spin
    function at(spin, s) {
        const { from, windUp, accel, decel, back, vmax, delta } = spin;
        if (s < windUp) {
            const x = s / windUp;
            return [from - back * (1 - Math.cos(TAU * x)) / 2, -back * Math.PI * Math.sin(TAU * x) / windUp];
        }
        s -= windUp;
        if (s < accel) {
            const x = s / accel;
            return [from + vmax * accel * (x * x * x - x * x * x * x / 2), vmax * (3 * x * x - 2 * x * x * x)];
        }
        s -= accel;
        const A = vmax * accel / 2;
        if (s < decel) {
            const u = s / decel;
            return [from + A + vmax * decel / 3 * (1 - Math.pow(1 - u, 3)), vmax * Math.pow(1 - u, 2)];
        }
        return [from + delta, 0];
    }
    const length = spin => spin.windUp + spin.accel + spin.decel;
    // How many dividers have gone past the pointer, counting on round.
    const boundary = (rot, n) => (n ? Math.floor(-rot / (TAU / n)) : 0);

    // ------------------------------------------------------------- sound
    /* Everything synthesised (no files to download): a peg's click, the
       release's whoosh, the landing's thunk, the winner's fanfare with a
       shimmer of bells. Nothing plays until wake() is called from a press. */
    function sound(muteKey) {
        const Sound = {
            ctx: null, out: null, muted: false, noise: null,
            init() {
                try { this.muted = localStorage.getItem(muteKey) === "1"; } catch (e) { /* default on */ }
            },
            wake() {
                // Anything but running: an iPhone's call or Siri leaves it "interrupted", not "suspended".
                if (this.ctx) { if (this.ctx.state !== "running" && this.ctx.state !== "closed") this.ctx.resume().catch(() => {}); return; }
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                this.ctx = new AC();
                // An interruption over while a draw is spinning: no press is coming to wake it.
                document.addEventListener("visibilitychange", () => {
                    if (!document.hidden && this.ctx.state === "interrupted") this.ctx.resume().catch(() => {});
                });
                const comp = this.ctx.createDynamicsCompressor();
                comp.threshold.value = -14; comp.ratio.value = 4;
                this.out = this.ctx.createGain();
                this.out.gain.value = this.muted ? 0 : 0.7;
                this.out.connect(comp); comp.connect(this.ctx.destination);
                const len = this.ctx.sampleRate * 2;
                this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
                const d = this.noise.getChannelData(0);
                for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            },
            setMuted(m) {
                this.muted = m;
                try { localStorage.setItem(muteKey, m ? "1" : "0"); } catch (e) { /* this tab only */ }
                if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.03);
            },
            live() { return this.ctx && !this.muted; },
            noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; return s; },
            tick(strength) {
                if (!this.live()) return;
                const c = this.ctx, t = c.currentTime, v = 0.12 + 0.3 * strength;
                const n = this.noiseSrc(), bp = c.createBiquadFilter(), g = c.createGain();
                bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 1.4;
                g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
                n.connect(bp); bp.connect(g); g.connect(this.out);
                n.start(t, Math.random()); n.stop(t + 0.03);
                const o = c.createOscillator(), og = c.createGain();
                o.type = "triangle"; o.frequency.setValueAtTime(1900, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.03);
                og.gain.setValueAtTime(v * 0.55, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
                o.connect(og); og.connect(this.out); o.start(t); o.stop(t + 0.05);
            },
            whoosh() {
                if (!this.live()) return;
                const c = this.ctx, t = c.currentTime;
                const n = this.noiseSrc(), bp = c.createBiquadFilter(), g = c.createGain();
                bp.type = "bandpass"; bp.Q.value = 2.2;
                bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(1600, t + 0.45); bp.frequency.exponentialRampToValueAtTime(380, t + 1.3);
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.35); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
                n.connect(bp); bp.connect(g); g.connect(this.out); n.start(t, Math.random()); n.stop(t + 1.5);
            },
            thunk() {
                if (!this.live()) return;
                const c = this.ctx, t = c.currentTime;
                const o = c.createOscillator(), g = c.createGain();
                o.type = "sine"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
                g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.5);
            },
            brass(freq, t, dur, vol) {
                const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
                lp.type = "lowpass"; lp.Q.value = 3;
                lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(freq * 6, t + 0.06); lp.frequency.setTargetAtTime(freq * 3, t + 0.08, 0.2);
                g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.setTargetAtTime(vol * 0.7, t + 0.05, 0.15);
                g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
                [-7, 0, 7].forEach(det => {
                    const o = c.createOscillator();
                    o.type = "sawtooth"; o.frequency.value = freq; o.detune.value = det;
                    o.connect(lp); o.start(t); o.stop(t + dur + 0.8);
                });
                lp.connect(g); g.connect(this.out);
            },
            bell(freq, t, vol) {
                const c = this.ctx;
                [1, 2.76].forEach((m, i) => {
                    const o = c.createOscillator(), g = c.createGain();
                    o.type = "sine"; o.frequency.value = freq * m;
                    g.gain.setValueAtTime(vol / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
                    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 1.2);
                });
            },
            fanfare() {
                if (!this.live()) return;
                const c = this.ctx, t = c.currentTime + 0.02;
                const N = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C4: 261.63, C3: 130.81, E4: 329.63 };
                this.brass(N.G4, t, 0.1, 0.16);
                this.brass(N.C5, t + 0.13, 0.1, 0.16);
                this.brass(N.E5, t + 0.26, 0.1, 0.16);
                [N.C4, N.E4, N.G4, N.C5, N.E5, N.G5].forEach(f => this.brass(f, t + 0.42, 1.5, 0.085));
                const o = c.createOscillator(), g = c.createGain();
                o.type = "triangle"; o.frequency.value = N.C3;
                g.gain.setValueAtTime(0.0001, t + 0.42); g.gain.linearRampToValueAtTime(0.35, t + 0.46); g.gain.setTargetAtTime(0.0001, t + 1.9, 0.2);
                o.connect(g); g.connect(this.out); o.start(t + 0.42); o.stop(t + 3);
                // a cymbal swell under the chord
                const n = this.noiseSrc(), hp = c.createBiquadFilter(), ng = c.createGain();
                hp.type = "highpass"; hp.frequency.value = 6000;
                ng.gain.setValueAtTime(0.0001, t + 0.4); ng.gain.linearRampToValueAtTime(0.22, t + 0.45); ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
                n.connect(hp); hp.connect(ng); ng.connect(this.out); n.start(t + 0.4, Math.random()); n.stop(t + 2.7);
                const scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
                for (let i = 0; i < 14; i++) this.bell(scale[Math.floor(Math.random() * scale.length)], t + 0.5 + i * 0.09 + Math.random() * 0.04, 0.05);
            },
            // Asleep with nothing to play: the browser's audio thread rests.
            sleep() { if (this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => {}); }
        };
        Sound.init();
        return Sound;
    }

    // ---------------------------------------------------------- snapshot

    /* What an article keeps of a draw (2 Nov 2026; the `wheel` embed in
       netlify/functions/_article-embeds.js checks it again before storing):
       the names on the wheel in their order, each slice's colour, which
       slice won, the spin's numbers, the event's title, the prize line and
       when. Display names only (the ones the wheel showed): never an entry
       id, an address or a Discord account.

       row: a row of the draw log (event_entry_draws). A draw logged since
       2 Nov 2026 carries `replay`, the wheel exactly as it spun. An older
       one does not, and is rebuilt sensibly from `now`, the event's
       entrants today ([names]): the winner among them, as many slices as
       were on the wheel where there are names enough, in an order shuffled
       from the draw's id (so the same each time), and marked `rebuilt` so
       the article can say so. Returns the object, or null. */
    const SNAP_MAX = 400;
    // One line of text, as the server's checks want it (no control characters, trimmed).
    const oneLine = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
    function snapshot(row, title, now) {
        if (!row || typeof row.name !== "string" || !oneLine(row.name, 60)) return null;
        const base = {
            v: 1,
            event: oneLine(title, 120),
            prize: oneLine(row.prize, 80),
            drawnAt: typeof row.drawnAt === "string" ? row.drawnAt : (row.drawnAt instanceof Date ? row.drawnAt.toISOString() : "")
        };
        const r = row.replay;
        if (r && Array.isArray(r.names) && r.names.length >= 1 && r.names.length <= SNAP_MAX) {
            return Object.assign(base, {
                names: r.names.map(x => oneLine(x, 60)), colours: Array.isArray(r.colours) ? r.colours.slice() : r.names.map((x, i) => jewelIndex(i, r.names.length)),
                win: r.win, from: r.from, where: r.where, turns: r.turns, decel: r.decel
            });
        }
        // Rebuilt: the winner, then the others, cut to the wheel's own count.
        const winner = oneLine(row.name, 60);
        const seen = new Set([winner.toLowerCase()]);
        const others = (Array.isArray(now) ? now : []).map(x => oneLine(x, 60))
            .filter(x => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
        let seed = 0;
        for (const ch of String(row.id || row.name)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
        const R = seeded(seed || 1);
        for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
        const want = Number.isInteger(row.onWheel) && row.onWheel >= 1 ? row.onWheel : others.length + 1;
        const names = others.slice(0, Math.max(0, Math.min(SNAP_MAX, want) - 1));
        const win = Math.floor(R() * (names.length + 1));
        names.splice(win, 0, winner);
        const n = names.length, slice = TAU / n;
        return Object.assign(base, {
            names, colours: names.map((x, i) => jewelIndex(i, n)), win,
            from: -slice / 2, where: win * slice + slice * (0.3 + 0.4 * R()), turns: 7, decel: 9.4,
            rebuilt: true
        });
    }

    root.WheelDraw = {
        WHEEL, CX, CY, R_OUT, R_DISK, R_HUB, R_BULB, BULBS, TAU, JEWELS, NAME_FONT, SNAP_MAX,
        nameFont, mod, seeded, spans, jewelIndex, sliceColour,
        drawRim, drawGloss, drawDisk, bulbState, render,
        plan, at, length, boundary, sound, snapshot
    };
})(typeof window !== "undefined" ? window : this);

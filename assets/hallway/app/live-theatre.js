/* The Theatredrome entrance, live (8 Nov 2026, the owner's: "Make the lights have a slow chase effect ... When a user walks up to or past
   the theatredrome entrance, they should hear distant theatre ambience, which isn't always the same").

   The chase: the marquee's bulbs, found by the same sums render/hw3.js uses to draw them (theatreArt, the arch piece), lit round the board
   one in three at a time, stepping on slowly. The baked bulbs stay lit underneath, so between steps they read as dimmed, not dark.

   The ambience: real recordings (art/theatre, all CC0 or public domain: an audience before a show, an orchestra tuning, applause, a laugh),
   heard as if through the curtain and down the tunnel: muffled, quiet, louder the nearer you are on that floor. A bed of murmur from a
   random place in a random recording, crossfading to another every half minute or so, and now and then something from the house: the
   orchestra tuning, applause, a laugh. Each picked at random, at a slightly different speed, so it's never the same twice. It follows
   the walking page's Mute and the music's volume, and stays quiet in the screensaver. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const T = 101 + 49;                                                   // the wall's top, as hw3.js has it (101 + WALL_ADD)
    const theatres = () => { const m = LIVE.map; if (!m || !m.theatres) return []; return m.theatres.map(q => ({ q, l: m.levels.find(v => v.id === q.level) })).filter(t => t.l); };
    const front = t => t.q.axis === "x" ? [t.q.at + 4, t.q.line + 1] : [t.q.line + 1, t.q.at + 4];

    /* ---------- the bulbs, in order round the board ---------- */
    const bulbMemo = {};
    function bulbsOf(axis) {
        if (bulbMemo[axis]) return bulbMemo[axis];
        const i0 = axis === "y" ? 42 : 33, i1 = axis === "y" ? 105 : 96, cx = (i0 + i1) / 2, slope = axis === "y" ? -.5 : .5, rowOf = i => Math.round(103 + slope * (i - cx));
        const p0 = Math.round(cx - 44), p1 = Math.round(cx + 44), side = [-7, -3, 1], top = [], right = [], bottom = [], left = [];
        for (let i = p0 + 3; i < p1 - 2; i++) if ((i - p0) % 4 === 2) { top.push([i, rowOf(i) - 10]); bottom.push([i, rowOf(i) + 4]); }
        for (const d of side) { right.push([p1 - 2, rowOf(p1 - 2) + d]); left.push([p0 + 2, rowOf(p0 + 2) + d]); }
        return (bulbMemo[axis] = [...top, ...right, ...bottom.reverse(), ...left.reverse()]);
    }
    const STEP_MS = 520, reduced = matchMedia("(prefers-reduced-motion: reduce)");
    LIVE.add({
        active: () => !reduced.matches && theatres().some(t => t.l === (LIVE.floor || (LIVE.editorApi && LIVE.editorApi().level))),
        under(c, ox, oy, now) {
            const here = LIVE.floor || (LIVE.editorApi && LIVE.editorApi().level), v = LIVE.view(), step = Math.floor(now / STEP_MS);
            c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom);
            for (const t of theatres()) {
                if (t.l !== here) continue;
                const f = front(t), z = LIVE.nodeZ(t.l, f[0], f[1]) || 0, p = t.q.axis === "x" ? LIVE.mapPoint(t.q.at, t.q.line, z) : LIVE.mapPoint(t.q.line, t.q.at, z);
                const x0 = t.q.axis === "x" ? p[0] : p[0] - 138, y0 = p[1] - T;
                if (x0 > v.x1 || x0 + 140 < v.x0 || y0 > v.y1 || y0 + 160 < v.y0) continue;
                const list = bulbsOf(t.q.axis);
                list.forEach(([i, j], n) => {
                    const lit = (n + step) % 3 === 0, X = x0 + i, Y = y0 + j;
                    if (lit) { const g = c.createRadialGradient(X + .5, Y + .5, 0, X + .5, Y + .5, 3.2); g.addColorStop(0, "rgba(255,226,150,.55)"); g.addColorStop(1, "rgba(255,190,90,0)"); c.globalCompositeOperation = "lighter"; c.fillStyle = g; c.fillRect(X - 3, Y - 3, 7, 7); c.globalCompositeOperation = "source-over"; c.fillStyle = "#fff6d8"; c.fillRect(X, Y, 1, 1); }
                    else { c.fillStyle = "#a86a2c"; c.fillRect(X, Y, 1, 1); }
                });
            }
            c.restore();
        }
    });

    /* ---------- the ambience ---------- */
    const BED = ["murmur1.mp3", "murmur2.mp3"], EVENTS = [["tuning1.mp3", .9], ["tuning2.mp3", .8], ["applause1.ogg", .7], ["laugh1.ogg", .55]], NEAR = 9;
    let ctx = null, out = null, mute = null, bufs = {}, loading = false, bed = null, nextBed = 0, nextEvent = 0, wanted = 0;
    const quiet = () => { try { if (window.HALLWAY_PLAY && localStorage.getItem("hallway-music") === "0") return true; } catch (e) { /* sounds on */ } return !!(window.HallwayScreensaver && HallwayScreensaver.on) || document.hidden; };
    const volume = () => (window.HallwayAudio && typeof HallwayAudio.volume === "number" ? HallwayAudio.volume : .8);
    function setup() {
        if (ctx) return true; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
        ctx = new AC({ latencyHint: "playback" });
        /* through the curtain and down the tunnel: the top taken off, a little body kept */
        mute = ctx.createBiquadFilter(); mute.type = "lowpass"; mute.frequency.value = 900; mute.Q.value = .5;
        out = ctx.createGain(); out.gain.value = 0; mute.connect(out); out.connect(ctx.destination);
        return true;
    }
    function load() {
        if (loading) return; loading = true;
        for (const f of [...BED, ...EVENTS.map(e => e[0])]) fetch("art/theatre/" + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => ctx.decodeAudioData(b)).then(a => { bufs[f] = a; }).catch(() => { /* that one stays quiet */ });
    }
    function play(f, gain, fadeIn, from, length) {
        const b = bufs[f]; if (!b) return null; const t = ctx.currentTime, s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = b; s.playbackRate.value = .94 + Math.random() * .1; s.loop = length === undefined ? false : true;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + fadeIn);
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) { pan.pan.value = (Math.random() - .5) * .5; s.connect(g); g.connect(pan); pan.connect(mute); } else { s.connect(g); g.connect(mute); }
        s.start(t, from || 0); return { s, g };
    }
    const fadeOut = (v, sec) => { if (!v) return; const t = ctx.currentTime; v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + sec); try { v.s.stop(t + sec + .05); } catch (e) { /* stopped */ } };
    function tick() {
        const w = LIVE.walker; if (!w || !w.l || w.l.stair) { wanted = 0; return apply(); }
        let best = 1e9; for (const t of theatres()) { if (t.l !== w.l) continue; const f = front(t), d = Math.hypot(w.x + .5 - f[0], w.y + .5 - f[1]); if (d < best) best = d; }
        wanted = best > NEAR || quiet() ? 0 : Math.pow(1 - best / NEAR, 1.6);
        if (wanted > 0 && !ctx) { if (!setup()) return; }
        if (!ctx) return; if (wanted > 0) { load(); if (ctx.state === "suspended") ctx.resume().catch(() => {}); }
        apply();
        if (wanted <= 0) return;
        const now = performance.now();
        /* the bed: a random stretch of a random recording, crossfading to the next */
        if (now > nextBed && BED.some(f => bufs[f])) { const f = BED.filter(x => bufs[x])[Math.floor(Math.random() * BED.filter(x => bufs[x]).length)], from = Math.random() * Math.max(0, bufs[f].duration - 40), was = bed; bed = play(f, 1, 6, from, 1); fadeOut(was, 6); nextBed = now + 24000 + Math.random() * 22000; }
        /* now and then, something from the house */
        if (!nextEvent) nextEvent = now + 8000 + Math.random() * 10000;
        else if (now > nextEvent) { const ready = EVENTS.filter(e => bufs[e[0]]); if (ready.length) { const e = ready[Math.floor(Math.random() * ready.length)], v = play(e[0], e[1] * (.6 + Math.random() * .4), 1.5, Math.random() * Math.max(0, bufs[e[0]].duration - 12)); if (v) { const len = Math.min(bufs[e[0]].duration, 6 + Math.random() * 10); setTimeout(() => fadeOut(v, 2.5), len * 1000); } } nextEvent = now + 20000 + Math.random() * 35000; }
    }
    function apply() { if (!ctx) return; const t = ctx.currentTime, g = .22 * wanted * volume(); out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(g, t, .8); if (wanted <= 0 && bed && performance.now() > nextBed - 1) { /* keep it, silent, so it picks up where it was */ } }
    setInterval(() => { try { tick(); } catch (e) { /* never in the way of the walk */ } }, 400);
    window.HallwayTheatre = { bulbsOf, get level() { return wanted; } };
})();

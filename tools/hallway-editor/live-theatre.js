/* The Theatredrome entrance, live (8 Nov 2026, the owner's: "Make the lights have a slow chase effect ... When a user walks up to or past
   the theatredrome entrance, they should hear distant theatre ambience, which isn't always the same").

   The chase: the marquee's bulbs, found by the same sums render/hw3.js uses to draw them (theatreArt, the arch piece), lit round the board
   as a soft swell of light running round the board. The baked bulbs stay lit underneath, so between swells they read as dimmed, not dark.

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
    /* A soft chase (9 Nov, his: "too far, make them softly fade/chase"): a slow swell of light running round the board, each bulb brightening
       and fading smoothly as it passes, two swells at once; between them the bulbs rest at their baked glow, never dark.
       And furniture in front hides them (his: "the lights clip in front of the pillar"): each bulb is cut as if something stood on the
       floor tile in front of it, the way the rats are, worked out once per map and kept as a mask. */
    const PERIOD = 4.2, WAVES = 2, reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const maskMemo = new Map(); let maskMap = null, maskAt = 0, maskLoads = -1;
    const cut = document.createElement("canvas"); cut.width = 33; cut.height = 56; const cg = cut.getContext("2d", { willReadFrequently: true });
    /* which of a bulb's 7 by 7 pixels (its halo included) still show past the furniture in front of it */
    function maskOf(t, X, Y, z) {
        const key = t.q.axis + t.q.line + "," + t.q.at + "," + X + "," + Y; if (maskMemo.has(key)) return maskMemo.get(key);
        const ref = t.q.axis === "x" ? LIVE.mapPoint(t.q.at, t.q.line, z) : LIVE.mapPoint(t.q.line, t.q.at, z), a = t.q.at + (X + .5 - ref[0]) / (t.q.axis === "x" ? 16 : -16);
        /* the stand-in stands just behind the wall, so anything on the floor in front of it, against the wall too, counts as in front */ const tx = t.q.axis === "x" ? Math.floor(a) : t.q.line - 1, ty = t.q.axis === "x" ? t.q.line - 1 : Math.floor(a), x0 = Math.round(X) - 16, y0 = Math.round(Y) - 28;
        cg.clearRect(0, 0, 33, 56); cg.fillStyle = "#fff"; cg.fillRect(13, 25, 7, 7);
        LIVE.as({ x: tx, y: ty, z, l: t.l, dir: 2, frame: 0, st: null }, () => LIVE.cutInFront(cg, x0, y0));
        const d = cg.getImageData(13, 25, 7, 7).data, m = new Uint8Array(49); let any = 0; for (let k = 0; k < 49; k++) { m[k] = d[k * 4 + 3] > 128 ? 1 : 0; any += m[k]; }
        const out = { m, any: any > 0, all: any === 49 }; maskMemo.set(key, out); return out;
    }
    /* the marquee's box on the map: its top left, and the floor height in front */
    const boardOf = t => { const f = front(t), z = LIVE.nodeZ(t.l, f[0], f[1]) || 0, p = t.q.axis === "x" ? LIVE.mapPoint(t.q.at, t.q.line, z) : LIVE.mapPoint(t.q.line, t.q.at, z); return { z, x0: t.q.axis === "x" ? p[0] : p[0] - 138, y0: p[1] - T }; };
    const inView = (b, v) => !(b.x0 > v.x1 || b.x0 + 140 < v.x0 || b.y0 > v.y1 || b.y0 + 160 < v.y0);
    const here = () => LIVE.floor || (LIVE.editorApi && LIVE.editorApi().level);
    /* only while a theatre on this floor is on screen (9 Nov scan, page finding 1: it kept the whole of Floor 1 repainting every frame,
       wherever you stood). A still layer woken 12 times a second, as the cabinets are: the chase is a slow swell, and as an every-frame layer
       it had the whole map repainted every frame while you stood by the Theatredrome (15 Nov scan, live M9) */
    const chaseOn = () => { if (reduced.matches) return false; const h = here(); if (!h) return false; const ts = theatres().filter(t => t.l === h); if (!ts.length) return false; const v = LIVE.view(); return ts.some(t => inView(boardOf(t), v)); };
    setInterval(() => { if (!document.hidden && chaseOn()) LIVE.wake(); }, 83);
    LIVE.add({
        still: true,
        active: chaseOn,
        under(c, ox, oy, now) {
            const h = here(), v = LIVE.view(), t0 = now / 1000;
            /* furniture can be moved in the editor: look again every couple of seconds there, once on the walking page */
            /* and again once more furniture pictures have loaded: cut before they were in, nothing was cut (10 Nov scan b, live 6) */
            if (LIVE.map !== maskMap || LIVE.pieceLoads !== maskLoads || (!window.HALLWAY_PLAY && now - maskAt > 2000)) { maskMemo.clear(); maskMap = LIVE.map; maskAt = now; maskLoads = LIVE.pieceLoads; }
            c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom);
            for (const t of theatres()) {
                if (t.l !== h) continue;
                const B = boardOf(t), z = B.z, x0 = B.x0, y0 = B.y0;
                if (!inView(B, v)) continue;
                const list = bulbsOf(t.q.axis), n0 = list.length;
                list.forEach(([i, j], n) => {
                    const X = Math.round(x0 + i), Y = Math.round(y0 + j), mk = maskOf(t, X, Y, z); if (!mk.any) return;
                    /* how lit: a smooth swell, eased so it lingers at the top and the bottom */
                    const ph = n / n0 * WAVES - t0 / PERIOD, b0 = .5 + .5 * Math.cos(2 * Math.PI * ph), b = b0 * b0 * (3 - 2 * b0);
                    const core = [Math.round(176 + 79 * b), Math.round(122 + 124 * b), Math.round(58 + 158 * b)];
                    if (mk.all) {
                        if (b > .05) { const g = c.createRadialGradient(X + .5, Y + .5, 0, X + .5, Y + .5, 3.4); g.addColorStop(0, `rgba(255,226,150,${(.5 * b).toFixed(3)})`); g.addColorStop(1, "rgba(255,190,90,0)"); c.globalCompositeOperation = "lighter"; c.fillStyle = g; c.fillRect(X - 3, Y - 3, 7, 7); c.globalCompositeOperation = "source-over"; }
                    } else if (b > .05) { c.globalCompositeOperation = "lighter"; for (let k = 0; k < 49; k++) { if (!mk.m[k]) continue; const dx = k % 7 - 3, dy = ((k / 7) | 0) - 3, d = Math.hypot(dx, dy); if (d > 3.4) continue; c.fillStyle = `rgba(255,214,130,${(.5 * b * (1 - d / 3.4)).toFixed(3)})`; c.fillRect(X + dx, Y + dy, 1, 1); } c.globalCompositeOperation = "source-over"; }
                    if (mk.m[24]) { c.fillStyle = `rgb(${core[0]},${core[1]},${core[2]})`; c.fillRect(X, Y, 1, 1); }
                });
            }
            c.restore();
        }
    });

    /* ---------- the ambience ---------- */
    const BED = ["murmur1.mp3", "murmur2.mp3"], EVENTS = [["tuning1.mp3", .9], ["tuning2.mp3", .8], ["applause1.ogg", .7], ["laugh1.ogg", .55]], NEAR = 9;
    let ctx = null, out = null, mute = null, bufs = {}, loading = false, bed = null, nextBed = 0, nextEvent = 0, wanted = 0, quietSince = 0;
    const quiet = () => { try { if (window.HALLWAY_PLAY && localStorage.getItem("hallway-music") === "0") return true; } catch (e) { /* sounds on */ } return !!(window.HallwayScreensaver && HallwayScreensaver.on) || document.hidden; };
    const volume = () => (window.HallwayAudio && typeof HallwayAudio.volume === "number" ? HallwayAudio.volume : .8);
    function setup() {
        if (ctx) return true; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
        ctx = new AC({ latencyHint: "playback" });
        /* through the curtain and down the tunnel: the top taken off, a little body kept */
        mute = ctx.createBiquadFilter(); mute.type = "lowpass"; mute.frequency.value = 1400; mute.Q.value = .5;
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
        const now = performance.now();
        /* out of earshot (or muted) for a few seconds: the bed stops and the sound engine rests, rather than looping silently for the rest of
           the visit (15 Nov scan, live L9); coming back starts a fresh stretch */
        if (wanted > 0) quietSince = 0; else if (!quietSince) quietSince = now;
        else if (now - quietSince > 4000 && ctx.state === "running") { if (bed) { try { bed.s.stop(); } catch (e) { /* stopped */ } bed = null; } nextBed = 0; nextEvent = 0; ctx.suspend().catch(() => {}); }
        if (wanted <= 0) return;
        /* the bed: a random stretch of a random recording, crossfading to the next */
        if (now > nextBed && BED.some(f => bufs[f])) { const f = BED.filter(x => bufs[x])[Math.floor(Math.random() * BED.filter(x => bufs[x]).length)], from = Math.random() * Math.max(0, bufs[f].duration - 40), was = bed; bed = play(f, 1, 6, from, 1); fadeOut(was, 6); nextBed = now + 24000 + Math.random() * 22000; }
        /* now and then, something from the house */
        if (!nextEvent) nextEvent = now + 8000 + Math.random() * 10000;
        else if (now > nextEvent) { const ready = EVENTS.filter(e => bufs[e[0]]); if (ready.length) { const e = ready[Math.floor(Math.random() * ready.length)], v = play(e[0], e[1] * (.6 + Math.random() * .4), 1.5, Math.random() * Math.max(0, bufs[e[0]].duration - 12)); if (v) { const len = Math.min(bufs[e[0]].duration, 6 + Math.random() * 10); setTimeout(() => fadeOut(v, 2.5), len * 1000); } } nextEvent = now + 20000 + Math.random() * 35000; }
    }
    function apply() { if (!ctx) return; const t = ctx.currentTime, g = .6 * wanted * volume();   /* louder than at first, and the music dips under it, so it is heard (9 Nov 2026, his: he couldn't hear it) */
        if (window.HallwayAudio && HallwayAudio.duck) HallwayAudio.duck(wanted); out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(g, t, .8); if (wanted <= 0 && bed && performance.now() > nextBed - 1) { /* keep it, silent, so it picks up where it was */ } }
    setInterval(() => { try { tick(); } catch (e) { /* never in the way of the walk */ } }, 400);
    window.HallwayTheatre = { bulbsOf, get level() { return wanted; } };
})();

/* The arcade cabinets (8 Nov 2026): one per game, placed in the editor from the Games group (arcade_ff, arcade_pura, ...).
   Click one and your Habbo walks up to its screen, then the game opens over the Hallway, as it would from the archive;
   close it and you're still standing at the cabinet. The art is ideas/arcades.js, through make-ideas-art.js. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    /* the green and purple cabinets (arcade_scout, arcade_quiz) are kept for games to come, but Scout's Trail and Quiz Night will never be
       on the site (his, 8 Nov): they can be placed as decoration and do nothing when clicked */
    const GAMES = { ff: ["Fallin' Furni", "/fallinfurni"], pura: ["Pura Panic", "/purapanic"], guess: ["Guess the Maze", "/guess"], odd: ["Odd One Out", "/odd"] };
    const cabinets = l => (l && l.props || []).filter(p => /^arcade_/.test(p.k) && GAMES[p.k.slice(7)]);
    /* the tile in front of its screen: the screen faces down to the right, or down to the left when it's turned */
    const fronts = p => (p.rot || 0) & 1 ? [[p.x, p.y + 1], [p.x + 1, p.y], [p.x - 1, p.y], [p.x, p.y - 1]] : [[p.x + 1, p.y], [p.x, p.y + 1], [p.x, p.y - 1], [p.x - 1, p.y]];
    function hit(px, py) {
        const l = LIVE.floor, FP = window.FLOOR_PIECES || {};
        for (const p of cabinets(l).sort((a, b) => (b.x + b.y) - (a.x + a.y))) {
            const fp = FP[p.k]; if (!fp) continue;
            const free = fronts(p).find(([x, y]) => LIVE.tileFree(l)(x, y)), z = (free && LIVE.nodeZ(l, free[0], free[1])) || 0, a = LIVE.mapPoint(p.x + .25, p.y + .25, z);
            const x0 = (p.rot || 0) & 1 ? a[0] + fp.ox - fp.w + 1 : a[0] - fp.ox, y0 = a[1] - fp.oy;
            if (px >= x0 + 2 && px <= x0 + fp.w - 2 && py >= y0 + 2 && py <= y0 + fp.h - 4) return { p, free };
        }
        return null;
    }
    /* A game with music of its own: the Hallway's soundtrack stops while its window is open, and comes back when it's closed (10 Nov 2026,
       his: "when a game opens and its soundtrack starts playing, make sure the hallway's soundtrack stops"). Guess the Maze and Odd One
       Out have none, so the Hallway's plays on. If the music's been started or stopped by hand meanwhile, that's left as it is. */
    const SCORED = { ff: "#ff-overlay", pura: "#pura-overlay" };
    /* (10 Nov scan b, live 2 and 3) it watches every scored game's window, and ends only when none is open: a second game opened over the
       first keeps it hushed; it waits up to 30 seconds for a slow first open; and the music comes back only if it's still meant to be on (Mute
       pressed meanwhile keeps it off) */
    let hush = null;
    const musicWanted = () => { try { return localStorage.getItem("hallway-music") !== "0"; } catch (e) { return true; } };
    function hushFor(id, host) {
        const A = window.HallwayAudio, sel = SCORED[id]; if (!A || !sel) return;
        if (hush) { hush.waits = 0; return; }                                       // already hushed: give the new one time to open too
        if (!A.playing) return;
        A.stop();
        const was = A.onChange; hush = { touched: false, t: 0, seen: false, waits: 0 };
        const done = () => { clearInterval(hush.t); const mine = hush; hush = null; A.onChange = was; if (!mine.touched && !A.playing && musicWanted()) A.start(); };
        /* the music switched on by hand while the game's up: theirs now, so nothing more to bring back */
        A.onChange = function () { if (hush && A.playing) hush.touched = true; if (was) was.apply(this, arguments); };
        hush.t = setInterval(() => {
            let open = false; try { open = Object.values(SCORED).some(s => { const el = host.document.querySelector(s); return !!el && el.classList.contains("open"); }); } catch (e) { open = false; }
            if (open) { hush.seen = true; hush.waits = 0; }
            if ((hush.seen && !open) || (!hush.seen && ++hush.waits > 60)) done();      // all closed again; or it never opened (30 seconds)
        }, 500);
    }
    function play(p) {
        const id = p.k.slice(7), [name, path] = GAMES[id]; window.hwTrack("hallway_arcade_" + id);
        if (!window.HALLWAY_PLAY) { if (window.HallwayWindow) HallwayWindow.open(name, "On the site this cabinet opens " + name + " (" + path + ")."); return; }
        try { const host = window.parent !== window ? window.parent : null; if (host && typeof host.openSiteLinkInPlace === "function" && host.openSiteLinkInPlace(path)) { hushFor(id, host); return; } if (host) { host.location.href = path; return; } } catch (e) { /* not the site around it */ }
        window.open(path, "_blank", "noopener");
    }
    LIVE.onClick((px, py) => {
        const h = hit(px, py); if (!h) return false;
        const w = LIVE.walker; if (!w) { play(h.p); return true; }
        if (!h.free) { play(h.p); return true; }
        if (Math.round(w.x) === h.free[0] && Math.round(w.y) === h.free[1] && !w.walking) { play(h.p); return true; }
        return !!LIVE.walkTo(LIVE.floor, h.free[0], h.free[1], () => play(h.p));
    });
    /* ---------- ATTRACT MODE (10 Nov 2026, his pick of the mock-ups): while nobody plays, each cabinet's little screen runs a loop of its
       game, 8 frames, one every 300ms. Fallin' Furni: furni falling past the sky onto a strip of floor; Pura Panic: modules dropping onto a
       stack; Guess the Maze: a question mark that blinks; Odd One Out: four squares, the odd one flashing. The screen is found in the cabinet's
       own picture (its screen colour, and everything inside its black edge), mirrored when it's turned; furniture in front still hides it.
       Each cabinet starts at its own place in the loop, so a row of them doesn't flicker in step. */
    const SCR = { ff: "244935", pura: "43323a", guess: "43463c", odd: "434b43" }, FRAME_MS = 300, NF = 8, reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const hx = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    const LOOPS = {
        ff: (u, v, f) => { if (v >= 8) return "e8c890"; for (const [cx, off] of [[1, 0], [5, 4]]) { const cy = (f + off) % 9 - 1; if ((u === cx || u === cx + 1) && v === cy) return "f4b300"; if ((u === cx || u === cx + 1) && v === cy + 1) return "c0392b"; } return v < 2 ? "a8dcf8" : "7cc4ec"; },
        pura: (u, v, f) => { const C = ["f2c21b", "3b7fe0", "52b34a", "e8452c"]; for (const [x, y, c] of [[0, 9, 0], [1, 9, 0], [2, 9, 1], [3, 9, 1], [4, 9, 2], [5, 9, 3], [6, 9, 3], [0, 8, 2], [1, 8, 1], [5, 8, 0], [6, 8, 0]]) if (u === x && v === y) return C[c];
            const fy = Math.min(7, f), fx = 2 + (f > 4 ? 1 : 0); if ((u === fx || u === fx + 1) && v === fy) return C[(f >> 2) % 4]; return (u + v) % 2 ? "5a5f68" : "50555e"; },
        guess: (u, v, f) => { const Q = ["#####", "....#", "..###", "..#..", ".....", "..#.."], r = Q[v - 2], ch = r && r[u - 1]; if (f % 4 < 3 && ch === "#") return "ffe8a8"; return v % 2 ? "3a2a1c" : "43301e"; },
        odd: (u, v, f) => { const sq = [[1, 2], [4, 2], [1, 6], [4, 6]]; for (let i = 0; i < 4; i++) { const [x, y] = sq[i]; if (u >= x && u <= x + 1 && v >= y && v <= y + 1) return i === 2 && f % 2 ? "e87840" : "78bed6"; } return "2a3a40"; }
    };
    const screens = {};
    /* a cabinet's screen, from its picture: { w, pts: [{ x, y, u, v }] }, or null while the picture loads */
    function screenOf(id) {
        if (id in screens) return screens[id]; screens[id] = null;
        const im = new Image(); im.onload = () => {
            const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0);
            const d = g.getImageData(0, 0, im.width, im.height).data, W = im.width, at = (x, y) => (y * W + x) * 4, want = hx(SCR[id]);
            let seed = null; for (let y = 0; y < im.height && !seed; y++) for (let x = 0; x < W; x++) { const q = at(x, y); if (d[q + 3] > 200 && d[q] === want[0] && d[q + 1] === want[1] && d[q + 2] === want[2]) { seed = [x, y]; break; } }
            if (!seed) return;
            const ok = (x, y) => { if (x < 14 || x > 24 || y < 14 || y > 27) return false; const q = at(x, y); return d[q + 3] > 200 && !(d[q] < 20 && d[q + 1] < 20 && d[q + 2] < 20); };
            const seen = new Set([seed + ""]), st = [seed]; while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = [x + dx, y + dy]; if (!seen.has(k + "") && ok(k[0], k[1])) { seen.add(k + ""); st.push(k); } } }
            const pts = [...seen].map(k => k.split(",").map(Number)), top = {}; for (const [x, y] of pts) top[x] = Math.min(top[x] === undefined ? 99 : top[x], y);
            const x0 = Math.min(...pts.map(p => p[0])); screens[id] = { w: W, pts: pts.map(([x, y]) => ({ x, y, u: x - x0, v: y - top[x] })) };
            if (LIVE.wake) LIVE.wake();
        };
        im.src = "art/wall/i_arcade_" + id + ".png"; return null;
    }
    /* where a cabinet's picture sits on the map, as hw3.js draws it */
    const placeOf = (l, p) => { const fp = (window.FLOOR_PIECES || {})[p.k]; if (!fp) return null; const z = LIVE.nodeZ(l, p.x, p.y) || 0, a = LIVE.mapPoint(p.x + .25, p.y + .25, z), flip = !!((p.rot || 0) & 1); return { fp, z, flip, x0: flip ? a[0] + fp.ox - fp.w + 1 : a[0] - fp.ox, y0: a[1] - fp.oy }; };      // turned: one pixel right, as hw3 mirrors it (10 Nov scan b, live 4)
    /* which screen pixels still show past what stands in front of the cabinet: worked out once per place, looked at again now and then in the editor */
    const cutMemo = new Map(); let cutMap = null, cutAt = 0, cutLoads = -1;
    const cutCv = document.createElement("canvas"); cutCv.width = 33; cutCv.height = 56; const cutG = cutCv.getContext("2d", { willReadFrequently: true });
    function shown(l, p, sc, at) {
        const key = l.id + "|" + p.k + "|" + p.x + "," + p.y + "," + (p.rot || 0); if (cutMemo.has(key)) return cutMemo.get(key);
        cutG.clearRect(0, 0, 33, 56); cutG.fillStyle = "#fff"; for (const q of sc.pts) { const x = at.flip ? sc.w - 1 - q.x : q.x; if (q.y < 56) cutG.fillRect(x, q.y, 1, 1); }
        LIVE.as({ x: p.x, y: p.y, z: at.z, l, dir: 2, frame: 0, st: null }, () => LIVE.cutInFront(cutG, Math.round(at.x0), Math.round(at.y0)));
        const d = cutG.getImageData(0, 0, 33, 56).data, keep = sc.pts.map(q => { const x = at.flip ? sc.w - 1 - q.x : q.x; return q.y < 56 && d[(q.y * 33 + x) * 4 + 3] > 128; });
        cutMemo.set(key, keep); return keep;
    }
    const hereL = () => LIVE.floor || (LIVE.editorApi && LIVE.editorApi().level);
    const onScreen = (at, v) => at && !(at.x0 > v.x1 || at.x0 + 33 < v.x0 || at.y0 > v.y1 || at.y0 + 57 < v.y0);
    /* only while a cabinet on this floor is on screen. A still layer, woken once per frame of the loop: as an every-frame layer it kept the
       whole map repainting 70-odd times a second for a picture that changes every 300ms (10 Nov scan b, live 5); and not while a game's open */
    const anyOn = () => { if (reduced.matches || hush) return false; const l = hereL(); if (!l) return false; const v = LIVE.view(); return cabinets(l).some(p => onScreen(placeOf(l, p), v)); };
    setInterval(() => { if (!document.hidden && anyOn()) LIVE.wake(); }, FRAME_MS);
    LIVE.add({
        still: true,
        under(c, ox, oy, now) {
            if (reduced.matches) return;
            const l = hereL(); if (!l) return; const v = LIVE.view();
            if (LIVE.map !== cutMap || LIVE.pieceLoads !== cutLoads || (!window.HALLWAY_PLAY && now - cutAt > 2000)) { cutMemo.clear(); cutMap = LIVE.map; cutAt = now; cutLoads = LIVE.pieceLoads; }      // again once furniture pictures arrive (10 Nov scan b, live 6)
            c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom);
            for (const p of cabinets(l)) {
                const id = p.k.slice(7), at = placeOf(l, p), sc = screenOf(id); if (!at || !sc || !onScreen(at, v)) continue;
                const keep = shown(l, p, sc, at), f = (Math.floor(now / FRAME_MS) + ((p.x * 7 + p.y * 3) & 7)) % NF;
                sc.pts.forEach((q, i) => { if (!keep[i]) return; const x = at.flip ? sc.w - 1 - q.x : q.x; c.fillStyle = "#" + LOOPS[id](q.u, q.v, f); c.fillRect(Math.round(at.x0) + x, Math.round(at.y0) + q.y, 1, 1); });
            }
            c.restore();
        }
    });

    window.HallwayArcade = { GAMES, cabinets, hit, play, get hushed() { return !!hush; } };
})();

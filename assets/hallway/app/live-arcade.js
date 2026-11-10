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
            const x0 = (p.rot || 0) & 1 ? a[0] + fp.ox - fp.w : a[0] - fp.ox, y0 = a[1] - fp.oy;
            if (px >= x0 + 2 && px <= x0 + fp.w - 2 && py >= y0 + 2 && py <= y0 + fp.h - 4) return { p, free };
        }
        return null;
    }
    /* A game with music of its own: the Hallway's soundtrack stops while its window is open, and comes back when it's closed (10 Nov 2026,
       his: "when a game opens and its soundtrack starts playing, make sure the hallway's soundtrack stops"). Guess the Maze and Odd One
       Out have none, so the Hallway's plays on. If the music's been started or stopped by hand meanwhile, that's left as it is. */
    const SCORED = { ff: "#ff-overlay", pura: "#pura-overlay" };
    let hush = null;
    function hushFor(id, host) {
        const A = window.HallwayAudio, sel = SCORED[id]; if (!A || !sel || !A.playing || hush) return;
        A.stop(); let seen = false, waits = 0;
        const done = () => { clearInterval(hush.t); const mine = hush; hush = null; if (!mine.touched && !A.playing) A.start(); };
        const was = A.onChange; hush = { touched: false, t: 0 };
        /* the music switched on by hand while the game's up: theirs now, so nothing more to bring back */
        A.onChange = function () { if (hush && A.playing) hush.touched = true; if (was) was.apply(this, arguments); };
        hush.t = setInterval(() => {
            let open = false; try { const el = host.document.querySelector(sel); open = !!el && el.classList.contains("open"); } catch (e) { open = false; }
            if (open) seen = true;
            if ((seen && !open) || (!seen && ++waits > 20)) { A.onChange = was; done(); }      // closed again; or it never opened (10 seconds)
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
    window.HallwayArcade = { GAMES, cabinets, hit, play, get hushed() { return !!hush; } };
})();

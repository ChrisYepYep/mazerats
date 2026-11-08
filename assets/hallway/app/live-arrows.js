/* Arrow tiles (8 Nov 2026, the owner's: "a pacman style link between the sides of the map. So you walk onto an arrow on the right side of
   the map, and it'll take you to the linked arrow on the left side"). An arrow is a prop { k: "mark_arrow", x, y, rot, id, link }: one of the
   floor's big squares with a triangle cut into it (drawn into the floor by render/hw3.js), pointing +x, +y, -x or -y by rot. Linked in the
   editor's Selected panel. Step onto one and, after a quick fade (his pick), you're one step in from its partner, facing away from it, so
   you don't go straight back. Only stepping onto it from off it counts. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const OUT = [[1, 0], [0, 1], [-1, 0], [0, -1]];                       // which way each rot points, in tiles
    const FACE = { "1,0": 2, "0,1": 4, "-1,0": 6, "0,-1": 0 };             // the avatar's direction for a step that way
    const arrows = () => { const m = LIVE.map, out = []; if (!m) return out; for (const l of m.levels) for (const p of (l.props || [])) if (p.k === "mark_arrow") out.push({ l, p, x: p.x - (p.x & 1), y: p.y - (p.y & 1), d: (((p.rot || 0) % 4) + 4) % 4 }); return out; };
    const on = (a, x, y) => x >= a.x && x < a.x + 2 && y >= a.y && y < a.y + 2;
    let was = null, busy = false, veil = null;
    /* where you land: off the partner's square on the side it points away from, in the same lane you came in by if that tile's free */
    function landing(to, lane) {
        const [ox, oy] = OUT[to.d], free = LIVE.tileFree(to.l), cand = [];
        for (const k of [lane, 1 - lane]) cand.push(ox === 1 ? [to.x - 1, to.y + k] : ox === -1 ? [to.x + 2, to.y + k] : oy === 1 ? [to.x + k, to.y - 1] : [to.x + k, to.y + 2]);
        for (const c of cand) if (free(c[0], c[1])) return { x: c[0], y: c[1], dir: FACE[(-ox) + "," + (-oy)] };
        return null;
    }
    function fade(to, then) {
        const stage = document.getElementById("stage") || document.body;
        if (!veil) { veil = document.createElement("div"); veil.className = "hw-arrow-veil"; veil.setAttribute("aria-hidden", "true"); stage.appendChild(veil); }
        const quick = matchMedia("(prefers-reduced-motion: reduce)").matches;
        veil.style.transition = "opacity " + (quick ? 0 : to ? 180 : 260) + "ms ease"; requestAnimationFrame(() => { veil.style.opacity = to ? "1" : "0"; veil.style.pointerEvents = to ? "auto" : "none"; });
        setTimeout(then || (() => {}), quick ? 0 : to ? 200 : 280);
    }
    function go(from, to, lane) {
        const land = landing(to, lane), w = LIVE.walker; if (!land || !w) return;
        busy = true; w.pts = []; w.walking = false; w.busy = true; window.hwTrack && window.hwTrack("hallway_arrow");
        fade(true, () => {
            w.l = to.l; w.x = land.x; w.y = land.y; w.z = LIVE.nodeZ(to.l, land.x, land.y) || 0; w.dir = land.dir; w.seat = null; w.st = null; w.busy = false;
            const p = LIVE.mapPoint(land.x + .5, land.y + .5, w.z); LIVE.camera(p[0], p[1] - 30); LIVE.wake();
            was = land.x + "," + land.y + "," + to.l.id;
            setTimeout(() => fade(false, () => { busy = false; }), 120);
        });
    }
    setInterval(() => {
        const w = LIVE.walker; if (!w || busy || document.hidden || !w.l || w.l.stair) { if (w && w.l && !w.l.stair) was = Math.round(w.x) + "," + Math.round(w.y) + "," + w.l.id; return; }
        const x = Math.round(w.x), y = Math.round(w.y), here = x + "," + y + "," + w.l.id; if (here === was) return; const prev = was; was = here;
        const list = arrows(), a = list.find(q => q.l === w.l && on(q, x, y)); if (!a || !a.p.link) return;
        /* only stepping onto it from off it */
        if (prev) { const [px, py, pl] = prev.split(","); if (pl === w.l.id && on(a, +px, +py)) return; }
        const b = list.find(q => q.p.id === a.p.link && q !== a); if (!b) return;
        go(a, b, a.d === 0 || a.d === 2 ? y - a.y : x - a.x);
    }, 50);
    window.HallwayArrows = { arrows, landing };
})();

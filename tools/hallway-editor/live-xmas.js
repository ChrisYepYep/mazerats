/* Christmas in the Hallway: it follows the site's skin, the Warren's preview included, as it is when the page opens. The tree, gifts, garlands and snowy views are in their own sets of pictures;
   here we only say which sets to ask for, and let snow fall in the windows. */
(function () {
    "use strict";
    const worn = () => { try { if (/[?&]xmas=1/.test(location.search)) return true; const p = window.parent !== window ? window.parent : window; return !!(p.SkinWear && p.SkinWear.current && /christmas/i.test(String(p.SkinWear.current() || ""))); } catch (e) { return false; } };
    let tries = 0; const again = setInterval(() => { if (!window.HALLWAY_PLAY) { clearInterval(again); return; } if (worn() && !window.hallwayXmas) { window.hallwayXmas = true; if (window.HallwayLive) HallwayLive.wake(); } if (++tries > 8) clearInterval(again); }, 800);
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const barsOf = W => Math.max(1, Math.round(W / 26)), railsOf = (b, top) => top - b > 90 ? [b + (top - b) * .33, b + (top - b) * .66] : [b + (top - b) * .55];
    const glass = (W, b, top, y, z) => { if (y < 1 || y > W - 1 || z < b + 3 || z > top - 2) return false; const n = barsOf(W); for (let i = 1; i <= n; i++) if (Math.abs(y - W * i / (n + 1)) < 1.3) return false; for (const r of railsOf(b, top)) if (Math.abs(z - r) < 1.3) return false; return true; };
    function windows() { const l = LIVE.floor; if (!l || !l.wallItems || !LIVE.walker) return []; const v = LIVE.view(), out = []; for (const q of l.wallItems) { if (q.k !== "i_window") continue; const t = q.axis === "y" ? [q.line, Math.floor(q.at)] : [Math.floor(q.at), q.line], z = LIVE.nodeZ(l, t[0], t[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, q.at, z) : LIVE.mapPoint(q.at, q.line, z); if (a[0] > v.x0 - 200 && a[0] < v.x1 + 200 && a[1] > v.y0 - 40 && a[1] < v.y1 + 200) out.push({ q, z }); } return out; }
    LIVE.add({ active: () => !!window.hallwayXmas && windows().length > 0,
        over(c, ox, oy, now) { const t = now / 1000; c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.fillStyle = "#ffffff";
            for (const { q, z } of windows()) { const W = q.w || 52, b = q.b || 0, top = q.top || 78, start = q.at - W / 32, H = top - b;
                for (let i = 0; i < W * 2; i++) { const u = (i * 17 + Math.round(Math.sin(t * .8 + i) * 2) + 500) % W, h = H - (Math.floor(i * 11 + t * (10 + i % 4)) % H), zz = b + h; if (!glass(W, b, top, u, zz)) continue; const p = q.axis === "y" ? LIVE.mapPoint(q.line, start + u / 16, z + zz) : LIVE.mapPoint(start + u / 16, q.line, z + zz); c.fillRect(Math.round(p[0]), Math.round(p[1]) - 6, 1, 1); } } } });

    /* ---------- festoon bulbs ---------- */
    const COL = { amber: [{ lit: [255, 176, 64], dark: [150, 84, 18], hi: [255, 236, 190] }], warm: [{ lit: [255, 226, 160], dark: [170, 130, 70], hi: [255, 250, 230] }], cool: [{ lit: [214, 236, 255], dark: [110, 140, 170], hi: [255, 255, 255] }],
        multi: [{ lit: [255, 74, 90], dark: [150, 22, 40], hi: [255, 196, 200] }, { lit: [255, 206, 70], dark: [168, 116, 20], hi: [255, 245, 200] }, { lit: [82, 214, 106], dark: [24, 112, 48], hi: [208, 250, 214] }, { lit: [90, 184, 255], dark: [26, 90, 170], hi: [214, 238, 255] }, { lit: [255, 140, 56], dark: [160, 66, 14], hi: [255, 222, 190] }],
        redgreen: [{ lit: [255, 74, 90], dark: [150, 22, 40], hi: [255, 196, 200] }, { lit: [82, 214, 106], dark: [24, 112, 48], hi: [208, 250, 214] }], blue: [{ lit: [90, 184, 255], dark: [26, 90, 170], hi: [214, 238, 255] }, { lit: [214, 236, 255], dark: [110, 140, 170], hi: [255, 255, 255] }] };
    const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
    const hash = n => { const v = Math.sin(n * 91.7) * 43758.5; return v - Math.floor(v); };
    /* the homepage's breathing: each bulb on its own slow cycle, and a swell along the string, never off */
    const level = (q, i, t) => { if (!q.twinkle) return 1; const ph = hash(i + q.at * 7), per = 3 + hash(i * 3 + q.at) * 2.5, own = Math.pow(.5 + .5 * Math.sin((t / per + ph) * Math.PI * 2), .7), swell = .5 + .5 * Math.sin((t / 9 - i / 8) * Math.PI * 2); return .25 + .75 * (.6 * own + .4 * swell); };
    function festoons() { const l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!l || !l.wallItems) return []; const v = LIVE.view(), def = (window.WALL_ITEMS || []).find(i => i.id === "i_festoon"); if (!def || !def.bulbs) return []; const out = []; for (const q of l.wallItems) { if (q.k !== "i_festoon") continue; const t = q.axis === "y" ? [q.line, Math.floor(q.at)] : [Math.floor(q.at), q.line], z = LIVE.nodeZ(l, t[0], t[1]) || l.k * 163, a = q.axis === "y" ? LIVE.mapPoint(q.line, q.at, z) : LIVE.mapPoint(q.at, q.line, z); if (a[0] < v.x0 - 120 || a[0] > v.x1 + 120 || a[1] < v.y0 - 40 || a[1] > v.y1 + 220) continue; out.push({ q, def, c: [Math.round(a[0]), Math.round(a[1] - (q.h === undefined ? def.h : q.h))] }); } return out; }
    function drawBulbs(c, ox, oy, now) {
        if (!window.hallwayXmas) return; const list = festoons(); if (!list.length) return; const t = now / 1000, m = LIVE.mood(), night = !m ? .6 : ((n => n === "night" ? 1 : n === "dusk" || n === "dawn" || n === "failing" ? .7 : .25)(m.a) * (1 - m.f) + (n => n === "night" ? 1 : n === "dusk" || n === "dawn" || n === "failing" ? .7 : .25)(m.b) * m.f);
        c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false;
        for (const { q, def, c: base } of list) { const box = q.axis === "x" ? def.x : def.y, L0 = box.layers[0], flip = !!L0.flip, pal = COL[q.colour] || COL.amber;
            def.bulbs.forEach((b, i) => { const sx = flip ? box.w - 1 - b[0] : b[0], X = base[0] + L0.x + sx, Y = base[1] + L0.y + b[1], col = pal[i % pal.length], L = level(q, i, t);
                /* the pool of light on the wall, stronger in the dark */
                c.globalCompositeOperation = "lighter"; const g = c.createRadialGradient(X + .5, Y + 3, 0, X + .5, Y + 3, 14); g.addColorStop(0, `rgba(${col.lit[0]},${col.lit[1]},${col.lit[2]},${.3 * L * night})`); g.addColorStop(.45, `rgba(${col.lit[0]},${col.lit[1]},${col.lit[2]},${.1 * L * night})`); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(X - 14, Y - 11, 29, 29);
                c.globalCompositeOperation = "source-over";
                /* the glass: dark rim on the right, a highlight on the left, brighter as it breathes */
                const body = mix(col.dark, col.lit, L), edge = mix(mix(col.dark, [0, 0, 0], .35), col.dark, L), hi = mix(body, col.hi, L), px = (dx, dy, cc) => { c.fillStyle = `rgb(${cc[0]},${cc[1]},${cc[2]})`; c.fillRect(X + dx, Y + dy, 1, 1); };
                for (const [dy, a0, a1] of [[0, -1, 1], [1, -1, 1], [2, -1, 1], [3, -1, 0], [4, 0, 0]]) for (let dx = a0; dx <= a1; dx++) px(dx, dy, body);
                for (const [dx, dy] of [[1, 1], [1, 2], [0, 3], [1, 0]]) px(dx, dy, edge);
                px(-1, 0, hi); px(-1, 1, mix(hi, [255, 255, 255], L * .8)); px(0, 0, hi);
                if (night > .5) { c.globalAlpha = .35 * L; for (const [dx, dy] of [[-2, 1], [2, 1], [0, -1], [0, 5], [-2, 3], [2, 3]]) px(dx, dy, col.lit); c.globalAlpha = 1; }
            }); }
        c.restore();
    }
    LIVE.add({ still: true, under: drawBulbs });
    LIVE.add({ active: () => !!window.hallwayXmas && festoons().some(f => f.q.twinkle), under() { } });
})();

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
})();

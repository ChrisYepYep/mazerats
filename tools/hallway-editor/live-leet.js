/* The Leet Show's posters, live (9 Nov 2026, his: "it should show the date and time of the next show - as if it's a show in the
   theatredrome, but a touch of realism with the date and time being a real stamp of when the next stream is").

   Each poster has a cream slip pasted across its foot (ideas/leetshow.js). Here the next show's date and time are stamped on it in red
   ink, in the visitor's own time: "SAT 14 NOV / 8:30 PM", "TONIGHT", "TOMORROW", "ON NOW!" while it's on, "COMING SOON" when no show
   is set. The shows are the map's leetShow.times (set in the editor's Map tab); a feed can fill the same list later.
   The slip is found in the poster's own picture by its colour, so the stamp sits on it on either wall, either way the stand turns.
   Furniture in front hides it, and the time of day tints it, as it does the avatar. */
(function () {
    "use strict";
    const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const clock = d => { const h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + (h < 12 ? " AM" : " PM"); };
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    /* what the slip says, as lines */
    function lines(map, now) {
        const ls = (map && map.leetShow) || {}, mins = ls.mins || 180, times = (ls.times || []).map(t => new Date(t)).filter(d => !isNaN(d)).sort((a, b) => a - b);
        if (times.some(d => d <= now && now < +d + mins * 60000)) return ["ON NOW!", "LIVE"];
        const next = times.find(d => d > now); if (!next) return ["COMING", "SOON"];
        const today = new Date(now), tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
        const day = sameDay(next, today) ? "TONIGHT" : sameDay(next, tomorrow) ? "TOMORROW" : DAYS[next.getDay()] + " " + next.getDate() + " " + MONTHS[next.getMonth()];
        return [day, clock(next)];
    }
    window.LeetShow = { lines };
    const LIVE = window.HallwayLive, SF = window.StampFont; if (!LIVE || !SF) return;
    const SLIP = [0xf3, 0xe7, 0xc7], INK = [150, 26, 26];

    /* a picture's slip, as it is drawn on screen (flipped already where it is), once per picture and way round */
    const slips = new Map(), imgs = new Map();
    const img = f => { if (!imgs.has(f)) { const i = new Image(); i.onload = () => LIVE.wake(); i.src = "art/wall/" + f; imgs.set(f, i); } return imgs.get(f); };
    function slipOf(f, flip) {
        const key = f + (flip ? "|f" : ""); if (slips.has(key)) return slips.get(key);
        const im = img(f); if (!im.complete || !im.naturalWidth) return null;
        const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext("2d", { willReadFrequently: true });
        if (flip) { g.translate(c.width, 0); g.scale(-1, 1); } g.drawImage(im, 0, 0);
        const s = SF.findSlip(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, SLIP); slips.set(key, s); return s;
    }
    /* the Leet Show's posters on this floor: where each picture goes, which way round, and who stands where to see what's in front of it */
    function posters(l) {
        const out = [], items = window.WALL_ITEMS || [];
        for (const q of l.wallItems || []) {
            if (q.k !== "i_leet_poster" && q.k !== "i_leet_bill") continue;
            const def = items.find(i => i.id === q.k), box = def && (q.axis === "x" ? def.x : def.y), r = LIVE.wallItemRect(l, q); if (!box || !r) continue; const L = box.layers[0];
            /* the stand-in on the floor right at the wall's foot (behind the wall, the wall itself would hide it all), so what stands out in the room counts as in front */
            /* at the poster's near end along the wall: on that row, only what stands further along counts as in front */ const at = Math.floor(q.at - (q.axis === "x" ? 0 : 1) - r.w / 32), who = q.axis === "x" ? { x: at, y: q.line } : { x: q.line, y: at };
            out.push({ f: L.f, flip: !!L.flip, x0: Math.round(r.x0), y0: Math.round(r.y0), who });
        }
        for (const p of l.props || []) {
            if (p.k !== "leetstand") continue; const pc = LIVE.pieceOf(p); if (!pc) continue;
            const a = LIVE.mapPoint(p.x + pc.dx, p.y + pc.dx, LIVE.tileZ(l, p.x, p.y));
            /* the stand-in stands on the stand's own tile and is seated on it, so the stand itself doesn't hide its own slip */
            out.push({ f: pc.fp.f, flip: false, x0: Math.round(a[0]) - pc.fp.ox, y0: Math.round(a[1]) - pc.fp.oy, who: { x: p.x, y: p.y, seat: { p, x: p.x, y: p.y, l, dir: 2 } } });
        }
        return out;
    }
    /* the stamp, on its own canvas: cut by what's in front, tinted by the time of day, then onto the map */
    const ink = document.createElement("canvas"), ig = ink.getContext("2d");
    LIVE.add({ still: true, under(c, ox, oy) {
        const l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!l) return;
        const list = posters(l); if (!list.length) return;
        const v = LIVE.view(), text = lines(LIVE.map, Date.now());
        c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false;
        for (const P of list) {
            const s = slipOf(P.f, P.flip); if (!s) continue;
            const im = img(P.f), w = im.naturalWidth, h = im.naturalHeight; if (P.x0 > v.x1 || P.x0 + w < v.x0 || P.y0 > v.y1 || P.y0 + h < v.y0) continue;
            /* one line or two: the wide bill's slip has room for one */
            const ln = s.rows >= 12 ? text : [text.join("  ")];
            if (ink.width < w || ink.height < h) { ink.width = Math.max(ink.width, w); ink.height = Math.max(ink.height, h); }
            ig.clearRect(0, 0, ink.width, ink.height); ig.fillStyle = `rgb(${INK[0]},${INK[1]},${INK[2]})`;
            for (const [x, y] of SF.onSlip(s, ln)) ig.fillRect(x, y, 1, 1);
            /* a stamp's ink is never quite even: a few pixels lighter, the same ones every time */
            ig.fillStyle = "rgba(243,231,199,.35)"; for (const [x, y] of SF.onSlip(s, ln)) if (((x * 7 + y * 13) % 11) === 0) ig.fillRect(x, y, 1, 1);
            const z = LIVE.tileZ(l, Math.floor(P.who.x), Math.floor(P.who.y)) || 0;
            LIVE.as({ x: P.who.x, y: P.who.y, z, l, dir: 2, frame: 0, st: null, seat: P.who.seat || null }, () => { LIVE.cutInFront(ig, P.x0, P.y0); LIVE.tint(ig, w, h); });
            c.drawImage(ink, 0, 0, w, h, P.x0, P.y0, w, h);
        }
        c.restore();
    } });
    /* the stamp changes as shows come and go: look again each minute */
    setInterval(() => { const l = LIVE.floor; if (l && posters(l).length && !document.hidden) LIVE.wake(); }, 60000);
})();

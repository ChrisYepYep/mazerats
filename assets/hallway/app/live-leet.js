/* The Leet Show's posters, live (9 Nov 2026, his: "it should show the date and time of the next show - as if it's a show in the
   theatredrome, but a touch of realism with the date and time being a real stamp of when the next stream is").

   Each poster has a cream slip pasted across its foot (ideas/leetshow.js). Here the next show's date and time are stamped on it in red
   ink, in the visitor's own time: "SAT 14 NOV / 8:30 PM", "TONIGHT", "TOMORROW", "ON NOW!" while it's on, "COMING SOON" when no show
   is set. The shows are the map's leetShow.times (set in the editor's Map tab); a feed can fill the same list later.
   The slip is found in the poster's own picture by its colour, so the stamp sits on it on either wall, either way the stand turns.
   It only goes where the slip really shows on screen, in the slip's own light. */
(function () {
    "use strict";
    const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const clock = d => { const h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + (h < 12 ? " AM" : " PM"); };
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    /* what the slip says, as lines */
    /* Vincent Leet's own Twitch schedule (netlify/functions/leet-schedule.js), when the site can ask it: its streams win over the times
       typed in the editor, and ON NOW only when he's really live. Without it (not set up, the local editor, Twitch down) the typed times. */
    let feed = null;
    function lines(map, now, f = feed, room) {
        const ls = (map && map.leetShow) || {}, mins = ls.mins || 180, typed = (ls.times || []).map(t => new Date(t)).filter(d => !isNaN(d));
        const fromTwitch = !!(f && f.ok), streams = fromTwitch ? (f.times || []).map(t => new Date(t.start)).filter(d => !isNaN(d)) : [];
        /* the narrow stand's slip is only 24 across: the short form, day / 14/11 / 20:30 */
        const tiny = room && room.x1 - room.x0 < 30;
        if (fromTwitch && f.live) return tiny ? ["LIVE", "NOW"] : ["ON NOW!", "LIVE"];
        const times = (streams.length ? streams : typed).sort((a, b) => a - b);
        if (!fromTwitch && times.some(d => d <= now && now < +d + mins * 60000)) return tiny ? ["LIVE", "NOW"] : ["ON NOW!", "LIVE"];
        const next = times.find(d => d > now); if (!next) return tiny ? ["SOON"] : ["COMING", "SOON"];
        if (tiny) return [DAYS[next.getDay()], next.getDate() + "/" + String(next.getMonth() + 1).padStart(2, "0"), String(next.getHours()).padStart(2, "0") + ":" + String(next.getMinutes()).padStart(2, "0")];
        const today = new Date(now), tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
        const named = DAYS[next.getDay()], date = next.getDate() + " " + MONTHS[next.getMonth()];
        /* the narrow stand's slip: three short lines, and no room for TOMORROW there, so the day's name */
        if (room && room.rows >= 25) return sameDay(next, today) ? ["TONIGHT", clock(next)] : [named, date, clock(next)];
        const day = sameDay(next, today) ? "TONIGHT" : sameDay(next, tomorrow) ? "TOMORROW" : named + " " + date;
        return [day, clock(next)];
    }
    window.LeetShow = { lines, get feed() { return feed; } };
    /* ask on opening and every five minutes; the site keeps its own copy for a minute, so this is cheap */
    const ask = () => { if (document.hidden) return; fetch("/.netlify/functions/leet-schedule", { headers: { Accept: "application/json" } }).then(r => r.ok ? r.json() : null).then(j => { if (!j) return; const was = JSON.stringify(feed); feed = j; if (JSON.stringify(feed) !== was && window.HallwayLive) HallwayLive.wake(); }).catch(() => { /* the typed times stand */ }); };
    ask(); setInterval(ask, 5 * 60000);
    const LIVE = window.HallwayLive, SF = window.StampFont; if (!LIVE || !SF) return;
    const SLIP = [0xf3, 0xe7, 0xc7], RIM = [0xd9, 0xc4, 0x9a], DK = [0xb4, 0x9c, 0x6e], INK = [112, 12, 14];

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
            if (p.k !== "leetstand" && p.k !== "leetstand2") continue; const pc = LIVE.pieceOf(p); if (!pc) continue;
            const a = LIVE.mapPoint(p.x + pc.dx, p.y + pc.dx, LIVE.tileZ(l, p.x, p.y));
            /* the stand-in stands on the stand's own tile and is seated on it, so the stand itself doesn't hide its own slip */
            out.push({ f: pc.fp.f, flip: false, x0: Math.round(a[0]) - pc.fp.ox, y0: Math.round(a[1]) - pc.fp.oy, who: { x: p.x, y: p.y, seat: { p, x: p.x, y: p.y, l, dir: 2 } } });
        }
        return out;
    }
    /* The stamp goes only where the slip really shows on screen (9 Nov, his: stray bits of it appeared where a poster was hidden by
       another picture, or off the end of a wall). Each column of the slip is read back from the screen: its usual colour there is the
       slip as lit right now, and a pixel that differs from it is something else in front. The ink is the slip's own colour darkened to
       ink, so the time of day and the lamps tint it exactly as they tint the slip. */
    const near = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) <= 14;
    /* Read from a copy, never the view itself: reading a canvas back often makes the browser keep it off the graphics card, which slows
       every paint for the whole visit (play.js says the same). And not every paint (9 Nov scan, page finding 3): what a slip stamped is
       kept, and read again only when the camera, the zoom, the time of day, the squares' pictures or the words change, or after a second
       (for whatever moves past it). */
    const peek = document.createElement("canvas"), pk = peek.getContext("2d", { willReadFrequently: true });
    const stamped = new Map(); let stampedFor = null; const AGAIN_MS = 1000;
    function readBack(view, X0, Y0, w, h) {
        if (peek.width < w || peek.height < h) { peek.width = Math.max(peek.width, w); peek.height = Math.max(peek.height, h); }
        pk.clearRect(0, 0, w, h); pk.drawImage(view, X0, Y0, w, h, 0, 0, w, h); return pk.getImageData(0, 0, w, h).data;
    }
    /* Every floor's posters, not only the one you're on (9 Nov scan, content finding 3: the Floor 1 stand, seen from the Ground hall,
       showed a blank slip). The slip's colour test below already passes over one that something covers. */
    const allPosters = () => { const m = LIVE.map; if (!m) return []; const out = []; for (const l of m.levels) for (const P of posters(l)) out.push(P); return out; };
    LIVE.add({ still: true, under(c, ox, oy, now) {
        const here = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!here) return;
        const z = LIVE.zoom; if (z < 1) return;                                   // too small to read anyway
        const list = allPosters(); if (!list.length) return;
        const v = LIVE.view(), W = c.canvas.width, H = c.canvas.height, m = LIVE.mood(), view = [ox, oy, z, W, H, m ? m.a + "|" + m.b + "|" + (+m.f || 0).toFixed(2) : "-", LIVE.tileGen, !!window.hallwayXmas].join(",");
        if (stampedFor !== LIVE.map) { stamped.clear(); stampedFor = LIVE.map; }
        for (const P of list) {
            const s = slipOf(P.f, P.flip); if (!s) continue;
            const im = img(P.f), w = im.naturalWidth, h = im.naturalHeight; if (P.x0 > v.x1 || P.x0 + w < v.x0 || P.y0 > v.y1 || P.y0 + h < v.y0) continue;
            const text = lines(LIVE.map, Date.now(), feed, s), ln = s.rows >= 16 ? text : [text.join("  ")], key = P.f + "|" + P.x0 + "," + P.y0, sig = view + "|" + ln.join("/");
            const was = stamped.get(key); if (was && was.sig === sig && now - was.at < AGAIN_MS) { put(c, ox, oy, z, P, was.px); continue; }
            const px = []; stamped.set(key, { sig, at: now, px }); if (stamped.size > 60) stamped.clear();
            /* the slip's box on screen, read once */
            let top = 1e9, bot = -1; for (const cc of s.cols.values()) { top = Math.min(top, cc[0]); bot = Math.max(bot, cc[1]); }
            const X0 = Math.max(0, Math.floor(ox + (P.x0 + s.x0) * z)), Y0 = Math.max(0, Math.floor(oy + (P.y0 + top) * z)), X1 = Math.min(W, Math.ceil(ox + (P.x0 + s.x1 + 1) * z)), Y1 = Math.min(H, Math.ceil(oy + (P.y0 + bot + 1) * z));
            if (X1 <= X0 || Y1 <= Y0) continue;
            let d; try { d = readBack(c.canvas, X0, Y0, X1 - X0, Y1 - Y0); } catch (e) { return; }
            const at = (x, y) => { const X = Math.floor(ox + (P.x0 + x + .5) * z) - X0, Y = Math.floor(oy + (P.y0 + y + .5) * z) - Y0; if (X < 0 || Y < 0 || X >= X1 - X0 || Y >= Y1 - Y0) return null; const q = (Y * (X1 - X0) + X) * 4; return [d[q], d[q + 1], d[q + 2]]; };
            /* each column's usual colour, if most of the column shows it */
            const usual = new Map(); let shown = 0;
            for (const [x, cc] of s.cols) { const seen = new Map(); let n = 0; for (let y = cc[0]; y <= cc[1]; y++) { const p = at(x, y); if (!p) continue; n++; const k = (p[0] >> 2) + "," + (p[1] >> 2) + "," + (p[2] >> 2); const e = seen.get(k); if (e) e.n++; else seen.set(k, { p, n: 1 }); }
                let best = null; for (const e of seen.values()) if (!best || e.n > best.n) best = e; if (!best || best.n < n * .4) continue;
                /* and the slip's rim just above it must be lit the same way: a plain wall or floor where no poster shows can't pass both */
                const rim = at(x, cc[0] - 1); if (!rim || ![0, 1, 2].every(k => Math.abs(best.p[k] / SLIP[k] - rim[k] / RIM[k]) < .07)) continue;
                usual.set(x, best.p); shown++; }
            if (shown < s.cols.size * .3) continue;                                // the poster isn't there to be seen
            for (const [x, y] of SF.onSlip(s, ln)) { const u = usual.get(x), p = at(x, y); if (!u || !p) continue; /* the slip, or its rim top or bottom (letters stand upright, so their edges can reach the rim), in this light */ const paper = near(p, u) || near(p, u.map((v, k) => v * RIM[k] / SLIP[k])) || near(p, u.map((v, k) => v * DK[k] / SLIP[k])); if (!paper) continue; px.push(x, y, `rgb(${Math.round(p[0] * INK[0] / SLIP[0])},${Math.round(p[1] * INK[1] / SLIP[1])},${Math.round(p[2] * INK[2] / SLIP[2])})`); }
            put(c, ox, oy, z, P, px);
        }
    } });
    /* the stamp's ink: [x, y, colour] in threes, on the poster's picture */
    function put(c, ox, oy, z, P, px) { if (!px.length) return; c.save(); c.translate(ox, oy); c.scale(z, z); for (let i = 0; i < px.length; i += 3) { c.fillStyle = px[i + 2]; c.fillRect(P.x0 + px[i], P.y0 + px[i + 1], 1, 1); } c.restore(); }
    /* the stamp changes as shows come and go: look again each minute */
    setInterval(() => { if (LIVE.floor && allPosters().length && !document.hidden) LIVE.wake(); }, 60000);
})();

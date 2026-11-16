/* Railings along the edge of a floor, painted with the editor's brush.
   Stored per tile of edge, l.edgeItems [{ s, axis, line, t, in }]: axis "x" runs along x on line y = line, axis "y" along y on line x = line, like walls.
   in: which way the tile it stands on lies, +1 towards a higher line number, -1 towards a lower one. Touching tiles join into one run; on small steps a run climbs with them.
   Drawn by hand. A post is a fixed pixel stamp, always upright whatever the floor does, so it can't shear on a slope; the rail is four rows laid column by column
   along an exact straight line: dark line, side, lit top, dark line. */
(function () {
"use strict";
const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const paint = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rgb(v)]));
const STYLES = { wood: "Dark oak rail", gold: "Bronze rail", silver: "Silver rail" };
/* posts from the floor up; '.' is see-through, the light falls from the left */
const LOOK = {
    wood: {
        c: paint({ K: "120a05", h: "a87c4a", l: "8e6638", m: "5e3e22", d: "432a16", e: "2e1c0e" }), grain: true,
        post: [
            ".KKKK.", "KmmddK", "KhlmdK",
            ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.",
            "KmmddK", "KhlmdK",
            ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KmdK.",
            "..KK..", ".KmdK.", ".KhlK.", "..KK.."
        ]
    },
    /* Gold is bronze now (16 Nov 2026, his own drawing, railing-gold-post.png): the rope barrier's brass, a round flared foot, a slim
       shaft and a ball on top, outlined in black; the rail one flat bar, black above and below. Stored as "gold", so every gold railing
       already laid takes it. 8 across. */
    gold: {
        c: paint({ K: "000000", b: "6e4524", c: "3a2110", d: "ab7a44", e: "8c5c30", f: "54321a" }), rail: 16, railUp: { x: .5, y: 1 }, bar: { K: "K", lit: "e", side: "b" }, flipX: true,
        post: ["...KK...", ".KKbcKK.", "KbbddccK", "KddeeddK", "KbebfeeK", ".KKbfKK.", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KbfK..", "..KdfK..", "...KK...", "..KbcK..", ".KebbcK.", ".KdebbK.", "..KddK..", "...KK..."]
    },
    /* Silver (16 Nov 2026, his drawing, railing-wood-post.png made over): the same shape as the oak's, a collar half way, a ball on top. */
    silver: {
        c: paint({ K: "000000", b: "444444", c: "a0a0a0", d: "b6b6b6", e: "cbcbcb", f: "120a05", g: "6d6d6d", h: "858585" }), rail: 15, bar: { K: "f", lit: "c", side: "g" },
        post: [".KKKKKK.", "KbcddcbK", "KefcgfdK", ".KfcgfK.", "..fcgf..", "..fcgf..", "..fcgf..", "..fcgf..", "..fcgf..", "..fcgf..", "..fcgf..", "..fcgf..", ".fhhggf.", ".fdchgf.", "..fcgf..", "..fcgf..", "..fcgf..", "..fcgf..", "..fcgf..", "..fKKf..", "..KhbK..", ".KchhbK.", ".KdchhK.", "..KddK..", "...KK..."]
    }
};
const T = 16, RAIL0 = 14;   // the rail's lower line, in rows up from the floor (a look's own `rail` where its posts are taller)
/* All the pixels of one run: [X, Y, colour, which tile of the run]. at(fx, fy) gives the screen spot on the run's floor; lift(along) how far the floor there has climbed;
   postAt(along), optional, where a post meant for there should stand instead. */
function pixels(run, at, lift, postAt) {
    const { s, axis, line, a, b, dir } = run, look = LOOK[s] || LOOK.wood, C = look.c, out = new Map(), a0 = a * T, a1 = b * T, put = (x, y, c, t) => out.set(x + "," + y, [x, y, c, t]);
    const RAIL = look.rail || RAIL0, bar = look.bar;
    /* The floor's own spots are rounded to whole pixels, and rounding them again after adding a slope's climb makes the rail wobble. So: one spot, then the exact line from it. */
    const away = 2 / T, start = axis === "x" ? at(a, line + dir * away) : at(line + dir * away, a), sx = axis === "x" ? 1 : -1;
    const spot = (A, up) => { const along = (A + .5) / T, d = along - a; return [Math.round(start[0] + sx * d * 16), Math.round(start[1] + d * 8 - lift(along) - (up || 0))]; };
    /* the side facing +y catches more light than the one facing +x */
    const side = axis === "x" ? ["m", "d"] : ["d", "e"];
    let lastY = null;
    for (let A = a0; A < a1; A++) {
        /* railUp: the bar half a row higher, as his bronze is drawn (16 Nov 2026) */
        const [X, Y] = spot(A, look.railUp && look.railUp[axis]), g = look.grain && (A * 7) % 23 < 3 ? 1 : 0, glint = look.grain ? (A * 5) % 37 < 2 : (((A % 16) + 16) % 16) < 8;
        /* on a steep climb, fill between this column and the last, so the rail never breaks */
        const from = lastY === null ? Y : Math.min(Y, lastY), to = lastY === null ? Y : Math.max(Y, lastY);
        const t = Math.floor(A / T);
        /* a flat bar (bronze, silver): the same four rows on both sides, no grain or glint */
        /* ...and it stops at the end post's shaft: along y its first column stood one past it, a nub he rubbed out */
        if (bar && axis === "y" && A === a0) { lastY = Y; continue; }
        if (bar) { for (let y = from; y <= to; y++) { put(X, y - RAIL, C[bar.K], t); put(X, y - RAIL - 1, C[bar.side], t); } put(X, Y - RAIL - 1, C[bar.side], t); put(X, Y - RAIL - 2, C[bar.lit], t); put(X, Y - RAIL - 3, C[bar.K], t); lastY = Y; continue; }
        for (let y = from; y <= to; y++) { put(X, y - RAIL, C.K, t); put(X, y - RAIL - 1, C[side[g]], t); }
        put(X, Y - RAIL - 1, C[side[g]], t); put(X, Y - RAIL - 2, glint && look.grain ? C.h : C.l, t); put(X, Y - RAIL - 3, C.K, t);
        lastY = Y;
    }
    const posts0 = new Set([a0 + 2, a1 - 2]);
    for (let A = Math.ceil((a0 + 8) / 32) * 32; A < a1 - 8; A += 32) posts0.add(A);
    /* postAt(along): where a post there should really stand (on small steps, a step's nose); kept inside the run and clear of the next post */
    const moved = [...posts0].map(c => { if (!postAt) return [c, c]; const m = Math.round(postAt((c + .5) / T) * T - .5); return [c, m >= a0 + 2 && m <= a1 - 2 ? m : c]; });
    const posts = moved.filter(([c, m], i) => m === c || !moved.some(([c2, m2], j) => j !== i && Math.abs(m2 - m) < 8 && (m2 === c2 || j < i))).map(q => q[1]);
    for (const c of posts) {
        const [X, Y] = spot(c);
        /* any width, centred as the 6-wide oak's is (half a pixel left of the spot) */
        /* flipX: drawn the other way round along x (his bronze run, 16 Nov 2026) */
        const flip = look.flipX && axis === "x";
        look.post.forEach((row, h) => { const half = row.length >> 1, n = row.length; for (let i = 0; i < n; i++) { const ch = row[flip ? n - 1 - i : i]; if (ch !== ".") put(X + i - half, Y - h, C[ch], Math.floor(c / T)); } });
    }
    return [...out.values()];
}
/* Touching tiles of one style, line and side join into runs. */
function runsOf(items) {
    const groups = new Map(), runs = [];
    for (const q of items) { const k = [q.s, q.axis, q.line, q.in].join("|"); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q.t); }
    for (const [k, list] of groups) {
        const [s, axis, line, dir] = k.split("|"); list.sort((x, y) => x - y);
        let a = list[0], prev = list[0];
        for (let i = 1; i <= list.length; i++) { if (list[i] !== prev + 1) { runs.push({ s, axis, line: +line, dir: +dir, a, b: prev + 1 }); a = list[i]; } prev = list[i]; }
    }
    return runs;
}
if (typeof module !== "undefined") module.exports = { STYLES, pixels, runsOf };
if (typeof window !== "undefined") window.EdgeItems = { STYLES, pixels, runsOf };
})();

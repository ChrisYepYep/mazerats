/* Railings along the edge of a floor, painted with the editor's brush.
   Stored per tile of edge, l.edgeItems [{ s, axis, line, t, in }]: axis "x" runs along x on line y = line, axis "y" along y on line x = line, like walls.
   in: which way the tile it stands on lies, +1 towards a higher line number, -1 towards a lower one. Touching tiles join into one run; on small steps a run climbs with them.
   Drawn by hand. A post is a fixed pixel stamp, always upright whatever the floor does, so it can't shear on a slope; the rail is four rows laid column by column
   along an exact straight line: dark line, side, lit top, dark line. */
(function () {
"use strict";
const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const paint = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rgb(v)]));
const STYLES = { wood: "Dark oak rail", gold: "Gold rail" };
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
    /* one slim post on a small round foot, with a true round ball on top */
    gold: {
        c: paint({ K: "2c1c06", h: "e4c47c", l: "c49a48", m: "a0742c", d: "86601f", e: "6a4814" }),
        post: [
            ".KKKK.", "KlmmdK",
            ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.",
            "..KK..", ".KmdK.", "KlmmdK", "KhlmmK", ".KhhK.", "..KK.."
        ]
    }
};
const T = 16, RAIL = 14;   // the rail's lower line, in rows up from the floor
/* All the pixels of one run: [X, Y, colour, which tile of the run]. at(fx, fy) gives the screen spot on the run's floor; lift(along) how far the floor there has climbed. */
function pixels(run, at, lift) {
    const { s, axis, line, a, b, dir } = run, look = LOOK[s] || LOOK.wood, C = look.c, out = new Map(), a0 = a * T, a1 = b * T, put = (x, y, c, t) => out.set(x + "," + y, [x, y, c, t]);
    /* The floor's own spots are rounded to whole pixels, and rounding them again after adding a slope's climb makes the rail wobble. So: one spot, then the exact line from it. */
    const away = 2 / T, start = axis === "x" ? at(a, line + dir * away) : at(line + dir * away, a), sx = axis === "x" ? 1 : -1;
    const spot = A => { const along = (A + .5) / T, d = along - a; return [Math.round(start[0] + sx * d * 16), Math.round(start[1] + d * 8 - lift(along))]; };
    /* the side facing +y catches more light than the one facing +x */
    const side = axis === "x" ? ["m", "d"] : ["d", "e"];
    let lastY = null;
    for (let A = a0; A < a1; A++) {
        const [X, Y] = spot(A), g = look.grain && (A * 7) % 23 < 3 ? 1 : 0, glint = look.grain ? (A * 5) % 37 < 2 : (((A % 16) + 16) % 16) < 8;
        /* on a steep climb, fill between this column and the last, so the rail never breaks */
        const from = lastY === null ? Y : Math.min(Y, lastY), to = lastY === null ? Y : Math.max(Y, lastY);
        const t = Math.floor(A / T);
        for (let y = from; y <= to; y++) { put(X, y - RAIL, C.K, t); put(X, y - RAIL - 1, C[side[g]], t); }
        put(X, Y - RAIL - 1, C[side[g]], t); put(X, Y - RAIL - 2, glint && look.grain ? C.h : C.l, t); put(X, Y - RAIL - 3, C.K, t);
        lastY = Y;
    }
    const posts = new Set([a0 + 2, a1 - 2]);
    for (let A = Math.ceil((a0 + 8) / 32) * 32; A < a1 - 8; A += 32) posts.add(A);
    for (const c of posts) {
        const [X, Y] = spot(c);
        look.post.forEach((row, h) => { for (let i = 0; i < 6; i++) if (row[i] !== ".") put(X + i - 3, Y - h, C[row[i]], Math.floor(c / T)); });
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

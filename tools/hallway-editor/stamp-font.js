/* A date-stamp's lettering for the Leet Show posters' slips: 7 rows tall, mostly 4 wide, with M, N, T, V, W and Y 5 wide so they stay
   clear on the slant (9 Nov 2026, his: "make the date and time text on the posters clearer"; the first was 3 by 5). The art build
   letters "NEXT SHOW" with it, and live-leet.js stamps the date and time onto the slip. Capitals, digits and a little punctuation. */
(function (root) {
    "use strict";
    const rows = s => s.split(" ");
    const G = {
        A: rows(".##. #..# #..# #### #..# #..# #..#"), B: rows("###. #..# #..# ###. #..# #..# ###."), C: rows(".### #... #... #... #... #... .###"),
        D: rows("###. #..# #..# #..# #..# #..# ###."), E: rows("#### #... #... ###. #... #... ####"), F: rows("#### #... #... ###. #... #... #..."),
        G: rows(".### #... #... #.## #..# #..# .###"), H: rows("#..# #..# #..# #### #..# #..# #..#"), I: rows("### .#. .#. .#. .#. .#. ###"),
        J: rows("..## ...# ...# ...# ...# #..# .##."), K: rows("#..# #..# #.#. ##.. #.#. #..# #..#"), L: rows("#... #... #... #... #... #... ####"),
        M: rows("#...# ##.## #.#.# #.#.# #...# #...# #...#"), N: rows("#...# ##..# #.#.# #..## #...# #...# #...#"), O: rows(".##. #..# #..# #..# #..# #..# .##."),
        P: rows("###. #..# #..# ###. #... #... #..."), Q: rows(".##. #..# #..# #..# #.## #..# .##."), R: rows("###. #..# #..# ###. #.#. #..# #..#"),
        S: rows(".### #... #... .##. ...# ...# ###."), T: rows("##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#.."), U: rows("#..# #..# #..# #..# #..# #..# .##."),
        V: rows("#...# #...# #...# #...# .#.#. .#.#. ..#.."), W: rows("#...# #...# #...# #.#.# #.#.# ##.## #...#"), X: rows("#..# #..# .##. .##. .##. #..# #..#"),
        Y: rows("#...# #...# .#.#. ..#.. ..#.. ..#.. ..#.."), Z: rows("#### ...# ..#. .#.. #... #... ####"),
        0: rows(".##. #..# #..# #..# #..# #..# .##."), 1: rows(".#. ##. .#. .#. .#. .#. ###"), 2: rows(".##. #..# ...# ..#. .#.. #... ####"),
        3: rows("###. ...# ...# .##. ...# ...# ###."), 4: rows("#..# #..# #..# #### ...# ...# ...#"), 5: rows("#### #... #... ###. ...# ...# ###."),
        6: rows(".##. #... #... ###. #..# #..# .##."), 7: rows("#### ...# ..#. ..#. .#.. .#.. .#.."), 8: rows(".##. #..# #..# .##. #..# #..# .##."),
        9: rows(".##. #..# #..# .### ...# ...# .##."),
        ":": rows(". . # . # . ."), ".": rows(". . . . . . #"), ",": rows(". . . . . # #"), "-": rows("... ... ... ### ... ... ..."), "!": rows("# # # # # . #"), "/": rows("..# ..# .#. .#. .#. #.. #.."), "'": rows("# # . . . . .")
    };
    const SPACE = 3, H = 7;
    /* the pixels of a line of text: [[x, y], ...] with its width; one pixel between letters */
    function stamp(s) {
        const out = []; let x = 0;
        for (const ch of String(s).toUpperCase()) {
            if (ch === " ") { x += SPACE; continue; }
            const g = G[ch]; if (!g) continue;
            g.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === "#") out.push([x + i, y, x]); });
            x += g[0].length + 1;
        }
        return { px: out, w: Math.max(0, x - 1), h: H };
    }
    /* Where a picture's slip is: its pixels of exactly the slip colour (or colours) (rgba, w by h, as the picture is drawn on screen, so flipped already
       if it is). Each column has its own top, as the slip lies on a slanted face; across is the column from the slip's left. */
    /* colour: one [r, g, b], or a list of them that all count as the slip (his narrow stand has light streaks across its paper, 9 Nov 2026:
       left out, a streak at a column's top moved that column's lettering down and broke the letters apart) */
    function findSlip(rgba, w, h, colour) {
        const cols = new Map(), list = Array.isArray(colour[0]) ? colour : [colour]; let x0 = 1e9, x1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = (y * w + x) * 4; if (rgba[q + 3] < 128 || !list.some(c => rgba[q] === c[0] && rgba[q + 1] === c[1] && rgba[q + 2] === c[2])) continue; const c = cols.get(x); if (!c) cols.set(x, [y, y]); else { c[0] = Math.min(c[0], y); c[1] = Math.max(c[1], y); } x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        if (x1 < 0) return null; let rows = 0; for (const c of cols.values()) rows = Math.max(rows, c[1] - c[0] + 1);
        return { x0, x1, cols, rows };
    }
    /* the pixels to stamp: each line centred across the slip, one row in from its top, two rows between lines. [[x, y], ...] in the picture */
    function onSlip(slip, lines) {
        const out = [], width = slip.x1 - slip.x0 + 1, v0 = Math.max(1, Math.floor((slip.rows - (lines.length * (H + 2) - 2)) / 2));
        /* every column from the slip's own top there: the lettering steps with the wall, a pixel every two columns, as the rest of the art does */
        lines.forEach((s, n) => { const t = stamp(s), u0 = Math.floor((width - t.w) / 2); for (const [x, y] of t.px) { const X = slip.x0 + u0 + x, c = slip.cols.get(X); if (!c) continue;
            const Y = c[0] + v0 + n * (H + 2) + y; if (Y >= c[0] - 1 && Y <= c[1] + 1) out.push([X, Y]); } });     // the rims top and bottom are paper too
        return out;
    }
    /* A bold face for the narrow stand (9 Nov 2026, his pick, "two bold lines on the slant"): 9 rows, upright strokes two pixels thick,
       for the day and the time alone, FRI over 8AM. Most 5 wide, N and T 6, I a bare stem, 1 and the colon narrow so 10AM still fits 21 */
    const B = {
        A: rows(".###. ##.## ##.## ##.## ##### ##.## ##.## ##.## ##.##"), B: rows("####. ##.## ##.## ##.## ####. ##.## ##.## ##.## ####."),
        D: rows("####. ##.## ##.## ##.## ##.## ##.## ##.## ##.## ####."), E: rows("##### ##... ##... ##... ####. ##... ##... ##... #####"),
        F: rows("##### ##... ##... ##... ####. ##... ##... ##... ##..."), H: rows("##.## ##.## ##.## ##.## ##### ##.## ##.## ##.## ##.##"),
        I: rows("## ## ## ## ## ## ## ## ##"), L: rows("##... ##... ##... ##... ##... ##... ##... ##... #####"),
        M: rows("##.## ##### ##### ##.## ##.## ##.## ##.## ##.## ##.##"), N: rows("##..## ###.## ###.## ###### ##.### ##.### ##..## ##..## ##..##"),
        O: rows(".###. ##.## ##.## ##.## ##.## ##.## ##.## ##.## .###."), P: rows("####. ##.## ##.## ##.## ####. ##... ##... ##... ##..."),
        R: rows("####. ##.## ##.## ##.## ####. ##.#. ##.## ##.## ##.##"), S: rows(".#### ##... ##... ##... .###. ...## ...## ...## ####."),
        T: rows("###### ..##.. ..##.. ..##.. ..##.. ..##.. ..##.. ..##.. ..##.."), U: rows("##.## ##.## ##.## ##.## ##.## ##.## ##.## ##.## .###."),
        V: rows("##.## ##.## ##.## ##.## ##.## ##.## .###. .###. ..#.."), W: rows("##.## ##.## ##.## ##.## ##.## ##### ##### ##.## #...#"),
        0: rows(".###. ##.## ##.## ##.## ##.## ##.## ##.## ##.## .###."), 1: rows(".## ### .## .## .## .## .## .## .##"),
        2: rows("####. ...## ...## ...## .###. ##... ##... ##... #####"), 3: rows("####. ...## ...## ...## .###. ...## ...## ...## ####."),
        4: rows("##.## ##.## ##.## ##.## ##### ...## ...## ...## ...##"), 5: rows("##### ##... ##... ##... ####. ...## ...## ...## ####."),
        6: rows(".###. ##... ##... ##... ####. ##.## ##.## ##.## .###."), 7: rows("##### ...## ...## ..##. ..##. .##.. .##.. .##.. .##.."),
        8: rows(".###. ##.## ##.## ##.## .###. ##.## ##.## ##.## .###."), 9: rows(".###. ##.## ##.## ##.## .#### ...## ...## ...## .###."),
        ":": rows(".. .. ## ## .. .. ## ## ..")
    };
    const BH = 9;
    function stampBold(s) {
        const out = []; let x = 0;
        for (const ch of String(s).toUpperCase()) { const g = B[ch]; if (!g) continue; g.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === "#") out.push([x + i, y, x]); }); x += g[0].length + 1; }
        return { px: out, w: Math.max(0, x - 1), h: BH };
    }
    /* the bold lines on a slip, on the wall's slant as onSlip, centred exactly (so the stand's two ways round are mirror images); a line too
       wide for the slip in bold is stamped in the usual face instead */
    function onSlipBold(slip, lines) {
        const width = slip.x1 - slip.x0 + 1, made = lines.map(s => { const b = stampBold(s); return b.w <= width ? b : stamp(s); }), LEAD = 3;
        const total = made.reduce((n, t) => n + t.h, 0) + LEAD * (made.length - 1), out = [];
        let v = Math.max(1, Math.floor((slip.rows - total) / 2));
        /* an odd space left over goes to the same side as the picture faces, so the two ways round match exactly */
        const mirror = slip.cols.get(slip.x0) && slip.cols.get(slip.x1) && slip.cols.get(slip.x0)[0] > slip.cols.get(slip.x1)[0];
        for (const t of made) { const u0 = (mirror ? Math.ceil : Math.floor)((width - t.w) / 2); for (const [x, y] of t.px) { const X = slip.x0 + u0 + x, c = slip.cols.get(X); if (!c) continue; const Y = c[0] + v + y; if (Y >= c[0] - 1 && Y <= c[1] + 1) out.push([X, Y]); } v += t.h + LEAD; }
        return out;
    }
    const api = { stamp, stampBold, findSlip, onSlip, onSlipBold, GLYPHS: G, BOLD: B, H };
    if (typeof module !== "undefined" && module.exports) module.exports = api; else root.StampFont = api;
})(typeof window !== "undefined" ? window : this);

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
        ":": rows(". . # . # . ."), ".": rows(". . . . . . #"), ",": rows(". . . . . # #"), "-": rows("... ... ... ### ... ... ..."), "!": rows("# # # # # . #"), "'": rows("# # . . . . .")
    };
    const SPACE = 3, H = 7;
    /* the pixels of a line of text: [[x, y], ...] with its width; one pixel between letters */
    function stamp(s) {
        const out = []; let x = 0;
        for (const ch of String(s).toUpperCase()) {
            if (ch === " ") { x += SPACE; continue; }
            const g = G[ch]; if (!g) continue;
            g.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === "#") out.push([x + i, y]); });
            x += g[0].length + 1;
        }
        return { px: out, w: Math.max(0, x - 1), h: H };
    }
    /* Where a picture's slip is: its pixels of exactly the slip colour (rgba, w by h, as the picture is drawn on screen, so flipped already
       if it is). Each column has its own top, as the slip lies on a slanted face; across is the column from the slip's left. */
    function findSlip(rgba, w, h, colour) {
        const cols = new Map(); let x0 = 1e9, x1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = (y * w + x) * 4; if (rgba[q + 3] < 128 || rgba[q] !== colour[0] || rgba[q + 1] !== colour[1] || rgba[q + 2] !== colour[2]) continue; const c = cols.get(x); if (!c) cols.set(x, [y, y]); else { c[0] = Math.min(c[0], y); c[1] = Math.max(c[1], y); } x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        if (x1 < 0) return null; let rows = 0; for (const c of cols.values()) rows = Math.max(rows, c[1] - c[0] + 1);
        return { x0, x1, cols, rows };
    }
    /* the pixels to stamp: each line centred across the slip, one row in from its top, two rows between lines. [[x, y], ...] in the picture */
    function onSlip(slip, lines) {
        const out = [], width = slip.x1 - slip.x0 + 1, v0 = Math.max(1, Math.floor((slip.rows - (lines.length * (H + 2) - 2)) / 2));
        lines.forEach((s, n) => { const t = stamp(s), u0 = Math.floor((width - t.w) / 2); for (const [x, y] of t.px) { const X = slip.x0 + u0 + x, c = slip.cols.get(X); if (!c) continue; const Y = c[0] + v0 + n * (H + 2) + y; if (Y <= c[1]) out.push([X, Y]); } });
        return out;
    }
    const api = { stamp, findSlip, onSlip, GLYPHS: G, H };
    if (typeof module !== "undefined" && module.exports) module.exports = api; else root.StampFont = api;
})(typeof window !== "undefined" ? window : this);

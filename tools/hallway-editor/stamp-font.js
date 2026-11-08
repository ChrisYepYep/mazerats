/* A date-stamp's lettering, 5 rows tall and mostly 3 wide (M, N, W wider so they read), for the Leet Show posters' date slips: the art
   build letters "NEXT SHOW" with it, and live-leet.js stamps the date and time onto the slip. Capitals, digits and a little punctuation. */
(function (root) {
    "use strict";
    const G = {
        A: ["010", "101", "111", "101", "101"], B: ["110", "101", "110", "101", "110"], C: ["011", "100", "100", "100", "011"], D: ["110", "101", "101", "101", "110"],
        E: ["111", "100", "110", "100", "111"], F: ["111", "100", "110", "100", "100"], G: ["011", "100", "101", "101", "011"], H: ["101", "101", "111", "101", "101"],
        I: ["111", "010", "010", "010", "111"], J: ["001", "001", "001", "101", "010"], K: ["101", "101", "110", "101", "101"], L: ["100", "100", "100", "100", "111"],
        M: ["10001", "11011", "10101", "10001", "10001"], N: ["1001", "1101", "1011", "1001", "1001"], O: ["010", "101", "101", "101", "010"], P: ["110", "101", "110", "100", "100"],
        Q: ["010", "101", "101", "110", "011"], R: ["110", "101", "110", "101", "101"], S: ["011", "100", "010", "001", "110"], T: ["111", "010", "010", "010", "010"],
        U: ["101", "101", "101", "101", "011"], V: ["101", "101", "101", "101", "010"], W: ["10001", "10001", "10101", "11011", "10001"], X: ["101", "101", "010", "101", "101"],
        Y: ["101", "101", "010", "010", "010"], Z: ["111", "001", "010", "100", "111"],
        0: ["010", "101", "101", "101", "010"], 1: ["010", "110", "010", "010", "111"], 2: ["110", "001", "010", "100", "111"], 3: ["110", "001", "010", "001", "110"],
        4: ["101", "101", "111", "001", "001"], 5: ["111", "100", "110", "001", "110"], 6: ["011", "100", "110", "101", "010"], 7: ["111", "001", "010", "010", "010"],
        8: ["010", "101", "010", "101", "010"], 9: ["010", "101", "011", "001", "110"],
        ":": ["0", "1", "0", "1", "0"], ".": ["0", "0", "0", "0", "1"], ",": ["0", "0", "0", "1", "1"], "-": ["00", "00", "11", "00", "00"], "!": ["1", "1", "1", "0", "1"], "'": ["1", "1", "0", "0", "0"]
    };
    const SPACE = 2;
    /* the pixels of a line of text: [[x, y], ...] with its width; one pixel between letters */
    function stamp(s) {
        const out = []; let x = 0;
        for (const ch of String(s).toUpperCase()) {
            if (ch === " ") { x += SPACE; continue; }
            const g = G[ch]; if (!g) continue;
            g.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") out.push([x + i, y]); });
            x += g[0].length + 1;
        }
        return { px: out, w: Math.max(0, x - 1), h: 5 };
    }
    /* Where a picture's slip is: its pixels of exactly the slip colour (rgba, w by h, as the picture is drawn on screen, so flipped already
       if it is). Each column has its own top, as the slip lies on a slanted face; across is the column from the slip's left. */
    function findSlip(rgba, w, h, colour) {
        const cols = new Map(); let x0 = 1e9, x1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = (y * w + x) * 4; if (rgba[q + 3] < 128 || rgba[q] !== colour[0] || rgba[q + 1] !== colour[1] || rgba[q + 2] !== colour[2]) continue; const c = cols.get(x); if (!c) cols.set(x, [y, y]); else { c[0] = Math.min(c[0], y); c[1] = Math.max(c[1], y); } x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        if (x1 < 0) return null; let rows = 0; for (const c of cols.values()) rows = Math.max(rows, c[1] - c[0] + 1);
        return { x0, x1, cols, rows };
    }
    /* the pixels to stamp: each line centred across the slip, one row in from its top, a row between lines. [[x, y], ...] in the picture */
    function onSlip(slip, lines) {
        const out = [], width = slip.x1 - slip.x0 + 1;
        lines.forEach((s, n) => { const t = stamp(s), u0 = Math.floor((width - t.w) / 2); for (const [x, y] of t.px) { const X = slip.x0 + u0 + x, c = slip.cols.get(X); if (!c) continue; const Y = c[0] + 1 + n * 6 + y; if (Y <= c[1]) out.push([X, Y]); } });
        return out;
    }
    const api = { stamp, findSlip, onSlip, GLYPHS: G };
    if (typeof module !== "undefined" && module.exports) module.exports = api; else root.StampFont = api;
})(typeof window !== "undefined" ? window : this);

/* New hallway art, all built in the same projection as the hallway. Wall x=0 in model space, y along it; a larger y is further left and down on screen. */
"use strict";
const fs = require("fs"), R = require("path").resolve(__dirname, "../../..").replace(/\\/g, "/") + "/";
const { box, cyl, ball, M, render, col } = require("./iso3d.js"), dec = require(R + "tools/png-decode.js");
const OAK = M("a87446", "6e4524", "4c2e18", "160b05"), OAKDK = M("6e4524", "4c2e18", "33200f", "120905"), OAKLT = M("c08d58", "90623a", "6a4526", "1c0f06");
const GOLD = M("f0d28a", "c99f4c", "8a6420", "2c1c06"), BRASS = { ramp: ["5e3f12", "86601f", "b0822f", "d6ad56", "f4dc98"], edge: col("2c1c06"), top: col("e8c77a") };
const PLASTER = M("3a2416", "2e1c10", "241509", "120905");

/* a tiny bold capital font, 4 wide 5 tall, for engraved lettering */
const F = { A: "0110100111111001 1001", B: "1110100111101001 1110", C: "0111100010001000 0111", D: "1110100110011001 1110", E: "1111100011101000 1111", F: "1111100011101000 1000", G: "0111100010111001 0111", H: "1001100111111001 1001", I: "1110010001000100 1110", J: "0011000100011001 0110", K: "1001101011001010 1001", L: "1000100010001000 1111", M: "1001111111111001 1001", N: "1001110110111001 1001", O: "0110100110011001 0110", P: "1110100111101000 1000", Q: "0110100110011011 0111", R: "1110100111101010 1001", S: "0111100001100001 1110", T: "1110010001000100 0100", U: "1001100110011001 0110", V: "1001100110010110 0110", W: "1001100111111111 1001", X: "1001100101101001 1001", Y: "1001100101100100 0100", Z: "1111000100100100 1111", " ": "0000000000000000 0000", "1": "0100110001000100 1110", "2": "1110000101101000 1111", "3": "1110000101100001 1110", "4": "1001100111110001 0001", "5": "1111100011100001 1110", "6": "0111100011101001 0110", "7": "1111000100100100 0100", "8": "0110100101101001 0110", "9": "0110100101110001 1110", "0": "0110100110011001 0110", ">": "1000010000100100 1000", ".": "0000000000000000 0100", "'": "0100010000000000 0000", "-": "0000000011110000 0000", "!": "0100010001000000 0100", "?": "1110000101100000 0100" };
const glyph = ch => (F[ch] || F[" "]).replace(" ", "");
const textW = s => [...s].reduce((a, ch) => a + ("I1".includes(ch) || ch === " " ? 4 : ch === "." || ch === "'" ? 3 : 5), 0) - 1;
/* the pixels of a string as a set of "u,v", with u from the left and v from the top */
function letters(s) { const on = new Set(); let u = 0; for (const ch of s) { const g = glyph(ch), wide = "I1T".includes(ch) && ch !== "T" ? 3 : 4; for (let v = 0; v < 5; v++) for (let i = 0; i < 4; i++) if (g[v * 4 + i] === "1") on.add((u + i) + "," + v); u += ("I1".includes(ch) || ch === " " ? 4 : ch === "." || ch === "'" ? 3 : 5); } return on; }
/* engraved text on the +x face of a board in the wall: on screen, left to right is y going down */
function engrave(lines, y1, z1, gold = "ecc979", shadow = "1a0b04", lh = 8) {
    const sets = lines.map(([s, u0, v0]) => [letters(s), u0, v0]);
    return (face, p) => { if (face !== "x") return null; const u = Math.floor(y1 - p[1]), v = Math.floor(z1 - p[2]); for (const [set, u0, v0] of sets) { if (set.has((u - u0) + "," + (v - v0))) return gold; if (set.has((u - u0 - 1) + "," + (v - v0 - 1))) return shadow; } return null; };
}

/* ---- The Lost Property desk: a recess built into the wall ---- */
function lostDesk() {
    const W = 96, H = 88, D = 20, y0 = 8, y1 = W - 8, ps = [];
    /* the recess: far reveal, back wall with pigeonholes */
    ps.push(box(-D, 0, 0, y0, 0, H, PLASTER));
    const backTex = (face, p) => { if (face !== "x") return null; const v = (H - p[2]) / H; return v < .25 ? "3d2612" : v < .55 ? "341f0f" : "2a180b"; };
    ps.push(box(-D - 4, -D, 0, W, 0, H + 4, { ...M("3d2612", "2a180b", "2a180b", "120905"), tex: backTex }));
    /* pigeonholes: uprights and shelves, oak, in the back */
    const shelfZ = [38, 52, 66], cols = 5, cw = (y1 - y0) / cols;
    for (const z of shelfZ) ps.push(box(-D, -D + 9, y0, y1, z - 2, z, OAK));
    ps.push(box(-D, -D + 9, y0, y1, H - 4, H, OAK));
    for (let i = 0; i <= cols; i++) { const y = y0 + i * cw; ps.push(box(-D, -D + 9, y - 1, y + 1, 32, H, OAK)); }
    /* a small lamp over the pigeonholes, in brass */
    /* the counter, built in right across */
    const pY = 16, panel = (face, p) => { if (face !== "x") return null; const u = ((p[1] - y0) % pY + pY) % pY, z = p[2]; if (z < 4 || z > 25) return null; if (u < 2 || u > pY - 2) return null; if (u < 3 || z < 5 || z > 24) return "33200f"; if (u > pY - 3) return "6a4526"; return "553620"; };
    ps.push(box(-8, 6, y0, y1, 0, 28, { ...OAK, tex: panel }));
    ps.push(box(-10, 8, y0 - 1, y1 + 1, 28, 31, M("d09a5e", "8a5c30", "6a4526", "1c0f06")));
    ps.push(box(5.5, 6.5, y0, y1, 26, 27, GOLD));
    ps.push(box(6, 7, y0, y1, 1, 3, OAKDK));
    /* the surround, proud of the wall */
    ps.push(box(0, 3, 1, y0, 0, H + 4, OAK)); ps.push(box(0, 3, y1, W - 1, 0, H + 4, OAK));
    ps.push(box(3, 4, 3, 5, 3, H + 2, GOLD)); ps.push(box(3, 4, W - 5, W - 3, 3, H + 2, GOLD));
    ps.push(box(0, 2, y0, y1, H, H + 4, OAK));
    /* cornice, and the sign in the same dress as the door signs */
    ps.push(box(0, 5, 0, W, H + 4, H + 7, M("c08d58", "6e4524", "4c2e18", "160b05")));
    const signW = 66, sy1 = W / 2 + signW / 2, sy0 = sy1 - signW, signZ1 = H + 26, t = "LOST PROPERTY", u0 = Math.round((signW - textW(t)) / 2);
    ps.push(box(0, 3, sy0, sy1, H + 7, signZ1, { ...M("3b1c0c", "2c1408", "3b1c0c", "b8913f"), edge: col("b8913f"), tex: engrave([[t, u0, 6]], sy1, signZ1) }));
    /* on the counter: a brass bell, the ledger, a little card */
    const bellY = 28, led = 62;
    ps.push(cyl(0, bellY, 5, 31, 33, BRASS)); ps.push(ball(0, bellY, 36, 4.2, BRASS)); ps.push(cyl(0, bellY, 1, 39, 42, BRASS)); ps.push(ball(0, bellY, 42.5, 1.2, BRASS));
    const page = M("f4ecd2", "cfc2a0", "b8a886", "3c2c18", { tex(face, p) { if (face !== "top") return null; const u = Math.floor(p[1]) % 2, v = Math.floor(p[0] + 100) % 3; return v === 0 && u === 0 ? "8c8064" : null; } });
    ps.push(box(-7, 5, led - 10, led - .5, 31, 33, page)); ps.push(box(-7, 5, led + .5, led + 10, 31, 33, page)); ps.push(box(-7, 5, led - .5, led + .5, 31, 32.5, M("7a1b16", "5a100c", "400a08", "200504")));
    ps.push(box(-8, 6, led - 11, led + 11, 31, 31.5, M("7a1b16", "5a100c", "400a08", "200504")));
    return { sprite: render(ps, { wall: { at: 0, inside: (y, z) => y > y0 && y < y1 && z >= 0 && z < H } }), W, cubbies: { cols, cw, y0, shelfZ, D } };
}

/* ---- A sprite anchored at its model origin: screen = origin + (x - y, (x + y) / 2 - z) ---- */
const spot = (S, x, y, z) => [S.ox + x - y, S.oy + (x + y) / 2 - z];

module.exports = { lostDesk, spot, letters, textW, engrave, OAK, OAKDK, OAKLT, GOLD, BRASS, PLASTER, F };

"use strict";
const fs = require("fs"), vm = require("vm"), R = require("path").resolve(__dirname, "../../..").replace(/\\/g, "/") + "/";
const iso = require("./iso3d.js"), { box, cyl, ball, M, render, col } = iso, I = require("./old-items.js"), { letters, textW, engrave, OAK, OAKDK, OAKLT, GOLD, BRASS, PLASTER } = I, L = require("./lib.js");

/* ---- round pipes lying along y or x ---- */
const hit0 = null;
function pipeY(x, z, r, y0, y1, mat) { const ps = []; const n = 4; for (let i = 0; i < 1; i++) ps.push(box(x - r, x + r, y0, y1, z - r, z + r, { top: mat[0], y: mat[1], x: mat[2], edge: col(mat[3]) })); return ps; }
const tubeY = (x, z, y0, y1, c) => [
    box(x - 2, x + 2, y0, y1, z - 2, z + 2, { top: col(c[1]), x: col(c[2]), y: col(c[1]), edge: col(c[3]), tex(face, p) { if (face === "x") { const v = p[2] - (z - 2); return v > 3 ? c[0] : v > 1.8 ? c[1] : v > .8 ? c[2] : c[3]; } if (face === "top") { const u = p[0] - (x - 2); return u > 2.8 ? c[0] : c[1]; } return null; } })
];
const STEEL = ["c9d0d6", "8f98a1", "5e666e", "24282c"], COPPER = ["e8a56a", "b5713c", "7f4a24", "2a1608"], IRON = ["7e7a72", "5a564f", "3e3b36", "16140f"];

/* ---- a bookcase, in the client's colours, swinging on its right-hand edge ---- */
function bookcaseFrame(k, pull = 0) {
    const W = 32, H = 62, D = 10, a = k * Math.PI / 2 * .92, rot = { rot: -a, px: 0, py: 0 }, ps = [];
    const FR = { top: col("d07a3e"), x: col("a1552a"), y: col("c26a34"), nx: col("7c3f1d"), ny: col("8a4a22"), edge: col("220d04") };
    const BK = { top: col("6e3517"), x: col("5a2a11"), y: col("6e3517"), nx: col("5a2a11"), ny: col("5a2a11"), edge: col("220d04"), tex(face, p) { if (face === "nx" || face === "y" || face === "ny") return Math.floor(p[1] + 40) % 8 === 0 ? "3d1c0a" : Math.floor(p[1] + 40) % 8 < 3 ? "6a3416" : "5a2a11"; return null; } };
    /* the case: back, sides, top, base, three shelves */
    ps.push(box(-1, 1, 0, W, 0, H, BK, rot));
    ps.push(box(0, D, 0, 2, 0, H, FR, rot), box(0, D, W - 2, W, 0, H, FR, rot), box(0, D + 1, 0, W, H - 3, H, FR, rot), box(0, D + 1, 0, W, 0, 4, FR, rot));
    const shelves = [18, 32, 46]; for (const z of shelves) ps.push(box(0, D, 2, W - 2, z - 1.5, z, FR, rot));
    /* books: their spines face the room */
    const cols = ["3a6ea5", "a03128", "2f7d4a", "c9a23f", "6a3f8f", "28557e", "8f3b2e", "3f6f3a", "c47a2c"];
    let n = 0; for (const z of [4, 18, 32, 46]) { let y = 3.5; while (y < W - 5) { const w = 2 + (n * 5) % 2, h = 9 + (n * 7) % 4, c = cols[n % cols.length], blue = z === 32 && Math.abs(y - 15) < 1.6, pl = blue ? pull : 0, cc = blue ? "2fa8e8" : c; const rgb = iso.col(cc), dk = rgb.map(v => v * .68), lt = rgb.map(v => Math.min(255, v * 1.15)); ps.push(box(1, D - 2 + pl, y, y + w, z, z + h, { top: lt, x: rgb, y: lt, nx: dk, ny: dk, edge: col("160904") }, rot)); y += w + .4; n++; } }
    /* the way through: a low dark passage in the wall, lit from the far end */
    const pass = (face, p) => { const d = -p[0] / 34; if (face === "top") return null; const g = Math.max(0, Math.min(1, (p[2] - 8) / 40)) * .55 + .25; const v = c => Math.round(c); return [v(70 + g * 170), v(36 + g * 100), v(16 + g * 34)]; };
    ps.push(box(-36, -30, -2, W + 2, 0, H + 3, { top: col("3a2010"), x: pass, y: pass, edge: null, noLine: true }));
    ps.push(box(-36, 0, -4, 0, 0, H + 3, { top: col("2a170a"), y: col("3b2312"), x: col("20110a"), edge: null }));
    ps.push(box(-36, 0, 0, W, -3, 0, { top: col("4a3a2a"), y: col("2a2015"), x: col("2a2015"), edge: null, tex(face, p) { if (face === "top") return Math.floor(p[0] + 400) % 8 === 0 ? "332818" : Math.floor(p[1] + 400) % 12 === 0 ? "332818" : "5c4a34"; return null; } }));
    return render(ps, { wall: { at: 0, inside: (y, z) => y > 0 && y < W && z < H + 3 && z >= 0 } });
}

/* ---- full-height windows ---- */
function fullWindow(W, H = 150, ax = "x") {
    /* along the wall: y in x-walls, x in y-walls. Built for an x-wall then swapped if need be. */
    const swap = (b) => ax === "x" ? b : b.map(p => ({ ...p, x0: p.y0, x1: p.y1, y0: p.x0, y1: p.x1, mat: { ...p.mat, x: p.mat.y, y: p.mat.x, ny: p.mat.nx, nx: p.mat.ny } }));
    const F = M("7a5230", "5c3a20", "402612", "120905"), G2 = M("e8c77a", "b98a3e", "86601f", "2c1c06");
    const ps = [], bars = Math.max(1, Math.round(W / 26));
    /* far reveal (depth of the wall) and threshold */
    ps.push(box(-10, 0, -3, 0, 0, H, F));
    ps.push(box(-10, 4, 0, W, -1, 2, M("8f6238", "5c3a20", "402612", "120905")));
    /* outer frame, proud of the wall */
    ps.push(box(0, 3, -3, 1, 0, H + 3, F), box(0, 3, W - 1, W + 3, 0, H + 3, F), box(0, 4, -4, W + 4, H, H + 4, M("a87446", "6e4524", "4c2e18", "160b05")));
    /* gold bead just inside */
    ps.push(box(-3, -1, 1, 2, 2, H, G2), box(-3, -1, W - 2, W - 1, 2, H, G2), box(-3, -1, 1, W - 1, H - 2, H, G2), box(-3, -1, 1, W - 1, 2, 4, G2));
    /* glazing bars: thin uprights, and rails at the heights the panes change */
    for (let i = 1; i <= bars; i++) { const y = W * i / (bars + 1); ps.push(box(-5, -3, y - 1, y + 1, 2, H, F)); }
    for (const z of [38, 92, H - 22]) ps.push(box(-5, -3, 1, W - 1, z - 1, z + 1, F));
    const sprite = render(swap(ps), ax === "x" ? { wall: { at: 0, inside: (y, z) => y > 0 && y < W && z >= 0 && z < H } } : { wallY: { at: 0, inside: (x, z) => x > 0 && x < W && z >= 0 && z < H } });
    return sprite;
}

/* ---- things on the wall ---- */
const wallBoard = (W, H, z0, frame, face, tex) => { const y1 = W; return [box(0, 2, 0, W, z0, z0 + H, frame), box(0, 3, 2, W - 2, z0 + 2, z0 + H - 2, { ...face, tex }, {})]; };
const board = (W, H, z0, lines, opts = {}) => {
    const y1 = W - 2, zt = z0 + H - 2, gold = opts.ink || "2a170a", base = opts.face || "efe5c6";
    const fr = opts.frame || M("d9a94e", "b98a3e", "86601f", "2c1c06"), f = iso.col(base), fd = f.map(v => v * .8);
    const tex = (face, p) => { if (face !== "x") return null; const u = Math.floor(y1 - p[1]), v = Math.floor(zt - p[2]); for (const [s, u0, v0, c] of lines) if (letters(s).has((u - u0) + "," + (v - v0))) return c || gold; return opts.tex ? opts.tex(u, v) : null; };
    return render([box(0, 2, 0, W, z0, z0 + H, fr), box(0, 3, 2, W - 2, z0 + 2, z0 + H - 2, { top: f, y: fd, x: f, edge: null, noLine: true, tex })]);
};
const centred = (s, W) => Math.round((W - 4 - textW(s)) / 2);

function oldHotel() {
    const out = {};
    out.bobba = board(58, 34, 74, [["BOBBA", centred("BOBBA", 58), 6, "7a1b16"], ["EST 2001", centred("EST 2001", 58), 16, "6e5a33"]]);
    out.theatre = board(70, 26, 76, [["THEATREDROME", centred("THEATREDROME", 70), 4, "ffffff"], [">> 2 FLOORS", centred(">> 2 FLOORS", 70), 13, "ffd86a"]], { face: "2a3d6a" });
    out.bar = board(74, 26, 76, [["THE DIRTY DUCK", centred("THE DIRTY DUCK", 74), 4, "ffc25e"], ["CLOSED 2005", centred("CLOSED 2005", 74), 13, "a7753a"]], { face: "1a0c06", frame: M("6e4524", "4c2e18", "33200f", "120905") });
    out.back5 = board(52, 22, 80, [["BACK IN 5", centred("BACK IN 5", 52), 3, "7a1b16"], ["SINCE 2003", centred("SINCE 2003", 52), 11, "6e5a33"]], { frame: M("6e4524", "4c2e18", "33200f", "120905") });
    out.poster = board(34, 52, 58, [["BEWARE", centred("BEWARE", 34), 4, "7a1b16"], ["TRADE", centred("TRADE", 34), 32, "191919"], ["CHECK", centred("CHECK", 34), 40, "191919"]], { face: "e9d27b", tex(u, v) { const a = u - 11, b = v - 13; if (a >= 0 && a < 8 && b >= 0 && b < 12) { if (b === 3 && (a === 2 || a === 5)) return "ffffff"; if (b === 8 && a > 1 && a < 6) return "ffffff"; return "191919"; } return null; } });
    out.map = board(62, 44, 66, [["HOTEL PLAN", centred("HOTEL PLAN", 62), 3, "3a2110"]], { face: "d9c9a0", tex(u, v) { const a = u - 5, b = v - 11; if (a < 0 || b < 0 || a >= 48 || b >= 26) return null; const cx = a % 16, cy = b % 13, room = Math.floor(a / 16) + Math.floor(b / 13) * 3; if (cx === 15 || cy === 12) return null; if ((room === 1 || room === 3) && (cx === cy || cx === 13 - cy * 13 / 12 | 0)) return "a01d16"; return room === 1 || room === 3 ? "b9a678" : "9f8e62"; } });
    /* the bricked-up door with its sign */
    { const H = 78, W = 36, bricks = (face, p) => { if (face !== "x") return null; const row = Math.floor(p[2] / 5), off = row % 2 ? 4 : 0, j = p[2] % 5 < 1 || (Math.floor(p[1] + off) % 8) < 1; return j ? "3c332a" : ((Math.floor((p[1] + off) / 8) * 5 + row * 3) % 4 ? "7a3f2c" : "6a3526"); };
      const sign = (face, p) => { if (face !== "x") return null; const u = Math.floor(W - 5 - p[1]), v = Math.floor(58 - p[2]); for (const [s, u0, v0] of [["FREE", 3, 2], ["CREDS", 0, 10]]) { if (letters(s).has((u - u0 + 0) + "," + (v - v0))) return "a01d16"; } return null; };
      out.freeDoor = render([box(-1, 1, 3, W - 3, 0, H - 3, { top: col("7a3f2c"), y: col("6a3526"), x: col("7a3f2c"), edge: null, tex: bricks }), box(0, 3, 0, 3, 0, H, OAK), box(0, 3, W - 3, W, 0, H, OAK), box(0, 3, 0, W, H - 3, H, OAK), box(1, 3, 4, W - 4, 38, 60, { top: col("e8dcbc"), y: col("c9bd9c"), x: col("e8dcbc"), edge: col("2a170a"), tex: sign })]); }
    /* the bot's cupboard: a steel door */
    { const H = 72, W = 26, tex = (face, p) => { if (face !== "x") return null; const u = Math.floor(W - 3 - p[1]), v = Math.floor(H - 8 - p[2]); for (const [s, u0, v0] of [["BOT", 4, 3], ["ONLY", 1, 11]]) if (letters(s).has((u - u0) + "," + (v - v0))) return "ffd86a"; if (Math.floor(p[2]) === 30 || Math.floor(p[2]) === 8) return "5a6878"; return null; };
      out.botDoor = render([box(0, 2, 0, W, 0, H, M("9aa6b2", "6c7988", "6c7988", "20262c", { tex })), box(0, 3.5, 3, 5, 32, 38, GOLD)]); }
    /* a rare in a glass case on a plinth */
    { const pl = render([box(0, 22, 0, 22, 0, 14, M("a87446", "6e4524", "4c2e18", "160b05")), box(-1, 23, -1, 23, 14, 16, M("e8c77a", "b98a3e", "86601f", "2c1c06"))]);
      const glass = render([box(1, 21, 1, 21, 16, 52, M("cfeaff", "b4dcf4", "90c4e4", "eaf6ff")), box(1, 21, 1, 21, 52, 53, GOLD)]);
      out.caseBase = pl; out.caseGlass = glass; }
    /* a trophy cabinet */
    { const fr = { top: col("a87446"), y: col("6e4524"), x: col("4c2e18"), edge: col("160b05") }; const ps = [box(-1, 0, 0, 34, 0, 62, M("2a180b", "2a180b", "2a180b", "120905")), box(0, 12, 0, 2, 0, 62, fr), box(0, 12, 32, 34, 0, 62, fr), box(0, 13, 0, 34, 60, 63, fr), box(0, 13, 0, 34, 0, 6, fr), box(0, 11, 2, 32, 32, 34, M("c08d58", "90623a", "6a4526", "1c0f06"))]; out.cabinet = render(ps); }
    /* the guest book, on a lectern */
    { const pg = { top: col("f4ecd2"), y: col("cfc2a0"), x: col("b8a886"), edge: col("3c2c18"), tex(face, p) { if (face !== "top") return null; const u = Math.floor(p[0]) % 3, s = Math.floor(p[1]); return u === 0 && (s + Math.floor(p[0] / 3) * 3) % 7 < 5 ? "3a3a70" : null; } };
      out.lectern = render([box(5, 13, 5, 13, 0, 30, OAK), box(1, 17, 1, 17, 0, 3, OAK), box(0, 18, 0, 22, 30, 33, M("c08d58", "90623a", "6a4526", "1c0f06")), box(2, 16, 1.5, 10.5, 33, 35, pg), box(2, 16, 11.5, 20.5, 33, 35, pg), box(2, 16, 10.5, 11.5, 33, 34, M("7a1b16", "5a100c", "400a08", "200504"))]); }
    return out;
}

/* ---- Honours board, plaque ---- */
function honours(title = "ROLL OF WINNERS", names = null) {
    const W = 92, H = 84, z0 = 50, y1 = W - 3, zt = z0 + H - 3;
    const lines = [[title, 0, 5], ["2026", 0, 15]].map(([s, a, v]) => [s, Math.round((W - 6 - textW(s)) / 2), v, "ecc979"]);
    names = names || [["WINTER RACE", "SAMPLENAME"], ["ELEMENT DASH", "RAT FAN"], ["THE LONG WALK", "MAZERUNNER"], ["HALLOWEEN", "DUCKLOVER"], ["SPRING KEYS", "BOBBA04"]];
    names.forEach((n, i) => { if (i < 3) { lines.push([n[1], Math.round((W - 6 - textW(n[1])) / 2), 26 + i * 17 + 7, "ffe6a0"]); lines.push([n[0], Math.round((W - 6 - textW(n[0])) / 2), 26 + i * 17, "b08a48"]); } });
    const tex = (face, p) => { if (face !== "x") return null; const u = Math.floor(y1 - p[1]), v = Math.floor(zt - p[2]); for (const [s, u0, v0, c] of lines) if (letters(s).has((u - u0) + "," + (v - v0))) return c; if (v === 22) return "b08a48"; return null; };
    return render([box(0, 2, 0, W, z0, z0 + H, OAK), box(0, 3, 3, W - 3, z0 + 3, z0 + H - 3, { top: col("2c1408"), y: col("2c1408"), x: col("3b1c0c"), edge: null, noLine: true, tex }), box(0, 5, -1, W + 1, z0 + H, z0 + H + 3, M("c08d58", "6e4524", "4c2e18", "160b05"))]);
}
function plaque(name) {
    const W = 54, H = 20, z0 = 60, y1 = W - 2, zt = z0 + H - 2, l1 = ["WINNER", Math.round((W - 4 - textW("WINNER")) / 2), 2], l2 = [name, Math.round((W - 4 - textW(name)) / 2), 9];
    const tex = (face, p) => { if (face !== "x") return null; const u = Math.floor(y1 - p[1]), v = Math.floor(zt - p[2]); for (const [s, u0, v0] of [l1, l2]) if (letters(s).has((u - u0) + "," + (v - v0))) return "2c1a08"; return null; };
    const face = { top: col("f4dc98"), y: col("b98a3e"), x: col("d6ad56"), edge: col("2c1c06"), tex };
    const sc = []; for (const [y, z] of [[3, z0 + 3], [W - 3, z0 + 3], [3, z0 + H - 3], [W - 3, z0 + H - 3]]) sc.push(box(1, 2.2, y - 1, y + 1, z - 1, z + 1, M("fff2c0", "8a6420", "8a6420", "4a3208")));
    return render([box(0, 1, 0, W, z0, z0 + H, face), ...sc]);
}

/* ---- The rat: the real model, baked at hallway scale ---- */
function bakeRat(S = .72) {
    const win = {}, ctx = { window: win, Math, console, Uint8ClampedArray, Array, Object }; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync("C:/Users/cjboy/Pictures/Screenshots/Habbo/Maze Rats Rat's-Eye View/rat-model/rat.js", "utf8"), ctx);
    const Rat = win.Rat, pack = (pose, yaw) => { const r = Rat.render({ S, yaw, pose }), px = Rat.paint(r, {}); return { w: px.W, h: px.H, ox: Math.round(px.W / 2), oy: Math.round(px.H * .6), rgba: px.data }; };
    const yaws = { x: 0, y: Math.PI / 2, nx: Math.PI, ny: -Math.PI / 2 }, out = {};
    for (const [k, yaw] of Object.entries(yaws)) { out[k] = []; for (let f = 0; f < 8; f++) out[k].push(pack({ walk: true, phase: f * Math.PI / 4 }, yaw)); out[k + "Sniff"] = [pack({ tail: .3 }, yaw), pack({ sniff: 1, tail: .3 }, yaw), pack({ rear: .5, tail: .3 }, yaw), pack({ rear: 1, sniff: 1, tail: .3 }, yaw)]; }
    return out;
}
/* a mouse hole cut into the skirting, its foot exactly on the floor */
function ratHole(ax = "x") {
    const W = 15, H = 12, ins = (a, z) => { if (z < 0) return false; const c = (a - W / 2) / (W / 2), v = z / H; return c * c + v * v < 1; };
    const dark = { top: col("0a0604"), x: col("080503"), y: col("120a05"), edge: null, noLine: true };
    const ps = ax === "x" ? [box(-14, -12, -2, W + 2, -1, H + 2, dark), box(-14, 0, -3, 0, -1, H + 2, { ...dark, y: col("2a170a") }), box(-14, 2, 0, W, -2, 0, { top: col("1a0e06"), y: col("120a05"), x: col("120a05"), edge: null, noLine: true })] : [box(-2, W + 2, -14, -12, -1, H + 2, dark), box(-3, 0, -14, 0, -1, H + 2, { ...dark, x: col("2a170a") }), box(0, W, -14, 2, -2, 0, { top: col("1a0e06"), y: col("120a05"), x: col("120a05"), edge: null, noLine: true })];
    return render(ps, ax === "x" ? { wall: { at: 0, inside: ins } } : { wallY: { at: 0, inside: ins } });
}

module.exports = { bookcaseFrame, fullWindow, oldHotel, honours, plaque, bakeRat, ratHole, tubeY, STEEL, COPPER, IRON, board, centred };

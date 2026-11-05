/* One-off: turns the plan the mock-ups were drawn from into the editor's starting map.json.
   Only ever needed once; running it again overwrites map.json, so it refuses if one exists
   unless given --force.
       node tools/hallway-editor/export-starter.js [--force] */
"use strict";
const fs = require("fs");
const path = require("path");
const W = require("./render/hw3.js");
const OUT = path.join(__dirname, "map.json");
if (fs.existsSync(OUT) && !process.argv.includes("--force")) { console.error("map.json already exists; use --force to replace it."); process.exit(1); }

const seq = W.plan();
const ids = { G: 0, F1: 1, F2: 2, F3: 3 };
const levels = [];
for (const id of Object.keys(ids)) {
    const lv = seq.find(l => l.id === id);
    const cells = new Set();
    const add = (x0, x1, y0, y1) => { for (let x = x0; x < x1; x += 2) for (let y = y0; y < y1; y += 2) cells.add((x / 2) + "," + (y / 2)); };
    const doors = [], lamps = [], props = [], teles = [], medals = [];
    for (const P of lv.patches) {
        if (P.notch) continue;
        add(P.x0, P.x1, P.y0, P.y1);
        for (const [axis, at] of (P.d || [])) doors.push({ axis, at, line: axis === "x" ? P.y0 : P.x0 });
        for (const [axis, at] of (P.l || [])) lamps.push({ axis, at, line: axis === "x" ? P.y0 : P.x0 });
        for (const p of (P.props || [])) props.push({ k: p[0], x: p[1], y: p[2] });
        if (P.tele) teles.push({ x: P.tele[0], y: P.tele[1] });
        if (P.medal) medals.push({ x: P.medal[0], y: P.medal[1] });
    }
    for (const r of (lv.holes || [])) add(r.x0, r.x1, r.y0, r.y1);
    const uniq = (list, key) => { const s = new Set(); return list.filter(o => { const k = key(o); if (s.has(k)) return false; s.add(k); return true; }); };
    levels.push({
        id, k: ids[id], name: lv.name, way: lv.way, cells: [...cells],
        rugs: lv.rugs || [], medals: uniq(medals, m => m.x + "," + m.y),
        doors: uniq(doors, d => d.axis + d.at + "," + d.line), lamps: uniq(lamps, d => d.axis + d.at + "," + d.line),
        props: uniq(props, p => p.k + p.x + "," + p.y), teles: uniq(teles, t => t.x + "," + t.y)
    });
}
const map = {
    version: 1,
    light: "sconces",
    rect: { x: -340, y: -274, w: 2960, h: 1548 },
    lift: { level: "G", x: 2, y: 0 },
    levels,
    stairs: [
        { kind: "straight", low: "G", up: "F1", a: 14, b: 20, y: 0, signX: 11 },
        { kind: "turn", low: "G", up: "F1", a: 58, b: 64, y: 0 },
        { kind: "side", low: "G", up: "F1", a: -6, b: 0, x: 92 },
        { kind: "straight", low: "G", up: "F1", a: 150, b: 156, y: 2 },
        { kind: "straight", low: "F1", up: "F2", a: 76, b: 82, y: -10, signX: 72.5 },
        { kind: "straight", low: "F1", up: "F2", a: 120, b: 126, y: -10, signX: 131 },
        { kind: "turn", low: "F2", up: "F3", a: 104, b: 110, y: -26 }
    ]
};
fs.writeFileSync(OUT, JSON.stringify(map));
console.log("wrote", OUT, levels.map(l => `${l.id}: ${l.cells.length} cells, ${l.doors.length} doors`).join("; "));

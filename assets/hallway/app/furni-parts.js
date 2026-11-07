/* What each piece of hallway furniture is made of, shared by the drawing (render/hw3.js) and the
   editor (ghosts, selecting, walking), so the two can't disagree.

   A placed piece is { k, x, y, len?, rot? }.
   len: how many tiles long a sofa, table or planter is. The client cuts these into an end, repeatable
        middles and another end, so they can be any length.
   rot: quarter turns. The client only draws each piece from one or two sides and mirrors it for the
        others, as the game does, so most pieces have two ways round and chairs have four. */
"use strict";
(function (root) {
    const ROWS = {
        sofa: {
            def: 2, min: 2, flip: true,
            part: (i, n) => i === 0 ? ["hw_sofa1_a_0_2_0"] : i === n - 1 ? ["hw_sofa3_a_0_2_0", "hw_sofa3_b_0_2_0"] : ["hw_sofa2_a_0_2_0"]
        },
        table: {
            def: 3, min: 2, flip: false,
            part: (i, n) => i === 0 ? ["hw_table1_a_0_0_0"] : i === n - 1 ? ["hw_table3_a_0_0_0"] : ["hw_table2_a_0_0_0"]
        },
        ero: {
            def: 2, min: 2, flip: false,
            part: (i, n) => i === 0 ? ["hw_ero1_a_0_0_0"] : i === n - 1 ? ["hw_ero5_a_0_0_0"] : ["hw_ero" + (2 + (i - 1) % 3) + "_a_0_0_0"]
        }
    };
    /* the same planter in other materials: see make-planters.js */
    for (const v of ["stone", "walnut", "evergreen", "flower"]) ROWS["ero_" + v] = { def: 2, min: 2, flip: false, part: (i, n) => ["hwv_" + v + (i === 0 ? 1 : i === n - 1 ? 5 : 2 + (i - 1) % 3) + "_a_0_0_0"] };
    /* drawn by render/rope-barrier.js, not from the client's sprites */
    ROWS.rope = { def: 3, min: 2, flip: false, part: () => [] };
    /* one piece of art lying across three tiles: it doesn't stretch */
    ROWS.trophy = { def: 3, min: 3, max: 3, flip: false, part: () => [] };
    const SINGLES = {
        plant: ["hw_plant_a_0_0_0"], statue: ["hw_statue_a_0_0_0"], fountain: ["hw_fountain_a_0_0_0"],
        rarecase: [], xmastree: [], gift1: [], gift2: [], gift3: [], gift4: [], mark_scuff: [], mark_tile: [], shelf: ["hw_shelf_a_0_4_0"], cabinet: ["hw_closet1_a_0_2_0"], water: ["hw_watermatic_a_0_4_0"],
        pillar: ["pillar1_a_0_0_0"], pillartall: ["pillar1_a_0_0_0"], smtable: ["hw_smtble_a_0_0_0"], ballpost: ["pillar0_a_0_0_0"]
    };
    const FLIPPED = { cabinet: true };
    const CHAIR = [[2, false], [2, true], [0, true], [0, false]];          // clockwise: the client's side, and its mirror

    const turns = k => k === "chair" ? 4 : (k === "rarecase" || k === "mark_scuff" || k === "mark_tile" || k === "lamp" || k === "pillar" || k === "pillartall" || k === "smtable" || k === "ballpost") ? 1 : 2;
    const rotOf = p => { const t = turns(p.k); return (((p.rot || 0) % t) + t) % t; };
    const lengthOf = p => { const r = ROWS[p.k]; return r ? (r.max ? r.max : Math.max(r.min, p.len || r.def)) : 1; };

    /* the sprites, tile by tile, in drawing order. Mirroring a row about its first tile turns a run
       along x into a run along y, so the pieces still meet. */
    function parts(p) {
        const r = ROWS[p.k], rot = rotOf(p);
        if (r) {
            const n = lengthOf(p), out = [];
            for (let i = 0; i < n; i++) out.push({ names: r.part(i, n), x: rot ? p.x : p.x + i, y: rot ? p.y + i : p.y, flip: rot ? !r.flip : r.flip });
            return out;
        }
        if (p.k === "chair") {
            const [d, flip] = CHAIR[rot];
            return [{ names: ["hw_chair_a_0_" + d + "_0", "hw_chair_b_0_" + d + "_0"], x: p.x, y: p.y, flip }];
        }
        const s = SINGLES[p.k]; if (!s) return [];
        return [{ names: s, x: p.x, y: p.y, flip: rot ? !FLIPPED[p.k] : !!FLIPPED[p.k] }];
    }
    /* the tiles it stands on */
    function tiles(p) {
        if (ROWS[p.k]) return parts(p).map(q => [q.x, q.y]);
        if (p.k === "fountain" || p.k === "statue") return [[p.x, p.y], [p.x + 1, p.y], [p.x, p.y + 1], [p.x + 1, p.y + 1]];
        return [[p.x, p.y]];
    }
    /* A maze's name for its door: the archive's with its glyphs and decoration off ("*ÕMaze EmpireÕ*" is Maze Empire's door), as render/hw.js's clean() has it */
    const mazeName = n => String(n || "").replace(/[^\x20-\x7e]/g, "").replace(/\*/g, "").replace(/\[|\]/g, "").trim().replace(/\s+/g, " ");
    const api = { ROWS, parts, tiles, turns, rotOf, lengthOf, mazeName };
    /* the squares of the picture a floor below ground can be seen in, so the failing lights only draw those */
    api.basementTiles = (map, size = 512) => { const out = new Set(); for (const l of map.levels) { if (l.k >= 0) continue; const z = l.k * 163; for (const c of l.cells || []) { const [cx, cy] = c.split(",").map(Number), x = (cx - cy) * 32, y = (cx + cy) * 16 - z; for (let ty = Math.floor((y - 200) / size); ty <= Math.floor((y + 40) / size); ty++) for (let tx = Math.floor((x - 40) / size); tx <= Math.floor((x + 40) / size); tx++) out.add(tx + "," + ty); } } return out; };
    if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FurniParts = api;
})(typeof window !== "undefined" ? window : globalThis);

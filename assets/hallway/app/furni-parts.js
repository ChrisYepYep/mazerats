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
    const SINGLES = {
        plant: ["hw_plant_a_0_0_0"], statue: ["hw_statue_a_0_0_0"], fountain: ["hw_fountain_a_0_0_0"],
        shelf: ["hw_shelf_a_0_4_0"], cabinet: ["hw_closet1_a_0_2_0"], water: ["hw_watermatic_a_0_4_0"],
        pillar: ["pillar1_a_0_0_0"], pillartall: ["pillar1_a_0_0_0"], smtable: ["hw_smtble_a_0_0_0"], ballpost: ["pillar0_a_0_0_0"]
    };
    const FLIPPED = { cabinet: true };
    const CHAIR = [[2, false], [2, true], [0, true], [0, false]];          // clockwise: the client's side, and its mirror

    const turns = k => k === "chair" ? 4 : (k === "lamp" || k === "pillar" || k === "pillartall" || k === "smtable" || k === "ballpost") ? 1 : 2;
    const rotOf = p => { const t = turns(p.k); return (((p.rot || 0) % t) + t) % t; };
    const lengthOf = p => { const r = ROWS[p.k]; return r ? Math.max(r.min, p.len || r.def) : 1; };

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
    const api = { ROWS, parts, tiles, turns, rotOf, lengthOf };
    if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FurniParts = api;
})(typeof window !== "undefined" ? window : globalThis);

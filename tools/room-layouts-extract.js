/* Pull the room LAYOUTS out of the Origins client and write them as
   js/room-layouts.js for the game and the level editor to use.

   ----------------------------------------------------------------------
   WHERE THEY LIVE

   hh_room_private.cct carries nineteen of them as type-3 (field) members
   named model_a.room .. model_s.room. Each is a small document:

       <room>
         <name>    "model_a"
         <date>    3.6.2008 / 16:32
         <version> 1.1
         <elements>   one bracketed property list per drawn piece
         <rect>       the stage rectangle
         <border>
         <roomdata>   [#offsetx, #offsety, #factorx, #factory, #factorh]
       </room>

   hh_kiosk_room.cct holds the matching picker thumbnails as bitmaps named
   rm_model_<letter>_layout — eighteen of them, a..r. model_s has a definition
   and no thumbnail, which is worth knowing before hunting for a missing file.

   ----------------------------------------------------------------------
   THERE IS NO HEIGHTMAP. The floor is a list of STAMPS.

   Habbo's server sends a room's heightmap at runtime; the client only ever
   ships the artwork, so a model says where floor pieces are DRAWN rather than
   which tiles exist. The grid has to be reconstructed from those positions:

       flat_floor_<h>_a_0_0_0    130x71  reg  0,0   full scale, 64x32 tiles
       flat_sfloor_<h>_a_0_0_0    64x37  reg -1,0   HALF scale, 32x16 tiles
       flat_stair_<h>_…          130x103             a step up, full scale
       flat_sstair_<h>_…          66x53              a step up, half scale

   Every one covers a 2x2 BLOCK of tiles — 128 wide is two tiles across, 64
   tall is two down, and the spare 2 and 7 pixels are the black outline and the
   slab's own visible thickness. The digit after the name is the floor HEIGHT
   there, which is how the split-level models are built.

   <roomdata> gives the isometric origin and the tile size, so with the stamp's
   own registration point the arithmetic inverts:

       dx = (centreX - offsetx) / (factorx / 2)   =  tileX - tileY
       dy = (topY    - offsety) / (factory / 2)   =  tileX + tileY

   ----------------------------------------------------------------------
   THE OFFSET IN THE HEADER IS NOT EXACT, and trusting it loses four models.

   model_a lands on whole tiles. model_d is nudged 31px across, model_e 1px
   across and 2px down, model_h 2px across — the artists moved the room on the
   stage and nobody updated <roomdata> to match. Every stamp within a model
   shares the same nudge, so it is MEASURED from the stamps rather than taken
   from the header: read the fractional part they all have in common and
   subtract it. Without that, d, e, g and h decode to nothing at all.

   ----------------------------------------------------------------------
   WHAT IS EXPORTED, AND WHAT IS NOT

   Only the models this game can actually draw: FULL SCALE and FLAT.

     a c d e s   plain rectangles, 5x7 up to 8x13
     b f         rectangles with a corner taken out

   Left out, deliberately:

     g h         full scale but genuinely split-level — they have flat_stair
                 blocks, and this game has no floor height at all (`lift` only
                 stacks furni). They would draw flat and wrong.
     i .. r      16x26 up to 28x28, and drawn by the client at HALF SCALE
                 because they do not fit the stage otherwise. Supporting them
                 means a second render scale throughout, including the small
                 furni and avatar art (hh_furni_small.cct, hh_people_small_1),
                 which is its own piece of work rather than a layout.

   THE DOOR comes from the model too. Each has one `leftdoor_open` element, and
   the tile it stands against is found by putting its right edge back on the
   isometric grid — the left wall runs along increasing y at the lowest x, so

       k      = (doorRightEdge - offsetx) / (factorx / 2)
       tileY  = minX - k

   For model_a that returns tile 4, which is exactly the DOOR_AT the renderer
   already had from measuring the artwork by hand. Two independent routes to
   the same number is the check that the whole decode is right.

   usage: node tools/room-layouts-extract.js [hh_room_private.cct] [out.js]
*/

const fs = require("fs");
const path = require("path");
const { openCast, readMember, listCast } = require("./cct-extract.js");

const DEFAULT_CCT = "C:/Users/cjboy/AppData/Roaming/Habbo Launcher/downloads/shockwave/350/hh_room_private.cct";

/* The models this game ships, in the order the editor offers them, with the
   names players see. Habbo never named them past the letter; these describe
   the shape, because "Long" tells a builder something and "model_d" does not.
   The letter stays the id, so a level saved today still matches the client. */
const SHIP = [
    { id: "a", name: "Classic" },
    { id: "e", name: "Wide" },
    { id: "d", name: "Long" },
    { id: "c", name: "Square" },
    { id: "b", name: "Corner" },
    { id: "f", name: "Steps" },
    { id: "s", name: "Snug" }
];

const frac = (v) => v - Math.round(v);

function build(cctPath) {
    const cast = openCast(cctPath);
    const regs = new Map(listCast(cctPath).map(m => [m.name, m]));

    const members = [];
    for (const e of cast.res.filter(x => x.tag === "CASt")) {
        const m = readMember(cast.chunk(e));
        if (m && m.name) members.push({ id: e.id, ...m });
    }
    const byName = new Map(members.map(m => [m.name, m]));

    function fieldText(name) {
        const m = byName.get(name);
        if (!m) return null;
        const sid = cast.childOf.get(`${m.id}:STXT`);
        if (sid === undefined) return null;
        const b = cast.chunk(cast.byId.get(sid));
        const off = b.readUInt32BE(0), len = b.readUInt32BE(4);
        return b.toString("latin1", off, off + len);
    }

    function decode(letter) {
        const raw = fieldText(`model_${letter}.room`);
        if (!raw) throw new Error(`model_${letter}.room not found`);
        const t = raw.replace(/\r/g, "\n");

        const rd = /#offsetx: (-?\d+), #offsety: (-?\d+), #factorx: (\d+), #factory: (\d+)/.exec(t);
        if (!rd) throw new Error(`model_${letter}: no roomdata`);
        const ox = +rd[1], oy = +rd[2], fx = +rd[3], fy = +rd[4];
        if (fx !== 64) throw new Error(`model_${letter}: half-scale, not shipped`);

        const els = [...t.matchAll(/\[#member: "(flat_floor_(\d+)_[^"]*)"[^\]]*?#locH: (-?\d+), #locV: (-?\d+)[^\]]*?\]/g)]
            .map(m => ({ member: m[1], h: +m[2], locH: +m[3], locV: +m[4] }));
        if (!els.length) throw new Error(`model_${letter}: no floor stamps`);
        if (/flat_stair/.test(t)) throw new Error(`model_${letter}: has stairs, not shipped`);

        const raws = els.map(s => {
            const r = regs.get(s.member) || { w: 130, regX: 0, regY: 0 };
            const left = s.locH - r.regX;
            return {
                h: s.h,
                dx: (left + r.w / 2 - ox) / (fx / 2),
                dy: (s.locV - r.regY - oy) / (fy / 2)
            };
        });
        const fdx = frac(raws[0].dx), fdy = frac(raws[0].dy);

        const tiles = new Set();
        for (const s of raws) {
            const dx = s.dx - fdx, dy = s.dy - fdy;
            if (Math.abs(frac(dx)) > 1e-6 || Math.abs(frac(dy)) > 1e-6) continue;
            const tx = (dx + dy) / 2, ty = (dy - dx) / 2;
            if (!Number.isInteger(tx) || !Number.isInteger(ty)) continue;
            for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) tiles.add(`${tx + a},${ty + b}`);
        }
        if (!tiles.size) throw new Error(`model_${letter}: nothing decoded`);

        const xs = [...tiles].map(k => +k.split(",")[0]);
        const ys = [...tiles].map(k => +k.split(",")[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        const mask = [];
        for (let y = minY; y <= maxY; y++) {
            let row = "";
            for (let x = minX; x <= maxX; x++) row += tiles.has(`${x},${y}`) ? "0" : "x";
            mask.push(row);
        }

        // The door, put back on the grid — see the note at the top.
        let door = 0;
        const dm = /\[#member: "leftdoor_open"[^\]]*?#locH: (-?\d+), #locV: (-?\d+)[^\]]*?\]/.exec(t);
        if (dm) {
            const r = regs.get("leftdoor_open") || { w: 32, regX: 0 };
            const rightEdge = (+dm[1] - r.regX) + r.w;
            const k = (rightEdge - ox) / (fx / 2);
            door = Math.round(minX - k) - minY;
        }
        /* A door has to stand against a tile that exists. Every shipped model
           puts it on the left wall's straight run, but clamping costs nothing
           and a door floating past the end of a wall is very visible. */
        const wallRun = mask.map((row, i) => ({ i, open: row.indexOf("0") })).filter(r => r.open >= 0);
        const lo = wallRun.length ? wallRun[0].i : 0;
        const hi = wallRun.length ? wallRun[wallRun.length - 1].i : mask.length - 1;
        door = Math.max(lo, Math.min(hi, door));

        return {
            cols: maxX - minX + 1,
            rows: maxY - minY + 1,
            tiles: tiles.size,
            door,
            mask
        };
    }

    const out = [];
    for (const s of SHIP) {
        const d = decode(s.id);
        out.push({ ...s, ...d });
        console.log(`model_${s.id} "${s.name}"  ${d.cols}x${d.rows}  ${d.tiles} tiles  door@${d.door}` +
                    (d.mask.some(r => r.includes("x")) ? "  (shaped)" : ""));
    }
    return out;
}

function emit(models) {
    const lines = [];
    lines.push(`/* The room layouts, straight out of the Origins client.

   GENERATED by tools/room-layouts-extract.js from hh_room_private.cct — do
   not edit by hand. The tool's header explains where these come from and why
   only seven of the client's nineteen models are here.

   A layout is a grid and a MASK. \`mask\` is one string per row, "0" where
   there is floor and "x" where there is not, so a room can have a corner
   taken out of it — which two of these do. Everything that asks "is this a
   tile" has to consult the mask and not just the bounds, because a hole is
   as solid as the wall as far as walking is concerned.

   \`door\` is the row on the left wall the doorway stands against, taken from
   the model's own leftdoor_open element. */
(function () {
    "use strict";
`);
    lines.push("    const MODELS = [");
    for (const m of models) {
        lines.push("        {");
        lines.push(`            id: ${JSON.stringify(m.id)}, name: ${JSON.stringify(m.name)},`);
        lines.push(`            cols: ${m.cols}, rows: ${m.rows}, tiles: ${m.tiles}, door: ${m.door},`);
        lines.push("            mask: [");
        for (const row of m.mask) lines.push(`                ${JSON.stringify(row)},`);
        lines.push("            ]");
        lines.push("        },");
    }
    lines.push("    ];");
    lines.push(`
    const byId = new Map(MODELS.map(m => [m.id, m]));

    /* An unknown id falls back to the first rather than throwing: a level
       saved against a layout that later went away is still a playable level,
       and the classic room is the right thing to show instead. */
    function get(id) { return byId.get(id) || MODELS[0]; }

    // Is there floor here? Bounds AND mask — a hole is not a tile.
    function has(layout, x, y) {
        if (!layout || x < 0 || y < 0 || y >= layout.rows || x >= layout.cols) return false;
        return layout.mask[y][x] !== "x";
    }

    function tileList(layout) {
        const out = [];
        for (let y = 0; y < layout.rows; y++) {
            for (let x = 0; x < layout.cols; x++) if (has(layout, x, y)) out.push({ x, y });
        }
        return out;
    }

    // The first tile with floor on it, scanning the way a room reads.
    function firstTile(layout) {
        for (let y = 0; y < layout.rows; y++) {
            for (let x = 0; x < layout.cols; x++) if (has(layout, x, y)) return { x, y };
        }
        return { x: 0, y: 0 };
    }

    window.RoomLayouts = { MODELS, DEFAULT: MODELS[0].id, get, has, tileList, firstTile };
})();
`);
    return lines.join("\n");
}

if (require.main === module) {
    const cct = process.argv[2] || DEFAULT_CCT;
    const out = process.argv[3] || path.join(__dirname, "..", "js", "room-layouts.js");
    const models = build(cct);
    fs.writeFileSync(out, emit(models));
    console.log(`\nwrote ${models.length} layouts to ${out}`);
}

module.exports = { build };

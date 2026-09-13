/* The levels themselves. tools/ff-levels-build.js turns these into documents,
   applies the difficulty curve and checks them before anything is written.

   A design says WHAT THE ROOM IS. It does not say how hard it is — the counts
   below are WEIGHTS, not amounts, and the number of pieces that actually fall
   comes from where the level sits on the curve.

   ----------------------------------------------------------------------
   HOW A HABBO ROOM IS ACTUALLY BUILT

   The reference is on this site: 171 screenshots of real rooms in
   assets/rooms, including the Little Maze.

     RUNS, NOT SINGLES.   Furniture goes down end to end. A bar is four tiles
                          of counter, not one desk. The Little Maze builds its
                          whole maze out of sofas laid nose to tail.
     THE WALLS ARE FULL.  Every tile along a wall carries something. Bare floor
                          is a walkway or a game area, never a leftover.
     RHYTHM.              A piece repeats at an interval and decoration
                          punctuates it — a candle every few tiles, plants in
                          pairs at the corners.
     CORRIDORS ARE TWO    A queue is two divider runs with rollers between
     WALLS.               them, and the way through is a GAP. `divider_arm3` is
                          a gate and furnidata says cannotstandon: it would
                          seal the room shut.
     THE FLOOR IS LAID.   A gameplay area is tiled or carpeted. Rugs and floor
                          tiles are canstandon, so they neither block a player
                          nor stop a piece landing on them.
     A CORNER PIECE GOES  `divider_arm1` is a Corner plinth. It belongs where
     IN A CORNER.         two runs meet and nowhere else. Used as a standalone
                          wall segment — which is what the first draft did — it
                          reads as a stray lump of masonry.

   ----------------------------------------------------------------------
   ROTATION IS AN INDEX, NOT A DIRECTION

   And that is the other thing the first draft got wrong: everything was
   written `rotation: 0` and half the room faced a wall.

   A rotation resolves against the directions a class actually SHIPS — drawn
   ones ascending, then the same ones back down mirrored — so the same index
   means different things for different furni. `divider_arm2` ships one
   direction, so its rotations are 0 and 6. `gothic_chair` ships four, so its
   rotations are 0, 4, 2, 6 in that order. `sheji_shelves` ships direction 2,
   so rotation 0 turns it DOWN the room and rotation 1 lays it across — which
   is how a bookcase came to be standing in the middle of a queue.

   So none of it is written as a number here. `runX`, `runY` and `seatsX` ask
   the library which index produces the orientation wanted:

     facing 0  front points down-right (+x)  — sits against the LEFT wall
     facing 2  front points down-left  (+y)  — sits against the BACK wall
     facing 4  front points up-left    (-x)
     facing 6  front points up-right   (-y)

   and the footprint turns when the facing is 2 or 6, because those are the
   room's other axis. A 2x1 screen laid down the side of a room is 1x2.

   ----------------------------------------------------------------------
   THE DOOR is on the left wall and the queue starts at it:
     classic (0,4)   wide (0,2)   corner (0,4)   steps (2,2) */

const fs = require("fs");
const path = require("path");

if (!global.window) global.window = {};
if (!global.window.FurniLibrary) {
    eval(fs.readFileSync(path.join(__dirname, "..", "js", "furni-library.js"), "utf8"));
}
const LIB = global.window.FurniLibrary;
const baseOf = (c) => String(c).replace(/\*\d+$/, "");
const MIRROR_OF = (d) => (6 - d + 8) % 8;

/* Every rotation index this class offers, and what each one faces. */
function facings(className) {
    const rec = LIB[baseOf(className)];
    if (!rec || !rec.s) return [0];
    const byState = rec.s[0] || rec.s[Object.keys(rec.s)[0]];
    const drawn = Object.keys(byState).map(Number).sort((a, b) => a - b);
    if (!drawn.length) return [0];
    return drawn.concat(drawn.slice().reverse().map(MIRROR_OF));
}
const turns = (f) => f === 2 || f === 6;        // does this facing swap the footprint

/* The rotation that lays a piece ACROSS the room (length along x), and the one
   that lays it DOWN the room (length along y). */
const alongX = (c) => { const f = facings(c); const i = f.findIndex(v => !turns(v)); return i < 0 ? 0 : i; };
const alongY = (c) => { const f = facings(c); const i = f.findIndex(v => turns(v)); return i < 0 ? 0 : i; };
/* The rotation that points a piece a particular way, falling back to whatever
   the class can actually do. */
const facing = (c, want) => { const f = facings(c); const i = f.indexOf(want); return i < 0 ? 0 : i; };

const at = (className, x, y, rotation = 0, extra = {}) =>
    ({ className, x, y, rotation, state: 0, z: 0, ...extra });
/* A run across the room. `step` is the piece's width in tiles. */
const runX = (className, x, y, n, step = 1, extra = {}) =>
    Array.from({ length: n }, (_, i) => at(className, x + i * step, y, alongX(className), extra));
/* A run down the room, laid with the rotation that turns the footprint — so a
   2x1 screen becomes the 1x2 it has to be to sit in a column. */
const runY = (className, x, y, n, step = 1, extra = {}) =>
    Array.from({ length: n }, (_, i) => at(className, x, y + i * step, alongY(className), extra));
/* Seats along a back wall, all of them looking into the room. */
const seatsX = (className, x, y, n, step = 1) =>
    Array.from({ length: n }, (_, i) => at(className, x + i * step, y, facing(className, 2)));

module.exports = [

    /* ---------------------------------------------------------------
       6. PURA LOUNGE — Wide, 10x8, door (0,2)

       The plainest of the three because it is the first. A four-tile bar and a
       four-tile bookcase run right across the back, the hosts sit behind the
       counter looking out at the queue, the queue runs the full width from the
       door, and the tiled floor is walled on all four sides with the only way
       in at (4,3). */
    {
        level: 6, id: "level-6", name: "Pura Lounge", model: "e",
        floor: { pattern: "wood", colour: 301 },
        wall: { pattern: "half1", colour: 610 },
        start: { x: 4, y: 3 }, startDir: 2,
        zoneName: "Lounge floor",
        zone: { x: 1, y: 4, w: 8, h: 4 },
        decor: [
            // the back wall: bar, then bookcases, then a pair of palms
            ...runX("bardesk_polyfon", 0, 0, 2, 2),
            ...runX("shelves_polyfon", 4, 0, 2, 2),
            ...runX("plant_yukka", 8, 0, 2),
            // the hosts, behind their own counter, looking at the queue
            ...seatsX("sofachair_polyfon", 0, 1, 2),
            at("lamp_armas", 2, 1, 0, { state: 1 }),
            ...runX("divider_silo2", 3, 1, 2, 2),
            ...runX("plant_bonsai", 7, 1, 3),
            // the queue, the full width of the room from the door at (0,2)
            ...runX("queue_tile1*5", 1, 2, 7),
            ...runX("plant_pineapple", 8, 2, 2),
            // the wall onto the floor, the way through at (4,3)
            ...runX("divider_silo2", 0, 3, 2, 2),
            ...runX("divider_silo2", 5, 3, 2, 2),
            at("divider_arm1", 9, 3),               // the corner, where it turns
            // and down both sides, screens laid the other way about
            ...runY("divider_silo2", 0, 4, 2, 2),
            ...runY("divider_silo2", 9, 4, 2, 2),
            // the floor itself, two four-tile squares
            ...runX("tile_orange", 1, 4, 2, 4)
        ],
        drops: [
            { className: "sofa_polyfon", role: "sequence", w: 2 },
            { className: "sofachair_polyfon", role: "sequence", w: 3 },
            { className: "chair_polyfon", role: "sequence", w: 3 },
            { className: "plant_small_cactus", role: "obstacle" }
        ]
    },

    /* ---------------------------------------------------------------
       7. GOTHIC HALL — Corner, 11x10, door (0,4)

       Corner's cut-away quarter hands you an arm and a hall. The arm is a
       gallery: three gothic sofas nose to tail along the back, a row of chairs
       facing out of it, candles between them, a rug at the end. The hall below
       is flagged end to end and the queue along row 4 is the seam between the
       two.

       The gothic line is seats and candlelight and no scenery at all, so the
       screens are silo: plain dark panels read as the same room. */
    {
        level: 7, id: "level-7", name: "Gothic Hall", model: "b",
        floor: { pattern: "tiles3", colour: 502 },
        wall: { pattern: "gothic", colour: 3104 },
        start: { x: 4, y: 5 }, startDir: 2,
        zoneName: "The hall",
        zone: { x: 1, y: 6, w: 8, h: 4 },
        decor: [
            // the gallery along the back of the arm
            ...runX("gothic_sofa*2", 4, 0, 3, 2),
            at("gothiccandelabra", 10, 0, 0, { state: 1 }),
            // chairs looking out of it, candles punctuating the row
            ...seatsX("gothic_chair*4", 4, 1, 2),
            at("gothiccandelabra", 6, 1, 0, { state: 1 }),
            ...seatsX("gothic_chair*4", 7, 1, 2),
            at("gothiccandelabra", 9, 1, 0, { state: 1 }),
            at("plant_bonsai", 10, 1),
            // a rug, screens and stools closing the gallery
            at("rare_daffodil_rug", 4, 2),
            ...runX("divider_silo2", 6, 2, 2, 2),
            at("plant_bonsai", 10, 2),
            ...seatsX("gothic_stool*1", 6, 3, 2),
            ...runX("plant_bonsai", 8, 3, 3),
            // the queue, the width of the hall from the door at (0,4)
            ...runX("queue_tile1*5", 1, 4, 7),
            ...runX("plant_bonsai", 8, 4, 3),
            // the wall onto the hall, the way through at (4,5)
            ...runX("divider_silo2", 0, 5, 2, 2),
            ...runX("divider_silo2", 5, 5, 2, 2),
            at("divider_arm1", 9, 5),               // the corner, where it turns
            at("plant_bonsai", 10, 5),
            // candlelit columns down both sides of the hall
            at("gothiccandelabra", 0, 6, 0, { state: 1 }),
            ...runY("plant_bonsai", 0, 7, 2),
            at("gothiccandelabra", 0, 9, 0, { state: 1 }),
            at("gothiccandelabra", 9, 6, 0, { state: 1 }),
            ...runY("plant_bonsai", 9, 7, 3),
            at("gothiccandelabra", 10, 6, 0, { state: 1 }),
            ...runY("plant_bonsai", 10, 7, 2),
            at("gothiccandelabra", 10, 9, 0, { state: 1 }),
            // the hall floor, flagged end to end
            ...runX("gothic_carpet2", 1, 6, 4, 2)
        ],
        drops: [
            { className: "gothic_sofa*2", role: "sequence", w: 2 },
            { className: "gothic_chair*4", role: "sequence", w: 3 },
            { className: "gothic_stool*1", role: "sequence", w: 3 },
            { className: "gothiccandelabra", role: "obstacle" }
        ]
    },

    /* ---------------------------------------------------------------
       8. SHEJI TEAROOM — Steps, 10x10, door (2,2)

       Steps is the awkward one and the shape does the work. Two rows in the
       top right, four reaching further left, then the room opens to full width
       at row 6 — so it reads as three terraces and you come down through them
       one at a time, by the gaps at (4,3) and (4,5). Sand over the bottom
       floor.

       Sheji is the one oriental line with a divider of its own, so the whole
       room is dressed out of a single set. */
    {
        level: 8, id: "level-8", name: "Sheji Tearoom", model: "f",
        floor: { pattern: "tiles2", colour: 407 },
        wall: { pattern: "plain", colour: 206 },
        start: { x: 4, y: 5 }, startDir: 2,
        zoneName: "Tearoom floor",
        zone: { x: 1, y: 6, w: 8, h: 4 },
        decor: [
            // the host's nub: the grand sofa across the back, shelving below it
            ...runX("sheji_cnsofa", 6, 0, 1, 3),
            at("hc_lmp", 9, 0, 0, { state: 1 }),
            ...runX("sheji_shelves", 6, 1, 2, 2),
            // the queue, in from the door at (2,2)
            ...runX("queue_tile1*5", 3, 2, 5),
            ...runX("sheji_divider", 8, 2, 2),
            // down to the middle terrace, the way through at (4,3)
            ...runX("sheji_divider", 2, 3, 2),
            ...runX("sheji_divider", 5, 3, 5),
            // the middle terrace, chairs either side of the walkway
            ...seatsX("sheji_cnchair", 2, 4, 2),
            ...seatsX("sheji_sofachair", 5, 4, 2),
            at("plant_yukka", 7, 4),
            ...runX("sheji_shelves", 8, 4, 1, 2),
            // the wall onto the tearoom floor, the way through at (4,5)
            ...runX("sheji_shelves", 2, 5, 1, 2),
            ...runX("sheji_divider", 5, 5, 2),
            at("plant_pineapple", 7, 5),
            at("hc_lmp", 8, 5, 0, { state: 1 }),
            at("plant_yukka", 9, 5),
            // lamps and planting down both sides of the floor
            at("plant_bonsai", 0, 6), at("plant_yukka", 0, 7),
            at("plant_bonsai", 0, 8), at("plant_yukka", 0, 9),
            at("hc_lmp", 9, 6, 0, { state: 1 }), at("plant_bonsai", 9, 7),
            at("plant_yukka", 9, 8), at("hc_lmp", 9, 9, 0, { state: 1 }),
            /* raked sand over the tearoom floor. The first try was jp_bamboo,
               which is called Bamboo Forest and is exactly that — waist-high
               stalks that swallowed the arena. A floor covering has to be FLAT
               as well as walkable. */
            ...runX("dark_sand", 1, 6, 4, 2),
            ...runX("dark_sand", 1, 8, 4, 2)
        ],
        drops: [
            { className: "sheji_cnsofa", role: "sequence", w: 1 },
            { className: "sheji_sofachair", role: "sequence", w: 3 },
            { className: "sheji_cnchair", role: "sequence", w: 3 },
            { className: "sheji_divider", role: "obstacle" }
        ]
    }
];

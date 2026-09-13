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
                          of counter, not one desk.
     THE WALLS ARE FULL.  Every tile along a wall carries something. Bare floor
                          is a walkway or a game area, never a leftover.
     RHYTHM.              A piece repeats at an interval and decoration
                          punctuates it — a candle every few tiles.
     CORRIDORS ARE TWO    A queue is two divider runs with rollers between
     WALLS.               them, and the way through is a GAP. `divider_arm3` is
                          a gate and furnidata says cannotstandon: it would
                          seal the room shut.
     A CORNER PIECE GOES  `divider_arm1` is a Corner plinth. It belongs where
     IN A CORNER.         two runs meet and nowhere else.
     PLANTING IS TRIM.    A pair at a corner, not a hedge. An earlier draft put
                          eleven bonsais in a cathedral.

   NO FLOOR COVERINGS. Rugs, floor tiles, cobbles and sand are walkable and so
   they are tempting for marking out the arena, and they are not wanted: the
   gameplay floor is the room's own floor, the way levels 1 to 5 have it.

   ----------------------------------------------------------------------
   ROTATION IS AN INDEX, NOT A DIRECTION

   A rotation resolves against the directions a class actually SHIPS — drawn
   ones ascending, then the same ones back down mirrored — so the same index
   means different things for different furni. `divider_arm2` ships one
   direction, so its rotations are 0 and 6. `gothic_chair` ships four, so its
   rotations are 0, 4, 2, 6 in that order. Nothing below is written as a
   number; the helpers ask the library for the orientation wanted.

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

/* WHAT EACH FACING ACTUALLY LOOKS LIKE, settled by standing one bookcase and
   one sofa at each of the four room corners and looking at the result:

     facing 0   front toward +y, down-left    footprint as given   BACK wall
     facing 2   front toward -x, up-left      footprint SWAPPED    right wall
     facing 4   front toward -y, up-right     footprint as given   front wall
     facing 6   front toward +x, down-right   footprint SWAPPED    LEFT wall

   The footprint turns on the two facings pointing along x, because a piece two
   tiles long facing that way is two tiles deep in y. A 2x1 bookcase at facing 0
   covers (x,y) and (x+1,y) and opens down-left — a bookcase against the back
   wall, which is the thing you want.

   The draft before this had the whole model rotated a quarter turn: it seated
   chairs at facing 2, which points them up-left INTO the wall behind them and
   swaps their footprint at the same time. */
const BACK = 0, RIGHT = 2, FRONT = 4, LEFT = 6;

/* The rotation index that points a class a given way. Not every class can do
   every facing — `sheji_shelves` ships only direction 2, so it can face up-left
   or up-right and nothing else — so this falls back to the nearest facing the
   class HAS rather than silently returning 0 and laying a bookcase across a
   corridor, which is what happened. */
function facing(className, want) {
    const f = facings(className);
    const i = f.indexOf(want);
    if (i >= 0) return i;
    /* KEEPING THE FOOTPRINT'S ORIENTATION MATTERS MORE THAN THE ANGLE. A
       screen wanted down the right-hand wall has to be one tile wide and two
       deep whatever way it ends up looking; substituting the nearest angle
       instead gave back a 2x1 that hung off the edge of the room. So a facing
       that turns the footprint the same way as the one asked for wins outright,
       and the angle only separates the candidates that remain. */
    let best = 0, bestScore = -Infinity;
    f.forEach((v, idx) => {
        const away = Math.min((v - want + 8) % 8, (want - v + 8) % 8);
        const score = (turns(v) === turns(want) ? 100 : 0) - away;
        if (score > bestScore) { bestScore = score; best = idx; }
    });
    return best;
}

const at = (className, x, y, rotation = 0, extra = {}) =>
    ({ className, x, y, rotation, state: 0, z: 0, ...extra });

/* A run ACROSS the room against the back wall, everything looking into it. */
const backRun = (className, x, y, n, step = 1, extra = {}) =>
    Array.from({ length: n }, (_, i) => at(className, x + i * step, y, facing(className, BACK), extra));
/* A run DOWN the left-hand wall, looking across the room. The footprint turns,
   so a 2x1 screen becomes 1x2 and `step` is its length in tiles. */
const leftRun = (className, x, y, n, step = 1, extra = {}) =>
    Array.from({ length: n }, (_, i) => at(className, x, y + i * step, facing(className, LEFT), extra));
/* And down the right-hand wall, looking back across it. */
const rightRun = (className, x, y, n, step = 1, extra = {}) =>
    Array.from({ length: n }, (_, i) => at(className, x, y + i * step, facing(className, RIGHT), extra));
/* A queue of rollers running in +x. A roller has a direction of travel and has
   to point the way the queue goes, which is facing 6. */
const queueX = (x, y, n) =>
    Array.from({ length: n }, (_, i) => at("queue_tile1*5", x + i, y, facing("queue_tile1*5", LEFT)));

module.exports = [

    /* ---------------------------------------------------------------
       6. PURA LOUNGE — Wide, 10x8, door (0,2)

       A four-tile bar and a four-tile bookcase run right across the back with
       the hosts sitting behind the counter, the queue runs the full width from
       the door, and the floor is walled on all four sides with one way in at
       (4,3). Two palms at the far corner and nothing else growing. */
    {
        level: 6, id: "level-6", name: "Pura Lounge", model: "e",
        floor: { pattern: "wood", colour: 301 },
        wall: { pattern: "half1", colour: 610 },
        start: { x: 4, y: 3 }, startDir: 2,
        zoneName: "Lounge floor",
        zone: { x: 1, y: 4, w: 8, h: 4 },
        decor: [
            // the back wall: bar, bookcases, a pair of palms in the corner
            ...backRun("bardesk_polyfon", 0, 0, 2, 2),
            ...backRun("shelves_polyfon", 4, 0, 2, 2),
            ...backRun("plant_yukka", 8, 0, 2),
            // the hosts behind their counter, looking out at the queue
            ...backRun("sofachair_polyfon", 0, 1, 2),
            at("lamp_armas", 2, 1, 0, { state: 1 }),
            ...backRun("divider_silo2", 3, 1, 3, 2),
            // the queue, the full width of the room from the door at (0,2)
            ...queueX(1, 2, 7),
            // the wall onto the floor, the way through at (4,3)
            ...backRun("divider_silo2", 0, 3, 2, 2),
            ...backRun("divider_silo2", 5, 3, 2, 2),
            at("divider_arm1", 9, 3),               // the corner, where it turns
            // and down both sides
            ...leftRun("divider_silo2", 0, 4, 2, 2),
            ...rightRun("divider_silo2", 9, 4, 2, 2)
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

       Corner's cut-away quarter gives an arm and a hall. The arm is a gallery:
       three gothic sofas nose to tail along the back, chairs looking out of it,
       candles punctuating the row. The hall below is the floor and the queue
       along row 4 is the seam between them. Candles at the four corners and no
       planting at all — the draft before this had eleven bonsais in a
       cathedral. */
    {
        level: 7, id: "level-7", name: "Gothic Hall", model: "b",
        floor: { pattern: "tiles3", colour: 502 },
        wall: { pattern: "gothic", colour: 3104 },
        start: { x: 4, y: 5 }, startDir: 2,
        zoneName: "The hall",
        zone: { x: 1, y: 6, w: 8, h: 4 },
        decor: [
            // the gallery along the back of the arm
            ...backRun("gothic_sofa*2", 4, 0, 3, 2),
            at("gothiccandelabra", 10, 0, 0, { state: 1 }),
            // chairs looking out of it, candles punctuating the row
            ...backRun("gothic_chair*4", 4, 1, 2),
            at("gothiccandelabra", 6, 1, 0, { state: 1 }),
            ...backRun("gothic_chair*4", 7, 1, 2),
            at("gothiccandelabra", 9, 1, 0, { state: 1 }),
            // screens and stools closing the gallery off
            ...backRun("divider_silo2", 6, 2, 2, 2),
            ...backRun("gothic_stool*1", 6, 3, 2),
            // the queue, the width of the hall from the door at (0,4)
            ...queueX(1, 4, 7),
            // the wall onto the hall, the way through at (4,5)
            ...backRun("divider_silo2", 0, 5, 2, 2),
            ...backRun("divider_silo2", 5, 5, 2, 2),
            at("divider_arm1", 9, 5),               // the corner, where it turns
            // candlelit corners, screens between them
            at("gothiccandelabra", 0, 6, 0, { state: 1 }),
            ...leftRun("divider_silo2", 0, 7, 1, 2),
            at("gothiccandelabra", 0, 9, 0, { state: 1 }),
            at("gothiccandelabra", 10, 6, 0, { state: 1 }),
            ...rightRun("divider_silo2", 10, 7, 1, 2),
            at("gothiccandelabra", 10, 9, 0, { state: 1 })
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

       Steps does the work: two rows in the top right, four reaching further
       left, then full width at row 6. Three terraces, and you come down through
       them by the gaps at (4,3) and (4,5).

       sheji_shelves ships only direction 2, so it cannot face a back wall at
       all — it goes down the sides, where up-left is exactly right, and the
       back wall is the grand sofa and dividers instead. */
    {
        level: 8, id: "level-8", name: "Sheji Tearoom", model: "f",
        floor: { pattern: "tiles2", colour: 407 },
        wall: { pattern: "plain", colour: 206 },
        start: { x: 4, y: 5 }, startDir: 2,
        zoneName: "Tearoom floor",
        zone: { x: 1, y: 6, w: 8, h: 4 },
        decor: [
            // the host's nub: the grand sofa across the back
            ...backRun("sheji_cnsofa", 6, 0, 1, 3),
            at("hc_lmp", 9, 0, 0, { state: 1 }),
            ...backRun("sheji_divider", 6, 1, 4),
            // the queue, in from the door at (2,2)
            ...queueX(3, 2, 5),
            ...backRun("sheji_divider", 8, 2, 2),
            // down to the middle terrace, the way through at (4,3)
            ...backRun("sheji_divider", 2, 3, 2),
            ...backRun("sheji_divider", 5, 3, 4),
            // the middle terrace, chairs either side of the walkway
            ...backRun("sheji_cnchair", 2, 4, 2),
            ...backRun("sheji_sofachair", 5, 4, 2),
            at("plant_yukka", 7, 4),
            // shelving down the sides, where this bookcase can actually face
            ...rightRun("sheji_shelves", 9, 3, 1, 2),
            ...rightRun("sheji_shelves", 9, 7, 1, 2),
            // the wall onto the tearoom floor, the way through at (4,5)
            ...backRun("sheji_divider", 5, 5, 2),
            at("hc_lmp", 8, 5, 0, { state: 1 }),
            // lamps at the corners, screens between
            at("hc_lmp", 0, 6, 0, { state: 1 }),
            ...leftRun("sheji_divider", 0, 7, 2),
            at("plant_yukka", 0, 9),
            at("hc_lmp", 9, 6, 0, { state: 1 })
        ],
        drops: [
            { className: "sheji_cnsofa", role: "sequence", w: 1 },
            { className: "sheji_sofachair", role: "sequence", w: 3 },
            { className: "sheji_cnchair", role: "sequence", w: 3 },
            { className: "sheji_divider", role: "obstacle" }
        ]
    }
];

/* The levels themselves. tools/ff-levels-build.js turns these into documents,
   applies the difficulty curve and checks them before anything is written.

   A design says WHAT THE ROOM IS. It does not say how hard it is — the counts
   below are WEIGHTS, not amounts, and the number of pieces that actually fall
   comes from where the level sits on the curve. That way a room can be moved
   up or down the run without being redrawn.

   ----------------------------------------------------------------------
   HOW A HABBO ROOM IS ACTUALLY BUILT

   The first draft of these was furniture scattered on a floor, and it looked
   like it. The archive on this very site is the reference — 171 screenshots
   of real rooms — and what it shows is not what I had built:

     RUNS, NOT SINGLES.   Furniture goes down end to end in unbroken lines.
                          A bar is four tiles of counter, not one desk. A wall
                          of bookcases is three bookcases touching. The Little
                          Maze builds its entire maze out of sofas laid nose to
                          tail.
     THE WALLS ARE FULL.  Every tile along the back and side walls carries
                          something. Bare floor is a walkway or a game area,
                          never a leftover.
     RHYTHM.              The same piece repeats at a regular interval, and
                          decoration punctuates it — a lamp every few tiles, a
                          pair of plants at each corner.
     CORRIDORS ARE MADE   A queue is two divider runs with rollers between
     OF TWO WALLS.        them, and the way through is a GAP, not a gate:
                          `divider_arm3` is furnidata `cannotstandon` and would
                          seal the room shut.
     PAIRS AND SYMMETRY.  Plants come in twos flanking a corner or an opening.
                          Columns go down both sides of an open floor.
     THE FLOOR IS LAID.   A gameplay area is not bare boards. It is tiled or
                          carpeted, and it can be: furnidata marks rugs and
                          floor tiles `canstandon`, so they neither block a
                          player nor stop a piece landing on them. 185 pieces
                          in this client are walkable that way.

   So each room here is: a back wall of counter and shelving with the host
   seated behind it, a divider wall, a roller queue running the width of the
   room from the door, a second divider wall with one gap in it, and then the
   gameplay floor — kept clear because pieces have to land on it, but FRAMED
   down both sides so it reads as a room rather than a gap in the furniture.

   ----------------------------------------------------------------------
     level      its place in the run, 1-49
     model      classic | wide | corner | steps, as the letters the client uses
     floor/wall a pattern id and a colour id out of js/room-patterns.js
     start      the tile the player begins on — the gap in the second wall
     decor      laid out by hand
     zone       the gameplay area — the rectangle pieces fall into
     drops      what falls. `w` is a weight among the sequence seats; the
                obstacle, decoy and poi rows take their counts from the curve

   THE DOOR is on the left wall and the queue starts at it:
     classic (0,4)   wide (0,2)   corner (0,4)   steps (2,2) */

const A = "a", E = "e", B = "b", F = "f";

/* A run of the same piece, laid end to end. `step` is its width in tiles. */
const run = (className, x, y, n, step = 1, extra = {}) =>
    Array.from({ length: n }, (_, i) =>
        ({ className, x: x + i * step, y, rotation: 0, state: 0, z: 0, ...extra }));
/* The same, DOWN the room rather than across it. The side columns that frame
   a gameplay floor are vertical runs, and laying them with `run` walks them
   straight off the edge of the world. */
const col = (className, x, y, n, step = 1, extra = {}) =>
    Array.from({ length: n }, (_, i) =>
        ({ className, x, y: y + i * step, rotation: 0, state: 0, z: 0, ...extra }));
const one = (className, x, y, extra = {}) =>
    ({ className, x, y, rotation: 0, state: 0, z: 0, ...extra });

module.exports = [

    /* ---------------------------------------------------------------
       6. PURA LOUNGE — Wide, 10x8, door (0,2)

       The plainest of the three, because it is the first: one straight bar
       across the back with the hosts behind it, the queue running the full
       width of the room, and an open floor framed by planted columns. Polyfon
       is Habbo's most ordinary furniture and level 6 should teach the shape of
       a room rather than surprise anybody. */
    {
        level: 6, id: "level-6", name: "Pura Lounge", model: E,
        floor: { pattern: "wood", colour: 301 },
        wall: { pattern: "half1", colour: 610 },
        start: { x: 4, y: 3 }, startDir: 2,
        zoneName: "Lounge floor",
        zone: { x: 1, y: 4, w: 8, h: 4 },
        decor: [
            // back wall: four tiles of bar, then four of bookcase, then plants
            ...run("bardesk_polyfon", 0, 0, 2, 2),
            ...run("shelves_polyfon", 4, 0, 2, 2),
            ...run("plant_yukka", 8, 0, 2),
            // the hosts, seated behind their own counter
            ...run("sofachair_polyfon", 0, 1, 2),
            one("lamp_armas", 2, 1, { state: 1 }),
            ...run("divider_silo2", 3, 1, 2, 2),
            one("divider_arm1", 7, 1),
            ...run("plant_bonsai", 8, 1, 2),
            // the queue, the full width of the room from the door at (0,2)
            ...run("queue_tile1*5", 1, 2, 7),
            ...run("plant_pineapple", 8, 2, 2),
            /* the wall onto the floor, with the way through at (4,3). Screens
               rather than the Amberwood divider, because that reads as the same
               stone balustrade as the bar behind it and the room came out
               looking like two railings. */
            ...run("divider_silo2", 0, 3, 2, 2),
            ...run("divider_silo2", 5, 3, 2, 2),
            one("divider_arm1", 9, 3),
            // planted columns framing the floor down both sides
            one("divider_arm1", 0, 4), ...col("plant_bonsai", 0, 5, 2), one("divider_arm1", 0, 7),
            one("divider_arm1", 9, 4), ...col("plant_bonsai", 9, 5, 2), one("divider_arm1", 9, 7),
            // and the floor itself, laid in two four-tile squares
            ...run("tile_orange", 1, 4, 2, 4)
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

       Corner has its top-left quarter cut away, which hands you an arm and a
       hall for nothing. The arm is furnished as a gallery — three gothic sofas
       nose to tail along the back, chairs facing them, candles between — and
       the hall below is the floor. The queue runs the width of row 4, the seam
       between the two, and the only way down is the gap at (4,5).

       The gothic line is all seats and candlelight and no scenery whatever, so
       the screens are Amberwood: dark wood reads as the same room. */
    {
        level: 7, id: "level-7", name: "Gothic Hall", model: B,
        floor: { pattern: "tiles3", colour: 502 },
        wall: { pattern: "gothic", colour: 3104 },
        start: { x: 4, y: 5 }, startDir: 2,
        zoneName: "The hall",
        zone: { x: 1, y: 6, w: 8, h: 4 },
        decor: [
            // the gallery along the back of the arm
            ...run("gothic_sofa*2", 4, 0, 3, 2),
            one("gothiccandelabra", 10, 0, { state: 1 }),
            // chairs facing it, candles punctuating the row
            ...run("gothic_chair*4", 4, 1, 2),
            one("gothiccandelabra", 6, 1, { state: 1 }),
            ...run("gothic_chair*4", 7, 1, 2),
            one("gothiccandelabra", 9, 1, { state: 1 }),
            one("plant_bonsai", 10, 1),
            // a rug, screens and stools closing the gallery off
            one("rare_daffodil_rug", 4, 2),
            ...run("divider_arm2", 6, 2, 2, 2),
            one("plant_bonsai", 10, 2),
            ...run("gothic_stool*1", 6, 3, 2),
            ...run("divider_arm1", 8, 3, 2),
            one("plant_bonsai", 10, 3),
            // the queue, the width of the hall from the door at (0,4)
            ...run("queue_tile1*5", 1, 4, 7),
            one("divider_arm1", 8, 4),
            ...run("plant_bonsai", 9, 4, 2),
            // the wall onto the hall floor, with the way through at (4,5)
            ...run("divider_arm2", 0, 5, 2, 2),
            ...run("divider_arm2", 5, 5, 2, 2),
            ...run("divider_arm1", 9, 5, 2),
            // candlelit columns down both sides of the hall
            one("gothiccandelabra", 0, 6, { state: 1 }), ...col("plant_bonsai", 0, 7, 2),
            one("gothiccandelabra", 0, 9, { state: 1 }),
            one("gothiccandelabra", 10, 6, { state: 1 }), ...col("plant_bonsai", 10, 7, 2),
            one("gothiccandelabra", 10, 9, { state: 1 }),
            ...col("plant_bonsai", 9, 6, 4),
            // the hall floor, flagged end to end
            ...run("gothic_carpet2", 1, 6, 4, 2)
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

       Steps is the awkward one and the shape does the work: a nub of two rows
       in the top right, four rows reaching further left, then the room opens
       to full width at row 6. So the room is read as three terraces — the
       host's nub at the top, a furnished middle terrace, and the tearoom floor
       at the bottom — and you come down through them one at a time by the gaps
       at (4,3) and (4,5).

       Sheji is the one oriental line with a divider of its own, so the whole
       room is dressed out of a single set. */
    {
        level: 8, id: "level-8", name: "Sheji Tearoom", model: F,
        floor: { pattern: "tiles2", colour: 407 },
        wall: { pattern: "plain", colour: 206 },
        start: { x: 4, y: 5 }, startDir: 2,
        zoneName: "Tearoom floor",
        zone: { x: 1, y: 6, w: 8, h: 4 },
        decor: [
            // the host's nub: the grand sofa across the back, shelving under it
            one("sheji_cnsofa", 6, 0),
            one("hc_lmp", 9, 0, { state: 1 }),
            ...run("sheji_shelves", 6, 1, 2, 2),
            // the queue, in from the door at (2,2)
            ...run("queue_tile1*5", 3, 2, 5),
            ...run("sheji_divider", 8, 2, 2),
            // down to the middle terrace, the way through at (4,3)
            ...run("sheji_divider", 2, 3, 2),
            ...run("sheji_divider", 5, 3, 5),
            // the middle terrace: chairs either side of the walkway
            ...run("sheji_cnchair", 2, 4, 2),
            ...run("sheji_sofachair", 5, 4, 2),
            one("plant_yukka", 7, 4),
            one("sheji_shelves", 8, 4),
            // and the wall onto the tearoom floor, the way through at (4,5)
            one("sheji_shelves", 2, 5),
            ...run("sheji_divider", 5, 5, 2),
            one("plant_pineapple", 7, 5),
            one("hc_lmp", 8, 5, { state: 1 }),
            one("plant_yukka", 9, 5),
            // lamps and planting down both sides of the floor
            one("plant_bonsai", 0, 6), one("plant_yukka", 0, 7),
            one("plant_bonsai", 0, 8), one("plant_yukka", 0, 9),
            one("hc_lmp", 9, 6, { state: 1 }), one("plant_bonsai", 9, 7),
            one("plant_yukka", 9, 8), one("hc_lmp", 9, 9, { state: 1 }),
            /* raked sand over the tearoom floor. The first try here was
               jp_bamboo, which is called Bamboo Forest and is exactly that —
               tall stalks, waist high, that swallowed the arena whole. A floor
               covering has to be FLAT as well as walkable. */
            ...run("dark_sand", 1, 6, 4, 2),
            ...run("dark_sand", 1, 8, 4, 2)
        ],
        drops: [
            { className: "sheji_cnsofa", role: "sequence", w: 1 },
            { className: "sheji_sofachair", role: "sequence", w: 3 },
            { className: "sheji_cnchair", role: "sequence", w: 3 },
            { className: "sheji_divider", role: "obstacle" }
        ]
    }
];

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
     THE QUEUE STARTS AT  Rollers begin on the tile in FRONT of the door and
     THE DOOR AND ENDS    run away from it, pointing the way they are laid, and
     AT A GATE.           they end at the gate into the gameplay area.
     THE GATE IS TO ONE   Not in the middle of the wall. The screens run the
     SIDE.                length of it and the gate sits at the far end,
                          between the last screen and the corner plinth.
     AND THE WALL IS      Which is fine: the avatar never walks in through it.
     SEALED.              It starts inside the gameplay area and stays there,
                          so a gate that furnidata calls cannotstandon is a
                          gate rather than a problem, and the themed ones
                          (`divider_silo3`, `divider_arm3`) can be used as
                          drawn.
     A CORNER PIECE GOES  `divider_arm1` is a Corner plinth. It belongs where
     IN A CORNER.         two runs meet and nowhere else.
     THE HOST SITS        Their chairs go behind a screen or a divider run that
     BEHIND A SCREEN.     locks the booth off from the queue and the floor. A
                          host seat loose against a wall is just a chair.
     NOTHING TALL AT THE  A bookcase on the front or right wall is drawn in
     FRONT.               front of the gameplay area and hides it. Tall things
                          — shelves, bookcases — go along the BACK wall (y=0)
                          and the LEFT wall (x=0) only, which draw behind the
                          floor. Screens are low enough to go anywhere.
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

/* WHAT EACH FACING ACTUALLY LOOKS LIKE.

   Not reasoned about this time, and not eyeballed either — READ OFF THE FIVE
   LEVELS THAT WERE BUILT BY HAND, where the rotations were chosen in the
   editor by someone who could see the result:

     bench_armas      (2,0) and (4,0)   y=0, the BACK wall   facing 4
     sofa_silo        (7,0)             y=0, the BACK wall   facing 4
     sofa_silo        (0,7)             x=0, the LEFT wall   facing 2
     sofa_dpolyfon*11 (0,9)             x=0, the LEFT wall   facing 2

   Two independent levels agree on each wall, so:

     facing 0   front toward -y, up-right     footprint as given   front wall
     facing 2   front toward +x, down-right   footprint SWAPPED    LEFT wall
     facing 4   front toward +y, down-left    footprint as given   BACK wall
     facing 6   front toward -x, up-left      footprint SWAPPED    right wall

   The footprint turns on the two facings pointing along x, which checks out
   against the same evidence: `sofa_silo` at (0,7) facing 2 is a 2x1 that
   covers (0,7) and (0,8), one tile wide and two deep, which is a sofa laid
   down the left-hand wall.

   I had this a HALF TURN out — seating chairs at 0 and 6, which points them
   into the wall they are standing against. Guessing it from the pictures got
   the axis right and the sign wrong twice running; the hand-built levels
   settled it in one go. */
const FRONT = 0, LEFT = 2, BACK = 4, RIGHT = 6;

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
/* And a queue running DOWN the room, in +y, which is what levels 12 and 14
   were rebuilt to use: the long axis makes a far longer queue and leaves the
   bulk of the room as floor. The roller still points the way it is laid, so
   travelling in +y is facing BACK — rotation 1, which is what those two
   levels have in them. */
const queueY = (x, y, n) =>
    Array.from({ length: n }, (_, i) => at("queue_tile1*5", x, y + i, facing("queue_tile1*5", BACK)));
const queueX = (x, y, n) =>
    Array.from({ length: n }, (_, i) => at("queue_tile1*5", x + i, y, facing("queue_tile1*5", LEFT)));

/* Levels 6, 7 and 8, drawn tile by tile. They were the samples the rules were
   argued out on, so they stay written out in full — the shells below are what
   those arguments turned into. */
const HAND = [

    /* ---------------------------------------------------------------
       6. PURA LOUNGE — Wide, 10x8, door (0,2)

       The hosts sit against the back wall with the bookcases, and the counter
       along row 1 runs the full width of the room so their booth is shut off
       from the queue below it. The queue runs the full width from the door and
       the floor is walled on all four sides, the way in at (8,3). One palm in
       the corner and nothing else growing. */
    {
        level: 6, id: "level-6", name: "Pura Lounge", model: "e",
        floor: { pattern: "wood", colour: 301 },
        wall: { pattern: "half1", colour: 610 },
        start: { x: 8, y: 4 }, startDir: 2,      // inside the floor, under the gate
        zoneName: "Lounge floor",
        zone: { x: 1, y: 4, w: 8, h: 4 },
        decor: [
            /* the back wall, the only wall a bookcase can stand against
               without hiding the floor: the hosts' seats, a lamp, the
               bar-back shelving, one palm in the corner. */
            ...backRun("sofachair_polyfon", 0, 0, 2),
            at("lamp_armas", 3, 0, 0, { state: 1 }),
            ...backRun("shelves_polyfon", 5, 0, 2, 2),
            at("plant_yukka", 9, 0),
            // the counter, which is what shuts the hosts off from the queue
            ...backRun("bardesk_polyfon", 0, 1, 2, 2),
            // the queue: from the tile in front of the door, ending over the gate
            ...queueX(1, 2, 8),
            // the wall onto the floor, and the gate at the far end of it
            // between the last screen and the corner plinth
            ...backRun("divider_silo2", 0, 3, 4, 2),
            at("divider_silo3", 8, 3),              // the gate
            at("divider_arm1", 9, 3)                // the corner, where it turns
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

       Corner's cut-away quarter gives an arm and a hall. The arm holds the
       gallery — a sofa, two chairs, a candle at each end, shut behind a screen
       run along row 1 — and the hall below is the floor. The queue along row 4
       is the seam. Two candles light the hall and nothing else stands in it:
       an empty floor is the point of the room, and the draft before this had
       eleven bonsais in a cathedral. */
    {
        level: 7, id: "level-7", name: "Gothic Hall", model: "b",
        floor: { pattern: "tiles3", colour: 502 },
        wall: { pattern: "gothic", colour: 3104 },
        start: { x: 9, y: 6 }, startDir: 2,      // inside the hall, under the gate
        zoneName: "The hall",
        zone: { x: 1, y: 6, w: 9, h: 4 },
        decor: [
            // the gallery along the back of the arm, candles at either end
            at("gothiccandelabra", 4, 0, 0, { state: 1 }),
            ...backRun("gothic_sofa*2", 5, 0, 1, 2),
            ...backRun("gothic_chair*4", 7, 0, 2),
            at("gothiccandelabra", 9, 0, 0, { state: 1 }),
            /* row 1 shuts the gallery off. It has to run the width of the arm
               and turn into the right wall on a plinth, or the hosts are
               simply sitting beside the queue. */
            ...backRun("divider_silo2", 4, 1, 3, 2),
            at("divider_arm1", 10, 1),
            // the queue: from the tile in front of the door, ending over the gate
            ...queueX(1, 4, 8),
            /* the wall onto the hall. A plinth where it meets the left wall,
               screens along it, then the gate at the far end with the corner
               plinth beyond it at the room's edge. */
            at("divider_arm1", 0, 5),
            ...backRun("divider_silo2", 1, 5, 4, 2),
            at("divider_silo3", 9, 5),              // the gate
            at("divider_arm1", 10, 5),              // the corner, where it turns
            // two candles lighting the hall, and nothing else in it
            at("gothiccandelabra", 0, 6, 0, { state: 1 }),
            /* down the left wall, not the front corner. x+y is the draw order,
               so (10,9) is the very front of the room and a lit candelabra
               there stands between the camera and the game. */
            at("gothiccandelabra", 0, 9, 0, { state: 1 })
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

       sheji_shelves ships only direction 2, which is LEFT, so it goes down the
       left-hand wall and nowhere else — which is where a bookcase belongs
       anyway, since that wall draws behind the floor. The back of the room is
       the grand sofa with its screens. */
    {
        level: 8, id: "level-8", name: "Sheji Tearoom", model: "f",
        floor: { pattern: "tiles2", colour: 407 },
        wall: { pattern: "plain", colour: 206 },
        start: { x: 8, y: 6 }, startDir: 2,      // inside the floor, under the gate
        zoneName: "Tearoom floor",
        zone: { x: 1, y: 6, w: 8, h: 4 },
        decor: [
            // the host's nub in the top step: the grand sofa and its screens
            at("hc_lmp", 6, 0, 0, { state: 1 }),
            ...backRun("sheji_cnsofa", 7, 0, 1, 3),
            ...backRun("sheji_divider2", 7, 1, 1, 2),
            at("sheji_divider", 9, 1),
            // the queue: from the tile in front of the door at (2,2)
            ...queueX(3, 2, 6),
            // the middle terrace: a tea table's worth of seating off to one side
            at("plant_yukka", 2, 3),
            ...backRun("sheji_cnchair", 4, 3, 2),
            at("sheji_sofachair", 6, 3, facing("sheji_sofachair", FRONT)),
            // the wall onto the tearoom floor, the gate at the far end
            ...backRun("sheji_divider2", 2, 5, 3, 2),
            at("sheji_divider3", 8, 5),             // the gate
            at("hc_lmp", 9, 5, 0, { state: 1 }),
            /* shelving down the LEFT wall. It is the one direction this
               bookcase ships, and a bookcase on the right or the front of the
               room is drawn over the floor and hides half the game. */
            ...leftRun("sheji_shelves", 0, 6, 1, 2),
            at("plant_yukka", 0, 9)
        ],
        drops: [
            { className: "sheji_cnsofa", role: "sequence", w: 1 },
            { className: "sheji_sofachair", role: "sequence", w: 3 },
            { className: "sheji_cnchair", role: "sequence", w: 3 },
            { className: "sheji_divider", role: "obstacle" }
        ]
    }
];

/* ------------------------------------------------------------------ */
/* 9 to 49: a shell for the shape, a theme for the furniture.

   The counts here are WEIGHTS and not amounts. The big seat falls less often
   than the two small ones because a two-tile sofa takes up twice the floor,
   and the build scales the lot to wherever the level sits on the curve. */

function dropsOf(T) {
    const d = [
        { className: T.seats[0], role: "sequence", w: 2 },
        { className: T.seats[1], role: "sequence", w: 3 },
        { className: T.seats[2], role: "sequence", w: 3 }
    ];
    if (T.decoy) d.push({ className: T.decoy, role: "decoy" });
    if (T.poi) d.push({ className: T.poi, role: "poi" });
    if (T.obstacle) d.push({ className: T.obstacle, role: "obstacle" });
    return d;
}

/* The module is a FUNCTION of furnidata, because a shell cannot lay a run
   along a wall without knowing how wide its screen is, and that is a fact
   about the furni rather than about the room. */
module.exports = function designs(meta) {
    const { THEMES, NEUTRAL } = require("./ff-levels-themes.js");
    const shells = require("./ff-levels-shells.js")(
        { at, backRun, leftRun, rightRun, queueX, queueY, facing, FRONT, LEFT, BACK, RIGHT },
        meta || {}
    );

    const generated = THEMES.map((theme, i) => {
        const T = Object.assign({}, NEUTRAL, theme);
        const shell = shells[i % shells.length];
        const room = shell.build(T);
        return {
            level: theme.level,
            id: `level-${theme.level}`,
            name: theme.name,
            model: shell.model,
            floor: theme.floor,
            wall: theme.wall,
            start: room.start,
            startDir: room.startDir,
            zoneName: room.zoneName,
            zone: room.zone,
            decor: room.decor,
            drops: dropsOf(T)
        };
    });

    return HAND.concat(generated);
};

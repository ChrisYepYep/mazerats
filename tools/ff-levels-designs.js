/* The levels themselves. tools/ff-levels-build.js turns these into documents,
   applies the difficulty curve and checks them before anything is written.

   A design says WHAT THE ROOM IS. It does not say how hard it is — the counts
   below are WEIGHTS, not amounts, and the number of pieces that actually fall
   comes from where the level sits on the curve. That way a room can be moved
   up or down the run without being redrawn.

     level      its place in the run, 1-49
     model      classic | wide | corner | steps, as the letters the client uses
     floor/wall a pattern id and a colour id out of js/room-patterns.js
     start      the tile the player begins on, and which way they look
     decor      laid out by hand: host nook, queue line, screens, planting
     zone       the gameplay area — the rectangle pieces fall into
     drops      what falls. `w` is a weight among the sequence seats; the
                obstacle, decoy and poi rows take their counts from the curve

   THE DOOR is on the left wall and the queue starts at it:
     classic (0,4)   wide (0,2)   corner (0,4)   steps (2,2)

   `queue_tile1*5` is the Knight Roller, and furnidata marks it canstandon, so
   a queue drawn out of it decorates the floor without blocking it. */

const A = "a", E = "e", B = "b", F = "f";

module.exports = [

    /* ---------------------------------------------------------------
       6. PURA LOUNGE — Wide, 10x8, door (0,2)

       The first room in the new set, so it is the plainest: one long open
       floor with the host tucked into the top-left corner behind a counter,
       and a roller queue running straight in from the door along row 2. The
       polyfon line is Habbo's most ordinary furniture and that is the point —
       level 6 should teach the shape of a room, not surprise anybody. */
    {
        level: 6, id: "level-6", name: "Pura Lounge", model: E,
        floor: { pattern: "wood", colour: 301 },
        wall: { pattern: "half1", colour: 610 },
        start: { x: 3, y: 3 }, startDir: 2,
        zoneName: "Lounge floor",
        zone: { x: 1, y: 4, w: 8, h: 4 },
        decor: [
            // host nook, top left, behind the counter
            { className: "bardesk_polyfon", x: 0, y: 0, rotation: 0, state: 0, z: 0 },
            { className: "sofachair_polyfon", x: 0, y: 1, rotation: 2, state: 0, z: 0 },
            { className: "shelves_polyfon", x: 2, y: 0, rotation: 0, state: 0, z: 0 },
            { className: "divider_arm2", x: 2, y: 1, rotation: 0, state: 0, z: 0 },
            { className: "divider_arm1", x: 4, y: 1, rotation: 0, state: 0, z: 0 },
            // the queue, in from the door at (0,2)
            { className: "queue_tile1*5", x: 1, y: 2, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 2, y: 2, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 3, y: 2, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 4, y: 2, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 5, y: 2, rotation: 0, state: 0, z: 0 },
            // screens between the queue and the floor, with the gap at x>=3
            { className: "divider_arm2", x: 0, y: 3, rotation: 0, state: 0, z: 0 },
            { className: "divider_arm1", x: 2, y: 3, rotation: 0, state: 0, z: 0 },
            // a seating group in the far corner, so the room has somewhere to
            // look that is not the drop zone
            { className: "sofa_polyfon", x: 5, y: 0, rotation: 0, state: 0, z: 0 },
            { className: "table_polyfon_small", x: 7, y: 0, rotation: 0, state: 0, z: 0 },
            { className: "lamp_armas", x: 6, y: 1, rotation: 0, state: 1, z: 0 },
            { className: "sofachair_polyfon", x: 9, y: 1, rotation: 4, state: 0, z: 0 },
            { className: "plant_yukka", x: 9, y: 0, rotation: 0, state: 0, z: 0 },
            // planting down both edges of the floor, clear of the zone
            { className: "plant_yukka", x: 0, y: 4, rotation: 0, state: 0, z: 0 },
            { className: "plant_bonsai", x: 9, y: 4, rotation: 0, state: 0, z: 0 },
            { className: "plant_pineapple", x: 0, y: 7, rotation: 0, state: 0, z: 0 },
            { className: "plant_bonsai", x: 9, y: 7, rotation: 0, state: 0, z: 0 }
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

       The Corner model has its top-left quarter cut away, which gives a room
       an arm and a hall. The arm becomes the host's gallery — sofa, screens
       and candles, looking down over the floor — and the hall below it is
       where the game happens. The queue runs east along row 4, the seam
       between the two.

       The gothic line is all seats and candlelight and no scenery to speak
       of, so the screens are Amberwood: dark wood reads as the same room. */
    {
        level: 7, id: "level-7", name: "Gothic Hall", model: B,
        floor: { pattern: "tiles3", colour: 502 },
        wall: { pattern: "gothic", colour: 3104 },
        start: { x: 3, y: 5 }, startDir: 2,
        zoneName: "The hall",
        zone: { x: 3, y: 6, w: 8, h: 4 },
        decor: [
            // the host's gallery, up in the arm
            { className: "gothic_sofa*2", x: 4, y: 0, rotation: 0, state: 0, z: 0 },
            { className: "gothiccandelabra", x: 6, y: 0, rotation: 0, state: 0, z: 0 },
            { className: "divider_arm2", x: 4, y: 1, rotation: 0, state: 0, z: 0 },
            { className: "divider_arm1", x: 6, y: 1, rotation: 0, state: 0, z: 0 },
            { className: "rare_daffodil_rug", x: 8, y: 2, rotation: 0, state: 0, z: 0 },
            // the queue, in from the door at (0,4)
            { className: "queue_tile1*5", x: 1, y: 4, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 2, y: 4, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 3, y: 4, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 4, y: 4, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 5, y: 4, rotation: 0, state: 0, z: 0 },
            // screens closing the queue off, gap at x>=3
            { className: "divider_arm2", x: 0, y: 5, rotation: 0, state: 0, z: 0 },
            { className: "divider_arm1", x: 2, y: 5, rotation: 0, state: 0, z: 0 },
            // a second group at the far end of the gallery
            { className: "gothic_sofa*2", x: 8, y: 0, rotation: 0, state: 0, z: 0 },
            { className: "divider_arm2", x: 8, y: 1, rotation: 0, state: 0, z: 0 },
            { className: "gothiccandelabra", x: 10, y: 0, rotation: 0, state: 1, z: 0 },
            { className: "gothic_chair*4", x: 10, y: 1, rotation: 4, state: 0, z: 0 },
            { className: "gothic_stool*1", x: 4, y: 3, rotation: 0, state: 0, z: 0 },
            { className: "plant_bonsai", x: 10, y: 3, rotation: 0, state: 0, z: 0 },
            // candlelight down the west wall, clear of the hall floor
            { className: "gothiccandelabra", x: 0, y: 6, rotation: 0, state: 1, z: 0 },
            { className: "gothiccandelabra", x: 0, y: 7, rotation: 0, state: 1, z: 0 },
            { className: "plant_bonsai", x: 1, y: 8, rotation: 0, state: 0, z: 0 },
            { className: "gothiccandelabra", x: 0, y: 9, rotation: 0, state: 1, z: 0 },
            { className: "gothic_stool*1", x: 2, y: 9, rotation: 0, state: 0, z: 0 }
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

       Steps is the awkward one: two rows of floor in the top right, four that
       reach further left, then the room opens out to full width at row 6. The
       shape does the work here — the host sits in the little top nub with the
       grand sofa, the queue threads east along row 2, and the game is played
       on the wide floor at the bottom, which you can only reach by coming
       down through the steps.

       Sheji is the one oriental line with a divider of its own, so the whole
       room can be dressed out of a single set. */
    {
        level: 8, id: "level-8", name: "Sheji Tearoom", model: F,
        floor: { pattern: "tiles2", colour: 407 },
        wall: { pattern: "plain", colour: 206 },
        start: { x: 5, y: 4 }, startDir: 2,
        zoneName: "Tearoom floor",
        zone: { x: 1, y: 6, w: 8, h: 4 },
        decor: [
            // the host's nub, top right
            { className: "sheji_cnsofa", x: 6, y: 0, rotation: 0, state: 0, z: 0 },
            { className: "sheji_shelves", x: 6, y: 1, rotation: 0, state: 0, z: 0 },
            { className: "hc_lmp", x: 9, y: 0, rotation: 0, state: 1, z: 0 },
            // the queue, in from the door at (2,2)
            { className: "queue_tile1*5", x: 3, y: 2, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 4, y: 2, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 5, y: 2, rotation: 0, state: 0, z: 0 },
            { className: "queue_tile1*5", x: 6, y: 2, rotation: 0, state: 0, z: 0 },
            // screens across the step, gap at x>=5
            { className: "sheji_divider", x: 2, y: 3, rotation: 0, state: 0, z: 0 },
            { className: "sheji_divider", x: 3, y: 3, rotation: 0, state: 0, z: 0 },
            { className: "sheji_divider", x: 4, y: 3, rotation: 0, state: 0, z: 0 },
            // the tea table, on the middle step
            { className: "sheji_sofachair", x: 8, y: 1, rotation: 4, state: 0, z: 0 },
            { className: "sheji_shelves", x: 2, y: 5, rotation: 0, state: 0, z: 0 },
            { className: "sheji_cnchair", x: 8, y: 4, rotation: 4, state: 0, z: 0 },
            { className: "sheji_cnchair", x: 9, y: 3, rotation: 4, state: 0, z: 0 },
            // planting and lamps down both edges, clear of the floor below
            { className: "plant_bonsai", x: 0, y: 6, rotation: 0, state: 0, z: 0 },
            { className: "plant_pineapple", x: 0, y: 7, rotation: 0, state: 0, z: 0 },
            { className: "plant_yukka", x: 0, y: 9, rotation: 0, state: 0, z: 0 },
            { className: "hc_lmp", x: 9, y: 6, rotation: 0, state: 1, z: 0 },
            { className: "hc_lmp", x: 9, y: 8, rotation: 0, state: 1, z: 0 },
            { className: "plant_yukka", x: 9, y: 9, rotation: 0, state: 0, z: 0 }
        ],
        drops: [
            { className: "sheji_cnsofa", role: "sequence", w: 1 },
            { className: "sheji_sofachair", role: "sequence", w: 3 },
            { className: "sheji_cnchair", role: "sequence", w: 3 },
            { className: "sheji_divider", role: "obstacle" }
        ]
    }
];

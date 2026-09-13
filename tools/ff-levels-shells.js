/* THE SHELLS: the shape of a room, with the furniture left out.

   These were derived from levels 6, 7 and 8 and then REWRITTEN against 6 to
   14 after those were gone over by hand. What the hand-tuning changed, and
   what every shell below now does:

     THE QUEUE GOES WALL     Not x1 to x8 of a ten-wide room with the corners
     TO WALL.                left bare. Every tile of the row, the door tile
                             included — you step out of the door onto the
                             first roller.
     THE QUEUE CAN RUN       Levels 12 and 14 turn it ninety degrees and send
     DOWN THE ROOM.          it down the long axis, which makes a queue twice
                             the length and leaves the bulk of the room as
                             floor. Three of the shells below do that now.
     A RUN IS BOOKENDED      `cabin_divider_arm1` is a Corner Post and it
     WITH POSTS.             belongs at each END of a screen run, not only
                             where two runs meet. A run with bare ends reads
                             as a fence that fell over.
     THE GATE IS THE LAST    Not one in from the end with the plinth outside
     TILE OF THE RUN.        it. Screens fill the middle, and whatever tile
                             is left before the gate becomes its post — which
                             is exactly how level 7 reads.
     THE HOST SITS AT THE    So they are beside the way in. The tall furni
     GATE END.               goes to the FAR end, along the back wall, where
                             it draws behind everything.
     THE FLOOR IS MOST OF    The zones went from a quarter of the room to a
     THE ROOM.               half or better. An eight-by-four arena is not
                             what the game is played on.

   NOTHING HERE ASSUMES A WIDTH. A sofa is two tiles in most lines, three in
   Sheji and Executive, and the grunge mattress is three as well; a run laid
   "one along" puts one piece of furniture through another and, at the end of
   a wall, off the edge of the room. Every run is packed from the real
   footprint, which is why the shells are a function of furnidata.

   THE DOOR is on the left wall:  classic (0,4)  wide (0,2)  corner (0,4)
   steps (2,2), because the Steps mask has no floor at x0 or x1 on that row. */

"use strict";

module.exports = function makeShells(H, meta) {
    const { at, leftRun, queueX, queueY, facing, FRONT, LEFT, BACK, RIGHT } = H;

    /* How wide a piece is laid across a room, in tiles. */
    const wide = (cls) => Math.max(1, Number((meta[cls] || {}).x) || 1);

    /* Screens laid end to end from x0 to x1, with any tile they cannot pair
       up placed HALFWAY along rather than at the end — at the end it lands
       beside the closing cap and you get two posts touching; halfway it reads
       as a pilaster, which is what level 9's wall does. */
    function fill(T, x0, x1, y) {
        const out = [];
        const w = wide(T.screen);
        const span = x1 - x0 + 1;
        const screens = Math.floor(span / w);
        const spareAfter = span % w ? Math.ceil(screens / 2) : -1;
        let x = x0;
        for (let i = 0; i < screens; i++) {
            if (i === spareAfter) { out.push(odd(T, x, y)); x += 1; }
            out.push(at(T.screen, x, y, facing(T.screen, FRONT)));
            x += w;
        }
        while (x <= x1) { out.push(odd(T, x, y)); x += 1; }
        return out;
    }
    /* What goes on a tile too narrow for a screen: the line's post if it has
       one, otherwise its gate piece, which is the same width and the same
       set. */
    const odd = (T, x, y) => at(T.corner || T.gate, x, y, facing(T.corner || T.gate, FRONT));

    const post = (T, x, y) => at(T.corner, x, y, facing(T.corner, FRONT));

    /* A BARRIER ACROSS THE ROOM, x0 to x1 inclusive: a corner post, screens
       filling the middle, and either the gate or another post at the far end.
       Any tile the screens cannot pair up becomes a post, which is why an
       eleven-wide room comes out as post, four screens, post, gate — the way
       level 7 was rebuilt — with no special case for it. */
    function wall(T, x0, x1, y, gate) {
        /* With no post the run simply reaches the wall at both ends, which is
           how levels 19 and 20 are built. The caps are decoration, not
           structure, and inventing one out of a plant is what put a hedge in
           every room. */
        if (!T.corner) {
            const out = [];
            const lo = gate === "low" ? x0 + 1 : x0;
            const hi = gate === "high" ? x1 - 1 : x1;
            if (gate === "low") out.push(at(T.gate, x0, y, facing(T.gate, FRONT)));
            out.push(...fill(T, lo, hi, y));
            if (gate === "high") out.push(at(T.gate, x1, y, facing(T.gate, FRONT)));
            return out;
        }
        const cap = (x, isGate) => (isGate
            ? at(T.gate, x, y, facing(T.gate, FRONT))
            : post(T, x, y));
        const out = [cap(x0, gate === "low")];
        out.push(...fill(T, x0 + 1, x1 - 1, y));
        out.push(cap(x1, gate === "high"));
        return out;
    }

    /* The same thing running DOWN the room, y0 to y1. The screens turn with
       it — a 2x1 becomes 1x2 — so the step is the footprint, not one tile. */
    function wallDown(T, x, y0, y1, gate) {
        const out = [at(gate === "low" ? T.gate : T.corner, x, y0,
            facing(gate === "low" ? T.gate : T.corner, LEFT))];
        const w = wide(T.screen);
        for (let y = y0 + 1; y <= y1 - 1;) {
            if (y1 - 1 - y + 1 >= w) { out.push(at(T.screen, x, y, facing(T.screen, LEFT))); y += w; }
            else { out.push(at(T.corner, x, y, facing(T.corner, LEFT))); y += 1; }
        }
        const end = gate === "high" ? T.gate : T.corner;
        out.push(at(end, x, y1, facing(end, LEFT)));
        return out;
    }

    /* HOW MANY LIGHTS AND PLANTS A ROOM IS ALLOWED, counted for the room and
       not decided at each place that wants one. Two lamps and three plants,
       which is what the hand-built levels use. */
    function dresser(T) {
        let lamps = 0, plants = 0;
        const lamp = (x, y) => (lamps++ < 2 ? [at(T.lamp, x, y, 0, { state: 1 })] : []);
        const plant = (x, y) => (T.plant && plants++ < 3 ? [at(T.plant, x, y)] : []);

        /* The host's seating, packed end to end from x0 and never past x1,
           and the rest of that stretch of wall planted. */
        function booth(which, x0, x1, y) {
            const out = [];
            let x = x0;
            for (const i of which) {
                const c = T.seats[i], w = wide(c);
                if (x + w - 1 > x1) break;
                out.push(at(c, x, y, facing(c, BACK)));
                x += w;
            }
            /* Whatever is left of that stretch of wall gets the line's corner
               piece, not a plant. A palm is 141px and three of them along a
               back wall is a hedge — which is the note this has been given
               twice, and filling leftovers was where it kept creeping back
               in. The corner pieces are all short and all belong to the set
               the room is dressed from. */
            for (; x <= x1; x++) out.push(at(T.corner, x, y, facing(T.corner, FRONT)));
            return out;
        }

        /* The tall furni along a back wall. A line with no shelving gets
           planted instead, from the far corner inwards. */
        function tallRow(x0, x1, y) {
            if (T.tall) {
                const out = []; const w = wide(T.tall);
                let x = x0;
                for (; x + w - 1 <= x1; x += w) out.push(at(T.tall, x, y, facing(T.tall, BACK)));
                // and whatever the bookcases cannot divide, so the wall is full
                for (; x <= x1; x++) out.push(at(T.corner, x, y, facing(T.corner, FRONT)));
                return out;
            }
            return plant(x1, y);        // one, at the corner — not a hedge
        }

        const tallLeft = (x, y) => (T.tall ? leftRun(T.tall, x, y, 1, 2) : lamp(x, y));

        /* z is the height it sits at, so 1 puts it on top of whatever the
           tile already holds rather than colliding with it. */
        const trinket = (x, y) => (T.trinket ? [at(T.trinket, x, y, 0, { z: 1 })] : []);

        return { lamp, plant, booth, tallRow, tallLeft, trinket };
    }

    /* ---------------------------------------------------------------
       1. WIDE, 10x8, door (0,2). Bookcases at the far end, the hosts beside
       the gate, the queue the full width of the room, and half the room as
       floor. This is level 13's plan. */
    function wideRoom(T) {
        const d = dresser(T);
        return {
            zoneName: "The floor", zone: { x: 0, y: 4, w: 10, h: 4 },
            start: { x: 9, y: 4 }, startDir: 3,
            decor: [
                ...d.tallRow(0, 3, 0),
                ...d.lamp(4, 0),
                ...d.booth([0, 1, 2], 5, 8, 0),
                ...d.plant(9, 0),
                ...d.trinket(1, 1),
                ...wall(T, 0, 9, 1, null),
                ...queueX(T, 0, 2, 10),
                ...wall(T, 0, 9, 3, "high"),
                ...d.lamp(0, 7)
            ]
        };
    }

    /* The same room with the booth at the other end. The GATE does not move:
       the door is at (0,2) and the queue runs away from it, so a gate at the
       left-hand end would have the line walking backwards to reach it — which
       is what this shell did until level 21 was drawn and the mistake was
       obvious. Only the furniture swaps ends. */
    function wideRoomMirror(T) {
        const d = dresser(T);
        return {
            zoneName: "The floor", zone: { x: 0, y: 4, w: 10, h: 4 },
            start: { x: 9, y: 4 }, startDir: 3,
            decor: [
                ...d.booth([0, 1, 2], 0, 3, 0),
                ...d.lamp(4, 0),
                ...d.tallRow(5, 9, 0),
                ...d.trinket(1, 1),
                ...wall(T, 0, 9, 1, null),
                ...queueX(T, 0, 2, 10),
                ...wall(T, 0, 9, 3, "high"),
                ...d.lamp(0, 7)
            ]
        };
    }

    /* ---------------------------------------------------------------
       2. CLASSIC, 8x13, door (0,4). The queue is a corridor with a barrier
       on BOTH sides — the booth's front at row 3 and the arena's wall at row
       5 — which is what level 10 turned into. Seven rows of floor. */
    function classicRoom(T) {
        const d = dresser(T);
        return {
            zoneName: "The floor", zone: { x: 0, y: 6, w: 8, h: 7 },
            start: { x: 7, y: 6 }, startDir: 3,
            decor: [
                /* The bookcase is TURNED and stands against the left-hand
                   wall, which is how level 18 was rebuilt: Classic is only
                   eight wide, and a bookcase laid across the back eats half
                   the seating the booth has room for. */
                ...d.tallLeft(0, 0),
                ...d.plant(1, 0),
                ...d.booth([0, 1, 2], 2, 6, 0),
                ...d.plant(7, 0),
                ...d.lamp(1, 1),
                ...d.lamp(7, 1),
                ...d.trinket(1, 3),
                ...wall(T, 0, 7, 3, null),
                ...queueX(T, 0, 4, 8),
                ...wall(T, 0, 7, 5, "high")
            ]
        };
    }

    /* ---------------------------------------------------------------
       3. CORNER, 11x10, door (0,4). The cut-away quarter makes the top of
       the room an arm and that is the booth. Level 7's plan. */
    function cornerRoom(T) {
        const d = dresser(T);
        return {
            zoneName: "The floor", zone: { x: 0, y: 6, w: 11, h: 4 },
            start: { x: 10, y: 6 }, startDir: 3,
            decor: [
                ...d.tallRow(4, 5, 0),
                ...d.booth([0, 1, 2], 6, 9, 0),
                ...d.lamp(10, 0),
                // a runner of mats down the booth, the way level 19 has it
                ...Array.from({ length: 7 }, (_, i) => at(T.mat, 4 + i, 1, 0)),
                /* and the booth's front wall at row 3, not row 1 — which
                   gives the hosts a room to stand in rather than a ledge. */
                ...d.trinket(5, 3),
                ...wall(T, 4, 10, 3, null),
                ...queueX(T, 0, 4, 11),
                ...wall(T, 0, 10, 5, "high"),
                ...d.lamp(0, 6),
                ...d.plant(0, 9)
            ]
        };
    }

    /* ---------------------------------------------------------------
       4. STEPS, 10x10, door (2,2). The nub at the top is the booth, the
       queue crosses the middle terrace, the floor is the bottom four rows
       across the full width. */
    function stepsRoom(T) {
        const d = dresser(T);
        return {
            /* x0 and x1 have no floor on rows 4 and 5 — the Steps mask cuts
               them away — so the zone starts at x2 and is a rectangle that is
               entirely floor. 48 tiles, against the 32 it used to be. */
            zoneName: "The floor", zone: { x: 2, y: 4, w: 8, h: 6 },
            start: { x: 9, y: 4 }, startDir: 3,
            decor: [
                ...d.plant(6, 0),
                ...d.booth([0], 7, 9, 0),
                ...d.trinket(7, 1),
                ...wall(T, 6, 9, 1, null),
                ...queueX(T, 2, 2, 8),
                /* The wall comes up to row 3, so the middle terrace is floor
                   too and the arena is six rows rather than four — level 20's
                   zone, which is half again the size of what was here. */
                ...wall(T, 2, 9, 3, "high"),
                ...d.tallLeft(0, 6),
                ...d.lamp(1, 6),
                ...d.plant(1, 7)
            ]
        };
    }

    /* ---------------------------------------------------------------
       5. CLASSIC, THE LONG WAY. Level 14's plan: the queue runs the whole
       thirteen rows down the left-hand wall, the barrier beside it, and the
       gate at the very bottom. Six columns by eleven rows of floor, which is
       more than twice what the across-the-room version gives. */
    function classicLong(T) {
        const d = dresser(T);
        return {
            /* Level 14's plan. The queue starts BELOW the booth rather than
               beside it, which frees the whole eight-tile back wall for
               seating — the version this replaced gave the booth three tiles
               and left the room looking unfurnished next to sixty-six tiles
               of floor. */
            zoneName: "The floor", zone: { x: 2, y: 3, w: 6, h: 10 },
            start: { x: 2, y: 12 }, startDir: 2,
            decor: [
                ...d.tallLeft(0, 0),
                ...d.booth([0, 1, 2], 1, 6, 0),
                ...d.lamp(7, 0),
                ...d.trinket(1, 2),
                ...wall(T, 0, 7, 2, null),
                ...queueY(T, 0, 3, 10),
                ...wallDown(T, 1, 3, 12, "high"),
                /* Both of these go at the BACK of the floor. (7,12) is the
                   frontmost tile in a Classic room and a 141px palm standing
                   there is drawn over the entire game. */
                ...d.lamp(7, 3),
                ...d.plant(2, 3)
            ]
        };
    }

    /* ---------------------------------------------------------------
       6. STEPS, THE LONG WAY. Level 12's plan: the queue turns at the door
       and runs down the second column, the barrier beside it, the gate at
       the bottom, and everything to the right of it is floor. */
    function stepsLong(T) {
        const d = dresser(T);
        return {
            zoneName: "The floor", zone: { x: 4, y: 2, w: 6, h: 8 },
            start: { x: 4, y: 9 }, startDir: 2,
            decor: [
                ...d.booth([0, 1, 2], 6, 8, 0),
                ...d.lamp(9, 0),
                ...d.trinket(7, 1),
                ...wall(T, 6, 9, 1, null),
                ...queueY(T, 2, 2, 8),
                ...wallDown(T, 3, 2, 9, "high"),
                ...d.lamp(4, 2),
                ...d.tallLeft(0, 6),
                ...d.plant(0, 9)
            ]
        };
    }

    /* ---------------------------------------------------------------
       7. CORNER, THE BIG L. Level 11's plan, and the cleverest of them: the
       queue is a three-tile stub in the top-left of the lower block, the
       gate opens straight into the room, and the WHOLE of the rest — the arm
       included — is floor. Seventy tiles. The hosts get the pocket the queue
       leaves behind, shut in by the barrier on two sides. */
    function cornerBigL(T) {
        const d = dresser(T);
        return {
            zoneName: "The floor", zone: { x: 4, y: 0, w: 7, h: 10 },
            start: { x: 4, y: 4 }, startDir: 2,
            decor: [
                /* The arm is floor, so its back wall is the only place in
                   that half of the room anything can stand. Leaving it to two
                   bookcases left twenty-one tiles of void between the hosts'
                   pocket and the rest of the room; the big seat goes here. */
                ...d.tallRow(4, 5, 0),
                ...d.booth([0], 6, 8, 0),
                ...d.lamp(9, 0),
                ...d.plant(10, 0),
                ...queueX(T, 0, 4, 3),
                at(T.gate, 3, 4, facing(T.gate, LEFT)),
                ...d.trinket(1, 5),
                ...wall(T, 0, 3, 5, null),
                ...wallDown(T, 3, 6, 9, null),
                ...d.lamp(10, 3),
                at(T.seats[1], 0, 7, facing(T.seats[1], LEFT)),
                at(T.seats[2], 0, 8, facing(T.seats[2], LEFT)),
                ...d.plant(0, 9)
            ]
        };
    }

    /* The rotation. Eight shapes over four layouts, each layout twice — once
       across the room and once down it, or once at each end — so no two
       consecutive levels share a plan and nothing repeats inside eight. */
    return [
        { model: "e", build: wideRoom },
        { model: "a", build: classicRoom },
        { model: "b", build: cornerRoom },
        { model: "f", build: stepsRoom },
        { model: "e", build: wideRoomMirror },
        { model: "a", build: classicLong },
        { model: "b", build: cornerBigL },
        { model: "f", build: stepsLong }
    ];
};

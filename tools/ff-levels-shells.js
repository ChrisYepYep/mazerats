/* THE SHELLS: the shape of a room, with the furniture left out.

   Levels 6, 7 and 8 were drawn tile by tile and then sent back three times,
   and what came out of that is a structure rather than three rooms. Every one
   of them is the same thing:

       the back of the room   the host's seats, a light, the tall furni,
                              behind a screen run that shuts the booth off
                              from everything in front of it
       one row of rollers     starting on the tile in front of the door,
                              pointing the way they are laid
       one wall               screens along its length, the gate at the far
                              end beside the corner plinth
       the floor              empty, which is the whole point of it

   Writing that out forty-one more times by hand would have got forty-one
   more chances to put a bookcase at the front of the room. So it is written
   once per layout here, twice where the gate can sensibly go at either end,
   and the furni comes from ff-levels-themes.js.

   NOTHING HERE ASSUMES A WIDTH. A sofa is two tiles in most lines, three in
   Sheji and Executive, and the grunge mattress is three as well; a shell that
   puts the next chair "one along" lays one piece of furniture through another
   and, at the end of a wall, off the edge of the room. Every run below is
   packed from the real footprint in furnidata.

   Each shell returns decor, the zone, and where the avatar starts — which is
   always the tile inside the floor directly under the gate.

   THE DOOR is on the left wall:  classic (0,4)  wide (0,2)  corner (0,4)
   steps (2,2), because the Steps mask has no floor at x0 or x1 on that row. */

"use strict";

module.exports = function makeShells(H, meta) {
    const { at, leftRun, queueX, facing, BACK } = H;

    /* How wide a piece is laid across a room, in tiles. */
    const wide = (cls) => Math.max(1, Number((meta[cls] || {}).x) || 1);

    /* A run of `cls` filling x0..x1 inclusive, falling back to the 1x1
       `narrow` for a remainder too small for another whole piece. */
    function span(cls, narrow, x0, x1, y, extra) {
        const out = [];
        const w = wide(cls);
        for (let x = x0; x <= x1;) {
            const fits = x1 - x + 1 >= w;
            const c = fits ? cls : narrow;
            out.push(at(c, x, y, facing(c, BACK), extra));
            x += fits ? w : 1;
        }
        return out;
    }

    /* HOW MANY LIGHTS AND PLANTS A ROOM IS ALLOWED, counted for the room and
       not decided at each place that wants one. Every shell below has half a
       dozen spots where a lamp or a plant would look right, and saying yes at
       each of them is how the draft before this one ended up with five lit
       candelabra and four bonsais in a single gothic hall. Two lamps and
       three plants — which is what level 5, built by hand, uses. */
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
            for (; x <= x1; x++) out.push(...plant(x, y));
            return out;
        }

        /* The tall furni along a back wall. A line with no shelving — summer,
           picnic, the cushion rooms — gets planted instead, from the far
           corner inwards, so what little there is gathers at the end of the
           wall rather than stranding one plant in the middle of it. */
        function tallRow(x0, x1, y) {
            if (T.tall) return span(T.tall, T.plant || T.narrow, x0, x1, y);
            const out = [];
            for (let x = x1; x >= x0; x--) out.push(...plant(x, y));
            return out;
        }

        /* The corner of the floor: the tall furni if it goes down the left
           wall, otherwise a light. */
        const tallLeft = (x, y) => (T.tall ? leftRun(T.tall, x, y, 1, 2) : lamp(x, y));

        return { lamp, plant, booth, tallRow, tallLeft };
    }

    /* ---------------------------------------------------------------
       WIDE, 10x8, door (0,2). Two rows of booth, the queue, the wall,
       and four rows of floor. */
    function wideRoom(T, mirror) {
        const d = dresser(T);
        const zone = { x: 0, y: 4, w: 10, h: 4 };
        if (!mirror) {
            return {
                zoneName: "The floor", zone, start: { x: 8, y: 4 }, startDir: 2,
                decor: [
                    ...d.booth([0, 1, 2], 0, 4, 0),
                    ...d.lamp(5, 0),
                    ...d.tallRow(6, 9, 0),
                    ...span(T.screen, T.narrow, 0, 5, 1),     // the booth's front
                    ...queueX(1, 2, 8),
                    ...span(T.screen, T.narrow, 0, 7, 3),
                    at(T.gate, 8, 3),
                    at(T.corner, 9, 3),
                    ...d.lamp(9, 7)                           // the far corner of the floor
                ]
            };
        }
        return {
            zoneName: "The floor", zone, start: { x: 1, y: 4 }, startDir: 2,
            decor: [
                ...d.tallRow(0, 3, 0),
                ...d.lamp(4, 0),
                ...d.booth([0, 1, 2], 5, 9, 0),
                ...span(T.screen, T.narrow, 4, 9, 1),
                ...queueX(1, 2, 8),
                at(T.corner, 0, 3),
                at(T.gate, 1, 3),
                ...span(T.screen, T.narrow, 2, 9, 3),
                ...d.lamp(0, 7)
            ]
        };
    }

    /* ---------------------------------------------------------------
       CLASSIC, 8x13, door (0,4). The deepest room, so the floor is seven
       rows and the booth gets a landing in front of it. */
    function classicRoom(T, mirror) {
        const d = dresser(T);
        const zone = { x: 0, y: 6, w: 8, h: 7 };
        if (!mirror) {
            return {
                zoneName: "The floor", zone, start: { x: 6, y: 6 }, startDir: 2,
                decor: [
                    ...d.lamp(0, 0),
                    ...d.tallRow(2, 7, 0),
                    ...d.booth([0, 1, 2], 1, 6, 1),
                    ...span(T.screen, T.narrow, 1, 6, 2),
                    ...queueX(1, 4, 7),
                    ...span(T.screen, T.narrow, 0, 5, 5),
                    at(T.gate, 6, 5),
                    at(T.corner, 7, 5),
                    ...d.lamp(0, 12)
                ]
            };
        }
        return {
            zoneName: "The floor", zone, start: { x: 1, y: 6 }, startDir: 2,
            decor: [
                ...d.tallRow(0, 5, 0),
                ...d.lamp(7, 0),
                ...d.booth([0, 1, 2], 1, 6, 1),
                ...span(T.screen, T.narrow, 1, 6, 2),
                ...queueX(1, 4, 7),
                at(T.corner, 0, 5),
                at(T.gate, 1, 5),
                ...span(T.screen, T.narrow, 2, 7, 5),
                ...d.lamp(0, 12)
            ]
        };
    }

    /* ---------------------------------------------------------------
       CORNER, 11x10, door (0,4). The cut-away quarter makes the top of the
       room an arm, x4 to x10, and that is the booth. */
    function cornerRoom(T, mirror) {
        const d = dresser(T);
        const zone = { x: 0, y: 6, w: 11, h: 4 };
        if (!mirror) {
            return {
                zoneName: "The floor", zone, start: { x: 9, y: 6 }, startDir: 2,
                decor: [
                    ...d.tallRow(4, 5, 0),
                    ...d.booth([0, 1, 2], 6, 9, 0),
                    ...d.lamp(10, 0),
                    ...span(T.screen, T.narrow, 4, 9, 1),
                    at(T.corner, 10, 1),
                    ...queueX(1, 4, 8),
                    at(T.corner, 0, 5),
                    ...span(T.screen, T.narrow, 1, 8, 5),
                    at(T.gate, 9, 5),
                    at(T.corner, 10, 5),
                    ...d.lamp(0, 6),
                    ...d.plant(0, 9)
                ]
            };
        }
        return {
            zoneName: "The floor", zone, start: { x: 1, y: 6 }, startDir: 2,
            decor: [
                ...d.tallRow(4, 9, 0),
                ...d.lamp(10, 0),
                ...d.booth([0, 1, 2], 4, 9, 1),
                ...span(T.screen, T.narrow, 4, 9, 2),
                at(T.corner, 10, 2),
                ...queueX(1, 4, 8),
                at(T.corner, 0, 5),
                at(T.gate, 1, 5),
                ...span(T.screen, T.narrow, 2, 9, 5),
                at(T.corner, 10, 5),
                ...d.lamp(0, 6),
                ...d.plant(0, 9)
            ]
        };
    }

    /* ---------------------------------------------------------------
       STEPS, 10x10, door (2,2). Three terraces: a nub at the top for the
       booth, a landing, and the floor across the full width at row 6. The
       tall furni goes down the LEFT wall here, which is the one direction
       Sheji's bookcase ships and the right place for any of them. */
    function stepsRoom(T, mirror) {
        const d = dresser(T);
        const zone = { x: 0, y: 6, w: 10, h: 4 };
        if (!mirror) {
            return {
                zoneName: "The floor", zone, start: { x: 8, y: 6 }, startDir: 2,
                decor: [
                    ...d.booth([0], 6, 8, 0),
                    ...d.lamp(9, 0),
                    ...span(T.screen, T.narrow, 6, 9, 1),
                    ...queueX(3, 2, 6),
                    ...d.plant(2, 3),
                    ...d.booth([1, 2], 3, 6, 3),
                    ...span(T.screen, T.narrow, 2, 7, 5),
                    at(T.gate, 8, 5),
                    ...d.lamp(9, 5),
                    ...d.tallLeft(0, 6),
                    ...d.plant(0, 9)
                ]
            };
        }
        return {
            zoneName: "The floor", zone, start: { x: 3, y: 6 }, startDir: 2,
            decor: [
                ...d.lamp(6, 0),
                ...d.booth([0], 7, 9, 0),
                ...span(T.screen, T.narrow, 6, 9, 1),
                ...queueX(3, 2, 6),
                ...d.booth([1, 2], 2, 4, 3),
                ...d.plant(5, 3),
                ...d.lamp(2, 5),
                at(T.gate, 3, 5),
                ...span(T.screen, T.narrow, 4, 9, 5),
                ...d.tallLeft(0, 6),
                ...d.plant(0, 9)
            ]
        };
    }

    /* The rotation. Four layouts, each one twice — gate to the right, then
       gate to the left — so no two consecutive levels share a shape and
       nothing repeats inside eight. */
    return [
        { model: "e", build: (T) => wideRoom(T, false) },
        { model: "a", build: (T) => classicRoom(T, false) },
        { model: "b", build: (T) => cornerRoom(T, false) },
        { model: "f", build: (T) => stepsRoom(T, false) },
        { model: "e", build: (T) => wideRoom(T, true) },
        { model: "a", build: (T) => classicRoom(T, true) },
        { model: "b", build: (T) => cornerRoom(T, true) },
        { model: "f", build: (T) => stepsRoom(T, true) }
    ];
};

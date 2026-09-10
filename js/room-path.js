/* Walking from one tile to another.

   A* over the 104-tile grid, eight-connected because Habbo avatars walk
   diagonally and a four-connected path up a room reads as a staircase that
   nobody would ever choose to walk.

   Two rules the original enforced and this one does too:

   - No cutting corners. A diagonal step is only legal if BOTH orthogonal
     tiles beside it are clear. Without this an avatar slips through the gap
     between two furni placed corner to corner, which in Fallin' Furni would
     mean obstacles can be walked straight past.

   - The destination may be occupied even when the route to it is not. Sitting
     on a seat means walking ONTO the seat's tile, so the goal tile is treated
     as walkable whatever is standing on it, while every tile on the way there
     is not. */
(function () {
    "use strict";

    const { COLS, ROWS } = window.RoomIso;

    /* Habbo's eight directions. The index IS the facing value handed to the
       avatar renderer, so this table is both the neighbour list and the
       direction lookup.

           0 NE   1 E   2 SE   3 S(toward the viewer)
           4 SW   5 W   6 NW   7 N(away from the viewer)

       TWICE WRONG BEFORE THIS, and the second time is the instructive one.

       The first version was a quarter turn out and the figure plainly walked
       backwards. The second was a MIRROR — every direction correct about the
       north-south axis and reversed about the east-west one. That is far
       harder to see: walking toward the viewer and away from it both looked
       perfect, and only the six other headings were reversed.

       Both wrong versions came from the same method — rendering the eight
       sprites and judging by eye which way each figure was pointing. A small
       pixel figure in three-quarter view does not reliably tell you that, and
       reading a mirrored sprite as correct is exactly the mistake it invites.
       This table instead comes from observed behaviour in the room: moving
       up-and-right walked facing up-and-left, up-and-left faced up-and-right,
       and so on, with straight toward-the-viewer and straight away both
       correct — which is the signature of a mirror about north-south, and
       fixes every entry by d -> (6 - d) mod 8.

       If this ever needs checking again, check it that way. Do not check it by
       looking at the sprites. */
    const DIRS = [
        { dx: 0, dy: -1 },     // 0  NE
        { dx: 1, dy: -1 },     // 1  E
        { dx: 1, dy: 0 },      // 2  SE
        { dx: 1, dy: 1 },      // 3  S, facing the viewer
        { dx: 0, dy: 1 },      // 4  SW
        { dx: -1, dy: 1 },     // 5  W
        { dx: -1, dy: 0 },     // 6  NW
        { dx: -1, dy: -1 }     // 7  N, facing away
    ];

    const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

    function directionOf(fromX, fromY, toX, toY) {
        const dx = Math.sign(toX - fromX), dy = Math.sign(toY - fromY);
        const i = DIRS.findIndex(d => d.dx === dx && d.dy === dy);
        return i === -1 ? 2 : i;
    }

    /* Octile distance: the true cost of an eight-connected walk with diagonals
       priced at sqrt(2), so it never overestimates and A* stays optimal. */
    function heuristic(ax, ay, bx, by) {
        const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
        return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    }

    /* `blocked(x, y)` answers whether a tile cannot be walked THROUGH.
       Returns an array of {x, y, dir} steps beginning with the first tile
       moved onto, or null if there is no route. */
    function findPath(start, goal, blocked) {
        if (!inside(goal.x, goal.y)) return null;
        if (start.x === goal.x && start.y === goal.y) return [];

        const key = (x, y) => y * COLS + x;
        const goalKey = key(goal.x, goal.y);

        const g = new Map([[key(start.x, start.y), 0]]);
        const cameFrom = new Map();
        const open = [{ x: start.x, y: start.y, f: heuristic(start.x, start.y, goal.x, goal.y) }];
        const closed = new Set();

        while (open.length) {
            // The grid is 104 tiles; a linear scan for the best node costs
            // less than maintaining a heap would.
            let bi = 0;
            for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
            const cur = open.splice(bi, 1)[0];
            const ck = key(cur.x, cur.y);
            if (ck === goalKey) break;
            if (closed.has(ck)) continue;
            closed.add(ck);

            for (const d of DIRS) {
                const nx = cur.x + d.dx, ny = cur.y + d.dy;
                if (!inside(nx, ny)) continue;
                const nk = key(nx, ny);
                if (closed.has(nk)) continue;

                // The goal itself is enterable even when occupied; nothing else is.
                if (nk !== goalKey && blocked(nx, ny)) continue;

                if (d.dx !== 0 && d.dy !== 0) {
                    // No squeezing between two diagonally touching blockers.
                    if (blocked(cur.x + d.dx, cur.y) || blocked(cur.x, cur.y + d.dy)) continue;
                }

                const step = (d.dx !== 0 && d.dy !== 0) ? Math.SQRT2 : 1;
                const tentative = g.get(ck) + step;
                if (g.has(nk) && tentative >= g.get(nk)) continue;

                g.set(nk, tentative);
                cameFrom.set(nk, { x: cur.x, y: cur.y });
                open.push({ x: nx, y: ny, f: tentative + heuristic(nx, ny, goal.x, goal.y) });
            }
        }

        if (!cameFrom.has(goalKey) && goalKey !== key(start.x, start.y)) return null;

        const path = [];
        let node = { x: goal.x, y: goal.y };
        while (!(node.x === start.x && node.y === start.y)) {
            const prev = cameFrom.get(key(node.x, node.y));
            if (!prev) return null;
            path.push({ x: node.x, y: node.y, dir: directionOf(prev.x, prev.y, node.x, node.y) });
            node = prev;
        }
        path.reverse();
        return path;
    }

    window.RoomPath = { DIRS, findPath, directionOf, heuristic, inside };
})();

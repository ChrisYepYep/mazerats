/* Walking from one tile to another.

   A* over the 104-tile grid, eight-connected because Habbo avatars walk
   diagonally and a four-connected path up a room reads as a staircase that
   nobody would ever choose to walk.

   Three rules, and the first two are about what a route COSTS rather than
   what it looks like — see the long note above `stepCost`.

   - Every step costs the same, because every step takes the same time. The
     quickest route is the one with the fewest tiles, not the one that is
     shortest with a ruler.

   - Ties break toward taking the DIAGONAL steps first, because that is what
     the real client does — measured, not guessed. Habbo sent from (3,3) to
     (7,11) walks four diagonals and then four straight, and from (7,5) to
     (3,3) it walks two diagonals and then two straight.

   - Corners may be cut past ONE obstacle but not two. A diagonal is refused
     only when both tiles beside it are blocked, which is what seals the gap
     between two furni placed corner to corner — the blocking trick players
     actually use — while leaving a single chair something you can walk around
     rather than a cross-shaped no-go zone.

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

    /* COST IS STEPS, NOT DISTANCE, and that is the whole point.

       This used to price a diagonal at sqrt(2) and a straight at 1 — octile
       distance, the geometrically honest answer. It is the wrong question. An
       avatar crosses one tile in WALK_MS whichever way it goes, so what costs
       a player time is the NUMBER of steps, and a route that is shorter on a
       ruler can be slower to walk.

       The two disagree often. Four diagonal steps measure 5.66 against five
       straight ones at 5.00, so octile took the five-step route every time:
       geometrically shorter, a whole step slower, and visibly the long way
       round. Pricing every step at 1 and measuring the remainder in Chebyshev
       distance — max(dx, dy), which is exactly the fewest moves an
       eight-connected walk can take — asks for the quickest route instead.

       WHICH shortest route, though, still has to be decided, and the obvious
       answer is wrong. Making diagonals fractionally cheaper so that routes
       with more of them win produces a WEAVE: walking six tiles straight up
       becomes three steps up-left and three up-right, same six steps, all of
       them diagonal and every one of them cheaper. Six diagonals beat six
       straights on that arithmetic, so the avatar zigzags to a destination
       directly in front of it.

       WHICH of the equally short routes, then. This was settled by watching
       the real client rather than reasoning about it. Sent from tile (7,5) to
       (3,3) with a chair on the line, Habbo walked

           (6,4)  (5,3)  (4,3)  (3,3)

       — four steps, and both DIAGONALS TAKEN FIRST, then two straight. An
       earlier tie-break here hugged the straight line between start and goal
       and produced (6,5) (5,5) (4,4) (3,3): same length, same destination,
       visibly not the same walk.

       So ties break on how many diagonal steps are still OWED — min(dx, dy)
       to the goal. A diagonal reduces both axes and so reduces that number;
       a straight step does not. Taking them early is therefore cheaper by a
       hair, and the route front-loads its diagonals the way Habbo's does.

       This also happens to kill the weave that a plain "prefer diagonals"
       bonus caused: walking six tiles straight up owes no diagonals at all
       (min is zero the whole way), so there is nothing to gain by zigzagging
       and the avatar walks straight. */
    const stepCost = () => 1;

    function heuristic(ax, ay, bx, by) {
        return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    }

    // Diagonal steps still owed on the way to the goal.
    const owed = (x, y, goal) => Math.min(Math.abs(x - goal.x), Math.abs(y - goal.y));
    const OWED = 0.001;

    /* `blocked(x, y)` answers whether a tile cannot be walked THROUGH.
       Returns an array of {x, y, dir} steps beginning with the first tile
       moved onto, or null if there is no route. */
    /* `enterGoal` says whether the destination may be walked into when it is
       occupied — true for a seat, false for furni you can only walk around.
       It defaults to true, which is what every caller wanted back when a seat
       was the only reason to click an occupied tile. */
    function findPath(start, goal, blocked, enterGoal) {
        if (enterGoal === undefined) enterGoal = true;
        if (!inside(goal.x, goal.y)) return null;
        if (start.x === goal.x && start.y === goal.y) return [];
        if (!enterGoal && blocked(goal.x, goal.y)) return null;

        const key = (x, y) => y * COLS + x;
        const goalKey = key(goal.x, goal.y);

        const g = new Map([[key(start.x, start.y), 0]]);
        const cameFrom = new Map();
        const est = (x, y) => heuristic(x, y, goal.x, goal.y) + OWED * owed(x, y, goal);
        const open = [{ x: start.x, y: start.y, f: est(start.x, start.y) }];
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

                /* THE GOAL IS ENTERABLE ONLY IF THE CALLER SAYS SO.

                   It used to be enterable unconditionally, so that walking
                   onto a chair could put you in it — and that one exemption
                   let the avatar step onto ANYTHING by clicking it. A bar
                   desk, a divider, a fridge: click it and the figure walked
                   into the furni and stood inside it.

                   A seat is the one thing you walk into. Everything else is
                   an obstacle whether you clicked it or not, so `enterGoal`
                   is the caller's answer to "is there something here worth
                   standing in", not a property of being the destination. */
                if (nk !== goalKey && blocked(nx, ny)) continue;
                if (nk === goalKey && !enterGoal && blocked(nx, ny)) continue;

                if (d.dx !== 0 && d.dy !== 0) {
                    /* BOTH sides have to be blocked to refuse a diagonal, not
                       either one.

                       Refusing when either was blocked is the strict
                       no-corner-cutting rule, and it made the room far more
                       obstructive than Habbo's: every single chair grew an
                       invisible no-go zone across its two diagonals, so the
                       avatar took long detours around one piece of furniture.
                       That got worse the moment seats started blocking.

                       Two furni touching corner to corner still seal the gap
                       between them, which is the room-blocking trick players
                       actually use. One does not. */
                    if (blocked(cur.x + d.dx, cur.y) && blocked(cur.x, cur.y + d.dy)) continue;
                }

                const tentative = g.get(ck) + stepCost(d.dx, d.dy);
                if (g.has(nk) && tentative >= g.get(nk)) continue;

                g.set(nk, tentative);
                cameFrom.set(nk, { x: cur.x, y: cur.y });
                open.push({ x: nx, y: ny, f: tentative + est(nx, ny) });
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

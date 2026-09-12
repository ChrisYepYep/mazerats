/* ===========================================================================
   habbo-avatar.js — a walking Habbo avatar, from a real player's figure.

   Standalone and dependency-free. Drop it in, give it a figure string and a
   way to turn a tile into a point on screen, and it will load the right
   sprites from Habbo's imaging service and walk them around.

   ---------------------------------------------------------------------------
   THE SHORTEST USEFUL EXAMPLE

       const avatar = HabboAvatar.create({
           figure: "hd-180-1.ch-210-66.lg-270-82.sh-290-80.hr-100-61",
           tile:   { x: 3, y: 6 }
       });

       canvas.addEventListener("click", (e) => {
           const r = canvas.getBoundingClientRect();
           const t = HabboAvatar.tileAt(e.clientX - r.left, e.clientY - r.top);
           if (t) avatar.walkTo(t.x, t.y);          // straight line by default
       });

       (function frame(now) {
           requestAnimationFrame(frame);
           avatar.update(now);
           ctx.clearRect(0, 0, canvas.width, canvas.height);
           avatar.draw(ctx, now);
       })(performance.now());

   That is the whole thing. Everything below is either a knob you probably do
   not need to turn, or a note explaining a number that was expensive to find.

   ---------------------------------------------------------------------------
   LOOKING UP A REAL PLAYER

   A figure string is what the avatar is made of. To get one for a player by
   name, ask Habbo for their profile — from a server, not the browser, because
   the endpoint sends no CORS headers:

       GET https://www.habbo.com/api/public/users?name=<name>
       -> { figureString: "hd-180-1.ch-210-66...", ... }

   Swap the domain for the hotel you want (habbo.com.br, habbo.es, and so on).
   Figures are portable between hotels; the account is not.

   ---------------------------------------------------------------------------
   WHAT YOU HAVE TO PROVIDE, AND WHAT YOU CAN IGNORE

   `toScreen(x, y)` turns a tile into the point the avatar's FEET stand on.
   Leave it out and you get Habbo's own isometry — 64x32 tiles, x to the
   lower-right, y to the lower-left — which is what `HabboAvatar.tileAt`
   inverts. Supply your own and the walking still works; only the geometry
   changes.

   `blocked(x, y)` is optional. Without it `walkTo` walks a straight line.
   With it, you get A* over an eight-connected grid, which is where most of
   the interesting behaviour lives — see `findPath`.

   ---------------------------------------------------------------------------
   THE FOUR NUMBERS THAT MATTER, all measured off the running client rather
   than guessed, because guessing them produced an avatar that looked wrong in
   ways that were hard to name.

   WALK_MS = 500. Half a second a tile. The client cannot tell you this —
   it holds no walk constant, because the SERVER sends each step and the pace
   is its tick rate. So it was measured: two walks captured at 50ms and the
   figure's travel tracked frame by frame gave 513 and 502 ms/tile over four
   and six grid-diagonal steps. A grid-diagonal step moves exactly 64px across
   and none down, which is what makes it a clean ruler.

   WALK_FRAME_MS = 84, and THE LIMBS RUN ON THEIR OWN CLOCK. The obvious thing
   is to fit one four-frame cycle into each tile, so the feet stay honest. It
   reads as trudging. In the real client the stride opens every 168ms — twice
   per cycle, so a frame every 84ms, near enough 12fps, about 5.9 frames across
   a 500ms tile. One cycle per tile is 4 frames at 8fps, two thirds the rate:
   the avatar covers the ground at the right speed while moving its limbs too
   slowly, which is exactly what "sluggish, but the speed matches" looks like.
   So the cycle free-runs on the clock and the tile does not divide it. The
   phase carries across steps by construction, which is also more correct than
   restarting at frame 0 every tile.

   SCALE = 0.5. The imaging service returns size=l at 128x220, double the
   64x110 a 64x32 grid wants. Measured, not assumed.

   FOOT_PAD = 11. The sprite's feet sit eleven pixels above its own bottom
   edge, so the figure is drawn that much lower than a naive bottom-align.

   ---------------------------------------------------------------------------
   THE DIRECTION TABLE WAS WRONG TWICE, and the second time is the instructive
   one. See DIRS below. If you ever need to check it, check it by watching
   which way the figure WALKS, never by looking at the sprites.
   =========================================================================== */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.HabboAvatar = factory();
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* ---- measured constants (see the header) ---- */
    const WALK_MS = 500;
    const WALK_FRAMES = 4;
    const WALK_FRAME_MS = 84;
    const SCALE = 0.5;
    const FOOT_PAD = 11;
    // The figure at 1:1 against a 64x32 grid, which is what size=l halves to.
    const FIGURE_W = 64;
    const FIGURE_H = 110;

    const TILE_W = 64;
    const TILE_H = 32;

    const DEFAULT_HOTEL = "https://www.habbo.com";

    /* HABBO'S EIGHT DIRECTIONS. The index IS the value handed to the imaging
       service, so this table is both the neighbour list and the facing lookup.

           0 NE   1 E   2 SE   3 S (toward the viewer)
           4 SW   5 W   6 NW   7 N (away)

       TWICE WRONG BEFORE THIS. The first version was a quarter turn out and
       the figure plainly walked backwards. The second was a MIRROR — every
       direction correct about the north-south axis and reversed about the
       east-west one — which is far harder to see, because walking toward the
       viewer and away from it both look perfect and only the other six are
       reversed.

       Both wrong versions came from the same method: rendering the eight
       sprites and judging by eye which way each figure pointed. A small pixel
       figure in three-quarter view does not reliably tell you that, and
       reading a mirrored sprite as correct is exactly the mistake it invites.
       This table comes from observed behaviour instead — moving up-and-right
       walked facing up-and-left, up-and-left faced up-and-right, with straight
       toward and straight away both correct, which is the signature of a
       mirror about north-south and fixes every entry by d -> (6 - d) mod 8. */
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

    function directionOf(fromX, fromY, toX, toY) {
        const dx = Math.sign(toX - fromX), dy = Math.sign(toY - fromY);
        const i = DIRS.findIndex(d => d.dx === dx && d.dy === dy);
        return i === -1 ? 2 : i;
    }

    /* ---- the default isometry -------------------------------------------
       Habbo's own: 64x32 tiles, x running to the lower-right and y to the
       lower-left. `toScreen` gives the point the FEET stand on, which is the
       middle of the tile's diamond. */
    let originX = 320, originY = 40;

    function setOrigin(x, y) { originX = x; originY = y; }

    function isoToScreen(x, y) {
        return {
            x: originX + (x - y) * (TILE_W / 2),
            y: originY + (x + y) * (TILE_H / 2) + TILE_H / 2
        };
    }

    // The inverse, for turning a click into a tile.
    function tileAt(px, py) {
        const rx = px - originX;
        const ry = py - originY - TILE_H / 2;
        const fx = (rx / (TILE_W / 2) + ry / (TILE_H / 2)) / 2;
        const fy = (ry / (TILE_H / 2) - rx / (TILE_W / 2)) / 2;
        return { x: Math.round(fx), y: Math.round(fy) };
    }

    /* ---- sprites ---------------------------------------------------------

       THE WALK IS FOUR SEPARATE IMAGES and you have to ask for each. Against
       action=wlk the service honours `&frame=0..3` and returns four genuinely
       different pictures; asking for action=wlk alone returns frame 0 every
       time, which is why an avatar built the obvious way slides across the
       floor with its limbs still.

       Every distinct URL is fetched once and kept. A figure needs 8 directions
       x (stand + sit + 4 walk frames) = 48 images, which is small, and they
       are the same 48 for the life of the figure. */
    const cache = new Map();

    function spriteUrl(figure, opts) {
        const o = opts || {};
        const walking = o.action === "wlk";
        const params = new URLSearchParams({
            figure,
            size: o.size || "l",
            direction: String(o.dir || 0),
            head_direction: String(o.headDir === undefined ? (o.dir || 0) : o.headDir),
            action: walking ? "wlk" : (o.action === "sit" ? "sit" : "std"),
            frame: String(walking ? ((o.frame | 0) % WALK_FRAMES) : 0),
            gesture: o.gesture || "sml"
        });
        return `${o.hotel || DEFAULT_HOTEL}/habbo-imaging/avatarimage?${params.toString()}`;
    }

    function sprite(figure, opts) {
        const url = spriteUrl(figure, opts);
        let entry = cache.get(url);
        if (entry) return entry;
        entry = { img: new Image(), ready: false, failed: false, url };
        // Needed only if you intend to read the canvas back afterwards.
        entry.img.crossOrigin = "anonymous";
        entry.img.onload = () => { entry.ready = true; if (onSpriteReady) onSpriteReady(entry); };
        entry.img.onerror = () => { entry.failed = true; };
        entry.img.src = url;
        cache.set(url, entry);
        return entry;
    }

    /* Called whenever an image arrives. Set it to mark your canvas dirty —
       sprites land asynchronously, and a render loop that only paints on
       change will otherwise miss them. */
    let onSpriteReady = null;
    function onReady(cb) { onSpriteReady = cb; }

    // All 48 for a figure, so the first turn is not a blank frame.
    function preload(figure, opts) {
        const o = opts || {};
        for (let d = 0; d < 8; d++) {
            sprite(figure, { ...o, dir: d, action: "std" });
            sprite(figure, { ...o, dir: d, action: "sit" });
            for (let f = 0; f < WALK_FRAMES; f++) sprite(figure, { ...o, dir: d, action: "wlk", frame: f });
        }
    }

    /* ---- routing ---------------------------------------------------------

       A* over an eight-connected grid. Only used when you give `blocked`;
       without it `walkTo` draws a straight line and lets you do your own.

       Three rules, and the first two are about what a route COSTS rather than
       what it looks like.

       EVERY STEP COSTS THE SAME, because every step takes the same time. An
       avatar crosses one tile in WALK_MS whichever way it goes, so what costs
       a player time is the NUMBER of steps — and a route that is shorter with
       a ruler can be slower to walk. Pricing a diagonal at sqrt(2) takes five
       straight steps (5.00) over four diagonal ones (5.66) every time:
       geometrically shorter, a whole step slower, and visibly the long way
       round. So steps cost 1 and the remainder is measured in Chebyshev
       distance, which is exactly the fewest moves such a walk can take.

       TIES BREAK TOWARD TAKING THE DIAGONALS FIRST, because that is what the
       real client does. Sent from (7,5) to (3,3) past a chair it walked
       (6,4) (5,3) (4,3) (3,3) — both diagonals first, then two straight. The
       obvious alternative, making diagonals fractionally cheaper so routes
       with more of them win, produces a WEAVE: six tiles straight ahead
       becomes three steps up-left and three up-right, same length, every step
       "cheaper". Breaking on how many diagonals are still OWED — min(dx, dy)
       to the goal — front-loads them without rewarding zigzags, because a
       straight walk owes none the whole way.

       CORNERS MAY BE CUT PAST ONE OBSTACLE BUT NOT TWO. Refusing a diagonal
       when either neighbour is blocked is the strict rule, and it gives every
       single chair an invisible cross-shaped no-go zone. Refusing only when
       BOTH are blocked still seals the gap between two pieces set corner to
       corner — the blocking trick players actually use — while leaving one
       chair something you walk around.

       `enterGoal` lets the destination be occupied when nothing else may be:
       sitting down means walking ONTO the seat's tile. */
    function findPath(start, goal, blocked, opts) {
        const o = opts || {};
        const enterGoal = o.enterGoal !== false;
        const inside = o.inside || (() => true);
        const isBlocked = blocked || (() => false);

        if (!inside(goal.x, goal.y)) return null;
        if (start.x === goal.x && start.y === goal.y) return [];
        if (!enterGoal && isBlocked(goal.x, goal.y)) return null;

        const key = (x, y) => `${x},${y}`;
        const goalKey = key(goal.x, goal.y);
        const g = new Map([[key(start.x, start.y), 0]]);
        const cameFrom = new Map();
        const h = (x, y) => Math.max(Math.abs(x - goal.x), Math.abs(y - goal.y));
        const owed = (x, y) => Math.min(Math.abs(x - goal.x), Math.abs(y - goal.y));
        const est = (x, y) => h(x, y) + 0.001 * owed(x, y);
        const open = [{ x: start.x, y: start.y, f: est(start.x, start.y) }];
        const closed = new Set();

        while (open.length) {
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
                if (nk !== goalKey && isBlocked(nx, ny)) continue;
                if (nk === goalKey && !enterGoal && isBlocked(nx, ny)) continue;
                if (d.dx !== 0 && d.dy !== 0
                    && isBlocked(cur.x + d.dx, cur.y) && isBlocked(cur.x, cur.y + d.dy)) continue;

                const t = g.get(ck) + 1;
                if (g.has(nk) && t >= g.get(nk)) continue;
                g.set(nk, t);
                cameFrom.set(nk, { x: cur.x, y: cur.y });
                open.push({ x: nx, y: ny, f: t + est(nx, ny) });
            }
        }

        if (!cameFrom.has(goalKey)) return null;
        const path = [];
        let node = { x: goal.x, y: goal.y };
        while (!(node.x === start.x && node.y === start.y)) {
            const prev = cameFrom.get(key(node.x, node.y));
            if (!prev) return null;
            path.push({ x: node.x, y: node.y, dir: directionOf(prev.x, prev.y, node.x, node.y) });
            node = prev;
        }
        return path.reverse();
    }

    // A straight line, for when there is nothing to walk around.
    function straightLine(start, goal) {
        const out = [];
        let x = start.x, y = start.y;
        while (x !== goal.x || y !== goal.y) {
            const dir = directionOf(x, y, goal.x, goal.y);
            x += DIRS[dir].dx; y += DIRS[dir].dy;
            out.push({ x, y, dir });
        }
        return out;
    }

    /* ---- the avatar ------------------------------------------------------ */

    function create(opts) {
        const o = opts || {};

        const self = {
            figure: o.figure || "hd-180-1.ch-210-66.lg-270-82.sh-290-80.hr-100-61",
            tile: { x: (o.tile && o.tile.x) || 0, y: (o.tile && o.tile.y) || 0 },
            dir: o.dir === undefined ? 2 : o.dir,
            action: "std",              // "std" | "sit" | "wlk"

            walkMs: o.walkMs || WALK_MS,
            scale: o.scale === undefined ? SCALE : o.scale,
            footPad: o.footPad === undefined ? FOOT_PAD : o.footPad,
            hotel: o.hotel || DEFAULT_HOTEL,
            size: o.size || "l",
            gesture: o.gesture || "sml",

            toScreen: o.toScreen || isoToScreen,
            blocked: o.blocked || null,
            inside: o.inside || null,

            /* Called as each step completes, with the tile just reached and
               whether it was the last one. Where you put "did I arrive". */
            onStep: o.onStep || null,
            onArrive: o.onArrive || null,

            path: [],
            stepFrom: null,
            stepAt: 0,

            /* WHERE IT IS GOING, kept so a route can be reconsidered. If your
               world changes while somebody is walking — something drops in
               their way — call `repath` and the walk bends around it instead
               of marching through. */
            goal: null
        };

        function spriteOpts(dir, action, frame) {
            return {
                dir, action, frame,
                hotel: self.hotel, size: self.size, gesture: self.gesture
            };
        }

        self.preload = function () {
            preload(self.figure, { hotel: self.hotel, size: self.size, gesture: self.gesture });
            return self;
        };

        self.setFigure = function (figure) {
            self.figure = figure;
            self.preload();
            return self;
        };

        /* Sit down, facing wherever the seat faces. Habbo numbers furni
           directions and avatar directions the same way round, so if you know
           which way a chair points you can pass it straight in. */
        self.sit = function (facing) {
            self.action = "sit";
            if (facing !== undefined && facing !== null) self.dir = facing;
            self.path = [];
            self.stepFrom = null;
            self.goal = null;
            return self;
        };

        self.stand = function () {
            if (self.action === "sit") self.action = "std";
            return self;
        };

        /* `now` is optional and defaults to the wall clock, but PASS IT if
           your game has a clock of its own — one that stops when the tab is
           hidden, say, or when a round is paused. Every timestamp this avatar
           sees has to come from the same clock, or a walk begun on one and
           finished on the other jumps. */
        self.setPath = function (path, now) {
            self.path = (path || []).map(s => ({
                x: s.x, y: s.y,
                dir: s.dir === undefined ? null : s.dir
            }));
            if (self.path.length) {
                const last = self.path[self.path.length - 1];
                self.goal = { x: last.x, y: last.y };
                if (!self.stepFrom) beginStep(now === undefined ? performance.now() : now);
            }
            return self;
        };

        self.walkTo = function (x, y, walkOpts) {
            const w = walkOpts || {};
            const goal = { x, y };
            const route = self.blocked
                ? findPath(self.tile, goal, self.blocked,
                    { inside: self.inside, enterGoal: w.enterGoal })
                : straightLine(self.tile, goal);
            if (!route || !route.length) return false;
            self.setPath(route, w.now);
            return true;
        };

        /* THE WORLD CHANGED MID-WALK. Re-asks the question the click asked,
           from where the figure is standing NOW. Returns true if it is still
           going somewhere. A step already under way is committed — it cannot
           be redirected in the middle of a tile — so the new route starts from
           the tile being walked into, which is what `self.tile` already is. */
        self.repath = function () {
            if (!self.goal || !self.blocked) return !!self.goal;
            if (!self.path.length) return false;
            if (!self.path.some(s => self.blocked(s.x, s.y))) return true;
            const route = findPath(self.tile, self.goal, self.blocked, { inside: self.inside });
            if (route && route.length) { self.path = route; return true; }
            self.path = [];
            self.goal = null;
            return false;
        };

        self.stop = function () {
            self.path = [];
            self.goal = null;
            return self;
        };

        self.isWalking = function () { return !!self.stepFrom; };

        function beginStep(now) {
            const next = self.path.shift();
            self.stepFrom = { x: self.tile.x, y: self.tile.y };
            self.dir = next.dir === null
                ? directionOf(self.tile.x, self.tile.y, next.x, next.y)
                : next.dir;
            self.tile = { x: next.x, y: next.y };
            self.action = "wlk";
            self.stepAt = now;
        }

        self.update = function (now) {
            if (!self.stepFrom) return false;
            if (now - self.stepAt < self.walkMs) return true;

            // Arrived at the tile it was walking into.
            self.stepFrom = null;
            const done = !self.path.length;
            if (self.action === "wlk") self.action = "std";
            if (self.onStep) self.onStep({ x: self.tile.x, y: self.tile.y }, done);
            if (done) {
                self.goal = null;
                if (self.onArrive) self.onArrive({ x: self.tile.x, y: self.tile.y });
                return false;
            }
            beginStep(now);
            return true;
        };

        /* Where the figure is on screen this instant, and which picture of it
           to use. Split out from `draw` so you can put the avatar into your
           own depth sort — in an isometric room the figure has to be sorted
           among the furniture, not painted over the top of it, or standing
           behind a sofa puts you in front of it. */
        self.at = function (now) {
            if (!self.stepFrom) {
                const p = self.toScreen(self.tile.x, self.tile.y);
                return { x: p.x, y: p.y, dir: self.dir, action: self.action, frame: 0 };
            }
            const t = Math.min(1, (now - self.stepAt) / self.walkMs);
            const a = self.toScreen(self.stepFrom.x, self.stepFrom.y);
            const b = self.toScreen(self.tile.x, self.tile.y);
            // The limbs run on their own clock — see the header.
            const frame = Math.floor(now / WALK_FRAME_MS) % WALK_FRAMES;
            return {
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
                dir: self.dir, action: "wlk", frame
            };
        };

        self.draw = function (ctx, now) {
            const at = self.at(now === undefined ? performance.now() : now);
            const s = sprite(self.figure, spriteOpts(at.dir, at.action, at.frame));
            if (!s.ready) return false;
            const img = s.img;
            const w = Math.round(img.naturalWidth * self.scale);
            const h = Math.round(img.naturalHeight * self.scale);
            /* Rounded to whole pixels. The art is pixel art and a half-pixel
               offset turns every hard edge into two soft ones, which reads as
               a different game. */
            const dx = Math.round(at.x - w / 2);
            const dy = Math.round(at.y - h + self.footPad);
            const wasSmoothing = ctx.imageSmoothingEnabled;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, dx, dy, w, h);
            ctx.imageSmoothingEnabled = wasSmoothing;

            /* EYE ACCESSORIES ARE MISSING AT TWO DIRECTIONS. The service
               renders an Origins eye accessory at head directions 0, 1, 3, 5
               and 6 and silently drops it at 2 and 4. (7 is the back of the
               head, which correctly has no face.) Patching that needs the
               client's own part bitmaps, which are not this file's business —
               so it is a hook. Given one, it is called with everything needed
               to composite the missing piece:

                   avatar.drawExtras = (ctx, info) => { ... }

               where info is { figure, dir, x, y, scale, width, height }. */
            if (self.drawExtras) {
                self.drawExtras(ctx, {
                    figure: self.figure, dir: at.dir,
                    x: dx, y: dy, width: w, height: h,
                    // Drawn size against the 64x110 figure the client's own
                    // part bitmaps are measured in, which is what a compositor
                    // needs to place them.
                    scale: w / FIGURE_W
                });
            }
            return true;
        };

        self.drawExtras = o.drawExtras || null;

        if (o.preload !== false) self.preload();
        return self;
    }

    return {
        create, preload, sprite, spriteUrl, onReady,
        findPath, straightLine, directionOf, tileAt, isoToScreen, setOrigin,
        DIRS, WALK_MS, WALK_FRAMES, WALK_FRAME_MS, SCALE, FOOT_PAD, TILE_W, TILE_H
    };
});

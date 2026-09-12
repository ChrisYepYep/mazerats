/* Furni falling from the ceiling.

   A round is a schedule of pieces (from js/room-levels.js), each of which
   picks a landing tile, falls, and lands. This file owns the falling and the
   landing; it does not own the scoring, and it does not draw the room.

   ----------------------------------------------------------------------
   Play starts on the first drop, not after the last

   The player moves as soon as the first piece lands, so the sequence is being
   revealed while they are already walking. That is the whole shape of the
   game: `landed` grows during play, and the order to sit in is the order of
   that list, which nobody knows in advance — including the player, who is
   watching it happen.

   ----------------------------------------------------------------------
   Choosing where a piece lands

   Inside the entry's area, on a tile block that fits and is not already taken.
   Two things are deliberately avoided:

     - the tile the player is standing on, because a piece landing on top of
       somebody is not a thing that happens in the original;
     - a spot that would seal a seat off entirely. An obstacle is meant to make
       the route longer, not to make the round unwinnable, and a seat with no
       walkable neighbour is unwinnable rather than hard.

   If no spot passes, the piece is skipped rather than forced. A round one
   piece short is a worse round; a round with an unreachable seat is a broken
   one.

   ----------------------------------------------------------------------
   The fall

   A piece starts a fixed height above its landing tile and drops to it over
   `dropSpeedMs`, easing in — gravity, roughly, and much more readable than a
   linear slide at 24fps. `lift` carries the height, which is the same field
   the renderer uses for stacking, so a falling piece and a stacked one are
   drawn by the same code path. */
(function () {
    "use strict";

    const Iso = window.RoomIso;
    const Furni = window.RoomFurni;
    const Path = window.RoomPath;

    const FALL_TILES = 9;               // how far above the floor a piece starts

    function inArea(area, x, y) {
        return x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h;
    }

    const key = (x, y) => y * Iso.COLS + x;

    /* Would placing `piece` leave `seat` with no walkable neighbour? A seat you
       cannot reach is not a hard round, it is a broken one. */
    function sealedWith(blocked, seat) {
        for (const t of Furni.tilesOf(seat)) {
            for (const d of Path.DIRS) {
                const nx = t.x + d.dx, ny = t.y + d.dy;
                if (!Path.inside(nx, ny)) continue;
                if (Furni.covers(seat, nx, ny)) continue;
                if (!blocked.has(key(nx, ny))) return false;
            }
        }
        return true;
    }

    const sealsIn = (list, seat) => sealedWith(Furni.blockedTiles(list), seat);

    /* EVERY TILE THE PLAYER CAN STILL WALK TO, which is a different question
       from whether a seat has a free tile beside it — and the difference is
       what made rounds unwinnable.

       A free neighbour is a LOCAL test. It says the seat is not bricked up; it
       says nothing about whether the player can get to the tile that neighbour
       sits in. Seats block, so a room holding a dozen pieces can cut itself in
       two, and a seat alone on the far side passed the old test with room to
       spare while being completely unreachable. Sequence seats must be taken
       in order, so one of those ends the round on the spot: measured at 16% of
       Level 3 rounds and 11% of Level 2's, for a player walking a perfect
       route.

       So the question is asked from where the player actually is. A flood fill
       over walkable tiles, with the same corner rule findPath uses — two furni
       corner to corner seal the gap between them — gives the region the player
       is in, and a seat outside it is not a hard seat but an impossible one.

       The player's own tile seeds the fill whether or not it is blocked: they
       may be sitting on a seat, and standing on one is not being trapped by
       it. findPath treats its start tile the same way. */
    function reachableFrom(start, blocked) {
        const seen = new Set([key(start.x, start.y)]);
        const stack = [{ x: start.x, y: start.y }];
        while (stack.length) {
            const cur = stack.pop();
            for (const d of Path.DIRS) {
                const nx = cur.x + d.dx, ny = cur.y + d.dy;
                if (!Path.inside(nx, ny)) continue;
                const nk = key(nx, ny);
                if (seen.has(nk) || blocked.has(nk)) continue;
                if (d.dx !== 0 && d.dy !== 0
                    && blocked.has(key(cur.x + d.dx, cur.y))
                    && blocked.has(key(cur.x, cur.y + d.dy))) continue;
                seen.add(nk);
                stack.push({ x: nx, y: ny });
            }
        }
        return seen;
    }

    /* Can the player reach this seat AND GET OFF IT AGAIN?

       Getting off is the half that is easy to forget, and forgetting it leaves
       a trap that reads exactly like a broken game. A seat is entered from a
       neighbouring tile, and the seat's own tile is blocked, so a seat ringed
       by other seats can be perfectly enterable and a dead end once you are
       in it. Seats must be taken in order, so the round ends there.

       That is not theoretical: the case this was written for is a 2x1 bench
       whose far half sat in a corner with a chair above it, a chair beside it
       and the wall behind. The player walked in from the chair they were
       already sitting on — seat to seat, which findPath allows, since it never
       tests the tile it starts from — and then could not move at all. Both
       diagonals out were sealed by the corner rule, which is precisely the
       rule that makes two furni corner to corner a wall.

       So the test is per TILE, not per seat: a two-seater is two places to sit
       and the player picks one, so BOTH halves have to be places you can stand
       up from. And a step out has to land on free floor the player's own
       region contains — anywhere else is not somewhere they can go.

       Entry comes free with it. The corner rule is symmetric, so a tile with a
       legal step out to a reachable tile has a legal step in by the same
       route. */
    function canUse(seat, reachable, blocked) {
        for (const t of Furni.tilesOf(seat)) {
            let wayOut = false;
            for (const d of Path.DIRS) {
                const nx = t.x + d.dx, ny = t.y + d.dy;
                if (!Path.inside(nx, ny)) continue;
                const nk = key(nx, ny);
                if (blocked.has(nk)) continue;          // has to be floor
                if (!reachable.has(nk)) continue;       // and floor they can be on
                if (d.dx !== 0 && d.dy !== 0
                    && blocked.has(key(nx, t.y))
                    && blocked.has(key(t.x, ny))) continue;
                wayOut = true;
                break;
            }
            if (!wayOut) return false;
        }
        return true;
    }

    /* How far a footprint sits from a tile, measured the way a walk is: the
       longer of the two axes, since a diagonal step covers both at once. */
    function distanceFrom(probe, tile) {
        let best = Infinity;
        for (let dy = 0; dy < probe.h; dy++) {
            for (let dx = 0; dx < probe.w; dx++) {
                const d = Math.max(Math.abs(probe.x + dx - tile.x), Math.abs(probe.y + dy - tile.y));
                if (d < best) best = d;
            }
        }
        return best;
    }

    /* Every legal landing spot for a piece, in the entry's area.

       `minDistance` is the round's reach — how far from the player a piece
       must land. It is applied as a PREFERENCE, not a hard rule: if nothing in
       the area is far enough, the distance requirement is dropped rather than
       the piece. A round short of a seat is a broken round; a round with one
       seat closer than intended is merely an easier one. */
    function spotsFor(list, entry, meta, avoid, minDistance) {
        const spots = [];
        const near = [];

        /* THE FOOTPRINT HAS TO BE THE ROTATED ONE.

           furnidata's x/y describe a furni in its default direction, and
           Furni.footprint turns them with it — a 3x1 bench that lands rotated
           occupies 1x3. This used the raw meta instead, so every check below
           was done against the wrong shape: the scan ran to the wrong edge of
           the area, Furni.fits bounds-checked the wrong rectangle, and a
           turned bench could hang a tile off the room entirely. Asking
           Furni.footprint is asking the same function Furni.make will use a
           few lines further down, which is the point — there is only one
           answer to what shape this piece is. */
        const fp = Furni.footprint(meta, entry.rotation, entry.className, entry.state);
        const w = fp.w;
        const h = fp.h;
        const reach = Math.max(0, minDistance || 0);

        /* WORKED OUT ONCE FOR THE WHOLE SCAN, not per candidate.

           This used to rebuild the room's blocked set inside the innermost
           loop — once for every seat, for every tile a piece might land on —
           which is the same set every time bar the one piece being tried. On a
           full room that is hundreds of thousands of tile operations for a
           single drop, all of it on the frame a piece starts falling. The set
           is built here instead and the candidate's own tiles are added and
           taken away around each test. */
        const blocked = Furni.blockedTiles(list);

        /* ONLY THE SEATS THE ROUND ACTUALLY REQUIRES.

           Sequence seats must be sat on, in order, so one of them out of reach
           ends the round. Nothing else is owed: a decoy or a poi is a seat you
           are never obliged to take, and the builder's decor chairs are
           scenery. Holding those to the same rule made every placement illegal
           the moment one decorative chair stood somewhere awkward — a seat
           tucked behind a table is unreachable in the level AS AUTHORED, no
           candidate position could change that, and so every piece was refused
           a spot and the round dropped nothing at all. */
        const mustReach = (f) => f.sit && f.role === "sequence";
        const seats = list.filter(mustReach);

        /* WHAT WAS ALREADY OUT OF REACH STAYS OUT OF REACH, and is not this
           piece's fault. The test is whether a placement makes things WORSE,
           so the room is measured once without the candidate and each
           candidate is only asked not to take anything away. */
        const before = avoid ? reachableFrom(avoid, blocked) : null;
        const owed = before
            ? seats.filter(f => canUse(f, before, blocked))
            : seats;

        for (let y = entry.area.y; y <= entry.area.y + entry.area.h - h; y++) {
            for (let x = entry.area.x; x <= entry.area.x + entry.area.w - w; x++) {
                const probe = { x, y, w, h };
                if (!inArea(entry.area, x + w - 1, y + h - 1)) continue;
                if (!Furni.fits(list, probe)) continue;
                // Not on top of the player.
                if (avoid && Furni.covers(probe, avoid.x, avoid.y)) continue;

                /* Not somewhere that puts a seat out of the player's reach,
                   and — if this piece is itself a seat — not somewhere it
                   lands out of reach. */
                const candidate = Furni.make(entry.className, x, y,
                    { meta, rotation: entry.rotation, state: entry.state, role: entry.role });

                const added = [];
                if (!candidate.stand) {
                    for (const t of Furni.tilesOf(candidate)) {
                        const k = key(t.x, t.y);
                        if (!blocked.has(k)) { blocked.add(k); added.push(k); }
                    }
                }

                // Everything already owed, plus this piece if it is itself one.
                const check = mustReach(candidate) ? owed.concat([candidate]) : owed;
                let ok = true;
                if (avoid) {
                    const reachable = reachableFrom(avoid, blocked);
                    for (const f of check) {
                        if (!canUse(f, reachable, blocked)) { ok = false; break; }
                    }
                } else {
                    // No player to measure from — the old local test is all
                    // there is, and it is better than nothing.
                    for (const f of check) {
                        if (sealedWith(blocked, f)) { ok = false; break; }
                    }
                }

                for (const k of added) blocked.delete(k);
                if (!ok) continue;
                if (avoid && reach && distanceFrom(probe, avoid) < reach) near.push({ x, y });
                else spots.push({ x, y });
            }
        }
        // Far enough if anything is; otherwise whatever there is.
        return spots.length ? spots : near;
    }

    /* A round in progress. `level` is already normalised; `metaFor` resolves a
       className to its furnidata record; `urlFor` to its sprite. */
    function createRound(level, opts) {
        const o = opts || {};
        const rng = o.rand || Math.random;
        const metaFor = o.metaFor || (() => ({}));
        const urlFor = o.urlFor || (() => ({ url: null, flip: false }));

        const queue = window.RoomLevels.schedule(level, rng);
        const decor = (level.decor || []).map(d => Furni.make(d.className, d.x, d.y, {
            meta: metaFor(d.className), rotation: d.rotation, state: d.state,
            lift: Number(d.z) || 0, role: "decor",
            ...urlFor(d.className, d.state, d.rotation)
        }));

        return {
            level,
            queue,                      // still to fall
            falling: [],                // in the air right now
            placed: decor.slice(),      // everything on the floor, decor included
            landed: [],                 // dropped pieces, in landing order
            /* null, not 0, because a round can legitimately begin at timestamp
               zero — and `!this.started` is then true forever, re-stamping the
               start and the next drop on EVERY tick, so the clock never
               advances and pieces rain one per frame. The page's clock is
               built on performance.now() and never lands exactly on zero,
               which is the only reason this has not bitten in play; a harness
               starting at t=0 hits it immediately. */
            started: null,
            nextAt: 0,
            done: false,

            /* Advance the round. `now` is a timestamp, `playerTile` where the
               player is. Returns true if anything changed and the room needs
               repainting. */
            tick(now, playerTile) {
                let changed = false;
                if (this.started === null) { this.started = now; this.nextAt = now; }

                // Land anything whose fall has finished.
                for (let i = this.falling.length - 1; i >= 0; i--) {
                    const p = this.falling[i];
                    const t = (now - p.at) / level.rules.dropSpeedMs;
                    if (t >= 1) {
                        p.furni.lift = 0;
                        this.falling.splice(i, 1);
                        this.placed.push(p.furni);
                        this.landed.push(p.furni);
                        changed = true;
                    } else {
                        // Ease in: slow at the top, quick at the bottom.
                        p.furni.lift = FALL_TILES * (1 - t * t);
                        changed = true;
                    }
                }

                // Start the next one when its turn comes.
                if (this.queue.length && now >= this.nextAt) {
                    const entry = this.queue[0];
                    const meta = metaFor(entry.className);
                    /* The reach is measured against where the player is NOW,
                       not where they started — so parking in a corner sends
                       the next piece to the far side rather than earning an
                       easy round. */
                    const spots = spotsFor(this.placed.concat(this.falling.map(p => p.furni)),
                        entry, meta, playerTile, level.rules.minDropDistance);
                    this.queue.shift();
                    if (spots.length) {
                        const spot = spots[Math.floor(rng() * spots.length)];
                        const furni = Furni.make(entry.className, spot.x, spot.y, {
                            meta, rotation: entry.rotation, role: entry.role,
                            ...urlFor(entry.className, 0, entry.rotation)
                        });
                        furni.lift = FALL_TILES;
                        this.falling.push({ furni, at: now });
                        changed = true;
                    }
                    this.nextAt = now + level.rules.dropDelayMs;
                }

                if (!this.queue.length && !this.falling.length) this.done = true;
                return changed;
            },

            // Everything to draw, falling pieces included.
            renderList() {
                return this.placed.concat(this.falling.map(p => p.furni));
            },

            // The seats that count, in the order they landed.
            sequence() {
                return this.landed.filter(f => f.role === "sequence" && f.sit);
            },

            secondsLeft(now) {
                if (this.started === null) return level.rules.seconds;
                return Math.max(0, level.rules.seconds - (now - this.started) / 1000);
            }
        };
    }

    window.RoomDrop = {
        FALL_TILES, createRound, spotsFor, sealsIn, distanceFrom,
        reachableFrom, canUse
    };
})();

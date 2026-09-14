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
     - a spot that would CUT THE FLOOR IN TWO. An obstacle is meant to make the
       route longer, not to make the round unwinnable, and the way a round
       becomes unwinnable is not a seat with nothing beside it — it is a seat
       with a wall between it and the player. Seats block, so the pieces that
       build that wall are mostly other seats, and the player is usually
       already walking when the last one lands.

   That rule is in `spotsFor` and it is the strictest thing in this file:
   whatever the floor the player can currently walk on breaks into once this
   piece is on it, every part of it has to be able to finish the round. Half
   the notes below are about cases that got past weaker versions of it.

   If no spot passes, the piece is skipped rather than forced, and the next
   one is tried on the same tick rather than waiting out a drop delay for
   something that never fell. A round one piece short is a worse round; a
   round with an unreachable seat is a broken one.

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

    const key = Iso.key;

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

    /* WHERE THE PLAYER CAN GET TO, which is not one region when they are
       sitting down.

       `reachableFrom` seeds the tile the player is on whether or not it is
       blocked, because standing on a seat is not being trapped by it. That is
       right for getting OFF the seat and wrong for everything after: a seat
       can itself be part of a wall, and flooding through it joins two halves
       of a room that are not actually joined.

       That is not a corner case; it is how this was caught. A chair landed at
       (4,2), completing a line of furni that cut the room in two. The player
       sat on that very chair, and from there the flood saw both halves at
       once — so a sequence seat was allowed to drop into the far half. The
       player then stood up on the near side and the wall closed behind them,
       with a seat they were obliged to reach stranded on the other side.

       So a player on furni gets ONE REGION PER WAY OFF IT. A player on open
       floor has exactly one region and none of this applies.

       WHAT HAS TO HOLD IN EVERY ONE OF THEM — see `spotsFor`. An earlier
       version asked only that SOME region held everything owed, on the
       reasoning that the chair is a bridge you cross once and never cross
       back, so the player would take the side their remaining seats were on.
       They do not get that choice. They are usually already walking when the
       piece lands: the route was planned two seconds ago, they are a step or
       two off the chair by the time the thing hits the floor, and the side
       they are on was decided before the wall existed. */
    function regionsFrom(start, blocked) {
        if (!blocked.has(key(start.x, start.y))) return [reachableFrom(start, blocked)];
        const here = key(start.x, start.y);
        const regions = [];
        for (const d of Path.DIRS) {
            const nx = start.x + d.dx, ny = start.y + d.dy;
            if (!Path.inside(nx, ny)) continue;
            const nk = key(nx, ny);
            if (blocked.has(nk)) continue;
            if (d.dx !== 0 && d.dy !== 0
                && blocked.has(key(nx, start.y)) && blocked.has(key(start.x, ny))) continue;
            if (regions.some(r => r.has(nk))) continue;      // already covered
            const r = reachableFrom({ x: nx, y: ny }, blocked);
            r.add(here);                                     // they are on it now
            regions.push(r);
        }
        return regions.length ? regions : [new Set([here])];
    }

    /* WHERE THE PLAYER COULD BE BY THE TIME A PIECE LANDS: every tile they can
       walk to from where they are, the ways off a seat included.

       IT IS THE WHOLE FLOOR AND NOT A RADIUS, and the reason is not the one
       you would guess. A piece is given its tile when it starts falling and
       lands half a second later, which is one step — so "anywhere they might
       be" is arguably the two or three tiles around them, and checking only
       those is a far weaker rule to satisfy. It was tried at one, two and
       three steps, and it dropped FEWER seats rather than more: between a
       third and a half of rounds came up a seat short, against a seventh for
       the whole floor.

       Because the rule that refuses to cut the room up is what keeps the room
       worth landing in. Allow the pieces that carve a corner off and the floor
       spends the round fragmenting, until the seats that matter have nowhere
       legal left to go; refuse them and the zone stays open, and everything
       after finds somewhere. The strict rule is EASIER to satisfy than the lax
       one by the end of a level, which is exactly backwards from how it reads,
       and is why this was measured rather than reasoned about.

       Returned as tiles rather than keys because each one may need a flood
       fill of its own. The player's own tile is in it only if it is floor:
       somebody sitting down is on a blocked tile, and the step off it is the
       first ring of this rather than the seed. */
    function standingRoom(start, blocked) {
        const here = key(start.x, start.y);
        const out = blocked.has(here) ? [] : [{ x: start.x, y: start.y }];
        const seen = new Set([here]);
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
                out.push({ x: nx, y: ny });
                stack.push({ x: nx, y: ny });
            }
        }
        return out;
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
                // A null `reachable` asks only whether the seat is open at
                // all, with no opinion about who can get to it.
                if (reachable && !reachable.has(nk)) continue;
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

    /* The rotations a class has, in a random order. Shuffled rather than
       picked at random and retried, so every facing is tried at most once and
       the loop that uses this always terminates. */
    function turns(n, rng) {
        const list = Array.from({ length: Math.max(1, n | 0) }, (_, i) => i);
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    /* Every legal landing spot for a piece, in the entry's area.

       `minDistance` is the round's reach — how far from the player a piece
       must land. It is applied as a PREFERENCE, not a hard rule: if nothing in
       the area is far enough, the distance requirement is dropped rather than
       the piece. A round short of a seat is a broken round; a round with one
       seat closer than intended is merely an easier one. */
    function spotsFor(list, entry, meta, avoid, minDistance, sat) {
        const spots = [];
        const near = [];
        const taken = sat instanceof Set ? sat : new Set(sat || []);

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
           a spot and the round dropped nothing at all.

           AND ONLY THE ONES STILL TO SIT ON. A seat keeps its role for the
           whole round, so a chair taken twenty seconds ago went on being
           protected — and by the back half of a long level that is a dozen
           of them the room has to stay open around, every one for nothing. It
           refused good spots and left the seats that still matter nowhere
           careful to land. `sat` is the game's own list of what has been
           taken; a seat on it is furniture now. */
        const mustReach = (f) => f.sit && f.role === "sequence" && !taken.has(f);
        const seats = list.filter(mustReach);

        /* WHAT WAS ALREADY OUT OF REACH STAYS OUT OF REACH, and is not this
           piece's fault. The test is whether a placement makes things WORSE,
           so the room is measured once without the candidate and each
           candidate is only asked not to take anything away.

           AND IT IS ASKED OF THE SEAT, NOT OF THE PLAYER. This used to keep
           the seats reachable from where the player was standing, which reads
           as the same question and is not, because the player moves through
           places with no view of the room. Walking between two chairs puts
           them for half a second on a tile whose only floor neighbours are
           the gap they came in by — so measured from there, nearly every seat
           in the room is "already out of reach", `owed` empties out, and the
           piece falling at that moment is free to land anywhere at all.

           Level 44, seed 130: the player crossed (9,7), a one-tile nook
           between a barrel and a chair, on the way to a stool. A sequence
           seat dropped into (9,8) during that half second — legal, since from
           inside the nook it was the only reachable thing in the world — and
           the nook was the only way to it. Nothing afterwards could reopen
           it.

           A seat is owed, then, unless it is SEALED: no way off it for
           anybody, from anywhere. That is the case the escape hatch was
           written for — a chair the level itself bricked in — and it does not
           move about with the player. */
        const owed = avoid ? seats.filter(f => canUse(f, null, blocked)) : seats;
        const room = avoid ? standingRoom(avoid, blocked) : null;

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
                    /* NOT "can the player reach it FROM WHERE THEY ARE", but
                       "can they reach it from anywhere they might BE" — and
                       the difference is a round nobody can finish.

                       The player is not standing still. A piece is given its
                       landing tile when it starts falling and arrives half a
                       second later, by which time they are a step or two into
                       a route they planned before the piece existed. Asking
                       only about the tile they were on when the dice were
                       rolled approves walls that close behind them.

                       Level 10, seed 28, is the case. The player sat on the
                       stool at (0,8) and set off for a sofa at (4,11). A
                       five-tile table was handed the whole of column 2, which
                       passed the old test — the far side of the stool still
                       saw every seat owed — and landed while they were a step
                       and a half down the other way. They spent the next
                       thirty seconds in a seven-tile pocket with three seats
                       owed and no route to any of them.

                       So the question is asked of every tile they could be
                       standing on when it arrives — `standingRoom`, which is
                       the floor within a step or two. Whatever that breaks
                       into once this piece is down, every part of it has to be
                       able to finish the round, because they may be in any of
                       them and they do not get to choose which.

                       It costs one flood fill: each part is filled once and
                       the tiles it covers struck off, so the whole check is a
                       single pass over the room however many parts there are.

                       AND THE TILE THEY ARE ON IS NOT FLOOR, which is the one
                       thing walking the floor cannot see. A player sitting
                       down is standing on a blocked tile, so they are in none
                       of those parts; land a piece on their last free
                       neighbour and the floor is still perfectly connected and
                       perfectly fine, and they are bricked into a chair. Level
                       43, seed 0: a stool dropped on (3,9), the only way off
                       the chair at (2,9), with four seats still owed. So they
                       are asked about separately, from where they actually
                       are — which for somebody on open floor is the part of
                       the floor they are standing in, already checked, and
                       costs nothing to ask twice. */
                    const seenHere = new Set();
                    for (const t of room) {
                        const tk = key(t.x, t.y);
                        if (blocked.has(tk) || seenHere.has(tk)) continue;
                        const r = reachableFrom(t, blocked);
                        for (const rk of r) seenHere.add(rk);
                        if (!check.every(f => canUse(f, r, blocked))) { ok = false; break; }
                    }
                    if (ok) {
                        ok = regionsFrom(avoid, blocked)
                            .every(r => check.every(f => canUse(f, r, blocked)));
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
        /* HOW MANY WAYS A CLASS TURNS. The client's own artwork answers for
           everything it ships; the caller passes this in because the pieces
           it does NOT ship are counted off FurniIndex's sprite grid instead,
           and only the page holds that. One rotation means it cannot turn. */
        const rotationsOf = o.rotationsOf || ((c) => Furni.rotationsOf(c) || 1);

        const queue = window.RoomLevels.schedule(level, rng);
        const decor = (level.decor || []).map(d => Furni.make(d.className, d.x, d.y, {
            meta: metaFor(d.className), rotation: d.rotation, state: d.state,
            lift: Number(d.z) || 0, role: "decor",
            ...urlFor(d.className, d.state, d.rotation)
        }));

        return {
            level,
            queue,                      // still to fall
            /* HOW MANY SEATS THIS ROUND WILL ASK FOR. Set at the start, and
               reduced only when a seat turns out to have nowhere it can
               safely land — see the drop below.

               `sequence()` grows as they land, which is the right answer to
               "how many are in play" and the wrong one for a progress row: a
               row that gains a box every time a chair lands makes the HUD
               wider under the player's eye while they are trying to read the
               clock in it. The row is drawn at full length from the first
               frame and fills in.

               Counted with the same test `sequence()` uses — role AND
               sittable — so the row can never be longer than the sequence
               that will actually be asked for. */
            plannedSeats: queue.filter(e =>
                e.role === "sequence" && (metaFor(e.className) || {}).sit).length,
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
               player is, and `sat` the seats already taken — which the round
               does not track itself, because what counts as taken is the
               scoring's business and this file has none. Returns true if
               anything changed and the room needs repainting. */
            tick(now, playerTile, sat) {
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

                /* Start the next one when its turn comes — and if it has
                   nowhere to go, the one after it, on the same tick.

                   `dropDelayMs` is the time between things LANDING, which is
                   what a player feels and what the difficulty curve is written
                   in. Charging it to a piece that never falls spends it on
                   nothing: the room goes quiet for two and a half seconds, and
                   on a full level where the last few pieces all have nowhere
                   safe to land it goes quiet for ten. Skipping costs nothing
                   instead, and the rhythm between landings stays exactly what
                   the level asked for. */
                while (this.queue.length && now >= this.nextAt) {
                    const entry = this.queue[0];
                    const meta = metaFor(entry.className);
                    const others = this.placed.concat(this.falling.map(p => p.furni));

                    /* WHICH WAY IT LANDS IS RANDOM, and it is decided HERE
                       rather than when the round was scheduled, because a
                       facing has to FIT. A three-tile bench turned ninety
                       degrees occupies 1x3, and there may be nowhere left in
                       the zone that takes it; chosen up front, that piece
                       would simply never fall, and a sequence seat that never
                       falls is a round nobody can finish.

                       So the facings are tried in a random order and the
                       first one with somewhere to land is the one used. A
                       piece that fits only one way still falls, and the round
                       is never short of a seat because the dice said sideways.

                       The reach is measured against where the player is NOW,
                       not where they started - so parking in a corner sends
                       the next piece to the far side rather than earning an
                       easy round. */
                    let spot = null;
                    let rotation = entry.rotation || 0;
                    for (const r of turns(rotationsOf(entry.className), rng)) {
                        const spots = spotsFor(others, { ...entry, rotation: r },
                            meta, playerTile, level.rules.minDropDistance, sat);
                        if (!spots.length) continue;
                        spot = spots[Math.floor(rng() * spots.length)];
                        rotation = r;
                        break;
                    }

                    this.queue.shift();
                    if (spot) {
                        const furni = Furni.make(entry.className, spot.x, spot.y, {
                            meta, rotation, role: entry.role,
                            ...urlFor(entry.className, 0, rotation)
                        });
                        furni.lift = FALL_TILES;
                        this.falling.push({ furni, at: now });
                        this.nextAt = now + level.rules.dropDelayMs;
                        changed = true;
                        break;
                    }
                    if (entry.role === "sequence" && (meta || {}).sit) {
                        /* A SEAT WITH NOWHERE SAFE TO LAND COMES OFF THE PLAN.

                           `plannedSeats` is what the progress row is drawn
                           from, so a seat counted at the start and never
                           dropped is a box that stays dark for the whole
                           round — including a round the player cleared
                           perfectly, which then looks like they missed one.

                           This is not rare. A room fills up as the round goes
                           on and the last pieces are the ones with nowhere
                           left that keeps every seat reachable; a seventh of
                           rounds lose a seat this way, and the fuller layouts
                           lose one more often than not. The round is fine —
                           it is the promise that was wrong. */
                        this.plannedSeats = Math.max(0, this.plannedSeats - 1);
                        changed = true;
                    }
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
        reachableFrom, regionsFrom, canUse
    };
})();

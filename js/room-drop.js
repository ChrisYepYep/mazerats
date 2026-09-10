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

    /* Would placing `piece` leave `seat` with no walkable neighbour? A seat you
       cannot reach is not a hard round, it is a broken one. */
    function sealsIn(list, seat) {
        const blocked = Furni.blockedTiles(list);
        for (const t of Furni.tilesOf(seat)) {
            for (const d of Path.DIRS) {
                const nx = t.x + d.dx, ny = t.y + d.dy;
                if (!Path.inside(nx, ny)) continue;
                if (Furni.covers(seat, nx, ny)) continue;
                if (!blocked.has(ny * Iso.COLS + nx)) return false;
            }
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
        const w = Math.max(1, Number(meta.x) || 1);
        const h = Math.max(1, Number(meta.y) || 1);
        const reach = Math.max(0, minDistance || 0);

        for (let y = entry.area.y; y <= entry.area.y + entry.area.h - h; y++) {
            for (let x = entry.area.x; x <= entry.area.x + entry.area.w - w; x++) {
                const probe = { x, y, w, h };
                if (!inArea(entry.area, x + w - 1, y + h - 1)) continue;
                if (!Furni.fits(list, probe)) continue;
                // Not on top of the player.
                if (avoid && Furni.covers(probe, avoid.x, avoid.y)) continue;

                // Not somewhere that walls an existing seat in, and — if this
                // piece is itself a seat — not somewhere it lands walled in.
                const candidate = Furni.make(entry.className, x, y, { meta, rotation: entry.rotation });
                const after = list.concat([candidate]);
                let ok = true;
                for (const f of after) {
                    if (!f.sit) continue;
                    if (sealsIn(after, f)) { ok = false; break; }
                }
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
            ...urlFor(d.className, d.state, d.rotation), role: "decor"
        }));

        return {
            level,
            queue,                      // still to fall
            falling: [],                // in the air right now
            placed: decor.slice(),      // everything on the floor, decor included
            landed: [],                 // dropped pieces, in landing order
            started: 0,
            nextAt: 0,
            done: false,

            /* Advance the round. `now` is a timestamp, `playerTile` where the
               player is. Returns true if anything changed and the room needs
               repainting. */
            tick(now, playerTile) {
                let changed = false;
                if (!this.started) { this.started = now; this.nextAt = now; }

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
                if (!this.started) return level.rules.seconds;
                return Math.max(0, level.rules.seconds - (now - this.started) / 1000);
            }
        };
    }

    window.RoomDrop = { FALL_TILES, createRound, spotsFor, sealsIn, distanceFrom };
})();

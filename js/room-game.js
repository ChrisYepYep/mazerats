/* A round of Fallin' Furni: the rules, the clock, and whether you won.

   Owns no drawing and no input. The page walks the avatar and tells this file
   which tile it arrived on; this file decides what that meant.

   ----------------------------------------------------------------------
   The rule

   Furni falls. Sit on every SEQUENCE seat, in the order those seats landed,
   before the clock runs out. Play begins on the first drop, not after the
   last, so the order is being revealed while the player is already walking —
   which is the whole shape of the game and the reason the sequence is a
   growing list rather than a plan.

   Four things can be underfoot:

     sequence   the seats that count. Sit on them in landing order.
     decoy      a seat that is not in the sequence. Sitting on it costs time,
                not the round — it is a mistake you can walk off.
     poi        the auto-kick chair from the original. Sitting on it ends the
                round then and there.
     obstacle   not a seat at all. It blocks, and that is its whole job.

   ----------------------------------------------------------------------
   Sitting out of order

   Costs a time penalty and nothing else. Ending the round on a wrong seat
   would make a game about a sequence you cannot see into a game about luck,
   and the original's own failure state was elimination by being too slow, not
   by being wrong. The clock is the enemy; poi is the only instant loss.

   ----------------------------------------------------------------------
   What counts as sitting

   Arriving on a tile the seat covers. A two-seater covers two tiles and either
   will do — the player is sitting on the sofa either way, and demanding a
   particular half of it would be a rule nobody could see. */
(function () {
    "use strict";

    const Drop = window.RoomDrop;
    const Furni = window.RoomFurni;

    const WRONG_SEAT_PENALTY_S = 3;     // sitting out of order
    const DECOY_PENALTY_S = 2;          // sitting on a decoy

    const IDLE = "idle";
    const RUNNING = "running";
    const WON = "won";
    const LOST = "lost";

    function createGame(level, opts) {
        const o = opts || {};

        return {
            level,
            state: IDLE,
            round: null,
            sat: [],                    // seats sat on, in the order sat
            penalty: 0,                 // seconds added by mistakes
            message: "",
            endedBecause: "",

            start(now) {
                this.round = Drop.createRound(level, o);
                this.state = RUNNING;
                this.sat = [];
                this.penalty = 0;
                this.message = "Watch where they land.";
                this.endedBecause = "";
                this.round.tick(now, o.playerTile ? o.playerTile() : null);
                return this;
            },

            stop() {
                this.state = IDLE;
                this.round = null;
                this.message = "";
            },

            secondsLeft(now) {
                if (!this.round) return level.rules.seconds;
                return Math.max(0, this.round.secondsLeft(now) - this.penalty);
            },

            /* The seats still to sit on, in order. Everything already sat on is
               dropped off the front, so the head of this list is always the
               next one wanted. */
            remaining() {
                if (!this.round) return [];
                const done = new Set(this.sat);
                return this.round.sequence().filter(s => !done.has(s));
            },

            nextSeat() { return this.remaining()[0] || null; },

            // Advance the drops and the clock.
            tick(now, playerTile) {
                if (this.state !== RUNNING) return false;
                let changed = this.round.tick(now, playerTile);

                if (this.secondsLeft(now) <= 0) {
                    this.state = LOST;
                    this.endedBecause = "time";
                    this.message = "Out of time.";
                    changed = true;
                }
                return changed;
            },

            /* The avatar finished a step onto this tile. Returns a short word
               for what happened, so the page can react without re-deriving it:
               null, "sat", "wrong", "decoy", "poi", "won". */
            arrivedAt(tile, now) {
                if (this.state !== RUNNING || !tile) return null;
                const seat = Furni.seatAt(this.round.placed, tile.x, tile.y);
                if (!seat) return null;
                if (this.sat.includes(seat)) return null;   // already counted

                if (seat.role === "poi") {
                    this.state = LOST;
                    this.endedBecause = "poi";
                    this.message = "That was the wrong chair entirely.";
                    return "poi";
                }

                if (seat.role === "decoy") {
                    this.penalty += DECOY_PENALTY_S;
                    this.message = "A decoy — that one was never in the sequence.";
                    return "decoy";
                }

                const wanted = this.nextSeat();
                if (wanted && seat !== wanted) {
                    this.penalty += WRONG_SEAT_PENALTY_S;
                    this.message = "Out of order.";
                    return "wrong";
                }

                this.sat.push(seat);
                if (!this.remaining().length && !this.round.queue.length && !this.round.falling.length) {
                    this.state = WON;
                    this.endedBecause = "complete";
                    this.message = "Every seat, in order.";
                    return "won";
                }
                this.message = `${this.sat.length} down.`;
                return "sat";
            },

            // Everything the room should draw, falling pieces included.
            renderList() { return this.round ? this.round.renderList() : []; },

            blocked() {
                return this.round ? Furni.blockedTiles(this.round.renderList()) : new Set();
            },

            /* How the run reads at a glance: one mark per sequence seat that
               has landed, filled if it has been sat on. */
            progress() {
                if (!this.round) return { done: 0, total: 0 };
                const seq = this.round.sequence();
                return { done: this.sat.filter(s => s.role === "sequence").length, total: seq.length };
            }
        };
    }

    /* A RUN: the published levels played in order, each one a round.

       Difficulty lives in the levels themselves — a later one has a shorter
       dropDelayMs (things fall faster than you can walk them) and a longer
       minDropDistance (they land further from wherever you are standing). The
       run does not compute a curve; it plays what the builder authored, so a
       deliberate breather in the middle survives rather than being smoothed
       away by a formula.

       A lost round ends the run. Winning the last level finishes it. */
    function createRun(levels, opts) {
        return {
            levels,
            index: 0,
            game: null,
            finished: false,

            level() { return this.levels[this.index] || null; },

            startRound(now) {
                const lv = this.level();
                if (!lv) { this.finished = true; return null; }
                this.game = createGame(lv, opts).start(now);
                return this.game;
            },

            /* Move to the next level after a win. Returns "next", "finished",
               or null when the round is still going. A loss ends the run
               where it stands — this is a game about a clock, and restarting
               the same round forever is not the shape of it. */
            advance(now) {
                if (!this.game) return null;
                if (this.game.state === WON) {
                    this.index++;
                    if (this.index >= this.levels.length) { this.finished = true; return "finished"; }
                    this.startRound(now);
                    return "next";
                }
                if (this.game.state === LOST) { this.finished = true; return "lost"; }
                return null;
            },

            progressLabel() {
                return `Round ${Math.min(this.index + 1, this.levels.length)} of ${this.levels.length}`;
            }
        };
    }

    window.RoomGame = {
        createGame, createRun,
        IDLE, RUNNING, WON, LOST, WRONG_SEAT_PENALTY_S, DECOY_PENALTY_S
    };
})();

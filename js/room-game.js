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

   Costs time AND points, and breaks the streak — see the note on the point
   values below for why the streak is the part that matters. It does not end
   the round: that would make a game about a sequence you cannot see into a
   game about luck, and the original's own failure state was elimination by
   being too slow, not by being wrong. The clock is the enemy; poi is the only
   instant loss.

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

    /* ---- POINTS, and what they are for.

       A wrong seat used to cost three seconds and nothing else, which is a
       penalty you can only feel if the clock is already tight — sit on the
       wrong chair with half a minute in hand and nothing appears to happen at
       all. Points make every seat matter the moment you sit on it.

       THE STREAK IS THE WHOLE POINT. A flat score per seat rewards sitting on
       everything eventually; what this game is actually asking is whether you
       remember the ORDER, so the reward grows the longer you keep it and a
       single mistake takes the growth away. Six in a row is worth far more
       than six right and one wrong, which is the right shape for a memory
       game.

       The numbers are round on purpose: a player should be able to see a
       score go up and know why without being told the formula. */
    const SEAT_POINTS = 100;            // a correct seat, on its own
    const STREAK_STEP = 25;             // and this much more per seat in a row
    const STREAK_MAX = 8;               // after which the bonus stops growing
    const WRONG_SEAT_POINTS = -75;      // sitting out of order
    const DECOY_POINTS = -50;           // sitting on a decoy
    const FINISH_BONUS = 250;           // clearing every seat in a round

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
            score: 0,                   // this round's points
            streak: 0,                  // correct seats in a row, for the bonus
            best: 0,                    // the longest streak this round
            lastScore: 0,               // what the last seat was worth, +/-
            message: "",
            endedBecause: "",

            start(now) {
                this.round = Drop.createRound(level, o);
                this.state = RUNNING;
                this.sat = [];
                this.penalty = 0;
                this.score = 0;
                this.streak = 0;
                this.best = 0;
                this.lastScore = 0;
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
                    this.award(DECOY_POINTS);
                    this.streak = 0;
                    this.message = `A decoy — that one was never in the sequence. ${DECOY_POINTS}`;
                    return "decoy";
                }

                /* ANY seat that is not the one wanted is a wrong seat, and
                   that includes the two cases the old `wanted && ...` let
                   through:

                     the builder's own scenery   a chair placed as decor is a
                                                 seat like any other, and
                                                 sitting on it is exactly the
                                                 mistake this rule is about

                     nothing wanted yet          before the first seat lands,
                                                 and in the gap after the last
                                                 has been sat on, `wanted` is
                                                 null — and a null `wanted`
                                                 used to fall through to the
                                                 CORRECT branch, so sitting on
                                                 a decor chair in that window
                                                 paid a hundred points */
                const wanted = this.nextSeat();
                if (seat !== wanted) {
                    this.penalty += WRONG_SEAT_PENALTY_S;
                    this.award(WRONG_SEAT_POINTS);
                    this.streak = 0;
                    this.message = `Out of order — ${WRONG_SEAT_POINTS} and the streak is gone.`;
                    return "wrong";
                }

                this.sat.push(seat);
                this.streak++;
                if (this.streak > this.best) this.best = this.streak;
                const bonus = Math.min(this.streak - 1, STREAK_MAX) * STREAK_STEP;
                this.award(SEAT_POINTS + bonus);

                if (!this.remaining().length && !this.round.queue.length && !this.round.falling.length) {
                    this.award(FINISH_BONUS);
                    this.state = WON;
                    this.endedBecause = "complete";
                    this.message = `Every seat, in order. +${FINISH_BONUS}`;
                    return "won";
                }
                this.message = bonus
                    ? `${this.sat.length} down. +${SEAT_POINTS + bonus} (${this.streak} in a row)`
                    : `${this.sat.length} down. +${SEAT_POINTS}`;
                return "sat";
            },

            /* THE SCORE GOES NEGATIVE, and it has to.

               It used to be clamped at zero, on the theory that a negative
               total reads as a debt rather than a round. What that actually
               produced is the complaint this whole system exists to answer:
               the first mistakes of a round are free. A round opens at zero,
               so the first wrong chair takes 75 from nothing and the total
               still says 0 — "sitting on the wrong seat doesn't seem to lose
               me points", because it didn't.

               A penalty you can only feel once you are already winning is not
               a penalty. Every wrong seat now costs, at every point in a
               round, and the number on screen says so. */
            award(points) {
                this.lastScore = points;
                this.score += points;
                return this.score;
            },

            // Everything the room should draw, falling pieces included.
            renderList() { return this.round ? this.round.renderList() : []; },

            blocked() {
                return this.round ? Furni.blockedTiles(this.round.renderList()) : new Set();
            },

            /* THE ROUND, FROZEN, for the run to keep.

               Taken at the moment a round ends, because almost none of it can
               be recovered afterwards: `advance` rolls the score into the
               run's bank and builds the next round over the top of this one,
               and the clock keeps running whatever happens. A run that wants
               to show you level three's time when you finish level five has
               to have written it down at the time. */
            summary(now) {
                const p = this.progress();
                const left = this.secondsLeft(now);
                return {
                    name: (level && level.name) || "Level",
                    won: this.state === WON,
                    why: this.endedBecause,
                    seats: p.done,
                    seatsOf: p.total,
                    // Seconds TAKEN, with the penalty called out separately —
                    // it is already inside the clock and would otherwise
                    // silently inflate the time with no explanation.
                    seconds: Math.max(0, (level.rules.seconds || 0) - left - this.penalty),
                    allowed: level.rules.seconds || 0,
                    penalty: this.penalty,
                    points: this.score,
                    streak: this.best
                };
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
            banked: 0,                  // points from the rounds already played
            /* One frozen summary per round PLAYED, in order — what the
               finishing screen reads. A lost round is in here too: the run
               ended on it, and "you got to level four and ran out of time with
               two seats left" is the sentence the screen exists to say. */
            results: [],

            level() { return this.levels[this.index] || null; },

            /* The run's score: what earlier rounds banked, plus whatever the
               round in play is worth right now. One number the whole way
               through, so a player watches it climb rather than being handed a
               total at the end. */
            score() { return this.banked + (this.game ? this.game.score : 0); },

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
                    this.results.push(this.game.summary(now));
                    this.banked += this.game.score;
                    this.index++;
                    if (this.index >= this.levels.length) { this.finished = true; return "finished"; }
                    this.startRound(now);
                    return "next";
                }
                // A lost round keeps whatever it earned: the seats were still
                // sat on in the right order, and taking them back at the end
                // punishes the same mistake twice.
                if (this.game.state === LOST) {
                    this.results.push(this.game.summary(now));
                    this.banked += this.game.score;
                    this.finished = true;
                    return "lost";
                }
                return null;
            },

            progressLabel() {
                return `Round ${Math.min(this.index + 1, this.levels.length)} of ${this.levels.length}`;
            }
        };
    }

    window.RoomGame = {
        createGame, createRun,
        IDLE, RUNNING, WON, LOST, WRONG_SEAT_PENALTY_S, DECOY_PENALTY_S,
        SEAT_POINTS, STREAK_STEP, STREAK_MAX, WRONG_SEAT_POINTS, DECOY_POINTS, FINISH_BONUS
    };
})();

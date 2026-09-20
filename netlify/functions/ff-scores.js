/* /.netlify/functions/ff-scores — the Fallin' Furni leaderboard.

   GET             the table, and the caller's own best if they are signed in
   POST {levels, ms}   records a finished run for the signed-in player

   Identity is the Discord session from _player.js, the same one the daily
   games use. Signing in is what puts a name on the board; the game itself is
   playable without it.

   ----------------------------------------------------------------------
   How much this trusts the page, and what it can actually check

   The round runs entirely in the browser — the clock, the drops and the
   sitting are all client-side — so a submitted result cannot be reproduced
   here the way guess-scores.js re-derives its five rooms. Being honest about
   that: a crafted request can claim a good run.

   What the server does know is the LEVELS, because it serves them. And a
   level cannot be finished before its last piece has landed:

       (drops - 1) * dropDelayMs + dropSpeedMs

   Summed over the levels claimed, that is a hard floor on any honest time.
   A run claiming to have cleared four levels faster than the furni could
   physically fall is refused. Claiming more levels than exist is refused.
   That kills the casual "edit the number" attempt, which is the realistic
   threat for a small archive's leaderboard; it does not stop somebody
   determined to write a plausible request, and pretending otherwise would be
   worse than saying so.

   One row per player, holding their BEST run — further first, then faster.
   A worse run never overwrites a better one, so the table cannot be walked
   backwards by replaying badly. */

const { getDb, ensureUniqueIndex, ensureIndex } = require("./_db");
const { playerFrom } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");

const COLLECTION = "ff_scores";
const LEVELS = "ff_levels";
const TOP = 25;

/* ---------------------------------------------------------------- A TOURNAMENT

   A window of days with a board of its own. There is one because the site
   opens on the 3rd of October and an all-time leaderboard is a poor thing
   to arrive at: the top of it was set weeks ago by somebody who has had the
   game to themselves, and a newcomer's first good run lands at position
   eleven. A week-long board that starts empty is a board everybody is at
   the top of on day one.

   ITS OWN COLLECTION, AND WHY IT HAS TO BE. ff_scores keeps ONE ROW PER
   PLAYER holding their all-time best, and a worse run never replaces a
   better one — so a tournament simply cannot be read out of it. A player
   whose best run predates the window would appear in it with a run they
   did not play that week, and a player whose best run predates the window
   AND who plays well during it would not appear at all, because their
   tournament run was refused for not beating a row from last month. Both
   of those are the wrong answer. So a run inside the window is written to
   both places, judged separately in each.

   ONE ROW PER PLAYER HERE TOO, on the same better-than rule, rather than a
   log of every run. It is the same kind of board, scoped to a week.

   THE DATES ARE UTC INSTANTS and the end is exclusive, so a week reads as
   "from the 3rd up to the 10th" with no argument about which side midnight
   falls on. `to` being exclusive also means the last day is whole.

   SET `id: null` TO TURN IT OFF. Everything below then behaves exactly as
   it did before this existed: no extra write on POST, no extra read on
   GET, and the page draws one board. The id is part of the row key, so
   changing it starts a fresh board rather than adding to the old one. */
const TOURNAMENT = {
    id: "launch-week-2026",
    name: "Launch Week",
    from: "2026-10-03T09:00:00Z",
    to: "2026-10-10T09:00:00Z"
};
const TOURNAMENT_COLLECTION = "ff_tournament";

/* How long the finished board stays up after the window closes.

   A tournament that vanishes the instant it ends is one nobody sees the
   result of — the interesting moment is the morning after, when people
   come back to find out who won. A fortnight, then it goes quietly and the
   all-time board is the only one again. */
const RESULT_LINGERS_MS = 14 * 24 * 60 * 60 * 1000;

function tournamentWindow(now = Date.now()) {
    if (!TOURNAMENT.id) return null;
    const from = Date.parse(TOURNAMENT.from);
    const to = Date.parse(TOURNAMENT.to);
    // A mistyped date must not take the leaderboard down with it.
    if (isNaN(from) || isNaN(to) || to <= from) return null;
    const running = now >= from && now < to;
    const showing = running || (now >= to && now - to < RESULT_LINGERS_MS);
    if (!showing) return null;
    return { id: TOURNAMENT.id, name: TOURNAMENT.name, from: TOURNAMENT.from, to: TOURNAMENT.to, running };
}

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

function dropsIn(level, role) {
    let drops = 0;
    for (const z of level.zones || []) {
        for (const it of z.items || []) {
            if (role && it.role !== role) continue;
            drops += Number(it.count) || 0;
        }
    }
    return drops;
}

/* ---- HOW MUCH OF A LEVEL CAN BE SKIPPED, and why the floor has to allow it.

   The floor used to be `(every scheduled drop - 1) * delay + fall`, on the
   reasoning that each piece costs a delay. That is not what room-drop.js
   does. A piece with nowhere safe to land is shifted off the queue WITHOUT
   advancing `nextAt` — skipped on the same tick, costing nothing — and the
   comment there is explicit that this happens on full levels, where the last
   few pieces all have nowhere to go. Sequence seats are not exempt: one that
   cannot land "comes off the plan" and the round is winnable without it.

   So the real minimum is always lower than the schedule suggests, by an
   amount the server cannot know: it depends on where the player was standing
   at each drop. Charging the full schedule made the floor an over-estimate,
   and an over-estimating floor REJECTS HONEST RUNS — which is a far worse
   failure than letting an inflated one through, the same trade the ceiling
   below is written around.

   Two changes, then. Only sequence seats are counted, because those are the
   ones a player must actually wait for and sit on — obstacles can all be
   skipped without affecting whether the round can be finished. And half of
   even those are assumed to have come off the plan.

   What is left still does the job it was written for. It refuses `ms: 1`,
   which is the realistic attempt; it just no longer refuses somebody playing
   well on a level that dropped fewer pieces than it planned to. */
const SKIP_ALLOWANCE = 0.5;

function floorMsFor(level) {
    const rules = level.rules || {};
    const delay = Number(rules.dropDelayMs) || 0;
    const fall = Number(rules.dropSpeedMs) || 0;
    const seats = dropsIn(level, "sequence");
    if (seats <= 0) return 0;
    // At least one piece falls, however much is assumed skipped.
    const landed = Math.max(1, Math.ceil(seats * (1 - SKIP_ALLOWANCE)));
    return (landed - 1) * delay + fall;
}

/* ---- THE MOST A LEVEL CAN POSSIBLY BE WORTH.

   Mirrors the point values in js/room-game.js. They are duplicated rather than
   shared because that file is a browser IIFE with no export, and the same is
   already true of `floorMsFor` above and the drop schedule it mirrors — if
   those numbers change, this changes with them.

   STILL GENEROUS, but no longer absurd. It assumes every SEQUENCE seat is
   taken in one unbroken streak with the whole clock left over — not reachable
   in practice, since nobody clears a round with the full time showing, but
   the right side to err on: a ceiling that is too low refuses an honest run,
   which is worse than letting an inflated one through.

   WHAT CHANGED: it used to count every scheduled drop as a scoring seat.
   Two thirds of the pieces in the published levels are sequence seats and the
   rest cannot pay anything at all — an obstacle is never sat on, a decoy is
   -5, and a poi ENDS THE ROUND (see the seat branches in js/room-game.js).
   Counting them as ten points plus a streak step put the ceiling at nearly
   twice what the board's best real run had scored, which is enough room for a
   crafted request to take first place and look ordinary doing it.

   Counting only what can actually pay closes most of that gap without moving
   the ceiling below any run a person could really have. */
const SEAT_POINTS = 10;
const STREAK_STEP = 2;
const STREAK_MAX = 8;
const FINISH_BONUS = 25;
const TIME_BONUS_PER_S = 1;

/* AND THE LIVES, which are worth points at the end of a run and would
   otherwise push an honest run through the ceiling. A player starts with
   three and earns one per five levels cleared, so at `levels` cleared the
   most they can be holding is 3 + floor(levels / 5) — the same arithmetic as
   js/room-game.js, duplicated here for the same reason everything else on
   this page is. Generous like the rest of the ceiling: it assumes none were
   ever spent. */
const STARTING_LIVES = 3;
const LIFE_EVERY = 5;
const LIFE_BONUS = 100;
const maxLifeBonus = (levels) => (STARTING_LIVES + Math.floor(levels / LIFE_EVERY)) * LIFE_BONUS;

function maxPointsFor(level) {
    // Sequence only. Nothing else in a level can add a point to a run.
    const seats = dropsIn(level, "sequence");
    let total = FINISH_BONUS + (Number((level.rules || {}).seconds) || 0) * TIME_BONUS_PER_S;
    for (let n = 1; n <= seats; n++) {
        total += SEAT_POINTS + Math.min(n - 1, STREAK_MAX) * STREAK_STEP;
    }
    return total;
}

/* `points` defaults to 0 so a row written before the board ranked on them
   reads as a real row with nothing scored rather than as a hole in the
   table. Those rows sort to the bottom until their owner plays again, which
   is the honest answer: nobody knows what that run was worth. */
/* `habbo` is NOT in here, and is no longer stored either.

   It was written from whatever the client put in the field and handed back to
   every caller by this function, while nothing on the page has ever rendered
   it — so it was an arbitrary attacker-chosen string travelling to every
   visitor's browser and waiting for the first piece of code that decided to
   display it. A stored cross-site scripting hole with the scripting part not
   written yet. Removed rather than escaped: an unused field cannot be escaped
   wrongly later. The name on the board is the Discord one, which comes from
   the signed session and not from the request body. */
const clean = (row) => ({
    name: row.name,
    avatar: row.avatar || null,
    points: Number(row.points) || 0,
    levels: row.levels,
    ms: row.ms,
    at: row.at
});

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const scores = db.collection(COLLECTION);
    const player = playerFrom(event);

    if (event.httpMethod === "GET") {
        /* HIGHEST SCORE FIRST, then faster, then whoever got there earliest.

           It used to be furthest-then-fastest, which said that every clean run
           of the same levels was the same run — the order you sat in, the
           streak you held and the chairs you got wrong all counted for nothing
           once the round was over. Points carry all of that AND the two things
           the old ranking had: 250 a level plus the seats only reachable by
           getting there, and ten a second for the clock. The time is still the
           tie-break, for the rare exact draw. */
        /* The index the sort below needs. Both boards rank on the same
           three keys, and a leaderboard that reads 25 rows out of a few
           hundred should walk an index rather than sort the lot in memory
           every time the title screen is opened — which, during launch
           week, is a great many times. */
        await ensureIndex(scores, { points: -1, ms: 1, at: 1 });

        const top = await scores
            .find({}, { projection: { _id: 0 } })
            .sort({ points: -1, ms: 1, at: 1 })
            .limit(TOP)
            .toArray();

        const out = { count: top.length, top: top.map(clean) };
        if (player) {
            const mine = await scores.findOne({ playerId: player.id }, { projection: { _id: 0 } });
            out.you = mine ? clean(mine) : null;
            out.signedIn = { name: player.name || player.username, id: player.id };
        }

        /* The tournament board, when there is one running or just finished.

           A second query rather than folding it into the one above: it is a
           different collection with a different scope, and it only exists
           for a fortnight or so a year. Sorted the same way the all-time
           board is, because it is the same kind of ranking over a smaller
           set of runs, and a board that ranked differently from the one
           above it would be a board nobody could read.

           Failures here are swallowed. This is a decoration on a page whose
           job is to let somebody play a game: if the tournament collection
           is unreachable the all-time board should still be served, not a
           500. */
        const meet = tournamentWindow();
        if (meet) {
            try {
                const meetCol = db.collection(TOURNAMENT_COLLECTION);
                await ensureIndex(meetCol, { tid: 1, points: -1, ms: 1, at: 1 });
                const rows = await meetCol
                    .find({ tid: meet.id }, { projection: { _id: 0 } })
                    .sort({ points: -1, ms: 1, at: 1 })
                    .limit(TOP)
                    .toArray();
                out.tournament = { ...meet, top: rows.map(clean) };
                if (player) {
                    const mine = await db.collection(TOURNAMENT_COLLECTION)
                        .findOne({ tid: meet.id, playerId: player.id }, { projection: { _id: 0 } });
                    out.tournament.you = mine ? clean(mine) : null;
                }
            } catch (e) { /* the all-time board is still worth serving */ }
        }

        return json(200, out);
    }

    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    /* Not signed in is not an error — the game is playable either way, and
       the page needs to be able to say "sign in to be on the board" rather
       than treat a guest run as a failure. */
    if (!player) return json(200, { recorded: false, reason: "signed-out" });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Body is not JSON" }); }

    const levels = Math.max(0, Math.round(Number(body.levels) || 0));
    const ms = Math.max(0, Math.round(Number(body.ms) || 0));
    // Not floored at zero: a round can genuinely be played into the red, and
    // saying so is the point of letting the score go negative at all.
    const points = Math.round(Number(body.points) || 0);
    if (!levels) return json(200, { recorded: false, reason: "no-levels-cleared" });

    const published = await db.collection(LEVELS)
        .find({ published: true }, { projection: { _id: 0 } })
        .sort({ order: 1 })
        .toArray();

    if (levels > published.length) {
        return json(400, { error: "More levels than exist" });
    }

    const floor = published.slice(0, levels).reduce((n, lv) => n + floorMsFor(lv), 0);
    if (ms < floor) {
        return json(400, { error: "That run is faster than the furni can fall" });
    }

    /* The same trick as the time floor, from the other end: the levels are
       served from here, so the most they can be worth is known here. */
    const ceiling = published.slice(0, levels).reduce((n, lv) => n + maxPointsFor(lv), 0)
        + maxLifeBonus(levels);
    if (points > ceiling) {
        return json(400, { error: "That run scores more than those levels can pay" });
    }

    await ensureUniqueIndex(scores, "playerId");

    const row = {
        playerId: player.id,
        name: player.name || player.username || "Someone",
        avatar: player.avatar || null,
        points, levels, ms,
        at: new Date().toISOString()
    };

    /* Beaten on points, or matched on points and beaten on the clock — the
       same order the table is sorted in, so a row can never be one the board
       would rank below what it replaced. A row from before points existed
       counts as zero, so the owner's next finished run always takes its
       place rather than being refused by a total nobody recorded. */
    const previous = await scores.findOne({ playerId: player.id });
    const previousPoints = previous ? Number(previous.points) || 0 : 0;
    const better = !previous
        || points > previousPoints
        || (points === previousPoints && ms < previous.ms);

    if (better) {
        await scores.updateOne({ playerId: player.id }, { $set: row }, { upsert: true });
    }

    /* And onto the tournament board, judged on its own terms.

       DELIBERATELY NOT `if (better)`. The two boards are scored
       independently: a run can be the best a player has managed this week
       while falling short of the best they have ever managed, and that run
       is exactly what a week-long board is for. Nesting this inside the
       block above — which is the obvious thing to write — would silently
       drop the runs the tournament exists to collect.

       `running`, not `showing`: the fortnight the finished board lingers
       for is a fortnight nobody can add to it.

       Written after the main row and in its own try. A tournament is a
       nice-to-have on top of a leaderboard; if this collection is having a
       bad afternoon the player's real score has already been recorded and
       the response below is still the truth about it. */
    const meet = tournamentWindow();
    if (meet && meet.running) {
        try {
            const meetRows = db.collection(TOURNAMENT_COLLECTION);
            await ensureUniqueIndex(meetRows, ["tid", "playerId"]);
            const prev = await meetRows.findOne({ tid: meet.id, playerId: player.id });
            const prevPoints = prev ? Number(prev.points) || 0 : 0;
            const betterHere = !prev
                || points > prevPoints
                || (points === prevPoints && ms < prev.ms);
            if (betterHere) {
                await meetRows.updateOne(
                    { tid: meet.id, playerId: player.id },
                    { $set: { ...row, tid: meet.id } },
                    { upsert: true }
                );
            }
        } catch (e) { /* the run is on the real board either way */ }
    }

    return json(200, {
        recorded: better,
        reason: better ? null : "not-your-best",
        best: clean(better ? row : previous)
    });
};

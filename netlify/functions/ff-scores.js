/* /.netlify/functions/ff-scores — the Fallin' Furni leaderboard.

   GET             the table, and the caller's own best if they are signed in
   POST ?action=start  a signed run token, asked for when Play is pressed
   POST {levels, ms, points, run}   records a finished run for the signed-in
                   player, `run` being that token (see THE RUN TOKEN)

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

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getDb, ensureUniqueIndex, ensureIndex } = require("./_db");
const { playerFrom } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");

const COLLECTION = "ff_scores";
const LEVELS = "ff_levels";
const TOP = 25;

/* ---------------------------------------------------------------- IS IT OPEN

   The board used to take a run whatever the game's own state said. The page
   hides Play while Fallin' Furni is "coming soon" or in maintenance, but an
   admin still plays it closed (that is what closing it is for), and a
   hidden button was never a lock — so test runs went straight onto the
   public board, and one of them (9,190 points, 17 September) was sitting at
   the top of it a fortnight before anybody else could play.

   Read here from the same document settings.js writes — `settings`,
   `_id: "site"` — and with the same default: a site that has never set the
   field is live, as it always was. Read straight from Mongo rather than
   through GET /settings, whose edge copy may be twenty seconds old.

   The launch comes with it because the GET needs it too: see `sinceLaunch`.

   WHICH LAUNCH. Fallin' Furni opens after the site does, so it has a date
   of its own, settings.ffLaunchAt, set in /warren beside its switch. The
   board is cut at that when it is set, and at the SITE's launchAt when it
   is not — so the pre-launch test runs stay hidden from the moment the
   site opens, even before anybody has decided when the game does. Neither
   date opens the game; fallinFurniState alone does that, by hand.

   `ffLaunchAt` is also returned on its own, because Launch Week hangs off
   the game's date and only the game's: a week that started with the site
   would be half over before anybody could play in it. See A TOURNAMENT. */
const CLOSED_STATES = ["coming-soon", "maintenance"];

// An ISO string, or null for missing or unparseable. settings.js stores
// both dates through toISOString(), and every `at` on this board is written
// the same way, so they compare correctly as strings — which is what lets
// the filter below be a plain range query.
function isoOrNull(value) {
    const ms = value ? Date.parse(value) : NaN;
    return isNaN(ms) ? null : new Date(ms).toISOString();
}

async function readGate(db) {
    const doc = await db.collection("settings").findOne(
        { _id: "site" }, { projection: { fallinFurniState: 1, launchAt: 1, ffLaunchAt: 1 } }
    );
    const state = (doc && doc.fallinFurniState) || "live";
    const ffLaunchAt = isoOrNull(doc && doc.ffLaunchAt);
    const launchAt = ffLaunchAt || isoOrNull(doc && doc.launchAt);
    /* When the game was first open for play on or after its launch date —
       see WHEN IT ACTUALLY OPENED. Only asked for when there is a date, and
       a failed read is "not known yet" rather than a failed request. */
    let openedMs = null;
    if (ffLaunchAt) {
        const opened = await db.collection(META).findOne({ _id: openedKey(ffLaunchAt) })
            .catch(() => null);
        const ms = opened && opened.at ? new Date(opened.at).getTime() : NaN;
        if (Number.isFinite(ms)) openedMs = ms;
    }
    return {
        open: !CLOSED_STATES.includes(state),
        // The effective launch for this board: the game's own, else the site's.
        launchAt,
        launchMs: launchAt ? Date.parse(launchAt) : null,
        // The game's own, or null. Only Launch Week reads this.
        ffLaunchAt,
        openedMs
    };
}

/* ---------------------------------------------------------------- WHEN IT ACTUALLY OPENED

   The game has two controls that each say when it starts — the switch
   (fallinFurniState) and the date (ffLaunchAt) — set separately in /warren,
   and nothing made them agree. Launch Week hung off the date alone, so a
   game whose date came and went with the switch still shut spent its
   tournament closed: open it two days late and the week had five days left.

   So the week starts at the LATER of the date and the moment the game was
   actually playable after it. That moment is not stored anywhere — the
   switch keeps no history — and the closest thing this server sees is the
   first run token it hands out on or after the date, since a token is only
   ever issued with the switch open (see ?action=start). That is the first
   Play press of the launch, which on a launch day is within moments of the
   game opening; on a game that opened late it is when it opened.

   Kept in a collection of its own, one document per launch date, so moving
   the date starts the question again. `$min`, so two first presses racing
   keep the earlier. Memoised per warm instance once written: after the
   first, every later token is later still and cannot change it. */
const META = "ff_meta";
const openedKey = (ffLaunchAt) => "opened:" + ffLaunchAt;
const openedNoted = new Set();

async function noteOpened(db, gate, now) {
    if (!gate.ffLaunchAt || !gate.open) return;
    const launch = Date.parse(gate.ffLaunchAt);
    if (!Number.isFinite(launch) || now < launch) return;
    if (gate.openedMs !== null || openedNoted.has(gate.ffLaunchAt)) return;
    try {
        await db.collection(META).updateOne(
            { _id: openedKey(gate.ffLaunchAt) },
            { $min: { at: new Date(now) } },
            { upsert: true }
        );
        openedNoted.add(gate.ffLaunchAt);
    } catch (e) { /* the week falls back to the date; nothing else depends on it */ }
}

/* ONLY WHAT WAS PLAYED AFTER LAUNCH is on the board, when there is a launch.

   The pre-launch test runs are still in the collection and are left there:
   deleting them would be a production write to tidy up a display, and the
   filter does the same job with nothing to undo. A row older than launchAt
   is simply never read. Clearing launchAt puts them back, which is the
   honest behaviour for a site that has not decided when it opens. */
const sinceLaunch = (gate) => (gate.launchAt ? { at: { $gte: gate.launchAt } } : {});
const afterLaunch = (gate, row) => Boolean(row) && (!gate.launchAt || String(row.at || "") >= gate.launchAt);

/* ---------------------------------------------------------------- THE RUN TOKEN

   Everything above the physics floor and the points ceiling was a request a
   person could type: {levels: 50, ms: 404830, points: 13919} passed both,
   because both are generous on purpose. What the server did NOT know was
   when the run started, so it could not tell a fifty-level run from a
   sentence typed into a terminal a second ago.

   Now it does. Pressing Play asks for a token (POST ?action=start); the
   server signs the moment it was asked and a random run id, and the run's
   submission has to carry it back. That buys three checks nothing else can:

     - the run cannot claim more time than has actually passed since the
       token was issued. The page's `ms` is game time — pauses and hidden
       tabs are taken OUT of it (see gameNow in js/fallinfurni.js) — so an
       honest run is always at or under the wall-clock gap, and
       RUN_TOLERANCE_MS covers the start request's own latency, a cold start
       included, since the page starts its clock as it sends the request and
       the token is stamped when the function gets round to answering;
     - a token issued before launch cannot put a run on the board after it;
     - one token is one entry. Its run id is inserted into ff_run_tokens
       before the board is touched, and _id is unique, so a second
       submission with the same token is refused by the database itself
       rather than by a read-then-write that two requests could both pass.

   Signed with SESSION_SECRET like every other token here, under an audience
   of its own so it can never be mistaken for a player or admin session
   (see the audience notes in _auth.js and _player.js).

   STILL NOT PROOF OF PLAY, and not claimed to be: a determined person can
   ask for a token, wait the length of a plausible run, and submit. What it
   removes is the instant forgery, which is the one anybody would try. */
const RUN_AUDIENCE = "mazerats-ffrun";
const RUN_LIFE_S = 3 * 60 * 60;
const RUN_TOLERANCE_MS = 15 * 1000;
const RUN_TOKENS = "ff_run_tokens";

function signRun(player, now) {
    if (!process.env.SESSION_SECRET) return null;
    const claims = { rid: crypto.randomBytes(12).toString("hex"), t: now || Date.now() };
    // Bound to the account when there is one, so a token cannot be handed
    // to somebody else's session. A signed-out start stays unbound: signing
    // in means leaving the page, which ends the run anyway.
    if (player) claims.sub = player.id;
    return jwt.sign(claims, process.env.SESSION_SECRET, {
        audience: RUN_AUDIENCE, expiresIn: RUN_LIFE_S, algorithm: "HS256"
    });
}

// The claims, or null for anything missing, forged, expired or malformed.
function readRun(token, player) {
    if (!token || typeof token !== "string" || !process.env.SESSION_SECRET) return null;
    try {
        const c = jwt.verify(token, process.env.SESSION_SECRET, {
            audience: RUN_AUDIENCE, algorithms: ["HS256"]
        });
        if (!c || typeof c.rid !== "string" || !/^[0-9a-f]{24}$/.test(c.rid)) return null;
        if (!Number.isFinite(c.t)) return null;
        if (c.sub && player && String(c.sub) !== String(player.id)) return null;
        return c;
    } catch (e) {
        return null;
    }
}

/* The spent-token list prunes itself. A token is dead three hours after it
   was issued whatever this collection says, so a row only has to outlive
   that; an hour's margin on top. Built here rather than through
   ensureIndex in _db.js, which takes no options and so cannot make a TTL
   index. Memoised per warm instance the same way. */
let runTokensIndexed = false;
async function spendRun(db, claims, player) {
    const col = db.collection(RUN_TOKENS);
    if (!runTokensIndexed) {
        runTokensIndexed = true;
        try { await col.createIndex({ at: 1 }, { expireAfterSeconds: RUN_LIFE_S + 3600 }); }
        catch (e) { /* the unique _id is the part that matters */ }
    }
    try {
        await col.insertOne({ _id: claims.rid, at: new Date(), playerId: player.id });
        return true;
    } catch (e) {
        if (e && e.code === 11000) return false;
        throw e;
    }
}

/* ---------------------------------------------------------------- A TOURNAMENT

   A window of days with a board of its own. There is one because the game
   opens to everybody at once and an all-time leaderboard is a poor thing
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

   NO DATES IN HERE. It used to be written in: 3 to 11 October, the site's
   launch week. Then the game's launch moved to a week or two after the
   site's, with no date yet, and a hard-coded week would have run and ended
   while the game was still closed. So the window hangs off
   settings.ffLaunchAt (see readGate), and moves when that does.

   THE DATES ARE UTC INSTANTS and the end is exclusive. `from` is the game's
   launch itself, to the minute — an hour's gap between the two was once an
   hour whose runs reached the all-time board and not this one. `to` is
   MIDNIGHT AT THE END OF THE SEVENTH DAY, counting the launch day as day
   one, not seven days to the minute: the page says "Ends <that day>", and a
   window that shut at the launch hour that morning made the sentence false
   for the whole of the day it named. Exclusive, so the last instant inside
   the window is 23:59:59.999 on the seventh day, and that is the instant
   the page formats (in UTC — see meetEnds in js/fallinfurni.js). Launching
   08:00Z on Saturday the 17th, it ends as Friday the 23rd does.

   NO ffLaunchAt, NO TOURNAMENT. Everything below then behaves exactly as it
   did before this existed: no extra write on POST, no extra read on GET,
   and the page draws one board. The id carries the launch DATE and is part
   of the row key, so moving the launch to another day starts a fresh board
   rather than adding to the old one — nudging it by an hour on the same
   day does not, and the rows from before the new hour are cut by
   `sinceLaunch` anyway. */
const TOURNAMENT_NAME = "Launch Week";
const TOURNAMENT_DAYS = 7;
const TOURNAMENT_COLLECTION = "ff_tournament";
const DAY_MS = 24 * 60 * 60 * 1000;

// The window from the gate, or null. Not "is it showing" — see below.
function launchWeek(gate) {
    let from = gate && gate.ffLaunchAt ? Date.parse(gate.ffLaunchAt) : NaN;
    // A date that cannot be read must not take the leaderboard down with it.
    if (isNaN(from)) return null;
    /* FROM WHEN IT OPENED, if that was later than the date — see WHEN IT
       ACTUALLY OPENED. Nobody has played since the date and the switch is
       still shut: the week has not begun, whatever the calendar says, and
       there is nothing to show. (Open and not yet played in, the date
       stands until the first Play press moves it — by moments.) */
    if (gate.openedMs !== null && gate.openedMs !== undefined) {
        from = Math.max(from, gate.openedMs);
    } else if (!gate.open && Date.now() >= from) {
        return null;
    }
    const launchDay = Math.floor(from / DAY_MS) * DAY_MS;      // 00:00Z that day
    const to = launchDay + TOURNAMENT_DAYS * DAY_MS;
    const fromIso = new Date(from).toISOString();
    return {
        id: "launch-week-" + fromIso.slice(0, 10),
        name: TOURNAMENT_NAME,
        from: fromIso,
        to: new Date(to).toISOString(),
        fromMs: from,
        toMs: to
    };
}

/* How long the finished board stays up after the window closes.

   A tournament that vanishes the instant it ends is one nobody sees the
   result of — the interesting moment is the morning after, when people
   come back to find out who won. A fortnight, then it goes quietly and the
   all-time board is the only one again. */
const RESULT_LINGERS_MS = 14 * 24 * 60 * 60 * 1000;

function tournamentWindow(gate, now = Date.now()) {
    const week = launchWeek(gate);
    if (!week) return null;
    const running = now >= week.fromMs && now < week.toMs;
    const showing = running || (now >= week.toMs && now - week.toMs < RESULT_LINGERS_MS);
    if (!showing) return null;
    return { id: week.id, name: week.name, from: week.from, to: week.to, running };
}

/* WHICH TOURNAMENT A RUN BELONGS TO, decided by when it STARTED — the run
   token's `t`, stamped by this server when Play was pressed.

   It used to be decided by when the run was submitted. A run started at
   23:50 on the last night and finished at 00:10 was played almost entirely
   inside the week and was dropped from its board; a run begun a minute
   before the window opened and finished inside it was counted, having been
   started before anybody else could. Both wrong for the same reason.

   A run started inside [from, to) counts however late it finishes, up to
   the longest a run can last: its token dies RUN_LIFE_S after issue, and
   readRun has already refused a dead one, so the explicit bound below only
   says the same thing where the next reader will look for it. */
function tournamentFor(gate, startedAt, now = Date.now()) {
    const week = launchWeek(gate);
    if (!week || !Number.isFinite(startedAt)) return null;
    if (startedAt < week.fromMs || startedAt >= week.toMs) return null;
    if (now >= week.toMs + RUN_LIFE_S * 1000) return null;
    return { id: week.id };
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

/* ---------------------------------------------------------------- THE BREAKDOWN

   Every check above this line was on TOTALS, and totals are the easy thing
   to forge. Ask for a token, wait out the summed time floor — about 405
   seconds for all fifty levels — and post {levels: 50} with the summed
   points ceiling: every check passed, because every check was "could fifty
   levels add up to this?", and they could.

   So a run now comes with its rounds: one per level its score is made of,
   in order, each with the level's id, the milliseconds it took and the
   points it paid. Each is held to THAT level's own ceiling and clock, from
   the level as this server serves it, and to a floor tied to the points it
   claims (see A LEVEL'S FLOOR IS TIED TO ITS POINTS); and the totals must
   be exactly what the rounds add up to. A forged
   maximum now has to be a forged maximum fifty times over, each one inside
   its own level's clock — and then agree with the run log (see THE RUN
   LOG below).

   `ids` is the run's LEVEL LIST, as the page was dealt it when Play was
   pressed. The rounds are checked against those levels, not against the
   first N of whatever is published by the time the run ends — an owner
   publishing, unpublishing or reordering levels in the middle of somebody's
   run used to move the floor and ceiling under it, and refuse it for
   levels it never played. A listed level has to have been published in
   the version the run played (see LEVELS AS PLAYED) — or, for a run that
   did not say which version, published now: a draft's numbers are not the
   game's.

   The rounds are what RoomGame banks: the levels cleared, and at most one
   more at the end that was not — the round lost on the last life, or the
   one walked out of. A retried round is not in the score and is not sent.
   What the rounds do not account for is the life bonus, which is only paid
   on a run that cleared every level it was dealt, in whole lives. */
const MAX_LEVEL_ID = 64;
/* A level's time is measured on the same clock as its limit, so an honest
   one is always inside it; this is only room for the rounding. */
const LEVEL_MS_TOLERANCE = 1000;
// The rounds are slices of the run's own clock and cannot add up to more.
const RUN_SUM_TOLERANCE_MS = 2000;

/* ---- A LEVEL'S FLOOR IS TIED TO ITS POINTS.

   floorMsFor, which the run's TOTAL is held to, assumes half a level's
   seats land — and over a whole run that holds, because the levels that
   skip a lot and the ones that skip nothing average out. Level by level it
   does not: the bot through all fifty levels cleared Level 39 in 6.2
   seconds against a floor of 9.7, because eleven of its fourteen seats had
   nowhere safe to land and came off the plan (see room-drop.js). A
   per-level floor built that way would refuse honest runs, which is the
   one thing these checks must never do.

   What is true of every round is this: each seat you are paid for is a
   piece that LANDED, pieces land at least a drop delay apart, and the
   first takes a whole fall. So the points a round claims say how many
   seats it must at least have sat on — counted as generously as possible,
   one unbroken streak with every second the clock could have left paid on
   top — and that many seats cannot have landed faster than
   (seats - 1) * delay + fall. A round that paid a lot has to have taken
   the time to be paid it; a round that skipped most of its seats was
   quick, and also scored little. The forged maximum needs every seat, so
   it needs every seat's time. */
function seatPoints(k) {
    let total = 0;
    for (let n = 1; n <= k; n++) total += SEAT_POINTS + Math.min(n - 1, STREAK_MAX) * STREAK_STEP;
    return total;
}

function earnedFloorMs(level, points, ms, won) {
    const rules = level.rules || {};
    const delay = Number(rules.dropDelayMs) || 0;
    const fall = Number(rules.dropSpeedMs) || 0;
    const seats = dropsIn(level, "sequence");
    // What the clock and the finish could have paid, at the very most.
    const allowed = Number(rules.seconds) || 0;
    const clock = won ? Math.max(0, Math.floor(allowed - ms / 1000)) * TIME_BONUS_PER_S : 0;
    const fromSeats = points - (won ? FINISH_BONUS : 0) - clock;
    if (fromSeats <= 0) return 0;
    let k = 0;
    while (k < seats && seatPoints(k) < fromSeats) k++;
    if (seatPoints(k) < fromSeats) return Infinity;     // more than its seats can pay
    return k ? (k - 1) * delay + fall : 0;
}

/* The lowest a round can honestly score. Nothing is gained by claiming
   less, so this is generous to the point of being a type check: every
   mistake costs at most ten points and at least two seconds of the clock
   (see the penalties in js/room-game.js). */
function minPointsFor(level) {
    const secs = Number((level.rules || {}).seconds) || 0;
    return -10 * (Math.ceil(secs / 2) + 10);
}

/* ---- THE LEVEL LIST HAS TO BE THE GAME'S, FROM THE TOP.

   `ids` was only checked for being published levels, each once. Nothing
   said they were the levels the game deals, in the order it deals them —
   so a run could list the five easiest levels in the game as its first
   five, play those, and be ranked beside runs that fought through levels
   one to five. Every per-level check below would pass, because each round
   really was inside its own level's numbers.

   So the list must be a PREFIX OF THE PUBLISHED ORDER: level one first, and
   no published level skipped before the last one listed. The page deals
   every published level, sorted by `order` (see ff-levels.js), so an honest
   list is the whole order as it stood when the page read it.

   "As it stood" is the catch, and the reason this is not a plain equality.
   The page reads the list once, at load, through the edge cache, whose
   copy may be up to a day old (stale-while-revalidate, see _cache.js) — so
   the list a run was dealt can predate a level being published, moved or
   unpublished by that long, plus the run itself. The code above already
   tolerates those edits (see THE BREAKDOWN), and this must not start
   refusing the runs it was written to let through. So a level changed
   within LEVEL_LIST_SLACK_MS before the run's token was issued is left out
   of the comparison: it may be missing from the list, or sit anywhere in
   it. A level unpublished mid-run is still refused, as it always was, by
   the "not published" check below. Only levels that have held still since
   well before the run are held to the order — which is every level, on
   every day the owner is not editing them.

   Levels that share an `order` value have no defined order between them
   (Mongo returns ties however it likes), so ties may come in either order,
   and the prefix is only enforced strictly below the last listed value.

   A page left open for more than a day across a reorder would be refused
   by that slack alone — which is why, when the run says which VERSION of
   each level it was dealt (see LEVELS AS PLAYED), the slack is replaced by
   something exact: `published` is then the levels as they stood when the
   token was issued, and `settledBefore` the moment the page's list is
   known to be at least as new as. The 26 hours are only the fallback, for
   a run that came without versions. */
const LEVEL_LIST_SLACK_MS = 26 * 60 * 60 * 1000;

function followsPublishedOrder(ids, published, startedAt, settledAt) {
    const settledBefore = Number.isFinite(settledAt) ? settledAt
        : (Number.isFinite(startedAt) ? startedAt : Date.now()) - LEVEL_LIST_SLACK_MS;
    const changedAt = (lv) => {
        const ms = Date.parse(lv.updatedAt || lv.createdAt || "");
        return Number.isFinite(ms) ? ms : -Infinity;      // no stamp: older than stamps
    };
    const settled = (lv) => changedAt(lv) < settledBefore;
    const orderOf = (lv) => Number(lv.order) || 0;
    const byId = new Map(published.map(lv => [String(lv.id), lv]));
    let last = -Infinity;
    for (const id of ids) {
        const lv = byId.get(id);
        if (!lv || !settled(lv)) continue;
        if (orderOf(lv) < last) return false;       // out of order
        last = orderOf(lv);
    }
    const listed = new Set(ids);
    // A settled level ahead of the last one listed, and missing: skipped.
    return !published.some(lv => settled(lv) && !listed.has(String(lv.id)) && orderOf(lv) < last);
}

// { dealt, rounds } or { error }. `totals` is the body's own levels/ms/points.
// `startedAt` is the run token's `t`; see THE LEVEL LIST HAS TO BE THE GAME'S.
// `view`, when given, is levelsAsPlayed's answer: each id's level AS PLAYED,
// and the published order as of the token. Without it, as it always was —
// every level as it stands now.
function checkBreakdown(body, totals, published, startedAt, view) {
    const bad = (error) => ({ error });
    const ids = Array.isArray(body.ids) ? body.ids : null;
    const rounds = Array.isArray(body.rounds) ? body.rounds : null;
    if (!ids || !rounds || !ids.length || !rounds.length) {
        return bad("That run came without its level-by-level breakdown");
    }
    const listable = view ? Math.max(published.length, view.order.length) : published.length;
    if (ids.length > listable) return bad("More levels than exist");

    const byId = view ? view.dealt : new Map(published.map(lv => [String(lv.id), lv]));
    const seen = new Set();
    const dealt = [];
    for (const id of ids) {
        if (typeof id !== "string" || !id || id.length > MAX_LEVEL_ID || seen.has(id)) {
            return bad("That run's level list is not valid");
        }
        const lv = byId.get(id);
        if (!lv) return bad("That run lists a level that is not published");
        seen.add(id);
        dealt.push(lv);
    }
    if (!(view ? followsPublishedOrder(ids, view.order, startedAt, view.settledBefore)
               : followsPublishedOrder(ids, published, startedAt))) {
        return bad("That run's levels are not the game's, in the game's order");
    }
    if (rounds.length > dealt.length) return bad("That run has more rounds than levels");

    const out = [];
    let won = 0, sumPoints = 0, sumMs = 0;
    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i] && typeof rounds[i] === "object" ? rounds[i] : {};
        const lv = dealt[i];
        const name = String(lv.name || lv.id).slice(0, 80);
        if (String(r.id) !== String(lv.id)) return bad("That run's rounds are not in its levels' order");
        const ms = Number(r.ms);
        const pts = Number(r.points);
        if (!Number.isFinite(ms) || ms < 0 || !Number.isInteger(pts)) {
            return bad("That run's rounds are not valid");
        }
        const isWon = r.won === true;
        if (!isWon && i !== rounds.length - 1) {
            return bad("Only a run's last round can be one it did not clear");
        }
        const allowedMs = (Number((lv.rules || {}).seconds) || 0) * 1000;
        if (ms > allowedMs + LEVEL_MS_TOLERANCE) return bad(`${name} took longer than its clock allows`);
        if (pts > maxPointsFor(lv)) return bad(`${name} scored more than it can pay`);
        // See A LEVEL'S FLOOR IS TIED TO ITS POINTS.
        if (ms < earnedFloorMs(lv, pts, ms, isWon)) {
            return bad(`${name} scored more than its furni could have landed in that time`);
        }
        if (pts < minPointsFor(lv)) return bad(`${name} scored less than it can cost`);
        if (isWon) won++;
        sumPoints += pts;
        sumMs += ms;
        out.push({ id: String(lv.id), ms: Math.round(ms), points: pts, won: isWon });
    }

    if (won !== totals.levels) return bad("The levels cleared do not match the rounds");
    if (sumMs > totals.ms + RUN_SUM_TOLERANCE_MS) return bad("The rounds add up to longer than the run");
    const bonus = totals.points - sumPoints;
    if (bonus !== 0) {
        const finished = won === dealt.length;
        if (!finished || bonus < 0 || bonus % LIFE_BONUS !== 0 || bonus > maxLifeBonus(won)) {
            return bad("The points do not add up to the rounds");
        }
    }
    return { dealt, rounds: out };
}

/* ---------------------------------------------------------------- LEVELS AS PLAYED

   Every check above reads a level's numbers, and until now they were the
   level's numbers as they stood when the run was SUBMITTED. An owner
   shortening a clock, slowing the drops or unpublishing a level while
   somebody was mid-run had their honest run refused for rules it never
   played under. Levels are versioned now (see VERSIONS in ff-levels.js):
   each save bumps the level's `rev` and keeps a snapshot of what these
   checks read, in ff_level_versions, and the page sends back `revs`, the
   version of each level in `ids` it was dealt.

   EACH LEVEL IS JUDGED BY THE VERSION IT WAS PLAYED AT, found in this order:

     1. the level as it stands, if it IS that version, was published, and
        was last written before the token was issued;
     2. otherwise that version's snapshot, if it was published and written
        before the token;
     3. otherwise the level as it stands, if it is published — exactly how
        every run was judged before, so a run with no `revs` (a page from
        before this), a version that has expired, or one that never existed
        is no worse off than it was.

   "BEFORE THE TOKEN" is what keeps the choice honest. A page has to have
   the level to play it, and it fetches the levels before Play is pressed,
   so any version it can really have played was written before its token.
   One written later cannot have been, and falls through to step 3. An
   OLDER version is honoured however old it is — a tab left open overnight
   is still an honest player — for as long as the store keeps it.

   AND THE VERSIONS HAVE TO HAVE BEEN LIVE TOGETHER. The page reads every
   level in one request, so the versions it was dealt were all current at
   one moment. That moment is at least the newest of their stamps, and
   before any of them was replaced. A mix that never coexisted — the easy
   old clock of one level beside a level added after it changed — is not
   anything a page was ever served, and the whole run falls back to step 3.

   THE ORDER CHECK GETS THE SAME TREATMENT. `order` is the levels as they
   stood when the token was issued — each one's current document if it has
   not been written since, otherwise its newest snapshot from before — so a
   level unpublished or moved mid-run is judged where it was. And when
   every level resolved to a version, the 26-hour slack becomes exact: the
   page's list was read no earlier than the newest version it holds, so
   only a level changed after THAT can honestly be missing from it or out
   of place in it. A level that has held still since is held to the order,
   however long the tab was open. */
const VERSIONS = "ff_level_versions";
const MAX_REV = 1e9;

// ms, or -Infinity for a level that has never been stamped — the same
// reading followsPublishedOrder gives it.
function changedAtOf(lv) {
    const ms = Date.parse((lv && (lv.updatedAt || lv.createdAt)) || "");
    return Number.isFinite(ms) ? ms : -Infinity;
}
const revOf = (lv) => (Number.isInteger(lv && lv.rev) && lv.rev >= 0 ? lv.rev : 0);
const msOf = (d) => (d instanceof Date ? d.getTime() : Date.parse(d || ""));

/* The view checkBreakdown takes, or null when there is nothing to build one
   from. `all` is every level document, published or not; `startedAt` the
   token's `t`. Reads at most two small queries of ff_level_versions. */
async function levelsAsPlayed(db, body, all, startedAt) {
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!ids || !Number.isFinite(startedAt)) return null;
    if (!ids.every(id => typeof id === "string" && id && id.length <= MAX_LEVEL_ID)) return null;
    // Only a revs list that lines up with the ids, entry for entry, is read.
    let revs = Array.isArray(body.revs) && body.revs.length === ids.length ? body.revs : null;
    if (revs && !revs.every(r => Number.isInteger(r) && r >= 0 && r <= MAX_REV)) revs = null;

    const t = startedAt;
    const current = new Map(all.map(lv => [String(lv.id), lv]));
    const col = db.collection(VERSIONS);

    // The versions played, and the one after each — that is when it stopped
    // being current, for AND THE VERSIONS HAVE TO HAVE BEEN LIVE TOGETHER.
    const snaps = new Map();
    if (revs) {
        const keys = [];
        ids.forEach((id, i) => { keys.push(`${id}:${revs[i]}`, `${id}:${revs[i] + 1}`); });
        const rows = await col.find({ _id: { $in: keys } }, { projection: { supersededAt: 0 } }).toArray();
        for (const s of rows) snaps.set(String(s._id), s);
    }

    const playedAs = (id, rev) => {
        const cur = current.get(id);
        if (cur && revOf(cur) === rev && cur.published === true && changedAtOf(cur) <= t) {
            return { level: cur, at: changedAtOf(cur), until: Infinity };
        }
        const snap = snaps.get(`${id}:${rev}`);
        const at = snap ? msOf(snap.at) : NaN;
        if (!snap || snap.published !== true || !(at <= t)) return null;
        const next = snaps.get(`${id}:${rev + 1}`);
        const until = next ? msOf(next.at)
            : (cur && revOf(cur) === rev + 1 ? changedAtOf(cur) : Infinity);
        return { level: snap, at, until };
    };

    const resolve = (useRevs) => {
        const dealt = new Map();
        let versioned = Boolean(useRevs), newest = -Infinity, soonestGone = Infinity;
        ids.forEach((id, i) => {
            const played = useRevs ? playedAs(id, revs[i]) : null;
            if (played) {
                dealt.set(id, played.level);
                newest = Math.max(newest, played.at);
                soonestGone = Math.min(soonestGone, played.until);
                return;
            }
            versioned = false;
            const cur = current.get(id);
            if (cur && cur.published === true) dealt.set(id, cur);
        });
        return { dealt, versioned, newest, soonestGone };
    };
    let r = resolve(revs);
    if (r.versioned && !(r.soonestGone > r.newest)) r = resolve(null);

    /* The published order as the token found it. A level written since has
       its newest snapshot from before the token read instead; one with none
       (created after, or its versions expired) is left out, which exempts
       it from the order check exactly as a recent change always did. */
    const since = all.filter(lv => changedAtOf(lv) > t).map(lv => String(lv.id));
    const before = new Map();
    if (since.length) {
        const rows = await col.find({ id: { $in: since }, at: { $lte: new Date(t) } },
            { projection: { supersededAt: 0 } }).toArray();
        for (const s of rows) {
            const had = before.get(s.id);
            if (!had || s.rev > had.rev) before.set(s.id, s);
        }
    }
    const order = [];
    for (const lv of all) {
        const id = String(lv.id);
        const was = changedAtOf(lv) <= t ? lv : before.get(id);
        if (!was || was.published !== true) continue;
        const changed = was === lv ? changedAtOf(lv) : msOf(was.at);
        order.push({
            id, order: was.order,
            updatedAt: Number.isFinite(changed) ? new Date(changed).toISOString() : undefined
        });
    }
    order.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    return {
        dealt: r.dealt,
        order,
        /* Exact when every level is a known version; the old slack when
           not. Never -Infinity: a list of levels that were never stamped
           still has to hold the unstamped ones to the order, and those read
           as -Infinity themselves (see changedAtOf). */
        settledBefore: r.versioned ? Math.max(r.newest, -Number.MAX_VALUE) : t - LEVEL_LIST_SLACK_MS,
        versioned: r.versioned
    };
}

/* ---------------------------------------------------------------- THE RUN LOG

   The page logs every run to ff-runs.js as well, with the same token, and
   that row is stored under the token's run id. A score is only taken if
   that row exists and says the same thing, round for round: same levels,
   same order, same clears, same points, and times within the second the
   log rounds them to. It raises the cost of a forgery from one request to
   two that agree — and it means the admin panel's picture of a run and the
   board's are the same run.

   THE LOG MAY BE A MOMENT BEHIND. The page sends it first and waits for it,
   but a run reported as the tab closes sends both at once (see reportRun in
   js/fallinfurni.js), and either can land first. So this looks a few times
   before deciding there is none.

   FOR ABOUT FIVE SECONDS, BACKING OFF. It was five looks 400ms apart, 1.6
   seconds in all — and the log's own request has a cold start to get
   through, a database connection, a read of the levels and its rate-limit
   counts before it writes anything. On a tab closing at the end of a run,
   which sends both at once, the score regularly gave up first and the run
   was lost as "no-run-log" with its log arriving a moment later. The looks
   now start close together, for the ordinary case where the log is only
   just behind, and spread out towards the end, so the whole wait is about
   five seconds for a handful of reads — well inside the ten a function is
   given, with the rest of this request's work on either side of it.

   WHY NOT TAKE THE SCORE WITHOUT ITS LOG and check it when the log turns
   up: that would make "send no log" a way round the one check that needs
   two requests to agree, unless the score were held somewhere pending and
   judged later by ff-runs — a second place that writes the board, for a
   race that a longer wait closes. The wait is the smaller change. */
const RUN_LOG = "ff_runs";
const RUN_LOG_GAPS_MS = [200, 300, 500, 700, 1000, 1200, 1200];

async function findRunLog(db, rid) {
    const col = db.collection(RUN_LOG);
    for (let i = 0; ; i++) {
        const row = await col.findOne({ rid }, { projection: { _id: 0, levels: 1, points: 1 } });
        if (row) return row;
        if (i >= RUN_LOG_GAPS_MS.length) return null;
        await new Promise(r => setTimeout(r, RUN_LOG_GAPS_MS[i]));
    }
}

// A sentence saying how they differ, or null when they agree.
function logDisagrees(log, rounds, points) {
    const kept = (Array.isArray(log.levels) ? log.levels : []).filter(l => l && !l.retried);
    const differ = "That run does not match its own run log";
    if (kept.length !== rounds.length) return differ;
    for (let i = 0; i < rounds.length; i++) {
        const a = kept[i], b = rounds[i];
        if (String(a.id) !== b.id || (a.won === true) !== b.won) return differ;
        if (Number(a.points) !== b.points) return differ;
        // The log keeps whole seconds; see cleanLevel in ff-runs.js.
        if (!(Math.abs(Number(a.seconds) - b.ms / 1000) <= 1.5)) return differ;
    }
    if (Number(log.points) !== points) return differ;
    return null;
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
        console.error("ff-scores: database connection failed", e);
        return json(503, { error: "Database connection failed" });
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

        let out;
        // Outside the try so the tournament read below can use it too.
        let gate = { launchAt: null, ffLaunchAt: null };
        try {
            gate = await readGate(db);
            const top = await scores
                .find(sinceLaunch(gate), { projection: { _id: 0 } })
                .sort({ points: -1, ms: 1, at: 1 })
                .limit(TOP)
                .toArray();

            out = { count: top.length, top: top.map(clean) };
            if (player) {
                const mine = await scores.findOne({ playerId: player.id }, { projection: { _id: 0 } });
                /* The same cut as the table: a best run from before launch is
                   not on the board, so it is not "your" place on it either. */
                out.you = afterLaunch(gate, mine) ? clean(mine) : null;
                out.signedIn = { name: player.name || player.username, id: player.id };
            }
        } catch (e) {
            console.error("ff-scores: could not read the board", e);
            return json(503, { error: "The leaderboard could not be read just now." });
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
        const meet = tournamentWindow(gate);
        if (meet) {
            try {
                const meetCol = db.collection(TOURNAMENT_COLLECTION);
                await ensureIndex(meetCol, { tid: 1, points: -1, ms: 1, at: 1 });
                const rows = await meetCol
                    .find({ tid: meet.id, ...sinceLaunch(gate) }, { projection: { _id: 0 } })
                    .sort({ points: -1, ms: 1, at: 1 })
                    .limit(TOP)
                    .toArray();
                out.tournament = { ...meet, top: rows.map(clean) };
                if (player) {
                    const mine = await db.collection(TOURNAMENT_COLLECTION)
                        .findOne({ tid: meet.id, playerId: player.id }, { projection: { _id: 0 } });
                    out.tournament.you = afterLaunch(gate, mine) ? clean(mine) : null;
                }
            } catch (e) { /* the all-time board is still worth serving */ }
        }

        return json(200, out);
    }

    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    /* THE START OF A RUN: a signed token, and nothing written. See THE RUN
       TOKEN above. Answered for signed-out players too — the token costs
       nothing to mint, and a player who signs in and plays again gets a
       fresh one with their Play press anyway.

       A closed game gets no token. The run would be refused at the end for
       the same reason, and saying so at the start is the same answer
       sooner. The page treats a missing token as "this run will not be on
       the board" and plays on regardless. */
    if ((event.queryStringParameters || {}).action === "start") {
        let gate;
        try { gate = await readGate(db); }
        catch (e) { return json(503, { error: "The leaderboard could not be reached just now." }); }
        if (!gate.open) return json(200, { token: null, reason: "closed" });
        const now = Date.now();
        const token = signRun(player, now);
        // The first Play press after the launch date marks the week's start.
        if (token) await noteOpened(db, gate, now);
        /* OPEN, BUT BEFORE THE LAUNCH. The switch and the date are set
           separately, and the switch can be opened first — whereupon the run
           plays, and is refused at its end because its token predates the
           launch (see below). The page then said "The game isn't open yet"
           about a game the player had just played. So the token says when
           runs start to count, and the page can say that instead, up front. */
        const early = gate.launchMs !== null && now < gate.launchMs;
        if (!token) return json(200, { token: null, reason: "unavailable" });
        return json(200, early ? { token, countsFrom: gate.launchAt } : { token });
    }

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

    /* CLOSED MEANS CLOSED TO THE BOARD, admins included. An admin playing a
       closed game is testing it, and a test is not a result — see IS IT OPEN
       above. That is enforced at the START now: a closed game issues no run
       token, so a run begun while it was shut has nothing to submit with and
       is refused below, before anything is spent. (The run log in ff-runs.js
       still has it; that is analytics and never touches ff_scores.) */
    let gate;
    try { gate = await readGate(db); }
    catch (e) {
        console.error("ff-scores: could not read the settings", e);
        return json(503, { error: "The leaderboard could not be updated just now." });
    }
    /* The run token. Missing is the start request having failed, which the
       page treats as "not on the board" without a scene; anything else wrong
       with it — forged, expired, somebody else's — is the same refusal with
       a different reason, since a real player can only reach it by pausing
       a run for three hours.

       WITHOUT ONE, a closed game says so: that is an admin testing it shut,
       who was refused a token at the start for the same reason. */
    if (!body.run) {
        return json(200, { recorded: false, reason: gate.open ? "no-run-token" : "closed" });
    }
    const claims = readRun(body.run, player);
    if (!claims) return json(200, { recorded: false, reason: "stale-run" });
    /* A TOKEN IS PROOF THE GAME WAS OPEN WHEN THE RUN BEGAN — none is issued
       while it is shut — so the switch's state NOW is not asked. It used to
       be, and a run under way when the switch was thrown (for maintenance,
       say, or by somebody fixing the date beside it) was refused at its end
       for something that happened while it was being played. Closing the
       game stops new runs; the ones already started finish, and their tokens
       expire three hours after issue whatever happens. */
    /* Begun before the launch: still "closed" to the board, but with the
       moment it opens, so the page can say "Runs count from …" rather than
       telling somebody who has just played it that the game is shut. */
    if (gate.launchMs !== null && claims.t < gate.launchMs) {
        return json(200, { recorded: false, reason: "closed", countsFrom: gate.launchAt });
    }
    /* ms is game time, which never runs faster than the wall clock — so a
       run claiming more of it than has passed since its token was issued
       did not happen. */
    if (ms > Date.now() - claims.t + RUN_TOLERANCE_MS) {
        return json(400, { error: "That run is longer than the time since it started" });
    }

    /* EVERY level, drafts included, since LEVELS AS PLAYED needs to know
       what the unpublished ones were when the token was issued — a level
       unpublished mid-run was published then. `published` is still what it
       always was, for the checks that want the levels as they are now. */
    let all, published, view;
    try {
        all = await db.collection(LEVELS)
            .find({}, { projection: { _id: 0 } })
            .sort({ order: 1 })
            .toArray();
        published = all.filter(lv => lv.published === true);
        view = await levelsAsPlayed(db, body, all, claims.t);
        await ensureUniqueIndex(scores, "playerId");
    } catch (e) {
        console.error("ff-scores: could not read the levels", e);
        return json(503, { error: "The leaderboard could not be updated just now." });
    }

    // Now, or as the token found them: a level unpublished mid-run was one.
    if (levels > Math.max(published.length, view ? view.order.length : 0)) {
        return json(400, { error: "More levels than exist" });
    }

    /* LEVEL BY LEVEL — see THE BREAKDOWN. Everything below is judged against
       the levels THIS run was dealt, by id, not against the first `levels`
       of whatever is published now — and each at the version it was played
       at, when the run says so (see LEVELS AS PLAYED). */
    const checked = checkBreakdown(body, { levels, ms, points }, published, claims.t, view);
    if (checked.error) return json(400, { error: checked.error });
    const dealt = checked.dealt;

    const floor = dealt.slice(0, levels).reduce((n, lv) => n + floorMsFor(lv), 0);
    if (ms < floor) {
        return json(400, { error: "That run is faster than the furni can fall" });
    }

    /* The same trick as the time floor, from the other end: the levels are
       served from here, so the most they can be worth is known here. */
    const ceiling = dealt.slice(0, checked.rounds.length).reduce((n, lv) => n + maxPointsFor(lv), 0)
        + maxLifeBonus(levels);
    if (points > ceiling) {
        return json(400, { error: "That run scores more than those levels can pay" });
    }

    /* AND THE RUN LOG HAS TO SAY THE SAME. See THE RUN LOG. */
    let logged;
    try { logged = await findRunLog(db, claims.rid); }
    catch (e) {
        console.error("ff-scores: could not read the run log", e);
        return json(503, { error: "The leaderboard could not be updated just now." });
    }
    if (!logged) return json(200, { recorded: false, reason: "no-run-log" });
    const disagreement = logDisagrees(logged, checked.rounds, points);
    if (disagreement) return json(400, { error: disagreement });

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
    /* SPENT BEFORE THE BOARD IS TOUCHED, after every check that could refuse
       the run — so a run refused for its numbers does not burn the token,
       and a token that has been through here once cannot write again. The
       insert is the lock: two submissions racing with one token both try it
       and the unique _id lets exactly one through. */
    try {
        if (!(await spendRun(db, claims, player))) {
            return json(200, { recorded: false, reason: "already-submitted" });
        }
    } catch (e) {
        console.error("ff-scores: could not spend a run token", e);
        return json(503, { error: "The leaderboard could not be updated just now." });
    }

    let better;
    try {
        better = await keepBest(scores, { playerId: player.id }, row, gate.launchAt);
    } catch (e) {
        console.error("ff-scores: could not record a run", e);
        /* NOTHING WAS RECORDED, so the token is handed back. It was spent a
           moment ago, and left spent, the page's retry of this very run came
           back "already-submitted" and the run was lost to a database hiccup
           rather than to anything the player did. If this delete fails too,
           the token stays spent: that loses one run, which is the old
           behaviour, never a second entry. */
        try { await db.collection(RUN_TOKENS).deleteOne({ _id: claims.rid }); }
        catch (e2) { console.error("ff-scores: could not release a run token", e2); }
        return json(503, { error: "The leaderboard could not be updated just now." });
    }

    /* And onto the tournament board, judged on its own terms.

       DELIBERATELY NOT `if (better)`. The two boards are scored
       independently: a run can be the best a player has managed this week
       while falling short of the best they have ever managed, and that run
       is exactly what a week-long board is for. Nesting this inside the
       block above — which is the obvious thing to write — would silently
       drop the runs the tournament exists to collect.

       IN IT BY WHEN THE RUN STARTED, not when it was sent: see
       tournamentFor. The fortnight the finished board lingers for is a
       fortnight nobody can add to it, except the runs already under way as
       the window shut.

       Written after the main row and in its own try. A tournament is a
       nice-to-have on top of a leaderboard; if this collection is having a
       bad afternoon the player's real score has already been recorded and
       the response below is still the truth about it. */
    const meet = tournamentFor(gate, claims.t);
    if (meet) {
        try {
            const meetRows = db.collection(TOURNAMENT_COLLECTION);
            await ensureUniqueIndex(meetRows, ["tid", "playerId"]);
            await keepBest(meetRows, { tid: meet.id, playerId: player.id }, { ...row, tid: meet.id }, gate.launchAt);
        } catch (e) { /* the run is on the real board either way */ }
    }

    let best = row;
    if (!better) {
        best = await scores.findOne({ playerId: player.id }).catch(() => null) || row;
    }
    return json(200, {
        recorded: better,
        reason: better ? null : "not-your-best",
        best: clean(best)
    });
};

/* "Keep the better run", in ONE operation rather than a read and a write.

   It used to read the player's row, compare in JavaScript, then write — and
   two runs submitted together (two tabs, a retry that crossed the original)
   could both read the same old row, both decide they were better, and land
   in either order. The slower of the two could win, and a player's best run
   would be quietly replaced by a worse one.

   So the comparison lives in the update's filter: the row is only matched,
   and therefore only overwritten, if what is stored ranks BELOW this run —
   fewer points, or the same points on a slower clock. The database applies
   that test and the write together, so there is no gap for another request
   to fall into. A row from before points existed counts as zero, as it
   always did.

   No row matching means one of two things, and the unique index tells them
   apart: either there is no row yet (the upsert inserts one), or there is a
   row and it is at least as good (the upsert tries to insert a second, and
   the index refuses it with 11000). Two FIRST runs racing both try the
   insert; the loser gets 11000 and asks once more without the upsert, so it
   still replaces the winner if it beat it.

   Returns whether this run is now the stored one. */
function betterThan(points, ms) {
    const or = [
        { points: { $lt: points } },
        { points, ms: { $gt: ms } }
    ];
    // Missing or null points read as 0 — the same default clean() applies.
    if (points > 0) or.push({ points: null });
    else if (points === 0) or.push({ points: null, ms: { $gt: ms } });
    return { $or: or };
}

/* `staleBefore`, when given, is the board's launch (gate.launchAt — the
   game's own date, else the site's; see readGate): a stored row from before it is
   replaced by ANY run, however it scores. Without this the pre-launch test
   rows — hidden from the board by `sinceLaunch`, but still in the
   collection — went on deciding whether their owner's real runs were good
   enough to keep, so a tester whose 9,190 from September was never beaten
   would have been invisible on the board for good. */
async function keepBest(col, owner, row, staleBefore) {
    const better = betterThan(row.points, row.ms);
    if (staleBefore) better.$or.push({ at: { $lt: staleBefore } });
    const filter = { ...owner, ...better };
    try {
        const r = await col.updateOne(filter, { $set: row }, { upsert: true });
        return Boolean(r.upsertedCount || r.matchedCount);
    } catch (e) {
        if (e && e.code === 11000) {
            const r = await col.updateOne(filter, { $set: row });
            return Boolean(r.matchedCount);
        }
        throw e;
    }
}

module.exports.keepBest = keepBest;
module.exports.betterThan = betterThan;
/* ff-runs.js verifies the same token to file its row under the run id, and
   the checks are exported for the tests in the same breath. */
module.exports.readRun = readRun;
module.exports.checkBreakdown = checkBreakdown;
module.exports.logDisagrees = logDisagrees;
module.exports.floorMsFor = floorMsFor;
module.exports.maxPointsFor = maxPointsFor;
module.exports.earnedFloorMs = earnedFloorMs;
module.exports.levelsAsPlayed = levelsAsPlayed;
module.exports.launchWeek = launchWeek;

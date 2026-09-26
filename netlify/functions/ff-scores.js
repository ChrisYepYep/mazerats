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
    return {
        open: !CLOSED_STATES.includes(state),
        // The effective launch for this board: the game's own, else the site's.
        launchAt,
        launchMs: launchAt ? Date.parse(launchAt) : null,
        // The game's own, or null. Only Launch Week reads this.
        ffLaunchAt
    };
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

function signRun(player) {
    if (!process.env.SESSION_SECRET) return null;
    const claims = { rid: crypto.randomBytes(12).toString("hex"), t: Date.now() };
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
    const from = gate && gate.ffLaunchAt ? Date.parse(gate.ffLaunchAt) : NaN;
    // A date that cannot be read must not take the leaderboard down with it.
    if (isNaN(from)) return null;
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
        const token = signRun(player);
        return json(200, token ? { token } : { token: null, reason: "unavailable" });
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
       above. Refused before the token is spent, so nothing about a closed
       run is written anywhere on this endpoint. (The run log in ff-runs.js
       still has it; that is analytics and never touches ff_scores.) */
    let gate;
    try { gate = await readGate(db); }
    catch (e) {
        console.error("ff-scores: could not read the settings", e);
        return json(503, { error: "The leaderboard could not be updated just now." });
    }
    if (!gate.open) return json(200, { recorded: false, reason: "closed" });

    /* The run token. Missing is the start request having failed, which the
       page treats as "not on the board" without a scene; anything else wrong
       with it — forged, expired, somebody else's — is the same refusal with
       a different reason, since a real player can only reach it by pausing
       a run for three hours. */
    if (!body.run) return json(200, { recorded: false, reason: "no-run-token" });
    const claims = readRun(body.run, player);
    if (!claims) return json(200, { recorded: false, reason: "stale-run" });
    if (gate.launchMs !== null && claims.t < gate.launchMs) {
        return json(200, { recorded: false, reason: "closed" });
    }
    /* ms is game time, which never runs faster than the wall clock — so a
       run claiming more of it than has passed since its token was issued
       did not happen. */
    if (ms > Date.now() - claims.t + RUN_TOLERANCE_MS) {
        return json(400, { error: "That run is longer than the time since it started" });
    }

    let published;
    try {
        published = await db.collection(LEVELS)
            .find({ published: true }, { projection: { _id: 0 } })
            .sort({ order: 1 })
            .toArray();
        await ensureUniqueIndex(scores, "playerId");
    } catch (e) {
        console.error("ff-scores: could not read the levels", e);
        return json(503, { error: "The leaderboard could not be updated just now." });
    }

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

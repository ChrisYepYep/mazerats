/* /.netlify/functions/player-profile — everything the console's Profile page
   says about the signed-in player, in one read.

   GET only, signed in only. Nothing here is stored: every figure is counted
   from rows other functions already keep, for the same reason player-data.js
   derives its stats rather than storing them — a second copy of a total is a
   second answer to argue with.

   What it reads, and from where:
     players          when they first signed in (discord-auth.js), and
                      their nickname (player-nick.js)
     guess_scores     Guess the Maze days, points and streaks
     daily_scores     Odd One Out, the same (daily-scores.js; game "odd")
     ff_scores        their best Fallin' Furni run and where it ranks
     dead_end_leads   what they sent through Add Maze Info, by outcome

   RANKS ARE COMPETITION RANKS, as the boards number them (see ranks in
   js/daily.js): a player's place is one more than the number of players
   strictly ahead of them, so two players level share a place. Ahead means
   what it means on the boards (RIGHT ANSWERS FIRST in guess-scores.js):
   more rounds right, or as many right and more points. They are
   worked out over every player, not only the ten a board shows — being
   27th is still worth knowing when the board stops at 10. */
const { getDb } = require("./_db");
const { playerFrom, playerView, sessionRevoked, clearCookie } = require("./_player");
const { today } = require("./_daily");
const { SECURITY_HEADERS } = require("./_headers");
const { totalOf } = require("./_speed");
const { accountBans } = require("./_bans");
const { nickedAmong } = require("./_publicid");

const ROUNDS = 5;
// The live games daily_scores serves; a row from a dropped game is history,
// not a score (see liveGames in daily-scores.js).
const DAILY_GAMES = ["odd"];

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

function yesterdayOf(iso) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

/* Days, points and streaks from one game's rows, sorted by day. The same
   counting as statsFor in player-data.js, over whichever collection the
   game keeps its rows in. The current streak is only current if it reaches
   today or yesterday: a run that ended last week is a best, not a streak. */
function gameStats(rows, day) {
    const out = { days: rows.length, points: 0, solved: 0, rounds: 0, bestDay: 0, streak: 0, best: 0, playedToday: false };
    if (!rows.length) return out;

    rows.forEach(r => {
        /* The day's total — base points plus the speed bonus (_speed.js) —
           as the boards count it, so "Points" here and a player's figure on
           the board are the same number. A row from before the bonus has
           none and adds nothing. Best day is the best total, likewise. */
        out.points += totalOf(r);
        out.solved += r.solved || 0;
        /* The rounds each row says it had, not five a day. An Odd One Out
           day can have fewer (see `rounds` where daily-scores.js inserts);
           Guess the Maze rows, and Odd One Out rows from before the field,
           carry none and were five. */
        out.rounds += Number.isInteger(r.rounds) && r.rounds >= 0 ? r.rounds : ROUNDS;
        out.bestDay = Math.max(out.bestDay, totalOf(r));
    });

    const days = rows.map(r => r.day);
    const set = new Set(days);
    out.playedToday = set.has(day);

    const last = days[days.length - 1];
    if (last === day || last === yesterdayOf(day)) {
        for (let d = last; set.has(d); d = yesterdayOf(d)) out.streak++;
    }

    let run = 0;
    days.forEach((d, i) => {
        run = (i > 0 && days[i - 1] === yesterdayOf(d)) ? run + 1 : 1;
        out.best = Math.max(out.best, run);
    });
    return out;
}

/* What the boards rank on, per player across a collection, as a Map of
   id -> { solved, points }: rounds right, and the total — base points and
   speed bonus, summed apart and added here ($sum reads an old row's
   missing bonus as nothing). */
async function totals(col, match) {
    const rows = await col.aggregate([
        { $match: match },
        { $group: { _id: "$playerId", points: { $sum: "$points" }, bonus: { $sum: "$bonus" }, solved: { $sum: "$solved" } } }
    ]).toArray();
    const map = new Map();
    rows.forEach(r => { if (r._id) map.set(r._id, { solved: r.solved || 0, points: totalOf(r) }); });
    return map;
}

/* EVERYBODY'S TOTALS, remembered for a few minutes.

   A rank needs every player's total, and that was two whole-table
   aggregations on every single open of the Profile page — the most
   expensive read on the site, repeated for a number that barely moves. So
   the maps are kept in this warm instance for TOTALS_TTL_MS. The PROMISE is
   cached, as in _db.js, so a burst of opens shares one aggregation, and a
   failed one is forgotten rather than served for five minutes.

   What goes stale is only OTHER people's totals. The player's own total is
   always counted fresh from their own rows (see handler), so the points
   they just earned show at once; at worst their place is a few minutes
   behind somebody else's. */
const TOTALS_TTL_MS = 5 * 60 * 1000;
let totalsCache = null;             // { at, launch, promise }

/* `launch` is the launch instant as an ISO string (see launchCut in
   daily-scores.js), or null.
   The totals are everybody's from that day on, as the boards count them, so
   a rank here is a place on the board the player can actually go and look
   at. Part of the cache's key: a launchAt changed in settings is not
   answered from totals worked out under the old one. */
function boardTotals(guessCol, dailyCol, launch) {
    if (totalsCache && totalsCache.launch === launch && Date.now() - totalsCache.at < TOTALS_TTL_MS) return totalsCache.promise;
    // `launch` is the launch instant (ISO), cut the way the boards cut it.
    const since = launch ? { day: { $gte: launch.slice(0, 10) }, at: { $gte: launch } } : {};
    const promise = Promise.all([
        totals(guessCol, since),
        totals(dailyCol, { ...since, game: { $in: DAILY_GAMES } })
    ]).then(([guess, odd]) => {
        // Both dailies added together, as the combined board adds them.
        const combined = new Map(guess);
        odd.forEach((p, k) => combined.set(k, addUp(combined.get(k), p)));
        return { guess, odd, combined };
    });
    const entry = { at: Date.now(), launch, promise };
    totalsCache = entry;
    promise.catch(() => { if (totalsCache === entry) totalsCache = null; });
    return promise;
}

// Two { solved, points } added together; either may be missing.
const addUp = (a, b) => ({
    solved: ((a && a.solved) || 0) + ((b && b.solved) || 0),
    points: ((a && a.points) || 0) + ((b && b.points) || 0)
});

// Rounds right and the total (base points and speed bonus) from a player's
// own rows, as totals() counts them for everybody else.
const sumPoints = (rows) => rows.reduce((t, r) => addUp(t, { solved: r.solved || 0, points: totalOf(r) }), addUp());

// Ahead on the boards: more rounds right, or as many and more points.
const ahead = (p, mine) => p.solved > mine.solved || (p.solved === mine.solved && p.points > mine.points);

/* Where `id` stands in a Map of everybody's totals, given their own `mine`
   (null if they have no rows, and so no place). Their entry in the map is
   ignored in favour of `mine`, which is fresh where the map may not be. */
/* `banned` is the Set of banned account ids (see bannedIds below): they are
   off every board, so they are off the count here too — ahead of nobody,
   and not among the `of`. The player's own entry is never dropped. */
function placeIn(map, id, mine, banned = new Set()) {
    if (mine == null) return null;
    let above = 0, size = 0;
    map.forEach((p, k) => {
        if (k !== id && banned.has(String(k))) return;
        size++;
        if (k !== id && ahead(p, mine)) above++;
    });
    return { rank: above + 1, of: size + (map.has(id) ? 0 : 1), points: mine.points };
}

/* BANNED ACCOUNTS OFF THE RANKS (30 Sept 2026). The boards leave a banned
   account's rows out (withoutBanned in _bans.js); the Profile counted them,
   so a player sat a place lower here than on the board they were told to go
   and look at. Every active account ban — the ban list is a handful of rows,
   and one read covers the dailies and Fallin' Furni alike. Fails OPEN, as
   the boards do: an unreadable bans collection gives the old count rather
   than no Profile. */
async function bannedIds(db) {
    try {
        return new Set([...(await accountBans(db)).byPlayer.keys()].map(String));
    } catch (e) {
        console.error("player-profile: could not read account bans; ranking unfiltered", e);
        return new Set();
    }
}

/* An `at` as an ISO string, whether it was stored as one or as a Date — the
   same as isoOf in players-admin.js. String(aDate) is "Sun Sep 20 2026…",
   which sorts after every "2026-…" and so passed any launch cut. */
const isoOf = v => {
    const t = v instanceof Date ? v.getTime() : Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : "";
};

/* EVERY FIGURE FOR ONE PLAYER (3 Oct 2026), pulled out of the handler so
   the public profiles (profiles.js) count exactly what this page counts —
   a player's place on somebody else's view of them is the same number as on
   their own. `profile` is their players row (the fields asked for below),
   for the caller's revocation check and names; `launch` the site's launch
   instant, or null. Throws when the database does. */
async function figuresFor(db, id) {
    const day = today();
    const guessCol = db.collection("guess_scores");
    const dailyCol = db.collection("daily_scores");
    const ffCol = db.collection("ff_scores");
    /* The launch, read first because it decides which rows count below.

       Only runs from launch onwards, as the public board counts them (see
       sinceLaunch in ff-scores.js). The pre-launch test runs are still in
       the collection; without this the owner's profile showed a 9,190
       test run as their best, ranked against a board that no longer
       lists it. settings.launchAt and every `at` are ISO strings, so
       they compare as strings.

       And the daily games from launch DAY onwards, as their boards now
       count them (see launchDay in daily-scores.js — the same UTC date
       of the same setting, worked out here from the one read rather than
       a second). Days, points, streaks and places alike: a profile that
       counted rehearsal days the boards do not would rank a player
       somewhere no board shows them.

       Fallin' Furni has a launch of its own, settings.ffLaunchAt, since
       the game opens after the site does, and its board is cut at that
       when it is set and at the site's launchAt when it is not (see
       readGate in ff-scores.js). The same rule here, from the same
       read, or the profile would count runs the board has cut. The
       daily games, and the totals cache keyed on their launch day,
       stay on the site's date: the game's date is nothing to them. */
    const settings = await db.collection("settings").findOne({ _id: "site" }, { projection: { launchAt: 1, ffLaunchAt: 1 } });
    const launchMs = settings && settings.launchAt ? Date.parse(settings.launchAt) : NaN;
    const ffOwnMs = settings && settings.ffLaunchAt ? Date.parse(settings.ffLaunchAt) : NaN;
    const ffLaunchMs = isNaN(ffOwnMs) ? launchMs : ffOwnMs;
    const since = isNaN(ffLaunchMs) ? {} : { at: { $gte: new Date(ffLaunchMs).toISOString() } };
    /* The launch INSTANT, as the boards now cut (launchCut in
       daily-scores.js): from launch day, and on that day only what was
       played after the doors opened at launchAt. */
    const launch = isNaN(launchMs) ? null : new Date(launchMs).toISOString();
    const fromLaunch = launch ? { day: { $gte: launch.slice(0, 10) }, at: { $gte: launch } } : {};

    // `rounds` for Odd One Out rows that record it, and `bonus` for the
    // total — see gameStats.
    const rowShape = { projection: { _id: 0, day: 1, points: 1, bonus: 1, solved: 1, rounds: 1 } };
    const [profile, guessRows, oddRows, board, ffMine, leadCounts, banned] = await Promise.all([
        // With the nickname fields, for the Profile's name (see below).
        // nickLocked too (29 Sept 2026): playerView reads it off this
        // row, and a projection that left it out made every Profile
        // report the nickname unlocked, whatever the admins had set.
        // sv for the revocation check below (30 Sept 2026), and svStrict
        // with it (1 Oct 2026): sessionRevoked reads that flag for a
        // cookie from before session versions, which "Sign out on every
        // device" revokes — left out, those were never signed out here.
        // nickLockedBy and habbo for the profile's Habbo (3 Oct 2026;
        // playerView's nickHabbo, and the avatar profiles.js shows).
        db.collection("players").findOne({ id }, { projection: { _id: 0, joinedAt: 1, name: 1, avatar: 1, nick: 1, nickAsked: 1, nickLocked: 1, nickLockedBy: 1, habbo: 1, nickRejected: 1, nickRefused: 1, sv: 1, svStrict: 1,
                // Whether they have been shown profiles yet (profiles.js, isPublic).
                profileIntroAt: 1 } }),
        guessCol.find({ playerId: id, ...fromLaunch }, rowShape).sort({ day: 1 }).toArray(),
        dailyCol.find({ playerId: id, game: "odd", ...fromLaunch }, rowShape).sort({ day: 1 }).toArray(),
        boardTotals(guessCol, dailyCol, launch),
        ffCol.findOne({ playerId: id }, { projection: { _id: 0, points: 1, levels: 1, ms: 1, at: 1 } }),
        db.collection("dead_end_leads").aggregate([
            { $match: { "from.id": id } },
            { $group: { _id: "$status", n: { $sum: 1 } } }
        ]).toArray(),
        bannedIds(db)
    ]);

    // Fallin' Furni from its launch instant — see `since` above.
    // Compared as instants (isoOf above), not as text.
    const ffCounts = ffMine && (!since.at || isoOf(ffMine.at) >= since.at.$gte);

    /* NO NICKNAME, NO PLACE (4 Oct 2026, the owner's; withoutBanned in
       _bans.js): the boards leave out every player without a nickname, so
       the places here count them out as they do the banned (`offBoard`),
       and a player without one has no place of their own: "Not ranked",
       as the boards would have it. Read for the players on the boards
       only; a read that fails counts everyone out, as the boards do. */
    const boardIds = new Set([...board.guess.keys(), ...board.odd.keys(), ...board.combined.keys()].map(String));
    const ffIds = ffCounts ? (await ffCol.distinct("playerId")).map(String) : [];
    const nicked = await nickedAmong(db, [...boardIds, ...ffIds]);
    const offBoard = new Set(banned);
    [...boardIds, ...ffIds].forEach(k => { if (!nicked || !nicked.has(k)) offBoard.add(k); });
    const listed = !!(profile && typeof profile.nick === "string" && profile.nick);

    // Their own totals, fresh from their own rows; null means no place.
    const myGuess = guessRows.length && listed ? sumPoints(guessRows) : null;
    const myOdd = oddRows.length && listed ? sumPoints(oddRows) : null;
    const myCombined = myGuess == null && myOdd == null ? null : addUp(myGuess, myOdd);

    let ff = null;
    if (ffCounts) {
        const points = Number(ffMine.points) || 0;
        /* The launch cut for the count, for an `at` of EITHER type (30
           Sept 2026). A string $gte skips every Date-typed row, and a
           Date one every string, so both are asked. And the banned
           accounts off it, as off the board (see bannedIds) — never the
           player's own row. */
        const cut = since.at ? { $or: [{ at: { $gte: since.at.$gte } }, { at: { $gte: new Date(since.at.$gte) } }] } : {};
        const off = [...offBoard].filter(b => b !== String(id));
        const scope = off.length ? { ...cut, playerId: { $nin: off } } : cut;
        /* Ahead of them is everyone the board would list first (30 Sept
           2026): ff-scores.js sorts { points: -1, ms: 1, at: 1 }, and
           counting only higher points put a player level on points
           with somebody faster at that somebody's place, not their own.
           So a draw on points goes to the quicker clock, and a draw on
           both to whoever got there first — with `at` compared the way
           the database's sort does it across the two types it is stored
           as: nothing (null) first, then every string, then every Date.
           A row from before points existed (null) sorts below every
           number, as it does on the board. */
        const myPts = typeof ffMine.points === "number" ? ffMine.points : null;
        const myMs = ffMine.ms;
        const myAt = ffMine.at;
        const samePts = myPts == null ? { points: null } : { points: myPts };
        const atAhead = myAt instanceof Date ? [{ at: { $lt: myAt } }, { at: { $type: "string" } }, { at: null }]
            : typeof myAt === "string" ? [{ at: { $lt: myAt } }, { at: null }]
            : [];
        const ahead = [
            myPts == null ? { points: { $ne: null } } : { points: { $gt: myPts } },
            // (A missing clock sorts first on an ascending key.)
            ...(myMs == null ? [] : [{ ...samePts, ms: { $lt: myMs } }, { ...samePts, ms: null }]),
            ...atAhead.map(a => ({ ...samePts, ms: myMs == null ? null : myMs, ...a }))
        ];
        const [above, of] = await Promise.all([
            ffCol.countDocuments({ $and: [scope, { $or: ahead }] }),
            ffCol.countDocuments(scope)
        ]);
        ff = { points, levels: ffMine.levels || 0, ms: ffMine.ms || 0, rank: listed ? above + 1 : null, of: listed ? of : null };
    }

    const leads = { sent: 0, accepted: 0, waiting: 0 };
    leadCounts.forEach(r => {
        leads.sent += r.n;
        if (r._id === "accepted") leads.accepted += r.n;
        if (r._id === "new") leads.waiting += r.n;
    });

    return {
        day, profile, launch, banned,
        games: {
            guess: { ...gameStats(guessRows, day), place: placeIn(board.guess, id, myGuess, offBoard) },
            odd: { ...gameStats(oddRows, day), place: placeIn(board.odd, id, myOdd, offBoard) }
        },
        combined: placeIn(board.combined, id, myCombined, offBoard),
        ff,
        leads
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
    const player = playerFrom(event);
    if (!player) return json(401, { error: "Not signed in" });

    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(503, { error: "Database connection failed" });
    }

    const id = player.id;
    try {
        const { day, profile, games, combined, ff, leads } = await figuresFor(db, id);

        /* A REVOKED SESSION (30 Sept 2026; see SESSION VERSIONS in
           _player.js) is signed out here as it is on `me`: a forgotten
           player's old tab asked this and was answered from the cookie as if
           nothing had happened — their name, their avatar, "Rat since". 401
           with the cookie cleared; the Profile answers it by asking `me`. */
        if (sessionRevoked(player, profile)) {
            const out = json(401, { error: "Not signed in" });
            out.headers = { ...out.headers, "Set-Cookie": clearCookie() };
            return out;
        }

        /* The name as `me` gives it (playerView in _player.js; 28 Sept
           2026): `name` is still the Discord display name, `displayName` is
           the nickname when there is one, and that is what the page shows. */
        const who = playerView(player, profile);
        return json(200, {
            day,
            player: {
                id, name: who.name, nick: who.nick, displayName: who.displayName, nickAsked: who.nickAsked,
                // The admins locked it (29 Sept 2026; see player-nick.js).
                nickLocked: who.nickLocked,
                avatar: who.avatar, joinedAt: (profile && profile.joinedAt) || null
            },
            games,
            combined,
            ff,
            leads
        });
    } catch (e) {
        console.error("player-profile: read failed", e);
        return json(500, { error: "Could not read your profile" });
    }
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("player-profile", exports.handler);

exports.figuresFor = figuresFor;

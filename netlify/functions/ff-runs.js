/* /.netlify/functions/ff-runs — every round of Fallin' Furni that was played,
   and the admin panel's reading of them.

   POST {…}        record one finished or abandoned run. Public, unvalidated.
   GET ?range=7d   the whole picture, for an administrator.

   ----------------------------------------------------------------------
   WHY THIS IS NOT ff-scores.js

   They look like the same thing and they are opposites.

   ff-scores is a CLAIM. It only accepts signed-in players, only keeps each
   player's best run, refuses anything faster than the furni could physically
   fall, and exists to be shown to the public. Everything it does is about
   deciding whether to believe a number.

   This is a RECORD. It takes everything — runs that cleared nothing, runs by
   people who never signed in, runs somebody walked away from halfway — and
   keeps them all, because the question it answers is "what actually happens
   when people play this", and a run that ended badly is the most informative
   kind there is. It is never shown to a player and never ranks anybody.

   Two collections rather than one for the same reason. Pruning the run log
   must never touch the leaderboard, and the leaderboard's one-row-per-player
   shape would throw away exactly the history this is for.

   ----------------------------------------------------------------------
   WHO PLAYED, AND THE ADDRESS THEY PLAYED FROM

   This used to store nothing that could group one person's runs together,
   and said so at length. It stores the IP address now, and grouping runs by
   it is the point rather than a side effect: the admin panel lists every
   address and every run that came from it, so several accounts sharing one
   connection are visible.

   That is a real change to what this collection is. An anonymous run is no
   longer anonymous — it carries the address it came from, which is personal
   data, and two runs from one household can now be tied together whether or
   not anybody signed in.

   SO THE PRIVACY POLICY HAD TO CHANGE WITH IT. js/privacy-content.js said in
   as many words that no IP address was recorded and that signed-out runs
   could not be grouped; both sentences were true when they were written and
   would have been lies the moment this shipped. They were rewritten in the
   same change. If this ever stops recording addresses, that text goes back —
   the two are one decision, not two.

   The address is taken only from the header Netlify computes, never from
   x-forwarded-for, for the reason spelled out in clientIp below. It is
   pruned on the same 180-day clock as the rest of the row, because it is part
   of the row and not a separate store.

   A SIGNED-IN player is stored by name as well, and that is a real difference
   from js/track.js, which promises it cannot identify anybody. It is not that
   promise being broken, because this is not that system: signing in to
   Fallin' Furni already puts your name on a public leaderboard, and this
   records the same games that board is built from.

   ----------------------------------------------------------------------
   HOW MUCH OF THIS IS TRUE

   The round runs in the browser, so every number here is the page's word for
   it, exactly as ff-scores.js says of its own input. The difference is that
   it does not matter much: nothing is ranked, nothing is awarded, and a
   person who fakes a run log is lying to a graph that only an administrator
   reads. So there is no physics floor here — it would reject honest data
   from a build that changed its timings and buy nothing.

   What IS enforced is shape and size, because an endpoint that writes
   whatever it is handed into a database is a different problem entirely. */

const { getDb } = require("./_db");
const { isAuthorized, UNAUTHORIZED } = require("./_auth");
const { playerFrom } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");

const COLLECTION = "ff_runs";

/* Long enough to see a season in it, short enough that the collection cannot
   grow without bound on a site nobody is watching. The activity log keeps 90
   days; this keeps more because a game's difficulty curve is judged over
   months, not weeks, and a row here is one document per RUN rather than one
   per click. */
const KEEP_DAYS = 180;

/* Caps. A run has one entry per level played and the game ships 50, but a
   player with lives can retry, so the honest ceiling is higher than the level
   count — 200 is far past anything reachable and still bounded. */
const MAX_LEVELS = 200;
const MAX_NAME = 80;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

/* Anything that is not a number becomes ZERO where zero is in range, rather
   than the bottom of it. A body sending points: {} was being stored as
   -999999 points, which is not a refusal — it is a wrong answer that then
   turns up in a chart as a real figure. */
const clampInt = (v, lo, hi) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return lo <= 0 && hi >= 0 ? 0 : lo;
    return Math.max(lo, Math.min(hi, n));
};

const str = (v, max) => String(v === undefined || v === null ? "" : v).slice(0, max);

/* The same rule room-figure.js applies before it will ask Habbo about a name,
   copied rather than loosened so the two cannot drift into disagreeing about
   what a habbo name is. Anything else becomes null, which reads as "played
   without giving a name" — the honest description of a value we will not
   keep. Note what the character set leaves out: <, >, &, quotes and spaces. */
const HABBO_NAME = /^[A-Za-z0-9_\-.:]{1,32}$/;
const habboName = (v) => {
    const s = String(v === undefined || v === null ? "" : v).trim();
    return HABBO_NAME.test(s) ? s : null;
};

/* THE ADDRESS THE ROUND WAS PLAYED FROM.

   Only the value Netlify computes, exactly as contact.js and auth.js take
   it — never x-forwarded-for, which the client sets and could therefore make
   say anything. Here that matters for a different reason than it does on a
   rate limit: a spoofable address does not merely let somebody dodge the
   grouping, it lets them put their runs under SOMEBODY ELSE'S address, and a
   panel built to show who is playing from where would then be showing an
   answer an attacker chose.

   Null when the header is absent — on a local `netlify dev`, for instance.
   Null rather than a shared literal like "unknown", so that runs with no
   address are one bucket the panel can label honestly instead of a fake
   address that reads like a real one. */
function clientIp(event) {
    return (event.headers || {})["x-nf-client-connection-ip"] || null;
}

/* One level as it was played. The game already computes all of this in
   RoomGame's summary() — this only decides which of it is worth keeping and
   puts a ceiling on every number, so a malformed or hostile body cannot
   store anything but small values in known fields. */
function cleanLevel(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
        /* The id is what the report groups on; the name is only what it gets
           labelled with. A level's id is the slug it was created under and
           does not change when it is renamed, so a level keeps one row in the
           table across its whole life — which is the point of recording any
           of this, since the reason to rename a level is usually that you
           have just changed it. */
        id: str(raw.id, 120),
        name: str(raw.name, MAX_NAME) || "Level",
        won: raw.won === true,
        // Why the level ended: the game's own word — "seated", "timeout",
        // "decoy", "wrong". Kept as a short token, never rendered as markup.
        why: str(raw.why, 24),
        seats: clampInt(raw.seats, 0, 999),
        seatsOf: clampInt(raw.seatsOf, 0, 999),
        seconds: clampInt(raw.seconds, 0, 86400),
        allowed: clampInt(raw.allowed, 0, 86400),
        penalty: clampInt(raw.penalty, 0, 86400),
        points: clampInt(raw.points, -999999, 999999),
        streak: clampInt(raw.streak, 0, 999),
        retried: raw.retried === true
    };
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }

    if (event.httpMethod === "POST") return record(db, event);
    if (event.httpMethod === "GET") return report(db, event);
    return json(405, { error: "Method not allowed" });
};

/* ------------------------------------------------------------- RECORDING */

async function record(db, event) {
    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }

    const levels = Array.isArray(body.levels)
        ? body.levels.slice(0, MAX_LEVELS).map(cleanLevel).filter(Boolean)
        : [];

    /* A run with no levels in it never started — the page opened the game and
       closed it again. Those are not runs and there would be one for every
       visit, so they are dropped rather than stored. */
    if (!levels.length) return json(200, { recorded: false, reason: "empty" });

    // Signed in or not; either is fine and only one of them has a name.
    const player = playerFrom(event);

    const outcome = ["won", "lost", "abandoned"].includes(body.outcome)
        ? body.outcome : "abandoned";

    const doc = {
        at: new Date(),
        outcome,
        // The name is the SESSION's, never the page's — a body claiming to be
        // somebody else is ignored, because this field is not read from it.
        player: player ? str(player.name, MAX_NAME) : null,
        playerId: player ? str(player.id, 64) : null,
        /* THE NAME TYPED INTO THE GAME, which is the only thing a signed-out
           run can be called. Without it every one of them is the same line in
           the panel and "who is playing" has no answer for the majority of
           runs.

           IT IS A CLAIM, and is stored as one. The page only sets it from a
           lookup Habbo answered, but that guarantee lives in the page, and
           anything that reaches here could have been typed into a terminal —
           so it never authenticates, never ranks, and never appears outside
           the admin panel. `player` above is still the only field that says
           who somebody IS.

           The shape is room-figure.js's own rule for a habbo name, character
           for character. That is deliberate: a value that cannot hold <, >,
           &, a quote or a space cannot become markup wherever it is printed,
           which is the failure ff-scores.js had to delete a field over. The
           panel escapes it as well. */
        habbo: habboName(body.habbo),
        // Read from the request, never from the body — see clientIp.
        ip: clientIp(event),
        /* COUNTED here, not taken from the body. The page sends its own tally
           and it is the same number, but deriving it means a request cannot
           claim two hundred levels cleared while sending one round — which
           would not be a refused request, it would be a wrong figure sitting
           at the top of "best run" for six months. */
        cleared: levels.filter(l => l.won).length,
        points: clampInt(body.points, -999999, 9999999),
        ms: clampInt(body.ms, 0, 24 * 60 * 60 * 1000),
        lives: {
            spent: clampInt(body.livesSpent, 0, 999),
            won: clampInt(body.livesWon, 0, 999),
            left: clampInt(body.livesLeft, 0, 999)
        },
        levels,
        /* Enough to tell a phone from a desk, which is the one thing about
           the device that changes how this game plays: the room is a fixed
           720x498 and a narrow screen scales it down. Not a fingerprint —
           two numbers and a boolean, stored on the run and never used to
           recognise anybody. */
        client: {
            w: clampInt(body.w, 0, 20000),
            h: clampInt(body.h, 0, 20000),
            touch: body.touch === true
        },
        v: 1
    };

    await db.collection(COLLECTION).insertOne(doc);

    /* Pruned opportunistically rather than on a schedule, the way the rest of
       this site's logs are: a site with no traffic writes nothing and needs no
       cleanup, and one with traffic cleans itself every time somebody plays.
       Failure here must not fail the write — the run is already saved and the
       player is owed an answer. */
    const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
    db.collection(COLLECTION).deleteMany({ at: { $lt: cutoff } }).catch(() => {});

    return json(200, { recorded: true });
}

/* -------------------------------------------------------------- REPORTING */

const RANGES = {
    "24h":   () => new Date(Date.now() - 24 * 60 * 60 * 1000),
    "today": () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; },
    "7d":    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    "30d":   () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    "90d":   () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    "all":   () => null
};

// Most rows the panel will ever pull back. Aggregating in JS rather than in a
// pipeline, as admin-activity.js does, because the volumes here are small and
// the arithmetic is much easier to read and to check.
const MAX_ROWS = 4000;
const RECENT = 60;

const median = ns => {
    if (!ns.length) return 0;
    const s = [...ns].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const bump = (map, key, by) => map.set(key, (map.get(key) || 0) + (by === undefined ? 1 : by));
/* {label, n} rather than {label, count}: the admin page already has one bar
   renderer, activityBars, and it reads n. One shape means one renderer. */
const rank = (map, limit) => [...map].sort((a, b) => b[1] - a[1])
    .slice(0, limit).map(([label, n]) => ({ label, n }));

async function report(db, event) {
    if (!isAuthorized(event)) return UNAUTHORIZED;

    const asked = ((event.queryStringParameters || {}).range || "30d");
    const range = RANGES[asked] ? asked : "30d";
    const since = RANGES[range]();

    const rows = await db.collection(COLLECTION)
        .find(since ? { at: { $gte: since } } : {}, { projection: { _id: 0 } })
        .sort({ at: -1 })
        .limit(MAX_ROWS)
        .toArray();

    /* ---- the headline */
    const finished = rows.filter(r => r.outcome !== "abandoned");
    const won = rows.filter(r => r.outcome === "won");
    const signedIn = rows.filter(r => r.player);
    const cleared = rows.map(r => r.cleared || 0);

    /* ---- one bar per day, INCLUDING the empty ones.

       A chart built only from days that have rows draws a flat line through a
       fortnight of silence and reads as steady play. The gaps are the story,
       so the days are generated from the range rather than from the data. */
    const byDay = [];
    if (rows.length) {
        const first = since || new Date(rows[rows.length - 1].at);
        const day = new Date(first); day.setUTCHours(0, 0, 0, 0);
        const counts = new Map();
        for (const r of rows) counts.set(new Date(r.at).toISOString().slice(0, 10), (counts.get(new Date(r.at).toISOString().slice(0, 10)) || 0) + 1);
        const end = new Date(); end.setUTCHours(0, 0, 0, 0);
        // Capped so "all" on an old database cannot return a thousand bars.
        for (let i = 0; day <= end && i < 120; i++) {
            const key = day.toISOString().slice(0, 10);
            byDay.push({ label: key, n: counts.get(key) || 0 });
            day.setUTCDate(day.getUTCDate() + 1);
        }
    }

    /* ---- per LEVEL, which is the part that is actually about level design.

       Every level a run reached gets a row: how often it was played, how often
       it was beaten, how long it took, how much of the seat sequence people
       got through, and how it ended when it went wrong. A level with a low
       clear rate and a high timeout count is too long; one with a high wrong-
       seat count is too confusing; one nobody ever fails is free. */
    /* GROUPED BY ID, LABELLED BY NAME.

       A level's id is the slug it was created under and survives a rename;
       its name is whatever it is called at the moment. Grouping on the name
       would start a fresh row the first time a level was renamed, and split
       its history exactly when it is most worth reading — the reason to
       rename a level is usually that you have just changed it.

       `rows` is sorted newest first, so the FIRST name seen for an id is the
       most recent one. Later rows carrying an older name do not overwrite it.

       A row with no id falls back to its name, under a prefix so a level
       whose slug happens to equal another's name cannot collide with it. That
       covers anything recorded before the id was added, and levels served by
       a build too old to send one. */
    const levels = new Map();
    for (const r of rows) {
        for (const lv of r.levels || []) {
            const key = lv.id || ("name:" + lv.name);
            let e = levels.get(key);
            if (!e) {
                e = { id: lv.id || "", name: lv.name, plays: 0, wins: 0, retries: 0, seconds: [],
                      seats: 0, seatsOf: 0, penalty: 0, why: new Map() };
                levels.set(key, e);
            }
            e.plays++;
            if (lv.won) e.wins++;
            if (lv.retried) e.retries++;
            if (lv.seconds) e.seconds.push(lv.seconds);
            e.seats += lv.seats || 0;
            e.seatsOf += lv.seatsOf || 0;
            e.penalty += lv.penalty || 0;
            if (!lv.won && lv.why) bump(e.why, lv.why);
        }
    }

    const byLevel = [...levels.values()].map(e => ({
        id: e.id,
        name: e.name,
        plays: e.plays,
        wins: e.wins,
        // Rounded here rather than in the page: the panel formats, it does
        // not calculate, so the same number cannot come out two ways.
        clearPct: e.plays ? Math.round((e.wins / e.plays) * 100) : 0,
        retries: e.retries,
        medianSeconds: median(e.seconds),
        seatPct: e.seatsOf ? Math.round((e.seats / e.seatsOf) * 100) : 0,
        penalty: e.penalty,
        why: rank(e.why, 4)
    })).sort((a, b) => b.plays - a.plays);

    /* ---- how runs ended, and how levels ended inside them */
    const byOutcome = new Map();
    const byWhy = new Map();
    for (const r of rows) {
        bump(byOutcome, r.outcome || "abandoned");
        for (const lv of r.levels || []) if (!lv.won && lv.why) bump(byWhy, lv.why);
    }

    /* ---- per PLAYER.

       THREE KINDS OF ROW, because there are three different things a run can
       say about who played it, and flattening them loses the distinction that
       matters:

         signed in    the Discord session. The only one that is checked, and
                      the only one the leaderboard will use.
         named        signed out, but a habbo name was typed into the game.
                      Their own claim about themselves — good enough to follow
                      one player across a week of runs, not good enough to
                      trust against anybody else.
         unnamed      signed out and no name given. Still counted together,
                      because "how many were signed in" has to stay answerable.

       A signed-in run keys on the session even when a habbo name was typed as
       well: the checked identity wins, and one person is one row rather than
       two halves of themselves. The habbo name is carried along so the panel
       can show who a signed-in player says they are in the hotel. */
    const players = new Map();
    for (const r of rows) {
        const kind = r.player ? "player" : (r.habbo ? "habbo" : "none");
        const key = kind === "player" ? "p:" + r.player
            : kind === "habbo" ? "h:" + r.habbo
            : "";
        let e = players.get(key);
        if (!e) {
            e = {
                name: kind === "player" ? r.player : "",
                habbo: kind === "habbo" ? r.habbo : null,
                kind,
                runs: 0, best: 0, bestPoints: 0, totalMs: 0, last: r.at, first: r.at
            };
            players.set(key, e);
        }
        // A signed-in player who also typed a name: keep the most recent one.
        if (kind === "player" && r.habbo && !e.habbo) e.habbo = r.habbo;
        e.runs++;
        e.best = Math.max(e.best, r.cleared || 0);
        e.bestPoints = Math.max(e.bestPoints, r.points || 0);
        e.totalMs += r.ms || 0;
        if (new Date(r.at) > new Date(e.last)) e.last = r.at;
        if (new Date(r.at) < new Date(e.first)) e.first = r.at;
    }

    const byPlayer = [...players.values()]
        .sort((a, b) => b.runs - a.runs)
        .slice(0, 100);

    /* ---- per ADDRESS, which is the one view that crosses accounts.

       Every other grouping here takes the run's word for who played it, so
       one person with three Discord accounts is three players and a signed-out
       run is nobody at all. This groups on where the run came FROM, so those
       three accounts are one line, and the signed-out runs sit on the line
       with the account that shares their connection.

       WHAT IT CANNOT TELL YOU, and the panel says so too: a shared address is
       not a shared person. A family, a student hall, a school, a workplace
       and a phone network all put unrelated people behind one address, and
       CGNAT puts thousands there. This finds a QUESTION worth asking, never an
       answer — and mobile addresses move often enough that one person can also
       turn up as five lines.

       Named players are listed per address with their own run counts, so the
       interesting shape — two names, one address, alternating runs — is
       visible without opening anything. Runs with no address are collected
       under a null ip rather than dropped: before this shipped, no run had
       one, and a table that silently omitted all of them would read as "no
       activity" rather than "not recorded". */
    const addresses = new Map();
    for (const r of rows) {
        const key = r.ip || "";
        let e = addresses.get(key);
        if (!e) {
            e = { ip: r.ip || null, runs: 0, anon: 0, cleared: 0, bestPoints: 0,
                  first: r.at, last: r.at, touch: 0, players: new Map(), habbos: new Map() };
            addresses.set(key, e);
        }
        e.runs++;
        if (r.player) bump(e.players, r.player); else e.anon++;
        /* Habbo names are tallied for EVERY run that carries one, signed in or
           not. An address whose signed-in account and signed-out runs all give
           the same habbo name is one person being consistent; the same address
           giving four different ones is the shape this table exists to show,
           and it was invisible while signed-out runs had nothing on them. */
        if (r.habbo) bump(e.habbos, r.habbo);
        e.cleared = Math.max(e.cleared, r.cleared || 0);
        e.bestPoints = Math.max(e.bestPoints, r.points || 0);
        if (r.client && r.client.touch) e.touch++;
        if (new Date(r.at) > new Date(e.last)) e.last = r.at;
        if (new Date(r.at) < new Date(e.first)) e.first = r.at;
    }

    const byIp = [...addresses.values()].map(e => ({
        ip: e.ip,
        runs: e.runs,
        anon: e.anon,
        /* NAMES, not a count of them, because the count is the boring half.
           Capped at eight per address: past that the row is a public wifi
           point and the list has stopped being a lead. */
        players: rank(e.players, 8),
        named: e.players.size,
        // The same list for the name typed into the game, capped the same way.
        habbos: rank(e.habbos, 8),
        habboNames: e.habbos.size,
        bestCleared: e.cleared,
        bestPoints: e.bestPoints,
        touch: e.touch,
        first: e.first,
        last: e.last,
        // The flag the table is really for: more than one account, one line.
        shared: e.players.size > 1
    })).sort((a, b) => (b.named - a.named) || (b.runs - a.runs)).slice(0, 200);

    /* ---- the runs themselves, newest first, with their levels intact so the
       panel can open one up and show the whole round. */
    const recent = rows.slice(0, RECENT);

    return json(200, {
        range,
        since: since ? since.toISOString() : null,
        truncated: rows.length >= MAX_ROWS,
        keepDays: KEEP_DAYS,
        totals: {
            runs: rows.length,
            finished: finished.length,
            won: won.length,
            abandoned: rows.length - finished.length,
            signedIn: signedIn.length,
            /* COUNTED BY KIND, not by "has a key". The keys stopped being a
               proxy for "is signed in" the moment signed-out runs started
               grouping under a typed name, and left alone this figure would
               have quietly started counting them as accounts. */
            players: [...players.values()].filter(p => p.kind === "player").length,
            namedAnon: [...players.values()].filter(p => p.kind === "habbo").length,
            anonNoName: rows.filter(r => !r.player && !r.habbo).length,
            levelsPlayed: rows.reduce((n, r) => n + (r.levels || []).length, 0),
            bestCleared: cleared.length ? Math.max(...cleared) : 0,
            medianCleared: median(cleared),
            medianMs: median(rows.map(r => r.ms || 0).filter(Boolean)),
            touch: rows.filter(r => r.client && r.client.touch).length,
            /* Addresses seen, and how many of them carried more than one
               account. Both exclude the no-address bucket, which is not an
               address and would otherwise read as one. */
            addresses: [...addresses.keys()].filter(Boolean).length,
            sharedAddresses: byIp.filter(a => a.ip && a.shared).length,
            noAddress: rows.filter(r => !r.ip).length
        },
        byDay,
        byLevel,
        byOutcome: rank(byOutcome, 8),
        byWhy: rank(byWhy, 8),
        byPlayer,
        byIp,
        recent
    });
}

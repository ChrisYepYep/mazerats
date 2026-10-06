/* /.netlify/functions/pura-stats — Pura Panic's figures, for the Warren.

   GET ?range=7d   everything the Warren's Pura Panic page shows, worked out
                   from pura-scores.js's game log (THE GAME LOG there):
                   pura_starts, a row per Play pressed, and pura_games, a row
                   per finished game, replayed. Plus the board as it stands.

   Any Warren account reads it (6 Oct 2026, the owner's: "cool data, even
   more so as the game is still in beta"). It holds nothing more personal
   than the names already shown on the public board: no addresses, and no
   account ids leave here. Aggregated in JS, as ff-runs.js does, because the
   volumes are small and the arithmetic is easier to read and check. */

const { getDb } = require("./_db");
const { hasAccount, UNAUTHORIZED, isAuthUnavailable, AUTH_UNAVAILABLE } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { withoutBanned } = require("./_bans");
const Engine = require("../../js/pura-engine.js");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

const RANGES = {
    "24h":   () => new Date(Date.now() - 24 * 60 * 60 * 1000),
    "today": () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; },
    "7d":    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    "30d":   () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    "90d":   () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    "all":   () => null
};

const MAX_ROWS = 20000;
const RECENT = 60;
const MAX_DAYS = 120;

const median = ns => {
    if (!ns.length) return 0;
    const s = [...ns].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
const sum = ns => ns.reduce((a, b) => a + (b || 0), 0);
const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);
const dayOf = d => new Date(d).toISOString().slice(0, 10);

/* One bar per day, the empty ones included: the gaps are the story (see
   ff-runs.js). The newest MAX_DAYS when the range reaches further. */
function perDay(rows, since) {
    if (!rows.length) return [];
    const counts = new Map();
    rows.forEach(r => { const k = dayOf(r.at); counts.set(k, (counts.get(k) || 0) + 1); });
    const oldest = rows.reduce((m, r) => (new Date(r.at) < m ? new Date(r.at) : m), new Date());
    const day = new Date(since || oldest); day.setUTCHours(0, 0, 0, 0);
    const end = new Date(); end.setUTCHours(0, 0, 0, 0);
    const earliest = new Date(end); earliest.setUTCDate(earliest.getUTCDate() - (MAX_DAYS - 1));
    if (day < earliest) day.setTime(earliest.getTime());
    const out = [];
    for (; day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
        const key = day.toISOString().slice(0, 10);
        out.push({ label: key, n: counts.get(key) || 0 });
    }
    return out;
}

// The level a game ended on, in bands that stay readable as players improve.
const LEVEL_BANDS = [[1, 1], [2, 2], [3, 3], [4, 5], [6, 10], [11, 20], [21, 50], [51, 99], [100, Infinity]];
const bandLabel = ([a, b]) => (a === b ? "Level " + a : b === Infinity ? "Level " + a + "+" : "Levels " + a + "–" + b);

async function report(db, event) {
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    const asked = ((event.queryStringParameters || {}).range || "30d");
    const range = Object.prototype.hasOwnProperty.call(RANGES, asked) ? asked : "30d";
    const since = RANGES[range]();
    const when = since ? { at: { $gte: since } } : {};

    let games, starts, board, state;
    try {
        [games, starts, board, state] = await Promise.all([
            db.collection("pura_games").find(when, { projection: { _id: 0 } }).sort({ at: -1 }).limit(MAX_ROWS).toArray(),
            db.collection("pura_starts").find(when, { projection: { _id: 0, at: 1, playerId: 1 } }).limit(MAX_ROWS * 2).toArray(),
            db.collection("pura_scores").find({}, { projection: { _id: 0, playerId: 1, name: 1, score: 1, rows: 1, level: 1, pieces: 1, ms: 1, at: 1 } })
                .sort({ score: -1, pieces: 1, at: 1 }).limit(10).toArray(),
            db.collection("settings").findOne({ _id: "site" }, { projection: { puraPanicState: 1 } })
        ]);
    } catch (e) {
        console.error("pura-stats: could not read the game log", e);
        return json(503, { error: "The Pura Panic figures could not be read just now." });
    }

    /* The top ten as stored, each marked as the public board treats it
       (pura-scores.js, shown): a guest, or an account the board leaves out
       (banned, or no nickname) — so the Warren sees the rows the players
       cannot, and knows they are not seeing them. Ids stay here. */
    const accounts = board.filter(r => !String(r.playerId || "").startsWith("guest:"));
    let kept = null;
    try { [kept] = await withoutBanned(db, [accounts], r => r && r.playerId); } catch (e) { kept = accounts; }
    const keptSet = new Set(kept);
    board = board.map(r => {
        const guest = String(r.playerId || "").startsWith("guest:");
        const { playerId, ...rest } = r;
        return { ...rest, guest, hidden: !guest && !keptSet.has(r) };
    });

    const signedIn = games.filter(g => g.playerId);
    const scores = games.map(g => g.score || 0);
    const clears = [0, 1, 2, 3].map(i => sum(games.map(g => (g.clears || [])[i] || 0)));
    const topLevel = games.reduce((m, g) => Math.max(m, g.level || 1), 0);
    const longest = games.reduce((m, g) => Math.max(m, g.ms || 0), 0);

    const totals = {
        starts: starts.length,
        games: games.length,
        finishedPct: pct(games.length, starts.length),
        players: new Set(signedIn.map(g => g.playerId)).size,
        signedOutGames: games.length - signedIn.length,
        rows: sum(games.map(g => g.rows)),
        pieces: sum(games.map(g => g.pieces)),
        playedMs: sum(games.map(g => g.ms)),
        medianScore: median(scores),
        medianRows: median(games.map(g => g.rows || 0)),
        medianLevel: median(games.map(g => g.level || 1)),
        medianMs: median(games.map(g => g.ms || 0)),
        bestScore: scores.reduce((m, n) => Math.max(m, n), 0),
        topLevel,
        longestMs: longest,
        noRows: games.filter(g => !g.rows).length,
        quits: games.filter(g => g.ended === "quit").length,
        touchPct: pct(games.filter(g => g.touch).length, games.length),
        darkPct: pct(games.filter(g => g.dark).length, games.length),
        mutedPct: pct(games.filter(g => g.muted).length, games.length),
        chains: sum(games.map(g => g.chains)),
        // Rows a minute across all play: how fast the floor is being cleared.
        rowsPerMin: games.length ? Math.round((sum(games.map(g => g.rows)) / Math.max(1, sum(games.map(g => g.ms)) / 60000)) * 10) / 10 : 0
    };

    const byLevel = LEVEL_BANDS.map(b => ({
        label: bandLabel(b),
        n: games.filter(g => (g.level || 1) >= b[0] && (g.level || 1) <= b[1]).length
    })).filter((r, i, all) => r.n || all.slice(i + 1).some(x => x.n));

    /* Per player, in ff-runs.js's three kinds: a signed-in player (by
       account), a Habbo name somebody gave at Play without signing in (by
       name, as the board keys guests — typed, not proven), and one line for
       no name at all. */
    const people = new Map();
    for (const g of games) {
        const kind = g.playerId ? "player" : g.habbo ? "habbo" : "anon";
        const key = kind === "player" ? "p:" + g.playerId
            : kind === "habbo" ? "h:" + String(g.habbo).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
        let p = people.get(key);
        if (!p) people.set(key, p = {
            kind, name: kind === "player" ? (g.name || "Someone") : kind === "habbo" ? g.habbo : null,
            hotel: null,
            games: 0, best: 0, bestLevel: 0, rows: 0, ms: 0, first: g.at, last: g.at
        });
        p.games++;
        p.best = Math.max(p.best, g.score || 0);
        p.bestLevel = Math.max(p.bestLevel, g.level || 1);
        p.rows += g.rows || 0;
        p.ms += g.ms || 0;
        if (new Date(g.at) < new Date(p.first)) p.first = g.at;
        if (new Date(g.at) > new Date(p.last)) p.last = g.at;
        // The newest name a player went by, as the rows are newest first.
        if (g.playerId && g.name && p.name === "Someone") p.name = g.name;
    }
    const byPlayer = [...people.values()].sort((a, b) => b.games - a.games || b.best - a.best).slice(0, 100);

    return json(200, {
        range,
        state: (state && state.puraPanicState === "live") ? "live" : "maintenance",
        keepDays: 180,
        truncated: games.length >= MAX_ROWS,
        maxLevel: Engine.MAX_LEVEL,
        totals,
        startsByDay: perDay(starts, since),
        gamesByDay: perDay(games, since),
        byLevel,
        clears: [
            { label: "Single rows", n: clears[0] },
            { label: "Two at once", n: clears[1] },
            { label: "Three at once", n: clears[2] },
            { label: "Four or more", n: clears[3] },
            { label: "Chain clears", n: totals.chains }
        ],
        ended: [
            { label: "Topped out", n: games.length - totals.quits },
            { label: "Ended from pause", n: totals.quits }
        ],
        devices: [
            { label: "Keyboard", n: games.filter(g => !g.touch).length },
            { label: "Touchscreen", n: games.filter(g => g.touch).length }
        ],
        signedIn: [
            { label: "Signed in", n: signedIn.length },
            { label: "Signed out, named", n: games.filter(g => !g.playerId && g.habbo).length },
            { label: "Signed out, no name", n: games.filter(g => !g.playerId && !g.habbo).length }
        ],
        byPlayer,
        board,
        recent: games.slice(0, RECENT).map(g => ({
            at: g.at, name: g.playerId ? (g.name || "Someone") : null,
            habbo: g.playerId ? null : (g.habbo || null), hotel: g.playerId ? null : (g.hotel || null),
            score: g.score || 0, rows: g.rows || 0, level: g.level || 1, pieces: g.pieces || 0, ms: g.ms || 0,
            ended: g.ended, clears: g.clears || [0, 0, 0, 0], chains: g.chains || 0,
            touch: !!g.touch, dark: !!g.dark, muted: !!g.muted
        }))
    });
}

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("pura-stats: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    try {
        return await report(db, event);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        throw e;
    }
};

exports.handler = require("./_errors").withErrorReporting("pura-stats", exports.handler);

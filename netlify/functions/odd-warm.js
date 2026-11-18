/* odd-warm: Odd One Out's pictures made ready just after midnight (16 Nov 2026, the owner's).

   Every player now downloads the whole day's twenty pictures behind the loading bar, once their start is
   on file (the start's reply, daily-scores.js; since 18 Nov the load is after the start, so a cold picture
   costs round 0's clock beyond the load grace in _speed.js). The first player of the day was the one who paid for them: each picture is cut, encoded
   and padded by deal-image.js on its first request, and only then kept by Netlify's durable cache. This
   wakes a few minutes into the UTC day, deals the day exactly as the first player would (the deal is
   stored, so it is the same deal), and asks for each picture at its public address, so the cut is done
   and cached before anybody opens the game. A second wake later catches anything the first one missed;
   a picture already cached is a cheap hit.

   A SCHEDULED function (netlify.toml), never called over HTTP: Netlify runs scheduled functions on the
   published site only. Never from netlify dev, which talks to the live database. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { today, dayIsOpen } = require("./_daily");
const deals = require("./_deal");

const GAME = "odd";
const AT_ONCE = 4;              // pictures asked for at a time: each is a fetch, a cut and an encode on deal-image's side
const EACH_MS = 12000;          // one picture's wait
const ALL_MS = 25000;           // inside a scheduled function's 30 s

async function warmOne(url, until) {
    const left = until - Date.now();
    if (left < 1000) return "skipped";
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), Math.min(EACH_MS, left));
    try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "MazeRats-odd-warm" } });
        await res.arrayBuffer();
        return res.ok ? "ok" : "status " + res.status;
    } catch (e) {
        return e.name === "AbortError" ? "timeout" : "failed";
    } finally {
        clearTimeout(t);
    }
}

async function warm(db, base, now = Date.now()) {
    const day = today();
    if (!dayIsOpen(day)) return { day, skipped: "day not open" };
    const deal = await deals.dealFor(db, ensureUniqueIndex, GAME, day);
    const rounds = deals.publicRounds(GAME, deal.rounds, day, deal.rounds.length);
    const urls = [];
    rounds.forEach(r => (r && r.tiles || []).forEach(t => { if (t && t.image) urls.push(new URL(t.image, base).toString()); }));
    const until = now + ALL_MS, results = new Array(urls.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, urls.length) }, async () => {
        while (next < urls.length) { const i = next++; results[i] = await warmOne(urls[i], until); }
    }));
    const tally = {};
    results.forEach(r => { tally[r] = (tally[r] || 0) + 1; });
    return { day, pictures: urls.length, tally };
}

exports.handler = async () => {
    if (process.env.NETLIFY_DEV === "true") {
        return { statusCode: 200, body: JSON.stringify({ skipped: "not from netlify dev" }) };
    }
    const base = process.env.URL || "https://mazerats.net";
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("odd-warm: database connection failed", e);
        return { statusCode: 503, body: JSON.stringify({ error: "database" }) };
    }
    try {
        const done = await warm(db, base);
        console.log("odd-warm:", JSON.stringify(done));
        return { statusCode: 200, body: JSON.stringify(done) };
    } catch (e) {
        console.error("odd-warm: run failed", e);
        return { statusCode: 500, body: JSON.stringify({ error: "run failed" }) };
    }
};
exports._warm = warm;

#!/usr/bin/env node
/* Checks that the browser and the server agree about the daily games.
 *
 * ----------------------------------------------------------------------
 * WHAT IT USED TO GUARD, AND WHY THAT IS GONE
 *
 * The games used to deal their day in the browser (js/daily.js) while the
 * score endpoints re-dealt the same day on the server to check what came
 * back (netlify/functions/_daily.js). They agreed because they ran the same
 * seed arithmetic, and this file compared the seeds the two produced — the
 * one check that could catch the silent failure of the two sides dealing
 * different days, where every correct answer is scored wrong and nothing
 * errors. It caught a real one: the featured-day salt added to one side
 * only would have done exactly that on launch day.
 *
 * The day is now dealt ONCE, on the server, and stored
 * (netlify/functions/_deal.js); the page is handed it without its answers,
 * and each move is judged against the stored copy. There is no second
 * dealer left to drift, so comparing seeds would be comparing a function
 * with itself.
 *
 * ----------------------------------------------------------------------
 * WHAT IT GUARDS NOW
 *
 * What the two sides still both hold, and what would silently break if
 * they stopped holding it the same way:
 *
 *   1. THE NUMBERS. The page shows the points a round was worth and the
 *      server decides them; Guess the Maze's POINTS (and so its number of
 *      tries) and Odd One Out's POINTS_EACH are written on both sides, and
 *      so is the midnight grace. A mismatch is a results card that
 *      disagrees with the board under it.
 *
 *   2. THE DEAL ITSELF. Dealt from a fixture archive: deterministic for a
 *      seed, one imposter per Odd One Out round, the answer among each
 *      round's five names, no hallway and no maze catalogued on the day.
 *      And the copy the page is SENT carries none of the answers — the
 *      point of dealing on the server is lost the moment one leaks back
 *      into the page.
 *
 *   3. THE SEED IS SECRET. With SESSION_SECRET set, a day is not dealt
 *      from the public seed anybody could compute, and a featured day's
 *      salt still rerolls it.
 *
 *   4. THE PAGE STILL DOES NOT DEAL. Neither game may reach for seed
 *      arithmetic or the archive filters again: a page dealing its own day
 *      is a page playing a day the server never stored.
 *
 *   5. THE CALENDAR. js/daily.js is RUN (not parsed — parsing would be a
 *      third implementation) with a fake clock, to check that today()
 *      follows the clock, and follows the server's clock once told it.
 *
 *     node tools/check-daily-parity.js
 *
 * Exits non-zero and says what is wrong.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

let checked = 0;
function fail(msg) {
    console.error("MISMATCH: " + msg);
    process.exitCode = 1;
}
function check(ok, msg) {
    checked++;
    if (!ok) fail(msg);
}

/* A constant as the source writes it: `const NAME = <literal>;`, read as
   JSON after the arithmetic of a duration is worked out. Deliberately
   narrow — only numbers, arrays of numbers and `a * b * c` products — so a
   constant rewritten into something this cannot read fails loudly here
   rather than being compared wrongly. */
function constant(rel, name) {
    const m = read(rel).match(new RegExp(`const ${name}\\s*=\\s*([^;]+);`));
    if (!m) { fail(`${rel} has no \`const ${name}\` this check can read`); return undefined; }
    const text = m[1].trim();
    if (/^[\d\s*]+$/.test(text)) return text.split("*").reduce((n, x) => n * Number(x.trim()), 1);
    try { return JSON.parse(text); } catch (e) { fail(`${rel}: ${name} is not a literal (${text})`); return undefined; }
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- 1. the numbers ---- */
{
    const pagePoints = constant("js/guess.js", "POINTS");
    const serverPoints = constant("netlify/functions/guess-scores.js", "POINTS");
    check(eq(pagePoints, serverPoints), `Guess the Maze POINTS — page ${JSON.stringify(pagePoints)} vs server ${JSON.stringify(serverPoints)}`);
    const tries = constant("js/guess.js", "TRIES");
    check(Array.isArray(serverPoints) && tries === serverPoints.length,
        `Guess the Maze TRIES (${tries}) must be the length of the server's POINTS — the server ends a round on that many guesses`);
    check(constant("js/guess.js", "ROUNDS") === constant("netlify/functions/guess-scores.js", "ROUNDS"), "Guess the Maze ROUNDS differ");

    const oddPage = constant("js/oddoneout.js", "POINTS_EACH");
    const oddServer = constant("netlify/functions/daily-scores.js", "POINTS_EACH");
    check(oddPage === oddServer, `Odd One Out POINTS_EACH — page ${oddPage} vs server ${oddServer}`);
    check(constant("js/oddoneout.js", "ROUNDS") === constant("netlify/functions/daily-scores.js", "ROUNDS"), "Odd One Out ROUNDS differ");

    const grace = constant("js/guess.js", "DAY_GRACE_MS");
    const serverGrace = require(path.join(ROOT, "netlify", "functions", "_daily.js")).GRACE_MS;
    check(grace === serverGrace, `the midnight grace — page ${grace}ms vs server ${serverGrace}ms`);
}

/* ---- 2 & 3. the deal ---- */
{
    const had = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "parity-check-secret";
    const deals = require(path.join(ROOT, "netlify", "functions", "_deal.js"));
    const daily = require(path.join(ROOT, "netlify", "functions", "_daily.js"));

    const room = (id, tags, n, extra) => Object.assign({
        id, name: "Maze " + id, creator: "someone", tags,
        gallery: Array.from({ length: n }, (_, i) => ({ image: `/img/${id}/${i}.png` }))
    }, extra || {});
    const DAY = "2026-10-05";
    const ARCHIVE = [
        room("a", ["ice"], 5), room("b", ["ice"], 4), room("c", ["fire"], 6), room("d", ["fire"], 3),
        room("e", ["ice", "fire"], 4), room("f", ["dark"], 5), room("g", ["dark"], 4), room("h", [], 3),
        room("hall", ["Hallway"], 8),
        room("late", ["ice"], 8, { createdAt: DAY + "T13:00:00.000Z" }),
        room("early", ["dark"], 4, { createdAt: "2026-10-04T23:59:59.000Z" })
    ];
    const seedOf = (...parts) => deals.secretSeed(DAY, ...parts);

    const odd = deals.dealOdd(ARCHIVE, DAY, seedOf);
    const guess = deals.dealGuess(ARCHIVE, DAY, seedOf);
    check(eq(odd, deals.dealOdd(ARCHIVE.slice().reverse(), DAY, seedOf)),
        "Odd One Out deals differently from the same archive in a different order");
    check(eq(guess, deals.dealGuess(ARCHIVE.slice().reverse(), DAY, seedOf)),
        "Guess the Maze deals differently from the same archive in a different order");
    check(odd.length === 5 && guess.length === 5, `a full archive should deal five rounds (odd ${odd.length}, guess ${guess.length})`);

    const all = JSON.stringify([odd, guess]);
    check(!all.includes("/img/hall/") && !all.includes("Maze hall"), "a hallway was dealt");
    check(!all.includes("/img/late/") && !all.includes("Maze late"), "a maze catalogued during the day was dealt into it");

    odd.forEach((r, i) => {
        check(r.tiles.length === 4 && r.tiles.filter(t => t.odd).length === 1, `Odd One Out round ${i} must have four tiles, one of them odd`);
        check(r.tiles.filter(t => !t.odd).every(t => t.image.startsWith(`/img/${r.homeId}/`)), `Odd One Out round ${i}: a home tile is not from the home maze`);
        check(r.tiles.filter(t => t.odd).every(t => t.image.startsWith(`/img/${r.imposterId}/`)), `Odd One Out round ${i}: the odd tile is not the imposter's`);
    });
    guess.forEach((r, i) => {
        check(r.options.length === 5 && new Set(r.options).size === 5, `Guess the Maze round ${i} must offer five different names`);
        check(r.options.includes(r.name), `Guess the Maze round ${i}: the answer is not among its names`);
        check(Number.isInteger(r.crop) && r.crop >= 0, `Guess the Maze round ${i} has no crop seed`);
    });

    // What the page is sent.
    const sentOdd = deals.publicRounds("odd", odd);
    const sentGuess = deals.publicRounds("guess", guess);
    check(sentOdd.every(r => r.tiles.every(t => Object.keys(t).join() === "image")),
        "the Odd One Out deal sent to the page carries more than the pictures");
    check(!/"(odd|home|imposter|homeId|imposterId)"/.test(JSON.stringify(sentOdd)), "the Odd One Out deal sent to the page names an answer");
    check(sentGuess.every(r => Object.keys(r).sort().join() === "crop,image,options"),
        "the Guess the Maze deal sent to the page carries more than picture, names and crop");

    // The seed.
    check(seedOf("guess") !== daily.daySeed(DAY, "guess"), "with a secret set, the deal is still dealt from the public seed");
    process.env.SESSION_SECRET = "a-different-secret";
    const other = deals.secretSeed(DAY, "guess");
    process.env.SESSION_SECRET = "parity-check-secret";
    check(other !== seedOf("guess"), "the deal's seed does not depend on the secret");
    const featured = Object.keys(daily.FEATURED_DAYS)[0];
    if (featured) {
        const salted = deals.secretSeed(featured, "guess");
        const saved = daily.FEATURED_DAYS[featured];
        daily.FEATURED_DAYS[featured] = saved + "-reroll";
        check(deals.secretSeed(featured, "guess") !== salted, `a featured day's salt (${featured}) no longer rerolls its deal`);
        daily.FEATURED_DAYS[featured] = saved;
    }
    if (had === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = had;
}

/* ---- 4. the page still does not deal ---- */
for (const rel of ["js/guess.js", "js/oddoneout.js", "js/daily.js"]) {
    const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const found = src.match(/\b(daySeed|daySeedFor|seedFrom|Daily\.shuffle|existedBefore|isHallway|roomsForToday|getRooms)\b/);
    check(!found, `${rel} reaches for ${found && found[1]} — the page must play the server's deal, not deal its own`);
}

/* ---- 5. the calendar ---- */
{
    const clock = { now: Date.parse("2026-10-05T23:59:30.000Z") };
    class FakeDate extends Date {
        constructor(...a) { if (a.length === 0) super(clock.now); else super(...a); }
        static now() { return clock.now; }
    }
    const store = {};
    const sandbox = {
        window: {}, document: { addEventListener() {} },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
        fetch: () => Promise.reject(new Error("no network in the parity check")),
        AbortController, setTimeout, clearTimeout,
        Date: FakeDate, Math, JSON, console, Number, String
    };
    vm.createContext(sandbox);
    vm.runInContext(read("js/daily.js"), sandbox, { filename: "js/daily.js" });
    const Daily = sandbox.window.Daily;
    if (!Daily || typeof Daily.today !== "function" || typeof Daily.setServerNow !== "function") {
        fail("js/daily.js did not publish Daily.today and Daily.setServerNow");
    } else {
        check(Daily.today() === "2026-10-05", `Daily.today() does not follow the clock (saw ${Daily.today()})`);
        Daily.setServerNow(clock.now + 20000);           // latency, not a wrong clock
        check(Daily.today() === "2026-10-05", "Daily.today() moved on a 20-second difference, which is only latency");
        Daily.setServerNow(clock.now + 24 * 3600 * 1000);  // a device a day behind the server
        check(Daily.today() === "2026-10-06", `Daily.today() does not follow the server's clock once told it (saw ${Daily.today()})`);
        Daily.setServerNow(clock.now);
        check(Daily.today() === "2026-10-05", "Daily.today() did not come back when the clocks agreed again");
    }
}

if (process.exitCode) {
    console.error(`\n${checked} checks — see above.`);
} else {
    console.log(`daily parity OK — ${checked} checks: points, grace, the deal and what the page is sent, the secret seed, the calendar.`);
}

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
 *      into the page. That includes the pictures' addresses: a stored path
 *      names the maze's folder, so the page must get signed deal-image
 *      addresses (netlify/functions/deal-image.js) and never a raw path.
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
 *      The same run checks the speed-bonus line the results cards print
 *      (Daily.bonusLine), and section 1 holds the most a round can earn,
 *      as the splashes print it, to the server's.
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

    /* The most a round's speed bonus can be, as the notes say it: 36, not
       the formula's 37, because no round can end sooner than MIN_MOVE_MS
       after it began (see HOW BIG IT IS in _speed.js). The notes in
       _speed.js, guess-scores.js and js/guess.js said 37 and 185 for a
       while; this fails if the two constants move and leave "36" behind. */
    const speed = require(path.join(ROOT, "netlify", "functions", "_speed.js"));
    const bestRound = speed.roundBonusFor(speed.MIN_MOVE_MS);
    check(bestRound === 36, `the best round bonus is now ${bestRound}, not 36 — update the notes in _speed.js, guess-scores.js and js/guess.js`);
    check(/up to 36 for each room/.test(read("js/guess.js")), "js/guess.js no longer says the bonus is up to 36 a room");
    // And the figure both games' splashes print (Daily.bonusRule).
    const pageBest = constant("js/daily.js", "SPEED_BONUS_MAX");
    check(pageBest === bestRound, `the splashes say the speed bonus is up to ${pageBest} a round, the server's best is ${bestRound}`);

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
    const sentOdd = deals.publicRounds("odd", odd, DAY);
    const sentGuess = deals.publicRounds("guess", guess, DAY);
    check(sentOdd.every(r => r.tiles.every(t => Object.keys(t).join() === "image")),
        "the Odd One Out deal sent to the page carries more than the pictures");
    check(!/"(odd|home|imposter|homeId|imposterId)"/.test(JSON.stringify(sentOdd)), "the Odd One Out deal sent to the page names an answer");
    check(sentGuess.every(r => Object.keys(r).sort().join() === "crop,image,options"),
        "the Guess the Maze deal sent to the page carries more than picture, names and crop");

    /* THE PICTURE ADDRESSES. A stored reference names the maze's folder
       (rooms/<id>/…), so the deal must send deal-image addresses and never
       one stored path — see "the picture addresses" in _deal.js. Every
       address must be signed for its own picture, and a publicRounds call
       without the day must refuse rather than fall back to raw paths. */
    const sentAll = JSON.stringify([sentOdd, sentGuess]);
    check(!sentAll.includes("/img/"), "the deal sent to the page carries a stored picture path — the address gives the answer away");
    const addresses = sentOdd.flatMap(r => r.tiles.map(t => t.image)).concat(sentGuess.map(r => r.image));
    check(addresses.every(a => a.startsWith(deals.IMAGE_FUNCTION + "?")), "a picture in the deal is not a deal-image address");
    check(new Set(addresses).size === addresses.length, "two pictures in the deal share one address");
    const addrOk = (game, rounds) => rounds.every((r, i) => (game === "odd" ? r.tiles.map(t => t.image) : [r.image]).every((a, j) => {
        const q = new URLSearchParams(a.split("?")[1]);
        const ref = deals.imageRefAt({ rounds: game === "odd" ? odd : guess }, game, i, j);
        return q.get("g") === game && q.get("d") === DAY && q.get("r") === String(i) && q.get("t") === String(j) &&
            deals.imageSigMatches(game, DAY, i, j, ref, q.get("s")) &&
            !deals.imageSigMatches(game, "2026-10-06", i, j, ref, q.get("s"));
    }));
    check(addrOk("odd", sentOdd), "an Odd One Out picture address is not signed for its own day, round, tile and picture");
    check(addrOk("guess", sentGuess), "a Guess the Maze picture address is not signed for its own day, round and picture");
    let refused = false;
    try { deals.publicRounds("odd", odd); } catch (e) { refused = true; }
    check(refused, "publicRounds without a day did not refuse — a caller that forgot it would send the raw paths");

    /* ONE ROUND AT A TIME (30 Sept 2026; see _deal.js). A deal reply hands
       out only the rounds reached — none before the start — keeping the
       day's length; the reply ending round r hands out r+1 and no further. */
    const held = deals.publicRounds("odd", odd, DAY, 0);
    check(held.length === odd.length && held.every(r => r === null), "a deal reply before the start still hands out pictures");
    const two = deals.publicRounds("guess", guess, DAY, 2);
    check(two.length === guess.length && two[1] && two[1].image === sentGuess[1].image && two.slice(2).every(r => r === null),
        "a deal reply for a player on room 2 hands out more (or other) than rooms 1 and 2");
    const nx = deals.nextRound("odd", odd, 0, DAY);
    check(nx && nx.round === 1 && eq(nx.tiles, sentOdd[1].tiles) && deals.nextRound("odd", odd, odd.length - 1, DAY) === null,
        "the round handed out after round 0 is not round 1 as the full deal addresses it, or the last round hands out another");
    const opening = deals.nextRound("guess", guess, -1, DAY);
    check(opening && opening.round === 0 && opening.image === sentGuess[0].image, "the start does not hand out room 1");
    const row = (moves) => ({ at: new Date(), moves });
    check(deals.reachedOf("odd", null, 5, false) === 0, "a day with no start hands out a round");
    check(deals.reachedOf("odd", row({}), 5, false) === 1, "a started day does not hand out round 0 alone");
    check(deals.reachedOf("odd", row({ r0: { tile: 1 }, r1: { tile: 2 } }), 5, false) === 3, "two picks made should hand out three rounds");
    check(deals.reachedOf("guess", row({ r0: { guesses: ["x"], done: false } }), 5, false) === 1, "a room still being guessed hands out the next");
    check(deals.reachedOf("guess", row({ r0: { guesses: ["x"], done: true } }), 5, false) === 2, "a room over does not hand out the next");
    check(deals.reachedOf("odd", null, 5, true) === 5, "a filed day does not hand out every round");

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

        /* The line under a finished day's points (Daily.bonusLine): the
           bonus and total only from a day the server filed, nothing about a
           bonus for a signed-out day except how to earn one, and nothing at
           all while a signed-in day's figures are still on their way. */
        const line = o => (typeof Daily.bonusLine === "function" ? Daily.bonusLine(o) : null);
        check(line({ score: { points: 50, bonus: 161 }, signedIn: true, mode: "account" }) === "50 + 161 speed bonus = 211 on the boards",
            "Daily.bonusLine does not show base + bonus = total for a filed day");
        check(line({ score: { points: 40, bonus: 0 }, signedIn: true, mode: "anon" }) === "No speed bonus: this day began signed out.",
            "Daily.bonusLine does not explain a claimed day's missing bonus");
        check(line({ score: { points: 40, bonus: 0 }, signedIn: true, mode: "account" }) === "No speed bonus this time.",
            "Daily.bonusLine does not say a filed day earned no bonus");
        check(line({ score: null, signedIn: true, mode: "account" }) === "",
            "Daily.bonusLine says something about a bonus the server has not reported yet");
        const out = line({ score: null, signedIn: false, mode: "anon" });
        check(typeof out === "string" && /sign in/i.test(out) && !/\d/.test(out),
            "Daily.bonusLine should only invite a signed-out player to sign in, with no bonus figure");
        check(typeof Daily.bonusRule === "function" && /up to 36 /.test(Daily.bonusRule("10", "picking")),
            "Daily.bonusRule does not print the real most a round can earn");
    }
}

if (process.exitCode) {
    console.error(`\n${checked} checks — see above.`);
} else {
    console.log(`daily parity OK — ${checked} checks: points, grace, the deal and what the page is sent, the secret seed, the calendar.`);
}

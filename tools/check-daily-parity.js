#!/usr/bin/env node
/* Checks that the browser and the server agree about how a day is dealt.
 *
 * ----------------------------------------------------------------------
 * WHAT IT IS GUARDING
 *
 * The three daily games choose their day in the browser (js/daily.js) and
 * the two score endpoints re-derive the same day on the server to check
 * what a player claims (netlify/functions/_daily.js, used by
 * guess-scores.js and daily-scores.js). They agree because they run the
 * same arithmetic — nothing coordinates them.
 *
 * When they stop agreeing, NOTHING BREAKS LOUDLY. The server derives a
 * different puzzle, decides every correct answer is wrong, and the day's
 * scores silently do not count. No error, no log, no failing page. The
 * first anybody hears about it is a player in Discord saying their score
 * did not save.
 *
 * That is exactly the failure this file exists to make noisy, and it is
 * not hypothetical: FEATURED_DAYS was added to js/daily.js on its own and
 * would have done precisely this on launch day.
 *
 * ----------------------------------------------------------------------
 * WHAT IS NO LONGER POSSIBLE, AND WHAT STILL IS
 *
 * The table itself cannot drift any more. It lives in one file,
 * js/featured-days.js, which the browser loads as a script and the server
 * requires — so there is no second copy to edit on its own.
 *
 * Two things still can, and this checks both:
 *
 *   THE ARITHMETIC. daySeed is implemented twice, because the two
 *   runtimes cannot share it as easily as they share a table of data. The
 *   parts are joined into a string and hashed, and a different join order
 *   is a different hash and therefore a different puzzle. Comparing the
 *   NUMBERS the two produce is the only check that catches that; comparing
 *   the tables would wave it straight through.
 *
 *   THE WIRING. featured-days.js is only loaded by a <script> tag, so a
 *   page that pulls in daily.js without it applies no salt and desyncs
 *   from the server — the original bug wearing a different hat. Every
 *   page is checked for the pairing.
 *
 *     node tools/check-daily-parity.js
 *
 * Exits non-zero and says what is wrong.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const BROWSER = path.join(ROOT, "js", "daily.js");
const FEATURED = path.join(ROOT, "js", "featured-days.js");
const SERVER = path.join(ROOT, "netlify", "functions", "_daily.js");

function fail(msg) {
    console.error("MISMATCH: " + msg);
    process.exitCode = 1;
}

/* js/daily.js is a browser IIFE assigning window.Daily. It is RUN rather
   than parsed — parsing it would be a third implementation of the thing
   being compared, which defeats the point.

   THE CLOCK HAS TO BE FAKED INSIDE THE SANDBOX. A vm context has its own
   realm and therefore its own Date, so patching Date.prototype out here
   does nothing to the code in there — the first version of this check did
   exactly that and reported the same browser seed for every day, which is
   the giveaway. The context is given a Date subclass instead, whose
   toISOString answers whatever `pretend` currently holds. */
const clock = { pretend: null };

function loadBrowserDaily() {
    class FakeDate extends Date {
        toISOString() {
            return clock.pretend ? clock.pretend + "T12:00:00.000Z" : super.toISOString();
        }
    }
    const sandbox = {
        window: {},
        document: { addEventListener() {} },
        fetch: () => Promise.reject(new Error("no network in the parity check")),
        Date: FakeDate,
        Math, JSON, console
    };
    sandbox.self = sandbox;
    vm.createContext(sandbox);

    /* featured-days.js FIRST, exactly as the page loads it — daily.js reads
       the table off the global it sets, so running daily.js alone would
       give it an empty table and quietly compare the wrong thing. There is
       no `module` in this context, so the file takes its browser branch. */
    vm.runInContext(fs.readFileSync(FEATURED, "utf8"), sandbox, { filename: "js/featured-days.js" });
    vm.runInContext(fs.readFileSync(BROWSER, "utf8"), sandbox, { filename: "js/daily.js" });
    return sandbox.window.Daily;
}

// Runs fn as though it were that day, in the sandbox's clock.
function asOf(day, fn) {
    clock.pretend = day;
    try { return fn(); } finally { clock.pretend = null; }
}

const server = require(SERVER);
const browser = loadBrowserDaily();

if (!browser || typeof browser.daySeed !== "function") {
    fail("js/daily.js did not publish window.Daily.daySeed");
    process.exit(1);
}

/* ---- 1. the wiring ----

   The table cannot drift any more — there is one of it, in
   js/featured-days.js, read by both sides. What can go wrong instead is a
   page loading daily.js without it, which leaves the browser applying no
   salt while the server applies one: the same silent desync, reached a
   different way.

   Order matters as much as presence. daily.js reads the global the moment
   it runs, so a script tag placed after it is the same as no tag at all. */
for (const name of fs.readdirSync(ROOT).filter(f => f.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(ROOT, name), "utf8");
    const daily = html.indexOf("js/daily.js");
    if (daily === -1) continue;
    const featured = html.indexOf("js/featured-days.js");
    if (featured === -1) {
        fail(name + " loads js/daily.js but not js/featured-days.js — " +
            "featured days would be ignored on that page");
    } else if (featured > daily) {
        fail(name + " loads js/featured-days.js AFTER js/daily.js — " +
            "daily.js reads the table as it runs, so it must come first");
    }
}

// ---- 2. the seeds, which is the part that actually matters ----
/* A spread of days: ordinary ones, every featured one, and the days either
   side of each featured one — the boundary is where an off-by-one in the
   table would hide. */
const days = new Set(["2026-01-01", "2026-06-15", "2027-02-28"]);
for (const iso of Object.keys(server.FEATURED_DAYS)) {
    const d = new Date(iso + "T00:00:00Z");
    for (const shift of [-1, 0, 1]) {
        const x = new Date(d);
        x.setUTCDate(x.getUTCDate() + shift);
        days.add(x.toISOString().slice(0, 10));
    }
}

// Every shape of seed the games actually ask for. ["ratrospect"] was one of
// them until that game was dropped; it came out with the rest of it, because
// a shape nothing derives is a comparison that can never fail and therefore
// never catches anything.
const SHAPES = [
    ["guess"],
    ["guess:crop", 3],
    ["guess:options", 2, "the-little-maze"],
    ["odd"],
    ["odd", "maze-empire"],
    ["odd:tiles", "maze-empire"]
];

let checked = 0;

for (const day of [...days].sort()) {
    // The browser's daySeed reads today() internally, so the clock is moved
    // rather than the argument passed.
    const mine = asOf(day, () => SHAPES.map(parts => browser.daySeed(...parts)));
    const theirs = SHAPES.map(parts => server.daySeed(day, ...parts));

    SHAPES.forEach((parts, i) => {
        checked++;
        if (mine[i] !== theirs[i]) {
            fail(`${day} ${JSON.stringify(parts)} — browser ${mine[i]} vs server ${theirs[i]}`);
        }
    });

    /* daySeedFor is the path the games actually take now: they pin the day
       they started on and deal from it, so a round crossing midnight is not
       re-dealt (see day() in js/oddoneout.js and picks() in js/guess.js).
       It is checked with the clock deliberately set to a DIFFERENT day, so
       an implementation that quietly read today() instead of its argument
       would fail here rather than pass by coincidence. */
    if (typeof browser.daySeedFor !== "function") {
        fail("js/daily.js did not publish window.Daily.daySeedFor");
    } else {
        const elsewhere = day === "2026-01-01" ? "2026-06-15" : "2026-01-01";
        const pinned = asOf(elsewhere, () => SHAPES.map(parts => browser.daySeedFor(day, ...parts)));
        SHAPES.forEach((parts, i) => {
            checked++;
            if (pinned[i] !== theirs[i]) {
                fail(`${day} ${JSON.stringify(parts)} via daySeedFor (clock on ${elsewhere}) — ` +
                    `browser ${pinned[i]} vs server ${theirs[i]}`);
            }
        });
    }

    // Sanity: the fake clock must actually be reaching the sandbox, or
    // every comparison above is comparing the same day with itself and
    // this whole check is decorative.
    const sawDay = asOf(day, () => browser.today());
    if (sawDay !== day) {
        fail(`the parity check's own clock is not reaching js/daily.js ` +
            `(asked for ${day}, it saw ${sawDay})`);
        break;
    }

    if (typeof browser.isFeaturedDay === "function") {
        const bFeatured = asOf(day, () => browser.isFeaturedDay());
        if (bFeatured !== server.isFeaturedDay(day)) {
            fail(`${day} — isFeaturedDay disagrees (browser ${bFeatured}, server ${server.isFeaturedDay(day)})`);
        }
    }
}

/* ---- 3. which mazes a day may deal from ----

   Both sides leave out a maze catalogued on or after the day being dealt
   (existedBefore), so a maze added at lunchtime joins tomorrow's pool
   instead of re-dealing today's. Like daySeed it is written twice, and a
   maze kept on one side and dropped on the other is the two sides dealing
   different games — so the two are asked the same questions here,
   including the awkward ones: no stamp at all (older records), a stamp on
   the day itself, the instant before midnight, and junk. */
const POOL_CASES = [
    {},
    { createdAt: "2026-09-23T23:59:59.999Z" },
    { createdAt: "2026-09-24T00:00:00.000Z" },
    { createdAt: "2026-09-24T13:00:00.000Z" },
    { createdAt: "2026-09-25T00:00:00.000Z" },
    { createdAt: "" },
    { createdAt: 12345 },
    null
];
if (typeof browser.existedBefore !== "function" || typeof server.existedBefore !== "function") {
    fail("existedBefore is missing from js/daily.js or netlify/functions/_daily.js");
} else {
    const poolDay = "2026-09-24";
    POOL_CASES.forEach(rec => {
        checked++;
        const b = browser.existedBefore(rec, poolDay);
        const s = server.existedBefore(rec, poolDay);
        if (b !== s) fail(`existedBefore(${JSON.stringify(rec)}, ${poolDay}) — browser ${b} vs server ${s}`);
    });
    // And the answer itself, for the one case that decides the feature: a
    // maze created during the day must NOT be in that day's pool.
    if (server.existedBefore({ createdAt: "2026-09-24T13:00:00.000Z" }, poolDay) !== false) {
        fail("existedBefore lets a maze created during the day into that day's pool");
    }
}

if (process.exitCode) {
    console.error(`\n${checked} seeds compared across ${days.size} days — see above.`);
} else {
    console.log(`daily parity OK — ${checked} seeds matched across ${days.size} days ` +
        `(featured: ${Object.keys(server.FEATURED_DAYS).join(", ") || "none"}).`);
}

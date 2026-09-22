/* The day rules, on the server's side of the wire.

   js/daily.js holds the same three answers for the browser: when a day turns
   over, how a date becomes a seed, and what a seeded shuffle does with a
   list. This is the copy the scoring endpoint needs, because it re-derives
   each day's puzzle for itself rather than believing what the page claims
   was in it.

   Two copies of a thing this small is a risk worth naming: they are not the
   same file and cannot be, so they are kept identical by being tiny,
   commented on both sides, and — more usefully — by a test that deals the
   same day in both and compares. If they ever drift, every score submitted
   that day is rejected as wrong, which is loud rather than silent. */

// UTC, so a player and the server never disagree about which day it is.
const today = () => new Date().toISOString().slice(0, 10);

/* May a score still be filed against this day?

   Today, plus a few minutes' grace for the day that has just ended.

   Both sides agree about the calendar — they are both on UTC — but they read
   it at different moments, and the gap between them is the whole game. A
   player who starts the last puzzle at 23:58 and finishes at 00:01 sends a
   day the server has by then stopped calling today, and the answer was "That
   day is not open": a score genuinely earned, refused, with a message that
   is not true of anything the player did. Nobody would ever report it —
   it happens to one person, once, at midnight — which is exactly why it
   would have stayed there.

   Five minutes is sized to a slow finish and a slow request, not to a second
   attempt. It does widen the window in which yesterday's puzzle can be
   STARTED and filed, but only by those five minutes, and the puzzle was
   freely playable a moment earlier anyway — the one-row-per-player-per-day
   index is what actually stops anything compounding. Refusing real scores to
   save five minutes of an already-open door is the worse trade.

   The row is still filed against the day it was PLAYED, not the day it
   arrived, so yesterday's board gets the score it earned. */
const GRACE_MS = 5 * 60 * 1000;

function dayIsOpen(day) {
    const now = Date.now();
    if (day === new Date(now).toISOString().slice(0, 10)) return true;
    const justEnded = new Date(now - GRACE_MS).toISOString().slice(0, 10);
    return day === justEnded;
}

// mulberry32, exactly as the page runs it.
function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// FNV-1a.
function seedFrom(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/* A shuffle that depends only on the seed and the order it was handed.

   The order going in decides what comes out, which is why every caller
   sorts its pool on a fixed key first — a list left in the order the
   database returned it is not a stable order, and an admin saving an edit
   at noon would deal a different set for the rest of the day. */
function shuffle(list, seed) {
    const rand = seededRandom(seed);
    return list
        .map(item => ({ item, k: rand() }))
        .sort((a, b) => a.k - b.k)
        .map(o => o.item);
}

/* ---------------------------------------------------- FEATURED DAYS

   THE SAME FILE THE BROWSER READS, not a copy of it.

   A featured day is a date whose puzzle is re-rolled with a salt, so the
   day the site opens deals something better than whatever that date
   happens to hash to. The table was briefly written out here as well as
   in the browser, with a build-time check comparing the two — and two
   tables, either of which can be edited alone, is exactly how the browser
   ends up dealing one puzzle while the server checks a different one.
   Silently: no error, no log, just a day where every correct answer is
   judged wrong.

   js/featured-days.js holds nothing but the table and detects which
   runtime it is in, so Node gets it through module.exports and the
   browser gets it as a global. See its header for how to change one.

   REACHING OUT OF netlify/functions/ IS DELIBERATE and is the only place
   this codebase does it. The alternative was keeping the table here and
   shipping it to the browser somehow, which means either a build step or
   an async fetch — and an async fetch is worse than the bug it fixes:
   daySeed is synchronous, so a game dealing before the table arrived
   would apply no salt and desync, which is the whole failure being
   removed.

   The require is static, so the bundler follows it; it is also named in
   `included_files` in netlify.toml, for the same belt-and-braces reason
   _furnidata.json is. */
const FEATURED_DAYS = require("../../js/featured-days.js");

function saltFor(iso) {
    const salt = FEATURED_DAYS[iso];
    return salt ? ":" + salt : "";
}

/* The seed for a day, salt included — the server's half of Daily.daySeed.

   THE STRING MUST BE BUILT EXACTLY AS js/daily.js BUILDS IT: the parts
   joined with colons, then the day, then the salt. A different join order
   is a different hash and therefore a different puzzle. The table can no
   longer drift, but this arithmetic is still written twice, which is why
   tools/check-daily-parity.js compares the NUMBERS the two produce
   rather than the tables. */
function daySeed(day, ...parts) {
    return seedFrom(parts.join(":") + ":" + day + saltFor(day));
}

function isFeaturedDay(day) {
    return Boolean(FEATURED_DAYS[day]);
}

/* A hallway is not a maze, and the daily games must not deal one.
 *
 * The archive has always known this — js/home.js has carried the same test
 * since the walked count was first wrong by one — but it knew it only for
 * itself. The games read the rooms collection directly and took every
 * document in it, so "Origins Maze Rats Hallway" turned up as a round of
 * Guess the Maze with nothing in it to guess, and as one of the five names
 * offered against rooms that were actually mazes.
 *
 * IT LIVES HERE BECAUSE BOTH SIDES NEED IT. The browser picks the day's
 * rooms and the server re-derives the same pick to score what is submitted
 * (see the header above), and a filter applied on one side only is not a
 * filter at all — it is the two sides dealing different rounds, which is
 * precisely the silent failure tools/check-daily-parity.js exists to make
 * noisy. js/daily.js carries the same test for the browser, for the same
 * reason daySeed is implemented twice: the two runtimes cannot share it as
 * easily as they share a table.
 *
 * Read off the tag, case-insensitively, exactly as the archive reads it.
 * The tag is already how this site says what a room is; a second field
 * saying the same thing would be a second thing to keep in step.
 */
const HALLWAY_TAG = "hallway";

function isHallway(record) {
    return (record && Array.isArray(record.tags) ? record.tags : [])
        .some(t => String(t).trim().toLowerCase() === HALLWAY_TAG);
}

module.exports = {
    today, dayIsOpen, seededRandom, seedFrom, shuffle,
    FEATURED_DAYS, daySeed, isFeaturedDay, isHallway
};

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

module.exports = { today, seededRandom, seedFrom, shuffle };

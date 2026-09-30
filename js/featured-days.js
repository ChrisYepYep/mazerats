/* The featured days, in one place, read by both sides.

   ----------------------------------------------------------------------
   WHY THIS FILE EXISTS

   A featured day is a date whose puzzle is re-rolled with a salt, so that
   the day the site opens deals something better than whatever the 3rd of
   October happens to hash to. See the long note in js/daily.js for the
   reasoning behind a salt rather than a hand-picked list.

   The awkward part is WHO NEEDS TO KNOW. The three games deal their day in
   the browser; the two score endpoints re-derive the same day on the
   server to check what a player claims. Both have to apply the same salt,
   and they run in different worlds — a classic browser script with no
   module system, and CommonJS inside a Netlify function.

   It was written down twice, in js/daily.js and netlify/functions/
   _daily.js, with a build-time check comparing them. That worked, but it
   made a wrong edit a thing the BUILD had to catch rather than a thing
   that could not happen: two tables, one of which can be edited alone.
   And the failure it guards against is silent — the server derives a
   different puzzle, decides every correct answer is wrong, and a day's
   scores quietly do not count.

   So there is one table now, here, and both sides read it.

   ----------------------------------------------------------------------
   HOW ONE FILE IS READ BY BOTH

   No build step and no module system, so it detects where it is running:
   Node gets it through module.exports, the browser gets it as a global.
   That is the whole trick, and it is why this file holds the table and
   nothing else — no logic that would have to behave identically in two
   runtimes, just data.

   THE BROWSER MUST LOAD IT BEFORE js/daily.js. home.html does. If a page
   ever loads daily.js without it, the salt silently stops being applied
   there — which is the original bug wearing a different hat — so
   tools/check-daily-parity.js asserts the pairing in every page, and the
   build runs that before anything else.

   ----------------------------------------------------------------------
   CHANGING IT

   Add or remove a date, deploy, and look at what the games deal. Change
   the salt to re-roll the same day.

   DO IT BEFORE THE DAY, NOT DURING IT. The salt is part of the seed, and
   the seed is only read when a day is first dealt (30 Sept 2026: the day is
   now dealt once, on the server, and stored in daily_deals — see
   netlify/functions/_deal.js; the browser no longer reads this table at
   all, and much of the note above describes the arrangement before that).
   So a salt changed once the day has been dealt does NOTHING until that
   day's two daily_deals documents are deleted, and deleting them mid-day
   re-deals the puzzle under anyone already playing. */
(function (root) {
    "use strict";

    var FEATURED_DAYS = {
        // Launch day. The countdown on the landing page is set separately,
        // from the launchAt site setting, and should name this same date.
        "2026-10-03": "launch"
    };

    if (typeof module === "object" && module && module.exports) {
        module.exports = FEATURED_DAYS;          // netlify/functions/_daily.js
    } else {
        root.FEATURED_DAYS = FEATURED_DAYS;      // js/daily.js
    }
})(typeof globalThis !== "undefined" ? globalThis : this);

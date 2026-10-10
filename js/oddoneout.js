/* Odd One Out — four rooms, three from one maze, and one that wandered in.

   Five of those a day. The three that belong are three different rooms from
   the same maze, so the answer is never "the one that looks different from
   the other three" in the obvious sense — every room looks different from
   every other room. What gives the imposter away is the thing underneath a
   maze: the palette its builder reached for, the floor they used
   everywhere, how densely they furnish, whether they build tall.

   That is a genuinely different question from the one Guess the Maze asks.
   There you are recognising a place you have been. Here you can win without
   knowing any of the four mazes by name, purely on style — which is why it
   works for somebody who has never walked one of them.

   ----------------------------------------------------------------------
   Choosing the imposter

   At random it is usually too easy: a bright Christmas maze dropped among
   three shots of a grey dungeon is spotted in a second, and the round
   teaches nobody anything.

   So the imposter is preferred from a maze that shares a tag with the one
   it is hiding in — same theme, same sort of build — and only falls back to
   any other maze when nothing shares a tag. The round is then decided by
   how the two builders differ inside the same idea, which is the whole
   point of the game.

   ----------------------------------------------------------------------
   Who deals it

   The server, once a day, and it keeps what it dealt (see
   netlify/functions/_deal.js, where the choosing above now lives). This
   page used to deal the day itself from the archive, with every round's
   imposter marked in memory — so the answers were in the page, tomorrow's
   rounds were a device clock away, and an edit to the archive mid-day
   re-dealt the rounds under the server that scored them. Now the page is
   handed four pictures a round and nothing more, and each pick is sent the
   moment it is made (Daily.move); the server says whether it was right. */
(function () {
    "use strict";

    const ROUNDS = 5;
    const POINTS_EACH = 10;        // a perfect day is 50, as in Guess the Maze; must match daily-scores.js
    /* v2: a day is now the server's deal and a pick is its verdict. A v1
       day was dealt by this page, and its tile numbers point into rounds
       the server never dealt — so it is not read at all rather than
       migrated. */
    const STATE_KEY = "mazerats_odd_v2";
    // v2: rounds went from 100 points to 10, so the old record starts again.
    const STATS_KEY = "mazerats_odd_stats_v2";

    /* WHOSE DAY IT IS (10 Oct 2026). This browser's copy of the day, and
       its running record, are stamped with the account that played them
       (`who`: the public board id from `me`, never the Discord id — the
       same one js/account.js keeps in WHO_KEY), and a copy stamped by
       anybody else is not this player's. On a shared computer the second
       player used to be shown the first one's day: in the side menu's
       "3 of 5" (OddOneOutStatus), adopted over their own by saveState as
       "further on", and banked into one record for both. "" when nobody
       is signed in, or `me` gave no public id, which matches nothing. */
    const whoNow = () => (window.Account && Account.current && Account.current.publicId ? String(Account.current.publicId) : "");
    const ours = s => Boolean(s && s.who && s.who === whoNow());

    /* THE DAY BEING PLAYED, which is not always today.

       This used to be `() => Daily.today()`, read fresh by everything that
       needed a day — dealing, banking, sharing, submitting. So a round in
       progress at midnight was re-dealt between one pick and the next: the
       first picks were made against yesterday's tiles, the rest against
       today's, and the mixed result went to the server filed under TODAY,
       where the one-row-per-player-per-day index then refused the player's
       real go at today once they came back for it.

       Now the day is pinned in state.day when a day's game begins, and
       everything reads it from there. Crossing midnight changes nothing
       about a game already under way; the new day starts the next time the
       window is opened on a finished (or untouched) old one — see open(). */
    const day = () => (state && state.day) || window.Daily.today();

    /* The deal being played, as the server handed it: { day, rounds }, each
       round four { image }s and nothing saying which is the imposter. null
       until it has arrived, or when it could not be had. */
    let deal = null;
    let state = null;
    let stats = null;
    let el = {};
    let showSplash = true;
    let submitting = false;        // a finished day on its way to the server
    let picking = false;           // a pick on its way to be judged

    /* Entrance and finish pictures, hallways, and mazes catalogued during
       the day are all kept out of the deal — by the server now, which deals
       it (netlify/functions/_deal.js has the reasons, moved there with the
       dealing from here). */

    function dealt() {
        return deal && deal.day === day() ? deal.rounds : [];
    }

    // ---------- the state of play ----------

    /* A blank day for the day being dealt. `posted` is whether the
       finished day reached the server, kept WITH the day so a submission
       that failed is tried again on the next open rather than forgotten
       with the visit. `who` is the account playing it (see WHOSE DAY IT
       IS), or stamped by the first save that knows it. There was a `mode` too, "account"
       or "anon" for a day begun signed out; every day is an account's now
       (10 Oct 2026), and a `mode` left on a saved day is not read. */
    // Whether the server's recorded picks are the ones in hand, tile for tile.
    function samePicks(recorded, picks) {
        return recorded.length === picks.length && recorded.every((p, i) => picks[i] && picks[i].tile === p.tile && Boolean(picks[i].right) === Boolean(p.right));
    }

    function blankDay(forDay) {
        return { day: forDay || window.Daily.today(), picks: [], done: false, posted: false, who: whoNow() };
    }

    function readSaved() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        return saved && typeof saved.day === "string" && Array.isArray(saved.picks) ? saved : null;
    }

    /* Whether the day in memory should give way to today's.

       Yes if it is today's already (nothing to do, but loading again is
       harmless), finished, or never started. NO if it is an earlier day
       part-way through: somebody who was on round three at midnight is
       left to finish the day they started rather than having it swapped
       for a different five mid-sitting. Their result still goes to the
       server under the day it was dealt for; within the five-minute grace
       (dayIsOpen in netlify/functions/_daily.js) it is recorded, and after
       that the server no longer deals that day at all, so the next open
       starts today. */
    function shouldStartToday(s) {
        if (!s) return true;
        if (s.day === window.Daily.today()) return true;
        return s.done || !s.picks.length;
    }

    /* How far on a saved day is: picks made, and a finished day past any
       unfinished one. What decides which of two copies of the same day
       wins. */
    const progressOf = s => (s ? s.picks.length + (s.done ? 1 : 0) : -1);

    /* Saved, but not over a copy another tab has taken further.

       Two tabs of the game used to overwrite each other's day: each saved
       its own state whole, so the tab picking second wrote its day over the
       first's, picks and all. Now the stored copy is read first, and if it
       is the same day and further on than this one it is adopted rather
       than overwritten — see also the `storage` listener in mount(), which
       brings a tab that is only watching up to date. `posted` is kept if
       either copy has it. A signed-in player's picks are the server's to
       settle anyway (the first recorded pick per round wins); this keeps
       the page's copy from contradicting them. */
    function saveState() {
        /* The rounds handed out so far go with the day (`dealt`), because a
           deal reply no longer carries them all — see ONE ROUND AT A TIME
           in js/daily.js — so a reload mid-day plays on from these (30 Sept
           2026). */
        if (state && deal && deal.day === state.day) state.dealt = deal.rounds;
        // Whose it is (WHOSE DAY IT IS): stamped once, by the account that
        // began it, and never moved to whoever is signed in later.
        if (state && !state.who) state.who = whoNow();
        const stored = readSaved();
        // Never a practice run's copy over the real day that replaced it
        // (see PRACTICE in refreshDay), and never another account's copy,
        // however far on it is (10 Oct 2026).
        if (stored && state && ours(stored) && stored.day === state.day && progressOf(stored) > progressOf(state) &&
                !(stored.practice && !state.practice)) {
            if (deal && deal.day === stored.day) window.Daily.mergeRounds(deal.rounds, stored.dealt);
            state = Object.assign(stored, { posted: Boolean(stored.posted || state.posted) });
            if (deal && deal.day === state.day) state.dealt = deal.rounds;
            return;
        }
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }

    /* THE RUNNING RECORD IS THE ACCOUNT'S (10 Oct 2026), as Guess the
       Maze's is. The results card's Streak, Best day, Days played and
       All-time used to be this browser's own count and nothing else — so
       on a shared computer the second player was shown the first one's
       figures, and a day they finished after the first had played it here
       was never counted at all (bankDay's guard saw the day already
       banked). Now they are counted by the server from the account's own
       filed days (statsFor in netlify/functions/player-data.js, sent as
       `oddStats`), read on every open and again once the day is filed:
       `accountStats`, kept in memory only.

       `localStats` is this browser's count FOR THE SAME ACCOUNT (stamped
       `who`; a record stamped by anybody else is not read), kept only to
       stand in when the server's figures could not be had. `stats` is
       whichever is shown — see shownStats. */
    let localStats = null;
    let accountStats = null;

    function loadStats() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(STATS_KEY) || "null"); } catch (e) { s = null; }
        /* Merged over the defaults rather than trusted whole: a stats object
           saved by an earlier shape of this game is still an object, so it
           passes any "is this a thing" test while missing half the fields —
           which is how "Best day undefined" ended up on the results card. */
        localStats = Object.assign({ days: 0, streak: 0, bestDay: 0, points: 0, lastDay: "", who: whoNow() },
            s && typeof s === "object" && ours(s) ? s : null);
        shownStats();
    }

    function saveStats() {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(localStats)); } catch (e) { /* private mode */ }
    }

    // The account's figures once they have been read; this browser's own
    // count for the same account otherwise.
    function shownStats() {
        stats = accountStats && signedIn() ? accountStats : localStats;
        return stats;
    }

    // The account's figures from a player-data answer (`oddStats`), over
    // the defaults, or null when there were none.
    function takeAccountStats(remote) {
        const s = remote && remote.oddStats;
        accountStats = s && typeof s === "object"
            ? Object.assign({ days: 0, streak: 0, bestDay: 0, points: 0, lastDay: "" }, s) : null;
        shownStats();
    }

    /* Banked once, when the day ends. A streak counts days PLAYED rather
       than days won: coming back is the habit worth rewarding, and a game
       that breaks your streak for a bad day is one you stop opening after a
       bad day.

       Written out here rather than pointed at. Several notes in this file
       used to be one-line references to the reasoning in the game that sat
       beside it, which was fine until that game was dropped and its file
       went with it. A cross-reference is only as durable as the file it
       names. */
    /* The streak as it stands NOW, for the splash. stats.streak is the run
       as last banked, so a run that ended days ago was still announced as
       going. Alive only if the last day played is today or yesterday
       (UTC); otherwise 0 until the next day is banked. */
    function liveStreak() {
        const t = window.Daily.today();
        shownStats();
        return stats.lastDay === t || stats.lastDay === window.Daily.dayBefore(t) ? stats.streak : 0;
    }

    /* Counted into this browser's record for the account, which is saved,
       and into the account's figures in memory too, so the card is right
       the moment the day ends — the filed day's answer then replaces them
       with the server's own count (wireResults). */
    function bankDay() {
        // A practice run is not a day played: the real one, after the
        // launch cut, is the one the streak and totals count.
        if (state && state.practice) return;
        /* Once per day, and never a day older than the last one banked: a
           day banked from the server's record (refreshDay) can be the day
           before one already banked here, and counting it then would move
           lastDay backwards and restart the streak. ISO days compare as
           strings. */
        const count = s => {
            if (!s || (s.lastDay && s.lastDay >= day())) return false;
            s.streak = s.lastDay === window.Daily.dayBefore(day()) ? s.streak + 1 : 1;
            s.days += 1;
            s.bestDay = Math.max(s.bestDay || 0, score());
            s.points = (s.points || 0) + score();
            s.lastDay = day();
            return true;
        };
        if (count(localStats)) saveStats();
        count(accountStats);
        shownStats();
    }

    const score = () => state.picks.filter(p => p.right).length * POINTS_EACH;
    const roundNow = () => state.picks.length;
    const finished = () => state.done || roundNow() >= dealt().length;

    const signedIn = () => Boolean(window.Account && Account.current);

    /* A pick, sent to be judged. The page does not know which tile is the
       imposter any more (see the note at the top), so a pick is a question
       to the server, and the round moves on when the answer comes back.

       The server RECORDS it, with the time it arrived — the round's end,
       for the speed bonus — and the first pick recorded for a round is the
       one that stands: if another tab or device got there first, the
       answer says so (`already`) and names that pick, and that is what
       this page shows. The day is scored from those records, never from
       anything this page sends later.

       Every pick is a signed-in player's (the daily games need an account
       with a nickname; open() does not deal the day otherwise). The day's
       "mode" — "account", or "anon" for a day begun signed out, with its
       picks replayed as recorded ones on signing in part-way
       (adoptRecorded), the per-network cap on signed-out verdicts, and
       "Carry on unlisted" — all went with signed-out play (10 Oct 2026).

       While a pick is on its way the others are ignored; a pick that could
       not be judged (no connection, a server having a moment) leaves the
       round as it was, says so, and can simply be made again. */
    async function choose(tileIndex) {
        if (finished() || picking) return;
        const index = roundNow();
        const round = dealt()[index];
        if (!round || !round.tiles[tileIndex]) return;

        const forDay = day();
        picking = true;
        setPicking(index, tileIndex, true);
        const reply = await window.Daily.move("odd", forDay, index, { tile: tileIndex });
        picking = false;
        setPicking(index, tileIndex, false);
        // The day was replaced while the pick was out (a reset, a new day).
        if (!state || state.day !== forDay || roundNow() !== index) return;

        const body = reply.body || {};
        /* Signed out under the game — a session ended elsewhere (401), or
           lapsed (403 "sign in to play", whose notice js/account.js has
           already put up). Signing in again is a page load, which reads the
           recorded rounds back from the server and carries on from them. */
        if (reply.status === 401 || (reply.status === 403 && body.signInToPlay)) {
            signInLapsed(index);
            return;
        }
        if (reply.status !== 200 || typeof body.right !== "boolean") {
            /* Refused because the day has closed — a round begun before
               midnight and picked after the grace. With nothing played yet
               the day is simply swapped for today's (see refreshDay). */
            if (reply.status === 400 && !state.picks.length) return refreshDay().then(() => { render(); settleFocus(); });
            /* Part-way through, it is the honest end of a day begun
               yesterday: the picks made so far stay on this device, and the
               player is told so and offered today's rounds. It used to fall
               through to pickFailed below — "try it again" — which could
               never succeed, so a round in progress at 00:05 asked to be
               tried again for as long as the window stayed open. */
            if (reply.status === 400 && (/not open/i.test(String(body.error || "")) || forDay !== window.Daily.today())) {
                dayEnded(index);
                return;
            }
            /* The server's record and this page's disagree (a round out of
               order, a day reset elsewhere): read the day again, which
               brings the recorded picks with it — or, when the server has
               none at all, clears a day an administrator has given back
               (see refreshDay). */
            if (reply.status === 409) return refreshDay().then(() => { render(); settleFocus(); });
            pickFailed(index);
            return;
        }
        /* (An answer that came back NOT recorded meant the server had not
           seen the session; it is a 401 or 403 now, handled above, so the
           "asked again, or carry on unrecorded" step here went with
           signed-out play, 10 Oct 2026.) */

        const pick = body.already && Number.isInteger(body.tile)
            ? { tile: body.tile, right: body.right }
            : { tile: tileIndex, right: body.right };
        // The next round's four pictures come with this verdict, and only
        // now (ONE ROUND AT A TIME in js/daily.js).
        window.Daily.takeRound(dealt(), body.next);
        /* The day's first verdict, given after the launch cut, on a day the
           deal marked practice (dealt at 07:59, played from 08:00): the day
           is the real one, and is carded, shared and banked as it (1 Oct
           2026; Daily.afterPractice). */
        if (!state.picks.length && state.practice && window.Daily.afterPractice && window.Daily.afterPractice(body)) {
            delete state.practice;
            practiceUntil = null;
        }
        state.picks.push(pick);
        practiceEnded = false;         // said once, on the fresh day's splash
        if (state.picks.length >= dealt().length) state.done = true;
        saveState();
        if (state.done) { bankDay(); window.Daily.track("finish", "odd"); }
        render();
        settleFocus();
    }

    // The pressed tile, while its pick is being judged — and every tile in
    // the round unpressable until it is.
    function setPicking(index, tileIndex, on) {
        const sheet = roundSheets[index];
        if (!sheet) return;
        sheet.inner.setAttribute("aria-busy", on ? "true" : "false");
        sheet.inner.querySelectorAll(".odd-tile").forEach(btn => {
            btn.classList.toggle("is-picking", on && Number(btn.dataset.tile) === tileIndex);
        });
    }

    function pickFailed(index) {
        const sheet = roundSheets[index];
        const note = sheet && sheet.inner.querySelector(".odd-pick-note");
        const text = "That pick did not reach the server, so it has not counted. Try it again.";
        if (note) { note.textContent = text; note.hidden = false; }
        announce(text);
    }

    /* The round's note with something to press under it: the words, then
       one button per action. Written as elements rather than markup so the
       handlers are bound to exactly these buttons. */
    function noteWithActions(index, text, actions) {
        const sheet = roundSheets[index];
        const note = sheet && sheet.inner.querySelector(".odd-pick-note");
        if (note) {
            note.textContent = text + " ";
            actions.forEach(([label, run]) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "guess-btn";
                btn.textContent = label;
                btn.addEventListener("click", () => { btn.disabled = true; run(); });
                note.appendChild(btn);
            });
            note.hidden = false;
        }
        announce(text);
    }

    /* The day this round belongs to has closed under it (see choose). Its
       picks stay in storage only until today's deal replaces them, which
       is the button's job: refreshDay asks for the old day, is refused, and
       deals today. */
    function dayEnded(index) {
        noteWithActions(index,
            "This day's rounds closed at five past midnight (UTC), so that pick can't count. Your picks so far are kept on this device.",
            [["Play today's rounds", () => {
                refreshDay().then(() => { showSplash = true; render(); settleFocus(); });
            }]]);
    }

    /* The session went away part-way through a recorded day (see choose).
       Signing in again is a page load, which reads the recorded rounds back
       from the server and carries on from them. ("Carry on unlisted" sat
       beside it, playing on unrecorded; there is no unrecorded play now,
       10 Oct 2026.) */
    function signInLapsed(index) {
        noteWithActions(index,
            "You've been signed out, so that pick wasn't recorded. Sign in again to carry on — the rounds already recorded are kept.",
            [["Sign in again", () => { if (window.Account && Account.signIn) Account.signIn(); }]]);
    }

    /* Where the keyboard goes after a pick, and what is said out loud.

       A pick moves the deck on a sheet, and the sheet the pressed tile was
       on goes inert underneath the next one — so focus fell back to <body>
       and a keyboard player had to Tab from the top of the page to reach
       the next four pictures, and a screen reader said nothing at all about
       the pick having happened. The focus now lands on the question for the
       next round (Tab from there is the first picture, as it should be;
       landing on a picture would be one keypress from spending it), or on
       the verdict once the day is over.

       preventScroll, as in js/guess.js: the sheet arriving is still sliding
       up when this runs, and a focus that scrolls would scroll the clipped
       deck itself to chase it, leaving every sheet out of place.

       The live region says what a sighted player reads off the screen and
       no more: the round and the running score. The score moving is how
       this game tells you a pick was right, so saying the score is
       saying exactly that much. */
    function settleFocus() {
        const live = liveSheet();
        if (!live) return;
        /* A round sheet is kept as { el, inner }; the intro and results
           sheets are the elements themselves (see deckSheets). */
        const inner = live.inner || live.querySelector(".guess-sheet-inner");
        if (!inner) return;
        const target = inner.querySelector(finished() ? ".daily-verdict" : ".daily-ask");
        if (target) {
            target.tabIndex = -1;
            target.focus({ preventScroll: true });
        }
        announce(finished()
            ? `${verdictFor(state.picks.filter(p => p.right).length)} ${score()} points.`
            : `Round ${roundNow() + 1} of ${dealt().length}. ${score()} points so far.`);
    }

    function announce(text) {
        if (!el.live) return;
        // Emptied first, so the same words twice in a row are still read.
        el.live.textContent = "";
        setTimeout(() => { if (el.live) el.live.textContent = text; }, 30);
    }

    // ---------- drawing it ----------

    /* The day, written out. Guess the Maze puts it under its title and it
       is worth having: a daily game should say which day it is dealing,
       especially one somebody has come back to after a while.

       "en-GB" RATHER THAN THE VISITOR'S OWN LOCALE, which is what passing
       undefined here asks for. On any machine not set to British English
       that makes the two games disagree about how to write the same day —
       "Sunday, September 20" here against "Sunday 20 September" two clicks
       away. Nobody sees one game in isolation; the menu offers them
       together. The site is written in British English throughout and the
       date it prints should be too. js/guess.js and js/daily.js name the
       same locale for the same reason. */
    function longDate() {
        const d = new Date(day() + "T12:00:00Z");
        return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // ---------- the deck ----------

    /* Guess the Maze's deck, sheet for sheet: the splash, one sheet per
       round, and the results. Whatever has not been reached yet waits
       tucked along the bottom edge showing its own labelled tab, and each
       sheet rises over the last when you get to it — see the note at the
       top of js/guess.js for what that buys a daily game over a box that
       rewrites itself. The CSS is that game's too (.guess-deck and the
       rules under it), which is also how a phone loses the tabs here: the
       narrow-layout block puts them away for both.

       Unlike Guess the Maze, the number of round sheets is not fixed. The
       day deals as many rounds as the archive can fill, usually five, so
       the round sheets are built per deal rather than once at mount — see
       buildRounds. */

    /* Which sheet is up: "intro" | "round" | "results". Worked out afresh
       by render() from the state of play every time, so there is no second
       record of where the player is to fall out of step with the first. */
    let view = "intro";
    let roundSheets = [];          // { el, inner, index } per round dealt
    let builtFor = null;           // the dealt rounds the round sheets were made for

    /* The deck as it stands: the results only once there is a day to have
       results for (see the note on its markup in home.html). */
    function deckSheets() {
        const list = [el.intro].concat(roundSheets);
        if (roundSheets.length) list.push(el.results);
        return list;
    }

    function liveIndex() {
        if (view === "results" && roundSheets.length) return roundSheets.length + 1;
        if (view === "round") return 1 + Math.min(roundNow(), roundSheets.length - 1);
        return 0;
    }

    function liveSheet() {
        return deckSheets()[liveIndex()] || null;
    }

    /* One sheet per round dealt, cloned from the template in home.html and
       put in before the results. Thrown away and made again only when the
       deal itself changes — a new day, or a retry after the archive failed
       — because a sheet is the round's own page, and a round already
       played sits underneath the next one exactly as it was left.

       The tab says "Round 3", fixed text, as Guess the Maze's say "Room 3":
       where the day has got to is the round counter's job on the sheet
       itself. */
    function buildRounds(rounds) {
        roundSheets.forEach(s => s.el.remove());
        roundSheets = [];
        builtFor = rounds;
        // A new deal has no results yet; the old day's card goes with it.
        stopFootTimer();
        if (el.resultsInner) el.resultsInner.innerHTML = "";
        const tpl = document.getElementById("odd-round-template");
        if (!tpl || !el.results) return;
        rounds.forEach((round, i) => {
            const node = tpl.content.firstElementChild.cloneNode(true);
            node.setAttribute("aria-label", `Round ${i + 1}`);
            const label = node.querySelector(".guess-sheet-tab-label");
            if (label) label.textContent = `Round ${i + 1}`;
            const inner = node.querySelector(".guess-sheet-inner");
            inner.tabIndex = -1;
            /* Delegated to the sheet rather than bound per picture, because
               the four are written in when the round comes up. The index
               check is belt and braces: every sheet but the live one is
               inert, so a pick on a covered round cannot normally reach
               here at all. */
            inner.addEventListener("click", e => {
                const btn = e.target.closest(".odd-tile");
                if (!btn || i !== roundNow()) return;
                choose(Number(btn.dataset.tile));
            });
            el.deck.insertBefore(node, el.results);
            roundSheets.push({ el: node, inner, index: i });
        });
    }

    /* Places every sheet, exactly as layout() in js/guess.js does: the
       live one at the top, the finished ones underneath it, and the ones
       still to come tucked along the bottom with the LAST showing the
       lowest sliver. --tucked is what the live sheet's padding reserves so
       nothing on it ends up behind those tabs; --shade lifts each waiting
       page's ground a step so the tabs read as separate pages. inert takes
       every covered sheet out of the tab order and the accessibility tree
       in one. */
    function layout() {
        const list = deckSheets();
        const live = liveIndex();
        el.results.hidden = !roundSheets.length;
        el.deck.style.setProperty("--tucked", list.length - 1 - live);
        list.forEach((node, i) => {
            const sheet = node.el || node;
            const isLive = i === live;
            const isTucked = i > live;
            sheet.classList.toggle("is-live", isLive);
            sheet.classList.toggle("is-tucked", isTucked);
            sheet.style.zIndex = String(i);
            sheet.style.setProperty("--shade", String(Math.max(0, i - live)));
            sheet.style.transform = isTucked
                ? `translateY(calc(100% - ${list.length - i} * var(--tuck)))`
                : "translateY(0)";
            sheet.toggleAttribute("inert", !isLive);
        });
    }

    /* The deck placed with the easing switched off, so opening the window
       part-way through a day shows it already stacked on the right sheet
       rather than every sheet flying into position — the same is-settling
       step start() takes in js/guess.js. */
    function settled(draw) {
        el.deck.classList.add("is-settling");
        draw();
        void el.deck.offsetHeight;        // commit the placement before easing is restored
        el.deck.classList.remove("is-settling");
    }

    /* The intro sheet with something other than the rules on it: "Dealing…",
       or the archive failing. The round sheets go, so the deck is that one
       sheet and nothing waits under it. */
    function introMessage(html) {
        if (builtFor === null || roundSheets.length) buildRounds([]);
        el.introInner.classList.remove("guess-splash");
        el.introInner.innerHTML = html;
        view = "intro";
        layout();
    }

    /* What used to rewrite the one body is now which sheet is up and what
       is written on it. Each sheet is written when it comes up — the splash
       every time, a round as it is reached, the results once the day is
       over — so a round's four pictures are asked for when that round
       arrives, as they always were, rather than twenty at once on open. */
    function render() {
        if (!el.deck) return;
        const rounds = dealt();
        if (builtFor !== rounds) buildRounds(rounds);
        if (!rounds.length) {
            /* Reached when the day's deal could not be had — the server not
               answering, or answering with nothing to deal. A button rather
               than "try again in a moment", because without one the only way
               to try again was to reload the page. */
            introMessage(`
                <p class="daily-note">The archive is not answering just now, so there is nothing to deal.</p>
                <button type="button" class="guess-btn" id="odd-retry">Try again</button>`);
            const retry = document.getElementById("odd-retry");
            if (retry) retry.addEventListener("click", () => { deal = null; open(true); });
            return;
        }

        // The splash is always the bottom sheet, and is what a finished or
        // part-played day has underneath it.
        el.introInner.classList.add("guess-splash");
        el.introInner.innerHTML = splashHtml();
        wireSplash();

        if (finished()) {
            view = "results";
            el.resultsInner.innerHTML = resultsHtml();
            watchFoot();
            layout();
            return wireResults();
        }
        if (showSplash) {
            view = "intro";
            return layout();
        }
        /* The first four pictures are about to be on screen, so this is when
           the speed bonus's clock starts — on the server, the first time
           only (Daily.start). Not once a pick has been made: a clock started
           then would time only the rounds left. No time is shown anywhere
           in the game. */
        if (!state.picks.length && window.Daily.start) window.Daily.start("odd", day());
        view = "round";
        const sheet = roundSheets[roundNow()];
        if (sheet && rounds[roundNow()]) {
            sheet.inner.innerHTML = roundHtml(rounds[roundNow()]);
            watchTiles(sheet);
        } else if (sheet) {
            // Not handed out yet (ONE ROUND AT A TIME in js/daily.js).
            sheet.inner.innerHTML = `<p class="daily-note">Dealing the round…</p>`;
            fetchRound(roundNow());
        }
        layout();
    }

    /* A round whose pictures this page does not have: round 0 before the
       start's reply has brought it, or a later one whose `next` was lost —
       a reply that fell over, a reload with nothing saved. Round 0 is asked
       for through Daily.opening. A later one is in a deal asked for again,
       since the server's record says it has been reached (30 Sept 2026;
       the signed-out way, sending the round before's pick again
       unrecorded, went on 10 Oct 2026). */
    let fetchingRound = -1;
    async function fetchRound(index) {
        if (fetchingRound === index) return;
        fetchingRound = index;
        const forDay = day();
        const rounds = dealt();
        if (index === 0) {
            window.Daily.takeRound(rounds, await window.Daily.opening("odd", forDay));
        } else {
            const reply = await window.Daily.deal("odd", forDay);
            if (reply && reply.day === forDay) window.Daily.mergeRounds(rounds, reply.rounds);
        }
        fetchingRound = -1;
        if (!state || state.day !== forDay || dealt() !== rounds || roundNow() !== index || finished()) return;
        const sheet = roundSheets[index];
        if (rounds[index]) {
            saveState();
            render();
            settleFocus();
        } else if (sheet) {
            sheet.inner.innerHTML = `
                <p class="daily-note">This round's pictures could not be had just now.</p>
                <button type="button" class="guess-btn" data-odd-refetch>Try again</button>`;
            const retry = sheet.inner.querySelector("[data-odd-refetch]");
            if (retry) retry.addEventListener("click", () => { retry.disabled = true; fetchRound(index); });
        }
    }

    /* A picture that will not load, and what the round does about it.

       The deal is stored for the day (netlify/functions/_deal.js), so a
       picture deleted or replaced in the archive after it was dealt leaves
       a round pointing at nothing — and a broken-image icon in one of four
       tiles, with nothing said, reads as the game being broken. Each tile
       now watches its own picture: a failure is tried again twice by
       itself, a few seconds apart (a picture can fail for a moment on a
       bad connection, or while the image CDN warms up), and after that the
       tile says "Picture unavailable" and the round's note offers a retry.
       The tile stays pressable throughout — the pick is the server's to
       judge, and a round with one missing picture can still be played on
       the other three rather than blocking the day. */
    const TILE_RETRY_MS = [2000, 6000];
    function watchTiles(sheet) {
        sheet.inner.querySelectorAll(".odd-tile img").forEach(img => {
            const src = img.getAttribute("src");
            let tries = 0;
            img.addEventListener("load", () => markTile(img, false));
            img.addEventListener("error", () => {
                if (!img.isConnected) return;
                if (tries < TILE_RETRY_MS.length) {
                    const wait = TILE_RETRY_MS[tries++];
                    setTimeout(() => { if (img.isConnected) reloadTile(img, src); }, wait);
                    return;
                }
                markTile(img, true);
                offerTileRetry(sheet);
            });
        });
    }

    // Asked for again. Emptied first, so the browser really does ask rather
    // than deciding the same src is already settled.
    function reloadTile(img, src) {
        img.removeAttribute("src");
        img.setAttribute("src", src);
    }

    function markTile(img, unavailable) {
        const btn = img.closest(".odd-tile");
        if (!btn) return;
        btn.classList.toggle("is-unavailable", unavailable);
        img.hidden = unavailable;
        let flag = btn.querySelector(".odd-tile-missing");
        if (unavailable && !flag) {
            flag = document.createElement("span");
            flag.className = "odd-tile-missing daily-note";
            flag.textContent = "Picture unavailable";
            btn.appendChild(flag);
        } else if (!unavailable && flag) {
            flag.remove();
        }
        const n = Number(btn.dataset.tile) + 1;
        btn.setAttribute("aria-label", unavailable ? `Picture ${n}, which would not load` : `Picture ${n}`);
    }

    function offerTileRetry(sheet) {
        const note = sheet.inner.querySelector(".odd-pick-note");
        if (!note || note.querySelector(".odd-tile-retry")) return;
        note.textContent = "A picture in this round would not load. You can still pick from the others. ";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "guess-btn odd-tile-retry";
        btn.textContent = "Try the pictures again";
        btn.addEventListener("click", () => {
            note.hidden = true;
            note.textContent = "";
            sheet.inner.querySelectorAll(".odd-tile.is-unavailable img").forEach(img => {
                markTile(img, false);
                reloadTile(img, img.getAttribute("src"));
            });
        });
        note.appendChild(btn);
        note.hidden = false;
    }

    /* The rules, on the way in. This game's premise cannot be worked out by
       looking at it: four pictures of four different rooms look exactly like
       four pictures of four different rooms, and nothing on screen says that
       three of them share a builder. Told once, in a sentence, it becomes a
       game; left unsaid, it is a shrug and a guess. */
    /* Written straight into the intro sheet's own box, which carries the
       .guess-splash class while it shows this — as Guess the Maze's splash
       sheet does — so the column is centred in the sheet's full height
       rather than sitting at the top of it. */
    function splashHtml() {
        const started = state.picks.length > 0;
        return `
                <p class="guess-splash-eyebrow">Every day, five rounds</p>
                <h3 class="guess-splash-title"><span>ODD ONE</span><span>OUT</span></h3>
                <p class="guess-splash-date">${escapeHtml(longDate())}</p>

                <ol class="guess-rules">
                    <li><span class="guess-rules-n" aria-hidden="true">1</span>
                        <p>Four rooms a round. Three are from the same maze and one has <strong>wandered in</strong> from somewhere else.</p></li>
                    <li><span class="guess-rules-n" aria-hidden="true">2</span>
                        <p>The three that belong are different rooms, so go on <strong>the building</strong>: the floor, the palette, how densely it is furnished.</p></li>
                    <li><span class="guess-rules-n" aria-hidden="true">3</span>
                        <p>One pick a round. ${escapeHtml(window.Daily.bonusRule(String(POINTS_EACH), "picking"))}
                            Everyone gets the same five, new at midnight, UTC.</p></li>
                </ol>

                <button type="button" class="guess-btn guess-btn--lead" id="odd-start">
                    ${started ? "Back to the rooms" : "Show me the first four"} &rsaquo;
                </button>
                <p class="guess-splash-foot">${practiceEnded && !started
                    ? escapeHtml("The site's open, so your practice run is put away. These five count.")
                    : liveStreak() > 1 ? escapeHtml(liveStreak() + " day streak.") : ""}</p>`;
    }

    function roundHtml(round) {
        const tiles = round.tiles.map((tile, i) => `
            <button type="button" class="odd-tile" data-tile="${i}" aria-label="Picture ${i + 1}">
                <img src="${escapeHtml(tile.image)}" alt="" loading="lazy">
            </button>`).join("");

        return `
            <div class="daily-head">
                <p class="daily-step">Round <strong>${roundNow() + 1}</strong> of ${dealt().length}</p>
                <p class="daily-points">${score()}<span> pts</span></p>
            </div>
            <p class="daily-ask">Three of these are the same maze. Which one is not?</p>
            <div class="odd-grid">${tiles}</div>
            <p class="daily-note odd-pick-note" hidden></p>
            <p class="daily-note">Go on the building rather than the room: the floor, the palette,
                how densely it is furnished.</p>`;
    }

    /* The day as the server filed it — { day, points, bonus } — from the
       finishing submission's answer, or from the deal's `score` when the
       window is opened on a day already filed. The only place a speed bonus
       can come from: the page never knows the time. In memory only; every
       open brings it back with the deal. */
    let served = null;

    /* PRACTICE (30 Sept 2026). `practiceUntil` is the launch cut while the
       last deal said the day is still in practice time (its
       `practiceUntil`; PRACTICE BEFORE LAUNCH in
       netlify/functions/_speed.js), and null otherwise. A day begun then is
       kept with `practice` set to the cut, and is set aside for a fresh one
       once the cut has passed — see refreshDay. `practiceEnded` is that
       having just happened, for the splash to say so once. */
    let practiceUntil = null;
    let practiceEnded = false;

    /* The line under the day's points: the bonus and the total the boards
       show, or why there is none — or that it was a practice run. Worded
       once, for both games, by Daily.bonusLine (js/daily.js), which has the
       cases. */
    function bonusText() {
        const s = served && served.day === day() ? served : null;
        return window.Daily.bonusLine({ score: s, practice: state.practice || null, day: day() });
    }

    function drawBonus() {
        const line = document.getElementById("odd-bonus");
        if (!line) return;
        const text = bonusText();
        line.textContent = text;
        line.hidden = !text;
    }

    /* The line under the share button. A practice run of launch day points
       at the cut instead (1 Oct 2026): the real rounds are today's, from
       08:00, and "Five more rounds tomorrow." under "nothing counts until
       08:00" said the opposite. Read at drawing time, on the server's
       clock (Daily.now). */
    function footText() {
        const cut = state && typeof state.practice === "string" ? Date.parse(state.practice) : NaN;
        if (Number.isFinite(cut) && new Date(cut).toISOString().slice(0, 10) === day()) {
            return window.Daily.now() < cut
                ? `The real rounds start at ${new Date(cut).toISOString().slice(11, 16)} UTC today.`
                : "The real rounds are open — close this and reopen it to play them.";
        }
        return "Five more rounds tomorrow.";
    }

    /* A practice card left open across the cut rewrites its own line at
       08:00 (1 Oct 2026), as Guess the Maze's countdown does: it went on
       saying "start at 08:00 UTC today" after they had. Checked every 30s
       on the server's clock, like Guess's, rather than one long timeout a
       sleeping laptop would overshoot; it writes only once, on crossing,
       so "Copied" under the button is not clobbered every tick. Cleared
       when the card is redrawn, the deal is rebuilt or the window closes. */
    let footTimer = null;
    function stopFootTimer() {
        clearInterval(footTimer);
        footTimer = null;
    }
    function watchFoot() {
        stopFootTimer();
        const before = footText();
        if (!/^The real rounds start at/.test(before)) return;
        footTimer = setInterval(() => {
            const foot = document.getElementById("odd-foot");
            if (!foot) return stopFootTimer();
            const now = footText();
            if (now === before) return;
            foot.textContent = now;
            // The bonus line too (2 Oct 2026): it went on saying "nothing
            // counts until … 08:00 UTC" after 08:00.
            drawBonus();
            stopFootTimer();
        }, 30000);
    }

    function resultsHtml() {
        const rounds = dealt();
        const right = state.picks.filter(p => p.right).length;
        const bonus = bonusText();

        return `
            <div class="guess-summary daily-summary">
                <p class="guess-score daily-verdict" role="status" aria-live="polite">${verdictFor(right)}</p>
                <p class="guess-points"><strong>${score()}</strong><span>points</span></p>
                <p class="daily-bonus" id="odd-bonus"${bonus ? "" : " hidden"}>${escapeHtml(bonus)}</p>
                <p class="guess-next-up">${right} of ${rounds.length} spotted</p>
                <p class="guess-grid" aria-label="Result grid">${shareGrid()}</p>
                <dl class="guess-stats" id="odd-stats">${statsHtml()}</dl>
                <div class="guess-summary-actions">
                    <button type="button" class="guess-btn" id="odd-share">Copy result</button>
                </div>
                <p class="daily-note" id="odd-foot">${escapeHtml(footText())}</p>

                <div class="guess-boards" id="odd-boards"></div>
            </div>`;
        /* "Who was hiding where" — the imposter and the maze it was hiding
           in, for each of the five rounds — used to be listed here, and it
           was the most spoiling of the three lists: it gave away both halves
           of every round at once. Gone for the same reason as the others,
           this card being the thing that gets pasted into a channel where
           nobody else has played yet. */
    }

    /* The running record under the grid: the account's figures (see THE
       RUNNING RECORD IS THE ACCOUNT'S), with the same four labels as ever.
       Its own function so the filed day's recount can redraw it alone
       (drawStats) without rewriting the board beneath. */
    function statsHtml() {
        const s = shownStats();
        return `
                    <div><dt>Streak</dt><dd>${escapeHtml(s.streak)}</dd></div>
                    <div><dt>Best day</dt><dd>${escapeHtml(s.bestDay)}</dd></div>
                    <div><dt>Days played</dt><dd>${escapeHtml(s.days)}</dd></div>
                    <div><dt>All-time</dt><dd>${escapeHtml(s.points)}</dd></div>`;
    }

    function drawStats() {
        const list = document.getElementById("odd-stats");
        if (list) list.innerHTML = statsHtml();
    }

    /* Something a person might actually say, rather than a status line.

       What somebody wants at the end of a run is to be told how it went, in
       the tone of a friend watching over their shoulder: short, and about
       the run rather than about the game. */
    /* Out of the rounds actually dealt, not a fixed five (30 Sept 2026): a
       day the server dealt short of five would otherwise be told "4 of 5"
       for four out of four, and never "All five". ROUNDS only stands in
       before a deal has arrived. */
    const NUMBER_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    function verdictFor(right) {
        const of = dealt().length || ROUNDS;
        if (right === of) return `All ${NUMBER_WORDS[of] || of}. Nothing got past you.`;
        if (right === 0) return "Not a single one. Brutal.";
        if (right === of - 1) return "One slipped through.";
        return right + " of " + of + " — those builders know what they are doing.";
    }

    const shareGrid = () => state.picks.map(p => (p.right ? "🟩" : "🟥")).join("");

    /* The pasted result, in the one format both games share (Daily.shareText
       in js/daily.js): spotted out of the rounds dealt, and the total the
       boards rank by — the server's filed figure with its speed bonus once
       it has answered, labelled "incl. speed", and the base points until
       then (Daily.shareScore). */
    function shareText() {
        const s = served && served.day === day() ? served : null;
        return window.Daily.shareText(Object.assign({
            game: "Odd One Out",
            day: day(),
            right: state.picks.filter(p => p.right).length,
            of: dealt().length || ROUNDS,
            grid: shareGrid(),
            path: "odd",
            practice: Boolean(state && state.practice)
        }, window.Daily.shareScore(s, score())));
    }

    /* "Show me the first four". If the day has turned since the window was
       opened and nothing has been played, today's deal is fetched first:
       a window opened at 23:55 and started at 00:10 used to play
       yesterday's rounds, whose picks were then refused (after the grace)
       or never recorded — a whole sitting that silently did not count. A
       day already under way is left to finish, as shouldStartToday says. */
    function wireSplash() {
        const start = document.getElementById("odd-start");
        if (!start) return;
        start.addEventListener("click", async () => {
            if (state && !state.picks.length && !state.done && state.day !== window.Daily.today()) {
                start.disabled = true;
                await refreshDay();
            }
            showSplash = false;
            render();
            settleFocus();
        });
    }

    function wireResults() {
        /* The finished day, filed. The server scores it from the picks it
           recorded as they were made — see netlify/functions/daily-scores.js
           — so only the game and the day are sent. Signed out under the
           game, nothing is sent, and the day stays owed so that signing in
           again files it.

           The submit is AWAITED before the board is fetched, and that fetch
           goes past the edge cache (`fresh`). Fired side by side, the board
           request usually won the race — and even when it did not, the
           fifteen-second copy at the edge predated the row — so the one
           person guaranteed to be missing from the board they were shown
           was the player who had just finished.

           OWED UNTIL IT LANDS. This used to note the day as sent before
           sending it, and Daily.submit swallowed every failure — so a
           submission that fell over was never tried again that visit, and
           a finished day never reached the board. Now `posted` is set only
           once the server has the day (or has refused it for good), and is
           saved with the day, so a failure is retried on the next open. */
        const host = document.getElementById("odd-boards");
        const forDay = day();
        if (!state.posted && signedIn()) {
            if (host) host.innerHTML = `<p class="guess-board-note">Fetching the scores…</p>`;
            if (!submitting) {
                submitting = true;
                window.Daily.submit("odd", forDay)
                    .then(res => {
                        submitting = false;
                        // The filed day's base and bonus — just now, or
                        // already on file — for the line under the points.
                        const b = res.body;
                        if (res.ok && b && Number.isFinite(b.points)) {
                            served = { day: forDay, points: b.points, bonus: b.bonus || 0, practised: Boolean(b.practised) };
                            if (state && state.day === forDay) drawBonus();
                        }
                        /* The account's figures counted again now the day
                           is on file, so the card shows the server's count
                           rather than this page's guess at it (THE RUNNING
                           RECORD IS THE ACCOUNT'S; 10 Oct 2026). */
                        if (res.ok && signedIn() && Account.fetchState) {
                            Account.fetchState().then(remote => {
                                if (remote && remote.oddStats) { takeAccountStats(remote); drawStats(); }
                            }).catch(() => { /* the figures in hand stand */ });
                        }
                        /* A practice run, answered and not filed: the day
                           is marked one, if this page had not already
                           (begun before the cut, finished after it), and
                           the card says so. */
                        if (res.practice && b && state && state.day === forDay) {
                            if (!state.practice) state.practice = typeof b.practice === "string" ? b.practice : true;
                            served = null;
                            drawBonus();
                        }
                        /* `final`, not "not worth retrying now": a lapsed
                           session, a server record that is behind, and a
                           day still inside late filing all used to be
                           marked posted here and never sent again. See
                           filed() in js/daily.js. */
                        if (state && state.day === forDay && res.final) {
                            state.posted = true;
                            saveState();
                        }
                        /* The server has fewer rounds recorded than this
                           page finished — the day cannot be filed until
                           they are played. Read the day again: refreshDay
                           takes the server's record, so the rounds it is
                           missing come back up. (A day "carried on
                           unlisted" was settled here instead, until there
                           was no unlisted play; 10 Oct 2026.) */
                        if (state && state.day === forDay && res.body && res.body.reason === "unfinished") {
                            refreshDay().then(() => { showSplash = false; render(); settleFocus(); });
                            return;
                        }
                        const still = document.getElementById("odd-boards");
                        window.Daily.boards(still, "odd", { day: forDay, fresh: res.ok, practice: !!(state && state.practice) });
                    });
            }
        } else {
            window.Daily.boards(host, "odd", { day: forDay, practice: !!state.practice });
        }

        const share = document.getElementById("odd-share");
        if (share) {
            share.addEventListener("click", async () => {
                const foot = document.getElementById("odd-foot");
                const text = shareText();
                window.Daily.track("share", "odd");
                try {
                    await navigator.clipboard.writeText(text);
                    if (foot) foot.textContent = "Copied — paste it wherever you like.";
                } catch (e) {
                    /* Refused: the same selectable box Guess the Maze
                       offers, so the result can still be copied by hand
                       rather than only being told it could not be (30 Sept
                       2026; see Daily.shareFallback). */
                    window.Daily.shareFallback(share, text);
                    if (foot) foot.textContent = "Your browser would not copy it — select the text above and copy it yourself.";
                }
            });
        }
    }

    // ---------- the window ----------

    /* Whether the address is the game's own, /odd — with a slash on the
       end too, which Netlify serves through the same rule (10 Oct 2026;
       as atOwnAddress in js/guess.js). */
    const atOwnAddress = () => /^\/odd\/?$/.test(location.pathname);

    // Whatever had focus when the window opened, for close() to hand it
    // back to. Only recorded on a real open, not on a Retry inside it.
    let opener = null;

    async function open(retrying) {
        if (!el.overlay) return;
        /* Locked out of the games — a ban, or a nickname the admins asked
           to change (29 Sept 2026; Account.mayPlay in js/account.js). The
           one gate every way in passes, as in js/guess.js: it says why in a
           window of its own and nothing is dealt, and the empty window
           js/daily-loader.js may have opened while this file downloaded is
           shut again. Signed out and unbanned, nothing changes.

           mayPlay knows nobody until the first "who am I" has answered, and
           says yes, so the gate waits for that answer first (see guess.js). */
        if (!retrying && window.Account && typeof Account.mayPlay === "function" && !Account.known && typeof Account.ready === "function") {
            try { await Account.ready(); } catch (e) { /* signed out */ }
        }
        // A daily game: signed in with a nickname (4 Oct 2026, the owner's).
        if (!retrying && window.Account && typeof Account.mayPlay === "function" && !Account.mayPlay({ daily: true })) {
            el.overlay.classList.remove("open");
            if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
            if (atOwnAddress()) history.replaceState({}, "", "/home");
            return;
        }
        if (!retrying && !el.overlay.classList.contains("open")) {
            const active = document.activeElement;
            opener = active && active !== document.body && !el.overlay.contains(active) ? active : null;
        }
        el.overlay.classList.add("open");
        document.body.classList.add("modal-open");
        // Counted once per real open, never for a Retry inside it
        // (Daily.track; 30 Sept 2026).
        if (!retrying) window.Daily.track("open", "odd");
        /* The tab's title and canonical name the game while it is open, as
           the Alt Codes and the Guides do (PageMeta in js/site.js): /odd
           used to keep the archive's title (30 Sept 2026). */
        if (window.PageMeta) window.PageMeta.set("odd", "Odd One Out — Maze Rats", "https://mazerats.net/odd");
        if (!retrying && el.window) el.window.focus();
        /* The loading bar while the day is dealt (Daily.waiting in
           js/daily.js; 4 Oct 2026, the owner's), where a "Dealing…" line was.
           Down again once the day is drawn, or if anything below throws. */
        if (!deal || deal.day !== day()) Daily.waiting(el.deck, true, "Dealing today's rounds");
        try {
            // Who is signed in decides whose day and record are shown, so it
            // is known before anything is dealt. A failure reads as signed out.
            if (window.Account) { try { await Account.ready(); } catch (e) { /* signed out */ } }
            /* The check on page load could not be made at all (Account.unsure —
               a network blink, not an answer). Asked once more now, since the
               window being opened is usually well after the load, and the
               account's own day and figures are read by it. */
            if (window.Account && Account.unsure) { try { await Account.refresh(); } catch (e) { /* still unsure */ } }
            /* The account's running record (THE RUNNING RECORD IS THE
               ACCOUNT'S; 10 Oct 2026), asked for now and read before the day
               is, so a day the server's record finishes in refreshDay is
               banked against the account's figures rather than none. One
               request, alongside the reset's ticket. */
            const remote = signedIn() && Account.fetchState ? Account.fetchState().catch(() => null) : null;
            accountStats = null;
            loadStats();
            /* A day given back by an administrator lands here: the ticket is
               claimed before the stored day is read, so what loads is the fresh
               day rather than the one being cleared. The in-memory copy goes
               too, or the day just taken away would be played on — and with it
               the note that it was sent, since the replay has to be filed like
               any other. The server's recorded picks went with the reset
               (daily-games.js), so the deal below brings none back. */
            if (await window.Daily.claimReset("odd")) {
                try { localStorage.removeItem(STATE_KEY); } catch (e) { /* private mode */ }
                state = null;
            }
            if (remote) takeAccountStats(await remote);
            await refreshDay();
            showSplash = state.picks.length === 0 && !state.done;
            Daily.waiting(el.deck, false);
            /* Straight onto the right sheet — the splash, the round in hand, or
               the results — with the rest already stacked around it. Only the
               moves made while the window is open slide. */
            settled(render);
        } finally {
            Daily.waiting(el.deck, false);
        }
    }

    /* The day to play, from the server, and the state of play that goes
       with it.

       WHICH DAY is the server's to say. A day in memory or in storage that
       is an earlier day part-way through is asked for by name, so it can be
       finished; the server deals it only while the midnight grace lasts
       (dayIsOpen in netlify/functions/_daily.js), and after that the answer
       is today's. Otherwise the server's today is asked for, whatever this
       device's clock says — which is also what moves a tab left open
       overnight on to the new day.

       THE STATE is this device's copy of that day if it has one, and a
       blank one if not. For a signed-in player the server's record then
       wins wherever it is further on: picks made on another device, or on
       this one before a reload, come back with the deal, so a reload can
       neither lose a round nor offer it again. And a day the server
       already has on file is marked as posted.

       ONLY THIS ACCOUNT'S COPIES (10 Oct 2026): a day in memory or in
       storage stamped by another account (WHOSE DAY IT IS) is not carried
       on, filed, or played on from — it is somebody else's on a shared
       computer, and the day starts from the server's record instead.

       Leaves `deal` null when the day could not be had, which render()
       turns into a message and a retry. */
    async function refreshDay() {
        const read = readSaved();
        const saved = ours(read) ? read : null;
        const own = [state, saved].filter(ours);
        const carry = own.find(s => !shouldStartToday(s)) || null;
        let reply = carry ? await window.Daily.deal("odd", carry.day) : null;
        if (!reply) reply = await window.Daily.deal("odd");
        if (!reply) {
            deal = null;
            if (!ours(state)) state = saved && saved.day === window.Daily.today() ? saved : blankDay();
            return;
        }
        /* A finished day that never reached the board, about to be put
           away for a different one: filed first. Only today's or the carried
           day is ever kept in state, so a finished day whose submission fell
           over — at 00:04, say, with the retry on the next open at 09:00 —
           used to be replaced here by today's blank day and never sent
           again. The server still takes it for a while if its picks were
           recorded in time (LATE FILING in netlify/functions/daily-scores.js;
           Daily.fileable says how long). Not awaited for its answer beyond
           this: whatever it says, that day is over on this device. */
        const previous = ours(state) ? deal : null;
        const owed = own.find(s => s.day !== reply.day && s.done && !s.posted);
        if (owed && signedIn() && window.Daily.fileable && window.Daily.fileable(owed.day)) {
            await window.Daily.submit("odd", owed.day);
        }

        deal = { day: reply.day, rounds: reply.rounds };
        /* The rounds this device was handed for the day already, laid into
           the slots the reply left empty (ONE ROUND AT A TIME in
           js/daily.js). The deal in memory first, while it is still the
           same day's — and only this account's (another's could hand out
           rounds this player has not reached). */
        [previous, ...own].forEach(s => {
            if (s && s.day === reply.day) window.Daily.mergeRounds(deal.rounds, s.rounds || s.dealt);
        });
        // A day already filed brings its own figures, bonus included, so a
        // results card reopened later says what the board says.
        if (reply.score && Number.isFinite(reply.score.points)) {
            served = { day: reply.day, points: reply.score.points, bonus: reply.score.bonus || 0, practised: Boolean(reply.score.practised) };
        } else if (Array.isArray(reply.progress)) {
            /* And a day the server says is NOT on file forgets the figures
               kept for it. An administrator's reset takes the filed row
               away, and a page that was not reloaded kept the old row's
               "50 + N speed bonus = …" on the replayed day's card until the
               new submission answered — and for good if that submission
               failed. Only when `progress` is an array, the server's word
               that it read this player's day: a record it could not read
               says nothing about what is filed (28 Sept 2026). */
            served = null;
        }
        const mine = own.filter(s => s.day === reply.day)
            .sort((a, b) => progressOf(b) - progressOf(a))[0];
        state = mine || blankDay(reply.day);
        if (!("posted" in state)) state.posted = false;

        /* PRACTICE (30 Sept 2026; PRACTICE BEFORE LAUNCH in
           netlify/functions/_speed.js). While the server says the day is
           still in practice time, the day is marked a practice run — all of
           it, whenever it was begun, since nothing before the cut counts.
           Once it says not, a day marked so is put away and today starts
           fresh. The server has set aside its own copy
           (practiceOver, or the 409 a pick on it gets), and the start this
           page remembers goes with it (Daily.forgetStarts), so the real
           day's round 0 goes out timed. */
        practiceUntil = typeof reply.practiceUntil === "string" ? reply.practiceUntil : null;
        if (state.practice && !practiceUntil) {
            state = blankDay(reply.day);
            served = null;
            practiceEnded = true;
            showSplash = true;
            window.Daily.forgetStarts("odd");
        }
        if (practiceUntil) state.practice = practiceUntil;
        const wasDone = state.done;

        /* The server's record, laid over this device's copy.

           `progress` is an array only when the server knows who is asking
           (null signed out, or when it could not read the record), so an
           array — even an empty one — is the server's word on what was
           recorded for this player today.

           A day not yet filed takes the server's record WHEREVER IT
           DIFFERS, shorter included. Every pick a day keeps was recorded
           before it was kept (see choose), so a server with
           fewer has lost some: an administrator's reset while the window
           was open, or a pick taken while the session had lapsed, before
           that was caught. Keeping the longer local copy is what used to
           loop: every pick after it was refused as out of order, the 409
           read the day again, the day again kept the local copy, and so on
           for as long as the window stayed open. Taken from the server, the
           player picks up at the first round it does not have.

           An EMPTY record for a day with picks in hand is a day given back —
           the reset clears daily_starts (daily-games.js) — so the ticket
           the reset left is claimed here too, as open() does; otherwise the
           next open would claim it and wipe the replay. A day already filed
           takes the server's record only when it is further on, and is
           otherwise left as it is: the reset deletes the filed row, so
           `filed` means no reset happened. (This read `mode === "account"`
           until there were no other days; 10 Oct 2026.) */
        const recorded = Array.isArray(reply.progress) ? reply.progress : null;
        const accountDay = !reply.filed && recorded;
        if (accountDay && !recorded.length && state.picks.length) {
            await window.Daily.claimReset("odd");
            state = blankDay(reply.day);
        } else if (recorded && recorded.length &&
                /* An account day takes the server's record whenever it
                   differs, not only when its length does (5 Oct 2026, the
                   bug scan): on a shared computer the copy in this browser
                   can be another player's same-length day, which was kept
                   and shown as theirs. Guess the Maze's applyRecorded
                   always takes it. */
                (accountDay ? !samePicks(recorded, state.picks) : recorded.length >= state.picks.length)) {
            state.picks = recorded.map(p => ({ tile: p.tile, right: Boolean(p.right) }));
            state.done = state.picks.length >= deal.rounds.length;
        }
        if (reply.filed) state.posted = true;
        saveState();

        /* A day that became finished just now — finished on another device
           and brought here by the server's record — is banked here too.
           Only choose() and the storage listener used to bank, so the
           streak on this device never heard of a day finished elsewhere and
           broke the next day. bankDay counts a day once, and this
           browser's record is read fresh first, in case another tab has
           banked the day already. */
        if (state.done && !wasDone) { loadStats(); bankDay(); }
    }

    function close() {
        if (!el.overlay) return;
        stopFootTimer();
        el.overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
        if (window.PageMeta) window.PageMeta.restore("odd");
        /* Back to whatever opened the window, as guess.js's close() does —
           closing used to leave focus on a button that had just been hidden,
           dropping a keyboard user at the top of the page. The opener may
           be gone or hidden by now (the side menu closes itself before
           opening this, and a pasted /odd link has no opener at all), so
           the side menu's spine is the fallback, as it is for Guess. */
        const back = opener;
        opener = null;
        const usable = node => !!(node && document.body.contains(node) && node.getClientRects().length
            && !(node.closest && node.closest("[inert]")));
        const landing = usable(back) ? back : document.getElementById("side-spine");
        if (landing) landing.focus({ preventScroll: true });
        // A pasted /odd link should not leave the address bar claiming the
        // game is open once it has been closed.
        if (atOwnAddress()) history.replaceState({}, "", "/home");
    }

    function mount() {
        el = {
            overlay: document.getElementById("odd-overlay"),
            window: document.getElementById("odd-window"),
            close: document.getElementById("odd-close"),
            deck: document.getElementById("odd-deck")
        };
        if (!el.overlay || !el.deck) return;
        el.intro = el.deck.querySelector('[data-kind="intro"]');
        el.results = el.deck.querySelector('[data-kind="results"]');
        if (!el.intro || !el.results) return;
        el.introInner = el.intro.querySelector(".guess-sheet-inner");
        el.resultsInner = el.results.querySelector(".guess-sheet-inner");
        // Focusable, as every round sheet's is (see buildRounds), so a sheet
        // with nothing pressable on it can still hold the caret.
        el.introInner.tabIndex = -1;
        el.resultsInner.tabIndex = -1;

        /* The spoken half of each pick — see settleFocus. Made here and put
           beside the deck rather than in any one sheet, because the sheets
           are written as they come up and every one but the live sheet is
           inert, and a live region has to be in the page, and heard, BEFORE
           the words arrive for a screen reader to notice them.
           visually-hidden is the site's own class for this; guess.js uses it
           for its pips. */
        el.live = document.createElement("p");
        el.live.className = "visually-hidden";
        el.live.setAttribute("role", "status");
        el.live.setAttribute("aria-live", "polite");
        (el.window || el.overlay).appendChild(el.live);

        el.close.addEventListener("click", close);
        el.overlay.addEventListener("click", e => { if (e.target === el.overlay) close(); });
        /* Escape through the shared top-most-layer rule (EscapeLayers in
           js/site.js; 10 Oct 2026), as Pura Panic's window has it. A
           listener of this file's own on the document closed the game
           whatever was over it, so one press shut an Account notice (Sign In
           to Play, the nickname window, a ban) AND the game behind it. Now
           the front layer alone closes. The old listener stays only where
           site.js has not loaded. */
        const isOpen = () => el.overlay.classList.contains("open");
        if (window.EscapeLayers) {
            window.EscapeLayers.register({ elements: () => (isOpen() ? [el.overlay] : []), close: () => close() });
        } else {
            document.addEventListener("keydown", e => {
                if (e.key === "Escape" && isOpen()) close();
            });
        }

        /* Another tab playing the same day. `storage` fires in every OTHER
           tab when one saves, so a tab left open on round 2 hears that the
           other has reached round 4 and moves with it, instead of offering
           rounds already played and then saving its older copy over the
           newer one (see saveState). Only the same day, and only forwards. */
        window.addEventListener("storage", e => {
            if (e.key !== STATE_KEY || !state) return;
            const other = readSaved();
            if (!other || other.day !== state.day || progressOf(other) <= progressOf(state)) return;
            // Another account's day is not this one's to move on with
            // (WHOSE DAY IT IS; 10 Oct 2026).
            if (!ours(other)) return;
            if (other.practice && !state.practice) return;   // a practice run put away here
            if (picking) return;           // this tab's own pick settles it
            const wasDone = state.done;
            state = other;
            // The rounds the other tab was handed, which this one may not
            // have been (ONE ROUND AT A TIME in js/daily.js).
            if (deal && deal.day === state.day) window.Daily.mergeRounds(deal.rounds, state.dealt);
            // Re-read first: the other tab has probably banked the day
            // already, and bankDay's guard only sees it in fresh stats.
            if (state.done && !wasDone) { loadStats(); bankDay(); }
            if (el.overlay.classList.contains("open")) render();
        });

        if (atOwnAddress()) open();
    }

    window.OddOneOutStatus = function () {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        /* A practice run the launch cut has since passed is not today's
           play: the menu shows the day as untouched until the game puts
           the run away (30 Sept 2026). */
        const practiceOver = saved && typeof saved.practice === "string" && Date.parse(saved.practice) <= window.Daily.now();
        /* And only the signed-in account's own day (10 Oct 2026; WHOSE DAY
           IT IS): on a shared computer the menu said "3 of 5" for whoever
           had played last, or for nobody at all once signed out. A day
           saved before the stamp, or by another account, reads as
           untouched until the game is opened and the server says. */
        if (!saved || !ours(saved) || saved.day !== window.Daily.today() || !Array.isArray(saved.picks) || practiceOver) {
            return { started: false, done: 0, total: ROUNDS, finished: false, points: 0 };
        }
        return {
            started: saved.picks.length > 0,
            done: saved.picks.length,
            total: ROUNDS,
            finished: Boolean(saved.done),
            points: saved.picks.filter(p => p && p.right).length * POINTS_EACH
        };
    };

    window.openOddOneOut = function () { open(); };

    /* mount() now, if the document is already parsed.

       This file is no longer a <script src> in home.html — js/daily-loader.js
       fetches it the first time somebody asks for the game, which is long
       after DOMContentLoaded has been and gone. Listening for an event that
       has already fired means mount() never runs and the window opens empty.
       Both branches, because the deep-link path (/guess, /odd)
       still loads it while the document is parsing. */
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
})();

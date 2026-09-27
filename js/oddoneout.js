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

    /* A blank day for the day being dealt. `mode` is settled by the first
       pick — "account" when somebody is signed in to have their picks
       recorded, "anon" when not — and a day keeps the mode it began in
       (see choose). `posted` is whether the finished day reached the
       server, kept WITH the day so a submission that failed is tried again
       on the next open rather than forgotten with the visit. */
    function blankDay(forDay) {
        return { day: forDay || window.Daily.today(), picks: [], done: false, mode: null, posted: false };
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
        const stored = readSaved();
        if (stored && state && stored.day === state.day && progressOf(stored) > progressOf(state)) {
            state = Object.assign(stored, { posted: Boolean(stored.posted || state.posted) });
            return;
        }
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }

    function loadStats() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(STATS_KEY) || "null"); } catch (e) { s = null; }
        /* Merged over the defaults rather than trusted whole: a stats object
           saved by an earlier shape of this game is still an object, so it
           passes any "is this a thing" test while missing half the fields —
           which is how "Best day undefined" ended up on the results card. */
        stats = Object.assign({ days: 0, streak: 0, bestDay: 0, points: 0, lastDay: "" },
            s && typeof s === "object" ? s : null);
    }

    function saveStats() {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* private mode */ }
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
        return stats.lastDay === t || stats.lastDay === window.Daily.dayBefore(t) ? stats.streak : 0;
    }

    function bankDay() {
        if (stats.lastDay === day()) return;
        stats.streak = stats.lastDay === window.Daily.dayBefore(day()) ? stats.streak + 1 : 1;
        stats.days += 1;
        stats.bestDay = Math.max(stats.bestDay || 0, score());
        stats.points = (stats.points || 0) + score();
        stats.lastDay = day();
        saveStats();
    }

    const score = () => state.picks.filter(p => p.right).length * POINTS_EACH;
    const roundNow = () => state.picks.length;
    const finished = () => state.done || roundNow() >= dealt().length;

    const signedIn = () => Boolean(window.Account && Account.current);

    /* A pick, sent to be judged. The page does not know which tile is the
       imposter any more (see the note at the top), so a pick is a question
       to the server, and the round moves on when the answer comes back.

       For a signed-in player the server also RECORDS it, with the time it
       arrived — the round's end, for the speed bonus — and the first pick
       recorded for a round is the one that stands: if another tab or device
       got there first, the answer says so (`already`) and names that pick,
       and that is what this page shows. The day is scored from those
       records, never from anything this page sends later.

       The mode is settled by the day's first pick and kept: a day begun
       signed out stays unrecorded even after signing in (it is sent with
       `anon`, and filed with no bonus once it is finished — see scoreClaim
       in netlify/functions/daily-scores.js), because a day half recorded
       and half not could not be scored from either half.

       While a pick is on its way the others are ignored; a pick that could
       not be judged (no connection, a server having a moment) leaves the
       round as it was, says so, and can simply be made again. */
    async function choose(tileIndex) {
        if (finished() || picking) return;
        const index = roundNow();
        const round = dealt()[index];
        if (!round || !round.tiles[tileIndex]) return;
        if (!state.mode) state.mode = signedIn() ? "account" : "anon";

        const forDay = day();
        picking = true;
        setPicking(index, tileIndex, true);
        const reply = await window.Daily.move("odd", forDay, index, { tile: tileIndex }, { anon: state.mode === "anon" });
        picking = false;
        setPicking(index, tileIndex, false);
        // The day was replaced while the pick was out (a reset, a new day).
        if (!state || state.day !== forDay || roundNow() !== index) return;

        const body = reply.body || {};
        if (reply.status !== 200 || typeof body.right !== "boolean") {
            /* Refused because the day has closed — a round begun before
               midnight and picked after the grace. With nothing played yet
               the day is simply swapped for today's (see refreshDay);
               part-way through, it is the honest end of a day begun
               yesterday, and the picks made so far stay on this device. */
            if (reply.status === 400 && !state.picks.length) return refreshDay().then(() => { render(); settleFocus(); });
            /* The server's record and this page's disagree (a round out of
               order, a day reset elsewhere): read the day again, which
               brings the recorded picks with it. */
            if (reply.status === 409) return refreshDay().then(() => { render(); settleFocus(); });
            pickFailed(index);
            return;
        }
        // Answered but not recorded while this day was meant to be: the
        // sign-in lapsed. The day carries on unrecorded rather than stalling.
        if (state.mode === "account" && !body.recorded) state.mode = "anon";

        const pick = body.already && Number.isInteger(body.tile)
            ? { tile: body.tile, right: body.right }
            : { tile: tileIndex, right: body.right };
        state.picks.push(pick);
        if (state.picks.length >= dealt().length) state.done = true;
        saveState();
        if (state.done) bankDay();
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
            layout();
            return wireResults();
        }
        if (showSplash) {
            view = "intro";
            return layout();
        }
        /* The first four pictures are about to be on screen, so this is when
           the speed bonus's clock starts — on the server, for a signed-in
           player, the first time only (Daily.start). Not once a pick has
           been made: a day begun signed out has no clock and no bonus
           rather than one that timed only the rounds left. No time is shown
           anywhere in the game. */
        if (!state.picks.length && state.mode !== "anon" && window.Daily.start) window.Daily.start("odd", day());
        view = "round";
        const sheet = roundSheets[roundNow()];
        if (sheet) sheet.inner.innerHTML = roundHtml(rounds[roundNow()]);
        layout();
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
                        <p>One pick a round, ten points each. Everyone gets the same five, new at midnight, UTC.</p></li>
                </ol>

                <button type="button" class="guess-btn guess-btn--lead" id="odd-start">
                    ${started ? "Back to the rooms" : "Show me the first four"} &rsaquo;
                </button>
                <p class="guess-splash-foot">${liveStreak() > 1 ? escapeHtml(liveStreak() + " day streak.") : ""}</p>`;
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

    function resultsHtml() {
        const rounds = dealt();
        const right = state.picks.filter(p => p.right).length;

        return `
            <div class="guess-summary daily-summary">
                <p class="guess-score daily-verdict" role="status" aria-live="polite">${verdictFor(right)}</p>
                <p class="guess-points"><strong>${score()}</strong><span>points</span></p>
                <p class="guess-next-up">${right} of ${rounds.length} spotted</p>
                <p class="guess-grid" aria-label="Result grid">${shareGrid()}</p>
                <dl class="guess-stats">
                    <div><dt>Streak</dt><dd>${stats.streak}</dd></div>
                    <div><dt>Best day</dt><dd>${stats.bestDay}</dd></div>
                    <div><dt>Days played</dt><dd>${stats.days}</dd></div>
                    <div><dt>All-time</dt><dd>${stats.points}</dd></div>
                </dl>
                <div class="guess-summary-actions">
                    <button type="button" class="guess-btn" id="odd-share">Copy result</button>
                </div>
                <p class="daily-note" id="odd-foot">Five more rounds tomorrow.</p>

                <div class="guess-boards" id="odd-boards"></div>
            </div>`;
        /* "Who was hiding where" — the imposter and the maze it was hiding
           in, for each of the five rounds — used to be listed here, and it
           was the most spoiling of the three lists: it gave away both halves
           of every round at once. Gone for the same reason as the others,
           this card being the thing that gets pasted into a channel where
           nobody else has played yet. */
    }

    /* Something a person might actually say, rather than a status line.

       What somebody wants at the end of a run is to be told how it went, in
       the tone of a friend watching over their shoulder: short, and about
       the run rather than about the game. */
    function verdictFor(right) {
        if (right === ROUNDS) return "All five. Nothing got past you.";
        if (right === ROUNDS - 1) return "One slipped through.";
        if (right === 0) return "Not a single one. Brutal.";
        return right + " of " + ROUNDS + " — those builders know what they are doing.";
    }

    const shareGrid = () => state.picks.map(p => (p.right ? "🟩" : "🟥")).join("");

    /* The date written the way Guess the Maze writes it on its own share
       card — "24 Sept 2026" — rather than as the ISO key. Two cards pasted
       into the same channel from the same menu should not disagree about
       how to write the day, and "2026-09-24" is a database's way of saying
       it, not a person's. Same options as copyResult in js/guess.js. */
    function shareText() {
        const when = new Date(day() + "T00:00:00Z")
            .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
        return `Odd One Out ${when} — ${score()}/${dealt().length * POINTS_EACH}\n${shareGrid()}\n${location.origin}/odd`;
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
        /* The finished day, filed. For a day played signed in the server
           scores it from the picks it recorded as they were made, and the
           tiles sent here are ignored; for a day played signed out they are
           what it has to go on — see netlify/functions/daily-scores.js.
           Signed out, nothing is sent: there is no name to put on a row, and
           the day stays owed so that signing in files it.

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
                window.Daily.submit("odd", forDay, state.picks.map(p => ({ tile: p.tile })))
                    .then(res => {
                        submitting = false;
                        if (state && state.day === forDay && (res.ok || !res.retry)) {
                            state.posted = true;
                            saveState();
                        }
                        const still = document.getElementById("odd-boards");
                        window.Daily.boards(still, "odd", { points: score(), day: forDay, fresh: res.ok });
                    });
            }
        } else {
            window.Daily.boards(host, "odd", { points: score(), day: forDay });
        }

        const share = document.getElementById("odd-share");
        if (share) {
            share.addEventListener("click", async () => {
                const foot = document.getElementById("odd-foot");
                try {
                    await navigator.clipboard.writeText(shareText());
                    if (foot) foot.textContent = "Copied — paste it wherever you like.";
                } catch (e) {
                    if (foot) foot.textContent = "Could not copy it — your browser said no.";
                }
            });
        }
    }

    // ---------- the window ----------

    // Whatever had focus when the window opened, for close() to hand it
    // back to. Only recorded on a real open, not on a Retry inside it.
    let opener = null;

    async function open(retrying) {
        if (!el.overlay) return;
        if (!retrying && !el.overlay.classList.contains("open")) {
            const active = document.activeElement;
            opener = active && active !== document.body && !el.overlay.contains(active) ? active : null;
        }
        el.overlay.classList.add("open");
        document.body.classList.add("modal-open");
        if (!retrying && el.window) el.window.focus();
        if (!deal || deal.day !== day()) settled(() => introMessage(`<p class="daily-note">Dealing…</p>`));
        // Whether somebody is signed in decides what a pick does, so it is
        // known before anything is dealt. A failure reads as signed out.
        if (window.Account) { try { await Account.ready(); } catch (e) { /* signed out */ } }
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
        await refreshDay();
        loadStats();
        showSplash = state.picks.length === 0 && !state.done;
        /* Straight onto the right sheet — the splash, the round in hand, or
           the results — with the rest already stacked around it. Only the
           moves made while the window is open slide. */
        settled(render);
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

       Leaves `deal` null when the day could not be had, which render()
       turns into a message and a retry. */
    async function refreshDay() {
        const saved = readSaved();
        const carry = [state, saved].find(s => s && !shouldStartToday(s)) || null;
        let reply = carry ? await window.Daily.deal("odd", carry.day) : null;
        if (!reply) reply = await window.Daily.deal("odd");
        if (!reply) {
            deal = null;
            if (!state) state = saved && saved.day === window.Daily.today() ? saved : blankDay();
            return;
        }
        deal = { day: reply.day, rounds: reply.rounds };
        const mine = [state, saved].filter(s => s && s.day === reply.day)
            .sort((a, b) => progressOf(b) - progressOf(a))[0];
        state = mine || blankDay(reply.day);
        if (!("posted" in state)) state.posted = false;

        const recorded = Array.isArray(reply.progress) ? reply.progress : [];
        if (recorded.length && recorded.length >= state.picks.length) {
            state.picks = recorded.map(p => ({ tile: p.tile, right: Boolean(p.right) }));
            state.mode = "account";
            state.done = state.picks.length >= deal.rounds.length;
        }
        if (reply.filed) state.posted = true;
        saveState();
    }

    function close() {
        if (!el.overlay) return;
        el.overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
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
        if (location.pathname === "/odd") history.replaceState({}, "", "/home");
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
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && el.overlay.classList.contains("open")) close();
        });

        /* Another tab playing the same day. `storage` fires in every OTHER
           tab when one saves, so a tab left open on round 2 hears that the
           other has reached round 4 and moves with it, instead of offering
           rounds already played and then saving its older copy over the
           newer one (see saveState). Only the same day, and only forwards. */
        window.addEventListener("storage", e => {
            if (e.key !== STATE_KEY || !state) return;
            const other = readSaved();
            if (!other || other.day !== state.day || progressOf(other) <= progressOf(state)) return;
            if (picking) return;           // this tab's own pick settles it
            const wasDone = state.done;
            state = other;
            // Re-read first: the other tab has probably banked the day
            // already, and bankDay's guard only sees it in fresh stats.
            if (state.done && !wasDone) { loadStats(); bankDay(); }
            if (el.overlay.classList.contains("open")) render();
        });

        if (location.pathname === "/odd") open();
    }

    window.OddOneOutStatus = function () {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        if (!saved || saved.day !== window.Daily.today() || !Array.isArray(saved.picks)) {
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

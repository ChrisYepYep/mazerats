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
   point of the game. */
(function () {
    "use strict";

    const ROUNDS = 5;
    const PER_ROUND = 4;           // three from the maze, one from elsewhere
    const POINTS_EACH = 10;        // a perfect day is 50, as in Guess the Maze; must match daily-scores.js
    const STATE_KEY = "mazerats_odd_v1";
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

    let archive = [];              // the rooms as the API returned them
    let archiveDay = "";           // the UTC day they were fetched on; see open()
    let pool = [];                 // mazes with enough pictures to hide one in, for state.day
    let poolDay = "";
    let state = null;
    let stats = null;
    let el = {};
    let showSplash = true;
    let postedDay = "";            // the day whose result has already been sent this visit

    // ---------- the pool ----------

    /* Every maze with at least three gallery shots, because three is what a
       round needs from the home maze.

       Entrance and finish pictures are left out for the same reason Guess
       the Maze leaves them out: the entrance is the thumbnail the archive
       lists the maze under, and it is the picture most likely to carry the
       maze's name on a wall. A round that can be won by having scrolled the
       archive is not a round about style.

       HALLWAYS ARE OUT, here as in Guess the Maze and on the server that
       scores this (netlify/functions/daily-scores.js). This game asks which
       of four rooms was built by somebody else, and a corridor has none of
       what that question is about — no palette of its own, nothing
       furnished, no idea being worked out. As the home maze it is a round
       with no answer to find; as the imposter it is the one tile anybody can
       pick without looking at the other three. See Daily.isHallway.

       And only mazes that were in the archive before the day began, so a
       maze catalogued at lunchtime joins tomorrow's rotation rather than
       re-dealing today's under everybody already playing it. The server
       applies the same test before it scores — see existedBefore in
       js/daily.js and netlify/functions/_daily.js. */
    function buildPool(rooms, forDay) {
        return (rooms || [])
            .filter(room => room && room.id && room.name && !window.Daily.isHallway(room))
            .filter(room => window.Daily.existedBefore(room, forDay))
            .map(room => ({
                id: room.id,
                name: room.name,
                by: room.creator || "",
                tags: (room.tags || []).map(t => String(t).toLowerCase()),
                shots: (room.gallery || []).map(g => g && g.image).filter(Boolean)
            }))
            .filter(maze => maze.shots.length >= PER_ROUND - 1)
            // Sorted before the day's shuffle — see Daily.shuffle for why the
            // order going in decides what comes out.
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }

    const shares = (a, b) => a.tags.some(t => t && b.tags.includes(t));

    /* The day's five rounds.

       Each round takes a home maze, three of its pictures, and one picture
       from an imposter — preferring an imposter that shares a tag, and
       taking any other maze when none does. A maze is used as home once at
       most: five rounds of the same builder is one round asked five times.

       Everything is drawn from one seeded shuffle per round rather than
       Math.random, so every player gets the same five and a refresh does not
       reshuffle the day.

       Every seed is taken for the NAMED day (Daily.daySeedFor) rather than
       for whatever the clock says now — see the note on day() above. */
    function pickDay(forDay) {
        const rounds = [];
        const usedHome = new Set();
        const seedOf = (...parts) => window.Daily.daySeedFor(forDay, ...parts);
        const homes = window.Daily.shuffle(pool, seedOf("odd"));

        for (const home of homes) {
            if (rounds.length >= ROUNDS) break;
            if (usedHome.has(home.id)) continue;

            const seed = seedOf("odd", home.id);
            const others = pool.filter(m => m.id !== home.id && m.shots.length);
            const related = others.filter(m => shares(home, m));
            const from = related.length ? related : others;
            const imposter = window.Daily.shuffle(from, seed)[0];
            if (!imposter) continue;

            const mine = window.Daily.shuffle(home.shots, seed).slice(0, PER_ROUND - 1);
            if (mine.length < PER_ROUND - 1) continue;
            const theirs = window.Daily.shuffle(imposter.shots, seed)[0];

            const tiles = window.Daily.shuffle(
                mine.map(image => ({ image, maze: home, odd: false }))
                    .concat([{ image: theirs, maze: imposter, odd: true }]),
                seedOf("odd:tiles", home.id)
            );

            usedHome.add(home.id);
            rounds.push({ home, imposter, tiles });
        }
        return rounds;
    }

    // Keyed on the pinned day, so it changes only when a new day's game is
    // actually begun — never because the clock ticked over mid-round.
    let dealtCache = { day: "", rounds: [] };
    function dealt() {
        const d = day();
        if (poolDay !== d) { pool = buildPool(archive, d); poolDay = d; }
        if (dealtCache.day !== d) dealtCache = { day: d, rounds: pickDay(d) };
        return dealtCache.rounds;
    }

    // ---------- the state of play ----------

    // Today's, always: a blank day is only ever made to start a new one.
    function blankDay() {
        return { day: window.Daily.today(), picks: [], done: false };
    }

    function loadState() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        const now = window.Daily.today();
        state = saved && saved.day === now && Array.isArray(saved.picks) ? saved : blankDay();
    }

    /* Whether the day in memory should give way to today's.

       Yes if it is today's already (nothing to do, but loading again is
       harmless), finished, or never started. NO if it is an earlier day
       part-way through: somebody who was on round three at midnight is
       left to finish the day they started rather than having it swapped
       for a different five mid-sitting. Their result still goes to the
       server under the day it was dealt for; within the five-minute grace
       (dayIsOpen in netlify/functions/_daily.js) it is recorded, and after
       that it is kept on this device only, which is the honest outcome for
       a game begun yesterday. The next open after it ends starts today. */
    function shouldStartToday() {
        if (!state) return true;
        if (state.day === window.Daily.today()) return true;
        return state.done || !state.picks.length;
    }

    function saveState() {
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

    function choose(tileIndex) {
        if (finished()) return;
        const round = dealt()[roundNow()];
        if (!round) return;
        const tile = round.tiles[tileIndex];
        if (!tile) return;

        state.picks.push({ tile: tileIndex, right: Boolean(tile.odd) });
        /* The round's end, for the speed bonus: the server writes down when
           it heard, and the round's time is the gap from the mark before
           (Daily.mark, and netlify/functions/_speed.js). Only here, as the
           pick is made — a finished day shown again marks nothing — and
           right or wrong alike, because the next round is timed from it.
           Before bankDay, so the last one is on its way before the day is
           submitted; Daily.submit waits for it. A day already closed is
           refused by the server, as its submission is. */
        if (window.Daily.mark) window.Daily.mark("odd", day(), state.picks.length - 1);
        if (state.picks.length >= dealt().length) state.done = true;
        saveState();
        if (state.done) bankDay();
        render();
        settleFocus();
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
            /* Reached when the archive could not be read — including when
               js/api.js fell back to its bundled one-maze copy, which open()
               treats as no archive at all. A button rather than "try again
               in a moment", because without one the only way to try again
               was to reload the page. */
            introMessage(`
                <p class="daily-note">The archive is not answering just now, so there is nothing to deal.</p>
                <button type="button" class="guess-btn" id="odd-retry">Try again</button>`);
            const retry = document.getElementById("odd-retry");
            if (retry) retry.addEventListener("click", () => { archive = []; poolDay = ""; dealtCache = { day: "", rounds: [] }; open(true); });
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
        if (!state.picks.length && window.Daily.start) window.Daily.start("odd", day());
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

    function wireSplash() {
        const start = document.getElementById("odd-start");
        if (start) start.addEventListener("click", () => { showSplash = false; render(); settleFocus(); });
    }

    function wireResults() {
        /* The run as it was played: which tile was picked each round, in
           order. The server deals the same five rounds and works out for
           itself which of those were right — see
           netlify/functions/daily-scores.js for why the page never sends a
           score. */
        /* The submit is AWAITED before the board is fetched, and that fetch
           goes past the edge cache (`fresh`). Fired side by side, the board
           request usually won the race — and even when it did not, the
           fifteen-second copy at the edge predated the row — so the one
           person guaranteed to be missing from the board they were shown
           was the player who had just finished. Once per day per visit: a
           reopened results card reads the board as normal. */
        const host = document.getElementById("odd-boards");
        const forDay = day();
        if (postedDay !== forDay) {
            postedDay = forDay;
            if (host) host.innerHTML = `<p class="guess-board-note">Fetching the scores…</p>`;
            window.Daily.submit("odd", forDay, state.picks.map(p => ({ tile: p.tile })))
                .then(() => {
                    const still = document.getElementById("odd-boards");
                    window.Daily.boards(still, "odd", { points: score(), day: forDay, fresh: true });
                });
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
        /* Rooms read on an earlier UTC day are not the archive today is
           dealt from (a maze added yesterday joins today, and the server
           reads the archive as it is now), so a tab left open overnight
           dealt a different five from the server's. Dropped and read again
           when today is about to be dealt; an earlier day still being
           finished keeps the archive it was dealt from. */
        if (archive.length && archiveDay !== window.Daily.today() && shouldStartToday()) archive = [];
        if (!archive.length) {
            settled(() => introMessage(`<p class="daily-note">Dealing…</p>`));
            let rooms = [];
            /* Api is a top-level const in js/api.js — a global binding, but
               not a property of window. Called bare, as the other games call
               it.

               A retry has to get past Api's own memo first: getRooms keeps
               the promise for the life of the page, fallback and all, so
               asking again would hand back the same one-maze copy that
               failed the first time. Forgetting that one entry is the only
               way to make the request again without reloading. */
            if (retrying && typeof Api !== "undefined" && Api._inflight) delete Api._inflight.rooms;
            try {
                rooms = await (Api.roomsForToday ? Api.roomsForToday() : Api.getRooms());
                archiveDay = Api.roomsDay || window.Daily.today();
            } catch (e) { rooms = []; }
            /* The bundled fallback is not an archive to deal from. When the
               live rooms cannot be reached js/api.js quietly hands back the
               ONE maze in js/rooms-data.js and marks "room data" degraded;
               a day dealt from that is not the day everybody else is
               playing, and the server — which reads the real archive —
               would score it against different rounds entirely. Treated as
               no archive, which render() turns into a message and a retry. */
            const degraded = typeof Api !== "undefined" && Api._degraded && Api._degraded.has("room data");
            archive = degraded ? [] : (rooms || []);
            poolDay = "";
            dealtCache = { day: "", rounds: [] };
        }
        /* A day given back by an administrator lands here: the ticket is
           claimed before the stored day is read, so what loads is the fresh
           day rather than the one being cleared. The in-memory copy goes
           too, or the check below would keep playing the day just taken
           away, and so does the note that it was already sent — the replay
           has to be submitted like any other. */
        if (await window.Daily.claimReset("odd")) {
            try { localStorage.removeItem(STATE_KEY); } catch (e) { /* private mode */ }
            state = null;
            postedDay = "";
        }
        /* A day already in memory is kept only if it is an earlier day left
           part-way through — see shouldStartToday. Otherwise the stored day
           is read, which is today's or a blank one. This is also what moves
           a tab left open overnight on to the new day. */
        if (shouldStartToday()) loadState();
        loadStats();
        showSplash = state.picks.length === 0 && !state.done;
        /* Straight onto the right sheet — the splash, the round in hand, or
           the results — with the rest already stacked around it. Only the
           moves made while the window is open slide. */
        settled(render);
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

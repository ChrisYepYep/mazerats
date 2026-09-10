/* Ratrospect — the archive in the order it happened.

   One card is dealt face up with its date showing. Five more come one at a
   time, and each is dragged into the line: before everything, after
   everything, or into any gap between. Right, and it locks in with its date
   revealed. Wrong, and it is gone and so is one of three lives.

   Nothing here is authored. Thirty-nine mazes carry the month or the day
   they were added and nineteen events carry the hour they opened; the game
   is choosing six of them that can be told apart, and asking.

   ----------------------------------------------------------------------
   One card per month, and no exceptions

   Two cards from the same month is not a puzzle. Some maze dates are a
   month with no day in them at all ("2024-06"), so "June 2024" against "14
   June 2024" has no right answer — the first may genuinely be the later of
   the two. Even where both dates are exact, a day apart is a coin toss
   dressed as a question.

   So no two cards in a day's six come from the same calendar month. It is
   the strictest rule that is still easy to explain, which is what a rule in
   a game should be: every card you see is a different month, and that is
   the whole of it.

   ----------------------------------------------------------------------
   Why it is dragged

   Placing one card at a time makes every card a decision with an answer
   attached, and dragging is how that decision is made: the line opens a gap
   under the card as it passes, so where it would land is shown rather than
   described. The gaps are also buttons, because a drag is no use to
   somebody on a keyboard and awkward on a phone — the same choice, reachable
   two ways. */
(function () {
    "use strict";

    const CARDS = 5;               // to place, on top of the free one
    const LIVES = 3;
    const POINTS_EACH = 100;       // a perfect day is 500, as next door
    const STATE_KEY = "mazerats_ratrospect_v1";
    const STATS_KEY = "mazerats_ratrospect_stats_v2";

    const day = () => window.Daily.today();

    let pool = [];
    let state = null;
    let stats = null;
    let el = {};
    let showSplash = true;
    // One submission a day, and one per window opening at most: the results
    // card redraws on every range switch of the board it contains.
    let posted = false;

    // ---------- the pool ----------

    /* A picture for the card, whatever shape the record keeps one in.

       This was `thumb || entrance`, and it put a broken image on the board:
       a maze with no thumbnail falls through to `entrance`, which is an
       OBJECT — {image, label, …} — not a string, so the card asked the
       browser for a picture called "[object Object]". The archive's own
       entrance shots are stored that way and always have been; the game was
       the thing making an assumption about them.

       Every shape the archive uses, in the order a card would want them:
       the thumbnail, then the entrance, then the first thing in the
       gallery — and nothing at all rather than a guess. */
    function pictureOf(record) {
        const pick = value => {
            if (typeof value === "string") return value.trim();
            if (value && typeof value === "object" && typeof value.image === "string") return value.image.trim();
            return "";
        };
        const gallery = Array.isArray(record.gallery) ? record.gallery : [];
        return pick(record.thumb) || pick(record.entrance) || pick(gallery[0]) || "";
    }

    function buildPool(rooms, events) {
        const out = [];
        (rooms || []).forEach(room => {
            if (!room || !room.name || !room.added) return;
            const when = readDate(room.added);
            if (!when) return;
            out.push({
                id: "maze:" + room.id,
                kind: "maze",
                title: room.name,
                by: room.creator || "",
                thumb: pictureOf(room),
                at: when.at,
                month: when.month,
                precision: when.precision
            });
        });
        (events || []).forEach(ev => {
            if (!ev || !ev.title || !ev.date) return;
            const when = readDate(ev.date);
            if (!when) return;
            out.push({
                id: "event:" + ev.id,
                kind: "event",
                title: ev.title,
                by: ev.host || "",
                thumb: pictureOf(ev),
                at: when.at,
                month: when.month,
                precision: when.precision
            });
        });
        // Sorted before the day's shuffle ever runs — see Daily.shuffle for
        // why the order going in decides what comes out.
        return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }

    function readDate(value) {
        const text = String(value).trim();
        const monthOnly = /^\d{4}-\d{2}$/.test(text);
        const at = Date.parse(monthOnly ? text + "-01T12:00:00Z"
            : /^\d{4}-\d{2}-\d{2}$/.test(text) ? text + "T12:00:00Z" : text);
        if (isNaN(at)) return null;
        return {
            at,
            month: new Date(at).toISOString().slice(0, 7),
            precision: monthOnly ? "month" : "day"
        };
    }

    /* The day's six, one to a month. Greedy against the shuffled pool: take
       the first card, then keep taking the next whose month nobody has yet.
       Fifty-odd records spread across two years fill this easily. */
    function pickDay() {
        const shuffled = window.Daily.shuffle(pool, window.Daily.seedFrom("ratrospect:" + day()));
        const chosen = [];
        const months = new Set();
        for (const card of shuffled) {
            if (chosen.length >= CARDS + 1) break;
            if (months.has(card.month)) continue;
            months.add(card.month);
            chosen.push(card);
        }
        return chosen;
    }

    let dealtCache = { day: "", cards: [] };
    function dealt() {
        if (dealtCache.day !== day()) dealtCache = { day: day(), cards: pickDay() };
        return dealtCache.cards;
    }

    // ---------- the state of play ----------

    function blankDay() {
        return { day: day(), results: [], lives: LIVES, done: false };
    }

    function loadState() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        state = saved && saved.day === day() && Array.isArray(saved.results) ? saved : blankDay();
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
       bad day. */
    function bankDay() {
        if (stats.lastDay === day()) return;
        stats.streak = stats.lastDay === window.Daily.dayBefore(day()) ? stats.streak + 1 : 1;
        stats.days += 1;
        stats.bestDay = Math.max(stats.bestDay || 0, score());
        stats.points = (stats.points || 0) + score();
        stats.lastDay = day();
        saveStats();
    }

    const score = () => state.results.filter(r => r.right).length * POINTS_EACH;

    // The line as it stands: the free card plus everything placed correctly.
    function line() {
        const cards = dealt();
        if (!cards.length) return [];
        return [cards[0]]
            .concat(state.results.filter(r => r.right).map(r => cards[r.index]))
            .sort((a, b) => a.at - b.at);
    }

    const nextIndex = () => state.results.length + 1;

    function current() {
        const cards = dealt();
        const i = nextIndex();
        return i < cards.length ? cards[i] : null;
    }

    const finished = () => state.done || state.lives <= 0
        || state.results.length >= CARDS || !current();

    /* Where a card belongs: how many cards already down are older than it.

       A gap is named the same way — "after this many cards", 0 being before
       everything — so being right is simply the two numbers matching. The
       first version asked instead whether the date fell between the
       neighbours either side, which is the same question in more words and
       could not say where a wrong card SHOULD have gone. This can, and the
       reveal is built on it. */
    const gapFor = (card, down) => down.filter(c => c.at < card.at).length;

    /* What just happened, held until the player has seen it.

       The game used to place a card and move straight on: a wrong one
       vanished, a life went out, and nothing on screen said which card it
       was, when it was actually from, or where it belonged. That is the
       whole of what felt broken about it — every wrong answer taught you
       nothing, so the game was five coin tosses with a scoreboard. */
    let reveal = null;

    function placeAt(gap) {
        if (finished() || reveal) return;
        const card = current();
        if (!card) return;
        const down = line();
        const correctGap = gapFor(card, down);
        const right = gap === correctGap;

        state.results.push({ index: nextIndex(), gap, right });
        if (!right) state.lives -= 1;
        saveState();
        reveal = { card, gap, correctGap, right, down };
        render();
    }

    /* Done looking. The day only ends here rather than at the moment of
       placing, so the last card of a run — and the one that takes the last
       life — is shown before the results replace the board. */
    function nextCard() {
        reveal = null;
        if (state.lives <= 0 || state.results.length >= CARDS) {
            state.done = true;
            saveState();
            bankDay();
        }
        render();
    }

    // ---------- writing a date out ----------

    const MONTHS = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];

    function whenText(card) {
        const d = new Date(card.at);
        const month = MONTHS[d.getUTCMonth()];
        return card.precision === "month"
            ? `${month} ${d.getUTCFullYear()}`
            : `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
    }

    // ---------- drawing it ----------

    /* The day, written out. Guess the Maze puts it under its title and it
       is worth having: a daily game should say which day it is dealing,
       especially one somebody has come back to after a while. */
    function longDate() {
        const d = new Date(day() + "T12:00:00Z");
        return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    /* draggable="false" is not decoration, it is the whole reason the card
       can be dragged at all.

       An <img> is natively draggable in every browser, so pressing on the
       picture and moving started the BROWSER's own image drag: it swallowed
       the pointer events this game listens for, showed a ghost of the
       photograph, and dropped nothing anywhere. The card looked stuck to the
       spot. It never showed up in testing because a synthetic drag does not
       start native drag-and-drop — only a real mouse does. */
    function thumbHtml(card) {
        return card.thumb
            ? `<img class="ratro-thumb" src="${escapeHtml(card.thumb)}" alt="" loading="lazy" draggable="false">`
            : `<span class="ratro-thumb ratro-thumb--blank" aria-hidden="true"></span>`;
    }

    function render() {
        if (!el.body) return;
        const cards = dealt();
        if (!cards.length) {
            el.body.innerHTML = `<p class="daily-note">The archive is not answering just now — try again in a moment.</p>`;
            return;
        }
        if (finished() && !reveal) {
            /* Banked here as well as in nextCard, because a day can arrive
               at its end without passing through that button: close the
               window on the last reveal, or reload the page, and the
               results are what loads. Banking twice is not possible —
               bankDay returns the moment it sees today already counted. */
            if (!state.done) { state.done = true; saveState(); }
            bankDay();
            el.body.innerHTML = resultsHtml();
            return wireResults();
        }
        if (showSplash) { el.body.innerHTML = splashHtml(); return wireSplash(); }
        if (reveal) { el.body.innerHTML = revealHtml(); return wireReveal(); }
        el.body.innerHTML = boardHtml();
        wireBoard();
    }

    /* The splash, and it earns its place: this game's rule is not guessable
       from looking at it. "Put them in order" is obvious; "one card at a
       time, three lives, and every card is a different month" is not, and a
       player who works that out by losing a life has been taught by being
       punished. */
    function splashHtml() {
        const started = state.results.length > 0;
        return `
            <div class="guess-splash">
                <p class="guess-splash-eyebrow">Every day, six from the archive</p>
                <h3 class="guess-splash-title"><span>RATRO</span><span>SPECT</span></h3>
                <p class="guess-splash-date">${escapeHtml(longDate())}</p>

                <ol class="guess-rules">
                    <li><span class="guess-rules-n" aria-hidden="true">1</span>
                        <p>One card is already down with its date showing. Drag each new one <strong>where it happened</strong> — before the line, after it, or into any gap.</p></li>
                    <li><span class="guess-rules-n" aria-hidden="true">2</span>
                        <p>Right, and it stays with its date shown. Wrong, and it goes — and so does one of your <strong>three lives</strong>.</p></li>
                    <li><span class="guess-rules-n" aria-hidden="true">3</span>
                        <p>No two cards ever come from the <strong>same month</strong>. Everyone gets the same six, new at midnight, UTC.</p></li>
                </ol>

                <button type="button" class="guess-btn guess-btn--lead" id="ratro-start">
                    ${started ? "Back to the line" : "Deal the first card"} &rsaquo;
                </button>
                <p class="guess-splash-foot">${stats.streak > 1 ? escapeHtml(stats.streak + " day streak.") : ""}</p>
            </div>`;
    }

    /* The bar across the top: which card this is, what is left to lose, and
       what has been won.

       The three lives used to be three unlabelled dots between the other
       two, and nothing on the board said what they were. A pip only reads as
       a life once you have lost one and watched it go out — which means the
       one thing on the board with a consequence attached explained itself
       by punishing you, and only after it was too late to matter.

       So the word is simply there. It costs four characters of the same
       microtype the two numbers either side of it already use, and it turns
       an ornament into a count of the thing you can run out of. */
    function headHtml() {
        const lives = Array.from({ length: LIVES }, (_, i) =>
            `<span class="daily-life${i < state.lives ? "" : " is-spent"}" aria-hidden="true"></span>`).join("");
        const placed = state.results.length + (reveal ? 0 : 1);
        return `
            <div class="daily-head">
                <p class="daily-step">Card <strong>${Math.min(placed, CARDS)}</strong> of ${CARDS}</p>
                <p class="daily-lives" aria-label="${state.lives} of ${LIVES} lives left">
                    <span class="daily-lives-label" aria-hidden="true">Lives</span>
                    <span class="daily-lives-pips" aria-hidden="true">${lives}</span>
                </p>
                <p class="daily-points">${score()}<span> pts</span></p>
            </div>`;
    }

    function downCardHtml(card, extra) {
        return `
            <article class="ratro-card is-down${extra ? " " + extra : ""}">
                ${thumbHtml(card)}
                <p class="ratro-card-title">${escapeHtml(card.title)}</p>
                <p class="ratro-card-when">${escapeHtml(whenText(card))}</p>
            </article>`;
    }

    /* The line, built as cards and gaps alternating.

       `withCard` drops one extra card into a chosen gap, which is what the
       reveal uses to show the placement exactly where the player put it
       rather than describing it in a sentence underneath. */
    function lineHtml(down, opts) {
        const o = opts || {};
        const pieces = [];
        for (let i = 0; i <= down.length; i++) {
            if (o.withCard && o.at === i) {
                pieces.push(downCardHtml(o.withCard, o.right ? "is-right" : "is-wrong"));
            } else if (o.belongedAt === i) {
                // Where it should have gone: an empty slot in the line, so
                // the answer is a place rather than a sentence about a place.
                pieces.push(`<span class="ratro-slot-ghost" aria-hidden="true">belonged here</span>`);
            }
            if (o.gaps) {
                const after = i === 0 ? null : down[i - 1];
                const before = i >= down.length ? null : down[i];
                const label = !after ? `Before ${before.title}`
                    : !before ? `After ${after.title}`
                        : `Between ${after.title} and ${before.title}`;
                pieces.push(`<button type="button" class="ratro-gap" data-gap="${i}" aria-label="${escapeHtml(label)}"></button>`);
            }
            if (i < down.length) pieces.push(downCardHtml(down[i]));
        }
        /* The rail is drawn, not implied. Cards standing in a row with
           nothing under them are a row of cards; a line with ends marked
           OLDER and NEWER, and slots sitting on it, is a timeline you can
           see where to drop something into. */
        return `
            <div class="ratro-timeline">
                <span class="ratro-end" aria-hidden="true">Older</span>
                <div class="ratro-line" id="ratro-line" role="group" aria-label="The timeline so far">${pieces.join("")}</div>
                <span class="ratro-end" aria-hidden="true">Newer</span>
            </div>`;
    }

    function boardHtml() {
        const down = line();
        const card = current();
        return `
            ${headHtml()}
            <div class="ratro-hand-wrap">
                <article class="ratro-card is-hand" id="ratro-hand" tabindex="0"
                    aria-label="${escapeHtml(card.title)} — drag into the line, or press a gap below">
                    ${thumbHtml(card)}
                    <p class="ratro-card-kind">${card.kind === "event" ? "Event" : "Maze"}</p>
                    <p class="ratro-card-title">${escapeHtml(card.title)}</p>
                    ${card.by ? `<p class="ratro-card-by">${escapeHtml(card.by)}</p>` : ""}
                </article>
                <!-- Which way round the line runs is not said here any more.
                     It used to read "oldest on the left", which stopped
                     being true on a phone the moment the line stood up —
                     and the rail says it better than a sentence can anyway,
                     with OLDER and NEWER written on its two ends, whichever
                     two ends those are. What is left is the part the rail
                     cannot say: that there are two ways to play a card. -->
                <p class="daily-ask">Drag it onto the line below, or tap a slot.</p>
            </div>
            ${lineHtml(down, { gaps: true })}`;
    }

    /* What just happened, shown rather than described.

       The card sits in the line where it was put, wearing its real date and
       marked right or wrong. A wrong one leaves an empty slot where it
       should have gone, so the correction is a place on the line rather
       than a sentence to be decoded — and then it is taken away again,
       because a wrong card does not stay. */
    function revealHtml() {
        const r = reveal;
        const last = state.results.length >= CARDS || state.lives <= 0;
        return `
            ${headHtml()}
            <div class="ratro-verdict${r.right ? " is-right" : " is-wrong"}">
                <p class="ratro-verdict-line">
                    ${r.right ? "Right where it goes." : "Not there."}
                    <strong>${escapeHtml(r.card.title)}</strong> — ${escapeHtml(whenText(r.card))}
                </p>
                <button type="button" class="guess-btn guess-btn--lead" id="ratro-next">
                    ${last ? "See the day" : "Next card"} &rsaquo;
                </button>
            </div>
            ${lineHtml(r.down, {
                withCard: r.card,
                at: r.gap,
                right: r.right,
                belongedAt: r.right ? -1 : r.correctGap
            })}`;
    }

    /* Something a person might actually say, rather than a status line.

       "That is the day" stood here, and it reads like a clock running out.
       What somebody wants at the end of a run is to be told how it went, in
       the tone of a friend watching over their shoulder: short, and about
       the run rather than about the game. */
    function verdictFor(right, ranOut) {
        if (right === CARDS) return "Every one. Faultless.";
        if (ranOut) return right ? `Lives gone — you had ${right} of them, though.` : "Lives gone, and nothing to show for it.";
        if (right === CARDS - 1) return "One got past you.";
        if (right === 0) return "Not your day. It happens.";
        return `${right} of ${CARDS} — the archive keeps its secrets.`;
    }

    /* The results, in the same shape as the game next door: the number, what
       it was out of, the grid, the run of days, and then the detail. Two
       daily games that dress their scores differently look like two
       different sites. */
    function resultsHtml() {
        const right = state.results.filter(r => r.right).length;
        const ranOut = state.lives <= 0 && state.results.length < CARDS;

        return `
            <div class="guess-summary daily-summary">
                <p class="guess-score daily-verdict">${verdictFor(right, ranOut)}</p>
                <p class="guess-points"><strong>${score()}</strong><span>points</span></p>
                <p class="guess-next-up">${right} of ${CARDS} placed${ranOut ? " · out of lives" : ""}</p>
                <p class="guess-grid" aria-label="Result grid">${shareGrid()}</p>
                <dl class="guess-stats">
                    <div><dt>Streak</dt><dd>${stats.streak}</dd></div>
                    <div><dt>Best day</dt><dd>${stats.bestDay}</dd></div>
                    <div><dt>Days played</dt><dd>${stats.days}</dd></div>
                    <div><dt>All-time</dt><dd>${stats.points}</dd></div>
                </dl>
                <div class="guess-summary-actions">
                    <button type="button" class="guess-btn" id="ratro-share">Copy result</button>
                </div>
                <p class="daily-note" id="ratro-foot">A new six every day.</p>

                <div class="guess-boards" id="ratro-boards"></div>
            </div>`;
        /* The six cards and their real dates used to be listed here, in
           order. They are gone for the reason the same list is gone from
           Guess the Maze: this card is what somebody pastes into a channel
           where nobody else has played yet, and the grid above is safe to
           paste precisely because it names nothing. Every card is already
           revealed as it is placed, on the line where it was placed. */
    }

    const shareGrid = () => state.results.map(r => (r.right ? "🟩" : "🟥")).join("")
        + "⬜".repeat(Math.max(0, CARDS - state.results.length));

    const shareText = () =>
        `Ratrospect ${day()} — ${score()}/${CARDS * POINTS_EACH}\n${shareGrid()}\n${location.origin}/ratrospect`;

    // ---------- wiring ----------

    function wireSplash() {
        const start = document.getElementById("ratro-start");
        if (start) start.addEventListener("click", () => { showSplash = false; render(); });
    }

    function wireResults() {
        /* The run as it was played: which gap each card went into, in
           order. The server deals the same six and works out for itself
           which of those were right — see netlify/functions/daily-scores.js
           for why the page never sends a score. */
        if (!posted) {
            posted = true;
            window.Daily.submit("ratrospect", day(), state.results.map(r => ({ gap: r.gap })));
        }
        window.Daily.boards(document.getElementById("ratro-boards"), "ratrospect", { points: score() });

        const share = document.getElementById("ratro-share");
        if (!share) return;
        share.addEventListener("click", async () => {
            const foot = document.getElementById("ratro-foot");
            try {
                await navigator.clipboard.writeText(shareText());
                if (foot) foot.textContent = "Copied — paste it wherever you like.";
            } catch (e) {
                if (foot) foot.textContent = "Could not copy it — your browser said no.";
            }
        });
    }

    function wireReveal() {
        const next = document.getElementById("ratro-next");
        if (next) next.addEventListener("click", nextCard);
    }

    function wireBoard() {
        const lineEl = document.getElementById("ratro-line");
        const hand = document.getElementById("ratro-hand");
        if (!lineEl || !hand) return;

        lineEl.querySelectorAll(".ratro-gap").forEach(gap => {
            gap.addEventListener("click", () => placeAt(Number(gap.dataset.gap)));
        });

        /* ---------- the drag ----------

           Pointer events rather than the HTML drag-and-drop API, which has
           no touch support worth the name and cannot be styled while it is
           happening. The card follows the pointer as a fixed-position ghost;
           the gap nearest the pointer opens; letting go over the line places
           it, and letting go anywhere else puts the card back.

           A press that never moves is not a drag — it leaves the card where
           it was, so tapping the card does nothing surprising. */
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let ghost = null;
        let openGap = null;

        const gaps = () => [...lineEl.querySelectorAll(".ratro-gap")];

        /* ---------- which way time runs on this screen ----------

           The line is a row on a desktop and a column on a phone, because a
           row of six cards on a phone is a 190px window you scroll sideways
           through while trying to drag something into it. That is a layout
           decision and it is made in the stylesheet, where layout decisions
           belong — so this asks the element what it actually is rather than
           re-deriving it from a width the CSS might disagree about.

           One breakpoint, in one file. Everything below reads `down` and
           works either way. */
        const isDown = () => getComputedStyle(lineEl).flexDirection.startsWith("column");

        /* Which slot the pointer is over: how many cards it has already
           passed, measured along whichever axis the line runs. */
        function nearestGap(x, y) {
            const down = isDown();
            const cards = [...lineEl.querySelectorAll(".ratro-card.is-down")];
            let index = 0;
            for (const card of cards) {
                const box = card.getBoundingClientRect();
                const past = down
                    ? y > box.top + box.height / 2
                    : x > box.left + box.width / 2;
                if (past) index++;
            }
            return index;
        }

        /* Whether the pointer is near enough to the line to be aiming at it.
           The slack goes on the axis ACROSS the line — a card carried a
           little above or below a row is still being carried at that row —
           so which axis that is swaps with the layout. */
        function overLine(x, y) {
            const box = lineEl.getBoundingClientRect();
            return isDown()
                ? x > box.left - 60 && x < box.right + 60
                : y > box.top - 60 && y < box.bottom + 60;
        }

        function openAt(index) {
            if (openGap === index) return;
            openGap = index;
            gaps().forEach(g => g.classList.toggle("is-open", Number(g.dataset.gap) === index));
        }

        function closeGaps() {
            openGap = null;
            gaps().forEach(g => g.classList.remove("is-open"));
        }

        /* Native drag-and-drop is refused outright. Belt and braces with
           draggable="false" on the picture: anything else inside the card
           that a browser decides is draggable — a selection of the title,
           for instance — would take the gesture away in the same way. */
        hand.addEventListener("dragstart", e => e.preventDefault());

        hand.addEventListener("pointerdown", e => {
            if (e.button != null && e.button !== 0) return;
            // Stops the press turning into a text selection or an image
            // drag before the first move has even been seen.
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            try {
                hand.setPointerCapture(e.pointerId);
            } catch (err) {
                /* A pointer that is no longer active cannot be captured.
                   Nothing to do about it, and it must not throw out of the
                   handler — the drag simply does not start. */
            }
        });

        hand.addEventListener("pointermove", e => {
            if (!hand.hasPointerCapture || !hand.hasPointerCapture(e.pointerId)) return;
            if (!dragging) {
                if (Math.abs(e.clientX - startX) < 6 && Math.abs(e.clientY - startY) < 6) return;
                dragging = true;
                const box = hand.getBoundingClientRect();
                ghost = hand.cloneNode(true);
                ghost.classList.add("is-ghost");
                ghost.style.width = box.width + "px";
                document.body.appendChild(ghost);
                hand.classList.add("is-lifted");
            }
            e.preventDefault();
            ghost.style.left = e.clientX + "px";
            ghost.style.top = e.clientY + "px";

            if (overLine(e.clientX, e.clientY)) openAt(nearestGap(e.clientX, e.clientY));
            else closeGaps();
        });

        function endDrag(e) {
            if (hand.hasPointerCapture && hand.hasPointerCapture(e.pointerId)) {
                hand.releasePointerCapture(e.pointerId);
            }
            if (!dragging) return;
            dragging = false;
            if (ghost) { ghost.remove(); ghost = null; }
            hand.classList.remove("is-lifted");
            const drop = openGap;
            closeGaps();
            if (drop != null) placeAt(drop);
        }

        hand.addEventListener("pointerup", endDrag);
        hand.addEventListener("pointercancel", endDrag);

        // The keyboard path: the card itself does nothing, and the gaps are
        // ordinary buttons in the tab order.
        hand.addEventListener("keydown", e => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            const first = lineEl.querySelector(".ratro-gap");
            if (first) first.focus();
        });
    }

    // ---------- the window ----------

    async function open() {
        if (!el.overlay) return;
        el.overlay.classList.add("open");
        document.body.classList.add("modal-open");
        el.window.focus();
        if (!pool.length) {
            el.body.innerHTML = `<p class="daily-note">Dealing…</p>`;
            let rooms = [];
            let events = [];
            // Api is a top-level const in js/api.js: a global binding, but not
            // a property of window.
            try { rooms = await Api.getRooms(); } catch (e) { rooms = []; }
            try { events = await Api.getEvents(); } catch (e) { events = []; }
            pool = buildPool(rooms, events);
        }
        /* A day given back by an administrator lands here: the ticket is
           claimed before the stored day is read, so what loads is the fresh
           day rather than the one being cleared. */
        if (await window.Daily.claimReset("ratrospect")) {
            try { localStorage.removeItem(STATE_KEY); } catch (e) { /* private mode */ }
        }
        loadState();
        loadStats();
        /* The rules on the way in, but only for a day nobody has started.
           Shown on every open they became a door to push through before
           every card; the header keeps a way back to them for anyone who
           wants a reminder. */
        showSplash = state.results.length === 0 && !state.done;
        reveal = null;
        posted = false;
        render();
    }

    function close() {
        if (!el.overlay) return;
        el.overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
    }

    function mount() {
        el = {
            overlay: document.getElementById("ratro-overlay"),
            window: document.getElementById("ratro-window"),
            close: document.getElementById("ratro-close"),
            body: document.getElementById("ratro-body")
        };
        if (!el.overlay || !el.body) return;

        el.close.addEventListener("click", close);
        el.overlay.addEventListener("click", e => { if (e.target === el.overlay) close(); });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && el.overlay.classList.contains("open")) close();
        });

        if (location.pathname === "/ratrospect") open();
    }

    window.RatrospectStatus = function () {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        if (!saved || saved.day !== window.Daily.today() || !Array.isArray(saved.results)) {
            return { started: false, done: 0, total: CARDS, finished: false, points: 0 };
        }
        return {
            started: saved.results.length > 0,
            done: saved.results.length,
            total: CARDS,
            finished: Boolean(saved.done),
            points: saved.results.filter(r => r && r.right).length * POINTS_EACH
        };
    };

    window.openRatrospect = function () { open(); };

    document.addEventListener("DOMContentLoaded", mount);
})();

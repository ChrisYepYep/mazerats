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

    // ---------- the pool ----------

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
                thumb: room.thumb || room.entrance || "",
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
                thumb: ev.thumb || ev.entrance || "",
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

    /* A gap is "after this many cards": 0 is before everything, line.length
       is after everything. Right or wrong is then whether the card's own
       date falls inside that gap — the same question the player was asked,
       rather than a second rule that could disagree with it. */
    function placeAt(gap) {
        if (finished()) return;
        const card = current();
        if (!card) return;
        const down = line();
        const after = gap === 0 ? null : down[gap - 1];
        const before = gap >= down.length ? null : down[gap];
        const right = (!after || card.at > after.at) && (!before || card.at < before.at);

        state.results.push({ index: nextIndex(), gap, right });
        if (!right) state.lives -= 1;
        if (state.lives <= 0 || state.results.length >= CARDS) state.done = true;
        saveState();
        if (state.done) bankDay();
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

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function thumbHtml(card) {
        return card.thumb
            ? `<img class="ratro-thumb" src="${escapeHtml(card.thumb)}" alt="" loading="lazy">`
            : `<span class="ratro-thumb ratro-thumb--blank" aria-hidden="true"></span>`;
    }

    function render() {
        if (!el.body) return;
        const cards = dealt();
        if (!cards.length) {
            el.body.innerHTML = `<p class="daily-note">The archive is not answering just now — try again in a moment.</p>`;
            return;
        }
        if (finished()) { el.body.innerHTML = resultsHtml(); return wireResults(); }
        if (showSplash) { el.body.innerHTML = splashHtml(); return wireSplash(); }
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
            <div class="daily-splash">
                <p class="daily-splash-eyebrow">Every day, six from the archive</p>
                <h3 class="daily-splash-title">RATROSPECT</h3>
                <p class="daily-splash-blurb">The first card is already on the table with its date showing.
                    Five more follow, one at a time — drag each one into the line where you think it belongs.</p>
                <ol class="daily-rules">
                    <li><span class="daily-rules-n" aria-hidden="true">1</span>
                        <p>Put each card <strong>where it happened</strong> — before the line, after it, or in any gap between.</p></li>
                    <li><span class="daily-rules-n" aria-hidden="true">2</span>
                        <p>Right, and it stays with its date shown. Wrong, and it goes — and so does one of your <strong>three lives</strong>.</p></li>
                    <li><span class="daily-rules-n" aria-hidden="true">3</span>
                        <p>No two cards ever come from the <strong>same month</strong>, so there is always a right answer.</p></li>
                </ol>
                <button type="button" class="guess-btn guess-btn--lead" id="ratro-start">
                    ${started ? "Back to the line" : "Deal the first card"} &rsaquo;
                </button>
                ${stats.streak > 1 ? `<p class="daily-note">${stats.streak} day streak.</p>` : ""}
            </div>`;
    }

    function boardHtml() {
        const down = line();
        const card = current();

        const lives = Array.from({ length: LIVES }, (_, i) =>
            `<span class="daily-life${i < state.lives ? "" : " is-spent"}" aria-hidden="true"></span>`).join("");

        /* Cards and gaps alternate, and the gaps are buttons. During a drag
           the one nearest the pointer opens into a slot the card can fall
           into; without a drag they are still the way in, which is what
           makes this playable with a keyboard. */
        const pieces = [];
        for (let i = 0; i <= down.length; i++) {
            const after = i === 0 ? null : down[i - 1];
            const before = i >= down.length ? null : down[i];
            const label = !after ? `Before ${before.title}`
                : !before ? `After ${after.title}`
                    : `Between ${after.title} and ${before.title}`;
            pieces.push(`<button type="button" class="ratro-gap" data-gap="${i}" aria-label="${escapeHtml(label)}"></button>`);
            if (before) {
                pieces.push(`
                    <article class="ratro-card is-down">
                        ${thumbHtml(before)}
                        <p class="ratro-card-title">${escapeHtml(before.title)}</p>
                        <p class="ratro-card-when">${escapeHtml(whenText(before))}</p>
                    </article>`);
            }
        }

        return `
            <div class="daily-head">
                <p class="daily-step">Card <strong>${state.results.length + 1}</strong> of ${CARDS}</p>
                <span class="daily-lives" aria-label="${state.lives} of ${LIVES} lives left">${lives}</span>
                <p class="daily-points">${score()}<span> pts</span></p>
            </div>

            <div class="ratro-hand-wrap">
                <article class="ratro-card is-hand" id="ratro-hand" tabindex="0"
                    aria-label="${escapeHtml(card.title)} — drag into the line, or press a gap below">
                    ${thumbHtml(card)}
                    <p class="ratro-card-kind">${card.kind === "event" ? "Event" : "Maze"}</p>
                    <p class="ratro-card-title">${escapeHtml(card.title)}</p>
                    ${card.by ? `<p class="ratro-card-by">${escapeHtml(card.by)}</p>` : ""}
                </article>
                <p class="daily-ask">Drag it into the line below — oldest on the left.</p>
            </div>

            <div class="ratro-line" id="ratro-line" role="group" aria-label="The line so far">${pieces.join("")}</div>`;
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
        const cards = dealt();
        const right = state.results.filter(r => r.right).length;
        const ranOut = state.lives <= 0 && state.results.length < CARDS;
        const rows = state.results.map((r, i) => {
            const card = cards[r.index];
            return `<li class="${r.right ? "is-won" : "is-lost"}">
                    <span class="guess-answers-n" aria-hidden="true">${i + 1}</span>
                    <span class="daily-answers-name">${escapeHtml(card.title)}</span>
                    <span class="guess-answers-mark">${escapeHtml(whenText(card))}</span>
                    <span class="guess-answers-mark daily-answers-points">${r.right ? "+" + POINTS_EACH : "—"}</span>
                </li>`;
        }).join("");

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

                <h4 class="guess-answers-head">Today's order</h4>
                <ul class="guess-answers">${rows}</ul>
            </div>`;
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

        function nearestGap(x) {
            const cards = [...lineEl.querySelectorAll(".ratro-card.is-down")];
            let index = 0;
            for (const card of cards) {
                const box = card.getBoundingClientRect();
                if (x > box.left + box.width / 2) index++;
            }
            return index;
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

        hand.addEventListener("pointerdown", e => {
            if (e.button != null && e.button !== 0) return;
            startX = e.clientX;
            startY = e.clientY;
            hand.setPointerCapture(e.pointerId);
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

            const box = lineEl.getBoundingClientRect();
            const over = e.clientY > box.top - 60 && e.clientY < box.bottom + 60;
            if (over) openAt(nearestGap(e.clientX));
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
        loadState();
        loadStats();
        // The rules are shown every time the window opens, including part-way
        // through a day — which is also what makes it the natural home for
        // the streak.
        showSplash = true;
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

/* Ratrospect — five things from the archive, and the order they happened in.

   You are dealt one card face up with its date showing. Then five more come
   one at a time, and for each you say where it goes: before everything,
   after everything, or between two cards already down. Right, and it locks
   into the line with its date revealed. Wrong, and it is gone and so is one
   of your three lives.

   The archive is the whole of it — thirty-nine mazes with the month or day
   they were added, and nineteen events with the hour they opened. Nothing
   is authored for this; the game is choosing six of them that can be told
   apart, and asking.

   ----------------------------------------------------------------------
   Why placing beats ordering

   The obvious version is "here are five, drag them into order", and it is a
   worse game: one long fiddle, then a single verdict at the end, and no way
   to be partly right that feels like anything. Placing them one at a time
   makes every card a decision with an answer attached, the line you are
   building is the score, and the tension is real — a card placed against a
   line of one is a coin toss, and the same card against a line of five is a
   question you can actually reason about.

   ----------------------------------------------------------------------
   The dates have to be fair

   Some maze dates are a month rather than a day ("2024-06"), and events
   carry a time of day. A puzzle that asks you to separate two things eight
   hours apart, or a month-only date from a day inside that same month, is
   not a puzzle — it is a coin toss you are told off for losing.

   So the six cards are chosen with a minimum gap between every pair of
   them, and month-only cards must not share a month with anything else in
   the set. Ten days, which is far enough apart that the archive's own
   record can settle it, and near enough that six of them still fit in the
   part of the year the site covers. */
(function () {
    "use strict";

    const CARDS = 5;               // cards to place, on top of the free one
    const LIVES = 3;
    const POINTS_EACH = 100;       // so a perfect day is 500, as it is next door
    const MIN_GAP_DAYS = 10;
    const STATE_KEY = "mazerats_ratrospect_v1";
    const STATS_KEY = "mazerats_ratrospect_stats_v1";

    const day = () => window.Daily.today();

    let pool = [];
    let state = null;
    let stats = null;
    let el = {};

    // ---------- the pool ----------

    /* A maze's date is when it was added to the archive; an event's is when
       it opened. Both are "when this arrived", which is the question the
       game asks, and mixing them is what keeps the line interesting — a
       maze between two events reads as history rather than as a list.

       `precision` is carried rather than inferred later: a month-only date
       is a real fact about the record, and the difference decides both
       whether a card can be in the set and how its date is written out. */
    function buildPool(rooms, events) {
        const out = [];
        (rooms || []).forEach(room => {
            if (!room || !room.name || !room.added) return;
            const parsed = readDate(room.added);
            if (!parsed) return;
            out.push({
                id: "maze:" + room.id,
                kind: "maze",
                title: room.name,
                by: room.creator || "",
                thumb: room.thumb || room.entrance || "",
                at: parsed.at,
                precision: parsed.precision
            });
        });
        (events || []).forEach(ev => {
            if (!ev || !ev.title || !ev.date) return;
            const parsed = readDate(ev.date);
            if (!parsed) return;
            out.push({
                id: "event:" + ev.id,
                kind: "event",
                title: ev.title,
                by: ev.host || "",
                thumb: ev.thumb || ev.entrance || "",
                at: parsed.at,
                precision: parsed.precision
            });
        });
        // Sorted before the day's shuffle ever runs — see Daily.shuffle for
        // why the order going in decides what comes out.
        return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }

    function readDate(value) {
        const text = String(value).trim();
        if (/^\d{4}-\d{2}$/.test(text)) {
            const at = Date.parse(text + "-01T12:00:00Z");
            return isNaN(at) ? null : { at, precision: "month" };
        }
        const at = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? text + "T12:00:00Z" : text);
        return isNaN(at) ? null : { at, precision: "day" };
    }

    const DAY_MS = 86400000;

    /* Can these two sit in the same puzzle and still have a right answer?

       Ten days apart is the general rule. On top of that, a month-only card
       cannot share a month with anything, because "June 2024" against "14
       June 2024" has no answer at all — the first genuinely might be after
       the second. */
    function separable(a, b) {
        if (Math.abs(a.at - b.at) < MIN_GAP_DAYS * DAY_MS) return false;
        if (a.precision === "month" || b.precision === "month") {
            const ma = new Date(a.at).toISOString().slice(0, 7);
            const mb = new Date(b.at).toISOString().slice(0, 7);
            if (ma === mb) return false;
        }
        return true;
    }

    /* The day's six. Greedy against the shuffled pool: take the first card,
       then keep taking the next one that is separable from everything taken
       so far. With fifty-odd records spread over two years this fills easily;
       if it ever could not, the day is short rather than unfair. */
    function pickDay() {
        const shuffled = window.Daily.shuffle(pool, window.Daily.seedFrom("ratrospect:" + day()));
        const chosen = [];
        for (const card of shuffled) {
            if (chosen.length >= CARDS + 1) break;
            if (chosen.every(taken => separable(taken, card))) chosen.push(card);
        }
        return chosen;
    }

    let dealtCache = { day: "", cards: [] };
    function dealt() {
        if (dealtCache.day !== day()) dealtCache = { day: day(), cards: pickDay() };
        return dealtCache.cards;
    }

    // ---------- the state of play ----------

    /* Stored as decisions rather than as a rendered board: which card went
       where, and whether it stuck. The board is rebuilt from that on every
       render, so a refresh mid-game lands exactly where it left off. */
    function blankDay() {
        return { day: day(), placed: [], results: [], lives: LIVES, done: false };
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
        stats = s && typeof s === "object" ? s : { played: 0, streak: 0, best: 0, bestScore: 0, lastDay: "" };
    }

    function saveStats() {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* private mode */ }
    }

    /* Banked once, when the day ends. A streak counts days PLAYED, not days
       won: coming back is the habit worth rewarding, and a game that breaks
       your streak for a bad day is a game you stop opening after a bad day. */
    function bankDay() {
        if (stats.lastDay === day()) return;
        stats.streak = stats.lastDay === window.Daily.dayBefore(day()) ? stats.streak + 1 : 1;
        stats.played += 1;
        stats.best = Math.max(stats.best || 0, stats.streak);
        stats.bestScore = Math.max(stats.bestScore || 0, score());
        stats.lastDay = day();
        saveStats();
    }

    const score = () => state.results.filter(r => r.right).length * POINTS_EACH;

    // The cards on the line, oldest first — the free one plus everything
    // placed correctly since.
    function line() {
        const cards = dealt();
        if (!cards.length) return [];
        const down = [cards[0]].concat(state.results.filter(r => r.right).map(r => cards[r.index]));
        return down.sort((a, b) => a.at - b.at);
    }

    const nextIndex = () => state.results.length + 1;

    function current() {
        const cards = dealt();
        const i = nextIndex();
        return i < cards.length ? cards[i] : null;
    }

    const finished = () => state.done
        || state.lives <= 0
        || state.results.length >= CARDS
        || !current();

    // ---------- playing ----------

    /* A slot is "the card goes here", numbered by how many cards on the line
       it comes after: 0 is before everything, line.length is after
       everything. Right or wrong is then simply whether the card's own date
       falls in that gap — which is the same question the player was asked,
       rather than a second rule that could disagree with it. */
    function placeAt(slot) {
        if (finished()) return;
        const card = current();
        if (!card) return;
        const down = line();
        const after = slot === 0 ? null : down[slot - 1];
        const before = slot >= down.length ? null : down[slot];
        const right = (!after || card.at > after.at) && (!before || card.at < before.at);

        state.results.push({ index: nextIndex(), slot, right });
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
        if (card.precision === "month") return `${month} ${d.getUTCFullYear()}`;
        return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
    }

    // ---------- drawing it ----------

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function cardHtml(card, opts) {
        const o = opts || {};
        return `
            <article class="ratro-card${o.extra ? " " + o.extra : ""}" data-kind="${escapeHtml(card.kind)}">
                ${card.thumb ? `<img class="ratro-card-thumb" src="${escapeHtml(card.thumb)}" alt="" loading="lazy">` : ""}
                <div class="ratro-card-text">
                    <p class="ratro-card-kind">${card.kind === "event" ? "Event" : "Maze"}</p>
                    <h4 class="ratro-card-title">${escapeHtml(card.title)}</h4>
                    ${o.showWhen ? `<p class="ratro-card-when">${escapeHtml(whenText(card))}</p>`
                        : card.by ? `<p class="ratro-card-by">${escapeHtml(card.by)}</p>` : ""}
                </div>
            </article>`;
    }

    function render() {
        if (!el.body) return;
        const cards = dealt();
        if (!cards.length) {
            el.body.innerHTML = `<p class="ratro-empty">The archive is not answering just now — try again in a moment.</p>`;
            return;
        }
        el.body.innerHTML = finished() ? resultsHtml() : boardHtml();
        wire();
    }

    function boardHtml() {
        const down = line();
        const card = current();
        const lives = `<span class="ratro-lives" aria-label="${state.lives} lives left">`
            + Array.from({ length: LIVES }, (_, i) =>
                `<span class="ratro-life${i < state.lives ? "" : " is-spent"}" aria-hidden="true"></span>`).join("")
            + `</span>`;

        /* The slots are buttons rather than places to drop something. A drag
           is the flashier answer and the worse one: it is hard on a phone,
           hard with a keyboard, and hard to read out — and the question
           being asked ("does this go before or after that?") is a choice,
           which is what a button is for. */
        const slots = [];
        for (let i = 0; i <= down.length; i++) {
            const after = i === 0 ? null : down[i - 1];
            const before = i >= down.length ? null : down[i];
            const label = !after ? `Before ${before.title}`
                : !before ? `After ${after.title}`
                    : `Between ${after.title} and ${before.title}`;
            slots.push(`<button type="button" class="ratro-slot" data-slot="${i}" aria-label="${escapeHtml(label)}">
                    <span aria-hidden="true">+</span>
                </button>`);
        }

        const timeline = down.map((c, i) =>
            `${slots[i]}${cardHtml(c, { showWhen: true, extra: "is-down" })}`).join("")
            + slots[down.length];

        return `
            <div class="ratro-head">
                <p class="ratro-progress">Card <strong>${state.results.length + 1}</strong> of ${CARDS}</p>
                ${lives}
                <p class="ratro-score">${score()} pts</p>
            </div>

            <p class="ratro-ask">Where does this go?</p>
            ${cardHtml(card, { extra: "is-hand" })}

            <p class="ratro-hint">Oldest on the left. Press a <span aria-hidden="true">+</span> to put it there.</p>
            <div class="ratro-line" role="group" aria-label="The timeline so far">${timeline}</div>
        `;
    }

    function resultsHtml() {
        const cards = dealt();
        const right = state.results.filter(r => r.right).length;
        const grid = shareGrid();
        const rows = state.results.map(r => {
            const card = cards[r.index];
            return `<li class="ratro-result${r.right ? " is-right" : " is-wrong"}">
                    <span class="ratro-result-mark" aria-hidden="true">${r.right ? "✓" : "✗"}</span>
                    <span class="ratro-result-name">${escapeHtml(card.title)}</span>
                    <span class="ratro-result-when">${escapeHtml(whenText(card))}</span>
                </li>`;
        }).join("");

        const ran = state.lives <= 0 && state.results.length < CARDS;
        return `
            <div class="ratro-done">
                <p class="ratro-done-eyebrow">${ran ? "Out of lives" : "That is the day"}</p>
                <p class="ratro-done-score">${score()}<span> / ${CARDS * POINTS_EACH}</span></p>
                <p class="ratro-done-line">${right} of ${state.results.length} placed right${
                    stats.streak > 1 ? ` · ${stats.streak} day streak` : ""}</p>
                <p class="ratro-grid" aria-hidden="true">${grid}</p>
                <ul class="ratro-results">${rows}</ul>
                <div class="ratro-done-actions">
                    <button type="button" class="guess-btn" id="ratro-share">Copy result</button>
                </div>
                <p class="ratro-foot" id="ratro-foot">A new set of cards every day.</p>
            </div>`;
    }

    const shareGrid = () => state.results.map(r => (r.right ? "🟩" : "🟥")).join("")
        + "⬜".repeat(Math.max(0, CARDS - state.results.length));

    function shareText() {
        return `Ratrospect ${day()} — ${score()}/${CARDS * POINTS_EACH}\n${shareGrid()}\n${location.origin}/ratrospect`;
    }

    function wire() {
        el.body.querySelectorAll(".ratro-slot").forEach(btn => {
            btn.addEventListener("click", () => placeAt(Number(btn.dataset.slot)));
        });
        const share = document.getElementById("ratro-share");
        if (share) {
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
    }

    // ---------- the window ----------

    async function open() {
        if (!el.overlay) return;
        el.overlay.classList.add("open");
        document.body.classList.add("modal-open");
        el.window.focus();
        if (!pool.length) {
            el.body.innerHTML = `<p class="ratro-empty">Dealing…</p>`;
            let rooms = [];
            let events = [];
            // Api is a top-level const in js/api.js, which makes it a global
            // binding but NOT a property of window — reaching for window.Api
            // gets undefined. js/guess.js calls it the same bare way.
            try { rooms = await Api.getRooms(); } catch (e) { rooms = []; }
            try { events = await Api.getEvents(); } catch (e) { events = []; }
            pool = buildPool(rooms, events);
        }
        loadState();
        loadStats();
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

        // /ratrospect is a rewrite to this page (see netlify.toml), so a
        // pasted link opens the game rather than the archive.
        if (location.pathname === "/ratrospect") open();
    }

    /* How today stands, for the menu that offers it. Read from storage
       rather than from `state`, because the menu asks before the game has
       ever been opened and storage is the same truth either way. */
    window.RatrospectStatus = function () {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { saved = null; }
        if (!saved || saved.day !== window.Daily.today() || !Array.isArray(saved.results)) {
            return { started: false, done: 0, total: CARDS, finished: false, points: 0 };
        }
        const points = saved.results.filter(r => r && r.right).length * POINTS_EACH;
        return {
            started: saved.results.length > 0,
            done: saved.results.length,
            total: CARDS,
            finished: Boolean(saved.done),
            points
        };
    };

    window.openRatrospect = function () { open(); };

    document.addEventListener("DOMContentLoaded", mount);
})();

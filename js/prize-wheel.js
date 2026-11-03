/* ===========================================================
   Maze Rats — the Prize Wheel (1 Nov 2026)

   A spin-the-wheel for drawing an event's winners, opened from the Warren's
   Event Entries panel (js/admin-entries.js sends it the approved entrants).
   Built to be recorded: a fixed 1600 x 900 stage scaled to fit the window or
   the screen, the "game show" look the owner picked from the mock-ups (a
   spotlit stage, jewel slices, a brass rim of chasing bulbs, a real little
   maze in the hub and a brass pointer whose tip rides the pegs), sound made
   with Web Audio, and the corner controls fading away with the cursor when
   the mouse is still (SPIN and the reveal's buttons stay).

     FAIR     The winner is picked first, with crypto.getRandomValues
              (rejection sampled, so every entrant has exactly the same
              chance), and so is the spot inside their slice where the wheel
              stops. The spin is then drawn to land there; nothing about the
              animation decides anything.
     ONE      One winner a draw (1 Nov 2026, the owner's: no 2nd and 3rd
              places). The winner's screen has one small Done (2 Nov 2026,
              the owner's); the winner stays on and SPIN draws afresh.
              Saving the winner, Not in the room and Copy name are on the
              draw's row in the Draw log.
     PRIZE    A line under the event's name on the stage, typed in the
              Entrants panel and kept per event by the server.
     KEYS     Space spins, M mutes, F goes fullscreen, Escape closes.
     LOG      Every draw goes in the event's draw log (2 Nov 2026) the
              moment the wheel lands: who, when, by which account, and
              whether it was saved as the winner, spun again (void) or the
              winner wasn't in the room (void, and off the wheel). A draw
              the server couldn't take, an expired session's above all, is
              kept in this tab (sessionStorage) and can be saved from the
              drawer's Draw log once signed in again. Since 2 Nov 2026 a
              logged draw carries the wheel as it spun (replay: the names
              in order, their colours, the winning slice and the spin's
              numbers), and a saved winner's row has "Put in an article",
              a draft article with a replay of the draw (js/article-wheel.js).
     WINNERS"Leave out past winners" (on unless unticked; remembered):
              anybody with a winning entry for the event is off the wheel.

   PrizeWheel.open(opts) — opts:
     title        the event's name
     entrants     [{ name, entryIds, won }]   (names come from visitors: text only)
     events       [{ id, title, date }]  the drawer's event picker (optional)
     eventId      the event shown
     loadEvent    async id -> { title, entrants }   (for the picker)
     loadDraws    async id -> [draw]      the event's draw log
     logDraw      async draw -> draw      (absent: draws aren't logged)
     voidDraw     async (draw, reason) -> draw
     markWinner   async draw -> draw      (absent: no "Save as winner" in the log)
     prize        the event's prize line
     savePrize    async (id, text) -> text   (absent: the Prize box is read-only)
     article      { find, make, open }: Put in an article (absent: no button;
                  see articleFromLog)
     onClose      called once the wheel is down
   PrizeWheel.close() — admin.js's lock-out calls it through AdminEntries.
   =========================================================== */
(function () {
    "use strict";

    /* The wheel's drawing, its spin and its sound are js/wheel-draw.js's
       (2 Nov 2026), shared with an article's replay of a draw
       (js/article-wheel.js), so the replay is this wheel. */
    const WD = window.WheelDraw;
    const W = 1600, H = 900;                 // the stage, before scaling
    const WHEEL = WD.WHEEL;                  // the wheel canvas, square
    const MUTE_KEY = "mazerats_wheel_muted";
    const SKIP_KEY = "mazerats_wheel_skip_winners";
    const DRAWS_KEY = "mazerats_wheel_draws";      // sessionStorage: draws the log hasn't got yet
    // Below this the stage is too small to press anything on, so SPIN and
    // the reveal's buttons sit in a bar at the window's own size (where
    // there is room for it under the stage: see layout).
    const SMALL_SCALE = 0.5;
    // The reveal's name: the widest it may be, padding included.
    const REVEAL_W = 1220;
    const PRIZE_MAX = 80;                           // event-entries.js's PRIZE_MAX

    // ----------------------------------------------------------- helpers

    // A fair whole number in [0, n): rejection sampling, so no entrant is
    // favoured by 2^32 not dividing evenly.
    function fairIndex(n) {
        const limit = Math.floor(4294967296 / n) * n;
        const buf = new Uint32Array(1);
        do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
        return buf[0] % n;
    }
    function fairUnit() {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return buf[0] / 4294967296;
    }
    function shuffled(list) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = fairIndex(i + 1);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    const TAU = WD.TAU;
    const mod = WD.mod;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function btn(cls, label, title) {
        const b = el("button", cls, label);
        b.type = "button";
        if (title) { b.title = title; b.setAttribute("aria-label", title); }
        return b;
    }
    function svgIcon(path) {
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        s.setAttribute("viewBox", "0 0 24 24");
        s.setAttribute("aria-hidden", "true");
        s.innerHTML = path;
        return s;
    }
    const ICONS = {
        sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
        muted: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
        full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="square"/>',
        unfull: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="square"/>',
        people: '<circle cx="9" cy="8.5" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.8 19.5c.8-3.3 3.3-5.2 6.2-5.2s5.4 1.9 6.2 5.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 5.3a3.3 3.3 0 0 1 0 6.4M17.3 14.6c1.9.8 3.2 2.5 3.8 4.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
        close: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        search: '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5.5 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    };

    // "19:42 UTC, 2 Nov", the Warren's UTC times.
    function utc(iso) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return "";
        const d = new Date(t);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
    }
    // An event's date for the picker: "3 Oct 2026".
    function shortDate(s) {
        const t = Date.parse(s);
        if (!Number.isFinite(t)) return "";
        const d = new Date(t);
        return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }
    function newId() {
        if (crypto.randomUUID) return crypto.randomUUID();
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
    }

    // ------------------------------------------------------------- sound
    // Synthesised with Web Audio: js/wheel-draw.js's, muted or not as last time.
    const Sound = WD.sound(MUTE_KEY);

    // ------------------------------------------------------------- state

    let root = null, ui = null;
    let opts = null;
    let all = [];          // every entrant: { name, entryIds, on, won, weight, key }
    let wheel = [];        // the ones on the wheel, in wheel order
    let rot = 0;           // the disk's rotation, radians, clockwise
    let spin = null;       // the spin in progress
    let pointer = { a: 0, v: 0 };
    let lastBoundary = null;
    let highlight = null;  // { index, until }
    let mode = "idle";     // idle | spinning | landing | reveal
    let current = null;    // the entrant just drawn, while the reveal is up
    let raf = 0, lastT = 0;
    let scale = 1, dpr = 1;
    let diskCanvas = null, rimCanvas = null, glossCanvas = null;
    let diskDirty = true;
    let idleTimer = 0;
    let lastTickSound = 0;
    let confetti = [];
    let keySeq = 0;
    let busyEvent = false;
    let openNo = 0;        // bumped by open and close, for answers and timers that outlive them
    let draw = null;       // the draw on the reveal (see newDraw)
    let draws = [];        // the event's draw log from the server, newest first
    let drawsNote = "";    // "Loading…", or why the log couldn't be read
    let drawerTab = "entrants";
    let skipWinners = true;
    const saving = new Map();   // draw id -> the save or sync on its way just now
    try { skipWinners = localStorage.getItem(SKIP_KEY) !== "0"; } catch (e) { /* on */ }

    // -------------------------------------------------------------- build

    function build() {
        root = el("div", "pw-root");
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-label", "Prize wheel");
        root.tabIndex = -1;

        const frame = el("div", "pw-frame");
        frame.append(el("div", "pw-bg"), el("div", "pw-beams"), el("div", "pw-vignette"));

        const brand = el("div", "pw-brand");
        brand.append(el("b", null, "MAZE RATS"));

        const evt = el("div", "pw-event");
        const evEyebrow = el("div", "pw-eyebrow", "Event");
        const evTitle = el("div", "pw-event-title");
        // What the draw is for (2 Nov 2026, the owner's), set in the drawer.
        const evPrize = el("div", "pw-event-prize");
        const evCount = el("div", "pw-event-count");
        evt.append(evEyebrow, evTitle, evPrize, evCount);

        const glow = el("div", "pw-glow");
        const canvas = el("canvas", "pw-wheel");
        canvas.setAttribute("aria-hidden", "true");

        /* The pointer: a brass flapper pinned to the rim, its tip down among
           the pegs so they knock it as they pass (1 Nov 2026, the owner's:
           the first one stopped short of the wheel, under a rat). It pivots
           on its pin; the geometry is in css/prize-wheel.css. */
        const ptr = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        ptr.setAttribute("viewBox", "0 0 64 80");
        ptr.setAttribute("class", "pw-pointer");
        ptr.setAttribute("aria-hidden", "true");
        ptr.innerHTML = '<defs>' +
            '<linearGradient id="pw-brass" x1="0" x2="1"><stop offset="0" stop-color="#7a5a34"/><stop offset=".38" stop-color="#fff1c4"/><stop offset=".55" stop-color="#e8cb94"/><stop offset="1" stop-color="#8a6c48"/></linearGradient>' +
            '<radialGradient id="pw-pin" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#fff6dc"/><stop offset=".45" stop-color="#e3c48f"/><stop offset="1" stop-color="#7a5a34"/></radialGradient>' +
            '</defs>' +
            '<path d="M32 75 L21.5 24 Q32 17 42.5 24 Z" fill="url(#pw-brass)" stroke="#0b0704" stroke-width="3.2" stroke-linejoin="round"/>' +
            '<path d="M31.4 66 L25.6 32" stroke="rgba(255,246,220,.6)" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
            '<circle cx="32" cy="22" r="13" fill="#2a1a0b" stroke="#0b0704" stroke-width="2.5"/>' +
            '<circle cx="32" cy="22" r="9.5" fill="url(#pw-pin)"/>' +
            '<circle cx="32" cy="22" r="3.2" fill="#4a3018"/>' +
            '<circle cx="28.8" cy="18.8" r="2" fill="#fffaf0" opacity=".8"/>';

        const spinBtn = btn("pw-spin", "SPIN", "Spin the wheel (Space)");
        spinBtn.removeAttribute("aria-label");

        const conf = el("canvas", "pw-confetti");
        conf.setAttribute("aria-hidden", "true");

        // The reveal.
        const reveal = el("div", "pw-reveal");
        reveal.setAttribute("aria-live", "assertive");
        const rvInner = el("div", "pw-reveal-inner");
        const rvEyebrow = el("div", "pw-reveal-eyebrow", "The winner is");
        const rvName = el("div", "pw-reveal-name");
        const rvPlace = el("div", "pw-reveal-place");
        /* One small Done, bottom right, and nothing else on the winner's
           screen (2 Nov 2026, the owner's). Saving the winner, Not in the
           room and copying the name are on the draw's row in the Draw log;
           Enter or Escape is Done too. */
        const rvDone = btn("pw-btn pw-btn-quiet pw-reveal-done", "Done", "Done (Enter)");
        rvDone.removeAttribute("aria-label");
        const rvFoot = el("div", "pw-reveal-foot");
        rvFoot.appendChild(rvDone);
        rvInner.append(rvEyebrow, rvName, rvPlace);
        reveal.append(rvInner, rvFoot);

        frame.append(brand, evt, glow, canvas, ptr, spinBtn, conf, reveal);

        // SPIN and the reveal's buttons move here on a small window (layout).
        const dock = el("div", "pw-dock");

        // The operator's controls sit outside the scaled frame, at the
        // window's own size, and fade with the cursor.
        const ctrl = el("div", "pw-ctrl");
        const soundBtn = btn("pw-icon", null, "Sound (M)");
        const fullBtn = btn("pw-icon", null, "Fullscreen (F)");
        const peopleBtn = btn("pw-icon pw-icon-text", null, "Entrants");
        peopleBtn.appendChild(svgIcon(ICONS.people));
        peopleBtn.appendChild(el("span", null, "Entrants"));
        const closeBtn = btn("pw-icon", null, "Close (Esc)");
        closeBtn.appendChild(svgIcon(ICONS.close));
        ctrl.append(soundBtn, fullBtn, peopleBtn, closeBtn);

        /* The drawer: the entrants and the draw log as two tabs (2 Nov
           2026), under a searchable event picker. */
        const drawer = el("aside", "pw-drawer");
        drawer.setAttribute("aria-label", "Entrants and draw log");
        const dHead = el("div", "pw-drawer-head");
        const dTabs = el("div", "pw-tabs");
        dTabs.setAttribute("role", "tablist");
        dTabs.setAttribute("aria-label", "Entrants and draw log");
        const tab = (key, label) => {
            const t = btn("pw-tab", null);
            t.id = `pw-tab-${key}`;
            t.dataset.tab = key;
            t.setAttribute("role", "tab");
            t.setAttribute("aria-controls", `pw-panel-${key}`);
            const n = el("span", "pw-tab-count");
            t.append(document.createTextNode(label), n);
            return [t, n];
        };
        const [tEnt, tEntCount] = tab("entrants", "Entrants");
        const [tLog, tLogCount] = tab("log", "Draw log");
        dTabs.append(tEnt, tLog);
        const dClose = btn("pw-icon pw-icon-small", null, "Close the drawer");
        dClose.appendChild(svgIcon(ICONS.close));
        dHead.append(dTabs, dClose);

        // The event picker: type to search, arrows and Enter to pick.
        const dEventRow = el("div", "pw-drawer-event");
        const dPickLabel = el("label", null, "Event");
        dPickLabel.htmlFor = "pw-pick-input";
        const dPickBox = el("div", "pw-pick");
        dPickBox.appendChild(svgIcon(ICONS.search));
        const dPick = el("input", "pw-pick-input");
        dPick.id = "pw-pick-input";
        dPick.type = "text";
        dPick.autocomplete = "off";
        dPick.spellcheck = false;
        dPick.placeholder = "Search the events";
        dPick.setAttribute("role", "combobox");
        dPick.setAttribute("aria-autocomplete", "list");
        dPick.setAttribute("aria-expanded", "false");
        dPick.setAttribute("aria-controls", "pw-pick-list");
        const dPickList = el("div", "pw-pick-list");
        dPickList.id = "pw-pick-list";
        dPickList.setAttribute("role", "listbox");
        dPickList.setAttribute("aria-label", "Events");
        dPickList.hidden = true;
        dPickBox.append(dPick, dPickList);
        dEventRow.append(dPickLabel, dPickBox);

        const pEnt = el("div", "pw-panel");
        pEnt.id = "pw-panel-entrants";
        pEnt.setAttribute("role", "tabpanel");
        pEnt.setAttribute("aria-labelledby", "pw-tab-entrants");
        /* The prize line (2 Nov 2026, the owner's): typed here, shown on the
           stage under the event's name, kept per event by the server. Saved
           on Enter or on leaving the box; Escape puts the saved one back. */
        const dPrizeRow = el("div", "pw-drawer-event pw-prize");
        const dPrizeLabel = el("label", null, "Prize");
        dPrizeLabel.htmlFor = "pw-prize-input";
        const dPrize = el("input", "pw-prize-input");
        dPrize.id = "pw-prize-input";
        dPrize.type = "text";
        dPrize.maxLength = PRIZE_MAX;
        dPrize.autocomplete = "off";
        dPrize.placeholder = "What the winner gets";
        const dPrizeNote = el("span", "pw-prize-note");
        dPrizeNote.setAttribute("role", "status");
        dPrizeRow.append(dPrizeLabel, dPrize, dPrizeNote);
        const dHint = el("p", "pw-drawer-hint", "Every approved entrant, one slice each (a correction is not a second slice). Untick anyone who shouldn't be in this draw.");
        const dTools = el("div", "pw-drawer-tools");
        const dAll = btn("pw-mini", "All");
        const dNone = btn("pw-mini", "None");
        const dShuffle = btn("pw-mini", "Shuffle the wheel");
        const dCount = el("span", "pw-drawer-count");
        dTools.append(dAll, dNone, dShuffle, dCount);
        const dSkipRow = el("label", "pw-skip");
        const dSkip = el("input");
        dSkip.type = "checkbox";
        const dSkipText = el("span", null, "Leave out past winners");
        const dSkipCount = el("span", "pw-skip-count");
        dSkipRow.append(dSkip, dSkipText, dSkipCount);
        dSkipRow.title = "Anybody already marked a winner for this event stays off the wheel";
        const dList = el("div", "pw-drawer-list");
        const dAdd = el("form", "pw-drawer-add");
        const dAddInput = el("input");
        dAddInput.type = "text";
        dAddInput.maxLength = 40;
        dAddInput.placeholder = "Add a name by hand";
        dAddInput.setAttribute("aria-label", "Add a name by hand");
        const dAddBtn = el("button", "pw-mini", "Add");
        dAddBtn.type = "submit";
        dAdd.append(dAddInput, dAddBtn);
        pEnt.append(dPrizeRow, dHint, dTools, dSkipRow, dList, dAdd);

        const pLog = el("div", "pw-panel");
        pLog.id = "pw-panel-log";
        pLog.setAttribute("role", "tabpanel");
        pLog.setAttribute("aria-labelledby", "pw-tab-log");
        const lHint = el("p", "pw-drawer-hint");
        const lList = el("div", "pw-drawer-list pw-log-list");
        pLog.append(lHint, lList);

        drawer.append(dHead, dEventRow, pEnt, pLog);

        // A confirm of its own: in fullscreen only this element's own
        // subtree is shown, so the Warren's AdminConfirm could not be seen.
        const confirmBox = el("div", "pw-confirm");
        const cCard = el("div", "pw-confirm-card");
        const cText = el("p");
        const cRow = el("div", "pw-confirm-row");
        const cYes = btn("pw-btn pw-btn-gold", "Close it");
        const cNo = btn("pw-btn", "Keep drawing");
        cRow.append(cNo, cYes);
        cCard.append(cText, cRow);
        confirmBox.appendChild(cCard);

        root.append(frame, dock, ctrl, drawer, confirmBox);
        document.body.appendChild(root);

        ui = { frame, evTitle, evPrize, evCount, canvas, ptr, spinBtn, conf, reveal, rvName, rvPlace, rvEyebrow,
            rvDone, rvFoot, dock, ctrl, soundBtn, fullBtn, peopleBtn, closeBtn,
            drawer, dClose, dEventRow, dPick, dPickList, dList, dAll, dNone, dShuffle, dCount, dAdd, dAddInput, dSkip, dSkipCount,
            dPrize, dPrizeNote, tEnt, tLog, tEntCount, tLogCount, pEnt, pLog, lHint, lList, confirmBox, cText, cYes, cNo, glow };

        spinBtn.addEventListener("click", () => startSpin());
        canvas.addEventListener("click", () => startSpin());
        soundBtn.addEventListener("click", () => { Sound.wake(); Sound.setMuted(!Sound.muted); paintControls(); });
        fullBtn.addEventListener("click", toggleFullscreen);
        peopleBtn.addEventListener("click", () => setDrawer(!root.classList.contains("pw-drawer-open")));
        dClose.addEventListener("click", () => setDrawer(false));
        closeBtn.addEventListener("click", askClose);
        rvDone.addEventListener("click", doneReveal);
        dPrize.addEventListener("input", () => paintPrize(dPrize.value));
        dPrize.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); savePrize(); }
            else if (e.key === "Escape") { dPrize.value = prizeSaved; paintPrize(prizeSaved); }
        });
        dPrize.addEventListener("blur", () => savePrize());
        dAll.addEventListener("click", () => setAllOn(true));
        dNone.addEventListener("click", () => setAllOn(false));
        dShuffle.addEventListener("click", () => { if (mode !== "idle") return; wheel = shuffled(wheel); diskDirty = true; });
        dList.addEventListener("change", e => {
            const box = e.target.closest("input[data-i]");
            if (!box) return;
            const who = all[Number(box.dataset.i)];
            if (!who) return;
            setOn(who, box.checked);
        });
        dSkip.addEventListener("change", () => {
            if (mode !== "idle") { dSkip.checked = skipWinners; return; }
            skipWinners = dSkip.checked;
            try { localStorage.setItem(SKIP_KEY, skipWinners ? "1" : "0"); } catch (e) { /* this time only */ }
            refreshWheel();
        });
        dAdd.addEventListener("submit", e => {
            e.preventDefault();
            const name = dAddInput.value.trim();
            if (!name || mode !== "idle") return;
            if (all.some(x => x.name.toLowerCase() === name.toLowerCase())) { dAddInput.select(); return; }
            const who = makeEntrant({ name, entryIds: [] });
            who.byHand = true;
            all.push(who);
            setOn(who, true);
            dAddInput.value = "";
        });
        [tEnt, tLog].forEach(t => {
            t.addEventListener("click", () => setTab(t.dataset.tab));
            t.addEventListener("keydown", e => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const next = t === tEnt ? tLog : tEnt;
                setTab(next.dataset.tab);
                next.focus();
            });
        });
        lList.addEventListener("click", e => {
            const b = e.target.closest("button[data-act]");
            if (!b || b.disabled) return;
            const d = logRows().find(x => x.id === b.dataset.id);
            if (!d) return;
            if (b.dataset.act === "save") saveFromLog(d);
            else if (b.dataset.act === "absent") absentFromLog(d);
            else if (b.dataset.act === "copy") copyName(d.name, b);
            else if (b.dataset.act === "retry") syncDraw(d);
            else if (b.dataset.act === "article") articleFromLog(d);
        });
        buildPicker();

        root.addEventListener("keydown", onKey);
        /* Focus that fell out of the wheel (1 Nov 2026, the bug scan): a
           button that hides as it is pressed (Done, the confirm's) drops
           focus on the page's body, where the keys above never arrived, so
           Space no longer spun and Escape no longer closed. While the wheel
           is up the keyboard talks to it, wherever focus has gone. */
        document.addEventListener("keydown", e => {
            if (!root || root.hidden || root.contains(e.target)) return;
            e.stopPropagation();
            root.focus();
            onKey(e);
        }, true);
        root.addEventListener("mousemove", wakeControls);
        root.addEventListener("pointerdown", wakeControls);
        document.addEventListener("fullscreenchange", paintControls);
        window.addEventListener("resize", layout);
    }

    function makeEntrant(x) {
        return { name: String(x.name || "").trim(), entryIds: Array.isArray(x.entryIds) ? x.entryIds.slice() : [], on: true, won: x.won === true, weight: 1, key: ++keySeq };
    }

    // On the wheel: ticked, and not a past winner while those are left out.
    function eligible(who) {
        return who.on && !(skipWinners && who.won);
    }

    // ------------------------------------------------------------ layout

    function layout() {
        if (!root) return;
        const vw = root.clientWidth || window.innerWidth, vh = root.clientHeight || window.innerHeight;
        scale = Math.min(vw / W, vh / H);
        ui.frame.style.transform = `translate(${(vw - W * scale) / 2}px, ${(vh - H * scale) / 2}px) scale(${scale})`;
        dpr = window.devicePixelRatio || 1;
        const px = Math.min(2600, Math.round(WHEEL * scale * dpr));
        if (ui.canvas.width !== px) {
            ui.canvas.width = ui.canvas.height = px;
            rimCanvas = glossCanvas = null;
            diskDirty = true;
        }
        const cw = Math.min(3200, Math.round(W * scale * dpr));
        if (ui.conf.width !== cw) { ui.conf.width = cw; ui.conf.height = Math.round(cw * H / W); }
        /* A phone (2 Nov 2026): at a quarter size SPIN's word was 6px and
           the reveal's buttons 3px, too small to read or press. Below
           SMALL_SCALE they move out of the stage into a bar along the
           window's foot, at their own size. */
        // Only with room under the stage for the bar (a phone held upright).
        const small = scale < SMALL_SCALE && vh - H * scale >= 160;
        root.classList.toggle("pw-small", small);
        if (small && ui.spinBtn.parentNode !== ui.dock) ui.dock.append(ui.spinBtn, ui.rvFoot);
        if (!small && ui.spinBtn.parentNode === ui.dock) {
            ui.frame.insertBefore(ui.spinBtn, ui.conf);
            ui.reveal.appendChild(ui.rvFoot);
        }
    }

    // -------------------------------------------------------- the drawing
    /* js/wheel-draw.js draws the parts at the canvas's size; this keeps
       them until the size or the slices change. */

    function drawRim() { rimCanvas = WD.drawRim(ui.canvas.width); }
    function drawGloss() { glossCanvas = WD.drawGloss(ui.canvas.width); }

    // Each slice's span, in the disk's own angles: 0 is the pointer at rot 0.
    const spans = () => WD.spans(wheel.map(x => x.weight));

    const nameFont = WD.nameFont;

    function drawDisk() {
        diskCanvas = WD.drawDisk(ui.canvas.width, wheel.map(w => w.name), { weights: wheel.map(w => w.weight) });
        diskDirty = false;
    }

    function render(t) {
        if (!rimCanvas) drawRim();
        if (!glossCanvas) drawGloss();
        if (diskDirty || !diskCanvas) drawDisk();
        // the winning slice, lit up as it lands
        const lit = highlight && current ? spans()[wheel.indexOf(current)] || null : null;
        // all the bulbs flashing as it lands, then a fast chase while the reveal is up
        const bm = mode === "spinning" && !spin ? "idle" : mode;
        WD.render(ui.canvas, { rim: rimCanvas, gloss: glossCanvas, disk: diskCanvas }, {
            rot, t, lit, litFrom: highlight ? highlight.from : 0,
            bulb: i => WD.bulbState(bm, i, t, spin ? spin.chase : 0)
        });
    }

    // ------------------------------------------------------------ the spin

    /* The whole spin is one curve worked out before it starts, so it lands
       exactly where the draw said (WheelDraw.plan: a short pull back, a
       smooth push up to full speed, then a long friction-like slowing). */
    function startSpin() {
        if (mode !== "idle" || wheel.length === 0 || !root || root.hidden) return;
        Sound.wake();
        setDrawer(false);
        const n = wheel.length;
        const winIndex = fairIndex(n);
        current = wheel[winIndex];
        const sp = spans()[winIndex];
        const where = sp[0] + (sp[1] - sp[0]) * (0.14 + 0.72 * fairUnit());
        const turns = 6 + fairIndex(3);
        const decel = 8.6 + 1.6 * fairUnit();
        const from = rot;
        spin = Object.assign(WD.plan(from, where, n, turns, decel), { t0: performance.now(), chase: 0, whooshed: false });
        // For the draw log: the field, and whether winners were left out of it.
        draw = newDraw(current, n);
        /* And the wheel exactly as it spun (2 Nov 2026), so an article can
           replay this draw: the names in their order, each slice's colour,
           which won, and the spin's numbers. Names only, as shown. */
        if (n <= WD.SNAP_MAX) {
            draw.replay = { names: wheel.map(w => w.name), colours: wheel.map((w, i) => WD.jewelIndex(i, n)), win: winIndex, from, where, turns, decel };
        }
        mode = "spinning";
        root.classList.add("pw-spinning");
        ui.spinBtn.disabled = true;
    }

    // rot and speed at time s seconds into the spin
    const spinAt = s => WD.at(spin, s);

    // how many dividers have gone past the pointer, counting on round
    const boundaryIndex = () => WD.boundary(rot, wheel.length);

    function step(t) {
        raf = 0;
        if (!root || !root.isConnected) return;
        const dt = Math.min(0.05, (t - (lastT || t)) / 1000);
        lastT = t;

        if (mode === "spinning" && spin) {
            const s = (t - spin.t0) / 1000;
            const [r, v] = spinAt(s);
            rot = r;
            spin.chase += Math.abs(v) * dt * 2.2 + dt * 2;
            if (!spin.whooshed && s >= spin.windUp) { spin.whooshed = true; Sound.whoosh(); }
            // the pegs
            const b = boundaryIndex();
            if (lastBoundary !== null && b !== lastBoundary) {
                const speed = Math.abs(v);
                const kick = clamp(0.07 + speed * 0.022, 0.07, 0.42) * Math.sign(v || 1);
                pointer.v -= kick * 26;
                if (t - lastTickSound > 28) { lastTickSound = t; Sound.tick(clamp(1.2 - speed / 14, 0.25, 1)); }
            }
            lastBoundary = b;
            if (s >= spin.windUp + spin.accel + spin.decel) land(t);
        } else {
            lastBoundary = boundaryIndex();
        }

        // the pointer's spring
        const kSpring = 340, damp = 17;
        pointer.v += (-kSpring * pointer.a - damp * pointer.v) * dt;
        pointer.a += pointer.v * dt;
        pointer.a = clamp(pointer.a, -0.5, 0.5);
        ui.ptr.style.transform = `rotate(${pointer.a}rad)`;

        render(t);
        if (confetti.length) stepConfetti(dt);
        raf = requestAnimationFrame(step);
    }

    function land(t) {
        rot = spin.from + spin.delta;
        rot = mod(rot, TAU);
        spin = null;
        mode = "landing";
        root.classList.remove("pw-spinning");
        Sound.thunk();
        highlight = { from: t };
        setTimeout(() => { if (mode === "landing") showReveal(); }, 1150);
    }

    // Shrinks a line of display text until it fits its width.
    const measurer = document.createElement("canvas").getContext("2d");
    function fitText(node, max, min, width) {
        const cs = getComputedStyle(node);
        let size = max;
        for (; size > min; size -= 1) {
            measurer.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
            const w = measurer.measureText(node.textContent).width + (parseFloat(cs.letterSpacing) || 0) * node.textContent.length;
            if (w <= width) break;
        }
        node.style.fontSize = size + "px";
    }

    // -------------------------------------------------------- the reveal

    /* The winner's name, as big as it goes on one line down to 72px; past
       that (2 Nov 2026, the bug scan: a long name ran off both sides at the
       old 56px floor) on two lines, broken anywhere it must be, as big as
       two lines allow. Measured in the page, at the stage's own size. */
    function fitReveal(node) {
        node.classList.remove("pw-two-lines");
        let size = 150;
        for (; size >= 72; size -= 2) {
            node.style.fontSize = size + "px";
            if (node.offsetWidth <= REVEAL_W) return;
        }
        node.classList.add("pw-two-lines");
        for (size = 104; size > 28; size -= 2) {
            node.style.fontSize = size + "px";
            if (node.scrollWidth <= REVEAL_W && node.offsetHeight <= size * 2.1 + 14) return;
        }
        node.style.fontSize = "28px";
    }

    function showReveal() {
        if (!current) return;
        mode = "reveal";
        highlight = null;
        ui.rvEyebrow.textContent = "The winner is";
        ui.rvName.textContent = current.name;
        fitReveal(ui.rvName);
        ui.rvPlace.textContent = `WINNER · ${(opts.title || "Prize draw").toUpperCase()}`;
        root.classList.add("pw-revealing");
        root.classList.remove("pw-actions-in");
        setTimeout(() => { if (mode === "reveal") root.classList.add("pw-actions-in"); }, 1600);
        Sound.fanfare();
        burst();
        // Into the log as it lands, saved or not.
        if (draw && typeof opts.logDraw === "function") {
            keepDraw(draw);
            syncDraw(draw);
        }
    }

    function hideReveal() {
        root.classList.remove("pw-revealing", "pw-actions-in");
    }

    /* The reveal goes and the wheel waits for SPIN. The winner stays on,
       unless they were saved as the winner while past winners are left
       out. The draw stays in the log as drawn, neither saved nor void,
       for the Draw log's buttons to decide. */
    function doneReveal() {
        if (mode !== "reveal") return;
        const had = ui.rvFoot.contains(document.activeElement);
        hideReveal();
        if (had) root.focus();
        current = null;
        draw = null;
        mode = "idle";
        refreshWheel();
    }

    // The name on the clipboard, said on the button that asked.
    async function copyName(name, button) {
        let ok = false;
        try { await navigator.clipboard.writeText(name); ok = true; } catch (e) {
            // An older browser, or no permission: the old way.
            const t = el("textarea");
            t.value = name;
            t.setAttribute("readonly", "");
            t.style.cssText = "position:fixed;left:-9999px;top:0";
            root.appendChild(t);
            t.select();
            try { ok = document.execCommand("copy"); } catch (x) { ok = false; }
            t.remove();
        }
        if (button && button.isConnected) {
            button.textContent = ok ? "Copied ✓" : "Couldn't copy";
            setTimeout(() => { if (button.isConnected) button.textContent = "Copy name"; }, 1800);
        }
    }

    /* Not in the room (2 Nov 2026): a live Habbo draw's winner has to be
       there to collect. From the draw's row in the log: the draw is voided
       and they come off the wheel; the host spins again when ready. */
    function absentFromLog(row) {
        if (mode !== "idle") return;
        const kept = readKept().find(x => x.id === row.id);
        const d = kept || Object.assign({ logged: true, want: "drawn", reason: "", error: "" }, row);
        if (!Array.isArray(d.entryIds)) d.entryIds = [];
        d.eventId = opts.eventId;
        const key = String(d.name || "").toLowerCase();
        all.forEach(x => { if (x.name.toLowerCase() === key) x.on = false; });
        voidDraw(d, "absent");
        refreshWheel();
        paintLog();
    }

    /* The prize line under the event's name (2 Nov 2026, the owner's). The
       stage shows the box as it is typed; the server keeps the saved one per
       event. A save that fails keeps the typed text (in this tab's storage
       too, for an expired session) and says so. */
    let prizeSaved = "";
    const PRIZE_KEY = "mazerats_wheel_prize";     // sessionStorage: { eventId: text } not yet saved
    function prizeOwed() {
        try { const v = JSON.parse(sessionStorage.getItem(PRIZE_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; }
    }
    function owePrize(ev, textOrNull) {
        const v = prizeOwed();
        if (textOrNull === null) delete v[ev]; else v[ev] = textOrNull;
        try { if (Object.keys(v).length) sessionStorage.setItem(PRIZE_KEY, JSON.stringify(v)); else sessionStorage.removeItem(PRIZE_KEY); } catch (e) { /* the box keeps it */ }
    }
    const cleanPrize = s => String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, PRIZE_MAX);
    function paintPrize(s) {
        if (!ui) return;
        ui.evPrize.textContent = cleanPrize(s);
    }
    function setPrize(saved) {
        prizeSaved = cleanPrize(saved);
        const ev = opts.eventId || "none";
        const owed = prizeOwed()[ev];
        const canSave = typeof opts.savePrize === "function";
        ui.dPrize.readOnly = !canSave;
        ui.dPrize.title = canSave ? "Shown under the event's name. Saved for this event when you press Enter or leave the box." : "This account is view-only, so the prize can't be changed here.";
        ui.dPrizeNote.textContent = "";
        ui.dPrize.value = typeof owed === "string" ? owed : prizeSaved;
        paintPrize(ui.dPrize.value);
        // Typed under an expired session: send it now.
        if (typeof owed === "string" && canSave) savePrize();
    }
    async function savePrize() {
        if (!ui || typeof opts.savePrize !== "function") return;
        const ev = opts.eventId || "none";
        const text = cleanPrize(ui.dPrize.value);
        if (text === prizeSaved && !(ev in prizeOwed())) { paintPrize(text); return; }
        const at = openNo;
        ui.dPrizeNote.textContent = "Saving…";
        ui.dPrizeNote.classList.remove("is-bad");
        try {
            const saved = await opts.savePrize(ev, text);
            if (at !== openNo || ev !== (opts.eventId || "none")) return;
            prizeSaved = cleanPrize(typeof saved === "string" ? saved : text);
            owePrize(ev, null);
            if (cleanPrize(ui.dPrize.value) === prizeSaved) ui.dPrize.value = prizeSaved;
            ui.dPrizeNote.textContent = "Saved";
            setTimeout(() => { if (ui.dPrizeNote.textContent === "Saved") ui.dPrizeNote.textContent = ""; }, 2200);
        } catch (err) {
            owePrize(ev, text);
            if (at !== openNo || ev !== (opts.eventId || "none")) return;
            ui.dPrizeNote.classList.add("is-bad");
            ui.dPrizeNote.textContent = err && err.status === 401
                ? "Your Warren session has ended, so the prize isn't saved. It's kept here: sign in again and open the wheel to save it."
                : `Not saved: ${(err && err.message) || "something went wrong"}`;
        }
    }

    // ---------------------------------------------------------- the log

    /* A draw: made as the wheel starts (so the field is the one it spun),
       logged as it lands. `want` is what the host has decided for it:
       drawn (no decision), saved, or void with a reason. */
    function newDraw(who, onWheel) {
        return {
            id: newId(),
            eventId: opts.eventId || "none",
            eventTitle: opts.title || "",
            name: who.name,
            entryIds: who.entryIds.slice(),
            onWheel,
            leftOutWinners: skipWinners && all.some(x => x.won && x.on),
            prize: ui.evPrize.textContent,
            drawnAt: new Date().toISOString(),
            logged: false, want: "drawn", reason: "", error: ""
        };
    }

    // What failed, said for the host. A 401 is the session, not the draw.
    function failText(err) {
        if (err && err.status === 401) {
            return "Your Warren session has ended, so this isn't saved yet. It's kept in this tab: sign in again, open the wheel and save it from the Draw log.";
        }
        return `Not saved: ${(err && err.message) || "something went wrong"}`;
    }

    // This tab's draws the server hasn't fully got, kept over a reload.
    function readKept() {
        try {
            const v = JSON.parse(sessionStorage.getItem(DRAWS_KEY) || "[]");
            return Array.isArray(v) ? v.filter(d => d && typeof d.id === "string" && typeof d.name === "string") : [];
        } catch (e) {
            return [];
        }
    }
    function writeKept(list) {
        try {
            if (list.length) sessionStorage.setItem(DRAWS_KEY, JSON.stringify(list.slice(-30)));
            else sessionStorage.removeItem(DRAWS_KEY);
        } catch (e) { /* this page's memory only */ }
    }
    function keepDraw(d) {
        const fields = ["id", "eventId", "eventTitle", "name", "entryIds", "onWheel", "leftOutWinners", "prize", "drawnAt", "replay", "logged", "want", "reason", "error"];
        const copy = {};
        fields.forEach(k => { copy[k] = d[k]; });
        writeKept(readKept().filter(x => x.id !== d.id).concat(copy));
    }
    function forgetDraw(id) {
        writeKept(readKept().filter(x => x.id !== id));
    }

    const sameEvent = (rowEvent, id) => (rowEvent === null ? "none" : rowEvent) === (id || "none");

    // A row the server sent back goes into the log on show.
    function mergeRow(row) {
        if (!row || typeof row.id !== "string" || !opts || !sameEvent(row.eventId, opts.eventId)) return;
        draws = [row].concat(draws.filter(x => x.id !== row.id));
    }

    // The log as shown: the server's rows, with this tab's unfinished ones over them.
    function logRows() {
        // A kept draw the log already has wears the log's who and when.
        const kept = readKept().filter(d => opts && sameEvent(d.eventId, opts.eventId))
            .map(d => Object.assign({}, draws.find(x => x.id === d.id) || {}, { kept: true }, d));
        const ids = new Set(kept.map(d => d.id));
        return kept.concat(draws.filter(d => !ids.has(d.id)))
            .sort((a, b) => (Date.parse(b.drawnAt) || 0) - (Date.parse(a.drawnAt) || 0));
    }

    /* Log a draw, then carry out a void decided for it. Whatever fails stays
       kept, to try again (the row's Try again, or the next opening). */
    function syncDraw(d) {
        if (typeof opts.logDraw !== "function") return Promise.resolve();
        if (saving.has(d.id)) return saving.get(d.id);
        const job = syncNow(d);
        saving.set(d.id, job);
        if (opts) paintLog();
        return job;
    }
    async function syncNow(d) {
        await Promise.resolve();
        const at = openNo;
        try {
            if (!d.logged) {
                mergeRow(await opts.logDraw(d));
                d.logged = true;
            }
            if (d.want === "void" && typeof opts.voidDraw === "function") mergeRow(await opts.voidDraw(d, d.reason));
            d.error = "";
            if (d.want === "saved") keepDraw(d);
            else forgetDraw(d.id);
        } catch (err) {
            d.error = failText(err);
            keepDraw(d);
        } finally {
            saving.delete(d.id);
            if (at === openNo) paintLog();
        }
    }

    function voidDraw(d, reason) {
        d.want = "void";
        d.reason = reason;
        if (typeof opts.logDraw !== "function") return;
        keepDraw(d);
        syncDraw(d);
    }

    /* Saved as the winner: logged first if it wasn't, then every approved
       entry of theirs for the event marked (event-entries.js), and the draw
       with it. Rejects with the server's error, the draw kept. */
    async function saveDraw(d) {
        if (typeof opts.markWinner !== "function" || !d.entryIds.length) return;
        // The landing's own logging may still be on its way: after it.
        if (saving.has(d.id)) await saving.get(d.id).catch(() => {});
        if (saving.has(d.id)) throw new Error("it's already being saved");
        let done;
        saving.set(d.id, new Promise(r => { done = r; }));
        const at = openNo;
        d.want = "saved";
        keepDraw(d);
        try {
            if (!d.logged) {
                mergeRow(await opts.logDraw(d));
                d.logged = true;
            }
            mergeRow(await opts.markWinner(d));
            forgetDraw(d.id);
            // A winner now: off the next wheel while past winners are left out.
            if (at === openNo) all.forEach(x => { if (x.name.toLowerCase() === d.name.toLowerCase()) x.won = true; });
        } catch (err) {
            d.error = failText(err);
            keepDraw(d);
            throw err;
        } finally {
            saving.delete(d.id);
            done();
            if (at === openNo) {
                paintLog();
                if (mode === "idle") refreshWheel();
            }
        }
    }

    function saveFromLog(row) {
        if (mode !== "idle") return;
        const d = Object.assign({ logged: true, want: "drawn", reason: "", error: "" }, row);
        if (!Array.isArray(d.entryIds)) d.entryIds = [];
        d.eventId = opts.eventId;
        saveDraw(d).catch(() => { /* the row says why */ });
        paintLog();
    }

    /* Put in an article (2 Nov 2026, the owner's: the winner is announced
       on the site). A saved winner's draw becomes a DRAFT article holding a
       replay of it (js/article-wheel.js), and the wheel closes onto that
       draft in What's New's article editor. A draw already in an article
       offers that one instead of making another. opts.article (from
       js/admin-entries.js): find(row) -> the article or null, make(row,
       title) -> the new draft, open(article). */
    let articleWork = null;          // { id, word } while one is under way
    const articleErr = new Map();    // draw id -> why it couldn't be done
    async function articleFromLog(row) {
        if (mode !== "idle" || articleWork || !opts.article) return;
        const at = openNo, art = opts.article, title = opts.title;
        articleErr.delete(row.id);
        articleWork = { id: row.id, word: "Looking…" };
        paintLog();
        try {
            const found = await art.find(row);
            if (at !== openNo) return;
            if (found) {
                articleWork = null;
                paintLog();
                const ok = await confirmInStage(`This draw is already in an article: "${found.title || "Untitled"}". Open that one in the article editor?`, "Open it", "Not now");
                if (ok && at === openNo) { close(); art.open(found); }
                return;
            }
            articleWork = { id: row.id, word: "Making it…" };
            paintLog();
            const made = await art.make(row, title);
            if (at !== openNo) return;
            articleWork = null;
            close();
            art.open(made);
        } catch (err) {
            if (at !== openNo) return;
            articleErr.set(row.id, err && err.status === 401
                ? "Your Warren session has ended. Sign in again to make the article."
                : `No article made: ${(err && err.message) || "something went wrong"}`);
        } finally {
            if (at === openNo) { articleWork = null; paintLog(); }
        }
    }

    async function loadDraws() {
        draws = [];
        if (typeof opts.loadDraws !== "function") { drawsNote = ""; paintLog(); return; }
        drawsNote = "Loading…";
        paintLog();
        const at = openNo, ev = opts.eventId;
        try {
            const list = await opts.loadDraws(ev);
            if (at !== openNo || ev !== opts.eventId) return;
            draws = Array.isArray(list) ? list : [];
            drawsNote = "";
            // The log answered, so the session works again: last time's
            // "session has ended" no longer stands under those rows.
            writeKept(readKept().map(d => (sameEvent(d.eventId, ev) ? Object.assign(d, { error: "" }) : d)));
        } catch (err) {
            if (at !== openNo || ev !== opts.eventId) return;
            drawsNote = err && err.status === 401
                ? "Your Warren session has ended. Sign in again to read the draw log."
                : `Couldn't read the draw log: ${(err && err.message) || "something went wrong"}`;
        }
        paintLog();
        // Anything this tab still owes the log, now it can be sent.
        readKept().filter(d => sameEvent(d.eventId, ev) && (!d.logged || d.want === "void")).forEach(d => syncDraw(d));
    }

    const REASON = { respin: "spun again", absent: "not in the room" };
    function rowState(d) {
        if (d.kept) {
            if (d.want === "void") return [`Void: ${REASON[d.reason] || "set aside"}`, "is-void"];
            if (d.want === "saved") return ["Not saved", "is-open"];
            return ["Not in the log yet", "is-open"];
        }
        if (d.status === "saved") return ["Winner", "is-won"];
        if (d.status === "void") return [`Void: ${REASON[d.reason] || "set aside"}`, "is-void"];
        return ["Not saved", ""];
    }

    function paintLog() {
        if (!ui) return;
        const rows = logRows();
        ui.tLogCount.textContent = rows.length ? String(rows.length) : "";
        const list = ui.lList;
        list.textContent = "";
        const writer = typeof opts.logDraw === "function";
        const saved = rows.filter(d => !d.kept && d.status === "saved").length;
        const owed = rows.filter(d => d.kept && d.want === "saved").length;
        ui.lHint.textContent = !writer ? "This account is view-only, so its draws aren't logged or saved."
            : owed ? `${owed === 1 ? "A draw" : owed + " draws"} marked as the winner in this tab ${owed === 1 ? "wasn't" : "weren't"} saved. Save as winner saves ${owed === 1 ? "it" : "them"} now.`
            : rows.length ? `Every draw for this event, newest first. ${saved ? `${saved} saved as the winner.` : "None saved as the winner yet."}`
            : "Every draw for this event goes here, saved or not.";
        rows.forEach(d => {
            const r = el("div", "pw-draw");
            const top = el("div", "pw-draw-top");
            const [word, cls] = rowState(d);
            top.append(el("span", "pw-draw-name", d.name), el("span", `pw-draw-chip ${cls}`, word));
            r.appendChild(top);
            const meta = [utc(d.drawnAt), d.drawnBy ? `by ${d.drawnBy}` : "in this tab", d.onWheel ? `${d.onWheel} on the wheel` : ""];
            if (d.leftOutWinners) meta.push("past winners left out");
            r.appendChild(el("div", "pw-draw-meta", meta.filter(Boolean).join(" · ")));
            if (d.prize) r.appendChild(el("div", "pw-draw-meta", `Prize: ${d.prize}`));
            if (!d.kept && d.status === "saved" && d.savedBy) r.appendChild(el("div", "pw-draw-meta", `Saved by ${d.savedBy}, ${utc(d.savedAt)}`));
            if (!d.kept && d.status === "void" && d.voidedBy) r.appendChild(el("div", "pw-draw-meta", `Voided by ${d.voidedBy}, ${utc(d.voidedAt)}`));
            if (d.kept && d.error) r.appendChild(el("div", "pw-draw-error", d.error));
            const busy = saving.has(d.id);
            const acts = el("div", "pw-draw-acts");
            const canSave = typeof opts.markWinner === "function" && Array.isArray(d.entryIds) && d.entryIds.length &&
                (d.kept ? d.want !== "void" : d.status === "drawn");
            if (canSave) {
                const b = btn("pw-mini", busy ? "Saving…" : "Save as winner");
                b.dataset.act = "save";
                b.dataset.id = d.id;
                b.disabled = busy || mode !== "idle";
                b.title = "Mark them a winner in Event Entries";
                acts.appendChild(b);
            }
            // From the winner's screen (2 Nov 2026, the owner's: only Done there).
            const canVoid = writer && (d.kept ? d.want === "drawn" : d.status === "drawn");
            if (canVoid) {
                const b = btn("pw-mini", "Not in the room");
                b.dataset.act = "absent";
                b.dataset.id = d.id;
                b.disabled = busy || mode !== "idle";
                b.title = "Void this draw and take them off the wheel";
                acts.appendChild(b);
            }
            const cp = btn("pw-mini", "Copy name");
            cp.dataset.act = "copy";
            cp.dataset.id = d.id;
            acts.appendChild(cp);
            if (d.kept && d.want !== "saved" && writer) {
                const b = btn("pw-mini", busy ? "Sending…" : "Try again");
                b.dataset.act = "retry";
                b.dataset.id = d.id;
                b.disabled = busy;
                acts.appendChild(b);
            }
            // A saved winner's draw, into an article (2 Nov 2026, the owner's).
            if (!d.kept && d.status === "saved" && opts.article) {
                const mine = articleWork && articleWork.id === d.id;
                const b = btn("pw-mini", mine ? articleWork.word : "Put in an article");
                b.dataset.act = "article";
                b.dataset.id = d.id;
                b.disabled = Boolean(articleWork) || mode !== "idle";
                b.title = "A draft article with a replay of this draw, opened in What's New's article editor";
                acts.appendChild(b);
            }
            if (articleErr.has(d.id)) r.appendChild(el("div", "pw-draw-error", articleErr.get(d.id)));
            if (acts.childNodes.length) r.appendChild(acts);
            list.appendChild(r);
        });
        if (!rows.length) list.appendChild(el("p", "pw-drawer-empty", drawsNote || "No draws for this event yet."));
        else if (drawsNote) list.insertBefore(el("p", "pw-drawer-empty", drawsNote), list.firstChild);
    }

    // ---------------------------------------------------------- confetti

    function burst() {
        const cols = ["#f2c94c", "#fff1c4", "#e3c48f", "#c7a679", "#b8452f", "#6a4a9c", "#2f78a0", "#4f8a45"];
        const make = (x, y, vx, vy) => ({
            x, y, vx, vy,
            s: 7 + Math.floor(Math.random() * 3) * 3,
            tall: Math.random() < 0.5,
            rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
            flip: Math.random() * TAU, vf: 6 + Math.random() * 10,
            col: cols[Math.floor(Math.random() * cols.length)],
            cheese: Math.random() < 0.12,
            life: 0
        });
        for (let i = 0; i < 130; i++) {
            const a = -Math.PI / 2 + 0.42 + (Math.random() - 0.5) * 0.6;
            const v = 1750 + Math.random() * 750;
            confetti.push(make(-10, H + 10, Math.cos(a) * v, Math.sin(a) * v));
            const b = -Math.PI / 2 - 0.42 + (Math.random() - 0.5) * 0.6;
            confetti.push(make(W + 10, H + 10, Math.cos(b) * v, Math.sin(b) * v));
        }
        for (let i = 0; i < 150; i++) confetti.push(make(Math.random() * W, -20 - Math.random() * 380, (Math.random() - 0.5) * 80, 90 + Math.random() * 120));
    }

    function stepConfetti(dt) {
        const ctx = ui.conf.getContext("2d");
        const k = ui.conf.width / W;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ui.conf.width, ui.conf.height);
        ctx.setTransform(k, 0, 0, k, 0, 0);
        confetti = confetti.filter(p => {
            p.life += dt;
            // air drag, gravity, then a paper-light fall once it tops out
            const drag = Math.pow(0.4, dt);
            p.vx *= drag;
            p.vy = p.vy * drag + 900 * dt;
            if (p.vy > 150) p.vy = 150 + (p.vy - 150) * Math.pow(0.001, dt);
            p.x += (p.vx + Math.sin(p.flip) * 30) * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            p.flip += p.vf * dt;
            if (p.y > H + 40) return false;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, Math.cos(p.flip));
            if (p.cheese) {
                ctx.fillStyle = "#f2c94c"; ctx.strokeStyle = "#5a3d10"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(-11, 7); ctx.lineTo(11, 7); ctx.lineTo(11, -7); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#c99a2e"; ctx.fillRect(4, 0, 4, 4); ctx.fillRect(-2, 3, 3, 3);
            } else {
                ctx.fillStyle = p.col;
                ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.tall ? p.s * 1.8 : p.s);
            }
            ctx.restore();
            return true;
        });
        if (!confetti.length) ctx.clearRect(0, 0, W, H);
    }

    // ------------------------------------------------------------ drawer

    function setDrawer(open, tabName) {
        if (!root) return;
        root.classList.toggle("pw-drawer-open", open);
        ui.peopleBtn.setAttribute("aria-expanded", String(open));
        if (tabName) setTab(tabName);
        if (open) { renderDrawer(); paintLog(); wakeControls(); }
        else closePick(true);
    }

    function setTab(name) {
        drawerTab = name === "log" ? "log" : "entrants";
        [[ui.tEnt, ui.pEnt, "entrants"], [ui.tLog, ui.pLog, "log"]].forEach(([t, p, key]) => {
            const on = key === drawerTab;
            t.setAttribute("aria-selected", String(on));
            t.tabIndex = on ? 0 : -1;
            p.hidden = !on;
        });
        if (drawerTab === "log") paintLog();
    }

    function renderDrawer() {
        if (!ui) return;
        const list = ui.dList;
        const scroll = list.scrollTop;
        list.textContent = "";
        const locked = mode !== "idle";
        all.forEach((who, i) => {
            const row = el("label", "pw-entrant");
            const box = el("input");
            box.type = "checkbox";
            box.dataset.i = String(i);
            const out = skipWinners && who.won;
            box.checked = eligible(who);
            box.disabled = locked || out;
            const name = el("span", "pw-entrant-name", who.name);
            row.append(box, name);
            if (who.won) {
                const tag = el("span", "pw-entrant-tag is-won", "winner");
                tag.title = out ? "Already a winner for this event, so left out. Untick Leave out past winners to put them back." : "Already a winner for this event";
                row.appendChild(tag);
            }
            if (who.byHand) {
                row.appendChild(el("span", "pw-entrant-tag", "added"));
            }
            list.appendChild(row);
        });
        if (!all.length) list.appendChild(el("p", "pw-drawer-empty", busyEvent ? "Loading…" : "No approved entries for this event."));
        list.scrollTop = scroll;
        ui.dCount.textContent = `${wheel.length} on the wheel`;
        ui.tEntCount.textContent = String(wheel.length);
        [ui.dAll, ui.dNone, ui.dShuffle].forEach(b => { b.disabled = locked; });
        ui.dAddInput.disabled = locked;
        ui.dPick.disabled = locked || busyEvent;
        ui.dSkip.checked = skipWinners;
        ui.dSkip.disabled = locked;
        const won = all.filter(x => x.won).length;
        ui.dSkipCount.textContent = won ? `(${won})` : "";
        paintCount();
        // The log's buttons wait for the wheel to stop, too.
        if (drawerTab === "log") paintLog();
    }

    /* The wheel from the ticks: whoever is now left out comes off, and
       whoever is now in goes on at a random place, not always at the end.
       Everyone else keeps their place. */
    function refreshWheel() {
        if (!ui) return;
        const next = wheel.filter(eligible);
        all.forEach(who => {
            if (eligible(who) && !next.includes(who)) next.splice(fairIndex(next.length + 1), 0, who);
        });
        if (next.length !== wheel.length || next.some((w, i) => w !== wheel[i])) {
            wheel = next;
            diskDirty = true;
        }
        ui.spinBtn.disabled = !wheel.length;
        renderDrawer();
    }

    function setOn(who, on) {
        if (mode !== "idle") return;
        who.on = on;
        refreshWheel();
    }

    function setAllOn(on) {
        if (mode !== "idle") return;
        all.forEach(who => { who.on = on; });
        wheel = shuffled(all.filter(eligible));
        diskDirty = true;
        ui.spinBtn.disabled = !wheel.length;
        renderDrawer();
    }

    function paintCount() {
        const n = all.filter(w => !w.byHand).length;
        ui.evCount.textContent = `${n} approved entrant${n === 1 ? "" : "s"} · ${wheel.length} on the wheel`;
    }

    function paintEvents() {
        const evs = Array.isArray(opts.events) ? opts.events : [];
        ui.dEventRow.hidden = !evs.length || typeof opts.loadEvent !== "function";
        closePick(true);
    }

    /* ---- the event picker (2 Nov 2026): a combobox, not a <select> of
       every event in the archive. Focus shows the list; typing narrows it
       by title or date; the arrows move, Enter picks, Escape puts the
       current event back. */
    let pickList = [];
    let pickAt = -1;
    function pickTitle() {
        const e = (opts && Array.isArray(opts.events) ? opts.events : []).find(x => x.id === opts.eventId);
        return e ? (e.title || e.id) : (opts && opts.title) || "";
    }
    function buildPicker() {
        const input = ui.dPick, list = ui.dPickList;
        input.addEventListener("focus", () => { input.select(); filterPick(""); });
        input.addEventListener("input", () => filterPick(input.value));
        input.addEventListener("keydown", e => {
            const openNow = !list.hidden;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (!openNow) { filterPick(input.value === pickTitle() ? "" : input.value); return; }
                if (!pickList.length) return;
                pickAt = e.key === "ArrowDown" ? Math.min(pickList.length - 1, pickAt + 1) : Math.max(0, pickAt - 1);
                paintPick();
            } else if (e.key === "Home" && openNow && pickList.length) {
                e.preventDefault(); pickAt = 0; paintPick();
            } else if (e.key === "End" && openNow && pickList.length) {
                e.preventDefault(); pickAt = pickList.length - 1; paintPick();
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (openNow && pickAt >= 0) choosePick(pickAt);
            } else if (e.key === "Escape" && openNow) {
                // Closes the list only; a second Escape leaves the box.
                e.preventDefault();
                e.stopPropagation();
                closePick(true);
                input.select();
            } else if (e.key === "Tab") {
                closePick(true);
            }
        });
        input.addEventListener("blur", () => closePick(true));
        // Pressed, not focused away: the input keeps focus until the pick.
        list.addEventListener("mousedown", e => e.preventDefault());
        list.addEventListener("click", e => {
            const o = e.target.closest("[data-i]");
            if (o) choosePick(Number(o.dataset.i));
        });
    }
    function filterPick(q) {
        const evs = Array.isArray(opts.events) ? opts.events : [];
        const s = String(q || "").trim().toLowerCase();
        pickList = s ? evs.filter(e => String(e.title || e.id).toLowerCase().includes(s) || shortDate(e.date).toLowerCase().includes(s)) : evs.slice();
        pickAt = s ? (pickList.length ? 0 : -1) : pickList.findIndex(e => e.id === opts.eventId);
        if (!s && pickAt < 0 && pickList.length) pickAt = 0;
        ui.dPickList.hidden = false;
        ui.dPick.setAttribute("aria-expanded", "true");
        paintPick(true);
    }
    function paintPick(centre) {
        const list = ui.dPickList;
        list.textContent = "";
        pickList.slice(0, 300).forEach((e, i) => {
            const o = el("div", "pw-pick-opt");
            o.id = `pw-pick-${i}`;
            o.dataset.i = String(i);
            o.setAttribute("role", "option");
            o.setAttribute("aria-selected", String(i === pickAt));
            if (e.id === opts.eventId) o.classList.add("is-current");
            o.appendChild(el("span", "pw-pick-title", e.title || e.id));
            const date = shortDate(e.date);
            if (date) o.appendChild(el("span", "pw-pick-date", date));
            list.appendChild(o);
        });
        if (!pickList.length) list.appendChild(el("div", "pw-pick-none", "No event by that name."));
        if (pickAt >= 0) ui.dPick.setAttribute("aria-activedescendant", `pw-pick-${pickAt}`);
        else ui.dPick.removeAttribute("aria-activedescendant");
        const on = list.children[pickAt];
        if (on && on.scrollIntoView) on.scrollIntoView({ block: centre ? "center" : "nearest" });
    }
    function closePick(restore) {
        if (!ui) return;
        ui.dPickList.hidden = true;
        ui.dPick.setAttribute("aria-expanded", "false");
        ui.dPick.removeAttribute("aria-activedescendant");
        if (restore && opts) ui.dPick.value = pickTitle();
    }
    function choosePick(i) {
        const e = pickList[i];
        closePick(true);
        if (e && e.id !== opts.eventId) {
            ui.dPick.value = e.title || e.id;
            switchEvent(e.id);
        }
    }

    async function switchEvent(id) {
        if (mode !== "idle" || busyEvent || typeof opts.loadEvent !== "function") { closePick(true); return; }
        busyEvent = true;
        ui.dPick.disabled = true;
        all = []; wheel = []; diskDirty = true;
        draws = [];
        renderDrawer();
        /* An answer that lands after the wheel was closed, or opened again
           on another event, is dropped (1 Nov 2026, the bug scan): it put
           the old pick's entrants and title on the new wheel. */
        const at = openNo;
        try {
            const data = await opts.loadEvent(id);
            if (at !== openNo) return;
            opts.eventId = id;
            opts.title = data.title;
            busyEvent = false;
            setEntrants(data.entrants);
            setPrize(data.prize);
            loadDraws();
        } catch (err) {
            if (at !== openNo) return;
            ui.dList.textContent = "";
            ui.dList.appendChild(el("p", "pw-drawer-empty", err && err.status === 401
                ? "Your Warren session has ended. Sign in again, then open the wheel."
                : `Couldn't load them: ${(err && err.message) || "something went wrong"}`));
        } finally {
            if (at === openNo) {
                busyEvent = false;
                ui.dPick.disabled = mode !== "idle";
                if (document.activeElement !== ui.dPick) closePick(true);
            }
        }
    }

    function setEntrants(list) {
        all = (list || []).map(makeEntrant).filter(x => x.name);
        wheel = shuffled(all.filter(eligible));
        current = null;
        rot = -TAU / Math.max(1, wheel.length) / 2;    // a slice's middle under the pointer
        diskDirty = true;
        ui.evTitle.textContent = opts.title || "Prize draw";
        fitText(ui.evTitle, 22, 14, 330);
        ui.spinBtn.disabled = !wheel.length;
        renderDrawer();
    }

    // ---------------------------------------------------------- controls

    function paintControls() {
        if (!ui) return;
        ui.soundBtn.textContent = "";
        ui.soundBtn.appendChild(svgIcon(Sound.muted ? ICONS.muted : ICONS.sound));
        ui.soundBtn.title = Sound.muted ? "Sound is off (M)" : "Sound is on (M)";
        ui.soundBtn.setAttribute("aria-pressed", String(!Sound.muted));
        const full = document.fullscreenElement === root;
        ui.fullBtn.textContent = "";
        ui.fullBtn.appendChild(svgIcon(full ? ICONS.unfull : ICONS.full));
        ui.fullBtn.title = full ? "Leave fullscreen (F)" : "Fullscreen (F)";
        setTimeout(layout, 50);
    }

    function toggleFullscreen() {
        if (document.fullscreenElement === root) { document.exitFullscreen().catch(() => {}); return; }
        if (root.requestFullscreen) root.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }

    // The controls and the cursor go once the mouse has been still a
    // moment, so a recording shows only the stage.
    function wakeControls() {
        if (!root) return;
        root.classList.remove("pw-idle");
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (root && !root.classList.contains("pw-drawer-open") && !root.classList.contains("pw-confirming")) root.classList.add("pw-idle");
        }, 2200);
    }

    function onKey(e) {
        if (e.target.closest && e.target.closest("input, select, textarea")) {
            // Back to the stage, not to the page behind (1 Nov 2026, the bug
            // scan): a blur left focus on the body, out of reach of these keys.
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); root.focus(); }
            return;
        }
        if (root.classList.contains("pw-confirming")) {
            if (e.key === "Escape") { e.preventDefault(); ui.cNo.click(); }
            return;
        }
        /* The keys the wheel answers go no further (1 Nov 2026, the bug
           scan): M and F reached js/letter-jump.js, which scrolled the
           Warren's lists behind the wheel. */
        if (/^( |m|M|f|F|Escape)$/.test(e.key)) e.stopPropagation();
        // The winner's screen: Enter or Escape is Done (2 Nov 2026).
        if (mode === "reveal" && (e.key === "Escape" || (e.key === "Enter" && !(e.target.closest && e.target.closest("button") && e.target !== ui.rvDone)))) {
            e.preventDefault();
            e.stopPropagation();
            doneReveal();
            wakeControls();
            return;
        }
        if (e.key === " " || e.code === "Space") {
            if (e.target.closest && e.target.closest("button") && e.target !== ui.spinBtn) return;
            e.preventDefault();
            if (mode === "reveal") return;
            startSpin();
        } else if (e.key === "m" || e.key === "M") {
            Sound.wake(); Sound.setMuted(!Sound.muted); paintControls();
        } else if (e.key === "f" || e.key === "F") {
            toggleFullscreen();
        } else if (e.key === "Escape") {
            e.preventDefault();
            if (root.classList.contains("pw-drawer-open")) setDrawer(false);
            else askClose();
        } else if (e.key === "Tab") {
            // keep the focus inside the wheel while it is open
            const items = Array.from(root.querySelectorAll("button, input, select")).filter(x => !x.disabled && x.offsetParent !== null && getComputedStyle(x).visibility !== "hidden");
            if (!items.length) return;
            const i = items.indexOf(document.activeElement);
            if (e.shiftKey && (i <= 0)) { e.preventDefault(); items[items.length - 1].focus(); }
            else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
        }
        wakeControls();
    }

    let confirmResolve = null;
    function confirmInStage(text, yes, no) {
        ui.cText.textContent = text;
        ui.cYes.textContent = yes;
        ui.cNo.textContent = no;
        root.classList.add("pw-confirming");
        wakeControls();
        ui.cNo.focus();
        return new Promise(resolve => { confirmResolve = resolve; });
    }

    async function askClose() {
        if (mode === "spinning" || mode === "landing") {
            const ok = await confirmInStage("Close the wheel in the middle of a spin?", "Close it", "Keep spinning");
            if (!ok) return;
        }
        close();
    }

    // ------------------------------------------------------- open / close

    function open(o) {
        opts = Object.assign({}, o);
        if (!root) build();
        if (raf) cancelAnimationFrame(raf);
        openNo++;
        busyEvent = false;
        mode = "idle";
        spin = null; highlight = null; confetti = [];
        pointer = { a: 0, v: 0 };
        hideReveal();
        root.classList.remove("pw-confirming", "pw-spinning", "pw-drawer-open", "pw-idle");
        root.hidden = false;
        document.documentElement.classList.add("pw-open");
        draw = null; current = null;
        articleWork = null;
        articleErr.clear();
        paintControls();
        layout();
        setEntrants(opts.entrants);
        setPrize(opts.prize);
        paintEvents();
        setTab("entrants");
        loadDraws();
        /* A draw this tab couldn't save (the session ran out mid-show, say)
           waits in the Draw log, opened on it so it isn't forgotten. */
        const owed = readKept().some(d => sameEvent(d.eventId, opts.eventId) && d.want === "saved");
        if (owed) setDrawer(true, "log");
        else if (!wheel.length) setDrawer(true);
        lastT = 0;
        raf = requestAnimationFrame(step);
        root.focus();
        wakeControls();
        // the canvas names wait on the pixel font; draw them again once it's in
        if (document.fonts && document.fonts.load) {
            Promise.all([document.fonts.load(nameFont(24)), document.fonts.load("900 40px Montserrat")])
                .then(() => { diskDirty = true; ui.evTitle && fitText(ui.evTitle, 22, 14, 330); }).catch(() => {});
        }
    }

    function close() {
        if (!root || root.hidden) return;
        if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
        if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
        root.hidden = true;
        document.documentElement.classList.remove("pw-open");
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        openNo++;
        mode = "idle";
        spin = null; confetti = []; current = null; draw = null;
        closePick(false);
        clearTimeout(idleTimer);
        /* The sound engine sleeps with the wheel (1 Nov 2026, the bug scan):
           a running AudioContext kept the browser's audio thread awake for
           as long as the Warren stayed open. Sound.wake resumes it. */
        if (Sound.ctx && Sound.ctx.state === "running") Sound.ctx.suspend().catch(() => {});
        if (opts && typeof opts.onClose === "function") opts.onClose();
    }

    // The confirm's buttons answer whoever asked.
    document.addEventListener("click", e => {
        if (!confirmResolve || !ui) return;
        if (e.target === ui.cYes || e.target === ui.cNo) {
            const r = confirmResolve;
            confirmResolve = null;
            root.classList.remove("pw-confirming");
            r(e.target === ui.cYes);
            e.stopImmediatePropagation();
        }
    }, true);

    window.PrizeWheel = { open, close, isOpen: () => Boolean(root && !root.hidden) };
})();

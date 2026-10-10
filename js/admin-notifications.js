/* ===========================================================
   Maze Rats — the Notifications panel in /warren (5 Oct 2026, the owner's)

   A notice that waits in the Habbo Console (js/console.js, NOTIFICATIONS):
   the console button turns to its alert picture until it is read, and
   opening the console shows it first.

     COMPOSE   The message (300 characters at most), and who it is for:
               Everyone — signed in or not, offered for 30 days — or Chosen
               players, picked with a search of the Players list (nickname,
               Discord name, @username). Send asks first.
     SENT      The latest sixty, newest first: the message, who it went to,
               when and by whom, how many have read it so far, and Withdraw
               (nobody who has not read it yet will). An event entry
               approved on the Event Entries tab sends its own, marked
               "Entry approved".

   The store is netlify/functions/notifications.js. Writing needs an owner
   or admin account; a view-only one sees the list.
   =========================================================== */
(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="notifications"]');
    if (!panel || typeof Api === "undefined") return;
    const composeEl = document.getElementById("notices-compose");
    const listEl = document.getElementById("notices-list");
    const refreshBtn = document.getElementById("notices-refresh-btn");
    const TEXT_MAX = 300;
    const TOKEN_KEY = "mazerats_admin_token";

    let notices = null;         // the last list read, or null before one
    let loadError = "";
    let loading = false;
    let audience = "all";
    let chosen = [];            // [{ id, name }]
    let draft = "";
    /* An everyone-notice's options (5 Oct 2026, the owner's; ACTIVE_DAYS in
       netlify/functions/notifications.js): how long it is offered, when it
       starts, who it is for, and whether it is an alert. */
    const DAYS = [[1, "1 day"], [3, "3 days"], [7, "1 week"], [14, "2 weeks"], [21, "3 weeks"], [30, "1 month"], [0, "Until I withdraw it"]];
    const WHO = [
        ["everyone", "Everyone", "Everyone who visits sees"],
        ["signedIn", "Signed-in players only", "Signed-in players who visit see"],
        ["signedOut", "Signed-out visitors only", "Visitors who aren't signed in see"],
        ["newPlayers", "New players only", "Players signing in for the first time see"],
        ["noNick", "Players with no nickname", "Signed-in players with no nickname see"],
        ["unverified", "Players whose Habbo isn't verified", "Signed-in players whose Habbo isn't verified see"]
    ];
    const opt = { days: 30, later: false, start: "", who: "everyone", quiet: false };
    let results = [];
    let searchGen = 0;
    let busy = false;
    let sessionNo = 0;          // moved on by reset(): see send

    // ----------------------------------------------------------- helpers

    function token() {
        if (typeof window.AdminToken === "function") return window.AdminToken() || "";
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    }
    function role() {
        try { return typeof window.AdminRole === "function" ? String(window.AdminRole() || "") : ""; } catch (e) { return ""; }
    }
    function canWrite() {
        const r = role();
        if (r) return r === "owner" || r === "admin";
        return !document.body.classList.contains("is-viewer");
    }
    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function fmtUtc(iso) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return "—";
        return new Date(t).toLocaleString("en-GB", {
            timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
        }).replace(",", "") + " UTC";
    }
    function errText(err) {
        if (err && err.status === 403) return "This account can't send notifications.";
        return (err && err.message) || "Something went wrong";
    }
    function sessionGone(err) {
        if (!err || err.status !== 401) return false;
        if (typeof window.AdminLockOut === "function") window.AdminLockOut();
        return true;
    }
    async function ask(html, opts) {
        if (typeof window.AdminConfirm === "function") return window.AdminConfirm(html, opts);
        const div = document.createElement("div");
        div.innerHTML = html;
        return confirm(div.textContent);
    }
    const nameOf = p => (p && (p.displayName || p.nick || p.name || (p.username ? "@" + p.username : ""))) || "Someone";

    // ----------------------------------------------------------- compose

    function say(text, bad) {
        const el = composeEl.querySelector(".nt-status");
        if (!el) return;
        el.textContent = text || "";
        el.classList.toggle("is-bad", !!bad);
    }

    function renderCompose() {
        if (!canWrite()) {
            composeEl.innerHTML = `<p class="admin-hint">This account is view-only: it can see what has been sent, but not send.</p>`;
            return;
        }
        /* One card (5 Oct 2026, the owner's: "cleaner"): on the left the
           message, who it goes to and Send, top to bottom; on the right the
           console preview, as tall as the left column. */
        composeEl.innerHTML = `
            <div class="nt-compose-top">
                <div class="nt-compose-main">
                    <div class="nt-label-row">
                        <label class="ctl-label" for="nt-text">Message</label>
                        <button type="button" class="ctl-btn nt-bold" data-bold title="Bold the selected words (they are wrapped in **asterisks**)"><strong>B</strong> Bold</button>
                    </div>
                    <textarea class="ctl-input nt-text" id="nt-text" rows="5" maxlength="${TEXT_MAX}" placeholder="What the console should say">${escapeHtml(draft)}</textarea>
                    <p class="admin-hint nt-left">${leftLine()}</p>
                    <div class="nt-to-row">
                        <span class="ctl-label">Send to</span>
                        <div class="ctl-seg nt-audience" role="group" aria-label="Send to">
                            <button type="button" class="btn-enter-mini${audience === "all" ? " active" : ""}" data-audience="all" aria-pressed="${audience === "all"}">Everyone</button>
                            <button type="button" class="btn-enter-mini${audience === "players" ? " active" : ""}" data-audience="players" aria-pressed="${audience === "players"}">Chosen players</button>
                        </div>
                    </div>
                    ${audience === "players" ? `
                        <div class="nt-pick">
                            <input type="search" class="ctl-input nt-search" id="nt-search" aria-label="Find a player" placeholder="Find a player: nickname, Discord name or @username" autocomplete="off" spellcheck="false">
                            <div class="nt-results">${results.map((p, i) => `
                                <button type="button" class="ctl-btn nt-result" data-add="${i}"${chosen.some(c => c.id === p.id) ? " disabled" : ""}>${escapeHtml(nameOf(p))}${p.username && nameOf(p) !== "@" + p.username ? `<span class="nt-result-user">@${escapeHtml(p.username)}</span>` : ""}</button>`).join("")}</div>
                            <div class="nt-chosen">${chosen.length
                                ? chosen.map((c, i) => `<span class="de-chip nt-chip">${escapeHtml(c.name)} <button type="button" class="nt-chip-x" data-remove="${i}" aria-label="Remove ${escapeHtml(c.name)}">×</button></span>`).join("")
                                : `<span class="admin-hint">Nobody chosen yet.</span>`}</div>
                        </div>` : ""}
                    ${audience === "all" ? optionsHtml() : ""}
                    <div class="nt-send-row">
                        <p class="admin-hint nt-reach">${audience === "players"
                            ? (chosen.length ? `${chosen.length} ${chosen.length === 1 ? "player" : "players"} chosen.` : "Choose who it goes to.")
                            : reachLine()}</p>
                        <button type="button" class="ctl-btn nt-send" data-send${busy ? " disabled" : ""}>Send notification</button>
                    </div>
                    <p class="ctl-status nt-status" role="status"></p>
                </div>
                <div class="nt-preview" aria-label="How it will look in the console">
                    <span class="ctl-label">Preview</span>
                    ${previewHtml()}
                </div>
            </div>`;
    }

    function optionsHtml() {
        return `
            <div class="nt-options">
                <label class="nt-opt"><span class="ctl-label">Active for</span>
                    <select class="ctl-input" data-opt="days">${DAYS.map(([v, l]) => `<option value="${v}"${opt.days === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
                <label class="nt-opt"><span class="ctl-label">Who sees it</span>
                    <select class="ctl-input" data-opt="who">${WHO.map(([v, l]) => `<option value="${v}"${opt.who === v ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select></label>
                <label class="nt-opt"><span class="ctl-label">Starts</span>
                    <select class="ctl-input" data-opt="later"><option value="0"${opt.later ? "" : " selected"}>Now</option><option value="1"${opt.later ? " selected" : ""}>Later…</option></select></label>
                ${opt.later ? `<label class="nt-opt"><span class="ctl-label">At (your time)</span>
                    <input type="datetime-local" class="ctl-input" data-opt="start" value="${escapeHtml(opt.start)}"></label>` : ""}
                <label class="nt-opt nt-opt-quiet"><input type="checkbox" data-opt="quiet"${opt.quiet ? " checked" : ""}> Quiet: no alert or sound, it only appears in their Notifications list</label>
            </div>`;
    }

    // What the options add up to, in a sentence under them.
    function reachLine() {
        const who = (WHO.find(w => w[0] === opt.who) || WHO[0])[2];
        const t = opt.later && opt.start ? Date.parse(opt.start) : NaN;
        const from = Number.isFinite(t) ? `from ${new Date(t).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "from now";
        const span = opt.days ? `for ${(DAYS.find(d => d[0] === opt.days) || DAYS[5])[1]}` : "until you withdraw it";
        return `${who} it once, ${from} ${span}${opt.quiet ? ", quietly, in their Notifications list" : ""}.`;
    }

    function leftLine() {
        return `${TEXT_MAX - draft.length} characters left. Select words and press Bold to make them bold.`;
    }

    /* THE PREVIEW (5 Oct 2026, the owner's): the console as a player sees
       it, built from the console's own parts and classes (home.html's
       #console-modal and its CSS, which the Warren shares) — the frame, the
       title strip, the close box and the screen with its notice page, cut
       off under the screen where the tabs would be. The words go through
       the same rule js/console.js uses (noticeHtml there): escaped, then
       **this** in the bold cut. */
    function noticeHtml(text) {
        return `<span class="console-notice-inner">${escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</span>`;
    }
    function previewHtml() {
        return `
            <div class="console-frame nt-preview-frame" aria-hidden="true">
                <div class="console-border"></div>
                <div class="console-top-pattern"><h2 class="console-title">Habbo Console</h2></div>
                <span class="console-close-btn"></span>
                <div class="console-screen">
                    <div class="console-screen-scroll nt-preview-scroll">
                        <div class="console-page console-page-notice" style="display:flex">
                            <h3 class="console-page-title">Notifications</h3>
                            <div class="console-hashline"></div>
                            <p class="console-notice-text">${noticeHtml(draft.trim() ? draft : "Your message will appear here.")}</p>
                            <div class="console-contact-actions console-notices-actions">
                                <button type="button" class="console-btn console-btn-cancel" tabindex="-1">Back</button>
                                <button type="button" class="console-btn" tabindex="-1" disabled>Next</button>
                            </div>
                        </div>
                    </div>
                    <div class="console-screen-shadow"></div>
                </div>
            </div>`;
    }
    function paintPreview() {
        const t = composeEl.querySelector(".nt-preview .console-notice-text");
        if (t) t.innerHTML = noticeHtml(draft.trim() ? draft : "Your message will appear here.");
    }

    // The Bold button: the selection wrapped in ** **, or a pair to type into.
    function boldSelection() {
        const box = composeEl.querySelector("#nt-text");
        if (!box) return;
        const a = box.selectionStart, b = box.selectionEnd;
        const picked = box.value.slice(a, b);
        const add = picked ? `**${picked}**` : "****";
        if (box.value.length - picked.length + add.length > TEXT_MAX) { say("No room left for bold.", true); return; }
        box.value = box.value.slice(0, a) + add + box.value.slice(b);
        draft = box.value;
        box.focus();
        // Selected words stay selected inside their asterisks; an empty pair puts the cursor between them.
        if (picked) box.setSelectionRange(a + 2, a + 2 + picked.length); else box.setSelectionRange(a + 2, a + 2);
        const left = composeEl.querySelector(".nt-left");
        if (left) left.textContent = leftLine();
        paintPreview();
    }

    async function search(q) {
        const mine = ++searchGen;
        if (!q.trim()) { results = []; paintResults(); return; }
        try {
            const data = await Api.getPlayers(token(), { q: q.trim(), limit: 8 });
            if (mine !== searchGen) return;
            results = ((data && data.players) || []).filter(p => p && p.id);
        } catch (err) {
            if (mine !== searchGen || sessionGone(err)) return;
            results = [];
            say(errText(err), true);
        }
        paintResults();
    }
    // Only the results and the chosen chips, so the search box keeps its text and focus.
    function paintResults() {
        const holder = composeEl.querySelector(".nt-results");
        if (holder) {
            holder.innerHTML = results.map((p, i) => `
                <button type="button" class="ctl-btn nt-result" data-add="${i}"${chosen.some(c => c.id === p.id) ? " disabled" : ""}>${escapeHtml(nameOf(p))}${p.username && nameOf(p) !== "@" + p.username ? `<span class="nt-result-user">@${escapeHtml(p.username)}</span>` : ""}</button>`).join("");
        }
        const chips = composeEl.querySelector(".nt-chosen");
        if (chips) {
            chips.innerHTML = chosen.length
                ? chosen.map((c, i) => `<span class="de-chip nt-chip">${escapeHtml(c.name)} <button type="button" class="nt-chip-x" data-remove="${i}" aria-label="Remove ${escapeHtml(c.name)}">×</button></span>`).join("")
                : `<span class="admin-hint">Nobody chosen yet.</span>`;
        }
    }

    // The line beside Send, kept in step with who is chosen.
    function paintReach() {
        const reach = composeEl.querySelector(".nt-reach");
        if (reach && audience === "players") {
            reach.textContent = chosen.length ? `${chosen.length} ${chosen.length === 1 ? "player" : "players"} chosen.` : "Choose who it goes to.";
        }
    }

    let searchTimer = null;
    composeEl.addEventListener("input", e => {
        if (e.target.id === "nt-text") {
            draft = e.target.value.slice(0, TEXT_MAX);
            const left = composeEl.querySelector(".nt-left");
            if (left) left.textContent = leftLine();
            paintPreview();
        } else if (e.target.id === "nt-search") {
            clearTimeout(searchTimer);
            const q = e.target.value;
            searchTimer = setTimeout(() => search(q), 250);
        }
    });

    composeEl.addEventListener("change", e => {
        const o = e.target.closest("[data-opt]");
        if (!o) return;
        const k = o.dataset.opt;
        if (k === "days") opt.days = Number(o.value);
        else if (k === "who") opt.who = o.value;
        else if (k === "later") { opt.later = o.value === "1"; renderCompose(); return; }
        else if (k === "start") opt.start = o.value;
        else if (k === "quiet") opt.quiet = o.checked;
        const reach = composeEl.querySelector(".nt-reach");
        if (reach) reach.textContent = reachLine();
    });

    composeEl.addEventListener("click", async e => {
        const aud = e.target.closest("[data-audience]");
        if (aud) {
            audience = aud.dataset.audience;
            results = [];
            renderCompose();
            return;
        }
        const add = e.target.closest("[data-add]");
        if (add) {
            const p = results[Number(add.dataset.add)];
            if (p && !chosen.some(c => c.id === p.id)) chosen.push({ id: p.id, name: nameOf(p) });
            paintResults();
            paintReach();
            return;
        }
        const rm = e.target.closest("[data-remove]");
        if (rm) {
            chosen.splice(Number(rm.dataset.remove), 1);
            paintResults();
            paintReach();
            return;
        }
        if (e.target.closest("[data-bold]")) { boldSelection(); return; }
        if (e.target.closest("[data-send]")) send();
    });

    async function send() {
        if (busy) return;
        const text = draft.replace(/\s+/g, " ").trim();
        if (!text) { say("Write the notification first.", true); return; }
        if (audience === "players" && !chosen.length) { say("Choose at least one player.", true); return; }
        let startAt = null;
        if (audience === "all" && opt.later) {
            const t = Date.parse(opt.start);
            if (!Number.isFinite(t)) { say("Choose when it starts, or set Starts to Now.", true); return; }
            if (t <= Date.now()) { say("That start time has already passed. Pick a later one, or set Starts to Now.", true); return; }
            startAt = new Date(t).toISOString();
        }
        const who = audience === "all"
            ? escapeHtml(reachLine())
            : chosen.length === 1 ? `<strong>${escapeHtml(chosen[0].name)}</strong>` : `<strong>${chosen.length} players</strong>`;
        const question = audience === "all" ? `Send this? ${who}` : `Send this to ${who}?`;
        const mine = sessionNo;
        if (!(await ask(`${question}<br><br>"${noticeHtml(text)}"`))) return;
        /* Signed out, or somebody else in, while the box was up (10 Oct
           2026, the bug scan): this was the last account's message, and is
           not sent under the next one's token. */
        if (mine !== sessionNo || busy) return;
        busy = true;
        renderCompose();
        say("Sending…");
        try {
            await Api.sendNotification(token(), Object.assign({ text, audience, to: audience === "players" ? chosen.map(c => c.id) : [] },
                audience === "all" ? { activeDays: opt.days, who: opt.who, quiet: opt.quiet, ...(startAt ? { startAt } : {}) } : {}));
            if (mine !== sessionNo) return;
            draft = "";
            chosen = [];
            results = [];
            busy = false;
            renderCompose();
            say("Sent. It shows on their next visit.");
            load();
        } catch (err) {
            if (mine !== sessionNo) return;
            busy = false;
            renderCompose();
            if (sessionGone(err)) return;
            say(errText(err), true);
        }
    }

    // -------------------------------------------------------------- list

    function renderList() {
        if (loading && !notices) { listEl.innerHTML = `<p class="admin-empty">Loading…</p>`; return; }
        if (loadError && !notices) { listEl.innerHTML = `<p class="admin-empty">Couldn't read the notifications: ${escapeHtml(loadError)}</p>`; return; }
        if (!notices || !notices.length) { listEl.innerHTML = `<p class="admin-empty">Nothing sent yet.</p>`; return; }
        listEl.innerHTML = notices.map(n => {
            // Nobody left on a chosen-players notice: everyone it went to
            // has since asked to be forgotten (player-forget.js).
            const gone = n.audience !== "all" && !(n.to || []).length;
            const to = n.audience === "all" ? (WHO.find(w => w[0] === (n.who || "everyone")) || WHO[0])[1]
                : gone ? "players no longer here"
                : (n.to || []).length > 6 ? `${n.to.length} players` : (n.to || []).map(t => t.name).join(", ");
            const seen = n.audience === "all"
                ? `${n.seen} signed-in ${n.seen === 1 ? "player has" : "players have"} read it`
                : gone ? "no one left to read it"
                : `${n.seen} of ${(n.to || []).length} read`;
            /* Where an everyone-notice stands (its options; 5 Oct 2026):
               scheduled, live until a date (or for good), or ended. Older
               ones without the options ran for 30 days from sending. */
            const now = Date.now();
            const startT = Date.parse(n.at);
            const endT = n.endless ? Infinity : n.until ? Date.parse(n.until) : startT + 30 * 24 * 60 * 60 * 1000;
            const stand = n.audience !== "all" || n.withdrawn ? ""
                : startT > now ? `<span class="de-chip">Scheduled</span>`
                : endT <= now ? `<span class="de-chip">Ended</span>`
                : `<span class="de-chip is-marked">Live</span>`;
            const span = n.audience !== "all" ? ""
                : ` · ${startT > now ? "starts " + fmtUtc(n.at) + ", " : ""}${n.endless ? "until withdrawn" : "until " + fmtUtc(new Date(endT).toISOString())}${n.quiet ? " · quiet" : ""}`;
            // The message, then one line under it: chips and details on the
            // left, Withdraw on the right.
            return `
                <div class="chrome-list-row nt-row${n.withdrawn ? " is-withdrawn" : ""}${opened.has(n.nid) ? " is-open" : ""}" data-nid="${escapeHtml(n.nid)}" tabindex="0" role="button" aria-expanded="${opened.has(n.nid)}" title="Show who has read it">
                    <p class="nt-row-text">${noticeHtml(n.text)}</p>
                    <div class="nt-row-foot">
                        <p class="admin-hint nt-row-meta">
                            ${n.kind === "entry" ? `<span class="de-chip">Entry approved</span>` : ""}${n.withdrawn ? `<span class="de-chip de-status-rejected">Withdrawn</span>` : ""}${stand}
                            <span>To ${escapeHtml(to)} · ${escapeHtml(fmtUtc(n.sentAt || n.at))}${n.by ? ` · by ${escapeHtml(n.by)}` : ""}${escapeHtml(span)} · ${escapeHtml(seen)}</span>
                        </p>
                        ${!n.withdrawn && canWrite() ? `<button type="button" class="ctl-btn nt-withdraw" data-withdraw="${escapeHtml(n.nid)}">Withdraw</button>` : ""}
                    </div>
                    ${opened.has(n.nid) ? readersHtml(opened.get(n.nid)) : ""}
                </div>`;
        }).join("");
    }

    /* WHO HAS READ IT (5 Oct 2026, the owner's): a sent notification opens
       on a click (or Enter) to list its readers, asked for when opened and
       kept while the list is redrawn; a second click shuts it. Signed-in
       readers only: a signed-out visitor's read is kept in their browser. */
    const opened = new Map();   // nid -> { loading, readers, more, error }
    function readersHtml(r) {
        if (!r || r.loading) return `<div class="nt-readers"><p class="admin-hint">Loading who has read it…</p></div>`;
        if (r.error) return `<div class="nt-readers"><p class="admin-hint">${escapeHtml(r.error)}</p></div>`;
        if (!r.readers.length) return `<div class="nt-readers"><p class="admin-hint">Nobody has read it yet.</p></div>`;
        return `<div class="nt-readers"><p class="admin-hint">Read by ${r.readers.length}${r.more ? "+" : ""} signed-in ${r.readers.length === 1 ? "player" : "players"}:</p>
            <div class="nt-reader-list">${r.readers.map(p => `<span class="de-chip${p.nick ? "" : " nt-reader-nonick"}">${escapeHtml(p.name)}</span>`).join("")}</div>
            ${r.more ? `<p class="admin-hint">And more besides; the first ${r.readers.length} are shown.</p>` : ""}</div>`;
    }
    async function toggleReaders(nid) {
        if (opened.has(nid)) { opened.delete(nid); renderList(); return; }
        opened.set(nid, { loading: true });
        renderList();
        try {
            const data = await Api.getNotificationReaders(token(), nid);
            if (!opened.has(nid)) return;
            opened.set(nid, { readers: (data && data.readers) || [], more: !!(data && data.more) });
        } catch (err) {
            if (!opened.has(nid)) return;
            if (sessionGone(err)) { opened.delete(nid); return; }
            opened.set(nid, { error: "Couldn't read who has seen it: " + errText(err) });
        }
        renderList();
    }
    listEl.addEventListener("keydown", e => {
        if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("nt-row")) {
            e.preventDefault();
            toggleReaders(e.target.dataset.nid);
        }
    });

    listEl.addEventListener("click", async e => {
        const b = e.target.closest("[data-withdraw]");
        if (!b) {
            // Anywhere else on a row opens or shuts its readers.
            const row = e.target.closest(".nt-row[data-nid]");
            if (row && !e.target.closest(".nt-readers")) toggleReaders(row.dataset.nid);
            return;
        }
        if (b.disabled) return;
        if (!(await ask("Withdraw this notification? Anyone who hasn't read it yet won't see it."))) return;
        b.disabled = true;
        try {
            await Api.withdrawNotification(token(), b.dataset.withdraw);
            load();
        } catch (err) {
            b.disabled = false;
            if (sessionGone(err)) return;
            alert(errText(err));
        }
    });

    /* One read at a time, but a read asked for while one is out is not
       dropped: it runs when that one lands (5 Oct 2026, the bug scan — the
       read after a Send or a Withdraw was lost behind a Refresh, and the
       older answer drew a withdrawn notice as still live). loadGen throws
       away an answer that set off before a reset. */
    let loadGen = 0;
    let again = false;
    async function load() {
        if (!token()) return;
        if (loading) { again = true; return; }
        const mine = ++loadGen;
        loading = true;
        loadError = "";
        renderList();
        try {
            const data = await Api.getNotifications(token());
            if (mine !== loadGen) return;
            notices = (data && data.notices) || [];
        } catch (err) {
            if (mine !== loadGen) return;
            if (sessionGone(err)) return;
            loadError = errText(err);
        } finally {
            if (mine === loadGen) loading = false;
        }
        renderList();
        if (again) { again = false; load(); }
    }

    if (refreshBtn) refreshBtn.addEventListener("click", () => load());

    /* Called by js/admin.js (resetAccountPanels) on a logout or when
       another account signs in (5 Oct 2026, the bug scan): the last
       admin's draft, chosen players and sent list — names and all — were
       left for whoever signed in next, view-only accounts included. */
    function reset() {
        sessionNo++;
        loadGen++;
        // The last account's options too (10 Oct 2026, the bug scan).
        Object.assign(opt, { days: 30, later: false, start: "", who: "everyone", quiet: false });
        loading = false;
        again = false;
        notices = null;
        opened.clear();
        loadError = "";
        audience = "all";
        chosen = [];
        draft = "";
        results = [];
        searchGen++;
        busy = false;
        if (composeEl) composeEl.innerHTML = "";
        if (listEl) listEl.innerHTML = "";
        if (!panel.hidden && token()) onShown();
    }
    window.AdminNotifications = { reset };

    function onShown() {
        if (panel.hidden || !token()) return;
        renderCompose();
        load();
    }
    new MutationObserver(onShown).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    if (!panel.hidden) onShown();
})();

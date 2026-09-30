/* ===========================================================
   Maze Rats — the Event Entries panel in /warren (30 Sept 2026)

   What visitors send through the console's Event Submission (home.html,
   js/console.js): the Habbo Origins username they entered under and one
   picture, with their Discord account if they were signed in. The store is
   netlify/functions/event-entries.js; the pictures sit under entries/ in the
   image store, which image.js serves only with an admin token — so, like
   Missing Pieces' screenshots, each is fetched here and shown from an
   object URL.

     ENTRIES GO TO  Which event a NEW entry is filed under: Automatic (the
                    one event whose dates say it is running now, none while
                    there are several or none), No event, Closed (none
                    taken at all, and the form says so), or one picked.
     THE FILTERS    By status (New, Reviewed, Winner, Rejected, All) and by
                    event.
     THE LIST       Newest first, a page at a time: the picture, the name,
                    the event, when, the status, and Mark reviewed / Winner /
                    Reject / Note / Delete for owners and admins. A view-only
                    account reads everything and is shown none of those.

   A file of its own, like js/admin-errors.js and js/admin-players.js,
   sharing the session token (the same localStorage key admin.js writes),
   Api's authenticated calls, and what admin.js lends on window:
   AdminLockOut, AdminRole, AdminConfirm, AdminPrompt and AdminAlert.
   Everything shown came from a stranger and is set as text, never markup.
   =========================================================== */
(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="entries"]');
    if (!panel || typeof Api === "undefined") return;

    const TOKEN_KEY = "mazerats_admin_token";
    const REFRESH_MS = 60 * 1000;

    const listEl = panel.querySelector("#entries-list");
    const filtersEl = panel.querySelector("#entries-filters");
    const openEl = panel.querySelector("#entries-open");
    const pagerEl = panel.querySelector("#entries-pager");
    const updatedEl = panel.querySelector("#entries-updated");
    const refreshBtn = panel.querySelector("#entries-refresh-btn");
    const navCount = document.getElementById("entries-nav-count");

    const STATUS_TABS = [["new", "New"], ["reviewed", "Reviewed"], ["winner", "Winner"], ["rejected", "Rejected"], ["all", "All"]];
    const STATUS_WORD = { new: "New", reviewed: "Reviewed", winner: "Winner", rejected: "Rejected" };

    // ------------------------------------------------------------- state

    let status = "new";
    let eventFilter = "";           // "" all, "none", or an event id
    let page = 0;
    let entries = [];
    let total = 0;
    let pageSize = 30;
    let counts = {};
    let config = { mode: "auto", eventId: null };
    let open = null;                // the event a new entry goes to now
    let events = [];                // [{ id, title }] from the archive
    let loadedAt = 0;
    let loadGen = 0;
    let sessionNo = 0;
    let busy = false;
    let flashTimer = null;
    let panelTimer = null;
    const imageUrls = new Map();    // key -> promise of an object URL

    // ----------------------------------------------------------- helpers

    function token() {
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function role() {
        try { return typeof window.AdminRole === "function" ? String(window.AdminRole() || "") : ""; } catch (e) { return ""; }
    }
    // The server refuses anybody else regardless; this only hides the buttons.
    function canWrite() {
        const r = role();
        if (r) return r === "owner" || r === "admin";
        return !document.body.classList.contains("is-viewer");
    }

    function sessionGone(err) {
        if (!err || err.status !== 401) return false;
        if (typeof window.AdminLockOut === "function") window.AdminLockOut();
        return true;
    }

    function ask(html, opts) {
        return typeof window.AdminConfirm === "function" ? window.AdminConfirm(html, opts) : Promise.resolve(false);
    }
    function askText(html, opts) {
        return typeof window.AdminPrompt === "function" ? window.AdminPrompt(html, opts) : Promise.resolve(null);
    }

    function flash(message, bad) {
        let el = panel.querySelector(".ee-flash");
        if (!el) {
            el = document.createElement("p");
            el.className = "ctl-status ee-flash";
            el.setAttribute("role", "status");
            listEl.parentNode.insertBefore(el, listEl);
        }
        el.textContent = message;
        el.classList.toggle("is-bad", Boolean(bad));
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { el.textContent = ""; }, 6000);
    }

    // Times in UTC, as everywhere else in the Warren; the tooltip adds yours.
    function when(iso) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return "";
        return new Date(t).toLocaleString("en-GB", {
            timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false
        }).replace(",", "") + " UTC";
    }
    function whenTitle(iso) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return "";
        return new Date(t).toLocaleString("en-GB", {
            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short"
        }) + " (your time)";
    }

    function eventTitle(id, fallback) {
        const ev = events.find(e => e.id === id);
        return (ev && ev.title) || fallback || id;
    }

    /* The pictures need the admin token, which an <img> cannot send. The
       promise is cached, not the URL, so two quick renders fetch once (see
       imageUrl in js/admin-dead-ends.js); a failure leaves the cache so a
       later render can try again. */
    function imageUrl(key) {
        if (!imageUrls.has(key)) {
            const pending = fetch(`/.netlify/functions/image?key=${encodeURIComponent(key)}`, {
                headers: { "x-admin-token": token() }
            }).then(async res => {
                if (!res.ok) {
                    const err = new Error(String(res.status));
                    err.status = res.status;
                    throw err;
                }
                return URL.createObjectURL(await res.blob());
            });
            pending.catch(() => { if (imageUrls.get(key) === pending) imageUrls.delete(key); });
            imageUrls.set(key, pending);
        }
        return imageUrls.get(key);
    }
    function dropImage(key) {
        const p = imageUrls.get(key);
        imageUrls.delete(key);
        if (p) p.then(u => URL.revokeObjectURL(u)).catch(() => {});
    }

    function button(label, onClick, extra) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `ctl-btn${extra ? " " + extra : ""}`;
        b.textContent = label;
        b.addEventListener("click", onClick);
        return b;
    }

    function setBadge(n) {
        if (!navCount) return;
        navCount.textContent = n ? String(n) : "";
        navCount.hidden = !n;
    }

    // ----------------------------------------------------------- loading

    async function loadEvents() {
        try {
            const data = await Api.getEventsFull(token());
            const list = Array.isArray(data) ? data : (data && (data.rooms || data.items)) || [];
            events = list.filter(e => e && e.id).map(e => ({ id: e.id, title: e.title || e.id, date: e.date || "" }))
                .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        } catch (err) {
            if (sessionGone(err)) throw err;
            // The filters fall back to the events the entries name.
        }
    }

    async function load(opts) {
        if (!token()) return;
        const gen = ++loadGen;
        const mine = sessionNo;
        if (!(opts && opts.auto)) {
            if (!entries.length) listEl.innerHTML = '<p class="admin-empty">Loading…</p>';
        }
        try {
            if (!events.length) await loadEvents();
            const data = await Api.getEventEntries(token(), { status, event: eventFilter, page });
            if (gen !== loadGen || mine !== sessionNo) return;
            entries = Array.isArray(data && data.entries) ? data.entries : [];
            total = Number(data && data.total) || 0;
            pageSize = Number(data && data.pageSize) || pageSize;
            counts = (data && data.counts) || {};
            config = (data && data.config) || config;
            open = (data && data.open) || null;
            loadedAt = Date.now();
            // A page emptied by deletes steps back rather than showing nothing.
            if (!entries.length && page > 0 && total > 0) { page = Math.max(0, Math.ceil(total / pageSize) - 1); return load(opts); }
            setBadge(Number(counts.new) || 0);
            render();
        } catch (err) {
            if (gen !== loadGen || mine !== sessionNo) return;
            if (sessionGone(err)) {
                listEl.innerHTML = '<p class="admin-empty">Your session expired before this loaded. Sign in again, then press Refresh.</p>';
                return;
            }
            listEl.innerHTML = "";
            const p = document.createElement("p");
            p.className = "admin-empty";
            p.textContent = `Could not load the entries: ${(err && err.message) || "something went wrong"}`;
            listEl.appendChild(p);
        }
    }

    // ------------------------------------------------------------ render

    function render() {
        renderOpen();
        renderFilters();
        renderList();
        renderPager();
        if (updatedEl) updatedEl.textContent = loadedAt ? `Updated ${when(new Date(loadedAt).toISOString())}` : "";
    }

    function eventOptions(selected, extra) {
        const known = events.slice();
        // An event only the entries name (deleted since, or not loaded).
        (extra || []).forEach(x => { if (x.id && !known.some(e => e.id === x.id)) known.push(x); });
        return known.map(e => `<option value="${escapeHtml(e.id)}"${e.id === selected ? " selected" : ""}>${escapeHtml(e.title)}</option>`).join("");
    }

    function renderOpen() {
        const value = config.mode === "event" && config.eventId ? "event:" + config.eventId : config.mode;
        const now = config.mode === "closed" ? "Entries are closed: the console's form says so, and nothing is taken."
            : open && open.title ? `New entries go to ${open.title}.` : "New entries are not filed under any event right now.";
        /* The picked event is always an option (30 Sept 2026). With the
           archive unread (loadEvents failed) or the event since deleted, it
           had none, and the box showed Automatic while entries went to it. */
        const choices = events.slice();
        if (config.mode === "event" && config.eventId && !choices.some(e => e.id === config.eventId)) {
            choices.push({ id: config.eventId, title: (open && open.id === config.eventId && open.title) || config.eventId });
        }
        openEl.innerHTML = `
            <label class="ctl-label" for="entries-open-select">Entries go to</label>
            <div class="sort-box">
                <select id="entries-open-select"${canWrite() ? "" : " disabled"}>
                    <option value="auto"${value === "auto" ? " selected" : ""}>Automatic (the event running now)</option>
                    <option value="none"${value === "none" ? " selected" : ""}>No event</option>
                    <option value="closed"${value === "closed" ? " selected" : ""}>Closed (no entries taken)</option>
                    ${choices.map(e => `<option value="event:${escapeHtml(e.id)}"${value === "event:" + e.id ? " selected" : ""}>${escapeHtml(e.title)}</option>`).join("")}
                </select>
            </div>
            <span class="admin-hint ee-open-now">${escapeHtml(now)}</span>`;
    }

    openEl.addEventListener("change", async e => {
        if (e.target.id !== "entries-open-select" || !canWrite()) return;
        const v = e.target.value;
        const body = v.startsWith("event:") ? { mode: "event", eventId: v.slice(6) } : { mode: v };
        e.target.disabled = true;
        try {
            const out = await Api.setEventEntryOpen(token(), body);
            config = (out && out.config) || config;
            open = (out && out.open) || null;
            flash(config.mode === "closed" ? "Entries are closed now."
                : open && open.title ? `New entries now go to ${open.title}.` : "New entries are not filed under any event now.");
        } catch (err) {
            if (!sessionGone(err)) flash(`Not changed: ${(err && err.message) || "something went wrong"}`, true);
        }
        renderOpen();
    });

    function renderFilters() {
        const seen = entries.filter(x => x.eventId).map(x => ({ id: x.eventId, title: x.eventTitle || x.eventId }));
        const sum = STATUS_TABS.slice(0, 4).reduce((n, [k]) => n + (Number(counts[k]) || 0), 0);
        filtersEl.innerHTML = `
            <div class="ctl-seg" role="group" aria-label="Which entries">
                ${STATUS_TABS.map(([k, label]) => {
                    const n = k === "all" ? sum : Number(counts[k]) || 0;
                    return `<button type="button" class="btn-enter-mini${k === status ? " active" : ""}" data-status="${k}" aria-pressed="${k === status}">${escapeHtml(label)}${n ? ` (${n})` : ""}</button>`;
                }).join("")}
            </div>
            <div class="sort-box">
                <select data-f="event" aria-label="Which event">
                    <option value=""${eventFilter === "" ? " selected" : ""}>Every event</option>
                    <option value="none"${eventFilter === "none" ? " selected" : ""}>No event</option>
                    ${eventOptions(eventFilter, seen)}
                </select>
            </div>`;
    }

    filtersEl.addEventListener("click", e => {
        const b = e.target.closest("[data-status]");
        if (!b || b.dataset.status === status) return;
        status = b.dataset.status;
        page = 0;
        load();
    });
    filtersEl.addEventListener("change", e => {
        if (e.target.dataset.f !== "event") return;
        eventFilter = e.target.value;
        page = 0;
        load();
    });

    function renderList() {
        listEl.innerHTML = "";
        if (!entries.length) {
            const p = document.createElement("p");
            p.className = "admin-empty";
            p.textContent = status === "new" && !eventFilter ? "No new entries." : "Nothing here.";
            listEl.appendChild(p);
            return;
        }
        entries.forEach(entry => listEl.appendChild(row(entry)));
    }

    /* Built from nodes, not markup: every word here came from a visitor. */
    function row(entry) {
        const r = document.createElement("div");
        r.className = "chrome-list-row admin-row ee-row";
        r.dataset.status = entry.status || "new";

        // The picture, opened full size in a new tab from its object URL.
        const key = entry.image && entry.image.key;
        const shot = document.createElement("a");
        shot.className = "de-shot ee-shot";
        shot.target = "_blank";
        shot.rel = "noopener";
        shot.title = "Open the full picture";
        if (key) {
            const im = document.createElement("img");
            im.alt = `Entry from ${entry.habboName || "someone"}`;
            im.loading = "lazy";
            shot.appendChild(im);
            imageUrl(key)
                .then(url => { im.src = url; shot.href = url; })
                .catch(err => {
                    if (sessionGone(err)) return;
                    shot.classList.add("is-missing");
                    shot.textContent = "gone";
                });
        } else {
            shot.classList.add("is-missing");
            shot.textContent = "no picture";
        }
        r.appendChild(shot);

        const info = document.createElement("div");
        info.className = "row-info";
        const h = document.createElement("h3");
        h.appendChild(document.createTextNode(entry.habboName || "(no name)"));
        const meta = document.createElement("span");
        meta.className = "admin-contributor-count";
        const evName = entry.eventId ? eventTitle(entry.eventId, entry.eventTitle) : "No event";
        meta.appendChild(document.createTextNode(` - ${evName} · `));
        const t = document.createElement("time");
        t.dateTime = entry.createdAt || "";
        t.title = whenTitle(entry.createdAt);
        t.textContent = when(entry.createdAt);
        meta.appendChild(t);
        h.appendChild(meta);
        info.appendChild(h);

        const chips = document.createElement("div");
        chips.className = "de-chips";
        const chip = document.createElement("span");
        chip.className = `de-chip ee-status-${entry.status || "new"}`;
        chip.textContent = STATUS_WORD[entry.status] || "New";
        chips.appendChild(chip);
        info.appendChild(chips);

        const who = document.createElement("p");
        who.className = "de-lead-who";
        if (entry.from) {
            const handle = entry.from.username && entry.from.name ? ` @${entry.from.username}` : "";
            who.textContent = `Discord: ${entry.from.name || entry.from.username || "an account"}${handle} (signed in)`;
        } else {
            who.textContent = "Not signed in";
        }
        info.appendChild(who);

        if (entry.reviewedBy || entry.note) {
            const rv = document.createElement("p");
            rv.className = "de-lead-who";
            const by = entry.reviewedBy ? `${STATUS_WORD[entry.status] || "Changed"} by ${entry.reviewedBy}` : "";
            rv.textContent = [by, entry.note ? `Note: ${entry.note}` : ""].filter(Boolean).join(" · ");
            info.appendChild(rv);
        }
        r.appendChild(info);

        if (canWrite()) {
            const actions = document.createElement("div");
            actions.className = "admin-row-actions";
            const st = entry.status || "new";
            if (st !== "reviewed") actions.appendChild(button("Mark reviewed", () => setStatus(entry, "reviewed")));
            if (st !== "winner") actions.appendChild(button("Winner", () => setStatus(entry, "winner")));
            if (st !== "rejected") actions.appendChild(button("Reject", () => setStatus(entry, "rejected")));
            if (st !== "new") actions.appendChild(button("Back to new", () => setStatus(entry, "new")));
            actions.appendChild(button("Note…", () => editNote(entry)));
            actions.appendChild(button("Delete", () => remove(entry), "admin-delete-btn"));
            r.appendChild(actions);
        }
        return r;
    }

    function renderPager() {
        if (!entries.length) { pagerEl.innerHTML = ""; return; }
        const from = page * pageSize + 1;
        const to = page * pageSize + entries.length;
        pagerEl.innerHTML = `
            <span class="admin-hint">Showing ${from}–${to} of ${total}</span>
            <button type="button" class="ctl-btn" data-page="prev"${page > 0 ? "" : " disabled"}>Previous</button>
            <button type="button" class="ctl-btn" data-page="next"${to < total ? "" : " disabled"}>Next</button>`;
    }
    pagerEl.addEventListener("click", e => {
        const b = e.target.closest("[data-page]");
        if (!b || b.disabled) return;
        page = b.dataset.page === "next" ? page + 1 : Math.max(0, page - 1);
        load().then(() => panel.scrollIntoView({ block: "start", behavior: "smooth" }));
    });

    // ------------------------------------------------------------ writes

    async function setStatus(entry, next) {
        if (busy || !canWrite()) return;
        busy = true;
        try {
            await Api.updateEventEntry(token(), entry.id, { status: next });
            flash(next === "winner" ? `${entry.habboName || "That entry"} is marked as a winner.` : `Marked ${STATUS_WORD[next].toLowerCase()}.`);
        } catch (err) {
            busy = false;
            if (!sessionGone(err)) flash(`Not saved: ${(err && err.message) || "something went wrong"}`, true);
            return;
        }
        busy = false;
        await load();
    }

    async function editNote(entry) {
        if (busy || !canWrite()) return;
        const note = await askText(`A note on ${escapeHtml(entry.habboName || "this entry")}'s entry, for the admins only.`,
            { title: "Entry Note", label: "Note", maxlength: 500, value: entry.note || "" });
        if (note === null) return;
        busy = true;
        try {
            await Api.updateEventEntry(token(), entry.id, { note: note.trim() });
            flash("Note saved.");
        } catch (err) {
            busy = false;
            if (!sessionGone(err)) flash(`Not saved: ${(err && err.message) || "something went wrong"}`, true);
            return;
        }
        busy = false;
        await load();
    }

    async function remove(entry) {
        if (busy || !canWrite()) return;
        const ok = await ask(`Delete ${escapeHtml(entry.habboName || "this")}'s entry and its picture? This cannot be undone.`, { danger: true });
        if (!ok) return;
        busy = true;
        try {
            await Api.deleteEventEntry(token(), entry.id);
            if (entry.image && entry.image.key) dropImage(entry.image.key);
            flash("Entry deleted.");
        } catch (err) {
            busy = false;
            if (!sessionGone(err)) flash(`Not deleted: ${(err && err.message) || "something went wrong"}`, true);
            return;
        }
        busy = false;
        await load();
    }

    if (refreshBtn) refreshBtn.addEventListener("click", () => { events = []; load(); });

    // ------------------------------------------------------------ timers

    // Re-read every minute while the panel and the browser tab are showing.
    function onShownChange() {
        if (panel.hidden) { clearInterval(panelTimer); panelTimer = null; return; }
        if (!token()) return;
        if (!panelTimer) {
            panelTimer = setInterval(() => {
                if (panel.hidden || document.hidden || !token() || busy) return;
                load({ auto: true });
            }, REFRESH_MS);
        }
        if (!loadedAt || Date.now() - loadedAt > REFRESH_MS) load();
        else render();
    }
    new MutationObserver(onShownChange).observe(panel, { attributes: true, attributeFilter: ["hidden"] });

    /* The badge: entries nobody has looked at, read on its own once Warren
       has signed in, as Missing Pieces' is. One small count. */
    async function badge() {
        if (!token() || !navCount) return;
        const mine = sessionNo;
        try {
            const data = await Api.getEventEntries(token(), { status: "new" });
            if (mine !== sessionNo) return;
            counts = (data && data.counts) || counts;
            setBadge(Number(counts.new) || 0);
        } catch (e) { /* the panel says so when opened */ }
    }
    const rail = document.getElementById("admin-rail");
    if (rail) {
        // admin.js reveals the rail once the session is verified.
        const once = new MutationObserver(() => {
            if (rail.style.display !== "none") { once.disconnect(); badge(); }
        });
        once.observe(rail, { attributes: true, attributeFilter: ["style"] });
        if (rail.style.display !== "none") { once.disconnect(); badge(); }
    }

    /* Forget everything the last account read — admin.js calls this on log
       out and when somebody else signs in over an expired session. The
       pictures were fetched with the last token, and go with it. */
    function reset() {
        loadGen++;
        sessionNo++;
        clearInterval(panelTimer);
        panelTimer = null;
        status = "new";
        eventFilter = "";
        page = 0;
        entries = [];
        total = 0;
        counts = {};
        config = { mode: "auto", eventId: null };
        open = null;
        events = [];
        loadedAt = 0;
        busy = false;
        const urls = Array.from(imageUrls.values());
        imageUrls.clear();
        urls.forEach(p => p.then(u => URL.revokeObjectURL(u)).catch(() => {}));
        listEl.innerHTML = "";
        filtersEl.innerHTML = "";
        openEl.innerHTML = "";
        pagerEl.innerHTML = "";
        if (updatedEl) updatedEl.textContent = "";
        setBadge(0);
        if (!token()) return;
        onShownChange();
        badge();
    }
    window.AdminEntries = { reset };

    onShownChange();
})();

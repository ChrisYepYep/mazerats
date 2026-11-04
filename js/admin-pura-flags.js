/* ===========================================================
   Maze Rats — Pura Panic's "Scores to look at", in the Warren's Pura Panic
   tab (3 Nov 2026, the owner's: flag outliers so he can review them and act
   himself, rather than slow the game down for everybody).

   netlify/functions/pura-flags.js judges every board row and says why in
   plain English; this only draws it and sends the two decisions: It's fine
   (the flag stops showing) and Take off the board (the score is removed;
   Undo puts it back). The nav badge counts the flags waiting, read once
   Warren has signed in, as Event Entries' is.

   A file of its own, like js/admin-entries.js: it shares the session token,
   Api's authenticated request (Api._write, so js/api.js and its ?v= stay as
   they are) and admin.js's AdminLockOut, AdminRole and AdminConfirm. The
   panel's Refresh re-reads it with the figures; a decision re-reads both.
   A view-only account sees the flags and none of the buttons (the server
   refuses them regardless).
   =========================================================== */
(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="puradata"]');
    const box = document.getElementById("pura-flags");
    if (!panel || !box || typeof Api === "undefined") return;

    const TOKEN_KEY = "mazerats_admin_token";
    const URL_ = "/.netlify/functions/pura-flags";
    const tableBody = box.querySelector("#pura-flags-table tbody");
    const countEl = document.getElementById("pura-flags-count");
    const statusEl = document.getElementById("pura-flags-status");
    const dealtEl = document.getElementById("pura-flags-dealt");
    const dealtBody = dealtEl ? dealtEl.querySelector("tbody") : null;
    const dealtCount = document.getElementById("pura-flags-dealt-count");
    const navCount = document.getElementById("pura-nav-count");
    const refreshBtn = document.getElementById("pura-refresh-btn");

    let data = null;
    let loadGen = 0;
    let sessionNo = 0;
    let busy = false;
    let statusTimer = null;

    function token() {
        if (typeof window.AdminToken === "function") return window.AdminToken() || "";
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
    const num = n => Number(n || 0).toLocaleString("en-GB");
    // As the tab's other tables write a length (admin.js ffClock) and a date (ffDate, UTC with the label).
    function clock(ms) {
        if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return "—";
        const total = Math.max(0, Math.round(Number(ms) / 1000));
        const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
        const pad = n => String(n).padStart(2, "0");
        return h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
    }
    function date(iso) {
        const d = new Date(iso);
        if (!iso || isNaN(d)) return "—";
        return d.toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "") + " UTC";
    }
    function say(text, bad) {
        if (!statusEl) return;
        statusEl.textContent = text || "";
        statusEl.classList.toggle("is-bad", Boolean(bad));
        clearTimeout(statusTimer);
        if (text) statusTimer = setTimeout(() => { statusEl.textContent = ""; }, 9000);
    }
    function setBadge(n) {
        if (!navCount) return;
        navCount.textContent = n ? num(n) : "";
        navCount.hidden = !n;
        navCount.setAttribute("title", n ? `${num(n)} Pura Panic ${n === 1 ? "score" : "scores"} to look at` : "Pura Panic scores to look at");
    }

    // The server's clock, and where it came from (pura-flags.js judgeAll).
    function wallCell(f) {
        if (f.wall === null || f.wall === undefined) return '<span class="admin-hint" title="Saved before the server kept it, and its start was not logged">not known</span>';
        return clock(f.wall) + (f.wallFrom === "start" ? ' <span class="admin-hint" title="Worked out from when Play was pressed">(from the start)</span>' : "");
    }

    function render() {
        if (!data) return;
        const open = data.open || [];
        const writer = canWrite();
        if (countEl) countEl.textContent = open.length ? "· " + num(open.length) + " waiting" : "· nothing waiting";
        setBadge(open.length);
        tableBody.innerHTML = open.length ? open.map(f => '<tr>' +
            '<td>' + escapeHtml(f.place || "") + '</td>' +
            '<td>' + escapeHtml(f.name || "Someone") +
                (f.guest ? ' <span class="admin-hint">signed out</span>' : "") +
                (f.hidden ? ' <span class="admin-hint">already hidden from the board (banned or no nickname)</span>' : "") + '</td>' +
            '<td class="ff-num">' + num(f.score) + '</td>' +
            '<td class="ff-num">' + escapeHtml(f.level) + '</td>' +
            '<td class="ff-num">' + num(f.pieces) + '</td>' +
            '<td class="ff-num">' + clock(f.ms) + '</td>' +
            '<td class="ff-num">' + wallCell(f) + '</td>' +
            '<td>' + date(f.at) + '</td>' +
        '</tr>' +
        '<tr class="pf-why"><td></td><td colspan="7">' +
            /* Marked fine before at a lower score, and the same game has
               saved a better one since (3 Nov 2026, the bug scan): open again. */
            (f.fine ? '<p class="admin-hint">Flagged again: marked as fine at ' + escapeHtml(num(f.fine.score)) + ' points' +
                (f.fine.by ? ' by ' + escapeHtml(f.fine.by) : "") + (f.fine.when ? ' (' + escapeHtml(date(f.fine.when)) + ')' : "") +
                ', and the same game has saved ' + escapeHtml(num(f.score)) + ' since.</p>' : "") +
            '<ul class="pf-reasons">' + (f.reasons || []).map(r => '<li>' + escapeHtml(r.text) + '</li>').join("") + '</ul>' +
            (writer ? '<div class="ctl-actions">' +
                '<button type="button" class="ctl-btn" data-pf="ok" data-key="' + escapeHtml(f.key) + '"' + (busy ? " disabled" : "") + ' title="Looked at, and it\'s a real game: the flag stops showing">It\'s fine</button>' +
                '<button type="button" class="ctl-btn admin-delete-btn" data-pf="remove" data-key="' + escapeHtml(f.key) + '"' + (busy ? " disabled" : "") + ' title="Remove this score from the public board">Take off the board…</button>' +
            '</div>' : "") +
        '</td></tr>').join("") : '<tr><td colspan="8" class="admin-empty">Nothing on the board looks out of line.</td></tr>';

        const dealt = data.dealt || [];
        if (dealtEl && dealtBody) {
            dealtEl.hidden = !dealt.length;
            if (dealtCount) dealtCount.textContent = dealt.length ? "(" + num(dealt.length) + ")" : "";
            dealtBody.innerHTML = dealt.map(d => '<tr>' +
                '<td>' + escapeHtml(d.name || "Someone") + '</td>' +
                '<td class="ff-num">' + num(d.score) + '</td>' +
                '<td>' + (d.status === "removed" ? "Taken off the board" : "Marked as fine") +
                    (d.flaggedAgain ? ' <span class="admin-hint" title="The same game has saved a better score since: it is in the list above again">(flagged again)</span>' : "") +
                    (d.reasons && d.reasons.length ? ' <span class="admin-hint" title="' + escapeHtml(d.reasons.join(" ")) + '">(why)</span>' : "") + '</td>' +
                '<td>' + escapeHtml(d.by || "—") + '</td>' +
                '<td>' + date(d.when) + '</td>' +
                '<td>' + (writer ? '<button type="button" class="ctl-btn" data-pf="undo" data-key="' + escapeHtml(d.key) + '"' + (busy ? " disabled" : "") + '>' +
                    (d.status === "removed" ? "Put back" : "Undo") + '</button>' : "") + '</td>' +
            '</tr>').join("");
        }
    }

    async function load() {
        if (!token()) return;
        const gen = ++loadGen;
        const used = token();
        try {
            const d = await Api._write(URL_, "GET", used);
            if (gen !== loadGen) return;
            data = d || { open: [], dealt: [] };
            render();
        } catch (err) {
            if (gen !== loadGen) return;
            if (sessionGone(err)) return;
            tableBody.innerHTML = '<tr><td colspan="8" class="admin-empty">' + escapeHtml((err && err.message) || "Couldn't read the flags.") + '</td></tr>';
        }
    }

    async function decide(action, key) {
        if (busy || !key) return;
        const f = (data && (data.open || []).find(x => x.key === key)) || (data && (data.dealt || []).find(x => x.key === key)) || {};
        if (action === "remove") {
            const ok = await ask(`Take <strong>${escapeHtml(f.name || "this player")}</strong>'s ${escapeHtml(num(f.score))} points off the Pura Panic board? That game can't be saved to the board again; their next game can. Undo puts it back.`);
            if (!ok) return;
        }
        const mine = sessionNo;
        busy = true;
        render();
        try {
            const out = await Api._write(URL_, "POST", token(), { key, action });
            if (mine !== sessionNo) return;
            say((out && out.message) || "Done.");
        } catch (err) {
            if (mine !== sessionNo) return;
            if (sessionGone(err)) return;
            say((err && err.message) || "That didn't work. Try again in a moment.", true);
        } finally {
            if (mine === sessionNo) {
                busy = false;
                // The figures and board too, as Refresh does (and that re-reads this).
                if (refreshBtn) refreshBtn.click(); else load();
            }
        }
    }

    box.addEventListener("click", e => {
        const b = e.target.closest("[data-pf]");
        if (!b || b.disabled) return;
        decide(b.dataset.pf, b.dataset.key);
    });
    if (refreshBtn) refreshBtn.addEventListener("click", load);
    // Read whenever the tab is opened, as the figures are the first time.
    new MutationObserver(() => { if (!panel.hidden) load(); }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });

    /* The badge, read on its own once Warren has signed in (and again on
       every sign-in after), as Event Entries' is. */
    const rail = document.getElementById("admin-rail");
    if (rail) {
        let railShown = false;
        const railSeen = () => {
            const on = rail.style.display !== "none";
            if (on && !railShown) load();
            railShown = on;
        };
        new MutationObserver(railSeen).observe(rail, { attributes: true, attributeFilter: ["style"] });
        railSeen();
    }

    // Forget everything the last account read: admin.js calls this on log out.
    function reset() {
        loadGen++;
        sessionNo++;
        busy = false;
        data = null;
        tableBody.innerHTML = "";
        if (dealtBody) dealtBody.innerHTML = "";
        if (dealtEl) dealtEl.hidden = true;
        if (countEl) countEl.textContent = "";
        say("");
        setBadge(0);
        if (!token()) return;
        load();
    }
    window.AdminPuraFlags = { reset };
})();

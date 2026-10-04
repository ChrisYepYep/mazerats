/* ===========================================================
   Maze Rats — the Errors panel in /warren (28 Sept 2026)

   What went wrong for visitors, and in our own functions, in the days
   around launch. The site's capture script reports each failure; the
   server (netlify/functions/site-errors.js) folds reports of the same
   problem into one GROUP, so a bug a thousand people hit is one row with
   a count of a thousand rather than a thousand rows. This panel is how
   those groups are read and triaged.

     THE STRIP    Totals, how many reports the rate limit threw away, when
                  the list was last read, and a Refresh. Re-read every 60s
                  while the panel is on screen and the browser tab is.

     THE LIST     One row per group: what kind of failure, the message,
                  where it came from, how often and to how many visitors,
                  first and last seen, a 24-hour sparkline, and the browser
                  and device most of it happened on.

     THE DETAIL   Opened under a row. Everything the server kept: the full
                  message and source, a 60-day and a 48-hour chart, what it
                  happened ON (browsers, systems, devices, pages, countries,
                  builds, themes) as small tables, and the last twenty
                  occurrences with every field the browser sent — the stack,
                  and the trail of clicks and requests that led up to it.

   Owners and admins can resolve, ignore and annotate; the owner alone can
   delete. A view-only account reads everything and is shown none of the
   buttons that would only be refused (the server refuses regardless).

   Everything shown here arrived from the internet — a message, a stack,
   a page title — and is escaped on the way in (escapeHtml below) or set as
   text. Nothing is ever put on the page as markup.

   A file of its own, like js/admin-dead-ends.js and js/admin-guides.js. It
   shares the session token (the same localStorage key admin.js writes),
   Api's authenticated calls, and three things admin.js lends out on
   window: AdminLockOut (a 401 puts the sign-in box up), AdminRole (who is
   signed in) and AdminConfirm (the page's own Yes/No dialog).

   Written to a contract agreed before the endpoint existed, so every
   field is read defensively: a field missing, renamed or of another shape
   shows "—" rather than taking the panel down on launch morning.
   =========================================================== */
(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="errors"]');
    if (!panel || typeof Api === "undefined") return;

    const TOKEN_KEY = "mazerats_admin_token";
    const REFRESH_MS = 60 * 1000;
    const LIST_LIMIT = 200;
    // The badge counts every open group seen in the last day; asked for
    // with a larger limit so a busy morning is not undercounted.
    const BADGE_LIMIT = 500;
    const HOUR = 3600 * 1000;
    const DAY = 24 * HOUR;

    const listEl = panel.querySelector("#errors-list");
    const summaryEl = panel.querySelector("#errors-summary");
    const filtersEl = panel.querySelector("#errors-filters");
    const bulkEl = panel.querySelector("#errors-bulk");
    const updatedEl = panel.querySelector("#errors-updated");
    const refreshBtn = panel.querySelector("#errors-refresh-btn");
    const navCount = document.getElementById("errors-nav-count");

    /* The capture script's kinds (and the server's "function"), in the words the owner uses rather
       than the browser's. The long form is the pill's tooltip. */
    const KINDS = {
        error: { label: "Page", long: "A script on the page threw an error" },
        rejection: { label: "Promise", long: "A promise was rejected and nothing caught it" },
        resource: { label: "Load failure", long: "A picture, script or stylesheet failed to load" },
        fetch: { label: "Server call", long: "A call to our server failed, or answered 5xx" },
        console: { label: "Console", long: "Something wrote console.error" },
        handled: { label: "Caught", long: "Code caught an error and reported it" },
        function: { label: "Function", long: "A server function crashed or answered 5xx" }
    };
    const KIND_ORDER = ["error", "rejection", "resource", "fetch", "console", "handled", "function"];
    const STATUSES = [["open", "Open"], ["resolved", "Resolved"], ["ignored", "Ignored"], ["all", "All"]];
    const SORTS = [["last", "Most recent"], ["count", "Most frequent"], ["visitors", "Most visitors"], ["first", "Newest"]];

    // ------------------------------------------------------------- state

    let filtersBuilt = false;
    let status = "open";
    let kind = "all";
    let query = "";
    let sort = "last";

    let groups = [];
    let totals = {};
    let dropped = {};
    // The site-wide rate limit's refusals (netlify/functions/_ratelimit.js).
    let limited = {};
    let loadedAt = 0;               // Date.now() of the last good list read
    let loadError = null;           // the last list read's failure, if any
    let loadGen = 0;
    let skew = 0;                   // server clock minus ours, from `now`

    let openId = null;              // the group whose detail is open
    const details = new Map();      // id -> the full group, from getSiteError
    const detailErrors = new Map(); // id -> message, when that read failed
    let detailNode = null;          // the open detail's element, kept across list redraws
    let detailNodeFor = "";         // `${id}|${version}` it was built for
    const openSamples = new Set();  // "groupId#index" of samples left expanded
    const noteDrafts = new Map();   // id -> unsaved note text
    const selected = new Set();     // ids ticked for a bulk action
    let busy = false;               // a write is in flight
    let sessionNo = 0;              // moved on by reset(), so old answers are dropped

    let panelTimer = null;
    let badgeTimer = null;
    let searchTimer = null;
    let flashTimer = null;
    let pendingRender = false;

    // ----------------------------------------------------------- helpers

    function token() {
        // This tab's own session from js/admin.js (3 Oct 2026), not whatever
        // another tab last stored — see window.AdminToken there.
        if (typeof window.AdminToken === "function") return window.AdminToken() || "";
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function has(v) {
        return !(v == null || v === "" || (typeof v === "number" && !Number.isFinite(v)));
    }

    // A value for display, "—" when there is none.
    function dash(v) { return has(v) ? String(v) : "—"; }

    function num(n) {
        const x = Number(n);
        return Number.isFinite(x) ? x.toLocaleString("en-GB") : "—";
    }

    function apiReady() {
        return typeof Api.getSiteErrors === "function";
    }

    /* Who is signed in. admin.js lends AdminRole; on a page without it the
       body class is the only word on the matter, and nothing is taken to be
       the owner's — the server is the one that decides either way. */
    function role() {
        try { return typeof window.AdminRole === "function" ? String(window.AdminRole() || "") : ""; } catch (e) { return ""; }
    }
    function canWrite() {
        const r = role();
        if (r) return r === "owner" || r === "admin";
        return !document.body.classList.contains("is-viewer");
    }
    function isOwner() { return role() === "owner"; }

    /* 401: the twelve-hour session ran out. admin.js puts the sign-in box up
       over the page, as it does for every other panel (see sessionGone in
       js/admin-dead-ends.js); the panel stays as it was underneath. */
    function sessionGone(err) {
        if (!err || err.status !== 401) return false;
        if (typeof window.AdminLockOut === "function") window.AdminLockOut();
        return true;
    }

    function errText(err) {
        if (err && err.status === 403) return "Only the owner can do that";
        return (err && err.message) || "Something went wrong";
    }

    // ------------------------------------------------------------- times

    /* Every time on this panel is shown in UTC, which is what the daily
       games, the launch countdown and the event fields in Warren all count
       in — so "14:02" here is the same 14:02 as anywhere else in the admin.
       The tooltip gives the exact second in UTC and in the reader's own
       zone, because a report from a visitor says "about 3pm my time". */
    function nowMs() { return Date.now() + skew; }

    function ms(iso) {
        if (iso == null || iso === "") return NaN;
        const t = typeof iso === "number" ? iso : Date.parse(iso);
        return Number.isFinite(t) ? t : NaN;
    }

    function fmtUtc(iso) {
        const t = ms(iso);
        if (!Number.isFinite(t)) return "—";
        return new Date(t).toLocaleString("en-GB", {
            timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false
        }).replace(",", "") + " UTC";
    }

    function fmtUtcFull(iso) {
        const t = ms(iso);
        if (!Number.isFinite(t)) return "—";
        return new Date(t).toLocaleString("en-GB", {
            timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
        }) + " UTC";
    }

    function fmtLocalFull(iso) {
        const t = ms(iso);
        if (!Number.isFinite(t)) return "—";
        return new Date(t).toLocaleString("en-GB", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short"
        });
    }

    function ago(iso) {
        const t = ms(iso);
        if (!Number.isFinite(t)) return "—";
        const s = Math.round((nowMs() - t) / 1000);
        // A report stamped a moment ahead of us is clock drift, not the future.
        if (s < 10) return "just now";
        if (s < 60) return s + "s ago";
        const m = Math.round(s / 60);
        if (m < 60) return m + " min ago";
        const h = Math.round(s / 3600);
        if (h < 48) return h + " h ago";
        const d = Math.round(s / 86400);
        return d + " days ago";
    }

    function timeTitle(iso) {
        if (!Number.isFinite(ms(iso))) return "";
        return fmtUtcFull(iso) + "\n" + fmtLocalFull(iso) + " (your time)";
    }

    // "3 min ago", with the exact moment in the tooltip. data-ago lets the
    // one-minute tick update the words without redrawing anything.
    function timeTag(iso) {
        if (!Number.isFinite(ms(iso))) return "—";
        return `<time datetime="${escapeHtml(new Date(ms(iso)).toISOString())}" data-ago="${escapeHtml(iso)}" title="${escapeHtml(timeTitle(iso))}">${escapeHtml(ago(iso))}</time>`;
    }

    function refreshAgo() {
        panel.querySelectorAll("[data-ago]").forEach(el => { el.textContent = ago(el.getAttribute("data-ago")); });
    }

    function fmtDuration(msVal) {
        const x = Number(msVal);
        if (!Number.isFinite(x) || x < 0) return "—";
        if (x < 1000) return (x / 1000).toFixed(1) + "s";
        if (x < 60000) return (x / 1000).toFixed(1) + "s";
        const s = Math.round(x / 1000);
        if (s < 3600) return Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + "s";
        return Math.floor(s / 3600) + " h " + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + " min";
    }

    const pad2 = n => String(n).padStart(2, "0");
    function dayKey(t) {
        const d = new Date(t);
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
    function hourKey(t) {
        return `${dayKey(t)}T${pad2(new Date(t).getUTCHours())}`;
    }
    function dayLabel(t) {
        return new Date(t).toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
    }
    function hourLabel(t) {
        return dayLabel(t) + " " + pad2(new Date(t).getUTCHours()) + ":00";
    }

    // ------------------------------------------------------------- shapes

    /* A breakdown arrives as [[value, n], ...] in the list and {value: n} in
       the detail; either is taken, and so is [{value, n}] should the server
       settle on that. Always answers [[label, n], ...], biggest first. */
    function pairs(src) {
        let out = [];
        if (Array.isArray(src)) {
            out = src.map(p => Array.isArray(p) ? [p[0], Number(p[1]) || 0]
                : p && typeof p === "object" ? [p.value != null ? p.value : p.name != null ? p.name : p.label, Number(p.n != null ? p.n : p.count) || 0]
                : [p, 0]);
        } else if (src && typeof src === "object") {
            out = Object.keys(src).map(k => [k, Number(src[k]) || 0]);
        }
        return out.filter(p => has(p[0]) || p[1]).sort((a, b) => b[1] - a[1]);
    }

    function pct(n, total) {
        if (!total) return "—";
        const p = (n / total) * 100;
        if (p > 0 && p < 1) return "<1%";
        return Math.round(p) + "%";
    }

    function kindOf(g) { return KINDS[g && g.kind] ? g.kind : ""; }
    function kindLabel(k) { return KINDS[k] ? KINDS[k].label : (k || "Unknown"); }

    function kindPill(k) {
        const known = KINDS[k];
        return `<span class="de-chip se-kind se-kind-${escapeHtml(known ? k : "other")}" title="${escapeHtml(known ? known.long : "An unrecognised kind of report")}">${escapeHtml(kindLabel(k))}</span>`;
    }

    // Where it came from: file:line:col, or the function that fell over.
    function whereOf(g, withCol) {
        if (!g) return "";
        if (g.kind === "function") return g.fn ? g.fn + " (function)" : (g.source || "");
        if (!g.source) return g.fn || "";
        let s = String(g.source);
        if (has(g.line) && Number(g.line) > 0) s += ":" + g.line;
        if (withCol && has(g.col) && Number(g.col) > 0) s += ":" + g.col;
        return s;
    }

    // "iPhone Safari 62%": the browser most of it happened on, with the
    // device ahead of it when that is known; the tooltip has both.
    function topWho(g) {
        const top = (g && g.top) || {};
        const b = pairs(top.browsers)[0];
        const d = pairs(top.devices)[0];
        const total = Number(g.count) || 0;
        const bSum = pairs(top.browsers).reduce((s, p) => s + p[1], 0) || total;
        const dSum = pairs(top.devices).reduce((s, p) => s + p[1], 0) || total;
        if (!b && !d) return { text: "", title: "" };
        const words = [d && d[0], b && b[0]].filter(has).join(" ");
        const main = b ? pct(b[1], bSum) : pct(d[1], dSum);
        const title = [
            b ? `Browser: ${b[0]} ${pct(b[1], bSum)}` : "",
            d ? `Device: ${d[0]} ${pct(d[1], dSum)}` : ""
        ].filter(Boolean).join("\n");
        return { text: `${words} ${main}`.trim(), title };
    }

    function statusOf(g) { return (g && g.status) || "open"; }

    // What would make a group's detail worth reading again.
    function versionOf(g) {
        if (!g) return "";
        return [g.count, g.lastSeen, g.status, g.note, g.regressed, g.visitors].map(v => v == null ? "" : String(v)).join("|");
    }

    // ------------------------------------------------------------- charts

    /* Bars as inline SVG: one rect per bucket, scaled to the tallest, each
       with its own <title> so hovering a bar says its date and count. No
       library; the colour is currentColor, so the theme files reach it. */
    function series(map, buckets, step, keyFn, endT) {
        const src = map && typeof map === "object" && !Array.isArray(map) ? map : {};
        const out = [];
        for (let i = buckets - 1; i >= 0; i--) {
            const t = endT - i * step;
            const k = keyFn(t);
            out.push({ t, key: k, n: Number(src[k]) || 0 });
        }
        return out;
    }

    function barsSvg(data, h, labelFn, cls) {
        const max = Math.max(1, ...data.map(d => d.n));
        const w = data.length;
        const rects = data.map((d, i) => {
            const title = `<title>${escapeHtml(labelFn(d.t))}: ${escapeHtml(num(d.n))}</title>`;
            if (!d.n) return `<rect class="se-bar-empty" x="${i + 0.1}" y="${h - 0.6}" width="0.8" height="0.6">${title}</rect>`;
            const bh = Math.max(h * 0.08, (d.n / max) * h);
            return `<rect class="se-bar" x="${i + 0.1}" y="${(h - bh).toFixed(2)}" width="0.8" height="${bh.toFixed(2)}">${title}</rect>`;
        }).join("");
        return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(data.length + " bars, most " + num(max))}">${rects}</svg>`;
    }

    function sparkline(g) {
        const end = nowMs();
        const data = series(g.hours, 24, HOUR, hourKey, end);
        const total = data.reduce((s, d) => s + d.n, 0);
        return `<span class="se-spark" title="${escapeHtml(`Last 24 hours (UTC): ${num(total)}`)}">${barsSvg(data, 10, hourLabel, "se-spark-svg")}</span>`;
    }

    function chart(title, data, labelFn) {
        const total = data.reduce((s, d) => s + d.n, 0);
        const max = Math.max(0, ...data.map(d => d.n));
        const mid = data[Math.floor(data.length / 2)];
        return `
            <div class="se-chart">
                <h4 class="admin-visitor-head">${escapeHtml(title)} <span class="se-chart-total">${escapeHtml(num(total))} in all · most in one bar ${escapeHtml(num(max))}</span></h4>
                ${barsSvg(data, 40, labelFn, "se-chart-svg")}
                <div class="se-axis"><span>${escapeHtml(labelFn(data[0].t))}</span><span>${escapeHtml(labelFn(mid.t))}</span><span>${escapeHtml(labelFn(data[data.length - 1].t))}</span></div>
            </div>`;
    }

    // ---------------------------------------------------------------- UI

    function flash(message, bad) {
        let el = panel.querySelector(".se-flash");
        if (!el) {
            el = document.createElement("p");
            el.className = "ctl-status se-flash";
            el.setAttribute("role", "status");
            bulkEl.parentNode.insertBefore(el, bulkEl);
        }
        el.textContent = message;
        el.classList.toggle("is-bad", !!bad);
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { el.textContent = ""; }, 8000);
    }

    function setBadge(n) {
        if (!navCount) return;
        navCount.textContent = n ? String(n) : "";
        navCount.hidden = !n;
    }

    // Open groups with an occurrence in the last 24 hours.
    function countRecent(list) {
        const since = nowMs() - DAY;
        return list.filter(g => statusOf(g) === "open" && ms(g.lastSeen) >= since).length;
    }

    function renderSummary() {
        const t = totals || {};
        const stat = (n, one, many, warn) => `<span class="admin-activity-stat${warn && Number(n) ? " is-warn" : ""}"><strong>${escapeHtml(num(n || 0))}</strong> ${escapeHtml(Number(n) === 1 ? one : many)}</span>`;
        const d24 = Number(dropped && dropped.last24h) || 0;
        summaryEl.innerHTML =
            stat(t.open, "open", "open", true) +
            stat(t.resolved, "resolved", "resolved") +
            stat(t.ignored, "ignored", "ignored") +
            stat(t.last24h, "report in the last 24h", "reports in the last 24h") +
            stat(t.last7d, "report in the last 7 days", "reports in the last 7 days") +
            (d24 > 0 ? `<span class="admin-activity-stat is-warn" title="Reports the server refused because too many were arriving — from one network, or across the site. One each, however many repeats a report carried."><strong>${escapeHtml(num(d24))}</strong> ${d24 === 1 ? "report" : "reports"} dropped by the rate limit in 24h</span>` : "") +
            limitedStat();
    }

    /* Visitors the site-wide rate limit turned away (4 Oct 2026): each is a
       network that went over one of its per-minute budgets, counted once per
       minute it stayed over. The title says which functions. */
    function limitedStat() {
        const n = Number(limited && limited.last24h) || 0;
        if (!n) return "";
        const by = Object.entries((limited && limited.byFn) || {}).sort((a, b) => b[1] - a[1])
            .map(([fn, k]) => `${fn} ${num(k)}`).join(", ");
        const title = "Times a visitor's network went over the site's per-minute request limit and was asked to wait — at least this many: each server counts a network once a minute, and pictures are not counted here. By function: " + by;
        return `<span class="admin-activity-stat is-warn" title="${escapeHtml(title)}"><strong>${escapeHtml(num(n))}</strong> rate-limited in 24h</span>`;
    }

    function renderUpdated() {
        if (!updatedEl) return;
        if (!loadedAt) { updatedEl.textContent = ""; return; }
        const d = new Date(loadedAt + skew);
        const hms = d.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false });
        updatedEl.textContent = `Last updated ${hms} UTC`;
        updatedEl.title = fmtLocalFull(d.toISOString()) + " (your time) · refreshes every minute while this tab is open";
    }

    function buildFilters() {
        if (filtersBuilt) return;
        filtersBuilt = true;
        filtersEl.innerHTML = `
            <div class="ctl-seg se-status-tabs" role="group" aria-label="Which errors" data-f="status"></div>
            <div class="ctl-seg se-kind-tabs" role="group" aria-label="What kind" data-f="kind"></div>
            <div class="ctl-row se-search-row">
                <input type="search" class="ctl-input" data-f="q" placeholder="Search messages, files and functions" aria-label="Search errors" maxlength="200">
                <div class="sort-box">
                    <select data-f="sort" aria-label="Sort by">${SORTS.map(([v, l]) => `<option value="${v}"${v === sort ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select>
                </div>
            </div>`;
        filtersEl.querySelector('[data-f="status"]').addEventListener("click", e => {
            const b = e.target.closest("[data-status]");
            if (!b || b.dataset.status === status) return;
            status = b.dataset.status;
            selected.clear();
            renderFilters();
            load();
        });
        filtersEl.querySelector('[data-f="kind"]').addEventListener("click", e => {
            const b = e.target.closest("[data-kind]");
            if (!b || b.dataset.kind === kind) return;
            kind = b.dataset.kind;
            selected.clear();
            renderFilters();
            load();
        });
        const q = filtersEl.querySelector('[data-f="q"]');
        q.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                const v = q.value.trim();
                if (v === query) return;
                query = v;
                load();
            }, 350);
        });
        filtersEl.querySelector('[data-f="sort"]').addEventListener("change", e => {
            sort = e.target.value;
            load();
        });
    }

    function renderFilters() {
        buildFilters();
        const t = totals || {};
        const n = { open: t.open, resolved: t.resolved, ignored: t.ignored };
        n.all = [t.open, t.resolved, t.ignored].every(v => has(v)) ? (Number(t.open) + Number(t.resolved) + Number(t.ignored)) : null;
        filtersEl.querySelector('[data-f="status"]').innerHTML = STATUSES.map(([k, label]) =>
            `<button type="button" class="btn-enter-mini${k === status ? " active" : ""}" data-status="${k}" aria-pressed="${k === status}">${escapeHtml(label)}${has(n[k]) && Number(n[k]) ? ` (${escapeHtml(num(n[k]))})` : ""}</button>`).join("");
        filtersEl.querySelector('[data-f="kind"]').innerHTML =
            [`<button type="button" class="btn-enter-mini${kind === "all" ? " active" : ""}" data-kind="all" aria-pressed="${kind === "all"}">All</button>`]
                .concat(KIND_ORDER.map(k => `<button type="button" class="btn-enter-mini${k === kind ? " active" : ""}" data-kind="${k}" title="${escapeHtml(KINDS[k].long)}" aria-pressed="${k === kind}">${escapeHtml(KINDS[k].label)}</button>`))
                .join("");
    }

    /* Resolve / Ignore for what is ticked, and the owner's "Clear all
       resolved". Not drawn at all for a view-only account. */
    function renderBulk() {
        if (!canWrite() || !groups.length && !isOwner()) { bulkEl.innerHTML = ""; return; }
        const shownIds = visibleGroups().map(g => g.id);
        const n = shownIds.filter(id => selected.has(id)).length;
        const all = shownIds.length && n === shownIds.length;
        const resolvedCount = Number(totals && totals.resolved) || 0;
        bulkEl.innerHTML = `
            ${shownIds.length ? `<label class="se-check-all"><input type="checkbox" data-b="all"${all ? " checked" : ""}> Select all shown</label>
            <span class="admin-hint">${n} selected</span>
            <button type="button" class="ctl-btn se-write" data-b="resolved"${n && !busy ? "" : " disabled"}>Resolve selected</button>
            <button type="button" class="ctl-btn se-write" data-b="ignored"${n && !busy ? "" : " disabled"}>Ignore selected</button>
            ${status !== "open" ? `<button type="button" class="ctl-btn se-write" data-b="open"${n && !busy ? "" : " disabled"}>Reopen selected</button>` : ""}` : ""}
            ${isOwner() ? `<button type="button" class="ctl-btn admin-delete-btn se-owner se-clear-resolved" data-b="clear"${resolvedCount && !busy ? "" : " disabled"} title="Delete every resolved group for good">Clear all resolved${resolvedCount ? ` (${escapeHtml(num(resolvedCount))})` : ""}</button>` : ""}`;
    }

    bulkEl.addEventListener("change", e => {
        if (!e.target.matches('[data-b="all"]')) return;
        const ids = visibleGroups().map(g => g.id);
        if (e.target.checked) ids.forEach(id => selected.add(id));
        else ids.forEach(id => selected.delete(id));
        listEl.querySelectorAll(".se-check").forEach(c => { c.checked = selected.has(c.dataset.id); });
        renderBulk();
    });
    bulkEl.addEventListener("click", e => {
        const b = e.target.closest("button[data-b]");
        if (!b || b.disabled) return;
        if (b.dataset.b === "clear") { clearResolved(); return; }
        const ids = visibleGroups().map(g => g.id).filter(id => selected.has(id));
        if (ids.length) setStatus(ids, b.dataset.b);
    });

    /* The server filters and sorts; this does both again on what came back,
       so a server that ignored a parameter (or an older one) still shows
       the list that was asked for. The search is left to the server — it
       may look inside stacks this page never sees. */
    function visibleGroups() {
        const key = {
            last: g => ms(g.lastSeen),
            count: g => Number(g.count) || 0,
            visitors: g => Number(g.visitors) || 0,
            first: g => ms(g.firstSeen)
        }[sort] || (g => ms(g.lastSeen));
        const val = g => { const v = key(g); return Number.isFinite(v) ? v : -Infinity; };
        return groups
            .filter(g => g && has(g.id))
            .filter(g => status === "all" || statusOf(g) === status)
            .filter(g => kind === "all" || g.kind === kind)
            .slice()
            .sort((a, b) => (val(b) - val(a)) || ((ms(b.lastSeen) || 0) - (ms(a.lastSeen) || 0)));
    }

    function rowHtml(g) {
        const k = kindOf(g) || g.kind;
        const where = whereOf(g, false);
        const who = topWho(g);
        const st = statusOf(g);
        const msg = has(g.message) ? String(g.message) : "(no message)";
        const firstLine = msg.split("\n")[0];
        return `
            ${canWrite() ? `<label class="se-check-wrap se-write" title="Select for Resolve / Ignore"><input type="checkbox" class="se-check" data-id="${escapeHtml(g.id)}"${selected.has(String(g.id)) ? " checked" : ""} aria-label="Select this error"></label>` : ""}
            <div class="row-info">
                <div class="se-row-head">
                    ${kindPill(k)}
                    ${g.regressed ? `<span class="de-chip se-regressed" title="${escapeHtml("Marked resolved, then seen again" + (g.regressedAt ? " — " + fmtUtcFull(g.regressedAt) : ""))}">Regressed</span>` : ""}
                    ${st !== "open" ? `<span class="de-chip se-status-${escapeHtml(st)}">${escapeHtml(st)}</span>` : ""}
                    ${has(g.note) ? `<span class="de-chip se-note-flag" title="${escapeHtml("Note: " + g.note)}">Note</span>` : ""}
                    <h3 class="se-msg" title="${escapeHtml(msg)}">${escapeHtml(firstLine)}</h3>
                </div>
                <p class="row-creator se-where">${where ? `<span class="se-mono" title="${escapeHtml(whereOf(g, true))}">${escapeHtml(where)}</span>` : "—"}${who.text ? ` <span class="se-sep">·</span> <span title="${escapeHtml(who.title)}">${escapeHtml(who.text)}</span>` : ""}</p>
                <p class="se-when">First seen ${timeTag(g.firstSeen)} <span class="se-sep">·</span> last seen ${timeTag(g.lastSeen)} <span class="se-utc">(${escapeHtml(fmtUtc(g.lastSeen))})</span></p>
            </div>
            <div class="row-side se-side">
                ${sparkline(g)}
                <span class="admin-activity-meta" title="Times it happened"><strong>${escapeHtml(num(g.count))}</strong>×</span>
                <span class="admin-activity-meta" title="Different visitors it happened to">${escapeHtml(num(g.visitors))} ${Number(g.visitors) === 1 ? "visitor" : "visitors"}</span>
            </div>`;
    }

    function render() {
        if (!apiReady()) {
            listEl.innerHTML = `<p class="admin-empty">Not available yet — reload. This copy of the page was loaded before error reporting went live. <button type="button" class="ctl-btn" data-se="reload">Reload</button></p>`;
            summaryEl.innerHTML = "";
            bulkEl.innerHTML = "";
            return;
        }
        renderFilters();
        renderSummary();
        renderUpdated();
        if (loadError) {
            listEl.innerHTML = `<p class="admin-empty admin-form-error" role="alert">Could not load the errors: ${escapeHtml(loadError)} <button type="button" class="ctl-btn" data-se="retry">Retry</button></p>`;
            bulkEl.innerHTML = "";
            return;
        }
        const shown = visibleGroups();
        // Ticks on groups no longer in the list are dropped with them.
        const ids = new Set(shown.map(g => String(g.id)));
        Array.from(selected).forEach(id => { if (!ids.has(id)) selected.delete(id); });
        renderBulk();

        listEl.innerHTML = "";
        if (!shown.length) {
            const filtered = kind !== "all" || query;
            listEl.innerHTML = `<p class="admin-empty">${filtered ? "Nothing matches that." : status === "open" || status === "all" ? "No errors — nice." : `Nothing ${escapeHtml(status)}.`}</p>`;
            return;
        }
        shown.forEach(g => {
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row se-row" + (String(g.id) === openId ? " is-open" : "") + (g.regressed ? " is-regressed" : "");
            row.dataset.id = String(g.id);
            row.tabIndex = 0;
            row.setAttribute("role", "button");
            row.setAttribute("aria-expanded", String(String(g.id) === openId));
            row.innerHTML = rowHtml(g);
            listEl.appendChild(row);
            if (String(g.id) === openId) listEl.appendChild(detailFor(g));
        });
        if (groups.length >= LIST_LIMIT) {
            const more = document.createElement("p");
            more.className = "admin-hint";
            more.textContent = `Showing the first ${LIST_LIMIT}. Narrow it with the filters or the search to see the rest.`;
            listEl.appendChild(more);
        }
        // The kept detail's "3 min ago"s were written when it was built.
        refreshAgo();
    }

    listEl.addEventListener("click", e => {
        const se = e.target.closest("[data-se]");
        if (se) {
            if (se.dataset.se === "reload") location.reload();
            if (se.dataset.se === "retry") load();
            return;
        }
        if (e.target.closest(".se-check-wrap")) return;
        const row = e.target.closest(".se-row");
        if (!row || !listEl.contains(row)) return;
        toggle(row.dataset.id);
    });
    listEl.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const row = e.target.closest(".se-row");
        if (!row || e.target !== row) return;
        e.preventDefault();
        toggle(row.dataset.id);
    });
    listEl.addEventListener("change", e => {
        const c = e.target.closest(".se-check");
        if (!c) return;
        if (c.checked) selected.add(c.dataset.id); else selected.delete(c.dataset.id);
        renderBulk();
    });

    function toggle(id) {
        openId = openId === id ? null : id;
        render();
        if (openId) {
            const row = listEl.querySelector(`.se-row[data-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(openId) : openId}"]`);
            if (row) row.focus({ preventScroll: true });
            loadDetail(openId);
        }
    }

    // ------------------------------------------------------------ detail

    function detailFor(listGroup) {
        const id = String(listGroup.id);
        const full = details.get(id);
        const g = full ? Object.assign({}, listGroup, full) : listGroup;
        const version = `${id}|${full ? "full" : "list"}|${versionOf(g)}|${detailErrors.get(id) || ""}|${canWrite()}|${isOwner()}`;
        if (detailNode && detailNodeFor === version) return detailNode;
        detailNode = buildDetail(g, !!full, detailErrors.get(id));
        detailNodeFor = version;
        return detailNode;
    }

    function newestSamples(g) {
        const list = Array.isArray(g.samples) ? g.samples.filter(s => s && typeof s === "object") : [];
        return list.slice().sort((a, b) => (ms(b.receivedAt || b.at) || 0) - (ms(a.receivedAt || a.at) || 0));
    }

    function buildDetail(g, isFull, failed) {
        const id = String(g.id);
        const el = document.createElement("div");
        el.className = "se-detail";
        el.dataset.for = id;
        const samples = newestSamples(g);
        const latest = samples[0] || {};
        const end = nowMs();
        const st = statusOf(g);

        // A function's own facts come from its newest sample when the group
        // does not carry them itself.
        const fnFacts = g.kind === "function" ? [
            ["Function", g.fn || latest.fn],
            ["Method", g.method || latest.method],
            ["Path", g.path || latest.path],
            ["Status", g.statusCode || latest.status],
            // The server stores it as deployId; `deploy` is the old name (30 Sept 2026).
            ["Deploy", g.deployId || latest.deployId || g.deploy || latest.deploy]
        ] : [];

        const breakdownKeys = [
            ["browsers", "Browsers"], ["os", "Systems"], ["devices", "Devices"], ["pages", "Pages"],
            ["countries", "Countries"], ["builds", "Builds"], ["themes", "Themes"]
        ];
        const breakdown = (key, title) => {
            const src = (g[key] != null ? g[key] : (g.top && g.top[key]));
            const rows = pairs(src);
            if (!rows.length) return `<div class="se-break"><h4 class="admin-visitor-head">${escapeHtml(title)}</h4><p class="admin-hint">—</p></div>`;
            const total = rows.reduce((s, p) => s + p[1], 0);
            const shown = rows.slice(0, 10);
            return `
                <div class="se-break">
                    <h4 class="admin-visitor-head">${escapeHtml(title)}</h4>
                    <div class="ff-table-wrap"><table class="ff-table se-table">
                        <tbody>${shown.map(p => `<tr><td class="se-break-label" title="${escapeHtml(p[0])}">${escapeHtml(dash(p[0]))}</td><td class="ff-num">${escapeHtml(num(p[1]))}</td><td class="ff-num">${escapeHtml(pct(p[1], total))}</td></tr>`).join("")}</tbody>
                    </table></div>
                    ${rows.length > shown.length ? `<p class="admin-hint">and ${rows.length - shown.length} more</p>` : ""}
                </div>`;
        };

        const noteDraft = noteDrafts.has(id) ? noteDrafts.get(id) : (g.note || "");

        el.innerHTML = `
            <div class="se-detail-head">
                <pre class="se-full-msg">${escapeHtml(has(g.message) ? g.message : "(no message)")}</pre>
                <p class="se-mono se-source">${escapeHtml(whereOf(g, true) || "—")}</p>
                ${fnFacts.length ? `<dl class="se-grid se-grid-tight">${fnFacts.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(dash(v))}</dd>`).join("")}</dl>` : ""}
            </div>

            <div class="se-actions">
                <div class="ctl-actions">
                    ${canWrite() ? `
                        ${st !== "resolved" ? `<button type="button" class="ctl-btn se-write" data-a="resolved">Resolve</button>` : ""}
                        ${st !== "open" ? `<button type="button" class="ctl-btn se-write" data-a="open">Reopen</button>` : ""}
                        ${st !== "ignored" ? `<button type="button" class="ctl-btn se-write" data-a="ignored">Ignore</button>` : ""}` : ""}
                    <button type="button" class="ctl-btn" data-a="report" title="Copy a plain-text report of this error and its newest occurrence">Copy report</button>
                    ${isOwner() ? `<button type="button" class="ctl-btn admin-delete-btn se-owner" data-a="delete">Delete</button>` : ""}
                </div>
                <p class="ctl-status" data-a="status">${st === "open" ? "Open" : st === "resolved" ? "Resolved" : st === "ignored" ? "Ignored — still counted, kept out of the Open list" : escapeHtml(st)}${g.statusBy ? ` by ${escapeHtml(g.statusBy)}` : ""}${g.statusAt ? `, ${timeTag(g.statusAt)}` : ""}</p>
            </div>

            <div class="se-note">
                ${has(g.note) ? `<p class="se-note-saved"><span class="ctl-label">Note</span> ${escapeHtml(g.note)}${g.noteBy ? ` <span class="admin-hint">— ${escapeHtml(g.noteBy)}${g.noteAt ? `, ${escapeHtml(fmtUtc(g.noteAt))}` : ""}</span>` : ""}</p>` : ""}
                ${canWrite() ? `
                    <textarea class="ctl-input se-note-box se-write" rows="2" maxlength="1000" placeholder="A note for whoever looks at this next — what it is, whether it is fixed, which commit">${escapeHtml(noteDraft)}</textarea>
                    <div class="ctl-actions"><button type="button" class="ctl-btn se-write" data-a="note">Save note</button></div>` : ""}
            </div>

            <h4 class="admin-subheading se-sub">Timeline</h4>
            <div class="admin-activity-summary se-timeline-sum">
                <span class="admin-activity-stat" title="${escapeHtml(timeTitle(g.firstSeen))}"><strong>${escapeHtml(fmtUtc(g.firstSeen))}</strong> first seen (${timeTag(g.firstSeen)})</span>
                <span class="admin-activity-stat" title="${escapeHtml(timeTitle(g.lastSeen))}"><strong>${escapeHtml(fmtUtc(g.lastSeen))}</strong> last seen (${timeTag(g.lastSeen)})</span>
                <span class="admin-activity-stat"><strong>${escapeHtml(num(g.count))}</strong> ${Number(g.count) === 1 ? "time" : "times"}</span>
                <span class="admin-activity-stat"><strong>${escapeHtml(num(g.visitors))}</strong> ${Number(g.visitors) === 1 ? "visitor" : "visitors"}</span>
                ${g.regressed ? `<span class="admin-activity-stat is-warn" title="${escapeHtml(timeTitle(g.regressedAt))}"><strong>!</strong> came back after being resolved${g.regressedAt ? ", " + escapeHtml(fmtUtc(g.regressedAt)) : ""}</span>` : ""}
            </div>
            <div class="se-charts">
                ${chart("Last 60 days (per UTC day)", series(g.days, 60, DAY, dayKey, end), dayLabel)}
                ${chart("Last 48 hours (per UTC hour)", series(g.hours, 48, HOUR, hourKey, end), hourLabel)}
            </div>

            <h4 class="admin-subheading se-sub">What it happened on</h4>
            ${isFull ? "" : `<p class="admin-hint">${failed ? "" : "Loading the full breakdown…"}</p>`}
            <div class="se-breaks">${breakdownKeys.map(([k, t]) => breakdown(k, t)).join("")}</div>

            <h4 class="admin-subheading se-sub">Occurrences${samples.length ? ` <span class="admin-hint">the last ${samples.length}, newest first</span>` : ""}</h4>
            <div class="se-samples">${failed
                ? `<p class="admin-empty admin-form-error">Could not load the occurrences: ${escapeHtml(failed)} <button type="button" class="ctl-btn" data-a="retry-detail">Retry</button></p>`
                : !isFull ? `<p class="admin-empty">Loading…</p>`
                : samples.length ? samples.map((s, i) => sampleHtml(g, s, i)).join("")
                : `<p class="admin-empty">No occurrences kept.</p>`}</div>`;

        // Which occurrences were left open survives a redraw.
        el.querySelectorAll("details.se-sample").forEach(d => {
            d.addEventListener("toggle", () => {
                if (d.open) openSamples.add(d.dataset.key); else openSamples.delete(d.dataset.key);
            });
        });
        const box = el.querySelector(".se-note-box");
        if (box) box.addEventListener("input", () => noteDrafts.set(id, box.value));

        el.addEventListener("click", e => {
            const b = e.target.closest("[data-a], [data-copy]");
            if (!b || b.disabled) return;
            if (b.dataset.copy != null) {
                const sample = samples[Number(b.dataset.copy)];
                copyText(sample ? String(sample.stack || "") : "", b);
                return;
            }
            const a = b.dataset.a;
            if (a === "resolved" || a === "open" || a === "ignored") setStatus([id], a);
            else if (a === "note") saveNote(id, (el.querySelector(".se-note-box") || {}).value || "");
            else if (a === "delete") removeGroup(g);
            else if (a === "report") copyText(reportText(g, samples[0]), b);
            else if (a === "retry-detail") { detailErrors.delete(id); render(); loadDetail(id); }
        });
        return el;
    }

    // Everything the browser sent about one occurrence, labelled.
    function fmtVal(v) {
        if (!has(v)) return "—";
        if (typeof v === "boolean") return v ? "Yes" : "No";
        if (Array.isArray(v)) return v.length ? v.map(fmtVal).join(", ") : "none";
        if (typeof v === "object") {
            const w = v.w != null ? v.w : v.width;
            const h = v.h != null ? v.h : v.height;
            if (w != null && h != null) return `${w} × ${h}`;
            try { return JSON.stringify(v); } catch (e) { return "—"; }
        }
        return String(v);
    }

    /* The browser, the system and the device. The server stores a sample
       as the cleaned report spread flat, with the parsed user agent's five
       fields beside it at the top level (upsertGroup in
       netlify/functions/_errors.js) — there has never been a `ua` object on
       a stored sample, which is why every occurrence showed "—" here. The
       `ua` reading stays behind the real one as a harmless fallback, for a
       sample shaped the way this panel first guessed (29 Sept 2026). */
    function uaOf(s) {
        const ua = s && s.ua;
        const flat = {
            browser: s && s.browser, browserVersion: s && s.browserVersion,
            os: s && s.os, osVersion: s && s.osVersion, device: s && s.device
        };
        if (has(flat.browser) || has(flat.os) || has(flat.device)) return flat;
        if (ua && typeof ua === "object") return ua;
        return { raw: typeof ua === "string" ? ua : "" };
    }

    // The first of the names a field has gone by that holds anything.
    function pick(s, ...keys) {
        for (const k of keys) if (s && has(s[k])) return s[k];
        return undefined;
    }

    /* A report's context — a handled error's notes, or a network failure's
       own words ("Failed to fetch", "Load failed") — as "key: value" pairs.
       The server keeps it to ten flat strings, numbers and booleans. */
    function fmtContext(ctx) {
        if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) return has(ctx) ? String(ctx) : "";
        return Object.keys(ctx).map(k => `${k}: ${fmtVal(ctx[k])}`).join("; ");
    }

    function tzWords(off) {
        const o = Number(off);
        if (!Number.isFinite(o) || Math.abs(o) > 16 * 60) return "—";
        // Date.getTimezoneOffset: minutes BEHIND UTC, so UTC+1 arrives as -60.
        const east = -o;
        const sign = east >= 0 ? "+" : "−";
        const a = Math.abs(east);
        return `UTC${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
    }

    function theirClock(s) {
        const t = ms(s.at);
        const o = Number(s.tzOffset);
        if (!Number.isFinite(t) || !Number.isFinite(o) || Math.abs(o) > 16 * 60) return "—";
        const local = new Date(t - o * 60000);
        return local.toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " " + tzWords(o);
    }

    /* How many times this occurrence happened on its page before it was
       sent. Stored as the report's `count` (cleanReport in
       netlify/functions/_errors.js); `repeats` was this panel's guess, so
       the field and the "repeated N×" were never shown (30 Sept 2026). */
    function repeatsOf(s) {
        const n = Number(pick(s, "repeats", "count"));
        return Number.isFinite(n) ? n : 0;
    }

    function sampleFields(g, s) {
        const ua = uaOf(s);
        const received = ms(s.receivedAt);
        const at = ms(s.at);
        const drift = Number.isFinite(received) && Number.isFinite(at) ? Math.round((received - at) / 1000) : null;
        const f = [
            ["Time (UTC)", fmtUtcFull(s.at || s.receivedAt)],
            ["Your time", fmtLocalFull(s.at || s.receivedAt)],
            ["Their clock", theirClock(s)],
            ["Received", has(s.receivedAt) ? fmtUtcFull(s.receivedAt) + (drift != null && Math.abs(drift) >= 5 ? ` (${drift > 0 ? drift + "s after" : -drift + "s before"} their clock said)` : "") : "—"],
            ["After page load", has(pick(s, "sinceLoad", "sinceLoadMs")) ? fmtDuration(pick(s, "sinceLoad", "sinceLoadMs")) : "—"],
            ["Page", s.page],
            ["URL", s.url],
            ["Title", s.title],
            ["Source", whereOf(Object.assign({}, g, s, { kind: s.kind || g.kind }), true)],
            ["Browser", [ua.browser, ua.browserVersion].filter(has).join(" ") || ua.raw],
            ["System", [ua.os, ua.osVersion].filter(has).join(" ")],
            ["Device", ua.device],
            ["Language", s.lang],
            ["Viewport", fmtVal(s.viewport)],
            ["Screen", fmtVal(s.screen)],
            ["Pixel ratio", s.dpr],
            ["Pointer", s.pointer],
            ["Touch points", s.touch],
            // The client sends these as net, mem, landing and windows
            // (environment() in js/error-report.js); the longer names are
            // this panel's first guess, kept as a fallback (29 Sept 2026).
            ["Connection", fmtVal(pick(s, "net", "connection"))],
            ["Memory", has(pick(s, "mem", "deviceMemory")) ? pick(s, "mem", "deviceMemory") + " GB" : ""],
            ["Online", fmtVal(s.online)],
            ["Visibility", s.visibility],
            ["Theme", s.theme],
            ["Signed in", fmtVal(s.signedIn)],
            ["Landing state", pick(s, "landing", "landingState")],
            ["Build", s.build],
            ["Open windows", (w => Array.isArray(w) ? (w.length ? w.join(", ") : "none") : w)(pick(s, "windows", "openWindows"))],
            ["Context", fmtContext(s.context)],
            ["Country", s.country],
            ["Session", s.session],
            ["Repeats", repeatsOf(s) > 1 ? repeatsOf(s) : ""]
        ];
        if ((s.kind || g.kind) === "function" || has(s.requestId) || has(s.method)) {
            f.push(
                ["Function", s.fn],
                ["Method", s.method],
                ["Path", s.path],
                ["Status", s.status],
                ["Took", has(pick(s, "ms", "durationMs")) ? fmtDuration(pick(s, "ms", "durationMs")) : ""],
                ["Request id", s.requestId],
                ["Deploy", pick(s, "deployId", "deploy")],
                ["Commit", s.commit]
            );
        }
        /* Two things the store sends that the panel never showed (30 Sept
           2026): which element a failed load was (cleanReport keeps `tag`
           for resource reports — img, script, link…), and `trimmed`, which
           fitSample sets when a sample was cut to fit its size cap, so a
           short crumb list is not read as the whole story. Both only when
           present, and reportText picks them up from here. */
        if ((s.kind || g.kind) === "resource" || has(s.tag)) {
            const at = f.findIndex(([k]) => k === "Source");
            f.splice(at + 1, 0, ["Tag", s.tag]);
        }
        if (s.trimmed === true) f.push(["Trimmed", "Some breadcrumbs or stack frames were cut to fit"]);
        return f;
    }

    /* "−4.2s": how long before the error each step was.

       A crumb's `t` is NOT a timestamp: js/error-report.js stamps it with
       performance.now(), milliseconds since the page loaded, and the
       report's own sinceLoad is on the same clock — so c.t − s.sinceLoad is
       the gap, measured on a clock that cannot jump when the phone resyncs
       its time. Read as a date, `t` came out as a moment in January 1970
       and every crumb said "—". When either number is missing, the crumb's
       `at` against the report's `at` (both wall-clock ISO strings) gives
       the same answer less exactly; and a `t` that IS an ISO string is the
       old guessed shape, read the old way (29 Sept 2026). */
    function crumbOffset(c, s) {
        if (!c || !s) return "";
        let d = NaN;
        if (typeof c.t === "number" && typeof s.sinceLoad === "number") d = c.t - s.sinceLoad;
        if (!Number.isFinite(d) && has(c.at)) d = ms(c.at) - ms(s.at || s.receivedAt);
        if (!Number.isFinite(d) && typeof c.t === "string") d = ms(c.t) - ms(s.at || s.receivedAt);
        if (!Number.isFinite(d)) return "";
        d /= 1000;
        const a = Math.abs(d);
        const sign = d < 0 ? "−" : d > 0 ? "+" : "";
        if (a < 60) return `${sign}${a.toFixed(1)}s`;
        return `${sign}${Math.floor(a / 60)}m ${pad2(Math.round(a % 60))}s`;
    }

    // Stored as `crumbs` (cleanReport in netlify/functions/_errors.js);
    // `breadcrumbs` was this panel's guess, kept as a fallback (29 Sept 2026).
    function crumbsOf(s) {
        const list = Array.isArray(s && s.crumbs) ? s.crumbs : Array.isArray(s && s.breadcrumbs) ? s.breadcrumbs : [];
        return list.filter(c => c && typeof c === "object");
    }

    /* One step, in words, from the fields its own type carries (cleanCrumb
       in netlify/functions/_errors.js keeps only these): a click has its
       label (or, with none, the element), a navigation how and where, a
       fetch the method, function, status and time, a console line or an
       earlier error its message, and a visibility change the new state.
       Only `text` was read before, which only a click has, so every other
       step was a bare "—" (29 Sept 2026). */
    function crumbText(c) {
        if (!c) return "";
        const join = parts => parts.filter(has).join(" ");
        switch (c.type) {
            case "click": return has(c.text) ? (has(c.el) ? `${c.text} (${c.el})` : String(c.text)) : dash(c.el);
            case "nav": return join([c.how, has(c.to) ? "→ " + c.to : ""]);
            case "fetch": return join([
                c.method, c.fn,
                has(c.status) ? (Number(c.status) === 0 ? "failed" : c.status) : "",
                has(c.ms) ? Math.round(Number(c.ms)) + "ms" : ""
            ]);
            case "console":
            case "error": return has(c.msg) ? String(c.msg) : dash(c.text);
            case "visibility": return dash(c.state);
            default: return has(c.text) ? String(c.text) : has(c.msg) ? String(c.msg) : "";
        }
    }

    function sampleHtml(g, s, i) {
        // Keyed by when it arrived rather than by its place in the list,
        // which shifts by one every time a new occurrence comes in.
        const key = `${g.id}#${s.receivedAt || s.at || i}`;
        const ua = uaOf(s);
        const who = [ua.device, ua.browser, ua.os].filter(has).join(" · ") || ua.raw || "";
        const crumbs = crumbsOf(s);
        const when = s.at || s.receivedAt;
        return `
            <details class="se-sample" data-key="${escapeHtml(key)}"${openSamples.has(key) ? " open" : ""}>
                <summary>
                    <span class="se-sample-when" title="${escapeHtml(timeTitle(when))}">${escapeHtml(fmtUtcFull(when))}</span>
                    <span class="admin-hint">${escapeHtml(ago(when))}</span>
                    <span class="se-mono se-sample-page">${escapeHtml(dash(s.page))}</span>
                    <span class="admin-hint">${escapeHtml(who)}${has(s.country) ? " · " + escapeHtml(s.country) : ""}${repeatsOf(s) > 1 ? ` · repeated ${escapeHtml(num(repeatsOf(s)))}×` : ""}</span>
                </summary>
                <div class="se-sample-body">
                    ${has(s.message) && s.message !== g.message ? `<pre class="se-full-msg">${escapeHtml(s.message)}</pre>` : ""}
                    <dl class="se-grid">${sampleFields(g, s).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(dash(v))}</dd>`).join("")}</dl>
                    <div class="se-stack-head"><span class="ctl-label">Stack</span>${has(s.stack) ? `<button type="button" class="ctl-btn" data-copy="${i}">Copy</button>` : ""}</div>
                    <pre class="se-stack">${escapeHtml(has(s.stack) ? s.stack : "No stack was sent.")}</pre>
                    <span class="ctl-label">What happened before it</span>
                    ${crumbs.length ? `<ol class="se-crumbs">${crumbs.map(c => `
                        <li><span class="se-crumb-t" title="${escapeHtml(timeTitle(has(c.at) ? c.at : typeof c.t === "string" ? c.t : null))}">${escapeHtml(crumbOffset(c, s) || "—")}</span><span class="de-chip se-crumb-type">${escapeHtml(dash(c.type))}</span><span class="se-crumb-text">${escapeHtml(dash(crumbText(c)))}</span></li>`).join("")}
                        <li class="se-crumb-now"><span class="se-crumb-t">0.0s</span><span class="de-chip se-kind">${escapeHtml(kindLabel(s.kind || g.kind))}</span><span class="se-crumb-text">${escapeHtml(dash(s.message || g.message))}</span></li>
                    </ol>` : `<p class="admin-hint">None recorded.</p>`}
                </div>
            </details>`;
    }

    /* A plain-text report to paste to whoever is fixing it: the group, then
       the newest occurrence in full. */
    function reportText(g, s) {
        const lines = [];
        lines.push(`Maze Rats error report — ${kindLabel(g.kind)} (${dash(g.kind)})`);
        lines.push(`Message: ${dash(g.message)}`);
        lines.push(`Where: ${whereOf(g, true) || "—"}`);
        lines.push(`Status: ${statusOf(g)}${g.regressed ? " (regressed" + (g.regressedAt ? " " + fmtUtcFull(g.regressedAt) : "") + ")" : ""}`);
        lines.push(`Seen: ${num(g.count)} times, ${num(g.visitors)} visitors`);
        lines.push(`First seen: ${fmtUtcFull(g.firstSeen)}`);
        lines.push(`Last seen: ${fmtUtcFull(g.lastSeen)}`);
        if (has(g.note)) lines.push(`Note: ${g.note}`);
        lines.push(`Group id: ${dash(g.id)}`);
        const tops = [["browsers", "Browsers"], ["os", "Systems"], ["devices", "Devices"], ["pages", "Pages"]];
        tops.forEach(([k, label]) => {
            const rows = pairs(g[k] != null ? g[k] : g.top && g.top[k]);
            if (!rows.length) return;
            const total = rows.reduce((a, p) => a + p[1], 0);
            lines.push(`${label}: ${rows.slice(0, 5).map(p => `${dash(p[0])} ${pct(p[1], total)}`).join(", ")}`);
        });
        if (s) {
            lines.push("");
            lines.push("Newest occurrence");
            sampleFields(g, s).forEach(([k, v]) => { if (has(v) && v !== "—") lines.push(`  ${k}: ${v}`); });
            lines.push("");
            lines.push("Stack:");
            lines.push(has(s.stack) ? String(s.stack) : "  (none sent)");
            const crumbs = crumbsOf(s);
            lines.push("");
            lines.push("Breadcrumbs (time before the error):");
            if (!crumbs.length) lines.push("  (none)");
            crumbs.forEach(c => lines.push(`  ${crumbOffset(c, s) || "?"}  ${dash(c.type)}  ${dash(crumbText(c))}`));
        } else {
            lines.push("");
            lines.push("(No occurrence was loaded.)");
        }
        return lines.join("\n");
    }

    async function copyText(text, btn) {
        let ok = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                ok = true;
            }
        } catch (e) { /* the fallback below */ }
        if (!ok) {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            ta.remove();
        }
        if (btn) {
            const was = btn.textContent;
            btn.textContent = ok ? "Copied" : "Copy failed";
            setTimeout(() => { btn.textContent = was; }, 1600);
        }
    }

    // ----------------------------------------------------------- loading

    function listParams() {
        const p = { status, sort, limit: LIST_LIMIT };
        if (kind !== "all") p.kind = kind;
        if (query) p.q = query;
        return p;
    }

    function takeClock(data) {
        const t = ms(data && data.now);
        if (Number.isFinite(t)) skew = t - Date.now();
    }

    async function load(opts) {
        const auto = !!(opts && opts.auto);
        if (!apiReady()) { render(); setBadge(0); return; }
        if (!token()) return;
        const gen = ++loadGen;
        if (!auto && !groups.length && !loadError) listEl.innerHTML = '<p class="admin-empty">Loading…</p>';
        if (refreshBtn) refreshBtn.disabled = true;
        try {
            const data = await Api.getSiteErrors(token(), listParams());
            if (gen !== loadGen) return;
            takeClock(data);
            groups = Array.isArray(data && data.groups) ? data.groups : Array.isArray(data && data.items) ? data.items : Array.isArray(data) ? data : [];
            groups.forEach(g => { if (g && g.id != null) g.id = String(g.id); });
            totals = (data && data.totals) || {};
            dropped = (data && data.dropped) || {};
            limited = (data && data.limited) || {};
            loadedAt = Date.now();
            loadError = null;
            /* The same question the badge asks, answered for free — but only
               when the list came back whole (30 Sept 2026). At LIST_LIMIT
               rows it may have been cut short, and a badge counted from it
               would undercount what badge()'s own BADGE_LIMIT read sees; so
               then the badge asks for itself, and keeps its last answer
               until that comes back. */
            if (listIsBadgeList()) {
                if (listComplete()) setBadge(countRecent(groups));
                else badge();
            }
            // An open detail whose group moved on is read again.
            if (openId) {
                const g = groups.find(x => x.id === openId);
                const full = details.get(openId);
                if (g && full && versionOf(g) !== versionOf(full)) loadDetail(openId, true);
            }
        } catch (err) {
            if (gen !== loadGen) return;
            if (sessionGone(err)) {
                loadError = "your session expired. Sign in again, then press Refresh.";
            } else if (auto && groups.length) {
                // A blip on a background refresh keeps what is on screen.
                flash(`Could not refresh: ${errText(err)}. Trying again in a minute.`, true);
                return;
            } else {
                loadError = errText(err);
            }
        } finally {
            if (gen === loadGen && refreshBtn) refreshBtn.disabled = false;
        }
        paint(auto);
    }

    /* Redraw — except that a background refresh never redraws under
       somebody typing a note or searching: it waits for them to leave the
       box. Relative times are brought up to date either way. */
    function paint(auto) {
        const active = document.activeElement;
        if (auto && active && listEl.contains(active) && active.matches("textarea, input, select")) {
            pendingRender = true;
            renderSummary();
            renderUpdated();
            refreshAgo();
            return;
        }
        pendingRender = false;
        render();
    }
    listEl.addEventListener("focusout", () => {
        if (!pendingRender) return;
        setTimeout(() => {
            const a = document.activeElement;
            if (a && listEl.contains(a) && a.matches("textarea, input, select")) return;
            if (pendingRender) { pendingRender = false; render(); }
        }, 0);
    });

    async function loadDetail(id, quiet) {
        if (typeof Api.getSiteError !== "function") {
            detailErrors.set(id, "this page is older than the server — reload it");
            if (openId === id) render();
            return;
        }
        // An answer for the account signed in before a reset() is dropped (30 Sept 2026).
        const mine = sessionNo;
        try {
            const data = await Api.getSiteError(token(), id);
            if (mine !== sessionNo) return;
            const g = data && (data.group || (data.id != null ? data : null));
            if (!g) throw new Error("the server sent nothing for it");
            g.id = String(g.id != null ? g.id : id);
            details.set(id, g);
            detailErrors.delete(id);
        } catch (err) {
            if (mine !== sessionNo) return;
            if (sessionGone(err)) return;
            if (quiet && details.has(id)) return;
            if (err && err.status === 404) {
                detailErrors.set(id, "it is no longer there (deleted, or cleared as resolved)");
            } else {
                detailErrors.set(id, errText(err));
            }
        }
        if (openId === id) paint(!!quiet);
    }

    // ------------------------------------------------------------ writes

    function setBusy(on) {
        busy = on;
        listEl.querySelectorAll("button.se-write, button.se-owner").forEach(b => { b.disabled = on; });
        // The bulk bar works out its own (nothing ticked = nothing to press).
        renderBulk();
    }

    async function setStatus(ids, next) {
        if (busy || !ids.length) return;
        if (typeof Api.updateSiteError !== "function") { flash("Not available yet — reload the page.", true); return; }
        setBusy(true);
        try {
            const body = ids.length === 1 ? { id: ids[0], status: next } : { ids, status: next };
            const res = await Api.updateSiteError(token(), body);
            if (res && res.group && res.group.id != null) {
                const g = res.group;
                g.id = String(g.id);
                details.set(g.id, Object.assign({}, details.get(g.id) || {}, g));
            }
            const word = next === "resolved" ? "Resolved" : next === "ignored" ? "Ignored" : "Reopened";
            const n = res && Number.isFinite(Number(res.updated)) ? Number(res.updated) : ids.length;
            flash(`${word} ${n} ${n === 1 ? "error" : "errors"}.`);
            ids.forEach(id => selected.delete(id));
        } catch (err) {
            setBusy(false);
            if (!sessionGone(err)) flash(`Not changed: ${errText(err)}`, true);
            else flash("Not changed: your session had expired. Sign in, then try again.", true);
            return;
        }
        setBusy(false);
        await load();
    }

    async function saveNote(id, text) {
        if (busy) return;
        if (typeof Api.updateSiteError !== "function") { flash("Not available yet — reload the page.", true); return; }
        setBusy(true);
        try {
            const res = await Api.updateSiteError(token(), { id, note: String(text).trim() });
            noteDrafts.delete(id);
            const prev = details.get(id) || {};
            const g = res && res.group ? res.group : Object.assign({}, prev, { note: String(text).trim() });
            g.id = String(g.id != null ? g.id : id);
            details.set(id, Object.assign({}, prev, g));
            const row = groups.find(x => x.id === id);
            if (row) row.note = g.note;
            flash(String(text).trim() ? "Note saved." : "Note cleared.");
        } catch (err) {
            setBusy(false);
            if (!sessionGone(err)) flash(`Note not saved: ${errText(err)}`, true);
            else flash("Note not saved: your session had expired. Sign in, then press Save note again.", true);
            return;
        }
        setBusy(false);
        render();
    }

    // opts go through (30 Sept 2026): { danger: true } makes the Yes red,
    // as it is for every other delete for good in the Warren.
    async function ask(html, opts) {
        if (typeof window.AdminConfirm === "function") return window.AdminConfirm(html, opts);
        const div = document.createElement("div");
        div.innerHTML = html;
        return confirm(div.textContent);
    }

    async function removeGroup(g) {
        if (busy || !isOwner()) return;
        if (typeof Api.deleteSiteErrors !== "function") { flash("Not available yet — reload the page.", true); return; }
        const msg = String(g.message || "this error");
        const ok = await ask(`Delete <strong>${escapeHtml(msg.length > 120 ? msg.slice(0, 120) + "…" : msg)}</strong> and its ${escapeHtml(num(g.count))} recorded occurrences? If it happens again it comes back as a new error.`, { danger: true });
        if (!ok) return;
        setBusy(true);
        try {
            await Api.deleteSiteErrors(token(), { id: g.id });
            details.delete(String(g.id));
            if (openId === String(g.id)) openId = null;
            flash("Deleted.");
        } catch (err) {
            setBusy(false);
            if (!sessionGone(err)) flash(`Not deleted: ${errText(err)}`, true);
            return;
        }
        setBusy(false);
        await load();
    }

    async function clearResolved() {
        if (busy || !isOwner()) return;
        if (typeof Api.deleteSiteErrors !== "function") { flash("Not available yet — reload the page.", true); return; }
        const n = Number(totals && totals.resolved) || 0;
        const ok = await ask(`Delete all ${escapeHtml(num(n))} resolved ${n === 1 ? "error" : "errors"} for good? Their counts, charts and occurrences go with them. Open and ignored errors are not touched.`, { danger: true });
        if (!ok) return;
        setBusy(true);
        try {
            const res = await Api.deleteSiteErrors(token(), { status: "resolved" });
            const gone = res && Number.isFinite(Number(res.deleted)) ? Number(res.deleted) : n;
            flash(`Cleared ${num(gone)} resolved ${gone === 1 ? "error" : "errors"}.`);
            details.clear();
            openId = null;
        } catch (err) {
            setBusy(false);
            if (!sessionGone(err)) flash(`Not cleared: ${errText(err)}`, true);
            return;
        }
        setBusy(false);
        await load();
    }

    if (refreshBtn) refreshBtn.addEventListener("click", () => load());

    // ----------------------------------------------------------- timers

    /* Every minute while the panel is on screen and the browser tab is in
       front; stopped when the panel is hidden. A tab brought back after a
       while reads straight away rather than waiting out the minute. */
    function startPanelTimer() {
        if (panelTimer) return;
        panelTimer = setInterval(() => {
            if (panel.hidden || document.hidden || !token()) return;
            load({ auto: true });
        }, REFRESH_MS);
    }
    function stopPanelTimer() {
        clearInterval(panelTimer);
        panelTimer = null;
    }

    function onShownChange() {
        if (panel.hidden) { stopPanelTimer(); return; }
        if (!token()) return;
        startPanelTimer();
        if (!loadedAt || Date.now() - loadedAt > REFRESH_MS || loadError) load();
        else render();
    }
    new MutationObserver(onShownChange).observe(panel, { attributes: true, attributeFilter: ["hidden"] });

    /* The nav badge: open errors seen in the last day, for every account
       that can read the panel. Read on its own when Warren opens and every
       minute after, unless the panel is showing the same list anyway, and
       showing all of it (a list cut off at LIST_LIMIT is not — see load()). */
    function listIsBadgeList() {
        return status === "open" && kind === "all" && !query;
    }
    function listComplete() {
        return groups.length < LIST_LIMIT;
    }
    async function badge() {
        if (!token() || !navCount) return;
        if (!apiReady()) { setBadge(0); return; }
        if (!panel.hidden && listIsBadgeList() && loadedAt && !loadError && listComplete()) return;
        const mine = sessionNo;
        try {
            const data = await Api.getSiteErrors(token(), { status: "open", sort: "last", limit: BADGE_LIMIT });
            if (mine !== sessionNo) return;
            takeClock(data);
            const list = Array.isArray(data && data.groups) ? data.groups : [];
            setBadge(countRecent(list));
        } catch (e) { /* the panel says so when opened */ }
    }
    function startBadgeTimer() {
        if (badgeTimer) return;
        badge();
        badgeTimer = setInterval(() => {
            if (document.hidden) return;
            badge();
        }, REFRESH_MS);
    }

    let lastVisible = Date.now();
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) { lastVisible = Date.now(); return; }
        if (Date.now() - lastVisible < REFRESH_MS / 2) return;
        if (!panel.hidden && token()) load({ auto: true });
        else badge();
    });

    const rail = document.getElementById("admin-rail");
    if (rail) {
        // admin.js reveals the rail once the session is verified.
        const once = new MutationObserver(() => {
            if (rail.style.display !== "none") { once.disconnect(); startBadgeTimer(); }
        });
        once.observe(rail, { attributes: true, attributeFilter: ["style"] });
        if (rail.style.display !== "none") { once.disconnect(); startBadgeTimer(); }
    }

    /* Forget everything the last account read — admin.js calls this on log
       out and when somebody else signs in over an expired session, as it
       does the Missing Pieces and Guides panels. Error reports carry
       visitors' pages, countries and hashed sessions, which is not for
       whoever sits down next. */
    function reset() {
        loadGen++;
        sessionNo++;
        stopPanelTimer();
        status = "open";
        kind = "all";
        query = "";
        sort = "last";
        groups = [];
        totals = {};
        dropped = {};
        limited = {};
        loadedAt = 0;
        loadError = null;
        openId = null;
        details.clear();
        detailErrors.clear();
        detailNode = null;
        detailNodeFor = "";
        openSamples.clear();
        noteDrafts.clear();
        selected.clear();
        busy = false;
        pendingRender = false;
        filtersBuilt = false;
        filtersEl.innerHTML = "";
        listEl.innerHTML = "";
        summaryEl.innerHTML = "";
        bulkEl.innerHTML = "";
        if (updatedEl) updatedEl.textContent = "";
        setBadge(0);
        if (!token()) return;
        onShownChange();
        badge();
    }
    window.AdminErrors = { reset };

    // For tools/ and the console: the pure parts, testable without a server.
    window.AdminErrors._test = { pairs, pct, whereOf, topWho, reportText, sampleFields, crumbOffset, crumbText, crumbsOf, uaOf, series, hourKey, dayKey, countRecent, fmtUtc, ago, tzWords };

    onShownChange();
})();

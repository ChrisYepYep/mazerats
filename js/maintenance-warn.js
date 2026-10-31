/* THE TWO-MINUTE WARNING (30 Oct 2026, the owner's: "If the site is in
   maintenance, but users are on the site, have it display a message dropping
   down from the top bar that says something like 'Maintenance! Site will be
   offline in [2 minute countdown]', after the 2 minute countdown, kick them
   to the landing page").

   home.html's gate only asks once, while the page loads, so a visitor who
   was already in kept the archive for as long as they kept the tab. Now an
   open page asks the settings again every POLL_MS (and the moment a hidden
   tab is looked at again). When it hears Maintenance it drops the warning
   down under the top bar and counts to the moment settings.js stamped
   (maintenanceKickAt: two minutes after the switch), then goes to the
   landing page. Switched back before then, the warning goes away again.

   An admin signed in to the Warren is warned too, but stays: the gate lets
   them in during Maintenance anyway.

   While the warning is up the page tells presence.js it is still here
   every PING_MS, so the Warren can count who is left (js/admin.js). The id
   is random, made for this tab, and never stored; the server forgets it
   two minutes after the last ping, or as soon as this page says goodbye. */
(function () {
    "use strict";
    /* The archive, and Fallin' Furni's own page (30 Oct 2026, the bug scan:
       it is shut by the same switch, and its players were neither warned
       nor moved). Not inside the homepage's game window, which is the same
       page in a frame: the homepage around it does the warning and the move. */
    const page = document.body.dataset.page;
    if (page !== "home" && !(page === "fallinfurni" && window.top === window)) return;

    const POLL_MS = 30000;
    const PING_MS = 10000;
    const WARN_MS = 2 * 60 * 1000;      // the same as _maintenance.js
    // However late a tab hears it (asleep, or its clock behind), it is
    // shown the warning for at least this long before it is moved.
    const LEAST_MS = 20000;
    const PRESENCE = "/.netlify/functions/presence";

    let id = "";
    try {
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        id = Array.from(bytes, b => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-4);
    } catch (e) { id = ""; }

    /* THE SERVER'S CLOCK (30 Oct 2026, the bug scan). The kick time is the
       server's, and a phone three minutes slow counted to it three minutes
       late (and stayed in the Warren's count all that while). Each ping's
       answer says the server's time; the difference, taken at the middle of
       the round trip, is added to this device's clock from then on. */
    let skew = 0;
    const now = () => Date.now() + skew;

    let deadline = 0;           // when this tab goes to the landing page; 0 = no warning
    let admin = null;           // null until asked; then true or false
    let bar = null, timeEl = null, ticker = 0, pinger = 0, poller = 0, pinged = false, gone = false;

    function bucketUrl() {
        return "/.netlify/functions/settings?fresh=" + Math.floor(Date.now() / 10000);
    }

    /* What the last ping heard, and when it was sent (30 Oct 2026, the bug
       scan). A ping is never cached; a poll's answer can be as old as its
       ten-second bucket at the edge. So just after the switch went back, a
       poll could still say Maintenance and drop the warning again (or, just
       after it went on, take it away), until the next ping put it right. A
       poll that disagrees with a ping sent since its bucket began is the
       older word, and is let go. */
    let sureAt = 0, sureMaint = false;

    async function poll() {
        if (gone) return;
        const bucketStart = Math.floor(Date.now() / 10000) * 10000;
        try {
            const res = await fetch(bucketUrl(), { cache: "no-store" });
            if (!res.ok) return;
            const s = await res.json();
            if (!s || typeof s.landingState !== "string") return;
            if (sureAt >= bucketStart && (s.landingState === "maintenance") !== sureMaint) return;
            heard(s.landingState, s.maintenanceKickAt);
        } catch (e) { /* the next poll asks again */ }
    }

    function heard(state, kickAt) {
        if (state !== "maintenance") { stand(); return; }
        const at = Date.parse(kickAt);
        const due = Math.max(Number.isFinite(at) ? at : now() + WARN_MS, now() + LEAST_MS);
        // Kept once set: a later answer only moves it if the switch was
        // turned off and on again (a later stamp), never nearer by a slow clock.
        if (!deadline || (Number.isFinite(at) && at > deadline)) deadline = due;
        warn();
    }

    // Switched back before the count ran out.
    function stand() {
        if (!deadline) return;
        deadline = 0;
        clearInterval(ticker); clearInterval(pinger);
        ticker = pinger = 0;
        goodbye();
        if (bar) {
            bar.classList.remove("mw-open");
            setTimeout(() => { if (!deadline && bar) { bar.remove(); bar = null; } }, 400);
        }
    }

    async function isAdmin() {
        if (admin !== null) return admin;
        let token = null;
        try { token = localStorage.getItem("mazerats_admin_token"); } catch (e) { /* private mode */ }
        if (!token) return (admin = false);
        try {
            // On a leash (30 Oct 2026, the bug scan): a hung check left this
            // tab uncounted, asking again on every poll.
            const ctl = typeof AbortController === "function" ? new AbortController() : null;
            if (ctl) setTimeout(() => ctl.abort(), 8000);
            const res = await fetch("/.netlify/functions/auth", {
                signal: ctl ? ctl.signal : undefined,
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-token": token },
                body: JSON.stringify({ action: "verify" })
            });
            const r = res.ok ? await res.json() : null;
            admin = !!(r && r.username);
        } catch (e) {
            // Unanswered: asked again on the next poll, and moved meanwhile
            // only if the count runs out before then.
            return false;
        }
        return admin;
    }

    async function warn() {
        draw();
        if (!ticker) { ticker = setInterval(tick, 1000); tick(); }
        const isA = await isAdmin();
        if (!deadline) return;
        if (bar) bar.classList.toggle("mw-admin", isA);
        if (isA || !id) return;
        if (!pinger) { pinger = setInterval(ping, PING_MS); ping(); }
    }

    function draw() {
        /* Still here from a stand-down less than 400ms ago (30 Oct 2026, the
           bug scan): dropped down again, or it counted on out of sight. And
           an admin's bar that had said everybody was moved goes back to the
           count when the switch is turned off and on again (a later stamp). */
        if (bar) {
            bar.classList.add("mw-open");
            bar.querySelector(".mw-text").textContent = "Site will be offline in";
            return;
        }
        bar = document.createElement("div");
        bar.className = "mw-bar";
        bar.setAttribute("role", "alert");
        bar.innerHTML =
            '<span class="mw-title">Maintenance!</span> ' +
            '<span class="mw-text">Site will be offline in</span> ' +
            '<span class="mw-time" aria-hidden="true">2:00</span>' +
            '<span class="mw-sr"></span>' +
            '<span class="mw-stay">You\'re signed in, so you\'ll stay.</span>';
        timeEl = bar.querySelector(".mw-time");
        // Read out once, in words, rather than a number changing every second.
        const mins = Math.round(Math.max(0, deadline - now()) / 60000);
        bar.querySelector(".mw-sr").textContent = mins >= 1 ? " about " + (mins === 1 ? "a minute" : mins + " minutes") + "." : " under a minute.";
        place();
        document.body.appendChild(bar);
        // Two frames, so the drop is seen from the top bar rather than appearing.
        requestAnimationFrame(() => requestAnimationFrame(() => bar && bar.classList.add("mw-open")));
    }

    /* Hung from the bottom of the top bar, wherever that is on this screen;
       from the very top while something covers the bar (30 Oct 2026, the bug
       scan: a game window over the header, Fallin' Furni enlarged or on a
       phone, had the warning hanging over its room). */
    function place() {
        if (!bar) return;
        const header = document.querySelector(".site-header");
        const r = header ? header.getBoundingClientRect() : null;
        let top = r ? Math.max(0, Math.round(r.bottom)) : 0;
        if (r && top > 0 && typeof document.elementFromPoint === "function") {
            const at = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.max(0, Math.round(r.bottom) - 3));
            if (!at || !header.contains(at)) top = 0;
        }
        bar.style.top = top + "px";
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });

    function tick() {
        if (!deadline) return;
        place();      // a game window may have opened over the top bar
        const left = Math.max(0, deadline - now());
        const secs = Math.ceil(left / 1000);
        if (timeEl) timeEl.textContent = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
        if (left > 0) return;
        if (admin) {
            if (bar) bar.querySelector(".mw-text").textContent = "Visitors have been moved to the landing page.";
            if (timeEl) timeEl.textContent = "";
            clearInterval(ticker); ticker = 0;
            return;
        }
        leave();
    }

    async function ping() {
        if (!deadline || gone) return;
        pinged = true;
        const sentAt = Date.now();
        try {
            const res = await fetch(PRESENCE, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });
            const r = res.ok ? await res.json() : null;
            const serverAt = r && Date.parse(r.now);
            if (Number.isFinite(serverAt)) skew = serverAt - (sentAt + Date.now()) / 2;
            // The ping is a poll too: switched back, or a later stamp.
            if (r && r.ok === false && r.landingState) { sureAt = sentAt; sureMaint = r.landingState === "maintenance"; heard(r.landingState, ""); }
            else if (r && r.ok) { sureAt = sentAt; sureMaint = true; heard("maintenance", r.kickAt || ""); }
        } catch (e) { /* counted as gone after a while; the count goes on */ }
    }

    function goodbye() {
        if (!pinged || !id) return;
        pinged = false;
        const body = JSON.stringify({ id, leaving: true });
        try {
            if (navigator.sendBeacon && navigator.sendBeacon(PRESENCE, new Blob([body], { type: "application/json" }))) return;
        } catch (e) { /* fetch below */ }
        try { fetch(PRESENCE, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }); } catch (e) { /* the row expires */ }
    }

    // As home.html's gate bounces: said to the error reporter and to the landing page first.
    function leave() {
        if (gone) return;
        gone = true;
        clearInterval(ticker); clearInterval(pinger); clearInterval(poller);
        goodbye();
        try { localStorage.setItem("mazerats_landing_state", "maintenance"); } catch (e) { /* private mode */ }
        try { sessionStorage.setItem("mazerats_bounced", String(Date.now())); } catch (e) { /* the landing page's own guard */ }
        try { if (window.MazeErrors && typeof MazeErrors.leaving === "function") MazeErrors.leaving("/"); } catch (e) { /* never worth staying */ }
        location.replace("/");
    }

    window.addEventListener("pagehide", goodbye);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") poll(); });
    // Hidden tabs too (a browser slows them to about once a minute): a tab
    // left in the background is still a visitor to move.
    poller = setInterval(poll, POLL_MS);
})();

/* THE OFFLINE ARCHIVE, the page's half (2 Nov 2026). The worker is /sw.js;
   its header says what it keeps, when it answers, and the kill switch.

   This file:
     - registers /sw.js, from the archive (/home) only, once the page has
       finished loading, so it never competes with the page for the network;
     - on the very first visit, before the worker was looking, hands it the
       addresses this page has already loaded, which it stores from the
       browser's own cache without downloading anything;
     - tells it to forget everything when this browser carries a whole-site
       ban or was last told the site is shut (the gate in home.html has
       already acted on both; this makes sure nothing is left to show);
     - when the page is offline, says so above the archive, and has the
       games and signing in say they need a connection instead of opening
       onto a failure.

   Loaded at the end of <body>, after the scripts whose openers it guards.
   On another page it only does the forgetting. */
(function () {
    "use strict";
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const home = document.body && document.body.dataset.page === "home";

    // A ban this browser knows of, or a last answer other than "open", or
    // storage that can't be read (the gate's own rule: unreadable is shut).
    function shut() {
        try {
            const b = JSON.parse(localStorage.getItem("mazerats_blocked") || "null");
            if (b && typeof b === "object" && (!b.until || Date.parse(b.until) > Date.now())) return true;
            return localStorage.getItem("mazerats_landing_state") !== "enter";
        } catch (e) { return true; }
    }

    function forget() {
        sw.getRegistration("/").then(reg => {
            const w = reg && (reg.active || reg.waiting || reg.installing);
            if (w) w.postMessage({ type: "mr-forget" });
        }, () => {});
    }

    if (shut()) { forget(); return; }
    if (!home) return;

    const wasControlled = !!sw.controller;

    function register() {
        sw.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(() => sw.ready).then(reg => {
            // Asked again: the gate may have heard a shut answer meanwhile.
            if (shut()) { forget(); return; }
            if (wasControlled || !reg.active) return;
            const urls = [location.href];
            try {
                performance.getEntriesByType("resource").forEach(e => {
                    if (e.name && e.name.indexOf(location.origin + "/") === 0) urls.push(e.name);
                });
            } catch (e) { /* the next visit stores them as they load */ }
            reg.active.postMessage({ type: "mr-seen", urls });
        }).catch(() => { /* no offline copy, and nothing else changes */ });
    }
    if (document.readyState === "complete") setTimeout(register, 0);
    else window.addEventListener("load", () => setTimeout(register, 0), { once: true });

    /* ---- OFFLINE ON THE PAGE ---- */

    let offline = false;

    function goOffline() {
        if (offline) return;
        offline = true;
        guard();
        showNotice();
    }

    /* The notice: home.js's own "archive is offline" panel (the same classes,
       so every palette, skin and dark mode already dress it), above the
       archive window. Not shown when home.js has put up its own, which
       says more (the stored archive was not there either). */
    let notice = null;
    function showNotice() {
        const draw = () => {
            if (document.getElementById("data-degraded-notice")) return;
            if (!notice) {
                const stack = document.querySelector(".archive-stack");
                const host = stack || document.getElementById("browse-window") || document.querySelector(".chrome-window");
                if (!host || !host.parentNode) return;
                notice = document.createElement("div");
                notice.id = "offline-notice";
                notice.className = "callout data-degraded-notice";
                notice.setAttribute("role", "status");
                notice.innerHTML =
                    '<div class="data-degraded-body">' +
                        '<p class="data-degraded-head"></p>' +
                        '<p class="data-degraded-say"></p>' +
                    "</div>" +
                    '<button type="button" class="btn data-degraded-retry">Try again</button>';
                host.parentNode.insertBefore(notice, host);
                const retry = notice.querySelector("button");
                retry.addEventListener("click", () => {
                    retry.disabled = true;
                    retry.textContent = "Reconnecting…";
                    if (window.MazeErrors && typeof MazeErrors.leaving === "function") MazeErrors.leaving();
                    location.reload();
                });
            }
            words();
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw, { once: true });
        else draw();
        // home.js's panel can arrive after this one (its data comes later): then it alone stays.
        try {
            const watch = new MutationObserver(() => {
                if (notice && document.getElementById("data-degraded-notice")) { notice.remove(); notice = null; watch.disconnect(); }
            });
            watch.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => watch.disconnect(), 30000);
        } catch (e) { /* two panels, at worst */ }
    }

    function words() {
        if (!notice) return;
        const back = backSeen && navigator.onLine;
        notice.querySelector(".data-degraded-head").textContent = back ? "You're back online" : "You're offline";
        notice.querySelector(".data-degraded-say").textContent = back
            ? "Showing the archive as last seen. Try again for the latest."
            : "Showing the archive as last seen. Games, signing in and sending things need a connection.";
    }

    /* The games and signing in, while offline: a small notice in the site's
       own window (Account.notice) rather than a game window opening onto an
       error, or a sign-in trip to a page that can't load. Wrapped where the
       menu, the opening view and the boards all call them, on window, so a
       game file arriving later and setting its own opener is wrapped too.
       Never installed on a page that has stayed online. */
    const GAMES = ["openGuessGame", "openOddOneOut", "openFallinFurni", "openPuraPanic", "openRatRace"];

    function needs(what) {
        const say = what === "signin"
            ? "Signing in needs a connection."
            : "The games need a connection.";
        const A = window.Account;
        if (A && typeof A.notice === "function") {
            A.notice({ title: "No Connection", html: `<p class="notice-head">${say}</p><p>The archive is here to look through until you're back online.</p>` });
        } else {
            window.alert(say);
        }
    }

    let guarded = false;
    function guard() {
        if (guarded) return;
        guarded = true;
        GAMES.forEach(name => {
            let inner = window[name];
            const wrap = function () {
                if (offline && !backSeen) { needs("game"); return; }
                return typeof inner === "function" ? inner.apply(this, arguments) : undefined;
            };
            try {
                Object.defineProperty(window, name, {
                    configurable: true,
                    enumerable: true,
                    get() { return typeof inner === "function" ? wrap : inner; },
                    set(v) { inner = v; }
                });
            } catch (e) { /* left as it was: the game says so itself */ }
        });
        const A = window.Account;
        if (A && typeof A.signIn === "function") {
            const signIn = A.signIn;
            A.signIn = function () {
                if (offline && !backSeen) { needs("signin"); return; }
                return signIn.apply(this, arguments);
            };
        }
    }

    // Back on the network: the notice says so; the games stay guarded only
    // until then (what they need is the network, not this page reloaded).
    let backSeen = false;
    window.addEventListener("online", () => { backSeen = true; words(); });
    window.addEventListener("offline", () => { backSeen = false; if (offline) words(); else goOffline(); });

    if (navigator.onLine === false) goOffline();
    // Handed a copy by the worker: on load (asked), or later (told).
    sw.addEventListener("message", e => { if (e.data && e.data.type === "mr-offline") goOffline(); });
    if (wasControlled && typeof MessageChannel === "function") {
        const ch = new MessageChannel();
        ch.port1.onmessage = e => { if (e.data && e.data.offline) goOffline(); };
        try { sw.controller.postMessage({ type: "mr-status" }, [ch.port2]); } catch (e) { /* the 'offline' event still tells */ }
    }
})();

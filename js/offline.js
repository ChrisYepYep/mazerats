/* THE OFFLINE ARCHIVE, the page's half (2 Nov 2026). The worker is /sw.js;
   its header says what it keeps, when it answers, and the kill switch.

   This file:
     - registers /sw.js, from the archive (/home) only, once the page has
       finished loading, so it never competes with the page for the network;
     - once the page has finished loading, tells it so, with the scripts and
       stylesheets it ran on, which it keeps together with the page; and on
       the very first visit, before the worker was looking, the other
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

    /* "shut": a ban this browser knows of, a last answer other than "open",
       or storage that can't be read (the gate's own rule: unreadable is
       shut). "open": last told "enter". null: NOT YET KNOWN (3 Nov 2026, the
       bug scan). A missing mazerats_landing_state used to count as shut, but
       on a first visit nothing has stored one yet when this runs, so the
       very visit this worker exists for forgot everything and never
       registered it. Now a missing one waits for the gate's answer (see
       whenKnown), and only a state known to be shut forgets. */
    function state() {
        try {
            const b = JSON.parse(localStorage.getItem("mazerats_blocked") || "null");
            if (b && typeof b === "object" && (!b.until || Date.parse(b.until) > Date.now())) return "shut";
            const s = localStorage.getItem("mazerats_landing_state");
            if (s === null) return null;
            return s === "enter" ? "open" : "shut";
        } catch (e) { return "shut"; }
    }

    function forget() {
        sw.getRegistration("/").then(reg => {
            const w = reg && (reg.active || reg.waiting || reg.installing);
            if (w) w.postMessage({ type: "mr-forget" });
        }, () => {});
    }

    if (state() === "shut") { forget(); return; }
    if (!home) return;

    const wasControlled = !!sw.controller;

    /* Runs go once the state is known to be open. Not yet known: home.html's
       gate publishes its settings answer as the promise window.__mrSettings
       and stores the state it says (rememberState) in its own handler on that
       promise, which was attached before this one; so once it settles, and a
       turn later, the stored state is the answer. Shut then forgets; still
       unknown (no answer, offline on a first visit) does neither. */
    function whenKnown(go) {
        const now = state();
        if (now === "open") { go(); return; }
        if (now === "shut") { forget(); return; }
        const asked = window.__mrSettings;
        if (!asked || typeof asked.then !== "function") return;
        asked.then(() => {}, () => {}).then(() => setTimeout(() => {
            const then = state();
            if (then === "open") go();
            else if (then === "shut") forget();
        }, 0));
    }

    function register() {
        sw.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(() => sw.ready).then(reg => {
            // Asked again: the gate may have heard a shut answer meanwhile.
            if (state() === "shut") { forget(); return; }
            if (!reg.active) return;
            // This load came from the copy: it has nothing new to give it.
            if (offline || navigator.onLine === false) return;
            reg.active.postMessage(loaded());
            // A worker taking over from an older one didn't hear that, and clears the old copy.
            sw.addEventListener("controllerchange", () => {
                if (state() === "shut") return;
                sw.ready.then(now => { if (now.active) now.active.postMessage(loaded()); }).catch(() => {});
            }, { once: true });
        }).catch(() => { /* no offline copy, and nothing else changes */ });
    }

    /* The page, and the scripts and stylesheets it ran on: the worker keeps
       these together as one set, and this message is what tells it that the
       load got to the end (see sw.js). The address it was loaded at, which
       the page may already have replaced in the bar. The tags as well as the
       timings, as the browser's timing list stops at 250 entries. */
    function loaded() {
        const files = [];
        document.querySelectorAll('script[src], link[rel="stylesheet"][href]').forEach(el => files.push(el.src || el.href));
        let page = location.href;
        const urls = [];
        try {
            const nav = performance.getEntriesByType("navigation")[0];
            if (nav && nav.name) page = nav.name;
            performance.getEntriesByType("resource").forEach(e => {
                if (!e.name || e.name.indexOf(location.origin + "/") !== 0) return;
                if (/^\/(?:js|css)\//.test(new URL(e.name).pathname)) files.push(e.name);
                // On the first visit the worker wasn't looking: the rest of what the page has loaded too.
                else if (!wasControlled) urls.push(e.name);
            });
        } catch (e) { /* the tags alone, then */ }
        const stamp = document.querySelector('meta[name="mazerats:build"]');
        return { type: "mr-loaded", page, build: stamp ? stamp.getAttribute("content") : "", files, urls };
    }
    const start = () => setTimeout(() => whenKnown(register), 0);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

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
                    '<button type="button" class="view-switch-btn data-degraded-retry">Try again</button>';
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
            A.notice({ title: "No connection", html: `<p class="notice-head">${say}</p><p>The archive is here to look through until you're back online.</p>` });
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
    function backOnline() {
        if (!offline || backSeen) return;
        backSeen = true;
        words();
    }
    window.addEventListener("online", backOnline);
    window.addEventListener("offline", () => { backSeen = false; if (offline) words(); else goOffline(); });

    /* NOT ONLY THE `online` EVENT (3 Nov 2026, the bug scan). That event
       only fires after the browser itself went offline, so a page put here
       by a failed request while the browser stayed online (the page's own
       load served from the copy in a blip) stayed "offline" for good, with
       the games and Sign in blocked. Now it is also back when the worker
       says the network answered one of this page's requests (mr-online), or
       when the page is looked at again (visible, or focused) with
       navigator.onLine true and a same-origin request the worker leaves
       alone (/sw.js itself, not stored, never answered from a copy) gets an
       answer. */
    let probing = false;
    function check() {
        if (!offline || backSeen || probing || navigator.onLine !== true) return;
        if (document.visibilityState === "hidden") return;
        probing = true;
        fetch("/sw.js", { method: "HEAD", cache: "no-store" })
            .then(() => backOnline(), () => { /* still no network */ })
            .then(() => { probing = false; });
    }
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);

    if (navigator.onLine === false) goOffline();
    /* Handed a copy by the worker: on load (asked), or later (told). Only the
       page itself coming from the copy (page: true) is offline outright; any
       other request answered from it (a thumbnail, a script, a data read the
       network dropped once) only counts while the browser says it is offline
       (3 Nov 2026, the bug scan: one dropped thumbnail used to do it). */
    sw.addEventListener("message", e => {
        const d = e.data || {};
        if (d.type === "mr-offline" && (d.page !== false || navigator.onLine === false)) goOffline();
        else if (d.type === "mr-online") backOnline();
    });
    if (wasControlled && typeof MessageChannel === "function") {
        const ch = new MessageChannel();
        ch.port1.onmessage = e => { if (e.data && e.data.offline) goOffline(); };
        try { sw.controller.postMessage({ type: "mr-status" }, [ch.port2]); } catch (e) { /* the 'offline' event still tells */ }
    }
})();

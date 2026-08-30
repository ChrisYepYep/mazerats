/* First-party interaction logging: which parts of the site actually get used.

   Every constraint here is one the privacy policy makes in writing, so if you
   change the behaviour, change the policy with it:

     · No IP and no account is stored against an event. The endpoint
       (netlify/functions/track.js) drops the address rather than recording
       it, so these rows cannot be tied back to a person.
     · The only identifier is a random value in sessionStorage. It dies with
       the tab — there is nothing that survives a visit, so there is no way
       to recognise a returning visitor or follow one across sites.
     · Search TERMS are never sent, only the fact that a search happened. A
       search box is free text and people put anything in one.
     · Do Not Track and Global Privacy Control are honoured. If either is
       set, nothing is collected at all — not a reduced set, nothing.
     · The admin page is never tracked. It is a tool, and what admins do is
       already recorded properly in the audit log.

   Events are buffered and flushed together rather than sent per click, so a
   busy reader costs a handful of requests rather than a hundred. */
(function () {
    "use strict";

    // Anything that isn't a public page of the site is out of scope.
    if (document.body.dataset.page === "admin") return;

    /* Opting out is not a preference to be weighed against ours — if either
       signal is set, this file does nothing for the rest of the visit. */
    const optedOut =
        navigator.globalPrivacyControl === true ||
        navigator.doNotTrack === "1" ||
        window.doNotTrack === "1" ||
        navigator.msDoNotTrack === "1";
    if (optedOut) return;

    const SESSION_KEY = "mazerats_session";
    const ENDPOINT = "/.netlify/functions/track";
    const FLUSH_MS = 4000;
    const MAX_BUFFER = 20;

    /* Random, and scoped to sessionStorage so it is gone when the tab closes.
       Deliberately NOT localStorage: a persistent id would turn this from
       "what gets used" into "what this person does", which is the line the
       policy draws. */
    let session = null;
    try {
        session = sessionStorage.getItem(SESSION_KEY);
        if (!session) {
            session = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
            sessionStorage.setItem(SESSION_KEY, session);
        }
    } catch (e) {
        // Private mode, or storage refused. Carry on without an id: the rows
        // are still useful in aggregate, just not groupable into visits.
        session = null;
    }

    let buffer = [];
    let timer = null;

    function flush(useBeacon) {
        if (!buffer.length) return;
        const payload = JSON.stringify({ session: session, events: buffer });
        buffer = [];
        clearTimeout(timer);
        timer = null;
        try {
            // sendBeacon survives the page going away, which is exactly when
            // the last few events of a visit would otherwise be lost.
            if (useBeacon && navigator.sendBeacon) {
                navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
                return;
            }
            fetch(ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                keepalive: true,
            }).catch(function () { /* analytics must never surface an error */ });
        } catch (e) { /* likewise */ }
    }

    /* name  what happened  ("maze", "tab", "photo", "furni", "search"…)
       label which thing    (an id or a short label; never free text a
             visitor typed) */
    function track(name, label) {
        buffer.push({
            name: String(name).slice(0, 40),
            label: label == null ? null : String(label).slice(0, 80),
            at: Date.now(),
        });
        if (buffer.length >= MAX_BUFFER) return flush(false);
        if (!timer) timer = setTimeout(function () { flush(false); }, FLUSH_MS);
    }

    window.Track = { event: track };

    // Which page, and nothing about how you got here.
    track("page", document.body.dataset.page || "unknown");

    /* One delegated listener rather than a hook in every component: anything
       that wants to be counted marks itself up with data-track, so adding a
       new one is a markup change and this file never grows. */
    document.addEventListener("click", function (e) {
        const el = e.target.closest("[data-track]");
        if (!el) return;
        track(el.dataset.track, el.dataset.trackLabel || null);
    }, true);

    // Send what is left when the visit ends. visibilitychange fires reliably
    // on mobile where unload often does not.
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") flush(true);
    });
    window.addEventListener("pagehide", function () { flush(true); });
})();

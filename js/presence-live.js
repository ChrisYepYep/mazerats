/* How many people are on the site right now (14 Nov 2026, the owner's: "give me a live counter of how many people are currently on the
   website" in the Warren's Controls, "Users: [number]").

   Each open page of the site says it is here to /.netlify/functions/presence, with a random id made for this tab (never stored in the
   browser, gone with the tab), and says goodbye when it closes. The server keeps only that id and the time of the last check-in, and
   deletes it a few minutes after the last one (see presence.js and the privacy policy). Not in a frame (the homepage's game window and
   the Hallway are the same site inside the page): the page around them counts. Not on the Warren.

   HOW OFTEN (14 Nov 2026, the bug scan: every check-in is a function run and a database write, and a tab left open overnight sent one a
   minute all night):
     looked at          once a minute, and on coming back to the tab, but never twice within MIN_GAP_MS;
     in the background  every HIDDEN_MS, telling the server so (it counts that check-in for longer);
     hidden for good    nothing after STOP_HIDDEN_MS in the background, so the tab drops out of the count until it is looked at again.
   And not at all with Do Not Track or Global Privacy Control on, as js/track.js, or for a bot or a crawler that runs scripts. */
(function () {
    "use strict";
    if (window.top !== window) return;
    try {
        if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.msDoNotTrack === "1") return;
        // The same tests as js/track.js: automation saying so itself, a user agent naming a crawler, an iPhone no real iPhone matches.
        const ua = navigator.userAgent || "";
        if (navigator.webdriver === true
            || /bot|crawl|spider|slurp|headless|lighthouse/i.test(ua)
            || (/iPhone|iPod/.test(ua) && (window.devicePixelRatio || 1) < 2)) return;
    } catch (e) { /* counted */ }

    const URL_ = "/.netlify/functions/presence";
    const EVERY_MS = 60000, HIDDEN_MS = 240000, STOP_HIDDEN_MS = 30 * 60000, MIN_GAP_MS = 20000;
    let id = "";
    function newId() {
        const b = new Uint8Array(12);
        crypto.getRandomValues(b);
        return Array.from(b, n => (n % 36).toString(36)).join("") + Date.now().toString(36).slice(-4);
    }
    try { id = newId(); } catch (e) { return; }
    let here = false, last = 0, timer = 0;
    const hidden = () => document.visibilityState === "hidden";
    let hiddenSince = hidden() ? Date.now() : 0;

    function send(leaving) {
        if (leaving) {
            const body = JSON.stringify({ id, live: true, leaving: true });
            try { if (navigator.sendBeacon && navigator.sendBeacon(URL_, new Blob([body], { type: "application/json" }))) return; } catch (e) { /* fetch below */ }
            try { fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }); } catch (e) { /* the row expires */ }
            return;
        }
        here = true;
        last = Date.now();
        const body = JSON.stringify(hidden() ? { id, live: true, hidden: true } : { id, live: true });
        try { fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", "X-Background": "1" }, body }).catch(() => { /* the next one covers it */ }); } catch (e) { /* the next one covers it */ }
    }
    /* One timer, set again after each check-in at the pace for how the tab is now. Going into the background leaves the one already set
       (within a minute), which tells the server the tab is hidden; after that it is every HIDDEN_MS, until STOP_HIDDEN_MS. */
    function schedule(ms) {
        clearTimeout(timer);
        timer = setTimeout(tick, ms);
    }
    function tick() {
        timer = 0;
        if (hidden() && hiddenSince && Date.now() - hiddenSince >= STOP_HIDDEN_MS) return;   // started again when looked at
        send(false);
        schedule(hidden() ? HIDDEN_MS : EVERY_MS);
    }
    tick();
    document.addEventListener("visibilitychange", () => {
        if (hidden()) {
            if (!hiddenSince) hiddenSince = Date.now();
            if (!timer) schedule(EVERY_MS);
            return;
        }
        hiddenSince = 0;
        // Back from the background (or a phone waking): straight away rather than up to a minute later, unless it has just checked in.
        if (Date.now() - last >= MIN_GAP_MS) tick();
        else schedule(EVERY_MS - (Date.now() - last));
    });
    window.addEventListener("pagehide", () => { if (here) { here = false; send(true); } });
    /* Back from the back-forward cache: a new id, because the server ignores the old one for a minute after its goodbye. */
    window.addEventListener("pageshow", e => {
        if (!e.persisted) return;
        try { id = newId(); } catch (e2) { return; }
        hiddenSince = hidden() ? Date.now() : 0;
        tick();
    });
})();

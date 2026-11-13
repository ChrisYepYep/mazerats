/* How many people are on the site right now (14 Nov 2026, the owner's: "give me a live counter of how many people are currently on the
   website" in the Warren's Controls, "Users: [number]").

   Each open page of the site says it is here once a minute to /.netlify/functions/presence, with a random id made for this tab (never
   stored in the browser, gone with the tab), and says goodbye when it closes. The server keeps only that id and the time of the last
   check-in, and deletes it a couple of minutes after the last one (see presence.js and the privacy policy). Not in a frame (the
   homepage's game window and the Hallway are the same site inside the page): the page around them counts. Not on the Warren. */
(function () {
    "use strict";
    if (window.top !== window) return;
    const URL_ = "/.netlify/functions/presence", EVERY_MS = 60000;
    let id = "";
    try { const b = new Uint8Array(12); crypto.getRandomValues(b); id = Array.from(b, n => (n % 36).toString(36)).join("") + Date.now().toString(36).slice(-4); } catch (e) { return; }
    let here = false;
    /* sent while hidden too: a tab in the background is still on the site (a browser slows its timer to about once a minute anyway) */
    function ping() { send(false); }
    function send(leaving) {
        const body = JSON.stringify(leaving ? { id, live: true, leaving: true } : { id, live: true });
        if (leaving) {
            try { if (navigator.sendBeacon && navigator.sendBeacon(URL_, new Blob([body], { type: "application/json" }))) return; } catch (e) { /* fetch below */ }
            try { fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }); } catch (e) { /* the row expires */ }
            return;
        }
        here = true;
        try { fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", "X-Background": "1" }, body }).catch(() => { /* the next one covers it */ }); } catch (e) { /* the next one covers it */ }
    }
    ping();
    setInterval(ping, EVERY_MS);
    /* back from the background (or a phone waking): straight away rather than up to a minute later */
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ping(); });
    window.addEventListener("pagehide", () => { if (here) { here = false; send(true); } });
    window.addEventListener("pageshow", e => { if (e.persisted) ping(); });
})();

/* The Warren's workshop shell (25 Oct 2026; css/warren.css): the section's
   name in the top bar, and the status line along the foot.

   It only WATCHES the page. js/admin.js still decides which section is
   showing (the .active button in #admin-nav), who is signed in (the text of
   #admin-session-user) and when the session ends (the token it keeps in
   localStorage) — this reads those and says them in two more places, so
   none of admin.js's own logic has to know the shell exists. */
(function () {
    "use strict";

    const TOKEN_KEY = "mazerats_admin_token";
    const $ = (id) => document.getElementById(id);

    function start() {
        const nav = $("admin-nav");
        const where = $("wr-where");
        const user = $("admin-session-user");
        const who = $("wr-status-who");
        const left = $("wr-status-session");
        const net = $("wr-status-net");
        const content = $("admin-content");

        // The section showing, by its button's own label.
        function sayWhere() {
            if (!nav || !where) return;
            const on = nav.querySelector(".chrome-nav-btn.active .chrome-nav-btn-label");
            const name = on ? on.textContent.trim() : "";
            where.textContent = name;
            document.title = (name ? name + " · " : "") + "The Warren — Maze Rats";
        }
        if (nav) new MutationObserver(sayWhere).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
        sayWhere();

        // Who, and as what: the account button's text and its title (the role).
        function sayWho() {
            if (!who || !user) return;
            const name = (user.textContent || "").trim();
            const signedIn = Boolean(name) && content && content.style.display !== "none";
            who.innerHTML = "";
            const dot = document.createElement("span");
            dot.className = "wr-dot" + (signedIn ? "" : " is-out");
            who.appendChild(dot);
            if (!signedIn) { who.appendChild(document.createTextNode("Signed out")); return; }
            who.appendChild(document.createTextNode("Signed in as "));
            const b = document.createElement("b");
            b.textContent = name;
            who.appendChild(b);
            if (user.title) who.appendChild(document.createTextNode(" · " + user.title));
        }
        if (user) new MutationObserver(sayWho).observe(user, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["title"] });
        if (content) new MutationObserver(() => { sayWho(); sayLeft(); }).observe(content, { attributes: true, attributeFilter: ["style"] });
        sayWho();

        /* How long the session has left. The token is a JWT and carries its
           own expiry; nothing here checks it is genuine — the server does
           that on every request — it only reads the time on it. */
        function expiry() {
            let token = null;
            try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
            if (!token || token.split(".").length !== 3) return null;
            try {
                const body = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
                const exp = JSON.parse(atob(body)).exp;
                return typeof exp === "number" ? exp * 1000 : null;
            } catch (e) { return null; }
        }
        function sayLeft() {
            if (!left) return;
            const end = expiry();
            const signedIn = content && content.style.display !== "none";
            if (!end || !signedIn) { left.textContent = ""; left.className = ""; return; }
            const ms = end - Date.now();
            if (ms <= 0) { left.textContent = "Session ended — sign in again"; left.className = "wr-warn"; return; }
            const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
            left.textContent = "Session ends in " + (h ? h + "h " : "") + m + "m";
            // The last half hour, said in amber: a save after it fails.
            left.className = ms < 30 * 60000 ? "wr-warn" : "";
        }
        sayLeft();
        setInterval(sayLeft, 30000);

        function sayNet() {
            if (!net) return;
            net.textContent = navigator.onLine ? "" : "Offline — changes will not save";
            net.className = navigator.onLine ? "" : "wr-warn";
        }
        window.addEventListener("online", sayNet);
        window.addEventListener("offline", sayNet);
        sayNet();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();

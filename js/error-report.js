/* Error reporting: what went wrong in a visitor's browser, sent to /warren's
   Errors tab so it can be fixed without anybody having to describe it
   (28 Sept 2026).

   Loaded FIRST in every page's <head>, before the gate script, so that a
   failure anywhere in the page — the gate included — is seen. That makes
   the rules for this file stricter than for any other:

     · IT MUST NEVER BREAK A PAGE. Every entry point is wrapped, every wrapped
       browser function (fetch, console.error, history.pushState) calls the
       original first-class and returns exactly what it returned, and if
       anything in here throws, the page carries on as though this file were
       not there. Written in plain ES5 for the same reason: the browsers that
       fail are often the old ones, and a syntax error here would take the
       report of that failure with it.
     · IT IS OPERATIONAL, NOT ANALYTICS. So it runs with Do Not Track set —
       a report of a broken page is not tracking — but NOT with Global
       Privacy Control, which asks for nothing to be collected at all. The
       privacy policy says both (js/privacy-content.js, "Error reports").
     · WHAT A REPORT HOLDS is only what is listed in that policy. No address
       (the server never stores one), no account (signedIn is a yes or no),
       and nothing the visitor typed: every URL is cut to its path and a
       short list of known query keys, a search is kept only as its length,
       and a click is described by the element's tag, id and classes and the
       button's own label — never an input's value. The visit id is the same
       random, per-tab value js/track.js keeps (mazerats_session), and the
       server stores it only hashed.

   Reports are batched (sent two seconds after the first, or when the page
   goes away), deduplicated (the same failure twice is one report with a
   count), and capped: ten distinct failures a page, thirty a visit. The
   server caps again, per network and for the whole site (see
   netlify/functions/_errors.js); this is only the first line of that.

   window.MazeErrors.report(err, context) is for code that catches an error
   on purpose and still wants it seen: `context` is a small flat object of
   numbers, booleans and short strings. */
(function () {
    "use strict";
    var noop = { report: function () {} };
    try {
        if (window.MazeErrors) return;             // loaded twice: the first copy has it
        var nav = window.navigator || {};
        if (nav.globalPrivacyControl === true || robot(nav)) {
            window.MazeErrors = noop;
            return;
        }
        install(nav);
    } catch (e) {
        try { if (!window.MazeErrors) window.MazeErrors = noop; } catch (e2) { /* nothing more to do */ }
    }

    /* A machine, not a visitor (3 Oct 2026). A crawler calling itself
       "Chrome 138, Android 10" on a 400x400 screen, with no pointer and no
       touch, loaded the landing page with pictures switched off and filed
       every one of them as a failure. The server's "Bot" label only reads
       the user agent, which said nothing. Automation says so itself in
       navigator.webdriver; failing that, a phone with no touch and no
       pointer is not a phone anybody is holding. */
    function robot(nav) {
        try {
            if (nav.webdriver === true) return true;
            var phone = /Android|iPhone|iPad|iPod/i.test(nav.userAgent || "");
            var pointless = window.matchMedia && window.matchMedia("(any-pointer: none)").matches;
            return phone && nav.maxTouchPoints === 0 && !!pointless;
        } catch (e) { return false; }
    }

    function install(nav) {
        var ENDPOINT = "/.netlify/functions/site-errors";
        var SESSION_KEY = "mazerats_session";          // js/track.js's own key, on purpose
        var SENT_KEY = "mazerats_error_reports";
        var PAGE_MAX = 10;
        var SESSION_MAX = 30;
        var FLUSH_MS = 2000;
        var CRUMBS_MAX = 15;
        var STACK_MAX = 4096;
        var FRAMES_MAX = 30;
        var BATCH_BYTES = 30000;                       // the server refuses past 32KB
        /* The query keys a URL may keep, as the server's list (SAFE_KEYS in
           netlify/functions/_errors.js); change one, change both. */
        var SAFE_KEYS = { g: 1, debug: 1, edit: 1, fresh: 1, signin: 1, range: 1, action: 1, kind: 1, full: 1, status: 1, sort: 1, tab: 1, game: 1 };
        /* Things that are not the site's to fix. A browser extension's code
           runs in the page and its errors land here; a blocked analytics
           script is the ad blocker working as intended. Counted, not sent. */
        var EXTENSION = /(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\//;
        /* And a browser's OWN scripts (5 Oct 2026): Firefox for iPhone (which
           reports itself as Safari) and the wallet add-ons run code in the
           page that comes from no file at all, so it is put down to the
           page's address, line 1 — where every page here has its doctype and
           no script can be. Told apart by that, or by the browser's own
           names in the message (__firefox__, Chrome for iPhone's __gCrWeb,
           a wallet's window.ethereum). Counted, not sent. */
        var BROWSER_OWN = /__firefox__|__gCrWeb|\bethereum\b|webkit\.messageHandlers/;
        function injected(message, file, line) {
            if (BROWSER_OWN.test(message || "")) return true;
            return !!file && line <= 1 && !/\.m?js(?:[?#]|$)/i.test(file);
        }
        /* Also not ours (29 Sept 2026): a player's picture that the picture's
           owner would not draw. Habbo's imager (habbo-imaging on www or on
           an Origins hotel, and images.habbo.com, which it redirects to)
           answers a misspelt or banned name, or a busy minute, with a
           failure, and a Discord avatar goes when its owner changes it.
           These are expected, and they came in batches — a Warren list of
           avatars on a bad Habbo afternoon — spending the ten a page and
           thirty a visit that a real failure needs. The hosts are the ones
           the CSP's img-src allows in netlify.toml; cleanUrl writes a
           foreign URL as //host/path, which is what this is matched to. */
        var NOT_OURS = new RegExp("^//(?:" + [
            "(?:cloud|gateway)\\.umami\\.is/",
            "(?:www|origins)\\.habbo\\.[a-z.]{2,8}/habbo-imaging/",
            "images\\.habbo\\.com/",
            "cdn\\.discordapp\\.com/(?:embed/)?avatars/"
        ].join("|") + ")");

        var T0 = Date.now();
        var origFetch = typeof window.fetch === "function" ? window.fetch : null;
        var crumbs = [];
        var seen = {};                                  // fingerprint -> { rep, sent, extra }
        var pending = [];                               // fingerprints not yet sent
        var distinct = 0;
        var ignored = 0;
        var timer = null;
        var busy = false;
        // Set by pagehide: see the network-failure hold in the fetch watcher.
        var leaving = false;
        // Every pagehide, ever: `leaving` alone is put back by pageshow.
        var hides = 0;
        var LEAVE_GRACE_MS = 1500;

        /* ---------------------------------------------------- small helpers */

        function sinceLoad() {
            try { return Math.round(window.performance.now()); } catch (e) { return Date.now() - T0; }
        }
        function iso() {
            try { return new Date().toISOString(); } catch (e) { return ""; }
        }
        function cut(s, max) {
            return typeof s === "string" ? s.slice(0, max) : "";
        }
        function decode(s) {
            try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch (e) { return s; }
        }

        /* A URL down to its path, the known keys, a search's LENGTH and no
           hash; our own origin dropped, anybody else's host kept. */
        function cleanUrl(raw, max) {
            if (!raw) return "";
            var u;
            try { u = new URL(String(raw).slice(0, 2000), location.href); } catch (e) { return ""; }
            if (u.protocol === "data:" || u.protocol === "blob:") return u.protocol;
            if (u.protocol !== "http:" && u.protocol !== "https:") return u.protocol + "//" + (u.host || "");
            var kept = [];
            var pairs = u.search ? u.search.slice(1).split("&") : [];
            for (var i = 0; i < pairs.length && kept.length < 6; i++) {
                if (!pairs[i]) continue;
                var eq = pairs[i].indexOf("=");
                var k = decode(eq < 0 ? pairs[i] : pairs[i].slice(0, eq));
                var v = eq < 0 ? "" : decode(pairs[i].slice(eq + 1));
                if (k === "q") kept.push(/^<\d{1,5} chars>$/.test(v) ? "q=" + v : "q=<" + v.length + " chars>");
                else if (SAFE_KEYS[k] === 1) kept.push(/^[A-Za-z0-9_-]{1,40}$/.test(v) ? k + "=" + v : k);
            }
            var path = u.pathname;
            try { path = decodeURI(path); } catch (e) { /* keep it encoded */ }
            // As the server does: "%00" and friends decode to control characters.
            path = path.replace(/[\u0000-\u001f\u007f]/g, "");
            var out = (u.host === location.host ? "" : "//" + u.host) + path + (kept.length ? "?" + kept.join("&") : "");
            return out.slice(0, max || 300);
        }

        // The same cut inside free text, plus a few things never to send.
        function scrub(text, max) {
            if (typeof text !== "string" || !text) return "";
            var s = text.slice(0, max * 2);
            s = s.replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "<jwt>");
            s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
            s = s.replace(/\b(https?:\/\/[^\s"'`)<>]+?)((?::\d+){1,2})?(?=[\s"'`)<>]|$)/g, function (m, url, pos) {
                return cleanUrl(url, 300) + (pos || "");
            });
            return s.slice(0, max);
        }

        function cleanStack(stack) {
            if (typeof stack !== "string" || !stack) return "";
            return scrub(stack.split("\n").slice(0, FRAMES_MAX + 1).join("\n"), STACK_MAX);
        }

        /* The first frame of a stack that is not this file: where the failure
           really was. Chrome writes "at f (url:1:2)", Firefox and Safari
           "f@url:1:2"; both end in url:line:col. */
        function topFrame(stack) {
            var lines = String(stack || "").split("\n");
            for (var i = 0; i < lines.length; i++) {
                if (/error-report\.js/.test(lines[i])) continue;
                var m = /((?:https?|file):\/\/[^\s()@]+?):(\d+):(\d+)/.exec(lines[i]);
                if (m) return { source: m[1], line: +m[2], col: +m[3] };
            }
            return { source: "", line: 0, col: 0 };
        }

        function fnOf(url) {
            var m = /^\/\.netlify\/functions\/([A-Za-z0-9_-]+)/.exec(cleanUrl(url, 300));
            return m ? m[1] : "";
        }

        /* An element, briefly: tag#id.class.class — enough to find it in the
           page's markup, and nothing it holds. `bare` leaves the id out, for
           anything inside data-crumb-private (30 Sept 2026): ids there were
           built from Discord IDs, which then sat in breadcrumbs for 90 days.
           And a long run of digits in any id is taken out, in case one
           somewhere else still is. */
        function describe(el, bare) {
            if (!el || !el.tagName) return "";
            var s = el.tagName.toLowerCase();
            if (el.id && !bare) s += "#" + String(el.id).replace(/\d{6,}/g, "#").slice(0, 30);
            var cls = typeof el.className === "string" ? el.className.replace(/^\s+|\s+$/g, "").split(/\s+/) : [];
            for (var i = 0; i < cls.length && i < 2; i++) if (cls[i]) s += "." + cls[i].slice(0, 30);
            return s.slice(0, 80);
        }

        /* The first `max` characters of an element's text, read a text node
           at a time and stopping there — never the whole of textContent,
           which for a big button with a list in it (or anything larger) is
           built in full just to be cut. Text inside an editable region or a
           form field is somebody's typing, not a label, and is skipped
           (29 Sept 2026). */
        function shortText(el, max) {
            var out = "";
            try {
                var walker = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */, null, false);
                var node;
                while (out.length < max && (node = walker.nextNode())) {
                    var p = node.parentElement;
                    if (p && (p.isContentEditable || /^(?:TEXTAREA|SCRIPT|STYLE)$/.test(p.tagName))) continue;
                    /* Joined as textContent joins them, with nothing
                       between, and markup's indentation squeezed as it
                       goes so it cannot spend the budget. */
                    out = (out + node.nodeValue.slice(0, max * 4)).replace(/\s+/g, " ").replace(/^ /, "");
                }
            } catch (e) { /* no label, then */ }
            return out.slice(0, max);
        }

        function sessionId() {
            try {
                var s = sessionStorage.getItem(SESSION_KEY);
                if (!s) {
                    s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
                    sessionStorage.setItem(SESSION_KEY, s);
                }
                return s;
            } catch (e) {
                return null;
            }
        }
        function sentThisVisit() {
            try { return parseInt(sessionStorage.getItem(SENT_KEY), 10) || 0; } catch (e) { return 0; }
        }
        function countSent() {
            try { sessionStorage.setItem(SENT_KEY, String(sentThisVisit() + 1)); } catch (e) { /* private mode */ }
        }

        /* ---------------------------------------------------- breadcrumbs */

        function crumb(c) {
            try {
                c.t = sinceLoad();
                c.at = iso();
                crumbs.push(c);
                if (crumbs.length > CRUMBS_MAX) crumbs.shift();
            } catch (e) { /* a lost crumb is fine */ }
        }

        /* Which windows were open: the state classes on <html> and <body>
           (modal-open, has-open-dialog, ff-immersive…) and every open window
           or dialog the page marks as such. */
        function openWindows() {
            var out = [];
            try {
                var roots = [["html", document.documentElement], ["body", document.body]];
                for (var r = 0; r < roots.length; r++) {
                    var el = roots[r][1];
                    if (!el || typeof el.className !== "string") continue;
                    var cls = el.className.split(/\s+/);
                    for (var i = 0; i < cls.length && out.length < 6; i++) if (cls[i]) out.push(roots[r][0] + "." + cls[i].slice(0, 40));
                }
                if (document.querySelectorAll) {
                    /* Only what is really showing (5 Oct 2026, the bug scan):
                       aria-modal is set on the site's dialogs whether they
                       are open or not, so every report listed every dialog
                       on the page as open and pushed the one that was off
                       the end of the list. A dialog counts when it is
                       rendered; the .open classes are trusted as they are. */
                    var open = document.querySelectorAll(".open[id], .is-open[id], dialog[open], [aria-modal=\"true\"]");
                    for (var j = 0; j < open.length && out.length < 12; j++) {
                        var w = open[j];
                        if (w.getAttribute("aria-modal") === "true" && !/\b(?:is-)?open\b/.test(w.className || "") && !(w.getClientRects && w.getClientRects().length)) continue;
                        out.push(describe(w));
                    }
                }
            } catch (e) { /* what was gathered will do */ }
            return out;
        }

        function environment() {
            var env = {};
            try {
                env.page = location.pathname.slice(0, 200);
                env.url = cleanUrl(location.href, 300);
                env.title = cut(document.title, 120);
                env.at = iso();
                // As the browser gives it: minutes BEHIND UTC, so UTC+1 is -60.
                env.tzOffset = new Date().getTimezoneOffset();
                env.sinceLoad = sinceLoad();
                env.lang = cut(nav.language, 20);
                env.viewport = window.innerWidth + "x" + window.innerHeight;
                if (window.screen) env.screen = window.screen.width + "x" + window.screen.height;
                env.dpr = window.devicePixelRatio || 1;
                if (window.matchMedia) {
                    env.pointer = window.matchMedia("(pointer: coarse)").matches ? "coarse"
                        : window.matchMedia("(pointer: fine)").matches ? "fine" : "none";
                }
                if (typeof nav.maxTouchPoints === "number") env.touch = nav.maxTouchPoints;
                if (typeof nav.onLine === "boolean") env.online = nav.onLine;
                env.visibility = document.visibilityState || "";
                if (nav.connection && nav.connection.effectiveType) env.net = cut(nav.connection.effectiveType, 10);
                if (typeof nav.deviceMemory === "number") env.mem = nav.deviceMemory;
                env.theme = (document.documentElement && document.documentElement.getAttribute("data-theme")) || "classic";
                env.signedIn = Boolean(window.Account && window.Account.current);
                try { env.landing = cut(localStorage.getItem("mazerats_landing_state") || "", 20); } catch (e) { /* none */ }
                var meta = document.querySelector && document.querySelector('meta[name="mazerats:build"]');
                if (meta) env.build = cut(meta.getAttribute("content") || "", 40);
                env.windows = openWindows();
                env.crumbs = crumbs.slice();
            } catch (e) { /* a partial picture is still a picture */ }
            return env;
        }

        /* ---------------------------------------------------- capturing */

        function capture(kind, f) {
            var message = scrub(f.message || "", 500) || "(no message)";
            var source = f.source ? cleanUrl(f.source, 300) : "";
            // f.group: what the failure counts as here, when that is wider than
            // its own address (the FurniIndex pictures in onResourceError).
            var fp = kind + "|" + message + "|" + (f.group || source) + "|" + (f.line || 0);
            var had = seen[fp];
            if (had) {
                // The same failure again: a count, not another report.
                if (had.sent) had.extra++;
                else had.rep.count++;
                return;
            }
            if (distinct >= PAGE_MAX || sentThisVisit() >= SESSION_MAX) return;
            distinct++;
            countSent();
            // f.env: a snapshot taken earlier, for a report held back
            // (the network failures below).
            var rep = f.env || environment();
            rep.kind = kind;
            rep.message = message;
            if (source) rep.source = source;
            rep.line = f.line || 0;
            rep.col = f.col || 0;
            if (f.stack) rep.stack = cleanStack(f.stack);
            rep.count = 1;
            var extra = ["fn", "method", "status", "ms", "tag", "context"];
            for (var i = 0; i < extra.length; i++) if (f[extra[i]] !== undefined && f[extra[i]] !== "") rep[extra[i]] = f[extra[i]];
            seen[fp] = { rep: rep, sent: false, extra: 0 };
            pending.push(fp);
            // After the snapshot, so a report's crumbs are what came BEFORE it.
            crumb({ type: "error", msg: cut(kind + ": " + message, 200) });
            if (!timer) timer = setTimeout(function () { safe(flush, false); }, FLUSH_MS);
        }

        function safe(fn, arg) {
            try { fn(arg); } catch (e) { /* never */ }
        }

        function onScriptError(e) {
            var message = (e && e.message) || (e && e.error && e.error.message) || "";
            var file = (e && e.filename) || "";
            var stack = e && e.error && e.error.stack;
            if (EXTENSION.test(file) || EXTENSION.test(stack || "")) { ignored++; return; }
            // A cross-origin script's error, with every detail withheld by the browser.
            if (/^Script error\.?$/.test(message) && !e.lineno) { ignored++; return; }
            var top = file ? { source: file, line: e.lineno || 0, col: e.colno || 0 } : topFrame(stack);
            if (injected(message, top.source, top.line)) { ignored++; return; }
            capture("error", { message: message || "Unknown error", source: top.source, line: top.line, col: top.col, stack: stack });
        }

        function onResourceError(el) {
            var tag = el.tagName.toLowerCase();
            if (tag !== "img" && tag !== "script" && tag !== "link") return;
            var url = el.currentSrc || el.src || el.href || "";
            if (!url || /^(?:data|blob|about):/.test(url)) return;
            var clean = cleanUrl(url, 300);
            if (NOT_OURS.test(clean) || EXTENSION.test(url)) { ignored++; return; }
            /* A picture that carries its own way back (data-fallback: the
               Warren's add-by-hand picker, 1 Oct 2026) is a failure the page
               expects and handles — FurniIndex's new API has no icon for
               about one Habbo furni in five, and each search showed several.
               Counted, not sent. The fallback is taken off as it is used, so
               if that fails too, it is reported. */
            if (el.hasAttribute && el.hasAttribute("data-fallback")) { ignored++; return; }
            /* The same picker's "Not on Furni Index yet" rows (2 Oct 2026)
               carry data-unlisted instead: they have no fallback, and an icon
               that fails greys its row out as "No picture yet" — about one in
               three of them, by design, so not a fault either. */
            if (el.hasAttribute && el.hasAttribute("data-unlisted")) { ignored++; return; }
            var what = tag === "img" ? "A picture" : tag === "script" ? "A script" : "A stylesheet or linked file";
            /* Every picture from FurniIndex's new API is one failure on this
               page (1 Oct 2026), as the server groups them (groupSource in
               netlify/functions/_errors.js): a maze's furni list is dozens of
               them, and when that host has a bad minute each was a report of
               its own — ten a page, the whole page's allowance, and a share
               of the site's hourly one per visitor. Now the first is sent and
               the rest add to its count. */
            var group = /^\/\/api\.furniindex\.com\/furni\//i.test(clean) ? "//api.furniindex.com/furni/*" : "";
            capture("resource", { message: what + " failed to load", source: clean, tag: tag, group: group });
        }

        function onRejection(e) {
            var r = e && e.reason;
            var message, stack;
            if (r && typeof r === "object" && (r.message || r.stack)) {
                message = (r.name && r.name !== "Error" ? r.name + ": " : "") + (r.message || "");
                stack = r.stack;
            } else {
                try { message = typeof r === "string" ? r : JSON.stringify(r); } catch (x) { message = String(r); }
            }
            if (EXTENSION.test(stack || "")) { ignored++; return; }
            var top = topFrame(stack);
            if (injected(message, top.source, top.line)) { ignored++; return; }
            capture("rejection", { message: message || "Unhandled rejection", source: top.source, line: top.line, col: top.col, stack: stack });
        }

        function describeArg(a) {
            if (a && typeof a === "object" && (a.message || a.stack)) return (a.name ? a.name + ": " : "") + (a.message || "");
            if (typeof a === "string") return a;
            try { return String(JSON.stringify(a)).slice(0, 200); } catch (e) { return String(a); }
        }

        function onConsoleError(args) {
            var parts = [];
            var stack = "";
            for (var i = 0; i < args.length && i < 5; i++) {
                parts.push(describeArg(args[i]));
                if (!stack && args[i] && typeof args[i] === "object" && typeof args[i].stack === "string") stack = args[i].stack;
            }
            var message = parts.join(" ").replace(/\s+/g, " ").slice(0, 500);
            if (!message) return;
            crumb({ type: "console", msg: scrub(message, 200) });
            // Where console.error was CALLED from, when no error was passed.
            var here = "";
            try { here = new Error().stack || ""; } catch (e) { /* none */ }
            if (EXTENSION.test(stack) || EXTENSION.test(here)) { ignored++; return; }
            var top = topFrame(here);
            capture("console", { message: message, source: top.source, line: top.line, col: top.col, stack: stack || here });
        }

        /* ---------------------------------------------------- sending */

        function bytes(s) {
            try { return new Blob([s]).size; } catch (e) { return s.length * 3; }
        }

        /* Batches of at most BATCH_BYTES. A single report that will not fit
           even alone gives up most of its stack, then its breadcrumbs,
           before it is given up itself. */
        function pack(reports) {
            var batches = [];
            var current = [];
            var size = 0;
            for (var i = 0; i < reports.length; i++) {
                var rep = reports[i];
                var s = JSON.stringify(rep);
                if (bytes(s) > BATCH_BYTES - 500) {
                    if (rep.stack) rep.stack = rep.stack.slice(0, 1500);
                    if (rep.crumbs) rep.crumbs = rep.crumbs.slice(-5);
                    s = JSON.stringify(rep);
                    if (bytes(s) > BATCH_BYTES - 500) { delete rep.crumbs; delete rep.windows; s = JSON.stringify(rep); }
                    if (bytes(s) > BATCH_BYTES - 500) continue;
                }
                var n = bytes(s);
                if (current.length && size + n > BATCH_BYTES - 500) {
                    batches.push(current);
                    current = [];
                    size = 0;
                }
                current.push(rep);
                size += n + 1;
            }
            if (current.length) batches.push(current);
            return batches;
        }

        function send(payload, beacon) {
            if (beacon && typeof nav.sendBeacon === "function") {
                try {
                    if (nav.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }))) return;
                } catch (e) { /* fall through to fetch */ }
            }
            if (!origFetch) return;
            try {
                origFetch.call(window, ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: payload,
                    keepalive: true
                })["catch"](function () { /* a report that cannot be sent is not itself reported */ });
            } catch (e) { /* likewise */ }
        }

        /* `final` is the page going away: sent by beacon, and carrying the
           repeat counts of failures already reported — one small line each,
           so a page stuck in an error loop costs one report and one count,
           not a report every two seconds. */
        function flush(final) {
            clearTimeout(timer);
            timer = null;
            var reports = [];
            for (var i = 0; i < pending.length; i++) {
                var entry = seen[pending[i]];
                if (!entry) continue;
                entry.sent = true;
                reports.push(entry.rep);
            }
            pending = [];
            if (final) {
                for (var fp in seen) {
                    if (!Object.prototype.hasOwnProperty.call(seen, fp)) continue;
                    var s = seen[fp];
                    if (s.sent && s.extra > 0 && reports.indexOf(s.rep) < 0) {
                        /* Everything the server fingerprints — fn included
                           (30 Sept 2026): without it a failed call's repeats
                           made a second, empty group of their own. */
                        reports.push({ kind: s.rep.kind, message: s.rep.message, source: s.rep.source, line: s.rep.line, fn: s.rep.fn, page: s.rep.page, count: s.extra, repeat: true });
                        s.extra = 0;
                    }
                }
            }
            if (!reports.length && !ignored) return;
            var session = sessionId();
            var batches = pack(reports);
            if (!batches.length) batches.push([]);
            for (var b = 0; b < batches.length; b++) {
                send(JSON.stringify({ session: session, reports: batches[b], ignored: b === 0 ? ignored : 0 }), final);
            }
            ignored = 0;
        }

        /* ---------------------------------------------------- listening */

        // Capture phase, so a failed <img>/<script>/<link> — whose error
        // event does not bubble — is seen as well as a script error.
        window.addEventListener("error", function (e) {
            if (busy) return;
            busy = true;
            try {
                var t = e && e.target;
                if (t && t !== window && t.tagName) onResourceError(t);
                else onScriptError(e);
            } catch (x) { /* never */ }
            busy = false;
        }, true);

        window.addEventListener("unhandledrejection", function (e) {
            if (busy) return;
            busy = true;
            try { onRejection(e); } catch (x) { /* never */ }
            busy = false;
        });

        document.addEventListener("click", function (e) {
            try {
                var el = e.target;
                if (el && el.nodeType !== 1) el = el.parentElement;
                if (!el || !el.tagName) return;
                /* The nearest thing that is meant to be clicked, within
                   reason. With none within six levels the crumb names what
                   was clicked itself (29 Sept 2026): it used to name the
                   sixth ancestor, which on most pages is a whole section
                   or <main>, and then read its textContent — a click on
                   the Archive's background stringified the entire archive
                   to keep thirty characters of it. */
                var hit = null;
                var cur = el;
                for (var d = 0; cur && cur.tagName && d < 6; d++) {
                    if (/^(?:A|BUTTON|SUMMARY|LABEL|SELECT|INPUT|TEXTAREA)$/.test(cur.tagName)
                        || (cur.getAttribute && (cur.getAttribute("role") === "button" || cur.hasAttribute("data-track")))) {
                        hit = cur;
                        break;
                    }
                    cur = cur.parentElement;
                }
                var clickable = !!hit;
                if (!hit) hit = el;
                var tag = hit.tagName;
                /* A player's name must never ride along (29 Sept 2026): the
                   privacy policy promises reports carry no names, and the
                   header's account button is labelled "Signed in as <name>",
                   a Warren row is a player. An element, or any ancestor,
                   marked data-crumb="<label>" gives that label instead; one
                   marked data-crumb-private gives only what the thing is —
                   its role, or its tag ("button"). The nearest mark wins. */
                var mark = el.closest ? el.closest("[data-crumb], [data-crumb-private]") : null;
                var hush = !!(el.closest && el.closest("[data-crumb-private]"));
                var c = { type: "click", el: describe(hit, hush) };
                if (tag === "INPUT") {
                    c.el = (c.el + "[type=" + String(hit.type || "text").slice(0, 12) + "]").slice(0, 80);
                } else if (mark && mark.hasAttribute("data-crumb") && !mark.hasAttribute("data-crumb-private")) {
                    var label = String(mark.getAttribute("data-crumb") || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
                    if (label) c.text = label.slice(0, 30);
                } else if (mark) {
                    c.text = String((hit.getAttribute && hit.getAttribute("role")) || tag.toLowerCase()).slice(0, 30);
                } else if (clickable && tag !== "TEXTAREA" && tag !== "SELECT" && !hit.isContentEditable) {
                    // A label, never a value: inputs, selects and editable text say nothing.
                    var text = (hit.getAttribute("aria-label") || shortText(hit, 60)).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
                    if (text) c.text = text.slice(0, 30);
                }
                crumb(c);
            } catch (x) { /* never */ }
        }, true);

        function navCrumb(how) {
            crumb({ type: "nav", how: how, to: cleanUrl(location.href, 200) });
        }
        try {
            var names = ["pushState", "replaceState"];
            for (var n = 0; n < names.length; n++) {
                (function (name) {
                    var original = window.history && window.history[name];
                    if (typeof original !== "function") return;
                    window.history[name] = function () {
                        var result = original.apply(this, arguments);
                        try { navCrumb(name); } catch (x) { /* never */ }
                        return result;
                    };
                })(names[n]);
            }
        } catch (e) { /* no history crumbs, then */ }
        window.addEventListener("popstate", function () { try { navCrumb("popstate"); } catch (x) { /* never */ } });
        window.addEventListener("hashchange", function () { try { navCrumb("hashchange"); } catch (x) { /* never */ } });

        document.addEventListener("visibilitychange", function () {
            try {
                crumb({ type: "visibility", state: document.visibilityState });
                // Mobile browsers often never fire pagehide; this they do fire.
                if (document.visibilityState === "hidden") flush(true);
            } catch (x) { /* never */ }
        });
        window.addEventListener("pagehide", function () { leaving = true; hides++; safe(flush, true); });
        // Back from the back/forward cache: the page is in use again.
        window.addEventListener("pageshow", function () { leaving = false; });

        /* fetch, watched without being changed: the original is called with
           the same arguments and ITS promise is what the caller gets back,
           so nothing about any request differs. Watching is what the
           separate .then does — the status and the time for a call to one
           of our functions, a report for a 5xx from one (a 4xx is an answer,
           not a failure), and a report for a request that never arrived.
           Bodies are never read, in either direction. */
        if (origFetch) {
            window.fetch = function (input, init) {
                var started = sinceLoad();
                var url = "", method = "GET";
                try {
                    url = typeof input === "string" ? input : (input && input.url) || String(input);
                    method = String((init && init.method) || (input && typeof input === "object" && input.method) || "GET").toUpperCase();
                } catch (e) { /* unknown is fine */ }
                var promise = origFetch.apply(this, arguments);
                try {
                    var fn = fnOf(url);
                    if (fn !== "site-errors") {
                        promise.then(function (res) {
                            try {
                                var ms = sinceLoad() - started;
                                if (fn) crumb({ type: "fetch", fn: fn, method: method, status: res.status, ms: ms });
                                if (fn && res.status >= 500) {
                                    capture("fetch", {
                                        message: "HTTP " + res.status + " from " + fn,
                                        source: "/.netlify/functions/" + fn,
                                        fn: fn, method: method, status: res.status, ms: ms
                                    });
                                }
                            } catch (x) { /* never */ }
                        }, function (err) {
                            try {
                                var ms = sinceLoad() - started;
                                var aborted = err && err.name === "AbortError";
                                crumb({ type: "fetch", fn: fn || cleanUrl(url, 40), method: method, status: 0, ms: ms });
                                /* An abort is somebody's decision (a leash, a
                                   newer request), and a request made while
                                   offline was always going to fail. */
                                if (aborted || nav.onLine === false || leaving) return;
                                /* Somebody else's host failing is theirs,
                                   the same as for a failed picture above
                                   (29 Sept 2026): counted, not sent. */
                                if (!fn && NOT_OURS.test(cleanUrl(url, 300))) { ignored++; return; }
                                var failure = {
                                    message: "Network failure on " + (fn || cleanUrl(url, 120)),
                                    source: fn ? "/.netlify/functions/" + fn : cleanUrl(url, 300),
                                    fn: fn || undefined, method: method, status: 0, ms: ms,
                                    context: { detail: cut(String((err && err.message) || err), 200) }
                                };
                                /* Held a moment before it counts (1 Oct 2026).
                                   Leaving the page cancels whatever is still in
                                   flight, and Safari rejects each such request
                                   ("Load failed") before the page has gone — so
                                   the landing page's Enter, pressed just after
                                   pointing at it had started fetching the
                                   archive, filed "Network failure on rooms"
                                   for a request nobody wanted any more. A page
                                   that is leaving never runs this timer, or
                                   has hidden itself by then; either way it is
                                   not reported.

                                   The page as it was AT the failure, though
                                   (1 Oct 2026): taken when the report was
                                   made, the snapshot was 1.5s late — the
                                   address a window had moved on to, whether
                                   the tab was still visible or online, and
                                   crumbs from after it. */
                                try { failure.env = environment(); } catch (x) { /* capture takes its own */ }
                                /* Any pagehide since, not just "leaving now"
                                   (3 Oct 2026). Safari keeps a page it leaves
                                   in its back/forward cache with this timer
                                   frozen; Back brings it out, pageshow clears
                                   `leaving`, and the timer finishes — so a
                                   visitor who pressed Enter, then came back
                                   three minutes later, filed the same
                                   cancelled "rooms" request after all. */
                                var hidesThen = hides;
                                setTimeout(function () {
                                    try { if (!leaving && hides === hidesThen) capture("fetch", failure); } catch (x) { /* never */ }
                                }, LEAVE_GRACE_MS);
                            } catch (x) { /* never */ }
                        });
                    }
                } catch (e) { /* the caller still has its promise */ }
                return promise;
            };
        }

        /* console.error: every call is a breadcrumb, and a report, because
           this site only calls it when something has actually gone wrong
           ("The archive failed to load"). The original is always called,
           with the same arguments. */
        try {
            var con = window.console;
            if (con && typeof con.error === "function") {
                var originalError = con.error;
                con.error = function () {
                    if (!busy) {
                        busy = true;
                        try { onConsoleError(arguments); } catch (x) { /* never */ }
                        busy = false;
                    }
                    return originalError.apply(this, arguments);
                };
            }
        } catch (e) { /* no console reports, then */ }

        window.MazeErrors = {
            report: function (err, context) {
                try {
                    var message, stack;
                    if (err && typeof err === "object") {
                        message = (err.name && err.name !== "Error" ? err.name + ": " : "") + (err.message || String(err));
                        stack = err.stack;
                    } else {
                        message = String(err);
                    }
                    if (!stack) { try { stack = new Error().stack; } catch (x) { /* none */ } }
                    var ctx;
                    if (context && typeof context === "object") {
                        ctx = {};
                        var keys = Object.keys(context).slice(0, 10);
                        for (var i = 0; i < keys.length; i++) {
                            var v = context[keys[i]];
                            if (typeof v === "number" || typeof v === "boolean") ctx[keys[i].slice(0, 40)] = v;
                            else if (typeof v === "string") ctx[keys[i].slice(0, 40)] = scrub(v, 200);
                        }
                    }
                    var top = topFrame(stack);
                    capture("handled", { message: message, source: top.source, line: top.line, col: top.col, stack: stack, context: ctx });
                } catch (e) { /* never */ }
            },
            // Sends what is waiting now rather than in two seconds.
            flush: function () { safe(flush, false); }
        };
    }
})();

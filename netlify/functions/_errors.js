/* The error store: every failure a visitor's browser reports, and every one a
   function has, grouped so that /warren's Errors tab can say "this broke, this
   often, for these people, since then" (28 Sept 2026).

   Two ways in. js/error-report.js sends what the browser saw to
   netlify/functions/site-errors.js, which validates it with cleanReport below
   and hands it to recordReports. And withErrorReporting wraps every function's
   handler, so a function that throws, or answers 5xx, files its own report the
   same way without anybody having to remember a try/catch.

   ONE DOCUMENT PER FAILURE, NOT PER OCCURRENCE. A broken deploy can produce the
   same error for every visitor on every page load; a row each would be a
   hundred thousand identical rows by teatime and a tab nobody could read. So
   each distinct failure — its FINGERPRINT, below — is one document in
   `site_errors`, and an occurrence bumps its counters: how many, when (by day
   for 60 days and by hour for 48), for how many visits, on which browsers,
   pages, builds and themes. The last twenty occurrences are kept whole, as
   samples, because a count tells you something is wrong and only a real
   occurrence tells you why.

   WHAT A REPORT MAY HOLD is what the privacy policy says it holds (see
   js/privacy-content.js, "Error reports"), and every limit here is one that
   policy makes in writing: no IP address (it is read only to key the rate
   limit, as an HMAC that dies with the day, exactly as track.js does), no
   account and no name, nothing typed — every URL is cut to its path and a
   short list of known query keys, with a search kept only as its length — and
   the raw user agent is parsed here and thrown away, so a sample carries
   "Chrome 129 on Android 14, mobile" rather than a string precise enough to
   pick one phone out of a crowd. The visit id the browser sends is stored
   only as an HMAC, so an error cannot be joined to the interaction records
   in site_events, which carry the raw one: which visits hit an error is a
   question worth answering, what else that visit did is not ours to ask.

   Kept for 90 days after a failure was LAST seen (a TTL index on lastSeen),
   so a group that is still happening never ages out from under the person
   fixing it, and one that stopped is gone on its own. */
const crypto = require("crypto");
const { getDb } = require("./_db");
const { clientNet } = require("./_net");
const { checkRateLimit } = require("./_ratelimit");

const COLLECTION = "site_errors";
const META = "site_errors_meta";
const LIMITS = "site_errors_limits";

const KEEP_DAYS = 90;              // TTL on lastSeen — see the header
const DAYS_KEPT = 60;              // the `days` histogram
const HOURS_KEPT = 48;             // the `hours` histogram
const SAMPLES_KEPT = 20;
const MAP_KEYS = 30;               // per breakdown map, "(other)" included in what it folds
const VISITOR_SET = 1000;          // distinct visits remembered exactly; approximate after
const OTHER = "(other)";

/* THE CAPS. A public endpoint that writes to the database needs three, for
   the same reasons track.js learnt the hard way (read its note on LIMITS):

   · per network, NET_PER_MINUTE reports a minute, counted by the caller's
     subscriber (clientNet in _net.js, so an IPv6 /64 is one caller) with the
     insert-then-count limiter track.js uses. The browser itself sends at most
     ten distinct reports a page and thirty a visit, so sixty a minute is a
     whole office's worth of broken pages and not a loop's;
   · GLOBAL_PER_HOUR across the whole site, because no per-caller rule
     survives an attacker with enough addresses — and, more likely, because a
     broken deploy makes every visitor a reporter at once. Five thousand an
     hour is far more than it takes to see that something is wrong, and it
     keeps the worst hour to five thousand small counter bumps;
   · the size of each batch, in site-errors.js.

   Over a cap the batch is DROPPED, not refused: the browser has nobody to
   read an error, and a refusal it retried would only make the flood worse.
   What is dropped is COUNTED, per hour, in site_errors_meta, so the tab can
   say "N reports dropped by the rate limit" rather than going quietly
   incomplete at the moment it matters most. */
const NET_PER_MINUTE = 60;
const NET_WINDOW_MS = 60 * 1000;
const GLOBAL_PER_HOUR = 5000;
/* OCCURRENCES FROM ONE NETWORK (29 Sept 2026). The caps above count
   reports, but each report carries a repeat `count` of up to 10,000, so one
   sender inside its sixty reports a minute could still add hundreds of
   thousands of occurrences to a group and take over its count, its
   histograms and the tab's "count" sort. So a network's occurrences are
   budgeted too: past this many in an hour, its reports are dropped and
   counted as dropped (one report straddling the line keeps the part that
   fits — 30 Sept 2026). A genuine error loop has said all it has to say long
   before five thousand. */
const NET_OCC_PER_HOUR = 5000;
const META_KEEP_S = 8 * 24 * 60 * 60;

/* NEW GROUPS ARE WHAT COST SPACE, SO THEY HAVE THEIR OWN CAPS (29 Sept 2026).

   The caps above count REPORTS, and a report of a failure already on file
   is a counter bump: a few bytes, however many arrive. A report of a NEW
   failure is a whole document — a dozen kilobytes with its first sample —
   kept for 90 days. The fourth scan showed one network, inside its sixty a
   minute, minting sixty new groups a minute just by varying a word in the
   message: about 1.5GB a day of documents that each said nothing, kept for
   three months, and spending the global hour so that a real function
   failure behind it was dropped.

   So a report whose fingerprint has no group yet must also fit under:
   · NEW_PER_HOUR new groups an hour across the site, per SOURCE — browsers
     and functions each have their own (see below). Two hundred new distinct
     failures in one hour is already a broken deploy; the 201st is not the
     one that tells anybody anything new;
   · NET_NEW_PER_HOUR new groups an hour from one network (browsers only —
     functions have no caller to key on). The browser sends at most thirty
     distinct reports a visit and a broken page makes the SAME ones for
     everybody, so one network needing more than thirty new groups an hour
     is inventing them. This is what stops one sender using up the site's
     two hundred for everybody else.
   Over either, the report is dropped and counted as dropped, exactly as
   the report caps do. A group that already exists is never refused by
   these: it is still bumped, so a real failure keeps counting through a
   flood of invented ones.

   Both are counters bumped and read back in one atomic findOneAndUpdate,
   as the global cap is, on the hourAt TTL.

   FUNCTIONS HAVE THEIR OWN BUDGET. withErrorReporting's reports used to
   spend GLOBAL_PER_HOUR with the browsers, so a browser flood — the moment
   a server failure is most worth knowing about, since it is often the
   cause — dropped them. They now count against FUNCTION_PER_HOUR, a
   separate counter nothing a browser sends can touch, and a separate
   new-group budget of the same size as the browsers'. */
const NEW_PER_HOUR = 200;
const NET_NEW_PER_HOUR = 30;
const FUNCTION_PER_HOUR = 2000;

/* THE SIZE OF ONE SAMPLE, CAPPED (29 Sept 2026). Every field is already cut
   to its own length, but those limits add up to about 19KB, and twenty
   samples a group is where most of a group's size is. Capped as a whole at
   SAMPLE_MAX_BYTES of JSON, trimmed in the order that loses least: the
   window list, then the context, then breadcrumbs oldest first (the last
   few before the failure are the ones that explain it), and only then the
   tail of the stack — the frames furthest from where it broke. Message,
   source, line, page and the parsed browser are never cut. A trimmed sample
   says so (`trimmed: true`), so a reader knows the crumbs are not all there.

   Chosen over "store the first sample trimmed until a second occurrence"
   because it is one rule with no state: it bounds EVERY sample, so a
   group's worst size is known (twenty of these, plus its maps) whatever
   sends it, and a genuine one-off keeps its crumbs when there is room. A
   real report — a stack and fifteen short crumbs — fits whole; what gets
   trimmed is a report padded to every field's limit, which a page does not
   make. */
const SAMPLE_MAX_BYTES = 4096;

const KINDS = ["error", "rejection", "resource", "fetch", "console", "handled", "function"];
// "function" reports are made on the server alone; a browser claiming one is lying.
const CLIENT_KINDS = new Set(KINDS.filter(k => k !== "function"));
const STATUSES = ["open", "resolved", "ignored"];

/* Query keys a cleaned URL may keep, with their values. Read from every
   location.search and queryStringParameters the site actually reads (28 Sept
   2026): the guide being shown, the Warren's range and kind filters, and the
   switches (?edit, ?debug, ?fresh, ?signin). Each value is also held to a
   short, plain shape below, so even an allowed key cannot carry free text.
   `q` is the one exception, kept as its LENGTH only — a search box is free
   text and people put anything in one (see js/track.js). Everything else,
   ?token= first among them, is dropped, and so is the #hash. js/error-report.js
   keeps the same list; change one, change both. */
const SAFE_KEYS = new Set(["g", "debug", "edit", "fresh", "signin", "range", "action", "kind", "full", "status", "sort", "tab", "game"]);
const SAFE_VALUE = /^[A-Za-z0-9_-]{0,40}$/;

let testDb = null;                 // see _setDbForTests at the bottom

/* ------------------------------------------------------------ TEXT HYGIENE */

// Control characters out, except the newlines a stack is made of.
function str(v, max) {
    if (typeof v !== "string") return "";
    return v.slice(0, max).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
}

function int(v, lo, hi) {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n)) return null;
    return Math.min(hi, Math.max(lo, Math.round(n)));
}

/* A URL down to what is safe to keep: the path, the SAFE_KEYS, `q` as its
   length, and no hash. Same-site addresses lose their origin (every page is
   ours, the host adds nothing); anybody else's keep their host, because "the
   Habbo imaging server is failing" is the whole point of a resource report.
   Relative input is read against the site. Anything unparseable is dropped
   rather than kept as it came. */
function cleanUrl(raw, max = 300) {
    if (typeof raw !== "string" || !raw) return "";
    let u;
    try {
        u = new URL(raw.slice(0, 2000), "https://mazerats.net/");
    } catch (e) {
        return "";
    }
    if (u.protocol === "data:" || u.protocol === "blob:") return u.protocol;
    if (u.protocol !== "http:" && u.protocol !== "https:") return u.protocol + "//" + (u.host || "");
    const own = u.hostname === "mazerats.net" || u.hostname === "www.mazerats.net" ||
        u.hostname.endsWith(".netlify.app") || u.hostname === "localhost" || u.hostname === "127.0.0.1";
    const kept = [];
    for (const [k, v] of u.searchParams) {
        if (kept.length >= 6) break;
        // A search the browser has already cut to its length stays as it is,
        // rather than becoming the length of "<5 chars>".
        if (k === "q") kept.push(/^<\d{1,5} chars>$/.test(v) ? `q=${v}` : `q=<${v.length} chars>`);
        else if (SAFE_KEYS.has(k)) kept.push(SAFE_VALUE.test(v) ? (v ? `${k}=${v}` : k) : k);
    }
    /* Control characters out of the decoded path (30 Sept 2026): "%00"
       decodes to a NUL, and a page's path becomes a key in the group's
       `pages` map — a key BSON refuses, so the whole batch failed to record. */
    const path = decodeSafe(u.pathname).replace(/[\u0000-\u001f\u007f]/g, "");
    return ((own ? "" : "//" + u.host) + path + (kept.length ? "?" + kept.join("&") : "")).slice(0, max);
}

function decodeSafe(p) {
    try { return decodeURI(p); } catch (e) { return p; }
}

/* The same cut applied INSIDE free text — messages and stacks, which carry
   addresses of their own ("at render (https://mazerats.net/home?q=bob:12:3)").
   A trailing :line:col is kept, since that is what a stack frame is for.
   And a few things that should never be kept wherever they turn up: a JWT
   (the admin token is one), an email address, and a MongoDB URI, which a
   driver error can quote. */
function scrub(text, max) {
    if (typeof text !== "string" || !text) return "";
    let s = text.slice(0, max * 2);
    s = s.replace(/mongodb(\+srv)?:\/\/[^\s"'`)]+/gi, "<mongodb-uri>");
    s = s.replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "<jwt>");
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
    /* And an account (30 Sept 2026), which the policy says a report never
       carries: a Discord id is a snowflake of seventeen to twenty digits —
       longer than any millisecond clock or line number — and a duplicate-key
       error quotes the value it collided on, which on the players collection
       is a Discord id or a player's nickname. */
    s = s.replace(/\bdup key: \{[^}]*\}/g, "dup key: { <value> }");
    s = s.replace(/(^|[^0-9A-Za-z])\d{17,20}(?![0-9A-Za-z])/g, "$1<id>");
    s = s.replace(/\b(https?:\/\/[^\s"'`)<>]+?)((?::\d+){1,2})?(?=[\s"'`)<>]|$)/g, (m, url, pos) => cleanUrl(url, 300) + (pos || ""));
    return str(s, max);
}

/* A stack, cut to STACK_FRAMES frames and STACK_MAX characters, with the
   functions' own absolute paths (/var/task/netlify/functions/x.js) shortened
   to the repo's, which is all a reader needs and says nothing about the host. */
const STACK_MAX = 4096;
const STACK_FRAMES = 30;
function cleanStack(stack) {
    if (typeof stack !== "string" || !stack) return "";
    const s = stack.replace(/(?:[A-Za-z]:)?[\\/][^\s():]*?[\\/](netlify[\\/]functions[\\/])/g, "$1").replace(/\\/g, "/");
    return scrub(s.split("\n").slice(0, STACK_FRAMES + 1).join("\n"), STACK_MAX);
}

/* ------------------------------------------------------------ FINGERPRINTS

   What makes two reports "the same failure": the kind, the message with its
   particulars taken out, the file, and the line. Numbers and ids come out of
   the message so that "no room with id 123" and "no room with id 456" are one
   bug, not two — but an HTTP status stays in, because a 500 and a 502 from the
   same function are different failures (a handled error, and a crash or a
   timeout).

   The column is deliberately NOT in it. tools/build-minify.js strips comments
   and so moves every column on every deploy (and puts most of a file on its
   first line); with the column in, each deploy would start every group again
   and the history the tab exists to show would reset on every push.

   A failed RESOURCE is grouped by its folder and type rather than by its exact
   address — "pictures under /assets/furni/ are failing" is one problem however
   many pictures it takes out, and the samples still name each one. */
function normaliseMessage(m) {
    return String(m || "")
        .replace(/\bHTTP ([1-5]\d\d)\b/g, (x, code) => "HTTP " + code.replace(/\d/g, d => "abcdefghij"[d]))
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
        .replace(/\b[0-9a-f]{24}\b/gi, "<id>")
        .replace(/\b(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{16,}\b/g, "<id>")
        .replace(/\d+(?:\.\d+)?/g, "<n>")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
}

function groupSource(kind, source) {
    const s = String(source || "").replace(/[?#].*$/, "");
    if (kind !== "resource") return s;
    /* FurniIndex's new picture API (1 Oct 2026) names the furni in a FOLDER
       — /furni/<classname>/icon, /furni/<classname>/large/r2/s0/noshadow —
       so "the folder" was a different one for every furni, and each picture
       that failed started a group of its own. On a bad FurniIndex afternoon
       that was a new group per furni per visitor's page, spending the
       site's two hundred new groups an hour (NEW_PER_HOUR) in a few dozen
       visits and dropping every real failure after them. One group for the
       whole API; the samples still name each picture. */
    if (/^\/\/api\.furniindex\.com\/furni\//i.test(s)) return "//api.furniindex.com/furni/*";
    const slash = s.lastIndexOf("/");
    const ext = (/\.([A-Za-z0-9]{1,6})$/.exec(s) || [])[1] || "";
    return s.slice(0, slash + 1) + "*" + (ext ? "." + ext.toLowerCase() : "");
}

function fingerprint(r) {
    const key = [r.kind, normaliseMessage(r.message), groupSource(r.kind, r.source), r.line || 0, r.fn || ""].join("|");
    return crypto.createHash("sha256").update(key).digest("hex").slice(0, 20);
}

/* ------------------------------------------------------------ USER AGENTS

   A small parser rather than a dependency: the tab needs "which browser,
   which version, which OS, phone or not", and the UA strings that matter for
   that are few and well known. Order is everything — Edge, Samsung Internet
   and Opera all claim to be Chrome, Chrome claims to be Safari, and every
   browser on an iPhone is Safari underneath with its own token added.

   `touch` is the browser's own maxTouchPoints, when the report carried it: an
   iPad on iPadOS 13 or later asks for desktop sites and sends a Mac's user
   agent, and a Mac with a touchscreen is not a thing Apple makes. */
function parseUserAgent(ua, touch) {
    const s = String(ua || "").slice(0, 500);
    let browser = "Other", browserVersion = "", os = "Other", osVersion = "", device = "desktop";
    let m;
    if (/bot|crawl|spider|slurp|headless|lighthouse/i.test(s)) {
        return { browser: "Bot", browserVersion: "", os: "Other", osVersion: "", device: "bot" };
    }

    if ((m = /\biPad\b.*?\bOS (\d+)[_.](\d+)/.exec(s))) {
        os = "iPadOS"; osVersion = `${m[1]}.${m[2]}`; device = "tablet";
    } else if ((m = /\b(?:iPhone|iPod)\b.*?\bOS (\d+)[_.](\d+)/.exec(s))) {
        os = "iOS"; osVersion = `${m[1]}.${m[2]}`; device = "mobile";
    } else if ((m = /\bAndroid (\d+(?:\.\d+)?)/.exec(s)) || (m = /\bAndroid\b/.exec(s))) {
        os = "Android"; osVersion = m[1] || "";
        device = /\bMobile\b/.test(s) ? "mobile" : "tablet";
    } else if ((m = /\bWindows NT (\d+\.\d+)/.exec(s))) {
        os = "Windows";
        // Windows 11 still says 10.0; only a client hint could tell them apart.
        osVersion = { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" }[m[1]] || m[1];
    } else if (/\bCrOS\b/.test(s)) {
        os = "ChromeOS";
    } else if ((m = /\bMac OS X (\d+)[_.](\d+)(?:[_.](\d+))?/.exec(s))) {
        os = "macOS"; osVersion = m[1] + "." + m[2] + (m[3] ? "." + m[3] : "");
        if (typeof touch === "number" && touch > 1) { os = "iPadOS"; osVersion = ""; device = "tablet"; }
    } else if (/\bLinux\b/.test(s)) {
        os = "Linux";
    }

    if ((m = /\bEdg(?:e|A|iOS)?\/(\d+)/.exec(s))) { browser = "Edge"; browserVersion = m[1]; }
    else if ((m = /\bSamsungBrowser\/(\d+(?:\.\d+)?)/.exec(s))) { browser = "Samsung Internet"; browserVersion = m[1]; }
    else if ((m = /\b(?:OPR|Opera)\/(\d+)/.exec(s))) { browser = "Opera"; browserVersion = m[1]; }
    else if ((m = /\bFxiOS\/(\d+)/.exec(s)) || (m = /\bFirefox\/(\d+)/.exec(s))) { browser = "Firefox"; browserVersion = m[1]; }
    else if ((m = /\bCriOS\/(\d+)/.exec(s))) { browser = "Chrome"; browserVersion = m[1]; }
    else if ((m = /\bDiscord\/(\d+)/.exec(s))) { browser = "Discord"; browserVersion = m[1]; }
    else if ((m = /\bChrom(?:e|ium)\/(\d+)/.exec(s))) { browser = "Chrome"; browserVersion = m[1]; }
    else if ((m = /\bVersion\/(\d+(?:\.\d+)?).*\bSafari\//.exec(s))) { browser = "Safari"; browserVersion = m[1]; }
    else if (/\b(?:iPhone|iPad|iPod)\b/.test(s)) { browser = "iOS web view"; }
    return { browser, browserVersion, os, osVersion, device };
}

/* ------------------------------------------------------------ VALIDATION

   What a stranger's report is allowed to contain. Every field is typed and
   cut; anything not listed here is dropped rather than stored as it came,
   which is what keeps "every field of the report" in a sample from meaning
   "anything a script chose to POST". */
const CRUMB_TYPES = new Set(["click", "nav", "fetch", "visibility", "console", "error"]);

function cleanCrumb(c) {
    if (!c || typeof c !== "object") return null;
    const type = str(c.type, 12);
    if (!CRUMB_TYPES.has(type)) return null;
    const out = { type, t: int(c.t, 0, 1e9), at: str(c.at, 30) || undefined };
    if (c.el) out.el = str(c.el, 80);
    if (c.text) out.text = str(c.text, 30);
    if (c.how) out.how = str(c.how, 16);
    if (c.to) out.to = cleanUrl(c.to, 200);
    if (c.fn) out.fn = str(c.fn, 40);
    if (c.method) out.method = str(c.method, 8).toUpperCase();
    if (c.status !== undefined) out.status = int(c.status, 0, 999);
    if (c.ms !== undefined) out.ms = int(c.ms, 0, 1e7);
    if (c.state) out.state = str(c.state, 12);
    if (c.msg) out.msg = scrub(c.msg, 200);
    for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === null) delete out[k];
    return out;
}

function cleanContext(ctx) {
    if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) return undefined;
    const out = {};
    for (const k of Object.keys(ctx).slice(0, 10)) {
        const key = str(k, 40).replace(/[.$]/g, "_");
        const v = ctx[k];
        if (typeof v === "number" || typeof v === "boolean") out[key] = v;
        else if (typeof v === "string") out[key] = scrub(v, 200);
    }
    return Object.keys(out).length ? out : undefined;
}

/* One report, from the browser (fromClient) or from withErrorReporting. Null
   when there is nothing worth keeping. */
// The same list as js/error-report.js's: change one, change both.
const BROWSER_OWN = /__firefox__|__gCrWeb|\bethereum\b|webkit\.messageHandlers/;
function cleanReport(r, { fromClient = true } = {}) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    const kind = str(r.kind, 12);
    if (fromClient ? !CLIENT_KINDS.has(kind) : !KINDS.includes(kind)) return null;
    const message = scrub(r.message, 500);
    if (!message) return null;
    /* A browser's own scripts' errors (5 Oct 2026): js/error-report.js stops
       sending them (BROWSER_OWN and injected() there), but a page opened
       before that version keeps the old one until it is reloaded, and goes
       on sending them, repeats and all. Turned away here as well, by the
       same two signs: the browser's own names in the message, or a place
       on line 1 of a page rather than in a script file. */
    if (fromClient && (kind === "error" || kind === "rejection")) {
        if (BROWSER_OWN.test(message)) return null;
        const src = String(r.source || "");
        if (src && (int(r.line, 0, 1e7) || 0) <= 1 && !/\.m?js(?:[?#]|$)/i.test(src)) return null;
    }
    const out = {
        kind,
        message,
        source: /^(?:fn:|netlify\/)/.test(r.source || "") ? str(r.source, 200) : cleanUrl(r.source, 300),
        line: int(r.line, 0, 1e7) || 0,
        col: int(r.col, 0, 1e7) || 0,
        stack: cleanStack(r.stack),
        count: int(r.count, 1, 10000) || 1,
        repeat: r.repeat === true || undefined,
    };
    // Where and when.
    out.page = cleanUrl(r.page, 200).replace(/\?.*$/, "");
    out.url = cleanUrl(r.url, 300);
    out.title = str(r.title, 120);
    out.at = str(r.at, 30);
    // getTimezoneOffset() as the browser gives it: minutes behind UTC (UTC+1 is -60).
    out.tzOffset = int(r.tzOffset, -900, 900);
    out.sinceLoad = int(r.sinceLoad, 0, 1e10);
    // The browser and the screen.
    out.lang = str(r.lang, 20);
    // typeof first: a one-element array such as ["1x1"] passes the test
    // as a string and would be stored as an array.
    out.viewport = typeof r.viewport === "string" && /^\d{1,5}x\d{1,5}$/.test(r.viewport) ? r.viewport : "";
    out.screen = typeof r.screen === "string" && /^\d{1,5}x\d{1,5}$/.test(r.screen) ? r.screen : "";
    out.dpr = typeof r.dpr === "number" && r.dpr > 0 && r.dpr < 20 ? Math.round(r.dpr * 100) / 100 : null;
    out.pointer = ["coarse", "fine", "none"].includes(r.pointer) ? r.pointer : "";
    out.touch = int(r.touch, 0, 20);
    out.online = typeof r.online === "boolean" ? r.online : null;
    out.visibility = ["visible", "hidden", "prerender"].includes(r.visibility) ? r.visibility : "";
    out.net = typeof r.net === "string" && /^[a-z0-9-]{1,10}$/.test(r.net) ? r.net : "";
    out.mem = typeof r.mem === "number" && r.mem > 0 && r.mem <= 1024 ? r.mem : null;
    // The site's own state.
    out.theme = typeof r.theme === "string" && /^[a-z-]{1,20}$/.test(r.theme) ? r.theme : "";
    out.signedIn = typeof r.signedIn === "boolean" ? r.signedIn : null;
    out.landing = typeof r.landing === "string" && /^[a-z-]{1,20}$/.test(r.landing) ? r.landing : "";
    out.build = typeof r.build === "string" && /^[A-Za-z0-9 :._@TZ-]{1,40}$/.test(r.build) ? r.build : "";
    out.windows = Array.isArray(r.windows) ? r.windows.slice(0, 12).map(w => str(w, 60)).filter(Boolean) : [];
    out.crumbs = Array.isArray(r.crumbs) ? r.crumbs.slice(-15).map(cleanCrumb).filter(Boolean) : [];
    // Fetch and function particulars.
    if (r.fn) out.fn = str(r.fn, 40).replace(/[^A-Za-z0-9_-]/g, "");
    if (r.method) out.method = str(r.method, 8).toUpperCase().replace(/[^A-Z]/g, "");
    if (r.status !== undefined) out.status = int(r.status, 0, 999);
    if (r.ms !== undefined) out.ms = int(r.ms, 0, 1e7);
    if (r.tag) out.tag = ["img", "script", "link", "video", "audio", "source"].includes(r.tag) ? r.tag : "";
    const context = cleanContext(r.context);
    if (context) out.context = context;
    // Server-only fields, never accepted from a browser.
    if (!fromClient) {
        if (r.path) out.path = cleanUrl(r.path, 300);
        if (r.requestId) out.requestId = str(r.requestId, 80);
        if (r.deployId) out.deployId = str(r.deployId, 40);
        if (r.commit) out.commit = str(r.commit, 12);
    }
    for (const k of Object.keys(out)) {
        if (out[k] === undefined || out[k] === null || out[k] === "") delete out[k];
    }
    if (Array.isArray(out.windows) && !out.windows.length) delete out.windows;
    if (Array.isArray(out.crumbs) && !out.crumbs.length) delete out.crumbs;
    return out;
}

/* ------------------------------------------------------------ WHO AND WHERE */

/* A coarse country, from Netlify's own geolocation: the two-letter code and
   nothing finer (no city, no region, and never the address it was worked out
   from). Netlify gives it on context.geo for newer runtimes, and as headers
   on every request; whichever is there. */
function countryOf(event, context) {
    try {
        const fromContext = context && context.geo && context.geo.country && context.geo.country.code;
        if (fromContext) return String(fromContext).slice(0, 2).toUpperCase();
        const h = (event && event.headers) || {};
        if (h["x-country"]) return String(h["x-country"]).slice(0, 2).toUpperCase();
        if (h["x-nf-geo"]) {
            const geo = JSON.parse(Buffer.from(String(h["x-nf-geo"]), "base64").toString("utf8"));
            const code = geo && geo.country && geo.country.code;
            if (code) return String(code).slice(0, 2).toUpperCase();
        }
    } catch (e) { /* no country is fine */ }
    return "";
}

// The visit id as the store keeps it — see the header on why it is hashed.
function hashSession(session) {
    if (typeof session !== "string" || !/^[A-Za-z0-9_-]{4,40}$/.test(session)) return null;
    return crypto.createHmac("sha256", process.env.SESSION_SECRET || "maze-rats-errors")
        .update("errors|" + session).digest("base64").replace(/[+/=]/g, "").slice(0, 16);
}

/* ------------------------------------------------------------ INDEXES */

let ensuring = null;
function ensureIndexes(db) {
    if (!ensuring) {
        ensuring = (async () => {
            const col = db.collection(COLLECTION);
            // The retention the policy states, enforced by the database itself.
            await col.createIndex({ lastSeen: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 }).catch(() => {});
            // The tab's list: by status, then whichever order it asks for.
            await col.createIndex({ status: 1, lastSeen: -1 }).catch(() => {});
            await col.createIndex({ status: 1, count: -1 }).catch(() => {});
            const meta = db.collection(META);
            await meta.createIndex({ at: 1 }, { expireAfterSeconds: META_KEEP_S }).catch(() => {});
            const limits = db.collection(LIMITS);
            // The per-network rows live only as long as the minute they count in…
            await limits.createIndex({ at: 1 }, { expireAfterSeconds: 2 * NET_WINDOW_MS / 1000 }).catch(() => {});
            await limits.createIndex({ k: 1, at: 1 }).catch(() => {});
            // …and the hourly counters on their own field, or the minute's TTL
            // would reset an hour's count a minute into it (track.js's dayAt).
            await limits.createIndex({ hourAt: 1 }, { expireAfterSeconds: 2 * 60 * 60 }).catch(() => {});
        })().catch(() => { ensuring = null; });
    }
    return ensuring;
}

/* ------------------------------------------------------------ CAPS */

const hourStart = (now) => new Date(Math.floor(now / 3600000) * 3600000);
const rowOf = (res) => (res && res.value !== undefined ? res.value : res);   // either driver shape

function limiterKey(event) {
    const net = clientNet(event);
    if (!net) return null;
    const day = new Date().toISOString().slice(0, 10);
    return crypto.createHmac("sha256", process.env.SESSION_SECRET || "maze-rats-errors")
        .update(`errors|${day}|${net}`).digest("base64").slice(0, 22);
}

// Insert, then count, as track.js does: a parallel burst cannot all fit under together.
async function overNetCap(db, event, n) {
    const k = limiterKey(event);
    if (!k) return false;
    const col = db.collection(LIMITS);
    const recent = () => col.countDocuments({ k, at: { $gte: new Date(Date.now() - NET_WINDOW_MS) } },
        { limit: NET_PER_MINUTE + 1 });
    /* Counted before the insert too (2 Oct 2026), as track.js's overLimit:
       a network already over its minute used to write up to MAX_REPORTS
       rows a POST for as long as it kept posting. Over the line now, a batch
       costs one indexed count and writes nothing; the insert-then-count
       below still keeps a parallel burst from all fitting under together. */
    if (await recent() >= NET_PER_MINUTE) return true;
    const at = new Date();
    await col.insertMany(Array.from({ length: n }, () => ({ k, at })), { ordered: false });
    return (await recent()) > NET_PER_MINUTE;
}

/* One counter per hour, bumped and read back in the same atomic step. The
   first bump of an hour is an upsert, and two of those racing can have the
   second refused with E11000; by then the counter exists, so the same bump
   once more is an ordinary update (upsertGroup's reasoning, below). */
async function bumpHourly(db, id, n, cap) {
    const hour = hourStart(Date.now());
    const bump = () => db.collection(LIMITS).findOneAndUpdate(
        { _id: `${id}:${hour.toISOString()}` },
        { $inc: { n }, $setOnInsert: { hourAt: hour } },
        { upsert: true, returnDocument: "after" }
    );
    let doc;
    try {
        doc = rowOf(await bump());
    } catch (e) {
        if (!e || e.code !== 11000) throw e;
        doc = rowOf(await bump());
    }
    return Boolean(doc) && doc.n > cap;
}

/* How many of `n` still fit under this hour's `cap` (30 Sept 2026): 0 to n.
   One $inc, so two at once each see where their own bump started and cannot
   both be given the same room. What does not fit is not handed back — past
   the cap everything is refused anyway. No row back means no answer, and the
   whole of n is let through, as bumpHourly lets it. */
async function takeHourly(db, id, n, cap) {
    const hour = hourStart(Date.now());
    const bump = () => db.collection(LIMITS).findOneAndUpdate(
        { _id: `${id}:${hour.toISOString()}` },
        { $inc: { n }, $setOnInsert: { hourAt: hour } },
        { upsert: true, returnDocument: "after" }
    );
    let doc;
    try {
        doc = rowOf(await bump());
    } catch (e) {
        if (!e || e.code !== 11000) throw e;
        doc = rowOf(await bump());
    }
    if (!doc || typeof doc.n !== "number") return n;
    return Math.max(0, Math.min(n, cap - (doc.n - n)));
}

/* `source` "client" is the browsers' shared hour, under the id it has always
   had; "function" is withErrorReporting's own (see FUNCTIONS HAVE THEIR OWN
   BUDGET, above). */
async function overGlobalCap(db, n, source = "client") {
    return source === "function"
        ? bumpHourly(db, "global:function", n, FUNCTION_PER_HOUR)
        : bumpHourly(db, "global", n, GLOBAL_PER_HOUR);
}

/* May one more NEW group be made? The per-network budget first, so a sender
   past its own does not also spend the one everybody shares — the order the
   report caps keep. `net` is limiterKey's HMAC, or null (a function report,
   or a request with no address to key on), which skips that step. */
async function newGroupAllowed(db, source, net) {
    if (net && await bumpHourly(db, `new:net:${net}`, 1, NET_NEW_PER_HOUR)) return false;
    return !(await bumpHourly(db, `new:${source === "function" ? "function" : "client"}`, 1, NEW_PER_HOUR));
}

/* What the caps threw away, or what the browser chose not to send (a
   browser extension's error, a cross-origin "Script error." with no detail),
   by the hour. `type` is "dropped" or "ignored". Never throws. */
async function countMeta(db, type, n) {
    if (!(n > 0)) return;
    try {
        const hour = hourStart(Date.now());
        await db.collection(META).updateOne(
            { _id: `${type}:${hour.toISOString()}` },
            { $inc: { n }, $setOnInsert: { type, at: hour } },
            { upsert: true }
        );
    } catch (e) { /* a lost tally is not worth an error */ }
}

async function metaSince(db, type, since) {
    const rows = await db.collection(META).find({ type, at: { $gte: since } }).toArray();
    return rows.reduce((sum, r) => sum + (r.n || 0), 0);
}

/* ------------------------------------------------------------ RECORDING */

// A breakdown key Mongo will take: no dots (a path separator in an update),
// no leading $. The one dot leader reads as a dot and turns back into one
// when the API hands the maps out (see readKey).
const DOT = "․";
function mapKey(v) {
    // No control characters either: a NUL in a key is refused by BSON outright.
    const s = String(v == null || v === "" ? "unknown" : v).slice(0, 60).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\./g, DOT).replace(/^\$/, "_");
    return s || "unknown";
}
const readKey = (k) => String(k).split(DOT).join(".");

const dayKey = (d) => d.toISOString().slice(0, 10);
const hourKey = (d) => d.toISOString().slice(0, 13);

/* Upsert one group, atomically. Everything an occurrence changes is in ONE
   findOneAndUpdate — $inc for the counters, $min/$max for the first and last
   sighting, $push with $slice for the samples, and $setOnInsert for what the
   first occurrence decides — so fifty browsers reporting the same failure at
   once cannot lose a count between them: Mongo applies each update to the
   document whole.

   The upsert itself can race: two first-ever reports of one failure can both
   find no document and both try to insert it, and the second gets E11000.
   By then the document exists, so the same update retried once is an
   ordinary update and lands.

   AN EXISTING GROUP FIRST, A NEW ONE ONLY IF ALLOWED (29 Sept 2026). The
   update is tried WITHOUT upsert first: a group on file is bumped by that
   one call, exactly as before, and never meets the new-group caps. Only
   when it finds nothing is `admit` asked (newGroupAllowed, via
   recordReports) whether a new document may be made, and only then is the
   upsert run. Two first reports racing may both spend a unit of the budget
   for the one group they make between them; an over-count of one, on a
   budget of hundreds. Returns true when something was written, false when
   `admit` said no. */
async function upsertGroup(col, fp, rep, n, meta, now, admit) {
    const ua = meta.ua || {};
    const sample = rep.repeat ? null : {
        ...rep,
        browser: ua.browser, browserVersion: ua.browserVersion,
        os: ua.os, osVersion: ua.osVersion, device: ua.device,
        country: meta.country || undefined,
        session: meta.session || undefined,
        receivedAt: now,
    };
    if (sample) {
        delete sample.repeat;
        for (const k of Object.keys(sample)) if (sample[k] === undefined || sample[k] === "") delete sample[k];
        fitSample(sample);
    }
    const inc = {
        count: n,
        [`days.${dayKey(now)}`]: n,
        [`hours.${hourKey(now)}`]: n,
        [`browsers.${mapKey(ua.browser ? `${ua.browser} ${ua.browserVersion}`.trim() : "")}`]: n,
        [`os.${mapKey(ua.os ? `${ua.os} ${ua.osVersion}`.trim() : "")}`]: n,
        [`devices.${mapKey(ua.device)}`]: n,
        [`pages.${mapKey(rep.page || rep.path || "")}`]: n,
        [`countries.${mapKey(meta.country)}`]: n,
        [`builds.${mapKey(rep.build)}`]: n,
        [`themes.${mapKey(rep.theme || (rep.kind === "function" ? "server" : "classic"))}`]: n,
    };
    const update = {
        $inc: inc,
        $min: { firstSeen: now },
        $max: { lastSeen: now },
        $setOnInsert: {
            kind: rep.kind,
            message: rep.message,
            source: rep.source || "",
            line: rep.line || 0,
            col: rep.col || 0,
            fn: rep.fn || null,
            status: "open",
            note: "",
            regressed: false,
        },
    };
    if (sample) update.$push = { samples: { $each: [sample], $slice: -SAMPLES_KEPT } };
    /* The HTTP status of a function or fetch failure, on the group itself as
       `statusCode` — `status` there is the triage state. The latest one wins:
       a 502 that became a 504 is worth seeing as it is now. Each sample keeps
       its own as `status`. */
    if (typeof rep.status === "number" && (rep.kind === "function" || rep.kind === "fetch")) {
        update.$set = { statusCode: rep.status };
    }
    const projection = { samples: 0, sessions: 0 };
    let doc = rowOf(await col.findOneAndUpdate({ _id: fp }, update, { returnDocument: "after", projection }));
    if (!doc) {
        /* A REPEAT NEVER STARTS A GROUP (30 Sept 2026). A repeat-only report
           is "N more of one you already have": a count, with no sample. With
           no group on file there is nothing for it to be more of — the first
           report was dropped, or aged out — and a group made from it would
           have a count and no occurrence to explain it. So it is dropped, and
           counted as one dropped report, without spending the new-group
           budget. */
        if (!sample) return false;
        if (admit && !(await admit())) return false;
        const opts = { upsert: true, returnDocument: "after", projection };
        try {
            doc = rowOf(await col.findOneAndUpdate({ _id: fp }, update, opts));
        } catch (e) {
            if (!e || e.code !== 11000) throw e;
            doc = rowOf(await col.findOneAndUpdate({ _id: fp }, update, opts));
        }
    }
    if (!doc) return true;

    /* A RESOLVED FAILURE THAT HAPPENS AGAIN has regressed: back to open, and
       flagged, so the fix that did not hold is the first thing the tab shows.
       Conditional on it still being resolved, so two reports arriving together
       reopen it once. An IGNORED group stays ignored — that is what ignoring
       it means — and simply keeps counting. */
    if (doc.status === "resolved") {
        await col.updateOne({ _id: fp, status: "resolved" },
            { $set: { status: "open", regressed: true, regressedAt: now } });
    }

    /* VISITS. The set of hashed visit ids holds VISITOR_SET of them; a visit
       not yet in it is pushed and counted in the same step, on the condition
       that it is not there already, so a visit is counted once however many
       of its reports race. Past the cap the set stops growing and each new
       batch from a visit it does not hold adds one — an over-count by
       however many batches a visit sends, which is why `visitorsApprox` says
       so. The alternative, a set without a cap, is a document that grows
       until Mongo refuses it. */
    if (meta.session) {
        const pushed = await col.updateOne(
            { _id: fp, sessions: { $ne: meta.session }, [`sessions.${VISITOR_SET - 1}`]: { $exists: false } },
            { $push: { sessions: meta.session }, $inc: { visitors: 1 } }
        );
        if (!pushed || !pushed.matchedCount) {
            await col.updateOne(
                { _id: fp, sessions: { $ne: meta.session }, [`sessions.${VISITOR_SET - 1}`]: { $exists: true } },
                { $inc: { visitors: 1 }, $set: { visitorsApprox: true } }
            );
        }
    }

    await tidy(col, fp, doc, now);
    return true;
}

/* A sample cut to SAMPLE_MAX_BYTES of JSON, in place (see THE SIZE OF ONE
   SAMPLE, above). Measured as JSON because that is near enough what BSON
   stores, and cut in the stated order until it fits. */
function fitSample(sample) {
    const size = () => Buffer.byteLength(JSON.stringify(sample));
    if (size() <= SAMPLE_MAX_BYTES) return sample;
    sample.trimmed = true;
    delete sample.windows;
    if (size() <= SAMPLE_MAX_BYTES) return sample;
    delete sample.context;
    while (Array.isArray(sample.crumbs) && sample.crumbs.length && size() > SAMPLE_MAX_BYTES) sample.crumbs.shift();
    if (Array.isArray(sample.crumbs) && !sample.crumbs.length) delete sample.crumbs;
    let over = size() - SAMPLE_MAX_BYTES;
    if (over > 0 && sample.stack) {
        // Whole frames off the end; each character removed is at least a byte.
        const cut = sample.stack.slice(0, Math.max(0, sample.stack.length - over - 1));
        const nl = cut.lastIndexOf("\n");
        sample.stack = nl > 0 ? cut.slice(0, nl) : cut;
        if (!sample.stack) delete sample.stack;
    }
    // The long free-text fields last, should the rest still not fit.
    for (const k of ["title", "url", "path"]) {
        over = size() - SAMPLE_MAX_BYTES;
        if (over <= 0) break;
        if (typeof sample[k] === "string") sample[k] = sample[k].slice(0, Math.max(0, sample[k].length - over));
    }
    return sample;
}

/* Keeping the maps to their stated size, after the atomic update rather than
   inside it: an update cannot ask "how many keys has this map got". Both
   steps are safe to race. A stale day or hour is simply $unset, which is the
   same whoever does it. A breakdown over MAP_KEYS folds its smallest entries
   into "(other)", each one conditional on its count being exactly what was
   read — so two tidies cannot both move the same count, and one that lost the
   race moves nothing. */
async function tidy(col, fp, doc, now) {
    const unset = {};
    const oldestDay = dayKey(new Date(now.getTime() - (DAYS_KEPT - 1) * 86400000));
    const oldestHour = hourKey(new Date(now.getTime() - (HOURS_KEPT - 1) * 3600000));
    for (const k of Object.keys(doc.days || {})) if (k < oldestDay) unset[`days.${k}`] = "";
    for (const k of Object.keys(doc.hours || {})) if (k < oldestHour) unset[`hours.${k}`] = "";
    if (Object.keys(unset).length) await col.updateOne({ _id: fp }, { $unset: unset });

    for (const map of BREAKDOWNS) {
        const entries = Object.entries(doc[map] || {}).filter(([k]) => k !== OTHER);
        const excess = entries.length + (doc[map] && doc[map][OTHER] ? 1 : 0) - MAP_KEYS;
        if (excess <= 0) continue;
        entries.sort((a, b) => a[1] - b[1]);
        for (const [k, n] of entries.slice(0, excess + (doc[map][OTHER] ? 0 : 1))) {
            await col.updateOne({ _id: fp, [`${map}.${k}`]: n },
                { $unset: { [`${map}.${k}`]: "" }, $inc: { [`${map}.${OTHER}`]: n } });
        }
    }
}

const BREAKDOWNS = ["browsers", "os", "devices", "pages", "countries", "builds", "themes"];

/* The batch, grouped. Reports in one batch that share a fingerprint become
   one update (their counts summed, the first kept as the sample), which is
   what keeps a page stuck in an error loop down to one write. meta:
     ua        the request's user-agent header, parsed here and not kept
     session   the visit id, raw; hashed here
     country   two letters, or ""
     now       when it arrived (a Date; the server's clock, never the browser's —
               a wrong one could park a group outside its TTL for ever)
     net       limiterKey(event) for a browser's batch, so a new group is
               held to that network's hourly budget; absent for functions
   Returns how many groups were written. A report for a NEW group past the
   new-group budgets (NEW GROUPS ARE WHAT COST SPACE, above) is dropped and
   counted as dropped here. Throws if the database does; the callers each
   decide what that means. */
async function recordReports(db, reports, meta = {}) {
    if (!Array.isArray(reports) || !reports.length) return 0;
    const col = db.collection(COLLECTION);
    ensureIndexes(db);            // not awaited: a report never waits on an index build
    const now = meta.now instanceof Date ? meta.now : new Date();
    const groups = new Map();
    for (const r of reports) {
        if (!r) continue;
        const fp = fingerprint(r);
        const g = groups.get(fp);
        if (g) {
            g.n += r.count || 1;
            if (g.rep.repeat && !r.repeat) g.rep = r;
        } else {
            groups.set(fp, { rep: r, n: r.count || 1 });
        }
    }
    const touch = reports.map(r => r && r.touch).find(t => typeof t === "number");
    const m = {
        ua: parseUserAgent(meta.ua, touch),
        session: hashSession(meta.session),
        country: typeof meta.country === "string" ? meta.country.slice(0, 2).toUpperCase() : "",
    };
    const net = typeof meta.net === "string" && meta.net ? meta.net : null;
    /* "dropped" counts REPORTS, one each, as the tab's label says (30 Sept
       2026) — it used to add the repeat count, so one refused report of
       "10,000 more" read as ten thousand dropped. And a report that only
       partly fits the network's occurrence budget is kept for the part that
       fits, rather than dropped whole. */
    let written = 0, dropped = 0;
    for (const [fp, { rep, n: asked }] of groups) {
        let n = asked;
        const source = rep.kind === "function" ? "function" : "client";
        const admit = () => newGroupAllowed(db, source, source === "function" ? null : net);
        if (source === "client" && net) {
            n = await takeHourly(db, `occ:net:${net}`, n, NET_OCC_PER_HOUR);
            if (n <= 0) {
                dropped++;
                continue;
            }
        }
        if (await upsertGroup(col, fp, rep, n, m, now, admit)) written++;
        else dropped++;
    }
    if (dropped) await countMeta(db, "dropped", dropped);
    return written;
}

/* ------------------------------------------------------------ THE WRAPPER

   Every function's handler goes through this (see the last lines of each
   file in this folder), so a function that throws, or answers 500 or more,
   leaves a report in /warren without anybody writing one.

   It changes nothing about the answer. A throw is recorded and THROWN ON,
   so the platform answers exactly as it did before; a returned response is
   handed back as the same object, body and all — share.js's page and
   image.js's base64 bytes pass through untouched. A 4xx is never recorded:
   those are the function doing its job.

   Recording is bounded by REPORT_WAIT_MS and swallows its own failures. It is
   awaited, not left running, for the reason _audit.js gives: Netlify freezes
   an instance the moment its handler returns, so a write still in flight
   would be lost as often as not. That wait only happens on a failure, and a
   failure that waits a third of a second longer is the right trade for one
   we know about.

   Not recorded: under `netlify dev` (NETLIFY_DEV), because local dev talks to
   the PRODUCTION database and a developer's broken work-in-progress is not a
   production error; and from the command-line tools (the same test _db.js
   makes), whose handlers are called by tests on purpose. */
const REPORT_WAIT_MS = 400;
const FROM_TOOL = Boolean(require.main && /[\\/]tools[\\/][^\\/]+$/.test(require.main.filename || ""));

function recordingOff() {
    return !testDb && (process.env.NETLIFY_DEV === "true" || FROM_TOOL);
}

function errorFieldOf(res) {
    try {
        if (!res || res.isBase64Encoded || typeof res.body !== "string" || res.body.length > 65536) return "";
        const parsed = JSON.parse(res.body);
        return parsed && typeof parsed.error === "string" ? parsed.error : "";
    } catch (e) {
        return "";
    }
}

// The first frame inside this folder: which file and line actually failed.
function frameOf(stack, name) {
    const m = /netlify[\\/]functions[\\/]([A-Za-z0-9_.-]+\.js):(\d+):(\d+)/.exec(String(stack || ""));
    if (m) return { source: `netlify/functions/${m[1]}`, line: Number(m[2]), col: Number(m[3]) };
    return { source: `netlify/functions/${name}.js`, line: 0, col: 0 };
}

function pathOf(event) {
    const q = (event && event.queryStringParameters) || {};
    const search = Object.keys(q).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(q[k] == null ? "" : q[k])}`).join("&");
    return String((event && event.path) || "") + (search ? "?" + search : "");
}

let functionHourSpent = -1;

async function reportFunctionFailure(name, event, context, { status, ms, error, message }) {
    const h = (event && event.headers) || {};
    const frame = frameOf(error && error.stack, name);
    const raw = {
        kind: "function",
        fn: name,
        message: (error && (error.message || String(error))) || message || `HTTP ${status} from ${name}`,
        source: frame.source,
        line: frame.line,
        col: frame.col,
        stack: error && error.stack,
        method: (event && event.httpMethod) || "",
        path: pathOf(event),
        page: pathOf(event).replace(/\?.*$/, ""),
        status,
        ms,
        requestId: h["x-nf-request-id"] || "",
        deployId: process.env.DEPLOY_ID || "",
        commit: (process.env.COMMIT_REF || "").slice(0, 7),
        build: (process.env.COMMIT_REF || "").slice(0, 7) || "",
        at: new Date().toISOString(),
    };
    if (error && !error.message && !message) raw.message = String(error);
    const rep = cleanReport(raw, { fromClient: false });
    if (!rep) return;
    /* An hour this instance already knows is spent (2 Oct 2026). Past the
       budget every failure still bumped the counter and the dropped tally —
       two writes per failing request, at exactly the moment (a database
       struggling, a flood answered with 5xx) that the database can least
       spare them. Once one bump has said the hour is over, this instance
       stops asking until the hour turns; the dropped tally then undercounts
       for that instance, which is the cheaper thing to be wrong about. */
    const hourNow = Math.floor(Date.now() / 3600000);
    if (functionHourSpent === hourNow && !testDb) return;
    const db = testDb || await getDb();
    // Its own hour, not the browsers' (FUNCTIONS HAVE THEIR OWN BUDGET, above).
    if (await overGlobalCap(db, 1, "function")) {
        functionHourSpent = hourNow;
        await countMeta(db, "dropped", 1);
        return;
    }
    await recordReports(db, [rep], {
        ua: h["user-agent"],
        country: countryOf(event, context),
    });
}

function settle(promise, ms) {
    let timer;
    const cap = new Promise(resolve => { timer = setTimeout(resolve, ms); });
    return Promise.race([promise.catch(() => {}), cap]).finally(() => clearTimeout(timer));
}

function withErrorReporting(name, handler) {
    if (typeof handler !== "function") return handler;
    // site-errors.js must never report its own failures to itself.
    if (name === "site-errors") return handler;
    const wrapped = async function (event, context, ...rest) {
        /* The site-wide rate limit (4 Oct 2026), asked here because every
           function but this store's own comes through this wrapper. See
           _ratelimit.js. A refusal is a 429, which is never recorded below. */
        const refused = await checkRateLimit(name, event);
        if (refused) return refused;
        const started = Date.now();
        let res;
        try {
            res = await handler.call(this, event, context, ...rest);
        } catch (error) {
            if (!recordingOff()) {
                await settle(reportFunctionFailure(name, event, context,
                    { status: 500, ms: Date.now() - started, error }), REPORT_WAIT_MS);
            }
            throw error;
        }
        try {
            if (res && typeof res.statusCode === "number" && res.statusCode >= 500 && !recordingOff()) {
                await settle(reportFunctionFailure(name, event, context,
                    { status: res.statusCode, ms: Date.now() - started, message: errorFieldOf(res) }), REPORT_WAIT_MS);
            }
        } catch (e) { /* never let the report change the answer */ }
        return res;
    };
    wrapped.unwrapped = handler;
    return wrapped;
}

/* For the tests alone: a stand-in database, so the wrapper and the store can
   be proved without touching the real one (which `netlify dev` shares with
   production). Null puts things back. */
function _setDbForTests(db) {
    testDb = db;
    ensuring = null;
}

module.exports = {
    COLLECTION, META, LIMITS, KEEP_DAYS, DAYS_KEPT, HOURS_KEPT, SAMPLES_KEPT, MAP_KEYS, VISITOR_SET,
    NET_PER_MINUTE, GLOBAL_PER_HOUR, NEW_PER_HOUR, NET_NEW_PER_HOUR, FUNCTION_PER_HOUR, SAMPLE_MAX_BYTES,
    KINDS, STATUSES, BREAKDOWNS, OTHER,
    withErrorReporting, recordReports, cleanReport, cleanUrl, scrub, cleanStack,
    normaliseMessage, fingerprint, parseUserAgent, countryOf, hashSession, fitSample,
    ensureIndexes, overNetCap, overGlobalCap, newGroupAllowed, limiterKey, countMeta, metaSince, readKey, dayKey, hourKey,
    _setDbForTests,
};

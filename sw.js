/* THE OFFLINE ARCHIVE (2 Nov 2026, the owner's: once a visitor has used
   /home, the mazes and events, and the pictures of them they have already
   seen, keep working with no connection).

   A service worker, registered by js/offline.js from /home only. It sits
   between the site's pages and the network and does ONE thing: keeps a copy
   of what the visitor has already fetched, and hands that copy back only
   when the network has actually failed.

   ----------------------------------------------------------------------
   ONLINE, NOTHING CHANGES

   Every request it touches goes to the network first, exactly as it would
   without it (the browser's own HTTP cache, the 304s, ?fresh= buckets and
   cache: "no-store" all behave as before, because the request is passed on
   as it was made). The copy is only read when fetch() itself rejects: no
   connection, DNS gone, the connection dropped. An error ANSWER (a 500, a
   503 while the database moves) is an answer, and goes to the page as it
   is, so the gate still shuts on it.

   So a new deploy takes effect on the next online load like it always has:
   the HTML, scripts, stylesheets and data are fetched fresh.

   Everything it does not name below it leaves alone entirely (no
   respondWith at all, so the browser fetches it as if this were not here):
   every POST/PUT/DELETE, every request carrying x-admin-token or an
   Authorization header, every function that is not a public archive read
   (auth, discord-auth, profiles, player-*, daily games, scores, presence,
   track, contact, the Warren's reads...), every other site, the Warren and
   anything it loads, and every page but /, /home, the record addresses and
   the other addresses that are home.html (see classify).

   ----------------------------------------------------------------------
   THE PAGE AND ITS SCRIPTS ARE KEPT AS ONE SET (4 Nov 2026, the bug scan)

   home.html, its scripts and its stylesheets only work with each other. They
   used to be stored one at a time as they passed, the page at once and each
   script at most daily, so after a deploy the copy could be a new page with
   day-old scripts, and a visit cut short left any mixture of the two.
   Offline, that is a page that may never start, with no network to mend it.

   So the copy is now one set: a page, the exact version of every script and
   stylesheet it loaded (stored under a name with its content hash in it, so
   two versions of a file sit side by side), and one small list, "the set",
   naming them. Nothing goes in the set as it passes. js/offline.js says
   when the page has finished loading ("mr-loaded", with the files it used),
   and only then are the files that changed written, followed by the list,
   which is a single write and is the moment the new set takes over. A visit
   that never gets that far leaves the last whole set as it was, and costs
   no storage at all. A deploy's visit also brings along the files the old
   set had that this load didn't ask for (a game loaded on demand), asked
   for in the ordinary way, which is a 304 unless they changed.

   Offline, a script is only ever the set's own version of that exact
   address. And a page that came from the network is never given a script
   from a set of another build when one of its requests drops: it gets the
   failure, as it would with no worker here.

   A page reached at a record's address counts (someone who only ever comes
   by shared links has an archive too), with its record's tags taken back
   off so the copy opens at any address. It costs them nothing they weren't
   already paying: the same answer, written once the page has loaded.

   Nothing is written when nothing changed: data and pages are compared
   with what's stored (the validator if both have one, or else a hash), so
   an ordinary visit reads the network and writes next to nothing.

   ----------------------------------------------------------------------
   THE GATE STILL DECIDES

   Offline, home.html's gate asks /settings as always and this answers with
   the last settings it saw, but only if those said the site was open
   ("enter"), and only for SETTINGS_MAX_AGE. The moment any settings answer
   says anything else (Coming Soon, Maintenance, no state at all), every
   copy here is thrown away, so a visitor last seen gated has nothing to be
   let in to. A whole-site ban is checked by the gate in this browser's own
   storage before it asks anything, offline included, and js/offline.js
   tells this worker to forget everything when it sees one (or a gated
   state) as well.

   ----------------------------------------------------------------------
   THE KILL SWITCH

   Set OFF to true and deploy. Browsers check this file for changes on
   every visit (netlify.toml revalidates it, and js/offline.js registers it
   with updateViaCache "none"), so on each visitor's next online visit the
   new copy installs, deletes every cache it made, unregisters itself, and
   from then on stops answering anything. To take it out for good, remove
   js/offline.js's script tag from home.html as well; until then that file
   registers this one again on each visit, and it unregisters itself again,
   which costs one small request and does nothing else. */
"use strict";

const OFF = false;

/* The copies, by kind. The "-v1" is the format of what is stored, not the
   site's version: a deploy never needs it changed (everything is fetched
   network first), only a change to how entries are stored here would. */
const PAGES = "mr-pages-v2";        // the set's page, the set itself, and / on its own
const DATA = "mr-data-v1";          // the archive's public reads, and the last open settings
const STATIC = "mr-static-v2";      // /js and /css, by content: only what the set names
const PICS = "mr-pics-v1";          // pictures and fonts the visitor's pages loaded
const OURS = [PAGES, DATA, STATIC, PICS];

/* Bounded, oldest out first. A picture is a resized thumbnail or a modal
   image (tens of KB to a few hundred); one that is bigger than PIC_BYTES is
   simply not kept. */
const PIC_LIMIT = 300;
const PIC_BYTES = 1500000;
// A stored picture is re-stored at most this often.
const REFRESH_MS = 24 * 60 * 60 * 1000;
// Offline, an open-site answer older than this no longer lets anybody in.
const SETTINGS_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const SETTINGS_KEY = "/.netlify/functions/settings";
const SET_KEY = "/.mr-set";
const STAMP = "X-MR-Stored";
const HASH = "X-MR-Hash";

/* The functions whose plain GET is the archive, and nothing else. Only the
   address with no query: rooms?full=1 and events?full=1 are the Warren's. */
/* "articles" (2 Nov 2026): the published articles, a public read like
   guides (drafts never leave articles.js without a token, and the Warren's
   ?full=1 has a query, so it is never kept). */
const DATA_FNS = new Set(["rooms", "events", "tags", "contributors", "guides", "whats-new", "dead-ends", "articles"]);

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(n => n.startsWith("mr-") && (OFF || !OURS.includes(n))).map(n => caches.delete(n)));
        if (OFF) { await self.registration.unregister(); return; }
        await self.clients.claim();
    })());
});

/* Which kind of request this is, or null for "leave it alone". */
function classify(req, url) {
    if (req.method !== "GET") return null;
    if (url.origin !== self.location.origin) return null;
    if (req.headers.has("authorization") || req.headers.has("x-admin-token") || req.headers.has("range")) return null;
    const path = url.pathname;
    // The Warren, and anything it loads, as if this were not here.
    if (/^\/warren/i.test(path) || /^\/(?:js|css)\/(?:admin|warren)/i.test(path)) return null;
    try { if (req.referrer && /^\/warren/i.test(new URL(req.referrer).pathname)) return null; } catch (e) { /* no referrer: judged on its own address */ }

    if (req.mode === "navigate") {
        if (req.destination && req.destination !== "document") return null;   // a frame
        return pageKind(path);
    }
    if (path === SETTINGS_KEY) return "settings";
    const fn = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(path);
    if (fn) return DATA_FNS.has(fn[1]) && !url.search ? "data" : null;
    if (path === "/.netlify/images") return "pic";
    if (path.startsWith("/.netlify/")) return null;
    if (/^\/js\/[^/]+\.js$/.test(path) || /^\/css\/[^/]+\.css$/.test(path)) return "static";
    if (/^\/assets\/.+\.(?:png|gif|jpe?g|webp|svg|ico|woff2?|ttf)$/i.test(path)) return "pic";
    return null;
}

function pageKind(path) {
    if (path === "/" || path === "/home") return "page";
    // A maze, event or guide's own address is the archive page with that
    // record's preview tags (share.js); offline it is the archive page.
    // An article's own address and the Articles list too (2 Nov 2026).
    // And the other addresses netlify.toml sends through share.js, which
    // serves home.html for each (3 Nov 2026, the bug scan: /news,
    // /timeline and /furni would not open offline): the three views, the
    // Profiles and Guides windows, the glyph sheet, and the two daily
    // games, which offline open the archive and say they need a
    // connection. Not /purapanic, /scout or /fallinfurni, games whose
    // whole page is the game.
    if (/^\/(?:maze|event|guides|article)\/[^/]+\/?$/.test(path) ||
        /^\/(?:articles|news|timeline|furni|profiles?|glyphs|guess|odd|guides)\/?$/.test(path)) return "shell";
    return null;
}

/* Clients that have been handed a copy because the network failed, so the
   page can say so (js/offline.js asks, and is told of later ones). */
const fellBack = new Set();
// Pictures stored by this run of the worker: not cloned again until it restarts.
const recent = new Set();

/* What this run of the worker has seen of the page loads going on. All of it
   only saves work: if the worker stops, loadedPage and loadedFile read the
   same answers back out of the browser's own cache.
     heldPages   a client's page, until that page says it has loaded
     heldFiles   the scripts and stylesheets as they came, by address
     builds      the build of each page that came from the network
     loading     scripts on their way, which a set must wait for
     settled     clients whose load has been made the set
     broken      clients one of whose scripts failed: not a load to keep */
const heldPages = new Map();
const heldFiles = new Map();
const builds = new Map();
const loading = new Set();
const settled = new Set();
const broken = new Set();

self.addEventListener("fetch", event => {
    if (OFF) return;
    const req = event.request;
    let url;
    try { url = new URL(req.url); } catch (e) { return; }
    const kind = classify(req, url);
    if (!kind) return;
    event.respondWith(networkFirst(event, req, url, kind));
});

async function networkFirst(event, req, url, kind) {
    let res, done = () => {};
    if (kind === "static") {
        const waiting = new Promise(ok => { done = ok; });
        loading.add(waiting);
        waiting.then(() => loading.delete(waiting));
    }
    const isPage = kind === "page" || kind === "shell";
    try {
        // Marked at once: its scripts can arrive before its own answer has been read.
        if (isPage && url.pathname !== "/" && event.resultingClientId) heldPages.set(event.resultingClientId, null);
        res = await fetch(req);
    } catch (err) {
        if (kind === "static") broken.add(event.clientId);
        done();
        const hit = await fromCache(event, req, url, kind).catch(() => null);
        if (!hit) throw err;
        tell(event.resultingClientId || event.clientId, isPage);
        return hit;
    }
    if (kind === "static" && !res.ok) broken.add(event.clientId);
    /* The network answered for a page that was told it was offline: it isn't
       now. Not a picture, which the browser's own cache can answer for a day
       with no network at all. */
    if (kind !== "pic" && event.clientId && fellBack.has(event.clientId)) untell(event.clientId);
    // Pictures already stored in this run are not stored again.
    if (kind === "pic" && recent.has(req.url)) return res;
    if (res.ok && res.status === 200 && res.type === "basic") {
        const copy = res.clone();
        const client = event.resultingClientId || event.clientId;
        event.waitUntil(fromWarren(event.clientId)
            .then(w => (w ? copy.body && copy.body.cancel() : keep(req, url, kind, copy, client)))
            .catch(() => {})
            .then(done));
    } else {
        done();
    }
    return res;
}

/* A picture a Warren stylesheet asked for names the stylesheet, not the
   Warren, as its referrer, so the page itself is asked: nothing the Warren
   loads is kept. */
async function fromWarren(clientId) {
    if (!clientId) return false;
    const c = await self.clients.get(clientId);
    return !!(c && /^\/warren/i.test(new URL(c.url).pathname));
}

/* Which fallbacks say "offline" (3 Nov 2026, the bug scan). It used to be
   every one, so a single dropped request (one thumbnail, one script, one
   data read, on a page whose own load came from the network) put the page
   into "You're offline" for good: js/offline.js blocked the games and Sign
   in until an `online` event, which never comes when the browser was never
   offline. Now only the page itself coming from the copy (a "page" or
   "shell" navigation) says so outright, and is remembered for mr-status;
   any other fallback is passed on as page: false, and the page only takes
   that as offline when its own navigator.onLine is false (asked there, as
   the page's view of the connection is what decides). And the first request
   for that page the network does answer afterwards tells it mr-online. */
function tell(id, page) {
    if (!id) return;
    if (page || self.navigator.onLine === false) fellBack.add(id);
    self.clients.get(id).then(c => { if (c) c.postMessage({ type: "mr-offline", page: !!page }); }, () => {});
}

function untell(id) {
    fellBack.delete(id);
    self.clients.get(id).then(c => { if (c) c.postMessage({ type: "mr-online" }); }, () => {});
}

// What a response's own Cache-Control allows: never a private or no-store one.
function shareable(res) {
    const cc = (res.headers.get("cache-control") || "").toLowerCase();
    if (/\b(?:private|no-store)\b/.test(cc)) return false;
    return (res.headers.get("vary") || "").trim() !== "*";
}

// The response again, with when it was stored and what it hashes to.
async function stamped(res) {
    const body = await res.blob();
    const headers = freshHeaders(res);
    const hash = await hashOf(body);
    headers.set(HASH, hash);
    return { body, hash, response: new Response(body, { status: res.status, statusText: res.statusText, headers }) };
}

async function hashOf(blobOrText) {
    const bytes = typeof blobOrText === "string" ? new TextEncoder().encode(blobOrText) : await blobOrText.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest.slice(0, 10), b => b.toString(16).padStart(2, "0")).join("");
}

// What says two answers are the same without reading either: an ETag, or a date.
function validator(res) {
    return res.headers.get("etag") || res.headers.get("last-modified") || "";
}

/* Stored under key, only if it is not what is already there. Most visits
   stop at the validator, and don't read the body at all. */
async function storeIfChanged(name, key, res) {
    const cache = await caches.open(name);
    const had = await cache.match(key);
    if (had && validator(res) && validator(res) === validator(had)) { res.body && res.body.cancel(); return; }
    const { hash, response } = await stamped(res);
    if (had && had.headers.get(HASH) === hash) return;
    await cache.put(key, response);
}

/* The response's own headers, less the two that describe the bytes on the
   wire (the body kept here is already unpacked), plus when it was stored. */
function freshHeaders(res) {
    const headers = new Headers(res.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    headers.set(STAMP, String(Date.now()));
    return headers;
}

function storedAt(res) {
    return Number(res && res.headers.get(STAMP)) || 0;
}

/* Settings answers, and forgetting, one at a time in the order they came:
   an "enter" still being stored must not land after a later Maintenance
   answer has thrown everything away. */
let settingsQueue = Promise.resolve();
function inTurn(job) {
    settingsQueue = settingsQueue.then(job, job);
    return settingsQueue;
}

async function keep(req, url, kind, res, client) {
    const type = (res.headers.get("content-type") || "").toLowerCase();

    if (kind === "settings") {
        // Read before anything else: a shut answer is acted on however it is marked.
        let s = null;
        try { s = /json/.test(type) ? await res.json() : null; } catch (e) { s = null; }
        if (!s) return;
        if (s.landingState !== "enter") return inTurn(forget);
        if (!shareable(res)) return;
        const response = new Response(JSON.stringify(s), { status: 200, headers: freshHeaders(res) });
        return inTurn(async () => { await (await caches.open(DATA)).put(SETTINGS_KEY, response); });
    }
    if (!shareable(res)) { res.body && res.body.cancel(); return; }
    if (kind === "data") {
        if (!/json/.test(type)) return;
        await storeIfChanged(DATA, url.pathname, res);
        return;
    }
    if (kind === "page" && url.pathname === "/") {
        // The landing page, on its own and outside the set: all it does
        // offline is go on to /home, or stay put if /home has just sent it back.
        if (!/text\/html/.test(type) || res.redirected) return;
        await storeIfChanged(PAGES, "/", res);
        return;
    }
    if (kind === "page" || kind === "shell") {
        const page = await readPage(res, kind);
        if (page && client) { heldPages.set(client, page); builds.set(client, page.build); }
        return;
    }
    if (kind === "static") {
        const file = await readFile(req.url, res);
        heldFiles.set(req.url, file);
        // A file asked for after the page's load was made the set.
        if (client && settled.has(client)) inTurn(() => addFile(req.url, file, true)).catch(() => {});
        return;
    }

    // pic: one entry per address, refreshed at most daily.
    const cache = await caches.open(PICS);
    const had = await cache.match(req.url);
    if (had && Date.now() - storedAt(had) < REFRESH_MS) { recent.add(req.url); res.body && res.body.cancel(); return; }
    const { body, response } = await stamped(res);
    if (body.size > PIC_BYTES) return;
    if (had) await cache.delete(req.url);       // to the back of the queue
    await cache.put(req.url, response);
    recent.add(req.url);
    await trim(cache, PIC_LIMIT);
}

async function trim(cache, max) {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/* ---- THE SET: { build, page, shell, files: { address: { key, tag } } } ----
   See "the page and its scripts are kept as one set" at the top. */

async function readSet() {
    const res = await caches.match(SET_KEY, { cacheName: PAGES });
    return res ? res.json() : null;
}

/* A page's answer, ready to store. A record's address gives up its record:
   its tags are worn once, and the copy may be opened at any address, where
   mazerats:record would open the wrong window (home.js servedRecord). */
async function readPage(res, kind) {
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!/text\/html/.test(type) || res.redirected) { res.body && res.body.cancel(); return null; }
    const headers = freshHeaders(res);
    let html = await res.text();
    const shell = kind === "shell";
    if (shell) {
        html = html.replace(/<meta name="mazerats:record"[^>]*>\s*/i, "")
            .replace(/<title data-archive="([^"]*)">[\s\S]*?<\/title>/i, "<title>$1</title>");
    }
    const m = /<meta name="mazerats:build" content="([^"]*)"/.exec(html);
    const key = new URL("/home?mr=" + await hashOf(html), self.location.origin).href;
    return { key, shell, html, headers, build: m ? m[1] : "" };
}

/* A script or stylesheet's answer: its key, and the response to store if
   nothing has that key yet. Same validator as the set's copy: no reading. */
async function readFile(href, res, set) {
    const had = (set || await readSet() || { files: {} }).files[href];
    const tag = validator(res);
    if (had && tag && had.tag === tag) { res.body && res.body.cancel(); return { key: had.key, tag }; }
    const { hash, response } = await stamped(res);
    return { key: href + (href.includes("?") ? "&" : "?") + "mr=" + hash, tag, response };
}

// What the browser already holds, without going to the network.
function fromBrowser(href) {
    return fetch(href, { cache: "only-if-cached", mode: "same-origin" }).then(res => (res.ok && res.status === 200 ? res : null), () => null);
}

async function loadedPage(client, href, build) {
    let page = heldPages.get(client);
    if (!page) {
        const url = new URL(href, self.location.origin);
        const kind = url.origin === self.location.origin && url.pathname !== "/" ? pageKind(url.pathname) : null;
        const res = kind && await fromBrowser(href);
        page = res ? await readPage(res, kind) : null;
    }
    return page && page.build === build ? page : null;
}

/* Makes this page's load the set, if it differs from the one there is. Every
   file is written before the list that names it, so until that last single
   write the old set is whole, and a stop part-way leaves only files that the
   next run clears up. Any file that can't be had: the old set stands. */
async function makeSet(client, href, build, asked) {
    const before = await readSet();
    const page = await loadedPage(client, href, build);
    if (!page) return;
    const files = {};
    let changed = !before || before.build !== build;
    for (const a of asked) {
        const file = heldFiles.get(a) || await fromBrowser(a).then(res => (res ? readFile(a, res, before) : null));
        if (!file) return;
        files[a] = file;
        if (!before || !before.files[a] || before.files[a].key !== file.key) changed = true;
    }
    if (before) {
        /* One copy per file: after a raised ?v= the old address is never asked
           for again, and would be carried along for good. Newest first, as a
           later file was stored later. */
        const pathOf = (href) => href.split("?")[0];
        const kept = new Set(Object.keys(files).map(pathOf));
        for (const a of Object.keys(before.files).reverse()) {
            if (kept.has(pathOf(a))) continue;
            kept.add(pathOf(a));
            if (!changed) { files[a] = before.files[a]; continue; }
            // A file this load didn't use, say a game's. Left out if it can't be asked.
            const res = await fetch(a).catch(() => null);
            if (res && res.status === 200 && res.type === "basic") files[a] = await readFile(a, res, before);
        }
    }
    // On the same build a record's address never replaces a page; /home itself only does when it differs.
    if (changed || (!page.shell && page.key !== before.page)) {
        const statics = await caches.open(STATIC);
        for (const f of Object.values(files)) {
            if (f.response && !(await statics.match(f.key))) await statics.put(f.key, f.response);
        }
        const pages = await caches.open(PAGES);
        const headers = new Headers(page.headers);
        await pages.put(page.key, new Response(page.html, { status: 200, headers }));
        const list = {};
        Object.keys(files).forEach(a => { list[a] = { key: files[a].key, tag: files[a].tag }; });
        await writeSet(pages, { build, page: page.key, shell: page.shell, files: list });
        await clearUp(statics, pages, page.key, list);
    }
    settled.add(client);
    heldPages.delete(client);
    heldFiles.clear();
}

function writeSet(pages, set) {
    return pages.put(SET_KEY, new Response(JSON.stringify(set), { headers: { "Content-Type": "application/json" } }));
}

async function clearUp(statics, pages, pageKey, list) {
    const wanted = new Set(Object.values(list).map(f => f.key));
    for (const k of await statics.keys()) if (!wanted.has(k.url)) await statics.delete(k);
    const path = new URL(SET_KEY, self.location.origin).href, root = new URL("/", self.location.origin).href;
    for (const k of await pages.keys()) if (k.url !== pageKey && k.url !== path && k.url !== root) await pages.delete(k);
}

/* A file asked for after the set was made (a game opened on this page). It
   joins the set, and may replace a version only if it came to the page that
   made the set: an older tab's request can have reached a newer deploy than
   the set's, and that must not get mixed in. */
async function addFile(href, file, own) {
    const set = await readSet();
    if (!set) return;
    const had = set.files[href];
    if (had && (had.key === file.key || !own)) return;
    if (file.response && !(await caches.match(file.key, { cacheName: STATIC }))) {
        await (await caches.open(STATIC)).put(file.key, file.response);
    }
    set.files[href] = { key: file.key, tag: file.tag };
    await writeSet(await caches.open(PAGES), set);
    if (had) await (await caches.open(STATIC)).delete(had.key);
}

async function fromCache(event, req, url, kind) {
    if (kind === "settings") {
        const hit = await caches.match(SETTINGS_KEY, { cacheName: DATA });
        if (!hit || Date.now() - storedAt(hit) > SETTINGS_MAX_AGE) return null;
        return hit;
    }
    if (kind === "data") return caches.match(url.pathname, { cacheName: DATA });
    if (kind === "pic") return caches.match(req.url, { cacheName: PICS });

    if (kind === "page" && url.pathname === "/") {
        const landing = await caches.match("/", { cacheName: PAGES });
        if (landing) return landing;
        // Never been there (came by shared links), so it is the archive; but
        // not when the archive's own gate has just sent the visitor here.
        if (req.referrer) return null;
    }
    const set = await readSet();
    if (!set) return null;
    if (kind === "static") {
        // A page from the network, of another build: not to be given this set's.
        const built = builds.get(event.clientId);
        if (built !== undefined && built !== set.build) return null;
        const file = set.files[req.url];
        return file ? caches.match(file.key, { cacheName: STATIC }) : null;
    }
    return caches.match(set.page, { cacheName: PAGES });
}

async function forget() {
    recent.clear();
    heldPages.clear();
    heldFiles.clear();
    await Promise.all(OURS.map(n => caches.delete(n)));
}

/* What js/offline.js says:
     mr-status   was this page handed a copy? (answered on the port)
     mr-forget   this browser carries a ban, or was last told the site is
                 shut: throw everything away
     mr-loaded   this page has finished loading from the network, with these
                 scripts and stylesheets: make them the set. And on the first
                 visit, before this worker was looking, the addresses the page
                 had ALREADY loaded, stored from the browser's own HTTP cache
                 only (only-if-cached: nothing is fetched from the network, so
                 nothing extra is downloaded) */
self.addEventListener("message", event => {
    const d = event.data || {};
    const source = event.source;
    if (source && source.url && new URL(source.url).origin !== self.location.origin) return;
    if (d.type === "mr-status") {
        const port = event.ports && event.ports[0];
        if (port) port.postMessage({ offline: !!(source && fellBack.has(source.id)) });
    } else if (d.type === "mr-forget") {
        event.waitUntil(inTurn(forget));
    } else if (d.type === "mr-loaded" && source && !fellBack.has(source.id) && !OFF) {
        event.waitUntil(loaded(d, source));
    }
});

async function loaded(d, source) {
    const from = source.url;
    const asked = [];
    const urls = Array.isArray(d.urls) ? d.urls.slice(0, 600) : [];
    for (const href of urls.concat(Array.isArray(d.files) ? d.files.slice(0, 600) : [])) {
        let url;
        try { url = new URL(href, self.location.origin); } catch (e) { continue; }
        const kind = classify(new Request(url.href, { referrer: from || "about:client" }), url);
        if (kind === "static") { if (!asked.includes(url.href)) asked.push(url.href); continue; }
        if (!kind || !urls.includes(href)) continue;
        const res = await fromBrowser(url.href);
        if (res) await keep(new Request(url.href), url, kind, res).catch(() => {});
    }
    // Whatever is still on its way is part of this load (not for ever: a hung request).
    await Promise.race([Promise.all([...loading]), new Promise(ok => setTimeout(ok, 10000))]);
    if (broken.has(source.id)) return;
    await inTurn(() => makeSet(source.id, String(d.page), String(d.build), asked)).catch(() => {});
}

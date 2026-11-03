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
   the HTML, scripts, stylesheets and data are fetched fresh, and the copy
   is only overwritten with them.

   Everything it does not name below it leaves alone entirely (no
   respondWith at all, so the browser fetches it as if this were not here):
   every POST/PUT/DELETE, every request carrying x-admin-token or an
   Authorization header, every function that is not a public archive read
   (auth, discord-auth, profiles, player-*, daily games, scores, presence,
   track, contact, the Warren's reads...), every other site, the Warren and
   anything it loads, and every page but /, /home and the record addresses.

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
const PAGES = "mr-pages-v1";        // /, /home
const DATA = "mr-data-v1";          // the archive's public reads, and the last open settings
const STATIC = "mr-static-v1";      // /js and /css, one version of each file
const PICS = "mr-pics-v1";          // pictures and fonts the visitor's pages loaded
const OURS = [PAGES, DATA, STATIC, PICS];

/* Bounded, oldest out first. A picture is a resized thumbnail or a modal
   image (tens of KB to a few hundred); one that is bigger than PIC_BYTES is
   simply not kept. */
const LIMITS = { [STATIC]: 160, [PICS]: 300 };
const PIC_BYTES = 1500000;
// A stored picture or script is re-stored at most this often.
const REFRESH_MS = 24 * 60 * 60 * 1000;
// Offline, an open-site answer older than this no longer lets anybody in.
const SETTINGS_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const SETTINGS_KEY = "/.netlify/functions/settings";
const STAMP = "X-MR-Stored";

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
        if (path === "/" || path === "/home") return "page";
        // A maze, event or guide's own address is the archive page with that
        // record's preview tags (share.js); offline it is the archive page.
        // An article's own address and the Articles list too (2 Nov 2026).
        if (/^\/(?:maze|event|guides|article)\/[^/]+\/?$/.test(path) || /^\/articles\/?$/.test(path)) return "shell";
        return null;
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

/* Clients that have been handed a copy because the network failed, so the
   page can say so (js/offline.js asks, and is told of later ones). */
const fellBack = new Set();
// URLs stored by this run of the worker: not cloned again until it restarts.
const recent = new Set();

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
    let res;
    try {
        res = await fetch(req);
    } catch (err) {
        const hit = await fromCache(req, url, kind).catch(() => null);
        if (!hit) throw err;
        tell(event.resultingClientId || event.clientId);
        return hit;
    }
    // Pictures and scripts already stored in this run are not stored again.
    if ((kind === "pic" || kind === "static") && recent.has(req.url)) return res;
    if (res.ok && res.status === 200 && res.type === "basic") {
        const copy = res.clone();
        event.waitUntil(fromWarren(event.clientId)
            .then(w => (w ? copy.body && copy.body.cancel() : keep(req, url, kind, copy)))
            .catch(() => {}));
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

function tell(id) {
    if (!id) return;
    fellBack.add(id);
    self.clients.get(id).then(c => { if (c) c.postMessage({ type: "mr-offline" }); }, () => {});
}

// What a response's own Cache-Control allows: never a private or no-store one.
function shareable(res) {
    const cc = (res.headers.get("cache-control") || "").toLowerCase();
    if (/\b(?:private|no-store)\b/.test(cc)) return false;
    return (res.headers.get("vary") || "").trim() !== "*";
}

// The response again, with when it was stored, so its age can be read back.
async function stamped(res) {
    const body = await res.blob();
    const headers = freshHeaders(res);
    return { body, response: new Response(body, { status: res.status, statusText: res.statusText, headers }) };
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

async function keep(req, url, kind, res) {
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
        const { response } = await stamped(res);
        await (await caches.open(DATA)).put(url.pathname, response);
        return;
    }
    if (kind === "page") {
        if (!/text\/html/.test(type) || res.redirected) return;
        const { response } = await stamped(res);
        await (await caches.open(PAGES)).put(url.pathname, response);
        return;
    }
    if (kind === "shell") { res.body && res.body.cancel(); return; }

    // static and pic: one entry per address, refreshed at most daily.
    const name = kind === "static" ? STATIC : PICS;
    const cache = await caches.open(name);
    const had = await cache.match(req.url);
    if (had && Date.now() - storedAt(had) < REFRESH_MS) { recent.add(req.url); res.body && res.body.cancel(); return; }
    const { body, response } = await stamped(res);
    if (kind === "pic" && body.size > PIC_BYTES) return;
    if (kind === "static") {
        // The older ?v= of the same file goes: only the newest is kept.
        const same = await cache.keys(req.url, { ignoreSearch: true });
        await Promise.all(same.map(k => cache.delete(k)));
    } else if (had) {
        await cache.delete(req.url);       // to the back of the queue
    }
    await cache.put(req.url, response);
    recent.add(req.url);
    await trim(cache, LIMITS[name]);
}

async function trim(cache, max) {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function fromCache(req, url, kind) {
    if (kind === "settings") {
        const hit = await caches.match(SETTINGS_KEY, { cacheName: DATA });
        if (!hit || Date.now() - storedAt(hit) > SETTINGS_MAX_AGE) return null;
        return hit;
    }
    if (kind === "data") return caches.match(url.pathname, { cacheName: DATA });
    if (kind === "page") return caches.match(url.pathname, { cacheName: PAGES });
    if (kind === "shell") return caches.match("/home", { cacheName: PAGES });
    if (kind === "static") {
        return (await caches.match(req.url, { cacheName: STATIC })) ||
            caches.match(req.url, { cacheName: STATIC, ignoreSearch: true });
    }
    return caches.match(req.url, { cacheName: PICS });
}

async function forget() {
    recent.clear();
    await Promise.all(OURS.map(n => caches.delete(n)));
}

/* What js/offline.js says:
     mr-status   was this page handed a copy? (answered on the port)
     mr-forget   this browser carries a ban, or was last told the site is
                 shut: throw everything away
     mr-seen     the first visit, before this worker was looking: the
                 addresses the page has ALREADY loaded, stored from the
                 browser's own HTTP cache only (only-if-cached: nothing is
                 fetched from the network, so nothing extra is downloaded) */
self.addEventListener("message", event => {
    const d = event.data || {};
    const source = event.source;
    if (source && source.url && new URL(source.url).origin !== self.location.origin) return;
    if (d.type === "mr-status") {
        const port = event.ports && event.ports[0];
        if (port) port.postMessage({ offline: !!(source && fellBack.has(source.id)) });
    } else if (d.type === "mr-forget") {
        event.waitUntil(inTurn(forget));
    } else if (d.type === "mr-seen" && Array.isArray(d.urls) && !OFF) {
        event.waitUntil(seen(d.urls.slice(0, 600), source && source.url));
    }
});

async function seen(urls, from) {
    for (const href of urls) {
        let url;
        try { url = new URL(href, self.location.origin); } catch (e) { continue; }
        const nav = href === from;
        // Asked for as the page asked for it: the document as a page, the rest as a plain GET.
        const kind = nav ? (url.pathname === "/" || url.pathname === "/home" ? "page" : null)
            : classify(new Request(url.href, { referrer: from || "about:client" }), url);
        if (!kind || kind === "shell") continue;
        try {
            const res = await fetch(url.href, { cache: "only-if-cached", mode: "same-origin" });
            if (res.ok && res.status === 200) await keep(new Request(url.href), url, kind, res);
        } catch (e) { /* not in the browser's cache: the next visit stores it */ }
    }
}

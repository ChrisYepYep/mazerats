/* Talks to the Netlify Functions backed by MongoDB (see netlify/functions/).
   GETs are public. Writes need a session token from logging in with a
   username/password on the admin page — see js/admin.js and
   netlify/functions/auth.js. */
const Api = {
    // Shared by every public GET-with-fallback below (rooms/events/tags/
    // contributors/site settings). A hung request (not just a failing one)
    // used to only get this timeout treatment on getSiteSettings — a slow
    // cold start or stalled connection on rooms/events/tags/contributors
    // would otherwise never reject at all, leaving Promise.all([...]) (see
    // js/home.js) stuck forever instead of falling through to the bundled
    // fallback data like an outright failure already does.
    /* Which of the bundled fallbacks are currently standing in for real
       data. The site used to drop to them in complete silence: a visitor
       whose rooms request timed out saw a page that looked entirely healthy
       — loader gone, layout intact — holding the ONE maze in
       js/rooms-data.js instead of the thirty-seven that exist, with nothing
       but a console warning to say so. js/home.js reads this and says so on
       the page. */
    _degraded: new Set(),

    /* Two attempts before giving up. The first is the ordinary case; the
       second is generous, because by far the likeliest cause is a cold
       function rather than an outage.

       THE FIRST WAS 6000 AND THAT WAS TOO TIGHT. A cold start on /rooms
       measured 5.3s against it — inside the window by seven hundred
       milliseconds, which is not a margin, it is a coin toss. Every toss lost
       showed somebody the one-maze offline copy of a thirty-seven maze
       archive while the site was working perfectly well.

       10s and 15s instead. The cold starts this is sized around should also
       be far rarer now that the durable cache is actually in use (see
       CDN_CACHE in netlify/functions/_cache.js), so the long leash should be
       reached less often as well as mattering less when it is. */
    async _getWithFallback(url, label, fallbackFn, headers) {
        const attempts = [10000, 15000];
        for (let i = 0; i < attempts.length; i++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), attempts[i]);
            try {
                const res = await fetch(url, headers ? { signal: controller.signal, headers } : { signal: controller.signal });
                if (!res.ok) throw new Error(`${label} fetch failed: ${res.status}`);
                const data = await res.json();
                this._degraded.delete(label);
                return data;
            } catch (e) {
                if (i === attempts.length - 1) {
                    console.warn(`Live ${label} unavailable after ${attempts.length} attempts, using fallback.`, e);
                    this._degraded.add(label);
                    return fallbackFn();
                }
            } finally {
                clearTimeout(timeout);
            }
        }
    },

    /* Turns the packed wire format back into the records the rest of the
       site is written against (see netlify/functions/_furni-payload.js for
       what was packed and why). A plain array comes straight back untouched,
       so the bundled fallback data and any older response still work.

       The furni each detection is put back together from: the shared table
       entry, and the sprite the detection itself carried. sprite is now the
       SMALL image where one is known — that is what the furni card draws —
       falling back to the icon when a hand-added entry has no sprite of its
       own. */
    _unpack(payload) {
        if (Array.isArray(payload)) return payload;
        if (!payload || payload.v !== 2 || !Array.isArray(payload.f)) return [];
        const prefix = payload.p || "";
        /* A whole address goes as it stands (1 Oct 2026): the prefix is
           FurniIndex's new API now, and the few pictures it can't serve are
           sent with their old address in full (_furni-payload.js). */
        // An empty one stays empty (2 Oct 2026): js/home.js reads "" as "no
        // picture", where the bare prefix is a request for a 404.
        const at = v => (!v || /^https?:\/\//.test(v) ? (v || "") : prefix + v);
        const table = payload.f.map(t => ({
            name: t.n || "",
            className: t.c || "",
            motto: t.m || "",
            icon: at(t.i || ""),
            url: t.u || "",
            releaseDate: t.d || ""
        }));
        return (payload.rooms || []).map(record => {
            if (!record.furni) return record;
            const furni = {};
            for (const [image, hits] of Object.entries(record.furni)) {
                furni[image] = {
                    items: hits.map(([index, sprite]) => {
                        const base = table[index];
                        if (!base) return null;
                        return { ...base, sprite: sprite ? at(sprite) : base.icon };
                    }).filter(Boolean)
                };
            }
            return { ...record, furni };
        });
    },

    /* One request per endpoint per page, however many callers ask for it.

       home.html wants events twice — the archive itself (js/home.js) and the
       header's upcoming-events ticker (js/site.js) — and each was fetching
       the whole 57KB payload independently, because nothing here remembered
       that a request was already in flight. index.html will do the same the
       moment welcome.js and site.js are both on a page.

       The promise is cached, not the data: callers still get their own
       resolved array, a caller arriving mid-flight joins the request already
       running rather than starting a second, and the fallback path is shared
       too, so a dead endpoint produces one pair of attempts rather than one
       pair per caller.

       Deliberately not invalidated. These live for the lifetime of a page
       load, which is exactly how long the archive is read for; anything that
       needs to see a write straight back uses the admin reads below, which
       are uncached on purpose. */
    _inflight: {},

    _once(key, fn) {
        if (!this._inflight[key]) this._inflight[key] = fn();
        return this._inflight[key];
    },

    // The UTC day the memoised rooms request was made on. See roomsForToday.
    roomsDay: "",

    async getRooms() {
        return this._once("rooms", () => {
            this.roomsDay = new Date().toISOString().slice(0, 10);
            return this._getWithFallback("/.netlify/functions/rooms", "room data",
                () => typeof DEFAULT_ROOMS !== "undefined" ? DEFAULT_ROOMS : []).then(d => this._unpack(d));
        });
    },

    /* The one exception to "deliberately not invalidated" above: the daily
       games. They deal a day from the rooms that existed before it, and
       the server deals the same day from the archive as it is NOW. A tab
       left open overnight held yesterday's copy, so it dealt today without
       any room added since, a different day from the server's, and every
       right answer was scored wrong. A copy fetched on an earlier UTC day
       is dropped and fetched again; within the day this is getRooms. */
    roomsForToday() {
        if (this._inflight.rooms && this.roomsDay !== new Date().toISOString().slice(0, 10)) {
            delete this._inflight.rooms;
        }
        return this.getRooms();
    },

    async getEvents() {
        return this._once("events", () => this._getWithFallback("/.netlify/functions/events", "event data",
            () => typeof DEFAULT_EVENTS !== "undefined" ? DEFAULT_EVENTS : []).then(d => this._unpack(d)));
    },

    /* The admin page's own read: the records exactly as stored, with the
       reviewer fields and hidden detections the packed public form drops.
       Uncached, so a save is always read back in full. */
    getRoomsFull(token) { return this._write("/.netlify/functions/rooms?full=1", "GET", token); },
    getEventsFull(token) { return this._write("/.netlify/functions/events?full=1", "GET", token); },

    /* A fetch on a leash, for everything below that is not a public read.

       The public GETs have had one since _getWithFallback; the admin reads
       and writes, the login and the contact form never did, so a request
       that merely HUNG — not failed — left its button saying "Saving…" or
       its panel saying "Loading…" for as long as the tab stayed open, with
       no error to show and nothing to retry.

       HOW LONG, per kind of call rather than one number:
       - reads and the login: 15s, a little longer than the public reads'
         first attempt, since there is no second attempt here;
       - writes: 30s. Deliberately PAST Netlify's own ceiling on a function
         (26s at most), so by the time this gives up the server has
         certainly answered or died. A shorter leash on a write can report
         failure for a save that went on to succeed, and the retry that
         follows is a duplicate;
       - image uploads: sized to the picture (uploadTimeout below), because
         the time is the visitor's upload bandwidth, not the function.

       The timer is not cleared on the headers, so a body that stalls is
       covered too; an abort after the body has been read does nothing. A
       timeout comes back as an ordinary Error with a sentence a person can
       read (and err.timedOut), which every caller already shows.

       ---- INCLUDING A TIMEOUT WHILE THE BODY IS READ (28 Sept 2026).

       Only the fetch() itself used to be translated. The leash runs on past
       the headers on purpose, but when it ran out during res.json() the
       caller got the browser's raw AbortError ("The user aborted a
       request.") — or, worse, nothing at all: getFurniCatalogue, login and
       the contact form read their bodies with .catch(() => ({})), so a
       timed-out catalogue search came back as an empty result that looked
       like "no furni by that name". The response's body readers are now
       wrapped so that abort becomes the same friendly timeout error, and
       _body() below reads a body with a fallback for a MALFORMED one while
       letting a timeout through. */
    _TIMEOUT_READ: 15000,
    _TIMEOUT_WRITE: 30000,
    _TIMEOUT_UPLOAD: 90000,

    /* An upload's leash, by its size. A flat 90s was fine for a screenshot
       and cut off a 4MB one on a slow uplink that was getting there — and
       the retry that followed started from nothing. 30s for the function,
       plus a second for every 50KB of body (about 400kbit/s, a poor
       mobile uplink), never less than the old 90s and never more than five
       minutes. `bytes` is the request body's length; a data: URL's length
       is close enough. Also used by js/console-info.js for the lead form's
       pictures. */
    uploadTimeout(bytes) {
        const n = Math.max(0, Number(bytes) || 0);
        return Math.min(300000, Math.max(this._TIMEOUT_UPLOAD, 30000 + Math.ceil(n / 51200) * 1000));
    },

    _timeoutError() {
        const err = new Error("That took too long to answer. Check your connection and try again.");
        err.timedOut = true;
        return err;
    },

    _timedFetch(url, opts, ms) {
        if (typeof AbortController === "undefined") return fetch(url, opts);
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms || this._TIMEOUT_READ);
        const mapAbort = e => {
            if (e && e.name === "AbortError") throw this._timeoutError();
            throw e;
        };
        /* No answer at all (30 Sept 2026). fetch() rejects with a bare
           TypeError when the request never reached us — offline, DNS, a
           dropped connection — and its words ("Failed to fetch", "Load
           failed", "NetworkError when attempting to fetch resource.") went
           straight onto the contact form. Now the same sentence Add Maze
           Info's postJson (js/console-info.js) says, or its read-shaped
           twin for a GET. err.network marks it; no caller tested for the
           TypeError itself. Only the request is mapped: a body read that
           fails after the headers is left as it was. */
        const mapNetwork = e => {
            if (e && e.name === "TypeError") {
                const method = String((opts && opts.method) || "GET").toUpperCase();
                const err = new Error(method === "GET"
                    ? "That couldn't be reached. Check your connection and try again."
                    : "That didn't send. Check your connection and try again.");
                err.network = true;
                throw err;
            }
            return mapAbort(e);
        };
        return fetch(url, { ...(opts || {}), signal: controller.signal }).then(res => {
            // See INCLUDING A TIMEOUT WHILE THE BODY IS READ, above.
            ["json", "text", "blob", "arrayBuffer"].forEach(name => {
                const read = res[name];
                if (typeof read !== "function") return;
                try { res[name] = () => read.call(res).catch(mapAbort); } catch (e) { /* frozen: left raw */ }
            });
            return res;
        }, mapNetwork);
    },

    /* A body read with a fallback for one that is not JSON (an HTML error
       page from the platform, an empty 204) — but NOT for a timeout, which
       is rethrown rather than dressed up as an empty answer. */
    _body(res, fallback) {
        return res.json().catch(e => {
            if (e && e.timedOut) throw e;
            return fallback;
        });
    },

    async _write(url, method, token, body, ms) {
        const res = await this._timedFetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                "x-admin-token": token
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        }, ms || (method === "GET" ? this._TIMEOUT_READ : this._TIMEOUT_WRITE));
        if (!res.ok) {
            const detail = await this._body(res, {});
            const err = new Error(detail.error || `Request failed: ${res.status}`);
            err.status = res.status;
            // The whole answer, for callers that act on more than the
            // message — e.g. upload's 409 { inUse: true }.
            err.data = detail;
            throw err;
        }
        return res.status === 200 || res.status === 201 ? res.json() : null;
    },

    createRoom(token, room) { return this._write("/.netlify/functions/rooms", "POST", token, room); },
    updateRoom(token, room) { return this._write("/.netlify/functions/rooms", "PUT", token, room); },
    // The "Furni complete" tick on a maze's /warren row (2 Oct 2026).
    setRoomFurniComplete(token, id, complete) { return this._write("/.netlify/functions/rooms?action=furni-complete", "PUT", token, { id, complete: !!complete }); },
    deleteRoom(token, id) { return this._write(`/.netlify/functions/rooms?id=${encodeURIComponent(id)}`, "DELETE", token); },

    createEvent(token, ev) { return this._write("/.netlify/functions/events", "POST", token, ev); },

    /* The saved recolour palettes, for the Controls panel's Palette card
       (28 Sept 2026). The same unfiltered list js/admin-recolour.js reads —
       the plain GET, which is not edge-cached, so a palette saved a moment
       ago is in it. The token only adds who saved each one. */
    async getPalettes(token) {
        const data = await this._write("/.netlify/functions/palettes", "GET", token);
        return (data && Array.isArray(data.palettes)) ? data.palettes : [];
    },

    /* Reads a Habbo Origins article and hands back the parts of it an event
       shows. Nothing is stored by this call: the admin form holds the
       result and it is saved with the event, like every other field. */
    readArticle(token, url) { return this._write("/.netlify/functions/article", "POST", token, { url }); },
    updateEvent(token, ev) { return this._write("/.netlify/functions/events", "PUT", token, ev); },
    deleteEvent(token, id) { return this._write(`/.netlify/functions/events?id=${encodeURIComponent(id)}`, "DELETE", token); },

    /* folder decides both where the image is filed in blob storage and who
       is allowed to put it there — "rooms" (the default, the archive) needs
       a full admin, "wizard" needs only the atlas scope. See
       FOLDER_SCOPES in netlify/functions/upload.js. */
    uploadImage(token, prefix, filename, dataUrl, folder) {
        return this._write("/.netlify/functions/upload", "POST", token, { prefix, filename, dataUrl, folder },
            this.uploadTimeout(String(dataUrl || "").length));
    },
    // Starts the furni scan. A background function, so this returns as soon
    // as Netlify has accepted the job (202) rather than when scanning ends —
    // results land on the records themselves as it works through them.
    // Progress of the running scan, polled while one is going.
    furniScanStatus(token) {
        return this._timedFetch("/.netlify/functions/furni-scan-status", { headers: { "x-admin-token": token } })
            .then(async res => {
                if (!res.ok) {
                    const err = new Error("Couldn't read scan progress");
                    err.status = res.status;
                    throw err;
                }
                return res.json();
            });
    },

    /* Starts a scan on the machine running `netlify dev` — see
       netlify/functions/furni-scan-local.js. Against the deployed site this
       answers 501 with an explanation, because there is no scanner there;
       the caller shows that message rather than treating it as a crash.

       runId is the caller's, not the function's: the admin has to be able to
       tell the run it just started from the one before it, and it can only do
       that if it names the run itself. onlyUnscanned was being dropped here
       entirely, which quietly turned "Scan unscanned only" into a full rescan. */
    scanFurni(token, { collection = "rooms", ids, onlyUnscanned = false, additive = false, runId } = {}) {
        return this._write("/.netlify/functions/furni-scan-local", "POST", token,
            { collection, ids, onlyUnscanned, additive, runId });
    },

    /* The FurniIndex catalogue, for the admin page's "add furni by hand"
       picker. Filtering happens in the function (their API has no search of
       its own), so a query keeps the response small enough to ask for
       sprites with it — the room-scale art the site prefers over the little
       catalogue icon. Without a query that same flag would drag the whole
       ~557KB library down, so don't.

       A search returns EVERY match. It used to keep the first 24, which is
       a number nothing on screen explained: the results pane scrolls, so
       there was no layout reason for it, and a search for "re" found 326
       pieces and showed 24 of them with nothing to say the other 302
       existed. That is the one failure a picker must not have — looking
       like it has answered when it has not.

       The cost is real but bounded and lands on an admin page only. The
       widest two-letter searches measured 85KB to 227KB with sprites
       attached, against 14KB to 22KB capped; the picker will not search
       under two letters, so the whole-library cases ("a", "e", ~815KB)
       cannot be reached from it. The input is debounced at 250ms and the
       function's answer is cached in a blob, so this is one transfer per
       pause in typing, not one per keystroke.

       Pass a positive limit to cap it anyway; the function reads anything
       else as "no limit" (see furni-catalogue.js). */
    async getFurniCatalogue(q, limit = 0) {
        const params = new URLSearchParams({ q: q || "" });
        if (limit > 0) params.set("limit", String(limit));
        if (q) params.set("sprites", "1");
        // Furni FurniIndex hasn't catalogued yet, from Habbo's own names,
        // after the catalogue's matches (1 Oct 2026; see furni-catalogue.js).
        if (q) params.set("unlisted", "1");
        const res = await this._timedFetch("/.netlify/functions/furni-catalogue?" + params);
        const data = await this._body(res, {});
        if (!res.ok) throw new Error(data.error || `Furni catalogue unavailable (${res.status})`);
        return data;
    },

    /* When our copy of FurniIndex's catalogue was fetched, and how big it is
       — one row's worth of the public answer (2 Oct 2026). */
    async getFurniCatalogueInfo() {
        // ?info=1 is never held at the edge (furni-catalogue.js), so this
        // sees a refresh at once; the plain catalogue URL is held an hour.
        const res = await this._timedFetch("/.netlify/functions/furni-catalogue?info=1", { cache: "no-store" });
        const data = await this._body(res, {});
        if (!res.ok) throw new Error(data.error || `Furni catalogue unavailable (${res.status})`);
        return { fetchedAt: data.fetchedAt, count: data.total };
    },
    // Owners only: fetch it from FurniIndex now. Thirteen pages, so a long leash.
    async refreshFurniCatalogue(token) {
        const data = await this._write("/.netlify/functions/furni-catalogue?refresh=1&limit=1", "GET", token, undefined, 60000);
        return { fetchedAt: data && data.fetchedAt, count: data && data.total };
    },

    deleteImage(token, key) {
        return this._write(`/.netlify/functions/upload?key=${encodeURIComponent(key)}`, "DELETE", token);
    },

    async login(username, password) {
        const res = await this._timedFetch("/.netlify/functions/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "login", username, password })
        });
        const data = await this._body(res, {});
        if (!res.ok) {
            const err = new Error(data.error || `Login failed: ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return data; // { token, username }
    },

    async verifySession(token) {
        const res = await this._timedFetch("/.netlify/functions/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-token": token },
            body: JSON.stringify({ action: "verify" })
        });
        /* Only a refusal means signed out. Any failure used to answer null,
           and the admin page read null as "session expired" and wiped the
           stored token — so a database blip (503) or a cold function
           falling over (500) signed the admin out of a session that was
           perfectly good. Everything else throws, like a dropped connection
           already did, and the caller says "try again" with the token kept. */
        if (res.status === 401 || res.status === 403) return null;
        if (!res.ok) {
            const data = await this._body(res, {});
            const err = new Error(data.error || `Couldn't check the session: ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return res.json(); // { username }
    },

    getAdmins(token) { return this._write("/.netlify/functions/auth", "GET", token); },
    createAdmin(token, username, password, role) {
        return this._write("/.netlify/functions/auth", "POST", token, { action: "create", username, password, role });
    },
    /* currentPassword is required by the server when the account being
       changed is the caller's own (see netlify/functions/auth.js): a session
       token left on a shared machine must not be enough to take the account
       over. Sent only when given, so an owner resetting somebody else's
       password carries nothing it does not need. */
    resetAdminPassword(token, username, password, currentPassword) {
        const body = { username, password };
        if (currentPassword !== undefined && currentPassword !== null && currentPassword !== "") {
            body.currentPassword = currentPassword;
        }
        return this._write("/.netlify/functions/auth", "PUT", token, body);
    },
    deleteAdmin(token, username) {
        return this._write(`/.netlify/functions/auth?username=${encodeURIComponent(username)}`, "DELETE", token);
    },

    getTags() {
        return this._getWithFallback("/.netlify/functions/tags", "tag list",
            () => ["FURNI MAZE", "ILLUSION", "FLOATING", "FUNCTIONAL", "LONG-FORM"]);
    },
    createTag(token, label) { return this._write("/.netlify/functions/tags", "POST", token, { label }); },

    /* The landing state, and why its fallback is not "enter".

       Both halves of the gate — this, and home.html's own pre-load check —
       used to fail OPEN. A settings request that merely timed out (6s, which
       a cold function on mobile data reaches easily) produced
       landingState: "enter", and an unreleased site went public until the
       next load. Two independent defences, both failing the same way.

       So a good answer is remembered, and a failure falls back to whatever
       was last seen rather than to a guess. With nothing remembered at all
       the answer is "coming-soon": a visitor who has never once loaded this
       site successfully is exactly the case where being wrong in the open
       direction costs most, and it corrects itself the moment a real
       response arrives.

       The cost of the other direction is small and self-healing — a
       visitor during an outage sees a closed door for one load, and the
       landing page's watcher opens it the moment settings answer again.
       (It used to let anyone who remembered "enter" straight in; it no
       longer does — see unreadableLandingState below.) */
    rememberLandingState(state) {
        try { localStorage.setItem("mazerats_landing_state", state); } catch (e) { /* private mode */ }
    },

    lastKnownLandingState() {
        try { return localStorage.getItem("mazerats_landing_state"); } catch (e) { return null; }
    },

    /* What to believe when settings cannot be read: always a GATED state
       (28 Sept 2026). The last-seen fallback above let a returning visitor
       who remembered "enter" through during an outage — and an outage is
       exactly when the site is likely to be in Maintenance on purpose. So
       the memory now only chooses the wording: anyone who has seen the site
       open or in Maintenance is told Maintenance, anyone else Coming Soon.
       home.html's gate uses the same rule. */
    unreadableLandingState() {
        const last = this.lastKnownLandingState();
        return last === "enter" || last === "maintenance" ? "maintenance" : "coming-soon";
    },

    /* WHICH PALETTE THE SITE IS WEARING.

       Cached in localStorage for the same reason the landing state is: the
       real answer is in the database and arrives after the page has painted,
       so every page's <head> applies the PREVIOUS visit's answer
       synchronously and this corrects it once the settings land. A theme
       change therefore reaches a visitor on their next page load rather than
       repainting the page under them, which is the right moment for a site to
       change colour anyway.

       This is not a per-visitor preference — nobody browsing gets to choose
       it. The cache exists only so there is an answer available before the
       fetch finishes.

       Only "purple" is ever written as an attribute. Classic is the ABSENCE
       of one, so the default costs nothing, cannot be half-applied, and a
       corrupted or unrecognised value falls back to the site as it has always
       looked rather than to something undefined. */
    /* Only ONE theme stylesheet is ever loaded, and it is swapped rather than
       stacked. There are four alternatives now and each is about 9KB gzipped;
       linking them all would cost every visitor four palettes they are not
       looking at, to save a request the one who IS gets anyway.

       The name is sanitised before it reaches a URL. It arrives from the
       settings endpoint, which only ever answers with a name from its own
       VALID_THEMES — but it also arrives from localStorage, which is the
       visitor's to edit, and it is about to be interpolated into a path. */
    applyTheme(theme) {
        const name = /^[a-z]+$/.test(String(theme || "")) ? theme : "classic";
        try { localStorage.setItem("mazerats_theme", name); } catch (e) { /* private mode */ }

        const root = document.documentElement;
        if (name === "classic") root.removeAttribute("data-theme");
        else root.setAttribute("data-theme", name);

        // Classic is the absence of a theme sheet, so switching back to it
        // takes the link away rather than pointing it at an empty file.
        let link = document.getElementById("theme-css");
        if (name === "classic") { if (link) link.remove(); return; }
        if (!link) {
            link = document.createElement("link");
            link.id = "theme-css";
            link.rel = "stylesheet";
            document.head.appendChild(link);
        }
        // Absolute, because 404.html is served at whatever depth the wrong
        // address was (/maze/a/b), where a relative path points somewhere that
        // is itself a 404.
        const href = "/css/theme-" + name + ".css";
        // Compared before assigning: setting href to what it already is makes
        // the browser re-fetch and re-apply, which flashes. Compared as
        // resolved URLs, not attribute text: the inline loader in each page's
        // <head> may have written "css/theme-x.css" and this "/css/theme-x.css",
        // which are the same file and must not count as a change.
        const current = link.getAttribute("href") ? link.href.split("?")[0] : "";
        if (current !== new URL(href, location.href).href) {
            link.href = href;
        }
    },

    /* ---------- ONE SETTINGS REQUEST PER PAGE ----------

       This endpoint answers with under a kilobyte and it was being asked
       three times on every page load, by callers that had no idea the
       others existed: the gate script in home.html's <head>, this method
       (for js/site.js and js/welcome.js, among others), and
       js/palette-wear.js with a raw fetch of its own. Fallin' Furni managed
       four. Three cold-startable function calls, in parallel, for one
       answer that cannot have changed between them.

       Two things fix it, and both are needed because the first caller runs
       before this file exists.

       1. `_settingsPromise` memoises the IN-FLIGHT promise, not the result.
          Memoising the result would still let a burst of callers on one
          page each fire their own request before the first came back, which
          is exactly the shape of the problem — every one of them runs
          during the same tick of page setup.

       2. `window.__mrSettings` is the handshake with the inline gate. That
          script has to run first, before any <script src> has loaded, so it
          cannot use this. It publishes its own promise on the window
          instead, and this adopts it. So the gate's request IS the page's
          request, and Fallin' Furni keeps its own boot sequence exactly as
          it was — its loading bar still starts on a request fired from the
          <head>, nothing waits on this file to load first.

       DELIBERATELY NOT CACHED ACROSS PAGES, in localStorage or anywhere
       else. The landing state is the gate; a stale cached "enter" would
       hold a gated site open for the length of the cache. Per page load is
       the right lifetime: everything that asks during one load is asking
       about the same moment.

       An adopted promise is normalised through the same handling below —
       the gate's raw fetch resolves to the parsed body and knows nothing
       about remembering the state or applying the theme. */
    _settingsPromise: null,

    async getSiteSettings() {
        if (this._settingsPromise) return this._settingsPromise;

        const shared = typeof window !== "undefined" && window.__mrSettings;
        const fetched = shared
            // The gate's own request. `.catch` and not a bare adopt: if that
            // one failed, this must still fall back the way it always did
            // rather than rejecting into every caller on the page.
            ? Promise.resolve(shared).catch(() => null).then(v => (v && v.landingState) ? v :
                ({ landingState: this.unreadableLandingState(), fromCache: true }))
            // Bucketed as home.html's gate asks (3 Oct 2026): see getSettings there.
            : this._getWithFallback("/.netlify/functions/settings?fresh=" + Math.floor(Date.now() / 10000), "site settings",
                () => ({ landingState: this.unreadableLandingState(), fromCache: true }));

        this._settingsPromise = fetched.then(settings => {
            if (!settings.fromCache && settings.landingState) this.rememberLandingState(settings.landingState);
            // Only from a real answer: the fallback object has no theme in it, and
            // treating "absent" as classic would flip a purple site back to brown
            // every time the archive was briefly unreachable.
            if (!settings.fromCache && settings.theme) this.applyTheme(settings.theme);
            return settings;
        });

        return this._settingsPromise;
    },

    /* Throws the shared answer away, so the next read goes to the network.

       For the admin panel, which is the one page that CHANGES these
       settings and then immediately wants to see what it changed. Every
       other page reads once and is done. Called by updateSiteSettings
       below, rather than left to each caller to remember. */
    forgetSiteSettings() {
        this._settingsPromise = null;
        if (typeof window !== "undefined") window.__mrSettings = null;
    },
    // updates is a partial object — { landingState }, { launchAt } and so on
    // — the function only touches whichever fields are actually present.
    //
    // Drops the shared answer on the way out: whatever this just changed,
    // the copy held by getSiteSettings above is now the old one, and the
    // admin panel reads it back immediately after writing.
    updateSiteSettings(token, updates) {
        const done = this._write("/.netlify/functions/settings", "PUT", token, updates);
        this.forgetSiteSettings();
        return done;
    },

    /* The public list is held at the edge for a minute (2 Oct 2026; see
       netlify/functions/contributors.js). The Warren edits it, and reads it
       back straight after a save, so there it asks with ?full=1, which is
       never cached — the same split rooms and events make. */
    getContributors() {
        let warren = false;
        try { warren = /^\/warren(\.html)?\/?$/.test(location.pathname); } catch (e) { /* not a page */ }
        /* With the admin token (3 Oct 2026): contributors.js now gives the
           full list only to a signed-in account, and sends anybody else to
           the public one. AdminToken is js/admin.js's. */
        const token = warren && typeof window.AdminToken === "function" ? window.AdminToken() : "";
        return this._getWithFallback("/.netlify/functions/contributors" + (warren ? "?full=1" : ""), "contributor data", () => [],
            token ? { "x-admin-token": token } : null);
    },
    createContributor(token, contributor) { return this._write("/.netlify/functions/contributors", "POST", token, contributor); },
    updateContributor(token, contributor) { return this._write("/.netlify/functions/contributors", "PUT", token, contributor); },
    deleteContributor(token, id) { return this._write(`/.netlify/functions/contributors?id=${encodeURIComponent(id)}`, "DELETE", token); },

    // Public — no admin token, since real visitors submit this straight
    // from the console modal's Contact Us page.
    async submitContactMessage(message, username, discord, website) {
        const res = await this._timedFetch("/.netlify/functions/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Stated rather than left to the default, because it matters
            // here: the session cookie is what lets the function record a
            // signed-in sender as verified rather than as a typed claim.
            credentials: "same-origin",
            body: JSON.stringify({ message, username, discord, website })
        }, this._TIMEOUT_WRITE);
        const data = await this._body(res, {});
        if (!res.ok) {
            const err = new Error(data.error || `Request failed: ${res.status}`);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    },

    /* ---------- Event Submission (30 Sept 2026) ----------

       See netlify/functions/event-entries.js. The public half is the
       console's (js/console.js): which event an entry made now would go to,
       { id, title } or null, and the entry itself — the visitor's session
       cookie rides along, never an admin token. The rest is the Warren's
       Event Entries panel (js/admin-entries.js). */
    async getEventEntryOpen() {
        const res = await this._timedFetch("/.netlify/functions/event-entries?action=open", {
            headers: { Accept: "application/json" },
            credentials: "same-origin"
        }, this._TIMEOUT_READ);
        const data = await this._body(res, {});
        if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
        return data && data.event && typeof data.event === "object" ? data.event : null;
    },
    // { habboName, dataUrl, website, clientRef }. Rejects with .status and
    // .data, like submitContactMessage, so a ban can be shown as one.
    async submitEventEntry(body) {
        const payload = JSON.stringify(body || {});
        const res = await this._timedFetch("/.netlify/functions/event-entries", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            credentials: "same-origin",
            body: payload
        }, this.uploadTimeout(payload.length));
        const data = await this._body(res, {});
        if (!res.ok) {
            const err = new Error(data.error || (res.status === 413
                ? "That picture is too big. Keep it under 4MB."
                : "That didn't send. Try again in a minute."));
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    },
    // params: { status, event, page }, each optional.
    getEventEntries(token, params) {
        const q = new URLSearchParams();
        Object.keys(params || {}).forEach(k => {
            const v = params[k];
            if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
        });
        const qs = q.toString();
        return this._write("/.netlify/functions/event-entries" + (qs ? "?" + qs : ""), "GET", token);
    },
    // { status?, note? } for one entry.
    updateEventEntry(token, id, body) {
        return this._write(`/.netlify/functions/event-entries?id=${encodeURIComponent(id)}`, "PUT", token, body);
    },
    deleteEventEntry(token, id) {
        return this._write(`/.netlify/functions/event-entries?id=${encodeURIComponent(id)}`, "DELETE", token);
    },
    // { mode: "auto" | "none" | "event" | "closed", eventId } — which event
    // entries go to, or none taken at all.
    setEventEntryOpen(token, body) {
        return this._write("/.netlify/functions/event-entries?action=open", "PUT", token, body);
    },

    /* ---------- the player's nickname (28 Sept 2026) ----------

       See netlify/functions/player-nick.js. The player's own session
       cookie, never an admin token, so not through _write. Both resolve to
       the player as `me` gives it — { id, name, nick, displayName,
       nickAsked, ... } — and the answer re-issues the session cookie, so
       the caller should put it straight into Account.current. Both reject
       with an Error carrying .status and .data (the whole answer): 400 has
       data.field "nick" and a reason fit to show, 409 is "taken", 403 with
       data.locked the admins have locked it (29 Sept 2026), 429 the day's
       changes used up, 401 signed out. setNickname("") or (null) clears
       it.

       FLAGGED (29 Sept 2026). A name the word filter caught is still saved,
       and the answer carries `flagged: { reason, word }` beside the player.
       It is hung on the returned player as a NON-enumerable `flagged`, so
       a caller can read it (js/account.js shows "Nickname Saved") while
       the Object.assign that folds the player into Account.current never
       copies it: it describes this save, not the player.

       refuseNickname() answers the forced "Pick a new nickname" window's
       Refuse: the server marks nickRefused and the window stops opening,
       while the games stay locked until a new name is chosen. */
    async _nick(body) {
        const res = await this._timedFetch("/.netlify/functions/player-nick", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(body)
        }, this._TIMEOUT_WRITE);
        const data = await this._body(res, {});
        if (!res.ok || !data || !data.player) {
            const err = new Error((data && data.error) || `Request failed: ${res.status}`);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        const player = Object.assign({}, data.player);
        if (data.flagged && typeof data.flagged === "object") {
            Object.defineProperty(player, "flagged", { value: data.flagged, enumerable: false });
        }
        return player;
    },
    setNickname(nick) { return this._nick({ nick: nick == null ? null : String(nick) }); },
    markNickAsked() { return this._nick({ asked: true }); },
    refuseNickname() { return this._nick({ refuse: true }); },

    getContactMessages(token) { return this._write("/.netlify/functions/contact", "GET", token); },
    deleteContactMessage(token, id) { return this._write(`/.netlify/functions/contact?id=${encodeURIComponent(id)}`, "DELETE", token); },

    // Admin-only in both directions — there is no public half here, so
    // these all go through _write (which carries the token) rather than
    // _getWithFallback. See netlify/functions/bans.js.
    /* The admin activity log. Owner-only server-side, so a standard admin
       calling this gets a 403 rather than anything to render. */
    getAdminActivity(token, range) {
        const q = range ? "?range=" + encodeURIComponent(range) : "";
        return this._write("/.netlify/functions/admin-activity" + q, "GET", token);
    },

    /* Fallin' Furni's run log. Any admin can read this one, where the
       activity log is owner-only: that file is a record of what ADMINS did
       and this is a record of how the game is playing. */
    getFallinFurniRuns(token, range) {
        const q = range ? "?range=" + encodeURIComponent(range) : "";
        return this._write("/.netlify/functions/ff-runs" + q, "GET", token);
    },

    /* The errors visitors hit, grouped (28 Sept 2026). Any admin role reads;
       an owner or admin triages; only an owner deletes. The whole contract
       is at the top of netlify/functions/site-errors.js.

       params for the list: { status, kind, q, sort, limit }, each optional;
       empty values are left off rather than sent as "". */
    getSiteErrors(token, params) {
        const q = new URLSearchParams();
        Object.keys(params || {}).forEach(k => {
            const v = params[k];
            if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
        });
        const qs = q.toString();
        return this._write("/.netlify/functions/site-errors" + (qs ? "?" + qs : ""), "GET", token);
    },
    // One group in full, samples and every breakdown included.
    getSiteError(token, id) {
        return this._write(`/.netlify/functions/site-errors?id=${encodeURIComponent(id)}`, "GET", token);
    },
    // { id, status?, note? } for one, or { ids: [...], status } for several.
    updateSiteError(token, body) {
        return this._write("/.netlify/functions/site-errors", "PUT", token, body);
    },
    // { id } for one group, or { status: "resolved" } to clear every resolved one.
    deleteSiteErrors(token, params) {
        const p = params || {};
        const q = p.id ? "id=" + encodeURIComponent(p.id) : "status=" + encodeURIComponent(p.status || "");
        return this._write("/.netlify/functions/site-errors?" + q, "DELETE", token);
    },

    /* ---------- the atlas at /wizard ----------

       One request for the whole map — background, artwork, room names and
       footprint trails — because the page cannot draw any of it correctly
       without all of it. See netlify/functions/wizard.js.

       No bundled fallback, unlike the archive's own GETs: there is nothing
       to fall back TO. A map with no rooms is not a degraded map, it is a
       blank sheet, and js/wizard.js says so on the page rather than
       pretending it drew something. */
    async getWizardMap() {
        const res = await this._timedFetch("/.netlify/functions/wizard");
        if (!res.ok) throw new Error(`Map unavailable (${res.status})`);
        return res.json();
    },

    /* Typing a code into the map, from a visitor who is nobody.

       A plain fetch rather than _write: there is no token, because the whole
       point is that anybody may try. The endpoint answers { ok: false } for a
       wrong code and 429 when somebody is guessing faster than a person can
       type — both are ordinary answers here, so neither throws; only a
       genuine failure to reach the endpoint does. */
    async unlockWizardSecret(codes) {
        const many = Array.isArray(codes);
        const res = await this._timedFetch("/.netlify/functions/wizard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(many
                ? { action: "unlock", codes }
                : { action: "unlock", code: codes })
        });
        if (res.status === 429) return { ok: false, found: [], tooMany: true };
        if (!res.ok) throw new Error(`Unlock failed (${res.status})`);
        return res.json();
    },

    // The editor's own read: uncached, so a save is read back as written.
    getWizardMapFresh(token) { return this._write("/.netlify/functions/wizard?fresh=1", "GET", token); },

    createWizardItem(token, kind, item) {
        return this._write("/.netlify/functions/wizard", "POST", token, { ...item, kind });
    },
    updateWizardItem(token, kind, item) {
        return this._write("/.netlify/functions/wizard", "PUT", token, { ...item, kind });
    },
    deleteWizardItem(token, kind, id) {
        return this._write(`/.netlify/functions/wizard?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, "DELETE", token);
    },
    /* Everything the last drag session moved, in one request. A pass over
       the map nudges a dozen names and reshapes the trails between them —
       that is one action to the person doing it, and there is no reason for
       it to be twenty-five round trips. Positions only; the endpoint
       refuses anything else in a bulk write. */
    saveWizardPositions(token, items) {
        return this._write("/.netlify/functions/wizard", "PUT", token, { action: "bulk", items });
    },

    /* ---------- the daily games, from the admin's side ----------

       One call answers both halves of the panel: the list of players the
       games have seen, and — when a player is named — where that one stands
       in each game. Two endpoints would mean two round trips to draw one
       screen, and the list is small enough that the saving is imaginary. */
    getDailyPlayers(token, q, playerId) {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (playerId) params.set("playerId", playerId);
        const tail = params.toString();
        return this._write("/.netlify/functions/daily-games" + (tail ? "?" + tail : ""), "GET", token);
    },

    /* Gives one player one game's day back. The scored row for today goes
       (where the game has one), and a ticket is left for the game to collect
       from the player's own browser the next time they open it — which is
       the only way to reach a day that lives in localStorage. */
    resetDailyGame(token, playerId, game) {
        return this._write("/.netlify/functions/daily-games", "POST", token, { playerId, game });
    },

    cancelDailyReset(token, playerId, game) {
        return this._write("/.netlify/functions/daily-games", "POST", token, { playerId, game, action: "cancel" });
    },

    /* ---------- forgetting a player (28 Sept 2026) ----------

       Owner only; see netlify/functions/player-forget.js. The preview is a
       dry run by Discord id, name or @username, answering
       { player, matches, counts } — `matches` when a name fits several, in
       which case the owner picks one and previews again by its id. The
       forget itself only ever takes an id, and says `confirm: true` in so
       many words, so it cannot be sent by accident from anything that
       happens to post an id. Both reject like every other admin call here:
       err.status 404 for nobody by that id or name, 403 for an account that
       is not the owner. */
    forgetPlayerPreview(token, q) {
        return this._write(`/.netlify/functions/player-forget?q=${encodeURIComponent(q || "")}`, "GET", token);
    },

    forgetPlayer(token, id) {
        return this._write("/.netlify/functions/player-forget", "POST", token, { id, confirm: true });
    },

    /* ---------- the Players panel (29 Sept 2026) ----------

       Everybody who has signed in, and their nicknames; see
       netlify/functions/players-admin.js for the whole contract. Owners,
       admins and view-only accounts read (a viewer gets a stand-in `ref`
       for each player in place of the Discord id, and asks for the detail
       by that); owners and admins write.

       params for the list: { q, filter, sort, limit, skip }, each optional;
       empty values are left off. updatePlayer's body is
       { id, nick?, locked?, resetPrompt? } — nick "" or null clears it.
       Or, on its own, { id, review: "allow" | "reject", seen? } — the word
       filter's review (29 Sept 2026); `seen` is the nickname the admin was
       looking at, and a 409 means the player has renamed since. Or, on its
       own, { id, unTurnDown: "<name key>" } (30 Sept 2026), which takes one
       name off their turned-down list as the detail's nickTurnedDown has it. */
    getPlayers(token, params) {
        const q = new URLSearchParams();
        Object.keys(params || {}).forEach(k => {
            const v = params[k];
            if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
        });
        const qs = q.toString();
        return this._write("/.netlify/functions/players-admin" + (qs ? "?" + qs : ""), "GET", token);
    },
    getPlayer(token, id) {
        return this._write(`/.netlify/functions/players-admin?id=${encodeURIComponent(id)}`, "GET", token);
    },
    updatePlayer(token, body) {
        return this._write("/.netlify/functions/players-admin", "PUT", token, body);
    },

    getBans(token) { return this._write("/.netlify/functions/bans", "GET", token); },
    /* Two shapes (29 Sept 2026). The old one, createBan(token, ip, reason),
       is what the Messages and Missing Pieces "Ban" buttons send: a soft,
       permanent ban on that address's network. The new one,
       createBan(token, { kind, value?, playerId?, level, duration?, until?,
       reason? }), is the Bans panel's and the Players panel's — see the
       header of netlify/functions/bans.js for every field. Told apart by
       whether the second argument is an object. */
    createBan(token, ipOrBody, reason) {
        const body = ipOrBody && typeof ipOrBody === "object" ? ipOrBody : { ip: ipOrBody, reason };
        return this._write("/.netlify/functions/bans", "POST", token, body);
    },
    // { id, level?, until? (ISO, or null for permanent), duration?, reason? }
    updateBan(token, body) { return this._write("/.netlify/functions/bans", "PUT", token, body); },
    deleteBan(token, id) { return this._write(`/.netlify/functions/bans?id=${encodeURIComponent(id)}`, "DELETE", token); },
    // The same as deleteBan, under the name the moderation panels use.
    liftBan(token, id) { return this.deleteBan(token, id); },
    // Unban straight from a contact message, where the ban's own id
    // isn't to hand but the address is.
    deleteBanByIp(token, ip) { return this._write(`/.netlify/functions/bans?ip=${encodeURIComponent(ip)}`, "DELETE", token); },

    // Public. Not routed through _getWithFallback: there is no bundled
    // fallback for a live third-party lookup, and every caller already
    // treats "no profile" as the normal case (the maze modal just shows
    // the plain username), so a null here is an answer rather than a
    // failure worth warning about. 404 is expected and common — a builder
    // whose name is not on Origins, or is not in the archive at all.
    async getHabboProfile(name) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`/.netlify/functions/habbo?name=${encodeURIComponent(name)}`, { signal: controller.signal });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;
        } finally {
            clearTimeout(timeout);
        }
    }
};

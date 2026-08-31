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

    /* Two attempts before giving up. The first keeps its short leash so a
       genuinely dead endpoint can't hold the page; the second is generous,
       because by far the likeliest cause is a cold function on a slow
       connection rather than an outage, and one 6s window was easy to miss
       by a fraction. */
    async _getWithFallback(url, label, fallbackFn) {
        const attempts = [6000, 12000];
        for (let i = 0; i < attempts.length; i++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), attempts[i]);
            try {
                const res = await fetch(url, { signal: controller.signal });
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
        const table = payload.f.map(t => ({
            name: t.n || "",
            className: t.c || "",
            motto: t.m || "",
            icon: prefix + (t.i || ""),
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
                        return { ...base, sprite: sprite ? prefix + sprite : base.icon };
                    }).filter(Boolean)
                };
            }
            return { ...record, furni };
        });
    },

    async getRooms() {
        return this._unpack(await this._getWithFallback("/.netlify/functions/rooms", "room data",
            () => typeof DEFAULT_ROOMS !== "undefined" ? DEFAULT_ROOMS : []));
    },

    async getEvents() {
        return this._unpack(await this._getWithFallback("/.netlify/functions/events", "event data",
            () => typeof DEFAULT_EVENTS !== "undefined" ? DEFAULT_EVENTS : []));
    },

    /* The admin page's own read: the records exactly as stored, with the
       reviewer fields and hidden detections the packed public form drops.
       Uncached, so a save is always read back in full. */
    getRoomsFull(token) { return this._write("/.netlify/functions/rooms?full=1", "GET", token); },
    getEventsFull(token) { return this._write("/.netlify/functions/events?full=1", "GET", token); },

    async _write(url, method, token, body) {
        const res = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                "x-admin-token": token
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            const err = new Error(detail.error || `Request failed: ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return res.status === 200 || res.status === 201 ? res.json() : null;
    },

    createRoom(token, room) { return this._write("/.netlify/functions/rooms", "POST", token, room); },
    updateRoom(token, room) { return this._write("/.netlify/functions/rooms", "PUT", token, room); },
    deleteRoom(token, id) { return this._write(`/.netlify/functions/rooms?id=${encodeURIComponent(id)}`, "DELETE", token); },

    createEvent(token, ev) { return this._write("/.netlify/functions/events", "POST", token, ev); },
    updateEvent(token, ev) { return this._write("/.netlify/functions/events", "PUT", token, ev); },
    deleteEvent(token, id) { return this._write(`/.netlify/functions/events?id=${encodeURIComponent(id)}`, "DELETE", token); },

    uploadImage(token, prefix, filename, dataUrl) {
        return this._write("/.netlify/functions/upload", "POST", token, { prefix, filename, dataUrl });
    },
    // Starts the furni scan. A background function, so this returns as soon
    // as Netlify has accepted the job (202) rather than when scanning ends —
    // results land on the records themselves as it works through them.
    // Progress of the running scan, polled while one is going.
    furniScanStatus(token) {
        return fetch("/.netlify/functions/furni-scan-status", { headers: { "x-admin-token": token } })
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
    scanFurni(token, { collection = "rooms", ids, onlyUnscanned = false, runId } = {}) {
        return this._write("/.netlify/functions/furni-scan-local", "POST", token,
            { collection, ids, onlyUnscanned, runId });
    },

    /* The FurniIndex catalogue, for the admin page's "add furni by hand"
       picker. Filtering happens in the function (their API has no search of
       its own), so a query keeps the response small enough to ask for
       sprites with it — the room-scale art the site prefers over the little
       catalogue icon. Without a query that same flag would drag the whole
       ~557KB library down, so don't. */
    async getFurniCatalogue(q, limit = 24) {
        const params = new URLSearchParams({ q: q || "", limit: String(limit) });
        if (q) params.set("sprites", "1");
        const res = await fetch("/.netlify/functions/furni-catalogue?" + params);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Furni catalogue unavailable (${res.status})`);
        return data;
    },

    deleteImage(token, key) {
        return this._write(`/.netlify/functions/upload?key=${encodeURIComponent(key)}`, "DELETE", token);
    },

    async login(username, password) {
        const res = await fetch("/.netlify/functions/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "login", username, password })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || `Login failed: ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return data; // { token, username }
    },

    async verifySession(token) {
        const res = await fetch("/.netlify/functions/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-token": token },
            body: JSON.stringify({ action: "verify" })
        });
        if (!res.ok) return null;
        return res.json(); // { username }
    },

    getAdmins(token) { return this._write("/.netlify/functions/auth", "GET", token); },
    createAdmin(token, username, password, role) {
        return this._write("/.netlify/functions/auth", "POST", token, { action: "create", username, password, role });
    },
    resetAdminPassword(token, username, password) {
        return this._write("/.netlify/functions/auth", "PUT", token, { username, password });
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
       first-time visitor during an outage sees Coming Soon for one load.
       Anyone who has been here before while it was live remembers "enter"
       and is unaffected. */
    rememberLandingState(state) {
        try { localStorage.setItem("mazerats_landing_state", state); } catch (e) { /* private mode */ }
    },

    lastKnownLandingState() {
        try { return localStorage.getItem("mazerats_landing_state"); } catch (e) { return null; }
    },

    // The welcome button ships disabled and only this call can enable it —
    // relies on _getWithFallback's timeout so a hung (not just failing)
    // request can't leave visitors stuck on the disabled button forever.
    async getSiteSettings() {
        const settings = await this._getWithFallback("/.netlify/functions/settings", "site settings",
            () => ({ landingState: this.lastKnownLandingState() || "coming-soon", aboutText: "", fromCache: true }));
        if (!settings.fromCache && settings.landingState) this.rememberLandingState(settings.landingState);
        return settings;
    },
    // updates is a partial object — { landingState } and/or { aboutText } —
    // the function only touches whichever fields are actually present.
    updateSiteSettings(token, updates) {
        return this._write("/.netlify/functions/settings", "PUT", token, updates);
    },

    getContributors() {
        return this._getWithFallback("/.netlify/functions/contributors", "contributor data", () => []);
    },
    createContributor(token, contributor) { return this._write("/.netlify/functions/contributors", "POST", token, contributor); },
    updateContributor(token, contributor) { return this._write("/.netlify/functions/contributors", "PUT", token, contributor); },
    deleteContributor(token, id) { return this._write(`/.netlify/functions/contributors?id=${encodeURIComponent(id)}`, "DELETE", token); },

    // Public — no admin token, since real visitors submit this straight
    // from the console modal's Contact Us page.
    async submitContactMessage(message, username, discord, website) {
        const res = await fetch("/.netlify/functions/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, username, discord, website })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || `Request failed: ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return data;
    },
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

    getBans(token) { return this._write("/.netlify/functions/bans", "GET", token); },
    createBan(token, ip, reason) { return this._write("/.netlify/functions/bans", "POST", token, { ip, reason }); },
    deleteBan(token, id) { return this._write(`/.netlify/functions/bans?id=${encodeURIComponent(id)}`, "DELETE", token); },
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

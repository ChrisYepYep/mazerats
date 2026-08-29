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
    async _getWithFallback(url, label, fallbackFn) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`${label} fetch failed: ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn(`Live ${label} unavailable, using fallback.`, e);
            return fallbackFn();
        } finally {
            clearTimeout(timeout);
        }
    },

    getRooms() {
        return this._getWithFallback("/.netlify/functions/rooms", "room data",
            () => typeof DEFAULT_ROOMS !== "undefined" ? DEFAULT_ROOMS : []);
    },

    getEvents() {
        return this._getWithFallback("/.netlify/functions/events", "event data",
            () => typeof DEFAULT_EVENTS !== "undefined" ? DEFAULT_EVENTS : []);
    },

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

    // runId is the caller's, not the function's: the admin has to be able to
    // tell the run it just started from the one before it, and it can only do
    // that if it names the run itself. onlyUnscanned was being dropped here
    // entirely, which quietly turned "Scan unscanned only" into a full rescan.
    scanFurni(token, { collection = "rooms", ids, images, onlyUnscanned = false, runId } = {}) {
        return this._write("/.netlify/functions/furni-scan-background", "POST", token,
            { collection, ids, images, onlyUnscanned, runId });
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

    // The welcome button ships disabled and only this call can enable it —
    // relies on _getWithFallback's timeout so a hung (not just failing)
    // request can't leave visitors stuck on the disabled button forever.
    getSiteSettings() {
        return this._getWithFallback("/.netlify/functions/settings", "site settings",
            () => ({ landingState: "enter", aboutText: "" }));
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

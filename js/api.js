/* Talks to the Netlify Functions backed by MongoDB (see netlify/functions/).
   GETs are public. Writes need a session token from logging in with a
   username/password on the admin page — see js/admin.js and
   netlify/functions/auth.js. */
const Api = {
    async getRooms() {
        try {
            const res = await fetch("/.netlify/functions/rooms");
            if (!res.ok) throw new Error(`rooms fetch failed: ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn("Live room data unavailable, using built-in fallback.", e);
            return typeof DEFAULT_ROOMS !== "undefined" ? DEFAULT_ROOMS : [];
        }
    },

    async getEvents() {
        try {
            const res = await fetch("/.netlify/functions/events");
            if (!res.ok) throw new Error(`events fetch failed: ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn("Live event data unavailable, using built-in fallback.", e);
            return typeof DEFAULT_EVENTS !== "undefined" ? DEFAULT_EVENTS : [];
        }
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
    createAdmin(token, username, password) {
        return this._write("/.netlify/functions/auth", "POST", token, { action: "create", username, password });
    },
    resetAdminPassword(token, username, password) {
        return this._write("/.netlify/functions/auth", "PUT", token, { username, password });
    },
    deleteAdmin(token, username) {
        return this._write(`/.netlify/functions/auth?username=${encodeURIComponent(username)}`, "DELETE", token);
    },

    async getTags() {
        try {
            const res = await fetch("/.netlify/functions/tags");
            if (!res.ok) throw new Error(`tags fetch failed: ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn("Live tag list unavailable, using built-in fallback.", e);
            return ["FURNI MAZE", "ILLUSION", "FLOATING", "FUNCTIONAL", "LONG-FORM"];
        }
    },
    createTag(token, label) { return this._write("/.netlify/functions/tags", "POST", token, { label }); }
};

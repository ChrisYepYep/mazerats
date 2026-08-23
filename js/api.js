/* Talks to the Netlify Functions backed by MongoDB (see netlify/functions/).
   GETs are public. Writes need an admin token, checked server-side against
   the ADMIN_PASSWORD environment variable — see js/admin.js for the login
   prompt that collects it. */
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
    }
};

/* ===========================================================
   Maze Rats — admin storage helper

   This is a static, no-backend site, so there is nowhere for the admin
   page to actually save data to. "Saving" a room or event writes it to
   this browser's localStorage only:
     - it previews live on THIS device (rooms-data.js / events-data.js
       both check for a stored override and use it in place of the
       hardcoded defaults if present)
     - it is NOT published — other visitors still see the defaults baked
       into the site's files
   To make admin changes permanent, use the Export panel in admin.html:
   it prints the current data as ready-to-paste JS, which then needs to
   be committed into js/rooms-data.js / js/events-data.js by hand.
   =========================================================== */

const AdminStore = {
    ROOMS_KEY: "mazerats_admin_rooms",
    EVENTS_KEY: "mazerats_admin_events",

    getRooms(fallback) { return this._get(this.ROOMS_KEY, fallback); },
    setRooms(rooms) { localStorage.setItem(this.ROOMS_KEY, JSON.stringify(rooms)); },
    clearRooms() { localStorage.removeItem(this.ROOMS_KEY); },
    hasRoomOverrides() { return localStorage.getItem(this.ROOMS_KEY) !== null; },

    getEvents(fallback) { return this._get(this.EVENTS_KEY, fallback); },
    setEvents(events) { localStorage.setItem(this.EVENTS_KEY, JSON.stringify(events)); },
    clearEvents() { localStorage.removeItem(this.EVENTS_KEY); },
    hasEventOverrides() { return localStorage.getItem(this.EVENTS_KEY) !== null; },

    _get(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch (e) {
            return fallback;
        }
    }
};

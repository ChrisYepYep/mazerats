/* ===========================================================
   Maze Rats — events data
   Add a new event by adding an object to the EVENTS array below.

   Fields:
     id          unique slug, lowercase-with-dashes
     title       event name
     host        Habbo username of the event host/organiser
     status      "upcoming" | "past"
     date        event date, "YYYY-MM-DD" (or a date range as free text)
     hotel       which Habbo hotel this event is/was on
     tags        array of short tags, e.g. ["speedrun","seasonal"]
     thumb       path to an image, or "" to use the default maze texture
     description short description shown on the card
     details     longer writeup shown in the modal (optional, falls back to description)
     habboLink   navigator/room link if still joinable, or "" if unavailable
   =========================================================== */

const EVENTS = [];

// Admin-panel overrides live in this browser's localStorage only — see
// js/admin-store.js for what that does and doesn't mean.
if (typeof AdminStore !== "undefined") {
    const storedEvents = AdminStore.getEvents(null);
    if (storedEvents) { EVENTS.length = 0; EVENTS.push(...storedEvents); }
}

/* ===========================================================
   Maze Rats — fallback event data

   The site normally reads live event data from MongoDB via
   /.netlify/functions/events (see js/api.js) — use the Admin page to add
   or edit events there instead of editing this file.

   DEFAULT_EVENTS below is only a fallback, used if that API call fails,
   so the site still shows something instead of going blank.

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

const DEFAULT_EVENTS = [];

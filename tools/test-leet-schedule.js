/* The Leet Show's schedule from Twitch's public calendar (netlify/functions/leet-schedule.js): node tools/test-leet-schedule.js
   Checks the calendar reading on fixed text (weekly rule across a clock change, a cancelled week, a moved week), then asks the real
   function once against Twitch (GETs only). */
"use strict";
const assert = require("assert"), path = require("path");
const fn = require(path.join(__dirname, "../netlify/functions/leet-schedule.js"));
const CAL = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:a", "DTSTART;TZID=/Pacific/Auckland:20260508T210000", "DTEND;TZID=/Pacific/Auckland:20260509T000000", "SUMMARY:Blue ", " Prince", "RRULE:FREQ=WEEKLY;BYDAY=FR",
    "EXDATE;TZID=/Pacific/Auckland:20261113T210000", "END:VEVENT", "BEGIN:VEVENT", "UID:a", "RECURRENCE-ID;TZID=/Pacific/Auckland:20261120T210000", "DTSTART;TZID=/Pacific/Auckland:20261121T190000", "DTEND;TZID=/Pacific/Auckland:20261121T220000", "SUMMARY:Moved", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
const now = Date.parse("2026-11-09T00:00:00Z"), t = fn.schedule(CAL, now);
/* Friday 13 Nov taken out; 20 Nov moved to Saturday 21 Nov 19:00 NZDT (06:00Z); 27 Nov at 21:00 NZDT is 08:00Z */
assert.ok(!t.some(x => x.start.startsWith("2026-11-13")), "the taken-out week");
assert.strictEqual(t[0].start, "2026-11-21T06:00:00.000Z"); assert.strictEqual(t[0].title, "Moved");
assert.strictEqual(t[1].start, "2026-11-27T08:00:00.000Z"); assert.strictEqual(t[1].title, "Blue Prince");
/* NZ clocks went forward 27 Sep 2026: before it, 21:00 was 09:00Z */
const sep = fn.schedule(CAL, Date.parse("2026-09-20T00:00:00Z")); assert.strictEqual(sep[0].start, "2026-09-25T09:00:00.000Z"); assert.strictEqual(sep[1].start, "2026-10-02T08:00:00.000Z");
console.log("calendar: all good");
(async () => {
    const r = await fn.handler({ httpMethod: "GET", headers: {}, queryStringParameters: {}, path: "/.netlify/functions/leet-schedule" });
    const j = JSON.parse(r.body); console.log("live answer:", r.statusCode, JSON.stringify(j).slice(0, 300));
})().catch(e => { console.error(e); process.exit(1); });

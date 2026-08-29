/* ===========================================================
   Maze Rats — event status

   One place that answers "what state is this event in?", shared by the
   public listings (js/home.js), the header's event ticker (js/site.js) and
   the admin form's read-only status display (js/admin.js). Those three
   decided it separately before, and had already drifted — the ticker was
   still reading the stored field while the listings derived it.

   Status comes from the event's own start/end dates, not the stored field:

       start and end both more than ARCHIVE_YEARS old  -> archive
       end in the past                                 -> past
       started but not yet ended                       -> live
       start still in the future                       -> upcoming

   The stored status is not the source of truth here — it survives only as
   the fallback for an event whose dates can't be read. The admin form does
   still save the derived value back, so the stored field stays meaningful
   for anything reading the database directly.

   TESTING VALUE: ARCHIVE_YEARS is 1. The intended setting is 2 — changing
   this one number moves the cutoff everywhere it is used, including the
   note shown above the Archive listing (see noticeText).
   =========================================================== */

(function (global) {
    "use strict";

    const ARCHIVE_YEARS = 1;

    const LABELS = {
        upcoming: "Upcoming",
        live: "LIVE",
        past: "Past",
        archive: "Archived"
    };

    function archiveCutoff() {
        const cutoff = new Date();
        cutoff.setUTCFullYear(cutoff.getUTCFullYear() - ARCHIVE_YEARS);
        return cutoff;
    }

    // Works from the raw stored strings ("YYYY-MM-DDTHH:MM:SSZ") so the
    // admin form can call it with whatever is currently typed into its four
    // date/time boxes, without having to assemble an event object first.
    // `fallback` is only reached when the dates can't be parsed at all.
    function fromDates(startIso, endIso, fallback) {
        const start = new Date(startIso);
        // No end date means the event is treated as ending the moment it
        // starts, so a one-off with only a start still ages out normally.
        const end = new Date(endIso || startIso);
        if (isNaN(start) || isNaN(end)) return fallback || "upcoming";

        const now = Date.now();
        const cutoff = archiveCutoff();

        if (start < cutoff && end < cutoff) return "archive";
        if (end <= now) return "past";
        if (start <= now) return "live";
        return "upcoming";
    }

    function derive(item) {
        if (!item) return "upcoming";
        return fromDates(item.date, item.endDate, item.status);
    }

    function labelFor(item) {
        return LABELS[derive(item)] || LABELS.upcoming;
    }

    // What the Upcoming listing holds — a live event belongs there, not
    // stranded in Past. Shared so the tab's contents and any "is there
    // anything in it?" test can't disagree about what counts.
    function isUpcomingish(item) {
        const status = derive(item);
        return status === "upcoming" || status === "live";
    }

    function noticeText() {
        return `Events are archived after ${ARCHIVE_YEARS} year${ARCHIVE_YEARS === 1 ? "" : "s"}.`;
    }

    global.EventStatus = {
        ARCHIVE_YEARS,
        LABELS,
        derive,
        fromDates,
        labelFor,
        isUpcomingish,
        noticeText
    };
})(window);

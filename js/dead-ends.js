/* ===========================================================
   Maze Rats — Dead Ends: what a record can be missing

   A DEAD END is a record in the archive that stops short: a maze nobody
   screenshotted the finish of, an event with no photos, a room whose builder
   was never written down. The Dead Ends page lists them and asks the people
   who were there to show us the way through.

   EVERY DEAD END IS MARKED BY HAND, from /warren. Nothing reaches the public
   list or a maze's window because the page guessed it.

   It used to guess, and the guesses were wrong often enough to be worse than
   nothing. The clearest case is the entrance: a great many mazes have no
   entrance picture because their entrance IS room 1 — "entrance" and
   "finish" in this data are about how the rooms are numbered, not about
   whether a picture exists — so a third of the archive was being advertised
   as missing a screenshot it did not need.

   What the page can see is still used, in one place: it PRE-TICKS the boxes
   in the admin editor for a record that has not been marked yet (see
   `suggested` below). A suggestion is only a starting point for a person to
   untick; it is never shown to a visitor.

   THIS FILE IS SHARED. The browser gets it as window.DeadEnds (home.html
   and warren.html load it); the Netlify functions require it, so the list
   of pieces a flag may name is validated against the same table the pages
   draw from. netlify.toml names it in included_files for that reason.

   No build step and no module system, so it detects where it is running,
   exactly as js/featured-days.js does.
   =========================================================== */
(function (root) {
    "use strict";

    /* Every piece a record can be missing, one per thing the archive
       actually keeps about a maze or an event (see js/rooms-data.js for the
       record's fields).

       `for` says which kind of record it applies to. `label` is the short
       name used in /warren; `word` is the one-word summary the console's
       Missing Pieces list shows (several pieces share "Images", and the list
       says it once); `ask` is the sentence shown to a visitor, worded
       as the thing we would like from them. `suggest`, where present, is how
       the admin editor decides to pre-tick it — never shown to visitors. */
    const PIECES = [
        // ---- who, when, where
        {
            key: "builder", for: ["maze"],
            label: "Builder",
            word: "Builder",
            ask: "Who built it",
            suggest: (r) => !text(r.creator)
        },
        {
            key: "host", for: ["event"],
            label: "Host",
            word: "Host",
            ask: "Who hosted it",
            suggest: (r) => !text(r.host)
        },
        {
            key: "opened", for: ["maze"],
            label: "Opening date",
            word: "Date",
            ask: "When it opened",
            suggest: (r) => !text(r.added)
        },
        {
            key: "date", for: ["event"],
            label: "Date",
            word: "Date",
            ask: "When it ran",
            suggest: (r) => !text(r.date)
        },
        {
            key: "hotel", for: ["maze", "event"],
            label: "Hotel",
            word: "Hotel",
            ask: "Which hotel it was on",
            suggest: (r) => !text(r.hotel)
        },
        {
            key: "status", for: ["maze"],
            label: "Open or closed",
            word: "Status",
            ask: "Whether it is still open"
        },
        {
            key: "roomlink", for: ["maze", "event"],
            label: "Room link",
            word: "Link",
            ask: "Where to find it in the hotel"
        },

        // ---- what it is
        {
            key: "story", for: ["maze", "event"],
            label: "Story",
            word: "Story",
            ask: "The story behind it",
            suggest: (r) => !text(r.description) && !text(r.details)
        },
        {
            key: "difficulty", for: ["maze"],
            label: "Difficulty",
            word: "Difficulty",
            ask: "How hard it is",
            suggest: (r) => !text(r.difficulty)
        },

        // ---- pictures of the maze
        {
            key: "entrance", for: ["maze"],
            label: "Entrance shot",
            word: "Images",
            ask: "A screenshot of the entrance",
            suggest: (r) => !imageOf(r.entrance)
        },
        {
            key: "finish", for: ["maze"],
            label: "Finish shot",
            word: "Images",
            ask: "A screenshot of the finish",
            suggest: (r) => !imageOf(r.finish)
        },
        {
            /* A room saved with a label and no picture — the archive already
               shows it as "Awaiting Room Image". */
            key: "rooms", for: ["maze"],
            label: "Room shots",
            word: "Images",
            ask: "Screenshots of the rooms we are missing",
            suggest: (r) => Array.isArray(r.gallery) && r.gallery.some(g => g && !text(g.image))
        },
        {
            key: "bonus", for: ["maze"],
            label: "Bonus rooms",
            word: "Images",
            ask: "Bonus or secret rooms"
        },
        {
            key: "runthrough", for: ["maze"],
            label: "Run-through",
            word: "Images",
            ask: "A run-through of the route"
        },
        {
            key: "versions", for: ["maze"],
            label: "Earlier versions",
            word: "Versions",
            ask: "How it looked in earlier versions"
        },
        {
            key: "photos", for: ["maze"],
            label: "Photos",
            word: "Photos",
            ask: "Photos of people playing it"
        },

        // ---- pictures and record of the event
        {
            key: "poster", for: ["event"],
            label: "Poster",
            word: "Poster",
            ask: "The event's poster or advert",
            suggest: (r) => !text(r.thumb)
        },
        {
            /* Only suggested for an event that has HAPPENED: an upcoming one
               has no photos because it has not had any yet. */
            key: "eventphotos", for: ["event"],
            label: "Event photos",
            word: "Photos",
            ask: "Photos from the event",
            suggest: (r, now) => {
                const end = Date.parse(r.endDate || r.date || "");
                return Number.isFinite(end) && end < (now || Date.now())
                    && !(Array.isArray(r.gallery) && r.gallery.some(g => g && text(g.image)));
            }
        },
        {
            key: "article", for: ["event"],
            label: "Habbo article",
            word: "Article",
            ask: "The official Habbo article about it"
        },

        // ---- both
        {
            key: "links", for: ["maze", "event"],
            label: "Links",
            word: "Links",
            ask: "Videos, posts or links about it"
        },
        {
            // The admin's note says what "something else" is.
            key: "other", for: ["maze", "event"],
            label: "Something else",
            word: "Other",
            ask: "Something else (see the note)"
        }
    ];

    const BY_KEY = {};
    PIECES.forEach(p => { BY_KEY[p.key] = p; });

    const TYPES = ["maze", "event"];

    // Anything that is not a non-blank string counts as missing.
    function text(v) {
        return typeof v === "string" && v.trim() !== "";
    }

    function imageOf(slot) {
        return Boolean(slot && text(slot.image));
    }

    function piecesFor(type) {
        return PIECES.filter(p => p.for.indexOf(type) !== -1);
    }

    function isPiece(type, key) {
        const p = BY_KEY[key];
        return Boolean(p && p.for.indexOf(type) !== -1);
    }

    /* What the admin editor pre-ticks for a record nobody has marked yet.
       A guess for a person to correct, and nothing more. */
    function suggested(record, type, now) {
        if (!record) return [];
        return piecesFor(type)
            .filter(p => typeof p.suggest === "function" && p.suggest(record, now))
            .map(p => p.key);
    }

    /* What a record is missing: exactly the pieces an admin marked, in the
       table's own order, and nothing else. `flag` is the stored entry for
       the record from /dead-ends, or null — and null means complete. */
    function gapsOf(type, flag) {
        if (!flag || !Array.isArray(flag.pieces)) return [];
        return piecesFor(type).filter(p => flag.pieces.indexOf(p.key) !== -1).map(p => p.key);
    }

    /* ---- what a VISITOR can add ----

       Deliberately far fewer than the pieces above. The pieces are how an
       admin says precisely what is missing; a visitor answering needs a
       short menu of the kinds of thing they might have, worded as the thing
       they are doing ("Add room images"), each opening the one input that
       kind needs. The Add Info form in the console builds itself from this.

       `for` is the kinds of record a lead can be about — "new" is a maze
       that is not in the archive at all yet. `input` picks the control the
       form shows. `pieces` says which of an admin's marked pieces this kind
       of answer can fill, so /warren can pre-tick them when accepting a lead
       and the form can pre-select the likeliest kind for a marked record. */
    const LEAD_KINDS = [
        {
            key: "images", for: ["maze", "event", "new"],
            label: { maze: "Add room images", new: "Add room images", event: "Add photos" },
            input: "images",
            pieces: ["entrance", "finish", "rooms", "bonus", "runthrough", "versions", "photos", "poster", "eventphotos"]
        },
        { key: "builder", for: ["maze", "new"], label: "Add builder", input: "text", placeholder: "Origins username", pieces: ["builder"] },
        { key: "host", for: ["event"], label: "Add host", input: "text", placeholder: "Origins username", pieces: ["host"] },
        {
            key: "date", for: ["maze", "event", "new"],
            label: { maze: "Add opening date", new: "Add opening date", event: "Add event date" },
            input: "text", placeholder: "e.g. June 2025", pieces: ["opened", "date"]
        },
        { key: "hotel", for: ["maze", "event", "new"], label: "Add hotel", input: "hotel", pieces: ["hotel"] },
        { key: "difficulty", for: ["maze", "new"], label: "Add difficulty", input: "difficulty", pieces: ["difficulty"] },
        { key: "story", for: ["maze", "event", "new"], label: "Add the story", input: "textarea", placeholder: "What it's like, how it works...", pieces: ["story"] },
        { key: "links", for: ["maze", "event", "new"], label: "Add links", input: "text", placeholder: "Videos, posts, articles", pieces: ["links", "article", "roomlink"] },
        { key: "other", for: ["maze", "event", "new"], label: "Something else", input: "textarea", placeholder: "Tell us what you know", pieces: ["other", "status"] }
    ];
    const LEAD_KIND = {};
    LEAD_KINDS.forEach(k => { LEAD_KIND[k.key] = k; });

    function leadKindsFor(type) {
        return LEAD_KINDS.filter(k => k.for.indexOf(type) !== -1);
    }

    function isLeadKind(type, key) {
        const k = LEAD_KIND[key];
        return Boolean(k && k.for.indexOf(type) !== -1);
    }

    function leadKindLabel(key, type) {
        const k = LEAD_KIND[key];
        if (!k) return key;
        return typeof k.label === "string" ? k.label : (k.label[type] || k.label.maze);
    }

    // The kind of answer that would fill a marked piece — how the form picks
    // its first option for a record an admin has marked.
    function leadKindForPiece(pieceKey) {
        const k = LEAD_KINDS.find(x => x.pieces.indexOf(pieceKey) !== -1);
        return k ? k.key : "other";
    }

    const HOTELS = ["COM", "ES", "BR"];
    const DIFFICULTIES = [
        { key: "easy", label: "Easy" },
        { key: "medium", label: "Medium" },
        { key: "hard", label: "Hard" },
        { key: "very-hard", label: "Very Hard" },
        { key: "extreme", label: "Extreme" }
    ];

    const DeadEnds = {
        PIECES: PIECES,
        TYPES: TYPES,
        piece: (key) => BY_KEY[key] || null,
        piecesFor: piecesFor,
        isPiece: isPiece,
        suggested: suggested,
        gapsOf: gapsOf,
        LEAD_KINDS: LEAD_KINDS,
        leadKind: (key) => LEAD_KIND[key] || null,
        leadKindsFor: leadKindsFor,
        isLeadKind: isLeadKind,
        leadKindLabel: leadKindLabel,
        leadKindForPiece: leadKindForPiece,
        HOTELS: HOTELS,
        DIFFICULTIES: DIFFICULTIES,
        // Mirrors the server's limits so the form can say so before a round trip.
        NOTE_MAX: 300,
        LEAD_TEXT_MAX: 2000,
        LEAD_ITEM_MAX: 1000,
        LEAD_ITEMS_MAX: 8,
        LEAD_IMAGES_MAX: 8,
        NEW_NAME_MAX: 100,
        IMAGE_MAX_BYTES: 4 * 1024 * 1024
    };

    if (typeof module === "object" && module && module.exports) {
        module.exports = DeadEnds;          // netlify/functions/dead-ends.js
    } else {
        root.DeadEnds = DeadEnds;           // home.html, warren.html
    }
})(typeof globalThis !== "undefined" ? globalThis : this);

#!/usr/bin/env node
/* Exercises netlify/functions/_changes.js — the "what changed in this edit"
 * summariser behind the line What's New prints under each row.
 *
 * It is tested rather than eyeballed because of where it runs: inside the
 * PUT that saves a maze, on data that arrives from an HTML form and is
 * compared against a document from Mongo. Those two disagree about types
 * constantly — a number comes back as a string, a cleared field as "" where
 * the database holds null — and every one of those disagreements, left
 * unhandled, is an edit that claims to have changed something it did not.
 *
 * The last group of cases matters most: this must never throw, for any
 * input at all, because it sits in the path of somebody saving their work.
 *
 *     node tools/check-changes.js
 *
 * Exits non-zero and says what failed.
 */
const { describe, canon } = require("../netlify/functions/_changes.js");

let pass = 0;
const failures = [];

function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) { pass++; return; }
    failures.push(`${name}\n      expected ${e}\n      got      ${a}`);
}

// A room shaped like the real ones, for cases that do not care about detail.
const room = () => ({
    id: "the-little-maze",
    name: "The Little Maze",
    creator: "ChrisYepYep",
    status: "open",
    hotel: "COM",
    added: "2024-06-23",
    difficulty: "medium",
    tags: ["FURNI MAZE", "ILLUSION"],
    description: "A 100-room maze.",
    details: "Longer prose.",
    habboLink: "",
    thumb: "assets/rooms/tlm/entrance.png",
    entrance: { image: "a.png", label: "Start", oldVersions: [] },
    finish: { image: "z.png", label: "Complete", oldVersions: [] },
    gallery: [{ image: "r1.png", label: "Awakening", bonus: false, oldVersions: [] }],
    relatedImages: [],
    furni: { "r1.png": [[0, "throne-sofa.png"]] },
    linksReferences: [],
    updatedAt: "2026-09-01T10:00:00.000Z",
});

// ---------- nothing changed ----------

check("identical record reports nothing", describe(room(), room()), []);

check("only the save's own stamps moved",
    describe(room(), { ...room(), updatedAt: "2026-09-22T12:00:00.000Z" }), []);

check("a previous run's own output is not a change",
    describe({ ...room(), changes: ["text"] }, { ...room(), changes: ["imagery"] }), []);

// ---------- the form round-trip, which is where the false positives live ----------

check("number came back from the form as a string",
    describe({ ...room(), order: 3 }, { ...room(), order: "3" }), []);

check("cleared field: null in the database, empty string from the form",
    describe({ ...room(), habboLink: null }, { ...room(), habboLink: "" }), []);

check("undefined against missing",
    describe({ ...room(), host: undefined }, { ...room() }), []);

check("an empty list against a field the record never had",
    describe((({ relatedImages, ...r }) => r)(room()), { ...room(), relatedImages: [], furni: { changed: 1 } }), ["furni"]);

check("boolean round-tripped as a string",
    describe({ ...room(), live: true }, { ...room(), live: "true" }), []);

check("leading and trailing whitespace only",
    describe(room(), { ...room(), name: "  The Little Maze  " }), []);

check("object key order differs, values do not",
    describe({ ...room(), entrance: { image: "a.png", label: "Start", oldVersions: [] } },
        { ...room(), entrance: { oldVersions: [], label: "Start", image: "a.png" } }), []);

// ---------- real changes ----------

check("a description edit is text",
    describe(room(), { ...room(), description: "A 101-room maze." }), ["text"]);

check("renaming is text",
    describe(room(), { ...room(), name: "The Littler Maze" }), ["text"]);

check("status change",
    describe(room(), { ...room(), status: "closed" }), ["status"]);

check("difficulty re-rated",
    describe(room(), { ...room(), difficulty: "hard" }), ["difficulty"]);

check("tags edited",
    describe(room(), { ...room(), tags: ["FURNI MAZE"] }), ["tags"]);

check("tag ORDER is a real change",
    describe(room(), { ...room(), tags: ["ILLUSION", "FURNI MAZE"] }), ["tags"]);

check("furni listing updated",
    describe(room(), { ...room(), furni: { "r1.png": [[0, "bonsai.png"]] } }), ["furni"]);

check("links",
    describe(room(), { ...room(), habboLink: "https://habbo.com/x" }), ["links"]);

check("dates",
    describe(room(), { ...room(), added: "2024-06-24" }), ["dates"]);

/* The thumbnail is its own group, separate from the entrance and finish.
   It shared one with them until an event whose promo image changed was
   reported as "Entrance or finish updated" — see the note in _changes.js. */
check("the thumbnail is its own group",
    describe(room(), { ...room(), thumb: "new.png" }), ["thumb"]);

check("the entrance is markers, not the thumbnail",
    describe(room(), { ...room(), entrance: { image: "b.png", label: "Start", oldVersions: [] } }),
    ["markers"]);

check("the finish is markers too",
    describe(room(), { ...room(), finish: { image: "y.png", label: "Done", oldVersions: [] } }),
    ["markers"]);

check("thumbnail and entrance together report both, thumbnail first",
    describe(room(), {
        ...room(),
        thumb: "new.png",
        finish: { image: "y.png", label: "Done", oldVersions: [] },
    }), ["thumb", "markers"]);

// ---------- imagery: grew, or merely changed ----------

check("gallery gained a shot",
    describe(room(), {
        ...room(),
        gallery: [...room().gallery, { image: "r2.png", label: "Miftah", bonus: false, oldVersions: [] }],
    }), ["imagery-added"]);

check("gallery swapped a shot for another: changed, not added",
    describe(room(), { ...room(), gallery: [{ image: "r9.png", label: "New", bonus: false, oldVersions: [] }] }),
    ["imagery"]);

check("gallery lost a shot",
    describe({ ...room(), gallery: [...room().gallery, { image: "r2.png", label: "B", oldVersions: [] }] },
        { ...room() }), ["imagery"]);

check("relatedImages alone, with gallery absent from the body, still counts as added",
    describe(room(), { id: "the-little-maze", relatedImages: [{ image: "x.png" }] }), ["imagery-added"]);

check("a caption edited inside a gallery entry is imagery, not text",
    describe(room(), { ...room(), gallery: [{ image: "r1.png", label: "Awakened", bonus: false, oldVersions: [] }] }),
    ["imagery"]);

// ---------- several at once, and the reporting order ----------

check("many groups come back in GROUPS order",
    describe(room(), {
        ...room(),
        description: "new",
        status: "closed",
        gallery: [...room().gallery, { image: "r2.png" }],
        furni: { "r1.png": [[0, "x.png"]] },
    }), ["imagery-added", "furni", "status", "text"]);

// ---------- fields nothing knows about ----------

check("an unmapped field falls into details",
    describe(room(), { ...room(), hotel: "ES" }), ["details"]);

check("a brand new field nobody has heard of still reports",
    describe(room(), { ...room(), somethingInvented: "yes" }), ["details"]);

check("details is reported after the known groups",
    describe(room(), { ...room(), hotel: "ES", description: "new" }), ["text", "details"]);

// ---------- events, which share the table ----------

const evt = () => ({
    id: "launch", title: "mazerats.net Launch", host: "ChrisYepYep",
    date: "2026-10-03T08:00:00.000Z", endDate: "", status: "upcoming",
    description: "The archive opens.", tags: [], gallery: [], article: "",
});

check("event title is text", describe(evt(), { ...evt(), title: "Launch Party" }), ["text"]);
check("event host is text", describe(evt(), { ...evt(), host: "markeh" }), ["text"]);
check("event date is dates", describe(evt(), { ...evt(), date: "2026-10-04T08:00:00.000Z" }), ["dates"]);
check("event article is links", describe(evt(), { ...evt(), article: "<p>x</p>" }), ["links"]);
check("event ecSeason is details", describe(evt(), { ...evt(), ecSeason: "s2" }), ["details"]);
/* The case this split exists for: every event has a thumbnail and only a
   few have an entrance, so an event's picture changing must not be
   reported as its entrance changing. mazerats.net Launch said exactly
   that before the groups were separated. */
check("an event whose promo image changed says thumbnail, not entrance",
    describe(evt(), { ...evt(), thumb: "promo-v2.png" }), ["thumb"]);

// ---------- accumulating across several saves in one day ----------
//
// The case this exists for, reported from the live archive: adding room
// images is one save and the furni scan that follows is another, so the
// second replaced the first and the day's entry said only "Updated furni
// listing" for an afternoon that had also added pictures.

const TODAY = new Date().toISOString().slice(0, 10) + "T09:00:00.000Z";
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10) + "T09:00:00.000Z";

// The record as it stands after save one: images added, stamped today.
const afterImages = () => ({ ...room(), changes: ["imagery-added"], updatedAt: TODAY });

check("a second save the same day keeps the first save's groups",
    describe(afterImages(), { ...room(), furni: { "r1.png": [[0, "x.png"]] } }),
    ["imagery-added", "furni"]);

check("and a third joins them, still in GROUPS order",
    describe({ ...room(), changes: ["imagery-added", "furni"], updatedAt: TODAY },
        { ...room(), status: "closed" }),
    ["imagery-added", "furni", "status"]);

check("a save the NEXT day starts a fresh list",
    describe({ ...room(), changes: ["imagery-added", "furni"], updatedAt: YESTERDAY },
        { ...room(), status: "closed" }),
    ["status"]);

check("a save that changes nothing keeps the day's list",
    describe(afterImages(), { ...room() }), ["imagery-added"]);

check("a no-op the next day clears it",
    describe({ ...room(), changes: ["furni"], updatedAt: YESTERDAY }, { ...room() }), []);

check("added outranks updated when both land on one day",
    describe({ ...room(), changes: ["imagery-added"], updatedAt: TODAY },
        { ...room(), gallery: [{ image: "swapped.png", label: "X", oldVersions: [] }] }),
    ["imagery-added"]);

check("a stored list with no usable stamp does not carry over",
    describe({ ...room(), changes: ["furni"], updatedAt: "" }, { ...room(), status: "closed" }),
    ["status"]);

check("a junk stamp does not carry over either",
    describe({ ...room(), changes: ["furni"], updatedAt: "not a date" }, { ...room(), status: "closed" }),
    ["status"]);

check("a stored list that is not an array is ignored",
    describe({ ...room(), changes: "furni", updatedAt: TODAY }, { ...room(), status: "closed" }),
    ["status"]);

check("duplicates across saves are not repeated",
    describe({ ...room(), changes: ["furni"], updatedAt: TODAY },
        { ...room(), furni: { "r1.png": [[0, "y.png"]] } }), ["furni"]);

check("details stays last even when carried over",
    describe({ ...room(), changes: ["details"], updatedAt: TODAY },
        { ...room(), description: "new" }), ["text", "details"]);

// ---------- it must never throw ----------

const NASTY = [
    ["no before", null, room()],
    ["no update", room(), null],
    ["both null", null, null],
    ["before is a string", "nonsense", room()],
    ["update is a number", room(), 42],
    ["update is an array", room(), [1, 2, 3]],
    ["empty objects", {}, {}],
    ["a Date instance", { ...room(), added: new Date("2024-06-23") }, { ...room(), added: "2024-06-23" }],
    ["a function on the body", room(), { ...room(), f: function () {} }],
    ["NaN", room(), { ...room(), n: NaN }],
    ["Infinity", room(), { ...room(), n: Infinity }],
    ["a very deep shape", room(), { ...room(), deep: JSON.parse("[".repeat(40) + "1" + "]".repeat(40)) }],
    ["gallery is not a list", { ...room(), gallery: "oops" }, { ...room(), gallery: "nope" }],
];

NASTY.forEach(([name, before, update]) => {
    let threw = null, out;
    try { out = describe(before, update); } catch (e) { threw = e; }
    if (threw) failures.push(`did not survive: ${name} — threw ${threw.message}`);
    else if (!(out === null || Array.isArray(out))) {
        failures.push(`returned something odd for ${name}: ${JSON.stringify(out)}`);
    } else pass++;
});

// A cyclic object cannot arrive through JSON.parse, but the `before` side
// comes from a driver, so it is worth knowing this does not hang or blow the
// stack.
(() => {
    const cyclic = room();
    cyclic.self = cyclic;
    let threw = null, out;
    try { out = describe(room(), cyclic); } catch (e) { threw = e; }
    if (threw) failures.push(`did not survive a cyclic body — threw ${threw.message}`);
    else if (!(out === null || Array.isArray(out))) failures.push("cyclic body returned something odd");
    else pass++;
})();

// ---------- report ----------

if (failures.length) {
    console.error(`changes check: ${failures.length} FAILED, ${pass} passed\n`);
    failures.forEach(f => console.error("  - " + f));
    process.exitCode = 1;
} else {
    console.log(`changes check OK — ${pass} cases`);
}

/* What actually changed in an edit, worked out at the moment of the edit.
 *
 * ----------------------------------------------------------------------
 * WHY IT HAS TO HAPPEN HERE
 *
 * Nothing on this site kept a before-image of anything. A save sends the
 * WHOLE record and `$set` overwrites it, so the instant the write lands the
 * previous version is gone — which is why What's New could only ever say
 * "Updated" and not what was updated. The admin activity log does not help
 * either: it records that a write happened, not what moved, and expires
 * after 90 days.
 *
 * So the comparison has to be made while both versions still exist, which is
 * the one moment between reading the document and replacing it. This module
 * is that comparison. What it returns is stored on the record as `changes`
 * and read by js/home.js.
 *
 * IT RECORDS KEYS, NOT SENTENCES. "imagery" rather than "Added room
 * imagery", so the wording can be rewritten — and it will be — without a
 * migration over every record that already carries one.
 *
 * ----------------------------------------------------------------------
 * IT CANNOT BREAK A SAVE, AND THAT IS THE FIRST REQUIREMENT
 *
 * This is decoration on an editing tool. A maze losing its changelog line is
 * a shrug; a maze not saving because the changelog threw is somebody's
 * afternoon. So `describe` catches everything, always returns either an
 * array or null, and the callers add the field only when it is an array.
 * There is no input — malformed, enormous, cyclic, null — for which this is
 * allowed to raise.
 *
 * ----------------------------------------------------------------------
 * WHAT COUNTS AS A CHANGE
 *
 * Only fields the incoming body actually carries. `$set` does not touch a
 * key that is not in the update, so a field the form did not send has not
 * changed, whatever the stored record says. Comparing against the full
 * stored document instead would report a deletion every time a narrower
 * form saved.
 *
 * And only fields that MEANINGFULLY differ. The admin forms round-trip
 * values through HTML inputs, so a number comes back as a string and a blank
 * comes back as "" where the database holds null. Reporting those as edits
 * would mean every save claiming to have changed everything, which is the
 * same as saying nothing. See canon below for exactly what is normalised.
 */

/* The groups, in the order they are reported. Ordered by how much a reader
   cares: pictures and furni are what people come back for, a status change
   matters, and a typo fixed in a description is the smallest true thing this
   can say.

   Both collections are covered by one table. Rooms and events share most of
   their shape — description, details, tags, gallery, thumb, links — and the
   few fields only one of them has (furni, difficulty, host, ecSeason) simply
   never appear in the other's body. */
const GROUPS = [
    { key: "imagery",    fields: ["gallery", "relatedImages"] },
    { key: "furni",      fields: ["furni"] },
    { key: "markers",    fields: ["thumb", "entrance", "finish"] },
    { key: "status",     fields: ["status"] },
    { key: "difficulty", fields: ["difficulty"] },
    { key: "tags",       fields: ["tags"] },
    { key: "dates",      fields: ["added", "date", "endDate"] },
    { key: "links",      fields: ["habboLink", "linksReferences", "article"] },
    { key: "text",       fields: ["name", "title", "description", "details", "creator", "host"] },
];

/* Fields that are never a change worth reporting: the record's identity, the
   stamps written by the save itself, and this module's own output. Without
   the last two every edit would report a "details" change caused by the
   previous edit's bookkeeping. */
const IGNORED = new Set(["id", "_id", "createdAt", "updatedAt", "changes"]);

// Anything real that is not in a group above still deserves to be reported,
// or a change quietly goes unmentioned. It lands here.
const CATCH_ALL = "details";

const FIELD_GROUP = (() => {
    const map = new Map();
    GROUPS.forEach(g => g.fields.forEach(f => map.set(f, g.key)));
    return map;
})();

/* One canonical string per value, so two values can be compared for meaning
   rather than for representation.
 *
 * WHAT IS DELIBERATELY TREATED AS EQUAL:
 *   null / undefined / ""      all "nothing". A cleared field arrives as ""
 *                              from a form and is stored as null; that is
 *                              the same emptiness twice, not an edit.
 *   7 / "7", true / "true"     a form returns every value as a string. A
 *                              number that survived a round trip unchanged
 *                              has not changed.
 *   " Maze " / "Maze"          leading and trailing space only. Whitespace
 *                              is not a correction anybody wants told.
 *
 * WHAT IS NOT:
 *   array ORDER, which is real — reordering a gallery is an edit to it.
 *   object KEY order, which is not: Mongo and JSON.parse make no promise
 *   about it, so keys are sorted before they are written out.
 *
 * DEPTH IS CAPPED rather than trusted. A gallery entry is three levels deep
 * at worst, so anything past ten is either a shape nobody designed or a
 * cycle, and neither is worth recursing into. Cycles cannot reach here
 * through JSON.parse, but this also runs against documents straight out of
 * the driver, and "cannot happen" is not a thing to stake a save on. */
function canon(value, depth) {
    const d = depth || 0;
    if (d > 10) return "…";
    if (value === null || value === undefined || value === "") return "";
    const t = typeof value;
    if (t === "string") return "s:" + value.trim();
    if (t === "number") return Number.isFinite(value) ? "s:" + String(value) : "";
    if (t === "boolean") return "s:" + String(value);
    if (value instanceof Date) return "s:" + value.toISOString();
    if (Array.isArray(value)) return "[" + value.map(v => canon(v, d + 1)).join(",") + "]";
    if (t === "object") {
        /* Every key, and IGNORED is deliberately not consulted here. That
           list is about TOP-LEVEL record fields — the id, the save's own
           stamps — and canon is only ever handed one field's value, never a
           whole record. Filtering here would instead reach inside nested
           shapes and drop any key that happened to share one of those names,
           masking a real edit to it. */
        const keys = Object.keys(value).sort();
        return "{" + keys.map(k => k + ":" + canon(value[k], d + 1)).join(",") + "}";
    }
    // Functions, symbols, bigints: nothing the database or a JSON body can
    // hold. Treated as empty rather than allowed to stringify unpredictably.
    return "";
}

const same = (a, b) => canon(a) === canon(b);

// How many pictures a record carries, for telling "added some" from
// "changed some". Anything that is not a list counts as none rather than
// throwing — a malformed gallery is not worth a stack trace.
function pictureCount(doc) {
    if (!doc || typeof doc !== "object") return 0;
    let n = 0;
    ["gallery", "relatedImages"].forEach(f => {
        if (Array.isArray(doc[f])) n += doc[f].length;
    });
    return n;
}

/* The change list for one edit, or null when there is nothing trustworthy to
 * say — no previous version, no update, or anything at all going wrong.
 *
 * `before` is the stored document, `update` the body about to be written.
 * Returns stable keys in GROUPS order, e.g. ["imagery-added", "text"].
 */
function describe(before, update) {
    try {
        if (!before || typeof before !== "object") return null;
        if (!update || typeof update !== "object") return null;

        const hit = new Set();

        Object.keys(update).forEach(field => {
            if (IGNORED.has(field)) return;
            if (same(before[field], update[field])) return;
            hit.add(FIELD_GROUP.get(field) || CATCH_ALL);
        });

        if (!hit.size) return [];

        /* "Added" only when there are genuinely MORE pictures than before.
           A gallery that gained two shots and lost one is a gallery that was
           worked on, not one that grew, and saying "added" there would be
           describing the half of it that sounded better.

           Counted against the record AS IT WILL BE — before merged with the
           update — and not against the update alone. A body carrying
           relatedImages but not gallery is the ordinary case for a narrower
           form, and counting it on its own would compare two pictures
           against the stored record's twenty and call a save that added one
           a removal of eighteen. */
        const after = Object.assign({}, before, update);
        const out = [];
        GROUPS.forEach(g => {
            if (!hit.has(g.key)) return;
            out.push(g.key === "imagery" && pictureCount(after) > pictureCount(before)
                ? "imagery-added"
                : g.key);
        });
        if (hit.has(CATCH_ALL) && out.indexOf(CATCH_ALL) === -1) out.push(CATCH_ALL);

        return out;
    } catch (e) {
        // A changelog is never worth a failed save. See the header.
        return null;
    }
}

module.exports = { describe, GROUPS, canon };

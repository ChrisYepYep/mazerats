/* Furni, merged piece by piece.

   A maze's furni is written by two things that do not know about each
   other: the /warren form (through rooms.js) and the furni scan
   (tools/furni-scan-local.js), which writes straight to the database and
   can run for a quarter of an hour. rooms.js already merged the form's
   changes into the furni AS STORED, picture by picture, under a furniRev
   compare-and-set — but each changed picture went as its WHOLE record, and
   replaced the stored one. So a scan that finished a room while the form
   was open lost its new detections the moment the admin hid one piece in
   that room: the form's copy, read before the scan, went back over it.

   Now each changed picture goes as a pair, { base, draft }: the record as
   the form opened it, and as the admin left it. The difference between the
   two is exactly what the admin did, and only that is applied to the
   record stored NOW (a three-way merge, as version control does it):

     - a piece in the draft and not in the base was added here: it is added,
     - a piece in the base and not in the draft was removed here: it is
       removed, if it is still there,
     - a piece in both whose fields differ (Hide/Show sets `hidden`) has
       those fields, and only those, changed on the stored piece,
     - everything else — every piece the scan found meanwhile, every figure
       it rewrote (scannedAt, coverage, roomColours) — is left as stored.

   The record's own fields (scannedAt, skipped, error, roomColours) follow
   the same rule: one the form changed is applied, the rest stay as stored.
   The form never changes them today, so in practice they are the scan's.

   WHAT MAKES A PIECE THE SAME PIECE (pieceKey). No stored piece has an id,
   and nothing gives one out: the scan writes a fresh list every time it
   rescans a room, and old records were written long before this. So a key
   is made from what a piece IS:

     - which furni: its FurniIndex page (`url`), which every colourway has
       its own of — the same key js/admin.js's furniKey and js/home.js use,
       so the three agree on what counts as one piece; failing that its
       furni line (`className`), failing that its name,
     - its icon, for the rare piece recorded without either,
     - where it is (`at`, the scan's [x, y]). The scan records a furni at
       most once per room (the matcher keeps its best placement per sprite,
       then dedupes by position), and a hand-added piece has no position
       and is added at most once per furni (addFurni refuses a second), so
       with position in the key a scanned Armchair and a hand-added Armchair
       in the same room stay two pieces, as they are on the page.

   The scan is deterministic on the same picture, so a rescan finds a piece
   at the same `at` and it keeps its key: a piece the admin hid mid-scan is
   still found, and hidden, after the scan rewrites the room. Two stored
   pieces with the same key (possible only in hand-edited data) are told
   apart by the order they appear in: the second is key#2, and so on.

   Shared by rooms.js (the form's saves) and the scan tool (which carries a
   piece's hidden flag across a rescan by the same key), so the two cannot
   disagree about identity. js/admin.js repeats mergeRecord for putting a
   refused save's changes back on top of the newer record — keep in step. */

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Never copied across: a key named like this, in a body that was parsed
// from JSON, would set an object's prototype rather than a field.
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function pieceKey(f) {
    if (!isObj(f)) return "";
    const what = f.url || f.className || f.name || "";
    const at = Array.isArray(f.at) ? f.at.join(",") : "";
    return `${what}|${f.icon || ""}|${at}`;
}

// [key, piece] pairs in order, a repeated key numbered from its second.
function keyed(items) {
    const seen = new Map();
    return (Array.isArray(items) ? items : []).map(f => {
        const k = pieceKey(f);
        const n = (seen.get(k) || 0) + 1;
        seen.set(k, n);
        return [n === 1 ? k : `${k}#${n}`, f];
    });
}

/* `target` with the fields that differ between `base` and `draft` set as
   the draft has them (or removed, where the draft dropped one). A fresh
   object; `target` is not touched. */
function withChanges(target, base, draft, skip) {
    const out = { ...(isObj(target) ? target : {}) };
    const b = isObj(base) ? base : {};
    const d = isObj(draft) ? draft : {};
    new Set([...Object.keys(b), ...Object.keys(d)]).forEach(k => {
        if (UNSAFE.has(k) || (skip && k === skip)) return;
        if (same(b[k], d[k])) return;
        if (hasOwn(d, k)) out[k] = d[k];
        else delete out[k];
    });
    return out;
}

/* One picture's record: what the admin did between `base` and `draft`,
   applied to `current`, the record as stored now (undefined when there is
   none — a room nothing has scanned, or one somebody else removed). */
function mergeRecord(current, base, draft) {
    const cur = isObj(current) ? current : null;
    const b = isObj(base) ? base : {};
    const d = isObj(draft) ? draft : {};
    const out = withChanges(cur || {}, b, d, "items");
    const baseItems = new Map(keyed(b.items));
    const draftItems = new Map(keyed(d.items));
    const items = [];
    const kept = new Set();
    for (const [k, f] of keyed(cur ? cur.items : [])) {
        // Removed here.
        if (baseItems.has(k) && !draftItems.has(k)) continue;
        // Seen here: only what the admin changed on it.
        items.push(baseItems.has(k) && isObj(f) ? withChanges(f, baseItems.get(k), draftItems.get(k)) : f);
        kept.add(k);
    }
    // Added here, unless something else already put the same piece there.
    for (const [k, f] of draftItems) {
        if (!baseItems.has(k) && !kept.has(k)) items.push(f);
    }
    out.items = items;
    return out;
}

// A patch entry in the three-way shape, as opposed to a whole record from
// a page loaded before it (see applyFurniPatch).
const isDraftEntry = v => isObj(v) && hasOwn(v, "draft");

/* The stored furni with a form's patch applied. `patch` maps a picture's
   address to one of:

     null                       remove this picture's record (a picture the
                                maze no longer has, or the old address of
                                one replaced in place)
     { base, draft, from? }     the three-way merge above. `from` is where
                                the record came from when the form moved it
                                to a new address (moveFurniKey in admin.js):
                                with nothing stored at the new address yet,
                                the one stored at `from` is what the admin's
                                changes are applied to — so a scan that
                                finished the room meanwhile is carried over
                                with it.
     any other object           a whole record, from a /warren tab loaded
                                before the three-way shape. Stored as sent,
                                which is what that page expects; it can
                                overwrite a scan's news for that one room,
                                as it always could.

   Every entry reads the furni as it was BEFORE the patch, so the order
   the entries arrive in does not matter: a move's null for the old address
   cannot remove the record the new address is being built from. */
function applyFurniPatch(stored, patch) {
    const before = isObj(stored) ? stored : {};
    const next = Object.assign(Object.create(null), before);
    Object.keys(patch || {}).forEach(image => {
        if (UNSAFE.has(image)) return;
        const entry = patch[image];
        if (entry === null) { delete next[image]; return; }
        if (!isDraftEntry(entry)) { next[image] = entry; return; }
        const from = typeof entry.from === "string" && !hasOwn(before, image) && hasOwn(before, entry.from) ? entry.from : null;
        const current = hasOwn(before, image) ? before[image] : from ? before[from] : undefined;
        next[image] = mergeRecord(current, entry.base, entry.draft);
    });
    return { ...next };
}

/* Whether a patch entry is one rooms.js will take: null, a whole record,
   or the three-way shape with a draft record, a base record or none, and
   an optional `from` address. */
function validEntry(v) {
    if (v === null) return true;
    if (!isObj(v)) return false;
    if (!isDraftEntry(v)) return true;
    if (!isObj(v.draft)) return false;
    if (v.base !== undefined && v.base !== null && !isObj(v.base)) return false;
    if (v.from !== undefined && (typeof v.from !== "string" || !v.from || v.from.length > 2048)) return false;
    return true;
}

module.exports = { pieceKey, mergeRecord, applyFurniPatch, validEntry, isDraftEntry };

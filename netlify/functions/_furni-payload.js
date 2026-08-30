/* Packs room/event records into the compact form the public site reads.

   The problem this solves: the furni a scan records is 96% of what /rooms
   returns — 3.26MB of a 3.38MB response, against 117KB of actual maze data.
   Almost all of it is repetition. 8,571 detections across the archive refer
   to just 506 distinct furni, so every name, motto, icon URL, product URL
   and release date is sent an average of seventeen times, and every one of
   those URLs repeats the same 41-character FurniIndex prefix.

   So: one table of the distinct furni, one copy of the prefix, and each
   detection becomes a pair of [index into that table, its sprite]. Nothing
   is dropped that the site draws — see js/api.js, which puts it straight
   back into the shape js/home.js already expects.

   Two things ARE dropped, both invisible to visitors:
     - the reviewer's fields (coverage, at, matched, alternates, and the
       per-image scannedAt/roomColours/skipped). The admin page needs them,
       the site never reads one of them, and together they are 600KB.
     - items marked hidden, which exist precisely so they don't reach the
       site.
   The admin page asks for the raw records instead (?full=1, see rooms.js),
   so nothing here affects what an admin can see or edit.

   Result: 3.38MB -> 569KB, and ~78KB once compressed. */

const { getCatalogue } = require("./furni-catalogue.js");

// Every icon and sprite URL FurniIndex serves begins with this. Sent once.
const PREFIX = "https://furniindex.com/image/furni/furni-";

/* Two things the stored records can't answer on their own, both looked up
   in the catalogue:

   smallByLarge — the scan records the sprite it matched as a LARGE image
   URL, because that is the artwork it compared against, but the furni card
   shows the small one. The two are not derivable from each other by string
   surgery: 271 of the 3,417 large sprites have a small twin whose filename
   differs by more than the -lrg/-sml suffix. Mapping by grid position is
   exact instead — smallImages has the same [state][rotation] shape as
   largeImages on all 1,278 rows.

   classByIcon — className only started being stored on newly-scanned furni,
   so every one of the 8,571 detections already in the archive has none.
   Reading it from the catalogue means the card can show it for all of them
   without a rescan or a migration.

   Memoized per warm invocation. getCatalogue is a Blobs read against a
   day-old cache, not a FurniIndex round-trip, but there is no reason to
   repeat even that on every request. */
let cachedIndex = null;
let cachedAt = 0;
const MAP_TTL_MS = 10 * 60 * 1000;
// How long an EMPTY result (the catalogue was unreachable) is held before
// trying again — far shorter than a good one, but not zero.
const FAILED_TTL_MS = 60 * 1000;

async function catalogueIndex() {
    if (cachedIndex && Date.now() - cachedAt < MAP_TTL_MS) return cachedIndex;
    const smallByLarge = new Map();
    const classByIcon = new Map();
    try {
        const catalogue = await getCatalogue();
        for (const item of catalogue.items || []) {
            if (item.icon && item.className) classByIcon.set(item.icon, item.className);
            (item.largeImages || []).forEach((state, si) => state.forEach((url, ri) => {
                const small = ((item.smallImages || [])[si] || [])[ri];
                if (url && small) smallByLarge.set(url, small);
            }));
        }
    } catch (e) {
        /* An unreachable catalogue must not cost the site its furni. Empty
           maps mean every sprite falls through to the large URL below and
           className is simply absent — which is what the site showed before
           any of this existed.

           The empty result is cached too, for a short while. Returning
           without caching meant a failing catalogue was retried on EVERY
           request — a Blobs read per visitor, at exactly the moment things
           are already unwell. A minute is long enough to stop the pile-up
           and short enough that recovery is quick. */
        cachedIndex = { smallByLarge, classByIcon };
        cachedAt = Date.now() - (MAP_TTL_MS - FAILED_TTL_MS);
        return cachedIndex;
    }
    cachedIndex = { smallByLarge, classByIcon };
    cachedAt = Date.now();
    return cachedIndex;
}

const strip = url => (typeof url === "string" && url.startsWith(PREFIX)) ? url.slice(PREFIX.length) : url;

/* docs: raw records straight out of Mongo. Returns the wire format. */
async function packRecords(docs) {
    const { smallByLarge, classByIcon } = await catalogueIndex();
    const table = [];
    // Keyed on the icon URL: FurniIndex's own numeric url id is a PRODUCT id
    // shared by colour variants (1,274 unique across 1,278 rows), so it does
    // not identify a row. The icon does, and unlike className it is present
    // on records scanned before className was passed through at all.
    const seen = new Map();

    const packed = docs.map(doc => {
        const { furni, ...rest } = doc;
        if (!furni) return rest;

        const out = {};
        for (const [image, record] of Object.entries(furni)) {
            const items = ((record && record.items) || []).filter(f => f && !f.hidden);
            if (!items.length) continue;   // a scanned-but-empty room says nothing to a visitor
            out[image] = items.map(f => {
                if (!seen.has(f.icon)) {
                    seen.set(f.icon, table.length);
                    table.push({
                        n: f.name || "",
                        // Stored where a recent scan or a hand-add put it
                        // there, from the catalogue for everything older.
                        c: f.className || classByIcon.get(f.icon) || "",
                        m: f.motto || "",
                        i: strip(f.icon),
                        u: f.url || "",
                        d: f.releaseDate || ""
                    });
                }
                const index = seen.get(f.icon);
                // Small where it is known, large where it isn't, and neither
                // for a hand-added entry with no sprite at all — js/api.js
                // falls back to the icon for that last case.
                const sprite = (f.sprite && smallByLarge.get(f.sprite)) || f.sprite || null;
                return sprite ? [index, strip(sprite)] : [index];
            });
        }
        return Object.keys(out).length ? { ...rest, furni: out } : rest;
    });

    return { v: 2, p: PREFIX, f: table, rooms: packed };
}

module.exports = { packRecords, PREFIX };

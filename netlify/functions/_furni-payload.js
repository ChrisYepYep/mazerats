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
/* Two minutes, not ten (2 Oct 2026, the owner's): the Warren's "Refresh
   now" on the catalogue should reach the furni cards in a few minutes, and
   re-reading it is one small Blobs read. */
const MAP_TTL_MS = 2 * 60 * 1000;
// How long an EMPTY result (the catalogue was unreachable) is held before
// trying again — far shorter than a good one, but not zero.
const FAILED_TTL_MS = 60 * 1000;
// The longest a public request waits for the catalogue before going without.
const CATALOGUE_WAIT_MS = 6000;

async function catalogueIndex() {
    if (cachedIndex && Date.now() - cachedAt < MAP_TTL_MS) return cachedIndex;
    const smallByLarge = new Map();
    const classByIcon = new Map();
    const itemByClass = new Map();
    try {
        /* Capped here as well as inside getCatalogue. That one serves a
           stale copy when a refresh fails, but with no copy at all (a new
           Blobs store, a wiped one) it would walk FurniIndex for as long as
           it takes — and this is the public /rooms and /events, where the
           archive's front page is the thing waiting. Past the cap the maps
           come back empty, exactly as for an outright failure below; the
           walk carries on in the background and stores its result for the
           next request. */
        let timer;
        const cap = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("catalogue timed out")), CATALOGUE_WAIT_MS);
        });
        const pending = getCatalogue();
        pending.catch(() => { /* reported by the race below, if it matters */ });
        const catalogue = await Promise.race([pending, cap]).finally(() => clearTimeout(timer));
        for (const item of catalogue.items || []) {
            if (item.icon && item.className) classByIcon.set(item.icon, item.className);
            if (item.className && !itemByClass.has(item.className)) itemByClass.set(item.className, item);
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
        cachedIndex = { smallByLarge, classByIcon, itemByClass };
        cachedAt = Date.now() - (MAP_TTL_MS - FAILED_TTL_MS);
        return cachedIndex;
    }
    cachedIndex = { smallByLarge, classByIcon, itemByClass };
    cachedAt = Date.now();
    return cachedIndex;
}

const strip = url => (typeof url === "string" && url.startsWith(PREFIX)) ? url.slice(PREFIX.length) : url;

/* FurniIndex's new public API (1 Oct 2026): pictures by classname, at
   https://api.furniindex.com/furni/... The stored records keep the old
   addresses — they are data, and the scan and the Warren's picker still
   write them — and are translated here, on the way out.

   An icon is the furni's own /icon where the new API has one. A sprite is
   the render tools/furni-api-map.js matched to the old view by its pixels,
   since the old r1..r4 are not the game's directions in any fixed order.
   Anything the table doesn't know (a furni scanned since it was built, an
   icon the new API lacks) keeps its old address, which still works, and
   goes out whole rather than as a tail of the new prefix. */
const API_PREFIX = "https://api.furniindex.com/furni/";
let apiMap = null;
try { apiMap = require("./_furni-api-map.json"); } catch (e) { /* no table: everything stays on the old host */ }
/* Without the table, the icons stay on the old host too (2 Oct 2026, night
   scan). They used to switch to /icon by classname regardless, which put
   the furni the table lists as having NO icon there (door0, poster_1000…)
   on a 404 — the opposite of the "falls back to the old host" promised. */
const NO_ICON = new Set((apiMap && apiMap.noIcon) || []);
const apiPath = p => {
    const [cls, ...rest] = String(p).split("/");
    return encodeURIComponent(cls) + "/" + rest.join("/");
};
/* An address already on the new API (a furni hand-added from Habbo's own
   list, see furni-catalogue.js ?unlisted=1, is stored with its whole new
   address) goes as a tail of p like the rest, rather than whole — 33
   characters on each of over a thousand detections (2 Oct 2026). */
const tailOf = url => (typeof url === "string" && url.startsWith(API_PREFIX)) ? url.slice(API_PREFIX.length) : url;

function wireIcon(icon, className) {
    if (apiMap && className && !NO_ICON.has(className)) return encodeURIComponent(className) + "/icon";
    return tailOf(icon || "");
}

/* FURNI THAT GROW (2 Oct 2026, the owner's) are shown fully grown, at the
   stage tools/furni-api-map.js lists in `grown` ([state, rotation]): the
   view a scan matched keeps its rotation and moves to that state, and a
   hand-added furni stored as a bare /small (which the API draws at s0, a
   patch of soil) gets the listed view. */
const GROWN = (apiMap && apiMap.grown) || {};
function grownPath(p, className) {
    const m = /^([^/]+)\/(small|large)(?:\/r(\d+)\/s(\d+))?(?:\/noshadow)?$/.exec(p || "");
    if (!m) return null;
    const cls = decodeURIComponent(m[1]);
    const g = GROWN[cls] || (className && cls === className ? GROWN[className] : null);
    if (!g) return null;
    const rotation = m[3] !== undefined ? m[3] : g[1];
    return `${encodeURIComponent(cls)}/${m[2]}/r${rotation}/s${g[0]}/noshadow`;
}

function wireSprite(sprite, className) {
    const tail = strip(sprite);
    const mapped = tail && apiMap && apiMap.sprites && apiMap.sprites[tail];
    const out = mapped ? apiPath(mapped) + "/noshadow" : tailOf(sprite);
    return (typeof out === "string" && grownPath(out, className)) || out;
}

/* Some furni were stored under Habbo's untranslated text key for a name
   ("furni_fball_light_name") or motto ("hc_arab_snake_desc"): FurniIndex
   lists a few that way, and today's room fills copied them (2 Oct 2026,
   night scan). They go out under the game's own name where
   _habbo-names.json knows it; the file is only read when one turns up. */
let habboNames = null;
const namesOf = () => {
    if (!habboNames) { try { habboNames = require("./_habbo-names.json"); } catch (e) { habboNames = {}; } }
    return habboNames;
};
// A name that is only the furni line itself ("bed_budget_one") counts as a key too.
const realName = (name, cls) => (/_name$/.test(name || "") || (cls && name === cls)) ? (((cls && namesOf()[cls]) || [])[0] || name) : (name || "");
const realMotto = (motto, cls) => /_desc$/.test(motto || "") ? (((cls && namesOf()[cls]) || [])[1] || "") : (motto || "");

/* docs: raw records straight out of Mongo. Returns the wire format. */
async function packRecords(docs) {
    const { smallByLarge, classByIcon, itemByClass } = await catalogueIndex();
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
                    // Stored where a recent scan or a hand-add put it there,
                    // from the catalogue for everything older.
                    const className = f.className || classByIcon.get(f.icon) || "";
                    /* A furni added by hand before FurniIndex listed it (1 Oct
                       2026) is stored with its classname and no page: its link,
                       release date and motto are filled from the catalogue the
                       moment it appears there, with nothing to edit. */
                    /* And ANYTHING a record is missing, listed or not (2 Oct
                       2026, the owner's): its link, release date, motto, and a
                       name that is only Habbo's text key, from the catalogue
                       whenever FurniIndex has them. Pictures already follow
                       the classname (wireIcon, wireSprite). */
                    const listed = className ? itemByClass.get(className) : null;
                    const listedName = listed && listed.name && !/_name$/.test(listed.name) ? listed.name : "";
                    const name = realName(f.name, className);
                    table.push({
                        n: (!name || /_name$/.test(name)) && listedName ? listedName : name,
                        c: className,
                        m: realMotto(f.motto, className) || (listed && realMotto(listed.motto, className)) || "",
                        i: wireIcon(f.icon, className),
                        u: f.url || (listed && listed.url) || "",
                        d: f.releaseDate || (listed && listed.releaseDate) || ""
                    });
                }
                const index = seen.get(f.icon);
                // Small where it is known, large where it isn't, and neither
                // for a hand-added entry with no sprite at all — js/api.js
                // falls back to the icon for that last case.
                const sprite = (f.sprite && smallByLarge.get(f.sprite)) || f.sprite || null;
                return sprite ? [index, wireSprite(sprite, table[index].c)] : [index];
            });
        }
        return Object.keys(out).length ? { ...rest, furni: out } : rest;
    });

    // p is now the new API's prefix; a value that is a whole address (an
    // old one, see wireIcon) is used as it stands — see _unpack in js/api.js.
    return { v: 2, p: API_PREFIX, f: table, rooms: packed };
}

module.exports = { packRecords, PREFIX };

/* FurniIndex's OLD catalogue, frozen (5 Oct 2026, the owner's switch to
   https://api.furniindex.com).

   The catalogue itself now comes from the new API (furni-catalogue.js), but
   three things still need the old one, and none of them can ask the old
   endpoint any more:

     - the 8,571 detections already in the archive. Most of them were stored
       with no className, only the old icon address, and with the LARGE
       sprite the scan matched. _furni-payload.js turns those into a
       classname and the small sprite the card shows — which used to be read
       off the live catalogue's old sprite grids, and the new catalogue has
       none. classByIcon and smallByLarge below are those two maps.
     - the scanner (tools/furni-scan-local.js). Its matcher compares exact
       colours, and the new API's renders are not the old ones pixel for
       pixel: an A/B on sixteen archive rooms (5 Oct 2026) lost 19 of the
       129 finds the old renders made (doors, the Yukka plant, the polyfon
       bar desk…). So for every furni this file holds, the scan keeps
       comparing against the old renders it was tuned on, and records them
       exactly as before — the same name, icon and url, so a rescan still
       recognises the pieces an admin hid (pieceKey in _furni-merge.js).
       See scanCatalogue in _furni-sprites.js.
     - the furni the new API has no page for (30 of these 1,483 on 5 Oct
       2026: 16 it doesn't hold at all — the Telephone Box door0, the
       Comedy Poster, the rainbow plasto set, the Sprinkle-o-Matic… — and
       14 it holds only under a lower-cased classname with no page or date,
       cf_1_coin_bronze, doorb…), which the catalogue keeps offering from
       here, old pictures and all, until FurniIndex lists them.

   The data is _furni-legacy.json, written once from the last cached copy;
   nothing refreshes it. Read on first use only. */

let cache = null;

function load() {
    if (cache) return cache;
    let raw = null;
    try { raw = require("./_furni-legacy.json"); } catch (e) { /* no file: nothing legacy */ }
    const prefix = (raw && raw.prefix) || "";
    const whole = t => (!t ? "" : /^https?:/i.test(t) ? t : prefix + t);
    const items = [];
    const byClass = new Map();
    const classByIcon = new Map();
    const smallByLarge = new Map();
    for (const r of (raw && raw.items) || []) {
        const large = (r.l || []).map(st => st.map(whole));
        const small = r.s
            ? r.s.map(st => st.map(whole))
            : (r.l || []).map(st => st.map(t => whole(String(t).replace(/-lrg\.png$/, "-sml.png"))));
        const item = {
            name: r.n || "", className: r.c || "", motto: r.m || "",
            icon: whole(r.i), url: r.u || "", releaseDate: r.d || "",
            largeImages: large, smallImages: small, legacy: true
        };
        items.push(item);
        if (item.className && !byClass.has(item.className.toLowerCase())) byClass.set(item.className.toLowerCase(), item);
        if (item.icon && item.className) classByIcon.set(item.icon, item.className);
        large.forEach((st, si) => st.forEach((url, ri) => {
            const s = (small[si] || [])[ri];
            if (url && s) smallByLarge.set(url, s);
        }));
    }
    cache = { items, byClass, classByIcon, smallByLarge, fetchedAt: (raw && raw.fetchedAt) || 0 };
    return cache;
}

module.exports = { legacy: load };

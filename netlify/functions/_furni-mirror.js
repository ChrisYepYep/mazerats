/* NOTHING FROM FURNIINDEX'S OLD HOST (5 Oct 2026, the owner's: the old
   host is being switched off). The few furni pictures the new API cannot
   serve — furni it doesn't hold, and the furni it has no page for that the
   catalogue keeps from the frozen old one — were copied onto this site by
   tools/furni-legacy-mirror.js, into assets/img/furni-legacy/ under their
   old filenames; _furni-mirror.json lists them.

   site(url): an address on the old host becomes the site's own copy
   ("/assets/img/furni-legacy/<file>"), or "" if there is no copy (no
   picture is better than a request to a host that is gone; the site
   already treats "" as "no picture"). Anything else comes back as it was.
   Used where pictures leave the server: _furni-payload.js and
   furni-catalogue.js. Stored records keep their old addresses — they are
   data, and the frozen catalogue's lookups key on them. */
const OLD = /^https?:\/\/(?:www\.)?furniindex\.com\/image\//i;
const LOCAL = "/assets/img/furni-legacy/";

let have = null;
function mirrored() {
    if (!have) {
        try { have = new Set(require("./_furni-mirror.json")); } catch (e) { have = new Set(); }
    }
    return have;
}

function site(url) {
    if (typeof url !== "string" || !OLD.test(url)) return url;
    const file = decodeURIComponent(url.split("?")[0].split("/").pop());
    return mirrored().has(file) ? LOCAL + encodeURIComponent(file) : "";
}

module.exports = { site, isOld: url => typeof url === "string" && OLD.test(url) };

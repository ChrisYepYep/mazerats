/* FurniIndex catalogue, proxied and cached.

   The API key never reaches the browser: this runs server-side and reads it
   from FURNIINDEX_API_KEY. They enforce it now — a request without the header
   is a 401, where it used to be served anyway.

   Cached because their endpoint still has no search of its own: filtering to
   "chair" means holding the whole catalogue, and re-fetching all 13 pages for
   every admin keystroke would be absurd — and unkind to them. Nor does it
   sort or filter on anything else; q/search/name/sort/since are all accepted
   and ignored, so every bit of that happens down in the handler here. ~931KB
   raw over 1,278 rows, refreshed once a day.
*/

const { blobStore } = require("./_blobs.js");

const ENDPOINT = "https://furniindex.com/api/mazerats/all";
const PAGE_SIZE = 100;          // their cap; anything larger is ignored
const CACHE_KEY = "catalogue.json";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

async function fetchPage(page) {
    const headers = {};
    if (process.env.FURNIINDEX_API_KEY) {
        headers.Authorization = `Bearer ${process.env.FURNIINDEX_API_KEY}`;
    }
    const res = await fetch(`${ENDPOINT}?page=${page}&limit=${PAGE_SIZE}`, { headers });
    if (res.status === 401) {
        // FurniIndex began requiring the header partway through this being
        // built, so a 401 is nearly always about the key rather than about
        // them. Reports whether this deploy could SEE the variable — the
        // length only, never the value — because "set in Netlify" and
        // "visible to this function" are different things: variables are
        // scoped per deploy context, so one saved for Production alone is
        // absent from a branch deploy or deploy preview.
        const key = process.env.FURNIINDEX_API_KEY;
        if (key) {
            throw new Error(`FurniIndex returned 401 even though a key was sent (${key.length} characters). Check the value is right.`);
        }
        // Lists which FURNI-ish variables this function CAN see, by name
        // only, never a value. A near-miss name and a variable scoped to
        // Builds rather than Functions look identical from in here; this
        // tells the two apart at a glance.
        const seen = Object.keys(process.env).filter(k => /FURNI/i.test(k));
        throw new Error(
            "FurniIndex returned 401 and this function cannot see FURNIINDEX_API_KEY. " +
            (seen.length
                ? `It can see these, so the name may differ: ${seen.join(", ")}.`
                : "It can see no FURNI* variable at all — check the exact name, and that the variable scope includes Functions, not Builds only.")
        );
    }
    if (!res.ok) throw new Error(`FurniIndex page ${page} returned ${res.status}`);
    return res.json();
}

/* Every furni FurniIndex holds.

   On identity: their numeric url id is a PRODUCT id shared by colour
   variants (one id covers both the yellow and the tangerine dining table),
   so it does not identify a row — 1,274 unique urls across 1,278 rows.
   className and id are both unique per row, as is the icon URL. className
   is the useful one of the three: it is Habbo's own name for the furni
   (`anniv_balloongift_2`), stable across their site and ours, where an
   icon URL is only a CDN path that can be rewritten under us. */
async function fetchCatalogue() {
    const first = await fetchPage(1);
    const all = first.results.slice();
    for (let page = 2; page <= first.totalPages; page++) {
        const next = await fetchPage(page);
        all.push(...next.results);
    }
    return {
        fetchedAt: Date.now(),
        total: first.total,
        items: all.map(r => ({
            name: r.name,
            className: r.className || "",
            motto: r.motto || "",
            icon: r.icon,
            url: r.url,
            releaseDate: r.releaseDate || "",
            // Both grids. largeImages is what the scanner compares against;
            // smallImages is what the furni card shows, and the two share a
            // [state][rotation] shape on every row, so a sprite matched in
            // one has an exact counterpart at the same position in the
            // other (see _furni-payload.js).
            largeImages: r.largeImages || [],
            smallImages: r.smallImages || []
        }))
    };
}

async function getCatalogue({ force = false } = {}) {
    const store = blobStore("furni");
    if (!force) {
        const cached = await store.get(CACHE_KEY, { type: "json" }).catch(() => null);
        if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached;
    }
    const fresh = await fetchCatalogue();
    await store.setJSON(CACHE_KEY, fresh);
    return fresh;
}

exports.handler = async (event) => {
    const params = event.queryStringParameters || {};
    try {
        const catalogue = await getCatalogue({ force: params.refresh === "1" });
        const q = (params.q || "").trim().toLowerCase();
        let items = catalogue.items;
        if (q) {
            /* Name OR className, because className is where the THEME lives.

               Habbo's internal name for a furni carries the line it belongs
               to as a prefix — alhambra_stall, alhambra_shelf — while the
               display names for those two are "Bazaar Stall" and "Scholar's
               Bookshelf". Searching names alone therefore finds four of the
               Alhambra line and silently misses the rest, which is exactly
               the case that made this worth changing: someone adding furni
               by hand knows the line they are looking at in-game, not the
               display name of every piece in it.

               Underscores are read as spaces so "alhambra stall" finds
               alhambra_stall — typing the theme and the object is the
               natural thing to try, and it would otherwise match nothing.

               Name matches are listed first. A className-only hit is a
               correct but less direct answer, and the picker shows a capped
               24, so the ones the person most likely meant have to be at the
               top rather than wherever the catalogue happened to order
               them. */
            const named = [];
            const themed = [];
            for (const i of items) {
                if ((i.name || "").toLowerCase().includes(q)) named.push(i);
                else if ((i.className || "").toLowerCase().replace(/_/g, " ").includes(q)) themed.push(i);
            }
            items = named.concat(themed);
        }
        // The sprite grids are wanted by the scanner and by the admin's
        // add-by-hand picker, never by anything else — and they are by far
        // the biggest part of the payload.
        if (params.sprites !== "1") items = items.map(({ largeImages, smallImages, ...rest }) => rest);
        return json(200, {
            total: catalogue.total,
            fetchedAt: catalogue.fetchedAt,
            count: items.length,
            items: params.limit ? items.slice(0, Number(params.limit)) : items
        });
    } catch (err) {
        return json(502, { error: err.message });
    }
};

module.exports.getCatalogue = getCatalogue;

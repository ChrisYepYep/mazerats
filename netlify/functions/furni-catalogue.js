/* FurniIndex catalogue, proxied and cached.

   The API key never reaches the browser: this runs server-side and reads it
   from FURNIINDEX_API_KEY. (As of writing their endpoint returns identical
   data with no key at all — worth them knowing — but the key is sent anyway
   so nothing breaks when they enforce it.)

   Cached because their endpoint has no search: filtering to "chair" means
   holding the whole catalogue, and re-fetching all 13 pages for every admin
   keystroke would be absurd — and unkind to them. The whole thing is ~557KB
   raw, ~213KB trimmed to what a picker needs, refreshed once a day.
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

/* Every furni FurniIndex holds. The icon URL is the identity: their own
   numeric url id is a PRODUCT id shared by colour variants (653 unique ids
   across 1263 rows — one id covers both the yellow and the tangerine dining
   table), whereas the icon is unique to every row. */
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
            motto: r.motto || "",
            icon: r.icon,
            url: r.url,
            releaseDate: r.releaseDate || "",
            largeImages: r.largeImages || []
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
        if (q) items = items.filter(i => i.name.toLowerCase().includes(q));
        // largeImages is only wanted by the scanner, never by a picker — it
        // is by far the biggest part of the payload.
        if (params.sprites !== "1") items = items.map(({ largeImages, ...rest }) => rest);
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

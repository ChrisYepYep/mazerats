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

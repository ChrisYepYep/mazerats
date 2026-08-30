/* Cache headers and compression for the two big public GETs (rooms, events).

   Neither had any caching at all: every visitor's first paint went all the
   way to Mongo and pulled the whole archive back uncompressed.

   The CDN header and the browser header say different things on purpose.
   The browser is told to revalidate every time, so an admin who has just
   saved something and reloads sees it. The CDN is told it may serve its copy
   for a minute, and may keep serving a stale copy for a day WHILE it fetches
   a fresh one behind the scenes (stale-while-revalidate). That combination
   means visitors essentially always get an edge hit, an edit is public
   within the minute, and a database outage shows the archive rather than an
   error for a whole day after it starts.

   No purge-on-write, deliberately: it would need a Netlify API token and a
   fifth dependency, to buy back a staleness window of sixty seconds on a
   site one person edits. The admin page sidesteps the window entirely by
   asking for ?full=1, which is never cached. */

const zlib = require("zlib");

const CDN_CACHE = "public, s-maxage=60, stale-while-revalidate=86400";
// max-age=0 rather than no-store: the browser keeps the copy and revalidates,
// so an unchanged archive comes back as a 304 with no body at all.
const BROWSER_CACHE = "public, max-age=0, must-revalidate";

// Below this, compressing costs more than it saves.
const MIN_COMPRESS_BYTES = 1024;

function acceptsGzip(event) {
    const headers = event.headers || {};
    const accept = headers["accept-encoding"] || headers["Accept-Encoding"] || "";
    return /\bgzip\b/i.test(accept);
}

/* A cacheable JSON response, gzipped where the caller can take it.

   Netlify's edge compresses function responses itself, but only when the
   function did not already set Content-Encoding — and doing it here means
   the saving is real regardless of what any layer in front happens to do,
   including `netlify dev` locally, which does not compress at all. */
function cachedJson(event, data, { cache = true } = {}) {
    const body = JSON.stringify(data);
    const headers = {
        "Content-Type": "application/json",
        "Cache-Control": cache ? BROWSER_CACHE : "no-store",
        // Compressed and uncompressed copies of the same URL must not be
        // served to each other's clients.
        "Vary": "Accept-Encoding"
    };
    if (cache) headers["Netlify-CDN-Cache-Control"] = CDN_CACHE;

    if (acceptsGzip(event) && Buffer.byteLength(body) >= MIN_COMPRESS_BYTES) {
        const zipped = zlib.gzipSync(Buffer.from(body));
        return {
            statusCode: 200,
            headers: { ...headers, "Content-Encoding": "gzip" },
            body: zipped.toString("base64"),
            isBase64Encoded: true
        };
    }
    return { statusCode: 200, headers, body };
}

module.exports = { cachedJson, CDN_CACHE, BROWSER_CACHE };

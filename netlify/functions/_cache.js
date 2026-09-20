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
const { SECURITY_HEADERS } = require("./_headers");

/* `durable` is not decoration — without it the durable cache is never used.

   Netlify has two layers: a per-node edge cache, and a durable cache shared
   across nodes. The edge one needs nothing but an s-maxage, and it was
   working; the durable one is opt-in and bypasses unless this directive asks
   for it by name. Measured on production before the change: five rapid
   requests to /rooms returned `"Netlify Durable"; fwd=bypass` four times, so
   four of five visitors landed on a node with a cold edge cache and paid for
   a full function run and a MongoDB round trip to fetch data that had just
   been fetched for somebody else.

   That is also what was putting the archive behind the offline fallback — a
   cold start measured 5.3s against a 6s client timeout (see api.js), and the
   reason those cold starts were so common is right here. */
const CDN_CACHE = "public, durable, s-maxage=60, stale-while-revalidate=86400";
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

/* A shorter policy, for the one read that decides whether the site is open.

   /settings is asked for on every page load of every page, which makes it
   the busiest endpoint here by a wide margin and the obvious thing to put
   behind the edge. But it is also the gate: landingState is what opens and
   closes the archive, so however long the edge holds a copy is however long
   the site can be in the wrong state.

   Twenty seconds, and a deliberately SHORT stale window — the long
   stale-while-revalidate that suits the archive would mean a "coming soon"
   answer could still be served the better part of a day after the site was
   opened, which is the one failure worth avoiding here. Twenty on, sixty
   stale: switching the site live takes effect within a minute or so, and in
   the meantime the landing page's countdown is polling every twenty seconds
   anyway and will reload itself as soon as it sees the change.

   Both directions are recoverable and neither is dangerous: a stale gated
   answer keeps a live site shut a moment longer, a stale open answer keeps
   an open site open a moment longer. What it buys is that a launch-day
   crowd of a thousand first page loads becomes a handful of function
   invocations rather than a thousand. */
const GATE_CDN_CACHE = "public, durable, s-maxage=20, stale-while-revalidate=60";

/* And a short one for a public leaderboard.

   The daily boards are the same answer for everybody — the GET reads no
   session and returns no caller-specific row — but they were `no-store`,
   so a crowd all opening the results panel after the day's puzzle meant
   one function run and eight Mongo queries EACH. It is the most expensive
   read on the site per request and it was the only uncached one left.

   Fifteen seconds, with no stale window. A leaderboard is a thing people
   watch, and fifteen seconds is short enough that a score appears while
   somebody is still looking at the board that was missing it; the missing
   stale-while-revalidate is deliberate for the same reason, since a board
   is exactly the thing where serving a known-old copy to save a round trip
   is the wrong call.

   NOT FOR ff-scores, which returns the caller's own row and their signed-in
   name — a shared cache would hand one player's identity to the next. That
   one stays no-store, and the difference between the two is worth knowing
   before reaching for this constant again. */
const BOARD_CDN_CACHE = "public, durable, s-maxage=15";

/* A cacheable JSON response, gzipped where the caller can take it.

   Netlify's edge compresses function responses itself, but only when the
   function did not already set Content-Encoding — and doing it here means
   the saving is real regardless of what any layer in front happens to do,
   including `netlify dev` locally, which does not compress at all.

   `cdn` picks the edge policy: the archive's long one by default, or
   GATE_CDN_CACHE above for /settings. */
function cachedJson(event, data, { cache = true, cdn = CDN_CACHE } = {}) {
    const body = JSON.stringify(data);
    /* SECURITY_HEADERS first, then this function's own on top. Every cached
       read on the site returns through here — rooms, events, contributors —
       so a response built from scratch in this helper was the one path that
       still went out bare after every handler had been given them. */
    const headers = {
        ...SECURITY_HEADERS,
        "Cache-Control": cache ? BROWSER_CACHE : "no-store",
        // Compressed and uncompressed copies of the same URL must not be
        // served to each other's clients.
        "Vary": "Accept-Encoding"
    };
    if (cache) headers["Netlify-CDN-Cache-Control"] = cdn;

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

module.exports = { cachedJson, CDN_CACHE, GATE_CDN_CACHE, BOARD_CDN_CACHE, BROWSER_CACHE };

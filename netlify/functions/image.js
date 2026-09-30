/* /.netlify/functions/image — serves images uploaded via upload.js out of
   Netlify Blobs. Public (the site needs to display them to every visitor). */
const { imagesStore } = require("./_images");
const { headersFor } = require("./_headers");
const { hasAccount } = require("./_auth");
const { isSafeKey } = require("./_keys");

/* Keys under tips/ are pictures sent in by the public and not yet looked at
   by anybody. Until an admin has approved one and it has been given a key
   of its own, it is not the site's to show: served openly, this endpoint
   would be free hosting for whatever a stranger chose to upload, on the
   site's own domain. So these need an admin token, and are never cached by
   anyone — not the browser, and above all not the CDN, which would
   otherwise hand the copy it made for the admin to the next person to ask. */
/* entries/ is the same kind of thing (30 Sept 2026): the pictures sent with
   the console's Event Submission (netlify/functions/event-entries.js), read
   only by the admins judging them. */
const PRIVATE_PREFIXES = ["tips/", "entries/"];
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

/* How long a public image lives in caches — and why the edge is told less
   than the browser.

   This used to be `public, max-age=31536000, immutable` and nothing else,
   which Netlify's edge honours as its own lifetime too. The keys are
   timestamped and never rewritten, so as far as FRESHNESS goes that was
   right — but a delete never took effect: the edge kept serving the copy
   it had for a year, so a picture removed because it should not be public
   (a wrong upload, somebody's face, a request to take it down) went on
   being public at the same address.

   The edge now gets its own, much shorter life via Netlify-CDN-Cache-
   Control, which it obeys in place of Cache-Control and does not pass on to
   the browser: an hour fresh, then served stale for up to a day while it
   re-asks in the background. A deleted blob answers 404 with no-store, so
   the first request after the hour replaces the cached copy and the image
   is gone from the site within about an hour of the delete.

   Why not a cache tag and a purge on delete: purging needs @netlify/
   functions' purgeCache and a purge token, neither of which this site has,
   and an hour is fine for a takedown on a site this size.

   The browser keeps a week, not a year, and no `immutable`. Its copy is
   only ever seen again by the one person who already saw it, and only at
   an address the site no longer links to, so it can afford to be long —
   just not so long that it outlives any reason to keep it. */
const PUBLIC_IMAGE_HEADERS = {
    "Cache-Control": "public, max-age=604800",
    "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
};

const refuse = (statusCode, body) => ({
    statusCode,
    headers: headersFor("text/plain; charset=utf-8", { "Cache-Control": "no-store" }),
    body
});

exports.handler = async (event) => {
    // Through refuse, so this answer carries the security headers too.
    if (event.httpMethod !== "GET") return refuse(405, "Method not allowed");

    const key = (event.queryStringParameters || {}).key;
    if (!key) return refuse(400, "Missing key");
    /* The tips/ check below is a prefix test, and it is only sound if the key
       the store fetches is the key that was tested. It was not: the store
       puts the key into a URL, which resolves "./tips/x" and "%2e/tips/x" to
       "tips/x", so the old blacklist (no "..", no leading "/") let anyone
       read unreviewed uploads. isSafeKey is a strict whitelist; see _keys.js. */
    if (!isSafeKey(key)) return refuse(400, "Invalid key");

    const isPrivate = PRIVATE_PREFIXES.some(p => key.startsWith(p));
    /* hasAccount rather than isAuthorized: a token outliving its account
       (deleted, or its password reset) must not keep reading unreviewed
       uploads. It costs one indexed lookup, paid only on tips/ keys — which
       only the admin page ever asks for — so the public image path never
       touches the database. */
    if (isPrivate) {
        /* hasAccount throws when the lookup itself cannot be made (see
           lookUpRole in _auth.js): that is "try again", not "not found". */
        let ok;
        try {
            ok = await hasAccount(event);
        } catch (e) {
            return refuse(503, "Image unavailable");
        }
        if (!ok) return refuse(404, "Not found");
    }

    const store = imagesStore();
    let result;
    try {
        result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    } catch (e) {
        console.error("image: read failed for", key, e.message);
        return refuse(503, "Image unavailable");
    }
    if (!result) return refuse(404, "Not found");

    /* The Content-Type comes out of the blob's stored metadata, which is to
       say out of whatever upload.js wrote when the file arrived. That is a
       narrow list — PNG, JPEG, GIF, WebP, enforced there — so this cannot
       currently serve anything a browser would treat as a document.

       `nosniff` (and the rest, via headersFor) is the guard for the day that
       stops being true: without it a browser is free to disregard the type
       above and decide for itself what the bytes are, which for a file
       somebody uploaded and this function serves from the site's OWN origin
       is the difference between a picture and a script. The [[headers]] block
       in netlify.toml does not reach function responses — checked against
       production — so it has to be said here. */
    const contentType = (result.metadata && result.metadata.contentType) || "application/octet-stream";
    return {
        statusCode: 200,
        headers: headersFor(contentType, isPrivate ? PRIVATE_HEADERS : PUBLIC_IMAGE_HEADERS),
        body: Buffer.from(result.data).toString("base64"),
        isBase64Encoded: true
    };
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers — these bytes included — is
   unchanged. */
exports.handler = require("./_errors").withErrorReporting("image", exports.handler);

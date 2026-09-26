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
const PRIVATE_PREFIX = "tips/";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

const refuse = (statusCode, body) => ({
    statusCode,
    headers: headersFor("text/plain; charset=utf-8", { "Cache-Control": "no-store" }),
    body
});

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") {
        return { statusCode: 405, body: "Method not allowed" };
    }

    const key = (event.queryStringParameters || {}).key;
    if (!key) return refuse(400, "Missing key");
    /* The tips/ check below is a prefix test, and it is only sound if the key
       the store fetches is the key that was tested. It was not: the store
       puts the key into a URL, which resolves "./tips/x" and "%2e/tips/x" to
       "tips/x", so the old blacklist (no "..", no leading "/") let anyone
       read unreviewed uploads. isSafeKey is a strict whitelist; see _keys.js. */
    if (!isSafeKey(key)) return refuse(400, "Invalid key");

    const isPrivate = key.startsWith(PRIVATE_PREFIX);
    /* hasAccount rather than isAuthorized: a token outliving its account
       (deleted, or its password reset) must not keep reading unreviewed
       uploads. It costs one indexed lookup, paid only on tips/ keys — which
       only the admin page ever asks for — so the public image path never
       touches the database. */
    if (isPrivate && !(await hasAccount(event))) return refuse(404, "Not found");

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
        headers: headersFor(contentType, isPrivate ? PRIVATE_HEADERS : {
            "Cache-Control": "public, max-age=31536000, immutable"
        }),
        body: Buffer.from(result.data).toString("base64"),
        isBase64Encoded: true
    };
};

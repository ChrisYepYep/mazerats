/* /.netlify/functions/image — serves images uploaded via upload.js out of
   Netlify Blobs. Public (the site needs to display them to every visitor). */
const { imagesStore } = require("./_images");
const { headersFor } = require("./_headers");

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") {
        return { statusCode: 405, body: "Method not allowed" };
    }

    const key = (event.queryStringParameters || {}).key;
    if (!key) return { statusCode: 400, body: "Missing key" };

    const store = imagesStore();
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!result) return { statusCode: 404, body: "Not found" };

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
        headers: headersFor(contentType, {
            "Cache-Control": "public, max-age=31536000, immutable"
        }),
        body: Buffer.from(result.data).toString("base64"),
        isBase64Encoded: true
    };
};

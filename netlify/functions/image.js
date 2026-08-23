/* /.netlify/functions/image — serves images uploaded via upload.js out of
   Netlify Blobs. Public (the site needs to display them to every visitor). */
const { imagesStore } = require("./_images");

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") {
        return { statusCode: 405, body: "Method not allowed" };
    }

    const key = (event.queryStringParameters || {}).key;
    if (!key) return { statusCode: 400, body: "Missing key" };

    const store = imagesStore();
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!result) return { statusCode: 404, body: "Not found" };

    const contentType = (result.metadata && result.metadata.contentType) || "application/octet-stream";
    return {
        statusCode: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable"
        },
        body: Buffer.from(result.data).toString("base64"),
        isBase64Encoded: true
    };
};

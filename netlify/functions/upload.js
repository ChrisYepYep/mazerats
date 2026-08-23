/* /.netlify/functions/upload — stores images (maze thumbnails and
   room-by-room gallery screenshots) in Netlify Blobs, gated by the same
   x-admin-token used by rooms.js/events.js. Images are served back out
   through image.js. */
const { isAuthorized, UNAUTHORIZED } = require("./_auth");
const { imagesStore } = require("./_images");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

const MAX_BYTES = 4 * 1024 * 1024;
const EXT_BY_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp"
};

function slugify(text) {
    return (text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "image";
}

exports.handler = async (event) => {
    if (!isAuthorized(event)) return UNAUTHORIZED;

    const store = imagesStore();

    if (event.httpMethod === "POST") {
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }

        const { prefix, filename, dataUrl } = body;
        if (!prefix || !dataUrl) return json(400, { error: "Missing prefix or image data" });

        const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
        if (!match) return json(400, { error: "Expected a base64 image data URL" });
        const [, mimeType, base64] = match;
        const ext = EXT_BY_MIME[mimeType];
        if (!ext) return json(400, { error: "Unsupported image type — use PNG, JPG, GIF, or WebP" });

        const buffer = Buffer.from(base64, "base64");
        if (buffer.length > MAX_BYTES) return json(400, { error: "Image too large — keep uploads under 4MB" });

        const key = `rooms/${slugify(prefix)}/${Date.now()}-${slugify(filename || "image")}.${ext}`;
        await store.set(key, buffer, { metadata: { contentType: mimeType } });

        return json(201, { key, url: `/.netlify/functions/image?key=${encodeURIComponent(key)}` });
    }

    if (event.httpMethod === "DELETE") {
        const key = (event.queryStringParameters || {}).key;
        if (!key) return json(400, { error: "Missing key" });
        await store.delete(key);
        return json(200, { deleted: key });
    }

    return json(405, { error: "Method not allowed" });
};

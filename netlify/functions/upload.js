/* /.netlify/functions/upload — stores images (maze thumbnails and
   room-by-room gallery screenshots) in Netlify Blobs, gated by the same
   x-admin-token used by rooms.js/events.js. Images are served back out
   through image.js. */
const { isAuthorized, canWrite, refuseWrite, UNAUTHORIZED } = require("./_auth");
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

/* Every uploaded image lives under a top-level folder in the blob store,
   and that folder is also what decides who may write it. "rooms/" is the
   archive — maze and event pictures — and needs the "site" scope; "wizard/"
   is the Hogwarts map and needs the "wizard" one. See WRITE_SCOPES in
   _auth.js.

   Written as a table rather than as a string comparison at each call site
   because both halves of this file need the same answer from different
   starting points: a POST knows the folder it is about to write, a DELETE
   only has a finished key to read it off. An unrecognised folder is not
   defaulted to anything — a request naming one is refused outright, so a
   new folder cannot arrive without a decision about who owns it. */
const FOLDER_SCOPES = { rooms: "site", wizard: "wizard" };
const DEFAULT_FOLDER = "rooms";

function folderOfKey(key) {
    const slash = String(key || "").indexOf("/");
    return slash === -1 ? "" : key.slice(0, slash);
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

        // Which folder, and therefore which scope. Absent means "rooms", so
        // every caller written before folders existed is unchanged.
        const folder = body.folder || DEFAULT_FOLDER;
        const scope = FOLDER_SCOPES[folder];
        if (!scope) return json(400, { error: "Unknown image folder" });
        // canWrite, not isAuthorized: a viewer is a real logged-in account and
        // passes isAuthorized quite correctly — it just isn't allowed to change
        // anything. See _auth.js.
        if (!(await canWrite(event, scope))) return await refuseWrite(event);

        const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
        if (!match) return json(400, { error: "Expected a base64 image data URL" });
        const [, mimeType, base64] = match;
        const ext = EXT_BY_MIME[mimeType];
        if (!ext) return json(400, { error: "Unsupported image type — use PNG, JPG, GIF, or WebP" });

        const buffer = Buffer.from(base64, "base64");
        if (buffer.length > MAX_BYTES) return json(400, { error: "Image too large — keep uploads under 4MB" });

        const key = `${folder}/${slugify(prefix)}/${Date.now()}-${slugify(filename || "image")}.${ext}`;
        await store.set(key, buffer, { metadata: { contentType: mimeType } });

        // Not percent-encoded here: slugify() guarantees the key only ever
        // contains [a-z0-9-/.], and every place that displays this URL
        // wraps it in encodeURI() at render time — pre-encoding it here too
        // would double-encode it and 404.
        return json(201, { key, url: `/.netlify/functions/image?key=${key}` });
    }

    if (event.httpMethod === "DELETE") {
        const key = (event.queryStringParameters || {}).key;
        if (!key) return json(400, { error: "Missing key" });
        // The folder the key names decides who may delete it, exactly as it
        // decided who could write it. A key naming no known folder — or no
        // folder at all — is refused rather than swept up by a default,
        // since a delete is the one direction where guessing is unrecoverable.
        const scope = FOLDER_SCOPES[folderOfKey(key)];
        if (!scope) return json(400, { error: "Unknown image folder" });
        if (!(await canWrite(event, scope))) return await refuseWrite(event);
        await store.delete(key);
        return json(200, { deleted: key });
    }

    return json(405, { error: "Method not allowed" });
};

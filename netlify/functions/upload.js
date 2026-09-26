/* /.netlify/functions/upload — stores images (maze thumbnails and
   room-by-room gallery screenshots) in Netlify Blobs, gated by the same
   x-admin-token used by rooms.js/events.js. Images are served back out
   through image.js. */
const { isAuthorized, canWrite, refuseWrite, UNAUTHORIZED } = require("./_auth");
const { imagesStore } = require("./_images");
const { SECURITY_HEADERS } = require("./_headers");
const { isSafeKey } = require("./_keys");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
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
   is the atlas and needs the "wizard" one. See WRITE_SCOPES in
   _auth.js.

   Written as a table rather than as a string comparison at each call site
   because both halves of this file need the same answer from different
   starting points: a POST knows the folder it is about to write, a DELETE
   only has a finished key to read it off. An unrecognised folder is not
   defaulted to anything — a request naming one is refused outright, so a
   new folder cannot arrive without a decision about who owns it. */
// "guides/" holds the Guides section's pictures (js/admin-guides.js); they
// are part of the site's content like the archive's, so the same scope.
const FOLDER_SCOPES = { rooms: "site", wizard: "wizard", guides: "site" };
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

        // `null` parses, and destructuring it throws.
        if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });
        const { prefix, filename, dataUrl } = body;
        if (!prefix || !dataUrl) return json(400, { error: "Missing prefix or image data" });
        /* Text, all three. slugify and the data-URL test below call string
           methods on them, so a prefix sent as a number or an object was an
           unhandled throw — a 500 with a stack — rather than a refusal. A
           filename is optional, but if it is there it is a string too. */
        if (typeof prefix !== "string" || typeof dataUrl !== "string" ||
            (filename !== undefined && filename !== null && typeof filename !== "string")) {
            return json(400, { error: "Invalid request body" });
        }

        // Which folder, and therefore which scope. Absent means "rooms", so
        // every caller written before folders existed is unchanged.
        const folder = body.folder || DEFAULT_FOLDER;
        // An own key only: "constructor" or "toString" would otherwise find
        // a function on the prototype, pass as a scope, and name a folder.
        const scope = typeof folder === "string" && Object.prototype.hasOwnProperty.call(FOLDER_SCOPES, folder)
            ? FOLDER_SCOPES[folder] : null;
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
        // Validated BEFORE the folder is read off it. folderOfKey trusts the
        // text before the first "/", and the store resolves the key as a URL
        // path, so "wizard/../rooms/<maze>/<file>.png" was a wizard-scope
        // delete of an archive picture. See _keys.js.
        if (!isSafeKey(key)) return json(400, { error: "Invalid key" });
        // The folder the key names decides who may delete it, exactly as it
        // decided who could write it. A key naming no known folder — or no
        // folder at all — is refused rather than swept up by a default,
        // since a delete is the one direction where guessing is unrecoverable.
        // An own key only, as for the POST above.
        const keyFolder = folderOfKey(key);
        const scope = Object.prototype.hasOwnProperty.call(FOLDER_SCOPES, keyFolder) ? FOLDER_SCOPES[keyFolder] : null;
        if (!scope) return json(400, { error: "Unknown image folder" });
        if (!(await canWrite(event, scope))) return await refuseWrite(event);
        await store.delete(key);
        return json(200, { deleted: key });
    }

    return json(405, { error: "Method not allowed" });
};

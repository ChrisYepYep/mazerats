/* /.netlify/functions/upload — stores images (maze thumbnails and
   room-by-room gallery screenshots) in Netlify Blobs, gated by the same
   x-admin-token used by rooms.js/events.js. Images are served back out
   through image.js. */
const { isAuthorized, canWrite, refuseWrite, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { getDb } = require("./_db");
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

/* Each type's opening bytes — the same signatures dead-end-leads.js sniffs
   its visitors' screenshots by. */
const SIGNATURES = {
    "image/png": b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    "image/jpeg": b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    "image/gif": b => b.length > 6 && b.toString("ascii", 0, 4) === "GIF8",
    "image/webp": b => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"
};
const sniffImage = buffer => Object.keys(SIGNATURES).find(type => SIGNATURES[type](buffer)) || null;

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
// "news/" holds What's New posts' pictures (js/admin-whats-new.js; 4 Oct 2026),
// site content like the rest.
const FOLDER_SCOPES = { rooms: "site", wizard: "wizard", guides: "site", news: "site" };
const DEFAULT_FOLDER = "rooms";

function folderOfKey(key) {
    const slash = String(key || "").indexOf("/");
    return slash === -1 ? "" : key.slice(0, slash);
}

/* ---- A PICTURE STILL IN USE IS NOT DELETED.

   The admin pages decide what to delete from the records they happen to
   have loaded (see imageKeysOf and deleteImageSafe in js/admin.js), and a
   picture can be pointed at from places those pages never load: a
   thumbnail set by hand to another maze's picture, a Missing Pieces copy
   waiting to be added, the Guess the Maze round being played right now.
   A delete is the one write here that cannot be taken back, so the server
   checks for itself, whatever the page thought.

   Every stored reference is the same string upload.js hands back —
   "/.netlify/functions/image?key=<key>", the key never percent-encoded (see
   the POST below) — so the test is a match on that string, anchored at the
   key's end so "…/1.png" is not found inside "…/1.png2". The pattern also
   accepts the key percent-encoded and the URL made absolute, which nothing
   writes today and a pasted address one day might; a false "in use" costs
   an orphaned file, a false "not in use" costs a broken page.

   One query per collection, each an $or over every field that can hold a
   picture, all side by side:
     rooms, events   thumb; entrance, finish, gallery[] and relatedImages[],
                     each as a bare string (the oldest records) or as
                     { image }, and every oldVersions[] under them, again
                     either shape — Mongo's dotted paths reach through arrays;
     guides          thumb, sections[].image;
     daily_deals     today's and yesterday's (the day still being scored),
                     which hold the raw gallery references they were dealt
                     from — Odd One Out's rounds[].tiles[].image, Guess the
                     Maze's rounds[].image;
     dead_end_leads  `promoted`, the copies an accepted lead made;
     wizard          a layer's or room's image and thumb, a room's
                     labelImage, the map's background, detail and footprint.
   A field added to any of these later has to be added here too. */
const IMAGE_URL_PREFIX = "/.netlify/functions/image?key=";

const PICTURE_FIELDS = (() => {
    const either = (base) => [base, `${base}.image`, `${base}.oldVersions`, `${base}.oldVersions.image`];
    return {
        rooms: ["thumb", ...either("entrance"), ...either("finish"), ...either("gallery"),
            ...either("relatedImages"), "oldVersions", "oldVersions.image"],
        guides: ["thumb", "sections.image"],
        dead_end_leads: ["promoted"],
        wizard: ["image", "thumb", "labelImage", "background", "backgroundDetail", "footprint"],
        // A What's New news post's picture (whats-new.js; 4 Oct 2026).
        whats_new: ["image"]
    };
})();

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function referencePattern(key) {
    const forms = [key, encodeURIComponent(key)].map(escapeRegex);
    return new RegExp(`${escapeRegex(IMAGE_URL_PREFIX)}(?:${forms.join("|")})(?:[&#]|$)`);
}

async function isInUse(db, key) {
    const rx = referencePattern(key);
    const anyOf = (fields) => ({ $or: fields.map(f => ({ [f]: rx })) });
    const hit = (name, filter) => db.collection(name).countDocuments(filter, { limit: 1 }).then(n => n > 0);
    const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
    const found = await Promise.all([
        hit("rooms", anyOf(PICTURE_FIELDS.rooms)),
        hit("events", anyOf(PICTURE_FIELDS.rooms)),
        hit("guides", anyOf(PICTURE_FIELDS.guides)),
        hit("daily_deals", { day: { $in: [day(0), day(1)] }, ...anyOf(["rounds.image", "rounds.tiles.image"]) }),
        hit("dead_end_leads", anyOf(PICTURE_FIELDS.dead_end_leads)),
        hit("wizard", anyOf(PICTURE_FIELDS.wizard)),
        hit("whats_new", anyOf(PICTURE_FIELDS.whats_new))
    ]);
    return found.some(Boolean);
}

const IN_USE = () => json(409, { error: "That picture is still in use.", inUse: true });

/* The whole handler inside one try. The blob write and delete had nothing
   around them, so a Blobs outage answered with Lambda's errorType and stack
   trace in the body; and canWrite now throws when the account lookup cannot
   be made (lookUpRole in _auth.js), which has to reach the admin page as a
   503 it retries, not the 401 that signs it out mid-upload. */
exports.handler = async (event) => {
    try {
        return await handle(event);
    } catch (e) {
        console.error("upload: request failed", e);
        /* Only the tagged lookup failure is an outage to retry; anything
           else is a fault, and answering it as "unavailable" hid it. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return json(500, { error: "The upload could not be completed." });
    }
};

async function handle(event) {
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

        /* No label at all is let through to the sniff below (30 Sept 2026).
           A file whose extension Windows has no type registered for (a .webp
           on some machines, a .PNG renamed by a tool) reaches the browser
           with an empty file.type, and FileReader then labels it
           application/octet-stream — so a real picture was refused here
           before its bytes were ever looked at, which is the one thing the
           sniff was meant to end. A label that names some OTHER type is
           still refused as before. */
        const match = /^data:([^;,]*);base64,(.+)$/.exec(dataUrl);
        if (!match) return json(400, { error: "Expected a base64 image data URL" });
        const [, claimed, base64] = match;
        const unlabelled = !claimed || claimed === "application/octet-stream";
        if (!unlabelled && !EXT_BY_MIME[claimed]) return json(400, { error: "Unsupported image type — use PNG, JPG, GIF, or WebP" });

        const buffer = Buffer.from(base64, "base64");
        if (buffer.length > MAX_BYTES) return json(400, { error: "Image too large — keep uploads under 4MB" });
        /* The bytes decide what the file is, not the label (30 Sept 2026).
           The type above is only the caller's word — the browser's guess
           from the file's extension — so any file at all could be stored
           and served from the site's own origin under an image address, as
           long as it was called image/png. dead-end-leads.js has always
           sniffed its uploads this way. A real picture with the wrong
           extension (a JPEG saved as .png) is stored as what it really is
           rather than refused. */
        const mimeType = sniffImage(buffer);
        if (!mimeType) return json(400, { error: "That file isn't a PNG, JPG, GIF or WebP image." });
        const ext = EXT_BY_MIME[mimeType];

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
        /* See isInUse. A database that cannot answer is not a "no": the
           delete waits, as a 503, rather than guessing in the one direction
           that cannot be undone. The admin pages send these deletes in the
           background and let a failure go, so the file simply stays. */
        let inUse;
        try {
            inUse = await isInUse(await getDb(), key);
        } catch (e) {
            console.error("upload: could not check whether a picture is in use", e);
            return json(503, { error: "Couldn't check whether that picture is in use. It was not deleted." });
        }
        if (inUse) return IN_USE();
        await store.delete(key);
        return json(200, { deleted: key });
    }

    return json(405, { error: "Method not allowed" });
}

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("upload", exports.handler);

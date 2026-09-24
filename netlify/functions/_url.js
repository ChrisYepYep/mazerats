/* Turning a stored image path into something fetchable.

   Image paths in the database come in two shapes, and the difference is
   invisible until something concatenates them: most start with a slash
   ("/.netlify/functions/image?key=…"), but The Little Maze's 101 images are
   plain relative paths ("assets/rooms/the-little-maze/tlm_entrance.png").
   Gluing a site origin onto the second kind without a separator produces
   "https://mazerats.netassets/…", which fails to resolve — every one of that
   maze's images, and only that maze's.

   One copy, so the next thing that needs to fetch a room image cannot
   reintroduce it. */

function imageUrl(siteUrl, imagePath) {
    if (/^https?:/i.test(imagePath)) return imagePath;
    const joined = `${String(siteUrl).replace(/\/+$/, "")}/${String(imagePath).replace(/^\/+/, "")}`;
    // 101 of the stored paths carry spaces ("Room 065.png"), which fetch
    // rejects outright. Only the characters that actually break a URL are
    // escaped, one at a time: encodeURI would do the spaces but also escapes
    // %, so a path already containing %20 would come back as %2520.
    return joined.replace(/[ "'<>`{}|\\^]/g, c => encodeURIComponent(c));
}

/* ---------- what a saved record may point at ----------

   The archive's pages build markup out of these fields — an href from a
   habboLink, a src from a thumbnail — and a record is written by whatever
   the admin form (or anybody holding a token) sends. The escaping on the
   page is the first line; these are the second, so a value that could only
   ever be an attack never reaches the database in the first place. */

// http(s) or nothing. For links that leave the site.
function httpUrlOrEmpty(value) {
    if (typeof value !== "string") return "";
    const v = value.trim();
    if (!v) return "";
    try {
        const u = new URL(v);
        return (u.protocol === "http:" || u.protocol === "https:") ? v : "";
    } catch (e) {
        return "";
    }
}

/* An image reference: a site path ("/.netlify/functions/image?key=…", or
   the relative "assets/rooms/…" The Little Maze uses) or an http(s) URL.
   Spaces are allowed because 101 real paths have them (see above); quotes,
   angle brackets and backticks are not, and neither is any scheme other
   than http(s) — javascript: and data: in a src are the whole reason this
   exists. */
function safeImageRef(value) {
    if (typeof value !== "string") return "";
    const v = value.trim();
    if (!v || /[<>"'`\\\u0000-\u001f]/.test(v)) return "";
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v);
    if (scheme) return /^https?$/i.test(scheme[1]) ? v : "";
    // "//evil.example/x.png" is a protocol-relative URL, not a site path.
    if (v.startsWith("//")) return "";
    return v;
}

/* Every image reference inside a record's picture fields, cleaned in place:
   the thumbnail, the entrance and finish, the gallery and related images,
   and the old versions each of those keeps. Walks by key name rather than
   by a fixed shape, so a picture field added later is covered without
   anybody remembering to come back here. Depth-capped: these are three
   levels deep at most. */
const IMAGE_KEYS = new Set(["thumb", "image"]);
const PICTURE_FIELDS = ["thumb", "entrance", "finish", "gallery", "relatedImages"];

function cleanImageRefs(record) {
    const walk = (node, depth) => {
        if (!node || typeof node !== "object" || depth > 6) return;
        Object.keys(node).forEach(k => {
            const v = node[k];
            if (IMAGE_KEYS.has(k) && typeof v === "string") node[k] = safeImageRef(v);
            else if (v && typeof v === "object") walk(v, depth + 1);
        });
    };
    if (!record || typeof record !== "object") return record;
    PICTURE_FIELDS.forEach(f => {
        if (!(f in record)) return;
        if (typeof record[f] === "string") record[f] = IMAGE_KEYS.has(f) ? safeImageRef(record[f]) : record[f];
        else walk(record[f], 0);
    });
    return record;
}

/* A field restricted to a fixed list. Returns an error message when the
   body carries a value that is not on it; absent fields are left alone,
   because $set does not touch a key the body does not carry. */
function checkChoice(body, field, allowed) {
    if (!(field in body)) return null;
    const v = body[field];
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && allowed.includes(v)) return null;
    return `"${field}" must be one of: ${allowed.map(a => a || "(blank)").join(", ")}`;
}

/* The whole check for a room or event body on its way to the database: the
   fixed-list fields named in `choices`, the habboLink, and every picture.
   Returns the message for a 400, or null when the body is fit to store — in
   which case its image references have been cleaned in place. Refuses bad
   choices and links outright rather than blanking them, so a real mistake
   is told to the person making it instead of vanishing on save. */
function checkRecord(body, choices) {
    if (!body || typeof body !== "object") return "Invalid request body";
    for (const field of Object.keys(choices || {})) {
        const problem = checkChoice(body, field, choices[field]);
        if (problem) return problem;
    }
    const link = body.habboLink;
    if (link !== undefined && link !== null && link !== "" && !httpUrlOrEmpty(link)) {
        return "The Habbo link must be an http(s) address.";
    }
    // A record's tags are chips from tags.js's vocabulary, which strips
    // these same characters from a new label; a hand-made body gets no more.
    if (Array.isArray(body.tags)) {
        body.tags = body.tags.filter(t => typeof t === "string").map(t => t.replace(/[<>"'`]/g, ""));
    }
    cleanImageRefs(body);
    return null;
}

module.exports = { imageUrl, httpUrlOrEmpty, safeImageRef, cleanImageRefs, checkChoice, checkRecord };

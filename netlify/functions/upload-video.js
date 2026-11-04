/* /.netlify/functions/upload-video: a video for an article, sent from the
   Warren in pieces (2 Nov 2026, the owner's). How the pieces are kept, and
   why, is in _videos.js; the page plays them through video.js.

   Every request is JSON with an `op`, gated as upload.js is (a site-scope
   account, the x-admin-token header):

     start    { prefix, filename, size, type }  ->  201 { key, chunkSize, chunks }
              The record and its pending mark are written; nothing else.
              `type` is the browser's own sniff of the file, video/mp4 or
              video/webm; the server sniffs the first piece for itself.
     chunk    { key, n, data }  ->  200 { n }
              Piece n, base64. Sent again, it is written again: a retry
              never does harm. The first piece must be the type `start`
              named, or the whole upload is deleted there and then.
     finish   { key }  ->  200 { key, url }, or 409 { missing: [n, ...] }
              Every piece there, the record marked done. A piece that never
              arrived is named, for the Warren to send again.
   DELETE ?key=   the upload cancelled, or a finished video let go of. A
              finished one still named by an article is kept (409), as
              upload.js keeps a picture in use; upload.js's own DELETE
              comes here for a videos/ key too, so the editors' usual
              clean-up reaches videos without knowing they are different.

   Nothing half-stored is kept for long: an upload that stops (cancelled,
   the tab closed, the session run out) is deleted by the next start and by
   video-sweep.js, hourly, once it is two hours old (sweep in _videos.js). */
const { isAuthorized, canWrite, refuseWrite, roleOf, WRITE_SCOPES, usernameFromToken, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { getDb } = require("./_db");
const { SECURITY_HEADERS } = require("./_headers");
const V = require("./_videos");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// A piece as base64 in JSON, with room for the rest of the request; well under the ~6MB a function may be sent.
const MAX_REQUEST = Math.ceil(V.CHUNK / 3) * 4 + 4096;
const MB = n => (n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "") + " MB";

function slugify(text, fallback) {
    return String(text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60).replace(/-$/, "") || fallback;
}

/* upload.js's in-use check, which knows every place a key can be named
   (an article's {{video key=...}} included). Required when needed: upload.js
   requires this file's neighbour _videos.js, never this file. */
const inUse = async key => require("./upload").isInUse(await getDb(), key);

exports.handler = async (event) => {
    try {
        return await handle(event);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("upload-video: request failed", e);
        return json(500, { error: "The video upload couldn't be completed. Try again in a minute." });
    }
};

async function handle(event) {
    if (!isAuthorized(event)) return UNAUTHORIZED;
    const store = V.videoStore();

    if (event.httpMethod === "DELETE") {
        const key = (event.queryStringParameters || {}).key;
        if (!V.isVideoKey(key)) return json(400, { error: "That isn't a video's address." });
        if (!(await canWrite(event))) return await refuseWrite(event);
        return await deleteVideo(store, key);
    }
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (String(event.body || "").length > MAX_REQUEST) return json(413, { error: "That piece of the video is too big to send." });

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });

    if (body.op === "chunk") {
        /* The account's role, looked up as canWrite looks it up, but without
           its activity-log row: a 50MB video is 25 pieces, and the log
           would say "upload-video" 25 times for one thing done. start and
           finish are logged, which is the upload. */
        const role = await roleOf(event);
        if (!(WRITE_SCOPES[role] || []).includes("site")) return await refuseWrite(event);
        return await putChunk(store, body);
    }
    if (!(await canWrite(event))) return await refuseWrite(event);
    if (body.op === "start") return await start(store, body, usernameFromToken(event) || "");
    if (body.op === "finish") return await finish(store, body);
    return json(400, { error: "Unknown video request" });
}

async function start(store, b, who) {
    const ext = typeof b.type === "string" && Object.prototype.hasOwnProperty.call(V.TYPES, b.type) ? V.TYPES[b.type] : null;
    if (!ext) return json(400, { error: "That file isn't an MP4 or WebM video." });
    const size = b.size;
    if (!Number.isInteger(size) || size < 1) return json(400, { error: "That video's size is missing." });
    if (size > V.MAX_BYTES) return json(413, { error: `That video is ${MB(size)}. The most a video can be is ${MB(V.MAX_BYTES)}.` });
    if ((b.prefix !== undefined && typeof b.prefix !== "string") || (b.filename !== undefined && typeof b.filename !== "string")) {
        return json(400, { error: "Invalid request body" });
    }

    const name = slugify(String(b.filename || "").replace(/\.[A-Za-z0-9]{1,5}$/, ""), "video");
    const key = `videos/${slugify(b.prefix, "article")}/${Date.now()}-${name}.${ext}`;
    const chunks = Math.ceil(size / V.CHUNK);
    // The mark first: a start cut off between the two writes is still found by the sweep.
    await store.setJSON(V.PENDING + key, { at: Date.now() });
    await store.setJSON(key, { type: b.type, size, chunkSize: V.CHUNK, chunks, done: false, by: who, at: new Date().toISOString() });
    /* Earlier uploads left behind, a few at a time. Never a reason to fail
       this one: the hourly sweep will have another go. */
    await V.sweep(store, inUse, { limit: 10 }).catch(e => console.error("upload-video: sweep failed", e));
    return json(201, { key, chunkSize: V.CHUNK, chunks });
}

async function putChunk(store, b) {
    const key = b.key;
    if (!V.isVideoKey(key)) return json(400, { error: "That isn't a video's address." });
    const rec = await V.readRecord(store, key);
    if (!rec) return json(404, { error: "That upload has been cleared away. Start it again.", gone: true });
    if (rec.done) return json(409, { error: "That video has already been put together." });
    const n = b.n;
    if (!Number.isInteger(n) || n < 0 || n >= rec.chunks) return json(400, { error: "That piece isn't part of this video." });
    if (typeof b.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)) return json(400, { error: "That piece of the video arrived damaged. Try again." });
    const buf = Buffer.from(b.data, "base64");
    const want = n === rec.chunks - 1 ? rec.size - n * rec.chunkSize : rec.chunkSize;
    if (buf.length !== want) return json(400, { error: "That piece of the video arrived damaged. Try again." });

    if (n === 0) {
        /* The bytes decide, as for pictures (upload.js): a file that only
           says it is a video is refused, and nothing of it is kept. */
        const type = V.sniffVideo(buf);
        if (!type || type !== rec.type) {
            await V.removeVideo(store, key);
            return json(400, { error: "That file isn't an MP4 or WebM video.", gone: true });
        }
    }
    await store.set(V.partKey(key, n), buf);
    /* Cancelled while this piece was on its way: the delete has already
       listed the pieces, so this one would be left behind with nothing to
       find it by. Taken away again. */
    if (!(await V.readRecord(store, key))) {
        await store.delete(V.partKey(key, n));
        return json(404, { error: "That upload has been cleared away. Start it again.", gone: true });
    }
    return json(200, { n });
}

async function finish(store, b) {
    const key = b.key;
    if (!V.isVideoKey(key)) return json(400, { error: "That isn't a video's address." });
    const rec = await V.readRecord(store, key);
    if (!rec) return json(404, { error: "That upload has been cleared away. Start it again.", gone: true });
    const url = `/.netlify/functions/video?key=${key}`;
    if (rec.done) return json(200, { key, url });
    const have = new Set((await V.listKeys(store, `parts/${key}/`)).map(k => Number(k.slice(k.lastIndexOf("/") + 1))));
    const missing = [];
    for (let n = 0; n < rec.chunks; n++) if (!have.has(n)) missing.push(n);
    if (missing.length) return json(409, { error: `${missing.length === 1 ? "A piece" : `${missing.length} pieces`} of the video didn't arrive.`, missing });
    await store.setJSON(key, { ...rec, done: true, doneAt: new Date().toISOString() });
    return json(200, { key, url });
}

/* Also upload.js's, for a videos/ key (see its DELETE). A finished video an
   article still names is kept; an unfinished one is never named, so goes. */
async function deleteVideo(store, key) {
    const rec = await V.readRecord(store, key);
    if (rec && rec.done) {
        let used;
        try {
            used = await inUse(key);
        } catch (e) {
            console.error("upload-video: could not check whether a video is in use", e);
            return json(503, { error: "Couldn't check whether that video is in use. It was not deleted." });
        }
        if (used) return json(409, { error: "That video is still in use.", inUse: true });
    }
    await V.removeVideo(store, key);
    return json(200, { deleted: key });
}
exports.deleteVideo = deleteVideo;

/* Failures reported to /warren's Errors tab: see withErrorReporting in
   _errors.js. Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("upload-video", exports.handler);

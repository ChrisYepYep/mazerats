/* /.netlify/functions/video?key=videos/...: an article's video, played by
   the page a range at a time (2 Nov 2026, the owner's). Public, as image.js
   is. Uploaded by upload-video.js; how it is kept is in _videos.js.

   RANGES, AND NEVER MORE THAN ONE PIECE'S WORTH AT ONCE. A browser plays a
   video by asking for byte ranges ("Range: bytes=1000-"), and seeking is
   just another range; Safari on an iPhone will not play a video at all
   from a server that cannot answer them. Every answer here is a 206 with
   the range it really holds in Content-Range, and holds at most CHUNK
   bytes (2MB) however much was asked for: a function's answer is capped at
   about 6MB, sent as base64, so a whole 50MB video could never go in one.
   The browser reads Content-Range, sees it has less than it asked for, and
   asks again from there; that is how every media player treats a short
   206, and it is checked in the tests with a real one.
     no Range       answered as "bytes=0-", a 206 of the first piece (a
                    plain 200 when the whole video fits in one)
     bytes=a-b      a to b, or to the end of the next piece, whichever is
     bytes=a-       sooner
     bytes=-n       the last n bytes, likewise
     several        the first; one range at a time is all a player asks
     past the end   416, with the size in Content-Range
   HEAD answers the same headers with no body.

   CACHING, as image.js's pictures are and for its reasons, with one more:
   the edge keeps a separate copy for each range asked (Vary and
   Netlify-Vary on the Range header), or a seek could be answered with
   another part of the video. The browser keeps a year: a key is never
   written twice (each has its upload's time in it), which is the owner's
   "long cache with immutable keys". The edge keeps an hour, so a video
   deleted is gone from the site within about one. */
const { headersFor } = require("./_headers");
const V = require("./_videos");

const refuse = (statusCode, body, extra) => ({
    statusCode,
    headers: headersFor("text/plain; charset=utf-8", { "Cache-Control": "no-store", ...(extra || {}) }),
    body
});

const CACHE = {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600, stale-while-revalidate=86400",
    "Netlify-Vary": "query=key,header=Range",
    "Vary": "Range",
    "Accept-Ranges": "bytes"
};

/* The range asked for as [start, end], inclusive, within `size`; null for
   none (or one this cannot read, which is answered as none: RFC 9110 lets a
   server ignore a Range it does not understand); "bad" for one wholly past
   the end. */
function parseRange(header, size) {
    if (typeof header !== "string" || !header.trim()) return null;
    const m = /^\s*bytes\s*=\s*([^,]*)/i.exec(header);
    if (!m) return null;
    const r = /^\s*(\d*)\s*-\s*(\d*)\s*$/.exec(m[1]);
    if (!r || (r[1] === "" && r[2] === "")) return null;
    if (r[1] === "") {
        const n = Number(r[2]);
        if (!n) return "bad";
        return [Math.max(0, size - n), size - 1];
    }
    const start = Number(r[1]);
    const end = r[2] === "" ? size - 1 : Math.min(Number(r[2]), size - 1);
    if (start >= size) return "bad";
    if (end < start) return null;
    return [start, end];
}

exports.handler = async (event) => {
    const method = event.httpMethod;
    if (method !== "GET" && method !== "HEAD") return refuse(405, "Method not allowed");
    const key = (event.queryStringParameters || {}).key;
    if (!V.isVideoKey(key)) return refuse(400, "Invalid key");

    const store = V.videoStore();
    let rec;
    try {
        rec = await V.readRecord(store, key);
    } catch (e) {
        console.error("video: read failed for", key, e.message);
        return refuse(503, "Video unavailable");
    }
    // One still being uploaded is not there yet.
    if (!rec || !rec.done || !Number.isInteger(rec.size) || !Number.isInteger(rec.chunkSize) || rec.chunkSize < 1) return refuse(404, "Not found");
    const size = rec.size;
    const type = Object.prototype.hasOwnProperty.call(V.TYPES, rec.type) ? rec.type : "application/octet-stream";

    const headers = event.headers || {};
    const asked = parseRange(headers.range || headers.Range, size);
    if (asked === "bad") return refuse(416, "Range Not Satisfiable", { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" });
    const [start, wanted] = asked || [0, size - 1];
    // At most one piece's worth: the rest of the piece `start` is in, and as much of the next.
    const end = Math.min(wanted, start + rec.chunkSize - 1, size - 1);
    const whole = start === 0 && end === size - 1 && !asked;

    const out = { ...CACHE, ...(whole ? {} : { "Content-Range": `bytes ${start}-${end}/${size}` }) };
    // The length said only here: for a body, the platform counts it itself.
    if (method === "HEAD") {
        return { statusCode: whole ? 200 : 206, headers: headersFor(type, { ...out, "Content-Length": String(end - start + 1) }), body: "" };
    }

    let body;
    try {
        const first = Math.floor(start / rec.chunkSize), last = Math.floor(end / rec.chunkSize);
        const parts = [];
        for (let n = first; n <= last; n++) {
            const data = await store.get(V.partKey(key, n), { type: "arrayBuffer" });
            if (!data) throw new Error(`piece ${n} missing`);
            parts.push(Buffer.from(data));
        }
        const all = parts.length === 1 ? parts[0] : Buffer.concat(parts);
        const from = start - first * rec.chunkSize;
        body = all.subarray(from, from + (end - start + 1));
        if (body.length !== end - start + 1) throw new Error("short piece");
    } catch (e) {
        console.error("video: piece unreadable for", key, e.message);
        return refuse(503, "Video unavailable");
    }
    return {
        statusCode: whole ? 200 : 206,
        headers: headersFor(type, out),
        body: body.toString("base64"),
        isBase64Encoded: true
    };
};

/* Failures reported to /warren's Errors tab (see withErrorReporting in
   _errors.js). Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("video", exports.handler);
exports._parseRange = parseRange;

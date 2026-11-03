/* The articles' videos (2 Nov 2026, the owner's: "up to 50MB, uploaded in
   chunks, mp4/webm, played with a click"). Shared by upload-video.js (the
   Warren sends a video here in pieces), video.js (the page plays it, a
   range at a time), upload.js (its DELETE, which the Warren's editors
   already send for everything they let go of) and video-sweep.js (the
   clean-up of uploads nobody finished or used).

   WHY PIECES, AND WHY THEY ARE NEVER PUT BACK TOGETHER.
   A function's request and response are each capped at about 6MB, and a
   binary body travels as base64, a third bigger. So a video arrives in
   pieces of CHUNK bytes (2MB, under 2.8MB on the wire) and is KEPT as
   those pieces, one blob each. Joining them into one 50MB blob would need
   a function to read every piece and write the whole inside its 10 seconds
   (26 at most), for no gain: video.js answers each range the browser asks
   for out of the one or two pieces that hold it, and never sends more than
   CHUNK bytes at once, which keeps every answer under the response cap
   and every function's memory at a few MB however long the video is.

   IN THE STORE ("mazerats-videos", its own, so image.js can never serve
   one of these as a picture):
     <key>                 the video's record, JSON: { type, size,
                           chunkSize, chunks, done, by, at }. <key> is
                           videos/<article>/<time>-<name>.mp4|webm, the
                           address the article's {{video key=...}} names.
     parts/<key>/<n>       its pieces, 0 to chunks-1, CHUNK bytes each but
                           the last.
     pending/<key>         an upload not yet known to be wanted: written
                           when it starts, gone once an article uses it.
                           What video-sweep.js walks (see sweep below).

   STRONG CONSISTENCY. Blobs are eventually consistent by default: a read
   can miss a write for up to a minute. Here a piece is written and the
   whole is listed seconds later, and the Warren plays a video the moment
   it is finished (for its poster frame), so every read is asked for the
   latest. The files never change once finished, so this costs nothing in
   correctness, only the edge cache in front of video.js's answers, which
   does the caching that matters. */
const { getStore } = require("@netlify/blobs");

const STORE = "mazerats-videos";
const CHUNK = 2 * 1024 * 1024;
const MAX_BYTES = 50 * 1024 * 1024;
const TYPES = { "video/mp4": "mp4", "video/webm": "webm" };
// Unfinished uploads go after two hours; finished ones nobody used, after two days.
const PARTIAL_MS = 2 * 3600 * 1000;
const UNCLAIMED_MS = 48 * 3600 * 1000;
const KEY = /^videos\/[a-z0-9-]{1,80}\/(\d{13})-[a-z0-9-]{1,80}\.(mp4|webm)$/;

/* The store, with _blobs.js's credential fallback, asking for the latest
   on every read (see above). Replaced by the tests with a fake. */
let factory = () => {
    const { NETLIFY_BLOBS_SITE_ID, NETLIFY_BLOBS_TOKEN } = process.env;
    const opts = { name: STORE, consistency: "strong" };
    if (NETLIFY_BLOBS_SITE_ID && NETLIFY_BLOBS_TOKEN) Object.assign(opts, { siteID: NETLIFY_BLOBS_SITE_ID, token: NETLIFY_BLOBS_TOKEN });
    return getStore(opts);
};
const videoStore = () => factory();

// A key this site could have made: videos/<slug>/<13-digit time>-<slug>.<mp4|webm>.
const isVideoKey = k => typeof k === "string" && KEY.test(k);
const startedAt = k => { const m = KEY.exec(k || ""); return m ? Number(m[1]) : 0; };
const partKey = (k, n) => `parts/${k}/${n}`;
const PENDING = "pending/";

/* What the bytes are, whatever the file was called: MP4's "ftyp" box at
   byte 4 (but not QuickTime's "qt  ", which browsers other than Safari
   don't play), or WebM's EBML header with "webm" as its document type
   (Matroska's own .mkv says "matroska", and no browser plays that). */
function sniffVideo(b) {
    if (!b || b.length < 12) return null;
    if (b.toString("latin1", 4, 8) === "ftyp") return b.toString("latin1", 8, 12) === "qt  " ? null : "video/mp4";
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
        return b.toString("latin1", 0, Math.min(b.length, 64)).includes("webm") ? "video/webm" : null;
    }
    return null;
}

async function readRecord(store, key) {
    try {
        const r = await store.get(key, { type: "json" });
        return r && typeof r === "object" ? r : null;
    } catch (e) {
        // Not JSON is not ours.
        if (e instanceof SyntaxError) return null;
        throw e;
    }
}

async function listKeys(store, prefix) {
    const res = await store.list({ prefix });
    return ((res && res.blobs) || []).map(b => b.key);
}

/* A video and every piece of it gone. The pending mark is put back first
   and taken away last, so a delete cut off half way (a timeout, an outage)
   is finished by the next sweep rather than leaving pieces nobody can find. */
async function removeVideo(store, key) {
    await store.setJSON(PENDING + key, { deleting: true, at: Date.now() });
    await store.delete(key);
    const parts = await listKeys(store, `parts/${key}/`);
    for (const p of parts) await store.delete(p);
    await store.delete(PENDING + key);
    return parts.length;
}

/* The uploads still marked pending, looked at oldest first, at most `limit`
   of them a run:
     being deleted, or with no record   finished off (once the upload is
                                         PARTIAL_MS old, so one just started
                                         is never caught between its writes)
     not finished                       deleted at PARTIAL_MS: an upload
                                         abandoned, cancelled where the
                                         cancel never arrived, or cut off by
                                         a session running out
     finished, and used by an article   the mark taken off: it is wanted
     finished, unused                   deleted at UNCLAIMED_MS: uploaded,
                                         then the article never saved
   `inUse(key)` is upload.js's check. One that throws (the database
   unreachable) leaves finished videos alone this run. Returns what it did. */
async function sweep(store, inUse, opts) {
    const now = (opts && opts.now) || Date.now();
    const limit = (opts && opts.limit) || 25;
    const done = { removed: [], claimed: [], kept: 0 };
    const marks = (await listKeys(store, PENDING)).map(m => m.slice(PENDING.length)).filter(isVideoKey)
        .sort((a, b) => startedAt(a) - startedAt(b)).slice(0, limit);
    for (const key of marks) {
        const age = now - startedAt(key);
        const mark = await readRecord(store, PENDING + key);
        const rec = await readRecord(store, key);
        if ((mark && mark.deleting) || !rec) {
            if (age >= PARTIAL_MS || (mark && mark.deleting && now - (Number(mark.at) || 0) >= 60000)) {
                await removeVideo(store, key); done.removed.push(key);
            } else done.kept++;
            continue;
        }
        if (!rec.done) {
            if (age >= PARTIAL_MS) { await removeVideo(store, key); done.removed.push(key); } else done.kept++;
            continue;
        }
        let used;
        try { used = await inUse(key); } catch (e) { done.kept++; continue; }
        if (used) { await store.delete(PENDING + key); done.claimed.push(key); continue; }
        if (age >= UNCLAIMED_MS) { await removeVideo(store, key); done.removed.push(key); } else done.kept++;
    }
    return done;
}

module.exports = {
    videoStore, isVideoKey, startedAt, partKey, sniffVideo, readRecord, listKeys, removeVideo, sweep,
    CHUNK, MAX_BYTES, TYPES, PENDING, PARTIAL_MS, UNCLAIMED_MS,
    // For the tests: a stand-in for the store.
    _useStore(fn) { factory = fn; }
};

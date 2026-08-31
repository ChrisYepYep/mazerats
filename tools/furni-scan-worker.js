/* One core's worth of furni scanning. See furni-scan-local.js.

   Loads its own copy of the sprite library at startup — about 30 seconds of
   disk reads — then takes room images one at a time from the parent and
   sends back what it found. Fetching the image happens HERE rather than in
   the parent so the download overlaps another worker's matching instead of
   queueing behind a single-threaded parent. */

const fs = require("fs");
const path = require("path");
const { parentPort, workerData } = require("worker_threads");

const { scanRoom } = require("../netlify/functions/_furni-match.js");
const { imageUrl } = require("../netlify/functions/_url.js");

/* matchOpts carries the run's strictness (see --strictness in
   furni-scan-local.js). Passed in workerData rather than with each image,
   because it cannot change partway through a run — a scan whose thresholds
   moved halfway would produce a database nobody could reason about. */
const { cacheDir, wanted, site, matchOpts } = workerData;

const sprites = [];
for (const s of wanted) {
    const file = path.join(cacheDir, s.blobKey);
    try {
        sprites.push({ key: s.key, url: s.url, buffer: fs.readFileSync(file) });
    } catch {
        // A sprite missing from the cache is simply one fewer thing to look
        // for — never a reason to fail the run.
    }
}

parentPort.postMessage({ ready: true, sprites: sprites.length });

parentPort.on("message", async msg => {
    if (msg.stop) process.exit(0);
    const { image } = msg;
    try {
        const url = imageUrl(site, image);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`room image ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const result = scanRoom(buffer, sprites, matchOpts || {});
        parentPort.postMessage({ image, result });
    } catch (err) {
        parentPort.postMessage({ image, error: err && err.message ? err.message : String(err) });
    }
});

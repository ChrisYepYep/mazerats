/* Scans every room image for furni, on this machine, across every core.

   The site's own scan runs as a Netlify background function, which is fine
   for one maze but cannot do the whole archive: it is capped at 15 minutes,
   which is about six images, and it writes a maze's results only after
   finishing ALL of that maze's images — so a run cut off inside a 102-image
   maze saves nothing at all. 553 images at Netlify's pace is 22 hours of
   billed function time that can never complete in one go.

   None of that is inherent. The matcher is plain JavaScript, the database is
   reachable from here, and this machine turns out to be about five times
   faster per image than Netlify's container. Run across the cores it has,
   the whole archive is minutes rather than hours, and costs nothing.

   Results go to the same MongoDB the site reads, in the same shape the
   Netlify scan writes, so the site and the admin panel cannot tell which one
   produced them.

     node tools/furni-scan-local.js --dry-run          # plan only, no writes
     node tools/furni-scan-local.js --only-unscanned   # skip finished images
     node tools/furni-scan-local.js --only-skipped     # retry refused/failed
     node tools/furni-scan-local.js --maze "Old School Maze"
     node tools/furni-scan-local.js --workers 12

   Interrupting is safe: every image is written as it lands, so a re-run with
   --only-unscanned picks up exactly where it stopped.
*/

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");

for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { getCatalogue } = require("../netlify/functions/furni-catalogue.js");
const { blobStore } = require("../netlify/functions/_blobs.js");
const { getDb } = require("../netlify/functions/_db.js");

const CACHE = path.join(__dirname, ".cache", "sprites");
const SITE = process.env.SCAN_SITE_URL || "https://mazerats.net";

const argv = process.argv.slice(2);
const flag = name => argv.includes("--" + name);
const opt = (name, fallback) => {
    const i = argv.indexOf("--" + name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const DRY = flag("dry-run");
const ONLY_UNSCANNED = flag("only-unscanned");
// Revisits images a previous run produced no result for — either refused
// (the colour gate, which has moved once already) or failed outright. Both
// are "it did not get scanned", and both are worth another go after a fix.
const ONLY_SKIPPED = flag("only-skipped");
const MAZE = opt("maze", null);
const LIMIT = Number(opt("limit", 0)) || 0;
// Two cores left for the OS, this script's own writes, and whatever else is
// running — a machine pinned at 100% is a machine that cannot be used.
const WORKERS = Number(opt("workers", Math.max(1, Math.min(16, os.cpus().length - 2))));

const secs = ms => (ms / 1000).toFixed(1) + "s";
const clock = ms => {
    const s = Math.round(ms / 1000);
    return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;
};

/* Mirrors the sprite library to disk. The Netlify scans already filled the
   Blobs store, so the first run pulls from there and every run after reads
   from the local copy and touches the network for nothing. */
async function ensureSpriteCache(catalogue) {
    fs.mkdirSync(CACHE, { recursive: true });
    const wanted = [];
    catalogue.items.forEach((item, itemIndex) => {
        (item.largeImages || []).forEach((state, si) => state.forEach((url, ri) => {
            if (url) wanted.push({ key: itemIndex, url, blobKey: `${itemIndex}_${si}_${ri}.png` });
        }));
    });

    const missing = wanted.filter(s => !fs.existsSync(path.join(CACHE, s.blobKey)));
    if (missing.length) {
        console.log(`  fetching ${missing.length} sprites into ${path.relative(process.cwd(), CACHE)} …`);
        const store = blobStore("furni-sprites");
        for (let i = 0; i < missing.length; i += 16) {
            await Promise.all(missing.slice(i, i + 16).map(async s => {
                let buf = await store.get(s.blobKey, { type: "arrayBuffer" }).catch(() => null);
                if (!buf) {
                    const res = await fetch(s.url).catch(() => null);
                    if (!res || !res.ok) return;
                    buf = await res.arrayBuffer();
                }
                fs.writeFileSync(path.join(CACHE, s.blobKey), Buffer.from(buf));
            }));
            process.stdout.write(`\r  ${Math.min(i + 16, missing.length)}/${missing.length}`);
        }
        process.stdout.write("\r");
    }
    return wanted.filter(s => fs.existsSync(path.join(CACHE, s.blobKey)));
}

function imagesOf(doc) {
    const out = [];
    if (doc.entrance && doc.entrance.image) out.push(doc.entrance.image);
    (doc.gallery || []).forEach(g => { if (g.image) out.push(g.image); });
    if (doc.finish && doc.finish.image) out.push(doc.finish.image);
    return out;
}

(async () => {
    console.log("Local furni scan\n");

    const catalogue = await getCatalogue();
    const wanted = await ensureSpriteCache(catalogue);
    console.log(`catalogue ${catalogue.items.length} furni · ${wanted.length} sprites cached`);

    const db = await getDb();
    const query = MAZE ? { name: new RegExp(MAZE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } : {};
    const docs = await db.collection("rooms").find(query).toArray();

    // Flat list of every image to do, each remembering the maze it belongs
    // to. Flat rather than nested so the workers stay fed: a maze with one
    // image should not leave 15 cores idle.
    const jobs = [];
    const furniByMaze = new Map();
    for (const doc of docs) {
        furniByMaze.set(doc.id, { ...(doc.furni || {}) });
        for (const image of imagesOf(doc)) {
            const existing = (doc.furni || {})[image];
            if (ONLY_UNSCANNED && existing) continue;
            if (ONLY_SKIPPED && !(existing && (existing.skipped || existing.error))) continue;
            jobs.push({ id: doc.id, name: doc.name, image });
        }
    }
    if (LIMIT) jobs.length = Math.min(jobs.length, LIMIT);

    console.log(`${docs.length} mazes · ${jobs.length} images to scan · ${WORKERS} workers`);
    if (!jobs.length) { console.log("\nNothing to do."); process.exit(0); }
    console.log(`writing to: ${DRY ? "NOTHING (dry run)" : "MongoDB rooms collection"}\n`);
    if (DRY) {
        const byMaze = {};
        for (const j of jobs) byMaze[j.name] = (byMaze[j.name] || 0) + 1;
        Object.entries(byMaze).sort((a, b) => b[1] - a[1]).slice(0, 10)
            .forEach(([n, c]) => console.log(`  ${String(c).padStart(4)}  ${n}`));
        console.log("\n(dry run — nothing scanned, nothing written)");
        process.exit(0);
    }

    const started = Date.now();
    let done = 0, failed = 0, found = 0;

    // Writes are funnelled through one promise chain. Several workers can
    // finish images of the SAME maze at once, and each write sends that
    // maze's whole furni object — so two overlapping read-modify-writes
    // would silently drop one of the two results.
    let writeChain = Promise.resolve();
    const write = (id) => {
        writeChain = writeChain.then(() =>
            db.collection("rooms").updateOne({ id }, { $set: { furni: furniByMaze.get(id) } })
        ).catch(err => console.error("\nwrite failed:", err.message));
        return writeChain;
    };

    const queue = jobs.slice();
    await new Promise(resolve => {
        let alive = 0;
        const workers = [];
        const feed = w => {
            const job = queue.shift();
            if (!job) { w.postMessage({ stop: true }); return; }
            w._job = job;
            w.postMessage({ image: job.image });
        };

        for (let i = 0; i < WORKERS; i++) {
            const w = new Worker(path.join(__dirname, "furni-scan-worker.js"), {
                workerData: { cacheDir: CACHE, wanted, site: SITE }
            });
            workers.push(w);
            alive++;
            w.on("message", msg => {
                if (msg.ready) { feed(w); return; }
                const job = w._job;
                if (msg.error) {
                    furniByMaze.get(job.id)[job.image] = { error: msg.error, items: [] };
                    failed++;
                } else if (msg.result.skipped) {
                    furniByMaze.get(job.id)[job.image] = {
                        skipped: msg.result.skipped, roomColours: msg.result.roomColours, items: []
                    };
                } else {
                    const items = msg.result.hits.map(h => {
                        const item = catalogue.items[h.key];
                        return {
                            name: item.name, motto: item.motto, icon: item.icon,
                            sprite: h.sprite || null, url: item.url, releaseDate: item.releaseDate,
                            matched: h.matched, coverage: Number(h.coverage.toFixed(3)), at: h.at,
                            alternates: (h.alternates || []).map(k => catalogue.items[k].name)
                        };
                    });
                    furniByMaze.get(job.id)[job.image] = {
                        scannedAt: new Date().toISOString(),
                        roomColours: msg.result.roomColours,
                        items
                    };
                    found += items.length;
                }
                write(job.id);
                done++;
                const each = (Date.now() - started) / done;
                process.stdout.write(
                    `\r  ${done}/${jobs.length}  ${found} furni  ${failed} failed` +
                    `  ${secs(each)}/image  eta ${clock(each * (jobs.length - done))}   `
                );
                feed(w);
            });
            w.on("error", err => { console.error("\nworker error:", err.message); if (--alive === 0) resolve(); });
            w.on("exit", () => { if (--alive === 0) resolve(); });
        }
    });

    await writeChain;
    console.log(`\n\nDone in ${clock(Date.now() - started)} — ${done} images, ${found} furni, ${failed} failed.`);
    process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });

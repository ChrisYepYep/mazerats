/* Scans every room image for furni, on this machine, across every core.

   THIS IS THE ONLY SCANNER NOW. It used to be the fast alternative to a
   Netlify background function; that function has been deleted. It was capped
   at 15 minutes — about six images — and wrote a maze's results only after
   finishing ALL of that maze's images, so a run cut off inside a 102-image
   maze saved nothing at all. 553 images at Netlify's pace was 22 hours of
   billed function time that could never complete in one go, and every hour
   of it cost real money.

   None of that is inherent. The matcher is plain JavaScript, the database is
   reachable from here, and this machine is about five times faster per image
   than Netlify's container. Across the cores it has, the whole archive is
   about fifteen minutes, and costs nothing.

   Results go to the same MongoDB the site reads, in the shape the site and
   admin already expect.

     node tools/furni-scan-local.js --dry-run          # plan only, no writes
     node tools/furni-scan-local.js --only-unscanned   # skip finished images
     node tools/furni-scan-local.js --only-skipped     # retry refused/failed
     node tools/furni-scan-local.js --additive         # only ADD new finds
     node tools/furni-scan-local.js --maze "Old School Maze"
     node tools/furni-scan-local.js --ids abc,def      # specific maze ids
     node tools/furni-scan-local.js --workers 12

   The admin page's scan buttons run exactly this, via
   netlify/functions/furni-scan-local.js, which spawns it with --ids and
   --run-id. That is also why it reports progress into the furni_scans
   record: the admin's progress bar polls that, and knows nothing about
   which process is doing the work.

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
const { spriteList, isLegacySpriteKey } = require("../netlify/functions/_furni-sprites.js");

const CACHE = path.join(__dirname, ".cache", "sprites");
const SITE = process.env.SCAN_SITE_URL || "https://mazerats.net";

// How politely the sprite library is refilled. See ensureSpriteCache.
const SPRITE_BATCH = 4;
const SPRITE_PAUSE_MS = 250;
/* A scan is only as good as the library it compares against: a missing
   sprite is not a wrong answer, it is a furni that silently cannot be
   found. Running the whole archive against a part-filled cache would
   overwrite good results with worse ones and leave no trace of why, so
   below this share of the catalogue the run stops and says so. */
const MIN_SPRITE_COVERAGE = 0.95;

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
/* Adds furni the scan has never recorded for an image, and changes nothing
   that is already there.

   The reason this mode exists: FurniIndex's catalogue is still being filled
   in, so furni that genuinely IS in a room simply cannot be found until they
   add it. Re-running the ordinary scan would find those — but it would also
   throw away and rebuild every existing entry on its way past, and by then
   those entries have been looked at, corrected and pruned by hand. This
   keeps the curated result and only appends what is newly findable.

   "Already there" is judged by furni NAME, across manual and scanned
   entries alike: if an image lists a Bonsai Tree, this run's Bonsai Tree is
   not a discovery, whatever its coverage or position. That is deliberately
   coarser than position-matching — the same furni placed twice in one room
   dedupes to one entry either way (see dedupeByPosition in _furni-match.js),
   so name is the identity that actually distinguishes a NEW find. */
const ADDITIVE = flag("additive");
const MAZE = opt("maze", null);
// Specific maze ids, comma-separated. How the admin page asks for a scan —
// it already knows exactly which records it means, so it says so rather than
// sending a name to be pattern-matched.
const IDS = (opt("ids", "") || "").split(",").map(s => s.trim()).filter(Boolean);
/* Events hold room images in the same shape mazes do, and the admin's
   per-item scan button offers them, so the same scan has to be able to
   reach them. Nothing but "events" is accepted — this string names a
   database collection, and it arrives from an HTTP request. */
const COLLECTION = opt("collection", "rooms") === "events" ? "events" : "rooms";
/* Names this run in the furni_scans progress record the admin polls. Absent
   on a hand-run scan from the terminal, which has the terminal to report to
   and no bar to drive — progress writes are skipped entirely in that case,
   so a command-line run can never make the admin page think a scan it did
   not start is under way. */
const RUN_ID = opt("run-id", null);
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
   from the local copy and touches the network for nothing.

   Cache entries are named after the sprite's URL, not its position in the
   catalogue — _furni-sprites.js explains at length why that matters, and
   what the index-named scheme it replaced did to the archive's furni. */
async function ensureSpriteCache(catalogue) {
    fs.mkdirSync(CACHE, { recursive: true });
    const wanted = spriteList(catalogue);

    // Index-named leftovers from before the fix hold the wrong artwork under
    // names nothing can map back. Cleared once, so a stale 16MB of it cannot
    // be picked up by anything later.
    const stale = fs.readdirSync(CACHE).filter(isLegacySpriteKey);
    if (stale.length) {
        console.log(`  discarding ${stale.length} sprites cached under the old index-based names`);
        for (const f of stale) fs.unlinkSync(path.join(CACHE, f));
    }

    const missing = wanted.filter(s => !fs.existsSync(path.join(CACHE, s.blobKey)));
    if (missing.length) {
        console.log(`  fetching ${missing.length} sprites into ${path.relative(process.cwd(), CACHE)} …`);
        const store = blobStore("furni-sprites");
        let got = 0, lost = 0;
        /* Deliberately unhurried. Refilling the whole library at sixteen
           parallel requests got this machine connection-refused by
           FurniIndex partway through the alphabet — every request after
           "g" timed out, and the host stayed unreachable for a while
           after. They are doing us a favour by hosting this at all, so:
           a few at a time, a breath between batches, and a backoff when
           one fails rather than an immediate retry. It is a couple of
           minutes' work, once, and only when the catalogue changes. */
        for (let i = 0; i < missing.length; i += SPRITE_BATCH) {
            const batch = missing.slice(i, i + SPRITE_BATCH);
            await Promise.all(batch.map(async s => {
                let buf = await store.get(s.blobKey, { type: "arrayBuffer" }).catch(() => null);
                for (let attempt = 0; !buf && attempt < 4; attempt++) {
                    if (attempt) await sleep(1000 * Math.pow(3, attempt));
                    const res = await fetch(s.url, { signal: AbortSignal.timeout(20000) }).catch(() => null);
                    if (res && res.ok) buf = await res.arrayBuffer().catch(() => null);
                }
                if (!buf) { lost++; return; }
                fs.writeFileSync(path.join(CACHE, s.blobKey), Buffer.from(buf));
                got++;
            }));
            process.stdout.write(`\r  ${Math.min(i + SPRITE_BATCH, missing.length)}/${missing.length}  (${lost} unavailable)   `);
            await sleep(SPRITE_PAUSE_MS);
        }
        console.log(`\r  fetched ${got}, ${lost} unavailable                        `);
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

    const db = await getDb();

    /* The admin's progress bar polls furni_scans for a record named by the
       run id it generated (netlify/functions/furni-scan-status.js). Writing
       it is the whole reason the button can show a bar for work happening in
       a completely separate process. A terminal run passes no --run-id and
       so writes nothing at all. */
    const progressCol = db.collection("furni_scans");
    const setProgress = RUN_ID
        ? (fields) => progressCol.updateOne(
            { _id: "current" },
            { $set: { runId: RUN_ID, updatedAt: new Date().toISOString(), ...fields } },
            { upsert: true }
        ).catch(() => { /* progress is a courtesy; never fail a scan over it */ })
        : async () => {};

    // Cleared explicitly, not merely overwritten: progress lives in ONE
    // document, so without this a new run inherits the last run's
    // finishedAt/error and reports itself finished before it starts.
    await setProgress({
        startedAt: new Date().toISOString(),
        finishedAt: null, error: null, done: 0, total: 0, errors: 0,
        current: "Loading catalogue…"
    });

    try {

    const catalogue = await getCatalogue();
    const all = spriteList(catalogue);
    await setProgress({ current: "Loading furni sprites…" });
    const wanted = await ensureSpriteCache(catalogue);
    const share = all.length ? wanted.length / all.length : 0;
    console.log(`catalogue ${catalogue.items.length} furni · ${wanted.length}/${all.length} sprites cached (${(share * 100).toFixed(1)}%)`);
    if (share < MIN_SPRITE_COVERAGE) {
        const why = `Only ${(share * 100).toFixed(1)}% of the sprite library is cached. ` +
            `A scan against a part-filled library records fewer furni without recording why. ` +
            `FurniIndex rate-limits bursts — wait a while and run again; the cache is resumable.`;
        console.error("\nStopping: " + why);
        await setProgress({ finishedAt: new Date().toISOString(), error: why });
        process.exit(1);
    }

    const query = IDS.length ? { id: { $in: IDS } }
        : MAZE ? { name: new RegExp(MAZE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }
        : {};
    const docs = await db.collection(COLLECTION).find(query).toArray();

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
    if (ADDITIVE) console.log("additive — existing furni is left alone, only new names are added");
    if (!jobs.length) {
        console.log("\nNothing to do.");
        // Finished, not merely silent — otherwise the admin's bar waits out
        // its two-minute grace on a run that was over immediately.
        await setProgress({ total: 0, done: 0, finishedAt: new Date().toISOString(), current: null });
        process.exit(0);
    }
    /* Each worker reads the whole 3,417-sprite library from disk before it
       can take its first image — around half a minute during which nothing
       completes. Said out loud, because a bar sitting on "0 of 562" for
       thirty seconds looks stalled rather than busy. */
    await setProgress({
        total: jobs.length, done: 0,
        current: `Loading the furni library into ${WORKERS} workers…`
    });
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
            db.collection(COLLECTION).updateOne({ id }, { $set: { furni: furniByMaze.get(id) } })
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
                const previous = (furniByMaze.get(job.id)[job.image] || {}).items || [];
                /* What survives this image being rescanned.

                   Normally: anything an admin added by hand. A scan replaces
                   its own findings wholesale — that is the point of
                   rescanning — but hand-added entries are the ones it could
                   never find on its own, so wiping them would make a rescan
                   destructive rather than merely repetitive. (This tool used
                   to drop them; a full run would have quietly destroyed every
                   correction ever made.)

                   In --additive: everything survives, and only genuinely new
                   names are appended. See the flag's own comment. */
                const kept = ADDITIVE ? previous.slice() : previous.filter(f => f && f.manual);
                // Names already spoken for, so a "find" that is really just
                // the same furni again can be recognised and dropped.
                const known = new Set(kept.map(f => f && f.name).filter(Boolean));
                if (msg.error) {
                    // In additive mode a failed image must not lose the furni
                    // it already had — the run promised to change nothing
                    // that is already there, and failing is not an exception
                    // to that.
                    furniByMaze.get(job.id)[job.image] = ADDITIVE
                        ? { ...(furniByMaze.get(job.id)[job.image] || {}), error: msg.error, items: kept }
                        : { error: msg.error, items: kept };
                    failed++;
                } else if (msg.result.skipped) {
                    furniByMaze.get(job.id)[job.image] = ADDITIVE
                        ? { ...(furniByMaze.get(job.id)[job.image] || {}), items: kept }
                        : { skipped: msg.result.skipped, roomColours: msg.result.roomColours, items: kept };
                } else {
                    const items = msg.result.hits.map(h => {
                        const item = catalogue.items[h.key];
                        return {
                            name: item.name, motto: item.motto, icon: item.icon,
                            sprite: h.sprite || null, url: item.url, releaseDate: item.releaseDate,
                            matched: h.matched, coverage: Number(h.coverage.toFixed(3)), at: h.at,
                            alternates: (h.alternates || []).map(k => catalogue.items[k].name)
                        };
                    }).filter(it => !ADDITIVE || !known.has(it.name));
                    furniByMaze.get(job.id)[job.image] = {
                        ...(ADDITIVE ? (furniByMaze.get(job.id)[job.image] || {}) : {}),
                        scannedAt: new Date().toISOString(),
                        roomColours: msg.result.roomColours,
                        items: kept.concat(items)
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
                // Every image rather than every maze: one maze can hold a
                // hundred images, and a bar that sat still through all of
                // them would look hung. Not awaited — a slow progress write
                // must never hold up feeding the next image to a worker.
                setProgress({ done, current: job.image, errors: failed, found, additive: ADDITIVE });
                feed(w);
            });
            w.on("error", err => { console.error("\nworker error:", err.message); if (--alive === 0) resolve(); });
            w.on("exit", () => { if (--alive === 0) resolve(); });
        }
    });

    await writeChain;
    console.log(`\n\nDone in ${clock(Date.now() - started)} — ${done} images, ${found} furni, ${failed} failed.`);
    await setProgress({
        done, total: jobs.length, errors: failed, found, additive: ADDITIVE,
        current: null, finishedAt: new Date().toISOString()
    });
    process.exit(0);

    } catch (err) {
        /* A crash in here is invisible to whoever pressed the button — the
           admin page is watching the progress record, not this terminal — so
           the failure is written where they are actually looking before it
           is printed where they are not. */
        console.error("\n" + (err && err.stack ? err.stack : err));
        await setProgress({
            finishedAt: new Date().toISOString(),
            error: (err && err.message) ? err.message : String(err)
        });
        process.exit(1);
    }
})().catch(err => { console.error(err); process.exit(1); });

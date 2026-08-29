/* Scans a maze/event's room images for furni and writes what it finds back
   onto the record.

   A BACKGROUND function on purpose: one room image takes roughly 20 seconds
   against the full 3,384-sprite library, and a normal Netlify function is
   killed at 10. Background functions get 15 minutes and return immediately
   with 202, so the admin fires this and polls the record for results rather
   than holding a request open.

   Sprites are cached in Blobs after the first run. Pulling 3,384 images from
   FurniIndex on every scan would be both slow and rude; fetched once, they
   are reused by every scan after.
*/

const { blobStore } = require("./_blobs.js");
const { getDb } = require("./_db.js");
const { isAuthorized, UNAUTHORIZED } = require("./_auth.js");
const { scanRoom } = require("./_furni-match.js");
const { getCatalogue } = require("./furni-catalogue.js");

const SPRITE_CONCURRENCY = 12;

/* Every state/rotation of every furni. All of them matter: a chair placed
   facing away matches only its own rotation's sprite, and an early test that
   used just the first sprite of each furni found nothing at all. */
async function loadSprites(catalogue) {
    const store = blobStore("furni-sprites");
    const wanted = [];
    catalogue.items.forEach((item, itemIndex) => {
        (item.largeImages || []).forEach((state, si) => state.forEach((url, ri) => {
            if (url) wanted.push({ key: itemIndex, url, blobKey: `${itemIndex}_${si}_${ri}.png` });
        }));
    });

    const sprites = [];
    for (let i = 0; i < wanted.length; i += SPRITE_CONCURRENCY) {
        const batch = wanted.slice(i, i + SPRITE_CONCURRENCY);
        await Promise.all(batch.map(async (s) => {
            let buffer = await store.get(s.blobKey, { type: "arrayBuffer" }).catch(() => null);
            if (!buffer) {
                const res = await fetch(s.url).catch(() => null);
                if (!res || !res.ok) return;
                buffer = await res.arrayBuffer();
                await store.set(s.blobKey, buffer).catch(() => {});
            }
            sprites.push({ key: s.key, url: s.url, buffer: Buffer.from(buffer) });
        }));
    }
    return sprites;
}

async function fetchRoomImage(siteUrl, imagePath) {
    const url = /^https?:/i.test(imagePath) ? imagePath : `${siteUrl}${imagePath}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`room image ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

exports.handler = async (event) => {
    if (!isAuthorized(event)) return UNAUTHORIZED;

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    const { collection = "rooms", ids = [], images = null, onlyUnscanned = false } = body;
    if (!ids.length) return { statusCode: 400, body: "no ids given" };

    const siteUrl = process.env.URL || `https://${event.headers.host}`;
    const db = await getDb();
    const col = db.collection(collection === "events" ? "events" : "rooms");

    // A background function can't stream progress back, so it writes it to a
    // record the admin polls instead (see furni-scan-status.js). Written
    // before the slow work starts so the bar can appear immediately, and
    // updated after each image rather than each maze — a single maze can
    // hold a hundred images and a bar that sat still for all of them would
    // look hung.
    const progressCol = db.collection("furni_scans");
    const runId = `${Date.now()}`;
    async function setProgress(fields) {
        await progressCol.updateOne(
            { _id: "current" },
            { $set: { runId, updatedAt: new Date().toISOString(), ...fields } },
            { upsert: true }
        ).catch(() => {});
    }

    await setProgress({
        startedAt: new Date().toISOString(),
        // error is cleared explicitly: progress lives in ONE document that
        // each run overwrites field by field, so without this a new run
        // inherits the last failure and reports itself failed on finishing.
        finishedAt: null, error: null, done: 0, total: 0, current: "Loading catalogue…", errors: 0
    });

    // Everything past this point is wrapped: a throw in a background
    // function goes nowhere a human will see it, and the first version of
    // this died inside getCatalogue() leaving a progress record frozen on
    // its opening line with no indication why. Any failure now lands on the
    // record, which is what the admin is already watching.
    try {
    const catalogue = await getCatalogue();
    await setProgress({ current: "Loading furni sprites…" });
    const sprites = await loadSprites(catalogue);

    // Work out the whole job up front so the bar has a real denominator.
    const plan = [];
    for (const id of ids) {
        const doc = await col.findOne({ id });
        if (!doc) continue;
        const targets = [];
        if (doc.entrance && doc.entrance.image) targets.push(doc.entrance.image);
        (doc.gallery || []).forEach(g => { if (g.image) targets.push(g.image); });
        if (doc.finish && doc.finish.image) targets.push(doc.finish.image);
        let todo = images ? targets.filter(t => images.includes(t)) : targets;
        // "Only unscanned": skip any image that already carries a result.
        // A previous run that was skipped for lighting or errored still
        // counts as answered — rerunning it would just fail the same way.
        if (onlyUnscanned) {
            const already = doc.furni || {};
            todo = todo.filter(t => !already[t]);
        }
        if (todo.length) plan.push({ id, doc, todo });
    }

    const totalImages = plan.reduce((n, p) => n + p.todo.length, 0);
    await setProgress({ total: totalImages, done: 0, current: null });

    let done = 0, errors = 0;
    for (const { id, doc, todo } of plan) {

        const furni = { ...(doc.furni || {}) };
        for (const image of todo) {
            try {
                const buffer = await fetchRoomImage(siteUrl, image);
                const result = scanRoom(buffer, sprites);
                if (result.skipped) {
                    // Recorded rather than silently empty, so the admin can
                    // say WHY a room found nothing.
                    furni[image] = { skipped: result.skipped, roomColours: result.roomColours, items: [] };
                    done++;
                    await setProgress({ done, current: image });
                    continue;
                }
                furni[image] = {
                    scannedAt: new Date().toISOString(),
                    roomColours: result.roomColours,
                    items: result.hits.map(h => {
                        const item = catalogue.items[h.key];
                        return {
                            name: item.name,
                            motto: item.motto,
                            icon: item.icon,
                            // Room-scale art in the matched rotation; the card
                            // shows this and falls back to icon without it.
                            sprite: h.sprite || null,
                            url: item.url,
                            releaseDate: item.releaseDate,
                            matched: h.matched,
                            coverage: Number(h.coverage.toFixed(3)),
                            at: h.at,
                            alternates: (h.alternates || []).map(k => catalogue.items[k].name)
                        };
                    })
                };
            } catch (err) {
                furni[image] = { error: err.message, items: [] };
                errors++;
            }
            done++;
            await setProgress({ done, current: image, errors });
        }
        await col.updateOne({ id }, { $set: { furni } });
    }

    await setProgress({ done, total: totalImages, current: null, errors, finishedAt: new Date().toISOString() });
    return { statusCode: 200, body: "scan complete" };
    } catch (err) {
        await setProgress({
            error: err && err.message ? err.message : String(err),
            current: null,
            finishedAt: new Date().toISOString()
        });
        return { statusCode: 500, body: "scan failed: " + err.message };
    }
};

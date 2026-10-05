/* Copies onto this site every furni picture it still showed from
   FurniIndex's OLD host (5 Oct 2026, the owner's: the old host is being
   switched off, and the site has to be off it today).

   What is left on the old host once tools/furni-api-map.js and
   tools/furni-api-nearest.js have moved everything the new API holds:
     - the furni the new API has no page for, which the catalogue keeps
       offering from the frozen old one (_furni-legacy.js) — their icons and
       both sprite grids (30 furni, 170 pictures on 5 Oct 2026);
     - the archive's detections of furni the new API doesn't hold at all
       (the Telephone Box door0, the Comedy Poster, Heart Stickies…), icons
       and sprites both.
   Each is downloaded once, into assets/img/furni-legacy/ under its own old
   filename, and listed in netlify/functions/_furni-mirror.json, which
   _furni-mirror.js reads to send the site's own copy instead of the old
   address. Run it while the old host still answers; re-running only asks
   for what is not already here.

   usage: node tools/furni-legacy-mirror.js [--site http://localhost:8888] */

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const siteArg = argv.indexOf("--site");
const SITE = siteArg > -1 ? argv[siteArg + 1] : "http://localhost:8888";
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "assets", "img", "furni-legacy");
const LIST = path.join(ROOT, "netlify", "functions", "_furni-mirror.json");
const OLD = /^https:\/\/furniindex\.com\/image\//;
const CONCURRENCY = 4;
fs.mkdirSync(OUT, { recursive: true });

const base = url => decodeURIComponent(url.split("?")[0].split("/").pop());

(async () => {
    const urls = new Set();
    const cat = await (await fetch(`${SITE}/.netlify/functions/furni-catalogue?sprites=1`)).json();
    for (const i of cat.items || []) {
        for (const u of [i.icon, ...(i.largeImages || []).flat(), ...(i.smallImages || []).flat()]) if (typeof u === "string" && OLD.test(u)) urls.add(u);
    }
    for (const name of ["rooms", "events"]) {
        const j = await (await fetch(`${SITE}/.netlify/functions/${name}`)).json();
        for (const t of j.f || []) if (typeof t.i === "string" && OLD.test(t.i)) urls.add(t.i);
        for (const rec of j.rooms || []) for (const hits of Object.values(rec.furni || {})) for (const [, sprite] of hits) {
            if (typeof sprite === "string" && OLD.test(sprite)) urls.add(sprite);
        }
    }
    console.log(`${urls.size} pictures still on the old host`);

    const kept = new Set((() => { try { return JSON.parse(fs.readFileSync(LIST, "utf8")); } catch (e) { return []; } })());
    const list = [...urls];
    const failed = [];
    let next = 0, got = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (next < list.length) {
            const url = list[next++];
            const file = base(url);
            const where = path.join(OUT, file);
            if (fs.existsSync(where) && fs.statSync(where).size > 0) { kept.add(file); continue; }
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "MazeRats/1.0 (+https://mazerats.net)" } });
                if (!res.ok) throw new Error(String(res.status));
                const buf = Buffer.from(await res.arrayBuffer());
                if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
                fs.writeFileSync(where, buf);
                kept.add(file);
                got++;
            } catch (e) {
                failed.push(`${url} (${e.message})`);
            }
        }
    }));
    fs.writeFileSync(LIST, JSON.stringify([...kept].sort(), null, 1) + "\n");
    const bytes = [...kept].reduce((n, f) => n + (fs.existsSync(path.join(OUT, f)) ? fs.statSync(path.join(OUT, f)).size : 0), 0);
    console.log(`Downloaded ${got}; ${kept.size} on this site now (${Math.round(bytes / 1024)}KB).`);
    if (failed.length) { console.log(`${failed.length} could not be fetched:`); failed.forEach(f => console.log("  " + f)); }
})().catch(e => { console.error(e); process.exit(1); });

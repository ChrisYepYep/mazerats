/* Builds the furni catalogue copy that ships with the site (5 Oct 2026).

   netlify/functions/furni-catalogue.js builds the catalogue from FurniIndex's
   public API (https://api.furniindex.com), one /furnidata request per furni
   — 3,269 of them on 5 Oct 2026, which is minutes of FurniIndex's time at a
   polite four at a time and far beyond a function's ten seconds. So the
   function never walks it from nothing: it starts from the copy this writes,
   netlify/functions/_furni-catalogue-seed.json, and its daily refresh only
   asks about what is new or due a re-check. Re-run this now and then (say
   before a deploy, after a big release) so a fresh deploy starts close to
   current; nothing breaks if it is old, the refresh just has more to do.

   GET only. Four requests at a time, a User-Agent saying who is asking, and
   every answer kept under tools/.cache/furni-api (fd-*.json), so a re-run
   only asks for what it hasn't got.

     node tools/furni-catalogue-seed.js            # reuse cached answers
     node tools/furni-catalogue-seed.js --fresh    # ask about every furni again
     node tools/furni-catalogue-seed.js --max-age 7   # re-ask answers older than 7 days
*/

const fs = require("fs");
const path = require("path");
const { compact, itemsOf } = require("../netlify/functions/furni-catalogue.js");

const API = "https://api.furniindex.com";
const UA = { "User-Agent": "MazeRats/1.0 (+https://mazerats.net)" };
const CACHE = path.join(__dirname, ".cache", "furni-api");
const OUT = path.join(__dirname, "..", "netlify", "functions", "_furni-catalogue-seed.json");
const CONCURRENCY = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

const argv = process.argv.slice(2);
const FRESH = argv.includes("--fresh");
const maxAgeArg = argv.indexOf("--max-age");
const MAX_AGE_MS = FRESH ? 0 : maxAgeArg > -1 ? Number(argv[maxAgeArg + 1]) * DAY_MS : Infinity;

// "*" is kept apart from "_" (rare_dragonlamp*9 is not rare_dragonlamp_9).
const safe = s => s.replace(/\*/g, "~").replace(/[^a-z0-9._~-]+/gi, "_");

async function fetchText(url) {
    for (let attempt = 0; ; attempt++) {
        try {
            const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
            if (res.status === 404) return "";
            if (!res.ok) throw new Error(`${res.status} ${url}`);
            return await res.text();
        } catch (e) {
            if (attempt === 2) throw e;
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
}

(async () => {
    fs.mkdirSync(CACHE, { recursive: true });
    console.log("Reading FurniIndex's index of furni");
    const indexText = await fetchText(`${API}/furnidata/index.json`);
    fs.writeFileSync(path.join(CACHE, "index.json"), indexText);
    const names = JSON.parse(indexText).classNames || [];
    console.log(`  ${names.length} classnames`);

    const furni = {};
    let next = 0, asked = 0, reused = 0, oldest = Date.now();
    const work = async () => {
        while (next < names.length) {
            const c = names[next++];
            const file = path.join(CACHE, "fd-" + safe(c) + ".json");
            let text, when;
            const stat = fs.existsSync(file) ? fs.statSync(file) : null;
            if (stat && Date.now() - stat.mtimeMs < MAX_AGE_MS) {
                text = fs.readFileSync(file, "utf8");
                when = stat.mtimeMs;
                reused++;
            } else {
                text = await fetchText(`${API}/furnidata/${encodeURIComponent(c)}`);
                fs.writeFileSync(file, text);
                when = Date.now();
                if (++asked % 250 === 0) console.log(`  asked ${asked}`);
            }
            if (when < oldest) oldest = when;
            const day = Math.floor(when / DAY_MS);
            let d = null;
            try { d = text ? JSON.parse(text) : null; } catch (e) { d = null; }
            furni[c] = d && d.classname ? compact({ ...d, classname: c }, day) : { c, r: null, t: day };
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, work));

    // In index order, so the file diffs sensibly between runs.
    const ordered = {};
    for (const c of names) ordered[c] = furni[c];
    const state = { v: 2, fetchedAt: Math.floor(oldest), pending: 0, furni: ordered };
    fs.writeFileSync(OUT, JSON.stringify(state) + "\n");
    const view = itemsOf(state);
    const listed = Object.values(ordered).filter(r => r.u).length;
    console.log(`Asked ${asked}, reused ${reused}. ${listed} furni with a FurniIndex page; ` +
        `${view.items.length - listed} more carried from the old catalogue (_furni-legacy.json). ` +
        `Wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes), as of ${new Date(oldest).toISOString()}.`);
})().catch(e => { console.error(e); process.exit(1); });

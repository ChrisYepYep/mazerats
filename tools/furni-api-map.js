/* Builds the table that moves the site's furni pictures onto FurniIndex's
   new public API (https://api.furniindex.com, 1 Oct 2026).

   WHY A TABLE. The new API is keyed on the furni's own classname and the
   game's own directions (r0/r2/r4/r6, states from s0), where the old image
   host is keyed on a name slug and FurniIndex's own r1..r4 — and that old
   order is not the game's, nor any rule: it is per furni (see the header of
   tools/furni-fallback-extract.js). A maze's furni card shows the exact view
   the scan matched, so each of those views has to be found again among the
   new renders. That is done here once, by comparing pixels, rather than
   guessed at on every page.

   WHAT IT READS (GET only):
     - the public /rooms and /events payloads, for every sprite and icon the
       site shows and each one's classname;
     - the catalogue with sprites, for the large renders' filenames — used
       once, for the rain of seats in js/furni-rain.js, which now lists new
       API classnames and views itself (so a re-run finds none there);
     - api.furniindex.com: each classname's /furnidata, and the candidate
       renders — the old picture is compared against every rotation of its
       state, "noshadow" (the old renders carry no shadow; checked).

   WHAT IT WRITES: netlify/functions/_furni-api-map.json, read by
   _furni-payload.js — { sprites: { oldFilename: "class/size/rN/sN" },
   noIcon: [class] }. (The Warren's picker needs no table: its icons are by
   classname alone. Its scan-review rows stay on the old host with the
   scanner, which still matches against the old renders — see scanCatalogue
   in netlify/functions/_furni-sprites.js, 5 Oct 2026.)
   An old filename missing from the table keeps its old address, which still
   works; re-run this after a scan adds furni the table doesn't know.

   Polite to FurniIndex: four requests at a time, every answer cached under
   tools/.cache/furni-api, so a re-run only asks for what is new.

   usage: node tools/furni-api-map.js [--site http://localhost:8888] */

const fs = require("fs");
const path = require("path");
const { readPng } = require("./png-decode.js");

const argv = process.argv.slice(2);
const siteArg = argv.indexOf("--site");
const SITE = siteArg > -1 ? argv[siteArg + 1] : "http://localhost:8888";
const API = "https://api.furniindex.com";
const OLD = "https://furniindex.com/image/furni/furni-";
const CACHE = path.join(__dirname, ".cache", "furni-api");
const ROOT = path.join(__dirname, "..");
// Mean colour difference, 0-255, over the two shapes. A true match measured
// 0.0; the nearest wrong rotation of the same furni measured 93.7.
const MATCH_MAX = 12;
const CONCURRENCY = 4;

fs.mkdirSync(CACHE, { recursive: true });
const safe = s => s.replace(/[^a-z0-9._-]+/gi, "_");

async function getBuffer(url, file) {
    const where = path.join(CACHE, file);
    if (fs.existsSync(where)) return fs.readFileSync(where);
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
            if (res.status === 404) { fs.writeFileSync(where, ""); return Buffer.alloc(0); }
            if (!res.ok) throw new Error(res.status + " " + url);
            const buf = Buffer.from(await res.arrayBuffer());
            fs.writeFileSync(where, buf);
            return buf;
        } catch (e) {
            if (attempt === 2) throw e;
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
}

async function getJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(res.status + " " + url);
    return res.json();
}

async function pool(items, fn) {
    let next = 0, done = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            await fn(items[i]);
            if (++done % 50 === 0) process.stdout.write(`  ${done}/${items.length}\n`);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

// ---- comparison: trim to the opaque shape, slide ±4px, mean difference
function trim(file) {
    const img = readPng(file);
    let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
        if (img.rgba[(y * img.w + x) * 4 + 3] > 16) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    }
    if (x1 < 0) return null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    return {
        w, h,
        px(x, y) {
            if (x < 0 || y < 0 || x >= w || y >= h) return null;
            const i = ((y + y0) * img.w + (x + x0)) * 4;
            return img.rgba[i + 3] > 16 ? img.rgba.subarray(i, i + 3) : null;
        }
    };
}
function score(a, b) {
    if (!a || !b) return 255;
    if (Math.abs(a.w - b.w) > 8 || Math.abs(a.h - b.h) > 8) return 255;
    let best = 255;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        let sum = 0, n = 0;
        const W = Math.max(a.w, b.w + dx), H = Math.max(a.h, b.h + dy);
        for (let y = Math.min(0, dy); y < H; y++) for (let x = Math.min(0, dx); x < W; x++) {
            const p = a.px(x, y), q = b.px(x - dx, y - dy);
            if (!p && !q) continue;
            n++;
            if (!p || !q) { sum += 255; continue; }
            sum += (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])) / 3;
            if (sum / Math.max(n, 400) > best) break;
        }
        if (n && sum / n < best) best = sum / n;
    }
    return best;
}

(async () => {
    console.log("Reading the site's furni from " + SITE);
    const want = new Map();       // old filename -> className
    const icons = new Set();      // classNames whose icon the site shows
    for (const name of ["rooms", "events"]) {
        const j = await getJson(`${SITE}/.netlify/functions/${name}`);
        for (const row of j.f || []) if (row.c) icons.add(row.c);
        for (const rec of j.rooms || []) {
            for (const hits of Object.values(rec.furni || {})) {
                for (const [index, sprite] of hits) {
                    const row = (j.f || [])[index];
                    if (!sprite || !row || !row.c) continue;
                    // Before the switch every sprite is an old tail; after
                    // it, only the unmatched ones are, sent whole (see
                    // _furni-payload.js) — those are the ones still wanted.
                    if (sprite.startsWith(OLD)) want.set(sprite.slice(OLD.length), row.c);
                    else if (!/^https?:/.test(sprite) && /-(sml|lrg)\.png$/.test(sprite)) want.set(sprite, row.c);
                }
            }
        }
    }
    console.log(`  ${want.size} sprites, ${icons.size} furni`);

    console.log("Reading the catalogue's large renders, for the rain of seats");
    const cat = await getJson(`${SITE}/.netlify/functions/furni-catalogue?sprites=1`);
    const classByLarge = new Map();
    /* The OLD renders' filenames come from the frozen old catalogue since the
       live one moved to the new API (5 Oct 2026; _furni-legacy.js). */
    const { legacy } = require(path.join(ROOT, "netlify", "functions", "_furni-legacy.js"));
    for (const item of legacy().items) {
        for (const state of item.largeImages || []) for (const url of state || []) {
            if (url && url.startsWith(OLD) && item.className) classByLarge.set(url.slice(OLD.length), item.className);
        }
    }
    const rainSrc = fs.readFileSync(path.join(ROOT, "js", "furni-rain.js"), "utf8");
    const rainMatch = [...rainSrc.matchAll(/\["([a-z0-9-]+)", \[([^\]]+)\]\]/g)];
    for (const m of rainMatch) {
        // Old-style views only. The new list's single-word classnames
        // ("throne", ["r0/s0"]) still match the pattern above, and their
        // views don't — which made every re-run throw here (2 Oct 2026).
        for (const view of m[2].match(/s\d+-r\d+/g) || []) {
            const file = `${m[1]}-${view}-lrg.png`;
            if (classByLarge.has(file)) want.set(file, classByLarge.get(file));
            else console.log("  rain: no catalogue row for " + file);
        }
    }

    /* Every catalogue class as well (2 Oct 2026, night scan), for noIcon
       only: the Warren's picker can hand-add any of them, and the site then
       sends that furni's icon by classname — so one the new API lacks
       (furni_chair_plasto_lm1, sprinkler…) has to be in noIcon BEFORE it is
       added, not after the next re-run. The picker's own fallback hides
       the gap from the admin, so nobody would see it but visitors. */
    for (const item of cat.items || []) if (item.className) icons.add(item.className);
    /* And Habbo's own growing furni FurniIndex hasn't listed (2 Oct 2026),
       for `grown` below: the Warren can hand-add those too. Only the likely
       names, not all 2,600 unlisted classes. */
    const growNames = (() => { try { return require(path.join(ROOT, "netlify", "functions", "_habbo-names.json")); } catch (e) { return {}; } })();
    const maybeGrows = Object.keys(growNames).filter(c => /^(farm_|fall_|blossom_)|tree|bush|pumpkin|potling/i.test(c + " " + growNames[c][0]));
    const classes = [...new Set([...want.values(), ...icons, ...maybeGrows])];
    console.log(`Asking FurniIndex for ${classes.length} furnidata`);
    const data = new Map();
    await pool(classes, async c => {
        const buf = await getBuffer(`${API}/furnidata/${encodeURIComponent(c)}`, "data-" + safe(c) + ".json");
        try { data.set(c, buf.length ? JSON.parse(buf.toString("utf8")) : null); } catch (e) { data.set(c, null); }
    });

    console.log(`Matching ${want.size} sprites`);
    const sprites = {};
    const misses = [];
    await pool([...want.entries()], async ([file, c]) => {
        const m = file.match(/-s(\d+)-r(\d+)-(sml|lrg)\.png$/);
        const d = data.get(c);
        if (!m || !d) { misses.push(file + (d ? "" : " (no furnidata)")); return; }
        const size = m[3] === "sml" ? "small" : "large";
        const vis = d.visualizations && d.visualizations[size];
        if (!vis || !vis.available) { misses.push(file + " (no " + size + ")"); return; }
        const oldBuf = await getBuffer(OLD + file, "old-" + safe(file));
        if (!oldBuf.length) { misses.push(file + " (old gone)"); return; }
        const oldShape = trim(path.join(CACHE, "old-" + safe(file)));
        // The old state numbers count from 1; try that state first, then the rest.
        const states = Object.keys(vis.states || {});
        const first = String(Number(m[1]) - 1);
        const order = states.includes(first) ? [first, ...states.filter(s => s !== first)] : states;
        let best = { s: 255, p: null };
        for (const st of order) {
            for (const r of (vis.states[st].rotations || vis.rotations || [])) {
                const p = `${c}/${size}/r${r}/s${st}`;
                const name = "new-" + safe(p) + ".png";
                const buf = await getBuffer(`${API}/furni/${encodeURIComponent(c)}/${size}/r${r}/s${st}/noshadow`, name);
                if (!buf.length) continue;
                const s = score(oldShape, trim(path.join(CACHE, name)));
                if (s < best.s) best = { s, p };
                if (s === 0) break;
            }
            if (best.s <= MATCH_MAX) break;
        }
        if (best.p && best.s <= MATCH_MAX) sprites[file] = best.p;
        else misses.push(`${file} (best ${best.s.toFixed(1)})`);
    });

    const noIcon = classes.filter(c => {
        const d = data.get(c);
        return !(d && d.visualizations && d.visualizations.icon && d.visualizations.icon.available);
    }).sort();

    /* FURNI THAT GROW (2 Oct 2026, the owner's): the site shows every tree,
       bush and potted plant that grows at its last growing stage — fully
       grown, fruit and all. FurniIndex's furnidata files them under these
       categories with eight states: s0 a bare plot, s6 fully grown, s7
       withered. So the stage wanted is the one before the last.
       { class: [state, rotation] }, the rotation for a sprite stored with
       no view of its own (a hand-added /small). */
    const GROW_CATEGORIES = new Set(["tree", "bush", "small_bush", "small_plant"]);
    const grown = {};
    for (const c of classes) {
        const d = data.get(c);
        const vis = d && d.visualizations && (d.visualizations.large || d.visualizations.small);
        const states = vis && vis.states ? Object.keys(vis.states).map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [];
        if (!d || !GROW_CATEGORIES.has(d.category) || states.length < 3) continue;
        const state = states[states.length - 2];
        const rotation = ((vis.states[String(state)] || {}).rotations || vis.rotations || [2])[0];
        grown[c] = [state, rotation];
    }

    // Added to, never replaced: once the site serves the new addresses, a
    // re-run only sees the sprites still on the old host, and the ones
    // matched before must survive it.
    const tablePath = path.join(ROOT, "netlify", "functions", "_furni-api-map.json");
    let previous = { sprites: {}, noIcon: [] };
    try { previous = JSON.parse(fs.readFileSync(tablePath, "utf8")); } catch (e) { /* first run */ }
    const merged = { ...(previous.sprites || {}), ...sprites };
    const stillNoIcon = (previous.noIcon || []).filter(c => !data.has(c));
    const out = { built: new Date().toISOString().slice(0, 10), sprites: {}, noIcon: [...new Set([...stillNoIcon, ...noIcon])].sort(), grown: {} };
    for (const k of Object.keys(merged).sort()) out.sprites[k] = merged[k];
    const allGrown = { ...(previous.grown || {}), ...grown };
    for (const k of Object.keys(allGrown).sort()) out.grown[k] = allGrown[k];
    fs.writeFileSync(tablePath, JSON.stringify(out) + "\n");

    console.log(`Matched ${Object.keys(sprites).length} of ${want.size}; ${noIcon.length} furni with no icon on the new API; ${Object.keys(out.grown).length} that grow.`);
    if (misses.length) {
        console.log(`Unmatched (${misses.length}), these keep their old address:`);
        misses.sort().forEach(m => console.log("  " + m));
    }
})().catch(e => { console.error(e); process.exit(1); });

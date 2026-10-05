/* The NEAREST new-API view for every furni picture tools/furni-api-map.js
   could not match (5 Oct 2026, the owner's: the old FurniIndex host is
   being switched off, and every picture the site shows has to come from
   the new API or from the site itself).

   furni-api-map.js insists on a near pixel-perfect match (MATCH_MAX) and
   gives up on any pair more than 8px apart in size. That left 61 of the
   archive's old sprites on the old host: mostly lamps and holograms whose
   new renders are drawn lit, or a few pixels larger, so nothing lines up
   exactly. Here the comparison is of SHAPE and colour at one scale: each
   picture trimmed to its opaque box and resampled to SIDE x SIDE, then the
   mean difference taken (a transparent pixel against an opaque one counts
   as the worst). The old state number (counted from 1) is tried first, as
   the map does; the closest view of the furni wins whatever its score,
   and the score is written beside it.

   WHAT IT WRITES
     - netlify/functions/_furni-api-map.json: the picks added to `sprites`
       (never over a pixel match already there), and listed in `nearest`
       with their scores, so the map tool's own re-runs can tell them apart;
     - tools/.cache/furni-api/nearest-sheet.png: every pick, old beside new,
       to be checked by eye before it ships.

   It reads the same cache as furni-api-map.js (tools/.cache/furni-api) and
   asks FurniIndex only for what that cache lacks, four at a time.

   usage: node tools/furni-api-nearest.js [--site http://localhost:8888] */

const fs = require("fs");
const path = require("path");
const { readPng } = require("./png-decode.js");
const { encodePng } = require("../netlify/functions/_png.js");

const argv = process.argv.slice(2);
const siteArg = argv.indexOf("--site");
const SITE = siteArg > -1 ? argv[siteArg + 1] : "http://localhost:8888";
const API = "https://api.furniindex.com";
const OLD = "https://furniindex.com/image/furni/furni-";
const ROOT = path.join(__dirname, "..");
const CACHE = path.join(__dirname, ".cache", "furni-api");
const MAP_FILE = path.join(ROOT, "netlify", "functions", "_furni-api-map.json");
const SIDE = 24;
const CONCURRENCY = 4;
const safe = s => s.replace(/[^a-z0-9._-]+/gi, "_");
fs.mkdirSync(CACHE, { recursive: true });

async function getBuffer(url, file) {
    const where = path.join(CACHE, file);
    if (fs.existsSync(where)) return fs.readFileSync(where);
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "MazeRats/1.0 (+https://mazerats.net)" } });
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
async function pool(items, fn) {
    let next = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (next < items.length) await fn(items[next++]);
    }));
}

// Trimmed to the opaque box, then resampled (nearest) to SIDE x SIDE.
function shape(file) {
    const img = readPng(file);
    let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
        if (img.rgba[(y * img.w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const cells = [];
    for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
        const x = x0 + Math.min(w - 1, Math.floor((i + 0.5) * w / SIDE));
        const y = y0 + Math.min(h - 1, Math.floor((j + 0.5) * h / SIDE));
        const k = (y * img.w + x) * 4;
        cells.push(img.rgba[k + 3] > 16 ? [img.rgba[k], img.rgba[k + 1], img.rgba[k + 2]] : null);
    }
    return { cells, ratio: w / h, img };
}
function score(a, b) {
    let sum = 0, n = 0;
    for (let i = 0; i < a.cells.length; i++) {
        const p = a.cells[i], q = b.cells[i];
        if (!p && !q) continue;
        n++;
        sum += (!p || !q) ? 255 : (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])) / 3;
    }
    // A different outline shape is a different view: its aspect counts too.
    const aspect = Math.abs(Math.log(a.ratio / b.ratio)) * 120;
    return n ? sum / n + aspect : 255;
}

(async () => {
    const map = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
    const want = new Map();     // old filename -> className
    for (const name of ["rooms", "events"]) {
        const j = await (await fetch(`${SITE}/.netlify/functions/${name}`)).json();
        for (const rec of j.rooms || []) for (const hits of Object.values(rec.furni || {})) for (const [index, sprite] of hits) {
            const row = (j.f || [])[index];
            if (row && row.c && typeof sprite === "string" && sprite.startsWith(OLD)) want.set(sprite.slice(OLD.length), row.c);
        }
    }
    console.log(`${want.size} old sprites still on the old host`);

    const picks = [], misses = [];
    await pool([...want.entries()], async ([file, c]) => {
        const m = file.match(/-s(\d+)-r(\d+)-(sml|lrg)\.png$/);
        const dataBuf = await getBuffer(`${API}/furnidata/${encodeURIComponent(c)}`, "data-" + safe(c) + ".json");
        let d = null;
        try { d = dataBuf.length ? JSON.parse(dataBuf.toString("utf8")) : null; } catch (e) { d = null; }
        if (!m || !d) { misses.push(`${file} [${c}] (${d ? "no view in the name" : "not on the new API"})`); return; }
        const size = m[3] === "sml" ? "small" : "large";
        const vis = d.visualizations && d.visualizations[size];
        if (!vis || !vis.available || !vis.states) { misses.push(`${file} [${c}] (no ${size} pictures)`); return; }
        const oldBuf = await getBuffer(OLD + file, "old-" + safe(file));
        if (!oldBuf.length) { misses.push(`${file} [${c}] (old picture gone)`); return; }
        const old = shape(path.join(CACHE, "old-" + safe(file)));
        const first = String(Number(m[1]) - 1);
        const states = Object.keys(vis.states);
        let best = null;
        for (const st of states) {
            for (const r of (vis.states[st].rotations || vis.rotations || [])) {
                const p = `${c}/${size}/r${r}/s${st}`;
                const name = "new-" + safe(p) + ".png";
                const buf = await getBuffer(`${API}/furni/${encodeURIComponent(c)}/${size}/r${r}/s${st}/noshadow`, name);
                if (!buf.length) continue;
                const cand = shape(path.join(CACHE, name));
                if (!cand) continue;
                // The old state strongly preferred: a lamp drawn lit, as it was, not off.
                const s = score(old, cand) + (st === first ? 0 : 35);
                if (!best || s < best.s) best = { s, p, cand };
            }
        }
        if (best) picks.push({ file, c, p: best.p, s: best.s, old, cand: best.cand });
        else misses.push(`${file} [${c}] (no new picture loaded)`);
    });

    picks.sort((a, b) => b.s - a.s);
    map.sprites = map.sprites || {};
    map.nearest = map.nearest || {};
    let added = 0;
    for (const k of picks) {
        if (map.sprites[k.file]) continue;
        map.sprites[k.file] = k.p;
        map.nearest[k.file] = Math.round(k.s * 10) / 10;
        added++;
    }
    fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 1) + "\n");
    console.log(`Added ${added} nearest views; ${misses.length} with nothing on the new API:`);
    misses.sort().forEach(x => console.log("  " + x));

    // The sheet: one row per pick, old | new, each in a 90px cell, worst first.
    const CELL = 90, COLS = 4, rows = Math.ceil(picks.length / COLS);
    const W = COLS * CELL * 2 + (COLS - 1) * 10, H = Math.max(1, rows) * CELL;
    const out = Buffer.alloc(W * H * 4);
    for (let i = 0; i < out.length; i += 4) { out[i] = 46; out[i + 1] = 36; out[i + 2] = 24; out[i + 3] = 255; }
    const blit = (img, ox, oy) => {
        const sc = Math.max(1, Math.min(2, Math.floor((CELL - 6) / Math.max(img.w, img.h))) || 1);
        const fit = Math.min(1, (CELL - 6) / (Math.max(img.w, img.h) * sc));
        const dw = Math.floor(img.w * sc * fit), dh = Math.floor(img.h * sc * fit);
        const bx = ox + Math.floor((CELL - dw) / 2), by = oy + Math.floor((CELL - dh) / 2);
        for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
            const sx = Math.floor(x * img.w / dw), sy = Math.floor(y * img.h / dh);
            const k = (sy * img.w + sx) * 4;
            if (img.rgba[k + 3] < 16) continue;
            const t = ((by + y) * W + (bx + x)) * 4;
            out[t] = img.rgba[k]; out[t + 1] = img.rgba[k + 1]; out[t + 2] = img.rgba[k + 2]; out[t + 3] = 255;
        }
    };
    picks.forEach((k, i) => {
        const col = i % COLS, row = Math.floor(i / COLS);
        const ox = col * (CELL * 2 + 10), oy = row * CELL;
        blit(k.old.img, ox, oy);
        blit(k.cand.img, ox + CELL, oy);
    });
    fs.writeFileSync(path.join(CACHE, "nearest-sheet.png"), encodePng(W, H, out));
    fs.writeFileSync(path.join(CACHE, "nearest-sheet.txt"), picks.map((k, i) => `${i + 1}. ${k.c}  ${k.file} -> ${k.p}  (${k.s.toFixed(1)})`).join("\n") + "\n");
    console.log(`Sheet: tools/.cache/furni-api/nearest-sheet.png (${picks.length} pairs, worst first)`);
})().catch(e => { console.error(e); process.exit(1); });

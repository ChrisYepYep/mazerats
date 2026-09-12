/* Checks what Director's built-in palette -2 actually is, against the
   published artwork, so the answer in tools/furni-extract.js can be re-run
   rather than taken on trust.

   ----------------------------------------------------------------------
   THE PROBLEM

   Half the furni in this client are 8-bit, and a palette-indexed bitmap is
   meaningless without its table. Most name a CLUT that ships in the same
   cast. 951 of them name member -2 instead, with the castLib beside it set to
   -1, "this movie" — which is Director's way of saying one of its BUILT-IN
   palettes, and those are in the Director runtime, not in the .cct files.

   548 of those are furni artwork, across 126 classes, and every one was
   thrown away by furni-extract as "an unresolvable palette". That included
   chair_plasto, which levels in this game actually use.

   ----------------------------------------------------------------------
   WHAT IT IS, AND HOW THAT WAS SETTLED

   colour(i) = (255 - i, 255 - i, 255 - i). A 256-step greyscale, white at
   index 0 down to black at 255.

   Four cheaper ideas were tried first and all of them failed their own
   calibration, which is why this one is written down rather than the answer
   alone:

     the 32-bit twins     46 layers ship the same shape at 8 and 32 bits, but
                          they are RECOLOUR twins — funky_sofa_polyfon against
                          sofa_dpolyfon — deliberately different colours.
     a resolvable sibling 272 of the -2 layers sit in classes that also have
                          layers with a working palette, but their index
                          histograms overlap by 95% or more in only 2 classes
                          of 69, and by nothing at all in many. Different
                          table, not a slip.
     smoothness           scoring the client's 951 CLUTs by how smoothly they
                          shade the artwork. On layers where the answer is
                          KNOWN the true palette ranked about #690 of 951; the
                          winners are degenerate near-flat tables.
     thumbnail colours    50 classes ship a catalogue thumbnail whose palette
                          resolves, giving that furni's real colours. Scoring
                          candidates by how near the decoded colours land to
                          them picked the true palette for 2 classes of 40: a
                          nearest-colour test just rewards dense palettes.

   WHAT DOES WORK is to stop searching and predict. If the artwork is grey,
   then a -2 furni gets its colour the way every recolour does — the client
   multiplies each part by its partcolor, one colour per part by letter, which
   js/room-furni.js already reproduces. So what FurniIndex published can be
   computed from the client's indices alone:

       predicted = grey(255 - index) * partcolor / 255

   and compared with the real render, pixel for pixel. That is this tool.

   ----------------------------------------------------------------------
   WHAT IT MEASURED

     summer_chair   eight colourways — aqua, black, green, pink, red, white,
                    yellow and plain — 98.2% to 99.5% of pixels within 3
                    levels, mean error 0.6 to 2.8. EIGHT DIFFERENT TINTS OVER
                    ONE GREY SOURCE, ALL AGREEING, is the argument: a wrong
                    palette cannot survive being multiplied eight ways.
     wood_tv        no partcolors, so the palette bare: 100.0% within 3
                    levels, mean error 0.0.

   18 of 24 renders came out at 90% or better. The six that did not are a
   television and a fireplace matched against the wrong ANIMATION FRAME, plus
   the fire itself, which carries a blend ink and so is composited with what
   is behind it rather than being the palette colour on screen. That is the
   same reason tiki_waterfall is skipped here despite using 246 of the 255
   indices — its water is blended, and it scores 64% if allowed through.

   A published render is used as a MEASURING STICK and nothing else. No pixel
   of it reaches the game; the artwork the game draws is the client's own.

   usage: node tools/palette-recover.js [--site http://localhost:8888]
          needs the dev server up, for the catalogue and furnidata.
*/

const fs = require("fs");
const path = require("path");

const { openCast, readMember, unpackBits } = require("./cct-extract.js");
const { decodePng } = require("./png-decode.js");

const CLIENT = process.env.HABBO_CLIENT ||
    "C:\\Users\\cjboy\\AppData\\Roaming\\Habbo Launcher\\downloads\\shockwave\\350";
const CACHE = path.join(__dirname, ".cache", "furniindex");

const argv = process.argv.slice(2);
const siteArg = argv.indexOf("--site");
const SITE = siteArg > -1 ? argv[siteArg + 1] : "http://localhost:8888";

const MEMBER = /^(.+)_([a-z])_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)$/;
const baseClass = (c) => String(c || "").replace(/\*\d+$/, "");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// THE ANSWER UNDER TEST.
const grey = (i) => { const v = 255 - i; return [v, v, v]; };

async function grab(url) {
    fs.mkdirSync(CACHE, { recursive: true });
    const file = path.join(CACHE, url.split("/").pop());
    if (!fs.existsSync(file)) {
        const res = await fetch(url);
        if (!res.ok) return null;
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        await sleep(250);              // one at a time, and not fast
    }
    try {
        const d = decodePng(fs.readFileSync(file));
        return { w: d.w, h: d.h, rgba: d.rgba, file: path.basename(file) };
    } catch { return null; }
}

/* Every -2 sprite in the client, composed per (class, state, direction), as
   an index image plus which PART wrote each pixel — the part decides which
   partcolor applies. Parts the class's .props marks as ink 33 or blend under
   100 are left out: what was published for those is a composite, not the
   palette colour. */
function sprites(want) {
    const groups = new Map(), blended = new Map();

    for (const f of fs.readdirSync(CLIENT)
        .filter(x => /^hh_furni.*\.cct$/i.test(x))
        .filter(x => !/_50\.cct$|_small\.cct$/i.test(x))) {
        let cast;
        try { cast = openCast(path.join(CLIENT, f)); } catch { continue; }

        const props = new Map();
        for (const e of cast.res.filter(x => x.tag === "CASt")) {
            let m;
            try { m = readMember(cast.chunk(e)); } catch { continue; }
            if (!m || !m.name) continue;

            if (m.name.endsWith(".props")) {
                const sid = cast.childOf.get(`${e.id}:STXT`);
                if (sid === undefined) continue;
                try {
                    const b = cast.chunk(cast.byId.get(sid));
                    const off = b.readUInt32BE(0), len = b.readUInt32BE(4);
                    props.set(m.name.slice(0, -6), b.toString("latin1", off, off + len));
                } catch { /* a class with no readable props blends nothing */ }
                continue;
            }
            if (!m.bitmap) continue;
            const p = MEMBER.exec(m.name);
            if (!p || !want.has(p[1])) continue;
            const { pitch, w, h, regX, regY, bitDepth, paletteMember } = m.bitmap;
            if (bitDepth !== 8 || paletteMember !== -2 || w <= 1 || h <= 1) continue;

            const bitdId = cast.childOf.get(`${e.id}:BITD`);
            if (bitdId === undefined) continue;
            let bytes;
            try {
                const raw = cast.chunk(cast.byId.get(bitdId));
                bytes = raw.length === pitch * h ? raw : unpackBits(raw, pitch * h);
            } catch { continue; }
            if (!bytes || bytes.length < pitch * h) continue;

            const key = `${p[1]}|${p[7]}|${p[6]}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ part: p[2], pitch, w, h, regX, regY, bytes });
        }

        for (const [cls, text] of props) {
            const keys = [...text.matchAll(/"([a-z])"\s*:/g)];
            for (let i = 0; i < keys.length; i++) {
                const part = keys[i][1];
                const body = text.slice(keys[i].index + keys[i][0].length,
                    i + 1 < keys.length ? keys[i + 1].index : text.length);
                const ink = /#?ink"?\s*:\s*(\d+)/.exec(body);
                const bl = /#?blend"?\s*:\s*(\d+)/.exec(body);
                if ((ink && ink[1] !== "36" && ink[1] !== "8") || (bl && Number(bl[1]) < 100)) {
                    if (!blended.has(cls)) blended.set(cls, new Set());
                    blended.get(cls).add(part);
                }
            }
        }
    }

    const out = [];
    for (const [key, layers] of groups) {
        const cls = key.split("|")[0];
        const bad = blended.get(cls) || new Set();
        const use = layers.filter(l => !bad.has(l.part)).sort((a, b) => (a.part < b.part ? -1 : 1));
        if (!use.length) continue;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const l of use) {
            minX = Math.min(minX, -l.regX); minY = Math.min(minY, -l.regY);
            maxX = Math.max(maxX, -l.regX + l.w); maxY = Math.max(maxY, -l.regY + l.h);
        }
        const W = maxX - minX, H = maxY - minY;
        if (W <= 0 || H <= 0 || W > 600 || H > 600) continue;

        const idx = new Uint8Array(W * H), part = new Uint8Array(W * H);
        for (const l of use) {                       // part order, later over earlier
            const ox = -l.regX - minX, oy = -l.regY - minY;
            for (let y = 0; y < l.h; y++) {
                for (let x = 0; x < l.w; x++) {
                    const v = l.bytes[y * l.pitch + x];
                    if (!v) continue;
                    const o = (oy + y) * W + ox + x;
                    idx[o] = v;
                    part[o] = l.part.charCodeAt(0) - 96;
                }
            }
        }
        let n = 0;
        for (const v of idx) if (v) n++;
        if (n > 40) out.push({ cls, key, W, H, idx, part, n });
    }
    return out;
}

/* Slide our indices over the render and keep the placement the prediction fits
   best. The alignment needs no separate search: only the right one can make
   the prediction agree, so the score chooses the offset and judges it at
   once. */
function fit(s, img, mirror, pc) {
    let best = null;
    for (let oy = -8; oy <= img.h - s.H + 8; oy++) {
        for (let ox = -8; ox <= img.w - s.W + 8; ox++) {
            let close = 0, n = 0, err = 0;
            for (let y = 0; y < s.H; y++) {
                for (let x = 0; x < s.W; x++) {
                    const o = y * s.W + x;
                    if (!s.idx[o]) continue;
                    const fx = ox + (mirror ? s.W - 1 - x : x), fy = oy + y;
                    if (fx < 0 || fy < 0 || fx >= img.w || fy >= img.h) continue;
                    const q = (fy * img.w + fx) * 4;
                    if (img.rgba[q + 3] < 250) continue;
                    const g = grey(s.idx[o]);
                    const t = pc[s.part[o] - 1];
                    const pred = t ? g.map((v, j) => Math.round(v * t[j] / 255)) : g;
                    const d = Math.max(
                        Math.abs(pred[0] - img.rgba[q]),
                        Math.abs(pred[1] - img.rgba[q + 1]),
                        Math.abs(pred[2] - img.rgba[q + 2]));
                    if (d <= 3) close++;
                    err += d; n++;
                }
            }
            if (n < s.n * 0.9) continue;          // barely overlapping is not a fit
            const r = { pct: close / n, mean: err / n, n };
            if (!best || r.pct > best.pct) best = r;
        }
    }
    return best;
}

async function main() {
    const meta = (await fetch(`${SITE}/.netlify/functions/furni-meta`).then(r => r.json())).items || {};
    const cat = await fetch(`${SITE}/.netlify/functions/furni-catalogue?sprites=1`).then(r => r.json());

    const byBase = new Map();
    for (const row of cat.items || []) {
        if (!row.className) continue;
        const b = baseClass(row.className);
        if (!byBase.has(b)) byBase.set(b, []);
        byBase.get(b).push(row);
    }

    const all = sprites(new Set(byBase.keys()));
    const classes = [...new Set(all.map(s => s.cls))];
    console.log(`palette -2 as grey(255 - index), against published renders`);
    console.log(`${all.length} composed sprites across ${classes.length} published classes\n`);

    let good = 0, total = 0;
    for (const cls of classes) {
        const mine = all.filter(s => s.cls === cls);
        for (const row of byBase.get(cls)) {
            const m = meta[row.className] || {};
            /* partcolors, by LETTER — the same rule js/room-furni.js follows.
               "0", white and anything not a #hex mean no tint. */
            const pc = (m.pc || []).map(v => {
                const s = String(v || "").trim().toLowerCase();
                if (!/^#[0-9a-f]{6}$/.test(s) || s === "#ffffff") return null;
                return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
            });
            for (const url of (row.largeImages || []).flat().filter(Boolean)) {
                const img = await grab(url);
                if (!img) continue;
                let best = null;
                for (const s of mine) {
                    for (const mirror of [false, true]) {
                        const r = fit(s, img, mirror, pc);
                        if (r && (!best || r.pct > best.pct)) best = { ...r, key: s.key };
                    }
                }
                if (!best) continue;
                total++;
                if (best.pct >= 0.9) good++;
                console.log(`  ${row.className.padEnd(22)} ${(best.pct * 100).toFixed(1).padStart(5)}%` +
                    ` within 3   mean ${best.mean.toFixed(1).padStart(5)}   ${best.n}px   ${best.key}   ${img.file}`);
            }
        }
    }
    console.log(`\n${good} of ${total} renders predicted to 90% or better`);
    console.log(`A failure here is usually the wrong animation frame or a blended part,`);
    console.log(`not the palette — see the note at the top before changing anything.`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });

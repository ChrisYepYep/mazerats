/* Renders a scan's findings as something a person can actually judge.

   The scan reports a coverage percentage, and a percentage is not evidence:
   it says how much of a sprite agreed, not whether the thing is really in
   the room. This draws, for every candidate, the FURNI'S OWN ARTWORK beside
   THE ROOM'S ACTUAL PIXELS at the position the scan claims it sits. If the
   two halves of a cell show the same object it is a real hit; if the left
   is a Double Bed and the right is a potted tree, it is not. That comparison
   is what set MIN_COVERAGE in _furni-match.js, and it is how to re-set it if
   the archive or the catalogue changes character.

   Runs with NO coverage floor by default, because the entire point is to see
   what is being rejected as well as what is being kept.

     node tools/furni-verify.js --maze "Original Maze"
     node tools/furni-verify.js --image "assets/rooms/…/Room 005.png"
     node tools/furni-verify.js --maze "The Little Maze" --floor 0.15

   Writes tools/.cache/verify-<something>.png and prints the reading order.
   Colour of the stripe above each pair: green >=25%, amber 15-25%,
   orange 10-15%, red below 10%.
*/

const fs = require("fs");
const path = require("path");

require("./_env.js").loadEnv(["MONGODB_URI"]);

const { decodePng } = require("../netlify/functions/_png.js");
const { scanRoom } = require("../netlify/functions/_furni-match.js");
const { getCatalogue } = require("../netlify/functions/furni-catalogue.js");
const { spriteList, spriteCacheKey } = require("../netlify/functions/_furni-sprites.js");
const { imageUrl } = require("../netlify/functions/_url.js");
const { getDb } = require("../netlify/functions/_db.js");
const { encodePng } = require("./png-encode.js");

const CACHE = path.join(__dirname, ".cache", "sprites");
const SITE = process.env.SCAN_SITE_URL || "https://mazerats.net";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = argv.indexOf("--" + name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const MAZE = opt("maze", null);
const IMAGE = opt("image", null);
const FLOOR = Number(opt("floor", 0)) || 0;

const CELL = 150, GAP = 8, COLS = 6, TOP = 20;

function draw(out, W, H, src, sx, sy, sw, sh, dx, dy, box, bg) {
    const sc = Math.min(1, box / sw, box / sh);
    const ow = Math.max(1, Math.round(sw * sc)), oh = Math.max(1, Math.round(sh * sc));
    const ox = dx + ((box - ow) >> 1), oy = dy + ((box - oh) >> 1);
    for (let y = 0; y < oh; y++) {
        for (let x = 0; x < ow; x++) {
            const px = sx + Math.floor(x / sc), py = sy + Math.floor(y / sc);
            if (px < 0 || py < 0 || px >= src.width || py >= src.height) continue;
            const so = (py * src.width + px) * 4, a = src.data[so + 3] / 255;
            const dxx = ox + x, dyy = oy + y;
            if (dxx < 0 || dyy < 0 || dxx >= W || dyy >= H) continue;
            const o = (dyy * W + dxx) * 4;
            out[o] = Math.round(src.data[so] * a + bg * (1 - a));
            out[o + 1] = Math.round(src.data[so + 1] * a + bg * (1 - a));
            out[o + 2] = Math.round(src.data[so + 2] * a + bg * (1 - a));
            out[o + 3] = 255;
        }
    }
}

(async () => {
    const db = await getDb();
    const docs = await db.collection("rooms").find({}).toArray();

    let target = null;
    for (const d of docs) {
        for (const [image, rec] of Object.entries(d.furni || {})) {
            if (IMAGE ? image === IMAGE : (MAZE && new RegExp(MAZE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(d.name) && rec.scannedAt)) {
                target = { maze: d.name, image };
                break;
            }
        }
        if (target) break;
    }
    if (!target) {
        console.error("No matching room image. Pass --maze or --image.");
        process.exit(1);
    }
    console.log(`${target.maze}\n${target.image}\n`);

    const catalogue = await getCatalogue();
    const sprites = [];
    for (const s of spriteList(catalogue)) {
        const file = path.join(CACHE, s.blobKey);
        if (fs.existsSync(file)) sprites.push({ key: s.key, url: s.url, buffer: fs.readFileSync(file) });
    }
    console.log(`${sprites.length} sprites loaded — scanning (this takes ~30s) …`);

    const res = await fetch(imageUrl(SITE, target.image));
    if (!res.ok) { console.error(`room image ${res.status}`); process.exit(1); }
    const roomBuffer = Buffer.from(await res.arrayBuffer());
    const room = decodePng(roomBuffer);

    const result = scanRoom(roomBuffer, sprites, { minCoverage: FLOOR });
    if (result.skipped) { console.log(`skipped: ${result.skipped} (${result.roomColours} colours)`); process.exit(0); }
    const hits = result.hits.slice().sort((a, b) => b.coverage - a.coverage);
    console.log(`${hits.length} candidates at floor ${FLOOR}\n`);

    const CW = CELL * 2 + GAP * 3, CH = CELL + TOP + GAP;
    const rows = Math.ceil(hits.length / COLS);
    const W = COLS * CW, H = Math.max(1, rows * CH);
    const out = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { out[i * 4] = 16; out[i * 4 + 1] = 16; out[i * 4 + 2] = 20; out[i * 4 + 3] = 255; }

    hits.forEach((h, n) => {
        const bx = (n % COLS) * CW + GAP, by = ((n / COLS) | 0) * CH + TOP;
        const c = h.coverage;
        const s = c >= 0.25 ? [70, 200, 100] : c >= 0.15 ? [225, 175, 55] : c >= 0.10 ? [230, 120, 50] : [225, 65, 65];
        for (let x = 0; x < CELL * 2 + GAP; x++) {
            for (let y = 0; y < 7; y++) {
                const o = ((by - 13 + y) * W + bx + x) * 4;
                if (o >= 0 && o < out.length) { out[o] = s[0]; out[o + 1] = s[1]; out[o + 2] = s[2]; out[o + 3] = 255; }
            }
        }
        let sp = null;
        if (h.sprite) { try { sp = decodePng(fs.readFileSync(path.join(CACHE, spriteCacheKey(h.sprite)))); } catch { /* drawn blank */ } }
        if (sp) draw(out, W, H, sp, 0, 0, sp.width, sp.height, bx, by, CELL, 45);
        draw(out, W, H, room, h.at[0], h.at[1], sp ? sp.width : 110, sp ? sp.height : 110, bx + CELL + GAP, by, CELL, 16);
    });

    const slug = (target.maze || "room").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const dest = path.join(__dirname, ".cache", `verify-${slug}.png`);
    fs.writeFileSync(dest, encodePng(W, H, out));

    console.log("stripe: GREEN >=25%  AMBER 15-25%  ORANGE 10-15%  RED <10%\n");
    hits.forEach((h, n) => console.log(
        String(n + 1).padStart(3) + ". " + String(Math.round(h.coverage * 100)).padStart(3) + "%  " +
        String(h.matched).padStart(5) + "  " + catalogue.items[h.key].name));
    console.log(`\n${path.relative(process.cwd(), dest)}  (${W}x${H})`);
    process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });

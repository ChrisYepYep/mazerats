/* tools/ff-standins-build.js: Fallin' Furni's six stand-in habbos, three male
   and three female (4 Nov 2026, the owner's). Habbo Origins goes offline for
   maintenance breaks, and a player with no remembered look picks one of these.

   Asks Habbo's imaging service once for every picture the game draws (eight
   directions; standing, sitting, four walking frames; both sizes) and lays
   each figure's pictures out in one PNG, untouched, so the game keeps working
   when that service is down too:

       assets/img/standins/<id>-<size>.png

   A row per action (std, sit, wlk0-3), a column per direction, every cell the
   size in CELL. Rerun only to change a figure: the list here and STAND_INS in
   js/fallinfurni.js are the same six, in the same order.

       node tools/ff-standins-build.js          (checks every cell after writing) */
const fs = require("fs");
const path = require("path");
const { decodePng, encodePng } = require("../netlify/functions/_png");

const STAND_INS = [
    { id: "m1", figure: "hd-180-1.hr-100-61.ch-210-82.lg-270-64.sh-290-80" },
    { id: "m2", figure: "hd-180-2.hr-115-64.ch-255-64.lg-275-62.sh-300-62" },
    { id: "m3", figure: "hd-180-3.hr-145-42.ch-215-73.lg-280-82.sh-290-62" },
    { id: "f1", figure: "hd-600-2.hr-890-34.ch-660-71.lg-700-92.sh-730-71" },
    { id: "f2", figure: "hd-600-1.hr-515-45.ch-665-73.lg-710-82.sh-725-92" },
    { id: "f3", figure: "hd-600-3.hr-515-61.ch-630-85.lg-715-64.sh-725-62" }
];
const SIZES = ["s", "l"];
const ACTIONS = [["std", 0], ["sit", 0], ["wlk", 0], ["wlk", 1], ["wlk", 2], ["wlk", 3]];
const DIRS = [0, 1, 2, 3, 4, 5, 6, 7];
const OUT = path.join(__dirname, "..", "assets", "img", "standins");

// As habbo.js asks: the WAF in front of the service refuses a plain client.
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "image/png,image/*,*/*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Referer": "https://www.habbo.com/"
};

async function ask(figure, size, dir, action, frame) {
    const url = "https://www.habbo.com/habbo-imaging/avatarimage?" + new URLSearchParams({
        figure, size, direction: String(dir), head_direction: String(dir),
        action, frame: String(frame), gesture: "sml"
    });
    for (let tries = 0; ; tries++) {
        const res = await fetch(url, { headers: HEADERS });
        const buf = Buffer.from(await res.arrayBuffer());
        if (res.ok && buf.slice(1, 4).toString() === "PNG") return decodePng(buf);
        if (tries >= 2) throw new Error(`${res.status} for ${figure} ${size} ${action} ${dir}`);
        await new Promise((r) => setTimeout(r, 1500));
    }
}

function sameCell(sheet, cw, col, row, cell) {
    for (let y = 0; y < cell.height; y++) {
        for (let x = 0; x < cell.width; x++) {
            const a = ((row * cell.height + y) * sheet.width + col * cw + x) * 4;
            const b = (y * cell.width + x) * 4;
            for (let c = 0; c < 4; c++) {
                // Fully clear is fully clear, whatever colour it nominally had.
                if (sheet.data[a + 3] === 0 && cell.data[b + 3] === 0) break;
                if (sheet.data[a + c] !== cell.data[b + c]) return false;
            }
        }
    }
    return true;
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    for (const { id, figure } of STAND_INS) {
        for (const size of SIZES) {
            const cells = [];
            for (const [action, frame] of ACTIONS) {
                cells.push(await Promise.all(DIRS.map((d) => ask(figure, size, d, action, frame))));
            }
            const dims = new Set(cells.flat().map((c) => c.width + "x" + c.height));
            if (dims.size !== 1) throw new Error(`${id}-${size}: cells differ: ${[...dims]}`);
            const { width: cw, height: ch } = cells[0][0];
            const w = cw * DIRS.length, h = ch * ACTIONS.length;
            const rgba = Buffer.alloc(w * h * 4);
            cells.forEach((row, r) => row.forEach((c, col) => {
                for (let y = 0; y < ch; y++) {
                    c.data.copy(rgba, ((r * ch + y) * w + col * cw) * 4, y * cw * 4, (y + 1) * cw * 4);
                }
            }));
            const file = path.join(OUT, `${id}-${size}.png`);
            const png = encodePng(w, h, rgba);
            fs.writeFileSync(file, png);
            const back = decodePng(fs.readFileSync(file));
            cells.forEach((row, r) => row.forEach((c, col) => {
                if (!sameCell(back, cw, col, r, c)) throw new Error(`${id}-${size}: cell ${r},${col} differs`);
            }));
            console.log(`${id}-${size}.png  ${w}x${h}  cell ${cw}x${ch}  ${png.length} bytes  48 cells exact`);
        }
    }
})().catch((e) => { console.error(e); process.exit(1); });

/* Draws assets/img/modal_arrow_prev.png and modal_arrow_next.png.

   The picture viewer's arrows, to sit beside its X. Derived from the close
   sprite rather than invented: the same 14x13 box in the same ink, with the
   X's 1px diagonals and its seven rows (y3..y9) folded into one arrow. Only
   the glyph inside changes. tools/themes.js recolours them with the X.

     node tools/make-gallery-arrows.js
*/

const fs = require("fs");
const path = require("path");
const { decodePng, encodePng } = require("./theme-png.js");

const DIR = path.join(__dirname, "..", "assets", "img");
const src = decodePng(fs.readFileSync(path.join(DIR, "modal_topclose_x.png")));
const { width: W, height: H } = src;
const at = (x, y) => (y * W + x) * 4;

// The arrow's column on each row from y3 to y9: 4px wide, centred as the X is.
const COLS = { prev: [8, 7, 6, 5, 6, 7, 8], next: [5, 6, 7, 8, 7, 6, 5] };

for (const [name, cols] of Object.entries(COLS)) {
    const out = Buffer.from(src.data);
    const ink = src.data.subarray(at(1, 1), at(1, 1) + 4);
    /* Unlike the X, which sits on the dark overlay, these can sit over the
       picture on a phone: the box is filled and edged with a dark wash, X
       cleared, so its lines read over anything. */
    const WASH = Buffer.from([0, 0, 0, 170]);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const onBorder = (x === 1 || x === W - 2) && y >= 1 && y <= H - 2 || (y === 1 || y === H - 2) && x >= 1 && x <= W - 2;
            if (!onBorder) WASH.copy(out, at(x, y));
        }
    }
    cols.forEach((x, i) => { ink.copy(out, at(x, 3 + i)); });
    fs.writeFileSync(path.join(DIR, `modal_arrow_${name}.png`), encodePng(W, H, out));
}

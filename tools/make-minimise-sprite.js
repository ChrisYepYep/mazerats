/* Draws assets/img/console/cnsl-top-minimise.png.

   The console has always had a close button (cnsl-top-x-close.png) and never
   needed a minimise one, because on the website it is a panel you dismiss.
   The desktop dev-server console is a real window, so it needs both — and a
   minimise button drawn by hand in a different style would be obvious next
   to the original at 2x.

   So it is derived from the close sprite rather than invented: the same 13x13
   box, the same 1px yellow margin, the same #996600 border, and the X's own
   horizontal span (x3..x9) reused as the width of the minimise bar. Only the
   glyph inside changes.

     node tools/make-minimise-sprite.js
*/

const fs = require("fs");
const path = require("path");
const { decodePng } = require("../netlify/functions/_png.js");
const { encodePng } = require("./png-encode.js");

const DIR = path.join(__dirname, "..", "assets", "img", "console");
const SOURCE = path.join(DIR, "cnsl-top-x-close.png");
const DEST = path.join(DIR, "cnsl-top-minimise.png");

const INK = [0x99, 0x66, 0x00];      // #996600, the console's brown
// The bar: same row the X's centre occupies, same horizontal reach as its arms.
const BAR_ROW = 8;
const BAR_FROM = 3;
const BAR_TO = 9;

const src = decodePng(fs.readFileSync(SOURCE));
const { width: W, height: H } = src;
const out = Buffer.from(src.data);            // start from the real button

const at = (x, y) => (y * W + x) * 4;
const isInk = (x, y) => {
    const o = at(x, y);
    return src.data[o] === INK[0] && src.data[o + 1] === INK[1] && src.data[o + 2] === INK[2];
};

/* Clear the X. Everything inside the border box (x2..x10, y2..y10) that is
   ink belongs to the glyph — the border itself sits at x1/x11 and y1/y11, so
   restricting to the interior leaves the frame untouched without needing to
   know where the strokes run. */
for (let y = 2; y <= H - 3; y++) {
    for (let x = 2; x <= W - 3; x++) {
        if (!isInk(x, y)) continue;
        const o = at(x, y);
        out[o] = 0xff; out[o + 1] = 0xcb; out[o + 2] = 0x00;   // back to #ffcb00
        out[o + 3] = 255;
    }
}

for (let x = BAR_FROM; x <= BAR_TO; x++) {
    const o = at(x, BAR_ROW);
    out[o] = INK[0]; out[o + 1] = INK[1]; out[o + 2] = INK[2]; out[o + 3] = 255;
}

fs.writeFileSync(DEST, encodePng(W, H, out));
console.log(`wrote ${path.relative(process.cwd(), DEST)} — ${W}x${H}`);

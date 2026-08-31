/* Builds tools/mazerats.ico from the site's own console icon, for the
   Desktop/taskbar shortcut that opens the dev-server console.

   Windows wants a multi-resolution .ico and will pick whichever size the
   context calls for; handing it one bitmap to rescale gives a blurry mess in
   at least one place. Every size here is drawn from the original 20x36
   artwork with NEAREST-NEIGHBOUR sampling, because this is pixel art and any
   smoothing turns it to mush at exactly the sizes people actually see.

   Entries are BMP (DIB), not PNG. The ICO format has allowed PNG entries
   since Vista and they are much smaller — but they are decoded by the
   Windows shell only. Anything going through GDI+ (System.Drawing.Icon,
   which is how this file gets checked, and what a WinForms window uses for
   its own title-bar icon) cannot read them: ToBitmap() throws "requested
   range extends past the end of the array" and a request for the 256px
   entry silently returns the 128. BMP is understood by both, so BMP it is.

     node tools/make-icon.js
*/

const fs = require("fs");
const path = require("path");
const { decodePng } = require("../netlify/functions/_png.js");

const SOURCE = path.join(__dirname, "..", "assets", "img", "console-icon.png");
const DEST = path.join(__dirname, "mazerats.ico");
/* The sizes Explorer, the taskbar and Alt-Tab actually ask for. No 256:
   uncompressed it costs 256KB on its own — two thirds of the whole file —
   to serve a view of a dev-tool shortcut nobody opens, and Windows scales
   the 128 perfectly well on the rare occasion it needs to. */
const SIZES = [16, 24, 32, 48, 64, 128];

/* The icon is taller than it is wide (20x36), so height is what constrains
   it — fitting to width would crop the console's screen off. Centred on a
   square transparent canvas, since an .ico entry must be square. */
function render(src, size) {
    const scale = size / src.height;
    const w = Math.max(1, Math.round(src.width * scale));
    const h = size;
    const offsetX = (size - w) >> 1;
    const out = Buffer.alloc(size * size * 4);           // transparent

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const sx = Math.min(src.width - 1, Math.floor(x / scale));
            const sy = Math.min(src.height - 1, Math.floor(y / scale));
            const so = (sy * src.width + sx) * 4;
            const dx = offsetX + x;
            if (dx < 0 || dx >= size) continue;
            const dof = (y * size + dx) * 4;
            out[dof] = src.data[so];
            out[dof + 1] = src.data[so + 1];
            out[dof + 2] = src.data[so + 2];
            out[dof + 3] = src.data[so + 3];
        }
    }
    return out;
}

/* One icon entry as a 32bpp bottom-up DIB.

   Two details the format insists on and neither is optional: biHeight is
   DOUBLE the real height, because the structure notionally holds the colour
   bitmap stacked on top of a 1bpp AND mask; and the rows run bottom-to-top.
   The AND mask is still required even at 32bpp where the alpha channel has
   already said everything — left all zeros, meaning "opaque", and the alpha
   does the actual work. */
function bmpEntry(rgba, size) {
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);             // biSize
    header.writeInt32LE(size, 4);            // biWidth
    header.writeInt32LE(size * 2, 8);        // biHeight: colour + mask
    header.writeUInt16LE(1, 12);             // biPlanes
    header.writeUInt16LE(32, 14);            // biBitCount
    header.writeUInt32LE(0, 16);             // BI_RGB, uncompressed

    const pixels = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        const srcRow = (size - 1 - y) * size * 4;   // flip vertically
        const dstRow = y * size * 4;
        for (let x = 0; x < size; x++) {
            const s = srcRow + x * 4, d = dstRow + x * 4;
            pixels[d] = rgba[s + 2];         // B
            pixels[d + 1] = rgba[s + 1];     // G
            pixels[d + 2] = rgba[s];         // R
            pixels[d + 3] = rgba[s + 3];     // A
        }
    }

    // 1bpp, each row padded up to a 4-byte boundary.
    const maskStride = Math.ceil(size / 32) * 4;
    const mask = Buffer.alloc(maskStride * size);

    return Buffer.concat([header, pixels, mask]);
}

function buildIco(entries) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);              // reserved
    header.writeUInt16LE(1, 2);              // 1 = icon
    header.writeUInt16LE(entries.length, 4);

    const dir = Buffer.alloc(16 * entries.length);
    let offset = header.length + dir.length;
    entries.forEach((e, i) => {
        const at = i * 16;
        // 0 means 256 in this field — it is a single byte.
        dir[at] = e.size >= 256 ? 0 : e.size;
        dir[at + 1] = e.size >= 256 ? 0 : e.size;
        dir[at + 2] = 0;                     // palette size (none)
        dir[at + 3] = 0;                     // reserved
        dir.writeUInt16LE(1, at + 4);        // colour planes
        dir.writeUInt16LE(32, at + 6);       // bits per pixel
        dir.writeUInt32LE(e.data.length, at + 8);
        dir.writeUInt32LE(offset, at + 12);
        offset += e.data.length;
    });

    return Buffer.concat([header, dir, ...entries.map(e => e.data)]);
}

const src = decodePng(fs.readFileSync(SOURCE));
console.log(`source ${path.relative(process.cwd(), SOURCE)} — ${src.width}x${src.height}`);

const entries = SIZES.map(size => ({ size, data: bmpEntry(render(src, size), size) }));
fs.writeFileSync(DEST, buildIco(entries));

console.log(`wrote ${path.relative(process.cwd(), DEST)} — ${SIZES.join(", ")}px, ${fs.statSync(DEST).size} bytes`);

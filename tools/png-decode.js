/* Just enough PNG reader to get pixels back out of a file.

   tools/png-encode.js writes them; this reads them, which is what any check
   on the artwork needs — the browser refuses getImageData on a canvas that
   has touched furniindex.com, so measuring a sprite has to happen here.

   Handles the colour types these files actually use: 8-bit RGBA, RGB,
   greyscale and palette, with the five standard filters. Interlaced images
   are refused rather than half-read. */

const zlib = require("zlib");
const fs = require("fs");

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");

    let p = 8, ihdr = null, palette = null, trns = null;
    const idat = [];
    while (p < buf.length) {
        const len = buf.readUInt32BE(p);
        const type = buf.toString("latin1", p + 4, p + 8);
        const body = buf.subarray(p + 8, p + 8 + len);
        if (type === "IHDR") {
            ihdr = {
                w: body.readUInt32BE(0), h: body.readUInt32BE(4),
                depth: body[8], colour: body[9], interlace: body[12]
            };
        } else if (type === "PLTE") palette = body;
        else if (type === "tRNS") trns = body;
        else if (type === "IDAT") idat.push(body);
        else if (type === "IEND") break;
        p += 12 + len;
    }
    if (!ihdr) throw new Error("no IHDR");
    if (ihdr.interlace) throw new Error("interlaced png not supported");
    if (ihdr.depth !== 8) throw new Error(`unsupported bit depth ${ihdr.depth}`);

    const { w, h, colour } = ihdr;
    const ch = CHANNELS[colour];
    if (!ch) throw new Error(`unsupported colour type ${colour}`);

    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = w * ch;
    const out = Buffer.alloc(w * h * 4);

    let prev = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
        const filter = raw[y * (stride + 1)];
        const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));

        // Undo the per-scanline filter. `a` is the pixel to the left, `b`
        // above, `c` above-left — all in BYTES, hence the ch stride.
        for (let i = 0; i < stride; i++) {
            const a = i >= ch ? line[i - ch] : 0;
            const b = prev[i];
            const c = i >= ch ? prev[i - ch] : 0;
            let v = line[i];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const pp = a + b - c;
                const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            }
            line[i] = v & 255;
        }
        prev = line;

        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            const i = x * ch;
            if (colour === 6) { out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = line[i + 3]; }
            else if (colour === 2) { out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = 255; }
            else if (colour === 0) { out[o] = out[o + 1] = out[o + 2] = line[i]; out[o + 3] = 255; }
            else if (colour === 4) { out[o] = out[o + 1] = out[o + 2] = line[i]; out[o + 3] = line[i + 1]; }
            else if (colour === 3) {
                const idx = line[i];
                out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2];
                out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
            }
        }
    }
    return { w, h, rgba: out };
}

const readPng = (file) => decodePng(fs.readFileSync(file));

/* The box of pixels that are actually drawn. x1/y1 are EXCLUSIVE. Returns
   null for a fully transparent image rather than an inside-out box. */
function opaqueBox(img, alphaMin) {
    const min = alphaMin === undefined ? 8 : alphaMin;
    let x0 = img.w, x1 = -1, y0 = img.h, y1 = -1;
    for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
            if (img.rgba[(y * img.w + x) * 4 + 3] <= min) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
    }
    if (x1 < 0) return null;
    return { x0, y0, x1: x1 + 1, y1: y1 + 1, w: x1 + 1 - x0, h: y1 + 1 - y0 };
}

module.exports = { decodePng, readPng, opaqueBox };

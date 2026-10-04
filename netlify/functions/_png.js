/* Minimal PNG reader, used by the furni scanner (see _furni-match.js).
   The site has no image dependency and this only needs to read what the
   scanner is handed: Habbo room screenshots and FurniIndex sprites, both
   8-bit non-interlaced PNGs. Supports colour types 0/2/3/4/6 and
   normalises everything to RGBA so the matcher has one shape to work
   with. Deliberately not a general-purpose decoder — anything outside
   that throws rather than guessing. */
const zlib = require("zlib");

// Sixteen megapixels: 64MB of RGBA, well past any screenshot or sprite.
const MAX_PIXELS = 16 * 1024 * 1024;

function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
    let pos = 8, w = 0, h = 0, depth = 0, type = 0, pal = null, trns = null;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const tag = buf.toString("ascii", pos + 4, pos + 8);
        const data = buf.slice(pos + 8, pos + 8 + len);
        if (tag === "IHDR") {
            w = data.readUInt32BE(0); h = data.readUInt32BE(4);
            depth = data[8]; type = data[9];
            if (data[12] !== 0) throw new Error("interlaced png unsupported");
        } else if (tag === "PLTE") pal = data;
        else if (tag === "tRNS") trns = data;
        else if (tag === "IDAT") idat.push(data);
        else if (tag === "IEND") break;
        pos += 12 + len;
    }
    if (depth !== 8) throw new Error("bit depth " + depth + " unsupported");
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
    if (!channels) throw new Error("colour type " + type + " unsupported");
    /* The header's size is the file's own word, and the buffers below are
       allocated from it before a byte of pixels is read: a few-hundred-byte
       file claiming 60000x60000 asked for gigabytes. Nothing the scanner is
       meant for is near this (a room screenshot is about a megapixel), so
       anything past it is refused rather than tried (30 Sept 2026). And a
       palette picture with no palette would read indexes off null. */
    if (!w || !h || w * h > MAX_PIXELS) throw new Error("png size " + w + "x" + h + " unsupported");
    if (type === 3 && !pal) throw new Error("palette png without a palette");
    const bpp = channels, stride = w * bpp;
    // No more than the picture can hold: a filter byte and a row per line.
    const raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: h * (stride + 1) });
    const out = Buffer.alloc(h * stride);
    let p = 0;
    for (let y = 0; y < h; y++) {
        const filter = raw[p++];
        const line = raw.slice(p, p + stride); p += stride;
        const cur = out.slice(y * stride, (y + 1) * stride);
        const prev = y ? out.slice((y - 1) * stride, y * stride) : null;
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? cur[x - bpp] : 0;
            const b = prev ? prev[x] : 0;
            const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
            let v = line[x];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            }
            cur[x] = v & 0xff;
        }
    }
    // normalise to RGBA
    const rgba = Buffer.alloc(w * h * 4);
    for (let i = 0, n = w * h; i < n; i++) {
        let r, g, bl, al = 255;
        if (type === 6) { r = out[i*4]; g = out[i*4+1]; bl = out[i*4+2]; al = out[i*4+3]; }
        else if (type === 2) { r = out[i*3]; g = out[i*3+1]; bl = out[i*3+2]; }
        else if (type === 3) { const ix = out[i]; r = pal[ix*3]; g = pal[ix*3+1]; bl = pal[ix*3+2]; if (trns && ix < trns.length) al = trns[ix]; }
        else if (type === 0) { r = g = bl = out[i]; }
        else if (type === 4) { r = g = bl = out[i*2]; al = out[i*2+1]; }
        rgba[i*4] = r; rgba[i*4+1] = g; rgba[i*4+2] = bl; rgba[i*4+3] = al;
    }
    return { width: w, height: h, data: rgba };
}
/* And the other way, for habbo-outline.js (4 Oct 2026): RGBA in, an 8-bit
   RGBA PNG out, filter 0 on every line — the same writer as
   tools/theme-png.js, whose images are as small and flat as these. */
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function chunk(tag, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(tag, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // colour type: RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0))
    ]);
}
module.exports = { decodePng, encodePng };

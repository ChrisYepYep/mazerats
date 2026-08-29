/* Minimal PNG reader, used by the furni scanner (see _furni-match.js).
   The site has no image dependency and this only needs to read what the
   scanner is handed: Habbo room screenshots and FurniIndex sprites, both
   8-bit non-interlaced PNGs. Supports colour types 0/2/3/4/6 and
   normalises everything to RGBA so the matcher has one shape to work
   with. Deliberately not a general-purpose decoder — anything outside
   that throws rather than guessing. */
const zlib = require("zlib");

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
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const bpp = channels, stride = w * bpp;
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
module.exports = { decodePng };

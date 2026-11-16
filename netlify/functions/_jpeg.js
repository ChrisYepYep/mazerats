/* A baseline JPEG writer, for deal-image.js (16 Nov 2026).

   Odd One Out's tiles are cut on the server now (THE ODD TILE IS THE
   VISIBLE SQUARE in deal-image.js): the image CDN can only scale and crop
   from an edge or the centre, and the square a tile shows is neither, so the
   CDN is asked for a lossless PNG of the frame and the tile's square is cut
   out of that here. Sent as a PNG it was about three times the bytes of the
   CDN's JPEG of the whole frame; written as a JPEG here it is under half.

   What this writes, and nothing more: 8-bit, three components (YCbCr, JFIF),
   no chroma subsampling (pixel art's single-pixel colour edges survive),
   baseline sequential DCT, Huffman-coded with tables built for each picture
   (two passes: count the symbols, then write them with the shortest codes
   for those counts, as jpegtran -optimize does). Quantised with the standard
   tables of the JPEG specification (Annex K) scaled by `quality` the way
   libjpeg scales them, so q80 here means what q80 means to the CDN.

   Pure, synchronous and dependency-free (the site has no image library; see
   _png.js for the PNG side). The same pixels and quality always give the
   same bytes, which matters: every player of a day is sent one file per
   tile, and the edge keeps it. */

const ZIGZAG = [
    0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63
];

// Annex K.1, in natural (row by row) order.
const LUMA_Q = [
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99
];
const CHROMA_Q = [
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
    24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99
];

// libjpeg's jpeg_quality_scaling and the baseline clamp to 1..255.
function scaledTable(base, quality) {
    const q = Math.max(1, Math.min(100, Math.round(quality)));
    const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
    return base.map(v => Math.max(1, Math.min(255, Math.floor((v * scale + 50) / 100))));
}

// The 8x8 DCT basis, C(u)/2 * cos((2x+1)u*pi/16), as cos[u * 8 + x].
const COS = new Float64Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) / 2 * Math.cos((2 * x + 1) * u * Math.PI / 16);
    }
}

// Forward DCT of one level-shifted 8x8 block (natural order) into `out`.
const tmp = new Float64Array(64);
function fdct(block, out) {
    for (let y = 0; y < 8; y++) {
        for (let u = 0; u < 8; u++) {
            let s = 0;
            for (let x = 0; x < 8; x++) s += COS[u * 8 + x] * block[y * 8 + x];
            tmp[y * 8 + u] = s;
        }
    }
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let s = 0;
            for (let y = 0; y < 8; y++) s += COS[v * 8 + y] * tmp[y * 8 + u];
            out[v * 8 + u] = s;
        }
    }
}

// The magnitude category of a coefficient (bits needed), and its bits.
function category(v) {
    let a = v < 0 ? -v : v, n = 0;
    while (a) { n++; a >>= 1; }
    return n;
}
function extraBits(v, n) {
    return v < 0 ? (v - 1) & ((1 << n) - 1) : v;
}

/* Every block's quantised coefficients, in zigzag order, per component, as
   one Int16Array per component (64 per block, blocks row by row). Edge
   blocks repeat the last row and column, as libjpeg does. */
function quantise(width, height, rgba, tables) {
    const bw = Math.ceil(width / 8), bh = Math.ceil(height / 8);
    const comps = [new Int16Array(bw * bh * 64), new Int16Array(bw * bh * 64), new Int16Array(bw * bh * 64)];
    const blocks = [new Float64Array(64), new Float64Array(64), new Float64Array(64)];
    const freq = new Float64Array(64);
    for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
            for (let y = 0; y < 8; y++) {
                const py = Math.min(height - 1, by * 8 + y);
                for (let x = 0; x < 8; x++) {
                    const px = Math.min(width - 1, bx * 8 + x);
                    const i = (py * width + px) * 4;
                    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
                    const k = y * 8 + x;
                    // JFIF's full-range YCbCr, level shifted by 128.
                    blocks[0][k] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
                    blocks[1][k] = -0.168736 * r - 0.331264 * g + 0.5 * b;
                    blocks[2][k] = 0.5 * r - 0.418688 * g - 0.081312 * b;
                }
            }
            const at = (by * bw + bx) * 64;
            for (let c = 0; c < 3; c++) {
                fdct(blocks[c], freq);
                const q = tables[c === 0 ? 0 : 1];
                for (let z = 0; z < 64; z++) {
                    const n = ZIGZAG[z];
                    comps[c][at + z] = Math.round(freq[n] / q[n]);
                }
            }
        }
    }
    return { comps, blocks: bw * bh };
}

/* Walks every block in scan order (interleaved: Y, Cb, Cr per block),
   calling dc(table, symbol, bits, n) and ac(table, symbol, bits, n). Table 0
   is luma, 1 chroma. Used twice: once to count, once to write. */
function walk(q, visit) {
    const pred = [0, 0, 0];
    for (let blk = 0; blk < q.blocks; blk++) {
        for (let c = 0; c < 3; c++) {
            const co = q.comps[c], at = blk * 64, t = c === 0 ? 0 : 1;
            const diff = co[at] - pred[c];
            pred[c] = co[at];
            const dn = category(diff);
            visit(0, t, dn, extraBits(diff, dn), dn);
            let run = 0;
            for (let z = 1; z < 64; z++) {
                const v = co[at + z];
                if (v === 0) { run++; continue; }
                while (run > 15) { visit(1, t, 0xf0, 0, 0); run -= 16; }
                const n = category(v);
                visit(1, t, (run << 4) | n, extraBits(v, n), n);
                run = 0;
            }
            if (run > 0) visit(1, t, 0x00, 0, 0);
        }
    }
}

/* Optimal code lengths for one table's symbol counts, limited to 16 bits —
   the procedure of the specification's Annex K.2 (libjpeg's
   jpeg_gen_optimal_table), including its reserved all-ones code. Answers
   { bits: counts per length 1..16, vals: symbols by length }. */
function optimalTable(counts) {
    const freq = new Array(257).fill(0);
    for (let i = 0; i < 256; i++) freq[i] = counts[i] || 0;
    freq[256] = 1;     // reserved, so no code is all ones
    const codesize = new Array(257).fill(0);
    const others = new Array(257).fill(-1);
    for (;;) {
        let c1 = -1, v = Infinity;
        for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v) { v = freq[i]; c1 = i; }
        let c2 = -1; v = Infinity;
        for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v && i !== c1) { v = freq[i]; c2 = i; }
        if (c2 < 0) break;
        freq[c1] += freq[c2];
        freq[c2] = 0;
        codesize[c1]++;
        while (others[c1] >= 0) { c1 = others[c1]; codesize[c1]++; }
        others[c1] = c2;
        codesize[c2]++;
        while (others[c2] >= 0) { c2 = others[c2]; codesize[c2]++; }
    }
    const bits = new Array(33).fill(0);
    for (let i = 0; i <= 256; i++) if (codesize[i]) bits[codesize[i]]++;
    for (let i = 32; i > 16; i--) {
        while (bits[i] > 0) {
            let j = i - 2;
            while (bits[j] === 0) j--;
            bits[i] -= 2;
            bits[i - 1]++;
            bits[j + 1] += 2;
            bits[j]--;
        }
    }
    let i = 16;
    while (bits[i] === 0) i--;
    bits[i]--;          // the reserved code goes
    const vals = [];
    for (let len = 1; len <= 32; len++) {
        for (let s = 0; s < 256; s++) if (codesize[s] === len) vals.push(s);
    }
    return { bits: bits.slice(1, 17), vals };
}

// Canonical codes for a table: code[symbol] and size[symbol].
function codesOf(table) {
    const code = new Array(256).fill(0), size = new Array(256).fill(0);
    let c = 0, k = 0;
    for (let len = 1; len <= 16; len++) {
        for (let n = 0; n < table.bits[len - 1]; n++) {
            code[table.vals[k]] = c;
            size[table.vals[k]] = len;
            c++; k++;
        }
        c <<= 1;
    }
    return { code, size };
}

function segment(marker, body) {
    const head = Buffer.alloc(4);
    head[0] = 0xff; head[1] = marker;
    head.writeUInt16BE(body.length + 2, 2);
    return Buffer.concat([head, body]);
}

/* `rgba` is width*height*4 bytes, alpha ignored (lay anything see-through on
   a ground first). Answers the JPEG as a Buffer. */
function encodeJpeg(width, height, rgba, quality) {
    if (!(width > 0 && height > 0 && width < 65536 && height < 65536) || rgba.length < width * height * 4) {
        throw new Error("encodeJpeg: bad picture");
    }
    const tables = [scaledTable(LUMA_Q, quality), scaledTable(CHROMA_Q, quality)];
    const q = quantise(width, height, rgba, tables);

    const counts = [[new Array(256).fill(0), new Array(256).fill(0)], [new Array(256).fill(0), new Array(256).fill(0)]];
    walk(q, (ac, t, sym) => { counts[ac][t][sym]++; });
    const huff = [[optimalTable(counts[0][0]), optimalTable(counts[0][1])], [optimalTable(counts[1][0]), optimalTable(counts[1][1])]];
    const codes = huff.map(pair => pair.map(codesOf));

    // The entropy-coded scan, with 0xFF bytes stuffed.
    const out = [];
    let acc = 0, nbits = 0;
    const put = (value, n) => {
        for (let i = n - 1; i >= 0; i--) {
            acc = (acc << 1) | ((value >> i) & 1);
            if (++nbits === 8) {
                out.push(acc);
                if (acc === 0xff) out.push(0);
                acc = 0; nbits = 0;
            }
        }
    };
    walk(q, (ac, t, sym, extra, n) => {
        const c = codes[ac][t];
        put(c.code[sym], c.size[sym]);
        if (n) put(extra, n);
    });
    if (nbits) put((1 << (8 - nbits)) - 1, 8 - nbits);   // pad with ones

    const jfif = Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
    const dqt = Buffer.concat([0, 1].map(id => Buffer.from([id, ...ZIGZAG.map(n => tables[id][n])])));
    const sof = Buffer.from([8, height >> 8, height & 255, width >> 8, width & 255, 3,
        1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
    const dht = Buffer.concat([[0, 0], [0, 1], [1, 0], [1, 1]].map(([ac, t]) =>
        Buffer.from([(ac << 4) | t, ...huff[ac][t].bits, ...huff[ac][t].vals])));
    const sos = Buffer.from([3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
    return Buffer.concat([
        Buffer.from([0xff, 0xd8]),
        segment(0xe0, jfif),
        segment(0xdb, dqt),
        segment(0xc0, sof),
        segment(0xc4, dht),
        segment(0xda, sos),
        Buffer.from(out),
        Buffer.from([0xff, 0xd9])
    ]);
}

module.exports = { encodeJpeg };

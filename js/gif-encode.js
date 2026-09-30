/* A GIF89a encoder, in the browser and without a library.

   The map's editor makes a zooming animation of the atlas to share, and a
   GIF is what actually plays everywhere somebody would paste one. There is
   no build step on this site, so there is nowhere for a packaged encoder to
   come from; and the pieces of a GIF are small and well documented, so it
   is written here rather than depended upon.

   What it does NOT do is worth saying plainly: no interlacing, no local
   colour tables, no transparency. Every frame shares one 256-colour table
   built from the frames themselves, which is exactly right for this job —
   an animation of one drawing, where every frame is the same parchment and
   the same ink at a different size — and would be wrong for photographs
   that change scene.

   Usage:

       const gif = GifEncode.begin(width, height, { delay: 6, loop: 0 });
       gif.study(imageDataA); gif.study(imageDataB);   // learn the colours
       gif.write(imageDataA); gif.write(imageDataB);   // then the frames
       const blob = gif.finish();

   study() before write(): the colour table is written into the header, so
   it has to be known before any frame is. */
window.GifEncode = (function () {
    "use strict";

    /* ---------- the colour table ----------

       Median cut. The alternative everyone reaches for first is a fixed
       6x7x6 cube, and on this map it is visibly wrong: the parchment lives
       in a narrow band of browns and creams, so a cube spends most of its
       256 entries on greens and blues that never appear and banding shows
       across the paper. Median cut spends the entries where the colours
       actually are.

       Colours are sampled rather than counted exhaustively — every 7th
       pixel, which for a 720px frame is still tens of thousands of samples
       and is indistinguishable in the result.

       SAMPLES ARE A FLAT Uint8Array OF r,g,b, AND BOXES ARE RANGES OF AN
       INDEX ARRAY. This used to be an array of [r,g,b] arrays, every box its
       own sliced copy, and every split re-measured every box from scratch.
       At 900px and 240 frames that was about six million little arrays,
       sorted and rescanned 255 times, all synchronously inside the first
       write(): 23 seconds of a frozen tab in a node test, and the browser
       could not so much as repaint the progress bar. Now the samples are
       capped (see study()), a box is [start, end) of one shared Uint32Array
       of sample numbers, it is measured once when it is made and the
       measurement kept, and a split is a stable counting sort on one
       channel — the same order Array.sort gave, found in two linear passes
       rather than n log n comparisons. */
    function buildPalette(samples, maxColours, populationWeight) {
        const pop = Number(populationWeight) || 0;
        const n = samples.length / 3;
        const order = new Uint32Array(n);
        for (let i = 0; i < n; i++) order[i] = i;
        const scratch = new Uint32Array(n);
        const counts = new Uint32Array(257);
        let boxes = [makeBox(samples, order, 0, n)];
        while (boxes.length < maxColours) {
            /* Split the box with the longest side: that is the one whose
               colours are least alike, so it is the one worth halving.

               SIZE ALONE IGNORES HOW MUCH OF THE PICTURE A BOX IS. That is
               the right call for a drawing, where a colour matters because it
               is distinct and not because it is common. It is the wrong call
               for a large smooth area: a sky is most of the frame but lies on
               one thin line in colour space, so a few splits leave its boxes
               narrow, rare colours with wide boxes win every split after
               that, and the gradient is left banding across entries it never
               got. populationWeight (0 = off, and the default, so the map is
               encoded exactly as before) scores a box by its span times its
               share of the samples, which spends entries where the eye is
               actually looking. */
            let target = -1;
            let widest = 0;
            for (let i = 0; i < boxes.length; i++) {
                const box = boxes[i];
                const count = box.end - box.start;
                if (count < 2) continue;
                const score = pop
                    ? box.size * Math.pow(count, pop)
                    : box.size;
                if (score > widest) { widest = score; target = i; }
            }
            if (target === -1) break;
            const box = boxes[target];
            sortBox(samples, order, scratch, counts, box.start, box.end, box.axis);
            const mid = box.start + ((box.end - box.start) >> 1);
            boxes.splice(target, 1,
                makeBox(samples, order, box.start, mid),
                makeBox(samples, order, mid, box.end));
        }
        return boxes.map(box => {
            let r = 0, g = 0, b = 0;
            for (let k = box.start; k < box.end; k++) {
                const s = order[k] * 3;
                r += samples[s]; g += samples[s + 1]; b += samples[s + 2];
            }
            const count = (box.end - box.start) || 1;
            return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
        });
    }

    // A box over order[start..end), measured once, here, and never again.
    function makeBox(samples, order, start, end) {
        let lo0 = 255, lo1 = 255, lo2 = 255, hi0 = 0, hi1 = 0, hi2 = 0;
        for (let k = start; k < end; k++) {
            const s = order[k] * 3;
            const c0 = samples[s], c1 = samples[s + 1], c2 = samples[s + 2];
            if (c0 < lo0) lo0 = c0; if (c0 > hi0) hi0 = c0;
            if (c1 < lo1) lo1 = c1; if (c1 > hi1) hi1 = c1;
            if (c2 < lo2) lo2 = c2; if (c2 > hi2) hi2 = c2;
        }
        // Weighted the way the eye weights them, so a box that is wide in
        // green splits before one equally wide in blue.
        const weighted = end > start
            ? [(hi0 - lo0) * 1.0, (hi1 - lo1) * 1.2, (hi2 - lo2) * 0.8]
            : [0, 0, 0];
        const axis = weighted.indexOf(Math.max(...weighted));
        return { start, end, axis, size: weighted[axis] };
    }

    // Stable counting sort of order[start..end) by one channel, in place.
    function sortBox(samples, order, scratch, counts, start, end, axis) {
        counts.fill(0);
        for (let k = start; k < end; k++) counts[samples[order[k] * 3 + axis] + 1]++;
        for (let v = 1; v < 257; v++) counts[v] += counts[v - 1];
        for (let k = start; k < end; k++) {
            const idx = order[k];
            scratch[start + counts[samples[idx * 3 + axis]]++] = idx;
        }
        order.set(scratch.subarray(start, end), start);
    }

    /* Nearest entry, with a cache. Without the cache this is the whole cost
       of encoding — 256 comparisons for every pixel of every frame — and
       with it, a map frame of half a million pixels asks maybe four thousand
       real questions, because a drawing has far fewer distinct colours than
       it has pixels.

       KEYED ON THE WHOLE COLOUR, not on 5 bits a channel. Rounding the key
       to 5 bits was the same as rounding the picture: two colours inside one
       8-level bucket share a cache entry, so the first to arrive decides for
       both and the output can never step finer than 8. On a drawing whose
       colours sit far apart that is invisible, which is why it survived; on
       a smooth gradient it IS the banding, and no amount of palette fixes it
       because the palette never gets consulted. A frame of sky measured 12
       levels a step with 17 entries available to it. The cache is a little
       larger for it and the encode no slower in practice, because a picture
       still has far fewer distinct colours than pixels. */
    function nearestFinder(palette) {
        const cache = new Map();
        return function nearest(r, g, b) {
            const key = (r << 16) | (g << 8) | b;
            const hit = cache.get(key);
            if (hit !== undefined) return hit;
            let best = 0, bestDist = Infinity;
            for (let i = 0; i < palette.length; i++) {
                const p = palette[i];
                const dr = r - p[0], dg = g - p[1], db = b - p[2];
                const dist = dr * dr * 3 + dg * dg * 4 + db * db * 2;
                if (dist < bestDist) { bestDist = dist; best = i; }
            }
            cache.set(key, best);
            return best;
        };
    }

    /* ---------- LZW, as GIF does it ----------

       Not quite the LZW anybody else does it: the code size grows one bit at
       a time as the dictionary fills, the dictionary is cleared with an
       explicit code whenever it reaches 4096 entries, and the codes are
       packed least-significant-bit first into 255-byte sub-blocks. Each of
       those three is a thing that produces a file the decoder rejects
       silently if you get it wrong. */
    function lzw(indices, minCodeSize) {
        const out = [];
        let bitBuffer = 0;
        let bitCount = 0;
        const clearCode = 1 << minCodeSize;
        const endCode = clearCode + 1;
        let codeSize = minCodeSize + 1;
        let next = endCode + 1;
        let dict = new Map();

        function emit(code) {
            bitBuffer |= code << bitCount;
            bitCount += codeSize;
            while (bitCount >= 8) {
                out.push(bitBuffer & 0xff);
                bitBuffer >>= 8;
                bitCount -= 8;
            }
        }

        emit(clearCode);
        let run = indices[0];
        for (let i = 1; i < indices.length; i++) {
            const k = indices[i];
            const key = run * 4096 + k;
            if (dict.has(key)) { run = dict.get(key); continue; }
            emit(run);
            dict.set(key, next);
            if (next === (1 << codeSize) && codeSize < 12) codeSize++;
            next++;
            if (next >= 4096) {
                emit(clearCode);
                dict = new Map();
                codeSize = minCodeSize + 1;
                next = endCode + 1;
            }
            run = k;
        }
        emit(run);
        /* The same widening the loop does after every emit (30 Sept 2026).
           A decoder adds a dictionary entry on reading that last code just
           as it would on any other, and widens if that fills the current
           size, so it reads the end code one bit wider than this wrote it —
           which, landing exactly on a power of two, left a strict decoder
           short of data (31 to 34 pixels of two alternating colours did it). */
        if (next === (1 << codeSize) && codeSize < 12) codeSize++;
        emit(endCode);
        if (bitCount > 0) out.push(bitBuffer & 0xff);
        return out;
    }

    function begin(width, height, options) {
        const opts = options || {};
        // In hundredths of a second, which is the only unit a GIF has. Two
        // is the floor most players honour; below that they invent their own.
        const delay = Math.max(2, Math.round(opts.delay == null ? 6 : opts.delay));
        const loop = opts.loop == null ? 0 : opts.loop;
        const maxColours = Math.min(256, Math.max(8, opts.colours || 256));

        const bytes = [];
        /* A RESERVOIR, not a list. study() used to push every 7th pixel of
           every studied frame, which for a 900px recording of twenty seconds
           was about six million samples — and the palette was then built from
           all of them in one synchronous go (see buildPalette). A hundred
           thousand is far more than 256 boxes need to find their medians, so
           that is where it stops: once full, each new candidate replaces a
           random one with the odds that keep every pixel studied equally
           likely to be in the pool (reservoir sampling), so the last frames
           of a zoom count as much as the first. The random numbers are a
           seeded generator rather than Math.random so the same recording
           comes out as the same file. */
        const SAMPLE_CAP = 100000;
        let samples = new Uint8Array(SAMPLE_CAP * 3);
        let sampled = 0;       // how many are in the pool
        let offered = 0;       // how many have ever been offered to it
        let seed = 0x9e3779b9;
        const random = () => {
            // mulberry32
            seed = (seed + 0x6d2b79f5) | 0;
            let t = seed;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        /* EACH FRAME IS KEPT ENCODED, not as pixels.

           write() used to keep a palette index per pixel for every frame and
           compress the lot in finish(), and its caller kept the frames' full
           RGBA ImageData alive until then as well - at 900px wide and twenty
           seconds that was over a gigabyte for a GIF that comes out at tens of
           megabytes. Once the palette is fixed nothing about a frame's
           encoding depends on any other frame, so write() now compresses it
           there and then and keeps only the finished bytes. The caller can let
           its ImageData go the moment write() returns. */
        const frames = [];
        let palette = null;
        let nearest = null;
        let bits = 1;

        const push = (...v) => bytes.push(...v);
        const pushShort = v => bytes.push(v & 0xff, (v >> 8) & 0xff);
        const pushString = s => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); };

        function study(imageData) {
            // Studying after the first write would change a table that frames
            // have already been encoded against.
            if (palette) return;
            const d = imageData.data;
            for (let i = 0; i < d.length; i += 4 * 7) {
                let slot = sampled;
                if (sampled < SAMPLE_CAP) sampled++;
                else {
                    slot = Math.floor(random() * (offered + 1));
                    if (slot >= SAMPLE_CAP) { offered++; continue; }
                }
                offered++;
                samples[slot * 3] = d[i];
                samples[slot * 3 + 1] = d[i + 1];
                samples[slot * 3 + 2] = d[i + 2];
            }
        }

        function ensurePalette() {
            if (palette) return;
            // An unstudied encoder gets one black sample, as it always did.
            palette = buildPalette(sampled ? samples.subarray(0, sampled * 3) : new Uint8Array(3),
                maxColours, opts.populationWeight);
            // A GIF's table is a power of two, padded out with black.
            let size = 2;
            while (size < palette.length) size <<= 1;
            while (palette.length < size) palette.push([0, 0, 0]);
            nearest = nearestFinder(palette);
            bits = 1;
            while ((1 << bits) < palette.length) bits++;
            samples = null;         // done with
        }

        function write(imageData) {
            ensurePalette();
            const d = imageData.data;
            const indices = new Uint8Array(d.length / 4);
            for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                indices[p] = nearest(d[i], d[i + 1], d[i + 2]);
            }

            /* The whole frame block, as it will sit in the file: graphic
               control extension, image descriptor, then the LZW data cut into
               255-byte sub-blocks and a zero terminator. */
            const minCodeSize = Math.max(2, bits);
            const data = lzw(indices, minCodeSize);
            const blocks = Math.ceil(data.length / 255);
            const out = new Uint8Array(8 + 10 + 1 + data.length + blocks + 1);
            let o = 0;
            out.set([0x21, 0xf9, 4, 0, delay & 0xff, (delay >> 8) & 0xff, 0, 0], o); o += 8;
            out.set([0x2c, 0, 0, 0, 0,
                width & 0xff, (width >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff, 0], o); o += 10;
            out[o++] = minCodeSize;
            for (let i = 0; i < data.length; i += 255) {
                const n = Math.min(255, data.length - i);
                out[o++] = n;
                for (let j = 0; j < n; j++) out[o++] = data[i + j];
            }
            out[o++] = 0;
            frames.push(out);
        }

        function finish() {
            ensurePalette();

            pushString("GIF89a");
            pushShort(width);
            pushShort(height);
            // Global table present, colour resolution 7, table size 2^(bits).
            push(0x80 | 0x70 | (bits - 1), 0, 0);
            for (const c of palette) push(c[0], c[1], c[2]);

            // NETSCAPE2.0, the extension that means "loop", and the only
            // reason an animated GIF plays more than once.
            push(0x21, 0xff, 11);
            pushString("NETSCAPE2.0");
            push(3, 1);
            pushShort(loop);
            push(0);

            // The header and table, then every frame exactly as write() left
            // it, then the trailer - handed to the Blob as parts rather than
            // joined into one array first.
            return new Blob([new Uint8Array(bytes), ...frames, new Uint8Array([0x3b])],
                { type: "image/gif" });
        }

        return { study, write, finish, get frameCount() { return frames.length; } };
    }

    return { begin };
})();

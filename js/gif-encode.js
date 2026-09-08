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
       and is indistinguishable in the result. */
    function buildPalette(samples, maxColours) {
        let boxes = [{ colours: samples }];
        while (boxes.length < maxColours) {
            // Split the box with the longest side: that is the one whose
            // colours are least alike, so it is the one worth halving.
            let target = -1;
            let widest = 0;
            for (let i = 0; i < boxes.length; i++) {
                const box = boxes[i];
                if (box.colours.length < 2) continue;
                const range = boxRange(box);
                if (range.size > widest) { widest = range.size; target = i; }
            }
            if (target === -1) break;
            const box = boxes[target];
            const axis = boxRange(box).axis;
            box.colours.sort((a, b) => a[axis] - b[axis]);
            const mid = box.colours.length >> 1;
            boxes.splice(target, 1,
                { colours: box.colours.slice(0, mid) },
                { colours: box.colours.slice(mid) });
        }
        return boxes.map(box => {
            let r = 0, g = 0, b = 0;
            for (const c of box.colours) { r += c[0]; g += c[1]; b += c[2]; }
            const n = box.colours.length || 1;
            return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        });
    }

    function boxRange(box) {
        let lo = [255, 255, 255], hi = [0, 0, 0];
        for (const c of box.colours) {
            for (let i = 0; i < 3; i++) {
                if (c[i] < lo[i]) lo[i] = c[i];
                if (c[i] > hi[i]) hi[i] = c[i];
            }
        }
        const spread = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
        // Weighted the way the eye weights them, so a box that is wide in
        // green splits before one equally wide in blue.
        const weighted = [spread[0] * 1.0, spread[1] * 1.2, spread[2] * 0.8];
        const axis = weighted.indexOf(Math.max(...weighted));
        return { axis, size: weighted[axis] };
    }

    /* Nearest entry, with a cache. Without the cache this is the whole cost
       of encoding — 256 comparisons for every pixel of every frame — and
       with it, a map frame of half a million pixels asks maybe four thousand
       real questions, because a drawing has far fewer distinct colours than
       it has pixels. Keyed on the colour reduced to 5 bits a channel, which
       is finer than the eye is at these palette sizes. */
    function nearestFinder(palette) {
        const cache = new Map();
        return function nearest(r, g, b) {
            const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
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
        const samples = [];
        const frames = [];
        let palette = null;
        let nearest = null;

        const push = (...v) => bytes.push(...v);
        const pushShort = v => bytes.push(v & 0xff, (v >> 8) & 0xff);
        const pushString = s => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); };

        function study(imageData) {
            const d = imageData.data;
            for (let i = 0; i < d.length; i += 4 * 7) samples.push([d[i], d[i + 1], d[i + 2]]);
        }

        function ensurePalette() {
            if (palette) return;
            palette = buildPalette(samples.length ? samples : [[0, 0, 0]], maxColours);
            // A GIF's table is a power of two, padded out with black.
            let size = 2;
            while (size < palette.length) size <<= 1;
            while (palette.length < size) palette.push([0, 0, 0]);
            nearest = nearestFinder(palette);
        }

        function write(imageData) {
            ensurePalette();
            const d = imageData.data;
            const indices = new Uint8Array(d.length / 4);
            for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                indices[p] = nearest(d[i], d[i + 1], d[i + 2]);
            }
            frames.push(indices);
        }

        function finish() {
            ensurePalette();
            let bits = 1;
            while ((1 << bits) < palette.length) bits++;

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

            const minCodeSize = Math.max(2, bits);
            for (const indices of frames) {
                push(0x21, 0xf9, 4, 0, delay & 0xff, (delay >> 8) & 0xff, 0, 0);
                push(0x2c);
                pushShort(0); pushShort(0);
                pushShort(width); pushShort(height);
                push(0);
                push(minCodeSize);
                const data = lzw(indices, minCodeSize);
                for (let i = 0; i < data.length; i += 255) {
                    const chunk = data.slice(i, i + 255);
                    push(chunk.length, ...chunk);
                }
                push(0);
            }
            push(0x3b);
            return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
        }

        return { study, write, finish, get frameCount() { return frames.length; } };
    }

    return { begin };
})();

/* Build the hotel views in assets/img/hotel/ — the Habbo Origins entry
   screens, composed from the client's own layers.

   WHERE THEY COME FROM. Each hh_entry_<hotel>.cct carries its entry screen as
   a handful of bitmaps plus a field member, `entry.visual`, which lays them
   out exactly the way the .room fields lay out a room:

     [#member: "hotel", #media: #bitmap, #locH: 360, #locV: 419, #ink: 36, ...]
     [#member: "skyleft_shape", #media: #shape, #locV: 203, #color: "#84CCE8"]

   locH/locV place the member's REGISTRATION point, so a bitmap's top-left is
   locH - regX, locV - regY; a shape's locH/locV is its top-left already. This
   tool reads that field and draws it, rather than carrying a hand-copied list
   of offsets — which is what it did when it only knew about one hotel, and
   which does not survive a second.

   ----------------------------------------------------------------------
   FOUR PIECES

     <hotel>-back.png    everything BEFORE the first cloud — the sky
     cloud-N-left/right  the cloud sprites, shared: every cast ships the same
                         eight, same sizes, same registration points
     <hotel>-front.png   everything AFTER the last cloud, with alpha where
                         nothing is drawn
     <hotel>-glow.png    light1, the additive lamp over the whole picture

   The element list IS the draw order and the clouds sit in the middle of it,
   which is what lets one drift behind a tower; that is why the picture comes
   out in pieces rather than flat. The game no longer draws them — at the
   speed the client moves them, behind that skyline, nobody can see them in
   the eight seconds a hotel is up — but they are still emitted, because
   throwing the layer split away would mean re-deriving it to get them back.

   THE GLOW IS NOT OPTIONAL, which is the opposite of what this file used to
   say. ES, BR and UK all paint their sky as two flat rectangles of slightly
   different blue, and light1 is what hides the join between them. Left out,
   every one of them has a hard vertical seam down it.

   BLEND IS HONOURED for the same reason. Two of the visuals lay a
   half-transparent sky shape over the clouds (ES's second `skyright_shape` is
   #blend: 36), which tints them; drawn opaque, as everything was before, it
   painted them out entirely.

   ----------------------------------------------------------------------
   THE LETTERBOX

   Every visual ends with two `box` shapes, one above the picture and one
   below — the client's letterbox, which is also what hides the fact that the
   artwork runs straight into it with no building tops. They are not
   reproduced: two black bands across a game window look like the window is
   the wrong shape. The band is anchored to the BOTTOM of the canvas and the
   rows left over at the top are filled with sky, taken from the back layer's
   own top row.

   ----------------------------------------------------------------------
   WHAT IS LEFT OUT

     the cars and the bus     the client drives those across; parked in a
                              still, one reads as a mistake
     the corner element       the Habbo sign, which is the client's own
                              furniture and would fight our title

   ----------------------------------------------------------------------
   ONE THING TO WATCH

   A CAST'S PALETTE NUMBERING CAN BE OFFSET FROM THE TABLE'S. hh_entry_us is
   the clearest case — its bitmaps name palette member 30 and the palette they
   mean, `Hotel_view_us_Palette`, sits at slot 26, three lower. The shift is
   measured per cast below rather than hard-coded, so it holds for whichever
   hotels VIEWS names. Before it was measured, a hotel view came out entirely
   greyscale, which looks like a design choice rather than a bug because half
   the picture is grey concrete anyway. */

const fs = require("fs");
const path = require("path");
const { openCast, readMember, unpackBits, readClut } = require("./cct-extract.js");
const { encodePng } = require("./png-encode.js");

const CLIENT = process.env.HABBO_CLIENT ||
    "C:/Users/cjboy/AppData/Roaming/Habbo Launcher/downloads/shockwave/350";

/* The room canvas's size, because that is what these are painted onto. */
const OUT_W = 720;
const OUT_H = 498;

/* WHICH HOTELS, and where to take the 720px window from.

   Three, by choice rather than by what the client ships. It carries five —
   US and RU as well — and all five extract cleanly; these are the three the
   title screen cycles, in this order. Adding one back is a line here and a
   re-run.

   `x` is the left edge of the crop in the visual's own coordinates, chosen by
   looking at each picture: these three are drawn 960 wide with their hotel on
   the left, so each starts at its own letterbox's left edge. (US, were it
   wanted again, is drawn 720 wide and takes x: 0; RU takes x: 3.) */
const VIEWS = [
    { key: "es", file: "hh_entry_es.cct", x: 3 },
    { key: "br", file: "hh_entry_br.cct", x: 24 },
    { key: "uk", file: "hh_entry_uk.cct", x: 24 }
];

const SKIP_MEMBER = /^(corner_element|corner_element_shadow)$/i;
const GLOW_MEMBER = /^light1$/i;
const SKIP_ID = /^(car|bus)\d*$/i;
const IS_CLOUD = /^cloud_/i;

// [#a: 1, #b: "x"] -> { a: 1, b: "x" }.
function parseElement(line) {
    const inner = line.trim().replace(/^\[/, "").replace(/\]$/, "");
    const out = {};
    let depth = 0, quoted = false, start = 0;
    const parts = [];
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '"') quoted = !quoted;
        else if (!quoted && (ch === "[" || ch === "(")) depth++;
        else if (!quoted && (ch === "]" || ch === ")")) depth--;
        else if (!quoted && depth === 0 && ch === ",") { parts.push(inner.slice(start, i)); start = i + 1; }
    }
    parts.push(inner.slice(start));
    for (const p of parts) {
        const m = /^\s*#([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(p);
        if (!m) continue;
        let v = m[2].trim();
        if (/^".*"$/.test(v)) v = v.slice(1, -1);
        else if (/^-?\d+$/.test(v)) v = Number(v);
        out[m[1]] = v;
    }
    return out;
}

function openView(file) {
    const cast = openCast(path.join(CLIENT, file));

    const byName = new Map();
    for (const e of cast.res.filter(x => x.tag === "CASt")) {
        const m = readMember(cast.chunk(e));
        if (m && m.name) byName.set(m.name, { id: e.id, ...m });
    }

    // The palette-slot shift this cast needs; see the note at the top.
    const isPalette = (slot) => {
        const id = cast.castTable[slot];
        return id !== undefined && cast.childOf.has(`${id}:CLUT`);
    };
    let shift = 0, bestHit = -1;
    for (let k = 0; k <= 8; k++) {
        let hit = 0;
        for (const m of byName.values()) {
            if (m.bitmap && m.bitmap.paletteMember > 0 && isPalette(m.bitmap.paletteMember - 1 - k)) hit++;
        }
        if (hit > bestHit) { bestHit = hit; shift = k; }
    }

    const palCache = new Map();
    function paletteFor(num) {
        if (num === null || num <= 0) return null;
        if (palCache.has(num)) return palCache.get(num);
        let pal = null;
        const ownerId = cast.castTable[num - 1 - shift];
        const clutId = ownerId === undefined ? undefined : cast.childOf.get(`${ownerId}:CLUT`);
        if (clutId !== undefined) {
            const c = readClut(cast.chunk(cast.byId.get(clutId)));
            if (c.length >= 16) pal = c;
        }
        palCache.set(num, pal);
        return pal;
    }

    /* FOUR-BIT BITMAPS EXIST HERE, and reading one as eight-bit is not a
       subtle failure — it is where the clouds' "hand with fingers" shape came
       from.

       Every cloud in every one of these casts is 4-bit: two pixels to a byte,
       high nibble first, so a 42-wide row is 21 bytes padded to a pitch of 22.
       Read a byte per pixel and each row comes out half as wide and shifted
       against the one above, which turns a blob into diagonal streaks that
       look almost deliberate.

       The palette is 16 entries rather than 256, so the greyscale fallback
       has to step by 17 to cover white-to-black across sixteen. */
    function pixels(m) {
        const bitdId = cast.childOf.get(`${m.id}:BITD`);
        if (bitdId === undefined) return null;
        const raw = cast.chunk(cast.byId.get(bitdId));
        const { pitch, w, h, bitDepth } = m.bitmap;
        if (!raw.length || w <= 0 || h <= 0) return null;
        const packed = raw.length === pitch * h ? raw : unpackBits(raw, pitch * h);

        if (bitDepth === 4) {
            const idx = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const b = packed[y * pitch + (x >> 1)];
                    idx[y * w + x] = (x & 1) ? (b & 0x0f) : (b >> 4);
                }
            }
            const pal = paletteFor(m.bitmap.paletteMember) ||
                Array.from({ length: 16 }, (_, i) => [255 - i * 17, 255 - i * 17, 255 - i * 17]);
            return { w, h, pitch: w, idx, pal };
        }

        const pal = paletteFor(m.bitmap.paletteMember) ||
            Array.from({ length: 256 }, (_, i) => [255 - i, 255 - i, 255 - i]);
        return { w, h, pitch, idx: packed, pal };
    }

    function fieldText(name) {
        for (const e of cast.res.filter(x => x.tag === "CASt")) {
            const m = readMember(cast.chunk(e));
            if (!m || m.name !== name) continue;
            const sid = cast.childOf.get(`${e.id}:STXT`);
            if (sid === undefined) return null;
            const b = cast.chunk(cast.byId.get(sid));
            if (b.length < 12) return null;
            const off = b.readUInt32BE(0), len = b.readUInt32BE(4);
            return b.toString("latin1", off, off + len);
        }
        return null;
    }

    return { byName, pixels, fieldText };
}

/* One RGBA buffer and the two ways of putting something into it. `alpha` is
   the element's own #blend as a fraction; anything under 1 is mixed with what
   is already there rather than replacing it. */
function surface(w, h, opaqueBlack) {
    const buf = Buffer.alloc(w * h * 4);
    if (opaqueBlack) for (let i = 0; i < w * h; i++) buf[i * 4 + 3] = 255;
    return {
        buf,
        put(x, y, c, alpha) {
            if (x < 0 || x >= w || y < 0 || y >= h) return;
            const o = (y * w + x) * 4;
            if (alpha >= 1 || buf[o + 3] === 0) {
                buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
                buf[o + 3] = alpha >= 1 ? 255 : Math.round(alpha * 255);
                return;
            }
            buf[o] = Math.round(buf[o] * (1 - alpha) + c[0] * alpha);
            buf[o + 1] = Math.round(buf[o + 1] * (1 - alpha) + c[1] * alpha);
            buf[o + 2] = Math.round(buf[o + 2] * (1 - alpha) + c[2] * alpha);
            buf[o + 3] = 255;
        }
    };
}

function build(view) {
    const { byName, pixels, fieldText } = openView(view.file);

    const text = fieldText("entry.visual");
    if (!text) throw new Error(`${view.file}: no entry.visual field`);
    const elements = text.split(/\r\n|\r|\n/).map(s => s.trim())
        .filter(s => s.startsWith("[")).map(parseElement);

    const bars = elements.filter(e => e.member === "box" && e.media === "#shape" && !e.color)
        .map(e => ({ top: e.locV, bottom: e.locV + (e.height || 0) }))
        .sort((a, b) => a.top - b.top);
    if (bars.length < 2) throw new Error(`${view.file}: expected two letterbox bars`);
    const bandTop = bars[0].bottom;
    const bandH = bars[bars.length - 1].top - bandTop;
    const skyH = Math.max(0, OUT_H - bandH);       // rows above the picture

    const toX = (vx) => vx - view.x;
    const toY = (vy) => vy - bandTop + skyH;

    // Where the clouds sit in the list: everything before them is sky,
    // everything after is built on the ground.
    const cloudAt = elements.map((e, i) => IS_CLOUD.test(String(e.member || "")) ? i : -1)
        .filter(i => i >= 0);
    const firstCloud = cloudAt.length ? cloudAt[0] : elements.length;
    const lastCloud = cloudAt.length ? cloudAt[cloudAt.length - 1] : -1;

    const back = surface(OUT_W, OUT_H, true);
    const front = surface(OUT_W, OUT_H, false);
    const glow = surface(OUT_W, OUT_H, false);

    function paint(el, into) {
        if (el.id && SKIP_ID.test(String(el.id))) return;
        if (el.member && SKIP_MEMBER.test(String(el.member))) return;
        const alpha = el.blend === undefined ? 1 : Math.max(0, Math.min(1, Number(el.blend) / 100));
        if (alpha <= 0) return;

        if (el.media === "#shape") {
            if (!el.color) return;                       // a mask or a bar
            const rgb = String(el.color).replace("#", "");
            const c = [parseInt(rgb.slice(0, 2), 16), parseInt(rgb.slice(2, 4), 16), parseInt(rgb.slice(4, 6), 16)];
            for (let y = 0; y < (el.height || 0); y++) {
                const dy = toY(el.locV + y);
                if (dy < skyH || dy >= OUT_H) continue;
                for (let x = 0; x < (el.width || 0); x++) into.put(toX(el.locH + x), dy, c, alpha);
            }
            return;
        }

        const m = byName.get(el.member);
        if (!m || !m.bitmap) return;
        const img = pixels(m);
        if (!img) return;
        const left = el.locH - m.bitmap.regX;
        const top = el.locV - m.bitmap.regY;
        const flip = Number(el.flipH) === 1;
        for (let y = 0; y < img.h; y++) {
            const dy = toY(top + y);
            if (dy < skyH || dy >= OUT_H) continue;
            for (let x = 0; x < img.w; x++) {
                const v = img.idx[y * img.pitch + x];
                if (v === 0) continue;                   // index 0 is the hole
                const sx = flip ? img.w - 1 - x : x;
                into.put(toX(left + sx), dy, img.pal[v] || [255, 0, 255], alpha);
            }
        }
    }

    /* light1, on a layer of its own.

       It is drawn with ink 33 — #addpin, Director's ADD — over the whole
       picture, so it cannot be baked into either of the other two: the front
       layer is transparent wherever nothing is built, and a transparent pixel
       carrying "add 40 to whatever is underneath" is not something a PNG
       composited normally can say. So it comes out as its own image and the
       browser draws it with globalCompositeOperation "lighter", which is the
       same sum.

       IT IS STRETCHED, and that is the part that is easy to miss. The member
       is a 168x168 disc; the element asks for 679x328. Drawn at its own size
       it is a hard little ball in one corner of the sky rather than a wash
       across it, and the registration point has to be scaled with it or the
       ball lands in the wrong corner as well.

       The greyscale reading is the ordinary one — index 0 is the hole, every
       other index is 255-i — and it has to be, because this disc is index 0
       OUTSIDE and 255 at its rim falling to 145 in the middle. Read straight
       it is a white ring with a grey hole; read the house way it is what it
       actually is: nothing at the edges, brightest in the centre. */
    function paintGlow(el) {
        const m = byName.get(el.member);
        if (!m || !m.bitmap) return;
        const img = pixels(m);
        if (!img) return;
        const alpha = el.blend === undefined ? 1 : Math.max(0, Math.min(1, Number(el.blend) / 100));
        if (alpha <= 0) return;

        const sw = Math.max(1, Number(el.width) || img.w);
        const sh = Math.max(1, Number(el.height) || img.h);
        const kx = sw / img.w, ky = sh / img.h;
        const left = el.locH - Math.round(m.bitmap.regX * kx);
        const top = el.locV - Math.round(m.bitmap.regY * ky);

        for (let y = 0; y < sh; y++) {
            const dy = toY(top + y);
            if (dy < 0 || dy >= OUT_H) continue;
            const sy = Math.min(img.h - 1, Math.floor(y / ky));
            for (let x = 0; x < sw; x++) {
                const v = img.idx[sy * img.pitch + Math.min(img.w - 1, Math.floor(x / kx))];
                if (v === 0) continue;
                const c = img.pal[v] || [0, 0, 0];
                glow.put(toX(left + x), dy,
                    [Math.round(c[0] * alpha), Math.round(c[1] * alpha), Math.round(c[2] * alpha)], 1);
            }
        }
    }

    elements.forEach((el, i) => {
        if (IS_CLOUD.test(String(el.member || ""))) return;
        if (GLOW_MEMBER.test(String(el.member || ""))) { paintGlow(el); return; }
        paint(el, i < firstCloud ? back : front);
    });

    /* Fill the rows above the picture by carrying the back layer's own top
       row upward, COLUMN BY COLUMN.

       One flat colour would be simpler and is wrong: these paint
       their sky in two tones side by side, so a single fill left a hard seam
       across the top of the picture where the second tone began. Per column
       there is no seam at all.

       This is only safe because the back layer is SKY — everything built on
       the ground is in the front layer. Carrying columns up through a picture
       with buildings in it, which is what this did when there was only one
       layer, streaks their tops off the top of the frame. */
    for (let x = 0; x < OUT_W; x++) {
        const src = (skyH * OUT_W + x) * 4;
        for (let y = 0; y < skyH; y++) {
            const o = (y * OUT_W + x) * 4;
            back.buf[o] = back.buf[src];
            back.buf[o + 1] = back.buf[src + 1];
            back.buf[o + 2] = back.buf[src + 2];
            back.buf[o + 3] = 255;
        }
    }

    // Each cloud's sprite and where this hotel starts it.
    const clouds = [];
    for (const i of cloudAt) {
        const el = elements[i];
        const m = byName.get(el.member);
        if (!m || !m.bitmap) continue;
        clouds.push({
            sprite: el.member,
            x: toX(el.locH - m.bitmap.regX),
            y: toY(el.locV - m.bitmap.regY)
        });
    }

    return { back: back.buf, front: front.buf, glow: glow.buf, clouds, bandH, skyH, lastCloud };
}

/* The cloud sprites themselves, once: every cast ships the same eight, at the
   same sizes and registration points.

   THEY NEED MATTE INK, which is the one place in this client where "index 0
   is the hole" is wrong. The visual draws every cloud with #ink: 8 — matte —
   and a cloud is WHITE artwork on a WHITE field, both of them index 0 in the
   grayscale palette. Treated the usual way the whole cloud disappears and
   what is left is its outline and a little shading: hollow rings drifting
   across the sky.

   Matte means the background is flooded from the EDGES. Anything index 0 that
   a flood from the border can reach is outside the shape; anything it cannot
   reach is inside it, and stays. That is the difference between a cloud and
   an outline of one. */
function buildClouds(file, dir) {
    const { byName, pixels } = openView(file);
    const out = [];
    for (const [name, m] of byName) {
        if (!IS_CLOUD.test(name) || !m.bitmap) continue;
        const img = pixels(m);
        if (!img) continue;

        const at = (x, y) => img.idx[y * img.pitch + x];
        const outside = new Uint8Array(img.w * img.h);
        const stack = [];
        const push = (x, y) => {
            if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
            const i = y * img.w + x;
            if (outside[i] || at(x, y) !== 0) return;
            outside[i] = 1;
            stack.push(x, y);
        };
        for (let x = 0; x < img.w; x++) { push(x, 0); push(x, img.h - 1); }
        for (let y = 0; y < img.h; y++) { push(0, y); push(img.w - 1, y); }
        while (stack.length) {
            const y = stack.pop(), x = stack.pop();
            push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
        }

        const rgba = Buffer.alloc(img.w * img.h * 4);
        for (let y = 0; y < img.h; y++) {
            for (let x = 0; x < img.w; x++) {
                if (outside[y * img.w + x]) continue;
                const c = img.pal[at(x, y)] || [255, 255, 255];
                const o = (y * img.w + x) * 4;
                rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
            }
        }
        fs.writeFileSync(path.join(dir, name + ".png"), encodePng(img.w, img.h, rgba));
        out.push({ name, w: img.w, h: img.h });
    }
    return out;
}

if (require.main === module) {
    const dir = path.join(__dirname, "..", "assets", "img", "hotel");
    fs.mkdirSync(dir, { recursive: true });

    const clouds = buildClouds(VIEWS[0].file, dir);
    console.log(`clouds: ${clouds.length} sprites`);

    const data = [];
    for (const v of VIEWS) {
        let r;
        try { r = build(v); }
        catch (e) { console.log(`${v.file}: ${e.message}`); continue; }
        fs.writeFileSync(path.join(dir, `${v.key}-back.png`), encodePng(OUT_W, OUT_H, r.back));
        fs.writeFileSync(path.join(dir, `${v.key}-front.png`), encodePng(OUT_W, OUT_H, r.front));
        fs.writeFileSync(path.join(dir, `${v.key}-glow.png`), encodePng(OUT_W, OUT_H, r.glow));
        data.push({ key: v.key, clouds: r.clouds });
        console.log(`${v.key.padEnd(3)} band ${r.bandH}px, ${r.skyH}px of sky above, ${r.clouds.length} clouds`);
    }

    const js = `/* The Habbo Origins hotel views, as the title screen needs them.

   GENERATED by tools/hotel-view-extract.js from the client's own
   hh_entry_*.cct — do not hand-edit, re-run the tool.

   Each hotel is three pictures and a list of clouds:
   assets/img/hotel/<key>-back.png is the sky, <key>-front.png is everything
   built on the ground, and <key>-glow.png is the client's own additive lamp,
   which js/room-lobby.js draws last with globalCompositeOperation "lighter".

   The clouds belong BETWEEN back and front, which is the order the client's
   own element list puts them in, and \`x\` and \`y\` are where that hotel starts
   each one. The game does not draw them — see the note in js/room-lobby.js —
   but their positions and their sprites (assets/img/hotel/cloud_*.png, shared:
   every cast ships the same eight) are here for anything that wants them. */
(function () {
    "use strict";
    window.HotelViews = ${JSON.stringify({ w: OUT_W, h: OUT_H, dir: "assets/img/hotel/", views: data }, null, 4)};
})();
`;
    const out = path.join(__dirname, "..", "js", "hotel-views.js");
    fs.writeFileSync(out, js);
    console.log(`wrote ${out}`);
}

module.exports = { build, VIEWS };

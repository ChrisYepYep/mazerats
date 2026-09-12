/* Reads Shockwave "Afterburner" cast files (.cct) — the Habbo Origins client's
   own asset containers — and pulls named bitmaps out of them as PNGs.

   WHY THIS EXISTS. The furni artwork on this site comes from FurniIndex as
   ready-made PNGs, which is fine for a card in the archive. The room game
   needs two things FurniIndex cannot give: the ROOM itself (floor, wall and
   stair tiles, which are not furni and appear in no catalogue), and avatar
   parts as individual layers so a figure can be rebuilt exactly rather than
   approximated by habbo-imaging.

   FORMAT, briefly, because none of it is documented publicly and every step
   below was established by reading bytes:

     XFIR <u32 size> CDGF          container; fourCCs are byte-REVERSED on disk
     Fver <vint len> ...           version
     Fcdr <vint len> ...           compression table
     ABMP <vint len> <vint ctype> <vint decompLen> <zlib>
                                   the resource map: for each resource, a run
                                   of varints — id, offset, compSize,
                                   decompSize, compressionType — then a
                                   reversed fourCC tag
     FGEI <vint 0>                 resource data follows; ABMP offsets are
                                   relative to the byte AFTER this varint,
                                   not after the fourCC

   Two traps worth naming, both of which cost real time:

   1. Resources with offset -1 are NOT stored individually. They live inside
      the single "ILS " blob, laid out as [varint resId][body] repeated, where
      each body's length is that resource's OWN decompSize from the map. Every
      CASt member is in there; the BITD pixel data is not.

   2. Endianness is MIXED. CASt member fields are big-endian, but KEY* follows
      the container and is little-endian. Read KEY* as big-endian and its
      header comes back claiming a header length of 3072 and 1.3 billion
      entries; as little-endian it says 12 and 328. */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { encodePng } = require("./png-encode.js");

const rev = (s) => s.split("").reverse().join("");

class Reader {
    constructor(b, p = 0) { this.b = b; this.p = p; }
    u8() { return this.b[this.p++]; }
    u16() { const v = this.b.readUInt16BE(this.p); this.p += 2; return v; }
    i16() { const v = this.b.readInt16BE(this.p); this.p += 2; return v; }
    u32() { const v = this.b.readUInt32BE(this.p); this.p += 4; return v; }
    fourcc() { const s = this.b.toString("latin1", this.p, this.p + 4); this.p += 4; return s; }
    /* Director varint: 7 bits per byte, high bit set means another follows.
       NOTE the callers below always take the length into a local BEFORE using
       it — `r.p += r.vint()` reads r.p before vint advances it, which silently
       rewinds the cursor and produces a container that looks truncated. */
    vint() { let v = 0, n; do { n = this.b[this.p++]; v = (v << 7) | (n & 0x7f); } while (n & 0x80); return v; }
}

function openCast(file) {
    const b = fs.readFileSync(file);
    const magic = b.toString("latin1", 0, 4);
    /* BOTH BYTE ORDERS EXIST IN THIS CLIENT, and refusing one of them hid a
       whole cast.

       Most of the .cct files are little-endian: they start "XFIR", their
       second fourCC is "CDGF", and every tag on disk is byte-reversed. Four
       are the other way round — "RIFX", "FGDC", tags the right way round —
       and among them is hh_furni_2025.cct, which is where every 2025 furni
       lives: the dark-mode set, the anniversary `*_dpolyfon*` set, the lot.

       This reader used to throw "not an XFIR container" at those, which read
       as "this cast holds nothing we want" rather than "this reader cannot
       open it", and the furni inside were written off as not being in the
       client at all. They were in it the whole time.

       Nothing but the order changes: same Afterburner layout, same varints
       (which are 7-bit big-endian either way), same member records. */
    const big = magic === "RIFX";
    if (!big && magic !== "XFIR") {
        throw new Error(`${path.basename(file)}: not an XFIR or RIFX container`);
    }
    const tagOf = (s) => (big ? s : rev(s));

    // 0..3 magic, 4..7 size, 8..11 the second fourCC; the chunk list is at 12.
    const r = new Reader(b, 12);
    let map = null, dataStart = null;
    while (r.p < b.length) {
        const tag = tagOf(r.fourcc());
        if (tag === "Fver" || tag === "Fcdr") { const n = r.vint(); r.p += n; continue; }
        if (tag === "ABMP") {
            const len = r.vint();
            const end = r.p + len;
            r.vint();                                   // compression type
            r.vint();                                   // decompressed length
            map = zlib.inflateSync(b.subarray(r.p, end));
            r.p = end;
            continue;
        }
        if (tag === "FGEI") { r.vint(); dataStart = r.p; break; }
        break;
    }
    if (!map || dataStart === null) throw new Error(`${path.basename(file)}: no ABMP/FGEI`);

    const m = new Reader(map);
    m.vint(); m.vint();
    const count = m.vint();
    const res = [];
    for (let i = 0; i < count; i++) {
        const id = m.vint(), off = m.vint(), comp = m.vint(), decomp = m.vint(), ctype = m.vint();
        const tag = tagOf(map.toString("latin1", m.p, m.p + 4)); m.p += 4;
        res.push({ id, off, comp, decomp, ctype, tag });
    }
    const byId = new Map(res.map(e => [e.id, e]));

    // Unpack the initial load segment (see trap 1 above).
    const inline = new Map();
    const ils = res.find(e => e.tag === "ILS ");
    if (ils) {
        const raw = b.subarray(dataStart + ils.off, dataStart + ils.off + ils.comp);
        const seg = ils.comp === ils.decomp ? raw : zlib.inflateSync(raw);
        const sr = new Reader(seg);
        while (sr.p < seg.length) {
            const id = sr.vint();
            const e = byId.get(id);
            if (!e) break;
            inline.set(id, seg.subarray(sr.p, sr.p + e.decomp));
            sr.p += e.decomp;
        }
    }

    const chunk = (e) => {
        if (!e) return Buffer.alloc(0);
        if (e.off < 0) return inline.get(e.id) || Buffer.alloc(0);
        const raw = b.subarray(dataStart + e.off, dataStart + e.off + e.comp);
        /* THE TABLE LIES ABOUT SOME CHUNKS, and the lie is quiet.

           Equal compressed and decompressed lengths is meant to mean "stored
           as-is", and for nearly everything it does. A set of the small text
           members — the per-class `.props` and `.data` fields — say comp ===
           decomp and are deflated anyway, so returning them raw hands back
           zlib's own header and a caller reading the first eight bytes as an
           offset and a length gets nonsense: 2027578208 and 1625317728 for
           skullcandle.props, which is 51 bytes long.

           Nothing threw. `readProps` simply found no text and moved on, so
           every class whose ink lived in one of these had it silently dropped.
           A zlib stream begins 0x78, which no Director chunk header does, so
           the giveaway is cheap to check and the inflate is tried whatever the
           table claims. */
        const deflated = raw.length > 1 && raw[0] === 0x78;
        if (e.comp === e.decomp && !deflated) return raw;
        try { return zlib.inflateSync(raw); } catch { return raw; }
    };

    /* KEY* ties an owning cast member to its child chunks — the pixels of
       member 6 are in whichever BITD the table says belongs to it. Little
       endian; see trap 2. */
    const keyChunk = chunk(res.find(e => e.tag === "KEY*"));
    const childOf = new Map();                          // `${castId}:${tag}` -> sectionId
    if (keyChunk.length >= 12) {
        // KEY* follows the CONTAINER's order, so it flips with it.
        const u16 = (o) => (big ? keyChunk.readUInt16BE(o) : keyChunk.readUInt16LE(o));
        const u32 = (o) => (big ? keyChunk.readUInt32BE(o) : keyChunk.readUInt32LE(o));
        const hdrLen = u16(0);
        const entrySize = u16(2) || 12;
        const used = u32(8);
        const fits = Math.floor((keyChunk.length - hdrLen) / entrySize);
        for (let i = 0; i < Math.min(used, fits); i++) {
            const o = hdrLen + i * entrySize;
            const sectionId = u32(o);
            const castId = u32(o + 4);
            const tag = tagOf(keyChunk.toString("latin1", o + 8, o + 12));
            childOf.set(`${castId}:${tag}`, sectionId);
        }
    }

    /* CAS* is the cast's member-number index: big-endian resource ids, one per
       slot, so member N is castTable[N - 1]. Needed to turn a bitmap's palette
       reference (a member NUMBER) into the palette member's actual chunk. */
    const casChunk = chunk(res.find(e => e.tag === "CAS*"));
    const castTable = [];
    for (let o = 0; o + 4 <= casChunk.length; o += 4) castTable.push(casChunk.readUInt32BE(o));

    return { res, byId, chunk, childOf, castTable };
}

/* A cast member: u32 type, u32 infoLen, u32 specificLen, info block, specific
   block. The name lives in the info block's offset table (slot 1); the pixel
   geometry lives in the specific block. */
function readMember(buf) {
    if (buf.length < 12) return null;
    const type = buf.readUInt32BE(0);
    const infoLen = buf.readUInt32BE(4);
    const specLen = buf.readUInt32BE(8);
    const infoStart = 12;
    const specStart = infoStart + infoLen;

    let name = null;
    if (infoLen > 0) {
        try {
            const r = new Reader(buf, infoStart);
            const hdrLen = r.u32();
            r.p = infoStart + hdrLen;
            const n = r.u16();
            const offs = [];
            for (let i = 0; i <= n; i++) offs.push(r.u32());
            const listStart = r.p;
            if (n >= 2 && offs[2] > offs[1]) {
                const s = listStart + offs[1];
                name = buf.toString("latin1", s + 1, s + 1 + buf[s]);
            }
        } catch { /* an unnamed or oddly-shaped member is not fatal */ }
    }

    /* The specific block, as 16-bit words, established by dumping it across
       related parts and watching which field moves like an origin:

         w0        pitch (low 15 bits)
         w1..w4    bounds: top, left, bottom, right
         w5,w6     256, 0 — constant on every member seen
         w7,w8     authoring-time stage coordinates. These vary wildly between
                   directions of the SAME part (-101,-68 for the body facing 0
                   against -373,-475 facing 1), which is exactly why they are
                   not the registration point, however much they look like one.
         w9,w10    regY, regX. Consistent across directions of a part and
                   sensible between parts: the floor shadow's regY sits at its
                   vertical middle, a shirt's sits BELOW its own bottom edge,
                   because every part shares one origin down at the feet.
         w11       16392 (0x4008), constant
         w12,w13   palette reference: castLib, member number. A NEGATIVE member
                   means one of Director's built-in palettes (avatar parts are
                   all -1,-2); a positive one names a palette cast member in
                   this file (the room's wall panels are -1,81). */
    let bitmap = null;
    if (type === 1 && specLen >= 22 && buf.length >= specStart + 22) {
        const s = new Reader(buf, specStart);
        const pitch = s.u16() & 0x7fff;
        const top = s.i16(), left = s.i16(), bottom = s.i16(), right = s.i16();
        s.i16(); s.i16();                               // w5, w6
        s.i16(); s.i16();                               // w7, w8 — stage coords
        const regY = s.i16(), regX = s.i16();           // w9, w10
        let paletteMember = null, bitDepth = 8;
        if (specLen >= 28 && buf.length >= specStart + 28) {
            /* w11's low byte is the BIT DEPTH, and it matters more than it
               looks. Half the furni in this client are 32-bit true colour
               rather than palette-indexed — cabin_divider_arm2 is 32-bit where
               divider_arm2 is 8-bit, which is how the same artwork ships in two
               colourways. Read one as the other and you get 5,140 pixels of
               nonsense. The pitch agrees: 4 bytes per pixel against 1. */
            const w11 = s.i16();
            s.i16();                                    // w12 — castLib
            paletteMember = s.i16();                    // w13
            bitDepth = w11 & 0xff;
        }
        const w = right - left;
        if (![1, 2, 4, 8, 16, 32].includes(bitDepth)) {
            bitDepth = w > 0 ? Math.round((8 * pitch) / w) : 8;
        }
        bitmap = { pitch, w, h: bottom - top, regX, regY, paletteMember, bitDepth };
    }
    return { type, name, bitmap };
}

/* Director stores bitmap rows PackBits-compressed, unless the payload is
   already exactly pitch*height in which case it is raw. */
function unpackBits(src, expected) {
    const out = Buffer.alloc(expected);
    let i = 0, o = 0;
    while (o < expected && i < src.length) {
        const b = src[i++];
        if (b > 0x7f) {
            const run = 0x101 - b, v = src[i++];
            for (let k = 0; k < run && o < expected; k++) out[o++] = v;
        } else {
            const run = b + 1;
            for (let k = 0; k < run && o < expected && i < src.length; k++) out[o++] = src[i++];
        }
    }
    return out;
}

/* A CLUT is 6 bytes per entry, high byte first of each 16-bit channel, and it
   is in FILE ORDER: entry i is palette index i.

   THIS WAS BACKWARDS AND IT COST A LOT. The reversed reading was the default
   here, and it is wrong in the quiet way — it produces a palette, just not the
   right one, so everything renders and nothing throws. Two independent proofs
   that forwards is right:

     furni    chair_polyfon's own pixels were compared against the same chair
              as FurniIndex publish it, which gives the true colour per index:
              4 -> #737373, 7 -> #bfbfbf, 24 -> #f5fdfa, 128 -> #4f4f4f,
              255 -> #000000. All five match forwards; none match backwards.

     room     read forwards, floor_basic IS the Mac system palette (white at
              0, black at 255, the EE/DD/BB/AA/88/77/55/44/22/00 grey tail at
              246..255) and the wall panels' two reserved classes fall out
              exactly: 255 -> #000000 is the room's black outline and
              241 -> #969698 the wall's top surface, measured on a real
              Origins render at 0.588 of the face against 0.60. Read
              backwards, six wallpapers render blank and the wood floor's
              grain comes out pure blue.

   `reverse: true` is kept only so that a caller can demonstrate the
   difference; nothing in this repo passes it. */
function readClut(buf, opts) {
    const reverse = !!(opts && opts.reverse === true);
    const n = Math.floor(buf.length / 6);
    const pal = new Array(n);
    for (let i = 0; i < n; i++) {
        const o = i * 6;
        pal[reverse ? n - 1 - i : i] = [buf[o], buf[o + 2], buf[o + 4]];
    }
    return pal;
}

/* Fallback for casts that ship no CLUT of their own (the body parts are the
   notable case — they are outline stencils that the client flood-fills with a
   skin tone, so their three ink indices are all that matter). Greyscale keeps
   them legible and honest rather than inventing colours. */
function greyPalette() {
    return Array.from({ length: 256 }, (_, i) => [255 - i, 255 - i, 255 - i]);
}

function extract(file, { out, filter, list }) {
    const cast = openCast(file);
    const stem = path.basename(file, ".cct");

    /* A palette is PER MEMBER, not per cast: hh_room_private alone ships 65
       CLUTs, and applying whichever one happens to come first renders the wall
       panels as black with white speckle. KEY* names each member's own, so it
       is looked up alongside the pixels; the grey ramp is only for members
       that genuinely have none (the outline stencils the client flood-fills). */
    const grey = greyPalette();
    const isPalette = (slot) => {
        const id = cast.castTable[slot];
        return id !== undefined && cast.childOf.has(`${id}:CLUT`);
    };

    /* WHICH SLOT A PALETTE REFERENCE MEANS, which is not always memberNum - 1.

       Member numbering usually starts at 1, so slot = memberNum - 1. In
       hh_entry_us it starts three higher: the hotel view's bitmaps all say
       palette member 30 and the `Hotel_view_us_Palette` they plainly mean sits
       at slot 26. Left uncorrected the whole hotel view came out greyscale —
       which looks like artwork rather than a bug, since half of it is grey
       concrete anyway.

       So the shift is MEASURED per cast rather than assumed: whichever one
       makes the most palette references land on a member that actually has a
       CLUT. A cast whose references are already right scores best at zero and
       nothing changes. */
    const paletteShift = (() => {
        const wanted = [];
        for (const e of cast.res.filter(x => x.tag === "CASt")) {
            const m = readMember(cast.chunk(e));
            if (m && m.bitmap && m.bitmap.paletteMember > 0) wanted.push(m.bitmap.paletteMember);
        }
        if (!wanted.length) return 0;
        let best = 0, bestHit = -1;
        for (let k = 0; k <= 8; k++) {
            let hit = 0;
            for (const n of wanted) if (isPalette(n - 1 - k)) hit++;
            if (hit > bestHit) { bestHit = hit; best = k; }
        }
        return best;
    })();

    const clutCache = new Map();
    const paletteFor = (memberNum) => {
        if (memberNum === null || memberNum <= 0) return grey;  // built-in palette
        if (clutCache.has(memberNum)) return clutCache.get(memberNum);
        let pal = grey;
        const ownerId = cast.castTable[memberNum - 1 - paletteShift];
        if (ownerId !== undefined) {
            const clutId = cast.childOf.get(`${ownerId}:CLUT`);
            if (clutId !== undefined) {
                const c = readClut(cast.chunk(cast.byId.get(clutId)));
                if (c.length >= 16) pal = c;
            }
        }
        clutCache.set(memberNum, pal);
        return pal;
    };
    let usedClut = 0;

    const members = [];
    for (const e of cast.res.filter(x => x.tag === "CASt")) {
        const m = readMember(cast.chunk(e));
        if (m && m.name && m.bitmap) members.push({ id: e.id, ...m });
    }

    const re = filter ? new RegExp(filter) : null;
    const chosen = re ? members.filter(m => re.test(m.name)) : members;

    if (list) {
        console.log(`${stem}: ${members.length} named bitmap members` +
            (re ? `, ${chosen.length} matching /${filter}/` : ""));
        for (const m of chosen) {
            console.log(`  ${m.name.padEnd(30)} ${String(m.bitmap.w).padStart(4)}x${String(m.bitmap.h).padEnd(4)}` +
                ` reg ${String(m.bitmap.regX).padStart(5)},${String(m.bitmap.regY).padStart(5)}`);
        }
        return { members: chosen.length, written: 0 };
    }

    const dir = path.join(out, stem);
    fs.mkdirSync(dir, { recursive: true });
    const manifest = [];
    let written = 0, empty = 0;

    for (const m of chosen) {
        const bitdId = cast.childOf.get(`${m.id}:BITD`);
        const raw = cast.chunk(cast.byId.get(bitdId));
        const { pitch, w, h, regX, regY } = m.bitmap;
        if (!raw.length || w <= 0 || h <= 0) { empty++; continue; }

        const expected = pitch * h;
        const idx = raw.length === expected ? raw : unpackBits(raw, expected);
        const palette = paletteFor(m.bitmap.paletteMember);
        if (palette !== grey) usedClut++;

        // Index 0 is transparent throughout these casts.
        const rgba = Buffer.alloc(w * h * 4);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const v = idx[y * pitch + x];
                const o = (y * w + x) * 4;
                if (v === 0) continue;
                const c = palette[v] || [255, 0, 255];
                rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
            }
        }
        const png = `${m.name}.png`;
        fs.writeFileSync(path.join(dir, png), encodePng(w, h, rgba));
        manifest.push({ name: m.name, file: png, w, h, regX, regY });
        written++;
    }

    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
        source: path.basename(file),
        extractedAt: new Date().toISOString(),
        palettedFromClut: usedClut,
        palettedFromGreyFallback: manifest.length - usedClut,
        count: manifest.length,
        members: manifest
    }, null, 2));

    console.log(`${stem}: wrote ${written} png${written === 1 ? "" : "s"} to ${dir}` +
        (empty ? ` (${empty} member${empty === 1 ? "" : "s"} had no pixel data)` : ""));
    return { members: chosen.length, written };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const opts = { out: path.join(__dirname, ".cache", "cct"), filter: null, list: false };
    const files = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--list") opts.list = true;
        else if (args[i] === "--out") opts.out = args[++i];
        else if (args[i] === "--filter") opts.filter = args[++i];
        else files.push(args[i]);
    }
    if (!files.length) {
        console.error("usage: node cct-extract.js [--list] [--filter <regex>] [--out <dir>] <file.cct>...");
        process.exit(1);
    }
    for (const f of files) {
        try { extract(f, opts); }
        catch (err) { console.error(`${path.basename(f)}: ${err.message}`); }
    }
}

/* The named bitmap members of a cast, with their sizes and registration
   points, as data. --list prints exactly this; other tools want it in hand
   rather than scraped back out of stdout. No pixels are decoded, so this is
   cheap enough to run across every cast in the client. */
function listCast(file) {
    const cast = openCast(file);
    const out = [];
    for (const e of cast.res.filter(x => x.tag === "CASt")) {
        const m = readMember(cast.chunk(e));
        if (!m || !m.name || !m.bitmap) continue;
        const { w, h, regX, regY } = m.bitmap;
        out.push({ id: e.id, name: m.name, w, h, regX, regY });
    }
    return out;
}

module.exports = { openCast, readMember, unpackBits, readClut, listCast };

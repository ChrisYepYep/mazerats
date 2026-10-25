/* Take an Lscr chunk apart, and put it back together byte for byte.
 *
 * Patching one handler in place only needed a reader. Adding handlers,
 * properties and literals needs a WRITER, and a writer you cannot trust is
 * worse than none: a wrong offset in a script chunk does not fail loudly, it
 * makes Director read somebody else's bytes as code.
 *
 * So the contract here is round-tripping. parse() captures everything —
 * including the header bytes whose meaning is still unknown, the per-handler
 * blocks, and any padding after the literal data — and build() re-emits it.
 * `--verify` runs parse -> build over every live script in the client and
 * requires the output to be identical to the input, on all of them. Only once
 * that holds is the writer allowed near an edit.
 *
 * LAYOUT, in the order things sit in the chunk:
 *
 *     header          0 .. 92, with the counts and offsets below
 *     properties      @60 count, @62 offset — u16 name indices
 *     globals         @66 count, @68 offset — u16 name indices
 *     handlers        @72 count, @74 offset — 46 bytes each
 *     per handler     code, args, locals, globals, lines — in that order,
 *                     one group after another, for each handler in turn
 *     literal table   @78 count, @80 offset — 8 bytes each: u32 type, u32
 *                     offset relative to the literal data
 *     literal data    @84 length, @88 offset
 *     tail            anything after that; 55 of the client's 1052 live
 *                     scripts have a few bytes of it
 *
 * A handler record, 46 bytes:
 *
 *     @0  nameID u16      @2  vectorPos u16     @4  codeLength u32
 *     @8  codeOffset u32  @12 argCount u16      @14 argOffset u32
 *     @18 localCount u16  @20 localOffset u32   @24 globalCount u16
 *     @26 globalOffset u32 @30 unknown u32      @34 unknown u16
 *     @36 lineLength u16  @38 lineOffset u32    @42 stackHeight u32
 *
 * lineLength is a BYTE count, not a record count: construct's lines run from
 * 2016 for 22 bytes and the next handler's code starts at exactly 2038.
 *
 * Three header words hold sizes rather than offsets, and they are not
 * interchangeable — @8 and @12 are the chunk's length on 1052/1052 live
 * scripts, while @52 is the end of the literal data, which is SMALLER than the
 * chunk on the 55 that carry a tail. Bumping @52 with the chunk size would
 * have been wrong on exactly those.
 */

const fs = require("fs");
const path = require("path");

const HEADER_LEN = 92;
const HANDLER_REC = 46;

const H = {
    totalLength: 8, totalLength2: 12, literalsEnd: 52,
    propertiesCount: 60, propertiesOffset: 62,
    globalsCount: 66, globalsOffset: 68,
    handlersCount: 72, handlersOffset: 74,
    literalsCount: 78, literalsOffset: 80,
    literalsDataLen: 84, literalsDataOffset: 88,
};

const R = {
    nameID: 0, vectorPos: 2, codeLength: 4, codeOffset: 8,
    argCount: 12, argOffset: 14, localCount: 18, localOffset: 20,
    globalCount: 24, globalOffset: 26, unknown1: 30, unknown2: 34,
    lineLength: 36, lineOffset: 38, stackHeight: 42,
};

function u16list(b, off, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(b.readUInt16BE(off + i * 2));
    return out;
}

function parse(chunk) {
    const b = chunk;
    if (b.length < HEADER_LEN) return null;

    const hCount = b.readUInt16BE(H.handlersCount);
    const hOff = b.readUInt32BE(H.handlersOffset);
    const litCount = b.readUInt16BE(H.literalsCount);
    const litOff = b.readUInt32BE(H.literalsOffset);
    const dataLen = b.readUInt32BE(H.literalsDataLen);
    const dataOff = b.readUInt32BE(H.literalsDataOffset);

    const handlers = [];
    for (let i = 0; i < hCount; i++) {
        const o = hOff + i * HANDLER_REC;
        const rec = Buffer.from(b.subarray(o, o + HANDLER_REC));
        const get = (f) => (f === R.nameID || f === R.vectorPos || f === R.argCount ||
            f === R.localCount || f === R.globalCount || f === R.unknown2 ||
            f === R.lineLength) ? rec.readUInt16BE(f) : rec.readUInt32BE(f);
        const h = {
            rec,
            nameID: get(R.nameID),
            code: Buffer.from(b.subarray(get(R.codeOffset), get(R.codeOffset) + get(R.codeLength))),
            args: u16list(b, get(R.argOffset), get(R.argCount)),
            locals: u16list(b, get(R.localOffset), get(R.localCount)),
            globals: u16list(b, get(R.globalOffset), get(R.globalCount)),
            lines: Buffer.from(b.subarray(get(R.lineOffset), get(R.lineOffset) + get(R.lineLength))),
        };
        handlers.push(h);
    }

    /* The literal table is (type, offset-into-the-data-block) pairs, and the
       data block is kept whole rather than sliced per literal.

       Slicing needs to know how long each entry is, and that is not uniform:
       strings and floats are length-prefixed, but a type-4 integer is four
       raw bytes, so reading its VALUE as a length walks off into the next
       literal. Entries can also share an offset when the compiler folds two
       identical literals. Keeping the block verbatim makes rebuilding exact
       and leaves adding a literal as an append. */
    const literals = [];
    for (let i = 0; i < litCount; i++) {
        const o = litOff + i * 8;
        literals.push({ type: b.readUInt32BE(o), rel: b.readUInt32BE(o + 4) });
    }
    const literalData = Buffer.from(b.subarray(dataOff, dataOff + dataLen));

    return {
        header: Buffer.from(b.subarray(0, HEADER_LEN)),
        properties: u16list(b, b.readUInt32BE(H.propertiesOffset), b.readUInt16BE(H.propertiesCount)),
        globals: u16list(b, b.readUInt32BE(H.globalsOffset), b.readUInt16BE(H.globalsCount)),
        handlers,
        literals,
        literalData,
        tail: Buffer.from(b.subarray(dataOff + dataLen)),
        // Kept only so build() can reproduce a quirk rather than rationalise it.
        _origPropertiesOffset: b.readUInt32BE(H.propertiesOffset),
    };
}

function build(s) {
    const parts = [];
    let at = 0;
    const push = (buf) => { parts.push(buf); at += buf.length; };
    const pad = (to) => { if (at < to) push(Buffer.alloc(to - at)); };
    /* Every block starts on an even offset. Only code and line data can be an
       odd length — the name lists are u16 arrays — so this shows up as a
       one-byte gap after those, and packing the blocks tight came out 29 bytes
       short on the worst script. */
    const align = () => { if (at & 1) push(Buffer.alloc(1)); };

    const header = Buffer.from(s.header);
    push(header);

    /* Properties sit at 92 on every script seen, but the original offset is
       honoured rather than assumed so a script that pads here still rebuilds
       byte-exactly. */
    pad(s._origPropertiesOffset);
    const propsOffset = at;
    const propBuf = Buffer.alloc(s.properties.length * 2);
    s.properties.forEach((v, i) => propBuf.writeUInt16BE(v, i * 2));
    push(propBuf);

    const globalsOffset = at;
    const globBuf = Buffer.alloc(s.globals.length * 2);
    s.globals.forEach((v, i) => globBuf.writeUInt16BE(v, i * 2));
    push(globBuf);

    const handlersOffset = at;
    const recs = s.handlers.map(h => Buffer.from(h.rec));
    for (const r of recs) push(r);

    // Each handler's code, args, locals, globals and lines, in that order.
    s.handlers.forEach((h, i) => {
        const r = recs[i];
        align();
        r.writeUInt32BE(at, R.codeOffset); r.writeUInt32BE(h.code.length, R.codeLength);
        push(h.code);
        align();
        r.writeUInt32BE(at, R.argOffset); r.writeUInt16BE(h.args.length, R.argCount);
        const a = Buffer.alloc(h.args.length * 2); h.args.forEach((v, k) => a.writeUInt16BE(v, k * 2));
        push(a);
        align();
        r.writeUInt32BE(at, R.localOffset); r.writeUInt16BE(h.locals.length, R.localCount);
        const l = Buffer.alloc(h.locals.length * 2); h.locals.forEach((v, k) => l.writeUInt16BE(v, k * 2));
        push(l);
        align();
        r.writeUInt32BE(at, R.globalOffset); r.writeUInt16BE(h.globals.length, R.globalCount);
        const g = Buffer.alloc(h.globals.length * 2); h.globals.forEach((v, k) => g.writeUInt16BE(v, k * 2));
        push(g);
        align();
        r.writeUInt32BE(at, R.lineOffset); r.writeUInt16BE(h.lines.length, R.lineLength);
        push(h.lines);
    });

    align();
    const literalsOffset = at;
    const table = Buffer.alloc(s.literals.length * 8);
    push(table);
    s.literals.forEach((lit, i) => {
        table.writeUInt32BE(lit.type, i * 8);
        table.writeUInt32BE(lit.rel, i * 8 + 4);
    });
    const dataOffset = at;
    push(s.literalData);
    const dataLen = s.literalData.length;

    push(Buffer.from(s.tail));

    const out = Buffer.concat(parts);
    out.writeUInt16BE(s.properties.length, H.propertiesCount);
    out.writeUInt32BE(propsOffset, H.propertiesOffset);
    out.writeUInt16BE(s.globals.length, H.globalsCount);
    out.writeUInt32BE(globalsOffset, H.globalsOffset);
    out.writeUInt16BE(s.handlers.length, H.handlersCount);
    out.writeUInt32BE(handlersOffset, H.handlersOffset);
    out.writeUInt16BE(s.literals.length, H.literalsCount);
    out.writeUInt32BE(literalsOffset, H.literalsOffset);
    out.writeUInt32BE(dataLen, H.literalsDataLen);
    out.writeUInt32BE(dataOffset, H.literalsDataOffset);
    out.writeUInt32BE(out.length, H.totalLength);
    out.writeUInt32BE(out.length, H.totalLength2);
    out.writeUInt32BE(dataOffset + dataLen, H.literalsEnd);
    return out;
}

module.exports = { parse, build, H, R, HANDLER_REC };

/* ---- verification ------------------------------------------------------- */

if (require.main === module) {
    const { openClient, CLIENT } = require("./lingo-client.js");
    let total = 0, exact = 0;
    const bad = [];
    for (const f of fs.readdirSync(CLIENT).filter(x => /\.cct$/i.test(x)).sort()) {
        let c;
        try { c = openClient(f); } catch { continue; }
        for (const s of c.scripts) {
            const parsed = parse(s.chunk);
            if (!parsed) continue;
            total++;
            const rebuilt = build(parsed);
            if (rebuilt.equals(s.chunk)) exact++;
            else if (bad.length < 8) {
                bad.push(`${f}#${s.id}: ${s.chunk.length} -> ${rebuilt.length} bytes`);
            }
        }
    }
    console.log(`round-tripped ${exact}/${total} live scripts byte for byte`);
    if (bad.length) { console.log("first failures:"); for (const b of bad) console.log(`  ${b}`); }
    process.exit(exact === total ? 0 : 1);
}

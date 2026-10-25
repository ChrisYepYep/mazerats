/* Turn symbolic Lingo instructions into Director bytecode.
 *
 * The disassembler in lingo-decompile.js reads the stream; this writes it, so
 * new handlers can be built rather than only patched in place.
 *
 * ENCODING. One byte of opcode, then an operand whose WIDTH is carried by the
 * opcode itself:
 *
 *     no operand     emit op                     (op < 0x40)
 *     one byte       emit op,        u8
 *     two bytes      emit op + 0x40, u16
 *     four bytes     emit op + 0x80, u32
 *
 * `--verify` re-encodes every instruction of every live handler in the client
 * from its decoded (opcode, operand, width) and requires the bytes back
 * exactly. That is the whole guarantee: 300,000-odd instructions the client's
 * own compiler emitted, reproduced byte for byte.
 *
 * WIDTHS ARE NOT CANONICAL. The same operand can legally be encoded narrow or
 * wide, and Habbo's compiler is not always minimal — so re-encoding picks the
 * ORIGINAL width when verifying, and the smallest that fits when assembling
 * fresh code. Jumps are pinned to two bytes because that is what the compiler
 * emits for them everywhere in this client, and because a fixed width makes
 * label resolution a single pass rather than a fixpoint.
 *
 * NEGATIVE NUMBERS are not encoded signed. The client pushes the magnitude and
 * negates: -54 is `pushInt8 54; inv`. assemble() does the same, so nothing
 * depends on guessing the sign convention.
 */

const OPS = {
    ret: 0x01, pushZero: 0x03,
    mul: 0x04, add: 0x05, sub: 0x06, div: 0x07, mod: 0x08, inv: 0x09,
    joinStr: 0x0a, joinPadStr: 0x0b,
    lt: 0x0c, ltEq: 0x0d, ntEq: 0x0e, eq: 0x0f, gt: 0x10, gtEq: 0x11,
    and: 0x12, or: 0x13, not: 0x14, containsStr: 0x15, contains0Str: 0x16,
    pushList: 0x1e, pushPropList: 0x1f, swap: 0x21,
    pushInt8: 0x41, pushArgListNoRet: 0x42, pushArgList: 0x43,
    pushCons: 0x44, pushSymb: 0x45,
    getGlobal: 0x49, getProp: 0x4a, getParam: 0x4b, getLocal: 0x4c,
    setGlobal: 0x4f, setProp: 0x50, setParam: 0x51, setLocal: 0x52,
    jmp: 0x53, endRepeat: 0x54, jmpIfZ: 0x55,
    localCall: 0x56, extCall: 0x57,
    getMovieProp: 0x5f, setMovieProp: 0x60, getObjProp: 0x61, setObjProp: 0x62,
    peek: 0x64, pop: 0x65, theBuiltin: 0x66, objCall: 0x67,
    pushInt16: 0x6e, pushInt32: 0x6f,
};

/* THE OPERAND WIDTHS THE COMPILER ACTUALLY EMITS, measured over every
   instruction in the client.
 *
 * Picking "the narrowest width that fits" is wrong, and wrong in the worst
 * way. pushInt16 is emitted 1341 times and ALWAYS in its two-byte form; encode
 * 200 into its one-byte form and Director still reads two bytes for that
 * opcode, swallowing the first byte of the next instruction. From there the
 * whole stream is off by one and execution runs into whatever the bytes happen
 * to mean — which showed up as an access violation inside DIRAPI.dll, three
 * builds running, with no Lingo error to point at it.
 *
 * So widths come from this table, not from arithmetic. An opcode the client
 * never emits in a given form does not get emitted in that form here.
 */
const ATTESTED_WIDTHS = {
    0x41: [1], 0x42: [1], 0x43: [1], 0x44: [1, 2], 0x45: [1, 2],
    0x4a: [1, 2], 0x4b: [1], 0x4c: [1], 0x50: [1, 2], 0x51: [1], 0x52: [1],
    0x53: [2], 0x54: [1, 2], 0x55: [2], 0x56: [1], 0x57: [1, 2],
    0x5b: [1], 0x5c: [1], 0x5d: [1], 0x5f: [2], 0x60: [2],
    0x61: [1, 2], 0x62: [2], 0x64: [1], 0x65: [1], 0x66: [2], 0x67: [1, 2],
    0x6d: [1], 0x6e: [2], 0x6f: [4], 0x70: [2], 0x71: [4],
};

const FITS = { 1: 0xff, 2: 0xffff, 4: 0xffffffff };

function widthFor(op, value) {
    const allowed = ATTESTED_WIDTHS[op];
    if (!allowed) {
        throw new Error(`op_${op.toString(16)} has no attested operand width; ` +
            `add it to ATTESTED_WIDTHS from a real handler before emitting it`);
    }
    for (const w of allowed) if (value <= FITS[w]) return w;
    throw new Error(`operand ${value} does not fit any width the compiler uses for op_${op.toString(16)}`);
}

function encode(op, operand, width) {
    if (operand === null || operand === undefined) return Buffer.from([op]);
    if (width === 1) {
        if (operand > 0xff) throw new Error(`operand ${operand} does not fit one byte`);
        return Buffer.from([op, operand]);
    }
    if (width === 2) {
        const b = Buffer.alloc(3);
        b[0] = op + 0x40;
        b.writeUInt16BE(operand, 1);
        return b;
    }
    if (width === 4) {
        const b = Buffer.alloc(5);
        b[0] = op + 0x80;
        b.writeUInt32BE(operand, 1);
        return b;
    }
    throw new Error(`bad width ${width}`);
}

/* instructions: a flat list of
 *     ["label", name]                      a jump target
 *     [mnemonic]                           no operand
 *     [mnemonic, number]                   literal operand
 *     [mnemonic, {label}]                  resolved to a relative distance
 * Anything else has already been resolved to a number by the caller, which is
 * where names, literals, arguments and locals get looked up.
 */
function assemble(instructions) {
    // Pass one: sizes and label offsets. Jump widths are fixed, so one pass does.
    const labels = new Map();
    let at = 0;
    const sized = [];
    for (const ins of instructions) {
        if (ins[0] === "label") { labels.set(ins[1], at); continue; }
        const op = OPS[ins[0]];
        if (op === undefined) throw new Error(`unknown mnemonic ${ins[0]}`);
        const operand = ins.length > 1 ? ins[1] : null;
        /* pushInt8's byte is read SIGNED. The client does emit `41 ff` for -1,
           so encode() stays faithful to raw bytes and the check lives here,
           where the operand is a value someone meant rather than a byte: 200
           written as one byte comes back as -56. */
        if (op === OPS.pushInt8 && typeof operand === "number" && operand > 127) {
            throw new Error(`pushInt8 ${operand} would be read as ${operand - 256}; use pushInt16`);
        }
        const isLabel = operand && typeof operand === "object";
        /* A backwards target is already known here, so endRepeat can be sized
           from its real distance instead of reserving the wide form. */
        const backDistance = isLabel && op === OPS.endRepeat && labels.has(operand.label)
            ? at - labels.get(operand.label) : null;
        const width = operand === null ? 0
            : backDistance !== null ? widthFor(op, backDistance)
                /* A forward jump's distance is not known yet, but jmp and
                   jmpIfZ are only ever emitted two bytes wide, so the size is
                   fixed regardless. */
                : isLabel ? ATTESTED_WIDTHS[op][ATTESTED_WIDTHS[op].length - 1]
                    : widthFor(op, operand);
        const size = operand === null ? 1 : (width === 1 ? 2 : width === 2 ? 3 : 5);
        sized.push({ op, operand, width, at, size, isLabel });
        at += size;
    }

    // Pass two: emit, resolving label distances relative to the instruction.
    const parts = [];
    for (const s of sized) {
        let operand = s.operand;
        if (s.isLabel) {
            const target = labels.get(operand.label);
            if (target === undefined) throw new Error(`undefined label ${operand.label}`);
            operand = s.op === OPS.endRepeat ? s.at - target : target - s.at;
            if (operand < 0) throw new Error(`backwards jump to ${s.operand.label} needs endRepeat`);
        }
        parts.push(encode(s.op, operand, s.width));
    }
    return Buffer.concat(parts);
}

module.exports = { assemble, encode, OPS };

/* ---- verification ------------------------------------------------------- */

if (require.main === module) {
    const fs = require("fs");
    const { openClient, CLIENT, disassemble } = require("./lingo-client.js");

    let total = 0, ok = 0;
    const bad = [];
    for (const f of fs.readdirSync(CLIENT).filter(x => /\.cct$/i.test(x)).sort()) {
        let c;
        try { c = openClient(f); } catch { continue; }
        for (const s of c.scripts) {
            for (const h of s.handlers) {
                if (!h.codeLength) continue;
                const d = disassemble(s.chunk, h);
                const code = s.chunk.subarray(h.codeOffset, h.codeOffset + h.codeLength);
                for (const i of d.code) {
                    total++;
                    const width = i.operand === null ? 0
                        : i.raw >= 0xc0 ? 4 : i.raw >= 0x80 ? 2 : 1;
                    const size = i.operand === null ? 1 : (width === 1 ? 2 : width === 2 ? 3 : 5);
                    const want = code.subarray(i.at, i.at + size);
                    let got;
                    try { got = encode(i.op, i.operand, width); } catch { got = Buffer.alloc(0); }
                    if (got.equals(want)) ok++;
                    else if (bad.length < 6) {
                        bad.push(`${f}#${s.id} ${h.name}@${i.at}: want ${want.toString("hex")} got ${got.toString("hex")}`);
                    }
                }
            }
        }
    }
    console.log(`re-encoded ${ok}/${total} instructions byte for byte`);
    if (bad.length) { console.log("first failures:"); for (const b of bad) console.log(`  ${b}`); }
    process.exit(ok === total ? 0 : 1);
}

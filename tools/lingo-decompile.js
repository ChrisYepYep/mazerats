/* Reads the Habbo Origins client's compiled Lingo.

   The scripts in these casts are Lscr chunks — Director bytecode, not source.
   The usual advice is to build ProjectorRays, which needs a C++ toolchain this
   machine does not have. It turns out not to be necessary: the container
   reader in cct-extract.js already hands over the decompressed chunk, and the
   format above the bytecode is straightforward once measured.

   ----------------------------------------------------------------------
   WHAT IS IN AN Lscr, AND HOW THE LAYOUT WAS ESTABLISHED

   Big-endian, like the CASt records. The header carries counts and offsets:

       @60 propertiesCount   @62 propertiesOffset
       @66 globalsCount      @68 globalsOffset
       @72 handlersCount     @74 handlersOffset
       @78 literalsCount     @80 literalsOffset
       @84 literalsDataLen   @88 literalsDataOffset

   Checked rather than assumed: literalsDataOffset + literalsDataLen comes to
   exactly the chunk length, on every script in the client.

   Handler records are 46 bytes. That number was found by trying strides until
   the name indices all landed inside the name table — 46 is the only one that
   does, and it yields handler names that read like code (construct,
   solveColorList, renderPreviewImage) rather than noise.

       @0 nameID  @4 codeLength  @8 codeOffset
       @12 argCount @14 argOffset  @18 localCount @20 localOffset

   Names come from the cast's Lnam table; literals from the script's own.

   ----------------------------------------------------------------------
   INSTRUCTIONS, AND HOW MUCH OF THIS TO BELIEVE

   One byte of opcode, then an operand whose WIDTH is encoded in the opcode:

       op <  0x40   no operand
       op <  0x80   one byte,   canonical opcode = op
       op <  0xc0   two bytes,  canonical opcode = op - 0x40
       op >= 0xc0   four bytes, canonical opcode = op - 0x80

   That rule is self-checking: decode a handler with it and the instruction
   stream must land exactly on the end of its code, on a return. `--verify`
   runs that over every script in the client and reports how many land clean.

   The MNEMONICS are a different matter. Only the ones confirmed by reading
   real handlers are named here; everything else prints as op_XX with its
   operand rather than a guess. A wrong mnemonic reads like fact and is worse
   than an honest unknown — this whole project has been bitten by exactly that
   before. Names get promoted out of UNKNOWN as they are confirmed, and the
   argument for each is in the table.

   usage:
     node tools/lingo-decompile.js --verify              check the decoder
     node tools/lingo-decompile.js <cast.cct>            list its scripts
     node tools/lingo-decompile.js <cast.cct> --handler solveColorList
     node tools/lingo-decompile.js <cast.cct> --all      every handler
*/

const fs = require("fs");
const path = require("path");

const { openCast } = require("./cct-extract.js");

const CLIENT = process.env.HABBO_CLIENT ||
    "C:\\Users\\cjboy\\AppData\\Roaming\\Habbo Launcher\\downloads\\shockwave\\350";

/* Opcodes confirmed by reading handlers whose behaviour is predictable from
   their name and literals. Anything absent prints as op_XX — see the note
   above on why that matters. */
const OPS = {
    /* CONFIRMED — each of these was checked against real handlers, and the
       check is written down so the next person can disagree with it.

       ret          every handler's stream lands exactly on 0x01, on all
                    125,372 of them. Nothing else could be there.
       push.const   its operand indexes the script's literal table and the
                    values that come back read correctly in context: the
                    colour handlers push "*", "ffffff", "0,0,0".
       get/set param and local
                    their operands index the handler's OWN name lists, and
                    resolve to Lingo-looking argument names — me, tMemStr,
                    tColorList — in the right places. A wrong guess here would
                    produce unrelated names, not plausible ones. */
    0x01: "ret",
    0x44: "push.const",
    0x4b: "get.param", 0x4c: "get.local",
    0x51: "set.param", 0x52: "set.local",

    /* STRONGLY IMPLIED by position — named, but treat with a little care.
       Both always appear immediately before a call, carrying a count that
       matches the number of values pushed. */
    0x42: "arglist", 0x43: "arglist.noret"

    /* EVERYTHING ELSE PRINTS AS op_XX ON PURPOSE.

       An earlier draft of this table carried the arithmetic and comparison
       opcodes from memory — mul, add, lt, lteq, and so on. Disassembling
       getSmallsColor with them produced "push.const 'ffffff'; lteq;
       get.param tMemStr; push.const '*'; or", which is confident, readable
       and wrong: no such comparison happens there. Plausible-but-false output
       is worse than an honest op_67, because it invites you to build on it.

       To promote one: find a handler whose behaviour is predictable from its
       name and literals, check the opcode does what the name requires, and
       write the argument here. The commonest unnamed ones are op_67 (927k
       uses, always right after an arglist — almost certainly the call), op_03,
       op_61, op_64 and op_6e. */
};

// Which operands are indices into which table, so they can be resolved.
const NAME_OPS = new Set([0x45, 0x49, 0x4a, 0x4b, 0x4c, 0x4f, 0x50, 0x51, 0x52, 0x56, 0x57, 0x59]);
const CONST_OPS = new Set([0x44]);

function namesFrom(buf) {
    for (const be of [true, false]) {
        try {
            const off = be ? buf.readUInt16BE(16) : buf.readUInt16LE(16);
            const count = be ? buf.readUInt16BE(18) : buf.readUInt16LE(18);
            if (off < 16 || off > buf.length || count <= 0 || count > 20000) continue;
            const out = [];
            let p = off;
            for (let i = 0; i < count && p < buf.length; i++) {
                const n = buf[p++];
                if (p + n > buf.length) break;
                out.push(buf.toString("latin1", p, p + n));
                p += n;
            }
            if (out.length > 5 && out.every(s => /^[\x20-\x7e]*$/.test(s))) return out;
        } catch { /* other endianness */ }
    }
    return null;
}

function readLiterals(b) {
    const count = b.readUInt16BE(78);
    const tableOff = b.readUInt32BE(80);
    const dataOff = b.readUInt32BE(88);
    const out = [];
    for (let i = 0; i < count; i++) {
        const o = tableOff + i * 8;
        if (o + 8 > b.length) break;
        const type = b.readUInt32BE(o);
        const at = dataOff + b.readUInt32BE(o + 4);
        if (at + 4 > b.length) { out.push(null); continue; }
        if (type === 1) {
            const len = b.readUInt32BE(at);
            // Length includes the trailing NUL the compiler stores.
            out.push(b.toString("latin1", at + 4, at + 4 + Math.max(0, len - 1)));
        } else if (type === 4) {
            out.push(b.readInt32BE(at));
        } else if (type === 9) {
            /* A FLOAT IS LENGTH-PREFIXED, exactly like a string, and reading
               the double straight off the offset was wrong in the way that
               hides: it never throws, and every float in the client came back
               as a denormal around 1.75e-313 — a number so absurd it reads as
               "some Director internal" rather than as a bug.

               It is the length word bleeding into the high half. The advanced
               furni editor's height step is stored as
               00000008 3fb99999 9999999a: eight bytes of payload, then 0.1.
               Read from `at` you get 0x000000083fb99999 and lose the step
               entirely; read from at+4 you get the 0.1 the ± buttons use. */
            if (at + 12 > b.length) { out.push(null); continue; }
            const len = b.readUInt32BE(at);
            out.push(len >= 8 ? b.readDoubleBE(at + 4) : b.readFloatBE(at + 4));
        } else {
            out.push(`<type${type}>`);
        }
    }
    return out;
}

function readScript(chunk, names) {
    const b = chunk;
    if (b.length < 92) return null;
    const handlersCount = b.readUInt16BE(72);
    const handlersOff = b.readUInt32BE(74);
    const literals = readLiterals(b);

    const handlers = [];
    for (let i = 0; i < handlersCount; i++) {
        const o = handlersOff + i * 46;
        if (o + 46 > b.length) break;
        handlers.push({
            name: names[b.readUInt16BE(o)] || `handler_${b.readUInt16BE(o)}`,
            codeLength: b.readUInt32BE(o + 4),
            codeOffset: b.readUInt32BE(o + 8),
            argCount: b.readUInt16BE(o + 12),
            argOffset: b.readUInt32BE(o + 14),
            localCount: b.readUInt16BE(o + 18),
            localOffset: b.readUInt32BE(o + 20)
        });
        /* A handler's arguments and locals are named by its OWN lists — a run
           of name-table indices — not by the operand directly. Resolving them
           against the global table instead makes every local read as an
           unrelated handler name, which looks plausible and is nonsense. */
        const h = handlers[handlers.length - 1];
        const list = (off, n) => {
            const out = [];
            for (let k = 0; k < n; k++) {
                const at = off + k * 2;
                out.push(at + 2 <= b.length ? (names[b.readUInt16BE(at)] || "?") : "?");
            }
            return out;
        };
        h.args = list(h.argOffset, h.argCount);
        h.locals = list(h.localOffset, h.localCount);
    }
    return { handlers, literals };
}

/* Walk one handler's bytecode. Returns the instructions and whether the
   stream landed exactly on the end — the decoder's own proof. */
function disassemble(b, handler) {
    const out = [];
    const end = handler.codeOffset + handler.codeLength;
    let p = handler.codeOffset;
    let clean = true;

    while (p < end) {
        const at = p;
        const raw = b[p++];
        let op = raw, operand = null, width = 0;

        if (raw >= 0xc0) { op = raw - 0x80; width = 4; }
        else if (raw >= 0x80) { op = raw - 0x40; width = 2; }
        else if (raw >= 0x40) { op = raw; width = 1; }

        if (width) {
            if (p + width > end) { clean = false; break; }
            operand = width === 1 ? b.readUInt8(p)
                : width === 2 ? b.readUInt16BE(p)
                    : b.readUInt32BE(p);
            p += width;
        }
        out.push({ at: at - handler.codeOffset, raw, op, operand });
    }
    if (p !== end) clean = false;
    return { code: out, clean };
}

const PARAM_OPS = new Set([0x4b, 0x51]);
const LOCAL_OPS = new Set([0x4c, 0x52]);

function render(ins, script, names, handler) {
    const name = OPS[ins.op] || `op_${ins.op.toString(16).padStart(2, "0")}`;
    if (ins.operand === null) return name;
    let note = "";
    if (PARAM_OPS.has(ins.op)) note = handler.args[ins.operand] ? `  ; ${handler.args[ins.operand]}` : "";
    else if (LOCAL_OPS.has(ins.op)) note = handler.locals[ins.operand] ? `  ; ${handler.locals[ins.operand]}` : "";
    else if (CONST_OPS.has(ins.op)) {
        const lit = script.literals[ins.operand];
        if (lit !== undefined) note = `  ; ${JSON.stringify(lit)}`;
    }
    else if (NAME_OPS.has(ins.op) && names[ins.operand] !== undefined) note = `  ; ${names[ins.operand]}`;
    return `${name} ${ins.operand}${note}`;
}

function castScripts(file) {
    const cast = openCast(file);
    const lnam = cast.res.find(r => r.tag === "Lnam");
    const names = lnam ? (namesFrom(cast.chunk(lnam)) || []) : [];
    const scripts = [];
    for (const r of cast.res.filter(x => x.tag === "Lscr")) {
        const chunk = cast.chunk(r);
        const s = readScript(chunk, names);
        if (s) scripts.push({ id: r.id, chunk, ...s });
    }
    return { names, scripts };
}

function verify() {
    let total = 0, clean = 0, casts = 0;
    const unknown = new Map();
    for (const f of fs.readdirSync(CLIENT).filter(x => /\.cct$/i.test(x))) {
        let got;
        try { got = castScripts(path.join(CLIENT, f)); }
        catch { continue; }
        casts++;
        for (const s of got.scripts) {
            for (const h of s.handlers) {
                if (!h.codeLength) continue;
                total++;
                const d = disassemble(s.chunk, h);
                if (d.clean) clean++;
                for (const i of d.code) {
                    if (!OPS[i.op]) unknown.set(i.op, (unknown.get(i.op) || 0) + 1);
                }
            }
        }
    }
    console.log(`${casts} casts, ${total} handlers`);
    console.log(`decoded cleanly to the exact end of their code: ${clean} (${(100 * clean / total).toFixed(1)}%)`);
    const top = [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log(`\nunnamed opcodes, most common first (printed as op_XX):`);
    console.log("  " + top.map(([op, n]) => `op_${op.toString(16).padStart(2, "0")}×${n}`).join("  "));
}

function main() {
    const argv = process.argv.slice(2);
    if (argv.includes("--verify")) return verify();

    const file = argv.find(a => !a.startsWith("--"));
    if (!file) {
        console.error("usage: node tools/lingo-decompile.js <cast.cct> [--handler <name> | --all]");
        process.exit(1);
    }
    const full = fs.existsSync(file) ? file : path.join(CLIENT, file);
    const { names, scripts } = castScripts(full);

    const hAt = argv.indexOf("--handler");
    const want = hAt > -1 ? argv[hAt + 1] : null;
    const all = argv.includes("--all");

    if (!want && !all) {
        console.log(`${scripts.length} scripts in ${path.basename(full)}`);
        for (const s of scripts) {
            const named = s.handlers.filter(h => h.codeLength);
            if (named.length) console.log(`  script ${s.id}: ${named.map(h => h.name).join(", ")}`);
        }
        return;
    }

    for (const s of scripts) {
        for (const h of s.handlers) {
            if (!h.codeLength) continue;
            if (want && h.name !== want) continue;
            const d = disassemble(s.chunk, h);
            console.log(`\non ${h.name}  -- ${h.argCount} arg(s), ${h.localCount} local(s)` +
                (h.locals.length ? `
  -- locals: ${h.locals.join(", ")}` : "") +
                (d.clean ? "" : "   [stream did not land cleanly]"));
            for (const i of d.code) {
                console.log(`  ${String(i.at).padStart(4)}  ${render(i, s, names, h)}`);
            }
        }
    }
}

if (require.main === module) main();
module.exports = { castScripts, disassemble, readScript, namesFrom };

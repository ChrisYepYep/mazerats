/* Moving a furni raises a script error, and the mover never goes active.
 *
 * THE BUG
 *
 * Habbo's 2026-09-17 update added a furniture asset pre-check to the Object
 * Mover Class. `reloadObjectSprites` gained one new block, which ends:
 *
 *     if not furnitureAssetReady(tFamilyClass) then return
 *
 * The old handler had five returns; this one has six, and the sixth is the
 * only new way for it to fail. `define` treats that failure as fatal, and it
 * gives up EARLY:
 *
 *     pClientID = tClientID                          <- already set
 *     if stringp(tStripID) then pStripID = tStripID
 *     pObjType  = tObjType
 *     pObjProps = tProps
 *     if not me.reloadObjectSprites() then return    <- aborts here
 *     pActive = 1                                    <- never runs
 *     pPause = 0 : pValidLoc = 0 : pPlacementTarget = 0
 *     registerMessage(#activeObjectRemoved, ..., #checkObjectExists)
 *     registerMessage(#objectFinalized,     ..., #objectFinalized)
 *     receiveUpdate(me.getID())                      <- update loop never starts
 *
 * So after the error the mover is half alive. pClientID is set and the room's
 * pClickAction is already "moveActive" (startObjectMover sets it BEFORE
 * calling define), but pActive is 0 and nothing is driving the update loop —
 * there is no ghost following the cursor. The next click still reaches the
 * "moveActive" branch of eventProcRoom and sends MOVESTUFF for whatever tile
 * was clicked, so the furni jumps there with no drag preview: exactly what
 * "it places it as if it was picked up" looks like. A second attempt then
 * trips define's own guard, `error("Already moving active object: ...")`,
 * because pClientID was left set.
 *
 * WHAT THE EVIDENCE ACTUALLY SHOWED
 *
 * Removing only that last statement (--guard, kept below) did NOT fix it: the
 * error survived on a client verified to be running the patched cast. So the
 * fault is elsewhere in the new code, and the guard is innocent.
 *
 * What settled it was a discriminator from testing: WALL ITEMS MOVE FINE,
 * floor furni do not. The whole new block sits behind
 *
 *     if pObjType = "active" then ... end if
 *
 * at the very top of the handler — bytes 0..137. Wall items are type "item",
 * so they take that branch's jump straight to 137 and run the old code
 * untouched. Floor furni are type "active", so they alone run the new
 * prologue. That is exactly the split the user observed.
 *
 * And byte 137 onward IS the old handler: 610 instructions in both builds,
 * differing only in name-table indices and one jump offset. The update did
 * not modify reloadObjectSprites, it PREPENDED 137 bytes to it.
 *
 * THE FIX
 *
 * Jump over the whole prologue, for both object types, restoring the previous
 * build's handler exactly:
 *
 *     op_4a pObjType               ->   jmp 137
 *     push.const "active"               (dead bytes, never reached)
 *     op_0f ; op_55 131
 *     ... the new block ...
 *   137: the old handler begins here
 *
 * The region is overwritten IN PLACE and keeps its exact byte length, so no
 * offset in the chunk moves and the handler's line block — which must sum to
 * codeLength - 1, and which crashed the projector inside DIRAPI.dll when it
 * was got wrong before — stays valid untouched.
 *
 * The script is stored inline in the cast's initial load segment, so the ILS
 * is inflated, patched and re-deflated; only its compressed length changes,
 * which rebuildData accounts for.
 *
 * Nothing is located by a hardcoded offset. The cast, the script and the
 * guard are all found by name and by instruction pattern, and the result is
 * re-disassembled and checked before it is written.
 *
 *   node tools/fix-furni-mover.js --skip-prologue   the fix: skip bytes 0..137
 *   node tools/fix-furni-mover.js                   the falsified guard-only cut
 *   node tools/fix-furni-mover.js --stub <handler>  bisection: return at once
 *   node tools/fix-furni-mover.js --dry-run         report, write nothing
 *   node tools/fix-furni-mover.js --restore         put the original back
 *
 * --restore before applying a different cut: each mode reads the file as it
 * finds it, so cuts would otherwise stack on top of one another.
 *
 * The client folder comes from --client <dir>, or HABBO_CLIENT, and defaults
 * to the launcher's cache — the copy the live game actually loads.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const { openContainer, buildMap, rebuildData, readVint } = require("./add-hand-search.js");
const { readScript, namesFrom, disassemble, render } = require("./lingo-decompile.js");
const { openClient } = require("./lingo-client.js");
const { parse } = require("./lingo-script.js");

const CAST = "hh_room.cct";
const GUARD = "furnitureAssetReady";
// The Object Mover Class, identified by what it owns rather than by its id.
const CLASS_HANDLERS = ["define", "reloadObjectSprites", "moveActive", "moveItem", "moveTrade", "cancelMove"];

// The previous build, used to prove a prologue really is prepended code.
const OLD_CLIENT = "C:/Users/cjboy/Documents/Offline Client";
/* THIS TOOL EDITS ONE DIRECTORY AND NOTHING ELSE.
 *
 * ChrisYepYep's working copy is HH352-Test. There are other complete, byte
 * identical sets of these casts on this machine — the Steam install under
 * Program Files, and the Habbo Launcher's cache under AppData — and writing to
 * either of those is off limits. They are the real installs; HH352-Test is the
 * copy we are allowed to break.
 *
 * The guard below is deliberately a refusal rather than a default, because a
 * default is only a suggestion and this already went wrong once: patches were
 * written into the launcher cache, which verified perfectly and changed
 * nothing, and six bisection results were thrown away before anybody noticed. */
const DEFAULT_CLIENT = "C:\\Users\\cjboy\\Documents\\HH352-Test";
const ALLOWED = ["c:\\users\\cjboy\\documents\\hh352-test"];

function clientDir(argv) {
    const i = argv.indexOf("--client");
    const dir = (i > -1 && argv[i + 1]) ? argv[i + 1] : (process.env.HABBO_CLIENT || DEFAULT_CLIENT);
    const real = path.resolve(dir).toLowerCase().replace(/[\\/]+$/, "");
    if (!ALLOWED.includes(real)) {
        console.error(`refusing to touch ${dir}`);
        console.error(`this tool only edits: ${ALLOWED.join(", ")}`);
        process.exit(1);
    }
    return dir;
}

/* Unpack the initial load segment into {id -> {at, len}} over a mutable copy. */
function openInline(cast) {
    const ils = cast.res.find(e => e.tag === "ILS ");
    if (!ils) throw new Error("no ILS segment");
    const raw = cast.b.subarray(cast.dataStart + ils.off.value,
        cast.dataStart + ils.off.value + ils.comp.value);
    const seg = Buffer.from(ils.comp.value === ils.dec.value ? raw : zlib.inflateSync(raw));
    const byId = new Map(cast.res.map(e => [e.id.value, e]));
    const bodies = new Map();
    let p = 0;
    while (p < seg.length) {
        const id = readVint(seg, p);
        const e = byId.get(id.value);
        if (!e) break;
        bodies.set(id.value, { at: id.end, len: e.dec.value });
        p = id.end + e.dec.value;
    }
    return { ils, seg, bodies };
}

/* Which scripts the context actually loads, and which name table is theirs. */
function context(cast, seg, bodies) {
    const res = cast.res.find(e => e.tag === "LctX" || e.tag === "Lctx");
    const b = bodies.get(res.id.value);
    const lb = seg.subarray(b.at, b.at + b.len);
    const live = new Set();
    for (let i = 0, n = lb.readUInt32BE(8), o = lb.readUInt16BE(16); i < n; i++) {
        live.add(lb.readInt32BE(o + i * 12 + 4));
    }
    const lnam = bodies.get(lb.readInt32BE(32));
    return { live, names: namesFrom(seg.subarray(lnam.at, lnam.at + lnam.len)) || [] };
}

function findMover(cast, seg, bodies, live, names) {
    for (const e of cast.res) {
        if (e.tag !== "Lscr" || !live.has(e.id.value)) continue;
        const body = bodies.get(e.id.value);
        if (!body) continue;
        const chunk = seg.subarray(body.at, body.at + body.len);
        const s = readScript(chunk, names);
        if (!s) continue;
        const have = s.handlers.filter(h => h.codeLength).map(h => h.name);
        if (CLASS_HANDLERS.every(n => have.includes(n))) return { id: e.id.value, body, chunk, script: s };
    }
    return null;
}

/* Locate the guard by shape:
 *     <push arg> ; arglist.noret 1 ; extCall furnitureAssetReady ; not ; jmpIfZ T
 *     <the failing arm, ending in a return>   ... T
 * and report the byte range to overwrite plus where it should land. */
function findGuard(chunk, names, handler) {
    const d = disassemble(chunk, handler);
    if (!d.clean) throw new Error("reloadObjectSprites did not disassemble cleanly");
    const ins = d.code;
    for (let k = 2; k + 2 < ins.length; k++) {
        if (ins[k].op !== 0x57 || names[ins[k].operand] !== GUARD) continue;
        if (ins[k - 1].op !== 0x43 || ins[k - 1].operand !== 1) throw new Error("guard call is not a 1-arg call");
        if (ins[k + 1].op !== 0x14) throw new Error("guard is not followed by a NOT");
        if (ins[k + 2].op !== 0x55) throw new Error("guard is not followed by a conditional jump");
        const start = ins[k - 2].at;
        const target = ins[k + 2].at + ins[k + 2].operand;
        if (!ins.some(i => i.at === target)) throw new Error("guard's jump target is not an instruction boundary");
        return { start, target, span: target - start, argPush: ins[k - 2] };
    }
    return null;
}

/* Bisection aid: make one handler return immediately.
 *
 * Every handler's code ends in 0x01 (ret) — all 125,372 of the client's do —
 * so writing 0x01 at its FIRST byte returns VOID before anything in it runs.
 * One byte, no length change, the line block untouched, and the remainder of
 * the handler simply becomes unreachable. That makes it a safe way to switch
 * a whole subsystem off and see whether the fault goes with it. */
function findHandler(cast, seg, bodies, live, names, want) {
    for (const e of cast.res) {
        if (e.tag !== "Lscr" || !live.has(e.id.value)) continue;
        const body = bodies.get(e.id.value);
        if (!body) continue;
        const chunk = seg.subarray(body.at, body.at + body.len);
        const s = readScript(chunk, names);
        if (!s) continue;
        const h = s.handlers.find(x => x.name === want && x.codeLength);
        if (h) return { id: e.id.value, body, chunk, script: s, handler: h };
    }
    return null;
}

/* Repack the container around a modified load segment. The segment's
   decompressed length never changes here — every edit is made in place — so
   only its compressed length moves, which rebuildData accounts for. */
function writeOut(cast, ils, seg, file, backup) {
    const { writeVint } = require("./add-hand-search.js");
    const packed = ils.comp.value === ils.dec.value ? seg : zlib.deflateSync(seg);
    const data = rebuildData(cast, new Map([[ils.id.value, packed]]));
    const map = buildMap(cast);
    const inner = Buffer.concat([writeVint(cast.abmp.ctype), writeVint(map.length), zlib.deflateSync(map)]);
    const abmpSection = Buffer.concat([
        cast.b.subarray(cast.abmp.tagAt, cast.abmp.tagAt + 4), writeVint(inner.length), inner,
    ]);
    const out = Buffer.concat([
        cast.b.subarray(0, cast.abmp.tagAt), abmpSection,
        cast.b.subarray(cast.abmp.sectionEnd, cast.dataStart), data,
    ]);
    const readSize = cast.big ? out.readUInt32BE.bind(out) : out.readUInt32LE.bind(out);
    const writeSize = cast.big ? out.writeUInt32BE.bind(out) : out.writeUInt32LE.bind(out);
    writeSize(readSize(4) + (out.length - cast.b.length), 4);

    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    fs.writeFileSync(file, out);
    console.log(`\nwrote ${file} (${out.length} bytes; original kept at ${path.basename(backup)})`);
}

function run(argv) {
    const dir = clientDir(argv);
    const file = path.join(dir, CAST);
    const backup = file + ".orig";
    const dryRun = argv.includes("--dry-run");

    if (argv.includes("--restore")) {
        if (!fs.existsSync(backup)) { console.error(`no backup at ${backup}`); process.exit(1); }
        fs.copyFileSync(backup, file);
        fs.unlinkSync(backup);
        console.log(`restored ${file}`);
        return;
    }

    if (!fs.existsSync(file)) { console.error(`no ${file}`); process.exit(1); }

    const cast = openContainer(file);
    const { ils, seg, bodies } = openInline(cast);
    const { live, names } = context(cast, seg, bodies);

    /* THE ACTUAL ONE-LINE FIX.
     *
     *     tFamilyClass = tRoomObject.getClass()     ' faults
     *     tFamilyClass = tRoomObject.pClass         ' what it should be
     *
     * getActiveObject() hands back the room's active-object class, which
     * defines no getClass handler and has no ancestor, so the call is
     * unresolvable and Director raises a script error on every floor-furni
     * move. Wall items go through moveItem and the item class, which DOES
     * define getClass, which is why only floor furni break.
     *
     * pClass on that class is set in define() as tdata.getAt(#class) — the
     * very value this prologue's other branch reads as pObjProps.getAt(#class)
     * — so reading the property gives the same string the call was after. */
    if (argv.includes("--fix-getclass")) {
        const t = findHandler(cast, seg, bodies, live, names, "reloadObjectSprites");
        if (!t) { console.error("no reloadObjectSprites"); process.exit(1); }
        const ins = disassemble(t.chunk, t.handler).code;
        let k = -1;
        for (let i = 1; i + 1 < ins.length; i++) {
            if (ins[i].op === 0x43 && ins[i].operand === 1 &&
                ins[i + 1].op === 0x67 && names[ins[i + 1].operand] === "getClass") { k = i; break; }
        }
        if (k < 0) { console.log("no getClass call in reloadObjectSprites — already fixed, or a different build"); return; }
        const pi = names.indexOf("pClass");
        if (pi < 0) throw new Error("no 'pClass' in the name table");
        const start = ins[k].at, end = ins[k + 2].at, span = end - start;
        const out = [];
        if (pi <= 0xff) out.push(0x61, pi); else out.push(0xa1, pi >> 8, pi & 0xff);
        const rest = span - out.length;
        if (rest < 0) throw new Error("property read does not fit");
        if (rest === 1) throw new Error("one spare byte cannot hold a jump");
        if (rest >= 2) { out.push(0x53, end - (start + out.length)); while (out.length < span) out.push(0x01); }
        console.log(`reloadObjectSprites: script ${t.id}, replacing getClass() at code+${start}..${end} (${span} bytes) with a pClass read`);

        const abs = t.body.at + t.handler.codeOffset + start;
        const before = Buffer.from(seg.subarray(abs, abs + span));
        Buffer.from(out).copy(seg, abs);

        const chunk = seg.subarray(t.body.at, t.body.at + t.body.len);
        const ah = readScript(chunk, names).handlers.find(h => h.name === "reloadObjectSprites" && h.codeLength);
        if (ah.codeLength !== t.handler.codeLength) throw new Error("code length moved");
        const d = disassemble(chunk, ah);
        if (!d.clean) throw new Error("patched handler does not disassemble cleanly");
        const at = new Set(d.code.map(i => i.at));
        for (const i of d.code) {
            const tt = (i.op === 0x53 || i.op === 0x55) ? i.at + i.operand : i.op === 0x54 ? i.at - i.operand : null;
            if (tt !== null && !at.has(tt)) throw new Error(`jump to ${tt} is not an instruction boundary`);
        }
        if (d.code.some(i => (i.op === 0x67 || i.op === 0x57) && names[i.operand] === "getClass")) throw new Error("getClass still called");
        const got = d.code.find(i => i.at === start);
        if (!got || got.op !== 0x61 || names[got.operand] !== "pClass") throw new Error("pClass read not written");
        const p = parse(chunk);
        const ph = p.handlers.find(h => names[h.nameID] === "reloadObjectSprites");
        const sum = [...ph.lines].reduce((a, b) => a + b, 0);
        if (sum !== ph.code.length - 1) throw new Error(`line block sums to ${sum}, code is ${ph.code.length}`);
        console.log(`  verified: reads pClass, no getClass call remains, line block sums to ${sum} of ${ph.code.length - 1}`);
        console.log(`  was: ${[...before].map(x => x.toString(16).padStart(2, "0")).join(" ")}`);
        console.log(`  now: ${[...seg.subarray(abs, abs + span)].map(x => x.toString(16).padStart(2, "0")).join(" ")}`);

        if (dryRun) { console.log("\n--dry-run: nothing written"); return; }
        writeOut(cast, ils, seg, file, backup);
        return;
    }

    const pAt = argv.indexOf("--skip-prologue");
    if (pAt > -1) {
        const want = argv[pAt + 1] && !argv[pAt + 1].startsWith("--") ? argv[pAt + 1] : "reloadObjectSprites";
        const t = findHandler(cast, seg, bodies, live, names, want);
        if (!t) { console.error(`no live handler named ${want}`); process.exit(1); }

        /* Find the prologue by ALIGNING against the previous build rather than
           guessing at its shape. This update added its furniture-asset feature
           by PREPENDING instructions to existing handlers, so the new handler's
           tail should be the old handler exactly. Requiring a zero-difference
           alignment before touching anything means the jump provably lands on
           the old entry point, and a handler that was genuinely rewritten
           (rather than prepended to) is refused instead of mangled. */
        const oldDir = (() => { const i = argv.indexOf("--old"); return i > -1 ? argv[i + 1] : OLD_CLIENT; })();
        const oc = openClient(path.join(oldDir, CAST));
        let oh = null, os = null;
        for (const s of oc.scripts) {
            const h = s.handlers.find(x => x.name === want && x.codeLength);
            if (h) { oh = h; os = s; break; }
        }
        if (!oh) { console.error(`${want} does not exist in the previous build at ${oldDir}`); process.exit(1); }
        const norm = (chunk, s, nm, h) => disassemble(chunk, h).code.map(i =>
            render(i, s, nm, h).replace(/^(\S+) \d+  ; /, "$1 ").replace(/^op_(55|53|54) \d+$/, "op_$1 <j>"));
        const A = norm(os.chunk, os, os.names, oh);
        const B = norm(t.chunk, t.script, names, t.handler);
        let off = -1;
        for (let k = 0; k + A.length <= B.length; k++) {
            let same = true;
            for (let i = 0; i < A.length && same; i++) if (A[i] !== B[k + i]) same = false;
            if (same) { off = k; break; }
        }
        if (off < 0) throw new Error(`${want} is not the old handler with a prologue prepended — refusing to guess`);
        if (off === 0) { console.log(`${want}: no prologue, nothing to do`); return; }

        const ins = disassemble(t.chunk, t.handler).code;
        const target = ins[off].at;
        console.log(`${want}: script ${t.id}, prologue is ${off} instructions / ${target} bytes`);
        console.log(`  the ${A.length} instructions from there on match the previous build exactly`);

        const abs = t.body.at + t.handler.codeOffset;
        const before = Buffer.from(seg.subarray(abs, abs + target));
        // Jump operand width follows the same encoding the decoder expects.
        let n;
        if (target <= 0xff) { seg[abs] = 0x53; seg[abs + 1] = target; n = 2; }
        else if (target <= 0xffff) { seg[abs] = 0x93; seg.writeUInt16BE(target, abs + 1); n = 3; }
        else { seg[abs] = 0xd3; seg.writeUInt32BE(target, abs + 1); n = 5; }
        if (n > target) throw new Error("prologue too short to hold a jump");
        seg.fill(0x01, abs + n, abs + target);

        const chunk = seg.subarray(t.body.at, t.body.at + t.body.len);
        const ah = readScript(chunk, names).handlers.find(h => h.name === want && h.codeLength);
        if (ah.codeLength !== t.handler.codeLength) throw new Error("code length moved");
        const nd = disassemble(chunk, ah);
        if (!nd.clean) throw new Error("patched handler does not disassemble cleanly");
        if (nd.code[0].op !== 0x53 || nd.code[0].at + nd.code[0].operand !== target) throw new Error("jump not written correctly");
        const at = new Set(nd.code.map(i => i.at));
        for (const i of nd.code) {
            const tt = (i.op === 0x53 || i.op === 0x55) ? i.at + i.operand : i.op === 0x54 ? i.at - i.operand : null;
            if (tt !== null && !at.has(tt)) throw new Error(`jump to ${tt} is not an instruction boundary`);
        }
        const p = parse(chunk);
        const ph = p.handlers.find(h => names[h.nameID] === want);
        const sum = [...ph.lines].reduce((a, b) => a + b, 0);
        if (sum !== ph.code.length - 1) throw new Error(`line block sums to ${sum}, code is ${ph.code.length}`);
        console.log(`  verified: jmp 0 -> ${target}, ${nd.code.length} instructions, line block sums to ${sum} of ${ph.code.length - 1}`);
        console.log(`  was: ${[...before.subarray(0, 12)].map(x => x.toString(16).padStart(2, "0")).join(" ")} ...`);
        console.log(`  now: ${[...seg.subarray(abs, abs + 12)].map(x => x.toString(16).padStart(2, "0")).join(" ")} ...`);

        if (dryRun) { console.log("\n--dry-run: nothing written"); return; }
        writeOut(cast, ils, seg, file, backup);
        return;
    }

    /* Like --stub, but returns 1 instead of VOID.
     *
     * define() treats a falsy reloadObjectSprites() as fatal and bails before
     * pActive = 1, so a VOID stub would stop the mover starting at all and the
     * test could not tell "the fault was in there" from "the mover never ran".
     * Returning 1 lets everything downstream proceed normally. */
    const stAt = argv.indexOf("--stub-true");
    if (stAt > -1) {
        const want = argv[stAt + 1];
        if (!want) { console.error("--stub-true needs a handler name"); process.exit(1); }
        const t = findHandler(cast, seg, bodies, live, names, want);
        if (!t) { console.error(`no live handler named ${want}`); process.exit(1); }
        const ri = names.indexOf("return");
        if (ri < 0) throw new Error("no 'return' in the name table");
        const seq = [0x41, 0x01, 0x42, 0x01];            // push int 1, arglist 1
        if (ri <= 0xff) seq.push(0x57, ri);
        else if (ri <= 0xffff) seq.push(0x97, ri >> 8, ri & 0xff);
        else throw new Error("'return' index too large to encode");
        if (seq.length > t.handler.codeLength) throw new Error("handler too short");
        const abs = t.body.at + t.handler.codeOffset;
        console.log(`${want}: script ${t.id}, code+${t.handler.codeOffset}, ${t.handler.codeLength} bytes`);
        Buffer.from(seq).copy(seg, abs);
        // Everything after is unreachable; 0x01 keeps it decoding cleanly.
        seg.fill(0x01, abs + seq.length, abs + t.handler.codeLength);

        const chunk = seg.subarray(t.body.at, t.body.at + t.body.len);
        const ah = readScript(chunk, names).handlers.find(h => h.name === want && h.codeLength);
        if (ah.codeLength !== t.handler.codeLength) throw new Error("code length moved");
        const d = disassemble(chunk, ah);
        if (!d.clean) throw new Error("stubbed handler does not disassemble cleanly");
        const head = d.code.slice(0, 3).map(i => `${i.op.toString(16)}${i.operand !== null ? " " + i.operand : ""}`).join(" | ");
        if (d.code[0].op !== 0x41 || d.code[0].operand !== 1) throw new Error("push 1 not written");
        if (d.code[2].op !== 0x57 || names[d.code[2].operand] !== "return") throw new Error("return not written");
        const p = parse(chunk);
        const ph = p.handlers.find(h => names[h.nameID] === want);
        const sum = [...ph.lines].reduce((a, b) => a + b, 0);
        if (sum !== ph.code.length - 1) throw new Error(`line block sums to ${sum}, code is ${ph.code.length}`);
        console.log(`  now returns 1 at once (${head}), line block still sums to ${sum} of ${ph.code.length - 1}`);

        if (dryRun) { console.log("\n--dry-run: nothing written"); return; }
        writeOut(cast, ils, seg, file, backup);
        return;
    }

    const stubAt = argv.indexOf("--stub");
    if (stubAt > -1) {
        const want = argv[stubAt + 1];
        if (!want) { console.error("--stub needs a handler name"); process.exit(1); }
        const t = findHandler(cast, seg, bodies, live, names, want);
        if (!t) { console.error(`no live handler named ${want}`); process.exit(1); }
        const abs = t.body.at + t.handler.codeOffset;
        console.log(`${want}: script ${t.id}, code+${t.handler.codeOffset}, ${t.handler.codeLength} bytes`);
        console.log(`  first byte ${seg[abs].toString(16).padStart(2, "0")} -> 01 (ret), so it returns VOID immediately`);
        seg[abs] = 0x01;

        const chunk = seg.subarray(t.body.at, t.body.at + t.body.len);
        const ah = readScript(chunk, names).handlers.find(h => h.name === want && h.codeLength);
        if (ah.codeLength !== t.handler.codeLength) throw new Error("code length moved");
        const d = disassemble(chunk, ah);
        if (!d.clean) throw new Error("stubbed handler does not disassemble cleanly");
        if (d.code[0].op !== 0x01) throw new Error("first instruction is not ret");
        const p = parse(chunk);
        const ph = p.handlers.find(h => names[h.nameID] === want);
        const sum = [...ph.lines].reduce((a, b) => a + b, 0);
        if (sum !== ph.code.length - 1) throw new Error(`line block sums to ${sum}, code is ${ph.code.length}`);
        console.log(`  verified: returns at once, line block still sums to ${sum} of ${ph.code.length - 1}`);

        if (dryRun) { console.log("\n--dry-run: nothing written"); return; }
        writeOut(cast, ils, seg, file, backup);
        return;
    }

    const mover = findMover(cast, seg, bodies, live, names);
    if (!mover) { console.error("could not find the Object Mover Class"); process.exit(1); }
    const handler = mover.script.handlers.find(h => h.name === "reloadObjectSprites" && h.codeLength);
    console.log(`Object Mover Class: script ${mover.id}, reloadObjectSprites at code+${handler.codeOffset}, ${handler.codeLength} bytes`);

    const guard = findGuard(mover.chunk, names, handler);
    if (!guard) {
        console.log(`no ${GUARD} guard in this build — nothing to do (already patched, or a different build)`);
        return;
    }
    if (guard.span < 2 || guard.span > 255) throw new Error(`guard span ${guard.span} will not fit a 1-byte jump`);
    console.log(`guard found: code+${guard.start}..${guard.target} (${guard.span} bytes), replacing with jmp -> ${guard.target}`);

    // Overwrite in place: jump past the guard, then dead bytes to keep the length.
    const abs = mover.body.at + handler.codeOffset + guard.start;
    const before = Buffer.from(seg.subarray(abs, abs + guard.span));
    seg[abs] = 0x53;                       // jmp
    seg[abs + 1] = guard.span;             // relative to the jump's own position
    seg.fill(0x01, abs + 2, abs + guard.span);   // ret; never reached

    // Re-read the patched script and check it before writing anything.
    const chunk = seg.subarray(mover.body.at, mover.body.at + mover.body.len);
    const after = readScript(chunk, names);
    const ah = after.handlers.find(h => h.name === "reloadObjectSprites" && h.codeLength);
    if (ah.codeLength !== handler.codeLength) throw new Error("code length moved");
    const d = disassemble(chunk, ah);
    if (!d.clean) throw new Error("patched handler does not disassemble cleanly");
    const at = new Set(d.code.map(i => i.at));
    for (const i of d.code) {
        const t = (i.op === 0x53 || i.op === 0x55) ? i.at + i.operand
            : i.op === 0x54 ? i.at - i.operand : null;
        if (t !== null && !at.has(t)) throw new Error(`patched handler has a jump to ${t}, not an instruction boundary`);
    }
    if (findGuard(chunk, names, ah)) throw new Error("the guard is still reachable after patching");
    const p = parse(chunk);
    const ph = p.handlers.find(h => names[h.nameID] === want);
    const sum = [...ph.lines].reduce((a, b) => a + b, 0);
    if (sum !== ph.code.length - 1) throw new Error(`line block sums to ${sum}, code is ${ph.code.length}`);
    console.log(`verified: ${d.code.length} instructions, all jumps land cleanly, line block sums to ${sum} of ${ph.code.length - 1}`);
    console.log(`  was: ${[...before].map(x => x.toString(16).padStart(2, "0")).join(" ")}`);
    console.log(`  now: ${[...seg.subarray(abs, abs + guard.span)].map(x => x.toString(16).padStart(2, "0")).join(" ")}`);

    if (dryRun) { console.log("\n--dry-run: nothing written"); return; }
    writeOut(cast, ils, seg, file, backup);
}

if (require.main === module) run(process.argv.slice(2));

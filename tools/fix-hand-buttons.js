/* Fixes the Habbo Origins bug where the hand's arrows and Close button stay on
 * screen after the hand auto-closes on a room change.
 *
 * ----------------------------------------------------------------------------
 * THE BUG
 *
 * The buttons live in their own window, "habbo_hand_buttons", created by
 * Container Hand Class (hh_room.cct, script 11321). Two handlers own its
 * lifetime:
 *
 *     setHandButtonsVisible   creates the window if it is not there
 *     close                   removes it, then animates the hand shut
 *
 * close() is correct. It removes the window on its first instruction after
 * setting the mode, and the hand then retracts over nine frames of update().
 * The visualizer is only destroyed at the END of that animation.
 *
 * That gap is the bug. For those nine frames the hand is closing but
 * visualizerExists(pHandVisID) still answers "yes" — and every guard that asks
 * whether the hand is open asks it that way:
 *
 *     showContainerItems    if not visualizerExists(...) then return 0
 *     setStripItemCount     if visualizerExists(...) and pTotalCount > ...
 *
 * so anything that rebuilds the strip during those frames runs to completion,
 * and showContainerItems ends by calling setHandButtonsVisible() — which puts
 * the window straight back.
 *
 * On a room change that happens in the same dispatch. executeMessage(#changeRoom)
 * walks its listener list BACKWARDS (fuse_client.cct script 3855, Execute:
 * `i = tList.count` counting down), so the listener registered LAST runs FIRST:
 *
 *     1. Room Handler Class      leaveRoom -> hideAll -> hand.close()
 *                                   window removed, close animation starts
 *     2. Sora Task Window Mgr    onRoomChange -> clearTargets()
 *                                   -> hand.setSoraFocus("0")
 *                                   -> showContainerItems()
 *                                   -> setHandButtonsVisible()  <-- window back
 *
 * The room component registers #changeRoom at offset 576 of its construct,
 * after it creates the Sora manager at offset 464, so the room component is
 * later in the list and therefore runs first. Both steps are inside one
 * synchronous message dispatch, so the window is removed and re-created
 * between two screen redraws and never visibly blinks out.
 *
 * Then the animation finishes, removeVisualizer runs, and the buttons are
 * stranded: close() would remove them but it now returns early, because the
 * visualizer it tests is gone.
 *
 * Nothing about this is specific to the Sora task window — it is simply the
 * listener that always exists. The donation minigame (hh_challenges script
 * 1770, closeWindow -> clearHiddenItems) and the marketplace (hh_room script
 * 12333) reach setHandButtonsVisible the same way.
 *
 * ----------------------------------------------------------------------------
 * THE FIX
 *
 * The buttons should exist only while the hand is open, and the class already
 * has a correct notion of open — isOpen() returns (pAnimMode = #open). The
 * strip guards just use the other one. So setHandButtonsVisible gets the same
 * test the class already trusts, as a prologue:
 *
 *     on setHandButtonsVisible me
 *       if me.pAnimMode <> #open then return 0      -- added
 *       ...unchanged...
 *
 * During a close pAnimMode is #close, so the rebuild can no longer resurrect
 * the window; during an open it is #open and nothing changes. setStripItemCount
 * is covered too, since it reaches the window only through this handler.
 *
 * ----------------------------------------------------------------------------
 * THE BYTES
 *
 * The prologue is 17 bytes and every one of them is copied from code already in
 * this script, so nothing about the encoding is invented:
 *
 *     8a 09 88 85 03 43 0f   push pAnimMode; push #open; eq   — isOpen, @0..6
 *     14                     not                              — this handler, @8
 *     95 00 09               jmpIfZ +9 -> 17                  — this handler, @23
 *     03 42 01 97 01 5a      return 0                         — this handler, @26
 *
 * Inserting at the very start means no branch inside the handler changes: every
 * jump operand is relative to its own instruction, and all of them move
 * together.
 *
 * What does have to move is every offset in the script chunk that points past
 * the insertion point. Those are, and this was measured rather than assumed:
 *
 *     header @8, @12    the chunk's length          (both equal it on 1052/1052
 *                                                    live scripts)
 *     header @52        end of the literal data     (equals literalsDataOffset +
 *                                                    literalsDataLen on 1052/1052
 *                                                    — it is NOT the chunk
 *                                                    length, which is larger on
 *                                                    55 of them)
 *     header @80, @88   literalsOffset, literalsDataOffset
 *     per handler       codeOffset, argOffset, localOffset, globalsOffset,
 *                       lineOffset  (46-byte records at @8/@14/@20/@26/@38)
 *
 * header @62/@68/@74 point at the property, global and handler tables, which sit
 * before the code and do not move. @84 is a length, not an offset.
 *
 * CONTAINER. Every Lscr in hh_room.cct lives inside the ILS blob, so the file is
 * rebuilt the way _offline/patch-cast.js rebuilds hh_entry.cct: splice the new
 * script body into the decompressed blob, grow that resource's size in the map,
 * recompress, shift every resource stored after it, and re-emit ABMP. Resource
 * offsets are relative to the byte after FGEI's varint, so ABMP's own size can
 * change freely.
 *
 *   node tools/fix-hand-buttons.js                 patch hh_room.cct
 *   node tools/fix-hand-buttons.js --dry-run       report, write nothing
 *   node tools/fix-hand-buttons.js --restore       put the original back
 *
 * The client folder comes from HABBO_CLIENT, or --client <dir>.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const { readScript, namesFrom } = require("./lingo-decompile.js");

const CAST = "hh_room.cct";
const HANDLER = "setHandButtonsVisible";
const TEMPLATE = "isOpen";

/* ---- varints ------------------------------------------------------------ */

function readVint(b, p) {
    let v = 0, n, start = p;
    do { n = b[p++]; v = (v << 7) | (n & 0x7f); } while (n & 0x80);
    return { value: v, raw: b.subarray(start, p), end: p };
}

function writeVint(v) {
    if (v === 0) return Buffer.from([0]);
    const groups = [];
    let x = v >>> 0;
    while (x > 0) { groups.unshift(x & 0x7f); x = Math.floor(x / 128); }
    for (let i = 0; i < groups.length - 1; i++) groups[i] |= 0x80;
    return Buffer.from(groups);
}

/* ---- container ---------------------------------------------------------- */

function open(file) {
    const b = fs.readFileSync(file);
    const magic = b.toString("latin1", 0, 4);
    const big = magic === "RIFX";
    if (!big && magic !== "XFIR") throw new Error(`${file}: not an XFIR/RIFX container`);
    const rev = (s) => s.split("").reverse().join("");
    const tagOf = (s) => (big ? s : rev(s));

    let p = 12, abmp = null, dataStart = null;
    while (p < b.length) {
        const tag = tagOf(b.toString("latin1", p, p + 4));
        const tagAt = p;
        p += 4;
        if (tag === "Fver" || tag === "Fcdr") { const n = readVint(b, p); p = n.end + n.value; continue; }
        if (tag === "ABMP") {
            const len = readVint(b, p);
            const end = len.end + len.value;
            const ctype = readVint(b, len.end);
            const decomp = readVint(b, ctype.end);
            abmp = {
                tagAt, sectionEnd: end, ctype: ctype.value,
                map: zlib.inflateSync(b.subarray(decomp.end, end))
            };
            p = end;
            continue;
        }
        if (tag === "FGEI") { const z = readVint(b, p); dataStart = z.end; break; }
        break;
    }
    if (!abmp || dataStart === null) throw new Error(`${file}: no ABMP/FGEI`);

    const m = abmp.map;
    let q = 0;
    const h1 = readVint(m, q); q = h1.end;
    const h2 = readVint(m, q); q = h2.end;
    const cnt = readVint(m, q); q = cnt.end;

    const res = [];
    for (let i = 0; i < cnt.value; i++) {
        const id = readVint(m, q); q = id.end;
        const off = readVint(m, q); q = off.end;
        const comp = readVint(m, q); q = comp.end;
        const dec = readVint(m, q); q = dec.end;
        const ct = readVint(m, q); q = ct.end;
        const tag = tagOf(m.toString("latin1", q, q + 4));
        const tagBytes = m.subarray(q, q + 4); q += 4;
        res.push({ id, off, comp, dec, ct, tag, tagBytes });
    }
    return { b, big, abmp, dataStart, header: [h1, h2, cnt], res, mapTail: m.subarray(q) };
}

function buildMap(cast) {
    const parts = cast.header.map(h => h.raw);
    for (const e of cast.res) {
        for (const f of [e.id, e.off, e.comp, e.dec, e.ct]) {
            parts.push(f.changed === undefined ? f.raw : writeVint(f.changed));
        }
        parts.push(e.tagBytes);
    }
    parts.push(cast.mapTail);
    return Buffer.concat(parts);
}

/* The script context says which scripts are real and which name table they use.
   hh_room.cct holds 2577 Lscr chunks but only 152 live ones, and 18 Lnam
   tables; reading a script against the wrong table yields names that are real
   strings from this client and therefore look like code. */
function contextOf(seg, bodies, res) {
    const lctx = res.find(e => e.tag === "LctX" || e.tag === "Lctx");
    if (!lctx) return null;
    const body = bodies.get(lctx.id.value);
    if (!body) return null;
    const b = seg.subarray(body.at, body.at + body.len);
    const entryCount = b.readUInt32BE(8);
    const entriesOffset = b.readUInt16BE(16);
    const lnamSectionID = b.readInt32BE(32);
    const scripts = new Set();
    for (let i = 0; i < entryCount; i++) {
        const o = entriesOffset + i * 12;
        if (o + 12 > b.length) break;
        scripts.add(b.readInt32BE(o + 4));
    }
    return { scripts, lnamSectionID };
}

/* ---- the script edit ---------------------------------------------------- */

const HEADER_OFFSETS = [8, 12, 52, 80, 88];
const HANDLER_OFFSETS = [8, 14, 20, 26, 38];   // code, args, locals, globals, lines

/* Grow one handler by inserting `prologue` at the front of its code, moving
   every offset in the chunk that points past the insertion point. */
function insertPrologue(chunk, handlerIndex, prologue) {
    const b = Buffer.from(chunk);
    const hOff = b.readUInt32BE(74);
    const hCount = b.readUInt16BE(72);
    const rec = hOff + handlerIndex * 46;
    const at = b.readUInt32BE(rec + 8);
    const n = prologue.length;

    const out = Buffer.concat([b.subarray(0, at), prologue, b.subarray(at)]);

    // This handler's code is longer; its start is unchanged.
    out.writeUInt32BE(b.readUInt32BE(rec + 4) + n, rec + 4);

    for (const o of HEADER_OFFSETS) {
        const v = out.readUInt32BE(o);
        if (v > at) out.writeUInt32BE(v + n, o);
    }
    for (let i = 0; i < hCount; i++) {
        const r = hOff + i * 46;
        for (const o of HANDLER_OFFSETS) {
            const v = out.readUInt32BE(r + o);
            if (v > at) out.writeUInt32BE(v + n, r + o);
        }
    }
    return out;
}

/* ---- main --------------------------------------------------------------- */

function clientDir(argv) {
    const i = argv.indexOf("--client");
    const dir = i > -1 ? argv[i + 1] : process.env.HABBO_CLIENT;
    if (!dir) {
        console.error("No client folder. Set HABBO_CLIENT or pass --client <dir>.");
        process.exit(1);
    }
    return dir;
}

function run(argv) {
    const dir = clientDir(argv);
    const file = path.join(dir, CAST);
    const backup = file + ".orig";
    const dryRun = argv.includes("--dry-run");

    if (argv.includes("--restore")) {
        if (!fs.existsSync(backup)) { console.error(`No backup at ${backup}`); process.exit(1); }
        fs.copyFileSync(backup, file);
        console.log(`Restored the original ${CAST}.`);
        return;
    }

    const cast = open(file);
    const ils = cast.res.find(e => e.tag === "ILS ");
    if (!ils) throw new Error("no ILS blob");

    const rawILS = cast.b.subarray(cast.dataStart + ils.off.value,
        cast.dataStart + ils.off.value + ils.comp.value);
    const seg = Buffer.from(ils.comp.value === ils.dec.value ? rawILS : zlib.inflateSync(rawILS));

    const byId = new Map(cast.res.map(e => [e.id.value, e]));
    const bodies = new Map();
    let p = 0;
    while (p < seg.length) {
        const id = readVint(seg, p);
        const e = byId.get(id.value);
        if (!e) break;
        bodies.set(id.value, { at: id.end, len: e.dec.value, entry: e });
        p = id.end + e.dec.value;
    }

    const ctx = contextOf(seg, bodies, cast.res);
    if (!ctx) throw new Error("no LctX — cannot tell which scripts are live");
    const lnamEntry = cast.res.find(e => e.tag === "Lnam" && e.id.value === ctx.lnamSectionID);
    const lnamBody = lnamEntry && bodies.get(lnamEntry.id.value);
    const names = lnamBody
        ? (namesFrom(seg.subarray(lnamBody.at, lnamBody.at + lnamBody.len)) || [])
        : [];
    if (!names.length) throw new Error("could not read the context's name table");

    // Find the live script that owns both handlers.
    let found = null;
    for (const e of cast.res) {
        if (e.tag !== "Lscr" || !ctx.scripts.has(e.id.value)) continue;
        const body = bodies.get(e.id.value);
        if (!body) continue;
        const chunk = seg.subarray(body.at, body.at + body.len);
        let s;
        try { s = readScript(chunk, names); } catch { continue; }
        if (!s) continue;
        const target = s.handlers.findIndex(h => h.name === HANDLER && h.codeLength);
        const template = s.handlers.find(h => h.name === TEMPLATE && h.codeLength);
        if (target < 0 || !template) continue;
        found = { entry: e, body, chunk, script: s, target, template };
        break;
    }
    if (!found) throw new Error(`no live script defines both ${HANDLER} and ${TEMPLATE}`);

    const { entry, body, chunk, script, target, template } = found;
    const h = script.handlers[target];
    console.log(`${CAST}: script ${entry.id.value}, ${HANDLER} at ${h.codeOffset}, ${h.codeLength} bytes`);

    /* Build the prologue out of bytes that are already in this script. */
    const cmp = chunk.subarray(template.codeOffset, template.codeOffset + 7);
    const code = chunk.subarray(h.codeOffset, h.codeOffset + h.codeLength);
    const ret0 = code.subarray(26, 32);
    const prologue = Buffer.concat([cmp, Buffer.from([0x14]), Buffer.from([0x95, 0x00, 0x09]), ret0]);

    if (code.subarray(0, 7).equals(cmp)) {
        console.log(`  already patched — ${HANDLER} starts with the pAnimMode test`);
        return;
    }

    /* Refuse anything that is not the build these bytes were read from. */
    const expectCmp = Buffer.from([0x8a, 0x09, 0x88, 0x85, 0x03, 0x43, 0x0f]);
    const expectRet = Buffer.from([0x03, 0x42, 0x01, 0x97, 0x01, 0x5a]);
    const expectHead = Buffer.from([0x8a, 0x09, 0x8c, 0x43, 0x01, 0x97, 0x01, 0x6b, 0x14, 0x95, 0x00, 0x17]);
    const problems = [];
    if (!cmp.equals(expectCmp)) problems.push(`${TEMPLATE} does not start with the pAnimMode test`);
    if (!ret0.equals(expectRet)) problems.push(`${HANDLER} has no "return 0" at offset 26`);
    if (!code.subarray(0, 12).equals(expectHead)) problems.push(`${HANDLER} does not start with the windowExists test`);
    if (h.codeLength !== 175) problems.push(`${HANDLER} is ${h.codeLength} bytes, expected 175`);
    if (prologue.length !== 17) problems.push(`prologue is ${prologue.length} bytes, expected 17`);
    if (problems.length) {
        console.error("\nThis is not the build these bytes were read from:");
        for (const m of problems) console.error(`  - ${m}`);
        process.exit(1);
    }

    console.log(`  prologue: ${[...prologue].map(x => x.toString(16).padStart(2, "0")).join(" ")}`);
    console.log(`  ${HANDLER}: ${h.codeLength} -> ${h.codeLength + prologue.length} bytes`);

    const newChunk = insertPrologue(chunk, target, prologue);
    if (newChunk.length !== chunk.length + prologue.length) throw new Error("chunk grew by the wrong amount");

    if (dryRun) { console.log("\n(dry run — nothing written)"); return; }

    /* Splice the longer body back into the blob and grow its map entry. */
    const newSeg = Buffer.concat([
        seg.subarray(0, body.at), newChunk, seg.subarray(body.at + body.len)
    ]);
    entry.dec.changed = newChunk.length;
    entry.comp.changed = newChunk.length;
    ils.dec.changed = newSeg.length;

    const newILS = zlib.deflateSync(newSeg);
    const delta = newILS.length - ils.comp.value;
    ils.comp.changed = newILS.length;
    for (const e of cast.res) {
        if (e === ils) continue;
        if (e.off.value >= 0 && e.off.value > ils.off.value) e.off.changed = e.off.value + delta;
    }

    const map = buildMap(cast);
    const z = zlib.deflateSync(map);
    const inner = Buffer.concat([writeVint(cast.abmp.ctype), writeVint(map.length), z]);
    const abmpSection = Buffer.concat([
        cast.b.subarray(cast.abmp.tagAt, cast.abmp.tagAt + 4),
        writeVint(inner.length), inner,
    ]);

    const oldData = cast.b.subarray(cast.dataStart);
    const newData = Buffer.concat([newILS, oldData.subarray(ils.comp.value)]);
    const out = Buffer.concat([
        cast.b.subarray(0, cast.abmp.tagAt),
        abmpSection,
        cast.b.subarray(cast.abmp.sectionEnd, cast.dataStart),
        newData,
    ]);

    const sizeDelta = out.length - cast.b.length;
    const readSize = cast.big ? out.readUInt32BE.bind(out) : out.readUInt32LE.bind(out);
    const writeSize = cast.big ? out.writeUInt32BE.bind(out) : out.writeUInt32LE.bind(out);
    writeSize(readSize(4) + sizeDelta, 4);

    if (!fs.existsSync(backup)) {
        fs.copyFileSync(file, backup);
        console.log(`  original saved to ${path.basename(backup)}`);
    }
    fs.writeFileSync(file, out);
    console.log(`  ILS ${ils.comp.value} -> ${newILS.length} bytes, ` +
        `${cast.res.filter(e => e.off.changed !== undefined).length} resource offsets moved`);
    console.log(`  wrote ${CAST} (${cast.b.length} -> ${out.length} bytes)`);
}

if (require.main === module) run(process.argv.slice(2));
module.exports = { insertPrologue };

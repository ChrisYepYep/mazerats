/* The green teleport does not animate in a large room.
 *
 * THE BUG
 *
 * A furni's animation is described by a text member called "<class>.data" —
 * its states, its layers, and the frames each layer plays per state. Rooms
 * with 32-pixel tiles draw furni from the half-size art set, and the class
 * looks for the definition under an "s_" name:
 *
 *     me.pNameBase = tClass
 *     if getThread(#room).getInterface().getGeometry().pXFactor = 32 then
 *         me.pNameBase = "s_" & me.pNameBase
 *     tDataName = me.pNameBase & ".data"
 *     if not memberExists(tDataName) then jump L592      <- skips everything
 *
 * That jump skips the whole of animation setup: no state sequence, no layer
 * data, no frame lists. The furni still draws, it just never moves.
 *
 * The green teleport is class "doorE", and "s_doorE.data" was never shipped.
 * It is the only one of its kind: door, doorB, doorC, doorD, doorO,
 * door_cabin, door_alhambra and door_gingerbread all carry an s_ definition,
 * and all eight are the same 185 characters, byte for byte. doorE has the
 * full-size "doorE.data" and the complete half-size ART — s_doorE_a_0/1,
 * s_doorE_b_0/1, s_doorE_c_1, exactly the frame set the other doors ship —
 * and no definition to drive it with. Hence red animating and green not.
 *
 * THE FIX
 *
 * Ship the missing member. "s_doorE.data" is added to hh_furni_armas_50.cct
 * as a clone of "s_doorB.data", which is already there and already correct:
 *
 *   - the member record differs by one character, B -> E, since the two names
 *     are the same length
 *   - the text is copied verbatim, because every door shares one definition
 *
 * Nothing else in the cast is rewritten. The member index has 18 free slots
 * and the key table has 715 spare entries already allocated, so both are
 * edited in place rather than resized.
 *
 *   node tools/fix-green-teleport.js              apply
 *   node tools/fix-green-teleport.js --dry-run    report, write nothing
 *   node tools/fix-green-teleport.js --restore    put the original back
 *
 * The client folder comes from HABBO_CLIENT, or --client <dir>.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const { openContainer, buildMap, rebuildData, readVint, writeVint } = require("./add-hand-search.js");
const { readMember } = require("./cct-extract.js");

const CAST = "hh_furni_armas_50.cct";
const MODEL = "s_doorB.data";        // already present, already correct
const TARGET = "s_doorE.data";       // the one that was never shipped
const INLINE_OFF = -1;               // varint 8f ff ff ff 7f in the map

function clientDir(argv) {
    const i = argv.indexOf("--client");
    const dir = i > -1 ? argv[i + 1] : process.env.HABBO_CLIENT;
    if (!dir) { console.error("No client folder. Set HABBO_CLIENT or pass --client <dir>."); process.exit(1); }
    return dir;
}

/* The initial load segment is a flat run of (varint id, `dec` bytes) bodies. */
function readILS(cast) {
    const ils = cast.res.find(e => e.tag === "ILS ");
    const raw = cast.b.subarray(cast.dataStart + ils.off.value, cast.dataStart + ils.off.value + ils.comp.value);
    const seg = ils.comp.value === ils.dec.value ? Buffer.from(raw) : zlib.inflateSync(raw);
    const byId = new Map(cast.res.map(e => [e.id.value, e]));
    const order = [];
    const bodies = new Map();
    let p = 0;
    while (p < seg.length) {
        const id = readVint(seg, p);
        const e = byId.get(id.value);
        if (!e) break;
        bodies.set(id.value, seg.subarray(id.end, id.end + e.dec.value));
        order.push(id.value);
        p = id.end + e.dec.value;
    }
    return { ils, seg, order, bodies };
}

function writeILS(order, bodies) {
    const parts = [];
    for (const id of order) parts.push(writeVint(id), bodies.get(id));
    return Buffer.concat(parts);
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

    const cast = openContainer(file);
    const { ils, order, bodies } = readILS(cast);

    /* Find the model member, and make sure the target is genuinely absent —
       running this twice must not add it twice. */
    let model = null;
    for (const e of cast.res) {
        if (e.tag !== "CASt") continue;
        const body = bodies.get(e.id.value);
        if (!body) continue;
        const m = readMember(body);
        if (!m || !m.name) continue;
        if (m.name === TARGET) { console.log(`  ${CAST} already has ${TARGET} — nothing to do`); return; }
        if (m.name === MODEL) model = { entry: e, body, member: m };
    }
    if (!model) throw new Error(`could not find the model member ${MODEL}`);
    console.log(`${CAST}: modelling ${TARGET} on ${MODEL} (CASt id ${model.entry.id.value}, type ${model.member.type})`);

    /* The member record, with the one character that differs. Both names are
       twelve characters, so nothing inside the record has to move. */
    const from = Buffer.from(MODEL, "latin1");
    const hits = [];
    for (let i = 0; i <= model.body.length - from.length; i++) {
        if (model.body.subarray(i, i + from.length).equals(from)) hits.push(i);
    }
    if (hits.length !== 1) throw new Error(`expected ${MODEL} once in the member record, found ${hits.length}`);
    const newCastBody = Buffer.from(model.body);
    Buffer.from(TARGET, "latin1").copy(newCastBody, hits[0]);

    /* The text. The model's STXT lives out in the data region, stored
       deflated, so its bytes are cloned exactly as they sit on disk and the
       new resource claims the same compressed and decompressed lengths. */
    const keyRes = cast.res.find(e => e.tag === "KEY*");
    const kb = bodies.get(keyRes.id.value);
    if (!kb) throw new Error("KEY* is not in the load segment");
    const hdrLen = kb.readUInt16LE(0), entrySize = kb.readUInt16LE(2);
    const allocated = kb.readUInt32LE(4), used = kb.readUInt32LE(8);
    let modelStxtId = null;
    for (let i = 0; i < used; i++) {
        const o = hdrLen + i * entrySize;
        if (o + entrySize > kb.length) break;
        if (kb.readUInt32LE(o + 4) !== model.entry.id.value) continue;
        if (kb.toString("latin1", o + 8, o + 12).split("").reverse().join("") !== "STXT") continue;
        modelStxtId = kb.readUInt32LE(o);
        break;
    }
    if (modelStxtId === null) throw new Error(`no STXT under ${MODEL}`);
    const stxtEntry = cast.res.find(e => e.id.value === modelStxtId);
    if (stxtEntry.off.value < 0) throw new Error("model STXT is inline; this tool clones a data-region one");
    const stxtBytes = Buffer.from(cast.b.subarray(
        cast.dataStart + stxtEntry.off.value,
        cast.dataStart + stxtEntry.off.value + stxtEntry.comp.value));
    console.log(`  text from STXT ${modelStxtId}: ${stxtEntry.comp.value} stored bytes, ${stxtEntry.dec.value} decompressed`);

    if (used + 1 > allocated) throw new Error(`KEY* is full: ${used} of ${allocated}`);
    if (hdrLen + (used + 1) * entrySize > kb.length) throw new Error("KEY* has no room for another entry");

    /* A free slot in the member index. */
    const casRes = cast.res.find(e => e.tag === "CAS*");
    const cb = bodies.get(casRes.id.value);
    if (!cb) throw new Error("CAS* is not in the load segment");
    let slot = -1;
    for (let o = 0; o + 4 <= cb.length; o += 4) if (cb.readUInt32BE(o) === 0) { slot = o / 4; break; }
    if (slot < 0) throw new Error("no free slot in CAS*");

    const maxId = Math.max(...cast.res.map(e => e.id.value));
    const newCastId = maxId + 1, newStxtId = maxId + 2;
    console.log(`  new resources: CASt ${newCastId} (inline), STXT ${newStxtId} (data region)`);
    console.log(`  member index slot ${slot} (member #${slot + 1}), key table entry ${used} of ${allocated}`);

    if (dryRun) { console.log("\n(dry run — nothing written)"); return; }

    /* ---- edit the two tables in place ---- */
    const newCas = Buffer.from(cb);
    newCas.writeUInt32BE(newCastId, slot * 4);

    const newKey = Buffer.from(kb);
    const at = hdrLen + used * entrySize;
    newKey.writeUInt32LE(newStxtId, at);
    newKey.writeUInt32LE(newCastId, at + 4);
    newKey.write("STXT".split("").reverse().join(""), at + 8, 4, "latin1");
    newKey.writeUInt32LE(used + 1, 8);

    /* ---- the load segment, with the two rewritten tables and the new
           member record appended ---- */
    bodies.set(casRes.id.value, newCas);
    bodies.set(keyRes.id.value, newKey);
    bodies.set(newCastId, newCastBody);
    order.push(newCastId);
    const newSeg = writeILS(order, bodies);

    /* ---- the resource map gains two entries ---- */
    const tagBytesFor = (tag) => Buffer.from(cast.big ? tag : tag.split("").reverse().join(""), "latin1");
    const entry = (id, off, comp, dec, ct, tag) => ({
        id: { changed: id }, off: { value: off, changed: off },
        comp: { changed: comp }, dec: { changed: dec }, ct: { changed: ct },
        tag, tagBytes: tagBytesFor(tag),
    });
    cast.res.push(entry(newCastId, INLINE_OFF, newCastBody.length, newCastBody.length, 0, "CASt"));
    /* Its offset is settled below, once the data region has been laid out and
       its length is known. It starts negative so that rebuildData — which
       walks everything with a non-negative offset — leaves it alone rather
       than trying to copy bytes it does not have yet. */
    const newStxt = entry(newStxtId, INLINE_OFF, stxtEntry.comp.value, stxtEntry.dec.value, stxtEntry.ct.value, "STXT");
    cast.res.push(newStxt);
    /* THE MAP HEADER DESCRIBES THE SET, NOT JUST THE LIST.
       Its three varints are a version, the highest resource id in the cast,
       and the number of entries — the middle one measured as exactly the max
       id on all 39 casts tested. Adding resources without raising it left the
       map declaring ids past the end of what the loader sizes its table for,
       and the client died on the first loading screen. */
    cast.header[1].changed = Math.max(...cast.res.map(e =>
        (e.id.changed === undefined ? e.id.value : e.id.changed)));
    cast.header[2].changed = cast.res.length;

    /* ---- re-lay the data region, then park the new text on the end ---- */
    ils.dec.changed = newSeg.length;
    const replacements = new Map();
    replacements.set(ils.id.value, zlib.deflateSync(newSeg));

    let newData = rebuildData(cast, replacements);
    newStxt.off.changed = newData.length;
    newData = Buffer.concat([newData, stxtBytes]);

    const map = buildMap(cast);
    const z = zlib.deflateSync(map);
    const inner = Buffer.concat([writeVint(cast.abmp.ctype), writeVint(map.length), z]);
    const abmpSection = Buffer.concat([
        cast.b.subarray(cast.abmp.tagAt, cast.abmp.tagAt + 4), writeVint(inner.length), inner,
    ]);
    const out = Buffer.concat([
        cast.b.subarray(0, cast.abmp.tagAt), abmpSection,
        cast.b.subarray(cast.abmp.sectionEnd, cast.dataStart), newData,
    ]);
    const readSize = cast.big ? out.readUInt32BE.bind(out) : out.readUInt32LE.bind(out);
    const writeSize = cast.big ? out.writeUInt32BE.bind(out) : out.writeUInt32LE.bind(out);
    writeSize(readSize(4) + (out.length - cast.b.length), 4);

    if (!fs.existsSync(backup)) {
        fs.copyFileSync(file, backup);
        console.log(`  original saved to ${path.basename(backup)}`);
    }
    fs.writeFileSync(file, out);
    console.log(`  wrote ${CAST} (${cast.b.length} -> ${out.length} bytes)`);
}

if (require.main === module) run(process.argv.slice(2));

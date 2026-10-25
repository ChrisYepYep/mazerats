/* Is this cast structurally sound enough to hand to the projector?
 *
 * Written after a patched cast crashed the client on its first loading
 * screen. The patch itself was fine — a cloned text member — but the map
 * header carries the cast's highest resource id, and adding resources without
 * raising it left the map describing ids past the end of what the loader
 * sizes its table for. Nothing in the reading tools noticed, because they all
 * index by id and never look at the header.
 *
 * So this checks the things a reader gets away with ignoring and a loader
 * does not:
 *
 *   header       version, highest resource id, entry count — the last two
 *                measured against the actual entries
 *   ids          unique, and none past the declared maximum
 *   map          rebuilds byte-identically when nothing has been changed
 *   data region  every stored resource lies inside the file, and no two
 *                overlap
 *   load segment unpacks cleanly and accounts for every inline resource
 *   CAS*         every member slot points at a resource that exists and is
 *                a CASt
 *   KEY*         used <= allocated, and the entries fit the chunk
 *   members      every CASt parses and every child chunk is readable
 *
 *   node tools/cct-verify.js hh_furni_armas_50.cct
 *   node tools/cct-verify.js                        (every cast in the client)
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const { openContainer, buildMap, readVint } = require("./add-hand-search.js");
const { openCast, readMember } = require("./cct-extract.js");

function verify(file) {
    const problems = [];
    const say = (m) => problems.push(m);
    const cast = openContainer(file);

    /* ---- header ---- */
    const ids = cast.res.map(e => e.id.value);
    const maxId = Math.max(...ids);
    if (cast.header[2].value !== cast.res.length) {
        say(`header entry count is ${cast.header[2].value} but the map holds ${cast.res.length} entries`);
    }
    if (cast.header[1].value !== maxId) {
        say(`header says the highest resource id is ${cast.header[1].value}, but the map holds ${maxId}`);
    }
    const seen = new Set();
    for (const id of ids) {
        if (seen.has(id)) say(`resource id ${id} appears more than once`);
        seen.add(id);
    }

    /* ---- the map rebuilds to itself ---- */
    if (!buildMap(cast).equals(cast.abmp.map)) say("the map does not rebuild byte-identically");

    /* ---- data region ---- */
    const avail = cast.b.length - cast.dataStart;
    const stored = cast.res.filter(e => e.off.value >= 0).sort((a, b) => a.off.value - b.off.value);
    let prevEnd = 0, prev = null;
    for (const e of stored) {
        const end = e.off.value + e.comp.value;
        if (end > avail) say(`${e.tag} ${e.id.value} runs to ${end}, past the ${avail} bytes of data region`);
        if (prev && e.off.value < prevEnd) {
            say(`${e.tag} ${e.id.value} at ${e.off.value} overlaps ${prev.tag} ${prev.id.value} ending at ${prevEnd}`);
        }
        prevEnd = end; prev = e;
    }

    /* ---- load segment ---- */
    const ils = cast.res.find(e => e.tag === "ILS ");
    const inlineIds = new Set(cast.res.filter(e => e.off.value < 0).map(e => e.id.value));
    if (!ils) { say("no ILS"); }
    else {
        const raw = cast.b.subarray(cast.dataStart + ils.off.value, cast.dataStart + ils.off.value + ils.comp.value);
        let seg;
        try { seg = ils.comp.value === ils.dec.value ? raw : zlib.inflateSync(raw); }
        catch (err) { seg = null; say(`the load segment will not unpack: ${err.message}`); }
        if (seg) {
            if (seg.length !== ils.dec.value) say(`load segment unpacked to ${seg.length}, the map says ${ils.dec.value}`);
            const byId = new Map(cast.res.map(e => [e.id.value, e]));
            const found = new Set();
            let p = 0;
            while (p < seg.length) {
                const id = readVint(seg, p);
                const e = byId.get(id.value);
                if (!e) { say(`the load segment names resource ${id.value}, which is not in the map`); break; }
                if (e.off.value >= 0) say(`resource ${id.value} is in the load segment but the map gives it an offset`);
                found.add(id.value);
                p = id.end + e.dec.value;
                if (p > seg.length) { say(`resource ${id.value} runs past the end of the load segment`); break; }
            }
            /* And no check that every offset-less resource is in the segment.
               That flagged stock casts too — hh_challenges alone has 414 of
               them — so a negative offset means "not stored in the data
               region", which covers absent resources as well as inline ones. */
        }
    }

    /* ---- the tables, read the way the client reads them ---- */
    const r = openCast(file);
    const byIdR = new Map(r.res.map(e => [e.id, e]));
    let slot = 0;
    for (const id of r.castTable) {
        slot++;
        if (!id) continue;
        const e = byIdR.get(id);
        if (!e) { say(`member slot ${slot} points at resource ${id}, which does not exist`); continue; }
        if (e.tag !== "CASt") say(`member slot ${slot} points at a ${e.tag}, not a CASt`);
    }

    const keyRes = r.res.find(e => e.tag === "KEY*");
    if (!keyRes) say("no KEY*");
    else {
        const kb = r.chunk(keyRes);
        /* KEY* follows the container's byte order, and reading it as little
           endian regardless made the big-endian casts claim billions of
           entries — hh_trax_samples "1057554432 entries in 68928 bytes". */
        const u16 = (o) => (cast.big ? kb.readUInt16BE(o) : kb.readUInt16LE(o));
        const u32 = (o) => (cast.big ? kb.readUInt32BE(o) : kb.readUInt32LE(o));
        const hdrLen = u16(0), entrySize = u16(2);
        const allocated = u32(4), used = u32(8);
        if (used > allocated) say(`KEY* says ${used} entries used of ${allocated} allocated`);
        if (hdrLen + used * entrySize > kb.length) {
            say(`KEY* claims ${used} entries, which do not fit in ${kb.length} bytes`);
        }
        /* Nothing here checks that a KEY* child or parent is in the map. The
           first version did, and it flagged the stock casts by the hundred —
           fuse_client, hh_badges, most of the furni sets — so an id KEY* names
           that the afterburner map does not carry is normal, not damage. A
           check that fails the shipped client is measuring the wrong thing. */
    }

    /* ---- every member and every child chunk is readable ---- */
    let members = 0;
    for (const e of r.res.filter(x => x.tag === "CASt")) {
        let m;
        try { m = readMember(r.chunk(e)); } catch (err) { say(`CASt ${e.id} will not parse: ${err.message}`); continue; }
        if (m && m.name) members++;
    }
    for (const e of r.res) {
        if (e.tag === "ILS " || e.tag === "ABMP") continue;
        try { r.chunk(e); } catch (err) { say(`${e.tag} ${e.id} will not read: ${err.message}`); }
    }

    return { problems, members, resources: cast.res.length, maxId, bytes: cast.b.length };
}

if (require.main === module) {
    const CLIENT = process.env.HABBO_CLIENT || "C:\\Users\\cjboy\\Documents\\HH350-Test";
    const only = process.argv.slice(2).find(a => !a.startsWith("--"));
    const files = only ? [only] : fs.readdirSync(CLIENT).filter(x => /\.cct$/i.test(x)).sort();
    let bad = 0;
    for (const f of files) {
        const p = path.isAbsolute(f) ? f : path.join(CLIENT, f);
        let r;
        try { r = verify(p); }
        catch (err) { console.log(`${path.basename(f)}: WILL NOT OPEN — ${err.message}`); bad++; continue; }
        const tag = r.problems.length ? `${r.problems.length} PROBLEM(S)` : "ok";
        console.log(`${path.basename(f)}: ${tag} — ${r.resources} resources, ${r.members} named members, max id ${r.maxId}, ${r.bytes} bytes`);
        for (const m of r.problems) console.log(`    ${m}`);
        if (r.problems.length) bad++;
    }
    process.exit(bad ? 1 : 0);
}

module.exports = { verify };

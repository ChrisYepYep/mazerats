/* One cast, read the way Director reads it.
 *
 * lingo-decompile.js answers "what is in this file". This answers the two
 * questions you have to get right before believing any of it, both of which
 * produce confident nonsense when guessed:
 *
 * 1. WHICH SCRIPTS ARE REAL. hh_room.cct holds 2577 Lscr chunks and only 151
 *    script cast members. The surplus are older copies left in the container,
 *    and they decode perfectly — searching all of them for the furni hand's
 *    code returns nineteen identical-looking Hand classes with no way to tell
 *    which one the client loads. LctX settles it: it lists the 152 script
 *    sections that make up the context, and nothing outside that list is
 *    loaded at all.
 *
 * 2. WHICH NAME TABLE. The same cast carries 18 Lnam chunks. Handler, property
 *    and local names are indices into one of them, and reading a script against
 *    the wrong table yields names that are real strings from this client and so
 *    look like code: script 12624 came back with handlers named pHandButtonsWnd
 *    and pItemList, which are properties, not handlers. LctX names its own
 *    table in lnamSectionID, so there is nothing to guess.
 *
 * LctX layout, big-endian:
 *     @8  entryCount   @16 entriesOffset (u16)   @32 lnamSectionID
 *     entries at entriesOffset, 12 bytes each, section id at +4
 */

const fs = require("fs");
const path = require("path");

const { openCast, readMember } = require("./cct-extract.js");
const { namesFrom, readScript, disassemble } = require("./lingo-decompile.js");

const CLIENT = process.env.HABBO_CLIENT ||
    "C:\\Users\\cjboy\\AppData\\Roaming\\Habbo Launcher\\downloads\\shockwave\\350";

function readContexts(cast) {
    const out = [];
    for (const r of cast.res.filter(x => x.tag === "LctX" || x.tag === "Lctx")) {
        const b = cast.chunk(r);
        if (b.length < 40) continue;
        const entryCount = b.readUInt32BE(8);
        const entriesOffset = b.readUInt16BE(16);
        const lnamSectionID = b.readInt32BE(32);
        const entries = [];
        for (let i = 0; i < entryCount; i++) {
            const o = entriesOffset + i * 12;
            if (o + 12 > b.length) break;
            entries.push({ index: i, sectionID: b.readInt32BE(o + 4) });
        }
        out.push({ id: r.id, lnamSectionID, entries });
    }
    return out;
}

function openClient(file) {
    const full = path.isAbsolute(file) ? file : path.join(CLIENT, file);
    const cast = openCast(full);
    const contexts = readContexts(cast);

    const byId = new Map(cast.res.filter(r => r.tag === "Lscr").map(r => [r.id, r]));
    const scripts = [];
    const seen = new Set();

    for (const ctx of contexts) {
        const lnamRes = cast.res.find(r => r.tag === "Lnam" && r.id === ctx.lnamSectionID);
        const names = lnamRes ? (namesFrom(cast.chunk(lnamRes)) || []) : [];
        for (const e of ctx.entries) {
            const r = byId.get(e.sectionID);
            if (!r || seen.has(r.id)) continue;
            const chunk = cast.chunk(r);
            const s = readScript(chunk, names);
            if (!s) continue;
            seen.add(r.id);
            scripts.push({ id: r.id, index: e.index, chunk, names, lnam: ctx.lnamSectionID, ...s });
        }
    }

    const members = [];
    for (const r of cast.res.filter(x => x.tag === "CASt")) {
        let m;
        try { m = readMember(cast.chunk(r)); } catch { continue; }
        if (m && m.name) members.push({ id: r.id, type: m.type, name: m.name });
    }

    return { file: full, cast, contexts, scripts, members };
}

module.exports = { openClient, readContexts, CLIENT, disassemble };

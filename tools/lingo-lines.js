/* Does every handler's line block describe its code?
 *
 * The block is a list of single bytes — the bytecode bytes belonging to each
 * successive source line — and they sum to codeLength - 1. That is not a guess
 * from the format documentation, it is measured: isOpen is 13 bytes of code
 * with one line byte of 12, close is 52 with 00 12 06 08 0c 07 00 summing to
 * 51, construct is 183 with twenty-two bytes summing to 182.
 *
 * It matters because Director walks this structure, and a block that does not
 * cover its handler is a read past the end. Giving seven new handlers an empty
 * one crashed the projector with an access violation inside DIRAPI.dll the
 * moment the first of them ran.
 *
 * Run it over a cast to check every handler; run it over a patched cast to
 * check the ones that were rewritten.
 */

const fs = require("fs");
const path = require("path");
const { openClient, CLIENT } = require("./lingo-client.js");
const { parse } = require("./lingo-script.js");

function checkScript(script, names) {
    const bad = [];
    for (const h of script.handlers) {
        if (!h.code.length) continue;
        let sum = 0;
        for (const b of h.lines) sum += b;
        if (sum !== h.code.length - 1) {
            bad.push(`${names[h.nameID]}: ${h.lines.length} line bytes summing to ${sum}, code is ${h.code.length} (want ${h.code.length - 1})`);
        }
    }
    return bad;
}

module.exports = { checkScript };

if (require.main === module) {
    const only = process.argv[2];
    let handlers = 0, bad = 0;
    const examples = [];
    for (const f of fs.readdirSync(CLIENT).filter(x => /\.cct$/i.test(x)).sort()) {
        if (only && f !== only) continue;
        let c; try { c = openClient(f); } catch { continue; }
        for (const s of c.scripts) {
            const p = parse(s.chunk);
            if (!p) continue;
            handlers += p.handlers.filter(h => h.code.length).length;
            for (const m of checkScript(p, s.names)) {
                bad++;
                if (examples.length < 10) examples.push(`${f}#${s.id} ${m}`);
            }
        }
    }
    console.log(`${handlers} handlers, ${bad} whose line block does not cover their code`);
    for (const e of examples) console.log(`  ${e}`);
    process.exit(bad ? 1 : 0);
}

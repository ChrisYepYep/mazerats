/* What the client's compiled Lingo can tell you WITHOUT a decompiler.

   The scripts in these casts are Lscr chunks — compiled bytecode, not source.
   Decompiling them properly needs a tool like ProjectorRays and a C++
   toolchain. But two things survive compilation in readable form, and between
   them they answer most questions worth asking:

     Lnam   the name table: every handler, property and local name the script
            uses. 20,355 unique names across this client.
     Lscr   the script's own literals — the strings it compares against and
            sends, including Habbo's *external_variable names.

   You do not get logic. You do get to know what EXISTS, which is usually the
   question. Searching for "path" and finding nothing but getMoviePath is a
   real answer about where pathfinding lives.

   usage:
     node tools/lingo-names.js                 summary and the useful buckets
     node tools/lingo-names.js --find walk     every name/literal matching
     node tools/lingo-names.js --literals      literals rather than names
*/

const fs = require("fs");
const path = require("path");

const { openCast } = require("./cct-extract.js");

const CLIENT = process.env.HABBO_CLIENT ||
    "C:\\Users\\cjboy\\AppData\\Roaming\\Habbo Launcher\\downloads\\shockwave\\350";

/* Lnam: a count and offset in the header, then length-prefixed names. The
   container is little-endian but these casts are not consistent about it, so
   both are tried and the one that yields printable names of sane length
   wins — the same trick the bitmap reader needs. */
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
        } catch { /* try the other endianness */ }
    }
    return null;
}

function scan() {
    const names = new Set();
    const literals = new Map();
    const externals = new Set();
    let casts = 0, scripts = 0, unreadable = 0;

    for (const file of fs.readdirSync(CLIENT).filter(f => /\.cct$/i.test(f))) {
        let cast;
        try { cast = openCast(path.join(CLIENT, file)); }
        catch { unreadable++; continue; }
        casts++;

        for (const r of cast.res) {
            if (r.tag === "Lnam") {
                const got = namesFrom(cast.chunk(r));
                if (got) got.forEach(n => names.add(n));
            } else if (r.tag === "Lscr") {
                scripts++;
                const text = cast.chunk(r).toString("latin1");
                for (const m of text.matchAll(/[\x20-\x7e]{4,60}/g)) {
                    const s = m[0].trim();
                    if (s.length >= 4) literals.set(s, (literals.get(s) || 0) + 1);
                }
                for (const m of text.matchAll(/\*[a-z0-9_.]{4,60}/gi)) externals.add(m[0]);
            }
        }
    }
    return { names, literals, externals, casts, scripts, unreadable };
}

function main() {
    const argv = process.argv.slice(2);
    const findAt = argv.indexOf("--find");
    const wantLiterals = argv.includes("--literals");

    const { names, literals, externals, casts, scripts, unreadable } = scan();

    if (findAt > -1) {
        const re = new RegExp(argv[findAt + 1], "i");
        const inNames = [...names].filter(s => re.test(s)).sort();
        const inLits = [...literals.keys()].filter(s => re.test(s)).sort();
        console.log(`names (${inNames.length}):`);
        for (const s of inNames) console.log("  " + s);
        console.log(`\nliterals (${inLits.length}):`);
        for (const s of inLits.slice(0, 200)) console.log("  " + s);
        return;
    }

    console.log(`${casts} casts read (${unreadable} not readable), ${scripts} compiled scripts`);
    console.log(`${names.size} unique names, ${literals.size} distinct literals`);

    console.log(`\nexternal variables the client asks the server for (${externals.size}):`);
    for (const e of [...externals].sort()) console.log("  " + e);

    if (wantLiterals) {
        console.log(`\nmost common literals:`);
        for (const [s, n] of [...literals].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
            console.log(`  ${String(n).padStart(5)}  ${s}`);
        }
    }

    /* The finding that started this file. Kept as a standing check: if a
       future client ever DOES ship pathfinding, this stops printing. */
    const pathish = [...names].filter(s => /path|route|astar/i.test(s) && !/movie|ext|logo|group|registration/i.test(s));
    console.log(`\npathfinding handlers: ${pathish.length}${pathish.length ? " — " + pathish.join(" ") : " (none — the server routes; the client only sends the goal)"}`);
    const goal = [...names].filter(s => /sendMoveGoal|TargetLoc|NextLoc/i.test(s));
    console.log(`what the client does instead: ${goal.join("  ")}`);
}

if (require.main === module) main();

/* Every furni name in the catalogue, one per line, for the dev console.

   The console's omit editor (tools/dev-console.ps1, OPTIONS -> EDIT LIST)
   searches this. It exists because the catalogue lives behind a Node module
   that fetches and caches FurniIndex's data, and PowerShell has no way to
   ask it anything — so the list is flattened to a text file once and read
   from disk on every keystroke after that.

   Names only, deduplicated and sorted. Nothing else about a furni matters
   to a list of things not to record.

     node tools/list-furni.js              # writes tools/.cache/furni-names.txt
     node tools/list-furni.js --stdout     # prints instead, for a quick look

   Written atomically, via a temporary file: the console reads this while
   the scan tools may be rewriting it, and a half-written list would look
   to the search like a catalogue that had suddenly lost half its furni.
*/

const fs = require("fs");
const path = require("path");

// No variable is demanded here: this one only reads the furni catalogue and
// never opens the database, so it can still work on a machine whose .env has
// no connection string in it yet.
require("./_env.js").loadEnv();

const { getCatalogue } = require("../netlify/functions/furni-catalogue.js");

const OUT = path.join(__dirname, ".cache", "furni-names.txt");

(async () => {
    const catalogue = await getCatalogue();
    const names = [...new Set(
        Object.values(catalogue.items || {})
            .map(it => it && it.name)
            .filter(Boolean)
            .map(n => String(n).trim())
    )].sort((a, b) => a.localeCompare(b));

    if (process.argv.includes("--stdout")) {
        console.log(names.join("\n"));
        process.exit(0);
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const tmp = OUT + ".tmp";
    fs.writeFileSync(tmp, names.join("\r\n") + "\r\n", "utf8");
    fs.renameSync(tmp, OUT);
    console.log(`${names.length} furni names -> ${path.relative(process.cwd(), OUT)}`);
    process.exit(0);
})().catch(err => { console.error(err && err.message ? err.message : err); process.exit(1); });

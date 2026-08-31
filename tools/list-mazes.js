/* Every maze, as "id<TAB>name", for the dev console's maze selector.

   Same job as tools/list-furni.js and the same reason: the console needs to
   show a list of things that live in MongoDB, and PowerShell has no way to
   ask MongoDB anything. So the list is flattened to a text file and read
   from disk.

   Tab-separated rather than JSON because the reader is a PowerShell script
   painting pixel text into a 229px screen, and because a maze name can
   contain almost anything except a tab.

   The image count comes along too. Deciding whether to rescan a maze is
   mostly a question of how long it will take, and "102 images" answers that
   where the name alone does not.

     node tools/list-mazes.js              # writes tools/.cache/maze-list.txt
     node tools/list-mazes.js --stdout     # prints instead, for a quick look

   Written atomically via a temporary file: the console may read this while
   it is being rewritten, and a half-written list would look like an archive
   that had suddenly lost half its mazes.
*/

const fs = require("fs");
const path = require("path");

require("./_env.js").loadEnv(["MONGODB_URI"]);

const { getDb } = require("../netlify/functions/_db.js");

const OUT = path.join(__dirname, ".cache", "maze-list.txt");

// The same count the scanner will work through — entrance, gallery, finish —
// so the number shown next to a maze is the number of images a scan of it
// will actually do. Kept in step with imagesOf() in furni-scan-local.js.
function imageCount(doc) {
    let n = 0;
    if (doc.entrance && doc.entrance.image) n++;
    (doc.gallery || []).forEach(g => { if (g.image) n++; });
    if (doc.finish && doc.finish.image) n++;
    return n;
}

(async () => {
    const db = await getDb();
    const docs = await db.collection("rooms")
        .find({}, { projection: { id: 1, name: 1, entrance: 1, gallery: 1, finish: 1 } })
        .toArray();

    const rows = docs
        .filter(d => d && d.id)
        .map(d => ({
            id: String(d.id),
            // Tabs and newlines would break the one-row-per-line format the
            // reader depends on. Nothing in the archive has either, but the
            // names are typed by hand in the admin page.
            name: String(d.name || d.id).replace(/[\t\r\n]+/g, " ").trim(),
            images: imageCount(d)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const text = rows.map(r => `${r.id}\t${r.name}\t${r.images}`).join("\r\n") + "\r\n";

    if (process.argv.includes("--stdout")) {
        console.log(text);
        process.exit(0);
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const tmp = OUT + ".tmp";
    fs.writeFileSync(tmp, text, "utf8");
    fs.renameSync(tmp, OUT);
    console.log(`${rows.length} mazes -> ${path.relative(process.cwd(), OUT)}`);
    process.exit(0);
})().catch(err => { console.error(err && err.message ? err.message : err); process.exit(1); });

/* Recent messages sent through the console on the website, as plain lines.

   Feeds the MESSAGES tab of the desktop console (tools/dev-console.ps1),
   which has no session and no business holding an admin token — it runs on
   the owner's own machine with the same .env the site uses, so it reads the
   collection directly rather than authenticating against an API to reach
   data that is already sitting next to it.

   Plain text on stdout, one line per field, because the caller is a
   PowerShell script painting pixel text into a 458px box, not a JSON parser.

     node tools/list-messages.js [--limit 20]
*/

const fs = require("fs");
const path = require("path");

for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { getDb } = require("../netlify/functions/_db.js");

const argv = process.argv.slice(2);
const i = argv.indexOf("--limit");
const LIMIT = (i !== -1 && Number(argv[i + 1])) || 15;

(async () => {
    const db = await getDb();
    const rows = await db.collection("contact_messages")
        .find({}).sort({ createdAt: -1 }).limit(LIMIT).toArray();

    if (!rows.length) { console.log("No messages yet."); process.exit(0); }

    for (const r of rows) {
        const when = r.createdAt ? new Date(r.createdAt) : null;
        const stamp = when && !isNaN(when)
            ? when.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " +
              when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
            : "";
        const who = r.username || "(no username)";
        console.log(`${stamp}  ${who}${r.discord ? "  (" + r.discord + ")" : ""}`);
        // Wrapped here rather than in the caller: this side knows the text,
        // and the console's screen fits roughly 46 characters at its size.
        const words = String(r.message || "").replace(/\s+/g, " ").trim().split(" ");
        let line = "";
        for (const w of words) {
            if ((line + " " + w).trim().length > 46) { console.log("  " + line); line = w; }
            else line = (line + " " + w).trim();
        }
        if (line) console.log("  " + line);
        console.log("");
    }
    process.exit(0);
})().catch(err => { console.log("Couldn't read messages: " + err.message); process.exit(1); });

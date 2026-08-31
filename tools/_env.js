/* Loads .env for the command-line tools, and says something useful when it
   isn't there.

   All four tools in here needed this and each carried its own copy of the
   same six lines. The duplication was the smaller problem. The real one was
   that all four failed identically and uselessly on a machine that had just
   cloned the repo: a raw ENOENT stack trace naming a file the person has
   never heard of, thrown from inside node:fs.

   That matters more than it looks. The first thing anyone does with a new
   checkout is open the dev console and press a scan button — so that stack
   trace was the project's first impression, and it did not once mention
   .env.example, which is sitting right there.

   Callers name the variables they actually need. They differ: list-furni.js
   only reads the furni catalogue and never touches MongoDB, so demanding a
   connection string from it would block a tool that would have worked. */

const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");

function fail(message) {
    console.error("\n" + message + "\n");
    process.exit(1);
}

/* required: names that must be present AND non-empty.

   Empty is checked as well as missing because an unfilled .env.example
   copied into place is the likeliest state of a new machine, and a blank
   MONGODB_URI does not fail here — it fails several seconds later, inside
   the driver, complaining about connection string syntax. */
function loadEnv(required = []) {
    let text;
    try {
        text = fs.readFileSync(ENV_PATH, "utf8");
    } catch (err) {
        if (err.code !== "ENOENT") throw err;
        fail(
            "No .env file.\n\n" +
            "  These tools read the site's live database, and its credentials are\n" +
            "  deliberately not in the repo. Copy the example and fill it in:\n\n" +
            "      copy .env.example .env\n\n" +
            "  Ask whoever runs the site for the values. See README.md."
        );
    }

    for (const line of text.split(/\r?\n/)) {
        const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }

    const missing = required.filter(name => !process.env[name]);
    if (missing.length) {
        fail(
            `.env is missing ${missing.join(", ")}.\n\n` +
            "  Copy the description from .env.example and fill in the value.\n" +
            "  See README.md."
        );
    }
}

module.exports = { loadEnv, ENV_PATH };

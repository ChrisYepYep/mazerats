/* Copies the public site into dist/, which is what Netlify publishes
   (27 Oct 2026).

   Until today the site published the whole checkout (publish = "."), and
   everything that was not meant to be public was 404'd by a list of
   redirects in netlify.toml: /netlify/*, /tools/*, /backups/*, README.md and
   the rest. That list was case-sensitive and Netlify's file lookup is not,
   so /Netlify/functions/_db.js, /Tools/dev-console.ps1, /Backups/ff-levels-
   2026-09-17.json (the unreleased Fallin' Furni levels), /readme.md and
   /Package.json were all served to anyone who changed one letter, and an
   encoded slash (/netlify%2Ffunctions%2Fshare.js) got past it as well.
   Nothing secret was in them, but every function's source, the tools with
   this machine's paths in them, and levels nobody has played yet were.

   A deny-list can always be got round by a spelling nobody thought of.
   This is an allow-list instead: only what a browser needs is copied, so the
   rest is not on the CDN at all and no spelling can reach it. The functions
   are untouched by this; Netlify bundles them from netlify/functions, not
   from the published folder, and their included_files are read from the
   checkout as before.

   Runs LAST in the build, after themes.js has written the palettes and
   build-minify has stripped the comments, so what lands in dist/ is exactly
   what used to be published from the root. Safe to run by hand: it only
   ever writes dist/, which is gitignored, and `netlify dev` keeps serving
   the checkout itself ([dev] publish = "." in netlify.toml).

   Adding a new top-level page or folder? Add it to PUBLIC below, or the live
   site will 404 it while local dev shows it fine. The check at the end
   fails the build when a page at the root is neither published nor listed
   as private, so that mistake cannot ship quietly. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist");

// Everything a visitor's browser may load.
const PUBLIC = [
    "index.html", "home.html", "404.html", "privacy.html", "fallinfurni.html",
    "quiz.html", "warren.html", "wizard.html", "robots.txt",
    "assets", "css", "js"
];
// Root files that look like pages but are deliberately not published.
// dungeon.html is the unfinished dungeon bench (see netlify.toml).
const PRIVATE_PAGES = ["dungeon.html"];
// Never copied even though they sit inside a public folder: the level
// editor's source files (the game reads js/rat-race-levels.js), its epic
// soundtrack, the dungeon bench's script, and the untracked recordings
// kept beside the art.
const SKIP = new Set([
    "assets/ariadne-levels", "assets/console-sounds.mp4",
    "js/rat-race-epic.js", "js/dungeon.js"
]);

const problems = [];
for (const name of fs.readdirSync(ROOT)) {
    if (/\.html?$/i.test(name) && !PUBLIC.includes(name) && !PRIVATE_PAGES.includes(name)) {
        problems.push(`${name} is a page at the root but is in neither PUBLIC nor PRIVATE_PAGES in tools/build-dist.js`);
    }
}
if (problems.length) {
    console.error("build-dist:\n  " + problems.join("\n  "));
    process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
let files = 0;
for (const name of PUBLIC) {
    const from = path.join(ROOT, name);
    if (!fs.existsSync(from)) {
        console.error(`build-dist: ${name} is listed as public but does not exist`);
        process.exit(1);
    }
    fs.cpSync(from, path.join(OUT, name), {
        recursive: true,
        filter: (src) => {
            const rel = path.relative(ROOT, src).split(path.sep).join("/");
            if (SKIP.has(rel)) return false;
            if (fs.statSync(src).isFile()) files++;
            return true;
        }
    });
}
/* Every redirect in netlify.toml that rewrites to a static file must find it
   in dist/, or /home, /warren and the rest 404 on the live site while working
   under `netlify dev`, which still serves the checkout. */
const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
for (const [, to] of toml.matchAll(/^\s*to\s*=\s*"(\/[^"]*)"/gm)) {
    if (to.startsWith("/.netlify/") || !/\.[a-z0-9]+$/i.test(to)) continue;
    if (!fs.existsSync(path.join(OUT, to))) problems.push(`netlify.toml rewrites to ${to}, which is not in dist/`);
}
if (problems.length) {
    console.error("build-dist:\n  " + problems.join("\n  "));
    process.exit(1);
}
console.log(`build-dist: ${files} files copied to dist/`);

/* Strips comments out of the CSS and JS on the way to the CDN.

   This site has no build step on purpose, and this is not really one: it
   changes nothing about how the code is written, kept or read. It only stops
   every visitor downloading the explanations.

   The explanations are not incidental here. style.css is 57% comment by
   weight and home.js 50%, because the reasoning is written down beside the
   thing it explains, which is the main reason any of it can be changed
   safely a year later. Measured over everything home.html pulls in:

       as written     309KB gzipped
       comments out   106KB gzipped   (a 203KB saving, 66%)

   style.css alone goes 133KB -> 30KB. That is the largest single improvement
   available to the site and it costs nothing anyone can see.

   ----------------------------------------------------------------------
   Why a parser and not a regular expression

   Because a regular expression cannot tell a comment from something that
   merely looks like one, and the failures are silent. In JavaScript, "//"
   lives inside every https:// string on the site, inside regex literals, and
   inside template strings. In CSS it can appear inside a url() or a quoted
   font name. A naive strip deletes the rest of those lines and ships a file
   that parses but behaves differently — the worst possible outcome, since it
   would reach production looking fine.

   terser and clean-css parse properly. Both are asked ONLY to drop comments:
   no renaming, no reordering, no rewriting of values. The output is the same
   program with the prose removed, which keeps this reviewable — a stack trace
   still points at recognisable code, and nothing here can change behaviour.

   ----------------------------------------------------------------------
   Why it is safe to run in place

   Netlify builds from a fresh clone in a container and publishes the working
   directory (publish = "." in netlify.toml), so rewriting files here touches
   that throwaway checkout and nothing else. Your own copy is never involved.

   To make sure of it, this REFUSES TO RUN outside Netlify's build. Run by
   hand it prints what it would have done and exits. Without that guard, one
   absent-minded `node tools/build-minify.js` would strip every comment out
   of the working tree, and the diff would be far too large to review — you
   would be choosing between losing the annotations and losing the day's work.
   Pass --force if you ever genuinely want that locally. */
const fs = require("fs");
const path = require("path");
const { minify } = require("terser");
const CleanCSS = require("clean-css");

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["js", "css"];

// Netlify sets both of these in every build; nothing else does.
const onNetlify = process.env.NETLIFY === "true" || Boolean(process.env.DEPLOY_PRIME_URL);
const forced = process.argv.includes("--force");
const dryRun = !onNetlify && !forced;

const kb = n => (n / 1024).toFixed(1) + "KB";

async function minifyJs(source, file) {
    const result = await minify(source, {
        compress: false,          // no rewriting of logic
        mangle: false,            // names survive, so traces stay readable
        format: { comments: false },
        sourceMap: false
    });
    if (typeof result.code !== "string") throw new Error("terser returned nothing for " + file);
    return result.code;
}

function minifyCss(source, file) {
    /* Comments and whitespace only — every other optimisation off.

       `all: false` switches off the whole of level 1 (value rewriting, unit
       and colour shortening, duplicate-property removal) and specialComments
       is then turned back on by itself. Level 2, which merges and reorders
       rules, is never enabled at all: style.css depends on source order in
       places — the narrow-layout block at the end deliberately restates
       earlier rules in order to beat them — and a minifier that helpfully
       merged duplicate selectors would silently change which rule wins.

       Measured on style.css: 133KB gzipped -> 27KB, no warnings. Level 0 on
       its own does NOT strip comments, which is worth knowing: it looks like
       the conservative choice and saves almost nothing (133KB -> 130KB). */
    const out = new CleanCSS({ level: { 1: { all: false, specialComments: 0 } } }).minify(source);
    if (out.errors && out.errors.length) throw new Error(file + ": " + out.errors.join("; "));
    return out.styles;
}

(async () => {
    let before = 0;
    let after = 0;
    const rows = [];

    for (const dir of DIRS) {
        const abs = path.join(ROOT, dir);
        if (!fs.existsSync(abs)) continue;
        for (const name of fs.readdirSync(abs)) {
            if (!/\.(js|css)$/.test(name)) continue;
            const file = path.join(abs, name);
            const source = fs.readFileSync(file, "utf8");
            let output;
            try {
                output = name.endsWith(".js")
                    ? await minifyJs(source, name)
                    : minifyCss(source, name);
            } catch (err) {
                /* A file that will not parse is left exactly as it is rather
                   than failing the build. Shipping one unminified file is a
                   slower page; failing the deploy over it takes the whole
                   site down for a saving nobody asked for. It is reported
                   loudly enough to be fixed. */
                console.error("  !! " + dir + "/" + name + " left as-is: " + err.message);
                before += Buffer.byteLength(source);
                after += Buffer.byteLength(source);
                continue;
            }
            before += Buffer.byteLength(source);
            after += Buffer.byteLength(output);
            rows.push([dir + "/" + name, Buffer.byteLength(source), Buffer.byteLength(output)]);
            if (!dryRun) fs.writeFileSync(file, output, "utf8");
        }
    }

    rows.sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]));
    console.log(dryRun ? "build-minify (DRY RUN — not on Netlify, nothing written)" : "build-minify");
    for (const [name, b, a] of rows.slice(0, 8)) {
        console.log("  " + name.padEnd(28) + kb(b).padStart(9) + " -> " + kb(a).padStart(9));
    }
    if (rows.length > 8) console.log("  ... and " + (rows.length - 8) + " more");
    console.log("  " + "TOTAL".padEnd(28) + kb(before).padStart(9) + " -> " + kb(after).padStart(9)
        + "   (" + Math.round((1 - after / before) * 100) + "% smaller)");
    if (dryRun) console.log("\n  Nothing was written. Netlify runs this with NETLIFY=true; use --force to write here.");
})().catch(err => {
    console.error("build-minify failed:", err);
    process.exit(1);
});

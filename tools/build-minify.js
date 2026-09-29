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

/* THE BUILD STAMP (28 Sept 2026). Every page carries
   <meta name="mazerats:build" content="dev">, which js/error-report.js sends
   with each report so /warren's Errors tab can say which deploy a failure
   began with. Here, on Netlify only (the same dryRun guard as everything
   else in this file), "dev" becomes the commit's first seven characters and
   the build time, e.g. "a1b2c3d 2026-10-03T09:14Z".

   In this file rather than a step of its own so that netlify.toml's build
   command does not change: this already runs on every deploy, already
   refuses to touch a working copy, and already rewrites files in the
   throwaway clone. share.js reads home.html from the function bundle, which
   Netlify packs AFTER the build command, so the page it serves is stamped
   too. A page without the placeholder is left alone; one that has it and is
   not stamped is not a reason to fail a deploy, so a miss is only logged. */
const BUILD_META = /(<meta name="mazerats:build" content=")dev(">)/;

function buildStamp() {
    const commit = String(process.env.COMMIT_REF || "").slice(0, 7) || "nocommit";
    return commit + " " + new Date().toISOString().slice(0, 16) + "Z";
}

function stampPages() {
    const stamp = buildStamp();
    const stamped = [];
    for (const name of fs.readdirSync(ROOT)) {
        if (!/\.html$/.test(name)) continue;
        const file = path.join(ROOT, name);
        const html = fs.readFileSync(file, "utf8");
        if (!BUILD_META.test(html)) continue;
        if (!dryRun) fs.writeFileSync(file, html.replace(BUILD_META, "$1" + stamp + "$2"), "utf8");
        stamped.push(name);
    }
    console.log((dryRun ? "build stamp (DRY RUN) " : "build stamp ") + JSON.stringify(stamp) + " -> " + (stamped.join(", ") || "no pages"));
}

(async () => {
    try {
        stampPages();
    } catch (err) {
        console.error("  !! the build stamp was not applied: " + err.message);
    }
    let before = 0;
    let after = 0;
    const rows = [];
    const failed = [];

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
                /* A file that will not parse FAILS THE BUILD, once every
                   other file has been tried so the log names them all.

                   It used to be left as-is and the build carried on, on the
                   reasoning that one unminified file is only a slower page.
                   But a file terser cannot parse is almost always a file the
                   BROWSER cannot parse either — a real syntax error that
                   would ship and take its page down — and the "reported
                   loudly" line sat in a build log nobody reads on a green
                   deploy. netlify.toml's own note says a terser failure is
                   meant to be "a signal worth stopping for"; the catch here
                   quietly swallowed it and exited 0. A failed deploy leaves
                   the last good one live, which is the safe outcome. */
                console.error("  !! " + dir + "/" + name + " will not parse: " + err.message);
                failed.push(dir + "/" + name);
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
    // Non-zero even on a dry run, so the same syntax error shows up when the
    // script is run by hand before a push.
    if (failed.length) {
        console.error("\nbuild-minify: " + failed.length + " file(s) would not parse: " + failed.join(", "));
        process.exit(1);
    }
})().catch(err => {
    console.error("build-minify failed:", err);
    process.exit(1);
});

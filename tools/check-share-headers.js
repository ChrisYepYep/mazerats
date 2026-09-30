/* Build check: the share function's page headers match the site's.

   /maze/<slug>, /event/<slug> and /guides/<slug> are home.html served by
   netlify/functions/share.js, and Netlify does not apply netlify.toml's
   [[headers]] to a function's response — so the function carries its own
   copy of them. A copy is a thing that drifts: tighten the CSP in
   netlify.toml and the archive at /home gets it while the same page at a
   maze's address quietly does not; loosen it and the page at /maze/<slug>
   breaks where /home works.

   This reads the "/*" block out of netlify.toml and fails the build when
   any of its values differs from share.js's. Run by the build command.

   Run by hand:  node tools/check-share-headers.js */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const toml = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
const { _test } = require(path.join(root, "netlify", "functions", "share.js"));

// From `for = "/*"` to the next table, comments and all; the comment lines
// are dropped before the values are read.
const block = /\[\[headers\]\]\s*\n\s*for\s*=\s*"\/\*"\s*\n\s*\[headers\.values\]\s*\n([\s\S]*?)(?=\n\s*\[|$)/.exec(toml);
if (!block) {
    console.error('check-share-headers: could not find the [[headers]] for = "/*" block in netlify.toml.');
    process.exit(1);
}
const site = {};
block[1].split("\n").forEach(line => {
    const m = /^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"\s*$/.exec(line);
    if (m) site[m[1]] = m[2];
});
if (!site["Content-Security-Policy"]) {
    console.error("check-share-headers: no Content-Security-Policy found in netlify.toml's \"/*\" headers; the parse is out of date.");
    process.exit(1);
}

const problems = [];
Object.keys(site).forEach(k => {
    if (_test.PAGE_HEADERS[k] !== site[k]) problems.push(`  ${k}\n    netlify.toml: ${site[k]}\n    share.js:     ${_test.PAGE_HEADERS[k] || "(missing)"}`);
});
/* And the other direction (30 Sept 2026). A header dropped from netlify.toml
   — or renamed there — used to pass, because only the toml's own keys were
   compared: share.js went on sending the old one and the two pages differed
   exactly as this file exists to prevent. Content-Type is share.js's own. */
Object.keys(_test.PAGE_HEADERS).forEach(k => {
    if (k === "Content-Type" || k in site) return;
    problems.push(`  ${k}\n    netlify.toml: (missing)\n    share.js:     ${_test.PAGE_HEADERS[k]}`);
});
if (problems.length) {
    console.error("check-share-headers: netlify/functions/share.js serves home.html with headers that differ from netlify.toml's:\n" + problems.join("\n"));
    console.error("Copy netlify.toml's values into PAGE_HEADERS in share.js.");
    process.exit(1);
}
console.log(`check-share-headers: ${Object.keys(site).length} headers match.`);

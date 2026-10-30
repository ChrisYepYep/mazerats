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
/* And the pages kept out of search by share.js's header (10 Oct 2026).
   robots.txt no longer Disallows /glyphs or /profile, so their link cards
   reach X and LinkedIn; the X-Robots-Tag share.js sends is all that keeps
   them out of an index. Dropping one from NOINDEX_PAGES would publish it
   to search with nothing said. */
const noindex = _test.NOINDEX_PAGES;
const robotsTxt = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
["glyphs", "profile"].forEach(page => {
    const blocked = new RegExp(`^\\s*Disallow:\\s*/${page}\\s*$`, "mi").test(robotsTxt);
    if (!blocked && !(noindex && noindex.has(page))) {
        console.error(`check-share-headers: /${page} is neither Disallowed in robots.txt nor in share.js's NOINDEX_PAGES, so it would be indexed.`);
        process.exit(1);
    }
});
/* And the games on a switch (26 Oct 2026; SWITCHED in share.js): /fallinfurni
   and /scout are indexable only while live, and hidden Scout's Trail is the
   archive's own page, not its card. /fallinfurni/play is kept out for good by
   netlify.toml's header, since a header cannot follow the switch. */
if (!_test.switchedPage || !_test.switchState) {
    console.error("check-share-headers: share.js no longer exports switchedPage/switchState; the games' noindex rule is unchecked.");
    process.exit(1);
}
const rules = [];
const origin = "https://mazerats.net";
const sw = (page, state) => _test.switchedPage(page, _test.switchState(page, state === undefined ? null : { fallinFurniState: state, ratRaceState: state }, state === null), origin);
[
    ["fallinfurni", "live", false], ["fallinfurni", "coming-soon", true], ["fallinfurni", "maintenance", true], ["fallinfurni", null, true],
    ["scout", "live", false], ["scout", "maintenance", true], ["scout", "hidden", true], ["scout", null, true]
].forEach(([page, state, noindex]) => {
    const a = sw(page, state);
    if (a.noindex !== noindex) rules.push(`  /${page} while ${state || "unreadable"}: ${a.noindex ? "noindex" : "indexable"}, should be ${noindex ? "noindex" : "indexable"}`);
});
if (sw("scout", "hidden").tags !== null) rules.push("  /scout while hidden carries the game's card; it should be the archive's own page");
if (/one run/.test(sw("fallinfurni", "coming-soon").tags.description)) rules.push("  /fallinfurni's Coming Soon card says the game is there to play");
if (!/\[\[headers\]\]\s*\n\s*for\s*=\s*"\/fallinfurni\/play"\s*\n\s*\[headers\.values\]\s*\n\s*X-Robots-Tag\s*=\s*"noindex/.test(toml)) {
    rules.push("  netlify.toml no longer sends X-Robots-Tag: noindex for /fallinfurni/play");
}
/* No picture characters in a card's words (30 Oct 2026, the bug scan):
   Discord and the rest have no font for them. See plainGlyphs in share.js. */
{
    const card = _test.tagsFor("maze", { id: "m", name: "*ÕMaze EmpireÕ*", creator: "Rat ª", description: "Find the ª sign." }, origin, "maze-empire");
    if (card.title !== "Maze Empire") rules.push(`  a glyph-framed name previews as ${JSON.stringify(card.title)}, not "Maze Empire"`);
    if (card.description !== "Built by Rat. Find the sign.") rules.push(`  a card's description keeps its picture characters: ${JSON.stringify(card.description)}`);
}
if (rules.length) {
    console.error("check-share-headers: the games' switched pages (SWITCHED in netlify/functions/share.js) break their rule:\n" + rules.join("\n"));
    process.exit(1);
}
if (problems.length) {
    console.error("check-share-headers: netlify/functions/share.js serves home.html with headers that differ from netlify.toml's:\n" + problems.join("\n"));
    console.error("Copy netlify.toml's values into PAGE_HEADERS in share.js.");
    process.exit(1);
}
console.log(`check-share-headers: ${Object.keys(site).length} headers match.`);

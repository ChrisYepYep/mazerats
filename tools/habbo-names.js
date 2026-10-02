/* Builds netlify/functions/_habbo-names.json: every Origins furni's display
   name and description by classname (1 Oct 2026).

   For the Warren's add-by-hand picker, so it can offer furni FurniIndex
   hasn't catalogued yet (see furni-catalogue.js, ?unlisted=1). Two sources:
     - Origins' own furnidata, floor and wall items: the list of what exists.
     - the client's external_texts, which name what the furnidata leaves
       blank: wall items, and posters (poster_<id>, which the furnidata files
       under one class, "poster").
   The texts are read from the offline client's copy; pass --texts <path> to
   use another.

   usage: node tools/habbo-names.js [--texts <external_texts.txt>] */

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const textsArg = argv.indexOf("--texts");
const TEXTS = textsArg > -1 ? argv[textsArg + 1]
    : path.join(process.env.USERPROFILE || "", "Documents", "Offline Client", "_offline", "gamedata", "external_texts.txt");
const FURNIDATA = "https://origins.habbo.com/gamedata/furnidata_xml/1";
const OUT = path.join(__dirname, "..", "netlify", "functions", "_habbo-names.json");
const PLACEHOLDER = /^(active_placeholder|item_placeholder)$/;

const unesc = s => s.replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

(async () => {
    const res = await fetch(FURNIDATA, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MazeRats/1.0; +https://mazerats.net)", Accept: "application/xml" } });
    if (!res.ok) throw new Error("furnidata " + res.status);
    const xml = await res.text();
    const names = {};   // class -> [name, description]
    const re = /<furnitype id="\d+" classname="([^"]+)">([\s\S]*?)<\/furnitype>/g;
    const tag = (b, t) => { const m = b.match(new RegExp("<" + t + ">([\\s\\S]*?)</" + t + ">")); return m ? unesc(m[1].trim()) : ""; };
    let m;
    while ((m = re.exec(xml))) names[m[1]] = [tag(m[2], "name"), tag(m[2], "description")];

    const texts = {};
    for (const line of fs.readFileSync(TEXTS, "utf8").split(/\r?\n/)) {
        const t = line.match(/^(?:furni_(.+)|wallitem_(.+)|(poster_\d+))_(name|desc)=(.*)$/);
        if (!t) continue;
        const cls = t[1] || t[2] || t[3];
        if (PLACEHOLDER.test(cls)) continue;
        texts[cls] = texts[cls] || ["", ""];
        texts[cls][t[4] === "name" ? 0 : 1] = t[5].trim();
    }
    /* The client's texts win: they are what the game itself shows (the
       in-room furni list reads "Glass Square Window", the furnidata
       "Square Glass Window"). The furnidata fills in where they are silent;
       posters come from the texts alone. */
    for (const [cls, [n, d]] of Object.entries(texts)) {
        if (names[cls]) {
            if (n) names[cls][0] = n;
            if (d) names[cls][1] = d;
        } else if (/^poster_\d+$/.test(cls) && n) names[cls] = [n, d];
    }
    const out = {};
    // A name that is itself an untranslated text key ("furni_x_name") is no name.
    for (const cls of Object.keys(names).sort()) if (names[cls][0] && !/_name$/.test(names[cls][0])) out[cls] = names[cls];
    fs.writeFileSync(OUT, JSON.stringify(out) + "\n");
    console.log(`${Object.keys(out).length} named furni -> ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)}KB)`);
})().catch(e => { console.error(e.message); process.exit(1); });

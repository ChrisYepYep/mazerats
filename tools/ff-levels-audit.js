/* Measures every level and puts the hand-tuned ones beside the generated ones.

   This exists because looking at forty-nine rooms one at a time does not tell
   you which of them are wrong -- it tells you which ones you happen to be
   looking at. Counting does. Every room is reduced to the same ten numbers,
   and where the two groups differ by a lot there is a rule in the hand-built
   rooms that the generator has not been told.

   It has earned its keep twice. Plants came out at 4.9 a room against a
   hand-tuned 1.8, which found three separate places the shells were planting
   things; and stacked items sat at 0.0 against 1.0, which is how the booths
   ended up with something standing on the bar.

   The columns:

     decor   pieces in the room, rollers and mats aside
     cls     distinct classes -- how much repetition there is
     fam     distinct furni FAMILIES, which is whether the room is dressed
             from one set or five
     plant   the one that keeps going wrong
     lamp    lights
     mat     doormats, carpets, grass
     stk     pieces sitting on top of something else
     queue   rollers from the door
     zone%   how much of the room is floor to play on
     block%  how much of the room a piece stands on

   usage:
     node tools/ff-levels-audit.js                  measure what is published
     node tools/ff-levels-audit.js --from out.json  measure a build before it
                                                    is written. Levels 1-20
                                                    still come from the
                                                    database, or the group
                                                    being compared against is
                                                    the generator's own work.

   REPO and the site both assume the dev server on :8888, the same as the
   other tools here. */
const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..");
global.window = {};
require(path.join(REPO, "js", "room-layouts.js"));
eval(fs.readFileSync(path.join(REPO, "js", "furni-library.js"), "utf8"));
const LAYOUTS = global.window.RoomLayouts;

const bare = (c) => String(c).replace(/\*\d+$/, "");
/* The family a class belongs to: the token Habbo names the range with,
   leading or trailing. Counting these is how you see whether a room is
   dressed from one set or five. */
const TRAIL = /_(polyfon|dpolyfon|armas|silo2|silo|norja2|norja|plasto|plasty|frostframe|diner|autumn)$/;
const LEAD = /^([a-z]+?)_/;
function family(c) {
    const b = bare(c);
    const t = TRAIL.exec(b);
    if (t) return t[1];
    const l = LEAD.exec(b);
    return l ? l[1] : b;
}
const PLANT = /plant|tree|bonsai|flower|cactus|yukka|pineapple|giftflowers/;
const LAMP = /lamp|light|candle|torch|lantern|chandel|lmp|frplc|fountain|bulb/;
const MAT = /doormat|carpet|rug|grass/;
const QUEUE = /^queue_tile/;

(async () => {
    const meta = (await fetch("http://localhost:8888/.netlify/functions/furni-meta").then(r => r.json())).items || {};
    /* --from reads a built file instead of the database, so a change can be
       measured before it is written. Levels the file does not carry come
       from the database. */
    const fromAt = process.argv.indexOf("--from");
    const r = await fetch("http://localhost:8888/.netlify/functions/ff-levels").then(r => r.json());
    let ls = (r.levels || r);
    if (fromAt > -1) {
        const f = JSON.parse(fs.readFileSync(process.argv[fromAt + 1], "utf8"));
        const built = new Map((Array.isArray(f) ? f : f.levels).map(l => [l.order, l]));
        // only above the lock: 1-20 must stay the hand-tuned rooms, or the
        // group being compared against is the generator's own output
        ls = ls.map(l => (l.order > 20 && built.get(l.order)) || l);
    }
    ls = ls.sort((a, b) => a.order - b.order);

    const rows = [];
    for (const l of ls) {
        const model = LAYOUTS.get(l.model || "a");
        const tiles = model.tiles;
        const decor = (l.decor || []).filter(d => !QUEUE.test(d.className));
        const fams = new Map();
        let plants = 0, lamps = 0, mats = 0, stacked = 0, blocked = 0;
        for (const d of decor) {
            const b = bare(d.className);
            if (PLANT.test(b)) plants++;
            else if (LAMP.test(b)) lamps++;
            else if (MAT.test(b)) mats++;
            else fams.set(family(d.className), (fams.get(family(d.className)) || 0) + 1);
            if (Number(d.z) > 0) stacked++;
            const m = meta[d.className] || {};
            if (!m.stand) blocked += Math.max(1, (m.x || 1) * (m.y || 1));
        }
        const zone = (l.zones || [])[0] && l.zones[0].area;
        const zoneTiles = zone ? zone.w * zone.h : 0;
        const queue = (l.decor || []).filter(d => QUEUE.test(d.className)).length;
        rows.push({
            n: l.order, name: l.name, model: l.model || "a", tiles,
            decor: decor.length,
            classes: new Set(decor.map(d => d.className)).size,
            fams: fams.size,
            top: [...fams].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ":" + v).join(" "),
            plants, lamps, mats, stacked, queue,
            zonePct: Math.round(100 * zoneTiles / tiles),
            blockPct: Math.round(100 * blocked / tiles)
        });
    }

    const hdr = "  #  name                      model  room decor cls fam plant lamp mat stk queue zone% block%  families";
    console.log(hdr);
    const line = (r) => "  " + String(r.n).padStart(2) + " " + r.name.padEnd(25) + " " + r.model
        + "     " + String(r.tiles).padStart(4) + String(r.decor).padStart(6) + String(r.classes).padStart(4)
        + String(r.fams).padStart(4) + String(r.plants).padStart(6) + String(r.lamps).padStart(5)
        + String(r.mats).padStart(4) + String(r.stacked).padStart(4) + String(r.queue).padStart(6)
        + String(r.zonePct).padStart(6) + String(r.blockPct).padStart(7) + "  " + r.top;
    for (const row of rows) console.log(line(row));

    const avg = (set, k) => (set.reduce((s, r) => s + r[k], 0) / set.length).toFixed(1);
    const hand = rows.filter(r => r.n <= 20), gen = rows.filter(r => r.n > 20);
    console.log("\n                decor  cls  fam plant lamp  mat  stk queue zone% block%");
    for (const [label, set] of [["hand-tuned 1-20", hand], ["generated 21-49", gen]]) {
        console.log(label.padEnd(16)
            + avg(set, "decor").padStart(5) + avg(set, "classes").padStart(5) + avg(set, "fams").padStart(5)
            + avg(set, "plants").padStart(6) + avg(set, "lamps").padStart(5) + avg(set, "mats").padStart(5)
            + avg(set, "stacked").padStart(5) + avg(set, "queue").padStart(6)
            + avg(set, "zonePct").padStart(6) + avg(set, "blockPct").padStart(7));
    }
})();

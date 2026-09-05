/* Builds the Habbo Hogwarts map from the connection sheet.

   tools/hogwarts-data.json is the truth — ninety-three rooms and the
   ninety-six teleports between them, transcribed from the spreadsheet. This
   works out where each one goes on the parchment and writes the result into
   the database as rooms and footprint trails.

   The layout grows OUTWARD from the front door.

   The first version of this laid the castle out as one band per floor,
   dungeons at the bottom and the seventh floor at the top. It was a correct
   picture and a boring one: everything fanned rightward off a spine on the
   left, and reading the map meant scrolling sideways past eight parallel
   lines of names. A castle should not read like a spreadsheet.

   So the Entrance sits in the middle, because that is where you come in,
   and everything else radiates from it in whatever direction there is room
   for — up, down, back on itself. A corridor and its four classrooms become
   a branch with four twigs; a floor becomes a limb. The shape you end up
   looking at is the shape of the place, and no two parts of it point the
   same way.

     node tools/build-hogwarts.js              # lay it out, report, write nothing
     node tools/build-hogwarts.js --write      # commit it to the database
     node tools/build-hogwarts.js --preview    # also draw a PNG to look at

   Re-running is safe. Rooms are matched by their sheet id and updated, so
   the positions are recomputed but anything written by hand in the admin —
   a description, a picture, whether the room is hidden — is left alone.
*/

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const PREVIEW = argv.includes("--preview");
const REPLACE = argv.includes("--replace");

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "hogwarts-data.json"), "utf8"));

/* The parchment, in its own pixels. Everything below is worked out in these
   and converted to percentages at the end, because that is how the map
   stores a position — see netlify/functions/wizard.js.

   Nearly square, where the banded version was wide: a layout that grows in
   every direction needs room in every direction, and a 16:9 sheet would
   simply squash the top and bottom of it. Generous overall, because the
   thing that made the old one hard to read close up was rooms too near each
   other, and there is no cost to a larger sheet — nothing is stored in
   pixels and the whole thing is fitted to the window when it opens. */
const W = 5400;
const H = 4600;

// Cut out of the original drawing by tools/slice-map.js — a real footprint
// from the map this replaces, so the trails are lettered in the same hand
// even though nothing else on the sheet survives.
const FOOTPRINT = "assets/img/wizard/footprint.png";

/* The bank of footprint sprites, if the drawing has been sliced. Twelve
   real shoes — six left, six right, across a range of sizes — so a trail
   reads as somebody having walked it rather than as one sprite repeated.
   Absent is fine: the map falls back to the single sprite above, and to a
   plain oval if there is not even that. */
const BANK = (() => {
    const slice = path.join(__dirname, ".cache", "wizard-slice.json");
    if (!fs.existsSync(slice)) return [];
    try {
        return JSON.parse(fs.readFileSync(slice, "utf8")).footprints || [];
    } catch (e) {
        return [];
    }
})();

const rooms = DATA.rooms.map(r => ({ ...r }));
const byId = new Map(rooms.map(r => [r.id, r]));
const links = DATA.connections;

const neighbours = new Map(rooms.map(r => [r.id, []]));
for (const c of links) {
    neighbours.get(c.from).push(c.to);
    neighbours.get(c.to).push(c.from);
}
const degreeOf = id => neighbours.get(id).length;

/* The name as it should read on the map.

   The sheet writes every room as "Place - Room", which is exactly right for
   a spreadsheet and far too repetitive for a drawing: ninety-three labels
   that all begin "Hogwarts - " is ninety-three labels nobody can scan. So
   the place becomes the note — shown only where it disambiguates, and in
   the search — and the room keeps the label to itself. */
function splitName(full) {
    const dash = full.indexOf(" - ");
    if (dash === -1) return { name: full, note: "" };
    return { name: full.slice(dash + 3), note: full.slice(0, dash) };
}

/* A number between 0 and 1 that depends only on the room's id.

   Used everywhere below that wants an arbitrary value. Math.random would do
   the same job once, and produce a completely different map on the next
   run: somebody would nudge four labels into place in the editor, rebuild,
   and find the whole castle rearranged around them. Derived from the id,
   the layout is the same every time. */
function jitter(id, salt) {
    let h = 2166136261;
    for (const ch of id + ":" + salt) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
}

/* How big a name is lettered. Taken from how many places it connects to,
   which on this map is a good proxy for how much it matters: the Grand
   Staircases and the Entrance Hall are junctions with five or six ways out,
   a classroom at the end of a corridor has one. The original drawing does
   the same thing by hand — ENTRANCE and Great Hall lettered large, a
   corridor small — and this is that rule written down.

   The Entrance is the exception, and lettered largest of all. It is the way
   in, it is the middle of the map, and it only has two ways out of it — so
   the rule that serves every other room would have made the one place a
   visitor is looking for the same size as a broom cupboard. */
const ENTRANCE_SIZE = 3.2;

/* Four sizes, not a sliding scale.

   A formula on the number of connections gave every room a slightly
   different size and so gave the map no hierarchy at all: ninety-three
   labels, all a little bigger or smaller than each other, read as
   ninety-three labels. Steps read as ranks. A junction is plainly a
   junction, a corridor is plainly lesser, and a room at the end of a
   passage is plainly a leaf — and you can tell which is which at a glance
   without reading a word.

   The steps are also what decides how a connection is drawn. See
   linkStyle. */
const SIZES = [
    { min: 5, size: 2.4 },     // the great junctions — Grand Staircases, Entrance Hall
    { min: 3, size: 1.75 },    // halls and branching corridors
    { min: 2, size: 1.15 },    // a corridor that carries on
    { min: 0, size: 0.9 }      // the end of the line
];

function sizeOf(room) {
    if (room.id === ROOT) return ENTRANCE_SIZE;
    return SIZES.find(s => degreeOf(room.id) >= s.min).size;
}

// A room with three or more ways out of it. The map's skeleton is made of
// these, and so is everything below that treats them differently.
const HUB_DEGREE = 3;
const isHub = id => id === ROOT || degreeOf(id) >= HUB_DEGREE;

/* How a connection is drawn: walked, or ruled.

   Between two junctions is a route somebody takes — a way through the
   castle — and it gets footprints. Off a junction into a classroom at the
   end of a passage is not a route, it is a door, and it gets the thin pen
   stroke instead.

   That single rule is what unclutters the map. Before it, every one of the
   ninety-six connections was a line of footprints and the sheet was a mass
   of them; now the two dozen that carry the shape of the place are walked,
   and the rest are quiet marks between a name and its neighbour. It is also
   what the original drawing does — footprints along the corridors, a small
   curved stroke from a corridor to the room off it. */
function linkStyle(link) {
    return isHub(link.from) && isHub(link.to) ? "walk" : "line";
}

// How much of the sheet a label covers, in per cent. The same numbers the
// stylesheet letters it with: 22px of Caveat at the room's own size, a
// character of that hand averaging 0.44 of its size.
function labelWidth(room) {
    const chars = splitName(room.name).name.length;
    return (chars * 0.44 * 22 * sizeOf(room)) / W * 100;
}

function labelHeight(room) {
    return (26 * sizeOf(room)) / H * 100;
}

// ---------- placing ----------

/* Springs, not rows and not rings.

   Two arrangements were tried before this one and both were wrong in the
   same way. Bands — one per floor — put every room in a level line and made
   the map a spreadsheet you read left to right. A radial tree, grown out
   from the front door, fixed the linearity and introduced a worse problem:
   this graph begins as a CHAIN (Entrance, Crossroads, Viaduct, Courtyard
   Entrance…) before it branches, so the first several rings hold one or two
   rooms each and the whole castle ends up crammed into one quadrant a long
   way from the middle.

   What actually suits it is what suits any tree: let every room push every
   other room away, let the teleports between them pull like springs, and
   leave it to settle. Corridors come out as strands, a hall with four
   classrooms comes out as a flower, the floors separate because they are
   only joined at the staircase, and nothing is in a line with anything
   else. That is the sprawl of the original drawing, and it arrives on its
   own rather than being arranged.

   Fruchterman-Reingold, in the classic form: repulsion between every pair,
   attraction along every edge, and a temperature that limits how far
   anything may move on each pass and cools to nothing — which is what turns
   a jitter into a settling. */

// The distance the springs are happy at, from the area each room has to
// itself. The standard choice, and it means the layout fills the sheet
// rather than needing to be scaled up to it afterwards.
const IDEAL = Math.sqrt((W * H) / rooms.length) * 1.25;

/* Which rooms can reach which. The sheet says Privet Drive is joined to
   nothing, and two groups that cannot reach each other have no springs
   between them — so left in one simulation they would drift apart forever,
   pushed by repulsion with nothing to pull them back. Each group is settled
   on its own and placed afterwards. */
function components() {
    const seen = new Set();
    const groups = [];
    for (const room of rooms) {
        if (seen.has(room.id)) continue;
        const group = [];
        const queue = [room.id];
        seen.add(room.id);
        while (queue.length) {
            const id = queue.pop();
            group.push(byId.get(id));
            for (const next of neighbours.get(id)) {
                if (!seen.has(next)) { seen.add(next); queue.push(next); }
            }
        }
        groups.push(group);
    }
    return groups.sort((a, b) => b.length - a.length);
}

function settle(group, rounds) {
    const inGroup = new Set(group.map(r => r.id));
    const edges = links.filter(c => inGroup.has(c.from) && inGroup.has(c.to));

    /* Started on a circle rather than at random or all in a heap. A heap has
       no directions in it for the repulsion to act along; true random takes
       far longer to untangle and can settle with two branches crossed over
       each other. A ring, in the order the sheet lists them, starts it
       already spread out and never crosses. */
    group.forEach((room, i) => {
        const angle = (i / group.length) * Math.PI * 2;
        const spread = IDEAL * Math.sqrt(group.length) * 0.4;
        room.px = Math.cos(angle) * spread + (jitter(room.id, "seed") - 0.5) * IDEAL;
        room.py = Math.sin(angle) * spread + (jitter(room.id, "seed2") - 0.5) * IDEAL;
    });

    // Cools from "a room may cross a third of the sheet in one pass" to
    // nothing, which is what lets the arrangement be decided early and only
    // tidied late.
    let temperature = IDEAL * 2.2;
    const cooling = temperature / (rounds + 1);

    for (let round = 0; round < rounds; round++) {
        for (const room of group) { room.fx = 0; room.fy = 0; }

        // Everything pushes everything.
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const a = group[i], b = group[j];
                let dx = a.px - b.px, dy = a.py - b.py;
                let dist = Math.hypot(dx, dy);
                if (dist < 0.01) {
                    // Two rooms exactly on top of each other have no
                    // direction to separate along; nudge them off each other.
                    dx = (jitter(a.id, "nudge") - 0.5) || 0.5;
                    dy = (jitter(b.id, "nudge") - 0.5) || 0.5;
                    dist = Math.hypot(dx, dy);
                }
                const push = (IDEAL * IDEAL) / dist;
                a.fx += (dx / dist) * push; a.fy += (dy / dist) * push;
                b.fx -= (dx / dist) * push; b.fy -= (dy / dist) * push;
            }
        }

        // And a teleport pulls the two rooms it joins together.
        for (const edge of edges) {
            const a = byId.get(edge.from), b = byId.get(edge.to);
            const dx = a.px - b.px, dy = a.py - b.py;
            const dist = Math.hypot(dx, dy) || 0.01;
            const pull = (dist * dist) / IDEAL;
            a.fx -= (dx / dist) * pull; a.fy -= (dy / dist) * pull;
            b.fx += (dx / dist) * pull; b.fy += (dy / dist) * pull;
        }

        for (const room of group) {
            const force = Math.hypot(room.fx, room.fy) || 0.01;
            const step = Math.min(force, temperature);
            room.px += (room.fx / force) * step;
            room.py += (room.fy / force) * step;
        }
        temperature -= cooling;
    }
}

/* Fits a settled group into a rectangle of the sheet.

   The simulation works in its own space and has no idea how big the
   parchment is, so what comes out has to be moved and scaled onto it.
   Scaled by the SAME factor in both directions — the shape it settled into
   is the whole point, and stretching it to fill a rectangle of a different
   proportion would shear every flower into an ellipse. */
function fitInto(group, box) {
    const xs = group.map(r => r.px), ys = group.map(r => r.py);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(
        (box.x1 - box.x0) / ((maxX - minX) / W * 100 || 1),
        (box.y1 - box.y0) / ((maxY - minY) / H * 100 || 1)
    );
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    for (const room of group) {
        room.x = cx + ((room.px - midX) / W * 100) * scale;
        room.y = cy + ((room.py - midY) / H * 100) * scale;
    }
}

const groups = components();
const ROOT = "R001";                 // Hogwarts - Entrance

// The castle and everything joined to it. Given nearly the whole sheet.
settle(groups[0], 700);
fitInto(groups[0], { x0: 6, y0: 6, x1: 94, y1: 92 });

/* Privet Drive, and anything else the sheet leaves unattached. Settled on
   its own and set down in a corner — an island drawn as an island, which is
   what it is until somebody finds the teleport that joins it on. */
for (const group of groups.slice(1)) {
    settle(group, 300);
    fitInto(group, { x0: 78, y0: 84, x1: 97, y1: 97 });
}

/* Pushing apart what the springs left touching.

   The simulation knows rooms as points, and a point has no width. A name
   twenty characters long reaches a good deal further than the point it is
   centred on, so two rooms the springs left a comfortable distance apart
   can still have their labels overlapping. This is the pass that reads them
   as rectangles and shoves the overlapping pairs apart, along whichever
   axis needs the least to clear.

   Small moves, so the arrangement the springs found survives it. */
function separate(rounds) {
    for (let round = 0; round < rounds; round++) {
        let worst = 0;
        for (let i = 0; i < rooms.length; i++) {
            for (let j = i + 1; j < rooms.length; j++) {
                const a = rooms[i], b = rooms[j];
                const needX = (labelWidth(a) + labelWidth(b)) / 2 + 1.6;
                const needY = (labelHeight(a) + labelHeight(b)) / 2 + 2.0;
                const dx = b.x - a.x, dy = b.y - a.y;
                if (Math.abs(dx) >= needX || Math.abs(dy) >= needY) continue;
                const pushX = needX - Math.abs(dx);
                const pushY = needY - Math.abs(dy);
                if (pushX / needX < pushY / needY) {
                    const shove = (dx >= 0 ? 1 : -1) * pushX / 2 * 0.55;
                    a.x -= shove; b.x += shove;
                    worst = Math.max(worst, pushX);
                } else {
                    const shove = (dy >= 0 ? 1 : -1) * pushY / 2 * 0.55;
                    a.y -= shove; b.y += shove;
                    worst = Math.max(worst, pushY);
                }
            }
        }
        for (const room of rooms) {
            room.x = Math.max(3, Math.min(97, room.x));
            room.y = Math.max(3, Math.min(97, room.y));
        }
        if (worst < 0.05) break;
    }
}

separate(500);


// ---------- trails ----------

/* Every connection becomes a footprint trail, bowed slightly rather than
   ruled straight.

   Two reasons, and the second is the one that matters. A hand-drawn map has
   no straight lines in it, so a bow is what makes these belong on the
   parchment at all. But it is also what keeps two trails between the same
   pair of rooms — or a trail passing behind a third room — from lying on
   top of each other, because each one is bowed by a different amount. */
function trailFor(link, index) {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    // Alternating sides, and proportional to length: a long trail across the
    // castle can afford a generous curve, a short hop between a hall and its
    // common room would look silly with one.
    const bow = (index % 2 ? 1 : -1) * Math.min(4.5, length * 0.13);
    const mid = [
        (from.x + to.x) / 2 - (dy / (length || 1)) * bow,
        (from.y + to.y) / 2 + (dx / (length || 1)) * bow
    ];
    return {
        id: link.id.toLowerCase(),
        from: from.id.toLowerCase(),
        to: to.id.toLowerCase(),
        points: [[round(from.x), round(from.y)], [round(mid[0]), round(mid[1])], [round(to.x), round(to.y)]],
        secret: !!link.secret,
        exit: link.exit,
        kind: link.type,
        notes: link.notes,
        style: linkStyle(link)
    };
}

const round = v => Math.round(v * 100) / 100;

const trails = links.map(trailFor);

// ---------- the records ----------

/* At what zoom a room's name appears.

   Ninety-three labels on one sheet is not a map you can read at a glance —
   it is a wall of handwriting, and the opening view of it says nothing.
   What makes it readable is admitting that they are not all equally
   important and letting the map say so over three steps:

     - The junctions are always there. The three Grand Staircases, the
       Entrance Hall, the corridors that branch four ways: these are the
       shape of the castle, and at the opening view they are all you see.
     - The corridors and halls arrive as you come in, at about a third of
       the way to full zoom.
     - The leaves — a classroom at the end of a corridor, a common room
       behind a hall — arrive last, when you are close enough to be reading
       one part of the castle rather than looking at all of it.

   How many ways out a room has is what decides which tier it is in, and it
   turns out to be a good judge: on this map the busy rooms really are the
   ones worth seeing first. The original drawing does the same thing by
   hand, lettering ENTRANCE and Great Hall large and a corridor small; this
   is the same idea given a third dimension to work in.

   Two tiers rather than three, after looking at three. Reserving the
   opening view for junctions alone left nine names on a sheet the size of a
   table — technically legible, and not a map. Everything that leads
   somewhere else is worth seeing at once; it is the dead ends, which are
   two thirds of the castle, that can wait until you are close enough to
   care which classroom is which. */
const BAND_FOR_DEGREE = [
    { min: 2, from: null },
    { min: 0, from: 1.8 }
];

// A handful of places that anchor a region rather than a junction. The
// Entrance is the way in and the Train Station is how most people arrive;
// neither has the connections to earn its place by the rule above, and a
// map that opened without them would be missing its front door.
const ALWAYS_SHOWN = new Set(["R001", "R003", "R087", "R090", "R033"]);

function zoomBandFor(room) {
    if (ALWAYS_SHOWN.has(room.id)) return null;
    const degree = degreeOf(room.id);
    return BAND_FOR_DEGREE.find(b => degree >= b.min).from;
}

const roomRecords = rooms.map(room => {
    const { name, note } = splitName(room.name);
    return {
        kind: "room",
        // The sheet's own R-number, lower-cased, so every record on the map
        // can be traced back to the row it came from — and so re-running
        // this updates rather than duplicates.
        id: room.id.toLowerCase(),
        name,
        note: note === "Hogwarts" ? "" : note,
        fullName: room.name,
        floor: floorLabel(room),
        // The front door is marked as such, and the stylesheet gives it a
        // rule beneath the name so it reads as the way in rather than as
        // simply another large label.
        status: room.id === ROOT ? "entrance" : (room.status || ""),
        x: round(room.x),
        y: round(room.y),
        size: Math.round(sizeOf(room) * 100) / 100,
        rotation: 0,
        align: "center",
        hidden: false,
        fromZoom: zoomBandFor(room),
        toZoom: null
    };
});

/* A trail appears when both the rooms it runs between have appeared.

   Any earlier and it is a line of footprints walking from a name to
   nothing, which reads as a fault in the map rather than as detail still to
   come. So it takes the later of its two ends. */
const bandOf = new Map(roomRecords.map(r => [r.id, r.fromZoom]));
for (const trail of trails) {
    // null means "always", so it contributes nothing to how late this is.
    const ends = [bandOf.get(trail.from), bandOf.get(trail.to)].filter(z => z != null);
    trail.fromZoom = ends.length ? Math.max(...ends) : null;
}

function floorLabel(room) {
    if (room.zone !== "castle") {
        return { hogsmeade: "Hogsmeade", grounds: "Grounds", approach: "Approach", express: "Hogwarts Express", privet: "Privet Drive", secret: "Secret" }[room.zone] || "";
    }
    const f = room.floor;
    if (f === "dungeon") return "Dungeons";
    if (f === "ground") return "Ground Floor";
    if (f === "staircase") return "Grand Staircase";
    return { 1: "First Floor", 2: "Second Floor", 3: "Third Floor", 4: "Fourth Floor", 5: "Fifth Floor", 6: "Sixth Floor", 7: "Seventh Floor" }[f] || "";
}

// ---------- reporting ----------

console.log(`${roomRecords.length} rooms, ${trails.length} trails.`);
console.log("  " + groups.map(g => `${g.length} rooms`).join(" + ") +
    (groups.length > 1 ? " (the second group is joined to nothing — see the sheet)" : ""));

/* How much of the sheet the map actually covers. A layout that settles into
   a tight knot in the middle wastes the parchment and reads as crowded
   however much room there is around it, and that is not visible from a
   count of overlapping pairs. */
const used = {
    x0: Math.min(...rooms.map(r => r.x)), x1: Math.max(...rooms.map(r => r.x)),
    y0: Math.min(...rooms.map(r => r.y)), y1: Math.max(...rooms.map(r => r.y))
};
console.log(`  spread across ${(used.x1 - used.x0).toFixed(0)}% of the width ` +
    `and ${(used.y1 - used.y0).toFixed(0)}% of the height`);

// Anything still sitting on top of something else, after the separation
// pass. Should be none; reported so that if it ever is not, it says which.
const tight = [];
for (let i = 0; i < roomRecords.length; i++) {
    for (let j = i + 1; j < roomRecords.length; j++) {
        const a = roomRecords[i], b = roomRecords[j];
        const dx = Math.abs(a.x - b.x) * W / 100;
        const dy = Math.abs(a.y - b.y) * H / 100;
        const needX = (a.name.length + b.name.length) * 0.44 * 22 / 2;
        if (dx < needX * 0.55 && dy < 26) tight.push(`${a.name} / ${b.name}`);
    }
}
console.log(`  ${tight.length} pairs sitting close enough to be worth a nudge` +
    (tight.length ? ":\n     " + tight.slice(0, 10).join("\n     ") : ""));

fs.mkdirSync(path.join(__dirname, ".cache"), { recursive: true });
fs.writeFileSync(path.join(__dirname, ".cache", "hogwarts-layout.json"),
    JSON.stringify({ width: W, height: H, rooms: roomRecords, trails }, null, 2));
console.log("  layout → tools/.cache/hogwarts-layout.json");

if (PREVIEW) drawPreview();

if (!WRITE) {
    console.log("\nNothing written to the database. Run again with --write.");
    process.exit(0);
}

// ---------- writing ----------

require("./_env.js").loadEnv(["MONGODB_URI"]);
const { getDb } = require("../netlify/functions/_db.js");

async function commit() {
    const db = await getDb();
    const wizard = db.collection("wizard");
    await wizard.createIndex({ kind: 1, id: 1 }, { unique: true });

    if (REPLACE) {
        const gone = await wizard.deleteMany({});
        console.log(`Cleared ${gone.deletedCount} existing records.`);
    } else {
        /* The map used to hold the fifty-one names read off the drawing,
           under ids made from those names. They are not these rooms — the
           sheet describes ninety-three, with different names and different
           ids — so leaving them would double every corridor on the map.
           Anything not carrying a sheet id goes. */
        const stale = await wizard.deleteMany({
            kind: { $in: ["room", "path"] },
            id: { $not: /^[rc]\d{3}$/ }
        });
        if (stale.deletedCount) console.log(`Removed ${stale.deletedCount} records from the earlier map.`);
    }

    const now = new Date().toISOString();
    /* $set for what this tool owns, $setOnInsert for what a person owns.
       Re-running is meant to recompute the layout; it is NOT meant to wipe
       the description somebody spent an evening writing, or un-hide a room
       they deliberately hid. */
    const ownedByPerson = ["description", "thumb", "image", "hidden", "labelImage"];
    const writes = [];

    for (const room of roomRecords) {
        const $set = { updatedAt: now };
        const $setOnInsert = { createdAt: now };
        for (const [field, value] of Object.entries(room)) {
            if (field === "kind" || field === "id") continue;
            if (ownedByPerson.includes(field)) $setOnInsert[field] = value;
            else $set[field] = value;
        }
        writes.push({ updateOne: { filter: { kind: "room", id: room.id }, update: { $set, $setOnInsert }, upsert: true } });
    }

    for (const trail of trails) {
        writes.push({
            updateOne: {
                filter: { kind: "path", id: trail.id },
                update: {
                    $set: {
                        from: trail.from, to: trail.to, points: trail.points,
                        secret: trail.secret, exit: trail.exit, linkType: trail.kind, style: trail.style,
                        notes: trail.notes, fromZoom: trail.fromZoom, updatedAt: now
                    },
                    $setOnInsert: { createdAt: now, toZoom: null }
                },
                upsert: true
            }
        });
    }

    /* The sheet's own size is this tool's to set — it is derived from how
       much writing has to fit — but the title, the sprite and how densely
       the footprints are laid are somebody's choices, so they are only
       written when the record is being created. */
    writes.push({
        updateOne: {
            filter: { kind: "map" },
            update: {
                $set: {
                    id: "map", width: W, height: H, minZoom: 1, maxZoom: 8,
                    /* Where the map opens: on the Entrance, a little way in
                       rather than fitted whole. A sheet this size shown
                       entire is a diagram of a castle; shown from the front
                       door at a readable size it is somewhere you have just
                       arrived, with the rest of it running off the edges
                       waiting to be followed. Zoom 1 is still the whole
                       thing, one press of the fit button away. */
                    startX: round(byId.get(ROOT).x),
                    startY: round(byId.get(ROOT).y),
                    startZoom: 1.9,
                    updatedAt: now
                },
                $setOnInsert: {
                    createdAt: now, title: "Habbo Hogwarts",
                    footprint: FOOTPRINT, footprintSpacing: 1.1, footprintSize: 0.9,
                    credit: "Map created by ChrisYepYep"
                }
            },
            upsert: true
        }
    });

    /* And the one exception to that. A map record already exists from
       before the footprint sprite had been cut out of the drawing, so it is
       carrying an empty one — and $setOnInsert will never touch it again.
       This fills in a blank without overwriting a choice. */
    writes.push({
        updateOne: {
            filter: { kind: "map", $or: [{ footprint: "" }, { footprint: { $exists: false } }] },
            update: { $set: { footprint: FOOTPRINT, footprintSpacing: 1.1, footprintSize: 0.9 } }
        }
    });

    /* The bank of footprint sprites, taken straight from the last slice of
       the original drawing. This one IS the tool's to overwrite: it is
       derived art, regenerated whenever the drawing is re-cut, and there is
       nothing in it anybody would have edited by hand. */
    if (BANK.length) {
        writes.push({
            updateOne: {
                filter: { kind: "map" },
                update: { $set: { footprints: BANK, footprintSpacing: 0, footprintSize: 1 } }
            }
        });
    }

    const result = await wizard.bulkWrite(writes, { ordered: false });
    console.log(`Wrote: ${result.upsertedCount} new, ${result.modifiedCount} updated.`);
    process.exit(0);
}

/* A picture of the layout, for judging it without a browser and a database
   in between. Same habit as the contact sheet in tools/slice-map.js: a
   number of overlapping pairs tells you something is wrong, and only a
   picture tells you what. */
function drawPreview() {
    const { encodePng } = require("./png-encode.js");
    const sx = 1500 / W, sy = 950 / H;
    const w = 1500, h = 950;
    const px = Buffer.alloc(w * h * 4).fill(255);
    for (let i = 0; i < w * h; i++) {
        px[i * 4] = 232; px[i * 4 + 1] = 220; px[i * 4 + 2] = 194; px[i * 4 + 3] = 255;
    }
    const dot = (x, y, r, g, b) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = (y * w + x) * 4;
        px[i] = r; px[i + 1] = g; px[i + 2] = b;
    };
    for (const trail of trails) {
        const pts = trail.points.map(([x, y]) => [x / 100 * W * sx, y / 100 * H * sy]);
        for (let t = 0; t <= 1; t += 0.004) {
            const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
            const x = a * pts[0][0] + b * pts[1][0] + c * pts[2][0];
            const y = a * pts[0][1] + b * pts[1][1] + c * pts[2][1];
            const shade = trail.secret ? [170, 130, 150] : [150, 120, 100];
            dot(x, y, ...shade);
            dot(x + 1, y, ...shade);
        }
    }
    for (const room of roomRecords) {
        const x = room.x / 100 * W * sx;
        const y = room.y / 100 * H * sy;
        const half = room.name.length * 0.44 * 22 * room.size * sx / 2;
        const tall = 13 * room.size * sy;
        for (let dx = -half; dx <= half; dx++) { dot(x + dx, y - tall, 90, 60, 45); dot(x + dx, y + tall, 90, 60, 45); }
        for (let dy = -tall; dy <= tall; dy++) { dot(x - half, y + dy, 90, 60, 45); dot(x + half, y + dy, 90, 60, 45); }
    }
    fs.writeFileSync(path.join(__dirname, ".cache", "hogwarts-preview.png"), encodePng(w, h, px));
    console.log("  preview → tools/.cache/hogwarts-preview.png");
}

commit().catch(err => { console.error(err.message); process.exit(1); });

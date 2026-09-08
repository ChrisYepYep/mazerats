/* Builds the Sorcerer's Atlas from the connection sheet.

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
     node tools/build-hogwarts.js --write --prune   # ALSO delete anything not from the sheet

   Re-running is safe. Rooms are matched by their sheet id and updated, so
   the positions are recomputed but anything written by hand in the admin —
   a description, a picture, whether the room is hidden — is left alone. So
   are trails drawn by hand in the editor, and pictures, which move along
   with the room they were placed beside rather than being left behind at a
   position that no longer means anything.

   --prune is the exception and it deletes: it removes every room and trail
   that did not come from the sheet. It exists for rebuilding over the
   original drawing's leftovers and it is not what you want on a map anybody
   has since worked on.
*/

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const PREVIEW = argv.includes("--preview");
const REPLACE = argv.includes("--replace");
// Deletes rooms and trails that did not come from the sheet — which means
// anything added by hand in the editor. Off by default; see commit().
const PRUNE = argv.includes("--prune");

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

   Small moves, so the arrangement the springs found survives it.

   The two clearances are the map's elbow room, and they are the single
   number that decides whether it reads as crowded. They were 1.6 and 2.0 —
   just enough that no two names actually touched, which is a different
   thing from there being room between them. At that setting the tightest
   pairs sat 2.5% of the sheet apart while the emptiest quarter of the
   parchment held nothing at all: not a map that was too small, a map whose
   rooms were bunched. More than doubled, so a name has space around it for a
   picture to be put beside it later without having to move the name first.

   Not larger than this, and the limit is arithmetic rather than taste:
   ninety-three names, at the size the stylesheet letters them, need about
   half the parchment between them at this clearance. Asking for much more
   does not spread the map — it makes the pass impossible to satisfy, and
   what it does then is shove rooms off the edge of the sheet and fold the
   corridors back over each other on the way. */
const CLEAR_X = 3.6;
const CLEAR_Y = 4.2;

/* Rooms this pass is not allowed to move. Empty until the rings have been
   opened out; see shapeRings for why they are then held still. */
const PINNED = new Set();

function separate(rounds) {
    for (let round = 0; round < rounds; round++) {
        let worst = 0;
        for (let i = 0; i < rooms.length; i++) {
            for (let j = i + 1; j < rooms.length; j++) {
                const a = rooms[i], b = rooms[j];
                const aPin = PINNED.has(a.id), bPin = PINNED.has(b.id);
                // Two pinned rooms have already been given room for each
                // other, and neither may give way in any case.
                if (aPin && bPin) continue;
                const needX = (labelWidth(a) + labelWidth(b)) / 2 + CLEAR_X;
                const needY = (labelHeight(a) + labelHeight(b)) / 2 + CLEAR_Y;
                const dx = b.x - a.x, dy = b.y - a.y;
                if (Math.abs(dx) >= needX || Math.abs(dy) >= needY) continue;
                const pushX = needX - Math.abs(dx);
                const pushY = needY - Math.abs(dy);
                // Whichever of the pair is free takes the whole of the move.
                const aShare = aPin ? 0 : (bPin ? 1 : 0.5);
                const bShare = bPin ? 0 : (aPin ? 1 : 0.5);
                if (pushX / needX < pushY / needY) {
                    const shove = (dx >= 0 ? 1 : -1) * pushX * 0.55;
                    a.x -= shove * aShare; b.x += shove * bShare;
                    worst = Math.max(worst, pushX);
                } else {
                    const shove = (dy >= 0 ? 1 : -1) * pushY * 0.55;
                    a.y -= shove * aShare; b.y += shove * bShare;
                    worst = Math.max(worst, pushY);
                }
            }
        }
        for (const room of rooms) {
            if (PINNED.has(room.id)) continue;
            room.x = Math.max(3, Math.min(97, room.x));
            room.y = Math.max(3, Math.min(97, room.y));
        }
        if (worst < 0.05) break;
    }
}

separate(500);

/* ---------- untangling ----------

   The springs make a good shape and give no thought whatever to whether two
   trails cross, because nothing in that model knows a trail exists. Three of
   them crossed. On a map like this a crossing is the one fault that cannot
   be read past: it draws a junction where the castle has no junction, and a
   reader has to work out which of the two lines they are following.

   What makes it fixable is the shape of the sheet's own graph. Ninety-six
   connections, and sixty-five of them are BRIDGES — cut one and the castle
   falls into two pieces that touch nowhere else. The rest sit in just two
   rings: the corridors round the Grand Staircase, and the long loop out
   through Honeydukes and the one-eyed witch.

   So a crossing that involves a bridge can always be undone by taking the
   smaller of the two pieces and swinging it round the room it hangs from,
   like a door on its hinge, until it points at somewhere empty. Nothing
   inside the piece moves relative to anything else in it, so the
   arrangement the springs found survives whole; the only thing that changes
   is which way it points. That is also why this is safe to re-run when the
   sheet gains rooms — it does not depend on where anything happened to
   land, only on which edges are bridges.

   It is a search, not a construction, so it is checked rather than assumed:
   the count it reaches is printed at the end, and the build says so loudly
   if it ever fails to reach nought. */

/* The control point that gives a trail its bow. Stated once, here, because
   two things need it and they must agree: the trail that gets drawn, and the
   crossing check that decides whether the layout is finished. When the check
   used the straight line instead, it passed a map that had four crossings
   on it.

   Alternating sides, and proportional to length: a long trail across the
   castle can afford a generous curve, a short hop between a hall and its
   common room would look silly with one. */
function trailMid(from, to, index) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const bow = (index % 2 ? 1 : -1) * Math.min(4.5, length * 0.13);
    return [
        (from.x + to.x) / 2 - (dy / (length || 1)) * bow,
        (from.y + to.y) / 2 + (dx / (length || 1)) * bow
    ];
}

// Proper crossing only: segments that share an endpoint room meet there by
// design, and touching at a tip is not a crossing.
function segmentsCross(p1, p2, p3, p4) {
    const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const d1 = side(p3, p4, p1), d2 = side(p3, p4, p2);
    const d3 = side(p1, p2, p3), d4 = side(p1, p2, p4);
    return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}

const at = id => { const r = byId.get(id); return [r.x, r.y]; };

/* The shape a trail is actually DRAWN as, which is not the straight line
   between two rooms — it is bowed (see trailFor). Checking the chord instead
   of the curve is checking a different map: an early run of this reported a
   clean sheet and the drawing still had four crossings on it, all of them
   between two lines whose straight versions missed each other and whose
   bows did not. Same three points the trail is built from, sampled. */
const CURVE_STEPS = 10;

function trailCurve(link, index) {
    const from = byId.get(link.from), to = byId.get(link.to);
    const [mx, my] = trailMid(from, to, index);
    const pts = [];
    for (let i = 0; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS, u = 1 - t;
        pts.push([
            u * u * from.x + 2 * u * t * mx + t * t * to.x,
            u * u * from.y + 2 * u * t * my + t * t * to.y
        ]);
    }
    return pts;
}

function crossingList() {
    // Sampled once per call, with a box round each, because the pairwise
    // test below is ninety-six squared and most of those pairs are at
    // opposite ends of the castle.
    const curves = links.map((l, i) => {
        const pts = trailCurve(l, i);
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        return { link: l, pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });

    const out = [];
    for (let i = 0; i < curves.length; i++) {
        for (let j = i + 1; j < curves.length; j++) {
            const A = curves[i], B = curves[j];
            const a = A.link, b = B.link;
            // Two trails out of the same room meet there by design.
            if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
            if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
            let hit = false;
            for (let m = 0; m < A.pts.length - 1 && !hit; m++) {
                for (let n = 0; n < B.pts.length - 1 && !hit; n++) {
                    if (segmentsCross(A.pts[m], A.pts[m + 1], B.pts[n], B.pts[n + 1])) hit = true;
                }
            }
            if (hit) out.push([a, b]);
        }
    }
    return out;
}

/* Which connections are bridges, and what hangs beyond each one.

   Tarjan's low-link, iteratively — the castle is only ninety-three rooms
   deep but a recursive walk over somebody else's data is a stack overflow
   waiting to be someone else's problem. */
function findBridges() {
    const disc = new Map(), low = new Map(), parentEdge = new Map();
    const bridge = new Set();
    let clock = 0;
    for (const start of rooms) {
        if (disc.has(start.id)) continue;
        const stack = [[start.id, 0]];
        disc.set(start.id, clock); low.set(start.id, clock); clock++;
        parentEdge.set(start.id, null);
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const [u, i] = frame;
            const nbrs = neighbours.get(u);
            if (i < nbrs.length) {
                frame[1]++;
                const v = nbrs[i];
                const key = u < v ? u + "|" + v : v + "|" + u;
                if (key === parentEdge.get(u)) continue;
                if (disc.has(v)) { low.set(u, Math.min(low.get(u), disc.get(v))); continue; }
                parentEdge.set(v, key);
                disc.set(v, clock); low.set(v, clock); clock++;
                stack.push([v, 0]);
            } else {
                stack.pop();
                const pk = parentEdge.get(u);
                if (!pk) continue;
                const p = pk.split("|").find(x => x !== u) || pk.split("|")[0];
                low.set(p, Math.min(low.get(p), low.get(u)));
                // Nothing below u reaches back past its parent, so the edge
                // that got here is the only way in.
                if (low.get(u) > disc.get(p)) bridge.add(pk);
            }
        }
    }
    return bridge;
}

const BRIDGES = findBridges();
const edgeKey = link => (link.from < link.to ? link.from + "|" + link.to : link.to + "|" + link.from);

// Everything reachable from `side` without using the bridge — the piece that
// swings.
function pieceBeyond(link, side) {
    const blocked = edgeKey(link);
    const seen = new Set([side]);
    const queue = [side];
    while (queue.length) {
        const id = queue.pop();
        for (const next of neighbours.get(id)) {
            const key = id < next ? id + "|" + next : next + "|" + id;
            if (key === blocked || seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
        }
    }
    return [...seen];
}

function swing(ids, pivot, angle) {
    const [cx, cy] = at(pivot);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    // The sheet is not square and these are percentages of two different
    // lengths, so a rotation has to happen in real proportions or it shears.
    const k = W / H;
    for (const id of ids) {
        const r = byId.get(id);
        const dx = (r.x - cx) * k, dy = r.y - cy;
        r.x = cx + (dx * cos - dy * sin) / k;
        r.y = cy + (dx * sin + dy * cos);
    }
}

// The connections along one route between two rooms. Any of them that is a
// bridge is a hinge that turns one end relative to the other.
const linkBetween = new Map();
for (const l of links) linkBetween.set(edgeKey(l), l);

function routeBetween(fromId, toId) {
    const cameFrom = new Map([[fromId, null]]);
    const queue = [fromId];
    while (queue.length) {
        const id = queue.shift();
        if (id === toId) break;
        for (const next of neighbours.get(id)) {
            if (cameFrom.has(next)) continue;
            cameFrom.set(next, id);
            queue.push(next);
        }
    }
    if (!cameFrom.has(toId)) return [];
    const out = [];
    let cur = toId;
    while (cameFrom.get(cur)) {
        const prev = cameFrom.get(cur);
        const l = linkBetween.get(prev < cur ? prev + "|" + cur : cur + "|" + prev);
        if (l) out.push(l);
        cur = prev;
    }
    return out;
}

function untangle(passes) {
    /* Positions round the hinge to try. Thirty-two rather than sixteen: with
       the coarser set the last crossing on the sheet had no swing that
       cleared it, and every one of the arrangements either side of the
       answer was worse — so the search stopped one move short and reported a
       map with a crossing still in it. */
    const angles = [];
    for (let i = 1; i < 32; i++) angles.push((i / 32) * Math.PI * 2);

    /* Every candidate is judged on where the map ACTUALLY ends up, which
       means settling the labels before counting. The first version counted
       immediately after the swing and took the first move that looked like
       an improvement — and then ran the separation pass, which shoved the
       piece it had just placed and put the crossing back. It sat at three
       for sixty passes doing this. Undoing a trial therefore has to restore
       the whole sheet, not just the piece that swung. */
    const snapshot = () => rooms.map(r => [r.x, r.y]);
    const restore = s => rooms.forEach((r, i) => { r.x = s[i][0]; r.y = s[i][1]; });

    for (let pass = 0; pass < passes; pass++) {
        const crossings = crossingList();
        if (!crossings.length) return 0;
        const before = crossings.length;
        const start = snapshot();

        /* Which hinges are worth trying for a given crossing.

           Not just the two connections that cross. The crossing that held
           this at two was the Greenhouse and Hagrid's Hut lying across the
           trails round the Entrance, and neither of those connections is the
           one at fault — the whole GROUNDS branch was on the wrong side of
           the castle, and the hinge that moves it is Crossroads→Grounds,
           which is nowhere near either crossing line.

           So: every bridge on the way from one crossing line to the other.
           Cutting any of them puts the two lines on opposite sides, which is
           precisely what it means for swinging there to move one relative to
           the other. Anything further away moves them both together and
           cannot help. */
        const options = [];
        const offer = (link, side, pivot) => {
            const ids = pieceBeyond(link, side);
            if (!ids.length || ids.length >= rooms.length - 1) return;
            if (ids.some(id => PINNED.has(id))) return;             // never swing a ring
            if (ids.includes(pivot)) return;
            if (options.some(o => o.pivot === pivot && o.ids.length === ids.length)) return;
            options.push({ ids, pivot });
        };
        for (const [a, b] of crossings) {
            for (const link of [a, b]) {
                if (!BRIDGES.has(edgeKey(link))) continue;
                offer(link, link.to, link.from);
                offer(link, link.from, link.to);
            }
            // The bridges between the two lines, found by walking the route.
            for (const link of routeBetween(a.from, b.from)) {
                if (!BRIDGES.has(edgeKey(link))) continue;
                offer(link, link.to, link.from);
                offer(link, link.from, link.to);
            }
        }
        options.sort((p, q) => p.ids.length - q.ids.length);

        let best = null;
        for (const opt of options) {
            for (const angle of angles) {
                swing(opt.ids, opt.pivot, angle);
                separate(60);
                const n = crossingList().length;
                const onSheet = Math.min(...rooms.map(r => Math.min(r.x, 100 - r.x, r.y, 100 - r.y)));
                // Off the edge of the parchment is not an improvement.
                if (onSheet > 1.5 && (!best || n < best.n)) best = { n, state: snapshot() };
                restore(start);
                if (best && best.n === 0) break;
            }
            if (best && best.n === 0) break;
        }

        if (!best || best.n >= before) return before;   // nothing on offer helps
        restore(best.state);
    }
    return crossingList().length;
}

/* ---------- opening the rings ----------

   Swinging a piece on its hinge fixes a crossing that involves a bridge,
   and every crossing left after the first attempt involved a RING edge
   instead — the corridors round the Grand Staircase, and the long loop out
   through Honeydukes. That is not the same fault and it does not have the
   same cure.

   The springs treat a cycle as six rooms that all want to be near each
   other, which is true, and draw it as a knot, which is a fold. A cycle
   wants to be a LOOP: laid open so you can see it is one, with its inside
   empty. Nothing in a force model says so, so it has to be said here.

   These are the only two places on the sheet where it matters — sixty-five
   of the ninety-six connections are bridges, and every non-bridge sits in
   one of two rings sharing the Grand Staircase between them. Twenty-seven
   rooms out of ninety-three, small enough to lay out on their own and check
   exhaustively, which is what this does: settle the ring by itself, count
   its own crossings, and keep the first arrangement that has none. A few
   hundred attempts on twenty-seven rooms is nothing, and an answer that has
   been checked beats an answer that was argued for.

   What comes out is then turned and scaled onto where the springs had
   already put those rooms, so the ring keeps the place in the castle the
   rest of the map expects it to be in — and everything hanging off it is
   carried along with the room it hangs from, rather than being left behind
   pointing at where its corridor used to be. */

function ringGroups() {
    const inRing = new Map(rooms.map(r => [r.id, null]));
    const ringEdges = links.filter(l => !BRIDGES.has(edgeKey(l)));
    const near = new Map(rooms.map(r => [r.id, []]));
    for (const l of ringEdges) { near.get(l.from).push(l.to); near.get(l.to).push(l.from); }

    const groups = [];
    for (const room of rooms) {
        if (inRing.get(room.id) !== null || !near.get(room.id).length) continue;
        const ids = [];
        const queue = [room.id];
        inRing.set(room.id, groups.length);
        while (queue.length) {
            const id = queue.pop();
            ids.push(id);
            for (const next of near.get(id)) {
                if (inRing.get(next) !== null) continue;
                inRing.set(next, groups.length);
                queue.push(next);
            }
        }
        groups.push({ ids, edges: ringEdges.filter(l => ids.includes(l.from) && ids.includes(l.to)) });
    }
    return groups;
}

// Everything that hangs off `id` and is not part of the ring itself — the
// branch that has to travel with it.
function hangingOff(id, ringSet) {
    const seen = new Set([id]);
    const out = [];
    const queue = [id];
    while (queue.length) {
        const cur = queue.pop();
        for (const next of neighbours.get(cur)) {
            if (seen.has(next)) continue;
            // Never step into another room of the ring: that way lies the
            // whole rest of the castle, which does not hang off this room.
            if (ringSet.has(next)) continue;
            seen.add(next);
            out.push(next);
            queue.push(next);
        }
    }
    return out;
}

function ringHasCrossing(group, at2) {
    const es = group.edges;
    for (let i = 0; i < es.length; i++) {
        for (let j = i + 1; j < es.length; j++) {
            const a = es[i], b = es[j];
            if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
            if (segmentsCross(at2(a.from), at2(a.to), at2(b.from), at2(b.to))) return true;
        }
    }
    return false;
}

/* One ring, settled on its own until it comes out unfolded. Same springs as
   the whole map uses, on twenty-seven rooms instead of ninety-three, from a
   different starting ring each time — the starting angles are the only thing
   that changes between attempts, and they are enough. */
function untangledRing(group, tries) {
    const local = new Map(group.ids.map(id => [id, { x: 0, y: 0 }]));
    const at2 = id => { const p = local.get(id); return [p.x, p.y]; };
    const n = group.ids.length;

    for (let attempt = 0; attempt < tries; attempt++) {
        group.ids.forEach((id, i) => {
            const a = ((i * (attempt + 1)) % n) / n * Math.PI * 2;
            local.set(id, { x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
        });
        for (let round = 0; round < 260; round++) {
            const f = new Map(group.ids.map(id => [id, { x: 0, y: 0 }]));
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
                const A = local.get(group.ids[i]), B = local.get(group.ids[j]);
                let dx = A.x - B.x, dy = A.y - B.y;
                let dist = Math.hypot(dx, dy) || 0.01;
                const push = (60 * 60) / dist;
                const fa = f.get(group.ids[i]), fb = f.get(group.ids[j]);
                fa.x += dx / dist * push; fa.y += dy / dist * push;
                fb.x -= dx / dist * push; fb.y -= dy / dist * push;
            }
            for (const e of group.edges) {
                const A = local.get(e.from), B = local.get(e.to);
                const dx = A.x - B.x, dy = A.y - B.y;
                const dist = Math.hypot(dx, dy) || 0.01;
                const pull = (dist * dist) / 60;
                const fa = f.get(e.from), fb = f.get(e.to);
                fa.x -= dx / dist * pull; fa.y -= dy / dist * pull;
                fb.x += dx / dist * pull; fb.y += dy / dist * pull;
            }
            const temp = 40 * (1 - round / 260);
            for (const id of group.ids) {
                const p = local.get(id), force = f.get(id);
                const mag = Math.hypot(force.x, force.y) || 0.01;
                const step = Math.min(mag, temp);
                p.x += force.x / mag * step; p.y += force.y / mag * step;
            }
        }
        if (!ringHasCrossing(group, at2)) return { ok: true, local, attempt: attempt + 1 };
    }
    return { ok: false, local, attempt: tries };
}

function shapeRings() {
    const report = [];
    for (const group of ringGroups()) {
        if (group.ids.length < 3) continue;
        const ringSet = new Set(group.ids);
        const result = untangledRing(group, 400);

        /* Turned and scaled onto where these rooms already were. The best
           single turn is the one that lines the new arrangement up with the
           old one — worked out from the angle between each room's offset
           from the middle before and after, averaged as vectors so that
           angles near a full turn do not cancel out ones near none. */
        const old = group.ids.map(id => byId.get(id));
        const oldC = [old.reduce((s, r) => s + r.x, 0) / old.length, old.reduce((s, r) => s + r.y, 0) / old.length];
        const pts = group.ids.map(id => result.local.get(id));
        const newC = [pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length];

        const k = W / H;
        const oldSpan = Math.max(...old.map(r => Math.hypot((r.x - oldC[0]) * k, r.y - oldC[1]))) || 1;
        const newSpan = Math.max(...pts.map(p => Math.hypot(p.x - newC[0], p.y - newC[1]))) || 1;
        // A ring that has been unfolded needs more room than the knot did.
        let scale = (oldSpan / newSpan) * 1.35;

        /* Blown up until the ring's own names clear each other at this size.

           This is what lets the ring be pinned for the separation pass that
           follows. That pass shoves overlapping labels apart one pair at a
           time and has no idea a ring exists, so given the chance it takes
           the loop that was just opened and folds it straight back up — it
           was doing exactly that, and the crossings it reintroduced were the
           ones this whole section is here to remove. A ring that already has
           room for its own labels never needs to be shoved, so it can be
           held still while everything else moves around it. */
        const need = (a, b) => [
            (labelWidth(a) + labelWidth(b)) / 2 + CLEAR_X,
            (labelHeight(a) + labelHeight(b)) / 2 + CLEAR_Y
        ];
        let grow = 1;
        for (let i = 0; i < group.ids.length; i++) {
            for (let j = i + 1; j < group.ids.length; j++) {
                const [nx0, ny0] = need(old[i], old[j]);
                const dx = Math.abs(pts[i].x - pts[j].x) * scale / k;
                const dy = Math.abs(pts[i].y - pts[j].y) * scale;
                // Clearing on either axis is enough, so the cheaper one sets
                // the requirement.
                grow = Math.max(grow, Math.min(nx0 / (dx || 1e-6), ny0 / (dy || 1e-6)));
            }
        }
        /* Capped, but not tightly. The ring is held still afterwards, so
           whatever room it fails to make for itself here it never gets: at
           2.2 the Grand Staircase still sat on top of the 2nd Floor
           Corridor, and the separation pass is forbidden from touching
           either of them. The cap only exists to stop a ring with two rooms
           almost on top of each other from demanding the whole sheet. */
        /* Exactly what it needs, and no margin on top.

           A margin is the obvious idea, because fitAll below shrinks the
           whole sheet to bring it back inside the parchment and the ring
           shrinks with it. Tried at a tenth and a fifth, and both are worse
           where it counts: a fifth leaves the seventh-floor branch nowhere
           to swing to and the sheet keeps a crossing, and a tenth pushes the
           tightest pair on the map from 4.0% down to 2.3% by crowding
           everything else against the edges. What the margin buys is the
           Grand Staircase and the 2nd Floor Corridor grazing each other by
           six hundredths of one per cent — three pixels of two bounding
           boxes, on a sheet 5400 wide, where the boxes are wider than the
           writing inside them. That is the cheaper of the two faults. */
        scale *= Math.min(grow, 3.2);

        let sx = 0, sy = 0;
        group.ids.forEach((id, i) => {
            const r = old[i], p = pts[i];
            const ao = Math.atan2(r.y - oldC[1], (r.x - oldC[0]) * k);
            const an = Math.atan2(p.y - newC[1], p.x - newC[0]);
            sx += Math.cos(ao - an); sy += Math.sin(ao - an);
        });
        const turn = Math.atan2(sy, sx);
        const cos = Math.cos(turn), sin = Math.sin(turn);

        group.ids.forEach((id, i) => {
            const r = old[i], p = pts[i];
            const dx = (p.x - newC[0]) * scale, dy = (p.y - newC[1]) * scale;
            const nx = oldC[0] + (dx * cos - dy * sin) / k;
            const ny = oldC[1] + (dx * sin + dy * cos);
            const moveX = nx - r.x, moveY = ny - r.y;
            r.x = nx; r.y = ny;
            // The branch off this room goes where the room goes.
            for (const other of hangingOff(id, ringSet)) {
                const o = byId.get(other);
                o.x += moveX; o.y += moveY;
            }
        });
        // Held still from here on, so nothing folds it back up.
        group.ids.forEach(id => PINNED.add(id));
        report.push(`${group.ids.length} rooms` + (result.ok ? ` (unfolded on attempt ${result.attempt})` : " — STILL FOLDED"));
    }
    return report;
}

const RING_REPORT = shapeRings();

/* Back onto the parchment, all of it together.

   Opening the rings grows them, and what grows has to come from somewhere —
   left alone the castle ended up half again as wide as the sheet, with rooms
   at -12% and 130%. That is not merely untidy: untangle() below refuses any
   swing that would put a room off the edge, so a map already hanging over
   both edges leaves it with no legal move anywhere and it gives up with the
   crossings still in it.

   Scaled by ONE factor in both directions and about the middle, so it is a
   photographic reduction: every angle, and so every crossing and every
   not-crossing, is exactly as it was. */
function fitAll() {
    const xs = rooms.map(r => r.x), ys = rooms.map(r => r.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(92 / (maxX - minX || 1), 92 / (maxY - minY || 1), 1);
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    for (const room of rooms) {
        room.x = 50 + (room.x - midX) * scale;
        room.y = 50 + (room.y - midY) * scale;
    }
}
fitAll();

/* ---------- turning the sheet over ----------

   The Entrance is where you come in, and it was coming out on the RIGHT, so
   the castle read right-to-left against the direction anybody scans a page.
   Mirrored, the front door is on the left and the map opens the way it is
   read. Every x becomes 100 minus itself; nothing else changes.

   The names are NOT mirrored, only where they sit — writing reflected in a
   mirror is the one thing on a map nobody can read.

   Done HERE, before the separation and the untangling, and that position is
   the whole point. Mirroring the finished map looked safe — a reflection
   preserves every distance and every incidence, so two lines that did not
   cross cannot be made to cross by turning the paper over — and it put five
   crossings on the sheet, with the build still reporting none.

   Both halves of that were the same mistake. A trail is not the straight
   line between its rooms, it is a curve BOWED to one side, and which side
   comes from whether its index is odd (see trailMid). Mirroring the points
   flips the geometry but not that number, so every trail keeps bowing the
   way it did and the drawing that comes out is not the mirror of the
   original — it is a different drawing, with different crossings. And the
   count had been taken before the flip, so it was describing a map that no
   longer existed.

   From here the mirror is just where the rooms are. Everything downstream —
   the separation, the untangler, the count it reports — works on the sheet
   in its final orientation and is therefore true of what actually gets
   drawn. */
for (const room of rooms) {
    // Not round(): that is declared down with the trails, and a const
    // cannot be used above the line that declares it.
    room.x = Math.round((100 - room.x) * 100) / 100;
}

separate(500);

const CROSSINGS_LEFT = untangle(60);

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
    const mid = trailMid(from, to, index);
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
        return { hogsmeade: "Hogsmeade", grounds: "Grounds", approach: "Approach", express: "The Express", privet: "Privet Drive", secret: "Secret" }[room.zone] || "";
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

/* How much elbow room a room actually has, which is the thing the map was
   short of. Reported as the nearest neighbour of each room rather than as an
   average, because an average is exactly what hid the problem: a sheet with
   a bare quarter and a knot in the middle averages out as comfortable. */
const gaps = rooms.map(r => Math.min(...rooms.filter(o => o !== r)
    .map(o => Math.hypot(r.x - o.x, r.y - o.y)))).sort((a, b) => a - b);
console.log(`  nearest neighbour: tightest ${gaps[0].toFixed(1)}%, ` +
    `typical ${gaps[Math.floor(gaps.length / 2)].toFixed(1)}% of the sheet`);

RING_REPORT.forEach(r => console.log("  ring: " + r));

// The thing untangle() exists for, stated plainly whichever way it went.
if (CROSSINGS_LEFT === 0) {
    console.log("  no trail crosses another");
} else {
    console.log(`  *** ${CROSSINGS_LEFT} trails still cross — the map is wrong, see untangle()`);
}

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
        /* Anything without a sheet id is left alone unless --prune says
           otherwise, and that default is the whole point of this block.

           It used to delete them every time. The reason was sound once: the
           map held fifty-one names read off the original drawing, under ids
           made from those names, and leaving them would have doubled every
           corridor. That was a one-off migration and it is long done.

           What the rule actually matches now is work done by hand. A trail
           drawn in the editor gets an id like `trail-mtotlnpl`, which is not
           a sheet id, so every rebuild silently deleted every connection
           anybody had added — five of them, the day this was noticed, and
           the only reason they came back is that a backup happened to have
           been taken twenty minutes earlier. A tool that recomputes a layout
           has no business deciding that a record it did not create should
           not exist.

           --prune brings the old behaviour back for the one case that still
           wants it: rebuilding onto a map that has the earlier drawing's
           records still on it. It says what it will remove first. */
        const strays = await wizard.find({
            kind: { $in: ["room", "path"] },
            id: { $not: /^[rc]\d{3}$/ }
        }).project({ id: 1, kind: 1, from: 1, to: 1, name: 1 }).toArray();

        if (strays.length && !PRUNE) {
            console.log(`Left alone: ${strays.length} record${strays.length === 1 ? "" : "s"} not from the sheet ` +
                `(added by hand in the editor). Use --prune to delete them instead.`);
        } else if (strays.length) {
            const gone = await wizard.deleteMany({
                kind: { $in: ["room", "path"] },
                id: { $not: /^[rc]\d{3}$/ }
            });
            console.log(`--prune: removed ${gone.deletedCount} records not from the sheet:`);
            strays.forEach(s => console.log(`     ${s.kind} ${s.id} ${s.name || (s.from + " -> " + s.to)}`));
        }
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

    /* A picture goes where its room goes.

       The map carries drawings placed by hand in the editor — the castle
       beside the Entrance, the staircase beside the Grand Staircase — and
       they are held at map coordinates, not attached to anything. This tool
       does not own them and must not move them about on a whim, but it DOES
       move every room, and a rebuild that leaves the castle sitting where
       the Entrance used to be is a rebuild that has quietly broken the map.
       It happened the first time this layout was recomputed.

       So each picture is moved by exactly as much as the nearest room to it
       moved. Nearest as the map is actually shaped, not in raw percentages,
       or a sheet wider than it is tall picks the wrong room. Nothing is
       resized and nothing is re-anchored: a drawing that was a little above
       and to the left of its room is a little above and to the left of it
       afterwards, wherever the room has gone.

       Only the position is touched, so a picture somebody has since moved
       on purpose keeps its own offset and simply travels with its room. */
    const previous = await wizard.find({ kind: "room" }).project({ id: 1, x: 1, y: 1 }).toArray();
    const wasAt = new Map(previous.map(r => [r.id, r]));
    const nowAt = new Map(roomRecords.map(r => [r.id, r]));
    const pictures = await wizard.find({ kind: "layer" }).toArray();
    const moved = [];

    for (const layer of pictures) {
        if (typeof layer.x !== "number" || typeof layer.y !== "number") continue;
        let closest = null;
        for (const old of previous) {
            if (typeof old.x !== "number" || typeof old.y !== "number") continue;
            const dist = Math.hypot((old.x - layer.x) * (W / H), old.y - layer.y);
            if (!closest || dist < closest.dist) closest = { dist, id: old.id };
        }
        if (!closest) continue;
        const before = wasAt.get(closest.id), after = nowAt.get(closest.id);
        if (!before || !after) continue;
        const dx = after.x - before.x, dy = after.y - before.y;
        if (!dx && !dy) continue;
        writes.push({
            updateOne: {
                filter: { kind: "layer", id: layer.id },
                update: { $set: { x: round(layer.x + dx), y: round(layer.y + dy), updatedAt: now } }
            }
        });
        moved.push(`${layer.id} follows ${after.name}`);
    }
    if (moved.length) console.log("  pictures moved with their rooms:\n     " + moved.join("\n     "));

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
                    createdAt: now, title: "The Sorcerer's Atlas",
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

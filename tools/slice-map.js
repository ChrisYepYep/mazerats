/* Cuts the Habbo Hogwarts map into the pieces the interactive version is
   built from.

   The map arrives as one transparent PNG — every room name, every footprint
   trail and the title block, drawn on nothing. That is a picture, and a
   picture cannot be dragged, relabelled or linked. This turns it into
   parts: one small PNG per name, one clean footprint sprite, and the trails
   as lists of points rather than as ink.

   It reads the alpha channel and nothing else, which is why the transparent
   export matters so much more than a flat one: on a parchment background
   every one of these decisions would be a colour-distance guess against a
   mottled, coffee-stained backdrop, and it would be wrong at every edge.
   Against alpha it is exact.

   How it decides what it is looking at:

     1. Every run of touching pixels is a blob. Letters, mostly, and one
        blob per footprint.
     2. Blobs closer together than --word-gap are merged. Letters in a word
        are a few pixels apart; footprints along a trail are twenty-odd, so
        this joins the first and leaves the second alone. That gap IS the
        classifier — everything after it follows from which side a blob
        landed on.
     3. What merged into something wide is text. What stayed small and
        alone is a MAYBE — a footprint, or a letter with nothing near
        enough to hold onto, which on handwriting means every stray dot and
        descender on the sheet.
     4. The maybes are chained nearest-to-nearest. Any that lands in a run
        of three or more is a footprint and the run is a trail; any left
        over was a letter after all, and goes back in with the text.
     5. Text is merged again at --phrase-gap, so "Spiral Staircase II"
        comes out as one label rather than three.

   Step 4 is why the classifier is not simply a size threshold. A size
   threshold has to be wrong about something — a footprint is the same
   handful of pixels as the dot on an i — whereas belonging to a trail is a
   fact about the whole sheet, and settles both at once.

   None of those thresholds is right in the abstract, so the default run
   writes a contact sheet — the whole map with a box round everything it
   found, text in one colour and trails in another — and nothing else. Look
   at it, adjust, look again. Only --write commits the pieces to disk. Same
   habit as tools/furni-verify.js, and for the same reason: a threshold is
   worth arguing with before it is worth trusting.

     node tools/slice-map.js <map.png>                  # report + contact sheet
     node tools/slice-map.js <map.png> --write          # cut it up for real
     node tools/slice-map.js <map.png> --word-gap 7
     node tools/slice-map.js <map.png> --phrase-gap 34
     node tools/slice-map.js <map.png> --trail-gap 70

   The contact sheet lands in tools/.cache/. The pieces land in
   assets/img/wizard/, and the geometry — where every piece sits, as a
   percentage of the map, plus the trails — in tools/.cache/wizard-slice.json,
   which tools/build-hogwarts.js reads for the footprint bank.
*/

const fs = require("fs");
const path = require("path");

const { decodePng } = require("../netlify/functions/_png.js");
const { encodePng } = require("./png-encode.js");

// ---------- arguments ----------

const argv = process.argv.slice(2);
const source = argv.find(a => !a.startsWith("--"));

function flag(name) { return argv.includes("--" + name); }
function option(name, fallback) {
    const at = argv.indexOf("--" + name);
    if (at === -1 || at === argv.length - 1) return fallback;
    const value = Number(argv[at + 1]);
    return Number.isFinite(value) ? value : fallback;
}

if (!source) {
    console.error("Usage: node tools/slice-map.js <map.png> [--write] [--word-gap N] [--phrase-gap N] [--trail-gap N]");
    process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(__dirname, ".cache");
const OUT_DIR = path.join(ROOT, "assets", "img", "wizard");

// ---------- reading ----------

const image = decodePng(fs.readFileSync(source));
const { width: W, height: H, data } = image;
console.log(`${path.basename(source)} — ${W}x${H}`);

/* Every distance below is a fraction of the map's WIDTH, not a number of
   pixels.

   The first version of this used pixels, tuned against a 2000px-wide
   assumption, and the real export turned out to be 5824 across. Nothing was
   subtly off: at nearly three times the scale a footprint is bigger than
   the "this must be text" threshold, so the tool found no footprints at all
   and read every trail on the sheet as writing.

   A drawing has no natural pixel size — this one will be re-exported, and
   probably at a third size — but the gap between two letters relative to
   the width of the page is a property of the drawing itself. So that is
   what these are, and the tool works on whatever comes out of the export
   dialog. The --flags still take plain pixels, for overriding one of them
   against a specific file. */
const REL = {
    phraseGap: 0.016,
    trailGap: 0.0085,
    textMin: 0.0086,
    arcMin: 0.0103,
    trailFit: 0.0035
};

function scaled(name, flagName) {
    const override = option(flagName, null);
    return override == null ? Math.max(2, Math.round(W * REL[name])) : override;
}

const OPTS = {
    // Below this the pixel is background. Not zero: a PNG exported from a
    // drawing program carries a halo of nearly-transparent antialiasing
    // around every stroke, and counting that as ink fattens every blob until
    // neighbouring words touch. Absolute, because alpha is alpha at any size.
    alpha: option("alpha", 24),
    phraseGap: scaled("phraseGap", "phrase-gap"),
    trailGap: scaled("trailGap", "trail-gap"),
    /* Degrees, and permissive. A trail drawn by hand curves gently, so the
       first guess here was seventy — but a footprint on this drawing is two
       marks, a sole and a heel, and consecutive steps are staggered left and
       right of the line of travel. So the walk from mark to mark zigzags by
       design, and a tight limit cuts every trail into a dozen pieces. What
       this is for is the genuine reversal at a crossing, which is close to
       a full turn. */
    trailTurn: option("trail-turn", 115),
    // A blob at least this wide or tall is text rather than a footprint.
    textMin: scaled("textMin", "text-min"),
    // How empty a large blob has to be to read as a connector stroke rather
    // than as a word. A curve fills about a tenth of the rectangle it
    // wanders across; the loosest word on this sheet fills a fifth.
    arcFill: option("arc-fill", 0.15),
    arcMin: scaled("arcMin", "arc-min"),
    // How closely a thinned trail has to follow the footprints it came from.
    // Bigger means fewer control points to drag.
    trailFit: scaled("trailFit", "trail-fit"),
    write: flag("write")
};

console.log(`  gaps: phrase ${OPTS.phraseGap}px, trail ${OPTS.trailGap}px, ` +
    `text over ${OPTS.textMin}px`);

// One byte per pixel: is there ink here. Kept as a flat Uint8Array rather
// than asking the RGBA buffer each time, because every pass below walks the
// whole image and the multiply-by-four adds up over 2.25 million pixels.
const ink = new Uint8Array(W * H);
for (let i = 0, n = W * H; i < n; i++) ink[i] = data[i * 4 + 3] >= OPTS.alpha ? 1 : 0;

const inkCount = ink.reduce((a, b) => a + b, 0);
console.log(`  ${inkCount} inked pixels (${(100 * inkCount / (W * H)).toFixed(1)}% of the sheet)`);

// ---------- blobs ----------

/* Flood fill, eight-connected, iterative. Recursion would be the obvious
   way to write this and would blow the stack on the first long footprint
   trail — a single diagonal stroke here is thousands of pixels deep. */
function findBlobs() {
    const seen = new Uint8Array(W * H);
    const blobs = [];
    const stack = new Int32Array(W * H);
    for (let start = 0, n = W * H; start < n; start++) {
        if (!ink[start] || seen[start]) continue;
        let top = 0;
        stack[top++] = start;
        seen[start] = 1;
        let minX = W, minY = H, maxX = -1, maxY = -1, count = 0;
        while (top > 0) {
            const at = stack[--top];
            const x = at % W, y = (at - x) / W;
            count++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= H) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= W) continue;
                    const next = ny * W + nx;
                    if (ink[next] && !seen[next]) {
                        seen[next] = 1;
                        stack[top++] = next;
                    }
                }
            }
        }
        blobs.push({ minX, minY, maxX, maxY, count, parts: 1, seed: start });
    }
    return blobs;
}

/* Groups blobs that have INK within `gap` of each other.

   The distinction from "bounding boxes within gap of each other" is the
   whole reason this function is what it is. A word of this hand runs
   diagonally across the sheet, so its bounding box is a large rectangle
   mostly full of blank paper — paper that a footprint trail is sitting on.
   Judged by boxes, "Spiral Staircase III" is touching the trail beside it,
   that trail is touching the next word, and one join at seventeen pixels
   swallows fifteen hundred blobs into one. Measured for real, they are a
   hundred pixels apart and nothing of the sort happens.

   Done by dilation rather than by comparing every pair of blobs pixel by
   pixel, which would be the honest O(n²) over a million points. The mask of
   the pool is grown by half the gap in every direction, and whatever is
   connected afterwards was within the gap to begin with. One breadth-first
   pass over the sheet, a couple of seconds, and exact.

   The bookkeeping trick is `seed`: every blob remembers one pixel of
   itself, so which grown region a blob ended up in is a single lookup
   rather than a search. */
function groupByInkDistance(pool, gap) {
    const radius = Math.max(1, Math.round(gap / 2));
    const total = W * H;

    // The pool's own ink, and nothing else's — this is what keeps a
    // grouping of the writing from reaching out and collecting footprints.
    const mask = new Uint8Array(total);
    for (const blob of pool) paintBlob(mask, blob.seed);

    /* Grow it. A queue of pixel indices with their distance, expanded
       eight-ways until `radius` is reached. Uint16 for the distances
       because a radius over sixty-five thousand pixels is not a thing this
       drawing can produce. */
    const dist = new Uint16Array(total).fill(0xffff);
    let frontier = [];
    for (let i = 0; i < total; i++) {
        if (mask[i]) { dist[i] = 0; frontier.push(i); }
    }
    for (let step = 1; step <= radius && frontier.length; step++) {
        const next = [];
        for (const at of frontier) {
            const x = at % W, y = (at - x) / W;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= H) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= W) continue;
                    const k = ny * W + nx;
                    if (dist[k] === 0xffff) { dist[k] = step; next.push(k); }
                }
            }
        }
        frontier = next;
    }

    // Label what is now connected, and read each blob's label off its seed.
    const label = new Int32Array(total);
    let nextLabel = 0;
    const stack = new Int32Array(total);
    for (let start = 0; start < total; start++) {
        if (dist[start] === 0xffff || label[start]) continue;
        nextLabel++;
        let top = 0;
        stack[top++] = start;
        label[start] = nextLabel;
        while (top > 0) {
            const at = stack[--top];
            const x = at % W, y = (at - x) / W;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= H) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= W) continue;
                    const k = ny * W + nx;
                    if (dist[k] !== 0xffff && !label[k]) { label[k] = nextLabel; stack[top++] = k; }
                }
            }
        }
    }

    const groups = new Map();
    for (const blob of pool) {
        const key = label[blob.seed];
        const into = groups.get(key);
        if (!into) {
            groups.set(key, { ...blob, members: [blob] });
        } else {
            into.minX = Math.min(into.minX, blob.minX);
            into.minY = Math.min(into.minY, blob.minY);
            into.maxX = Math.max(into.maxX, blob.maxX);
            into.maxY = Math.max(into.maxY, blob.maxY);
            into.count += blob.count;
            into.parts += blob.parts;
            into.members.push(blob);
        }
    }
    return [...groups.values()];
}

// Fills `mask` with one blob, flooding out from the pixel it remembered.
function paintBlob(mask, seed) {
    const stack = [seed];
    mask[seed] = 1;
    while (stack.length) {
        const at = stack.pop();
        const x = at % W, y = (at - x) / W;
        for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= W) continue;
                const k = ny * W + nx;
                if (ink[k] && !mask[k]) { mask[k] = 1; stack.push(k); }
            }
        }
    }
}

const boxWidth = b => b.maxX - b.minX + 1;
const boxHeight = b => b.maxY - b.minY + 1;
const centreOf = b => [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];

console.log("  finding blobs…");
const blobs = findBlobs();
console.log(`  ${blobs.length} blobs`);

/* The split, made on RAW blobs before anything is merged.

   The first version merged everything at a small gap first and classified
   the results, which cannot work on this drawing and took a look at the
   actual pixels to see why. Blobs are merged by the distance between their
   BOUNDING BOXES, and a word of cursive script running diagonally across
   the sheet has a bounding box covering a great deal of blank paper — paper
   that footprints are sitting on. So "Spiral Staircase III" reached out and
   claimed the trail beside it, that trail reached the next word, and one
   join at seventeen pixels swallowed fifteen hundred blobs into fifty-five.

   Classifying first avoids the whole problem: a footprint is a small mark
   and a letter of this hand is a large one, and neither has to be merged
   with anything to be measured. What the size test gets wrong — the dot on
   an i, the strokes of "III" — the trail test below puts right, because
   belonging to a run of footprints is a fact about the sheet rather than a
   guess about one mark. */
/* Before the writing can be told from the footprints, a third thing has to
   be taken out of the way.

   This map joins some rooms with a trail of footprints and others with a
   single thin curved stroke — Courtyard to Corridor, Grounds to the
   Greenhouses, Room of Requirement to Gryffindor Hall. Those arcs are ink,
   and they run from one name to the next, physically bridging them. So a
   grouping that measures real ink distance — which is the correct measure,
   and the whole reason the previous one was replaced — does exactly what it
   is told and welds nine labels and an arc into one box.

   An arc is easy to recognise once looked at: it is large but nearly empty.
   A curve wanders across a big rectangle filling about a tenth of it, where
   a word of this hand fills a fifth to a half. Nothing else on the sheet is
   shaped like that.

   They are set aside rather than thrown away. Each one is a connection
   somebody drew on purpose, worth as much as the footprint trails, and it
   goes into the seed file for the editor to turn into a real link. */
const isArc = b => Math.max(boxWidth(b), boxHeight(b)) >= OPTS.arcMin
    && b.count / (boxWidth(b) * boxHeight(b)) < OPTS.arcFill;
const arcs = blobs.filter(isArc);
const isText = b => !isArc(b) && (boxWidth(b) >= OPTS.textMin || boxHeight(b) >= OPTS.textMin);
const certainText = blobs.filter(isText);
console.log(`  ${arcs.length} connector strokes set aside`);
/* And the small marks go forward one by one, unmerged.

   A footprint here is drawn as two marks — a sole and a heel — so the
   obvious move is to join them into a shoe before chaining. Measuring the
   sheet says otherwise: the sole and heel of one shoe are about three
   pixels apart, and so are consecutive shoes, because the steps are
   staggered either side of the line of travel. There is no gap that
   separates a shoe from the next one, so any join at all runs the length of
   the trail and turns the whole thing into a single blob.

   So each mark is its own point. A trail comes out with roughly twice the
   points it has footsteps, zigzagging gently between left foot and right,
   and the thinning at the end takes both facts out again. */
const maybePrints = blobs.filter(b => !isText(b) && !isArc(b));
console.log(`  ${certainText.length} certainly text, ${maybePrints.length} to place`);

// ---------- trails ----------

/* Footprints back into paths.

   Each print is joined to every other print within --trail-gap, which for
   this map is comfortably more than the spacing along a trail. That graph's
   connected pieces are the candidate trails.

   Connected, but not necessarily ONE trail: trails on this map cross, and
   two that pass within a footprint of each other arrive here as a single
   group. So the walk that orders a group also watches the angle. Start at
   whichever print is furthest from the middle — an end, on anything that is
   not a closed loop — and step to the nearest print not yet used, but stop
   and begin again wherever the direction turns harder than --trail-turn.
   A trail drawn by hand curves; a junction corners, and that is the whole
   difference between the two.

   Anything left over — a group of one or two — was never a footprint. It
   goes back to the caller as text. */
function buildTrails(boxes) {
    const points = boxes.map(centreOf);
    const parent = points.map((_, i) => i);
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            if (Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) <= OPTS.trailGap) {
                const ri = find(i), rj = find(j);
                if (ri !== rj) parent[ri] = rj;
            }
        }
    }
    const groups = new Map();
    points.forEach((p, i) => {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(i);
    });

    const trails = [];
    const strays = [];
    const maxTurn = (OPTS.trailTurn * Math.PI) / 180;

    for (const group of groups.values()) {
        if (group.length < 3) { strays.push(...group); continue; }

        const cx = group.reduce((s, i) => s + points[i][0], 0) / group.length;
        const cy = group.reduce((s, i) => s + points[i][1], 0) / group.length;
        let startAt = 0, furthest = -1;
        group.forEach((index, i) => {
            const d = Math.hypot(points[index][0] - cx, points[index][1] - cy);
            if (d > furthest) { furthest = d; startAt = i; }
        });

        const left = group.slice();
        let run = [left.splice(startAt, 1)[0]];
        const runs = [run];
        while (left.length) {
            const last = points[run[run.length - 1]];
            let nearest = 0, nearestD = Infinity;
            left.forEach((index, i) => {
                const d = Math.hypot(points[index][0] - last[0], points[index][1] - last[1]);
                if (d < nearestD) { nearestD = d; nearest = i; }
            });
            const next = left.splice(nearest, 1)[0];
            // Two reasons to break the run: the step is a leap rather than a
            // stride (the rest of this group belongs to another trail), or
            // it doubles back (this is a junction, and the walk has just
            // turned up the other arm of it).
            const leap = nearestD > OPTS.trailGap;
            const turns = run.length >= 2 && turnAt(points, run[run.length - 2], run[run.length - 1], next) > maxTurn;
            if (leap || turns) {
                run = [next];
                runs.push(run);
            } else {
                run.push(next);
            }
        }

        for (const found of runs) {
            if (found.length < 3) { strays.push(...found); continue; }
            const ordered = found.map(i => points[i]);
            // The blobs themselves as well as their centres: the sprite bank
            // below has to cut the actual marks out, and a centre is not
            // enough to find them again.
            trails.push({ prints: ordered, marks: found.map(i => boxes[i]), points: thin(ordered, OPTS.trailFit) });
        }
    }

    return { trails, strays: strays.map(i => boxes[i]) };
}

// How sharply the walk turns going a → b → c, in radians. Zero is straight
// on; π is a full reversal.
function turnAt(points, a, b, c) {
    const inX = points[b][0] - points[a][0], inY = points[b][1] - points[a][1];
    const outX = points[c][0] - points[b][0], outY = points[c][1] - points[b][1];
    const dot = inX * outX + inY * outY;
    const cross = inX * outY - inY * outX;
    return Math.abs(Math.atan2(cross, dot));
}

/* Ramer–Douglas–Peucker. A trail of forty footprints does not need forty
   control points to be redrawn — it needs the half-dozen where the curve
   actually turns, which is also the number a person can reasonably drag. */
function thin(points, epsilon) {
    if (points.length < 3) return points.slice();
    let worst = 0, worstAt = 0;
    const [ax, ay] = points[0];
    const [bx, by] = points[points.length - 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < points.length - 1; i++) {
        const d = Math.abs(dy * (points[i][0] - ax) - dx * (points[i][1] - ay)) / len;
        if (d > worst) { worst = d; worstAt = i; }
    }
    if (worst <= epsilon) return [points[0], points[points.length - 1]];
    return [
        ...thin(points.slice(0, worstAt + 1), epsilon).slice(0, -1),
        ...thin(points.slice(worstAt), epsilon)
    ];
}

const { trails, strays } = buildTrails(maybePrints);
const prints = maybePrints.filter(b => !strays.includes(b));
console.log(`  ${trails.length} trails from ${prints.length} footprints, ` +
    `${trails.reduce((s, t) => s + t.points.length, 0)} control points`);
if (strays.length) console.log(`  ${strays.length} strays returned to the text`);

const labels = groupByInkDistance(certainText.concat(strays), OPTS.phraseGap)
    // Reading order, so the numbered files come out in a sequence a person
    // can follow down the sheet rather than in flood-fill order.
    .sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));
console.log(`  ${labels.length} labels after joining at ${OPTS.phraseGap}px`);

// ---------- the contact sheet ----------

/* The original, dimmed, with a box round everything found. Text in amber,
   trails in green, and the trail's own thinned path drawn through it so a
   curve that got straightened out is visible as one.

   Dimmed rather than left alone because the ink and the boxes are otherwise
   the same brown and the whole point is telling them apart. */
function contactSheet() {
    const out = Buffer.alloc(W * H * 4);
    for (let i = 0, n = W * H; i < n; i++) {
        const a = data[i * 4 + 3];
        out[i * 4] = 255; out[i * 4 + 1] = 255; out[i * 4 + 2] = 255;
        out[i * 4 + 3] = 255;
        if (a) {
            const k = 1 - (a / 255) * 0.35;
            out[i * 4] = Math.round(255 * k);
            out[i * 4 + 1] = Math.round(255 * k);
            out[i * 4 + 2] = Math.round(255 * k);
        }
    }
    const plot = (x, y, r, g, b) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const i = (y * W + x) * 4;
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
    };
    const box = (bx, r, g, b) => {
        for (let x = bx.minX - 2; x <= bx.maxX + 2; x++) { plot(x, bx.minY - 2, r, g, b); plot(x, bx.maxY + 2, r, g, b); }
        for (let y = bx.minY - 2; y <= bx.maxY + 2; y++) { plot(bx.minX - 2, y, r, g, b); plot(bx.maxX + 2, y, r, g, b); }
    };
    const line = (a, c, r, g, b) => {
        const steps = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]));
        for (let i = 0; i <= steps; i++) {
            const t = steps ? i / steps : 0;
            plot(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, r, g, b);
        }
    };

    labels.forEach(l => box(l, 200, 130, 30));
    trails.forEach(t => {
        for (let i = 1; i < t.points.length; i++) line(t.points[i - 1], t.points[i], 60, 150, 70);
        t.points.forEach(p => box({ minX: p[0] - 3, maxX: p[0] + 3, minY: p[1] - 3, maxY: p[1] + 3 }, 20, 110, 40));
    });
    return encodePng(W, H, out);
}

fs.mkdirSync(CACHE, { recursive: true });
const sheetPath = path.join(CACHE, "wizard-contact-sheet.png");
fs.writeFileSync(sheetPath, contactSheet());
console.log(`  contact sheet → ${path.relative(ROOT, sheetPath)}`);

if (!OPTS.write) {
    console.log("\nNothing written. Look at the contact sheet, then run again with --write.");
    process.exit(0);
}

// ---------- cutting ----------

// `only`, when given, is a mask of the pixels worth keeping: anything
// outside it is left transparent even though it fell inside the rectangle.
function cut(box, only) {
    const x = Math.max(0, box.minX), y = Math.max(0, box.minY);
    const w = Math.min(W - x, boxWidth(box)), h = Math.min(H - y, boxHeight(box));
    const out = Buffer.alloc(w * h * 4);
    for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
            const src = (y + row) * W + (x + col);
            if (only && !only[src]) continue;
            data.copy(out, (row * w + col) * 4, src * 4, src * 4 + 4);
        }
    }
    return { x, y, w, h, png: encodePng(w, h, out) };
}

fs.mkdirSync(path.join(OUT_DIR, "labels"), { recursive: true });

const pct = (v, of) => Number(((v / of) * 100).toFixed(4));

const seedLabels = labels.map((box, i) => {
    const piece = cut(box);
    const file = `label-${String(i + 1).padStart(2, "0")}.png`;
    fs.writeFileSync(path.join(OUT_DIR, "labels", file), piece.png);
    return {
        // Blank on purpose. Which name this is has to be read off the map by
        // somebody who can read handwriting, and a guess here would be a
        // guess nobody afterwards knew was one. The admin page shows the
        // cut-out beside an empty Name field for exactly this.
        name: "",
        labelImage: `assets/img/wizard/labels/${file}`,
        x: pct(piece.x + piece.w / 2, W),
        y: pct(piece.y + piece.h / 2, H),
        w: pct(piece.w, W),
        h: pct(piece.h, H)
    };
});

/* ---------- the footprint bank ----------

   Not one sprite repeated down the middle of every trail. That reads as a
   dotted rule, which is precisely what the original drawing is not: on it,
   somebody has walked. Two things make the difference, and both are in the
   drawing already, waiting to be taken out of it.

   FEET COME IN PAIRS. Each step is a whole shoe — a sole and a heel — set
   to one side of the line of travel, and the next one to the other. A trail
   is therefore left, right, left, right, and the sprites have to know which
   they are or the walk comes out pigeon-toed.

   AND NO TWO ARE ALIKE. The map was drawn by hand, so every print on it
   differs a little from every other. A bank of a dozen real ones, dealt out
   along a trail, keeps that; a single sprite stamped ninety times does not.

   Each is cut out ROTATED — turned so it points along the direction of
   travel where it was found — so the renderer can turn it back to whatever
   angle it needs and the shoe always faces the way the walk is going. */

function buildFootprintBank() {
    const SOLE_MIN = 380;       // in pixels of ink; a heel is about 240
    const shoes = [];

    for (const trail of trails) {
        const marks = trail.marks;
        if (!marks || marks.length < 6) continue;
        for (let i = 0; i < marks.length; i++) {
            const sole = marks[i];
            if (sole.count < SOLE_MIN) continue;
            /* Only prints with trail on both sides of them. The direction a
               shoe is facing is taken from the walk either side of it, and
               at the very start or end of a trail there is no "either side"
               — the indices clamp to the print itself, the angle comes out
               of nowhere in particular, and the sprite is cut at a slant. */
            if (i < 2 || i > marks.length - 3) continue;
            // Its own heel is the nearest small mark to it. The next shoe
            // along is further off and on the other side of the line.
            let heel = null, nearest = Infinity;
            for (let j = 0; j < marks.length; j++) {
                if (j === i || marks[j].count >= SOLE_MIN) continue;
                const d = Math.hypot(...vec(centreOf(sole), centreOf(marks[j])));
                if (d < nearest) { nearest = d; heel = marks[j]; }
            }
            if (!heel || nearest > OPTS.trailGap) continue;

            /* Which way this step is facing, and which foot it is.

               The direction comes from the trail either side of the shoe
               rather than from the shoe itself — a single print is too small
               to take a reliable angle from, and the walk is what the print
               is aligned to anyway. The foot then follows from which side of
               that line the shoe sits on. */
            const centre = midpoint(centreOf(sole), centreOf(heel));
            const before = marks[Math.max(0, i - 2)];
            const after = marks[Math.min(marks.length - 1, i + 2)];
            const [dx, dy] = vec(centreOf(before), centreOf(after));
            const along = Math.hypot(dx, dy);
            if (along < 8) continue;
            const angle = Math.atan2(dy, dx);
            // Positive is to the left of the direction of travel.
            const [ox, oy] = vec(midpoint(centreOf(before), centreOf(after)), centre);
            const side = (-dy * ox + dx * oy) / along > 0 ? "right" : "left";

            shoes.push({ sole, heel, centre, angle, side, ink: sole.count + heel.count });
        }
    }
    return shoes;
}

function vec(a, b) { return [b[0] - a[0], b[1] - a[1]]; }
function midpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

/* Lifts a shoe out of the sheet, turned upright.

   Upright meaning: pointing the way it was walking. The renderer rotates
   every print to the tangent of the trail it is laying it on, so each
   sprite has to arrive in a known orientation or they all point different
   ways. Sampled nearest-neighbour — these are twenty pixels across and
   about to be drawn at a fraction of that, and a bilinear blur would only
   soften edges the drawing made crisp. */
function cutUpright(shoe, only) {
    const pad = 3;
    const box = {
        minX: Math.min(shoe.sole.minX, shoe.heel.minX) - pad,
        minY: Math.min(shoe.sole.minY, shoe.heel.minY) - pad,
        maxX: Math.max(shoe.sole.maxX, shoe.heel.maxX) + pad,
        maxY: Math.max(shoe.sole.maxY, shoe.heel.maxY) + pad
    };
    // Square and large enough that no corner is lost when it turns.
    const span = Math.ceil(Math.hypot(boxWidth(box), boxHeight(box)));
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    // Bring the direction of travel to straight up.
    const turn = -(shoe.angle + Math.PI / 2);
    const cos = Math.cos(turn), sin = Math.sin(turn);
    const out = Buffer.alloc(span * span * 4);
    for (let y = 0; y < span; y++) {
        for (let x = 0; x < span; x++) {
            const dx = x - span / 2, dy = y - span / 2;
            const sx = Math.round(cx + dx * cos + dy * sin);
            const sy = Math.round(cy - dx * sin + dy * cos);
            if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
            const src = sy * W + sx;
            if (only && !only[src]) continue;
            data.copy(out, (y * span + x) * 4, src * 4, src * 4 + 4);
        }
    }
    return trimTransparent({ width: span, height: span, data: out });
}

// The rotation leaves a wide transparent margin on every side. Trimmed, so
// the sprite's own box is the shoe and the renderer's sizing means what it
// says.
function trimTransparent(img) {
    let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            if (img.data[(y * img.width + x) * 4 + 3] < 8) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) return null;
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
        const from = ((minY + y) * img.width + minX) * 4;
        img.data.copy(out, y * w * 4, from, from + w * 4);
    }
    return { width: w, height: h, png: encodePng(w, h, out) };
}

/* One footprint, for redrawing every trail.

   A footprint on this drawing is TWO marks — the sole and the heel of one
   shoe — so the sprite is the pair, not either half. They are found by
   taking a good solid sole and reaching for the nearest mark to it, which
   is always its own heel: the next shoe along is further away, and staggered
   to the other side of the line of walking.

   A sole from the middle of the size range rather than the biggest or the
   first. The first is wherever the flood fill happened to start, which on
   this sheet is a print half faded out at the end of a trail, and the
   biggest is whatever blot the pen made when it was set down. */
const shoes = buildFootprintBank();
const bank = [];

/* Cuts a shoe out and says whether it is worth keeping. Memoized because
   the search below asks about the same candidate more than once, and each
   answer is a rotation and a trim over a few thousand pixels. */
const cutCache = new Map();

function cuts(shoe) {
    if (cutCache.has(shoe)) return cutCache.get(shoe);
    const only = new Uint8Array(W * H);
    paintBlob(only, shoe.sole.seed);
    paintBlob(only, shoe.heel.seed);
    const piece = cutUpright(shoe, only);
    /* A shoe is longer than it is wide, and after being turned to face its
       direction of travel it must come out portrait. One that does not was
       cut at the wrong angle — the walk bent sharply under it, or two trails
       crossed there — and a sideways footprint stamped down a hundred trails
       is worse than one fewer sprite in the bank. */
    const good = piece && piece.width <= piece.height * 0.75 ? piece : null;
    cutCache.set(shoe, good);
    return good;
}

if (shoes.length) {
    fs.mkdirSync(path.join(OUT_DIR, "steps"), { recursive: true });

    /* A spread of sizes for each foot rather than the best few, which would
       all be the same size — the drawing letters its trails smaller where
       two rooms are close together and larger where they are far apart, and
       the renderer needs both ends of that range to do the same.

       Taken at even steps through the size order so the bank covers the
       range the drawing actually uses, and from a shuffle within each step
       so they are not all from the same corner of the sheet. */
    const PER_SIDE = 6;
    for (const side of ["left", "right"]) {
        const ofSide = shoes.filter(s => s.side === side).sort((a, b) => a.ink - b.ink);
        if (!ofSide.length) continue;
        const used = new Set();
        for (let i = 0; i < PER_SIDE; i++) {
            // Across the middle four-fifths: the very smallest are prints
            // faded out at the end of a trail and the very largest are
            // usually two marks the pairing has run together.
            const target = Math.floor(ofSide.length * (0.1 + 0.8 * (i / (PER_SIDE - 1 || 1))));
            /* Searched outward from there rather than taken outright,
               because a shoe can still fail the upright check below — and
               losing a slot in the bank each time one does would leave the
               bank short and its sizes unevenly spread. This walks away from
               the size wanted until it finds one that works, so the spread
               survives a few rejections. */
            let shoe = null;
            for (let step = 0; step < 40 && !shoe; step++) {
                for (const at of [target + step, target - step]) {
                    if (at < 0 || at >= ofSide.length || used.has(at)) continue;
                    if (!cuts(ofSide[at])) continue;
                    used.add(at);
                    shoe = ofSide[at];
                    break;
                }
            }
            if (!shoe) continue;

            const piece = cuts(shoe);
            const file = `step-${side}-${i + 1}.png`;
            fs.writeFileSync(path.join(OUT_DIR, "steps", file), piece.png);
            bank.push({
                src: `assets/img/wizard/steps/${file}`,
                side,
                width: piece.width,
                height: piece.height,
                // How big this print was on the original sheet, as a
                // fraction of its width. The renderer scales by this so a
                // print drawn from the bank comes out the size it was drawn.
                scale: Number((piece.height / W * 100).toFixed(4))
            });
        }
    }
    console.log(`  ${bank.length} footprint sprites → assets/img/wizard/steps/ ` +
        `(${bank.filter(b => b.side === "left").length} left, ${bank.filter(b => b.side === "right").length} right)`);

    // The single sprite the map used before there was a bank. Kept so an
    // older map record, or one whose bank has been cleared, still draws
    // something rather than nothing.
    if (bank.length) {
        fs.copyFileSync(path.join(OUT_DIR, "steps", path.basename(bank[0].src)),
            path.join(OUT_DIR, "footprint.png"));
    }
}

const seed = {
    source: path.basename(source),
    width: W,
    height: H,
    footprints: bank,
    labels: seedLabels,
    trails: trails.map(t => ({
        points: t.points.map(([x, y]) => [pct(x, W), pct(y, H)]),
        prints: t.prints.length
    }))
};
const seedPath = path.join(CACHE, "wizard-slice.json");
fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));

console.log(`  ${seedLabels.length} labels → assets/img/wizard/labels/`);
console.log(`  geometry → ${path.relative(ROOT, seedPath)}`);
console.log("\nNext: node tools/build-hogwarts.js --write");

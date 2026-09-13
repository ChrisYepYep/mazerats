/* Builds Fallin' Furni's levels and writes them to the database.

   Levels 1-49 are one run. 50 is the Library and is built by hand, so this
   tool never touches it.

   ----------------------------------------------------------------------
   WHAT A LEVEL HAS TO BE

   Read off the five that were built by hand before this existed. Every one of
   them is the same three rooms in one:

     the HOST AREA     where whoever is running the game stands. A nook off to
                       one side with a seat and a counter, fenced from the
                       floor so nobody wanders into it.
     the QUEUE         a line from the DOOR to the gameplay area. Habbo's own
                       rollers (`queue_tile1`) are walkable — furnidata says
                       canstandon — so a queue can be drawn on the floor
                       without blocking it. Level 3 does exactly this.
     the GAMEPLAY AREA the open floor the zone rectangle covers, kept clear of
                       decor so a piece always has somewhere to land.

   And each room is led by ONE FURNI LINE — Amberwood in level 1, the 2025
   dark-mode set in 2, the Lodge in 3, plasto in 4, silo in 5 — with the floor
   and wallpaper chosen to sit under it rather than argue with it.

   ----------------------------------------------------------------------
   THE DIFFICULTY CURVE

   Five levers, all of them moving together from level 1 to level 49, so no
   single one has to carry the whole ramp:

     seconds          45 -> 65. RISES, because the later levels drop more
                      pieces and a shorter clock would make them impossible
                      rather than hard.
     dropDelayMs      2400 -> 850. The rate. This is the lever that actually
                      hurts: shorten it and the sequence piles up faster than
                      a player can walk it.
     dropSpeedMs      520 -> 280. How long a piece takes to fall, which is how
                      much warning you get about where it is going.
     minDropDistance  1 -> 7. How far a piece must land from wherever you are
                      standing, so camping in a corner sends the next one to
                      the far side.
     sequence seats   6 -> 16, with decoys from level 12 and a single poi from
                      level 30. A poi ends the round on the spot, so it stays
                      rare and never arrives before a player knows the game.

   The five hand-built levels get these rules too. Their DESIGNS are left
   exactly as they were — this only rewrites their `rules` — because they were
   authored by hand and the curve was not.

   ----------------------------------------------------------------------
   VALIDATION

   Nothing is written that has not been checked, because 44 levels is far too
   many to look at one at a time and a level that cannot be finished is not
   obvious from its JSON:

     every piece of decor is inside the room and on real floor
     nothing overlaps anything else
     the drop zone is inside the room and its tiles are walkable
     the zone has room for everything that falls into it
     the player's start tile is free, and the whole zone is REACHABLE from it
       with the decor in place — walked with a flood fill over the same rule
       the game uses, which is that a piece blocks unless furnidata says you
       can stand on it
     no item asks for a seat role on a furni that cannot be sat on

   usage:
     node tools/ff-levels-build.js                 check and report, write nothing
     node tools/ff-levels-build.js --write         commit to the database
     node tools/ff-levels-build.js --only 6,7,8    just those levels
     node tools/ff-levels-build.js --json out.json dump what it would write
     node tools/ff-levels-build.js --retune        ALSO put the levels that are
                                                   already in the database on
                                                   the curve. Their rules are
                                                   replaced and NOTHING ELSE
                                                   is: the five built by hand
                                                   keep their rooms exactly as
                                                   they were drawn.
*/

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const onlyAt = argv.indexOf("--only");
const ONLY = onlyAt > -1 ? new Set(argv[onlyAt + 1].split(",").map(Number)) : null;
const jsonAt = argv.indexOf("--json");
const JSON_OUT = jsonAt > -1 ? argv[jsonAt + 1] : null;
const RETUNE = argv.includes("--retune");

/* ---- the room models, read from the game's own file so there is one
   definition of where the floor is and where the door stands. */
global.window = {};
require(path.join(__dirname, "..", "js", "room-layouts.js"));
eval(fs.readFileSync(path.join(__dirname, "..", "js", "furni-library.js"), "utf8"));
const LAYOUTS = global.window.RoomLayouts;
const LIB = global.window.FurniLibrary;
const baseClass = (c) => String(c).replace(/\*\d+$/, "");

/* WHICH WAY A ROTATION ACTUALLY FACES, and therefore whether the footprint
   turns with it. Rotation is an INDEX, not a direction: the game resolves it
   against the directions a class actually ships — drawn ones ascending, then
   the same ones back down mirrored — and the footprint turns only when the
   piece ends up facing 2 or 6, because those are the room's other axis.

   Guessing this from `rotation % 2` is wrong and was wrong here: gothic_chair
   rotation 1 faces 4, which does NOT turn the footprint, while divider_arm2
   rotation 1 faces 6, which does. A 2x1 screen laid down the side of a room is
   1x2, and nothing catches that if the rule is parity. */
const MIRROR_OF = (d) => (6 - d + 8) % 8;
function facingOf(className, rotation) {
    const rec = LIB[baseClass(className)];
    if (!rec || !rec.s) return null;
    const byState = rec.s[0] || rec.s[Object.keys(rec.s)[0]];
    const drawn = Object.keys(byState).map(Number).sort((a, b) => a - b);
    if (!drawn.length) return null;
    const list = drawn.concat(drawn.slice().reverse().map(MIRROR_OF));
    return list[(Number(rotation) || 0) % list.length];
}

const MODEL = { classic: "a", wide: "e", corner: "b", steps: "f" };

/* ---- furnidata, for footprints and for what can be sat or stood on */
const SITE = (() => {
    const i = argv.indexOf("--site");
    return i > -1 ? argv[i + 1] : "http://localhost:8888";
})();

/* ---- THE CURVE. t runs 0 at level 1 to 1 at level 49. */
const LAST = 49;
/* Levels at or below this are the user's own, hand-tuned after generation,
   and --write will not touch them. --retune leaves their rooms alone too;
   it only ever sets `rules`. */
const LOCKED = 14;
const lerp = (a, b, t) => a + (b - a) * t;

function rulesFor(level) {
    const t = Math.max(0, Math.min(1, (level - 1) / (LAST - 1)));
    return {
        seconds: Math.round(lerp(45, 65, t)),
        dropDelayMs: Math.round(lerp(2400, 850, t) / 50) * 50,
        dropSpeedMs: Math.round(lerp(520, 280, t) / 10) * 10,
        minDropDistance: Math.round(lerp(1, 7, t))
    };
}

/* How many of each kind of thing falls, at this point in the run. */
function budgetFor(level) {
    const t = Math.max(0, Math.min(1, (level - 1) / (LAST - 1)));
    return {
        sequence: Math.round(lerp(6, 16, t)),
        decoy: level < 12 ? 0 : Math.round(lerp(0, 3, (level - 12) / (LAST - 12))),
        poi: level < 30 ? 0 : 1,
        obstacle: Math.round(lerp(2, 6, t))
    };
}

/* ------------------------------------------------------------------ */
/* The designs. Coordinates are tiles. `decor` is laid out by hand per
   room; `drops` names the seats and obstacles that fall, and the counts are
   scaled to the budget above so one design can sit anywhere on the curve. */

const makeDesigns = require("./ff-levels-designs.js");

/* ------------------------------------------------------------------ */

const key = (x, y) => `${x},${y}`;

function tilesOf(f, meta) {
    const m = meta[f.className] || {};
    const w = Math.max(1, Number(m.x) || 1), h = Math.max(1, Number(m.y) || 1);
    const facing = facingOf(f.className, f.rotation);
    const swap = facing === 2 || facing === 6;      // the game's own rule
    const fw = swap ? h : w, fh = swap ? w : h;
    const out = [];
    for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) out.push([f.x + dx, f.y + dy]);
    return out;
}

function validate(level, meta) {
    const problems = [];
    const model = LAYOUTS.get(level.model);
    if (!model) return [`unknown model ${level.model}`];
    const floor = (x, y) =>
        x >= 0 && y >= 0 && x < model.cols && y < model.rows && model.mask[y][x] === "0";

    // decor on real floor, not overlapping
    const taken = new Map();
    const blocked = new Set();
    for (const d of level.decor || []) {
        const m = meta[d.className];
        if (!m) { problems.push(`decor ${d.className} is not in furnidata`); continue; }
        /* STACKED FURNI IS NOT OVERLAPPING FURNI. Levels 7 and 10 put a
           carpet under the candelabra and a duck on top of the table, and
           that is how a Habbo room is dressed — `z` is the height it sits
           at, so two things on one tile at different heights are a pile and
           not a mistake. Only same-height collisions are wrong. */
        const height = Number(d.z) || 0;
        for (const [x, y] of tilesOf(d, meta)) {
            if (!floor(x, y)) problems.push(`decor ${d.className} at ${x},${y} is off the floor`);
            const here = taken.get(key(x, y));
            if (here && here.z === height) problems.push(`decor ${d.className} overlaps ${here.className} at ${x},${y}`);
            if (!here || height >= here.z) taken.set(key(x, y), { className: d.className, z: height });
            if (!m.stand) blocked.add(key(x, y));       // the game's rule: a piece blocks unless you can stand on it
        }
    }

    /* THE START TILE IS INSIDE THE GAMEPLAY AREA.

       The wall between the queue and the floor is SEALED — the gate in it is
       a real gate and furnidata calls it cannotstandon — because the avatar
       never walks in through it. It begins on the floor and stays there. So a
       start tile outside the zone is not a layout choice, it is a level the
       player cannot play. */
    const s = level.start || {};
    if (!floor(s.x, s.y)) problems.push(`start ${s.x},${s.y} is off the floor`);
    if (blocked.has(key(s.x, s.y))) problems.push(`start ${s.x},${s.y} is blocked by decor`);
    const z0 = (level.zones || [])[0] && (level.zones || [])[0].area;
    if (z0 && !(s.x >= z0.x && s.y >= z0.y && s.x < z0.x + z0.w && s.y < z0.y + z0.h)) {
        problems.push(`start ${s.x},${s.y} is outside the gameplay area`);
    }

    // zones
    let seats = 0, cells = 0;
    for (const z of level.zones || []) {
        const a = z.area || {};
        for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) {
            if (!floor(x, y)) { problems.push(`zone "${z.name}" covers ${x},${y} which is not floor`); continue; }
            if (!blocked.has(key(x, y))) cells++;
        }
        for (const it of z.items || []) {
            const m = meta[it.className];
            if (!m) { problems.push(`drop ${it.className} is not in furnidata`); continue; }
            if (["sequence", "decoy", "poi"].includes(it.role) && !m.sit) {
                problems.push(`${it.className} is set to ${it.role} but cannot be sat on`);
            }
            seats += (Number(it.count) || 0) * Math.max(1, (m.x || 1) * (m.y || 1));
        }
    }
    if (seats > cells) problems.push(`${seats} tiles of furni fall into a zone with only ${cells} free`);

    // reachability: can the player walk from start to every free tile of the zone?
    const seen = new Set([key(s.x, s.y)]);
    const q = [[s.x, s.y]];
    while (q.length) {
        const [x, y] = q.shift();
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (!floor(nx, ny) || blocked.has(key(nx, ny)) || seen.has(key(nx, ny))) continue;
            seen.add(key(nx, ny));
            q.push([nx, ny]);
        }
    }
    for (const z of level.zones || []) {
        const a = z.area || {};
        let reach = 0, free = 0;
        for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) {
            if (!floor(x, y) || blocked.has(key(x, y))) continue;
            free++;
            if (seen.has(key(x, y))) reach++;
        }
        if (reach < free) problems.push(`zone "${z.name}": ${free - reach} of ${free} tiles are walled off from the start`);
        if (free < 4) problems.push(`zone "${z.name}" has only ${free} free tiles`);
    }

    // the reach rule has to be satisfiable somewhere in the zone
    const far = level.rules.minDropDistance;
    if (far > 0) {
        const z = (level.zones || [])[0];
        if (z) {
            const a = z.area;
            const corners = [[a.x, a.y], [a.x + a.w - 1, a.y], [a.x, a.y + a.h - 1], [a.x + a.w - 1, a.y + a.h - 1]];
            const best = Math.max(...corners.map(([x, y]) => Math.abs(x - s.x) + Math.abs(y - s.y)));
            if (best < far) problems.push(`minDropDistance ${far} but the zone's furthest corner is ${best} from the start`);
        }
    }
    return problems;
}

/* Scale a design's drop list to the budget for this level. */
function dropsFor(design, level) {
    const b = budgetFor(level);
    const out = [];
    const seatKinds = design.drops.filter(d => d.role === "sequence");
    const others = design.drops.filter(d => d.role !== "sequence");

    // spread the sequence budget over the seat kinds in the design's own ratio
    const weight = seatKinds.reduce((s, d) => s + d.w, 0);
    let left = b.sequence;
    seatKinds.forEach((d, i) => {
        const n = i === seatKinds.length - 1 ? left : Math.max(1, Math.round(b.sequence * d.w / weight));
        left -= n;
        if (n > 0) out.push({ className: d.className, count: n, role: "sequence", rotation: d.rotation || 0 });
    });
    for (const d of others) {
        const n = d.role === "obstacle" ? b.obstacle
            : d.role === "decoy" ? b.decoy
            : d.role === "poi" ? b.poi : 0;
        if (n > 0) out.push({ className: d.className, count: n, role: d.role, rotation: d.rotation || 0 });
    }
    return out;
}

function buildLevel(design, n) {
    return {
        schema: 2,
        id: design.id,
        name: design.name,
        order: n,
        published: true,
        model: design.model,
        floor: design.floor,
        wall: design.wall,
        start: design.start,
        startDir: design.startDir,
        decor: design.decor,
        zones: [{ id: `z${design.id}`, name: design.zoneName || "Drop zone", area: design.zone, items: dropsFor(design, n) }],
        rules: rulesFor(n)
    };
}

(async () => {
    const meta = (await fetch(`${SITE}/.netlify/functions/furni-meta`).then(r => r.json())).items || {};
    console.log(`furnidata: ${Object.keys(meta).length} records\n`);

    const DESIGNS = makeDesigns(meta);

    const built = [];
    let bad = 0;
    for (const design of DESIGNS) {
        const n = design.level;
        if (ONLY && !ONLY.has(n)) continue;
        const level = buildLevel(design, n);
        const problems = validate(level, meta);
        const r = level.rules;
        const items = level.zones[0].items;
        const seq = items.filter(i => i.role === "sequence").reduce((s, i) => s + i.count, 0);
        console.log(`${String(n).padStart(2)}. ${level.name.padEnd(24)} ${LAYOUTS.get(level.model).name.padEnd(8)}` +
            ` ${r.seconds}s  drop ${r.dropDelayMs}ms  fall ${r.dropSpeedMs}ms  reach ${r.minDropDistance}` +
            `  ${seq} seats  ${level.decor.length} decor` + (problems.length ? "   ** PROBLEMS **" : "   ok"));
        for (const p of problems) { console.log(`      - ${p}`); bad++; }
        built.push(level);
    }

    /* Levels that already exist and are not in DESIGNS — the five built by
       hand — put on the same curve. Rules only: the rooms were drawn by a
       person and the curve was not, so it has no business touching them. */
    const retuned = [];
    if (RETUNE) {
        const live = await fetch(`${SITE}/.netlify/functions/ff-levels`).then(r => r.json());
        const mine = new Set(DESIGNS.map(d => d.id));
        console.log("");
        for (const l of (live.levels || live)) {
            if (mine.has(l.id) || l.order > LAST) continue;
            const was = l.rules || {};
            const now = rulesFor(l.order);
            retuned.push({ id: l.id, order: l.order, rules: now });
            console.log(`${String(l.order).padStart(2)}. ${String(l.name).padEnd(24)} retune` +
                `  ${was.seconds}s->${now.seconds}s  drop ${was.dropDelayMs}->${now.dropDelayMs}` +
                `  fall ${was.dropSpeedMs}->${now.dropSpeedMs}  reach ${was.minDropDistance}->${now.minDropDistance}`);
        }
    }

    console.log(`\n${built.length} levels, ${bad} problems${RETUNE ? `, ${retuned.length} retuned` : ""}`);
    if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(built, null, 1)); console.log(`-> ${JSON_OUT}`); }

    if (!WRITE) { console.log("nothing written — pass --write to commit"); return; }
    if (bad) { console.log("REFUSING TO WRITE: fix the problems above first"); process.exitCode = 1; return; }

    require("./_env.js").loadEnv(["MONGODB_URI"]);
    const { getDb } = require("../netlify/functions/_db.js");
    const db = await getDb();
    const col = db.collection("ff_levels");
    const now = new Date().toISOString();
    let wrote = 0, skipped = 0;
    for (const level of built) {
        /* HANDS OFF 1 TO 14. Those rooms have been gone over by hand since
           this tool generated them — the queue taken wall to wall, the gate
           moved into the corner, carpets and ducks layered into the booths —
           and a re-run of the generator would quietly undo all of it. The
           generator's output for them is still built and checked above, so
           it can be diffed, but it is never written. */
        if (level.order <= LOCKED) { skipped++; console.log(`  skipped ${level.id} — hand-built, not mine to write`); continue; }
        const existing = await col.findOne({ id: level.id });
        await col.updateOne(
            { id: level.id },
            { $set: { ...level, updatedAt: now }, $setOnInsert: { createdAt: now } },
            { upsert: true });
        wrote++;
        console.log(`  ${existing ? "updated" : "created"} ${level.id}`);
    }
    for (const r of retuned) {
        await col.updateOne({ id: r.id }, { $set: { rules: r.rules, updatedAt: now } });
        console.log(`  retuned ${r.id}`);
    }
    console.log(`${wrote} levels written` +
        (skipped ? `, ${skipped} left alone as hand-built` : "") +
        (retuned.length ? `, ${retuned.length} retuned` : ""));
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

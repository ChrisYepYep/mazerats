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

   WHAT THE CURVE IS ACTUALLY MADE OF, and it is not the clock.

   A round asks one thing: remember which seats landed, and in what order. So
   what makes a level hard is the number of seats a player is holding in their
   head at once — the ones that have landed and not yet been sat on. Call it
   the backlog. It grows whenever furni falls faster than a person can walk to
   it, and `tools/ff-sim.js` measures it by playing each level a few hundred
   times.

   Four deep is a round you play. Seven is the top of what anyone can hold,
   and past that the middle of the sequence is gone before you reach it — a
   level nobody clears, however much clock you give them. The old curve ran to
   a backlog of seven by level 46 and was over four from level 38, and it got
   there by shortening `dropDelayMs` to 850ms, which is a third of the time it
   takes to walk to a chair.

   The clock, meanwhile, was never the thing: a competent player finished
   every level in the run with twenty-five seconds to spare. It is a backstop,
   not a lever.

   Five levers, all of them moving together from level 1 to level 49:

     dropDelayMs      2600 -> 1250. THE RATE, and the one that decides the
                      backlog. A seat takes about two and a half seconds to
                      reach, so a delay near that keeps the queue at one or
                      two and a delay well under it makes the queue the game.
     sequence seats   6 -> 15, with decoys from level 15 and a single poi from
                      level 35. A poi ends the round on the spot, so it stays
                      rare and never arrives before a player knows the game.
                      A room that cannot take that many safely gets fewer —
                      see ZONE_FULL.
     minDropDistance  1 -> 4. How far a piece must land from wherever you are
                      standing, so camping in a corner sends the next one to
                      the far side. It is also a walking-time multiplier, so
                      it feeds the backlog: the old 7 meant every single piece
                      was a trek.
     dropSpeedMs      560 -> 380. How long a piece takes to fall, which is how
                      much warning you get about where it is going.
     seconds          50 -> 70. RISES, because the later levels drop more
                      pieces more slowly and a shorter clock would make them
                      impossible rather than hard.

   Where that lands: the backlog now runs 1.4 at level 1 to 4.6 at level 49,
   against 1.9 to 6.8 before. Level 22 — the one that prompted this — goes
   from 3.0 to 2.4.

   The hand-built levels get these rules too. Their DESIGNS are left exactly
   as they were — this only rewrites their `rules` — because they were
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
                                                   is: the ones built by hand
                                                   keep their rooms exactly as
                                                   they were drawn.

   To JUDGE a change to the curve rather than just make it, dump the whole run
   and play it:

     node tools/ff-levels-build.js --retune --json out.json
     node tools/ff-sim.js --levels out.json --rounds 200

   The dump is the live set with this run laid over it, so out.json is all
   fifty levels as they would be — which is the only thing a curve can be read
   off. Nothing has been written at that point.
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
/* Levels at or below this have been gone over by hand since the generator
   made them, and --write will not touch them. Raise it each time another
   batch is tuned — the diff against what this tool WOULD have built is the
   brief for the shells, so the generated version is still built and checked,
   just never written. --retune leaves their rooms alone too; it only ever
   sets `rules`. */
const LOCKED = 20;
const lerp = (a, b, t) => a + (b - a) * t;

function rulesFor(level) {
    const t = Math.max(0, Math.min(1, (level - 1) / (LAST - 1)));
    return {
        seconds: Math.round(lerp(50, 70, t)),
        dropDelayMs: Math.round(lerp(2600, 1250, t) / 50) * 50,
        dropSpeedMs: Math.round(lerp(560, 380, t) / 10) * 10,
        minDropDistance: Math.round(lerp(1, 4, t))
    };
}

/* How many of each kind of thing falls, at this point in the run. */
function budgetFor(level) {
    const t = Math.max(0, Math.min(1, (level - 1) / (LAST - 1)));
    return {
        sequence: Math.round(lerp(6, 15, t)),
        decoy: level < 15 ? 0 : Math.round(lerp(0, 2, (level - 15) / (LAST - 15))),
        poi: level < 35 ? 0 : 1,
        obstacle: Math.round(lerp(2, 5, t))
    };
}

/* ---- HOW FULL A ROOM IS ALLOWED TO GET, which the curve above cannot say
   on its own because it does not know how big the floor is.

   The four layouts give drop zones between 40 and 70 tiles, and the same
   budget in each is not the same game. Level 45's zone is the Wide room's
   10x4 — a corridor four deep — and twenty-five pieces in it leave a player
   edging between chairs with nowhere to stand; level 47's is the Corner
   room's 7x10, and the same twenty-five sit in it with room to walk. The
   generator was handing both the same list.

   So the budget is a WISH and this is the ceiling. Count the tiles the drops
   would cover — sofas are two, not one — and if that is more than this much
   of the zone, take pieces off until it is not.

   THEY COME OFF A TURN EACH, not in order of importance. Obstacles first
   sounds right and empties the room of everything but chairs: the sequence is
   most of the tiles, so a zone that is over by a third loses every obstacle
   and every decoy before the seats have given up one, and what is left is a
   corridor of armchairs. Going round the kinds in turn takes a tenth off
   everything instead, which is a smaller version of the same level rather
   than a different kind of level.

   The floors are what the level cannot do without: seven seats, or the
   sequence stops being one, and one obstacle wherever the design asked for
   any, because an empty floor is the thing this is trying to avoid at the
   other end. */
const ZONE_FULL = 0.40;
const KEEP_SEATS = 7;

/* ------------------------------------------------------------------ */
/* The designs. Coordinates are tiles. `decor` is laid out by hand per
   room; `drops` names the seats and obstacles that fall, and the counts are
   scaled to the budget above so one design can sit anywhere on the curve. */

const makeDesigns = require("./ff-levels-designs.js");

/* ------------------------------------------------------------------ */

const key = (x, y) => `${x},${y}`;

/* HOW FAR A PIECE STANDS ABOVE ITS TILE, in pixels, taken from the client's
   own artwork: `ay` is where the tile's origin sits inside the sprite, so it
   is exactly how much of the piece is drawn above the floor.

   This is worth having as a number because "low screen" and "wall" look the
   same in a class list and nothing else separates them. The barriers the
   hand-built levels use measure 41 to 51. The Sand Castle Wall is 101 and
   the Rose Quartz Screen 92, and both were picked here as room dividers on
   the strength of their names; laid seven times across a room they hid the
   host booth completely. */
function standsAbove(className) {
    const rec = LIB[baseClass(className)];
    if (!rec || !rec.s) return 0;
    const byState = rec.s[0] || rec.s[Object.keys(rec.s)[0]];
    let tallest = 0;
    for (const d of Object.keys(byState)) {
        const f = byState[d];
        if (f && f.ay > tallest) tallest = f.ay;
    }
    return tallest;
}
/* The hand-built levels' barriers all measure 41 to 51; the pieces that
   went wrong here were 92, 101 and 122. 70 separates them cleanly. */
const RUN_MAX_HEIGHT = 70;
const RUN_LENGTH = 3;           // three in a line is a run

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

    /* A PIECE LAID IN A RUN HAS TO BE LOW. One tall gate is an archway and
       reads as the way in — level 7 has a 104px one standing in front of most
       of its floor and it looks right. The same height repeated four times
       across the room is a wall, and everything behind it is gone. */
    const lines = new Map();        // className -> {"y3": n, "x0": n, ...}
    for (const d of level.decor || []) {
        if (/^queue_tile|^doormat/.test(d.className)) continue;     // flat, walkable
        if (!lines.has(d.className)) lines.set(d.className, new Map());
        const m = lines.get(d.className);
        for (const k of ["y" + d.y, "x" + d.x]) m.set(k, (m.get(k) || 0) + 1);
    }
    for (const [className, m] of lines) {
        /* COLLINEAR is what makes it a run. Level 7 has four candelabra in
           it, one to a corner, and they are punctuation — repetition alone
           is not the test, four of them down one row would be. */
        const longest = Math.max(...m.values());
        if (longest < RUN_LENGTH) continue;
        const h = standsAbove(className);
        if (h > RUN_MAX_HEIGHT) {
            problems.push(`${className} stands ${h}px above the floor and is laid ${longest} in a line — that is a wall, not a divider`);
        }
    }

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
/* The tiles one of a design's drop kinds covers, out of furnidata. A design
   names a class and a rotation; the footprint turns with the rotation, so a
   2x1 sofa laid down the side of a room is two tiles either way. */
function coverOf(drop, meta) {
    const m = meta[baseClass(drop.className)] || meta[drop.className] || {};
    const w = Math.max(1, Number(m.x) || 1);
    const h = Math.max(1, Number(m.y) || 1);
    return w * h;
}

/* Take pieces off the budget until they fit the zone. See ZONE_FULL. */
function trimToZone(budget, design, meta) {
    const tiles = Math.max(1, design.zone.w * design.zone.h);
    const room = Math.floor(tiles * ZONE_FULL);
    const b = { ...budget };

    const kinds = design.drops || [];
    const seatCover = (() => {
        const seats = kinds.filter(d => d.role === "sequence");
        if (!seats.length) return 1;
        const weight = seats.reduce((s, d) => s + d.w, 0) || 1;
        return seats.reduce((s, d) => s + coverOf(d, meta) * d.w, 0) / weight;
    })();
    const coverFor = (role) => {
        const d = kinds.find(k => k.role === role);
        return d ? coverOf(d, meta) : 1;
    };

    const used = () => Math.round(b.sequence * seatCover)
        + b.decoy * coverFor("decoy") + b.poi * coverFor("poi")
        + b.obstacle * coverFor("obstacle");

    /* The poi is never trimmed: there is only ever one, it is a tile, and it
       is the whole character of the levels that have it. */
    const floor = { obstacle: budget.obstacle ? 1 : 0, sequence: KEEP_SEATS, decoy: 0 };
    const turns = ["obstacle", "sequence", "decoy"];
    for (let i = 0; used() > room; i++) {
        if (turns.every(k => b[k] <= floor[k])) break;   // nothing left to give
        const k = turns[i % turns.length];
        if (b[k] > floor[k]) b[k]--;
    }
    return b;
}

/* ---- A HAND-BUILT LEVEL WITH AN EMPTY ZONE.

   Nothing falls, so there is no sequence, so the round is complete the moment
   it begins and the player is handed a level they never played. Level 20 is
   in that state: its zone id is a freshly minted one and its name is "Zone 2",
   which is what the editor writes when a zone is deleted and a new rectangle
   dragged out — so the rectangle was redrawn and the furni never put back.

   A level with no seats is not a design decision anybody could have meant, so
   it is repaired rather than reported. What goes back in is the furni line the
   room is already dressed in — Magenta Lounge is the polyfon set, the same as
   its neighbours either side — and the COUNTS come off the curve like every
   other level's, so it sits where level 20 should sit and moves when the curve
   moves.

   This is deliberately a list of one. It is not a place to park designs; it is
   a note saying this one room lost its furniture. */
const REFILL = {
    "level-20": [
        { className: "funky_sofa_polyfon*10", role: "sequence", w: 3 },
        { className: "funky_sofachair_polyfon*10", role: "sequence", w: 4 },
        { className: "chair_polyfon", role: "sequence", w: 3 },
        { className: "funky_sofachair_polyfon*8", role: "decoy" },
        { className: "plant_bonsai_p", role: "obstacle" }
    ]
};

/* The zones a live level should have, or null if there is nothing wrong with
   the ones it has. */
function repairFor(level, meta) {
    const drops = REFILL[level.id];
    if (!drops) return null;
    const zones = level.zones || [];
    const seats = zones.reduce((n, z) => n + (z.items || []).filter(
        i => i.role === "sequence" && (meta[i.className] || {}).sit).length, 0);
    if (seats) return null;                     // somebody has since fixed it
    const zone = (zones[0] && zones[0].area) || null;
    if (!zone) return null;
    return [{ ...zones[0], items: dropsFor({ zone, drops }, level.order, meta) }];
}

function dropsFor(design, level, meta) {
    const b = trimToZone(budgetFor(level), design, meta);
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

function buildLevel(design, n, meta) {
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
        zones: [{ id: `z${design.id}`, name: design.zoneName || "Drop zone", area: design.zone, items: dropsFor(design, n, meta) }],
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
        const level = buildLevel(design, n, meta);
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

    /* EVERY LEVEL THIS RUN WILL NOT ITSELF WRITE, put on the same curve.

       That is 1 to LOCKED plus anything else already in the database, and it
       used to be only the handful with no design here at all — so the moment
       LOCKED went up to 20, fifteen hand-tuned levels stopped being written
       AND stopped being retuned, and sat on whatever curve was current the
       day they were generated. A curve that skips the middle of the run is
       not a curve.

       Rules only. The rooms were drawn by a person and the curve was not, so
       it has no business touching them. */
    const retuned = [];
    const live = (RETUNE || JSON_OUT)
        ? await fetch(`${SITE}/.netlify/functions/ff-levels`).then(r => r.json()).then(j => j.levels || j)
        : [];
    if (RETUNE) {
        const willWrite = new Set(built.filter(l => l.order > LOCKED).map(l => l.id));
        console.log("");
        for (const l of live) {
            if (willWrite.has(l.id) || l.order > LAST) continue;
            const was = l.rules || {};
            const now = rulesFor(l.order);
            const fix = repairFor(l, meta);
            retuned.push({ id: l.id, order: l.order, rules: now, zones: fix });
            console.log(`${String(l.order).padStart(2)}. ${String(l.name).padEnd(24)} retune` +
                `  ${was.seconds}s->${now.seconds}s  drop ${was.dropDelayMs}->${now.dropDelayMs}` +
                `  fall ${was.dropSpeedMs}->${now.dropSpeedMs}  reach ${was.minDropDistance}->${now.minDropDistance}` +
                (fix ? "   ** ZONE REFILLED **" : ""));
        }
    }

    console.log(`\n${built.length} levels, ${bad} problems${RETUNE ? `, ${retuned.length} retuned` : ""}`);
    /* THE WHOLE RUN AS IT WOULD BE, not just the levels this tool writes.

       The dump exists to be played — `node tools/ff-sim.js --levels out.json`
       walks a few hundred rounds of every level and reports how deep the
       backlog gets — and a curve can only be judged on all fifty. Half of
       them come from here and half are already in the database wearing new
       rules, so the file is the live set with this run laid over it. */
    if (JSON_OUT) {
        const all = new Map(live.map(l => [l.id, l]));
        for (const l of built) if (l.order > LOCKED) all.set(l.id, l);
        for (const r of retuned) {
            const l = all.get(r.id);
            if (l) all.set(r.id, { ...l, rules: r.rules, ...(r.zones ? { zones: r.zones } : {}) });
        }
        if (!all.size) for (const l of built) all.set(l.id, l);
        const out = [...all.values()].sort((a, b) => a.order - b.order);
        fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
        console.log(`-> ${JSON_OUT} (${out.length} levels)`);
    }

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
        const set = { rules: r.rules, updatedAt: now };
        if (r.zones) set.zones = r.zones;       // an empty zone put back — see REFILL
        await col.updateOne({ id: r.id }, { $set: set });
        console.log(`  retuned ${r.id}${r.zones ? " and refilled its zone" : ""}`);
    }
    console.log(`${wrote} levels written` +
        (skipped ? `, ${skipped} left alone as hand-built` : "") +
        (retuned.length ? `, ${retuned.length} retuned` : ""));
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

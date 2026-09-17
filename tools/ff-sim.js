/* Plays Fallin' Furni without a browser, so a level can be MEASURED.

   TWO QUESTIONS NOTHING ELSE CAN ANSWER.

   The first is whether a level ever strands a seat. The rules in
   js/room-drop.js are an invariant checked the moment each piece starts
   falling — whatever the floor the player can walk on breaks into once this
   piece is on it, every part of it has to be able to finish the round — and
   that is a proof about one instant. A round is two hundred of them, the
   seats land in a different order every time, and the failures that got past
   earlier versions of the rule all needed three or four particular things to
   happen at once. They turn up at a few percent of rounds, which is to say
   never while you are watching and constantly while somebody is playing.

   The second is whether a level is too hard, and that is not a question about
   the clock. See THE BACKLOG below, and the long note on the curve in
   tools/ff-levels-build.js.

   THE PLAYER MODELLED HERE IS BETTER THAN A PERSON. It is told which seat is
   next the instant one lands, takes the shortest route, never hesitates past
   `--react` and never mis-clicks — so a level it fails is one nobody can
   pass, and a level it wins with two seconds in hand is one a person loses.
   It is a ceiling, not an average. Read `stranded` as a defect count and
   `backlog` as the difficulty; `won` and `spare` only tell you a level is
   not impossible.

   It walks with the game's own findPath and the game's own step time, sits by
   arriving on a tile, and is ticked by the same RoomGame the page ticks, so
   what it plays is the game rather than a model of it. Every seed is fixed,
   so a round that goes wrong can be replayed exactly.

   usage:
     node tools/ff-sim.js                        every level, 60 rounds each
     node tools/ff-sim.js --rounds 200           more rounds, tighter numbers
     node tools/ff-sim.js --only 20,21,22        just those
     node tools/ff-sim.js --verbose              say what went wrong, and in
                                                 which seed, so it can be
                                                 replayed
     node tools/ff-sim.js --react 0              the ceiling: no reaction time
     node tools/ff-sim.js --levels out.json      read levels from a file
                                                 instead of the site — see
                                                 ff-levels-build.js --json,
                                                 which is how a curve is tried
                                                 before it is written
     node tools/ff-sim.js --site https://...     where to read levels from
     node tools/ff-sim.js --uncapped             ignore the clock, so `used`
                                                 is what the round ASKS for
                                                 instead of what fitted
     node tools/ff-sim.js --out demand.json      write the measurements out —
                                                 what ff-levels-build.js reads
                                                 to set the clock
*/

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
    const i = argv.indexOf(`--${name}`);
    return i > -1 ? argv[i + 1] : dflt;
};
const ROUNDS = Number(opt("rounds", 60));
/* HOW LONG BEFORE THE PLAYER NOTICES A SEAT LAND, in milliseconds.

   Zero is the perfect player, and a perfect player is not who the curve is
   for: it clears every level in the run with twenty-five seconds to spare and
   so says nothing at all about whether a level is hard. A real one has to see
   the piece land, decide it is the next one, and click — and three hundred
   milliseconds of that, once per seat, is most of a second per seat by the
   time it compounds with the walk.

   Pass --react 0 for the ceiling, --react 600 for somebody playing while
   talking to you. The default is a person who is paying attention. */
const REACT_MS = Number(opt("react", 300));
const SITE = opt("site", "https://mazerats.net");
const LEVELS_FILE = opt("levels", null);
const META_FILE = opt("meta", null);
const onlyArg = opt("only", null);
const ONLY = onlyArg ? new Set(onlyArg.split(",").map(Number)) : null;
const VERBOSE = argv.includes("--verbose");
const OUT = opt("out", null);

/* MEASURING HOW LONG A ROUND TAKES, rather than whether it fits the clock.

   `used` is averaged over rounds that were WON, so a level whose clock is too
   short reports the time of the rounds that beat it and says nothing about
   the ones that did not — the tighter the clock, the faster the level looks.
   That is fine for reading a curve and useless for setting one.

   --uncapped gives every level ten minutes, so every round plays to its
   natural end and `used` becomes what the round actually asks for. That is
   the number a clock is set from; see tools/ff-levels-build.js. */
const UNCAPPED = argv.includes("--uncapped");

/* ---- enough of a browser to load the room's own files. None of them draw
   anything on the paths this uses; they only reach for a canvas when asked
   to paint, and nothing here asks. */
const noop = () => {};
const stubCanvas = () => ({
    width: 0, height: 0,
    getContext: () => new Proxy({}, {
        get: (t, k) => (k === "canvas" ? stubCanvas()
            : k === "getImageData" ? (() => ({ data: [] }))
            : k === "createImageData" ? (() => ({ data: [] }))
            : noop)
    })
});
global.window = {};
global.document = { createElement: () => stubCanvas(), fonts: { load: () => Promise.resolve() } };
global.Image = function () { this.onload = null; this.onerror = null; };
global.requestAnimationFrame = noop;
global.performance = { now: () => 0 };

const load = (f) => eval(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"));
load("furni-library.js");
load("room-layouts.js");
load("room-iso.js");
load("room-path.js");
load("room-furni.js");
load("room-levels.js");
load("room-drop.js");
load("room-game.js");

const W = global.window;
const Iso = W.RoomIso, Path = W.RoomPath, Furni = W.RoomFurni;
const Levels = W.RoomLevels, Game = W.RoomGame;

/* ---- a seeded generator, so a bad round can be replayed exactly. */
function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* HOW LONG A STEP TAKES. The page's own figure — one tile per WALK_MS — is
   what makes a simulated second worth the same as a played one. */
const WALK_MS = (() => {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", "fallinfurni.js"), "utf8");
    const m = src.match(/WALK_MS\s*=\s*(\d+)/);
    return m ? Number(m[1]) : 380;
})();
const TICK_MS = 40;

/* ---- ONE ROUND.

   Returns what happened and, when something went wrong, enough to say where.

   The player re-plans every time it arrives somewhere or the wanted seat
   changes, because the room is still filling up underneath it: a route
   planned four pieces ago may be walled off by now. */
function playRound(level, meta, seed) {
    const rand = mulberry(seed);
    const metaFor = (c) => meta[c] || Furni.libraryMeta(c) || {};
    const game = Game.createGame(level, {
        rand, metaFor,
        urlFor: () => ({ url: null, flip: false }),
        rotationsOf: (c) => Furni.rotationsOf(c) || 1
    });
    game.start(0);
    /* Taken NOW, because the round takes seats off its own plan when it
       cannot find them anywhere safe to land — which is the thing this is
       trying to count, so reading it at the end would always read zero. */
    const wanted = game.round.plannedSeats;

    let pos = { x: level.start.x, y: level.start.y };
    let route = [];
    let target = null;
    let stepAt = 0;
    let stranded = 0;             // ticks with a wanted seat and no route to it
    let wrongSeats = 0;
    let now = 0;

    /* THE BACKLOG IS THE DIFFICULTY, and it is the number neither the clock
       nor the seat count shows.

       A round is only ever asking one thing of a player: remember the order.
       What they actually have to hold in their head is the seats that have
       LANDED and not yet been sat on — and that queue grows whenever furni
       falls faster than a person can walk to it. Six seats arriving over a
       comfortable minute is an easy round; six seats arriving in nine seconds
       is the same six seats and a memory test.

       So this counts the deepest that queue ever gets. Four is a round you
       play. Seven is the top of what a person can hold. Ten is a round where
       the middle is gone before you reach it, and no amount of clock helps —
       which is exactly the failure that reads as "too hard" without reading
       as "too fast". */
    let peakBacklog = 0;
    let noticedAt = -1;           // when the player may act on the current seat
    let lastWant = null;

    const LIMIT = (level.rules.seconds + 30) * 1000;
    while (game.state === "running" && now < LIMIT) {
        game.tick(now, pos);
        if (game.state !== "running") break;

        const backlog = game.remaining().length;
        if (backlog > peakBacklog) peakBacklog = backlog;

        let want = game.nextSeat();
        if (want !== lastWant) { lastWant = want; noticedAt = now + REACT_MS; }
        if (want && now < noticedAt) want = null;
        if (want) {
            /* Re-plan when the goal changed, when the route ran out, or when
               the room moved under it. Cheap enough at 25 ticks a second and
               it is what a player with eyes does. */
            const goal = nearestTile(want, pos);
            const blocked = Furni.blockedTiles(game.round.placed);
            const goalKey = Iso.key(goal.x, goal.y);
            const isBlocked = (x, y) => blocked.has(Iso.key(x, y));
            if (!target || target.x !== goal.x || target.y !== goal.y || !route.length) {
                route = Path.findPath(pos, goal, isBlocked, true) || [];
                target = route.length || (pos.x === goal.x && pos.y === goal.y) ? goal : null;
                if (!route.length && !(pos.x === goal.x && pos.y === goal.y)) stranded++;
            } else if (route.some(s => Iso.key(s.x, s.y) !== goalKey && isBlocked(s.x, s.y))) {
                route = Path.findPath(pos, goal, isBlocked, true) || [];
                if (!route.length) stranded++;
            }
        }

        if (route.length && now >= stepAt) {
            const step = route.shift();
            pos = { x: step.x, y: step.y };
            stepAt = now + WALK_MS;
            const what = game.arrivedAt(pos, now);
            if (what === "wrong" || what === "decoy") wrongSeats++;
            if (what === "poi") break;
        }
        now += TICK_MS;
    }

    const seats = game.round ? game.round.sequence().length : 0;
    const left = game.remaining().length;
    return {
        won: game.state === "won",
        why: game.endedBecause || (now >= LIMIT ? "hung" : ""),
        seats, left, stranded, wrongSeats, peakBacklog,
        planned: wanted,
        dropped: game.round ? game.round.sequence().length : 0,   // SEATS that made it down
        spare: Math.max(0, game.secondsLeft(now)),
        usedMs: now
    };
}

/* The tile of a seat the player should aim for: the half of a two-seater that
   is nearest, since either counts as sitting on it. */
function nearestTile(seat, from) {
    let best = null, bestD = Infinity;
    for (const t of Furni.tilesOf(seat)) {
        const d = Math.max(Math.abs(t.x - from.x), Math.abs(t.y - from.y));
        if (d < bestD) { bestD = d; best = t; }
    }
    return best || { x: seat.x, y: seat.y };
}

(async () => {
    const levels = LEVELS_FILE
        ? JSON.parse(fs.readFileSync(LEVELS_FILE, "utf8"))
        : await fetch(`${SITE}/.netlify/functions/ff-levels`).then(r => r.json()).then(j => j.levels || j);
    const meta = META_FILE
        ? JSON.parse(fs.readFileSync(META_FILE, "utf8"))
        : await fetch(`${SITE}/.netlify/functions/furni-meta`).then(r => r.json()).then(j => j.items || j);

    const list = (levels.levels || levels).slice().sort((a, b) => a.order - b.order);
    console.log(`${list.length} levels, ${ROUNDS} rounds each, ${WALK_MS}ms a step, ${REACT_MS}ms to notice\n`);
    console.log("  #  name                     won   stranded  seats  backlog  short  spare  used   p90");
    console.log("  -- ------------------------ ----- --------- ------ -------- ------ ------ ----- -----");

    const rows = [];
    for (const raw of list) {
        if (ONLY && !ONLY.has(raw.order)) continue;
        const level = Levels.normalise(raw);
        if (UNCAPPED) level.rules = { ...level.rules, seconds: 600 };
        /* THE PUBLIC ROOMS ARE NOT IN HERE. js/room-public.js registers them
           on the page, off data this has no way to fetch, so `get` quietly
           hands back the 8x13 default — and a level played in the wrong room
           reports numbers that are worse than meaningless, because they look
           like numbers. The Library is the one this hits. */
        /* `raw.model` and not the normalised one, because normalise is what
           does the falling back — by the time it has run, a room that does not
           exist has already become the 8x13 default and looks fine. Level 1
           names no model at all, which is not the same thing: it is asking for
           the default and getting it. */
        const layout = W.RoomLayouts.get(raw.model || level.model);
        if (!layout || (raw.model && layout.id !== raw.model)) {
            console.log(`  ${String(raw.order).padStart(2)} ${String(raw.name).slice(0, 24).padEnd(24)}` +
                `  skipped - "${raw.model}" is a room this has no shape for`);
            continue;
        }
        Iso.setLayout(layout);
        let won = 0, stranded = 0, seats = 0, short = 0, spare = 0, used = 0, hung = 0;
        let backlog = 0, worstBacklog = 0;
        const times = [];               // seconds used, per round won
        for (let i = 0; i < ROUNDS; i++) {
            const r = playRound(level, meta, (raw.order * 7919) + i);
            if (r.won) { won++; spare += r.spare; used += r.usedMs; times.push(r.usedMs / 1000); }
            if (r.stranded) stranded++;
            seats += r.seats;
            backlog += r.peakBacklog;
            if (r.peakBacklog > worstBacklog) worstBacklog = r.peakBacklog;
            if (r.dropped < r.planned) short++;      // a seat the round meant to drop and could not
            if (r.why === "hung") hung++;
            if (VERBOSE && (r.stranded || !r.won)) {
                console.log(`        seed ${i}: ${r.why} seats ${r.seats} left ${r.left} stranded ${r.stranded}`);
            }
        }
        const pct = (n) => `${Math.round((n / ROUNDS) * 100)}%`;
        /* THE SLOWEST ROUND, near enough, and not the average one.

           The same level plays differently every time — the zone rolls a near
           corner or a far one, the shuffle puts the last seat behind an
           obstacle — and the clock has to fit the unlucky round, not the
           typical one. A clock set on the mean fails one round in two. p90 is
           the round that goes badly without going wrong. */
        times.sort((a, b) => a - b);
        const at = (q) => times.length ? times[Math.min(times.length - 1, Math.floor(q * times.length))] : 0;
        rows.push({
            order: raw.order, id: raw.id, name: raw.name, won: won / ROUNDS,
            stranded: stranded / ROUNDS, backlog: backlog / ROUNDS, seats: seats / ROUNDS,
            allowed: level.rules.seconds,
            p50: at(0.5), p90: at(0.9), worst: times.length ? times[times.length - 1] : 0,
            spare: won ? spare / won : 0
        });
        console.log(`  ${String(raw.order).padStart(2)} ${String(raw.name).slice(0, 24).padEnd(24)}` +
            ` ${pct(won).padStart(5)} ${pct(stranded).padStart(9)}` +
            ` ${(seats / ROUNDS).toFixed(1).padStart(6)}` +
            ` ${(backlog / ROUNDS).toFixed(1).padStart(4)}/${String(worstBacklog).padEnd(3)}` +
            ` ${pct(short).padStart(6)}` +
            ` ${won ? (spare / won).toFixed(1) : "-"}`.padStart(7) +
            ` ${won ? Math.round(used / won / 1000) + "s" : "-"}`.padStart(6) +
            ` ${won ? at(0.9).toFixed(0) + "s" : "-"}`.padStart(6) +
            (hung ? `  ${hung} hung` : ""));
    }

    const bad = rows.filter(r => r.stranded > 0.02);
    const hard = rows.filter(r => r.won < 0.9);
    /* Over seven is past what a person holds in their head, so the round is
       no longer asking them to remember an order — it is asking them to guess
       one. See the note on the backlog above. */
    const crowded = rows.filter(r => r.backlog > 7);
    const empty = rows.filter(r => r.seats < 1);
    console.log("");
    if (empty.length) console.log(`NO SEATS AT ALL: ${empty.map(r => r.order).join(", ")}`);
    if (bad.length) console.log(`STRANDED SEATS: ${bad.map(r => `${r.order} (${Math.round(r.stranded * 100)}%)`).join(", ")}`);
    if (hard.length) console.log(`A PERFECT PLAYER LOSES: ${hard.map(r => `${r.order} (${Math.round(r.won * 100)}% won)`).join(", ")}`);
    if (crowded.length) console.log(`MORE SEATS THAN ANYONE CAN HOLD: ${crowded.map(r => `${r.order} (${r.backlog.toFixed(1)})`).join(", ")}`);
    if (!bad.length && !hard.length && !crowded.length && !empty.length) {
        console.log("every level winnable, every seat reachable, nothing over seven deep");
    }

    /* WHAT EACH ROUND ASKS FOR, in a file, so the clock can be set from it
       rather than from a guess. Pair it with --uncapped, which is the only
       way these times mean anything; tools/ff-levels-build.js --demand reads
       exactly this. */
    if (OUT) {
        fs.writeFileSync(OUT, JSON.stringify({
            rounds: ROUNDS, reactMs: REACT_MS, walkMs: WALK_MS, uncapped: UNCAPPED,
            levels: rows
        }, null, 1));
        console.log(`-> ${OUT} (${rows.length} levels)`);
    }
})().catch(e => { console.error(e); process.exit(1); });

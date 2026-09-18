/* When the reveal card gives up and fades.

   Pulled out of js/wizard.js and driven against a fake map, because the thing
   it has to get right cannot be seen by looking at it: the card must survive
   the reveal's own flight — which is slow, and is usually still easing when
   the card appears — and must go as soon as the READER moves. Those are the
   same event as far as the map is concerned. Telling them apart is the whole
   trick, and getting it wrong is invisible until somebody watches a card
   vanish the instant it appears, or sits there refusing to leave.

     node tools/test-wizard-reveal-card.js
*/
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "js", "wizard.js"), "utf8");

function grab(name) {
    const start = SRC.indexOf(`    function ${name}(`);
    if (start === -1) throw new Error("not found: " + name);
    let depth = 0;
    for (let j = SRC.indexOf("{", start); j < SRC.length; j++) {
        if (SRC[j] === "{") depth++;
        else if (SRC[j] === "}") { depth--; if (!depth) return SRC.slice(start, j + 1); }
    }
    throw new Error("unbalanced: " + name);
}

// The thresholds come from the source too, so the test cannot drift from it.
const AWAY_MOVE = Number(/const AWAY_MOVE = ([\d.]+)/.exec(SRC)[1]);
const AWAY_ZOOM = Number(/const AWAY_ZOOM = ([\d.]+)/.exec(SRC)[1]);

const STAGE = { width: 800, height: 600, left: 0, top: 0 };

function makeWorld() {
    const world = {
        // Where the two revealed rooms sit on screen, and the zoom.
        rooms: { r1: { x: 400, y: 300 }, r2: { x: 400, y: 300 } },
        zoom: 1,
        inView: true,
        dismissed: false,
        watching: { ids: ["r1", "r2"], seen: true, best: null, bestZoom: 0 }
    };

    const scope = {
        get watching() { return world.watching; },
        set watching(v) { world.watching = v; },
        revealEl: { hidden: false, classList: { contains: () => false } },
        stage: { getBoundingClientRect: () => ({ ...STAGE, right: STAGE.width, bottom: STAGE.height }) },
        view: {
            elementFor: (kind, id) => world.rooms[id] && ({
                getBoundingClientRect: () => {
                    const p = world.rooms[id];
                    return { left: p.x, top: p.y, width: 0, height: 0 };
                }
            }),
            getZoom: () => world.zoom
        },
        revealInView: () => world.inView,
        dismissReveal: () => { world.dismissed = true; },
        clearTimeout: () => {},
        revealTimer: 0,
        AWAY_MOVE, AWAY_ZOOM
    };

    const build = new Function("scope", `
        with (scope) {
            ${grab("revealOffCentre")}
            ${grab("checkRevealAway")}
            return { checkRevealAway, revealOffCentre };
        }
    `);
    const fns = build(scope);
    world.tick = fns.checkRevealAway;
    world.offCentre = fns.revealOffCentre;
    // Move both rooms together, as panning does.
    world.pan = (dx, dy) => {
        for (const id of Object.keys(world.rooms)) {
            world.rooms[id].x += dx;
            world.rooms[id].y += dy;
        }
        world.tick();
    };
    return world;
}

let failures = 0;
function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failures++;
    console.log(`${ok ? "  ok  " : " FAIL "} ${label}`);
    if (!ok) console.log(`         got  ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
}

console.log(`\n(thresholds read from source: move ${AWAY_MOVE} of the frame, zoom ${AWAY_ZOOM} log)\n`);

console.log("--- the reveal's own flight ---");
{
    // The passage starts far off centre and the flight brings it in, easing,
    // over many frames — exactly the situation that used to dismiss it.
    const w = makeWorld();
    for (const id of Object.keys(w.rooms)) { w.rooms[id].x = 400 + 700; w.rooms[id].y = 300 + 500; }
    w.zoom = 1;
    let offset = { x: 700, y: 500 };
    for (let frame = 0; frame < 240; frame++) {
        offset = { x: offset.x * 0.978, y: offset.y * 0.978 };   // the same easing the map uses
        w.zoom = 1 + (4.3 - 1) * (1 - offset.x / 700);
        for (const id of Object.keys(w.rooms)) {
            w.rooms[id].x = 400 + offset.x;
            w.rooms[id].y = 300 + offset.y;
        }
        w.tick();
    }
    check("a long slow flight never dismisses the card", w.dismissed, false);
}

console.log("\n--- the reader ---");
{
    const w = makeWorld();
    w.tick();                                   // settled, dead centre
    w.pan(20, 0);
    check("a small nudge is not moving away", w.dismissed, false);
    w.pan(30, 10);
    check("...nor is a second small nudge", w.dismissed, false);
    w.pan(120, 60);
    check("a real drag dismisses it", w.dismissed, true);
}
{
    const w = makeWorld();
    w.tick();
    // A slow drag in many small steps must still add up: measured against the
    // best position, not against the previous frame.
    for (let k = 0; k < 20 && !w.dismissed; k++) w.pan(12, 0);
    check("a slow drag in small steps adds up", w.dismissed, true);
}
{
    const w = makeWorld();
    w.tick();
    w.zoom = 1.1;
    w.tick();
    check("a small zoom change holds", w.dismissed, false);
    w.zoom = 1.6;
    w.tick();
    check("zooming in properly dismisses it", w.dismissed, true);
}
{
    const w = makeWorld();
    w.tick();
    w.zoom = 0.6;
    w.tick();
    check("and so does zooming out", w.dismissed, true);
}

console.log("\n--- leaving the frame ---");
{
    const w = makeWorld();
    w.tick();
    w.inView = false;
    w.tick();
    check("gone from the frame entirely dismisses it", w.dismissed, true);
}

console.log("\n--- flight, then reader ---");
{
    // The case that matters most: the flight is STILL EASING when the reader
    // takes over. The card must survive the flight and go on the drag.
    const w = makeWorld();
    let offset = { x: 600, y: 400 };
    for (let frame = 0; frame < 60; frame++) {
        offset = { x: offset.x * 0.978, y: offset.y * 0.978 };
        for (const id of Object.keys(w.rooms)) {
            w.rooms[id].x = 400 + offset.x;
            w.rooms[id].y = 300 + offset.y;
        }
        w.tick();
    }
    check("still up while the flight is mid-air", w.dismissed, false);
    w.pan(200, 120);
    check("and gone the moment the reader drags", w.dismissed, true);
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

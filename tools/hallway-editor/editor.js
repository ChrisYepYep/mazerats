/* The Hallway editor. The map is edited here on an isometric grid; the server draws it in the real
   art (render/hw3.js) and that picture sits under the grid. Edits show at once on the grid, and the
   art catches up a moment later.

   Coordinates: "px" is a pixel of the art at 1x, relative to tile 0,0 at height 0.
       px = (x - y) * 16,  py = (x + y) * 8 - z
   Floors are made of 2-tile cells, so they always fall on whole parquet squares. */
"use strict";
const $ = id => document.getElementById(id);
const Z1 = 163;                 // one storey, wall plus slab (hw3.js)
const WALL = 150;
const canvas = $("view"), ctx = canvas.getContext("2d");
const isOn = id => $(id).classList.contains("on");
function setOn(id, on) { $(id).classList.toggle("on", on); $(id).setAttribute("aria-pressed", String(on)); }

let map = null, names = [], difficulty = {};
/* Two maps in one file (12 Nov 2026, the Events Gallery): `root` is the whole file and is the Hallways' own map; `root.gallery` is the
   Events Gallery, a whole map of its own (floors, stairs, lifts, tunnels). `map` is whichever is showing, so every tool works on it as
   before; saving, the draft, undo and publishing take the whole file. */
let root = null, mapNow = "hallway";
const mapOf = p => p === "gallery" ? root && root.gallery : root;
const otherPlace = () => mapNow === "gallery" ? "hallway" : "gallery";
const PLACE_NAME = { hallway: "the Hallways", gallery: "the Events Gallery" };
let level = null;               // the active level
let tool = "pan";
let zoom = 2, cam = { x: 300, y: 150 };
let dirty = false, savedAt = 0;
const undoStack = [], redoStack = [];
let hover = null, drag = null, spaceHeld = false;
/* Wall lights and wall items hang at a set height, in steps of 4; hold Ctrl and move the mouse up or down to change it */
const wallH = { lamp: 106, item: 100 }, itemHeights = {}, WALL_STEP = 4, WALL_RANGE = { lamp: [44, 136], item: [20, 146] };
const wallHeightKind = t => t === "sconce" || t === "globelight" ? "lamp" : isWallItemTool(t) ? "item" : null;
let wallCtrlLast = null, wallCtrlSpare = 0, ctrlNow = false, lampCtrlLast = null;
const snapWall = (h, kind) => Math.max(WALL_RANGE[kind][0], Math.min(WALL_RANGE[kind][1], Math.round(h / WALL_STEP) * WALL_STEP));
let doorCarry = null;     // a door on its way to another floor: the next click on a wall there puts it down
let backHeld = false;     // hold B with the globe wall light: a pillar's faces turned away from you
let lastClient = null;
let seeCut = null, lastMouse = null;      // see-through: floor above this height is out of the view and can't be clicked, while X is held
let walker = null;              // { lv, x, y, path, ... } during Walk
const avatarImgs = {}; let avatarWas = {};

const LIGHTS = { day: "Daylight", dusk: "Evening", dawn: "Dawn", sconces: "Sconces on", night: "Night lights", failing: "Half the bulbs gone", cold: "Cold fluorescent", gas: "Gaslight" };
const WAYS = { oxblood: "Oxblood", slate: "Slate", sage: "Sage", mauve: "Dusty mauve", ochre: "Old ochre", teal: "Faded teal", clay: "Clay", ash: "Ash" };
const MAIN_TOOLS = [
    ["select", "Select and move (V)", '<path d="M5 3l14 9-6 1.5L10 20z" fill="currentColor"/>'],
    ["pan", "Move the view (H)", '<path d="M12 3v18M3 12h18M12 3 9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>']
];
const H_ = "art/hall/hh_room_hallway/", T_ = "art/thumbs/";
const ICON = {
    smallfloor: '<svg viewBox="0 0 40 40"><path d="M20 6 38 15 20 24 2 15Z" fill="#c9995c" stroke="#3a2412"/><path d="M11 10.5 29 19.5M15.5 8.25 33.5 17.25M24.5 8.25 6.5 17.25M29 10.5 11 19.5M6.5 12.75 24.5 21.75M33.5 12.75 15.5 21.75" stroke="#5a3a1c" stroke-width="1"/></svg>',
    arrow: '<svg viewBox="0 0 40 40"><path d="M20 6 38 15 20 24 2 15Z" fill="#c9995c" stroke="#3a2412"/><path d="M27 16.5 12 15.5 18 11Z" fill="none" stroke="#4a2c12" stroke-width="1.6"/></svg>',
    erase: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 5l9 5-9 5-9-5z"/><path d="M8 19h8"/></svg>',
    del: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    halfwall: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 6l9 4.5V21l-9-4.5z" stroke-dasharray="2.5 2.5"/><path d="M3 12l9 4.5V21l-9-4.5z" fill="currentColor" fill-opacity=".25"/><path d="M12 16.5L21 12v4.5L12 21"/></svg>',
    addwall: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 6l9 4.5V21l-9-4.5z"/><path d="M18 5v6M15 8h6"/></svg>',
    nowall: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 6l9 4.5V21l-9-4.5z" stroke-dasharray="2.5 2.5"/><path d="M15 6l6 6M21 6l-6 6"/></svg>',
    raise: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 9l9 5-9 5-9-5z"/><path d="M12 7V2M9 5l3-3 3 3"/></svg>',
    lower: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 9l9 5-9 5-9-5z"/><path d="M12 2v5M9 4l3 3 3-3"/></svg>',
    edges: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="6" width="16" height="12" stroke-dasharray="3 2"/></svg>'
};
const PLANTERS = [["ero_stone", "Stone planter"], ["ero_walnut", "Walnut planter"], ["ero_evergreen", "Evergreen planter"], ["ero_flower", "Flower planter"]];
const EDGE_STYLES = [["wood", "Dark oak rail"], ["gold", "Gold rail"]];
const WALL_ITEMS = window.WALL_ITEMS || [], WALL_GROUPS = [["painting", "Hallway paintings"], ["custom", "More paintings"], ["window", "Windows"], ["hotel", "The old hotel"], ["leet", "The Leet Show"], ["tell", "Wear and tear"], ["gallery", "Events Gallery: on walls"]];
const TOOLS = [
    ["Floors", [["floor", "Paint floor", T_ + "floor.png"], ["erase", "Remove floor", ICON.erase], ["rug", "Rug", T_ + "rug.png"], ["smallfloor", "Small squares floor", ICON.smallfloor], ["mark_arrow", "Arrow tile (links to another)", ICON.arrow], ["medal", "Carpet crest", T_ + "crest.png"], ["height", "Floor height", ICON.raise], ["floorlift", "Raise the floor only (walls stay)", ICON.raise], ["steps", "Small steps", T_ + "stair.png"]]],
    ["On walls", [["door", "Door", T_ + "door.png"], ["halfwall", "Half wall", ICON.halfwall], ["nowall", "No wall", ICON.nowall], ["addwall", "Show wall", ICON.addwall], ["sconce", "Wall light", T_ + "sconce.png"], ["globelight", "Globe wall light", "art/sconce-globe-y.png"], ["entrance", "Entrance", H_ + "entry_upper_right_mask.png"], ["theatre", "Theatredrome entrance (for show)", H_ + "entry_upper_right_mask.png"], ["tunnel", "Tunnel (walk through it)", H_ + "entry_upper_right_mask.png"], ["lift", "Lift", T_ + "lift.png"], ["stair", "Stairs: straight", T_ + "stair.png"], ["turn", "Stairs: turning", T_ + "turn.png"], ["side", "Stairs: left wall", T_ + "side.png"], ["sideturn", "Stairs: left wall, turning", T_ + "sideturn.png"]]],
    ["Furniture", [["sofa", "Sofa", T_ + "sofa.png"], ["chair", "Chair", H_ + "hw_chair_a_0_2_0.png"], ["barstool", "Arcade stool", "art/wall/i_barstool.png"], ["leetstand", "Poster stand: The Leet Show", "art/wall/i_leetstand.png"], ["leetstand2", "Poster stand, narrow: The Leet Show", "art/wall/i_leetstand2.png"], ["table", "Table", T_ + "table.png"], ["smtable", "Small round table", H_ + "hw_smtble_a_0_0_0.png"], ["ballpost", "Ball post", H_ + "pillar0_a_0_0_0.png"], ["rope", "Rope barrier", T_ + "rope.png"], ["archway", "Archway (drag it out)", H_ + "entry_upper_right_mask.png"], ["lamp", "Floor lamp", T_ + "lamp.png"], ["plant", "Plant", H_ + "hw_plant_a_0_0_0.png"], ["plant_palm", "Palm, terracotta pot", "art/wall/i_plant_palm.png"], ["plant_orange", "Orange tree, brass pot", "art/wall/i_plant_orange.png"], ["plant_bonsai", "Bonsai, walnut pot", "art/wall/i_plant_bonsai.png"], ["plant_roses", "Roses in a vase", "art/wall/i_plant_roses.png"], ["plant_cactus", "Cactus, terracotta pot", "art/wall/i_plant_cactus.png"], ["plant_bay", "Clipped bay, brass pot", "art/wall/i_plant_bay.png"], ["plant_sunflower", "Sunflower in a vase", "art/wall/i_plant_sunflower.png"], ["ero", "Planter", T_ + "planter.png"], ...PLANTERS.map(([k, name]) => [k, name, T_ + "planter-" + k.slice(4) + ".png"]), ["pillar", "Pillar", H_ + "pillar1_a_0_0_0.png"], ["pillartall", "Tall pillar", T_ + "pillartall.png"], ["statue", "Statue", H_ + "hw_statue_a_0_0_0.png"], ["fountain", "Fountain", H_ + "hw_fountain_a_0_0_0.png"], ["shelf", "Bookcase", H_ + "hw_shelf_a_0_4_0.png"], ["cabinet", "Cabinet", H_ + "hw_closet1_a_0_2_0.png"], ["water", "Water cooler", H_ + "hw_watermatic_a_0_4_0.png"], ["tablelamp", "Globe table lamp", "art/wall/i_tablelamp.png"], ["rarecase", "Rare in a glass case", "art/wall/i_rarecase.png"], ["trophy", "Old trophy cabinet", "art/wall/i_trophy.png"], ["mark_scuff", "Floor scuffs", "art/wall/i_mark_scuff.png"], ["mark_tile", "Lifted floor tile", "art/wall/i_mark_tile.png"]]],
    ["Events Gallery", [["ghsofa", "Lobby sofa (drag it out)", H_ + "gh_sofab_a_0_4_0.png"], ["ghchair", "Lobby armchair", H_ + "gh_chair_a_0_4_0.png"], ["ghlowtable", "Lobby low table", H_ + "gh_sofatable_a_0_4_0.png"], ["ghoval", "Lobby oval table", H_ + "gh_table_a_0_6_0.png"], ["gh_plinth_marble", "Marble plinth", "art/wall/g_gh_plinth_marble_meiping.png"], ["gh_plinth_black", "Black plinth", "art/wall/g_gh_plinth_black_cup.png"], ["gh_plinth_column", "Fluted column", "art/wall/g_gh_plinth_column_celadon.png"], ["gh_placard", "Placard", "art/wall/g_gh_placard.png"], ["mark_year", "Year plate, brass (R turns it)", "art/wall/g_mark_year.png"], ["mark_year_steel", "Year plate, steel (R turns it)", "art/wall/g_mark_year_steel.png"], ["plant_yukka", "Yukka palm", "art/wall/g_plant_yukka.png"], ["plant_fruittree", "Fruit tree", "art/wall/g_plant_fruittree.png"], ["plant_bigcactus", "Big cactus", "art/wall/g_plant_bigcactus.png"], ["plant_minibonsai", "Bonsai, small", "art/wall/g_plant_minibonsai.png"], ["plant_pineapple", "Pineapple plant", "art/wall/g_plant_pineapple.png"]]],
    ...WALL_GROUPS.map(([kind, title]) => [title, WALL_ITEMS.filter(i => i.kind === kind).map(i => ["wi:" + i.id, i.name, "art/wall/" + i.y.layers[0].f])]),
    ["Games", [["arcade_ff", "Arcade: Fallin' Furni", "art/wall/i_arcade_ff.png"], ["arcade_pura", "Arcade: Pura Panic", "art/wall/i_arcade_pura.png"], ["arcade_guess", "Arcade: Guess the Maze", "art/wall/i_arcade_guess.png"], ["arcade_odd", "Arcade: Odd One Out", "art/wall/i_arcade_odd.png"], ["arcade_scout", "Arcade: green (no game yet)", "art/wall/i_arcade_scout.png"], ["arcade_quiz", "Arcade: purple (no game yet)", "art/wall/i_arcade_quiz.png"]]],
    ["Christmas", [["garland", "Garland (drag along a wall)", "art/wall/i_swag.png"], ["garland2", "Garland, two tiles", "art/wall/i_swag.png"], ["festoon", "Festoon lights (drag along a wall)", "art/wall/i_festoon.png"], ["xmastree", "Christmas tree", "art/wall/i_xmastree.png"], ["xmasfir", "Christmas tree, our own, 1 tile", "art/wall/i_xmasfir.png"], ["xmasfir2", "Christmas tree, our own, 2 tiles", "art/wall/i_xmasfir2.png"], ["xmasfir4", "Christmas tree, our own, 4 tiles", "art/wall/i_xmasfir4.png"], ["xmassmalltree", "Small tree", "art/wall/i_xmassmalltree.png"], ["snowman", "Snowman", "art/wall/i_snowman.png"], ["xmaslantern", "Lantern", "art/wall/i_xmaslantern.png"], ["xmasdrinks", "Christmas drinks", "art/wall/i_xmasdrinks.png"], ["xmasduck", "Christmas duck", "art/wall/i_xmasduck.png"], ["gift1", "Gift", "art/wall/i_gift1.png"], ["gift2", "Gift, blue", "art/wall/i_gift2.png"], ["gift3", "Gift, green", "art/wall/i_gift3.png"], ["gift4", "Gift, gold", "art/wall/i_gift4.png"], ["gift5", "Present, red", "art/wall/i_gift5.png"], ["gift6", "Present, lime", "art/wall/i_gift6.png"], ["gift7", "Present, purple", "art/wall/i_gift7.png"], ["gift8", "Present, orange", "art/wall/i_gift8.png"], ["gift9", "Present, yellow", "art/wall/i_gift9.png"], ["gift10", "Present, pink", "art/wall/i_gift10.png"], ["gift11", "Present, silver", "art/wall/i_gift11.png"], ...WALL_ITEMS.filter(i => i.kind === "xmas").map(i => ["wi:" + i.id, i.name, "art/wall/" + i.y.layers[0].f])]],
    ["Railings", EDGE_STYLES.map(([k, name]) => ["edge:" + k, name, "art/edge-" + k + ".png"])],
    ["Tidy", [["del", "Delete things", ICON.del], ["edges", "Map edges", ICON.edges]]]
];
const XMAS_PROP = k => k === "xmastree" || k === "xmassmalltree" || k === "snowman" || k === "xmaslantern" || k === "xmasdrinks" || k === "xmasduck" || k === "xmasfir" || k === "xmasfir2" || k === "xmasfir4" || /^gift\d+$/.test(k);
const wallItemOf = id => WALL_ITEMS.find(i => i.id === id) || null;
const isWallItemTool = t => !!t && t.startsWith("wi:");
const isEdgeTool = t => !!t && t.startsWith("edge:");
const TOOL_NAMES = { select: "Select and move", pan: "Move the view", walk: "Walking" };
for (const [, list] of TOOLS) for (const [id, label] of list) TOOL_NAMES[id] = label;
function thumbEl(src) {
    if (src && src.startsWith("<svg")) { const d = document.createElement("span"); d.className = "thumb"; d.innerHTML = src; return d; }
    const i = document.createElement("img"); i.className = "thumb"; i.alt = ""; i.src = src; return i;
}
const HINTS = {
    /* (10 Nov scan, editor 20) these five showed the furniture hint */
    smallfloor: "Drag across the floor to lay the small squares floor over it. Its colour is the floor's own.",
    theatre: "Click a wall to put the Theatredrome's entrance there. Drag it along the wall to move it.",
    garland: "Drag along a wall to hang a garland as long as you like. It shows at Christmas only; its baubles' colours are on the Map tab.",
    garland2: "Click a wall to hang a garland two tiles long. It shows at Christmas only.",
    festoon: "Drag along a wall to string festoon lights as long as you like. Select them to choose the bulbs, a twinkle and the height. Christmas only.",
    sofa: "Drag along the floor to draw it as long as you like, or click for the usual size. The way you drag sets which way it runs, and Shift or R turns it.",
    rope: "Drag along the floor to draw it as long as you like, or click for 3 tiles. Nobody can walk through it. The way you drag sets which way it runs, and Shift or R turns it. Select it to take its card off.",
    table: "Drag along the floor to draw it as long as you like, or click for the usual size. The way you drag sets which way it runs, and Shift or R turns it.",
    ero: "Drag along the floor to draw it as long as you like, or click for the usual size. The way you drag sets which way it runs, and Shift or R turns it.",
    select: "Click anything to select it, drag to move it, Delete to remove it. Drag a rug's edge to resize it. Drag empty floor to move the view.",
    pan: "Drag to move. Scroll to zoom. Hold Space with any tool to move.",
    walk: "Click a floor to walk your Habbo there, up stairs too. Click the tile a seat stands on to sit. Double-click a water cooler for a drink, or a lift to open it. Walk back into the entrance to leave.",
    floor: "Drag on the active floor to paint it, in whole parquet squares.",
    erase: "Drag to remove floor. Anything standing on it goes too.",
    rug: "Drag a rectangle of rug. Rugs that touch join up into one. Hold the right button and drag over a rug to rub it out like a brush.",
    halfwall: "Click or drag along a wall to cut it to half height, tile by tile. Click or drag along a half wall to put it back to full height. Tiles with a door, wall light or something hanging on them stay full height.",
    addwall: "Where a floor's edge looks out over the floor below, the map leaves the wall off. Dashed green lines show those edges: click or drag along one to put the wall there. Solid green lines are walls you've added: click or drag along one to take it off again.",
    nowall: "Click or drag along a wall to take it away, tile by tile. Red lines show where a wall's gone: click or drag along one to bring it back. Tiles with a door, wall light or something hanging on them keep their wall.",
    height: "Pick a height in the bar on the map, then drag over floor to set it to exactly that. Hold Ctrl and move the mouse up or down to change the height. 0 is level.",
    floorlift: "Raises the floor, what stands on it and its doors, but not its walls: they keep their tops and stand shorter. Pick a height in the bar, then drag over floor. 0 puts it back.",
    steps: "Hover where two heights meet, on any side, and drag along it to lay steps from there to where you let go. Select them afterwards to move them or change the width.",
    medal: "Click to put the carpet crest down. Use Select and move to move it after.",
    door: "Click a top wall to add a door. It takes the next maze without one. To change it, select the door and use its Maze list.",
    globelight: "Click a wall to hang a small globe light, or a pillar's face to fix one there. Hold B for the faces turned away from you. Click the same face again to take it off. Hold Ctrl and move the mouse up or down to change the height.",
    sconce: "Click a top wall to hang a wall light. It lights the wall and floor around it. Hold Ctrl and move the mouse up or down to change the height.",
    lift: "Click a wall to add a lift, a back wall or a left one. Put in as many as you like: each one can take you to any other.",
    tunnel: "Click a wall to put a tunnel there: Habbos can walk into it. A second tunnel links to the first, and walking to the back of one brings you out of the other. Choose where each leads in Select and move. Clicking one again takes it away.",
    entrance: "Click a wall to put the entrance there. There's one: Habbos arrive through it, and walking back in leaves the hallway.",
    stair: "Click a back wall: a straight flight, cut into the wall, up to the next floor.",
    turn: "Click a back wall: a flight up to a landing, turning left inside the wall.",
    side: "Click a top-left wall: a flight climbing left through it.",
    sideturn: "Click a top-left wall: a flight up to a landing, turning right inside the wall.",

    del: "Click anything to delete it straight away. Undo brings it back.",
    edges: "Drag an edge of the gold rectangle: the camera stops there."
};

/* ---------- geometry ---------- */
const P = (x, y, z) => [(x - y) * 16, (x + y) * 8 - (z || 0)];
const levelZ = l => l.k * Z1;
/* A floor's height within itself, as in the real hallways: l.rise holds a cell's height in pixels, a whole number of steps. The
   client's own short flights are 4px a step, 6px deep. */
const HEIGHT = 1, STEP_R = 4, STEP_D = 6 / 16, MAX_RISE = 64;
const heightAt = (l, x, y) => ((l.rise && l.rise[cellKey(x, y)]) || 0) + ((l.floorLift && l.floorLift[cellKey(x, y)]) || 0);
/* A lift on a back wall is { level, x, y }: x its first tile along the wall, y the wall's line. On a left wall (13 Nov 2026, his: "Lifts can't
   be placed on all walls") it is { level, axis: "y", x, y }: x the wall's line, y its first tile along it, the back wall's lift mirrored.
   liftPt gives a tile by the back wall's terms: a tiles along from its first, b out from the wall (negative: into the cabin). */
const liftLeft = q => q.axis === "y", liftAxis = q => liftLeft(q) ? "y" : "x", liftLine = q => liftLeft(q) ? q.x : q.y, liftAlong = q => liftLeft(q) ? q.y : q.x;
const liftPt = (q, a, b) => liftLeft(q) ? [q.x + b, q.y + a] : [q.x + a, q.y + b];
const liftLocal = (q, x, y) => liftLeft(q) ? [y - q.y, x - q.x] : [x - q.x, y - q.y];
/* the floor in front of it that has to stay level: 3 tiles out, from a tile before it to past its call plate */
const liftFront = q => { const a = liftPt(q, -1, 0), b = liftPt(q, 5, 3); return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) }; };
/* the height a cell's walls stand at: its rise alone, not the lift that raises only its floor (render/hw3.js patchesByHeight) */
const wallHeightAt = (l, x, y) => (l.rise && l.rise[cellKey(x, y)]) || 0;
const tileZ = (l, x, y) => levelZ(l) + heightAt(l, x, y) + (landingOf(l, x, y) ? LANDING : 0);
/* every height a floor stands at: its rise and its floor-only lift together, as heightAt has them (10 Nov 2026: lifted floor was missing,
   so it was picked through and X couldn't cut at it) */
const allHeights = l => { if (!l.rise && !l.floorLift) return [0]; const R = l.rise || {}, F = l.floorLift || {}, s = new Set([0]); for (const c of l.cells) s.add((R[c] || 0) + (F[c] || 0)); return [...s].sort((a, c) => c - a); };
/* tileIn's answer for a floor hidden by X: no tile at all */
const hiddenTile = t => t[0] <= -1e5;
const heightsOf = l => { const all = allHeights(l); return seeCut !== null && l === level ? all.filter(h => h <= seeCut) : all; };
const seeHidden = (l, h) => seeCut !== null && l === level && h > seeCut;
/* the older form: whole levels of 32px */
function migrateHeights(m) {
    if (m.lift) { m.lifts = m.lifts || [m.lift]; delete m.lift; } m.lifts = m.lifts || [];
    for (const l of m.levels) delete l.teles;                   // Imperial Teleports are gone: lifts do that now
    /* windows used to be placed looking at the lawn whatever you chose, so every one showed the same: once, those go to "whatever's behind it" (14 Nov 2026) */
    if (!m.winViews) { for (const l of m.levels) for (const it of (l.wallItems || [])) if (it.k === "i_window" && it.view === "lawn") delete it.view; m.winViews = 1; }
    for (const l of m.levels) if (l.edgeItems) { for (const q of l.edgeItems) q.s = { brass: "gold", iron: "gold", bronze: "gold", banister: "wood", rope: "wood" }[q.s] || q.s; l.edgeItems = l.edgeItems.filter(q => EDGE_STYLES.some(e => e[0] === q.s)); if (!l.edgeItems.length) delete l.edgeItems; }   // edge planters became furniture
    /* the player wall items went. A kind this editor doesn't know is never dropped (15 Nov scan, editor 2): it's kept aside in wallItemsOff,
       listed on the Problems tab to remove, and comes back by itself if its kind does. Without the list at all the editor doesn't open (start) */
    if (WALL_ITEMS.length) for (const l of m.levels) {
        const known = q => WALL_ITEMS.some(i => i.id === q.k), all = [...(l.wallItems || []), ...(l.wallItemsOff || [])];
        if (!all.length) continue;
        const on = all.filter(known), off = all.filter(q => !known(q));
        if (on.length) l.wallItems = on; else delete l.wallItems;
        if (off.length) l.wallItemsOff = off; else delete l.wallItemsOff;
    }
    for (const l of m.levels) if (l.halfWalls) { const out = new Set(l.halfTiles || []); for (const k of l.halfWalls) { const [a, n, c] = k.split("|"); out.add(a + "|" + n + "|" + (+c * 2)); out.add(a + "|" + n + "|" + (+c * 2 + 1)); } delete l.halfWalls; l.halfTiles = [...out]; }
    for (const l of m.levels) if (l.heights) { const r = {}; for (const [k, v] of Object.entries(l.heights)) if (v) r[k] = v * 32; delete l.heights; if (Object.keys(r).length) l.rise = r; }
}
/* A flight stands on the lower floor. dir "back" climbs away from you, in full view; "front" climbs towards you, its fronts hidden. */
function flightOf(l, st) {
    const t = st.a, inBack = st.axis === "y" ? heightAt(l, t, st.line - 1) : heightAt(l, st.line - 1, t), inFront = st.axis === "y" ? heightAt(l, t, st.line) : heightAt(l, st.line, t), toYou = st.dir === "front";
    const rise = toYou ? inFront - inBack : inBack - inFront; if (rise <= 0) return null;
    const depth = (rise / STEP_R) * STEP_D, from = toYou ? st.line - depth : st.line;
    return { rise, depth, from, to: from + depth, toYou };
}
const stepRise = (l, st) => { const f = flightOf(l, st); return f ? f.rise : 0; };
function stepLift(l, x, y) {
    for (const st of (l.steps || [])) {
        const f = flightOf(l, st); if (!f) continue;
        const across = st.axis === "y" ? x : y, c = (st.axis === "y" ? y : x) + .5;
        if (across >= st.a && across < st.b && c >= f.from && c <= f.to) return f.rise * (f.toYou ? c - f.from : f.to - c) / f.depth;
    }
    return 0;
}
const stepsAt = (l, x, y) => (l.steps || []).find(st => { const f = flightOf(l, st), across = st.axis === "y" ? x : y, along = st.axis === "y" ? y : x; return f && across >= st.a && across < st.b && along + 1 > f.from && along < f.to; }) || null;
/* may you walk from one tile to the next? On the level, or along a flight: its own tiles and the row at each end. */
function canStep(l, x, y, nx, ny) {
    if (Math.abs(nodeZ(l, x, y) - nodeZ(l, nx, ny)) <= 1) return true;
    return (l.steps || []).some(st => {
        const f = flightOf(l, st); if (!f) return false;
        const lo = Math.floor(f.from) - 1, hi = Math.ceil(f.to);      // its own tiles, and the level row just past each end, whatever the flight's length
        const inBand = (X, Y) => { const across = st.axis === "y" ? X : Y, along = st.axis === "y" ? Y : X; return across >= st.a && across < st.b && along >= lo && along <= hi; };
        return inBand(x, y) && inBand(nx, ny);
    });
}
/* which tile the mouse is on, on a floor that may have parts at different heights: of two on a line of sight, the higher is nearer */
function tileIn(l, px, py) {
    for (const st of (l.steps || [])) {
        const f = flightOf(l, st); if (!f) continue;
        for (let along = Math.floor(f.from); along < f.to; along++) for (let across = st.a; across < st.b; across++) {
            const x = st.axis === "y" ? across : along, y = st.axis === "y" ? along : across, zf = tileZ(l, x, y) + stepLift(l, x, y), t = pxToTile(px, py, zf); if (seeHidden(l, zf - levelZ(l))) continue;
            if (Math.floor(t[0]) === x && Math.floor(t[1]) === y) {
                for (const h of heightsOf(l)) { const z2 = levelZ(l) + h * HEIGHT; if (z2 <= zf) continue; const t2 = pxToTile(px, py, z2), X2 = Math.floor(t2[0]), Y2 = Math.floor(t2[1]); if (hasFloor(l, X2, Y2) && heightAt(l, X2, Y2) === h) return t2; }
                return t;
            }
        }
    }
    for (const h of heightsOf(l)) { const t = pxToTile(px, py, levelZ(l) + h * HEIGHT), X = Math.floor(t[0]), Y = Math.floor(t[1]); if (hasFloor(l, X, Y) && heightAt(l, X, Y) === h) return t; }
    const flat = pxToTile(px, py, levelZ(l));
    return seeHidden(l, heightAt(l, Math.floor(flat[0]), Math.floor(flat[1]))) ? [-1e6, -1e6] : flat;
}
/* the floor height at a wall thing: its line, on the tile it stands against */
const wallZ = (l, q) => levelZ(l) + (q.axis === "x" ? wallHeightAt(l, Math.floor(q.at), q.line) : wallHeightAt(l, q.line, Math.ceil(q.at) - 1));
function toPx(sx, sy) { const r = canvas.getBoundingClientRect(), w = r.width, h = r.height; return [(sx - r.left - w / 2) / zoom + cam.x, (sy - r.top - h / 2) / zoom + cam.y]; }
function toScreen(px, py) { return [(px - cam.x) * zoom + canvas.width / 2, (py - cam.y) * zoom + canvas.height / 2]; }
window.__active = () => level;
function pxToTile(px, py, z) { const ry = py + (z || 0); return [(px + 2 * ry) / 32, (2 * ry - px) / 32]; }
const cellKey = (x, y) => Math.floor(x / 2) + "," + Math.floor(y / 2);
let cellSets = new Map();
function cells(l) { let s = cellSets.get(l); if (!s || s.n !== l.cells.length) { s = new Set(l.cells); s.n = l.cells.length; cellSets.set(l, s); } return s; }
const hasFloor = (l, x, y) => cells(l).has(cellKey(x, y));
const byId = id => map.levels.find(l => l.id === id);

/* which wall the mouse is on: walk up the wall from the floor line to its top */
/* an edge that looks out over the floor below has no wall, unless a floor above encloses it */
function wallStands(l, X, Y, axis) {
    if (isShown(l, axis, axis === "x" ? Y + 1 : X + 1, axis === "x" ? X : Y)) return true;
    const below = map.levels.find(q => q.k === l.k - 1), above = map.levels.find(q => q.k === l.k + 1);
    if (!(below && hasFloor(below, X, Y)) || (above && hasFloor(above, X, Y))) return true;
    /* a door needs a wall to hang in: an edge with a door on it keeps its wall all along */
    if (axis === "x") { const Y0 = Y + 1, ds = (l.doors || []).filter(d => d.axis === "x" && d.line === Y0); if (!ds.length) return false; let a = X, b = X; while (hasFloor(l, a - 1, Y0) && !hasFloor(l, a - 1, Y)) a--; while (hasFloor(l, b + 1, Y0) && !hasFloor(l, b + 1, Y)) b++; return ds.some(d => d.at + 1 >= a && d.at <= b); }
    if (axis === "y") { const X0 = X + 1, ds = (l.doors || []).filter(d => d.axis === "y" && d.line === X0); if (!ds.length) return false; let a = Y, b = Y; while (hasFloor(l, X0, a - 1) && !hasFloor(l, X, a - 1)) a--; while (hasFloor(l, X0, b + 1) && !hasFloor(l, X, b + 1)) b++; return ds.some(d => d.at - 1 >= a && d.at - 2 <= b); }
    return false;
}
function wallAt(px, py, l, full) {
    /* walking down from the point, the first wall met is the furthest back: where walls step forward a cell at a time, a point on a nearer
       wall's face also lies over the floor in front of the wall behind it. The nearest wall that reaches the point is the one you see, so
       keep looking and take the last found (9 Nov 2026, his: garlands couldn't be laid on short walls; the click went to the wall behind) */
    for (const dz of heightsOf(l)) { let found = null;
        for (let h = 0; h <= WALL; h += 4) {
            const [fx, fy] = pxToTile(px, py + h, levelZ(l) + dz * HEIGHT), X = Math.floor(fx), Y = Math.floor(fy);
            /* a point h up a wall: walk back to the wall's floor line */
            /* a tile already answered keeps its first answer, as before (its corner picks the wall by where the point first crosses it) */
            if (found && found.tile === X + "," + Y) continue;
            const was = found;
            if (hasFloor(l, X, Y) && heightAt(l, X, Y) === dz) {
                const backOpen = !hasFloor(l, X, Y - 1) && fy - Y < .5 && wallStands(l, X, Y - 1, "x"), leftOpen = !hasFloor(l, X - 1, Y) && fx - X < .5 && wallStands(l, X - 1, Y, "y");
                if (backOpen && (full || (!isNone(l, "x", Y, X) && (h <= HALF_WALL || !isHalf(l, "x", Y, X))))) found = { axis: "x", at: X, line: Y, tile: X + "," + Y };
                else if (leftOpen && (full || (!isNone(l, "y", X, Y) && (h <= HALF_WALL || !isHalf(l, "y", X, Y))))) found = { axis: "y", at: Y + 1, line: X, tile: X + "," + Y };
                else if (fy - Y < .5 && isDrop(l, "x", Y, X) && h <= retaining(l, "x", Y, X).H && (full || !isNone(l, "x", Y, X))) found = { axis: "x", at: X, line: Y, drop: true, tile: X + "," + Y };
                else if (fx - X < .5 && isDrop(l, "y", X, Y) && h <= retaining(l, "y", X, Y).H && (full || !isNone(l, "y", X, Y))) found = { axis: "y", at: Y + 1, line: X, drop: true, tile: X + "," + Y };
            }
            /* only a wall in front takes over: another line nearer the viewer, or the other way round where walls step; further along the same wall, the first tile stays */
            if (was && found !== was) { const ax = found.axis, ln = found.line, X2 = ax === "x" ? found.at : ln, Y2 = ax === "x" ? ln : found.at - 1, drawn = !isNone(l, ax, ln, ax === "x" ? X2 : Y2) && (h <= HALF_WALL || !isHalf(l, ax, ln, ax === "x" ? X2 : Y2));
                if ((ax === was.axis && ln <= was.line) || !drawn) found = was; }   // and a wall not drawn (none, or a half wall below the point) hides nothing
        }
        if (found) { delete found.tile; return found; } }
    return null;
}
/* the flights that go through a top-left wall: "side" straight on, "sideturn" turning at a landing. A "sideturn" is a "turn" mirrored, x for y. */
const thruLeft = st => st.kind === "side" || st.kind === "sideturn";
const sideTurnRects = (x, a) => [{ x0: x - 10, x1: x, y0: a, y1: a + 6 }, { x0: x - 10, x1: x - 6, y0: a - 4, y1: a }];
/* A turning stair's landing, which furniture can stand on, 96px up from the floor below */
const LANDING = 96;
const landingRect = st => st.kind === "turn" ? { x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y - 6 } : st.kind === "sideturn" ? { x0: st.x - 10, x1: st.x - 6, y0: st.a, y1: st.b } : null;
const landingOf = (l, x, y) => map.stairs.find(st => { if (st.low !== l.id) return false; const r = landingRect(st); return r && inRect(r, x, y); }) || null;
const placeable = (l, x, y) => hasFloor(l, x, y) || !!landingOf(l, x, y);
/* The walls you can see inside a stairwell. on: which of the stair's measures the wall's line follows, for moving things with it */
function stairWallsOf(st) {
    if (st.kind === "straight") return [{ axis: "y", line: st.a, t0: st.y - 10, t1: st.y, on: "a" }];
    if (st.kind === "side") return [{ axis: "x", line: st.a, t0: st.x - 10, t1: st.x, on: "a" }];
    if (st.kind === "turn") return [{ axis: "y", line: st.a, t0: st.y - 6, t1: st.y, on: "a" }, { axis: "x", line: st.y - 10, t0: st.a - 4, t1: st.b, on: "l" }];
    if (st.kind === "sideturn") return [{ axis: "x", line: st.a, t0: st.x - 6, t1: st.x, on: "a" }, { axis: "y", line: st.x - 10, t0: st.a - 4, t1: st.b, on: "l" }];
    return [];
}
const onSeg = (seg, q) => { const t = q.axis === "x" ? Math.floor(q.at) : Math.ceil(q.at) - 1; return seg.axis === q.axis && seg.line === q.line && t >= seg.t0 && t < seg.t1; };
const onStairWall = (l, q) => map.stairs.some(st => st.low === l.id && stairWallsOf(st).some(seg => onSeg(seg, q)));
/* a stairwell is only seen through its opening: no floor above in the way, and no wall of this floor in front */
function throughOpening(px, py, l, st) {
    const up = byId(st.up); if (up) { const f = pxToTile(px, py, levelZ(up)), X = Math.floor(f[0]), Y = Math.floor(f[1]); if (hasFloor(up, X, Y) && !holes(up).some(r => inRect(r, X, Y))) return false; }
    const r = wallAt(px, py, l); return !r || map.stairs.some(s => s.low === l.id && (thruLeft(s) ? r.axis === "y" && s.x === r.line && r.at > s.a && r.at <= s.b : r.axis === "x" && s.y === r.line && r.at >= s.a && r.at < s.b));
}
function stairWallAt(px, py, l) {
    const lz = levelZ(l), M = stairLevels();
    for (const st of map.stairs) {
        if (st.low !== l.id || !throughOpening(px, py, l, st)) continue;
        const segs = stairWallsOf(st), S = M.list.find(q => q.stair && q.stair.st === st); if (!S || !segs.length) continue;
        /* of two points on a line of sight the higher is nearer, so look from the top down */
        for (let h = WALL; h >= 0; h -= 4) {
            const [fx, fy] = pxToTile(px, py + h, lz), X = Math.floor(fx), Y = Math.floor(fy);
            for (const seg of segs) {
                const hit = seg.axis === "x" ? Y === seg.line && fy - Y < .5 && X >= seg.t0 && X < seg.t1 : X === seg.line && fx - X < .5 && Y >= seg.t0 && Y < seg.t1; if (!hit) continue;
                const z = S.tiles.get(X + "," + Y); if (z === undefined || lz + h < z - 4) continue;      // that's behind the steps
                return { axis: seg.axis, at: seg.axis === "x" ? X : Y + 1, line: seg.line, stair: st, floor: z - lz };
            }
        }
    }
    return null;
}
/* for things that hang on a wall: a real wall, or else a stairwell's */
function hangWallAt(px, py, l) {
    const r = wallAt(px, py, l), inOpening = r && map.stairs.some(s => s.low === l.id && (thruLeft(s) ? r.axis === "y" && s.x === r.line && r.at > s.a && r.at <= s.b : r.axis === "x" && s.y === r.line && r.at >= s.a && r.at < s.b));
    return r && !inOpening ? r : stairWallAt(px, py, l) || r;
}
/* for garlands and festoons: any wall, hidden ones too, or a stairwell's, which the renderer hangs them on under the floor above (9 Nov 2026, his) */
function garlandWallAt(px, py, l) {
    /* a garland hangs right under the edge of the floor above, so that's where it gets clicked: a click on the edge itself, or just under it
       where a stairwell's wall is taller than a room's, looks a little further down the wall (9 Nov 2026, his: couldn't lay them along the stairs) */
    for (const dy of [0, 8, 16, 24, 32]) { const w = garlandWallAt1(px, py + dy, l); if (w) return w; }
    return null;
}
function garlandWallAt1(px, py, l) {
    const r = wallAt(px, py, l, true), inOpening = r && map.stairs.some(s => s.low === l.id && (thruLeft(s) ? r.axis === "y" && s.x === r.line && r.at > s.a && r.at <= s.b : r.axis === "x" && s.y === r.line && r.at >= s.a && r.at < s.b));
    return r && !inOpening ? r : stairWallAt(px, py, l) || r;
}
/* a height that clears the steps or landing under it, and stays on the wall */
const LAMP_MIN_WALL = 16, lampFits = (l, w) => !w.drop || retaining(l, w.axis, w.line, wallTile(w)).H >= LAMP_MIN_WALL;
const lampHeight = (l, w, px, py) => w.stair ? stairH(w, wallSpot(w, l, px, py).h) : w.drop ? Math.min(wallH.lamp, retaining(l, w.axis, w.line, wallTile(w)).H - 8) : wallH.lamp;
const lampField = h => h !== 106 ? { h } : {};
const stairH = (w, h) => w.stair ? Math.min(135, Math.max(h, w.floor + 45)) : h;
/* the tile furniture would go on: a landing you can see, or else the floor */
function furniTile(px, py) {
    for (const st of map.stairs) {
        const r = st.low === level.id && landingRect(st); if (!r) continue;
        const f = pxToTile(px, py, levelZ(level) + LANDING), X = Math.floor(f[0]), Y = Math.floor(f[1]);
        if (inRect(r, X, Y) && throughOpening(px, py, level, st)) return [X, Y];
    }
    const f = tileIn(level, px, py); return [Math.floor(f[0]), Math.floor(f[1])];
}
/* what hangs in a stairwell or stands on its landing goes with it */
function carryStairThings(l, was, st) {
    const dA = st.a - was.a, dL = thruLeft(st) ? st.x - was.x : st.y - was.y; if (!dA && !dL) return;
    const segs = stairWallsOf(was);
    for (const q of [...(l.wallItems || []), ...(l.lamps || [])]) { const seg = segs.find(g => onSeg(g, q)); if (!seg) continue; if (seg.on === "a") { q.line += dA; q.at += dL; } else { q.line += dL; q.at += dA; } }
    const r = landingRect(was);
    if (r) for (const p of (l.props || [])) if (inRect(r, p.x, p.y)) { p.x += st.kind === "turn" ? dA : dL; p.y += st.kind === "turn" ? dL : dA; }
}
function tidyAfterStairs() {
    for (const lv of map.levels) { if (lv.props) lv.props = lv.props.filter(p => Parts.tiles(p).every(t => placeable(lv, t[0], t[1]))); pruneOffFloor(lv); }
}
function holes(l) {
    const out = [];
    for (const st of map.stairs) {
        if (st.up !== l.id) continue;
        if (st.kind === "straight") out.push({ x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y });
        else if (st.kind === "turn") { out.push({ x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y }); out.push({ x0: st.a - 4, x1: st.a, y0: st.y - 10, y1: st.y - 6 }); }
        else if (st.kind === "sideturn") out.push(...sideTurnRects(st.x, st.a));
        else out.push({ x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b });
    }
    return out;
}
const inRect = (r, x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
function heightLocked(l, x, y) {
    if (holes(l).some(r => inRect(r, x, y))) return true;
    if (map.lifts.some(q => { if (q.level !== l.id) return false; const [a, b] = liftLocal(q, x, y); return b >= 0 && b < 3 && a >= -1 && a < 5; })) return true;
    if (map.entrance && map.entrance.level === l.id) { const e = map.entrance, along = e.axis === "x" ? x : y, away = e.axis === "x" ? y : x; if (along >= e.at - 1 && along < e.at + 9 && away >= e.line && away < e.line + 3) return true; }
    for (const st of map.stairs) {
        if (st.low === l.id) { if (thruLeft(st) ? x >= st.x && x < st.x + 3 && y >= st.a - 1 && y < st.b + 1 : y >= st.y && y < st.y + 3 && x >= st.a - 1 && x < st.b + 1) return true; }
        if (st.up === l.id) {
            if (st.kind === "side" && x >= st.x - 13 && x < st.x - 9 && y >= st.a - 1 && y < st.b + 1) return true;
            if (st.kind === "straight" && y >= st.y - 13 && y < st.y - 9 && x >= st.a - 1 && x < st.b + 1) return true;
            if (st.kind === "turn" && x >= st.a - 8 && x < st.a - 3 && y >= st.y - 11 && y < st.y - 5) return true;
            if (st.kind === "sideturn" && y >= st.a - 8 && y < st.a - 3 && x >= st.x - 11 && x < st.x - 5) return true;
        }
    }
    return false;
}
/* steps that no longer stand at a drop go; heights where the floor's gone go */
function tidyHeights(l) {
    if (l.rise) { for (const k of Object.keys(l.rise)) if (!l.rise[k] || !cells(l).has(k)) delete l.rise[k]; if (!Object.keys(l.rise).length) delete l.rise; }
    if (l.floorLift) { for (const k of Object.keys(l.floorLift)) if (!l.floorLift[k] || !cells(l).has(k)) delete l.floorLift[k]; if (!Object.keys(l.floorLift).length) delete l.floorLift; }
    /* a flight only stays where there's still a drop, tile by tile: it splits if its middle has gone */
    if (l.steps) { const out = []; for (const st of l.steps) { let from = null, rise = 0; for (let t = st.a; t <= st.b; t++) { const r = t < st.b ? stepRise(l, { ...st, a: t, b: t + 1 }) : 0; if (r !== rise) { if (rise > 0) out.push({ ...st, a: from, b: t }); from = t; rise = r; } } } l.steps = out; if (!l.steps.length) delete l.steps; }
    if (l.edgeItems) { l.edgeItems = l.edgeItems.filter(q => { const on = edgeOn(q); return tileEdges(l, on[0], on[1]).some(e => sameEdge(q, e)); }); if (!l.edgeItems.length) delete l.edgeItems; }
}
const rugOnFloor = (l, r) => { for (let x = r.x0; x < r.x1; x++) for (let y = r.y0; y < r.y1; y++) if (hasFloor(l, x, y)) return true; return false; };
/* after floor's been removed: everything that hung or stood on it */
function pruneOffFloor(l) {
    const keep = (name, test) => { if (l[name]) { l[name] = l[name].filter(test); if (!l[name].length) delete l[name]; } };
    /* along a y wall the spot runs one on from the tile: a door at 12 covers tiles 10 and 11, a light at 12.5 is on tile 11 */
    const stands = q => q.axis === "x" ? hasFloor(l, Math.floor(q.at), q.line) : hasFloor(l, q.line, Math.floor(q.at - 1)) || hasFloor(l, q.line, Math.ceil(q.at) - 1);
    keep("doors", stands);
    keep("lamps", q => stands(q) || onStairWall(l, q));
    keep("wallItems", q => stands(q) || onStairWall(l, q));
    keep("medals", q => hasFloor(l, q.x + 2, q.y + 2));
    keep("rugs", r => { for (let x = r.x0; x < r.x1; x++) for (let y = r.y0; y < r.y1; y++) if (hasFloor(l, x, y)) return true; return false; });
    /* garlands and festoon lights: every tile they run along still has floor, or is a stairwell's wall (15 Nov scan, editor 14) */
    const alongOk = g => { for (let t = g.a; t < g.b; t++) if (!(g.axis === "x" ? hasFloor(l, t, g.line) : hasFloor(l, g.line, t)) && !map.stairs.some(st => st.low === l.id && stairWallsOf(st).some(s => s.axis === g.axis && s.line === g.line && t >= s.t0 && t < s.t1))) return false; return true; };
    keep("garlands", alongOk); keep("festoons", alongOk);
    for (const name of ["halfTiles", "noWalls", "showWalls"]) keep(name, k => { const [axis, line, t] = k.split("|"); return axis === "x" ? hasFloor(l, +t, +line) : hasFloor(l, +line, +t); });
    map.lifts = map.lifts.filter(q => { if (q.level !== l.id) return true; for (let t = 0; t < 3; t++) if (!hasFloor(l, ...liftPt(q, t, 0))) return false; return true; });
    const e = map.entrance; if (e && e.level === l.id) for (let t = e.at; t < e.at + 8; t++) if (!(e.axis === "x" ? hasFloor(l, t, e.line) : hasFloor(l, e.line, t))) { delete map.entrance; flash("The entrance went with that floor. Place a new one."); break; }
}
/* the edge between two heights nearest the mouse, on any side of a tile: where steps can go */
function heightEdgeAt(l, fx, fy) {
    const X = Math.floor(fx), Y = Math.floor(fy), found = [];
    for (const L of [Math.floor(fy / 2) * 2, Math.floor(fy / 2) * 2 + 2]) if (hasFloor(l, X, L) && hasFloor(l, X, L - 1) && heightAt(l, X, L) !== heightAt(l, X, L - 1)) found.push({ axis: "y", line: L, t: X, dist: Math.abs(fy - L) });
    for (const L of [Math.floor(fx / 2) * 2, Math.floor(fx / 2) * 2 + 2]) if (hasFloor(l, L, Y) && hasFloor(l, L - 1, Y) && heightAt(l, L, Y) !== heightAt(l, L - 1, Y)) found.push({ axis: "x", line: L, t: Y, dist: Math.abs(fx - L) });
    const e = found.sort((p, q) => p.dist - q.dist)[0]; if (!e) return null;
    const back = e.axis === "y" ? heightAt(l, e.t, e.line - 1) : heightAt(l, e.line - 1, e.t), near = e.axis === "y" ? heightAt(l, e.t, e.line) : heightAt(l, e.line, e.t);
    return { axis: e.axis, line: e.line, t: e.t, dir: back > near ? "back" : "front" };
}
/* how far that same edge runs either way, at the same difference in height */
function edgeRun(l, axis, line, t) {
    const diff = u => axis === "y" ? (hasFloor(l, u, line) && hasFloor(l, u, line - 1) ? heightAt(l, u, line) - heightAt(l, u, line - 1) : null) : (hasFloor(l, line, u) && hasFloor(l, line - 1, u) ? heightAt(l, line, u) - heightAt(l, line - 1, u) : null);
    const d = diff(t); let a = t, b = t + 1; if (!d) return { a, b };
    while (diff(a - 1) === d) a--; while (diff(b) === d) b++;
    return { a, b };
}
/* A retaining wall: where the floor behind is higher. As tall as the drop, or as a door on its straight stretch needs. */
const RETAIN_DOOR = 80;
const isDrop = (l, axis, line, t) => axis === "x" ? hasFloor(l, t, line) && hasFloor(l, t, line - 1) && heightAt(l, t, line - 1) > heightAt(l, t, line) && !holes(l).some(r => inRect(r, t, line - 1)) : hasFloor(l, line, t) && hasFloor(l, line - 1, t) && heightAt(l, line - 1, t) > heightAt(l, line, t) && !holes(l).some(r => inRect(r, line - 1, t));
function retaining(l, axis, line, t) {
    const run = edgeRun(l, axis === "x" ? "y" : "x", line, t), drop = axis === "x" ? heightAt(l, t, line - 1) - heightAt(l, t, line) : heightAt(l, line - 1, t) - heightAt(l, line, t);
    const door = (l.doors || []).some(d => d.axis === axis && d.line === line && (axis === "x" ? d.at < run.b && d.at + 2 > run.a : d.at - 2 < run.b && d.at > run.a));
    return { a: run.a, b: run.b, H: door ? Math.max(drop, RETAIN_DOOR) : drop };
}
/* Where a door can hang: a real wall, or a drop, where the floor behind is higher. It takes the floor's height at that spot by itself. */
function doorEdge(l, axis, line, t) {
    const here = axis === "x" ? hasFloor(l, t, line) : hasFloor(l, line, t); if (!here) return null;
    if (holes(l).some(r => axis === "x" ? inRect(r, t, line) : inRect(r, line, t))) return null;
    const bx = axis === "x" ? t : line - 1, by = axis === "x" ? line - 1 : t, z = axis === "x" ? heightAt(l, t, line) : heightAt(l, line, t);
    if (hasFloor(l, bx, by)) { if (holes(l).some(r => inRect(r, bx, by)) || wallState(l, axis, line, t) !== "full") return null; return heightAt(l, bx, by) > z ? { kind: "drop", z } : null; }
    if (!wallStands(l, bx, by, axis) || wallState(l, axis, line, t) !== "full") return null;
    return { kind: "wall", z };
}
/* the nearest such edge under the mouse, looking up the height of a door */
function doorSpotAt(px, py, l) {
    for (let h = 0; h <= WALL; h += 4) for (const dz of heightsOf(l)) {
        const [fx, fy] = pxToTile(px, py + h, levelZ(l) + dz), X = Math.floor(fx), Y = Math.floor(fy);
        if (!hasFloor(l, X, Y) || heightAt(l, X, Y) !== dz) continue;
        if (fy - Y < .5 && doorEdge(l, "x", Y, X)) return { axis: "x", at: X, line: Y };
        if (fx - X < .5 && doorEdge(l, "y", X, Y)) return { axis: "y", at: Y + 1, line: X };
    }
    return null;
}
/* What stops the entrance standing on these 8 tiles: null if nothing does, or which tile and why, in words. */
function entranceBlock(l, axis, line, a) {
    const was = map.entrance; map.entrance = null;
    try {
        for (let i = 0; i < 8; i++) {
            const t = a + i, on = q => q.axis === axis && q.line === line, floorHere = axis === "x" ? hasFloor(l, t, line) : hasFloor(l, line, t);
            if (!floorHere) return { tile: t, why: "the floor stops here" };
            if ((l.doors || []).some(d => on(d) && (axis === "x" ? d.at < t + 1 && d.at + 2 > t : d.at - 2 < t + 1 && d.at > t))) return { tile: t, why: "there's a door in the way" };
            /* wall lights and pictures only clash with the arch itself, not the plain wall at each end */
            if (i > 0 && i < 7 && [...(l.lamps || []), ...(l.wallItems || [])].some(q => { const p = axis === "x" ? q.at : q.at - 1; return on(q) && p >= t - .5 && p < t + 1.5; })) return { tile: t, why: "there's a wall light or picture in the way" };
            if (wallTaken({ axis, at: axis === "x" ? t : t + 1, line }, l)) return { tile: t, why: "there's a lift, stairs, a tunnel or another entrance in the way" };
            const state = wallState(l, axis, line, t); if (state !== "full") return { tile: t, why: state === "none" ? "the wall's been taken away here" : "the wall's cut to half height here" };
            const e = doorEdge(l, axis, line, t);
            if (!e || e.kind !== "wall") return { tile: t, why: "there's no full wall here" };
            if (e.z !== 0) return { tile: t, why: "this bit of floor is raised or lowered, and the entrance needs level 0" };
        }
        return null;
    } finally { if (was === undefined) delete map.entrance; else map.entrance = was; }      // the Events Gallery has none: no "entrance: undefined" left on it (15 Nov scan, editor 22)
}
/* The entrance takes 8 tiles of wall. It goes as close to centred on the mouse as it can, on any tile.
   Returns the tile, or null. lastEntranceBlock says what stopped it going right under the mouse, if anything did. */
let lastEntranceBlock = null;
function entranceAt(l, w) {
    const mid = wallTile(w) - 3; let first = null;
    for (let d = 0; d <= 7; d++) for (const a of d ? [mid - d, mid + d] : [mid]) { const b = entranceBlock(l, w.axis, w.line, a); if (!b) { lastEntranceBlock = first; return a; } if (!first) first = { ...b, l, axis: w.axis, line: w.line, a: mid }; }
    lastEntranceBlock = first; return null;
}
const entranceTiles = e => [e.at + 3, e.at + 4, e.at + 5];     // the arch's opening, along the wall
/* the two tiles of a door must be at one height and the same sort of edge: slide it along to fit, if a tile will do it */
function fitDoor(l, spot, ignore) {
    const tilesOf = at => spot.axis === "x" ? [at, at + 1] : [at - 2, at - 1];
    const ok = at => { const [p, q] = tilesOf(at), e = doorEdge(l, spot.axis, spot.line, p), f = doorEdge(l, spot.axis, spot.line, q); return e && f && e.kind === f.kind && e.z === f.z && !wallTaken({ axis: spot.axis, at, line: spot.line }, l) && !(l.doors || []).some(d => d !== ignore && d.axis === spot.axis && d.line === spot.line && Math.abs(d.at - at) < 2); };
    for (const at of [spot.at, spot.at - 1, spot.at + 1]) if (ok(at)) return at;
    return null;
}
/* A wall cut to half height, tile by tile along its line. */
const HALF_WALL = 48;
const wallTile = w => w.axis === "x" ? Math.floor(w.at) : Math.floor(w.at) - 1;
const halfKey = (axis, line, tile) => axis + "|" + line + "|" + tile;
const isHalf = (l, axis, line, tile) => !!l.halfTiles && l.halfTiles.includes(halfKey(axis, line, tile));
/* anything that needs the wall's full height on this tile? */
function wallHolds(l, axis, line, tile) {
    const t0 = tile, t1 = tile + 1, on = q => q.axis === axis && q.line === line;
    if ((l.doors || []).some(d => on(d) && (axis === "x" ? d.at < t1 && d.at + 2 > t0 : d.at - 2 < t1 && d.at > t0))) return true;
    for (const q of [...(l.lamps || []), ...(l.wallItems || [])]) { const t = axis === "x" ? q.at : q.at - 1; if (on(q) && t >= t0 - .5 && t < t1 + .5) return true; }
    for (let t = t0; t < t1; t++) if (wallTaken({ axis, at: axis === "x" ? t : t + 1, line }, l)) return true;
    return false;
}
const isShown = (l, axis, line, tile) => !!l.showWalls && l.showWalls.includes(axis + "|" + line + "|" + tile);
const isNone = (l, axis, line, tile) => !!l.noWalls && l.noWalls.includes(halfKey(axis, line, tile));
const wallState = (l, axis, line, tile) => isNone(l, axis, line, tile) ? "none" : isHalf(l, axis, line, tile) ? "half" : "full";
function setWallState(l, axis, line, tile, state) {
    setHalf(l, axis, line, tile, state === "half");
    const k = halfKey(axis, line, tile);
    if (state === "none") { if (!isNone(l, axis, line, tile)) (l.noWalls = l.noWalls || []).push(k); }
    else if (l.noWalls) { l.noWalls = l.noWalls.filter(q => q !== k); if (!l.noWalls.length) delete l.noWalls; }
}
function setHalf(l, axis, line, tile, on) {
    const k = halfKey(axis, line, tile);
    if (on) { if (!isHalf(l, axis, line, tile)) (l.halfTiles = l.halfTiles || []).push(k); }
    else if (l.halfTiles) { l.halfTiles = l.halfTiles.filter(q => q !== k); if (!l.halfTiles.length) delete l.halfTiles; }
}
/* the brush for Half wall and No wall: the first tile touched says whether this stroke changes walls or puts them back to full */
/* the edges where the map leaves the wall off, or where you've put one: the back and left edges of a floor with nothing behind them on this floor */
function wallOptional(l, axis, line, t) {
    const X = axis === "x" ? t : line, Y = axis === "x" ? line : t, bx = axis === "x" ? t : line - 1, by = axis === "x" ? line - 1 : t;
    if (!hasFloor(l, X, Y) || hasFloor(l, bx, by) || holes(l).some(r => inRect(r, X, Y) || inRect(r, bx, by))) return false;
    if (isShown(l, axis, line, t)) return true;
    return !wallStands(l, bx, by, axis);
}
function optionalWallAt(px, py, l) {
    for (const dz of heightsOf(l)) for (let h = 0; h <= WALL; h += 4) {
        const [fx, fy] = pxToTile(px, py + h, levelZ(l) + dz * HEIGHT), X = Math.floor(fx), Y = Math.floor(fy);
        if (!hasFloor(l, X, Y) || heightAt(l, X, Y) !== dz) continue;
        if (fy - Y < .5 && wallOptional(l, "x", Y, X)) return { axis: "x", line: Y, t: X };
        if (fx - X < .5 && wallOptional(l, "y", X, Y)) return { axis: "y", line: X, t: Y };
    }
    return null;
}
function showBrush(d, px, py) {
    const x0 = d.px === undefined ? px : d.px, y0 = d.py === undefined ? py : d.py, n = Math.max(1, Math.ceil(Math.hypot(px - x0, py - y0) / 5));
    d.px = px; d.py = py;
    for (let i = 1; i <= n; i++) {
        const w = optionalWallAt(x0 + (px - x0) * i / n, y0 + (py - y0) * i / n, level); if (!w) continue;
        const on = isShown(level, w.axis, w.line, w.t), k = w.axis + "|" + w.line + "|" + w.t;
        if (d.to === undefined) d.to = !on;
        if (on === d.to) continue;
        if (!d.to && wallHolds(level, w.axis, w.line, w.t)) { d.kept = true; continue; }
        if (!d.did) { snapshot(); d.did = true; }
        if (d.to) (level.showWalls = level.showWalls || []).push(k); else { level.showWalls = level.showWalls.filter(q => q !== k); if (!level.showWalls.length) delete level.showWalls; }
    }
    paint();
}
function halfBrush(d, px, py) {
    if (tool === "addwall") { showBrush(d, px, py); return; }
    const target = tool === "nowall" ? "none" : "half", x0 = d.px === undefined ? px : d.px, y0 = d.py === undefined ? py : d.py, n = Math.max(1, Math.ceil(Math.hypot(px - x0, py - y0) / 5));
    d.px = px; d.py = py;
    for (let i = 1; i <= n; i++) {
        const w = wallAt(x0 + (px - x0) * i / n, y0 + (py - y0) * i / n, level, true); if (!w) continue;
        const t = wallTile(w), now = wallState(level, w.axis, w.line, t);
        if (d.to === undefined) d.to = now === target ? "full" : target;
        if (now === d.to) continue;
        if (d.to !== "full" && wallHolds(level, w.axis, w.line, t)) { d.kept = true; continue; }
        if (!d.did) { snapshot(); d.did = true; }
        setWallState(level, w.axis, w.line, t, d.to);
    }
    paint();
}
/* the garland, a wall tile at a time: drag along walls to lay it, start on a laid tile to take it up */
function swagBrush(d, px, py) {
    const x0 = d.px === undefined ? px : d.px, y0 = d.py === undefined ? py : d.py, n = Math.max(1, Math.ceil(Math.hypot(px - x0, py - y0) / 5)); d.px = px; d.py = py;
    for (let i = 1; i <= n; i++) { const w = wallAt(x0 + (px - x0) * i / n, y0 + (py - y0) * i / n, level, true); if (!w) continue; const key = w.axis + "|" + w.line + "|" + wallTile(w), list = level.swags || [], has = list.includes(key); if (d.to === undefined) d.to = !has; if (has === d.to) continue; if (!d.did) { snapshot(); d.did = true; } if (d.to) (level.swags = list).push(key); else { level.swags = list.filter(k => k !== key); if (!level.swags.length) delete level.swags; } }
    paint();
}
function endHalfBrush(d) { if (d.kept) flash("Left the tiles with a door, wall light or something hanging on them at full height."); if (d.did) changed(); }
/* Decorative edges. A tile's edge counts if the floor stops there or drops, but not where a wall stands or small steps cross it; on small steps, their two open sides count. */
function tileEdges(l, X, Y) {
    if (!hasFloor(l, X, Y)) return [];
    const out = [], z = heightAt(l, X, Y), flat = (nx, ny) => hasFloor(l, nx, ny) && !holes(l).some(r => inRect(r, nx, ny));
    const crossed = (axis, line, t) => (l.steps || []).some(st => st.line === line && st.axis === (axis === "x" ? "y" : "x") && t >= st.a && t < st.b);
    const consider = (axis, line, t, dir, nx, ny, isBack) => {
        if (crossed(axis, line, t)) return;
        if (flat(nx, ny)) { if (heightAt(l, nx, ny) < z) out.push({ axis, line, t, in: dir, on: [X, Y] }); return; }
        if (isBack && !hasFloor(l, nx, ny) && wallStands(l, nx, ny, axis) && !isNone(l, axis, line, t)) return;
        out.push({ axis, line, t, in: dir, on: [X, Y] });
    };
    consider("x", Y, X, 1, X, Y - 1, true);
    consider("y", X, Y, 1, X - 1, Y, true);
    consider("x", Y + 1, X, -1, X, Y + 1, false);
    consider("y", X + 1, Y, -1, X + 1, Y, false);
    /* the open sides of small steps */
    const st = stepsAt(l, X, Y);
    if (st) {
        const add = (axis, line, t, dir, nx, ny) => { if (hasFloor(l, nx, ny) && heightAt(l, nx, ny) > z) return; if (!out.some(e => e.axis === axis && e.line === line && e.t === t)) out.push({ axis, line, t, in: dir, on: [X, Y] }); };
        if (st.axis === "y") { if (X === st.a) add("y", X, Y, 1, X - 1, Y); if (X === st.b - 1) add("y", X + 1, Y, -1, X + 1, Y); }
        else { if (Y === st.a) add("x", Y, X, 1, X, Y - 1); if (Y === st.b - 1) add("x", Y + 1, X, -1, X, Y + 1); }
    }
    return out;
}
const sameEdge = (q, e) => q.axis === e.axis && q.line === e.line && q.t === e.t && q.in === e.in;
const EDGE_REACH = 11;     // how near the mouse an edge has to be, in map pixels
const edgeOn = q => q.axis === "x" ? [q.t, q.in > 0 ? q.line : q.line - 1] : [q.in > 0 ? q.line : q.line - 1, q.t];
function edgeDistance(e, px, py) {
    const z = tileZ(level, e.on[0], e.on[1]) + stepLift(level, e.on[0], e.on[1]), a = e.axis === "x" ? P(e.t, e.line, z) : P(e.line, e.t, z), b = e.axis === "x" ? P(e.t + 1, e.line, z) : P(e.line, e.t + 1, z);
    const dx = b[0] - a[0], dy = b[1] - a[1], k = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (a[0] + dx * k), py - (a[1] + dy * k));
}
/* can you actually see that edge, or is a nearer floor over it? */
function edgeShows(e) {
    const z = tileZ(level, e.on[0], e.on[1]) + stepLift(level, e.on[0], e.on[1]), mid = e.t + .5, toward = .12 * e.in, p = e.axis === "x" ? P(mid, e.line + toward, z) : P(e.line + toward, mid, z), f = tileIn(level, p[0], p[1]);
    return Math.floor(f[0]) === e.on[0] && Math.floor(f[1]) === e.on[1];
}
/* every edge near the mouse: on each height, the tiles round the spot it points at, so steps and the higher floor round them are both found */
function edgesNear(px, py) {
    const seen = new Map();
    for (const h of heightsOf(level)) {
        const t = pxToTile(px, py, levelZ(level) + h * HEIGHT), X = Math.floor(t[0]), Y = Math.floor(t[1]);
        for (let x = X - 1; x <= X + 1; x++) for (let y = Y - 1; y <= Y + 1; y++) for (const e of tileEdges(level, x, y)) { const k = e.axis + "|" + e.line + "|" + e.t + "|" + e.in; if (!seen.has(k)) seen.set(k, e); }
    }
    return [...seen.values()].filter(e => edgeDistance(e, px, py) <= EDGE_REACH && edgeShows(e));
}
const railsNear = (px, py) => (level.edgeItems || []).filter(q => { const e = { ...q, on: edgeOn(q) }; return !seeHidden(level, heightAt(level, e.on[0], e.on[1])) && edgeDistance(e, px, py) <= EDGE_REACH && edgeShows(e); });
const edgeUnder = (px, py) => railsNear(px, py).length > 0;
function edgeBrush(d, px, py) {
    const x0 = d.px === undefined ? px : d.px, y0 = d.py === undefined ? py : d.py, n = Math.max(1, Math.ceil(Math.hypot(px - x0, py - y0) / 4)), style = tool.slice(5);
    d.px = px; d.py = py;
    for (let i = 1; i <= n; i++) {
        const X = x0 + (px - x0) * i / n, Y = y0 + (py - y0) * i / n;
        if (d.remove) { for (const q of railsNear(X, Y)) { if (!d.did) { snapshot(); d.did = true; } const list = level.edgeItems; list.splice(list.indexOf(q), 1); d.gone.push({ ...q, on: edgeOn(q) }); } continue; }
        for (const e of edgesNear(X, Y)) {
            const list = level.edgeItems || [], at = list.findIndex(q => sameEdge(q, e));
            if (at >= 0 && list[at].s === style) continue;
            if (!d.did) { snapshot(); d.did = true; }
            if (at >= 0) list.splice(at, 1);
            (level.edgeItems = level.edgeItems || []).push({ s: style, axis: e.axis, line: e.line, t: e.t, in: e.in }); d.laid.push(e);
        }
    }
    paint();
}
function endEdgeBrush(d) { if (level.edgeItems && !level.edgeItems.length) delete level.edgeItems; if (d.did) changed(); }
function edgeLine(e, col, width) {
    const z = tileZ(level, e.on[0], e.on[1]) + stepLift(level, e.on[0], e.on[1]);
    if (e.axis === "x") line(e.t, e.line, e.t + 1, e.line, z, col, width); else line(e.line, e.t, e.line, e.t + 1, z, col, width);
}
function drawEdgeGhost() {
    if (!isEdgeTool(tool)) return;
    if (drag && drag.kind === "edgebrush") { for (const e of drag.laid) edgeLine(e, "#7dff9a", 3); for (const e of drag.gone) edgeLine(e, "#ff6a5f", 3); }
    if (hover && hover.edges) for (const e of hover.edges) edgeLine(e, "#fff", 3);
}
/* The brush: drag over floor to set it to exactly this height. */
let heightBrush = 16, ctrlLast = null, ctrlSpare = 0, heightHold = null;
const brushTool = t => t === "height" || t === "floor" || t === "floorlift", brushes = { height: 16, floor: 0, floorlift: 8 };
/* with the Paint floor tool, a tile off the floor is judged on the height being painted, so the ghost stays under the mouse */
const paintTile = (px, py) => { const a = tileIn(level, px, py); if (hiddenTile(a)) return a; return hasFloor(level, Math.floor(a[0]), Math.floor(a[1])) ? a : pxToTile(px, py, levelZ(level) + heightBrush); };
function setBrush(v) {
    heightBrush = Math.max(-MAX_RISE, Math.min(MAX_RISE, Math.round(v / STEP_R) * STEP_R));
    if (brushTool(tool)) brushes[tool] = heightBrush;
    const sl = $("heightSlider"), num = $("heightNum"); if (sl) sl.value = heightBrush; if (num) num.textContent = (heightBrush > 0 ? "+" : "") + heightBrush;
    paint();
}
function drawHeightPreview() {
    if (!brushTool(tool) || (tool === "floor" && !heightBrush)) return;
    const r = drag && drag.rect ? drag.rect : (() => { const t = heightHold || (hover && hover.tile); if (!t) return null; const x0 = Math.floor(t[0] / 2) * 2, y0 = Math.floor(t[1] / 2) * 2; return { x0, y0, x1: x0 + 2, y1: y0 + 2 }; })();
    if (!r) return;
    const z0 = levelZ(level), z = z0 + heightBrush, now = heightAt(level, r.x0, r.y0), col = heightBrush > now ? "#f2cc4e" : heightBrush < now ? "#4fd1ff" : "#ffffff";
    quad(r.x0, r.y0, r.x1, r.y1, z, heightBrush > now ? "rgba(242,204,78,.3)" : heightBrush < now ? "rgba(79,209,255,.3)" : "rgba(255,255,255,.15)", col);
    /* the corners, down to where the floor is now, so you can see how far it moves */
    for (const [x, y] of [[r.x0, r.y1], [r.x1, r.y1], [r.x1, r.y0]]) { const a = toScreen(...P(x, y, z)), c = toScreen(...P(x, y, z0 + heightAt(level, Math.min(x, r.x1 - 1), Math.min(y, r.y1 - 1)))); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    const m = toScreen(...P((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, z)), label = (heightBrush > 0 ? "+" : "") + heightBrush + " px";
    ctx.font = "bold 13px " + getComputedStyle(document.body).fontFamily; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(label, m[0], m[1] + 4); ctx.fillStyle = "#fff"; ctx.fillText(label, m[0], m[1] + 4); ctx.textAlign = "start";
}
/* Laying steps: a ghost where they'd go, on any edge between two heights */
function stepGhost(st) {
    const f = flightOf(level, st); if (!f) return;
    const zl = level === null ? 0 : (st.dir === "front" ? (st.axis === "y" ? tileZ(level, st.a, st.line - 1) : tileZ(level, st.line - 1, st.a)) : (st.axis === "y" ? tileZ(level, st.a, st.line) : tileZ(level, st.line, st.a)));
    if (st.axis === "y") quad(st.a, f.from, st.b, f.to, zl, "rgba(79,209,255,.35)", "#4fd1ff"); else quad(f.from, st.a, f.to, st.b, zl, "rgba(79,209,255,.35)", "#4fd1ff");
}
/* Laying steps round a corner in one drag (13 Nov 2026, his: "small steps now need the ability to be drawn around corners too"): carried
   past the end of the edge the drag started on, onto an edge that turns from that end with the same two heights, the first run goes to the
   corner and a second one runs from the corner along the new edge to the mouse. The renderer joins them with a corner piece. */
function stepsRoundCorner(l, edge, run, f) {
    const e2 = heightEdgeAt(l, f[0], f[1]); if (!e2 || e2.axis === edge.axis) return null;
    const sides = (axis, line, t) => axis === "y" ? [heightAt(l, t, line - 1), heightAt(l, t, line)] : [heightAt(l, line - 1, t), heightAt(l, line, t)];
    const h1 = sides(edge.axis, edge.line, edge.t), h2 = sides(e2.axis, e2.line, e2.t), hi1 = Math.max(...h1), lo1 = Math.min(...h1);
    if (hi1 !== Math.max(...h2) || lo1 !== Math.min(...h2)) return null;
    const run2 = edgeRun(l, e2.axis, e2.line, e2.t);
    /* the corner: an end of the first edge's run, which the new edge's run starts or ends at */
    for (const end of [run.b, run.a]) {
        if (e2.line !== end) continue;
        const at = run2.a === edge.line ? "a" : run2.b === edge.line ? "b" : null; if (!at) continue;
        const first = { axis: edge.axis, line: edge.line, dir: edge.dir, a: end === run.b ? Math.min(edge.t, run.b - 1) : run.a, b: end === run.b ? run.b : Math.max(edge.t, run.a) + 1 };
        const t = Math.max(run2.a, Math.min(run2.b - 1, e2.t)), st = { axis: e2.axis, line: e2.line, dir: e2.dir, a: at === "a" ? run2.a : t, b: at === "a" ? t + 1 : run2.b };
        return { first, st };
    }
    return null;
}
function drawStepGhost() {
    if (tool !== "steps") return;
    if (drag && drag.kind === "laysteps") { if (drag.st2) { stepGhost(drag.st2.first); stepGhost(drag.st2.st); } else stepGhost(drag.st); return; }
    if (hover && hover.edge) stepGhost({ axis: hover.edge.axis, line: hover.edge.line, dir: hover.edge.dir, a: hover.edge.t, b: hover.edge.t + 1 });
}
const stepsDrop = (l, axis, line, t) => { const e = doorEdge(l, axis, line, t); return !!e && e.kind === "drop"; };
/* where on a wall the mouse is: along it and how high, by pixel */
function wallSpot(w, l, px, py) {
    const at = w.axis === "x" ? w.line + px / 16 : w.line - px / 16, q = { axis: w.axis, at, line: w.line };
    const a = w.axis === "x" ? P(at, w.line, wallZ(l, q)) : P(w.line, at, wallZ(l, q));
    return { at: Math.round(at * 16) / 16, h: Math.max(20, Math.min(WALL - 10, Math.round(a[1] - py))) };
}
/* the picture's own rectangle on the map, wherever its origin is */
function wallItemRect(l, q) { const c = wallItemCentre(l, q); if (q.k === "i_window") { const b = windowBox(q); return { x0: c[0] - b.w / 2, y0: c[1] - b.h / 2, w: b.w, h: b.h }; } const def = wallItemOf(q.k), box = def && (q.axis === "x" ? def.x : def.y); if (!box) return null; const L = box.layers[0]; return { x0: c[0] + L.x, y0: c[1] + L.y, w: box.w, h: box.h }; }
const wallItemCentre = (l, q) => { const a = q.axis === "x" ? P(q.at, q.line, wallZ(l, q)) : P(q.line, q.at, wallZ(l, q)); const def = wallItemOf(q.k); return [Math.round(a[0]), Math.round(a[1] - (q.k === "i_window" ? ((q.top === undefined ? 128 : q.top) + (q.b || 0)) / 2 : (def && def.locked) || q.h === undefined ? (def && def.h) || 100 : q.h))]; };
const windowBox = q => ({ w: (q.w || 32) + 12, h: (q.top || 128) - (q.b || 0) + Math.round((q.w || 32) / 2) + 10 });
function windowHandles(l, q) { const c = wallItemCentre(l, q), W = q.w || 32, Hh = (q.top || 128) - (q.b || 0), s = q.axis === "x" ? 1 : -1; return { r: [c[0] + W / 2 + 4, c[1] + s * (W / 4)], l: [c[0] - W / 2 - 4, c[1] - s * (W / 4)], t: [c[0], c[1] - Hh / 2 - 4], b: [c[0], c[1] + Hh / 2 + 4] }; }
function windowHandleAt(l, q, px, py) { const r = Math.max(5, 7 / zoom), h = windowHandles(l, q); for (const k of Object.keys(h)) if (Math.abs(px - h[k][0]) <= r && Math.abs(py - h[k][1]) <= r) return k; return null; }

/* ---------- undo ---------- */
/* (15 Nov scan, editor 11) the redo list a snapshot set aside: if what follows changes nothing, the empty step goes and redo comes back */
let parked = null;
function snapshot() { const t = JSON.stringify(root); undoStack.push(t); if (undoStack.length > 80) undoStack.shift(); parked = { text: t, redo: redoStack.splice(0) }; }
/* a snapshot taken for a change that didn't happen */
function dropSnapshot() { const t = undoStack.pop(); if (parked && parked.text === t) redoStack.push(...parked.redo); parked = null; syncButtons(); }
function changed() {
    if (parked) { if (undoStack[undoStack.length - 1] === parked.text && JSON.stringify(root) === parked.text) { undoStack.pop(); redoStack.push(...parked.redo); } parked = null; }
    $("revert").hidden = false;
    dirty = true; $("dirty").hidden = false; cellSets = new Map(); lastChangeAt = performance.now();
    rememberDraft();
    requestArt(); paint(); syncButtons(); checksSoon();
}
/* the Problems check walks the whole Hallway: done just after the change shows, and once for a burst of changes, so a click places at once (10 Nov scan) */
let checksTimer = 0;
function checksSoon() { clearTimeout(checksTimer); checksTimer = setTimeout(() => { checksTimer = 0; runChecks(); }, 150); }
/* The recovery copy in this browser, with the saved map it started from, so an old one can't quietly replace newer work */
let serverText = null, lastProblems = 0;
const textMark = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return t.length + ":" + h; };
/* (15 Nov scan, editor 1) one recovery copy per tab, so a save in one tab never throws away another's. A tab keeps its id over a reload
   (sessionStorage) and says every few seconds that it's still open, so a new tab only takes over the copy of one that's closed */
const TAB_ID = (() => { try { let id = sessionStorage.getItem("hallway-tab"); if (!id) { id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); sessionStorage.setItem("hallway-tab", id); } return id; } catch (e) { return "t" + Date.now().toString(36); } })();
const DRAFT_KEYS = id => id === "" ? ["hallway-draft", "hallway-draft-base", "hallway-draft-at"] : ["hallway-draft:" + id, "hallway-draft-base:" + id, "hallway-draft-at:" + id];      // "" is the old one-per-browser copy
const forgetDraft = (id = TAB_ID) => { try { for (const k of DRAFT_KEYS(id)) localStorage.removeItem(k); } catch (e) { /* storage off */ } };
const tabAlive = () => { try { localStorage.setItem("hallway-tab-alive:" + TAB_ID, String(Date.now())); } catch (e) { /* storage off */ } };
if (!window.HALLWAY_PLAY) { tabAlive(); setInterval(tabAlive, 4000); window.addEventListener("pagehide", () => { try { localStorage.removeItem("hallway-tab-alive:" + TAB_ID); } catch (e) { /* gone */ } }); }
/* the recovery copy this tab should open with: its own, or else the newest one left by a tab that's closed */
function findDraft() {
    const read = id => { const [k, b, a] = DRAFT_KEYS(id), text = localStorage.getItem(k); return text ? { id, text, base: localStorage.getItem(b), at: +localStorage.getItem(a) || 0 } : null; };
    const own = read(TAB_ID); if (own) return own;
    const ids = [""]; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("hallway-draft:")) ids.push(k.slice(14)); }
    const open = id => id && Date.now() - (+localStorage.getItem("hallway-tab-alive:" + id) || 0) < 12000;
    return ids.filter(id => id !== TAB_ID && !open(id)).map(read).filter(Boolean).sort((p, q) => q.at - p.at)[0] || null;
}
/* with a carried piece put back where it came from, so a reload while carrying doesn't lose it (15 Nov scan, editor 20) */
function rootText() {
    if (!carry || !carry.from) return JSON.stringify(root);
    const list = carry.tele ? (carry.from.teles = carry.from.teles || []) : (carry.from.props = carry.from.props || []);
    list.push(carry.p); try { return JSON.stringify(root); } finally { list.splice(list.indexOf(carry.p), 1); }
}
function rememberDraft() { try { const [k, b, a] = DRAFT_KEYS(TAB_ID); localStorage.setItem(k, rootText()); if (serverText !== null) localStorage.setItem(b, textMark(serverText)); localStorage.setItem(a, String(Date.now())); } catch (e) { /* too big: the saved copy stands */ } }
const closePicker = () => { if (window.ColourPicker && ColourPicker.isOpen()) ColourPicker.close(true); };
const syncLight = () => { const e = $("light"); if (e) e.value = map.light || "sconces"; };
const stopWalkForChange = () => { if (tool === "walk") { setTool("select"); flash("Stopped walking: the map changed."); } };
function restore(text) { stopWalkForChange(); closePicker(); carry = null; roomFloors = null; doorFrames.clear();      /* the door-swing floors follow the undo (10 Nov scan b, rooms 17) */
    const id = level && level.id; setTimeout(() => { try { showMapInfo(); } catch (e) { /* the Map tab follows Undo and Redo (10 Nov scan, editor 21) */ } }, 0); select(null); root = JSON.parse(text); if (!mapOf(mapNow)) mapNow = "hallway"; map = mapOf(mapNow); level = byId(id) || map.levels[0]; stairMemo = null; buildLevels(); syncPlace(); syncLight(); changed(); }
function undo() { if (!undoStack.length) return; parked = null; const was = JSON.stringify(root); redoStack.push(was); restore(undoStack.pop()); sayOtherMapStep(was, "Undone"); }
function redo() { if (!redoStack.length) return; parked = null; const was = JSON.stringify(root); undoStack.push(was); restore(redoStack.pop()); sayOtherMapStep(was, "Redone"); }
/* ---------- the two maps (12 Nov 2026) ---------- */
function fixRoot() {
    root.stairs = root.stairs || [];
    const g = root.gallery; if (g) { g.levels = g.levels || []; g.stairs = g.stairs || []; g.lifts = g.lifts || []; if (!g.rect) g.rect = { ...root.rect }; migrateHeights(g); }
}
function syncPlace() { const e = $("placeSel"); if (e) e.value = mapNow; document.body.dataset.place = mapNow; }
/* an Undo or Redo that changed only the map not showing says where it went, as the Rooms editor does for layouts (15 Nov scan, rooms 15).
   was: the whole file's text before the step. Called by undo() and redo() */
function sayOtherMapStep(was, word) {
    try {
        /* the Hallways are the file less its gallery */
        const part = (o, p) => { if (!o) return "null"; if (p === "gallery") return JSON.stringify(o.gallery || null); const { gallery, ...rest } = o; return JSON.stringify(rest); };
        const before = JSON.parse(was), other = mapNow === "gallery" ? "hallway" : "gallery";
        if (part(before, mapNow) !== part(root, mapNow) || part(before, other) === part(root, other)) return;
        flash(word + " in " + PLACE_NAME[other] + ".");
    } catch (e) { /* nothing said */ }
}
const placeWatchers = new Set();
/* the Events Gallery's first room: a plain floor in the Game Hall style, ready for its tunnel */
function makeGallery() {
    const id = "L" + Date.now().toString(36), cells = [];
    for (let x = 0; x < 9; x++) for (let y = 0; y < 7; y++) cells.push(x + "," + y);
    root.gallery = { light: root.light, rect: { ...root.rect }, style: "gamehall", stairs: [], lifts: [],
        levels: [{ id, k: 0, name: "Gallery", way: "oxblood", style: "gamehall", cells, rugs: [], medals: [], doors: [], lamps: [], props: [], teles: [] }] };
}
/* Show the other map: everything drawn so far was the old map's, so it all goes, and the tools carry on in the new one. A walk carries on
   through it (opts.walking: a tunnel brought you here) */
function setPlace(p, opts = {}) {
    if (p === mapNow && map === mapOf(p)) return;
    let made = false;
    if (p === "gallery" && !root.gallery) { if (window.HALLWAY_PLAY) return; snapshot(); makeGallery(); made = true; }
    if (!opts.walking) stopWalkForChange();
    mapNow = p; map = mapOf(p);
    select(null); carry = null; hover = null; seeCut = null; roomFloors = null; doorFrames.clear(); stairMemo = null; reachMemo = null; cellSets = new Map();
    for (const c of inflight.values()) c.abort(); inflight.clear(); for (const c of moodInflight.values()) c.abort(); moodInflight.clear();
    tiles.clear(); moodTiles.clear(); tileWaits.clear(); version = null; lastVersionText = null;
    level = (opts.level && map.levels.includes(opts.level) ? opts.level : null) || map.levels.find(l => l.k === 0) || map.levels[0];
    buildLevels(); syncPlace(); syncLight(); showMapInfo();
    if (!opts.walking) { const li = liftTile(); cam.x = (li[1] - li[2]) * 16 + 120; cam.y = (li[1] + li[2]) * 8 + 60; clampCam(); }
    if (made) changed(); else { requestArt(true); runChecks(); paint(); }
    if (window.HallwayAudio && HallwayAudio.setPlace) try { HallwayAudio.setPlace(p); } catch (e) { /* the music carries on as it was */ }
    for (const f of placeWatchers) try { f(p); } catch (e) { console.error(e); }
    if (!opts.walking && !window.HALLWAY_PLAY) flash(made ? "The Events Gallery is ready: one room to start. Put a tunnel in it, and one in the Hallways, and link them." : "Working on " + PLACE_NAME[p] + ".");
}
/* tunnels on either map: a tunnel's `to` is an id, and ids are never shared, so a link can go from one map to the other */
const tunnelsOf = p => { const m = mapOf(p); return (m && m.tunnels) || []; };
const allTunnels = () => ["hallway", "gallery"].flatMap(p => tunnelsOf(p).map(q => ({ place: p, q })));
function findTunnel(id) { return id ? allTunnels().find(t => t.q.id === id) || null : null; }
function unlinkTunnel(id) { for (const t of allTunnels()) if (t.q.to === id) delete t.q.to; }
const levelIn = (p, id) => { const m = mapOf(p); return m && m.levels.find(l => l.id === id); };
function tunnelLabel(t) { const lv = levelIn(t.place, t.q.level); return (t.place !== mapNow ? (t.place === "gallery" ? "In the Events Gallery: " : "In the Hallways: ") : "") + "the tunnel on " + ((lv && lv.name) || "?") + ", " + (t.q.axis === "x" ? "back" : "side") + " wall at " + t.q.at; }
function syncButtons() { $("undo").disabled = !undoStack.length; $("redo").disabled = !redoStack.length; $("save").disabled = !dirty; $("save").classList.toggle("attention", dirty); }
/* Publish: sends the saved map to the site's own folder, drawn and ready. Nobody sees it until the site is deployed. */
async function publish() {
    const b = $("publish"); if (b.disabled) return;
    if (checksTimer) { clearTimeout(checksTimer); checksTimer = 0; runChecks(); }      // a check still waiting to run counts
    if (lastProblems && !window.confirm(`The Problems tab lists ${lastProblems} thing${lastProblems === 1 ? "" : "s"} wrong with the maps (the Hallways and the Events Gallery are published together). Publish anyway?`)) return;
    b.disabled = true;
    try {
        if (dirty) { await save(); if (dirty) throw new Error("it wouldn't save, so nothing's been published"); }
        const r = await fetch("/api/publish", { method: "POST" }); if (!r.ok) throw new Error((await r.json()).error || "Couldn't start");
        for (;;) {
            await new Promise(f => setTimeout(f, 800));
            const o = await (await fetch("/api/publish")).json();
            if (o.running) { b.textContent = o.of ? `Publishing ${o.at} of ${o.of}` : "Publishing"; continue; }
            if (o.error) throw new Error(o.error);
            flash(window.HALLWAY_EDIT ? "Published. It's live on the site now." : "Published. The code goes live the next time you deploy. The map on the site is the Warren's, once it has one.");
            break;
        }
    } catch (e) { flash("Couldn't publish: " + e.message); }
    b.disabled = false; b.textContent = "Publish";
}
/* the saved file's mark when this tab read it (the local server sends one): sent back with each save, so a save from another tab since then
   is caught (409) rather than overwritten (15 Nov scan, editor 1). The Warren's copy has its own base check (edit.js). */
let mapMark = null;
const readMark = r => { mapMark = (r && r.headers && r.headers.get("X-Map-Mark")) || null; };
let saving = null;
function save() { if (saving) return saving; saving = save1().finally(() => { saving = null; }); return saving; }       // one at a time: a second Ctrl+S joins the first
async function save1() {
    if (window.HALLWAY_PLAY || !root) return;
    putBack();
    /* a box still being typed in has its words put in first (15 Nov scan, editor 7): its change only lands when it loses the focus */
    const f = document.activeElement; if (f && f.matches && f.matches("input, textarea") && f !== $("search")) { f.blur(); f.focus(); }
    markNoReach();
    setSaveState("busy", "Saving...");
    const sent = JSON.stringify(root);
    const post = force => fetch("/api/map" + (force ? "?force=1" : ""), { method: "POST", headers: { "Content-Type": "application/json", ...(mapMark ? { "X-Map-Base": mapMark } : {}) }, body: sent });
    const why = async r => { try { const o = await r.clone().json(); if (o && o.error) return o.error; } catch (e) { /* not words */ } return r.status === 413 ? "the map is too big to send" : "the server said " + r.status; };
    let r = null, thrown = null;
    try {
        r = await post(false);
        /* someone else has saved since this copy was opened, from another tab or machine */
        if (r.status === 409) {
            let said = await why(r); if (/^the server said/.test(said)) said = "This map has been saved from another tab or window since this one opened it.";
            if (!window.confirm(said.replace(/\s*$/, " ") + "\n\nOK saves this tab's copy over it. Cancel saves nothing: then \"Back to last save\" loads the other copy (and drops this tab's changes).")) { setSaveState("failed", "Not saved: changed in another tab"); flash("Not saved. \"Back to last save\" loads the other copy; Save again replaces it with this one."); return; }
            r = await post(true);
        }
    } catch (e) { r = null; thrown = e; }
    if (!r || !r.ok) {
        const reason = r ? await why(r) : (thrown && thrown.name === "TypeError" ? (window.HALLWAY_EDIT ? "the site isn't answering (is the connection down?)" : "the editor's server isn't answering (is its window closed?)") : String(thrown && thrown.message || thrown));
        setSaveState("failed", "Not saved"); flash("Couldn't save: " + reason + ". Your changes are still here.");
        return;
    }
    try { const o = await r.clone().json(); if (o && o.mark) mapMark = o.mark; } catch (e) { /* the Warren's answer has no mark */ }
    /* anything changed while that was on its way is still unsaved */
    if (JSON.stringify(root) !== sent) { savedAt = Date.now(); serverText = sent; rememberDraft(); setSaveState("ok", "Saved, with newer changes still to save"); syncButtons(); return; }
    serverText = sent; $("revert").hidden = true;
    dirty = false; $("dirty").hidden = true; savedAt = Date.now(); forgetDraft(); setSaveState("ok", "Saved " + new Date().toTimeString().slice(0, 5)); syncButtons();
}
const setStatus = t => { $("st-draw").textContent = t; };
/* the save's own slot, which drawing never writes over: a failed save stays failed until one goes through (15 Nov scan, editor 3) */
function setSaveState(kind, t) { const e = $("st-save"); if (!e) return setStatus(t); e.textContent = t; e.dataset.state = kind; e.title = kind === "failed" ? "The last save didn't go through. Your changes are still here: Save (Ctrl+S) tries again." : ""; }

/* ---------- art from the server, as squares ----------
   Each square is kept until a newer one replaces it, so what you've seen never goes black: after an
   edit the old picture stays up and the new one lands over it, nearest squares first. */
const TILE = 512, CONCURRENT = 6;
const tiles = new Map();        // "tx,ty" -> { img, v }
let tileGen = 0;                // goes up whenever a square's picture arrives, so what was read off the screen (live-leet.js) knows to look again
const inflight = new Map();     // "tx,ty" -> AbortController
let version = null, artTimer = 0, versionSeq = 0, lastReport = null, lastVersionText = null;
/* What an edit can have changed on the map's pictures, so only those squares are drawn again (10 Nov scan, his: "the editor feels slow and
   clunky": one plant placed had every square in view redrawn, 41 of them, over eight seconds). Furniture, things on walls and garlands are
   worked out as boxes round where they stand, before and after; anything else (walls, floors, heights, stairs, lights, a lamp, a tree, a
   window's sunlight) has the whole map drawn again, as before. null: everything. */
const LIGHTS_UP = k => k === "lamp" || k === "tablelamp" || k === "rarecase" || k === "statue" || k === "xmastree" || /^xmasfir/.test(k);
function dirtyRegion(oldText, newText) {
    let a, b; try { a = JSON.parse(oldText); b = JSON.parse(newText); } catch (e) { return null; }
    const rest = m => JSON.stringify({ ...m.map, levels: undefined, rooms: undefined, lostSpots: undefined, hustle: undefined }) + JSON.stringify([m.liftOpen, m.cut]);      // the Lost Property spots and his seat are drawn live, not in the pictures
    if (rest(a) !== rest(b) || a.map.levels.length !== b.map.levels.length) return null;
    const LISTS = ["props", "wallItems", "garlands", "medals"], boxes = [];
    for (let i = 0; i < a.map.levels.length; i++) {
        const la = a.map.levels[i], lb = b.map.levels[i]; if (la.id !== lb.id) return null;
        const strip = l => { const c = { ...l }; for (const k of LISTS) delete c[k]; return JSON.stringify(c); }; if (strip(la) !== strip(lb)) return null;
        const l = byId(lb.id); if (!l) return null; const wins = (lb.wallItems || []).filter(q => q.k === "i_window").map(q => q.axis === "x" ? [q.at, q.line] : [q.line, q.at]);
        for (const key of LISTS) {
            const A = (la[key] || []).map(o => JSON.stringify(o)), B = (lb[key] || []).map(o => JSON.stringify(o)), count = new Map();
            for (const t of A) count.set(t, (count.get(t) || 0) + 1); for (const t of B) count.set(t, (count.get(t) || 0) - 1);
            for (const [t, n] of count) { if (!n) continue; const o = JSON.parse(t), box = boxOf(l, key, o, wins); if (!box) return null; boxes.push(box); }
        }
    }
    return boxes;
}
function boxOf(l, key, o, wins) {
    const z = levelZ(l), PAD = 40;
    if (key === "props") {
        if (LIGHTS_UP(o.k) || (o.lights && o.lights.length) || wins.some(w => Math.abs(w[0] - o.x) + Math.abs(w[1] - o.y) < 18)) return null;      // its light, or a window's sun shafts it can stand in, reach far
        let tiles; try { tiles = Parts.tiles(o); } catch (e) { return null; }
        const t = TALL[o.k] || [48, 160]; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [x, y] of tiles) { const p = P(x + .5, y + .5, tileZ(l, x, y) + (o.z || 0)); x0 = Math.min(x0, p[0] - t[0] - 32); x1 = Math.max(x1, p[0] + t[0] + 32); y0 = Math.min(y0, p[1] - t[1] - 24); y1 = Math.max(y1, p[1] + 24); }
        return [x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD];
    }
    if (key === "wallItems") {
        const def = wallItemOf(o.k); if (!def || def.lit || o.k === "i_window" || o.k === "i_fireexit") return null;
        let r; try { r = wallItemRect(l, o); } catch (e) { return null; } if (!r) return null;
        return [r.x0 - PAD - 16, r.y0 - PAD - 16, r.x0 + r.w + PAD + 16, r.y0 + r.h + PAD + 16];
    }
    if (key === "garlands") { const pts = []; for (const t of [o.a, o.b]) for (const h of [0, 200]) pts.push(o.axis === "x" ? P(t, o.line, z + h) : P(o.line, t, z + h)); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs) - PAD - 32, Math.min(...ys) - PAD - 60, Math.max(...xs) + PAD + 32, Math.max(...ys) + PAD + 40]; }
    if (key === "medals") { const p = P(o.x + 2, o.y + 2, z); return [p[0] - 160, p[1] - 160, p[0] + 160, p[1] + 120]; }
    return null;
}
/* the squares no box touches are as good under the new version as the old: kept, marked new */
function keepUntouched(was, now, boxes) {
    if (!was || !boxes) return;
    const touched = (tx, ty) => boxes.some(b => b[2] > tx * TILE && b[0] < (tx + 1) * TILE && b[3] > ty * TILE && b[1] < (ty + 1) * TILE);
    for (const [k, t] of tiles) { if (t.v !== was) continue; const [tx, ty] = k.split(",").map(Number); if (!touched(tx, ty)) t.v = now; }
    for (const [k, t] of moodTiles) { if (t.v !== was) continue; const [tx, ty] = k.split("|")[1].split(",").map(Number); if (!touched(tx, ty)) t.v = now; }
}
/* ---------- a sign, live while it's dragged ----------
   The map's art takes a moment to draw, so the sign being dragged comes out of it and is shown on top, from a
   picture of that sign alone that the server makes in a few milliseconds. It goes back once the real art is in. */
let live = null;
function liveSrc() {
    const s = live.hit, g = s.o.sign || {}, name = s.o.kind ? stairSignName(s.o) : doorName(s.o);
    const q = new URLSearchParams({ name: name || "", way: s.l.colour ? "hex:" + s.l.colour : s.l.way }); if (g.w) q.set("w", g.w); if (g.h) q.set("h", g.h); if (!s.o.kind && s.o.axis !== "x") q.set("y", "1"); if (s.o.kind) { q.set("stair", "1"); }
    return "/api/sign?" + q;
}
async function liveFetch() {
    if (!live || live.busy || live.ending) return;
    const src = liveSrc(); if (src === live.key) return;
    live.busy = true; live.key = src; const mine = live;
    try {
        const r = await fetch(src), a = r.headers.get("X-Anchor").split(",").map(Number), img = await createImageBitmap(await r.blob());
        mine.img = img; mine.anchor = a;
    } catch (e) { console.error(e); }
    mine.busy = false; if (live === mine) { liveFetch(); paint(); }
}
/* ---------- day and night ----------
   Ten minutes, over and over, while walking (14 Nov 2026, his): two of daylight; three of evening coming on slowly, the lights going on one
   by one at random about the map; two of night; then the same three in reverse, dawn's lights going out one by one into the day. Each mood is
   drawn whole by the server and the view fades from one to the next. The slow fades are drawn here: daylight dimmed towards the evening's
   (or dawn's) own light by multiplying (the renderer's light is a multiply, so that's very nearly the evening with every lamp off), with
   each lamp's pool cut from the lit evening's tiles and faded in on its own. The Time list overrides it. */
const CYCLE_MS = 600000;
/* seconds into the cycle: [from, mood]; a fade runs from one entry to the next */
/* 2 min of day; the evening's 3 (two and a half of lamps coming on, then half a minute into night); 2 min of full night (14 Nov 2026, his:
   it had been one and a half); the dawn's 3 (half a minute out of night, then two and a half of lamps going off) */
const CYCLE = [[0, "day"], [120, "day"], [270, "dusk"], [300, "night"], [420, "night"], [450, "dawn"], [600, "day"]];
/* the fades whose lamps go on (or off) one by one: the lit mood, and how the renderer's light compares with daylight's (LIGHTS in hw3.js) */
const LAMP_FADES = { "day>dusk": { lit: "dusk", ratio: [.52 / 1.1, .41 / 1.08, .38 / 1.04], on: true }, "dawn>day": { lit: "dawn", ratio: [.5 / 1.1, .46 / 1.08, .56 / 1.04], on: false } };
const LAMP_FADE_S = 5;           // one lamp's own fade
const LAMP_REACH = 135;          // how far a lamp's pool reaches, in map pixels (LIGHTS px about 100, and a soft edge past it)
const MOOD_TINT = { day: [0, 0, 0, 0], dusk: [70, 30, 20, .3], night: [12, 16, 44, .62], dawn: [50, 36, 70, .3], sconces: [40, 28, 24, .26], failing: [14, 14, 22, .6], cold: [20, 34, 30, .42], gas: [24, 14, 10, .62] };
const MOOD_NAME = { day: "Day", dusk: "Evening", night: "Night", dawn: "Dawn" };
let timeMode = localStorage.getItem("hallway-time") || "cycle";
/* a saved name it doesn't know (one renamed or dropped one day) would leave every square black: the cycle instead (15 Nov scan, live L12) */
if (!["cycle", "day", "dusk", "night", "dawn", "map"].includes(timeMode)) timeMode = "cycle";
let cycleStart = performance.now();
/* the screensaver brings the evening on (14 Nov 2026, his: "if it's daytime, the evening transition should start after 5s"): in full day on
   the cycle, the clock is moved on to that many seconds before the evening's fade starts. True if it did */
function eveningIn(secs) {
    if (moodForced || timeMode !== "cycle") return false;
    const t = ((performance.now() - cycleStart) % CYCLE_MS) / 1000, start = CYCLE.find(([, m], i) => m === "day" && CYCLE[i + 1] && CYCLE[i + 1][1] === "dusk");
    if (!start || t >= start[0] || t < 0) return false;
    if (start[0] - t <= secs) return true;
    cycleStart = performance.now() - (start[0] - secs) * 1000; return true;
}
const moodTiles = new Map(), moodInflight = new Map();
let moodForced = null;
/* is it night, for the night-only things (the night rope's blocking, night clues): the same clock as the picture on show, so a time held
   from the Menu wins for them too (15 Nov scan, live M3: the rope was drawn across while it let you through, and the other way about);
   on the cycle (or the map's own light) the cycle's clock, the picture's half of a fade */
function realNight() { if (MOOD_NAME[timeMode]) return timeMode === "night"; const t = ((performance.now() - cycleStart) % CYCLE_MS) / 1000; for (let i = 0; i < CYCLE.length - 1; i++) { const [t0, m0] = CYCLE[i], [t1, m1] = CYCLE[i + 1]; if (t >= t0 && t < t1) { const f = (t - t0) / (t1 - t0); return (f < .5 ? m0 : m1) === "night"; } } return false; }
function moodNow() {
    if (moodForced) return moodForced;
    if (timeMode === "map") return null;
    if (timeMode !== "cycle") return { a: timeMode, b: timeMode, f: 0 };
    const t = ((performance.now() - cycleStart) % CYCLE_MS) / 1000;
    for (let i = 0; i < CYCLE.length - 1; i++) {
        const [t0, m0] = CYCLE[i], [t1, m1] = CYCLE[i + 1];
        if (t >= t0 && t < t1) {
            const f = m0 === m1 ? 0 : (t - t0) / (t1 - t0), lamps = LAMP_FADES[m0 + ">" + m1];
            return lamps ? { a: m0, b: m1, f, lamps, at: t - t0, span: t1 - t0 } : { a: m0, b: m1, f };
        }
    }
    return { a: "day", b: "day", f: 0 };
}
function moodTile(mood, tx, ty) {
    if (window.hallwayXmas) mood += "+x";                                 // failing too: the Basement blackout darkens the garlands rather than dropping them (9 Nov scan)
    const k = mood + "|" + tx + "," + ty, t = moodTiles.get(k);
    if (t && t.v === version) return t;
    if (!moodInflight.has(k) && moodInflight.size < CONCURRENT && version && !tileWaiting(k)) {
        const v = version, ctl = new AbortController(); ctl.v = v; moodInflight.set(k, ctl);
        (async () => {
            try {
                const r = await fetch(`/api/tile?v=${v}&tx=${tx}&ty=${ty}&m=${encodeURIComponent(mood)}`, { signal: ctl.signal });
                /* the editor's server restarted and forgot this map: tell it again, as loadTile does (10 Nov scan b, server 1) */
                if (r.status === 404 && !window.HALLWAY_PLAY) { if (v === version) { version = null; setTimeout(newVersion, 400); } return; }
                if (!r.ok) { tileFailed(k); return; }
                const img = await createImageBitmap(await r.blob()); tileWaits.delete(k);
                if (v === version) { const old = moodTiles.get(k); if (old && old.img.close) old.img.close(); moodTiles.set(k, { img, v }); tileGen++; paint(); } else if (img.close) img.close();
            } catch (e) { if (e.name !== "AbortError") tileFailed(k); /* the view asks again, in a while */ } finally { if (moodInflight.get(k) === ctl) moodInflight.delete(k); }
        })();
    }
    /* the last version of it until the new one's in; or, just after Christmas is turned on or off, the same square the other way (10 Nov scan, editor 7) */
    return t || moodTiles.get(k.endsWith("+x|" + tx + "," + ty) ? k.replace("+x|", "|") : k.replace("|", "+x|")) || null;
}
/* The whole map, not only what's on screen: the time of day showing first, nearest first, then the one coming, then, on the walking page and not on a phone, the rest (the editor draws its own, so it stops at what it can show). A slot's always left for what's on screen, so looking around stays quick */
const MOODS_ALL = ["day", "dusk", "night", "dawn"];
function preloadMap() {
    if (!map || !map.rect || !version || document.hidden) return; const m = moodNow(); if (!m) return;
    if (window.hallwayTilesHeld && hallwayTilesHeld()) return;      // the pictures are failing: only what's on screen is asked for (play.js, 15 Nov scan, live M1)
    if (!window.HALLWAY_PLAY && (drag || performance.now() - lastChangeAt < 4000)) return;      // while you're placing things, what's on screen comes first
    const r = camRect() || map.rect, order = []; for (const q of [m.a, m.b]) if (!order.includes(q)) order.push(q);
    if (timeMode === "cycle") { const at = CYCLE.findIndex(c => c[1] === m.b), after = at >= 0 ? CYCLE.slice(at + 1).map(c => c[1]) : []; for (const q of after) if (!order.includes(q)) order.push(q); }
    const small = window.matchMedia && matchMedia("(pointer: coarse)").matches; if (!small && window.HALLWAY_PLAY) for (const q of MOODS_ALL) if (!order.includes(q)) order.push(q);
    const cells = []; for (let ty = Math.floor(r.y / TILE); ty <= Math.floor((r.y + r.h) / TILE); ty++) for (let tx = Math.floor(r.x / TILE); tx <= Math.floor((r.x + r.w) / TILE); tx++) cells.push([tx, ty, Math.hypot((tx + .5) * TILE - cam.x, (ty + .5) * TILE - cam.y)]);
    cells.sort((p, q) => p[2] - q[2]);
    for (const mood of order) for (const [tx, ty] of cells) { if (moodInflight.size >= Math.max(1, CONCURRENT - 1)) return; const k = (window.hallwayXmas ? mood + "+x" : mood) + "|" + tx + "," + ty, t = moodTiles.get(k); if (t && t.v === version) continue; if (moodInflight.has(k) || tileWaiting(k)) continue; moodTile(mood, tx, ty); }
}
setInterval(preloadMap, 300);
/* every light on the map, where its pool falls in map pixels, each with its own moment in a slow fade (random but fixed for its place).
   As the renderer places its lights (render/hw*.js, 14 Nov scan): a wall lamp lights the floor about 1.6 tiles out from its wall and the wall
   round its shade 70px up, so its pool sits between the two, nearer the shade; pillar lamps on the face they're on; and the rare cases' glass and the
   Theatredrome's alcove light too, which had come on with the evening all at once. A lift's cabin light only shows with its doors open,
   which the view draws itself, so it has none. Every floor's, as the picture shows every floor at once. */
let lampMemo = null;
const PILLAR_FACE = { l: [.5, 1.1], r: [1.1, .5], bl: [-.1, .5], br: [.5, -.1] };
function lampPools() {
    if (lampMemo && lampMemo.map === map && lampMemo.v === version) return lampMemo.list;
    const list = [], seen = new Set(), add = (l, x, y, up) => {
        const k = Math.round(x * 4) + "," + Math.round(y * 4) + "," + l.k; if (seen.has(k)) return; seen.add(k);
        const p = P(x, y, tileZ(l, Math.floor(x), Math.floor(y)) + up); let h = (Math.round(x * 4) * 374761393 + Math.round(y * 4) * 668265263 + l.k * 97) | 0;
        h = (h ^ (h >>> 13)) * 1274126177 | 0; list.push({ x: p[0], y: p[1], r: ((h ^ (h >>> 16)) >>> 0) / 4294967296 });
    };
    const WALL_OUT = .3, WALL_UP = 62;      // measured 14 Nov against the lit evening with every lamp on: nearer its shade than the floor pool matches best
    const onWall = (l, q, up) => { if (q.axis === "x") add(l, q.at, q.line + WALL_OUT, up); else add(l, q.line + WALL_OUT, q.at, up); };
    for (const l of (map && map.levels) || []) {
        for (const q of (l.lamps || [])) onWall(l, q, WALL_UP);
        for (const p of (l.props || [])) {
            if (p.k === "lamp" || p.k === "tablelamp" || p.k === "rarecase") add(l, p.x + .5, p.y + .5, 30);
            else if ((p.k === "pillar" || p.k === "pillartall") && p.lights) for (const f of p.lights) { const o = PILLAR_FACE[f] || [.5, .5]; add(l, p.x + o[0], p.y + o[1], 40); }
            else if (p.lights && p.lights.length) add(l, p.x + .5, p.y + .5, 30);
        }
        for (const it of (l.wallItems || [])) { const def = wallItemOf(it.k); if (def && def.lit) onWall(l, it, WALL_UP); }
    }
    for (const t of (map && map.theatres) || []) { const l = byId(t.level); if (l) { if (t.axis === "x") add(l, t.at + 4, t.line + .4, 6); else add(l, t.line + .4, t.at + 4, 6); } }
    lampMemo = { map, v: version, list }; return list;
}
const smooth = f => f * f * (3 - 2 * f);
/* where a square goes on the screen, in whole pixels: at a zoom between whole steps (the screensaver's ease) each edge is rounded on its own,
   so neighbours always meet with no seam or doubled column (14 Nov scan); at a whole zoom it's exactly tx * S */
const tileBox = (t, S) => { const a = Math.round(t * S); return [a, Math.round((t + 1) * S) - a]; };
/* A slow fade with its lamps: daylight dimmed to the lit mood's light, then each lamp's pool of the lit mood over it, as far on as it is.
   The daylight squares and the dimming go straight onto the view each paint, as before (both cheap there). The costly part, the lit mood
   cut to the lamps' pools, is kept square by square (14 Nov scan: rebuilt whole every paint, the fade cost about five normal frames) and
   put together again only where a lamp's brightness has moved on a step, in the part of the square its pool covers. A pan just draws the
   kept squares somewhere else. */
/* how far on a lamp is, in 64ths: drawn exactly as before at each step, and a pool fading over its 5 s is never more than half a 64th off
   (a level of brightness at most). Rebuilding at every frame's exact brightness cost twice as much (measured 14 Nov: 3-5 ms a paint
   against 5-17, where the old way took 9-15 and a plain day 1.4) */
const LAMP_STEPS = 64;
const lampSquares = new Map(); let lampMask = null;
function dropLampSquares() { if (lampSquares.size || lampMask) { lampSquares.clear(); lampMask = null; } }
function lampsByTile(pools) {
    if (pools.byTile) return pools.byTile;
    const by = new Map(), reach = LAMP_REACH + 2;
    pools.forEach((q, i) => { for (let ty = Math.floor((q.y - reach) / TILE); ty <= Math.floor((q.y + reach) / TILE); ty++) for (let tx = Math.floor((q.x - reach) / TILE); tx <= Math.floor((q.x + reach) / TILE); tx++) { const k = tx + "," + ty; if (!by.has(k)) by.set(k, []); by.get(k).push(i); } });
    return (pools.byTile = by);
}
/* Drawn in memory, not on the graphics card (willReadFrequently): a kept square is then sent to the card once per change and drawn from
   there. A card-side canvas drawn into the view costs a round trip every paint, about 0.8 ms a square (measured 14 Nov: 9 squares 7.6 ms
   against 0.3 ms) */
const memCanvas = (w, h, opts) => { const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d", { willReadFrequently: true, ...opts }); return c; };
function drawLampFade(m, ox, oy, x0, x1, y0, y1) {
    const L = m.lamps, g = L.on ? smooth(m.f) : 1 - smooth(m.f), S = TILE * zoom, R = LAMP_REACH * zoom;
    let any = false;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const d = moodTile("day", tx, ty) || moodTile(L.lit, tx, ty), [bx, W] = tileBox(tx, S), [by, H] = tileBox(ty, S);
        if (!d) { const t = tiles.get(tx + "," + ty); if (t) ctx.drawImage(t.img, ox + bx, oy + by, W, H); continue; }
        ctx.drawImage(d.img, ox + bx, oy + by, W, H); any = true;
    }
    if (!any) return;
    ctx.save(); ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgb(" + L.ratio.map(r => Math.round(255 * (1 + (r - 1) * g))).join(",") + ")"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
    /* how far on each lamp is: going on, each at its own moment through the middle of the fade; going off, the same backwards */
    const pools = lampPools(), byTile = lampsByTile(pools), fadeF = LAMP_FADE_S / m.span, step = new Float64Array(pools.length);
    pools.forEach((q, i) => { const at = L.on ? .15 + .75 * q.r : .05 + .7 * q.r, k = L.on ? (m.f - at) / fadeF : 1 - (m.f - at) / fadeF; step[i] = Math.round(Math.max(0, Math.min(1, k)) * LAMP_STEPS) / LAMP_STEPS; });
    /* The kept squares are made at a whole zoom: mid-way through the screensaver's ease (a new zoom every frame) they're the nearest whole
       zoom's, drawn to size, and made again only when that whole zoom changes. Built at each frame's zoom, every square on screen was made
       again whole every frame, 42 ms a frame against 4 (15 Nov scan, live M6). At a whole zoom nothing changes. */
    const ZB = Number.isInteger(zoom) ? zoom : Math.max(1, Math.round(zoom)), SB = TILE * ZB, RB = LAMP_REACH * ZB;
    const keep = new Set();
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const key = tx + "," + ty, lit = moodTile(L.lit, tx, ty); if (!lit) continue;
        const on = (byTile.get(key) || []).filter(i => step[i] > 0); if (!on.length) continue;
        keep.add(key);
        const [bx, bw] = tileBox(tx, SB), [by, bh] = tileBox(ty, SB), [sx, sw] = tileBox(tx, S), [sy, sh] = tileBox(ty, S);
        let e = lampSquares.get(key), rect = null;
        if (!e || e.lit !== lit.img || e.pools !== pools || e.bw !== bw || e.bh !== bh || e.bx !== bx || e.by !== by || e.zoom !== ZB) {
            if (!e || e.bw !== bw || e.bh !== bh) { e = { cv: memCanvas(bw, bh) }; lampSquares.set(key, e); }
            Object.assign(e, { lit: lit.img, pools, bw, bh, bx, by, zoom: ZB, steps: new Map() }); rect = [0, 0, bw, bh];
        } else {
            /* only the lamps that moved on (or went out): the part of the square their pools cover */
            let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity; const grow = i => { const q = pools[i], cx = q.x * ZB - bx, cy = q.y * ZB - by; rx0 = Math.min(rx0, cx - RB); ry0 = Math.min(ry0, cy - RB); rx1 = Math.max(rx1, cx + RB); ry1 = Math.max(ry1, cy + RB); };
            for (const i of on) if (e.steps.get(i) !== step[i]) grow(i);
            for (const i of e.steps.keys()) if (step[i] <= 0) grow(i);
            if (rx1 > rx0) { const a = Math.max(0, Math.floor(rx0)), b = Math.max(0, Math.floor(ry0)), c = Math.min(bw, Math.ceil(rx1)), dd = Math.min(bh, Math.ceil(ry1)); if (c > a && dd > b) rect = [a, b, c - a, dd - b]; }
        }
        if (rect) {
            const n = Math.max(bw, bh); if (!lampMask || lampMask.width < n) lampMask = memCanvas(n, n);
            const gx = e.cv.getContext("2d", { willReadFrequently: true }), mc = lampMask.getContext("2d", { willReadFrequently: true }); gx.imageSmoothingEnabled = false;
            /* the lit mood's square, kept only as far as the pools reach: each a soft disc, as bright as its lamp is on, added together */
            gx.save(); gx.beginPath(); gx.rect(rect[0], rect[1], rect[2], rect[3]); gx.clip(); gx.clearRect(rect[0], rect[1], rect[2], rect[3]); gx.drawImage(lit.img, 0, 0, bw, bh);
            mc.save(); mc.beginPath(); mc.rect(rect[0], rect[1], rect[2], rect[3]); mc.clip(); mc.clearRect(rect[0], rect[1], rect[2], rect[3]); mc.globalCompositeOperation = "lighter";
            for (const i of on) { const q = pools[i], a = step[i], cx = q.x * ZB - bx, cy = q.y * ZB - by, gr = mc.createRadialGradient(cx, cy, RB * .35, cx, cy, RB); gr.addColorStop(0, "rgba(0,0,0," + a + ")"); gr.addColorStop(1, "rgba(0,0,0,0)"); mc.fillStyle = gr; mc.fillRect(cx - RB, cy - RB, 2 * RB, 2 * RB); }
            mc.restore();
            gx.globalCompositeOperation = "destination-in"; gx.drawImage(lampMask, 0, 0); gx.restore();
            e.steps = new Map(on.map(i => [i, step[i]]));
        }
        if (sw === bw && sh === bh) ctx.drawImage(e.cv, ox + sx, oy + sy); else ctx.drawImage(e.cv, ox + sx, oy + sy, sw, sh);
    }
    /* what's gone off the screen, or has no lamp on, is let go */
    for (const k of lampSquares.keys()) if (!keep.has(k)) lampSquares.delete(k);
    /* The ends meet the plain pictures exactly: the evening's last 7% (every lamp is on by then) brings the whole lit picture in, and dawn's
       first 5% (before the first lamp goes off) takes it out. Between the pools the lit picture is brighter than daylight dimmed, so the floor
       there jumped by up to 81 levels as the plain picture took over (15 Nov scan, live M4) */
    const whole = L.on ? (m.f - .93) / .07 : 1 - m.f / .05;
    if (whole > 0) {
        ctx.globalAlpha = Math.min(1, whole);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const lit = moodTile(L.lit, tx, ty); if (!lit) continue; const [bx, W] = tileBox(tx, S), [by, H] = tileBox(ty, S); ctx.drawImage(lit.img, ox + bx, oy + by, W, H); }
        ctx.globalAlpha = 1;
    }
}
function drawMoods(ox, oy, x0, x1, y0, y1) {
    const m = moodNow(); if (!m) { dropLampSquares(); return false; }
    if (m.lamps) { drawLampFade(m, ox, oy, x0, x1, y0, y1); const name = m.f < .5 ? m.a : m.b; if ($("timeNow").textContent !== MOOD_NAME[name]) $("timeNow").textContent = MOOD_NAME[name]; return true; }
    dropLampSquares();      // no lamp fade: its kept squares go
    const S = TILE * zoom;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const a = moodTile(m.a, tx, ty), b = m.f > 0 ? moodTile(m.b, tx, ty) : null, [bx, W] = tileBox(tx, S), [by, H] = tileBox(ty, S), X = ox + bx, Y = oy + by;
        /* what a mood hasn't got yet is shown in whichever has */
        const under = a || b; if (!under) { const t = tiles.get(tx + "," + ty); if (t) ctx.drawImage(t.img, X, Y, W, H); continue; }
        ctx.drawImage(under.img, X, Y, W, H);
        if (a && b && m.f > 0) { ctx.globalAlpha = m.f; ctx.drawImage(b.img, X, Y, W, H); ctx.globalAlpha = 1; }
    }
    /* the name of the time of day, in the status bar */
    const name = m.f < .5 ? m.a : m.b; if ($("timeNow").textContent !== MOOD_NAME[name]) $("timeNow").textContent = MOOD_NAME[name];
    return true;
}
function avatarTint(c, w = 33, h = 56) {
    const m = moodNow() || { a: map.light || "sconces", b: map.light || "sconces", f: 0 };
    const A = MOOD_TINT[m.a] || MOOD_TINT.day, B = MOOD_TINT[m.b] || MOOD_TINT.day, f = m.f, v = [0, 1, 2, 3].map(i => A[i] + (B[i] - A[i]) * f); if (v[3] <= 0) return;
    /* how much light reaches you from the lights near you, as the floor gets it */
    const on = walker.st ? walker.st.low : walker.l.stair ? walker.l.stair.low : walker.l; let glow = 0;
    const near = (x, y) => { const d = Math.hypot(walker.x + .5 - x, walker.y + .5 - y) / 7; if (d < 1) glow += (1 - d) * (1 - d); };
    if (on) {
        for (const q of (on.lamps || [])) { if (q.axis === "x") near(q.at, q.line + 1.6); else near(q.line + 1.6, q.at); }
        for (const p of (on.props || [])) if (p.k === "lamp" || p.k === "tablelamp" || (p.lights && p.lights.length)) near(p.x + .5, p.y + .5);
    }
    glow = Math.min(1, glow);
    c.save(); c.globalCompositeOperation = "source-atop";
    c.fillStyle = `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${v[3] * (1 - glow * .85)})`; c.fillRect(0, 0, w, h);
    if (glow > 0) { c.fillStyle = `rgba(255,190,110,${glow * .14 * Math.min(1, v[3] * 2.5)})`; c.fillRect(0, 0, w, h); }
    c.restore();
}
/* Only while something's changing: a fade between times of day, or a drink in hand */
let moodPainted = null;
setInterval(() => {
    if (!map || document.hidden) return;
    const m = timeMode === "cycle" ? moodNow() : null, mark = m ? m.a + "|" + m.b : null, fading = !!m && (m.f > 0 || mark !== moodPainted); moodPainted = mark;
    if (fading || (tool === "walk" && walker && walker.drink)) paint();
}, 500);      /* twice a second: a step of the fade is too small to see, and it ran for half the cycle (10 Nov scan, live 9) */
function drawLiveSign() {
    if (!live) return;
    if (live.ending && live.finalV && version === live.finalV) {
        const [x0, x1, y0, y1] = visibleTiles(); let ready = true;
        for (let ty = y0; ty <= y1 && ready; ty++) for (let tx = x0; tx <= x1; tx++) { if (!shownFresh(tx, ty)) { ready = false; break; } }
        if (ready) { live = null; return; }
    }
    liveFetch();
    if (!live.img) return;
    const b = signBox(live.hit.l, live.hit.o); if (!b) return;
    const p = b.at(0, 0), ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(live.img, ox + (p[0] - live.anchor[0]) * zoom, oy + (p[1] - live.anchor[1]) * zoom, live.img.width * zoom, live.img.height * zoom);
}
/* he edits the lamp sheets in art/lamps (globe-lamp, globe-table-lamp, the wall lights) in his own program: when one is saved, the map follows */
let artAt = null;
if (!window.HALLWAY_PLAY && !window.HALLWAY_EDIT) setInterval(async () => {
    try {
        const o = await (await fetch("/api/art")).json();
        if (artAt !== null && o.at !== artAt && map) { requestArt(true); setTimeout(() => { for (const n of ["art/lamp-globe.png", "art/sconce-globe-x.png", "art/sconce-globe-y.png", "art/sconce-globe-back-l.png", "art/sconce-globe-back-r.png", "art/wall/i_tablelamp.png"]) { const i = spriteImgs[n]; if (i) i.src = n + "?" + o.at; } }, 1500); }
        artAt = o.at;
    } catch (e) { /* the server's away; it'll say so elsewhere */ }
}, 1000);
/* Hold X: the floor under the mouse and anything higher goes, showing what's behind. On the lowest floor, everything above it goes. The wheel moves the cut while X is held. */
function setCut(v) {
    if (v === seeCut) return;
    seeCut = v; hover = null; requestArt(true); paint();
    if (v !== null) flash("See-through: floors above " + (v > 0 ? "+" : "") + v + " are hidden. Scroll to change, let go of X to bring them back.");
}
function seeThroughDown() {
    if (tool === "walk" || !level) return;
    if (!lastMouse) { flash("Point at a floor, then hold X to see through what's above it."); return; }
    if (allHeights(level).length < 2) { flash("Nothing to see through: " + level.name + " is all one height."); return; }
    const f = tileIn(level, lastMouse[0], lastMouse[1]), h = hasFloor(level, Math.floor(f[0]), Math.floor(f[1])) ? heightAt(level, Math.floor(f[0]), Math.floor(f[1])) : allHeights(level)[0], all = allHeights(level), below = all.filter(q => q < h);
    setCut(below.length ? below[0] : h);
}
function requestArt(now) { clearTimeout(artTimer); artTimer = setTimeout(newVersion, now ? 0 : 220); }
async function newVersion() {
    const seq = ++versionSeq; firstDrawBar();
    try {
        /* while a sign's being dragged, the art leaves it out */
        const liveNow = live && !live.ending ? live.hit.o : null, keep = liveNow && liveNow.sign;
        if (liveNow) liveNow.sign = { ...keep, hide: true };
        /* and while a piece of furniture is dragged, the art leaves it out: one redraw when the drag starts, not one per tile it crosses, and
           its ghost follows the mouse in the meantime (10 Nov scan, his: no ghost when moving, and moving felt slow) */
        const held = drag && drag.kind === "move" && drag.moved && (drag.hit.type === "prop" || drag.hit.type === "tele") ? drag.hit : null, heldList = held && (held.type === "prop" ? held.l.props : held.l.teles), heldAt = heldList ? heldList.indexOf(held.o) : -1;
        if (heldAt >= 0) heldList.splice(heldAt, 1);
        /* the map showing, alone: the Hallways leave the gallery out, so an edit in one never redraws the other; `place` tells the published
           pictures which set to answer from (play.js) */
        let text; try { text = JSON.stringify({ place: mapNow, map: { ...map, rooms: undefined, gallery: undefined }, liftOpen: isOn("liftOpen"), cut: seeCut !== null ? { level: level.id, z: levelZ(level) + seeCut } : undefined }); } finally { if (heldAt >= 0) heldList.splice(heldAt, 0, held.o); }
        if (liveNow) liveNow.sign = keep;
        const r = await fetch("/api/version", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
        if (!r.ok) throw new Error("version " + r.status);
        const o = await r.json();
        if (seq !== versionSeq) return;
        lastReport = o.report; runChecks();
        if (o.v !== version) { const was = version; keepUntouched(was, o.v, was && lastVersionText ? dirtyRegion(lastVersionText, text) : null); for (const c of inflight.values()) c.abort(); inflight.clear(); for (const [k, c] of moodInflight) if (c.v !== o.v) { c.abort(); moodInflight.delete(k); } version = o.v; }      // old time-of-day requests too (10 Nov scan b, editor 7)
        lastVersionText = text;
        if (live && live.ending) live.finalV = o.v;
        pump(); paint();
    } catch (e) { console.error(e); setStatus("Can't reach the editor's server"); }
}
function visibleTiles() {
    const hw = canvas.width / zoom / 2, hh = canvas.height / zoom / 2;
    return [Math.floor((cam.x - hw) / TILE), Math.floor((cam.x + hw) / TILE), Math.floor((cam.y - hh) / TILE), Math.floor((cam.y + hh) / TILE)];
}
const tileWaits = new Map();
const tileFailed = k => { const w = tileWaits.get(k), n = w ? w.n + 1 : 1; tileWaits.set(k, { n, until: performance.now() + Math.min(60000, 1000 * Math.pow(2, n)) }); };
const tileWaiting = k => { const w = tileWaits.get(k); return !!w && performance.now() < w.until; };
setInterval(() => { if (map && tileWaits.size && !document.hidden) paint(); }, 2000);
function nextTiles() {
    /* what's on screen first, then the rest of the map, so panning finds it ready */
    const [x0, x1, y0, y1] = visibleTiles(), out = [], seen = new Set();
    const add = (tx, ty, near) => { const k = tx + "," + ty; if (seen.has(k)) return; seen.add(k); const t = tiles.get(k); if (freshTile(t) || inflight.has(k) || tileWaiting(k)) return; out.push({ tx, ty, k, d: near ? -1e6 + Math.hypot(tx * TILE - cam.x, ty * TILE - cam.y) : Math.hypot(tx * TILE - cam.x, ty * TILE - cam.y) }); };
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) add(tx, ty, true);
    /* a time of day has its own pictures, so the plain ones would be drawn for nothing: in the editor too, where they took half the drawing
       threads from the squares you were looking at (10 Nov 2026, editor speed) */
    if (moodNow()) return [];
    const r = map.rect;
    for (let ty = Math.floor(r.y / TILE); ty <= Math.floor((r.y + r.h) / TILE); ty++) for (let tx = Math.floor(r.x / TILE); tx <= Math.floor((r.x + r.w) / TILE); tx++) add(tx, ty, false);
    return out.sort((p, q) => p.d - q.d);
}
/* The first time the map is drawn, a bar over it shows how far it's got (8 Nov: "a progressive loading bar when drawing in the
   map for the first time"). Counted over the squares in view; it goes once they're all in and doesn't come back for later edits. */
let firstDrawn = false, loadBar = null;
function firstDrawBar() {
    if (firstDrawn || window.HALLWAY_PLAY || !map || !map.rect) return;
    /* the squares on screen: with a time of day on, those are all it draws */
    const [x0, x1, y0, y1] = visibleTiles(), r = map.rect; let all = 0, done = 0;
    for (let ty = Math.max(y0, Math.floor(r.y / TILE)); ty <= Math.min(y1, Math.floor((r.y + r.h) / TILE)); ty++) for (let tx = Math.max(x0, Math.floor(r.x / TILE)); tx <= Math.min(x1, Math.floor((r.x + r.w) / TILE)); tx++) { all++; if (shownFresh(tx, ty)) done++; }
    if (!loadBar) { loadBar = document.createElement("div"); loadBar.className = "first-draw"; loadBar.setAttribute("role", "progressbar"); loadBar.setAttribute("aria-label", "Drawing the map"); loadBar.innerHTML = '<span class="fd-text">Drawing the map</span><span class="fd-track"><span class="fd-fill"></span></span><span class="fd-num"></span>'; $("stage").appendChild(loadBar); }
    if (!version) { all = Math.max(1, all); done = 0; }                       // still starting up: shown, at nothing yet
    const pc = all ? Math.round(100 * done / all) : 100;
    loadBar.setAttribute("aria-valuenow", String(pc)); loadBar.querySelector(".fd-fill").style.width = pc + "%"; loadBar.querySelector(".fd-num").textContent = pc + "%";
    if (done >= all) { firstDrawn = true; const b = loadBar; b.classList.add("done"); setTimeout(() => b.remove(), 600); loadBar = null; }
}
function pump() {
    if (!version || !map) return;
    firstDrawBar();
    const want = nextTiles();
    for (const n of want) {
        if (inflight.size >= CONCURRENT) break;
        loadTile(n);
    }
    warmAhead(want);
    /* with a time of day showing, what's counted is its squares on screen */
    let left = want.length + inflight.size - Math.min(want.length, CONCURRENT);
    if (moodNow() && map.rect) { const [x0, x1, y0, y1] = visibleTiles(), r = map.rect; left = 0; for (let ty = Math.max(y0, Math.floor(r.y / TILE)); ty <= Math.min(y1, Math.floor((r.y + r.h) / TILE)); ty++) for (let tx = Math.max(x0, Math.floor(r.x / TILE)); tx <= Math.min(x1, Math.floor((r.x + r.w) / TILE)); tx++) if (!shownFresh(tx, ty)) left++; }
    setStatus(left ? `Drawing, ${left} squares to go` : "Up to date");
}
/* The page can only ask for 6 squares at once, and the editor's server has more threads than that: so it's told which squares come next and
   draws them ahead, and asking for one then finds it drawn or on its way (10 Nov 2026, his: "improve speed in the editor"). Told once per map
   version, and again only when the list has new squares in it (the view moved) */
let warmedFor = "", warmed = new Set();
function warmAhead(want) {
    /* not until the first screenful is in: the threads starting up all at once slowed that */
    if (window.HALLWAY_PLAY || !version || !firstDrawn) return;
    const md = moodNow(), x = xmasNow() ? "+x" : "", tag = version + x;
    if (warmedFor !== tag) { warmedFor = tag; warmed = new Set(); }
    let list = want.map(n => ({ tx: n.tx, ty: n.ty, k: n.k, m: x }));
    if (md) {
        /* what's on screen, in the time of day showing and the one it's fading to, nearest first; then the rest of the map in the one showing */
        const [x0, x1, y0, y1] = visibleTiles(), r = map.rect || { x: 0, y: 0, w: 0, h: 0 }, near = [], far = [];
        for (const mood of md.f > 0 && md.b !== md.a ? [md.a, md.b] : [md.a]) for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) near.push({ tx, ty, m: mood + x, d: Math.hypot((tx + .5) * TILE - cam.x, (ty + .5) * TILE - cam.y) });
        for (let ty = Math.floor(r.y / TILE); ty <= Math.floor((r.y + r.h) / TILE); ty++) for (let tx = Math.floor(r.x / TILE); tx <= Math.floor((r.x + r.w) / TILE); tx++) far.push({ tx, ty, m: md.a + x, d: 1e6 + Math.hypot((tx + .5) * TILE - cam.x, (ty + .5) * TILE - cam.y) });
        list = [...near, ...far].sort((p, q) => p.d - q.d).map(n => ({ ...n, k: n.m + "|" + n.tx + "," + n.ty })).filter(n => { const t = moodTiles.get(n.k); return !(t && t.v === version) && !moodInflight.has(n.k); });
    }
    const next = list.filter(n => !inflight.has(n.k) && !warmed.has(n.k)).slice(0, 24);
    if (!next.length) return;
    for (const n of next) warmed.add(n.k);
    fetch("/api/warm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v: version, tiles: next.map(n => [n.tx, n.ty, n.m]) }) }).catch(() => {});
}
/* a square is current only if it was drawn for this version of the map and for the Christmas setting now (10 Nov 2026, his: banister
   garlands partly showing with Christmas off: a square still being drawn when Christmas was switched off landed afterwards and was kept) */
const xmasNow = () => !!window.hallwayXmas;
/* is the square showing now (the time of day's, or the plain one) drawn for this version of the map? */
function shownFresh(tx, ty) {
    const m = moodNow(); if (!m) return freshTile(tiles.get(tx + "," + ty));
    const t = moodTiles.get((xmasNow() ? m.a + "+x" : m.a) + "|" + tx + "," + ty); return !!t && t.v === version;
}
const freshTile = t => !!t && t.v === version && t.x === xmasNow();
async function loadTile(n) {
    const v = version, xm = xmasNow(), ctl = new AbortController();
    inflight.set(n.k, ctl);
    try {
        const r = await fetch(`/api/tile?v=${v}&tx=${n.tx}&ty=${n.ty}${xm ? "&m=%2Bx" : ""}`, { signal: ctl.signal });
        /* the server's been restarted and has forgotten this version of the map: tell it again, once, and carry on */
        if (r.status === 404) { if (window.HALLWAY_PLAY) { tileFailed(n.k); return; } if (v === version) { version = null; setTimeout(newVersion, 400); } return; }
        if (!r.ok) throw new Error("tile " + r.status);
        const img = await createImageBitmap(await r.blob());
        tileWaits.delete(n.k);
        if (v === version && xm === xmasNow()) {
            const old = tiles.get(n.k); if (old && old.img.close) old.img.close();
            tiles.set(n.k, { img, v, x: xm }); tileGen++;
            firstDrawBar(); paint();
        } else if (img.close) img.close();
    } catch (e) {
        if (e.name !== "AbortError") { tileFailed(n.k); console.error(e); setStatus("A square couldn't be drawn"); }
    } finally {
        if (inflight.get(n.k) === ctl) inflight.delete(n.k);
        if (v === version) pump();
    }
}

/* ---------- the tile selector ---------- */
const selectorCanvas = document.createElement("canvas");
const selectorImg = new Image(); selectorImg.src = "art/tile-selector.png"; selectorImg.onload = () => paint();
function drawSelector() {
    if (!hover || !hover.tile || !hover.l || !selectorImg.complete || !selectorImg.naturalWidth) return;
    const a = P(hover.tile[0], hover.tile[1], nodeZ(hover.l, hover.tile[0], hover.tile[1]));
    const ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom);
    ctx.imageSmoothingEnabled = false;
    /* on its own little canvas, with what stands on or in front of that tile cut out of it */
    const W = selectorImg.naturalWidth, H = selectorImg.naturalHeight, X0 = a[0] - 16, Y0 = a[1], sc = selectorCanvas, g = sc.getContext("2d");
    if (sc.width !== W || sc.height !== H) { sc.width = W; sc.height = H; } g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, W, H); g.drawImage(selectorImg, 0, 0);
    const on = hover.l.stair ? hover.l.stair.low : hover.l, tx = hover.tile[0], ty = hover.tile[1];
    if (REGS && on.props && !hover.l.stair) {
        g.save(); g.translate(-X0, -Y0); g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
        for (const p of on.props) if (p.k === "rope") { const art = ropeArt(on, p); for (const [X, Y, , t] of art.list) { const q = art.row[t]; if (q[0] + q[1] >= tx + ty && Math.abs(q[0] - tx) + Math.abs(q[1] - ty) <= 16) g.fillRect(X, Y, 1, 1); } }
        for (const p of on.props) for (const q of Parts.parts(p)) {
            if (q.x + q.y < tx + ty || Math.abs(q.x - tx) + Math.abs(q.y - ty) > 16) continue;
            const b = P(q.x, q.y, tileZ(on, q.x, q.y));
            if (p.k === "lamp") { const m = P(q.x + .5, q.y + .5, tileZ(on, q.x, q.y)); g.fillRect(m[0] - 7, m[1] - 3, 15, 6); continue; }
            const lx = b[0] - 16, ly = b[1] + 8;
            for (const name of q.names) { const reg = REGS.hall[name], img = spriteImg("art/hall/hh_room_hallway/" + name + ".png"); if (reg && img.complete && img.naturalWidth) cutSprite(g, img, q.flip ? lx + 32 + reg[0] - img.naturalWidth : lx - reg[0], ly - reg[1], q.flip); }
        }
        /* and the pieces drawn from their own pictures (arcades, plants, trees, presents...), as the map has them (10 Nov scan, editor 10) */
        for (const p of on.props) { const pc = pieceOf(p); if (!pc || p.k.startsWith("mark_") || (XMAS_PROP(p.k) && !window.hallwayXmas)) continue; const run = Parts.tiles(p), last = run[run.length - 1]; if (last[0] + last[1] < tx + ty || Math.abs(p.x - tx) + Math.abs(p.y - ty) > 16) continue;
            const b = P(p.x + pc.dx, p.y + pc.dy, tileZ(on, p.x, p.y) + pc.up), X = Math.round(b[0]), Y = Math.round(b[1]);
            for (const f of pc.lights ? [pc.f, pc.lights] : [pc.f]) { const img = pieceImg(f); if (img.complete && img.naturalWidth) cutSprite(g, img, pc.flip ? X + pc.fp.ox + 1 - img.naturalWidth : X - pc.fp.ox, Y - pc.fp.oy, pc.flip); } }
        g.restore();
    }
    /* behind the Lost Property counter: the counter and the wall beside it stand in front, as they do for hustle */
    if (hover.l.stair && hover.l.stair.lost && walker) { const me = walker; walker = { x: tx, y: ty, z: nodeZ(hover.l, tx, ty), l: hover.l, dir: 2, frame: 0, st: null }; try { cutInFront(g, X0, Y0); } finally { walker = me; } }
    ctx.drawImage(sc, ox + X0 * zoom, oy + Y0 * zoom, W * zoom, H * zoom);
}

/* ---------- painting the view ---------- */
function resize() {
    const r = $("stage").getBoundingClientRect();
    canvas.width = Math.max(100, Math.round(r.width)); canvas.height = Math.max(100, Math.round(r.height));
    /* shown at exactly its own size: left at 100% of a stage a fraction of a pixel wider or narrower, the browser squeezed it by that fraction,
       dropping or doubling a column somewhere, and as the view moved that column swept across fine detail (14 Nov 2026, his: the screensaver's
       planters and plants flickering) */
    canvas.style.width = canvas.width + "px"; canvas.style.height = canvas.height + "px";
    if (map) { clampCam(); if (tool === "walk" && walker && following()) followNow(); }
    paint();
}
function line(x0, y0, x1, y1, z, c, w) {
    const a = toScreen(...P(x0, y0, z)), b = toScreen(...P(x1, y1, z));
    ctx.strokeStyle = c; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}
function quad(x0, y0, x1, y1, z, fill, stroke) {
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => toScreen(...P(p[0], p[1], z)));
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
/* An area shown on the floor at the floor's real heights: each tile where it actually is, with a line round the outside and along any drop inside it.
   zOf says how high a tile is drawn; by default, wherever that floor is. */
function areaQuad(l, r, fill, stroke, zOf) {
    const Z = zOf || ((x, y) => tileZ(l, x, y)), byZ = new Map();
    for (let x = r.x0; x < r.x1; x++) for (let y = r.y0; y < r.y1; y++) { const z = Z(x, y); if (!byZ.has(z)) byZ.set(z, []); byZ.get(z).push([x, y]); }
    if (fill) for (const [z, list] of byZ) {
        ctx.beginPath();
        for (const [x, y] of list) { const pts = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(p => toScreen(...P(p[0], p[1], z))); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }
        ctx.fillStyle = fill; ctx.fill();
    }
    if (!stroke) return;
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.beginPath();
    const seg = (x0, y0, x1, y1, z) => { const a = toScreen(...P(x0, y0, z)), b = toScreen(...P(x1, y1, z)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };
    const inside = (x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
    for (let x = r.x0; x < r.x1; x++) for (let y = r.y0; y < r.y1; y++) {
        const z = Z(x, y), edge = (nx, ny) => !inside(nx, ny) || Z(nx, ny) !== z;
        if (edge(x, y - 1)) seg(x, y, x + 1, y, z);
        if (edge(x, y + 1)) seg(x, y + 1, x + 1, y + 1, z);
        if (edge(x - 1, y)) seg(x, y, x, y + 1, z);
        if (edge(x + 1, y)) seg(x + 1, y, x + 1, y + 1, z);
    }
    ctx.stroke();
}
let pumpQueued = false;
function paint() {
    if (!pumpQueued && version) { pumpQueued = true; setTimeout(() => { pumpQueued = false; pump(); }, 60); }
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    /* whole device pixels, so squares always meet exactly */
    const ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom);
    const [x0, x1, y0, y1] = visibleTiles();
    if (!drawMoods(ox, oy, x0, x1, y0, y1)) {
        if ($("timeNow").textContent) $("timeNow").textContent = "";
        const S = TILE * zoom;
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
            const t = tiles.get(tx + "," + ty); if (!t) continue;
            const [bx, W] = tileBox(tx, S), [by, H] = tileBox(ty, S); ctx.drawImage(t.img, ox + bx, oy + by, W, H);
        }
    }
    drawLiveSign();
    drawLifts(ox, oy);
    drawDoorways(ox, oy);
    drawLive("under", ox, oy);
    drawRubbed();
    if (tool !== "walk" && map && level) { overlay(); drawHeightPreview(); drawStepGhost(); drawEdgeGhost(); }
    drawSelector();
    drawGhost();
    drawRect();
    if (walker) { drawWalker(); drawBookOver(ox, oy); }
    drawLive("over", ox, oy);
    wakeLive();
}
/* ---------- things that move over the tiles (the rat, dust, the Basement) ----------
   paint() only runs when something asks, so anything animated registers here: { active(), under(ctx, ox, oy, now), over(ctx, ox, oy, now) }, either draw optional.
   under: after the tiles and doors, before the map's edge and the avatar. over: on top of everything. While any is active the map repaints each frame; a hidden tab doesn't run them. */
const liveLayers = new Set(), liveClicks = new Set(); let liveFrame = 0;
const liveOn = () => { for (const l of liveLayers) if (!l.still && (!l.active || l.active())) return true; return false; };
/* paint() wakes them too, so a layer that's only active while its thing is on screen (the theatre's chase, the tree's glow) starts as soon as
   the camera brings it into view; here paint() may have asked for the next frame already */
function liveTick() { liveFrame = 0; if (document.hidden || !map || !liveOn()) return; paint(); if (!liveFrame) liveFrame = requestAnimationFrame(liveTick); }
function wakeLive() { if (!liveFrame && !document.hidden && liveOn()) liveFrame = requestAnimationFrame(liveTick); }
function drawLive(which, ox, oy) {
    if (!liveLayers.size) return; const now = performance.now();
    for (const l of liveLayers) { if (!l[which] || (l.active && !l.active())) continue; ctx.save(); try { l[which](ctx, ox, oy, now); } catch (err) { console.error(err); liveLayers.delete(l); } ctx.restore(); }
}
document.addEventListener("visibilitychange", wakeLive);
/* the floor you're really on: stairs belong to neither end until you step off them, so they keep the last floor; a lift or door counts as the floor it's on */
let floorIn = null; const floorWatchers = new Set();
function noteFloor() {
    const st = walker && walker.l.stair, f = !walker ? null : !st ? walker.l : (st.lift || st.door || st.entrance || st.lost || st.tunnel) ? st.low || floorIn : floorIn;
    if (f === floorIn) return; const was = floorIn; floorIn = f; for (const w of floorWatchers) { try { w(f, was); } catch (err) { console.error(err); } }
}
/* how long since anyone did anything */
let lastActive = performance.now(); const markActive = () => { lastActive = performance.now(); };
for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) document.addEventListener(ev, markActive, { capture: true, passive: true });
window.HallwayLive = {
    get pieceLoads() { return pieceLoads; },
    add(l) { liveLayers.add(l); wakeLive(); return () => liveLayers.delete(l); }, wake() { wakeLive(); if (map) paint(); },
    onFloor(f) { floorWatchers.add(f); return () => floorWatchers.delete(f); }, get floor() { return floorIn; },
    get idleFor() { return performance.now() - lastActive; }, get tileGen() { return tileGen; }, get walker() { return walker; }, get map() { return map; },
    /* which map is showing ("hallway" or "gallery"), the whole file, and a word when it changes (12 Nov 2026, the Events Gallery) */
    get place() { return mapNow; }, get root() { return root; }, setPlace: (p, o) => setPlace(p, o), onPlace(f) { placeWatchers.add(f); return () => placeWatchers.delete(f); },
    mapPoint: (x, y, z) => P(x, y, z), doorName: d => doorName(d),
    /* the top of a wall at one of its tiles, as high as it stands there: null where there is no wall */
    wallTop(l, axis, line, t) { const st = wallState(l, axis, line, t); if (st === "none") return null;
        /* a drop (a step between floor heights) has no wall standing on it, only the step's face: nothing to hang from, as render/hw3.js has it (9 Nov scan, renderer finding 2) */
        if (isDrop(l, axis, line, t)) return null; const own = wallZ(l, { axis, line, at: axis === "x" ? t + .5 : t + 1 }) + (st === "half" ? HALF_WALL : WALL); if (st === "half") return own;
        /* a full wall under the floor above goes on up to that floor's edge, as hw3 draws it (its "fill"): so where the floor above is raised, the top is higher there (8 Nov, his: the garland stayed level) */
        const up = map.levels.find(q => q.k === l.k + 1); if (!up) return own; const X = axis === "x" ? t : line, Y = axis === "x" ? line : t, A = axis === "x" ? [X, Y - 1] : [X - 1, Y], cov = hasFloor(up, A[0], A[1]) ? A : hasFloor(up, X, Y) ? [X, Y] : null;
        return cov ? levelZ(up) + wallHeightAt(up, cov[0], cov[1]) - 13 : own; },     /* that floor's underside, higher or lower than the wall's own */ get zoom() { return zoom; }, markActive,
    /* for the things that move about the floor like a person: furniture in front cuts them, the time of day tints them. c is usually a 33 by 56
       canvas, as the avatar's, and comes out hard-edged; soft (true) leaves a soft picture's alpha alone (the snow and the festoons) */
    as(who, fn) { const me = walker; walker = who; try { fn(); } finally { walker = me; } }, cutInFront: (c, x0, y0, soft) => cutInFront(c, x0, y0, soft), tint: (c, w, h) => avatarTint(c, w, h),
    /* where a wall item's picture goes on the map, and a piece's picture and where it's drawn from (live-leet.js) */
    wallItemRect: (l, q) => wallItemRect(l, q), pieceOf: p => pieceOf(p), tileZ: (l, x, y) => tileZ(l, x, y),
    tileFree(l) { const so = solid(l), hs = holes(l), sl = stairLevels().slots.get(l); return (x, y) => hasFloor(l, x, y) && !so.has(x + "," + y) && !hs.some(h => inRect(h, x, y)) && !(sl && sl.has(x + "," + y)); },
    nodeZ: (l, x, y) => nodeZ(l, x, y), mood: () => moodNow(), eveningIn: s => eveningIn(s), forceMood(m) { moodForced = m; }, loadMood: (m, x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); moodTile(m, tx, ty); },
    view() { const hw = canvas.width / zoom / 2, hh = canvas.height / zoom / 2; return { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh, w: canvas.width, h: canvas.height }; },
    camera(x, y) { cam.x = x; cam.y = y; clampCam(); }, get cam() { return { x: cam.x, y: cam.y }; }, holdCamera(on) { camHeld = on; if (!on) followNow(); }, setZoom: z => setZoom(z, canvas.width / 2, canvas.height / 2), zoomRaw(z) { zoom = Math.max(1, Math.min(4, z)); $("zoomVal").textContent = Math.round(zoom) + "x";      /* whole steps only, mid-ease too (14 Nov scan: it read 1.33x) */ $("zoomOut").disabled = zoom <= 1; $("zoomIn").disabled = zoom >= 4; clampCam(); paint(); },      /* the screensaver's smooth zoom: no recentring, it moves the camera itself */
    realNight: () => realNight(), enterRoom(target, axis) { if (!walker || roomSession) return false; const me = walker; me.busy = true; me.pts = []; me.walking = false; roomSession = RoomView.enter($("stage"), { room: target.room, facts: target.facts, edge: axis === "x" ? "y" : "x", zoom: () => zoom, wheel: d => setZoom(zoom + (d < 0 ? 1 : -1)), onLeave: () => { roomSession.close(); roomSession = null; me.busy = false; paint(); } }); return true; },
    editorApi: () => ({ lostSpotReachable: (l, x, y) => lostSpotReachable(l, x, y), lostSeatsBeside: (l, x, y) => lostSeatsBeside(l, x, y), snapshot, changed, setTool, paint, flash: t => flash(t), setFloor: l => setFloor(l), toPx: (cx, cy) => toPx(cx, cy), tileAt(cx, cy) { const [px, py] = toPx(cx, cy), u = floorUnder(px, py); return u ? { level: u[0].stair ? u[0].stair.low.id : u[0].id, x: u[1], y: u[2] } : null; }, get tool() { return tool; }, pickOnce(f) { pickNext = f || null; if (f) flash("Click the spot on the map. Esc cancels."); }, get level() { return level; } }),
    onClick(f) { liveClicks.add(f); return () => liveClicks.delete(f); }, cheats: () => cheats,
    sitOn(l, x, y, then) { if (!walker || walker.busy) return false; const u = seatOnTile(l, x, y); return u ? !!sitOn(u, then) : false; },
    walkTo(l, x, y, then) { if (!walker || walker.busy) return false; const s = walkerStart(), path = graphFrom(s.l, s.x, s.y, [l, x, y]); if (!path) return false; followRoute(path, s.here, then || null); return true; },
    get graphLevels() { return stairLevels().list; },
    get busy() { return !!roomSession || !$("liftPanel").hidden || !!(walker && (walker.walking || walker.busy)) || !!document.querySelector(".hw-sheet:not([hidden]), #picker:not([hidden]), #playPicker:not([hidden]), .hw-clue:not([hidden])"); }
};
function overlay() {
    const z = levelZ(level);
    if (tool === "halfwall" || tool === "nowall" || tool === "swag") for (const [list, col] of tool === "swag" ? [[level.swags, "#7dff9a"]] : [[level.halfTiles, "#4fd1ff"], [level.noWalls, "#ff6a5f"]]) for (const k of (list || [])) {
        const [axis, lineS, tileS] = k.split("|"), L = +lineS, t = +tileS;
        if (axis === "x") line(t, L, t + 1, L, tileZ(level, t, L), col, 3); else line(L, t, L, t + 1, tileZ(level, L, t), col, 3);
    }
    if (tool === "addwall") for (const c of level.cells) {
        const [cx, cy] = c.split(",").map(Number);
        for (let t = 0; t < 2; t++) for (const [axis, L, T] of [["x", cy * 2, cx * 2 + t], ["y", cx * 2, cy * 2 + t]]) {
            if (!wallOptional(level, axis, L, T)) continue;
            const on = isShown(level, axis, L, T);
            if (!on) ctx.setLineDash([4, 4]);
            if (axis === "x") line(T, L, T + 1, L, tileZ(level, T, L), "#7dff9a", on ? 3 : 2); else line(L, T, L, T + 1, tileZ(level, L, T), "#7dff9a", on ? 3 : 2);
            ctx.setLineDash([]);
        }
    }
    drawSelection();
    if (isOn("grid")) {
        /* the active floor's outline; every edge of its cells that doesn't touch another */
        const c = cells(level);
        const min = pxToTile(cam.x, cam.y, z);
        const span = Math.ceil((canvas.width + canvas.height) / zoom / 32) * 2;
        const X0 = Math.floor(min[0] / 2) * 2 - span, X1 = X0 + span * 2, Y0 = Math.floor(min[1] / 2) * 2 - span, Y1 = Y0 + span * 2;
        for (let x = X0; x <= X1; x += 2) for (let y = Y0; y <= Y1; y += 2) {
            if (!c.has((x / 2) + "," + (y / 2))) continue;
            const zc = tileZ(level, x, y), open = (nx, ny) => !c.has((nx / 2) + "," + (ny / 2)) || tileZ(level, nx, ny) !== zc;
            if (zoom >= 2) quad(x, y, x + 2, y + 2, zc, null, "rgba(242,190,112,.13)");
            if (open(x, y - 2)) line(x, y, x + 2, y, zc, "#f2be70", 1.5);
            if (open(x - 2, y)) line(x, y, x, y + 2, zc, "#f2be70", 1.5);
            if (open(x, y + 2)) line(x, y + 2, x + 2, y + 2, zc, "#c98f45", 1.5);
            if (open(x + 2, y)) line(x + 2, y, x + 2, y + 2, zc, "#c98f45", 1.5);
        }
    }
    if (drag && drag.rect) {
        const r = drag.rect, col = tool === "erase" ? "rgba(240,90,70,.4)" : tool === "rug" ? "rgba(200,60,60,.4)" : tool === "smallfloor" ? "rgba(255,214,140,.45)" : "rgba(242,190,112,.4)";
        /* Paint floor lays it at the height it's set to; anything else goes on the floor that's there */
        areaQuad(level, r, col, "#fff", tool === "floor" ? (x, y) => z + (heightBrush || heightAt(level, x, y)) : null);
    }
    if (hover) {
        if (hover.wall) {
            const w = hover.wall;
            if (tool === "sconce" || tool === "globelight") { /* the ghost shows where it goes */ }
            else if (w.axis === "x") line(w.at, w.line, w.at + 2, w.line, tileZ(level, Math.floor(w.at), w.line), "#fff", 3);
            else line(w.line, w.at, w.line, w.at - 2, tileZ(level, w.line, Math.ceil(w.at) - 1), "#fff", 3);
        }
    }
}
function drawRect() {
    const r = map && map.rect; if (!r) return;
    const a = toScreen(r.x, r.y), b = toScreen(r.x + r.w, r.y + r.h);
    if (tool === "walk") {
        /* Past the edges there is nothing to see: exactly what the real page will do */
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, Math.max(0, a[1])); ctx.fillRect(0, b[1], canvas.width, canvas.height); ctx.fillRect(0, 0, Math.max(0, a[0]), canvas.height); ctx.fillRect(b[0], 0, canvas.width, canvas.height);
        return;
    }
    ctx.strokeStyle = "#f2be70"; ctx.lineWidth = tool === "edges" ? 3 : 1; ctx.setLineDash(tool === "edges" ? [] : [6, 5]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.setLineDash([]);
}

/* ---------- tools ---------- */
function setTool(t) {
    if (window.HALLWAY_PLAY && t !== "walk" && tool === "walk") return;      // on the site you only ever walk; you leave by the entrance or the Leave button
    if (t === "walk" && tool === "walk") return;
    doorCarry = null;
    if (drag) { if (["rubout", "halfwall", "swag", "garland", "festoon", "edgebrush", "edge", "move"].includes(drag.kind) && lastClient) canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: lastClient[0], clientY: lastClient[1], bubbles: true, pointerId: 1 })); drag = null; }
    putBack();
    if (t !== tool) placeRot = 0;
    tool = t; hover = null; drag = null; heightHold = null;
    if ($("liftPanel")) hideLiftPanel(); liftDoors.clear(); doorStates.clear(); if (roomSession) { roomSession.close(); roomSession = null; }
    if ($("heightBar")) $("heightBar").hidden = !brushTool(t);
    if (brushTool(t)) setBrush(brushes[t]);
    /* the height last chosen for this piece, not its own every time the tool is picked (14 Nov 2026, his: banners "default back to the top of the wall") */
    if (isWallItemTool(t)) { const d0 = wallItemOf(t.slice(3)); wallH.item = itemHeights[t.slice(3)] || (d0 && d0.h) || 100; }
    if (RAISE(t)) tableLampZ = null;
    if (t !== "walk") walker = null; else startWalk();
    document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === t)));
    $("toolName").textContent = TOOL_NAMES[t] || "";
    $("hint").textContent = isWallItemTool(t) ? ((wallItemOf(t.slice(3)) || {}).locked ? "Click a wall to hang it. It always hangs at its own height. Drag one afterwards to move it along." : "Click a wall to hang it. It hangs at a set height: hold Ctrl and move the mouse up or down to change it. Drag one afterwards to move it along; Ctrl-drag moves it up or down too.") : isEdgeTool(t) ? "Paint along the edge of a floor or a flight of small steps: a white line shows the edge it's found. Right-drag over a railing or Ctrl-drag rubs it out. Right-drag elsewhere, or hold Space, moves the view." : HINTS[t && t.startsWith("ero_") ? "ero" : t] || "Click a floor tile to place it. Shift or R turns it first. Alt-click anything placed to move it, Shift-click to turn it, Ctrl-click to delete it.";
    $("walkBar").hidden = t !== "walk"; $("walkLabel").textContent = t === "walk" ? "Stop walking" : "Walk it";
    $("view").style.cursor = t === "pan" ? "grab" : t === "walk" ? "pointer" : t === "select" ? "default" : "crosshair";
    if (t !== "select") select(null);
    paint();
}
function snapRect(a, b) {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    if (tool === "rug" || tool === "smallfloor") return { x0: Math.floor(x0), x1: Math.floor(x1) + 1, y0: Math.floor(y0), y1: Math.floor(y1) + 1 };
    return { x0: Math.floor(x0 / 2) * 2, x1: (Math.floor(x1 / 2) + 1) * 2, y0: Math.floor(y0 / 2) * 2, y1: (Math.floor(y1 / 2) + 1) * 2 };
}
const FURNI = ["ghsofa", "ghchair", "ghlowtable", "ghoval", "gh_plinth_marble", "gh_plinth_black", "gh_plinth_column", "gh_placard", "mark_year", "mark_year_steel", "plant_yukka", "plant_fruittree", "plant_bigcactus", "plant_minibonsai", "plant_pineapple", "leetstand", "leetstand2", "barstool", "plant_palm", "plant_orange", "plant_bonsai", "plant_roses", "plant_cactus", "plant_bay", "plant_sunflower", "archway", "mark_arrow", "arcade_ff", "arcade_pura", "arcade_guess", "arcade_odd", "arcade_scout", "arcade_quiz", "tablelamp", "xmastree", "xmassmalltree", "snowman", "xmaslantern", "xmasdrinks", "xmasduck", "xmasfir", "xmasfir2", "xmasfir4", "gift1", "gift2", "gift3", "gift4", "gift5", "gift6", "gift7", "gift8", "gift9", "gift10", "gift11", "sofa", "chair", "table", "smtable", "ballpost", "rope", "lamp", "plant", "ero", "ero_stone", "ero_walnut", "ero_evergreen", "ero_flower", "pillar", "pillartall", "statue", "fountain", "shelf", "cabinet", "water", "rarecase", "trophy", "mark_scuff", "mark_tile"];
const Parts = window.FurniParts;
let placeRot = 0;                // which way round the next piece goes, set with R
const fits = (l, p) => Parts.tiles(p).every(t => placeable(l, t[0], t[1]));       // every tile it stands on: the two-by-two ones too (10 Nov scan)
/* what you'd get dragging from tile a to tile b: stops at the edge of the floor. A click is a drag of nothing. */
function furniRun(a, b) {
    const k = tool, r = Parts.ROWS[k];
    if (!r) return { k, x: a[0], y: a[1], rot: placeRot, ok: fits(level, { k, x: a[0], y: a[1], rot: placeRot }) };       // every tile it stands on (10 Nov scan, editor 4: a 2x2 went half off the floor)
    const dx = b[0] - a[0], dy = b[1] - a[1], clicked = !dx && !dy;
    const rot = clicked ? placeRot & 1 : Math.abs(dy) > Math.abs(dx) ? 1 : 0;
    const step = clicked ? 1 : Math.sign(rot ? dy : dx), want = clicked ? r.def : Math.abs(rot ? dy : dx) + 1;
    let n = 0;
    while (n < want && n < 60 && placeable(level, a[0] + (rot ? 0 : step * n), a[1] + (rot ? step * n : 0))) n++;
    return { k, x: rot || step > 0 ? a[0] : a[0] - (n - 1), y: !rot || step > 0 ? a[1] : a[1] - (n - 1), len: n, rot, ok: n >= r.min };
}
const LAMP_STYLES = { hotel: "Hotel drum", torch: "Uplighter", tiffany: "Stained glass", globe: "Globe" };
const TABLE_TOP = { table: 18, smtable: 15 };
/* things raised off the floor with Ctrl held and the mouse moved up or down: table lamps, and presents to stack them (9 Nov 2026, his) */
const RAISE = k => k === "tablelamp" || /^gift\d+$/.test(k);
/* how high a present's lid is, to stack the next one on it: the anniversary boxes, then the taller Origins ones */
const GIFT_TOP = k => /^gift[1-4]$/.test(k) ? 12 : 15;
let tableLampZ = null;      // null: sit on whatever table is there
const tableUnder = (l, x, y) => (l.props || []).find(p => TABLE_TOP[p.k] && Parts.tiles(p).some(t => t[0] === x && t[1] === y)) || null;
const lampZAt = (l, x, y) => tableLampZ !== null ? tableLampZ : (t => t ? TABLE_TOP[t.k] : 0)(tableUnder(l, x, y));
/* where a raisable thing goes when placed: a lamp on the table there, a present on top of the highest present there (or where Ctrl put it) */
/* what Ctrl is raising now: the tool's ghost, the thing being carried, or the one being dragged */
const raisingNow = () => RAISE(tool) ? "tool" : carry && RAISE(carry.p.k) ? "carry" : drag && drag.kind === "move" && selected && selected.type === "prop" && RAISE(selected.o.k) ? "drag" : null;
const raiseZAt = (l, x, y, k, self) => k === "tablelamp" ? lampZAt(l, x, y) : tableLampZ !== null ? tableLampZ : Math.max(0, ...(l.props || []).filter(p => p !== self && /^gift\d+$/.test(p.k) && p.x === x && p.y === y).map(p => (p.z || 0) + GIFT_TOP(p.k)));
/* a raised kind landing on a tile: on the table or the present there, as its ghost showed (10 Nov scan, editor 2 and 15: a stacked present was
   placed on the floor inside the one below, and a lamp moved off its table floated) */
const landRaised = (l, p) => { if (!RAISE(p.k)) return; const z = raiseZAt(l, p.x, p.y, p.k, p); if (z) p.z = z; else delete p.z; };
let lampStyle = localStorage.getItem("hallway-lamp") || "hotel"; if (!LAMP_STYLES[lampStyle]) lampStyle = "hotel";
/* the same piece, the same way round, as long and as high, on the same tile: it draws as one, so a second is never placed (15 Nov scan, editor 5) */
const samePieceKey = p => [p.k, p.x, p.y, Parts.rotOf(p), Parts.ROWS[p.k] ? Parts.lengthOf(p) : 0, p.z || 0].join("|");
const hasTwin = (l, p, self) => { const k = samePieceKey(p); return (l.props || []).some(q => q !== self && samePieceKey(q) === k); };
function placeRun(run) {
    if (!run.ok) { flash("There isn't room for that here."); paint(); return; }
    const p = { k: run.k, x: run.x, y: run.y }; if (run.k === "mark_arrow") { p.x -= p.x & 1; p.y -= p.y & 1; p.id = "ar" + Date.now().toString(36); } if (run.len) p.len = run.len; if (run.rot) p.rot = run.rot; if (run.k === "lamp" && lampStyle !== "hotel") p.style = lampStyle; landRaised(level, p);
    if (hasTwin(level, p)) { flash("There's one just like it on this tile already."); paint(); return; }
    snapshot();
    (level.props = level.props || []).push(p);
    showUntilDrawn(level, p);
    changed();
}
/* a piece just placed, put down or dropped is drawn at once, full strength, until the map's own pictures have it (10 Nov scan, his: "when the
   click lands to place a furni item, it places straight away") */
function showUntilDrawn(l, o, tele) { pendingVersion = version; pendingArt.push({ l, o, tele: !!tele, at: performance.now() }); }
function rotateSelected() {
    const s = selected;
    if (s && s.type === "tele") { snapshot(); s.o.flip = !s.o.flip; changed(); select(s); return; }
    if (!s || s.type !== "prop") return;
    const t = Parts.turns(s.o.k); if (t < 2) { flash("This one looks the same from every side."); return; }
    const rot = (Parts.rotOf(s.o) + 1) % t;
    if (!fits(s.l, { ...s.o, rot })) { flash("There isn't room to turn it here."); return; }
    snapshot(); if (rot) s.o.rot = rot; else delete s.o.rot; changed(); select(s);
}
function resizeSelected(d) {
    const s = selected, r = s && s.type === "prop" && Parts.ROWS[s.o.k]; if (!r) return;
    const len = Parts.lengthOf(s.o) + d;
    if (len < r.min) { flash(`It can't get shorter than ${r.min} tiles.`); return; }
    if (!fits(s.l, { ...s.o, len })) { flash("There's no more floor that way."); return; }
    snapshot(); s.o.len = len; changed(); select(s);
}
/* ---------- the ghost of what you're about to place ---------- */
const TELE_SPRITE = "s_doorD_b_0_1_1_4_0";
/* ---------- Alt, Shift and Ctrl, as in Fallin' Furni's editor ----------
   Alt-click lifts a piece and you carry it until you click again; Shift turns what you're holding or placing,
   else the piece you click; Ctrl-click deletes (or, holding one, throws it away). Esc puts a carried piece back. */
let carry = null, shiftTurned = false, shiftAlone = false;
const placingNow = () => !!carry || FURNI.includes(tool) || tool === "tele";
function turnHeld() {
    if (carry) {
        if (carry.tele) carry.p.flip = !carry.p.flip;
        else { const t = Parts.turns(carry.p.k); if (t < 2) { flash("This one looks the same from every side."); return; } carry.p.rot = (Parts.rotOf(carry.p) + 1) % t; }
    } else {
        const t = tool === "tele" ? 2 : Parts.turns(tool);
        if (t < 2) { flash("This one looks the same from every side."); return; }
        placeRot = (placeRot + 1) % t;
    }
    paint();
}
/* a desk sits on whole tiles; anything else standing on the floor keeps to the half-pixels where its foot follows the floor's own steps */
function snapWallItem(q) { const dfn = WALL_ITEMS.find(w => w.id === q.k); if (!dfn) return; if (dfn.snapAt !== undefined) { q.at = Math.round(q.at - dfn.snapAt) + dfn.snapAt; return; } if (dfn.locked && q.axis) { let n = Math.round(q.at * 16); if (q.axis === "y" ? n % 2 === 0 : n % 2 !== 0) n++; q.at = n / 16; } }
let pickNext = null; const lastFestoon = { colour: "amber", twinkle: false }; document.addEventListener("keydown", e => { if (pickNext && e.key === "Escape") { pickNext = null; flash("Cancelled."); } }, true);
function pickUp(hit) {
    snapshot();
    const list = hit.type === "prop" ? hit.l.props : hit.l.teles;
    list.splice(list.indexOf(hit.o), 1);
    if (hit.l !== level) setFloor(hit.l);
    carry = { p: hit.o, tele: hit.type === "tele", from: hit.l };
    select(null); changed();
    flash("Carrying it. Click to put it down. Shift turns it, Esc puts it back.");
}
function putDown() {
    const t = hover && hover.tile, p = t ? { ...carry.p, x: t[0], y: t[1] } : null;
    if (!p || !(carry.tele ? hasFloor(level, p.x, p.y) : fits(level, p))) { flash("That doesn't fit there."); return; }
    if (!p.rot) delete p.rot;
    if (!carry.tele) landRaised(level, p);
    if (!carry.tele && hasTwin(level, p)) { flash("There's one just like it there already."); return; }
    const list = carry.tele ? (level.teles = level.teles || []) : (level.props = level.props || []), type = carry.tele ? "tele" : "prop";
    list.push(p); carry = null; showUntilDrawn(level, p, type === "tele"); changed(); select({ type, l: level, o: p });
}
function putBack() {
    if (!carry) return;
    (carry.tele ? carry.from.teles : carry.from.props).push(carry.p);
    carry = null; dropSnapshot(); changed(); syncButtons();
}
function modClick(e, px, py) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (carry) {
        if (e.shiftKey) { if (shiftTurned) shiftTurned = false; else turnHeld(); }
        else if (ctrl && !(carry.p && RAISE(carry.p.k))) { carry = null; flash("Thrown away. Ctrl+Z brings it back."); paint(); }      // a raised kind carried with Ctrl held is being lifted, not thrown
        else putDown();
        return true;
    }
    if (!e.altKey && !e.shiftKey && !ctrl) return false;
    if (e.shiftKey && placingNow()) { shiftAlone = false; if (shiftTurned) shiftTurned = false; else turnHeld(); return true; }
    const hit = pick(px, py);
    if (!hit) { flash(e.altKey ? "Nothing there to move." : e.shiftKey ? "Nothing there to turn." : "Nothing there to delete."); return true; }
    if (ctrl && (hit.type === "wallitem" || hit.type === "lamp")) { select(hit); drag = beginMove(hit, px, py); drag.ctrlDelete = true; return true; }
    if (ctrl) { select(hit); deleteSelected(); return true; }
    if (e.shiftKey) {
        if (hit.type === "prop" || hit.type === "tele") { select(hit); rotateSelected(); }
        else flash("Only furniture turns.");
        return true;
    }
    if (hit.type === "prop" || hit.type === "tele") pickUp(hit);
    else { select(hit); drag = beginMove(hit, px, py); canvas.style.cursor = "move"; }
    return true;
}
function ghostPiece() {
    if (carry) {
        if (!hover || !hover.tile) return null;
        const [x, y] = hover.tile;
        if (carry.tele) return { tele: true, x, y, flip: !!carry.p.flip, ok: true };
        const g = { ...carry.p, x, y }; g.ok = fits(level, g); return g;
    }
    if (drag && drag.kind === "furni") return drag.run;
    if (drag || !hover || !hover.tile || hover.l !== level) return null;
    if (FURNI.includes(tool)) { const g = furniRun(hover.tile, hover.tile); if (RAISE(tool)) { const z = raiseZAt(level, g.x, g.y, tool); if (z) g.z = z; } return g; }
    if (tool === "tele") return { tele: true, x: hover.tile[0], y: hover.tile[1], flip: !hasFloor(level, hover.tile[0] - 1, hover.tile[1]) !== !!(placeRot & 1), ok: true };
    return null;
}
/* the pillar under the mouse, and which of its two faces */
function pillarFaceAt(l, px, py) {
    for (const o of [...(l.props || [])].filter(q => (q.k === "pillar" || q.k === "pillartall") && !seeHidden(l, heightAt(l, q.x, q.y))).sort((a, c) => (c.x + c.y) - (a.x + a.y))) {
        const a = P(o.x, o.y, tileZ(l, o.x, o.y));
        if (px >= a[0] - 10 && px <= a[0] + 12 && py >= a[1] - 94 && py <= a[1] + 13) return { o, face: (backHeld ? "b" : "") + (px < a[0] + 1 ? "l" : "r"), a };
    }
    return null;
}
/* q: the lift as it would be, on a back wall or a left one */
function liftFits(l, q, self) {
    const axis = liftAxis(q), line = liftLine(q), at = liftAlong(q);
    if (map.lifts.some(r => r !== self && r.level === l.id && liftAxis(r) === axis && liftLine(r) === line && Math.abs(liftAlong(r) - at) < 6)) return false;
    /* round a corner, a back wall's lift and a left wall's mustn't share the floor in front of them */
    const F = liftFront(q); if (map.lifts.some(r => { if (r === self || r.level !== l.id || liftAxis(r) === axis) return false; const G = liftFront(r); return G.x0 < F.x1 && G.x1 > F.x0 && G.y0 < F.y1 && G.y1 > F.y0; })) return false;
    if ((l.doors || []).some(d => d.axis === axis && d.line === line && (axis === "x" ? d.at < at + 3 && d.at + 2 > at : d.at - 2 < at + 3 && d.at > at))) return false;
    for (let t = 0; t < 3; t++) if (!hasFloor(l, ...liftPt(q, t, 0)) || hasFloor(l, ...liftPt(q, t, -1)) || wallState(l, axis, line, at + t) !== "full") return false;
    /* nor in the entrance, a tunnel or a flight of stairs: a left wall is where side stairs come down */
    for (let t = 0; t < 3; t++) if (wallTaken({ axis, at: axis === "x" ? at + t : at + t + 1, line }, l, true)) return false;
    return true;
}
function drawLampArt(l, q, alpha) {
    const globe = q.style === "globe", img = spriteImg(globe ? (q.axis === "x" ? "art/sconce-globe-x.png" : "art/sconce-globe-y.png") : "art/lamps/wall-light.png?" + (artAt || 0)); if (!img.complete || !img.naturalWidth) return;
    const zw = wallZ(l, q), a = q.axis === "x" ? P(q.at, q.line, zw + (q.h || 106)) : P(q.line, q.at, zw + (q.h || 106)), ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha;
    if (!globe) ctx.drawImage(img, q.axis === "x" ? 0 : 40, 0, 40, 40, ox + (a[0] - 20) * zoom, oy + (a[1] - 25) * zoom, 40 * zoom, 40 * zoom); else ctx.drawImage(img, ox + (a[0] - 20) * zoom, oy + (a[1] - 25) * zoom, img.naturalWidth * zoom, img.naturalHeight * zoom);
    ctx.restore();
}
function drawSconceGhost() {
    if (tool === "globelight" && lastMouse) {
        const f = pillarFaceAt(level, lastMouse[0], lastMouse[1]);
        if (f) {
            const back = f.face[0] === "b", left = f.face.endsWith("l"), img = spriteImg(back ? (left ? "art/sconce-globe-back-l.png" : "art/sconce-globe-back-r.png") : left ? "art/sconce-globe-x.png" : "art/sconce-globe-y.png"); if (!img.complete || !img.naturalWidth) return;
            const ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom), X = f.a[0] + (left ? -4 : 6), Y = f.a[1] + 8 - 102 + 44 - (back ? 8 : 0) - (wallH.lamp - 106);
            ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = .8; ctx.drawImage(img, ox + (X - 20) * zoom, oy + (Y - 25) * zoom, img.naturalWidth * zoom, img.naturalHeight * zoom); ctx.restore();
            return;
        }
    }
    if ((tool !== "sconce" && tool !== "globelight") || !hover || !hover.wall) return;
    const w = hover.wall, img = spriteImg(tool === "globelight" ? (w.axis === "x" ? "art/sconce-globe-x.png" : "art/sconce-globe-y.png") : "art/lamps/wall-light.png?" + (artAt || 0)); if (!img.complete || !img.naturalWidth) return;
    const at = w.at + .5, zw = wallZ(level, { axis: w.axis, at, line: w.line }), a = w.axis === "x" ? P(at, w.line, zw + wallH.lamp) : P(w.line, at, zw + wallH.lamp);
    const ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = .8;
    if (tool === "sconce") ctx.drawImage(img, w.axis === "x" ? 0 : 40, 0, 40, 40, ox + (a[0] - 20) * zoom, oy + (a[1] - 25) * zoom, 40 * zoom, 40 * zoom);
    else ctx.drawImage(img, ox + (a[0] - 20) * zoom, oy + (a[1] - 25) * zoom, img.naturalWidth * zoom, img.naturalHeight * zoom);
    ctx.restore();
}
let hoverPx = null;
function drawWallArt(l, q, alpha) { const def = wallItemOf(q.k), box = def && (q.axis === "x" ? def.x : def.y); if (!box || q.k === "i_window") return; const c = wallItemCentre(l, q), ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom); ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha; for (const L of box.layers) { const img = spriteImg("art/wall/" + L.f); if (!img.complete || !img.naturalWidth) continue; const w = img.naturalWidth * zoom, h = img.naturalHeight * zoom, X = ox + (c[0] + L.x) * zoom, Y = oy + (c[1] + L.y) * zoom; ctx.save(); if (L.flip) { ctx.translate(X + w, Y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); } else ctx.drawImage(img, X, Y, w, h); ctx.restore(); } ctx.restore(); }
const pendingArt = []; let pendingVersion = null, lastChangeAt = 0;
setInterval(() => { if (!pendingArt.length) return; const now = performance.now(); if (now - pendingArt[0].at > 25000 || (now - pendingArt[pendingArt.length - 1].at > 400 && version !== pendingVersion && !inflight.size && !moodInflight.size)) { pendingArt.length = 0; paint(); } }, 150);
function drawWallItemGhost() {
    if (!isWallItemTool(tool) || !hover || !hover.wall || !hoverPx) return;
    const def = wallItemOf(tool.slice(3)), box = def && (hover.wall.axis === "x" ? def.x : def.y); if (!box) return;
    const ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom), q = wallSpot(hover.wall, level, hoverPx[0], hoverPx[1]), t0 = { k: tool.slice(3), axis: hover.wall.axis, at: q.at }; snapWallItem(t0); const c = wallItemCentre(level, { k: tool.slice(3), axis: hover.wall.axis, at: t0.at, line: hover.wall.line, h: stairH(hover.wall, hover.wall.stair ? q.h : def.locked ? def.h : wallH.item), ...(tool === "wi:i_window" ? { w: 32, b: 0, top: 128 } : {}) });
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = .8;
    for (const L of box.layers) { const img = spriteImg("art/wall/" + L.f); if (!img.complete || !img.naturalWidth) continue; const w = img.naturalWidth * zoom, h = img.naturalHeight * zoom, X = ox + (c[0] + L.x) * zoom, Y = oy + (c[1] + L.y) * zoom; ctx.save(); if (L.flip) { ctx.translate(X + w, Y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); } else ctx.drawImage(img, X, Y, w, h); ctx.restore(); }
    ctx.restore();
}
/* the rope barrier's pixels on the map: the same sums the drawing uses. Asked for every frame while walking, so kept until the piece or the floor under it changes. */
/* a piece drawn from its own picture: which picture (the poster stand has one for each way it turns) and where it's drawn from (a whole run's far corner for the two that span tiles, else a quarter tile in) */
/* where render/hw3.js puts each one, so the ghost, the hit test and what cuts the walker all match the map (10 Nov 2026 scan: the trees
   and the poster stand's ghosts stood a quarter tile off, the turned stand showed the wrong way round, a raised present's ghost sat on the floor):
   dx, dy into the tile; flip: drawn mirrored about the foot; up: raised off the floor; lights: a second picture, always lit */
const pieceOf = p => {
    /* at Christmas the statue is drawn as the giant tree, its foot at the statue's middle: its ghost is the tree too (10 Nov scan, editor 17) */
    if (p.k === "statue" && window.hallwayXmas && floorPiece("bigtree")) { const fp = floorPiece("bigtree"); return { fp, f: fp.f, dx: 1, dy: 1, flip: false, up: 0, lights: fp.lights || null }; }
    const stand = p.k === "leetstand" || p.k === "leetstand2", rot = Parts.rotOf(p), k = (rot & 1) && floorPiece(p.k + "_r") ? p.k + "_r" : p.k, fp0 = floorPiece(k); if (!fp0) return null;
    /* a piece's option (what's in a rare case, what stands on a plinth, a year slab's year): its own picture, and where that's drawn from */
    const optKey = p.rare || (p.k !== "rarecase" && fp0.rare0), opt = fp0.opts && optKey && fp0.opts[optKey], fp = opt && opt.ox !== undefined ? { ...fp0, ox: opt.ox, oy: opt.oy, w: opt.w, h: opt.h } : fp0;
    let dx = .25, dy = .25;
    if (stand || p.k === "trophy") dx = dy = 0;
    else if (p.k.startsWith("mark_")) dx = dy = .5;
    else if (p.k === "xmasfir") dx = dy = .5;
    else if (p.k === "xmasfir2") { dx = rot & 1 ? .5 : 1; dy = rot & 1 ? 1 : .5; }
    else if (p.k === "xmasfir4") dx = dy = 1;
    const flip = (p.k === "trophy" && !(rot & 1)) || ((p.k === "rarecase" || p.k.startsWith("arcade_")) && !!(rot & 1));
    const f = opt ? opt.f : fp.f;
    return { fp, f, dx, dy, flip, up: p.k === "tablelamp" ? 0 : (p.z || 0), lights: fp.lights || null };
};
let pieceLoads = 0;      // furniture pictures loaded so far: a live layer's cut worked out before one arrived is worked out again (10 Nov scan b, live 6)
const floorPiece = k => (window.FLOOR_PIECES || {})[k] || null, pieceImgs = new Map(), pieceImg = f => { if (!pieceImgs.has(f)) { const i = new Image(); i.onload = () => { pieceLoads++; paint(); }; i.src = "art/wall/" + f; pieceImgs.set(f, i); } return pieceImgs.get(f); };
const ropeCache = new Map();
function ropeArt(l, p) {
    const row = Parts.tiles(p), key = [l.id, p.x, p.y, row.length, p.rot || 0, p.noCard ? 1 : 0, tileZ(l, row[0][0], row[0][1]), tileZ(l, row[row.length - 1][0], row[row.length - 1][1])].join("|");
    let art = ropeCache.get(key);
    if (!art) { art = RopeBarrier.pixels({ x: p.x, y: p.y, len: row.length, rot: p.rot, noCard: p.noCard }, (fx, fy) => P(fx, fy, tileZ(l, Math.floor(fx), Math.floor(fy)))); art.row = row; if (ropeCache.size > 200) ropeCache.clear(); ropeCache.set(key, art); }
    return art;
}
/* where the entrance was refused: the 8 tiles it wanted, and the tile that stopped it */
function drawEntranceBlock() {
    const b = lastEntranceBlock; if (!b || b.l !== level || (tool !== "entrance" && tool !== "theatre" && tool !== "tunnel" && !(drag && selected && (selected.type === "entrance" || selected.type === "tunnel")))) return;
    const ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom), z = levelZ(level), seg = (t0, t1, col, w) => { const pa = b.axis === "x" ? P(t0, b.line, z) : P(b.line, t0, z), pb = b.axis === "x" ? P(t1, b.line, z) : P(b.line, t1, z); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ox + pa[0] * zoom, oy + pa[1] * zoom); ctx.lineTo(ox + pb[0] * zoom, oy + pb[1] * zoom); ctx.stroke(); };
    ctx.save(); seg(b.a, b.a + 8, "rgba(255,255,255,.6)", 2); seg(b.tile, b.tile + 1, "#ff3b30", 5); ctx.restore();
}
function drawGhost() {
    drawEntranceBlock();
    drawSconceGhost(); drawWallItemGhost();
    if (drag && drag.kind === "move" && selected && selected.type === "wallitem") drawWallArt(selected.l, selected.o, .9);
    if (drag && drag.kind === "move" && selected && selected.type === "lamp" && selected.o.axis) drawLampArt(selected.l, selected.o, .9);
    if (drag && drag.kind === "move" && drag.moved && REGS && drag.hit.l === level && (drag.hit.type === "prop" || drag.hit.type === "tele")) drawPiece(drag.hit.type === "tele" ? { tele: true, x: drag.hit.o.x, y: drag.hit.o.y, flip: !!drag.hit.o.flip } : { ...drag.hit.o, ok: true }, .9);
    for (const q of pendingArt) { if (q.wall) drawWallArt(q.l, q.o, 1); else if (q.l === level && REGS) drawPiece(q.tele ? { tele: true, x: q.o.x, y: q.o.y, flip: !!q.o.flip } : { ...q.o, ok: true }, 1); }
    const g = ghostPiece(); if (!g || !REGS) return;
    drawPiece(g, g.ok ? .7 : .3);
}
function drawPiece(g, alpha) {
    if (g.k === "tablelamp") { const fp = floorPiece("tablelampArt"); if (!fp) return; const im = pieceImg(fp.f), a = P(g.x + .5, g.y + .5, tileZ(level, g.x, g.y) + (g.z || 0)), ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom); if (im.complete && im.naturalWidth) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha; ctx.drawImage(im, ox + (a[0] - fp.ox) * zoom, oy + (a[1] - fp.oy) * zoom, fp.w * zoom, fp.h * zoom); ctx.restore(); } return; }
    const z = levelZ(level), ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom);
    const put = (img, x, y, flip) => {
        if (!img.complete || !img.naturalWidth) return;
        const w = img.naturalWidth * zoom, h = img.naturalHeight * zoom, X = ox + x * zoom, Y = oy + y * zoom;
        ctx.save();
        if (flip) { ctx.translate(X + w, Y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); } else ctx.drawImage(img, X, Y, w, h);
        ctx.restore();
    };
    const sprite = (img, reg, tx, ty, flip) => { const a = P(tx, ty, tileZ(level, tx, ty)), lx = a[0] - 16, ly = a[1] + 8; put(img, flip ? lx + 32 + reg[0] - img.naturalWidth : lx - reg[0], ly - reg[1], flip); };
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha;
    if (g.tele) sprite(spriteImg("art/tele/hh_furni_special_50/" + TELE_SPRITE + ".png"), REGS.tele[TELE_SPRITE], g.x, g.y, g.flip);
    else if (pieceOf(g)) { const pc = pieceOf(g), fp = pc.fp, a = P(g.x + pc.dx, g.y + pc.dy, tileZ(level, g.x, g.y) + pc.up), X = Math.round(a[0]), Y = Math.round(a[1]);
        /* at whole pixels from the foot, as hw3 draws it (Math.round), so the ghost lands on the very pixels the piece will */
        for (const f of pc.lights ? [pc.f, pc.lights] : [pc.f]) { const im = pieceImg(f); if (!im.complete || !im.naturalWidth) continue; ctx.save(); ctx.imageSmoothingEnabled = false;
            if (pc.flip) { ctx.translate(ox + (X + 1) * zoom, 0); ctx.scale(-1, 1);      /* column i at X + ox - i, as hw3 draws it (10 Nov scan, editor 6: 1px left) */ ctx.drawImage(im, -fp.ox * zoom, oy + (Y - fp.oy) * zoom, fp.w * zoom, fp.h * zoom); } else ctx.drawImage(im, ox + (X - fp.ox) * zoom, oy + (Y - fp.oy) * zoom, fp.w * zoom, fp.h * zoom); ctx.restore(); } }
    else if (g.k === "mark_arrow") { const x0 = g.x - (g.x & 1), y0 = g.y - (g.y & 1), z = tileZ(level, x0, y0), Q = (u, v) => { const a = P(x0 + u, y0 + v, z); return [ox + a[0] * zoom, oy + a[1] * zoom]; }, d = (((g.rot || 0) % 4) + 4) % 4, rot = ([u, v]) => d === 0 ? [u, v] : d === 1 ? [2 - v, u] : d === 2 ? [2 - u, 2 - v] : [v, 2 - u], line = pts => { ctx.beginPath(); pts.forEach((q, i) => { const [X, Y] = Q(...rot(q)); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath(); ctx.stroke(); };
        ctx.lineWidth = Math.max(1, zoom); ctx.strokeStyle = "#ffe066"; line([[0, 0], [2, 0], [2, 2], [0, 2]]); ctx.strokeStyle = "#4a2c12"; ctx.lineWidth = Math.max(1.5, zoom * 1.5); line([[1.625, 1], [.5, .3125], [.5, 1.6875]]); }
    else if (g.k === "archway") { const n = Parts.lengthOf(g), alongY = !!((g.rot || 0) & 1), z = tileZ(level, g.x, g.y), at = (along, up) => { const a = alongY ? P(g.x + .5, g.y + along, z + up) : P(g.x + along, g.y + .5, z + up); return [ox + a[0] * zoom, oy + a[1] * zoom]; }, path = pts => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); };
        ctx.lineWidth = Math.max(1.5, zoom); ctx.strokeStyle = "#ffe066"; path([at(0, 0), at(0, 118), at(n, 118), at(n, 0)]); path([at(1.4, 0), at(1.4, 70), at(n - 1.4, 70), at(n - 1.4, 0)]); }
    else if (g.k === "rope") { for (const [X, Y, c] of ropeArt(level, g).list) { ctx.fillStyle = "rgb(" + c + ")"; ctx.fillRect(ox + X * zoom, oy + Y * zoom, zoom, zoom); } }
    else if (g.k === "lamp") { const a = P(g.x + .5, g.y + .5, tileZ(level, g.x, g.y)); put(spriteImg("art/lamp-" + (g.style || lampStyle) + ".png"), a[0] - 40, a[1] - 96, false); }
    /* the tall pillar reaches up to the floor above: its shaft stretched by the same sum as hw3's tallBy and hw.js stretched() (10 Nov scan, editor 11) */
    else if (g.k === "pillartall") { const up = map.levels.find(q => q.k === level.k + 1), z0 = tileZ(level, g.x, g.y), c = Math.floor(g.x / 2) + "," + Math.floor(g.y / 2), by = up ? Math.max(0, levelZ(up) + ((up.rise && up.rise[c]) || 0) - 12 - z0 - 94) : 0, SHAFT = 30;
        for (const q of Parts.parts(g)) for (const n of q.names) { const reg = REGS.hall[n], img = spriteImg(H_ + n + ".png"); if (!reg || !img.complete || !img.naturalWidth) continue; const a = P(q.x, q.y, tileZ(level, q.x, q.y)), X = ox + (a[0] - 16 - reg[0]) * zoom, Y = oy + (a[1] + 8 - reg[1] - by) * zoom, w = img.naturalWidth, h = img.naturalHeight;
            ctx.drawImage(img, 0, 0, w, SHAFT + 1, X, Y, w * zoom, (SHAFT + 1) * zoom); if (by) ctx.drawImage(img, 0, SHAFT, w, 1, X, Y + (SHAFT + 1) * zoom, w * zoom, by * zoom); ctx.drawImage(img, 0, SHAFT + 1, w, h - SHAFT - 1, X, Y + (SHAFT + 1 + by) * zoom, w * zoom, (h - SHAFT - 1) * zoom); } }
    else for (const q of Parts.parts(g)) for (const n of q.names) { const reg = REGS.hall[n]; if (reg) sprite(spriteImg(H_ + n + ".png"), reg, q.x, q.y, q.flip); }
    ctx.restore();
}
function act(px, py) {
    const [fx, fy] = tileIn(level, px, py), X = Math.floor(fx), Y = Math.floor(fy);
    const w = isWallItemTool(tool) || tool === "sconce" || tool === "globelight" ? hangWallAt(px, py, level) : wallAt(px, py, level);
    const place = fn => { snapshot(); const pl = (level.props || []).length, wl = (level.wallItems || []).length, tl = (level.teles || []).length; fn(); const now = performance.now(); pendingVersion = version; if ((level.props || []).length > pl) pendingArt.push({ l: level, o: level.props[level.props.length - 1], at: now }); if ((level.wallItems || []).length > wl) pendingArt.push({ l: level, o: level.wallItems[level.wallItems.length - 1], wall: true, at: now }); if ((level.teles || []).length > tl) pendingArt.push({ l: level, o: level.teles[level.teles.length - 1], tele: true, at: now }); changed(); };
    if (tool === "globelight") {
        const f = pillarFaceAt(level, px, py);
        if (f) { place(() => { const L = f.o.lights || [], has = L.includes(f.face); f.o.lights = has ? L.filter(q => q !== f.face) : [...L, f.face]; if (!f.o.lights.length) { delete f.o.lights; delete f.o.lightUp; } else if (!has) { if (wallH.lamp !== 106) f.o.lightUp = wallH.lamp - 106; else delete f.o.lightUp; } }); return; }
    }
    if (w && w.drop && (isWallItemTool(tool) || ["lift", "stair", "turn", "side", "sideturn"].includes(tool) || ((tool === "sconce" || tool === "globelight") && !lampFits(level, w)))) { flash("That wall's only as tall as the drop, too short for that."); return; }
    if (w && (isWallItemTool(tool) || ["door", "sconce", "globelight", "lift", "stair", "turn", "side", "sideturn"].includes(tool)) && isHalf(level, w.axis, w.line, wallTile(w))) { flash("That's a half wall. Put it back to full height first, with the Half wall tool."); return; }
    if (FURNI.includes(tool)) { const t = furniTile(px, py); if (placeable(level, t[0], t[1])) placeRun(furniRun(t, t)); return; }      // placeRun refuses a run that doesn't fit
    if (tool === "tele") { if (hasFloor(level, X, Y)) place(() => (level.teles = level.teles || []).push({ x: X, y: Y, flip: !hasFloor(level, X - 1, Y) !== !!(placeRot & 1) })); return; }
    if (tool === "medal") { if (hasFloor(level, X, Y)) place(() => { const m = { x: X - 2, y: Y - 2 }; (level.medals = level.medals || []).push(m); }); return; }
    if (tool === "door") {
        const w = doorSpotAt(px, py, level);
        if (!w) return;
        /* the floor's door list is only made inside the change, after its snapshot, so undo goes back exactly (15 Nov scan, editor 11) */
        const lvl = level, list = lvl.doors || [], own = () => { lvl.doors = list; };
        if (doorCarry) {
            const c = doorCarry, at = fitDoor(level, w, c.o);
            if (at === null || at === undefined) { flash("Something's already on that stretch of wall."); return; }
            place(() => { c.from.doors.splice(c.from.doors.indexOf(c.o), 1); c.o.axis = w.axis; c.o.line = w.line; c.o.at = at; own(); list.push(c.o); });
            doorCarry = null; setTool("select"); select({ type: "door", l: level, o: c.o }); flash("Door moved to " + level.name + ".");
            return;
        }
        const near = list.find(d => d.axis === w.axis && d.line === w.line && Math.abs(d.at - w.at) < 2.5);
        const fit = near ? null : fitDoor(level, w);
        if (!near && fit === null) { flash("Something's already on that stretch of wall."); return; }
        w.at = near ? w.at : fit;
        if (near) { select({ type: "door", l: level, o: near }); flash("That door's already there. Its maze is in the Selected tab."); return; }
        place(() => {
            const free = freeMazes(), d = { axis: w.axis, at: Math.floor(w.at), line: w.line };
            if (free.length) d.name = free[0]; else { d.spare = true; flash("Every maze has a door, so this one's spare."); }
            own(); list.push(d);
        });
        return;
    }
    if (isWallItemTool(tool)) { if (w) { const q = wallSpot(w, level, px, py); place(() => (level.wallItems = level.wallItems || []).push({ k: tool.slice(3), axis: w.axis, at: (() => { const t = { k: tool.slice(3), at: q.at, axis: w.axis }; snapWallItem(t); return t.at; })(), line: w.line, h: stairH(w, w.stair ? q.h : (() => { const d0 = wallItemOf(tool.slice(3)); return d0 && d0.locked ? d0.h : wallH.item; })()), ...(tool === "wi:i_window" ? { w: 32, b: 0, top: 128 } : {}) })); } return; }
    if (tool === "sconce") { if (w) place(() => (level.lamps = level.lamps || []).push({ axis: w.axis, at: w.at + .5, line: w.line, ...lampField(lampHeight(level, w, px, py)) })); return; }
    if (tool === "globelight") { if (w) place(() => (level.lamps = level.lamps || []).push({ axis: w.axis, at: w.at + .5, line: w.line, style: "globe", ...lampField(lampHeight(level, w, px, py)) })); return; }
    if (tool === "lift") {
        if (!w) return;
        const t = Math.floor(wallTile(w) / 2) * 2, q = w.axis === "y" ? { level: level.id, axis: "y", x: w.line, y: t } : { level: level.id, x: t, y: w.line };
        if (!liftFits(level, q)) { flash("A lift needs 3 tiles of full wall, clear of doors and other lifts."); return; }
        place(() => map.lifts.push(q));
        return;
    }
    /* a Theatredrome entrance: the entrance's look, for show only (render/hw3.js theatreArt). Clicking one again takes it away */
    if (tool === "theatre") {
        if (!w || w.drop) return;
        const list = map.theatres || [], here = list.findIndex(q => q.level === level.id && q.axis === w.axis && q.line === w.line && wallTile(w) >= q.at && wallTile(w) < q.at + 8);
        if (here >= 0) { place(() => { map.theatres.splice(here, 1); if (!map.theatres.length) delete map.theatres; }); flash("Theatredrome entrance taken away."); return; }
        const at = entranceAt(level, w); if (at === null) { flash("It won't fit here: " + lastEntranceBlock.why + ". It's marked in red."); paint(); return; }
        const clash = [...list, ...(map.entrance ? [map.entrance] : [])].some(q => q.level === level.id && q.axis === w.axis && q.line === w.line && Math.abs(q.at - at) < 8);
        if (clash) { flash("There's an entrance there already."); return; }
        place(() => { (map.theatres = map.theatres || []).push({ level: level.id, axis: w.axis, line: w.line, at }); });
        return;
    }
    /* a plain tunnel, walked into (10 Nov 2026, his: the way into the Events Gallery). Clicking one again takes it away */
    if (tool === "tunnel") {
        if (!w || w.drop) return;
        const list = map.tunnels || [], here = list.findIndex(q => q.level === level.id && q.axis === w.axis && q.line === w.line && wallTile(w) >= q.at && wallTile(w) < q.at + 8);
        if (here >= 0) { const gone = list[here]; place(() => { unlinkTunnel(gone.id); map.tunnels.splice(here, 1); if (!map.tunnels.length) delete map.tunnels; }); flash("Tunnel taken away."); return; }
        const at = entranceAt(level, w); if (at === null) { flash("It won't fit here: " + lastEntranceBlock.why + ". It's marked in red."); paint(); return; }
        const clash = [...list, ...(map.theatres || []), ...(map.entrance ? [map.entrance] : [])].some(q => q.level === level.id && q.axis === w.axis && q.line === w.line && Math.abs(q.at - at) < 8);
        if (clash) { flash("There's an entrance or a tunnel there already."); return; }
        /* the one tunnel anywhere (on either map) that leads nowhere yet: the new one pairs with it */
        const alone = allTunnels().filter(t => !t.q.to), mate = alone.length === 1 ? alone[0] : null, id = "t" + Date.now().toString(36);
        place(() => { const q = { id, level: level.id, axis: w.axis, line: w.line, at }; if (mate) { q.to = mate.q.id; mate.q.to = id; } (map.tunnels = map.tunnels || []).push(q); });
        if (mate) flash("Linked to " + tunnelLabel(mate).replace(/^In the (.*?): the/, "the") + (mate.place !== mapNow ? " in " + PLACE_NAME[mate.place] : "") + ": walk to the back of one and you come out of the other.");
        return;
    }
    if (tool === "entrance") {
        if (!w || w.drop) return;
        if (mapNow === "gallery") { flash("The Events Gallery has no entrance of its own: Habbos come in by a tunnel from the Hallways. Use the Tunnel tool."); return; }
        const at = entranceAt(level, w); if (at === null) { flash("The entrance won't fit here: " + lastEntranceBlock.why + ". It's marked in red."); paint(); return; }
        place(() => { map.entrance = { level: level.id, axis: w.axis, line: w.line, at }; });
        return;
    }
    if (tool === "stair" || tool === "turn" || tool === "side" || tool === "sideturn") {
        const up = map.levels.find(l => l.k === level.k + 1);
        if (!up) { flash("Add a floor above first: stairs need somewhere to go."); return; }
        if (!w) return;
        if (tool === "sideturn") {
            if (w.axis !== "y") { flash("That stair goes through a top-left wall."); return; }
            const a = Math.floor(w.at / 2) * 2 - 6;
            if (!sideTurnRects(w.line, a).every(r => stairOK(up, r))) return;
            place(() => map.stairs.push({ kind: "sideturn", low: level.id, up: up.id, a, b: a + 6, x: w.line }));
        } else if (tool === "side") {
            if (w.axis !== "y") { flash("That stair goes through a top-left wall."); return; }
            const a = Math.floor(w.at / 2) * 2 - 6;
            if (!stairOK(up, { x0: w.line - 10, x1: w.line, y0: a, y1: a + 6 })) return;
            place(() => map.stairs.push({ kind: "side", low: level.id, up: up.id, a, b: a + 6, x: w.line }));
        } else {
            if (w.axis !== "x") { flash("Those stairs go through a back wall."); return; }
            const a = Math.floor(w.at / 2) * 2;
            if (!stairOK(up, { x0: a, x1: a + 6, y0: w.line - 10, y1: w.line })) return;
            place(() => map.stairs.push({ kind: tool === "turn" ? "turn" : "straight", low: level.id, up: up.id, a, b: a + 6, y: w.line }));
        }
        return;
    }
    if (tool === "del") { deleteAt(px, py); return; }
}
/* the lift and stair openings take up their stretch of wall */
let portalSelf = null;
function wallTaken(w, l, notLifts) {
    const level = l || window.__active();
    /* notLifts: liftFits asking about everything else */
    if (!notLifts && w.axis === "x" && map.lifts.some(q => !liftLeft(q) && q.level === level.id && q.y === w.line && w.at > q.x - 3 && w.at < q.x + 5)) return true;
    if (!notLifts && w.axis === "y" && map.lifts.some(q => liftLeft(q) && q.level === level.id && q.x === w.line && w.at > q.y - 2 && w.at < q.y + 7)) return true;      // its at is a tile on: a door's is past its second tile
    if (map.entrance && map.entrance.level === level.id && map.entrance.axis === w.axis && map.entrance.line === w.line && w.at > map.entrance.at - 1 && w.at <= map.entrance.at + 8) return true;
    /* tunnels and the Theatredrome too: doors, wall cuts and other entrances went inside them (10 Nov scan b, editor 4). The one being dragged doesn't count */
    for (const q of [...(map.tunnels || []), ...(map.theatres || [])]) if (q && q !== portalSelf && q.level === level.id && q.axis === w.axis && q.line === w.line && w.at > q.at - 1 && w.at <= q.at + 8) return true;
    return map.stairs.some(s => s.low === level.id && (thruLeft(s) ? w.axis === "y" && s.x === w.line && w.at > s.a - 2 && w.at < s.b + 2 : w.axis === "x" && s.y === w.line && w.at > s.a - 3 && w.at < s.b + 1));
}
function stairOK(up, r) {
    /* a stair must come up through real floor, and not through another stair */
    for (let x = r.x0; x < r.x1; x += 2) for (let y = r.y0; y < r.y1; y += 2) if (!hasFloor(up, x, y)) { flash(`${up.name} needs floor where these stairs come up: paint it first.`); return false; }
    for (const h of holes(up)) if (r.x0 < h.x1 && r.x1 > h.x0 && r.y0 < h.y1 && r.y1 > h.y0) { flash("That would overlap another flight of stairs."); return false; }
    return true;
}
function deleteAt(px, py) {
    const hit = pickIn(level, px, py);
    if (hit && hit.type !== "wall" && hit.type !== "entrance" && hit.type !== "sign") { select(hit); deleteSelected(); return; }
    if (hit && hit.type === "sign") { flash("A sign goes with its door. Click the door itself."); return; }
    const rails = railsNear(px, py); if (rails.length) { snapshot(); level.edgeItems = level.edgeItems.filter(q => !rails.includes(q)); if (!level.edgeItems.length) delete level.edgeItems; changed(); return; }
    flash("Nothing to delete there.");
}
let flashTimer = 0;
function flash(t) { const e = $("toast"); e.textContent = t; e.classList.add("show"); clearTimeout(flashTimer); flashTimer = setTimeout(() => e.classList.remove("show"), 3500); }

/* ---------- colours ---------- */
/* Every colour in the editor goes through the one picker. Changes show at once; the whole visit to the picker is one undo. */
let artSoon = 0;
function pickColour(title, get, set, fallback) {
    let snapped = false;
    const before = get();
    ColourPicker.open({
        title, value: get() || fallback,
        onChange: hex => { if (!snapped) { snapshot(); snapped = true; } set(hex); clearTimeout(artSoon); artSoon = setTimeout(changed, 140); },
        onCancel: () => { clearTimeout(artSoon); if (snapped) { set(before); dropSnapshot(); changed(); } if (selected) select(selected); },
        onDone: () => { clearTimeout(artSoon); if (snapped) changed(); if (selected) select(selected); buildLevels(); }
    });
}
/* a label, the colour as a swatch button with its hex, and a way back to the default */
function colourRow(parent, label, get, set, fallback, unset, after) {
    const f = document.createElement("div"); f.className = "field colour-row";
    const n = document.createElement("span"); n.className = "f-label"; n.textContent = label; f.appendChild(n);
    const c = document.createElement("span"); c.className = "f-ctl"; f.appendChild(c);
    const b = document.createElement("button"); b.type = "button"; b.className = "swatch-btn";
    const chip = document.createElement("i"), code = document.createElement("span"); b.appendChild(chip); b.appendChild(code); c.appendChild(b);
    const r = document.createElement("button"); r.type = "button"; r.className = "btn small ghost"; r.textContent = "Reset"; c.appendChild(r);
    const show = () => { const v = get(); chip.style.background = v || "transparent"; chip.classList.toggle("none", !v); code.textContent = v || unset; r.hidden = !v; };
    const wrap = v => { set(v); show(); if (after) after(); };
    b.addEventListener("click", () => pickColour(label, get, wrap, fallback));
    r.addEventListener("click", () => { ColourPicker.close(true); snapshot(); wrap(null); changed(); });      // another row's colour being picked is kept, as opening another row keeps it (15 Nov scan, editor 9)
    show(); parent.appendChild(f);
    return show;
}
/* The stretch of wall a click means: straight along its line to a corner or an end. */
let wallPaint = false;
function wallStretch(l, w) {
    const here = w.axis === "x" ? t => hasFloor(l, t, w.line) && !hasFloor(l, t, w.line - 1) && wallStands(l, t, w.line - 1, "x") && !holes(l).some(r => inRect(r, t, w.line - 1))
        : t => hasFloor(l, w.line, t) && !hasFloor(l, w.line - 1, t) && wallStands(l, w.line - 1, t, "y") && !holes(l).some(r => inRect(r, w.line - 1, t));
    const t0 = w.axis === "x" ? Math.floor(w.at) : Math.floor(w.at) - 1; let a = t0, b = t0 + 1;
    if (w.drop) { const run = edgeRun(l, w.axis === "x" ? "y" : "x", w.line, t0); return { axis: w.axis, line: w.line, a: run.a, b: run.b, drop: true }; }
    while (here(a - 1)) a--; while (here(b)) b++;
    return { axis: w.axis, line: w.line, a, b };
}
function wallRecord(l, o, make) {
    let q = (l.walls || []).find(r => r.axis === o.axis && r.line === o.line && r.a < o.b && r.b > o.a);
    if (make) {
        l.walls = l.walls || [];
        if (q) { q.a = Math.min(q.a, o.a); q.b = Math.max(q.b, o.b); }
        else { q = { axis: o.axis, line: o.line, a: o.a, b: o.b }; l.walls.push(q); }
    }
    return q || null;
}
function tidyWall(l, o) { const q = wallRecord(l, o); if (q && !q.A && !q.B && !q.wood) l.walls.splice(l.walls.indexOf(q), 1); if (l.walls && !l.walls.length) delete l.walls; }
function wallPanel(box, hit) {
    const { l, o } = hit, part = key => [() => { const q = wallRecord(l, o); return q ? q[key] || null : null; }, v => { const q = wallRecord(l, o, !!v); if (q) { if (v) q[key] = v; else delete q[key]; } tidyWall(l, o); }];
    const p = document.createElement("p"); p.className = "hint"; p.textContent = `${o.b - o.a} tiles of wall, corner to corner. Changes show as you pick.`; box.appendChild(p);
    const rows = [];
    const refresh = () => rows.forEach(f => f());
    rows.push(colourRow(box, "Main stripe", ...part("B"), "#39504f", "Floor's colour", refresh));
    rows.push(colourRow(box, "Light stripe", ...part("A"), "#b06a50", "Floor's colour", refresh));
    rows.push(colourRow(box, "Wood panels", ...part("wood"), "#5a2f1a", "Floor's colour", refresh));
    const row = document.createElement("div"); row.className = "btn-row";
    const none = document.createElement("button"); none.type = "button"; none.className = "btn small ghost"; none.textContent = "Back to the floor's colour";
    none.addEventListener("click", () => { ColourPicker.close(true); snapshot(); const q = wallRecord(l, o); if (q) l.walls.splice(l.walls.indexOf(q), 1); if (l.walls && !l.walls.length) delete l.walls; refresh(); changed(); });
    row.appendChild(none); box.appendChild(row);
    /* height: the tile you clicked, or the whole wall, either way at any time */
    const tiles = []; for (let t = o.a; t < o.b; t++) tiles.push(t);
    const head = document.createElement("h4"); head.textContent = "Height"; box.appendChild(head);
    const keptMsg = "Left the tiles with a door, wall light or something hanging on them at full height.";
    const STATES = [["full", "Full"], ["half", "Half"], ["none", "None"]];
    const choices = (label, list, current) => {
        const f = document.createElement("div"); f.className = "field wall-choice";
        const n = document.createElement("span"); n.className = "f-label"; n.textContent = label; f.appendChild(n);
        const c = document.createElement("span"); c.className = "f-ctl btn-row"; f.appendChild(c);
        for (const [state, text] of STATES) {
            const q = document.createElement("button"); q.type = "button"; q.className = "btn small" + (current === state ? " primary" : ""); q.textContent = text; q.setAttribute("aria-pressed", String(current === state));
            q.addEventListener("click", () => { snapshot(); let kept = false; for (const t of list) { if (state !== "full" && wallHolds(l, o.axis, o.line, t)) { kept = true; continue; } setWallState(l, o.axis, o.line, t, state); } changed(); select(hit); if (kept) flash(keptMsg); });
            c.appendChild(q);
        }
        box.appendChild(f);
    };
    if (hit.tile !== undefined) choices("This tile", [hit.tile], wallState(l, o.axis, o.line, hit.tile));
    const allStates = new Set(tiles.map(t => wallState(l, o.axis, o.line, t)));
    choices("Whole wall", tiles, allStates.size === 1 ? [...allStates][0] : null);

}
const hexToHsl = code => { const n = parseInt(code.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l]; const s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn), h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
const hslToHex = (h, s, l) => { h = ((h % 360) + 360) % 360; const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0"); }; return "#" + f(0) + f(8) + f(4); };

/* ---------- mazes onto floors by difficulty ---------- */
const FLOOR_OF = { easy: 0, medium: 0, hard: 2, "very-hard": 2, extreme: 3 };
const MEDIUMS_ON_GROUND = 8;
/* Places for new doors on a floor's walls: well clear of doors, stairs and the lift, so their signs have room. Widest gaps first. */
function doorSpots(l, want) {
    const spots = []; let lampGap = 2.5;
    const clear = (axis, line, at, gap) => {
        if (wallTaken({ axis, at, line }, l) || isHalf(l, axis, line, axis === "x" ? at : at - 1) || isHalf(l, axis, line, axis === "x" ? at + 1 : at - 2) || isNone(l, axis, line, axis === "x" ? at : at - 1) || isNone(l, axis, line, axis === "x" ? at + 1 : at - 2)) return false;
        if (lampGap && (l.lamps || []).some(q => q.axis === axis && q.line === line && Math.abs(q.at - at - (axis === "x" ? 1 : -1)) < lampGap)) return false;
        return ![...(l.doors || []), ...spots].some(d => d.axis === axis && d.line === line && Math.abs(d.at - at) < gap) && !map.stairs.some(s => s.low === l.id && !thruLeft(s) && axis === "x" && s.y === line && Math.abs(stairSignX(s) - at) < 5);
    };
    const lines = [], seen = new Set();
    for (const c of l.cells) { const [cx, cy] = c.split(",").map(Number), X = cx * 2, Y = cy * 2; for (const axis of ["x", "y"]) for (let t = 0; t < 2; t++) { const key = axis === "x" ? "x" + (X + t) + "," + Y : "y" + X + "," + (Y + t); if (seen.has(key)) continue; seen.add(key); const open = axis === "x" ? !hasFloor(l, X + t, Y - 1) && wallStands(l, X + t, Y - 1, "x") && !holes(l).some(r => inRect(r, X + t, Y - 1)) : !hasFloor(l, X - 1, Y + t) && wallStands(l, X - 1, Y + t, "y") && !holes(l).some(r => inRect(r, X - 1, Y + t)); if (open) lines.push(axis === "x" ? { axis, line: Y, t: X + t } : { axis, line: X, t: Y + t }); } }
    const stands = (axis, line, t) => lines.some(q => q.axis === axis && q.line === line && q.t === t);
    /* roomy first; then closer together; and only at the very end on top of a wall light, which you can then move */
    for (const [gap, lg] of [[9, 2.5], [7, 2.5], [6, 2.5], [5, 2.5], [4, 2.5], [4, 0]]) {
        lampGap = lg;
        for (const q of lines.slice().sort((a, b) => a.line - b.line || a.t - b.t)) {
            if (spots.length >= want) return spots;
            const at = q.axis === "x" ? q.t : q.t + 1;
            /* the door and a tile each side of it must be real wall */
            const tiles = q.axis === "x" ? [q.t - 1, q.t, q.t + 1, q.t + 2] : [q.t - 2, q.t - 1, q.t, q.t + 1];
            if (!tiles.every(t => stands(q.axis, q.line, t))) continue;
            if (clear(q.axis, q.line, at, gap)) spots.push({ axis: q.axis, at, line: q.line });
        }
    }
    return spots;
}
function sortByDifficulty() {
    const floors = new Map(map.levels.map(l => [l.k, l]));
    if (!Object.keys(difficulty).length) { flash("The live archive couldn't be reached, so there are no difficulty ratings to sort by."); return; }
    if (!floors.has(0) || !floors.has(1) || !floors.has(2) || !floors.has(3)) { flash("This needs Ground and Floors 1 to 3."); return; }
    pinAllMazes();
    const whereNow = new Map(); for (const l of map.levels) for (const d of (l.doors || [])) if (d.name && !d.spare) whereNow.set(d.name, l.k);
    const plan = new Map(names.map(n => [n, FLOOR_OF[difficulty[n]] === undefined ? 0 : FLOOR_OF[difficulty[n]]]));
    /* the mediums: those already on Ground stay there first, then A to Z, and the rest go up to Floor 1 */
    const mediums = names.filter(n => difficulty[n] === "medium").sort((a, c) => (whereNow.get(a) === 0 ? 0 : 1) - (whereNow.get(c) === 0 ? 0 : 1));
    mediums.forEach((n, i) => { if (i >= MEDIUMS_ON_GROUND) plan.set(n, 1); });
    snapshot();
    let moved = 0, added = 0, waiting = 0;
    const homeless = new Map();
    for (const l of map.levels) {
        const here = names.filter(n => plan.get(n) === l.k), keep = new Set();
        const doors = l.doors = l.doors || [];
        /* a maze already on the right floor keeps its door */
        for (const d of doors) { if (d.name && !d.spare && plan.get(d.name) === l.k) keep.add(d.name); }
        const toPlace = here.filter(n => !keep.has(n));
        const free = doors.filter(d => d.spare || !d.name || plan.get(d.name) !== l.k);
        for (const d of free) { delete d.name; d.spare = true; }
        /* a door that leads somewhere else (a staff corridor, the Finders' Lounge, a bookcase door) is never handed a maze (15 Nov scan, editor 18) */
        homeless.set(l, { toPlace, free: free.filter(d => !d.to && !d.kind) });
    }
    for (const [l, { toPlace, free }] of homeless) {
        let i = 0;
        for (const d of free) { if (i >= toPlace.length) break; d.name = toPlace[i++]; d.spare = false; moved++; }
        if (i < toPlace.length) {
            for (const s of doorSpots(l, toPlace.length - i)) { l.doors.push({ ...s, name: toPlace[i++] }); added++; moved++; }
            waiting += toPlace.length - i;
        }
    }
    select(null); buildLevels(); changed();
    const spare = map.levels.reduce((a, l) => a + (l.doors || []).filter(d => d.spare).length, 0);
    flash(`${moved} mazes moved, ${added} new door${added === 1 ? "" : "s"}, ${spare} spare${waiting ? `, ${waiting} still need a door` : ""}. Ctrl+Z undoes it.`);
    return { moved, added, spare, waiting };
}

/* ---------- select and move ---------- */
let selected = null;            // { type, l, o }
const TALL = { ghsofa: [16, 30], ghchair: [16, 30], ghlowtable: [16, 16], ghoval: [16, 22], gh_plinth_marble: [16, 70], gh_plinth_black: [16, 70], gh_plinth_column: [14, 70], gh_placard: [10, 40], mark_year: [24, 12], mark_year_steel: [24, 12], plant_yukka: [20, 72], plant_fruittree: [12, 46], plant_bigcactus: [12, 50], plant_minibonsai: [16, 30], plant_pineapple: [14, 44], leetstand: [48, 112], leetstand2: [32, 116], barstool: [9, 24], plant_palm: [16, 74], plant_orange: [12, 48], plant_bonsai: [16, 32], plant_roses: [8, 36], plant_cactus: [12, 52], plant_bay: [24, 64], plant_sunflower: [9, 46], archway: [17, 118], mark_arrow: [17, 10], arcade_ff: [16, 56], arcade_pura: [16, 56], arcade_guess: [16, 56], arcade_odd: [16, 56], arcade_scout: [16, 56], arcade_quiz: [16, 56], tablelamp: [8, 22], xmastree: [20, 72], xmassmalltree: [14, 30], snowman: [14, 34], xmaslantern: [10, 24], xmasdrinks: [12, 18], xmasduck: [10, 16], gift1: [12, 20], gift2: [12, 20], gift3: [12, 20], gift4: [12, 20], xmasfir: [20, 76], xmasfir2: [30, 112], xmasfir4: [40, 150], gift5: [16, 30], gift6: [16, 30], gift7: [16, 30], gift8: [16, 30], gift9: [16, 30], gift10: [16, 30], gift11: [16, 30], trophy: [28, 84], rarecase: [15, 62], mark_scuff: [14, 12], mark_tile: [14, 12], rope: [14, 36], pillartall: [12, 150], smtable: [13, 24], ballpost: [13, 28], ero_stone: [16, 40], ero_walnut: [16, 40], ero_evergreen: [16, 40], ero_flower: [16, 40], lamp: [12, 54], statue: [26, 105], pillar: [12, 110], plant: [11, 50], ero: [16, 40], fountain: [26, 34], shelf: [22, 62], cabinet: [32, 82], water: [12, 44], chair: [11, 28], table: [16, 22], sofa: [34, 28] };
function pickIn(l, px, py) {
    const [fx, fy] = tileIn(l, px, py), X = Math.floor(fx), Y = Math.floor(fy);
    /* upright things first, front-most first, by what you can actually see of them */
    const upright = [...(l.props || []).map(o => ({ type: "prop", o, k: o.k })), ...(l.teles || []).map(o => ({ type: "tele", o, k: "statue" }))].sort((a, c) => (c.o.x + c.o.y) - (a.o.x + a.o.y));
    for (const u of upright) {
        if (seeHidden(l, heightAt(l, u.o.x, u.o.y))) continue;
        if (u.type === "prop" && XMAS_PROP(u.k) && !window.hallwayXmas) continue;          // not drawn while Christmas is off: nothing to click (10 Nov scan, editor 9)
        const [w, h] = u.k === "lamp" && u.o.style === "globe" ? [8, 28] : u.k === "pillar" && u.o.lights ? [18, 110] : u.k === "pillartall" && u.o.lights ? [18, 150] : TALL[u.k] || [14, 40], row = u.type === "prop" && Parts.ROWS[u.k];
        /* every tile it stands on (a two-by-two too), and as high as it's raised: a present on a stack, a lamp on a table (10 Nov scan, editor 8) */
        for (const t of row || u.k === "mark_arrow" || u.k === "statue" || u.k === "fountain" || u.k === "xmasfir4" ? Parts.tiles(u.o) : [[u.o.x, u.o.y]]) {
            const a = P(t[0] + .5, t[1] + .5, tileZ(l, t[0], t[1]) + (u.type === "prop" ? (u.o.z || 0) : 0));
            if (Math.abs(px - a[0]) <= (row ? 17 : w) && py <= a[1] + 8 && py >= a[1] - h) return { type: u.type, l, o: u.o };
        }
    }
    /* a wall light by the shape you can see, or the door or sign beside it gets the click instead */
    for (const q of (l.lamps || [])) {
        if (seeHidden(l, wallZ(l, q) - levelZ(l))) continue;
        const zw = wallZ(l, q), a = q.axis === "x" ? P(q.at, q.line, zw + (q.h === undefined ? 106 : q.h)) : P(q.line, q.at, zw + (q.h === undefined ? 106 : q.h)), U = px - a[0], h = a[1] + (q.axis === "x" ? 1 : -1) * Math.floor(U / 2) - py;
        const out = q.axis === "x" ? -U : U;                    // the plate on the wall, and the shade out from it
        if (out >= -4 && out <= 18 && h >= -9 && h <= 20) return { type: "lamp", l, o: q };
    }
    /* a painting or poster, by the art you can see */
    for (const q of [...(l.wallItems || [])].reverse()) {
        const def = wallItemOf(q.k), box = q.k === "i_window" ? windowBox(q) : def && (q.axis === "x" ? def.x : def.y); if (!box || seeHidden(l, wallZ(l, q) - levelZ(l))) continue;
        if (def && def.xmas && !window.hallwayXmas) continue; const r = wallItemRect(l, q); if (r && px >= r.x0 - 1 && px <= r.x0 + r.w + 1 && py >= r.y0 - 1 && py <= r.y0 + r.h + 1) return { type: "wallitem", l, o: q };
    }
    for (const q of (l.doors || [])) if (!q.spare && !seeHidden(l, wallZ(l, q) - levelZ(l)) && signHit(l, q, px, py)) return { type: "sign", l, o: q };
    for (const q of map.stairs) if (q.low === l.id && signHit(l, q, px, py)) return { type: "sign", l, o: q };
    const dsp = doorSpotAt(px, py, l);
    if (dsp && (dsp.axis === "x" ? stepsDrop(l, "x", dsp.line, dsp.at) : stepsDrop(l, "y", dsp.line, dsp.at - 1))) {
        const dd = (l.doors || []).find(q => q.axis === dsp.axis && q.line === dsp.line && (q.axis === "x" ? dsp.at >= q.at - 1 && dsp.at <= q.at + 2 : dsp.at >= q.at - 2 && dsp.at <= q.at + 1));
        if (dd) return { type: "door", l, o: dd };
    }
    const w = wallAt(px, py, l);
    if (w) {
        const d = (l.doors || []).find(q => q.axis === w.axis && q.line === w.line && (q.axis === "x" ? w.at >= q.at - 1 && w.at <= q.at + 2 : w.at >= q.at - 2 && w.at <= q.at + 1));
        if (d) return { type: "door", l, o: d };
        const c = (l.lamps || []).find(q => q.axis === w.axis && q.line === w.line && Math.abs(q.at - w.at) < 1.5);
        if (c) return { type: "lamp", l, o: c };
        const lq = map.lifts.find(q => q.level === l.id && liftAxis(q) === w.axis && w.line === liftLine(q) && wallTile(w) >= liftAlong(q) - 1 && wallTile(w) < liftAlong(q) + 4);
        if (lq) return { type: "lift", l, o: lq };
        if (map.entrance && map.entrance.level === l.id && map.entrance.axis === w.axis && map.entrance.line === w.line && wallTile(w) >= map.entrance.at && wallTile(w) < map.entrance.at + 8) return { type: "entrance", l, o: map.entrance };
        const tun = (map.tunnels || []).find(q => q.level === l.id && q.axis === w.axis && q.line === w.line && wallTile(w) >= q.at && wallTile(w) < q.at + 8);
        if (tun) return { type: "tunnel", l, o: tun };
        const st = map.stairs.find(s => s.low === l.id && (thruLeft(s) ? w.axis === "y" && s.x === w.line && w.at > s.a && w.at <= s.b : w.axis === "x" && s.y === w.line && w.at >= s.a && w.at < s.b));
        if (st) return { type: "stair", l, o: st };
        if (wallPaint) return { type: "wall", l, o: wallStretch(l, w), tile: wallTile(w) };
    }
    if (wallPaint && !w) { const g = wallAt(px, py, l, true); if (g && wallState(l, g.axis, g.line, wallTile(g)) !== "full") return { type: "wall", l, o: wallStretch(l, g), tile: wallTile(g) }; }
    if (hasFloor(l, X, Y)) {
        const flight = stepsAt(l, X, Y); if (flight) return { type: "steps", l, o: flight };
        const m = [...(l.medals || [])].reverse().find(q => fx >= q.x && fx < q.x + 4 && fy >= q.y && fy < q.y + 4);
        if (m) return { type: "medal", l, o: m };
        const r = [...(l.rugs || [])].reverse().find(q => inRect(q, fx, fy));
        if (r) return { type: "rug", l, o: r };
    }
    return null;
}
const alphaOf = new Map(); const treeAlpha = (im, i, j) => { let t = alphaOf.get(im); if (!t) { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0); t = { w: c.width, d: g.getImageData(0, 0, c.width, c.height).data }; alphaOf.set(im, t); } return t.d[(j * t.w + i) * 4 + 3] > 100; };
/* how far round the tree walkers are kept out, in tiles beyond the statue's own 2x2 (8 Nov, his: "mark out a non-walkable section, so users can't walk into/under the tree") */
const treeKeepOut = (p, f) => { const n = Math.max(0, Math.min(6, p.treeOut || 0)); if (!n) return; for (let x = p.x - n; x < p.x + 2 + n; x++) for (let y = p.y - n; y < p.y + 2 + n; y++) f(x, y); };
function pick(px, py) {
    if (selected && selected.type === "sign") { const b = signBox(selected.l, selected.o); if (b && handleAt(b, px, py)) return selected; }
    if (selected && selected.type === "wallitem" && selected.o.k === "i_window" && windowHandleAt(selected.l, selected.o, px, py)) return selected;
    /* of two things on one line of sight the higher is the nearer, so the top floor goes first, and
       a floor or wall you can see stops the click reaching anything hidden behind it */
    if (window.hallwayXmas && window.HallwayGarland && level) for (const g of (level.garlands || [])) for (let t = g.a; t < g.b; t++) { const q = HallwayGarland.tileAt(level, g, t); if (q && Math.abs(px - q.c[0]) <= 9 && py >= q.c[1] - 2 && py <= q.c[1] + 16) return { type: "garland", l: level, o: g }; }
    if (window.hallwayXmas && window.HallwayFestoon && level) for (const f of (level.festoons || [])) { const s = HallwayFestoon.shape(f); for (const [u, d] of s.bulbs.concat(s.pts.filter((q, i) => i % 6 === 0))) { const p = HallwayFestoon.onScreen(level, f, u, -d); if (Math.abs(px - p[0]) <= 4 && py >= p[1] - 3 && py <= p[1] + 9) return { type: "festoon", l: level, o: f }; } }
    /* at Christmas the statue is the giant tree, far bigger than its tiles: anywhere on its picture selects it (8 Nov, his) */
    if (window.hallwayXmas && level && floorPiece("bigtree")) { const fp = floorPiece("bigtree"), im = pieceImg(fp.f); for (const p of (level.props || [])) { if (p.k !== "statue") continue; const a = P(p.x + 1, p.y + 1, tileZ(level, p.x, p.y)), i = Math.round(px - (a[0] - fp.ox)), j = Math.round(py - (a[1] - fp.oy)); if (i < 0 || j < 0 || i >= fp.w || j >= fp.h) continue; if (!im.complete || !im.naturalWidth || treeAlpha(im, i, j)) return { type: "prop", l: level, o: p }; } }
    for (const l of [...map.levels].sort((a, c) => c.k - a.k)) {
        const h = pickIn(l, px, py); if (h) return h;
        const [fx, fy] = tileIn(l, px, py), X = Math.floor(fx), Y = Math.floor(fy);
        if ((hasFloor(l, X, Y) && !holes(l).some(r => inRect(r, X, Y))) || wallAt(px, py, l)) return null;
    }
    return null;
}
let fontW = {};
const textW = t => { let w = 0; for (const ch of t) w += fontW[ch] || fontW[" "] || 5; return w; };
function wrapChars(name, max) { const lines = []; let cur = ""; for (const word of String(name).split(" ")) { if (cur && (cur + " " + word).length > max) { lines.push(cur); cur = word; } else cur = cur ? cur + " " + word : word; } if (cur) lines.push(cur); return lines; }
function wrapPx(name, maxW) { const lines = []; let cur = ""; for (const word of String(name).split(" ")) { const next = cur ? cur + " " + word : word; if (cur && textW(next) > maxW) { lines.push(cur); cur = word; } else cur = next; } if (cur) lines.push(cur); return lines; }
const SIGN_PAD = 12, SIGN_LH = 10, SIGN_V = 7, SIGN_MAX = { w: 400, h: 200 };     // how far above the usual line a sign sits unless you've moved it
/* a stair's sign: the same plaque, on the wall beside the flight (a flight through a left wall has none) */
const stairSignName = st => st.label || (byId(st.up) ? byId(st.up).name : "Up");
/* the hanging plaque's sums, as stairPlaque in hw3.js does them */
const PLAQUE = { h: 66, off: 3, H: 30, arm: 8 };
const plaqueWide = name => { const words = name.split(" "), tw = words.reduce((a, t) => a + textW(t), 0) + (words.length - 1) * 4; return Math.min(400, Math.max(50, tw + 12)); };     // 400: the renderer's SIGN_MAX_W (15 Nov scan, renderer 8)
function plaqueBox(l, d) {
    const W = plaqueWide(stairSignName(d));
    const g = d.sign || {}, u = g.u || 0, v = g.blade ? g.v || 0 : 0, base = P(stairSignX(d), d.y, levelZ(l)), ax = base[0] + u, ay = base[1] + Math.floor(u / 2) - v;
    const L = ax - PLAQUE.off - W, B = ay - PLAQUE.h + Math.floor((W + PLAQUE.off) / 2), corner = (s, t) => [L + s, B - Math.floor(s / 2) - t];
    return { stair: true, door: false, W, H: PLAQUE.H, sh: 1, base, u, v, minW: W, minH: PLAQUE.H, lines: [name], L, B, at: (uu, vv) => [ax + uu, ay - vv], pts: [corner(0, 0), corner(W, 0), corner(W, PLAQUE.H), corner(0, PLAQUE.H)] };
}
const stairSignX = st => st.kind === "turn" ? st.b + 6 : (st.signX || st.a - 2);      // a plaque reaches left, so beside a turning flight it stands clear of the steps
function signBox(l, d) {
    if (d.kind) return thruLeft(d) || d.noSign ? null : plaqueBox(l, d);
    const name = doorName(d); if (!name) return null;
    const g = d.sign || {}, lines = g.w ? wrapPx(name, g.w - SIGN_PAD * 2) : wrapChars(name, 14);
    const tw = Math.max(...lines.map(textW)), W = Math.max(tw + SIGN_PAD * 2, 40, g.w || 0), H = Math.max(lines.length * SIGN_LH + 9, g.h || 0);
    const z = wallZ(l, d), base = d.axis === "x" ? P(d.at + 1, d.line, z) : P(d.line, d.at - 1, z), sh = d.kind || d.axis === "x" ? 1 : -1, u = g.u || 0, v = g.v === undefined ? (d.kind ? 0 : SIGN_V) : g.v;
    /* a point on the plaque: uu along it from the middle, vv up from its bottom */
    const at = (uu, vv) => { const U = u + uu; return [base[0] + U, base[1] - 71 + sh * Math.floor(U / 2) - v - vv]; };
    const minW = Math.max(40, Math.max(...String(name).split(" ").map(textW)) + SIGN_PAD * 2), minH = lines.length * SIGN_LH + 9;
    return { W, H, at, sh, base, u, v, minW, minH, lines, door: !d.kind };
}
function signHit(l, d, px, py) {
    const b = signBox(l, d); if (!b) return null;
    if (b.stair) { const s = px - b.L, t = b.B - Math.floor(s / 2) - py; return s >= -4 && s <= b.W + PLAQUE.off + 3 && t >= -4 && t <= b.H + PLAQUE.arm + 6 ? { uu: s, vv: t, b } : null; }
    const uu = px - b.base[0] - b.u, vv = (b.base[1] - 71 + b.sh * Math.floor((px - b.base[0]) / 2) - b.v) - py;
    const left = b.W >> 1, right = b.W - left, m = 5;
    if (uu < -left - m || uu > right + m || vv < -m || vv > b.H + m) return null;
    return { uu, vv, b };
}
/* the four handles, in the middle of each side */
function signHandles(b) {
    if (b.stair) return {};                                     // sized by its words
    const left = -(b.W >> 1), right = b.W + left, h = { l: b.at(left, b.H >> 1), r: b.at(right, b.H >> 1), t: b.at(0, b.H) };
    if (!b.door) h.b = b.at(0, 0);                              // a door's sign keeps its bottom where it is
    return h;
}
function handleAt(b, px, py) { const r = Math.max(5, 7 / zoom), h = signHandles(b); for (const k of Object.keys(h)) if (Math.abs(px - h[k][0]) <= r && Math.abs(py - h[k][1]) <= r) return k; return null; }
const TYPE_NAMES = { tunnel: "Tunnel", garland: "Garland", festoon: "Festoon lights", entrance: "Entrance", wallitem: "On the wall", steps: "Small steps", wall: "Wall", sign: "Maze sign", prop: "Furniture", tele: "Imperial Teleport", door: "Door", lamp: "Wall light", lift: "Lift", stair: "Stairs", medal: "Carpet crest", rug: "Rug" };
const PROP_NAMES = { ghsofa: "Lobby sofa", ghchair: "Lobby armchair", ghlowtable: "Lobby low table", ghoval: "Lobby oval table", gh_plinth_marble: "Marble plinth", gh_plinth_black: "Black plinth", gh_plinth_column: "Fluted column", gh_placard: "Placard", mark_year: "Year plate, brass", mark_year_steel: "Year plate, steel", plant_yukka: "Yukka palm", plant_fruittree: "Fruit tree", plant_bigcactus: "Big cactus", plant_minibonsai: "Bonsai, small", plant_pineapple: "Pineapple plant", leetstand: "Poster stand: The Leet Show", leetstand2: "Poster stand, narrow: The Leet Show", barstool: "Arcade stool", plant_palm: "Palm, terracotta pot", plant_orange: "Orange tree, brass pot", plant_bonsai: "Bonsai, walnut pot", plant_roses: "Roses in a vase", plant_cactus: "Cactus, terracotta pot", plant_bay: "Clipped bay, brass pot", plant_sunflower: "Sunflower in a vase", archway: "Archway", mark_arrow: "Arrow tile", arcade_ff: "Arcade: Fallin' Furni", arcade_pura: "Arcade: Pura Panic", arcade_guess: "Arcade: Guess the Maze", arcade_odd: "Arcade: Odd One Out", arcade_scout: "Arcade: green (no game yet)", arcade_quiz: "Arcade: purple (no game yet)", tablelamp: "Globe table lamp", xmastree: "Christmas tree", xmassmalltree: "Small tree", snowman: "Snowman", xmaslantern: "Lantern", xmasdrinks: "Christmas drinks", xmasduck: "Christmas duck", gift1: "Gift", gift2: "Gift", gift3: "Gift", gift4: "Gift", xmasfir: "Christmas tree, our own, 1 tile", xmasfir2: "Christmas tree, our own, 2 tiles", xmasfir4: "Christmas tree, our own, 4 tiles", gift5: "Present, red", gift6: "Present, lime", gift7: "Present, purple", gift8: "Present, orange", gift9: "Present, yellow", gift10: "Present, pink", gift11: "Present, silver", trophy: "Old trophy cabinet", rarecase: "Rare in a glass case", mark_scuff: "Floor scuffs", mark_tile: "Lifted floor tile", rope: "Rope barrier", pillartall: "Tall pillar", smtable: "Small round table", ballpost: "Ball post", ero_stone: "Stone planter", ero_walnut: "Walnut planter", ero_evergreen: "Evergreen planter", ero_flower: "Flower planter", sofa: "Sofa", chair: "Chair", table: "Table", lamp: "Floor lamp", plant: "Plant", ero: "Planter", pillar: "Pillar", statue: "Statue", fountain: "Fountain", shelf: "Bookcase", cabinet: "Cabinet", water: "Water cooler" };
const THUMB_FOR = { sign: "door", door: "door", lamp: "sconce", lift: "lift", medal: "medal", rug: "rug", tele: "tele" };
function thumbFor(hit) {
    if (hit.type === "wallitem") { const def = wallItemOf(hit.o.k); return def ? "art/wall/" + def.y.layers[0].f : null; }
    if (hit.type === "steps") return T_ + "stair.png";
    const key = hit.type === "prop" ? hit.o.k : hit.type === "stair" ? (hit.o.kind === "straight" ? "stair" : hit.o.kind) : THUMB_FOR[hit.type];
    for (const [, list] of TOOLS) for (const [id, , src] of list) if (id === key) return src;
    return null;
}
function select(hit) {
    selected = hit;
    if (hit && hit.l !== level) { level = hit.l; buildLevels(); }
    const box = $("doorInfo"); if (!box) return; box.textContent = "";
    if (!hit) {
        const e = document.createElement("div"); e.className = "empty";
        const s = document.createElement("strong"); s.textContent = "Nothing selected"; e.appendChild(s);
        e.appendChild(document.createTextNode("With Select and move on, click anything on the map."));
        box.appendChild(e); paint(); return;
    }
    showTab("inspect");
    const head = document.createElement("div"); head.className = "insp-head";
    const src = thumbFor(hit); if (src) head.appendChild(thumbEl(src));
    const title = document.createElement("div"); title.className = "insp-title";
    const t = document.createElement("strong"); t.textContent = hit.type === "prop" ? (PROP_NAMES[hit.o.k] || "Furniture") : hit.type === "wallitem" && wallItemOf(hit.o.k) ? wallItemOf(hit.o.k).name : hit.type === "sign" && hit.o.kind ? "Stairs sign" : TYPE_NAMES[hit.type]; title.appendChild(t);
    const sub2 = document.createElement("span"); sub2.textContent = hit.l.name; title.appendChild(sub2);
    head.appendChild(title); box.appendChild(head);
    const say = text => { const p = document.createElement("p"); p.className = "hint"; p.textContent = text; box.appendChild(p); };
    const row = document.createElement("div"); row.className = "btn-row";
    const btn = (label, fn, cls) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn small " + (cls || ""); b.textContent = label; b.addEventListener("click", fn); row.appendChild(b); };
    if (hit.type === "door" || (hit.type === "sign" && !hit.o.kind)) mazePicker(box, hit.o);
    if (hit.type === "door") {
        say(hit.o.spare ? (hit.o.opens ? "A spare door with no sign. It opens, but there's nothing behind it." : "A spare door: locked, with no sign.") : (doorName(hit.o) || "No maze left for this door yet."));
        btn(hit.o.spare ? "Give it a maze" : "Make it spare", () => { snapshot(); setDoorSpare(hit.o, !hit.o.spare); changed(); select(hit); buildLevels(); });
        doorFloorKind(hit.o);
        { const d = hit.o, field = (label, ctl) => { const f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = label; const c = document.createElement("span"); c.className = "f-ctl"; c.appendChild(ctl); f.append(n, c); box.appendChild(f); }, opts = (s, list, now) => { for (const [v, t] of list) { const o = document.createElement("option"); o.value = v; o.textContent = t; if (v === now) o.selected = true; s.appendChild(o); } };
          const kind = document.createElement("select"); opts(kind, [["", "A door"], ["book", "A bookcase door"]], d.kind || ""); kind.addEventListener("change", () => { snapshot(); if (kind.value === "book") { d.kind = "book"; setDoorSpare(d, true); if (!d.to) d.to = { kind: "room", size: "4x8", n: 0 }; } else delete d.kind; changed(); select(hit); buildLevels(); }); field("What it looks like", kind);
          const here = d.to && d.to.kind === "lounge" ? "lounge" : d.to && d.to.kind === "room" ? d.to.size + "|" + d.to.n : "", to = document.createElement("select"), rooms = []; for (const n of [0, 1, 2]) rooms.push(["6x14|" + n, "Staff corridor " + (n + 1)]); for (const n of [0, 1, 2]) rooms.push(["4x8|" + n, "Passage " + (n + 1)]); rooms.push(["lounge", "Finders' Lounge (finishers only)"]); opts(to, [["", d.kind === "book" ? "Nowhere" : "Its maze"], ...rooms], here);
          to.addEventListener("change", () => { snapshot(); if (to.value === "lounge") { d.to = { kind: "lounge" }; setDoorSpare(d, true); } else if (to.value) { const [size, n] = to.value.split("|"); d.to = { kind: "room", size, n: +n }; setDoorSpare(d, true); } else delete d.to; changed(); select(hit); buildLevels(); }); field("Leads to", to);
          if (d.kind === "book") { const sp = document.createElement("input"); sp.type = "range"; sp.min = "25"; sp.max = "300"; sp.step = "5"; sp.value = String(Math.round((d.speed || 1) * 100)); const shown = () => { sp.title = sp.value + "% of its normal speed"; }; shown(); sp.addEventListener("pointerdown", () => snapshot()); sp.addEventListener("input", () => { d.speed = +sp.value / 100; shown(); }); sp.addEventListener("change", () => { changed(); setDoor(d, true, 3000); }); field("How fast it opens", sp); }
        }
        if (!doorLinked(hit.o)) {
            const f = document.createElement("label"); f.className = "field";
            const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Opens when used";
            const c = document.createElement("span"); c.className = "f-ctl"; const t = document.createElement("input"); t.type = "checkbox"; t.checked = !!hit.o.opens; t.setAttribute("aria-label", "This door opens when used, though it leads nowhere");
            t.addEventListener("change", () => { snapshot(); if (t.checked) hit.o.opens = true; else delete hit.o.opens; changed(); });
            c.appendChild(t); f.append(n, c); box.appendChild(f);
        }
        if (map.levels.length > 1) {
            const f = document.createElement("label"); f.className = "field";
            const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Move to floor";
            const sel = document.createElement("select"); sel.className = "f-ctl";
            for (const lv of [...map.levels].sort((a, c) => c.k - a.k)) { const op = document.createElement("option"); op.value = lv.id; op.textContent = lv.name; if (lv === hit.l) op.selected = true; sel.appendChild(op); }
            sel.addEventListener("change", () => { const lv = byId(sel.value); if (!lv || lv === hit.l) return; const from = hit.l, o = hit.o; select(null); setFloor(lv); setTool("door"); doorCarry = { from, o }; flash("Now click a wall on " + lv.name + " to put the door there. Esc cancels."); });
            f.appendChild(n); f.appendChild(sel); box.appendChild(f);
        }
    } else if (hit.type === "sign") {
        say(hit.o.kind ? "Drag it along the wall or up and down. Its size follows the floor's name, and its arrow points the way the stairs climb." : "Drag it to move it. Drag the handle on any side to resize it: narrower wraps the text, and it grows taller to fit. Its bottom stays put and it stays centred on the door.");
        btn("Reset size and place", () => { snapshot(); delete hit.o.sign; changed(); select(hit); });
    } else if (hit.type === "stair") { say((hit.o.kind === "turn" ? "Turning at a landing" : hit.o.kind === "side" ? "Through a top-left wall" : hit.o.kind === "sideturn" ? "Through a top-left wall, turning at a landing" : "Straight") + ". Drag along the wall to move.");
        /* the garland wound round its banisters at Christmas (9 Nov 2026, his); it sat in the furniture branch, so it never showed (his) */
        /* its sign, on or off (14 Nov 2026, his) */
        if (hit.type === "stair" && !thruLeft(hit.o)) { const st = hit.o, f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Sign"; const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !st.noSign; cb.addEventListener("change", () => { snapshot(); if (cb.checked) delete st.noSign; else st.noSign = true; buildLevels(); changed(); }); f.append(n, cb); box.appendChild(f); }
        if (hit.type === "stair") { const st = hit.o, f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Garland round the banisters"; const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!st.garland; cb.addEventListener("change", () => { snapshot(); if (cb.checked) st.garland = true; else delete st.garland; changed(); }); f.append(n, cb); box.appendChild(f); const p = document.createElement("p"); p.className = "hint"; p.textContent = "Shows at Christmas only."; box.appendChild(p); }
    }
    else if (hit.type === "rug") { say((hit.o.style === "small" ? "Small squares floor, " : "") + `${hit.o.x1 - hit.o.x0} by ${hit.o.y1 - hit.o.y0} tiles. Drag it to move, or drag an edge to resize.`);
        /* a rug's corners: square with the client's rosette, or cut a tile across */
        if (hit.o.style !== "small") { const f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Cut corners"; const c = document.createElement("span"); c.className = "f-ctl"; const t = document.createElement("input"); t.type = "checkbox"; t.checked = !!hit.o.chamfer; t.addEventListener("change", () => { snapshot(); if (t.checked) hit.o.chamfer = true; else delete hit.o.chamfer; changed(); }); c.appendChild(t); f.append(n, c); box.appendChild(f);
            /* plain corners (14 Nov 2026, his: "an option for rugs where i can pick between the detailed corners and more plain corners"): the
               border just turns, no medallion, on any of this rug's corners; rugs 2 or 3 tiles across have them anyway */
            const f2 = document.createElement("label"); f2.className = "field"; const n2 = document.createElement("span"); n2.className = "f-label"; n2.textContent = "Plain corners"; f2.title = "Corners without the medallion: the border just turns, on every corner of the joined rug this one is part of. Rugs 2 or 3 tiles across always have these."; const c2 = document.createElement("span"); c2.className = "f-ctl"; const t2 = document.createElement("input"); t2.type = "checkbox"; t2.checked = !!hit.o.plainCorners; t2.addEventListener("change", () => { snapshot(); if (t2.checked) hit.o.plainCorners = true; else delete hit.o.plainCorners; changed(); }); c2.appendChild(t2); f2.append(n2, c2); box.appendChild(f2); } }
    else if (hit.type === "lift") say("Drag it along a wall to move it, back or left. In the hallway, double-click a lift to open it, then walk in.");
    else if (hit.type === "entrance") say("Where Habbos arrive, and where they leave by walking back in. Drag it along a wall to move it.");
    else if (hit.type === "tunnel") {
        say("A tunnel Habbos can walk into. Walk to its back and you come out of the tunnel it leads to. Drag it along a wall to move it.");
        const q = hit.o, f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Leads to";
        const c = document.createElement("span"); c.className = "f-ctl"; const sel = document.createElement("select"); sel.setAttribute("aria-label", "Where the tunnel leads");
        const opt = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); };
        opt("", "Nowhere (it's a dead end)");
        /* the tunnels on this map, then the other map's (the way between the Hallways and the Events Gallery) */
        for (const t of allTunnels().sort((a, b) => (a.place === mapNow ? 0 : 1) - (b.place === mapNow ? 0 : 1))) if (t.q !== q) { const s = tunnelLabel(t); opt(t.q.id, s.charAt(0).toUpperCase() + s.slice(1)); }
        /* one it led to that's gone shows as gone, not as a blank (10 Nov scan b, rooms 4) */
        if (q.to && !findTunnel(q.to)) opt(q.to, "A tunnel that isn't there any more");
        sel.value = q.to || "";
        sel.addEventListener("change", () => { snapshot();
            /* a link goes both ways: whatever either end was linked to before lets go */
            unlinkTunnel(q.id); if (q.to) { const was = findTunnel(q.to); if (was) delete was.q.to; }
            if (sel.value) { const to = findTunnel(sel.value); if (to) { unlinkTunnel(to.q.id); q.to = to.q.id; to.q.to = q.id; } } else delete q.to;
            changed(); select(hit); });
        c.appendChild(sel); f.append(n, c); box.appendChild(f);
    }
    else if (hit.type === "wall") wallPanel(box, hit);
    else if (hit.type === "wallitem" && hit.o.k === "i_window") {
        say("Window. Drag it along the wall. Drag a square to change its width, top or bottom.");
        const f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Looks out on"; const c = document.createElement("span"); c.className = "f-ctl"; const t = document.createElement("select");
        for (const [v, name] of [["", "Whatever's behind it (changes along the wall)"], ["lawn", "The lawn"], ["road", "The road"], ["maze", "The hedge maze"], ["park", "The car park"]]) { const op = document.createElement("option"); op.value = v; op.textContent = name; t.appendChild(op); }
        t.value = hit.o.view || ""; t.addEventListener("change", () => { snapshot(); if (t.value) hit.o.view = t.value; else delete hit.o.view; changed(); }); c.appendChild(t); f.append(n, c); box.appendChild(f);
    }
    else if (hit.type === "steps") {
        const fl = flightOf(hit.l, hit.o);
        say(`${hit.o.b - hit.o.a} tile${hit.o.b - hit.o.a === 1 ? "" : "s"} wide, ${fl ? Math.round(fl.rise / STEP_R) : 0} steps, climbing ${hit.o.dir === "front" ? "towards you, so their fronts are hidden" : "away from you"}. Drag them along the edge.`);
        const resize = by => { const run = edgeRun(hit.l, hit.o.axis, hit.o.line, hit.o.a); let a = hit.o.a, b = hit.o.b + by; if (b > run.b) { a = Math.max(run.a, a - (b - run.b)); b = run.b; } if (b - a < 1 || (a === hit.o.a && b === hit.o.b)) return; snapshot(); hit.o.a = a; hit.o.b = b; changed(); select(hit); };
        btn("Narrower", () => resize(-1)); btn("Wider", () => resize(1));
    }
    /* wall items share this branch so their own options below (the custom sign, torn paper, festoons) are reached (8 Nov: they weren't) */
    /* garlands and festoon lights: their own options (10 Nov scan, editor 5: they sat inside the furniture branch, so they never showed) */
    else if (hit.type === "garland" || hit.type === "festoon") {
        say(hit.type === "garland" ? "A garland along the wall. Delete it, or lay another over it with the Garland tool." : "Festoon lights along the wall. Delete them, or lay another run with the Festoon tool.");
        if (hit.type === "garland") { const g = hit.o, f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Baubles"; const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = g.baubles !== false; cb.addEventListener("change", () => { snapshot(); if (cb.checked) delete g.baubles; else g.baubles = false; changed(); }); f.append(n, cb); box.appendChild(f); const p = document.createElement("p"); p.className = "hint"; p.textContent = "Their colours are set on the Map tab."; box.appendChild(p); }
        if (hit.type === "festoon") { const q = hit.o, row = (label, ctl) => { const f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = label; f.append(n, ctl); box.appendChild(f); }, sel = document.createElement("select"); sel.className = "f-ctl"; for (const [v, t] of [["amber", "Amber"], ["warm", "Warm white"], ["multi", "Many colours"], ["redgreen", "Red and green"], ["blue", "Blue and white"], ["cool", "Cool white"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); } sel.value = q.colour || "amber"; sel.addEventListener("change", () => { snapshot(); if (sel.value === "amber") delete q.colour; else q.colour = sel.value; lastFestoon.colour = sel.value; changed(); }); row("Bulbs", sel);
          const tw = document.createElement("input"); tw.type = "checkbox"; tw.checked = !!q.twinkle; tw.addEventListener("change", () => { snapshot(); if (tw.checked) q.twinkle = true; else delete q.twinkle; lastFestoon.twinkle = tw.checked; changed(); }); row("A gentle twinkle", tw);
          const hh = document.createElement("input"); hh.type = "number"; hh.min = "40"; hh.max = "140"; hh.className = "f-ctl"; hh.value = String(q.h || 118); hh.addEventListener("change", () => { snapshot(); q.h = Math.max(40, Math.min(140, Math.round(+hh.value || 118))); changed(); }); row("Height on the wall", hh); }
    }
    else if (hit.type === "prop" || hit.type === "tele" || hit.type === "wallitem") {
        const long = hit.type === "prop" && Parts.ROWS[hit.o.k];
        if (hit.type === "wallitem") { const def = wallItemOf(hit.o.k); say((def ? def.name + ". " : "") + "Drag it along the wall or onto another wall. Ctrl-drag moves it up or down."); }
        else say((long ? `${Parts.lengthOf(hit.o)} tiles long. ` : "") + "Drag it to move it, or use the arrow keys to nudge it." + (hit.type === "tele" || Parts.turns(hit.o.k) > 1 ? " R turns it." : ""));
        if (hit.type === "tele" || (hit.type === "prop" && Parts.turns(hit.o.k) > 1)) btn("Rotate", rotateSelected);
        if (long) { btn("Shorter", () => resizeSelected(-1)); btn("Longer", () => resizeSelected(1)); }
        /* a sign with your own words: drawn by the map from these (render/hw3.js customSign) */
        if (hit.type === "wallitem" && hit.o.k === "i_custsign") { const q = hit.o, row = (label, ctl) => { const f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = label; f.append(n, ctl); box.appendChild(f); }, set = (k, v) => { snapshot(); if (v === "" || v === false) delete q[k]; else q[k] = v; changed(); };
          const ta = document.createElement("textarea"); ta.rows = 2; ta.className = "f-ctl"; ta.value = q.text || "Your words"; ta.setAttribute("aria-label", "What it says"); ta.addEventListener("change", () => {
              /* as the sign draws it (15 Nov scan, editor 13): letters its font has, two lines at most, each trimmed, 80 letters in all, and the box shows what was kept */
              const has = ch => !Object.keys(fontW).length ? !/[\u{10000}-\u{10FFFF}️‍]/u.test(ch) : fontW[ch] !== undefined || fontW[ch.toUpperCase()] !== undefined || fontW[ch.toLowerCase()] !== undefined;
              const typed = ta.value, lines = typed.split(/\n|\|/).map(t => [...t].filter(ch => ch === " " || has(ch)).join("").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 2), v = lines.join("\n").slice(0, 80);
              if (!v) { ta.value = q.text || "Your words"; flash("A sign needs some words it can show."); return; }
              ta.value = v; if (v !== (q.text || "")) set("text", v);
              if ([...typed.replace(/[\s|]/g, "")].some(ch => !has(ch))) flash("Some of those letters can't be shown on a sign, so they were left out.");
          }); row("What it says (two lines at most)", ta);
          const ar = document.createElement("select"); ar.className = "f-ctl"; for (const [v, t] of [["", "No arrow"], ["left", "Arrow pointing left"], ["right", "Arrow pointing right"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; ar.appendChild(o); } ar.value = q.arrow || ""; ar.addEventListener("change", () => { set("arrow", ar.value); select(hit); }); row("Arrow", ar);
          const box2 = (label, k) => { const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!q[k]; c.addEventListener("change", () => { set(k, c.checked); select(hit); }); row(label, c); };
          box2("One line (a smaller sign)", "oneLine"); if (q.arrow && !q.oneLine) box2("Arrow on the same line as the words", "arrowSame");
          say("Shows on the map once the pictures are redrawn. The picture here in the editor is only a stand-in."); }
        if (hit.type === "wallitem" && String(hit.o.k).startsWith("i_peel")) { const q = hit.o, f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Behind it"; const sel = document.createElement("select"); sel.className = "f-ctl"; for (const [v, t] of [["", "Nothing"], ["note", "A note"], ["6x14|0", "A door: staff corridor 1"], ["6x14|1", "A door: staff corridor 2"], ["6x14|2", "A door: staff corridor 3"], ["4x8|0", "A door: passage 1"], ["4x8|1", "A door: passage 2"], ["4x8|2", "A door: passage 3"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); } sel.value = !q.behind ? "" : q.behind.kind === "note" ? "note" : q.behind.size + "|" + q.behind.n; sel.addEventListener("change", () => { snapshot(); if (!sel.value) delete q.behind; else if (sel.value === "note") q.behind = { kind: "note", text: (q.behind && q.behind.text) || "" }; else { const [size, m] = sel.value.split("|"); q.behind = { kind: "door", size, n: +m }; } changed(); select(hit); }); f.append(n, sel); box.appendChild(f);
          if (q.behind && q.behind.kind === "note") { const ta = document.createElement("textarea"); ta.rows = 3; ta.value = q.behind.text || ""; ta.setAttribute("aria-label", "What the note says"); ta.style.width = "100%"; ta.addEventListener("change", () => { snapshot(); q.behind.text = ta.value; changed(); }); box.appendChild(ta); } }
        if (hit.type === "wallitem" && hit.o.k === "i_festoon") { const q = hit.o, row = (label, ctl) => { const f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = label; f.append(n, ctl); box.appendChild(f); }, sel = document.createElement("select"); sel.className = "f-ctl"; for (const [v, t] of [["amber", "Amber"], ["warm", "Warm white"], ["multi", "Many colours"], ["redgreen", "Red and green"], ["blue", "Blue and white"], ["cool", "Cool white"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); } sel.value = q.colour || "amber"; sel.addEventListener("change", () => { snapshot(); if (sel.value === "amber") delete q.colour; else q.colour = sel.value; changed(); }); row("Bulbs", sel); const tw = document.createElement("input"); tw.type = "checkbox"; tw.checked = !!q.twinkle; tw.addEventListener("change", () => { snapshot(); if (tw.checked) q.twinkle = true; else delete q.twinkle; changed(); }); row("A gentle twinkle", tw); }
        if (hit.type === "prop" && hit.o.k === "barstool") { const face = ["down to the right", "down to the left", "up to the left", "up to the right"][Parts.rotOf(hit.o)]; say(`Sitting here, you face ${face}. It looks the same every way round: R turns which way you face (the arrow on the map shows it).`); }
        if (hit.type === "prop" && hit.o.k === "statue") { const f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Christmas tree: keep walkers out"; const sel = document.createElement("select"); sel.className = "f-ctl"; sel.setAttribute("aria-label", "How far round the Christmas tree walkers are kept out");
            for (let k = 0; k <= 6; k++) { const o = document.createElement("option"); o.value = String(k); o.textContent = k ? `${k} tile${k === 1 ? "" : "s"} round it (${2 + 2 * k} by ${2 + 2 * k})` : "Only its own 2 by 2"; sel.appendChild(o); }
            sel.value = String(hit.o.treeOut || 0); sel.addEventListener("change", () => { snapshot(); const v = +sel.value; if (v) hit.o.treeOut = v; else delete hit.o.treeOut; changed(); paint(); }); f.append(n, sel); box.appendChild(f);
            if (!window.hallwayXmas) say("The tree only stands here at Christmas: switch Christmas on to see it. The walkers are kept out only then."); }
        if (hit.type === "prop" && RAISE(hit.o.k)) { const f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Height off the floor"; const i = document.createElement("input"); i.type = "number"; i.min = "0"; i.max = "120"; i.value = String(hit.o.z || 0); i.className = "f-ctl"; i.addEventListener("change", () => { snapshot(); const v = Math.max(0, Math.min(120, Math.round(+i.value || 0))); if (v) hit.o.z = v; else delete hit.o.z; changed(); }); f.append(n, i); box.appendChild(f); }
        /* an arrow tile: linked to another, stepping on either takes you to the other (live-arrows.js) */
        if (hit.type === "prop" && hit.o.k === "mark_arrow") { const me = hit.o; if (!me.id) me.id = "ar" + Date.now().toString(36);
            const all = () => map.levels.flatMap(l => (l.props || []).filter(p => p.k === "mark_arrow").map(p => ({ l, p }))), partner = all().find(q => q.p.id === me.link && me.link);
            say(partner ? "Linked to the arrow on " + partner.l.name + ", tile " + partner.p.x + ", " + partner.p.y + ". Stepping on either takes you to the other." : "Not linked yet. Link it to another arrow and stepping on either takes you to the other. R turns it.");
            const row = document.createElement("div"); row.className = "btn-row";
            const b = (t, fn) => { const x = document.createElement("button"); x.type = "button"; x.className = "btn small"; x.textContent = t; x.addEventListener("click", fn); row.appendChild(x); };
            b(partner ? "Link to a different arrow" : "Link to another arrow", () => { flash("Click the arrow to link it to. Esc cancels."); pickNext = u => { const lv = map.levels.find(l => l.id === u.level), o = lv && u.x !== undefined && (lv.props || []).find(p => p.k === "mark_arrow" && Parts.tiles(p).some(t => t[0] === u.x && t[1] === u.y));
                if (!o || o === me) { flash("That isn't another arrow tile."); return; } snapshot(); if (!o.id) o.id = "ar" + Date.now().toString(36) + "b";
                for (const q of all()) if (q.p !== me && q.p !== o && (q.p.link === me.id || q.p.link === o.id)) delete q.p.link;
                me.link = o.id; o.link = me.id; changed(); select(hit); flash("Linked."); }; });
            if (partner) { b("Show its partner", () => { level = partner.l; buildLevels(); const q = P(partner.p.x + 1, partner.p.y + 1, tileZ(partner.l, partner.p.x, partner.p.y)); cam.x = q[0]; cam.y = q[1]; select({ type: "prop", l: partner.l, o: partner.p }); paint(); }); b("Unlink", () => { snapshot(); delete partner.p.link; delete me.link; changed(); select(hit); }); }
            box.appendChild(row); }
        if (window.GalleryExhibits && GalleryExhibits.inspect) GalleryExhibits.inspect(hit, box);
        if (hit.type === "prop" && (floorPiece(hit.o.k) || {}).opts) { const fp = floorPiece(hit.o.k), f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = fp.optLabel || "What's inside"; const sel = document.createElement("select"); sel.className = "f-ctl"; for (const [k, v] of Object.entries((fp && fp.opts) || {}).sort((a, c) => a[1].name.localeCompare(c[1].name))) { const o = document.createElement("option"); o.value = k; o.textContent = v.name; sel.appendChild(o); } sel.value = hit.o.rare || (fp && fp.rare0) || ""; sel.addEventListener("change", () => { snapshot(); hit.o.rare = sel.value; changed(); }); f.append(n, sel); box.appendChild(f); }
        if (hit.type === "prop" && hit.o.k === "rope") { const f = document.createElement("label"); f.className = "field"; const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Comes off at night"; const c = document.createElement("span"); c.className = "f-ctl"; const t = document.createElement("input"); t.type = "checkbox"; t.checked = !!hit.o.night; t.addEventListener("change", () => { snapshot(); if (t.checked) hit.o.night = true; else delete hit.o.night; changed(); }); c.appendChild(t); f.append(n, c); box.appendChild(f); }
        if (hit.type === "prop" && hit.o.k === "rope") {
            if (Parts.lengthOf(hit.o) < RopeBarrier.MIN_FOR_CARD) say("At 2 tiles there's no room for its card. Make it longer to have one.");
            else {
                const f = document.createElement("label"); f.className = "field";
                const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Wooden card";
                const c = document.createElement("span"); c.className = "f-ctl";
                const on = document.createElement("input"); on.type = "checkbox"; on.checked = !hit.o.noCard; on.setAttribute("aria-label", "Show the wooden card");
                on.addEventListener("change", () => { snapshot(); if (on.checked) delete hit.o.noCard; else hit.o.noCard = true; changed(); });
                c.appendChild(on); f.appendChild(n); f.appendChild(c); box.appendChild(f);
            }
        }
        if (hit.type === "prop" && hit.o.k === "lamp") {
            const f = document.createElement("label"); f.className = "field";
            const n = document.createElement("span"); n.className = "f-label"; n.textContent = "Design";
            const c = document.createElement("span"); c.className = "f-ctl";
            const sel = document.createElement("select"); sel.setAttribute("aria-label", "The lamp's design");
            for (const [k, v] of Object.entries(LAMP_STYLES)) { const o = document.createElement("option"); o.value = k; o.textContent = v; sel.appendChild(o); }
            sel.value = hit.o.style || "hotel";
            sel.addEventListener("change", () => { snapshot(); if (sel.value === "hotel") delete hit.o.style; else hit.o.style = sel.value; lampStyle = sel.value; localStorage.setItem("hallway-lamp", lampStyle); changed(); });
            c.appendChild(sel); f.appendChild(n); f.appendChild(c); box.appendChild(f);
        }
    }
    else say(hit.type === "lamp" ? "Drag it along the wall, or onto another wall. Ctrl-drag moves it up or down." : "Drag it to move it, or use the arrow keys to nudge it.");      // the arrows don't move a wall light (10 Nov scan, editor 22)
    if (hit.type === "lamp" || (hit.type === "prop" && (hit.o.k === "lamp" || hit.o.k === "tablelamp" || ((hit.o.k === "pillar" || hit.o.k === "pillartall") && hit.o.lights)))) {
        colourRow(box, "Light colour", () => hit.o.colour || null, v => { if (v) hit.o.colour = v; else delete hit.o.colour; }, "#ffd98a", "The mood's own");
    }
    if ((hit.type !== "sign" || hit.o.kind) && hit.type !== "wall" && hit.type !== "entrance") btn("Delete", deleteSelected, "ghost danger");
    box.appendChild(row);
    paint();
}
function showTab(name) {
    document.querySelectorAll(".tab").forEach(t => { const on = t.dataset.tab === name; t.classList.toggle("active", on); t.setAttribute("aria-selected", String(on)); });
    for (const n of ["inspect", "floors", "map", "music", "hunts", "lost", "exhibits", "problems"]) if ($("tab-" + n)) $("tab-" + n).hidden = n !== name;
}
/* which maze every door has: chosen ones first, the rest A to Z through what's left, as the drawing does */
/* every floor of both maps, the Hallways first: a maze has one door, wherever it is (15 Nov scan, editor 4: a gallery door took a maze that
   already had its door in the Hallways) */
const doorLevels = () => [root, root && root.gallery].filter(m => m && m.levels).flatMap(m => [...m.levels].sort((a, c) => a.k - c.k));
function doorNames() {
    const pinned = new Set(); for (const l of doorLevels()) for (const d of (l.doors || [])) if (d.name && !d.spare) pinned.add(d.name);
    const pool = names.filter(n => !pinned.has(n)), out = new Map(); let i = 0;
    for (const l of doorLevels()) for (const d of [...(l.doors || [])].sort((p, q) => (p.axis === "y" ? 0 : 1) - (q.axis === "y" ? 0 : 1) || p.at - q.at)) {
        out.set(d, d.spare ? null : (d.name || pool[i++] || null));
    }
    return out;
}
function doorName(o) { return doorNames().get(o) || null; }
/* A maze belongs to its door: it's written on the door, so moving the door takes the maze with it,
   and nothing else ever changes hands by itself. */
function pinAllMazes() {
    let n = 0;
    for (const [d, name] of doorNames()) if (name && !d.name) { d.name = name; n++; }
    return n;
}
function freeMazes() {
    const taken = new Set(); for (const l of doorLevels()) for (const d of (l.doors || [])) if (d.name && !d.spare) taken.add(d.name);
    return names.filter(n => !taken.has(n));
}
/* spare: shut with no sign, and its maze goes back to being free. Back again: it takes the next free maze. */
function setDoorSpare(door, spare) {
    if (spare) { door.spare = true; delete door.name; return true; }
    const free = freeMazes();
    door.spare = false;
    if (free.length) door.name = free[0]; else { door.spare = true; flash("Every maze already has a door."); return false; }
    return true;
}
/* Give a door a maze. If another door has it, they swap, so nothing else moves. */
function setDoorMaze(door, name) {
    snapshot();
    if (!name) { setDoorSpare(door, true); changed(); return; }
    const all = doorNames(), mine = all.get(door);
    for (const [d, n] of all) if (n === name && d !== door) { if (mine) d.name = mine; else delete d.name; if (!mine) d.spare = true; }
    door.name = name; door.spare = false;
    changed();
}
function mazePicker(box, door) {
    const row = document.createElement("label"); row.className = "field";
    const s = document.createElement("span"); s.className = "f-label"; s.textContent = "Maze";
    const c = document.createElement("span"); c.className = "f-ctl";
    const sel = document.createElement("select"); sel.setAttribute("aria-label", "The maze behind this door");
    const auto = document.createElement("option"); auto.value = ""; auto.textContent = "No maze: shut, no sign"; sel.appendChild(auto);
    const where = new Map(); for (const [d, n] of doorNames()) if (n) where.set(n, d);
    const levelOf = d => doorLevels().find(l => (l.doors || []).includes(d)), here = new Set(map.levels);
    for (const n of names) { const o = document.createElement("option"); o.value = n; const d = where.get(n), l = d && levelOf(d); o.textContent = l ? `${n} (${here.has(l) ? "" : mapNow === "hallway" ? "Events Gallery, " : "Hallways, "}${l.name})` : `${n} (no door yet)`; sel.appendChild(o); }
    sel.value = door.name || "";
    sel.addEventListener("change", () => { setDoorMaze(door, sel.value); select(selected); buildLevels(); });
    c.appendChild(sel); row.appendChild(s); row.appendChild(c); box.appendChild(row);
}
function deleteSelected() {
    const s = selected; if (!s) return;
    if (s.type === "tunnel") { const list = map.tunnels || [], i = list.indexOf(s.o); if (i < 0) return; snapshot(); unlinkTunnel(s.o.id); list.splice(i, 1); if (!list.length) delete map.tunnels; select(null); buildLevels(); changed(); return; }
    /* a staircase's sign goes off rather than away: select the staircase and tick Sign to have it back (14 Nov 2026, his) */
    if (s.type === "sign" && s.o.kind) { snapshot(); s.o.noSign = true; select(null); buildLevels(); changed(); flash("Sign removed. Select the staircase and tick Sign to put it back."); return; }
    if (s.type === "sign") { flash("A door always has its sign. Make the door spare to take it away."); return; }
    const lists = { garland: s.l.garlands, festoon: s.l.festoons, lift: map.lifts, wallitem: s.l.wallItems, steps: s.l.steps, prop: s.l.props, tele: s.l.teles, door: s.l.doors, lamp: s.l.lamps, medal: s.l.medals, rug: s.l.rugs, stair: map.stairs };
    const list = lists[s.type], i = list ? list.indexOf(s.o) : -1;
    if (i < 0) { flash(s.type === "entrance" ? "The hallway always has an entrance. Drag it to move it." : "That can't be deleted."); return; }
    snapshot(); list.splice(i, 1);
    if (s.type === "stair") tidyAfterStairs();
    select(null); buildLevels(); changed();
}
function stairFits(up, r, self) {
    for (let x = r.x0; x < r.x1; x += 2) for (let y = r.y0; y < r.y1; y += 2) if (!hasFloor(up, x, y)) return false;
    const others = map.stairs.filter(s => s !== self);
    const saved = map.stairs; map.stairs = others; const hs = holes(up); map.stairs = saved;
    return !hs.some(h => r.x0 < h.x1 && r.x1 > h.x0 && r.y0 < h.y1 && r.y1 > h.y0);
}
function beginMove(hit, px, py) {
    const [fx, fy] = tileIn(hit.l, px, py);
    const m = { kind: "move", hit, before: JSON.stringify(root), moved: false, fx, fy, orig: JSON.parse(JSON.stringify(hit.o)) };
    if (hit.type === "wallitem") { const c = wallItemCentre(hit.l, hit.o); m.grab = [c[0] - px, c[1] - py]; if (hit.o.k === "i_window") { m.winSide = windowHandleAt(hit.l, hit.o, px, py); m.px = px; m.py = py; m.win = { w: hit.o.w || 32, b: hit.o.b || 0, top: hit.o.top || 128, at: hit.o.at }; } }
    if (hit.type === "sign") {
        const b = signBox(hit.l, hit.o), side = b && handleAt(b, px, py);
        m.side = side; m.px = px; m.py = py; m.box = b && { W: b.W, H: b.H, u: b.u, v: b.v };
    }
    if (hit.type === "rug") {
        const r = hit.o, near = .45, e = {};
        if (fx - r.x0 < near) e.l = 1; if (r.x1 - fx < near) e.r = 1; if (fy - r.y0 < near) e.t = 1; if (r.y1 - fy < near) e.b = 1;
        if (Object.keys(e).length) m.edge = e;
    }
    return m;
}
function moveSelected(d, px, py) {
    const s = d.hit, o = s.o, l = s.l, [fx, fy] = tileIn(l, px, py), before = JSON.stringify(o);
    const dx = Math.round(fx - d.fx), dy = Math.round(fy - d.fy), g = d.orig;
    if (s.type === "sign") {
        const dpx = Math.round(px - d.px), box = d.box, sh = o.kind || o.axis === "x" ? 1 : -1, dv = Math.round(d.py - py) + sh * Math.floor(dpx / 2);
        const sign = o.sign = o.sign || {};
        if (!d.side) { sign.u = box.u + dpx; sign.v = box.v + dv; if (o.kind) sign.blade = true; }
        else {
            const mins = () => signBox(l, o);
            if (d.side === "r" || d.side === "l") {
                /* narrower wraps the text, so the height follows by itself */
                /* a door's sign stays centred on the door, so it grows both ways and the edge follows the mouse */
                const door = !o.kind, grow = (d.side === "r" ? dpx : -dpx) * (door ? 2 : 1);
                const want = box.W + grow; sign.w = want;
                const fit = Math.min(SIGN_MAX.w, Math.max(want, mins().minW)); sign.w = fit;      // and no bigger than SIGN_MAX (15 Nov scan, editor 6)
                sign.u = door ? 0 : box.u + (d.side === "r" ? 1 : -1) * Math.floor((fit - box.W) / 2);
                if (sign.h) sign.h = Math.max(sign.h, mins().minH);
            } else if (d.side === "t") {
                const dy2 = Math.round(d.py - py); sign.w = sign.w || box.W; sign.h = Math.min(SIGN_MAX.h, Math.max(box.H + dy2, mins().minH)); if (!o.kind) sign.u = 0;
            } else {
                const dy2 = Math.round(py - d.py); sign.w = sign.w || box.W; const fit = Math.min(SIGN_MAX.h, Math.max(box.H + dy2, mins().minH));
                sign.h = fit; sign.v = box.v - (fit - box.H);
            }
        }
        if (JSON.stringify(o) !== before && !d.moved) { d.moved = true; undoStack.push(d.before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; syncButtons(); }
        if (d.moved && !live) { live = { hit: s, key: null, img: null, anchor: null, busy: false }; requestArt(true); }
        paint(); return;
    }
    if (s.type === "wallitem" && d.winSide) {
        /* an edge of a window: in 4px steps, and never too small to read as a window or taller than the wall */
        const v = d.win, dx = px - d.px, dy = py - d.py, snap = n => Math.round(n / 4) * 4;
        if (d.winSide === "r" || d.winSide === "l") { o.w = Math.max(24, Math.min(160, snap(v.w + (d.winSide === "r" ? dx : -dx)))); o.at = v.at + (d.winSide === (o.axis === "x" ? "r" : "l") ? 1 : -1) * (o.w - v.w) / 32; }
        else if (d.winSide === "t") o.top = Math.max(v.b + 32, Math.min(WALL - 4, snap(v.top - dy)));
        else o.b = Math.max(0, Math.min(v.top - 32, snap(v.b - dy)));
        if (JSON.stringify(o) !== before && !d.moved) { d.moved = true; undoStack.push(d.before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; syncButtons(); }
        if (d.moved) { requestArt(); paint(); }
        return;
    }
    if (s.type === "wallitem") {
        const X = px + d.grab[0], Y = py + d.grab[1], w = hangWallAt(X, Y, l);
        if (w && !w.drop && !isHalf(l, w.axis, w.line, wallTile(w))) { const q = wallSpot(w, l, X, Y); o.axis = w.axis; o.line = w.line; o.at = q.at; snapWallItem(o); const lockDef = wallItemOf(o.k), headroom = lockDef && lockDef.tell ? 134 - ((o.axis === "x" ? lockDef.x : lockDef.y).h >> 1) : 999; if (lockDef && lockDef.locked) o.h = lockDef.h; else if (ctrlNow) o.h = Math.min(headroom, snapWall(q.h, "item")); else if (o.h === undefined) o.h = (lockDef && lockDef.h) || 100; else o.h = snapWall(o.h, "item"); }
        if (JSON.stringify(o) !== before && !d.moved) { d.moved = true; undoStack.push(d.before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; syncButtons(); }
        if (d.moved) { requestArt(); paint(); }
        return;
    }
    if (s.type === "steps") {
        const shift = o.axis === "y" ? dx : dy, run = edgeRun(l, o.axis, o.line, g.a), w = g.b - g.a, a = Math.max(run.a, Math.min(run.b - w, g.a + shift)); o.a = a; o.b = a + w;
        if (JSON.stringify(o) !== before && !d.moved) { d.moved = true; undoStack.push(d.before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; syncButtons(); }
        if (d.moved) { requestArt(); paint(); }
        return;
    }
    if (s.type === "prop" || s.type === "tele") { const nx = g.x + dx, ny = g.y + dy; if (s.type === "prop" ? fits(l, { ...o, x: nx, y: ny }) : hasFloor(l, nx, ny)) { const moved = o.x !== nx || o.y !== ny; o.x = nx; o.y = ny; if (s.type === "tele") o.flip = !hasFloor(l, nx - 1, ny); else if (moved && !ctrlNow) landRaised(l, o); } }
    /* the crest and rugs stay on the floor: off it they'd stay in the map, never seen (15 Nov scan, editor 13) */
    else if (s.type === "medal") { if (hasFloor(l, g.x + dx + 2, g.y + dy + 2)) { o.x = g.x + dx; o.y = g.y + dy; } }
    else if (s.type === "rug") {
        const was = { x0: o.x0, x1: o.x1, y0: o.y0, y1: o.y1 };
        if (d.edge) {
            if (d.edge.l) o.x0 = Math.min(g.x0 + dx, o.x1 - 2); if (d.edge.r) o.x1 = Math.max(g.x1 + dx, o.x0 + 2);
            if (d.edge.t) o.y0 = Math.min(g.y0 + dy, o.y1 - 2); if (d.edge.b) o.y1 = Math.max(g.y1 + dy, o.y0 + 2);
        } else { o.x0 = g.x0 + dx; o.x1 = g.x1 + dx; o.y0 = g.y0 + dy; o.y1 = g.y1 + dy; }
        if (!rugOnFloor(l, o)) Object.assign(o, was);
    } else {
        if (s.type === "door") {
            let target = null;
            for (const lv of [...map.levels].sort((a, c) => c.k - a.k)) {
                const spot = doorSpotAt(px, py, lv), at = spot && fitDoor(lv, spot, o);
                if (at !== null && at !== undefined && spot) { target = { lv, spot, at }; break; }
                const f = tileIn(lv, px, py); if (hasFloor(lv, Math.floor(f[0]), Math.floor(f[1])) || wallAt(px, py, lv, true)) break;
            }
            if (target) {
                if (target.lv !== l) { l.doors.splice(l.doors.indexOf(o), 1); (target.lv.doors = target.lv.doors || []).push(o); s.l = target.lv; level = target.lv; buildLevels(); flash("Moved to " + target.lv.name); }
                o.axis = target.spot.axis; o.line = target.spot.line; o.at = target.at;
            }
            if (s.l !== l && !d.moved) { d.moved = true; undoStack.push(d.before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; syncButtons(); }
            if (JSON.stringify(o) !== before && !d.moved) { d.moved = true; undoStack.push(d.before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; syncButtons(); }
            if (d.moved) { requestArt(); paint(); }
            return;
        }
        if (s.type === "entrance" || s.type === "tunnel") {
            portalSelf = s.type === "tunnel" ? o : null;      // a tunnel drags like the entrance (10 Nov scan b, editor 8)
            /* over any wall you can see, top floor first; a floor or wall in the way stops the search, as with doors */
            let fit = null, said = null;
            for (const lv of [...map.levels].sort((a, c) => c.k - a.k)) {
                const w2 = wallAt(px, py, lv);
                if (w2 && !w2.drop) { let at = entranceAt(lv, w2); if (at !== null && s.type === "tunnel" && !entranceTiles({ at }).some(t => w2.axis === "x" ? hasFloor(lv, t, w2.line) : hasFloor(lv, w2.line, t))) at = null; if (at !== null) fit = { lv, w: w2, at }; else said = lastEntranceBlock; break; }
                const f = tileIn(lv, px, py); if (hasFloor(lv, Math.floor(f[0]), Math.floor(f[1]))) break;
            }
            if (fit) {
                if (lastEntranceBlock) flash("It can't go any closer: " + lastEntranceBlock.why + ". It's marked in red.");
                else if (/^(It can't go any closer|The entrance won't fit)/.test($("toast").textContent)) $("toast").classList.remove("show"); /* it's under the mouse now, so the complaint is over */
                if (fit.lv !== l) { o.level = fit.lv.id; s.l = fit.lv; level = fit.lv; buildLevels(); flash("Moved to " + fit.lv.name); }
                o.axis = fit.w.axis; o.line = fit.w.line; o.at = fit.at;
                const now = JSON.stringify(o); if (now !== before && !d.moved) { d.moved = true; undoStack.push(d.before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; syncButtons(); }
                if (d.moved) requestArt();
            } else if (said) { lastEntranceBlock = said; flash((s.type === "tunnel" ? "The tunnel" : "The entrance") + " won't fit here: " + said.why + ". It's marked in red."); }
            portalSelf = null; paint(); return;
        }
        const w = s.type === "lamp" || s.type === "wallitem" ? hangWallAt(px, py, l) : wallAt(px, py, l); if (!w || (w.drop && !(s.type === "lamp" && lampFits(l, w)))) return;
        if (s.type === "lamp" && isHalf(l, w.axis, w.line, wallTile(w))) return;
        if (s.type === "lamp") { o.axis = w.axis; o.line = w.line; o.at = w.at + .5; if (ctrlNow) { const zw = wallZ(l, o), b = o.axis === "x" ? P(o.at, o.line, zw) : P(o.line, o.at, zw); const h = snapWall(b[1] - py, "lamp"); if (h === 106) delete o.h; else o.h = h; } if (w.drop) o.h = Math.min(o.h === undefined ? 106 : o.h, retaining(l, w.axis, w.line, wallTile(w)).H - 8); }
        else if (s.type === "lift") { const t = Math.floor(wallTile(w) / 2) * 2, q = w.axis === "y" ? { level: o.level, axis: "y", x: w.line, y: t } : { level: o.level, x: t, y: w.line }; if (liftFits(l, q, o)) { o.x = q.x; o.y = q.y; if (q.axis) o.axis = q.axis; else delete o.axis; } }
        else if (s.type === "stair") {
            const up = byId(o.up); if (!up) return;
            const wasStair = { ...o };
            if (o.kind === "sideturn") { if (w.axis === "y") { const a = Math.floor(w.at / 2) * 2 - 6; if (sideTurnRects(w.line, a).every(r => stairFits(up, r, o))) { o.a = a; o.b = a + 6; o.x = w.line; } } }
            else if (o.kind === "side") { if (w.axis === "y") { const a = Math.floor(w.at / 2) * 2 - 6; if (stairFits(up, { x0: w.line - 10, x1: w.line, y0: a, y1: a + 6 }, o)) { o.a = a; o.b = a + 6; o.x = w.line; } } }
            else if (w.axis === "x") { const a = Math.floor(w.at / 2) * 2; if (stairFits(up, { x0: a, x1: a + 6, y0: w.line - 10, y1: w.line }, o)) { o.a = a; o.b = a + 6; o.y = w.line; delete o.signX; } }
            carryStairThings(l, wasStair, o);
        }
    }
    if (JSON.stringify(o) !== before && !d.moved) { d.moved = true; undoStack.push(d.before); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; syncButtons();
        /* the map is drawn again without it, once, so only its ghost shows while it's dragged (10 Nov scan, editor 1: nothing asked, so it showed twice) */
        if (s.type === "prop" || s.type === "tele") requestArt(true); }
    paint();
}
function nudgeSelected(dx, dy) {
    const s = selected; if (!s || !["prop", "tele", "medal", "rug"].includes(s.type)) return false;
    const o = s.o;
    if (s.type === "rug") { if (!rugOnFloor(s.l, { x0: o.x0 + dx, x1: o.x1 + dx, y0: o.y0 + dy, y1: o.y1 + dy })) return true; snapshot(); o.x0 += dx; o.x1 += dx; o.y0 += dy; o.y1 += dy; }
    else { if (s.type === "prop" ? !fits(s.l, { ...o, x: o.x + dx, y: o.y + dy }) : s.type === "medal" ? !hasFloor(s.l, o.x + dx + 2, o.y + dy + 2) : !hasFloor(s.l, o.x + dx, o.y + dy)) return true; snapshot(); o.x += dx; o.y += dy; }
    changed(); return true;
}
function drawSelection() {
    const s = selected; if (!s) return;
    const o = s.o, c = "#ffffff", f = "rgba(255,255,255,.22)";
    const z = o.axis !== undefined && o.line !== undefined && s.type !== "steps" ? wallZ(s.l, s.type === "wall" ? { axis: o.axis, at: o.a + (o.axis === "y" ? 1 : 0), line: o.line } : o)
        : s.type === "rug" ? tileZ(s.l, o.x0, o.y0) : o.x !== undefined && o.y !== undefined ? tileZ(s.l, o.x, o.y) : levelZ(s.l);
    /* the arcade stool: which way you'll face on it */
    if (s.type === "prop" && o.k === "barstool") { const d = STEP_OF(seatFacing(o)), c0 = toScreen(...P(o.x + .5, o.y + .5, z)), c1 = toScreen(...P(o.x + .5 + d.dx * .9, o.y + .5 + d.dy * .9, z)); ctx.save(); ctx.strokeStyle = "#4fd1ff"; ctx.fillStyle = "#4fd1ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.stroke(); const ang = Math.atan2(c1[1] - c0[1], c1[0] - c0[0]); ctx.beginPath(); ctx.moveTo(c1[0] + Math.cos(ang) * 8, c1[1] + Math.sin(ang) * 8); ctx.lineTo(c1[0] + Math.cos(ang + 2.4) * 9, c1[1] + Math.sin(ang + 2.4) * 9); ctx.lineTo(c1[0] + Math.cos(ang - 2.4) * 9, c1[1] + Math.sin(ang - 2.4) * 9); ctx.closePath(); ctx.fill(); ctx.restore(); }
    /* the tree's keep-out, outlined in red on the floor */
    if (s.type === "prop" && o.k === "statue" && o.treeOut) { const n = o.treeOut, pts = [[o.x - n, o.y - n], [o.x + 2 + n, o.y - n], [o.x + 2 + n, o.y + 2 + n], [o.x - n, o.y + 2 + n]].map(q => toScreen(...P(q[0], q[1], z))); ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = "#ff6a5a"; ctx.fillStyle = "rgba(255,90,70,.12)"; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    if (s.type === "wallitem") {
        const def = wallItemOf(o.k), box = o.k === "i_window" ? windowBox(o) : def && (o.axis === "x" ? def.x : def.y); if (!box) return;
        const r0 = wallItemRect(s.l, o), a = toScreen(r0.x0, r0.y0), b = toScreen(r0.x0 + r0.w, r0.y0 + r0.h);
        ctx.strokeStyle = "#4fd1ff"; ctx.lineWidth = 2; ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        if (o.k === "i_window") { const hs = windowHandles(s.l, o); for (const k of Object.keys(hs)) { const q = toScreen(hs[k][0], hs[k][1]); ctx.fillStyle = "#000"; ctx.fillRect(q[0] - 6, q[1] - 6, 12, 12); ctx.fillStyle = "#4fd1ff"; ctx.fillRect(q[0] - 4, q[1] - 4, 8, 8); } }
        return;
    }
    if (s.type === "steps") { const fl = flightOf(s.l, o); if (!fl) return; const zl = o.dir === "front" ? (o.axis === "y" ? tileZ(s.l, o.a, o.line - 1) : tileZ(s.l, o.line - 1, o.a)) : (o.axis === "y" ? tileZ(s.l, o.a, o.line) : tileZ(s.l, o.line, o.a)); if (o.axis === "y") quad(o.a, fl.from, o.b, fl.to, zl, f, c); else quad(fl.from, o.a, fl.to, o.b, zl, f, c); return; }
    if (s.type === "sign") {
        const b = signBox(s.l, o); if (!b) return;
        const left = -(b.W >> 1), right = b.W + left, pts = (b.pts || [b.at(left, 0), b.at(right, 0), b.at(right, b.H), b.at(left, b.H)]).map(p => toScreen(p[0], p[1]));
        ctx.strokeStyle = "#4fd1ff"; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke();
        const hs = signHandles(b);
        for (const k of Object.keys(hs)) { const q = toScreen(hs[k][0], hs[k][1]); ctx.fillStyle = "#000"; ctx.fillRect(q[0] - 6, q[1] - 6, 12, 12); ctx.fillStyle = "#4fd1ff"; ctx.fillRect(q[0] - 4, q[1] - 4, 8, 8); }
        return;
    }
    if (s.type === "rug") areaQuad(s.l, o, f, c);
    else if (s.type === "medal") areaQuad(s.l, { x0: o.x, y0: o.y, x1: o.x + 4, y1: o.y + 4 }, f, c);
    else if (s.type === "prop" || s.type === "tele") {
        /* every tile it stands on: a two-by-two piece (the statue, the fountain, the big tree) showed only its first (10 Nov scan) */
        const run = s.type === "prop" ? Parts.tiles(o) : [[o.x, o.y]], xs = run.map(t => t[0]), ys = run.map(t => t[1]);
        quad(Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1, z, f, c);
    }
    else if (s.type === "door") { if (o.axis === "x") line(o.at, o.line, o.at + 2, o.line, z, c, 4); else line(o.line, o.at, o.line, o.at - 2, z, c, 4); }
    else if (s.type === "lamp") { if (o.axis === "x") line(o.at - .5, o.line, o.at + .5, o.line, z, c, 4); else line(o.line, o.at - .5, o.line, o.at + .5, z, c, 4); }
    else if (s.type === "lift") { const a = liftPt(o, 0, 0), b = liftPt(o, 3, 0); line(a[0], a[1], b[0], b[1], z, c, 4); }
    else if (s.type === "entrance" || s.type === "tunnel") { if (o.axis === "x") line(o.at, o.line, o.at + 8, o.line, z, c, 4); else line(o.line, o.at, o.line, o.at + 8, z, c, 4); }
    else if (s.type === "wall") {
        if (o.axis === "x") line(o.a, o.line, o.b, o.line, z, c, 2); else line(o.line, o.a, o.line, o.b, z, c, 2);
        if (s.tile !== undefined) { if (o.axis === "x") line(s.tile, o.line, s.tile + 1, o.line, tileZ(s.l, s.tile, o.line), "#4fd1ff", 5); else line(o.line, s.tile, o.line, s.tile + 1, tileZ(s.l, o.line, s.tile), "#4fd1ff", 5); }
    }
    else if (s.type === "stair") {
        if (thruLeft(o)) quad(o.x - 10, o.a, o.x, o.b, z, f, c); else quad(o.a, o.y - 10, o.b, o.y, z, f, c);
    }
}

/* ---------- mouse ---------- */
function edgeAt(px, py) {
    const r = map.rect, m = 8 / zoom;
    const e = {};
    if (Math.abs(px - r.x) < m) e.l = 1; if (Math.abs(px - (r.x + r.w)) < m) e.r = 1; if (Math.abs(py - r.y) < m) e.t = 1; if (Math.abs(py - (r.y + r.h)) < m) e.b = 1;
    return Object.keys(e).length ? e : null;
}
/* take one tile out of the rugs on a floor: a rug is cut into the rectangles left around it */
function cutRugTile(l, X, Y) {
    const hit = (l.rugs || []).filter(r => X >= r.x0 && X < r.x1 && Y >= r.y0 && Y < r.y1);
    if (!hit.length) return false;
    for (const r of hit) {
        const keep = [{ ...r, x1: X }, { ...r, x0: X + 1 }, { ...r, x0: X, x1: X + 1, y1: Y }, { ...r, x0: X, x1: X + 1, y0: Y + 1 }].filter(q => q.x1 > q.x0 && q.y1 > q.y0);
        l.rugs.splice(l.rugs.indexOf(r), 1, ...keep);
    }
    if (selected && selected.type === "rug") select(null);
    return true;
}
const rugTileAt = (px, py) => { const [fx, fy] = tileIn(level, px, py); return [Math.floor(fx), Math.floor(fy)]; };
/* Rubbing out rugs with the right button, like a brush. One stroke stays on the floor it started on, is one undo, and leaves no
   gaps however fast the mouse moves. The art takes a moment to redraw, so what's rubbed shows as bare floor straight away, and the
   redraw only starts when the stroke ends, so painting stays quick. */
const hasRug = (l, X, Y) => (l.rugs || []).some(r => X >= r.x0 && X < r.x1 && Y >= r.y0 && Y < r.y1);
function rugUnder(px, py) { const u = floorUnder(px, py); return u && !u[0].tiles && hasRug(u[0], u[1], u[2]) ? u : null; }
let rubbed = [], rubbedSince = null;
function rubAt(d, px, py) {
    const u = floorUnder(px, py); if (!u || u[0].tiles) return;
    if (!d.l) d.l = u[0];                                       // a stroke begun off any rug takes the first floor it crosses
    if (u[0] !== d.l || !hasRug(d.l, u[1], u[2])) return;
    if (!d.did) { snapshot(); d.did = true; }
    cutRugTile(d.l, u[1], u[2]);
    rubbed.push({ l: d.l, X: u[1], Y: u[2] }); d.painted = true;
}
function rubOut(d, px, py) {
    const x0 = d.px === undefined ? px : d.px, y0 = d.py === undefined ? py : d.py, n = Math.max(1, Math.ceil(Math.hypot(px - x0, py - y0) / 4));
    d.px = px; d.py = py;
    for (let i = 1; i <= n; i++) rubAt(d, x0 + (px - x0) * i / n, y0 + (py - y0) * i / n);
    if (d.painted) { d.painted = false; paint(); }
}
function endRub(d) { if (d.did) { rubbedSince = version; changed(); } else rubbed = []; }
/* the bare floor showing until the redraw lands */
function drawRubbed() {
    if (!rubbed.length) return;
    if (rubbedSince !== null && version !== rubbedSince) {
        const [x0, x1, y0, y1] = visibleTiles(); let ready = true;
        for (let ty = y0; ty <= y1 && ready; ty++) for (let tx = x0; tx <= x1; tx++) { if (!shownFresh(tx, ty)) { ready = false; break; } }
        if (ready) { rubbed = []; rubbedSince = null; return; }
    }
    for (const q of rubbed) quad(q.X, q.Y, q.X + 1, q.Y + 1, tileZ(q.l, q.X, q.Y), "rgba(168,128,84,.92)", null);
}
function walkPress(px, py) {
    if (openHeld) { openHeld = false; }
    if (walker && walker.busy) return;
    for (const f of liveClicks) { try { if (f(px, py)) return; } catch (err) { console.error(err); } }
    /* the open lift: a click anywhere in its doorway walks you into the cabin, not only on its floor strip (10 Nov scan, live 11) */
    { const q = liftAt(px, py); if (q && liftOpen(q)) { const S = stairLevels().list.find(L => L.stair && L.stair.lift === q); if (S) { const s0 = walkerStart(), path = graphFrom(s0.l, s0.x, s0.y, [S, ...liftPt(q, 0, -1)]); if (path) { setDoors(q, true, 20000 + path.length * MS_PER_TILE); followRoute(path, s0.here, null); return; } } } }
    { const dd = doorAtPx(px, py); if (dd && dd.d.kind === "book" && onBook(dd.l, dd.d, px, py)) { bookDoor(dd.l, dd.d); return; } }
    const u = useUnder(px, py);
    if (u && u.p.k === "water") return;                     // it takes a double-click
    { const st = seatUnder(px, py); if (st) { sitOn(st); return; } }                    // the tile you point at holds a seat
    const dh = doorAtPx(px, py); if (dh) { const st = walkerStart(); if (!(st.l === dh.l && doorFront(dh.d).some(t => t[0] === st.x && t[1] === st.y))) useDoor(dh.l, dh.d); return; }
    walkTo(px, py);
}
function walkDouble(px, py) {
    if (tool !== "walk" || !walker || walker.busy) return;
    const u = useUnder(px, py);
    if (u && u.p.k === "water") { getDrink(u); return; }
    const q = liftAt(px, py); if (q) { useLift(q); return; }
    const dd = doorAtPx(px, py); if (dd) { if (dd.d.kind === "book") { if (onBook(dd.l, dd.d, px, py)) bookDoor(dd.l, dd.d); return; } useDoor(dd.l, dd.d); }
}
/* Fingers, while walking: a tap walks, two quick taps are a double-click, a drag looks around, two fingers zoom. They never reach the mouse's handlers below. */
const fingers = new Map(); let fingerDo = null, lastTap = null, tappedAt = 0;
const isFinger = e => e.pointerType === "touch" && tool === "walk";
canvas.addEventListener("pointerdown", e => {
    if (!isFinger(e)) return;
    e.stopImmediatePropagation(); try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* it still works without */ } fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size === 1) fingerDo = { kind: "tap", sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
    else if (fingers.size === 2) { const [a, b] = [...fingers.values()]; fingerDo = { kind: "pinch", dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, zoom }; }
}, true);
canvas.addEventListener("pointermove", e => {
    if (!isFinger(e) || !fingers.has(e.pointerId)) return;
    e.stopImmediatePropagation(); fingers.set(e.pointerId, [e.clientX, e.clientY]); if (!fingerDo) return;
    if (fingerDo.kind === "pinch" && fingers.size >= 2) { const [a, b] = [...fingers.values()], z = Math.round(fingerDo.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / fingerDo.dist); if (z !== zoom) setZoom(z); return; }
    if (fingerDo.kind === "tap" && Math.hypot(e.clientX - fingerDo.sx, e.clientY - fingerDo.sy) > 10) fingerDo.kind = "pan";
    if (fingerDo.kind === "pan") { cam.x = fingerDo.cx - (e.clientX - fingerDo.sx) / zoom; cam.y = fingerDo.cy - (e.clientY - fingerDo.sy) / zoom; clampCam(); paint(); }
}, true);
const fingerUp = e => {
    if (!fingers.has(e.pointerId)) return;
    e.stopImmediatePropagation(); fingers.delete(e.pointerId);
    const was = fingerDo; if (fingers.size) { fingerDo = null; return; } fingerDo = null;
    if (e.type !== "pointerup" || !was || was.kind !== "tap") return;
    const [px, py] = toPx(e.clientX, e.clientY), now = performance.now();
    if (lastTap && now - lastTap[0] < 350 && Math.hypot(e.clientX - lastTap[1], e.clientY - lastTap[2]) < 24) { lastTap = null; tappedAt = now; walkDouble(px, py); return; }
    lastTap = [now, e.clientX, e.clientY]; walkPress(px, py);
};
canvas.addEventListener("pointerup", fingerUp, true); canvas.addEventListener("pointercancel", fingerUp, true);
canvas.addEventListener("pointerdown", e => {
    /* only the left button picks: the wheel and the right button still move the view (8 Nov 2026) */
    if (pickNext && e.button === 0 && !spaceHeld) { const [px, py] = toPx(e.clientX, e.clientY), u = floorUnder(px, py), f = pickNext; pickNext = null; e.stopImmediatePropagation(); f(u ? { level: u[0].stair ? u[0].stair.low.id : u[0].id, px, py, x: u[1], y: u[2] } : { level: level.id, px, py }); return; }
    canvas.focus(); canvas.setPointerCapture(e.pointerId);
    const [px, py] = toPx(e.clientX, e.clientY);
    if (isEdgeTool(tool) && !spaceHeld && e.button !== 1 && (e.button === 0 || edgeUnder(px, py))) { drag = { kind: "edgebrush", remove: e.button === 2 || e.ctrlKey || e.metaKey, laid: [], gone: [] }; edgeBrush(drag, px, py); return; }
    if (brushTool(tool) && e.ctrlKey) return;                   // Ctrl is for changing the height, here
    if (wallHeightKind(tool) && (e.ctrlKey || e.metaKey)) return;
    /* Ctrl raises a present or a table lamp being placed: the click with it held places it there, it never deletes what's under it (10 Nov scan, editor 3) */
    if (e.button === 0 && !spaceHeld && (e.ctrlKey || e.metaKey) && !carry && raisingNow() === "tool") { act(px, py); return; }
    if (e.button === 0 && !spaceHeld && tool !== "walk" && modClick(e, px, py)) return;
    /* right button on a rug: rub it out, in any tool. Anywhere else it still drags the view (with the rug tool, it's always the brush). */
    if (e.button === 2 && !spaceHeld && tool !== "walk" && (tool === "rug" || rugUnder(px, py))) { drag = { kind: "rubout" }; rubOut(drag, px, py); return; }
    if (tool === "select" && e.button === 0 && !spaceHeld) {
        const hit = pick(px, py);
        if (hit) { select(hit); drag = beginMove(hit, px, py); canvas.style.cursor = "move"; return; }
        select(null);
    }
    if (e.button === 1 || e.button === 2 || spaceHeld || tool === "pan" || tool === "select") { drag = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, right: e.button === 2 && tool !== "walk" && !spaceHeld }; canvas.style.cursor = "grabbing"; return; }
    if (tool === "edges") { const edge = edgeAt(px, py); if (edge) { snapshot(); drag = { kind: "edge", edge }; } return; }
    if (tool === "walk") { walkPress(px, py); return; }
    if (tool === "halfwall" || tool === "nowall" || tool === "addwall") { drag = { kind: "halfwall" }; halfBrush(drag, px, py); return; }
    if (tool === "swag") { drag = { kind: "swag" }; swagBrush(drag, px, py); return; }
    /* not on a drop (a step between floor heights): there's no wall there to hang it from, and it floated a whole wall up (9 Nov scan, renderer finding 2) */
    if (tool === "garland" || tool === "garland2" || tool === "festoon") { const w = garlandWallAt(px, py, level); if (w && w.drop) { flash("That's a step, not a wall: hang it on a wall."); return; } }
    if (tool === "garland" || tool === "garland2") { const w = garlandWallAt(px, py, level); if (!w) return; const t = wallTile(w); if (tool === "garland2") { snapshot(); const g = { axis: w.axis, line: w.line, a: t, b: t + 2 }; (level.garlands = level.garlands || []).push(g); changed(); select({ type: "garland", l: level, o: g }); return; } drag = { kind: "garland", axis: w.axis, line: w.line, t0: t }; window.HallwayGarland.draft = { l: level, axis: w.axis, line: w.line, a: t, b: t + 1 }; paint(); return; }
    if (tool === "festoon") { const w = garlandWallAt(px, py, level); if (!w) return; const t = wallTile(w); drag = { kind: "festoon", axis: w.axis, line: w.line, t0: t, t1: t }; window.HallwayFestoon.draft = { l: level, axis: w.axis, line: w.line, a: t, b: t + 1, h: 118, colour: lastFestoon.colour, twinkle: lastFestoon.twinkle }; paint(); return; }
    if (tool === "steps") {
        const f = tileIn(level, px, py), edge = heightEdgeAt(level, f[0], f[1]);
        if (!edge) { flash("Steps go where two heights meet. Set a floor's height first, with Floor height."); return; }
        drag = { kind: "laysteps", edge, st: { axis: edge.axis, line: edge.line, dir: edge.dir, a: edge.t, b: edge.t + 1 } }; paint(); return;
    }
    if (tool === "floor" || tool === "erase" || tool === "rug" || tool === "smallfloor" || tool === "height" || tool === "floorlift") {
        const a = tool === "floor" ? paintTile(px, py) : tileIn(level, px, py);
        /* a floor X is hiding: nothing to start on (10 Nov 2026: the drag ran out to a million tiles away and the page locked up) */
        if (hiddenTile(a)) { flash("That floor is hidden while X is held. Let go of X, or scroll to show it."); return; }
        const zr = hasFloor(level, Math.floor(a[0]), Math.floor(a[1])) ? tileZ(level, Math.floor(a[0]), Math.floor(a[1])) : levelZ(level) + (tool === "floor" ? heightBrush : 0);
        drag = { kind: "rect", a, z: zr, rect: snapRect(a, a) }; paint(); return;
    }
    if (Parts.ROWS[tool]) {
        const a = furniTile(px, py);
        if (placeable(level, a[0], a[1])) { drag = { kind: "furni", a, run: furniRun(a, a) }; paint(); }
        return;
    }
    act(px, py);
});
canvas.addEventListener("pointermove", e => {
    const [px, py] = toPx(e.clientX, e.clientY);
    lastMouse = [px, py]; lastClient = [e.clientX, e.clientY]; ctrlNow = e.ctrlKey || e.metaKey;
    /* raising with Ctrl: the thing stays on the tile it started on, however far the mouse goes (9 Nov 2026, his: it moved to another tile, so a lamp couldn't go very high) */
    if (ctrlNow && raisingNow()) return;
    if (drag && drag.kind === "pan") { cam.x = drag.cx - (e.clientX - drag.sx) / zoom; cam.y = drag.cy - (e.clientY - drag.sy) / zoom; clampCam(); paint(); return; }
    if (carry && !drag) {
        const f = tileIn(level, px, py), X = Math.floor(f[0]), Y = Math.floor(f[1]);
        hover = { l: level, tile: hasFloor(level, X, Y) ? [X, Y] : null }; $("st-where").textContent = hover.tile ? `${level.name}, tile ${X}, ${Y}` : ""; $("st-hover").textContent = PROP_NAMES[carry.p.k] || (carry.tele ? "Imperial Teleport" : ""); paint(); return;      // the status follows the carried piece (10 Nov scan, editor 26)
    }
    if (drag && drag.kind === "rubout") { rubOut(drag, px, py); return; }
    if (drag && drag.kind === "halfwall") { halfBrush(drag, px, py); return; }
    if (drag && drag.kind === "swag") { swagBrush(drag, px, py); return; }
    if (drag && drag.kind === "garland") { const w = garlandWallAt(px, py, level); if (w && !w.drop && w.axis === drag.axis && w.line === drag.line) { const t1 = wallTile(w), dr = window.HallwayGarland.draft; dr.a = Math.min(drag.t0, t1); dr.b = Math.max(drag.t0, t1) + 1; paint(); } return; }
    if (drag && drag.kind === "festoon") { const w = garlandWallAt(px, py, level); if (w && !w.drop && w.axis === drag.axis && w.line === drag.line) { drag.t1 = wallTile(w); const dr = window.HallwayFestoon.draft; dr.a = Math.min(drag.t0, drag.t1); dr.b = Math.max(drag.t0, drag.t1) + 1; paint(); } return; }
    if (drag && drag.kind === "edgebrush") { edgeBrush(drag, px, py); return; }
    if (drag && drag.kind === "move") { moveSelected(drag, px, py); return; }
    if (!drag && (tool === "select" || tool === "walk")) {
        const u = floorUnder(px, py);
        hover = u ? { l: u[0], tile: [u[1], u[2]] } : null;
        $("st-where").textContent = u ? `${u[0].name}, tile ${u[1]}, ${u[2]}` : "";
        if (tool === "select") {
            const hit = pick(px, py);
            const sb = selected && selected.type === "sign" ? signBox(selected.l, selected.o) : null, side = sb && handleAt(sb, px, py);
            canvas.style.cursor = side ? (side === "l" || side === "r" ? "ew-resize" : "ns-resize") : hit ? "move" : "default";
            $("st-hover").textContent = !hit ? "" : hit.type === "sign" ? (hit.o.kind ? stairSignName(hit.o) : doorName(hit.o) || "Sign") : hit.type === "door" ? (hit.o.spare ? "Spare door" : (doorName(hit.o) || "Door with no maze yet")) : hit.type === "prop" ? (PROP_NAMES[hit.o.k] || "") : TYPE_NAMES[hit.type];
        } else { const w2 = useUnder(px, py), water = !!w2 && w2.p.k === "water"; $("st-hover").textContent = water ? "Double-click for a drink" : ""; canvas.style.cursor = water ? "pointer" : ""; }
        paint(); return;
    }
    if (drag && drag.kind === "edge") {
        /* never closer together than one screen (a page at 2x, as the Map tab counts them): past the other edge gave a negative size (15 Nov scan, editor 13) */
        const r = map.rect, MW = 720, MH = 387;
        if (drag.edge.l) { const x1 = r.x + r.w; r.x = Math.min(Math.round(px), x1 - MW); r.w = x1 - r.x; }
        if (drag.edge.r) r.w = Math.max(MW, Math.round(px) - r.x);
        if (drag.edge.t) { const y1 = r.y + r.h; r.y = Math.min(Math.round(py), y1 - MH); r.h = y1 - r.y; }
        if (drag.edge.b) r.h = Math.max(MH, Math.round(py) - r.y);
        showMapInfo(); paint(); return;
    }
    if (drag && drag.kind === "furni") { drag.run = furniRun(drag.a, furniTile(px, py)); paint(); return; }
    if (drag && drag.kind === "laysteps") {
        const f = tileIn(level, px, py), run = edgeRun(level, drag.edge.axis, drag.edge.line, drag.edge.t), t = Math.max(run.a, Math.min(run.b - 1, Math.floor(drag.edge.axis === "y" ? f[0] : f[1])));
        drag.st.a = Math.min(drag.edge.t, t); drag.st.b = Math.max(drag.edge.t, t) + 1; drag.st2 = stepsRoundCorner(level, drag.edge, run, f); paint(); return;
    }
    if (drag && drag.kind === "rect" && brushTool(tool) && e.ctrlKey) return;
    if (drag && drag.kind === "rect") { const b = tool === "floor" ? paintTile(px, py) : tileIn(level, px, py); if (!hiddenTile(b)) drag.rect = snapRect(drag.a, b); paint(); return; }      // over a floor X hides: the rectangle stays as it was
    if (level && tool !== "pan" && tool !== "walk" && tool !== "edges") {
        const wallTool = ["entrance", "theatre", "tunnel", "door", "sconce", "globelight", "lift", "stair", "turn", "side", "sideturn", "halfwall", "nowall", "addwall", "swag", "festoon", "garland", "garland2"].includes(tool) || tool === "del" || isWallItemTool(tool);
        const [fx, fy] = tileIn(level, px, py);
        if (isWallItemTool(tool)) hoverPx = [px, py];
        const onFloor = hasFloor(level, Math.floor(fx), Math.floor(fy));
        if (isEdgeTool(tool)) { hover = { l: level, edges: edgesNear(px, py) }; paint(); return; }
        if (tool === "steps") { hover = { l: level, edge: heightEdgeAt(level, fx, fy) }; paint(); return; }
        if (brushTool(tool) && e.ctrlKey && heightHold) { paint(); return; }
        if (wallHeightKind(tool) && (e.ctrlKey || e.metaKey) && hover) { paint(); return; }
        if (tool === "floor") { const a = paintTile(px, py); hover = { l: level, tile: [Math.floor(a[0]), Math.floor(a[1])] }; paint(); return; }
        hover = wallTool ? { l: level, wall: isWallItemTool(tool) || tool === "sconce" || tool === "globelight" ? hangWallAt(px, py, level) : wallAt(px, py, level, tool === "halfwall" || tool === "nowall"), tile: tool === "del" && onFloor ? [Math.floor(fx), Math.floor(fy)] : null } : { l: level, tile: placingNow() && landingOf(level, ...furniTile(px, py)) ? furniTile(px, py) : onFloor ? [Math.floor(fx), Math.floor(fy)] : null };
        paint();
    }
});
/* Esc in the middle of a drag (15 Nov scan, editor 12): what it moved goes back, a rectangle or run being dragged out is dropped. The brushes,
   which paint as they go, finish where they are, as changing tool finishes them. */
function cancelDrag() {
    const d = drag; if (!d) return;
    if (["rubout", "halfwall", "swag", "edgebrush"].includes(d.kind)) { if (lastClient) canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: lastClient[0], clientY: lastClient[1], bubbles: true, pointerId: 1 })); drag = null; return; }
    drag = null;
    if (d.kind === "garland" && window.HallwayGarland) window.HallwayGarland.draft = null;
    if (d.kind === "festoon" && window.HallwayFestoon) window.HallwayFestoon.draft = null;
    if (d.kind === "move") {
        canvas.style.cursor = "default"; if (live) live.ending = true;
        if (d.moved && undoStack[undoStack.length - 1] === d.before) { parked = null; undoStack.pop(); restore(d.before); flash("Put back where it was."); return; }
    }
    if (d.kind === "edge") { if (undoStack[undoStack.length - 1] === JSON.stringify(root)) dropSnapshot(); else { const pk = parked; parked = null; restore(undoStack.pop()); if (pk) redoStack.push(...pk.redo); syncButtons(); } showMapInfo(); return; }
    paint();
}
canvas.addEventListener("pointerup", e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === "pan") {
        canvas.style.cursor = tool === "pan" ? "grab" : tool === "select" ? "default" : tool === "walk" ? "pointer" : "crosshair"; followNow();
        return;
    }
    if (d.kind === "move" && d.ctrlDelete && !d.moved) { deleteSelected(); return; }
    if (d.kind === "rubout") { endRub(d); return; }
    if (d.kind === "halfwall") { endHalfBrush(d); return; }
    if (d.kind === "swag") { if (d.did) changed(); return; }
    if (d.kind === "garland") { const dr = window.HallwayGarland.draft; window.HallwayGarland.draft = null; if (dr) { snapshot(); const g = { axis: dr.axis, line: dr.line, a: dr.a, b: dr.b }; (level.garlands = level.garlands || []).push(g); changed(); select({ type: "garland", l: level, o: g }); } paint(); return; }
    if (d.kind === "festoon") { const dr = window.HallwayFestoon.draft; window.HallwayFestoon.draft = null; if (dr) { snapshot(); const f = { axis: dr.axis, line: dr.line, a: dr.a, b: dr.b, h: dr.h }; if (dr.colour && dr.colour !== "amber") f.colour = dr.colour; if (dr.twinkle) f.twinkle = true; (level.festoons = level.festoons || []).push(f); changed(); select({ type: "festoon", l: level, o: f }); } paint(); return; }
    if (d.kind === "edgebrush") { endEdgeBrush(d); return; }
    if (d.kind === "laysteps") {
        snapshot();
        for (const st of d.st2 ? [d.st2.first, d.st2.st] : [d.st]) {
            level.steps = (level.steps || []).filter(q => !(q.axis === st.axis && q.line === st.line && q.a < st.b && q.b > st.a));
            level.steps.push({ ...st });
        }
        /* laid end to end along one edge, two runs are one: the renderer draws them as one anyway, and one run selects and moves as one */
        for (let i = 0; i < level.steps.length; i++) for (let j = level.steps.length - 1; j > i; j--) {
            const p = level.steps[i], q = level.steps[j];
            if (p.axis === q.axis && p.line === q.line && p.dir === q.dir && (p.b === q.a || q.b === p.a) && stepRise(level, p) === stepRise(level, q)) { p.a = Math.min(p.a, q.a); p.b = Math.max(p.b, q.b); level.steps.splice(j, 1); j = level.steps.length; }
        }
        changed(); return;
    }
    if (d.kind === "move") { canvas.style.cursor = "default"; if (live) live.ending = true; if (d.moved) { if (d.hit.type === "prop" || d.hit.type === "tele") showUntilDrawn(d.hit.l, d.hit.o, d.hit.type === "tele"); changed(); select(selected); } return; }
    if (d.kind === "edge") { if (undoStack[undoStack.length - 1] === JSON.stringify(root)) { dropSnapshot(); return; } changed(); return; }
    if (d.kind === "furni") { placeRot = d.run.rot || 0; placeRun(d.run); return; }
    if (d.kind === "rect") {
        const r = d.rect;
        snapshot();
        const unchanged = () => { if (undoStack[undoStack.length - 1] !== JSON.stringify(root)) return false; dropSnapshot(); paint(); return true; };
        /* the floor alone, its walls left where they stand */
        if (tool === "floorlift") {
            let changedAny = false, locked = false;
            for (let x = r.x0; x < r.x1; x += 2) for (let y = r.y0; y < r.y1; y += 2) {
                if (!hasFloor(level, x, y)) continue;
                let stuck = false; for (let a = x; a < x + 2 && !stuck; a++) for (let b = y; b < y + 2 && !stuck; b++) if (heightLocked(level, a, b)) stuck = true;
                if (stuck && heightBrush) { locked = true; continue; }
                /* the height shown is where the floor ends up, as the preview draws it, not a lift on top of a sunken or raised part
                   (9 Nov 2026, his: "+40 px" on a -64 part came out at -24, and then said it was already raised that much) */
                const k = cellKey(x, y), rise = (level.rise && level.rise[k]) || 0, now = (level.floorLift && level.floorLift[k]) || 0, want = heightBrush - rise; if (now === want) continue;
                (level.floorLift = level.floorLift || {})[k] = want; changedAny = true;
            }
            tidyHeights(level);
            if (!changedAny) { dropSnapshot(); flash(locked ? "Stairs and the lift have to stay level with the floor round them." : "That floor's already at that height."); paint(); return; }
            if (locked) flash("Left the floor round the stairs and lift as it was, so they still meet it.");
            changed(); return;
        }
        if (tool === "height") {
            let changedAny = false, locked = false;
            for (let x = r.x0; x < r.x1; x += 2) for (let y = r.y0; y < r.y1; y += 2) {
                if (!hasFloor(level, x, y)) continue;
                let stuck = false; for (let a = x; a < x + 2 && !stuck; a++) for (let b = y; b < y + 2 && !stuck; b++) if (heightLocked(level, a, b)) stuck = true;
                if (stuck && heightBrush) { locked = true; continue; }
                const k = cellKey(x, y), rise = (level.rise && level.rise[k]) || 0, lifted = !!(level.floorLift && level.floorLift[k]);
                if (heightAt(level, x, y) === heightBrush && (!lifted || rise === heightBrush)) continue;
                /* floor and walls together, to exactly the height set: a floor-only lift left on the cell was added on top, so it
                   wouldn't come down (9 Nov 2026, his: "it raises them, but won't lower") */
                (level.rise = level.rise || {})[k] = heightBrush; if (lifted) delete level.floorLift[k]; changedAny = true;
            }
            tidyHeights(level);
            if (!changedAny) { dropSnapshot(); flash(locked ? "Stairs and the lift have to stay level with the floor round them." : "That floor's already at that height."); paint(); return; }
            if (locked) flash("Left the floor round the stairs and lift level, so they still meet it.");
            changed(); return;
        }
        /* laid, and that is all: it used to fall through into the floor loop below, which took the floor away (8 Nov) */
        /* only on the floor at the height the drag began on, never over a higher or lower one beside it (10 Nov 2026, his): row runs of
           that floor inside the rectangle, joined downwards where they line up */
        if (tool === "smallfloor") {
            const on = (x, y) => hasFloor(level, x, y) && tileZ(level, x, y) === d.z && !seeHidden(level, heightAt(level, x, y)), pieces = [];
            for (let y = r.y0; y < r.y1; y++) { let s = -1; for (let x = r.x0; x <= r.x1; x++) { if (x < r.x1 && on(x, y)) { if (s < 0) s = x; continue; } if (s < 0) continue;
                const up = pieces.find(q => q.x0 === s && q.x1 === x && q.y1 === y); if (up) up.y1 = y + 1; else pieces.push({ x0: s, x1: x, y0: y, y1: y + 1, style: "small" }); s = -1; } }
            if (!pieces.length) { dropSnapshot(); flash("The small squares go on the floor you start the drag on."); paint(); return; }
            level.rugs = [...(level.rugs || []), ...pieces]; changed(); return;
        }
        if (tool === "rug") { if (r.x1 - r.x0 >= 2 && r.y1 - r.y0 >= 2) level.rugs = [...(level.rugs || []), { ...r, alongY: r.y1 - r.y0 > r.x1 - r.x0 }]; else { dropSnapshot(); flash("Rugs need to be at least 2 tiles each way."); paint(); return; } }
        else for (let x = r.x0; x < r.x1; x += 2) for (let y = r.y0; y < r.y1; y += 2) {
            const k = (x / 2) + "," + (y / 2);
            if (tool === "floor") {
                const fresh = !cells(level).has(k); if (fresh) { level.cells.push(k); cells(level).add(k); }
                if (fresh || heightBrush) { let stuck = false; for (let a = x; a < x + 2 && !stuck; a++) for (let b = y; b < y + 2 && !stuck; b++) if (heightLocked(level, a, b)) stuck = true; if (!stuck || !heightBrush) (level.rise = level.rise || {})[k] = heightBrush; }
            }
            else { const i = level.cells.indexOf(k); if (i >= 0) level.cells.splice(i, 1); }
        }
        if (tool === "floor") { cellSets = new Map(); tidyHeights(level); if (unchanged()) return; }
        if (tool === "erase") {
            cellSets = new Map(); tidyHeights(level); pruneOffFloor(level);
            level.props = (level.props || []).filter(p => Parts.tiles(p).every(t => hasFloor(level, t[0], t[1]))); level.teles = (level.teles || []).filter(p => hasFloor(level, p.x, p.y));
            map.stairs = map.stairs.filter(s => { if (s.low !== level.id) return true; for (let t = s.a; t < s.b; t++) if (!(thruLeft(s) ? hasFloor(level, s.x, t) : hasFloor(level, t, s.y))) return false; return true; });
            map.stairs = map.stairs.filter(s => { if (s.up !== level.id && s.low !== level.id) return true; if (s.low === level.id) return thruLeft(s) ? hasFloor(level, s.x, s.a) : hasFloor(level, s.a, s.y); return thruLeft(s) ? hasFloor(level, s.x - 2, s.a) : hasFloor(level, s.a, s.y - 2); });
            tidyAfterStairs();
        }
        changed();
    }
});
canvas.addEventListener("dblclick", e => {
    if (performance.now() - tappedAt < 600) return;           // fingers have done this already
    const [px, py] = toPx(e.clientX, e.clientY); walkDouble(px, py);
});
canvas.addEventListener("pointermove", e => {
    const kind = wallHeightKind(tool);
    { const lampNow = raisingNow();
      if (lampNow && (e.ctrlKey || e.metaKey)) { if (lampCtrlLast === null) { lampCtrlLast = e.clientY; return; } const n = Math.trunc((lampCtrlLast - e.clientY) / 4); if (!n) return; lampCtrlLast -= n * 4; const o = lampNow === "carry" ? carry.p : lampNow === "drag" ? selected.o : null, now = o ? (o.z || 0) : (tableLampZ !== null ? tableLampZ : (hover && hover.tile ? raiseZAt(level, hover.tile[0], hover.tile[1], tool) : 0)), v = Math.max(0, Math.min(120, now + n)); if (o) { o.z = v; if (!v) delete o.z; if (lampNow === "drag") drag.moved = true; } else tableLampZ = v; setStatus("Height: " + v); paint(); return; }
      if (!(e.ctrlKey || e.metaKey)) lampCtrlLast = null; }
    if (!kind || !(e.ctrlKey || e.metaKey) || drag) { wallCtrlLast = null; wallCtrlSpare = 0; return; }
    if (wallCtrlLast === null) { wallCtrlLast = e.clientY; return; }
    wallCtrlSpare += wallCtrlLast - e.clientY; wallCtrlLast = e.clientY;
    const n = Math.trunc(wallCtrlSpare / 5); if (n) { wallCtrlSpare -= n * 5; const v = snapWall(wallH[kind] + n * WALL_STEP, kind); if (v !== wallH[kind]) { wallH[kind] = v; if (kind === "item" && isWallItemTool(tool)) itemHeights[tool.slice(3)] = v; setStatus("Height on the wall: " + v); } paint(); }
});
canvas.addEventListener("pointerleave", () => { if (!drag && hover) { hover = null; paint(); } });
canvas.addEventListener("pointermove", e => {
    if (!brushTool(tool) || !e.ctrlKey) { ctrlLast = null; ctrlSpare = 0; heightHold = null; return; }
    if (ctrlLast === null) { ctrlLast = e.clientY; heightHold = hover && hover.tile; return; }
    ctrlSpare += ctrlLast - e.clientY; ctrlLast = e.clientY;
    const n = Math.trunc(ctrlSpare / 5); if (n) { ctrlSpare -= n * 5; setBrush(heightBrush + n * STEP_R); }
});
canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("pointercancel", () => { if (drag && drag.kind === "rubout") { const d = drag; drag = null; endRub(d); } if (drag && drag.kind === "halfwall") { const d = drag; drag = null; endHalfBrush(d); } });
/* A zoom step per mouse notch (100 of deltaY, or 3 lines; a step once half that has added up), at most one every 150 ms: a trackpad's stream of small scrolls (and a pinch, as
   ctrl+wheel) added up instead of each being a whole step, which threw the zoom from one end to the other (15 Nov scan, live M7) */
let wheelSum = 0, wheelAt = 0, wheelStepAt = 0;
canvas.addEventListener("wheel", e => { e.preventDefault(); if (seeCut !== null) { const all = allHeights(level), i = all.indexOf(seeCut), n = Math.max(0, Math.min(all.length - 1, i + (e.deltaY > 0 ? 1 : -1))); setCut(all[n]); return; }
    const now = performance.now(), dy = e.deltaY * (e.deltaMode === 1 ? 100 / 3 : e.deltaMode === 2 ? 100 : 1);
    if (now - wheelAt > 400 || Math.sign(dy) !== Math.sign(wheelSum)) wheelSum = 0; wheelAt = now; wheelSum += dy;
    if (Math.abs(wheelSum) < 50 || now - wheelStepAt < 150) return;      // half a notch: a notch reads less than 100 on a scaled screen
    const up = wheelSum < 0; wheelSum = 0; wheelStepAt = now; setZoom(zoom + (up ? 1 : -1), e.clientX, e.clientY); }, { passive: false });
/* How far the camera may go: the map's edges (the Map edges tool), which is also as far as the published picture goes, so the view never shows past it.
   8 Nov 2026: growing it to every floor's tiles showed black beyond the edges (his: "this shouldn't be possible"). Tiles outside the edges are the map's to fix: the Problems tab names them. */
function camRect() { return map && map.rect ? map.rect : null; }
function clampCam() {
    if (tool !== "walk" || !map.rect) return;
    const r = camRect(), hw = canvas.width / zoom / 2, hh = canvas.height / zoom / 2;
    cam.x = r.w <= hw * 2 ? r.x + r.w / 2 : Math.max(r.x + hw, Math.min(r.x + r.w - hw, cam.x));
    cam.y = r.h <= hh * 2 ? r.y + r.h / 2 : Math.max(r.y + hh, Math.min(r.y + r.h - hh, cam.y));
}

/* ---------- walking: every tile of every floor, joined by the stairs ---------- */
const nodeKey = (l, x, y) => l.id + "|" + x + "|" + y;
function solid(l) {
    const s = new Set();
    for (const p of (l.props || [])) { if (p.k.startsWith("mark_") || (p.k === "rope" && p.night && realNight()) || (tool === "walk" && !window.hallwayXmas && XMAS_PROP(p.k))) continue; if (p.k === "archway") { for (const t of archPosts(l, p)) s.add(t[0] + "," + t[1]); continue; } for (const t of Parts.tiles(p)) s.add(t[0] + "," + t[1]); }   // scuffs and a lifted tile are only marks on the floor
    for (const t of (l.teles || [])) s.add(t.x + "," + t.y);
    if (window.hallwayXmas) for (const p of (l.props || [])) if (p.k === "statue") treeKeepOut(p, (x, y) => s.add(x + "," + y));
    return s;
}
/* Every flight is a little floor of its own, each tile at its own height: walked, clicked and shown with the
   tile selector like any other. They're rebuilt whenever the map changes. */
let stairMemo = null;
const nodeZ = (l, x, y) => l.tiles ? l.tiles.get(x + "," + y) : tileZ(l, x, y) + stepLift(l, x, y);
function stairLevels() {
    const memoKey = JSON.stringify([map.stairs, map.lifts, map.entrance, map.tunnels, map.levels.map(l => [(l.doors || []).map(d => [d.axis, d.at, d.line, !!d.spare, !!d.to]), (l.wallItems || []).filter(q => q.k === "i_desk").map(q => [q.axis, q.at, q.line])])]);
    if (stairMemo && stairMemo.cs === cellSets && stairMemo.stairs === map.stairs && stairMemo.json === memoKey) return stairMemo;
    const out = [], links = new Map(), slots = new Map(), byName = new Map();
    const link = (a, ax, ay, c, cx, cy) => {
        const add = (p, px2, py2, q, qx, qy) => { const k = nodeKey(p, px2, py2); if (!links.has(k)) links.set(k, []); links.get(k).push({ l: q, x: qx, y: qy, dx: qx - px2, dy: qy - py2 }); };
        add(a, ax, ay, c, cx, cy); add(c, cx, cy, a, ax, ay);
    };
    map.stairs.forEach((st, i) => {
        const low = byId(st.low), up = byId(st.up); if (!low || !up) return;
        const lz = levelZ(low), tiles = new Map(), S = { id: "S" + i, name: `Stairs up to ${up.name}`, k: low.k, tiles, stair: { st, low, up } };
        const put = (x, y, z) => tiles.set(x + "," + y, z);
        if (st.kind === "side") {
            for (let x = st.x - 10; x < st.x; x++) for (let y = st.a; y < st.b; y++) put(x, y, lz + 16 * (st.x - (x + .5)));
            for (let y = st.a; y < st.b; y++) { link(S, st.x - 1, y, low, st.x, y); link(S, st.x - 10, y, up, st.x - 11, y); }
        } else if (st.kind === "sideturn") {
            const X = st.x;
            for (let y = st.a; y < st.b; y++) { for (let x = X - 6; x < X; x++) put(x, y, lz + 16 * (X - (x + .5))); for (let x = X - 10; x < X - 6; x++) put(x, y, lz + 96); }
            for (let y = st.a - 4; y < st.a; y++) for (let x = X - 10; x < X - 6; x++) put(x, y, lz + 96 + 16 * (st.a - (y + .5)));
            for (let y = st.a; y < st.b; y++) link(S, X - 1, y, low, X, y);
            for (let x = X - 10; x < X - 6; x++) link(S, x, st.a - 4, up, x, st.a - 5);
        } else if (st.kind === "turn") {
            const Y = st.y;
            for (let x = st.a; x < st.b; x++) { for (let y = Y - 6; y < Y; y++) put(x, y, lz + 16 * (Y - (y + .5))); for (let y = Y - 10; y < Y - 6; y++) put(x, y, lz + 96); }
            for (let x = st.a - 4; x < st.a; x++) for (let y = Y - 10; y < Y - 6; y++) put(x, y, lz + 96 + 16 * (st.a - (x + .5)));
            for (let x = st.a; x < st.b; x++) link(S, x, Y - 1, low, x, Y);
            for (let y = Y - 10; y < Y - 6; y++) link(S, st.a - 4, y, up, st.a - 5, y);
        } else {
            const Y = st.y;
            for (let x = st.a; x < st.b; x++) { for (let y = Y - 10; y < Y; y++) put(x, y, lz + 16 * (Y - (y + .5))); link(S, x, Y - 1, low, x, Y); link(S, x, Y - 10, up, x, Y - 11); }
        }
        if (!slots.has(low)) slots.set(low, new Set());
        for (const k of tiles.keys()) slots.get(low).add(k);
        S.nearestFirst = [...tiles.entries()].map(([k, z]) => { const [x, y] = k.split(",").map(Number); return { x, y, z }; }).sort((p, q) => q.z - p.z || (q.x + q.y) - (p.x + p.y));
        out.push(S); byName.set(S.id, S);
    });
    /* a lift's floor, and the floor inside the entrance: little floors of their own, walked onto from the floor in front */
    const addRoom = (S, low, tilesList, joins) => {
        for (const [x, y] of tilesList) S.tiles.set(x + "," + y, tileZ(low, joins[0][2], joins[0][3]));
        for (const [ax, ay, bx, by] of joins) link(S, ax, ay, low, bx, by);
        if (!slots.has(low)) slots.set(low, new Set()); for (const k of S.tiles.keys()) slots.get(low).add(k);
        S.nearestFirst = [...S.tiles.entries()].map(([k, z]) => { const [x, y] = k.split(",").map(Number); return { x, y, z }; }).sort((p, q) => (q.x + q.y) - (p.x + p.y));
        out.push(S); byName.set(S.id, S);
    };
    map.lifts.forEach((q, i) => {
        const low = byId(q.level); if (!low) return;
        const S = { id: "LF" + i, name: "Lift", k: low.k, tiles: new Map(), stair: { low, up: null, lift: q } }, list = [], joins = [];
        /* from this angle the cabin runs away up and to the right, behind the door frame: only these tiles can be seen through the doorway */
        list.push(liftPt(q, 0, -1), liftPt(q, 1, -1), liftPt(q, 0, -2));      // on a left wall the same, mirrored: away up and to the left
        joins.push([...liftPt(q, 0, -1), ...liftPt(q, 0, 0)], [...liftPt(q, 1, -1), ...liftPt(q, 1, 0)]);
        addRoom(S, low, list, joins);
    });
    if (map.entrance && byId(map.entrance.level)) {
        const e = map.entrance, low = byId(e.level), S = { id: "EN", name: "Entrance", k: low.k, tiles: new Map(), stair: { low, up: null, entrance: true } }, list = [], joins = [];
        /* three deep: you arrive from the third row, out of sight until Go (14 Nov 2026, his); you still leave on reaching the second */
        for (const t of entranceTiles(e)) for (let d = 1; d <= 3; d++) { list.push(e.axis === "x" ? [t, e.line - d] : [e.line - d, t]); if (d === 1) joins.push(e.axis === "x" ? [t, e.line - 1, t, e.line] : [e.line - 1, t, e.line, t]); }
        addRoom(S, low, list, joins);
    }
    /* the inside of each tunnel, three tiles across and two deep, walked onto from the floor in front (10 Nov 2026) */
    (map.tunnels || []).forEach((q, i) => {
        const low = byId(q.level); if (!low) return;
        const S = { id: "TN" + i, name: "Tunnel", k: low.k, tiles: new Map(), stair: { low, up: null, tunnel: q } }, list = [], joins = [];
        for (const t of entranceTiles(q)) for (let d = 1; d <= 2; d++) { list.push(q.axis === "x" ? [t, q.line - d] : [q.line - d, t]); if (d === 1) joins.push(q.axis === "x" ? [t, q.line - 1, t, q.line] : [q.line - 1, t, q.line, t]); }
        /* only where there's floor in front to come in from */
        if (joins.some(j => hasFloor(low, j[2], j[3]))) addRoom(S, low, list, joins.filter(j => hasFloor(low, j[2], j[3])));
    });
    /* behind every maze's door: two tiles wide, deep enough for the wall beside it to hide you, the first of its room's floor. No slots: the floor behind a wall isn't taken */
    for (const low of map.levels) (low.doors || []).forEach((d, i) => {
        if (d.spare && !d.to) return;
        const fr = doorFront(d), S = { id: "DR" + low.id + "-" + i, name: "Door", k: low.k, tiles: new Map(), stair: { low, up: null, door: d } }, z = tileZ(low, fr[0][0], fr[0][1]);
        for (const t of fr) for (let k = 1; k <= DOOR_DEEP; k++) S.tiles.set(d.axis === "x" ? t[0] + "," + (d.line - k) : (d.line - k) + "," + t[1], z);
        for (const t of fr) { if (d.axis === "x") link(S, t[0], d.line - 1, low, t[0], t[1]); else link(S, d.line - 1, t[1], low, t[0], t[1]); }
        S.nearestFirst = [...S.tiles.entries()].map(([k, zz]) => { const [x, y] = k.split(",").map(Number); return { x, y, z: zz }; }).sort((p, q) => (q.x + q.y) - (p.x + p.y));
        out.push(S); byName.set(S.id, S);
    });
    /* behind the Lost Property counter: in by the gap at one end and along behind it, walked like the way through a door */
    for (const low of map.levels) (low.wallItems || []).forEach((q, i) => {
        if (q.k !== "i_desk") return; const dfn = WALL_ITEMS.find(w => w.id === q.k); if (!dfn) return;
        const o = Math.round(q.at - (dfn.snapAt || 0)), tile = (back, along) => q.axis === "y" ? [q.line - back, o + along] : [o + along, q.line - back], gap = tile(0, 5);
        const S = { id: "LP" + low.id + "-" + i, name: "Lost Property", k: low.k, tiles: new Map(), stair: { low, up: null, lost: { axis: q.axis, line: q.line, o } } }, z = tileZ(low, gap[0], gap[1]);
        S.tiles.set(tile(1, 5) + "", z); for (let a = 2; a <= 5; a++) S.tiles.set(tile(2, a) + "", z);
        const first = tile(1, 5); link(S, first[0], first[1], low, gap[0], gap[1]);
        S.nearestFirst = [...S.tiles.entries()].map(([k, zz]) => { const [x, y] = k.split(",").map(Number); return { x, y, z: zz }; }).sort((p, r) => (r.x + r.y) - (p.x + p.y));
        out.push(S); byName.set(S.id, S);
    });
    stairMemo = { cs: cellSets, stairs: map.stairs, json: memoKey, list: out, links, slots, byName };
    return stairMemo;
}
const nodeLevel = id => byId(id) || stairLevels().byName.get(id);
/* Habbo's eight directions, the game's own table (js/room-path.js): the index IS the facing handed
   to the sprite. Diagonals come first, so ties take the diagonal steps first, as the real client does. */
const DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }];
const STEPS = [DIRS[1], DIRS[3], DIRS[5], DIRS[7], DIRS[0], DIRS[2], DIRS[4], DIRS[6]];
function directionOf(dx, dy) { const sx = Math.sign(Math.round(dx * 100)), sy = Math.sign(Math.round(dy * 100)), i = DIRS.findIndex(d => d.dx === sx && d.dy === sy); return i; }
function walkGraph(startKey) {
    const solids = new Map(map.levels.map(l => [l, solid(l)])), holeSets = new Map(map.levels.map(l => [l, holes(l)])), M = stairLevels();
    /* the map doesn't change during one search, so each tile's height and each flight of steps is worked out once: a search of the whole
       Hallway (the Problems check, after every edit) took 370ms, nearly all of it asking the same heights again (10 Nov scan, his: "the editor
       feels slow and clunky") */
    const zc = new Map(), Z = (l, x, y) => { const k = nodeKey(l, x, y); let v = zc.get(k); if (v === undefined) { v = nodeZ(l, x, y); zc.set(k, v); } return v; };
    const flights = new Map(map.levels.map(l => [l, (l.steps || []).map(st => ({ st, f: flightOf(l, st) })).filter(q => q.f)]));
    const canStepC = (l, x, y, nx, ny) => { if (Math.abs(Z(l, x, y) - Z(l, nx, ny)) <= 1) return true; return (flights.get(l) || []).some(({ st, f }) => { const lo = Math.floor(f.from) - 1, hi = Math.ceil(f.to), inBand = (X, Y) => { const across = st.axis === "y" ? X : Y, along = st.axis === "y" ? Y : X; return across >= st.a && across < st.b && along >= lo && along <= hi; }; return inBand(x, y) && inBand(nx, ny); }); };
    const free = (l, x, y) => hasFloor(l, x, y) && !solids.get(l).has(x + "," + y) && !holeSets.get(l).some(h => inRect(h, x, y)) && !(M.slots.get(l) && M.slots.get(l).has(x + "," + y));
    /* a door's way in is behind the wall: nothing on the floor (or on a terrace behind that wall) can stand on it, so the floor's props
       don't block it. A planter behind the Hustle Maze's wall shared its tiles and the door opened onto nothing (15 Nov scan, rooms 1) */
    const stands = (l, x, y) => l.tiles ? l.tiles.has(x + "," + y) && !(l.stair && l.stair.low && !l.stair.door && solids.get(l.stair.low) && solids.get(l.stair.low).has(x + "," + y)) : (free(l, x, y) || nodeKey(l, x, y) === startKey);
    /* the tiles taken only by low things (under 40 tall), which a diagonal step may brush past */
    const lows = new Map(map.levels.map(l => { const low = new Set(), tall = new Set();
        for (const p of (l.props || [])) { const h = TALL[p.k] ? TALL[p.k][1] : 999, into = p.k !== "archway" && h < 40 ? low : tall; for (const t of Parts.tiles(p)) into.add(t[0] + "," + t[1]); }
        for (const t of (l.teles || [])) tall.add(t.x + "," + t.y);
        if (window.hallwayXmas) for (const p of (l.props || [])) if (p.k === "statue") treeKeepOut(p, (X, Y) => tall.add(X + "," + Y));
        for (const k of tall) low.delete(k); return [l, low]; }));
    /* the tile beside a diagonal step: 2 free to walk, 1 a low thing on level floor, 0 a wall, a drop, the stair's side or something tall */
    const past = (l, x, y, X, Y) => {
        if (stands(l, X, Y)) return l.tiles || canStepC(l, x, y, X, Y) ? 2 : 0;
        if (l.tiles || !hasFloor(l, X, Y) || !lows.get(l).has(X + "," + Y) || holeSets.get(l).some(h => inRect(h, X, Y)) || (M.slots.get(l) && M.slots.get(l).has(X + "," + Y))) return 0;
        return Math.abs(Z(l, x, y) - Z(l, X, Y)) <= 1 ? 1 : 0;
    };
    return (l, x, y) => {
        const out = [];
        for (const { dx, dy } of STEPS) {
            const nx = x + dx, ny = y + dy;
            if (!stands(l, nx, ny)) continue;
            /* a drop can't be walked over, only the steps */
            if (!l.tiles && !canStepC(l, x, y, nx, ny)) continue;
            if (dx && dy) {
                /* no diagonal from one step to the next: on a staircase the walk goes straight down the flight, not slantwise
                   across the treads (9 Nov 2026, his: "the vast majority of the stairs are walked diagonally"). Landings are level, so free. */
                if (Math.abs(Z(l, x, y) - Z(l, nx, ny)) > 1) continue;
                /* a corner may be cut past one low thing (a chair, a table, a rope), never past a wall, a drop, a pillar or anything
                   tall, where the Habbo slipped behind it mid-step (9 Nov, his); and never squeezed between two */
                const a = past(l, x, y, x + dx, y), b = past(l, x, y, x, y + dy);
                if (!a || !b || (a === 1 && b === 1)) continue;
            }
            out.push({ l, x: nx, y: ny, dx, dy });
        }
        for (const n of (M.links.get(nodeKey(l, x, y)) || [])) if (stands(n.l, n.x, n.y) && !(n.l.stair && n.l.stair.lift && !liftOpen(n.l.stair.lift)) && !(n.l.stair && n.l.stair.door && !doorIsOpen(n.l.stair.door))) out.push(n);
        return out;
    };
}
/* A route is measured in real distance: a straight step is 10, a diagonal 14 (it covers about 1.4 tiles).
   Counting every step as 1 made a zig-zag from wall to wall exactly as "short" as walking straight down the hall. */
const stepCost = n => n.dx && n.dy ? 14 : 10;
function graphFrom(startL, sx, sy, goal, cutOff) {
    const next = walkGraph(nodeKey(startL, sx, sy));
    /* the shortest distance to every tile, nearest first, on a little binary heap */
    const flood = (l0, x0, y0, stopAt) => {
        const dist = new Map([[nodeKey(l0, x0, y0), 0]]), heap = [[0, l0, x0, y0]];
        const push = e => { heap.push(e); for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
        const pop = () => { const top = heap[0], end = heap.pop(); if (heap.length) { heap[0] = end; for (let i = 0; ;) { const a = 2 * i + 1, c = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (c < heap.length && heap[c][0] < heap[m][0]) m = c; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
        while (heap.length) {
            const [d, l, x, y] = pop();
            if (d > dist.get(nodeKey(l, x, y))) continue;
            if (stopAt && l === stopAt[0] && x === stopAt[1] && y === stopAt[2]) break;
            for (const n of next(l, x, y)) { const k = nodeKey(n.l, n.x, n.y), nd = d + stepCost(n); if (!dist.has(k) || nd < dist.get(k)) { dist.set(k, nd); push([nd, n.l, n.x, n.y]); } }
        }
        return dist;
    };
    if (!goal) return flood(startL, sx, sy);
    /* how far every tile is from the goal; then walk downhill. Several routes can tie (three diagonals and
       seven straights, in any order), so keep going the way we're going, which leaves as few turns as it can. */
    const dist = flood(goal[0], goal[1], goal[2], [startL, sx, sy]);
    /* no way: everything that flood reached is cut off from here too, and the caller can skip it (walkTo, 15 Nov scan, live M8) */
    if (!dist.has(nodeKey(startL, sx, sy))) { if (cutOff) for (const k of dist.keys()) cutOff.add(k); return null; }
    const path = [{ key: nodeKey(startL, sx, sy) }];
    let l = startL, x = sx, y = sy, guard = 0, last = null;
    while (!(l === goal[0] && x === goal[1] && y === goal[2]) && guard++ < 5000) {
        const d = dist.get(nodeKey(l, x, y));
        let best = null, score = -1e9;
        for (const n of next(l, x, y)) {
            if (dist.get(nodeKey(n.l, n.x, n.y)) !== d - stepCost(n)) continue;
            let sc = 0;
            if (last && last.dx === n.dx && last.dy === n.dy) sc += 10;
            if (n.dx && n.dy) sc += .05;                                             // diagonals first, as the client does
            if (sc > score) { score = sc; best = n; }
        }
        if (!best) return null;
        path.push({ key: nodeKey(best.l, best.x, best.y) });
        last = best; l = best.l; x = best.x; y = best.y;
    }
    return path;
}
/* where Habbos start: the tile in front of the entrance, or failing that a lift, or any floor */
function liftTile() {
    const e = map.entrance, le = e && byId(e.level);
    if (le) { const m = entranceTiles(e)[1]; return e.axis === "x" ? [le, m, e.line] : [le, e.line, m]; }
    const q = map.lifts[0], l = q && byId(q.level); if (l) return [l, ...liftPt(q, 1, 0)];
    const g = map.levels.find(l => l.k === 0 && l.cells.length) || map.levels.find(l => l.cells.length), c = g.cells[0].split(",").map(Number); return [g, c[0] * 2, c[1] * 2];
}
/* Everywhere a Habbo can get to: on foot from where they arrive, and from any lift once they can walk to one, since any lift goes to all the
   others (9 Nov scan, content finding 10: the check walked only from the entrance with the lift doors shut, so a floor reached only by lift,
   the Basement, read as cut off). Worked out again after every change. */
let reachMemo = null;
function reachAll() {
    if (reachMemo && reachMemo.map === map && reachMemo.at === lastChangeAt) return reachMemo.set;
    const rooms0 = stairLevels().list, ins = mapNow === "gallery" ? (map.tunnels || []).filter(q => { const f = findTunnel(q.to); return f && f.place === "hallway"; }).map(q => { const S = rooms0.find(r => r.stair && r.stair.tunnel === q), m = entranceTiles(q)[1]; return S ? (q.axis === "x" ? [S, m, q.line - 2] : [S, q.line - 2, m]) : null; }).filter(Boolean) : [];
    /* the Events Gallery is arrived at by its tunnels from the Hallways (12 Nov 2026); with none yet, from its first floor as before */
    const [l, x, y] = ins[0] || liftTile(), reached = graphFrom(l, x, y); for (const s of ins.slice(1)) for (const k of graphFrom(s[0], s[1], s[2]).keys()) if (!reached.has(k)) reached.set(k, 0);
    const fronts = map.lifts.map(q => [byId(q.level), ...liftPt(q, 1, 0)]).filter(f => f[0]);
    if (fronts.some(f => reached.has(nodeKey(f[0], f[1], f[2])))) for (const f of fronts) if (!reached.has(nodeKey(f[0], f[1], f[2]))) for (const k of graphFrom(f[0], f[1], f[2]).keys()) if (!reached.has(k)) reached.set(k, 0);
    /* through tunnels: the back of one reached means the back of the one it leads to is too (10 Nov scan b, editor 6), and on until nothing new */
    const rooms = stairLevels().list, backOf = q => { const S = rooms.find(r => r.stair && r.stair.tunnel === q); if (!S) return null; const m = entranceTiles(q)[1]; return q.axis === "x" ? [S, m, q.line - 2] : [S, q.line - 2, m]; };
    for (let more = true, n = 0; more && n < 20; n++) { more = false;
        for (const q of (map.tunnels || [])) { const to = q.to && map.tunnels.find(t => t.id === q.to), a = backOf(q), b = to && backOf(to); if (!a || !b || !reached.has(nodeKey(a[0], a[1], a[2])) || reached.has(nodeKey(b[0], b[1], b[2]))) continue;
            for (const k of graphFrom(b[0], b[1], b[2]).keys()) if (!reached.has(k)) reached.set(k, 0); more = true; } }
    reachMemo = { map, at: lastChangeAt, set: reached }; return reached;
}
/* A Lost Property spot is fine if a Habbo can get to it, or, under furniture, to a free tile next to it, as live-lost.js picks it up */
function lostSpotReachable(l, x, y) {
    const reached = reachAll(), so = solid(l), hs = holes(l), sl = stairLevels().slots.get(l), free = (X, Y) => hasFloor(l, X, Y) && !so.has(X + "," + Y) && !hs.some(h => inRect(h, X, Y)) && !(sl && sl.has(X + "," + Y));
    if (free(x, y)) return reached.has(nodeKey(l, x, y));
    const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    if (AROUND.some(([i, j]) => free(x + i, y + j) && reached.has(nodeKey(l, x + i, y + j)))) return true;
    /* or from a seat beside it you can sit on (9 Nov 2026, his: "if a user can sit on a chair next to the hidden spot, the item can be picked up from there") */
    return AROUND.some(([i, j]) => seatReachable(l, x + i, y + j, reached, free));
}
/* Where you can sit down on a seat from, as sitOn does it (10 Nov scan, server finding 1: the checks allowed any side and any chain of seats,
   sitOn only these): its front, its two front diagonals and its two sides, never over its back; or through one seat beside it, from any of
   that seat's four sides. _hallway-map.js seatEntries is the same rule for the server. */
function seatEntries(u) {
    const d = STEP_OF(seatFacing(u.p)), direct = [[u.x + d.dx, u.y + d.dy], ...(d.dx ? [[u.x + d.dx, u.y - 1], [u.x + d.dx, u.y + 1], [u.x, u.y - 1], [u.x, u.y + 1]] : [[u.x - 1, u.y + d.dy], [u.x + 1, u.y + d.dy], [u.x - 1, u.y], [u.x + 1, u.y]])], via = [];
    for (const q of [[u.x - 1, u.y], [u.x + 1, u.y], [u.x, u.y - 1], [u.x, u.y + 1]]) if (seatOnTile(u.l, q[0], q[1])) via.push(...[[q[0] - 1, q[1]], [q[0] + 1, q[1]], [q[0], q[1] - 1], [q[0], q[1] + 1]]);
    return { direct, via };
}
function seatReachable(l, X, Y, reached, free) {
    const u = seatOnTile(l, X, Y); if (!u) return false; const e = seatEntries(u);
    return [...e.direct, ...e.via].some(([p, q]) => free(p, q) && reached.has(nodeKey(l, p, q)));
}
/* the seats beside a Lost Property spot under furniture with no free tile beside it: live-lost.js sits you on one to pick it up */
function lostSeatsBeside(l, x, y) { const reached = reachAll(), so = solid(l), hs = holes(l), sl = stairLevels().slots.get(l), free = (X, Y) => hasFloor(l, X, Y) && !so.has(X + "," + Y) && !hs.some(h => inRect(h, X, Y)) && !(sl && sl.has(X + "," + Y));
    return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([i, j]) => [x + i, y + j]).filter(([X, Y]) => seatReachable(l, X, Y, reached, free)); }
/* The camera. While it's following it eases toward the Habbo at a rate that doesn't depend on the
   frame rate, and if you've dragged it away it glides back the same way once you let go. */
let camRunning = false, camLast = 0, camVel = [0, 0];
const FOLLOW_MS = 240;
let camHeld = false, openHeld = false;      // openHeld: the opening view stays on the statue until you first move
const following = () => isOn("follow") && tool === "walk" && !!walker && !camHeld && !openHeld;
function camTarget() {
    const t = P(walker.x + .5, walker.y + .5, walker.z), saved = [cam.x, cam.y];
    cam.x = t[0]; cam.y = t[1] - 40; clampCam();
    const out = [cam.x, cam.y]; cam.x = saved[0]; cam.y = saved[1];
    return out;
}
function camTick(now) {
    /* stands down while you look round, by mouse or by finger (15 Nov scan, live L2: a finger's pan was pulled back while you walked) */
    if (!following() || (drag && drag.kind === "pan") || (fingerDo && fingerDo.kind !== "tap")) { camRunning = false; camVel = [0, 0]; return false; }
    const dt = Math.min(100, now - camLast) / 1000; camLast = now;
    /* A smooth damp, not a plain ease: it starts from rest and speeds up before it slows down, so coming back from somewhere you dragged it
       glides instead of leaping (9 Nov 2026, his: "the snap is really quick"). The further it has to go, the longer it takes over it; close
       by, while you walk, it keeps up as tightly as before */
    const t = camTarget(), far = Math.hypot(t[0] - cam.x, t[1] - cam.y), smooth = FOLLOW_MS / 1000 + Math.min(.45, far / 1300), om = 2 / smooth, x = om * dt, ex = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
    for (const [k, i] of [["x", 0], ["y", 1]]) { const ch = cam[k] - t[i], tmp = (camVel[i] + om * ch) * dt; camVel[i] = (camVel[i] - om * tmp) * ex; cam[k] = t[i] + (ch + tmp) * ex; }
    const settled = Math.hypot(t[0] - cam.x, t[1] - cam.y) < .5 && Math.hypot(camVel[0], camVel[1]) < 4;
    if (settled && !walker.walking) { cam.x = t[0]; cam.y = t[1]; camVel = [0, 0]; camRunning = false; paint(); return false; }
    paint();
    return true;
}
function camLoop(now) { if (camTick(now)) requestAnimationFrame(camLoop); }
function followNow() {
    if (camRunning || !following()) return;
    camRunning = true; camLast = performance.now(); requestAnimationFrame(camLoop);
}

/* which floor is under the mouse: lower floors stand in front of higher ones, so they go first */
function floorUnder(px, py) {
    const M = stairLevels();
    for (const l of [...map.levels].sort((a, c) => c.k - a.k)) {
        const [fx, fy] = tileIn(l, px, py), X = Math.floor(fx), Y = Math.floor(fy);
        /* stairs climb from this floor, so they stand nearer than it and behind the floor above */
        if (hasFloor(l, X, Y) && !holes(l).some(h => inRect(h, X, Y)) && !(M.slots.get(l) && M.slots.get(l).has(X + "," + Y))) {
            const st = stairUnder(M, l, px, py); return st || [l, X, Y];
        }
        const st = stairUnder(M, l, px, py); if (st) return st;
    }
    return null;
}
function stairUnder(M, l, px, py) {
    for (const S of M.list) {
        if (S.stair.low !== l || (S.stair.lift && !liftOpen(S.stair.lift)) || (S.stair.door && !doorIsOpen(S.stair.door))) continue;
        if (S.stair.door && !inDoorway(l, S.stair.door, px, py)) continue;
        for (const t of S.nearestFirst) { const [fx, fy] = pxToTile(px, py, t.z); if (Math.floor(fx) === t.x && Math.floor(fy) === t.y) return [S, t.x, t.y]; }
    }
    return null;
}

/* Sitting. The tile and the way you face come from the piece: a sofa faces away from its back, a chair the way it's turned. */
const SEAT_LIFT = { sofa: 3, chair: 3, barstool: 11 };     /* the stool's cushion stands higher than a chair's seat */
const isSeat = k => k === "sofa" || k === "chair" || k === "barstool" || k === "ghsofa" || k === "ghchair";
/* the seat standing on a floor tile, if any: clicking the tile sits you there, as clicking the seat does (9 Nov, his) */
const seatOnTile = (l, X, Y) => { if (!l || l.stair) return null; const p = (l.props || []).find(q => isSeat(q.k) && Parts.tiles(q).some(t => t[0] === X && t[1] === Y)); return p ? { l, p, x: X, y: Y } : null; };
/* seats are click-through (9 Nov, his): the floor tile under the pointer decides, never the seat's picture, so aiming at the tile behind a chair
   takes you to that tile even when the chair's back is in the way, and you sit only when the tile you point at holds a seat */
const seatUnder = (px, py) => { const f = floorUnder(px, py); return f ? seatOnTile(f[0], f[1], f[2]) : null; };     // low enough that you sit in the seat, not hover over it
const seatFacing = p => p.k === "ghsofa" || p.k === "ghchair" ? (Parts.rotOf(p) ? 2 : 4) : p.k === "sofa" ? (Parts.rotOf(p) ? 2 : 4) : [2, 4, 6, 0][Parts.rotOf(p)];
const STEP_OF = d => DIRS[d];
/* ---------- the lifts ----------
   Double-click: its doors open, and you walk over. Its floor is a floor like any other, so you walk in. Inside, a little panel asks where to; the doors close, a quiet
   ride, and you step out of the lift you chose, on that floor. It only offers places with a lift. */
const liftDoors = new Map();                     // a lift -> { p: how open, to: where it's going, shutAt }
const liftOpen = q => { const s = liftDoors.get(q); return !!s && s.to === 1; };
const LIFT_FRAMES = 6, liftImgs = new Map();
function liftImg(way, f) { const k = way + "|" + f; let i = liftImgs.get(k); if (!i) { i = new Image(); i.onload = () => paint(); { const u = "/api/lift?" + new URLSearchParams({ way, slide: f / (LIFT_FRAMES - 1) }); if (window.HALLWAY_PLAY) i.src = window.hallwayLiftSrc(way, f); else if (window.hallwayApiImage) window.hallwayApiImage(i, u); else i.src = u; } liftImgs.set(k, i); } return i; }
function setDoors(q, open, shutIn) {
    const s = liftDoors.get(q) || { p: 0, to: 0 };
    if (s.to !== (open ? 1 : 0) && window.LiftSounds) LiftSounds.doors();
    s.to = open ? 1 : 0; s.shutAt = shutIn ? performance.now() + shutIn : 0; liftDoors.set(q, s);
    const way = (() => { const l = byId(q.level); return l.colour ? "hex:" + l.colour : l.way; })(); for (let f = 0; f < LIFT_FRAMES; f++) liftImg(way, f);
}
setInterval(() => {
    if (!map) return; let moving = false;
    for (const [q, s] of liftDoors) {
        const here = walker && ((walker.l.stair && walker.l.stair.lift === q) || (walker.pts || []).some(n => (n.st && n.st.lift === q) || (n.l && n.l.stair && n.l.stair.lift === q)));      // in it, or on the way
        if (s.to === 1 && s.shutAt && performance.now() > s.shutAt && !here) setDoors(q, false);
        const was = s.p; s.p = Math.max(0, Math.min(1, s.p + (s.to ? 1 : -1) * .04)); if (s.p !== was) moving = true;
        if (!s.to && !s.p) liftDoors.delete(q);
    }
    for (const [d, st] of doorStates) {
        const here = walker && walker.l.stair && walker.l.stair.door === d;
        if (st.to === 1 && st.shutAt && performance.now() > st.shutAt && !here) setDoor(d, false);
        if (st.autoIn && (d.kind === "book" ? st.p >= .8 : doorEase(st.p) >= .86)) { st.autoIn = false; walkIntoDoor(d); }
    }
    if (moving) paint();
    noteFloor(); if (walker && walker.walking) markActive();
    if (tool !== "walk" || !walker) return;
    if (walker.leavingDoor && !walker.walking) walker.leavingDoor = false;
    if (walker.l.stair && walker.l.stair.door && !walker.walking && !walker.busy) {
        const d = walker.l.stair.door, deep = d.axis === "x" ? walker.y === d.line - DOOR_DEEP : walker.x === d.line - DOOR_DEEP;
        if (deep) { enterDoor(walker.l.stair.low, d); return; }
        const t = d.axis === "x" ? [walker.x, d.line - DOOR_DEEP] : [d.line - DOOR_DEEP, walker.y], p = graphFrom(walker.l, walker.x, walker.y, [walker.l, t[0], t[1]]); if (p) followRoute(p, null, null);
        return;
    }
    const room = walker.l.stair;
    if (!walker.busy && !$("liftPanel").hidden && (walker.walking || !room || !room.lift)) { hideLiftPanel(); walker.asked = false; }
    /* in a tunnel: at its back, out of the one it leads to; walked into but not to the back, on to the back (as the entrance does) */
    if (room && room.tunnel && !walker.walking && !walker.busy) {
        const q = room.tunnel, far = findTunnel(q.to), to = far && far.q, deep = (q.axis === "x" ? walker.y : walker.x) === q.line - 2;
        if (to && deep && !walker.arriving) { throughTunnel(to, far.place); return; }
        /* on to the back; re-asked whenever you stand still in it, so a click inside it can't leave you parked there (10 Nov scan b, live 10) */
        if (to && !deep && !walker.arriving) { const m = entranceTiles(q)[1], t = q.axis === "x" ? [m, q.line - 2] : [q.line - 2, m], p = graphFrom(walker.l, walker.x, walker.y, [walker.l, t[0], t[1]]); if (p) followRoute(p, null, null); }
        return;
    }
    if (!room || (!room.lift && !room.entrance)) { walker.arriving = false; walker.asked = false; walker.leaving = false; return; }
    if (walker.walking || walker.busy) return;
    if (room.lift && !walker.asked && !walker.arriving) { walker.asked = true; showLiftPanel(room.lift); }
    if (room.entrance && !walker.arriving) { const e = map.entrance, deep = (e.axis === "x" ? walker.y : walker.x) === e.line - 2; if (deep) leaveHallway(); else { walker.leaving = true; const m = entranceTiles(e)[1], t = e.axis === "x" ? [m, e.line - 2] : [e.line - 2, m], p = graphFrom(walker.l, walker.x, walker.y, [walker.l, t[0], t[1]]); if (p) followRoute(p, null, null); } }
}, 40);
function drawLifts(ox, oy) {
    for (const [q, s] of liftDoors) {
        const l = byId(q.level), way = l.colour ? "hex:" + l.colour : l.way, img = liftImg(way, Math.round(s.p * (LIFT_FRAMES - 1))); if (!img.complete || !img.naturalWidth) continue;
        const a = P(q.x, q.y, tileZ(l, q.x, q.y));
        ctx.imageSmoothingEnabled = false;
        /* a left wall's: the same picture mirrored, pixel for pixel as render/hw3.js mirrors it (column X goes to 2 * origin - X) */
        if (liftLeft(q)) { ctx.save(); ctx.translate(ox + (a[0] + 1) * zoom, 0); ctx.scale(-1, 1); ctx.drawImage(img, -40 * zoom, oy + (a[1] - 160) * zoom, img.naturalWidth * zoom, img.naturalHeight * zoom); ctx.restore(); }
        else ctx.drawImage(img, ox + (a[0] - 40) * zoom, oy + (a[1] - 160) * zoom, img.naturalWidth * zoom, img.naturalHeight * zoom);
    }
}
/* ---------- the maze doors ----------
   Double-click: you walk up to it. Double-click again: it opens inwards, and through it is the first of its room's floor, walked onto like a lift's.
   Past those tiles you're in the room, floating in the dark; the arrow on its floor brings you back out here. */
const doorStates = new Map(); let roomSession = null;
const DOOR_DEEP = 3, DOOR_OPEN_MS = 1150, DOOR_SHUT_MS = 950, DOOR_FRAMES = 60;
/* a bookcase is heavy: the same movement whatever its speed, only stretched */
const BOOK_OPEN_MS = 2950, BOOK_SHUT_MS = 1500, doorMs = (d, open) => d.kind === "book" ? (open ? BOOK_OPEN_MS : BOOK_SHUT_MS) / (d.speed || 1) : (open ? DOOR_OPEN_MS : DOOR_SHUT_MS);
const doorIsOpen = d => { const s = doorStates.get(d); return !!s && s.to === 1; };
const doorFront = d => d.axis === "x" ? [[d.at, d.line], [d.at + 1, d.line]] : [[d.line, d.at - 1], [d.line, d.at - 2]];
/* It's a heavy door. The latch lets go first, it starts slowly, swings, and eases to rest */
const doorEase = t => { if (t <= .1) return 0; const s = Math.pow((t - .1) / .9, 1.25); return s * s * (3 - 2 * s); };
let doorRaf = 0, doorLast = 0;
function doorRun(now) {
    doorRaf = 0; const dt = Math.max(0, Math.min(250, now - doorLast)); doorLast = now; let moving = false;   // a frame's time can be from just before it was asked for
    for (const [d, st] of doorStates) {
        st.p = Math.max(0, Math.min(1, st.p + (st.to ? dt / doorMs(d, true) : -dt / doorMs(d, false))));
        /* a bookcase waits, nudged open, while you step back out of its way (bookDoor) */
        if (st.hold && st.to && st.p > st.hold) st.p = st.hold;
        if (st.p !== st.to && !(st.hold && st.p === st.hold)) moving = true;
        if (!st.to && !st.p) { doorStates.delete(d); doorFrames.delete(d); }
    }
    paint(); if (moving) doorRaf = requestAnimationFrame(doorRun);
}
function setDoor(d, open, ms) {
    const s = doorStates.get(d) || { p: 0, to: 0 };
    if (s.to !== (open ? 1 : 0) && window.LiftSounds) { if (open) LiftSounds.doorOpen(); else LiftSounds.doorShut(); }
    s.to = open ? 1 : 0; s.shutAt = ms ? performance.now() + ms : 0; if (!open) s.autoIn = false; doorStates.set(d, s);
    if (!doorRaf) { doorLast = performance.now(); doorRaf = requestAnimationFrame(doorRun); }
    paint();
}
const doorZ = (l, d) => { const f = doorFront(d)[0]; return tileZ(l, f[0], f[1]); };
function doorPoint(l, d) { return d.axis === "x" ? P(d.at, d.line, doorZ(l, d)) : P(d.line, d.at, doorZ(l, d)); }
function inDoorway(l, d, px, py) {
    const a = doorPoint(l, d), u = px - a[0], h = d.axis === "x" ? a[1] + Math.floor(u / 2) - py : a[1] - Math.floor(u / 2) - py;
    return u >= 0 && u < 32 && h >= -2 && h < 62;
}
function doorAtPx(px, py) {
    for (const l of [...map.levels].sort((a, c) => c.k - a.k)) {
        for (const d of (l.doors || [])) if (inDoorway(l, d, px, py)) return { l, d };
        const [fx, fy] = tileIn(l, px, py); if (hasFloor(l, Math.floor(fx), Math.floor(fy))) return null;
    }
    return null;
}
/* A door leads somewhere if it has a maze the archive has. The rest stay shut unless you've said they open, and then they only open: there's nothing to walk into */
const doorTargets = { room: to => (window.RoomView ? RoomView.special(root, to.size, to.n) : null) }; window.hallwayDoorTargets = doorTargets;
const doorTarget = d => { const go = d.to && doorTargets[d.to.kind]; return go ? go(d.to, d) : null; };
const doorLinked = d => d.to ? !!doorTarget(d) : !d.spare && !!d.name && (!roomFloors || !roomFloors.size || roomFloors.has(FurniParts.mazeName(d.name)));
function walkIntoDoor(d) {
    if (!walker || walker.walking || walker.busy || !doorIsOpen(d)) return false;
    const l = map.levels.find(q => (q.doors || []).includes(d)), s = walkerStart(); if (s.l !== l || !doorFront(d).some(t => t[0] === s.x && t[1] === s.y)) return false;
    const t = d.axis === "x" ? [s.x, d.line - DOOR_DEEP] : [d.line - DOOR_DEEP, s.y], p = graphFrom(l, s.x, s.y, [stairLevels().list.find(q => q.stair.door === d), t[0], t[1]]); if (!p) return false;
    followRoute(p, null, null); return true;
}
const noWay = t => { if (window.HALLWAY_PLAY) flash(t); else setStatus(t); };
function useDoor(l, d) {
    const s = walkerStart(), fr = doorFront(d), there = !walker.walking && s.l === l && fr.some(t => t[0] === s.x && t[1] === s.y);
    if (!there) { const r = routeToOneOf(l, fr, s.l, s.x, s.y); if (r) followRoute(r.path, s.here, () => { walker.dir = d.axis === "x" ? 0 : 6; paint(); }); else noWay("There's no way to that door."); return; }
    walker.dir = d.axis === "x" ? 0 : 6;
    doorFloorKind(d, true);
    if (!doorLinked(d)) {
        if (!d.opens) { if (window.LiftSounds) LiftSounds.doorLocked(); flash("It's locked."); return; }
        if (doorIsOpen(d)) setDoor(d, false); else setDoor(d, true, 6000);
        return;
    }
    /* a second double-click while the leaf is still swinging waits for it, as the first one does: it walked you through a door barely open (15 Nov scan, rooms 8) */
    if (doorIsOpen(d)) { const st = doorStates.get(d); if (doorEase(st.p) >= .86) walkIntoDoor(d); else st.autoIn = true; return; }
    setDoor(d, true, 15000); doorStates.get(d).autoIn = true;
    if (window.RoomView) { RoomView.load(); RoomView.mazes(); }
}
/* ---------- the door swinging ----------
   The leaf is the door you were just looking at: its pixels are read out of the map's own picture, at the time of day on show, sign's glow and all, so the first frame is
   the closed door exactly and nothing jumps. It hangs on the side nearest you and swings inward, pixel by pixel on its true slant, narrowing until it's gone behind the wall.
   So an open door shows only what you can walk on: the tiles of the way in, sharp-edged, and the dark.
   u: px across the door from the far side. h: px up from the wall's foot at that column. */
const DOOR_FREE = 2, DOOR_LEAF = 30, DOOR_LEAF_H = 60, DOOR_OPENING = 62, DOOR_SWING = 48 * Math.PI / 180;
const doorFrames = new Map(), doorClosed = new Map();
const doorBase = d => d.axis === "x" ? 66 : 82;
const doorPx = (d, u, h) => { const U = d.axis === "x" ? u : 31 - u, B = doorBase(d); return [U, d.axis === "x" ? B + Math.floor(U / 2) - h : B - Math.floor(U / 2) - h]; };
/* what's on the map in that spot, at 1:1, at this time of day */
function doorClosedData(d, l, mood) {
    const key = mood + "|" + version; let m = doorClosed.get(d); if (!m) doorClosed.set(d, m = new Map()); if (m.has(key)) return m.get(key);
    const a = doorPoint(l, d), X = a[0], Y = a[1] - doorBase(d), c = document.createElement("canvas"); c.width = 32; c.height = 84; const g = c.getContext("2d", { willReadFrequently: true });
    for (let ty = Math.floor(Y / TILE); ty <= Math.floor((Y + 83) / TILE); ty++) for (let tx = Math.floor(X / TILE); tx <= Math.floor((X + 31) / TILE); tx++) {
        const t = mood === "map" ? tiles.get(tx + "," + ty) : moodTile(mood, tx, ty); if (!t) return null;
        g.drawImage(t.img, tx * TILE - X, ty * TILE - Y);
    }
    const data = g.getImageData(0, 0, 32, 84).data; m.set(key, data); return data;
}
/* how much of the hallway's light there is to come in, at each time of day */
const DOOR_LIGHT = { day: 1, dusk: .68, dawn: .7, night: .3, map: .8 };
function doorFrame(d, l, floor, mood, frame) {
    let m = doorFrames.get(d); if (!m) doorFrames.set(d, m = new Map());
    const key = mood + "|" + floor + "|" + frame + "|" + version; if (m.has(key)) return m.get(key);
    const closed = doorClosedData(d, l, mood); if (!closed) return null;
    const c = document.createElement("canvas"); c.width = 32; c.height = 84; const g = c.getContext("2d"), im = g.createImageData(32, 84);
    const th = frame / DOOR_FRAMES * DOOR_SWING, cos = Math.cos(th), sin = Math.sin(th), wide = DOOR_LEAF * (cos - sin), fall = wide > 0 ? (cos + sin) / (cos - sin) : 0, T = MOOD_TINT[mood] || [0, 0, 0, 0], dim = DOOR_LIGHT[mood] || .8;
    for (let u = DOOR_FREE; u < 32; u++) for (let hh = 0; hh < DOOR_OPENING - 2; hh++) {
        const q0 = doorPx(d, u, hh), q = (q0[1] * 32 + q0[0]) * 4; if (q0[1] < 0 || q0[1] >= 84) continue;
        const n = 31 - u, t = wide > 0 ? (n + .5) / wide : 2, up = hh + Math.floor(n / 2) - Math.floor(n * fall / 2 + 1e-6);   // whole pixels, stepped as the wall's own line is, so a shut door is exactly itself
        let r = 0, gg = 0, b = 0;
        if (t < 1 && up >= 0 && up < DOOR_LEAF_H) {
            /* the leaf: its own pixel, turning away from the hallway's light */
            const su = 31 - Math.min(DOOR_LEAF - 1, Math.floor(t * DOOR_LEAF)), sq = doorPx(d, su, up), p = (sq[1] * 32 + sq[0]) * 4, light = 1 - (th / DOOR_SWING) * (.3 + .25 * t);
            r = closed[p] * light; gg = closed[p + 1] * light; b = closed[p + 2] * light;
        } else if (hh === 0) { r = 150 * dim; gg = 100 * dim; b = 34 * dim; }      // the threshold
        else if (floor && window.RoomView) {
            /* the tiles of the way in: as wide as the door, as deep as you walk, and nothing past them */
            const k = hh / 16, across = (u + .5) / 16 - k;
            if (across >= 0 && across < 2 && k < DOOR_DEEP) {
                const f = RoomView.floorPixel(floor, across + 1, 1 - k), light = dim * (1 - k * .14);
                r = f[0] * light; gg = f[1] * light; b = f[2] * light;
                if (T[3] > 0) { const q2 = T[3] * .35; r += (T[0] - r) * q2; gg += (T[1] - gg) * q2; b += (T[2] - b) * q2; }
            }
        }
        im.data[q] = r; im.data[q + 1] = gg; im.data[q + 2] = b; im.data[q + 3] = 255;
    }
    g.putImageData(im, 0, 0); m.set(key, c); return c;
}
let roomFloors = null, roomFloorsFailed = false;
function doorFloorKind(d, ask) {
    /* a failed read is asked again at the next door you use (ask), not kept as "no floors" for the visit, and not asked again on every
       frame of a door swinging (15 Nov scan, rooms 19) */
    if (window.RoomView && !roomFloors && (!roomFloorsFailed || ask)) {
        const got = roomFloors = new Map(); roomFloorsFailed = false;
        const failed = () => { if (roomFloors === got) { roomFloors = null; roomFloorsFailed = true; } };
        RoomView.load().then(() => RoomView.mazes()).then(list => { if (!list || list.failed) return failed(); if (roomFloors !== got) return; for (const m of list) { const r = RoomView.roomFor(root, m); got.set(FurniParts.mazeName(m.name), r.room.floor); } doorFrames.clear(); paint(); }).catch(failed);      // root: the rooms' layouts are kept there, not on the gallery's map (15 Nov scan, editor 15)
    }
    if (!doorLinked(d)) return null;
    if (d.to) { const t = doorTarget(d); return (t && t.room.floor) || "slate"; }
    return (roomFloors && roomFloors.get(FurniParts.mazeName(d.name))) || "slate";
}
/* the bookcase door: its pictures are drawn once in art/ideas; here they only take the time of day's tint */
let bookArt = null, bookImg = null; const bookCv = document.createElement("canvas"), BOOK_MAX = 84, BOOK_FOOT = 3;       // its back on the wall's foot (8 Nov 2026: at 6 its front was there and its back in the wall); render/hw3.js lifts the map's picture the same
function loadBook() { if (bookArt !== null) return; bookArt = false; const i = new Image(); i.onload = () => { bookImg = i; paint(); }; i.src = "art/ideas/book.png"; fetch("art/ideas/book.json").then(r => r.json()).then(j => { bookArt = j; paint(); }).catch(() => {}); }
const bookEase = v => v < .5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
function bookAngle(T) { if (T < .55) return 0; if (T < .75) return 3 * ((T - .55) / .2); if (T < 2.35) return 3 + (BOOK_MAX - 3) * bookEase((T - .75) / 1.6); if (T < 2.6) return BOOK_MAX - 3 * ((T - 2.35) / .25); if (T < 2.95) return BOOK_MAX - 3 + 1.5 * ((T - 2.6) / .35); return BOOK_MAX - 1.5; }
function drawBookDoor(d, st, ox, oy) {
    loadBook(); if (!bookArt || !bookImg || st.p <= 0) return;
    const l = map.levels.find(q => (q.doors || []).includes(d)); if (!l) return;
    const T = st.p * BOOK_OPEN_MS / 1000, opening = st.to === 1, ang = opening ? bookAngle(T) : (BOOK_MAX - 1.5) * bookEase(st.p), z = doorZ(l, d), flip = d.axis === "x", a = flip ? P(d.at - .5, d.line, z) : P(d.line, d.at - 2.5, z), sh = opening && T > .55 && T < .68 && Math.floor(T * 40) % 2 ? 1 : 0;
    const pics = [bookArt.passage, opening && T < .55 ? bookArt.pulls[Math.min(7, Math.floor(T * 14))] : bookArt.frames[Math.round(ang / bookArt.STEP)]], m = moodNow() || { a: map.light || "sconces", b: map.light || "sconces", f: 0 }, A = MOOD_TINT[m.a] || MOOD_TINT.day, B = MOOD_TINT[m.b] || MOOD_TINT.day, v = [0, 1, 2, 3].map(i => A[i] + (B[i] - A[i]) * m.f);
    ctx.save(); ctx.translate(ox + a[0] * zoom, oy + (a[1] - BOOK_FOOT) * zoom); ctx.scale(flip ? -zoom : zoom, zoom); ctx.imageSmoothingEnabled = false;
    for (const s of pics) { if (!s) continue; bookCv.width = s.w; bookCv.height = s.h; const g = bookCv.getContext("2d"); g.drawImage(bookImg, s.x, 0, s.w, s.h, 0, 0, s.w, s.h); if (v[3] > 0) { g.globalCompositeOperation = "source-atop"; g.fillStyle = `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${v[3]})`; g.fillRect(0, 0, s.w, s.h); } ctx.drawImage(bookCv, -s.ox + sh, -s.oy); }
    ctx.restore();
}
/* ---------- the bookcase door (8 Nov 2026, his): "it truly needs to be only opened by an individual book. When the book is clicked, it pops
   out slightly, and the bookcase nudges open a bit, the avatar walks a few tiles away, and then the door swings open. When the avatar then
   walks into the now open doorway, it must go behind the door." The loose book is the one lit blue in the closed picture. ---------- */
let bookBox = null;
function bookBounds() {
    if (bookBox !== null) return bookBox; if (!bookArt) return null;
    if (bookArt.book) return (bookBox = bookArt.book);              // where the build says it is; it no longer stands out by its colour
    if (!bookImg) return null;
    const s = bookArt.pulls[0], cv = document.createElement("canvas"); cv.width = s.w; cv.height = s.h; const g = cv.getContext("2d"); g.drawImage(bookImg, s.x, 0, s.w, s.h, 0, 0, s.w, s.h);
    const d = g.getImageData(0, 0, s.w, s.h).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) { const q = (j * s.w + i) * 4; if (d[q + 3] > 128 && d[q + 2] > 180 && d[q + 2] > d[q] + 60) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); } }
    bookBox = x1 < 0 ? false : { x0: x0 - s.ox, x1: x1 - s.ox, y0: y0 - s.oy, y1: y1 - s.oy }; return bookBox;
}
function onBook(l, d, px, py) {
    loadBook(); const b = bookBounds(); if (!b) return false;
    const z = doorZ(l, d), flip = d.axis === "x", a = flip ? P(d.at - .5, d.line, z) : P(d.line, d.at - 2.5, z), u = (px - a[0]) * (flip ? -1 : 1), v = py - (a[1] - BOOK_FOOT);
    return u >= b.x0 - 3 && u <= b.x1 + 3 && v >= b.y0 - 3 && v <= b.y1 + 3;
}
/* its pictures are wanted before the first click on the book, so they come as soon as the map has a bookcase door */
{ const pre = setInterval(() => { if (!map) return; clearInterval(pre); if (map.levels.some(l => (l.doors || []).some(d => d.kind === "book"))) loadBook(); }, 500); }
const BOOK_HOLD = .75 / (BOOK_OPEN_MS / 1000);         // the swing waits here: book out, case nudged a hand's width
function bookDoor(l, d) {
    if (!walker || walker.busy) return; const fr = doorFront(d), s0 = walkerStart(), there = !walker.walking && s0.l === l && fr.some(t => t[0] === s0.x && t[1] === s0.y);
    if (!doorLinked(d) && !d.opens) { if (window.LiftSounds) LiftSounds.doorLocked(); flash("It won't budge."); return; }
    if (doorIsOpen(d)) { const st = doorStates.get(d); if (st && st.p >= .98) { goInBook(l, d); } return; }
    if (!there) { const r = routeToOneOf(l, fr, s0.l, s0.x, s0.y); if (r) followRoute(r.path, s0.here, () => bookDoor(l, d)); else noWay("There's no way to that bookcase."); return; }
    walker.dir = d.axis === "x" ? 0 : 6;
    setDoor(d, true, 20000); const st = doorStates.get(d); st.hold = BOOK_HOLD; st.autoIn = false; st.goIn = true;
    /* step back, out of its swing: three tiles straight out if you can, else two */
    setTimeout(() => {
        const me = walkerStart(), out = d.axis === "x" ? [0, 1] : [1, 0], here = [me.x, me.y]; let path = null;
        for (const k of [3, 2, 4, 1]) { const t = [here[0] + out[0] * k, here[1] + out[1] * k]; path = graphFrom(me.l, me.x, me.y, [l, t[0], t[1]]); if (path) break; }
        const release = () => { const q = doorStates.get(d); if (!q) return; q.hold = 0; if (!doorRaf) { doorLast = performance.now(); doorRaf = requestAnimationFrame(doorRun); } };
        if (path) followRoute(path, me.here, () => { walker.dir = d.axis === "x" ? 0 : 6; release(); }); else release();
    }, 800 / (d.speed || 1));
}
/* once it's open: back to its front, and in */
function goInBook(l, d) {
    const fr = doorFront(d), s0 = walkerStart();
    if (fr.some(t => t[0] === s0.x && t[1] === s0.y) && s0.l === l) { walkIntoDoor(d); return; }
    const r = routeToOneOf(l, fr, s0.l, s0.x, s0.y); if (r) followRoute(r.path, s0.here, () => walkIntoDoor(d));
}
setInterval(() => { for (const [d, st] of doorStates) if (d.kind === "book" && st.goIn && st.to && st.p >= .98 && walker && !walker.walking && !walker.busy) { st.goIn = false; const l = map.levels.find(q => (q.doors || []).includes(d)); if (l) goInBook(l, d); } }, 100);
/* you in its doorway: the open bookcase stands in front of you */
function drawBookOver(ox, oy) { if (!walker || !walker.l.stair || !walker.l.stair.door) return; const d = walker.l.stair.door, st = doorStates.get(d); if (d.kind === "book" && st) drawBookDoor(d, st, ox, oy); }
function drawDoorways(ox, oy) {
    for (const [d, st] of doorStates) {
        if (d.kind === "book") { drawBookDoor(d, st, ox, oy); continue; }
        const frame = Math.round(doorEase(st.p) * DOOR_FRAMES); if (!frame) continue;
        const l = map.levels.find(q => (q.doors || []).includes(d)); if (!l) continue;
        const a = doorPoint(l, d), floor = doorFloorKind(d), m = moodNow(), X = ox + a[0] * zoom, Y = oy + (a[1] - doorBase(d)) * zoom, S = 32 * zoom, H = 84 * zoom;
        ctx.imageSmoothingEnabled = false;
        const one = doorFrame(d, l, floor, m ? m.a : "map", frame); if (one) ctx.drawImage(one, X, Y, S, H);
        if (m && m.f > 0) { const two = doorFrame(d, l, floor, m.b, frame); if (two) { ctx.globalAlpha = m.f; ctx.drawImage(two, X, Y, S, H); ctx.globalAlpha = 1; } }
    }
}
async function enterDoor(low, d) {
    const me = walker; if (!me || me.busy || !window.RoomView) return; me.busy = true; me.pts = []; me.walking = false;
    /* a slow archive says so, rather than leaving you gone into a dark doorway; RoomView.mazes gives up at 8 seconds (15 Nov scan, rooms 7) */
    const slow = setTimeout(() => { if (walker === me && me.busy && !roomSession) flash("Fetching the archive..."); }, 1500);
    let list = []; try { await RoomView.load(); list = await RoomView.mazes(); } catch (e) { list = []; } finally { clearTimeout(slow); const t = $("toast"); if (t && t.textContent === "Fetching the archive...") t.classList.remove("show"); }
    const maze = d.to ? null : list.find(m => FurniParts.mazeName(m.name) === FurniParts.mazeName(d.name)), target = d.to ? doorTarget(d) : null;
    if (walker !== me) return;
    const backOut = () => { const f = doorFront(d), free = q => !(low.props || []).some(p => Parts.tiles(p).some(t => t[0] === q[0] && t[1] === q[1])), t = f.find(q => free(q) && (d.axis === "x" ? q[0] === me.x : q[1] === me.y)) || f.find(free) || f[0]; me.l = low; me.x = t[0]; me.y = t[1]; me.z = tileZ(low, t[0], t[1]); me.st = null; me.dir = d.axis === "x" ? 4 : 2; me.busy = false; };
    if (!maze && !target) { flash(d.to ? "This door doesn't lead anywhere just now." : list.failed ? "Couldn't reach the archive. Try the door again." : "This door's maze isn't in the archive."); backOut(); setDoor(d, false); paint(); return; }
    const { room, facts } = target || RoomView.roomFor(root, maze), stage = $("stage");      // root holds the rooms' layouts, on either map
    const dissolve = from => { const shot = document.createElement("canvas"); shot.width = from.width; shot.height = from.height; shot.getContext("2d").drawImage(from, 0, 0); shot.style.cssText = "position:absolute;left:0;top:0;z-index:24;pointer-events:none;transition:opacity .7s ease;opacity:1;width:" + from.clientWidth + "px;height:" + from.clientHeight + "px"; stage.appendChild(shot); return () => { shot.getBoundingClientRect(); shot.style.opacity = 0; setTimeout(() => shot.remove(), 750); }; };
    const go = dissolve(canvas);
    roomSession = RoomView.enter(stage, {
        room, facts, edge: d.axis === "x" ? "y" : "x", zoom: () => zoom,
        /* never past what the room can show (cap): a wheel up took the hallway to 3 with the room still at 2 (15 Nov scan, rooms 11) */
        wheel: (delta, cap) => { const top = Math.max(1, cap || zoom); if (delta < 0) { if (zoom < top) setZoom(zoom + 1); } else setZoom(Math.min(zoom, top) - 1); },
        onLeave: () => {
            const fade = dissolve(roomSession.canvas); roomSession.close(); roomSession = null;
            const S = stairLevels().list.find(q => q.stair.door === d), col = d.axis === "x" ? me.x : me.y, out = doorFront(d).find(q => d.axis === "x" ? q[0] === col : q[1] === col) || doorFront(d)[0], sx = d.axis === "x" ? col : d.line - DOOR_DEEP, sy = d.axis === "x" ? d.line - DOOR_DEEP : col;
            me.l = S; me.st = S.stair; me.x = sx; me.y = sy; me.z = nodeZ(S, sx, sy); me.dir = d.axis === "x" ? 4 : 2; me.busy = false; level = low; buildLevels();
            const path = graphFrom(S, sx, sy, [low, out[0], out[1]]) || doorFront(d).map(q => graphFrom(S, sx, sy, [low, q[0], q[1]])).find(Boolean);
            /* a bookcase is already standing open as you come back out of the room: left to swing open as you walked, you went through its shelves
               (14 Nov 2026, his: "work on the clipping ... when an avatar leaves the bookcase door"); it swings shut once you're clear of it */
            if (d.kind === "book") { const q = doorStates.get(d) || { p: 0, to: 0 }; q.p = 1; q.to = 1; q.hold = 0; q.goIn = false; q.autoIn = false; doorStates.set(d, q); }
            if (path) { me.leavingDoor = true; setDoor(d, true, 8000); followRoute(path, null, () => { me.leavingDoor = false; setDoor(d, false); }); } else { backOut(); setDoor(d, false); }
            const a = P(me.x + .5, me.y + .5, me.z); cam.x = a[0]; cam.y = a[1] - 40; clampCam(); paint(); fade();
        }
    });
    go();
}
function liftAt(px, py) {
    for (const l of [...map.levels].sort((a, c) => c.k - a.k)) {
        for (const q of map.lifts) { if (q.level !== l.id) continue; const a = P(q.x, q.y, tileZ(l, q.x, q.y)), u = liftLeft(q) ? a[0] - px : px - a[0], h = a[1] + Math.floor(u / 2) - py; if (u >= -12 && u <= 60 && h >= -4 && h <= 118) return q; }
        const [fx, fy] = tileIn(l, px, py); if (hasFloor(l, Math.floor(fx), Math.floor(fy))) return null;
    }
    return null;
}
function useLift(q) {
    const l = byId(q.level), s = walkerStart(), path = graphFrom(s.l, s.x, s.y, [l, ...liftPt(q, 1, 0)]);
    setDoors(q, true, 20000 + (path ? path.length * MS_PER_TILE : 0));
    if (path) followRoute(path, s.here, null); else noWay("There's no way to that lift.");
}
function showLiftPanel(here) {
    if (window.HallwayLiftPanel) { HallwayLiftPanel.show(here, { ride: q => rideTo(here, q), doors: open => setDoors(here, open, open ? 5000 : 0) }); $("liftPanel").hidden = false; return; }
    const box = $("liftList"); box.textContent = "";
    const others = map.lifts.filter(q => q !== here && byId(q.level)).sort((a, c) => byId(a.level).k - byId(c.level).k || a.x - c.x);
    if (!others.length) { const p = document.createElement("p"); p.textContent = "This is the only lift."; box.appendChild(p); }
    for (const q of others) {
        const l = byId(q.level), same = map.lifts.filter(r => r.level === q.level).sort((a, c) => a.x - c.x), b = document.createElement("button");
        b.type = "button"; b.textContent = l.name + (same.length > 1 ? " · lift " + (same.indexOf(q) + 1) : "") + (q.level === here.level ? " (this floor)" : "");
        b.addEventListener("click", () => rideTo(here, q)); box.appendChild(b);
    }
    $("liftPanel").hidden = false;
}
const hideLiftPanel = () => { $("liftPanel").hidden = true; if (window.HallwayLiftPanel) HallwayLiftPanel.hide(); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function rideTo(from, to) {
    const me = walker; if (!me || me.busy) return;
    if (!window.HallwayLiftPanel) hideLiftPanel();      // the new panel stays up through the ride, its display counting the floors
    me.busy = true; me.pts = []; me.walking = false; me.then = null;
    const alive = () => walker === me, startLevel = level;
    setDoors(from, false); await wait(1250);
    if (!alive()) return;
    if (window.LiftSounds) LiftSounds.ride(3.4);
    await wait(500);
    if (!alive()) return;
    /* The view holds still on the closed doors, then dissolves straight into the lift you chose, doors shut. Nothing goes black and the camera never travels. */
    const shot = document.createElement("canvas"); shot.width = canvas.width; shot.height = canvas.height; shot.getContext("2d").drawImage(canvas, 0, 0);
    shot.style.cssText = "position:absolute;left:0;top:0;z-index:24;pointer-events:none;transition:opacity 1.1s ease;opacity:1;width:" + canvas.clientWidth + "px;height:" + canvas.clientHeight + "px"; canvas.parentNode.appendChild(shot);
    const S = stairLevels().list.find(q => q.stair.lift === to), l = byId(to.level), [x, y] = liftPt(to, 0, -1);
    me.l = S; me.x = x; me.y = y; me.z = nodeZ(S, x, y); me.dir = liftLeft(to) ? 2 : 4; me.pts = []; me.walking = false; me.asked = true; me.seat = null;      // facing out of it
    level = l; buildLevels();
    const a = P(x + .5, y + .5, me.z); cam.x = a[0]; cam.y = a[1] - 40; clampCam(); paint();
    /* give the art there a moment to arrive, under the picture of where you were */
    const t0 = performance.now();
    while (alive() && performance.now() - t0 < 2000) {
        const [x0, x1, y0, y1] = visibleTiles(), m = moodNow(); let ready = true;
        for (let ty = y0; ty <= y1 && ready; ty++) for (let tx = x0; tx <= x1; tx++) { const t = m ? moodTile(m.a, tx, ty) : tiles.get(tx + "," + ty); if (!t || (!m && t.v !== version)) { ready = false; break; } }
        if (ready) break; paint(); await wait(80);
    }
    /* stopped part way: no sounds, no picture left behind, back on the floor you were editing */
    if (!alive()) { hideLiftPanel(); shot.remove(); level = startLevel; buildLevels(); paint(); return; }
    shot.getBoundingClientRect(); shot.style.opacity = 0;
    if (window.LiftSounds) LiftSounds.arrive();
    await wait(1150); shot.remove(); hideLiftPanel();
    if (!alive()) return;
    setDoors(to, true, 5000); await wait(1100);
    if (!alive()) return;
    me.busy = false;
    const path = graphFrom(S, x, y, [l, ...liftPt(to, 0, 0)]); if (path) followRoute(path, null, null);
}
/* through a tunnel: a quick fade, and you're at the back of the one it leads to, walking out of it onto its floor (10 Nov 2026) */
function throughTunnel(to, where = mapNow) {
    /* the way out is worked out on the map it's on: the other one, for a tunnel between the Hallways and the Events Gallery (12 Nov 2026) */
    const cross = where !== mapNow, was = map, there = () => { const list = stairLevels().list, S = list.find(r => r.stair && r.stair.tunnel === to), low = byId(to.level); return { S, low }; };
    const m = entranceTiles(to)[1], ix = to.axis === "x" ? m : to.line - 2, iy = to.axis === "x" ? to.line - 2 : m, fronts = entranceTiles(to).map(t => to.axis === "x" ? [t, to.line] : [to.line, t]);
    let S, low, out; if (cross) { map = mapOf(where); stairMemo = null; }
    try { ({ S, low } = there()); out = S && low ? routeToOneOf(low, fronts, S, ix, iy) : null; } finally { if (cross) { map = was; stairMemo = null; } }
    /* out by whichever tile in front of it is free; if none is (or its floor's gone), you stay where you are and are told, rather than being
       thrown back and forth (10 Nov scan b, editor 2 and 3) */
    if (!out) { walker.arriving = true; flash(S && low ? "The way out of the tunnel it leads to is blocked." : "The tunnel it leads to has nowhere to come out."); return; }
    const me = walker; walker.busy = true; walker.leaving = false;
    canvas.style.transition = "opacity .25s"; canvas.style.opacity = "0";
    /* if you stop walking during the fade, the map comes back and nothing moves (10 Nov scan b, editor 1) */
    const back = () => { canvas.style.opacity = "1"; canvas.style.transition = ""; };
    setTimeout(() => {
        if (walker !== me) { back(); return; }
        if (cross) { setPlace(where, { walking: true, level: low }); ({ S, low } = there()); if (!S || !low) { back(); walker.busy = false; return; } }
        walker.l = S; walker.x = ix; walker.y = iy; walker.z = nodeZ(S, ix, iy); walker.pts = []; walker.walking = false; walker.st = null; walker.dir = to.axis === "x" ? 2 : 4; walker.arriving = true;
        if (level !== low) { level = low; buildLevels(); }
        const a = P(ix + .5, iy + .5, walker.z + 40); cam.x = a[0]; cam.y = a[1]; clampCam(); paint();
        canvas.style.opacity = "1";
        setTimeout(() => { canvas.style.transition = ""; if (walker !== me) return; walker.busy = false; const o = routeToOneOf(low, fronts, S, ix, iy); if (o) followRoute(o.path, null, () => { walker.arriving = false; }); }, cross ? 420 : 260);
    }, 260);
}
function leaveHallway() {
    if (!walker || walker.busy) return; walker.busy = true;
    const me = walker; $("fadeOut").style.opacity = 1;
    if (window.HALLWAY_PLAY) { window.hallwayTell("leave"); return; }
    setTimeout(() => { $("fadeOut").style.opacity = 0; if (walker !== me) return; setTool("select"); flash("You left the hallway. On the site, this is where you'd go back to the archive."); }, 800);
}
/* Is this pixel really part of the sprite? */
const alphaMaps = {};
function spriteSolidAt(path, X, Y) {
    const img = spriteImg(path); if (!img.complete || !img.naturalWidth) return false;
    let m = alphaMaps[path];
    if (!m) { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0); m = alphaMaps[path] = { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data }; }
    return X >= 0 && Y >= 0 && X < m.w && Y < m.h && m.d[(Y * m.w + X) * 4 + 3] > 127;
}
function propPartAt(l, p, px, py) {
    /* a seat drawn from its own picture (the arcade stool) has no client sprite to test: test its picture, where hw3 puts it (8 Nov, his: "Avatar can't sit on the new arcade stool") */
    const pc = !p.k.startsWith("arcade_") && p.k !== "statue" ? pieceOf(p) : null, fp = pc && pc.fp;
    if (fp) { const im = pieceImg(pc.f), a = P(p.x + pc.dx, p.y + pc.dy, tileZ(l, p.x, p.y) + pc.up), i = pc.flip ? Math.floor(a[0] + fp.ox - px) : Math.floor(px - (a[0] - fp.ox)), j = Math.floor(py - (a[1] - fp.oy)); if (!im.complete || !im.naturalWidth || i < 0 || j < 0 || i >= im.naturalWidth || j >= im.naturalHeight) return null; return treeAlpha(im, i, j) ? { x: p.x, y: p.y } : null; }
    if (!REGS) return null;
    for (const q of Parts.parts(p)) {
        const a = P(q.x, q.y, tileZ(l, q.x, q.y)), lx = a[0] - 16, ly = a[1] + 8;
        for (const name of q.names) {
            const reg = REGS.hall[name]; if (!reg) continue;
            const path = "art/hall/hh_room_hallway/" + name + ".png", img = spriteImg(path), w = img.naturalWidth || 0, x0 = q.flip ? lx + 32 + reg[0] - w : lx - reg[0], y0 = ly - reg[1], X = Math.floor(px - x0), Y = Math.floor(py - y0);
            if (spriteSolidAt(path, q.flip ? w - 1 - X : X, Y)) return q;
        }
    }
    return null;
}
/* When walking, what's the mouse on that you can use? A seat or a cooler, by the pixels you can actually see of it, even past other furniture.
   Everything else just lets the click through to the floor. */
function useUnder(px, py) {
    for (const l of [...map.levels].sort((a, c) => c.k - a.k)) {
        const list = (l.props || []).filter(p => isSeat(p.k) || p.k === "water").sort((a, c) => (c.x + c.y) - (a.x + a.y));
        for (const p of list) { const q = propPartAt(l, p, px, py); if (q) return { l, p, x: q.x, y: q.y }; }
        const [fx, fy] = tileIn(l, px, py), X = Math.floor(fx), Y = Math.floor(fy);
        if ((hasFloor(l, X, Y) && !holes(l).some(r => inRect(r, X, Y))) || wallAt(px, py, l)) return null;
    }
    return null;
}
function propUnder(px, py) {
    const hit = pick(px, py);
    if (!hit || hit.type !== "prop") return null;
    let best = null, far = 1e9;
    for (const [x, y] of Parts.tiles(hit.o)) { const a = P(x + .5, y + .5, tileZ(hit.l, x, y) + 12), d = Math.hypot(a[0] - px, a[1] - py); if (d < far) { far = d; best = [x, y]; } }
    return { l: hit.l, p: hit.o, x: best[0], y: best[1] };
}
/* the quickest way to any of these tiles, tried in order of preference: the first that has a route wins */
function routeToOneOf(l, list, startL, sx, sy) {
    let best = null;
    for (const [x, y] of list) { const path = graphFrom(startL, sx, sy, [l, x, y]); if (path && (!best || path.length < best.path.length)) best = { path, x, y }; }
    return best;
}
function walkerStart() {
    let here = walker.walking && walker.pts.length ? walker.pts[0] : null;
    if (here && here.seat) here = { ...here, seat: null, z: tileZ(here.l, here.x, here.y) };
    return { here, l: (here && here.l) || walker.l, x: here && here.l ? here.x : Math.round(walker.x), y: here && here.l ? here.y : Math.round(walker.y) };
}
function followRoute(path, here, then) {
    const pts = [];
    for (const step of path) { const [id, sx, sy] = step.key.split("|"), L = nodeLevel(id); pts.push({ x: +sx, y: +sy, z: nodeZ(L, +sx, +sy), l: L, st: L.stair || null }); }
    const was = walker.walking;
    walker.seat = null; walker.then = then || null;
    walker.pts = (here ? [here] : []).concat(pts.slice(1)); walker.walking = walker.pts.length > 0;
    if (!was && walker.walking) { walker.last = performance.now(); requestAnimationFrame(stepWalk); }
    if (!walker.walking && then) { const t = then; walker.then = null; t(); }
    followNow();
}
function sitOn(u, then) {     // then: once seated (live-lost.js picks a thing up from a chair beside it)
    const face = seatFacing(u.p), d = STEP_OF(face), z = tileZ(u.l, u.x, u.y), s = walkerStart();
    if (walker.seat && walker.seat.x === u.x && walker.seat.y === u.y && walker.seat.l === u.l) { if (then) then(); return true; }
    /* the next seat along: straight across, no getting up and walking round */
    if (walker.seat && !walker.walking && walker.seat.l === u.l && Math.abs(walker.seat.x - u.x) <= 1 && Math.abs(walker.seat.y - u.y) <= 1) {
        walker.seat = null;
        walker.pts = [{ x: u.x, y: u.y, z: z + (SEAT_LIFT[u.p.k] || 7), l: u.l, st: null, seat: { x: u.x, y: u.y, l: u.l, dir: face, p: u.p } }];
        walker.walking = true; walker.then = then || null; walker.last = performance.now(); requestAnimationFrame(stepWalk);
        return true;
    }
    /* come at it from the front if you can, else from either side, never over its back */
    const ent = seatEntries(u), r = routeToOneOf(u.l, [ent.direct[0]], s.l, s.x, s.y) || routeToOneOf(u.l, ent.direct.slice(1), s.l, s.x, s.y);      // the front first, then its diagonals and sides
    if (!r) {
        const seated = (x, y) => (u.l.props || []).some(p => isSeat(p.k) && Parts.tiles(p).some(t => t[0] === x && t[1] === y));
        for (const q of [[u.x - 1, u.y], [u.x + 1, u.y], [u.x, u.y - 1], [u.x, u.y + 1]]) {
            if (!seated(q[0], q[1])) continue;
            const via = routeToOneOf(u.l, [[q[0] - 1, q[1]], [q[0] + 1, q[1]], [q[0], q[1] - 1], [q[0], q[1] + 1]], s.l, s.x, s.y); if (!via) continue;
            followRoute(via.path, s.here, () => {
                walker.pts = [{ x: q[0], y: q[1], z: z + (SEAT_LIFT[u.p.k] || 7), l: u.l, st: null }, { x: u.x, y: u.y, z: z + (SEAT_LIFT[u.p.k] || 7), l: u.l, st: null, seat: { x: u.x, y: u.y, l: u.l, dir: face, p: u.p } }];
                walker.walking = true; walker.then = then || null; walker.last = performance.now(); requestAnimationFrame(stepWalk);
            });
            return true;
        }
        if (!then) noWay("There's no way to that seat."); return false;
    }
    followRoute(r.path, s.here, () => {
        walker.pts = [{ x: u.x, y: u.y, z: z + (SEAT_LIFT[u.p.k] || 7), l: u.l, st: null, seat: { x: u.x, y: u.y, l: u.l, dir: face, p: u.p } }];
        walker.walking = true; walker.then = then || null; walker.last = performance.now(); requestAnimationFrame(stepWalk);
    });
    return true;
}
/* Double-click the water cooler: walk up to it, turn to it, and come away with a drink */
const DRINK_MS = 120000, SIP_EVERY = 9000, SIP_MS = 1400;
function getDrink(u) {
    const s = walkerStart(), around = []; for (const q of DIRS) around.push([u.x + q.dx, u.y + q.dy]);
    const r = routeToOneOf(u.l, around, s.l, s.x, s.y);
    if (!r) { noWay("There's no way to the water cooler."); return; }
    followRoute(r.path, s.here, () => {
        const face = directionOf(u.x - r.x, u.y - r.y); if (face >= 0) walker.dir = face;
        walker.drink = { until: performance.now() + DRINK_MS, from: performance.now() };
        flash("A cup of water. It lasts a couple of minutes."); paint();
    });
}
function startWalk() {
    const [l, x, y] = liftTile();
    walker = { l, x, y, z: nodeZ(l, x, y), pts: [], t: 0, dir: 4, frame: 0, walking: false, st: null };
    /* arrive through the entrance: start inside the arch and walk out */
    if (map.entrance && l === byId(map.entrance.level)) {
        const S = stairLevels().list.find(q => q.stair.entrance), e = map.entrance, m = entranceTiles(e)[1], ix = e.axis === "x" ? m : e.line - 3, iy = e.axis === "x" ? e.line - 3 : m;
        if (S) { walker.l = S; walker.x = ix; walker.y = iy; walker.z = nodeZ(S, ix, iy); walker.arriving = true; const path = graphFrom(S, ix, iy, [l, x, y]); if (path) { const me = walker, go = () => { if (walker === me && walker.arriving) followRoute(path, null, null); }, gate = window.HALLWAY_PLAY ? (window.hallwayArrivalGate = window.hallwayArrivalGate || { held: true, go: null }) : null; if (gate && gate.held) gate.go = go; else setTimeout(go, 200); } }      /* on the site, held until the picker is done (play.js hallwayArrivalGate) */
    }
    cam.x = (x - y) * 16; cam.y = (x + y) * 8 - levelZ(l) - 60;
    /* on the site, the hallway opens on its statue (or its Christmas tree), wherever you come in */
    /* at Christmas a little higher, so the giant tree's star is in view too (10 Nov scan, live 4); and where the screen is too small for the
       statue and you both (a phone), between the two, or on you (live 3: your Habbo started off the screen) */
    if (window.HALLWAY_PLAY) { for (const lv of map.levels) { const st = (lv.props || []).find(p => p.k === "statue"); if (st) { const a = P(st.x + 1, st.y + 1, tileZ(lv, st.x, st.y) + 40 + (window.hallwayXmas ? 150 : 0)); cam.x = a[0]; cam.y = a[1]; openHeld = true;
        const you = P(x + .5, y + .5, nodeZ(l, x, y) + 40), hw = canvas.width / zoom / 2, hh = canvas.height / zoom / 2, fits = (cx, cy) => Math.abs(you[0] - cx) < hw * .8 && Math.abs(you[1] - cy) < hh * .8;
        if (!fits(cam.x, cam.y)) { const mx = (you[0] + cam.x) / 2, my = (you[1] + cam.y) / 2; if (fits(mx, my)) { cam.x = mx; cam.y = my; } else { cam.x = you[0]; cam.y = you[1]; } }
        break; } } }
    clampCam();
    paint();
}
function walkTo(px, py) {
    if (!walker) return;
    const under = floorUnder(px, py);
    if (!under) return;
    const [l, X, Y] = under;
    /* a new click mid-walk finishes the step under way first, so the feet never leave the grid */
    /* no way to it: the nearest tile round it you can get to. A search that fails has flooded the whole area cut off from you, so the tiles
       round it in that same area are skipped, not searched again: a search per tile flooded it 48 times over, a third of a second here and
       over two on a phone (15 Nov scan, live M8) */
    /* and a tile nobody can stand on (no floor, or furniture on it) can't be walked to at all, so it isn't searched either */
    const s = walkerStart(), cut = new Set(); let path = graphFrom(s.l, s.x, s.y, [l, X, Y], cut);
    if (!path && !(s.l.stair && s.l.stair.lift)) { const so = l.tiles ? null : solid(l), standable = (x, y) => l.tiles ? l.tiles.has(x + "," + y) : hasFloor(l, x, y) && !so.has(x + "," + y);
        for (let r = 1; r <= 3 && !path; r++) for (let a = -r; a <= r && !path; a++) for (let b = -r; b <= r && !path; b++) { if (Math.max(Math.abs(a), Math.abs(b)) === r && standable(X + a, Y + b) && !cut.has(nodeKey(l, X + a, Y + b))) path = graphFrom(s.l, s.x, s.y, [l, X + a, Y + b], cut); } }
    if (!path) { noWay("There's no way there."); return; }
    /* the "travel" cheat (9 Nov 2026, his): straight to the tile, no walk; only where a walk could have gone, so never into a wall or furniture */
    if (cheats.travel) {
        const [id, sx, sy] = path[path.length - 1].key.split("|"), L = nodeLevel(id);
        walker.pts = []; walker.walking = false; walker.seat = null; walker.then = null; walker.arriving = false;
        walker.l = L; walker.x = +sx; walker.y = +sy; walker.z = nodeZ(L, +sx, +sy); walker.st = L.stair || null; walker.frame = 0;
        markActive(); followNow(); paint(); return;
    }
    followRoute(path, s.here, null);
}
/* typed cheats from play.js: speed multiplies the walk, travel jumps to the clicked tile */
const cheats = { speed: 1, travel: false };
const MS_PER_TILE = 500, WALK_FRAME_MS = 84;     // the game's own: a tile takes half a second, whichever way
function stepWalk(now) {
    if (!walker || !walker.walking) return;
    const dt = Math.min(200, now - walker.last); walker.last = now;
    let budget = dt / MS_PER_TILE * cheats.speed;
    while (budget > 0 && walker.pts.length) {
        const n = walker.pts[0], dx = n.x - walker.x, dy = n.y - walker.y, d = Math.max(Math.abs(dx), Math.abs(dy));
        const face = directionOf(dx, dy); if (face >= 0) walker.dir = face;
        walker.st = n.st || null;
        if (d < 1e-6) { if (n.l) walker.l = n.l; walker.z = n.z; walker.pts.shift(); continue; }
        const step = Math.min(budget, d);
        walker.x += dx / d * step; walker.y += dy / d * step; walker.z += (n.z - walker.z) * step / d;
        budget -= step;
        if (step >= d - 1e-6) { walker.x = n.x; walker.y = n.y; walker.z = n.z; if (n.l) walker.l = n.l; walker.st = n.st || null; if (n.seat) { walker.seat = n.seat; walker.dir = n.seat.dir; } walker.pts.shift(); }
    }
    if (!walker.pts.length) {
        walker.walking = false; walker.st = null;
        if (walker.then) { const t = walker.then; walker.then = null; t(); }
    }
    walker.frame = (walker.frame + dt / WALK_FRAME_MS) % 4;
    paint();
    if (walker.walking) requestAnimationFrame(stepWalk);
}
function avatarImg(n) {
    let i = avatarImgs[n];
    if (!i) {
        const src = window.hallwayAvatarSrc ? window.hallwayAvatarSrc(n) : "art/av/" + n + ".png", local = "art/av/" + n + ".png";
        i = avatarImgs[n] = new Image(); i.onload = () => paint();
        /* Habbo not answering: the guest's own frame meanwhile, and that frame asked for again later, so nobody walks unseen */
        i.onerror = () => { if (i.src.endsWith(local)) return; i.src = local; setTimeout(() => { if (avatarImgs[n] !== i) return; const t = new Image(); t.onload = () => { if (avatarImgs[n] === i) { avatarImgs[n] = t; paint(); } }; t.src = src; }, 20000); };
        i.src = src;
    }
    return i;
}
window.hallwayAvatarChanged = () => { avatarWas = { ...avatarImgs }; for (const k in avatarImgs) delete avatarImgs[k]; preloadAvatar(); paint(); if (roomSession && roomSession.repaint) roomSession.repaint(); };      // a room only paints when asked
function preloadAvatar() { if (window.HALLWAY_PLAY) { for (let d = 0; d < 8; d++) { avatarImg(`s-${d}-std-0`); avatarImg(`s-${d}-sit-0`); for (let f = 0; f < 4; f++) avatarImg(`s-${d}-wlk-${f}`); } return; } for (let d = 0; d < 8; d++) { for (const a of ["std", "std-crr", "std-drk", "sit", "sit-crr", "sit-drk"]) avatarImg(`s-${d}-${a}-0`); for (let f = 0; f < 4; f++) { avatarImg(`s-${d}-wlk-${f}`); avatarImg(`s-${d}-wlk-crr-${f}`); } } }

/* ---------- what stands in front of the Habbo ----------
   The art is one picture, so what's nearer than the Habbo is cut out of the Habbo's own shape, and
   the picture shows through: furniture, walls, and on stairs the floor above. The real page will
   sort these for real. This is here so walking looks the way it will. */
let REGS = null;
fetch("art/regs.json").then(r => r.json()).then(j => { REGS = j; });
const spriteImgs = {};
function spriteImg(path) { let i = spriteImgs[path]; if (!i) { i = spriteImgs[path] = new Image(); i.onload = () => paint(); i.src = path; } return i; }
const avCanvas = document.createElement("canvas"); avCanvas.width = 33; avCanvas.height = 56;
const avCtx = avCanvas.getContext("2d", { willReadFrequently: true });
function cutSprite(c, img, x, y, flip) {
    if (!img.complete || !img.naturalWidth) return;
    c.save();
    if (flip) { c.translate(x + img.naturalWidth, y); c.scale(-1, 1); c.drawImage(img, 0, 0); } else c.drawImage(img, x, y);
    c.restore();
}
function cutPoly(c, pts) { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); }
/* a tile against the Habbo: nearer along x or y, with a tile's grace for art that spills over its edge, as the map itself orders things. Where that says nothing, the nearer diagonal. */
/* ---------- the freestanding archway (render/hw3.js archwayArt): its posts, and whether each end meets a wall ---------- */
function archEnds(l, p) { const ts = Parts.tiles(p), n = ts.length, alongY = !!((p.rot || 0) & 1); return { ts, n, alongY, wallA: alongY ? !hasFloor(l, p.x, p.y - 1) : !hasFloor(l, p.x - 1, p.y), wallB: alongY ? !hasFloor(l, p.x, p.y + n) : !hasFloor(l, p.x + n, p.y) }; }
function archPosts(l, p) { const e = archEnds(l, p), out = []; if (!e.wallA) out.push(e.ts[0]); if (!e.wallB) out.push(e.ts[e.n - 1]); return out; }
/* walking behind it, its posts and beam stand in front of you: their shapes on its plane, through the middle of its row */
function cutArchways(c, l, ax, ay, nearby) {
    for (const p of (l.props || [])) { if (p.k !== "archway") continue; const e = archEnds(l, p), behind = e.alongY ? ax < p.x : ay < p.y; if (!behind) continue;
        const within = e.alongY ? ay > p.y - 3 && ay < p.y + e.n + 2 : ax > p.x - 3 && ax < p.x + e.n + 2; if (!within) continue;
        const z = tileZ(l, p.x, p.y), at = (along, up) => e.alongY ? P(p.x + .5, p.y + along, z + up) : P(p.x + along, p.y + .5, z + up), quad = (a0, a1, u0, u1) => cutPoly(c, [at(a0, u0), at(a1, u0), at(a1, u1), at(a0, u1)]);
        if (!nearby(at(e.n / 2, 0))) continue;
        quad(0, e.n, 70, 118);
        if (!e.wallA) quad(0, 1.4, 0, 118);
        if (!e.wallB) quad(e.n - 1.1, e.n + .3, 0, 118);          // the art's far post is 17px, its depth a little beyond
    }
}
function inFrontOfYou(X, Y, ax, ay) {
    const G = .99, youBehind = (ax + 1 <= X && ay < Y + 1 + G && Y < ay + 1 + G) || (ay + 1 <= Y && ax < X + 1 + G && X < ax + 1 + G), itBehind = (X + 1 <= ax && Y < ay + 1 + G && ay < Y + 1 + G) || (Y + 1 <= ay && X < ax + 1 + G && ax < X + 1 + G);
    if (youBehind !== itBehind) return youBehind;
    return X + Y > ax + ay;
}
/* soft: keep the canvas's own soft pixels (the window snow, the festoons' glow, halos and shadow); everything else gets hard edges, as below */
function cutInFront(c, x0, y0, soft) {
    const ax = walker.x, ay = walker.y;
    /* still on the flight's last tile as the next step heads onto a floor: it's still the stairs that count */
    const onStair = walker.st || walker.l.stair || null, l = onStair ? onStair.low : walker.l, z = levelZ(l);
    /* going through a maze's door you're past its wall: what lies beyond that wall on this floor is nowhere near you, whatever the picture says. Only the opening holds you */
    const lostNow = onStair && onStair.lost, doorNow = onStair && (onStair.door || lostNow), pastDoor = (X, Y) => !!doorNow && (doorNow.axis === "x" ? Y < doorNow.line : X < doorNow.line);
    c.save(); c.translate(-x0, -y0); c.globalCompositeOperation = "destination-out"; c.fillStyle = "#000";
    /* furniture: nearer on this floor, and everything on the floors in front */
    if (REGS) for (const lv of map.levels) {
        if (lv.k > l.k) continue;
        const lz = levelZ(lv);
        const nearby = a => !(Math.abs(a[0] - (x0 + 16)) > 90 || a[1] < y0 - 40 || a[1] > y0 + 180);
        for (const p of (lv.props || [])) {
            if (lv === l && pastDoor(p.x, p.y)) continue;
            if (p.k === "lamp") {
                if (lv === l && p.x + p.y <= ax + ay) continue;
                if (!nearby(P(p.x, p.y, tileZ(lv, p.x, p.y)))) continue;
                const m = P(p.x + .5, p.y + .5, tileZ(lv, p.x, p.y)); if (p.style === "globe") { c.fillRect(m[0] - 2, m[1] - 13, 5, 15); c.fillRect(m[0] - 5, m[1] + -1, 11, 3); c.beginPath(); c.arc(m[0] + .5, m[1] - 18, 6.5, 0, Math.PI * 2); c.fill(); continue; }
                c.fillRect(m[0] - 2, m[1] - 37, 5, 39); cutPoly(c, [[m[0] - 11, m[1] - 35], [m[0] + 11, m[1] - 35], [m[0] + 8, m[1] - 50], [m[0] - 8, m[1] - 50]]);
                continue;
            }
            /* at Christmas the statue is the giant tree, drawn over the sofas round it: what's behind it is cut by the tree's own shape */
            if (p.k === "statue" && window.hallwayXmas && floorPiece("bigtree")) { const fp = floorPiece("bigtree"), im = pieceImg(fp.f), a = P(p.x + 1, p.y + 1, tileZ(lv, p.x, p.y)); if ((lv !== l || ax + ay < p.x + p.y + 2.6) && im.complete && im.naturalWidth && Math.abs(a[0] - (x0 + 16)) < fp.w && a[1] - fp.oy < y0 + 120 && a[1] + fp.h > y0) cutSprite(c, im, Math.round(a[0]) - fp.ox, Math.round(a[1]) - fp.oy, false); continue; }
            if (pieceOf(p) && !p.k.startsWith("mark_") && !(XMAS_PROP(p.k) && !window.hallwayXmas) && !(walker.seat && walker.seat.p === p)) { const pc = pieceOf(p), fp = pc.fp, im = pieceImg(pc.f), a = P(p.x + pc.dx, p.y + pc.dy, tileZ(lv, p.x, p.y) + pc.up), run = Parts.tiles(p), last = run[run.length - 1], flipIt = (p.k === "trophy" && !((p.rot || 0) & 1)) || ((p.k === "rarecase" || p.k.startsWith("arcade_")) && ((p.rot || 0) & 1)); if ((lv !== l || inFrontOfYou(last[0], last[1], ax, ay)) && nearby(a) && im.complete && im.naturalWidth) { if (flipIt) { c.save(); c.translate(a[0], 0); c.scale(-1, 1); c.drawImage(im, -fp.ox, a[1] - fp.oy); c.restore(); } else c.drawImage(im, a[0] - fp.ox, a[1] - fp.oy); } continue; }
            if (p.k.startsWith("mark_")) continue;
            if (p.k === "archway") { if (lv !== l) { for (const q of Parts.tiles(p)) { const a = P(q[0] + .5, q[1] + .5, tileZ(lv, q[0], q[1])); if (nearby(a)) cutPoly(c, [[a[0] - 17, a[1]], [a[0] + 17, a[1]], [a[0] + 17, a[1] - 118], [a[0] - 17, a[1] - 118]]); } } else cutArchways(c, lv, ax, ay, nearby); continue; }
            if (p.k === "rope") { const art = ropeArt(lv, p); for (const [X, Y, , t] of art.list) { const q = art.row[t]; if ((lv !== l || inFrontOfYou(q[0], q[1], ax, ay)) && nearby([X, Y])) c.fillRect(X, Y, 1, 1); } continue; }
            if (walker.seat && walker.seat.p === p) {
                /* you sit on the seat. A chair turned away from the camera has its back nearer than you, so that part covers you. */
                if (p.k === "chair" && ((p.rot || 0) & 3) >= 2) for (const q of Parts.parts(p)) { const a = P(q.x, q.y, tileZ(lv, q.x, q.y)), name = q.names[1], reg = REGS.hall[name], img = spriteImg("art/hall/hh_room_hallway/" + name + ".png"), lx = a[0] - 16, ly = a[1] + 8; if (reg) cutSprite(c, img, q.flip ? lx + 32 + reg[0] - img.naturalWidth : lx - reg[0], ly - reg[1], q.flip); }
                continue;
            }
            for (const q of Parts.parts(p)) {
                /* a thing hidden under the furniture on its own tile (Lost Property) has that furniture in front of it too */
                if (lv === l && !inFrontOfYou(q.x, q.y, ax, ay) && !(walker.under && q.x === Math.floor(ax) && q.y === Math.floor(ay))) continue;
                const a = P(q.x, q.y, tileZ(lv, q.x, q.y)); if (!nearby(a)) continue;
                const lx = a[0] - 16, ly = a[1] + 8;
                for (const name of q.names) {
                    const reg = REGS.hall[name], img = spriteImg("art/hall/hh_room_hallway/" + name + ".png"); if (!reg) continue;
                    cutSprite(c, img, q.flip ? lx + 32 + reg[0] - img.naturalWidth : lx - reg[0], ly - reg[1], q.flip);
                }
            }
        }
        for (const t of (lv.teles || [])) {
            if (lv === l && t.x + t.y <= ax + ay) continue;
            const a = P(t.x, t.y, lz), n = "s_doorD_b_0_1_1_4_0", reg = REGS.tele[n], img = spriteImg("art/tele/hh_furni_special_50/" + n + ".png"), lx = a[0] - 16, ly = a[1] + 8;
            if (reg) cutSprite(c, img, t.flip ? lx + 32 + reg[0] - img.naturalWidth : lx - reg[0], ly - reg[1], t.flip);
        }
    }
    /* railings along a front edge you're behind, pixel for pixel, so you still show between the bars */
    if (window.EdgeItems) for (const lv of map.levels) {
        if (lv.k > l.k || !lv.edgeItems || !lv.edgeItems.length) continue;
        const zv = levelZ(lv);
        for (const run of EdgeItems.runsOf(lv.edgeItems)) {
            const alongX = run.axis === "x", front = run.dir <= 0;
            if (lv === l) { if (!front) continue; if (alongX ? run.line <= ay + .5 : run.line <= ax + .5) continue; }
            const near = alongX ? Math.abs(ax - Math.max(run.a, Math.min(run.b, ax))) : Math.abs(ay - Math.max(run.a, Math.min(run.b, ay))); if (lv === l && near > 6) continue;
            const a2 = Math.max(run.a, Math.floor((alongX ? ax : ay) - 8)), b2 = Math.min(run.b, Math.ceil((alongX ? ax : ay) + 8)); if (b2 <= a2) continue;
            const tileOf2 = t => alongX ? [t, front ? run.line - 1 : run.line] : [front ? run.line - 1 : run.line, t];
            const lift = along => { const t = tileOf2(Math.floor(along)); return heightAt(lv, t[0], t[1]); };
            for (const q of EdgeItems.pixels({ ...run, a: a2, b: b2 }, (fx, fy) => P(fx, fy, zv), lift)) c.fillRect(q[0], q[1], 1, 1);
        }
    }
    /* in a lift: its doors are in front of you, as far as they've closed */
    const inLift = walker.l.stair && walker.l.stair.lift;
    if (inLift) {
        const st = liftDoors.get(inLift), slid = Math.round((st ? st.p : 0) * 24), o = P(inLift.x, inLift.y, tileZ(l, inLift.x, inLift.y)), mx = liftLeft(inLift) ? u => o[0] + 1 - u : u => o[0] + u, leaf = (u0, u1) => { if (u1 > u0) cutPoly(c, [[mx(u0), o[1] + Math.floor(u0 / 2) + 1], [mx(u1), o[1] + Math.floor(u1 / 2) + 1], [mx(u1), o[1] + Math.floor(u1 / 2) - 76], [mx(u0), o[1] + Math.floor(u0 / 2) - 76]]); };
        leaf(0, 24 - slid); leaf(24 + slid, 48);
    }
    /* behind the counter: it's in front of you */
    if (lostNow) { const q = lostNow, at = (back, along, up) => q.axis === "y" ? P(q.line + back, q.o + along, z + up) : P(q.o + along, q.line + back, z + up), e = 5; cutPoly(c, [at(.375, 0, 0), at(.375, e, 0), at(.375, e, 31), at(-.625, e, 31), at(-.625, 0, 31), at(.375, 0, 31)]); }
    /* walls on this floor that stand nearer than the Habbo */
    const below = map.levels.find(q => q.k === l.k - 1);
    const open = (X, Y, axis) => !hasFloor(l, X, Y) && wallStands(l, X, Y, axis);
    const inDoor = lostNow ? null : doorNow, inOpening = (X, Y, axis) => (lostNow && lostNow.axis === axis && lostNow.line === (axis === "x" ? Y : X) && (axis === "x" ? X : Y) >= lostNow.o && (axis === "x" ? X : Y) < lostNow.o + 6) || (inDoor && inDoor.axis === axis && inDoor.line === (axis === "x" ? Y : X) && doorFront(inDoor).some(t => axis === "x" ? t[0] === X : t[1] === Y)) || (map.lifts.some(q => q.level === l.id && liftAxis(q) === axis && (axis === "x" ? q.y === Y && X >= q.x && X < q.x + 3 : q.x === X && Y >= q.y && Y < q.y + 3))) || (map.entrance && map.entrance.level === l.id && map.entrance.axis === axis && map.entrance.line === (axis === "x" ? Y : X) && entranceTiles(map.entrance).includes(axis === "x" ? X : Y)) || map.stairs.some(s => s.low === l.id && (thruLeft(s) ? axis === "y" && s.x === X && Y >= s.a && Y < s.b : axis === "x" && s.y === Y && X >= s.a && X < s.b));
    const R = 14, tx = Math.floor(ax), ty = Math.floor(ay);
    for (let X = tx - R; X <= tx + R; X++) for (let Y = ty - R; Y <= ty + R; Y++) {
        if (!hasFloor(l, X, Y) || pastDoor(X, Y)) continue;
        const zt = tileZ(l, X, Y), zw = zt - ((l.floorLift && l.floorLift[cellKey(X, Y)]) || 0);      // a wall stands where its rise puts it, under a floor raised on its own
        if (Y > ay && open(X, Y - 1, "x") && !inOpening(X, Y, "x")) { const hw = isNone(l, "x", Y, X) ? 0 : isHalf(l, "x", Y, X) ? HALF_WALL : WALL; cutPoly(c, [P(X, Y, zt), P(X + 1, Y, zt), P(X + 1, Y, zw + hw), P(X, Y, zw + hw)]); }
        if (X > ax && open(X - 1, Y, "y") && !inOpening(X, Y, "y")) { const hw = isNone(l, "y", X, Y) ? 0 : isHalf(l, "y", X, Y) ? HALF_WALL : WALL; cutPoly(c, [P(X, Y, zt), P(X, Y + 1, zt), P(X, Y + 1, zw + hw), P(X, Y, zw + hw)]); }
        /* a raised part of the floor in front covers you */
        if (zt > walker.z + 2 && X + Y > ax + ay && !stepsAt(l, X, Y)) cutPoly(c, [P(X, Y, zt), P(X + 1, Y, zt), P(X + 1, Y + 1, zt), P(X, Y + 1, zt)]);
    }
    for (const q of (l.doors || [])) {
        if (q === inDoor) continue;
        const t0 = q.axis === "x" ? q.at : q.at - 2; if (!stepsDrop(l, q.axis, q.line, t0)) continue;
        const r = retaining(l, q.axis, q.line, t0), zq = wallZ(l, q);
        if (q.axis === "x" && ay < q.line) cutPoly(c, [P(r.a, q.line, zq), P(r.b, q.line, zq), P(r.b, q.line, zq + r.H), P(r.a, q.line, zq + r.H)]);
        if (q.axis === "y" && ax < q.line) cutPoly(c, [P(q.line, r.a, zq), P(q.line, r.b, zq), P(q.line, r.b, zq + r.H), P(q.line, r.a, zq + r.H)]);
    }
    /* on stairs, the floor above covers everything it reaches */
    const up = onStair ? onStair.up : map.levels.find(q => q.k === l.k + 1);
    if (up) {
        const zu = levelZ(up), hs = holes(up);
        for (let X = tx - R - 4; X <= tx + R + 4; X++) for (let Y = ty - R - 4; Y <= ty + R + 4; Y++) {
            if (!hasFloor(up, X, Y) || hs.some(h => inRect(h, X, Y)) || X + Y <= ax + ay) continue;
            cutPoly(c, [P(X, Y, zu), P(X + 1, Y, zu), P(X + 1, Y + 1, zu), P(X, Y + 1, zu)]);
            if (!hasFloor(up, X, Y + 1)) cutPoly(c, [P(X, Y + 1, zu), P(X + 1, Y + 1, zu), P(X + 1, Y + 1, zu - 13), P(X, Y + 1, zu - 13)]);
        }
    }
    if (inDoor && inDoor.line - ((inDoor.axis === "x" ? ay : ax) + .5) > .05) { const a = doorPoint(l, inDoor), f = inDoor.axis === "x" ? 1 : -1; c.globalCompositeOperation = "destination-in"; c.beginPath(); c.moveTo(a[0], a[1] + 2); c.lineTo(a[0] + 32, a[1] + f * 16 + 2); c.lineTo(a[0] + 32, a[1] + f * 16 - 62); c.lineTo(a[0], a[1] - 62); c.closePath(); c.fill(); }
    c.restore();
    /* hard edges, as everything else here has: over the whole canvas it was given (9 Nov scan, page finding 2: it was always the avatar's
       33 by 56 in the top left, so a bigger canvas came out hard in that corner and soft everywhere else). Soft pictures skip it: they're
       meant to be see-through, and only the cut's own edge is left a little soft */
    if (soft) return;
    const W = c.canvas.width, H = c.canvas.height, d = c.getImageData(0, 0, W, H); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 127 ? 255 : 0; c.putImageData(d, 0, 0);
}
function drawWalker() {
    const now = performance.now(); if (walker.drink && now > walker.drink.until) walker.drink = null;
    const dr = walker.drink, sipping = dr && (now - dr.from) % SIP_EVERY > SIP_EVERY - SIP_MS && !walker.walking, hand = dr ? (sipping ? "-drk" : "-crr") : "";
    const n = walker.walking ? `s-${walker.dir}-wlk${dr ? "-crr" : ""}-${((Math.floor(walker.frame) % 4) + 4) % 4}` : walker.seat ? `s-${walker.dir}-sit${hand}-0` : `s-${walker.dir}-std${hand}-0`;
    const held = window.HallwayCarry && HallwayCarry.item, nameNow = held && !dr ? (walker.walking ? `s-${walker.dir}-wlk-crr-${((Math.floor(walker.frame) % 4) + 4) % 4}` : walker.seat ? n : `s-${walker.dir}-std-crr-0`) : n;
    let img = avatarImg(nameNow);
    if ((!img.complete || !img.naturalWidth) && avatarWas[nameNow] && avatarWas[nameNow].naturalWidth) img = avatarWas[nameNow];      // the old look until the new one's here
    if (!img.complete || !img.naturalWidth) return;
    const p = P(walker.x + .5, walker.y + .5, walker.z), feetX = Math.round(p[0]), feetY = Math.round(p[1]), x0 = feetX - 16, y0 = feetY - 50;
    avCtx.clearRect(0, 0, 33, 56);
    /* a soft pixel shadow under the feet, on the floor: in the figure's own picture, so what hides the feet hides it too (10 Nov scan, live 7: it
       sat on the face of a wall in front) */
    if (!walker.st && !walker.seat) { avCtx.fillStyle = "rgba(0,0,0,.28)"; avCtx.fillRect(8, 49, 16, 2); avCtx.fillRect(11, 48, 10, 4); }
    if (window.HallwayCarry && (held || dr) && nameNow.includes("-crr-") || (window.HallwayCarry && dr)) HallwayCarry.draw(avCtx, img, nameNow, walker.dir, avatarImg); else avCtx.drawImage(img, 0, 0);
    cutInFront(avCtx, x0, y0);
    avatarTint(avCtx);
    const ox = Math.round(canvas.width / 2 - cam.x * zoom), oy = Math.round(canvas.height / 2 - cam.y * zoom);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(avCanvas, ox + x0 * zoom, oy + y0 * zoom, 33 * zoom, 56 * zoom);
}

/* ---------- side panel ---------- */
function buildLevels() {
    const box = $("levels"), sel = $("floorSel"); box.textContent = ""; sel.textContent = "";
    for (const l of [...map.levels].sort((a, c) => c.k - a.k)) {
        const n = (l.doors || []).filter(d => !d.spare).length;
        const b = document.createElement("button"); b.type = "button"; b.className = "layer-row";
        const nm = document.createElement("span"); nm.textContent = l.name; b.appendChild(nm);
        const sm = document.createElement("small"); sm.textContent = `${l.colour || WAYS[l.way] || l.way}, ${n} door${n === 1 ? "" : "s"}`; b.appendChild(sm);
        b.setAttribute("aria-pressed", String(l === level));
        b.addEventListener("click", () => setFloor(l));
        box.appendChild(b);
        const o = document.createElement("option"); o.value = l.id; o.textContent = l.name; sel.appendChild(o);
    }
    sel.value = level.id;
    $("way").value = level.way; $("lname").value = level.name;
    $("way").disabled = !!level.colour;
    const fc = $("floorColour"); fc.textContent = "";
    colourRow(fc, "Own colour", () => level.colour || null, v => { const l = level; if (v) l.colour = v; else delete l.colour; $("way").disabled = !!l.colour; }, "#7a2230", "None, using the list");
    $("delLevel").disabled = level.k === 0;
}
function setFloor(l) { if (l === level) return; setCut(null); level = l; hover = null;      /* X's cut was the old floor's heights */ buildLevels(); paint(); flash("Working on " + l.name); }
function stepFloor(d) {
    const list = [...map.levels].sort((a, c) => a.k - c.k), i = list.indexOf(level), n = list[i + d];
    if (n) setFloor(n);
}
function setZoom(z, sx, sy) {
    const r = canvas.getBoundingClientRect(), x = sx === undefined ? r.left + r.width / 2 : sx, y = sy === undefined ? r.top + r.height / 2 : sy;
    const before = toPx(x, y);
    zoom = Math.max(1, Math.min(4, z));
    const after = toPx(x, y);
    cam.x += before[0] - after[0]; cam.y += before[1] - after[1]; clampCam();
    $("zoomVal").textContent = zoom + "x"; $("zoomOut").disabled = zoom === 1; $("zoomIn").disabled = zoom === 4;
    paint(); followNow();
}
function showMapInfo() {
    for (const l of map.levels) if (l.swags && l.swags.length) { const runs = new Map(); for (const k of l.swags) { const [ax, ln, t] = k.split("|"); const key = ax + "|" + ln; if (!runs.has(key)) runs.set(key, []); runs.get(key).push(+t); } l.garlands = l.garlands || []; for (const [key, ts] of runs) { const [ax, ln] = key.split("|"); ts.sort((p, q) => p - q); let a = ts[0], b = a + 1; for (const t of ts.slice(1)) { if (t === b) b++; else { l.garlands.push({ axis: ax, line: +ln, a, b }); a = t; b = t + 1; } } l.garlands.push({ axis: ax, line: +ln, a, b }); } delete l.swags; }
    { const row = $("baubleRow"); if (row && !row.children.length) for (const c of ["red", "gold", "blue", "silver", "purple", "pink", "teal"]) { const f = document.createElement("label"); f.className = "hint"; f.style.marginRight = "8px"; const t = document.createElement("input"); t.type = "checkbox"; t.dataset.c = c; t.addEventListener("change", () => { const on = [...row.querySelectorAll("input")].filter(q => q.checked).map(q => q.dataset.c); if (!on.length) { t.checked = true; return; } snapshot(); map.baubles = on; changed(); }); f.append(t, " " + c); row.appendChild(f); } if (row) for (const t of row.querySelectorAll("input")) t.checked = !map.baubles || map.baubles.includes(t.dataset.c); }
    const so = $("scareOdds"); if (so && document.activeElement !== so) so.value = map.scareOdds === undefined ? 25 : map.scareOdds;
    { const lt = $("leetTimes"), lm = $("leetMins"), ls = map.leetShow || {}, two = n => String(n).padStart(2, "0"), local = iso => { const d = new Date(iso); return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes()); };
      if (lt && document.activeElement !== lt) lt.value = (ls.times || []).map(local).join("\n"); if (lm && document.activeElement !== lm) lm.value = ls.mins || 180;
      const nx = $("leetNext"); if (nx && window.LeetShow) { const t = LeetShow.lines(map, Date.now()); nx.textContent = "The posters say: " + t.join(" "); } }
    /* the Events Gallery's own colours (12 Nov 2026): render/hw3.js draws the Game Hall style from them */
    { const sec = $("galleryLook"), box = $("galleryColours"); if (sec && box) { sec.hidden = mapNow !== "gallery"; box.textContent = "";
        if (mapNow === "gallery") for (const [k, label, def] of [["wall", "Walls", "35574a"], ["dado", "Wood panelling", "4e321e"], ["floor", "Stone floor", "c2ae86"], ["rug", "Rugs", "4e3020"], ["thread", "Rugs' thread", "d8bc84"]])
            colourRow(box, label, () => (map.gh && map.gh[k]) ? "#" + map.gh[k] : null, v => { if (v) (map.gh = map.gh || {})[k] = v.replace(/^#/, ""); else if (map.gh) { delete map.gh[k]; if (!Object.keys(map.gh).length) delete map.gh; } }, "#" + def, "As drawn"); } }
    const r = map.rect, pw = 1440 / 2, ph = 774 / 2;
    $("mapInfo").textContent = `${(r.w / pw).toFixed(1)} pages wide, ${(r.h / ph).toFixed(1)} tall, at 2x.`;
}
/* the other map, looked at as if it were showing, and everything put back after: for counting its problems and marking its Lost Property */
function withPlace(p, fn) {
    if (p === mapNow || !mapOf(p)) return fn();
    const was = { map, mapNow, level, cellSets, lastReport };
    map = mapOf(p); mapNow = p; level = map.levels.find(l => l.k === 0) || map.levels[0]; cellSets = new Map(); stairMemo = null; reachMemo = null; lastReport = null;
    try { return fn(); } finally { ({ map, mapNow, level, cellSets, lastReport } = was); stairMemo = null; reachMemo = null; }
}
const lostSpotStuck = (lv, s) => !!(lv && lv.k >= 0 && !lostSpotReachable(lv, s.x, s.y));
/* at Save: each Lost Property spot nobody can get to is marked (noReach) on both maps, so the server never deals it */
function markNoReach() {
    for (const p of ["hallway", "gallery"]) { const m = mapOf(p); if (!m || !(m.lostSpots || []).length) continue;
        try { withPlace(p, () => { for (const s of m.lostSpots) { if (lostSpotStuck(byId(s.level), s)) s.noReach = true; else delete s.noReach; } }); } catch (e) { console.error(e); } }
}
/* only: just count, with nothing shown (the other map's, for Publish and the badge: 15 Nov scan, editor 16) */
function runChecks(only) {
    if (!map) return 0;
    const box = only ? document.createElement("div") : $("check"); box.textContent = "";
    let problems = 0;
    const card = (t, kind, go) => {
        const e = document.createElement(go ? "button" : "div"); e.className = "problem " + kind; e.textContent = t;
        if (go) { e.type = "button"; e.addEventListener("click", go); }
        box.appendChild(e); if (kind === "err") problems++;
    };
    const named = map.levels.reduce((n, l) => n + (l.doors || []).filter(d => !d.spare).length, 0);
    /* the mazes' doors are the Hallways' (12 Nov 2026: the Events Gallery has none to give) */
    const free = mapNow === "hallway" ? freeMazes() : [], known = new Set(names);
    if (mapNow !== "hallway") { /* nothing about mazes here */ }
    else if (!names.length) card("The archive's maze list couldn't be read, so doors weren't checked against it.", "");
    else card(`${names.length - free.length} of ${names.length} mazes have a door`, free.length ? "err" : "ok");
    if (free.length) card(`Still need a door: ${free.slice(0, 6).join(", ")}${free.length > 6 ? `, and ${free.length - 6} more` : ""}`, "err");
    for (const lv of map.levels) for (const d of (lv.doors || [])) if (names.length && d.name && !known.has(d.name)) card(`A door on ${lv.name} is set to "${d.name}", which isn't in the archive. Show it.`, "err", () => { level = lv; buildLevels(); setTool("select"); select({ type: "door", l: lv, o: d }); });
    const blank = map.levels.reduce((n, l) => n + (l.doors || []).filter(d => !d.spare && !d.name).length, 0);
    if (blank) card(`${blank} doors have no maze. Make them spare, or give them one.`, "");
    if (!map.entrance && mapNow === "hallway") card("There's no entrance yet: Habbos arrive by it. It's in the library, under On walls.", "err");
    /* tunnels (10 Nov scan b, editor 9 and rooms 4): on a floor that's gone, with no floor in front, leading to one that isn't there, or with
       every tile in front of it taken */
    { const rooms = stairLevels().list, show = (lv, q) => () => { level = lv; buildLevels(); const m = entranceTiles(q)[1], a = P(q.axis === "x" ? m : q.line, q.axis === "x" ? q.line : m, levelZ(lv) + 40); cam.x = a[0]; cam.y = a[1]; setTool("select"); select({ type: "tunnel", l: lv, o: q }); paint(); };
      for (const q of (map.tunnels || [])) {
          const lv = byId(q.level); if (!lv) { card("A tunnel is on a floor that's been deleted.", "err"); continue; }
          if (!rooms.some(r => r.stair && r.stair.tunnel === q)) { card(`A tunnel on ${lv.name} has no floor in front of it, so nobody can go in. Show it.`, "err", show(lv, q)); continue; }
          if (q.to && !findTunnel(q.to)) card(`A tunnel on ${lv.name} leads to a tunnel that isn't there any more. Show it.`, "err", show(lv, q));
          else if (!q.to) card(`A tunnel on ${lv.name} doesn't lead anywhere yet. Show it.`, "", show(lv, q));
          const so = solid(lv); if (entranceTiles(q).every(t => { const x = q.axis === "x" ? t : q.line, y = q.axis === "x" ? q.line : t; return !hasFloor(lv, x, y) || so.has(x + "," + y); })) card(`Every tile in front of a tunnel on ${lv.name} is taken, so nobody can come out of it. Show it.`, "err", show(lv, q));
      } }
    /* every room layout's problems, not only the one on screen in Rooms (10 Nov scan b, rooms 8) */
    { const rp = window.RoomsEditor && RoomsEditor.allProblems && mapNow === "hallway" ? RoomsEditor.allProblems(root) : [];
      if (rp.length) card(`${rp.length} room layout${rp.length === 1 ? " has" : "s have"} problems: ${rp.slice(0, 3).map(p => p.name + " (" + p.msgs[0].replace(/\.$/, "").toLowerCase() + ")").join("; ")}${rp.length > 3 ? ", and more" : ""}. Open Rooms.`, "err", () => { if ($("roomsBtn")) $("roomsBtn").click(); }); }
    /* a hunt nobody can finish (10 Nov scan b, rooms 9): no clues, or a clue with no spot picked */
    for (const h of (map.hunts || [])) {
        const clues = h.clues || [], bad = clues.findIndex(c => !c.level || !byId(c.level) || ((c.art || "note") === "none" ? c.px === undefined || c.py === undefined : c.x === undefined || c.y === undefined));
        if (!clues.length) card(`The hunt "${h.name || "?"}" has no clues, so it can't be finished.`, "err");
        else if (bad >= 0) card(`Clue ${bad + 1} of the hunt "${h.name || "?"}" has no spot picked, so the hunt can't be finished. It's in the Hunts tab.`, "err");
    }
    /* floor past the map's edges, floor nobody can walk onto and a floor with no stairs to it aren't problems (9 Nov 2026, his): no cards for them */
    const reached = reachAll();
    const cut = [];
    for (const lv of map.levels) for (const d of (lv.doors || [])) {
        if (d.spare) continue;
        const tx = d.axis === "x" ? d.at : d.line, ty = d.axis === "x" ? d.line : d.at - 1;
        if (![[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]].some(p => reached.has(nodeKey(lv, p[0], p[1])))) cut.push({ lv, d, tx, ty });
    }
    /* a door behind a higher floor can be hidden by it: follow the line of sight up from the door */
    const hidden = [];
    for (const lv of map.levels) {
        const up = map.levels.find(q => q.k === lv.k + 1); if (!up) continue;
        const zGap = Z1, hs = holes(up);
        for (const d of (lv.doors || [])) {
            if (d.spare) continue;
            let covered = 0, tested = 0;
            for (let u = 0; u <= 2; u += .5) for (const h of [10, 40, 70, 90]) {
                const X = d.axis === "x" ? d.at + u : d.line, Y = d.axis === "x" ? d.line : d.at - u, t = (zGap - h) / 16;
                tested++;
                const fx = Math.floor(X + t), fy = Math.floor(Y + t);
                if (hasFloor(up, fx, fy) && !hs.some(r => inRect(r, fx, fy))) covered++;
            }
            if (covered) hidden.push({ lv, d, share: covered / tested });
        }
    }
    for (const c of hidden.slice(0, 8)) card(`${doorName(c.d) || "A door"} on ${c.lv.name} is ${c.share > .6 ? "mostly" : "partly"} hidden by the floor above. Show it.`, "err", () => { level = c.lv; buildLevels(); const a = P(c.d.axis === "x" ? c.d.at : c.d.line, c.d.axis === "x" ? c.d.line : c.d.at, levelZ(c.lv) + 40); cam.x = a[0]; cam.y = a[1]; setTool("select"); select({ type: "door", l: c.lv, o: c.d }); });
    if (hidden.length > 8) card(`And ${hidden.length - 8} more doors are hidden by the floor above.`, "err");
    const fromWhere = mapNow === "gallery" ? "the tunnels from the Hallways" : "the entrance";
    if (!cut.length) card("Every door can be reached from " + fromWhere + ", on foot or by lift", "ok");
    for (const c of cut.slice(0, 8)) card(`A door on ${c.lv.name} can't be reached from ${fromWhere}, on foot or by lift. Show it.`, "err", () => { level = c.lv; buildLevels(); const a = P(c.tx, c.ty, levelZ(c.lv)); cam.x = a[0]; cam.y = a[1]; setTool("select"); select({ type: "door", l: c.lv, o: c.d }); });
    if (cut.length > 8) card(`And ${cut.length - 8} more doors can't be reached.`, "err");
    /* a Lost Property spot nobody can get to, or under furniture with no free tile beside it that anyone can get to, can only end in a miss (9 Nov scan, content finding 1) */
    /* each spot nobody can get to is marked in the map (noReach), so the server never deals it even if he publishes anyway: it can't walk the
       map itself (10 Nov scan, server finding 10) */
    /* the mark itself is only written at Save (markNoReach), so this check never changes the map outside undo (15 Nov scan, editor 21) */
    { const stuck = []; for (const s of (map.lostSpots || [])) { const lv = byId(s.level), bad = lostSpotStuck(lv, s); if (bad) stuck.push({ lv, s }); }
      for (const c of stuck.slice(0, 8)) card(`A Lost Property spot on ${c.lv.name} at ${c.s.x}, ${c.s.y} can't be picked up: nobody can reach it, or a free tile next to it. Move or remove it in the Lost Property tab. Show it.`, "err", () => { level = c.lv; buildLevels(); const a = P(c.s.x + .5, c.s.y + .5, nodeZ(c.lv, c.s.x, c.s.y) || levelZ(c.lv)); cam.x = a[0]; cam.y = a[1] - 20; clampCam(); paint(); });
      if (stuck.length > 8) card(`And ${stuck.length - 8} more Lost Property spots can't be picked up.`, "err"); }
    /* lamps and wall items whose wall has gone: the renderer leaves them out (render/hw3.js report.lost), so they're never seen. One click
       takes them out of the map (9 Nov 2026, his: "just remove those items"); anything else it lists is only named */
    if (lastReport && lastReport.lost && lastReport.lost.length) {
        const gone = [], other = [];
        for (const t of lastReport.lost) {
            const m = /^(.+) ([xy])(-?[\d.]+) on (\S+)$/.exec(t), lv = m && byId(m[4]);
            const list = lv && (m[1] === "lamp" ? lv.lamps : lv.wallItems), q = list && list.find(o => o.axis === m[2] && o.at === +m[3] && (m[1] === "lamp" || (o.k || "wall item") === m[1]));
            if (q) gone.push({ lv, list, q, what: m[1] === "lamp" ? "a wall lamp" : "a wall item (" + m[1] + ")" }); else other.push(t);
        }
        if (gone.length) card(`${gone.length} wall ${gone.length === 1 ? "thing is" : "things are"} on a wall that isn't there any more, so ${gone.length === 1 ? "it's" : "they're"} never drawn: ${gone.map(g => g.what + " on " + g.lv.name).join(", ")}. Remove ${gone.length === 1 ? "it" : "them"}.`, "err", () => {
            snapshot(); for (const g of gone) { const i = g.list.indexOf(g.q); if (i >= 0) g.list.splice(i, 1); } lastReport.lost = other; changed(); runChecks(); flash(gone.length + " removed. Undo puts them back."); });
        /* with its floor's name, and "thing" for one (10 Nov scan b, rooms 14) */
        const said = other.map(t => t.replace(/ on (\S+)$/,(m0, id) => " on " + ((byId(id) || {}).name || id)));
        if (other.length) card(`${other.length} ${other.length === 1 ? "thing" : "things"} couldn't be placed: ${said.slice(0, 4).join(", ")}`, "err");
    }
    /* wall pieces of a kind this editor doesn't have, kept aside rather than dropped (15 Nov scan, editor 2) */
    { const off = map.levels.filter(lv => (lv.wallItemsOff || []).length);
      if (off.length) { const n = off.reduce((s, lv) => s + lv.wallItemsOff.length, 0), kinds = [...new Set(off.flatMap(lv => lv.wallItemsOff.map(q => q.k)))];
          card(`${n} wall ${n === 1 ? "piece is" : "pieces are"} of a kind the editor doesn't have (${kinds.slice(0, 4).join(", ")}${kinds.length > 4 ? ", ..." : ""}), on ${off.map(lv => lv.name).join(", ")}. ${n === 1 ? "It's" : "They're"} kept in the map but not drawn. Remove ${n === 1 ? "it" : "them"}.`, "err", () => {
              snapshot(); for (const lv of off) delete lv.wallItemsOff; changed(); runChecks(); flash(n + " removed. Undo puts them back."); }); } }
    /* two identical pieces on one tile draw as one, so nobody can see the second (15 Nov scan, editor 5) */
    { const dups = [];
      for (const lv of map.levels) { const seen = new Set(); for (const p of (lv.props || [])) { const k = samePieceKey(p); if (seen.has(k)) dups.push({ lv, p }); else seen.add(k); } }
      for (const c of dups.slice(0, 8)) card(`Two of the same piece (${TOOL_NAMES[c.p.k] || c.p.k}) stand on one tile on ${c.lv.name}, at ${c.p.x}, ${c.p.y}. Show it.`, "err", () => { level = c.lv; buildLevels(); const a = P(c.p.x + .5, c.p.y + .5, tileZ(c.lv, c.p.x, c.p.y)); cam.x = a[0]; cam.y = a[1]; clampCam(); setTool("select"); select({ type: "prop", l: c.lv, o: c.p }); paint(); });
      if (dups.length > 8) card(`And ${dups.length - 8} more pieces stand on top of a copy of themselves.`, "err"); }
    /* the other map too (12 Nov 2026, the Events Gallery): its way in and out, and the exhibits, wherever you are */
    { const G = root && root.gallery, here = mapNow === "hallway" ? root : G, there = mapNow === "hallway" ? G : root, nameThere = PLACE_NAME[otherPlace()];
      if (!only && G && (G.levels || []).length) {      // counted once, with the map that's showing
          const links = (there.tunnels || []).filter(t => t.to && findTunnel(t.to)), toHere = links.filter(t => (here.tunnels || []).some(u => u.id === t.to));
          if (!toHere.length) card(mapNow === "hallway" ? "The Events Gallery has no tunnel to the Hallways, so nobody can get in. Link a tunnel there to one here." : "No tunnel in the Hallways leads here, so nobody can get in. Link one.", "err");
          const dead = (there.tunnels || []).filter(t => t.to && !findTunnel(t.to)).length; if (dead) card(`${dead} tunnel${dead === 1 ? "" : "s"} in ${nameThere} lead${dead === 1 ? "s" : ""} to one that isn't there any more. Switch to it to see.`, "err");
          const E = window.GalleryExhibits, seen = new Map(), go = (lv, q, wall) => () => { if (mapNow !== "gallery") setPlace("gallery"); level = lv; buildLevels(); const a = wall ? wallItemCentre(lv, q) : P(q.x + .5, q.y + .5, tileZ(lv, q.x, q.y)); cam.x = a[0]; cam.y = a[1]; setTool("select"); select(wall ? { type: "wallitem", l: lv, o: q } : { type: "prop", l: lv, o: q }); paint(); };
          for (const lv of G.levels) {
              for (const q of lv.wallItems || []) if (/^g_frame_/.test(q.k)) { if (!q.ev) card(`A frame on ${lv.name} in the Events Gallery has no event yet. Show it.`, "", go(lv, q, true)); else { if (seen.has(q.ev)) card(`${(E && E.eventOf(q.ev) || {}).title || q.ev} is hung twice. Show it.`, "", go(lv, q, true)); seen.set(q.ev, q); } }
              for (const p of lv.props || []) if (p.k === "gh_placard" && !p.ev) card(`A placard on ${lv.name} in the Events Gallery has no event, so it opens nothing. Show it.`, "", go(lv, p, false));
          }
          if (E && E.events.length) for (const [k, q] of seen) if (!E.eventOf(k)) card(`An exhibit is for an event that isn't on the site any more (${k}). Show it.`, "err", go(G.levels.find(l => (l.wallItems || []).includes(q)), q, true));
      } }
    if (only) return problems;
    /* Publish sends both maps, so the other one's problems count too (15 Nov scan, editor 16) */
    let other = 0; const op = otherPlace();
    if (mapOf(op) && (mapOf(op).levels || []).length) { try { other = withPlace(op, () => runChecks(true)) || 0; } catch (e) { console.error(e); } }
    if (other) card(`${PLACE_NAME[op].replace(/^t/, "T")} has ${other} problem${other === 1 ? "" : "s"} too. Switch to it to see.`, "err other", () => setPlace(op));
    $("probBadge").textContent = problems + other || ""; lastProblems = problems + other;
    return problems + other;
}

/* ---------- start ---------- */
/* ---------- music ---------- */
function fmtTime(t) { const m = Math.floor(t / 60), x = Math.floor(t % 60); return m + ":" + String(x).padStart(2, "0"); }
function musicOn() { return localStorage.getItem("hallway-music") === "1"; }
/* A phone call or a locked screen stops the sound without saying so: it picks up again when you're back */
const soundBack = () => { if (document.hidden) return; if (window.HallwayAudio && window.HallwayAudio.resume) window.HallwayAudio.resume(); if (window.LiftSounds && LiftSounds.resume) LiftSounds.resume(); };
document.addEventListener("visibilitychange", soundBack); document.addEventListener("pointerdown", soundBack, true);
function showMusic() {
    const A = window.HallwayAudio; if (!A) return;
    const on = A.playing, i = A.current;
    setOn("musicBtn", on);
    $("musicPlay").textContent = on ? "Stop" : "Play";
    $("nowLabel").textContent = on ? "Now playing" : "Music is off";
    $("nowName").textContent = on && i >= 0 ? A.tracks[i].name : "";
    const p = A.position;
    $("nowBar").style.width = p ? Math.min(100, p.at / p.of * 100) + "%" : "0";
    $("nowTime").textContent = p ? fmtTime(Math.max(0, p.at)) + " of " + fmtTime(p.of) : "";
    document.querySelectorAll("#musicList .layer-row").forEach((b, k) => { b.setAttribute("aria-pressed", String(on && k === i)); b.hidden = !!A.inSeason && !A.inSeason(k); });
}
function setMusic(on, track) {
    const A = window.HallwayAudio; if (!A) return;
    localStorage.setItem("hallway-music", on ? "1" : "0");
    if (on) A.start(track); else A.stop();
    showMusic();
}
function buildMusic() {
    const A = window.HallwayAudio; if (!A) return;
    A.onChange = showMusic;
    const list = $("musicList");
    A.tracks.forEach((t, i) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "layer-row"; b.setAttribute("aria-pressed", "false");
        const n = document.createElement("span"); n.textContent = t.name; b.appendChild(n);
        const m = document.createElement("small"); m.textContent = fmtTime(t.minutes * 60); b.appendChild(m);
        b.addEventListener("click", () => { localStorage.setItem("hallway-music", "1"); A.play(i); showMusic(); });
        list.appendChild(b);
    });
    $("musicBtn").addEventListener("click", () => setMusic(!A.playing));
    $("musicPlay").addEventListener("click", () => setMusic(!A.playing));
    $("musicNext").addEventListener("click", () => { localStorage.setItem("hallway-music", "1"); A.next(); showMusic(); });
    const saved = Number(localStorage.getItem("hallway-volume"));
    if (localStorage.getItem("hallway-volume") !== null && !Number.isNaN(saved)) { $("musicVol").value = saved; A.setVolume(saved / 100); }
    $("musicVol").addEventListener("input", e => { A.setVolume(e.target.value / 100); localStorage.setItem("hallway-volume", e.target.value); });
    /* browsers only allow sound after a click; if it was on last time, the first click brings it back */
    if (musicOn()) {
        /* a press on the music's own buttons, or in the picker, or typing, decides nothing: it waits for a press that's meant for the hallway */
        const first = e => { const own = e.type === "keydown" ? (e.key || "").toLowerCase() === "m" || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) : e.target && e.target.closest && e.target.closest("#playBar, .play-menu, #playPicker, #musicBtn, #musicPlay, #musicNext, #musicList"); if (own) return; document.removeEventListener("pointerdown", first, true); document.removeEventListener("keydown", first, true); if (musicOn() && !A.playing) setMusic(true); };
        document.addEventListener("pointerdown", first, true);
        document.addEventListener("keydown", first, true);
    }
    showMusic();
}
const libShut = new Set((() => { try { return JSON.parse(localStorage.getItem("hallway-editor-shut") || "[]"); } catch (err) { return []; } })());
function buildLibrary() {
    const lib = $("library"); lib.textContent = "";
    const q = $("search").value.trim().toLowerCase();
    for (const [title, list] of TOOLS) {
        if (title === "Christmas" && !window.hallwayXmas) continue;
        const items = list.filter(i => !q || i[1].toLowerCase().includes(q));
        if (!items.length) continue;
        /* each section folds away with a click on its heading, and stays as you left it (8 Nov: "save me some scrolling"); a search shows every match */
        const shut = !q && libShut.has(title), h = document.createElement("button"); h.type = "button"; h.className = "cat-head"; h.setAttribute("aria-expanded", String(!shut));
        h.innerHTML = '<svg class="cat-chev" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const ht = document.createElement("span"); ht.textContent = title; h.appendChild(ht);
        if (shut) { const n = document.createElement("span"); n.className = "cat-count"; n.textContent = items.length; h.appendChild(n); }
        h.addEventListener("click", () => { if (libShut.has(title)) libShut.delete(title); else libShut.add(title); try { localStorage.setItem("hallway-editor-shut", JSON.stringify([...libShut])); } catch (err) { /* this visit only */ } const top = $("library").scrollTop; buildLibrary(); $("library").scrollTop = top; });
        lib.appendChild(h);
        if (shut) continue;
        const g = document.createElement("div"); g.className = "lib-grid"; lib.appendChild(g);
        for (const [id, label, src] of items) {
            const b = document.createElement("button"); b.type = "button"; b.className = "lib-item"; b.dataset.tool = id; b.title = HINTS[id] || label;
            b.setAttribute("aria-pressed", String(tool === id));
            b.appendChild(thumbEl(src));
            const s = document.createElement("span"); s.className = "lib-label"; s.textContent = label; b.appendChild(s);
            b.addEventListener("click", () => setTool(id));
            g.appendChild(b);
        }
    }
}
function buildUI() {
    for (const [id, label, svg] of MAIN_TOOLS) {
        const b = document.createElement("button"); b.type = "button"; b.className = "tool"; b.dataset.tool = id; b.title = label; b.setAttribute("aria-label", label);
        b.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`;
        b.addEventListener("click", () => setTool(id)); $("mainTools").appendChild(b);
    }
    buildLibrary(); $("search").addEventListener("input", buildLibrary);
    buildMusic();
    $("walkBtn").addEventListener("click", () => setTool(tool === "walk" ? "select" : "walk"));
    if ($("placeSel")) $("placeSel").addEventListener("change", e => { setPlace(e.target.value); e.target.blur(); });
    if ($("roomsBtn")) $("roomsBtn").addEventListener("click", () => window.RoomsEditor.open({ map: () => root, snapshot, undo, redo, save: () => save(), unsnapshot: () => dropSnapshot(), canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0, changed: () => { roomFloors = null; doorFrames.clear(); changed(); } }));
    document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
    for (const [k, v] of Object.entries(LIGHTS)) { const o = document.createElement("option"); o.value = k; o.textContent = v; $("light").appendChild(o); }
    for (const [k, v] of Object.entries(WAYS)) { const o = document.createElement("option"); o.value = k; o.textContent = v; $("way").appendChild(o); }
    $("undo").addEventListener("click", undo); $("redo").addEventListener("click", redo); $("save").addEventListener("click", save);
    if ($("publish")) $("publish").addEventListener("click", publish);
    /* the saved copy is read first: if it won't come, nothing changes and it says so (15 Nov scan, editor 19) */
    $("revert").addEventListener("click", async () => {
        let text, got;
        try { const r = await fetch("/api/map"); if (!r.ok) throw new Error("the server said " + r.status); got = r; text = await r.text(); JSON.parse(text); }
        catch (e) { flash("Couldn't load the last save: " + (e && e.name === "TypeError" ? (window.HALLWAY_EDIT ? "the site isn't answering" : "the editor's server isn't answering") : (e && e.message) || e) + ". Nothing has changed."); return; }
        putBack(); snapshot();
        stopWalkForChange(); closePicker();
        readMark(got); serverText = JSON.stringify(JSON.parse(text));
        root = JSON.parse(text); migrateHeights(root); fixRoot(); if (!mapOf(mapNow)) mapNow = "hallway"; map = mapOf(mapNow); stairMemo = null; roomFloors = null; doorFrames.clear(); syncPlace(); syncLight();
        level = map.levels.find(l => l.k === 0) || map.levels[0];
        forgetDraft(); dirty = false; $("dirty").hidden = true; $("revert").hidden = true; setSaveState("ok", "Back to the last save");
        select(null); cellSets = new Map(); buildLevels(); showMapInfo(); runChecks(); syncButtons(); requestArt(true); paint();
    });
    /* the lists give the keys back after a pick, as the Map list does, so letters go to the tools again (15 Nov scan, editor 7) */
    $("floorSel").addEventListener("change", e => { setFloor(byId(e.target.value)); e.target.blur(); });
    for (const id of ["timeMode", "light", "way"]) $(id).addEventListener("change", e => e.target.blur());
    $("timeMode").value = timeMode;
    /* Changing the time of day by hand crossfades into the new light rather than jumping (9 Nov 2026, his): the view as it was is laid over
       the top and faded away once the new light's pictures for what's on screen are in (or after a second and a half at most) */
    $("timeMode").addEventListener("change", e => {
        const stage = $("stage"), old = canvas.width && stage ? document.createElement("canvas") : null;
        if (old) { old.width = canvas.width; old.height = canvas.height; old.getContext("2d").drawImage(canvas, 0, 0); old.style.cssText = "position:absolute;left:" + canvas.offsetLeft + "px;top:" + canvas.offsetTop + "px;z-index:24;pointer-events:none;opacity:1;transition:opacity .9s ease;width:" + canvas.clientWidth + "px;height:" + canvas.clientHeight + "px"; stage.appendChild(old); }
        timeMode = e.target.value; localStorage.setItem("hallway-time", timeMode); paint();
        if (!old) return; const t0 = performance.now();
        /* waits for the squares on screen in the new light, the plain ones too: they aren't drawn under a time of day any more, so switching
           to the map's own light went black for a moment (10 Nov scan b, editor 5) */
        const ready = () => { if (!map || !map.rect) return true; const [x0, x1, y0, y1] = visibleTiles(), r = map.rect; for (let ty = Math.max(y0, Math.floor(r.y / TILE)); ty <= Math.min(y1, Math.floor((r.y + r.h) / TILE)); ty++) for (let tx = Math.max(x0, Math.floor(r.x / TILE)); tx <= Math.min(x1, Math.floor((r.x + r.w) / TILE)); tx++) if (!shownFresh(tx, ty)) return false; return true; };
        const fade = () => { if (!ready() && performance.now() - t0 < 4000) { setTimeout(fade, 60); return; } paint(); old.getBoundingClientRect(); old.style.opacity = 0; setTimeout(() => old.remove(), 950); };
        setTimeout(fade, 60);
    });
    $("light").addEventListener("change", e => { snapshot(); map.light = e.target.value; changed(); });
    $("wallPaint").addEventListener("change", e => { wallPaint = e.target.checked; if (!wallPaint && selected && selected.type === "wall") select(null); flash(wallPaint ? "Click a wall to change it." : "Walls can't be clicked now."); });
    $("sortMazes").addEventListener("click", sortByDifficulty);
    $("heightSlider").addEventListener("input", e => setBrush(+e.target.value));
    $("heightLevel").addEventListener("click", () => setBrush(0));
    $("liftStay").addEventListener("click", hideLiftPanel);
    { const b = $("xmasToggle"), show = () => { b.classList.toggle("on", !!window.hallwayXmas); b.setAttribute("aria-pressed", String(!!window.hallwayXmas)); }; show(); b.addEventListener("click", () => { window.hallwayXmas = !window.hallwayXmas; try { localStorage.setItem("hallway-editor-xmas", window.hallwayXmas ? "1" : "0"); } catch (err) { /* this visit only */ } show(); if (!window.hallwayXmas && (XMAS_PROP(tool) || (isWallItemTool(tool) && (wallItemOf(tool.slice(3)) || {}).xmas))) setTool("select"); /* the squares in view stay up until the Christmas (or plain) ones land over them (10 Nov scan, editor 7: the map went black for seconds) */ for (const t of tiles.values()) t.v = null; if (typeof buildLibrary === "function") buildLibrary(); pump(); paint(); }); }
    /* show times: one a line, read in this computer's own time and kept as moments, so every visitor sees them in theirs */
    $("leetTimes").addEventListener("change", e => { const times = []; for (const line of e.target.value.split(/\n/)) { const m = line.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2})[:.](\d{2})$/); if (!m) continue; const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); if (!isNaN(d)) times.push(d.toISOString()); }
        times.sort(); snapshot(); map.leetShow = { ...(map.leetShow || {}), times }; changed(); showMapInfo(); if (window.HallwayLive) HallwayLive.wake(); });
    $("leetMins").addEventListener("change", e => { const v = Math.max(15, Math.min(600, Math.round(+e.target.value || 180))); snapshot(); map.leetShow = { ...(map.leetShow || {}), mins: v }; changed(); showMapInfo(); });
    $("scareOdds").addEventListener("change", e => { const v = Math.max(0, Math.min(500, Math.round(+e.target.value || 0))); snapshot(); map.scareOdds = v; changed(); });
    setBrush(heightBrush);
    $("way").addEventListener("change", e => { snapshot(); level.way = e.target.value; buildLevels(); changed(); });
    /* a floor's name: 24 letters at most (it's on the stair signs and the Floor list), and the box shows what was kept (15 Nov scan, editor 8 and 13) */
    $("lname").maxLength = 24;
    $("lname").addEventListener("change", e => { const v = e.target.value.replace(/\s+/g, " ").trim().slice(0, 24); if (!v || v === level.name) { e.target.value = level.name; return; } snapshot(); level.name = v; e.target.value = v; buildLevels(); changed(); });
    const toggle = (id, fn) => $(id).addEventListener("click", () => { setOn(id, !isOn(id)); fn && fn(); });
    toggle("grid", paint); toggle("liftOpen", () => requestArt(true));
    setOn("follow", localStorage.getItem("hallway-follow") !== "0");
    toggle("follow", () => { localStorage.setItem("hallway-follow", isOn("follow") ? "1" : "0"); followNow(); });
    $("zoomIn").addEventListener("click", () => setZoom(zoom + 1)); $("zoomOut").addEventListener("click", () => setZoom(zoom - 1));
    $("edgesBtn").addEventListener("click", () => setTool("edges"));
    if (window.HALLWAY_EDIT) $("whole").hidden = true;      // the local server draws it, and nothing here can
    if (window.HALLWAY_EDIT) $("publish").title = "Draw the saved map and put it on the site. It's live as soon as it finishes.";      // in the Warren there's no deploy (14 Nov scan)
    $("whole").addEventListener("click", () => { if (version) window.open("/api/whole?v=" + version, "_blank"); });
    const keysBox = $("keys");
    const closeKeys = () => { keysBox.hidden = true; $("help").focus(); };
    $("help").addEventListener("click", () => { keysBox.hidden = false; $("keysClose").focus(); });
    $("keysClose").addEventListener("click", closeKeys);
    keysBox.addEventListener("click", e => { if (e.target === keysBox) closeKeys(); });
    $("addLevel").addEventListener("click", () => {
        snapshot();
        const k = Math.max(...map.levels.map(l => l.k)) + 1;
        const l = { id: "L" + Date.now().toString(36), k, name: "Floor " + k, way: Object.keys(WAYS)[k % 8], cells: [], rugs: [], medals: [], doors: [], lamps: [], props: [], teles: [] };
        map.levels.push(l); level = l; buildLevels(); changed(); setTool("floor");
    });
    /* under the lowest floor. Ground stays at 0, so nothing already on the map moves; the map's area grows downward to fit. */
    $("addBelow").addEventListener("click", () => {
        snapshot();
        const k = Math.min(...map.levels.map(l => l.k)) - 1, n = -k;
        const l = { id: "L" + Date.now().toString(36), k, name: n === 1 ? "Basement" : "Basement " + n, way: Object.keys(WAYS)[((k % 8) + 8) % 8], cells: [], rugs: [], medals: [], doors: [], lamps: [], props: [], teles: [] };
        map.levels.push(l); if (map.rect) map.rect.h += Z1; level = l; buildLevels(); changed(); setTool("floor");
    });
    $("delLevel").addEventListener("click", () => {
        if (level.k === 0) return;
        snapshot();
        const gone = level;
        stopWalkForChange();
        map.levels = map.levels.filter(l => l !== gone);
        map.stairs = map.stairs.filter(s => s.low !== gone.id && s.up !== gone.id);
        map.lifts = map.lifts.filter(q => q.level !== gone.id);
        if (map.entrance && map.entrance.level === gone.id) delete map.entrance;
        /* its tunnels and Theatredrome go too, and a tunnel that led to one of them leads nowhere now (10 Nov scan b, editor 3) */
        if (map.tunnels) { const ids = new Set(map.tunnels.filter(q => q.level === gone.id).map(q => q.id)); map.tunnels = map.tunnels.filter(q => q.level !== gone.id); for (const id of ids) unlinkTunnel(id); if (!map.tunnels.length) delete map.tunnels; }
        if (map.theatres) { map.theatres = map.theatres.filter(q => q.level !== gone.id); if (!map.theatres.length) delete map.theatres; }
        level = map.levels.find(l => l.k === gone.k + (gone.k < 0 ? 1 : -1)) || map.levels.find(l => l.k === 0) || map.levels[0];
        select(null); buildLevels(); changed(); flash(gone.name + " deleted. Undo brings it back.");
    });
    document.addEventListener("keydown", e => {
        /* Ctrl+S saves from anywhere, a box being typed in too (save puts its words in first); Ctrl+Z / Y undo from a list or a button, but
           in a text box they stay the box's own (15 Nov scan, editor 7) */
        if (!window.HALLWAY_PLAY && (e.ctrlKey || e.metaKey) && !e.altKey && keysBox.hidden) {
            const k = e.key.toLowerCase(), typing = e.target.matches && e.target.matches("textarea, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button])");
            if (k === "s") { e.preventDefault(); save(); return; }
            if (!typing && (k === "z" || k === "y") && e.target.matches && e.target.matches("input, select")) { e.preventDefault(); if (k === "y" || e.shiftKey) redo(); else undo(); return; }
        }
        if (e.target.matches && e.target.matches("input, select, textarea, [contenteditable]")) return;
        if (e.code === "Space" && e.target.closest && e.target.closest("button")) return;       // it presses the button
        /* The walking page: looking around, zoom and the music. The rest are the editor's. */
        if (window.HALLWAY_PLAY && (e.ctrlKey || e.metaKey || e.altKey || !(e.code === "Space" || e.key === "+" || e.key === "=" || e.key === "-" || e.key.toLowerCase() === "m" || e.key.startsWith("Arrow")))) return;
        if (!keysBox.hidden) { if (e.key === "Escape") closeKeys(); return; }
        if (e.code === "Space") { spaceHeld = true; e.preventDefault(); return; }
        if (e.key.toLowerCase() === "b" && tool === "globelight" && !e.ctrlKey && !e.metaKey) { if (!backHeld) { backHeld = true; paint(); } return; }
        if (e.key.toLowerCase() === "x" && !e.ctrlKey && !e.metaKey) { if (!e.repeat) seeThroughDown(); return; }
        if (e.key === "Alt") { e.preventDefault(); return; }
        /* Shift alone turns what you're placing, on its release: pressed for another key (? for Keys) it doesn't (10 Nov scan, editor 28) */
        if (e.key === "Shift") { if (!e.repeat) shiftAlone = placingNow(); return; }
        shiftAlone = false;
        const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
        if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (mod && key === "y") { e.preventDefault(); redo(); return; }
        if (mod && key === "s") { e.preventDefault(); save(); return; }
        if (mod) return;
        /* in the middle of a drag: Esc cancels it, and the floor and tool keys wait till the button's up (15 Nov scan, editor 12) */
        if (drag && drag.kind !== "pan") {
            if (e.key === "Escape") { e.preventDefault(); cancelDrag(); return; }
            if (e.key === "PageUp" || e.key === "PageDown" || ({ v: 1, h: 1, w: 1, f: 1, e: 1, r: 1, d: 1 })[key]) { e.preventDefault(); return; }
        }
        if ((e.key === "Delete" || e.key === "Backspace") && selected) { e.preventDefault(); deleteSelected(); return; }
        if (e.key === "Escape" && carry) { putBack(); return; }
        if (e.key === "Escape") { if (tool !== "select") setTool("select"); else if (selected) select(null); return; }
        if (e.key === "PageUp") { e.preventDefault(); stepFloor(1); return; }
        if (e.key === "PageDown") { e.preventDefault(); stepFloor(-1); return; }
        if (e.key === "?") { keysBox.hidden = false; $("keysClose").focus(); return; }
        if (e.key === "+" || e.key === "=") { setZoom(zoom + 1); return; }
        if (e.key === "-") { setZoom(zoom - 1); return; }
        if (key === "r" && placingNow()) { turnHeld(); return; }
        if (key === "r" && tool === "select" && selected && (selected.type === "prop" || selected.type === "tele")) { rotateSelected(); return; }
        const pickTool = { v: "select", h: "pan", w: "walk", f: "floor", e: "erase", r: "rug", d: "door" }[key];
        if (pickTool) { setTool(pickTool); return; }
        if (key === "g") { setOn("grid", !isOn("grid")); paint(); return; }
        if (key === "n") { timeMode = timeMode === "cycle" ? "day" : "cycle"; localStorage.setItem("hallway-time", timeMode); $("timeMode").value = timeMode; flash(timeMode === "cycle" ? "Day and night cycle on" : "Day and night cycle off: always daylight"); paint(); return; }
        if (key === "m") { if (window.HALLWAY_PLAY && musicOn() && !window.HallwayAudio.playing) { localStorage.setItem("hallway-music", "0"); showMusic(); return; } setMusic(!window.HallwayAudio.playing); return; }
        if (key === "c") { setOn("follow", !isOn("follow")); localStorage.setItem("hallway-follow", isOn("follow") ? "1" : "0"); followNow(); return; }
        const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (nudge && selected && nudgeSelected(nudge[0], nudge[1])) { e.preventDefault(); return; }
        const k = { ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -60], ArrowDown: [0, 60] }[e.key];
        if (k) { e.preventDefault(); cam.x += k[0]; cam.y += k[1]; clampCam(); paint(); followNow(); }
    });
    document.addEventListener("keyup", e => { if (e.key === "Shift" && shiftAlone) { shiftAlone = false; if (placingNow()) turnHeld(); } if (e.code === "Space") spaceHeld = false; if (e.key.toLowerCase() === "x") setCut(null); if (e.key.toLowerCase() === "b" && backHeld) { backHeld = false; paint(); } });
    window.addEventListener("blur", () => { setCut(null); backHeld = false; spaceHeld = false; });
    window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
    new ResizeObserver(resize).observe($("stage"));
}
const hallwayStart = (async function start() {
    buildUI();
    /* the wall pictures' list didn't come (15 Nov scan, editor 2): opening the map without it would take every window, painting and sign off it */
    if (!window.HALLWAY_PLAY && !WALL_ITEMS.length) throw new Error("The list of wall pictures (wall-items.js) didn't load, so the map wasn't opened: without it every window, painting and sign would be left off.");
    const [m, n] = await Promise.all([fetch("/api/map").then(r => { if (!r.ok) throw new Error("The map wouldn't load (" + r.status + ")"); readMark(r); return r.text(); }), fetch("/api/names").then(r => r.json())]);
    serverText = JSON.stringify(JSON.parse(m));
    root = JSON.parse(m); map = root; migrateHeights(map); names = n.names || []; fontW = n.font || {}; difficulty = n.difficulty || {};
    /* unsaved work comes back on its own: a prompt here could block the page from loading. This tab's own copy, or one a closed tab left */
    let draft = null; try { draft = window.HALLWAY_PLAY ? null : findDraft(); } catch (e) { /* storage off */ }
    if (draft) { try {
        const d = JSON.parse(draft.text), moved = draft.base !== textMark(serverText);
        /* The saved map has changed since this copy was made: nothing replaces it without asking */
        const use = d && d.levels && (JSON.stringify(d) !== serverText) && (!moved || window.confirm("This browser has unsaved edits, but the saved map has changed since they were made. OK brings your edits back over the saved map. Cancel throws them away and keeps the saved map."));
        if (use) { root = d; map = root; migrateHeights(map); dirty = true; $("dirty").hidden = false; $("revert").hidden = false; }
        /* taken over by this tab, or thrown away: either way the old copy goes (this tab writes its own from here) */
        if (draft.id !== TAB_ID) forgetDraft(draft.id); else if (!use) forgetDraft();
        if (use && draft.id !== TAB_ID) { const [k, b, a] = DRAFT_KEYS(TAB_ID); try { localStorage.setItem(k, draft.text); if (draft.base) localStorage.setItem(b, draft.base); localStorage.setItem(a, String(Date.now())); } catch (e) { /* too big */ } }
    } catch (e) { forgetDraft(draft.id); } }
    fixRoot();
    level = map.levels.find(l => l.k === 0) || map.levels[0];
    $("light").value = map.light || "sconces";
    const li = liftTile(); cam.x = (li[1] - li[2]) * 16 + 120; cam.y = (li[1] + li[2]) * 8 + 60;
    $("namesInfo").textContent = `${names.length} mazes, from the ${n.from || "cached list"}. Each one belongs to its door, and moves with it.`;
    preloadAvatar();
    /* maps from before mazes belonged to doors: lock each maze to the door it's on right now */
    const pinned = names.length ? pinAllMazes() : 0;
    if (names.length) for (const l of map.levels) for (const d of (l.doors || [])) if (!d.name && !d.spare) d.spare = true;
    if (pinned) { if (dirty) { rememberDraft(); } else { await save(); flash(`${pinned} mazes are now locked to their doors.`); } }
    buildLevels(); showMapInfo(); runChecks(); syncButtons(); setTool("select"); select(null); setZoom(zoom); resize(); requestArt(true);
    if (window.HALLWAY_PLAY) setTool("walk");
    window.__hallway = { setDoor, doorAtPx, useDoor, doorStates, doorIsOpen, doorFront, enterDoor, get roomSession() { return roomSession; }, get walker() { return walker; }, stairWallAt, hangWallAt, furniTile, landingOf, placeable, stairWallsOf, setCut, seeThroughDown, get seeCut() { return seeCut; }, edgesNear, railsNear, cam, paint, liftAt, useLift, rideTo, showLiftPanel, liftOpen, setDoors, entranceAt, entranceTiles, useUnder, retaining, doorSpotAt, fitDoor, doorEdge: doorEdge, isNone, wallState, setBrush, flightOf, heightEdgeAt, edgeRun, canStep, isHalf, wallHolds, tileIn, nodeZ, heightAt, stepLift, wallSpot, tidyHeights, get rubbed() { return rubbed; }, sortByDifficulty, doorSpots, wallStretch, pickColour, select, get map() { return map; }, moodNow, get timeMode() { return timeMode; }, sitOn, getDrink, propUnder, avCanvas, get live() { return live; }, stairLevels, nodeZ, wallAt, pickIn, walkGraph, graphFrom, liftTile, doorNames, setDoorMaze, signBox, signHandles, handleAt, setZoom, showTab, get zoom() { return zoom; }, get level() { return level; }, camTick, camTarget, followNow, floorUnder, get hover() { return hover; }, pick, select, deleteSelected, get selected() { return selected; }, get tiles() { return tiles; }, get inflight() { return inflight; }, get version() { return version; }, paint, get map() { return map; }, get cam() { return cam; }, get walker() { return walker; }, toScreen, P, setTool, act, walkTo, stepWalk, setLevel: id => { level = byId(id); buildLevels(); paint(); }, setPlace, get mapNow() { return mapNow; }, get root() { return root; }, findTunnel, allTunnels, throughTunnel };
})();
/* A page that couldn't start says so, here and to the site around it, rather than sitting there black */
hallwayStart.catch(e => {
    console.error(e);
    if (window.HALLWAY_PLAY) { if (window.hallwayTell) window.hallwayTell("failed"); return; }
    const n = document.createElement("div"); n.setAttribute("role", "alert"); n.style.cssText = "position:fixed;left:50%;top:40%;transform:translateX(-50%);z-index:99;max-width:420px;padding:14px 18px;color:#f5ecd8;background:#39250f;border:1px solid #000;border-radius:4px;font:12px sans-serif";
    n.textContent = "The editor couldn't start, and nothing has been saved or changed: " + (e.message || e) + " Reload to try again."; document.body.appendChild(n);
});


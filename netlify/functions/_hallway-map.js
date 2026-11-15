/* The Hallway's published map, as the server functions that check things against it read it (hallway-lost.js: where things can be hidden;
   hallway-progress.js: what a hunt's clues are). The map the live page walks: the version the manifest names, else the old single "map".
   Kept for a minute per warm instance; null if there's nothing published or it can't be read. */
const { blobStore } = require("./_blobs");
let cache = null;
/* (10 Nov scan, server findings 2 and 3) When nothing has been published from the Warren the page walks the copy deployed with the site
   (assets/hallway/map.json, publish.js), so that is the map here too. A failed read is never kept: it was cached for a minute, and
   with no map the hunts took every clue at once and Lost Property dealt the old fixed spots. null now means "can't be read just now". */
const fs = require("fs"), path = require("path");
function staticMap() { for (const p of [path.join(__dirname, "../../assets/hallway/map.json"), path.join(process.cwd(), "assets/hallway/map.json")]) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { /* not here */ } } return null; }
async function publishedMap() {
    if (cache && Date.now() - cache.at < 60e3) return cache.map;
    let map = null;
    try {
        const store = blobStore("hallway"), man = await store.get("manifest", { type: "json" });
        const text = man && man.mapVersion ? await store.get("map/" + man.mapVersion, { type: "text" }) : man ? await store.get("map", { type: "text" }) : null;
        if (text) map = JSON.parse(text);
        else if (!man) map = staticMap();                       // never published from the Warren: the deployed copy
    } catch (e) { console.error("hallway map: couldn't read the published map", e); return null; }
    if (map) map = withGallery(map);
    if (map) cache = { at: Date.now(), map };
    return map;
}
/* The file holds two maps (12 Nov 2026): the Hallways, and the Events Gallery in its "gallery". Floor ids are never shared between
   them, so the checks here read one list of floors, stairs, Lost Property spots and hunts from both */
function withGallery(map) {
    const g = map && map.gallery; if (!g || !Array.isArray(g.levels)) return map;
    const both = k => (Array.isArray(map[k]) || Array.isArray(g[k])) ? [...(Array.isArray(map[k]) ? map[k] : []), ...(Array.isArray(g[k]) ? g[k] : [])] : undefined;
    return { ...map, levels: [...(map.levels || []), ...g.levels], stairs: both("stairs") || [], lostSpots: both("lostSpots"), hunts: both("hunts") };
}

/* ---- where a person can stand (9 Nov scan, Hallway content finding 1) ----
   The live page's LIVE.tileFree (tools/hallway-editor/editor.js): a tile with floor, no furniture on it, not in a stairwell's hole and
   not one of a flight's own tiles. Here it's as strict as the page or stricter, never looser, so a spot this says can be picked up the
   page can pick up too: the night-only rope and the Christmas things count as furniture all year, and so does a giant tree's keep-out.
   An archway is only its two posts, as the page has it at its ends (it can only be fewer there, by a wall). */
const Parts = require("../../tools/hallway-editor/furni-parts.js");
const inRect = (r, x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
/* the holes the stairs up to this floor cut in it: editor.js holes() */
function holesOf(map, l) {
    const out = [];
    for (const st of (Array.isArray(map.stairs) ? map.stairs : [])) {
        if (!st || st.up !== l.id) continue;
        if (st.kind === "straight") out.push({ x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y });
        else if (st.kind === "turn") { out.push({ x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y }); out.push({ x0: st.a - 4, x1: st.a, y0: st.y - 10, y1: st.y - 6 }); }
        else if (st.kind === "sideturn") out.push({ x0: st.x - 10, x1: st.x, y0: st.a, y1: st.a + 6 }, { x0: st.x - 10, x1: st.x - 6, y0: st.a - 4, y1: st.a });
        else out.push({ x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b });
    }
    return out;
}
/* the flights going up from this floor take its tiles: editor.js stairLevels() slots */
function flightsOf(map, l) {
    const out = [];
    for (const st of (Array.isArray(map.stairs) ? map.stairs : [])) {
        if (!st || st.low !== l.id) continue;
        if (st.kind === "side") out.push({ x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b });
        else if (st.kind === "sideturn") out.push({ x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b }, { x0: st.x - 10, x1: st.x - 6, y0: st.a - 4, y1: st.a });
        else if (st.kind === "turn") out.push({ x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y }, { x0: st.a - 4, x1: st.a, y0: st.y - 10, y1: st.y - 6 });
        else out.push({ x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y });
    }
    return out;
}
function standableOn(map, l) {
    const cells = new Set(Array.isArray(l.cells) ? l.cells : []), solid = new Set(), add = (x, y) => solid.add(x + "," + y);
    for (const p of (Array.isArray(l.props) ? l.props : [])) {      // a floor whose props isn't a list threw (15 Nov scan, finding 9)
        if (!p || typeof p.k !== "string" || p.k.startsWith("mark_")) continue;
        let ts; try { ts = Parts.tiles(p); } catch (e) { ts = [[p.x, p.y]]; }
        if (p.k === "archway" && ts.length) ts = [ts[0], ts[ts.length - 1]];
        for (const t of ts) add(t[0], t[1]);
        if (p.k === "statue") { const n = Math.max(0, Math.min(6, p.treeOut || 0)); for (let x = p.x - n; x < p.x + 2 + n; x++) for (let y = p.y - n; y < p.y + 2 + n; y++) add(x, y); }
    }
    for (const t of (Array.isArray(l.teles) ? l.teles : [])) if (t) add(t.x, t.y);
    const rects = [...holesOf(map, l), ...flightsOf(map, l)];
    return (x, y) => cells.has(Math.floor(x / 2) + "," + Math.floor(y / 2)) && !solid.has(x + "," + y) && !rects.some(r => inRect(r, x, y));
}
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
/* the tiles a thing at x,y can be picked up from: its own, or under furniture, a free one beside it (live-lost.js reachFrom). [] is a dead end */
function pickUpFrom(map, l, x, y, free) {
    const f = free || standableOn(map, l);
    if (f(x, y)) return [[x, y]];
    const beside = AROUND.map(([i, j]) => [x + i, y + j]).filter(t => f(t[0], t[1]));
    if (beside.length) return beside;
    /* boxed in by furniture: from a seat beside it you can get into, sitting down (9 Nov 2026, his; editor.js seatReachable) */
    return AROUND.map(([i, j]) => [x + i, y + j]).filter(t => seatReachable(l, t[0], t[1], f));
}
/* Where someone can sit down on a seat from: editor.js seatEntries, the same rule as its sitOn (10 Nov scan, server finding 1): the seat's front,
   front diagonals and sides, never over its back; or through one seat beside it, from that seat's four sides. */
const SEATS = new Set(["chair", "sofa", "barstool", "ghsofa", "ghchair"]), DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const tilesOf = p => { try { return Parts.tiles(p); } catch (e) { return [[p.x, p.y]]; } };
const seatAt = (l, x, y) => (Array.isArray(l.props) ? l.props : []).find(p => p && SEATS.has(p.k) && tilesOf(p).some(t => t[0] === x && t[1] === y)) || null;
const facing = p => { const r = Parts.rotOf(p); return p.k === "sofa" || p.k === "ghsofa" || p.k === "ghchair" ? (r ? 2 : 4) : [2, 4, 6, 0][r]; };
function seatReachable(l, X, Y, f) {
    const p = seatAt(l, X, Y); if (!p) return false; const [dx, dy] = DIRS[facing(p)];
    const direct = [[X + dx, Y + dy], ...(dx ? [[X + dx, Y - 1], [X + dx, Y + 1], [X, Y - 1], [X, Y + 1]] : [[X - 1, Y + dy], [X + 1, Y + dy], [X - 1, Y], [X + 1, Y]])], via = [];
    for (const q of [[X - 1, Y], [X + 1, Y], [X, Y - 1], [X, Y + 1]]) if (seatAt(l, q[0], q[1])) via.push([q[0] - 1, q[1]], [q[0] + 1, q[1]], [q[0], q[1] - 1], [q[0], q[1] + 1]);
    return [...direct, ...via].some(([a, b]) => f(a, b));
}

module.exports = { publishedMap, standableOn, pickUpFrom, withGallery, _reset: () => { cache = null; } };

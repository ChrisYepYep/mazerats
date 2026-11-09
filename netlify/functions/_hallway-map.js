/* The Hallway's published map, as the server functions that check things against it read it (hallway-lost.js: where things can be hidden;
   hallway-progress.js: what a hunt's clues are). The map the live page walks: the version the manifest names, else the old single "map".
   Kept for a minute per warm instance; null if there's nothing published or it can't be read. */
const { blobStore } = require("./_blobs");
let cache = null;
async function publishedMap() {
    if (cache && Date.now() - cache.at < 60e3) return cache.map;
    let map = null;
    try {
        const store = blobStore("hallway"), man = await store.get("manifest", { type: "json" });
        const text = (man && man.mapVersion && await store.get("map/" + man.mapVersion, { type: "text" })) || await store.get("map", { type: "text" });
        if (text) map = JSON.parse(text);
    } catch (e) { console.error("hallway map: couldn't read the published map", e); }
    cache = { at: Date.now(), map };
    return map;
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
    for (const st of (map.stairs || [])) {
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
    for (const st of (map.stairs || [])) {
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
    for (const p of (l.props || [])) {
        if (!p || typeof p.k !== "string" || p.k.startsWith("mark_")) continue;
        let ts; try { ts = Parts.tiles(p); } catch (e) { ts = [[p.x, p.y]]; }
        if (p.k === "archway" && ts.length) ts = [ts[0], ts[ts.length - 1]];
        for (const t of ts) add(t[0], t[1]);
        if (p.k === "statue") { const n = Math.max(0, Math.min(6, p.treeOut || 0)); for (let x = p.x - n; x < p.x + 2 + n; x++) for (let y = p.y - n; y < p.y + 2 + n; y++) add(x, y); }
    }
    for (const t of (l.teles || [])) if (t) add(t.x, t.y);
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
const SEATS = new Set(["chair", "sofa", "barstool"]);
const seatOn = (l, x, y) => (l.props || []).some(p => p && SEATS.has(p.k) && (() => { try { return Parts.tiles(p); } catch (e) { return [[p.x, p.y]]; } })().some(t => t[0] === x && t[1] === y));
function seatReachable(l, X, Y, f) {
    if (!seatOn(l, X, Y)) return false;
    const seen = new Set([X + "," + Y]), todo = [[X, Y]];
    while (todo.length) {
        const [a, b] = todo.pop();
        for (const [i, j] of AROUND) { const p = a + i, q = b + j, k = p + "," + q; if (seen.has(k)) continue; seen.add(k); if (f(p, q)) return true; if ((!i || !j) && seatOn(l, p, q)) todo.push([p, q]); }
    }
    return false;
}

module.exports = { publishedMap, standableOn, pickUpFrom, _reset: () => { cache = null; } };

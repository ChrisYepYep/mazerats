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
module.exports = { publishedMap, _reset: () => { cache = null; } };

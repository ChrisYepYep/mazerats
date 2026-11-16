/* A Habbo's small figure for the Hallway, from Habbo's imaging, and the copy kept of a signed-in player's own look for when Habbo is down
   (16 Nov 2026, his ask: "when habbo is offline ... we should have a fallback avatar look stored for all signed in players").

   Shared by hallway.js (?av=, one frame for the page) and hallway-look.js (the player's stored look). When Habbo is offline its imaging is
   usually down with it, so keeping the figure string alone would draw nothing: the frames themselves are kept too, in the "hallway" store
   under look/<figure's hash>/<frame>. Only the looks of signed-in players with a linked Habbo are kept, one set per figure, never a stranger's. */
const crypto = require("crypto");

const FIGURE = /^[a-z]{2}-\d+(-\d+)*(\.[a-z]{2}-\d+(-\d+)*)*$/;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const WATER = 1;      // the clear glass, as tools/hallway-editor/fetch-avatar.js

/* The frames the walking page loads up front (play.js preloadAvatar under HALLWAY_PLAY): 8 directions, standing, sitting, 4 walking */
const CORE_FRAMES = [];
for (let d = 0; d < 8; d++) { CORE_FRAMES.push({ d, a: "std", f: 0 }, { d, a: "sit", f: 0 }); for (let f = 0; f < 4; f++) CORE_FRAMES.push({ d, a: "wlk", f }); }

const okFigure = figure => typeof figure === "string" && figure.length <= 240 && FIGURE.test(figure);
const figureHash = figure => crypto.createHash("sha1").update(figure).digest("hex").slice(0, 20);
const frameName = (d, a, f, h) => `${d}-${a}${h ? "-" + h : ""}-${f}`;
const lookKey = (figure, d, a, f, h) => `look/${figureHash(figure)}/${frameName(d, a, f, h)}`;

function frameUrl(figure, d, a, f, h) {
    const action = a === "wlk" ? "wlk" : a === "sit" ? "sit" : "std", item = h ? "," + h + "=" + WATER : "";
    return "https://www.habbo.com/habbo-imaging/avatarimage?" + new URLSearchParams({ figure, size: "s", direction: String(d), head_direction: String(d), action: action + item, frame: String(f), gesture: "sml" });
}

/* One frame from Habbo, as a PNG Buffer, or null if Habbo didn't give one. As the site's other asks of Habbo: its firewall answers a bare
   request with an error page. One more try, on a 5xx only. */
async function fetchFrame(url, signal) {
    const ask = () => fetch(url, { signal, headers: { "User-Agent": USER_AGENT, Accept: "image/png,image/*" } });
    let r = await ask(); if (r.status >= 500) r = await ask();
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 8 || b.length > 200000 || b.readUInt32BE(0) !== 0x89504e47) return null;
    return b;
}

/* The kept frame for a figure, or null. A carrying frame (crr/drk) that was never kept is the same frame empty-handed: better than the guest. */
async function keptFrame(store, figure, d, a, f, h) {
    const read = async key => { try { const v = await store.get(key, { type: "arrayBuffer" }); return v ? Buffer.from(v) : null; } catch (e) { return null; } };
    return (await read(lookKey(figure, d, a, f, h))) || (h ? await read(lookKey(figure, d, a, f, "")) : null);
}

module.exports = { FIGURE, USER_AGENT, CORE_FRAMES, okFigure, figureHash, frameName, lookKey, frameUrl, fetchFrame, keptFrame };

/* Downloads a Habbo's small figure, every direction and walk frame, to art/av/.
   Run: node tools/hallway-editor/fetch-avatar.js [HabboName] */
"use strict";
const fs = require("fs"), path = require("path");
(async () => {
    const name = process.argv[2] || "ChrisYepYep", out = path.join(__dirname, "art/av");
    const r = await fetch("https://origins.habbo.com/api/public/users?name=" + encodeURIComponent(name));
    if (!r.ok) throw new Error("No such Habbo: " + r.status);
    const figure = (await r.json()).figureString;
    fs.writeFileSync(path.join(out, "figure.txt"), figure);
    /* item: the hand item, Habbo's own number; sip: drinking from it rather than holding it */
    const get = async (dir, action, frame, item, sip) => {
        const hand = item ? `,${sip ? "drk" : "crr"}=${item}` : "";
        const u = "https://www.habbo.com/habbo-imaging/avatarimage?" + new URLSearchParams({ figure, size: "s", direction: String(dir), head_direction: String(dir), action: action + hand, frame: String(frame), gesture: "sml" });
        const x = await fetch(u); if (!x.ok) throw new Error(u + " " + x.status);
        fs.writeFileSync(path.join(out, `s-${dir}-${action}${item ? (sip ? "-drk" : "-crr") : ""}-${frame}.png`), Buffer.from(await x.arrayBuffer()));
    };
    const WATER = 1;                    // a clear glass; 7, 8, 10 and 11 draw an empty hand at this size
    for (let d = 0; d < 8; d++) {
        await get(d, "std", 0); for (let f = 0; f < 4; f++) await get(d, "wlk", f);
        await get(d, "sit", 0);
        await get(d, "std", 0, WATER); await get(d, "sit", 0, WATER);
        await get(d, "std", 0, WATER, true); await get(d, "sit", 0, WATER, true);
        for (let f = 0; f < 4; f++) await get(d, "wlk", f, WATER);
    }
    console.log(name, figure);
})().catch(e => { console.error(e.message); process.exit(1); });

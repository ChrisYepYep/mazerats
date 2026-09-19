/* Habbo's furnidata: how big each furni is, and whether you can sit on it.

   ONE COPY OF THE PARSING, used by two callers that must not disagree —
   netlify/functions/furni-meta.js serves it, and tools/furni-meta-extract.js
   writes the stored snapshot beside this file. When they were separate, a
   field added to one was a field missing from the other, and the difference
   only showed up as a furni that had quietly stopped being a seat.

   ----------------------------------------------------------------------
   Why there is a snapshot at all

   This data comes from Origins — ~9.6MB of XML at /gamedata/furnidata_xml/1
   — and it is the only thing that knows which furni are sittable. The game's
   own library (js/furni-library.js) carries the footprint and hardcodes
   sit:0, so furnidata is not a nice-to-have for Fallin' Furni: it is the
   difference between a level having seats and a level having none.

   Depending on somebody else's endpoint for that was a standing risk. It is
   not ours, it has no versioning, and it is answered by a WAF that has to be
   talked round with a User-Agent. If it changes shape or goes away, the game
   does not degrade — it stops.

   So the answer is kept: _furnidata.json, in the repo, regenerated on demand
   by the tool and committed like any other generated file. The live fetch is
   still here and still works; it is now the refresh path rather than the
   hot path. See getFurniMeta in furni-meta.js for which wins.
*/

const ENDPOINT = "https://origins.habbo.com/gamedata/furnidata_xml/1";

// Same reasoning as habbo.js: Origins sits behind a WAF that answers an
// unidentified client with an error page instead of the document.
const USER_AGENT = "Mozilla/5.0 (compatible; MazeRats/1.0; +https://mazerats.net)";

const tag = (xml, name) => {
    const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return m ? m[1] : "";
};

function parse(xml) {
    // Wall items are a separate section and are not placed on the floor grid,
    // so only the room items are kept.
    const rooms = xml.split("<wallitemtypes>")[0];
    const items = {};
    let count = 0;

    for (const m of rooms.matchAll(/<furnitype id="(\d+)" classname="([^"]+)">([\s\S]*?)<\/furnitype>/g)) {
        const body = m[3];
        const className = m[2];
        // Colour variants share a className with a * suffix in some hotels;
        // the first entry wins, which matches how the catalogue is keyed.
        if (items[className]) continue;
        /* partcolors is how a RECOLOUR works. Half the furni in the Origins
           client name a built-in palette rather than shipping their own, and
           are tinted from this list instead — cabin_divider_arm2 and
           divider_arm2 have byte-identical bitmaps and differ only here. The
           game's own furni library (tools/furni-extract.js) needs it to colour
           those sprites, so it is no longer thrown away. */
        const colors = [];
        const pc = tag(body, "partcolors");
        if (pc) for (const c of pc.matchAll(/<color>([^<]*)<\/color>/g)) colors.push(c[1].trim());

        items[className] = {
            n: tag(body, "name"),
            c: tag(body, "category"),
            x: Number(tag(body, "xdim")) || 1,
            y: Number(tag(body, "ydim")) || 1,
            sit: tag(body, "cansiton") === "1" ? 1 : 0,
            stand: tag(body, "canstandon") === "1" ? 1 : 0
        };
        if (colors.length) items[className].pc = colors;
        count++;
    }
    return { fetchedAt: Date.now(), count, items };
}

async function fetchFurnidata() {
    const res = await fetch(ENDPOINT, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/xml" },
        redirect: "follow"
    });
    if (!res.ok) throw new Error(`furnidata returned ${res.status}`);
    return parse(await res.text());
}

module.exports = { ENDPOINT, USER_AGENT, parse, fetchFurnidata };

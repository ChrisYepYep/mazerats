/* Furni metadata: how big each one is, and whether you can sit on it.

   WHY THIS EXISTS ALONGSIDE furni-catalogue.js. That one proxies FurniIndex,
   which has the artwork — every state and rotation as a png — and that is what
   the room draws with. What it does NOT have is the two facts the GAME turns
   on: a furni's footprint in tiles, and whether it is a seat. Without the
   first, an armchair blocks one tile instead of two and the player walks
   through half of it. Without the second there is no way to tell a chair from
   a plant, and Fallin' Furni is entirely about that distinction.

   Habbo's own furnidata has both. Origins serves it publicly and complete —
   15,154 floor items, of which 1,649 are sittable — as ~9.6MB of XML at
   /gamedata/furnidata_xml/1. It answers with a 307 first, so the redirect has
   to be followed.

   Distilled hard on the way through: of the twenty-odd fields per item this
   keeps six. The rest (offer ids, rent prices, ad urls, descriptions) is shop
   bookkeeping for a hotel we are not running, and dropping it takes the
   payload from 9.6MB to something a browser can hold without complaint.

   KEYED BY className, because that is the one identifier FurniIndex and Habbo
   agree on — the catalogue proxy already learned that the hard way (see the
   note in furni-catalogue.js about url ids being shared across colour
   variants). Joining the two on className gives artwork and behaviour for the
   same object.

   THE GAME DOES NOT CALL THIS. It is for the level editor, where every furni
   in the hotel has to be searchable. What a level ships to a player is only
   the handful of furni actually placed in it, with these fields already baked
   in — see js/room-levels.js. */

const { blobStore } = require("./_blobs.js");

const ENDPOINT = "https://origins.habbo.com/gamedata/furnidata_xml/1";
const CACHE_KEY = "furnidata.json";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;     // furnidata changes rarely

// Same reasoning as habbo.js: Origins sits behind a WAF that answers an
// unidentified client with an error page instead of the document.
const USER_AGENT = "Mozilla/5.0 (compatible; MazeRats/1.0; +https://mazerats.net)";

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    body: JSON.stringify(data)
});

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

async function getFurniMeta({ force = false } = {}) {
    const store = blobStore("furni");
    if (!force) {
        const cached = await store.get(CACHE_KEY, { type: "json" }).catch(() => null);
        if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached;
    }
    const fresh = await fetchFurnidata();
    await store.setJSON(CACHE_KEY, fresh);
    return fresh;
}

exports.handler = async (event) => {
    const params = event.queryStringParameters || {};
    try {
        const data = await getFurniMeta({ force: params.refresh === "1" });

        // A single lookup, for the editor resolving one furni it just picked.
        if (params.className) {
            const hit = data.items[params.className];
            return hit ? json(200, { className: params.className, ...hit })
                : json(404, { error: "No furni by that class name." });
        }

        // Seats only — the list the drop editor mostly wants.
        if (params.sit === "1") {
            const out = {};
            for (const [k, v] of Object.entries(data.items)) if (v.sit) out[k] = v;
            return json(200, { count: Object.keys(out).length, items: out });
        }

        return json(200, { count: data.count, items: data.items });
    } catch (err) {
        return json(502, { error: "Could not read furnidata just now." });
    }
};

module.exports.getFurniMeta = getFurniMeta;

/* /.netlify/functions/wizard — the Habbo Hogwarts map at /wizard.

   One endpoint and one collection for the whole map, rather than the
   four the pieces would otherwise want. The public page needs every part
   of it on the first paint — the background, the artwork, the room names
   and the footprint trails between them all arrive together or the map
   draws itself wrong — so splitting them across four URLs would only buy
   four cold starts and a flash of a half-drawn castle.

   Documents are told apart by `kind`:

     map    a single document, id "map": the background, its natural size,
            the zoom range the viewer allows, and the footprint sprite the
            trails are drawn from.
     layer  a picture placed on the map — the castle, the forest, the
            title block. Has a zoom band, so the forest can be a painting
            from far off and fade out as you come down into the trees.
     room   a named place: a label drawn on the map, a hotspot to hover,
            and the sheet that opens when it is clicked.
     path   a footprint trail. A list of points the trail runs through;
            js/wizard.js smooths them and steps footprints along the curve.

   Everything positioned on the map is stored in PER CENT of the map's own
   width and height, never in pixels. The background can be re-exported at
   a different size — and it will be, this map is still being drawn — and a
   pixel would silently mean somewhere else afterwards.

   Writes need the "wizard" scope rather than the "site" one every other
   endpoint here asks for, which is what lets a Hogwarts-only account exist
   at all. See WRITE_SCOPES in _auth.js. */
const { getDb } = require("./_db");
const { isAuthorized, canWrite, refuseWrite, UNAUTHORIZED } = require("./_auth");
const { cachedJson } = require("./_cache");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

const KINDS = ["map", "layer", "room", "path"];
const MAP_ID = "map";

function slugify(text) {
    return (text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "place";
}

/* Ids are unique WITHIN a kind, not across the collection, so the index is
   compound. Everything in here shares one collection, and a room called
   "Map" slugifies to exactly the id the map document holds — with a
   single-field index that room could not be created at all, and the map
   could not be created after it.

   Memoized the same way _db.js's own ensureUniqueIndex is, and for the same
   reason: createIndex is a no-op once the index exists, but there is no
   reason to pay the round trip on every warm invocation. That helper takes
   one field, which is why this is here rather than there. */
let ensuredIndex = false;

async function ensureIdIndex(collection) {
    if (ensuredIndex) return;
    await collection.createIndex({ kind: 1, id: 1 }, { unique: true });
    ensuredIndex = true;
}

/* The map document as the page should read it, whether or not one has ever
   been saved. An empty database is a real state here and will be the state
   for a while — the admin has to be able to open the editor and upload a
   background INTO it, which it cannot do if the page refuses to draw
   without one.

   The zoom numbers are multiples of "the whole map fitted to the window",
   so 1 is the view you land on and 6 is close enough to read a name
   written among the trees. */
const MAP_DEFAULTS = {
    kind: "map",
    id: MAP_ID,
    title: "Habbo Hogwarts",
    intro: "",
    background: "",
    width: 2000,
    height: 1125,
    minZoom: 1,
    maxZoom: 6,
    footprint: "",
    footprintSpacing: 2.2,
    footprintSize: 1,
    credit: ""
};

/* A zoom band, kept as its own shape because rooms, paths and layers all
   carry one and all three have to mean the same thing by it.

   from/to are the zoom levels between which the thing is drawn, and null at
   either end means "no limit that way" — which is what almost everything on
   the map wants, and what every record written before zoom bands existed
   reads as. js/wizard.js fades across a small margin either side rather
   than switching, so a name does not pop into existence mid-pinch. */
function readBand(body) {
    const num = v => (v === null || v === undefined || v === "" ? null : Number(v));
    return { fromZoom: num(body.fromZoom), toZoom: num(body.toZoom) };
}

/* What each kind is allowed to store. An allowlist rather than taking the
   body as it comes: this collection is written by the least-privileged
   account on the site, and an unlisted field is the easy way for one to
   quietly grow a `kind` of "map" and take the background over. Nothing here
   is expensive to maintain — a new field on a room is a word in a list. */
const FIELDS = {
    /* `footprints` is the bank of shoes cut out of the original drawing —
       left feet and right feet at a range of sizes, so a trail is a walk
       rather than one sprite stamped ninety times. See the footprint bank
       in tools/slice-map.js for where they come from, and layTrail in
       js/wizard-map.js for how they are dealt out. `footprint` is the single
       older sprite, kept as the fallback for a map with no bank. */
    map: ["title", "intro", "background", "width", "height", "minZoom", "maxZoom",
        "footprint", "footprints", "footprintSpacing", "footprintSize", "credit",
        // Where the map opens — a point and a zoom, rather than the whole
        // sheet fitted. Set from the editor by looking at what you want
        // people to see and pressing a button.
        "startX", "startY", "startZoom", "texture"],
    /* A picture placed on the map, and how it sits in the paper. `blend` is
       a CSS blend mode — multiply is what makes an illustration read as
       drawn onto the parchment rather than pasted over it — and the rest
       are the ordinary adjustments: turn it, flip it, age it, fade it. See
       applyLayerVisual in js/wizard-map.js, which is the only thing that
       reads them. */
    layer: ["name", "image", "x", "y", "w", "h", "opacity", "z", "hidden",
        "blend", "rotation", "flipX", "flipY",
        "grayscale", "sepia", "brightness", "contrast", "saturate", "blur",
        "fromZoom", "toZoom"],
    /* `note` is what tells two rooms with the same name apart — there are
       three Grand Staircases on this map and two 6th Floor Corridors, and
       they are different places. Shown only where it has to be, so the
       common case reads as the name alone. */
    room: ["name", "note", "fullName", "x", "y", "size", "rotation", "align",
        "labelImage", "floor", "status", "thumb", "image", "description",
        "exits", "hidden", "fromZoom", "toZoom"],
    /* `exit`, `linkType` and `secret` come from the connection sheet — which
       door this is, whether it is a teleport or a real doorway, and whether
       it is meant to be found. The map draws a secret trail differently and
       a room's sheet names the exit, so all three are the page's business,
       not just the editor's. */
    /* `style` is whether this connection is walked or ruled — footprints
       for a route between junctions, a pen stroke for a door into a dead
       end. The builder sets it from the two rooms; the editor can overrule
       it for any single one. */
    path: ["from", "to", "points", "spacing", "size", "opacity", "secret",
        "style", "exit", "linkType", "notes", "hidden", "fromZoom", "toZoom"]
};

function pick(kind, body) {
    const out = {};
    for (const field of FIELDS[kind] || []) {
        if (body[field] !== undefined) out[field] = body[field];
    }
    const band = readBand(body);
    if (FIELDS[kind].includes("fromZoom")) {
        out.fromZoom = band.fromZoom;
        out.toZoom = band.toZoom;
    }
    return out;
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const wizard = db.collection("wizard");

    if (event.httpMethod === "GET") {
        const all = await wizard.find({}, { projection: { _id: 0 } }).toArray();
        const of = kind => all.filter(d => d.kind === kind);
        const payload = {
            map: { ...MAP_DEFAULTS, ...(all.find(d => d.kind === "map") || {}) },
            layers: of("layer").sort((a, b) => (a.z || 0) - (b.z || 0)),
            rooms: of("room"),
            paths: of("path")
        };
        /* ?fresh=1 is the admin editor's route: the same payload, never
           cached, so a save is read back as it was written rather than as
           the edge remembers it from a minute ago. It needs a token and
           401s rather than falling back to the public body — a cacheable
           fallback on this URL would let one unauthenticated request pin a
           stale copy in front of the editor. Same reasoning as ?full=1 on
           rooms.js, and the same trap. */
        if ((event.queryStringParameters || {}).fresh === "1") {
            if (!isAuthorized(event)) return UNAUTHORIZED;
            return cachedJson(event, payload, { cache: false });
        }
        return cachedJson(event, payload);
    }

    if (!isAuthorized(event)) return UNAUTHORIZED;
    if (!(await canWrite(event, "wizard"))) return await refuseWrite(event);

    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }

    /* Moving things is the whole job of the editor, and a drag session
       touches a lot of them: nudging a dozen names into place and shaping
       the trail between them is one thought, not twenty-five saves. So the
       editor collects what changed and sends it in one request.

       Positions only — the list of fields is deliberately short. A bulk
       write is the one call here with no per-record confirmation behind it,
       so it can move and reshape things but never rename one, repoint its
       picture, or change what kind of thing it is. */
    if (event.httpMethod === "PUT" && body.action === "bulk") {
        const items = Array.isArray(body.items) ? body.items : [];
        if (!items.length) return json(400, { error: "Nothing to save" });
        if (items.length > 500) return json(400, { error: "Too many records in one save" });
        /* What a bulk write may touch: where a thing sits, how big it is,
           and how it looks. NOT what it is — no name, no picture, no
           endpoints, no kind. That is the line worth holding, because this
           is the one call here with no per-record confirmation behind it. */
        const MOVABLE = ["x", "y", "w", "h", "size", "rotation", "align", "points", "z",
            "opacity", "spacing", "blend", "flipX", "flipY",
            "grayscale", "sepia", "brightness", "contrast", "saturate", "blur",
            "fromZoom", "toZoom"];
        const writes = [];
        for (const item of items) {
            if (!item || !item.id || !KINDS.includes(item.kind)) {
                return json(400, { error: "Every record in a bulk save needs an id and a kind" });
            }
            const $set = { updatedAt: new Date().toISOString() };
            for (const field of MOVABLE) {
                if (item[field] !== undefined && FIELDS[item.kind].includes(field)) {
                    $set[field] = item[field];
                }
            }
            writes.push({
                updateOne: { filter: { id: item.id, kind: item.kind }, update: { $set } }
            });
        }
        const result = await wizard.bulkWrite(writes, { ordered: false });
        return json(200, { updated: result.modifiedCount });
    }

    const kind = body.kind || (event.queryStringParameters || {}).kind;
    if (!KINDS.includes(kind)) {
        return json(400, { error: "kind must be one of: " + KINDS.join(", ") });
    }

    if (event.httpMethod === "POST") {
        // There is only ever one map document, so creating it is an upsert
        // rather than an insert — the editor saving map settings for the
        // first time and the hundredth time is the same action.
        if (kind === "map") {
            const update = { ...pick("map", body), kind: "map", id: MAP_ID, updatedAt: new Date().toISOString() };
            await wizard.updateOne({ kind: "map" }, { $set: update }, { upsert: true });
            const doc = await wizard.findOne({ kind: "map" }, { projection: { _id: 0 } });
            return json(200, { ...MAP_DEFAULTS, ...doc });
        }

        await ensureIdIndex(wizard);

        // Attempt-and-retry-on-collision rather than check-then-insert — see
        // the same loop in rooms.js for why a findOne() check beforehand
        // cannot stop two near-simultaneous requests both seeing "id free".
        const createdAt = new Date().toISOString();
        const base = kind === "room" ? slugify(body.name)
            : kind === "layer" ? slugify(body.name || "layer")
                : `trail-${Date.now().toString(36)}`;
        let id = base;
        let suffix = 2;
        for (let attempt = 0; ; attempt++) {
            const doc = { createdAt, ...pick(kind, body), kind, id };
            try {
                await wizard.insertOne(doc);
                const { _id, ...clean } = doc;
                return json(201, clean);
            } catch (e) {
                if (e.code === 11000 && attempt < 50) {
                    id = `${base}-${suffix++}`;
                    continue;
                }
                throw e;
            }
        }
    }

    if (event.httpMethod === "PUT") {
        if (kind === "map") {
            const update = { ...pick("map", body), kind: "map", id: MAP_ID, updatedAt: new Date().toISOString() };
            await wizard.updateOne({ kind: "map" }, { $set: update }, { upsert: true });
            const doc = await wizard.findOne({ kind: "map" }, { projection: { _id: 0 } });
            return json(200, { ...MAP_DEFAULTS, ...doc });
        }
        if (!body.id) return json(400, { error: "Missing id" });
        // After the spread, so a form that sat open and saved late cannot
        // write the clock backwards. Same as rooms.js.
        const update = { ...pick(kind, body), updatedAt: new Date().toISOString() };
        const result = await wizard.findOneAndUpdate(
            { id: body.id, kind },
            { $set: update },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result) return json(404, { error: "Not found" });
        return json(200, result);
    }

    if (event.httpMethod === "DELETE") {
        const id = (event.queryStringParameters || {}).id;
        if (!id) return json(400, { error: "Missing id" });
        if (kind === "map") return json(400, { error: "The map itself can't be deleted" });
        const result = await wizard.deleteOne({ id, kind });
        if (result.deletedCount === 0) return json(404, { error: "Not found" });
        /* A room that is deleted takes its trails with it. Left behind, a
           trail would keep drawing footprints to a place that is no longer
           on the map — and because a trail's endpoints are what the editor
           uses to redraw it when a room moves, it would also be
           unrepairable from the editor. Only trails that actually named it;
           a free-standing trail (both ends null) is nobody's to remove. */
        if (kind === "room") {
            await wizard.deleteMany({ kind: "path", $or: [{ from: id }, { to: id }] });
        }
        return json(200, { deleted: id });
    }

    return json(405, { error: "Method not allowed" });
};

/* What a level of Fallin' Furni is.

   One place defines the shape of a level, so the editor writes it, the game
   reads it, and neither has to guess what the other meant. Nothing here draws
   anything — it is the schema, some defaults, and the small amount of
   reasoning needed to turn a level into what the game actually plays.

   ----------------------------------------------------------------------
   A level owns its own room

   `floor` and `wall` are PER LEVEL. Round three can be a wooden floor with
   brick walls where round one was concrete and stripes, and the room repaints
   between rounds. They are stored the same way the pickers choose them — a
   pattern id and a colour id out of js/room-patterns.js — so anything
   selectable is storable, with no separate list to keep in step.

   ----------------------------------------------------------------------
   Three kinds of furniture, and why they are stored apart

   `decor` is the SET DRESSING: placed by hand, never falls, there when the
   round begins. Some of it is scenery and some of it is in the way; that is
   decided by the furni itself, not by which list it is in.

   `zones` is what falls from the ceiling, and a zone is two separate things
   deliberately kept apart:

       area    a rectangle of the room. Dragged out, named, moved and resized
               on its own. It says WHERE things land and nothing else.
       items   what falls into that rectangle — a furni, how many of it, and
               what part it plays. Added and removed without touching the area.

   They are separate because that is how the work actually goes: you decide a
   corner of the room is a drop zone, then you decide what rains into it, and
   you change one without redrawing the other. An earlier version glued them
   into a single "drop" record, and every change to either meant rebuilding
   both.

   The exact landing tile inside a zone is rolled when the round runs, so the
   same level plays differently each time. That is the whole reason a zone is a
   rectangle rather than a tile.

   ----------------------------------------------------------------------
   Seats, obstacles and the order

   A dropped furni is a SEAT if Habbo's own furnidata says it can be sat on
   (see netlify/functions/furni-meta.js). Anything else is an obstacle: it
   lands, it blocks its tiles, and it cannot be sat on. Both matter — an
   obstacle dropped between the player and the next seat is the game's most
   interesting move.

   The ORDER a player must sit in is the order things landed, decided at run
   time rather than stored, because the schedule is shuffled.

   Two seats are special and both come from the original game:

       decoy   a seat that is not part of the sequence. Costs time, not the round.
       poi     the auto-kick chair. Sitting on it ends the round immediately.

   ----------------------------------------------------------------------
   Difficulty

   Two levers, both per level:

       dropDelayMs      the RATE. Shorten it and the sequence piles up faster
                        than a player can walk it.
       minDropDistance  the REACH. How far, in tiles, a piece must land from
                        wherever the player is standing at that moment — so
                        parking in a corner sends the next piece to the far
                        side rather than earning an easy round.
*/
(function () {
    "use strict";

    const SCHEMA = 2;

    const DEFAULTS = {
        schema: SCHEMA,
        id: "",
        name: "",
        order: 0,
        published: false,
        /* THE ROOM'S SHAPE, per level, the same way the floor and the wallpaper
           are. One of the Origins models — see js/room-layouts.js — by the
           letter the client calls it. A level saved before layouts existed has
           no `model` and gets "a", which is the 8x13 room every one of them was
           built in, so nothing that already exists moves. */
        model: "a",
        floor: { pattern: "plain", colour: null },
        wall: { pattern: "plain", colour: null },
        start: { x: 3, y: 6 },              // where the player begins
        /* AND WHICH WAY THEY ARE LOOKING when they get there. One of Habbo's
           eight directions, the same numbering the avatar and the furni both
           use (see DIRS in js/room-path.js), so a level can open with its
           player facing the door, or the drop zone, or away from both.

           2 is front-right, which is what the figure has always defaulted to
           and what every level built before this was drawn against. */
        startDir: 2,
        decor: [],
        zones: [],
        rules: {
            seconds: 45,
            dropDelayMs: 900,
            dropSpeedMs: 520,
            minDropDistance: 0
        }
    };

    const ITEM_DEFAULTS = {
        className: "",
        rotation: 0,
        count: 1,
        role: "sequence"                    // sequence | decoy | poi | obstacle
    };

    const ROLES = ["sequence", "decoy", "poi", "obstacle"];

    /* THREE OF THE FOUR ROLES ONLY MEAN ANYTHING ON A SEAT, and nothing used
       to say so.

       A role is chosen in the editor; whether a furni can be sat on comes from
       Habbo's own furnidata and cannot be chosen at all. Put them together
       wrongly — `cabin_divider_arm1` set to Sequence seat, which is what
       Level 3 shipped with — and the piece lands, blocks its tiles, and never
       joins the sequence, because `RoomDrop.sequence` asks for `f.sit`. It is
       an obstacle wearing a seat's label, silently, with nothing anywhere
       objecting.

       That is a level-building mistake rather than a crash, so this does not
       refuse it: `obstacle` is a perfectly good thing to want, and the piece
       already behaves as one. It gives the editor something to point at. */
    const SEAT_ROLES = ["sequence", "decoy", "poi"];
    const needsSeat = (role) => SEAT_ROLES.includes(role);

    /* Every zone item whose role wants a seat and whose furni is not one.
       `metaFor` resolves a className to its furnidata record. */
    function miscastItems(level, metaFor) {
        const out = [];
        for (const z of level.zones || []) {
            for (const it of z.items || []) {
                if (!needsSeat(it.role)) continue;
                if ((metaFor(it.className) || {}).sit) continue;
                out.push({ zone: z, item: it });
            }
        }
        return out;
    }
    const ROLE_LABELS = {
        sequence: "Sequence seat",
        decoy: "Decoy seat",
        poi: "Poi — instant fail",
        obstacle: "Obstacle"
    };

    const clone = (v) => JSON.parse(JSON.stringify(v));

    function merge(base, over) {
        const out = clone(base);
        if (!over || typeof over !== "object") return out;
        for (const [k, v] of Object.entries(over)) {
            if (v === undefined || v === null) continue;
            out[k] = (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object")
                ? merge(base[k], v)
                : clone(v);
        }
        return out;
    }

    let zoneSeq = 0;
    const newZoneId = () => `z${Date.now().toString(36)}${(zoneSeq++).toString(36)}`;

    /* HEIGHT, which Habbo calls altitude and its Advanced tool calls Height.

       One unit is one tile-height, 32px, the same unit `lift` has always used
       for stacking and for the fall from the ceiling. Three decimal places
       because that is the precision the client's own field keeps — it
       normalises whatever you type to `0.000` — and the ± buttons there step
       by 0.1, which is the figure the Advanced editor's bytecode pushes.

       THE CEILING IS OURS. The client sets no limit at all: it hands whatever
       you typed to the server as ORIGINS_SET_FURNI_LOCATION and lets the
       server refuse. Ours has to stop somewhere, and the wall is 115px — 3.6
       tiles — so ten tiles is already well off the top of the room and
       anything beyond it is a typo rather than a decoration. */
    const HEIGHT_STEP = 0.1;
    const MAX_HEIGHT = 10;

    function height(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        return Math.round(Math.max(0, Math.min(MAX_HEIGHT, n)) * 1000) / 1000;
    }

    /* Fill in whatever a stored level is missing and clamp anything that could
       put furni outside the room. Returns a NEW level; the argument is not
       modified, so the editor can diff against what it had.

       Also MIGRATES the old flat `drops` list, where each record carried its
       own copy of an area. Each becomes a zone of one item, which is exactly
       what it was — just said properly. */
    /* `cols`/`rows` are an override and are almost never wanted. A level knows
       its own shape — `model` names one of the Origins layouts — and measuring
       it against whatever room happens to be on screen is how a level saved in
       the long room came back clamped to the square one. */
    function normalise(level, cols, rows) {
        const out = merge(DEFAULTS, level);
        out.schema = SCHEMA;

        const L = window.RoomLayouts;
        const model = L ? L.get(out.model) : null;
        /* AN UNKNOWN LAYOUT FALLS BACK, AND SAYS SO.

           Falling back to the classic room is right — a level saved against a
           layout that later went away is still a playable level. Doing it
           SILENTLY is what let a truncated id ("libr" for "library", cut by a
           four-character cap on the server) look like the editor spontaneously
           changing room on save. The fallback stays; the silence does not. */
        if (L && out.model && model && model.id !== out.model) {
            console.warn(`RoomLevels: no layout "${out.model}" — falling back to "${model.id}".`);
        }
        out.model = model ? model.id : "a";
        cols = cols || (model ? model.cols : 8);
        rows = rows || (model ? model.rows : 13);

        // Does this layout have floor here? Bounds alone will not do it.
        const solid = (x, y) => {
            if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
            return !model || model.mask[y][x] !== "x";
        };

        const clamp = (p) => ({
            x: Math.max(0, Math.min(cols - 1, Math.round(p.x || 0))),
            y: Math.max(0, Math.min(rows - 1, Math.round(p.y || 0)))
        });

        /* CLAMPED INTO THE ROOM, AND THEN ONTO ACTUAL FLOOR.

           Clamping to the bounds is not enough once a layout can have a hole
           in it: a position saved in one room and reopened in another can land
           squarely in the bite, and for `start` that means an avatar standing
           on nothing with nowhere to walk. The nearest real tile is a better
           answer than refusing to load the level. */
        const onFloor = (p) => {
            const c = clamp(p);
            if (solid(c.x, c.y)) return c;
            let best = null, bestD = Infinity;
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    if (!solid(x, y)) continue;
                    const d = Math.max(Math.abs(x - c.x), Math.abs(y - c.y));
                    if (d < bestD) { bestD = d; best = { x, y }; }
                }
            }
            return best || c;
        };

        out.start = onFloor(out.start);
        // Eight directions, wrapped rather than clamped: 8 is 0 round again.
        out.startDir = ((Math.round(Number(out.startDir) || 0) % 8) + 8) % 8;

        out.decor = (out.decor || []).map(d => ({
            className: String(d.className || ""),
            rotation: Number(d.rotation) || 0,
            state: Number(d.state) || 0,
            z: height(d.z),
            ...clamp(d)
        })).filter(d => d.className && solid(d.x, d.y));

        const clampArea = (a) => {
            const area = {
                x: Math.max(0, Math.min(cols - 1, Math.round((a && a.x) || 0))),
                y: Math.max(0, Math.min(rows - 1, Math.round((a && a.y) || 0)))
            };
            area.w = Math.max(1, Math.min(cols - area.x, Math.round((a && a.w) || cols)));
            area.h = Math.max(1, Math.min(rows - area.y, Math.round((a && a.h) || rows)));
            return area;
        };

        const cleanItem = (it) => {
            const e = merge(ITEM_DEFAULTS, it);
            e.count = Math.max(1, Math.min(30, Math.round(e.count)));
            e.rotation = Math.max(0, Math.round(e.rotation) || 0);
            e.role = ROLES.includes(e.role) ? e.role : "sequence";
            return e;
        };

        let zones = (out.zones || []).map(z => ({
            id: z.id || newZoneId(),
            name: String(z.name || "").trim(),
            area: clampArea(z.area),
            items: (z.items || []).map(cleanItem).filter(i => i.className)
        }));

        // Old shape: a flat list where every drop carried its own area.
        if (!zones.length && Array.isArray(level && level.drops) && level.drops.length) {
            zones = level.drops.map((d, i) => ({
                id: newZoneId(),
                name: `Zone ${i + 1}`,
                area: clampArea(d.area),
                items: [cleanItem(d)]
            })).filter(z => z.items.length);
        }
        out.zones = zones;
        delete out.drops;

        out.rules.seconds = Math.max(5, Math.round(out.rules.seconds));
        out.rules.dropDelayMs = Math.max(0, Math.round(out.rules.dropDelayMs));
        out.rules.dropSpeedMs = Math.max(60, Math.round(out.rules.dropSpeedMs));
        /* Capped below the room's reach. A distance nothing can satisfy would
           make every piece unplaceable — and an empty round is a worse bug than
           an easy one, because it looks like the game is broken. */
        out.rules.minDropDistance = Math.max(0, Math.min(cols + rows - 4,
            Math.round(out.rules.minDropDistance || 0)));
        return out;
    }

    function blankZone(cols, rows, area) {
        return {
            id: newZoneId(),
            name: "",
            area: area || { x: 0, y: 0, w: cols, h: rows },
            items: []
        };
    }

    /* Every furni a level needs artwork for — decor and zone items together,
       each class once. This is what a published level makes a player download:
       the handful it uses, never the catalogue. */
    function furniUsed(level) {
        const seen = new Set();
        for (const d of level.decor || []) seen.add(d.className);
        for (const z of level.zones || []) for (const i of z.items || []) seen.add(i.className);
        seen.delete("");
        return [...seen];
    }

    function totalDrops(level) {
        let n = 0;
        for (const z of level.zones || []) for (const i of z.items || []) n += i.count;
        return n;
    }

    /* Expand the zones into the individual pieces that will fall, in the order
       they will fall. `rand` is injectable so a round can be replayed exactly.

       Landing tiles are NOT chosen here — where a piece can land depends on
       what has already landed, which is only known while the round is running. */
    function schedule(level, rand) {
        const rng = rand || Math.random;
        const pieces = [];
        for (const z of level.zones || []) {
            for (const it of z.items || []) {
                for (let i = 0; i < it.count; i++) {
                    pieces.push({
                        className: it.className, rotation: it.rotation,
                        area: z.area, role: it.role
                    });
                }
            }
        }
        // Fisher-Yates, so the sequence differs run to run.
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        }
        return pieces;
    }

    /* A level's room settings in the shape RoomIso.drawRoom wants. The two
       differ because a level nests them and the renderer takes them flat; one
       adapter here is better than either side bending to the other. */
    function toRoomOpts(level) {
        return {
            // The shape travels with the surfaces: all three are "what room is
            // this", and every caller that repaints one repaints the others.
            model: level.model,
            floorPattern: level.floor.pattern,
            floorColour: level.floor.colour,
            wallPattern: level.wall.pattern,
            wallColour: level.wall.colour
        };
    }

    function fromRoomOpts(opts) {
        return {
            model: opts.model,
            floor: { pattern: opts.floorPattern, colour: opts.floorColour },
            wall: { pattern: opts.wallPattern, colour: opts.wallColour }
        };
    }

    /* Fill a run of levels with a difficulty curve, so a builder sets the two
       ends and not every number between. Both levers ease rather than step. A
       single level takes the FIRST setting — one round should be the gentle
       one, not the hardest. */
    function curve(levels, from, to) {
        const a = { ...DEFAULTS.rules, ...(from || {}) };
        const b = { ...a, ...(to || {}) };
        const n = levels.length;
        return levels.map((lv, i) => {
            const t = n < 2 ? 0 : i / (n - 1);
            const at = (key) => Math.round(a[key] + (b[key] - a[key]) * t);
            return {
                ...lv,
                rules: {
                    ...lv.rules,
                    seconds: at("seconds"),
                    dropDelayMs: at("dropDelayMs"),
                    dropSpeedMs: at("dropSpeedMs"),
                    minDropDistance: at("minDropDistance")
                }
            };
        });
    }

    /* The published levels, in play order. An empty list is a legitimate answer
       — nobody has published one yet — and is returned as one rather than
       thrown, because the page has something sensible to say about it. */
    async function fetchPublished() {
        try {
            const res = await fetch("/.netlify/functions/ff-levels");
            if (!res.ok) return [];
            const data = await res.json();
            return (data.levels || []).map(l => normalise(l));
        } catch {
            return [];
        }
    }

    window.RoomLevels = {
        SCHEMA, DEFAULTS, ITEM_DEFAULTS, ROLES, ROLE_LABELS,
        SEAT_ROLES, needsSeat, miscastItems,
        HEIGHT_STEP, MAX_HEIGHT, height,
        normalise, blankZone, furniUsed, totalDrops, schedule,
        toRoomOpts, fromRoomOpts, curve, fetchPublished
    };
})();

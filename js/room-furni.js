/* Furni in the room: where it sits, what it blocks, and what order it draws in.

   ----------------------------------------------------------------------
   Artwork

   Sprites come from FurniIndex, the same source the archive already uses, as a
   [state][rotation] grid of pngs per furni. Behaviour — footprint and whether
   it is a seat — comes from Habbo's own furnidata by way of
   netlify/functions/furni-meta.js. Neither source has both halves, and they
   are joined on className, which is the one identifier they agree on.

   ----------------------------------------------------------------------
   Where a sprite goes

   Read out of the client, not deduced. js/furni-offsets.js carries, for every
   furni the Origins client ships, the point inside its own sprite that lands
   on the tile — see tools/furni-offsets-extract.js for how those numbers were
   recovered and why they apply to the FurniIndex images this file loads.

   That origin is the WEST vertex of the piece's OWN tile (x, y).

   This replaces a guess: bottom-centre of the sprite onto the south corner of
   the footprint. That guess is near enough for a 1x1 chair, whose artwork
   happens to be centred on its own tile, and wrong for everything else — the
   two-tile lodge dividers came out 16 pixels off.

   The origin was itself wrong twice before it was measured rather than
   reasoned about, and tools/furni-align-check.js is what settled it: it walks
   every furni in every rotation and compares the gap on the left of the
   footprint with the gap on the right, which should match on artwork drawn
   centred over its tiles. Taking the west-most tile instead of this one throws
   a 3x5 rug half its own footprint sideways.

   FALLBACK. Roughly a quarter of the catalogue is not in this client build at
   all — posters and other wall items are named differently, and some furni
   are downloaded on demand — so anything with no entry keeps the old anchor.
   It is not right, but it is what those pieces have always used, and a piece
   drawn imperfectly beats a piece not drawn.

   `lift` raises a piece by whole tile-heights for stacking. Nothing stacks yet
   — it is here because the drop mechanic needs somewhere to put a piece's
   height while it is still in the air, and one number does both jobs.

   ----------------------------------------------------------------------
   Draw order

   Painter's algorithm on x + y, which is the depth axis of an isometric room:
   a piece further down the screen is nearer the viewer and drawn later. Ties
   break on lift, so a stacked piece draws over the one under it, and then on
   insertion order so the result is stable rather than depending on how the
   browser sorted equal keys.

   A multi-tile piece sorts by its FAR corner (x+w-1, y+h-1). Sorting by the
   near corner puts a two-tile sofa behind something standing on its own far
   tile, which reads as the sofa being inside the other object. */
(function () {
    "use strict";

    const Iso = window.RoomIso;

    const SPRITE_BASE = "https://furniindex.com/image/furni/furni-";
    const sprites = new Map();          // url -> { img, ready }
    let onLoad = null;

    function sprite(url) {
        let entry = sprites.get(url);
        if (!entry) {
            entry = { img: new Image(), ready: false, failed: false };
            entry.img.onload = () => { entry.ready = true; if (onLoad) onLoad(); };
            entry.img.onerror = () => { entry.failed = true; };
            entry.img.src = url;
            sprites.set(url, entry);
        }
        return entry;
    }

    function onSpriteLoad(cb) { onLoad = cb; }

    /* ---- anchors, out of the client (js/furni-offsets.js)

       Colour variants share one set of artwork offsets: the catalogue calls
       them "dye_jar*3", the client just has "dye_jar". Strip the suffix rather
       than storing 369 duplicate records. */
    const baseClass = (className) => String(className || "").replace(/\*\d+$/, "");

    /* How far above the footprint's bottom corner artwork sits when nothing
       has measured it. The client's own 2,280 rotations put it at a median of
       three pixels; see the fallback in `draw`. */
    const BASE_GAP = 3;

    /* ---- RECOLOURS, which are a tint and not a second set of pictures.

       Habbo sells the same furni in colourways — the catalogue calls them
       `sofachair_dpolyfon*11`, `laduck*37` — and every one of them draws from
       the SAME bitmaps. What differs is furnidata's `<partcolors>` list, which
       netlify/functions/furni-meta.js passes through as `pc`.

       HOW THE CLIENT DOES IT. `solveMembers` in hh_furni_classes.cct walks the
       furni's parts and its colour list in step, and for each part does

           sprite.color = rgb(pPartColors[j])        if it starts with "#"
           sprite.color = paletteIndex(integer(...)) otherwise

       — one colour per part, in part order, applied as Director's sprite
       colourise, which is a MULTIPLY. `solveColorList` pads the list to four
       with white, and white multiplies to nothing, which is why so many of
       these lists begin with `#ffffff`: those parts are meant to keep the
       colours already in their bitmap.

       MEASURED, not assumed. Composing this game's own client-extracted parts
       and multiplying each by its partcolor, against FurniIndex's published
       renders of the same furni:

           sofachair_dpolyfon*11  (#555555)   100.0% of pixels within 3 levels
           sofachair_dpolyfon*2   (#ffc000)   100.0%, mean error 0.53
           laduck*37              (#B357FF)    96.4%

       against 50%, 50% and 20% for leaving the artwork alone. The mapping is
       by LETTER, not by position in the part list — a direction that does not
       draw part `c` still has its `d` coloured as `d`.

       "0", an empty string and anything that is not a #hex mean no tint: the
       client's paletteIndex branch, which for these is the identity. */
    function partColours(meta) {
        const pc = meta && meta.pc;
        if (!Array.isArray(pc) || !pc.length) return null;
        let any = false;
        const out = pc.map((v) => {
            const s = String(v || "").trim();
            if (!/^#[0-9a-f]{6}$/i.test(s)) return null;
            if (s.toLowerCase() === "#ffffff") return null;   // multiplies to nothing
            any = true;
            return s.toLowerCase();
        });
        return any ? out : null;
    }

    /* One tinted copy per (picture, colour), kept because a room redraws every
       frame and a round can have thirty pieces in it.

       `multiply` over the whole box also multiplies where there is nothing,
       because a blend mode with a transparent destination just takes the
       source — so the fill floods the cut-out corners with solid colour. The
       `destination-in` pass puts the picture's own alpha back and is what
       stops every recoloured furni being a coloured rectangle. */
    const tints = new Map();

    function tinted(img, colour) {
        const key = img.src + "|" + colour;
        let c = tints.get(key);
        if (c) return c;
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return img;
        c = document.createElement("canvas");
        c.width = w; c.height = h;
        const cx = c.getContext("2d");
        cx.imageSmoothingEnabled = false;
        cx.drawImage(img, 0, 0);
        cx.globalCompositeOperation = "multiply";
        cx.fillStyle = colour;
        cx.fillRect(0, 0, w, h);
        cx.globalCompositeOperation = "destination-in";
        cx.drawImage(img, 0, 0);
        tints.set(key, c);
        return c;
    }

    /* THE GAME'S OWN FURNI LIBRARY, and why it exists.

       js/furni-library.js and assets/furni/ are built from the Origins client
       by tools/furni-extract.js: one sprite per class, state and DIRECTION,
       with the anchor measured in the same pass that drew the pixels.

       That last part is the whole point. Before this the artwork came from
       FurniIndex and the geometry from the client, and nothing said how their
       image list mapped onto the client's directions — so the game guessed,
       and 11% of rotations ended up hanging the right anchor on the wrong
       picture. `grunge_bench` had two of its images swapped between rotations.
       A piece hung from the wrong anchor lands off its tiles, which is exactly
       what that looked like.

       Here a rotation resolves to a direction, and that direction names both
       the file and the anchor. They cannot disagree.

       FALLBACK. 84 classes are not in the library — mostly ones whose 8-bit
       palette the .cct files do not contain — and they keep the old path,
       FurniIndex art against js/furni-offsets.js. Imperfect, but no worse than
       it was, and confined to those. */
    function libraryEntry(className) {
        const lib = window.FurniLibrary;
        if (!lib) return null;
        return lib[className] || lib[baseClass(className)] || null;
    }

    function offsetTable(className) {
        const entry = libraryEntry(className);
        if (entry && entry.s) return entry.s;
        const all = window.FurniOffsets;
        if (!all) return null;
        return all[className] || all[baseClass(className)] || null;
    }

    /* Which picture to draw, and whether to flip it — from the library, where
       the answer is a lookup rather than an inference. Null means this class
       is not in the library and the caller should use its own fallback. */
    function librarySprite(className, state, rotation) {
        const entry = libraryEntry(className);
        if (!entry || !entry.s) return null;
        const v = variantAt(className, state || 0, rotation);
        if (!v) return null;
        const box = entry.s[v.stateKey] && entry.s[v.stateKey][v.dir];
        if (!box || !box.p || !box.p.length) return null;
        /* The FIRST part's file, because there is no longer a file for the
           whole piece — furni are stored and drawn part by part (see partsOf).
           Callers that want the real thing use partsOf; this is for the ones
           that only need one representative image, and for the "does this
           furni have artwork at all" check in the editor. */
        return {
            url: `assets/furni/${baseClass(className)}_${box.p[0].f || `${v.stateKey}_${v.dir}`}_${box.p[0].k}.png`,
            flip: v.mirror
        };
    }

    /* Habbo turns a furni through four quarters — directions 0, 2, 4 and 6 —
       and draws at most half of them, getting the rest by mirroring.

       WHICH one mirrors to which is not a guess: a dining chair's four
       published images measure 54x60, 52x66, 52x66, 54x60, so direction 4
       carries direction 2's shape and direction 6 carries direction 0's. That
       is d -> (6 - d) mod 8 — the same reflection the avatar directions follow
       in js/room-path.js, which is a good sign both are right.

       A direction is therefore available if the client draws it OR draws the
       one that mirrors onto it. Directions the client has neither way round
       simply do not exist for that furni, which is how a lodge divider ends up
       with two rotations and a dining chair with four.

       `swap` says the footprint lies along the other axis, which is true of
       directions 2 and 6 whatever order they come in. */
    const MIRROR_OF = (d) => (6 - d + 8) % 8;

    /* THE ORDER MATTERS, and getting it from the wrong place is what broke
       this once already.

       The artwork comes from FurniIndex, who publish one image per bitmap the
       client draws plus the mirrors — so rotation r must mean whatever THEIR
       r-th image is. An earlier version built the list as the quarters 0, 2, 4,
       6 and filled the gaps with mirrors, which reads well and is wrong: for
       the 112 classes whose only drawn direction is 4, that made rotation 0 a
       MIRRORED entry while their first image is not mirrored, so the piece's
       default rotation got a reflected anchor and a swapped footprint.

       The order that matches the images is the drawn directions ascending,
       then those same directions back down again mirrored — out and back. A
       dining chair (directions 0 and 2) gives 0, 2, 2-mirrored, 0-mirrored,
       and its four published images measure 54x60, 52x66, 52x66, 54x60, which
       is that sequence exactly.

       `swap` — whether the footprint lies along the room's other axis —
       belongs to the direction the entry ENDS UP facing. Mirroring turns
       direction d into (6 - d) mod 8, which always moves between the pair
       {0, 4} and the pair {2, 6}, so a mirrored entry swaps the other way from
       its source. Confirmed against furni whose artwork covers its tiles
       exactly: every full-coverage rug drawn at direction 0 fits xdim-by-ydim
       as-is, and the one drawn at direction 2 fits it swapped. */
    const variantCache = new Map();

    function variants(className, state) {
        const table = offsetTable(className);
        if (!table) return null;
        /* Which state key actually answered, not the one asked for. The part
           files are named by it, so a furni whose state 1 is missing must load
           the state that stood in rather than a filename that does not exist. */
        const stateKey = table[state] ? state : (table[0] ? 0 : Object.keys(table)[0]);
        const byState = table[stateKey];
        if (!byState) return null;

        const key = baseClass(className) + "|" + (state || 0);
        const hit = variantCache.get(key);
        if (hit) return hit;

        const drawn = Object.keys(byState).map(Number).sort((a, b) => a - b);
        if (!drawn.length) return null;

        const entry = (dir, mirror) => {
            const facing = mirror ? MIRROR_OF(dir) : dir;
            return { dir, mirror, facing, stateKey, swap: facing === 2 || facing === 6 };
        };
        const list = drawn.map(d => entry(d, false));
        for (let i = drawn.length - 1; i >= 0; i--) list.push(entry(drawn[i], true));

        const out = { byState, list, stateKey };
        variantCache.set(key, out);
        return out;
    }

    function variantAt(className, state, rotation) {
        const v = variants(className, state);
        if (!v) return null;
        return v.list[(Number(rotation) || 0) % v.list.length];
    }

    function rotationsOf(className) {
        const v = variants(className, 0);
        return v ? v.list.length : 0;
    }

    /* THE STATES A FURNI HAS, which is how Habbo says "on".

       A lamp off and a lamp on are one class with two states, and the client
       stores them as two sets of members — `lamp_a_0_1_1_0_0` and
       `lamp_a_0_1_1_0_1`. So the states a class HAS are simply the keys of its
       artwork table, and they are returned as a sorted list rather than a
       count because they are not always 0..n: `gothiccandelabra` has seven,
       one candle at a time going out.

       An empty list means the client has no artwork for this class and the
       caller should ask the catalogue instead. */
    function statesOf(className) {
        const table = offsetTable(className);
        if (!table) return [];
        return Object.keys(table)
            .map(Number).filter(Number.isFinite)
            .sort((a, b) => a - b);
    }

    /* Where this piece's sprite goes, and whether it is drawn mirrored.

       ------------------------------------------------------------------
       Reflecting an anchor

       Measured from the origin — the west vertex of the piece's OWN tile — a
       w-by-h footprint covers

           x from -32(h-1) to 32(w+1)        y from -16 to 16(w+h) - 16

       Turning a piece swaps w and h while leaving it on the same tile, so that
       diamond changes shape and the artwork reflects with it. What "mirrored"
       has to mean is simply this: the gap on the left becomes the gap on the
       right. Setting the two equal and solving gives

           ax' = spriteWidth - ax - 64

       and ay is UNCHANGED, because a horizontal reflection moves nothing
       vertically and this origin's height does not depend on the footprint.

       Checked, not asserted: tools/furni-align-check.js measures both insets
       for every furni in every rotation, and all 1,152 mirrored rotations come
       out as their partner's exact reflection. */
    function anchor(f) {
        const v = variants(f.className, f.state || 0);
        if (!v) return null;
        const pick = v.list[(f.rotation || 0) % v.list.length];
        const box = v.byState[pick.dir];
        if (!box) return null;
        if (!pick.mirror) return { ax: box.ax, ay: box.ay, mirror: false, box };
        return { ax: box.w - box.ax - 64, ay: box.ay, mirror: true, box };
    }

    /* ROTATION SWAPS THE FOOTPRINT — but not simply on odd rotations.

       furnidata gives xdim/ydim for a furni's default direction, and Habbo's
       four furni directions alternate between the room's two axes: 0 and 4 lie
       along one, 2 and 6 along the other.

       The swap therefore belongs to the DIRECTION, not to a position in a
       list, and a furni need not have all four — 244 of the classes in this
       client have only direction 2 and 112 only direction 4, so counting them
       off as "every other one" swaps the wrong ones. Measured across every
       non-square furni, the artwork agrees: direction 0 fits xdim-by-ydim 110
       times against 1, and direction 2 fits it swapped 83 times against 3.

       `className` is asked when it is known.

       AND WHEN THE CLIENT DOES NOT CARRY IT. 360 catalogue classes are not in
       this client at all — the 2025 re-skins, the seasonal sets, `club_sofa`
       — so they are drawn from FurniIndex's pictures, and the parity rule is
       wrong for those. FurniIndex do not list a furni's rotations in the
       client's order: `foosball` and `urban_fence` come in the same order the
       client uses and `bardesk_polyfon` comes reversed, so a rotation number
       says nothing about which way the piece is turned. js/furni-fallback.js
       carries the answer per rotation, measured off the artwork itself by
       tools/furni-fallback-extract.js. Parity survives only for a class that
       is in neither place.

       This is not cosmetic. A 2x1 sofa turned ninety degrees occupies 1x2, and
       a footprint that does not turn with the sprite blocks the wrong tiles —
       the player walks through half a sofa and cannot sit on the other half.
       Two bar desks laid end to end leave a tile's gap in the middle. */
    function fallbackSwap(className, state, rotation) {
        const all = window.FurniFallback;
        const byState = all && (all[className] || all[baseClass(className)]);
        if (!byState) return null;
        const list = byState[state] || byState[0] || byState[Object.keys(byState)[0]];
        if (!list) return null;
        const v = list[(Number(rotation) || 0) % list.length];
        return v === null || v === undefined ? null : !!v;
    }

    function footprint(meta, rotation, className, state) {
        const w = Math.max(1, Number(meta && meta.x) || 1);
        const h = Math.max(1, Number(meta && meta.y) || 1);
        const v = className ? variantAt(className, state || 0, rotation) : null;
        const measured = className ? fallbackSwap(className, state || 0, rotation) : null;
        const swap = v ? v.swap
            : measured !== null ? measured
            : (Number(rotation) || 0) % 2 === 1;
        return swap ? { w: h, h: w } : { w, h };
    }

    /* A piece as the room understands it. `meta` is the furnidata record —
       { x, y, sit, stand } — and defaults to a 1x1 non-seat so an unknown
       furni still places somewhere sensible instead of throwing. */
    function make(className, tileX, tileY, opts) {
        const o = opts || {};
        const meta = o.meta || {};
        const rotation = Number(o.rotation) || 0;
        const fp = footprint(meta, rotation, className, Number(o.state) || 0);
        return {
            className,
            x: tileX,
            y: tileY,
            w: fp.w,
            h: fp.h,
            rotation,
            state: Number(o.state) || 0,
            lift: Number(o.lift) || 0,
            sit: !!meta.sit,
            stand: !!meta.stand,
            // One colour per part letter, or null for a furni with no colourway.
            colours: partColours(meta),
            role: o.role || "decor",
            url: o.url || null,
            /* Whether the BITMAP has to be flipped when drawn, which is not
               the same question as whether this rotation is a mirrored one.
               FurniIndex publish the mirrored artwork for most furni, and
               flipping an already-mirrored image puts it back. Only when they
               have no image for this rotation — the Corner plinth's second
               state, say — do we mirror it ourselves. Set by whoever resolved
               the url, since only they know how many images there were. */
            flip: !!o.flip,
            meta,
            name: meta.n || className
        };
    }

    /* Turn a piece in place, swapping its footprint with it. `rotations` is how
       many the furni actually has — most have two or four, and 239 of the
       catalogue's items have exactly one and cannot turn at all. Returns a NEW
       piece; the caller decides whether it fits before keeping it. */
    /* `spriteFor` answers with { url, flip } — a rotation can need the same
       picture as another one, drawn the other way round. A resolver that still
       returns a bare string is accepted so older callers keep working. */
    function rotate(f, rotations, spriteFor) {
        const n = Math.max(1, rotations || 1);
        const next = (f.rotation + 1) % n;
        const turned = make(f.className, f.x, f.y, {
            meta: f.meta, rotation: next, state: f.state, role: f.role, lift: f.lift
        });
        const got = spriteFor ? spriteFor(f.className, f.state, next) : null;
        if (typeof got === "string" || got === null) {
            turned.url = got || f.url;
            turned.flip = false;
        } else {
            turned.url = got.url;
            turned.flip = !!got.flip;
        }
        return turned;
    }

    // Every tile a piece covers.
    function tilesOf(f) {
        const out = [];
        for (let dy = 0; dy < f.h; dy++) {
            for (let dx = 0; dx < f.w; dx++) out.push({ x: f.x + dx, y: f.y + dy });
        }
        return out;
    }

    function covers(f, x, y) {
        return x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h;
    }

    /* Which tiles cannot be walked THROUGH.

       Only furni the furnidata marks `canstandon` is a through-route — rugs,
       floor tiles, the things Habbo lets you walk over.

       A SEAT BLOCKS. It used to be treated as walkable on the reasoning that
       sitting means stepping onto its tile, and that let the avatar stroll
       straight through a chair to get somewhere behind it. Both halves are
       satisfied by blocking it instead: RoomPath.findPath exempts the GOAL
       from the blocked test, so a seat is still somewhere you can walk to,
       just not something you can walk past. That is Habbo's own rule, and it
       matters in this game more than most — the whole round is about reaching
       seats, and a chair dropped in a doorway should be an obstacle. */
    function blockedTiles(list) {
        const blocked = new Set();
        for (const f of list) {
            if (f.stand) continue;
            for (const t of tilesOf(f)) blocked.add(Iso.key(t.x, t.y));
        }
        return blocked;
    }

    // Seats, keyed by tile, so walking onto a tile can find what is there.
    function seatAt(list, x, y) {
        for (const f of list) if (f.sit && covers(f, x, y)) return f;
        return null;
    }

    function anyAt(list, x, y) {
        // Last match wins: the piece drawn on top is the one you mean.
        let hit = null;
        for (const f of list) if (covers(f, x, y)) hit = f;
        return hit;
    }

    /* Room-fit test used by both the editor and the drop mechanic: does this
       piece fit here, on the grid and without overlapping what is already
       down? `ignore` lets a piece be moved without colliding with itself. */
    /* `stack` lets two pieces share tiles as long as they are at DIFFERENT
       heights, which is what makes a lamp on a table possible. It is opt-in
       and only the editor passes it: the drop mechanic must keep the plain
       meaning, or a chair could rain down inside a decoration.

       Habbo decides this from each item's own height in furnidata, so a 1.0
       table takes a chair at exactly 1.0. We do not have those heights, so the
       builder sets them and the only rule enforced here is that two things
       cannot occupy the same tile at the same height. */
    function fits(list, f, ignore, stack) {
        /* EVERY TILE THE PIECE COVERS HAS TO EXIST, which is not the same as
           its rectangle being within the room's bounds. A two-seater laid
           across the bite in `Corner` passes a bounds check with half of it
           hanging over nothing. */
        for (const t of tilesOf(f)) if (!Iso.has(t.x, t.y)) return false;
        const lift = f.lift || 0;
        for (const other of list) {
            if (other === ignore) continue;
            if (stack && Math.abs((other.lift || 0) - lift) > 0.0005) continue;
            for (const t of tilesOf(f)) if (covers(other, t.x, t.y)) return false;
        }
        return true;
    }

    // The depth key. See the note at the top about sorting on the far corner.
    function depthOf(f, index) {
        return ((f.x + f.w - 1) + (f.y + f.h - 1)) * 10000 + (f.lift || 0) * 100 + index;
    }

    function sorted(list) {
        return list
            .map((f, i) => ({ f, key: depthOf(f, i) }))
            .sort((a, b) => a.key - b.key)
            .map(e => e.f);
    }

    /* Draw one piece. The sprite's bottom-centre lands on the south corner of
       its footprint, raised by `lift` tile-heights. */
    /* A piece with no artwork is drawn as a MARKER, not as nothing.

       Habbo's furnidata knows 15,154 floor items; FurniIndex has sprites for
       1,283 of them. So a class can be perfectly real, sittable and correctly
       sized, and still have no picture — chair_norja is exactly that, and as a
       poi chair it was landing in the room completely invisible. An invisible
       instant-fail chair is not a rendering nicety, it is a game that cheats.

       So the footprint is filled and outlined instead. It looks wrong, which
       is the point: the level builder sees immediately that this furni cannot
       be used, rather than discovering it when a player loses to something
       that was never on screen. */
    function drawMissing(ctx, f) {
        const colour = f.sit ? "rgba(255,80,80,0.55)" : "rgba(255,80,80,0.30)";
        for (const t of tilesOf(f)) {
            Iso.diamond(ctx, t.x, t.y);
            ctx.fillStyle = colour;
            ctx.fill();
            Iso.highlight(ctx, t.x, t.y, "#ff3030");
        }
    }

    /* ---- DEPTH, and why a furni is drawn in pieces

       Habbo does not draw a furni as one picture. Each part carries a #zshift
       in the class's .props — a depth offset, one value per direction — and
       the room sorts PARTS, not furni. That is what lets you sit on a sofa and
       appear in front of its back but behind its near arm, which no single
       flattened sprite can do.

       The numbers say the unit is a tile. sofa_polyfon's four parts shift by
       -2, 300, 1199 and 1236: the back sits just behind the piece's own tile,
       and the near arm sits a whole tile forward — which is exactly the second
       tile a 2x1 sofa stands on. So:

           part depth  = (x + y) * 1000 + zshift
           avatar depth = (x + y) * 1000

       measured from the piece's OWN tile, not its far corner. An avatar's
       shift is zero, so a negative part is behind them and a positive one in
       front, and the magnitudes order the parts among themselves.

       A class with no .props gets a shift that reproduces the old whole-piece
       sort — its far corner — so nothing that worked before moves. */
    const DEPTH_PER_TILE = 1000;

    /* HEIGHT BREAKS A TIE, it does not jump a tile.

       A piece raised off the floor has to draw over whatever it is standing
       on — same tile, so the same depth, and without this the two sort by
       nothing better than their order in the list. But it must NOT overtake a
       piece on a nearer tile, however high it is: in Habbo a lamp on a table
       is still behind the chair in front of the table.

       Ten per tile-height keeps both true. It is far below one tile (1000) so
       nothing leaps forward, and far below the smallest gap between two parts
       of the same piece — sofa_polyfon's shift by -2, 300, 1199, 1236 — so a
       raised sofa's parts keep their own order. */
    const DEPTH_PER_HEIGHT = 10;

    function zshiftOf(f, partKey, facing) {
        const lib = libraryEntry(f.className);
        const table = lib && lib.z && lib.z[partKey];
        if (table) return table[facing & 7] || 0;
        // No data: sort the whole piece at its far corner, as before.
        return ((f.w - 1) + (f.h - 1)) * DEPTH_PER_TILE;
    }

    const tileDepth = (x, y) => (x + y) * DEPTH_PER_TILE;

    /* One piece's depth when it is NOT broken into parts — the fallback path,
       which keeps the old far-corner sort. */
    const depthOfPart = (f) => tileDepth(f.x + f.w - 1, f.y + f.h - 1);

    /* Where each part of a piece goes, and how deep it is. Null when this
       class is not in the library — the caller falls back to one flat sprite. */
    function partsOf(f) {
        const lib = libraryEntry(f.className);
        const a = anchor(f);
        if (!a || !a.box || !a.box.p || !a.box.p.length) return null;
        const v = variantAt(f.className, f.state || 0, f.rotation || 0);
        if (!v) return null;

        const lift = (f.lift || 0) * Iso.TILE_H;
        const home = Iso.tileCenter(f.x, f.y);
        const baseX = Math.round(home.sx - Iso.HALF_W - a.ax);
        const baseY = Math.round(home.sy - a.ay - lift);
        const base = baseClass(f.className);
        const depth = tileDepth(f.x, f.y) + Math.round((f.lift || 0) * DEPTH_PER_HEIGHT);

        return a.box.p.map((p) => ({
            /* `f` means this part's picture lives under another state and
               direction — an animation frame that only redraws one layer, or
               a direction that shares a part with the one opposite it. The
               extractor writes each distinct picture once and points the rest
               at it. */
            url: `assets/furni/${base}_${p.f || `${v.stateKey}_${v.dir}`}_${p.k}.png`,
            /* By LETTER: part `a` takes the first partcolor, `b` the second,
               and a direction that skips a part leaves its colour unused
               rather than shuffling every later part onto the wrong one. */
            colour: f.colours ? f.colours[p.k.charCodeAt(0) - 97] || null : null,
            /* A part that is LIGHT rather than paint — a lamp's cone, a
               fire's flame. Drawn normally it is a dark blob over the room;
               added, its black contributes nothing. See the note on ink in
               tools/furni-extract.js for which parts these are and how they
               are identified. */
            add: !!(lib && lib.add && lib.add[p.k]),
            blend: (lib && lib.bl && lib.bl[p.k]) || 0,
            /* Mirroring flips the whole box, so a part's offset inside it
               reflects too — measured from the far edge instead of the near
               one. Getting this wrong scatters the parts. */
            x: a.mirror ? baseX + a.box.w - p.ox - p.w : baseX + p.ox,
            y: baseY + p.oy,
            flip: a.mirror,
            depth: depth + zshiftOf(f, p.k, v.facing)
        }));
    }

    function drawPart(ctx, part) {
        const entry = sprite(part.url);
        if (!entry.ready || entry.failed) return false;
        const img = part.colour ? tinted(entry.img, part.colour) : entry.img;
        const w = entry.img.naturalWidth;

        /* "lighter" is canvas's add, which is Director's ink 33. save/restore
           rather than setting it back by hand: every other part of every other
           piece in the frame has to draw normally, and one missed reset turns
           the whole room into a light show. */
        const special = part.add || part.blend;
        if (special) {
            ctx.save();
            if (part.add) ctx.globalCompositeOperation = "lighter";
            if (part.blend) ctx.globalAlpha = part.blend / 100;
        }
        if (!part.flip) {
            ctx.drawImage(img, part.x, part.y);
        } else {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(img, -part.x - w, part.y);
            ctx.restore();
        }
        if (special) ctx.restore();
        return true;
    }

    function draw(ctx, f) {
        // In the library: draw its parts, in order, as one piece.
        const parts = partsOf(f);
        if (parts) {
            let any = false;
            for (const p of parts) any = drawPart(ctx, p) || any;
            if (!any && !parts.some(p => sprite(p.url).ready)) return false;
            return true;
        }

        const entry = f.url ? sprite(f.url) : null;
        if (!entry) { drawMissing(ctx, f); return false; }
        // Still loading is not the same as absent; leave the tile alone.
        if (entry.failed) { drawMissing(ctx, f); return false; }
        if (!entry.ready) return false;

        const img = entry.img;
        const lift = (f.lift || 0) * Iso.TILE_H;
        const a = anchor(f);

        if (a) {
            /* The west vertex of the piece's OWN tile — (x, y), not the
               west-most tile of the footprint. Measured across all 803 furni
               with both a client anchor and a footprint, this convention puts
               the artwork centred over its tiles: the left and right gaps
               agree within 4px for 71% of rotations and within half a tile for
               92%, against 53% and 69% for the west-most tile. On anything one
               tile deep the two agree, which is why the mistake survived — it
               only showed up on pieces like the 3x5 rug, thrown half its own
               footprint sideways. */
            const home = Iso.tileCenter(f.x, f.y);
            const x = Math.round(home.sx - Iso.HALF_W - a.ax);
            const y = Math.round(home.sy - a.ay - lift);
            if (!f.flip) {
                ctx.drawImage(img, x, y);
            } else {
                /* Flip about the sprite's own left edge, then draw at the
                   mirrored x. Save/restore rather than leaving the context
                   scaled: everything after this in the frame draws normally. */
                ctx.save();
                ctx.scale(-1, 1);
                ctx.drawImage(img, -x - img.naturalWidth, y);
                ctx.restore();
            }
            return true;
        }

        /* NO CLIENT ENTRY: put the artwork where measured artwork goes.

           The guess this replaces was bottom-centre of the sprite onto the
           south corner of the footprint, which is off by up to half a tile on
           anything longer than one — and the 360 classes that land here are
           exactly the sofas, beds and bar desks that are.

           Habbo draws furni CENTRED over its tiles, and the client's own 2,280
           measured rotations say how exactly. Relative to the origin — the
           west vertex of the piece's own tile — the footprint runs from
           -32(h-1) to 32(w+1), so a sprite whose left and right gaps match
           sits at

               ax = width/2 + 16(h - w) - 32

           Against every measured anchor that formula is out by a mean of 0.00
           pixels, with 80% of them inside three. The vertical is the same
           arithmetic against the footprint's bottom corner, plus the three
           pixels of clearance the artwork is typically drawn with (median 3,
           mean 5). */
        const home = Iso.tileCenter(f.x, f.y);
        const ax = img.naturalWidth / 2 + 16 * (f.h - f.w) - 32;
        const ay = img.naturalHeight + 16 - 16 * (f.w + f.h) + BASE_GAP;
        const x = Math.round(home.sx - Iso.HALF_W - ax);
        const y = Math.round(home.sy - ay - lift);
        if (!f.flip) ctx.drawImage(img, x, y);
        else {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(img, -x - img.naturalWidth, y);
            ctx.restore();
        }
        return true;
    }

    // Everything on the floor, back to front.
    function drawAll(ctx, list) {
        for (const f of sorted(list)) draw(ctx, f);
    }

    /* Outline a piece's footprint — the editor's selection, and the game's
       "sit here next" marker. Hard 1px, like every other rule in the room. */
    function outline(ctx, f, colour) {
        for (const t of tilesOf(f)) Iso.highlight(ctx, t.x, t.y, colour);
    }

    window.RoomFurni = {
        SPRITE_BASE, make, tilesOf, covers, blockedTiles, seatAt, anyAt,
        fits, depthOf, sorted, draw, drawAll, outline, sprite, onSpriteLoad,
        footprint, rotate, rotationsOf, statesOf, anchor, variantAt, librarySprite,
        partsOf, drawPart, depthOfPart, tileDepth, DEPTH_PER_TILE
    };
})();

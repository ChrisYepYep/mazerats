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
        const st = entry.s[state || 0] ? (state || 0) : Object.keys(entry.s)[0];
        if (!entry.s[st] || !entry.s[st][v.dir]) return null;
        return {
            url: `assets/furni/${baseClass(className)}_${st}_${v.dir}.png`,
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
        const byState = table && (table[state] || table[0] || table[Object.keys(table)[0]]);
        if (!byState) return null;

        const key = baseClass(className) + "|" + (state || 0);
        const hit = variantCache.get(key);
        if (hit) return hit;

        const drawn = Object.keys(byState).map(Number).sort((a, b) => a - b);
        if (!drawn.length) return null;

        const entry = (dir, mirror) => {
            const facing = mirror ? MIRROR_OF(dir) : dir;
            return { dir, mirror, facing, swap: facing === 2 || facing === 6 };
        };
        const list = drawn.map(d => entry(d, false));
        for (let i = drawn.length - 1; i >= 0; i--) list.push(entry(drawn[i], true));

        const out = { byState, list };
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

       `className` is asked when it is known; the old parity rule survives only
       as a fallback for furni this client does not carry.

       This is not cosmetic. A 2x1 sofa turned ninety degrees occupies 1x2, and
       a footprint that does not turn with the sprite blocks the wrong tiles —
       the player walks through half a sofa and cannot sit on the other half. */
    function footprint(meta, rotation, className) {
        const w = Math.max(1, Number(meta && meta.x) || 1);
        const h = Math.max(1, Number(meta && meta.y) || 1);
        const v = className ? variantAt(className, 0, rotation) : null;
        const swap = v ? v.swap : (Number(rotation) || 0) % 2 === 1;
        return swap ? { w: h, h: w } : { w, h };
    }

    /* A piece as the room understands it. `meta` is the furnidata record —
       { x, y, sit, stand } — and defaults to a 1x1 non-seat so an unknown
       furni still places somewhere sensible instead of throwing. */
    function make(className, tileX, tileY, opts) {
        const o = opts || {};
        const meta = o.meta || {};
        const rotation = Number(o.rotation) || 0;
        const fp = footprint(meta, rotation, className);
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
            for (const t of tilesOf(f)) blocked.add(t.y * Iso.COLS + t.x);
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
    function fits(list, f, ignore) {
        if (f.x < 0 || f.y < 0 || f.x + f.w > Iso.COLS || f.y + f.h > Iso.ROWS) return false;
        for (const other of list) {
            if (other === ignore) continue;
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

    function draw(ctx, f) {
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

        // No client entry for this one — the old guess, unchanged.
        const south = Iso.tileCenter(f.x + f.w - 1, f.y + f.h - 1);
        const x = Math.round(south.sx - img.naturalWidth / 2);
        const y = Math.round(south.sy + Iso.HALF_H - img.naturalHeight - lift);
        ctx.drawImage(img, x, y);
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
        footprint, rotate, rotationsOf, anchor, variantAt, librarySprite
    };
})();

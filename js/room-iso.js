/* The room itself: isometric geometry, and the floor and walls drawn onto a
   canvas the way the Shockwave client drew them.

   ----------------------------------------------------------------------
   The grid

   64x32 tiles, 8 wide by 13 deep — 104 tiles. Screen position comes from the
   standard isometric pair:

       screenX = (x - y) * 32
       screenY = (x + y) * 16

   so +x travels down-and-right, +y down-and-left, and tile (0,0) is the top
   point of the diamond with both walls meeting behind it.

   ----------------------------------------------------------------------
   Patterns are the client's own

   The floor and wallpaper are not invented here. hh_room_private.cct carries
   the hotel's whole catalogue — 6 floor patterns over 57 colours, 31 wall
   patterns over 160 — as text fields listing `stencil, palette, R,G,B, id`,
   and js/room-patterns.js is that catalogue extracted verbatim. `stencil`
   picks one of the small tileable bitmaps in assets/room/, which are the real
   ones out of the same cast:

       floor-0   dashed tile grid, transparent between  (the "plain" floors)
       floor-1   filled, regular dot texture            (fuzzy and the tiles)
       floor-2   wood
       wall-{left,right}-{0,1,3}
       wall-left-mask-{0,1,3}   the panel with the doorway cut out of it
       wall-{left,right}-end-{0,3}   the 7px of wall thickness at each end
       door                     leftdoor_open, the one sprite here that is
                                never tinted

   The client kept these as indexed bitmaps and swapped the PALETTE to
   recolour them, which is how one 130x71 bitmap became every floor in the
   hotel. Canvas has no palettes, so `colourise` below does the equivalent by
   multiplying the chosen colour through the pattern's ramp, and caches the
   result — a repaint reuses it, and only changing pattern or colour rebuilds.

   ----------------------------------------------------------------------
   The Origins look, measured rather than guessed

   Every constant below was read out of a real Origins render (a room from
   this very archive, assets/rooms/the-little-maze/Room 001.png) by scanning
   pixel runs. That render is the 2x "large" client — 99.4% of its colour runs
   are even-length, which is what gives it away — so each figure is half what
   was measured there:

     wall face          the chosen colour x ROOM_LIGHT
     left wall          a further x 0.916
     wall top edge      part of the PANEL BITMAP, not drawn separately — the
                        stencil's own rows carry both the 5px top surface and
                        the black rules either side of it, as reserved palette
                        classes 241 and 255
     floor slab edge    5px, solid, in the floor's light tone
     black lines        1px, pure #000, between every one of those surfaces
                        and around the whole room silhouette

   The 1px black line is the single most Origins-looking thing about it, and
   the reason everything below is drawn on integer coordinates with no
   antialiasing: a half-pixel offset turns a hard black edge into two grey
   ones and the whole room stops looking like Habbo. */
(function () {
    "use strict";

    /* TILE SIZE IS PER LAYOUT TOO, because half-scale rooms exist.

       A private room is 64x32 to a tile. The client drew its BIG rooms at
       32x16 instead — they do not fit the stage otherwise — and ships a second
       set of art to match. The Library is one of those, so these are read off
       the layout rather than fixed. Everything below is written in terms of
       HALF_W and HALF_H, so a room at either scale goes through the same
       arithmetic. */
    let TILE_W = 64;
    let TILE_H = 32;
    let HALF_W = TILE_W / 2;
    let HALF_H = TILE_H / 2;

    /* THE ROOM'S SHAPE IS NOT FIXED ANY MORE.

       It was 8x13 and nothing else, which is model_a — the Origins room this
       game was built from. The client ships nineteen models and seven of them
       are flat and full scale, so the shape is now per level and these move
       with it. See js/room-layouts.js.

       Two things follow, and the second is the one that bites. A layout has
       its own WIDTH AND DEPTH, which everything measured from ORIGIN has to be
       recomputed against; and a layout can have a HOLE in it — `Corner` and
       `Steps` are rectangles with a bite taken out — so "inside the bounds" is
       no longer the same question as "is there floor here". Anything deciding
       where an avatar may stand, where a piece may land or where a wall runs
       has to ask `has`, not compare against COLS and ROWS. */
    let layout = null;
    let COLS = 8;
    let ROWS = 13;

    /* Wall height above the floor line, from the asset: left_wallpart_0_a is
       32x132 with its registration point at y=115, so 115px stands above the
       floor and the rest tucks in behind the tile edge. */
    const WALL_H = 115;
    const WALL_TOP = 5;             // the darker band along the top
    const FLOOR_EDGE = 5;           // the slab's visible thickness
    const LINE = 1;                 // every black rule in the room

    /* The seven pixels of wall thickness on show where each wall stops, and
       the reason the room is 686 wide rather than 672: both end caps stand
       OUTSIDE the run, so without room for them the canvas cut them off at
       its own edges. See the note on END CAPS in drawWalls. */
    const WALL_END = 7;

    /* THE STAGE IS BIGGER THAN THE ROOM, by a margin all the way round.

       The room used to be drawn edge to edge, so its black outline sat on the
       canvas border and the two became one line — the room looked cropped by
       the frame rather than standing inside it. A margin gives it somewhere to
       sit, and the canvas's own background is what shows through.

       The stage is 720x498: 720 because that is the width the client's own
       hotel view is drawn at, so the title screen needs no cropping at all,
       and the height follows from the room plus the same margin. Everything
       below is measured from ORIGIN, so the margin only has to be added here
       and the whole room moves with it. */
    const WIDTH = 720;
    const HEIGHT = 498;

    /* Recomputed whenever the layout changes, because every one of these
       depends on the room's width and depth. The stage does NOT change — 720
       is the width the client draws its hotel view at, and a canvas that
       resized per level would move the HUD and the loader with it — so a
       smaller room simply sits in a bigger margin, centred. Every shipped
       layout fits: the widest comes to 686 against 720. */
    let ROOM_W = 0, ROOM_H = 0, ORIGIN_X = 0, ORIGIN_Y = 0;

    /* A PAINTED room is placed by its picture, not by its walls.

       There is nothing to measure: the room IS the bitmap, and the grid's
       origin is a point inside it that the extractor already worked out. So
       the picture is centred on the stage and the origin moves with it. */
    let paintX = 0, paintY = 0;

    function measure() {
        if (layout && layout.painted) {
            ROOM_W = layout.imageW;
            ROOM_H = layout.imageH;
            paintX = Math.floor((WIDTH - ROOM_W) / 2);
            paintY = Math.floor((HEIGHT - ROOM_H) / 2);
            ORIGIN_X = paintX + layout.originX;
            ORIGIN_Y = paintY + layout.originY;
            return;
        }
        ROOM_W = (ROWS - 1) * HALF_W + HALF_W + WALL_END + (COLS - 1) * HALF_W + HALF_W + WALL_END;
        ROOM_H = WALL_H + WALL_TOP + LINE * 2 +
            (COLS + ROWS - 2) * HALF_H + TILE_H + FLOOR_EDGE + LINE;
        const marginX = Math.floor((WIDTH - ROOM_W) / 2);
        const marginY = Math.floor((HEIGHT - ROOM_H) / 2);
        ORIGIN_X = (ROWS - 1) * HALF_W + HALF_W + WALL_END + marginX;
        ORIGIN_Y = WALL_H + WALL_TOP + LINE * 2 + marginY;
    }

    /* IS THERE FLOOR HERE? The question everything else should be asking.

       Bounds alone are not enough once a layout can have a hole in it, and the
       failure is quiet: an avatar walks out over nothing, furni lands in mid
       air, and the room looks fine because the renderer never drew a tile
       there to begin with. */
    function has(x, y) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
        return !layout || layout.mask[y][x] !== "x";
    }

    /* A tile key with a FIXED stride rather than COLS.

       Rooms are different widths now, so `y * COLS + x` means different things
       in different rooms — and a set of those keys built for one layout reads
       as a different set of tiles in the next. The stride is constant and
       wider than any layout, so a key means one tile for ever. */
    const KEY_STRIDE = 32;
    const key = (x, y) => y * KEY_STRIDE + x;

    let painting = null;            // the background image, once it is in

    function setLayout(next) {
        const L = window.RoomLayouts;
        layout = next || (L ? L.get(L.DEFAULT) : null);
        COLS = layout ? layout.cols : 8;
        ROWS = layout ? layout.rows : 13;
        TILE_W = (layout && layout.tileW) || 64;
        TILE_H = (layout && layout.tileH) || 32;
        HALF_W = TILE_W / 2;
        HALF_H = TILE_H / 2;
        painting = null;
        if (layout && layout.painted) {
            painting = stencils.get(layout.image);
            if (!painting) {
                painting = new Image();
                painting.onload = () => { if (onReady) onReady(); };
                painting.src = layout.image;
                stencils.set(layout.image, painting);
            }
        }
        measure();
        return layout;
    }

    measure();

    const STENCIL_DIR = "assets/room/";
    const stencils = new Map();     // src -> HTMLImageElement
    const tinted = new Map();       // cache key -> canvas
    let onReady = null;

    function stencil(name) {
        let img = stencils.get(name);
        if (!img) {
            img = new Image();
            img.onload = () => { if (onReady) onReady(); };
            img.src = STENCIL_DIR + name + ".png";
            stencils.set(name, img);
        }
        return img;
    }

    function rgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function scale(hex, f) {
        const [r, g, b] = rgb(hex);
        return [
            Math.max(0, Math.min(255, Math.round(r * f))),
            Math.max(0, Math.min(255, Math.round(g * f))),
            Math.max(0, Math.min(255, Math.round(b * f)))
        ];
    }

    const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
    const shade = (hex, f) => css(scale(hex, f));

    const hex = (c) => "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");

    /* HOW BRIGHT THE ROOM IS, measured off a real Origins render rather than
       chosen. Both figures reproduce that render to within one colour value
       everywhere they apply, which is why there are only two of them.

       A floor whose swatch is #999966 paints at (151,151,100) and a wall whose
       swatch is #bcbfce paints its right face at (180,183,197): both 0.985 of
       the swatch, so that is the room's own light and it is shared. The left
       wall then takes a further 0.916, and that single factor is the whole of
       the difference between the two faces — the left and right panel
       stencils paint the SAME position classes, so nothing in the artwork
       distinguishes them and the shading has to come from here.

       Everything else follows from the palette: the top of the wall is class
       241, which every wallpaper ramp puts at about #969698, so it lands at
       0.588 of the face without being drawn separately. */
    const ROOM_LIGHT = 0.985;
    const LEFT_WALL = 0.916;

    /* Recolour a stencil, doing what the client's palette swap did.

       The stencil png carries a palette INDEX per pixel (in all three
       channels; alpha 0 marks the hole). The ramp turns that index into a
       colour, and there is exactly one rule for how:

           final = ramp entry * the chosen colour / 255

       White leaves the colour alone, which is why index 0 — the hole, where
       the base shows through — needs no special handling: every one of these
       palettes puts #ffffff there. Grey darkens, so the wall's top surface
       (class 241, about #969698 in every wallpaper) comes out at 0.588 of the
       face, and the room's black outline (class 255, #000000) comes out
       black, with neither of them drawn separately. And a chromatic entry
       paints itself, because a pattern with real artwork in its ramp — brick,
       invaders, the picture wallpapers — ships exactly one swatch and it is
       always #ffffff.

       ONE RULE, AND IT REPLACED THREE. This used to sort the ramp's tones by
       luminance, stretch them across a band, decide by saturation whether a
       ramp was artwork or shading, and search for a "palette bank offset" of
       102 to make the striped wallpapers appear at all. Every one of those was
       a workaround for reading the CLUT backwards, and all of them went when
       tools/room-patterns-extract.js started reading it in file order — see
       the long note there for the six separate things that were wrong, and
       for the render the numbers above are measured against. */
    function colourise(stencilName, paletteName, baseHex) {
        const key = stencilName + "|" + paletteName + "|" + baseHex;
        const hit = tinted.get(key);
        if (hit) return hit;

        const img = stencil(stencilName);
        if (!img.complete || !img.naturalWidth) return null;
        const ramp = (window.RoomPatterns && window.RoomPatterns.palettes &&
            window.RoomPatterns.palettes[paletteName]) || {};

        const w = img.naturalWidth, h = img.naturalHeight;
        const src = document.createElement("canvas");
        src.width = w; src.height = h;
        const sctx = src.getContext("2d", { willReadFrequently: true });
        sctx.imageSmoothingEnabled = false;
        sctx.drawImage(img, 0, 0);
        const px = sctx.getImageData(0, 0, w, h).data;

        const out = document.createElement("canvas");
        out.width = w; out.height = h;
        const octx = out.getContext("2d");
        octx.imageSmoothingEnabled = false;
        octx.fillStyle = baseHex;
        octx.fillRect(0, 0, w, h);               // index 0 IS the surface
        const dst = octx.getImageData(0, 0, w, h);
        const dpx = dst.data;

        const base = rgb(baseHex);
        const cache = new Map();                 // index -> rgb triple
        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] < 128) continue;       // hole: leave the base showing
            const index = px[i];
            let c = cache.get(index);
            if (c === undefined) {
                const entry = ramp[index];
                if (!entry) {
                    c = null;                    // no entry: the base, unchanged
                } else {
                    const e = rgb(entry);
                    c = [
                        Math.round(base[0] * e[0] / 255),
                        Math.round(base[1] * e[1] / 255),
                        Math.round(base[2] * e[2] / 255)
                    ];
                }
                cache.set(index, c);
            }
            if (c === null) continue;
            dpx[i] = c[0];
            dpx[i + 1] = c[1];
            dpx[i + 2] = c[2];
            dpx[i + 3] = 255;
        }
        octx.putImageData(dst, 0, 0);
        tinted.set(key, out);
        return out;
    }

    // ---- geometry

    function tileTop(x, y) {
        return {
            sx: ORIGIN_X + (x - y) * HALF_W,
            sy: ORIGIN_Y + (x + y) * HALF_H
        };
    }

    function tileCenter(x, y) {
        const t = tileTop(x, y);
        return { sx: t.sx, sy: t.sy + HALF_H };
    }

    function tileAt(px, py) {
        const rx = px - ORIGIN_X;
        const ry = py - (ORIGIN_Y + HALF_H);
        const fx = (rx / HALF_W + ry / HALF_H) / 2;
        const fy = (ry / HALF_H - rx / HALF_W) / 2;
        const x = Math.round(fx), y = Math.round(fy);
        // A hole is not a tile: clicking one has to mean nothing, rather than
        // meaning the tile that would have been there.
        if (!has(x, y)) return null;
        return { x, y };
    }

    /* A hard 1px line, drawn pixel by pixel.

       Canvas antialiases every path it strokes, and on the 2:1 diagonals an
       isometric room is made of that turns each black rule into a pair of grey
       ones — measured on our own output before this existed: a rule that
       should have been one #000000 pixel came out as #000000, #171719,
       #55575d across three rows. Grey edges are the single clearest way to
       look like a modern renderer imitating pixel art rather than the thing
       itself.

       fillRect on integer coordinates with integer sizes is the one drawing
       operation canvas will not antialias, so the rules are stepped out by
       Bresenham and laid down a pixel at a time. The stair-stepping that
       results is not a compromise — it is exactly what the original's
       diagonals look like. */
    function hardLine(ctx, x0, y0, x1, y1, colour) {
        x0 = Math.round(x0); y0 = Math.round(y0);
        x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        ctx.fillStyle = colour;
        for (; ;) {
            ctx.fillRect(x0, y0, 1, 1);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    function diamond(ctx, x, y) {
        const t = tileTop(x, y);
        ctx.beginPath();
        ctx.moveTo(t.sx, t.sy);
        ctx.lineTo(t.sx + HALF_W, t.sy + HALF_H);
        ctx.lineTo(t.sx, t.sy + TILE_H);
        ctx.lineTo(t.sx - HALF_W, t.sy + HALF_H);
        ctx.closePath();
    }

    /* The whole floor as one path, for clipping and for its outline.

       One diamond per tile rather than the room's four corners. A rectangle
       could be traced corner to corner and two of the layouts are not
       rectangles, so the path is built from what is actually there. Abutting
       diamonds share their edges exactly, so the union fills and clips as one
       shape with no seam down the middle. */
    function floorPath(ctx) {
        ctx.beginPath();
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (!has(x, y)) continue;
                const t = tileTop(x, y);
                ctx.moveTo(t.sx, t.sy);
                ctx.lineTo(t.sx + HALF_W, t.sy + HALF_H);
                ctx.lineTo(t.sx, t.sy + TILE_H);
                ctx.lineTo(t.sx - HALF_W, t.sy + HALF_H);
                ctx.closePath();
            }
        }
    }

    /* THE FOUR SIDES OF A TILE, and which neighbour each one faces.

       Written down once because every part of the room's shape is some subset
       of these: a side with no floor beyond it is an EDGE of the room, and
       which of the four it is decides what gets drawn there.

           ne  faces (x, y-1)   the back right — where a wall stands
           nw  faces (x-1, y)   the back left  — where a wall stands
           se  faces (x+1, y)   the front right — the slab's visible thickness
           sw  faces (x, y+1)   the front left  — the slab's visible thickness

       An inner corner is simply a tile with two of these open at once, which
       is why nothing here special-cases one. */
    const SIDES = {
        ne: { dx: 0, dy: -1, a: (t) => ({ x: t.sx, y: t.sy }), b: (t) => ({ x: t.sx + HALF_W, y: t.sy + HALF_H }) },
        se: { dx: 1, dy: 0, a: (t) => ({ x: t.sx + HALF_W, y: t.sy + HALF_H }), b: (t) => ({ x: t.sx, y: t.sy + TILE_H }) },
        sw: { dx: 0, dy: 1, a: (t) => ({ x: t.sx, y: t.sy + TILE_H }), b: (t) => ({ x: t.sx - HALF_W, y: t.sy + HALF_H }) },
        nw: { dx: -1, dy: 0, a: (t) => ({ x: t.sx - HALF_W, y: t.sy + HALF_H }), b: (t) => ({ x: t.sx, y: t.sy }) }
    };

    // Every open side of a given kind, as a line segment.
    function edgesOf(kind) {
        const s = SIDES[kind];
        const out = [];
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (!has(x, y) || has(x + s.dx, y + s.dy)) continue;
                const t = tileTop(x, y);
                out.push({ x, y, a: s.a(t), b: s.b(t) });
            }
        }
        return out;
    }

    /* Open sides joined into RUNS along one isometric axis.

       A wall has to be drawn in one go — see wallRun — and the slab's edge
       reads better the same way. `step` says which way along the room a run
       continues: the back-right wall runs in +x, the back-left in +y. */
    function runsOf(kind, stepX, stepY) {
        const open = new Set(edgesOf(kind).map(e => `${e.x},${e.y}`));
        const seen = new Set();
        const runs = [];
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const k = `${x},${y}`;
                if (!open.has(k) || seen.has(k)) continue;
                // Only start where the previous tile along the run is not open.
                if (open.has(`${x - stepX},${y - stepY}`)) continue;
                const tiles = [];
                let cx = x, cy = y;
                while (open.has(`${cx},${cy}`)) {
                    seen.add(`${cx},${cy}`);
                    tiles.push({ x: cx, y: cy });
                    cx += stepX; cy += stepY;
                }
                runs.push(tiles);
            }
        }
        return runs;
    }

    // ---- painting

    /* Lay the floor stencil across the room.

       The stencil is a 2x2-tile DIAMOND, and diamonds do not tile a rectangle
       — the lattice that repeats them is generated by (128, 0) and (64, 32),
       staggered, so a naive 128x64 grid leaves half the plane bare and doubles
       the other half. Stepping the odd rows across by 64 is the whole fix.

       Each stamp is also clipped to its own diamond. The stencil bitmap
       carries the floor's SLAB EDGE below the diamond's lower-right side, and
       without the clip that edge repeats across the whole floor as a set of
       diagonal welts. The real edge is drawn once, further down. */
    /* The apex of the stencil's own diamond, measured off the bitmap rather
       than assumed: the topmost opaque row of all three floor stencils is
       y=0, spanning x=64..65. So (STENCIL_APEX, 0) is the north point, and
       laying the patch down means putting THAT pixel on a tile's north corner.

       This is what makes the drawn grid line up with the grid the tile cursor
       uses. Anchoring the patch's top-left corner instead — which is the
       obvious thing, and what this did before — puts the pattern 64px out, so
       the painted tile edges sit in the middle of the real tiles.

       The room model in the cast confirms both the anchor and the lattice:
       model_a.room places its floor patches at (374,122), (310,154), (246,186)
       and (438,154), stepping by (-64,+32) and (+64,+32). */
    /* The floor is one repeating fill, not a grid of stamps.

       Stamping the 2x2-tile diamond across the floor and clipping each stamp
       to itself leaves a faint line wherever two meet — a diamond grid on a
       TWO tile rhythm over the real one-tile grid. It is a seam, so no amount
       of adjusting the clip removes it.

       The stencils in assets/room/ are now seamless 128x64 tiles built on the
       diamond lattice (see seamlessFloor in tools/room-patterns-extract.js),
       so this is a plain repeat. The pattern's own (0,0) is a diamond's north
       point, so translating it onto tile (0,0)'s north corner lines the
       pattern up with the tile grid. */
    function fillFloor(ctx, tile) {
        const pattern = ctx.createPattern(tile, "repeat");
        if (!pattern) return;
        const n = tileTop(0, 0);
        ctx.save();
        floorPath(ctx);
        ctx.clip();
        ctx.translate(Math.round(n.sx), Math.round(n.sy));
        ctx.fillStyle = pattern;
        ctx.fillRect(-WIDTH, -HEIGHT, WIDTH * 3, HEIGHT * 3);
        ctx.restore();
    }

    function drawFloor(ctx, group, colour) {
        const lit = hex(scale(colour, ROOM_LIGHT));
        const tile = colourise("floor-" + group.stencil, group.palette, lit);
        if (!tile) return;

        fillFloor(ctx, tile);

        /* THE SLAB'S VISIBLE THICKNESS, along every front edge there is.

           Two quads used to do it, because a rectangle has exactly two sides
           facing the viewer. A shaped room has as many as its outline gives
           it, so each open front side gets its own — same five pixels, same
           two tones, drawn per edge instead of per room. The right side takes
           the lighter tone and the left the darker, which is the same rule the
           two quads encoded and the same one the walls use. */
        const side = shade(lit, 1.0);
        const sideDark = shade(lit, 0.82);

        const skirt = (edges, fill) => {
            if (!edges.length) return;
            ctx.fillStyle = fill;
            for (const e of edges) {
                ctx.beginPath();
                ctx.moveTo(e.a.x, e.a.y);
                ctx.lineTo(e.b.x, e.b.y);
                ctx.lineTo(e.b.x, e.b.y + FLOOR_EDGE);
                ctx.lineTo(e.a.x, e.a.y + FLOOR_EDGE);
                ctx.closePath();
                ctx.fill();
            }
        };
        const seEdges = edgesOf("se"), swEdges = edgesOf("sw");
        skirt(seEdges, side);
        skirt(swEdges, sideDark);

        /* Hard black around the slab. Drawn after the fills so it covers the
           antialiasing they leave, and derived from the outline rather than
           from four corners — an inner corner needs ruling too, and with a
           rectangle there simply never was one. */
        for (const e of seEdges.concat(swEdges)) {
            hardLine(ctx, e.a.x, e.a.y, e.b.x, e.b.y, "#000");
            hardLine(ctx, e.a.x, e.a.y + FLOOR_EDGE, e.b.x, e.b.y + FLOOR_EDGE, "#000");
        }
        /* The drop at each end of the skirt — where the slab's thickness stops
           and you see its cut face. Only where the run genuinely ends, which
           is a corner of the room rather than the join between two edges. */
        const drop = (edges, kind) => {
            const s = SIDES[kind];
            for (const e of edges) {
                // Walk to the neighbour that would continue this run.
                const nx = e.x - s.dy, ny = e.y - s.dx;      // the perpendicular
                if (!has(nx, ny) || has(nx + s.dx, ny + s.dy)) {
                    hardLine(ctx, e.a.x, e.a.y, e.a.x, e.a.y + FLOOR_EDGE, "#000");
                }
                const mx = e.x + s.dy, my = e.y + s.dx;
                if (!has(mx, my) || has(mx + s.dx, my + s.dy)) {
                    hardLine(ctx, e.b.x, e.b.y, e.b.x, e.b.y + FLOOR_EDGE, "#000");
                }
            }
        };
        drop(seEdges, "se");
        drop(swEdges, "sw");

        // And the two back sides, where the floor meets the wall.
        for (const e of edgesOf("ne").concat(edgesOf("nw"))) {
            hardLine(ctx, e.a.x, e.a.y, e.b.x, e.b.y, "#000");
        }
    }

    /* One wall, as a single run rather than a quad per tile: per-tile quads
       antialias against each other and rule the wall with pale seams, and a
       per-segment top strip steps like a battlement. The stencil supplies the
       pattern's own repeat, so nothing is lost by drawing the run in one go. */
    function wallRun(ctx, from, to, tile, faceTint, opening, endCap, joined) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(from.sx, from.sy);
        ctx.lineTo(to.sx, to.sy);
        ctx.lineTo(to.sx, to.sy - WALL_H);
        ctx.lineTo(from.sx, from.sy - WALL_H);
        ctx.closePath();
        ctx.clip();
        if (tile) {
            /* One stamp per tile edge, each stepped 32 across and 16 down (or
               up) to follow the wall's slant. The panel bitmap is drawn flat,
               so tiling it as an axis-aligned grid — which is the obvious
               thing — shears the pattern against the wall and rules it with
               diagonal streaks. The wall runs along an isometric axis and the
               stamps have to run along it too.

               Integer coordinates throughout, so abutting stamps share an edge
               exactly and no seam appears between them. */
            const span = Math.abs(to.sx - from.sx) / HALF_W;
            const stepX = to.sx > from.sx ? HALF_W : -HALF_W;
            const stepY = HALF_H;
            const panelAt = (i) => ({
                x: Math.round((stepX > 0 ? from.sx + stepX * i : from.sx + stepX * i - HALF_W)),
                y: Math.round(from.sy + stepY * i - WALL_H)
            });

            for (let i = 0; i < span; i++) {
                if (opening && opening.at === i && opening.panel) continue;
                const p = panelAt(i);
                ctx.drawImage(tile, p.x, p.y);
            }

            /* The doorway last, so that neither neighbour paints over it.

               The masked panel is registered a pixel further left than a plain
               one (-31 against -32) and is a pixel wider, and that extra
               column is the near edge of the door frame — drawn inside the
               loop it would be overwritten by whichever panel is stamped
               next. */
            if (opening && opening.panel && opening.at < span) {
                const p = panelAt(opening.at);
                ctx.drawImage(opening.panel, p.x - 1, p.y);
                if (opening.door) ctx.drawImage(opening.door, p.x, p.y + DOOR_DROP);
            }
        } else {
            ctx.fillStyle = faceTint;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }
        ctx.restore();

        /* NEITHER THE TOP BAND NOR THE RULE ALONG THE TOP IS DRAWN HERE. The
           panel bitmap carries both, as reserved palette classes: 241 is the
           wall's 5px top surface and 255 is the 1px black rule, one above the
           band and one below it. Filling a band or ruling a line here as well
           drew the top of the wall twice — and, because the extra rule landed
           a pixel below the stencil's own, ate a row of the band.

           They only APPEAR once the palette is read in file order; before
           that class 255 came out near-white and 241 came out as the face
           colour, so the wall had a pale line where its black edge belongs and
           no top surface at all. */

        /* THE END CAP: the wall's own thickness, where it stops.

           model_a.room puts a `wallend` piece at the far end of each wall, at
           the same locH/locV as the last panel but registered seven pixels
           further along — so it sits immediately beyond the run, its top level
           with the panel's top at that end. Seven pixels wide: a black rule,
           five of the wall's top surface, a black rule.

           It is drawn OUTSIDE the clip, because it is outside the wall. The
           1px black line that used to stand in for it is what the cap's own
           first column draws anyway. */
        /* NO CAP WHERE TWO WALLS MEET. A cap is the wall's cut face, and an
           inner corner is not a cut — the run simply carries on around the
           bend as another run. The client agrees and is explicit about it:
           model_b and model_f are the client's own descriptions of exactly
           these two shaped rooms, and each places ONE left_wallend and ONE
           right_wallend, at the far end of each side, with nothing at all at
           the corner. Capping every run put two caps on the same point there,
           which is what made the corner look wrong. */
        if (joined) return;

        const capX = to.sx > from.sx ? to.sx : to.sx - WALL_END;
        if (endCap) {
            /* CLIPPED TO THE WALL'S OWN BAND. The cap bitmap is 122 tall
               against a 115 wall, so seven pixels of it hang below the floor
               line — and unlike the panels, which the floor is drawn over, the
               cap stands outside the floor with nothing to cover it. That
               overhang is the stray foot under each corner. The extra rows are
               the piece's own tuck-in, meant to be buried; clipping is what
               buries it. */
            ctx.save();
            ctx.beginPath();
            ctx.rect(Math.round(capX) - 1, Math.round(to.sy - WALL_H) - 1,
                WALL_END + 2, WALL_H + 1);
            ctx.clip();
            ctx.drawImage(endCap, Math.round(capX), Math.round(to.sy - WALL_H));
            ctx.restore();
        } else {
            hardLine(ctx, to.sx, to.sy, to.sx, to.sy - WALL_H, "#000");
        }
    }

    /* THE DOORWAY, and it is a hole rather than a decal.

       model_a.room is the client's own description of a room this exact size
       — thirteen pieces down the left wall, eight along the right — and the
       FIFTH piece of its left wall is not a `left_wallpart` but a
       `left_wallmask`: the same panel with the opening cut out of it. The door
       is a separate sprite dropped into that hole:

         [#member: "left_wallmask_0_a_0_0_0", #locH: 247, #locV: 185, #locY: 5]
         [#member: "leftdoor_open",  #locH: 269, #locV: 180,
          #width: 32, #height: 101, #id: "command: GOAWAY"]

       With the cast's registration points those put the panel's top-left at
       (278, 70) and the door's at (279, 101): the door hangs 31px below the
       top of its panel, and its foot is flush with the panel's. Counting the
       pieces from the corner outward, the fifth stands against tile (0, 4). */
    const DOOR_AT = 4;
    const DOOR_DROP = 31;

    function drawWalls(ctx, group, colour) {
        const rightHex = hex(scale(colour, ROOM_LIGHT));
        const leftHex = hex(scale(colour, ROOM_LIGHT * LEFT_WALL));

        const rightTile = colourise("wall-right-" + group.stencil, group.palette, rightHex);
        const leftTile = colourise("wall-left-" + group.stencil, group.palette, leftHex);
        const maskTile = colourise("wall-left-mask-" + group.stencil, group.palette, leftHex);

        // Only stencils 0 and 3 ship an end cap; 1 borrows 0's seven pixels.
        const endN = group.stencil === 3 ? 3 : 0;
        const rightCap = colourise("wall-right-end-" + endN, group.palette, rightHex);
        const leftCap = colourise("wall-left-end-" + endN, group.palette, leftHex);

        // The door takes no tint: it is the same five greys in every room.
        const doorImg = stencil("door");
        const door = doorImg.complete && doorImg.naturalWidth ? doorImg : null;

        /* A WALL PER RUN OF OPEN BACK EDGE, rather than one along each side.

           A rectangle has exactly two stretches of wall and they were drawn as
           two calls with the room's corners hard-coded into them. A shaped
           room has as many stretches as its outline gives it — `Corner` has
           two along the back right and two along the back left, meeting at the
           bite taken out of it — so the runs are read off the mask. A
           rectangle yields exactly one run per side, which is the old drawing
           exactly, and that is the point: nothing special-cases a shape.

           Runs are drawn BACK TO FRONT within each side, so where two stretches
           of the same wall overlap on screen the nearer one wins. */
        const rightRuns = runsOf("ne", 1, 0);
        const leftRuns = runsOf("nw", 0, 1);

        /* WHERE DOES A WALL ACTUALLY END? Not at the end of every run.

           Each run has two endpoints on screen, and a room's corners are
           simply points where two of them coincide — the back corner of a
           plain room is where the left and right walls both begin, and an
           inner corner is where one run ends and the next begins. So the
           endpoints are counted, and a cap is drawn only at a point used
           ONCE, which is a wall stopping in open air and nothing else.

           For a rectangle that gives exactly the two caps it always had. For
           `Corner` it gives two as well, at the far end of each side, which is
           what the client's own model_b places. */
        const ends = (tiles, side) => {
            const a = tileTop(tiles[0].x, tiles[0].y);
            const l = tileTop(tiles[tiles.length - 1].x, tiles[tiles.length - 1].y);
            return side === "right"
                ? [{ sx: a.sx, sy: a.sy }, { sx: l.sx + HALF_W, sy: l.sy + HALF_H }]
                : [{ sx: a.sx, sy: a.sy }, { sx: l.sx - HALF_W, sy: l.sy + HALF_H }];
        };
        const tally = new Map();
        const bump = (p) => {
            const k = `${Math.round(p.sx)},${Math.round(p.sy)}`;
            tally.set(k, (tally.get(k) || 0) + 1);
        };
        for (const t of rightRuns) ends(t, "right").forEach(bump);
        for (const t of leftRuns) ends(t, "left").forEach(bump);
        const shared = (p) => (tally.get(`${Math.round(p.sx)},${Math.round(p.sy)}`) || 0) > 1;

        for (const tiles of rightRuns) {
            const [from, to] = ends(tiles, "right");
            wallRun(ctx, from, to, rightTile, shade(rightHex, 1), null, rightCap, shared(to));
        }

        /* THE DOOR GOES ON THE LONGEST STRETCH OF LEFT WALL, at the row the
           model itself puts it. `layout.door` is a row of the room, so the run
           holding it is the one to cut, and the opening index is how far along
           that run the row sits — which is not the row number once a wall
           starts part way down the room. */
        const doorRow = layout ? layout.door : DOOR_AT;
        let doorPlaced = false;
        for (const tiles of leftRuns) {
            const [from, to] = ends(tiles, "left");
            const at = tiles.findIndex(t => t.y === doorRow);
            // One door, however many stretches of wall share that row.
            const opening = (maskTile && at >= 0 && !doorPlaced) ? { at, panel: maskTile, door } : null;
            if (opening) doorPlaced = true;
            wallRun(ctx, from, to, leftTile, shade(leftHex, 1), opening, leftCap, shared(to));
        }
    }

    function group(kind, id) {
        const list = (window.RoomPatterns && window.RoomPatterns[kind]) || [];
        return list.find(g => g.id === id) || list[0] || { id: "plain", stencil: 0, colours: [] };
    }

    function colourOf(g, id) {
        const hit = (g.colours || []).find(c => c.id === id);
        return (hit || (g.colours || [])[0] || { rgb: "#999999" }).rgb;
    }

    function drawRoom(ctx, opts) {
        const fg = group("floors", opts.floorPattern);
        const wg = group("walls", opts.wallPattern);
        const fc = colourOf(fg, opts.floorColour);
        const wc = colourOf(wg, opts.wallColour);

        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.imageSmoothingEnabled = false;

        /* A PAINTED ROOM IS ALREADY DRAWN. No floor to lay, no walls to raise,
           and no floor or wallpaper pickers either — the artwork is the room,
           and a public room's look is not something a player chose. */
        if (layout && layout.painted) {
            if (painting && painting.complete && painting.naturalWidth) {
                ctx.drawImage(painting, paintX, paintY);
            }
            return;
        }

        drawWalls(ctx, wg, wc);
        drawFloor(ctx, fg, fc);
    }

    /* The tile cursor: a hard 1px outline on the tile under the pointer, and
       nothing else. Drawn with hardLine rather than a stroked path for the
       same reason every other rule in the room is — a stroked diamond
       antialiases into a fuzzy two-pixel band, which is not what the original
       cursor looked like. */
    function highlight(ctx, x, y, colour) {
        const t = tileTop(x, y);
        const n = { x: t.sx, y: t.sy };
        const e = { x: t.sx + HALF_W, y: t.sy + HALF_H };
        const s = { x: t.sx, y: t.sy + TILE_H };
        const w = { x: t.sx - HALF_W, y: t.sy + HALF_H };
        const c = colour || "#ffff00";
        hardLine(ctx, n.x, n.y, e.x, e.y, c);
        hardLine(ctx, e.x, e.y, s.x, s.y, c);
        hardLine(ctx, s.x, s.y, w.x, w.y, c);
        hardLine(ctx, w.x, w.y, n.x, n.y, c);
    }

    function depth(x, y, z) { return (x + y) * 1000 + (z || 0); }

    // Warm every stencil; `cb` fires as each arrives so the room can repaint.
    function preloadStencils(cb) {
        onReady = cb;
        for (const s of [0, 1, 2]) stencil("floor-" + s);
        for (const s of [0, 1, 3]) {
            stencil("wall-left-" + s);
            stencil("wall-right-" + s);
            stencil("wall-left-mask-" + s);
        }
        for (const s of [0, 3]) { stencil("wall-left-end-" + s); stencil("wall-right-end-" + s); }
        stencil("door");
    }

    /* COLS and ROWS are GETTERS now, and that is not a detail.

       They used to be constants captured into this object once. A caller that
       destructured them — js/room-path.js did, at load — kept 8 and 13 for the
       life of the page, so the first level with a different shape routed the
       avatar around a room that was not there. Reading them through a getter
       means a caller gets the room that is up now, however it got there. */
    window.RoomIso = {
        // Getters for the same reason COLS and ROWS are: a half-scale room
        // changes these, and a caller that took a copy would keep 64x32.
        get TILE_W() { return TILE_W; },
        get TILE_H() { return TILE_H; },
        get HALF_W() { return HALF_W; },
        get HALF_H() { return HALF_H; },
        get COLS() { return COLS; },
        get ROWS() { return ROWS; },
        get layout() { return layout; },
        // Where a painted room's picture sits on the stage, so its overlays
        // can be placed in the same frame the background was.
        get paintX() { return paintX; },
        get paintY() { return paintY; },
        KEY_STRIDE, key, has, setLayout,
        WALL_H, WIDTH, HEIGHT, LINE,
        shade, scale, tileTop, tileCenter, tileAt, diamond, floorPath,
        drawRoom, highlight, depth, preloadStencils, group, colourOf
    };
})();

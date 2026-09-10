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

   The client kept these as indexed bitmaps and swapped the PALETTE to
   recolour them, which is how one 130x71 bitmap became every floor in the
   hotel. Canvas has no palettes, so `colourise` below does the equivalent by
   remapping each distinct source colour onto a tone of the chosen base, and
   caches the result — a repaint reuses it, and only changing pattern or
   colour rebuilds.

   ----------------------------------------------------------------------
   The Origins look, measured rather than guessed

   Every constant below was read out of a real Origins render (a room from
   this very archive, assets/rooms/the-little-maze/Room 001.png) by scanning
   pixel runs. That render is the 2x "large" client — 99.4% of its colour runs
   are even-length, which is what gives it away — so each figure is half what
   was measured there:

     wall face          the chosen colour
     left wall          face x 0.93   (measured #e5bd00 against #f6cc00)
     wall top edge      part of the PANEL BITMAP, not drawn separately — the
                        stencil's own first rows carry it, and filling a band
                        above them as well drew the top of the wall twice
     floor slab edge    5px, solid, in the floor's light tone
     black lines        1px, pure #000, between every one of those surfaces
                        and around the whole room silhouette

   The 1px black line is the single most Origins-looking thing about it, and
   the reason everything below is drawn on integer coordinates with no
   antialiasing: a half-pixel offset turns a hard black edge into two grey
   ones and the whole room stops looking like Habbo. */
(function () {
    "use strict";

    const TILE_W = 64;
    const TILE_H = 32;
    const HALF_W = TILE_W / 2;
    const HALF_H = TILE_H / 2;

    const COLS = 8;
    const ROWS = 13;

    /* Wall height above the floor line, from the asset: left_wallpart_0_a is
       32x132 with its registration point at y=115, so 115px stands above the
       floor and the rest tucks in behind the tile edge. */
    const WALL_H = 115;
    const WALL_TOP = 5;             // the darker band along the top
    const FLOOR_EDGE = 5;           // the slab's visible thickness
    const LINE = 1;                 // every black rule in the room

    const ORIGIN_X = (ROWS - 1) * HALF_W + HALF_W;
    const ORIGIN_Y = WALL_H + WALL_TOP + LINE * 2;

    const WIDTH = ORIGIN_X + (COLS - 1) * HALF_W + HALF_W;
    const HEIGHT = ORIGIN_Y + (COLS + ROWS - 2) * HALF_H + TILE_H + FLOOR_EDGE + LINE;

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

    const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    /* Recolour a stencil, doing what the client's palette swap did.

       The stencil png carries a palette INDEX per pixel (in all three
       channels; alpha 0 marks the hole). The pattern's ramp maps that index to
       a shade, and the shade is applied to the colour the player picked:

           ramp says #000000   the base colour, unchanged
           anything else       a shade of the base, by luminance

       The ramps are not literal colours — a floor whose ramp says #ffffff is
       not a white floor. Measured on a real Origins render, the three tones of
       a grey floor sit at about 0.88, 1.00 and 1.05 of the base, and DARK and
       LIGHT are the two ends of that: #050505 is the shadow class, #ffffff the
       highlight. Hence the narrow band below rather than a straight multiply,
       which would paint half the floor black.

       This replaces an earlier version that ranked the stencil's own colours
       by luminance and ignored the ramp entirely. It looked plausible and was
       badly wrong: four of the six floors share a stencil and differ ONLY by
       ramp, so all four came out identical. */
    /* A shade ramp's tones are stretched over this band rather than read as
       absolute luminance.

       The reason is that the ramps are not on a common scale. wall_stripes
       says #e8e8e8 and #f8f8f8 — six percent apart — and mapping those by
       luminance onto a fixed band puts the two halves of a striped wallpaper
       within one percent of each other, which is a flat wall. Painting them
       literally instead gives clear stripes but turns the wall nearly white,
       because both tones are near-white and they cover most of it.

       Each ramp's own darkest and lightest non-black tones are therefore
       stretched to the ends of this band. A ramp whose tones are bunched
       (stripes) gets its contrast opened up; one already spread across the
       range (lively, which runs #050505 to #ffffff) is left much as it was.
       The pattern is whatever the ramp draws; only how far apart the tones sit
       is decided here. */
    const SHADE_LOW = 0.86;
    const SHADE_HIGH = 1.12;

    /* There are TWO kinds of ramp and they must not be treated alike.

       A SHADE ramp is entirely neutral — wall_white is #000000, #050505,
       #f8f8f8, #ffffff and nothing else. Those are tones, and the pattern
       takes its colour from the swatch the player picked.

       A LITERAL ramp carries real artwork. wall_color_invaders holds #712321,
       #bc664d, #902a2b; wall_color_brick1 holds a whole blue-green brick
       palette. Those patterns ship with exactly ONE swatch and it is always
       #ffffff, which is the catalogue's way of saying "no tint — paint what
       the ramp says". Twenty of the thirty-one wallpapers are this kind, and
       shading them against a white base is what rendered them all as blank
       white walls.

       Telling them apart by saturation reads it off the data rather than
       hard-coding which group is which. */
    const CHROMA_MIN = 12;

    function isLiteralRamp(ramp) {
        for (const hex of Object.values(ramp)) {
            const [r, g, b] = rgb(hex);
            if (Math.max(r, g, b) - Math.min(r, g, b) > CHROMA_MIN) return true;
        }
        return false;
    }

    /* WHICH PALETTE BANK A RAMP WAS AUTHORED AGAINST.

       The wall stencil paints a regular 8x8 grid of position classes at
       indices 17..24, 33..40, 49..56 … 129..136 — eight runs of eight,
       stepping sixteen. The brick and invaders ramps colour exactly those, all
       sixty-six of them, and render in full detail.

       The shade ramps — stripes, half1/2/3, tiles1, vstripes — colour the
       IDENTICAL structure starting at 119 instead of 17: 119..126, 135..142,
       and so on, offset by 102 the whole way. Same grid, different bank. Read
       at face value they touch five of the stencil's sixty-six classes, so the
       striped wallpaper came out as a few sparse dots and, when I went looking
       for a stencil that fitted those indices instead, as brickwork.

       So the offset is found rather than assumed: whichever shift lines the
       stencil's classes up with the most of the ramp's coloured entries wins.
       Offset 0 for the ramps drawn in the low bank, 102 for the high one, and
       anything else the data turns out to want. */
    function bankOffset(indices, ramp) {
        const coloured = new Set();
        for (const [k, v] of Object.entries(ramp)) {
            if (v !== "#000000") coloured.add(Number(k));
        }
        if (!coloured.size) return 0;

        let best = 0, bestHit = -1;
        for (const off of CANDIDATE_OFFSETS) {
            let hit = 0;
            for (const i of indices) if (coloured.has(i + off)) hit++;
            if (hit > bestHit) { bestHit = hit; best = off; }
        }
        return best;
    }

    // 0 and 102 are the two the client actually uses; the rest are cheap
    // insurance against a bank this room's patterns do not happen to need.
    const CANDIDATE_OFFSETS = [0, 102, 34, 68, 136, 170, 204];

    /* `darken` scales the FINISHED colour, after the ramp has been applied.

       The wall's top surface needs to read darker than its face whichever kind
       of ramp is in play, and darkening the base colour only achieves that for
       the tonal ramps — a literal ramp paints its own artwork colours and
       ignores the base entirely, so a brick wall came out with a white strip
       along the top instead of a shaded one. Scaling the output covers both. */
    function colourise(stencilName, paletteName, baseHex, darken) {
        const dim = darken === undefined ? 1 : darken;
        const key = stencilName + "|" + paletteName + "|" + baseHex + "|" + dim;
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
        octx.fillStyle = dim === 1 ? baseHex : css(scale(baseHex, dim));
        octx.fillRect(0, 0, w, h);               // index 0 IS the surface
        const dst = octx.getImageData(0, 0, w, h);
        const dpx = dst.data;

        // Which classes this stencil paints, so the bank can be worked out.
        const present = new Set();
        for (let i = 0; i < px.length; i += 4) if (px[i + 3] >= 128) present.add(px[i]);
        const offset = bankOffset(present, ramp);

        const literal = isLiteralRamp(ramp);

        /* The luminance range this ramp actually uses, over the classes this
           stencil paints — the span that gets stretched to SHADE_LOW..HIGH. */
        let loLum = 1, hiLum = 0;
        if (!literal) {
            for (const index of present) {
                const entry = ramp[index + offset] || ramp[index];
                if (!entry || entry === "#000000") continue;
                const [er, eg, eb] = rgb(entry);
                const l = lum(er, eg, eb);
                if (l < loLum) loLum = l;
                if (l > hiLum) hiLum = l;
            }
        }
        const span = hiLum - loLum;

        const cache = new Map();                 // index -> rgb triple
        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] < 128) continue;       // hole: leave the base showing
            const index = px[i];
            let c = cache.get(index);
            if (c === undefined) {
                const entry = ramp[index + offset] || ramp[index];
                if (!entry || entry === "#000000") {
                    c = null;                    // base, unchanged
                } else if (literal) {
                    c = rgb(entry);              // real artwork: paint it as-is
                } else {
                    const [er, eg, eb] = rgb(entry);
                    // Stretch this ramp's own range across the band.
                    const t = span > 0.001 ? (lum(er, eg, eb) - loLum) / span : 0.5;
                    c = scale(baseHex, SHADE_LOW + t * (SHADE_HIGH - SHADE_LOW));
                }
                cache.set(index, c);
            }
            if (c === null) continue;
            dpx[i] = Math.round(c[0] * dim);
            dpx[i + 1] = Math.round(c[1] * dim);
            dpx[i + 2] = Math.round(c[2] * dim);
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
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
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

    // The whole floor as one path, for clipping and for its outline.
    function floorPath(ctx) {
        const n = tileTop(0, 0);
        const e = tileTop(COLS - 1, 0);
        const s = tileTop(COLS - 1, ROWS - 1);
        const w = tileTop(0, ROWS - 1);
        ctx.beginPath();
        ctx.moveTo(n.sx, n.sy);
        ctx.lineTo(e.sx + HALF_W, e.sy + HALF_H);
        ctx.lineTo(s.sx, s.sy + TILE_H);
        ctx.lineTo(w.sx - HALF_W, w.sy + HALF_H);
        ctx.closePath();
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
        const tile = colourise("floor-" + group.stencil, group.palette, colour);
        if (!tile) return;

        fillFloor(ctx, tile);

        // The slab's two viewer-facing sides, in the floor's lighter tone.
        const side = shade(colour, 1.0);
        const sideDark = shade(colour, 0.82);
        const n = tileTop(0, 0);
        const e = tileTop(COLS - 1, 0);
        const s = tileTop(COLS - 1, ROWS - 1);
        const w = tileTop(0, ROWS - 1);

        ctx.beginPath();
        ctx.moveTo(e.sx + HALF_W, e.sy + HALF_H);
        ctx.lineTo(s.sx, s.sy + TILE_H);
        ctx.lineTo(s.sx, s.sy + TILE_H + FLOOR_EDGE);
        ctx.lineTo(e.sx + HALF_W, e.sy + HALF_H + FLOOR_EDGE);
        ctx.closePath();
        ctx.fillStyle = side;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s.sx, s.sy + TILE_H);
        ctx.lineTo(w.sx - HALF_W, w.sy + HALF_H);
        ctx.lineTo(w.sx - HALF_W, w.sy + HALF_H + FLOOR_EDGE);
        ctx.lineTo(s.sx, s.sy + TILE_H + FLOOR_EDGE);
        ctx.closePath();
        ctx.fillStyle = sideDark;
        ctx.fill();

        /* Hard black around the slab: where the floor surface meets its edge,
           where the edge ends, and up the two back sides of the room. Drawn
           after the fills so they cover the antialiasing those fills leave. */
        hardLine(ctx, e.sx + HALF_W, e.sy + HALF_H, s.sx, s.sy + TILE_H, "#000");
        hardLine(ctx, s.sx, s.sy + TILE_H, w.sx - HALF_W, w.sy + HALF_H, "#000");
        hardLine(ctx, e.sx + HALF_W, e.sy + HALF_H + FLOOR_EDGE, s.sx, s.sy + TILE_H + FLOOR_EDGE, "#000");
        hardLine(ctx, s.sx, s.sy + TILE_H + FLOOR_EDGE, w.sx - HALF_W, w.sy + HALF_H + FLOOR_EDGE, "#000");
        hardLine(ctx, e.sx + HALF_W, e.sy + HALF_H, e.sx + HALF_W, e.sy + HALF_H + FLOOR_EDGE, "#000");
        hardLine(ctx, w.sx - HALF_W, w.sy + HALF_H, w.sx - HALF_W, w.sy + HALF_H + FLOOR_EDGE, "#000");
        hardLine(ctx, n.sx, n.sy, e.sx + HALF_W, e.sy + HALF_H, "#000");
        hardLine(ctx, n.sx, n.sy, w.sx - HALF_W, w.sy + HALF_H, "#000");
    }

    /* One wall, as a single run rather than a quad per tile: per-tile quads
       antialias against each other and rule the wall with pale seams, and a
       per-segment top strip steps like a battlement. The stencil supplies the
       pattern's own repeat, so nothing is lost by drawing the run in one go. */
    function wallRun(ctx, from, to, tile, faceTint) {
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
            for (let i = 0; i < span; i++) {
                const x = from.sx + stepX * i;
                const y = from.sy + stepY * i;
                ctx.drawImage(tile,
                    Math.round(stepX > 0 ? x : x - HALF_W),
                    Math.round(y - WALL_H));
            }
        } else {
            ctx.fillStyle = faceTint;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }
        ctx.restore();

        /* NO SEPARATE TOP BAND IS DRAWN. The panel bitmap already carries the
           wall's top edge in its own first few rows — measured on the render,
           the face began with a 6px strip of the ramp's top-edge colour — so
           filling a band above it as well drew the top of the wall twice, and
           left the wallpaper starting a visible step below the real top.

           Letting the stencil's own rows be the top is both simpler and what
           the wallpaper running over the edge is supposed to look like. */

        // Hard black along the wall's top edge and down its far end.
        hardLine(ctx, from.sx, from.sy - WALL_H, to.sx, to.sy - WALL_H, "#000");
        hardLine(ctx, to.sx, to.sy, to.sx, to.sy - WALL_H, "#000");
    }

    function drawWalls(ctx, group, colour) {
        const corner = tileTop(0, 0);
        const rightEnd = tileTop(COLS - 1, 0);
        const leftEnd = tileTop(0, ROWS - 1);

        // Measured against a real render: the left wall sits at 0.93 of the
        // right. The wall's top edge is not applied here — it is part of the
        // panel bitmap, in its own first rows.
        const LEFT = 0.93;
        const leftHex = "#" + scale(colour, LEFT).map(v => v.toString(16).padStart(2, "0")).join("");

        const rightTile = colourise("wall-right-" + group.stencil, group.palette, colour);
        const leftTile = colourise("wall-left-" + group.stencil, group.palette, leftHex);

        wallRun(ctx, corner,
            { sx: rightEnd.sx + HALF_W, sy: rightEnd.sy + HALF_H },
            rightTile, shade(colour, 1));

        wallRun(ctx, corner,
            { sx: leftEnd.sx - HALF_W, sy: leftEnd.sy + HALF_H },
            leftTile, shade(leftHex, 1));
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
        for (const s of [0, 1, 3]) { stencil("wall-left-" + s); stencil("wall-right-" + s); }
    }

    window.RoomIso = {
        TILE_W, TILE_H, HALF_W, HALF_H, COLS, ROWS,
        WALL_H, WIDTH, HEIGHT, LINE,
        shade, scale, tileTop, tileCenter, tileAt, diamond, floorPath,
        drawRoom, highlight, depth, preloadStencils, group, colourOf
    };
})();

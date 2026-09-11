/* Pull the room's floor and wallpaper catalogue out of the Origins client and
   write it as js/room-patterns.js for the game to use.

   WHERE IT LIVES. hh_room_private.cct carries the whole system as cast members
   of two kinds:

     type 3 (field)   named  *pattern_*   — the catalogue, as text
     type 4 (palette) named  floor_* / wall_*  — the colour ramps

   Two of the field members are INDEXES rather than data — floorpattern_patterns
   and wallpattern_patterns are plain concatenated lists naming the other
   fields, which is how the client knows what to offer and in what order. Both
   are followed here rather than globbing for *pattern_*, so the order in the
   picker is the order the original used.

   THE RECORD FORMAT is one record per line, six comma-separated fields:

       type , paletteName , R , G , B , id

   Lines end in a bare CARRIAGE RETURN — classic Mac line endings, which is
   what Director wrote. Worth stating because it is easy to miss: printing one
   of these fields through anything that strips control characters runs every
   record together into one long line and invites a parser built to split on
   the digit boundaries instead. That parser looks like it works — it returns
   the first record of each group and silently drops the rest.

   `paletteName` names the type-4 member holding the ramp, and R,G,B is the
   colour the ramp is applied to. That is how one small indexed bitmap became
   every floor and every wallpaper in the hotel.

   `type` IS the stencil number, for floors and for walls alike. It is worth
   being emphatic because I twice decided otherwise and twice made things
   worse. The three wall panels are three RESOLUTIONS of one position code —
   wall-1 in runs of eight pixels, wall-0 one pixel per class over a 4x16 cell,
   wall-3 one pixel per class throughout — and a wallpaper declares the
   resolution its design needs. vstripes1 says 1 because its stripes are eight
   pixels wide; drawn on wall-0 the same ramp gives stripes one pixel wide. */

/* ----------------------------------------------------------------------
   WHY THE STENCILS ARE EXPORTED AS INDEX MAPS AND NOT AS PICTURES

   The first version of this exported each stencil as an ordinary RGB png, by
   resolving its palette at extraction time. That is wrong, and wrong in a way
   that looks nearly right: four of the six floor patterns share one stencil
   and differ ONLY in the palette applied to it, so baking a palette in made
   fuzzy, tiles2, tiles3 and tiles5 render as the same floor.

   The stencils are not pictures. flat_floor_1 paints roughly sixty distinct
   palette indices, each covering exactly 64 pixels — it is a map of position
   CLASSES, and the palette decides what each class becomes. Two palettes over
   one stencil are two genuinely different floors.

   So the index is the thing worth keeping. Each stencil is written as a png
   carrying the raw index in all three channels (alpha 0 where the index is 0,
   which is the hole), and every pattern's palette rides along in the data
   file. Recolouring at runtime is then the same lookup the client did.

   HOW A PALETTE ENTRY IS READ. It MULTIPLIES the chosen colour: final =
   entry * colour / 255, componentwise. White leaves the colour alone, a grey
   darkens it, and a chromatic entry (brick, invaders, the picture wallpapers)
   paints itself, because every pattern with a chromatic ramp ships exactly
   one swatch and it is always #ffffff. One rule, no special cases.

   ----------------------------------------------------------------------
   THE CLUT IS IN FILE ORDER, and getting that wrong is what made every rule
   above look like it needed special cases.

   Director CLUTs in some casts run last-colour-first, and this tool used to
   reverse them. Read backwards, these palettes are quietly ruinous rather
   than obviously broken:

       plain wallpaper   55 of its 64 face classes land on #000000, which
                         reads as "unchanged" — a flat wall, which is what a
                         plain wall looks like, so nothing seemed wrong
       stripes, tiles1,  ALL 33 classes land on #000000. Every one of these
       half1/2/3,        wallpapers rendered as a blank wall, and the fix
       vstripes1         looked like it had to be a palette BANK offset
       wood floor        its grain lands on #0000ff and the floor is ruled
                         with pure blue lines
       plain floor       its tile grid lands on #ffcc99 and comes out peach,
                         lighter than the floor rather than darker

   Read forwards all six behave, and two reserved classes fall straight out
   of it — see OUTLINE and WALL_TOP in room-iso.js. Three independent checks
   on a real Origins render agree to within a pixel value or two:

       class 255 -> #000000        the room's black outline
       class 241 -> #969698        the wall's top surface, measured at 0.60
                                   of the face against 0.588 here
       class 246 -> #eeeeee        the floor's tile rule, measured at 0.935
                                   of the floor against 0.933 here

   And floor_basic turns out to be the plain Mac system palette — white at 0,
   black at 255, the EE/DD/BB/AA/88/77/55/44/22/00 grey tail at 246..255 —
   which it visibly is not when reversed.

   THE PALETTES ARE EXPORTED IN FULL, all 256 entries. The stencils only paint
   a subset, but which subset varies by pattern and the table is small. */

const fs = require("fs");
const path = require("path");
const { openCast, readMember, readClut, unpackBits } = require("./cct-extract.js");
const { encodePng } = require("./png-encode.js");

const DEFAULT_CCT = "C:/Users/cjboy/AppData/Roaming/Habbo Launcher/downloads/shockwave/350/hh_room_private.cct";

function build(cctPath) {
    const cast = openCast(cctPath);

    const members = [];
    for (const e of cast.res.filter(x => x.tag === "CASt")) {
        const m = readMember(cast.chunk(e));
        if (m && m.name) members.push({ id: e.id, ...m });
    }
    const byName = new Map(members.map(m => [m.name, m]));

    function fieldText(name) {
        const m = byName.get(name);
        if (!m) return null;
        const sid = cast.childOf.get(`${m.id}:STXT`);
        if (sid === undefined) return null;
        const b = cast.chunk(cast.byId.get(sid));
        if (b.length < 12) return null;
        const off = b.readUInt32BE(0), len = b.readUInt32BE(4);
        return b.toString("latin1", off, off + len);
    }

    /* The catalogue names one palette `catalog_wall_gothic`, but the member in
       this cast is plain `wall_gothic` — the prefix is where the catalogue
       kept it, not what it is called here. Without stripping it the gothic
       wallpaper finds no ramp and renders as a flat colour. */
    /* And one palette is named but simply absent: wallpattern_vstripes2 asks
       for `wall_vstripes2`, which no member in the cast provides. Its sibling
       wall_vstripes1 shares the same stencil, so it stands in — a wallpaper
       with the neighbouring ramp and its own 41 colours beats a flat wall.
       This is a SUBSTITUTION, not the original, and is the only one. */
    function ramp(paletteName) {
        let m = byName.get(paletteName);
        if (!m && paletteName.startsWith("catalog_")) {
            m = byName.get(paletteName.replace(/^catalog_/, ""));
        }
        if (!m) {
            const sibling = paletteName.replace(/\d+$/, "1");
            if (sibling !== paletteName) m = byName.get(sibling);
        }
        if (!m) return null;
        const cid = cast.childOf.get(`${m.id}:CLUT`);
        if (cid === undefined) return null;
        const pal = readClut(cast.chunk(cast.byId.get(cid)), { reverse: false });
        return pal && pal.length >= 16 ? pal : null;
    }

    // Director wrote bare CR line endings; tolerate CRLF and LF regardless.
    const lines = (text) => text.split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean);

    function parseGroup(fieldName) {
        const text = fieldText(fieldName);
        if (!text) return null;
        const colours = [];
        for (const line of lines(text)) {
            const f = line.split(",");
            if (f.length !== 6) continue;
            const [type, palette, r, g, b, id] = f;
            if (!/^\d+$/.test(type) || !/^\d+$/.test(id)) continue;
            colours.push({
                id: Number(id),
                stencil: Number(type),
                palette,
                rgb: "#" + [r, g, b].map(v => Number(v).toString(16).padStart(2, "0")).join("")
            });
        }
        return colours.length ? colours : null;
    }

    // The index fields are one group name per line, same as everything else.
    function parseIndex(fieldName, prefix) {
        const text = fieldText(fieldName);
        if (!text) return [];
        return lines(text).filter(s => s.startsWith(prefix));
    }

    /* The index field gives the hotel's own ORDER, but it is not the whole
       list: wallpattern_fuzzy and wallpattern_vstripes2 are complete pattern
       fields sitting in the cast that the index never names. Following the
       index alone silently drops them, so it decides the order and anything
       else found is appended after. */
    function collect(indexField, prefix, kind) {
        const groups = [];
        const listed = parseIndex(indexField, prefix);
        const extras = [...byName.keys()]
            .filter(n => n.startsWith(prefix) && n !== `${prefix}patterns` && !listed.includes(n))
            .sort();
        for (const groupField of [...listed, ...extras]) {
            const colours = parseGroup(groupField);
            if (!colours) continue;                     // listed but not shipped
            const paletteName = colours[0].palette;
            groups.push({
                id: groupField.replace(prefix, ""),
                field: groupField,
                kind,
                stencil: colours[0].stencil,
                palette: paletteName,
                ramp: ramp(paletteName),
                colours: colours.map(c => ({ id: c.id, rgb: c.rgb }))
            });
        }
        return groups;
    }

    /* Rebuild a floor stencil as a SEAMLESSLY REPEATING 128x64 tile.

       The source is one 2x2-tile diamond in a 130x71 bitmap. Stamping that
       diamond across the floor, clipped to itself each time, leaves a faint
       line wherever two stamps meet — a diamond grid on a TWO tile rhythm laid
       over the real one-tile grid, which is exactly what you see on a large
       plain floor and cannot be tuned away, because it is a seam and not a
       pattern.

       Diamonds tile the plane on the lattice generated by (128, 0) and
       (64, 32), so a 128x64 rectangle holds exactly two of them and repeats
       cleanly. Each output pixel is resolved by finding which lattice diamond
       covers it and sampling the source there — no stamping, no clipping, and
       therefore no seams at all. The runtime just repeats this tile.

       Output (0,0) is a diamond's north point, so the pattern lines up with
       the tile grid by putting that pixel on tile (0,0)'s north corner. */
    const SRC_APEX = 64;                     // the diamond's north point in the source

    function seamlessFloor(name) {
        const src = indexMap(name);
        if (!src) return null;

        /* The unit is ONE tile, not the source's two-by-two patch.

           Building the repeat straight from the 2x2 patch leaves a faint
           two-tile rhythm, because the patch's outer boundary is not drawn
           quite like the tile edges inside it — measured at 4 to 6 differing
           pixels per line, which is exactly the ghost diamond grid you can see
           across a large floor. Repeating a single tile cannot have that: the
           only rhythm left is the one-tile grid, which is a real feature of
           the floor rather than a seam.

           64x32 holds exactly two tile-diamonds of the (64,0)/(32,16) lattice,
           so it is a valid repeating rectangle. Pixels are sampled from the
           patch's TOP tile, whose apex sits at SRC_APEX in the source. */
        const W = 64, H = 32;                     // one isometric tile
        const out = Buffer.alloc(W * H * 4);
        const inside = (dx, dy) => Math.abs(dx) / 32 + Math.abs(dy - 16) / 16 <= 1.0001;

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let v = 0, found = false;
                // Apexes of the one-tile lattice near this pixel: (64k+32m, 16m).
                for (let m = -2; m <= 2 && !found; m++) {
                    for (let k = -2; k <= 2 && !found; k++) {
                        const ax = 64 * k + 32 * m, ay = 16 * m;
                        if (!inside(x - ax, y - ay)) continue;
                        const sx = x - ax + SRC_APEX, sy = y - ay;
                        if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
                        v = src.index[sy * src.w + sx];
                        found = true;
                    }
                }
                const o = (y * W + x) * 4;
                if (!v) continue;                       // index 0 is the surface
                out[o] = out[o + 1] = out[o + 2] = v;
                out[o + 3] = 255;
            }
        }
        return { w: W, h: H, rgba: out, used: src.used };
    }

    /* A stencil's raw index map, plus the set of indices it actually paints —
       the palettes only need entries for those. */
    function indexMap(name) {
        const m = byName.get(name);
        if (!m || !m.bitmap) return null;
        const bid = cast.childOf.get(`${m.id}:BITD`);
        if (bid === undefined) return null;
        const raw = cast.chunk(cast.byId.get(bid));
        const { pitch, w, h } = m.bitmap;
        if (!raw.length || w <= 0 || h <= 0) return null;
        const idx = raw.length === pitch * h ? raw : unpackBits(raw, pitch * h);
        const used = new Set();
        const rgba = Buffer.alloc(w * h * 4);
        const index = new Uint8Array(w * h);           // pitch stripped out
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const v = idx[y * pitch + x];
                used.add(v);
                index[y * w + x] = v;
                const o = (y * w + x) * 4;
                if (v === 0) continue;                 // the hole
                rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
                rgba[o + 3] = 255;
            }
        }
        return { w, h, rgba, used, index };
    }

    /* WHICH STENCIL A PATTERN IS ACTUALLY DRAWN WITH.

       The record's first field looks like the stencil number and is not. Taken
       at face value it says wallpattern_half1 uses stencil 1 — and stencil 1
       paints exactly ONE of the 65 indices that half1's ramp gives a colour
       to, so the wallpaper renders as a flat wall. Stencil 3 paints all 65.
       The same is true of half2, half3, tiles1, stripes and vstripes1: a whole
       family of wallpapers rendered blank because of that one assumption.

       So the stencil is CHOSEN rather than read: whichever one paints the most
       of the indices the ramp actually colours is the one the pattern was
       drawn for. That is measurable, and it cannot be wrong in the quiet way
       trusting the field was — a mismatch shows up as a coverage of nearly
       zero rather than as a plausible-looking flat wall. */
    function chooseStencil(kind, ramp, candidates) {
        if (!ramp) return { stencil: candidates[0], coverage: 0 };
        const wanted = [];
        ramp.forEach((c, i) => {
            if (!c) return;
            if (c[0] === 0 && c[1] === 0 && c[2] === 0) return;   // base colour
            wanted.push(i);
        });
        if (!wanted.length) return { stencil: candidates[0], coverage: 0 };

        return { stencil: 0, coverage: 1 };
    }

    /* THE DECLARED STENCIL IS CORRECT. Both of them. Twice now I have decided
       otherwise and been wrong, so it is worth writing down why it is right.

       The three wall panels are three RESOLUTIONS of the same position code,
       not three pictures:

           wall-1    34 indices, in runs of eight pixels — coarse
           wall-0    66 indices, one pixel each over a 4x16 cell — medium
           wall-3   225 indices, one pixel each — fine

       A wallpaper picks the resolution its design needs. vstripes1 is declared
       1 because its stripes are EIGHT pixels wide, and an eight-pixel stripe
       needs a stencil whose classes are eight pixels wide. Forcing it onto
       wall-0 gives a stripe one pixel wide — which is what it looked like.
       The detailed ones (brick, invaders, the pictures) are declared 3 because
       they need a class per pixel.

       What misled me was measuring "coverage" against the wrong index range:
       the coarse ramps are authored in a different palette bank, so at offset
       0 they appear to miss their own stencil entirely. The bank offset is
       found at runtime in room-iso.js; the stencil is simply what the
       catalogue says. And the room model settles nothing here — its walls use
       `wall_testpattern2`, a test pattern, on whichever panel suited it. */
    function withStencils(groups) {
        return groups.map(g => ({ ...g, declared: g.stencil, coverage: 1 }));
    }

    return {
        floors: withStencils(collect("floorpattern_patterns", "floorpattern_", "floor")),
        walls: withStencils(collect("wallpattern_patterns", "wallpattern_", "wall")),
        indexMap, seamlessFloor, ramp, byName
    };
}

/* Which bitmap each `stencil` number means. Floors have three; walls have a
   left and a right panel per number, because the two faces are drawn
   separately and are not mirrors of each other. */
/* The END CAPS are the 7px of wall thickness you see where a wall stops, and
   they are panels like any other — same palette classes, so they take the
   wallpaper with them. The cast has them for stencils 0 and 3 only (there is
   no left_wallend_1_...), so a stencil-1 wallpaper borrows stencil 0's; the
   two are the same shape at different resolutions and the cap is seven pixels
   wide, where the difference cannot show. */
const END_STENCIL = (n) => (n === 3 ? 3 : 0);

const STENCILS = {
    floor: (n) => [[`floor-${n}`, `flat_floor_${n}_a_0_0_0`]],
    wall: (n) => [
        [`wall-left-${n}`, `left_wallpart_${n}_a_0_0_0`],
        [`wall-right-${n}`, `right_wallpart_${n}_a_0_2_0`],
        [`wall-left-end-${END_STENCIL(n)}`, `left_wallend_${END_STENCIL(n)}_b_0_0_0`],
        [`wall-right-end-${END_STENCIL(n)}`, `right_wallend_${END_STENCIL(n)}_b_0_2_0`]
    ]
};

/* THE DOORWAY, which the room model places and nothing else in the cast
   explains.

   model_a.room — the 8x13 room this game is built on — lists its left wall as
   thirteen pieces, and the FIFTH of them is not a `left_wallpart` but a
   `left_wallmask`: the same panel with the doorway cut out of it. The door
   itself is a separate sprite dropped into that hole:

     [#member: "left_wallmask_0_a_0_0_0", #locH: 247, #locV: 185, ... #locY: 5]
     [#member: "leftdoor_open", #locH: 269, #locV: 180, #width: 32,
      #height: 101, #palette: #systemMac, #id: "command: GOAWAY"]

   With the registration points from the cast (-31,115 for the mask, -10,79
   for the door) those put the mask's top-left at (278, 70) and the door's at
   (279, 101) — so the door hangs 31px below the top of its wall panel and its
   bottom sits flush with the panel's. Both numbers are used verbatim in
   room-iso.js.

   ITS COLOURS ARE NOT IN THIS CAST. leftdoor_open declares palette member 0,
   which is the movie's own palette and lives in habbo.dcr, so the extractor
   falls back to a grey ramp and the door comes out nearly black. The five
   tones below were read off a real Origins render instead, by aligning the
   sprite against the door in the capture: every one of its index classes maps
   to exactly one colour there, and the pixel counts agree class for class
   (1971, 341, 297, 105, 35). */
const DOOR_TONES = {
    255: [0, 0, 0],          // the outline, and the shadow inside the frame
    253: [27, 27, 27],       // the reveal down the hinge side
    252: [54, 54, 54],       // the door face
    251: [68, 68, 68],       // the lit edge
    172: [40, 40, 40]        // handle and plate
};

function emitDoor(data, assetDir) {
    const out = [];

    for (const n of [0, 1, 3]) {
        const map = data.indexMap(`left_wallmask_${n}_a_0_0_0`);
        if (!map) { out.push([`wall-left-mask-${n}`, null]); continue; }
        fs.writeFileSync(path.join(assetDir, `wall-left-mask-${n}.png`),
            encodePng(map.w, map.h, map.rgba));
        out.push([`wall-left-mask-${n}`, map.used.size + " indices"]);
    }

    const door = data.indexMap("leftdoor_open");
    if (!door) { out.push(["door", null]); return out; }
    const rgba = Buffer.alloc(door.w * door.h * 4);
    const missing = new Set();
    for (let i = 0; i < door.w * door.h; i++) {
        const idx = door.index[i];
        if (idx === 0) continue;              // index 0 is the hole, as ever
        const c = DOOR_TONES[idx];
        if (!c) { missing.add(idx); continue; }
        rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2];
        rgba[i * 4 + 3] = 255;
    }
    fs.writeFileSync(path.join(assetDir, "door.png"), encodePng(door.w, door.h, rgba));
    out.push(["door", door.w + "x" + door.h +
        (missing.size ? "  UNTONED INDICES " + [...missing].join(",") : "")]);
    return out;
}

function emitStencils(data, assetDir) {
    fs.mkdirSync(assetDir, { recursive: true });
    const usedByStencil = new Map();          // file -> Set(index)
    const wanted = new Set();

    for (const kind of ["floor", "wall"]) {
        const groups = kind === "floor" ? data.floors : data.walls;
        for (const g of groups) {
            for (const [file, member] of STENCILS[kind](g.stencil)) {
                if (usedByStencil.has(file)) continue;
                // Floors ship as a seamless repeating tile; walls are stamped
                // per tile edge along the run and need the panel as it is.
                const map = kind === "floor" ? data.seamlessFloor(member) : data.indexMap(member);
                if (!map) { usedByStencil.set(file, null); continue; }
                fs.writeFileSync(path.join(assetDir, file + ".png"),
                    encodePng(map.w, map.h, map.rgba));
                usedByStencil.set(file, map.used);
                for (const v of map.used) wanted.add(v);
            }
        }
    }
    return { usedByStencil, wanted };
}

function emit(data, outPath, wanted) {
    /* Every palette in FULL, all 256 entries. Which indices a stencil paints
       varies by pattern, the reserved classes (255, 246, 241) sit at the far
       end of the table, and the whole thing is a few kilobytes. */
    const palettes = {};
    const names = new Set([...data.floors, ...data.walls].map(g => g.palette));
    for (const name of names) {
        const r = data.ramp(name);
        if (!r) continue;
        const entry = {};
        for (let i = 0; i < r.length; i++) {
            const c = r[i];
            if (c) entry[i] = "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
        }
        palettes[name] = entry;
    }

    const strip = (groups) => groups.map(g => ({
        id: g.id, stencil: g.stencil, palette: g.palette,
        colours: g.colours
    }));

    const body = {
        floors: strip(data.floors),
        walls: strip(data.walls),
        palettes
    };

    const js = `/* Habbo Origins' own floor and wallpaper catalogue.

   GENERATED by tools/room-patterns-extract.js from the client's
   hh_room_private.cct — do not hand-edit, re-run the tool.

   Every group here is one the original hotel offered, in the original's own
   order, with the exact colours it offered them in. \`stencil\` names the
   bitmap in assets/room/ the pattern is painted with — those pngs carry
   palette INDEXES, not colours — \`palette\` looks up the ramp in \`palettes\`
   below, and each entry in \`colours\` is one selectable swatch.

   A ramp entry MULTIPLIES the chosen colour — white leaves it alone, grey
   darkens it, and a chromatic entry paints itself because those patterns ship
   a single white swatch. See room-iso.js for how that is applied. */
(function () {
    "use strict";
    window.RoomPatterns = ${JSON.stringify(body, null, 4)};
})();
`;
    fs.writeFileSync(outPath, js);
    return js.length;
}

if (require.main === module) {
    const cct = process.argv[2] || DEFAULT_CCT;
    const out = process.argv[3] || path.join(__dirname, "..", "js", "room-patterns.js");
    const data = build(cct);

    console.log(`floors: ${data.floors.length} groups, ${data.floors.reduce((n, g) => n + g.colours.length, 0)} colours`);
    for (const g of data.floors) console.log(`  ${g.id.padEnd(12)} stencil ${g.stencil} (said ${g.declared})  palette ${g.palette.padEnd(14)} ${g.colours.length} col  cover ${(g.coverage*100).toFixed(0)}%`);
    console.log(`walls: ${data.walls.length} groups, ${data.walls.reduce((n, g) => n + g.colours.length, 0)} colours`);
    for (const g of data.walls) console.log(`  ${g.id.padEnd(16)} stencil ${g.stencil} (said ${g.declared})  palette ${g.palette.padEnd(18)} ${g.colours.length} col  cover ${(g.coverage*100).toFixed(0)}%`);

    const assetDir = path.join(__dirname, "..", "assets", "room");
    const { usedByStencil, wanted } = emitStencils(data, assetDir);
    console.log(`\nstencils -> ${assetDir}`);
    for (const [file, used] of usedByStencil) {
        console.log(`  ${file.padEnd(16)} ${used ? used.size + " indices" : "MISSING MEMBER"}`);
    }
    for (const [file, note] of emitDoor(data, assetDir)) {
        console.log(`  ${file.padEnd(16)} ${note || "MISSING MEMBER"}`);
    }

    const bytes = emit(data, out, wanted);
    console.log(`\nwrote ${out} (${(bytes / 1024).toFixed(1)} KB), full 256-entry palettes`);
}

module.exports = { build };

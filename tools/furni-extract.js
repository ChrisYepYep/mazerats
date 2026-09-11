/* Builds the game's furni library out of the Habbo Origins client.
   Writes assets/furni/*.png and js/furni-library.js.

   ----------------------------------------------------------------------
   WHY THIS EXISTS

   Fallin' Furni used FurniIndex's ready-made PNGs for artwork while taking
   geometry from the client, and the seam between the two is where every
   alignment bug in this game has come from. FurniIndex publish one image per
   bitmap the client draws, in their own order; the client thinks in
   DIRECTIONS. Nothing states how one maps onto the other, so the game had to
   guess, and a wrong guess puts a mirrored anchor on an unmirrored picture.

   Composing the sprites here removes the guess. Direction, anchor, footprint
   and pixels all come out of the same pass, so they cannot disagree.

   ----------------------------------------------------------------------
   HOW A FURNI IS PUT TOGETHER, ALL OF IT VERIFIED AGAINST THE REAL ARTWORK

   Members are named <class>_<part>_<f1>_<xdim>_<ydim>_<direction>_<state>.
   Each carries a registration point, and a part's top-left in the furni's own
   coordinate space is (-regX, -regY). Lay the parts of one direction and state
   out that way, union their boxes, and that is the whole sprite.

     LAYER ORDER is the part letter, ascending. divider_arm3 has parts a, b
     and c: a+b+c reproduces the published gate with 4,430 pixels identical,
     no wrong colours and no difference in coverage. Reversing the order
     misplaces 588 pixels, so this is not a coincidence.

     COLOUR comes from each member's own CLUT, read in FILE order — see the
     note on readClut in cct-extract.js. Read backwards, every colour is
     wrong; forwards, chair_polyfon matches the published chair exactly.

     INDEX 0 IS TRANSPARENT throughout these casts.

   ----------------------------------------------------------------------
   WHAT IS DELIBERATELY LEFT OUT

   `_sd` members are drop shadows the client composites separately, and
   one-pixel members are placeholders for states that draw nothing — they
   carry no picture but would drag the union box across the room.

   COLOUR VARIANTS ("chair_polyfon*2") share one set of bitmaps and are not
   generated here EITHER, and that is now the right answer rather than a gap:
   the client does not ship a recoloured bitmap, it tints the one bitmap at
   draw time from furnidata's partcolors — one colour per part, multiplied.
   The game does the same, in js/room-furni.js. Baking the colourways in here
   would mean 5,090 extra sprites for something a multiply does for free.

   usage: node tools/furni-extract.js [--out assets/furni] [--limit N]
*/

const fs = require("fs");
const path = require("path");

const crypto = require("crypto");

const { openCast, readMember, unpackBits, readClut } = require("./cct-extract.js");
const { encodePng } = require("./png-encode.js");

const CLIENT = process.env.HABBO_CLIENT ||
    "C:\\Users\\cjboy\\AppData\\Roaming\\Habbo Launcher\\downloads\\shockwave\\350";

const MEMBER = /^(.+)_([a-z])_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)$/;

function parseName(name) {
    const m = MEMBER.exec(name);
    if (!m) return null;
    return {
        className: m[1], part: m[2],
        xdim: Number(m[4]), ydim: Number(m[5]),
        direction: Number(m[6]), state: Number(m[7])
    };
}

/* A class's .props member: Lingo property lists, one per part.

       ["a": [#zshift: [30, 30, -30, -30, -30, -30, 30, 30]], "b": [#zshift: [-31]]]

   #zshift is a DEPTH OFFSET for that part, either one value for every
   direction or eight, one each. It is how a sofa puts its near arm in front of
   whoever is sitting on it while its back stays behind them — see the note on
   depth in js/room-furni.js. A part with no entry shifts by nothing.

   #ink names a Director ink mode and #blend an opacity percentage, and both
   matter because a part can be neither opaque nor ordinary:

     36  background transparent   the default, and what the pixel decoding
                                  below already does
     41  darken                   269 parts. This is the partcolors tint, and
                                  js/room-furni.js already applies it as a
                                  multiply — nothing more to carry
     33  add                      212 parts, and a GLOW: a lamp's cone of
                                  light, a fire's flame. Drawn normally it is
                                  a black rectangle with a flame inside it,
                                  which is exactly what a lit fireplace looked
                                  like. Added, the black contributes nothing
                                  and only the light lands
      8  matte                    114 parts; background flooded from the edges
                                  rather than keyed on a colour

   Only 33 and 34 change how the browser has to composite, so only they and
   #blend are carried into the library. */
function readProps(cast, byName, className) {
    const entry = byName.get(className + ".props");
    if (!entry) return null;
    const sid = cast.childOf.get(entry + ":STXT");
    if (sid === undefined) return null;
    let text;
    try {
        const buf = cast.chunk(cast.byId.get(sid));
        if (buf.length < 12) return null;
        const off = buf.readUInt32BE(0), len = buf.readUInt32BE(4);
        text = buf.toString("latin1", off, off + len);
    } catch { return null; }

    /* Sliced on the part keys rather than matched as balanced brackets. The
       obvious pattern for "a bracketed body" cannot see a nested list — its
       [^\]]* runs straight through the inner [ and stops at the first ], which
       hands back "#zshift: [30, 30" with the closing bracket missing, and the
       zshift never parses. Each part's body is simply everything up to the
       next "<letter>": and the nested list survives intact. */
    const out = {};
    const keys = [...text.matchAll(/"([a-z])"\s*:/g)];
    for (let i = 0; i < keys.length; i++) {
        const part = keys[i][1];
        const from = keys[i].index + keys[i][0].length;
        const to = i + 1 < keys.length ? keys[i + 1].index : text.length;
        const body = text.slice(from, to);

        // Written with or without the #: "ink": 36 and #ink: 36 both occur.
        const ink = /#?ink"?\s*:\s*(\d+)/.exec(body);
        const blend = /#?blend"?\s*:\s*(\d+)/.exec(body);
        if (ink && (ink[1] === "33" || ink[1] === "34")) (out.ink || (out.ink = {}))[part] = 1;
        if (blend && Number(blend[1]) < 100) (out.blend || (out.blend = {}))[part] = Number(blend[1]);

        const z = /#zshift\s*:\s*\[([^\]]*)\]/.exec(body);
        if (!z) continue;
        const nums = z[1].split(",").map(v => Number(v.trim())).filter(v => Number.isFinite(v));
        if (!nums.length) continue;
        // One value means every direction; eight means one each.
        (out.z || (out.z = {}))[part] = nums.length === 1
            ? [nums[0], nums[0], nums[0], nums[0], nums[0], nums[0], nums[0], nums[0]]
            : nums.slice(0, 8);
    }
    return Object.keys(out).length ? out : null;
}

/* THE MOVIE'S DEFAULT PALETTE, for the members that name palette 0.

   Director's palette 0 is the movie's own, which lives in habbo.dcr rather
   than in any cast, so it cannot be looked up where the pixels are. It is the
   Mac system palette, and this client ships that table in a place we can read
   it: `floor_basic` in hh_room_private.cct, which the room catalogue names as
   the plain floor's ramp and which is, read in file order, exactly the Mac
   palette — white at 0, black at 255, the EE/DD/BB/AA/88/77/55/44/22/00 grey
   tail at 246..255.

   PROVEN BY A PICTURE, not by that description. throne_b_0_1_1_0_0 rendered
   through it comes out a gold frame with a crimson padded back, which is the
   Habbo throne and could not be anything else; through the grey ramp it was
   being dropped entirely. If hh_room_private is not there, the caller gets
   null and behaves exactly as it did before. */
let macCache;
function macPalette() {
    if (macCache !== undefined) return macCache;
    macCache = null;
    try {
        const cast = openCast(path.join(CLIENT, "hh_room_private.cct"));
        for (const e of cast.res.filter(x => x.tag === "CASt")) {
            const m = readMember(cast.chunk(e));
            if (!m || m.name !== "floor_basic") continue;
            const cid = cast.childOf.get(`${e.id}:CLUT`);
            if (cid === undefined) continue;
            const pal = readClut(cast.chunk(cast.byId.get(cid)), { reverse: false });
            if (pal && pal.length >= 256) macCache = pal;
            break;
        }
    } catch { /* no room cast: the old behaviour, which drops these sprites */ }
    return macCache;
}

function main() {
    const argv = process.argv.slice(2);
    const outArg = argv.indexOf("--out");
    const OUT = outArg > -1 ? argv[outArg + 1] : path.join(__dirname, "..", "assets", "furni");
    const limArg = argv.indexOf("--limit");
    const LIMIT = limArg > -1 ? Number(argv[limArg + 1]) : Infinity;

    fs.mkdirSync(OUT, { recursive: true });

    const files = fs.readdirSync(CLIENT)
        .filter(f => /^hh_furni.*\.cct$/i.test(f))
        .filter(f => !/_50\.cct$/i.test(f) && !/_small\.cct$/i.test(f));

    const library = {};
    const written = new Map();      // class|part|sha1 -> the "<state>_<dir>" it was written under
    const glows = {};               // class -> part -> 1, for layers that are light rather than paint
    let sprites = 0, stubs = 0, skipped = 0, bytes = 0, trueColour = 0, alphaLayers = 0, noPalette = 0, unreadable = [];

    for (const file of files) {
        let cast;
        try { cast = openCast(path.join(CLIENT, file)); }
        catch (e) { unreadable.push(`${file}: ${e.message}`); continue; }

        // Index this cast's members once, then group them into sprites.
        const groups = new Map();   // class|state|dir -> [{part, ...}]
        const propNames = new Map();   // "<class>.props" -> cast member id
        const clutCache = new Map();

        const paletteFor = (memberNum) => {
            if (memberNum === null || memberNum === undefined || memberNum < 0) return null;
            /* PALETTE MEMBER 0 IS THE MOVIE'S OWN, which is the Mac system
               palette — see `macPalette` below. 241 sprites were being thrown
               away for "an unresolvable palette" because of this one case, and
               they were not obscure ones: the THRONE and the CLUB SOFA, two of
               the most recognisable pieces of furni Habbo ever sold, simply
               did not exist in this game. */
            if (memberNum === 0) return macPalette();
            if (clutCache.has(memberNum)) return clutCache.get(memberNum);
            let pal = null;
            const owner = cast.castTable[memberNum - 1];
            if (owner !== undefined) {
                const cid = cast.childOf.get(`${owner}:CLUT`);
                if (cid !== undefined) {
                    try { pal = readClut(cast.chunk(cast.byId.get(cid)), { reverse: false }); }
                    catch { pal = null; }
                }
            }
            clutCache.set(memberNum, pal);
            return pal;
        };

        for (const e of cast.res.filter(x => x.tag === "CASt")) {
            const m = readMember(cast.chunk(e));
            if (!m || !m.name) continue;
            if (m.name.endsWith(".props")) { propNames.set(m.name, e.id); continue; }
            if (!m.bitmap) continue;
            const p = parseName(m.name);
            if (!p) { skipped++; continue; }
            /* A ONE-PIXEL MEMBER IS A PART SAYING "NOT FROM THIS ANGLE", and
               it has to be kept rather than dropped.

               `gothic_sofa` ships six parts. Seen from direction 4 you are
               looking at the back of it, so its two front cushions — parts c
               and f — are 1x1 members: present, deliberately blank. Dropping
               them silently made direction 4 look like a group MISSING two
               parts, and the borrowing below then filled them in from
               direction 0, hanging the sofa's front cushions on its back. It
               matched the published sofa 60.9% that way.

               Recorded as blank, the difference is exactly the one the client
               draws: a part with no member for this direction is shared and
               can be borrowed (queue_tile1's slab), a part with a one-pixel
               member is blank and never is. */
            const { w, h } = m.bitmap;
            const blank = (w <= 1 && h <= 1) || w <= 0 || h <= 0;
            if (blank) stubs++;

            const key = `${p.className}|${p.state}|${p.direction}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ id: e.id, meta: p, bmp: m.bitmap, blank });
        }

        /* A STATE OR A DIRECTION NEED NOT SHIP EVERY PART, and the missing
           ones are not missing — they are the parts that did not change.

           Habbo animates by swapping members: `queue_tile1` state 1 is one
           bitmap, part `d`, the belt lines in their next position, and the
           slab, rim and arrows under them stay whatever state 0 drew. Read
           literally, state 1 is a sprite consisting of four grey squiggles
           floating in mid-air. 1,048 of this client's 4,753 (class, state,
           direction) groups are that shape.

           Directions do it too, and more sparingly: `queue_tile1` has one
           part `a` — the base slab, which is a 1x1 tile and looks identical
           whichever way the roller faces — so direction 4 ships only the
           three parts that differ. Drawn without it, a rotated roller is a
           belt with no body under it, which is exactly what levels using
           rotations 1 and 2 were showing.

           So a group borrows what it lacks: first from state 0 of the same
           direction, then from the OPPOSITE direction of the same state.

           Opposite, and only opposite. Directions 0 and 4 are the same axis
           seen from either end, so a part that exists for one and not the
           other is a part that does not change between them — the roller's
           slab. Directions 0 and 2 are different axes, and a part present in
           only one of them is genuinely absent from the other: sofa_polyfon
           draws a cushion in direction 0 that direction 2 does not have, and
           borrowing it there drops the match against the published sofa from
           96.7% to 90.4%. With the rule as written, the sofa is untouched and
           all four of the roller's rotations go from 6-82% to 100%.

           BORROWED PARTS ARE PLACED BY THEIR OWN REGISTRATION POINT, not by
           the offset they had in the group they came from. That is how the
           client places everything — a part's top-left is (-regX, -regY) in
           the furni's own space — and it is what makes this safe: a part
           lifted out of another direction lands where that member says it
           goes, not where another direction's union box happened to put it.
           Getting this wrong is what made an early version of this look like
           it was hurting sofa_polyfon. */
        const donors = new Map();          // class|state|dir -> parts, for lookup
        for (const [k, v] of groups) donors.set(k, v);

        function borrow(className, state, dir, have) {
            const wanted = new Set();
            for (const [k, parts] of donors) {
                const [c] = k.split("|");
                if (c !== className) continue;
                for (const p of parts) if (!p.blank) wanted.add(p.meta.part);
            }
            const opposite = (Number(dir) + 4) % 8;
            const from = [
                `${className}|0|${dir}`,             // the same view, not animating
                `${className}|${state}|${opposite}`, // the same axis, other end
                `${className}|0|${opposite}`         // both at once: an animating
                                                   // frame of a direction that
                                                   // never had the part either
            ];
            const out = [];
            for (const part of [...wanted].sort()) {
                if (have.has(part)) continue;
                for (const k of from) {
                    const hit = (donors.get(k) || []).find(p => p.meta.part === part && !p.blank);
                    if (hit) { out.push(hit); break; }
                }
            }
            return out;
        }

        /* Lowest state and direction first, so that when two groups share a
           picture the file is named after the earliest one — queue_tile1's slab
           lands in queue_tile1_0_0_a.png rather than whichever group the map
           happened to reach first. */
        const ordered = [...groups.entries()].sort((x, y) => {
            const [ac, as, ad] = x[0].split("|"), [bc, bs, bd] = y[0].split("|");
            return ac < bc ? -1 : ac > bc ? 1 : Number(as) - Number(bs) || Number(ad) - Number(bd);
        });

        for (const [key, group] of ordered) {
            if (sprites >= LIMIT) break;
            const [className, state, dir] = key.split("|");

            const have = new Set(group.map(p => p.meta.part));
            // A blank part is a part this group HAS; it just draws nothing.
            const parts = group.filter(p => !p.blank)
                .concat(borrow(className, state, dir, have));

            // Alphabetical: the order the client draws them in.
            parts.sort((a, b) => a.meta.part < b.meta.part ? -1 : 1);

            // Decode every layer first — a layer that will not decode must not
            // leave a half-drawn sprite behind.
            const layers = [];
            let bad = false;
            for (const part of parts) {
                const { pitch, w, h, paletteMember, regX, regY, bitDepth } = part.bmp;
                const bitdId = cast.childOf.get(`${part.id}:BITD`);
                if (bitdId === undefined) { bad = true; break; }
                let bytes;
                try {
                    const raw = cast.chunk(cast.byId.get(bitdId));
                    bytes = raw.length === pitch * h ? raw : unpackBits(raw, pitch * h);
                } catch { bad = true; break; }
                if (!bytes || bytes.length < pitch * h) { bad = true; break; }
                if (bitDepth !== 8 && bitDepth !== 32) { bad = true; break; }
                const pal = bitDepth === 8 ? paletteFor(paletteMember) : null;
                /* An 8-bit layer whose palette will not resolve has no colours
                   at all, and inventing them produces a flat magenta furni —
                   worse than not shipping it, because the game would use it.
                   Dropping the sprite leaves no library entry, and the renderer
                   falls back to its old artwork for that class alone. 66 of
                   1,318 classes end up here: they name a built-in palette the
                   .cct files do not contain, and the built-ins could not be
                   recovered from the artwork because the furni using them are
                   themselves recolours. */
                if (bitDepth === 8 && !pal) { bad = true; noPalette++; break; }
                /* IS THIS LAYER'S ALPHA PLANE A MASK, OR IS IT NOISE?

                   Two tests, and the second one is the one that matters.

                   NOT UNIFORM. All-255 is a channel nobody filled in, not
                   opaque artwork, and believing it keeps the whole background
                   rectangle; all-0 is the same emptiness the other way up, and
                   believing THAT threw 378 sprites away the first time this
                   was tried.

                   AND THE CORNERS MUST BE CLEAR. An isometric furni's bitmap
                   is a diamond in a rectangle: the four corners of the box are
                   never artwork. A plane that calls a corner opaque is
                   therefore not describing this picture, whatever else it
                   contains. `cabin_divider_arm1` is the case that proves it —
                   its plane clears 410 pixels, of which 383 are the middle of
                   the divider, and calls all 1,244 background pixels solid.
                   Trusted, it punched holes in the furni and left it sitting
                   in a white box. Its 8-bit twin `divider_arm1` has exactly
                   1,244 transparent pixels, so the right silhouette is not in
                   doubt.

                   Across the client: 2,289 32-bit layers have four clear
                   corners, 160 have none, 336 have some. The 160 are the ones
                   this rescues.

                   WHEN THE PLANE IS NOT A MASK, the background is a flat
                   colour and Director drops it with ink 36. Which colour is
                   read off the corners rather than assumed to be white —
                   white covers 122 of those 160 and black 17, and assuming
                   white is what turned hh_furni_2025's black-backed sprites
                   into black rectangles. */
                let hasAlpha = false, bgColour = null;
                if (bitDepth === 32) {
                    const A = (x, y) => bytes[y * pitch + x];
                    const RGB = (x, y) => [bytes[y * pitch + w + x], bytes[y * pitch + 2 * w + x], bytes[y * pitch + 3 * w + x]];
                    const corners = w > 1 && h > 1
                        ? [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]
                        : [[0, 0]];

                    let anyClear = false, anySolid = false;
                    for (let y = 0; y < h && !(anyClear && anySolid); y++) {
                        const row = y * pitch;
                        for (let x = 0; x < w; x++) {
                            if (bytes[row + x] < 8) anyClear = true; else anySolid = true;
                            if (anyClear && anySolid) break;
                        }
                    }
                    hasAlpha = anyClear && anySolid && corners.some(([x, y]) => A(x, y) < 8);

                    if (!hasAlpha) {
                        const seen = corners.map(([x, y]) => RGB(x, y).join(","));
                        bgColour = seen.every(v => v === seen[0])
                            ? seen[0].split(",").map(Number)
                            : [255, 255, 255];
                    }
                }
                layers.push({ part: part.meta.part, pitch, w, h, regX, regY, bytes, bitDepth, pal, hasAlpha, bgColour });
                if (bitDepth === 32) { trueColour++; if (hasAlpha) alphaLayers++; }
            }
            if (bad || !layers.length) { skipped++; continue; }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const l of layers) {
                minX = Math.min(minX, -l.regX); minY = Math.min(minY, -l.regY);
                maxX = Math.max(maxX, -l.regX + l.w); maxY = Math.max(maxY, -l.regY + l.h);
            }
            const W = maxX - minX, H = maxY - minY;
            // A sprite wider than the room is a broken record, not a furni.
            if (W <= 0 || H <= 0 || W > 1200 || H > 1200) { skipped++; continue; }

            /* Two bitmap formats, both verified pixel-exact against the same
               furni as FurniIndex publish it:

               8-BIT   palette indices, index 0 transparent.

               32-BIT  true colour, and each ROW is stored as four byte-planes
                       — all the alpha bytes, then all red, then green, then
                       blue — not as interleaved pixels.

                       THE ALPHA PLANE IS THE ANSWER, which is the opposite of
                       what this said before. The old rule was "pure white is
                       the hole", on the grounds that these are drawn with
                       Director's ink 36 over a white background. That is true
                       of a lot of them and false of plenty: sampled across
                       every furni cast, 1,646 of 1,773 32-bit layers carry a
                       real alpha plane, and where the background is BLACK
                       rather than white — which is most of hh_furni_2025 —
                       the white rule keeps every background pixel and the
                       furni comes out as a black rectangle with a sofa on it.

                       So: use the alpha plane when it says anything, and keep
                       the white rule only for the layers whose alpha is
                       uniformly opaque and therefore tells us nothing. Where
                       both apply they agree — bardesk_polyfon drops the same
                       1,018 pixels either way. Partial alpha is carried
                       through rather than rounded, so edges stay as soft as
                       the client draws them. */
            /* ONE PNG PER PART, not one per furni.

               A furni is not a picture, it is a stack of them, and the stack
               has to stay open because the avatar goes INSIDE it: sitting on a
               sofa puts you in front of its back and behind its near arm. A
               flattened sprite cannot express that, and flattening is what the
               first version of this did.

               Every part is written at the same box and anchor as the whole
               piece, with its own offset recorded, so the renderer can place
               them independently and still have them line up. */
            const placed = [];
            for (const l of layers) {
                const ox = -l.regX - minX, oy = -l.regY - minY;
                const pw = l.w, ph = l.h;
                const rgba = Buffer.alloc(pw * ph * 4);
                let drawn = 0, nearBlack = 0;
                for (let y = 0; y < ph; y++) {
                    const row = y * l.pitch;
                    for (let x = 0; x < pw; x++) {
                        let r, g, b, a = 255;
                        if (l.bitDepth === 8) {
                            const v = l.bytes[row + x];
                            if (v === 0) continue;
                            const c = l.pal[v];
                            if (!c) continue;
                            r = c[0]; g = c[1]; b = c[2];
                        } else {
                            r = l.bytes[row + l.w + x];
                            g = l.bytes[row + 2 * l.w + x];
                            b = l.bytes[row + 3 * l.w + x];
                            if (l.hasAlpha) {
                                a = l.bytes[row + x];
                                if (a < 8) continue;
                            } else if (l.bgColour && r === l.bgColour[0] && g === l.bgColour[1] && b === l.bgColour[2]) continue;
                        }
                        const d = (y * pw + x) * 4;
                        rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = a;
                        drawn++;
                        if (r < 32 && g < 32 && b < 32) nearBlack++;
                    }
                }
                // A part that draws nothing is not worth a file or a lookup.
                if (!drawn) continue;

                /* GLOWS THE PROPS DO NOT ADMIT TO.

                   `solveInk` in hh_furni_classes.cct defaults to ink 8 when a
                   class has no .props entry for a part, and `lamp_armas` has
                   an EMPTY .props — yet its lit state ships a 100x155 layer
                   that is a warm gradient out of pure black, and FurniIndex's
                   render of the same lamp is a soft bloom with no black box
                   anywhere. Drawn as an ordinary layer it is a dark oval sat
                   over the room, which is what a switched-on lamp looked like.

                   So a part is treated as light if it is BOTH:

                     only in a switched-on state   state 0 does not have it, so
                                                   it is the thing that appears
                                                   when you turn the furni on
                     mostly black                  over half its pixels, which
                                                   is how an additive layer is
                                                   drawn — black adds nothing

                   Both together, because either alone is wrong: the lamp's lit
                   SHADE is also state-only and only 17% black, and plenty of
                   ordinary furni have dark parts in state 0. */
                const litOnly = String(state) !== "0" &&
                    !(donors.get(`${className}|0|${dir}`) || []).some(q => q.meta.part === l.part && !q.blank);
                if (litOnly && nearBlack / drawn > 0.5) {
                    (glows[className] || (glows[className] = {}))[l.part] = 1;
                }

                /* ONE FILE PER DISTINCT PICTURE. A borrowed part is the same
                   pixels under a second name — the roller's slab would be
                   written six times, once per state and direction — so an
                   identical PNG is not written twice. `f` names the file the
                   part actually lives in when that is not this group's own
                   state and direction; js/room-furni.js reads it. */
                const png = encodePng(pw, ph, rgba);
                const digest = crypto.createHash("sha1").update(png).digest("hex");
                const own = `${state}_${dir}`;
                const seen = written.get(`${className}|${l.part}|${digest}`);
                if (seen === undefined) {
                    written.set(`${className}|${l.part}|${digest}`, own);
                    fs.writeFileSync(path.join(OUT, `${className}_${own}_${l.part}.png`), png);
                    bytes += png.length;
                }
                const where = seen === undefined ? own : seen;
                placed.push(where === own
                    ? { k: l.part, ox, oy, w: pw, h: ph }
                    : { k: l.part, ox, oy, w: pw, h: ph, f: where });
            }
            if (!placed.length) { skipped++; continue; }
            sprites++;

            const rec = library[className] || (library[className] = {
                x: parts[0].meta.xdim, y: parts[0].meta.ydim, s: {}
            });
            /* zshift is a property of the CLASS and its parts, not of one
               direction, and the table covers all eight even where only two
               are drawn — so a mirrored direction can still look up the shift
               for the way it actually ends up facing. */
            if (!rec.read) {
                rec.read = 1;
                const props = readProps(cast, propNames, className);
                if (props) {
                    if (props.z) rec.z = props.z;
                    if (props.ink) rec.add = props.ink;      // parts drawn additively
                    if (props.blend) rec.bl = props.blend;   // parts drawn part-transparent
                }
            }
            const st = rec.s[state] || (rec.s[state] = {});
            st[dir] = { w: W, h: H, ax: -minX, ay: -minY, p: placed };
        }
    }

    const classes = Object.keys(library).length;
    for (const [cls, parts] of Object.entries(glows)) {
        const rec = library[cls];
        if (!rec) continue;
        rec.add = Object.assign({}, rec.add, parts);
    }
    for (const rec of Object.values(library)) delete rec.read;

    const js = `/* GENERATED by tools/furni-extract.js — do not hand-edit.

   The game's furni, composed from the Habbo Origins client itself. See the
   tool for how a sprite is put together and how each step was checked against
   the real artwork.

     FurniLibrary[className] = {
        x, y   footprint in tiles at direction 0, as the client's own member
               names give it
        z      { part: [zshift x8] } — the part's DEPTH OFFSET, one per
               direction. Absent means the class ships no .props.
        s      { state: { direction: {
                   w, h, ax, ay,          the whole piece's box and anchor
                   p: [ { k, ox, oy, w, h } ]   its parts, in draw order
               } } }
     }

   ax,ay is where the furni's origin sits INSIDE its sprite. The origin is the
   west vertex of the piece's own tile — see js/room-furni.js, which also owns
   the rule for what a mirrored direction does to that anchor.

   A furni is kept as separate PARTS rather than one flattened picture because
   the avatar goes between them: sitting on a sofa puts you in front of its
   back and behind its near arm. ox,oy positions a part inside the box, and
   z decides where it falls in the room's depth order.

   Artwork is assets/furni/<className>_<state>_<direction>_<part>.png.

   ${classes} classes, ${sprites} sprites. */
(function () {
    "use strict";
    window.FurniLibrary = ${JSON.stringify(library)};
})();
`;
    const jsPath = path.join(__dirname, "..", "js", "furni-library.js");
    fs.writeFileSync(jsPath, js);

    console.log(`composed ${sprites} sprites across ${classes} classes`);
    console.log(`  ${trueColour} layers were 32-bit true colour (${alphaLayers} with a real alpha plane), the rest palette-indexed`);
    console.log(`  ${stubs} one-pixel placeholders and ${skipped} unusable members skipped`);
    console.log(`  ${noPalette} sprites dropped for an unresolvable palette (the game keeps its old art for those)`);
    if (unreadable.length) {
        console.log(`  could not open ${unreadable.length} cast file(s):`);
        for (const u of unreadable) console.log(`    ${u}`);
    }
    console.log(`  artwork ${(bytes / 1048576).toFixed(1)} MB -> ${OUT}`);
    console.log(`  index ${(js.length / 1024).toFixed(0)} KB -> ${jsPath}`);
}

if (require.main === module) main();

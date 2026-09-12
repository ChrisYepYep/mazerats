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

   One-pixel members are placeholders for states that draw nothing — they
   carry no picture but would drag the union box across the room.

   `_sd` members were left out too, and are now IN — see SHADOW below. They
   are still kept out of the union box and off the part list, because a drop
   shadow is not a layer of the sprite; it is a mask on the floor underneath.

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

/* ---- DROP SHADOWS, the soft patch of floor under every piece.

   `<class>_sd_<direction>`, or `<class>_sd` for a piece whose shadow is the
   same whichever way it faces. 1,099 members across the furni casts, covering
   765 of this library's classes. They were left out of this tool from the
   start, so every furni in the game sits on the floor rather than on anything,
   which is the 33-pixel difference against FurniIndex's chair and 610 on their
   bed.

   WHAT THEY ARE: a silhouette, not a picture. Every one of them is a hard
   black-or-clear mask — checked across both formats, 8-bit ones are palette
   index 0 and index 255 (black) and nothing else, 32-bit ones are 0,0,0 at
   alpha 0 or 255 and nothing else. No grey, no soft edge. So they are written
   as black with the mask's own alpha, and never need a palette resolving,
   which is why a shadow survives for classes whose ARTWORK does not.

   HOW THE CLIENT DRAWS THEM, out of `solveMembers` in hh_furni_classes.cct:

       tShadowName = tClass & "_sd"
       if listp(pDirection) then tShadowName = tShadowName & "_" & pDirection[1]
       tShadowNum = getmemnum(tShadowName)
       if (not tShadowNum) and listp(pDirection) then
           tShadowNum = getmemnum(tClass & "_sd")
       ...
       tSpr.ink   = me.solveInk("sd")        -- 8, matte, the default
       tSpr.blend = me.solveBlend("sd")      -- 100, the default, because
       if tSpr.blend = 100 then              -- no class's .props has an "sd"
           tSpr.blend = 20                   -- key. Checked: none of 1,426 do.

   So: TWENTY PER CENT BLACK, looked up by the direction the piece is FACING,
   falling back to the undirected member, and no shadow at all when neither
   exists. js/room-furni.js owns the drawing half.

   BY FACING, NOT BY THE DIRECTION THE ARTWORK CAME FROM. Habbo draws half its
   rotations by mirroring one sprite, but it does NOT mirror the shadow — it
   ships a separate member for the mirrored facing. `sofa_dpolyfon` draws
   directions 0 and 2 and carries FOUR shadows, 0, 2, 4 and 6; its `_sd_6` is
   `_sd_0` reflected, same size and same 2,428 drawn pixels, with its own
   registration point. 68 classes ship a shadow for a direction their artwork
   never draws, and that is why.

   AND THE NUMBER REALLY IS THE DIRECTION. Measured rather than assumed: a
   shadow lies under the piece, so its left and right edges in the furni's own
   space should match that direction's sprite. Over the 292 shadows belonging
   to classes drawn more than one way, 194 fit their own label best and the
   other 98 tie with their label's MIRROR, which has the same extent and is
   what a tie there means. None fits a direction off the other axis: reusing
   `lc_desk`'s `_sd_0` at facing 2 would be 68 pixels wrong. */
const SHADOW = /^(.+)_sd(?:_(\d+))?$/;

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
/* ---- WHAT A FURNI DOES WHEN IT IS ON, out of `<class>.data`.

   586 classes carry one of these and 225 of them animate. It is the answer to
   a question this repo previously got wrong in a way worth writing down: the
   `state` numbers on a furni's bitmaps are not states a player chooses, they
   are ANIMATION FRAMES, and offering them as a list to cycle through is
   offering somebody the individual frames of a flame.

   The real thing is small:

       [ states:[1, 2],
         statestrings:[ "off", "on" ],
         layers:[
           a:[ [ frames:[0] ] ],
           c:[ [ frames:[0] ],
               [ loop:0, random:1, delay:2, frames:[1,2,3,4,5,6,7,8,9,10] ] ] ] ]

   `states` are the states — usually two, and `statestrings` says so in words.
   Each LAYER (a part letter) then gets one entry per state, and that entry is
   a frame list: which of the class's bitmap states that part shows. One frame
   is a still picture. Several is an animation.

     delay    how many ticks to hold each frame. Absent means every tick.
     loop     0 keeps going, 1 plays through once.
     random   pick the next frame at random rather than in order — which is
              exactly how a fire flickers instead of marching, and is why a
              hearth drawn frame-by-frame in order never looked right.

   The frame numbers ARE the bitmap state in the member names this tool
   already splits on, so a frame needs no translation: frame 7 of part c is
   the picture already written as <class>_7_<dir>_c.png. */
function readAnim(cast, byName, className) {
    const entry = byName.get(className + ".data");
    if (entry === undefined) return null;
    const sid = cast.childOf.get(entry + ":STXT");
    if (sid === undefined) return null;
    let text;
    try {
        const buf = cast.chunk(cast.byId.get(sid));
        if (buf.length < 12) return null;
        const off = buf.readUInt32BE(0), len = buf.readUInt32BE(4);
        if (off + len > buf.length) return null;
        text = buf.toString("latin1", off, off + len).replace(/\r/g, "\n");
    } catch { return null; }

    const st = /states:\s*\[([^\]]*)\]/.exec(text);
    const states = st ? st[1].split(",").map(s => +s.trim()).filter(Number.isFinite) : [];
    if (!states.length) return null;

    const names = [];
    const ss = /statestrings:\s*\[([^\]]*)\]/.exec(text);
    if (ss) for (const m of ss[1].matchAll(/"([^"]*)"/g)) names.push(m[1]);

    const li = text.indexOf("layers:");
    if (li < 0) return null;
    const body = text.slice(li);

    /* Sliced on the layer letters, the same way readProps is and for the same
       reason: a bracket-matching regex runs straight through the nested frame
       list. A layer is "<letter>:[" up to the next one. */
    const keys = [...body.matchAll(/\b([a-z]):\s*\[/g)];
    const layers = {};
    for (let i = 0; i < keys.length; i++) {
        const letter = keys[i][1];
        const from = keys[i].index;
        const to = i + 1 < keys.length ? keys[i + 1].index : body.length;
        const chunk = body.slice(from, to);

        /* One entry per state, in order. Each is a bracketed group holding a
           frames list and optionally delay/loop/random, so the groups are
           found by their frames and the modifiers read from the same slice. */
        const groups = [...chunk.matchAll(/\[([^[\]]*frames:\s*\[[^\]]*\][^[\]]*)\]/g)];
        const perState = groups.map(g => {
            const inner = g[1];
            const frames = (/frames:\s*\[([^\]]*)\]/.exec(inner) || [, ""])[1]
                .split(",").map(s => +s.trim()).filter(Number.isFinite);
            const out = { f: frames };
            const d = /delay:\s*(\d+)/.exec(inner);
            const r = /random:\s*(\d+)/.exec(inner);
            const lp = /loop:\s*(\d+)/.exec(inner);
            if (d && +d[1] > 1) out.d = +d[1];
            if (r && +r[1]) out.r = 1;
            if (lp && +lp[1]) out.lp = 1;          // 1 = play once; 0 = loop
            return out;
        }).filter(g => g.f.length);
        if (perState.length) layers[letter] = perState;
    }
    if (!Object.keys(layers).length) return null;

    const out = { n: states.length, l: layers };
    if (names.length === states.length) out.names = names;
    return out;
}

/* ---- WHAT A FURNI DOES WHEN IT IS ON, for the 129 classes that never say.

   `readAnim` above is the client's own answer and is always preferred. But
   129 classes ship more than two bitmap states and no `.data` at all, and the
   oil lamp — `lamp2_armas` — is one of them. Its members are

       a  state 0        the lamp
       b  states 1,2,3,4 the flame, four pictures of it
       c  state 1        the glow, drawn additively (its .props says #ink: 33)

   With nothing to say otherwise, the game offered those five bitmap states as
   five states to cycle through, so the lamp had a "State 3/5" button and never
   animated. That is the same mistake `.data` was brought in to fix, one rung
   down: these are FRAMES, and the class has two states like everything else.

   WHEN A CLASS IS A SWITCH. Turning something on makes something APPEAR — so:

     * some part must ship a picture at state 0, so there is a lamp to see
       while it is off, and
     * some part must ship a picture above state 0 and none AT state 0, so
       there is something that exists only while it is on.

   Both halves are load-bearing, and each is what rejects a whole family:

     no part above 0 alone     a dice's six faces (`edice`), a television's
                               channels (`red_tv`), a present opening
                               (`s_anniv_present_gen1`), a roller's belt
                               (`queue_tile1`) — every state draws the same
                               parts, so none of them is "off"
     no part at 0              `blossom_apple4` draws nothing until state 3.
                               Those are a tree's growth stages, and calling
                               stage 0 "off" would mean an invisible tree

   Over the 129 the rule takes 50 and leaves 79, and the 50 read as exactly
   what you would expect a switch to be: the lamps, the candles, the two
   fireplaces, the menorah, the televisions, the fan, the fountain, the globe,
   the hot tub, the beehive, the cake.

   THEN THE LAYERS FOLLOW WITHOUT A CHOICE. Off is each part's state-0 picture,
   or nothing where it has none. On is each part's pictures above state 0 in
   order — or its state-0 picture held, for the parts that do not change. A
   part absent from a state is written as `null`, which `frameOf` in
   js/room-furni.js already reads as "takes no part in this state".

   THE ONE NUMBER THAT IS NOT IN THE CLIENT is how long to hold a frame, so it
   is taken from the nearest thing that is: the delay on comparable furni that
   DO ship a `.data`. Every short flame in this client runs at 1 or 2 —
   `grunge_candle` 4 frames at 2, `hc_wall_lamp` 4 at 1, `jp_lantern` 4 at 1,
   `tiki_torch` 5 at 2, `tiki_statue` 5 at 2, `fireplace_dpolyfon` 10 at 2 —
   so 2 it is, which is twelve pictures a second.

   Marked `i: 1` so the library says which entries were inferred rather than
   read. Nothing uses that yet; it is there so the next person can tell. */
const INFERRED_DELAY = 2;

function inferAnim(own) {
    if (!own) return null;

    const states = new Set();
    for (const s of own.values()) for (const v of s) states.add(v);
    // Two or fewer bitmap states already behave as a switch, and one is a
    // still. Only the classes offering a cycle are in question here.
    if (states.size <= 2) return null;

    const parts = [...own.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const lit = parts.filter(([, s]) => s.size && !s.has(0));
    if (!parts.some(([, s]) => s.has(0)) || !lit.length) return null;

    const l = {};
    for (const [part, s] of parts) {
        if (!s.size) continue;              // blank in every state: not a layer
        const above = [...s].filter(v => v > 0).sort((a, b) => a - b);
        const on = { f: above.length ? above : [0] };
        if (on.f.length > 1) on.d = INFERRED_DELAY;
        l[part] = [s.has(0) ? { f: [0] } : null, on];
    }
    return Object.keys(l).length ? { n: 2, l, i: 1 } : null;
}

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
/* Director's built-in greyscale, which is what a palette member of -2 names.
   White at 0 down to black at 255 — see the note in `paletteFor` for how that
   was established and measured. */
let greyCache;
function greyscalePalette() {
    if (!greyCache) {
        greyCache = new Array(256);
        for (let i = 0; i < 256; i++) greyCache[i] = [255 - i, 255 - i, 255 - i];
    }
    return greyCache;
}

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

    /* THE `_50` CASTS ARE IN NOW, and they are not duplicates.

       They were excluded as redundant, which they looked to be — every class
       in them already had artwork. They are the HALF-SCALE set: the client
       draws its big rooms at 32x16 to a tile rather than 64x32 and ships a
       second set of art to match, named with an `s_` prefix. Nothing collides,
       because `s_bench_armas` is its own class name as far as this tool is
       concerned; the game pairs the two up at draw time by prefix.

       hh_furni_s_assets_1..5 were coming through all along — they do not end
       in `_50` — which is why 504 `s_` classes were already on disk and the
       gap was invisible until something needed a particular one.

       `_small` stays out. Despite the name it is not the half-scale room art:
       it is catalogue thumbnails, named `bed_armas_two_small` rather than in
       parts, and nothing in a room ever draws one. */
    const files = fs.readdirSync(CLIENT)
        .filter(f => /^hh_furni.*\.cct$/i.test(f))
        .filter(f => !/_small\.cct$/i.test(f));

    const library = {};
    const written = new Map();      // class|part|sha1 -> the "<state>_<dir>" it was written under
    const glows = {};               // class -> part -> 1, for layers that are light rather than paint
    /* class -> part -> the states it genuinely ships a picture for. Collected
       across every cast, because a class is split between them — `lamp2_armas`
       has members in three — and gathered BEFORE the borrowing below, since a
       borrowed part is one this state does not have. See inferAnim. */
    const owned = new Map();
    const shadows = {};             // class -> facing|"all" -> { w, h, ax, ay, f }
    let sdWritten = 0, sdSkipped = 0, sdBlank = 0, bytes2 = 0;
    let sprites = 0, stubs = 0, skipped = 0, bytes = 0, trueColour = 0, alphaLayers = 0, noPalette = 0, unreadable = [];

    for (const file of files) {
        let cast;
        try { cast = openCast(path.join(CLIENT, file)); }
        catch (e) { unreadable.push(`${file}: ${e.message}`); continue; }

        // Index this cast's members once, then group them into sprites.
        const groups = new Map();   // class|state|dir -> [{part, ...}]
        const propNames = new Map();   // "<class>.props" -> cast member id
        const clutCache = new Map();
        const shadowMembers = [];   // the class's _sd members in this cast

        const paletteFor = (memberNum) => {
            if (memberNum === null || memberNum === undefined) return null;
            /* PALETTE -2 IS A GREYSCALE, and it is the single biggest hole in
               this tool: 548 layers across 126 classes name it, and every one
               of them was thrown away. The .cct files do not carry it because
               it is one of Director's BUILT-IN palettes — the member field is
               negative and the castLib beside it is -1, "this movie", on all
               951 members that ask for it.

               WHAT IT IS: 256 greys, white at index 0 descending to black at
               255. colour(i) = (255-i, 255-i, 255-i).

               WHY THAT IS NOT A GUESS. A furni drawn against it is drawn in
               GREY and gets its colour the way every other recolour does —
               the client multiplies each part by its partcolor, which
               js/room-furni.js already reproduces. So what FurniIndex publish
               can be PREDICTED from the client's indices alone:

                   predicted = grey(255 - index) * partcolor / 255

               Measured against their renders, aligned pixel for pixel:

                 summer_chair    8 colourways — aqua, black, green, pink, red,
                                 white, yellow and plain — 98.2% to 99.5% of
                                 pixels within 3 levels, mean error 0.6 to 2.8.
                                 Eight different tints over one grey source,
                                 all agreeing, is the whole argument.
                 wood_tv         untinted, so the palette bare: 100.0% within
                                 3 levels, mean error 0.0.

               18 of 24 published renders came out at 90% or better. The six
               that did not are a fireplace and a television matched against
               the wrong ANIMATION FRAME, plus the fire itself, which is drawn
               with a blend ink and so is not the palette colour on screen at
               all — the same reason tiki_waterfall cannot be read this way.

               Recovered by tools/palette-recover.js, which is kept so the
               measurement can be re-run rather than taken on trust. */
            if (memberNum === -2) return greyscalePalette();
            if (memberNum < 0) return null;
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
            // `.data` rides in the same index: both are per-class text fields
            // looked up by name a few lines below.
            if (m.name.endsWith(".props") || m.name.endsWith(".data")) {
                propNames.set(m.name, e.id);
                continue;
            }
            if (!m.bitmap) continue;
            const p = parseName(m.name);
            if (!p) {
                // Tried only after the part pattern has failed, so a class
                // that happens to end in _sd cannot swallow its own parts.
                const s = SHADOW.exec(m.name);
                if (s) shadowMembers.push({ id: e.id, className: s[1], facing: s[2], bmp: m.bitmap });
                else skipped++;
                continue;
            }
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

            if (!blank) {
                let own = owned.get(p.className);
                if (!own) owned.set(p.className, own = new Map());
                let seen = own.get(p.part);
                if (!seen) own.set(p.part, seen = new Set());
                seen.add(p.state);
            }

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
                // What it does when it is switched on — see readAnim.
                const anim = readAnim(cast, propNames, className);
                if (anim) rec.an = anim;
            }
            const st = rec.s[state] || (rec.s[state] = {});
            st[dir] = { w: W, h: H, ax: -minX, ay: -minY, p: placed };
        }

        /* ---- the shadows in this cast. See SHADOW at the top of the file.

           Kept apart from the composition above because a shadow is not a part
           of the sprite: it is not in the union box, it does not take a part
           letter, it is never mirrored, and it is drawn under the piece rather
           than in it. Held in `shadows` rather than written into `library`
           here, because a class's shadow and its artwork are often in
           different casts and either may come first. */
        for (const sm of shadowMembers) {
            const { pitch, w, h, bitDepth, regX, regY } = sm.bmp;
            if (w <= 0 || h <= 0 || w > 1200 || h > 1200) { sdSkipped++; continue; }
            const bitdId = cast.childOf.get(`${sm.id}:BITD`);
            if (bitdId === undefined) { sdSkipped++; continue; }
            let bytes;
            try {
                const raw = cast.chunk(cast.byId.get(bitdId));
                bytes = raw.length === pitch * h ? raw : unpackBits(raw, pitch * h);
            } catch { sdSkipped++; continue; }
            if (!bytes || bytes.length < pitch * h) { sdSkipped++; continue; }

            /* A MASK, so there is one question per pixel: is this floor in
               shadow or not. 8-bit and below are palette indices with 0 clear;
               32-bit is the same four-plane layout the parts use, and only its
               alpha plane is read. No palette is resolved either way — see the
               note at the top on why every one of these is black. */
            const rgba = Buffer.alloc(w * h * 4);
            let drawn = 0;
            for (let y = 0; y < h; y++) {
                const row = y * pitch;
                for (let x = 0; x < w; x++) {
                    let on;
                    if (bitDepth === 32) on = bytes[row + x] >= 8;
                    else if (bitDepth === 8) on = bytes[row + x] !== 0;
                    else {
                        // 1, 2 and 4-bit rows pack several pixels per byte,
                        // highest bits first. 58 members, all of them small.
                        const per = 8 / bitDepth;
                        const b = bytes[row + Math.floor(x / per)];
                        const shift = (per - 1 - (x % per)) * bitDepth;
                        on = ((b >> shift) & ((1 << bitDepth) - 1)) !== 0;
                    }
                    if (!on) continue;
                    rgba[(y * w + x) * 4 + 3] = 255;      // black, by leaving rgb at 0
                    drawn++;
                }
            }
            /* A shadow with no pixels in it is a placeholder, the same idea as
               the one-pixel parts above: the member exists so the class has
               one, and it says this piece casts nothing. All 65 of them
               decode cleanly and are empty on purpose. */
            if (!drawn) { sdBlank++; continue; }

            const png = encodePng(w, h, rgba);
            const digest = crypto.createHash("sha1").update(png).digest("hex");
            const key = sm.facing === undefined ? "all" : sm.facing;
            const suffix = sm.facing === undefined ? "" : `_${sm.facing}`;
            const seen = written.get(`${sm.className}|sd|${digest}`);
            if (seen === undefined) {
                written.set(`${sm.className}|sd|${digest}`, suffix);
                fs.writeFileSync(path.join(OUT, `${sm.className}_sd${suffix}.png`), png);
                bytes2 += png.length;
            }
            /* ax,ay reads exactly as it does for a part: where the furni's
               origin sits inside this picture. A member's top-left is
               (-regX, -regY) in the furni's own space, so the origin is at
               (regX, regY) inside the member. */
            const into = shadows[sm.className] || (shadows[sm.className] = {});
            into[key] = { w, h, ax: regX, ay: regY, f: seen === undefined ? suffix : seen };
            sdWritten++;
        }
    }

    /* A class the client never described gets the switch its artwork implies.
       Last, and only where `.data` said nothing — see inferAnim. */
    let inferred = 0;
    for (const [className, rec] of Object.entries(library)) {
        if (rec.an) continue;
        const an = inferAnim(owned.get(className));
        if (an) { rec.an = an; inferred++; }
    }

    /* A shadow for a class with no artwork is a file nothing can ask for, so
       only the ones that pair up are carried. */
    let sdClasses = 0, sdOrphans = 0;
    for (const [className, table] of Object.entries(shadows)) {
        const rec = library[className];
        if (!rec) { sdOrphans++; continue; }
        rec.sd = table;
        sdClasses++;
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
        an     what it does when it is switched ON:
                 n      how many states it really has — two, for almost
                        everything. The bitmap states above are FRAMES.
                 names  ["off", "on"], where the client bothered to say
                 l[k]   part k, one entry per state: { f: [frames], d: hold,
                        r: flicker, lp: play once }, or null where that part
                        takes no part in that state
                 i      1 if this entry was INFERRED from the artwork rather
                        than read from the class's .data — see inferAnim in
                        tools/furni-extract.js for the rule and what it rejects
        sd     the DROP SHADOW, the patch of floor the piece darkens:
                 { facing: { w, h, ax, ay, f } }, plus the key "all" for a
                 piece whose shadow is the same whichever way it faces.
                 Looked up by FACING, never mirrored, drawn at 20% black.
                 The picture is assets/furni/<class>_sd<f>.png.
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
    console.log(`  ${inferred} classes given an off/on switch inferred from their artwork`);
    console.log(`  ${sdWritten} drop shadows across ${sdClasses} classes` +
        ` (${sdBlank} deliberately empty, ${sdSkipped} unreadable,` +
        ` ${sdOrphans} for classes with no artwork)`);
    console.log(`  ${noPalette} sprites dropped for an unresolvable palette (the game keeps its old art for those)`);
    if (unreadable.length) {
        console.log(`  could not open ${unreadable.length} cast file(s):`);
        for (const u of unreadable) console.log(`    ${u}`);
    }
    console.log(`  artwork ${(bytes / 1048576).toFixed(1)} MB + ${(bytes2 / 1024).toFixed(0)} KB of shadows -> ${OUT}`);
    console.log(`  index ${(js.length / 1024).toFixed(0)} KB -> ${jsPath}`);
}

if (require.main === module) main();

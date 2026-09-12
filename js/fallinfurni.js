/* Fallin' Furni — the page: what is on screen, and what the mouse does to it.

   The room, the walk and the drawing live here. The rules of a round live in
   js/room-game.js, what falls in js/room-drop.js, and the builder's tools in
   js/room-editor.js — which does not run at all unless the page was opened
   with ?edit=1.

   ----------------------------------------------------------------------
   Why the frame rate is capped

   The Shockwave client ran on a Director stage with a fixed tempo, and a good
   part of what makes Origins look like Origins is that it does NOT move
   smoothly. Two rules together: the loop paints at FPS (24), and every drawn
   position is rounded to a whole pixel. Either alone is not enough — capping
   the rate while drawing at fractional offsets gives juddery smoothness, and
   snapping to pixels at 60fps gives a jitter as positions round up and down.

   ----------------------------------------------------------------------
   About the avatar

   The figure comes from Habbo's imaging service, with one part drawn here
   ourselves: eye accessories, which that service renders at head directions
   0, 1, 3, 5 and 6 and silently drops at 2 and 4. See the note above
   `drawEyeAccessory`. */
(function () {
    "use strict";

    const Iso = window.RoomIso;
    const Path = window.RoomPath;
    const Furni = window.RoomFurni;
    const Levels = window.RoomLevels;
    const Game = window.RoomGame;
    const Lobby = window.RoomLobby;

    /* The editor loads only for ?edit=1. It pulls the whole 1,283-item
       catalogue and 15,000 furnidata records — exactly what a level builder
       needs and exactly what a player must not download. */
    const EDITING = new URLSearchParams(location.search).has("edit");

    /* Not decided by the URL. ?edit=1 only says what the visitor is ASKING
       for; `Editor` stays null until the server has confirmed, in
       `admitEditor` below, that they are an owner. Everything on this page
       tests `Editor` to decide whether it is a builder's page or a player's,
       so leaving it null is what actually keeps the editor shut. */
    let Editor = null;

    // Director tempo, near enough. A look, not a performance ceiling.
    const FPS = 24;
    const FRAME_MS = 1000 / FPS;

    /* Milliseconds to cross one tile, and the four-frame cycle walked across
       it — one stride per tile, so the limbs speed up and slow down with the
       feet rather than drifting out of step with them.

       I have had this wrong in both directions. 430 was the first guess; I
       raised it to 500 reasoning that Habbo walks at half a second a tile, and
       that was worse. The client cannot settle it — it holds no walk constant,
       because the SERVER sends each step and the pace is its tick rate (see
       tools/lingo-names.js: sendMoveGoal, and no walk timing anywhere).

       So it was MEASURED off the running client instead. Two walks were
       captured at 50ms and the avatar's travel tracked by frame difference:

           4 grid-diagonal steps, 240px across   ->  513 ms/tile
           6 grid-diagonal steps, 375px across   ->  502 ms/tile

       (A grid-diagonal step moves exactly 64px across and none down, which is
       what makes it a clean ruler; both runs came out flat in y, confirming
       the geometry.) Half a second a tile, near enough.

       Which means the game felt slow for a different reason. It was walking
       further than it needed to — octile costing and a strict corner rule
       between them made 17% of routes longer than the minimum — and an extra
       step reads as sluggishness even when each step is the right length. The
       fix for "too slow" was in js/room-path.js, not here.

       Still live-tunable under ?debug=1 via FallinFurni.setWalkMs(n). */
    let WALK_MS = 500;

    /* A BEAT BEFORE THE SEAT IS ACCEPTED, so the sit reads before the reward.

       `stepFrom` clearing used to do everything on one frame: the figure
       reached the tile, the pose changed to seated, and the seat scored.
       Three events on the same frame read as one, and the one they read as is
       landing on a tile rather than taking the chair.

       So the SCORE waits a moment — and only the score. The figure sits the
       instant it arrives. Holding the pose back instead put it standing on
       the chair for a fifth of a second first, which is a worse thing to be
       looking at than the problem it was solving.

       COMMITTED ON ARRIVAL, shown after the wait. Cancelling an unaccepted
       seat when the player clicks away would punish exactly the speed this
       game is asking for — a quick player would lose seats for being quick.
       Arriving is what earns it; this only decides when you see it.

       Live-tunable under ?debug=1 with FallinFurni.setAcceptMs(n): the right
       number here is the one that feels right, and that is found by trying
       them. */
    let ACCEPT_MS = 200;
    const WALK_FRAMES = 4;          // the walk cycle, as animation.xml defines it
    /* 84ms a frame, measured off the running client: the stride opens every
       168ms and a four-frame cycle opens twice. Nothing to do with WALK_MS —
       see the note in avatarAt. */
    const WALK_FRAME_MS = 84;

    /* The imaging service returns size=l at 128x220, DOUBLE the 64x110 the
       64x32 grid is drawn against — measured, not assumed. */
    const SPRITE_SCALE = 0.5;
    const FOOT_PAD = 11;            // feet above the sprite's own bottom edge

    /* THE FIGURE COMES AT THE ROOM'S SCALE, and it is ASKED for small rather
       than shrunk.

       The imaging service renders three sizes, measured rather than assumed:
       l is 128x220, m is 64x110 and s is 33x56. A 64x32 room wants the figure
       at 64x110, which is l halved — that is where SPRITE_SCALE comes from. A
       32x16 room wants half of that again, and the honest way to get it is to
       ask for `s`, which is drawn small. Halving `m` in the browser is a
       DOWNSCALE of pixel art: every hard edge becomes two soft ones, which is
       the one thing this game is careful never to do.

       FOOT_PAD halves with it. Eleven pixels above the sprite's own bottom
       edge at full size is five and a half at half, and six is the rounding
       that keeps the feet on the tile rather than a pixel under it. */
    function avatarSizing() {
        return (Iso.TILE_W && Iso.TILE_W < 64)
            ? { size: "s", scale: 1, footPad: 6 }
            : { size: "l", scale: SPRITE_SCALE, footPad: FOOT_PAD };
    }

    const DEFAULT_FIGURE = "hd-180-1.ch-210-66.lg-270-82.sh-290-80.hr-100-61";
    const STORE_KEY = "mazerats_ff_room_v2";

    const state = {
        model: "a",
        floorPattern: "plain", floorColour: null,
        wallPattern: "plain", wallColour: null,
        figure: DEFAULT_FIGURE,
        name: "",
        pos: { x: 3, y: 6 },
        dir: 2,
        path: [],
        /* WHERE THE WALK IS GOING, and what it was when you asked for it.

           Kept because furni lands mid-walk and the route has to be
           reconsidered against a room that has changed — and reconsidering it
           needs to know what you meant, not just where you were pointed.
           `seat` is whether the tile you clicked already had a seat on it:
           you were going there to sit. A seat that lands on a tile you picked
           because it was EMPTY is not one you chose, and walking into it is
           not something to be scored for. */
        goal: null,
        stepFrom: null,
        stepAt: 0,
        /* When the figure landed on a seat and the round has yet to be told,
           or null. See ACCEPT_MS — the wait between sitting and scoring. */
        acceptAt: null,
        furni: [],                  // what is standing in the room
        hover: null
    };

    let canvas, ctx, statusEl;
    let dirty = true;               // only repaint when something moved
    let game = null;
    let run = null;                  // the published levels, played in order
    let roundEndedAt = 0;            // when the current round finished
    const ROUND_PAUSE_MS = 1600;     // long enough to read the result
    const sprites = new Map();

    // ---- avatar

    const FIGURE_W = 64, FIGURE_H = 110;
    const MISSING_DIRECTIONS = { 2: false, 4: true };   // value = draw mirrored

    function eyeAccessory(figure) {
        const m = /(?:^|\.)ea-(\d+)(?:-(\d+))?/.exec(figure || "");
        return m ? { set: m[1], colour: m[2] } : null;
    }

    const partSprites = new Map();

    function partSprite(meta, colourHex) {
        const key = meta.file + "|" + colourHex;
        let entry = partSprites.get(key);
        if (entry) return entry.ready ? entry.canvas : null;

        entry = { ready: false, canvas: null, img: new Image() };
        partSprites.set(key, entry);
        entry.img.onload = () => {
            const { naturalWidth: w, naturalHeight: h } = entry.img;
            const src = document.createElement("canvas");
            src.width = w; src.height = h;
            const sctx = src.getContext("2d", { willReadFrequently: true });
            sctx.imageSmoothingEnabled = false;
            sctx.drawImage(entry.img, 0, 0);
            const data = sctx.getImageData(0, 0, w, h);
            const px = data.data;
            const inks = meta.inks || [];
            const n = Math.max(1, inks.length - 1);
            const base = parseInt((colourHex || "#1f1f1f").slice(1), 16);
            const br = (base >> 16) & 255, bg = (base >> 8) & 255, bb = base & 255;
            for (let i = 0; i < px.length; i += 4) {
                if (px[i + 3] < 128) continue;
                const rank = Math.max(0, inks.indexOf(px[i]));
                const f = 0.55 + (rank / n) * 0.45;
                px[i] = Math.round(br * f);
                px[i + 1] = Math.round(bg * f);
                px[i + 2] = Math.round(bb * f);
            }
            sctx.putImageData(data, 0, 0);
            entry.canvas = src;
            entry.ready = true;
            dirty = true;
        };
        entry.img.onerror = () => { entry.ready = false; };
        entry.img.src = "assets/avatar/" + meta.file + ".png";
        return null;
    }

    /* The imaging service renders an Origins eye accessory at head directions
       0, 1, 3, 5 and 6 and drops it at 2 and 4. (7 is the back of the head —
       no face, correctly none.) Those two are composited from the client's own
       part bitmaps so the head can face wherever the body is going.

       Placement is measured: in the 64x110 figure, topLeft = (-regX,
       100 - regY), which reproduces the service's own boxes exactly for all
       five directions it renders. Direction 4 is direction 2 mirrored, at
       x' = 64 - x - width. */
    function drawEyeAccessory(ctx2, figure, dir, sx, sy, scale) {
        const AP = window.AvatarParts;
        if (!AP || !(dir in MISSING_DIRECTIONS)) return;
        const acc = eyeAccessory(figure);
        if (!acc) return;
        const partId = AP.sets[acc.set];
        const meta = partId !== undefined && AP.parts[partId] && AP.parts[partId][2];
        if (!meta) return;

        const colour = (AP.colours && AP.colours[acc.colour]) || "#1f1f1f";
        const sprite = partSprite(meta, colour);
        if (!sprite) return;

        const mirrored = MISSING_DIRECTIONS[dir];
        const x = mirrored ? FIGURE_W - (-meta.regX) - meta.w : -meta.regX;
        const y = 100 - meta.regY;

        ctx2.save();
        ctx2.imageSmoothingEnabled = false;
        if (mirrored) {
            ctx2.translate(Math.round(sx + (x + meta.w) * scale), Math.round(sy + y * scale));
            ctx2.scale(-1, 1);
            ctx2.drawImage(sprite, 0, 0, Math.round(meta.w * scale), Math.round(meta.h * scale));
        } else {
            ctx2.drawImage(sprite,
                Math.round(sx + x * scale), Math.round(sy + y * scale),
                Math.round(meta.w * scale), Math.round(meta.h * scale));
        }
        ctx2.restore();
    }

    /* The walk is FOUR frames, and the service renders each — `&frame=0..3`
       against action=wlk returns four genuinely different images. Asking for
       action=wlk alone returns frame 0 every time, which is why the avatar
       used to slide across the floor with its limbs still. */
    function avatarSprite(figure, dir, action, frame) {
        const walking = action === "wlk";
        const url = "https://www.habbo.com/habbo-imaging/avatarimage?" +
            new URLSearchParams({
                figure, size: avatarSizing().size,
                direction: String(dir),
                head_direction: String(dir),
                action: walking ? "wlk" : (action === "sit" ? "sit" : "std"),
                frame: String(walking ? (frame | 0) % WALK_FRAMES : 0),
                gesture: "sml"
            }).toString();

        let entry = sprites.get(url);
        if (!entry) {
            entry = { img: new Image(), ready: false };
            entry.img.crossOrigin = "anonymous";
            entry.img.onload = () => { entry.ready = true; dirty = true; };
            entry.img.onerror = () => { entry.failed = true; };
            entry.img.src = url;
            sprites.set(url, entry);
        }
        return entry;
    }

    function preload(figure) {
        for (let d = 0; d < 8; d++) {
            avatarSprite(figure, d, "std", 0);
            avatarSprite(figure, d, "sit", 0);
            for (let f = 0; f < WALK_FRAMES; f++) avatarSprite(figure, d, "wlk", f);
        }
    }

    // ---- movement

    /* PUT A ROOM SHAPE UP. Everything that measures the room reads it from
       RoomIso, so this is the one call that changes it — and it has to happen
       BEFORE anything is placed, clamped or routed against the new room.

       The avatar comes with it: a layout can be smaller than the last one, or
       have a hole where the figure was standing, and a player left off the
       floor can neither walk nor be walked to. Landing them on the level's own
       start tile is what every other caller already means by changing room. */
    function applyLayout(id) {
        const L = window.RoomLayouts;
        if (!L || !Iso.setLayout) return null;
        const next = L.get(id);
        Iso.setLayout(next);
        state.model = next.id;
        // A different scale means a different set of figure sprites — see
        // avatarSizing. Cheap, and cached per URL, so a room revisited pays
        // nothing.
        preload(state.figure);
        if (!Iso.has(state.pos.x, state.pos.y)) {
            const t = L.firstTile(next);
            state.pos = { x: t.x, y: t.y };
            state.path = []; state.goal = null; state.stepFrom = null; state.acceptAt = null;
        }
        return next;
    }

    /* One Image per overlay, kept for the life of the page. A painted room has
       sixty-odd of them and they never change. */
    const overlayImgs = new Map();

    function roomOverlay(layout, ov) {
        const src = `assets/rooms/${layout.id}/${ov.member}.png`;
        let img = overlayImgs.get(src);
        if (!img) {
            img = new Image();
            img.onload = () => { dirty = true; };
            img.src = src;
            overlayImgs.set(src, img);
        }
        return img;
    }

    let blockedTiles = new Set();
    function refreshBlocked() {
        blockedTiles = game && game.state === Game.RUNNING
            ? game.blocked()
            : Furni.blockedTiles(state.furni);
    }
    function blocked(x, y) { return blockedTiles.has(Iso.key(x, y)); }

    /* Which way a seat faces, in the same eight-direction compass the figure
       uses. A furni's rotation resolves to a client DIRECTION (see
       RoomFurni.variantAt) and Habbo numbers furni directions and avatar
       directions the same way round, so it carries straight across. */
    function seatFacing(seat) {
        const v = Furni.variantAt(seat.className, seat.state || 0, seat.rotation || 0);
        return v ? v.facing : null;
    }

    function avatarAt(now) {
        if (!state.stepFrom) {
            const c = Iso.tileCenter(state.pos.x, state.pos.y);
            const seat = game && Furni.seatAt(state.furni, state.pos.x, state.pos.y);
            /* Sitting DOWN turns you to face the way the chair faces — you do
               not perch on a sofa still looking wherever you walked in from.
               Falls back to the walking direction for furni the library has no
               entry for.

               The figure sits the instant it lands, with no beat in between.
               ACCEPT_MS delays the SCORE, not the sitting: holding the pose
               back made the figure stand on the chair for a fifth of a second
               first, which is a worse thing to be looking at than the problem
               it was solving. */
            const facing = seat ? seatFacing(seat) : null;
            return {
                sx: c.sx, sy: c.sy,
                action: seat ? "sit" : "std",
                frame: 0,
                dir: facing === null ? state.dir : facing
            };
        }
        const t = Math.min(1, (now - state.stepAt) / WALK_MS);
        const a = Iso.tileCenter(state.stepFrom.x, state.stepFrom.y);
        const b = Iso.tileCenter(state.pos.x, state.pos.y);
        /* THE LEGS RUN ON THEIR OWN CLOCK, not on the tile's.

           This used to fit exactly one four-frame cycle into each tile, on the
           reasoning that one stride per tile keeps the feet honest. It reads as
           trudging, and measurement says why: in the real client the stride
           opens every 168ms — twice per cycle, so a frame every 84ms, near
           enough 12fps, about 5.9 frames across a 493ms tile. One cycle per
           tile is 4 frames at 8fps, two thirds the rate. The avatar was
           covering the ground at the right speed while moving its limbs too
           slowly, which is exactly what "sluggish but the speed matches" looks
           like.

           So the cycle free-runs on the clock and the tile no longer divides
           it. The phase carries across steps by construction, which is also
           more correct than restarting at frame 0 every tile. */
        const frame = Math.floor(now / WALK_FRAME_MS) % WALK_FRAMES;
        return {
            sx: a.sx + (b.sx - a.sx) * t,
            sy: a.sy + (b.sy - a.sy) * t,
            action: "wlk",
            frame,
            dir: state.dir
        };
    }

    /* Tell the round what the figure landed on. Also the flush — anything that would let a later arrival be
       processed before this one calls it first, so the order the game sees is
       always the order the player walked, whatever the timings do.

       In practice a seat is at least one step away and a step is more than
       twice the wait, so the two cannot overlap; the flush is there so that
       staying true does not depend on those two numbers keeping their present
       relationship. */
    function acceptSeat(now) {
        state.acceptAt = null;
        if (!game || game.state !== Game.RUNNING) return;
        const what = game.arrivedAt(state.pos, now);
        if (what) { renderHud(now); dirty = true; }
    }

    function beginStep(now) {
        if (state.acceptAt !== null) acceptSeat(now);
        const next = state.path.shift();
        state.stepFrom = { x: state.pos.x, y: state.pos.y };
        state.pos = { x: next.x, y: next.y };
        state.dir = next.dir;
        state.stepAt = now;
        dirty = true;
    }

    /* Clicking a tile. A SEAT is the one occupied tile you may walk into —
       that is the whole game — and everything else with furni on it is an
       obstacle, so clicking a bar desk leaves the figure where it is rather
       than walking it into the furniture.

       Nothing happens on such a click, rather than the figure sidling up to
       the nearest free tile beside it. A guess about where you meant to go is
       worse than no movement when the clock is running: it costs the same
       seconds and puts you somewhere you did not ask for. */
    function walkTo(x, y) {
        const seat = Furni.seatAt(state.furni, x, y);
        const route = Path.findPath(state.pos, { x, y }, blocked, !!seat);
        if (!route || !route.length) return;
        state.goal = { x, y, seat: !!seat };
        state.path = route;
        if (!state.stepFrom) beginStep(gameNow());
    }

    /* THE ROOM CHANGED WHILE YOU WERE WALKING.

       A route is worked out once, at the click, and furni goes on falling
       after that. Nothing re-checked it, so a piece that landed on a tile
       further down the route was simply walked through — and if that piece
       was a seat, walking through it counted as sitting on the wrong one:
       minus seventy-five and the streak gone, for a collision the player
       neither caused nor could have seen coming. That is the bug testers kept
       hitting.

       So every landing re-asks the question the click asked, from where the
       figure is standing now. Three outcomes:

         still clear      nothing to do; the walk carries on uninterrupted
         blocked en route a way round exists, and the figure takes it
         no way round     the walk stops where it is

       The goal keeps the intent it was given. If you were walking to a seat
       you can still walk into it; if you picked an empty tile and something
       has since landed on it, you stop short rather than sitting on a chair
       you never chose. */
    function repathIfBlocked() {
        if (!state.goal) return;

        /* THE GOAL FIRST, and before the "is there anything left to walk"
           check, because on the LAST step there is not. beginStep shifts the
           final tile off the path and animates into it, so for most of a
           second the figure is still travelling with an empty path — and a
           seat landing on the destination in that window is the narrowest
           and nastiest version of this bug. Dropping the goal here is what
           stops it being scored. */
        if (blocked(state.goal.x, state.goal.y) && !state.goal.seat) {
            state.path = [];
            state.goal = null;
            dirty = true;
            return;
        }

        if (!state.path.length) return;
        if (!state.path.some(s => blocked(s.x, s.y))) return;

        /* `state.pos` is already the tile being walked INTO — beginStep moves
           it there and animates across afterwards — so it is where the figure
           will be standing whether or not a step is in flight, and that is
           where any new route starts. A step already under way is committed
           either way; it cannot be redirected mid-tile. */
        const route = Path.findPath(
            state.pos, { x: state.goal.x, y: state.goal.y }, blocked, state.goal.seat);

        if (route && route.length) {
            state.path = route;
        } else {
            state.path = [];
            state.goal = null;
        }
        dirty = true;
    }

    // ---- painting

    /* The avatar takes part in the SAME depth sort as the furni rather than
       being painted over the top of it. Standing behind a sofa should put the
       sofa in front, and it cannot if the figure is always drawn last. The
       avatar's key uses its own tile; ties go to the avatar, so standing ON a
       seat draws the figure over the seat rather than inside it. */
    /* ALIGNMENT GUIDES — a builder's diagnostic, off by default.

       Every alignment argument in this game has come down to "the furni looks
       wrong" against "the numbers say it is right", and neither side can see
       what the other means. This draws the numbers ON the room so one
       screenshot settles it:

         green   the tiles a piece actually occupies — its footprint
         pink    the anchor: the exact point the sprite is hung from, which
                 should sit on the west corner of the piece's own tile
         blue    the tile under the pointer

       If a piece's artwork does not sit over its green outline, the anchor is
       wrong. If the green outline is not where the piece was placed, the
       footprint is wrong. Those are different bugs and this tells them apart. */
    let guides = false;

    function drawGuides(ctx2) {
        for (const f of state.furni) {
            Furni.outline(ctx2, f, "#00ff88");
            const a = Furni.anchor && Furni.anchor(f);
            const home = Iso.tileCenter(f.x, f.y);
            const ax = home.sx - Iso.HALF_W, ay = home.sy;
            ctx2.fillStyle = "#ff40c0";
            ctx2.fillRect(ax - 2, ay - 2, 5, 5);          // where it is hung from
            if (a) {
                ctx2.fillStyle = "rgba(255,64,192,0.9)";
                ctx2.fillRect(ax, ay - 12, 1, 24);        // a plumb line through it
            }
        }
    }

    /* THE ROOM IS ONE SORTED LIST OF PARTS, not of furni.

       Habbo gives every part of a furni its own depth — see the note on
       zshift in js/room-furni.js — and the avatar is simply another entry in
       that list. Sitting on a sofa then works out on its own: the sofa's back
       has a shift below the avatar's and its near arm one above, so the sort
       puts the figure between them without anything here knowing what a sofa
       is.

       Drawing whole furni and then slotting the avatar somewhere among them
       cannot express that, which is why it used to render the figure on top of
       the arm it should be tucked behind. */
    function paintScene(ctx2, now) {
        const at = avatarAt(now);
        const pieces = [];
        let order = 0;

        /* THE TILE CURSOR IS PART OF THE SCENE, not something laid over it.

           It used to be drawn after everything, so the yellow diamond sat on
           top of whatever furni it was pointing at — pointing THROUGH a sofa
           rather than at the floor beside it. It belongs in the depth sort for
           the same reason the avatar does: a piece standing in front of that
           tile should cover it, and a piece behind it should not.

           Pushed FIRST and at the very start of its tile's band, so anything
           else standing on the same tile draws over it — the sort is stable,
           so an equal key keeps this underneath. */
        const builderOverlay = Editor && !(game && game.state === Game.RUNNING);
        if (state.hover && !builderOverlay) {
            const h = state.hover;
            pieces.push({
                key: Furni.tileDepth(h.x, h.y) * 1000,
                draw: () => Iso.highlight(ctx2, h.x, h.y, "#ffff00")
            });
        }

        for (const f of state.furni) {
            const parts = Furni.partsOf(f, now);
            if (parts) {
                for (const p of parts) {
                    pieces.push({ key: p.depth * 1000 + (order++), draw: () => Furni.drawPart(ctx2, p) });
                }
            } else {
                // Not in the library: one flat sprite at its far corner.
                const f2 = f;
                pieces.push({
                    key: Furni.depthOfPart(f2) * 1000 + (order++),
                    draw: () => Furni.draw(ctx2, f2)
                });
            }
        }

        /* A PAINTED ROOM'S SCENERY SORTS WITH EVERYTHING ELSE.

           The Library is one background bitmap plus sixty-six overlays —
           bookcases, a statue, a chandelier, lamps — and the masks among them
           exist for exactly one purpose: to be drawn OVER an avatar so the
           figure reads as standing behind the furniture. Painted after the
           scene they would hide everyone; painted before it they would do
           nothing. They belong in the sort.

           And they can be, because Director's own depth numbers are in the
           same units ours are. `locZ` on these elements runs 23000, 24000,
           25000 — a thousand per step of x+y — which is exactly
           RoomFurni.DEPTH_PER_TILE. So an overlay's z IS a tile depth and
           needs no conversion, only the same outer multiply every other piece
           here gets. The handful at 880000 and above are the artists' way of
           saying "always in front": the chandelier, the top of the room, the
           near bookshelves. They sort there naturally. */
        const painted = Iso.layout && Iso.layout.painted ? Iso.layout : null;
        if (painted && painted.overlays) {
            for (const ov of painted.overlays) {
                const img = roomOverlay(painted, ov);
                pieces.push({
                    key: ov.z * 1000 + (order++),
                    draw: () => {
                        if (!img.complete || !img.naturalWidth) return;
                        ctx2.save();
                        // ink 33 is Director's addPin — light, not paint.
                        if (ov.ink === 33) ctx2.globalCompositeOperation = "lighter";
                        if (ov.blend !== null && ov.blend < 100) ctx2.globalAlpha = ov.blend / 100;
                        ctx2.drawImage(img, Iso.paintX + ov.x, Iso.paintY + ov.y);
                        ctx2.restore();
                    }
                });
            }
        }

        const tile = state.pos;
        pieces.push({
            key: Furni.tileDepth(tile.x, tile.y) * 1000 + 500,
            draw: () => {
                const sprite = avatarSprite(state.figure, at.dir, at.action, at.frame);
                if (!sprite.ready) return;
                const img = sprite.img;
                const sz = avatarSizing();
                const w = Math.round(img.naturalWidth * sz.scale);
                const h = Math.round(img.naturalHeight * sz.scale);
                const dx = Math.round(at.sx - w / 2), dy = Math.round(at.sy - h + sz.footPad);
                ctx2.drawImage(img, dx, dy, w, h);
                drawEyeAccessory(ctx2, state.figure, at.dir, dx, dy, w / FIGURE_W);
            }
        });

        pieces.sort((a, b) => a.key - b.key);
        for (const p of pieces) p.draw();
    }

    function draw(now) {
        /* THE TITLE SCREEN IS NOT A ROOM. Before a run starts — and only for a
           player, never for the builder, who needs to see what they are
           editing — the stage shows the hotel view with furni drifting past
           it. See js/room-lobby.js. */
        if (Lobby && !Editor && !game) {
            Lobby.draw(ctx, now);
            return;
        }

        Iso.drawRoom(ctx, state);

        paintScene(ctx, now);

        /* THE NEXT SEAT IS NOT MARKED, and that is the game.

           There used to be a green outline on whichever seat you had to sit on
           next. It made the round readable and it made it pointless: the whole
           thing is remembering the order the furni landed in, and an arrow
           pointing at the answer removes the only thing the player is being
           asked to do. Watching where they land IS the game — the readout
           already says so. */

        /* The editor's overlays — drop areas, selection, the placement ghost —
           are builder's furniture and have no business in a running round.
           They stay off while the game is playing even in the builder's view,
           or the room fills with rectangles at exactly the moment the player
           needs to read where things landed. */
        /* The builder's overlay stays ON TOP — zone rectangles and the piece
           in your hand are tools for reading the room, not things standing in
           it. The player's tile cursor is drawn in the scene instead; see
           paintScene. */
        const playing = game && game.state === Game.RUNNING;
        if (Editor && !playing) Editor.drawOverlay(ctx, state.hover);

        if (Editor && guides) drawGuides(ctx);

        // The area being dragged out for a new drop, while dragging it.
        if (Editor && !playing && dragArea) {
            for (let y = dragArea.y; y < dragArea.y + dragArea.h; y++) {
                for (let x = dragArea.x; x < dragArea.x + dragArea.w; x++) {
                    Iso.highlight(ctx, x, y, "#40c0ff");
                }
            }
        }
    }

    let lastPaint = 0;
    /* THE GAME CLOCK, which is not the wall clock.

       A backgrounded tab stops getting animation frames, so nothing falls —
       but the round's timer was reading wall time, so a player who switched
       tabs came back to a round that had run out while frozen. Time spent
       hidden is counted here and subtracted, and no frame is processed while
       hidden at all, so the round resumes exactly where it stopped.

       Every timestamp handed to the game comes from this, and they only have
       to agree with each other — a walk that began before a pause finishes
       correctly after it because both ends are measured on the same clock. */
    let pausedFor = 0, hiddenAt = 0;
    const gameNow = () => performance.now() - pausedFor;

    /* TIME IS ONLY EVER PAUSED ONCE, however many reasons there are to pause
       it. The loader freeze and the hidden-tab freeze overlap — hide the tab
       while the room is loading or the count-in is running and both wanted to
       add the same interval — which pushed `pausedFor` past the wall clock and
       ran `gameNow` BACKWARDS. The round then opened with more than its
       allotted seconds, and its breakdown reported a time of 0.0s.

       So a pause is a span, and a span already inside an open one is not a
       second pause. `loading` is the other holder; while it is up the
       visibility handler has nothing to add, because `loadRoom` is already
       counting that whole stretch. */
    function pauseSpanEnd(from) {
        pausedFor += Math.max(0, performance.now() - from);
    }

    function watchVisibility() {
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                if (!loading) hiddenAt = performance.now();
                return;
            }
            if (hiddenAt && !loading) pauseSpanEnd(hiddenAt);
            hiddenAt = 0;
            lastPaint = 0;      // paint the first frame back immediately
            dirty = true;
        });
    }

    function tick() {
        requestAnimationFrame(tick);
        /* Hidden means frozen. Returning before anything is read keeps a
           stray frame — some browsers still fire one occasionally — from
           advancing a round nobody is watching. */
        if (document.hidden || loading) return;

        const now = gameNow();
        // Before the paint gate: the board's crawl wants every frame, and it
        // has nothing to draw on the canvas.
        stepBoard(performance.now());
        if (now - lastPaint < FRAME_MS) return;
        lastPaint = now;

        if (game && game.state === Game.RUNNING) {
            if (game.tick(now, state.pos)) {
                state.furni = game.renderList();
                refreshBlocked();
                // Something landed. The route was worked out against a room
                // that no longer exists.
                repathIfBlocked();
                dirty = true;
            }
            renderHud(now);
        } else if (game && game.state !== Game.IDLE && !roundEndedAt) {
            /* The round ended. It used to advance itself after a pause, which
               swapped the next room in under the player before they had read
               the result — and did it while `game` still pointed at the
               FINISHED round, so level two drew level one's furni and then
               advanced again. The player says when to go on now, and
               `showRoundEnd` is the one place that moves between levels. */
            roundEndedAt = now;
            showRoundEnd(now);
            renderHud(now);
            dirty = true;
        }

        if (state.stepFrom && now - state.stepAt >= WALK_MS) {
            state.stepFrom = null;

            /* ARRIVING AT THE TILE YOU ASKED FOR is what the game reacts to —
               not every tile crossed on the way to it.

               Seats block, so a route can only ever END on one; it can never
               legitimately pass over one. Anything underfoot mid-route is
               therefore something that arrived after you set off, and being
               scored for it is being scored for someone else's timing. The
               same goes for a step already in flight when a seat lands on the
               tile it was heading into: repathIfBlocked drops the goal in that
               case, and with no goal there is nothing to score. */
            const atGoal = state.goal &&
                state.pos.x === state.goal.x && state.pos.y === state.goal.y;
            if (game && game.state === Game.RUNNING && !state.path.length && atGoal) {
                state.goal = null;
                if (Furni.seatAt(state.furni, state.pos.x, state.pos.y)) {
                    // Sat down already; the round hears about it in a moment.
                    state.acceptAt = now;
                    dirty = true;
                } else {
                    acceptSeat(now);          // nothing here; settles immediately
                }
            }
            if (state.path.length) beginStep(now);
            dirty = true;
        }
        // The wait is over: the seat counts now. See ACCEPT_MS.
        if (state.acceptAt !== null && now - state.acceptAt >= ACCEPT_MS) acceptSeat(now);

        if (state.stepFrom) dirty = true;
        /* A switched-on furni is moving too. The paint gate only knows about
           things the GAME moves — a step, a drop — so a lamp's flame held
           still until the player walked. See RoomFurni.animates, which is
           false for anything switched off so a still room stays still. */
        if (state.furni.some(f => Furni.animates(f))) dirty = true;
        // The title screen is always moving — furni is falling past the hotel.
        if (Lobby && !Editor && !game) dirty = true;
        if (!dirty) return;
        dirty = false;
        draw(now);
    }

    /* ---- editor modes

       Four, and the room's overlay follows whichever is showing: zone
       rectangles while working on zones, a placement ghost while decorating,
       nothing while choosing a floor. Showing all of it at once turned the
       room into a diagram nobody could read. */
    function setMode(mode) {
        if (!Editor) return;
        Editor.state.mode = mode;
        /* The picked furni SURVIVES a mode change. It used to be cleared here,
           which quietly broke the one instruction the zones panel gives: pick a
           furni on Decorate, come back, press Add — and Add did nothing,
           because switching tabs had thrown the pick away. The placement ghost
           is already limited to decor mode by the overlay, so nothing else
           needed the reset. */
        for (const el of document.querySelectorAll(".ff-mode")) {
            el.hidden = el.dataset.mode !== mode;
        }
        for (const b of document.querySelectorAll("#ff-modes button")) {
            b.classList.toggle("is-on", b.dataset.mode === mode);
        }
        setHint(mode);
        renderEditorPanel();
        dirty = true;
    }

    // What the room expects of you right now, said under the room.
    /* The line under the room. `mode` is a MODE KEY, not a sentence — passing
       text here silently blanked the hint, because an unknown key falls
       through to "". Anything that wants its own words passes `override`. */
    function setHint(mode, override) {
        const el = document.getElementById("ff-hint");
        if (!el) return;
        if (override) { el.textContent = override; return; }
        if (!Editor) { el.textContent = "Click a tile to walk there."; return; }
        el.textContent = {
            room: "Pick a floor and wallpaper for this level.",
            decor: "Click a furni, then a tile to place it. R turns, Del removes.",
            zones: "Drag across the room to draw a drop zone.",
            rules: "Set the clock and how hard this round should be.",
            splash: "Pick what falls past the title screen. Saves as you change it."
        }[mode] || "";
    }

    // ---- HUD

    /* The readout, rewritten only where it actually changed.

       The first version rebuilt the whole pip row from innerHTML on every
       frame, which at 24fps is 130 DOM mutations a second and visibly
       FLICKERS — the browser is tearing down and re-laying-out the row
       between paints. The clock only changes once a second and the pips only
       when a seat is sat on, so both are compared before being written.

       The elements are looked up once, not per frame, for the same reason. */
    const hudEls = {};
    let hudLast = { clock: "", total: -1, done: -1, msg: "", round: null, hidden: null,
                    score: -1, stamp: "", deltaTimer: 0 };

    /* WHAT THE STATE BUTTON SHOULD SAY.

       Two states is a switch and reads as one — "Switch on" when it is off,
       "Switch off" when it is on. More than two is not a switch: a fireplace
       has eleven frames and gothiccandelabra seven, and pretending those are
       an on/off would be a lie about what the button does. Those say which
       frame you are on and that pressing steps to the next.

       Null means one state, and the button is hidden rather than disabled —
       a dead control on nine furni out of ten is just clutter. */
    /* THE BUTTON SWITCHES IT ON, it does not step through pictures.

       It used to read "State 4/11" on a hearth, because the states it was
       counting were the eleven frames of the fire. RoomFurni.statesOf answers
       with the states the CLIENT declares now — two, for everything that has a
       `.data` — so the same button becomes the on/off switch it was always
       meant to be, and the animation runs itself. Anything genuinely
       multi-state still says which one it is on. */
    function stateLabel(className, at) {
        if (!Editor || !className) return null;
        const list = Editor.stateList(className);
        if (!list || list.length < 2) return null;
        const i = Math.max(0, list.indexOf(Number(at) || 0));
        if (list.length === 2) {
            const next = Furni.stateName(className, i === 0 ? 1 : 0);
            return `Switch ${next}`;
        }
        return `State ${i + 1}/${list.length}`;
    }

    function describeState(f) {
        const list = Editor.stateList(f.className);
        const i = Math.max(0, list.indexOf(Number(f.state) || 0));
        if (list.length === 2) return Furni.stateName(f.className, i);
        return `state ${i + 1} of ${list.length}`;
    }

    function renderHud(now) {
        if (!hudEls.root) {
            hudEls.root = document.getElementById("ff-hud");
            hudEls.clock = document.getElementById("ff-clock");
            hudEls.seq = document.getElementById("ff-seq");
            hudEls.msg = document.getElementById("ff-msg");
            hudEls.round = document.getElementById("ff-round-of");
            hudEls.score = document.getElementById("ff-score");
            hudEls.delta = document.getElementById("ff-score-delta");
            hudEls.pips = [];
        }

        const hide = !game || game.state === Game.IDLE;
        if (hide !== hudLast.hidden) { hudEls.root.hidden = hide; hudLast.hidden = hide; }
        if (hide) return;

        const left = game.secondsLeft(now);
        const m = Math.floor(left / 60), s = Math.floor(left % 60);
        const clock = `${m}:${String(s).padStart(2, "0")}`;
        if (clock !== hudLast.clock) { hudEls.clock.textContent = clock; hudLast.clock = clock; }

        const p = game.progress();
        // Grow the row only when a seat lands; never rebuild it.
        while (hudEls.pips.length < p.total) {
            const d = document.createElement("i");
            d.className = "ff-pip";
            hudEls.seq.appendChild(d);
            hudEls.pips.push(d);
        }
        if (p.done !== hudLast.done || p.total !== hudLast.total) {
            hudEls.pips.forEach((d, i) => {
                const on = i < p.done;
                if (d.classList.contains("is-on") !== on) d.classList.toggle("is-on", on);
                d.hidden = i >= p.total;
            });
            hudLast.done = p.done; hudLast.total = p.total;
        }

        /* Which round of the run, beside the clock. Only a RUN has rounds —
           the builder testing one level has none — so it says nothing rather
           than "Round 1 of 1" there. */
        const round = run ? run.progressLabel() : "";
        if (hudEls.round && round !== hudLast.round) { hudEls.round.textContent = round; hudLast.round = round; }

        /* THE SCORE. A run's score is what earlier rounds banked plus the one
           in play, so the number never resets between levels — a builder
           testing a single level sees that round's own total, which is the
           same number with nothing banked.

           The delta is written only when it CHANGES, and what makes it change
           is a new seat rather than a new value: sit on two wrong chairs in a
           row and both are worth -75, so comparing the figure alone would show
           the first one and swallow the second. `sat.length` moves on a right
           seat and `penalty` on a wrong one, which between them move on every
           event that scores. */
        const score = run ? run.score() : game.score;
        if (score !== hudLast.score) {
            hudEls.score.textContent = score.toLocaleString();
            hudEls.score.parentNode.classList.toggle("is-under", score < 0);
            hudLast.score = score;
        }
        const stamp = `${game.sat.length}:${game.penalty}:${game.state}`;
        if (stamp !== hudLast.stamp) {
            hudLast.stamp = stamp;
            const d = game.lastScore;
            hudEls.delta.textContent = d ? (d > 0 ? `+${d}` : String(d)) : "";
            hudEls.delta.classList.toggle("is-down", d < 0);
            clearTimeout(hudLast.deltaTimer);
            hudLast.deltaTimer = setTimeout(() => { hudEls.delta.textContent = ""; }, 1600);
        }

        const msg = game.state === Game.WON ? "Every seat, in order — round complete." : game.message;
        if (msg !== hudLast.msg) { hudEls.msg.textContent = msg; hudLast.msg = msg; }
    }

    // A new round starts from a blank readout rather than the last one's.
    function resetHud() {
        if (hudEls.seq) hudEls.seq.innerHTML = "";
        hudEls.pips = [];
        /* The pending delta timer is CANCELLED, not just forgotten. Rebuilding
           `hudLast` without it left the old timeout running, so a score change
           from the last round could blank the new one's delta a second and a
           half in. Every field the declaration has is restored too — dropping
           `score` and `stamp` left them undefined, which happened to work only
           because the first comparison against undefined is always unequal. */
        clearTimeout(hudLast.deltaTimer);
        if (hudEls.delta) hudEls.delta.textContent = "";
        hudLast = { clock: "", total: -1, done: -1, msg: "", round: null, hidden: null,
                    score: -1, stamp: "", deltaTimer: 0 };
    }

    // ---- editor glue

    /* What a click on the room means depends on the mode, which is the point of
       having modes: in Decorate it places or selects furni, in Drop zones it
       picks the zone you clicked inside, and elsewhere it does nothing. */
    /* ---- WHERE THE PLAYER STARTS.

       The level has always carried a `start` tile and nothing has ever been
       able to set it, so every level began on whatever the schema's default
       was. It is ARMED rather than a mode of its own: press the button, click
       a tile, done — one setting does not need a tab.

       Refused on a tile there is no floor on, which in a shaped or painted
       room is most of the grid. A level that begins off the floor cannot be
       walked out of. */
    let pickingStart = false;

    /* Put the figure where the level says, looking the way it says. Used when
       the start changes and whenever a level is shown, so the builder is
       always looking at what a player will actually see. */
    function showStart(level) {
        state.pos = { x: level.start.x, y: level.start.y };
        state.dir = ((Number(level.startDir) || 0) % 8 + 8) % 8;
        state.path = []; state.goal = null; state.stepFrom = null; state.acceptAt = null;
    }

    function setStartTile(t) {
        if (!Editor || !Editor.state.level) return;
        if (!Iso.has(t.x, t.y)) { status("There is no floor there.", "bad"); return; }
        Editor.state.level.start = { x: t.x, y: t.y };
        Editor.save();
        pickingStart = false;
        showStart(Editor.state.level);
        /* syncPickers, NOT renderEditorPanel — the start tile's readout and
           the button's label are written there, and calling the wrong one left
           the panel saying "click a tile in the room" after you already had,
           with the button still offering to cancel. Which is what made a
           working picker feel broken. */
        syncPickers();
        status(`The player starts at ${t.x}, ${t.y} — press Save to keep it.`, "good");
        dirty = true;
    }

    function setStartDir(dir) {
        if (!Editor || !Editor.state.level) return;
        Editor.state.level.startDir = ((Number(dir) || 0) % 8 + 8) % 8;
        Editor.save();
        showStart(Editor.state.level);
        syncPickers();
        status("Facing set — press Save to keep it.", "good");
        dirty = true;
    }

    /* ---- THE WALKABLE GRID, painted by hand.

       Held here rather than in the level, because it belongs to the ROOM: two
       levels in the Library share one pathing grid. `walkPaint` is what a
       click does — on or off — so dragging across a row does one thing rather
       than alternating. */
    let walkPaint = true;
    let walkDragging = false;

    function paintWalkable(t, on) {
        const layout = Iso.layout;
        if (!layout || !layout.painted) return;
        if (t.x < 0 || t.y < 0 || t.x >= layout.cols || t.y >= layout.rows) return;
        const row = layout.mask[t.y];
        const want = on ? "0" : "x";
        if (row[t.x] === want) return;
        layout.mask[t.y] = row.slice(0, t.x) + want + row.slice(t.x + 1);
        layout.tiles = layout.mask.join("").split("").filter(c => c !== "x").length;
        renderWalkPanel();
        dirty = true;
    }

    function editorClick(t, ev) {
        const mode = Editor.state.mode;

        if (pickingStart) { setStartTile(t); return; }

        if (mode === "walk") { paintWalkable(t, walkPaint); return; }

        if (mode === "zones") {
            const hit = (Editor.state.level.zones || []).find(z =>
                t.x >= z.area.x && t.x < z.area.x + z.area.w &&
                t.y >= z.area.y && t.y < z.area.y + z.area.h);
            if (hit) Editor.selectZone(hit.id);
            return;
        }

        if (mode !== "decor") return;

        /* Move is ARMED, not held: press the button, then click the
           destination. Shift-click still works for anyone who knows it, but a
           modifier nobody is told about is not a feature — the button is. */
        if (moving && Editor.state.selected) {
            if (Editor.moveSelected(t.x, t.y)) {
                moving = false;
                status("Moved.", "good");
                setHint(Editor.state.mode);
            } else {
                status("That does not fit there — try another tile.", "bad");
            }
            renderEditorPanel();
            return;
        }
        if (ev.shiftKey && Editor.state.selected) {
            if (!Editor.moveSelected(t.x, t.y)) status("That does not fit there.", "bad");
            return;
        }
        if (Editor.state.brush) {
            if (!Editor.place(t.x, t.y)) status("That does not fit there.", "bad");
            return;
        }
        Editor.selectAt(t.x, t.y);
    }

    /* ---- PRECISE MOVE, wired to Habbo's Advanced tool field for field.

       The client's own rules, read out of hh_room.cct:

         - three fields, Floor X, Floor Y and Height
         - X and Y step by 1, Height by 0.1 — that 0.1 is a literal in
           eventProcAdvancedFurniEditor, not a guess
         - Height is normalised to three decimals, so 2 shows as 2.000
         - the room previews as you type, and Cancel puts the piece back
         - a value that will not do leaves "Invalid values." in the status line
           and moves nothing

       The one thing added is saying WHICH way it is invalid, because a
       builder who typed 9 into a room eight tiles wide deserves better than
       being told the values are invalid. */
    const precise = { open: false };

    const preciseEls = () => ({
        panel: document.getElementById("ff-precise-panel"),
        x: document.getElementById("ff-precise-x"),
        y: document.getElementById("ff-precise-y"),
        z: document.getElementById("ff-precise-z"),
        status: document.getElementById("ff-precise-status"),
        button: document.getElementById("ff-precise")
    });

    const fmtHeight = (n) => Number(n || 0).toFixed(3);

    function openPrecise() {
        const at = Editor.beginPrecise();
        if (!at) return;
        const el = preciseEls();
        precise.open = true;
        el.x.value = String(at.x);
        el.y.value = String(at.y);
        el.z.value = fmtHeight(at.z);
        el.status.textContent = "";
        el.panel.hidden = false;
        el.button.classList.add("is-armed");
        el.z.focus();
        el.z.select();
    }

    function closePrecise() {
        if (!precise.open) return;
        precise.open = false;
        Editor.cancelPrecise();
        const el = preciseEls();
        el.panel.hidden = true;
        el.button.classList.remove("is-armed");
        dirty = true;
    }

    /* What the three fields say, and whether they say anything usable.
       Integers for the floor, a plain decimal for the height — the client
       checks the text the same way, character by character, before it will
       let a value through. */
    function preciseValues() {
        const el = preciseEls();
        const xs = el.x.value.trim(), ys = el.y.value.trim(), zs = el.z.value.trim();
        const intish = /^-?\d+$/;
        const floatish = /^\d*(\.\d*)?$/;
        if (!intish.test(xs) || !intish.test(ys) || !floatish.test(zs) || zs === "" || zs === ".") return null;
        return { x: Number(xs), y: Number(ys), z: Number(zs) };
    }

    function preciseWhyNot(v) {
        if (!v) return "Invalid values.";
        const f = Editor.state.selected;
        if (!f) return "Nothing selected.";
        if (v.x < 0 || v.y < 0 || v.x + f.w > Iso.COLS || v.y + f.h > Iso.ROWS) {
            return `Outside the room — X 0 to ${Iso.COLS - f.w}, Y 0 to ${Iso.ROWS - f.h}.`;
        }
        if (v.z < 0 || v.z > Levels.MAX_HEIGHT) return `Height is 0 to ${Levels.MAX_HEIGHT}.`;
        return "Something is already there at that height.";
    }

    function previewPrecise() {
        if (!precise.open) return;
        const el = preciseEls();
        const v = preciseValues();
        if (!v) { el.status.textContent = "Invalid values."; return; }
        const ok = Editor.previewPrecise(v.x, v.y, v.z);
        el.status.textContent = ok ? "" : preciseWhyNot(v);
        dirty = true;
    }

    function stepPrecise(field, step) {
        if (!precise.open) return;
        const el = preciseEls();
        const input = el[field];
        const now = Number(input.value.trim());
        const next = (Number.isFinite(now) ? now : 0) + step;
        input.value = field === "z"
            ? fmtHeight(Math.max(0, Math.min(Levels.MAX_HEIGHT, next)))
            : String(Math.round(next));
        previewPrecise();
    }

    function savePrecise() {
        if (!precise.open) return;
        const el = preciseEls();
        const v = preciseValues();
        if (!v || !Editor.savePrecise(v.x, v.y, v.z)) {
            el.status.textContent = preciseWhyNot(v);
            // The piece is back where it was; the dialog stays open to fix.
            if (v) { Editor.beginPrecise(); previewPrecise(); }
            return;
        }
        precise.open = false;
        el.panel.hidden = true;
        el.button.classList.remove("is-armed");
        status("Moved.", "good");
        dirty = true;
    }

    function syncEditor() {
        state.furni = Editor.state.placed;
        // The shape first: what counts as blocked depends on which room it is.
        Object.assign(state, Levels.toRoomOpts(Editor.state.level));
        applyLayout(state.model);
        refreshBlocked();
        syncPickers();
        dirty = true;
        renderEditorPanel();
    }

    /* What the DROP ZONE tab has picked, kept apart from Editor.state.brush.

       They are two different jobs and sharing one selection made the zone tab
       depend on the Decorate tab: to add a sofa to a zone you first had to go
       and select a sofa on another tab, which is a placement tool. Nothing on
       the zone tab places anything — you name a furni and a number, and the
       game rolls the tile. */
    let dropBrush = null;

    // Waiting for the click that says where the selected piece should go.
    let moving = false;

    /* The Rules panel, as [input id, stored key, stored units per shown unit].
       A level stores milliseconds; a builder thinks in seconds. */
    const RULE_FIELDS = [
        ["ff-rule-seconds", "seconds", 1],
        ["ff-rule-delay", "dropDelayMs", 1000],
        ["ff-rule-speed", "dropSpeedMs", 1000],
        ["ff-rule-reach", "minDropDistance", 1]
    ];

    /* What those numbers actually add up to, in a sentence.

       A level was saved with a two-MILLISECOND gap — the field used to be in
       milliseconds and 2 is a perfectly sensible number of seconds — and every
       seat in it landed in the same frame. The units are fixed above; this is
       so a value that cannot work is visible before the round is played rather
       than after. */
    function renderRuleSummary(L) {
        const el = document.getElementById("ff-rule-summary");
        if (!el) return;
        const drops = Levels.totalDrops(L);
        if (!drops) { el.textContent = "Nothing falls yet."; el.classList.remove("is-warn"); return; }

        const gap = L.rules.dropDelayMs / 1000;
        const last = (drops - 1) * gap + L.rules.dropSpeedMs / 1000;
        const tooFast = gap < 0.15 && drops > 1;
        el.textContent = tooFast
            ? `${drops} pieces, one every ${gap.toFixed(2)}s — they will all land at once.`
            : `${drops} pieces, one every ${gap.toFixed(2)}s — the last lands after ${last.toFixed(1)}s of ${L.rules.seconds}s.`;
        el.classList.toggle("is-warn", tooFast || last > L.rules.seconds);
        if (!tooFast && last > L.rules.seconds) {
            el.textContent += " The clock runs out before it lands.";
        }
    }

    /* One furni picker, drawn twice. `current` is whatever that copy has
       selected and `onPick` is what it does about a click; everything else —
       the search box it reads, the icon, the seat badge — is the same. */
    function renderPicker(listId, queryId, current, onPick) {
        const list = document.getElementById(listId);
        const query = document.getElementById(queryId);
        if (!list || !query) return;
        list.innerHTML = "";
        /* Everything that matches, not a first handful — see the note on
           RoomEditor.search. The list scrolls, and `loading="lazy"` keeps an
           answer of a thousand rows from asking FurniIndex for a thousand
           icons: only the ones scrolled into view are ever fetched. */
        for (const r of Editor.search(query.value)) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "ff-furni" + (current === r.className ? " is-on" : "");
            b.title = `${r.name} — ${r.w}x${r.h}${r.sit ? ", seat" : ""}, ${r.rotations} rotation${r.rotations === 1 ? "" : "s"}`;
            b.innerHTML = `<img src="${r.icon}" alt="" loading="lazy" decoding="async"><span>${r.name}</span>` +
                (r.sit ? '<em class="ff-seat">seat</em>' : "");
            b.addEventListener("click", () => onPick(r.className));
            list.appendChild(b);
        }
    }

    /* ---- THE SPLASH TAB: what falls past the title screen.

       Site-wide rather than per level, so it is read from and written to the
       site's own settings rather than to a level document — see
       settings.lobbyFurni, which caps the list at ten and checks every name.
       Saved on every change: there is no Save button because there is nothing
       to lose by writing a one-line list immediately, and a tab that looks
       saved but is not is worse than a few extra requests.

       WHAT CAN BE PICKED is what the title screen can actually draw: every
       class in the furni library, plus the handful that exist only as flat
       pictures (the Club sofa, which this client ships no full artwork for).
       Anything else would be chosen, saved, and then silently not appear. */
    let splashFurni = [];
    let splashPick = null;

    const splashDrawable = (className) =>
        !!(window.FurniLibrary && window.FurniLibrary[className]) ||
        !!(Lobby && Lobby.IMAGE_ONLY && Lobby.IMAGE_ONLY[className]);

    function splashNameOf(className) {
        const row = (Editor.search(className, 1) || [])[0];
        return row && row.className === className ? row.name : className;
    }

    async function loadSplash() {
        try {
            const res = await fetch("/.netlify/functions/settings", { credentials: "same-origin" });
            const data = res.ok ? await res.json() : {};
            splashFurni = Array.isArray(data.lobbyFurni) && data.lobbyFurni.length
                ? data.lobbyFurni.slice()
                : (Lobby ? Lobby.DEFAULT_FURNI.slice() : []);
        } catch {
            splashFurni = Lobby ? Lobby.DEFAULT_FURNI.slice() : [];
        }
        renderSplash();
    }

    async function saveSplash() {
        try {
            const res = await fetch("/.netlify/functions/settings", {
                method: "PUT",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-token": Editor.authToken() || ""
                },
                body: JSON.stringify({ lobbyFurni: splashFurni })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { status(data.error || "Could not save the splash furni.", "bad"); return; }
            status("Splash furni saved.", "good");
        } catch (e) {
            status(`Could not save the splash furni: ${e.message}`, "bad");
        }
        renderSplash();
    }

    function renderSplash() {
        const listEl = document.getElementById("ff-splash-list");
        const countEl = document.getElementById("ff-splash-count");
        const addBtn = document.getElementById("ff-splash-add");
        if (!listEl || !countEl) return;

        const max = (Lobby && Lobby.MAX_FURNI) || 10;
        countEl.textContent = `${splashFurni.length} of ${max} — ${splashFurni.length ? "" : "the game's own default is falling."}`.trim();

        listEl.innerHTML = "";
        for (const className of splashFurni) {
            const row = document.createElement("div");
            row.className = "ff-item";
            const ok = splashDrawable(className);
            row.innerHTML = `<span>${escapeText(splashNameOf(className))}</span>` +
                (ok ? "" : '<em class="ff-sel is-warn">no artwork</em>');
            const rm = document.createElement("button");
            rm.type = "button";
            rm.textContent = "Remove";
            rm.addEventListener("click", () => {
                splashFurni = splashFurni.filter(c => c !== className);
                saveSplash();
            });
            row.appendChild(rm);
            listEl.appendChild(row);
        }

        renderPicker("ff-splash-picker", "ff-splash-q", splashPick, (cls) => {
            splashPick = splashPick === cls ? null : cls;
            renderSplash();
        });

        if (addBtn) addBtn.disabled = !splashPick || splashFurni.length >= max;
    }

    function renderEditorPanel() {
        if (!Editor || !Editor.state.level) return;
        const sel = Editor.state.selected;
        const rots = sel ? Editor.rotationCount(sel.className) : 0;

        renderPicker("ff-furni-list", "ff-furni-q", Editor.state.brush, (cls) => {
            Editor.setBrush(Editor.state.brush === cls ? null : cls);
            closePrecise();
            renderEditorPanel();
            dirty = true;
        });
        renderPicker("ff-drop-list", "ff-drop-q", dropBrush, (cls) => {
            dropBrush = dropBrush === cls ? null : cls;
            renderEditorPanel();
        });

        /* What is in your hand, said above what is on the floor — they are two
           different things and the panel used to show only the second. */
        const held = Editor.state.brush;
        const heldRots = held ? Editor.rotationCount(held) : 0;
        const heldEl = document.getElementById("ff-held");
        const heldRow = document.getElementById("ff-held-row");
        heldEl.hidden = !held;
        heldRow.hidden = !held;
        if (held) {
            const row = (Editor.search(held, 1) || [])[0];
            heldEl.textContent = `Holding ${row ? row.name : held}` +
                (heldRots > 1 ? ` · facing ${Editor.brush.rotation + 1}/${heldRots}` : " · does not turn") +
                " — click a tile to put it down.";
            document.getElementById("ff-brush-rotate").disabled = heldRots < 2;
            const heldState = stateLabel(held, Editor.brush.state);
            const heldStateBtn = document.getElementById("ff-brush-state");
            heldStateBtn.hidden = !heldState;
            if (heldState) heldStateBtn.textContent = heldState;
        }

        document.getElementById("ff-sel").textContent = sel
            ? `${sel.name} — ${sel.w}x${sel.h} at ${sel.x},${sel.y}` +
            (sel.lift ? ` · height ${fmtHeight(sel.lift)}` : "") +
            (rots > 1 ? ` · rotation ${sel.rotation + 1}/${rots}` : " · does not turn") +
            (stateLabel(sel.className, sel.state) ? ` · ${describeState(sel)}` : "")
            : "Nothing selected.";
        if (!sel) { moving = false; closePrecise(); }   // nothing to move
        const moveBtn = document.getElementById("ff-move");
        moveBtn.disabled = !sel;
        moveBtn.classList.toggle("is-armed", moving);
        moveBtn.textContent = moving ? "Click a tile…" : "Move";
        document.getElementById("ff-rotate").disabled = !sel || rots < 2;
        const selState = sel ? stateLabel(sel.className, sel.state) : null;
        const selStateBtn = document.getElementById("ff-state");
        selStateBtn.hidden = !selState;
        selStateBtn.disabled = !selState;
        if (selState) selStateBtn.textContent = selState;
        document.getElementById("ff-delete").disabled = !sel;
        document.getElementById("ff-precise").disabled = !sel;

        renderZones();
        renderSplash();
        const L = Editor.state.level;
        for (const [id, key, scale] of RULE_FIELDS) {
            const el = document.getElementById(id);
            if (el && document.activeElement !== el) {
                const shown = L.rules[key] / scale;
                el.value = scale === 1 ? shown : Number(shown.toFixed(2));
            }
        }
        renderRuleSummary(L);
        /* Delete only means anything for a level that exists on the site;
           for anything else Discard is the button. Say so on the button rather
           than only in the error you get after pressing it. */
        const del = document.getElementById("ff-level-delete");
        if (del) {
            del.disabled = !L.id;
            del.title = L.id ? "Remove this level from the site" : "This level has never been saved";
        }
        const disc = document.getElementById("ff-level-discard");
        if (disc) disc.textContent = L.id ? "Discard changes" : "Scrap level";

        const nameEl = document.getElementById("ff-level-name");
        if (document.activeElement !== nameEl) nameEl.value = L.name || "";
        document.getElementById("ff-level-order").value = L.order || 0;
    }

    /* The levels already on the server, for the load dropdown. Needs an admin
       session — a signed-out builder gets an empty list and a note, not an
       error page. */
    async function refreshLevelList() {
        const sel = document.getElementById("ff-level-list");
        if (!sel) return;
        const signin = document.getElementById("ff-signin");
        try {
            const all = await Editor.listServer(true);
            if (signin) signin.hidden = true;
            sel.innerHTML = "";
            for (const l of all) {
                const o = document.createElement("option");
                o.value = l.id;
                o.textContent = `${l.order}. ${l.name}${l.published ? "" : " (draft)"}`;
                sel.appendChild(o);
            }
            if (!all.length) sel.innerHTML = '<option value="">No levels saved yet</option>';
        } catch {
            /* A token in storage that the server refuses means the session has
               lapsed, not that nobody ever signed in — and signing in again is
               the fix for one and not the other, so they are worth telling
               apart rather than both reading "not signed in". */
            const stale = Boolean(Editor.authToken());
            sel.innerHTML = `<option value="">${stale
                ? "Session expired — no levels listed"
                : "Not signed in — no levels listed"}</option>`;
            if (signin) {
                signin.hidden = false;
                signin.querySelector(".ff-signin-why").textContent = stale
                    ? "Your admin session has expired."
                    : "You are not signed in as an admin.";
            }
        }
    }

    /* The zones, and — for whichever is selected — what falls into it. Two
       lists, because they are two things: the rectangle and its contents. */
    function renderZones() {
        const list = document.getElementById("ff-zone-list");
        if (!list) return;
        const L = Editor.state.level;
        const current = Editor.zone();

        list.innerHTML = "";
        for (const z of L.zones || []) {
            const row = document.createElement("div");
            row.className = "ff-zone" + (current && z.id === current.id ? " is-on" : "");
            const drops = (z.items || []).reduce((n, i) => n + i.count, 0);
            row.innerHTML = `<span>${z.name || "Zone"}</span>` +
                `<small>${z.area.w}×${z.area.h} · ${drops} drop${drops === 1 ? "" : "s"}</small>`;
            row.addEventListener("click", () => Editor.selectZone(z.id));
            const x = document.createElement("button");
            x.type = "button"; x.textContent = "×"; x.title = "Delete zone";
            x.addEventListener("click", (ev) => { ev.stopPropagation(); Editor.removeZone(z.id); });
            row.appendChild(x);
            list.appendChild(row);
        }
        if (!(L.zones || []).length) {
            list.innerHTML = '<p class="ff-hint">No zones yet — drag across the room to draw one.</p>';
        }

        const detail = document.getElementById("ff-zone-detail");
        detail.hidden = !current;
        if (!current) return;

        document.getElementById("ff-zone-area").textContent =
            `${current.area.w}×${current.area.h} tiles at ${current.area.x},${current.area.y}` +
            " — drag on the room to redraw";
        const nameEl = document.getElementById("ff-zone-name");
        if (document.activeElement !== nameEl) nameEl.value = current.name || "";

        const items = document.getElementById("ff-zone-items");
        items.innerHTML = "";
        (current.items || []).forEach((it, i) => {
            const row = document.createElement("div");
            row.className = "ff-item";
            const meta = Editor.metaFor(it.className) || {};
            const label = meta.n || it.className;
            /* A seat role on a furni that cannot be sat on. It will land and
               block like any obstacle and never join the sequence, so say so
               here rather than leaving it to be discovered in play. */
            const miscast = Levels.needsSeat(it.role) && !meta.sit;
            if (miscast) row.classList.add("is-miscast");
            row.innerHTML = `<span>${it.count}× ${label}</span>` +
                `<em>${Levels.ROLE_LABELS[it.role] || it.role}</em>` +
                (miscast ? '<strong class="ff-item-warn" title="Habbo\'s furnidata says this furni cannot be sat on, so it can never be part of the sequence. It will behave as an obstacle.">not a seat</strong>' : "");
            const x = document.createElement("button");
            x.type = "button"; x.textContent = "×"; x.title = "Remove";
            x.addEventListener("click", () => Editor.removeItem(i));
            row.appendChild(x);
            items.appendChild(row);
        });
        if (!(current.items || []).length) {
            items.innerHTML = '<p class="ff-hint">Nothing falls here yet.</p>';
        }

        // Name what Add will add, rather than leaving it to be guessed.
        const pickEl = document.getElementById("ff-item-pick");
        if (pickEl) {
            pickEl.textContent = dropBrush
                ? `Adding: ${(Editor.metaFor(dropBrush) || {}).n || dropBrush}`
                : "Choose a furni above.";
        }
        document.getElementById("ff-item-add").disabled = !dropBrush;
    }

    /* THE EDITOR GATE.

       Asked and answered before a single byte of level-building content is
       fetched: no furni catalogue, no furnidata, no level list, and the editor
       markup stays hidden because `is-editing` is never added. A visitor who
       types ?edit=1 without an owner account gets a sentence and nothing else.

       The server is the actual boundary — every route on ff-levels.js that is
       not the public read now requires an owner, so this could be skipped
       entirely and no level could still be changed. What this adds is honesty:
       the page says why up front instead of opening a tool whose every save
       will be refused.

       Owner, specifically, not merely signed in: an "admin" on this site can
       write elsewhere and cannot touch levels. */
    async function admitEditor() {
        const token = window.RoomEditor && window.RoomEditor.authToken();
        if (!token) return { ok: false, why: "signin" };
        try {
            const res = await fetch("/.netlify/functions/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-token": token },
                body: JSON.stringify({ action: "verify" })
            });
            if (res.status === 401) return { ok: false, why: "expired" };
            if (!res.ok) return { ok: false, why: "error" };
            const who = await res.json();
            if (who.role !== "owner") return { ok: false, why: "role", role: who.role, username: who.username };
            return { ok: true, username: who.username };
        } catch {
            return { ok: false, why: "error" };
        }
    }

    // What a refused visitor sees instead of the editor. The game itself is
    // one link away, because being told "no" and left on a blank page is worse
    // than being told "no" and shown the way to the thing you can use.
    function refuseEditor(verdict) {
        const main = document.querySelector(".ff-page");
        if (!main) return;
        const reason = {
            signin: "You are not signed in.",
            expired: "Your admin session has expired.",
            role: `Signed in as ${verdict.username || "an admin"}${verdict.role ? ` (${verdict.role})` : ""}, which cannot edit levels.`,
            error: "The server could not confirm who you are."
        }[verdict.why] || "You cannot open the level editor.";

        main.innerHTML = "";
        const box = document.createElement("section");
        box.className = "ff-refused";
        box.innerHTML =
            "<h1>Level editor</h1>" +
            `<p>${reason} The Fallin' Furni level editor is limited to owner accounts.</p>` +
            '<p><a href="/admin">Sign in</a> &middot; <a href="/fallinfurni">Play Fallin\' Furni</a></p>';
        main.appendChild(box);
    }

    function initEditor() {
        document.body.classList.add("is-editing");
        Editor.onChange(syncEditor);
        Furni.onSpriteLoad(() => { dirty = true; });

        document.addEventListener("keydown", (ev) => {
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName || "")) return;
            if (ev.key === "r" || ev.key === "R") {
                /* R turns whatever is IN YOUR HAND first, and only then the
                   piece on the floor — which is the order Habbo works in, and
                   the order you want: while placing a row of chairs you are
                   turning the one you are holding, not the last one down. */
                if (Editor.state.brush) { Editor.rotateBrush(); renderEditorPanel(); }
                else if (!Editor.rotateSelected()) status("It will not turn there.", "bad");
                else status("", "");
                ev.preventDefault();
            }
            /* F for the switch, and the same hand-before-floor order as R. */
            if (ev.key === "f" || ev.key === "F") {
                if (Editor.state.brush) { Editor.cycleBrushState(); renderEditorPanel(); dirty = true; }
                else if (Editor.cycleSelectedState()) { renderEditorPanel(); dirty = true; }
                ev.preventDefault();
            }
            if (ev.key === "Delete" || ev.key === "Backspace") { Editor.deleteSelected(); ev.preventDefault(); }
            if (ev.key === "Escape") { Editor.setBrush(null); closePrecise(); renderEditorPanel(); dirty = true; }
        });

        document.getElementById("ff-furni-q").addEventListener("input", renderEditorPanel);
        document.getElementById("ff-drop-q").addEventListener("input", renderEditorPanel);
        document.getElementById("ff-move").addEventListener("click", () => {
            if (!Editor.state.selected) return;
            moving = !moving;
            setHint(Editor.state.mode, moving ? "Click the tile to move it to." : null);
            renderEditorPanel();
        });
        document.getElementById("ff-rotate").addEventListener("click", () => {
            if (!Editor.rotateSelected()) status("It will not turn there.", "bad");
        });
        document.getElementById("ff-delete").addEventListener("click", () => Editor.deleteSelected());

        document.getElementById("ff-brush-state").addEventListener("click", () => {
            Editor.cycleBrushState();
            renderEditorPanel();
            dirty = true;
        });
        document.getElementById("ff-state").addEventListener("click", () => {
            if (Editor.cycleSelectedState()) { renderEditorPanel(); dirty = true; }
        });
        document.getElementById("ff-brush-rotate").addEventListener("click", () => {
            Editor.rotateBrush();
            renderEditorPanel();
        });
        document.getElementById("ff-brush-drop").addEventListener("click", () => {
            Editor.setBrush(null);
            renderEditorPanel();
        });

        // ---- Precise Move
        document.getElementById("ff-precise").addEventListener("click", () => {
            if (precise.open) closePrecise(); else openPrecise();
        });
        document.getElementById("ff-precise-cancel").addEventListener("click", closePrecise);
        document.getElementById("ff-precise-save").addEventListener("click", savePrecise);
        for (const el of document.querySelectorAll("#ff-precise-panel input")) {
            el.addEventListener("input", previewPrecise);
            el.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter") { savePrecise(); ev.preventDefault(); }
                if (ev.key === "Escape") { closePrecise(); ev.preventDefault(); }
            });
        }
        for (const b of document.querySelectorAll("#ff-precise-panel button[data-precise]")) {
            b.addEventListener("click", () => stepPrecise(b.dataset.precise, Number(b.dataset.step)));
        }

        // Modes.
        for (const b of document.querySelectorAll("#ff-modes button")) {
            b.addEventListener("click", () => setMode(b.dataset.mode));
        }

        // Splash: what falls past the title screen.
        document.getElementById("ff-splash-q").addEventListener("input", renderSplash);
        document.getElementById("ff-splash-add").addEventListener("click", () => {
            const max = (Lobby && Lobby.MAX_FURNI) || 10;
            if (!splashPick) return;
            if (splashFurni.includes(splashPick)) { status("That is already on the splash screen.", "bad"); return; }
            if (splashFurni.length >= max) { status(`Ten is the limit.`, "bad"); return; }
            if (!splashDrawable(splashPick)) {
                status("The title screen has no artwork for that one — it would not appear.", "bad");
                return;
            }
            splashFurni.push(splashPick);
            splashPick = null;
            saveSplash();
        });
        document.getElementById("ff-splash-reset").addEventListener("click", () => {
            splashFurni = Lobby ? Lobby.DEFAULT_FURNI.slice() : [];
            saveSplash();
        });
        loadSplash();

        // Zones: the area is its own thing, its contents are another.
        document.getElementById("ff-zone-add").addEventListener("click", () => {
            Editor.addZone();
            status("Zone added — drag on the room to shape it.", "good");
        });
        document.getElementById("ff-zone-delete").addEventListener("click", () => {
            const z = Editor.zone();
            if (z) Editor.removeZone(z.id);
        });
        document.getElementById("ff-zone-name").addEventListener("input", (ev) => {
            const z = Editor.zone();
            if (z) Editor.renameZone(z.id, ev.target.value);
        });
        document.getElementById("ff-item-add").addEventListener("click", () => {
            const z = Editor.zone();
            if (!z) { status("Select a zone first.", "bad"); return; }
            const cls = dropBrush;
            if (!cls) { status("Choose a furni to drop first.", "bad"); return; }
            if (!Editor.playable(cls)) {
                status("That furni has no artwork — it would be invisible in the room.", "bad");
                return;
            }
            Editor.addItem(cls,
                document.getElementById("ff-item-role").value,
                Number(document.getElementById("ff-item-count").value) || 1);
            status("Added to the zone.", "good");
        });

        /* The stored level keeps milliseconds; the panel shows seconds. `scale`
           is what one shown unit is worth in stored units, so the conversion
           lives in one place instead of at four call sites. */
        for (const [id, key, scale] of RULE_FIELDS) {
            document.getElementById(id).addEventListener("change", (ev) => {
                const shown = Number(ev.target.value);
                if (!Number.isFinite(shown)) return;
                Editor.state.level.rules[key] = Math.round(shown * scale);
                Editor.save();
                renderEditorPanel();
            });
        }
        document.getElementById("ff-level-name").addEventListener("change", (ev) => {
            Editor.state.level.name = ev.target.value.trim();
            Editor.save();
        });
        document.getElementById("ff-level-order").addEventListener("change", (ev) => {
            Editor.state.level.order = Number(ev.target.value) || 0;
            Editor.save();
        });

        /* Save and Publish both go to the SERVER — the local copy is only a
           crash net, kept alongside. An earlier build had Save write to this
           browser and Publish write to the server, which meant the obvious
           button was the one that did not actually keep your work anywhere
           anybody else could see. Save now means saved; Publish means saved
           and in the run. */
        async function toServer(publish) {
            try {
                status(publish ? "Publishing…" : "Saving…", "busy");
                const saved = await Editor.saveServer(publish);
                status(`${publish ? "Published" : "Saved"} “${saved.name}”.`, "good");
                await refreshLevelList();
                document.getElementById("ff-level-list").value = saved.id;
            } catch (e) {
                Editor.save();      // keep it locally even when the server said no
                /* "Unauthorized" on its own tells a builder nothing they can
                   act on. The one cause worth naming is the common one: the
                   admin session has lapsed, and signing in again fixes it. */
                const why = /unauthor/i.test(e.message || "")
                    ? "Not signed in as admin — sign in on the admin page, then Save again."
                    : (e.message || "Could not reach the server.");
                status(`${why} Your work is safe in this browser meanwhile.`, "bad");
            }
        }
        document.getElementById("ff-save").addEventListener("click", () => toServer(false));
        document.getElementById("ff-publish").addEventListener("click", () => toServer(true));

        document.getElementById("ff-level-new").addEventListener("click", () => {
            Editor.setLevel({ name: "New level", order: (Editor.state.level.order || 0) + 1 });
            setMode("room");
            status("New level — name it, then Save.", "good");
        });

        // Choosing from the list IS loading it; a separate Load button was a
        // step that did nothing but sit between you and the level.
        document.getElementById("ff-level-list").addEventListener("change", async (ev) => {
            const id = ev.target.value;
            if (!id) return;
            try { await Editor.loadServer(id); status("Loaded.", "good"); }
            catch (e) { status(e.message || "Could not load.", "bad"); }
        });

        /* SCRAP THE WORK, not the level.

           What that means depends on whether this level exists on the server.
           A level that has been saved goes back to its saved state — the
           edits since are what you are throwing away. One that has never been
           saved has no state to go back to, so it goes entirely.

           Both clear the localStorage draft as well, or the scrapped work
           comes straight back on the next reload. */
        document.getElementById("ff-level-discard").addEventListener("click", async () => {
            const L = Editor.state.level;
            const saved = Boolean(L.id);
            const what = saved
                ? `Throw away unsaved changes to “${L.name || "this level"}” and go back to the saved version?`
                : `Scrap “${L.name || "this level"}”? It has never been saved, so it will be gone.`;
            if (!confirm(what)) return;

            Editor.discardDraft();
            if (!saved) {
                Editor.setLevel({ name: "New level" });
                setMode("room");
                status("Scrapped. Starting fresh.", "good");
                return;
            }
            try {
                await Editor.loadServer(L.id);
                status("Back to the last saved version.", "good");
            } catch (e) {
                status(e.message || "Could not reload the saved version.", "bad");
            }
        });

        document.getElementById("ff-level-delete").addEventListener("click", async () => {
            const L = Editor.state.level;
            if (!L.id) {
                status("This level was never saved — use Discard changes to scrap it.", "bad");
                return;
            }
            if (!confirm(`Delete “${L.name || L.id}” from the site for good? This cannot be undone.`)) return;
            try {
                await Editor.deleteServer(L.id);
                Editor.discardDraft();
                Editor.setLevel({ name: "New level" });
                setMode("room");
                await refreshLevelList();
                status("Level deleted.", "good");
            } catch (e) { status(e.message || "Could not delete.", "bad"); }
        });
        document.getElementById("ff-export").addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(JSON.stringify(Editor.save(), null, 2));
                status("Level JSON copied.", "good");
            } catch { status("Could not reach the clipboard.", "bad"); }
        });

        status("Loading the furni catalogue…", "busy");
        Editor.load().then((counts) => {
            Editor.restore();
            syncEditor();
            setMode("room");
            status(`Editor ready — ${counts.catalogue} furni with artwork.`, "good");
            refreshLevelList();
        }).catch(() => status("Could not load the furni catalogue.", "bad"));
    }

    /* ---- dragging out a zone

       Only in zone mode, and no modifier key: dragging across the room IS how
       you draw a drop zone, which is what somebody would try first. It used to
       need alt held down, which nobody would guess and nothing said.

       Releasing shapes the SELECTED zone if there is one, and makes a new one
       if there is not — so redrawing a rectangle and drawing your first are
       the same gesture. */
    let dragFrom = null, dragArea = null;

    function beginDrag(t) { dragFrom = t; dragArea = { x: t.x, y: t.y, w: 1, h: 1 }; }

    function extendDrag(t) {
        if (!dragFrom) return;
        dragArea = {
            x: Math.min(dragFrom.x, t.x), y: Math.min(dragFrom.y, t.y),
            w: Math.abs(t.x - dragFrom.x) + 1, h: Math.abs(t.y - dragFrom.y) + 1
        };
        dirty = true;
    }

    function endDrag() {
        if (!dragFrom || !dragArea) { dragFrom = null; dragArea = null; return; }
        // A click, not a drag: leave it to the click handler.
        if (dragArea.w === 1 && dragArea.h === 1) { dragFrom = null; dragArea = null; return; }
        const z = Editor && Editor.zone();
        if (z) { Editor.setZoneArea(z.id, dragArea); status("Zone reshaped.", "good"); }
        else if (Editor) { Editor.addZone(dragArea); status("Zone drawn — now add what falls into it.", "good"); }
        dragFrom = null; dragArea = null;
        dirty = true;
    }

    // ---- pickers, persistence, lookup

    function patternsFor(kind) { return (window.RoomPatterns && window.RoomPatterns[kind]) || []; }

    function buildPicker(kind, selectId, swatchId, patternKey, colourKey) {
        const select = document.getElementById(selectId);
        const swatches = document.getElementById(swatchId);
        const groups = patternsFor(kind);
        if (!select || !groups.length) return;

        select.innerHTML = "";
        for (const g of groups) {
            const o = document.createElement("option");
            o.value = g.id;
            o.textContent = g.id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            select.appendChild(o);
        }

        function renderSwatches() {
            const g = groups.find(x => x.id === state[patternKey]) || groups[0];
            if (!g.colours.some(c => c.id === state[colourKey])) {
                state[colourKey] = g.colours[0] && g.colours[0].id;
            }
            swatches.innerHTML = "";
            for (const c of g.colours) {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "ff-swatch" + (c.id === state[colourKey] ? " is-on" : "");
                b.style.background = c.rgb;
                b.title = c.rgb;
                b.setAttribute("aria-label", g.id + " " + c.rgb);
                b.addEventListener("click", () => {
                    state[colourKey] = c.id;
                    dirty = true; persist(); renderSwatches();
                });
                swatches.appendChild(b);
            }
        }

        select.value = state[patternKey];
        select.addEventListener("change", () => {
            state[patternKey] = select.value;
            state[colourKey] = null;
            dirty = true; persist(); renderSwatches();
        });
        renderSwatches();
        return renderSwatches;
    }

    let refreshFloorSwatches = null, refreshWallSwatches = null;
    function syncPickers() {
        const f = document.getElementById("ff-floor-pattern");
        const w = document.getElementById("ff-wall-pattern");
        const l = document.getElementById("ff-layout");
        if (f) f.value = state.floorPattern;
        if (w) w.value = state.wallPattern;
        if (l) l.value = state.model;
        const note = document.getElementById("ff-layout-note");
        if (note && window.RoomLayouts) {
            const m = window.RoomLayouts.get(state.model);
            const shaped = m.mask.some(r => r.includes("x"));
            note.textContent = m.painted
                ? `${m.cols}×${m.rows}, ${m.tiles} walkable tiles. A public room — its floor and walls are painted, so there is nothing to pick.`
                : `${m.cols}×${m.rows}, ${m.tiles} tiles` +
                  (shaped ? " — not a rectangle, so some of the grid is outside the room." : "");

            /* A PAINTED ROOM HAS NOTHING TO CHOOSE. The Library's floor and
               walls are one bitmap somebody drew in 2005; offering a wallpaper
               picker beside it promises something the renderer will ignore.
               The layout and the start tile stay: both are still the level's. */
            const room = document.querySelector('.ff-mode[data-mode="room"]');
            const keep = new Set(["Layout", "Start tile"]);
            if (room) {
                room.querySelectorAll("h3, .ff-select, .ff-swatches").forEach(el => {
                    if (el.id === "ff-layout" || keep.has(el.textContent)) return;
                    el.hidden = !!m.painted;
                });
            }
            // Painting the grid only means anything where it was guessed.
            const walkBtn = document.getElementById("ff-mode-walk");
            if (walkBtn) walkBtn.hidden = !m.painted;
            if (!m.painted && Editor && Editor.state.mode === "walk") setMode("room");
        }
        renderWalkPanel();
        const at = document.getElementById("ff-start-at");
        if (at && Editor && Editor.state.level) {
            const s = Editor.state.level.start;
            at.textContent = pickingStart
                ? "Click a tile in the room…"
                : `${s.x}, ${s.y}`;
        }
        const pick = document.getElementById("ff-start-pick");
        if (pick) pick.textContent = pickingStart ? "Cancel" : "Pick on the room";
        const dirSel = document.getElementById("ff-start-dir");
        if (dirSel && Editor && Editor.state.level) {
            dirSel.value = String(((Number(Editor.state.level.startDir) || 0) % 8 + 8) % 8);
        }
    }

    function renderWalkPanel() {
        const layout = Iso.layout;
        const count = document.getElementById("ff-walk-count");
        if (count) {
            count.textContent = (layout && layout.painted)
                ? `${layout.tiles} walkable of ${layout.cols * layout.rows}`
                : "";
        }
        const add = document.getElementById("ff-walk-add");
        if (add) add.textContent = walkPaint ? "Painting: ON" : "Painting: OFF";
        if (refreshFloorSwatches) refreshFloorSwatches();
        if (refreshWallSwatches) refreshWallSwatches();
    }

    /* CHANGING THE SHAPE MOVES EVERYTHING THAT WAS IN IT.

       A level's decor, its drop zones and its start tile were all placed
       against the old room, and the new one can be smaller or have a hole
       where they stood. `Levels.normalise` already clamps every one of those
       to the level's own model — so the honest way to change layout is to set
       it and put the level back through normalise, rather than to move the
       walls and leave the contents where they were.

       It is LOSSY on purpose, and says so. Going from the 8x13 room to the 5x7
       one cannot keep a chair at (7,12); there is nowhere for it to be. The
       count is reported rather than the change refused, because a builder
       trying layouts on for size wants to see them, and undo is one more
       change of the same picker. */
    function setLayoutFromPicker(id) {
        if (!Editor || !Editor.state.level) { state.model = id; applyLayout(id); dirty = true; return; }
        const before = Editor.state.level;
        const decorBefore = (before.decor || []).length;
        const next = Levels.normalise({ ...before, model: id });
        const lost = decorBefore - (next.decor || []).length;
        Editor.setLevel(next);
        Editor.save();
        syncEditor();
        status(lost
            ? `Layout: ${Levels && window.RoomLayouts ? window.RoomLayouts.get(id).name : id}. ${lost} piece${lost === 1 ? "" : "s"} of decor had nowhere to go and ${lost === 1 ? "was" : "were"} dropped.`
            : `Layout: ${window.RoomLayouts ? window.RoomLayouts.get(id).name : id}.`,
            lost ? "bad" : "good");
    }

    /* The room belongs to the LEVEL when there is one, so a picker change goes
       into the level rather than into a separate store. Without an editor it
       is just this browser's preference. */
    function persist() {
        if (Editor && Editor.state.level) { Editor.setRoom(state); Editor.save(); return; }
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({
                floorPattern: state.floorPattern, floorColour: state.floorColour,
                wallPattern: state.wallPattern, wallColour: state.wallColour,
                name: state.name
            }));
        } catch { /* a blocked localStorage is not a reason to stop */ }
    }

    function restore() {
        try {
            const v = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
            if (!v) return;
            for (const k of ["floorPattern", "floorColour", "wallPattern", "wallColour", "name"]) {
                if (v[k] !== undefined && v[k] !== null) state[k] = v[k];
            }
        } catch { /* ignore a corrupt entry */ }
    }

    /* A player's status line lives on the TITLE SCREEN, which is hidden the
       moment a round starts — so everything said during play ("Round 2 of 2",
       "On the board", "Run over") was being written into a display:none
       element. While the title is down, it goes to the play bar instead, which
       is the only line a player can still see.

       Both are written rather than one or the other: the title's copy is what
       greets them when the round ends and it comes back up. */
    function status(text, kind) {
        if (statusEl) {
            statusEl.textContent = text || "";
            statusEl.className = "ff-status" + (kind ? " is-" + kind : "");
        }
        if (Editor) return;
        const title = document.getElementById("ff-title");
        const hint = document.getElementById("ff-hint");
        if (!hint || !title) return;
        if (title.dataset.state === "playing") {
            hint.textContent = text || "";
            hint.className = "ff-inline-hint" + (kind ? " is-" + kind : "");
        } else {
            hint.textContent = "Click a tile to walk there.";
            hint.className = "ff-inline-hint";
        }
    }

    async function lookup(name) {
        const clean = name.trim();
        if (!clean) return;
        status("Looking up " + clean + "…", "busy");
        try {
            const res = await fetch("/.netlify/functions/room-figure?name=" + encodeURIComponent(clean));
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.figureString) {
                status(data.error || "No Origins habbo by that name.", "bad");
                return;
            }
            state.figure = data.figureString;
            state.name = data.name || clean;
            sprites.clear();
            preload(state.figure);
            dirty = true;
            status("Playing as " + state.name + ".", "good");
            persist();
        } catch {
            status("Could not reach the lookup just now.", "bad");
        }
    }

    function pointerTile(ev) {
        const r = canvas.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (canvas.width / r.width);
        const py = (ev.clientY - r.top) * (canvas.height / r.height);
        /* Walkable mode reaches the HOLES too — it is the tool that decides
           where they are, and a grid whose empty squares cannot be clicked can
           only ever be made smaller.

           So does the start picker, for a different reason: it has something
           to SAY about a tile with no floor on it. Without this a click
           outside the walkable area returned nothing at all, so the picker sat
           there armed and silent and looked broken, when the answer was "not
           there". Everywhere else a hole is not a tile. */
        if (Editor && (Editor.state.mode === "walk" || pickingStart)) return Iso.tileAtRaw(px, py);
        return Iso.tileAt(px, py);
    }

    // ---- play

    function currentLevel() {
        if (Editor && Editor.state.level) return Editor.save();
        return Levels.normalise({ ...Levels.fromRoomOpts(state), model: state.model });
    }

    /* Resolving a class to its metadata and artwork.

       In the builder both come from the editor, which has the whole catalogue
       loaded. A PLAYER has neither, so the run loads just the classes its
       levels actually use — see `loadLevelFurni`. Same two lookups either way;
       only where they are filled from differs. */
    const playerMeta = new Map();
    const playerSprites = new Map();     // className -> [state][rotation]

    function metaFor(c) {
        return Editor ? Editor.metaFor(c) : (playerMeta.get(c) || {});
    }
    /* { url, flip } — see RoomEditor.spriteFor. A player resolves the same
       question against the handful of sprite grids their levels pulled in, by
       the same rule, so a rotation looks identical in the game and in the
       editor that authored it. */
    function urlFor(c, st, r) {
        if (Editor) return Editor.spriteFor(c, st, r);
        const own = Furni.librarySprite(c, st || 0, r || 0);
        if (own) return own;
        const grid = playerSprites.get(c);
        if (!grid) return { url: null, flip: false };
        const states = grid[Math.min(st || 0, grid.length - 1)] || [];
        if (!states.length) return { url: null, flip: false };
        const rot = r || 0;
        if (rot < states.length) return { url: states[rot], flip: false };
        const cycle = Furni.rotationsOf(c) || states.length;
        const mirrored = cycle - 1 - rot;
        if (mirrored >= 0 && mirrored < states.length) return { url: states[mirrored], flip: true };
        return { url: states[states.length - 1], flip: false };
    }

    /* Metadata and artwork for exactly the classes these levels use.

       The catalogue is 1,283 rows carrying every sprite URL; a level uses a
       handful. It is still one request — filtering happens here rather than at
       the endpoint — but only the handful is KEPT, and nothing of the
       15,000-record furnidata is held beyond what the levels name. */
    async function loadLevelFurni(levels) {
        const wanted = new Set();
        for (const lv of levels) for (const c of Levels.furniUsed(lv)) wanted.add(c);
        if (!wanted.size) return;

        const [cat, meta] = await Promise.all([
            fetch("/.netlify/functions/furni-catalogue?sprites=1").then(r => r.json()).catch(() => ({ items: [] })),
            fetch("/.netlify/functions/furni-meta").then(r => r.json()).catch(() => ({ items: {} }))
        ]);
        for (const row of cat.items || []) {
            if (wanted.has(row.className)) playerSprites.set(row.className, row.largeImages || []);
        }
        for (const c of wanted) if (meta.items && meta.items[c]) playerMeta.set(c, meta.items[c]);
    }

    const gameOpts = () => ({ metaFor, urlFor, playerTile: () => state.pos });

    /* ---- the title screen, and what is behind it

       The published levels, fetched once at load. A player's Play then starts
       instantly instead of going to the network at the moment they press it —
       and, more to the point, the first level is already ON SCREEN behind the
       title, so pressing Play reveals a room rather than building one. */
    let published = null;

    /* THE FURNIDATA HAS TO BE IN BEFORE A ROUND STARTS, and having the LEVELS
       is not the same thing as having it.

       `prepare` sets `published` and only then fetches the furni records, so
       between those two there is a window where the levels are loaded and
       every furni in them is still an unknown. A piece built in that window
       gets `{}` for its meta, which means `sit: false` and a 1x1 footprint —
       so a chair lands as a 1x1 obstacle, never joins the sequence, and blocks
       a tile for the rest of the round. Silently: nothing is missing on
       screen, the seat simply is not one. Caught with a round that scored
       "7 of 7" on a level that drops eight chairs.

       `startRound` guarded on `published` alone, which is exactly the wrong
       half. The Play button is disabled while the title says "loading" and
       that hid it, but a disabled button is a courtesy, not a lock — anything
       that submits the form another way walks straight past it. This is the
       lock: the promise for the furni, awaited before a round is built,
       whoever asked for it and however. */
    let furniLoaded = null;

    /* The first level, dressed but not running: its floor, its wallpaper, its
       decor, and the avatar standing where the level starts. No round, no
       clock, nothing falling. */
    function previewLevel(level) {
        // Position AND facing: see showStart.
        showStart(level);
        Object.assign(state, Levels.toRoomOpts(level));
        applyLayout(state.model);
        state.furni = (level.decor || []).map(d => Furni.make(d.className, d.x, d.y, {
            meta: metaFor(d.className), rotation: d.rotation, state: d.state,
            lift: Number(d.z) || 0, role: "decor",
            ...urlFor(d.className, d.state, d.rotation)
        }));
        refreshBlocked();
        dirty = true;
    }

    /* Which furni falls past the title screen, from the site's settings.

       Quiet on failure on purpose: a settings endpoint that is slow, cold or
       simply down should cost the player nothing, and the game already has a
       sensible pair of its own. The only thing a failure loses is the
       builder's choice. */
    async function loadLobbyFurni() {
        if (!Lobby) return;
        try {
            const res = await fetch("/.netlify/functions/settings", { credentials: "same-origin" });
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data.lobbyFurni) && data.lobbyFurni.length) {
                Lobby.setFurni(data.lobbyFurni);
                Lobby.preload(() => { dirty = true; });
                dirty = true;
            }
        } catch { /* the default pair keeps falling */ }
    }

    function titleState(name, note) {
        const el = document.getElementById("ff-title");
        if (!el) return;
        if (name) el.dataset.state = name;
        const load = document.getElementById("ff-title-load");
        if (load && note !== undefined) load.textContent = note || "";
        const play = document.getElementById("ff-title-play");
        if (play) play.disabled = name === "loading";
    }

    const hideTitle = () => titleState("playing");
    const showTitle = () => {
        titleState(published && published.length ? "ready" : "empty");
        renderWho();
        refreshBoard();
    };

    /* Everything a player needs, before they are asked for anything: the
       levels, the furni artwork those levels use, and the first room drawn.
       Whatever this cannot do quietly is said on the title screen rather than
       discovered when Play does nothing. */
    async function prepare() {
        renderWho();
        if (window.Account) window.Account.ready().then(renderWho);
        refreshBoard();

        titleState("loading", "Fetching levels…");
        published = await Levels.fetchPublished();
        if (!published.length) {
            titleState("empty", "");
            status("No levels have been published yet.", "bad");
            return;
        }
        titleState("loading", "Loading the furni…");
        furniLoaded = loadLevelFurni(published);
        await furniLoaded;

        /* No room is built here any more. The title screen is the hotel view,
           so what has to be ready is the hotel view and the seats falling past
           it — the level's own room is built behind the room loader when a
           round starts, which is where Habbo builds it too. */
        titleState("ready", "");
    }

    /* ---- Discord, and the board

       Identity comes from js/account.js — the same Discord session the daily
       games use — and it buys exactly one thing: a name on the leaderboard.
       The game is playable signed out, so nothing here gates Play. */
    let runStartedAt = 0;

    function renderWho() {
        const el = document.getElementById("ff-title-who");
        if (!el) return;
        const acct = window.Account;
        const me = acct && acct.current;
        el.innerHTML = "";
        if (me) {
            el.append(`On the board as ${me.name} · `);
            const out = document.createElement("button");
            out.type = "button";
            out.className = "ff-linkish";
            out.textContent = "sign out";
            out.addEventListener("click", async () => { await acct.signOut(); renderWho(); });
            el.appendChild(out);
        } else {
            const inBtn = document.createElement("button");
            inBtn.type = "button";
            inBtn.className = "ff-linkish";
            inBtn.textContent = "Sign in with Discord";
            inBtn.addEventListener("click", () => acct && acct.signIn());
            el.appendChild(inBtn);
            el.append(" to put your run on the leaderboard.");
        }
    }

    const asClock = (ms) => {
        const s = Math.round(ms / 1000);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };

    async function refreshBoard() {
        const box = document.getElementById("ff-board");
        const list = document.getElementById("ff-board-list");
        if (!box || !list) return;
        try {
            const res = await fetch("/.netlify/functions/ff-scores", { credentials: "same-origin" });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            list.innerHTML = "";
            /* EVERY row the server sends, not the first eight. The list has a
               height and scrolls now, so a board that grows is a longer scroll
               rather than a truncated table — and nobody sitting at position
               nine has to be told they are not on it. */
            for (const row of (data.top || [])) {
                const li = document.createElement("li");
                /* The score leads, because the score is what the table is
                   ordered by — a board sorted on one number and captioned
                   with another is a board nobody can read. Levels and the
                   clock stay behind it: they are how the score was made, and
                   the clock still breaks a tie. */
                const points = Number(row.points) || 0;
                li.innerHTML = `<span>${escapeText(row.name)}</span>` +
                    `<em><b>${points.toLocaleString()} pts</b> · ` +
                    `${row.levels} ${row.levels === 1 ? "level" : "levels"} · ${asClock(row.ms)}</em>`;
                list.appendChild(li);
            }
            box.hidden = !(data.top || []).length;
        } catch {
            box.hidden = true;      // no board is better than a broken one
        }
    }

    const escapeText = (s) => String(s || "").replace(/[<>&"]/g, c => (
        { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]
    ));

    /* ---- THE BOARD READS ITSELF OUT when nobody is doing anything.

       A leaderboard that only ever shows its first screenful hides everybody
       below the fold, and the title screen is exactly where you would expect
       to be able to read the whole thing without touching anything. So after
       twenty seconds of stillness it scrolls, slowly, down and back up again,
       pausing at each end.

       IT GIVES WAY IMMEDIATELY. Any pointer move, key, wheel or touch anywhere
       on the page stops it where it is and starts the twenty seconds again —
       including a scroll of the list itself, which is the one that matters: a
       reader dragging the list must not be fighting it.

       TELLING OUR OWN SCROLL FROM THE READER'S is the whole difficulty, and
       the obvious way does not work. A flag set around the assignment to
       scrollTop is already back to false by the time the event arrives,
       because `scroll` is dispatched asynchronously — so the crawl saw its own
       movement as a reader touching the list, stopped itself, and waited
       another twenty seconds. Measured: it advanced three pixels every
       twenty-two seconds instead of fourteen a second.

       So it compares POSITIONS instead. `lastSet` is the value we assigned;
       if that is where the list is when the event arrives, the event is ours.

       Wall time, not the game clock: this has nothing to do with a round and
       must not freeze when one pauses. */
    const BOARD_IDLE_MS = 20000;
    const BOARD_SPEED = 14;             // px a second, about a name every 1.4s
    const BOARD_END_PAUSE_MS = 2200;

    const board = { idleAt: 0, at: 0, dir: 1, holdUntil: 0, lastSet: -1, running: false };

    function boardActivity() {
        board.idleAt = performance.now();
        board.running = false;
    }

    function watchBoardActivity() {
        const list = document.getElementById("ff-board-list");
        for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"]) {
            document.addEventListener(ev, boardActivity, { passive: true });
        }
        if (list) {
            list.addEventListener("scroll", () => {
                // Where we last put it? Then this is our own crawl arriving.
                if (Math.abs(list.scrollTop - board.lastSet) < 1.5) return;
                boardActivity();
            }, { passive: true });
        }
        board.idleAt = performance.now();
    }

    function stepBoard(wallNow) {
        const list = document.getElementById("ff-board-list");
        const box = document.getElementById("ff-board");
        if (!list || !box || box.hidden) return;

        // Only on the title screen, and only when there is something to scroll.
        const showing = !Editor && !game;
        const over = list.scrollHeight - list.clientHeight;
        if (!showing || over <= 1) { board.running = false; return; }

        if (!board.running) {
            if (wallNow - board.idleAt < BOARD_IDLE_MS) return;
            // Pick up from wherever the reader left it, and go the long way.
            board.at = list.scrollTop;
            board.dir = board.at >= over - 1 ? -1 : 1;
            board.holdUntil = 0;
            board.running = true;
            board.lastAt = wallNow;
        }

        const dt = Math.min(200, wallNow - (board.lastAt || wallNow));
        board.lastAt = wallNow;
        if (wallNow < board.holdUntil) return;

        board.at += board.dir * BOARD_SPEED * dt / 1000;
        if (board.at >= over) { board.at = over; board.dir = -1; board.holdUntil = wallNow + BOARD_END_PAUSE_MS; }
        else if (board.at <= 0) { board.at = 0; board.dir = 1; board.holdUntil = wallNow + BOARD_END_PAUSE_MS; }

        list.scrollTop = board.at;
        board.lastSet = list.scrollTop;   // as the browser rounded it
    }

    /* Send a finished run. Signed out is not an error — the endpoint says so
       and the page stays quiet about it, because nothing was promised. */
    /* POINTS ARE WHAT THE BOARD RANKS ON, so points are what it is sent.

       Levels and the clock still go with them and still matter — the server
       checks a claimed time against how fast the furni can physically fall,
       and a tie on points is broken by whoever was quicker. But the figure
       that orders the table is the one the player watched climb all run. */
    async function submitRun(levelsCleared) {
        if (!levelsCleared || !runStartedAt) return;
        const ms = Math.round(gameNow() - runStartedAt);
        const points = run ? run.score() : 0;
        try {
            const res = await fetch("/.netlify/functions/ff-scores", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ levels: levelsCleared, ms, points, habbo: state.name || null })
            });
            const data = await res.json().catch(() => ({}));
            if (data.recorded) {
                status(`On the board: ${points.toLocaleString()} points, ${levelsCleared} cleared in ${asClock(ms)}.`, "good");
                refreshBoard();
            } else if (data.reason === "signed-out") {
                status("Sign in with Discord to save runs to the leaderboard.", "bad");
            } else if (data.reason === "not-your-best" && data.best) {
                /* A run that did not beat your own said NOTHING, which reads
                   exactly like a leaderboard that failed to save. Say what is
                   still standing instead. */
                status(`Not your best — ${Number(data.best.points || 0).toLocaleString()} points still stands.`, "busy");
            }
        } catch { /* a leaderboard that will not save is not worth a scene */ }
    }

    /* ---- between rounds

       What just happened, held still, with one button to go on. Works for a
       run of published levels and for the builder testing a single level —
       the difference is only what the button then does. */
    function showRoundEnd(now) {
        const box = document.getElementById("ff-round");
        if (!box || !game) return;

        const won = game.state === Game.WON;
        const prog = game.progress();
        const level = run ? run.level() : (Editor ? Editor.state.level : null);
        const secs = (level && level.rules && level.rules.seconds) || 0;
        const left = game.secondsLeft(now);
        const hasNext = Boolean(run && won && run.index + 1 < run.levels.length);

        document.getElementById("ff-round-title").textContent =
            won ? "Round complete" : "Round over";
        document.getElementById("ff-round-why").textContent = game.message || "";

        /* Seconds TAKEN rather than left: "you did it in 12s" is the number a
           player repeats, and the penalty is called out separately because
           otherwise it silently inflates that time with no explanation. */
        const taken = Math.max(0, secs - left - game.penalty);
        const rows = [
            ["Level", (level && level.name) || "—"],
            ["Seats", `${prog.done} of ${prog.total}`],
            ["Time", `${taken.toFixed(1)}s of ${secs}s`]
        ];
        if (game.penalty) rows.push(["Penalties", `+${game.penalty}s`]);
        // What the clock itself was worth — shown on its own line so a fast
        // round can be seen to have paid for being fast.
        if (game.speed) rows.push(["Speed bonus", `+${game.speed.toLocaleString()}`]);
        /* Points, and the streak that earned them. The streak is shown even
           when it is short, because the number a player wants after a bad
           round is the one that tells them what went wrong — "best run: 3"
           after eleven seats says it plainly. */
        rows.push(["Points", (run ? run.score() : game.score).toLocaleString()]);
        if (game.best > 1) rows.push(["Best streak", `${game.best} in a row`]);
        if (run) rows.push(["Levels cleared", String(run.cleared())]);

        const dl = document.getElementById("ff-round-stats");
        dl.innerHTML = "";
        for (const [k, v] of rows) {
            const dt = document.createElement("dt"); dt.textContent = k;
            const dd = document.createElement("dd"); dd.textContent = v;
            dl.append(dt, dd);
        }

        const go = document.getElementById("ff-round-go");
        go.textContent = hasNext ? "Next level"
            : won ? (run ? "Finish the run" : "Play again")
                : (run ? "See how you did" : "Try again");
        box.dataset.outcome = won ? "won" : "lost";
        box.hidden = false;
    }

    const hideRoundEnd = () => {
        const box = document.getElementById("ff-round");
        if (box) box.hidden = true;
        roundEndedAt = 0;
    };

    /* ---- THE WHOLE RUN, level by level.

       A round's result cannot be recovered once the run has moved on — the
       score is folded into the bank and the next round is built over the top —
       so RoomGame.createRun freezes a summary as each one ends and this reads
       them back. Nothing is recomputed here.

       Every row is a level PLAYED. A run that fell over on level three has
       three rows, and the third is marked: "how far did I get" is the question
       this screen is answering, and an empty row for a level never reached
       would answer it worse than no row at all. */
    function showRunEnd(theRun, cleared) {
        const box = document.getElementById("ff-runend");
        if (!box || !theRun) return;
        const rows = theRun.results || [];

        document.getElementById("ff-runend-title").textContent =
            cleared ? "Run complete" : "Run over";
        box.dataset.outcome = cleared ? "won" : "lost";

        const last = rows[rows.length - 1];
        document.getElementById("ff-runend-why").textContent = cleared
            ? `All ${rows.length} ${rows.length === 1 ? "level" : "levels"} cleared.`
            : last
                ? `${last.name} — ${last.why === "poi" ? "the wrong chair entirely" : "out of time"}.`
                : "";

        const tbody = document.getElementById("ff-runend-rows");
        tbody.innerHTML = "";
        let seats = 0, seatsOf = 0, seconds = 0, points = 0, streak = 0;

        for (const r of rows) {
            seats += r.seats; seatsOf += r.seatsOf;
            seconds += r.seconds; points += r.points;
            if (r.streak > streak) streak = r.streak;

            const tr = document.createElement("tr");
            if (!r.won) tr.className = "is-lost";
            const cells = [
                r.name,
                `${r.seats}/${r.seatsOf}`,
                // The penalty is inside the clock either way; saying so is the
                // difference between "I was slow" and "I sat on the wrong one".
                r.penalty ? `${r.seconds.toFixed(1)}s +${r.penalty}s` : `${r.seconds.toFixed(1)}s`,
                r.streak > 1 ? String(r.streak) : "—",
                r.points.toLocaleString()
            ];
            cells.forEach((text, i) => {
                const cell = document.createElement(i === 0 ? "th" : "td");
                if (i === 0) cell.scope = "row";
                cell.textContent = text;
                tr.appendChild(cell);
            });
            tbody.appendChild(tr);
        }

        document.getElementById("ff-runend-seats").textContent = `${seats}/${seatsOf}`;
        document.getElementById("ff-runend-time").textContent = `${seconds.toFixed(1)}s`;
        document.getElementById("ff-runend-streak").textContent = streak > 1 ? String(streak) : "—";
        document.getElementById("ff-runend-points").textContent = points.toLocaleString();

        box.hidden = false;
    }

    function hideRunEndPanel() {
        const box = document.getElementById("ff-runend");
        if (box) box.hidden = true;
    }

    function hideRunEnd() {
        hideRunEndPanel();
        // Back to the hotel view; no room is kept behind the title.
        if (Lobby) Lobby.reset();
        showTitle();
        dirty = true;
    }

    /* The ONE place a run moves between levels.

       `game` is repointed at the run's new round. Missing that is what broke
       level two: `run.advance` builds the next game inside the run, and the
       page went on drawing and ticking the finished one. */
    function nextRound() {
        const now = gameNow();
        hideRoundEnd();

        if (!run) {
            // The builder testing one level, or a player replaying it.
            startRound().catch(e => status(`Could not start: ${e.message}`, "bad"));
            return;
        }

        const what = run.advance(now);
        if (what === "next") {
            game = run.game;
            beginLevel(run.level());
            status(run.progressLabel(), "good");
        } else {
            const cleared = run.cleared();
            if (what === "finished") status("Every round cleared.", "good");
            else status("Run over.", "bad");
            submitRun(cleared);
            /* The breakdown is shown BEFORE the run is thrown away — it is the
               only thing holding the per-round summaries. The title screen
               comes back when the player closes it. */
            showRunEnd(run, what === "finished");
            game = null; run = null;
        }
        renderHud(now);
        dirty = true;
    }

    /* ---- LOADING A ROOM, the way the client does.

       hh_room.cct puts up `room_loader.window` — a small box holding
       `gen_loaderbar` and `general_loader_text`, the text being "Loading room"
       — while the room's casts come down, and takes it away when they are
       there. Ours has the same job and the same shape: the pieces of the level
       are already requested, and this waits for them with something to look at
       rather than letting the room fill in under the player.

       THE CLOCK DOES NOT RUN WHILE IT IS UP. `loading` freezes the tick the
       same way a hidden tab does, and the time spent is added to `pausedFor`
       afterwards, so a round that took two seconds to load still starts with
       its full time on it. Both halves are needed: without the freeze the
       first furni falls behind the loader; without the pause the round is
       short by however long the load took. */
    let loading = false;

    const loaderEls = {};

    function roomLoader(on, fraction) {
        if (!loaderEls.root) {
            loaderEls.root = document.getElementById("ff-loader");
            loaderEls.fill = document.getElementById("ff-loader-fill");
            loaderEls.text = document.getElementById("ff-loader-text");
        }
        if (!loaderEls.root) return;
        loaderEls.root.hidden = !on;
        if (loaderEls.fill) {
            loaderEls.fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction || 0)) * 100)}%`;
        }
    }

    /* The bar has to be honest AND it has to move, and those pull opposite
       ways. Three terms settle it:

         ready   how many of the room's sprites are actually in
         paced   elapsed against a typical load, so a slow one still creeps
                 rather than sitting at whatever fraction arrived first
         sweep   elapsed against the minimum dwell, which CAPS the other two

       The cap is the part worth having. Coming back to a room whose furni is
       already in memory, `ready` is 1 on the first frame, and a bar that hits
       100% in 70ms and then sits there for the rest of the dwell reads as a
       flicker rather than a load. Capping it makes the bar fill over the
       dwell, and it still cannot reach the end before the room really is
       there, because `ready` holds it back when there is something to wait
       for. */
    const LOADER_MIN_MS = 420;          // long enough to read, short enough not to grate
    const LOADER_PACE_MS = 1400;

    async function loadRoom() {
        const started = performance.now();
        /* A tab already hidden when this begins: close that span here so the
           two pauses MEET rather than overlap. From this line the freeze is
           the loader's, and it runs to the bottom of this function. */
        if (hiddenAt) { pauseSpanEnd(hiddenAt); hiddenAt = 0; }
        loading = true;
        roomLoader(true, 0);

        const urls = spriteUrlsInRoom();
        const ready = () => urls.length
            ? urls.filter(u => { const s = Furni.sprite(u); return s.ready || s.failed; }).length / urls.length
            : 1;

        await new Promise((resolve) => {
            const step = () => {
                const elapsed = performance.now() - started;
                const paced = Math.min(0.95, elapsed / LOADER_PACE_MS);
                const sweep = Math.min(1, elapsed / LOADER_MIN_MS);
                roomLoader(true, Math.min(Math.max(ready(), paced), sweep));
                if (ready() >= 1 && elapsed >= LOADER_MIN_MS) { resolve(); return; }
                if (elapsed > 4000) { resolve(); return; }
                setTimeout(step, 40);
            };
            step();
        });

        roomLoader(true, 1);
        roomLoader(false, 1);

        /* THE COUNT-IN RUNS INSIDE THE SAME FREEZE as the loader.

           `loading` stays true across it and `pausedFor` is added once at the
           end, so three seconds of counting costs the round nothing — the same
           accounting the loader already needed, for the same reason. Doing it
           after the unfreeze would start the clock and drop the first furni
           behind the number.

           ONE PAINT FIRST, by hand. `loading` returns out of `tick` before
           anything is drawn, which the loader could afford because its panel
           covers the canvas — the count cannot, because the room behind it is
           the entire point. Without this the numbers land over whatever the
           canvas last held, which on the first level of a run is the hotel
           view you just pressed Play on. */
        dirty = true;
        draw(gameNow());
        await countIn();

        loading = false;
        pauseSpanEnd(started);
        /* Still hidden — the player switched away while it loaded. Open a
           fresh span from here so the tab's own freeze carries on, rather
           than leaving the round running unwatched. */
        hiddenAt = document.hidden ? performance.now() : 0;
        lastPaint = 0;
        dirty = true;
    }

    /* Three, two, one — over a room that is already drawn and standing still.

       That is the whole point of it. The level's furni, its walls and the
       avatar's starting tile are all up, and the count is the moment you get
       to look at them before the first piece falls. It is not a loading
       screen; the loading already happened. */
    const COUNT_MS = 700;

    function countIn() {
        const root = document.getElementById("ff-countin");
        const n = document.getElementById("ff-countin-n");
        if (!root || !n) return Promise.resolve();

        const beats = ["3", "2", "1", "Go"];
        return new Promise((resolve) => {
            let i = 0;
            root.hidden = false;
            const step = () => {
                if (i >= beats.length) {
                    root.hidden = true;
                    resolve();
                    return;
                }
                const word = beats[i++];
                n.textContent = word;
                n.classList.toggle("is-go", word === "Go");
                /* Restarting the animation needs the element out of the
                   document's animation list and back in; toggling the class
                   alone re-uses the running one and the second number does not
                   move. */
                n.style.animation = "none";
                void n.offsetWidth;
                n.style.animation = "";
                setTimeout(step, word === "Go" ? COUNT_MS * 0.7 : COUNT_MS);
            };
            step();
        });
    }

    // Every part file the room is currently waiting on.
    function spriteUrlsInRoom() {
        const urls = [];
        for (const f of state.furni) {
            const parts = Furni.partsOf(f, gameNow());
            if (parts) for (const p of parts) urls.push(p.url);
            else if (f.url) urls.push(f.url);
        }
        return urls;
    }

    // Resolve once every sprite the room wants has loaded, or after `ms`.
    function waitForSprites(ms) {
        /* Every PART's url, not the piece's — a furni in the library is drawn
           from several files and the room is only finished when they have all
           arrived. */
        const urls = [];
        for (const f of state.furni) {
            const parts = Furni.partsOf(f, gameNow());
            if (parts) for (const p of parts) urls.push(p.url);
            else if (f.url) urls.push(f.url);
        }
        if (!urls.length) return Promise.resolve();
        return new Promise((resolve) => {
            const started = performance.now();
            const check = () => {
                const pending = urls.some(u => {
                    const s = Furni.sprite(u);
                    return !s.ready && !s.failed;
                });
                if (!pending || performance.now() - started > ms) resolve();
                else setTimeout(check, 60);
            };
            check();
        });
    }

    /* Put the player and the room where the level says, clear the readout, and
       put the room loader up while the level's furni arrives.

       Not awaited: `loadRoom` sets its own flag synchronously, so the round is
       frozen from this line onwards and unfreezes itself when the room is
       there. The builder is spared it — they are testing the same level over
       and over with everything already in memory, and half a second of
       "Loading room" each time is friction rather than atmosphere. */
    function beginLevel(level) {
        // Position AND facing: see showStart.
        showStart(level);
        Object.assign(state, Levels.toRoomOpts(level));
        applyLayout(state.model);
        syncPickers();
        state.furni = game.renderList();
        refreshBlocked();
        dirty = true;
        /* NOT AWAITED, so a throw inside it becomes an unhandled rejection
           and the freeze it set is never lifted: `loading` stays true, the
           tick returns before drawing anything, and the game sits on "Loading
           room" for ever with nothing in the console. That is exactly what a
           stray `now` in spriteUrlsInRoom did, and the fault was invisible
           because the only symptom was a loader that never went away.

           A room that failed to preload is still a playable room — the
           sprites arrive as they arrive — so this unfreezes and says so
           rather than leaving the game bricked. */
        if (!Editor) {
            loadRoom().catch((e) => {
                console.error("Fallin' Furni: the room loader failed", e);
                loading = false;
                roomLoader(false, 1);
                lastPaint = 0;
                dirty = true;
                status("The room did not finish loading — playing anyway.", "bad");
            });
        }
    }


    /* In the builder, Start plays the level being edited — that is the point of
       having the button there. For a player it starts the RUN: the published
       levels in order, each one a round, dropping faster and landing further
       away as they go. */
    async function startRound() {
        hideRoundEnd();
        hideRunEndPanel();
        resetHud();
        if (Editor) {
            const level = currentLevel();
            /* Counted through Levels, not off a `drops` array — the flat list
               that used to be there became `zones` and this line went on
               reading a property that no longer existed, so Play threw inside
               an async handler and looked simply dead. */
            if (!Levels.totalDrops(level)) {
                status("Nothing falls yet — draw a drop zone and add some furni to it.", "bad");
                setMode("zones");
                return;
            }
            run = null;
            game = Game.createGame(level, gameOpts());
            game.start(gameNow());
            beginLevel(level);
            /* Worth saying before the round rather than after it: these pieces
               will fall and block and never be part of the sequence, which
               looks like the game losing track of them. */
            const miscast = Levels.miscastItems(level, metaFor);
            if (miscast.length) {
                const n = miscast.reduce((sum, m) => sum + m.item.count, 0);
                status(`Round started — but ${n} falling ${n === 1 ? "piece has" : "pieces have"} a seat role and cannot be sat on. ${n === 1 ? "It" : "They"} will behave as obstacles.`, "bad");
            } else {
                status("Round started.", "good");
            }
            return;
        }

        /* Already loaded by `prepare` at page load, so this does not touch the
           network — the room behind the title screen IS the first level. Only
           a reload that somehow raced it falls back to fetching here. */
        if (!published) {
            status("Loading levels…", "busy");
            published = await Levels.fetchPublished();
            if (published.length) furniLoaded = loadLevelFurni(published);
        }
        // See `furniLoaded`: the levels being in says nothing about the
        // furnidata, and a round built without it drops chairs that are not
        // seats. Costs nothing once it has settled.
        if (furniLoaded) await furniLoaded;
        if (!published.length) {
            status("No levels have been published yet.", "bad");
            showTitle();
            return;
        }
        hideTitle();
        runStartedAt = gameNow();
        run = Game.createRun(published, gameOpts());
        game = run.startRound(gameNow());
        beginLevel(run.level());
        status(run.progressLabel(), "good");
    }

    function stopRound() {
        hideRoundEnd();
        if (game) game.stop();
        game = null; run = null;
        if (Editor) syncEditor();
        else {
            // Back to the title, which is the hotel view rather than a room.
            if (Lobby) Lobby.reset();
            showTitle();
        }
        resetHud();
        renderHud(gameNow());
        dirty = true;
    }

    async function init() {
        /* FIRST, before anything is read, drawn or fetched. A visitor asking
           for the editor is either an owner or is shown the door — there is no
           state in which the page has started loading builder content and then
           discovers it should not have. */
        if (EDITING) {
            const verdict = await admitEditor();
            if (!verdict.ok) { refuseEditor(verdict); return; }
            Editor = window.RoomEditor || null;
        }

        canvas = document.getElementById("ff-canvas");
        if (!canvas) return;
        /* The builder and the player each have their own line for messages.
           Chosen by which of them we ARE, not by which element exists: the
           editor's panel is only hidden for a player, never removed, so a
           plain `||` sent every message a player should see — "No levels have
           been published yet" among them — into an invisible aside. */
        statusEl = document.getElementById(Editor ? "ff-status" : "ff-play-status")
            || document.getElementById("ff-status");
        canvas.width = Iso.WIDTH;
        canvas.height = Iso.HEIGHT;
        ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        restore();
        Iso.preloadStencils(() => { dirty = true; });
        if (!Editor) { document.body.classList.remove("is-editing"); setHint(null); }

        canvas.addEventListener("mousemove", (ev) => {
            const t = pointerTile(ev);
            const changed = (!!t !== !!state.hover) ||
                (t && state.hover && (t.x !== state.hover.x || t.y !== state.hover.y));
            if (changed) { state.hover = t; dirty = true; }
            if (t && dragFrom) extendDrag(t);
            // Drag to paint a run of tiles. `walkPaint` is fixed for the whole
            // drag, so dragging back over a tile does not undo it.
            if (t && walkDragging && Editor && Editor.state.mode === "walk") {
                paintWalkable(t, walkPaint);
            }
            /* NO CURSOR IS SET HERE. This used to write a `pointer` inline
               whenever the mouse was over a tile, which is what a web page
               does over something clickable and is not what a Habbo room
               does: the room keeps the plain arrow and says what is under the
               pointer with the tile outline instead. The inline style also
               beat the stylesheet, so the rule on #ff-canvas never got a look
               in. The builder still wants a pointer, and asks for it in
               css/fallinfurni.css under body.is-editing. */
        });
        canvas.addEventListener("mouseleave", () => { state.hover = null; endDrag(); dirty = true; });

        // Dragging draws a zone, and only in zone mode — no modifier to guess.
        canvas.addEventListener("mousedown", (ev) => {
            if (!Editor) return;
            if (game && game.state === Game.RUNNING) return;
            if (Editor.state.mode === "walk") { walkDragging = true; return; }
            if (Editor.state.mode !== "zones") return;
            const t = pointerTile(ev);
            if (t) beginDrag(t);
        });
        window.addEventListener("mouseup", () => { walkDragging = false; endDrag(); });

        canvas.addEventListener("click", (ev) => {
            const t = pointerTile(ev);
            if (!t) return;
            const playing = game && game.state === Game.RUNNING;
            if (Editor && !playing) { editorClick(t, ev); return; }
            walkTo(t.x, t.y);
        });

        refreshFloorSwatches = buildPicker("floors", "ff-floor-pattern", "ff-floor-colours", "floorPattern", "floorColour");
        refreshWallSwatches = buildPicker("walls", "ff-wall-pattern", "ff-wall-colours", "wallPattern", "wallColour");

        /* The layout picker. Filled from RoomLayouts rather than from a list
           written out here, so adding a model to the extractor's SHIP list is
           the only edit needed to offer it. */
        const layoutSel = document.getElementById("ff-layout");
        if (layoutSel && window.RoomLayouts) {
            for (const m of window.RoomLayouts.MODELS) {
                const opt = document.createElement("option");
                opt.value = m.id;
                opt.textContent = `${m.name} — ${m.cols}×${m.rows}`;
                layoutSel.appendChild(opt);
            }
            layoutSel.value = state.model;
            layoutSel.addEventListener("change", () => setLayoutFromPicker(layoutSel.value));
        }

        const startBtn = document.getElementById("ff-start-pick");
        if (startBtn) startBtn.addEventListener("click", () => {
            pickingStart = !pickingStart;
            /* Arming this puts the room in one mode for one click, so anything
               else that was armed is stood down — two armed tools waiting for
               the same click is how a click does the wrong one. */
            if (pickingStart) {
                moving = false;
                status("Click the tile the player should start on.", "busy");
            }
            syncPickers();
            dirty = true;
        });

        const dirSel = document.getElementById("ff-start-dir");
        if (dirSel) dirSel.addEventListener("change", () => setStartDir(dirSel.value));

        const walkAdd = document.getElementById("ff-walk-add");
        if (walkAdd) walkAdd.addEventListener("click", () => { walkPaint = !walkPaint; renderWalkPanel(); });

        const walkReset = document.getElementById("ff-walk-reset");
        if (walkReset) walkReset.addEventListener("click", () => {
            const layout = Iso.layout;
            const src = window.RoomPublic && window.RoomPublic.get(layout && layout.id);
            if (!src || !src.derived) { status("Nothing to go back to.", "bad"); return; }
            layout.mask = src.derived.slice();
            layout.tiles = layout.mask.join("").split("").filter(c => c !== "x").length;
            renderWalkPanel();
            refreshBlocked();
            status("Back to the grid guessed from the artwork.", "good");
            dirty = true;
        });

        /* COPIED AS THE FILE IT GOES IN, not as a bare grid. The thing that
           makes a mask useless is being one row out, so what lands on the
           clipboard is the whole entry with the room's id on it, ready to drop
           into js/room-masks.js with nothing to retype. */
        const walkCopy = document.getElementById("ff-walk-copy");
        if (walkCopy) walkCopy.addEventListener("click", async () => {
            const layout = Iso.layout;
            if (!layout || !layout.painted) return;
            const text = `        ${layout.id}: [\n` +
                layout.mask.map(r => `            ${JSON.stringify(r)},`).join("\n") +
                `\n        ],\n`;
            const note = document.getElementById("ff-walk-note");
            try {
                await navigator.clipboard.writeText(text);
                status(`Copied — ${layout.tiles} tiles. Paste it into js/room-masks.js.`, "good");
            } catch {
                // A clipboard a browser will not give up is not a dead end.
                if (note) note.textContent = "Could not reach the clipboard — it is in the console instead.";
                status("Copy blocked; written to the console.", "bad");
            }
            console.log("RoomMasks entry for " + layout.id + ":\n" + text);
        });

        /* WHAT DOES THIS GRID ACTUALLY PLAY LIKE. The two things a painted
           mask gets wrong are islands nobody can reach and tiles that look
           walkable and are not, and both are invisible until somebody plays
           it. This says so before it ships. */
        const walkCheck = document.getElementById("ff-walk-check");
        if (walkCheck) walkCheck.addEventListener("click", () => {
            const layout = Iso.layout;
            const note = document.getElementById("ff-walk-note");
            if (!layout || !layout.painted || !note) return;
            const L = window.RoomLayouts;
            const tiles = L.tileList(layout);
            if (!tiles.length) { note.textContent = "No walkable tiles at all."; return; }
            const start = (Editor && Editor.state.level && Editor.state.level.start) || tiles[0];
            const from = Iso.has(start.x, start.y) ? start : tiles[0];
            const seen = window.RoomDrop.reachableFrom(from, new Set());
            const cut = tiles.filter(t => !seen.has(Iso.key(t.x, t.y)));
            note.textContent = cut.length
                ? `${cut.length} of ${tiles.length} tiles cannot be reached from the start ` +
                  `(${from.x},${from.y}) — e.g. ${cut.slice(0, 4).map(t => t.x + "," + t.y).join("  ")}`
                : `All ${tiles.length} tiles reachable from the start (${from.x},${from.y}).`;
            status(cut.length ? "Some tiles are cut off." : "Every tile is reachable.",
                cut.length ? "bad" : "good");
        });

        const nameInput = document.getElementById("ff-name");
        if (state.name) nameInput.value = state.name;
        /* One button, one action. The name is looked up and the round starts
           — asking someone to press Load and then hunt for Play is two steps
           where the player only ever wanted one. An empty name plays as the
           default figure rather than refusing. */
        document.getElementById("ff-name-form").addEventListener("submit", async (ev) => {
            ev.preventDefault();
            const play = document.getElementById("ff-title-play");
            if (play) play.disabled = true;
            try {
                if (nameInput.value.trim()) await lookup(nameInput.value);
                await startRound();
            } catch (e) {
                status(`Could not start: ${e.message}`, "bad");
            } finally {
                if (play) play.disabled = false;
            }
        });

        /* startRound is async, so a throw inside it becomes an unhandled
           rejection and the button just appears to do nothing. Say so instead. */
        document.getElementById("ff-start").addEventListener("click", () => {
            startRound().catch((e) => status(`Could not start: ${e.message}`, "bad"));
        });
        document.getElementById("ff-stop").addEventListener("click", stopRound);

        document.getElementById("ff-round-go").addEventListener("click", nextRound);
        document.getElementById("ff-runend-close").addEventListener("click", hideRunEnd);
        document.getElementById("ff-runend-again").addEventListener("click", () => {
            hideRunEnd();
            startRound().catch(e => status(`Could not start: ${e.message}`, "bad"));
        });
        document.getElementById("ff-round-quit").addEventListener("click", () => {
            // Abandoning a run still records how far it got — including the
            // round just won, which `run.index` has not counted yet.
            if (run) submitRun(run.cleared());
            hideRoundEnd();
            stopRound();
        });

        const guideBox = document.getElementById("ff-guides");
        if (guideBox) guideBox.addEventListener("change", () => {
            guides = guideBox.checked;
            dirty = true;
        });

        if (Editor) initEditor();

        /* ?debug=1 exposes the live round, read-only, for checking the game
           from the console — which round is running, what has landed, which
           seat is wanted next. Opt-in and never present otherwise: the run is
           built inside RoomGame.createRun, so there is no way to reach it from
           outside, and "play it and watch" is not a test. */
        if (new URLSearchParams(location.search).has("debug")) {
            window.FallinFurni = {
                get game() { return game; },
                get run() { return run; },
                get state() { return state; },
                nextRound,
                /* Walk speed, live. Lower is faster; the limbs follow because
                   the cycle is one stride per tile. Tell me the number that
                   matches Habbo and it becomes the default. */
                get walkMs() { return WALK_MS; },
                /* The wait between sitting and the seat counting. Same reason
                   as walkMs: the right number is the one that feels right, and
                   that is found by trying them. */
                get acceptMs() { return ACCEPT_MS; },
                setAcceptMs(ms) {
                    const n = Number(ms);
                    if (Number.isFinite(n) && n >= 0 && n <= 1500) ACCEPT_MS = n;
                    return ACCEPT_MS;
                },
                get walkFrameMs() { return WALK_FRAME_MS; },
                /* Whether the room loader has the paint loop frozen. Exposed
                   because a stuck `loading` looks exactly like a dead game —
                   no repaint, no readout, no error — and there is otherwise
                   no way to tell it from one. */
                get loading() { return loading; },
                setWalkMs(ms) {
                    const n = Number(ms);
                    if (Number.isFinite(n) && n >= 80 && n <= 2000) WALK_MS = n;
                    return WALK_MS;
                }
            };
        }

        preload(state.figure);
        // The hotel view and the furni that falls past it, before anything
        // else — it is the first thing on screen. Which furni is a site
        // setting the builder picks; until it answers, the game's own default
        // pair is what falls, so the title screen is never empty waiting.
        if (Lobby && !Editor) {
            Lobby.preload(() => { dirty = true; });
            loadLobbyFurni();
        }
        if (state.name) lookup(state.name);
        watchBoardActivity();
        watchVisibility();
        requestAnimationFrame(tick);

        /* A player's room is built now, not when they press Play. Deliberately
           not awaited: the loop is already painting, so the room appears
           behind the title as its pieces arrive. */
        if (!Editor) prepare();
    }

    // init is async now (it may have to ask the server who you are), so its
    // failures would otherwise vanish into an unhandled rejection.
    const start = () => init().catch((e) => {
        console.error("Fallin' Furni failed to start:", e);
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();

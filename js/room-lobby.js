/* The title screen's backdrop: the Habbo hotel views, with furni falling past
   them.

   ----------------------------------------------------------------------
   Why not the room

   The title used to sit over the first published level, which meant the game
   showed you its answer before you pressed Play — and, worse, a room that
   looked identical whichever level you were about to get. The hotel view is
   where Habbo puts you before you are anywhere, so it is where this belongs.

   ----------------------------------------------------------------------
   Three hotels, not one

   Habbo Origins ships a different entry screen per hotel, and all three are
   worth seeing: the US tower in its grey city, the Spanish one above a
   fountain and a hillside, the Brazilian one on a beach. Each holds for
   HOLD_MS and then crossfades into the next, so the front page is never the
   same picture for long. tools/hotel-view-extract.js composes all three from
   the client's own layers, letterbox bars and all.

   ----------------------------------------------------------------------
   What falls

   Thrones and Club sofas — the two most Habbo pieces of furniture there are,
   and red-gold and green against the city.

   They come from two different places, which is worth knowing before
   wondering why there are two drawing paths here:

     throne      the CLIENT'S own artwork, out of js/furni-library.js, drawn
                 in parts by the same code the room uses. It was missing from
                 this game until now — it names palette member 0, the movie's
                 own, and the furni extractor threw away every sprite whose
                 palette it could not find. See `macPalette` in
                 tools/furni-extract.js.

     club_sofa   a flat PNG per rotation in assets/img/lobby/, from
                 FurniIndex. This client ships only the sofa's 30x26 catalogue
                 icon, `club_sofa_small` — there is no full-size artwork for
                 it in any cast. Nothing in the GAME uses these images; they
                 are decoration on the front page, where a picture is all that
                 is needed.

   ----------------------------------------------------------------------
   The trail

   Drawn on a second canvas that is FADED rather than cleared: each frame the
   trail layer loses a fraction of its alpha, then this frame's pieces are
   stamped into it at a low opacity. The result is a soft smear a few frames
   long behind each piece, which reads as motion at these speeds — a 20px-a-
   second fall is otherwise so nearly still that it looks like a static
   picture with a bug in it.

   The fade is measured in TIME, not frames. Fading by a fixed fraction per
   frame ties the trail's length to the frame rate, so it stretched out on a
   slow machine and vanished on a fast one — the two places you least want the
   look of the title screen to change. */
(function () {
    "use strict";

    const Iso = window.RoomIso;
    const Furni = window.RoomFurni;

    /* THE HOTELS — ES, BR and UK — each in two pictures and a glow.

       Three of the five the client ships, by choice. Which three is
       tools/hotel-view-extract.js's VIEWS list and nothing here: this file
       cycles whatever js/hotel-views.js was generated with, in the order it
       finds them, so adding US or RU back is a line in that tool.

       `<key>-back.png` is the sky, `<key>-front.png` is everything built on
       the ground, and `<key>-glow.png` is the client's own `light1` — an
       ADDITIVE lamp over the whole picture, drawn last.

       THE GLOW IS NOT DECORATION, it is what makes the sky look like a sky.
       Each of these three paints its sky as two flat rectangles of slightly
       different blue side by side; on their own they leave a hard vertical
       seam straight down the picture. The client never shows that seam
       because light1 is laid over the top of it. Leaving light1 out — which
       this did — was therefore not "skipping a subtle effect", it was leaving
       in a visible join.

       THE CLOUDS ARE GONE. The client drifts six of them between the sky and
       the towers, and theirs were measured off the running client rather than
       guessed: 12 px/s to the right and 6 down, every cloud on the same step,
       one plane scrolling along the same isometric axis the streets run on.
       Matched to that, behind that skyline, in the eight seconds a hotel is
       up, they are invisible. They cost a layer, a per-frame step and a pile
       of sprites for something nobody can see, so the artwork stays in
       assets/img/hotel/ and nothing draws it. */
    const HOTELS = (window.HotelViews && window.HotelViews.views) || [];
    const HOTEL_DIR = (window.HotelViews && window.HotelViews.dir) || "assets/img/hotel/";
    const VIEWS = HOTELS.map(v => v.key);

    const HOLD_MS = 8000;            // how long each hotel is up, fade included
    const FADE_MS = 1100;            // the crossfade at the end of that

    /* WHAT FALLS IS A SETTING, with these two as the default.

       The builder picks it in the level editor's Splash tab and it is stored
       site-wide (settings.lobbyFurni) rather than per level, because the
       title screen is not a level. An empty setting — which is what a site
       that has never touched it has — means this pair.

       A name resolves one of two ways, and the order matters: the client's
       own artwork out of js/furni-library.js if it is there, and otherwise
       one of the flat picture sets below. `club_sofa` has no library entry
       at all — this client ships only its 30x26 catalogue icon — so the
       pictures are the only way it can appear. */
    const DEFAULT_FURNI = ["throne", "club_sofa"];

    const IMAGE_ONLY = {
        club_sofa: [
            "assets/img/lobby/club-sofa-1.png",
            "assets/img/lobby/club-sofa-2.png",
            "assets/img/lobby/club-sofa-3.png",
            "assets/img/lobby/club-sofa-4.png"
        ]
    };

    let chosen = DEFAULT_FURNI.slice();

    /* NOTHING EVER OVERLAPS, and it is the LANES that guarantee it rather
       than a collision test.

       Furni here only ever moves straight down, so two pieces can only ever
       meet if they share horizontal space. Give each piece a column of its own
       and the question cannot arise — no test, no jitter in the answer, and no
       frame where two sofas are briefly the same sofa.

       Two rules do the whole job:

         ACROSS lanes   a lane is at least as wide as the widest thing that can
                        fall, so a piece placed inside its lane cannot reach
                        into the next one. Each piece is jittered within
                        whatever width its own sprite leaves spare, so the
                        columns do not read as a grid.

         WITHIN a lane  ONE piece at a time. A lane takes nothing new until
                        what it is carrying has left the bottom of the screen,
                        so two pieces in a column can never meet however
                        differently they fall — which in turn lets every piece
                        have its own speed.

       AND THEY ENTER ONE AT A TIME. That is a separate rule from the two
       above, and it is what makes the fall look random rather than shed.
       Lanes running independently will, by chance, start two or three pieces
       across the top within the same second, and pieces that enter together
       at similar speeds stay abreast the whole way down — a rank of furniture
       descending in step, which reads as choreography.

       So entry is a single queue: one piece enters, then nothing else for
       ENTRY_MIN..ENTRY_MAX, and the lane it enters by is picked at random from
       whichever are free. Nothing ever shares an entry moment, and the
       staggering compounds as the pieces spread out at their own speeds.

       The alternative, scattering pieces at random and rejecting overlaps, is
       what was here before in spirit: it clustered, because uniform random
       points cluster, and that is exactly the look this replaces. */
    const MAX_W = 114;               // the club sofa, the widest that falls
    const MAX_H = 91;                // the throne facing 2, the tallest
    const LANE_GAP = 12;             // clear air between neighbouring columns

    const SPEED_MIN = 14;            // px per second
    const SPEED_MAX = 30;
    const ENTRY_MIN_MS = 2200;       // never two pieces over the top together
    const ENTRY_MAX_MS = 5200;
    const TRAIL_ALPHA = 0.22;        // how strongly a frame stamps the trail
    const TRAIL_HALFLIFE = 260;      // ms for the trail to lose half its alpha

    const images = new Map();        // src -> HTMLImageElement
    let trail = null, trailCtx = null;
    let lanes = [];
    let nextEntryAt = 0;
    let lastAt = 0, startedAt = 0;
    let onReady = null;

    function image(src) {
        let img = images.get(src);
        if (!img) {
            img = new Image();
            img.onload = () => { if (onReady) onReady(); };
            img.src = src;
            images.set(src, img);
        }
        return img;
    }

    const ready = (img) => !!(img && img.complete && img.naturalWidth);
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    // Which of the furni classes this build actually has artwork for.
    /* The chosen names, split into the two things the stamper can draw and
       with anything it cannot draw at all quietly dropped. A class that has
       lost its artwork should leave a smaller shower, not a red marker on the
       front page. */
    function pool() {
        const lib = window.FurniLibrary || {};
        const out = [];
        for (const name of chosen) {
            if (lib[name]) out.push({ kind: "furni", className: name });
            else if (IMAGE_ONLY[name]) out.push({ kind: "image", set: IMAGE_ONLY[name] });
        }
        return out;
    }

    // Just the library ones, for preloading.
    const classes = () => pool().filter(p => p.kind === "furni").map(p => p.className);

    /* Set from the site's settings; see DEFAULT_FURNI. Anything the game
       cannot draw is kept in the list but ignored by `pool`, so a name that
       comes back later starts working again on its own. */
    function setFurni(list) {
        const next = (Array.isArray(list) ? list : [])
            .map(n => String(n || "").trim())
            .filter(Boolean);
        chosen = next.length ? next.slice(0, 10) : DEFAULT_FURNI.slice();
        reset();
        return chosen.slice();
    }

    /* One falling thing. `x` and `y` are where its TILE would be, so a library
       piece can be drawn by the same code the room uses — translate the
       context and let Furni.draw put the sprite on the tile it thinks it is
       standing on. A flat image is placed to match: bottom-centre on the same
       point, which is where a furni's artwork sits over its tile.

       `left` and `right` are how far the artwork reaches either side of that
       point, which is what the lane placement needs and what the two kinds
       disagree about: an image is centred on it, while a furni's box hangs
       from its own anchor and can sit well off to one side. */
    function makeItem() {
        const lib = window.FurniLibrary || {};

        // Even-handed between everything the builder has chosen.
        const choices = pool();
        if (!choices.length) return null;
        const choice = pick(choices);

        if (choice.kind === "furni") {
            const entry = lib[choice.className] || {};
            const rotations = Math.max(1, Furni.rotationsOf(choice.className) || 1);
            const piece = Furni.make(choice.className, 0, 0, {
                meta: { x: entry.x || 1, y: entry.y || 1 },
                rotation: Math.floor(Math.random() * rotations),
                state: 0, role: "decor"
            });
            piece.url = null;
            /* Where the artwork sits relative to the tile: room-furni draws a
               piece's box from home.sx - HALF_W - ax, and a mirrored rotation
               reflects INSIDE that same box, so this holds either way. */
            const a = Furni.anchor(piece);
            const w = a && a.box ? a.box.w : Iso.TILE_W;
            const h = a && a.box ? a.box.h : Iso.TILE_H;
            const left = -Iso.HALF_W - (a ? a.ax : 0);
            const top = -(a ? a.ay : 0);
            return { kind: "furni", piece, left, right: left + w, top, bottom: top + h };
        }

        const src = pick(choice.set);
        const img = image(src);
        const w = ready(img) ? img.naturalWidth : MAX_W;
        const h = ready(img) ? img.naturalHeight : MAX_H;
        return { kind: "image", src, left: -w / 2, right: w / 2, top: Iso.HALF_H - h, bottom: Iso.HALF_H };
    }

    // An item's rectangle on screen, which is what "never overlap" is about.
    const boxOf = (p) => ({
        x0: p.x + p.left, x1: p.x + p.right,
        y0: p.y + p.top, y1: p.y + p.bottom
    });

    // Put an item somewhere in its lane, using whatever width it leaves spare.
    function placeInLane(item, lane) {
        const w = item.right - item.left;
        const slack = Math.max(0, lane.span - w - 2);
        const offset = rand(-slack / 2, slack / 2);
        item.x = Math.round(lane.cx + offset - (item.left + item.right) / 2);
    }

    /* Lay out the columns. Every lane is at least MAX_W wide, so a piece
       inside one can never reach into another.

       The opening screenful is SEEDED rather than waited for — a title screen
       that begins bare and fills over the next half minute is a title screen
       nobody sees full. Each lane starts with one piece already on its way
       down, at its own height and its own speed, and from then on entries come
       through the one-at-a-time queue. */
    function reset() {
        const laneW = MAX_W + LANE_GAP;
        const count = Math.max(1, Math.floor(Iso.WIDTH / laneW));
        const span = Iso.WIDTH / count;

        lanes = [];
        for (let i = 0; i < count; i++) {
            const lane = { cx: (i + 0.5) * span, span, item: null, speed: 0 };
            const item = makeItem();
            if (item) {
                lane.item = item;
                lane.speed = rand(SPEED_MIN, SPEED_MAX);
                item.y = rand(-MAX_H, Iso.HEIGHT - MAX_H);
                placeInLane(item, lane);
            }
            lanes.push(lane);
        }

        nextEntryAt = 0;
        if (trailCtx) trailCtx.clearRect(0, 0, Iso.WIDTH, Iso.HEIGHT);
        lastAt = 0;
        startedAt = 0;
    }

    /* Let one piece in, if it is time and there is a lane free. One piece, and
       one only — the gap to the next is rolled here, so two can never begin
       together no matter how many lanes happen to be empty. */
    function admit(now) {
        if (now < nextEntryAt) return;
        const free = lanes.filter(l => !l.item);
        if (!free.length) return;
        const lane = pick(free);
        const item = makeItem();
        if (!item) return;
        lane.item = item;
        lane.speed = rand(SPEED_MIN, SPEED_MAX);
        item.y = -item.bottom;               // its foot level with the top edge
        placeInLane(item, lane);
        nextEntryAt = now + rand(ENTRY_MIN_MS, ENTRY_MAX_MS);
    }

    function ensureTrail() {
        if (trail) return;
        trail = document.createElement("canvas");
        trail.width = Iso.WIDTH;
        trail.height = Iso.HEIGHT;
        trailCtx = trail.getContext("2d");
        trailCtx.imageSmoothingEnabled = false;
    }

    const HOME = () => Iso.tileCenter(0, 0);

    function stamp(ctx, p) {
        if (p.kind === "furni") {
            const home = HOME();
            ctx.save();
            ctx.translate(Math.round(p.x - home.sx), Math.round(p.y - home.sy));
            Furni.draw(ctx, p.piece);
            ctx.restore();
            return;
        }
        const img = image(p.src);
        if (!ready(img)) return;
        ctx.drawImage(img,
            Math.round(p.x - img.naturalWidth / 2),
            Math.round(p.y + Iso.HALF_H - img.naturalHeight));
    }

    /* WHICH HOTEL IS UP, and how far into the change to the next. Worked out
       from the elapsed time rather than counted, so a frame dropped anywhere
       cannot put the cycle out of step with itself. */
    function cycle(now) {
        if (!startedAt) startedAt = now;
        const elapsed = now - startedAt;
        const n = Math.max(1, VIEWS.length);
        const i = Math.floor(elapsed / HOLD_MS) % n;
        const into = elapsed % HOLD_MS;
        const fade = into > HOLD_MS - FADE_MS ? (into - (HOLD_MS - FADE_MS)) / FADE_MS : 0;
        return { from: VIEWS[i], to: VIEWS[(i + 1) % n], fade };
    }

    /* One hotel, whole: sky, then everything built on the ground, then the
       glow over the lot.

       Composited into a buffer rather than straight onto the stage because the
       crossfade has to fade the FINISHED picture — fading the layers
       separately would let the outgoing hotel show through the incoming sky,
       and "lighter" over a half-faded hotel is not a crossfade of anything. */
    let hotelBuf = null, hotelCtx = null;

    function compose(key) {
        if (!hotelBuf) {
            hotelBuf = document.createElement("canvas");
            hotelBuf.width = Iso.WIDTH;
            hotelBuf.height = Iso.HEIGHT;
            hotelCtx = hotelBuf.getContext("2d");
            hotelCtx.imageSmoothingEnabled = false;
        }
        const back = image(HOTEL_DIR + key + "-back.png");
        const front = image(HOTEL_DIR + key + "-front.png");
        if (ready(back)) hotelCtx.drawImage(back, 0, 0);
        else { hotelCtx.fillStyle = "#84cce8"; hotelCtx.fillRect(0, 0, Iso.WIDTH, Iso.HEIGHT); }

        if (ready(front)) hotelCtx.drawImage(front, 0, 0);

        /* light1, additive. "lighter" is canvas's add: black adds nothing, so
           the glow's own falloff does the work and the parts of the picture it
           does not reach are left exactly as they were. */
        const glow = image(HOTEL_DIR + key + "-glow.png");
        if (ready(glow)) {
            hotelCtx.save();
            hotelCtx.globalCompositeOperation = "lighter";
            hotelCtx.drawImage(glow, 0, 0);
            hotelCtx.restore();
        }
        return hotelBuf;
    }

    function draw(ctx, now) {
        ctx.imageSmoothingEnabled = false;

        const { from, to, fade } = cycle(now);
        if (from) ctx.drawImage(compose(from), 0, 0);
        else { ctx.fillStyle = "#84cce8"; ctx.fillRect(0, 0, Iso.WIDTH, Iso.HEIGHT); }

        if (fade > 0 && to && to !== from) {
            ctx.save();
            ctx.globalAlpha = fade;
            ctx.drawImage(compose(to), 0, 0);
            ctx.restore();
        }

        if (!lanes.length) reset();
        ensureTrail();

        const dt = lastAt ? Math.min(120, now - lastAt) : 0;
        lastAt = now;

        for (const lane of lanes) {
            if (!lane.item) continue;
            lane.item.y += lane.speed * dt / 1000;
            // Its top edge past the bottom of the stage: gone, and the lane is
            // free for whatever the queue sends next.
            if (lane.item.y + lane.item.top > Iso.HEIGHT) lane.item = null;
        }
        admit(now);

        // Fade what is already on the trail layer, by time rather than frames.
        if (dt > 0) {
            const keep = Math.pow(0.5, dt / TRAIL_HALFLIFE);
            trailCtx.save();
            trailCtx.globalCompositeOperation = "destination-out";
            trailCtx.fillStyle = `rgba(0,0,0,${(1 - keep).toFixed(4)})`;
            trailCtx.fillRect(0, 0, Iso.WIDTH, Iso.HEIGHT);
            trailCtx.restore();
        }

        trailCtx.save();
        trailCtx.globalAlpha = TRAIL_ALPHA;
        for (const lane of lanes) if (lane.item) stamp(trailCtx, lane.item);
        trailCtx.restore();

        ctx.drawImage(trail, 0, 0);
        for (const lane of lanes) if (lane.item) stamp(ctx, lane.item);
    }

    // Warm every backdrop and every falling thing; `cb` fires as each arrives.
    function preload(cb) {
        onReady = cb;
        for (const key of VIEWS) {
            image(HOTEL_DIR + key + "-back.png");
            image(HOTEL_DIR + key + "-front.png");
            image(HOTEL_DIR + key + "-glow.png");
        }
        for (const p of pool()) if (p.kind === "image") for (const src of p.set) image(src);
        for (const className of classes()) {
            const piece = Furni.make(className, 0, 0, { meta: {}, rotation: 0, state: 0 });
            for (let r = 0; r < Math.max(1, Furni.rotationsOf(className) || 1); r++) {
                const turned = { ...piece, rotation: r };
                const parts = Furni.partsOf(turned);
                if (parts) for (const part of parts) Furni.sprite(part.url);
            }
        }
    }

    window.RoomLobby = {
        draw, reset, preload, VIEWS, HOLD_MS, FADE_MS,
        setFurni, DEFAULT_FURNI, IMAGE_ONLY, MAX_FURNI: 10,
        get furni() { return chosen.slice(); },
        /* Read-only, and there so that "nothing overlaps" can be CHECKED
           rather than judged from a screenshot: one still frame proves very
           little about a system whose whole risk is two things drifting into
           each other over half a minute. */
        get lanes() { return lanes; },
        boxOf
    };
})();

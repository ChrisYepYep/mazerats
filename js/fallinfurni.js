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

    /* Milliseconds to cross one tile. Habbo walks at half a second a tile —
       one step of the four-frame cycle in animation.xml every 125ms — and 430
       read as very slightly hurried against it. A diagonal step covers more
       screen than a straight one in the same time, which is why diagonals feel
       faster in Habbo too; that is the real behaviour, not a bug to even out. */
    const WALK_MS = 500;
    const WALK_FRAMES = 4;          // the walk cycle, as animation.xml defines it

    /* The imaging service returns size=l at 128x220, DOUBLE the 64x110 the
       64x32 grid is drawn against — measured, not assumed. */
    const SPRITE_SCALE = 0.5;
    const FOOT_PAD = 11;            // feet above the sprite's own bottom edge

    const DEFAULT_FIGURE = "hd-180-1.ch-210-66.lg-270-82.sh-290-80.hr-100-61";
    const STORE_KEY = "mazerats_ff_room_v2";

    const state = {
        floorPattern: "plain", floorColour: null,
        wallPattern: "plain", wallColour: null,
        figure: DEFAULT_FIGURE,
        name: "",
        pos: { x: 3, y: 6 },
        dir: 2,
        path: [],
        stepFrom: null,
        stepAt: 0,
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
                figure, size: "l",
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

    let blockedTiles = new Set();
    function refreshBlocked() {
        blockedTiles = game && game.state === Game.RUNNING
            ? game.blocked()
            : Furni.blockedTiles(state.furni);
    }
    function blocked(x, y) { return blockedTiles.has(y * Iso.COLS + x); }

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
               entry for. */
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
        /* One full cycle per tile, so the stride matches the ground covered.
           Because a tile is exactly one cycle, each step picking up at frame 0
           already continues the gait — no phase to carry between tiles. */
        const frame = Math.min(WALK_FRAMES - 1, Math.floor(t * WALK_FRAMES));
        return {
            sx: a.sx + (b.sx - a.sx) * t,
            sy: a.sy + (b.sy - a.sy) * t,
            action: "wlk",
            frame,
            dir: state.dir
        };
    }

    function beginStep(now) {
        const next = state.path.shift();
        state.stepFrom = { x: state.pos.x, y: state.pos.y };
        state.pos = { x: next.x, y: next.y };
        state.dir = next.dir;
        state.stepAt = now;
        dirty = true;
    }

    function walkTo(x, y) {
        const route = Path.findPath(state.pos, { x, y }, blocked);
        if (!route || !route.length) return;
        state.path = route;
        if (!state.stepFrom) beginStep(gameNow());
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

    function paintScene(ctx2, now) {
        const at = avatarAt(now);
        const pieces = Furni.sorted(state.furni).map(f => ({
            key: Furni.depthOf(f, 0), draw: () => Furni.draw(ctx2, f)
        }));

        const tile = state.stepFrom ? state.pos : state.pos;
        pieces.push({
            key: (tile.x + tile.y) * 10000 + 5000,
            draw: () => {
                const sprite = avatarSprite(state.figure, at.dir, at.action, at.frame);
                if (!sprite.ready) return;
                const img = sprite.img;
                const w = Math.round(img.naturalWidth * SPRITE_SCALE);
                const h = Math.round(img.naturalHeight * SPRITE_SCALE);
                const dx = Math.round(at.sx - w / 2), dy = Math.round(at.sy - h + FOOT_PAD);
                ctx2.drawImage(img, dx, dy, w, h);
                drawEyeAccessory(ctx2, state.figure, at.dir, dx, dy, w / FIGURE_W);
            }
        });

        pieces.sort((a, b) => a.key - b.key);
        for (const p of pieces) p.draw();
    }

    function draw(now) {
        Iso.drawRoom(ctx, state);

        paintScene(ctx, now);

        /* The seat wanted next, outlined OVER the scene rather than under it.
           Drawn first it lands beneath the very furni it is pointing at, which
           is where it cannot be seen — and this is the one thing on screen the
           player has to be able to find. A 1px outline over a chair reads
           perfectly well and hides nothing that matters. */
        if (game && game.state === Game.RUNNING) {
            const next = game.nextSeat();
            if (next) Furni.outline(ctx, next, "#40ff80");
        }

        /* The editor's overlays — drop areas, selection, the placement ghost —
           are builder's furniture and have no business in a running round.
           They stay off while the game is playing even in the builder's view,
           or the room fills with rectangles at exactly the moment the player
           needs to read where things landed. */
        const playing = game && game.state === Game.RUNNING;
        if (Editor && !playing) Editor.drawOverlay(ctx, state.hover);
        else if (state.hover) Iso.highlight(ctx, state.hover.x, state.hover.y, "#ffff00");

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

    function watchVisibility() {
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                hiddenAt = performance.now();
                return;
            }
            if (hiddenAt) {
                pausedFor += performance.now() - hiddenAt;
                hiddenAt = 0;
            }
            lastPaint = 0;      // paint the first frame back immediately
            dirty = true;
        });
    }

    function tick() {
        requestAnimationFrame(tick);
        /* Hidden means frozen. Returning before anything is read keeps a
           stray frame — some browsers still fire one occasionally — from
           advancing a round nobody is watching. */
        if (document.hidden) return;

        const now = gameNow();
        if (now - lastPaint < FRAME_MS) return;
        lastPaint = now;

        if (game && game.state === Game.RUNNING) {
            if (game.tick(now, state.pos)) {
                state.furni = game.renderList();
                refreshBlocked();
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
            // Arriving somewhere is what the game reacts to.
            if (game && game.state === Game.RUNNING) {
                const what = game.arrivedAt(state.pos, now);
                if (what) { renderHud(now); dirty = true; }
            }
            if (state.path.length) beginStep(now);
            dirty = true;
        }
        if (state.stepFrom) dirty = true;
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
            rules: "Set the clock and how hard this round should be."
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
    let hudLast = { clock: "", total: -1, done: -1, msg: "", hidden: null };

    function renderHud(now) {
        if (!hudEls.root) {
            hudEls.root = document.getElementById("ff-hud");
            hudEls.clock = document.getElementById("ff-clock");
            hudEls.seq = document.getElementById("ff-seq");
            hudEls.msg = document.getElementById("ff-msg");
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

        const msg = game.state === Game.WON ? "Every seat, in order — round complete." : game.message;
        if (msg !== hudLast.msg) { hudEls.msg.textContent = msg; hudLast.msg = msg; }
    }

    // A new round starts from a blank readout rather than the last one's.
    function resetHud() {
        if (hudEls.seq) hudEls.seq.innerHTML = "";
        hudEls.pips = [];
        hudLast = { clock: "", total: -1, done: -1, msg: "", hidden: null };
    }

    // ---- editor glue

    /* What a click on the room means depends on the mode, which is the point of
       having modes: in Decorate it places or selects furni, in Drop zones it
       picks the zone you clicked inside, and elsewhere it does nothing. */
    function editorClick(t, ev) {
        const mode = Editor.state.mode;

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

    function syncEditor() {
        state.furni = Editor.state.placed;
        refreshBlocked();
        Object.assign(state, Levels.toRoomOpts(Editor.state.level));
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
        for (const r of Editor.search(query.value, 24)) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "ff-furni" + (current === r.className ? " is-on" : "");
            b.title = `${r.name} — ${r.w}x${r.h}${r.sit ? ", seat" : ""}, ${r.rotations} rotation${r.rotations === 1 ? "" : "s"}`;
            b.innerHTML = `<img src="${r.icon}" alt=""><span>${r.name}</span>` +
                (r.sit ? '<em class="ff-seat">seat</em>' : "");
            b.addEventListener("click", () => onPick(r.className));
            list.appendChild(b);
        }
    }

    function renderEditorPanel() {
        if (!Editor || !Editor.state.level) return;
        const sel = Editor.state.selected;
        const rots = sel ? Editor.rotationCount(sel.className) : 0;

        renderPicker("ff-furni-list", "ff-furni-q", Editor.state.brush, (cls) => {
            Editor.state.brush = Editor.state.brush === cls ? null : cls;
            Editor.state.selected = null;
            renderEditorPanel();
            dirty = true;
        });
        renderPicker("ff-drop-list", "ff-drop-q", dropBrush, (cls) => {
            dropBrush = dropBrush === cls ? null : cls;
            renderEditorPanel();
        });

        document.getElementById("ff-sel").textContent = sel
            ? `${sel.name} — ${sel.w}x${sel.h} at ${sel.x},${sel.y}` +
            (rots > 1 ? ` · rotation ${sel.rotation + 1}/${rots}` : " · does not turn")
            : "Nothing selected.";
        if (!sel) moving = false;            // nothing to move
        const moveBtn = document.getElementById("ff-move");
        moveBtn.disabled = !sel;
        moveBtn.classList.toggle("is-armed", moving);
        moveBtn.textContent = moving ? "Click a tile…" : "Move";
        document.getElementById("ff-rotate").disabled = !sel || rots < 2;
        document.getElementById("ff-delete").disabled = !sel;

        renderZones();
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
            const label = (Editor.metaFor(it.className) || {}).n || it.className;
            row.innerHTML = `<span>${it.count}× ${label}</span>` +
                `<em>${Levels.ROLE_LABELS[it.role] || it.role}</em>`;
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
                if (!Editor.rotateSelected()) status("It will not turn there.", "bad");
                else status("", "");
                ev.preventDefault();
            }
            if (ev.key === "Delete" || ev.key === "Backspace") { Editor.deleteSelected(); ev.preventDefault(); }
            if (ev.key === "Escape") { Editor.state.brush = null; renderEditorPanel(); dirty = true; }
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

        // Modes.
        for (const b of document.querySelectorAll("#ff-modes button")) {
            b.addEventListener("click", () => setMode(b.dataset.mode));
        }

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
        if (f) f.value = state.floorPattern;
        if (w) w.value = state.wallPattern;
        if (refreshFloorSwatches) refreshFloorSwatches();
        if (refreshWallSwatches) refreshWallSwatches();
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
        return Iso.tileAt(px, py);
    }

    // ---- play

    function currentLevel() {
        if (Editor && Editor.state.level) return Editor.save();
        return Levels.normalise({ ...Levels.fromRoomOpts(state) }, Iso.COLS, Iso.ROWS);
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

    /* The first level, dressed but not running: its floor, its wallpaper, its
       decor, and the avatar standing where the level starts. No round, no
       clock, nothing falling. */
    function previewLevel(level) {
        state.pos = { x: level.start.x, y: level.start.y };
        state.path = []; state.stepFrom = null;
        Object.assign(state, Levels.toRoomOpts(level));
        state.furni = (level.decor || []).map(d => Furni.make(d.className, d.x, d.y, {
            meta: metaFor(d.className), rotation: d.rotation, state: d.state,
            ...urlFor(d.className, d.state, d.rotation), role: "decor"
        }));
        refreshBlocked();
        dirty = true;
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
        await loadLevelFurni(published);

        previewLevel(published[0]);
        /* Give the sprites a moment to arrive so the first paint is the
           finished room rather than an empty floor that fills in. They are
           already requested; this only waits for them. */
        await waitForSprites(1200);
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
            for (const row of (data.top || []).slice(0, 8)) {
                const li = document.createElement("li");
                li.innerHTML = `<span>${escapeText(row.name)}</span>` +
                    `<em>${row.levels} ${row.levels === 1 ? "level" : "levels"} · ${asClock(row.ms)}</em>`;
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

    /* Send a finished run. Signed out is not an error — the endpoint says so
       and the page stays quiet about it, because nothing was promised. */
    async function submitRun(levelsCleared) {
        if (!levelsCleared || !runStartedAt) return;
        const ms = Math.round(gameNow() - runStartedAt);
        try {
            const res = await fetch("/.netlify/functions/ff-scores", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ levels: levelsCleared, ms, habbo: state.name || null })
            });
            const data = await res.json().catch(() => ({}));
            if (data.recorded) {
                status(`On the board: ${levelsCleared} cleared in ${asClock(ms)}.`, "good");
                refreshBoard();
            } else if (data.reason === "signed-out") {
                status("Sign in with Discord to save runs to the leaderboard.", "bad");
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
        if (run) rows.push(["Levels cleared", String(run.index + (won ? 1 : 0))]);

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
            const cleared = run.index;
            if (what === "finished") status("Every round cleared.", "good");
            else status("Run over.", "bad");
            submitRun(cleared);
            game = null; run = null;
            if (published && published.length) previewLevel(published[0]);
            showTitle();
        }
        renderHud(now);
        dirty = true;
    }

    // Resolve once every sprite the room wants has loaded, or after `ms`.
    function waitForSprites(ms) {
        const urls = state.furni.map(f => f.url).filter(Boolean);
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

    // Put the player and the room where the level says, and clear the readout.
    function beginLevel(level) {
        state.pos = { x: level.start.x, y: level.start.y };
        state.path = []; state.stepFrom = null;
        Object.assign(state, Levels.toRoomOpts(level));
        syncPickers();
        state.furni = game.renderList();
        refreshBlocked();
        dirty = true;
    }


    /* In the builder, Start plays the level being edited — that is the point of
       having the button there. For a player it starts the RUN: the published
       levels in order, each one a round, dropping faster and landing further
       away as they go. */
    async function startRound() {
        hideRoundEnd();
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
            status("Round started.", "good");
            return;
        }

        /* Already loaded by `prepare` at page load, so this does not touch the
           network — the room behind the title screen IS the first level. Only
           a reload that somehow raced it falls back to fetching here. */
        if (!published) {
            status("Loading levels…", "busy");
            published = await Levels.fetchPublished();
            if (published.length) await loadLevelFurni(published);
        }
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
            // Back to the title, over the first level again.
            if (published && published.length) previewLevel(published[0]);
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
            canvas.style.cursor = t ? "pointer" : "default";
        });
        canvas.addEventListener("mouseleave", () => { state.hover = null; endDrag(); dirty = true; });

        // Dragging draws a zone, and only in zone mode — no modifier to guess.
        canvas.addEventListener("mousedown", (ev) => {
            if (!Editor || Editor.state.mode !== "zones") return;
            if (game && game.state === Game.RUNNING) return;
            const t = pointerTile(ev);
            if (t) beginDrag(t);
        });
        window.addEventListener("mouseup", endDrag);

        canvas.addEventListener("click", (ev) => {
            const t = pointerTile(ev);
            if (!t) return;
            const playing = game && game.state === Game.RUNNING;
            if (Editor && !playing) { editorClick(t, ev); return; }
            walkTo(t.x, t.y);
        });

        refreshFloorSwatches = buildPicker("floors", "ff-floor-pattern", "ff-floor-colours", "floorPattern", "floorColour");
        refreshWallSwatches = buildPicker("walls", "ff-wall-pattern", "ff-wall-colours", "wallPattern", "wallColour");

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
        document.getElementById("ff-round-quit").addEventListener("click", () => {
            // Abandoning a run still records how far it got.
            if (run) submitRun(run.index);
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
                nextRound
            };
        }

        preload(state.figure);
        if (state.name) lookup(state.name);
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

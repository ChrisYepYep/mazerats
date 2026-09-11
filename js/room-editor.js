/* The level editor: placing furni in the room, turning it, and saying what
   falls from the ceiling.

   This is a BUILDER'S tool, not part of the game. It loads on /fallinfurni?edit=1
   and nothing about it ships to a player — a published level carries only the
   handful of furni actually placed in it, already resolved. Kept in its own
   file for exactly that reason: the game never loads this.

   ----------------------------------------------------------------------
   Two sources, joined here

   Artwork comes from FurniIndex (`furni-catalogue`, with ?sprites=1 for the
   [state][rotation] grids). Footprint and whether a thing is a seat come from
   Habbo's furnidata (`furni-meta`). They join on className. Roughly 1,100 of
   the catalogue's 1,283 items match; the rest are wall items, which this game
   does not place on the floor.

   ----------------------------------------------------------------------
   Rotation

   A furni turns through however many rotations its artwork actually has — one,
   two or four, and 239 items in the catalogue have exactly one and cannot turn.
   Turning swaps the footprint on odd rotations (see RoomFurni.footprint), so a
   two-seater lying along one axis blocks the other two tiles once turned. A
   turn that would not fit is refused rather than allowed to overlap. */
(function () {
    "use strict";

    const Iso = window.RoomIso;
    const Furni = window.RoomFurni;
    const Levels = window.RoomLevels;

    const STORE_KEY = "mazerats_ff_level_v1";

    const state = {
        level: null,
        placed: [],             // RoomFurni pieces, mirroring level.decor
        catalogue: new Map(),   // className -> catalogue row (with sprite grids)
        meta: {},               // className -> furnidata record
        brush: null,            // the furni about to be placed
        selected: null,         // the placed piece under edit
        mode: "room",           // room | decor | zones | rules
        zoneId: null,           // the zone being edited
        area: null,             // rectangle being dragged
        ready: false
    };

    let onChange = () => { };

    // ---- data

    /* Which image to draw for a rotation, and whether it has to be flipped.

       FurniIndex publish one image per bitmap in the client. Where Habbo gets
       a rotation by mirroring, they have usually published that mirrored image
       too — a dining chair has all four — and those must be drawn as they come.
       Where they have not, the rotation exists in the game all the same, and we
       make it by flipping the image of the rotation it mirrors.

       Which one does it mirror? The cycle runs out and back — direction 0,
       direction 2, direction 2 flipped, direction 0 flipped — so rotation r
       mirrors rotation (cycle length - 1 - r). */
    function spriteFor(className, stateIndex, rotation) {
        /* The library first: it knows which direction this rotation is and
           has a file for exactly that direction, so image and anchor match by
           construction. Everything below is the fallback for the handful of
           classes it does not carry. */
        const own = Furni.librarySprite(className, stateIndex || 0, rotation || 0);
        if (own) return own;

        const row = state.catalogue.get(className);
        if (!row) return { url: null, flip: false };
        const grid = row.largeImages || [];
        const states = grid[Math.min(stateIndex || 0, grid.length - 1)] || [];
        if (!states.length) return { url: null, flip: false };

        const r = rotation || 0;
        if (r < states.length) return { url: states[r], flip: false };

        const cycle = Furni.rotationsOf(className) || states.length;
        const mirrored = cycle - 1 - r;
        if (mirrored >= 0 && mirrored < states.length) {
            return { url: states[mirrored], flip: true };
        }
        return { url: states[states.length - 1] || states[0], flip: false };
    }

    // Kept for callers that only want the picture (the furni picker's icons).
    function spriteUrl(className, stateIndex, rotation) {
        return spriteFor(className, stateIndex, rotation).url;
    }

    /* How many ways this furni can be turned.

       The client is asked first. FurniIndex publish one image per bitmap the
       client ships, but Habbo draws half its rotations by mirroring, so their
       count is an undercount for anything that turns that way — the Corner
       plinth reads as one rotation there and has two in the game. Falling back
       to their count only when the client has nothing keeps the pieces that
       are not in this build working as before. */
    /* WHICH STATES THIS FURNI HAS — the client's word for "on".

       A lamp off and a lamp on are one class with two sets of members, and
       the same mechanism runs a fireplace through eleven frames and
       gothiccandelabra through seven. The list is the state NUMBERS rather
       than a count, because a class need not number them 0..n.

       The client's own artwork answers first. Anything it does not carry
       falls back to the catalogue, where a state is a row of the image grid. */
    function stateList(className) {
        const fromClient = Furni.statesOf(className);
        if (fromClient.length) return fromClient;
        const row = state.catalogue.get(className);
        const grid = (row && row.largeImages) || [];
        return grid.length ? grid.map((_, i) => i) : [0];
    }

    /* Step the held furni to its next state and wrap. One button does both
       halves of a two-state toggle and cycles anything longer. */
    function cycleBrushState() {
        if (!state.brush) return 0;
        const list = stateList(state.brush);
        const at = Math.max(0, list.indexOf(brush.state));
        brush.state = list[(at + 1) % list.length];
        onChange();
        return brush.state;
    }

    /* The same for a piece already down. Geometry cannot change — a lamp that
       is on stands exactly where it stood — so this needs no fits() test, only
       the artwork for the new state. */
    function cycleSelectedState() {
        const f = state.selected;
        if (!f) return false;
        const list = stateList(f.className);
        if (list.length < 2) return false;
        const at = Math.max(0, list.indexOf(f.state || 0));
        const next = list[(at + 1) % list.length];
        Object.assign(f, { state: next }, spriteFor(f.className, next, f.rotation || 0));
        commit();
        return true;
    }

    function rotationCount(className) {
        const fromClient = Furni.rotationsOf(className);
        if (fromClient) return fromClient;
        const row = state.catalogue.get(className);
        if (!row) return 1;
        const grid = row.largeImages || [];
        return Math.max(1, (grid[0] || []).length);
    }

    function metaFor(className) { return state.meta[className] || {}; }

    async function load() {
        const [cat, meta] = await Promise.all([
            fetch("/.netlify/functions/furni-catalogue?sprites=1").then(r => r.json()),
            fetch("/.netlify/functions/furni-meta").then(r => r.json())
        ]);
        state.catalogue = new Map((cat.items || []).map(i => [i.className, i]));
        state.meta = meta.items || {};
        state.ready = true;
        return { catalogue: state.catalogue.size, meta: Object.keys(state.meta).length };
    }

    /* Only furni this editor can actually place: it needs artwork AND a
       furnidata record, because without the latter there is no footprint and no
       way to know whether it is a seat. */
    function search(query, limit) {
        const q = (query || "").trim().toLowerCase();
        const out = [];
        for (const [className, row] of state.catalogue) {
            const m = state.meta[className];
            if (!m) continue;
            if (!(row.largeImages || []).length) continue;
            const name = (row.name || "").toLowerCase();
            const cls = className.toLowerCase().replace(/_/g, " ");
            if (q && !name.includes(q) && !cls.includes(q)) continue;
            out.push({
                className, name: row.name || className, icon: row.icon,
                sit: !!m.sit, w: m.x, h: m.y, rotations: rotationCount(className)
            });
            if (out.length >= (limit || 40)) break;
        }
        return out;
    }

    // ---- level

    function setLevel(level) {
        state.level = Levels.normalise(level || {}, Iso.COLS, Iso.ROWS);
        rebuild();
    }

    // Turn level.decor into live pieces (and back again on save).
    function rebuild() {
        state.placed = (state.level.decor || []).map(d => Furni.make(d.className, d.x, d.y, {
            meta: metaFor(d.className), rotation: d.rotation, state: d.state,
            lift: Levels.height(d.z), role: "decor",
            ...spriteFor(d.className, d.state, d.rotation)
        }));
        state.selected = null;
        onChange();
    }

    function commit() {
        state.level.decor = state.placed.map(f => ({
            className: f.className, x: f.x, y: f.y,
            rotation: f.rotation, state: f.state, z: Levels.height(f.lift)
        }));
        onChange();
    }

    // ---- editing

    /* PLACING WORKS THE WAY IT DOES IN THE GAME: the piece you are holding
       keeps its rotation and its height from one placement to the next, and
       you see it under the pointer before you commit to it — `ghost()` below
       is what the room draws.

       In Habbo you pick an item, it follows the mouse as a translucent copy,
       you turn it while it is still in your hand, and only the click puts it
       down. Before this, the editor showed a coloured outline of the
       footprint and nothing else, so you were placing a sofa blind and finding
       out which way it faced afterwards. */
    const brush = { rotation: 0, lift: 0, state: 0 };

    // The piece the brush would place at this tile, placed or not.
    function ghost(x, y) {
        if (!state.brush) return null;
        const meta = metaFor(state.brush);
        const piece = Furni.make(state.brush, x, y, {
            meta, rotation: brush.rotation, state: brush.state, lift: brush.lift,
            role: "decor", ...spriteFor(state.brush, brush.state, brush.rotation)
        });
        piece.ok = Furni.fits(state.placed, piece, null, true);
        return piece;
    }

    function place(x, y) {
        const piece = ghost(x, y);
        if (!piece || !piece.ok) return null;
        delete piece.ok;
        state.placed.push(piece);
        state.selected = piece;
        commit();
        return piece;
    }

    // Turn what is in your hand, before it is put down.
    function rotateBrush() {
        if (!state.brush) return 0;
        const n = rotationCount(state.brush);
        brush.rotation = n < 2 ? 0 : (brush.rotation + 1) % n;
        onChange();
        return brush.rotation;
    }

    function setBrushLift(z) {
        brush.lift = Levels.height(z);
        onChange();
        return brush.lift;
    }

    /* A brush is picked up fresh: rotation back to zero, height kept, because
       height is a setting you are working at and rotation belongs to the item.
       Habbo does the same — a run of chairs all face the way you last turned
       one, but picking a different item starts it square. */
    function setBrush(className) {
        state.brush = className || null;
        brush.rotation = 0;
        brush.state = 0;
        state.selected = null;
        onChange();
        return state.brush;
    }

    function selectAt(x, y) {
        state.selected = Furni.anyAt(state.placed, x, y);
        onChange();
        return state.selected;
    }

    function moveSelected(x, y) {
        const f = state.selected;
        if (!f) return false;
        const moved = { ...f, x, y };
        if (!Furni.fits(state.placed, moved, f, true)) return false;
        f.x = x; f.y = y;
        commit();
        return true;
    }

    /* ---- PRECISE MOVE, which is Habbo's own "Advanced" furni tool.

       hh_room.cct builds a window titled "Precise Move" whose help line reads
       "Edit exact floor position and height." and which holds three fields —
       Floor X, Floor Y, Height — each with a decrement and an increment
       button. Reading its bytecode gives the steps exactly: the X and Y
       buttons push integers, the Height buttons push 0.1, and
       normalizeAdvancedAltitudeText formats whatever you type to three
       decimal places. A bad value puts "Invalid values." in the status line
       rather than moving anything.

       It also PREVIEWS. openAdvancedFurniEditor remembers the piece's
       original location, previewAdvancedFurniEditor applies the typed values
       to the real object as you type, and restoreAdvancedFurniPreview puts it
       back if you cancel. That is worth copying rather than showing a separate
       ghost: you judge a height by looking at the room, not at a number. */

    let preciseOriginal = null;         // {piece, x, y, lift}

    function beginPrecise() {
        const f = state.selected;
        if (!f) return null;
        preciseOriginal = { piece: f, x: f.x, y: f.y, lift: f.lift || 0 };
        return { x: f.x, y: f.y, z: f.lift || 0 };
    }

    /* Apply values to the live piece without committing them, so the room
       shows the move while the dialog is open. Returns whether they are
       legal; an illegal set is still shown, because seeing WHY it is refused
       is the point. */
    function previewPrecise(x, y, z) {
        const f = preciseOriginal && preciseOriginal.piece;
        if (!f) return false;
        const fp = { ...f, x, y, lift: Levels.height(z) };
        f.x = x; f.y = y; f.lift = fp.lift;
        onChange();
        return Furni.fits(state.placed, fp, f, true);
    }

    function cancelPrecise() {
        const o = preciseOriginal;
        preciseOriginal = null;
        if (!o) return;
        o.piece.x = o.x; o.piece.y = o.y; o.piece.lift = o.lift;
        onChange();
    }

    function savePrecise(x, y, z) {
        const f = preciseOriginal && preciseOriginal.piece;
        if (!f) return false;
        const lift = Levels.height(z);
        if (!Furni.fits(state.placed, { ...f, x, y, lift }, f, true)) {
            cancelPrecise();
            return false;
        }
        f.x = x; f.y = y; f.lift = lift;
        preciseOriginal = null;
        commit();
        return true;
    }

    /* Turn the selected piece. Refused — not forced — when the turned
       footprint would not fit, because silently leaving it overlapping is
       worse than the turn not happening. */
    function rotateSelected() {
        const f = state.selected;
        if (!f) return false;
        const n = rotationCount(f.className);
        if (n < 2) return false;                    // this furni does not turn
        const turned = Furni.rotate(f, n, spriteFor);
        if (!Furni.fits(state.placed, turned, f, true)) return false;
        Object.assign(f, turned);
        commit();
        return true;
    }

    function deleteSelected() {
        const i = state.placed.indexOf(state.selected);
        if (i === -1) return false;
        state.placed.splice(i, 1);
        state.selected = null;
        commit();
        return true;
    }

    // ---- drop zones

    /* Whether a class can actually be used: it needs a furnidata record (for
       its footprint and whether it is a seat) AND artwork. Both, or it lands
       in the room as a red marker — see drawMissing in room-furni.js. */
    function playable(className) {
        return !!state.meta[className] && !!spriteUrl(className, 0, 0);
    }

    /* ---- zones

       A zone is an AREA and, separately, the items that fall into it. The two
       are edited independently on purpose: redrawing the rectangle should not
       disturb what rains into it, and adding a chair should not make you draw
       the rectangle again. */

    function addZone(area) {
        const z = Levels.blankZone(Iso.COLS, Iso.ROWS, area);
        z.name = `Zone ${state.level.zones.length + 1}`;
        state.level.zones.push(z);
        state.level = Levels.normalise(state.level, Iso.COLS, Iso.ROWS);
        state.zoneId = state.level.zones[state.level.zones.length - 1].id;
        onChange();
        return zone();
    }

    function zone() {
        return (state.level.zones || []).find(z => z.id === state.zoneId) || null;
    }

    function selectZone(id) { state.zoneId = id; onChange(); }

    function removeZone(id) {
        const i = state.level.zones.findIndex(z => z.id === id);
        if (i === -1) return;
        state.level.zones.splice(i, 1);
        if (state.zoneId === id) state.zoneId = null;
        onChange();
    }

    // Redraw a zone's rectangle, leaving its contents alone.
    function setZoneArea(id, area) {
        const z = (state.level.zones || []).find(x => x.id === id);
        if (!z) return;
        z.area = area;
        state.level = Levels.normalise(state.level, Iso.COLS, Iso.ROWS);
        state.zoneId = id;
        onChange();
    }

    function renameZone(id, name) {
        const z = (state.level.zones || []).find(x => x.id === id);
        if (!z) return;
        z.name = String(name || "").slice(0, 40);
        onChange();
    }

    /* Add something that falls into the selected zone. Refused rather than
       added when the class has no artwork — a piece the player cannot see is,
       for a poi chair, a game that cheats. */
    function addItem(className, role, count) {
        const z = zone();
        if (!z || !playable(className)) return null;
        z.items.push({ ...Levels.ITEM_DEFAULTS, className, role, count });
        state.level = Levels.normalise(state.level, Iso.COLS, Iso.ROWS);
        state.zoneId = z.id;
        onChange();
        return true;
    }

    function removeItem(index) {
        const z = zone();
        if (!z) return;
        z.items.splice(index, 1);
        onChange();
    }

    // ---- room settings, which belong to the level

    function setRoom(opts) {
        Object.assign(state.level, Levels.fromRoomOpts(opts));
        onChange();
    }

    // ---- persistence

    function save() {
        commit();
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state.level)); } catch { }
        return state.level;
    }

    function restore() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) { setLevel(JSON.parse(raw)); return true; }
        } catch { }
        setLevel({});
        return false;
    }

    /* Throw the working draft away.

       The draft in localStorage is what survives a reload, so clearing the
       level without clearing that would hand the scrapped work straight back
       on the next visit. Both go, together. */
    function discardDraft() {
        try { localStorage.removeItem(STORE_KEY); } catch { }
    }

    /* ---- the server copy

       localStorage is the working draft: it survives a reload and nothing
       more. These put a level where the game can actually find it, through the
       same admin session the rest of the site writes with — the token comes
       from wherever the admin page keeps it, and a level saved without one is
       refused by the endpoint rather than half-written.

       `published` is a separate flag from "saved", so a level can be worked on
       in place without appearing in a player's run halfway through. */
    /* The SAME token the admin page issues and the same header every other
       function on this site is read through — see js/api.js and
       netlify/functions/_auth.js, which looks at "x-admin-token" and nothing
       else. This sent "Authorization: Bearer <token>" instead, so a perfectly
       good session was found in storage, attached to the request, and then
       ignored by the server: signing in never carried across to the editor.

       One key, one header, both borrowed rather than invented. A guessed
       spelling is what caused this. */
    const TOKEN_KEY = "mazerats_admin_token";

    function authToken() {
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
    }

    function authHeaders() {
        const token = authToken();
        return token ? { "x-admin-token": token } : {};
    }

    async function listServer(all) {
        const res = await fetch("/.netlify/functions/ff-levels" + (all ? "?all=1" : ""), {
            headers: all ? authHeaders() : {}
        });
        if (!res.ok) throw new Error(res.status === 401 ? "Not signed in as an admin." : "Could not read levels.");
        return (await res.json()).levels || [];
    }

    async function saveServer(publish) {
        commit();
        const level = { ...state.level, published: publish === true };
        if (!level.name) throw new Error("Give the level a name first.");
        const headers = { "Content-Type": "application/json", ...authHeaders() };

        /* A level that has never been saved has no id yet — the server makes
           one from its name — so it must be CREATED. Only one that already has
           an id can be updated.

           This used to PUT first regardless and fall back on a 404. For a new
           level the server answers a PUT with no id "Missing level id" as a
           400, not a 404, so the fallback never ran and the very first save of
           every new level failed. Asking the right question first is better
           than widening what counts as "not found". */
        const post = () => fetch("/.netlify/functions/ff-levels", {
            method: "POST", headers, body: JSON.stringify(level)
        });

        let res;
        if (!level.id) {
            res = await post();
        } else {
            res = await fetch("/.netlify/functions/ff-levels", {
                method: "PUT", headers, body: JSON.stringify(level)
            });
            // Deleted from under us — recreate it rather than losing the work.
            if (res.status === 404) res = await post();
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (res.status === 409) {
                throw new Error(`A level called “${level.name}” already exists — give this one a different name.`);
            }
            throw new Error(err.error || "Could not save the level.");
        }
        const saved = await res.json();
        setLevel(saved);
        save();
        return saved;
    }

    async function deleteServer(id) {
        const res = await fetch("/.netlify/functions/ff-levels?id=" + encodeURIComponent(id), {
            method: "DELETE", headers: authHeaders()
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Could not delete the level.");
        }
        return true;
    }

    async function loadServer(id) {
        const all = await listServer(true);
        const hit = all.find(l => l.id === id);
        if (!hit) throw new Error("No level with that id.");
        setLevel(hit);
        save();
        return hit;
    }

    // ---- drawing the editor's own overlays

    /* What the editor draws on top of the room. Only what the CURRENT MODE
       needs: zone rectangles while working on zones, the placement ghost while
       decorating. Showing everything at once turned the room into a diagram. */
    /* A translucent copy of a piece, drawn THROUGH A BUFFER rather than by
       turning the alpha down and letting it paint.

       A furni in the library is several part bitmaps that overlap each other —
       a sofa's back tucks behind its arm — and drawing each of them at 65%
       blends every overlap twice, so the seams come out darker than the rest
       and the ghost looks patchy where it should look solid. Rendering the
       whole piece opaque into its own canvas and fading THAT keeps it one
       picture. The buffer is kept and reused; it is repainted every frame the
       pointer moves. */
    let ghostBuf = null, ghostCtx = null;

    function drawGhost(ctx, piece, alpha) {
        if (!ghostBuf) {
            ghostBuf = document.createElement("canvas");
            ghostBuf.width = Iso.WIDTH;
            ghostBuf.height = Iso.HEIGHT;
            ghostCtx = ghostBuf.getContext("2d");
            ghostCtx.imageSmoothingEnabled = false;
        }
        ghostCtx.clearRect(0, 0, ghostBuf.width, ghostBuf.height);
        if (!Furni.draw(ghostCtx, piece)) return;      // nothing loaded yet
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(ghostBuf, 0, 0);
        ctx.restore();
    }

    function drawOverlay(ctx, hover) {
        /* The paint loop starts before the catalogue has finished loading —
           a few seconds of network — so there is a window with no level yet
           and this runs every frame regardless. */
        if (!state.level) {
            if (hover) Iso.highlight(ctx, hover.x, hover.y, "#ffff00");
            return;
        }

        if (state.mode === "zones") {
            for (const z of state.level.zones || []) {
                const on = z.id === state.zoneId;
                const colour = on ? "#ffcc00" : "#40a0ff";
                for (let y = z.area.y; y < z.area.y + z.area.h; y++) {
                    for (let x = z.area.x; x < z.area.x + z.area.w; x++) {
                        // Border only, or overlapping zones turn the floor to soup.
                        const edge = x === z.area.x || y === z.area.y ||
                            x === z.area.x + z.area.w - 1 || y === z.area.y + z.area.h - 1;
                        if (edge) Iso.highlight(ctx, x, y, colour);
                    }
                }
            }
        }

        if (state.mode === "decor") {
            if (state.selected) Furni.outline(ctx, state.selected, "#ffff00");

            /* THE PIECE IN YOUR HAND, drawn where it would land.

               Habbo shows the actual furni following the pointer, turned the
               way you turned it, so you place a sofa knowing which way it
               faces and how much room it takes. The footprint outline stays
               underneath it, in green or red, because the picture alone does
               not say whether the tiles are free. */
            const held = state.brush && hover ? ghost(hover.x, hover.y) : null;
            if (held) {
                for (const t of Furni.tilesOf(held)) {
                    Iso.highlight(ctx, t.x, t.y, held.ok ? "#40ff80" : "#ff4040");
                }
                drawGhost(ctx, held, held.ok ? 0.65 : 0.35);
            }
        }

        if (hover && !(state.mode === "decor" && state.brush)) {
            Iso.highlight(ctx, hover.x, hover.y, "#ffffff");
        }
    }

    // The rectangle being dragged out right now, drawn by the page.
    function drawDragArea(ctx, area) {
        if (!area) return;
        for (let y = area.y; y < area.y + area.h; y++) {
            for (let x = area.x; x < area.x + area.w; x++) Iso.highlight(ctx, x, y, "#ffcc00");
        }
    }

    window.RoomEditor = {
        state, load, search, setLevel, rebuild, commit,
        place, ghost, setBrush, rotateBrush, setBrushLift, brush,
        stateList, cycleBrushState, cycleSelectedState,
        beginPrecise, previewPrecise, cancelPrecise, savePrecise,
        selectAt, moveSelected, rotateSelected, deleteSelected,
        addZone, removeZone, selectZone, setZoneArea, renameZone, zone,
        addItem, removeItem, setRoom, save, restore, discardDraft,
        drawOverlay, drawDragArea, spriteUrl, spriteFor, rotationCount, metaFor, playable,
        listServer, saveServer, loadServer, deleteServer, authToken,
        onChange(cb) { onChange = cb || (() => { }); }
    };
})();

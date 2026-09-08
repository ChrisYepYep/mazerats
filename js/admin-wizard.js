/* The atlas panel in the admin page — where the map at /wizard is made.

   Its own file rather than another thousand lines on the end of js/admin.js,
   and not a self-contained page either: js/admin.js owns the session, the
   token, the role and the shared furniture (dropzones, confirm dialogs, the
   lock-out on an expired session), and hands them over in init(). Anything
   this needs from the admin page comes through that one door, so there is
   exactly one place to look when the two have to agree about something.

   The map itself is js/wizard-map.js, the same engine the public page draws
   with. That is the point of it being an engine: an editor that drew the map
   even slightly differently would be an editor you cannot trust — you would
   arrange a name until it looked right and find it somewhere else on the
   site.

   THREE MODES over the top of that.

     MOVE    drag anything — a name, a whole trail, a picture — to where it
             belongs. Drag the parchment to pan. Nothing is saved until Save
             Positions, so a pass over the map is one action rather than
             forty.
     TRAIL   join two rooms, then bend the line between them. A trail is a
             handful of points; drag one to shape the curve, double-click to
             remove it, click the line to add one.
     ZOOM    give whatever is selected a band of zoom levels it appears
             between — a painting of the grounds that thins out as you come
             down into it, and the names underneath that were not there
             before.

   And an INSPECTOR under the map that changes with what is selected: a
   room, a trail or a picture, each with the handful of things worth
   changing while looking at the map rather than in a form somewhere else.

   Everything positioned is stored as a percentage of the map, never in
   pixels: the sheet has been re-exported at a different size three times
   already and a pixel would silently mean somewhere else afterwards. */
window.AdminWizard = (function () {

    // Handed over by js/admin.js in init(). Nothing here reaches for a
    // token or a dialog of its own.
    let ctx = null;

    let view = null;
    let data = { map: {}, rooms: [], paths: [], layers: [] };
    let mode = "move";
    let selected = null;          // { kind, id } — the one the inspector shows

    /* Everything currently picked, `selected` included and always last.

       A second list rather than making `selected` an array, because the two
       answer different questions and almost every use wants the first one:
       the inspector, the room list and the zoom-band controls all act on ONE
       record and would each have had to decide what to do with five. What
       reads this list is dragging, nudging and deleting — the operations
       where "and the same again to the others" is the whole point. */
    let picked = [];

    const isPicked = (kind, id) => picked.some(p => p.kind === kind && p.id === id);

    /* Locked: the map may be looked at and panned, but nothing on it moves.

       The editor's own gestures are the problem it solves. Dragging the
       parchment is how you pan, and the parchment is mostly covered in
       rooms — so reaching for an empty patch to pull the map across, and
       landing a pixel inside a name, silently drags the name instead. You
       do not notice until the unsaved-changes count goes up. Locked, every
       press falls through to the pan, and the count cannot move on its own.

       Selecting still works, and so does the inspector: locking is about
       what a DRAG does, not about making the map read-only. */
    let locked = false;
    const LOCK_KEY = "mazerats_wiz_locked";

    let trailFrom = null;         // first room picked in TRAIL mode
    let marquee = null;           // the rubber band, while one is being drawn
    // What has been moved but not yet saved, keyed "kind:id" so a record
    // dragged five times is still one pending write.
    const pending = new Map();

    let els = {};

    function $(id) { return document.getElementById(id); }
    function esc(str) { return ctx.escapeHtml(String(str == null ? "" : str)); }
    const round = v => Math.round(v * 1000) / 1000;
    const clamp = v => Math.max(0, Math.min(100, v));

    // ---------- loading and saving ----------

    async function load() {
        try {
            data = await ctx.api.getWizardMapFresh(ctx.token());
        } catch (err) {
            if (err.status === 401) return ctx.lockOut();
            say("Could not load the map — " + (err.message || "try again."), "bad");
            return;
        }
        pending.clear();
        trailFrom = null;
        view.setData(data);
        view.render();
        if (selected && !find(selected.kind, selected.id)) selected = null;
        restoreSelection();
        drawHandles();
        renderRoomList();
        renderInspector();
        renderMapSettings();
        updateDirty();
    }

    function find(kind, id) {
        const list = kind === "room" ? data.rooms : kind === "path" ? data.paths : data.layers;
        return (list || []).find(r => r.id === id) || null;
    }

    function markMoved(kind, id) {
        const record = find(kind, id);
        if (!record) return;
        pending.set(`${kind}:${id}`, { kind, id, record });
        updateDirty();
    }

    function updateDirty() {
        const n = pending.size;
        els.dirty.hidden = n === 0;
        els.dirty.textContent = n === 1 ? "1 unsaved change" : `${n} unsaved changes`;
        els.savePositions.disabled = n === 0;
    }

    /* Everything the last pass moved, in one request. Dragging a dozen names
       into place and shaping the trails between them is one thought, and
       there is no reason for it to be twenty-five round trips. The endpoint
       accepts positions only in a bulk write, so this cannot quietly carry
       anything else along with it — see netlify/functions/wizard.js. */
    async function savePositions() {
        if (!pending.size) return;
        /* Kept in step with MOVABLE in netlify/functions/wizard.js, which
           refuses anything not on its own list. A field marked as changed
           here but missing from either list is the worst kind of bug: the
           unsaved badge clears, and the change is gone. */
        const CARRIED = ["x", "y", "w", "h", "size", "rotation", "align", "points", "z",
            "opacity", "spacing", "gap", "blend", "flipX", "flipY",
            "grayscale", "sepia", "brightness", "contrast", "saturate", "blur",
            "fromZoom", "toZoom"];
        const items = [...pending.values()].map(({ kind, record }) => {
            const item = { kind, id: record.id };
            for (const key of CARRIED) {
                if (record[key] !== undefined) item[key] = record[key];
            }
            return item;
        });
        els.savePositions.disabled = true;
        try {
            await ctx.api.saveWizardPositions(ctx.token(), items);
            pending.clear();
            updateDirty();
            say(`Saved ${items.length === 1 ? "one change" : items.length + " changes"}.`, "good");
        } catch (err) {
            if (err.status === 401) return ctx.lockOut();
            say("Could not save — " + (err.message || "try again."), "bad");
            els.savePositions.disabled = false;
        }
    }

    async function saveOne(kind, record) {
        try {
            await ctx.api.updateWizardItem(ctx.token(), kind, record);
            pending.delete(`${kind}:${record.id}`);
            updateDirty();
            return true;
        } catch (err) {
            if (err.status === 401) { ctx.lockOut(); return false; }
            say("Could not save — " + (err.message || "try again."), "bad");
            return false;
        }
    }

    let sayTimer = null;
    function say(message, kind) {
        els.status.textContent = message;
        els.status.dataset.kind = kind || "";
        els.status.hidden = false;
        clearTimeout(sayTimer);
        sayTimer = setTimeout(() => { els.status.hidden = true; }, 4500);
    }

    // ---------- modes ----------

    const MODE_HELP = {
        move: "Drag a name, a trail or a picture to move it — drag the parchment to pan, scroll to zoom. PICK SEVERAL: shift-click each one, or shift-drag across bare parchment to draw a box round them, then drag any one to move the whole group. Arrow keys nudge, shift+arrows nudge further. Click a trail to select it, then click along it to add a bend.",
        trail: "Click one room, then another, to lay a trail between them. Click a trail to select it — then click anywhere along it to add a bend, drag a dot to shape it, and double-click a dot to remove it. Its two ends, its bend and how near it comes to a name are all in the panel below the map.",
        zoom: "Zoom to where you want something to appear, select it, then set the band. Things outside their band are shown here as ghosts so you can still find them."
    };

    // Said instead of the above whenever the map is locked, because none of
    // it is true then and a help line that describes the wrong thing is
    // worse than no help line.
    const LOCKED_HELP = "The map is locked: drag anywhere to pan, scroll to zoom, click to look at something. Nothing moves until you unlock it.";

    function setMode(next) {
        mode = next;
        els.modes.querySelectorAll("[data-mode]").forEach(btn => {
            const on = btn.dataset.mode === next;
            btn.classList.toggle("active", on);
            btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
        els.help.textContent = locked ? LOCKED_HELP : MODE_HELP[next];
        els.stage.dataset.mode = next;
        trailFrom = null;
        drawHandles();
        renderInspector();
    }

    function setLocked(next) {
        locked = !!next;
        try { localStorage.setItem(LOCK_KEY, locked ? "1" : "0"); } catch (err) { /* private mode */ }
        if (els.lockBtn) {
            els.lockBtn.setAttribute("aria-pressed", locked ? "true" : "false");
            els.lockBtn.classList.toggle("is-on", locked);
            els.lockBtn.textContent = locked ? "🔒 Locked" : "🔓 Unlocked";
            els.lockBtn.title = locked
                ? "Nothing on the map can be dragged. Click to unlock."
                : "Everything can be dragged. Click to lock the map so only panning moves.";
        }
        // The stage carries it too, so the cursor and the handles can say so
        // without every rule having to ask the script.
        if (els.stage) els.stage.dataset.locked = locked ? "true" : "false";
        if (els.help) els.help.textContent = locked ? LOCKED_HELP : MODE_HELP[mode];
        drawHandles();
        renderInspector();
    }

    // ---------- selection ----------

    /* Picking one thing, or adding one to what is already picked.

       `add` is shift or ctrl being held. Adding something already picked
       takes it out again, which is what every other editor does and what
       makes a mis-click recoverable without starting the selection over. */
    function select(kind, id, add) {
        if (!kind) {
            picked = [];
            selected = null;
        } else if (!add) {
            picked = [{ kind, id }];
            selected = { kind, id };
        } else if (isPicked(kind, id)) {
            picked = picked.filter(p => !(p.kind === kind && p.id === id));
            selected = picked.length ? picked[picked.length - 1] : null;
        } else {
            picked = picked.concat([{ kind, id }]);
            selected = { kind, id };
        }
        afterSelectionChange();
    }

    // Replaces the whole selection at once — what the rubber band hands back.
    function selectMany(list) {
        picked = list.slice();
        selected = picked.length ? picked[picked.length - 1] : null;
        afterSelectionChange();
    }

    function afterSelectionChange() {
        restoreSelection();
        drawHandles();
        renderInspector();
        renderRoomList();
    }

    /* Re-applies the selection ring after a render has thrown away the
       elements it was on.

       Two classes, not one: everything picked gets .is-picked, and the one
       the inspector is showing also gets .is-selected. With five names
       picked, which one the fields below belong to is otherwise a guess. */
    function restoreSelection() {
        els.canvas.querySelectorAll(".is-selected, .is-picked")
            .forEach(el => el.classList.remove("is-selected", "is-picked"));
        for (const p of picked) {
            const el = view.elementFor(p.kind, p.id);
            if (el) el.classList.add("is-picked");
        }
        if (!selected) return;
        const el = view.elementFor(selected.kind, selected.id);
        if (el) el.classList.add("is-selected");
    }

    // ---------- dragging ----------

    /* One handler for every kind of drag the editor does — a name, a
       picture, a whole trail, a trail's control point, a picture's corner —
       because they are the same gesture over different records, and five
       copies of "work out how far the pointer moved in map per cent" is five
       chances to get it subtly different.

       Returning false from the engine's onPointerDown is what stops the map
       panning underneath the thing being dragged. A press that lands on the
       parchment returns nothing, and the map pans as usual. */
    let drag = null;

    /* Whether the drag in progress has actually moved anything, and the
       point it started from so that can be judged. A few pixels of slop, so
       a press with an unsteady hand is still a press — the same allowance
       the map itself makes for a pan (see dragMoved in js/wizard-map.js). */
    let dragMoved = false;
    let dragStart = null;
    const DRAG_SLOP = 3;

    /* Set when a drag that MOVED something finishes, and consumed by the
       click that follows it.

       A flag cleared on the next animation frame was the first attempt,
       copying how the map suppresses the click after a pan. It does not
       hold here: measured, the click after dragging a control point arrives
       AFTER that frame has run, so the flag was already false and the click
       went through and cleared the selection — the dot moved, the curve
       followed, and every handle vanished as you let go.

       A flag consumed by the click itself cannot be beaten by timing.
       Cleared again on the next press so that a drag which happens to end
       without a click — dragging a whole trail does — cannot leave it set
       and swallow somebody's next real click. */
    let swallowNextClick = false;

    /* The pointer is captured by the element BEING DRAGGED, not by the map
       frame around it.

       Capture at all, because a drag that runs off the edge of the frame —
       and a name being pulled toward the corner of the map always does —
       otherwise stops dead the moment the pointer leaves.

       And the element rather than the frame, because capture also decides
       where the click that ends the gesture is delivered. Captured by the
       frame, that click arrives with the frame as its target and the thing
       just dragged is not selected afterwards; captured by the element, it
       arrives on the element, and letting go leaves it selected with its
       details open — which is almost always the next thing wanted. */
    function beginDrag(el, e, state) {
        drag = state;
        dragMoved = false;
        dragStart = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        return false;
    }

    function onPointerDown(e) {
        // A fresh press: whatever the last gesture left behind is finished
        // with. See swallowNextClick for why this cannot be left to lapse.
        swallowNextClick = false;
        if (!ctx.canWrite()) return;

        /* Locked: nothing here claims the press, so it reaches the map and
           pans. Checked before every branch below, including the handles and
           grips — a lock that still let a trail's control point be dragged
           would be a lock nobody trusted. */
        if (locked) return;

        /* The rubber band. Shift on empty parchment, because shift on
           something is "add that to the selection" and the two gestures have
           to be told apart by what is under the pointer at the start. */
        if (e.shiftKey && mode === "move" && !e.target.closest(".wiz-room, .wiz-layer, .wiz-trail, .wiz-handle, .wiz-grip")) {
            const at = view.screenToPct(e.clientX, e.clientY);
            marquee = { x0: at.x, y0: at.y, x1: at.x, y1: at.y, add: e.ctrlKey || e.metaKey, base: picked.slice() };
            els.stage.setPointerCapture(e.pointerId);
            e.preventDefault();
            drawMarquee();
            return false;
        }

        // A trail's control point, in TRAIL mode.
        const handle = e.target.closest(".wiz-handle");
        if (handle) {
            const path = find("path", handle.dataset.pathId);
            if (!path) return;
            const index = Number(handle.dataset.index);
            return beginDrag(handle, e, {
                kind: "handle", path, index,
                from: view.screenToPct(e.clientX, e.clientY),
                origin: path.points[index].slice()
            });
        }

        // A picture's corner grip, for resizing.
        const grip = e.target.closest(".wiz-grip");
        if (grip) {
            const layer = find("layer", grip.dataset.layerId);
            if (!layer) return;
            return beginDrag(grip, e, {
                kind: "resize", record: layer,
                from: view.screenToPct(e.clientX, e.clientY),
                origin: { w: layer.w || 20, h: layer.h || 0 }
            });
        }

        if (mode !== "move") return;

        const target = e.target.closest(".wiz-room, .wiz-layer");
        if (target) {
            const kind = target.dataset.kind;
            const record = find(kind, target.dataset.id);
            if (!record) return;

            /* Pressing something already picked drags the WHOLE selection.

               Pressing something outside it picks that one instead, first,
               so a stray press does not haul five rooms across the map —
               the same rule a file manager uses, and the one people already
               expect from having dragged icons about. Shift is left alone
               here: that press is adding to the selection, not starting a
               drag. */
            if (!e.shiftKey && !isPicked(kind, record.id)) select(kind, record.id);

            if (picked.length > 1 && isPicked(kind, record.id)) {
                return beginDrag(target, e, {
                    kind: "group",
                    from: view.screenToPct(e.clientX, e.clientY),
                    members: groupOrigins()
                });
            }
            return beginDrag(target, e, {
                kind, record,
                from: view.screenToPct(e.clientX, e.clientY),
                origin: { x: record.x, y: record.y }
            });
        }

        /* A whole trail, grabbed anywhere along it.

           Its points are stored as absolute positions on the sheet, so
           moving the trail means moving all of them by the same amount —
           which is what makes this different from dragging one control
           point, and what you want when a trail is in roughly the right
           shape but the wrong place. */
        const trail = e.target.closest(".wiz-trail");
        if (trail) {
            const path = find("path", trail.dataset.id);
            if (!path || !Array.isArray(path.points)) return;
            return beginDrag(trail, e, {
                kind: "trail", record: path,
                from: view.screenToPct(e.clientX, e.clientY),
                origin: path.points.map(p => p.slice())
            });
        }
    }

    /* Where everything picked started, so a group drag can be worked out
       from the original positions on every move rather than accumulating
       small steps — which drifts, and drifts differently for each member. */
    function groupOrigins() {
        return picked.map(p => {
            const record = find(p.kind, p.id);
            if (!record) return null;
            return p.kind === "path"
                ? { kind: p.kind, record, points: (record.points || []).map(q => q.slice()) }
                : { kind: p.kind, record, x: record.x, y: record.y };
        }).filter(Boolean);
    }

    function drawMarquee() {
        let box = els.canvas.querySelector(".admin-wiz-marquee");
        if (!marquee) { if (box) box.remove(); return; }
        if (!box) {
            box = document.createElement("div");
            box.className = "admin-wiz-marquee";
            els.canvas.appendChild(box);
        }
        box.style.left = Math.min(marquee.x0, marquee.x1) + "%";
        box.style.top = Math.min(marquee.y0, marquee.y1) + "%";
        box.style.width = Math.abs(marquee.x1 - marquee.x0) + "%";
        box.style.height = Math.abs(marquee.y1 - marquee.y0) + "%";
    }

    // Everything whose position falls inside the band. A trail counts if any
    // of its points do, which is what "lassoing that corner of the map"
    // means when the thing being lassoed is a line rather than a point.
    function insideMarquee() {
        const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1);
        const y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1);
        const within = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const hits = [];
        for (const room of data.rooms) if (within(room.x, room.y)) hits.push({ kind: "room", id: room.id });
        for (const layer of data.layers) if (within(layer.x, layer.y)) hits.push({ kind: "layer", id: layer.id });
        for (const path of data.paths) {
            if ((path.points || []).some(p => within(p[0], p[1]))) hits.push({ kind: "path", id: path.id });
        }
        return hits;
    }

    function onPointerMove(e) {
        if (marquee) {
            const at = view.screenToPct(e.clientX, e.clientY);
            marquee.x1 = at.x; marquee.y1 = at.y;
            drawMarquee();
            return;
        }
        if (!drag) return;
        if (!dragMoved && dragStart
            && (Math.abs(e.clientX - dragStart.x) > DRAG_SLOP || Math.abs(e.clientY - dragStart.y) > DRAG_SLOP)) {
            dragMoved = true;
        }
        const at = view.screenToPct(e.clientX, e.clientY);
        const dx = at.x - drag.from.x;
        const dy = at.y - drag.from.y;

        if (drag.kind === "handle") {
            drag.path.points[drag.index] = [
                round(clamp(drag.origin[0] + dx)),
                round(clamp(drag.origin[1] + dy))
            ];
            redrawTrail(drag.path);
            markMoved("path", drag.path.id);
            return;
        }

        if (drag.kind === "resize") {
            const layer = drag.record;
            layer.w = Math.max(1, round(drag.origin.w + dx * 2));
            if (drag.origin.h) layer.h = Math.max(1, round(drag.origin.h + dy * 2));
            applyLayerBox(layer);
            markMoved("layer", layer.id);
            return;
        }

        if (drag.kind === "trail") {
            drag.record.points = drag.origin.map(([px, py]) =>
                [round(clamp(px + dx)), round(clamp(py + dy))]);
            redrawTrail(drag.record);
            markMoved("path", drag.record.id);
            return;
        }

        /* Everything picked, by the same amount.

           Trails move whole — every point — because a trail caught up in a
           group drag is being carried along with its rooms, and a trail that
           kept its bends where they were while its ends moved would come out
           a different shape. A trail pinned to a room that is ALSO in the
           selection would otherwise be moved twice, once here and once by
           followRoom below, so followRoom is not called during a group. */
        if (drag.kind === "group") {
            for (const m of drag.members) {
                if (m.kind === "path") {
                    m.record.points = m.points.map(([px, py]) =>
                        [round(clamp(px + dx)), round(clamp(py + dy))]);
                    redrawTrail(m.record);
                    markMoved("path", m.record.id);
                    continue;
                }
                m.record.x = round(clamp(m.x + dx));
                m.record.y = round(clamp(m.y + dy));
                const el = view.elementFor(m.kind, m.record.id);
                if (el) { el.style.left = m.record.x + "%"; el.style.top = m.record.y + "%"; }
                markMoved(m.kind, m.record.id);
            }
            // Trails hanging off a moved room. Ones already carried by the
            // group are skipped, or their ends would be moved a second time
            // and the trail would stretch away from its own room.
            const carried = new Set(drag.members.filter(m => m.kind === "path").map(m => m.record.id));
            for (const m of drag.members) {
                if (m.kind === "room") followRoom(m.record, carried);
            }
            return;
        }

        drag.record.x = round(clamp(drag.origin.x + dx));
        drag.record.y = round(clamp(drag.origin.y + dy));
        const el = view.elementFor(drag.kind, drag.record.id);
        if (el) {
            el.style.left = drag.record.x + "%";
            el.style.top = drag.record.y + "%";
        }
        /* A trail whose end is pinned to this room follows it. Otherwise
           moving a name leaves its footprints behind, walking to where it
           used to be — and the only way back is to drag every point by hand.
           Only the END point moves; the bends in the middle are somebody's
           deliberate shaping of the curve and are not this drag's to undo. */
        if (drag.kind === "room") followRoom(drag.record);
        markMoved(drag.kind, drag.record.id);
    }

    /* A trail follows the room that moved, bends and all.

       It used to move only the END point and leave every bend exactly where
       it was. Drag a room a third of the way across the sheet and its trail
       stayed nailed to a bend in the old place, so what had been a gentle
       curve became a hairpin going out and back — the further the room went,
       the worse the kink, and the only cure was to drag every point by hand
       afterwards.

       So the move is shared along the trail instead: the end that is
       attached takes all of it, the far end takes none, and everything
       between takes a share by how far along it sits. That is the same
       thing a piece of string does when you pick up one end of it — the
       shape near your hand comes with you, the shape at the other end
       stays put — and it keeps the curve the shape somebody drew.

       The far end is left alone on purpose: it belongs to a room that has
       not moved, and dragging it would detach the trail from that one. */
    function followRoom(room, skip) {
        for (const path of data.paths) {
            if (!Array.isArray(path.points) || path.points.length < 2) continue;
            if (skip && skip.has(path.id)) continue;

            const pts = path.points;
            const last = pts.length - 1;
            let moved = false;

            // `weight` runs 1 at the attached end to 0 at the other.
            const drag = (endIndex) => {
                const dx = room.x - pts[endIndex][0];
                const dy = room.y - pts[endIndex][1];
                if (!dx && !dy) return;
                for (let i = 0; i <= last; i++) {
                    const along = endIndex === 0 ? i / last : (last - i) / last;
                    const weight = 1 - along;
                    if (!weight) continue;
                    pts[i] = [
                        round(clamp(pts[i][0] + dx * weight)),
                        round(clamp(pts[i][1] + dy * weight))
                    ];
                }
                // Pinned exactly, rather than left to the arithmetic above —
                // a rounding error here is a trail that does not quite touch
                // its own room.
                pts[endIndex] = [room.x, room.y];
                moved = true;
            };

            if (path.from === room.id) drag(0);
            if (path.to === room.id) drag(last);

            if (moved) {
                redrawTrail(path);
                markMoved("path", path.id);
            }
        }
    }

    function onPointerUp() {
        if (marquee) {
            const band = marquee;
            const hits = insideMarquee();
            marquee = null;
            drawMarquee();
            /* A band that caught nothing clears the selection, unless it was
               being added to — dragging a box over empty paper is how you
               deselect everything without hunting for a bare patch to click. */
            if (band.add) {
                const merged = band.base.slice();
                for (const h of hits) if (!merged.some(p => p.kind === h.kind && p.id === h.id)) merged.push(h);
                selectMany(merged);
            } else {
                selectMany(hits);
            }
            if (hits.length) say(`${hits.length} picked. Drag any one of them to move them together.`, "");
            return;
        }
        if (!drag) return;
        drag = null;
        dragStart = null;
        // Handed to the click that is about to arrive; see swallowNextClick.
        if (dragMoved) swallowNextClick = true;
        dragMoved = false;
        drawHandles();
        renderInspector();
    }

    /* Redraws one trail in place rather than re-rendering the whole map —
       every pointermove during a drag calls this.

       The laying itself belongs to the engine (see redrawTrail in
       js/wizard-map.js): how a trail is drawn is exactly the thing the
       editor must not have its own opinion about, or a trail shaped here
       would come out differently on the page. All this adds is moving the
       handles to match. */
    function redrawTrail(path) {
        view.redrawTrail(path);
        syncHandles(path);
        restoreSelection();
    }

    // Position, size and every look setting, straight through the engine so
    // the editor and the page can never disagree about what a picture looks
    // like. See redrawLayer in js/wizard-map.js.
    function applyLayerBox(layer) {
        view.redrawLayer(layer);
        positionGrip(layer);
    }

    // ---------- trail handles and layer grips ----------

    /* The dots you drag to bend a trail, plus a thin line through them so
       the shape is legible while the footprints catch up. Only ever drawn
       for the SELECTED trail: ninety trails' worth of handles at once is a
       screen of confetti, none of which is the one being worked on. */
    function drawHandles() {
        els.handles.innerHTML = "";
        if (selected && selected.kind === "layer") return drawGrip(find("layer", selected.id));
        /* Shown whenever a trail is selected, in any mode — not only in
           Trails mode as before. Selecting a trail and finding no way to
           shape it until you notice there is a mode switch is a bad
           surprise, and the handles cost nothing when nothing is selected.
           Their own pointerdown branch runs ahead of the mode check, so
           dragging one shapes the curve even in Move mode, where dragging
           the trail itself moves the whole thing. */
        if (!selected || selected.kind !== "path") return;
        const path = find("path", selected.id);
        if (!path || !Array.isArray(path.points)) return;

        const map = view.getMap();
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "wiz-handle-line");
        svg.setAttribute("viewBox", `0 0 ${map.width} ${map.height}`);
        svg.setAttribute("preserveAspectRatio", "none");
        const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        line.setAttribute("points", path.points
            .map(([x, y]) => `${(x / 100) * map.width},${(y / 100) * map.height}`).join(" "));
        svg.appendChild(line);
        els.handles.appendChild(svg);

        path.points.forEach(([x, y], index) => {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.className = "wiz-handle";
            dot.dataset.pathId = path.id;
            dot.dataset.index = index;
            dot.style.left = x + "%";
            dot.style.top = y + "%";
            // The two ends are what a trail RUNS BETWEEN, and moving one by
            // hand is usually a mistake — they follow their rooms. Marked so
            // they read differently rather than made undraggable: a trail
            // with an unnamed end has no room to follow, and that end is the
            // only way to place it.
            if (index === 0 || index === path.points.length - 1) dot.classList.add("is-end");
            dot.title = index === 0 ? "Start" : index === path.points.length - 1 ? "End" : "Bend — double-click to remove";
            els.handles.appendChild(dot);
        });
    }

    // The corner you drag to resize a picture. One, at the bottom right,
    // resizing about the centre — which is where the picture is anchored,
    // so a grip that resized about a corner would move it as well.
    function drawGrip(layer) {
        if (!layer) return;
        const grip = document.createElement("button");
        grip.type = "button";
        grip.className = "wiz-grip";
        grip.dataset.layerId = layer.id;
        grip.title = "Drag to resize";
        els.handles.appendChild(grip);
        positionGrip(layer);
    }

    function positionGrip(layer) {
        const grip = els.handles.querySelector(".wiz-grip");
        if (!grip || !layer) return;
        const el = view.elementFor("layer", layer.id);
        const map = view.getMap();
        const halfW = el ? (el.offsetWidth / 2 / map.width * 100) : (layer.w || 20) / 2;
        const halfH = el ? (el.offsetHeight / 2 / map.height * 100) : 6;
        grip.style.left = (layer.x + halfW) + "%";
        grip.style.top = (layer.y + halfH) + "%";
    }

    /* Moves the handles to match the points, WITHOUT rebuilding them.

       The distinction is load-bearing rather than an optimisation. A handle
       drag captures the pointer on the handle itself (see beginDrag), and
       every frame of that drag redraws the trail — so a redraw that threw
       the dots away and made new ones would destroy the element holding the
       capture, and the drag would stop after a single pixel.

       A full rebuild is only right when the NUMBER of points has changed — a
       bend added or removed — which is exactly when nothing is being
       dragged. */
    function syncHandles(path) {
        if (!selected || selected.kind !== "path" || selected.id !== path.id) return;
        const dots = els.handles.querySelectorAll(".wiz-handle");
        if (dots.length !== path.points.length) return drawHandles();
        path.points.forEach(([x, y], i) => {
            dots[i].style.left = x + "%";
            dots[i].style.top = y + "%";
        });
        const line = els.handles.querySelector(".wiz-handle-line polyline");
        if (line) {
            const map = view.getMap();
            line.setAttribute("points", path.points
                .map(([x, y]) => `${(x / 100) * map.width},${(y / 100) * map.height}`).join(" "));
        }
    }

    // ---------- clicks on the map ----------

    function onMapClick(e) {
        if (view.wasDrag()) return;

        /* A gesture that MOVED something is not a click on it.

           Every drag here ends with a click event, and this handler was
           acting on all of them. Two things went wrong because of it, and
           the first is why dragging a control point looked broken: a handle
           lives in the handles layer, not inside .wiz-trail, so the click
           ending its drag matched nothing here and fell through to "clicked
           bare parchment" — which deselects. You dragged a dot, the curve
           followed, and then every dot vanished as you let go.

           The second arrived with add-a-bend: dragging a selected trail to
           reposition it ended with a click ON that trail, which is now the
           gesture for adding a bend — so moving a trail dropped a new point
           into it every time.

           view.wasDrag() does not cover either, and cannot: the map's own
           drag tracking never starts for these, because onPointerDown
           returns false to stop the map panning underneath them. So the
           editor keeps its own flag for its own drags. */
        if (swallowNextClick) { swallowNextClick = false; return; }
        if (dragMoved) return;

        // A press on a control point or a picture's grip is the start of a
        // drag, never a selection — even when it turns out to be a still one.
        if (e.target.closest(".wiz-handle, .wiz-grip")) return;
        const room = e.target.closest(".wiz-room");
        const trail = e.target.closest(".wiz-trail");
        const layer = e.target.closest(".wiz-layer");

        // Shift or ctrl adds to the selection instead of replacing it.
        const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey;

        /* Clicking a trail that is ALREADY selected drops a new bend at that
           spot, and does it in every mode.

           Adding a bend used to mean being in Trails mode and hitting the
           thin guide line drawn between the dots — which is a thing you
           have to be told about and then aim at. Now the rule is the one
           anybody would guess: select the trail, then click along it
           wherever you want it to turn. Click it again somewhere else for
           another bend, as many as you like.

           Only the SELECTED trail, so clicking a different one still
           selects that one rather than quietly reshaping this one; and
           never while locked, or the lock would have a hole in it. */
        const onSelectedTrail = selected && selected.kind === "path" && !locked && !addToSelection
            && (e.target.closest(".wiz-handle-line") || (trail && trail.dataset.id === selected.id));

        if (mode === "trail") {
            if (room) return pickForTrail(room.dataset.id);
            if (onSelectedTrail) return addBendAt(e.clientX, e.clientY);
            if (trail) return select("path", trail.dataset.id, addToSelection);
            return select(null);
        }

        if (onSelectedTrail) return addBendAt(e.clientX, e.clientY);

        if (room) return select("room", room.dataset.id, addToSelection);
        if (layer) return select("layer", layer.dataset.id, addToSelection);
        if (trail) return select("path", trail.dataset.id, addToSelection);
        // A plain click on bare parchment clears; a shift-click does not, or
        // every near miss while building a selection would undo it.
        if (!addToSelection) select(null);
    }

    async function pickForTrail(roomId) {
        if (!ctx.canWrite()) return;
        if (!trailFrom) {
            trailFrom = roomId;
            const el = view.elementFor("room", roomId);
            if (el) el.classList.add("is-trail-from");
            say("Now click the room this one leads to.", "");
            return;
        }
        if (trailFrom === roomId) {
            const el = view.elementFor("room", roomId);
            if (el) el.classList.remove("is-trail-from");
            trailFrom = null;
            return;
        }
        const from = find("room", trailFrom);
        const to = find("room", roomId);
        const startEl = view.elementFor("room", trailFrom);
        if (startEl) startEl.classList.remove("is-trail-from");
        trailFrom = null;
        if (!from || !to) return;

        /* A new trail is a line between the two rooms with one bend in the
           middle. The bend is not decoration: a two-point trail is straight
           and there is nothing to take hold of to make it anything else, so
           every trail starts with somewhere to pull. */
        const mid = [round((from.x + to.x) / 2), round((from.y + to.y) / 2)];
        try {
            const created = await ctx.api.createWizardItem(ctx.token(), "path", {
                from: from.id, to: to.id,
                points: [[from.x, from.y], mid, [to.x, to.y]]
            });
            data.paths.push(created);
            view.setData(data);
            view.render();
            select("path", created.id);
            say(`Trail laid from ${from.name} to ${to.name}.`, "good");
        } catch (err) {
            if (err.status === 401) return ctx.lockOut();
            say("Could not lay that trail — " + (err.message || "try again."), "bad");
        }
    }

    // Inserts a bend into the selected trail where it was clicked, between
    // whichever two existing points that spot falls between.
    function addBendAt(clientX, clientY) {
        const path = find("path", selected.id);
        if (!path) return;
        const at = view.screenToPct(clientX, clientY);
        let bestAt = 1;
        let best = Infinity;
        for (let i = 1; i < path.points.length; i++) {
            const d = pointToSegment(at, path.points[i - 1], path.points[i]);
            if (d < best) { best = d; bestAt = i; }
        }
        path.points.splice(bestAt, 0, [round(at.x), round(at.y)]);
        redrawTrail(path);
        markMoved("path", path.id);
        // The panel states how many points the trail has, and it had just
        // become wrong — it still read 3 with four dots on the map.
        renderInspector();
    }

    function pointToSegment(p, a, b) {
        const vx = b[0] - a[0], vy = b[1] - a[1];
        const len = vx * vx + vy * vy;
        const t = len ? Math.max(0, Math.min(1, ((p.x - a[0]) * vx + (p.y - a[1]) * vy) / len)) : 0;
        return Math.hypot(p.x - (a[0] + vx * t), p.y - (a[1] + vy * t));
    }

    function onMapDoubleClick(e) {
        const handle = e.target.closest(".wiz-handle");
        if (!handle || !ctx.canWrite()) return;
        const path = find("path", handle.dataset.pathId);
        const index = Number(handle.dataset.index);
        if (!path) return;
        if (path.points.length <= 2) return say("A trail needs at least two points.", "bad");
        if (index === 0 || index === path.points.length - 1) {
            return say("That is an end of the trail — it follows its room. Repoint it below instead.", "");
        }
        path.points.splice(index, 1);
        redrawTrail(path);
        markMoved("path", path.id);
    }

    // ---------- the inspector ----------

    const STATUS_OPTIONS = [
        ["", "— none —"],
        ["entrance", "The way in"],
        ["unwalked", "Not walked yet (??)"],
        ["gone", "Gone"],
        ["secret", "Secret"],
        ["unnamed", "Not named yet"]
    ];

    function field(label, html, narrow) {
        return `<label class="admin-field${narrow ? " admin-wiz-narrow" : ""}"><span>${label}</span>${html}</label>`;
    }

    function num(name, value, step, extra) {
        return `<input type="number" step="${step}" data-set="${name}" value="${value == null ? "" : value}" ${extra || ""}>`;
    }

    /* What is selected, and everything worth changing while looking at the
       map rather than in a form somewhere else. Everything else about a room
       — its picture, what it was, what is written about it — is the room
       form, because none of that is a question you answer by looking at
       where it sits. */
    /* What the inspector says when more than one thing is picked.

       Deliberately NOT the ordinary fields with the values blanked out. Five
       rooms have five positions and no shared one, so a position field there
       either lies or does nothing; what a selection of five actually has is
       a count, and the handful of operations that mean something applied to
       all of them at once. Those, and a way out. */
    function renderMultiInspector() {
        const counts = { room: 0, path: 0, layer: 0 };
        for (const p of picked) counts[p.kind]++;
        const parts = [];
        if (counts.room) parts.push(counts.room === 1 ? "1 room" : `${counts.room} rooms`);
        if (counts.path) parts.push(counts.path === 1 ? "1 trail" : `${counts.path} trails`);
        if (counts.layer) parts.push(counts.layer === 1 ? "1 picture" : `${counts.layer} pictures`);

        els.inspector.hidden = false;
        els.inspector.innerHTML = `
            <div class="admin-wiz-inspector-head">
                <div>
                    <p class="admin-wiz-inspector-kind">${picked.length} picked</p>
                    <h4>${esc(parts.join(", "))}</h4>
                </div>
                <div class="admin-wiz-inspector-actions">
                    <button type="button" class="admin-action-pill" data-act="multi-hide">Hide them</button>
                    <button type="button" class="admin-action-pill" data-act="multi-show">Show them</button>
                    <button type="button" class="admin-action-pill" data-act="multi-none">Pick none</button>
                </div>
            </div>
            <p class="admin-hint">Drag any one of them to move the whole group. Arrow keys nudge them
                together, shift+arrows further. Shift-click to add or remove one; shift-drag on bare
                parchment to draw a box round several.</p>
            ${counts.room > 1 ? `
            <div class="admin-wiz-band-row">
                <span class="admin-hint">Line them up:</span>
                <button type="button" class="admin-action-pill" data-act="align-x">Same column</button>
                <button type="button" class="admin-action-pill" data-act="align-y">Same row</button>
                <button type="button" class="admin-action-pill" data-act="spread-x">Space out across</button>
                <button type="button" class="admin-action-pill" data-act="spread-y">Space out down</button>
            </div>` : ""}
        `;
    }

    function renderInspector() {
        if (picked.length > 1) return renderMultiInspector();
        if (!selected) {
            els.inspector.hidden = true;
            els.inspector.innerHTML = "";
            return;
        }
        const record = find(selected.kind, selected.id);
        if (!record) { els.inspector.hidden = true; return; }

        const zoom = view.getZoom();
        const kindName = selected.kind === "path" ? "Trail" : selected.kind === "layer" ? "Picture" : "Room";
        const title = selected.kind === "room" ? view.fullName(record)
            : selected.kind === "layer" ? (record.name || "Untitled picture")
                : trailTitle(record);

        els.inspector.hidden = false;
        els.inspector.innerHTML = `
            <div class="admin-wiz-inspector-head">
                <div>
                    <p class="admin-wiz-inspector-kind">${esc(kindName)}</p>
                    <h4>${esc(title)}</h4>
                </div>
                <div class="admin-wiz-inspector-actions">
                    <!-- Hiding is the everyday action here and deleting the
                         rare one, so hiding gets a plain button beside the
                         name. Hiding a room takes its trails with it — see
                         trailHidden in js/wizard-map.js. -->
                    <button type="button" class="admin-action-pill${record.hidden ? " is-on" : ""}" data-act="hide">${record.hidden ? "Hidden — show it" : "Hide"}</button>
                    ${selected.kind === "room" ? `<button type="button" class="admin-action-pill admin-edit-btn" data-act="edit">Edit details</button>` : ""}
                    <button type="button" class="admin-action-pill" data-act="centre">Centre on it</button>
                    <button type="button" class="admin-action-pill admin-delete-btn" data-act="delete">Delete</button>
                </div>
            </div>

            <div class="admin-wiz-inspector-grid">
                ${positionFields(record)}
                ${selected.kind === "room" ? roomFields(record) : ""}
                ${selected.kind === "path" ? trailFields(record) : ""}
                ${selected.kind === "layer" ? layerFields(record) : ""}
                ${field("Appears from", num("fromZoom", record.fromZoom, "0.1", 'min="1" placeholder="always"'), true)}
                ${field("Hidden past", num("toZoom", record.toZoom, "0.1", 'min="1" placeholder="never"'), true)}
            </div>

            <div class="admin-wiz-band-row">
                <span class="admin-hint">You are at <strong>${(zoom * 100).toFixed(0)}%</strong>.</span>
                <button type="button" class="admin-action-pill" data-band="from">Appears from here</button>
                <button type="button" class="admin-action-pill" data-band="to">Hidden past here</button>
                <button type="button" class="admin-action-pill" data-band="clear">Always visible</button>
            </div>

            ${selected.kind === "path" ? trailEndsHtml(record) : ""}
        `;
    }

    function positionFields(record) {
        return field("Across (%)", num("x", record.x, "0.1", 'min="0" max="100"'), true)
            + field("Down (%)", num("y", record.y, "0.1", 'min="0" max="100"'), true);
    }

    function roomFields(record) {
        return field("Size", num("size", record.size == null ? 1 : record.size, "0.05", 'min="0.2" max="6"'), true)
            + field("Rotation", num("rotation", record.rotation || 0, "1", 'min="-180" max="180"'), true)
            + field("Floor / area", `<input type="text" data-set="floor" value="${esc(record.floor || "")}">`, true)
            + field("Status", `<select data-set="status">${STATUS_OPTIONS
                .map(([v, l]) => `<option value="${v}"${(record.status || "") === v ? " selected" : ""}>${l}</option>`).join("")}</select>`, true);
    }

    /* A trail's own settings, and the one that matters most is the first:
       whether this connection is walked or ruled. The builder decides it
       from the two rooms — a route between junctions is walked, a door into
       a dead end is a stroke — and this is where that can be overruled for
       any single one of them. */
    /* How far a trail bows out from the straight line between its two ends,
       as a percentage of the sheet, positive one way and negative the other.

       There is already a way to shape a trail — drag its control points —
       and it is the right tool for a curve that has to go round something.
       It is a poor tool for "that one is a bit flat": you have to find the
       middle dot, work out which way perpendicular is, and drag. A single
       number does that in one move, and reading it off the existing points
       rather than storing it means it stays true for a trail shaped by hand
       and for one that has never been touched. */
    // What a trail falls back to when it has no gap of its own. Matches
    // DEFAULT_LABEL_GAP in js/wizard-map.js, which is the one that actually
    // draws — this only fills in the placeholder text.
    function mapGapDefault() {
        const g = Number(data.map && data.map.labelGap);
        return Number.isFinite(g) && g >= 0 ? g : 0.34;
    }

    function bendOf(path) {
        const pts = path.points || [];
        if (pts.length < 3) return 0;
        const a = pts[0], b = pts[pts.length - 1];
        const mid = pts[Math.floor(pts.length / 2)];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        // Signed distance of the middle point from the chord: positive to
        // one side, negative to the other, which is what makes a single
        // slider able to bow it either way.
        return round(((mid[0] - (a[0] + b[0]) / 2) * -dy + (mid[1] - (a[1] + b[1]) / 2) * dx) / len);
    }

    /* Rebuilds the trail as its two ends and one bend of the given depth.

       This throws away any extra points somebody has placed by hand, and
       says so on the control — a bend is a whole-shape decision, and there
       is no sensible way to apply one to a curve with five bends in it
       already without inventing a different curve anyway. */
    function setBend(path, amount) {
        const pts = path.points || [];
        if (pts.length < 2) return;
        const a = pts[0], b = pts[pts.length - 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        path.points = [
            a,
            [round((a[0] + b[0]) / 2 - (dy / len) * amount),
             round((a[1] + b[1]) / 2 + (dx / len) * amount)],
            b
        ];
    }

    function trailFields(record) {
        const style = record.style || "walk";
        const from = record.from ? find("room", record.from) : null;
        const to = record.to ? find("room", record.to) : null;
        // Named by where they actually go, not "forwards" and "backwards" —
        // which end is which is not something anybody can tell by looking.
        const there = to ? `to ${to.name}` : "to the far end";
        const back = from ? `to ${from.name}` : "to the near end";
        const opt = (v, label) => `<option value="${v}"${style === v ? " selected" : ""}>${esc(label)}</option>`;
        return field("Drawn as", `<select data-set="style">
                ${opt("walk", "Footprints — a walked route")}
                ${opt("walk-there", `Footprints, all one way — walking ${there}`)}
                ${opt("walk-back", `Footprints, all one way — walking ${back}`)}
                ${opt("line", "Pen stroke — a short link")}
                ${opt("arrow-there", `Arrow — one way only, ${there}`)}
                ${opt("arrow-back", `Arrow — one way only, ${back}`)}
            </select>`)
            + (style === "arrow-there" || style === "arrow-back" || style === "arrow"
                ? `<p class="admin-hint">One way only. ${esc(style === "arrow-back" ? (to ? to.name : "The far room") : (from ? from.name : "The near room"))}
                   leads along it; the room it points at does not lead back, and will not list it as a way out.</p>`
                : "")
            + field(`Bend${(record.points || []).length > 3 ? " — replaces the bends you have placed" : ""}`,
                `<input type="range" data-set="bend" min="-18" max="18" step="0.5" value="${bendOf(record)}">
                 <output class="admin-wiz-range-out">${bendOf(record)}</output>`)
            /* How near this trail may come to a room's name, in per cent of
               the sheet's width. Blank means "whatever the map says" — the
               setting under Map settings — so the ordinary case is one
               number for the whole map and this is the exception for the one
               trail that wants to run closer or further off. */
            + field("Gap from names", num("gap", record.gap == null ? "" : record.gap, "0.05",
                `min="0" max="6" placeholder="map default (${mapGapDefault()})"`), true)
            + field("Footprint gap", num("spacing", record.spacing || "", "0.1", 'min="0.3" placeholder="auto"'), true)
            + field("Footprint size", num("size", record.size || "", "0.05", 'min="0.2" placeholder="auto"'), true)
            + field("Opacity", num("opacity", record.opacity == null ? "" : record.opacity, "0.05", 'min="0.05" max="1" placeholder="1"'), true)
            + field("Secret way", `<select data-set="secret">
                <option value=""${record.secret ? "" : " selected"}>No — an ordinary route</option>
                <option value="1"${record.secret ? " selected" : ""}>Yes — drawn faintly</option>
            </select>`, true)
            + field("Exit description", `<input type="text" data-set="exit" value="${esc(record.exit || "")}" placeholder="Library entrance">`);
    }

    /* How a picture blends into the parchment.

       The names are CSS blend modes, worded as what they do rather than as
       what they are called — nobody outside a graphics program knows what
       "luminosity" means, but everybody knows "keep only the shading". The
       first is the honest default: a picture pasted flat on top.

       "Multiply" is the one that matters and the reason this control
       exists. An illustration dropped on the sheet looks like a rectangle
       of somebody else's paper; multiplied into it, the map's own grain and
       stains come through and it reads as drawn on rather than glued on. */
    const BLEND_MODES = [
        ["", "Normal — sits on top"],
        ["multiply", "Multiply — ink soaks into the paper"],
        ["darken", "Darken — keeps only what is darker"],
        ["overlay", "Overlay — deepens the darks, lifts the lights"],
        ["soft-light", "Soft light — a gentler overlay"],
        ["hard-light", "Hard light — a harsher overlay"],
        ["screen", "Screen — lightens, like a wash"],
        ["lighten", "Lighten — keeps only what is lighter"],
        ["color-burn", "Colour burn — deep, heavy stain"],
        ["luminosity", "Luminosity — keeps the shading, takes the paper's colour"],
        ["color", "Colour — keeps the colour, takes the paper's shading"]
    ];

    function layerFields(record) {
        const opt = (v, label, sel) => `<option value="${v}"${sel === v || (!sel && !v) ? " selected" : ""}>${label}</option>`;
        return field("Name", `<input type="text" data-set="name" value="${esc(record.name || "")}">`)
            + field("Blends", `<select data-set="blend">${BLEND_MODES
                .map(([v, l]) => opt(v, l, record.blend || "")).join("")}</select>`)
            + field("Width (%)", num("w", record.w || "", "0.5", 'min="1" max="300"'), true)
            + field("Height (%)", num("h", record.h || "", "0.5", 'min="1" max="300" placeholder="auto"'), true)
            + field("Opacity", num("opacity", record.opacity == null ? "" : record.opacity, "0.05", 'min="0.05" max="1" placeholder="1"'), true)
            + field("Layer order", num("z", record.z == null ? "" : record.z, "1", 'placeholder="0"'), true)
            + field("Rotation", num("rotation", record.rotation || 0, "1", 'min="-180" max="180"'), true)
            + field("Fade to grey", num("grayscale", record.grayscale == null ? "" : record.grayscale, "0.05", 'min="0" max="1" placeholder="0"'), true)
            + field("Age it (sepia)", num("sepia", record.sepia == null ? "" : record.sepia, "0.05", 'min="0" max="1" placeholder="0"'), true)
            + field("Brightness", num("brightness", record.brightness == null ? "" : record.brightness, "0.05", 'min="0" max="3" placeholder="1"'), true)
            + field("Contrast", num("contrast", record.contrast == null ? "" : record.contrast, "0.05", 'min="0" max="3" placeholder="1"'), true)
            + field("Colour strength", num("saturate", record.saturate == null ? "" : record.saturate, "0.05", 'min="0" max="3" placeholder="1"'), true)
            + field("Blur (px)", num("blur", record.blur == null ? "" : record.blur, "0.5", 'min="0" max="40" placeholder="0"'), true)
            + field("Flip", `<select data-set="flip">
                ${opt("", "Not flipped", record.flipX ? (record.flipY ? "both" : "x") : (record.flipY ? "y" : ""))}
                ${opt("x", "Left to right", record.flipX ? (record.flipY ? "both" : "x") : (record.flipY ? "y" : ""))}
                ${opt("y", "Top to bottom", record.flipX ? (record.flipY ? "both" : "x") : (record.flipY ? "y" : ""))}
                ${opt("both", "Both", record.flipX ? (record.flipY ? "both" : "x") : (record.flipY ? "y" : ""))}
            </select>`, true)
            + field("Replace the picture", `<input type="file" data-set="imageFile" accept="image/*">`);
    }

    function trailTitle(path) {
        const from = path.from ? find("room", path.from) : null;
        const to = path.to ? find("room", path.to) : null;
        if (!from && !to) return "Unattached trail";
        return `${from ? from.name : "?"} → ${to ? to.name : "?"}`;
    }

    /* Which rooms a trail runs between. Both rooms list it under "Leads to"
       on the map, in both directions, so this is the one field that changes
       what a visitor can find rather than only how it looks. */
    function trailEndsHtml(path) {
        const options = sel => data.rooms
            .slice().sort((a, b) => a.name.localeCompare(b.name))
            .map(r => `<option value="${esc(r.id)}"${sel === r.id ? " selected" : ""}>${esc(view.fullName(r))}</option>`)
            .join("");
        return `
            <div class="admin-wiz-inspector-grid">
                ${field("Runs from", `<select data-set="from"><option value="">— not set —</option>${options(path.from)}</select>`)}
                ${field("Runs to", `<select data-set="to"><option value="">— not set —</option>${options(path.to)}</select>`)}
            </div>
            <div class="admin-wiz-band-row">
                <button type="button" class="admin-action-pill" data-act="add-bend">+ Add a bend</button>
                <button type="button" class="admin-action-pill" data-act="reverse">Reverse direction</button>
                <button type="button" class="admin-action-pill" data-act="straighten">Straighten</button>
                <button type="button" class="admin-action-pill" data-act="reattach">Snap ends to rooms</button>
            </div>
            <p class="admin-hint">This trail has <strong>${(path.points || []).length}</strong> points.
                Click anywhere along it on the map to add a bend there, drag a dot to shape it, and
                double-click a dot to take it out again.</p>
        `;
    }

    async function onInspectorInput(e) {
        const field = e.target.dataset.set;
        if (!field || !selected) return;
        const record = find(selected.kind, selected.id);
        if (!record) return;

        // Fields that change what the record IS rather than where it sits.
        // Saved on the spot; positions wait for Save Positions.
        const immediate = ["from", "to", "style", "secret", "exit", "name", "floor", "status", "blend"];

        /* Swapping the picture out. Uploaded first and only then written to
           the record, so a failed upload leaves the old picture in place
           rather than leaving the layer pointing at nothing. */
        if (field === "imageFile") {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            e.target.value = "";
            try {
                say("Uploading…", "");
                const uploaded = await ctx.uploadImage(record.name || "layer", file);
                record.image = uploaded.url;
                await saveOne("layer", record);
                view.setData(data);
                view.render();
                restoreSelection();
                drawHandles();
                say("Picture replaced.", "good");
            } catch (err) {
                if (err.status === 401) return ctx.lockOut();
                say("Could not replace it — " + (err.message || "try again."), "bad");
            }
            return;
        }

        /* The bend slider. Live, so the trail curves under the hand rather
           than after it — which is the only way to judge a curve. The
           number beside it updates in place instead of re-rendering the
           inspector, because re-rendering would replace the slider being
           dragged and the drag would stop dead. */
        if (field === "bend") {
            setBend(record, Number(e.target.value));
            redrawTrail(record);
            const out = e.target.parentElement.querySelector(".admin-wiz-range-out");
            if (out) out.textContent = e.target.value;
            markMoved("path", record.id);
            return;
        }

        /* Flipping is one control over two fields. Two tick boxes would be
           the literal mapping and a worse one: "left to right, top to
           bottom, or both" is the question somebody actually has. */
        if (field === "flip") {
            record.flipX = e.target.value === "x" || e.target.value === "both";
            record.flipY = e.target.value === "y" || e.target.value === "both";
            view.redrawLayer(record);
            markMoved("layer", record.id);
            return;
        }

        if (field === "from" || field === "to") {
            record[field] = e.target.value;
            const room = find("room", e.target.value);
            if (room && Array.isArray(record.points) && record.points.length >= 2) {
                record.points[field === "from" ? 0 : record.points.length - 1] = [room.x, room.y];
                redrawTrail(record);
            }
            await saveOne(selected.kind, record);
            renderInspector();
            return;
        }

        if (immediate.includes(field)) {
            record[field] = field === "secret" ? e.target.value === "1" : e.target.value;
            if (field === "style" || field === "secret") redrawTrail(record);
            if (field === "blend") view.redrawLayer(record);
            await saveOne(selected.kind, record);
            if (field === "name" || field === "status") { view.render(); restoreSelection(); renderRoomList(); }
            renderInspector();
            return;
        }

        const raw = e.target.value;
        record[field] = raw === "" ? null : Number(raw);

        if (field === "x" || field === "y") {
            const el = view.elementFor(selected.kind, selected.id);
            if (el) { el.style.left = record.x + "%"; el.style.top = record.y + "%"; }
            if (selected.kind === "room") followRoom(record);
            if (selected.kind === "layer") applyLayerBox(record);
        } else if (selected.kind === "layer") {
            applyLayerBox(record);
        } else if (selected.kind === "path") {
            redrawTrail(record);
        } else {
            const el = view.elementFor(selected.kind, selected.id);
            if (el) {
                el.style.setProperty("--room-scale", record.size == null ? 1 : record.size);
                el.style.setProperty("--room-turn", (record.rotation || 0) + "deg");
            }
        }
        view.applyBands();
        markMoved(selected.kind, selected.id);
    }

    /* Everything the group panel offers. Handled before the single-record
       branches below, because those all begin by looking up ONE record and
       there is no one record here. */
    function onMultiAction(name) {
        const records = picked.map(p => ({ p, record: find(p.kind, p.id) })).filter(x => x.record);
        if (!records.length) return true;

        if (name === "multi-none") { select(null); return true; }

        /* Hiding saves each record outright rather than going on the unsaved
           pile. `hidden` is deliberately NOT one of the fields a bulk save
           may touch — see MOVABLE in netlify/functions/wizard.js, which
           holds the line at "where a thing sits, never what it is" — so
           marking these as moved would clear the badge and lose the change,
           which is exactly the bug the note on CARRIED warns about. */
        if (name === "multi-hide" || name === "multi-show") {
            const hidden = name === "multi-hide";
            (async () => {
                let done = 0;
                for (const { p, record } of records) {
                    if (!!record.hidden === hidden) continue;
                    record.hidden = hidden;
                    if (await saveOne(p.kind, record)) done++;
                    else { record.hidden = !hidden; break; }
                }
                view.setData(data);
                view.render();
                restoreSelection();
                drawHandles();
                renderRoomList();
                say(done ? `${done} ${hidden ? "hidden" : "shown"}.` : "Nothing to change.", done ? "good" : "");
            })();
            return true;
        }

        // Lining up applies to rooms only: a trail has no single position to
        // line up, and a picture lined up by its middle rarely looks it.
        const rooms = records.filter(x => x.p.kind === "room");
        if (rooms.length < 2) return true;

        if (name === "align-x" || name === "align-y") {
            const axis = name === "align-x" ? "x" : "y";
            // To the average, not to the first picked: aligning to whichever
            // one happened to be clicked first moves the other four a long
            // way for no reason anybody watching could predict.
            const mean = rooms.reduce((s, x) => s + x.record[axis], 0) / rooms.length;
            for (const { p, record } of rooms) { record[axis] = round(mean); markMoved(p.kind, p.id); }
        } else if (name === "spread-x" || name === "spread-y") {
            const axis = name === "spread-x" ? "x" : "y";
            const sorted = rooms.slice().sort((a, b) => a.record[axis] - b.record[axis]);
            const first = sorted[0].record[axis];
            const last = sorted[sorted.length - 1].record[axis];
            const step = (last - first) / (sorted.length - 1);
            // The two at the ends stay put and everything between is spaced
            // evenly, so the group keeps the extent it already had.
            sorted.forEach((x, i) => { x.record[axis] = round(first + step * i); markMoved(x.p.kind, x.p.id); });
        } else {
            return false;
        }

        for (const { record } of rooms) {
            const el = view.elementFor("room", record.id);
            if (el) { el.style.left = record.x + "%"; el.style.top = record.y + "%"; }
            followRoom(record);
        }
        return true;
    }

    function onInspectorClick(e) {
        const band = e.target.closest("[data-band]");
        const act = e.target.closest("[data-act]");

        if (act && act.dataset.act.startsWith("multi-")) { onMultiAction(act.dataset.act); return; }
        if (act && picked.length > 1 && /^(align|spread)-/.test(act.dataset.act)) {
            onMultiAction(act.dataset.act);
            return;
        }

        if (!selected) return;
        const record = find(selected.kind, selected.id);
        if (!record) return;

        if (band) {
            const zoom = Math.round(view.getZoom() * 10) / 10;
            if (band.dataset.band === "from") record.fromZoom = zoom;
            else if (band.dataset.band === "to") record.toZoom = zoom;
            else { record.fromZoom = null; record.toZoom = null; }
            view.applyBands();
            markMoved(selected.kind, selected.id);
            renderInspector();
            return;
        }
        if (!act) return;

        /* Adds a bend in the middle of the trail's longest straight, which
           is where there is most room for one and so where it is most
           likely to be wanted. The map's own click does the same job with
           aim; this is for when the trail runs behind a room name and there
           is nowhere on it to click. */
        if (act.dataset.act === "add-bend") {
            const pts = record.points || [];
            if (pts.length < 2) return;
            let at = 1, longest = -1;
            for (let i = 1; i < pts.length; i++) {
                const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
                if (d > longest) { longest = d; at = i; }
            }
            pts.splice(at, 0, [
                round((pts[at - 1][0] + pts[at][0]) / 2),
                round((pts[at - 1][1] + pts[at][1]) / 2)
            ]);
            redrawTrail(record);
            markMoved("path", record.id);
            renderInspector();
            return say(`Bend added — ${record.points.length} points now. Drag it to shape the curve.`, "good");
        }

        if (act.dataset.act === "edit") return openRoomForm(record.id);
        if (act.dataset.act === "delete") return deleteSelected();
        if (act.dataset.act === "hide") return toggleHidden(record);
        if (act.dataset.act === "centre") {
            return view.flyTo(record.x, record.y, Math.max(view.getZoom(), 2.2));
        }
        if (act.dataset.act === "reverse") {
            const from = record.from;
            record.from = record.to;
            record.to = from;
            record.points = record.points.slice().reverse();
            redrawTrail(record);
            saveOne("path", record).then(() => renderInspector());
            return;
        }
        if (act.dataset.act === "straighten") {
            // Back to two ends and a single bend in the middle — the shape
            // a new trail starts with, and the quickest way out of a curve
            // that has been dragged into a knot.
            const a = record.points[0];
            const b = record.points[record.points.length - 1];
            record.points = [a, [round((a[0] + b[0]) / 2), round((a[1] + b[1]) / 2)], b];
            redrawTrail(record);
            markMoved("path", record.id);
            return;
        }
        if (act.dataset.act === "reattach") {
            // Puts both ends back on the rooms they claim to join. Useful
            // after moving a room with the trail deselected, or after a
            // rebuild has moved everything.
            const from = find("room", record.from);
            const to = find("room", record.to);
            if (from) record.points[0] = [from.x, from.y];
            if (to) record.points[record.points.length - 1] = [to.x, to.y];
            redrawTrail(record);
            markMoved("path", record.id);
            say("Ends snapped back to their rooms.", "good");
        }
    }

    /* Off the public map, or back onto it.

       Saved on the spot rather than gathered with the unsaved moves: this is
       not a position, it is a decision about what visitors can see, and
       leaving it in a pile of pending drags is how somebody hides a room,
       closes the tab, and does not find out for a week that they didn't. */
    async function toggleHidden(record) {
        record.hidden = !record.hidden;
        if (!(await saveOne(selected.kind, record))) {
            record.hidden = !record.hidden;
            return;
        }
        view.setData(data);
        view.render();
        restoreSelection();
        drawHandles();
        renderRoomList();
        say(record.hidden
            ? "Hidden. It and its trails are off the public map; you can still see them here."
            : "Back on the public map.", "good");
    }

    async function deleteSelected() {
        const record = find(selected.kind, selected.id);
        if (!record) return;
        const what = selected.kind === "room" ? `the room "${view.fullName(record)}"`
            : selected.kind === "path" ? `the trail ${trailTitle(record)}`
                : `the picture "${record.name || "untitled"}"`;
        const extra = selected.kind === "room" ? " Every trail that runs to it goes too." : "";
        if (!await ctx.confirm(`Delete ${esc(what)}?${extra} This cannot be undone.`)) return;
        const kind = selected.kind, id = selected.id;
        try {
            await ctx.api.deleteWizardItem(ctx.token(), kind, id);
        } catch (err) {
            if (err.status === 401) return ctx.lockOut();
            return say("Could not delete — " + (err.message || "try again."), "bad");
        }

        /* Taken out of what is already loaded, rather than reloading the map.

           This used to call load(), which fetches the map afresh AND clears
           the unsaved pile — so deleting one trail threw away every move
           made since the last save and put the rooms back where the server
           still thought they were. Half an hour of arranging, gone on a
           delete, with the only clue a badge quietly going back to nought.

           The server has done the delete; the same delete is applied here.
           Everything else on the sheet keeps the position it has, unsaved or
           not, and the badge keeps its count. */
        const drop = (list, gone) => {
            const at = list.findIndex(r => r.id === gone);
            if (at >= 0) list.splice(at, 1);
            pending.delete(`${kind === "room" ? "room" : kind === "path" ? "path" : "layer"}:${gone}`);
        };

        if (kind === "room") {
            drop(data.rooms, id);
            // The server takes a room's trails with it (see the DELETE
            // branch in netlify/functions/wizard.js), so they go here too —
            // otherwise they stay on screen until the next reload, drawing
            // footprints to a room that no longer exists.
            for (const path of data.paths.filter(p => p.from === id || p.to === id)) {
                const at = data.paths.indexOf(path);
                if (at >= 0) data.paths.splice(at, 1);
                pending.delete(`path:${path.id}`);
            }
        } else if (kind === "path") {
            drop(data.paths, id);
        } else {
            drop(data.layers, id);
        }

        selected = null;
        picked = [];
        view.setData(data);
        view.render();
        restoreSelection();
        drawHandles();
        renderRoomList();
        renderInspector();
        updateDirty();
        say("Deleted.", "good");
    }

    // ---------- nudging ----------

    /* Arrow keys move the selected thing by a hair, shift by rather more.

       In map per cent, not pixels, so a nudge is the same nudge whatever
       zoom you are at — which is what you want when you are lining two
       names up with each other, and not what you get from a pixel step. */
    function onKeyDown(e) {
        if (!selected || !ctx.canWrite()) return;
        if (e.target.closest("input, textarea, select")) return;
        const step = e.shiftKey ? 1 : 0.15;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[e.key]) {
            e.preventDefault();
            // Locked means locked for the keyboard too, or the safety catch
            // has a hole in it exactly the width of an arrow key.
            if (locked) return say("The map is locked. Unlock it to move things.", "");

            // Everything picked, together, by the same step.
            if (picked.length > 1) {
                for (const p of picked) {
                    const rec = find(p.kind, p.id);
                    if (!rec) continue;
                    if (p.kind === "path") {
                        rec.points = rec.points.map(([x, y]) =>
                            [round(clamp(x + moves[e.key][0])), round(clamp(y + moves[e.key][1]))]);
                        redrawTrail(rec);
                    } else {
                        rec.x = round(clamp(rec.x + moves[e.key][0]));
                        rec.y = round(clamp(rec.y + moves[e.key][1]));
                        const el = view.elementFor(p.kind, rec.id);
                        if (el) { el.style.left = rec.x + "%"; el.style.top = rec.y + "%"; }
                    }
                    markMoved(p.kind, p.id);
                }
                // Same reasoning as the group drag: a trail already carried
                // must not have its ends moved a second time.
                const carried = new Set(picked.filter(p => p.kind === "path").map(p => p.id));
                for (const p of picked) {
                    if (p.kind !== "room") continue;
                    const rec = find(p.kind, p.id);
                    if (rec) followRoom(rec, carried);
                }
                return;
            }

            const record = find(selected.kind, selected.id);
            if (!record) return;
            if (selected.kind === "path") {
                record.points = record.points.map(([x, y]) =>
                    [round(clamp(x + moves[e.key][0])), round(clamp(y + moves[e.key][1]))]);
                redrawTrail(record);
            } else {
                record.x = round(clamp(record.x + moves[e.key][0]));
                record.y = round(clamp(record.y + moves[e.key][1]));
                const el = view.elementFor(selected.kind, selected.id);
                if (el) { el.style.left = record.x + "%"; el.style.top = record.y + "%"; }
                if (selected.kind === "room") followRoom(record);
                if (selected.kind === "layer") positionGrip(record);
            }
            markMoved(selected.kind, selected.id);
            renderInspector();
        } else if (e.key === "Escape") {
            select(null);
        }
    }

    // ---------- pictures ----------

    /* A picture placed on the map — the castle, a painting of the grounds,
       a crest over Hogsmeade. It is a record like any other, so it has a
       position, a size and a zoom band, which is the whole point: an
       illustration that fades out as you come down into the detail, with
       the room names underneath appearing as it goes. */
    async function addLayer(file) {
        if (!file) return;
        try {
            say("Uploading…", "");
            const uploaded = await ctx.uploadImage("layer", file);
            // Dropped in the middle of whatever is on screen, at a size that
            // is visible without covering everything, and behind the names.
            const box = els.stage.getBoundingClientRect();
            const middle = view.screenToPct(box.left + box.width / 2, box.top + box.height / 2);
            const created = await ctx.api.createWizardItem(ctx.token(), "layer", {
                name: file.name.replace(/\.[a-z0-9]+$/i, ""),
                image: uploaded.url,
                x: round(middle.x), y: round(middle.y),
                w: 22, opacity: 1, z: 0
            });
            data.layers.push(created);
            view.setData(data);
            view.render();
            select("layer", created.id);
            // An oversized picture is scaled down to fit the upload limit
            // rather than refused — say so, or it is a silent change to
            // somebody's artwork. See uploadImageFile in js/admin.js.
            say(uploaded.notice
                ? uploaded.notice + " Drag it about, drag its corner to resize."
                : "Picture added. Drag it about, drag its corner to resize, and set a zoom band below.",
                "good");
        } catch (err) {
            if (err.status === 401) return ctx.lockOut();
            say("Could not add that picture — " + (err.message || "try again."), "bad");
        }
    }

    // ---------- the room list ----------

    let roomQuery = "";
    let openRoomId = null;

    function renderRoomList() {
        const query = roomQuery.trim().toLowerCase();
        const rooms = data.rooms
            .filter(r => !query || `${r.name} ${r.note || ""} ${r.floor || ""}`.toLowerCase().includes(query))
            .slice()
            .sort((a, b) => (a.floor || "").localeCompare(b.floor || "") || a.name.localeCompare(b.name));

        els.roomList.innerHTML = "";
        if (!rooms.length) {
            els.roomList.innerHTML = `<p class="admin-empty">${data.rooms.length ? "No room by that name." : "No rooms on this map yet."}</p>`;
            return;
        }
        for (const room of rooms) {
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row admin-wiz-row";
            if (selected && selected.kind === "room" && selected.id === room.id) row.classList.add("is-selected");
            const done = [room.image ? "picture" : "", room.description ? "description" : ""].filter(Boolean);
            row.innerHTML = `
                <div class="admin-wiz-row-head">
                    <div class="row-info">
                        <h3>${esc(room.name)}${room.note ? ` <span class="admin-you-tag">${esc(room.note)}</span>` : ""}${room.hidden ? ` <span class="admin-wiz-hidden-tag">hidden</span>` : ""}</h3>
                        <p class="row-creator">${esc(room.floor || "No area set")}${done.length ? " · " + esc(done.join(" and ")) : " · nothing recorded"}</p>
                    </div>
                    <div class="admin-row-actions">
                        <button type="button" class="btn admin-wiz-find-btn">Find</button>
                        <button type="button" class="btn admin-edit-btn">${openRoomId === room.id ? "Close" : "Edit"}</button>
                    </div>
                </div>
                <div class="admin-wiz-row-form"></div>
            `;
            row.querySelector(".admin-wiz-find-btn").addEventListener("click", () => {
                view.flyTo(room.x, room.y, Math.max(view.getZoom(), 2.4));
                select("room", room.id);
                els.stage.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            row.querySelector(".admin-edit-btn").addEventListener("click", () => {
                openRoomId = openRoomId === room.id ? null : room.id;
                renderRoomList();
            });
            /* The form opens INSIDE the row it belongs to.

               It used to be one form below the whole list, which meant
               pressing Edit on the ninetieth room scrolled you away from the
               list to a form with no visible connection to what you had
               pressed. Expanding in place keeps the room you are editing and
               its name in the same piece of screen. */
            if (openRoomId === room.id) {
                row.classList.add("is-open");
                const holder = row.querySelector(".admin-wiz-row-form");
                holder.appendChild(buildRoomForm(room));
            }
            els.roomList.appendChild(row);
        }
    }

    function imageFieldHtml(name, label, current) {
        return `
            <div class="admin-wiz-image-field" data-image-field="${name}">
                <span class="admin-field-label">${label}</span>
                <div class="admin-wiz-preview">${current ? `<img src="${esc(current)}" alt="">` : ""}</div>
                <input type="hidden" name="${name}" value="${esc(current || "")}">
                <input type="file" name="${name}File" accept="image/*">
                ${current ? `<button type="button" class="admin-action-pill" data-clear>Remove</button>` : ""}
            </div>
        `;
    }

    function buildRoomForm(room) {
        const form = document.createElement("form");
        form.className = "admin-form is-open admin-wiz-inline-form";
        form.dataset.id = room.id;
        form.innerHTML = `
            ${field("Name", `<input type="text" name="name" required value="${esc(room.name)}">`)}
            ${field("Note — only needed when two rooms share a name", `<input type="text" name="note" value="${esc(room.note || "")}" placeholder="north, middle, by the lake…">`)}
            ${field("Full name from the sheet", `<input type="text" name="fullName" value="${esc(room.fullName || "")}" placeholder="Castle - Library">`)}
            ${field("Floor / area", `<input type="text" name="floor" value="${esc(room.floor || "")}" placeholder="Third Floor, Grounds, Hogsmeade…">`)}
            ${field("Status", `<select name="status">${STATUS_OPTIONS
                .map(([v, l]) => `<option value="${v}"${(room.status || "") === v ? " selected" : ""}>${l}</option>`).join("")}</select>`)}
            ${field("Description", `<textarea name="description" rows="5">${esc(room.description || "")}</textarea>`)}

            <div class="admin-wiz-images">
                ${imageFieldHtml("image", "Room picture", room.image)}
                ${imageFieldHtml("thumb", "Hover thumbnail — optional, the picture above is used when this is empty", room.thumb)}
            </div>

            <div class="admin-wiz-inspector-grid">
                ${field("Size", `<input type="number" name="size" step="0.05" min="0.2" max="6" value="${room.size == null ? 1 : room.size}">`, true)}
                ${field("Rotation", `<input type="number" name="rotation" step="1" min="-180" max="180" value="${room.rotation || 0}">`, true)}
                ${field("Appears from", `<input type="number" name="fromZoom" step="0.1" min="1" value="${room.fromZoom == null ? "" : room.fromZoom}" placeholder="always">`, true)}
                ${field("Hidden past", `<input type="number" name="toZoom" step="0.1" min="1" value="${room.toZoom == null ? "" : room.toZoom}" placeholder="never">`, true)}
            </div>

            <label class="admin-field admin-wiz-check">
                <input type="checkbox" name="hidden"${room.hidden ? " checked" : ""}>
                <span>Hidden from the public map — its trails go with it</span>
            </label>

            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill admin-wiz-cancel">Cancel</button>
            </div>
        `;
        form.querySelectorAll("input[type=file]").forEach(ctx.wireDropzone);
        form.querySelector(".admin-wiz-cancel").addEventListener("click", () => {
            openRoomId = null;
            renderRoomList();
        });
        form.querySelectorAll("[data-clear]").forEach(btn => {
            btn.addEventListener("click", () => {
                const wrap = btn.closest("[data-image-field]");
                wrap.querySelector("input[type=hidden]").value = "";
                wrap.querySelector(".admin-wiz-preview").innerHTML = "";
            });
        });
        form.addEventListener("submit", e => submitRoomForm(e, form));
        return form;
    }

    // Opening a room's form from the map: expand it in the list and scroll
    // the list to it, so the two halves of the panel stay in step.
    function openRoomForm(id) {
        openRoomId = id;
        renderRoomList();
        const row = els.roomList.querySelector(".admin-wiz-row.is-open");
        if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    async function submitRoomForm(e, form) {
        e.preventDefault();
        const errorEl = form.querySelector(".admin-form-error");
        const submitBtn = form.querySelector("button[type=submit]");
        const fd = new FormData(form);
        const name = (fd.get("name") || "").toString().trim();
        if (!name) {
            errorEl.textContent = "A room needs a name.";
            errorEl.style.display = "block";
            return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";
        errorEl.style.display = "none";

        try {
            // Uploads first: a record saved with a picture that failed to
            // upload is a record that quietly lost its picture.
            const images = {};
            for (const key of ["image", "thumb"]) {
                const file = fd.get(key + "File");
                images[key] = file && file.size
                    ? (await ctx.uploadImage(name, file)).url
                    : (fd.get(key) || "").toString();
            }
            const numOrNull = v => (v === "" || v == null ? null : Number(v));
            const id = form.dataset.id;
            const existing = find("room", id) || {};
            await ctx.api.updateWizardItem(ctx.token(), "room", {
                ...existing, id,
                name,
                note: (fd.get("note") || "").toString().trim(),
                fullName: (fd.get("fullName") || "").toString().trim(),
                floor: (fd.get("floor") || "").toString().trim(),
                status: (fd.get("status") || "").toString(),
                description: (fd.get("description") || "").toString(),
                size: Number(fd.get("size")) || 1,
                rotation: Number(fd.get("rotation")) || 0,
                fromZoom: numOrNull(fd.get("fromZoom")),
                toZoom: numOrNull(fd.get("toZoom")),
                hidden: fd.get("hidden") === "on",
                ...images
            });
            openRoomId = null;
            await load();
            say("Saved.", "good");
        } catch (err) {
            if (err.status === 401) return ctx.lockOut();
            errorEl.textContent = err.message || "Could not save that room.";
            errorEl.style.display = "block";
            submitBtn.disabled = false;
            submitBtn.textContent = "Save";
        }
    }

    async function addRoom() {
        const box = els.stage.getBoundingClientRect();
        const middle = view.screenToPct(box.left + box.width / 2, box.top + box.height / 2);
        try {
            const created = await ctx.api.createWizardItem(ctx.token(), "room", {
                name: "New room",
                x: round(middle.x), y: round(middle.y), size: 1
            });
            data.rooms.push(created);
            view.setData(data);
            view.render();
            select("room", created.id);
            openRoomForm(created.id);
            say("Room added in the middle of the view. Name it below, then drag it into place.", "good");
        } catch (err) {
            if (err.status === 401) return ctx.lockOut();
            say("Could not add a room — " + (err.message || "try again."), "bad");
        }
    }

    // ---------- map settings ----------

    function renderMapSettings() {
        const map = view.getMap();
        els.mapForm.innerHTML = `
            ${field("Map title", `<input type="text" name="title" value="${esc(map.title || "")}">`)}
            ${field("Intro line — shown under the title", `<input type="text" name="intro" value="${esc(map.intro || "")}">`)}
            ${field("Credit", `<input type="text" name="credit" value="${esc(map.credit || "")}" placeholder="Map created by…">`)}

            <div class="admin-wiz-images">
                ${imageFieldHtml("background", "Parchment background — optional, the drawn texture shows through where there is none", map.background)}
                ${imageFieldHtml("backgroundDetail", "The same parchment, scanned larger — optional, fetched only when someone zooms in past the level below", map.backgroundDetail)}
                ${imageFieldHtml("footprint", "Fallback footprint sprite", map.footprint)}
            </div>
            <p class="admin-hint">The second sheet is what keeps the paper's grain from going soft
                up close. Nobody downloads it until they zoom past
                <strong>${map.backgroundDetailZoom || 2.5}&times;</strong>, so the map still opens on the
                small one. Leave it empty and the small sheet is simply scaled up, as it always was.</p>

            <div class="admin-wiz-inspector-grid">
                ${field("Sheet width (px)", `<input type="number" name="width" min="200" value="${map.width}">`, true)}
                ${field("Sheet height (px)", `<input type="number" name="height" min="200" value="${map.height}">`, true)}
                ${field("Closest zoom", `<input type="number" name="maxZoom" step="0.5" min="1" value="${map.maxZoom}">`, true)}
                ${field("Footprint gap", `<input type="number" name="footprintSpacing" step="0.1" min="0" value="${map.footprintSpacing || 0}">`, true)}
                ${field("Gap from room names", `<input type="number" name="labelGap" step="0.05" min="0" max="6" value="${map.labelGap == null ? 0.34 : map.labelGap}">`, true)}
                ${field("Big sheet loads at", `<input type="number" name="backgroundDetailZoom" step="0.5" min="1" value="${map.backgroundDetailZoom == null ? 2.5 : map.backgroundDetailZoom}">`, true)}
            </div>
            <p class="admin-hint">How near a trail may come to a name, as a percentage of the sheet's
                width, for every trail that has not been given its own. 0 lets them touch the writing;
                around 0.3 is a hair's breadth; 1 is a clear margin. A single trail can differ — select
                it and set <strong>Gap from names</strong>.</p>

            <div class="admin-wiz-band-row">
                <span class="admin-hint">Opens at
                    <strong>${map.startZoom ? Math.round(map.startZoom * 100) + "%" : "the whole map"}</strong>${map.startZoom ? `, centred on ${(map.startX || 50).toFixed(0)}% / ${(map.startY || 50).toFixed(0)}%` : ""}.</span>
                <button type="button" class="admin-action-pill" data-map="start">Open here</button>
                <button type="button" class="admin-action-pill" data-map="start-clear">Open on the whole map</button>
            </div>
            <p class="admin-hint">Everything on the map is stored as a percentage, so re-exporting the parchment at a different size moves nothing.</p>

            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save map settings</button>
            </div>
        `;
        els.mapForm.querySelectorAll("input[type=file]").forEach(ctx.wireDropzone);
        els.mapForm.querySelectorAll("[data-clear]").forEach(btn => {
            btn.addEventListener("click", () => {
                const wrap = btn.closest("[data-image-field]");
                wrap.querySelector("input[type=hidden]").value = "";
                wrap.querySelector(".admin-wiz-preview").innerHTML = "";
            });
        });
    }

    /* The opening view, taken from wherever you happen to be looking.

       Typing four numbers into boxes to describe a view is a poor way to
       choose one. Pan and zoom until the map looks the way you want a
       visitor to find it, press the button, and that is the view. */
    let pendingStart = null;

    async function onMapFormClick(e) {
        const act = e.target.closest("[data-map]");
        if (!act) return;
        const map = view.getMap();
        if (act.dataset.map === "start") {
            const box = els.stage.getBoundingClientRect();
            const middle = view.screenToPct(box.left + box.width / 2, box.top + box.height / 2);
            pendingStart = { startX: round(middle.x), startY: round(middle.y), startZoom: Math.round(view.getZoom() * 100) / 100 };
        } else {
            pendingStart = { startX: null, startY: null, startZoom: null };
        }
        Object.assign(map, pendingStart);
        renderMapSettings();
        say("Opening view set. Press Save map settings to keep it.", "");
    }

    async function submitMapForm(e) {
        e.preventDefault();
        const fd = new FormData(els.mapForm);
        const submitBtn = els.mapForm.querySelector("button[type=submit]");
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";
        try {
            const images = {};
            for (const key of ["background", "backgroundDetail", "footprint"]) {
                const file = fd.get(key + "File");
                images[key] = file && file.size
                    ? (await ctx.uploadImage("map", file)).url
                    : (fd.get(key) || "").toString();
            }
            await ctx.api.updateWizardItem(ctx.token(), "map", {
                title: (fd.get("title") || "").toString(),
                intro: (fd.get("intro") || "").toString(),
                credit: (fd.get("credit") || "").toString(),
                width: Number(fd.get("width")),
                height: Number(fd.get("height")),
                maxZoom: Number(fd.get("maxZoom")),
                footprintSpacing: Number(fd.get("footprintSpacing")),
                backgroundDetailZoom: Number(fd.get("backgroundDetailZoom")) || 2.5,
                /* Not `|| 0.34`: 0 is a real answer here — it means "let the
                   trails touch the writing" — and || would quietly turn it
                   back into the default every time it was chosen. */
                labelGap: fd.get("labelGap") === "" || fd.get("labelGap") === null
                    ? 0.34 : Number(fd.get("labelGap")),
                ...(pendingStart || {}),
                ...images
            });
            pendingStart = null;
            await load();
            say("Map settings saved.", "good");
        } catch (err) {
            if (err.status === 401) return ctx.lockOut();
            say("Could not save the map — " + (err.message || "try again."), "bad");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Save map settings";
        }
    }

    // ---------- filling the window ----------

    /* The map, at the size of the whole page.

       Arranging ninety-three names in a frame a third of the window high is
       working through a letterbox. Expanded, the editor is the page: the
       toolbar, the map and the inspector, and nothing else. Escape closes
       it, because a full-screen thing with no way out is a trap. */
    function toggleExpanded(force) {
        const on = force == null ? !els.editor.classList.contains("is-expanded") : force;
        els.editor.classList.toggle("is-expanded", on);
        document.body.classList.toggle("admin-wiz-expanded", on);
        els.expandBtn.textContent = on ? "Shrink" : "Expand";
        els.expandBtn.setAttribute("aria-pressed", on ? "true" : "false");
        // The frame has changed size, so the fit has to be worked out again
        // or the map keeps the scale it had in the small one.
        requestAnimationFrame(() => view.refit());
    }

    // ---------- setting up ----------

    function init(context) {
        ctx = context;
        els = {
            editor: $("wiz-admin-editor"),
            stage: $("wiz-admin-stage"),
            canvas: $("wiz-admin-canvas"),
            handles: $("wiz-admin-handles"),
            modes: $("wiz-admin-modes"),
            help: $("wiz-admin-help"),
            status: $("wiz-admin-status"),
            dirty: $("wiz-admin-dirty"),
            savePositions: $("wiz-admin-save-positions"),
            zoomLabel: $("wiz-admin-zoom"),
            inspector: $("wiz-admin-inspector"),
            expandBtn: $("wiz-admin-expand"),
            lockBtn: $("wiz-admin-lock"),
            roomList: $("wiz-rooms-list"),
            roomSearch: $("wiz-rooms-search"),
            addRoomBtn: $("wiz-add-room-btn"),
            addLayerInput: $("wiz-add-layer-file"),
            mapForm: $("wiz-map-form")
        };
        if (!els.stage) return;

        view = WizardMap({
            stage: els.stage,
            canvas: els.canvas,
            // Nothing on the editor's map is a button: a room is something
            // you drag, and a <button> that moves under the pointer fights
            // the drag with its own click and focus behaviour.
            roomsAreButtons: false,
            // A record hidden by its own zoom band is still a record that
            // has to be findable in order to be changed. See applyBands.
            revealHidden: true,
            // The invisible band along each trail that makes it clickable at
            // any zoom — see drawHitLine in js/wizard-map.js.
            trailHitLines: true,
            onView: z => {
                els.zoomLabel.textContent = `${Math.round(z * 100)}%`;
                // The band buttons read "from here", so they have to know
                // where "here" is. And a layer's grip is positioned in
                // per cent of a box that has just changed scale.
                if (selected) {
                    renderInspector();
                    if (selected.kind === "layer") positionGrip(find("layer", selected.id));
                }
            },
            onPointerDown
        });

        els.stage.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        els.stage.addEventListener("click", onMapClick);
        els.stage.addEventListener("dblclick", onMapDoubleClick);
        document.addEventListener("keydown", e => {
            if (els.editor.hidden || $("wiz-admin-stage") == null) return;
            const panel = document.querySelector('.admin-panel[data-panel="wizard"]');
            if (!panel || panel.hidden) return;
            if (e.key === "Escape" && els.editor.classList.contains("is-expanded")) {
                return toggleExpanded(false);
            }
            onKeyDown(e);
        });

        els.modes.addEventListener("click", e => {
            const btn = e.target.closest("[data-mode]");
            if (btn) setMode(btn.dataset.mode);
        });
        els.savePositions.addEventListener("click", savePositions);
        els.expandBtn.addEventListener("click", () => toggleExpanded());
        if (els.lockBtn) els.lockBtn.addEventListener("click", () => setLocked(!locked));
        // Remembered, because it is a way of working rather than a setting
        // for one sitting: somebody arranging pictures wants it on all
        // afternoon, and having to find it again after every reload is how a
        // safety catch stops being used.
        try { setLocked(localStorage.getItem(LOCK_KEY) === "1"); } catch (err) { setLocked(false); }
        els.inspector.addEventListener("input", onInspectorInput);
        els.inspector.addEventListener("change", onInspectorInput);
        els.inspector.addEventListener("click", onInspectorClick);
        els.mapForm.addEventListener("submit", submitMapForm);
        els.mapForm.addEventListener("click", onMapFormClick);
        els.addRoomBtn.addEventListener("click", addRoom);
        els.addLayerInput.addEventListener("change", () => {
            const file = els.addLayerInput.files[0];
            els.addLayerInput.value = "";
            addLayer(file);
        });
        els.roomSearch.addEventListener("input", () => {
            roomQuery = els.roomSearch.value;
            renderRoomList();
        });
        $("wiz-admin-zoom-in").addEventListener("click", () => view.zoomTo(view.getZoom() * 1.5));
        $("wiz-admin-zoom-out").addEventListener("click", () => view.zoomTo(view.getZoom() / 1.5));
        $("wiz-admin-zoom-reset").addEventListener("click", () => view.setZoom(1));

        /* Leaving with unsaved moves is the one way to lose real work here —
           a pass over the map is deliberately not saved as it goes. */
        window.addEventListener("beforeunload", e => {
            if (!pending.size) return;
            e.preventDefault();
            e.returnValue = "";
        });

        setMode("move");
        load();
    }

    /* The panel is only drawn when it is first opened. Rendering a map into
       a hidden element gives every measurement a width of zero, so the fit
       is computed against nothing and the first view is wrong. */
    function onShown() {
        if (view) view.refit();
    }

    return { init, onShown, reload: load };
})();

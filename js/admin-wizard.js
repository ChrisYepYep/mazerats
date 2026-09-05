/* The Hogwarts panel in the admin page — where the map at /wizard is made.

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
    let selected = null;          // { kind, id }
    let trailFrom = null;         // first room picked in TRAIL mode
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
            "opacity", "spacing", "blend", "flipX", "flipY",
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
        move: "Drag a name, a trail or a picture to move it. Drag the parchment to pan, scroll to zoom. Click something to select it; arrow keys nudge, shift+arrows nudge further.",
        trail: "Click one room, then another, to lay a trail between them. Click a trail to select it, then drag its points to bend it — double-click a point to remove it, click the line to add one.",
        zoom: "Zoom to where you want something to appear, select it, then set the band. Things outside their band are shown here as ghosts so you can still find them."
    };

    function setMode(next) {
        mode = next;
        els.modes.querySelectorAll("[data-mode]").forEach(btn => {
            const on = btn.dataset.mode === next;
            btn.classList.toggle("active", on);
            btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
        els.help.textContent = MODE_HELP[next];
        els.stage.dataset.mode = next;
        trailFrom = null;
        drawHandles();
        renderInspector();
    }

    // ---------- selection ----------

    function select(kind, id) {
        selected = kind ? { kind, id } : null;
        restoreSelection();
        drawHandles();
        renderInspector();
        renderRoomList();
    }

    // Re-applies the selection ring after a render has thrown away the
    // elements it was on.
    function restoreSelection() {
        els.canvas.querySelectorAll(".is-selected").forEach(el => el.classList.remove("is-selected"));
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
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        return false;
    }

    function onPointerDown(e) {
        if (!ctx.canWrite()) return;

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

    function onPointerMove(e) {
        if (!drag) return;
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

    function followRoom(room) {
        for (const path of data.paths) {
            if (!Array.isArray(path.points) || path.points.length < 2) continue;
            let moved = false;
            if (path.from === room.id) { path.points[0] = [room.x, room.y]; moved = true; }
            if (path.to === room.id) { path.points[path.points.length - 1] = [room.x, room.y]; moved = true; }
            if (moved) {
                redrawTrail(path);
                markMoved("path", path.id);
            }
        }
    }

    function onPointerUp() {
        if (!drag) return;
        const was = drag;
        drag = null;
        drawHandles();
        if (was.kind === "resize" || was.kind === "trail") renderInspector();
        else renderInspector();
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
        const room = e.target.closest(".wiz-room");
        const trail = e.target.closest(".wiz-trail");
        const layer = e.target.closest(".wiz-layer");

        if (mode === "trail") {
            if (room) return pickForTrail(room.dataset.id);
            if (trail) return select("path", trail.dataset.id);
            if (selected && selected.kind === "path" && e.target.closest(".wiz-handle-line")) {
                return addBendAt(e.clientX, e.clientY);
            }
            return select(null);
        }

        if (room) return select("room", room.dataset.id);
        if (layer) return select("layer", layer.dataset.id);
        if (trail) return select("path", trail.dataset.id);
        select(null);
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
    function renderInspector() {
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
        return field("Drawn as", `<select data-set="style">
                <option value="walk"${style === "walk" ? " selected" : ""}>Footprints — a walked route</option>
                <option value="line"${style === "line" ? " selected" : ""}>Pen stroke — a short link</option>
            </select>`)
            + field(`Bend${(record.points || []).length > 3 ? " — replaces the bends you have placed" : ""}`,
                `<input type="range" data-set="bend" min="-18" max="18" step="0.5" value="${bendOf(record)}">
                 <output class="admin-wiz-range-out">${bendOf(record)}</output>`)
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
                <button type="button" class="admin-action-pill" data-act="reverse">Reverse direction</button>
                <button type="button" class="admin-action-pill" data-act="straighten">Straighten</button>
                <button type="button" class="admin-action-pill" data-act="reattach">Snap ends to rooms</button>
            </div>
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

    function onInspectorClick(e) {
        const band = e.target.closest("[data-band]");
        const act = e.target.closest("[data-act]");
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
        try {
            await ctx.api.deleteWizardItem(ctx.token(), selected.kind, selected.id);
            selected = null;
            say("Deleted.", "good");
            await load();
        } catch (err) {
            if (err.status === 401) return ctx.lockOut();
            say("Could not delete — " + (err.message || "try again."), "bad");
        }
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
            say("Picture added. Drag it about, drag its corner to resize, and set a zoom band below.", "good");
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
            ${field("Full name from the sheet", `<input type="text" name="fullName" value="${esc(room.fullName || "")}" placeholder="Hogwarts - Library">`)}
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
                ${imageFieldHtml("footprint", "Fallback footprint sprite", map.footprint)}
            </div>

            <div class="admin-wiz-inspector-grid">
                ${field("Sheet width (px)", `<input type="number" name="width" min="200" value="${map.width}">`, true)}
                ${field("Sheet height (px)", `<input type="number" name="height" min="200" value="${map.height}">`, true)}
                ${field("Closest zoom", `<input type="number" name="maxZoom" step="0.5" min="1" value="${map.maxZoom}">`, true)}
                ${field("Footprint gap", `<input type="number" name="footprintSpacing" step="0.1" min="0" value="${map.footprintSpacing || 0}">`, true)}
            </div>

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
            for (const key of ["background", "footprint"]) {
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

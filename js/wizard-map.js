/* The Habbo Hogwarts map, as a thing that can be drawn and moved about.

   Two pages need this and need it to agree with itself: /wizard, where a
   visitor reads the map (js/wizard.js), and the Hogwarts panel in the admin,
   where it is edited (js/admin-wizard.js). An editor that drew the map even
   slightly differently from the page would be an editor you cannot trust —
   you would arrange a name until it looked right and find it somewhere else
   on the site. So the drawing, the panning, the zooming and the zoom bands
   all live here, once, and both pages are thin layers of their own concerns
   on top: hover cards and room sheets on one, dragging and trail-drawing on
   the other.

   Three ideas hold it up.

   ONE COORDINATE SPACE. Everything on the map is stored as a percentage of
   the map's own width and height, and the whole lot lives inside a single
   element that is panned and scaled as one. So a room label is positioned
   once, when it is drawn, and never repositioned: pan and zoom are a
   transform on its great-grandparent. That is also why the names stay crisp
   at every zoom — they are real text being re-rendered, not pixels being
   enlarged.

   ZOOM IS A RANGE, NOT A NUMBER. Every layer, room and trail carries a band
   of zoom levels it is drawn at. A painting of the forest belongs at the far
   end and wants to be gone by the time you are among the trees; the names of
   the rooms among those trees are the other way round. Crossing a band edge
   fades rather than switches, so nothing pops.

   ZOOM IS RELATIVE TO THE WINDOW. Zoom 1 is the whole map fitted to whatever
   it is being read in — not a fixed number of pixels. A band set on a
   desktop therefore means the same thing on a phone, and the same thing in
   the editor's small frame as on the full-width page, which it would not if
   the numbers were pixel scales.

   Usage:

       const view = WizardMap({ stage, canvas, onRoomClick, onRoomHover });
       view.setData(payload);   // { map, rooms, paths, layers }
       view.flyTo(x, y, 2.5);

   The caller owns the markup — see wizard.html and the Hogwarts panel in
   admin.html for the elements this expects to find inside `stage`. */
window.WizardMap = function WizardMap(options) {
    const stage = options.stage;
    const canvas = options.canvas;
    const layersEl = canvas.querySelector(".wiz-layers");
    const trailsEl = canvas.querySelector(".wiz-trails");
    const roomsEl = canvas.querySelector(".wiz-rooms");

    // Whether this instance pans and zooms in response to the pointer. The
    // editor turns dragging off while it is in a mode where a drag means
    // something else — moving a room, shaping a trail — and does its own
    // panning from the space bar and the scroll wheel instead.
    let panEnabled = options.pan !== false;

    let map = defaultMap();
    let rooms = [];
    let paths = [];
    let layers = [];

    // Every drawn thing that carries a zoom band, paired with its element,
    // so applyBands has one flat list to walk rather than three.
    let banded = [];
    const roomEls = new Map();
    const pathEls = new Map();
    const layerEls = new Map();

    function defaultMap() {
        return { width: 2000, height: 1125, minZoom: 1, maxZoom: 6, footprintSpacing: 2.2, footprintSize: 1 };
    }

    // ---------- the view ----------

    let fit = 1;
    let zoom = 1;
    let panX = 0;
    let panY = 0;

    /* The map fitted to the stage with a little room to spare. The margin is
       not decoration: a room's label is centred on its point and spills
       either side of it, so a name near the right-hand edge — Astronomy
       Tower, Gryffindor Hall — extends past the map's own boundary and,
       fitted exactly, is cut in half by the frame. */
    const FIT_MARGIN = 0.94;

    function stageSize() {
        const box = stage.getBoundingClientRect();
        return { w: box.width, h: box.height };
    }

    function computeFit() {
        const { w, h } = stageSize();
        if (!w || !h) return 1;
        return Math.min(w / map.width, h / map.height) * FIT_MARGIN;
    }

    /* Keeps the map in the window. Smaller than the stage in an axis, it is
       centred in that axis; bigger, it is held so no edge comes inside the
       stage. Done per-axis rather than as one rule because at most zoom
       levels the map is wider than the frame and shorter than it at the same
       time, and a single rule has to be wrong about one of them. */
    function clampPan() {
        const { w, h } = stageSize();
        const scale = fit * zoom;
        const mapW = map.width * scale;
        const mapH = map.height * scale;
        panX = mapW <= w ? (w - mapW) / 2 : Math.min(0, Math.max(w - mapW, panX));
        panY = mapH <= h ? (h - mapH) / 2 : Math.min(0, Math.max(h - mapH, panY));
    }

    function applyTransform() {
        clampPan();
        const scale = fit * zoom;
        canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        /* The scale, published for anything inside the canvas that must NOT
           be scaled by it — the editor's trail handles, which have to stay
           the same size on screen at every zoom, because a grab handle that
           shrinks to a pixel when you zoom out is a grab handle you cannot
           grab. They divide by this. */
        canvas.style.setProperty("--wiz-scale", scale);
        applyBands();
        if (options.onView) options.onView(zoom);
    }

    /* Zooms about a point on the screen — the cursor, or the middle of a
       pinch — so the thing under it stays under it. Without this, a wheel
       zoom walks whatever you were looking at off the edge of the window,
       which on a map is the difference between exploring and hunting. */
    function zoomTo(next, screenX, screenY) {
        const limit = Math.max(map.minZoom || 1, Math.min(map.maxZoom || 6, next));
        if (limit === zoom) return;
        const box = stage.getBoundingClientRect();
        const sx = screenX == null ? box.width / 2 : screenX - box.left;
        const sy = screenY == null ? box.height / 2 : screenY - box.top;
        const before = fit * zoom;
        const after = fit * limit;
        panX = sx - ((sx - panX) / before) * after;
        panY = sy - ((sy - panY) / before) * after;
        zoom = limit;
        applyTransform();
    }

    /* Puts a point on the map in the middle of the frame, at a given zoom.
       Used by search, by the exits inside a room's sheet, by a /wizard/<id>
       link arriving cold, and by the editor's room list. */
    function flyTo(xPct, yPct, toZoom) {
        const { w, h } = stageSize();
        if (toZoom != null) zoom = Math.max(map.minZoom || 1, Math.min(map.maxZoom || 6, toZoom));
        const scale = fit * zoom;
        panX = w / 2 - (xPct / 100) * map.width * scale;
        panY = h / 2 - (yPct / 100) * map.height * scale;
        applyTransform();
    }

    /* A point on the screen as a position on the map, in the same per cent
       the records are stored in. The inverse of everything above, and what
       every drag in the editor is ultimately doing. */
    function screenToPct(clientX, clientY) {
        const box = stage.getBoundingClientRect();
        const scale = fit * zoom;
        return {
            x: ((clientX - box.left - panX) / scale) / map.width * 100,
            y: ((clientY - box.top - panY) / scale) / map.height * 100
        };
    }

    // ---------- zoom bands ----------

    /* How wide the fade either side of a band edge is, as a fraction of the
       edge's own zoom. A tenth: wide enough that nothing blinks, narrow
       enough that two things swapping over do not both sit there at half
       strength for a whole turn of the wheel. */
    const FADE = 0.1;

    // How faint a thing its own zoom band would have hidden is drawn in the
    // editor. Faint enough to read as absent, solid enough to click.
    const GHOST_OPACITY = 0.28;

    /* 0 outside the band, 1 well inside it, and a ramp across the edges. The
       ramp is what makes a forest become a clearing full of names rather
       than cutting to one. */
    function bandOpacity(item) {
        const from = item.fromZoom;
        const to = item.toZoom;
        let opacity = 1;
        if (from != null) {
            const edge = from * FADE;
            opacity = Math.min(opacity, edge ? (zoom - from + edge) / (edge * 2) : (zoom >= from ? 1 : 0));
        }
        if (to != null) {
            const edge = to * FADE;
            opacity = Math.min(opacity, edge ? (to + edge - zoom) / (edge * 2) : (zoom <= to ? 1 : 0));
        }
        return Math.max(0, Math.min(1, opacity));
    }

    function applyBands() {
        for (const entry of banded) {
            let opacity = bandOpacity(entry.item);
            if (entry.item.opacity != null) opacity *= Number(entry.item.opacity);
            /* The editor shows what a band hides, at a ghost of its
               strength: a name you have set to appear at 3× is a name you
               have to be able to find again at 1× in order to change your
               mind about it. On the public page there is nothing to change
               your mind about, so hidden is hidden.

               Flagged with a class as well as a number, so the stylesheet
               can mark a ghost as one — an outline that says "this is not
               really here" — without having to guess at an opacity. */
            const ghosted = options.revealHidden && opacity < GHOST_OPACITY;
            if (ghosted) opacity = GHOST_OPACITY;
            entry.el.classList.toggle("is-ghost", ghosted);
            entry.el.style.opacity = opacity;
            /* Faded out is not just invisible, it is not there: without this
               a room name at zero opacity still swallows the hover and the
               click meant for the painting drawn over it. */
            entry.el.classList.toggle("is-gone", opacity <= 0.02);
        }
    }

    // ---------- drawing ----------

    /* A trail's control points are the few places its curve actually turns —
       that is all tools/slice-map.js keeps, and all the editor asks anyone
       to drag. Catmull-Rom puts the curve back through them: it passes
       THROUGH its control points rather than being pulled toward them, which
       is the property that matters when the points were read off a line that
       already existed. */
    function sampleCurve(points, perSegment) {
        if (points.length < 2) return points.slice();
        // Doubling the ends gives the first and last real segments a
        // neighbour to take their tangent from, so a trail curves out of its
        // start instead of leaving at a hard angle.
        const p = [points[0], ...points, points[points.length - 1]];
        const out = [];
        for (let i = 1; i < p.length - 2; i++) {
            for (let s = 0; s < perSegment; s++) {
                const t = s / perSegment;
                const t2 = t * t;
                const t3 = t2 * t;
                out.push([0, 1].map(axis => 0.5 * (
                    2 * p[i][axis] +
                    (-p[i - 1][axis] + p[i + 1][axis]) * t +
                    (2 * p[i - 1][axis] - 5 * p[i][axis] + 4 * p[i + 1][axis] - p[i + 2][axis]) * t2 +
                    (-p[i - 1][axis] + 3 * p[i][axis] - 3 * p[i + 1][axis] + p[i + 2][axis]) * t3
                )));
            }
        }
        out.push(p[p.length - 1]);
        return out;
    }

    /* Steps along the curve dropping a footprint every `spacing`, each one
       turned to face the way the walk is going, and set to the left or the
       right of the line rather than on it.

       By arc length, not by control point: the samples above are evenly
       spaced in the curve's own parameter, which bunches them up on tight
       corners and spreads them out on straights. Prints laid down at those
       samples would crowd every bend on the map.

       `avoid` is the list of room labels. A print landing inside one is
       dropped rather than moved — the trail simply steps over the writing
       and picks up on the other side, which is what the original drawing
       does and is far less distracting than a footprint printed across
       somebody's name. */
    function footprintsAlong(points, spacingPct, strideP, avoid, pad) {
        const curve = sampleCurve(points, 12);
        const prints = [];
        /* Percentages of two different dimensions are not the same distance,
           so a step measured in "per cent" has to be measured in per cent of
           ONE of them. Width, arbitrarily but consistently: the alternative
           is a trail whose prints bunch up as it turns from horizontal to
           vertical. */
        const aspect = map.height / map.width;
        const dist = (a, b) => Math.hypot(b[0] - a[0], (b[1] - a[1]) * aspect);
        const stride = strideP == null ? 0 : strideP;
        let carried = 0;
        let step = 0;
        for (let i = 1; i < curve.length; i++) {
            const from = curve[i - 1];
            const to = curve[i];
            const segment = dist(from, to);
            if (!segment) continue;
            const angle = Math.atan2((to[1] - from[1]) * aspect, to[0] - from[0]) * 180 / Math.PI;
            let along = spacingPct - carried;
            while (along <= segment) {
                const t = along / segment;
                /* Left foot, right foot. Somebody walking does not put both
                   feet on the line they are walking along, and prints all
                   dead centre read as a dotted rule rather than as
                   footsteps. The offset is perpendicular to the direction of
                   travel and alternates with each step. */
                const side = step % 2 ? 1 : -1;
                const nx = -((to[1] - from[1]) * aspect) / segment * side * stride;
                const ny = ((to[0] - from[0]) / segment) * side * stride / aspect;
                const x = from[0] + (to[0] - from[0]) * t + nx;
                const y = from[1] + (to[1] - from[1]) * t + ny;
                if (!coversText(x, y, avoid, pad)) {
                    prints.push({ x, y, angle, foot: side > 0 ? "right" : "left", step });
                }
                step++;
                along += spacingPct;
            }
            carried = (carried + segment) % spacingPct;
        }
        return prints;
    }

    /* Whether a point falls on a room's name.

       The boxes are worked out from the same numbers the stylesheet letters
       the label with — 22px of Caveat at the room's own size, and a
       character of that hand averaging 0.44 of its size — so what this
       thinks a name occupies is what a name occupies. Given a little margin
       either way, because a footprint touching the tail of a "y" is still a
       footprint on the writing. */
    function coversText(x, y, boxes, pad) {
        if (!boxes) return false;
        /* The print's own size, not just where its middle is. A footprint
           centred a hair outside a name still lies across it — half of the
           sprite is thirty pixels — so the box is grown by half a print
           before the test. This is what takes the last handful of
           overlapping prints to none. */
        const px = pad ? pad.x : 0;
        const py = pad ? pad.y : 0;
        for (const box of boxes) {
            if (x > box.x0 - px && x < box.x1 + px && y > box.y0 - py && y < box.y1 + py) return true;
        }
        return false;
    }

    /* Measured off the labels themselves, not estimated from how many
       letters they have.

       The estimate was close and close was not good enough: six prints in
       five hundred still landed on a name, which is six too many for the one
       rule this is supposed to enforce. offsetWidth is the element's size in
       the canvas's own coordinates — the transform that pans and zooms the
       map does not affect it — so these are the exact numbers, in the exact
       units the trails are laid in.

       Which is why drawRooms runs before drawTrails: the names have to
       exist to be measured. */
    function labelBoxes() {
        const marginX = 0.3;
        const marginY = 0.35;
        const boxes = [];
        for (const room of rooms) {
            const el = roomEls.get(room.id);
            if (!el) continue;
            /* Times the room's own size, because offsetWidth does not
               include it. A label is lettered by scaling the element — ×2
               for ENTRANCE, ×0.85 for a classroom — and a transform is
               applied after layout, so offsetWidth reports the size the
               element would have been WITHOUT it. Taken at face value, every
               large name was measured at half what it actually covers, which
               is exactly where the prints were still landing. */
            const scale = room.size || 1;
            const halfW = el.offsetWidth * scale / 2 / map.width * 100;
            const halfH = el.offsetHeight * scale / 2 / map.height * 100;
            boxes.push({
                x0: room.x - halfW - marginX, x1: room.x + halfW + marginX,
                y0: room.y - halfH - marginY, y1: room.y + halfH + marginY
            });
        }
        return boxes;
    }

    function drawLayers() {
        layersEl.innerHTML = "";
        layerEls.clear();

        /* The paper goes in here, with the pictures, and that is the whole
           reason this exists rather than the parchment simply being the
           frame's background.

           A blend mode blends an element with its backdrop — but only as
           far down as the nearest ancestor that forms a stacking context,
           and there were two of them in the way: this sheet (z-index 1) and
           the canvas (transformed). The parchment was painted outside both,
           so a picture set to "multiply" was multiplying against nothing and
           looked exactly like a picture set to "normal".

           Painted as the first thing inside this sheet, the paper is part of
           the same backdrop the pictures are drawn onto, and a blend reaches
           it. The sheet keeps its stacking context, which matters: it is
           what stops a picture's own layer order escaping and putting it
           above the room names. */
        const paper = document.createElement("div");
        paper.className = "wiz-paper";
        layersEl.appendChild(paper);

        // The uploaded background, where there is one, sits on the paper and
        // under the pictures — so a picture blends into whichever of the two
        // is beneath it.
        if (map.background) {
            const bg = document.createElement("img");
            bg.className = "wiz-bg";
            bg.src = map.background;
            bg.alt = "";
            layersEl.appendChild(bg);
        }

        for (const layer of layers) {
            // Hidden means off the public map but still here in the editor,
            // where it has to be findable in order to be put back. Same rule
            // as a hidden room.
            if (layer.hidden && !options.revealHidden) continue;
            const el = document.createElement(layer.image ? "img" : "div");
            // className first. Set after, it wiped the classes added before
            // it — which is why a hidden picture never looked hidden.
            el.className = "wiz-layer";
            if (layer.hidden) el.classList.add("is-hidden-room");
            el.dataset.kind = "layer";
            el.dataset.id = layer.id;
            if (layer.image) {
                el.src = layer.image;
                el.alt = layer.name || "";
                el.loading = "lazy";
            } else {
                // A layer with no picture yet is still a real record with a
                // real position, and the editor has to be able to find it in
                // order to give it one.
                el.classList.add("is-blank");
                el.textContent = layer.name || "Untitled layer";
            }
            applyLayerVisual(el, layer);
            layersEl.appendChild(el);
            layerEls.set(layer.id, el);
            banded.push({ el, item: layer });
        }
    }

    /* Everything about how a picture sits and looks, in one place.

       Called when the map is drawn and again on every change the editor
       makes, so what you see while dragging a slider is exactly what the
       page will show — there is no second code path that could disagree.

       BLEND is the one worth explaining. A picture dropped on parchment
       looks like a picture dropped on parchment: a rectangle of somebody
       else's paper. Multiplied or darkened into it, the paper's own grain
       and stains show through and it reads as part of the sheet — which is
       what makes an illustration on a map look drawn on rather than glued
       on. It is the single most useful control here and the reason the
       others exist. */
    function applyLayerVisual(el, layer) {
        el.style.left = (layer.x || 0) + "%";
        el.style.top = (layer.y || 0) + "%";
        el.style.width = layer.w ? layer.w + "%" : "";
        el.style.height = layer.h ? layer.h + "%" : "";
        el.style.zIndex = layer.z == null ? "" : layer.z;
        el.style.mixBlendMode = layer.blend || "";

        /* The picture's own turn and flip, on top of the centring the
           stylesheet does. Written here in full rather than left to CSS
           because a transform is one property: setting rotate from script
           would throw away the translate that centres it. */
        const flipX = layer.flipX ? -1 : 1;
        const flipY = layer.flipY ? -1 : 1;
        el.style.transform = `translate(-50%, -50%) rotate(${layer.rotation || 0}deg)`
            + (flipX < 0 || flipY < 0 ? ` scale(${flipX}, ${flipY})` : "");

        // Only the filters actually set: an empty filter list is cheaper
        // than a string of no-ops, and a no-op blur still forces the
        // browser to rasterise the layer separately.
        const filters = [];
        if (layer.grayscale) filters.push(`grayscale(${layer.grayscale})`);
        if (layer.sepia) filters.push(`sepia(${layer.sepia})`);
        if (layer.brightness != null && layer.brightness !== 1) filters.push(`brightness(${layer.brightness})`);
        if (layer.contrast != null && layer.contrast !== 1) filters.push(`contrast(${layer.contrast})`);
        if (layer.saturate != null && layer.saturate !== 1) filters.push(`saturate(${layer.saturate})`);
        if (layer.blur) filters.push(`blur(${layer.blur}px)`);
        el.style.filter = filters.join(" ");
    }

    /* Whether a trail should be drawn at all.

       A trail is hidden by its own flag, and ALSO by either room it runs
       between being hidden — which is the whole point of hiding a room. A
       room taken off the map that left its footprints behind would leave a
       trail walking to a place that is not there, which is worse than
       either showing the room or showing nothing: it says there is
       something here and refuses to say what.

       The editor is the exception. It draws everything, because a hidden
       room is exactly the thing somebody needs to find in order to unhide
       it, and a trail nobody can see is a trail nobody can repoint. */
    function trailHidden(path) {
        if (options.revealHidden) return false;
        if (path.hidden) return true;
        const ends = [path.from, path.to].filter(Boolean);
        return ends.some(id => {
            const room = rooms.find(r => r.id === id);
            return room && room.hidden;
        });
    }

    /* Lays one trail's worth of footprints.

       Three things decide how they look, and all three come from the trail
       itself rather than from a global setting:

       HOW BIG. A short hop between a hall and its common room gets small
       prints and a long walk across the castle gets large ones — which is
       what the original drawing does, and the reason it never looks like
       clip art stamped along a line. Measured from the trail's own length.

       HOW FAR APART. From the size, not set separately: prints are spaced a
       little over their own length, so they read as a stride whatever size
       they are, and never pile into each other on a short trail.

       WHICH ONE. Dealt from the bank cut out of the original map — left foot
       from the left sprites, right from the right, and which of the six
       chosen by a number derived from the trail's id and the step. Derived
       rather than random so a redraw lays down the same walk: prints that
       reshuffled every time the map was panned would shimmer. */
    function layTrail(group, path, boxes) {
        const points = path.points;
        const aspect = map.height / map.width;
        let length = 0;
        for (let i = 1; i < points.length; i++) {
            length += Math.hypot(points[i][0] - points[i - 1][0], (points[i][1] - points[i - 1][1]) * aspect);
        }

        /* Walked, or ruled.

           A route between two junctions gets footprints; a door off a
           junction into the room at the end of it gets a single pen stroke.
           Which is which is decided by the rooms, not by the distance — see
           linkStyle in tools/build-hogwarts.js — and written onto the record,
           so the editor can overrule it for any one connection.

           The length test is only the fallback, for a trail drawn by hand in
           the editor that has never been given a style: below about six per
           cent of the sheet there is no room for enough prints to read as a
           walk anyway, so a short one becomes a stroke either way. */
        const style = path.style || (length < ARC_UNDER ? "line" : "walk");
        if (style === "line") return drawArc(group, path, boxes, length);

        // Between a little over half size and full size, reached by about a
        // third of the way across the sheet.
        const fromLength = Math.max(0.55, Math.min(1, 0.5 + length / 34));
        const size = (Number(path.size) || Number(map.footprintSize) || 1) * fromLength;

        const bank = Array.isArray(map.footprints) ? map.footprints : [];
        const feet = {
            left: bank.filter(s => s.side === "left"),
            right: bank.filter(s => s.side === "right")
        };
        // What one print measures on the sheet, so the spacing and the
        // stride can both be expressed in terms of it.
        const printHeight = (bank.length ? bank[0].scale : (41 / map.width * 100)) * size;
        const spacing = Number(path.spacing) || printHeight * 1.35;
        const stride = printHeight * 0.42;

        // Half a print, in each direction, as a percentage of the dimension
        // that direction is measured in. A print is taller than it is wide,
        // and turns as the trail turns, so the longer side is used for both.
        const pad = {
            x: printHeight / 2,
            y: printHeight / 2 * (map.width / map.height)
        };

        for (const print of footprintsAlong(points, spacing, stride, boxes, pad)) {
            const el = document.createElement("span");
            el.className = "wiz-print";
            el.style.left = print.x + "%";
            el.style.top = print.y + "%";

            const choices = feet[print.foot];
            const chosen = choices && choices.length
                ? choices[deal(path.id, print.step) % choices.length]
                : null;
            if (chosen) {
                el.style.backgroundImage = `url("${chosen.src}")`;
                el.style.width = (chosen.width / chosen.height) * printHeight / 100 * map.width + "px";
                el.style.height = printHeight / 100 * map.width + "px";
            } else if (map.footprint) {
                el.style.backgroundImage = `url("${map.footprint}")`;
            }
            /* The sprite is drawn pointing up, so the rotation is the walk's
               angle plus a right angle. Kept in the transform rather than as
               a custom property because these are the most numerous elements
               on the page by an order of magnitude, and one the browser can
               read straight off the style attribute is one less thing to
               resolve. */
            el.style.transform = `translate(-50%, -50%) rotate(${print.angle + 90}deg)`;
            group.appendChild(el);
        }
    }

    /* Under this length — as a percentage of the sheet's width — a
       connection is drawn as a stroke rather than walked. Set by what a
       stride costs: a footprint is about 0.75% across and they are laid a
       third again apart, so below about six per cent there is not room for
       enough of them to read as a walk. */
    const ARC_UNDER = 6;

    const SVG_NS = "http://www.w3.org/2000/svg";

    /* A pen line from one name to the next, drawn to look drawn.

       Three things do that, and all three matter. It TAPERS — thick through
       the middle, coming to nothing at both ends — which is what a real
       stroke does as the pen is set down and lifted, and is why this is a
       filled shape rather than a stroked line of even width. It WAVERS,
       by a few pixels along its length, off the trail's id so the same line
       wavers the same way every time. And it STOPS SHORT of the writing at
       both ends, so it reaches toward each name without ever touching it.

       Drawn as one <svg> per trail sized to the whole map, so the geometry
       inside is in map pixels and needs no conversion — and so the trail
       still hides, fades and highlights as a single element like any
       other. */
    function drawArc(group, path, boxes, length) {
        const samples = sampleCurve(path.points, 24);
        if (samples.length < 2) return;

        // In map pixels, which is what the path data below is written in.
        const pts = samples.map(([x, y]) => [x / 100 * map.width, y / 100 * map.height]);

        /* Trimmed back from each end until it is clear of the writing there.
           A stroke that ran to the middle of a name would be struck through
           it; one that stops at the edge reads as pointing at it. */
        const pixelBoxes = (boxes || []).map(b => ({
            x0: b.x0 / 100 * map.width, x1: b.x1 / 100 * map.width,
            y0: b.y0 / 100 * map.height, y1: b.y1 / 100 * map.height
        }));
        const inside = p => pixelBoxes.some(b => p[0] > b.x0 && p[0] < b.x1 && p[1] > b.y0 && p[1] < b.y1);
        let head = 0;
        let tail = pts.length - 1;
        while (head < tail && inside(pts[head])) head++;
        while (tail > head && inside(pts[tail])) tail--;
        const line = pts.slice(head, tail + 1);
        // Trimmed away to nothing: the two names are touching, and there is
        // no honest line to draw between them.
        if (line.length < 3) return;

        // How heavy the stroke is. Thinner for a shorter line, the way a
        // short pen mark is, and thinner again for a secret way.
        const weight = (map.width / 1500) * (0.6 + Math.min(1, length / ARC_UNDER) * 0.5)
            * (path.secret ? 0.72 : 1);

        const left = [];
        const right = [];
        for (let i = 0; i < line.length; i++) {
            const t = i / (line.length - 1);
            const prev = line[Math.max(0, i - 1)];
            const next = line[Math.min(line.length - 1, i + 1)];
            const dx = next[0] - prev[0], dy = next[1] - prev[1];
            const len = Math.hypot(dx, dy) || 1;
            // Full in the middle, nothing at the ends. The power keeps it
            // broad for most of its length rather than a thin spindle.
            const taper = Math.pow(Math.sin(Math.PI * t), 0.45);
            const half = weight * taper;
            // The waver, along the line rather than across it, so it reads
            // as an unsteady hand and not as a wobbly outline.
            const drift = (wave(path.id, i) - 0.5) * weight * 0.9;
            const nx = -dy / len, ny = dx / len;
            const cx = line[i][0] + nx * drift;
            const cy = line[i][1] + ny * drift;
            left.push([cx + nx * half, cy + ny * half]);
            right.push([cx - nx * half, cy - ny * half]);
        }

        const d = "M " + left.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ")
            + " L " + right.reverse().map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ") + " Z";

        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "wiz-arc");
        svg.setAttribute("viewBox", `0 0 ${map.width} ${map.height}`);
        svg.setAttribute("preserveAspectRatio", "none");
        const shape = document.createElementNS(SVG_NS, "path");
        shape.setAttribute("d", d);
        svg.appendChild(shape);
        group.appendChild(svg);
    }

    /* A smooth-ish wander between 0 and 1 along a line, settled by id.

       Two hashed values a step apart, blended — enough to make the stroke
       drift rather than jitter, which is the difference between a pen line
       and a saw edge. */
    function wave(id, i) {
        const step = i / 5;
        const a = deal(id, Math.floor(step)) / 997;
        const b = deal(id, Math.floor(step) + 1) / 997;
        const t = step - Math.floor(step);
        return a + (b - a) * (t * t * (3 - 2 * t));
    }

    // A small settled number from a trail's id and which step this is. Not
    // random: the same walk has to come back the same way on every redraw.
    function deal(id, step) {
        let h = 2166136261;
        const key = String(id) + ":" + step;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) % 997;
    }

    function drawTrails() {
        trailsEl.innerHTML = "";
        pathEls.clear();
        // Worked out once for the whole map rather than per trail: every
        // trail is checked against every label, and there are ninety of each.
        const boxes = labelBoxes();
        for (const path of paths) {
            if (trailHidden(path)) continue;
            const points = Array.isArray(path.points) ? path.points : [];
            const group = document.createElement("div");
            group.className = "wiz-trail";
            if (path.secret) group.classList.add("is-secret");
            if (path.hidden) group.classList.add("is-hidden-trail");
            group.dataset.kind = "path";
            group.dataset.id = path.id;
            if (points.length >= 2) layTrail(group, path, boxes);
            trailsEl.appendChild(group);
            pathEls.set(path.id, group);
            banded.push({ el: group, item: path });
        }
    }

    // The name as a reader should see it. The note is what tells three Grand
    // Staircases apart, so it belongs anywhere they might appear together — a
    // search result, a list of exits — and nowhere they cannot, like the map.
    function fullName(room) {
        return room.note ? `${room.name} (${room.note})` : room.name;
    }

    function drawRooms() {
        roomsEl.innerHTML = "";
        roomEls.clear();
        for (const room of rooms) {
            if (room.hidden && !options.revealHidden) continue;
            const el = document.createElement(options.roomsAreButtons === false ? "div" : "button");
            if (el.tagName === "BUTTON") el.type = "button";
            el.className = "wiz-room";
            el.dataset.kind = "room";
            el.dataset.id = room.id;
            if (room.status) el.dataset.status = room.status;
            if (room.hidden) el.classList.add("is-hidden-room");
            el.style.left = room.x + "%";
            el.style.top = room.y + "%";
            el.style.setProperty("--room-scale", room.size || 1);
            el.style.setProperty("--room-turn", (room.rotation || 0) + "deg");
            el.setAttribute("aria-label", fullName(room));

            /* The cut-out from the original drawing where there is one, and
               the name set in type where there is not. Both, in fact: the
               text sits behind the picture as the accessible name and the
               thing that is searched, and shows through on its own if the
               image ever fails to load. A room added in the editor after the
               map was drawn has no cut-out and is simply the second case. */
            if (room.labelImage) {
                const img = document.createElement("img");
                img.className = "wiz-room-ink";
                img.src = room.labelImage;
                img.alt = "";
                img.setAttribute("aria-hidden", "true");
                el.appendChild(img);
                el.classList.add("has-ink");
            }
            const text = document.createElement("span");
            text.className = "wiz-room-name";
            text.textContent = room.name;
            el.appendChild(text);

            roomsEl.appendChild(el);
            roomEls.set(room.id, el);
            banded.push({ el, item: room });
        }
    }

    function render() {
        banded = [];
        canvas.style.width = map.width + "px";
        canvas.style.height = map.height + "px";
        // The frame takes the map's shape rather than a guessed one, so the
        // opening view is the map rather than the map with a band of empty
        // parchment above and below it. See .wiz-stage in css/wizard.css.
        stage.style.setProperty("--wiz-aspect", `${map.width} / ${map.height}`);
        // The background is drawn by drawLayers now, inside the same sheet
        // as the pictures — see the note there about blending.
        drawLayers();
        // Rooms before trails, and it matters: the trails step around the
        // names, and to do that they have to measure them. See labelBoxes.
        drawRooms();
        drawTrails();
        fit = computeFit();
        applyTransform();

        /* And once more when the handwriting arrives.

           The names are lettered in Caveat, which is fetched. Measure a
           label before it lands and you measure it in the fallback serif,
           which is narrower — so the boxes the trails step around come out
           too small, and prints land on the ends of the longer names. It is
           a real effect and not a small one: measured early, eighty-eight
           prints touched a name; measured late, none do.

           Guarded so this happens once. document.fonts.ready resolves
           immediately on a warm cache, in which case the second pass is
           nearly free and changes nothing. */
        if (!refitForFonts && document.fonts && document.fonts.ready) {
            refitForFonts = true;
            document.fonts.ready.then(() => render());
        }
    }

    let refitForFonts = false;

    // ---------- panning and zooming ----------

    let dragging = false;
    let dragMoved = false;
    let lastX = 0;
    let lastY = 0;
    /* Where the press began, kept apart from lastX/lastY. The slop test has
       to measure the whole gesture, not the last frame of it: compared
       against the previous position, a slow drag never moves more than a
       pixel or two at a time and reads as a click no matter how far it
       goes. */
    let startX = 0;
    let startY = 0;
    // Live pointers, so a second finger turns a drag into a pinch without
    // either gesture needing to know about the other.
    const pointers = new Map();
    let pinchStart = 0;
    let pinchZoom = 1;

    function pinchSpread() {
        const [a, b] = [...pointers.values()];
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    function pinchMiddle() {
        const [a, b] = [...pointers.values()];
        return [(a.x + b.x) / 2, (a.y + b.y) / 2];
    }

    stage.addEventListener("pointerdown", e => {
        if (e.target.closest(".wiz-controls, .wiz-search, .wiz-handle")) return;
        if (options.onPointerDown && options.onPointerDown(e) === false) return;
        if (!panEnabled) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
            pinchStart = pinchSpread();
            pinchZoom = zoom;
            dragging = false;
            return;
        }
        dragging = true;
        dragMoved = false;
        startX = lastX = e.clientX;
        startY = lastY = e.clientY;
        /* Deliberately NOT capturing the pointer here, and not marking the
           stage as dragging either. Capture retargets the click that ends
           the gesture to the capturing element, so a stage that grabs the
           pointer on every press never lets a click reach the room label
           underneath it — the map pans perfectly and nothing on it can be
           opened. Both happen in pointermove instead, once this is known to
           be a drag rather than a click. */
    });

    stage.addEventListener("pointermove", e => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.size === 2 && pinchStart) {
            const [mx, my] = pinchMiddle();
            zoomTo(pinchZoom * (pinchSpread() / pinchStart), mx, my);
            return;
        }
        if (!dragging) return;
        // A few pixels of slop, so a click with an unsteady hand is still a
        // click and not a one-pixel drag that swallows it. Crossing that line
        // is also the moment this becomes a drag, and the moment the stage
        // takes the pointer — see the note in pointerdown for why it cannot
        // take it any earlier.
        if (!dragMoved && (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3)) {
            dragMoved = true;
            stage.setPointerCapture(e.pointerId);
            stage.classList.add("is-dragging");
        }
        panX += e.clientX - lastX;
        panY += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        applyTransform();
    });

    function endPointer(e) {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStart = 0;
        if (pointers.size === 0) {
            dragging = false;
            stage.classList.remove("is-dragging");
            // Cleared on the next frame, not here: the click event this drag
            // ends with has not been dispatched yet, and clearing it now is
            // the same as never having tracked it.
            requestAnimationFrame(() => { dragMoved = false; });
        }
    }
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);

    stage.addEventListener("wheel", e => {
        e.preventDefault();
        // deltaMode 1 is lines rather than pixels (Firefox, mostly), and a
        // line is worth roughly sixteen pixels of the same gesture.
        const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
        zoomTo(zoom * Math.exp(-delta / 400), e.clientX, e.clientY);
    }, { passive: false });

    stage.addEventListener("dblclick", e => {
        if (e.target.closest(".wiz-room")) return;
        zoomTo(zoom * 1.8, e.clientX, e.clientY);
    });

    // Arrow keys pan, +/- zoom — but only while the map itself has focus, so
    // they still do the ordinary thing inside a text field.
    stage.addEventListener("keydown", e => {
        const step = e.shiftKey ? 200 : 60;
        const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (moves[e.key]) {
            e.preventDefault();
            panX += moves[e.key][0];
            panY += moves[e.key][1];
            applyTransform();
        } else if (e.key === "+" || e.key === "=") {
            zoomTo(zoom * 1.4);
        } else if (e.key === "-" || e.key === "_") {
            zoomTo(zoom / 1.4);
        }
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // The map keeps its middle across a resize rather than its pan,
            // which after a rotate or a window drag is what somebody was
            // actually looking at.
            const { w, h } = stageSize();
            const scale = fit * zoom;
            const midX = ((w / 2 - panX) / scale) / map.width * 100;
            const midY = ((h / 2 - panY) / scale) / map.height * 100;
            fit = computeFit();
            flyTo(midX, midY);
        }, 120);
    });

    roomsEl.addEventListener("click", e => {
        const el = e.target.closest(".wiz-room");
        // A click that ended a drag is not a click on what was underneath.
        if (!el || dragMoved || !options.onRoomClick) return;
        options.onRoomClick(el.dataset.id, el, e);
    });

    if (options.onRoomHover) {
        let hovering = null;
        roomsEl.addEventListener("mouseover", e => {
            const el = e.target.closest(".wiz-room");
            if (!el || el.dataset.id === hovering) return;
            hovering = el.dataset.id;
            options.onRoomHover(el.dataset.id, el);
        });
        roomsEl.addEventListener("mouseout", e => {
            const el = e.target.closest(".wiz-room");
            if (el && !el.contains(e.relatedTarget)) {
                hovering = null;
                options.onRoomHover(null, null);
            }
        });
        stage.addEventListener("pointerdown", () => {
            hovering = null;
            options.onRoomHover(null, null);
        });
    }

    return {
        setData(payload) {
            map = { ...defaultMap(), ...(payload.map || {}) };
            rooms = payload.rooms || [];
            paths = payload.paths || [];
            layers = payload.layers || [];
        },
        render,
        applyBands,
        applyTransform,
        zoomTo,
        flyTo,
        screenToPct,
        fullName,
        /* Re-lays one trail's footprints in place, without touching the rest
           of the map. The editor calls this on every frame of a drag, and
           rebuilding ninety trails and ninety-three names sixty times a
           second is the difference between a curve that follows the hand and
           one that stutters after it. Here rather than in the editor because
           how a trail is laid — the sizes, the stride, the sprites, staying
           off the writing — is the engine's business, and a second copy of
           it would be a second answer. */
        redrawTrail(path) {
            const group = pathEls.get(path.id);
            if (!group) return;
            group.innerHTML = "";
            if ((path.points || []).length >= 2) layTrail(group, path, labelBoxes());
        },

        /* Re-applies a picture's position, size and look to the element
           already on the map. The editor calls it on every change, so a
           slider moves the picture rather than waiting for a full redraw —
           and, more importantly, through the same function the page draws
           with, so the two cannot disagree about what "multiply at 60%"
           looks like. */
        redrawLayer(layer) {
            const el = layerEls.get(layer.id);
            if (el) applyLayerVisual(el, layer);
        },
        getZoom: () => zoom,
        setZoom(next) { zoom = next; applyTransform(); },
        refit() { fit = computeFit(); applyTransform(); },
        getMap: () => map,
        getRooms: () => rooms,
        getPaths: () => paths,
        getLayers: () => layers,
        elementFor(kind, id) {
            const store = kind === "room" ? roomEls : kind === "path" ? pathEls : layerEls;
            return store.get(id) || null;
        },
        // The editor turns this off while a drag means something other than
        // panning the map.
        setPanEnabled(on) { panEnabled = on; },
        wasDrag: () => dragMoved
    };
};

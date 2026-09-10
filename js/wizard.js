/* The public Sorcerer's Atlas at /wizard.

   A drawing of a castle nobody can walk any more, made walkable again: the
   whole map at a glance, and everything on it — a name, a trail of
   footprints between two rooms, a picture of the room itself — drawn from
   records rather than baked into the picture.

   The map itself is js/wizard-map.js, shared with the editor in the admin
   page so the two cannot drift apart. What is left here is what only a
   reader needs: the hover card, the room sheet, the search box, and links
   that point at one room. See netlify/functions/wizard.js for the records
   all of it is drawn from. */
document.addEventListener("DOMContentLoaded", () => {

    const stage = document.getElementById("wiz-stage");
    if (!stage) return;

    const tooltipEl = document.getElementById("wiz-tooltip");
    const statusEl = document.getElementById("wiz-status");
    const zoomLabel = document.getElementById("wiz-zoom-label");
    const searchInput = document.getElementById("wiz-search");
    const resultsEl = document.getElementById("wiz-results");

    const modal = document.getElementById("wiz-modal");
    const modalTitle = document.getElementById("wiz-modal-title");
    const modalImg = document.getElementById("wiz-modal-img");
    const modalNoImg = document.getElementById("wiz-modal-noimg");
    const modalMeta = document.getElementById("wiz-modal-meta");
    const modalDesc = document.getElementById("wiz-modal-desc");
    const modalExits = document.getElementById("wiz-modal-exits");
    const modalClose = document.getElementById("wiz-modal-close");
    const modalLink = document.getElementById("wiz-modal-link");

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    const view = WizardMap({
        stage,
        canvas: document.getElementById("wiz-canvas"),
        /* The sheet's "(1)", "(2)", "(3)" stay in the editor and never reach
           a reader — see roomName in js/wizard-map.js for why the number is
           bookkeeping rather than part of the room. Everything on this page
           that shows a name goes through view.roomName or view.fullName, so
           there is one place the rule lives rather than six. */
        showRoomNumbers: false,
        /* The zoom readout, and the two buttons that drive it. Both are
           disabled at the ends of the range rather than left accepting
           clicks that do nothing — the console's own scrollbar ships
           -disabled sprites for exactly this, so a dead control that still
           looks live is out of step with the rest of the site. */
        onView: z => {
            if (zoomLabel) zoomLabel.textContent = `${Math.round(z * 100)}%`;
            const map = view.getMap ? view.getMap() : {};
            const lo = map.minZoom || 1, hi = map.maxZoom || 6;
            // A hair of tolerance: zoom is a float and lands on the limit by
            // multiplication, not by assignment.
            if (zoomInBtn) zoomInBtn.disabled = z >= hi - 0.001;
            if (zoomOutBtn) zoomOutBtn.disabled = z <= lo + 0.001;
        },
        onRoomClick: id => openRoom(id),
        onRoomHover: (id, el) => {
            if (!id) return hideTooltip();
            const room = view.getRooms().find(r => r.id === id);
            if (room) showTooltip(room, el);
        }
    });

    const roomById = id => view.getRooms().find(r => r.id === id);

    /* ---------- readable addresses ----------

       A room's own id is its number on the connection spreadsheet — r001,
       r039 — which is exactly right for tracing a record back to its row and
       exactly wrong for a link someone pastes into Discord. The sheet offers
       its address in a copy box, so it is meant to travel, and "/wizard/r039"
       tells the person receiving it nothing at all.

       Names are not unique on this map (seven 1st Floor Corridors, three
       Grand Staircases), so a slug that collides takes the room's id on the
       end rather than silently pointing at whichever one was built first.
       Both forms resolve, and the id form always will: links made before
       this existed keep working, and so does anything an admin copied out of
       the editor. */
    let slugToId = new Map();
    let idToSlug = new Map();

    function slugify(name) {
        return String(name || "")
            .toLowerCase()
            .replace(/['’]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function buildSlugs() {
        slugToId = new Map();
        idToSlug = new Map();
        const counts = new Map();
        const rooms = view.getRooms();
        for (const r of rooms) {
            const base = slugify(r.name) || r.id;
            counts.set(base, (counts.get(base) || 0) + 1);
        }
        for (const r of rooms) {
            const base = slugify(r.name) || r.id;
            const slug = counts.get(base) > 1 ? `${base}-${r.id}` : base;
            idToSlug.set(r.id, slug);
            slugToId.set(slug, r.id);
        }
    }

    const addressFor = id => idToSlug.get(id) || id;

    // ---------- hovering ----------

    function showTooltip(room, el) {
        const thumb = room.thumb || room.image;
        tooltipEl.innerHTML = `
            ${thumb ? `<img class="wiz-tip-thumb" src="${escapeHtml(thumb)}" alt="">` : ""}
            <p class="wiz-tip-name">${escapeHtml(view.roomName(room))}</p>
            ${room.note ? `<p class="wiz-tip-note">${escapeHtml(room.note)}</p>` : ""}
            ${room.floor ? `<p class="wiz-tip-floor">${escapeHtml(room.floor)}</p>` : ""}
            ${room.description ? `<p class="wiz-tip-desc">${escapeHtml(firstLine(room.description))}</p>` : ""}
            <p class="wiz-tip-more">${room.image || room.description ? "Click to open" : "Nothing recorded yet"}</p>
        `;
        tooltipEl.hidden = false;
        positionTooltip(el);
    }

    // The first sentence, for the hover. The whole description belongs in the
    // sheet; a tooltip that runs to a paragraph covers the map it is meant to
    // be explaining.
    function firstLine(text) {
        const trimmed = String(text).trim();
        const stop = trimmed.search(/[.!?](\s|$)/);
        const line = stop === -1 ? trimmed : trimmed.slice(0, stop + 1);
        return line.length > 140 ? line.slice(0, 137) + "…" : line;
    }

    /* Above the label, or below it when there is no room above. Measured
       against the stage rather than the window: the map moves inside its own
       frame, and a tooltip placed against the viewport walks off the top of
       that frame long before it reaches the top of the page. */
    function positionTooltip(el) {
        const stageBox = stage.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const tip = tooltipEl.getBoundingClientRect();
        const gap = 12;
        let left = box.left - stageBox.left + box.width / 2 - tip.width / 2;
        left = Math.max(8, Math.min(stageBox.width - tip.width - 8, left));
        let top = box.top - stageBox.top - tip.height - gap;
        const below = top < 8;
        if (below) top = box.bottom - stageBox.top + gap;
        tooltipEl.classList.toggle("is-below", below);
        tooltipEl.style.left = left + "px";
        tooltipEl.style.top = top + "px";
    }

    function hideTooltip() {
        tooltipEl.hidden = true;
    }

    // ---------- the room sheet ----------

    function openRoom(id, { push = true } = {}) {
        const room = roomById(id);
        if (!room) return;
        hideTooltip();
        // Read before the sheet is marked open below: whether it was ALREADY
        // open decides whether this room is a new place in the history or a
        // move within one. See the pushState at the end of this function.
        const alreadyOpen = modal.classList.contains("open");

        modalTitle.textContent = view.fullName(room);
        const picture = room.image || room.thumb;

        /* A room with neither a picture nor a description gets one honest
           line instead of two empty panels stacked on each other — most of
           the castle is in that state while the map is being drawn, and a
           dashed 160px box above "nothing has been written" said the same
           nothing twice. The placeholder still earns its place on a room
           that HAS something written and is only waiting on a photograph. */
        const bare = !picture && !room.description;

        modalImg.hidden = !picture;
        modalNoImg.hidden = !!picture || bare;
        if (picture) {
            modalImg.src = picture;
            modalImg.alt = `${view.roomName(room)} — the room as it was`;
        } else {
            // Both, not just the src: an <img> with no src but a leftover
            // alt is drawn as a broken-image box carrying the PREVIOUS
            // room's caption, which is what the ninety-two picture-less
            // rooms were showing.
            modalImg.removeAttribute("src");
            modalImg.alt = "";
        }

        const meta = [];
        if (room.floor) meta.push(["Floor", room.floor]);
        if (room.status) meta.push(["Status", room.status]);
        modalMeta.innerHTML = meta
            .map(([k, v]) => `<div class="wiz-meta-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`)
            .join("");
        modalMeta.hidden = !meta.length;

        modalDesc.textContent = room.description
            || (bare ? "Nothing recorded for this room yet — no picture, no notes."
                     : "Nothing has been written about this room yet.");
        modalDesc.classList.toggle("is-empty", !room.description);

        /* Where you can get to from here, as buttons rather than as prose.
           Both directions of every trail: a corridor that leads to the
           library is a corridor the library leads back to, and a map that
           only says so from one end is a map you cannot walk backwards.

           A trail with an unnamed end is a real trail — the drawing has
           several — so those are counted and mentioned rather than listed,
           since there is nothing to click. */
        const exits = [];
        let unnamed = 0;
        for (const path of view.getPaths()) {
            if (path.hidden) continue;
            const other = path.from === room.id ? path.to : path.to === room.id ? path.from : null;
            if (other === null) continue;
            /* A trail drawn as an arrow runs one way only, and this room may
               not be the end it runs from. Standing at the room the arrow
               points AT, the trail is not a way out — offering it as one
               would be a door that does not open. */
            const oneWayFrom = view.walkableFrom(path);
            if (oneWayFrom && oneWayFrom !== room.id) continue;
            if (!other) { unnamed++; continue; }
            const target = roomById(other);
            // A hidden room is off the map, so it is not somewhere this room
            // leads to either — naming it here would be a door to a place
            // that cannot be opened, and would give away the very thing
            // hiding it was meant to keep back.
            if (!target || target.hidden) continue;
            if (!exits.some(e => e.id === target.id)) exits.push({ ...target, via: path.exit, secret: path.secret });
        }
        for (const exit of room.exits || []) {
            const target = roomById(exit.to || exit);
            if (target && !target.hidden && !exits.some(e => e.id === target.id)) exits.push(target);
        }
        modalExits.innerHTML = exits.length || unnamed
            ? `<h4>Leads to</h4><div class="wiz-exit-row">${exits
                .map(e => `<button type="button" class="wiz-exit${e.secret ? " is-secret" : ""}" data-go="${escapeHtml(e.id)}"${e.via ? ` title="${escapeHtml(e.via)}"` : ""}>${escapeHtml(view.roomName(e))}${e.via ? `<span class="wiz-exit-via">${escapeHtml(e.via)}</span>` : ""}</button>`)
                .join("")}${unnamed ? `<span class="wiz-exit-unknown">${unnamed} trail${unnamed > 1 ? "s" : ""} nobody has followed yet</span>` : ""}</div>`
            : "";
        modalExits.hidden = !exits.length && !unnamed;

        modalLink.value = `${location.origin}/wizard/${addressFor(room.id)}`;

        modal.classList.add("open");
        modal.querySelector(".modal").focus();
        /* A room is a place you can link to, so opening one is a place in the
           history: Back closes the sheet rather than leaving the site.

           Walking on through "Leads to" REPLACES that entry instead of adding
           another. It used to add one per room, which made the close button
           unusable: closing calls history.back(), back landed on the room
           before, popstate saw a room in the path and dutifully reopened the
           sheet on it. Four rooms deep, closing took four presses and looked
           like the window refusing to shut.

           So the sheet is one entry however far you walk, and Back and the
           close button now mean the same thing — which is the thing people
           try. The address still changes with every room, so a link, a
           refresh and a share all still land on the room you are looking
           at. What is given up is stepping BACK through the rooms you walked,
           and that is the right trade: nobody was getting that far, because
           the way out was broken. */
        if (push) {
            const url = `/wizard/${addressFor(room.id)}`;
            const entry = { room: room.id };
            if (alreadyOpen) history.replaceState(entry, "", url);
            else history.pushState(entry, "", url);
        }
    }

    function closeRoom({ pop = true } = {}) {
        if (!modal.classList.contains("open")) return;
        modal.classList.remove("open");
        if (pop && history.state && history.state.room) history.back();
        else if (pop) history.replaceState({}, "", "/wizard");
    }

    modalClose.addEventListener("click", () => closeRoom());
    modal.addEventListener("click", e => { if (e.target === modal) closeRoom(); });
    modalExits.addEventListener("click", e => {
        const btn = e.target.closest("[data-go]");
        if (!btn) return;
        const target = roomById(btn.dataset.go);
        if (!target) return;
        // Move the map underneath before swapping the sheet, so closing it
        // leaves you looking at the room you just walked to.
        view.flyTo(target.x, target.y, Math.max(view.getZoom(), 2.2));
        openRoom(target.id);
    });

    modalLink.addEventListener("focus", () => modalLink.select());

    window.addEventListener("popstate", () => {
        const id = roomIdFromPath();
        if (id) openRoom(id, { push: false });
        else closeRoom({ pop: false });
    });

    document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (modal.classList.contains("open")) closeRoom();
        else if (resultsEl && !resultsEl.hidden) hideResults();
    });

    function roomIdFromPath() {
        const m = /^\/wizard\/(.+?)\/?$/.exec(location.pathname);
        if (!m) return null;
        const raw = decodeURIComponent(m[1]);
        // Slug first, then the raw id — so /wizard/library and /wizard/r039
        // both open the Library, and neither form can be broken by renaming
        // the other.
        return slugToId.get(raw.toLowerCase()) || (roomById(raw) ? raw : null);
    }

    // ---------- searching ----------

    function hideResults() {
        if (!resultsEl) return;
        resultsEl.hidden = true;
        resultsEl.innerHTML = "";
    }

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            const query = searchInput.value.trim().toLowerCase();
            if (query.length < 2) return hideResults();
            const hits = view.getRooms()
                .filter(r => !r.hidden)
                .filter(r => `${r.name} ${r.note || ""} ${r.floor || ""}`.toLowerCase().includes(query))
                .slice(0, 8);
            resultsEl.innerHTML = hits.length
                ? hits.map(r => `<button type="button" class="wiz-result" data-go="${escapeHtml(r.id)}">
                        <span class="wiz-result-name">${escapeHtml(view.roomName(r))}</span>
                        ${r.note || r.floor ? `<span class="wiz-result-note">${escapeHtml(r.note || r.floor)}</span>` : ""}
                    </button>`).join("")
                : `<p class="wiz-result-empty">Nothing on the map by that name.</p>`;
            resultsEl.hidden = false;
        });
        resultsEl.addEventListener("click", e => {
            const btn = e.target.closest("[data-go]");
            if (!btn) return;
            const room = roomById(btn.dataset.go);
            if (!room) return;
            hideResults();
            searchInput.value = "";
            view.flyTo(room.x, room.y, Math.max(view.getZoom(), 2.5));
            const el = view.elementFor("room", room.id);
            if (el) {
                el.classList.add("is-found");
                setTimeout(() => el.classList.remove("is-found"), 1600);
            }
        });
        document.addEventListener("click", e => {
            if (!e.target.closest(".wiz-search")) hideResults();
        });
    }

    /* ---------- where the map opens, on a frame this size ----------

       Zoom on this map is a multiple of "fitted to the frame", not a size.
       That is the right way round for panning and for the +/- buttons, and
       it is exactly wrong for an opening view: the same 190% that an admin
       set while looking at a 1238px-wide frame is, in a 359px one, the same
       fraction of a frame three and a half times smaller — so every room
       name comes out three and a half times smaller with it. Measured on a
       375px phone, sixty-eight of the seventy legible labels were under
       twelve pixels tall and the smallest was three. The map was not broken;
       it had simply been opened at a size nobody could read.

       So the stored zoom is treated as what it is — a decision about how big
       the drawing should LOOK, taken at a particular frame size — and
       re-expressed for the frame actually in front of the reader. Both
       scales are worked out the same way the engine works out its own fit,
       which is why FIT_MARGIN does not appear: it is a constant factor in
       both halves and cancels.

       A phone therefore opens further in, seeing less of the castle at a
       size worth seeing, which is the trade a small screen always makes.
       Capped at the map's own maxZoom, and never applied to a frame already
       as big as the reference — a desktop is unaffected, to the pixel. */
    const REFERENCE_STAGE_W = 1240;
    const REFERENCE_STAGE_H = 700;

    function openingZoom(map) {
        const want = map.startZoom;
        if (!want) return want;
        const box = stage.getBoundingClientRect();
        if (!box.width || !box.height) return want;
        const w = map.width || 2000;
        const h = map.height || 1125;
        const refScale = Math.min(REFERENCE_STAGE_W / w, REFERENCE_STAGE_H / h);
        const nowScale = Math.min(box.width / w, box.height / h);
        if (!nowScale || nowScale >= refScale) return want;
        return Math.min(map.maxZoom || 6, want * (refScale / nowScale));
    }

    // ---------- controls ----------

    const zoomInBtn = document.getElementById("wiz-zoom-in");
    const zoomOutBtn = document.getElementById("wiz-zoom-out");
    zoomInBtn.addEventListener("click", () => view.zoomBy(1.5));
    zoomOutBtn.addEventListener("click", () => view.zoomBy(1 / 1.5));

    /* Back to where the map opens, not out to its full extent.

       This button used to drop straight to 100%, which fits all ninety-three
       rooms in the frame and renders every one of their names too small to
       read — a diagram of a castle rather than a map of one. The rooms are
       spread across 93% of the map's width, so there is no clever framing
       that makes the whole thing legible at once; the whole thing simply
       does not fit at a readable size.

       So it returns to the considered view instead: the point and zoom an
       admin set as where the map should open, which is a real decision
       somebody made rather than an arithmetic result. fitContent is the
       fallback for a map with no start view configured. */
    document.getElementById("wiz-zoom-reset").addEventListener("click", () => {
        const map = view.getMap();
        if (map && map.startZoom) {
            // The same re-expressed zoom the map opened at, so "back to the
            // opening view" returns to the view that was actually opened
            // rather than to a smaller one the reader has never seen.
            view.flyTo(map.startX == null ? 50 : map.startX,
                map.startY == null ? 50 : map.startY, openingZoom(map));
        } else {
            view.fitContent();
        }
    });

    // ---------- loading ----------

    async function load() {
        let data;
        try {
            data = await Api.getWizardMap();
        } catch (err) {
            statusEl.hidden = false;
            statusEl.textContent = "The map could not be loaded. Try again in a moment.";
            return;
        }

        view.setData(data);
        // Before render, and before anything reads the path: the addresses
        // are derived from the room names, so they cannot exist until the
        // rooms do.
        buildSlugs();
        view.render();

        const map = data.map || {};
        document.title = `${map.title || "The Sorcerer's Atlas"} — Maze Rats`;
        const heading = document.getElementById("wiz-title");
        if (heading) heading.textContent = map.title || "The Sorcerer's Atlas";
        const intro = document.getElementById("wiz-intro");
        if (intro && map.intro) { intro.textContent = map.intro; intro.hidden = false; }
        const credit = document.getElementById("wiz-credit");
        if (credit && map.credit) { credit.textContent = map.credit; credit.hidden = false; }

        if (!(data.rooms || []).length) {
            statusEl.hidden = false;
            statusEl.textContent = "This map has nothing on it yet.";
        }

        /* Where the map opens.

           Not fitted whole. A sheet with ninety-three rooms on it shown
           entire is a diagram of a castle; shown from the front door at a
           readable size it is somewhere you have just arrived, with the rest
           running off the edges waiting to be followed. The point and the
           zoom are stored on the map and set from the editor, so this is a
           decision somebody can change without touching the code.

           A pasted /wizard/<id> link overrides it, and lands on the room it
           names instead — that link was about a particular room. */
        /* The opening view is set, not travelled to. Every other flyTo on
           this page glides, which is what makes following a link inside the
           map feel like moving rather than cutting — but the first view has
           nowhere to glide FROM, and easing into it from the fitted whole
           map is a lurch before the reader has looked at anything. */
        const wanted = roomIdFromPath();
        const room = wanted && roomById(wanted);
        if (room) {
            view.flyTo(room.x, room.y, 2.6, { smooth: false });
            openRoom(room.id, { push: false });
        } else if (map.startZoom) {
            view.flyTo(map.startX == null ? 50 : map.startX,
                map.startY == null ? 50 : map.startY, openingZoom(map), { smooth: false });
        }

        stage.classList.add("is-ready");
    }

    load();
});

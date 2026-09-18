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
            // The reveal card is dismissed by the reader leaving the passage
            // rather than by a timer, and this is where the map says it has
            // moved. See checkRevealAway.
            checkRevealAway();
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

    /* ---------- secret passages ----------

       Some of this map is not in the map. A "reveal" is a set of rooms and
       trails that the API leaves out of the public payload entirely, plus
       the word that fetches them — see netlify/functions/wizard.js, where
       the subtraction happens. Nothing here can therefore leak a passage by
       being read carelessly: the records genuinely are not on the page until
       the endpoint has been given the code.

       Two ways in, because they suit different people. There is a control in
       the header with a box in it, which is the one somebody finds by
       looking; and you can simply start typing at the map, which is the one
       that feels like the thing it is pretending to be. Both end up in
       tryCodes below. */
    const secretsEl = document.getElementById("wiz-secrets");
    const secretTally = document.getElementById("wiz-secret-tally");
    const secretCount = document.getElementById("wiz-secret-count");
    const revealEl = document.getElementById("wiz-reveal");
    const revealName = document.getElementById("wiz-reveal-name");
    const revealMsg = document.getElementById("wiz-reveal-msg");
    const whisperEl = document.getElementById("wiz-whisper");

    /* What the map admits exists: one entry per enabled secret, carrying its
       id and whatever hint was written for it. Never a name and never a
       code. */
    let secrets = [];
    const foundIds = new Set();

    /* ---------- remembering what has been found ----------

       OFF. A passage opens for as long as the page is open and is shut again
       by a reload — every visit starts with the code untyped.

       The machinery is left here rather than deleted because this is a
       decision that may well be taken the other way later, and it is one
       word either way. Turn REMEMBER_SECRETS on and found passages survive a
       reload again; nothing else has to change.

       What it does when it is on: keeps the codes, not the answers. On the
       next load they are replayed against the endpoint, which hands back the
       rooms exactly as it would for somebody typing them — so a secret that
       has since been switched off, or had its code changed, simply stops
       opening. Nothing about the passage is cached where it could go stale
       or be read out of storage by someone who never solved it.

       localStorage rather than a cookie or an account: there is no sign-in on
       this page and there should not need to be one to look at a map. The
       consequence is that discoveries are per-browser, which is the right
       trade — this is a puzzle, not a save file, and somebody who clears
       their history has lost nothing they cannot type again.

       Wrapped in try/catch throughout: localStorage throws outright in some
       privacy modes. */
    const REMEMBER_SECRETS = false;
    const KEEP_KEY = "mazerats_wizard_secrets";

    function keptCodes() {
        if (!REMEMBER_SECRETS) return [];
        try {
            const raw = JSON.parse(localStorage.getItem(KEEP_KEY) || "[]");
            return Array.isArray(raw) ? raw.filter(c => typeof c === "string").slice(0, 40) : [];
        } catch (e) { return []; }
    }

    function keepCode(code) {
        if (!REMEMBER_SECRETS || !code) return;
        try {
            const all = new Set(keptCodes());
            all.add(code);
            localStorage.setItem(KEEP_KEY, JSON.stringify([...all].slice(0, 40)));
        } catch (e) { /* nothing worth breaking the page over */ }
    }

    /* Anything an earlier visit left behind, thrown away.

       While this was on, a reader's codes were written to their browser and
       are still sitting there. Not reading them would be enough to make
       reloads forget — but leaving them is a promise this page is no longer
       keeping, and turning the feature back on months from now would silently
       reopen passages somebody solved in a different week. Cleared on the
       first load after the switch went off, and a no-op every load after
       that. */
    if (!REMEMBER_SECRETS) {
        try { localStorage.removeItem(KEEP_KEY); } catch (e) { /* private mode */ }
    }

    function drawSecretCount() {
        if (!secretsEl || !secrets.length) return;
        secretsEl.hidden = false;
        /* A count of what has been found, not a score out of the total.
           "2 of 7" reads as a task with five jobs left on it; "2 secret
           passages found" reads as something you have done. */
        const n = foundIds.size;
        secretCount.textContent = n === 0
            ? "No secret passages found"
            : `${n} secret passage${n === 1 ? "" : "s"} found`;
        secretsEl.classList.toggle("is-complete", n === secrets.length);

        /* The clues, and the one line saying what to do with them, both in
           the tooltip rather than on the page.

           There is nowhere else for them now that there is no drawer, and on
           reflection that is where they belong anyway. A clue printed under
           the map is an instruction everybody reads whether they wanted the
           puzzle or not; a clue you find by wondering what the tally means
           and hovering over it is a clue somebody went looking for. Solved
           ones are marked rather than dropped, so it stays a record of the
           whole puzzle instead of a shrinking to-do list.

           title rather than a rendered panel also means it costs no layout
           and cannot be styled into looking like a button. */
        const lines = secrets
            .filter(s => s.hint)
            .map(s => (foundIds.has(s.id) ? "✓ " : "— ") + s.hint);
        if (secretTally) {
            secretTally.title = lines.length
                ? lines.join("\n") + "\n\nSome words are best simply spoken aloud."
                : "Some words are best simply spoken aloud.";
        }
    }

    /* ---------- the flight ----------

       What a reveal looks like. The map pulls back a little, holds, and then
       moves across and settles slowly onto the new passage.

       The pull-back is the part worth explaining. Flying straight from a
       close view of one corner to a close view of another is a smear: at
       high zoom the whole journey happens off-screen and the reader arrives
       somewhere with no idea where it is in relation to where they were.
       Rising first means the two places are both in frame during the middle
       of the move, so the passage is delivered with its position in the
       castle attached — which, on a map whose whole subject is how the rooms
       connect, is the part that matters.

       Skipped entirely for a reader who has asked for reduced motion: they
       get the destination, set rather than travelled to. */
    const REVEAL_RATE = 0.022;   // against GLIDE_RATE's 0.24 — about a tenth
    const REVEAL_OUT_RATE = 0.05;

    function calmly() {
        return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    /* Where to fly. The admin may pin a point and a zoom to the secret; when
       they have not — which is the common case, and the one the editor
       defaults to — the revealed rooms are framed instead, which is very
       nearly always what pinning it by hand would have produced anyway. */
    function revealTarget(found) {
        const { secret, rooms } = found;
        if (secret.focusX != null && secret.focusY != null) {
            return { x: secret.focusX, y: secret.focusY, zoom: secret.focusZoom || 3 };
        }
        const placed = (rooms || []).filter(r => r.x != null && r.y != null);
        if (!placed.length) return null;
        const xs = placed.map(r => r.x), ys = placed.map(r => r.y);
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        const y0 = Math.min(...ys), y1 = Math.max(...ys);
        /* A zoom that fits the spread of them with room around it. A single
           room has no spread at all, hence the floor — without it the
           arithmetic asks for infinite magnification of one point. */
        const spread = Math.max(x1 - x0, y1 - y0, 3);
        const map = view.getMap() || {};
        const want = 62 / spread;
        return {
            x: (x0 + x1) / 2,
            y: (y0 + y1) / 2,
            zoom: Math.max(map.minZoom || 1, Math.min(map.maxZoom || 6, want))
        };
    }

    function flyToReveal(target) {
        if (!target) return;
        if (calmly()) {
            view.flyTo(target.x, target.y, target.zoom, { smooth: false });
            return;
        }
        const map = view.getMap() || {};
        const here = view.getZoom ? view.getZoom() : 1;
        /* Up to somewhere both places can be seen from, but never further
           out than the map itself allows and never further out than the
           reader already was — pulling BACK from an already-wide view just
           to push in again is a wobble, not a move. */
        const high = Math.max(map.minZoom || 1, Math.min(here, target.zoom) * 0.55);
        view.flyTo((target.x + 50) / 2, (target.y + 50) / 2, high, { rate: REVEAL_OUT_RATE });
        setTimeout(() => {
            view.flyTo(target.x, target.y, target.zoom, { rate: REVEAL_RATE });
        }, 900);
    }

    /* ---------- the announcement ----------

       It stays up until the reader leaves the passage it is describing,
       rather than for a fixed few seconds.

       A timer was the wrong instrument. The card names a passage that has
       just been revealed and says what opened it — which is worth reading
       twice, and is being read while the eye is also taking in three new
       rooms and the trails between them. Four seconds is either too long for
       somebody who has already moved on or far too short for somebody still
       looking, and there is no number that is right for both. So it is
       dismissed by the one thing that actually says the reader is done with
       it: they have gone somewhere else.

       "Gone somewhere else" means none of the revealed rooms is on screen any
       more. Panning away does it, and so does zooming in past them. Staying
       put does not, however long you stay.

       `seen` is the guard that makes this safe. The card is only ever taken
       away once the passage has actually been in frame — without it, a reveal
       whose rooms happened to be off screen at the moment the card appeared
       would dismiss itself on the very next frame, which is the one failure
       mode of driving a dismissal from position rather than from time. */
    let revealTimer = 0;
    let watching = null;

    function announce(secret, rooms) {
        if (!revealEl) return;
        clearTimeout(revealTimer);
        revealEl.classList.remove("is-going");
        revealName.textContent = secret.name || "A passage opens";
        revealMsg.textContent = secret.message || "";
        revealEl.hidden = false;

        const ids = (rooms || []).map(r => r.id).filter(id => view.elementFor("room", id));
        if (ids.length) {
            watching = { ids, seen: false, best: null, bestZoom: 0 };
            /* A backstop for the case the `seen` guard creates: if the
               passage is never once in frame, "they have left it" can never
               become true and the card would sit there for good. Cancelled
               the moment it IS in frame, so a reader who is looking at what
               it describes is never interrupted by it. */
            revealTimer = setTimeout(() => {
                if (watching && !watching.seen) dismissReveal();
            }, 15000);
            return;
        }
        /* Nothing on the map to watch — a secret that reveals only trails,
           or whose rooms have no position yet. Back to a timer, because a
           card with no dismissal at all would simply sit there. */
        watching = null;
        revealTimer = setTimeout(dismissReveal, 6000);
    }

    function dismissReveal() {
        if (!revealEl || revealEl.hidden) return;
        watching = null;
        clearTimeout(revealTimer);
        revealEl.classList.add("is-going");
        // Matches the transition in .wiz-reveal.is-going — long enough for the
        // fade to finish, short enough that it is out of the way by the time
        // the reader has finished the drag that dismissed it.
        revealTimer = setTimeout(() => {
            revealEl.hidden = true;
            revealEl.classList.remove("is-going");
        }, 280);
    }

    /* Whether any of the watched rooms is still in the frame. Measured off
       the elements themselves rather than recomputed from zoom and pan: the
       engine has already done that arithmetic to place them, and asking the
       browser where they ended up cannot disagree with where they were
       drawn.

       The margin means a name half off the edge does not count as being
       there — by the time it is clipped to a few pixels the reader has
       plainly moved on. */
    function revealInView() {
        const box = stage.getBoundingClientRect();
        const margin = 28;
        for (const id of watching.ids) {
            const el = view.elementFor("room", id);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            if (r.right > box.left + margin && r.left < box.right - margin
                && r.bottom > box.top + margin && r.top < box.bottom - margin) return true;
        }
        return false;
    }

    /* How far off centre the passage is sitting, as a fraction of the frame.

       This one number is what the dismissal is built on, and it is chosen
       because of a property nothing else here has: THE REVEAL'S OWN FLIGHT
       CAN ONLY MAKE IT SMALLER. The flight is travelling towards the
       passage, so every frame of it brings the rooms nearer the middle. A
       reader panning or zooming away can only make it bigger.

       That is what lets the map's own movement be told from the reader's
       without asking the map which is which — and the distinction is the
       whole problem here, because the flight is deliberately slow and is
       usually still easing when the card appears. Anchoring to a position
       instead meant the flight's next frame read as "they have moved away"
       and the card dismissed itself instantly, every time. */
    function revealOffCentre() {
        const box = stage.getBoundingClientRect();
        let sx = 0, sy = 0, n = 0;
        for (const id of watching.ids) {
            const el = view.elementFor("room", id);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            sx += r.left + r.width / 2;
            sy += r.top + r.height / 2;
            n++;
        }
        if (!n) return null;
        const dx = sx / n - (box.left + box.width / 2);
        const dy = sy / n - (box.top + box.height / 2);
        return Math.hypot(dx, dy) / Math.max(1, Math.min(box.width, box.height));
    }

    /* How far the view has to move before the card is dismissed.

       Waiting for the passage to leave the frame entirely was too patient by
       half: the card would sit there through a long slow drag right up until
       the last room clipped the edge, which on a zoomed-in map is a good deal
       of dragging. The reader has said they are done with it as soon as they
       start moving — so that is when it goes.

       MOVE is a fraction of the shorter side of the frame, not a pixel count,
       so it means the same thing on a phone and on a desk. ZOOM is a log
       ratio, which makes it symmetrical: in and out by the same proportion
       trigger at the same point.

       Both are set well above the wobble of a single trackpad notch, so
       nudging the map does not dismiss it, and well below anything anyone
       would call travelling. */
    const AWAY_MOVE = 0.12;
    const AWAY_ZOOM = 0.18;

    // Called on every view change — see onView, where the map reports that it
    // has moved.
    /* Fixes "here" — but only once the map has stopped moving by itself.

       This has to wait, and the reason is worth setting down. The card goes
       up with the last name, and the reveal's own flight is often STILL
       EASING at that moment: it is deliberately slow, and exponential easing
       has a long tail. Anchoring the instant the card appeared meant the very
       next frame of that flight had already moved the map "away" from a point
       it was still travelling towards, so the card dismissed itself
       immediately, every time.

       The map cannot tell me whether a movement is its own or the reader's,
       and it should not have to. So the anchor is simply taken a beat after
       the LAST movement of any kind: while anything is still moving the timer
       keeps being pushed back, and the moment things are still, wherever the
       map has come to rest becomes "here". Any movement after that is
       somebody's hand. */
    function checkRevealAway() {
        if (!watching || !revealEl || revealEl.hidden) return;

        if (!watching.seen) {
            if (!revealInView()) return;
            watching.seen = true;
            // It has been looked at, so the backstop is not needed and must
            // not fire under somebody who is still reading.
            clearTimeout(revealTimer);
        }

        // Gone from the frame entirely: no argument about it.
        if (!revealInView()) return dismissReveal();

        const off = revealOffCentre();
        const zoom = view.getZoom();
        if (off == null) return;

        /* The closest the passage has come to the middle, and the zoom it was
           at when it got there. The flight keeps improving on both, so both
           keep being rewritten while it is still arriving; once it settles
           they stop moving, and from then on they are the mark the reader is
           measured against.

           No timers and no guessing about when the flight is done — the
           reading is simply monotonic in one direction for the map and the
           other for the reader. */
        if (watching.best == null || off < watching.best) {
            watching.best = off;
            watching.bestZoom = zoom;
            return;
        }

        const drifted = off - watching.best;
        const zoomed = Math.abs(Math.log(zoom / watching.bestZoom));
        if (drifted > AWAY_MOVE || zoomed > AWAY_ZOOM) dismissReveal();
    }

    /* ---------- walking the passage in ----------

       What has just been revealed does not simply appear. The footprints
       land one at a time, in the order they were walked, and the room's name
       arrives only once the last of them is down.

       That order is the whole point. A trail that fades in whole is a fact
       about the map; a trail that is laid one print at a time is somebody
       walking, and you do not find out where they were going until they
       arrive. It costs nothing but the waiting, and the waiting is the
       thing being bought.

       The DOM already holds the prints in walking order — layTrail appends
       them along the curve — so this is a delay per element and no
       rearranging.

       The spacing is worked out from how many there are rather than fixed,
       so the walk lasts about the same time whatever it is crossing. A fixed
       gap would make a two-room passage over in a blink and a long one run
       for half a minute; this keeps the pace deliberate at both ends, within
       limits so it can never become either a stutter or a slideshow. */
    /* ---------- the pace of the walk ----------

       WALK_STEP is the whole thing: one footprint lands, then that long, then
       the next. It is a real per-step interval and not a total divided by
       however many prints there are, which is what it used to be — and that
       is why this needed changing. A fixed budget spread over a long trail
       collapses the gap to nothing: the witch passage has 59 footprints, so a
       four-second budget put them down 71ms apart, and sixty things arriving
       fourteen to the second is not a walk, it is a wipe. The pace now stays
       the same whether a passage is two prints long or two hundred; what
       changes is how long it takes, which is the honest way round.

       WALK_CEILING is the one concession to that — a passage so long it would
       otherwise run for a minute is quietly hurried up. It is deliberately
       far above anything on this map, so in practice every walk runs at
       WALK_STEP exactly.

       If this wants tuning later, WALK_STEP is the number. Nothing else here
       needs to move with it: the arcs and the names are counted in
       footprints' worth of time, so they slow down in proportion. */
    const WALK_LEAD = 1200;      // before the first print, while the map is still flying
    const WALK_STEP = 200;       // one footprint every this long — the pace
    const WALK_CEILING = 20000;  // a very long passage is hurried to fit this
    const WALK_SETTLE = 600;     // the beat between the last name and the announcement
    const NAME_BEATS = 5;        // a name is worth this many footprints of time

    /* The order a passage is drawn in.

       `sequence` is what somebody arranged in the editor — "path:c065",
       "room:r063" and so on, top to bottom. Everything below is about the
       two things that are not in it.

       FIRST, the linking trails. A trail is returned by the unlock when it
       merely TOUCHES a revealed room — that is what stops a passage arriving
       with no way into it (see the endpoint) — so it was never added by hand
       and has no place in the list. Rather than tack these on the end, each
       one is played immediately before the first room in the order that it
       leads to, which is the only position that reads correctly: footprints
       walk in, and then the name of the place they arrive at appears.

       SECOND, a reveal with no sequence at all, which is every one made
       before this existed. Those play the way they always did — every trail,
       then every name — and that is what falling back to concatenating the
       two arrays gives. */
    function revealOrder(found) {
        const paths = found.paths || [];
        const rooms = found.rooms || [];
        const pathById = new Map(paths.map(p => [p.id, p]));
        const stored = (found.secret && found.secret.sequence) || null;

        const listed = stored && stored.length
            ? stored.map(entry => {
                const [kind, id] = entry.split(/:(.+)/);
                return { kind, id };
            }).filter(e => e.kind === "room"
                ? rooms.some(r => r.id === e.id)
                : pathById.has(e.id))
            : paths.map(p => ({ kind: "path", id: p.id }))
                .concat(rooms.map(r => ({ kind: "room", id: r.id })));

        // Anything the unlock returned that the order does not mention.
        const spoken = new Set(listed.map(e => `${e.kind}:${e.id}`));
        const extraPaths = paths.filter(p => !spoken.has(`path:${p.id}`));
        const extraRooms = rooms.filter(r => !spoken.has(`room:${r.id}`));

        const out = [];
        for (const entry of listed) {
            if (entry.kind === "room") {
                /* Any unlisted trail that arrives at this room goes in
                   first — the approach, then the arrival. Spliced here
                   rather than appended so it is walked on the way in. */
                for (let i = extraPaths.length - 1; i >= 0; i--) {
                    const path = extraPaths[i];
                    if (path.from !== entry.id && path.to !== entry.id) continue;
                    out.push({ kind: "path", id: path.id });
                    extraPaths.splice(i, 1);
                }
            }
            out.push(entry);
        }
        // Whatever is left over: trails that reach none of the listed rooms,
        // and rooms added to the secret since the order was last arranged.
        for (const path of extraPaths) out.push({ kind: "path", id: path.id });
        for (const room of extraRooms) out.push({ kind: "room", id: room.id });
        return out;
    }

    /* Returns when the name lands, in ms from now — the caller uses it to
       hold the announcement back to the same moment. Zero for a reader who
       has asked for reduced motion, who gets all of it at once. */
    function markFound(found) {
        if (calmly()) return 0;

        /* The revealed trails, in the order they are to be travelled, broken
           into the pieces that arrive one at a time.

           Not every trail is walked. A trail between two junctions is laid in
           footprints and each one is its own beat; a trail into a dead end —
           which is most secret passages, including this map's — is RULED,
           drawn as a single tapering pen stroke. There are no steps in a pen
           stroke to bring in one by one, so it is inked in over a slot of its
           own instead, worth several footprints' worth of time so it does not
           flash past between two of them.

           (It cannot be drawn progressively along its length, which would be
           the nicer answer: .wiz-arc path is a FILLED shape rather than a
           stroked one — that is what gives it the tapering weight of a pen —
           and a fill has no stroke to run a dash offset along.) */
        const ARC_BEATS = 10;
        const order = revealOrder(found);

        /* Each entry in the running order, turned into the things that
           actually arrive. A trail becomes one beat per footprint, or a
           single longer beat if it is ruled; a room becomes one beat holding
           its name. */
        const beats = [];
        for (const entry of order) {
            if (entry.kind === "room") {
                const el = view.elementFor("room", entry.id);
                if (el) beats.push({ el, cls: "is-arriving", span: NAME_BEATS, name: true });
                continue;
            }
            const group = view.elementFor("path", entry.id);
            if (!group) continue;
            const prints = group.querySelectorAll(".wiz-print");
            if (prints.length) {
                for (const print of prints) beats.push({ el: print, cls: "is-stepping", span: 1 });
                continue;
            }
            const arc = group.querySelector(".wiz-arc");
            if (arc) beats.push({ el: arc, cls: "is-inking", span: ARC_BEATS });
        }

        const total = beats.reduce((n, b) => n + b.span, 0);
        // The pace, unless the passage is long enough to need hurrying.
        const gap = total ? Math.min(WALK_STEP, WALK_CEILING / total) : 0;

        const touched = [];
        const names = [];
        let at = WALK_LEAD;
        let lastNameAt = WALK_LEAD;
        for (const beat of beats) {
            beat.el.style.setProperty("--step-delay", `${Math.round(at)}ms`);
            if (beat.span > 1 && !beat.name) {
                beat.el.style.setProperty("--ink-time", `${Math.round(beat.span * gap)}ms`);
            }
            beat.el.classList.add(beat.cls);
            (beat.name ? names : touched).push(beat.el);
            if (beat.name) lastNameAt = at;
            at += beat.span * gap;
        }

        /* When the announcement goes up: with the LAST name to arrive, so it
           never gives away a room the reader has not been shown yet. */
        const nameAt = Math.max(lastNameAt, WALK_LEAD) + WALK_SETTLE;

        /* Cleared once it has played. animation-fill-mode holds the final
           opacity, and a held opacity of 1 sits on top of whatever the zoom
           bands want the thing to be — so leaving these on would quietly
           make a revealed room immune to fading out at low zoom. */
        setTimeout(() => {
            for (const el of touched.concat(names)) {
                el.classList.remove("is-stepping", "is-inking", "is-arriving");
                el.style.removeProperty("--step-delay");
                el.style.removeProperty("--ink-time");
            }
        }, nameAt + 1400);

        return nameAt;
    }

    /* ---------- trying a code ----------

       `quiet` is the stored-code replay on load: the same request, but it
       must not announce anything or fly anywhere. Somebody opening the map
       has not just found these passages, they found them last week, and a
       page that opens by performing four reveals at once and landing on
       whichever was last is a page that has forgotten what the reader asked
       for. They are simply drawn, already there. */
    let asking = false;

    async function tryCodes(codes, { quiet = false } = {}) {
        if (asking) return { ok: false, found: [] };
        asking = true;
        let answer;
        try {
            answer = await Api.unlockWizardSecret(codes);
        } catch (err) {
            asking = false;
            return { ok: false, found: [], failed: true };
        }
        asking = false;

        const fresh = [];
        for (const found of answer.found || []) {
            const added = view.addRecords(found);
            if (found.secret.code) keepCode(found.secret.code);
            const isNew = !foundIds.has(found.secret.id);
            foundIds.add(found.secret.id);
            if (added > 0 || isNew) fresh.push(found);
        }

        if (fresh.length) {
            /* Rebuilt in the same order load() does it, and for the same
               reason: a revealed room is a room somebody can now search for
               and link to, and its address is derived from its name. */
            buildSlugs();
            view.render();
            if (!quiet) {
                const first = fresh[0];
                /* The order matters. markFound hides the new prints and
                   names behind their own delays before the browser has
                   painted once — it runs in the same tick as the render
                   above, so nothing flashes into view and then starts
                   walking. */
                const nameAt = markFound(first);
                flyToReveal(revealTarget(first));
                // The banner arrives with the name, not before it. Saying
                // what has opened while the footprints are still crossing
                // the parchment gives away the ending. It is handed the
                // revealed rooms because it stays up until the reader leaves
                // them — see announce.
                if (nameAt > 0) setTimeout(() => announce(first.secret, first.rooms), nameAt);
                else announce(first.secret, first.rooms);
            }
        }
        drawSecretCount();
        return { ...answer, fresh };
    }

    /* ---------- typing at the map ----------

       No box, no prompt: letters typed while the map has focus accumulate,
       and every time the buffer ends with something that is a code, it
       opens. Which means there is nothing to submit and no wrong answer to
       be told about — a miss simply never becomes a hit, which is a great
       deal more in keeping with a secret than a form that says "incorrect".

       The buffer is only tried when it has stopped growing for a moment,
       rather than on every letter: a seven-letter code typed at speed would
       otherwise be seven requests, six of them certain to fail, and the
       rate limiter would stop the seventh. */
    let buffer = "";
    let bufferTimer = 0;
    let whisperTimer = 0;

    function whisper(text) {
        if (!whisperEl) return;
        clearTimeout(whisperTimer);
        if (text.length < 2) { whisperEl.hidden = true; return; }
        whisperEl.textContent = text;
        whisperEl.hidden = false;
        whisperTimer = setTimeout(() => { whisperEl.hidden = true; }, 2000);
    }

    document.addEventListener("keydown", e => {
        if (!secrets.length) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // Not while they are typing into something that wants the letters.
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
        // Nor over the room sheet, where the keys mean something else.
        if (modal.classList.contains("open")) return;

        if (e.key === "Backspace") {
            buffer = buffer.slice(0, -1);
            whisper(buffer);
            return;
        }
        if (e.key.length !== 1 || !/[a-z0-9 ']/i.test(e.key)) return;
        buffer = (buffer + e.key).slice(-60);
        whisper(buffer);

        clearTimeout(bufferTimer);
        bufferTimer = setTimeout(async () => {
            const guess = buffer.trim();
            if (guess.length < 3) return;
            const answer = await tryCodes(guess);
            if (answer.fresh && answer.fresh.length) {
                buffer = "";
                if (whisperEl) whisperEl.hidden = true;
            }
        }, 650);
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
        /* The line under the title. It carries a sensible default written
           into wizard.html, so this REPLACES rather than reveals — and an
           empty Intro field in the admin leaves the default standing instead
           of leaving a gap where a sentence should be. */
        const intro = document.getElementById("wiz-intro");
        if (intro && map.intro) intro.textContent = map.intro;
        const credit = document.getElementById("wiz-credit");
        if (credit && map.credit) { credit.textContent = map.credit; credit.hidden = false; }

        if (!(data.rooms || []).length) {
            statusEl.hidden = false;
            statusEl.textContent = "This map has nothing on it yet.";
        }

        /* The secrets this map has, and — only while REMEMBER_SECRETS is on —
           whichever of them this browser has already been given the word for.
           It is off, so keptCodes is empty and nothing is replayed: every
           visit begins with every passage shut.

           The replay is deliberately silent — see the `quiet` note on
           tryCodes — and deliberately not awaited: it is a second round trip,
           and the castle should be on screen and usable while it happens
           rather than held back for passages the reader found last week. When
           it lands, the extra rooms are added and the map re-renders. */
        secrets = data.secrets || [];
        drawSecretCount();
        const kept = keptCodes();
        if (secrets.length && kept.length) {
            tryCodes(kept, { quiet: true });
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

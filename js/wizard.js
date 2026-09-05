/* The public Habbo Hogwarts map at /wizard.

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
        onView: z => { if (zoomLabel) zoomLabel.textContent = `${Math.round(z * 100)}%`; },
        onRoomClick: id => openRoom(id),
        onRoomHover: (id, el) => {
            if (!id) return hideTooltip();
            const room = view.getRooms().find(r => r.id === id);
            if (room) showTooltip(room, el);
        }
    });

    const roomById = id => view.getRooms().find(r => r.id === id);

    // ---------- hovering ----------

    function showTooltip(room, el) {
        const thumb = room.thumb || room.image;
        tooltipEl.innerHTML = `
            ${thumb ? `<img class="wiz-tip-thumb" src="${escapeHtml(thumb)}" alt="">` : ""}
            <p class="wiz-tip-name">${escapeHtml(room.name)}</p>
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

        modalTitle.textContent = view.fullName(room);
        const picture = room.image || room.thumb;
        modalImg.hidden = !picture;
        modalNoImg.hidden = !!picture;
        if (picture) {
            modalImg.src = picture;
            modalImg.alt = `${room.name} — the room as it was`;
        } else {
            modalImg.removeAttribute("src");
        }

        const meta = [];
        if (room.floor) meta.push(["Floor", room.floor]);
        if (room.status) meta.push(["Status", room.status]);
        modalMeta.innerHTML = meta
            .map(([k, v]) => `<div class="wiz-meta-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`)
            .join("");
        modalMeta.hidden = !meta.length;

        modalDesc.textContent = room.description || "Nothing has been written about this room yet.";
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
                .map(e => `<button type="button" class="wiz-exit${e.secret ? " is-secret" : ""}" data-go="${escapeHtml(e.id)}"${e.via ? ` title="${escapeHtml(e.via)}"` : ""}>${escapeHtml(e.name)}${e.via ? `<span class="wiz-exit-via">${escapeHtml(e.via)}</span>` : ""}</button>`)
                .join("")}${unnamed ? `<span class="wiz-exit-unknown">${unnamed} trail${unnamed > 1 ? "s" : ""} nobody has followed yet</span>` : ""}</div>`
            : "";
        modalExits.hidden = !exits.length && !unnamed;

        modalLink.value = `${location.origin}/wizard/${room.id}`;

        modal.classList.add("open");
        modal.querySelector(".modal").focus();
        // A room is a place you can link to, so opening one is a place in the
        // history: Back closes the sheet rather than leaving the site.
        if (push) history.pushState({ room: room.id }, "", `/wizard/${room.id}`);
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
        return m ? decodeURIComponent(m[1]) : null;
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
                        <span class="wiz-result-name">${escapeHtml(r.name)}</span>
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

    // ---------- controls ----------

    document.getElementById("wiz-zoom-in").addEventListener("click", () => view.zoomTo(view.getZoom() * 1.5));
    document.getElementById("wiz-zoom-out").addEventListener("click", () => view.zoomTo(view.getZoom() / 1.5));
    document.getElementById("wiz-zoom-reset").addEventListener("click", () => view.setZoom(1));

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
        view.render();

        const map = data.map || {};
        document.title = `${map.title || "Habbo Hogwarts"} — Maze Rats`;
        const heading = document.getElementById("wiz-title");
        if (heading) heading.textContent = map.title || "Habbo Hogwarts";
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
        const wanted = roomIdFromPath();
        const room = wanted && roomById(wanted);
        if (room) {
            view.flyTo(room.x, room.y, 2.6);
            openRoom(room.id, { push: false });
        } else if (map.startZoom) {
            view.flyTo(map.startX == null ? 50 : map.startX,
                map.startY == null ? 50 : map.startY, map.startZoom);
        }

        stage.classList.add("is-ready");
    }

    load();
});

/* Drives the homepage (home.html) — the only browsing page on the site.
   "Featured" is the default state (no top nav button active): one
   highlighted maze, no search. The top row (Mazes / Events) picks which
   category is being browsed; clicking that same top button again toggles
   back to Featured. The sub row beneath it always shows exactly 3 filter
   buttons, but which 3 depends on the active top button — Open/Archived/
   Collab under Mazes, Upcoming/Past/Archive under Events (see SUB_OPTIONS).
   Clicking a row opens the full detail modal, with its own gallery viewer
   and lightbox. */
document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("featured-grid");
    const introEl = document.getElementById("featured-intro");
    const searchWrap = document.getElementById("search-wrap");
    const searchInput = document.getElementById("room-search");
    const sortSelect = document.getElementById("room-sort");
    const emptyEl = document.getElementById("featured-empty");
    const topNavBtns = document.querySelectorAll("#top-nav .chrome-nav-btn");
    const subNavEl = document.getElementById("sub-nav");
    const subNavBtns = document.querySelectorAll("#sub-nav .chrome-nav-btn");

    const SUB_OPTIONS = {
        mazes: [["open", "OPEN"], ["archived", "ARCHIVED"], ["collab", "COLLAB"]],
        events: [["upcoming", "UPCOMING"], ["past", "PAST"], ["archive", "ARCHIVE"]]
    };

    const modalOverlay = document.getElementById("room-modal");
    const modalThumb = document.getElementById("modal-thumb");
    const modalGalleryImg = document.getElementById("modal-gallery-img");
    const galleryPrev = document.getElementById("gallery-prev");
    const galleryNext = document.getElementById("gallery-next");
    const galleryCounter = document.getElementById("gallery-counter");
    const galleryPosition = document.getElementById("gallery-position");
    const galleryBonusTab = document.getElementById("gallery-bonus-tab");
    const galleryStrip = document.getElementById("gallery-strip");
    const modalName = document.getElementById("modal-name");
    const modalCreator = document.getElementById("modal-creator");
    const modalMeta = document.getElementById("modal-meta");
    const modalDesc = document.getElementById("modal-desc");
    const modalTags = document.getElementById("modal-tags");
    const modalLink = document.getElementById("modal-link");
    const modalClose = document.getElementById("modal-close");

    const lightboxOverlay = document.getElementById("image-lightbox");
    const lightboxImg = document.getElementById("lightbox-img");
    const lightboxClose = document.getElementById("lightbox-close");
    const lightboxPrev = document.getElementById("lightbox-prev");
    const lightboxNext = document.getElementById("lightbox-next");
    const lightboxCounter = document.getElementById("lightbox-counter");

    let topView = "featured"; // "featured" | "mazes" | "events"
    let mazesSub = "open"; // "open" | "archived" | "collab"
    let eventsSub = "upcoming"; // "upcoming" | "past" | "archive"
    let sortBy = "date"; // "date" | "name" | "difficulty"
    let query = "";
    let activeGallery = null;
    let activeIndex = 0;
    let ROOMS = [];
    let EVENTS = [];
    let dataLoaded = false;
    let currentItems = [];

    function effectiveView() {
        if (topView === "mazes") return mazesSub;
        if (topView === "events") return eventsSub;
        return "featured";
    }

    const emptyMessagesNoSearch = {
        featured: "No mazes archived yet.",
        open: "No open mazes archived yet.",
        archived: "No archived mazes yet.",
        collab: "No collab mazes yet.",
        upcoming: "No events scheduled.",
        past: "No past events yet.",
        archive: "No archived events yet."
    };
    const emptyMessagesSearch = {
        open: "No open mazes match your search.",
        archived: "No archived mazes match your search.",
        collab: "No collab mazes match your search.",
        upcoming: "No events match your search.",
        past: "No past events match your search.",
        archive: "No archived events match your search."
    };

    function sourceItems(view) {
        if (view === "featured" || view === "open") return ROOMS.filter(r => r.status === "open" || r.status === "unknown");
        if (view === "archived") return ROOMS.filter(r => r.status === "closed");
        if (view === "collab") return ROOMS.filter(r => r.status === "collab");
        if (view === "upcoming") return EVENTS.filter(e => (e.status || "upcoming") === "upcoming");
        if (view === "past") return EVENTS.filter(e => e.status === "past");
        return EVENTS.filter(e => e.status === "archive");
    }

    // Normalizes a room or event into one shared shape so rendering and the
    // modal don't need to branch on what kind of thing they're showing.
    function normalize(item, isEvents) {
        if (isEvents) {
            return {
                name: item.title,
                subtitle: item.host ? `by ${item.host}` : "",
                statusKey: item.status || "upcoming",
                statusLabel: item.status === "past" ? "Past" : item.status === "archive" ? "Archived" : "Upcoming",
                hotel: item.hotel,
                dateFieldLabel: "Date",
                dateValue: item.date,
                endDateValue: item.endDate,
                thumb: item.thumb,
                description: item.description,
                details: item.details,
                tags: item.tags,
                habboLink: item.habboLink,
                gallery: null,
                sortKey: item.date || ""
            };
        }
        return {
            name: item.name,
            subtitle: item.creator ? `by ${item.creator}` : "",
            statusKey: item.status,
            statusLabel: item.status === "open" ? "Open" : item.status === "closed" ? "Closed" : item.status === "collab" ? "Collab" : "Unknown",
            hotel: item.hotel,
            dateFieldLabel: "Opened",
            dateValue: item.added,
            thumb: item.thumb,
            description: item.description,
            details: item.details,
            tags: item.tags,
            habboLink: item.habboLink,
            gallery: item.gallery,
            entrance: item.entrance,
            finish: item.finish,
            difficulty: item.difficulty || "",
            sortKey: item.added || ""
        };
    }

    function matchesQuery(n) {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return n.name.toLowerCase().includes(q) ||
            n.subtitle.toLowerCase().includes(q) ||
            (n.tags || []).some(t => t.toLowerCase().includes(q));
    }

    // Order matters here — it's also the ascending "easiest first" sort
    // order used by the Difficulty option in the sort dropdown, and js/
    // admin.js keeps its own copy of the same value/label pairs.
    const DIFFICULTY_ORDER = ["easy", "medium", "hard", "very-hard", "extreme"];
    const DIFFICULTY_LABELS = {
        easy: "Easy",
        medium: "Medium",
        hard: "Hard",
        "very-hard": "Very Hard",
        extreme: "Extreme"
    };

    // Shared by the row card and the modal — difficulty (if set) always
    // leads, styled as a tag but colour-coded, followed by the room's own
    // tags in whatever order they were saved.
    function tagsHtml(n) {
        const difficultyHtml = n.difficulty
            ? `<span class="tag difficulty-${n.difficulty}">${DIFFICULTY_LABELS[n.difficulty] || n.difficulty}</span>`
            : "";
        return difficultyHtml + (n.tags || []).map(t => `<span class="tag">${t}</span>`).join("");
    }

    function sortItems(items) {
        const sorted = items.slice();
        if (sortBy === "name") {
            sorted.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === "difficulty-asc" || sortBy === "difficulty-desc") {
            const dir = sortBy === "difficulty-asc" ? 1 : -1;
            sorted.sort((a, b) => {
                const ai = DIFFICULTY_ORDER.indexOf(a.difficulty);
                const bi = DIFFICULTY_ORDER.indexOf(b.difficulty);
                // Unrated items have no place in either direction of the
                // scale, so they're always pushed to the end regardless of
                // which way the rated items are sorting.
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return (ai - bi) * dir;
            });
        } else {
            sorted.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
        }
        return sorted;
    }

    // Gallery entries used to be plain image path strings (labels derived
    // from the filename); the admin's room-by-room editor now stores richer
    // {image, label} objects instead. Normalize both shapes so old seeded
    // data keeps working alongside anything added through the new editor.
    function normalizeGalleryItem(entry) {
        if (typeof entry === "string") return { image: entry, label: deriveGalleryLabel(entry), bonus: false };
        return { image: entry.image, label: entry.label || deriveGalleryLabel(entry.image), bonus: !!entry.bonus };
    }

    // Event start/end are stored as UTC ISO strings — render them as a
    // fixed-UTC duration range so the displayed time never silently shifts
    // with the visitor's local timezone. Collapses to one date when start
    // and end share a day.
    function formatUtcParts(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return null;
        return {
            date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
            time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })
        };
    }

    function formatEventDuration(startIso, endIso) {
        if (!startIso) return "";
        const start = formatUtcParts(startIso);
        if (!start) return startIso;
        const end = endIso ? formatUtcParts(endIso) : null;
        if (!end) return `${start.date}, ${start.time} UTC`;
        if (start.date === end.date) return `${start.date}, ${start.time}–${end.time} UTC`;
        return `${start.date} ${start.time} UTC – ${end.date} ${end.time} UTC`;
    }

    function renderSubNav() {
        const isFeatured = topView === "featured";
        subNavEl.style.display = isFeatured ? "none" : "flex";
        if (isFeatured) return;
        const options = SUB_OPTIONS[topView];
        const activeSub = topView === "mazes" ? mazesSub : eventsSub;
        subNavBtns.forEach((btn, i) => {
            const [value, label] = options[i];
            btn.textContent = label;
            btn.dataset.subValue = value;
            btn.classList.toggle("active", value === activeSub);
        });
    }

    function updateChrome() {
        const isFeatured = topView === "featured";
        introEl.style.display = isFeatured ? "block" : "none";
        searchWrap.style.display = isFeatured ? "none" : "flex";
        topNavBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.top === topView));
        renderSubNav();
    }

    function render() {
        updateChrome();

        if (!dataLoaded) {
            introEl.textContent = "Loading…";
            grid.innerHTML = "";
            emptyEl.style.display = "none";
            return;
        }

        const isFeatured = topView === "featured";
        const view = effectiveView();
        const rawItems = sourceItems(view)
            .map(item => normalize(item, topView === "events"))
            .filter(matchesQuery);
        // The Featured pick always means "newest", regardless of whatever
        // sort the (hidden, on this view) dropdown was last left on.
        const items = isFeatured ? rawItems.sort((a, b) => b.sortKey.localeCompare(a.sortKey)) : sortItems(rawItems);
        currentItems = isFeatured ? items.slice(0, 1) : items;

        if (isFeatured) introEl.textContent = "A featured maze from the collection.";

        // The Open Mazes list trades the short description for the date the
        // maze opened, shown right next to the owner's name instead.
        const isOpenView = view === "open";

        grid.innerHTML = currentItems.map(n => `
            <div class="chrome-list-row featured">
                <div class="row-thumb" ${n.thumb ? `style="background-image: url('${imgCdn(n.thumb, 160, 160, 65)}');"` : ""}>
                    <span class="status-badge status-${n.statusKey}">${n.statusLabel}</span>
                </div>
                <div class="row-info">
                    <h3>${n.name}</h3>
                    <p class="row-creator">${n.subtitle}${isOpenView && n.dateValue ? ` <span class="row-date">· ${n.dateFieldLabel} ${n.dateValue}</span>` : ""}</p>
                    ${isOpenView ? "" : `<p class="row-desc">${n.description || ""}</p>`}
                    <div class="row-tags">${tagsHtml(n)}</div>
                </div>
                <span class="chrome-go">Go &#9654;</span>
            </div>
        `).join("");

        grid.querySelectorAll(".chrome-list-row").forEach((row, i) => {
            row.addEventListener("click", () => openModal(currentItems[i]));
        });

        const messages = (!isFeatured && query.trim()) ? emptyMessagesSearch : emptyMessagesNoSearch;
        emptyEl.textContent = messages[view];
        emptyEl.style.display = currentItems.length === 0 ? "block" : "none";
    }

    // Entrance/Finish slides always display as "Entrance"/"Complete" in the
    // viewer, regardless of whatever label the admin typed for them (that
    // label still names the underlying image everywhere else, e.g. the
    // admin's own editor) — only kind:"room" entries show their real label.
    function displayLabel(g) {
        if (g.kind === "entrance") return "Entrance";
        if (g.kind === "finish") return "Complete";
        return g.label;
    }

    function showGalleryImage(index) {
        if (!activeGallery || !activeGallery.length) return;
        activeIndex = (index + activeGallery.length) % activeGallery.length;
        const g = activeGallery[activeIndex];
        const label = displayLabel(g);
        // Entrance/Finish are bookends, not numbered rooms — the position
        // counter only ever reflects g.roomIndex/g.roomTotal, which are only
        // set on kind:"room" entries, so it's hidden for the bookends.
        const position = g.kind === "room" ? `${g.roomIndex} of ${g.roomTotal}` : "";
        modalGalleryImg.src = imgCdn(g.image, 900, null, 78);
        modalGalleryImg.alt = `${modalName.textContent} — ${label}`;
        galleryCounter.textContent = label;
        galleryPosition.textContent = position;
        galleryPosition.style.display = position ? "block" : "none";
        galleryBonusTab.style.display = (g.kind === "room" && g.bonus) ? "block" : "none";
        galleryStrip.querySelectorAll("img").forEach((thumb, i) => {
            thumb.classList.toggle("active", i === activeIndex);
        });
        const activeThumb = galleryStrip.children[activeIndex];
        if (activeThumb) activeThumb.scrollIntoView({ inline: "center", block: "nearest" });

        if (lightboxOverlay.classList.contains("open")) {
            lightboxImg.src = modalGalleryImg.src;
            lightboxImg.alt = modalGalleryImg.alt;
            lightboxCounter.textContent = position ? `${label} — ${position}` : label;
        }
    }

    function openLightbox() {
        if (!activeGallery || !activeGallery.length) return;
        lightboxImg.src = modalGalleryImg.src;
        lightboxImg.alt = modalGalleryImg.alt;
        const g = activeGallery[activeIndex];
        lightboxCounter.textContent = g.kind === "room" ? `${galleryCounter.textContent} — ${galleryPosition.textContent}` : galleryCounter.textContent;
        lightboxOverlay.classList.add("open");
    }

    function closeLightbox() {
        lightboxOverlay.classList.remove("open");
    }

    function openModal(n) {
        modalName.textContent = n.name;
        modalCreator.textContent = n.subtitle;
        const dateDisplay = topView === "events" ? formatEventDuration(n.dateValue, n.endDateValue) : n.dateValue;
        modalMeta.innerHTML = `
            <span class="status-badge status-${n.statusKey}">${n.statusLabel}</span>
            <span>Hotel: ${n.hotel || "Unknown"}</span>
            <span>${n.dateFieldLabel}: ${dateDisplay || "Unknown"}</span>
        `;
        modalDesc.textContent = n.details || n.description || "";
        modalTags.innerHTML = tagsHtml(n);
        if (n.habboLink) {
            modalLink.href = n.habboLink;
            modalLink.style.display = "inline-block";
        } else {
            modalLink.style.display = "none";
        }

        // The entrance/finish images (if set) always bookend the gallery,
        // ahead of and after the room-by-room shots — they're stored
        // separately from n.gallery so the admin's reorder controls for
        // regular rooms can never displace them. Only kind:"room" entries
        // get a roomIndex/roomTotal, so the position counter (built in
        // showGalleryImage) never counts the bookends.
        const entranceItem = n.entrance && n.entrance.image
            ? { image: n.entrance.image, label: n.entrance.label || "Entrance", kind: "entrance" }
            : null;
        const finishItem = n.finish && n.finish.image
            ? { image: n.finish.image, label: n.finish.label || "Finish", kind: "finish" }
            : null;
        const roomItems = (n.gallery || []).map(normalizeGalleryItem);
        const roomTotal = roomItems.length;
        const roomEntries = roomItems.map((g, i) => ({ ...g, kind: "room", roomIndex: i + 1, roomTotal }));
        const combinedGallery = [
            ...(entranceItem ? [entranceItem] : []),
            ...roomEntries,
            ...(finishItem ? [finishItem] : [])
        ];

        if (combinedGallery.length) {
            activeGallery = combinedGallery;
            modalThumb.classList.add("has-gallery");
            modalThumb.style.backgroundImage = "";
            modalGalleryImg.style.display = "block";
            galleryPrev.style.display = "flex";
            galleryNext.style.display = "flex";
            galleryCounter.style.display = "block";
            galleryStrip.style.display = "flex";
            galleryStrip.innerHTML = activeGallery.map((g, i) =>
                `<img src="${imgCdn(g.image, 110, 110, 55)}" loading="lazy" alt="${displayLabel(g)}" data-index="${i}">`
            ).join("");
            galleryStrip.querySelectorAll("img").forEach(thumb => {
                thumb.addEventListener("click", () => showGalleryImage(Number(thumb.dataset.index)));
            });
            showGalleryImage(0);
        } else {
            activeGallery = null;
            modalThumb.classList.remove("has-gallery");
            modalGalleryImg.style.display = "none";
            galleryPrev.style.display = "none";
            galleryNext.style.display = "none";
            galleryCounter.style.display = "none";
            galleryPosition.style.display = "none";
            galleryBonusTab.style.display = "none";
            galleryStrip.style.display = "none";
            galleryStrip.innerHTML = "";
            modalThumb.style.backgroundImage = n.thumb
                ? `linear-gradient(rgba(10,7,4,0.15), rgba(10,7,4,0.35)), url('${imgCdn(n.thumb, 800, 500, 70)}')`
                : "";
        }

        modalOverlay.classList.add("open");
    }

    function closeModal() {
        modalOverlay.classList.remove("open");
        closeLightbox();
        activeGallery = null;
    }

    searchInput.addEventListener("input", e => {
        query = e.target.value;
        render();
    });

    sortSelect.addEventListener("change", e => {
        sortBy = e.target.value;
        render();
    });

    // Clicking the already-active top button toggles it off, back to the
    // default Featured state (and hides the sub row) — otherwise it
    // switches straight to that category, keeping whichever sub-filter was
    // last picked for it (defaulting to the first one).
    topNavBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const top = btn.dataset.top;
            topView = topView === top ? "featured" : top;
            searchInput.value = "";
            query = "";
            render();
        });
    });

    // Sub-row buttons just change the filter within whichever top category
    // is active — no toggle-off, one of the 3 is always selected.
    subNavBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const value = btn.dataset.subValue;
            if (!value) return;
            if (topView === "mazes") mazesSub = value;
            else if (topView === "events") eventsSub = value;
            searchInput.value = "";
            query = "";
            render();
        });
    });

    modalClose.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", e => {
        if (e.target === modalOverlay) closeModal();
    });
    galleryPrev.addEventListener("click", () => showGalleryImage(activeIndex - 1));
    galleryNext.addEventListener("click", () => showGalleryImage(activeIndex + 1));
    modalGalleryImg.addEventListener("click", openLightbox);

    lightboxClose.addEventListener("click", closeLightbox);
    lightboxImg.addEventListener("click", closeLightbox);
    lightboxOverlay.addEventListener("click", e => {
        if (e.target === lightboxOverlay) closeLightbox();
    });
    lightboxPrev.addEventListener("click", () => showGalleryImage(activeIndex - 1));
    lightboxNext.addEventListener("click", () => showGalleryImage(activeIndex + 1));

    document.addEventListener("keydown", e => {
        if (!modalOverlay.classList.contains("open")) return;
        if (e.key === "Escape") {
            if (lightboxOverlay.classList.contains("open")) closeLightbox();
            else closeModal();
        }
        if (activeGallery) {
            if (e.key === "ArrowLeft") showGalleryImage(activeIndex - 1);
            if (e.key === "ArrowRight") showGalleryImage(activeIndex + 1);
        }
    });

    render();

    Promise.all([Api.getRooms(), Api.getEvents()]).then(([rooms, events]) => {
        ROOMS = rooms;
        EVENTS = events;
        dataLoaded = true;
        render();
    });
});

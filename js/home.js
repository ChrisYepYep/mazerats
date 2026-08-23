/* Drives the homepage (index.html) — the only browsing page on the site.
   "Featured" is the default state (no nav button active): one highlighted
   maze, no search. Clicking Open Mazes / Archived Mazes / Events switches
   to a full searchable list in the same frame; clicking that same button
   again toggles back to Featured. Clicking a row opens the full detail
   modal, with its own gallery viewer and lightbox. */
document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("featured-grid");
    const introEl = document.getElementById("featured-intro");
    const searchWrap = document.getElementById("search-wrap");
    const searchInput = document.getElementById("room-search");
    const resultCountEl = document.getElementById("result-count");
    const emptyEl = document.getElementById("featured-empty");
    const navBtns = document.querySelectorAll(".chrome-nav-btn");

    const modalOverlay = document.getElementById("room-modal");
    const modalThumb = document.getElementById("modal-thumb");
    const modalGalleryImg = document.getElementById("modal-gallery-img");
    const galleryPrev = document.getElementById("gallery-prev");
    const galleryNext = document.getElementById("gallery-next");
    const galleryCounter = document.getElementById("gallery-counter");
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

    let currentView = "featured"; // "featured" | "open" | "archived" | "events"
    let query = "";
    let activeGallery = null;
    let activeIndex = 0;
    let ROOMS = [];
    let EVENTS = [];
    let dataLoaded = false;
    let currentItems = [];

    const emptyMessagesNoSearch = {
        featured: "No mazes archived yet.",
        open: "No open mazes archived yet.",
        archived: "No archived mazes yet.",
        events: "No events scheduled."
    };
    const emptyMessagesSearch = {
        open: "No open mazes match your search.",
        archived: "No archived mazes match your search.",
        events: "No events match your search."
    };

    function sourceItems(view) {
        if (view === "featured" || view === "open") return ROOMS.filter(r => r.status === "open" || r.status === "unknown");
        if (view === "archived") return ROOMS.filter(r => r.status === "closed");
        return EVENTS.filter(e => (e.status || "upcoming") === "upcoming");
    }

    // Normalizes a room or event into one shared shape so rendering and the
    // modal don't need to branch on what kind of thing they're showing.
    function normalize(item, view) {
        if (view === "events") {
            return {
                name: item.title,
                subtitle: item.host ? `by ${item.host}` : "",
                statusKey: item.status || "upcoming",
                statusLabel: item.status === "past" ? "Past" : "Upcoming",
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
            statusLabel: item.status === "open" ? "Open" : item.status === "closed" ? "Closed" : "Unknown",
            hotel: item.hotel,
            dateFieldLabel: "Archived",
            dateValue: item.added,
            thumb: item.thumb,
            description: item.description,
            details: item.details,
            tags: item.tags,
            habboLink: item.habboLink,
            gallery: item.gallery,
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

    // Gallery entries used to be plain image path strings (labels derived
    // from the filename); the admin's room-by-room editor now stores richer
    // {image, label} objects instead. Normalize both shapes so old seeded
    // data keeps working alongside anything added through the new editor.
    function normalizeGalleryItem(entry) {
        if (typeof entry === "string") return { image: entry, label: deriveGalleryLabel(entry) };
        return { image: entry.image, label: entry.label || deriveGalleryLabel(entry.image) };
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

    function updateChrome() {
        const isFeatured = currentView === "featured";
        introEl.style.display = isFeatured ? "block" : "none";
        searchWrap.style.display = isFeatured ? "none" : "block";
        resultCountEl.style.display = isFeatured ? "none" : "block";
    }

    function render() {
        updateChrome();

        if (!dataLoaded) {
            introEl.textContent = "Loading…";
            grid.innerHTML = "";
            emptyEl.style.display = "none";
            resultCountEl.textContent = "";
            return;
        }

        const isFeatured = currentView === "featured";
        const items = sourceItems(currentView)
            .map(item => normalize(item, currentView))
            .filter(matchesQuery)
            .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
        currentItems = isFeatured ? items.slice(0, 1) : items;

        if (isFeatured) introEl.textContent = "A featured maze from the collection.";

        grid.innerHTML = currentItems.map(n => `
            <div class="chrome-list-row featured">
                <div class="row-thumb" ${n.thumb ? `style="background-image: url('${imgCdn(n.thumb, 160, 160, 65)}');"` : ""}>
                    <span class="status-badge status-${n.statusKey}">${n.statusLabel}</span>
                </div>
                <div class="row-info">
                    <h3>${n.name}</h3>
                    <p class="row-creator">${n.subtitle}</p>
                    <p class="row-desc">${n.description || ""}</p>
                    <div class="row-tags">${(n.tags || []).map(t => `<span class="tag">${t}</span>`).join("")}</div>
                </div>
                <span class="chrome-go">Go &#9654;</span>
            </div>
        `).join("");

        grid.querySelectorAll(".chrome-list-row").forEach((row, i) => {
            row.addEventListener("click", () => openModal(currentItems[i]));
        });

        if (!isFeatured) {
            const nouns = currentView === "events" ? "event" : "maze";
            resultCountEl.textContent = `${currentItems.length} ${nouns}${currentItems.length === 1 ? "" : "s"} found`;
        }

        const messages = (!isFeatured && query.trim()) ? emptyMessagesSearch : emptyMessagesNoSearch;
        emptyEl.textContent = messages[currentView];
        emptyEl.style.display = currentItems.length === 0 ? "block" : "none";
    }

    function showGalleryImage(index) {
        if (!activeGallery || !activeGallery.length) return;
        activeIndex = (index + activeGallery.length) % activeGallery.length;
        const g = activeGallery[activeIndex];
        modalGalleryImg.src = imgCdn(g.image, 900, null, 78);
        modalGalleryImg.alt = `${modalName.textContent} — ${g.label}`;
        galleryCounter.textContent = `${g.label} — ${activeIndex + 1} of ${activeGallery.length}`;
        galleryStrip.querySelectorAll("img").forEach((thumb, i) => {
            thumb.classList.toggle("active", i === activeIndex);
        });
        const activeThumb = galleryStrip.children[activeIndex];
        if (activeThumb) activeThumb.scrollIntoView({ inline: "center", block: "nearest" });

        if (lightboxOverlay.classList.contains("open")) {
            lightboxImg.src = modalGalleryImg.src;
            lightboxImg.alt = modalGalleryImg.alt;
            lightboxCounter.textContent = galleryCounter.textContent;
        }
    }

    function openLightbox() {
        if (!activeGallery || !activeGallery.length) return;
        lightboxImg.src = modalGalleryImg.src;
        lightboxImg.alt = modalGalleryImg.alt;
        lightboxCounter.textContent = galleryCounter.textContent;
        lightboxOverlay.classList.add("open");
    }

    function closeLightbox() {
        lightboxOverlay.classList.remove("open");
    }

    function openModal(n) {
        modalName.textContent = n.name;
        modalCreator.textContent = n.subtitle;
        const dateDisplay = currentView === "events" ? formatEventDuration(n.dateValue, n.endDateValue) : n.dateValue;
        modalMeta.innerHTML = `
            <span class="status-badge status-${n.statusKey}">${n.statusLabel}</span>
            <span>Hotel: ${n.hotel || "Unknown"}</span>
            <span>${n.dateFieldLabel}: ${dateDisplay || "Unknown"}</span>
        `;
        modalDesc.textContent = n.details || n.description || "";
        modalTags.innerHTML = (n.tags || []).map(t => `<span class="tag">${t}</span>`).join("");
        if (n.habboLink) {
            modalLink.href = n.habboLink;
            modalLink.style.display = "inline-block";
        } else {
            modalLink.style.display = "none";
        }

        if (n.gallery && n.gallery.length) {
            activeGallery = n.gallery.map(normalizeGalleryItem);
            modalThumb.classList.add("has-gallery");
            modalThumb.style.backgroundImage = "";
            modalGalleryImg.style.display = "block";
            galleryPrev.style.display = "flex";
            galleryNext.style.display = "flex";
            galleryCounter.style.display = "block";
            galleryStrip.style.display = "flex";
            galleryStrip.innerHTML = activeGallery.map((g, i) =>
                `<img src="${imgCdn(g.image, 110, 110, 55)}" loading="lazy" alt="${g.label}" data-index="${i}">`
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

    // Clicking the already-active nav button toggles it off, back to the
    // default Featured state — otherwise it switches straight to that view.
    navBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const view = btn.dataset.view;
            navBtns.forEach(b => b.classList.remove("active"));
            if (currentView === view) {
                currentView = "featured";
            } else {
                btn.classList.add("active");
                currentView = view;
            }
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

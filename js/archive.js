/* Renders the room/event archive on archive.html: view switching (Open
   Mazes / Archived Mazes / Events), search, and the modal detail view. */
document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("room-grid");
    const searchInput = document.getElementById("room-search");
    const navBtns = document.querySelectorAll(".chrome-nav-btn");
    const resultCount = document.getElementById("result-count");
    const emptyState = document.getElementById("empty-state");

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

    let currentView = "open"; // "open" | "archived" | "events"
    let query = "";
    let activeGallery = null;
    let activeIndex = 0;
    let ROOMS = [];
    let EVENTS = [];
    let dataLoaded = false;

    const emptyMessagesNoSearch = {
        open: "No open mazes archived yet.",
        archived: "No archived mazes yet.",
        events: "No events scheduled."
    };
    const emptyMessagesSearch = {
        open: "No open mazes match your search.",
        archived: "No archived mazes match your search.",
        events: "No events match your search."
    };

    // Normalizes a room or event into one shared shape so the rest of this
    // file doesn't need to branch on what kind of thing it's rendering.
    function normalize(item) {
        if (currentView === "events") {
            return {
                raw: item,
                name: item.title,
                subtitle: item.host ? `by ${item.host}` : "",
                statusKey: item.status || "upcoming",
                statusLabel: item.status === "past" ? "Past" : "Upcoming",
                hotel: item.hotel,
                dateFieldLabel: "Date",
                dateValue: item.date,
                thumb: item.thumb,
                description: item.description,
                details: item.details,
                tags: item.tags,
                habboLink: item.habboLink,
                gallery: null
            };
        }
        return {
            raw: item,
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
            gallery: item.gallery
        };
    }

    function sourceItems() {
        if (currentView === "open") return ROOMS.filter(r => r.status === "open" || r.status === "unknown");
        if (currentView === "archived") return ROOMS.filter(r => r.status === "closed");
        return EVENTS.filter(e => (e.status || "upcoming") === "upcoming");
    }

    function matchesQuery(n) {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return n.name.toLowerCase().includes(q) ||
            n.subtitle.toLowerCase().includes(q) ||
            (n.tags || []).some(t => t.toLowerCase().includes(q));
    }

    function rowThumbStyle(n) {
        return n.thumb ? `background-image: url('${encodeURI(n.thumb)}');` : "";
    }

    // Gallery entries used to be plain image path strings (labels derived from
    // the filename); the admin's room-by-room editor now stores richer
    // {image, label} objects instead. Normalize both shapes so old seeded data
    // keeps working alongside anything added through the new editor.
    function normalizeGalleryItem(entry) {
        if (typeof entry === "string") return { image: entry, label: deriveGalleryLabel(entry) };
        return { image: entry.image, label: entry.label || deriveGalleryLabel(entry.image) };
    }

    // Event dates/times are stored as UTC ISO strings (e.g.
    // "2026-08-23T18:00:00Z") — render them in a fixed UTC format so the
    // displayed time never silently shifts with the visitor's local timezone.
    function formatEventDateTime(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        const datePart = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
        const timePart = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
        return `${datePart}, ${timePart} UTC`;
    }

    function render() {
        const items = sourceItems().map(normalize).filter(matchesQuery);
        grid.innerHTML = "";

        items.forEach(n => {
            const row = document.createElement("div");
            row.className = "chrome-list-row featured";
            row.innerHTML = `
                <div class="row-thumb" style="${rowThumbStyle(n)}">
                    <span class="status-badge status-${n.statusKey}">${n.statusLabel}</span>
                </div>
                <div class="row-info">
                    <h3>${n.name}</h3>
                    <p class="row-creator">${n.subtitle}</p>
                    <p class="row-desc">${n.description || ""}</p>
                    <div class="row-tags">${(n.tags || []).map(t => `<span class="tag">${t}</span>`).join("")}</div>
                </div>
                <span class="chrome-go">Go &#9654;</span>
            `;
            row.addEventListener("click", () => openModal(n));
            grid.appendChild(row);
        });

        if (!dataLoaded) {
            resultCount.textContent = "Loading…";
            emptyState.style.display = "none";
            return;
        }

        const nouns = currentView === "events" ? "event" : "maze";
        resultCount.textContent = `${items.length} ${nouns}${items.length === 1 ? "" : "s"} found`;
        const messages = query.trim() ? emptyMessagesSearch : emptyMessagesNoSearch;
        emptyState.querySelector("p").textContent = messages[currentView];
        emptyState.style.display = items.length === 0 ? "block" : "none";
    }

    function showGalleryImage(index) {
        if (!activeGallery || !activeGallery.length) return;
        activeIndex = (index + activeGallery.length) % activeGallery.length;
        const g = activeGallery[activeIndex];
        modalGalleryImg.src = encodeURI(g.image);
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
        const dateDisplay = currentView === "events" ? formatEventDateTime(n.dateValue) : n.dateValue;
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
                `<img src="${encodeURI(g.image)}" loading="lazy" alt="${g.label}" data-index="${i}">`
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
                ? `linear-gradient(rgba(10,7,4,0.15), rgba(10,7,4,0.35)), url('${encodeURI(n.thumb)}')`
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

    navBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            navBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentView = btn.dataset.view;
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

    // Deep-link support: ?view=open|archived|events lets other pages (e.g.
    // the homepage's own nav buttons) send the visitor straight into the
    // matching view here, instead of always landing on the default.
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView && ["open", "archived", "events"].includes(requestedView)) {
        currentView = requestedView;
        navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === requestedView));
    }

    render();

    Promise.all([Api.getRooms(), Api.getEvents()]).then(([rooms, events]) => {
        ROOMS = rooms;
        EVENTS = events;
        dataLoaded = true;
        render();
    });
});

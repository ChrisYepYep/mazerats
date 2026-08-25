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
    const modalCard = modalOverlay.querySelector(".modal");
    const modalThumb = document.getElementById("modal-thumb");
    const galleryViewport = document.getElementById("gallery-viewport");
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
    const modalLinksWrap = document.getElementById("modal-links-wrap");
    const modalLinks = document.getElementById("modal-links");
    const modalTags = document.getElementById("modal-tags");
    const modalLink = document.getElementById("modal-link");
    const modalClose = document.getElementById("modal-close");

    const lightboxOverlay = document.getElementById("image-lightbox");
    const lightboxImg = document.getElementById("lightbox-img");
    const lightboxClose = document.getElementById("lightbox-close");
    const lightboxPrev = document.getElementById("lightbox-prev");
    const lightboxNext = document.getElementById("lightbox-next");
    const lightboxCounter = document.getElementById("lightbox-counter");

    let topView = "mazes"; // "featured" | "mazes" | "events" — opens on Mazes by default
    let mazesSub = "open"; // "open" | "archived" | "collab"
    let eventsSub = "upcoming"; // "upcoming" | "past" | "archive"
    let sortBy = "date"; // "date" | "name" | "difficulty"
    let query = "";
    let activeGallery = null;
    let activeIndex = 0;
    let autoAdvanceTimer = null;
    let slideOutgoingEl = null;
    let slideRequestSeq = 0;
    let modalCloseToken = 0;
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
                // Events use the exact same fallback (entrance shot when no
                // thumb is set) and the same gallery/entrance/finish shape
                // as mazes, so openModal's gallery-building logic already
                // works unmodified for either kind.
                thumb: item.thumb || (item.entrance && item.entrance.image) || "",
                description: item.description,
                details: item.details,
                tags: item.tags,
                habboLink: item.habboLink,
                gallery: item.gallery,
                entrance: item.entrance,
                finish: item.finish,
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
            // No dedicated thumbnail? Fall back to the entrance shot rather
            // than showing nothing — it's the same kind of image (a single
            // screenshot representing the room) and every maze that bothers
            // uploading an entrance image already has one on hand.
            thumb: item.thumb || (item.entrance && item.entrance.image) || "",
            description: item.description,
            details: item.details,
            linksReferences: item.linksReferences,
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

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // Turns any bare URL in the Links & References text into a real,
    // clickable <a> — text is escaped first so the input can't inject
    // markup, then URLs are matched against the already-escaped string
    // (safe, since URLs don't rely on the characters escapeHtml touches).
    // Trailing punctuation is peeled off the link itself rather than
    // swallowed into it: plain sentence punctuation (a period, a comma...),
    // and a closing paren specifically when it has no matching "(" earlier
    // in the match — i.e. it's closing surrounding text like "(see url)",
    // not part of the URL's own path.
    function linkifyText(str) {
        return escapeHtml(str).replace(/((?:https?:\/\/|www\.)[^\s<]+)/gi, match => {
            let core = match;
            let trailing = "";
            while (core.length) {
                const last = core[core.length - 1];
                if (".,!?;:".includes(last)) {
                    trailing = last + trailing;
                    core = core.slice(0, -1);
                    continue;
                }
                if (last === ")" && (core.match(/\)/g) || []).length > (core.match(/\(/g) || []).length) {
                    trailing = last + trailing;
                    core = core.slice(0, -1);
                    continue;
                }
                break;
            }
            if (!core) return match;
            const href = /^https?:\/\//i.test(core) ? core : `https://${core}`;
            return `<a href="${href}" target="_blank" rel="noopener" class="ref-link">${core}</a>${trailing}`;
        });
    }

    // Room thumbnails start invisible (see .row-thumb-img in style.css) and
    // fade in once actually loaded, instead of popping in abruptly the
    // instant each one's network request finishes — img.complete covers
    // the case where it's already cached and "load" will never fire.
    function wireThumbFadeIn(container) {
        container.querySelectorAll(".row-thumb-img").forEach(img => {
            if (img.complete) img.classList.add("is-loaded");
            else img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
        });
    }

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
        if (typeof entry === "string") return { image: entry, label: deriveGalleryLabel(entry), bonus: false, runThrough: false };
        return {
            image: entry.image,
            label: entry.label || deriveGalleryLabel(entry.image),
            bonus: !!entry.bonus,
            runThrough: !!entry.runThrough
        };
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

    // Maze "Opened" dates get the same day/month/year formatting as event
    // dates (see formatUtcParts above) — just the date half, since a maze's
    // opening has no time component the way an event's start/end does.
    function formatMazeDate(iso) {
        if (!iso) return "";
        // "YYYY-MM" with no day (the admin's Day dropdown left on "—", for
        // a maze whose exact opening date isn't known) — new Date() would
        // otherwise silently default the missing day to the 1st and
        // display a specific date that was never actually given.
        const monthOnly = /^(\d{4})-(\d{2})$/.exec(iso);
        if (monthOnly) {
            const d = new Date(`${iso}-01T00:00:00Z`);
            if (isNaN(d)) return iso;
            return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
        }
        const parts = formatUtcParts(iso);
        return parts ? parts.date : iso;
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
                <div class="row-thumb">
                    ${n.thumb ? `<div class="row-thumb-crop"><img class="row-thumb-img" src="${imgCdn(n.thumb, 160, 160, 65)}" alt="" loading="lazy"></div>` : ""}
                    <span class="status-badge status-${n.statusKey}">${n.statusLabel}</span>
                </div>
                <div class="row-info">
                    <h3>${n.name}</h3>
                    <p class="row-creator">${n.subtitle}${isOpenView && n.dateValue ? ` <span class="row-date">· ${n.dateFieldLabel} ${formatMazeDate(n.dateValue)}</span>` : ""}</p>
                    ${isOpenView ? "" : `<p class="row-desc">${n.description || ""}</p>`}
                    <div class="row-tags">${tagsHtml(n)}</div>
                </div>
                <span class="chrome-go">Go &#9654;</span>
            </div>
        `).join("");

        grid.querySelectorAll(".chrome-list-row").forEach((row, i) => {
            row.addEventListener("click", () => openModal(currentItems[i]));
        });
        wireThumbFadeIn(grid);

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

    // opts.instant skips the slide entirely (used when a room's modal first
    // opens — there's no meaningful "previous" image to slide away from,
    // and sliding in from a stale leftover position would look like a glitch).
    function showGalleryImage(index, opts = {}) {
        if (!activeGallery || !activeGallery.length) return;
        const nextIndex = (index + activeGallery.length) % activeGallery.length;
        // Direction is read off the raw, pre-wrap index vs. the current one
        // so wrapping past either end (last -> first via Next, first -> last
        // via Prev) still slides the way the button implies instead of
        // snapping backwards because the wrapped index looks smaller.
        const direction = index > activeIndex ? 1 : (index < activeIndex ? -1 : 1);
        const skipSlide = opts.instant || nextIndex === activeIndex;
        activeIndex = nextIndex;
        const g = activeGallery[activeIndex];
        const label = displayLabel(g);
        // Entrance/Finish are bookends, not numbered rooms — the position
        // counter only ever reflects g.roomIndex/g.roomTotal, which are only
        // set on kind:"room" entries, so it's hidden for the bookends.
        const position = (g.kind === "room" && g.roomIndex) ? `${g.roomIndex} of ${g.roomTotal}` : "";
        const newSrc = imgCdn(g.image, 900, null, 78);
        const newAlt = `${modalName.textContent} — ${label}`;
        const oldSrc = modalGalleryImg.getAttribute("src");

        if (!skipSlide && oldSrc) {
            slideGalleryImage(oldSrc, modalGalleryImg.alt, newSrc, newAlt, direction);
        } else {
            modalGalleryImg.style.transition = "none";
            modalGalleryImg.style.transform = "translateX(0)";
            modalGalleryImg.src = newSrc;
            modalGalleryImg.alt = newAlt;
        }
        galleryCounter.textContent = label;
        galleryPosition.textContent = position;
        galleryPosition.style.display = position ? "block" : "none";
        galleryBonusTab.style.display = (g.kind === "room" && g.bonus) ? "block" : "none";
        galleryStrip.querySelectorAll("img").forEach((thumb, i) => {
            thumb.classList.toggle("active", i === activeIndex);
        });
        const activeThumb = galleryStrip.children[activeIndex];
        if (activeThumb) activeThumb.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });

        if (lightboxOverlay.classList.contains("open")) {
            lightboxImg.src = modalGalleryImg.src;
            lightboxImg.alt = modalGalleryImg.alt;
            lightboxCounter.textContent = position ? `${label} — ${position}` : label;
        }
    }

    function stopAutoAdvance() {
        if (autoAdvanceTimer) {
            clearInterval(autoAdvanceTimer);
            autoAdvanceTimer = null;
        }
    }

    // Restarts the 12s countdown from scratch — called both to kick off the
    // carousel and after any manual navigation, so clicking prev/next or a
    // thumbnail doesn't get immediately overridden by a stale timer.
    function restartAutoAdvance() {
        stopAutoAdvance();
        if (!activeGallery || activeGallery.length < 2) return;
        if (lightboxOverlay.classList.contains("open")) return;
        autoAdvanceTimer = setInterval(() => showGalleryImage(activeIndex + 1), 12000);
    }

    // Slides the outgoing image out one side while the new one slides in
    // from the other, matching direction so they read as a single swap
    // rather than two unrelated moves. Only ever one slide in flight — a
    // leftover outgoing clone from an interrupted transition is discarded
    // immediately rather than left to finish, so rapid navigation (spamming
    // next, or a manual click right as the timer fires) never stacks clones.
    //
    // The new image is preloaded first and the slide only starts once it's
    // actually decoded — otherwise the incoming image would slide in blank
    // (or showing the browser's broken-image icon) and only paint once the
    // network catches up mid-animation. If navigation moves on again before
    // that load finishes (seq no longer matches), this preload's result is
    // just discarded rather than starting a now-stale slide.
    function slideGalleryImage(oldSrc, oldAlt, newSrc, newAlt, direction) {
        const seq = ++slideRequestSeq;
        let started = false;

        const startSlide = () => {
            if (started || seq !== slideRequestSeq) return;
            started = true;

            if (slideOutgoingEl) {
                slideOutgoingEl.remove();
                slideOutgoingEl = null;
            }

            const outgoing = modalGalleryImg.cloneNode(true);
            outgoing.removeAttribute("id");
            outgoing.classList.add("gallery-slide-outgoing");
            outgoing.src = oldSrc;
            outgoing.alt = oldAlt;
            outgoing.style.transition = "none";
            outgoing.style.transform = "translateX(0)";
            galleryViewport.appendChild(outgoing);
            slideOutgoingEl = outgoing;

            modalGalleryImg.style.transition = "none";
            modalGalleryImg.style.transform = `translateX(${direction * 100}%)`;
            modalGalleryImg.src = newSrc;
            modalGalleryImg.alt = newAlt;

            // Forces the browser to commit the "start" transforms above before
            // the transition to their end state is requested below — without
            // this the two style writes get coalesced into one paint and
            // neither image appears to move.
            void modalGalleryImg.offsetWidth;

            outgoing.style.transition = "";
            modalGalleryImg.style.transition = "";
            outgoing.style.transform = `translateX(${-direction * 100}%)`;
            modalGalleryImg.style.transform = "translateX(0)";

            outgoing.addEventListener("transitionend", () => {
                outgoing.remove();
                if (slideOutgoingEl === outgoing) slideOutgoingEl = null;
            }, { once: true });
        };

        const preload = new Image();
        preload.onload = startSlide;
        // A failed load still has to swap in — the broken-image box is a
        // more honest result than never advancing the carousel again.
        preload.onerror = startSlide;
        preload.src = newSrc;
        if (preload.complete) startSlide();
    }

    function openLightbox() {
        if (!activeGallery || !activeGallery.length) return;
        stopAutoAdvance();
        lightboxImg.src = modalGalleryImg.src;
        lightboxImg.alt = modalGalleryImg.alt;
        const g = activeGallery[activeIndex];
        lightboxCounter.textContent = g.kind === "room" ? `${galleryCounter.textContent} — ${galleryPosition.textContent}` : galleryCounter.textContent;
        lightboxOverlay.classList.add("open");
    }

    function closeLightbox() {
        lightboxOverlay.classList.remove("open");
        // Only resume the carousel if the room modal itself is still open
        // AND not already on its way out — closeModal() also calls this (to
        // reset lightbox state on exit) while "open" is still set for the
        // closing animation, so the "closing" check stops that path from
        // restarting a timer nothing will ever clear.
        if (modalOverlay.classList.contains("open") && !modalOverlay.classList.contains("closing")) {
            restartAutoAdvance();
        }
    }

    function openModal(n) {
        // Invalidates any in-flight closeModal() from a rapid re-open (its
        // animationend/fallback would otherwise fire later and rip the
        // "open"/"closing" classes off this new instance mid-view).
        modalCloseToken++;
        modalOverlay.classList.remove("closing");

        modalName.textContent = n.name;
        modalCreator.textContent = n.subtitle;
        const dateDisplay = topView === "events" ? formatEventDuration(n.dateValue, n.endDateValue) : formatMazeDate(n.dateValue);
        modalMeta.innerHTML = `
            <span class="status-badge status-${n.statusKey}">${n.statusLabel}</span>
            <span>Hotel: ${n.hotel || "Unknown"}</span>
            <span>${n.dateFieldLabel}: ${dateDisplay || "Unknown"}</span>
        `;
        modalDesc.textContent = n.details || n.description || "";
        if (n.linksReferences) {
            modalLinks.innerHTML = linkifyText(n.linksReferences);
            modalLinksWrap.style.display = "block";
        } else {
            modalLinks.innerHTML = "";
            modalLinksWrap.style.display = "none";
        }
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
        // Run-through and bonus rooms (a walk-through / a side quest, not a
        // numbered room of the maze proper) are skipped by the counter
        // entirely — they get no roomIndex/roomTotal, same as the
        // entrance/finish bookends, so showGalleryImage's position display
        // stays blank for them and every other room's "X of Y" count is
        // unaffected by their presence.
        const roomTotal = roomItems.filter(g => !g.runThrough && !g.bonus).length;
        let roomCounter = 0;
        const roomEntries = roomItems.map(g => {
            if (g.runThrough || g.bonus) return { ...g, kind: "room", roomIndex: null, roomTotal: null };
            roomCounter++;
            return { ...g, kind: "room", roomIndex: roomCounter, roomTotal };
        });
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
                thumb.addEventListener("click", () => {
                    showGalleryImage(Number(thumb.dataset.index));
                    restartAutoAdvance();
                });
            });
            showGalleryImage(0, { instant: true });
            restartAutoAdvance();
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

    // Plays modalOut (see style.css) before actually hiding the overlay,
    // instead of just snapping display:none the instant the user clicks
    // away — the reverse of the modalIn pop the modal opens with.
    function closeModal() {
        if (!modalOverlay.classList.contains("open") || modalOverlay.classList.contains("closing")) return;

        const token = ++modalCloseToken;
        modalOverlay.classList.add("closing");
        stopAutoAdvance();
        closeLightbox();

        const finish = () => {
            if (token !== modalCloseToken) return; // superseded by a reopen
            modalOverlay.classList.remove("open", "closing");
            activeGallery = null;
        };
        modalCard.addEventListener("animationend", finish, { once: true });
        // Fallback in case animationend never fires (e.g. the tab was
        // backgrounded mid-animation and the browser skipped the frame) —
        // the modal must not get stuck permanently mid-close.
        setTimeout(finish, 300);
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
    galleryPrev.addEventListener("click", () => { showGalleryImage(activeIndex - 1); restartAutoAdvance(); });
    galleryNext.addEventListener("click", () => { showGalleryImage(activeIndex + 1); restartAutoAdvance(); });
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
            if (e.key === "ArrowLeft") { showGalleryImage(activeIndex - 1); restartAutoAdvance(); }
            if (e.key === "ArrowRight") { showGalleryImage(activeIndex + 1); restartAutoAdvance(); }
        }
    });

    // The header's upcoming-events widget (site.js) links its title at
    // "home.html#event-<id>" — from any other page that's just a normal
    // navigation, but a click while already on home.html only changes the
    // hash (no reload), so this also has to run on "hashchange", not just
    // once at load.
    function openEventFromHash() {
        const m = /^#event-(.+)$/.exec(location.hash);
        if (!m || !dataLoaded) return;
        const id = decodeURIComponent(m[1]);
        const match = EVENTS.find(e => e.id === id);
        if (match) openModal(normalize(match, true));
    }

    window.addEventListener("hashchange", openEventFromHash);

    render();

    Promise.all([Api.getRooms(), Api.getEvents()]).then(([rooms, events]) => {
        ROOMS = rooms;
        EVENTS = events;
        dataLoaded = true;
        render();
        openEventFromHash();
    });
});

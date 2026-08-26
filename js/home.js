/* Drives the homepage (home.html) — the only browsing page on the site.
   The top row (Mazes / Events) picks which category is being browsed; the
   sub row beneath it always shows exactly 3 filter buttons, but which 3
   depends on the active top button — Open/Archived/Collab under Mazes,
   Upcoming/Past/Archive under Events (see SUB_OPTIONS). The "Featured
   Mazes" button (#featured-mazes-btn) lives inside its own .featured-frame
   below that, which opens beneath it to show the featured pick instead —
   hiding the search/sort row and minimizing .chrome-frame out of the way
   while it's active (see setFeaturedPanelState) — and stays open until a
   sub-nav filter or a top-nav category is clicked, both of which drop back
   to normal browsing (see showFeatured below). Clicking a row opens the
   full detail modal, with its own gallery viewer and lightbox. */
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
    const featuredMazesBtn = document.getElementById("featured-mazes-btn");
    const featuredRefreshBtn = document.getElementById("featured-refresh-btn");
    const featuredFrame = document.getElementById("featured-frame");
    const featuredFrameBody = document.getElementById("featured-frame-body");
    const featuredFrameList = document.getElementById("featured-frame-list");
    const featuredFrameEmpty = document.getElementById("featured-frame-empty");
    const chromeFrameMinimizeToggle = document.getElementById("chrome-frame-minimize-toggle");
    const chromeFrameMinimizeArrow = chromeFrameMinimizeToggle.querySelector(".chrome-frame-minimize-arrow");
    const browseChromeFrame = chromeFrameMinimizeToggle.closest(".chrome-frame");

    const SUB_OPTIONS = {
        mazes: [["open", "OPEN"], ["archived", "ARCHIVED"], ["collab", "COLLAB"]],
        events: [["upcoming", "UPCOMING"], ["past", "PAST"], ["archive", "ARCHIVE"]]
    };

    const modalOverlay = document.getElementById("room-modal");
    const modalCard = modalOverlay.querySelector(".modal");
    const modalThumb = document.getElementById("modal-thumb");
    const galleryViewport = document.getElementById("gallery-viewport");
    const modalGalleryImg = document.getElementById("modal-gallery-img");
    const galleryMissingPill = document.getElementById("gallery-missing-pill");
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

    const modalViewport = document.getElementById("modal-viewport");
    const modalPrimaryView = document.getElementById("modal-primary-view");
    const modalOldVersionsView = document.getElementById("modal-oldversions-view");
    const oldVersionsPill = document.getElementById("old-versions-pill");
    const oldVersionsBackPill = document.getElementById("old-versions-back-pill");
    const oldVersionsImg = document.getElementById("old-versions-img");
    const oldVersionsPrev = document.getElementById("old-versions-prev");
    const oldVersionsNext = document.getElementById("old-versions-next");
    const oldVersionsCounter = document.getElementById("old-versions-counter");
    const oldVersionsStrip = document.getElementById("old-versions-strip");

    const lightboxOverlay = document.getElementById("image-lightbox");
    const lightboxImg = document.getElementById("lightbox-img");
    const lightboxClose = document.getElementById("lightbox-close");
    const lightboxPrev = document.getElementById("lightbox-prev");
    const lightboxNext = document.getElementById("lightbox-next");
    const lightboxCounter = document.getElementById("lightbox-counter");

    let topView = "mazes"; // "mazes" | "events" — opens on Mazes by default
    let mazesSub = "open"; // "open" | "archived" | "collab"
    let eventsSub = "upcoming"; // "upcoming" | "past" | "archive"
    let sortBy = "name"; // "date" | "name" | "owner" | "difficulty"
    let query = "";
    // Independent of topView/mazesSub/eventsSub — layers a featured pick
    // over whichever category is active rather than replacing it, so
    // dropping back out (via a sub-nav filter or a top-nav click) returns
    // to exactly where browsing left off.
    let showFeatured = false;
    let activeGallery = null;
    let activeIndex = 0;
    let autoAdvanceTimer = null;
    let slideOutgoingEl = null;
    let slideRequestSeq = 0;
    let modalCloseToken = 0;
    let oldVersionsGallery = null;
    let oldVersionsIndex = 0;
    let oldVersionsOpen = false;
    let ROOMS = [];
    let EVENTS = [];
    let dataLoaded = false;
    let currentItems = [];

    function effectiveView() {
        return topView === "mazes" ? mazesSub : eventsSub;
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
                owner: item.host || "",
                dateFieldLabel: "Date",
                dateValue: item.date,
                endDateValue: item.endDate,
                // Events use the exact same fallback chain (entrance shot,
                // then the first room-by-room gallery image, when no thumb
                // is set) and the same gallery/entrance/finish shape as
                // mazes, so openModal's gallery-building logic already
                // works unmodified for either kind.
                thumb: item.thumb || (item.entrance && item.entrance.image) || (item.gallery && item.gallery[0] && item.gallery[0].image) || "",
                description: item.description,
                details: item.details,
                linksReferences: item.linksReferences,
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
            owner: item.creator || "",
            dateFieldLabel: "Opened",
            dateValue: item.added,
            // No dedicated thumbnail? Fall back to the entrance shot, then
            // the first room-by-room gallery image, rather than showing
            // nothing — both are the same kind of image (a single
            // screenshot representing the room), and a maze that skipped
            // the thumbnail/entrance fields but still has a gallery almost
            // always has its first room stand in for one anyway.
            thumb: item.thumb || (item.entrance && item.entrance.image) || (item.gallery && item.gallery[0] && item.gallery[0].image) || "",
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
        } else if (sortBy === "owner") {
            sorted.sort((a, b) => a.owner.localeCompare(b.owner));
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
        if (typeof entry === "string") return { image: entry, label: deriveGalleryLabel(entry), bonus: false, runThrough: false, oldVersions: [] };
        return {
            image: entry.image,
            label: entry.label || deriveGalleryLabel(entry.image),
            bonus: !!entry.bonus,
            runThrough: !!entry.runThrough,
            oldVersions: entry.oldVersions || []
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

    // Icons for the maze sub-nav's OPEN/ARCHIVED tabs specifically — no
    // equivalent for Collab, or for any of the events sub-nav's own tabs.
    const SUB_NAV_ICONS = {
        open: "door_open_icon_active.png",
        archived: "door_closed_icon_active.png"
    };

    function renderSubNav() {
        // Always visible now (there's no more state that hides it — the
        // featured view sits on top of whichever category/filter is
        // already selected here rather than replacing this row).
        subNavEl.style.display = "flex";
        const options = SUB_OPTIONS[topView];
        // null while showFeatured — none of the 3 filters actually apply to
        // the featured pick, so none of them should read as selected (and,
        // as a side effect, the active tab's own merge-bridge — pure CSS,
        // keyed off .active — disappears along with it).
        const activeSub = showFeatured ? null : (topView === "mazes" ? mazesSub : eventsSub);
        subNavBtns.forEach((btn, i) => {
            const [value, label] = options[i];
            const icon = SUB_NAV_ICONS[value];
            // Icon is absolutely positioned (see its own CSS) rather than
            // laid out inline before the label, specifically so it doesn't
            // shift the label off the button's own centre — it just floats
            // in the gap between the label and the button's left edge.
            btn.innerHTML = icon
                ? `<img class="chrome-nav-sub-icon" src="assets/img/${icon}" alt="" aria-hidden="true">${label}`
                : label;
            btn.dataset.subValue = value;
            btn.classList.toggle("active", value === activeSub);
        });
    }

    function updateChrome() {
        // .chrome-intro/#featured-intro isn't used by any current view —
        // left in the markup (and kept hidden) rather than removed, in case
        // a future view wants an intro line above the list again.
        introEl.style.display = "none";
        updateSearchWrap();
        featuredMazesBtn.classList.toggle("active", showFeatured);
        // Only ever repopulates on the render() call that actually flips
        // showFeatured to true (the button's own click handler) — every
        // other render() while still in that state only happens after a
        // sub-nav/top-nav click has already set it back to false, which
        // closes the frame instead.
        renderFeaturedList();
        // Couples .chrome-frame's minimize state to showFeatured — see this
        // function's own comment for why the two frames' heights need to be
        // computed together.
        setFeaturedPanelState(showFeatured);
        topNavBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.top === topView));
        renderSubNav();
    }

    // Shared by the main grid and the featured-frame's own list (see
    // renderFeaturedList) — same row markup either place, just a different
    // container around it.
    function roomRowHtml(n, isOpenView) {
        return `
            <div class="chrome-list-row featured" data-difficulty="${n.difficulty || ""}">
                <div class="row-thumb">
                    ${n.thumb ? `<div class="row-thumb-crop"><img class="row-thumb-img" src="${imgCdn(n.thumb, 160, 160, 65)}" alt="" loading="lazy"></div>` : ""}
                </div>
                <div class="row-info">
                    <h3>${n.name}</h3>
                    <p class="row-creator">${n.subtitle}${isOpenView && n.dateValue ? ` <span class="row-date">· ${n.dateFieldLabel} ${formatMazeDate(n.dateValue)}</span>` : ""}</p>
                    ${isOpenView ? "" : `<p class="row-desc">${n.description || ""}</p>`}
                    <div class="row-tags">${tagsHtml(n)}</div>
                </div>
                <div class="row-side">
                    <span class="status-badge status-${n.statusKey}">${n.statusLabel}</span>
                    <span class="chrome-go">Go &#9654;</span>
                </div>
            </div>
        `;
    }

    // .chrome-frame is dedicated to plain Mazes/Events browsing now — the
    // Featured pick lives entirely in .featured-frame instead (see
    // renderFeaturedList) — so this always shows effectiveView() regardless
    // of showFeatured, rather than swapping to the featured pool while that
    // frame's open (chrome-frame is minimized out of the way then anyway).
    function render() {
        updateChrome();

        if (!dataLoaded) {
            grid.innerHTML = "";
            emptyEl.style.display = "none";
            return;
        }

        const view = effectiveView();
        const rawItems = sourceItems(view)
            .map(item => normalize(item, topView === "events"))
            .filter(matchesQuery);
        const items = sortItems(rawItems);
        currentItems = items;

        // The Open Mazes list trades the short description for the date the
        // maze opened, shown right next to the owner's name instead.
        const isOpenView = view === "open";

        grid.innerHTML = currentItems.map(n => roomRowHtml(n, isOpenView)).join("");

        grid.querySelectorAll(".chrome-list-row").forEach((row, i) => {
            row.addEventListener("click", () => openModal(currentItems[i]));
        });
        wireThumbFadeIn(grid);

        const messages = query.trim() ? emptyMessagesSearch : emptyMessagesNoSearch;
        emptyEl.textContent = messages[view];
        emptyEl.style.display = currentItems.length === 0 ? "block" : "none";
    }

    // Populates .featured-frame's own list — just a couple of random picks
    // from the featured pool (not the whole thing), reshuffled fresh every
    // time this view opens rather than sorted/stable, so it reads as a
    // rotating teaser rather than a real second browsing list — that's
    // .chrome-frame's job (nested right below, see home.html). Only
    // actually reshuffles the moment showFeatured flips true (see
    // updateChrome's own comment) rather than on every render while it
    // stays open, since nothing that would change this list's contents can
    // happen while it's open (any sub-nav/top-nav click closes it first).
    const FEATURED_FRAME_COUNT = 2;
    let featuredListItems = [];

    function renderFeaturedList() {
        if (!showFeatured || !dataLoaded) return;

        const pool = sourceItems("featured").map(item => normalize(item, false));
        // Fisher-Yates, trimmed to however many are needed — every maze in
        // the pool gets an equal shot rather than always favouring
        // whichever happened to sort first.
        const shuffled = pool.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        featuredListItems = shuffled.slice(0, FEATURED_FRAME_COUNT);

        featuredFrameList.innerHTML = featuredListItems.map(n => roomRowHtml(n, false)).join("");
        featuredFrameList.querySelectorAll(".chrome-list-row").forEach((row, i) => {
            row.addEventListener("click", () => openModal(featuredListItems[i]));
        });
        wireThumbFadeIn(featuredFrameList);

        featuredFrameEmpty.textContent = emptyMessagesNoSearch.featured;
        featuredFrameEmpty.style.display = featuredListItems.length === 0 ? "block" : "none";
    }

    // "Refresh recommendations" — same reshuffle as renderFeaturedList, just
    // triggered by its own button instead of the panel opening, and with a
    // clone-and-slide transition (same technique site.js's header-events
    // ticker uses) so the outgoing pair visibly continues down out of the
    // frame while the new pair slides down into the spot they vacate,
    // instead of the swap just cutting instantly.
    let featuredRefreshInFlight = false;

    function refreshFeaturedList() {
        if (!showFeatured || !dataLoaded || featuredRefreshInFlight) return;
        featuredRefreshInFlight = true;

        // Clipped to exactly the area .featured-frame-body was showing at
        // the moment of the click (fixed height, own overflow: hidden) —
        // anchored against .featured-frame itself (its own containing
        // block, see that rule's own comment) rather than left inside
        // .featured-frame-body, since the recompute below reads *that*
        // element's scrollHeight to size itself for the new pair, and a
        // still-present outgoing clone sitting inside it would inflate
        // that reading with the outgoing pair's own height for as long as
        // the clone takes to finish sliding away and get removed. Without
        // its own clip standing in for the one it lost by moving out,
        // though, the outgoing pair would slide unclipped through
        // .featured-frame's *whole* remaining height instead of stopping
        // right where .chrome-frame begins, sliding across its minimized
        // sliver on the way past instead of disappearing behind the edge
        // of where the picks used to end.
        const bodyRect = featuredFrameBody.getBoundingClientRect();
        const frameRect = featuredFrame.getBoundingClientRect();
        const outgoingClip = document.createElement("div");
        outgoingClip.className = "featured-frame-list-outgoing-clip";
        outgoingClip.style.top = (bodyRect.top - frameRect.top) + "px";
        outgoingClip.style.height = bodyRect.height + "px";
        featuredFrame.appendChild(outgoingClip);

        const outgoing = featuredFrameList.cloneNode(true);
        outgoing.removeAttribute("id");
        outgoing.classList.add("featured-frame-list-outgoing");
        outgoingClip.appendChild(outgoing);

        renderFeaturedList();

        // Starts the real (now new-content) list above the frame, no
        // transition yet, before the reflow below locks that in as the
        // starting point for the animation to it below.
        featuredFrameList.style.transition = "none";
        featuredFrameList.style.transform = "translateY(-100%)";

        void featuredFrameList.offsetWidth;

        outgoing.style.transition = "";
        featuredFrameList.style.transition = "";
        outgoing.style.transform = "translateY(100%)";
        featuredFrameList.style.transform = "translateY(0)";

        // .featured-frame-body's own height (and .chrome-frame's slide
        // offset below it) were sized for the *previous* pair's combined
        // height — force is needed here since active isn't changing, just
        // what it needs to fit; without it the "nothing changed" guard in
        // setFeaturedPanelState would skip re-measuring entirely.
        setFeaturedPanelState(true, true);

        outgoing.addEventListener("transitionend", () => {
            outgoingClip.remove();
            featuredRefreshInFlight = false;
        }, { once: true });
    }

    // #search-wrap's own natural (fully padded) height — cached rather than
    // re-measured on demand, since the only times it's safe to read (not
    // mid-collapse, padding genuinely at 14px) are exactly the moments
    // updateSearchWrap already touches it below. js/home.js's
    // setFeaturedPanelState needs this value too (to work out how much
    // space #search-wrap will free up once it finishes collapsing), but by
    // the time that runs #search-wrap's own collapse is already underway,
    // so it reads this cache instead of trying to measure a moving target.
    let searchWrapNaturalHeight = searchWrap.scrollHeight;

    window.addEventListener("resize", () => {
        // Only safe to trust while genuinely expanded — mid-collapse (or
        // fully collapsed) this would just measure the squashed size.
        if (searchWrap.style.maxHeight !== "0px") {
            searchWrapNaturalHeight = searchWrap.scrollHeight;
        }
    });

    // Bumped every call and captured by each pending requestAnimationFrame
    // callback below, which bails out if this has moved on by the time it
    // fires — own counter rather than one shared across other animated
    // pieces on this page (see setFeaturedPanelState's own), since this
    // function has no early-return guard of its own: every call is real
    // work, so every call needs to be able to invalidate the previous one's
    // still-pending callback. A shared counter that other functions bump
    // even on their own no-op calls would invalidate a legitimately still-
    // pending callback here that has nothing to do with them.
    let searchWrapGeneration = 0;

    // Slides up (and, thanks to .chrome-nav-sub's higher z-index, visually
    // behind it — see #search-wrap's own comment) rather than an instant
    // display:none/flex toggle, so entering/leaving the featured view reads
    // as one continuous motion instead of a hard cut.
    function updateSearchWrap() {
        const myGeneration = ++searchWrapGeneration;
        const wasCollapsed = searchWrap.style.maxHeight === "0px";
        if (showFeatured) {
            // Lock in the current expanded height as the transition's start
            // — max-height can't animate *from* "none".
            searchWrap.style.maxHeight = searchWrap.scrollHeight + "px";
            requestAnimationFrame(() => {
                if (myGeneration !== searchWrapGeneration) return;
                searchWrap.style.maxHeight = "0px";
                // Padding alone (a fixed 20px top / 12px bottom, unaffected
                // by max-height/border-box) would otherwise leave a 32px-tall
                // residual even at max-height: 0 — animated to 0 right
                // alongside it so the collapse actually reaches 0, which
                // js/home.js's setFeaturedPanelState relies on when working
                // out how much space this frees up for .featured-frame.
                searchWrap.style.paddingTop = "0px";
                searchWrap.style.paddingBottom = "0px";
                searchWrap.style.opacity = "0";
                searchWrap.style.transform = "translateY(-100%)";
            });
        } else if (wasCollapsed) {
            // Genuinely coming back from collapsed — animate the reveal.
            // Deliberately does NOT re-measure scrollHeight here to refresh
            // searchWrapNaturalHeight, unlike the two branches below — mid-
            // transition, with padding/max-height either still animating or
            // just having been reassigned in this same tick, a flex
            // container's own children can get laid out against a stale
            // intermediate size for one frame, reporting a squashed
            // scrollHeight even though nothing is actually wrong. The
            // cached value (set at load and refreshed on resize, both times
            // #search-wrap is genuinely settled) is trustworthy; a fresh
            // read here isn't.
            requestAnimationFrame(() => {
                if (myGeneration !== searchWrapGeneration) return;
                searchWrap.style.maxHeight = searchWrapNaturalHeight + "px";
                searchWrap.style.paddingTop = "20px";
                searchWrap.style.paddingBottom = "12px";
                searchWrap.style.opacity = "1";
                searchWrap.style.transform = "translateY(0)";
            });
        } else {
            // First render, or already showing — nothing to animate out of,
            // so just make sure it's fully visible with no transition
            // in flight (avoids an unwanted grow-in on page load). Safe to
            // trust a fresh measurement here — genuinely settled, not
            // mid-transition.
            searchWrap.style.maxHeight = "none";
            searchWrap.style.paddingTop = "20px";
            searchWrap.style.paddingBottom = "12px";
            searchWrapNaturalHeight = searchWrap.scrollHeight;
            searchWrap.style.opacity = "1";
            searchWrap.style.transform = "translateY(0)";
        }
    }

    // Couples .featured-frame-body's open/close to .chrome-frame's minimize
    // — entering the featured view slides .chrome-frame (now nested
    // *inside* .featured-frame, see home.html) straight down until only its
    // own top CHROME_FRAME_VISIBLE_SLIVER worth still shows above
    // .featured-frame's own clipped bottom edge (see .chrome-frame's own
    // comment in style.css), while .featured-frame-body opens to show its
    // own couple of random picks above it. .chrome-frame keeps its real,
    // full flex: 1 size the whole time — sliding is purely a transform, not
    // a resize — so it still automatically fills whatever
    // .featured-frame-body isn't using, the same way it always filled
    // #browse-window's own leftover space before .featured-frame existed;
    // the slide distance just has to be measured fresh each time since that
    // full size isn't a constant — see setFeaturedPanelState's own comment
    // for why that's worked out by arithmetic rather than just measured.
    const CHROME_FRAME_VISIBLE_SLIVER = 12;
    // Must match .featured-frame's own negative margin-top in style.css —
    // see the comment on featuredFrameTarget below for why this needs
    // adding back into that calculation.
    const FEATURED_FRAME_OVERLAP = 15;
    let chromeFrameMinimized = false;
    let featuredPanelReady = false;

    function setFeaturedPanelState(active, force) {
        // Arrow (and the strip itself, see .chrome-frame-minimize-toggle's
        // own opacity rule) only ever shows while minimized — restoring is
        // its only job now that minimizing itself happens by pressing
        // "FEATURED MAZES" instead (see that button's own click handler).
        chromeFrameMinimizeArrow.innerHTML = active ? "&#9650;" : "";
        chromeFrameMinimizeToggle.setAttribute("aria-label", active ? "Restore the results" : "Minimise the results");
        featuredFrame.classList.toggle("is-open", active);
        browseChromeFrame.classList.toggle("is-minimized", active);

        // force bypasses the "nothing changed" guard below — used by
        // refreshFeaturedList to re-run the sizing math after swapping in a
        // new pair of picks whose combined height may differ from the old
        // one's, even though active/chromeFrameMinimized haven't changed.
        if (active === chromeFrameMinimized && featuredPanelReady && !force) return;
        featuredPanelReady = true;
        chromeFrameMinimized = active;

        // .chrome-frame's slide distance (and .featured-frame-body's own
        // open target, capped below) are worked out by arithmetic instead
        // of measuring anything currently mid-transition — .chrome-frame's
        // own live flex: 1-computed size reflects whatever .featured-
        // frame-body's height happens to be *this frame* (still easing
        // towards its target, not there yet), not the final settled size,
        // and .featured-frame's own total height has the exact same
        // problem one level up: it's flex: 1 too, and #search-wrap
        // collapsing/revealing (kicked off by updateSearchWrap, called just
        // before this from the same updateChrome pass) is *also* still
        // mid-flight, so .featured-frame's live height reflects a stale
        // partial reading of that, not what it's about to settle at either.
        // Reading either one here would bake a mid-transition snapshot into
        // a fixed number and everything would visibly fall out of step for
        // the rest of the animation.
        //
        // Everything actually needed is stable instead: #search-wrap's own
        // top edge never moves regardless of its collapsed/expanded state
        // (ordinary block flow — a box's top is set by what precedes it,
        // not by its own height), and .featured-frame's own bottom edge is
        // just as fixed (#browse-window's own height is constant, and
        // .featured-frame is the only flex: 1 item below #search-wrap, so
        // it always grows/shrinks from its *top* to soak up whatever
        // #search-wrap isn't using — its bottom edge never has to move to
        // do that). Together those bracket the one true constant this
        // whole calculation rests on: the combined space #search-wrap and
        // .featured-frame have always divided between them. (browseWindow's
        // own bottom edge is deliberately NOT used for this — there's a
        // further fixed gap between .featured-frame's real bottom and
        // #browse-window's own, so anchoring on the window instead of
        // .featured-frame directly overshoots by exactly that gap.)
        // featuredFrame.bottom is .featured-frame's own outer (border-box)
        // edge, but .chrome-frame's real flex: 1 fill only ever reaches its
        // *inner* edge — .featured-frame's own border takes up the last bit
        // past that, subtracted separately below since it's specifically
        // .chrome-frame's own budget being one border thinner, not
        // .featured-frame's.
        //
        // .featured-frame's own -15px margin-top (see its CSS rule) makes it
        // overlap up underneath #search-wrap by that same amount, so this
        // span (#search-wrap's top to .featured-frame's bottom) is now 15px
        // *shorter* than the two elements' combined real height — that
        // overlap is permanent (not tied to active/inactive), so it's added
        // back in below regardless of which branch runs.
        const featuredFrameBorderBottom = parseFloat(getComputedStyle(featuredFrame).borderBottomWidth) || 0;
        const totalFlexSpace = featuredFrame.getBoundingClientRect().bottom - searchWrap.getBoundingClientRect().top;
        const featuredFrameTarget = totalFlexSpace - (active ? 0 : searchWrapNaturalHeight) + FEATURED_FRAME_OVERLAP;
        const spaceForBodyAndChrome = featuredFrameTarget - featuredMazesBtn.getBoundingClientRect().height - featuredFrameBorderBottom;

        // .featured-frame-body's own open/close — a single assignment
        // animates it correctly either direction, no lock-in-current-value
        // dance needed: closing, its previous value was always a real
        // number (never "none"), and opening, it was already sitting at a
        // real 0. Capped at leaving .chrome-frame at least its own visible
        // sliver's worth of room — the couple of featured picks in here are
        // random every time (see renderFeaturedList), and an unlucky pair
        // with long descriptions can otherwise want more height than
        // .featured-frame has to give, leaving .chrome-frame nothing (or
        // even a negative budget) to work with.
        const bodyTarget = active
            ? Math.min(featuredFrameBody.scrollHeight, Math.max(0, spaceForBodyAndChrome - CHROME_FRAME_VISIBLE_SLIVER))
            : 0;
        featuredFrameBody.style.maxHeight = bodyTarget + "px";

        const chromeFrameTarget = spaceForBodyAndChrome - bodyTarget;
        const offset = active ? Math.max(0, chromeFrameTarget - CHROME_FRAME_VISIBLE_SLIVER) : 0;
        browseChromeFrame.style.transform = `translateY(${offset}px)`;
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
        const newAlt = `${modalName.textContent} — ${label}`;
        const oldSrc = modalGalleryImg.getAttribute("src");

        // A room added without a screenshot yet (see admin.js's gallery
        // editor) has no image to show or slide to — swap straight to the
        // placeholder pill instead. Clearing modalGalleryImg's own src (not
        // just hiding it) means oldSrc reads as empty next time too, so
        // navigating away from a missing image never tries to slide *out*
        // of one either.
        if (g.image) {
            const newSrc = imgCdn(g.image, 900, null, 78);
            modalGalleryImg.style.display = "block";
            galleryMissingPill.style.display = "none";
            if (!skipSlide && oldSrc) {
                slideGalleryImage(oldSrc, modalGalleryImg.alt, newSrc, newAlt, direction);
            } else {
                modalGalleryImg.style.transition = "none";
                modalGalleryImg.style.transform = "translateX(0)";
                modalGalleryImg.src = newSrc;
                modalGalleryImg.alt = newAlt;
            }
        } else {
            modalGalleryImg.style.transition = "none";
            modalGalleryImg.style.transform = "translateX(0)";
            modalGalleryImg.removeAttribute("src");
            modalGalleryImg.alt = "";
            modalGalleryImg.style.display = "none";
            galleryMissingPill.style.display = "block";
        }
        galleryCounter.textContent = label;
        galleryPosition.textContent = position;
        galleryPosition.style.display = position ? "inline-flex" : "none";
        galleryBonusTab.style.display = (g.kind === "room" && g.bonus) ? "inline-flex" : "none";

        // Old-version images belong to whichever room is on screen, not the
        // maze as a whole — re-derived every time the active image changes.
        // If the panel was open for the room we're navigating away from, it
        // closes rather than keep showing older versions of a room that's
        // no longer visible above it.
        oldVersionsGallery = (g.oldVersions || []).filter(v => v && v.image);
        if (oldVersionsOpen) resetOldVersionsInstant();
        oldVersionsPill.style.display = oldVersionsGallery.length ? "inline-flex" : "none";
        oldVersionsPill.textContent = `See older version${oldVersionsGallery.length > 1 ? "s" : ""}`;

        galleryStrip.querySelectorAll("img, .gallery-strip-missing").forEach((thumb, i) => {
            thumb.classList.toggle("active", i === activeIndex);
        });
        const activeThumb = galleryStrip.children[activeIndex];
        if (activeThumb) activeThumb.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });

        if (lightboxOverlay.classList.contains("open")) {
            // Nothing to zoom into for a room with no image — close rather
            // than show the lightbox's own broken/blank image.
            if (!g.image) closeLightbox();
            else {
                lightboxImg.src = modalGalleryImg.src;
                lightboxImg.alt = modalGalleryImg.alt;
                lightboxCounter.textContent = position ? `${label} — ${position}` : label;
            }
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

    function showOldVersionImage(index) {
        if (!oldVersionsGallery || !oldVersionsGallery.length) return;
        oldVersionsIndex = (index + oldVersionsGallery.length) % oldVersionsGallery.length;
        const v = oldVersionsGallery[oldVersionsIndex];
        oldVersionsImg.src = imgCdn(v.image, 900, null, 78);
        oldVersionsImg.alt = v.label ? `${modalName.textContent} — ${v.label}` : modalName.textContent;
        const position = oldVersionsGallery.length > 1 ? `${oldVersionsIndex + 1} of ${oldVersionsGallery.length}` : "";
        oldVersionsCounter.textContent = v.label && position ? `${position} — ${v.label}` : (v.label || position);
        oldVersionsStrip.querySelectorAll("img").forEach((thumb, i) => {
            thumb.classList.toggle("active", i === oldVersionsIndex);
        });
        const activeThumb = oldVersionsStrip.children[oldVersionsIndex];
        if (activeThumb) activeThumb.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }

    // Same thumbnail-strip treatment as the room-by-room gallery (see
    // openModal's galleryStrip.innerHTML build) — built fresh each time
    // older versions are opened, since which room (and which images) is
    // showing can change between opens.
    function renderOldVersionsStrip() {
        oldVersionsStrip.innerHTML = oldVersionsGallery.map((v, i) =>
            `<img src="${imgCdn(v.image, 110, 110, 55)}" loading="lazy" alt="${v.label || "Older version"}" data-index="${i}">`
        ).join("");
        oldVersionsStrip.querySelectorAll("img").forEach(thumb => {
            thumb.addEventListener("click", () => showOldVersionImage(Number(thumb.dataset.index)));
        });
    }

    const OLD_VERSIONS_TRANSITION = "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)";

    // Slides .modal-primary-view up and out of .modal-viewport while
    // .modal-oldversions-view slides up into its place — a reel-style swap,
    // not a reveal — after first freezing .modal-viewport to its current
    // pixel height so the modal card itself never changes size (unlike the
    // room-by-room gallery, older versions' own content is usually shorter
    // than the description/tags/etc. it's covering, so left to flow
    // naturally the card would visibly shrink for the duration).
    function openOldVersions() {
        if (!oldVersionsGallery || !oldVersionsGallery.length || oldVersionsOpen) return;
        oldVersionsOpen = true;
        stopAutoAdvance();

        renderOldVersionsStrip();
        showOldVersionImage(0);

        modalViewport.style.height = `${modalViewport.getBoundingClientRect().height}px`;

        modalPrimaryView.style.transition = "none";
        modalPrimaryView.style.position = "absolute";
        modalPrimaryView.style.top = "0";
        modalPrimaryView.style.left = "0";
        modalPrimaryView.style.width = "100%";
        modalPrimaryView.style.transform = "translateY(0)";

        modalOldVersionsView.style.transition = "none";
        modalOldVersionsView.style.display = "flex";
        modalOldVersionsView.style.transform = "translateY(100%)";

        // Commits the "start" transforms above before the transition to
        // their end state is requested below — same reflow trick as
        // slideGalleryImage/header-events, otherwise both writes get
        // coalesced into one paint and neither view appears to move.
        void modalViewport.offsetHeight;

        modalPrimaryView.style.transition = OLD_VERSIONS_TRANSITION;
        modalOldVersionsView.style.transition = OLD_VERSIONS_TRANSITION;
        modalPrimaryView.style.transform = "translateY(-100%)";
        modalOldVersionsView.style.transform = "translateY(0)";

        modalPrimaryView.addEventListener("transitionend", () => {
            if (oldVersionsOpen) modalPrimaryView.style.display = "none";
        }, { once: true });
    }

    function closeOldVersions() {
        if (!oldVersionsOpen) return;
        oldVersionsOpen = false;

        modalPrimaryView.style.display = "block";
        modalPrimaryView.style.transition = "none";
        modalPrimaryView.style.transform = "translateY(-100%)";

        void modalViewport.offsetHeight;

        modalPrimaryView.style.transition = OLD_VERSIONS_TRANSITION;
        modalOldVersionsView.style.transition = OLD_VERSIONS_TRANSITION;
        modalPrimaryView.style.transform = "translateY(0)";
        modalOldVersionsView.style.transform = "translateY(100%)";

        modalOldVersionsView.addEventListener("transitionend", () => {
            if (oldVersionsOpen) return; // reopened again before this fired
            modalOldVersionsView.style.display = "none";
            modalOldVersionsView.style.transform = "";
            modalPrimaryView.style.position = "";
            modalPrimaryView.style.top = "";
            modalPrimaryView.style.left = "";
            modalPrimaryView.style.width = "";
            modalPrimaryView.style.transform = "";
            modalPrimaryView.style.transition = "";
            modalViewport.style.height = "";
            if (modalOverlay.classList.contains("open") && !modalOverlay.classList.contains("closing")) {
                restartAutoAdvance();
            }
        }, { once: true });
    }

    // Snaps both views back to their closed-state styling instantly, no
    // transition — used when the room shown behind older versions changes
    // out from under it (navigating the main carousel, or opening a
    // different maze entirely) rather than the user explicitly backing out.
    function resetOldVersionsInstant() {
        oldVersionsOpen = false;
        modalOldVersionsView.style.transition = "none";
        modalOldVersionsView.style.display = "none";
        modalOldVersionsView.style.transform = "";
        modalPrimaryView.style.transition = "none";
        modalPrimaryView.style.display = "block";
        modalPrimaryView.style.position = "";
        modalPrimaryView.style.top = "";
        modalPrimaryView.style.left = "";
        modalPrimaryView.style.width = "";
        modalPrimaryView.style.transform = "";
        modalViewport.style.height = "";
    }

    function toggleOldVersions() {
        if (oldVersionsOpen) closeOldVersions();
        else openOldVersions();
    }

    function openModal(n) {
        // Invalidates any in-flight closeModal() from a rapid re-open (its
        // animationend/fallback would otherwise fire later and rip the
        // "open"/"closing" classes off this new instance mid-view).
        modalCloseToken++;
        modalOverlay.classList.remove("closing");

        modalName.textContent = n.name;
        modalCreator.textContent = n.subtitle;
        // Featured rows are always maze rooms regardless of which top-nav
        // category is active underneath (see sourceItems' "featured"
        // branch) — same condition render() uses to decide isEvents for
        // normalize(), so a featured row opened while Events is the active
        // category doesn't get formatted as if it were one.
        // Derived from the item's own shape rather than the current
        // topView/showFeatured globals — n can come from either the main
        // grid (topView-dependent) or .featured-frame's own list (always
        // normalize(item, false) regardless of topView), so only n itself
        // reliably says which kind it is.
        const isEventItem = n.dateFieldLabel === "Date";
        const dateDisplay = isEventItem ? formatEventDuration(n.dateValue, n.endDateValue) : formatMazeDate(n.dateValue);
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
            ? { image: n.entrance.image, label: n.entrance.label || "Entrance", kind: "entrance", oldVersions: n.entrance.oldVersions || [] }
            : null;
        const finishItem = n.finish && n.finish.image
            ? { image: n.finish.image, label: n.finish.label || "Finish", kind: "finish", oldVersions: n.finish.oldVersions || [] }
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
            galleryPrev.style.display = "flex";
            galleryNext.style.display = "flex";
            galleryCounter.style.display = "inline-flex";
            galleryStrip.style.display = "flex";
            // A room added without a screenshot yet gets a small "?"
            // placeholder here instead of a broken <img> — see
            // .gallery-strip-missing and showGalleryImage's own handling of
            // the same case for the large image.
            galleryStrip.innerHTML = activeGallery.map((g, i) => g.image
                ? `<img src="${imgCdn(g.image, 110, 110, 55)}" loading="lazy" alt="${displayLabel(g)}" data-index="${i}">`
                : `<div class="gallery-strip-missing" data-index="${i}" title="${displayLabel(g)}">?</div>`
            ).join("");
            galleryStrip.querySelectorAll("img, .gallery-strip-missing").forEach(thumb => {
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
            galleryMissingPill.style.display = "none";
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
            oldVersionsPill.style.display = "none";
        }

        // Old-version images belong to whichever room is currently showing
        // in the gallery above (not the maze as a whole) — the pill/view
        // are (re)populated per image in showGalleryImage, reset here so
        // reopening the modal never starts mid-way through a previous view.
        resetOldVersionsInstant();

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

        // Drop a #event-... hash left over from opening this modal (via the
        // header widget or a shared link) so a refresh after closing doesn't
        // reopen it — replaceState instead of clearing location.hash so it
        // doesn't add a back-button entry or re-fire hashchange.
        if (/^#event-/.test(location.hash)) {
            history.replaceState(null, "", location.pathname + location.search);
        }

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

    // Switches straight to that category, keeping whichever sub-filter was
    // last picked for it (defaulting to the first one) — clicking the
    // already-active button is a no-op rather than toggling back to a
    // featured state, now that #featured-mazes-btn is the only way there.
    topNavBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            topView = btn.dataset.top;
            showFeatured = false;
            searchInput.value = "";
            query = "";
            render();
        });
    });

    // Sub-row buttons just change the filter within whichever top category
    // is active — no toggle-off, one of the 3 is always selected. Also
    // drops back out of the featured view, same as switching top category.
    subNavBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const value = btn.dataset.subValue;
            if (!value) return;
            if (topView === "mazes") mazesSub = value;
            else if (topView === "events") eventsSub = value;
            showFeatured = false;
            searchInput.value = "";
            query = "";
            render();
        });
    });

    // The one way into the featured view — stays active until a sub-nav
    // filter or a top-nav category click above drops back to normal
    // browsing (see their own handlers).
    // A real toggle now — clicking while already active just flips
    // showFeatured back off, which on its own already returns to whichever
    // mazesSub/eventsSub was last selected (neither one gets touched while
    // showFeatured is on) and restores the search row via updateSearchWrap.
    featuredMazesBtn.addEventListener("click", () => {
        showFeatured = !showFeatured;
        searchInput.value = "";
        query = "";
        render();
    });

    // Sits on top of #featured-mazes-btn's own header strip (see its CSS)
    // rather than inside it, so this click is its own event, not a bubble
    // off the button underneath — no stopPropagation needed.
    featuredRefreshBtn.addEventListener("click", refreshFeaturedList);

    // Restore-only now (see .chrome-frame-minimize-toggle's own opacity
    // rule in style.css — it's invisible and inert whenever not minimized,
    // so this only ever fires from the minimized state) — same exit as
    // pressing "FEATURED MAZES" again.
    chromeFrameMinimizeToggle.addEventListener("click", () => {
        showFeatured = false;
        searchInput.value = "";
        query = "";
        render();
    });

    modalClose.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", e => {
        if (e.target === modalOverlay) closeModal();
    });
    oldVersionsPill.addEventListener("click", toggleOldVersions);
    oldVersionsBackPill.addEventListener("click", toggleOldVersions);
    oldVersionsPrev.addEventListener("click", () => showOldVersionImage(oldVersionsIndex - 1));
    oldVersionsNext.addEventListener("click", () => showOldVersionImage(oldVersionsIndex + 1));
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

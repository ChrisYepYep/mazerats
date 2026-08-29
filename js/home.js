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
    // Events have no difficulty field (see normalize()) — hidden while
    // viewing Events, see updateChrome().
    const difficultySortOptions = sortSelect.querySelectorAll('option[value^="difficulty"]');
    const emptyEl = document.getElementById("featured-empty");
    const topNavBtns = document.querySelectorAll("#top-nav .chrome-nav-btn");
    const subNavEl = document.getElementById("sub-nav");
    const subNavBtns = document.querySelectorAll("#sub-nav .chrome-nav-btn");
    const eventsArchiveNote = document.getElementById("events-archive-note");
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
    const modalThumbFrame = document.getElementById("modal-thumb-frame");
    const galleryViewport = document.getElementById("gallery-viewport");
    const modalGalleryImg = document.getElementById("modal-gallery-img");
    const galleryMissingPill = document.getElementById("gallery-missing-pill");
    const galleryPrev = document.getElementById("gallery-prev");
    const galleryNext = document.getElementById("gallery-next");
    const galleryCounter = document.getElementById("gallery-counter");
    const galleryPosition = document.getElementById("gallery-position");
    const galleryBonusTab = document.getElementById("gallery-bonus-tab");
    const galleryStrip = document.getElementById("gallery-strip");
    const photoFrameTemplate = document.getElementById("photo-frame-template");
    const furniStrip = document.getElementById("furni-strip");
    const furniCardTemplate = document.getElementById("furni-card-template");
    const modalName = document.getElementById("modal-name");
    const modalCreator = document.getElementById("modal-creator");
    const modalBuilder = document.getElementById("modal-builder");
    const modalMeta = document.getElementById("modal-meta-items");
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
    // Whether the visitor has picked an Events sub-tab themselves. Until they
    // have, the landing tab is chosen for them — see resolvedEventsSub().
    let eventsSubTouched = false;
    let sortBy = "name"; // "date" | "name" | "owner" | "difficulty"
    let query = "";
    // Independent of topView/mazesSub/eventsSub — layers a featured pick
    // over whichever category is active rather than replacing it, so
    // dropping back out (via a sub-nav filter or a top-nav click) returns
    // to exactly where browsing left off.
    let showFeatured = false;
    let activeGallery = null;
    // Furni per room image for whatever is open, keyed by image path.
    let activeFurni = null;
    let activeIndex = 0;
    let autoAdvanceTimer = null;
    let slideOutgoingEl = null;
    let slideRequestSeq = 0;
    let modalCloseToken = 0;
    // Whatever had focus right before openModal() ran (a row, or the
    // header's event-ticker link) — restored once the modal finishes
    // closing, so a keyboard user lands back where they were instead of
    // focus silently resetting to the top of the page.
    let modalTriggerEl = null;
    let oldVersionsGallery = null;
    let oldVersionsIndex = 0;
    let oldVersionsOpen = false;
    let ROOMS = [];
    let EVENTS = [];
    let dataLoaded = false;
    let currentItems = [];

    // An event's status comes from its own start/end dates — see
    // js/event-status.js, which the header ticker and the admin form read
    // from too so all three can't drift apart.
    const eventStatus = EventStatus.derive;
    const isUpcomingTabEvent = EventStatus.isUpcomingish;

    // Written from the shared module rather than left hardcoded in
    // home.html, so the note can never claim a cutoff the code doesn't
    // apply — it follows ARCHIVE_YEARS from 1 to 2 on its own.
    if (eventsArchiveNote) {
        eventsArchiveNote.textContent = EventStatus.noticeText();
    }

    // "Upcoming" is the natural landing tab for Events, but it's a dead end
    // when nothing is scheduled — fall back to Past so the tab opens on
    // something with content in it. Only applies until the visitor picks a
    // sub-tab themselves, and never before the data has loaded, so the row
    // can't briefly show Past and then jump to Upcoming as events arrive.
    function resolvedEventsSub() {
        if (eventsSubTouched || !dataLoaded) return eventsSub;
        return EVENTS.some(isUpcomingTabEvent) ? eventsSub : "past";
    }

    function effectiveView() {
        return topView === "mazes" ? mazesSub : resolvedEventsSub();
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
        // A live event belongs in Upcoming, not stranded in Past — it's
        // still happening, and this is the tab someone checks to find
        // something to go to. sortItems pins them to the top of it.
        if (view === "upcoming") return EVENTS.filter(isUpcomingTabEvent);
        if (view === "past") return EVENTS.filter(e => eventStatus(e) === "past");
        return EVENTS.filter(e => eventStatus(e) === "archive");
    }

    // Normalizes a room or event into one shared shape so rendering and the
    // modal don't need to branch on what kind of thing they're showing.
    function normalize(item, isEvents) {
        if (isEvents) {
            return {
                isEvent: true,
                name: item.title || "",
                subtitle: item.host ? `by ${item.host}` : "",
                statusKey: eventStatus(item),
                statusLabel: EventStatus.labelFor(item),
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
                // Extra images attached to this maze/event in the admin panel, shown
                // in the floating photo frame off the gallery viewport's photo-wall
                // icons. Normalized here so a missing field is just an empty list.
                relatedImages: (item.relatedImages || []).filter(r => r && r.image),
                // Furni detected in this maze/event's room images by the admin
                // scan, keyed by gallery image — see renderFurniStrip.
                furni: item.furni || {},
                sortKey: item.date || ""
            };
        }
        return {
            isEvent: false,
            name: item.name || "",
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
            // Extra images attached to this maze/event in the admin panel, shown
            // in the floating photo frame off the gallery viewport's photo-wall
            // icons. Normalized here so a missing field is just an empty list.
            relatedImages: (item.relatedImages || []).filter(r => r && r.image),
            // Furni detected in this maze/event's room images by the admin
            // scan, keyed by gallery image — see renderFurniStrip.
            furni: item.furni || {},
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
            sorted.sort((a, b) => compareNames(a.name, b.name));
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
        // An event happening right now is the one thing someone opening the
        // Events tab needs to see first, so LIVE is lifted to the top of
        // whichever sort is active rather than being subject to it. Array
        // sort is stable, so this only moves the live entries — everything
        // else keeps the order the sort above just gave it.
        sorted.sort((a, b) => (b.statusKey === "live" ? 1 : 0) - (a.statusKey === "live" ? 1 : 0));
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
        const activeSub = showFeatured ? null : (topView === "mazes" ? mazesSub : resolvedEventsSub());
        subNavBtns.forEach((btn, i) => {
            const [value, label] = options[i];
            const icon = SUB_NAV_ICONS[value];
            // Icon is absolutely positioned (see its own CSS) rather than
            // laid out inline before the label, specifically so it doesn't
            // shift the label off the button's own centre — it just floats
            // in the gap between the label and the button's left edge.
            // Label itself is wrapped in its own span (not left as a bare
            // text node) so it can be raised above the active tab's merge-
            // bridge the same way the icon is — plain inline text paints
            // below any z-index'd descendant in the same stacking context
            // regardless of DOM order, so the bridge's ::after (z-index: 2)
            // would otherwise always win against it.
            const iconHtml = icon ? `<img class="chrome-nav-sub-icon" src="assets/img/${icon}" alt="" aria-hidden="true">` : "";
            btn.innerHTML = `${iconHtml}<span class="chrome-nav-sub-label">${label}</span>`;
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

        // Sorting by difficulty was a silent no-op the whole time while
        // browsing Events (nothing about it visibly changed, with no
        // indication why) — hidden in that view instead, and reset back to
        // the default sort if it was already selected when switching into
        // it, so a stale hidden option is never left sitting selected.
        const isEvents = topView === "events";
        // Explains the auto-archiving rule (see eventStatus) at the point it
        // actually matters — sitting in the Archive listing itself, rather
        // than as a note somewhere the visitor has to go looking for.
        if (eventsArchiveNote) {
            eventsArchiveNote.hidden = !(isEvents && !showFeatured && resolvedEventsSub() === "archive");
        }
        difficultySortOptions.forEach(opt => { opt.hidden = isEvents; });
        if (isEvents && sortBy.startsWith("difficulty")) {
            sortBy = "name";
            sortSelect.value = "name";
        }
    }

    // Shared by the main grid and the featured-frame's own list (see
    // renderFeaturedList) — same row markup either place, just a different
    // container around it.
    // Rows are plain <div>s (see roomRowHtml's own tabindex/role="button"),
    // not real <button>s — using real buttons here would mean unpicking a
    // lot of existing .chrome-list-row/.row-* CSS built assuming a div, so
    // instead this wires the same click + Enter/Space activation any
    // interactive element needs by hand. Shared by both the main grid and
    // .featured-frame's own list (see renderFeaturedList) since they render
    // the exact same row markup.
    function wireRowActivation(container, items) {
        container.querySelectorAll(".chrome-list-row").forEach((row, i) => {
            row.addEventListener("click", () => openModal(items[i]));
            row.addEventListener("keydown", e => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault(); // stops Space from also scrolling the page
                openModal(items[i]);
            });
        });
    }

    function roomRowHtml(n, isOpenView) {
        return `
            <div class="chrome-list-row featured" data-difficulty="${n.difficulty || ""}" tabindex="0" role="button" aria-label="View ${escapeHtml(n.name || "maze")}">
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

        wireRowActivation(grid, currentItems);
        wireThumbFadeIn(grid);

        const messages = query.trim() ? emptyMessagesSearch : emptyMessagesNoSearch;
        emptyEl.textContent = messages[view];
        emptyEl.style.display = currentItems.length === 0 ? "block" : "none";
    }

    // Populates .featured-frame's own list — one maze per difficulty, two
    // difficulties, reshuffled each time this view opens rather than
    // sorted/stable across visits, so it reads as a rotating teaser rather
    // than a real second browsing list (that's .chrome-frame's job, nested
    // right below — see home.html). Only actually reshuffles the moment
    // showFeatured flips true (see updateChrome's own comment) rather than
    // on every render while it stays open, since nothing that would change
    // this list's contents can happen while it's open (any sub-nav/top-nav
    // click closes it first).
    const FEATURED_FRAME_COUNT = 2;
    let featuredListItems = [];

    // Fisher-Yates — every entry gets an equal shot rather than always
    // favouring whichever happened to sort first.
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Position in DIFFICULTY_ORDER, with anything unrated sorted to the end
    // rather than the front (indexOf would hand back -1 for it).
    function difficultyRank(difficulty) {
        const i = DIFFICULTY_ORDER.indexOf(difficulty || "");
        return i === -1 ? DIFFICULTY_ORDER.length : i;
    }

    // One maze per difficulty rating, so the two picks are always two
    // different colours rather than, say, two Hard mazes in a row — the
    // row tint is the whole point of this list. Difficulties are drawn at
    // random but the result is returned easiest-first, so the list always
    // reads as a ramp regardless of which two came up.
    function pickFeatured(pool) {
        const byDifficulty = new Map();
        pool.forEach(n => {
            const key = n.difficulty || "";
            if (!byDifficulty.has(key)) byDifficulty.set(key, []);
            byDifficulty.get(key).push(n);
        });

        // Rated difficulties are drawn from first; an unrated maze only gets
        // pulled in when there are fewer than two real ratings to fill the
        // list with, since it has no colour of its own to contribute.
        const rated = shuffle(DIFFICULTY_ORDER.filter(d => byDifficulty.has(d)));
        const unrated = byDifficulty.has("") ? [""] : [];

        return rated.concat(unrated)
            .slice(0, FEATURED_FRAME_COUNT)
            .map(key => {
                const group = byDifficulty.get(key);
                return group[Math.floor(Math.random() * group.length)];
            })
            .sort((a, b) => difficultyRank(a.difficulty) - difficultyRank(b.difficulty));
    }

    function renderFeaturedList() {
        if (!showFeatured || !dataLoaded) return;

        const pool = sourceItems("featured").map(item => normalize(item, false));
        featuredListItems = pickFeatured(pool);

        featuredFrameList.innerHTML = featuredListItems.map(n => roomRowHtml(n, false)).join("");
        wireRowActivation(featuredFrameList, featuredListItems);
        wireThumbFadeIn(featuredFrameList);

        featuredFrameEmpty.textContent = emptyMessagesNoSearch.featured;
        featuredFrameEmpty.style.display = featuredListItems.length === 0 ? "block" : "none";
    }

    // "Refresh recommendations" — same reshuffle as renderFeaturedList, just
    // triggered by its own button instead of the panel opening, and with a
    // clone-and-slide transition (same technique site.js's header-events
    // ticker uses) so the outgoing set visibly continues down out of the
    // frame while the new set slides down into the spot they vacate,
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
        // that reading with the outgoing set's own height for as long as
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
        // offset below it) were sized for the *previous* set's combined
        // height — force is needed here since active isn't changing, just
        // what it needs to fit; without it the "nothing changed" guard in
        // setFeaturedPanelState would skip re-measuring entirely.
        setFeaturedPanelState(true, true);

        const finish = () => {
            outgoingClip.remove();
            featuredRefreshInFlight = false;
        };
        outgoing.addEventListener("transitionend", finish, { once: true });
        // Fallback in case transitionend never fires (e.g. the tab was
        // backgrounded mid-transition and the browser skipped the frame,
        // same reasoning as closeModal's own fallback below) — without
        // this, featuredRefreshInFlight could get stuck true forever,
        // silently disabling every future click on this button for the
        // rest of the session. .featured-frame-list-outgoing's own
        // transition is 0.5s (see css/style.css); comfortably clear of that.
        setTimeout(finish, 600);
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
        // random every time (see renderFeaturedList), and an unlucky set
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

    // Every slide shows whatever the admin actually named that image in its
    // own label field — the entrance and finish bookends included, so a maze
    // can title its own way in and out ("Front Door", "The Vault") instead
    // of every maze reading the same two words. Blank fields still fall back
    // to "Entrance"/"Finish", applied where entranceItem/finishItem are
    // built rather than here. Left as a function rather than inlined at its
    // three call sites (the pill, and the strip's alt/title) so label policy
    // still has one place to live.
    function displayLabel(g) {
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
        // Furni is recorded against the individual room image, so the strip
        // changes with the picture rather than listing the whole maze at once.
        renderFurniStrip(activeFurni && g.image ? activeFurni[g.image] : null);
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

    // ---------- Related Images ----------

    // How many photo icons show before the rest fold away behind a "+",
    // how long one icon's pop takes, and how far apart they're staggered.
    const PHOTO_ICON_VISIBLE = 5;
    const PHOTO_ICON_POP_MS = 260;
    const PHOTO_ICON_POP_STEP_MS = 55;

    // Opening and closing the folded tail is driven from here rather than a
    // :hover rule, because closing has to animate: display can't be
    // transitioned, so the icons have to stay laid out until their exit
    // animation has played out. .is-closing keeps them in the row for
    // exactly that long, then hands back to the default display:none.
    function expandPhotoStrip(strip) {
        if (!strip || !strip.classList.contains("has-overflow")) return;
        clearTimeout(strip._collapseTimer);
        strip.classList.remove("is-closing");
        strip.classList.add("is-open");
    }

    function collapsePhotoStrip(strip) {
        if (!strip || !strip.classList.contains("has-overflow")) return;
        // Held open for as long as a photo frame is up: the icons are how
        // you reach the other pictures, and folding them away the moment
        // the pointer moved across to the frame would be perverse.
        if (openPhotoFrames.length) return;
        if (!strip.classList.contains("is-open")) return;
        strip.classList.remove("is-open");
        strip.classList.add("is-closing");
        clearTimeout(strip._collapseTimer);
        strip._collapseTimer = setTimeout(() => {
            strip.classList.remove("is-closing");
        }, Number(strip.dataset.popOutMs) || PHOTO_ICON_POP_MS);
    }

    // Called whenever a frame opens or the last one closes.
    function syncPhotoStripToFrames() {
        const strip = modalMeta.querySelector(".gallery-photos");
        if (!strip) return;
        if (openPhotoFrames.length) expandPhotoStrip(strip);
        else if (!strip.matches(":hover")) collapsePhotoStrip(strip);
    }

    // One photo-wall icon per related image, sitting at the right-hand end
    // of the modal's meta row. The strip is rebuilt per modal open and left
    // out entirely when a maze/event has no related images, so nothing is
    // left hanging off the end of that row for one that has none.
    function renderRelatedImages(n) {
        const existing = modalMeta.querySelector(".gallery-photos");
        if (existing) existing.remove();

        const related = n.relatedImages || [];
        if (!related.length) return;

        const strip = document.createElement("div");
        strip.className = "gallery-photos";
        // Past this many, the tail is folded away behind a "+" until the
        // strip is hovered — a maze with a dozen related images would
        // otherwise run its icons across the whole meta row.
        const overflows = related.length > PHOTO_ICON_VISIBLE;
        if (overflows) strip.classList.add("has-overflow");

        related.forEach((entry, i) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "gallery-photo-btn";
            // The row runs right to left (see .gallery-photos), so later
            // entries sit further left — and the left one overlaps the right
            // one, which means the z-index has to climb with the index.
            btn.style.zIndex = String(i + 1);
            const label = entry.name || "Related image";
            btn.setAttribute("aria-label", `View related image: ${label}`);
            btn.title = label;
            btn.addEventListener("click", () => openPhotoFrame(entry));

            if (overflows && i >= PHOTO_ICON_VISIBLE) {
                btn.classList.add("is-overflow");
                // The folded icons all sit to the left of the visible five,
                // and the first of them is the rightmost of that group — so
                // stepping the delay up the list runs the reveal right to
                // left, starting alongside the icons already showing. The
                // fold-back runs the stagger the other way, leaving them
                // left to right.
                btn.style.setProperty("--pop-in-delay", `${(i - PHOTO_ICON_VISIBLE) * PHOTO_ICON_POP_STEP_MS}ms`);
                btn.style.setProperty("--pop-out-delay", `${(related.length - 1 - i) * PHOTO_ICON_POP_STEP_MS}ms`);
            }
            strip.appendChild(btn);
        });

        if (overflows) {
            // Sits where the sixth icon would be. Hovering the strip is what
            // normally opens it; this is here for the tap that has no hover
            // to give, and to say plainly that there are more.
            const more = document.createElement("button");
            more.type = "button";
            more.className = "gallery-photo-more";
            // One above the last visible icon, so it overlaps it the same
            // way every icon overlaps its right-hand neighbour. It only
            // exists while the folded icons are hidden, so it can't collide
            // with theirs.
            more.style.zIndex = String(PHOTO_ICON_VISIBLE + 1);
            const hiddenCount = related.length - PHOTO_ICON_VISIBLE;
            // The count says how many are still folded away, so the row
            // states what it is holding back rather than only hinting.
            more.textContent = `+${hiddenCount}`;
            more.title = `${hiddenCount} more related image${hiddenCount === 1 ? "" : "s"}`;
            more.setAttribute("aria-label", more.title);
            more.addEventListener("click", () => expandPhotoStrip(strip));
            strip.appendChild(more);

            // How long the whole fold-back takes: one icon's animation plus
            // the last one's stagger. Read back by collapsePhotoStrip.
            const lastDelay = (related.length - 1 - PHOTO_ICON_VISIBLE) * PHOTO_ICON_POP_STEP_MS;
            strip.dataset.popOutMs = String(PHOTO_ICON_POP_MS + lastDelay);

            strip.addEventListener("mouseenter", () => expandPhotoStrip(strip));
            strip.addEventListener("mouseleave", () => collapsePhotoStrip(strip));
            // Opens on Tab too, and folds away once focus leaves entirely
            // (relatedTarget is where focus went — null when it left the page).
            strip.addEventListener("focusin", () => expandPhotoStrip(strip));
            strip.addEventListener("focusout", e => {
                if (!strip.contains(e.relatedTarget)) collapsePhotoStrip(strip);
            });
        }

        // Appended to the meta row, which openModal fills in above this —
        // rebuilding that row wipes anything already inside it, so this has
        // to run after, not before.
        modalMeta.appendChild(strip);
    }

    // Every open frame, in the order they were opened. Each photo-wall icon
    // opens its own, so a visitor can put two pictures side by side and
    // compare them rather than one replacing the other in a single window.
    const openPhotoFrames = [];
    // Cascade counter, so a second frame doesn't land exactly on top of the
    // first and look like nothing happened.
    let photoFrameSeq = 0;
    // Raised past the base z-index each time a frame is touched, so whatever
    // was clicked last comes to the front of the pile.
    let photoFrameTopZ = 300;

    const PHOTO_FRAME_W = 175;
    const PHOTO_FRAME_H = 194;

    // Measured off the rendered box rather than offsetWidth/offsetHeight:
    // those report the frame's unscaled 175x194 even while it's being shown
    // at 2x (see .is-2x), which would let a zoomed frame sit half off the
    // screen. Needs the frame to already be in the document to measure.
    function clampFrame(frame, left, top) {
        const rect = frame.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        frame.style.left = `${Math.min(maxLeft, Math.max(0, left))}px`;
        frame.style.top = `${Math.min(maxTop, Math.max(0, top))}px`;
    }

    function bringPhotoFrameToFront(frame) {
        frame.style.zIndex = ++photoFrameTopZ;
    }

    // The photo frame and the furni card are both fixed-position, draggable,
    // X-closable boxes, so they share the positioning and the drag outright
    // rather than each carrying its own copy. Named for what they do here so
    // the furni-card code doesn't read as if it were operating on a frame.
    const clampToViewport = clampFrame;
    const startCardDrag = startFrameDrag;

    function closePhotoFrame(frame) {
        const i = openPhotoFrames.indexOf(frame);
        if (i !== -1) openPhotoFrames.splice(i, 1);
        frame.remove();
        syncPhotoStripToFrames();
    }

    function closeAllPhotoFrames() {
        openPhotoFrames.slice().forEach(closePhotoFrame);
    }

    // ---------- furni found in a room ----------

    // Furni detected in the room image showing above (see the admin scan).
    // One icon per item; the strip is rebuilt on every gallery change, since
    // each room image has its own furni.
    function renderFurniStrip(record) {
        furniStrip.innerHTML = "";
        // The scan stores a record per room image — { scannedAt,
        // roomColours, items } — not a bare list, so a room that found
        // nothing can still say whether it was scanned and skipped or
        // simply had no furni in it. A plain array is accepted too, for
        // anything added by hand.
        const list = Array.isArray(record) ? record : (record && record.items) || [];
        // Hidden ones stay in the record — the admin can put them back, and
        // a rescan would only find a false positive again — but never reach
        // the site.
        const furni = list.filter(f => f && !f.hidden && (f.sprite || f.icon));
        furniStrip.hidden = !furni.length;
        if (!furni.length) return;

        // Icons live in their own scroller so a room holding thirty furni
        // scrolls instead of running the row across the whole modal. The
        // wrapper around it is what the "Furni Info" pill is positioned
        // against — inside the scroller it would slide away with the icons.
        const inner = document.createElement("div");
        inner.className = "furni-strip-inner";
        const scroller = document.createElement("div");
        scroller.className = "furni-strip-scroll";
        const label = document.createElement("span");
        label.className = "furni-strip-label";
        label.textContent = "Furni Info";

        furni.forEach(entry => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "furni-icon-btn";
            // No title attribute: it would raise the browser's own tooltip
            // next to the cursor at the same moment the card opens, saying
            // the same thing twice. aria-label carries the name for screen
            // readers without drawing anything.
            btn.setAttribute("aria-label", `Details for ${entry.name || "this furni"}`);
            const img = document.createElement("img");
            img.src = entry.icon;
            img.alt = "";
            img.loading = "lazy";
            btn.appendChild(img);

            // Hovering opens the card; the card decides for itself whether to
            // stay (see openFurniCard).
            btn.addEventListener("mouseenter", () => openFurniCard(entry, btn));
            // Keyboard and touch have no hover to give, so the same thing on
            // focus and on click — and a click pins it outright, since there
            // is no pointer to move into it.
            btn.addEventListener("focus", () => openFurniCard(entry, btn));
            btn.addEventListener("click", () => openFurniCard(entry, btn, true));
            scroller.appendChild(btn);
        });

        const left = makeFurniArrow(scroller, -1);
        const right = makeFurniArrow(scroller, 1);
        inner.appendChild(left);
        inner.appendChild(scroller);
        inner.appendChild(right);
        inner.appendChild(label);
        furniStrip.appendChild(inner);
        wireFurniScrollHints(inner, scroller, left, right);
    }

    // How fast a hovered arrow drags the row along, in pixels per SECOND —
    // under two icons a second, slow enough to read what is coming past
    // rather than a flick. Measured against elapsed time rather than per
    // frame, or the same hover would run at half speed on a 60Hz screen and
    // double on a 144Hz one.
    const FURNI_HOVER_SCROLL = 60;

    /* One end-cap of the icon row: a solid arrow that scrolls the row while
       the pointer rests on it, and jumps a full row-width when clicked.
       There is no scrollbar to grab — it ate more height than the icons
       could spare and cut across the chrome — so these are the only visible
       sign the row goes further, which is why they dim rather than vanish
       at the ends: an arrow that disappears takes the hint with it. */
    function makeFurniArrow(scroller, dir) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "furni-strip-arrow " + (dir < 0 ? "is-left" : "is-right");
        btn.setAttribute("aria-label", dir < 0 ? "Scroll furni left" : "Scroll furni right");
        btn.tabIndex = -1;

        let frame = null;
        let last = 0;
        const step = now => {
            // Capped so a backgrounded tab, where frames stop arriving,
            // doesn't come back and jump the row a long way in one step.
            const dt = Math.min(now - last, 100) / 1000;
            last = now;
            scroller.scrollLeft += FURNI_HOVER_SCROLL * dt * dir;
            frame = requestAnimationFrame(step);
        };
        const start = () => {
            if (frame !== null) return;
            frame = requestAnimationFrame(now => { last = now; step(now); });
        };
        const stop = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };

        // Pointer events rather than mouseenter/leave so a touch that lands
        // on the arrow doesn't leave it scrolling forever with no pointer to
        // move away — on touch it is a tap, handled by the click below.
        btn.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") start(); });
        btn.addEventListener("pointerleave", stop);
        btn.addEventListener("pointerdown", stop);
        btn.addEventListener("click", () => {
            stop();
            scroller.scrollBy({ left: scroller.clientWidth * dir, behavior: "smooth" });
        });
        return btn;
    }

    /* Keeps the arrows honest: hidden entirely when the row fits (nothing to
       hint at), and the one pointing at an end the row has already reached
       is dimmed. The observer matters because the strip is built while the
       modal is still hidden, where every width reads as zero — the first
       real measurement only arrives once it is shown. */
    function wireFurniScrollHints(inner, scroller, left, right) {
        const update = () => {
            const max = scroller.scrollWidth - scroller.clientWidth;
            inner.classList.toggle("has-overflow", max > 1);
            left.classList.toggle("is-spent", scroller.scrollLeft <= 1);
            right.classList.toggle("is-spent", scroller.scrollLeft >= max - 1);
        };
        scroller.addEventListener("scroll", update);
        if (typeof ResizeObserver === "function") new ResizeObserver(update).observe(scroller);
        update();
    }

    // Cards opened by hovering are "transient" — the next hover replaces
    // them. Moving the pointer into one, or dragging it, pins it, so it can
    // be read, dragged around and closed on its own terms. Without that a
    // hover-opened card could never be reached to use its link or its X.
    const openFurniCards = [];
    let transientFurniCard = null;
    let furniCardSeq = 0;

    function closeFurniCard(card) {
        const i = openFurniCards.indexOf(card);
        if (i !== -1) openFurniCards.splice(i, 1);
        if (transientFurniCard === card) transientFurniCard = null;
        card.remove();
    }

    function pinFurniCard(card) {
        card.dataset.pinned = "true";
        if (transientFurniCard === card) transientFurniCard = null;
    }

    function openFurniCard(entry, anchor, pinNow) {
        // Already showing this one? Just keep it.
        const existing = openFurniCards.find(c => c.dataset.furni === (entry.url || entry.name));
        if (existing) {
            if (pinNow) pinFurniCard(existing);
            return;
        }
        // Only ever one card at a time — opening another closes whatever
        // was up, pinned or not.
        closeAllFurniCards();

        const card = furniCardTemplate.content.firstElementChild.cloneNode(true);
        card.dataset.furni = entry.url || entry.name || String(furniCardSeq++);
        // The room-scale sprite in the rotation it was matched in, where the
        // scan recorded one. Older results, and anything added by hand, only
        // carry the small catalogue icon.
        card.querySelector(".furni-card-icon").src = entry.sprite || entry.icon || "";
        card.querySelector(".furni-card-icon").alt = entry.name || "";
        card.querySelector(".furni-card-name").textContent = entry.name || "";
        card.querySelector(".furni-card-motto").textContent = entry.motto || "";
        card.querySelector(".furni-card-date").textContent =
            entry.releaseDate ? `Released ${formatMazeDate(entry.releaseDate)}` : "";
        const link = card.querySelector(".furni-card-link");
        if (entry.url) link.href = entry.url;
        else link.remove();

        card.querySelector(".furni-card-close").addEventListener("click", () => closeFurniCard(card));
        card.querySelector(".furni-card-drag").addEventListener("mousedown", e => {
            pinFurniCard(card);
            startCardDrag(card, e);
        });
        // Reaching the card at all means it's wanted — from here it stays
        // until it's closed.
        card.addEventListener("mouseenter", () => pinFurniCard(card));

        document.body.appendChild(card);
        openFurniCards.push(card);

        // Sits above its icon with the card's bottom-left corner lapping
        // over it, so the card visibly belongs to the icon it came from
        // rather than floating loose near it. Measured from the card's own
        // height, since that is what puts its BOTTOM at the icon.
        // clampToViewport pulls it back on screen near an edge.
        const r = anchor.getBoundingClientRect();
        const OVERLAP = 8;
        clampToViewport(card, r.left - OVERLAP, r.top - card.offsetHeight + OVERLAP);

        if (pinNow) pinFurniCard(card);
        else transientFurniCard = card;

        // A transient card closes when the pointer leaves both it and its
        // icon without ever entering it.
        anchor.addEventListener("mouseleave", () => {
            setTimeout(() => {
                if (transientFurniCard === card && !card.matches(":hover")) closeFurniCard(card);
            }, 120);
        }, { once: true });
    }

    // Anywhere that is not a card and not one of the icons dismisses them.
    // Registered once, in the capture phase, so it still sees the click when
    // something inside the modal stops propagation on its own handler.
    document.addEventListener("mousedown", e => {
        if (!openFurniCards.length) return;
        if (e.target.closest(".furni-card") || e.target.closest(".furni-icon-btn")) return;
        closeAllFurniCards();
    }, true);

    function closeAllFurniCards() {
        openFurniCards.slice().forEach(closeFurniCard);
    }

    // ---------- zooming inside a photo frame ----------

    // Scroll wheel and single click zoom the picture within its window;
    // double click doubles the whole frame instead (see .is-2x).
    const PHOTO_ZOOM_WHEEL_STEP = 1.15;
    // How far the pointer may travel between press and release and still
    // count as a click rather than a drag of the picture.
    const PHOTO_PAN_SLOP = 4;
    // How long a first click waits to see whether a second one is coming.
    // Any lower and a genuine double click starts leaking through as a
    // single one first.
    const PHOTO_DOUBLE_CLICK_MS = 220;

    // The frame itself may be transform-scaled (.is-2x), which doubles what
    // a screen pixel is worth inside it. Every measurement below is taken in
    // the frame's own unscaled coordinates, so pointer positions coming from
    // the page have to be divided by this to match.
    function frameScale(frame) {
        return frame.classList.contains("is-2x") ? 2 : 1;
    }

    function photoZoomState(frame) {
        if (!frame._photoZoom) frame._photoZoom = { scale: 1, x: 0, y: 0 };
        return frame._photoZoom;
    }

    // The zoomed-out state: the smallest the picture is allowed to get,
    // which is whatever covers the window. The image is laid out at the
    // window's width, so it already covers horizontally at scale 1 — this
    // only ever has work to do vertically, for a picture wider in aspect
    // than the window it sits in. Covering rather than merely fitting is
    // what keeps the orange filled now the picture arrives uncropped.
    function photoBaseScale(frame) {
        const box = frame.querySelector(".photo-frame-photo-box");
        const img = frame.querySelector(".photo-frame-photo");
        if (!img.offsetWidth || !img.offsetHeight) return 1;
        return Math.max(box.clientWidth / img.offsetWidth, box.clientHeight / img.offsetHeight);
    }

    // Full size: the picture at its own resolution, one image pixel to one
    // screen pixel. Also the zoom ceiling — past 1:1 there's no more detail
    // in the file to show, only interpolation. Never below the base scale,
    // for a picture whose delivered size is smaller than its window.
    function photoMaxScale(frame) {
        const img = frame.querySelector(".photo-frame-photo");
        if (!img.naturalWidth || !img.offsetWidth) return 1;
        return Math.max(photoBaseScale(frame), img.naturalWidth / img.offsetWidth);
    }

    function isPhotoAtFullSize(frame) {
        return photoZoomState(frame).scale >= photoMaxScale(frame) - 0.001;
    }

    function applyPhotoZoom(frame) {
        const state = photoZoomState(frame);
        const box = frame.querySelector(".photo-frame-photo-box");
        const img = frame.querySelector(".photo-frame-photo");
        // Layout size, unaffected by the transform we're about to set.
        const width = img.offsetWidth * state.scale;
        const height = img.offsetHeight * state.scale;

        // The picture always covers its window: no gap can open at an edge,
        // and it can't be pushed off into nowhere. Anything smaller than the
        // window in an axis is centred on it instead.
        state.x = width <= box.clientWidth
            ? (box.clientWidth - width) / 2
            : Math.min(0, Math.max(box.clientWidth - width, state.x));
        state.y = height <= box.clientHeight
            ? (box.clientHeight - height) / 2
            : Math.min(0, Math.max(box.clientHeight - height, state.y));

        img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
        frame.classList.toggle("is-photo-max", isPhotoAtFullSize(frame));
    }

    // Back to the zoomed-out view, centred on the picture rather than
    // pinned to its top-left corner — the middle is what you want to see
    // first of a shot that's wider than its window.
    function resetPhotoZoom(frame) {
        const box = frame.querySelector(".photo-frame-photo-box");
        const img = frame.querySelector(".photo-frame-photo");
        const state = photoZoomState(frame);
        state.scale = photoBaseScale(frame);
        state.x = (box.clientWidth - img.offsetWidth * state.scale) / 2;
        state.y = (box.clientHeight - img.offsetHeight * state.scale) / 2;
        applyPhotoZoom(frame);
    }

    // Zooms about a point, so whatever is under the cursor stays under it
    // rather than the picture growing from a fixed corner and carrying the
    // thing you were looking at off the edge.
    function zoomPhotoAt(frame, factor, pointX, pointY) {
        setPhotoScaleAt(frame, photoZoomState(frame).scale * factor, pointX, pointY);
    }

    // The picture sits under a sepia tint until it's actually handled —
    // zoomed or panned — at which point the tint fades off and stays off.
    // Set here rather than in applyPhotoZoom, which also runs on load and
    // would clear the tint before anyone had touched anything.
    function markPhotoExplored(frame) {
        frame.classList.add("is-explored");
    }

    function setPhotoScaleAt(frame, scale, pointX, pointY) {
        const state = photoZoomState(frame);
        const next = Math.min(photoMaxScale(frame), Math.max(photoBaseScale(frame), scale));
        if (next === state.scale) return;
        markPhotoExplored(frame);
        const ratio = next / state.scale;
        state.x = pointX - (pointX - state.x) * ratio;
        state.y = pointY - (pointY - state.y) * ratio;
        state.scale = next;
        applyPhotoZoom(frame);
    }

    function wirePhotoZoom(frame) {
        const box = frame.querySelector(".photo-frame-photo-box");
        const img = frame.querySelector(".photo-frame-photo");

        // Where the pointer is, in the picture window's own coordinates.
        function pointIn(e) {
            const rect = box.getBoundingClientRect();
            const scale = frameScale(frame);
            return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale];
        }

        // Set up once the picture has loaded: both the covering scale and
        // the clamping need its real dimensions, and it has none before it
        // arrives.
        img.addEventListener("load", () => resetPhotoZoom(frame));

        box.addEventListener("wheel", e => {
            // Otherwise the page scrolls behind the frame at the same time.
            e.preventDefault();
            const [x, y] = pointIn(e);
            zoomPhotoAt(frame, e.deltaY < 0 ? PHOTO_ZOOM_WHEEL_STEP : 1 / PHOTO_ZOOM_WHEEL_STEP, x, y);
        }, { passive: false });

        // Drag the picture around inside its window. Worth having even
        // unzoomed: fitting on width alone already leaves most pictures
        // taller than the window, so there is something to move.
        //
        // Pointer events with capture, rather than mousedown plus listeners
        // on window. The window is 159px wide and a picture at full size is
        // wider than that, so crossing it means dragging past the frame's
        // own edge almost immediately — and once the pointer is out there,
        // the page behind starts selecting text and swallowing the drag, so
        // the far side of the picture could never be reached. Capturing the
        // pointer routes every move and release back here until the button
        // comes up, wherever it happens to be. It also means no listeners
        // are left on window for each frame that gets opened.
        let panning = false;
        let panMoved = false;
        let panPointerId = null;
        let panStartX = 0;
        let panStartY = 0;
        let panFromX = 0;
        let panFromY = 0;

        // Otherwise the browser starts its own native image-drag and the
        // picture never follows the pointer at all.
        img.addEventListener("dragstart", e => e.preventDefault());

        box.addEventListener("pointerdown", e => {
            if (e.button !== 0) return;
            const state = photoZoomState(frame);
            panning = true;
            panMoved = false;
            panPointerId = e.pointerId;
            panStartX = e.clientX;
            panStartY = e.clientY;
            panFromX = state.x;
            panFromY = state.y;
            frame.classList.add("is-panning");
            box.setPointerCapture(e.pointerId);
            // Belt and braces alongside the capture: stops the drag leaving
            // a trail of selected text across the page behind it.
            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        box.addEventListener("pointermove", e => {
            if (!panning || e.pointerId !== panPointerId) return;
            const scale = frameScale(frame);
            const dx = (e.clientX - panStartX) / scale;
            const dy = (e.clientY - panStartY) / scale;
            // Past a few pixels this is a drag, and the click that follows
            // on release is a by-product of it rather than a zoom request.
            if (Math.abs(dx) > PHOTO_PAN_SLOP || Math.abs(dy) > PHOTO_PAN_SLOP) {
                panMoved = true;
                markPhotoExplored(frame);
            }
            const state = photoZoomState(frame);
            state.x = panFromX + dx;
            state.y = panFromY + dy;
            applyPhotoZoom(frame);
        });

        function endPan(e) {
            if (!panning || e.pointerId !== panPointerId) return;
            panning = false;
            panPointerId = null;
            frame.classList.remove("is-panning");
            document.body.style.userSelect = "";
            if (box.hasPointerCapture(e.pointerId)) box.releasePointerCapture(e.pointerId);
        }

        box.addEventListener("pointerup", endPan);
        box.addEventListener("pointercancel", endPan);

        // A single click switches between the fitted view and full size; a
        // double click doubles the whole frame. Both start with a "click",
        // so the single-click action is held briefly and dropped if a second
        // click follows.
        let clickTimer = null;

        box.addEventListener("click", e => {
            // The tail end of a drag, not a click on the spot.
            if (panMoved) {
                panMoved = false;
                return;
            }
            if (clickTimer) return; // second of a pair — dblclick takes it
            const [x, y] = pointIn(e);
            clickTimer = setTimeout(() => {
                clickTimer = null;
                // Straight to full size, and straight back to fitted — two
                // states, not a ladder of steps.
                if (isPhotoAtFullSize(frame)) resetPhotoZoom(frame);
                else setPhotoScaleAt(frame, photoMaxScale(frame), x, y);
            }, PHOTO_DOUBLE_CLICK_MS);
        });

        box.addEventListener("dblclick", e => {
            clearTimeout(clickTimer);
            clickTimer = null;
            e.preventDefault();
            frame.classList.toggle("is-2x");
            // Re-clamped because at 2x it's twice the size and may now hang
            // off the bottom or right of the window.
            const rect = frame.getBoundingClientRect();
            clampFrame(frame, rect.left, rect.top);
        });
    }

    function openPhotoFrame(entry) {
        // Clicking the same icon again raises the frame it already opened
        // rather than stacking a second identical copy of it — "one frame
        // per picture", not "one frame per click".
        const already = openPhotoFrames.find(f => f.dataset.image === entry.image);
        if (already) {
            bringPhotoFrameToFront(already);
            return;
        }

        const frame = photoFrameTemplate.content.firstElementChild.cloneNode(true);
        frame.dataset.image = entry.image;
        // Width only, no height: passing both makes imgCdn ask the CDN for
        // fit=cover, which crops the picture to that aspect before it is
        // ever sent. Zooming and panning could then only explore the crop —
        // the sides of a wide room shot were gone before the browser saw
        // them. Asked for at 1200 wide so "full size" has real detail in it.
        frame.querySelector(".photo-frame-photo").src = imgCdn(entry.image, 1200, null, 80);
        frame.querySelector(".photo-frame-photo").alt = entry.name || "";
        frame.querySelector(".photo-frame-name").textContent = entry.name || "";

        bringPhotoFrameToFront(frame);
        frame.querySelector(".photo-frame-close").addEventListener("click", () => closePhotoFrame(frame));
        // Anywhere on the frame raises it, not just the drag strip — picking
        // a buried frame's picture out of a pile shouldn't require grabbing
        // its 16px handle first.
        frame.addEventListener("mousedown", () => bringPhotoFrameToFront(frame));
        frame.querySelector(".photo-frame-drag").addEventListener("mousedown", e => startFrameDrag(frame, e));

        wirePhotoZoom(frame);

        // Appended before positioning: clampFrame measures the rendered box,
        // and a frame still detached from the document measures as zero.
        document.body.appendChild(frame);

        // Opens centred, stepped down-right by however many frames are
        // already out, wrapping after six so a long session can't walk them
        // off the bottom of the screen. clampFrame keeps the result
        // on-screen whatever the viewport size.
        const step = 18;
        const offset = (photoFrameSeq++ % 6) * step;
        clampFrame(
            frame,
            Math.round((window.innerWidth - PHOTO_FRAME_W) / 2) + offset,
            Math.round((window.innerHeight - PHOTO_FRAME_H) / 2) + offset
        );

        openPhotoFrames.push(frame);
        syncPhotoStripToFrames();
        frame.querySelector(".photo-frame-close").focus();
    }

    // One shared drag, tracking whichever frame is currently held, rather
    // than a pair of window listeners per open frame. Same approach as the
    // console's own drag (js/console.js), clamped on every move so a frame
    // can't be dragged out of reach.
    let dragFrame = null;
    let frameOffsetX = 0;
    let frameOffsetY = 0;

    function startFrameDrag(frame, e) {
        dragFrame = frame;
        frame.classList.add("is-dragging");
        const rect = frame.getBoundingClientRect();
        frameOffsetX = e.clientX - rect.left;
        frameOffsetY = e.clientY - rect.top;
        document.body.style.userSelect = "none";
        e.preventDefault();
    }

    window.addEventListener("mousemove", e => {
        if (!dragFrame) return;
        clampFrame(dragFrame, e.clientX - frameOffsetX, e.clientY - frameOffsetY);
    });

    window.addEventListener("mouseup", () => {
        if (!dragFrame) return;
        dragFrame.classList.remove("is-dragging");
        dragFrame = null;
        document.body.style.userSelect = "";
    });

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

    // Builder cards — the Habbo Origins profiles behind a maze's creator
    // line (see netlify/functions/habbo.js). Entirely additive: the plain
    // creator line is rendered first and unconditionally, and these only
    // ever appear on top of it if a lookup succeeds.
    //
    // A token guards against the modal being reopened on a different maze
    // while lookups are still in flight — without it a slow response for
    // maze A could land after the visitor has opened maze B and paint B's
    // modal with A's builders.
    let builderToken = 0;

    // A maze's creator field can credit any number of people, comma-
    // separated ("Vincent, LanceS, ChrisYepYep"), and every one of them gets
    // a card. Each name costs one lookup, but those are cached server-side
    // and the endpoint only answers for names actually credited in this
    // archive (see netlify/functions/habbo.js), so the count is bounded by
    // what an admin has typed rather than by anything a visitor controls.

    function creatorNames(owner) {
        return String(owner || "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
    }

    function relativeLastSeen(iso) {
        const then = new Date(iso);
        if (isNaN(then)) return "";
        const mins = Math.floor((Date.now() - then.getTime()) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
        const days = Math.floor(hours / 24);
        if (days < 30) return days + (days === 1 ? " day ago" : " days ago");
        return formatMazeDate(then.toISOString().slice(0, 10)) || "a while ago";
    }

    // mirrored flips the card: avatar on the right, text to its left. Used
    // for every other card when a maze credits more than one builder, so a
    // stack of them alternates rather than repeating the same silhouette
    // down the left edge.
    function builderCard(profile, mirrored) {
        const card = document.createElement("div");
        card.className = mirrored ? "builder-card builder-card--mirrored" : "builder-card";

        if (profile.avatar) {
            const avatar = document.createElement("img");
            avatar.className = "builder-avatar";
            avatar.src = profile.avatar;
            avatar.alt = "";
            avatar.loading = "lazy";
            // The avatar comes from www.habbo.com's imaging service, which
            // is outside this site's control — if it fails, drop just the
            // image and keep the name/motto rather than leaving a broken
            // icon behind.
            avatar.addEventListener("error", () => avatar.remove());
            card.appendChild(avatar);
        }

        const text = document.createElement("div");
        text.className = "builder-text";

        const nameLine = document.createElement("p");
        nameLine.className = "builder-name";
        // Text nodes throughout: names and mottos are written by Habbo
        // users, not by an admin here.
        nameLine.appendChild(document.createTextNode(profile.name));

        const status = document.createElement("span");
        status.className = profile.online ? "builder-status is-online" : "builder-status";
        status.textContent = profile.online
            ? "Online"
            : (profile.lastAccessTime ? "Last seen " + relativeLastSeen(profile.lastAccessTime) : "");
        if (status.textContent) nameLine.appendChild(status);
        text.appendChild(nameLine);

        if (profile.motto) {
            const motto = document.createElement("p");
            motto.className = "builder-motto";
            motto.textContent = profile.motto;
            text.appendChild(motto);
        }

        card.appendChild(text);
        return card;
    }

    // One card for the whole team on a maze marked Collab: the avatars
    // together on the left, overlapping slightly so they read as a group
    // rather than a list, and just the names beside them. No motto or
    // last-seen here — those belong to one person, and there is no one
    // person to attach them to.
    function collabCard(profiles) {
        const card = document.createElement("div");
        card.className = "builder-card builder-card--collab";

        const avatars = document.createElement("div");
        avatars.className = "builder-avatars";
        profiles.forEach(profile => {
            if (!profile.avatar) return;
            const avatar = document.createElement("img");
            avatar.className = "builder-avatar";
            avatar.src = profile.avatar;
            avatar.alt = "";
            avatar.loading = "lazy";
            avatar.addEventListener("error", () => avatar.remove());
            avatars.appendChild(avatar);
        });
        if (avatars.children.length) card.appendChild(avatars);

        const text = document.createElement("div");
        text.className = "builder-text";
        const nameLine = document.createElement("p");
        nameLine.className = "builder-name";
        // Text node, not innerHTML — these names come from Habbo.
        nameLine.appendChild(document.createTextNode(profiles.map(pr => pr.name).join(", ")));
        text.appendChild(nameLine);
        card.appendChild(text);

        return card;
    }

    async function showBuilderCard(n) {
        const token = ++builderToken;
        modalBuilder.hidden = true;
        modalCreator.hidden = false;
        modalBuilder.innerHTML = "";

        const names = creatorNames(n.owner);
        if (!names.length) return;

        // In parallel, and individually tolerant: one builder who is not
        // on Origins does not cost the others their card. The function
        // itself decides which hotel to ask and whether the name is even
        // credited in this archive, so there is no hotel check here.
        const profiles = (await Promise.all(names.map(name => Api.getHabboProfile(name))))
            .filter(Boolean);

        // Stale response for a maze the visitor has already navigated away
        // from, or nobody resolved — either way, leave the list hidden.
        if (token !== builderToken || !profiles.length) return;

        // Combined into one card once a maze credits three or more people —
        // past a pair, a column of separate cards is taller than the modal
        // wants to be and says the same thing less clearly. A Collab drops to
        // the combined card at two, since crediting a team is the point of
        // that status; anything else keeps a card each at two so both
        // builders still get their motto and last-seen.
        if (profiles.length >= 3 || (n.statusKey === "collab" && profiles.length > 1)) {
            modalBuilder.appendChild(collabCard(profiles));
        } else {
            profiles.forEach((profile, i) => modalBuilder.appendChild(builderCard(profile, i % 2 === 1)));
        }
        // The cards carry the builders' names themselves, so the plain
        // "by <name>" line would just repeat them.
        modalCreator.hidden = true;
        modalBuilder.hidden = false;
    }

    function openModal(n) {
        // Invalidates any in-flight closeModal() from a rapid re-open (its
        // animationend/fallback would otherwise fire later and rip the
        // "open"/"closing" classes off this new instance mid-view).
        modalCloseToken++;
        modalOverlay.classList.remove("closing");
        modalTriggerEl = document.activeElement;

        modalName.textContent = n.name;
        modalCreator.textContent = n.subtitle;
        showBuilderCard(n);
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

        // Events size the framed viewport to whatever thumbnail is showing
        // rather than letterboxing it inside the fixed-height frame — see
        // .is-event's rules in css/style.css, which do the sizing in CSS off
        // this one class.
        modalThumb.classList.toggle("is-event", !!n.isEvent);
        activeFurni = n.furni || null;
        renderRelatedImages(n);

        if (combinedGallery.length) {
            activeGallery = combinedGallery;
            modalThumb.classList.add("has-gallery");
            modalThumbFrame.style.backgroundImage = "";
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
            renderFurniStrip(null);
            modalThumb.classList.remove("has-gallery");
            galleryMissingPill.style.display = "none";
            galleryPrev.style.display = "none";
            galleryNext.style.display = "none";
            galleryCounter.style.display = "none";
            galleryPosition.style.display = "none";
            galleryBonusTab.style.display = "none";
            galleryStrip.style.display = "none";
            galleryStrip.innerHTML = "";
            // A gallery-less event puts its single thumbnail in the
            // viewport's own <img> rather than painting it as a background
            // on the frame behind it: the frame is a fixed height, so a
            // background can only ever be letterboxed inside it, where a
            // real <img> lets the framed box shrink to the image itself
            // (.is-event's CSS). Mazes keep the background treatment, tint
            // overlay and all.
            if (n.isEvent && n.thumb) {
                modalGalleryImg.src = imgCdn(n.thumb, 800, 500, 70);
                modalGalleryImg.alt = n.name || "";
                modalGalleryImg.style.transform = "translateX(0)";
                modalGalleryImg.style.display = "block";
                modalThumbFrame.style.backgroundImage = "";
            } else {
                modalGalleryImg.style.display = "none";
                modalThumbFrame.style.backgroundImage = n.thumb
                    ? `linear-gradient(rgba(10,7,4,0.15), rgba(10,7,4,0.35)), url('${imgCdn(n.thumb, 800, 500, 70)}')`
                    : "";
            }
            oldVersionsPill.style.display = "none";
        }

        // Old-version images belong to whichever room is currently showing
        // in the gallery above (not the maze as a whole) — the pill/view
        // are (re)populated per image in showGalleryImage, reset here so
        // reopening the modal never starts mid-way through a previous view.
        resetOldVersionsInstant();

        modalOverlay.classList.add("open");
        // Moves keyboard focus into the dialog itself (see modalCard's own
        // tabindex="-1" in home.html — focusable via script, not Tab) so a
        // keyboard user's very next Tab press starts cycling the modal's
        // own contents instead of whatever's still behind the overlay.
        modalCard.focus();
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
        // These belong to the maze/event being viewed — leaving them
        // floating over the page after its maze has been closed strands
        // pictures with nothing to explain them.
        closeAllPhotoFrames();
        closeAllFurniCards();

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
            // Back to whatever row (or other trigger) opened this modal —
            // guarded in case it's no longer in the page (e.g. the list
            // re-rendered while the modal was open) rather than calling
            // .focus() on a detached element.
            if (modalTriggerEl && document.body.contains(modalTriggerEl)) modalTriggerEl.focus();
            modalTriggerEl = null;
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
            else if (topView === "events") {
                eventsSub = value;
                eventsSubTouched = true;
            }
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
        // Basic focus trap — without this, Tab-ing past the last (or before
        // the first) focusable element inside the modal would carry focus
        // out to whatever's sitting behind the overlay instead of wrapping
        // back around within the dialog, same as any native modal.
        if (e.key === "Tab") {
            const focusable = modalCard.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
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

    // A derived status is only as fresh as the last render: an event that
    // starts at 19:00 was still showing its "Upcoming" pill at 19:05 on a
    // page that had been sitting open since 18:00, because nothing had asked
    // the question again. This re-checks on a timer and re-renders only when
    // a status has actually moved, so an open listing flips to LIVE by
    // itself (and to Past when the event ends) without a reload.
    //
    // Held off while the modal is open, so the list behind it never rebuilds
    // out from under someone reading it — the next tick after it closes
    // picks the change up.
    let lastStatusSignature = null;

    function eventStatusSignature() {
        return EVENTS.map(e => `${e.id}:${eventStatus(e)}`).join("|");
    }

    setInterval(() => {
        if (!dataLoaded || modalOverlay.classList.contains("open")) return;
        const signature = eventStatusSignature();
        if (signature === lastStatusSignature) return;
        lastStatusSignature = signature;
        render();
    }, 15000);

    Promise.all([Api.getRooms(), Api.getEvents()]).then(([rooms, events]) => {
        ROOMS = rooms;
        EVENTS = events;
        dataLoaded = true;
        lastStatusSignature = eventStatusSignature();
        render();
        openEventFromHash();
    });
});

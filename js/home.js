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
    const whatsNewBtn = document.getElementById("whats-new-btn");
    const timelineBtn = document.getElementById("timeline-btn");
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
    // The window's own titlebar, which now carries the Share and Completed
    // pair as well as the title and the close button.
    const modalTitlebar = modalOverlay.querySelector(".chrome-titlebar");
    const modalCreator = document.getElementById("modal-creator");
    const modalBuilder = document.getElementById("modal-builder");
    const modalMeta = document.getElementById("modal-meta-items");
    const modalDesc = document.getElementById("modal-desc");
    const modalLinksWrap = document.getElementById("modal-links-wrap");
    const modalLinks = document.getElementById("modal-links");
    const modalTags = document.getElementById("modal-tags");
    const modalEcBadge = document.getElementById("modal-ec-badge");
    const modalEcLabel = document.getElementById("modal-ec-label");
    const modalArticle = document.getElementById("modal-article");
    const modalArticleTitle = document.getElementById("modal-article-title");
    const modalArticleMeta = document.getElementById("modal-article-meta");
    const modalArticleBody = document.getElementById("modal-article-body");
    const modalArticleLink = document.getElementById("modal-article-link");
    // The window itself, inside the overlay — what .is-ec is set on.
    const modalEl = modalOverlay.querySelector(".modal");
    const modalLink = document.getElementById("modal-link");
    const modalVisitWrap = document.getElementById("modal-visit-wrap");
    const modalClose = document.getElementById("modal-close");

    const modalViewport = document.getElementById("modal-viewport");
    const modalPrimaryView = document.getElementById("modal-primary-view");
    const oldVersionsPill = document.getElementById("old-versions-pill");
    const oldVersionLayer = document.getElementById("old-version-layer");
    const oldVersionImg = document.getElementById("old-version-img");
    const oldVersionsRail = document.getElementById("old-versions-rail");

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
    // Set the moment the visitor picks a sort themselves, after which their
    // choice stands wherever they go and the per-view default below stops
    // having an opinion. Same shape as eventsSubTouched just above.
    let sortTouched = false;
    let query = "";
    // Independent of topView/mazesSub/eventsSub — layers a featured pick
    // over whichever category is active rather than replacing it, so
    // dropping back out (via a sub-nav filter or a top-nav click) returns
    // to exactly where browsing left off.
    let showFeatured = false;
    /* Layers over whichever category is active, exactly as showFeatured
       does, rather than being a fourth tab: what is new is not a kind of
       maze, it is a slice across both kinds. Any top-nav or sub-nav click
       drops back out of it. */
    let showWhatsNew = false;
    /* The archive in order, in the same place and on the same terms. It
       lived on a page of its own at first, which was the wrong home for it:
       the one route to it was a footer link, so the piece that tells the
       archive's story was the piece nobody would find. It belongs in the
       window everything else is read in. */
    let showTimeline = false;
    let activeGallery = null;
    // Furni per room image for whatever is open, keyed by image path.
    // Events never have any (see normalize), and this says so out loud so
    // the gallery does not have to infer it from an empty object.
    let activeFurni = null;
    let activeIsEvent = false;
    // Which maze the modal is currently showing, so the furni cards can
    // leave it out of "also in" — see renderFurniAlsoIn.
    let activeRoomId = "";
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
    // Which older version is showing, or -1 for "the current room image".
    // One number rather than an index plus an open flag: the two could
    // disagree, and this cannot. Declared up here with the rest of the
    // modal's state because restartAutoAdvance reads it, and that runs long
    // before the older-versions block further down.
    let oldVersionShown = -1;
    let ROOMS = [];
    let EVENTS = [];
    let dataLoaded = false;
    /* Whether the loading screen has gone, and whether the archive request
       failed outright. Both only matter to the empty state: what an empty
       grid MEANS depends on which of the three is true, and render() has no
       other way to tell "not here yet" from "not there at all". Declared
       here rather than beside the loader further down, which is built after
       the first render() call and would still be in its temporal dead zone. */
    let loaderGone = false;
    let loadFailed = false;
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
                /* The record's own id, carried through the normalized shape.

                   Everything that has to name one particular maze or event
                   from the outside needs it: the share link (/maze/<id>),
                   the "walked it" tick that remembers which ones you have
                   done, the what's-new list and the timeline. Before this,
                   a normalized record could only be identified by its
                   display name, which is neither stable nor unique. */
                id: item.id || "",
                name: item.title || "",
                subtitle: item.host ? `by ${item.host}` : "",
                statusKey: eventStatus(item),
                statusLabel: EventStatus.labelFor(item),
                hotel: item.hotel,
                owner: item.host || "",
                dateFieldLabel: "Date",
                dateValue: item.date,
                endDateValue: item.endDate,
                /* Which EC season this event belongs to, or "" for a
                   regular one — which is also what every event that
                   predates the field reads as, since it simply has none.

                   Whitelisted rather than passed through: this value ends
                   up in a class name (ec-title-s1), and the only two that
                   mean anything are the two the admin page offers. */
                ecSeason: ["s1", "s2"].includes(item.ecSeason) ? item.ecSeason : "",
                /* A Habbo Origins article read in by an admin, standing in
                   for this event's full details. Carried whole: it was
                   sanitised where it was fetched, not here. */
                article: item.article && item.article.body ? item.article : null,
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
                /* Events carry no furni: an event's images are posters
                   and promos rather than rooms, so there is nothing in
                   them worth recording. Left off the normalized shape
                   entirely rather than passed through empty, so nothing
                   downstream has to ask whether this one counts. */
                sortKey: item.date || ""
            };
        }
        return {
            isEvent: false,
            // See the events branch above for what this is for.
            id: item.id || "",
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

    // String(), like admin.js's copy: every caller happens to pass a string
    // today, but a number or a null reaching this used to throw rather than
    // escape, and the callers are spread across every render path here.
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    /* A thumbnail that never arrives is taken out rather than left sitting
       at opacity 0 — which is also precisely what it looks like while it is
       still loading, so a failed one read as perpetually about to appear.
       Removed, the row settles into the same plain dark square a maze with
       no image set already shows. Same treatment, for the same reason, that
       a builder avatar gets when habbo.com's imaging service fails. */
    function dropThumb(img) {
        const crop = img.closest(".row-thumb-crop");
        (crop || img).remove();
    }

    function wireThumbFadeIn(container) {
        container.querySelectorAll(".row-thumb-img").forEach(img => {
            /* complete is true for a FAILED image as well as a cached one,
               so it cannot stand alone: a 404 already in the browser cache
               fires no "error" event here and would have been revealed as a
               broken-image icon. naturalWidth is what tells the two apart. */
            if (img.complete) {
                if (img.naturalWidth > 0) img.classList.add("is-loaded");
                else dropThumb(img);
                return;
            }
            img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
            img.addEventListener("error", () => dropThumb(img), { once: true });
        });
    }

    // Shared by the row card and the modal — difficulty (if set) always
    // leads, styled as a tag but colour-coded, followed by the room's own
    // tags in whatever order they were saved.
    /* Everything interpolated here is admin-entered and lands in innerHTML,
       so it is escaped on the way in — the same rule js/admin.js already
       applies to every list it renders. Not because a visitor can reach these
       fields, but because a maze name with a "<" in it should show that
       character rather than open a tag, and a compromised admin account
       should not be able to run script in a visitor's session. */
    function tagsHtml(n) {
        const difficultyHtml = n.difficulty
            ? `<span class="tag difficulty-${escapeHtml(n.difficulty)}">${escapeHtml(DIFFICULTY_LABELS[n.difficulty] || n.difficulty)}</span>`
            : "";
        return difficultyHtml + (n.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    }

    /* Counted once per burst of typing rather than per keystroke, and
       without the query — see the note in js/track.js. */
    let searchTracked = null;
    function noteSearch() {
        if (!window.Track) return;
        clearTimeout(searchTracked);
        searchTracked = setTimeout(() => window.Track.event("search"), 1200);
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
            /* By date, either way round. sortKey is an ISO string on both
               kinds — an event's start, a maze's opening — so comparing
               them as text is comparing them as dates.

               This is also the fallback for anything unrecognised, which is
               deliberate: it is the default for the events lists, and a
               stale value from somewhere should land on it rather than on
               nothing. */
            const dir = sortBy === "date-asc" ? -1 : 1;
            sorted.sort((a, b) => dir * b.sortKey.localeCompare(a.sortKey));
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

    /* An event with no date yet reads "TBC" rather than going blank. A date
       is often the last thing settled about an event, and an empty field
       looks like the page failed to load it rather than like nobody has
       picked one — which is the actual state of affairs and worth saying. */
    function formatEventDuration(startIso, endIso) {
        if (!startIso) return "TBC";
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
        if (whatsNewBtn) {
            whatsNewBtn.classList.toggle("active", showWhatsNew);
            whatsNewBtn.setAttribute("aria-pressed", showWhatsNew ? "true" : "false");
        }
        if (timelineBtn) {
            timelineBtn.classList.toggle("active", showTimeline);
            timelineBtn.setAttribute("aria-pressed", showTimeline ? "true" : "false");
        }
        /* Neither of the cross-archive views takes an ordering from this:
           one is "newest first" by definition and the other is the archive
           in its own order. The search box is left alone — narrowing either
           of them by name is a reasonable thing to want. */
        sortSelect.disabled = showWhatsNew || showTimeline;
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
            sortTouched = false;
        }

        /* Every events list opens newest first — upcoming, past and archive
           alike. All three are runs of dated things, and the one being
           looked for is nearly always the most recent; alphabetical order is
           the right default for an archive of mazes and the wrong one here.

           A default, not a lock: it applies until the visitor picks a sort
           of their own, and their choice then follows them between tabs
           rather than being reset by arriving at one of these. */
        if (!sortTouched) {
            const want = (isEvents && !showFeatured) ? "date-desc" : "name";
            if (sortBy !== want) {
                sortBy = want;
                sortSelect.value = want;
            }
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

    /* What follows the "by <name>" on a row, if anything.

       Open Mazes trade their description for the date the maze opened.
       An events list carries its date as well, but keeps its description:
       when an event happens is the first thing anyone wants from it — all
       three events tabs are sorted by it, and until now the date was only
       ever visible once the row had been opened — while the description is
       the only line that says what the event actually is.

       An event gets the full start/end span, worded exactly as the modal
       words it, and one that has not been scheduled yet says "Date TBC"
       rather than going blank. Not the bare "TBC" formatEventDuration
       hands back: that reads as an answer to a "Date:" label, and nothing
       on this line supplies one (js/site.js's ticker spells out the same
       reasoning for the same reason). */
    function rowDateHtml(n) {
        const when = n.isEvent
            ? (n.dateValue ? formatEventDuration(n.dateValue, n.endDateValue) : "Date TBC")
            : (n.dateValue ? `${n.dateFieldLabel} ${formatMazeDate(n.dateValue)}` : "");
        if (!when) return "";
        /* A multi-day event is the one date long enough to wrap, and left to
           itself the line breaks wherever it runs out of room — mid-date, so
           the row reads as two half-dates rather than a span. Each end is
           wrapped and held together instead, leaving the range dash as the
           only place a break can happen.

           Held apart with markup, not a non-breaking space: U+00A0 in Volter
           Goldfish is 60% wider than a normal one (glyphs.html), so a date
           spaced with them comes out visibly gappier than the name beside it.

           Splitting on the spaced dash is safe because it is the only place
           formatEventDuration puts one — a same-day event's own start–end
           dash is unspaced, and belongs inside a part rather than between
           two of them. */
        const parts = when.split(" – ")
            .map(part => `<span class="row-date-part">${escapeHtml(part)}</span>`)
            .join(" – ");
        /* The separator only earns its place between two things, so a row
           with no builder or host to separate the date from goes without.

           Its own span, with no space before it, so it stays welded to the
           end of the name and the line can only break after it — see
           .row-date-dot, which also explains why it is not the middot it
           reads as. */
        const dot = n.subtitle
            ? `<span class="row-date-dot" aria-hidden="true">•</span>`
            : "";
        return `${dot} <span class="row-date">${parts}</span>`;
    }

    /* The row's own title. An EC event wears its season's name plate — the
       medal, and the name in the plate beside it (see .ec-title). Anything
       else is the plain heading it has always been.

       The plate is a list-row thing only. The modal titles the event in the
       window's own titlebar, which is chrome rather than content, and a
       gold plate sitting in it would read as a second window. The modal
       carries the badge on its own instead — see openModal. */
    function ecTitleHtml(n) {
        const name = escapeHtml(n.name || "");
        if (!n.ecSeason) return `<h3>${name}</h3>`;
        return `<h3 class="ec-title ec-title-${n.ecSeason}"><span class="ec-title-name">${name}</span></h3>`;
    }

    /* ---------- walked it ----------

       Which mazes this visitor has actually been through, kept in their own
       browser and nowhere else. No account, no server, nothing that leaves
       the machine — the same line js/track.js draws, and for the same
       reason: this is a personal note about a maze, not a fact about a
       person that the site has any business holding.

       It is here because an archive of things you can go and do is a
       different object once it knows which ones you have done: the list
       stops being a catalogue you read and becomes one you finish.

       localStorage rather than sessionStorage, which is the one place this
       deliberately differs from tracking — a tick is worthless if it dies
       with the tab. Every read and write is wrapped: private mode refuses
       storage outright, and a visitor in it should lose the ticks, not the
       archive. */
    const WALKED_KEY = "mazerats_walked";
    let walkedIds = new Set();

    function loadWalked() {
        try {
            const raw = localStorage.getItem(WALKED_KEY);
            const list = raw ? JSON.parse(raw) : [];
            walkedIds = new Set(Array.isArray(list) ? list.filter(id => typeof id === "string") : []);
        } catch (e) {
            walkedIds = new Set();
        }
    }

    function saveWalked() {
        try {
            localStorage.setItem(WALKED_KEY, JSON.stringify([...walkedIds]));
        } catch (e) { /* private mode, or the quota — the ticks are the loss */ }
    }

    function isWalked(id) {
        return !!id && walkedIds.has(id);
    }

    function setWalked(id, walked) {
        if (!id) return;
        if (walked) walkedIds.add(id);
        else walkedIds.delete(id);
        saveWalked();
        // Every place that maze appears follows the tick at once: it can be
        // on the main list and in the featured panel at the same time, and
        // its modal may be open over both.
        document.querySelectorAll(`.walked-toggle[data-walked-id="${CSS.escape(id)}"]`)
            .forEach(btn => paintWalkedToggle(btn, walked));
        updateWalkedCount();
    }

    function paintWalkedToggle(btn, walked) {
        btn.classList.toggle("is-walked", walked);
        btn.setAttribute("aria-pressed", walked ? "true" : "false");
        btn.title = walked ? "Completed. Click to unmark." : "Mark this as completed";
        const label = btn.querySelector(".walked-toggle-label");
        if (label) label.textContent = walked ? "Completed" : "Completed?";
    }

    /* The count above the list — "12 of 37 walked".

       Only over mazes, never events: an event is something that happened on
       a date, not something a visitor can go and complete. And only over
       the mazes that are actually open, since a closed one cannot be walked
       any more and counting it would make the total unreachable by design.
       Hidden entirely at zero: a fresh visitor should meet the archive, not
       a scoreboard reading 0. */
    function walkableRooms() {
        return ROOMS.filter(r => r.status === "open" || r.status === "unknown");
    }

    function updateWalkedCount() {
        const el = document.getElementById("walked-count");
        if (!el) return;
        /* Only over the maze listings. It counts mazes, so it has no
           business above a list of events, above What's New (which is both
           kinds at once) or above the timeline (which is the whole archive
           in order) — in any of those it would be a tally of something the
           list on screen is not about. */
        const appliesHere = topView === "mazes" && !showWhatsNew && !showTimeline;
        const rooms = walkableRooms();
        const done = rooms.filter(r => isWalked(r.id)).length;
        if (!appliesHere || !done || !rooms.length) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        // Worded as the ticks are: they say Completed, so this counts
        // completed. The two are the same act and should read as it.
        el.textContent = `${done} of ${rooms.length} completed`;
        el.classList.toggle("is-complete", done === rooms.length);
    }

    /* The tick itself. A button rather than a checkbox: it carries its own
       label and its own art, and a native checkbox in this chrome would be
       the one unstyled control on the page.

       Only the modal shows one. A tick on every list row put a control on a
       row that is already a control — the whole row opens the maze — and
       gave the archive the look of a checklist before anyone had asked for
       one. Marking a maze off belongs where you land after actually walking
       it, which is its own page. */
    function walkedToggleHtml(n) {
        if (n.isEvent || !n.id) return "";
        const walked = isWalked(n.id);
        return `<button type="button" class="walked-toggle${walked ? " is-walked" : ""}" ` +
            `data-walked-id="${escapeHtml(n.id)}" aria-pressed="${walked ? "true" : "false"}" ` +
            `title="${walked ? "Completed. Click to unmark." : "Mark this as completed"}" ` +
            `data-track="walked-toggle" data-track-label="${escapeHtml(n.id)}">` +
            `<span class="walked-toggle-tick" aria-hidden="true"></span>` +
            `<span class="walked-toggle-label">${walked ? "Completed" : "Completed?"}</span>` +
            `</button>`;
    }

    /* One delegated listener for every tick on the page, however it got
       there — rows are rebuilt on every render and the modal builds its own,
       so binding them individually would mean rebinding forever.

       In the CAPTURE phase, which is load-bearing. A row is itself a button
       that opens the maze (see wireRowActivation), and its handler sits on
       the row — so during bubbling the row is reached long before the
       document is, and a stopPropagation() here would arrive after the
       modal had already opened. Capture runs document-first, so this can
       take the click off the row entirely: ticking a maze is not asking to
       open it. */
    document.addEventListener("click", e => {
        const btn = e.target.closest(".walked-toggle");
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        const id = btn.dataset.walkedId;
        setWalked(id, !isWalked(id));
    }, true);

    // Keyboard rows activate on Enter/Space too (see wireRowActivation), and
    // the same press would otherwise both tick the maze and open it.
    document.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (!e.target.closest || !e.target.closest(".walked-toggle")) return;
        e.stopPropagation();
    }, true);

    loadWalked();

    /* The exact request a row's thumbnail makes, in one place.

       It has to be one place. The loading screen preloads every row's
       thumbnail so the archive arrives all at once, and it was preloading
       the RAW path — the untouched screenshot straight off the image
       function — while the rows themselves asked the CDN for a 160px
       version of it. Every picture was therefore fetched twice, once at
       full size for nobody: 57 requests and 31MB of originals against
       236KB of thumbnails actually drawn, with the biggest single file
       just under 4MB. The progress bar spent the whole load waiting on
       the copy that was thrown away.

       Both callers go through here now, so the preload and the render
       cannot want different files again. */
    function rowThumbUrl(thumb) {
        return imgCdn(thumb, 160, 160, 65);
    }

    function roomRowHtml(n, isOpenView) {
        // Events always show their date; mazes only do on the Open list.
        const showDate = isOpenView || n.isEvent;

        return `
            <div class="chrome-list-row featured" data-difficulty="${n.difficulty || ""}" tabindex="0" role="button" aria-label="View ${escapeHtml(n.name || "maze")}" data-track="${n.dateFieldLabel === "Date" ? "event-open" : "maze-open"}" data-track-label="${escapeHtml(n.name || "")}">
                <div class="row-thumb">
                    ${n.thumb ? `<div class="row-thumb-crop"><img class="row-thumb-img" src="${rowThumbUrl(n.thumb)}" alt="" loading="lazy"></div>` : ""}
                </div>
                <div class="row-info">
                    ${whatsNewDatesHtml(n)}
                    ${ecTitleHtml(n)}
                    <p class="row-creator">${escapeHtml(n.subtitle || "")}${showDate ? rowDateHtml(n) : ""}</p>
                    ${isOpenView ? "" : `<p class="row-desc">${escapeHtml(n.description || "")}</p>`}
                    <div class="row-tags">${tagsHtml(n)}</div>
                </div>
                <div class="row-side">
                    <span class="status-badge status-${n.statusKey}">${n.statusLabel}</span>
                    <span class="chrome-go">Go &#9654;</span>
                </div>
            </div>
        `;
    }

    /* ---------- what's new ----------

       The one question an archive is bad at answering: has anything changed
       since I was last here? Thirty-eight mazes sorted by name look
       identical on every visit, so a returning visitor has no way to tell
       without re-reading the list they already read.

       This is both kinds at once, newest first. "Newest" means the date the
       record entered the archive (createdAt, stamped by the server on
       insert — see netlify/functions/rooms.js), falling back to the maze's
       own opening date or the event's date for everything catalogued before
       that field existed. The fallback is honest rather than exact: those
       older records genuinely have nothing better to sort by, and they are
       the ones that have been here longest anyway. */
    const WHATS_NEW_COUNT = 12;

    /* The day everything already in the archive is counted as having been
       added.

       createdAt is stamped by the server from now on (see
       netlify/functions/rooms.js), but nothing catalogued before that field
       existed has one, and their own opening dates are not the same fact —
       a maze built in 2024 was not added to the archive in 2024. So the
       whole existing archive shares one honest backfill date rather than
       each record claiming a date it cannot support. */
    const ARCHIVE_BACKFILL_DATE = "2026-08-21";

    function archivedAt(item, isEvent) {
        return item.createdAt || ARCHIVE_BACKFILL_DATE;
    }

    /* What a record's own date is, used only to break the tie between the
       many records that share the backfill date above. Without it those
       would fall back on collection order, which is no order at all; with
       it, the backfilled block reads newest-maze-first underneath anything
       genuinely added since. */
    function ownDate(item, isEvent) {
        return (isEvent ? item.date : item.added) || "";
    }

    /* The last thing that happened to a record, which is what this list is
       actually ranked on.

       Ranking on the archived date alone was wrong, and quietly so: every
       record catalogued before createdAt existed shares one backfill date,
       so editing one could not move it. A maze whose furni had just been
       re-scanned sat exactly where it had always sat, hundreds of places
       down, and What's New reported nothing new about it.

       Comparing the two as strings is safe even though they are different
       shapes — "2026-08-21" against "2026-09-03T18:21:24.741Z". They share
       their first ten characters, so the day decides it, and on the same
       day the timestamp sorts after the bare date, which is the right way
       round: the edit happened during or after the day it was archived. */
    function activityAt(item, isEvent) {
        const archived = archivedAt(item, isEvent);
        const updated = item.updatedAt || "";
        return updated > archived ? updated : archived;
    }

    function whatsNewItems() {
        const wrap = (item, isEvent) => {
            const n = normalize(item, isEvent);
            // What the list is ranked on, and what it prints, are different
            // things: it ranks on the latest activity and prints both dates.
            const at = activityAt(item, isEvent);
            const own = ownDate(item, isEvent);
            /* The two dates this list exists to show, carried on the
               normalized record so the row can print them.

               "Archived" is when it entered the archive; on records written
               before createdAt existed it falls back to the maze's own
               opening date, which is marked as approximate rather than
               presented as something it isn't. "Updated" is only ever a
               real server stamp — a record nobody has edited since it was
               added simply doesn't have one, and says nothing rather than
               repeating the first date. */
            n.archivedAt = archivedAt(item, isEvent);
            n.updatedAt = item.updatedAt || "";
            return { n, at, own };
        };
        const rooms = ROOMS.map(r => wrap(r, false));
        const events = EVENTS.map(e => wrap(e, true));
        return rooms.concat(events)
            .filter(x => x.at)
            /* Most recent activity first — added or edited, whichever came
               last — and among everything sharing the backfill date with
               nothing since, newest in its own right first. */
            .sort((a, b) => b.at.localeCompare(a.at) || String(b.own).localeCompare(String(a.own)))
            .slice(0, WHATS_NEW_COUNT)
            .map(x => x.n);
    }

    /* The dated line What's New adds to a row, and nowhere else adds.

       It answers the question that view is for — when did this turn up, and
       has it changed since — which is not worth a line of every row in the
       ordinary listings, where it would just be a third date competing with
       the maze's own opening. */
    function whatsNewDatesHtml(n) {
        if (!showWhatsNew || !n.archivedAt) return "";
        const parts = [
            `<span class="row-when-item">Archived: ${escapeHtml(formatMazeDate(n.archivedAt))}</span>`
        ];
        // Only when it is genuinely later than the day it arrived: an edit
        // made an hour after cataloguing is part of cataloguing it.
        if (n.updatedAt && n.updatedAt.slice(0, 10) > n.archivedAt.slice(0, 10)) {
            parts.push(`<span class="row-when-item">Edited: ${escapeHtml(formatMazeDate(n.updatedAt))}</span>`);
        }
        // No separator glyph between them: a bullet or a dash would have to
        // borrow another face to render at all (Volter Goldfish draws both
        // as pictures), and this line is meant to be one font throughout.
        // The gap between the two items does the separating.
        return `<p class="row-when">${parts.join("")}</p>`;
    }

    /* ---------- the timeline ----------

       The archive read as a history rather than a list: every maze and every
       event in the order it happened, grouped by year, with the mazes of a
       year and the events of that year beside each other so a run of collab
       mazes and the collab that produced them read as one moment instead of
       as entries in two different tabs.

       Rendered into the same results panel the listings use, so it scrolls
       where they scroll and closes the way they close. Every entry opens the
       real modal — this is an index of the archive, not a second copy of it. */

    const TIMELINE_STATUS_LABELS = {
        open: "Open",
        closed: "Closed",
        collab: "Collab",
        unknown: "Unknown"
    };

    /* The year an entry belongs to, taken off the front of its own date
       string rather than parsed. A maze whose opening is recorded as
       "2024-06" with no day is a real and common case (the admin form allows
       it), and new Date() would either invent the first of the month or fail
       outright. The year is all this needs and it is always the first four
       characters. */
    function timelineYearOf(iso) {
        const m = /^(\d{4})/.exec(String(iso || ""));
        return m ? m[1] : "";
    }

    function timelineEntries() {
        const entries = [];
        ROOMS.forEach(room => {
            if (!room.name || !timelineYearOf(room.added)) return;
            entries.push({
                kind: "maze",
                id: room.id || "",
                when: room.added || "",
                name: room.name,
                by: room.creator || "",
                statusKey: room.status || "unknown",
                statusLabel: TIMELINE_STATUS_LABELS[room.status] || "Unknown",
                note: room.description || "",
                ecSeason: ""
            });
        });
        EVENTS.forEach(ev => {
            if (!ev.title || !timelineYearOf(ev.date)) return;
            entries.push({
                kind: "event",
                id: ev.id || "",
                when: ev.date || "",
                name: ev.title,
                by: ev.host || "",
                statusKey: eventStatus(ev),
                statusLabel: EventStatus.labelFor(ev),
                note: ev.description || "",
                ecSeason: ["s1", "s2"].includes(ev.ecSeason) ? ev.ecSeason : ""
            });
        });
        return entries;
    }

    /* One line under each year saying what that year held, in counts rather
       than prose: the archive cannot know that 2024 was the year of the
       collab boom, but it can say six of that year's mazes were collabs,
       which is the same fact without the editorialising.

       The separator is handed to another face on purpose. Volter Goldfish
       draws several punctuation codepoints as PICTURES — an em dash comes
       out as a musical note, a bullet as a symbol — so anything set in it
       that needs a divider has to borrow one character from Roboto. The
       archive's list rows already do this; see .row-date-dot. */
    function timelineYearNote(entries) {
        const mazes = entries.filter(e => e.kind === "maze");
        const events = entries.filter(e => e.kind === "event");
        const collabs = mazes.filter(e => e.statusKey === "collab").length;
        const parts = [];
        if (mazes.length) parts.push(`${mazes.length} ${mazes.length === 1 ? "maze" : "mazes"}`);
        if (collabs) parts.push(`${collabs} ${collabs === 1 ? "collab" : "collabs"}`);
        if (events.length) parts.push(`${events.length} ${events.length === 1 ? "event" : "events"}`);
        return parts.join('<span class="timeline-sep" aria-hidden="true">•</span>');
    }

    function timelineEntryHtml(entry, index) {
        const date = formatMazeDate(entry.when);
        const medal = entry.ecSeason
            ? `<img class="timeline-medal" src="assets/img/ec/ec-badge-${entry.ecSeason}.png" alt="Event Creators season ${entry.ecSeason === "s1" ? "one" : "two"}">`
            : "";
        return `
            <li class="timeline-entry timeline-entry-${entry.kind}">
                <span class="timeline-date">${escapeHtml(date || "Undated")}</span>
                <span class="timeline-dot" aria-hidden="true"></span>
                <div class="timeline-entry-body">
                    <p class="timeline-entry-name">
                        ${medal}<button type="button" class="timeline-open" data-timeline-index="${index}">${escapeHtml(entry.name)}</button>
                        <span class="timeline-badge status-badge status-${escapeHtml(entry.statusKey)}">${escapeHtml(entry.statusLabel)}</span>
                    </p>
                    ${entry.by ? `<p class="timeline-entry-by">${entry.kind === "event" ? "Event hosted" : "Maze built"} by ${escapeHtml(entry.by)}</p>` : ""}
                    ${entry.note ? `<p class="timeline-entry-note">${escapeHtml(entry.note)}</p>` : ""}
                </div>
            </li>`;
    }

    function renderTimeline() {
        const entries = timelineEntries();
        if (!entries.length) {
            grid.innerHTML = "";
            emptyEl.textContent = "Nothing dated in the archive yet.";
            emptyEl.style.display = "block";
            return;
        }
        emptyEl.style.display = "none";

        // Held in order so a row can name its own entry by index rather than
        // by an id that would have to be looked up in two collections.
        const flat = [];
        const byYear = new Map();
        entries.forEach(entry => {
            const year = timelineYearOf(entry.when);
            if (!byYear.has(year)) byYear.set(year, []);
            byYear.get(year).push(entry);
        });
        // Newest first, all the way down: the years, and the entries within
        // each of them. Running the years backwards and their contents
        // forwards meant the list changed direction at every heading — you
        // read December at the top of the page and January at the foot of
        // the first year, then jumped back to December again.
        const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

        const mazeCount = entries.filter(e => e.kind === "maze").length;
        const eventCount = entries.length - mazeCount;
        // No dash in this sentence on purpose — see timelineYearNote.
        const summary = `${mazeCount} ${mazeCount === 1 ? "maze" : "mazes"} and ` +
            `${eventCount} ${eventCount === 1 ? "event" : "events"}, ` +
            `from ${years[years.length - 1]} to ${years[0]}.`;

        const html = years.map(year => {
            const ofYear = byYear.get(year).slice()
                .sort((a, b) => String(b.when).localeCompare(String(a.when)));
            const rows = ofYear.map(entry => {
                flat.push(entry);
                return timelineEntryHtml(entry, flat.length - 1);
            }).join("");
            return `
                <section class="timeline-year">
                    <h3 class="timeline-year-head">
                        <span class="timeline-year-number">${escapeHtml(year)}</span>
                        <span class="timeline-year-note">${timelineYearNote(ofYear)}</span>
                    </h3>
                    <ul class="timeline-list">${rows}</ul>
                </section>`;
        }).join("");

        grid.innerHTML = `<p class="timeline-summary">${escapeHtml(summary)}</p><div class="timeline">${html}</div>`;

        grid.querySelectorAll(".timeline-open").forEach(btn => {
            btn.addEventListener("click", () => {
                const entry = flat[Number(btn.dataset.timelineIndex)];
                if (!entry) return;
                const record = entry.kind === "event"
                    ? EVENTS.find(e => e.id === entry.id)
                    : ROOMS.find(r => r.id === entry.id);
                if (record) openModal(normalize(record, entry.kind === "event"));
            });
        });
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
            /* An empty grid with the empty state hidden is the right picture
               only while the loading screen is still over it saying so. Once
               that has gone the same picture is a lie: a complete, healthy
               looking archive holding no mazes at all.

               It can be up for a while. The loader gives up at
               LOADER_MAX_WAIT (8s) and the archive request is allowed 6s and
               then 12s before it falls back to the bundled copy, so a slow
               connection has ten seconds of looking at an archive that
               appears to be empty. Say which it is instead. */
            // Three dots rather than an ellipsis character, matching the
            // search box's own placeholder — this text can land in Volter
            // Goldfish, which is particular about punctuation.
            emptyEl.textContent = loadFailed
                ? "Couldn’t load the archive. Try refreshing the page."
                : "Still loading the archive...";
            emptyEl.style.display = loaderGone ? "block" : "none";
            return;
        }

        /* The timeline takes the whole results panel: it is not a filtered
           list of the same rows but a different shape entirely, so it draws
           itself and returns rather than falling through the row machinery
           below. */
        if (showTimeline) {
            renderTimeline();
            updateWalkedCount();
            return;
        }

        const view = effectiveView();
        /* Three pools, one row renderer. What's New and the furni filter
           each bring their own set and their own order, so they stand
           outside the view/sort machinery — the sort dropdown has no opinion
           worth having about "newest first", and a furni's mazes read
           alphabetically like any other list of mazes. The search box still
           applies to all three: narrowing any of them by name is a
           reasonable thing to want. */
        const rawItems = furniFilter
            ? furniFilteredItems().filter(matchesQuery)
            : showWhatsNew
                ? whatsNewItems().filter(matchesQuery)
                : sourceItems(view)
                    .map(item => normalize(item, topView === "events"))
                    .filter(matchesQuery);
        const items = (showWhatsNew || furniFilter) ? rawItems : sortItems(rawItems);
        currentItems = items;

        // The Open Mazes list trades the short description for the date the
        // maze opened, shown right next to the owner's name instead. What's
        // New keeps the description: a mixed list of mazes and events needs
        // the line that says what each one is.
        const isOpenView = !showWhatsNew && view === "open";

        grid.innerHTML = furniFilterChipHtml() + currentItems.map(n => roomRowHtml(n, isOpenView)).join("");

        const clearFilter = document.getElementById("furni-filter-clear");
        if (clearFilter) {
            clearFilter.addEventListener("click", () => {
                furniFilter = null;
                render();
            });
        }

        // Back: the archive as it was, and the maze that asked the question
        // open again on top of it.
        const backToMaze = document.getElementById("furni-filter-back");
        if (backToMaze) {
            backToMaze.addEventListener("click", () => {
                const id = furniFilter && furniFilter.fromMazeId;
                furniFilter = null;
                render();
                const record = ROOMS.find(r => r.id === id);
                if (record) openModal(normalize(record, false));
            });
        }

        wireRowActivation(grid, currentItems);
        wireThumbFadeIn(grid);

        const messages = query.trim() ? emptyMessagesSearch : emptyMessagesNoSearch;
        emptyEl.textContent = showWhatsNew
            ? (query.trim() ? "Nothing new matches your search." : "Nothing has been added yet.")
            : messages[view];
        emptyEl.style.display = currentItems.length === 0 ? "block" : "none";
        updateWalkedCount();
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
    /* How many picks the frame shows.

       Two on a desktop, where that is all the panel has room for. Four on a
       phone, because the panel is the same fixed height there but the rows
       are much shorter: two picks left around 130px of empty ground beneath
       them and pushed the minimised browse frame's own restore sliver below
       the fold, so the panel read as a hole in the page rather than as a
       list that had finished. The space is filled with mazes instead — and
       since each pick is a different difficulty, four of them still read as
       the colour ramp the panel is for.

       Read fresh on each open rather than captured once: a phone that turns
       landscape crosses this line, and the next open should answer to where
       it is now. */
    const FEATURED_PHONE_MAX = 640;
    function featuredFrameCount() {
        return window.innerWidth <= FEATURED_PHONE_MAX ? 4 : 2;
    }
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
            .slice(0, featuredFrameCount())
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
        // Older versions belong to the room currently showing in the
        // gallery, not to the maze — so moving to the next room drops any
        // older version that is up rather than leaving it over a picture it
        // has nothing to do with.
        oldVersionsGallery = (g.oldVersions || []).filter(v => v && v.image);
        resetOldVersionInstant();
        renderOldVersionsRail();
        oldVersionsPill.style.display = oldVersionsGallery.length ? "inline-flex" : "none";
        markActiveOldVersion();

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
        /* An older version is up over the current room. Advancing would
           swap the picture out from under a deliberate comparison — and
           worse, silently, since the carousel moving on also clears the
           older-version panel and its picker.

           Guarded here rather than at each caller: opening an older version
           stops the timer itself, but half a dozen other things restart it
           (leaving the furni row, closing the furni card, the arrows, the
           arrow keys) and every one of them would have to remember. */
        if (oldVersionShown >= 0) return;
        autoAdvanceTimer = setInterval(() => {
            // Reading the furni row is a deliberate act, and advancing the
            // room out from under it swaps every icon and closes the card
            // mid-sentence. The timer keeps ticking and simply declines;
            // leaving the row restarts it for a full fresh countdown rather
            // than whatever was left of the interval it interrupted.
            if (furniInUse()) return;
            showGalleryImage(activeIndex + 1);
        }, 12000);
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
            btn.dataset.track = "photo-open";
            btn.dataset.trackLabel = (entry.name || "").slice(0, 60);
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
    /* Fetches every room's icons the moment the maze opens, not just the
       room on screen. Paging through a maze otherwise re-runs the same wait
       at every room, even though the icons repeat heavily between them — the
       whole site only has 374 distinct ones. They go straight into the HTTP
       cache, so by the time a room is reached its icons are already there.

       Deliberately unawaited and error-swallowing: this is a nicety, and a
       furni whose icon 404s should cost nothing more than that icon. */
    const warmedFurniIcons = new Set();
    const FURNI_WARM_BATCH = 12;
    function warmFurniIcons(furni) {
        if (!furni) return;
        const queue = [];
        for (const record of Object.values(furni)) {
            for (const item of (record && record.items) || []) {
                if (!item || item.hidden || !item.icon) continue;
                if (warmedFurniIcons.has(item.icon)) continue;
                warmedFurniIcons.add(item.icon);
                queue.push(item.icon);
            }
        }
        if (!queue.length) return;

        // In idle-time batches at low priority, never in one go. A 35-room
        // maze queues 227 icons, and firing those at once puts 227 requests
        // in front of the room screenshot — which is 100-750KB, is the thing
        // the visitor is actually looking at, and matters far more than an
        // icon three rooms ahead.
        const idle = window.requestIdleCallback || (fn => setTimeout(fn, 200));
        const pump = () => {
            for (const url of queue.splice(0, FURNI_WARM_BATCH)) {
                const img = new Image();
                img.decoding = "async";
                img.fetchPriority = "low";
                img.src = url;
            }
            if (queue.length) idle(pump);
        };
        idle(pump);
    }

    /* Ordering the furni row: theme, then type, then name.

       The row arrives in the order the SCANNER produced it, which is
       descending matched-pixel count — an artefact of the matching algorithm
       and meaningless to a reader. A room image holds sixteen furni at the
       median and up to sixty-four, and two thirds of them hold more than the
       twelve the row shows before it scrolls, so the order is doing real
       work.

       FurniIndex has no category or type field — the whole of what it
       returns is id, name, className, motto, icon, the two sprite grids,
       releaseDate and url. So both keys below are derived from className and
       the display name.

       Hand-added furni sorts exactly like scanned furni and needs no special
       case: the admin picker stores className with each entry it adds, and
       netlify/functions/_furni-payload.js backfills it from the catalogue by
       icon for anything recorded before that existed. An entry that somehow
       still has none falls back to matching on its display name alone, which
       is why the type words below cover ordinary English as well as the
       Habbo class vocabulary. */

    /* Type words, checked against className tokens AND the display name.
       Habbo class names are not all English — sohva is a sofa, amme a bath,
       kaappi a cabinet — so the Finnish shows up here alongside the obvious.
       Order matters: the first list to match wins, which is what keeps
       "turntable" out of Table. Covers 83% of the archive's furni; the rest
       fall to (untyped), which sorts last within its theme. */
    const FURNI_TYPES = [
        ["Bathroom",     ["bath", "toilet", "sink", "shower", "tub", "loo", "portaloo", "amme", "hcamme", "wc"]],
        ["Media",        ["tv", "television", "turntable", "radio", "jukebox", "telephone", "phone", "speaker", "camera", "monitor"]],
        ["Machine",      ["machine", "vendro", "dicemaster", "dice", "fesh", "mtd", "provider", "lever", "switch", "button"]],
        ["Seating",      ["chair", "sofa", "sohva", "stool", "bench", "seat", "throne", "armchair", "sofachair", "tuoli", "pouffe"]],
        ["Table",        ["table", "poyta", "desk", "counter", "nightstand", "coffeetable"]],
        ["Bed",          ["bed", "cot", "bunk", "hammock", "sanky"]],
        ["Plant",        ["plant", "cactus", "bonsai", "tree", "flower", "bush", "palm", "yukka", "pineapple", "garland", "ivy", "fern", "rose"]],
        ["Lighting",     ["lamp", "lantern", "light", "candle", "torch", "chandelier", "bblamp", "dragonlamp", "lamppu"]],
        ["Wall art",     ["poster", "painting", "picture", "banner", "mural", "frame"]],
        ["Storage",      ["shelf", "shelves", "cabinet", "drawer", "wardrobe", "chest", "bookcase", "crate", "box", "kaappi", "limukaappi", "locker"]],
        ["Flooring",     ["rug", "carpet", "mat", "matto", "tile", "tile1", "floor"]],
        ["Divider",      ["door", "gate", "fence", "divider", "screen", "curtain", "wall", "post", "pillar", "column"]],
        ["Food & drink", ["tray", "barrel", "bottle", "cup", "drink", "food", "fruit", "cake", "juice", "icecream", "bar", "tea", "coffee"]],
        ["Decoration",   ["statue", "trophy", "urn", "vase", "fountain", "pillow", "cushion", "parasol", "fan", "balloon", "figure", "ornament", "sign", "flag", "clock", "mirror", "rocket", "teleport", "duck", "elephant", "bunny", "pumpkin", "fireplace", "snowman", "tubes", "pipe"]],
    ];
    const FURNI_TYPE_WORDS = new Set(FURNI_TYPES.reduce((all, [, words]) => all.concat(words), []));

    function furniTokens(entry) {
        return (String(entry.className || "") + " " + String(entry.name || ""))
            .split(/[^a-z0-9]+/i)
            .filter(Boolean)
            .map(t => t.toLowerCase());
    }

    function furniType(entry) {
        const tokens = furniTokens(entry);
        for (const [label, words] of FURNI_TYPES) {
            if (tokens.some(t => words.indexOf(t) !== -1)) return label;
        }
        return null;
    }

    /* The className prefix is the furni's line — gothic_chair, arabian_table,
       tiki_torch. But plenty of prefixes are the OBJECT rather than a line
       (plant_yukka, poster_fox), and those name no theme at all, so a prefix
       counts only when it isn't itself a type word. That rule needs no
       curated list of themes, which is the point: new Habbo lines classify
       themselves. Covers 54% of the archive; the rest sort as unthemed. */
    function furniTheme(entry) {
        const className = String(entry.className || "");
        if (className.indexOf("_") === -1) return null;
        const prefix = className.split(/[_*]/)[0].toLowerCase();
        if (!prefix || /^\d+$/.test(prefix) || FURNI_TYPE_WORDS.has(prefix)) return null;
        return prefix;
    }

    // Anything with no theme sorts after everything that has one, and the
    // same for type within a theme — a known group beats a leftover.
    function compareFurni(a, b) {
        const at = furniTheme(a), bt = furniTheme(b);
        if (at !== bt) {
            if (!at) return 1;
            if (!bt) return -1;
            return at.localeCompare(bt);
        }
        const ak = furniType(a), bk = furniType(b);
        if (ak !== bk) {
            if (!ak) return 1;
            if (!bk) return -1;
            return ak.localeCompare(bk);
        }
        return String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true });
    }

    function renderFurniStrip(record) {
        furniStrip.innerHTML = "";
        /* An event has no furni on any of its images — its pictures are
           posters rather than rooms — so the row goes entirely rather than
           standing empty with a note about a scan that is never coming.

           The case below for keeping the row's space even when it is empty
           is about a MAZE gallery, where some images have been scanned and
           some have not and the row would otherwise appear and disappear
           between them. An event has no such middle state. */
        if (activeIsEvent) {
            furniStrip.hidden = true;
            return;
        }
        // The scan stores a record per room image — { scannedAt,
        // roomColours, items } — not a bare list, so a room that found
        // nothing can still say whether it was scanned and skipped or
        // simply had no furni in it. A plain array is accepted too, for
        // anything added by hand.
        const list = Array.isArray(record) ? record : (record && record.items) || [];
        // Hidden ones stay in the record — the admin can put them back, and
        // a rescan would only find a false positive again — but never reach
        // the site.
        const furni = list.filter(f => f && !f.hidden && (f.sprite || f.icon)).sort(compareFurni);

        /* The row keeps its space whether or not it has anything to put in
           it. Hiding it outright made the modal jump: the furni row sits
           between the room image and the body, so every room without furni
           pulled the creator, tags, meta and description up by the row's
           full height — and paging through a gallery where some images have
           been scanned and some have not made the whole card twitch on each
           advance.

           An explicit line is also the more honest answer. A missing row
           says nothing; it reads as a room that has no furni in it, when
           what it usually means is a room the scan has not reached yet. */
        furniStrip.hidden = false;
        furniStrip.classList.toggle("is-empty", !furni.length);
        if (!furni.length) {
            const note = document.createElement("p");
            note.className = "furni-strip-empty";
            /* Worded for the common case and the true one at once. "No furni
               data yet" is the state: this room has not been matched against
               the catalogue, or was matched before the catalogue listed what
               is in it. "Not scanned yet" would be wrong for a room that was
               scanned and legitimately found nothing. */
            note.textContent = "No furni recorded for this room yet";
            furniStrip.appendChild(note);
            return;
        }

        // Icons live in their own scroller so a room holding thirty furni
        // scrolls instead of running the row across the whole modal. The
        // wrapper around it is what the end arrows are positioned against —
        // inside the scroller they would slide away with the icons.
        const inner = document.createElement("div");
        inner.className = "furni-strip-inner";
        const scroller = document.createElement("div");
        scroller.className = "furni-strip-scroll";

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
            // NOT lazy. The row caps at twelve icons and scrolls, so the
            // browser considered everything past the twelfth off-screen and
            // never requested it — a room with 32 furni loaded 12 of them and
            // left the other 20 blank until they were scrolled to. These
            // average 823 bytes; the whole site's 374 distinct icons come to
            // 300KB, less than one room screenshot. There is nothing here
            // worth deferring.
            img.decoding = "async";
            btn.appendChild(img);

            // Hovering opens the card; the card decides for itself whether to
            // stay (see openFurniCard).
            btn.addEventListener("mouseenter", () => openFurniCard(entry, btn));
            // Keyboard and touch have no hover to give, so the same thing on
            // focus and on click — and a click pins it outright, since there
            // is no pointer to move into it.
            btn.addEventListener("focus", () => openFurniCard(entry, btn));
            btn.dataset.track = "furni-open";
            btn.dataset.trackLabel = entry.name || "";
            btn.addEventListener("click", () => openFurniCard(entry, btn, true));
            scroller.appendChild(btn);
        });

        const left = makeFurniArrow(scroller, -1);
        const right = makeFurniArrow(scroller, 1);
        inner.appendChild(left);
        // Leaving the row hands the carousel back — see furniInUse. Bound
        // once on the container, which outlives the icons inside it.
        // ("furni-strip pointerleave")
        if (!furniStrip.dataset.pauseWired) {
            furniStrip.dataset.pauseWired = "1";
            furniStrip.addEventListener("pointerleave", () => {
                if (!furniInUse()) restartAutoAdvance();
            });
        }

        inner.appendChild(scroller);
        inner.appendChild(right);

        // Names the row from the empty space at its left end — the icons are
        // right-aligned, so this costs no room.
        const caption = document.createElement("span");
        caption.className = "furni-strip-caption";
        caption.textContent = "FURNI INFO";
        furniStrip.appendChild(caption);

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
        // scrollLeft rounds to whole pixels: assigning 0.9 lands on 1, but
        // assigning 0.33 lands on 0. A per-frame movement below half a pixel
        // therefore does not move the row AT ALL — it reads back the same
        // value it started from, every frame, forever. At 60px/second that
        // is any display above 120Hz. So the fraction is banked here and
        // only whole pixels are ever handed to scrollLeft.
        let carry = 0;
        const step = now => {
            // Capped so a backgrounded tab, where frames stop arriving,
            // doesn't come back and jump the row a long way in one step.
            const dt = Math.min(now - last, 100) / 1000;
            last = now;
            carry += FURNI_HOVER_SCROLL * dt * dir;
            const whole = Math.trunc(carry);
            if (whole) {
                scroller.scrollLeft += whole;
                carry -= whole;
            }
            frame = requestAnimationFrame(step);
        };
        const start = () => {
            if (frame !== null) return;
            carry = 0;
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
            const atStart = scroller.scrollLeft <= 1;
            const atEnd = scroller.scrollLeft >= max - 1;
            inner.classList.toggle("has-overflow", max > 1);
            left.classList.toggle("is-spent", atStart);
            right.classList.toggle("is-spent", atEnd);
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

    /* Whether the furni row is currently being used, which holds the room
       carousel where it is. Hover is read from the DOM rather than tracked
       in a variable: the modal can close with the pointer still over the
       strip, and a missed pointerleave would otherwise leave the carousel
       paused for good. Touch has no hover, but a tap opens a card, and an
       open card counts. */
    /* Is the visitor reading the furni row right now? The carousel checks
       this before every advance, so that it never swaps the room out from
       under someone looking at its furni.

       The is-empty test is load-bearing. The strip keeps its space when a
       room has no furni — that is what stopped the modal jumping between
       scanned and unscanned rooms — so a bare ":hover" now also matches a
       50px band containing nothing but the "no furni recorded" note.
       Resting the pointer there paused the gallery indefinitely, with
       nothing on screen to suggest why or how to resume it. Only a row with
       icons in it can be under a deliberate read. */
    function furniInUse() {
        if (openFurniCards.length > 0) return true;
        return !furniStrip.classList.contains("is-empty") && furniStrip.matches(":hover");
    }

    let transientFurniCard = null;
    let furniCardSeq = 0;

    /* Cards stack the same way frames do: whatever was touched last is in
       front. Its own counter rather than the photo frames' one, starting at
       the z-index the CSS gives a card, so that raising a card keeps it
       above the frames instead of dropping it into their range. */
    let furniCardTopZ = 320;   // must match .furni-card z-index in the CSS

    function bringFurniCardToFront(card) {
        card.style.zIndex = ++furniCardTopZ;
    }

    /* The card's height follows its content, and part of that content is a
       sprite that has not arrived yet. Until it loads the card is short, and
       since placement sets the TOP edge, every pixel gained afterwards
       pushes the BOTTOM further below the icon it is supposed to sit on. So
       the card is placed once immediately and again once the sprite has
       settled its height.

       The sprite is capped small in the CSS and sits beside the description,
       so nothing here resizes the card any more — this only re-places it. */
    // Base card, and the widths the sprite shares its row with: 28px of
    // border, a 6px gap, and the description column. At the base width the
    // sprite's share is 92px — anything wider makes the CARD wider by the
    // difference rather than scaling the sprite down.
    const FURNI_CARD_W = 240;      // must match .furni-card width in the CSS
    const FURNI_CARD_CHROME = 148; // 28px border + 6px gap + 114px description
    // 1:1, because the card is now given FurniIndex's own small artwork
    // rather than the large sprite the scanner matched against (see
    // netlify/functions/_furni-payload.js). The two sizes are exactly a
    // factor of two apart — the Study Desk is 82x90 large and 42x45 small —
    // so this used to halve the large one to arrive at the small one's
    // dimensions by downsampling. Now the real asset is to hand, drawing it
    // untouched is both sharper and simpler: no resampling at all, rather
    // than a resample chosen to be the least damaging one available.
    //
    // Sizes hold up: the widest small sprite in the archive is 76px against
    // the 92px the card gives a sprite, so none of them widens the card.
    const FURNI_CARD_SCALE = 1;

    function placeFurniCardForImage(card, place) {
        const img = card.querySelector(".furni-card-icon");
        const apply = () => {
            // Sized here rather than capped in the CSS, so the card can be
            // built around whatever the sprite turns out to be. It only ever
            // grows: a small sprite leaves the card at its base width rather
            // than reshaping it for every furni.
            if (img.naturalWidth) {
                // Rounded to whole pixels: at 1:1 this is already exact,
                // but the rounding keeps the sizing honest if the scale is
                // ever moved off 1 again.
                const w = Math.round(img.naturalWidth * FURNI_CARD_SCALE);
                const h = Math.round(img.naturalHeight * FURNI_CARD_SCALE);
                img.style.width = `${w}px`;
                img.style.height = `${h}px`;
                const needed = w + FURNI_CARD_CHROME;
                card.style.width = needed > FURNI_CARD_W ? `${needed}px` : "";
            }
            // Place again now the sprite has arrived. The card's height
            // follows it, and its final size is only known at this point —
            // before it, the card is an empty box. The first placement can
            // only work from that provisional height, and since the top edge
            // is what gets set, every pixel gained afterwards pushes the
            // BOTTOM further below the icon it is supposed to sit on.
            //
            // Only re-place a card still sitting where it was put: a slow
            // sprite could load after the card has been dragged, and yanking
            // it back out from under the pointer would be worse than leaving
            // it a little off its anchor.
            if (card.style.left === card.dataset.placedLeft) place();
        };
        if (img.complete) apply();
        else {
            img.addEventListener("load", apply, { once: true });
            // A sprite that 404s still settles the card's height — at the
            // alt-text box rather than an image — so it still needs placing.
            img.addEventListener("error", apply, { once: true });
        }
    }

    function closeFurniCard(card) {
        const i = openFurniCards.indexOf(card);
        if (i !== -1) openFurniCards.splice(i, 1);
        if (transientFurniCard === card) transientFurniCard = null;
        // The hover watch lives partly on the ICON, which outlives the card,
        // so it has to be taken off again or every open leaves another pair
        // of listeners on it pointing at a card that no longer exists.
        if (card._teardownHoverWatch) card._teardownHoverWatch();
        card.remove();
        if (!furniInUse()) restartAutoAdvance();
    }

    function pinFurniCard(card) {
        card.dataset.pinned = "true";
        if (transientFurniCard === card) transientFurniCard = null;
    }

    /* ---------- which other mazes hold this furni ----------

       The scan records, for every room image, which furni were found in it.
       Read the other way round it answers a question nobody could ask
       before: where else is this thing? That is the archive's own data
       being useful about itself, and it is the one thing here no other
       fansite can do — the index already exists, it was simply only ever
       consulted in one direction.

       Built once, lazily, from ROOMS. Keyed by the furni's Furni Index URL
       where it has one and its name otherwise, which is exactly the key
       openFurniCard already uses to tell two cards apart, so a card and its
       index entry can never disagree about which furni they mean. */
    let furniIndexByKey = null;

    function furniKeyOf(entry) {
        return entry.url || entry.name || "";
    }

    function buildFurniIndex() {
        const index = new Map();
        ROOMS.forEach(room => {
            if (!room.furni || !room.id) return;
            // A furni found in six of a maze's rooms is still one maze.
            const seenHere = new Set();
            Object.values(room.furni).forEach(record => {
                (record && record.items ? record.items : []).forEach(item => {
                    const key = furniKeyOf(item);
                    if (!key || seenHere.has(key)) return;
                    seenHere.add(key);
                    if (!index.has(key)) index.set(key, []);
                    index.get(key).push({ id: room.id, name: room.name || room.id });
                });
            });
        });
        // Alphabetical within each furni, by the same comparison the archive
        // sorts by, so the list reads the way the list of mazes does.
        index.forEach(list => list.sort((a, b) => compareNames(a.name, b.name)));
        return index;
    }

    function mazesWithFurni(entry) {
        if (!furniIndexByKey) furniIndexByKey = buildFurniIndex();
        return furniIndexByKey.get(furniKeyOf(entry)) || [];
    }

    /* Which furni the archive listing is currently filtered to, or null.

       This is the cleaner half of the reverse index. The card used to name
       the other mazes itself, which meant a list of up to six links inside a
       240px tooltip — cramped, and a second, worse listing of mazes sitting
       a few pixels from the real one. Now the card states the count and
       hands the question over: pressing it closes the modal and puts those
       mazes in the archive window, in the rows the archive already uses,
       with a chip at the top saying what is being shown and offering the way
       out. One line in the card, a real list where lists belong. */
    let furniFilter = null;

    function renderFurniAlsoIn(card, entry) {
        const block = card.querySelector(".furni-card-also");
        if (!block) return;

        // Everything but the maze whose room is currently open — "also in"
        // means elsewhere, and the visitor is already looking at this one.
        const others = mazesWithFurni(entry).filter(m => m.id !== activeRoomId);
        if (!others.length) {
            block.remove();
            return;
        }

        block.hidden = false;
        block.textContent = others.length === 1
            ? "Also in 1 other maze"
            : `Also in ${others.length} other mazes`;
        block.title = `Show every maze with ${entry.name || "this furni"} in it`;
        block.dataset.track = "furni-also-list";
        block.dataset.trackLabel = furniKeyOf(entry);

        block.addEventListener("click", () => {
            furniFilter = {
                key: furniKeyOf(entry),
                name: entry.name || "this furni",
                icon: entry.icon || entry.sprite || "",
                // The maze this question was asked from, so the chip can
                // offer the way back to it — see furniFilterChipHtml. Read
                // before closeModal(), which clears it.
                fromMazeId: activeRoomId
            };
            // The cards and the modal belong to the maze being left behind.
            closeAllFurniCards();
            closeModal();
            // Every layered view writes into the same panel, so the filter
            // takes it over from whichever one was showing. (Deliberately
            // not clearing furniFilter here, unlike the view toggles: it is
            // what was just set.)
            showFeatured = false;
            showWhatsNew = false;
            showTimeline = false;
            render();
            const results = document.querySelector(".home-results");
            if (results) results.scrollTop = 0;
        });
    }

    // The mazes a furni filter is asking for, as normalized records ready to
    // render as ordinary rows.
    function furniFilteredItems() {
        if (!furniFilter) return [];
        const ids = new Set(mazesWithFurni({ url: furniFilter.key, name: furniFilter.key }).map(m => m.id));
        return ROOMS.filter(r => ids.has(r.id))
            .map(r => normalize(r, false))
            .sort((a, b) => compareNames(a.name, b.name));
    }

    /* The chip above the filtered list: what is being shown, and two ways
       out of it. Rendered into the grid ahead of the rows — it is not a
       .chrome-list-row, so it doesn't disturb wireRowActivation's indexing.

       Two exits because there are two things a visitor might be doing here.
       Back returns to the maze they came from, which is what "I was just
       looking at that" wants; Clear drops the filter and leaves them in the
       archive, which is what "show me everything again" wants. Back is only
       offered when there is a maze to go back to. */
    function furniFilterChipHtml() {
        if (!furniFilter) return "";
        const icon = furniFilter.icon
            ? `<img class="furni-filter-icon" src="${furniFilter.icon}" alt="">`
            : "";
        const back = furniFilter.fromMazeId
            ? `<button type="button" class="furni-filter-btn" id="furni-filter-back">Back</button>`
            : "";
        return `<div class="furni-filter">
                ${icon}
                <span class="furni-filter-text">Mazes with <strong>${escapeHtml(furniFilter.name)}</strong></span>
                ${back}
                <button type="button" class="furni-filter-btn" id="furni-filter-clear" aria-label="Show the whole archive again">Clear</button>
            </div>`;
    }

    function openFurniCard(entry, anchor, pinNow) {
        // Already showing this one? Just keep it — and bring it up, since
        // coming back to its icon while it sits under another card is
        // exactly how a buried one gets asked for.
        const existing = openFurniCards.find(c => c.dataset.furni === (entry.url || entry.name));
        if (existing) {
            bringFurniCardToFront(existing);
            if (pinNow) pinFurniCard(existing);
            return;
        }
        // Only the card nobody has moved gives way. Anything dragged out
        // of place stays where it was put — that is what moving one means,
        // and it is what lets several stand open side by side.
        if (transientFurniCard) closeFurniCard(transientFurniCard);

        const card = furniCardTemplate.content.firstElementChild.cloneNode(true);
        card.dataset.furni = entry.url || entry.name || String(furniCardSeq++);
        // The furni's own small art in the rotation it was matched in.
        // netlify/functions/_furni-payload.js resolves that from the large
        // sprite the scan actually compared against, and falls back to the
        // large one for the 82 sprites with no small twin; an entry with no
        // sprite at all (hand-added, before any rotation is known) gets the
        // catalogue icon.
        card.querySelector(".furni-card-icon").src = entry.sprite || entry.icon || "";
        card.querySelector(".furni-card-icon").alt = entry.name || "";
        card.querySelector(".furni-card-name-text").textContent = entry.name || "";
        // Habbo's own name for the furni, alongside the display name. Absent
        // rather than empty when unknown, so no gap opens after the name.
        const classEl = card.querySelector(".furni-card-class");
        if (entry.className) classEl.textContent = entry.className;
        else classEl.remove();
        card.querySelector(".furni-card-motto").textContent = entry.motto || "";
        card.querySelector(".furni-card-date").textContent =
            entry.releaseDate ? `Released ${formatMazeDate(entry.releaseDate)}` : "";
        const link = card.querySelector(".furni-card-link");
        if (entry.url) link.href = entry.url;
        else link.remove();
        // Where else this same furni turns up in the archive.
        renderFurniAlsoIn(card, entry);

        bringFurniCardToFront(card);
        card.querySelector(".furni-card-close").addEventListener("click", () => closeFurniCard(card));
        // Anywhere on the card raises it, not just the handle — reading a
        // card half-buried under another shouldn't mean finding its 19px
        // header first. Same rule the photo frames follow.
        card.addEventListener("pointerdown", () => bringFurniCardToFront(card));
        card.querySelector(".furni-card-drag").addEventListener("pointerdown", e => startCardDrag(card, e));

        document.body.appendChild(card);
        openFurniCards.push(card);

        // Sits above its icon with the card's bottom-left corner lapping
        // over it, so the card visibly belongs to the icon it came from
        // rather than floating loose near it. Measured from the card's own
        // height, since that is what puts its BOTTOM at the icon.
        // clampToViewport pulls it back on screen near an edge.
        const r = anchor.getBoundingClientRect();
        const OVERLAP = 8;
        const place = () => {
            // Held by its bottom-RIGHT corner: the card laps over the icon it
            // came from and already overhangs the modal's right edge, so a
            // wide sprite has to grow it leftwards, not further off screen.
            const grew = Math.max(0, card.offsetWidth - FURNI_CARD_W);
            clampToViewport(card, r.left - OVERLAP - grew, r.top - card.offsetHeight + OVERLAP);
            card.dataset.placedLeft = card.style.left;
        };
        place();
        placeFurniCardForImage(card, place);

        if (pinNow) pinFurniCard(card);
        else transientFurniCard = card;

        /* An unmoved card lives exactly as long as the pointer is on it or on
           the icon it came from, and reading it means travelling from one to
           the other. So both ends are watched, and leaving either only
           SCHEDULES the close — arriving at the other cancels it. Without the
           delay the card would die in the gap between them; the card overlaps
           its icon by 8px, but a pointer moving diagonally still crosses open
           ground for an instant.

           A pinned card ignores all of this. Once it has been moved it
           answers only to its X, or to a click landing away from every
           card. */
        let closeTimer = null;
        const cancelClose = () => { clearTimeout(closeTimer); closeTimer = null; };
        const scheduleClose = () => {
            cancelClose();
            closeTimer = setTimeout(() => {
                if (card.dataset.pinned === "true") return;
                if (card.matches(":hover") || anchor.matches(":hover")) return;
                closeFurniCard(card);
            }, 160);
        };
        anchor.addEventListener("mouseenter", cancelClose);
        anchor.addEventListener("mouseleave", scheduleClose);
        card.addEventListener("mouseenter", cancelClose);
        card.addEventListener("mouseleave", scheduleClose);
        card._teardownHoverWatch = () => {
            cancelClose();
            anchor.removeEventListener("mouseenter", cancelClose);
            anchor.removeEventListener("mouseleave", scheduleClose);
        };
    }

    /* Anywhere that is not a card and not part of the icon row dismisses
       them. Registered once, in the capture phase, so it still sees the
       click when something inside the modal stops propagation on its own
       handler.

       The row's end arrows are spared alongside the icons. Scrolling the row
       to reach an icon further along is part of using it, not a click
       elsewhere on the page, and closing every open card each time an arrow
       was pressed made a moved card impossible to keep while looking for the
       next furni to stand beside it. */
    document.addEventListener("pointerdown", e => {
        if (!openFurniCards.length) return;
        if (e.target.closest(".furni-card") ||
            e.target.closest(".furni-icon-btn") ||
            e.target.closest(".furni-strip-arrow")) return;
        closeAllFurniCards();
    }, true);

    function closeAllFurniCards() {
        openFurniCards.slice().forEach(closeFurniCard);
    }

    // ---------- zooming inside a photo frame ----------

    // Scroll wheel and single click zoom the picture within its window;
    // double click doubles the whole frame instead (see .is-2x).
    /* What the badge stands for, spelled out beside it. EC is not a thing a
       visitor can be expected to know, and a medal with a numeral on it says
       even less on its own. */
    const EC_SEASON_NAMES = { s1: "Event Creators Season One", s2: "Event Creators Season Two" };

    /* Both forms of that label, as two spans the CSS shows one of: the
       phrase itself on a wide screen, and "EC / S2" on a phone, where the
       full one is a third of the builder row and squeezes the motto beside
       it to one word a line (see .ec-label-short in the CSS).

       Both are written every time rather than the width being read here and
       one chosen: a label picked in JS is right until the phone is turned,
       and would need a matchMedia watch per open modal to stay right. The
       media query already does that for nothing.

       Each is broken over two lines with a real newline rather than markup,
       held by white-space: pre so it breaks exactly there and nowhere else —
       left to wrap on its own the long one came out as three ragged lines.
       js/welcome.js carries its own copy of this for index.html's event
       modal, which is the same row built from the same CSS. */
    function ecLabelForms(season) {
        const full = document.createElement("span");
        full.className = "ec-label-full";
        full.textContent = EC_SEASON_NAMES[season].replace(" Season", "\nSeason");
        const short = document.createElement("span");
        short.className = "ec-label-short";
        // s2 -> "EC\nS2". The medal beside it already carries the numeral,
        // so this is a reminder of which season, not the only sighting of it.
        short.textContent = `EC\n${season.toUpperCase()}`;
        return [full, short];
    }

    const PHOTO_ZOOM_WHEEL_STEP = 1.15;
    // How far the pointer may travel between press and release and still
    // count as a click rather than a drag of the picture.
    const PHOTO_PAN_SLOP = 4;
    // How long a first click waits to see whether a second one is coming.
    // Any lower and a genuine double click starts leaking through as a
    // single one first.
    const PHOTO_DOUBLE_CLICK_MS = 220;
    /* The same two numbers for a finger, which needs both of them looser.

       Two taps meant as a pair land further apart than two clicks do — the
       hand has to lift clear of the glass and come back — and they land in
       slightly different places, where a mouse does not move at all between
       the halves of a double click. 220ms and the pan slop's 4px between
       them reject most real double taps outright.

       Measured against the taps themselves rather than against a browser's
       own idea of one: see the tap handling below for why none of this can
       be left to click/dblclick on a touchscreen. */
    const PHOTO_DOUBLE_TAP_MS = 320;
    const PHOTO_DOUBLE_TAP_SLOP = 24;

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

        // Drag the picture around inside its window, and pinch to zoom it.
        // Worth having even unzoomed: fitting on width alone already leaves
        // most pictures taller than the window, so there is something to move.
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
        //
        // Every live pointer is tracked, not just one, because a pinch is two
        // of them. The previous version took whichever pointer went down last
        // and panned from it, so putting a second finger down mid-gesture
        // made the picture jump to follow that finger instead of zooming.
        // One pointer pans; two pinch. The CSS sets touch-action: none on
        // this box, without which none of it runs on a touchscreen at all —
        // the browser claims the gesture as a page scroll or a page zoom and
        // cancels the pointer stream mid-drag.
        const pointers = new Map();   // pointerId -> [x, y] in the box's own coordinates
        let panMoved = false;         // a drag happened, so the click that follows isn't a zoom request
        let panFromX = 0;
        let panFromY = 0;
        let panStart = null;          // where the single panning pointer went down
        // What is driving the gesture. click and dblclick carry no
        // pointerType of their own, so they read it from here.
        let lastPointerType = "mouse";
        let pinchDist = 0;            // finger separation at the last pinch frame
        let pinchMid = null;          // midpoint at the last pinch frame

        // Otherwise the browser starts its own native image-drag and the
        // picture never follows the pointer at all.
        img.addEventListener("dragstart", e => e.preventDefault());

        const points = () => [...pointers.values()];
        const distance = ([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
        const midpoint = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

        // Called whenever the number of live pointers changes, so a gesture
        // always restarts from where the fingers are NOW. Without this,
        // lifting one finger of a pinch would resume panning from wherever
        // the remaining one first went down, snapping the picture across the
        // window.
        function rebaseGesture() {
            const state = photoZoomState(frame);
            const live = points();
            panStart = null;
            pinchMid = null;
            pinchDist = 0;
            if (live.length === 1) {
                panStart = live[0];
                panFromX = state.x;
                panFromY = state.y;
            } else if (live.length >= 2) {
                const two = live.slice(0, 2);
                pinchDist = distance(two);
                pinchMid = midpoint(two);
            }
        }

        box.addEventListener("pointerdown", e => {
            // Touch and pen report button 0 the same as a left click; this
            // only rejects a genuine middle/right mouse button.
            if (e.pointerType === "mouse" && e.button !== 0) return;
            lastPointerType = e.pointerType;
            pointers.set(e.pointerId, pointIn(e));
            if (pointers.size === 1) panMoved = false;
            frame.classList.add("is-panning");
            box.setPointerCapture(e.pointerId);
            rebaseGesture();
            // Belt and braces alongside the capture: stops the drag leaving
            // a trail of selected text across the page behind it.
            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        box.addEventListener("pointermove", e => {
            if (!pointers.has(e.pointerId)) return;
            pointers.set(e.pointerId, pointIn(e));
            const state = photoZoomState(frame);
            const live = points();

            if (live.length >= 2) {
                // Pinch. Scale by how much the fingers' separation changed,
                // about their midpoint, so whatever is between them stays
                // between them — then follow the midpoint itself, which is
                // what lets a pinch drag and zoom in one movement.
                const two = live.slice(0, 2);
                const dist = distance(two);
                const mid = midpoint(two);
                if (pinchDist > 0 && dist > 0) {
                    setPhotoScaleAt(frame, state.scale * (dist / pinchDist), mid[0], mid[1]);
                }
                if (pinchMid) {
                    state.x += mid[0] - pinchMid[0];
                    state.y += mid[1] - pinchMid[1];
                    applyPhotoZoom(frame);
                }
                pinchDist = dist;
                pinchMid = mid;
                panMoved = true;
                markPhotoExplored(frame);
                return;
            }

            if (live.length === 1 && panStart) {
                const [x, y] = live[0];
                const dx = x - panStart[0];
                const dy = y - panStart[1];
                // Past a few pixels this is a drag, and the click that follows
                // on release is a by-product of it rather than a zoom request.
                if (Math.abs(dx) > PHOTO_PAN_SLOP || Math.abs(dy) > PHOTO_PAN_SLOP) {
                    panMoved = true;
                    markPhotoExplored(frame);
                }
                state.x = panFromX + dx;
                state.y = panFromY + dy;
                applyPhotoZoom(frame);
            }
        });

        function endPan(e) {
            if (!pointers.has(e.pointerId)) return;
            // Read before the delete: this is where the finger actually came
            // up, which is what the tap below is measured from.
            const liftedAt = pointers.get(e.pointerId);
            pointers.delete(e.pointerId);
            if (box.hasPointerCapture(e.pointerId)) box.releasePointerCapture(e.pointerId);
            if (pointers.size) {
                // Still holding: a pinch that lost a finger becomes a pan
                // from where the remaining one is.
                rebaseGesture();
                return;
            }
            panStart = null;
            pinchMid = null;
            pinchDist = 0;
            frame.classList.remove("is-panning");
            document.body.style.userSelect = "";
            // The last finger of the gesture has lifted and it never moved
            // far enough to be a drag or a pinch: that is a tap. A mouse
            // gets the same treatment from its own click event below.
            if (e.type === "pointerup" && e.pointerType !== "mouse" && !panMoved) {
                handleTap(liftedAt);
            }
        }

        box.addEventListener("pointerup", endPan);
        box.addEventListener("pointercancel", endPan);

        /* One tap switches between the fitted view and full size; two double
           the whole frame. Both start with a first tap, so the single-tap
           action is held briefly and dropped if a second one follows — the
           same shape as the click handling below, which does it for a mouse.

           Counted here, off the pointer stream, rather than left to the
           browser's own click/dblclick pair. That pair is what made "double
           click to enlarge" a gesture only a mouse could perform:

           - Whether a double tap produces a dblclick at all is not something
             touchscreens agree on. It is dependable from a mouse and it is
             not dependable from glass, and this box cancels its own
             pointerdown (it has to, for the text selection and the native
             image drag), which is exactly the sort of thing browsers weigh
             when deciding which compatibility events a tap still earns.
           - Where dblclick does arrive, it arrives late: a tap's click waits
             behind the browser's own gesture recognition first. The second
             half of a double tap regularly landed after the 220ms the first
             one waits, so the picture zoomed instead of the frame doubling.

           Pointer events are the one thing every touchscreen sends, on time
           and in full, so the pair is recognised from those and click and
           dblclick are ignored outright for anything that is not a mouse. */
        let clickTimer = null;      // a first click or tap, waiting for a second
        let lastTapAt = 0;
        let lastTapPoint = null;

        // Straight to full size, and straight back to fitted — two states,
        // not a ladder of steps.
        function togglePhotoFullSize(x, y) {
            if (isPhotoAtFullSize(frame)) resetPhotoZoom(frame);
            else setPhotoScaleAt(frame, photoMaxScale(frame), x, y);
        }

        function toggleFrameSize() {
            frame.classList.toggle("is-2x");
            // Re-clamped because at 2x it's twice the size and may now hang
            // off the bottom or right of the window.
            const rect = frame.getBoundingClientRect();
            clampFrame(frame, rect.left, rect.top);
        }

        function handleTap([x, y]) {
            const now = Date.now();
            const pairsWithLast = lastTapPoint &&
                now - lastTapAt < PHOTO_DOUBLE_TAP_MS &&
                Math.hypot(x - lastTapPoint[0], y - lastTapPoint[1]) < PHOTO_DOUBLE_TAP_SLOP;

            if (pairsWithLast) {
                clearTimeout(clickTimer);
                clickTimer = null;
                // Forgotten, so a third tap opens a fresh pair rather than
                // pairing with the second and toggling straight back again.
                lastTapAt = 0;
                lastTapPoint = null;
                toggleFrameSize();
                return;
            }

            lastTapAt = now;
            lastTapPoint = [x, y];
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                clickTimer = null;
                togglePhotoFullSize(x, y);
            }, PHOTO_DOUBLE_TAP_MS);
        }

        // click and dblclick are MouseEvents and carry no pointerType of
        // their own, so what produced them is remembered from the pointerdown
        // that came first (see the handler above).
        box.addEventListener("click", e => {
            if (lastPointerType !== "mouse") return;   // handleTap has it
            // The tail end of a drag, not a click on the spot.
            if (panMoved) {
                panMoved = false;
                return;
            }
            if (clickTimer) return; // second of a pair — dblclick takes it
            const [x, y] = pointIn(e);
            clickTimer = setTimeout(() => {
                clickTimer = null;
                togglePhotoFullSize(x, y);
            }, PHOTO_DOUBLE_CLICK_MS);
        });

        box.addEventListener("dblclick", e => {
            if (lastPointerType !== "mouse") return;   // handleTap has it
            clearTimeout(clickTimer);
            clickTimer = null;
            e.preventDefault();
            toggleFrameSize();
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
        frame.addEventListener("pointerdown", () => bringPhotoFrameToFront(frame));
        frame.querySelector(".photo-frame-drag").addEventListener("pointerdown", e => startFrameDrag(frame, e));

        wirePhotoZoom(frame);

        // Appended before positioning: clampFrame measures the rendered box,
        // and a frame still detached from the document measures as zero.
        document.body.appendChild(frame);

        /* Opens ABOVE the row of photo icons, not in the middle of the
           screen. Centred, it landed squarely on the strip it was launched
           from — so opening one picture covered the icons for all the
           others, which is exactly where the reader is most likely to click
           next.

           Horizontally it stays centred as before; it is only the vertical
           that changes, so the frame still sits over the maze image (which
           is what a picture viewer is expected to cover) and leaves the meta
           row clear.

           The cascade now steps UPWARD, away from the strip, so a second and
           third frame move further clear rather than creeping back over it.
           clampFrame keeps whatever comes out of this on-screen, which is
           also what catches the case of a strip too near the top of the
           window to fit a frame above it. */
        const step = 18;
        const offset = (photoFrameSeq++ % 6) * step;
        const GAP = 10;
        const strip = document.querySelector(".gallery-photos");
        // No strip means the modal has been closed under a frame that is
        // still out; the old centred behaviour is the sensible fallback.
        const top = strip
            ? Math.round(strip.getBoundingClientRect().top - PHOTO_FRAME_H - GAP) - offset
            : Math.round((window.innerHeight - PHOTO_FRAME_H) / 2) + offset;
        clampFrame(
            frame,
            Math.round((window.innerWidth - PHOTO_FRAME_W) / 2) + offset,
            top
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

    /* Pointer events, not mouse events. A touch drag emits touchmove and no
       mousemove at all, so on a phone the handle could be pressed and the
       frame would simply never move — photo frames and furni cards were both
       undraggable on every touchscreen. Pointer events cover mouse, touch and
       pen through one path.

       The pointer is captured on the handle so the move and release still
       arrive after the finger leaves it, which it does immediately: these
       frames are small and a drag crosses their edge at once. The handles
       also carry touch-action: none in the CSS, without which the browser
       claims the gesture as a page scroll and cancels the stream mid-drag. */
    let dragPointerId = null;

    function startFrameDrag(frame, e) {
        // Touch and pen report button 0 like a left click; this only rejects
        // a real middle or right mouse button.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        dragFrame = frame;
        dragPointerId = e.pointerId;
        frame.classList.add("is-dragging");
        const rect = frame.getBoundingClientRect();
        frameOffsetX = e.clientX - rect.left;
        frameOffsetY = e.clientY - rect.top;
        document.body.style.userSelect = "none";
        const handle = e.currentTarget;
        if (handle && handle.setPointerCapture) {
            try { handle.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
        }
        e.preventDefault();
    }

    window.addEventListener("pointermove", e => {
        if (!dragFrame || e.pointerId !== dragPointerId) return;
        // Moving a furni card is what makes it stay: the reader has put it
        // somewhere deliberately, so it stops being a hover tooltip and
        // becomes theirs to dismiss. Here rather than on the handle's
        // pointerdown so that merely grabbing it and letting go doesn't count.
        if (dragFrame.classList.contains("furni-card")) pinFurniCard(dragFrame);
        clampFrame(dragFrame, e.clientX - frameOffsetX, e.clientY - frameOffsetY);
    });

    function endFrameDrag(e) {
        if (!dragFrame || (e && e.pointerId !== dragPointerId)) return;
        dragFrame.classList.remove("is-dragging");
        dragFrame = null;
        dragPointerId = null;
        document.body.style.userSelect = "";
    }

    window.addEventListener("pointerup", endFrameDrag);
    // A cancelled pointer (the browser taking over the gesture, a call
    // arriving) must not leave a frame stuck to the cursor forever.
    window.addEventListener("pointercancel", endFrameDrag);

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

    /* ---------- older versions of a room ----------

       Shown INSIDE .gallery-viewport: the older image slides up over the
       current one from the viewport's own bottom edge, and slides back down
       to dismiss.

       This replaces a whole second view that reel-swapped the modal's entire
       contents — description, tags, furni row and all — to show a picture of
       the same room from a different day. That treatment was doing far too
       much: what changed between versions is the room, and the two want to
       be compared in the same frame, at the same size, without everything
       around them moving. It also had to freeze the modal to a fixed pixel
       height to stop the card resizing mid-swap, which is the sort of thing
       a design has to do when it is fighting itself.

       Nothing outside the viewport moves now, so none of that is needed. */

    const OLD_VERSION_TRANSITION = "transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)";

    function oldVersionsAvailable() {
        return oldVersionsGallery && oldVersionsGallery.length;
    }

    /* The picker: one thumbnail per older version, bottom-left of the
       viewport, sized and styled as the furni icons under it (.furni-icon-btn
       — 34px, same border, radius and hover lift) so the two rows of small
       square controls in this modal read as the same kind of thing.

       Built only when there is more than one to choose between — with a
       single older version the pill is already the whole control, and a
       one-item picker is just a second button doing its job — and SHOWN
       only once an older version is actually up. Sitting the rail on the
       current room image would put four thumbnails of a room over the room,
       claiming a corner of every screenshot in the archive that has ever
       been rephotographed, to offer something nobody had asked for yet. */
    function renderOldVersionsRail() {
        // Hidden only when there is nothing to choose between. Keeping it out
        // of sight until the pill is pressed is the layer's job -- it is off
        // the bottom of the viewport until then, and the rail rides with it.
        const many = oldVersionsAvailable() && oldVersionsGallery.length > 1;
        oldVersionsRail.hidden = !many;
        if (!many) {
            oldVersionsRail.innerHTML = "";
            return;
        }
        oldVersionsRail.innerHTML = oldVersionsGallery.map((v, i) => {
            const label = v.label || `Older version ${i + 1}`;
            return `<button type="button" class="old-version-thumb" data-index="${i}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
                   `<img src="${imgCdn(v.image, 90, 90, 60)}" loading="lazy" alt="">` +
                   `</button>`;
        }).join("");
        oldVersionsRail.querySelectorAll(".old-version-thumb").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();          // never reaches the image's own zoom handler
                const i = Number(btn.dataset.index);
                // A second press on the one already showing puts the current
                // room back — the same button both ways, so there is no
                // separate "close" to go looking for.
                if (i === oldVersionShown) hideOldVersion();
                else showOldVersion(i);
            });
        });
    }

    function markActiveOldVersion() {
        oldVersionsRail.querySelectorAll(".old-version-thumb").forEach((btn, i) => {
            btn.classList.toggle("active", i === oldVersionShown);
        });
        oldVersionsPill.classList.toggle("is-showing", oldVersionShown >= 0);
        if (!oldVersionsAvailable()) return;
        oldVersionsPill.textContent = oldVersionShown >= 0
            ? "Back to current"
            : `See older version${oldVersionsGallery.length > 1 ? "s" : ""}`;
    }

    function showOldVersion(index) {
        if (!oldVersionsAvailable()) return;
        const i = (index + oldVersionsGallery.length) % oldVersionsGallery.length;
        const v = oldVersionsGallery[i];
        const wasHidden = oldVersionShown < 0;
        oldVersionShown = i;

        oldVersionImg.src = imgCdn(v.image, 900, null, 78);
        oldVersionImg.alt = v.label ? `${modalName.textContent} — ${v.label}` : modalName.textContent;
        oldVersionLayer.style.display = "block";

        /* Only the first one slides. Switching between older versions while
           one is already up is a swap, not an arrival — sliding the panel
           out and back in for that would animate the frame rather than the
           change the visitor asked to see. */
        if (wasHidden) {
            oldVersionLayer.style.transition = "none";
            oldVersionLayer.style.transform = "translateY(100%)";
            void oldVersionLayer.offsetHeight;   // commit the start state (see slideGalleryImage)
            oldVersionLayer.style.transition = OLD_VERSION_TRANSITION;
            oldVersionLayer.style.transform = "translateY(0)";
            // The room-by-room carousel must not advance out from under an
            // older version the visitor is looking at.
            stopAutoAdvance();
        }
        markActiveOldVersion();
    }

    function hideOldVersion(instant) {
        if (oldVersionShown < 0) {
            if (instant) resetOldVersionInstant();
            return;
        }
        oldVersionShown = -1;
        markActiveOldVersion();

        if (instant) { resetOldVersionInstant(); return; }

        oldVersionLayer.style.transition = OLD_VERSION_TRANSITION;
        oldVersionLayer.style.transform = "translateY(100%)";
        oldVersionLayer.addEventListener("transitionend", () => {
            // Re-shown again before this fired — leave it alone.
            if (oldVersionShown >= 0) return;
            oldVersionLayer.style.display = "none";
            oldVersionImg.removeAttribute("src");
        }, { once: true });

        if (modalOverlay.classList.contains("open") && !modalOverlay.classList.contains("closing")) {
            restartAutoAdvance();
        }
    }

    // No animation: for switching rooms or opening a different maze, where
    // an older version sliding away from a picture it does not belong to
    // would be describing a relationship that no longer exists.
    function resetOldVersionInstant() {
        oldVersionShown = -1;
        oldVersionLayer.style.transition = "none";
        oldVersionLayer.style.transform = "translateY(100%)";
        oldVersionLayer.style.display = "none";
        oldVersionImg.removeAttribute("src");
        markActiveOldVersion();
    }

    function toggleOldVersions() {
        if (oldVersionShown >= 0) hideOldVersion();
        else showOldVersion(0);
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

    /* ---------- sharing one maze or event ----------

       The link a visitor can actually pass on. /maze/<id> and /event/<id>
       are served by netlify/functions/share.js, which answers a chat
       client's preview crawler with that maze's own name and screenshot and
       sends a real browser through to the archive with it open. Before this
       every link into the site unfurled identically, whichever maze it
       pointed at — and there was no per-maze link to send in the first
       place.

       The clipboard API needs a secure context (https, or localhost), which
       the live site is; the fallback path covers an older browser and a
       clipboard permission that was refused. */
    function shareUrlFor(n) {
        if (!n.id) return "";
        return `${location.origin}/${n.isEvent ? "event" : "maze"}/${encodeURIComponent(n.id)}`;
    }

    function renderShareButton(n, host) {
        const url = shareUrlFor(n);
        if (!url) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "modal-share-btn";
        btn.dataset.track = "share-copy";
        btn.dataset.trackLabel = n.id;
        const label = document.createElement("span");
        label.className = "modal-share-label";
        label.textContent = "Share";
        btn.appendChild(label);
        btn.setAttribute("aria-label", `Copy a link to ${n.name || "this"}`);

        let resetTimer = null;
        const say = text => {
            label.textContent = text;
            btn.classList.toggle("is-done", text !== "Share");
            clearTimeout(resetTimer);
            // Long enough to read, short enough that the button is back to
            // being a button before anyone reaches for it again.
            resetTimer = setTimeout(() => {
                label.textContent = "Share";
                btn.classList.remove("is-done");
            }, 2200);
        };

        btn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(url);
                say("Link copied");
            } catch (e) {
                /* No clipboard (an old browser, or permission refused).
                   Select the URL in a field the visitor can copy by hand
                   rather than telling them it failed and leaving them with
                   nothing — the address is the whole point of the button. */
                const field = document.createElement("input");
                field.className = "modal-share-fallback";
                field.value = url;
                field.readOnly = true;
                btn.after(field);
                field.select();
                say("Copy this");
                setTimeout(() => field.remove(), 8000);
            }
        });

        (host || modalMeta).appendChild(btn);
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
            <span class="status-badge status-${escapeHtml(n.statusKey)}">${escapeHtml(n.statusLabel)}</span>
            <span>Hotel: ${escapeHtml(n.hotel || "Unknown")}</span>
            <span>${escapeHtml(n.dateFieldLabel)}: ${escapeHtml(dateDisplay || "Unknown")}</span>
        `;
        /* Share and Completed live in the window's titlebar, at its left end
           and on the title's own line.

           They were in the meta row, which was already spoken for: the
           photo-wall strip anchors to that row's right-hand end (see
           renderRelatedImages), so on any maze with related images the two
           groups were laid on top of each other. The titlebar is the right
           home for them anyway — they act on the whole window rather than
           on anything in the body, which is what a titlebar is for.

           The bar is not rebuilt between opens the way the meta row is, so
           the previous maze's pair has to be taken off by hand. */
        const oldActions = modalTitlebar.querySelector(".modal-meta-actions");
        if (oldActions) oldActions.remove();
        const actions = document.createElement("div");
        actions.className = "modal-meta-actions";
        modalTitlebar.appendChild(actions);
        /* Completed first, then Share. Marking a maze off is the thing a
           visitor does here most often and the one that belongs to this
           maze alone; sharing is about sending it elsewhere, so it sits
           further out. An event has no Completed, and its Share simply
           takes the near position. */
        if (!n.isEvent && n.id) {
            const wrap = document.createElement("span");
            wrap.className = "modal-walked";
            wrap.innerHTML = walkedToggleHtml(n);
            actions.appendChild(wrap);
        }
        renderShareButton(n, actions);
        modalDesc.textContent = n.details || n.description || "";

        /* The stored Habbo article, if this event has one.
        
           body goes in as markup, which is the one place on this site that
           happens. It is safe because of where it comes from: it was rebuilt
           tag by tag against a whitelist by netlify/functions/article.js
           before it was ever stored, so what is held is already only the
           handful of elements an article is allowed to be. Nothing is fetched
           or parsed here.
        
           An article stands in for the event's full details — the admin form
           will not let both be set — so the description above it is the short
           one, and this reads as the piece itself below it. */
        const article = n.article;
        if (article && article.body) {
            modalArticleTitle.textContent = article.title || "";
            modalArticleMeta.textContent = [article.date, article.category].filter(Boolean).join("  —  ");
            modalArticleBody.innerHTML = article.body;
            modalArticleLink.href = article.url || "#";
            modalArticle.hidden = false;
        } else {
            // Emptied, not just hidden: an article left in the DOM is a
            // screenful of the last event's text one class away from showing.
            modalArticleBody.innerHTML = "";
            modalArticle.hidden = true;
        }
        if (n.linksReferences) {
            modalLinks.innerHTML = linkifyText(n.linksReferences);
            modalLinksWrap.style.display = "block";
        } else {
            modalLinks.innerHTML = "";
            modalLinksWrap.style.display = "none";
        }
        modalTags.innerHTML = tagsHtml(n);

        /* An EC event's season medal, at the right of the builder row, and a
           wash of the badge's own green over the modal with it (see
           .modal.is-ec). Off the event's own season, so a regular event —
           which is every event with no ecSeason at all — is left exactly as
           it was. The value reaches a filename, and normalize has already
           reduced it to one of the two seasons or nothing. */
        const ecSeason = isEventItem ? (n.ecSeason || "") : "";
        if (ecSeason) {
            modalEcBadge.src = `assets/img/ec/ec-badge-${ecSeason}.png`;
            /* The alt keeps the whole phrase on one line, which is what a
               screen reader wants — and it carries the season on a phone,
               where the label beside the medal is abbreviated. */
            modalEcBadge.alt = EC_SEASON_NAMES[ecSeason];
            modalEcLabel.replaceChildren(...ecLabelForms(ecSeason));
        }
        modalEcBadge.hidden = !ecSeason;
        modalEcLabel.hidden = !ecSeason;
        modalEl.classList.toggle("is-ec", !!ecSeason);
        if (n.habboLink) {
            modalLink.href = n.habboLink;
            modalLink.style.display = "inline-block";
        } else {
            modalLink.style.display = "none";
        }
        // The paragraph around it as well, the way js/welcome.js has always
        // done it. Hiding the button alone leaves an empty <p> in the body's
        // column, which reads as a band of dead space under the builder card
        // on every event — none of which have a room to visit.
        modalVisitWrap.style.display = n.habboLink ? "" : "none";

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
        activeIsEvent = !!n.isEvent;
        activeRoomId = n.isEvent ? "" : (n.id || "");
        activeFurni = n.furni || null;
        warmFurniIcons(activeFurni);
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
                ? `<img src="${imgCdn(g.image, 110, 110, 55)}" loading="lazy" alt="${escapeHtml(displayLabel(g))}" data-index="${i}">`
                : `<div class="gallery-strip-missing" data-index="${i}" title="${escapeHtml(displayLabel(g))}">?</div>`
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
                /* Width only, and no height — which is the whole of it.

                   imgCdn adds fit=cover the moment it is given a height, so
                   asking for 800x500 had the CDN crop the picture to 8:5
                   before it was ever sent. The .is-event rules below it were
                   doing their job perfectly and faithfully preserving the
                   aspect of an image that had already lost its own: a 660x260
                   banner arrived as 416x260 and looked uncropped, because by
                   then it was. Asking for width alone is what actually keeps
                   an event's poster whole; the CSS caps how big it is drawn.

                   900 rather than 800 to match showGalleryImage, which fills
                   this same panel for an event that has a gallery. */
                modalGalleryImg.src = imgCdn(n.thumb, 900, null, 78);
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
        resetOldVersionInstant();

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

        // Drop a #event-… or #maze-… hash left over from opening this modal
        // (via the header widget or a shared link) so a refresh after closing
        // doesn't reopen it — replaceState instead of clearing location.hash
        // so it doesn't add a back-button entry or re-fire hashchange.
        if (/^#(event|maze)-/.test(location.hash)) {
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
        // Notes that a search happened. The term itself never leaves the page.
        if (e.target.value.trim()) noteSearch();
        render();
    });

    sortSelect.addEventListener("change", e => {
        sortBy = e.target.value;
        sortTouched = true;
        render();
    });

    // Switches straight to that category, keeping whichever sub-filter was
    // last picked for it (defaulting to the first one) — clicking the
    // already-active button is a no-op rather than toggling back to a
    // featured state, now that #featured-mazes-btn is the only way there.
    topNavBtns.forEach(btn => {
        // Which of the two categories people actually browse.
        btn.dataset.track = "tab";
        btn.dataset.trackLabel = btn.dataset.top || "";
        btn.addEventListener("click", () => {
            topView = btn.dataset.top;
            showFeatured = false;
            showWhatsNew = false;
            showTimeline = false;
            furniFilter = null;
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
            showWhatsNew = false;
            showTimeline = false;
            furniFilter = null;
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
        // The two layered views are alternatives, not a stack: the featured
        // panel covers the list What's New would be writing into.
        if (showFeatured) { showWhatsNew = false; furniFilter = null; }
        searchInput.value = "";
        query = "";
        render();
    });

    /* What's New is a toggle over whatever is underneath, so leaving it puts
       the visitor back exactly where they were — the same shape as the
       featured button above, and for the same reason. The search box is
       cleared on the way in and out: a term typed against the archive is
       rarely the one you want against a list of twelve. */
    if (whatsNewBtn) {
        whatsNewBtn.dataset.track = "whats-new";
        whatsNewBtn.addEventListener("click", () => {
            showWhatsNew = !showWhatsNew;
            // One view at a time: all three write into the same panel.
            if (showWhatsNew) { showFeatured = false; showTimeline = false; furniFilter = null; }
            searchInput.value = "";
            query = "";
            render();
        });
    }

    if (timelineBtn) {
        timelineBtn.dataset.track = "timeline";
        timelineBtn.addEventListener("click", () => {
            showTimeline = !showTimeline;
            if (showTimeline) { showFeatured = false; showWhatsNew = false; furniFilter = null; }
            searchInput.value = "";
            query = "";
            render();
            // The timeline opens on the newest year, and the panel may be
            // holding the scroll position of whatever list was in it.
            const results = document.querySelector(".home-results");
            if (results) results.scrollTop = 0;
        });
    }

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
            /* Only what is actually on screen. Half this modal's controls are
               shown per maze — the gallery arrows, the Visit Room link, the
               older-versions pill — and a display:none button still matches
               the selector, so the trap was stopping Tab on controls the
               visitor cannot see. offsetParent is null for anything display:
               none'd (itself or through an ancestor), which is exactly the
               set to skip. */
            const focusable = [...modalCard.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )].filter(el => el.offsetParent !== null);
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
    /* Opens whatever the hash names — an event or, now, a maze.

       #maze-<id> exists because a maze had no address of its own: the only
       way to send someone one was "open the archive and search for it". It
       is what /maze/<id> lands on once the share function has handed a real
       browser through (see netlify/functions/share.js), and what the Copy
       link button in the modal writes to the clipboard. */
    function openFromHash() {
        if (!dataLoaded) return;
        const m = /^#(event|maze)-(.+)$/.exec(location.hash);
        if (!m) return;
        const id = decodeURIComponent(m[2]);
        if (m[1] === "event") {
            const match = EVENTS.find(e => e.id === id);
            if (match) openModal(normalize(match, true));
            return;
        }
        const match = ROOMS.find(r => r.id === id);
        if (!match) return;
        // A maze can sit in any of the three maze tabs, and a link to one
        // should not depend on which tab happens to be showing. Switch to
        // the list it actually lives in before opening it, so closing the
        // modal leaves the visitor somewhere that contains it.
        topView = "mazes";
        showFeatured = false;
        mazesSub = match.status === "closed" ? "archived" : match.status === "collab" ? "collab" : "open";
        render();
        openModal(normalize(match, false));
    }

    window.addEventListener("hashchange", openFromHash);

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

    /* ---------- Loading screen ----------
       The shell paints almost immediately; what takes seconds is the maze
       list and its thumbnails. Rather than let the page assemble itself in
       front of the visitor, everything is fetched behind the loader and the
       whole archive appears at once.

       The bar tracks real work — two API calls, then one step per thumbnail —
       so it moves when something has actually happened. */
    const loaderEl = document.getElementById("site-loader");
    const loaderFill = document.getElementById("site-loader-fill");
    const loaderLabel = document.getElementById("site-loader-label");
    const LOADER_BLOCK = 8;   // px per drawn block, matching the CSS gradient
    // A stalled thumbnail must never hold the page hostage. Whatever has
    // arrived by now is shown regardless.
    const LOADER_MAX_WAIT = 8000;

    /* Weighted rather than one step per task, because the tasks are nothing
       like equal: the maze list is a single 2.4MB response that accounts for
       roughly half the wait, while a thumbnail is under a kilobyte. Counting
       them evenly parked the bar at 4% for the first two thirds of the load
       and then threw it to 100%. These weights are measured shares of the
       real thing, so the bar moves roughly in step with the waiting. */
    const LOAD_WEIGHT_ROOMS = 45;
    const LOAD_WEIGHT_EVENTS = 5;
    const LOAD_WEIGHT_THUMBS = 50;

    let loadDone = 0;
    const loadTotal = 100;

    function drawLoader() {
        if (!loaderEl) return;
        const pct = loadTotal ? Math.min(1, loadDone / loadTotal) : 1;
        const track = loaderFill.parentElement.clientWidth;
        // Snapped down to whole blocks so none is ever drawn half-width.
        loaderFill.style.width = (Math.floor((pct * track) / LOADER_BLOCK) * LOADER_BLOCK) + "px";
        loaderLabel.textContent = "LOADING " + Math.round(pct * 100) + "%";
    }

    function hideLoader() {
        if (!loaderEl || loaderEl.dataset.done) return;
        loaderEl.dataset.done = "1";
        loadDone = loadTotal;
        drawLoader();
        loaderEl.classList.add("is-done");
        setTimeout(() => loaderEl.remove(), 300);
        // The empty state means something different the moment this goes —
        // see render()'s !dataLoaded branch.
        loaderGone = true;
        if (!dataLoaded) render();
    }

    /* Waits for every thumbnail, counting each as it lands. Resolves on error
       too: a broken image is one fewer thing to wait for, not a reason to sit
       on the loading screen. */
    function preloadThumbs(urls) {
        const each = urls.length ? LOAD_WEIGHT_THUMBS / urls.length : 0;
        return Promise.all(urls.map(url => new Promise(resolve => {
            const img = new Image();
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                loadDone += each;
                drawLoader();
                resolve();
            };
            img.onload = done;
            img.onerror = done;
            // Neither fired: a stalled connection. One thumbnail must not be
            // able to hold the whole page behind the loader.
            setTimeout(done, 5000);
            img.src = url;
        })));
    }

    drawLoader();
    setTimeout(hideLoader, LOADER_MAX_WAIT);

    // Counted separately rather than through Promise.all, so the bar moves
    // when the first of the two lands instead of waiting for both.
    const roomsReq = Api.getRooms().then(r => { loadDone += LOAD_WEIGHT_ROOMS; drawLoader(); return r; });
    const eventsReq = Api.getEvents().then(e => { loadDone += LOAD_WEIGHT_EVENTS; drawLoader(); return e; });

    /* Says out loud that the archive on screen is the bundled stand-in
       rather than the real thing.

       Without this the failure is invisible: the page lays itself out
       perfectly, the loader clears, and the visitor is looking at one maze
       where there are thirty-seven, with no reason to think anything went
       wrong. A quiet line and a way to try again is the least this owes
       them. Built here rather than in home.html because it should not exist
       in the markup at all on the ordinary path. */
    function showDegradedNotice() {
        if (!Api._degraded || !Api._degraded.size) return;
        if (document.getElementById("data-degraded-notice")) return;
        const host = document.getElementById("browse-window") || document.querySelector(".chrome-window");
        if (!host || !host.parentNode) return;

        const notice = document.createElement("div");
        notice.id = "data-degraded-notice";
        notice.className = "callout data-degraded-notice";
        notice.setAttribute("role", "status");
        const what = [...Api._degraded].join(" and ");
        notice.innerHTML =
            "<p>Couldn’t load the live " + escapeHtml(what) + ". Showing a small offline copy — " +
            "most of the archive is missing.</p>" +
            '<button type="button" class="btn" id="data-degraded-retry">Try again</button>';
        host.parentNode.insertBefore(notice, host);
        const retry = notice.querySelector("#data-degraded-retry");
        if (retry) retry.addEventListener("click", () => location.reload());
    }

    Promise.all([roomsReq, eventsReq]).then(async ([rooms, events]) => {
        ROOMS = rooms;
        EVENTS = events;
        showDegradedNotice();

        // Exactly the images the cards will ask for, deduplicated — normalize
        // is what decides a card's thumbnail, and rowThumbUrl is the request
        // the row will actually make, so going through both is the only way
        // to be sure the preload and the render want the same files.
        const thumbs = [...new Set([
            ...rooms.map(r => normalize(r, false).thumb),
            ...events.map(e => normalize(e, true).thumb)
        ].filter(Boolean).map(rowThumbUrl))];
        drawLoader();

        dataLoaded = true;
        lastStatusSignature = eventStatusSignature();
        render();
        openFromHash();

        await preloadThumbs(thumbs);
        hideLoader();
    }).catch(() => {
        // Api's own reads fall back rather than reject, so reaching this is
        // something unexpected — but the empty grid it leaves behind must
        // still say so rather than sitting on "still loading" forever.
        loadFailed = true;
        hideLoader();
        render();
    });
});

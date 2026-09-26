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
    /* The two sort options whose wording depends on what is being browsed.
       The markup carries the maze wording, which is the right default — the
       archive opens on Mazes — and updateChrome swaps them for the events
       one. Held as a table rather than as two lookups so the pairs sit
       beside each other and cannot drift apart. */
    const sortLabelOptions = [
        { opt: sortSelect.querySelector('option[value="name"]'), maze: "Sort by: Maze Name", event: "Sort by: Event Name" },
        { opt: sortSelect.querySelector('option[value="owner"]'), maze: "Sort by: Maze Owner", event: "Sort by: Event Host" }
    ].filter(o => o.opt);
    const emptyEl = document.getElementById("featured-empty");
    const topNavBtns = document.querySelectorAll("#top-nav .chrome-nav-btn");
    const subNavEl = document.getElementById("sub-nav");
    const subNavBtns = document.querySelectorAll("#sub-nav .chrome-nav-btn");
    const eventsArchiveNote = document.getElementById("events-archive-note");
    const featuredMazesBtn = document.getElementById("featured-mazes-btn");
    const whatsNewBtn = document.getElementById("whats-new-btn");
    const timelineBtn = document.getElementById("timeline-btn");
    const furniBtn = document.getElementById("furni-btn");
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
    /* Browsing the archive by furni rather than by maze. What this leads to
       is furniFilter's listing, which predates it — this is only the way in.
       Cleared by the same top-nav and sub-nav clicks the other two are. */
    let showFurni = false;
    /* A search carried in the address (?q=), so a filtered list is a link
       somebody can send. Read once, before the first render; kept in step
       from then on by syncSearchToUrl. */
    try {
        const fromUrl = new URLSearchParams(location.search).get("q");
        if (fromUrl) {
            query = fromUrl.slice(0, 200);
            searchInput.value = query;
        }
    } catch (e) { /* no search in the address, or one that will not parse */ }
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
    //
    // The raw record rides along on the result, non-enumerable so that no
    // spread, Object.keys or JSON of a normalized record ever sees it, purely
    // so searchHaystack can key its cache on something that outlives one
    // render — see the comment above that function.
    function normalize(item, isEvents) {
        const n = normalizeShape(item, isEvents);
        if (item && typeof item === "object") Object.defineProperty(n, "_raw", { value: item });
        return n;
    }

    function normalizeShape(item, isEvents) {
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

    /* Everything a record actually says about itself, as one lower-cased
       string, worked out once per record and kept.

       The search used to read three fields — name, "by <builder>", and the
       tags — which is a search of the archive's LABELS rather than of the
       archive. Everything a maze is actually about lived in prose nobody
       could search: the description, the longer details, and the furni the
       scan found in its rooms. Somebody who remembered a maze had a piano
       in it, or was "the one with the aquarium corridor", had no way to ask.

       So the haystack is the whole record. The furni is the part that earns
       this most — five hundred room images were scanned piece by piece and
       the result was reachable only by opening a maze and reading down a
       strip. Now "bonsai" finds the mazes with a bonsai in them.

       Cached, because matchesQuery runs once per record per keystroke and
       the furni map alone is a few hundred entries: building this string
       fresh each time turned typing into a stutter.

       THE CACHE USED TO LIVE ON THE NORMALIZED RECORD, which did nothing.
       render() normalizes every record afresh on every call — every
       keystroke — so each one arrived with an empty _haystack and the furni
       was flattened again anyway, and an empty result then did it again for
       the other kind in the empty state. So it is keyed on the RAW record now,
       which is the object that actually persists between keystrokes, in a
       WeakMap that is thrown away whole whenever the archive reloads (see
       where ROOMS and EVENTS are assigned) so an edited maze cannot keep an
       old haystack.

       The status label is left out of the cached part and added each time:
       an event's label ("Live", "Upcoming", "Past") moves with the clock
       while its raw record does not, and it is one short string. */
    let haystackCache = new WeakMap();
    function searchHaystack(n) {
        if (n._haystack !== undefined) return n._haystack;
        const raw = n._raw;
        let base = raw ? haystackCache.get(raw) : undefined;
        if (base === undefined) {
            base = staticHaystack(n);
            if (raw) haystackCache.set(raw, base);
        }
        n._haystack = base + " \u0000 " + String(n.statusLabel || "").toLowerCase();
        return n._haystack;
    }

    function staticHaystack(n) {
        const parts = [
            n.name,
            n.subtitle,
            n.description,
            n.details,
            ...(n.tags || []),
            n.difficulty
        ];
        /* The furni is stored keyed by the gallery image it was found in,
           so the same piece appears once per room it stands in — flattened
           and de-duplicated, or a maze with a dozen rooms of the same tile
           would carry it a dozen times for nothing.

           A scanned image is a record — { items: [...] } — rather than a
           bare list, so that an image which found nothing can still say it
           was scanned; a plain array is what anything added by hand looks
           like. Both shapes are unwrapped exactly as renderFurniStrip
           unwraps them, and hidden pieces are skipped for the same reason
           it skips them: they exist precisely so they do not reach the
           site, and a maze should not be findable by a piece a person
           deliberately took off it. */
        const furni = n.furni && typeof n.furni === "object" ? n.furni : null;
        if (furni) {
            const seen = new Set();
            for (const key of Object.keys(furni)) {
                const record = furni[key];
                const items = Array.isArray(record) ? record : (record && record.items) || [];
                for (const piece of items) {
                    if (!piece || piece.hidden) continue;
                    const label = piece.name;
                    if (label && !seen.has(label)) { seen.add(label); parts.push(label); }
                }
            }
        }
        return parts.filter(Boolean).join(" \u0000 ").toLowerCase();
    }

    /* ---------- the search, with filters in it ----------

       The box takes plain words the way it always has, and ALSO a handful
       of named filters, written the way a lot of sites have taught people to
       write them:

           by:ChrisYepYep   tag:illusion   hotel:es   diff:hard
           furni:throne     year:2025      -collab    "aquarium corridor"

       A word with a minus in front excludes; quotes keep a phrase together;
       any of the named filters can be negated too (-tag:collab). Words that
       are not filters still search the whole record, exactly as before.

       The filters live IN THE BOX rather than in a separate row of controls,
       and that is the design rather than a shortcut. Clicking a tag, a
       difficulty, a hotel or a builder's name in a maze's window writes the
       filter into the box (see applyFilterChip), so the thing you clicked is
       visible, editable and deletable in the place you already search — and
       the syntax teaches itself the first time anybody clicks a tag. The
       address carries the box (?q=, see syncSearchToUrl), so a filtered list
       is a link you can send.

       Parsed once per distinct query string, not per record per keystroke. */
    const SEARCH_KEYS = {
        by: "by", builder: "by", host: "by", owner: "by",
        tag: "tag", tags: "tag",
        hotel: "hotel",
        diff: "diff", difficulty: "diff",
        furni: "furni",
        year: "year"
    };

    let parsedFor = null;
    let parsedSearch = null;

    function parseSearch(raw) {
        if (raw === parsedFor) return parsedSearch;
        const out = { words: [], not: [], keys: [], notKeys: [] };
        const re = /(-?)(?:([a-z]+):)?(?:"([^"]*)"?|(\S+))/gi;
        let m;
        while ((m = re.exec(raw)) !== null) {
            if (!m[0]) { re.lastIndex++; continue; }
            const neg = m[1] === "-";
            const rawKey = m[2] ? m[2].toLowerCase() : "";
            const value = (m[3] !== undefined ? m[3] : m[4] || "").trim().toLowerCase();
            const key = SEARCH_KEYS[rawKey];
            if (rawKey && !key) {
                // "foo:bar" with a key nobody knows is just a word with a
                // colon in it — a maze could be called that.
                const word = `${rawKey}:${value}`;
                (neg ? out.not : out.words).push(word);
                continue;
            }
            if (!value) continue;
            if (key) (neg ? out.notKeys : out.keys).push({ key, value });
            else (neg ? out.not : out.words).push(value);
        }
        parsedFor = raw;
        parsedSearch = out;
        return out;
    }

    // Difficulty accepts its label as well as its key: "very hard",
    // "very-hard" and "veryhard" all mean the same thing to somebody typing.
    function diffKey(v) {
        return String(v || "").toLowerCase().replace(/[\s_]+/g, "-");
    }

    // The furni names alone, for furni:. Cached against the raw record the
    // same way the haystack is, and dropped with it when the archive reloads.
    let furniNameCache = new WeakMap();
    function furniNamesOf(n) {
        const raw = n._raw;
        if (raw && furniNameCache.has(raw)) return furniNameCache.get(raw);
        const names = [];
        const furni = n.furni && typeof n.furni === "object" ? n.furni : null;
        if (furni) {
            for (const key of Object.keys(furni)) {
                const record = furni[key];
                const items = Array.isArray(record) ? record : (record && record.items) || [];
                for (const piece of items) {
                    if (piece && !piece.hidden && piece.name) names.push(String(piece.name).toLowerCase());
                }
            }
        }
        if (raw) furniNameCache.set(raw, names);
        return names;
    }

    function keyMatches(n, { key, value }) {
        switch (key) {
            case "by":
                // Collabs list several builders in one field; any of them counts.
                return String(n.owner || "").toLowerCase().split(",").some(b => b.trim().includes(value));
            case "tag":
                return (n.tags || []).some(t => String(t).toLowerCase().includes(value));
            case "hotel":
                return String(n.hotel || "").toLowerCase() === value;
            case "diff":
                return diffKey(n.difficulty) === diffKey(value)
                    || diffKey(DIFFICULTY_LABELS[n.difficulty]) === diffKey(value);
            case "furni":
                return furniNamesOf(n).some(name => name.includes(value));
            case "year":
                return String(n.dateValue || "").slice(0, 4) === value;
            default:
                return true;
        }
    }

    function matchesQuery(n) {
        const raw = query.trim();
        if (!raw) return true;
        const s = parseSearch(raw);
        const hay = searchHaystack(n);
        for (const w of s.words) if (!hay.includes(w)) return false;
        for (const w of s.not) if (hay.includes(w)) return false;
        for (const k of s.keys) if (!keyMatches(n, k)) return false;
        for (const k of s.notKeys) if (keyMatches(n, k)) return false;
        return true;
    }

    /* A filter token for the box, quoted when the value has a space in it
       ("very hard", a tag like "FURNI MAZE") so it survives being parsed
       back out. */
    function filterToken(key, value) {
        const v = String(value || "").trim();
        return /\s/.test(v) ? `${key}:"${v}"` : `${key}:${v}`;
    }

    /* The box's text with one filter set: any earlier filter of the SAME kind
       is replaced rather than stacked, because clicking "Hard" after "Easy"
       means "show me hard ones now", not "show me mazes that are both". */
    function withFilter(text, key, value) {
        const kept = [];
        const re = /(-?)(?:([a-z]+):)?(?:"([^"]*)"?|(\S+))/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
            if (!m[0]) { re.lastIndex++; continue; }
            const k = m[2] ? SEARCH_KEYS[m[2].toLowerCase()] : null;
            if (k === key && m[1] !== "-") continue;
            kept.push(m[0]);
        }
        kept.push(filterToken(key, value));
        return kept.join(" ");
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

    /* A stored value that is about to become part of a class name.

       Escaping alone is not enough there: an escaped value cannot break out
       of the attribute, but it can still carry a space and so add classes of
       its own choosing, and a maze's status is written into the class list
       straight from the record. The status and difficulty values the site
       actually uses are all lower-case words and hyphens, so anything else is
       reduced to that rather than rejected — "Very Hard" still styles as
       something, it just cannot smuggle anything in. */
    function cssToken(str) {
        return String(str == null ? "" : str).toLowerCase().replace(/[^a-z0-9-]/g, "");
    }

    /* A stored address that is about to become a link someone clicks.

       Only http and https go through. Escaping keeps a URL inside its
       attribute, but "javascript:..." is a perfectly well-formed attribute
       value and runs when clicked — and every link this is used for comes
       from the database (a maze's Habbo link, an article's source, a furni's
       catalogue page), which is not somewhere a script should be able to
       live. Returns "" for anything else, and every caller hides its link
       when it gets "", so a bad address reads as no address rather than as
       a link that does something unexpected. */
    function safeHttpUrl(str) {
        const raw = String(str == null ? "" : str).trim();
        if (!raw) return "";
        try {
            const url = new URL(raw, location.href);
            return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
        } catch (e) {
            return "";
        }
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
            ? `<span class="tag difficulty-${cssToken(n.difficulty)}">${escapeHtml(DIFFICULTY_LABELS[n.difficulty] || n.difficulty)}</span>`
            : "";
        return difficultyHtml + (n.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    }

    /* The same chips as tagsHtml, in a maze's window, as BUTTONS: each one
       lists everything else that shares it. The row cards keep the plain
       spans — the whole card is already one button there, and a button
       inside a button is neither valid nor something a thumb can aim at.

       Followed by a "More by" chip per builder. The builder card above hides
       the plain "by" line whenever it resolves, so the names are otherwise
       not something you can press anywhere in the window. */
    function modalFilterChipsHtml(n) {
        const chip = (key, value, label, cls, title) =>
            `<button type="button" class="tag tag-filter${cls ? " " + cls : ""}" data-filter-key="${key}" data-filter-value="${escapeHtml(value)}" title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
        const kind = n.isEvent ? "event" : "maze";
        const diffLabel = DIFFICULTY_LABELS[n.difficulty] || n.difficulty;
        const parts = [];
        if (n.difficulty) {
            parts.push(chip("diff", diffLabel, diffLabel, `difficulty-${cssToken(n.difficulty)}`, `Every ${String(diffLabel).toLowerCase()} ${kind}`));
        }
        (n.tags || []).forEach(t => parts.push(chip("tag", t, t, "", `Everything tagged ${t}`)));
        creatorNames(n.owner)
            .filter(name => othersBy(n, name) > 0)
            .forEach(name => parts.push(chip("by", name, `More by ${name}`, "tag-by", `Everything by ${name}`)));
        return parts.join("");
    }

    /* How many OTHER mazes (or events, for an event) carry this builder's
       name, matched the way the "by" filter matches them (keyMatches), so a
       chip is only offered when pressing it would find something. A builder
       with one maze in the archive had a "More by" chip that led back to the
       very maze it was pressed in. */
    function othersBy(n, name) {
        const value = String(name).toLowerCase();
        const pool = n.isEvent ? EVENTS : ROOMS;
        return pool.filter(raw => {
            if (raw.id === n.id) return false;
            const owner = n.isEvent ? raw.host : raw.creator;
            return String(owner || "").toLowerCase().split(",").some(b => b.trim().includes(value));
        }).length;
    }

    /* A chip in a maze's window was pressed: close the window and show the
       archive filtered by it.

       The filter is written into the search box (see withFilter), so what
       was applied is visible and can be edited or deleted like any search.
       The list is put back to the plain archive for the record's own kind —
       out of What's New, the timeline and the furni browser, which each
       draw their own thing and would ignore a filter — and onto the tab
       the record lives in, so the one you came from is in the list you
       land on. */
    function applyFilterChip(key, value, n) {
        const next = withFilter(query.trim(), key, value);
        closeModal();
        showFeatured = false;
        showWhatsNew = false;
        showTimeline = false;
        showFurni = false;
       
        furniFilter = null;
        if (n) {
            if (n.isEvent) {
                topView = "events";
                // Same test sourceItems uses to file an event under a tab.
                const raw = n._raw;
                if (raw) {
                    eventsSub = isUpcomingTabEvent(raw) ? "upcoming" : eventStatus(raw) === "past" ? "past" : "archive";
                    eventsSubTouched = true;
                }
            } else {
                topView = "mazes";
                const tab = MAZE_TAB_OF_STATUS[n.statusKey];
                if (tab) mazesSub = tab;
            }
        }
        searchInput.value = next;
        query = next;
        render();
        const results = document.querySelector(".home-results");
        if (results) results.scrollTop = 0;
    }

    // Which Mazes tab a status is listed under — the mapping sourceItems uses.
    const MAZE_TAB_OF_STATUS = { open: "open", unknown: "open", closed: "archived", collab: "collab" };

    /* The box, in the address bar. replaceState rather than pushState: typing
       is not navigation, and a Back button that stepped through every
       keystroke would be worse than one that ignores them. The hash is left
       alone — it belongs to the maze window (see syncModalHistory). */
    let syncedSearch = null;
    function syncSearchToUrl() {
        const q = query.trim();
        if (q === syncedSearch) return;
        syncedSearch = q;
        try {
            const url = new URL(location.href);
            if (q) url.searchParams.set("q", q);
            else url.searchParams.delete("q");
            const next = url.pathname + url.search + url.hash;
            if (next !== location.pathname + location.search + location.hash) {
                history.replaceState(history.state, "", next);
            }
        } catch (e) { /* an address the URL parser refuses is left as it is */ }
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

    /* Icons for the sub-nav tabs.

       Two of the six have one — OPEN and ARCHIVED, which are doors and so
       get drawn as doors. Collab is not a door, and none of the three events
       tabs has art at all, so the row read as two finished tabs beside four
       unfinished ones rather than as a deliberate pair.

       Off until the other four exist. Everything needed to bring them back
       is still here and still works: the art, the map below, the markup, and
       .chrome-nav-sub-icon's own CSS. Flip this to true and the doors return
       exactly as they were.

       A flag rather than a CSS rule hiding them, so the browser is not asked
       for two PNGs on every page load that nobody will see. */
    const SHOW_SUB_NAV_ICONS = false;

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
            const icon = SHOW_SUB_NAV_ICONS ? SUB_NAV_ICONS[value] : null;
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
        if (furniBtn) {
            // Lit while browsing the furni list AND while looking at the
            // mazes one of them picked out — the filtered listing is still
            // this view, just one step further in.
            const inFurni = showFurni || !!furniFilter;
            furniBtn.classList.toggle("active", inFurni);
            furniBtn.setAttribute("aria-pressed", inFurni ? "true" : "false");
        }
        /* Neither of the cross-archive views takes an ordering from this:
           one is "newest first" by definition and the other is the archive
           in its own order. The search box is left alone — narrowing either
           of them by name is a reasonable thing to want. */
        sortSelect.disabled = showWhatsNew || showTimeline || showFurni || !!furniFilter;
        featuredMazesBtn.classList.toggle("active", showFeatured);
        /* Reshuffles only on the render() that actually flips showFeatured
           to true — the panel opening. This comment used to claim every
           other render while it stays open only follows a nav click that
           closes it, but that was never true: a search keystroke, a status
           tick, a Save, the account arriving — all of them render, and each
           one dealt the visitor a fresh pair of picks while they were
           reading the last. Every other render now re-draws the same picks
           (see renderFeaturedList); the Refresh button is the other way to
           ask for new ones. */
        const featuredOpening = showFeatured && !featuredWasOpen;
        featuredWasOpen = showFeatured;
        renderFeaturedList(featuredOpening);
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

        /* Featured Mazes is about mazes, so it is not offered while the
           Events tab is showing.

           Switching tabs already turned the panel itself off — see the
           topNavBtns handler — but the frame around it stayed, so browsing
           events came with a "Featured Mazes" header and a "Refresh
           recommendations" button sitting above the events list, offering to
           do something to a set of things that were not on screen.

           THIS USED TO HIDE THE WHOLE FRAME, and that took the events with
           it. `.featured-frame` is not a wrapper around the Featured Mazes
           header — it is the wrapper around EVERYTHING, the results list
           included: `.chrome-frame` > `.chrome-body` > `.home-results` >
           `#featured-grid` all sit inside it (see home.html). So `hidden`
           here emptied the window on every Events tab — Upcoming, Past and
           Archive alike — while the rows themselves rendered correctly into
           a grid nobody could see. The header ticker kept showing the next
           event throughout, which is what made it look like a display bug
           rather than a missing list.

           The three featured-only children go instead, by class, so the
           results stay exactly where they are. `display: none` on them takes
           their space with them, so there is no empty band above the list —
           which is the thing hiding the frame was reaching for. */
        if (featuredFrame) featuredFrame.classList.toggle("is-events", isEvents);
        // "Clear filter", on the line over the list, whenever it is narrowed.
        const clearBtn = document.getElementById("clear-filter-btn");
        if (clearBtn) clearBtn.hidden = !(query.trim() || furniFilter);

        // Explains the auto-archiving rule (see eventStatus) at the point it
        // actually matters — sitting in the Archive listing itself, rather
        // than as a note somewhere the visitor has to go looking for.
        if (eventsArchiveNote) {
            eventsArchiveNote.hidden = !(isEvents && !showFeatured && resolvedEventsSub() === "archive");
        }
        difficultySortOptions.forEach(opt => { opt.hidden = isEvents; });

        /* The two options that name what is being sorted say "Maze" in the
           markup, which is wrong while the Events tab is showing: an event
           has a title and a host, not a maze name and a maze owner. The
           difficulty pair above is already hidden here for the same kind of
           reason — this is the rest of that thought.

           Retitled rather than duplicated, so there is still one <select>
           with one set of values and nothing downstream has to know. */
        sortLabelOptions.forEach(({ opt, maze, event }) => {
            opt.textContent = isEvents ? event : maze;
        });
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
    /* ---- WARMING A MAZE'S PICTURES BEFORE IT IS OPENED.

       The loading screen preloads every row's THUMBNAIL, so the archive list
       arrives all at once — but a maze's own pictures were never part of
       that, and could not be: there are 538 of them across 39 mazes, and
       fetching the lot up front would be several megabytes to show a grid.
       So opening a maze fetched its gallery from cold and the strip filled in
       one picture at a time.

       Fetched on INTENT instead. Hovering a row, or tabbing onto it, is a
       reliable signal that it is about to be opened, and by the time the
       click lands the browser has them in cache and the strip is simply
       there. The median maze has nine pictures; this costs nothing for a
       maze nobody opens.

       AFTER A PAUSE, not on the first pixel of hover. Running the mouse down
       the list crosses every row in it, and warming each in turn would fire
       hundreds of requests to show one maze. A short dwell is the difference
       between "moving past this" and "looking at this".

       Only the first few thumbnails: the strip shows about eight at a time
       and scrolls, so the rest can arrive lazily as they always did. The
       large image is warmed too — it is the one the modal shows immediately,
       and at 900px it is the slowest single thing in there. */
    const WARM_THUMBS = 12;
    const WARM_DWELL_MS = 120;
    const warmedGalleries = new Set();

    /* How many strip thumbnails are loaded eagerly when a modal opens.
       Declared here beside WARM_THUMBS so the two stay in step — what is
       warmed on hover should cover what is asked for on open. */
    const STRIP_EAGER = 10;

    /* Fetch one image and, if the browser will, decode it too.

       .src alone gets the bytes into the HTTP cache, which is most of the
       win but not all of it: the picture still has to be turned into a
       bitmap, and for a 900px screenshot that is real work on the main
       thread at exactly the moment the modal is trying to animate open.
       decode() moves it off that moment. Everything is optional — the
       promise rejects if the image is replaced or the format is refused,
       and a warm that fails is simply a warm that did not happen, so it is
       swallowed rather than surfaced. */
    function warmImage(url) {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        if (img.decode) img.decode().catch(() => {});
    }

    function warmGallery(n) {
        if (!n || !imgCdn) return;
        const key = n.id || n.name;
        if (!key || warmedGalleries.has(key)) return;
        warmedGalleries.add(key);

        // The same order, and the same three sources, openModal builds its
        // combinedGallery from — so these are the exact URLs it will ask for.
        const images = [
            ...(n.entrance && n.entrance.image ? [n.entrance.image] : []),
            ...((n.gallery || []).map(g => g && g.image).filter(Boolean)),
            ...(n.finish && n.finish.image ? [n.finish.image] : [])
        ];
        if (!images.length) return;

        warmImage(imgCdn(images[0], 900, null, 78));
        images.slice(0, WARM_THUMBS).forEach(src => {
            warmImage(imgCdn(src, 110, 110, 55));
        });
    }

    function wireRowActivation(container, items) {
        container.querySelectorAll(".chrome-list-row").forEach((row, i) => {
            row.addEventListener("click", () => openModal(items[i]));
            row.addEventListener("keydown", e => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault(); // stops Space from also scrolling the page
                openModal(items[i]);
            });

            let dwell = 0;
            const startWarm = () => {
                clearTimeout(dwell);
                dwell = setTimeout(() => warmGallery(items[i]), WARM_DWELL_MS);
            };
            const stopWarm = () => clearTimeout(dwell);

            row.addEventListener("pointerenter", startWarm, { passive: true });
            row.addEventListener("pointerleave", stopWarm, { passive: true });
            // Keyboard and touch get it without the dwell: arriving on a row
            // by either is already a deliberate act, not a mouse passing over.
            row.addEventListener("focus", () => warmGallery(items[i]));
            row.addEventListener("touchstart", () => warmGallery(items[i]), { passive: true });
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
           Goldfish is 60% wider than a normal one (see the Alt Codes window,
           js/glyphs.js), so a date
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

    /* ---------- the ticks, when there is an account to hang them on ----

       Signed out this whole section does nothing and the ticks live in
       localStorage exactly as they always have. Signed in they are kept
       against the account too, so the list you are finishing is the same
       list on your phone.

       The device is never the loser in a disagreement. On sign-in the two
       sets are UNIONED rather than one replacing the other: a tick made
       here before signing in survives, and so does one made on a machine
       this browser has never seen. That is only safe because a walked list
       is a set — there is no "which is newer" to get wrong.

       TWO BOOKS ARE KEPT BESIDE EACH LIST, both in localStorage because a
       sign-in outlives the tab:

       - PENDING: ids ticked on this device (signed in or out) that the
         account has not yet confirmed holding. Only these are ever pushed.
         Each device used to PUT its WHOLE list, so a device that had not
         heard about an un-tick made elsewhere put the maze straight back
         (the server unions). An id leaves this book once a server reply
         includes it.

       - FROM ACCOUNT: ids that are in the local list only because the
         account's copy was merged in. On sign-out (or any answer of
         "nobody", which also covers an expired session) exactly these are
         taken back out. They used to stay, so the next person to sign in
         on the same browser uploaded the previous account's ticks as their
         own. Stripping only this book, rather than restoring a snapshot,
         is what guarantees a signed-out visitor's own ticks are never
         lost: a hand-made tick is never in it, and ticking an id by hand
         takes it out. It also lets an un-tick made on another device reach
         this one: an id that came from the account and is no longer on it
         is dropped here too.

       Upgrading from before these books: with no pending book on record,
       every local id not known to be the account's is treated as pending
       once. That is the old behaviour, one last time, so nobody's
       unsynced ticks are stranded by the change. */
    const TICK_LISTS = ["walked", "saved"];
    const PENDING_KEY = { walked: "mazerats_walked_pending", saved: "mazerats_saved_pending" };
    const ACCOUNT_KEY = { walked: "mazerats_walked_account", saved: "mazerats_saved_account" };
    const pendingTicks = { walked: new Set(), saved: new Set() };
    const accountTicks = { walked: new Set(), saved: new Set() };

    function tickSet(list) { return list === "walked" ? walkedIds : savedIds; }
    function persistTickSet(list) { if (list === "walked") saveWalked(); else persistSaved(); }

    function readIdSet(key) {
        try {
            const raw = localStorage.getItem(key);
            if (raw == null) return null;
            const list = JSON.parse(raw);
            return new Set(Array.isArray(list) ? list.filter(id => typeof id === "string") : []);
        } catch (e) { return null; }
    }
    function writeIdSet(key, set) {
        try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) { /* private mode */ }
    }
    function persistBooks(list) {
        writeIdSet(PENDING_KEY[list], pendingTicks[list]);
        writeIdSet(ACCOUNT_KEY[list], accountTicks[list]);
    }

    // After loadWalked and loadSaved, which it reads.
    function loadTickBooks() {
        TICK_LISTS.forEach(list => {
            accountTicks[list] = readIdSet(ACCOUNT_KEY[list]) || new Set();
            const stored = readIdSet(PENDING_KEY[list]);
            if (stored) {
                pendingTicks[list] = stored;
            } else {
                pendingTicks[list] = new Set([...tickSet(list)].filter(id => !accountTicks[list].has(id)));
                persistBooks(list);
            }
        });
    }

    // A tick or un-tick made by hand on this device.
    function noteTick(list, id, on) {
        accountTicks[list].delete(id);
        if (on) pendingTicks[list].add(id);
        else pendingTicks[list].delete(id);
        persistBooks(list);
        if (window.Account && Account.current) {
            if (on) Account.saveState({ [list]: [...pendingTicks[list]] });
            else if (list === "walked") Account.forgetWalked(id);
            else Account.forgetSaved(id);
        }
    }

    // A server reply that holds an id confirms it: it is no longer pending.
    function confirmTicks(state) {
        if (!state) return;
        TICK_LISTS.forEach(list => {
            const server = new Set(Array.isArray(state[list]) ? state[list] : []);
            let changed = false;
            pendingTicks[list].forEach(id => { if (server.has(id)) { pendingTicks[list].delete(id); changed = true; } });
            if (changed) persistBooks(list);
        });
    }

    function syncWalked() {
        if (!window.Account || !Account.current) return;
        Account.fetchState().then(state => {
            if (!state) return;
            let anyChange = false;
            const patch = {};

            TICK_LISTS.forEach(list => {
                const local = tickSet(list);
                const server = new Set(Array.isArray(state[list]) ? state[list] : []);
                let changed = false;
                // Taken off the account elsewhere: leaves here too, if this
                // device only had it from the account in the first place.
                accountTicks[list].forEach(id => {
                    if (!server.has(id)) { accountTicks[list].delete(id); local.delete(id); changed = true; }
                });
                server.forEach(id => {
                    if (!local.has(id)) { local.add(id); accountTicks[list].add(id); changed = true; }
                });
                pendingTicks[list].forEach(id => { if (server.has(id)) pendingTicks[list].delete(id); });
                /* Only what was ticked HERE and the account has not seen goes
                   up, so a device that is merely up to date (or out of date)
                   stays quiet. */
                if (pendingTicks[list].size) patch[list] = [...pendingTicks[list]];
                persistBooks(list);
                if (changed) { persistTickSet(list); anyChange = true; }
            });

            if (Object.keys(patch).length) Account.saveState(patch);
            if (anyChange) {
                render();
                updateWalkedCount();
            }
        });
    }

    // Nobody signed in (a sign-out, or a session that has lapsed): the
    // account's ticks leave this browser; the visitor's own stay.
    function dropAccountTicks() {
        let anyChange = false;
        TICK_LISTS.forEach(list => {
            if (!accountTicks[list].size) return;
            const local = tickSet(list);
            accountTicks[list].forEach(id => local.delete(id));
            accountTicks[list].clear();
            persistBooks(list);
            persistTickSet(list);
            anyChange = true;
        });
        if (anyChange) {
            render();
            updateWalkedCount();
        }
    }

    function onAccountAnswer(me) {
        if (me) syncWalked();
        else dropAccountTicks();
    }

    function isWalked(id) {
        return !!id && walkedIds.has(id);
    }

    function setWalked(id, walked) {
        if (!id) return;
        if (walked) walkedIds.add(id);
        else walkedIds.delete(id);
        saveWalked();
        /* And onto the account, if there is one. Removal is its own call
           because the save unions rather than replaces — see forgetWalked
           in js/account.js for why that has to be true. Only the pending
           ticks are sent, not the whole list: see noteTick above. */
        noteTick("walked", id, walked);
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
    /* A hallway is not a maze. It is the corridor that joins them — there is
       nothing in it to solve, so it cannot be completed, and counting it
       among the mazes makes every total slightly wrong and the walked tally
       permanently unreachable by one.

       Read off the tag rather than a separate field, because the tag is
       already how the archive says what a room is, and matched
       case-insensitively so "Hallway", "hallway" and "HALLWAY" all count. */
    const HALLWAY_TAG = "hallway";

    function isHallway(record) {
        return (record && Array.isArray(record.tags) ? record.tags : [])
            .some(t => String(t).trim().toLowerCase() === HALLWAY_TAG);
    }

    function walkableRooms() {
        return ROOMS.filter(r =>
            (r.status === "open" || r.status === "unknown") && !isHallway(r));
    }

    function updateWalkedCount() {
        const el = document.getElementById("walked-count");
        if (!el) return;
        /* Only over the maze listings. It counts mazes, so it has no
           business above a list of events, above What's New (which is both
           kinds at once) or above the timeline (which is the whole archive
           in order) — in any of those it would be a tally of something the
           list on screen is not about. */
        /* Neither furni view either. The browser is a list of PIECES, so a
           tally of mazes over it is a count of something that is not on
           screen; and the filtered listing that a piece hands over to is a
           handful of mazes, over which "3 of 28 completed" is a figure
           about the whole archive floating above a list that is not it. */
        const appliesHere = topView === "mazes"
            && !showWhatsNew && !showTimeline && !showFurni && !furniFilter;
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
        // No Completed on an event, and none on a hallway either: there is
        // nothing in a corridor to have finished.
        if (n.isEvent || !n.id || isHallway(n)) return "";
        const walked = isWalked(n.id);
        return `<button type="button" class="walked-toggle${walked ? " is-walked" : ""}" ` +
            `data-walked-id="${escapeHtml(n.id)}" aria-pressed="${walked ? "true" : "false"}" ` +
            `title="${walked ? "Completed. Click to unmark." : "Mark this as completed"}" ` +
            `data-track="walked-toggle" data-track-label="${escapeHtml(n.id)}">` +
            `<span class="walked-toggle-tick" aria-hidden="true"></span>` +
            `<span class="walked-toggle-label">${walked ? "Completed" : "Completed?"}</span>` +
            `</button>`;
    }

    /* ---------- the other list: ones to go and walk ----------

       Walked answers "have I done this"; saved answers "I mean to". They
       are separate lists rather than two states of one, because a maze you
       have walked and would happily walk again is both, and a control that
       made you choose would be answering a question nobody asked.

       Same shape as walked throughout — a set in localStorage, unioned onto
       the account when there is one — so there is one pattern here rather
       than two. */
    const SAVED_KEY = "mazerats_saved";
    let savedIds = new Set();

    function loadSaved() {
        try {
            const raw = localStorage.getItem(SAVED_KEY);
            const list = raw ? JSON.parse(raw) : [];
            savedIds = new Set(Array.isArray(list) ? list.filter(id => typeof id === "string") : []);
        } catch (e) {
            savedIds = new Set();
        }
    }

    function persistSaved() {
        try {
            localStorage.setItem(SAVED_KEY, JSON.stringify([...savedIds]));
        } catch (e) { /* private mode — the list is the loss, not the archive */ }
    }

    function isSaved(id) {
        return !!id && savedIds.has(id);
    }

    function setSaved(id, saved) {
        if (!id) return;
        if (saved) savedIds.add(id);
        else savedIds.delete(id);
        persistSaved();
        noteTick("saved", id, saved);
        document.querySelectorAll(`.saved-toggle[data-saved-id="${CSS.escape(id)}"]`)
            .forEach(btn => paintSavedToggle(btn, saved));
        if (saved) tellWhereSavedGo();
    }

    /* ---------- the one thing Save never said ----------

       Where the maze went.

       Pressing Save turned a button into "Saved" and that was the whole of
       the feedback. It is honest and it is useless: it confirms the press,
       which the reader already knew about, and says nothing about the list
       they have just joined. The list does exist — Your Progress, under "Saved
       to complete" — but it is behind the burger, under two other headings,
       and nothing on the way to it mentions saving. So the reasonable
       conclusion from the button alone is that Save is a bookmark that goes
       nowhere, which is exactly what it looked like.

       ONCE PER BROWSER, not once per save. The question "where did that go"
       is asked the first time and never again, and a note that reappears on
       every save is a note somebody is dismissing rather than reading by the
       third maze. The flag is written once the note is actually in the page
       rather than when it is dismissed, so a reader who navigates away
       mid-toast has still been told — but no earlier than that. It used to
       be written first thing, before the note existed, and the note was
       then drawn underneath the room modal (see .saved-note's z-index), so
       the one showing it ever got was spent where nobody could see it.

       It OFFERS THE PLACE rather than just naming it. Saying "find it under
       Your Progress" leaves the reader to go and find Your Progress; a
       button that opens it turns the answer into the thing itself, which is
       the difference between an explanation and a way through.

       No counter anywhere. A number beside Save would be a second thing to
       keep in step with two lists that already disagree by design — a maze
       both saved and walked is on one and not the other — and the menu row
       already carries "· N saved" for anyone who wants the figure. */
    const SAVED_TOLD_KEY = "mazerats_saved_told";

    function tellWhereSavedGo() {
        try {
            if (localStorage.getItem(SAVED_TOLD_KEY)) return;
        } catch (e) {
            /* Private mode: nothing can be remembered, so this would show on
               every single save. Better to say it never than to nag. */
            return;
        }

        // One at a time, in case a second save lands while the first is up.
        const existing = document.getElementById("saved-note");
        if (existing) existing.remove();

        const note = document.createElement("div");
        note.className = "saved-note";
        note.id = "saved-note";
        // polite rather than assertive: it is a courtesy, and it must not cut
        // across whatever a screen reader is in the middle of saying.
        note.setAttribute("role", "status");
        note.setAttribute("aria-live", "polite");
        note.innerHTML = `
            <p class="saved-note-text">Saved. It is waiting for you in
                <strong>Your Progress</strong>, under &ldquo;Saved to complete&rdquo;.</p>
            <div class="saved-note-actions">
                <button type="button" class="saved-note-go">Take me there</button>
                <button type="button" class="saved-note-close" aria-label="Dismiss">Got it</button>
            </div>`;
        document.body.appendChild(note);
        // Now it has been shown, and only now does it count as told.
        try { localStorage.setItem(SAVED_TOLD_KEY, "1"); } catch (e) { /* private mode */ }

        let timer = null;
        const close = () => {
            clearTimeout(timer);
            note.classList.add("is-out");
            // Removed on a timer rather than on animationend: the event does
            // not arrive at all when animations are off, and a note that
            // cannot leave is worse than one that leaves unanimated.
            setTimeout(() => note.remove(), 240);
        };

        note.querySelector(".saved-note-close").addEventListener("click", close);
        /* The room modal goes first. Save is pressed inside it, so it is
           almost always open when this is, and Your Progress opening
           underneath it (both are .modal-overlay windows at the same layer,
           and the room modal comes later in the page) was a button that
           appeared to do nothing. closeModal is a no-op when it is shut. */
        note.querySelector(".saved-note-go").addEventListener("click", () => {
            close();
            closeModal({ keepFocus: true });
            openProgress();
        });

        /* Long, and deliberately so. This is two lines of prose with a
           choice at the end of it, not a "Link copied" — the reader has to
           finish reading before the offer means anything, and a toast that
           leaves while somebody is still deciding has wasted the one showing
           it gets. Hovering or tabbing into it stops the clock entirely. */
        const HOLD = 9000;
        const start = () => { clearTimeout(timer); timer = setTimeout(close, HOLD); };
        note.addEventListener("pointerenter", () => clearTimeout(timer));
        note.addEventListener("pointerleave", start);
        note.addEventListener("focusin", () => clearTimeout(timer));
        note.addEventListener("focusout", start);

        /* It arrives on a CSS animation attached to the class itself, so
           there is no "add a class next frame" dance here and nothing to go
           wrong if that frame is slow to come. The only thing script does
           about the animation is take it away again. */
        start();
    }

    function paintSavedToggle(btn, saved) {
        btn.classList.toggle("is-saved", saved);
        btn.setAttribute("aria-pressed", saved ? "true" : "false");
        btn.title = saved ? "On your list. Click to remove." : "Save this to complete later";
        const label = btn.querySelector(".saved-toggle-label");
        if (label) label.textContent = saved ? "Saved" : "Save";
    }

    function savedToggleHtml(n) {
        // Same exclusions as Completed, and for the same reason: if there is
        // nothing in a hallway to finish, there is nothing to save it for.
        if (n.isEvent || !n.id || isHallway(n)) return "";
        const saved = isSaved(n.id);
        return `<button type="button" class="saved-toggle${saved ? " is-saved" : ""}" ` +
            `data-saved-id="${escapeHtml(n.id)}" aria-pressed="${saved ? "true" : "false"}" ` +
            `title="${saved ? "On your list. Click to remove." : "Save this to complete later"}" ` +
            `data-track="saved-toggle" data-track-label="${escapeHtml(n.id)}">` +
            `<span class="saved-toggle-mark" aria-hidden="true"></span>` +
            `<span class="saved-toggle-label">${saved ? "Saved" : "Save"}</span>` +
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
        const walkBtn = e.target.closest(".walked-toggle");
        if (walkBtn) {
            e.stopPropagation();
            e.preventDefault();
            const id = walkBtn.dataset.walkedId;
            setWalked(id, !isWalked(id));
            return;
        }
        // The save toggle sits inside the same row and needs the same
        // rescue from it.
        const saveBtn = e.target.closest(".saved-toggle");
        if (saveBtn) {
            e.stopPropagation();
            e.preventDefault();
            const id = saveBtn.dataset.savedId;
            setSaved(id, !isSaved(id));
        }
    }, true);

    // Keyboard rows activate on Enter/Space too (see wireRowActivation), and
    // the same press would otherwise both tick the maze and open it.
    document.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (!e.target.closest) return;
        if (!e.target.closest(".walked-toggle") && !e.target.closest(".saved-toggle")) return;
        e.stopPropagation();
    }, true);

    loadWalked();
    loadSaved();
    loadTickBooks();

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

    /* What the thumbnail is a picture OF, in words.

       This is for search engines rather than for screen readers, and the
       distinction is the whole reason it is safe to add. The row around this
       image is role="button" with its own aria-label, and an aria-label
       replaces everything inside the element it sits on — so assistive
       technology still announces "View Alt Maze, button" exactly as before
       and never reads this twice. What changes is what an image crawler
       sees: five hundred room screenshots that said nothing about
       themselves now say which maze they are from and who built it, which
       is the only description of them that exists anywhere.

       The builder is included where there is one, because "Alt Maze" and
       "Alt Maze by markeh" are differently useful in an image search, and
       the second costs nothing. */
    function rowThumbAlt(n) {
        const name = (n.name || "").trim();
        const kind = n.isEvent ? "event" : "maze room";
        if (!name) return `A ${kind} from the Origins Maze Rats archive`;
        /* `owner`, not `creator`. These rows are handed the normalised shape
           built by normalize(), which keeps the builder under `owner` and
           spends `creator` on the way in — reading the wrong one here would
           not have thrown, it would just have quietly dropped the
           attribution from every one of them. */
        const by = (n.owner || "").trim();
        return by ? `${name} — a ${kind} by ${by}` : `${name} — a ${kind}`;
    }

    function roomRowHtml(n, isOpenView) {
        // Events always show their date; mazes only do on the Open list.
        const showDate = isOpenView || n.isEvent;

        return `
            <div class="chrome-list-row featured" data-difficulty="${cssToken(n.difficulty)}" tabindex="0" role="button" aria-label="View ${escapeHtml(n.name || "maze")}" data-track="${n.dateFieldLabel === "Date" ? "event-open" : "maze-open"}" data-track-label="${escapeHtml(n.name || "")}">
                <div class="row-thumb">
                    ${n.thumb ? `<div class="row-thumb-crop"><img class="row-thumb-img" src="${rowThumbUrl(n.thumb)}" alt="${escapeHtml(rowThumbAlt(n))}" loading="lazy"></div>` : ""}
                </div>
                <div class="row-info">
                    ${whatsNewDatesHtml(n)}
                    ${ecTitleHtml(n)}
                    <p class="row-creator">${escapeHtml(n.subtitle || "")}${showDate ? rowDateHtml(n) : ""}</p>
                    ${isOpenView ? "" : `<p class="row-desc">${escapeHtml(n.description || "")}</p>`}
                    <div class="row-tags">${tagsHtml(n)}</div>
                </div>
                <div class="row-side">
                    <span class="status-badge status-${cssToken(n.statusKey)}">${escapeHtml(n.statusLabel || "")}</span>
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
       the ones that have been here longest anyway.

       The log is not truncated. It used to keep the twelve most recent, and
       twelve turned out to be about one afternoon's work: a session that
       touched a dozen mazes filled every slot, and the log answered "what
       has changed lately" with "everything that changed yesterday" — with
       nothing on screen admitting there was a thirteenth thing. A log that
       silently ends is worse than a long one, and this one is bounded by
       the archive itself, which is fifty-odd records grouped under a
       handful of day headings. */

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

    /* Guides, in the same log as the archive (see js/guides.js and
       netlify/functions/guides.js). A guide is "added" on the day it was
       first published and "updated" on a later day's edit, the same rule a
       maze follows; drafts never appear. Built in the log's own shape, with
       its search text ready-made, because normalize() is for archive records
       and a guide has none of their fields. */
    function guideLogItems() {
        const list = window.Guides && Guides.loaded() ? Guides.list() : [];
        return list.filter(g => g.publishedAt).map(g => {
            const updated = !!(g.updatedAt && g.updatedAt.slice(0, 10) > g.publishedAt.slice(0, 10));
            const n = {
                isGuide: true,
                id: g.id,
                name: g.title,
                // The same fallback the Guides window uses (js/guide-text.js).
                thumb: typeof GuideText !== "undefined" ? GuideText.thumbOf(g) : (g.thumb || ""),
                category: g.category || "",
                archivedAt: g.publishedAt,
                updatedAt: g.updatedAt || "",
                changes: Array.isArray(g.changes) ? g.changes : [],
                activityAt: updated ? g.updatedAt : g.publishedAt,
                activity: updated ? "updated" : "added",
                _haystack: [g.title, g.category, g.summary, "guide"].join(" ").toLowerCase()
            };
            return { n, at: n.activityAt, own: "" };
        });
    }

    // The guides arrive on their own request; a log already on screen
    // redraws to include them.
    if (window.Guides) Guides.onLoad(() => { if (showWhatsNew) render(); });

    // The Guides row's second line in the side menu.
    function guidesState() {
        const n = window.Guides && Guides.loaded() ? Guides.list().length : 0;
        return n ? `${n} ${n === 1 ? "guide" : "guides"} to how mazes work` : "How furni mazes work";
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
            /* Carried across here rather than in normalize(), alongside the
               other three fields this log needs and nothing else does.
               normalize builds an explicit shape — it does not spread the
               record — so anything not named there is dropped, which is
               exactly what happened to this on the first attempt. */
            n.changes = Array.isArray(item.changes) ? item.changes : [];
            /* What the log groups and captions by: the day something
               happened, and which of the two things happened. An edit made
               the same day a record was catalogued is part of cataloguing
               it, so only a later day counts as an update. */
            n.activityAt = at;
            n.activity = (n.updatedAt && n.archivedAt
                && n.updatedAt.slice(0, 10) > n.archivedAt.slice(0, 10))
                ? "updated" : "added";
            return { n, at, own };
        };
        const rooms = ROOMS.map(r => wrap(r, false));
        const events = EVENTS.map(e => wrap(e, true));
        return rooms.concat(events, guideLogItems())
            .filter(x => x.at)
            /* Most recent activity first — added or edited, whichever came
               last — and among everything sharing the backfill date with
               nothing since, newest in its own right first. */
            .sort((a, b) => b.at.localeCompare(a.at) || String(b.own).localeCompare(String(a.own)))
            .map(x => x.n);
    }

    /* How far back "lately" reaches, for the side menu's badge only — the
       log itself shows everything.

       The badge needs a number that means "worth opening this", and the
       length of the whole log is not that number: it counts the archive,
       not the news, and it would sit there reading 59 for ever. A window
       decays on its own, which is the behaviour a "new" badge should have —
       it empties out if nothing happens, without anybody having to mark
       anything as read.

       Fourteen days rather than seven because the archive goes quiet for a
       week at a time and a badge that is usually empty is a badge nobody
       looks at. It also, today, sits either side of the backfill date,
       which is the right answer for a different reason: the fifty-odd
       records catalogued in one go on 21 August are the archive's starting
       state, not news about it. */
    const WHATS_NEW_RECENT_DAYS = 14;

    function whatsNewRecentCount() {
        const cutoff = new Date(Date.now() - WHATS_NEW_RECENT_DAYS * 86400000)
            .toISOString().slice(0, 10);
        // Same string comparison the ranking uses: both sides are ISO, so
        // the first ten characters are the day and the day is the question.
        return whatsNewItems().filter(n => String(n.activityAt || "").slice(0, 10) >= cutoff).length;
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

    /* ---------- What's New, as an update log ----------

       This used to draw the same .chrome-list-row the archive draws, with
       two extra dates on it — which is exactly why it was confusing: the
       view that answers "what has changed lately" looked identical to the
       view that answers "what is there". Nothing on screen said you had
       gone anywhere.

       So it renders its own shape, the way the Timeline and the furni
       browser do. Grouped under the day it happened, each line captioned
       with what happened rather than with what the thing is, and strung on
       a rule down the left so it reads down the page as a sequence of
       events rather than across as a catalogue of objects. */

    /* What an edit actually did, in a few words.

       The keys are written by netlify/functions/_changes.js at the moment of
       the save, because that is the only moment both versions of a record
       exist. The WORDING lives here rather than there on purpose: a stored
       sentence would have to be migrated to be rewritten, and a stored key
       only has to be re-read.

       Every key the server can emit has a line. A key with no line here is
       skipped rather than printed raw — a log reading "ecSeason" helps
       nobody — but that is a fallback, not a plan: anything added to GROUPS
       there wants a row here. */
    const CHANGE_WORDS = {
        "imagery-added": "Added room imagery",
        "imagery": "Room imagery updated",
        /* The thumbnail is the picture a record is LISTED under; the entrance
           and finish are pictures of the maze. They shared a line until an
           event whose promo image changed was told its entrance had. */
        "thumb": "Thumbnail updated",
        "furni": "Updated furni listing",
        "markers": "Entrance or finish updated",
        "status": "Status changed",
        "difficulty": "Difficulty re-rated",
        "tags": "Tags updated",
        "dates": "Dates updated",
        "links": "Links updated",
        "text": "Changes made to texts",
        "details": "Details updated",
        // A guide's own (netlify/functions/guides.js); "text" above is shared.
        "sections": "Sections rewritten",
        "images": "Pictures updated",
    };

    /* ONE LINE, however much was done. An edit that touched five things
       reports the two that matter most and counts the rest — the list is
       ordered by the server with pictures and furni first, so the two shown
       are the two a reader would have picked out anyway.

       Nothing at all for a record with no `changes` field, which is every
       record edited before this existed and every record only ever added.
       An absent line is honest; inventing "Updated" for them would be the
       log telling somebody something it does not know. */
    function changeLineHtml(n) {
        const keys = Array.isArray(n.changes) ? n.changes : [];
        const words = keys.map(k => CHANGE_WORDS[k]).filter(Boolean);
        if (!words.length) return "";

        const shown = words.slice(0, 2).join(" · ");
        const rest = words.length - 2;
        return `<span class="updatelog-change">${escapeHtml(
            rest > 0 ? `${shown} · +${rest} more` : shown
        )}</span>`;
    }

    /* The log is grouped and headed by the VISITOR'S day, not UTC's.

       It was UTC throughout — the grouping sliced the ISO string and
       "Today" was today in Greenwich — so for a UK reader, an hour of every
       summer night belonged to the wrong day: something catalogued at
       00:30 BST was filed under yesterday and headed "Yesterday" while it
       was, to them, today. Every other timezone was out by more. What a
       reader means by "today" is their own, so both the grouping key and
       the labels are now local; the formatting stays en-GB.

       A bare date with no time (the fallback for records older than the
       createdAt stamp — see whatsNewItems) is a calendar day already, not
       an instant, and is kept exactly as written: read as an instant it is
       midnight UTC, which west of Greenwich is the evening before. */
    function localDayKey(value) {
        const s = String(value || "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d = new Date(s);
        if (isNaN(d)) return s.slice(0, 10);
        const pad = x => String(x).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function logDayLabel(day) {
        const now = new Date();
        const today = localDayKey(now.toISOString());
        // Yesterday by the calendar rather than by 24 hours back, which is a
        // different day on the two nights a year the clocks change.
        const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
        const yesterday = localDayKey(y.toISOString());
        if (day === today) return "Today";
        if (day === yesterday) return "Yesterday";
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
        if (!m) return day;
        // Local noon, so no offset can tip it into a neighbouring day.
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
        // The year only where it is not this one — on a log that mostly
        // covers recent weeks, repeating it on every heading is noise.
        const sameYear = day.slice(0, 4) === today.slice(0, 4);
        return d.toLocaleDateString("en-GB", {
            weekday: "short", day: "numeric", month: "long",
            ...(sameYear ? {} : { year: "numeric" })
        });
    }

    function renderWhatsNew() {
        const items = whatsNewItems().filter(matchesQuery);
        currentItems = items;

        if (!items.length) {
            grid.innerHTML = "";
            emptyEl.textContent = query.trim()
                ? "Nothing new matches your search."
                : "Nothing has been added yet.";
            emptyEl.style.display = "block";
            return;
        }
        emptyEl.style.display = "none";

        // Already ordered newest first by whatsNewItems, so walking it in
        // order and starting a new group each time the day changes keeps
        // that order without sorting anything twice.
        const days = [];
        items.forEach((n, i) => {
            const day = localDayKey(n.activityAt);
            const last = days[days.length - 1];
            if (!last || last.day !== day) days.push({ day, entries: [{ n, i }] });
            else last.entries.push({ n, i });
        });

        grid.innerHTML = `
            <p class="updatelog-intro">The archive's own record of itself — what has been catalogued and what has been corrected, most recent first.</p>
            <div class="updatelog">
                ${days.map(group => `
                    <section class="updatelog-day">
                        <h3 class="updatelog-date">
                            <span>${escapeHtml(logDayLabel(group.day))}</span>
                            <span class="updatelog-count">${group.entries.length}</span>
                        </h3>
                        <ul class="updatelog-entries">
                            ${group.entries.map(({ n, i }) => `
                                <li>
                                    <button type="button" class="updatelog-entry" data-log-index="${i}">
                                        <span class="updatelog-verb is-${n.activity}">${n.activity === "updated" ? "Updated" : "Added"}</span>
                                        ${n.thumb
                                            ? `<img class="updatelog-thumb" src="${escapeHtml(rowThumbUrl(n.thumb))}" alt="" loading="lazy" decoding="async">`
                                            : `<span class="updatelog-thumb is-blank" aria-hidden="true"></span>`}
                                        <span class="updatelog-what">
                                            <span class="updatelog-name">${escapeHtml(n.name || "")}</span>
                                            <span class="updatelog-meta">${escapeHtml(n.isGuide
                                                ? "Guide" + (n.category ? ` · ${n.category}` : "")
                                                : (n.isEvent ? "Event" : isHallway(n) ? "Hallway" : "Maze")
                                                    + (n.owner ? ` · ${n.owner}` : "")
                                            )}</span>
                                            ${n.activity === "updated" ? changeLineHtml(n) : ""}
                                        </span>
                                    </button>
                                </li>`).join("")}
                        </ul>
                    </section>`).join("")}
            </div>`;

        grid.querySelectorAll(".updatelog-entry").forEach(btn => {
            btn.addEventListener("click", () => {
                const n = currentItems[Number(btn.dataset.logIndex)];
                if (n && n.isGuide) { if (window.Guides) Guides.open(n.id); }
                else if (n) openModal(n);
            });
        });
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
                        <span class="timeline-badge status-badge status-${cssToken(entry.statusKey)}">${escapeHtml(entry.statusLabel)}</span>
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

        /* What a timeline cannot show, said out loud.

           Anything without a date has nowhere to sit on a timeline, so it is
           left out — which is right, and was silent. The header counted 36
           mazes while the tabs counted 38, and nothing anywhere accounted for
           the other two. A timeline that quietly drops records is a timeline
           you cannot trust as a census. */
        const undatedMazes = ROOMS.filter(r => r.name && !timelineYearOf(r.added)).length;
        const undatedEvents = EVENTS.filter(e => e.title && !timelineYearOf(e.date)).length;
        const undatedTotal = undatedMazes + undatedEvents;
        const missing = [];
        if (undatedMazes) missing.push(`${undatedMazes} ${undatedMazes === 1 ? "maze" : "mazes"}`);
        if (undatedEvents) missing.push(`${undatedEvents} ${undatedEvents === 1 ? "event" : "events"}`);
        // One subject, one verb: the counts are joined into a single phrase
        // and the agreement follows the total, not the phrasing.
        const omission = undatedTotal
            ? `<p class="timeline-omission">${escapeHtml(missing.join(" and "))} ` +
              (undatedTotal === 1
                  // A colon rather than a dash: .timeline-omission is set in
                  // Volter Goldfish, which draws U+2014 as a musical note.
                  ? "is not shown here: there is no record of when it opened."
                  : "are not shown here: there is no record of when they opened.") +
              `</p>`
            : "";

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

        /* Stats at the FOOT of the timeline, not the head of it.

           At the top they were a wall of counts standing between someone
           opening the Timeline and the timeline itself — the thing they
           actually came for. At the bottom they read as what they are: what
           all of that adds up to, once you have scrolled through it. */
        grid.innerHTML =
            `<p class="timeline-summary">${escapeHtml(summary)}</p>` +
            omission +
            `<div class="timeline">${html}</div>` +
            archiveStatsHtml();

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
        syncSearchToUrl();

        if (!dataLoaded) {
            grid.innerHTML = "";
            /* An empty grid with the empty state hidden is the right picture
               only while the loading screen is still over it saying so. Once
               that has gone the same picture is a lie: a complete, healthy
               looking archive holding no mazes at all.

               It can be up for a while. The loader gives up at
               LOADER_MAX_WAIT (8s) and the archive request is allowed 10s and
               then 15s before it falls back to the bundled copy (see
               _getWithFallback in js/api.js), so a slow connection can spend
               the best part of twenty seconds looking at an archive that
               appears to be empty. Say which it is instead. */
            // Three dots rather than an ellipsis character, matching the
            // search box's own placeholder — this text can land in Volter
            // Goldfish, which is particular about punctuation.
            emptyEl.textContent = loadFailed
                ? "Couldn't load the archive. Try refreshing the page."
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

        /* What's New, on the same footing: it is a log of changes, not a
           list of things, and drawing it as maze rows was what made it hard
           to tell you had gone anywhere. */
        if (showWhatsNew) {
            renderWhatsNew();
            updateWalkedCount();
            return;
        }


        /* The furni browser, on the same footing as the timeline: it renders
           its own thing and returns rather than going through the row
           machinery, because a furni is not a maze and a list of them is not
           a list of maze rows. Picking one hands over to furniFilter, which
           is the listing that already existed. */
        if (showFurni && !furniFilter) {
            renderFurniBrowser();
            updateWalkedCount();
            return;
        }

        /* And a chosen piece lists the ROOMS it is in rather than the mazes
           — which is what the archive actually knows, room.furni being
           keyed by the picture each match came from. */
        if (furniFilter) {
            renderFurniRooms();
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
        /* A search or a filter looks across EVERY tab of its kind — Open,
           Archived and Collab for mazes, all three event tabs for events —
           because the tabs are how the archive is shelved, not something a
           person searching knows or cares about. "tag:illusion" on Open used
           to list only the open ones, and an "Also in: Archived 6" row under
           them was how you found out there were more. Each row still carries
           its own status badge, so nothing is lost by mixing them. */
        const searching = !!query.trim();
        const rawItems = furniFilter
            ? furniFilteredItems().filter(matchesQuery)
            : showWhatsNew
                ? whatsNewItems().filter(matchesQuery)
                : (searching ? kindItems(topView) : sourceItems(view))
                    .map(item => normalize(item, topView === "events"))
                    .filter(matchesQuery);
        const items = (showWhatsNew || furniFilter) ? rawItems : sortItems(rawItems);
        currentItems = items;

        // The Open Mazes list trades the short description for the date the
        // maze opened, shown right next to the owner's name instead. What's
        // New keeps the description: a mixed list of mazes and events needs
        // the line that says what each one is.
        const isOpenView = !showWhatsNew && !searching && view === "open";

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

        renderEmptyState(view, currentItems.length === 0);
        updateWalkedCount();
    }

    // Every record of one kind, across all three of its tabs — what a search
    // looks through (see render).
    function kindItems(kind) {
        return kind === "events" ? EVENTS : ROOMS;
    }

    /* ---------- the empty state, and the way out of it ----------

       A search already covers every tab of its kind (see render), so when
       it comes back empty the only place left to look is the OTHER kind —
       "Halloween 2024" is a collab maze and an event, and somebody typing it
       has no way to know which of the two the archive filed it under. So an
       empty search says so, and if the other kind has matches it offers one
       button across that keeps the search (which the ordinary nav buttons
       deliberately do not do; they clear it — see their handlers).

       Only on a search. With no query an empty tab is simply empty. */
    const MAZE_VIEWS = ["open", "archived", "collab"];
    const EVENT_VIEWS = ["upcoming", "past", "archive"];

    // How many of one kind match what is currently typed. Normalised through
    // the same pipeline the real list uses, so "matches" means exactly what
    // it means everywhere else.
    function countOfKind(kind) {
        return kindItems(kind)
            .map(item => normalize(item, kind === "events"))
            .filter(matchesQuery)
            .length;
    }

    function renderEmptyState(view, isEmpty) {
        emptyEl.style.display = isEmpty ? "block" : "none";
        if (!isEmpty) { emptyEl.innerHTML = ""; return; }

        const searching = !!query.trim();
        const message = showWhatsNew
            ? (searching ? "Nothing new matches your search." : "Nothing has been added yet.")
            : searching
                ? (topView === "events" ? "No events match your search." : "No mazes match your search.")
                : emptyMessagesNoSearch[view];

        emptyEl.innerHTML = "";
        const say = document.createElement("p");
        say.className = "archive-empty-say";
        say.textContent = message;
        emptyEl.appendChild(say);

        // What's New already searches both kinds at once.
        if (!searching || showWhatsNew) return;

        const other = topView === "events" ? "mazes" : "events";
        const n = countOfKind(other);
        if (!n) return;

        const row = document.createElement("div");
        row.className = "archive-empty-jumps";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "archive-empty-jump";
        const label = document.createElement("span");
        label.className = "archive-empty-jump-label";
        label.textContent = other === "events" ? "Search events instead" : "Search mazes instead";
        // Counted out loud: "there might be something over there" and
        // "there are two things over there" are different offers.
        const count = document.createElement("span");
        count.className = "archive-empty-jump-count";
        count.textContent = String(n);
        btn.append(label, count);
        btn.setAttribute("aria-label", `Search ${other} instead, ${n} ${n === 1 ? "match" : "matches"}`);
        btn.addEventListener("click", () => jumpKeepingSearch(other === "events" ? eventsSub : mazesSub));
        row.appendChild(btn);
        emptyEl.appendChild(row);
    }

    /* Switch tabs without throwing the search away.

       The nav buttons clear the box on purpose: picking a category by hand
       is starting again. Arriving from here is the opposite — the search is
       the reason you are going. So this sets the same state they do and
       leaves `query` and the input alone.

       eventsSubTouched is set for the same reason the sub-nav sets it: the
       visitor has now chosen an events tab explicitly, and resolvedEventsSub
       must stop second-guessing them. */
    function jumpKeepingSearch(view) {
        if (MAZE_VIEWS.includes(view)) {
            topView = "mazes";
            mazesSub = view;
        } else {
            topView = "events";
            eventsSub = view;
            eventsSubTouched = true;
        }
        showFeatured = false;
        showWhatsNew = false;
        showTimeline = false;
        showFurni = false;
       
        furniFilter = null;
        render();
        // Back to the box, so the next keystroke carries on refining rather
        // than going nowhere — the button that was just pressed no longer
        // exists to hold focus, and focus would otherwise fall to <body>.
        if (searchInput) searchInput.focus();
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
    // Whether the panel was open at the previous render, so the render that
    // opens it can be told apart from the ones that merely happen while it
    // is open. See updateChrome.
    let featuredWasOpen = false;

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

    /* reshuffle: deal new picks (the panel opening, or Refresh). Otherwise
       the picks already dealt are drawn again, re-read from the current
       archive by id so a maze edited or saved in the meantime shows as it
       now is — and a fresh deal only if there is nothing to redraw (the
       panel was opened before the archive had loaded, or every pick has
       since left the pool). */
    function renderFeaturedList(reshuffle) {
        if (!showFeatured || !dataLoaded) return;

        const pool = sourceItems("featured").map(item => normalize(item, false));
        const kept = reshuffle ? [] : featuredListItems
            .map(old => pool.find(n => n.id && n.id === old.id))
            .filter(Boolean);
        featuredListItems = kept.length ? kept : pickFeatured(pool);

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

        renderFeaturedList(true);

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

    /* Re-measured on resize, and so is the featured panel that reads it.

       .featured-frame-body's max-height and .chrome-frame's matching offset
       were worked out once, at the moment the panel opened, and nothing ever
       looked at them again — so a window resized while the panel was open
       left both holding numbers measured against a layout that no longer
       existed. Crossing a breakpoint rewraps the rows into a taller list
       than the max-height baked in for the old one, and the body scrolls
       even though the panel itself has room to spare.

       Coalesced onto one animation frame: resize fires continuously while a
       window is being dragged, and setFeaturedPanelState both reads and
       writes layout. */
    let featuredResizeFrame = 0;
    window.addEventListener("resize", () => {
        // Only safe to trust while genuinely expanded — mid-collapse (or
        // fully collapsed) this would just measure the squashed size.
        if (searchWrap.style.maxHeight !== "0px") {
            searchWrapNaturalHeight = searchWrap.scrollHeight;
        }
        if (!showFeatured) return;
        cancelAnimationFrame(featuredResizeFrame);
        featuredResizeFrame = requestAnimationFrame(() => {
            // force: neither `active` nor chromeFrameMinimized has moved, so
            // the "nothing changed" guard would otherwise skip the re-measure
            // that is the entire point of this call.
            setFeaturedPanelState(true, true);
        });
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

    /* How tall .featured-frame-body's contents actually are.

       scrollHeight rounds to a whole pixel, and it rounds DOWN as readily as
       up: the picks' heights are fractional as a matter of course, since the
       featured rows are the ones set to line-height: normal and their line
       boxes come out at whatever the font's metrics make them (two picks at
       420px wide measure 265.09px against a scrollHeight of 265). Rounding
       the cap down puts max-height a sliver under the content it is meant to
       clear, which is not something to leave sitting under an
       overflow-y: auto.

       Chromium rounds its own scroll box the same way and shows no scrollbar
       for that sliver, so this is a guard rather than a fix for anything
       observed here — the scrollbar this panel actually grew came from the
       resize path (see the listener above). Engines are not obliged to agree
       about a fraction of a pixel, and a cap that is honestly >= its contents
       costs nothing.

       Summing the children's own rects keeps the fraction, and ceil rounds
       it the safe way. scrollHeight stays as a floor: it accounts for
       margins between the children, which a sum of rects does not. */
    function featuredBodyContentHeight() {
        const rects = Array.from(featuredFrameBody.children)
            .reduce((total, el) => total + el.getBoundingClientRect().height, 0);
        return Math.max(featuredFrameBody.scrollHeight, Math.ceil(rects));
    }

    /* Drops picks off the end until the rest fit the height the panel is
       actually going to get.

       WHY THIS IS NEEDED AT ALL. How many picks are drawn is decided by
       width — four on a phone, two otherwise (see featuredFrameCount) — and
       how much room they get is decided by height. The two never spoke, so a
       phone drew four rows into a space that fits about three. Measured at
       375x667: 485px of rows into a 354px panel, the third cut off 8px from
       its bottom and the fourth entirely below it.

       The panel was given overflow-y: auto for this, which stopped it
       CLIPPING but did not stop it looking clipped — the scrollbar is the
       site's own custom one and reserves no width, so what a phone actually
       shows is a row sliced in half and no indication anything is below it.
       A featured list you have to discover is scrollable is not doing the
       one job it has.

       WHY IT MEASURES RATHER THAN COUNTS. Row heights are not equal: a name
       that wraps to two lines makes a 119px row where a short one makes
       100px, so any fixed number is right for some draws and wrong for
       others — which is exactly why this went unnoticed, being a property of
       the random picks rather than of the layout. Dropping one at a time and
       re-asking is the only answer that cannot be wrong about a draw it has
       not seen.

       IT ASKS featuredBodyContentHeight, the same function the cap is
       computed from, so the two cannot disagree about what a height includes
       — padding, borders, box-sizing, the lot. Cheap enough to do the
       obvious way: at most four rows, so at most three extra measurements.

       display is set inline rather than using the hidden ATTRIBUTE, because
       .chrome-list-row declares its own display and any class-level display
       outranks [hidden] — the same trap .guess-options[hidden] is written to
       avoid in style.css. One row is always kept: a panel with nothing in it
       is worse than one with a single pick. */
    function trimFeaturedToFit(budget) {
        const rows = Array.from(featuredFrameList.children);
        rows.forEach(row => { row.style.display = ""; });
        if (rows.length < 2 || budget <= 0) return;

        for (let i = rows.length - 1; i >= 1; i--) {
            if (featuredBodyContentHeight() <= budget) break;
            rows[i].style.display = "none";
        }
    }
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
        /* The budget, named rather than inlined, because the trim below and
           the cap below that have to be given the SAME number — a row kept
           against one figure and a panel sized to another is the bug this is
           fixing, one level down. */
        const bodyBudget = Math.max(0, spaceForBodyAndChrome - CHROME_FRAME_VISIBLE_SLIVER);

        /* Fit the picks to the budget BEFORE the cap is worked out, so the
           cap is computed against what will actually be shown. Done here and
           not in renderFeaturedList because the budget does not exist until
           this point: the render runs first and knows only how many picks to
           draw, never how much room they will get.

           Safe to measure rows now even though the panel itself is mid
           transition, which the rest of this function is at pains to avoid —
           a row's own height does not depend on the height of the box it
           sits in, so it is settled even while its container is not. It is
           the CONTAINER that cannot be trusted here, and the container is
           not what this reads. */
        if (active) trimFeaturedToFit(bodyBudget);

        const bodyTarget = active
            ? Math.min(featuredBodyContentHeight(), bodyBudget)
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
                cancelGallerySlide();
                modalGalleryImg.style.transition = "none";
                modalGalleryImg.style.transform = "translateX(0)";
                modalGalleryImg.src = newSrc;
                modalGalleryImg.alt = newAlt;
            }
        } else {
            cancelGallerySlide();
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
                // The target picture itself, not modalGalleryImg.src: a slide
                // only assigns that once its preload lands, so copying it here
                // left the lightbox one image behind the arrows.
                lightboxImg.src = imgCdn(g.image, 900, null, 78);
                lightboxImg.alt = newAlt;
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

    // Called by every path that sets the picture without sliding (the
    // instant swap, a room with no screenshot, a gallery-less event, and
    // closing the window). Bumping the seq is what makes a preload still in
    // flight from the previous picture — or the previous maze — give up when
    // it lands, instead of sliding maze A's room into maze B's window; and a
    // half-finished outgoing clone is removed so it can't hang over the new one.
    function cancelGallerySlide() {
        slideRequestSeq++;
        if (slideOutgoingEl) {
            slideOutgoingEl.remove();
            slideOutgoingEl = null;
        }
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
            /* A hallway is not a maze (see isHallway), so it cannot be one
               of the "N mazes" a piece is found in. Left in, the index said
               a widespread piece was in 29 mazes while the archive counted
               28 — the same one-out the completion tally had, in the one
               place a reader would most naturally check the number. */
            if (isHallway(room)) return;
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

    /* ---------- what the archive adds up to ----------

       Counted from the records already in memory rather than asked for: the
       furni index is the same one the "Also in N other mazes" line runs on,
       and the rest is arithmetic over ROOMS and EVENTS.

       These are findings nobody else can produce. Five hundred-odd Origins
       maze screenshots have been scanned for furni, and until now the only
       thing that came out of it was a line at the foot of a tooltip. The
       most-used piece across the whole archive, and the ones that turn up in
       exactly one maze, are the interesting halves of the same index.

       Cached: it walks every room's furni and the answer cannot change while
       the page is open. */
    let archiveStatsCache = null;

    function archiveStats() {
        if (archiveStatsCache) return archiveStatsCache;
        if (!furniIndexByKey) furniIndexByKey = buildFurniIndex();

        // Every image the archive holds of a room, entrance and finish shots
        // included — the count people are actually impressed by.
        let roomImages = 0;
        ROOMS.forEach(room => {
            if (room.entrance && room.entrance.image) roomImages++;
            if (room.finish && room.finish.image) roomImages++;
            roomImages += (room.gallery || []).length;
        });

        const builders = new Set();
        ROOMS.forEach(r => { if (r.creator) builders.add(r.creator.trim().toLowerCase()); });
        const hosts = new Set();
        EVENTS.forEach(e => { if (e.host) hosts.add(e.host.trim().toLowerCase()); });

        /* The furni league table. One entry per piece, counting the number
           of DIFFERENT mazes it appears in — a chair placed forty times in
           one room is not a widespread chair.

           A display name is carried alongside the key because the key is
           whatever identified it (a FurniIndex URL, usually), which is not
           something to put in front of a reader. */
        const names = new Map();
        ROOMS.forEach(room => {
            Object.values(room.furni || {}).forEach(record => {
                (record && record.items ? record.items : []).forEach(item => {
                    const key = furniKeyOf(item);
                    if (key && item.name && !names.has(key)) names.set(key, item.name);
                });
            });
        });

        const ranked = [...furniIndexByKey.entries()]
            .map(([key, mazes]) => ({ key, name: names.get(key) || key, mazes: mazes.length }))
            .filter(f => f.name && f.name !== f.key)
            .sort((a, b) => b.mazes - a.mazes || compareNames(a.name, b.name));

        const onlyOnce = ranked.filter(f => f.mazes === 1);

        // Which maze holds the most pieces nobody else used. A builder's
        // taste, measured rather than asserted.
        const uniqueByMaze = new Map();
        onlyOnce.forEach(f => {
            const home = (furniIndexByKey.get(f.key) || [])[0];
            if (!home) return;
            if (!uniqueByMaze.has(home.id)) uniqueByMaze.set(home.id, { name: home.name, n: 0 });
            uniqueByMaze.get(home.id).n++;
        });
        const rarest = [...uniqueByMaze.entries()]
            .map(([id, v]) => ({ id, ...v }))
            .sort((a, b) => b.n - a.n || compareNames(a.name, b.name))[0] || null;

        archiveStatsCache = {
            // Hallways are not mazes — see isHallway. Counting them here
            // would put the stats block one out from the walked tally,
            // which counts the same set.
            mazes: ROOMS.filter(r => !isHallway(r)).length,
            events: EVENTS.length,
            roomImages,
            people: new Set([...builders, ...hosts]).size,
            furniKinds: ranked.length,
            mostUsed: ranked[0] || null,
            runnersUp: ranked.slice(1, 4),
            onlyOnce: onlyOnce.length,
            rarest
        };
        return archiveStatsCache;
    }

    /* ---------- browsing the archive by furni ----------

       Every piece the scan has identified, as a wall of sprites. Pressing
       one hands over to furniFilter — the listing that has always existed
       behind the "Also in N other mazes" line at the foot of a furni card,
       and was reachable ONLY from there: you had to already be inside a
       maze, looking at a piece, to discover that the archive could answer
       this question at all.

       WHY IT IS BANDED, RAREST FIRST

       This was a list of 434 names sorted most-widespread first, and both
       halves of that were wrong.

       The sort was backwards. The top of the list was "Fireplace, 28
       mazes" — and filtering the archive down to 28 of its 39 mazes is not
       a filter, it is almost the whole archive. The pieces worth finding
       are at the other end: nearly half of everything the scan knows about
       turns up in exactly ONE maze, and a piece only one maze ever used is
       that maze's fingerprint. Those were two hundred rows down.

       And a list of names is the wrong shape for objects whose entire
       appeal is that they are pictures. You could search it if you already
       knew what you wanted, which is the one case that did not need help.
       Sprites in a grid can be browsed; names in a list can only be read.

       So: rarest band first, each one captioned with the single maze that
       used it, then the pieces a handful of mazes share, then the common
       kit last. The bands are worked out from the data at render time
       rather than written down, so they stay honest as the scan grows. */

    // Where the bands fall. Absolute counts rather than proportions of the
    // archive: "only one maze uses this" means the same thing whether the
    // archive holds thirty mazes or three hundred.
    const FURNI_SOLO = 1;
    const FURNI_FEW_MAX = 4;

    function furniBrowserEntries() {
        if (!furniIndexByKey) furniIndexByKey = buildFurniIndex();
        const seen = new Map();
        /* Filtered here as well as in the index, and that matters: a piece
           found ONLY in the hallway would otherwise be listed with a count
           of zero and fall through all three bands, which sort on 1, 2-4
           and 5+. It would vanish from the page without saying so. */
        ROOMS.filter(room => !isHallway(room)).forEach(room => {
            Object.values(room.furni || {}).forEach(record => {
                (record && record.items ? record.items : []).forEach(item => {
                    const key = furniKeyOf(item);
                    if (!key || seen.has(key)) return;
                    const mazes = furniIndexByKey.get(key) || [];
                    // The small in-room sprite where the scan recorded one,
                    // the catalogue icon otherwise — the same fallback the
                    // furni card itself uses.
                    seen.set(key, {
                        key,
                        name: item.name || key,
                        icon: item.sprite || item.icon || "",
                        mazes: mazes.length,
                        // Carried only when there IS one, because naming it
                        // is the whole point of the first band.
                        only: mazes.length === 1 ? mazes[0] : null
                    });
                });
            });
        });
        return [...seen.values()]
            .filter(f => f.name && f.name !== f.key)
            // Rarest first, and alphabetically within a count so the grid
            // has an order you can follow rather than an arbitrary one.
            .sort((a, b) => a.mazes - b.mazes || compareNames(a.name, b.name));
    }

    function furniTileHtml(f) {
        /* The caption under each sprite carries the finding, not the
           number: for a piece only one maze used, that maze's name is far
           more interesting than the digit 1. */
        const caption = f.only
            ? `only in ${escapeHtml(f.only.name)}`
            : `${f.mazes} mazes`;
        const label = f.only
            ? `${f.name} — used only by ${f.only.name}`
            : `${f.name} — in ${f.mazes} mazes`;
        return `
            <button type="button" class="furni-tile" data-furni-key="${escapeHtml(f.key)}"
                    aria-label="${escapeHtml(label)}">
                <span class="furni-tile-art">
                    ${f.icon
                        ? `<img src="${escapeHtml(f.icon)}" alt="" loading="lazy" decoding="async">`
                        : `<span class="furni-tile-art-missing" aria-hidden="true"></span>`}
                </span>
                <span class="furni-tile-name">${escapeHtml(f.name)}</span>
                <span class="furni-tile-meta">${caption}</span>
            </button>`;
    }

    function furniBandHtml(band) {
        if (!band.items.length) return "";
        return `
            <section class="furni-band">
                <h4 class="furni-band-head">
                    <span class="furni-band-title">${escapeHtml(band.title)}</span>
                    <span class="furni-band-count">${band.items.length}</span>
                </h4>
                <p class="furni-band-note">${escapeHtml(band.note)}</p>
                <div class="furni-grid">${band.items.map(furniTileHtml).join("")}</div>
            </section>`;
    }

    function renderFurniBrowser() {
        const all = furniBrowserEntries();
        // Trimmed like the archive's own search (matchesQuery): a stray
        // trailing space typed or pasted into the box otherwise matched
        // only names with a space at that point, and emptied the grid.
        const q = query.trim().toLowerCase();
        const entries = q
            ? all.filter(f => f.name.toLowerCase().includes(q))
            : all;

        if (!entries.length) {
            grid.innerHTML = "";
            emptyEl.textContent = all.length
                ? "No furni by that name has been found in the archive."
                : "The archive has not been scanned for furni yet.";
            emptyEl.style.display = "block";
            return;
        }
        emptyEl.style.display = "none";

        const solo = entries.filter(f => f.mazes === FURNI_SOLO);
        const few = entries.filter(f => f.mazes > FURNI_SOLO && f.mazes <= FURNI_FEW_MAX);
        // Most-used first in this one, because within "everything common"
        // the ranking IS the interesting part.
        const common = entries.filter(f => f.mazes > FURNI_FEW_MAX)
            .slice()
            .sort((a, b) => b.mazes - a.mazes || compareNames(a.name, b.name));

        const bands = [
            {
                title: "Used by one maze alone",
                note: "Nobody else built with these. Each one is the signature of the maze beside it.",
                items: solo
            },
            {
                title: "Shared by a handful",
                note: `In ${FURNI_SOLO + 1} to ${FURNI_FEW_MAX} mazes — the pieces a few builders found and the rest did not.`,
                items: few
            },
            {
                title: "The common kit",
                note: "What most Origins mazes are built from, most widespread first.",
                items: common
            }
        ];

        /* A proper head, because without one this view arrived with no
           explanation of itself: a wall of four hundred sprites and a
           single line of small print. It is the least self-evident thing on
           the site — nothing else here is a list of OBJECTS — so it needs
           to say what was done, what came of it, and what pressing one of
           them will do.

           Every figure is counted from `all`, the same array the bands
           below are built from, so the summary and the thing it summarises
           cannot disagree. Counting them independently is exactly what put
           the progress card's difficulty breakdown six mazes out. */
        const soloCount = all.filter(f => f.mazes === FURNI_SOLO).length;
        const widest = all.reduce((best, f) => (!best || f.mazes > best.mazes ? f : best), null);

        const stat = (n, label) =>
            `<div class="furni-stat">
                <span class="furni-stat-n">${escapeHtml(String(n))}</span>
                <span class="furni-stat-l">${escapeHtml(label)}</span>
            </div>`;

        const head = `
            <section class="furni-head">
                <h3 class="furni-head-title">Browse by furni</h3>
                <p class="furni-head-blurb">Every room picture in the archive has been scanned and matched
                    against Habbo's furni catalogue. This is what it found. Pick any piece to see every
                    maze it turns up in.</p>
                <div class="furni-head-stats">
                    ${stat(all.length, "pieces identified")}
                    ${stat(soloCount, soloCount === 1 ? "used by one maze" : "used by one maze only")}
                    ${widest ? stat(widest.mazes, "mazes at its widest") : ""}
                </div>
                ${query
                    ? `<p class="furni-head-filter">${entries.length} ${entries.length === 1 ? "piece matches" : "pieces match"} “${escapeHtml(query)}”.</p>`
                    : ""}
            </section>`;

        grid.innerHTML = head + bands.map(furniBandHtml).join("");

        grid.querySelectorAll(".furni-tile").forEach(btn => {
            btn.addEventListener("click", () => {
                const entry = all.find(f => f.key === btn.dataset.furniKey);
                if (!entry) return;
                furniFilter = {
                    key: entry.key,
                    name: entry.name,
                    icon: entry.icon,
                    // Nothing to go "Back" to: this was reached from the
                    // browser, not from inside a maze. The chip drops that
                    // button on its own when this is unset.
                    fromMazeId: null
                };
                // The search term narrowed the FURNI list; it would narrow
                // the maze list too, and mean something different there.
                searchInput.value = "";
                query = "";
                render();
                const results = document.querySelector(".home-results");
                if (results) results.scrollTop = 0;
            });
        });
    }

    /* The stats block that opens the Timeline.

       At the top of the Timeline rather than on a page of its own because
       this is the one view that already takes the whole archive as its
       subject — the numbers are the same thing the years below them say, in
       one line instead of three hundred.

       Every figure is a real count, and the two furni lines are the reason
       the block exists: they are the only place the scan's findings are
       stated as findings. */
    function archiveStatsHtml() {
        const s = archiveStats();
        const tile = (n, label) =>
            `<div class="archive-stat">
                <span class="archive-stat-n">${escapeHtml(String(n))}</span>
                <span class="archive-stat-l">${escapeHtml(label)}</span>
            </div>`;

        const facts = [];
        if (s.mostUsed) {
            facts.push(`<p class="archive-fact"><span>Most widespread furni</span>
                <strong>${escapeHtml(s.mostUsed.name)}</strong>
                <em>in ${s.mostUsed.mazes} of ${s.mazes} mazes</em></p>`);
        }
        if (s.rarest && s.rarest.n > 1) {
            // The value here is a MAZE, not a furni — the label has to say
            // so, or the line reads as naming a piece called "The Little
            // Maze".
            facts.push(`<p class="archive-fact"><span>Most singular maze</span>
                <strong>${escapeHtml(s.rarest.name)}</strong>
                <em>${s.rarest.n} furni no other maze used</em></p>`);
        }
        if (s.onlyOnce) {
            facts.push(`<p class="archive-fact"><span>Found in a single maze</span>
                <strong>${s.onlyOnce} furni</strong>
                <em>of ${s.furniKinds} the scan has identified</em></p>`);
        }

        return `<section class="archive-stats" aria-label="What the archive holds">
            <div class="archive-stat-row">
                ${tile(s.mazes, s.mazes === 1 ? "maze" : "mazes")}
                ${tile(s.roomImages, "rooms photographed")}
                ${tile(s.events, s.events === 1 ? "event" : "events")}
                ${tile(s.people, "builders and hosts")}
            </div>
            ${facts.length ? `<div class="archive-facts">${facts.join("")}</div>` : ""}
        </section>`;
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

    /* Every ROOM a piece was found in, not every maze.

       room.furni is keyed by the picture it was scanned from, so the
       archive already knows exactly which rooms held a thing — the listing
       just never said. "In 12 mazes" is a fact about the archive; "in the
       Ballroom, and Room 7, and the Entrance" is a fact you can go and
       look at, which is what somebody who clicked a sofa actually wanted.

       Hallways are skipped for the same reason they are skipped everywhere
       else (see isHallway). */
    function furniRoomEntries() {
        if (!furniFilter) return [];
        const out = [];
        ROOMS.filter(room => !isHallway(room)).forEach(room => {
            Object.entries(room.furni || {}).forEach(([image, record]) => {
                const items = (record && record.items) || [];
                if (!items.some(f => !f.hidden && furniKeyOf(f) === furniFilter.key)) return;
                out.push({ room, image, label: roomLabelFor(room, image) });
            });
        });
        /* Grouped by maze, and within a maze in the order the gallery is
           actually laid out — so the rooms read the way they are walked
           rather than alphabetically by whatever the picture was called. */
        return out.sort((a, b) =>
            compareNames(a.room.name, b.room.name)
            || galleryOrderOf(a.room, a.image) - galleryOrderOf(b.room, b.image));
    }

    /* What that picture is called inside its maze — the gallery's own label
       where there is one, the entrance or finish where it is a bookend, and
       the filename's own derived name as a last resort. */
    function roomLabelFor(room, image) {
        if (room.entrance && room.entrance.image === image) return room.entrance.label || "Entrance";
        if (room.finish && room.finish.image === image) return room.finish.label || "Finish";
        const g = (room.gallery || []).find(x => (x && x.image) === image
            || (typeof x === "string" && x === image));
        if (g) return normalizeGalleryItem(g).label;
        return deriveGalleryLabel(image);
    }

    /* Entrance first, then the gallery in its stored order, then finish —
       the order showGalleryImage itself walks them in.

       NOT galleryPosition: that name is already taken by the #gallery-position
       element four other places read, and shadowing it here would have broken
       the modal's own room counter. */
    function galleryOrderOf(room, image) {
        if (room.entrance && room.entrance.image === image) return -1;
        const i = (room.gallery || []).findIndex(x => (x && x.image) === image
            || (typeof x === "string" && x === image));
        if (i >= 0) return i;
        return Number.MAX_SAFE_INTEGER;
    }

    function renderFurniRooms() {
        const entries = furniRoomEntries();
        currentItems = [];

        if (!entries.length) {
            grid.innerHTML = furniFilterChipHtml();
            emptyEl.textContent = "That piece is not recorded in any room.";
            emptyEl.style.display = "block";
            wireFurniChip();
            return;
        }
        emptyEl.style.display = "none";

        // Grouped under the maze they belong to, so a piece in four rooms of
        // one maze reads as one maze rather than as four results.
        const byMaze = [];
        entries.forEach(e => {
            const last = byMaze[byMaze.length - 1];
            if (last && last.room.id === e.room.id) last.rooms.push(e);
            else byMaze.push({ room: e.room, rooms: [e] });
        });

        grid.innerHTML = furniFilterChipHtml() + `
            <p class="furni-rooms-count">Found in ${entries.length} ${entries.length === 1 ? "room" : "rooms"}
                across ${byMaze.length} ${byMaze.length === 1 ? "maze" : "mazes"}.</p>
            <div class="furni-rooms">
                ${byMaze.map(group => `
                    <section class="furni-rooms-maze">
                        <h4 class="furni-rooms-name">
                            <span>${escapeHtml(group.room.name || group.room.id)}</span>
                            <span class="furni-rooms-n">${group.rooms.length}</span>
                        </h4>
                        <ul class="furni-rooms-list">
                            ${group.rooms.map(e => `
                                <li>
                                    <button type="button" class="furni-room-row"
                                            data-room-id="${escapeHtml(e.room.id)}"
                                            data-room-image="${escapeHtml(e.image)}">
                                        <img class="furni-room-shot" src="${escapeHtml(rowThumbUrl(e.image))}"
                                             alt="" loading="lazy" decoding="async">
                                        <span class="furni-room-label">${escapeHtml(e.label)}</span>
                                    </button>
                                </li>`).join("")}
                        </ul>
                    </section>`).join("")}
            </div>`;

        wireFurniChip();

        grid.querySelectorAll(".furni-room-row").forEach(btn => {
            btn.addEventListener("click", () => {
                const room = ROOMS.find(r => r.id === btn.dataset.roomId);
                if (!room) return;
                // Straight to that room's own picture, which is the whole
                // point of listing rooms rather than mazes.
                openModal(normalize(room, false), { atImage: btn.dataset.roomImage });
            });
        });
    }

    /* The chip's two exits, bound wherever the chip is drawn. Pulled out of
       render() when the furni listing stopped going through it. */
    function wireFurniChip() {
        const clear = document.getElementById("furni-filter-clear");
        if (clear) clear.addEventListener("click", () => { furniFilter = null; render(); });

        const back = document.getElementById("furni-filter-back");
        if (back) back.addEventListener("click", () => {
            const id = furniFilter && furniFilter.fromMazeId;
            furniFilter = null;
            render();
            const record = ROOMS.find(r => r.id === id);
            if (record) openModal(normalize(record, false));
        });
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
            ? `<img class="furni-filter-icon" src="${escapeHtml(furniFilter.icon)}" alt="">`
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
        // http(s) only, like every other link built from stored data here
        // (see safeHttpUrl); anything else is treated as no link at all.
        const link = card.querySelector(".furni-card-link");
        const furniUrl = safeHttpUrl(entry.url);
        if (furniUrl) link.href = furniUrl;
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
            let x = r.left - OVERLAP - grew;
            let y = r.top - card.offsetHeight + OVERLAP;

            /* Nudged clear of any card already sitting there.

               Cards are placed against the icon that opened them, and the
               icons nearest the right-hand end of the strip all clamp to the
               same x — so pinning several furni stacked the last few exactly
               on top of one another and left 37px slivers of everything
               underneath. The step is upward and slightly left, away from the
               strip, which is the same direction the photo frames cascade.

               Only pinned cards count: the transient one is about to close on
               its own, and dodging something that is leaving would move a
               card for no reason the reader can see. */
            const STEP_X = 14, STEP_Y = 16, NEAR = 12;
            for (let guard = 0; guard < 8; guard++) {
                const clash = openFurniCards.some(other => {
                    if (other === card) return false;
                    const o = other.getBoundingClientRect();
                    return Math.abs(o.left - x) < NEAR && Math.abs(o.top - y) < NEAR;
                });
                if (!clash) break;
                x -= STEP_X;
                y -= STEP_Y;
            }

            clampToViewport(card, x, y);
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

    /* The big picture is the only way into the lightbox, and it was a
       click-only <img>. Made a real control whenever there is a gallery for
       it to open: in the tab order, announced as a button, and pressed with
       Enter or Space. Its name is set here rather than left to the alt,
       because the alt says what the picture IS ("Alt Maze — Room 3") and a
       button's name has to say what pressing it does. */
    function setGalleryImageOperable(on) {
        if (on) {
            modalGalleryImg.setAttribute("tabindex", "0");
            modalGalleryImg.setAttribute("role", "button");
            modalGalleryImg.setAttribute("aria-label", "Enlarge this picture");
        } else {
            modalGalleryImg.removeAttribute("tabindex");
            modalGalleryImg.removeAttribute("role");
            modalGalleryImg.removeAttribute("aria-label");
        }
    }

    modalGalleryImg.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (!activeGallery) return;
        e.preventDefault();
        openLightbox();
    });

    // Where focus was when the lightbox opened, so a keyboard user who
    // opened it from the picture lands back on the picture, not on <body>.
    let lightboxTriggerEl = null;

    function openLightbox() {
        if (!activeGallery || !activeGallery.length) return;
        stopAutoAdvance();
        const g = activeGallery[activeIndex];
        // From the active room rather than modalGalleryImg.src, which still
        // holds the previous picture while a slide's preload is in flight.
        lightboxImg.src = g.image ? imgCdn(g.image, 900, null, 78) : modalGalleryImg.src;
        lightboxImg.alt = modalGalleryImg.alt;
        lightboxCounter.textContent = g.kind === "room" ? `${galleryCounter.textContent} — ${galleryPosition.textContent}` : galleryCounter.textContent;
        if (!lightboxOverlay.classList.contains("open")) lightboxTriggerEl = document.activeElement;
        lightboxOverlay.classList.add("open");
        if (lightboxClose) lightboxClose.focus({ preventScroll: true });
    }

    function closeLightbox() {
        const wasOpen = lightboxOverlay.classList.contains("open");
        lightboxOverlay.classList.remove("open");
        const back = lightboxTriggerEl;
        lightboxTriggerEl = null;
        if (wasOpen && back && document.body.contains(back) && lightboxOverlay.contains(document.activeElement)) {
            back.focus({ preventScroll: true });
        }
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
        // No card yet (and perhaps never, for a builder not on Origins):
        // the caption goes back to its one-figure position.
        setBuilderFigures(1);

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

        /* ONE PERSON GETS A CARD. MORE THAN ONE SHARE ONE. That is the whole
           rule, for mazes and events alike.

           It used to be three separate ones — three or more share a card, a
           Collab-status maze shares at two, everything else keeps a card each
           at two — on the reasoning that a pair is worth showing in full so
           both get their motto and last-seen. In practice it only produced
           inconsistency: the same two names read as one credit on a Collab
           and as two on anything else, and a reader has no way of knowing
           which rule they are looking at.

           Two people who built or ran something together are one credit. The
           motto and last-seen are what a solo card has room for and a shared
           one does not, and that is a fair trade for the archive saying the
           same thing every time. */
        if (profiles.length > 1) {
            modalBuilder.appendChild(collabCard(profiles));
        } else {
            profiles.forEach((profile, i) => modalBuilder.appendChild(builderCard(profile, i % 2 === 1)));
        }
        // The cards carry the builders' names themselves, so the plain
        // "by <name>" line would just repeat them.
        modalCreator.hidden = true;
        modalBuilder.hidden = false;
        setBuilderFigures(modalBuilder.querySelectorAll(".builder-avatar").length);
    }

    /* How many builder figures stand up into the furni row above the card,
       so its "Furni Info" caption can stand clear of them (see
       .furni-strip-caption). One figure is the case the caption's own margin
       was measured for; a collab card lines up several, overlapping, and the
       caption moves right by one figure's step for each extra one — the
       icons on the right give up that width by scrolling, as they already do
       for a long row. */
    function setBuilderFigures(count) {
        if (!furniStrip) return;
        furniStrip.style.setProperty("--builder-figures", String(Math.max(1, count || 1)));
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

    /* ---------- the actions tab on the modal ----------

       Save, Completed and Share are built exactly as they always were. All
       this decides is which of two places they are put in, and drives the
       tab when the answer is the drawer. Why they left the titlebar is
       written on the markup in home.html; the width this switches at, and
       why it is that width, is in css/style.css under "the same tab, on the
       room modal".

       One node, MOVED — not two copies kept in step. These buttons carry
       live state (is-saved, is-walked, aria-pressed) that delegated
       listeners update by selector across the whole page, so a second copy
       would be a second thing to keep correct, for nothing. */
    const actionsDrawer = document.getElementById("modal-actions-drawer");
    const actionsPanel = document.getElementById("modal-actions-panel");
    const actionsSpine = document.getElementById("modal-actions-spine");
    /* The same 1000px the stylesheet hides the tab at. Stated twice because
       CSS cannot tell a script anything — kept findable by both sides
       naming the other in a comment. */
    const actionsFitDrawer = window.matchMedia("(min-width: 1000px)");

    /* Below 1000px the actions sit in a bar along the foot of the window,
       each with its word: Save, Completed, Share. They used to be three
       unlabelled 24px glyphs in the titlebar, which nobody could read, and
       which squeezed the maze's name. Made here rather than in home.html:
       it is only ever a place for the node below to move to. */
    const actionsBar = (() => {
        const win = modalTitlebar && modalTitlebar.closest(".modal");
        if (!win) return null;
        const bar = document.createElement("div");
        bar.className = "modal-actions-bar";
        win.appendChild(bar);
        return bar;
    })();

    // The tab's panel when the drawer fits; otherwise the bar, or the
    // titlebar as a last resort on a page without the window's markup.
    function actionsHost() {
        if (actionsFitDrawer.matches && actionsPanel) return actionsPanel;
        return actionsBar || modalTitlebar;
    }

    function actionsOpen() {
        return !!actionsDrawer && actionsDrawer.classList.contains("is-open");
    }

    function setActionsOpen(open) {
        if (!actionsDrawer || !actionsSpine) return;
        actionsDrawer.classList.toggle("is-open", open);
        actionsSpine.setAttribute("aria-expanded", open ? "true" : "false");
        // The INCOMPLETE tab below shares this edge; one card out at a time.
        // (Declared further down, and only ever reached once the page has run.)
        if (open && incompleteDrawer && incompleteDrawer.classList.contains("is-open")) {
            incompleteDrawer.classList.remove("is-open");
            if (incompleteSpine) incompleteSpine.setAttribute("aria-expanded", "false");
        }
        /* The Actions card is taller than its ACTIONS spine, and the
           INCOMPLETE tab is placed against the spine, so the open card came
           down over the top of it. While the card is out, the tab steps down
           to clear it by the same 8px gap it keeps from the spine, and goes
           back when the card is put away. Measured rather than fixed, since
           the card's height is its words. */
        if (incompleteDrawer) {
            let push = 0;
            if (open) {
                const cardBottom = actionsDrawer.offsetTop + actionsDrawer.offsetHeight;
                // From where the tab rests, not where a previous push left it.
                const pushed = parseFloat(incompleteDrawer.style.getPropertyValue("--push")) || 0;
                push = Math.max(0, cardBottom + 8 - (incompleteDrawer.offsetTop - pushed));
            }
            incompleteDrawer.style.setProperty("--push", push + "px");
        }
    }

    if (actionsDrawer && actionsSpine && actionsPanel) {
        actionsSpine.addEventListener("click", e => {
            // Kept off the overlay's own click handlers: this press is on
            // the tab, not past the modal, and neither of them should read
            // it as either.
            e.stopPropagation();
            const open = !actionsOpen();
            setActionsOpen(open);
            if (open) {
                const first = actionsPanel.querySelector("button");
                if (first) first.focus({ preventScroll: true });
            }
        });

        /* A press anywhere else inside the modal closes it, the same way the
           archive's menu closes on a click past itself. Bound to the overlay
           rather than the document because a document-level listener would
           also catch the click on a list row that OPENED the modal, and
           close a panel on the way in. */
        modalOverlay.addEventListener("click", e => {
            if (!actionsOpen()) return;
            if (actionsDrawer.contains(e.target)) return;
            setActionsOpen(false);
        });

        /* Crossing the width moves the actions rather than rebuilding them,
           so a room already open keeps its Save and Completed exactly as
           they stand through a resize or a phone being turned. */
        actionsFitDrawer.addEventListener("change", () => {
            const actions = modalOverlay.querySelector(".modal-meta-actions");
            if (actions) actionsHost().appendChild(actions);
            // The tab it was open on may be the thing that just went away.
            setActionsOpen(false);
        });
    }

    /* opts.atImage opens the gallery on that picture rather than on the
       first one. Used by the furni listing, which names actual ROOMS — a
       row that says "the fountain is in Room 7" and then opens on Room 1
       has not answered the thing it was asked. */
    // The record the window is showing, for the controls inside it that act
    // on "this one" — the filter chips and the Dead End strip.
    let modalItem = null;

    function openModal(n, opts = {}) {
        modalItem = n;
        // Invalidates any in-flight closeModal() from a rapid re-open (its
        // animationend/fallback would otherwise fire later and rip the
        // "open"/"closing" classes off this new instance mid-view).
        modalCloseToken++;
        modalOverlay.classList.remove("closing");
        modalTriggerEl = document.activeElement;
        // Shut for the incoming room. A tab left hanging open from the last
        // one would be showing that one's Save state over this one's window.
        setActionsOpen(false);

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
        // The hotel is a filter like the tags below it: pressing it lists
        // everything from the same hotel (see applyFilterChip).
        const hotelHtml = n.hotel
            ? `<span>Hotel: <button type="button" class="meta-filter" data-filter-key="hotel" data-filter-value="${escapeHtml(n.hotel)}" title="Everything from the ${escapeHtml(n.hotel)} hotel">${escapeHtml(n.hotel)}</button></span>`
            : `<span>Hotel: Unknown</span>`;
        modalMeta.innerHTML = `
            <span class="status-badge status-${cssToken(n.statusKey)}">${escapeHtml(n.statusLabel)}</span>
            ${hotelHtml}
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
        const oldActions = modalOverlay.querySelector(".modal-meta-actions");
        if (oldActions) oldActions.remove();
        const actions = document.createElement("div");
        actions.className = "modal-meta-actions";
        /* Either the titlebar, as before, or the tab on the right edge —
           see "the actions tab on the modal" above. Searched for on the
           whole overlay just above rather than in the titlebar, because
           after this line the previous room's set may be in either place. */
        actionsHost().appendChild(actions);
        /* Completed first, then Share. Marking a maze off is the thing a
           visitor does here most often and the one that belongs to this
           maze alone; sharing is about sending it elsewhere, so it sits
           further out. An event has no Completed, and its Share simply
           takes the near position. */
        if (!n.isEvent && n.id) {
            const wrap = document.createElement("span");
            wrap.className = "modal-walked";
            /* Save, then Completed. They read as the two halves of one
               question in the order you meet them — you save a maze before
               you walk it — and Completed stays nearest Share, where it has
               always been. */
            wrap.innerHTML = savedToggleHtml(n) + walkedToggleHtml(n);
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

           Sanitised twice on the server, and both matter: article.js cleans
           it on IMPORT, and netlify/functions/events.js cleans it again on
           SAVE, because an event save carries the article back in its body
           and whatever arrives there is what gets stored — the import step
           alone would be bypassed by anyone who wrote to the events endpoint
           directly. If either of those ever stops sanitising, this line is
           where it shows.

           An article stands in for the event's full details — the admin form
           will not let both be set — so the description above it is the short
           one, and this reads as the piece itself below it. */
        const article = n.article;
        if (article && article.body) {
            modalArticleTitle.textContent = article.title || "";
            modalArticleMeta.textContent = [article.date, article.category].filter(Boolean).join("  —  ");
            modalArticleBody.innerHTML = article.body;
            /* The whole line goes when there is nowhere for it to point,
               rather than falling back to "#".

               An article can be stored without a source URL — nothing in the
               admin form requires one — and the link was shown regardless,
               so an article like that offered "Read it on Habbo Origins" and
               then jumped the reader to the top of the page. A link that
               does not go anywhere is worse than no link, because it costs a
               press to find out. The paragraph is hidden too, not just the
               anchor: hiding the anchor alone leaves its own empty line of
               margin under the article body. */
            // http(s) only (see safeHttpUrl): anything else counts as no
            // source, and the line goes, exactly as a missing one does.
            const source = safeHttpUrl(article.url);
            modalArticleLink.href = source || "#";
            const sourceLine = modalArticleLink.closest(".modal-article-source");
            if (sourceLine) sourceLine.hidden = !source;
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
        modalTags.innerHTML = modalFilterChipsHtml(n);
        renderModalDeadEnd(n);

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
        // Through safeHttpUrl, so a stored link that is not http(s) is shown
        // as no link rather than as a button that runs something.
        const habboLink = safeHttpUrl(n.habboLink);
        if (habboLink) {
            modalLink.href = habboLink;
            modalLink.style.display = "inline-block";
        } else {
            modalLink.style.display = "none";
        }
        // The paragraph around it as well, the way js/welcome.js has always
        // done it. Hiding the button alone leaves an empty <p> in the body's
        // column, which reads as a band of dead space under the builder card
        // on every event — none of which have a room to visit.
        modalVisitWrap.style.display = habboLink ? "" : "none";

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
            /* A room added without a screenshot yet gets a small "?"
               placeholder here instead of a broken <img> — see
               .gallery-strip-missing and showGalleryImage's own handling of
               the same case for the large image.

               The thumbnails you can actually SEE are loaded eagerly; only
               the ones off the end of the tray are left lazy.

               Every one of them used to be lazy, which quietly meant none of
               them could start at all. This markup is written while the
               overlay is still display:none (".open" goes on at the bottom
               of openModal), and an element with no layout box is never
               "near the viewport" — so a lazy image inside one does not
               begin to load until the modal is up and laid out, and then
               loads a few at a time as the browser notices them. Measured on
               a 24-picture maze: 3 requests in the first 1.5 seconds, for
               the 9 thumbnails on screen. That cascade is the pop-in.

               STRIP_EAGER is 10 against the 9 that fit in the tray at its
               usual width, so the count survives a slightly wider window
               without going back to loading the whole hundred of The Little
               Maze up front. */
            /* Keyboard-operable as well as clickable: tabindex="0" and
               role="button", with Enter and Space doing what a click does.
               They were bare <img>s with a click listener, which a keyboard
               cannot reach at all — so for anyone not using a pointer, the
               strip was a row of pictures of rooms they could not go to.
               The alt is the button's name ("Room 3", "Entrance"), which is
               what it says it goes to; the "?" stand-in is given one the
               same way, as a title is not a name. */
            galleryStrip.innerHTML = activeGallery.map((g, i) => g.image
                ? `<img src="${imgCdn(g.image, 110, 110, 55)}" ${i < STRIP_EAGER ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async" alt="${escapeHtml(displayLabel(g))}" data-index="${i}" tabindex="0" role="button">`
                : `<div class="gallery-strip-missing" data-index="${i}" title="${escapeHtml(displayLabel(g))}" tabindex="0" role="button" aria-label="${escapeHtml(displayLabel(g))}">?</div>`
            ).join("");
            galleryStrip.querySelectorAll("img, .gallery-strip-missing").forEach(thumb => {
                const go = () => {
                    showGalleryImage(Number(thumb.dataset.index));
                    restartAutoAdvance();
                };
                thumb.addEventListener("click", go);
                thumb.addEventListener("keydown", e => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    go();
                });
            });
            /* Straight to the picture the caller asked for, when it asked
               for one and this maze actually has it. Falls back to the
               first image rather than to nothing if it does not. */
            const wanted = opts.atImage
                ? activeGallery.findIndex(g => g.image === opts.atImage)
                : -1;
            showGalleryImage(wanted >= 0 ? wanted : 0, { instant: true });
            restartAutoAdvance();
            setGalleryImageOperable(true);
        } else {
            activeGallery = null;
            // A slide still preloading from the last maze would otherwise
            // land its room in this gallery-less window.
            cancelGallerySlide();
            // No gallery, no lightbox (openLightbox returns at once), so the
            // picture stops being a button rather than being one that does
            // nothing.
            setGalleryImageOperable(false);
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

        const wasOpen = modalOverlay.classList.contains("open");
        modalOverlay.classList.add("open");
        // Moves keyboard focus into the dialog itself (see modalCard's own
        // tabindex="-1" in home.html — focusable via script, not Tab) so a
        // keyboard user's very next Tab press starts cycling the modal's
        // own contents instead of whatever's still behind the overlay.
        modalCard.focus();
        // The address follows the window — see "the modal and the Back
        // button" below.
        syncModalHistory(n, wasOpen, !!opts.fromHashChange);
    }

    // Plays modalOut (see style.css) before actually hiding the overlay,
    // instead of just snapping display:none the instant the user clicks
    // away — the reverse of the modalIn pop the modal opens with.
    /* opts.fromHistory: the close IS a history step (Back was pressed), so
       it must not take another one of its own.
       opts.keepFocus: something else is about to take focus (the saved
       note's "Take me there" opens Your Progress), and handing it back to
       the row that opened this modal 300ms later would steal it. */
    function closeModal(opts = {}) {
        if (!modalOverlay.classList.contains("open") || modalOverlay.classList.contains("closing")) return;

        const token = ++modalCloseToken;
        modalOverlay.classList.add("closing");
        // Shut on the way out, so the tab does not slide home over a window
        // that is fading out from under it.
        setActionsOpen(false);
        stopAutoAdvance();
        // A slide still preloading must not finish into a closed (or
        // about-to-be-reused) window.
        cancelGallerySlide();
        closeLightbox();
        // These belong to the maze/event being viewed — leaving them
        // floating over the page after its maze has been closed strands
        // pictures with nothing to explain them.
        closeAllPhotoFrames();
        closeAllFurniCards();

        // Drop a #event-… or #maze-… hash left over from opening this modal
        // (via the header widget or a shared link) so a refresh after closing
        // doesn't reopen it. When the entry is one this page pushed for the
        // modal, stepping back off it is what removes it — otherwise closing
        // with the X would leave it behind and the next Back would land on
        // the same archive page and appear to do nothing. Anything else (a
        // deep link someone arrived on) is rewritten in place, as before:
        // stepping back from THAT would leave the site.
        if (!opts.fromHistory) leaveModalHistory();

        if (opts.keepFocus) modalTriggerEl = null;

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

    /* ---------- the modal and the Back button ----------

       On a phone the room modal fills the screen and looks like a page, so
       Back is what people press to leave it — and it pushed no history
       entry, so Back left the SITE, taking the visitor off the archive
       entirely from what they took to be one level in.

       So opening a modal from inside the page pushes an entry naming it
       (#maze-<id> / #event-<id>, the same addresses a shared link uses), and
       Back pops it and closes the modal. The entries carry a marker in their
       state so this code only ever steps back over entries it made itself.

       - Opened by a click: pushed.
       - Opened while one is already showing (a furni card's "also in", the
         furni listing's Back): the entry is REPLACED, not stacked, so Back
         closes the window rather than walking through every maze viewed in
         it.
       - Opened by a hash change (the header ticker's link while already on
         the archive): the browser has made the entry already, so it is only
         marked as ours.
       - Opened from the address the page LOADED with (a shared link): left
         unmarked. That entry is the visitor's way into the site; closing the
         modal rewrites its hash away, exactly as it always did, and never
         steps back off it.

       Closing by any other route (X, Escape, the backdrop) steps back over
       our own entry — see leaveModalHistory — so it does not linger as a
       dead entry that makes the next Back press appear to do nothing.

       history.back() is asynchronous, so a modal reopened in the gap before
       its popstate lands would have its new entry popped by the old close.
       pendingBack covers that gap: the push waits for the popstate, and the
       popstate knows not to close anything while a reopen is waiting. */
    const MODAL_STATE = "mazeratsModal";
    let pendingBack = false;
    let pendingPush = null;

    function modalHash(n) {
        return `#${n.isEvent ? "event" : "maze"}-${encodeURIComponent(n.id || "")}`;
    }

    function ownsModalEntry() {
        return !!(history.state && history.state[MODAL_STATE]);
    }

    // Compared decoded, so an id the share page escaped slightly differently
    // from encodeURIComponent still counts as the address already showing.
    function sameModalHash(a, b) {
        const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
        return dec(a) === dec(b);
    }

    // The address of whatever the modal is showing, so a hashchange that
    // names the same thing (this code's own pushes are followed by one when
    // a reopen races a step back) does not rebuild the window it is already
    // looking at.
    let shownModalHash = null;

    function syncModalHistory(n, wasOpen, fromHashChange) {
        shownModalHash = n && n.id ? modalHash(n) : null;
        if (!n || !n.id) return;
        const hash = modalHash(n);
        const url = location.pathname + location.search + hash;
        if (pendingBack) { pendingPush = hash; return; }
        try {
            if (fromHashChange) {
                if (!ownsModalEntry()) history.replaceState({ [MODAL_STATE]: true }, "", url);
            } else if (sameModalHash(location.hash, hash)) {
                // Already at this address: the load-time deep link, or a
                // Forward press back onto an entry we pushed earlier. Nothing
                // to add either way.
            } else if (wasOpen && (ownsModalEntry() || /^#(event|maze)-/.test(location.hash))) {
                history.replaceState(history.state, "", url);
            } else {
                history.pushState({ [MODAL_STATE]: true }, "", url);
            }
        } catch (e) { /* a sandboxed frame can refuse history writes; the modal still works */ }
    }

    function leaveModalHistory() {
        if (!/^#(event|maze)-/.test(location.hash)) return;
        if (ownsModalEntry()) {
            pendingBack = true;
            history.back();
        } else {
            history.replaceState(null, "", location.pathname + location.search);
        }
    }

    window.addEventListener("popstate", () => {
        if (pendingBack) {
            const reopened = pendingPush && modalOverlay.classList.contains("open") && !modalOverlay.classList.contains("closing");
            /* Landed on ANOTHER of our modal entries — possible when the
               header ticker's link was followed while a maze was already
               open, which makes the browser stack a second entry that this
               code can only mark, not prevent. The window is closed, so keep
               stepping until the archive's own entry is reached; stopping
               here would leave a hash the next hashchange reopens. */
            if (!reopened && ownsModalEntry() && /^#(event|maze)-/.test(location.hash)) {
                history.back();
                return;
            }
            pendingBack = false;
            /* The entry stepped back onto is the one from BEFORE the window
               opened, so it carries whatever search was in the address then.
               A filter chip closes the window and sets a new search in the
               same moment (see applyFilterChip); written into the entry that
               was being left, it went with it. Put it on this one. */
            syncedSearch = null;
            syncSearchToUrl();
            // A modal reopened while the step back was in flight gets the
            // entry it asked for now that the old one is gone.
            if (reopened) {
                history.pushState({ [MODAL_STATE]: true }, "", location.pathname + location.search + pendingPush);
            }
            pendingPush = null;
            return;
        }
        // Back from a modal's entry to the plain archive: close it, without
        // stepping back a second time. Forward onto a maze's entry is handled
        // by the hashchange that fires alongside this (openFromHash).
        if (!/^#(event|maze)-/.test(location.hash) && modalOverlay.classList.contains("open")) {
            closeModal({ fromHistory: true });
        }
    });

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

    /* ---------- your progress through the archive ----------

       What the walked and saved lists add up to, in one place. It reads the
       same two sets everything else does rather than keeping its own count,
       so it cannot drift from the ticks on the mazes themselves.

       Works signed out. The numbers are this browser's then rather than the
       account's, which is exactly what they have always been — the panel
       says so, and offers the account as the way to carry them. */

    /* Milestones over percentages, because "27 of 39" is a number and
       "Halfway" is an event. Each is a real threshold against the mazes
       that can actually be walked, so none of them is unreachable by
       design — the closed ones are excluded from the denominator for the
       same reason they are excluded from the count. */
    const MILESTONES = [
        { at: 1, name: "First steps", note: "Completed your first maze" },
        { at: 5, name: "Getting your bearings", note: "Five completed" },
        { at: 10, name: "Regular", note: "Ten completed" },
        { at: 25, name: "Seasoned", note: "Twenty-five completed" },
        { at: 50, name: "Veteran", note: "Fifty completed" }
    ];

    function progressFigures() {
        const walkable = walkableRooms();
        const walkedHere = walkable.filter(r => walkedIds.has(r.id));
        const savedRooms = ROOMS.filter(r => savedIds.has(r.id));

        // Only ones still to walk: a maze on both lists has been done, and
        // showing it under "to walk" would be a list that never empties.
        const toWalk = savedRooms.filter(r => !walkedIds.has(r.id));

        const byDifficulty = {};
        walkable.forEach(r => {
            const d = (r.difficulty || "unknown").toLowerCase();
            byDifficulty[d] = byDifficulty[d] || { total: 0, walked: 0 };
            byDifficulty[d].total++;
            if (walkedIds.has(r.id)) byDifficulty[d].walked++;
        });

        return { walkable, walkedHere, savedRooms, toWalk, byDifficulty };
    }

    /* For the console's Profile page (js/console-profile.js): the same
       figures this window draws, so the two can never disagree, and a way
       to open this window for the detail. */
    window.ArchiveProgress = {
        figures() {
            const f = progressFigures();
            return { done: f.walkedHere.length, total: f.walkable.length, toWalk: f.toWalk.length };
        },
        open: () => openProgress()
    };

    function progressHtml() {
        const f = progressFigures();
        const total = f.walkable.length;
        const done = f.walkedHere.length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const me = window.Account && Account.current;

        const earned = MILESTONES.filter(m => done >= m.at);
        const next = MILESTONES.find(m => done < m.at);

        /* Ranked easy-to-hard rather than alphabetically, because that is
           the order the ratings mean. But the ranking only decides the
           ORDER — every difficulty actually present is listed, including
           any the ranking has not heard of, which then sort to the end.

           Written that way after the first cut hardcoded the list and
           silently dropped "very-hard": six mazes vanished from a
           breakdown whose totals were supposed to add up to the headline
           figure directly above it. A list that can quietly disagree with
           the number over it is worse than no list. */
        const RANK = ["easy", "medium", "hard", "very-hard", "extreme", "unknown"];
        const rankOf = d => {
            const i = RANK.indexOf(d);
            return i === -1 ? RANK.length : i;
        };
        const prettyDifficulty = d =>
            d === "unknown" ? "Unrated" : d.replace(/-/g, " ");

        const diffRows = Object.keys(f.byDifficulty)
            .filter(d => f.byDifficulty[d].total)
            .sort((a, b) => rankOf(a) - rankOf(b) || (a < b ? -1 : 1))
            .map(d => {
                const { total: t, walked: w } = f.byDifficulty[d];
                const p = t ? Math.round((w / t) * 100) : 0;
                return `<li class="progress-diff">
                    <span class="progress-diff-name">${escapeHtml(prettyDifficulty(d))}</span>
                    <span class="progress-diff-bar"><span style="width:${p}%"></span></span>
                    <span class="progress-diff-n">${w}/${t}</span>
                </li>`;
            }).join("");

        const savedList = f.toWalk.length
            ? `<ul class="progress-saved">${f.toWalk.map(r => `
                <li><button type="button" class="progress-saved-row" data-open-maze="${escapeHtml(r.id)}">
                    <span class="progress-saved-name">${escapeHtml(r.name || r.id)}</span>
                    <span class="progress-saved-by">${escapeHtml(r.creator || "")}</span>
                </button></li>`).join("")}</ul>`
            : `<p class="progress-note">Nothing saved yet. Open a maze and press <strong>Save</strong> to keep it here.</p>`;

        return `
            <section class="progress-head">
                ${me && me.avatar ? `<img class="progress-face" src="${escapeHtml(me.avatar)}" alt="" aria-hidden="true">` : ""}
                <div class="progress-head-text">
                    <h3>${me ? escapeHtml(me.name) : "Your archive"}</h3>
                    <p>${me
                        ? "Kept against your account, so it follows you between devices."
                        : `Kept in this browser. <button type="button" class="progress-signin" id="progress-signin">Sign in with Discord</button> to carry it with you.`}</p>
                </div>
            </section>

            <section class="progress-block">
                <div class="progress-bignum">
                    <strong>${done}</strong><span>of ${total} completed</span>
                </div>
                <div class="progress-bar"><span style="width:${pct}%"></span></div>
                <p class="progress-note">${pct}% of the mazes you can still complete today.</p>
            </section>

            ${diffRows ? `<section class="progress-block">
                <h4 class="progress-head-sm">By difficulty</h4>
                <ul class="progress-diffs">${diffRows}</ul>
            </section>` : ""}

            <section class="progress-block">
                <h4 class="progress-head-sm">Milestones</h4>
                ${earned.length
                    ? `<ul class="progress-badges">${earned.map(m => `
                        <li class="progress-badge" title="${escapeHtml(m.note)}">
                            <span class="progress-badge-mark" aria-hidden="true"></span>
                            <span>${escapeHtml(m.name)}</span>
                        </li>`).join("")}</ul>`
                    : `<p class="progress-note">None yet — the first arrives the moment you mark a maze as completed.</p>`}
                ${next ? `<p class="progress-note">Next: <strong>${escapeHtml(next.name)}</strong> at ${next.at} completed — ${next.at - done} to go.</p>` : ""}
            </section>

            <section class="progress-block">
                <h4 class="progress-head-sm">Saved to complete${f.toWalk.length ? ` <span class="progress-count">${f.toWalk.length}</span>` : ""}</h4>
                ${savedList}
            </section>`;
    }

    function renderProgress() {
        const body = document.getElementById("progress-body");
        if (!body) return;
        body.innerHTML = progressHtml();

        const signin = document.getElementById("progress-signin");
        if (signin) signin.addEventListener("click", () => window.Account && Account.signIn());

        // A saved maze opens where every other maze opens.
        body.querySelectorAll("[data-open-maze]").forEach(btn => {
            btn.addEventListener("click", () => {
                const room = ROOMS.find(r => r.id === btn.dataset.openMaze);
                if (!room) return;
                closeProgress({ keepFocus: true });
                openModal(normalize(room, false));
            });
        });
    }

    /* Where focus was when the window opened, handed back when it closes —
       the room modal has always done this (modalTriggerEl) and this window
       did not, so closing it dropped a keyboard user at the top of the
       document. Only recorded on a fresh open, so re-rendering an open
       window cannot overwrite the real opener with something inside it. */
    let progressTriggerEl = null;

    function openProgress() {
        const overlay = document.getElementById("progress-overlay");
        if (!overlay) return;
        if (!overlay.classList.contains("open")) progressTriggerEl = document.activeElement;
        renderProgress();
        overlay.classList.add("open");
        document.body.classList.add("modal-open");
        document.getElementById("progress-window").focus();
    }

    /* opts.keepFocus: something is about to open in its place (a saved
       maze's row opens the room modal) and will take focus itself. */
    function closeProgress(opts = {}) {
        const overlay = document.getElementById("progress-overlay");
        if (!overlay) return;
        overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
        const back = progressTriggerEl;
        progressTriggerEl = null;
        if (opts.keepFocus || !back || !document.body.contains(back)) return;
        // The side menu's own rows are hidden once the menu shuts, so a row
        // that opened this is no place to land — its spine is.
        const landing = back.closest && back.closest("#side-menu")
            ? document.getElementById("side-spine")
            : back;
        if (landing && typeof landing.focus === "function") landing.focus({ preventScroll: true });
    }

    (function wireProgress() {
        const overlay = document.getElementById("progress-overlay");
        const close = document.getElementById("progress-close");
        /* Guards on its OWN markup and nothing else.

           This used to require #progress-tab to exist before it would wire
           anything, and that tab went when the three side tabs became one
           menu — so every way of closing the window (the X, the backdrop,
           Escape) silently stopped being bound, while the window itself
           still opened because the menu calls openProgress directly. The
           same mistake had already cost the daily game its deck; a setup
           function has no business depending on whoever happens to open
           it. */
        if (!overlay) return;
        if (close) close.addEventListener("click", closeProgress);
        overlay.addEventListener("click", e => { if (e.target === overlay) closeProgress(); });
        // Escape through the shared rule — see registerEscapeLayer.
        registerEscapeLayer(
            () => overlay.classList.contains("open") ? [overlay] : [],
            () => closeProgress()
        );
    })();

    /* Pulls the account's ticks down as soon as we know who is signed in,
       and again if they sign in or out during the visit. onChange fires on
       every answer including "nobody", which now takes the account's
       ticks back off this browser (see dropAccountTicks) unless the
       answer was only a failed request (Account.unsure). */
    if (window.Account) {
        Account.onChange(me => {
            if (me) onAccountAnswer(me);
            else if (!Account.unsure) onAccountAnswer(null);
        });
        if (Account.onStored) Account.onStored(confirmTicks);
        Account.ready();
    }

    /* ---------- Missing Pieces ----------

       Records that stop short: a maze nobody screenshotted the finish of, an
       event with no photos, a builder never written down. js/dead-ends.js
       lists what a record can be missing (the "dead ends" name in the code is
       the feature's first draft; people see "Missing Pieces"). This is the
       archive's half: the INCOMPLETE tab on a maze's window, and the data the
       console's Missing Pieces list and Add Maze Info form read (see
       js/console-info.js, and window.MissingPieces below).

       Every missing piece here was MARKED BY HAND in /warren. Nothing is
       inferred from the record — the page used to guess, and a maze whose
       entrance is simply its room 1 was advertised as missing an entrance
       shot. A record with no flag is complete as far as this page is
       concerned.

       The flags are one small cached read, fetched when the archive loads so
       a maze's window can show its tab the moment it opens. If it fails, the
       page shows nothing as missing, which is the safe way to be wrong. */
    const DEAD_ENDS_URL = "/.netlify/functions/dead-ends";
    const deadEnds = { flags: new Map(), trail: new Map(), loaded: false };
    let deadEndsReq = null;
    const deadEndsListeners = [];

    function loadDeadEnds() {
        if (deadEndsReq) return deadEndsReq;
        deadEndsReq = fetch(DEAD_ENDS_URL, { headers: { Accept: "application/json" } })
            .then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
            .then(data => {
                deadEnds.flags = new Map((data.flags || []).map(f => [`${f.type}:${f.id}`, f]));
                deadEnds.trail = new Map((data.trail || []).map(t => [`${t.type}:${t.id}`, t.leads]));
                deadEnds.loaded = true;
                if (modalItem && modalOverlay.classList.contains("open")) renderModalDeadEnd(modalItem);
                deadEndsListeners.forEach(fn => { try { fn(); } catch (e) { /* a listener's own problem */ } });
            })
            .catch(() => { deadEndsReq = null; });
        return deadEndsReq;
    }

    function deadEndKey(n) { return `${n.isEvent ? "event" : "maze"}:${n.id}`; }

    // What one normalized record is missing: the pieces an admin marked.
    function gapsOfItem(n) {
        if (typeof DeadEnds === "undefined" || !n || !n.id) return [];
        return DeadEnds.gapsOf(n.isEvent ? "event" : "maze", deadEnds.flags.get(deadEndKey(n)) || null);
    }

    // Every marked record, longest on the list first so the oldest asks do
    // not sink under new ones.
    function deadEndItems() {
        const all = [
            ...ROOMS.map(r => normalize(r, false)),
            ...EVENTS.map(e => normalize(e, true))
        ];
        return all
            .map(n => ({ n, gaps: gapsOfItem(n), flag: deadEnds.flags.get(deadEndKey(n)) || null }))
            .filter(e => e.gaps.length)
            .sort((a, b) => String(a.flag.markedAt || "").localeCompare(String(b.flag.markedAt || ""))
                || compareNames(a.n.name, b.n.name));
    }

    function trailLine(n) {
        const waiting = deadEnds.trail.get(deadEndKey(n)) || 0;
        return waiting
            ? `<p class="incomplete-trail">Someone is on the trail: ${waiting} ${waiting === 1 ? "lead" : "leads"} waiting to be read.</p>`
            : "";
    }

    /* What the console reads. The console is its own file and does not
       share this one's scope, so the archive's records and the flags are
       handed over through this, as plain data: every record anyone could add
       information to, and which of them are marked as missing something. */
    // One shared wait for the archive, rather than a fresh 200ms poll per
    // caller: the console asks every time a page of it is drawn.
    let archiveWait = null;
    function archiveReady() {
        if (dataLoaded) return Promise.resolve();
        if (!archiveWait) {
            archiveWait = new Promise(resolve => {
                const t = setInterval(() => { if (dataLoaded) { clearInterval(t); resolve(); } }, 200);
            });
        }
        return archiveWait;
    }

    window.MissingPieces = {
        /* Resolves once the archive is in and the flags have been ASKED for,
           whether or not that ask worked: loadDeadEnds swallows its own
           failure. So a caller checks loaded() afterwards; calling ready()
           again straight away on a false loaded() is what made the Missing
           Pieces page hammer a dead endpoint forever. */
        ready() {
            return Promise.all([archiveReady(), loadDeadEnds()]);
        },
        loaded: () => dataLoaded && deadEnds.loaded,
        /* The archive alone, for the Add Maze Info form's record list, which
           needs no flags. It used to wait on loaded() above, so a failed
           dead-ends read left the form with no mazes to choose from. */
        archiveReady,
        archiveLoaded: () => dataLoaded,
        // Every maze and event, by name, for the form's "which one" list.
        records() {
            return [
                ...ROOMS.map(r => ({ type: "maze", id: r.id, name: r.name || r.id })),
                ...EVENTS.map(e => ({ type: "event", id: e.id, name: e.title || e.id }))
            ].filter(r => r.id).sort((a, b) => compareNames(a.name, b.name));
        },
        // The marked ones, with what each is missing and the admin's note.
        missing() {
            return deadEndItems().map(e => ({
                type: e.n.isEvent ? "event" : "maze",
                id: e.n.id,
                name: e.n.name,
                pieces: e.gaps,
                note: (e.flag && e.flag.note) || "",
                waiting: deadEnds.trail.get(deadEndKey(e.n)) || 0
            }));
        },
        gapsOf(type, id) {
            return typeof DeadEnds === "undefined" ? [] : DeadEnds.gapsOf(type, deadEnds.flags.get(`${type}:${id}`) || null);
        },
        // A lead was just sent: count it at once rather than waiting for the
        // edge-cached list to catch up, so the sender sees it land.
        noteLead(type, id) {
            const k = `${type}:${id}`;
            deadEnds.trail.set(k, (deadEnds.trail.get(k) || 0) + 1);
            if (modalItem && modalOverlay.classList.contains("open")) renderModalDeadEnd(modalItem);
        },
        // Open a record's window from the console's list.
        openRecord(type, id) {
            const raw = type === "event" ? EVENTS.find(e => e.id === id) : ROOMS.find(r => r.id === id);
            if (raw) openModal(normalize(raw, type === "event"));
        },
        onChange(fn) { if (typeof fn === "function") deadEndsListeners.push(fn); }
    };

    /* ---- the INCOMPLETE tab on a maze's window ----

       A second tab on the window's right edge, under Actions, in the same
       cream and the same slide: the word INCOMPLETE down the spine, and the
       list of what is missing on the card it pulls out. It is only there on
       a record somebody has marked, so a complete maze's window is exactly
       what it always was.

       Below 1000px there is no room beside the window for a tab to open into
       (see .modal-actions-drawer), so the same card hangs from a small
       INCOMPLETE pill in the meta row instead — the status badge's row,
       which is where "what state is this record in" already lives. */
    const incompleteDrawer = document.getElementById("modal-incomplete-drawer");
    const incompleteSpine = document.getElementById("modal-incomplete-spine");
    const incompletePanel = document.getElementById("modal-incomplete-panel");

    function incompleteCardHtml(n, gaps) {
        const flag = deadEnds.flags.get(deadEndKey(n));
        return `
            <p class="incomplete-title">Still missing</p>
            <ul class="incomplete-list">${gaps.map(key => {
                const p = DeadEnds.piece(key);
                return `<li>${escapeHtml(p ? p.ask : key)}</li>`;
            }).join("")}</ul>
            ${flag && flag.note ? `<p class="incomplete-note">${escapeHtml(flag.note)}</p>` : ""}
            ${trailLine(n).replace("deadend-trail", "incomplete-trail")}
            <button type="button" class="incomplete-help" data-lead>I can help</button>`;
    }

    function setIncompleteOpen(open) {
        if (!incompleteDrawer) return;
        incompleteDrawer.classList.toggle("is-open", open);
        if (incompleteSpine) incompleteSpine.setAttribute("aria-expanded", open ? "true" : "false");
        // One card out at a time: the two tabs share an edge.
        if (open) setActionsOpen(false);
    }

    function renderModalDeadEnd(n) {
        const gaps = gapsOfItem(n);
        const strip = document.getElementById("modal-incomplete-strip");
        setIncompleteOpen(false);

        if (!gaps.length) {
            if (incompleteDrawer) incompleteDrawer.hidden = true;
            if (incompletePanel) incompletePanel.innerHTML = "";
            if (strip) strip.remove();
            if (!deadEnds.loaded) loadDeadEnds();
            return;
        }

        const card = incompleteCardHtml(n, gaps);
        if (incompleteDrawer && incompletePanel) {
            incompletePanel.innerHTML = card;
            incompleteDrawer.hidden = false;
        }

        /* The narrow version: a strip across the foot of the meta row that
           says what is missing in a word each and offers the form, with
           nothing to open. It used to be an INCOMPLETE pill that unfolded
           the tab's card inside the row, pushing the window down and running
           off its right edge. The full sentences are in the Add Maze Info
           form the button opens.

           Rebuilt with the meta row, which openModal rewrites on every open,
           so it is added here each time rather than kept. The CSS shows
           whichever of the two, strip or tab, fits the width. */
        const words = [...new Set(gaps.map(key => {
            const p = DeadEnds.piece(key);
            return p && p.word ? p.word : key;
        }))];
        const bar = strip || document.createElement("div");
        bar.id = "modal-incomplete-strip";
        bar.className = "incomplete-strip";
        bar.innerHTML = `
            <span class="incomplete-strip-label">Missing</span>
            <span class="incomplete-strip-words">${words.map(escapeHtml).join(" · ")}</span>
            <button type="button" class="incomplete-strip-help" data-lead>I can help ›</button>`;
        if (!strip) modalMeta.appendChild(bar);
    }

    if (incompleteDrawer && incompleteSpine) {
        incompleteSpine.addEventListener("click", e => {
            e.stopPropagation();
            const open = !incompleteDrawer.classList.contains("is-open");
            setIncompleteOpen(open);
            if (open) {
                const first = incompletePanel.querySelector("button");
                if (first) first.focus({ preventScroll: true });
            }
        });
        // Anywhere else in the window closes it, as the Actions tab does.
        modalOverlay.addEventListener("click", e => {
            if (!incompleteDrawer.classList.contains("is-open")) return;
            if (incompleteDrawer.contains(e.target)) return;
            setIncompleteOpen(false);
        });
        registerEscapeLayer(
            () => incompleteDrawer.classList.contains("is-open") && modalOverlay.classList.contains("open") ? [incompleteDrawer] : [],
            () => { setIncompleteOpen(false); incompleteSpine.focus({ preventScroll: true }); }
        );
    }

    // "I can help" on either version of the card: the console's Add Maze
    // Info form, already pointed at this record.
    modalOverlay.addEventListener("click", e => {
        const btn = e.target.closest("[data-lead]");
        if (!btn || !modalItem) return;
        setIncompleteOpen(false);
        if (window.MazeConsole) MazeConsole.openInfo({ type: modalItem.isEvent ? "event" : "maze", id: modalItem.id });
    });

    // For the side menu's line: how many records are marked. Null until both
    // the archive and the flags are in, so the menu never says "none" early.
    function deadEndFigures() {
        if (!dataLoaded || !deadEnds.loaded || typeof DeadEnds === "undefined") return null;
        return deadEndItems().length;
    }

    /* ---------- the side menu ----------

       One spine on the window's right edge, one panel behind it, the same
       at every width (see .side-spine in css/style.css for what replaced
       what, and why).

       The rows are written here rather than in the markup because each one
       carries a live count — which is the point of the panel. A menu of
       three links is barely worth opening; a menu that tells you the day is
       half played and six mazes have arrived since you last looked is worth
       opening on its own account.

       Adding a fourth way in means one more entry in this array. */
    /* Whether Fallin' Furni is open, for the menu row that offers it.

       THE ROW USED TO BE A CONSTANT. It said "Sit on every seat, in order"
       whether the game was live or shut, because nothing in this file had
       ever read the site settings — and unlike the two daily games above it,
       that row NAVIGATES. So a closed game cost a reader the archive, a whole
       page load, a "Maintenance, back soon!", and the trip back. A row that
       opened in place and did nothing would be a shrug; this was a round
       trip to a locked door.

       IT COSTS NO REQUEST. The settings are already in flight before this
       page is even revealed — the pre-load gate in home.html's <head> asks
       for them and publishes the promise as window.__mrSettings, and
       Api.getSiteSettings adopts it rather than asking again. This is
       reading an answer the page already has.

       Held in a variable rather than awaited, because sideMenuEntries is
       synchronous and called afresh every time the menu is drawn. By the
       time anybody has opened the burger the value is long since here; if it
       somehow is not, null reads as open, which is the wording the row has
       always had and the same way the game itself fails. */
    /* Asked right here rather than from a DOMContentLoaded listener, and that
       is not a shortcut: everything in this file ALREADY runs inside one (see
       the top of the file), so registering another from in here adds it to an
       event that is currently being dispatched — and a listener added during
       dispatch is never called. Written that way first, and the row went on
       saying "Sit on every seat, in order" with the game shut. */
    let ffClosedState = null;

    if (typeof Api !== "undefined") {
        Api.getSiteSettings()
            .then(s => {
                const state = s && s.fallinFurniState;
                if (state === "maintenance" || state === "coming-soon") ffClosedState = state;
            })
            .catch(() => { /* fail open, as the game's own gate does */ });
    }

    function sideMenuEntries() {
        const g = typeof window.GuessStatus === "function" ? window.GuessStatus() : null;
        // The last fortnight's worth, not the log's length — see
        // WHATS_NEW_RECENT_DAYS for why the two are different numbers.
        const fresh = whatsNewRecentCount();
        const f = progressFigures();
        const de = deadEndFigures();

        const o = typeof window.OddOneOutStatus === "function" ? window.OddOneOutStatus() : null;

        /* Read fresh rather than captured once, for the same reason
           featuredFrameCount is — a phone turned landscape crosses this
           line, and the next time the menu opens it should answer to where
           it is now. Same 640 the featured panel uses; one number for "this
           is a phone" rather than two that can drift apart. */
        const onPhone = window.innerWidth <= FEATURED_PHONE_MAX;

        return [
            /* ARCHIVE: the archive's own tools, folded like GAMES and above
               it, since the archive is what the site is for. */
            { group: "Archive" },
            {
                name: "What's New",
                state: fresh ? "Lately added and changed" : "Nothing new just now",
                badge: fresh ? String(fresh) : "",
                on: showWhatsNew,
                run: toggleWhatsNew
            },
            {
                // How-to guides, in a window of their own (js/guides.js).
                name: "Guides",
                state: guidesState(),
                badge: "",
                on: false,
                run: () => { if (window.Guides) Guides.open(); }
            },
            {
                name: "Missing Pieces",
                state: de === null ? "Help finish the archive"
                    : de ? `${de} ${de === 1 ? "record needs" : "records need"} your help`
                        : "Every record is complete",
                badge: "",
                on: false,
                // The console's list, not a view of the archive: each entry
                // leads straight into the Add Maze Info form beside it.
                run: () => { if (window.MazeConsole) MazeConsole.openMissing(); }
            },
            {
                name: "Your Progress",
                state: `${f.walkedHere.length} of ${f.walkable.length} completed`
                    + (f.toWalk.length ? ` · ${f.toWalk.length} saved` : ""),
                badge: "",
                on: false,
                run: openProgress
            },
            /* GAMES: a row that folds open, holding every game and the
               boards. Rows below it belong to it until the next heading.
               The games used to sit open under a plain "Daily" heading,
               which with Fallin' Furni and the leaderboards among them
               made the menu a long list before it reached the archive. */
            { group: "Games" },
            {
                name: "Guess the Maze",
                // A tag beside the name, since inside the GAMES fold there is
                // no "Daily" heading any more to say which games reset each
                // morning. See .side-menu-tag.
                tag: "Daily",
                state: !g ? "Today's five rooms"
                    : g.finished ? `Done — ${g.points} points`
                        : g.started ? `${g.done} of ${g.total} rooms done`
                            : "Not played today",
                /* No points badge: the line below already says "Done — N
                   points", and at the side menu's width the badge pushed the
                   DAILY tag onto a line of its own. */
                badge: "",
                on: false,
                // Opened through the hook js/guess.js publishes: the game
                // owns its own window, and the menu only asks for it.
                run: () => { if (typeof window.openGuessGame === "function") window.openGuessGame(); }
            },
            {
                name: "Odd One Out",
                tag: "Daily",
                state: !o ? "Spot the room that does not belong"
                    : o.finished ? `Done — ${o.points} points`
                        : o.started ? `${o.done} of ${o.total} rounds done`
                            : "Not played today",
                badge: "",
                on: false,
                run: () => { if (typeof window.openOddOneOut === "function") window.openOddOneOut(); }
            },
            {
                /* Not a daily puzzle and not a window: Fallin' Furni is a room
                   you walk about in, and it wants the whole viewport rather
                   than a 204px console pane. So this one NAVIGATES, where the
                   games above open in place. See ffClosedState above. */
                name: "Fallin' Furni",
                /* The second line stops describing the game and starts
                   reporting on it. Two words, not a sentence: this is a
                   status, and "Closed for maintenance" was a status trying to
                   be an explanation. */
                state: ffClosedState === "coming-soon" ? "Coming Soon"
                    : ffClosedState === "maintenance" ? "Maintenance"
                        : "Sit on every seat, in order",
                badge: "",
                on: false,
                /* IT STAYS A DOOR WHILE IT IS SHUT, and that is the point
                   rather than an oversight.

                   The first cut of this disabled the row and dimmed it, on
                   the reasoning that a link to a game you cannot play is a
                   link to a locked door. That is the wrong way round for a
                   game that has not launched: the page behind it says
                   "Coming soon!" over the room itself, with the furni
                   falling, and somebody who walks in and sees that is
                   somebody looking forward to it. Turning them away at the
                   menu is throwing away the only advertising the game has
                   before it opens.

                   So the row reports, it does not close. Nothing here is
                   disabled, nothing is dimmed, and the press goes where it
                   always went — the page's own gate decides what a visitor
                   is allowed to do once they arrive (see the head of
                   fallinfurni.html), which is where that decision belongs
                   and the only place it can be enforced anyway.

                   It is not marked out visually either — no class, no colour.
                   The row looks exactly like the ones around it and the
                   WORDS do the work. See the note by .side-menu-state in
                   css/style.css for the two treatments that were tried and
                   removed.

                   While it is COMING SOON, though, the press does something
                   better than a door: a load of seats falls down the page
                   (js/furni-rain.js), a taste of the game where the page
                   could only say it was not open yet. In maintenance, and
                   once it is live, the row goes to the game as before. */
                run: () => {
                    if (ffClosedState === "coming-soon" && window.FurniRain) window.FurniRain.start();
                    else window.location.href = "/fallinfurni";
                }
            },
            {
                /* Every board in one window (js/leaderboards.js), so the
                   scores can be looked at without finishing a game first.
                   Opens on "All dailies", the board of every game added
                   together, which is not shown at the end of a game any
                   more: this window is its home. */
                name: "Leaderboards",
                state: "Every game, added together",
                badge: "",
                on: false,
                run: () => { if (window.Leaderboards) Leaderboards.open("all"); }
            },
            // The end of the GAMES fold: what follows sits on its own, at
            // the foot of the menu.
            { endGroup: true },
            {
                /* Outside both folds, at the foot of the menu: it is a
                   reference sheet rather than part of the archive or a game.
                   Looking up the character behind a name like "ª Funky Maze
                   ª" is one of the things the site answers, in a window of
                   its own at /glyphs (js/glyphs.js). It used to be a separate
                   page opened in a new tab. */
                name: "Alt Codes",
                state: "Type the pictures in Habbo names",
                badge: "",
                on: false,
                run: () => { if (window.Glyphs) Glyphs.open(); }
            }
        ].filter(e => !(onPhone && e.name === "Alt Codes"));
        /* The sheet is a reference table of several hundred characters
           beside the key combinations that type them, and a key combination
           is a thing a phone does not have. Offering it there is a tab that
           opens onto a page you cannot use for the one thing it is for, so
           on a phone the menu simply does not carry it. The window still
           opens at /glyphs on a phone, for a link somebody was sent. */
    }

    /* The daily games were briefly offered a second time, as a row of buttons
       above the archive on a phone, on the reasoning that the spine holding
       them was too small to find.

       That solved the wrong half of it. The archive is the centrepiece of
       this page, and a stack of game buttons sitting above it pushed the
       window it exists for below the fold — so the first thing a phone
       showed was three ways to leave. The handle was the thing that needed
       fixing, and it has been: it is a proper burger now, at a size a thumb
       can find. The games are behind it, once, where the rest of the menu
       already lives. */

    (function wireSideMenu() {
        const spine = document.getElementById("side-spine");
        const menu = document.getElementById("side-menu");
        const drawer = document.getElementById("side-drawer");
        if (!spine || !menu || !drawer) return;

        /* The open class goes on the DRAWER, not the panel: on a desktop it
           is the whole unit that slides, and the panel is only revealed by
           having been pulled clear of the window. */
        const isOpen = () => drawer.classList.contains("is-open");

        /* Whether each fold (ARCHIVE, GAMES) is open. Shut on every page
           load, so the menu always opens short; kept only for the life of
           the page, so a fold opened and the menu closed and reopened is
           still open. It was remembered in the browser at first, which meant
           a fold opened once came back open after every reload. The old
           stored values are cleared so nobody is left with one. */
        const folds = new Map();
        const foldOpen = group => folds.get(group) === true;
        const rememberFold = (group, open) => { folds.set(group, open); };
        try {
            ["archive", "games"].forEach(g => localStorage.removeItem("mazerats_menu_" + g + "_open"));
        } catch (e) { /* private mode */ }

        function render() {
            /* A heading is not a row: it carries no state, no badge and no
               click, and rendering it as a disabled button would put it in
               the tab order for no reason. The index still comes from the
               same array, so what a row does is looked up by its own
               position rather than by counting past the headings. */
            /* Built once and kept, rather than asked for again inside the
               click. The list is no longer the same length at every width —
               a phone drops the Alt Codes row — so re-deriving it later
               risks looking up a row by an index that was true when the
               button was drawn and is not now. The rows a click can reach
               are exactly the rows that were drawn. */
            /* Somebody looking at this list is one click from a game, so
               fetch all three now if they are not here already (see
               js/daily-loader.js). It costs nothing on the common path —
               a returning player's were preloaded at idle and this finds
               them already in hand — and it means the click that follows
               opens a window that is filled rather than one that is filling.

               Fire and forget. Nothing below waits on it: the rows are
               drawn from whatever the status hooks can say right now, and
               what they say with the games absent is the sensible default
               wording each row already carries. */
            if (window.DailyGames) window.DailyGames.preloadAll();

            const entries = sideMenuEntries();
            const row = (e, i) => `
                <button type="button" class="side-menu-item${e.on ? " is-on" : ""}" data-i="${i}">
                    <span class="side-menu-name">
                        <span>${escapeHtml(e.name)}${e.tag ? `<span class="side-menu-tag">${escapeHtml(e.tag)}</span>` : ""}</span>
                        ${e.badge ? `<span class="side-menu-badge">${escapeHtml(e.badge)}</span>` : ""}
                    </span>
                    <span class="side-menu-state">${escapeHtml(e.state)}</span>
                </button>`;
            /* A group's rows go inside a fold under its button, up to the
               next heading, group or end marker. The fold is inert while
               shut, so its rows are out of the tab order as well as out of
               sight. */
            let html = "";
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                if (e.endGroup) continue;
                if (e.heading) { html += `<p class="side-menu-heading">${escapeHtml(e.heading)}</p>`; continue; }
                if (!e.group) { html += row(e, i); continue; }
                const open = foldOpen(e.group);
                let inner = "";
                while (i + 1 < entries.length && !entries[i + 1].heading && !entries[i + 1].group && !entries[i + 1].endGroup) {
                    i++;
                    inner += row(entries[i], i);
                }
                const id = "side-menu-fold-" + e.group.toLowerCase();
                html += `
                <button type="button" class="side-menu-group" aria-expanded="${open}" aria-controls="${id}" data-group="${escapeHtml(e.group)}">
                    <span class="side-menu-group-arrow" aria-hidden="true"></span>
                    <span>${escapeHtml(e.group)}</span>
                </button>
                <div class="side-menu-fold${open ? " is-open" : ""}" id="${id}"${open ? "" : " inert"}>
                    <div class="side-menu-fold-inner">${inner}</div>
                </div>`;
            }
            menu.innerHTML = html;

            menu.querySelectorAll(".side-menu-group").forEach(btn => {
                btn.addEventListener("click", e => {
                    // Opening the fold is not choosing anything: the menu
                    // stays where it is.
                    e.stopPropagation();
                    const open = btn.getAttribute("aria-expanded") !== "true";
                    rememberFold(btn.dataset.group, open);
                    const fold = document.getElementById(btn.getAttribute("aria-controls"));
                    btn.setAttribute("aria-expanded", String(open));
                    if (fold) {
                        fold.classList.toggle("is-open", open);
                        fold.toggleAttribute("inert", !open);
                    }
                });
            });

            menu.querySelectorAll(".side-menu-item").forEach(btn => {
                btn.addEventListener("click", () => {
                    const entry = entries[Number(btn.dataset.i)];
                    // Closed BEFORE the view changes underneath it, or the
                    // menu is left sitting over the thing it just went to.
                    // Focus goes to the spine first: closing makes the
                    // menu inert, which would drop focus from this row to
                    // the body, and every window opened below records the
                    // focused element as the place to hand focus back to.
                    spine.focus({ preventScroll: true });
                    setOpen(false);
                    if (entry) entry.run();
                });
            });
        }

        function setOpen(open) {
            // Re-read on every open: the counts are only true at the moment
            // they are asked for.
            if (open) render();
            drawer.classList.toggle("is-open", open);
            spine.setAttribute("aria-expanded", open ? "true" : "false");
            /* On a desktop the closed menu is still display:flex, only slid
               behind the window, so its buttons stayed in the tab order and
               a keyboard user tabbed through a menu they could not see.
               inert takes them out (and out of the accessibility tree)
               without touching any style, so the slide is unchanged. A
               focused row loses focus to the body when this lands; every
               path that closes the menu then moves focus on itself (the
               row's own window, the spine on Escape, or whatever was
               clicked). */
            menu.toggleAttribute("inert", !open);
        }
        // Closed at load, so inert from the start.
        menu.setAttribute("inert", "");

        spine.addEventListener("click", e => {
            e.stopPropagation();
            const open = !isOpen();
            setOpen(open);
            if (open) {
                // The first thing that can take focus: the GAMES button,
                // or a row if the menu ever opens with no group in it.
                const first = menu.querySelector(".side-menu-group, .side-menu-item");
                if (first) first.focus({ preventScroll: true });
            }
        });

        // Anywhere else on the page closes it, which is what a menu that
        // covers content has to do.
        document.addEventListener("click", e => {
            if (!isOpen()) return;
            if (drawer.contains(e.target)) return;
            setOpen(false);
        });

        // Escape goes through the shared top-most-layer rule (EscapeLayers
        // in js/site.js), so it closes the menu only when nothing sits in
        // front of it.
        registerEscapeLayer(
            () => isOpen() ? [drawer] : [],
            () => { setOpen(false); spine.focus({ preventScroll: true }); }
        );

    })();

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
            showFurni = false;
           
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
            showFurni = false;
           
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
        if (showFeatured) { showWhatsNew = false; showFurni = false; furniFilter = null; }
        searchInput.value = "";
        query = "";
        render();
    });

    /* What's New is a toggle over whatever is underneath, so leaving it puts
       the visitor back exactly where they were — the same shape as the
       featured button above, and for the same reason. The search box is
       cleared on the way in and out: a term typed against the archive is
       rarely the one you want against a list of twelve. */
    /* Its own function rather than a click handler's body, because the side
       menu now needs to do exactly this and there must not be two versions
       of "what What's New does". The button itself is gone from the markup
       — the menu replaced it — but the wiring below is kept and guarded, so
       putting it back anywhere is a line of HTML. */
    function toggleWhatsNew() {
        showWhatsNew = !showWhatsNew;
        // One view at a time: all three write into the same panel.
        if (showWhatsNew) { showFeatured = false; showTimeline = false; showFurni = false; furniFilter = null; }
        searchInput.value = "";
        query = "";
        render();
    }

    if (whatsNewBtn) {
        whatsNewBtn.dataset.track = "whats-new";
        whatsNewBtn.addEventListener("click", toggleWhatsNew);
    }

    if (timelineBtn) {
        timelineBtn.dataset.track = "timeline";
        timelineBtn.addEventListener("click", () => {
            showTimeline = !showTimeline;
            if (showTimeline) { showFeatured = false; showWhatsNew = false; showFurni = false; furniFilter = null; }
            searchInput.value = "";
            query = "";
            render();
            // The timeline opens on the newest year, and the panel may be
            // holding the scroll position of whatever list was in it.
            const results = document.querySelector(".home-results");
            if (results) results.scrollTop = 0;
        });
    }

    /* Browse by furni. Same toggle shape as the two above it, with one extra
       job: pressing it while a furni's mazes are being shown steps BACK to
       the list of furni rather than out of the view altogether, because that
       listing is one level inside this one, not beside it. */
    if (furniBtn) {
        furniBtn.dataset.track = "furni-browse";
        furniBtn.addEventListener("click", () => {
            if (furniFilter) {
                furniFilter = null;
                showFurni = true;
            } else {
                showFurni = !showFurni;
            }
            if (showFurni) { showFeatured = false; showWhatsNew = false; showTimeline = false; }
            searchInput.value = "";
            query = "";
            render();
            const results = document.querySelector(".home-results");
            if (results) results.scrollTop = 0;
        });
    }

    // Sits on top of #featured-mazes-btn's own header strip (see its CSS)
    // rather than inside it, so this click is its own event, not a bubble
    // off the button underneath — no stopPropagation needed.
    featuredRefreshBtn.addEventListener("click", refreshFeaturedList);

    /* "Clear filter": the search box emptied (which is where every filter
       lives — see withFilter), and a furni listing let go of, back to the
       plain archive in whichever tab and view was underneath. The address
       loses its ?q= with it, through render's syncSearchToUrl. */
    const clearFilterBtn = document.getElementById("clear-filter-btn");
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener("click", () => {
            searchInput.value = "";
            query = "";
            if (furniFilter) {
                furniFilter = null;
                showFurni = false;
            }
            render();
            const results = document.querySelector(".home-results");
            if (results) results.scrollTop = 0;
            searchInput.focus({ preventScroll: true });
        });
    }

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
    // The window's filter chips — tags, difficulty, hotel, "More by".
    modalOverlay.addEventListener("click", e => {
        const chip = e.target.closest("[data-filter-key]");
        if (!chip || !modalOverlay.contains(chip)) return;
        applyFilterChip(chip.dataset.filterKey, chip.dataset.filterValue, modalItem);
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

    /* Escape, one layer per press, front-most first — the picture over the
       modal, then the tab pulled out of it, then the modal — through the
       one shared rule in js/site.js (EscapeLayers) rather than this
       listener's own if/else chain, which only knew about the three layers
       in this file and could not see the console or the photo frames
       sitting in front of them. */
    function registerEscapeLayer(elements, close) {
        if (window.EscapeLayers) window.EscapeLayers.register({ elements, close });
    }

    registerEscapeLayer(
        () => lightboxOverlay.classList.contains("open") ? [lightboxOverlay] : [],
        () => closeLightbox()
    );
    if (actionsDrawer && actionsSpine) {
        registerEscapeLayer(
            () => actionsOpen() && modalOverlay.classList.contains("open") ? [actionsDrawer] : [],
            () => { setActionsOpen(false); actionsSpine.focus({ preventScroll: true }); }
        );
    }
    registerEscapeLayer(
        () => modalOverlay.classList.contains("open") && !modalOverlay.classList.contains("closing") ? [modalOverlay] : [],
        () => closeModal()
    );
    // Photo frames and furni cards float over everything and can be open
    // several at once; Escape takes them down one at a time, front first.
    registerEscapeLayer(() => openPhotoFrames.slice(), frame => closePhotoFrame(frame));
    registerEscapeLayer(() => openFurniCards.slice(), card => closeFurniCard(card));
    /* The two daily games keep their own Escape listeners in js/guess.js
       and js/oddoneout.js. Registered here so they take part in the same
       ordering — the shared listener stops the event once it acts, so theirs
       never fire as well — and closed through their own X, which runs
       exactly the close() those listeners would have. */
    ["guess", "odd"].forEach(name => {
        const overlay = document.getElementById(`${name}-overlay`);
        const x = document.getElementById(`${name}-close`);
        if (!overlay || !x) return;
        registerEscapeLayer(
            () => overlay.classList.contains("open") ? [overlay] : [],
            () => x.click()
        );
    });

    document.addEventListener("keydown", e => {
        if (!modalOverlay.classList.contains("open")) return;
        /* The arrows only belong to the gallery while the visitor is in
           the window (or its lightbox) — not while typing in a field, and
           not while focus is in something drawn over it, like the console
           (z 200) whose forms were flipping the rooms behind them with
           every cursor move. EscapeLayers keeps its ordering to itself, so
           where focus is stands in for "what is on top". Focus on <body>
           (nothing focused, e.g. after a click on plain page) still counts
           as the window, as it did before. */
        const focusEl = document.activeElement;
        const typing = focusEl && (focusEl.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(focusEl.tagName));
        const inWindow = !focusEl || focusEl === document.body
            || modalOverlay.contains(focusEl) || lightboxOverlay.contains(focusEl);
        if (activeGallery && !typing && inWindow) {
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
    /* fromHashChange is true when the browser moved to this address while
       the page was already open (a link, or Back/Forward), false for the
       address the page loaded with — the modal's history handling treats
       the two differently; see "the modal and the Back button". */
    function openFromHash(fromHashChange) {
        if (!dataLoaded) return;
        // Mid-way through stepping back off a closed modal's entries: the
        // hash about to be left is not a request to open anything.
        if (pendingBack) return;
        const m = /^#(event|maze)-(.+)$/.exec(location.hash);
        if (!m) return;
        // Already showing exactly this: nothing to open.
        if (modalOverlay.classList.contains("open") && !modalOverlay.classList.contains("closing")
            && shownModalHash && sameModalHash(location.hash, shownModalHash)) return;
        /* A bare "%" that is not an escape — a hand-edited or truncated
           link — makes decodeURIComponent throw, and uncaught here it took
           the load path down with it: openFromHash runs straight after the
           first render. A hash that does not decode names nothing, so it is
           ignored like any other unknown id. */
        let id;
        try { id = decodeURIComponent(m[2]); } catch (e) { return; }
        const opts = { fromHashChange: fromHashChange === true };
        if (m[1] === "event") {
            const match = EVENTS.find(e => e.id === id);
            if (match) openModal(normalize(match, true), opts);
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
        openModal(normalize(match, false), opts);
    }

    window.addEventListener("hashchange", () => openFromHash(true));

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

    /* A stalled THUMBNAIL must never hold the page hostage. Whatever has
       arrived by then is shown regardless.

       IT IS COUNTED FROM WHEN THE DATA LANDS, not from page load, and that
       distinction is the whole of a bug worth describing. Started at page
       load it was a flat 8s cap on everything — while the archive request
       itself is allowed two attempts totalling up to 25s. So on exactly the
       slow load where a visitor most needs to see something happening, the
       loading bar removed itself at eight seconds and left them looking at a
       bare page for another seventeen, with no way to tell a slow site from a
       broken one. The requests cannot hang forever on their own account —
       _getWithFallback always resolves, on its own timeout if nothing else —
       so letting them keep the bar up is safe.

       And a word after ten seconds, because a progress bar that has not moved
       is only reassuring for so long. */
    const LOADER_MAX_WAIT = 8000;
    const LOADER_SLOW_AFTER = 10000;

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

    // Set once the load has gone on long enough to be worth remarking on, so
    // drawLoader keeps saying so on every subsequent repaint.
    let loaderSlow = false;

    function drawLoader() {
        if (!loaderEl) return;
        const pct = loadTotal ? Math.min(1, loadDone / loadTotal) : 1;
        const track = loaderFill.parentElement.clientWidth;
        // Snapped down to whole blocks so none is ever drawn half-width.
        loaderFill.style.width = (Math.floor((pct * track) / LOADER_BLOCK) * LOADER_BLOCK) + "px";
        loaderLabel.textContent = loaderSlow
            ? "STILL LOADING " + Math.round(pct * 100) + "%"
            : "LOADING " + Math.round(pct * 100) + "%";
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

    /* No blanket cap from here — see LOADER_MAX_WAIT. The bar stays up for as
       long as the archive is genuinely still being fetched, and the cap is
       armed below once that has finished, to cover the thumbnails it was
       written for. */
    const slowTimer = setTimeout(() => {
        loaderSlow = true;
        drawLoader();
    }, LOADER_SLOW_AFTER);

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
        /* ABOVE .archive-stack, NOT INSIDE IT.

           This used to insert itself directly before #browse-window, which put
           it inside .archive-stack — and that stack is load-bearing in two
           ways this notice quietly broke.

           The menu tab hangs off it: .side-drawer is absolutely positioned at
           `top: var(--spine-top)` (92px), measured from the stack, on the
           understanding that the stack begins at the window. Put a 130px
           notice in front of the window and the window moves down while the
           spine does not — measured at 39px adrift, the tab floating in the
           gap above the window instead of attached to its edge.

           And the stack is `width: fit-content`, so a notice wider than the
           window stretched it, moving the window off the centre it shares
           with everything else on the page.

           Sitting above the stack, the notice is just a block in the column
           and the archive window keeps its own geometry entirely. */
        const stack = document.querySelector(".archive-stack");
        const host = stack || document.getElementById("browse-window") || document.querySelector(".chrome-window");
        if (!host || !host.parentNode) return;

        /* WHAT THIS SAYS, AND WHY IT IS WORDED THIS WAY.

           The first version was one apologetic sentence — "Couldn't load the
           live room data. Showing a small offline copy — most of the archive
           is missing." — which is accurate and reads like a broken page. It
           put the shortfall first, gave no sense of whether this was the
           visitor's problem or ours, and offered no reason to think trying
           again would help.

           Three parts instead. A heading that names the state plainly, a line
           that says it is temporary and on our side, and the retry. Somebody
           who lands mid-outage should come away knowing the archive exists
           and is coming back — not that the site is broken.

           A heading rather than a shout: the tone of the rest of the site is
           quiet, and an outage notice in red capitals would be the loudest
           thing on a page about maze rooms. */
        const notice = document.createElement("div");
        notice.id = "data-degraded-notice";
        notice.className = "callout data-degraded-notice";
        // alert, not status: this changes what the page in front of them IS,
        // and a screen reader should be told without waiting for a pause.
        notice.setAttribute("role", "alert");

        const what = [...Api._degraded].join(" and ");
        notice.innerHTML =
            '<div class="data-degraded-body">' +
                '<p class="data-degraded-head">The archive is offline</p>' +
                "<p class=\"data-degraded-say\">We can't reach the live " + escapeHtml(what) +
                " right now, so you're seeing a small offline copy — most of the archive isn't here. " +
                "This is usually brief; the full archive should be back shortly.</p>" +
            "</div>" +
            '<button type="button" class="btn data-degraded-retry" id="data-degraded-retry">Try again</button>';

        host.parentNode.insertBefore(notice, host);

        /* Reloading is the honest retry: the fallback data is already in
           memory and every request this page makes happens at start-up, so
           there is nothing to re-run in place. Says what it is doing while it
           happens, because a button that looks inert is a button people press
           four times. */
        const retry = notice.querySelector("#data-degraded-retry");
        if (retry) {
            retry.addEventListener("click", () => {
                retry.disabled = true;
                retry.textContent = "Reconnecting…";
                location.reload();
            });
        }
    }

    Promise.all([roomsReq, eventsReq]).then(async ([rooms, events]) => {
        ROOMS = rooms;
        EVENTS = events;
        // New records, so every cached search string is for an object that
        // no longer exists — dropped whole rather than left to the GC.
        haystackCache = new WeakMap();
        furniNameCache = new WeakMap();

        /* The archive is in. From here the only thing left to wait for is
           thumbnails, which is what the cap was always for — so arm it now
           rather than at page load, where it was cutting the loader off
           mid-request. */
        clearTimeout(slowTimer);
        setTimeout(hideLoader, LOADER_MAX_WAIT);

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
        // Which records are marked as dead ends. Small and edge-cached, and
        // nothing waits on it: a maze's window re-draws its strip when it
        // lands (see loadDeadEnds).
        loadDeadEnds();

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

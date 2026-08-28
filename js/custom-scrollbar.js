/* Custom pixel-art scrollbar for .home-results/.room-desc-box (homepage),
   #rooms-list/#events-list/#admins-list (admin page), #console-screen-scroll
   (console modal) and .gallery-strip (the maze modal's thumbnail slider) —
   see css/style.css's .custom-scrollbar-* rules for why this exists as real
   DOM elements instead of ::-webkit-scrollbar-track/-thumb/-button image
   styling: that approach didn't actually render its background-images in
   real testing, and only ever worked in WebKit browsers to begin with.
   This runs identically everywhere since it's just normal elements/CSS.

   Wraps each target at runtime (no HTML changes needed) rather than
   requiring every page that has one of these elements to carry the extra
   markup by hand. The wrapped element keeps scrolling exactly as before —
   wheel, touch, keyboard, and any code that sets its scrollTop/scrollLeft
   all still work untouched — this only adds a visual bar that mirrors that
   state and offers drag/click/arrow controls of its own.

   Works on either axis. The DOM it builds is identical both ways: the two
   arrows are "start" and "end" rather than up and down, and a single
   modifier class (.custom-scrollbar--horizontal) drives every difference,
   including swapping in the rotated sprites. Everything the two axes
   differ on is collected in the AXES table below, so the logic underneath
   is written once rather than duplicated per direction. */
document.addEventListener("DOMContentLoaded", () => {
    // Maps each axis onto the DOM properties it uses, so refresh()/drag/
    // paging can be written once. "main" is the axis the bar runs along.
    const AXES = {
        y: {
            scrollPos: "scrollTop",
            scrollSize: "scrollHeight",
            clientSize: "clientHeight",
            trackSize: "clientHeight",
            start: "top",
            size: "height",
            pointer: "clientY",
            bgOffset: (px) => "0 -" + px + "px"
        },
        x: {
            scrollPos: "scrollLeft",
            scrollSize: "scrollWidth",
            clientSize: "clientWidth",
            trackSize: "clientWidth",
            start: "left",
            size: "width",
            pointer: "clientX",
            bgOffset: (px) => "-" + px + "px 0"
        }
    };

    document.querySelectorAll(".home-results, .room-desc-box, #rooms-list, #events-list, #admins-list, #console-screen-scroll, #glyph-palette-list")
        .forEach(el => setUp(el, "y"));

    // The maze modal's thumbnail strip (and the old-versions strip, which is
    // the same component) scroll sideways rather than down.
    document.querySelectorAll(".gallery-strip").forEach(el => setUp(el, "x"));

    function setUp(el, axis) {
        if (el.dataset.customScrollbar) return;
        el.dataset.customScrollbar = "true";

        const A = AXES[axis];
        const horizontal = axis === "x";

        const wrap = document.createElement("div");
        wrap.className = "custom-scrollbar-wrap";
        if (horizontal) wrap.classList.add("custom-scrollbar-wrap--horizontal");
        if (el.classList.contains("home-results")) {
            wrap.classList.add("custom-scrollbar-wrap--results");
        }
        // The description panel is drawn on this wrapper rather than on
        // .room-desc-box itself, so the frame encloses the scrollbar too
        // instead of the bar sitting outside a bordered box.
        if (el.classList.contains("room-desc-box")) {
            wrap.classList.add("custom-scrollbar-wrap--desc");
        }
        if (el.classList.contains("gallery-strip")) {
            wrap.classList.add("custom-scrollbar-wrap--strip");
        }
        // The glyph palette borrows the console's bar art too — same
        // pixel sprites, so the two read as the same control rather than
        // the admin page growing a second scrollbar style of its own.
        if (el.id === "console-screen-scroll" || el.id === "glyph-palette-list") {
            wrap.classList.add("custom-scrollbar-wrap--console");
        }

        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
        el.classList.add("custom-scrollbar-target");

        const bar = document.createElement("div");
        bar.className = "custom-scrollbar" + (horizontal ? " custom-scrollbar--horizontal" : "");
        bar.innerHTML =
            '<button type="button" class="custom-scrollbar-arrow custom-scrollbar-arrow-up" tabindex="-1" aria-hidden="true"></button>' +
            '<div class="custom-scrollbar-track">' +
                '<div class="custom-scrollbar-track-segment custom-scrollbar-track-segment-upper"></div>' +
                '<div class="custom-scrollbar-track-segment custom-scrollbar-track-segment-lower"></div>' +
                '<div class="custom-scrollbar-thumb"></div>' +
            '</div>' +
            '<button type="button" class="custom-scrollbar-arrow custom-scrollbar-arrow-down" tabindex="-1" aria-hidden="true"></button>';
        wrap.appendChild(bar);

        const track = bar.querySelector(".custom-scrollbar-track");
        const segUpper = bar.querySelector(".custom-scrollbar-track-segment-upper");
        const segLower = bar.querySelector(".custom-scrollbar-track-segment-lower");
        const thumb = bar.querySelector(".custom-scrollbar-thumb");
        const arrowUp = bar.querySelector(".custom-scrollbar-arrow-up");
        const arrowDown = bar.querySelector(".custom-scrollbar-arrow-down");

        const ARROW_STEP = 40;
        const THUMB_SIZE = 15; // matches the sprite's own natural size — see the CSS comment on .custom-scrollbar-thumb for why this isn't stretched/tiled to represent scroll proportion instead.
        const TRACK_TILE = 15; // track sprite's own size, for phasing the two segments' tiling to line up as one continuous texture — see the CSS comment on .custom-scrollbar-track-segment.

        // True only while a track half is being held down. The two track
        // segments are frozen at their press-time sizes for that whole
        // hold: paging moves the thumb toward the click, which shrinks the
        // very segment being pressed, and where one page step covers the
        // entire scroll range — the maze modal's thumbnail strip, whose
        // visible width is nearly its full scrollable width — that segment
        // collapses to zero on the first step, leaving the .is-active
        // highlight painted on a box with no width and the press looking
        // like it did nothing. The thumb and arrows keep updating
        // normally throughout; only the two segment boxes hold still, and
        // they snap back to the truth on release.
        let paging = false;

        function refresh() {
            // The maze modal shows and hides its strip by setting display on
            // the element itself (see js/home.js), which would otherwise
            // leave this wrapper — and its bar — holding layout space where
            // the strip used to be. Following the target's own visibility
            // keeps the wrapper honest without home.js needing to know this
            // file exists.
            const hidden = getComputedStyle(el).display === "none";
            wrap.style.display = hidden ? "none" : "";
            if (hidden) return;

            const maxScroll = el[A.scrollSize] - el[A.clientSize];
            const scrollable = maxScroll > 1;
            // A class instead of directly setting visibility here — lets
            // CSS decide what "not enough content" actually looks like per
            // instance. Every other wrap keeps the old behaviour (hidden
            // entirely, see the bare .is-unscrollable rule), but
            // .custom-scrollbar-wrap--console overrides it back to visible
            // with a disabled look instead of disappearing completely.
            bar.classList.toggle("is-unscrollable", !scrollable);
            arrowUp.classList.toggle("is-disabled", !scrollable || el[A.scrollPos] <= 0);
            arrowDown.classList.toggle("is-disabled", !scrollable || el[A.scrollPos] >= maxScroll - 1);

            if (!scrollable) {
                // Nothing to scroll — the thumb sits at its normal size,
                // pinned to the start of the track, with the (inactive)
                // track showing beyond it — the same resting position a
                // scrollable page's thumb sits in at the start, just
                // disabled-looking, rather than stretched into one solid bar.
                thumb.style[A.start] = "0px";
                thumb.style[A.size] = THUMB_SIZE + "px";
                if (!paging) {
                    segUpper.style[A.size] = "0px";
                    segLower.style[A.start] = THUMB_SIZE + "px";
                    segLower.style[A.size] = Math.max(0, track[A.trackSize] - THUMB_SIZE) + "px";
                    segLower.style.backgroundPosition = A.bgOffset(THUMB_SIZE % TRACK_TILE);
                }
                return;
            }

            thumb.style[A.size] = THUMB_SIZE + "px";
            const maxThumbStart = track[A.trackSize] - THUMB_SIZE;
            const thumbStart = Math.round(maxThumbStart * (el[A.scrollPos] / maxScroll));
            const thumbEnd = thumbStart + THUMB_SIZE;

            thumb.style[A.start] = thumbStart + "px";

            if (!paging) {
                segUpper.style[A.start] = "0px";
                segUpper.style[A.size] = thumbStart + "px";

                segLower.style[A.start] = thumbEnd + "px";
                segLower.style[A.size] = Math.max(0, track[A.trackSize] - thumbEnd) + "px";
                segLower.style.backgroundPosition = A.bgOffset(thumbEnd % TRACK_TILE);
            }
        }

        el.addEventListener("scroll", refresh);
        window.addEventListener("resize", refresh);

        // Catches content being added/removed/resized (room rows loading in,
        // a modal description swapping text, a strip being rebuilt for a
        // different maze) without any of the pages that use these elements
        // needing to call back into this file.
        new ResizeObserver(refresh).observe(el);
        new MutationObserver(refresh).observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "class"] });

        let dragging = false;
        let dragStartPointer = 0;
        let dragStartScroll = 0;

        thumb.addEventListener("mousedown", (e) => {
            dragging = true;
            thumb.classList.add("is-dragging");
            dragStartPointer = e[A.pointer];
            dragStartScroll = el[A.scrollPos];
            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        window.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            const maxScroll = el[A.scrollSize] - el[A.clientSize];
            const maxThumbStart = track[A.trackSize] - THUMB_SIZE;
            if (maxThumbStart <= 0) return;
            const delta = e[A.pointer] - dragStartPointer;
            el[A.scrollPos] = dragStartScroll + (delta / maxThumbStart) * maxScroll;
            // Setting scrollTop/scrollLeft directly doesn't reliably fire a
            // native "scroll" event (unlike an actual wheel/touch/keyboard
            // scroll), so the listener above can't be the only thing calling
            // refresh() for interactions this file itself drives.
            refresh();
        });

        window.addEventListener("mouseup", () => {
            if (!dragging) return;
            dragging = false;
            thumb.classList.remove("is-dragging");
            document.body.style.userSelect = "";
        });

        // Click/hold on one of the two track segments (not the thumb) —
        // page toward the click, then keep paging while the button stays
        // held down. Which segment was actually hit (rather than a pointer
        // comparison against the thumb) is also what decides the scroll
        // direction and which half gets .is-active — that segment stays
        // the one lit up for the whole hold, even as paging shrinks it.
        let trackIntervalId = null;
        let activeSegment = null;

        function pageTrack(direction) {
            el[A.scrollPos] += direction * el[A.clientSize] * 0.9;
            refresh();
        }

        track.addEventListener("mousedown", (e) => {
            const segment = e.target === segUpper ? segUpper : e.target === segLower ? segLower : null;
            if (!segment) return;
            const direction = segment === segUpper ? -1 : 1;

            paging = true;
            activeSegment = segment;
            segment.classList.add("is-active");
            pageTrack(direction);
            trackIntervalId = setInterval(() => pageTrack(direction), 350);
        });

        function stopTrackPaging() {
            if (activeSegment) {
                activeSegment.classList.remove("is-active");
                activeSegment = null;
            }
            if (trackIntervalId) {
                clearInterval(trackIntervalId);
                trackIntervalId = null;
            }
            // Segments resume tracking the real scroll position, and one
            // refresh puts them where they should have been all along.
            if (paging) {
                paging = false;
                refresh();
            }
        }
        window.addEventListener("mouseup", stopTrackPaging);
        track.addEventListener("mouseleave", stopTrackPaging);

        // Arrow buttons — a single nudge on click, repeating while held.
        function wireArrow(btn, direction) {
            let intervalId = null;
            function step() { el[A.scrollPos] += direction * ARROW_STEP; refresh(); }
            btn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                step();
                intervalId = setInterval(step, 80);
            });
            function stop() {
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
            }
            window.addEventListener("mouseup", stop);
            btn.addEventListener("mouseleave", stop);
        }
        wireArrow(arrowUp, -1);
        wireArrow(arrowDown, 1);

        refresh();
    }
});

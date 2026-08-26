/* Custom pixel-art scrollbar for .home-results/.room-desc-box (homepage)
   and #rooms-list/#events-list/#admins-list (admin page) — see css/
   style.css's .custom-scrollbar-* rules for why this exists as real DOM
   elements instead of ::-webkit-scrollbar-track/-thumb/-button image
   styling: that approach didn't actually render its background-images in
   real testing, and only ever worked in WebKit browsers to begin with.
   This runs identically everywhere since it's just normal elements/CSS.

   Wraps each target at runtime (no HTML changes needed) rather than
   requiring every page that has one of these elements to carry the extra
   markup by hand. The wrapped element keeps scrolling exactly as before —
   wheel, touch, keyboard, and any code that sets its scrollTop all still
   work untouched — this only adds a visual bar that mirrors that state and
   offers drag/click/arrow controls of its own. */
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".home-results, .room-desc-box, #rooms-list, #events-list, #admins-list").forEach(setUp);

    function setUp(el) {
        if (el.dataset.customScrollbar) return;
        el.dataset.customScrollbar = "true";

        const wrap = document.createElement("div");
        wrap.className = "custom-scrollbar-wrap";
        if (el.classList.contains("home-results")) {
            wrap.classList.add("custom-scrollbar-wrap--results");
        }

        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
        el.classList.add("custom-scrollbar-target");

        const bar = document.createElement("div");
        bar.className = "custom-scrollbar";
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
        const THUMB_HEIGHT = 15; // matches the sprite's own natural size — see the CSS comment on .custom-scrollbar-thumb for why this isn't stretched/tiled to represent scroll proportion instead.
        const TRACK_TILE = 15; // track sprite's own height, for phasing the two segments' tiling to line up as one continuous texture — see the CSS comment on .custom-scrollbar-track-segment.

        function refresh() {
            const maxScrollTop = el.scrollHeight - el.clientHeight;
            const scrollable = maxScrollTop > 1;
            bar.style.visibility = scrollable ? "visible" : "hidden";
            arrowUp.classList.toggle("is-disabled", !scrollable || el.scrollTop <= 0);
            arrowDown.classList.toggle("is-disabled", !scrollable || el.scrollTop >= maxScrollTop - 1);
            if (!scrollable) return;

            const maxThumbTop = track.clientHeight - THUMB_HEIGHT;
            const thumbTop = Math.round(maxThumbTop * (el.scrollTop / maxScrollTop));
            const thumbBottom = thumbTop + THUMB_HEIGHT;

            thumb.style.top = thumbTop + "px";

            segUpper.style.top = "0px";
            segUpper.style.height = thumbTop + "px";

            segLower.style.top = thumbBottom + "px";
            segLower.style.height = Math.max(0, track.clientHeight - thumbBottom) + "px";
            segLower.style.backgroundPosition = "0 -" + (thumbBottom % TRACK_TILE) + "px";
        }

        el.addEventListener("scroll", refresh);
        window.addEventListener("resize", refresh);

        // Catches content being added/removed/resized (room rows loading in,
        // a modal description swapping text) without any of the pages that
        // use these elements needing to call back into this file.
        new ResizeObserver(refresh).observe(el);
        new MutationObserver(refresh).observe(el, { childList: true, subtree: true, characterData: true });

        let dragging = false;
        let dragStartY = 0;
        let dragStartScrollTop = 0;

        thumb.addEventListener("mousedown", (e) => {
            dragging = true;
            thumb.classList.add("is-dragging");
            dragStartY = e.clientY;
            dragStartScrollTop = el.scrollTop;
            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        window.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            const maxScrollTop = el.scrollHeight - el.clientHeight;
            const maxThumbTop = track.clientHeight - THUMB_HEIGHT;
            if (maxThumbTop <= 0) return;
            const deltaY = e.clientY - dragStartY;
            el.scrollTop = dragStartScrollTop + (deltaY / maxThumbTop) * maxScrollTop;
            // Setting scrollTop directly doesn't reliably fire a native
            // "scroll" event (unlike an actual wheel/touch/keyboard scroll),
            // so the listener below can't be the only thing calling
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
        // held down. Which segment was actually hit (rather than a clickY
        // comparison against the thumb) is also what decides the scroll
        // direction and which half gets .is-active — that segment stays
        // the one lit up for the whole hold, even as paging shrinks it.
        let trackIntervalId = null;
        let activeSegment = null;

        function pageTrack(direction) {
            el.scrollTop += direction * el.clientHeight * 0.9;
            refresh();
        }

        track.addEventListener("mousedown", (e) => {
            const segment = e.target === segUpper ? segUpper : e.target === segLower ? segLower : null;
            if (!segment) return;
            const direction = segment === segUpper ? -1 : 1;

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
        }
        window.addEventListener("mouseup", stopTrackPaging);
        track.addEventListener("mouseleave", stopTrackPaging);

        // Arrow buttons — a single nudge on click, repeating while held.
        function wireArrow(btn, direction) {
            let intervalId = null;
            function step() { el.scrollTop += direction * ARROW_STEP; refresh(); }
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

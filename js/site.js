/* Shared site chrome */

// Routes an image path through Netlify's built-in Image CDN so the browser
// downloads a resized/compressed version instead of the full original —
// the room screenshots this site archives run 100-750KB each, but most
// places on the site only ever display them as small thumbnails. Pass the
// raw, un-encoded path/URL (this does its own encoding — don't wrap the
// result in encodeURI() too, or it'll double-encode and 404, same bug as
// upload.js previously had). Omit h for a fixed-width, aspect-preserving
// resize; pass both w and h for a cropped-to-fill thumbnail.
function imgCdn(path, w, h, q) {
    if (!path) return path;
    const params = new URLSearchParams({ url: path, w: String(w), q: String(q || 70) });
    if (h) {
        params.set("h", String(h));
        params.set("fit", "cover");
    }
    return `/.netlify/images?${params.toString()}`;
}

// Small "what's coming up" readout in the header — shown on every page that
// has the #header-events markup (a no-op elsewhere). Rotates through every
// upcoming event every 10s with the same clone-and-slide technique the maze
// modal's image carousel uses (see slideGalleryImage in home.js), so a
// second event's title/time slides in from the right while the first
// slides out to the left.
document.addEventListener("DOMContentLoaded", async () => {
    const widget = document.getElementById("header-events");
    const viewport = document.getElementById("header-events-viewport");
    const slideEl = document.getElementById("header-events-slide");
    if (!widget || !viewport || !slideEl || typeof Api === "undefined") return;

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function formatEventWhen(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
        const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
        return `${date}, ${time} UTC`;
    }

    function slideMarkup(event) {
        if (!event) {
            return `<p class="header-events-title">No upcoming events.</p><p class="header-events-when">Check back later!</p>`;
        }
        // Always points at home.html — from any other page this just
        // navigates there; from home.html itself it's a same-page hash
        // change, which home.js listens for (see openEventFromHash) to
        // open that event's modal without a full reload.
        const href = `home.html#event-${encodeURIComponent(event.id || "")}`;
        return `<a class="header-events-title" href="${href}">${escapeHtml(event.title || "")}</a><p class="header-events-when">${formatEventWhen(event.date)}</p>`;
    }

    let events = [];
    try {
        events = await Api.getEvents();
    } catch (e) {
        events = [];
    }

    const upcoming = events
        .filter(e => (e.status || "upcoming") === "upcoming" && e.date)
        .sort((a, b) => a.date.localeCompare(b.date));

    widget.style.display = "block";
    let index = 0;
    slideEl.innerHTML = slideMarkup(upcoming[0]);

    if (upcoming.length > 1) {
        setInterval(() => {
            const nextIndex = (index + 1) % upcoming.length;

            const outgoing = slideEl.cloneNode(true);
            outgoing.removeAttribute("id");
            outgoing.classList.add("header-events-slide-outgoing");
            outgoing.style.transition = "none";
            outgoing.style.transform = "translateX(0)";
            viewport.appendChild(outgoing);

            slideEl.style.transition = "none";
            slideEl.style.transform = "translateX(100%)";
            slideEl.innerHTML = slideMarkup(upcoming[nextIndex]);

            // Commits the "start" transforms above before the transition to
            // their end state is requested below — otherwise both style
            // writes get coalesced into one paint and neither one visibly
            // moves (same reflow trick as slideGalleryImage in home.js).
            void slideEl.offsetWidth;

            outgoing.style.transition = "";
            slideEl.style.transition = "";
            outgoing.style.transform = "translateX(-100%)";
            slideEl.style.transform = "translateX(0)";

            outgoing.addEventListener("transitionend", () => outgoing.remove(), { once: true });

            index = nextIndex;
        }, 10000);
    }
});


/* Shared site chrome */

// The old Coming Soon/Maintenance gate (redirecting a non-admin visitor to
// index.html, plus the "Dev Mode" pill for one who's allowed to stay) used
// to live here, running on DOMContentLoaded — but that's well after the
// page had already painted, so a gated visitor briefly saw the real page
// before being bounced. It only ever ran on home.html anyway (admin.html
// and index.html/welcome were both excluded), so it's since moved to an
// early, render-blocking inline script in home.html's own <head> instead —
// see the comment there for why it has to run that early.

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
        // On the welcome page (index.html) this is a same-page hash only —
        // js/welcome.js listens for it and opens its own lightweight event
        // modal right there, since home.html itself is off-limits to
        // regular visitors during Coming Soon/Maintenance and would just
        // bounce them straight back here anyway (see the pre-load gate in
        // home.html's own <head>). Everywhere else it still points at
        // home.html#event-<id> — a normal navigation from any other page,
        // or a same-page hash change already handled by home.js's own
        // openEventFromHash if already there.
        const isWelcome = document.body.dataset.page === "welcome";
        const href = isWelcome
            ? `#event-${encodeURIComponent(event.id || "")}`
            : `home.html#event-${encodeURIComponent(event.id || "")}`;
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

            // Rolling-ticker style — both slides travel upward together (the
            // outgoing one exits off the top, the incoming one enters from
            // below) rather than sliding sideways.
            const outgoing = slideEl.cloneNode(true);
            outgoing.removeAttribute("id");
            outgoing.classList.add("header-events-slide-outgoing");
            outgoing.style.transition = "none";
            outgoing.style.transform = "translateY(0)";
            viewport.appendChild(outgoing);

            slideEl.style.transition = "none";
            slideEl.style.transform = "translateY(100%)";
            slideEl.innerHTML = slideMarkup(upcoming[nextIndex]);

            // Commits the "start" transforms above before the transition to
            // their end state is requested below — otherwise both style
            // writes get coalesced into one paint and neither one visibly
            // moves (same reflow trick as slideGalleryImage in home.js).
            void slideEl.offsetWidth;

            outgoing.style.transition = "";
            slideEl.style.transition = "";
            outgoing.style.transform = "translateY(-100%)";
            slideEl.style.transform = "translateY(0)";

            outgoing.addEventListener("transitionend", () => outgoing.remove(), { once: true });

            index = nextIndex;
        }, 10000);
    }
});

// "Fellow Fansites" strip, injected right before .site-footer on every page
// that has one — kept in one shared place rather than pasted into each
// HTML file by hand, so the list only ever needs updating here.
document.addEventListener("DOMContentLoaded", () => {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;

    const SITES = [
        ["Bobba.me", "https://bobba.me/"],
        ["DuckieWorld", "https://duckieworld.com/"],
        ["FranklyOrigins", "https://franklyorigins.net/"],
        ["FurniIndex", "https://furniindex.com/"],
        ["HabboBase", "https://habbobase.com/"],
        ["HabboFishing", "https://habbofishing.com/"],
        ["HabboGardening", "https://habbogardening.com/"],
        ["Leet.show", "https://leet.show/"],
        ["RockHabbo", "https://rockhabbo.com/"],
        ["solochef.io", "https://solochef.io/"]
    ];

    const section = document.createElement("div");
    section.className = "fellow-fansites";
    section.innerHTML = `
        <p class="fellow-fansites-title">Fellow Fansites</p>
        <p class="fellow-fansites-links">
            ${SITES.map(([label, url]) =>
                // Each link and the dot that follows it are one wrapping unit.
                // The list is a centred flex row (see .fellow-fansites-links),
                // so the separators are laid out as real boxes with real gaps
                // rather than as inline text: every wrapped line then centres on
                // its own items instead of being pushed off-centre by a dangling
                // dot and its surrounding spaces. The last item's dot is hidden
                // in CSS rather than skipped here.
                `<span class="fellow-fansites-item"><a href="${url}" target="_blank" rel="noopener">${label}</a><span class="fellow-fansites-dot" aria-hidden="true">&bull;</span></span>`
            ).join("")}
        </p>
    `;
    footer.parentNode.insertBefore(section, footer);
});

// Privacy Policy link, appended onto the end of .site-footer's own
// copyright line (its last <p>) rather than as a separate line of its
// own — the policy itself lives on the homepage console modal's Privacy
// page (js/console.js), not a standalone page, so this always points back
// there: a same-page hash on home.html itself (no reload, just opens the
// console via console.js's own hashchange listener), or a normal
// navigation to home.html#privacy from anywhere else.
document.addEventListener("DOMContentLoaded", () => {
    const footer = document.querySelector(".site-footer");
    const copyrightLine = footer ? footer.querySelector("p:last-child") : null;
    if (!copyrightLine) return;

    // index.html gets a same-page hash too, not a link to home.html:
    // during Coming Soon/Maintenance that page bounces every non-admin
    // straight back here (see its own pre-load gate), which made the
    // policy unreachable for precisely the visitors who can only see
    // the landing page. js/welcome.js opens its own modal off this hash.
    const page = document.body.dataset.page;
    const href = (page === "home" || page === "welcome") ? "#privacy" : "home.html#privacy";
    copyrightLine.insertAdjacentHTML(
        "beforeend",
        ` <span class="footer-dot" aria-hidden="true">&middot;</span> <a href="${href}">Privacy Policy</a>`
    );
});


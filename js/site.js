/* Shared site chrome */

// While the landing page is set to Coming Soon or Maintenance (see the
// admin page's Landing Page controls, netlify/functions/settings.js),
// every page except admin.html and index.html itself should be off-limits
// to the public — visitors land back on index.html regardless of what URL
// they hit. A logged-in admin is the one exception: they can keep roaming
// normally so they can actually check the site while it's down, but get a
// visible reminder they're doing it — a faded-orange header and a state
// pill next to the brand — so it's never mistaken for the site being live
// for everyone. Runs on every page site.js is loaded on; admin.html is
// skipped since it's explicitly exempt and would otherwise redirect
// itself, and index.html (data-page="welcome") is skipped since it's
// already the redirect target — it only loads site.js at all for the
// shared header-events ticker below, not this gate.
document.addEventListener("DOMContentLoaded", async () => {
    if (document.body.dataset.page === "admin" || document.body.dataset.page === "welcome" || typeof Api === "undefined") return;

    let landingState;
    try {
        ({ landingState } = await Api.getSiteSettings());
    } catch (e) {
        return; // Settings unreachable — fail open rather than lock visitors out.
    }
    if (landingState !== "coming-soon" && landingState !== "maintenance") return;

    // Same localStorage key admin.js's TOKEN_KEY uses — kept in sync
    // manually since each file already has its own small copy of the auth
    // plumbing (same pattern as DIFFICULTY_ORDER elsewhere in the admin).
    // localStorage rather than sessionStorage specifically so a token from
    // the admin tab is visible here even though this is a separate tab.
    const token = localStorage.getItem("mazerats_admin_token");
    let isAdmin = false;
    if (token) {
        try {
            const result = await Api.verifySession(token);
            isAdmin = !!(result && result.username);
        } catch (e) {
            isAdmin = false;
        }
    }

    if (!isAdmin) {
        window.location.href = "index.html";
        return;
    }

    const header = document.querySelector(".site-header");
    if (header) header.classList.add("site-header-notice");

    // .brand-group (home.html, admin.html) already holds the brand next to
    // the Discord/Admin badge, so appending here lands the pill in that
    // same row, right after Discord — truly next to it, not just somewhere
    // else in the header's own flex row. about.html has no .brand-group
    // wrapper at all, so it falls back to sitting right after .brand
    // instead — still reads fine there, just without a Discord pill beside
    // it to speak of.
    const brandGroup = document.querySelector(".brand-group");
    const brand = document.querySelector(".brand");
    const pill = document.createElement("span");
    pill.className = "header-badge header-state-pill";
    // Same pill text either way — an admin roaming during either state just
    // needs the reminder that they're seeing something the public can't
    // right now, not which specific state caused it (that's already on the
    // admin page's own Landing Page controls if they need it).
    pill.textContent = "Dev Mode";

    // Quick way back to the admin page from wherever the admin's actually
    // browsing — sits right after the Dev Mode pill, same spot admin.html's
    // own matching link back to home.html shows up (see admin.js).
    const adminLink = document.createElement("a");
    adminLink.className = "header-badge header-state-pill header-state-link";
    adminLink.href = "admin.html";
    adminLink.textContent = "Admin";

    if (brandGroup) {
        brandGroup.appendChild(pill);
        brandGroup.appendChild(adminLink);
    } else if (brand) {
        brand.insertAdjacentElement("afterend", pill);
        pill.insertAdjacentElement("afterend", adminLink);
    }
});

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
        // bounce them straight back here anyway (see js/site.js's own gate
        // further down this file). Everywhere else it still points at
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
                `<a href="${url}" target="_blank" rel="noopener">${label}</a>`
            ).join('<span class="fellow-fansites-dot" aria-hidden="true">•</span>')}
        </p>
    `;
    footer.parentNode.insertBefore(section, footer);
});

// Privacy Policy link, appended into .site-footer on every page that has
// one — the policy itself lives on the homepage console modal's Privacy
// page (js/console.js), not a standalone page, so this always points back
// there: a same-page hash on home.html itself (no reload, just opens the
// console via console.js's own hashchange listener), or a normal
// navigation to home.html#privacy from anywhere else.
document.addEventListener("DOMContentLoaded", () => {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;

    const href = document.body.dataset.page === "home" ? "#privacy" : "home.html#privacy";
    const p = document.createElement("p");
    p.innerHTML = `<a href="${href}">Privacy Policy</a>`;
    footer.appendChild(p);
});


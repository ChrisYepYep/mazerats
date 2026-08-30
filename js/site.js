/* Shared site chrome */

// The old Coming Soon/Maintenance gate (redirecting a non-admin visitor to
// index.html, plus the "Dev Mode" pill for one who's allowed to stay) used
// to live here, running on DOMContentLoaded — but that's well after the
// page had already painted, so a gated visitor briefly saw the real page
// before being bounced. It only ever ran on home.html anyway (admin.html
// and index.html/welcome were both excluded), so it's since moved to an
// early, render-blocking inline script in home.html's own <head> instead —
// see the comment there for why it has to run that early.

// Alphabetical sorting starts at the first real letter or number in a name,
// ignoring anything before it. Maze names can open with one of Volter
// Goldfish's picture glyphs (a star, a skull — see the palette on the admin
// page), which sort by codepoint and dumped every decorated name into a
// clump of its own instead of filing it under its actual name.
//
// A plain /\p{L}/ test is not enough to spot them: the font draws several of
// its pictures on codepoints Unicode classifies as letters — U+00AA and
// U+00BA are ordinal indicators, U+00B5 is micro, U+00CC-CE and U+00E6 are
// accented Latin — so those have to be named explicitly. Accented letters
// the font draws as actual letters (É, Ñ, ü and the rest) are deliberately
// absent, since a name starting with one should file under that letter.
//
// Keep this list in step with the picture group in js/glyph-palette.js.
const PICTURE_GLYPHS = new Set([
    0x0192, 0x2020, 0x2021, 0x2018, 0x2022, 0x2014, 0x00A5, 0x00AA,
    0x00AC, 0x00B1, 0x00B5, 0x00B6, 0x00BA, 0x00BB, 0x00CC, 0x00CD,
    0x00CE, 0x00D5, 0x00E6, 0x00EC, 0x00ED, 0x00EE, 0x00F5, 0x00F7
]);

// Digits count as real, so a name like "100% CONFUSED MAZE" still files
// under 1 rather than jumping to C.
function sortableName(name) {
    const text = String(name || "");
    let i = 0;
    // for...of walks codepoints, not UTF-16 units, so a surrogate pair is
    // never split in half.
    for (const ch of text) {
        if (!PICTURE_GLYPHS.has(ch.codePointAt(0)) && /[\p{L}\p{N}]/u.test(ch)) {
            return text.slice(i);
        }
        i += ch.length;
    }
    // Nothing but glyphs and punctuation — sort on what it has.
    return text;
}

// Used by the maze and event sorts on both the homepage and the admin page,
// so the two always agree on the order. Falls back to the raw strings so two
// names differing only in their leading glyph still order predictably rather
// than comparing equal.
function compareNames(a, b) {
    const byLetter = sortableName(a).localeCompare(sortableName(b));
    return byLetter !== 0 ? byLetter : String(a || "").localeCompare(String(b || ""));
}

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

    // An event can be announced before it is scheduled, so this line has to
    // carry its own label: everywhere else "TBC" sits after a "Date:" the
    // caller supplied, but here it is the whole line and a bare "TBC" under
    // a title says nothing about what is to be confirmed.
    function formatEventWhen(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "Date TBC";
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

    // Date-derived, same as the listings on home.html (see
    // js/event-status.js) — reading the stored status here meant the ticker
    // went on advertising an event that had already finished, and a live one
    // dropped out of it entirely. A live event sorts to the front: it's the
    // one someone can act on right now.
    const upcoming = events
        // No longer requires a date. An event with none is upcoming (see
        // js/event-status.js) and belongs in the ticker — being announced
        // before it is scheduled is the normal way round.
        .filter(e => EventStatus.isUpcomingish(e))
        // Soonest first, with the undated ones after everything scheduled:
        // they can't be placed on the calendar, and they are the least
        // urgent thing in the list precisely because no date is set. The
        // empty string this leans on also can't throw the way a missing
        // .date would have.
        .sort((a, b) => {
            const ad = a.date || "", bd = b.date || "";
            if (!ad !== !bd) return ad ? -1 : 1;
            return ad.localeCompare(bd);
        })
        .sort((a, b) => (EventStatus.derive(b) === "live" ? 1 : 0) - (EventStatus.derive(a) === "live" ? 1 : 0));

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
        ["Liminal Labyrinth", "https://liminallabyrinth.quest/"],
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


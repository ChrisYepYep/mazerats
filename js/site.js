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

// A leading article is skipped too, the way a library or a record shop
// files things: "A Horrible Maze" belongs under H, and "The Little Maze"
// under L, because those are the words someone actually looks them up by.
// Otherwise a third of the archive piles up under A and T.
//
// The trailing \s+ is what keeps this honest — it only fires on the article
// as a whole word, so "Anniversary Maze" is not read as "An niversary" and
// a hyphenated "A-Maze" keeps its A.
const LEADING_ARTICLE = /^(?:a|an|the)\s+/i;

// Digits count as real, so a name like "100% CONFUSED MAZE" still files
// under 1 rather than jumping to C.
function sortableName(name) {
    const text = String(name || "");
    let i = 0;
    // for...of walks codepoints, not UTF-16 units, so a surrogate pair is
    // never split in half.
    for (const ch of text) {
        if (!PICTURE_GLYPHS.has(ch.codePointAt(0)) && /[\p{L}\p{N}]/u.test(ch)) {
            const rest = text.slice(i);
            // Applied after the glyphs are gone, so a decorated name like
            // "★ The Little Maze" still reaches the article and files
            // under L rather than under T.
            const dropped = rest.replace(LEADING_ARTICLE, "");
            // A name that is nothing BUT an article ("The") keeps it —
            // sorting it as an empty string would float it above
            // everything for no reason a reader could see.
            return dropped || rest;
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

/* ---------- Escape closes the top-most layer, and only that ----------

   The archive stacks things: the side menu, the room modal, the actions tab
   pulled out of it, the lightbox over that, the console, photo frames and
   furni cards over everything, and the daily games and Your Progress in
   windows of their own. Each used to bind its own Escape listener and
   decide for itself whether to act, so one press could close two or three
   of them at once — the progress window and the modal both went; the
   console and the room modal argued about which was in front and the
   console guessed wrong (it sits at z-index 200, the modal's overlay at
   100, so it IS in front).

   Now there is one listener. Each layer registers how to tell whether it
   is open, which element it is, and how to close it; on Escape the open
   ones are compared by where they actually paint and the front one alone
   is closed. The listener sits on window in the CAPTURE phase and stops the
   event once it has acted, so any older per-layer listener still bound
   further down (js/guess.js and js/oddoneout.js keep their own) never sees
   the same press and closes a second window behind the first.

   "Where it actually paints": every layer here is either a direct child of
   <body> or inside one, so the body-level ancestor's z-index decides
   between layers in different subtrees (DOM order breaks a tie, as it does
   for the browser), and within one subtree the more deeply nested layer —
   the actions tab inside the room modal — is the one in front. */
const EscapeLayers = (() => {
    const layers = [];

    function topAncestor(el) {
        let node = el;
        while (node && node.parentElement && node.parentElement !== document.body) node = node.parentElement;
        return node;
    }

    function zOf(el) {
        const z = parseInt(getComputedStyle(el).zIndex, 10);
        return isNaN(z) ? 0 : z;
    }

    // True when a paints in front of b.
    function inFront(a, b) {
        if (a.contains(b)) return false;
        if (b.contains(a)) return true;
        const ta = topAncestor(a), tb = topAncestor(b);
        if (ta !== tb) {
            const za = zOf(ta), zb = zOf(tb);
            if (za !== zb) return za > zb;
        }
        return !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    }

    /* layer.elements() returns the element(s) currently open for it — an
       empty list when it is shut. Several for the photo frames and furni
       cards, which can be open many at a time and close one per press.
       layer.close(el) closes that one. */
    function register(layer) {
        layers.push(layer);
    }

    window.addEventListener("keydown", e => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        let best = null;
        for (const layer of layers) {
            let open;
            try { open = layer.elements() || []; } catch (err) { continue; }
            for (const el of open) {
                if (!el || !el.isConnected) continue;
                if (!best || inFront(el, best.el)) best = { el, layer };
            }
        }
        if (!best) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        best.layer.close(best.el);
    }, true);

    return { register };
})();
window.EscapeLayers = EscapeLayers;

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
        // /home#event-<id> — a normal navigation from any other page,
        // or a same-page hash change already handled by home.js's own
        // openEventFromHash if already there.
        const isWelcome = document.body.dataset.page === "welcome";
        const href = isWelcome
            ? `#event-${encodeURIComponent(event.id || "")}`
            : `/home#event-${encodeURIComponent(event.id || "")}`;
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
    //
    // WORKED OUT AFRESH ON EVERY TURN of the ticker, not once at load. The
    // list used to be built when the page opened and kept, so a tab left
    // open across an event's end went on advertising it for as long as the
    // tab lived — the status logic was right, it just was never asked again.
    // Re-deriving it every ten seconds costs a filter and a sort over a
    // few dozen events.
    function currentUpcoming() {
        return events
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
    }

    widget.style.display = "block";
    let upcoming = currentUpcoming();
    let index = 0;
    // What is on screen, by identity rather than by position: when the list
    // is rebuilt and an event has dropped out of it, "the one after the
    // current one" has to be found again rather than assumed to be index+1.
    let showing = upcoming[0] || null;
    slideEl.innerHTML = slideMarkup(showing);

    // Always armed, even for a list of one or none. A single event that
    // ends has to be taken down, and one that goes live later has to appear,
    // and neither happens if the timer only exists when there was already
    // something to rotate.
    setInterval(() => {
        upcoming = currentUpcoming();
        const at = showing ? upcoming.indexOf(showing) : -1;
        // Nothing to rotate through: settle on whatever is true now
        // without an animation, and only touch the DOM if it changed.
        if (upcoming.length <= 1) {
            const only = upcoming[0] || null;
            if (only !== showing) {
                showing = only;
                index = 0;
                slideEl.innerHTML = slideMarkup(showing);
            }
            return;
        }
        // The current one gone (it ended) means the next is whatever
        // now sits where it was, which is the start if it was last.
        const nextIndex = at === -1 ? (index % upcoming.length) : (at + 1) % upcoming.length;

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
        showing = upcoming[nextIndex];
    }, 10000);
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

/* Links to the archive, pointed at the landing page for a visitor who
   cannot get into the archive.

   While the site is in Coming Soon or Maintenance, the pre-load gate in
   home.html's <head> bounces every non-admin to index.html. Four pages a
   gated visitor can reach — the atlas, the 404 page, the policy, and the
   admin login — carry a link to home.html in the brand, and the 404 page
   offers "The archive" as the one way out of it. All of them worked, in the
   sense that the reader ended up somewhere sensible; what they did was go
   to a page, wait on a settings request, and get sent somewhere else, with
   a blank screen in the middle because the gate keeps the body hidden until
   it has decided. One round trip to arrive where the first link could have
   pointed.

   Only rewritten when the answer is already certain: the last landing state
   this browser saw says gated, AND there is no admin token to try. An admin
   session CAN pass the gate, so its links are left alone — sending a signed
   in admin to the landing page would cost them a click every time to save a
   moment they never spend. No cached state, which is a first-ever visit,
   also leaves them alone: the bounce is the current behaviour and one visit
   of it is not worth guessing over.

   Written against the cached value rather than site.js's own settings fetch
   on purpose. That fetch resolves some time after the page is usable, and a
   link that changes where it points while somebody is reaching for it is a
   worse thing than the round trip this avoids. */
document.addEventListener("DOMContentLoaded", () => {
    let state = null, token = null;
    try {
        state = localStorage.getItem("mazerats_landing_state");
        token = localStorage.getItem("mazerats_admin_token");
    } catch (e) { return; }      // private mode: nothing known, change nothing
    if (token) return;
    if (state !== "coming-soon" && state !== "maintenance") return;

    /* Every spelling of the archive's address, not just the bare filename.
       The page answers to /home and /home.html alike, links to it are
       written both ways, and some carry a #maze-… or #event-… fragment
       (js/guess.js's "See it in the archive", the share pages) — all of
       which land on the same gate and get the same bounce. Matching only
       the exact string href="home.html" quietly missed every one of them,
       which is the whole bug this block exists to avoid.

       The fragment is dropped rather than carried over: it names a maze in
       an archive this visitor cannot open, and the landing page has nothing
       to do with it. */
    const ARCHIVE = /^(?:\/)?home(?:\.html)?(?:[#?].*)?$/;
    document.querySelectorAll("a[href]").forEach(a => {
        if (ARCHIVE.test(a.getAttribute("href") || "")) a.href = "/";
    });
});

// Privacy Policy link, appended onto the end of .site-footer's own
// copyright line (its last <p>) rather than as a separate line of its
// own. Where it points depends on whether the page it is sitting on can
// show the policy itself: home.html and index.html both can, in a modal,
// so they get a same-page hash and no navigation at all. Everywhere else
// goes to /privacy, which is the policy with an address of its own.
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
    // The policy page does not need a link to itself in its own footer.
    if (page === "legal") return;
    /* And /privacy rather than home.html#privacy for every other page, for
       the same reason index.html does not link there either. The atlas, the
       game and the 404 page are all reachable while the site is in Coming
       Soon — the 404 page especially, since that is where a stale link
       lands — and from any of them "Privacy Policy" went to home.html,
       whose gate bounced the reader to the landing page and dropped the
       hash on the way. The link was not broken so much as quietly
       pointless: it navigated somewhere, just never to the policy.

       This is also simply the better target now that it exists. The note
       above used to say the policy was not a standalone page; privacy.html
       has been one for a while, it is the version that can be linked,
       printed and read without a 204px porthole, and it is served at
       /privacy — see the rewrite in netlify.toml. */
    const href = (page === "home" || page === "welcome") ? "#privacy" : "/privacy";
    copyrightLine.insertAdjacentHTML(
        "beforeend",
        ` <span class="footer-dot" aria-hidden="true">&middot;</span> <a href="${href}">Privacy Policy</a>`
    );
});


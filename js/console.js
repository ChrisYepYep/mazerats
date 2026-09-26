/* Draggable Habbo-style "console" modal — opened via the header's console
   button (see home.html/style.css's .header-console-btn), built from the
   cnsl-* sprite set in assets/img/console/. Self-contained (own file, not
   folded into home.js) since it's a fairly independent feature: its own
   open/close, drag, tab pages, and the contributors read; the Add Maze Info,
   Missing Pieces and Profile pages are built by their own files
   (js/console-info.js, js/console-profile.js). */
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("console-modal");
    const openBtn = document.getElementById("header-console-btn");
    if (!modal || !openBtn) return; // page doesn't have the console (e.g. warren.html)

    const frame = document.getElementById("console-frame");
    const closeBtn = document.getElementById("console-close-btn");
    const tabButtons = document.querySelectorAll(".console-tab-btn");
    const screenScroll = document.getElementById("console-screen-scroll");
    const pages = {
        // What the CONTACT tab lands on: the choice between the two reasons
        // anyone opens it.
        contact: document.getElementById("console-page-contact"),
        people: document.getElementById("console-page-people"),
        privacy: document.getElementById("console-page-privacy"),
        // The signed-in player's page, built by js/console-profile.js
        // whenever it is shown (see the console:page event below).
        profile: document.getElementById("console-page-profile"),
        // Not tab-reachable — only ever shown by the Send button on
        // success, and left out of the tabButtons active-state match
        // below since no tab's data-page is "thanks".
        thanks: document.getElementById("console-page-thanks"),
        // The pages behind that choice. None is a tab of its own; CONTACT
        // stays lit while any shows, because all of them are still that tab
        // (see CONTACT_PAGES below). info and missing are built by
        // js/console-info.js.
        message: document.getElementById("console-page-message"),
        info: document.getElementById("console-page-info"),
        missing: document.getElementById("console-page-missing")
    };

    // Which pages belong to the CONTACT tab, so the row of tab lights keeps
    // saying where you are rather than going blank on a sub-page.
    const CONTACT_PAGES = ["contact", "message", "info", "missing"];

    function clearPrivacyHash() {
        if (location.hash === "#privacy") {
            history.replaceState(null, "", location.pathname + location.search);
        }
    }

    function showPage(name) {
        // The footer's Privacy Policy link parks a "#privacy" hash in the
        // URL to trigger opening straight to this page (see
        // openPrivacyFromHash below) — once the console-screen moves on to
        // a different page, that hash no longer describes what's showing,
        // so clear it. Left alone while name is still "privacy" itself,
        // including the very showPage("privacy") call that hash triggers.
        if (name !== "privacy") clearPrivacyHash();
        Object.entries(pages).forEach(([key, el]) => {
            // A page missing from this page's HTML is skipped rather than
            // thrown on, which would stop every tab from switching at all.
            if (!el) return;
            // The thanks page uses a flex column (see .console-page-thanks)
            // so its OK button can be pinned to the bottom — an inline
            // style here would otherwise beat that rule outright regardless
            // of specificity, forcing it back to a plain block.
            el.style.display = key !== name ? "none" : (key === "thanks" ? "flex" : "block");
        });
        const litTab = CONTACT_PAGES.includes(name) ? "contact" : name;
        tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.page === litTab));
        // All four pages share one scrollable container (#console-screen-
        // scroll) — its scrollTop otherwise carries over from whichever
        // page was showing before, and the browser clamps that straight to
        // the new page's own max scroll, landing it scrolled to the bottom
        // instead of a fresh page starting at the top.
        if (screenScroll) screenScroll.scrollTop = 0;
        // For the pages other files build, which want to fill themselves
        // each time they are shown rather than once at load.
        document.dispatchEvent(new CustomEvent("console:page", { detail: { name } }));
    }

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => showPage(btn.dataset.page));
    });

    // ---------- default position ----------

    // Anchored to #browse-window (the main chrome window) rather than a
    // fixed spot in the viewport — sits just off its right edge, vertically
    // centered to it. Computed fresh (via getBoundingClientRect, so it
    // accounts for the window's actual responsive position) every time the
    // console opens, right up until the user drags it somewhere themselves
    // — from then on their placement sticks across closes/reopens, same as
    // before, instead of snapping back to this default. Declared here,
    // ahead of openConsole below, since openPrivacyFromHash can call
    // openConsole synchronously during this same setup pass (a page loaded
    // straight at #privacy) — any later and hasBeenDragged would still be
    // in its temporal dead zone at that point.
    let hasBeenDragged = false;

    // Below this the browse window is nearly the full width of the screen,
    // so there is no "beside it" to sit in. Matches the phone breakpoint
    // css/style.css uses throughout.
    const CONSOLE_PHONE_MAX = 640;

    function positionConsoleDefault() {
        const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);

        /* On a phone the console is centred on the screen instead of
           anchored beside the browse window. Anchoring put its right edge
           exactly on the viewport boundary with 118px of page beside it on
           a 375px screen — and until it could be dragged by touch at all
           (see the drag below) there was no way to move it off there. */
        if (window.innerWidth <= CONSOLE_PHONE_MAX) {
            modal.style.left = Math.round(Math.min(maxLeft, Math.max(0, (window.innerWidth - modal.offsetWidth) / 2))) + "px";
            // Held nearer the top than the middle: a phone keyboard opening
            // for the Contact form takes the bottom half of the screen.
            modal.style.top = Math.round(Math.min(maxTop, Math.max(0, window.innerHeight * 0.16))) + "px";
            modal.style.transform = "none";
            return;
        }

        const chromeWindow = document.getElementById("browse-window");
        if (!chromeWindow) return;
        const winRect = chromeWindow.getBoundingClientRect();
        // Nudged 128px left and 40px up from dead-flush-and-centered on the
        // window's right edge, purely by eye/preference.
        const left = winRect.right - 128;
        const top = winRect.top + winRect.height / 2 - modal.offsetHeight / 2 - 40;
        modal.style.left = Math.min(maxLeft, Math.max(0, left)) + "px";
        modal.style.top = Math.min(maxTop, Math.max(0, top)) + "px";
        modal.style.transform = "none";
    }

    // Nothing used to reclamp the console's position on a browser window
    // resize — open it at a wide viewport, then shrink the window without
    // closing it, and it stayed exactly where it was, potentially entirely
    // outside the new (smaller) viewport with no way to drag it back short
    // of reloading the page. Reuses the exact same clamping math the drag
    // handler below already applies on every mousemove.
    function clampConsoleToViewport() {
        if (modal.style.display !== "block") return; // closed — nothing to reposition
        const rect = modal.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
        const left = Math.min(maxLeft, Math.max(0, rect.left));
        const top = Math.min(maxTop, Math.max(0, rect.top));
        if (left === rect.left && top === rect.top) return; // already fully on-screen
        modal.style.left = left + "px";
        modal.style.top = top + "px";
        modal.style.transform = "none";
    }
    window.addEventListener("resize", clampConsoleToViewport);

    // ---------- open/close ----------

    let dataLoaded = false;

    /* Where focus goes back to on closing. Closing (X or Escape) used to
       leave focus on a button that had just been hidden, which drops a
       keyboard user at the top of the page. Recorded only on a real open,
       not on a page change inside an open console. */
    let opener = null;

    function openConsole(defaultPage) {
        if (modal.style.display !== "block") {
            const active = document.activeElement;
            opener = active && active !== document.body && !modal.contains(active) ? active : null;
        }
        modal.style.display = "block";
        // Lands on Profile by default, the first tab — otherwise the tab buttons' own
        // .active state (only ever changed by clicking one) could disagree
        // with which page is actually showing after a close/reopen that
        // happened to follow a click on a different tab. openPrivacyFromHash
        // below passes "privacy" instead, landing there directly rather
        // than flashing through Profile first (which would also clear the
        // #privacy hash immediately via showPage's own cleanup, before the
        // privacy page ever actually showed).
        showPage(defaultPage || "profile");
        if (!hasBeenDragged) positionConsoleDefault();
        // loadContributors sets dataLoaded itself, and only on a list that
        // actually arrived — so a failed read is asked again on the next open.
        if (!dataLoaded) loadContributors();
    }

    // Something the opener can no longer take: gone from the page, hidden,
    // or inside an inert region (the closed side menu, see wireSideMenu in
    // js/home.js). focus() on any of those silently does nothing.
    function canTakeFocus(el) {
        return !!(el && document.body.contains(el) && typeof el.focus === "function"
            && el.getClientRects().length && !(el.closest && el.closest("[inert]")));
    }

    /* opts.keepFocus is for a caller closing the console in order to open
       another window, which takes focus itself; handing it back to the
       opener would pull it out from under that window. And even without
       it, focus is only restored if it is still in the console (or lost to
       the body): anything that has already taken it elsewhere keeps it. */
    function closeConsole(opts) {
        const active = document.activeElement;
        const hadFocus = !active || active === document.body || modal.contains(active);
        modal.style.display = "none";
        clearPrivacyHash();
        const back = opener;
        opener = null;
        if ((opts && opts.keepFocus) || !hadFocus) return;
        let landing = canTakeFocus(back) ? back : null;
        if (!landing && back && back.closest && back.closest("#side-menu")) {
            landing = document.getElementById("side-spine");
        }
        if (!canTakeFocus(landing)) landing = document.getElementById("header-console-btn");
        if (canTakeFocus(landing)) landing.focus({ preventScroll: true });
    }

    openBtn.addEventListener("click", () => openConsole());
    // Wrapped, so the click event is not read as closeConsole's options.
    closeBtn.addEventListener("click", () => closeConsole());

    /* Escape closes it, like every other modal on the site — the room modal,
       the lightbox and both of the landing page's own modals all do, and
       this was the one that only answered its X.

       Through the shared top-most-layer rule (EscapeLayers, js/site.js)
       rather than a listener of its own. This used to step aside whenever
       the room modal was open, on the belief that the modal was in front —
       but the console sits at z-index 200 against the overlay's 100, so it
       is the one in front, and Escape was closing the window BEHIND it.
       The shared rule compares where each actually paints. */
    if (window.EscapeLayers) {
        window.EscapeLayers.register({
            elements: () => modal.style.display === "block" ? [modal] : [],
            close: () => closeConsole()
        });
    }

    // The footer's Privacy Policy link (js/site.js) points at
    // "#privacy" on this page — a same-page hash change if already here,
    // a normal navigation otherwise — so this needs to run both at load
    // and on hashchange, same pattern as js/home.js's own openEventFromHash.
    function openPrivacyFromHash() {
        if (location.hash !== "#privacy") return;
        openConsole("privacy");
    }
    window.addEventListener("hashchange", openPrivacyFromHash);
    openPrivacyFromHash();

    // ---------- drag ----------

    /* Anywhere on the yellow chrome drags the console — everything that
       shouldn't (buttons, form fields, the screen itself, its own
       scrollbar) is excluded by the closest() check below, rather than
       requiring the drag to start on one specific narrow handle.

       Pointer events, not mouse events. A touch drag emits touchmove and no
       mousemove at all, so on a phone the chrome could be pressed and the
       console would simply never move — it was undraggable on every
       touchscreen, which is the same bug the photo frames and furni cards
       already had and were fixed for (see startFrameDrag in js/home.js).
       The pointer is captured on the frame so the moves and the release
       still arrive after the finger leaves it, and .console-frame carries
       touch-action: none in the CSS, without which the browser claims the
       gesture as a page scroll and cancels the stream mid-drag. */
    let dragging = false;
    let dragPointerId = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    frame.addEventListener("pointerdown", (e) => {
        // Touch and pen report button 0 like a left click; this only rejects
        // a genuine middle or right mouse button.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target.closest("button, input, textarea, .console-screen")) return;
        dragging = true;
        dragPointerId = e.pointerId;
        hasBeenDragged = true;
        frame.classList.add("is-dragging");
        const rect = modal.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        // Switches from the initial centered transform to an explicit
        // left/top the first time it's dragged, anchored at the exact
        // spot it already visually occupied so there's no jump.
        modal.style.left = rect.left + "px";
        modal.style.top = rect.top + "px";
        modal.style.transform = "none";
        document.body.style.userSelect = "none";
        if (frame.setPointerCapture) {
            try { frame.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
        }
        e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
        if (!dragging || e.pointerId !== dragPointerId) return;
        const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
        const left = Math.min(maxLeft, Math.max(0, e.clientX - dragOffsetX));
        const top = Math.min(maxTop, Math.max(0, e.clientY - dragOffsetY));
        modal.style.left = left + "px";
        modal.style.top = top + "px";
    });

    function endDrag(e) {
        if (!dragging || (e && e.pointerId !== dragPointerId)) return;
        dragging = false;
        dragPointerId = null;
        frame.classList.remove("is-dragging");
        document.body.style.userSelect = "";
    }

    window.addEventListener("pointerup", endDrag);
    // A cancelled pointer (the browser taking the gesture, a call arriving)
    // must not leave the console stuck to the finger.
    window.addEventListener("pointercancel", endDrag);

    // ---------- contact page ----------

    const messageInput = document.getElementById("console-contact-message");
    const usernameInput = document.getElementById("console-contact-username");
    const discordInput = document.getElementById("console-contact-discord");
    const hpInput = document.getElementById("console-contact-hp");
    const cancelBtn = document.getElementById("console-contact-cancel");
    const sendBtn = document.getElementById("console-contact-send");
    const statusEl = document.getElementById("console-contact-status");
    const thanksOkBtn = document.getElementById("console-thanks-ok");
    // The message page's form, whole. A page without it (or with half of
    // it) skips wiring the form rather than throwing here — which would
    // stop this handler before MazeConsole below is ever assigned, and take
    // the Add Maze Info and Missing Pieces pages down with it.
    const contactFormReady = !!(messageInput && usernameInput && discordInput && hpInput
        && cancelBtn && sendBtn && statusEl);

    function showStatus(text, isError) {
        statusEl.textContent = text;
        statusEl.classList.toggle("is-error", Boolean(isError));
        statusEl.style.display = "block";
    }

    /* Signed in, the Discord field has nothing left to ask. The name is
       already known, and the copy the server records is taken from the
       session rather than from this box — so leaving an editable field
       here would be inviting someone to type a name that would then be
       ignored.

       Swapped rather than prefilled, for that reason: a filled-in field
       looks editable, and this one is not. */
    const discordField = document.getElementById("console-contact-discord-field");
    const signedAsEl = document.getElementById("console-contact-signed-as");

    function paintContactIdentity(player) {
        if (!discordField || !signedAsEl) return;
        if (player) {
            discordField.hidden = true;
            signedAsEl.hidden = false;
            // A comma, not a dash: this line is set in Volter Goldfish, which
            // draws U+2014 as a musical note (see PICTURE_GLYPHS in js/site.js).
            signedAsEl.textContent = `Sending as ${player.name}, signed in with Discord.`;
        } else {
            discordField.hidden = false;
            signedAsEl.hidden = true;
            signedAsEl.textContent = "";
        }
    }

    if (window.Account) {
        paintContactIdentity(Account.current);
        Account.onChange(paintContactIdentity);
        Account.ready();
    }

    // Back to the choice screen, and empties the form on the way — coming
    // back to a half-written message you had already abandoned is worse
    // than starting again.
    if (contactFormReady) cancelBtn.addEventListener("click", () => {
        messageInput.value = "";
        usernameInput.value = "";
        discordInput.value = "";
        statusEl.style.display = "none";
        showPage("contact");
    });

    // The ways out of the choice screen. The two Missing Pieces pages are
    // js/console-info.js's; it fills them before they are shown.
    const choiceContactBtn = document.getElementById("console-choice-contact");
    const choiceInfoBtn = document.getElementById("console-choice-info");
    const choiceMissingBtn = document.getElementById("console-choice-missing");
    if (choiceContactBtn) choiceContactBtn.addEventListener("click", () => showPage("message"));
    if (choiceInfoBtn) choiceInfoBtn.addEventListener("click", () => MazeConsole.openInfo(null));
    if (choiceMissingBtn) choiceMissingBtn.addEventListener("click", () => MazeConsole.openMissing());

    // Saved server-side (netlify/functions/contact.js -> MongoDB, visible
    // on the admin page) and, if the function has RESEND_API_KEY/
    // CONTACT_NOTIFY_EMAIL configured, forwarded on as an email — that
    // recipient address lives only in Netlify's own environment variables,
    // never in this file or anywhere else client-side.
    if (contactFormReady) sendBtn.addEventListener("click", async () => {
        const message = messageInput.value.trim();
        if (!message) {
            messageInput.focus();
            return;
        }
        sendBtn.disabled = true;
        try {
            await Api.submitContactMessage(message, usernameInput.value.trim(), discordInput.value.trim(), hpInput.value);
            messageInput.value = "";
            usernameInput.value = "";
            discordInput.value = "";
            statusEl.style.display = "none";
            // The thanks page's own sentence: an Add Maze Info send before
            // this one may have left its wording there.
            MazeConsole.showThanks();
        } catch (e) {
            showStatus(e.message || "Something went wrong. Try again in a moment.", true);
        } finally {
            sendBtn.disabled = false;
        }
    });

    const thanksMessageEl = document.getElementById("console-thanks-message");
    const THANKS_DEFAULT = thanksMessageEl ? thanksMessageEl.textContent : "";
    if (thanksOkBtn) thanksOkBtn.addEventListener("click", () => showPage("contact"));

    /* The console, for the rest of the page. js/console-info.js fills the
       Add Maze Info and Missing Pieces pages and assigns openInfo and
       openMissing below; js/home.js calls them from a maze's INCOMPLETE tab
       and from the side menu. Those two are stubs until console-info.js has
       run, which is at DOMContentLoaded like this file — nothing can press
       a button before then. */
    const MazeConsole = window.MazeConsole = {
        open(page) {
            if (modal.style.display === "block") showPage(page || "contact");
            else openConsole(page);
        },
        showPage,
        // The thanks page with its own sentence, then its default again for
        // the next time the Contact form uses it.
        showThanks(text) {
            if (thanksMessageEl) thanksMessageEl.textContent = text || THANKS_DEFAULT;
            showPage("thanks");
        },
        resetThanks() {
            if (thanksMessageEl) thanksMessageEl.textContent = THANKS_DEFAULT;
        },
        openInfo() { MazeConsole.open("info"); },
        openMissing() { MazeConsole.open("missing"); },
        openProfile() { MazeConsole.open("profile"); },
        // close({ keepFocus: true }) when closing to open another window.
        close: (opts) => closeConsole(opts)
    };

    // ---------- contributors page ----------

    const contributorsListEl = document.getElementById("console-contributors-list");

    // Contributors are admin-entered, not visitor-submitted, but this page
    // is public (every visitor can open it, unlike the admin-only list this
    // same data also renders into) — escaping here keeps a bad paste or a
    // compromised admin account from running in every visitor's browser
    // instead of just the admin's own session.
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    /* What a contributor's total is a total OF, from the kinds of work they
       are credited with.

       The page used to call every total "Mazes" regardless — someone
       credited only for event images still read as "9 Mazes". A collab is a
       maze, so Collab Images counts on that side too; Historical Data and
       Web Development belong to neither, and get the neutral word rather
       than being forced onto one. */
    const MAZE_TYPES = ["Room Images", "Collab Images"];
    const EVENT_TYPES = ["Event Images"];

    function contributionUnit(types, total) {
        const list = types || [];
        const mazes = list.some(t => MAZE_TYPES.includes(t));
        const events = list.some(t => EVENT_TYPES.includes(t));
        if (mazes && events) return "Mazes / Events";
        if (mazes) return total === 1 ? "Maze" : "Mazes";
        if (events) return total === 1 ? "Event" : "Events";
        return total === 1 ? "Contribution" : "Contributions";
    }

    /* One contributor: who and how much on the first line, what kind of
       work underneath.

       It used to be a name with "- 22 Mazes" hyphenated onto the end of it,
       reading as part of the name, and then the types as a comma sentence
       that wrapped to three lines in a 183px column and swamped the entry.
       The number behind it was hand-typed with nothing to back it; the admin
       page now records which mazes and which events a person actually
       worked on (see js/admin.js) and the total follows from those. */
    function contributorHtml(contributor) {
        const total = contributor.count || 0;
        const unit = contributionUnit(contributor.types, total);

        // Types as chips rather than a comma run: they are labels, not prose.
        const types = (contributor.types || [])
            .map(t => `<span class="console-contributor-tag">${escapeHtml(t)}</span>`)
            .join("");

        return `
            <div class="console-contributor">
                <p class="console-contributor-head">
                    <span class="console-contributor-name">${escapeHtml(contributor.username)}</span>
                    <span class="console-contributor-count">${escapeHtml(total)} <span class="console-contributor-unit">${escapeHtml(unit)}</span></span>
                </p>
                ${types ? `<p class="console-contributor-types">${types}</p>` : ""}
            </div>
        `;
    }

    /* A failed read is not an empty list. Api.getContributors falls back to
       [] and records "contributor data" in Api._degraded, and this used to
       take that [] at its word: "No contributors listed yet." for the rest
       of the visit, with dataLoaded already set so nothing ever asked
       again. Now a failure says so, in the Missing Pieces page's words
       (js/console-info.js), with a Retry — and dataLoaded stays unset, so
       reopening the console asks again too. */
    let contributorsAsking = false;

    async function loadContributors() {
        if (!contributorsListEl || contributorsAsking) return;
        contributorsAsking = true;
        let contributors;
        try {
            contributors = await Api.getContributors();
        } finally {
            contributorsAsking = false;
        }
        const failed = !Array.isArray(contributors)
            || (Api._degraded && Api._degraded.has("contributor data"));
        if (failed) {
            contributorsListEl.innerHTML = `
                <p class="console-blurb">The list couldn't be reached just now.</p>
                <button type="button" class="console-btn" data-contributors-retry>Retry</button>`;
            return;
        }
        dataLoaded = true;
        if (!contributors.length) {
            contributorsListEl.innerHTML = '<p class="console-empty-page" style="height:auto;padding:14px 0;">No contributors listed yet.</p>';
            return;
        }
        // Most contributions first; ties broken alphabetically by username
        // so the order stays stable/predictable rather than falling back
        // to whatever order the API happened to return them in.
        const sorted = contributors.slice().sort((a, b) =>
            (b.count || 0) - (a.count || 0) || (a.username || "").localeCompare(b.username || "")
        );
        // .console-dotline between each contributor, not after the last one.
        contributorsListEl.innerHTML = sorted
            .map(contributorHtml)
            .join('<div class="console-dotline"></div>');
    }

    if (contributorsListEl) {
        contributorsListEl.addEventListener("click", e => {
            if (!e.target.closest("[data-contributors-retry]")) return;
            contributorsListEl.innerHTML = '<p class="console-blurb">Loading...</p>';
            loadContributors();
        });
    }

// ---------- privacy page ----------

// Text and markup both come from js/privacy-content.js, shared with the
// landing page's own privacy modal (js/welcome.js) so the two can never
// drift apart. Rendered once at load rather than on each open — it never
// changes between opens.
if (typeof renderPrivacySections === "function") {
    renderPrivacySections(document.getElementById("console-privacy-body"));
}
});

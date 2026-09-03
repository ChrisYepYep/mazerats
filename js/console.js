/* Draggable Habbo-style "console" modal — opened via the header's console
   button (see home.html/style.css's .header-console-btn), built from the
   cnsl-* sprite set in assets/img/console/. Self-contained (own file, not
   folded into home.js) since it's a fairly independent feature: its own
   open/close, drag, tab pages, and two small data reads (contributors,
   about text) that don't touch anything else js/home.js already tracks. */
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("console-modal");
    const openBtn = document.getElementById("header-console-btn");
    if (!modal || !openBtn) return; // page doesn't have the console (e.g. admin.html)

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
        about: document.getElementById("console-page-about"),
        // Not tab-reachable — only ever shown by the Send button on
        // success, and left out of the tabButtons active-state match
        // below since no tab's data-page is "thanks".
        thanks: document.getElementById("console-page-thanks"),
        // The two forms behind that choice. Neither is a tab of its own;
        // CONTACT stays lit while either shows, because both of them are
        // still that tab (see CONTACT_PAGES below).
        message: document.getElementById("console-page-message"),
        submit: document.getElementById("console-page-submit")
    };

    // Which pages belong to the CONTACT tab, so the row of tab lights keeps
    // saying where you are rather than going blank on a sub-page.
    const CONTACT_PAGES = ["contact", "message", "submit"];

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
        screenScroll.scrollTop = 0;
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

    function openConsole(defaultPage) {
        modal.style.display = "block";
        // Lands on Contact by default — otherwise the tab buttons' own
        // .active state (only ever changed by clicking one) could disagree
        // with which page is actually showing after a close/reopen that
        // happened to follow a click on a different tab. openPrivacyFromHash
        // below passes "privacy" instead, landing there directly rather
        // than flashing through Contact first (which would also clear the
        // #privacy hash immediately via showPage's own cleanup, before the
        // privacy page ever actually showed).
        showPage(defaultPage || "contact");
        if (!hasBeenDragged) positionConsoleDefault();
        if (!dataLoaded) {
            dataLoaded = true;
            loadContributors();
            loadAbout();
        }
    }

    function closeConsole() {
        modal.style.display = "none";
        clearPrivacyHash();
    }

    openBtn.addEventListener("click", () => openConsole());
    closeBtn.addEventListener("click", closeConsole);

    /* Escape closes it, like every other modal on the site — the room modal,
       the lightbox and both of the landing page's own modals all do, and
       this was the one that only answered its X. Bound on the document
       rather than the console, since the console does not hold focus. */
    document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (modal.style.display !== "block") return;
        // The room modal is in front when both are open, and Escape belongs
        // to whatever is on top.
        const roomModal = document.getElementById("room-modal");
        if (roomModal && roomModal.classList.contains("open")) return;
        closeConsole();
    });

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

    function showStatus(text, isError) {
        statusEl.textContent = text;
        statusEl.classList.toggle("is-error", Boolean(isError));
        statusEl.style.display = "block";
    }

    // Back to the choice screen, and empties the form on the way — coming
    // back to a half-written message you had already abandoned is worse
    // than starting again.
    cancelBtn.addEventListener("click", () => {
        messageInput.value = "";
        usernameInput.value = "";
        discordInput.value = "";
        statusEl.style.display = "none";
        showPage("contact");
    });

    // The two ways out of the choice screen.
    const choiceContactBtn = document.getElementById("console-choice-contact");
    const choiceSubmitBtn = document.getElementById("console-choice-submit");
    if (choiceContactBtn) {
        choiceContactBtn.addEventListener("click", () => showPage("message"));
        choiceSubmitBtn.addEventListener("click", () => showPage("submit"));
    }

    // Saved server-side (netlify/functions/contact.js -> MongoDB, visible
    // on the admin page) and, if the function has RESEND_API_KEY/
    // CONTACT_NOTIFY_EMAIL configured, forwarded on as an email — that
    // recipient address lives only in Netlify's own environment variables,
    // never in this file or anywhere else client-side.
    sendBtn.addEventListener("click", async () => {
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
            showPage("thanks");
        } catch (e) {
            showStatus(e.message || "Something went wrong. Try again in a moment.", true);
        } finally {
            sendBtn.disabled = false;
        }
    });

    thanksOkBtn.addEventListener("click", () => showPage("contact"));

    /* ---------- submit a maze ----------

       The same endpoint as the contact form, asked properly. A free-text
       box invites "you should add my maze" and nothing else, and an archive
       cannot act on a submission whose builder and room it has to go and
       chase. The fields are written into the message body rather than sent
       as new ones, so nothing changes server-side: contact.js keeps its
       honeypot, its per-IP rate limit and its admin inbox, and a submission
       lands in the same place a message does. */
    const submitBackBtn = document.getElementById("console-submit-back");
    const submitSendBtn = document.getElementById("console-submit-send");
    const submitNameInput = document.getElementById("console-submit-name");
    const submitBuilderInput = document.getElementById("console-submit-builder");
    const submitNotesInput = document.getElementById("console-submit-notes");
    const submitUsernameInput = document.getElementById("console-submit-username");
    const submitHpInput = document.getElementById("console-submit-hp");
    const submitStatusEl = document.getElementById("console-submit-status");

    if (submitBackBtn) {
        submitBackBtn.addEventListener("click", () => showPage("contact"));

        submitSendBtn.addEventListener("click", async () => {
            const name = submitNameInput.value.trim();
            // The one field that has to be there: everything else can be
            // found from a name, and nothing can be found without one.
            if (!name) {
                submitStatusEl.textContent = "A maze name is the one thing we need.";
                submitStatusEl.classList.add("is-error");
                submitStatusEl.style.display = "block";
                submitNameInput.focus();
                return;
            }
            const builder = submitBuilderInput.value.trim();
            const notes = submitNotesInput.value.trim();

            // Labelled so it is obvious in the admin inbox which of these
            // is a submission and which is somebody saying hello.
            const message = [
                "MAZE SUBMISSION",
                `Maze: ${name}`,
                builder ? `Builder: ${builder}` : "",
                notes ? `\n${notes}` : ""
            ].filter(Boolean).join("\n");

            submitSendBtn.disabled = true;
            try {
                await Api.submitContactMessage(message, submitUsernameInput.value.trim(), "", submitHpInput.value);
                [submitNameInput, submitBuilderInput, submitNotesInput, submitUsernameInput]
                    .forEach(el => { el.value = ""; });
                submitStatusEl.style.display = "none";
                showPage("thanks");
            } catch (e) {
                submitStatusEl.textContent = e.message || "Something went wrong. Try again in a moment.";
                submitStatusEl.classList.add("is-error");
                submitStatusEl.style.display = "block";
            } finally {
                submitSendBtn.disabled = false;
            }
        });
    }

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

    async function loadContributors() {
        const contributors = await Api.getContributors();
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

// ---------- privacy page ----------

// Text and markup both come from js/privacy-content.js, shared with the
// landing page's own privacy modal (js/welcome.js) so the two can never
// drift apart. Rendered once at load rather than on each open — it never
// changes between opens.
if (typeof renderPrivacySections === "function") {
    renderPrivacySections(document.getElementById("console-privacy-body"));
}

    // ---------- about page ----------

    const aboutBlurbEl = document.getElementById("console-about-blurb");

    async function loadAbout() {
        const { aboutText } = await Api.getSiteSettings();
        aboutBlurbEl.textContent = aboutText || "";
    }
});

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
        contact: document.getElementById("console-page-contact"),
        people: document.getElementById("console-page-people"),
        privacy: document.getElementById("console-page-privacy"),
        about: document.getElementById("console-page-about"),
        // Not tab-reachable — only ever shown by the Send button on
        // success, and left out of the tabButtons active-state match
        // below since no tab's data-page is "thanks".
        thanks: document.getElementById("console-page-thanks")
    };

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
        tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.page === name));
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

    function positionConsoleDefault() {
        const chromeWindow = document.getElementById("browse-window");
        if (!chromeWindow) return;
        const winRect = chromeWindow.getBoundingClientRect();
        // Nudged 128px left and 40px up from dead-flush-and-centered on the
        // window's right edge, purely by eye/preference.
        const left = winRect.right - 128;
        const top = winRect.top + winRect.height / 2 - modal.offsetHeight / 2 - 40;
        const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
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

    // Anywhere on the yellow chrome drags the console — everything that
    // shouldn't (buttons, form fields, the screen itself, its own
    // scrollbar) is excluded by the closest() check below, rather than
    // requiring the drag to start on one specific narrow handle.
    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    frame.addEventListener("mousedown", (e) => {
        if (e.target.closest("button, input, textarea, .console-screen")) return;
        dragging = true;
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
        e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
        const left = Math.min(maxLeft, Math.max(0, e.clientX - dragOffsetX));
        const top = Math.min(maxTop, Math.max(0, e.clientY - dragOffsetY));
        modal.style.left = left + "px";
        modal.style.top = top + "px";
    });

    window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        frame.classList.remove("is-dragging");
        document.body.style.userSelect = "";
    });

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

    cancelBtn.addEventListener("click", () => {
        messageInput.value = "";
        usernameInput.value = "";
        discordInput.value = "";
        statusEl.style.display = "none";
    });

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
            showStatus(e.message || "Something went wrong — try again in a moment.", true);
        } finally {
            sendBtn.disabled = false;
        }
    });

    thanksOkBtn.addEventListener("click", () => showPage("contact"));

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

    function contributorHtml(contributor) {
        return `
            <div class="console-contributor">
                <p class="console-contributor-name">${escapeHtml(contributor.username)} <span class="console-contributor-count">- ${escapeHtml(contributor.count || 0)}</span></p>
                <p class="console-contributor-types">${escapeHtml((contributor.types || []).join(", "))}</p>
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

    // ---------- about page ----------

    const aboutBlurbEl = document.getElementById("console-about-blurb");

    async function loadAbout() {
        const { aboutText } = await Api.getSiteSettings();
        aboutBlurbEl.textContent = aboutText || "";
    }
});

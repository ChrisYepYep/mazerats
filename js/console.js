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

    function showPage(name) {
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

    // ---------- open/close ----------

    let dataLoaded = false;

    function openConsole() {
        modal.style.display = "block";
        // Always lands on Contact — otherwise the tab buttons' own .active
        // state (only ever changed by clicking one) could disagree with
        // which page is actually showing (always Contact, per the static
        // HTML) after a close/reopen that happened to follow a click on a
        // different tab.
        showPage("contact");
        if (!dataLoaded) {
            dataLoaded = true;
            loadContributors();
            loadAbout();
        }
    }

    function closeConsole() {
        modal.style.display = "none";
    }

    openBtn.addEventListener("click", openConsole);
    closeBtn.addEventListener("click", closeConsole);

    // The footer's Privacy Policy link (js/site.js) points at
    // "#privacy" on this page — a same-page hash change if already here,
    // a normal navigation otherwise — so this needs to run both at load
    // and on hashchange, same pattern as js/home.js's own openEventFromHash.
    function openPrivacyFromHash() {
        if (location.hash !== "#privacy") return;
        openConsole();
        showPage("privacy");
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

    function contributorHtml(contributor) {
        return `
            <div class="console-contributor">
                <p class="console-contributor-name">${contributor.username} <span class="console-contributor-count">- ${contributor.count || 0}</span></p>
                <p class="console-contributor-types">${(contributor.types || []).join(", ")}</p>
            </div>
        `;
    }

    async function loadContributors() {
        const contributors = await Api.getContributors();
        if (!contributors.length) {
            contributorsListEl.innerHTML = '<p class="console-empty-page" style="height:auto;padding:14px 0;">No contributors listed yet.</p>';
            return;
        }
        // .console-dotline between each contributor, not after the last one.
        contributorsListEl.innerHTML = contributors
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

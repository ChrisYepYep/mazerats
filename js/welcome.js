/* Drives the welcome/splash screen (index.html) — swaps the Enter button's
   label and behavior based on the landing state set from the admin page
   (see netlify/functions/settings.js). Defaults to a working "Enter" link
   if the check fails, so a live/API hiccup never locks visitors out. */
document.addEventListener("DOMContentLoaded", async () => {
    const btn = document.getElementById("welcome-btn");
    const label = document.getElementById("welcome-btn-label");

    const { landingState } = await Api.getSiteSettings();

    if (landingState === "coming-soon") {
        label.textContent = "Coming Soon";
        btn.removeAttribute("href");
        btn.classList.add("is-disabled");
    } else if (landingState === "maintenance") {
        label.textContent = "Maintenance, Back Soon!";
        btn.removeAttribute("href");
        btn.classList.add("is-disabled");
    } else {
        label.textContent = "Enter";
        btn.setAttribute("href", "home.html");
        btn.classList.remove("is-disabled");
    }
});

// Upcoming Events widget on this page (see js/site.js) opens the event
// right here instead of navigating to home.html — home.html is off-limits
// to regular visitors during Coming Soon/Maintenance (see js/site.js's own
// gate) and would just bounce them straight back to this page. Deliberately
// simpler than home.html's full room/event modal: a single image + a
// click-through thumbnail strip, no auto-advance carousel or old-versions
// view — just enough to preview the event without porting all of that
// machinery, which only home.html actually needs.
document.addEventListener("DOMContentLoaded", async () => {
    const modal = document.getElementById("event-modal");
    if (!modal || typeof Api === "undefined") return;

    const nameEl = document.getElementById("event-modal-name");
    const closeBtn = document.getElementById("event-modal-close");
    const thumbEl = document.getElementById("event-modal-thumb");
    const imgEl = document.getElementById("event-modal-img");
    const hostEl = document.getElementById("event-modal-host");
    const tagsEl = document.getElementById("event-modal-tags");
    const metaEl = document.getElementById("event-modal-meta");
    const descEl = document.getElementById("event-modal-desc");
    const visitWrap = document.getElementById("event-modal-visit-wrap");
    const visitLink = document.getElementById("event-modal-link");
    const stripEl = document.getElementById("event-modal-strip");

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function formatUtcParts(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return null;
        return {
            date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
            time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })
        };
    }

    /* An event with no date yet reads "TBC" rather than going blank. A date
       is often the last thing settled about an event, and an empty field
       looks like the page failed to load it rather than like nobody has
       picked one — which is the actual state of affairs and worth saying. */
    function formatEventDuration(startIso, endIso) {
        // Labelled, because this line stands alone here — see the same note
        // on formatEventWhen in js/site.js.
        if (!startIso) return "Date TBC";
        const start = formatUtcParts(startIso);
        if (!start) return startIso;
        const end = endIso ? formatUtcParts(endIso) : null;
        if (!end) return `${start.date}, ${start.time} UTC`;
        if (start.date === end.date) return `${start.date}, ${start.time}–${end.time} UTC`;
        return `${start.date} ${start.time} UTC – ${end.date} ${end.time} UTC`;
    }

    // Same {image, label} vs. plain-string shape home.js's own
    // normalizeGalleryItem handles — its own small copy here since this
    // modal only ever needs the image/label pair out of it, in entrance →
    // gallery → finish order, falling back to the plain thumb if none of
    // those are set.
    function galleryImages(event) {
        const images = [];
        if (event.entrance && event.entrance.image) images.push({ image: event.entrance.image, label: event.entrance.label || "Entrance" });
        (event.gallery || []).forEach(g => {
            const item = typeof g === "string" ? { image: g, label: "" } : g;
            if (item.image) images.push({ image: item.image, label: item.label || "" });
        });
        if (event.finish && event.finish.image) images.push({ image: event.finish.image, label: event.finish.label || "Complete" });
        if (!images.length && event.thumb) images.push({ image: event.thumb, label: "" });
        return images;
    }

    function showImage(images, index) {
        const item = images[index];
        imgEl.src = imgCdn(item.image, 900, null, 75);
        imgEl.alt = item.label || "";
        stripEl.querySelectorAll("img").forEach((el, i) => el.classList.toggle("active", i === index));
    }

    let cachedEvents = null;
    async function ensureEvents() {
        if (!cachedEvents) {
            try { cachedEvents = await Api.getEvents(); }
            catch (e) { cachedEvents = []; }
        }
        return cachedEvents;
    }

    function closeEventModal() {
        modal.classList.remove("open");
        // Same replaceState-not-clear approach as home.js's closeModal —
        // drops the hash without adding a back-button entry or re-firing
        // hashchange.
        if (/^#event-/.test(location.hash)) {
            history.replaceState(null, "", location.pathname + location.search);
        }
    }

    async function openEventModalById(id) {
        const events = await ensureEvents();
        const event = events.find(e => e.id === id);
        if (!event) return;

        nameEl.textContent = event.title || "";
        hostEl.textContent = event.host ? `by ${event.host}` : "";
        tagsEl.innerHTML = (event.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
        metaEl.textContent = formatEventDuration(event.date, event.endDate);
        descEl.textContent = event.description || "";

        if (event.habboLink) {
            visitLink.href = event.habboLink;
            visitWrap.style.display = "block";
        } else {
            visitWrap.style.display = "none";
        }

        const images = galleryImages(event);
        if (images.length) {
            thumbEl.style.display = "block";
            thumbEl.classList.toggle("has-gallery", images.length > 1);
            showImage(images, 0);
            if (images.length > 1) {
                stripEl.style.display = "flex";
                stripEl.innerHTML = images.map((img, i) => `<img src="${imgCdn(img.image, 110, 110, 55)}" loading="lazy" alt="${escapeHtml(img.label)}" class="${i === 0 ? "active" : ""}">`).join("");
                stripEl.querySelectorAll("img").forEach((thumb, i) => {
                    thumb.addEventListener("click", () => showImage(images, i));
                });
            } else {
                stripEl.style.display = "none";
                stripEl.innerHTML = "";
            }
        } else {
            thumbEl.style.display = "none";
            stripEl.style.display = "none";
            stripEl.innerHTML = "";
        }

        modal.classList.add("open");
    }

    // A same-page <a href="#event-...">  (see js/site.js's slideMarkup)
    // updates location.hash on its own with no reload — no click handler
    // needed, just react to the hashchange it causes, the same as a
    // shared/bookmarked "index.html#event-..." link landing here directly.
    function checkHash() {
        const m = /^#event-(.+)$/.exec(location.hash);
        if (m) openEventModalById(decodeURIComponent(m[1]));
    }

    window.addEventListener("hashchange", checkHash);
    closeBtn.addEventListener("click", closeEventModal);
    modal.addEventListener("click", e => { if (e.target === modal) closeEventModal(); });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && modal.classList.contains("open")) closeEventModal();
    });

    checkHash();
});

// Privacy policy modal for this page. The footer link js/site.js injects
// points at "#privacy" here (rather than home.html#privacy) because
// home.html turns regular visitors away during Coming Soon/Maintenance —
// exactly the states in which the landing page is all anyone can see. The
// policy text and its markup are shared with the homepage console modal;
// see js/privacy-content.js.
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("privacy-modal");
    if (!modal || typeof renderPrivacySections !== "function") return;

    const closeBtn = document.getElementById("privacy-modal-close");

    renderPrivacySections(document.getElementById("welcome-privacy-body"));

    function openPrivacyModal() {
        modal.classList.add("open");
    }

    function closePrivacyModal() {
        modal.classList.remove("open");
        // Drop the hash without a history entry or a re-fired hashchange,
        // same as closeEventModal above.
        if (location.hash === "#privacy") {
            history.replaceState(null, "", location.pathname + location.search);
        }
    }

    function checkPrivacyHash() {
        if (location.hash === "#privacy") openPrivacyModal();
    }

    // The footer link is a same-page hash, so clicking it while the modal
    // is already closed-but-hash-still-set fires no hashchange — hence the
    // direct click handler as well as the hashchange listener.
    document.addEventListener("click", e => {
        const link = e.target.closest('a[href="#privacy"]');
        if (!link) return;
        e.preventDefault();
        if (location.hash !== "#privacy") {
            history.replaceState(null, "", location.pathname + location.search + "#privacy");
        }
        openPrivacyModal();
    });

    window.addEventListener("hashchange", checkPrivacyHash);
    closeBtn.addEventListener("click", closePrivacyModal);
    modal.addEventListener("click", e => { if (e.target === modal) closePrivacyModal(); });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && modal.classList.contains("open")) closePrivacyModal();
    });

    checkPrivacyHash();
});

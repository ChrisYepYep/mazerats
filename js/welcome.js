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
    const frameEl = document.getElementById("event-modal-frame");
    const imgEl = document.getElementById("event-modal-img");
    const hostEl = document.getElementById("event-modal-host");
    const builderEl = document.getElementById("event-modal-builder");
    const tagsEl = document.getElementById("event-modal-tags");
    const ecBadgeEl = document.getElementById("event-modal-ec-badge");
    const articleEl = document.getElementById("event-modal-article");
    const articleTitleEl = document.getElementById("event-modal-article-title");
    const articleMetaEl = document.getElementById("event-modal-article-meta");
    const articleBodyEl = document.getElementById("event-modal-article-body");
    const articleLinkEl = document.getElementById("event-modal-article-link");
    const metaEl = document.getElementById("event-modal-meta");
    const descEl = document.getElementById("event-modal-desc");
    const visitWrap = document.getElementById("event-modal-visit-wrap");
    const visitLink = document.getElementById("event-modal-link");
    const stripEl = document.getElementById("event-modal-strip");
    const linksWrap = document.getElementById("event-modal-links-wrap");
    const linksEl = document.getElementById("event-modal-links");

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // Escapes first, then links what's left — same order and same trailing-
    // punctuation handling as home.js's linkifyText, so an event's Links &
    // References reads identically on both pages.
    function linkifyText(str) {
        return escapeHtml(str).replace(/((?:https?:\/\/|www\.)[^\s<]+)/gi, match => {
            let core = match;
            let trailing = "";
            while (core.length) {
                const last = core[core.length - 1];
                if (".,!?;:".includes(last)) {
                    trailing = last + trailing;
                    core = core.slice(0, -1);
                    continue;
                }
                if (last === ")" && (core.match(/\)/g) || []).length > (core.match(/\(/g) || []).length) {
                    trailing = last + trailing;
                    core = core.slice(0, -1);
                    continue;
                }
                break;
            }
            if (!core) return match;
            const href = /^https?:\/\//i.test(core) ? core : `https://${core}`;
            return `<a href="${href}" target="_blank" rel="noopener" class="ref-link">${core}</a>${trailing}`;
        });
    }

    /* ---- the host's Habbo card ----

       The same avatar / online-or-last-seen / motto card home.html builds
       for a maze's builders, for the event's host. It is the last thing
       that made this modal look like a different, plainer component than
       the one it mirrors: everything else matched and the host was still a
       bare "by ChrisYepYep".

       Kept as its own small copy rather than shared with js/home.js, for
       the same reason the rest of this file is a copy — home.js is 157KB of
       grid, carousel and lightbox machinery this page must never load, and
       it is not written to be imported. What is duplicated here is the
       markup contract with css/style.css (.builder-list / .builder-card /
       .builder-avatar / .builder-name / .builder-status / .builder-motto),
       which is where the styling actually lives. */
    function creatorNames(host) {
        return String(host || "").split(",").map(s => s.trim()).filter(Boolean);
    }

    function relativeLastSeen(iso) {
        const then = new Date(iso);
        if (isNaN(then)) return "";
        const mins = Math.floor((Date.now() - then.getTime()) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
        const days = Math.floor(hours / 24);
        if (days < 30) return days + (days === 1 ? " day ago" : " days ago");
        return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    function builderCard(profile, mirrored) {
        const card = document.createElement("div");
        card.className = mirrored ? "builder-card builder-card--mirrored" : "builder-card";

        if (profile.avatar) {
            const avatar = document.createElement("img");
            avatar.className = "builder-avatar";
            avatar.src = profile.avatar;
            avatar.alt = "";
            avatar.loading = "lazy";
            // habbo.com's imaging service is outside this site's control —
            // if it fails, drop just the image rather than leaving a broken
            // icon next to a perfectly good name and motto.
            avatar.addEventListener("error", () => avatar.remove());
            card.appendChild(avatar);
        }

        const text = document.createElement("div");
        text.className = "builder-text";

        const nameLine = document.createElement("p");
        nameLine.className = "builder-name";
        // Text nodes throughout: names and mottos are written by Habbo
        // users, not by an admin here.
        nameLine.appendChild(document.createTextNode(profile.name));

        const status = document.createElement("span");
        status.className = profile.online ? "builder-status is-online" : "builder-status";
        status.textContent = profile.online
            ? "Online"
            : (profile.lastAccessTime ? "Last seen " + relativeLastSeen(profile.lastAccessTime) : "");
        if (status.textContent) nameLine.appendChild(status);
        text.appendChild(nameLine);

        if (profile.motto) {
            const motto = document.createElement("p");
            motto.className = "builder-motto";
            motto.textContent = profile.motto;
            text.appendChild(motto);
        }

        card.appendChild(text);
        return card;
    }

    // Guards against a slow profile lookup landing after the visitor has
    // opened a different event — the same token pattern home.js uses.
    let builderToken = 0;

    async function showHostCard(event) {
        const token = ++builderToken;
        builderEl.hidden = true;
        builderEl.innerHTML = "";
        hostEl.hidden = false;

        const names = creatorNames(event.host);
        if (!names.length) return;

        // In parallel and individually tolerant: a co-host who is not on the
        // hotel does not cost the others their card.
        const profiles = (await Promise.all(names.map(n => Api.getHabboProfile(n)))).filter(Boolean);
        if (token !== builderToken || !profiles.length) return;

        profiles.forEach((p, i) => builderEl.appendChild(builderCard(p, i % 2 === 1)));
        // The cards carry the names themselves, so "by <host>" would only
        // repeat them.
        hostEl.hidden = true;
        builderEl.hidden = false;
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
        // Bare "TBC", matching home.js's own formatEventDuration. It used to
        // return "Date TBC" because this string was the whole meta line and
        // had to say what it was about; it is now rendered behind a "Date:"
        // label like the homepage's, where that read "Date: Date TBC".
        if (!startIso) return "TBC";
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
        showHostCard(event);
        tagsEl.innerHTML = (event.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");

        /* An EC event's season medal, at the right of the builder row, and a
           wash of the badge's own green over the modal with it (see
           .modal.is-ec). Off the event's own season, so a regular event —
           which is every event with no ecSeason at all — is left exactly as
           it was. Only the two seasons the admin page offers are recognised;
           the value reaches a filename, so it is not taken on trust. */
        const ecSeason = ["s1", "s2"].includes(event.ecSeason) ? event.ecSeason : "";
        if (ecSeason) {
            ecBadgeEl.src = `assets/img/ec/ec-badge-${ecSeason}.png`;
            ecBadgeEl.alt = `EC season ${ecSeason.slice(1)}`;
        }
        ecBadgeEl.hidden = !ecSeason;
        modal.querySelector(".modal").classList.toggle("is-ec", !!ecSeason);
        /* The same status / hotel / date line home.html's modal writes, in
           the same order and markup. This was a bare date string before,
           which was the visible half of this modal having drifted from the
           one it is meant to mirror. EventStatus is the shared derivation
           the header ticker and the admin form already use, so the badge
           here cannot disagree with the one next to it on the page. */
        const statusKey = (typeof EventStatus !== "undefined")
            ? EventStatus.derive(event) : (event.status || "upcoming");
        const statusLabel = (typeof EventStatus !== "undefined")
            ? EventStatus.labelFor(event) : statusKey;
        metaEl.innerHTML =
            `<span class="status-badge status-${escapeHtml(statusKey)}">${escapeHtml(statusLabel)}</span>` +
            `<span>Hotel: ${escapeHtml(event.hotel || "Unknown")}</span>` +
            `<span>Date: ${escapeHtml(formatEventDuration(event.date, event.endDate))}</span>`;
        descEl.textContent = event.description || "";

        /* The stored Habbo article, if this event has one.
        
           body goes in as markup, which is the one place on this site that
           happens. It is safe because of where it comes from: it was rebuilt
           tag by tag against a whitelist by netlify/functions/article.js
           before it was ever stored, so what is held is already only the
           handful of elements an article is allowed to be. Nothing is fetched
           or parsed here.
        
           An article stands in for the event's full details — the admin form
           will not let both be set — so the description above it is the short
           one, and this reads as the piece itself below it. */
        const article = event.article;
        if (article && article.body) {
            articleTitleEl.textContent = article.title || "";
            articleMetaEl.textContent = [article.date, article.category].filter(Boolean).join("  —  ");
            articleBodyEl.innerHTML = article.body;
            articleLinkEl.href = article.url || "#";
            articleEl.hidden = false;
        } else {
            // Emptied, not just hidden: an article left in the DOM is a
            // screenful of the last event's text one class away from showing.
            articleBodyEl.innerHTML = "";
            articleEl.hidden = true;
        }
        // Same Links & References block home.html shows for an event.
        if (event.linksReferences) {
            linksEl.innerHTML = linkifyText(event.linksReferences);
            linksWrap.style.display = "block";
        } else {
            linksEl.innerHTML = "";
            linksWrap.style.display = "none";
        }

        if (event.habboLink) {
            visitLink.href = event.habboLink;
            visitWrap.style.display = "block";
        } else {
            visitWrap.style.display = "none";
        }

        const images = galleryImages(event);
        // .has-gallery goes on the thumb either way — it is what picks the
        // taller frame height for a multi-image event, and leaving it set
        // from a previous open would size a single image against it.
        thumbEl.classList.toggle("has-gallery", images.length > 1);
        if (images.length) {
            frameEl.style.display = "";
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
            frameEl.style.display = "none";
            imgEl.removeAttribute("src");
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

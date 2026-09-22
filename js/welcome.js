/* Drives the welcome/splash screen (index.html) — swaps the Enter button's
   label and behavior based on the landing state set from the admin page
   (see netlify/functions/settings.js). Defaults to a working "Enter" link
   if the check fails, so a live/API hiccup never locks visitors out. */
/* ---------------------------------------------------- THE COUNTDOWN

   Under the Enter button while the site is gated and a launch date is set.
   The markup is in index.html; this fills it and ticks it.

   THREE CONDITIONS, all required: the site is gated, a launchAt exists, and
   it is still in the future. Any one failing and this does nothing at all
   and the landing page is what it always was. That is deliberate — the gate
   is the only thing on this page that has to work, and a countdown is
   decoration on top of it.

   WHAT HAPPENS AT ZERO. Not the obvious thing. Reaching zero does NOT open
   the site: the gate is the landingState setting and only an admin flips
   it, which is right — a date typed a fortnight ago should not be able to
   publish the archive on its own while nobody is watching. So at zero the
   clock stops and starts asking the settings endpoint whether the switch
   has been thrown yet, and the moment it has, the page reloads into the
   open site. Somebody who left the tab open overnight walks in without
   touching anything, and nobody has to sit refreshing on launch morning.

   The poll is every 20 seconds and only ever runs after zero, so it costs
   nothing on any ordinary day.

   ---- AND IT IS JITTERED, WHICH IS THE WHOLE POINT OF THE NUMBERS BELOW.

   Every tab counting down reaches zero at the same instant — that is what
   a countdown to a fixed moment does. A plain setInterval would then have
   all of them ask the settings endpoint in the same second, and again
   twenty seconds later, and again: a thundering herd, arriving at exactly
   the minute the site is least able to absorb one, made entirely of
   people who are already waiting patiently.

   So each tab waits a random 0–20s on top of the base interval. The same
   number of requests still arrive, spread over a window instead of
   stacked on an instant, and nobody waits meaningfully longer for it —
   the endpoint is edge-cached for twenty seconds anyway (see
   GATE_CDN_CACHE in netlify/functions/_cache.js), so the spread lines up
   with how long a cached answer is good for. */
const COUNTDOWN_POLL_MS = 20000;
const COUNTDOWN_POLL_JITTER_MS = 20000;

const nextPollDelay = () =>
    COUNTDOWN_POLL_MS + Math.floor(Math.random() * COUNTDOWN_POLL_JITTER_MS);

function startCountdown(target) {
    const box = document.getElementById("welcome-countdown");
    if (!box) return;

    const label = document.getElementById("welcome-countdown-label");
    const when = document.getElementById("welcome-countdown-when");
    const parts = {
        days: document.getElementById("wc-days"),
        hours: document.getElementById("wc-hours"),
        mins: document.getElementById("wc-mins"),
        secs: document.getElementById("wc-secs")
    };
    if (!label || !when || Object.values(parts).some(el => !el)) return;

    label.textContent = "The archive opens in";
    /* The date said twice over: the clock says how long, this says when.

       IN THE READER'S OWN TIMEZONE, unlike everything else on the site,
       which is UTC. "Saturday 3 October at 10:00" is what somebody sets an
       alarm for; UTC is a sum they have to do first. The clock above is
       the same instant either way. Said out loud on the end, because a
       time with no zone on a site whose every other time is UTC is a time
       somebody will get wrong by an hour.

       "en-GB" for the FORMAT, though — the local zone is the point here,
       the local date order is not. Left as undefined this printed
       "October 3 at 10:00 AM" on an American machine, which is the same
       split the daily games had until it was fixed (see longDate in
       js/oddoneout.js). The site writes dates one way. */
    when.textContent = target.toLocaleString("en-GB", {
        weekday: "long", day: "numeric", month: "long",
        hour: "2-digit", minute: "2-digit"
    }) + " your time";
    box.hidden = false;

    const pad = n => String(n).padStart(2, "0");
    let pollTimer = null;

    /* Reload only once the gate has actually been lifted. A failed check is
       not a reason to reload — reloading a gated page just shows the gate
       again, and doing it every twenty seconds would be a page that flickers
       at anyone who leaves it open. */
    async function checkIfOpen() {
        try {
            const { landingState } = await Api.getSiteSettings();
            if (landingState !== "coming-soon" && landingState !== "maintenance") {
                location.reload();
            }
        } catch (e) { /* still shut, or still offline; ask again shortly */ }
    }

    function tick() {
        const left = target.getTime() - Date.now();
        if (left <= 0) {
            // Stop counting and start watching. The wording is honest about
            // what it knows: the moment has arrived, the switch has not
            // necessarily been thrown.
            label.textContent = "Opening any moment now";
            box.classList.add("is-due");
            parts.days.textContent = "0";
            parts.hours.textContent = "00";
            parts.mins.textContent = "00";
            parts.secs.textContent = "00";
            when.textContent = "";
            clearInterval(ticker);
            if (!pollTimer) {
                /* The FIRST check is jittered too, and that one matters
                   most: it is the one every waiting tab would otherwise
                   fire in the same second the clock strikes. A few seconds
                   of spread before the first ask costs a visitor nothing —
                   they have been waiting a fortnight — and it is the
                   difference between a spike and a trickle. */
                pollTimer = setTimeout(function poll() {
                    checkIfOpen();
                    pollTimer = setTimeout(poll, nextPollDelay());
                }, Math.floor(Math.random() * COUNTDOWN_POLL_JITTER_MS));
            }
            return;
        }
        const secs = Math.floor(left / 1000);
        parts.days.textContent = String(Math.floor(secs / 86400));
        parts.hours.textContent = pad(Math.floor(secs / 3600) % 24);
        parts.mins.textContent = pad(Math.floor(secs / 60) % 60);
        parts.secs.textContent = pad(secs % 60);
    }

    const ticker = setInterval(tick, 1000);
    tick();
}

/* ------------------------------------------- FETCHING IT BEFORE IT IS ASKED

   The archive's slow part is one 460KB response (73KB over the wire) that
   home.html cannot start asking for until home.html has loaded. So the
   landing page starts asking the moment somebody looks like they are about
   to press Enter, and the archive lands on a browser that already has it.

   ON INTENT, NOT ON ARRIVAL. Pointing at a button, tabbing onto it or
   putting a finger down on it are all a few hundred milliseconds of warning
   before the click, and all of them mean this visitor is going. Fetching on
   page load instead would pull 73KB for everybody who reads the front door
   and leaves, which on a launch day is a great many people.

   THE FETCH IS THROWN AWAY, and that is fine — the point is the copy the
   browser keeps. /rooms answers with `public, max-age=0, must-revalidate`
   (see netlify/functions/_cache.js), so the body is stored and the real
   request a second later revalidates into a 304 with no body at all. It
   also warms the CDN's own copy for whoever is next through the door in
   the same region, which is worth having on the one day everybody arrives
   at once.

   ONCE. `{ once: true }` on all three listeners, and a flag besides, because
   pointerenter and focus both fire for somebody navigating by keyboard. */
let warmed = false;

function warmTheArchive(btn) {
    if (!btn) return;

    const warm = () => {
        if (warmed) return;
        warmed = true;

        // The page itself, and everything its <head> pulls in.
        try {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.href = "/home";
            link.as = "document";
            document.head.appendChild(link);
        } catch (e) { /* an old browser without rel=prefetch; the fetch below still helps */ }

        // And the archive, which is the part that actually takes the time.
        // Failures are silent on purpose: this is an optimisation, and the
        // real request on the next page handles its own errors as it always
        // did.
        fetch("/.netlify/functions/rooms", { credentials: "same-origin" }).catch(() => {});
    };

    ["pointerenter", "focus", "touchstart"].forEach(type => {
        btn.addEventListener(type, warm, { once: true, passive: true });
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const btn = document.getElementById("welcome-btn");
    const label = document.getElementById("welcome-btn-label");

    const { landingState, launchAt } = await Api.getSiteSettings();

    // aria-disabled moves with the label: the button is focusable in every
    // state (see its markup in index.html), so the state has to be spoken
    // rather than left to the visual treatment alone.
    if (landingState === "coming-soon") {
        label.textContent = "Coming Soon";
        btn.removeAttribute("href");
        btn.classList.add("is-disabled");
        btn.setAttribute("aria-disabled", "true");
    } else if (landingState === "maintenance") {
        label.textContent = "Maintenance, Back Soon!";
        btn.removeAttribute("href");
        btn.classList.add("is-disabled");
        btn.setAttribute("aria-disabled", "true");
    } else {
        label.textContent = "Enter";
        /* The clean address, not the filename. This is the one link on the
           site that every first-time visitor presses, so whatever it says is
           what ends up in the address bar — and, from there, in whatever they
           paste into Discord. The prefetch above was pointed at the same
           spelling for the same reason: two spellings would be two cache
           entries and the warm one would be the address nobody arrives at. */
        btn.setAttribute("href", "/home");
        btn.classList.remove("is-disabled");
        btn.removeAttribute("aria-disabled");
        // A real link again, so it takes its place in the tab order on its
        // own terms rather than through the stand-in role.
        btn.removeAttribute("role");
        btn.removeAttribute("tabindex");
        warmTheArchive(btn);
    }

    /* The countdown, once the button above has said its piece.

       Only while gated: on a live site the door is open and how long it
       took to get here is nobody's business. Parsed defensively because
       this value came over the wire — an unreadable date leaves the gate
       exactly as the block above left it. */
    const gated = landingState === "coming-soon" || landingState === "maintenance";
    if (gated && launchAt) {
        const target = new Date(launchAt);
        if (!isNaN(target.getTime()) && target.getTime() > Date.now()) {
            startCountdown(target);
        }
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
    const ecLabelEl = document.getElementById("event-modal-ec-label");
    // Worded exactly as js/home.js words it — the same badge on the same row.
    const EC_SEASON_NAMES = { s1: "Event Creators Season One", s2: "Event Creators Season Two" };

    // Built exactly as js/home.js builds it, for the same row under the same
    // CSS: the phrase and its "EC / S2" short form, one shown at each width.
    // See js/home.js for why both are written rather than one chosen here.
    function ecLabelForms(season) {
        const full = document.createElement("span");
        full.className = "ec-label-full";
        full.textContent = EC_SEASON_NAMES[season].replace(" Season", "\nSeason");
        const short = document.createElement("span");
        short.className = "ec-label-short";
        short.textContent = `EC\n${season.toUpperCase()}`;
        return [full, short];
    }
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
    /* Several hosts in one card, rather than a card each.

       The same shape js/home.js builds when a maze credits three or more
       builders — avatars in a row, names on one line under them — and it is
       here for the same reason it is there: past a pair, a column of full
       cards is taller than the modal wants to be and says the same thing
       less clearly. The Valentines and Anniversary collabs have four hosts
       apiece, which was four stacked cards on this page against one combined
       card two clicks away.

       Markup contract with css/style.css, exactly as the rest of this file's
       copy is: .builder-card--collab / .builder-avatars / .builder-avatar /
       .builder-text / .builder-name. Nothing new is styled for it. */
    function collabCard(profiles) {
        const card = document.createElement("div");
        card.className = "builder-card builder-card--collab";

        const avatars = document.createElement("div");
        avatars.className = "builder-avatars";
        profiles.forEach(profile => {
            if (!profile.avatar) return;
            const avatar = document.createElement("img");
            avatar.className = "builder-avatar";
            avatar.src = profile.avatar;
            avatar.alt = "";
            avatar.loading = "lazy";
            // A host whose figure will not load drops out rather than
            // leaving a broken image in the row.
            avatar.addEventListener("error", () => avatar.remove());
            avatars.appendChild(avatar);
        });
        if (avatars.children.length) card.appendChild(avatars);

        const text = document.createElement("div");
        text.className = "builder-text";
        const nameLine = document.createElement("p");
        nameLine.className = "builder-name";
        // Text node, not innerHTML — these names come from Habbo.
        nameLine.appendChild(document.createTextNode(profiles.map(p => p.name).join(", ")));
        text.appendChild(nameLine);
        card.appendChild(text);

        return card;
    }

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

        /* MORE THAN ONE HOST AND THEY SHARE A CARD. Only a solo host gets the
           full treatment with their motto and last-seen under them.

           The same single rule js/home.js now uses for a maze's builders —
           see showBuilderCard there. Two people who ran something together
           are one credit, and the same event opened in either modal says so
           the same way. */
        if (profiles.length > 1) {
            builderEl.appendChild(collabCard(profiles));
        } else {
            profiles.forEach((p, i) => builderEl.appendChild(builderCard(p, i % 2 === 1)));
        }
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
            // Spelled out and abbreviated, exactly as js/home.js sets them —
            // see there for why both are written and the CSS chooses.
            ecBadgeEl.alt = EC_SEASON_NAMES[ecSeason];
            ecLabelEl.replaceChildren(...ecLabelForms(ecSeason));
        }
        ecBadgeEl.hidden = !ecSeason;
        ecLabelEl.hidden = !ecSeason;
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

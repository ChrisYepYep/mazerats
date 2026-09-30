/* ===========================================================
   Maze Rats — the Guides window

   How-to guides for furni mazes, read in a window on the homepage rather
   than on a page of their own, so a guide is always a click away from the
   mazes it talks about (a link in a guide opens the maze itself).

   Two views in one window:
     LIST    every published guide as a card, with a category filter
     READER  one guide: its summary, a contents list, and its sections,
             each with the picture that shows it

   ADDRESSES. /guides is a rewrite to this page (netlify.toml), so it can
   be linked and shared; a single guide is /guides/<slug>, the slug
   following its title (netlify/functions/_slugs.js). That address is
   served by netlify/functions/share.js: this page, with the guide's own
   preview tags written in. The old /guides?g=<id> form still opens the
   guide, and is rewritten to the clean address. Opening the
   window from the menu pushes one history entry, so Back closes it, as it
   does for a maze; moving between guides inside it replaces that entry
   rather than stacking more.

   The guides come from netlify/functions/guides.js, and are edited in the
   /warren Guides panel (js/admin-guides.js). Their text is rendered by
   js/guide-text.js, which escapes it first. js/home.js reads them through
   window.Guides to put them in What's New.
   =========================================================== */
(function () {
    "use strict";

    const overlay = document.getElementById("guides-overlay");
    const body = document.getElementById("guides-body");
    const win = document.getElementById("guides-window");
    const closeBtn = document.getElementById("guides-close");
    if (!overlay || !body || !win || typeof GuideText === "undefined") return;

    const URL_ = "/.netlify/functions/guides";
    const esc = GuideText.esc;

    let guides = [];            // published, as the server orders them
    let loaded = false;
    let failed = false;
    let loading = null;
    let asking = 0;             // requests still in flight (see draw)
    const listeners = [];

    let view = { id: null };    // null = the list
    let category = "";          // the list's filter; "" = all
    let ownsEntry = false;      // this window pushed the history entry it is on
    let pendingBack = false;    // a Back of our own is in flight
    let pendingPush = null;     // an address waiting for that Back to land
    let basePath = "/home";     // where closing returns the address to
    let triggerEl = null;
    let retriedFor = null;      // a missing guide id already re-asked for, uncached

    // ------------------------------------------------------------ loading

    /* fresh: ask past the CDN's copy. The public list is cached at the edge
       for a minute and served stale for up to a day while it refreshes
       (netlify/functions/_cache.js), so a guide published a moment ago can
       be missing from it, and one just edited can show its old words. A
       query string the function ignores is a different cache key. */
    /* And on a 10s leash, like js/api.js's _getWithFallback. A request that
       hung never reached the catch below, so `loading` stayed set to a
       promise that would never settle: the window sat on its loading state,
       and every later open returned that same dead promise instead of
       asking again. The abort lands in the catch like any failure, which
       clears `loading` and draws the existing retry state. The timer is not
       cleared on the headers, so a body that stalls is covered as well.

       TWO ATTEMPTS, 10s then 15s — the pair _getWithFallback uses, and for
       its reason: the likeliest cause of a slow answer is a cold function,
       and the second ask usually finds it warm. With one 10s attempt a cold
       start on a phone was "Couldn't load the guides" and a Retry button,
       for a list that would have arrived a couple of seconds later. */
    const LOAD_ATTEMPTS = [10000, 15000];

    function fetchList(url) {
        const attempt = i => {
            const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), LOAD_ATTEMPTS[i]) : null;
            return fetch(url, {
                headers: { Accept: "application/json" },
                signal: controller ? controller.signal : undefined
            })
                .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
                .then(list => { clearTimeout(timer); return list; }, e => {
                    clearTimeout(timer);
                    if (i + 1 < LOAD_ATTEMPTS.length) return attempt(i + 1);
                    throw e;
                });
        };
        return attempt(0);
    }

    function load(fresh) {
        if (loading && !fresh) return loading;
        failed = false;
        asking++;
        loading = fetchList(URL_ + (fresh ? `?fresh=${Date.now()}` : ""))
            .then(list => {
                guides = Array.isArray(list) ? list.filter(g => g && g.id) : [];
                loaded = true;
                listeners.forEach(fn => { try { fn(); } catch (e) { /* one listener is not the others' problem */ } });
            })
            .catch(() => { failed = true; loading = null; })
            .then(() => { asking--; if (isOpen()) draw(); });
        return loading;
    }

    const isOpen = () => overlay.classList.contains("open");
    // A guide by its address or its id: view.id is whichever the address
    // named, until the list arrives to say which guide that is.
    const byId = key => (key ? guides.find(g => window.RecordAddress.matches(g, key)) || servedGuide(key) : null) || null;

    /* The guide the share function served this page for, when the address
       it was served at is the one being asked about (its
       <meta name="mazerats:record">, see netlify/functions/share.js). The
       guides list is edge-cached, so a guide renamed a moment ago is still
       listed under its old address and its new one found nothing; the id
       in the tag never changes. */
    function servedGuide(key) {
        const tag = document.querySelector('meta[name="mazerats:record"]');
        const m = tag && /^guide:(.+)$/.exec(tag.getAttribute("content") || "");
        const here = window.RecordAddress.parse(location.pathname);
        if (!m || !here || here.kind !== "guide" || here.key !== key) return null;
        return guides.find(g => g.id === m[1]) || null;
    }

    // ------------------------------------------------------------ helpers

    /* In UTC, as every other date on the site is (28 Sept 2026). In the
       reader's own zone a guide published late in the evening, UK time, was
       dated the next day for anyone east of here and the day before for
       anyone far enough west — so the same guide carried different dates
       for different readers. */
    function longDate(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    }

    function categories() {
        const seen = [];
        guides.forEach(g => { if (g.category && !seen.includes(g.category)) seen.push(g.category); });
        return seen;
    }

    // A picture as the page shows it. Guide pictures are small pixel-art
    // screenshots, so they are drawn at their own size, never resampled
    // up by an image service.
    const pic = (src, alt, cls) => src
        ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt || "")}" loading="lazy" decoding="async">`
        : "";

    // ------------------------------------------------------------ drawing

    function listHtml() {
        if (!loaded) {
            return failed
                ? `<p class="guides-note">The guides couldn't be loaded just now. <button type="button" class="guides-textbtn" data-act="retry">Try again</button></p>`
                : `<p class="guides-note">Loading the guides…</p>`;
        }
        if (!guides.length) return `<p class="guides-note">There are no guides yet. Check back soon.</p>`;

        const cats = categories();
        const shown = guides.filter(g => !category || g.category === category);
        const chips = cats.length > 1 ? `
            <div class="guides-cats" role="group" aria-label="Guide category">
                <button type="button" class="guides-cat${category ? "" : " is-on"}" data-cat="" aria-pressed="${!category}">All</button>
                ${cats.map(c => `<button type="button" class="guides-cat${c === category ? " is-on" : ""}" data-cat="${esc(c)}" aria-pressed="${c === category}">${esc(c)}</button>`).join("")}
            </div>` : "";

        return `
            <p class="guides-intro">How furni mazes work, and how to get through them. Every trick here turns up somewhere in the archive.</p>
            ${chips}
            <ul class="guides-cards">
                ${shown.map(g => {
                    // No picture anywhere in the guide: the card is words only,
                    // rather than an empty box where a picture would be.
                    const thumb = GuideText.thumbOf(g);
                    return `
                    <li>
                        <a class="guides-card${thumb ? "" : " no-thumb"}" href="${esc(addressFor(g.id))}" data-guide="${esc(g.id)}">
                            ${thumb ? `<span class="guide-thumb guides-card-thumb">${pic(thumb, "", "")}</span>` : ""}
                            <span class="guides-card-text">
                                ${g.category ? `<span class="guides-pill">${esc(g.category)}</span>` : ""}
                                <span class="guides-card-title">${esc(g.title)}</span>
                                <span class="guides-card-summary">${esc(GuideText.plain(g.summary))}</span>
                                <span class="guides-card-meta">${(g.sections || []).length} ${(g.sections || []).length === 1 ? "section" : "sections"}</span>
                            </span>
                        </a>
                    </li>`;
                }).join("")}
            </ul>`;
    }

    function readerHtml(g) {
        const sections = g.sections || [];
        // By the reader's day, as What's New decides it (js/guide-text.js).
        const updated = GuideText.wasUpdated(g)
            ?`Updated ${longDate(g.updatedAt)}` : (g.publishedAt ? `Added ${longDate(g.publishedAt)}` : "");
        const others = guides.filter(o => o.id !== g.id).slice(0, 3);
        // Beside the summary, framed like the section pictures.
        const thumb = GuideText.thumbOf(g);
        return `
            <nav class="guides-crumbs">
                <button type="button" class="guides-textbtn" data-act="list">&lsaquo; All guides</button>
                <button type="button" class="guides-textbtn" data-act="copy">Copy link</button>
            </nav>
            <header class="guide-head${thumb ? " has-thumb" : ""}">
                <div class="guide-head-text">
                    ${g.category ? `<span class="guides-pill">${esc(g.category)}</span>` : ""}
                    <h3 class="guide-title" id="guide-title">${esc(g.title)}</h3>
                    ${g.summary ? `<div class="guide-summary">${GuideText.render(g.summary)}</div>` : ""}
                    ${updated ? `<p class="guide-date">${esc(updated)}</p>` : ""}
                </div>
                ${thumb ? `<span class="guide-thumb guide-head-thumb">${pic(thumb, g.title, "")}</span>` : ""}
            </header>
            ${sections.length > 2 ? `
                <nav class="guide-contents" aria-label="In this guide">
                    <p class="guide-contents-title">In this guide</p>
                    <ol>${sections.map((s, i) => s.heading
                        ? `<li><button type="button" class="guides-textbtn" data-jump="${i}">${esc(s.heading)}</button></li>` : "").join("")}</ol>
                </nav>` : ""}
            ${sections.map((s, i) => `
                <section class="guide-section" id="guide-section-${i}">
                    ${s.heading ? `<h4 class="guide-section-title">${esc(s.heading)}</h4>` : ""}
                    ${s.image ? `
                        <figure class="guide-figure is-zoomable" title="Click to see it full size"
                            role="button" tabindex="0" aria-expanded="false" aria-label="${esc(s.heading ? `Picture: ${s.heading}, full size` : "Picture, full size")}">
                            ${pic(s.image, s.heading, "guide-img")}
                        </figure>` : ""}
                    <div class="guide-body">${GuideText.render(s.body)}</div>
                </section>`).join("")}
            ${others.length ? `
                <aside class="guide-more">
                    <p class="guide-contents-title">More guides</p>
                    <ul>${others.map(o => `<li><a class="guide-link" href="${esc(addressFor(o.id))}" data-guide="${esc(o.id)}">${esc(o.title)}</a></li>`).join("")}</ul>
                </aside>` : ""}
            <p class="guides-copied" role="status" aria-live="polite"></p>`;
    }

    /* opts.focus: the view changed from inside the window, so focus goes to
       the new view's heading. Rebuilding #guides-body otherwise drops focus
       to <body>, and a keyboard or screen-reader user is thrown out of the
       window. A redraw that swept away whatever had focus inside the body
       (the list arriving under "Try again", say) does the same. */
    function draw(opts) {
        const o = opts || {};
        const hadFocus = body.contains(document.activeElement);
        const g = view.id ? byId(view.id) : null;
        if (view.id && loaded && !g) {
            if (retriedFor !== view.id) {
                // Not in the list we have, which may be the CDN's older copy
                // (a guide published a moment ago, or the /warren View link):
                // ask once more past the cache before saying it isn't there.
                retriedFor = view.id;
                body.innerHTML = `<p class="guides-note">Loading the guide…</p>`;
                load(true);
            } else if (asking) {
                // That second ask, sent again from "Try again", still going.
                body.innerHTML = `<p class="guides-note">Loading the guide…</p>`;
            } else if (failed) {
                /* The second ask never got an answer (30 Sept 2026). That
                   says nothing about whether the guide exists, so it is the
                   retry note, not "isn't available" — which, for a guide
                   published a moment ago on a flaky connection, was wrong. */
                body.innerHTML = `<p class="guides-note">Couldn't load that guide. <button type="button" class="guides-textbtn" data-act="retry-guide">Try again</button></p>`;
            } else {
                // A link to a guide that is not (or no longer) published.
                body.innerHTML = `<p class="guides-note">That guide isn't available. <button type="button" class="guides-textbtn" data-act="list">See all guides</button></p>`;
            }
        } else {
            body.innerHTML = g ? readerHtml(g) : listHtml();
        }
        win.setAttribute("aria-labelledby", g ? "guide-title" : "guides-title");
        if (isOpen()) {
            setMeta(g);
            // The address the guide was reached by (an old ?g= link, its id)
            // becomes its own, now the list has said which guide it names.
            if (g && onGuidesPath() && pendingPush === null && location.pathname + location.search !== addressFor(g.id)) {
                try { history.replaceState(history.state, "", addressFor(g.id)); } catch (e) { /* fine */ }
            }
        }
        if (o.focus || hadFocus) focusHeading(g);
    }

    function focusHeading(g) {
        const h = g ? document.getElementById("guide-title") : document.getElementById("guides-title");
        if (!h) return;
        if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
        h.focus({ preventScroll: true });
    }

    /* The page's own title, canonical and og:url name the archive. While the
       window is open they name what it shows, so a bookmark, a share sheet or
       a crawler that runs the page gets the guide's address, not /home's.
       The archive's are put back on close (PageMeta in js/site.js). */
    function setMeta(g) {
        if (!window.PageMeta) return;
        window.PageMeta.set("guides", g ? `${g.title} — Maze Rats Guides` : "Guides — Maze Rats",
            "https://mazerats.net" + addressFor(g ? g.id : null));
    }

    function restoreMeta() {
        if (window.PageMeta) window.PageMeta.restore("guides");
    }

    // ------------------------------------------------------------ address

    /* A guide's address, /guides/<slug>: the same one it is shared at, so a
       chat client unfurls it with the guide's own title and thumbnail (see
       netlify/functions/share.js). Before the list has arrived a guide is
       only known by what the address said, which is used as it stands. */
    function addressFor(key) {
        if (!key) return "/guides";
        const g = byId(key);
        return g ? window.RecordAddress.of("guide", g) : `/guides/${encodeURIComponent(key)}`;
    }

    // The guide the address names: /guides/<slug>, or the old ?g=<id>.
    function idFromAddress() {
        const p = window.RecordAddress.parse(location.pathname);
        if (p && p.kind === "guide") return p.key;
        try { return new URLSearchParams(location.search).get("g") || null; } catch (e) { return null; }
    }

    const onGuidesPath = () => /^\/guides(?:\/[^/]+)?\/?$/.test(location.pathname);

    function setAddress(id) {
        // A push still waiting on our own Back: rewriting the address now
        // would rewrite the entry being left, so the waiting push takes it.
        if (pendingPush !== null) { pendingPush = addressFor(id); return; }
        try { history.replaceState(history.state, "", addressFor(id)); } catch (e) { /* sandboxed: the window still works */ }
    }

    // Whether the entry the browser is on is one this window pushed. The
    // state object survives Back and Forward, so it answers for either.
    const isOurEntry = () => !!(history.state && history.state.guides);

    // ------------------------------------------------------------ open/close

    // opts.focus: see draw().
    function show(id, opts) {
        view = { id: id || null };
        draw(opts);
        body.scrollTop = 0;
    }

    /* opts.fromAddress: opened because the address says so (a pasted link,
       or Forward), so there is nothing of ours to push. Whether the entry is
       ours comes from its state: Forward onto an entry this window pushed
       earlier owns it, and closing steps back off it as a Back would,
       rather than rewriting it into a second /home that the next Back
       press seems to do nothing on. A pasted link's entry is the visitor's
       way into the site and is never ours. */
    function open(id, opts) {
        const o = opts || {};
        if (!isOpen()) {
            triggerEl = document.activeElement;
            if (!o.fromAddress) {
                if (pendingBack) {
                    /* Closed and reopened before our history.back() has
                       landed: a push now would be the entry that Back pops.
                       It waits for the popstate instead (as js/home.js does
                       for the room window). */
                    pendingPush = addressFor(id);
                    ownsEntry = false;
                } else {
                    basePath = location.pathname + location.search + location.hash;
                    try {
                        history.pushState({ guides: true }, "", addressFor(id));
                        ownsEntry = true;
                    } catch (e) { ownsEntry = false; }
                }
            } else {
                basePath = "/home";
                ownsEntry = !!o.owned;
            }
            overlay.classList.add("open");
            document.body.classList.add("modal-open");
        } else {
            setAddress(id);
        }
        show(id);
        load();
        win.focus();
    }

    /* opts.fromHistory: the address has already moved on (Back), so only
       the window closes. opts.keepFocus: something else is opening in its
       place and will take focus itself. opts.handOff: the room window is
       opening in its place and takes over the entry this window pushed
       (see "guides" in js/home.js's syncModalHistory), so an entry of ours
       is left exactly as it is. An entry that is not ours is rewritten to
       the address underneath as usual. */
    function close(opts) {
        const o = opts || {};
        if (!isOpen()) return;
        overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
        restoreMeta();
        if (!o.fromHistory) {
            if (pendingBack) {
                // Reopened and closed again while our Back is still in
                // flight: that Back already lands where closing wants to be.
                pendingPush = null;
            } else if (ownsEntry && o.handOff) {
                // Left for the room window to replace.
            } else if (ownsEntry && !o.replace) {
                pendingBack = true;
                history.back();
            } else {
                try { history.replaceState(null, "", basePath || "/home"); } catch (e) { /* fine */ }
            }
        }
        ownsEntry = false;
        const back = triggerEl;
        triggerEl = null;
        if (o.keepFocus || !back || !document.body.contains(back)) return;
        const landing = back.closest && back.closest("#side-menu") ? document.getElementById("side-spine") : back;
        if (landing && typeof landing.focus === "function") landing.focus({ preventScroll: true });
    }

    window.addEventListener("popstate", () => {
        if (pendingBack) {
            pendingBack = false;
            // A reopen that was waiting on this Back gets its entry now that
            // the old one is gone, pushed from the entry it will return to.
            if (pendingPush !== null && isOpen()) {
                basePath = location.pathname + location.search + location.hash;
                try {
                    history.pushState({ guides: true }, "", pendingPush);
                    ownsEntry = true;
                } catch (e) { ownsEntry = false; }
            }
            pendingPush = null;
            return;
        }
        if (onGuidesPath()) {
            // Forward onto a guides address, or Back from one guide to the
            // list inside the window.
            if (!isOpen()) open(idFromAddress(), { fromAddress: true, owned: isOurEntry() });
            else show(idFromAddress(), { focus: true });
        } else if (isOpen()) {
            close({ fromHistory: true });
        }
    });

    // ------------------------------------------------------------ clicks

    body.addEventListener("click", e => {
        const t = e.target;
        const guideLink = t.closest("[data-guide]");
        if (guideLink) {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // a new tab is the browser's
            e.preventDefault();
            setAddress(guideLink.dataset.guide);
            show(guideLink.dataset.guide, { focus: true });
            return;
        }
        const inGuide = t.closest("[data-guide-guide]");
        if (inGuide) {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            setAddress(inGuide.dataset.guideGuide);
            show(inGuide.dataset.guideGuide, { focus: true });
            return;
        }
        /* A maze or an event named in a guide opens where every maze opens:
           the room window, over the archive. The guide closes first without
           stepping back (the room window's entry would be raced by our
           Back), and hands its entry over: the room window REPLACES it with
           the maze's address (30 Sept 2026). Rewriting it to /home here and
           letting the room window push on top left /home twice in a row, so
           the Back after closing the maze seemed to do nothing. */
        const record = t.closest("[data-guide-maze], [data-guide-event]");
        if (record) {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            const kind = record.dataset.guideMaze ? "maze" : "event";
            const id = record.dataset.guideMaze || record.dataset.guideEvent;
            close({ handOff: true, keepFocus: true });
            if (!(window.ArchiveRecords && window.ArchiveRecords.open(kind, id, { fromGuides: true }))) {
                location.href = window.RecordAddress.of(kind, { id });
            }
            return;
        }
        // A section's picture: see toggleZoom.
        const figImg = t.closest(".guide-figure.is-zoomable .guide-img");
        if (figImg) {
            toggleZoom(figImg.closest(".guide-figure"));
            return;
        }
        const jump = t.closest("[data-jump]");
        if (jump) {
            const target = body.querySelector(`#guide-section-${Number(jump.dataset.jump)}`);
            if (target) {
                body.scrollTo({ top: target.offsetTop - body.offsetTop - 8, behavior: "smooth" });
                const h = target.querySelector(".guide-section-title");
                if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
            }
            return;
        }
        const cat = t.closest("[data-cat]");
        if (cat) {
            category = cat.dataset.cat;
            draw();
            // The chips are redrawn with the list: focus goes back to the
            // one just pressed rather than to the heading, so arrowing along
            // the filters keeps its place.
            const again = [...body.querySelectorAll("[data-cat]")].find(b => b.dataset.cat === category);
            if (again) again.focus({ preventScroll: true });
            return;
        }
        const act = t.closest("[data-act]");
        if (!act) return;
        if (act.dataset.act === "list") { setAddress(null); show(null, { focus: true }); }
        else if (act.dataset.act === "retry") { load(); draw({ focus: true }); }
        // Past the cache again: the cached list is the one that lacked it.
        else if (act.dataset.act === "retry-guide") { load(true); draw({ focus: true }); }
        else if (act.dataset.act === "copy") {
            const note = body.querySelector(".guides-copied");
            // The share address, so a pasted link unfurls as this guide.
            const link = location.origin + addressFor(view.id);
            const done = ok => { if (note) note.textContent = ok ? "Link copied." : link; };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => done(true), () => done(false));
            else done(false);
        }
    });

    /* A section's picture sits in a narrow column beside its text; pressing
       it shows it at full size across the section, and back again. The
       figure is a button (see readerHtml), so this works from the keyboard
       too, and says which way it is. */
    function toggleZoom(fig) {
        const sec = fig && fig.closest(".guide-section");
        if (!sec) return;
        const big = sec.classList.toggle("is-big");
        fig.setAttribute("aria-expanded", String(big));
        fig.title = big ? "Click to see it smaller" : "Click to see it full size";
    }

    body.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const fig = e.target.closest && e.target.closest(".guide-figure.is-zoomable");
        if (!fig || e.target !== fig) return;
        e.preventDefault(); // Space would otherwise scroll the window
        toggleZoom(fig);
    });

    if (closeBtn) closeBtn.addEventListener("click", () => close());
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    if (window.EscapeLayers) {
        window.EscapeLayers.register({
            elements: () => isOpen() ? [overlay] : [],
            close: () => close()
        });
    }

    // ------------------------------------------------------------ start

    /* ?fresh=1 comes from the /warren View link: an admin who has just saved
       wants the guide as saved, not the CDN's minute-old copy. It is taken
       off the address at once, so a link copied from here is the plain one. */
    let freshAsked = false;
    try { freshAsked = new URLSearchParams(location.search).has("fresh"); } catch (e) { /* old browser: no fresh copy */ }
    load(freshAsked);
    // A pasted /guides (or /guides?g=...) link opens straight onto it.
    if (onGuidesPath()) {
        if (freshAsked) {
            try { history.replaceState(history.state, "", addressFor(idFromAddress())); } catch (e) { /* fine */ }
        }
        open(idFromAddress(), { fromAddress: true });
    }

    window.Guides = {
        open: id => open(id || null),
        close,
        list: () => guides.slice(),
        loaded: () => loaded,
        onLoad(fn) { if (typeof fn === "function") listeners.push(fn); }
    };
})();

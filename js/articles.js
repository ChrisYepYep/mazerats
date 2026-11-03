/* ===========================================================
   Maze Rats: the Articles window (2 Nov 2026, the owner's)

   "Once I've spun the wheel to draw the winner, I need a way to announce
   the winner on the website." An article is written in the Warren's What's
   New panel (js/admin-articles.js), stored by netlify/functions/articles.js
   and read here, in a window built like the maze and event window: the
   title in the titlebar, its pictures at the top (the gallery, or its
   thumbnail), the byline (the day it went public and who wrote it), a
   button to the event it is about, and the text, drawn by
   js/article-text.js (the guides' format, plus quotes, pictures with
   captions and embed blocks).

   Two views in the one window:
     READER  one article, at /article/<slug>
     LIST    every article, newest first, at /articles (the menu's row for
             it is admin-only for now; see ADMINS_FIRST in js/home.js)

   ADDRESSES and HISTORY are the Guides window's (js/guides.js), step for
   step: opening from the page pushes one entry, so Back closes it; an
   article opened from the list's cards pushes one more, so Back returns
   to the list; a pasted link's entry is the visitor's way in and is
   rewritten to /home on close rather than stepped back off. A maze or an
   event named in an article (or the event button) closes this window and
   hands its entry to the room window (window.ArchiveRecords, "guides" in
   js/home.js's syncModalHistory), so one Back leaves it.

   js/home.js reads the list through window.Articles for What's New, the
   spotlight, the search and the event window's "Read the article".
   =========================================================== */
(function () {
    "use strict";

    const overlay = document.getElementById("article-overlay");
    if (!overlay || typeof ArticleText === "undefined" || typeof GuideText === "undefined" || !window.RecordAddress) return;
    const win = overlay.querySelector(".art-window");
    const titleEl = document.getElementById("article-title");
    const closeBtn = document.getElementById("article-close");
    const listEl = document.getElementById("article-list");
    const reader = document.getElementById("article-reader");
    const frame = document.getElementById("article-frame");
    const topEl = document.getElementById("article-top");
    const img = document.getElementById("article-img");
    const prevBtn = document.getElementById("article-prev");
    const nextBtn = document.getElementById("article-next");
    const position = document.getElementById("article-position");
    const caption = document.getElementById("article-caption");
    const byline = document.getElementById("article-byline");
    const meta = document.getElementById("article-meta");
    const actions = document.getElementById("article-actions");
    const textEl = document.getElementById("article-text");
    const descBox = document.getElementById("article-desc-box");
    const strip = document.getElementById("article-strip");
    const crumbs = document.getElementById("article-crumbs");
    const status = document.getElementById("article-status");

    const URL_ = "/.netlify/functions/articles";
    const esc = GuideText.esc;
    const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    let articles = [];          // published, newest first
    let loaded = false;
    let failed = false;
    let loading = null;
    let asking = 0;
    const listeners = [];

    let view = { id: null };    // null: the list
    let ownsEntry = false;
    let pendingBack = false;
    let pendingPush = null;
    let basePath = "/home";
    let triggerEl = null;
    let retriedFor = null;
    let listPlace = null;       // { scroll, card }: the list as it was left for an article
    let pics = [];              // the reader's pictures: [{ image, caption }]
    let picAt = 0;

    // ------------------------------------------------------------ loading

    // Two tries, 10s then 15s, as js/guides.js (see LOAD_ATTEMPTS there).
    const LOAD_ATTEMPTS = [10000, 15000];
    function fetchList(url) {
        const attempt = i => {
            const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), LOAD_ATTEMPTS[i]) : null;
            return fetch(url, { headers: { Accept: "application/json" }, signal: controller ? controller.signal : undefined })
                .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
                .then(list => { clearTimeout(timer); return list; }, e => {
                    clearTimeout(timer);
                    if (i + 1 < LOAD_ATTEMPTS.length) return attempt(i + 1);
                    throw e;
                });
        };
        return attempt(0);
    }

    // Only the newest ask changes what the window knows (see js/guides.js).
    let loadSeq = 0;
    function load(fresh) {
        if (loading && !fresh) return loading;
        failed = false;
        asking++;
        const seq = ++loadSeq;
        loading = fetchList(URL_ + (fresh ? `?fresh=${Date.now()}` : ""))
            .then(list => {
                if (seq !== loadSeq && loaded) return;
                articles = Array.isArray(list) ? list.filter(a => a && a.id && a.status === "published") : [];
                loaded = true;
                listeners.forEach(fn => { try { fn(); } catch (e) { /* one listener is not the others' problem */ } });
            })
            .catch(() => { if (seq === loadSeq) { failed = true; loading = null; } })
            .then(() => { asking--; if (isOpen()) draw(); });
        return loading;
    }

    const isOpen = () => overlay.classList.contains("open");
    const byKey = key => (key ? articles.find(a => window.RecordAddress.matches(a, key)) || servedArticle(key) : null) || null;

    /* The article the share function served this page for, at the address
       it was served at (its <meta name="mazerats:record">): the list is
       edge-cached, so one renamed a moment ago is still listed under its old
       address. As servedGuide in js/guides.js. */
    function servedArticle(key) {
        const tag = document.querySelector('meta[name="mazerats:record"]');
        const m = tag && /^article:(.+)$/.exec(tag.getAttribute("content") || "");
        const here = window.RecordAddress.parse(location.pathname);
        if (!m || !here || here.kind !== "article" || here.key !== key) return null;
        return articles.find(a => a.id === m[1]) || null;
    }

    // ------------------------------------------------------------ helpers

    function longDate(iso) {
        const d = new Date(iso);
        return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    }
    /* Two dates (3 Nov 2026, the owner's), the second on the meta line.
       UPDATED: the day the reader's part last changed after it went public
       (editedAt, set by netlify/functions/articles.js), shown only when it
       is a later day than the one it went public; at the text's foot. EVENT: the event's own
       days, in UTC as the event window gives them, the year said once. */
    const shortDay = (d, year, zone) => d.toLocaleDateString("en-GB", Object.assign({ day: "numeric", month: "short" }, year ? { year: "numeric" } : {}, zone ? { timeZone: zone } : {}));
    function editedDay(a) {
        const e = new Date(a.editedAt), p = new Date(a.publishedAt);
        if (isNaN(e) || isNaN(p) || e.toDateString() === p.toDateString() || e < p) return "";
        return shortDay(e, true);
    }
    function eventDays(ev) {
        const s = new Date(ev.date), e = new Date(ev.endDate);
        if (isNaN(s)) return "";
        const key = d => d.toISOString().slice(0, 10);
        if (isNaN(e) || key(e) <= key(s)) return shortDay(s, true, "UTC");
        const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
        return `${shortDay(s, !sameYear, "UTC")} – ${shortDay(e, true, "UTC")}`;
    }
    const bylineOf = a =>[longDate(a.publishedAt), a.author ? `by ${a.author}` : ""].filter(Boolean).join(" · ");
    // Its pictures: the gallery, or else the thumbnail on its own.
    function picturesOf(a) {
        const g = (Array.isArray(a.gallery) ? a.gallery : []).filter(p => p && typeof p.image === "string" && p.image);
        if (g.length) return g.map(p => ({ image: p.image, caption: typeof p.caption === "string" ? p.caption : "" }));
        return a.thumb ? [{ image: a.thumb, caption: "" }] : [];
    }
    const thumbOf = a => (a && (a.thumb || ((Array.isArray(a.gallery) && a.gallery[0] && a.gallery[0].image) || ""))) || "";
    // The event it is about, from the archive js/home.js has loaded (null until then).
    const eventOf = a => {
        if (!a || !a.eventId || !window.ArchiveRecords || typeof window.ArchiveRecords.find !== "function") return null;
        return window.ArchiveRecords.find("event", a.eventId);
    };
    const say = text => { if (status) status.textContent = text || ""; };

    // ------------------------------------------------------------ drawing

    function listHtml() {
        if (!loaded) {
            return failed
                ? `<p class="guides-note">The articles couldn't be loaded just now. <button type="button" class="guides-textbtn" data-act="retry">Try again</button></p>`
                : `<p class="guides-note">Loading the articles…</p>`;
        }
        if (!articles.length) return `<p class="guides-note">There are no articles yet. Check back soon.</p>`;
        return `
            <p class="guides-intro">News from the archive: event winners and announcements, newest first.</p>
            <ul class="guides-cards art-cards">
                ${articles.map(a => {
                    const t = thumbOf(a);
                    return `
                    <li>
                        <a class="guides-card${t ? "" : " no-thumb"}" href="${esc(addressFor(a.id))}" data-article="${esc(a.id)}">
                            ${t ? `<span class="guide-thumb guides-card-thumb"><img src="${esc(imgCdn(t, 300, null, 80))}" alt="" loading="lazy" decoding="async"></span>` : ""}
                            <span class="guides-card-text">
                                <span class="guides-card-title">${esc(a.title)}</span>
                                ${a.summary ? `<span class="guides-card-summary">${esc(GuideText.plain(a.summary))}</span>` : ""}
                                <span class="guides-card-meta">${esc(bylineOf(a))}</span>
                            </span>
                        </a>
                    </li>`;
                }).join("")}
            </ul>`;
    }

    /* The picture at the top, as the maze window's: the gallery's own
       arrows, its place ("2 OF 5") at the top right and its caption across
       the foot of the picture, and a strip of every picture under the text. */
    function showPic(i) {
        if (!pics.length) return;
        hideDraw();
        picAt = (i + pics.length) % pics.length;
        const p = pics[picAt];
        const a = byKey(view.id);
        img.src = imgCdn(p.image, 1200, null, 85);
        img.alt = p.caption || (a ? `A picture from ${a.title}` : "A picture from this article");
        img.style.display = "block";
        const many = pics.length > 1;
        position.textContent = many ? `${picAt + 1} of ${pics.length}` : "";
        position.style.display = many ? "" : "none";
        caption.textContent = p.caption;
        caption.style.display = p.caption ? "" : "none";
        prevBtn.style.display = nextBtn.style.display = many ? "" : "none";
        strip.querySelectorAll("img").forEach((t, n) => {
            t.classList.toggle("active", n === picAt);
            if (n === picAt) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current");
        });
    }

    /* THE DRAW AT THE TOP (3 Nov 2026, the owner's): "having the wheel in
       the article, the wheel displays at the top where images usually
       are." The article's first {{wheel}} block is taken out of the text
       and drawn in the picture's place instead (#article-top), and the
       thumbnail isn't shown there. A gallery still has its strip under the
       text, led by a tile for the draw: a picture pressed there takes the
       top, the tile brings the draw back. The draw is built afresh each
       time it is shown, so one being left mid-spin stops (and goes quiet)
       as soon as it leaves the page; see the isConnected checks in
       js/article-wheel.js. */
    let drawHtml = "";
    let drawCtx = null;
    function showDraw() {
        if (!drawHtml) return;
        frame.hidden = true;
        topEl.innerHTML = drawHtml;
        topEl.hidden = false;
        if (window.ArticleEmbeds) window.ArticleEmbeds.hydrate(topEl, drawCtx);
        strip.querySelectorAll("img").forEach(t => { t.classList.remove("active"); t.removeAttribute("aria-current"); });
        const tile = strip.querySelector("[data-pic='draw']");
        if (tile) { tile.classList.add("active"); tile.setAttribute("aria-current", "true"); }
    }
    function hideDraw() {
        if (topEl) { topEl.replaceChildren(); topEl.hidden = true; }
        frame.hidden = !pics.length;
        const tile = strip.querySelector("[data-pic='draw']");
        if (tile) { tile.classList.remove("active"); tile.removeAttribute("aria-current"); }
    }

    /* THE WRITER (3 Nov 2026, the owner's): the author's Habbo figure in the
       maze window's builder place, with "Article written by <name>" beside
       it in the builder name's face, and no online status or motto. The
       figure is the maze window's own lookup (Api.getHabboProfile); until
       it answers, or where it can't (a name not on Origins), the line
       stands alone. */
    const profiles = new Map();     // name -> Promise of a profile or null
    let writerToken = 0;
    function drawWriter(a) {
        const token = ++writerToken;
        const name = String(a.author || "").trim();
        byline.innerHTML = name
            ? `<div class="builder-card art-writer"><div class="builder-text"><p class="builder-name">Article written by ${esc(name)}</p></div></div>`
            : "";
        if (!name || typeof Api === "undefined" || typeof Api.getHabboProfile !== "function") return;
        if (!profiles.has(name)) profiles.set(name, Api.getHabboProfile(name).catch(() => null));
        profiles.get(name).then(p => {
            if (token !== writerToken || !p || !p.avatar) return;
            const card = byline.querySelector(".art-writer");
            if (!card) return;
            const img = document.createElement("img");
            img.className = "builder-avatar";
            img.src = p.avatar;
            img.alt = "";
            img.addEventListener("error", () => img.remove());
            card.prepend(img);
        });
    }

    function drawReader(a) {
        titleEl.textContent = a.title || "Article";
        /* The pictures in the text as uploaded, as a guide's are (js/guides.js):
           they are mostly pixel-art screenshots, shown at their own size. */
        textEl.innerHTML = ArticleText.render(a.body, { level: 3, pictureAlt: `A picture from ${a.title}` }) ||
            `<p>${esc(GuideText.plain(a.summary || ""))}</p>`;
        const wheel = topEl ? textEl.querySelector("figure.art-embed[data-embed='wheel']") : null;
        drawHtml = wheel ? wheel.outerHTML : "";
        drawCtx = { article: a, embedData: a.embedData };
        if (wheel) wheel.remove();
        // With the draw at the top, only a gallery's pictures, never the thumbnail.
        pics = drawHtml ? picturesOf({ gallery: a.gallery }) : picturesOf(a);
        picAt = 0;
        const stripped = pics.length > 1 || (!!drawHtml && pics.length > 0);
        reader.classList.toggle("has-gallery", stripped);
        hideDraw();
        if (!pics.length) { img.src = BLANK; img.style.display = "none"; }
        strip.innerHTML = stripped
            ? (drawHtml ? `<span class="art-strip-draw" tabindex="0" role="button" data-pic="draw" aria-label="The prize draw" title="The prize draw"></span>` : "") +
              pics.map((p, n) => `<img src="${esc(imgCdn(p.image, 104, 104, 70))}" alt="${esc(p.caption || `Picture ${n + 1}`)}" tabindex="0" role="button" data-pic="${n}" loading="lazy" decoding="async">`).join("")
            : "";
        strip.style.display = stripped ? "" : "none";
        if (drawHtml) showDraw();
        else if (pics.length) showPic(0);
        drawWriter(a);
        /* The meta row, as the room window's status line: what it is, the day
           it went public, and how long it takes to read (the words, at about
           200 a minute). */
        const words = ArticleText.plain(a.body || "").split(/\s+/).filter(Boolean).length;
        const pub = new Date(a.publishedAt);
        const day = isNaN(pub) ? "" : shortDay(pub, true);
        const ev = eventOf(a);
        const evDays = ev ? eventDays(ev) : "";
        meta.innerHTML = `<span class="status-badge art-badge">Article</span>${day ? `<span>Published: ${esc(day)}</span>` : ""}${evDays ? `<span>Event: ${esc(evDays)}</span>` : ""}${words ? `<span>Reading time: ${Math.max(1, Math.round(words / 200))} min</span>` : ""}${pics.length > 1 ? `<span>${pics.length} pictures</span>` : ""}`;
        /* Where a maze's tag chips are, and in their look (3 Nov 2026, the
           owner's): the writer on the left, these on the right. */
        actions.innerHTML = [
            // Its name in the chip's accessible name and tooltip.
            ev ? `<a class="tag tag-filter" href="${esc(window.RecordAddress.of("event", ev))}" data-act="event" title="${esc(ev.title || "")}" aria-label="See the event: ${esc(ev.title || "")}">See the event</a>` : "",
            `<button type="button" class="tag tag-filter art-copy" data-act="copy">Copy link</button>`
        ].join("");
        crumbs.hidden = !listPlace;
        /* Updated, at the very foot of the text in the meta line's small
           text (3 Nov 2026, the owner's: off the meta line). */
        const edited = editedDay(a);
        if (edited) textEl.insertAdjacentHTML("beforeend", `<p class="art-updated">Updated: ${esc(edited)}</p>`);
        if (window.ArticleEmbeds) window.ArticleEmbeds.hydrate(textEl, drawCtx);
        descBox.scrollTop = 0;
        say("");
    }

    function draw(opts) {
        const o = opts || {};
        const hadFocus = win.contains(document.activeElement);
        const a = view.id ? byKey(view.id) : null;
        let note = "";
        if (view.id && loaded && !a) {
            if (retriedFor !== view.id) {
                // Maybe the edge's older list (one published a moment ago): once past it.
                retriedFor = view.id;
                note = `<p class="guides-note">Loading the article…</p>`;
                load(true);
            } else if (asking) {
                note = `<p class="guides-note">Loading the article…</p>`;
            } else if (failed) {
                note = `<p class="guides-note">Couldn't load that article. <button type="button" class="guides-textbtn" data-act="retry-article">Try again</button></p>`;
            } else {
                note = `<p class="guides-note">That article isn't available. <button type="button" class="guides-textbtn" data-act="list">See all articles</button></p>`;
            }
        } else if (view.id && !loaded) {
            note = failed
                ? `<p class="guides-note">Couldn't load that article. <button type="button" class="guides-textbtn" data-act="retry-article">Try again</button></p>`
                : `<p class="guides-note">Loading the article…</p>`;
        }
        const reading = !!a;
        win.classList.toggle("is-reading", reading);
        reader.hidden = !reading;
        listEl.hidden = reading;
        if (reading) drawReader(a);
        else {
            if (topEl) { topEl.replaceChildren(); topEl.hidden = true; }
            titleEl.textContent = view.id ? "Article" : "Articles";
            listEl.innerHTML = note || listHtml();
        }
        if (isOpen()) {
            if (a || !view.id || (loaded && !asking)) setMeta(a);
            if (a && onArticlesPath() && pendingPush === null && location.pathname !== addressFor(a.id)) {
                try { history.replaceState(history.state, "", addressFor(a.id)); } catch (e) { /* fine */ }
            }
        }
        if (o.focus || hadFocus) {
            const card = !a && o.card ? [...listEl.querySelectorAll("[data-article]")].find(x => x.dataset.article === o.card) : null;
            if (card) card.focus({ preventScroll: true });
            else {
                if (!titleEl.hasAttribute("tabindex")) titleEl.setAttribute("tabindex", "-1");
                titleEl.focus({ preventScroll: true });
            }
        }
    }

    let metaHeld = false;
    function setMeta(a) {
        if (!window.PageMeta) return;
        metaHeld = true;
        window.PageMeta.set("articles", a ? `${a.title} | Maze Rats` : "Articles | Maze Rats", "https://mazerats.net" + addressFor(a ? a.id : null));
    }
    function restoreMeta() {
        if (!window.PageMeta) return;
        if (!metaHeld) setMeta(null);
        window.PageMeta.restore("articles");
        metaHeld = false;
    }

    // ------------------------------------------------------------ address

    function addressFor(key) {
        if (!key) return "/articles";
        const a = byKey(key);
        return a ? window.RecordAddress.of("article", a) : `/article/${encodeURIComponent(key)}`;
    }
    function idFromAddress() {
        const p = window.RecordAddress.parse(location.pathname);
        return p && p.kind === "article" ? p.key : null;
    }
    const onArticlesPath = () => /^\/(?:articles|article\/[^/]+)\/?$/.test(location.pathname);

    function setAddress(id) {
        if (pendingPush !== null) { pendingPush = addressFor(id); return; }
        try { history.replaceState(history.state, "", addressFor(id)); } catch (e) { /* sandboxed */ }
    }

    // This document's own marker on the entries it pushes (see js/guides.js).
    const TOKEN = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const isOurEntry = () => !!(history.state && history.state.articles === TOKEN);
    const onDeepEntry = () => isOurEntry() && history.state.step === 2;
    let pendingReplace = null;
    let pendingThen = null;
    function pushArticle(id) {
        try { history.pushState({ articles: TOKEN, step: 2, below: isOurEntry() }, "", addressFor(id)); }
        catch (e) { setAddress(id); }
    }

    // ------------------------------------------------------------ open/close

    function show(id, opts) {
        const o = opts || {};
        view = { id: id || null };
        const place = !view.id && o.toList ? listPlace : null;
        if (!view.id) listPlace = o.keepPlace ? listPlace : null;
        draw(place ? Object.assign({}, o, { card: place.card }) : o);
        listEl.scrollTop = place ? place.scroll : 0;
    }

    function open(id, opts) {
        const o = opts || {};
        if (!isOpen()) {
            if (window.Track && typeof Track.event === "function") Track.event("article-open", id ? String(id) : "list");
            listPlace = null;
            triggerEl = document.activeElement;
            if (!o.fromAddress) {
                if (pendingBack) {
                    pendingPush = addressFor(id);
                    ownsEntry = false;
                } else {
                    basePath = location.pathname + location.search + location.hash;
                    try {
                        history.pushState({ articles: TOKEN }, "", addressFor(id));
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
        load();
        show(id);
        win.focus({ preventScroll: true });
    }

    // As close() in js/guides.js: fromHistory, keepFocus, handOff (+ then).
    function close(opts) {
        const o = opts || {};
        if (!isOpen()) return;
        overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
        restoreMeta();
        listPlace = null;
        // Anything an embed is playing stops with the window (a video, a wheel's spin).
        textEl.querySelectorAll("video, audio").forEach(m => { try { m.pause(); } catch (e) { /* fine */ } });
        // The draw at the top, taken out of the page: a spin stops with it.
        if (topEl && !topEl.hidden) { topEl.replaceChildren(); topEl.hidden = true; }
        let deferred = false;
        if (!o.fromHistory) {
            if (pendingBack) {
                pendingPush = null;
            } else if (onDeepEntry()) {
                const below = !!history.state.below;
                const steps = below && !o.handOff ? 2 : 1;
                if (!below || o.handOff) {
                    try { history.replaceState(null, "", location.pathname + location.search + location.hash); } catch (e) { /* fine */ }
                }
                if (!below) pendingReplace = basePath || "/home";
                if (o.handOff && typeof o.then === "function") { pendingThen = o.then; deferred = true; }
                pendingBack = true;
                history.go(-steps);
            } else if (ownsEntry && o.handOff) {
                // Left for the room window to replace.
            } else if (ownsEntry) {
                pendingBack = true;
                history.back();
            } else {
                try { history.replaceState(null, "", basePath || "/home"); } catch (e) { /* fine */ }
            }
        }
        ownsEntry = false;
        if (!deferred && typeof o.then === "function") o.then();
        const back = triggerEl;
        triggerEl = null;
        if (o.keepFocus || !back || !document.body.contains(back)) return;
        const landing = back.closest && back.closest("#side-menu") ? document.getElementById("side-spine") : back;
        if (landing && typeof landing.focus === "function") landing.focus({ preventScroll: true });
    }

    window.addEventListener("popstate", () => {
        if (pendingBack) {
            pendingBack = false;
            if (pendingReplace !== null) {
                try { history.replaceState(null, "", pendingReplace); } catch (e) { /* fine */ }
                pendingReplace = null;
            }
            const then = pendingThen;
            pendingThen = null;
            if (then) setTimeout(then, 0);
            if (pendingPush !== null && isOpen()) {
                basePath = location.pathname + location.search + location.hash;
                try {
                    history.pushState({ articles: TOKEN }, "", pendingPush);
                    ownsEntry = true;
                } catch (e) { ownsEntry = false; }
            }
            pendingPush = null;
            return;
        }
        if (onArticlesPath()) {
            if (!isOpen()) open(idFromAddress(), { fromAddress: true, owned: isOurEntry() });
            else show(idFromAddress(), { focus: true, toList: true });
        } else if (isOpen()) {
            close({ fromHistory: true });
        }
    });

    // ------------------------------------------------------------ clicks

    // A maze or an event: this window closes and the room window takes its entry (see the header).
    function openRecord(kind, id) {
        close({ handOff: true, keepFocus: true, then: () => {
            if (!(window.ArchiveRecords && window.ArchiveRecords.open(kind, id, { fromGuides: true }))) {
                const to = window.RecordAddress.of(kind, { id });
                if (window.MazeErrors && typeof MazeErrors.leaving === "function") MazeErrors.leaving(to);
                location.href = to;
            }
        } });
    }

    win.addEventListener("click", e => {
        const t = e.target;
        const plain = !(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1);
        const card = t.closest("[data-article]");
        if (card) {
            if (!plain) return;
            e.preventDefault();
            if (!view.id) listPlace = { scroll: listEl.scrollTop, card: card.dataset.article };
            if (!view.id && pendingPush === null && !pendingBack) pushArticle(card.dataset.article);
            else setAddress(card.dataset.article);
            show(card.dataset.article, { focus: true, keepPlace: true });
            return;
        }
        const record = t.closest("[data-guide-maze], [data-guide-event]");
        if (record) {
            if (!plain) return;
            e.preventDefault();
            openRecord(record.dataset.guideMaze ? "maze" : "event", record.dataset.guideMaze || record.dataset.guideEvent);
            return;
        }
        const guide = t.closest("[data-guide-guide]");
        if (guide && window.Guides) {
            if (!plain) return;
            e.preventDefault();
            const id = guide.dataset.guideGuide;
            close({ keepFocus: true });
            window.Guides.open(id);
            return;
        }
        const pic = t.closest("[data-pic]");
        if (pic) { pickPic(pic); return; }
        const act = t.closest("[data-act]");
        if (!act) return;
        const what = act.dataset.act;
        if (what === "event") {
            if (!plain) return;
            e.preventDefault();
            const a = byKey(view.id);
            if (a && a.eventId) openRecord("event", a.eventId);
        } else if (what === "copy") {
            const link = location.origin + addressFor(view.id);
            const done = ok => {
                say(ok ? "Link copied." : link);
                act.textContent = ok ? "Copied" : "Copy link";
                setTimeout(() => { if (act.isConnected) act.textContent = "Copy link"; }, 1600);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => done(true), () => done(false));
            else done(false);
            if (window.Track && typeof Track.event === "function") Track.event("share-copy", "article");
        } else if (what === "list") {
            if (onDeepEntry() && !pendingBack && pendingPush === null) history.back();
            else { setAddress(null); show(null, { focus: true, toList: true }); }
        } else if (what === "retry") { load(); draw({ focus: true }); }
        else if (what === "retry-article") { retriedFor = null; load(true); draw({ focus: true }); }
    });

    // The strip's pictures are buttons: Enter and Space too.
    strip.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const pic = e.target.closest && e.target.closest("[data-pic]");
        if (!pic) return;
        e.preventDefault();
        pickPic(pic);
    });
    // A strip tile: a picture, or the draw's own tile.
    function pickPic(tile) {
        if (tile.dataset.pic === "draw") { if (topEl.hidden) showDraw(); }
        else showPic(Number(tile.dataset.pic));
    }
    prevBtn.addEventListener("click", () => showPic(picAt - 1));
    nextBtn.addEventListener("click", () => showPic(picAt + 1));
    // Left and right page the pictures while the picture area has focus, as the maze window's do.
    frame.addEventListener("keydown", e => {
        if (pics.length < 2) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); showPic(picAt - 1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); showPic(picAt + 1); }
    });
    img.addEventListener("error", () => { img.style.display = "none"; });
    img.addEventListener("load", () => { img.style.display = "block"; });

    if (closeBtn) closeBtn.addEventListener("click", () => close());
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    if (window.EscapeLayers) {
        window.EscapeLayers.register({
            elements: () => isOpen() ? [overlay] : [],
            close: () => close()
        });
    }

    // ------------------------------------------------------------ start

    let freshAsked = false;
    try { freshAsked = new URLSearchParams(location.search).has("fresh"); } catch (e) { /* no fresh copy */ }
    load(freshAsked);
    if (onArticlesPath()) {
        if (freshAsked) {
            try { history.replaceState(history.state, "", addressFor(idFromAddress())); } catch (e) { /* fine */ }
        }
        open(idFromAddress(), { fromAddress: true });
    }

    /* For js/home.js: What's New, the spotlight, the search and the event
       window read the published list from here. */
    window.Articles = {
        open: id => open(id || null),
        close,
        isOpen,
        list: () => articles.slice(),
        loaded: () => loaded,
        byKey,
        // The published articles about an event, newest first.
        forEvent: id => articles.filter(a => a.eventId && a.eventId === id),
        thumbOf,
        onLoad(fn) { if (typeof fn === "function") listeners.push(fn); },
        // Redraws an open reader once the events have arrived (its event button).
        refresh() { if (isOpen() && view.id) draw(); }
    };
})();

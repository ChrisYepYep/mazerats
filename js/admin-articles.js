/* ===========================================================
   Maze Rats: the Articles section of the Warren's What's New panel
   (2 Nov 2026, the owner's)

   "Build a new Articles section into the What's New section with its own
   'New Article' button; when adding a new article, it should carry the
   What's New section fields, plus all inputs for the article itself
   including full formatting controls for text."

   The editor, top to bottom:
     the article     title, its address (/article/<slug>, js/admin-address.js),
                     draft or published, the event it is about, a summary
     its pictures    the thumbnail, and the gallery shown at the top of the
                     window (uploaded, captioned, dragged or moved into order
                     the way the maze editor's are)
     its text        the full formatting bar (the maze form's, with Quote,
                     Picture and any embed's own buttons), and a live preview
     What's New      its entry's date, title, line, label, picture and Hide,
                     each empty for the article's own
     the spotlight   the event form's own fields (window.AdminSpotlight)
   Preview draws the article in the homepage's own window, in a frame with
   the site's stylesheets, so it reads exactly as a visitor will see it.

   Stored by netlify/functions/articles.js; read on the homepage by
   js/articles.js; the text format and the embed contract are
   js/article-text.js's. Pictures go to the "articles/" image folder the
   moment they are picked (js/admin.js's uploader, window.AdminUpload), and
   one is only ever deleted once a save has left it unused, or when the edit
   that uploaded it is cancelled: the guides editor's rules
   (js/admin-guides.js), which this follows closely.

   js/admin-whats-new.js lists the published articles' entries in its log
   through window.AdminArticles, with Edit, Hide/Show and Discord.
   =========================================================== */
(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="whatsnew"]');
    if (!panel || typeof Api === "undefined" || typeof GuideText === "undefined" || typeof ArticleText === "undefined") return;

    const TOKEN_KEY = "mazerats_admin_token";
    const URL_ = "/.netlify/functions/articles";
    const IMAGE_PREFIX = "/.netlify/functions/image?key=";
    const BODY_MAX = 40000;
    const listEl = panel.querySelector("#art-list");
    const formEl = panel.querySelector("#art-form");
    const previewEl = panel.querySelector("#art-preview");
    const addBtn = panel.querySelector("#art-add");
    if (!listEl || !formEl || !previewEl || !addBtn) return;

    const esc = GuideText.esc;
    const token = () => {
        if (typeof window.AdminToken === "function") return window.AdminToken() || "";
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    };
    const call = (url, method, body) => Api._write(url, method, token(), body);
    const ask = (html, opts) => (typeof window.AdminConfirm === "function" ? window.AdminConfirm(html, opts) : Promise.resolve(false));
    const tell = text => (typeof window.AdminAlert === "function" ? window.AdminAlert(esc(text)) : Promise.resolve());
    function sessionGone(err) {
        if (!err || err.status !== 401) return false;
        if (typeof window.AdminLockOut === "function") window.AdminLockOut();
        return true;
    }

    let mounted = false;
    let articles = [];
    let retiredAddresses = [];
    let events = [];
    let editing = null;         // the article in the form
    let stored = null;          // as last saved (null for a new one)
    let snapshot = "";
    const uploaded = new Set(); // keys uploaded during this edit
    let session = 0;            // which edit is open (see js/admin-guides.js)
    let uploading = 0;
    let saving = false;
    let address = null;
    let addressState = {};
    let addressSnapshot = "";
    const listeners = [];

    const keyOf = src => (typeof src === "string" && src.startsWith(IMAGE_PREFIX + "articles/")) ? src.slice(IMAGE_PREFIX.length) : null;
    // Every uploaded picture an article points at.
    function keysIn(a) {
        if (!a) return new Set();
        return new Set([keyOf(a.thumb), keyOf(a.wn && a.wn.image),
            ...(a.gallery || []).map(g => keyOf(g && g.image)),
            ...ArticleText.pictures(a.body || "").map(p => p.key),
            /* A video block's video and its still (2 Nov 2026), named bare in
               its line; upload.js's DELETE takes a videos/ key too. */
            ...ArticleText.embeds(a.body || "").filter(e => e.type === "video").flatMap(e => [e.attrs.key, e.attrs.poster])
                .filter(k => typeof k === "string" && /^(videos|articles)\//.test(k))].filter(Boolean));
    }
    // Background clean-up, as js/admin-guides.js's: the server keeps one still in use.
    function forget(keys) {
        keys.forEach(k => {
            Api.deleteImage(token(), k).catch(() => { /* kept, or gone: leave it */ });
        });
    }
    function when(iso) {
        const d = new Date(iso);
        return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }
    const notify = () => listeners.forEach(fn => { try { fn(); } catch (e) { /* the log's problem, not this one's */ } });

    // ------------------------------------------------------------ loading

    let loadGen = 0;
    async function load() {
        const gen = ++loadGen;
        listEl.innerHTML = '<p class="admin-empty">Loading the articles…</p>';
        try {
            const [data, evs] = await Promise.all([
                call(`${URL_}?full=1&retired=1`, "GET"),
                loadEvents()
            ]);
            if (gen !== loadGen) return;
            articles = Array.isArray(data) ? data : (Array.isArray(data && data.records) ? data.records : []);
            retiredAddresses = Array.isArray(data && data.retired) ? data.retired : [];
            events = evs;
            renderList();
            notify();
        } catch (err) {
            if (gen !== loadGen) return;
            if (sessionGone(err)) { mounted = false; listEl.innerHTML = '<p class="admin-empty">Sign in again to see the articles.</p>'; return; }
            listEl.innerHTML = `<p class="admin-empty">Could not load the articles: ${esc(err.message)} <button type="button" class="ctl-btn" data-art-retry>Try again</button></p>`;
        }
    }
    // The events, for the "about this event" picker: the copy admin.js read at sign-in, else a read of our own.
    async function loadEvents() {
        let list = null;
        try { if (typeof window.AdminArchiveCopy === "function") { const c = await window.AdminArchiveCopy(); list = c && c.events; } } catch (e) { /* read below */ }
        if (!Array.isArray(list)) list = await Api.getEventsFull(token()).catch(() => []);
        return (Array.isArray(list) ? list : []).filter(e => e && e.id)
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.title || "").localeCompare(String(b.title || "")));
    }
    const eventTitle = id => { const e = events.find(x => x.id === id); return e ? e.title || e.id : id; };

    // ------------------------------------------------------------ the list

    function sorted() {
        const at = a => String(a.publishedAt || a.createdAt || "");
        return articles.slice().sort((a, b) => at(b).localeCompare(at(a)));
    }
    function renderList() {
        const list = sorted();
        if (!list.length) {
            listEl.innerHTML = '<p class="admin-empty">No articles yet. Write the first with + New Article.</p>';
            return;
        }
        listEl.innerHTML = list.map(a => {
            const pub = a.status === "published";
            const bits = [a.author ? `by ${a.author}` : "", pub ? `published ${when(a.publishedAt)}` : `started ${when(a.createdAt)}`,
                `/article/${a.slug || a.id}`, a.eventId ? `about ${eventTitle(a.eventId)}` : "",
                a.spotlight ? "on the spotlight" : "", pub && a.wn && a.wn.hidden ? "hidden from What's New" : ""].filter(Boolean);
            return `
            <div class="chrome-list-row admin-row art-admin-row${pub ? "" : " is-draft"}" data-art="${esc(a.id)}">
                <div class="row-info">
                    <h3><span class="status-badge ${pub ? "status-open" : "status-unknown"}">${pub ? "Published" : "Draft"}</span> ${esc(a.title || "(untitled)")}</h3>
                    <p class="row-creator">${esc(bits.join(" · "))}</p>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="btn admin-edit-btn" data-art-act="edit" aria-label="Edit ${esc(a.title || "the article")}">Edit</button>
                    ${pub ? `<a class="btn admin-edit-btn" href="${esc(`/article/${encodeURIComponent(a.slug || a.id)}?fresh=1`)}" target="_blank" rel="noopener" aria-label="View ${esc(a.title || "the article")} on the site (opens a new tab)">View</a>` : ""}
                    <button type="button" class="btn admin-delete-btn" data-art-act="delete" aria-label="Delete ${esc(a.title || "the article")}">Delete</button>
                </div>
            </div>`;
        }).join("");
    }

    listEl.addEventListener("click", async e => {
        if (e.target.closest("[data-art-retry]")) { load(); return; }
        const btn = e.target.closest("[data-art-act]");
        if (!btn) return;
        const a = articles.find(x => x.id === btn.closest("[data-art]").dataset.art);
        if (!a) return;
        if (btn.dataset.artAct === "edit") openEditor(a);
        else if (btn.dataset.artAct === "delete") removeArticle(a);
    });

    async function removeArticle(a) {
        if (!await ask(`Delete the article "${esc(a.title)}"? It comes off the site and What's New at once, its address stays reserved so old links say it's gone, and its uploaded pictures are deleted. This can't be undone.`, { danger: true })) return;
        try {
            await call(`${URL_}?id=${encodeURIComponent(a.id)}`, "DELETE");
            const doomed = keysIn(a);
            if (editing && stored && stored.id === a.id) {
                uploaded.forEach(k => doomed.add(k));
                closeEditor(true);
            }
            forget([...doomed]);
            await load();
        } catch (err) {
            if (!sessionGone(err)) await tell(err.message || "That couldn't be deleted.");
        }
    }

    // ------------------------------------------------------------ the editor

    function copyOf(a) {
        const wn = a && a.wn && typeof a.wn === "object" ? a.wn : {};
        const out = {
            id: a ? a.id : "",
            title: a ? a.title || "" : "",
            summary: a ? a.summary || "" : "",
            status: a ? a.status || "draft" : "draft",
            eventId: a ? a.eventId || "" : "",
            thumb: a ? a.thumb || "" : "",
            gallery: a && Array.isArray(a.gallery) ? a.gallery.map(g => ({ image: g.image || "", caption: g.caption || "" })) : [],
            body: a ? a.body || "" : "",
            justify: !!(a && a.justify === true),
            embedData: a && a.embedData && typeof a.embedData === "object" ? JSON.parse(JSON.stringify(a.embedData)) : {},
            wn: { day: wn.day || "", title: wn.title || "", text: wn.text || "", badge: wn.badge || "", badgeText: wn.badgeText || "", hidden: wn.hidden === true, image: wn.image || "" }
        };
        ["spotlight", "spotlightFrom", "spotlightUntil", "spotlightCaption", "spotlightColour", "spotlightCaptionAt", "spotlightCaptionAtHome"]
            .forEach(k => { out[k] = a && a[k] !== undefined ? a[k] : (k === "spotlight" ? false : ""); });
        return out;
    }
    const addressPayload = () => address ? JSON.stringify(address.payload()) : "";
    function readSpotlight() {
        if (!editing || !window.AdminSpotlight) return;
        Object.assign(editing, window.AdminSpotlight.read(formEl).fields);
    }
    function dirty() {
        if (!editing) return false;
        readSpotlight();
        return JSON.stringify(editing) !== snapshot || addressPayload() !== addressSnapshot;
    }
    function newSession() { session++; uploading = 0; }
    function discardUploads() {
        const keep = keysIn(stored);
        forget([...uploaded].filter(k => !keep.has(k)));
        uploaded.clear();
    }

    async function openEditor(a) {
        if (saving) return;
        if (editing && dirty() && !await ask("You have unsaved changes to this article. Discard them?", { danger: true })) return;
        if (saving) return;
        if (editing) discardUploads();
        newSession();
        stored = a || null;
        editing = copyOf(a);
        addressState = {};
        renderForm();
        readSpotlight();
        snapshot = JSON.stringify(editing);
        addressSnapshot = addressPayload();
        formEl.classList.add("is-open");
        addBtn.style.display = "none";
        previewEl.hidden = true;
        formEl.scrollIntoView({ behavior: "smooth", block: "start" });
        const first = formEl.querySelector('[data-a="title"]');
        if (first) first.focus({ preventScroll: true });
    }

    function closeEditor(skipUploads) {
        if (!skipUploads) discardUploads();
        uploaded.clear();
        newSession();
        editing = null;
        stored = null;
        address = null;
        formEl.classList.remove("is-open");
        formEl.innerHTML = "";
        previewEl.hidden = true;
        previewEl.innerHTML = "";
        addBtn.style.display = "";
    }

    function picHtml(which, src, emptyWords) {
        return `
            <div class="guides-pic art-pic" data-pic="${which}">
                ${src ? `<img src="${esc(src)}" alt="">` : `<span class="guides-pic-empty">${esc(emptyWords || "No picture: drop one here")}</span>`}
                <div class="guides-pic-actions">
                    <label class="admin-action-pill guides-pic-upload">${src ? "Replace" : "Upload picture"}
                        <input type="file" class="admin-gallery-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp" data-upload="${which}">
                    </label>
                    ${src ? `<button type="button" class="admin-action-pill admin-pill-danger" data-unpic="${which}">Remove</button>` : ""}
                    <span class="guides-pic-status" data-pic-status="${which}" role="status"></span>
                </div>
            </div>`;
    }

    /* The formatting bar: the maze form's buttons (FORMAT_BUTTONS in
       js/admin.js), with the article's Quote and Picture, and a button for
       each registered embed that has one (THE EMBED CONTRACT). */
    const BUTTONS = {
        bold: ["<strong>B</strong>", "Bold (Ctrl+B)"],
        italic: ["<em>I</em>", "Italic (Ctrl+I)"],
        underline: ["<u>U</u>", "Underline (Ctrl+U)"],
        strike: ["<s>S</s>", "Strikethrough"],
        heading: ["Heading", "Heading: bold and lighter, on a line of its own"],
        subheading: ["Subheading", "Subheading: a smaller heading, on a line of its own"],
        quote: ["Tip", "Tip: sets the line apart in a box"],
        blockquote: ["Quote", "Quote: somebody's words, set in italics with a rule beside them"],
        divider: ["Divider", "Divider: a line across, under the current line"],
        link: ["Link", "Link (Ctrl+K): https:// addresses, maze:, event:, guide: or article: followed by an id, or console:entry for the Event Submission form"],
        bullets: ["Bullets", "Bulleted list"],
        numbers: ["Numbers", "Numbered list"],
        picture: ["Picture", "Picture: upload one and put it here, at the caret, with a caption under it"],
        alignleft: ["Align left", "Align left: the picture the caret is on to the left, the text beside it (again for the full width)"],
        alignright: ["Align right", "Align right: the picture the caret is on to the right, the text beside it (again for the full width)"],
        justify: ["Justify", "Justify: the whole article's text with both edges straight (press again to turn it off)"],
        clear: ["Clear", "Clear formatting from the selection, or from the current line"]
    };
    const BAR = ["bold", "italic", "underline", "strike", "|", "heading", "subheading", "quote", "blockquote", "divider",
        "|", "link", "bullets", "numbers", "|", "picture", "alignleft", "alignright", "|", "justify"];
    const FORMAT_HELP = `Text format: a blank line starts a new paragraph · **bold** · *italic* · __underline__ · ~~crossed out~~ · "## " a heading and "### " a subheading (own line) · "---" a divider · "- " a bullet · "1. " a numbered list · "> " a tip box · ">> " a quote · [words](https://...) links out · [words](maze:id), (event:id), (guide:id) or (article:id) link inside the site · a picture is a line of its own, ![its caption](its address), which the Picture button (or dropping a picture file on the text) writes for you; {left} or {right} at its end (the Align buttons) sets it to that side with the text beside it.`;

    function barHtml() {
        const embeds = window.ArticleEmbeds ? window.ArticleEmbeds.buttons() : [];
        const kinds = BAR.concat(embeds.length ? ["|"] : [], embeds.map(b => "embed:" + b.type), ["|", "clear"]);
        const first = kinds.findIndex(k => k !== "|");
        return kinds.map((k, i) => {
            if (k === "|") return `<span class="admin-fmt-gap" aria-hidden="true"></span>`;
            let face, title;
            if (k.startsWith("embed:")) {
                const b = embeds.find(x => "embed:" + x.type === k).button;
                face = esc(b.label || k.slice(6));
                title = esc(b.title || b.label || k.slice(6));
            } else { [face, title] = BUTTONS[k]; }
            // Justify is a switch for the whole article, so it says whether it is on.
            const on = k === "justify" ? ` aria-pressed="${editing && editing.justify ? "true" : "false"}"` : "";
            return `<button type="button" class="admin-pill-btn admin-fmt-btn" data-fmt="${esc(k)}"${on} tabindex="${i === first ? 0 : -1}" title="${title}" aria-label="${title}">${face}</button>`;
        }).join("");
    }

    function galleryHtml() {
        const g = editing.gallery;
        const rows = g.map((p, i) => `
            <div class="admin-gallery-row art-gallery-row" data-g-row="${i}">
                <div class="admin-gallery-row-top">
                    <span class="admin-gallery-drag-handle" draggable="true" title="Drag to reorder" aria-hidden="true">&#9776;</span>
                    <span class="admin-gallery-thumb admin-gallery-thumb-filled art-gallery-thumb" style="background-image:url('${esc(imgCdn(p.image, 128, 96, 60))}')" role="img" aria-label="Picture ${i + 1}"></span>
                    <input type="text" class="admin-gallery-label" data-g-caption="${i}" maxlength="200" value="${esc(p.caption)}" placeholder="Caption (optional)" aria-label="Caption for picture ${i + 1}">
                </div>
                <div class="admin-gallery-actions-secondary">
                    <button type="button" class="admin-pill-btn" data-g-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Move picture ${i + 1} up">&#9650; Up</button>
                    <button type="button" class="admin-pill-btn" data-g-move="1" ${i === g.length - 1 ? "disabled" : ""} aria-label="Move picture ${i + 1} down">&#9660; Down</button>
                    <button type="button" class="admin-pill-btn admin-pill-danger" data-g-remove aria-label="Remove picture ${i + 1}">Remove</button>
                </div>
            </div>`).join("");
        return `
            <div class="admin-gallery-list art-gallery-list">${rows || `<p class="admin-empty">No pictures yet: drop them here or use Add pictures. The thumbnail shows at the top until there are some.</p>`}</div>
            <div class="art-gallery-add">
                <label class="admin-action-pill guides-pic-upload">Add pictures
                    <input type="file" class="admin-gallery-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple data-upload="gallery">
                </label>
                <span class="guides-pic-status" data-pic-status="gallery" role="status"></span>
            </div>`;
    }

    function eventOptions(sel) {
        const known = events.some(e => e.id === sel);
        return `<option value="">None</option>
            ${sel && !known ? `<option value="${esc(sel)}" selected>${esc(sel)} (not in the archive any more)</option>` : ""}
            ${events.map(e => `<option value="${esc(e.id)}"${e.id === sel ? " selected" : ""}>${esc(e.title || e.id)}${e.date ? ` (${esc(when(e.date))})` : ""}</option>`).join("")}`;
    }

    const LABELS = [["", "Automatic (Article)"], ["added", "Added"], ["updated", "Updated"], ["news", "News"], ["note", "Note"], ["custom", "Your own words…"]];

    function renderForm() {
        const a = editing;
        const wn = a.wn;
        formEl.innerHTML = `
            <h3 class="admin-form-title">${stored ? `Edit "${esc(stored.title)}"` : "New Article"}</h3>
            <label class="admin-field art-wide"><span>Title</span>
                <input type="text" maxlength="120" data-a="title" value="${esc(a.title)}" required></label>
            ${window.AddressField ? window.AddressField.html("article", stored ? stored.slug || "" : "") : ""}
            <label class="admin-field"><span>Status</span>
                <select data-a="status">
                    <option value="draft"${a.status === "draft" ? " selected" : ""}>Draft (only seen here)</option>
                    <option value="published"${a.status === "published" ? " selected" : ""}>Published (on the site)</option>
                </select></label>
            <label class="admin-field"><span>About this event (its window links here)</span>
                <select data-a="eventId">${eventOptions(a.eventId)}</select></label>
            <label class="admin-field art-wide"><span>Summary (on cards, link previews and What's New's line; not shown in the article)</span>
                <textarea rows="2" maxlength="300" data-a="summary">${esc(a.summary)}</textarea></label>

            <h4 class="admin-subheading art-wide">Pictures</h4>
            <div class="admin-field"><span>Thumbnail (What's New, the spotlight, the list, link previews)</span>${picHtml("thumb", a.thumb)}</div>
            <div class="admin-field art-wide"><span>Gallery (at the top of the article, like a maze's; drag or move into order)</span>${galleryHtml()}</div>

            <h4 class="admin-subheading art-wide">The article</h4>
            <div class="admin-field admin-fmt-field art-wide art-body-field">
                <span id="art-body-label">Text</span>
                <div class="admin-fmt-bar" role="toolbar" aria-label="Formatting for the article's text">${barHtml()}</div>
                <input type="file" class="art-body-file" accept="image/png,image/jpeg,image/gif,image/webp" tabindex="-1" aria-hidden="true" hidden>
                <textarea data-a="body" rows="18" maxlength="${BODY_MAX}" aria-labelledby="art-body-label" spellcheck="true">${esc(a.body)}</textarea>
                <p class="admin-hint"><span data-body-count></span> <span class="guides-pic-status" data-pic-status="body" role="status"></span></p>
                <p class="admin-hint">${esc(FORMAT_HELP)}</p>
                <div class="admin-fmt-preview-wrap art-live" hidden>
                    <span class="admin-fmt-preview-label">How it reads</span>
                    <div class="admin-fmt-preview room-desc-full art-text" data-live></div>
                </div>
            </div>

            <h4 class="admin-subheading art-wide">On What's New</h4>
            <p class="admin-hint art-wide">Once it is published the article has its own entry, which opens it. Leave a box empty for the article's own: the day it is published, its title, its summary, its thumbnail.</p>
            <label class="admin-field"><span>Date it's filed under</span>
                <input type="date" data-wn="day" value="${esc(wn.day)}"></label>
            <label class="admin-field"><span>Label</span>
                <select data-wn="badge">${LABELS.map(([v, t]) => `<option value="${v}"${wn.badge === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
            ${wn.badge === "custom" ? `<label class="admin-field"><span>Label says (14 characters at most)</span>
                <input type="text" maxlength="14" data-wn="badgeText" value="${esc(wn.badgeText)}" placeholder="e.g. Winner" required></label>` : ""}
            <label class="admin-field art-wide"><span>Title on What's New</span>
                <input type="text" maxlength="120" data-wn="title" value="${esc(wn.title)}" placeholder="${esc(a.title || "The article's title")}"></label>
            <label class="admin-field art-wide"><span>Line under it</span>
                <textarea rows="2" maxlength="600" data-wn="text" placeholder="${esc(GuideText.plain(a.summary) || "The article's summary")}">${esc(wn.text)}</textarea></label>
            <div class="admin-field"><span>Its picture there</span>${picHtml("wn", wn.image, "The thumbnail")}</div>
            <label class="admin-check art-wide"><input type="checkbox" data-wn="hidden"${wn.hidden ? " checked" : ""}> Hidden from What's New (the article itself stays up)</label>

            ${window.AdminSpotlight ? window.AdminSpotlight.html(a, "article") : ""}

            <p class="admin-form-error art-wide" role="alert" style="display:none;"></p>
            <div class="admin-form-actions art-wide">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill" data-preview>Preview</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>`;
        if (window.AdminSpotlight) window.AdminSpotlight.wire(formEl);
        address = window.AddressField ? window.AddressField.wire(formEl, {
            titleInput: formEl.querySelector('[data-a="title"]'),
            current: stored ? stored.slug || "" : "",
            manual: stored ? stored.slugManual : undefined,
            prefix: "article",
            state: addressState,
            taken: slug => {
                const other = articles.find(x => (!stored || x.id !== stored.id)
                    && (x.slug === slug || x.id === slug || (Array.isArray(x.slugAliases) && x.slugAliases.includes(slug))));
                return other ? other.title || other.id : "";
            },
            retired: slug => window.AddressField.retiredCheck(retiredAddresses)(slug)
        }) : null;
        wireBar();
        wireGallery();
        refreshLive();
    }

    function showError(msg) {
        const el = formEl.querySelector(".admin-form-error");
        if (!el) return;
        el.textContent = msg || "";
        el.style.display = msg ? "block" : "none";
        if (msg) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // ------------------------------------------------------------ the text

    const bodyBox = () => formEl.querySelector('[data-a="body"]');
    let liveTimer = null;
    function refreshLive() {
        const ta = bodyBox();
        const wrap = formEl.querySelector(".art-live");
        const live = formEl.querySelector("[data-live]");
        const count = formEl.querySelector("[data-body-count]");
        if (!ta || !wrap || !live) return;
        if (count) {
            count.textContent = `${ta.value.length.toLocaleString("en-GB")} of ${BODY_MAX.toLocaleString("en-GB")} characters.`;
            count.classList.toggle("is-over", ta.value.length > BODY_MAX);
        }
        wrap.hidden = !ta.value.trim();
        live.innerHTML = wrap.hidden ? "" : ArticleText.render(ta.value, { level: 4, pictureAlt: "A picture in this article" });
        if (window.ArticleEmbeds) window.ArticleEmbeds.hydrate(live, { article: editing, embedData: editing && editing.embedData, preview: true });
        live.classList.toggle("is-justified", !!(editing && editing.justify));
        ArticleText.fitPictures(live);
    }

    /* A change to the text from a button, as js/admin.js's applyFormat
       makes it: only the stretch that changed, through insertText where the
       browser has it, so Ctrl+Z takes it back as it takes back typing. */
    function putText(ta, next, start, end) {
        const before = ta.value;
        ta.focus();
        if (next !== before) {
            let a = 0;
            while (a < before.length && a < next.length && before[a] === next[a]) a++;
            let b = 0;
            while (b < before.length - a && b < next.length - a && before[before.length - 1 - b] === next[next.length - 1 - b]) b++;
            ta.setSelectionRange(a, before.length - b);
            let done = false;
            try { done = document.execCommand("insertText", false, next.slice(a, next.length - b)); } catch (e) { /* fall through */ }
            if (!done || ta.value !== next) {
                ta.value = next;
                ta.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }
        ta.setSelectionRange(start, end);
    }
    function applyFormat(kind) {
        const ta = bodyBox();
        if (!ta) return;
        const r = ArticleText.format(ta.value, ta.selectionStart, ta.selectionEnd, kind);
        putText(ta, r.text, r.start, r.end);
    }
    // A block's line at the caret, on a line of its own (ArticleText.insertBlock).
    function insertLine(line, select) {
        const ta = bodyBox();
        if (!ta) return;
        const r = ArticleText.insertBlock(ta.value, ta.selectionStart, ta.selectionEnd, line, select);
        putText(ta, r.text, r.start, r.end);
    }

    const IS_MAC = /Mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "");
    function wireBar() {
        const field = formEl.querySelector(".art-body-field");
        const ta = bodyBox();
        if (!field || !ta) return;
        const btns = Array.from(field.querySelectorAll(".admin-fmt-btn"));
        const rove = btn => btns.forEach(b => { b.tabIndex = b === btn ? 0 : -1; });
        btns.forEach((btn, i) => {
            btn.addEventListener("mousedown", e => e.preventDefault());
            btn.addEventListener("click", () => { rove(btn); press(btn.dataset.fmt); });
            btn.addEventListener("focus", () => rove(btn));
            btn.addEventListener("keydown", e => {
                let to = -1;
                if (e.key === "ArrowRight") to = (i + 1) % btns.length;
                else if (e.key === "ArrowLeft") to = (i - 1 + btns.length) % btns.length;
                else if (e.key === "Home") to = 0;
                else if (e.key === "End") to = btns.length - 1;
                if (to < 0) return;
                e.preventDefault();
                rove(btns[to]);
                btns[to].focus();
            });
        });
        ta.addEventListener("keydown", e => {
            const mod = IS_MAC ? e.metaKey : e.ctrlKey;
            if (!mod || e.altKey || e.shiftKey) return;
            if (e.getModifierState && e.getModifierState("AltGraph")) return;
            const key = String(e.key).toLowerCase();
            const letter = /^[a-z]$/.test(key) ? key : (/^Key[A-Z]$/.test(e.code || "") ? e.code.slice(3).toLowerCase() : "");
            const kind = { b: "bold", i: "italic", u: "underline", k: "link" }[letter];
            if (!kind) return;
            e.preventDefault();
            applyFormat(kind);
        });
        ta.addEventListener("input", () => {
            if (editing) editing.body = ta.value;
            clearTimeout(liveTimer);
            liveTimer = setTimeout(refreshLive, 150);
        });
        // The preview's links are for looking at.
        const live = formEl.querySelector("[data-live]");
        if (live) live.addEventListener("click", e => { if (e.target.closest("a")) e.preventDefault(); });
        const file = formEl.querySelector(".art-body-file");
        if (file) file.addEventListener("change", () => {
            const f = file.files && file.files[0];
            file.value = "";
            if (f) uploadInto("body", f);
        });
    }

    function press(kind) {
        if (kind === "picture") {
            const file = formEl.querySelector(".art-body-file");
            if (file) file.click();
            return;
        }
        if (kind.startsWith("embed:")) { runEmbedButton(kind.slice(6)); return; }
        // The whole text justified or not: saved with the article as justify.
        if (kind === "justify") {
            if (!editing) return;
            editing.justify = !editing.justify;
            const b = formEl.querySelector('[data-fmt="justify"]');
            if (b) b.setAttribute("aria-pressed", editing.justify ? "true" : "false");
            refreshLive();
            return;
        }
        // The picture line the caret is on, to a side and back (ArticleText.alignPicture).
        if (kind === "alignleft" || kind === "alignright") {
            const ta = bodyBox();
            const s = formEl.querySelector('[data-pic-status="body"]');
            if (!ta) return;
            const r = ArticleText.alignPicture(ta.value, ta.selectionStart, kind === "alignleft" ? "left" : "right");
            if (!r) { if (s) s.textContent = "Put the caret on a picture's line first, then press Align."; return; }
            putText(ta, r.text, r.start, r.end);
            if (s) s.textContent = r.align ? `Picture set to the ${r.align}, the text beside it.` : "Picture back to the full width.";
            return;
        }
        applyFormat(kind);
    }

    // An embed's own button (THE EMBED CONTRACT in js/article-text.js).
    async function runEmbedButton(type) {
        const def = window.ArticleEmbeds && window.ArticleEmbeds.get(type);
        if (!def || !def.editorButton || !editing) return;
        const ed = editing, mine = session;
        const ctx = {
            article: ed,
            token,
            upload: async (file, folder) => {
                if (typeof window.AdminUpload !== "function") throw new Error("the uploader is not ready - reload the page");
                uploading++;
                try {
                    const r = await window.AdminUpload(ed.id || ed.title || "article", file, folder || "articles");
                    if (mine !== session) { forget([r.key]); throw new Error("That edit has ended."); }
                    uploaded.add(r.key);
                    return r;
                } finally { if (mine === session) uploading--; }
            },
            insert: line => { if (mine === session) insertLine(line); },
            /* An upload the block made itself (a video, sent in pieces to
               upload-video.js; 2 Nov 2026), counted as this edit's like
               upload()'s: deleted if the edit is cancelled or the save
               leaves it unused. */
            track: key => { if (mine === session) uploaded.add(key); else forget([key]); },
            setData: (ref, obj) => { if (mine === session && ed === editing) { editing.embedData[ref] = obj; refreshLive(); } },
            embedLine: ArticleText.embedLine,
            ask, tell
        };
        try { await def.editorButton.insert(ctx); }
        catch (err) { if (!sessionGone(err)) await tell(err.message || "That block couldn't be added."); }
    }

    // ------------------------------------------------------------ pictures

    /* An upload to its slot: "thumb", "wn", "gallery" (added at the end),
       or "body" (put in at the caret). Found again by the edit it began in. */
    async function uploadInto(which, file) {
        if (!editing) return;
        const status = () => formEl.querySelector(`[data-pic-status="${which}"]`);
        if (saving) { const s = status(); if (s) s.textContent = "Saving - pick it again once the save is done."; return; }
        const mine = session;
        const s = status();
        if (s) s.textContent = "Uploading…";
        uploading++;
        try {
            if (typeof window.AdminUpload !== "function") throw new Error("the uploader is not ready - reload the page");
            const r = await window.AdminUpload(editing.id || editing.title || "article", file, "articles");
            if (mine !== session || !editing) { forget([r.key]); return; }
            uploaded.add(r.key);
            if (which === "thumb") editing.thumb = r.url;
            else if (which === "wn") editing.wn.image = r.url;
            else if (which === "gallery") editing.gallery.push({ image: r.url, caption: "" });
            if (which === "body") {
                // The caret goes inside the caption's brackets, to type it straight in.
                insertLine(ArticleText.pictureLine(r.url, ""), [2, 2]);
                const after = status();
                if (after) after.textContent = r.notice || "Picture in. Type its caption between the [ ].";
            } else {
                redraw();
                const after = status();
                if (after) after.textContent = r.notice || "";
            }
        } catch (err) {
            if (mine !== session) return;
            if (sessionGone(err)) return;
            const now = status();
            if (now) now.textContent = `Couldn't upload: ${err.message}`;
        } finally {
            if (mine === session) uploading--;
        }
    }

    // Redrawn with what was typed kept, and the scroll and focus where they were.
    function redraw() {
        readInto();
        const stage = formEl.closest(".wr-stage");
        const top = stage ? stage.scrollTop : 0, y = window.scrollY;
        const a = document.activeElement;
        const focusSel = a && formEl.contains(a) ? ["data-a", "data-wn", "data-g-caption", "data-address-input"].map(k => a.hasAttribute(k) ? `[${k}="${a.getAttribute(k)}"]` : "").find(Boolean) : "";
        const sel = a && typeof a.selectionStart === "number" ? [a.selectionStart, a.selectionEnd] : null;
        renderForm();
        if (stage) stage.scrollTop = top;
        window.scrollTo(0, y);
        if (focusSel) {
            const el = formEl.querySelector(focusSel);
            if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* no caret */ } }
        }
    }

    // What is typed, into `editing` (the boxes keep it as they go; this catches the rest).
    function readInto() {
        if (!editing) return;
        formEl.querySelectorAll("[data-a]").forEach(el => { editing[el.dataset.a] = el.value; });
        formEl.querySelectorAll("[data-wn]").forEach(el => { editing.wn[el.dataset.wn] = el.type === "checkbox" ? el.checked : el.value; });
        formEl.querySelectorAll("[data-g-caption]").forEach(el => { const g = editing.gallery[Number(el.dataset.gCaption)]; if (g) g.caption = el.value; });
        readSpotlight();
    }

    function wireGallery() {
        const list = formEl.querySelector(".art-gallery-list");
        if (!list) return;
        list.querySelectorAll("[data-g-row]").forEach(row => {
            const i = Number(row.dataset.gRow);
            const handle = row.querySelector(".admin-gallery-drag-handle");
            handle.addEventListener("dragstart", e => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("application/x-mazerats-article-pic", String(i));
                row.classList.add("dragging");
            });
            handle.addEventListener("dragend", () => row.classList.remove("dragging"));
            row.addEventListener("dragover", e => {
                if (!e.dataTransfer.types.includes("application/x-mazerats-article-pic")) return;
                e.preventDefault();
                const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                row.classList.toggle("drag-over-top", before);
                row.classList.toggle("drag-over-bottom", !before);
            });
            row.addEventListener("dragleave", () => row.classList.remove("drag-over-top", "drag-over-bottom"));
            row.addEventListener("drop", e => {
                if (!e.dataTransfer.types.includes("application/x-mazerats-article-pic")) return;
                e.preventDefault();
                row.classList.remove("drag-over-top", "drag-over-bottom");
                const from = Number(e.dataTransfer.getData("application/x-mazerats-article-pic"));
                const g = editing.gallery;
                if (!Number.isInteger(from) || from < 0 || from >= g.length || from === i) return;
                readInto();
                const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                let to = before ? i : i + 1;
                if (from < to) to--;
                const [moved] = g.splice(from, 1);
                g.splice(to, 0, moved);
                redraw();
            });
        });
    }

    // ------------------------------------------------------------ the form's events

    formEl.addEventListener("keydown", e => {
        if (e.key !== "Enter" || e.isComposing) return;
        const t = e.target;
        if (!t || t.tagName !== "INPUT") return;
        if (/^(submit|button|reset|image|file|checkbox)$/i.test(t.type)) return;
        e.preventDefault();
    });
    formEl.addEventListener("input", e => {
        if (!editing) return;
        const t = e.target;
        if (t.dataset.a && t.dataset.a !== "body") editing[t.dataset.a] = t.value;
        if (t.dataset.wn && t.type !== "checkbox") editing.wn[t.dataset.wn] = t.value;
        if (t.dataset.gCaption !== undefined) { const g = editing.gallery[Number(t.dataset.gCaption)]; if (g) g.caption = t.value; }
        // The What's New boxes' grey words follow the article's own.
        if (t.dataset.a === "title") { const w = formEl.querySelector('[data-wn="title"]'); if (w) w.placeholder = t.value || "The article's title"; }
        if (t.dataset.a === "summary") { const w = formEl.querySelector('[data-wn="text"]'); if (w) w.placeholder = GuideText.plain(t.value) || "The article's summary"; }
    });
    formEl.addEventListener("change", e => {
        if (!editing) return;
        const t = e.target;
        if (t.dataset.a === "status" || t.dataset.a === "eventId") editing[t.dataset.a] = t.value;
        if (t.dataset.wn === "hidden") editing.wn.hidden = t.checked;
        if (t.dataset.wn === "badge") {
            editing.wn.badge = t.value;
            redraw();
            if (t.value === "custom") { const box = formEl.querySelector('[data-wn="badgeText"]'); if (box) box.focus(); }
        }
        if (t.dataset.upload && t.files && t.files.length) {
            const files = Array.from(t.files);
            const which = t.dataset.upload;
            t.value = "";
            // A batch into the gallery, one after another, in name order as the maze editor does.
            if (which === "gallery") {
                files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
                    .reduce((p, f) => p.then(() => uploadInto("gallery", f)), Promise.resolve());
            } else uploadInto(which, files[0]);
        }
    });

    /* DROPPING PICTURES IN (3 Nov 2026, the owner's): picture files dragged
       from the computer onto the thumbnail, the What's New picture, the
       gallery or the text go up as the Upload buttons' would. Into the
       text each goes in at the caret, as the Picture button's does. While
       files are dragged over the form every place that takes them is
       outlined, the one under the pointer lit; a drop anywhere else in the
       form is caught rather than opening the picture in the tab. The
       gallery's own reordering drags carry no files and pass by. */
    const PIC_TYPES = /^image\/(png|jpeg|gif|webp)$/;
    const hasFiles = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files"));
    function dropSpot(t) {
        if (!t || !t.closest) return null;
        const pic = t.closest(".art-pic[data-pic]");
        if (pic) return { el: pic, which: pic.dataset.pic };
        const gal = t.closest(".art-gallery-list, .art-gallery-add");
        if (gal) return { el: formEl.querySelector(".art-gallery-list") || gal, which: "gallery" };
        const body = t.closest("textarea[data-a='body']");
        if (body) return { el: body, which: "body" };
        return null;
    }
    let dragDepth = 0;
    const clearDrag = () => {
        dragDepth = 0;
        formEl.classList.remove("is-dragging-files");
        formEl.querySelectorAll(".is-drop-target").forEach(x => x.classList.remove("is-drop-target"));
    };
    formEl.addEventListener("dragenter", e => {
        if (!editing || !hasFiles(e)) return;
        dragDepth++;
        formEl.classList.add("is-dragging-files");
    });
    formEl.addEventListener("dragleave", e => {
        if (!hasFiles(e)) return;
        if (--dragDepth <= 0) clearDrag();
    });
    formEl.addEventListener("dragover", e => {
        if (!editing || !hasFiles(e)) return;
        e.preventDefault();
        const spot = dropSpot(e.target);
        e.dataTransfer.dropEffect = spot ? "copy" : "none";
        formEl.querySelectorAll(".is-drop-target").forEach(x => { if (!spot || x !== spot.el) x.classList.remove("is-drop-target"); });
        if (spot) spot.el.classList.add("is-drop-target");
    });
    formEl.addEventListener("drop", e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        const spot = editing ? dropSpot(e.target) : null;
        clearDrag();
        if (!spot) return;
        const all = Array.from(e.dataTransfer.files || []);
        const files = all.filter(f => PIC_TYPES.test(f.type))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
        const status = formEl.querySelector(`[data-pic-status="${spot.which}"]`);
        if (!files.length) { if (status) status.textContent = "Only PNG, JPEG, GIF or WebP pictures can go here."; return; }
        // One picture for the thumbnail and What's New; the gallery and the text take them all, in name order.
        const batch = spot.which === "thumb" || spot.which === "wn" ? files.slice(0, 1) : files;
        if (spot.which === "body") spot.el.focus({ preventScroll: true });
        batch.reduce((p, f) => p.then(() => uploadInto(spot.which, f)), Promise.resolve())
            .then(() => {
                const now = formEl.querySelector(`[data-pic-status="${spot.which}"]`);
                if (now && files.length < all.length) now.textContent += (now.textContent ? " " : "") + `${all.length - files.length} file${all.length - files.length === 1 ? " wasn't a picture" : "s weren't pictures"}, so left out.`;
            });
    });

    formEl.addEventListener("click", async e => {
        if (!editing) return;
        const t = e.target;
        const unpic = t.closest("[data-unpic]");
        if (unpic) {
            if (unpic.dataset.unpic === "thumb") editing.thumb = "";
            else if (unpic.dataset.unpic === "wn") editing.wn.image = "";
            redraw();
            return;
        }
        const move = t.closest("[data-g-move]");
        if (move) {
            const i = Number(move.closest("[data-g-row]").dataset.gRow), j = i + Number(move.dataset.gMove);
            const g = editing.gallery;
            if (j < 0 || j >= g.length) return;
            readInto();
            [g[i], g[j]] = [g[j], g[i]];
            redraw();
            const again = formEl.querySelector(`[data-g-row="${j}"] [data-g-move="${move.dataset.gMove}"]:not([disabled])`) || formEl.querySelector(`[data-g-row="${j}"] [data-g-caption]`);
            if (again) again.focus({ preventScroll: true });
            return;
        }
        if (t.closest("[data-g-remove]")) {
            const i = Number(t.closest("[data-g-row]").dataset.gRow);
            readInto();
            editing.gallery.splice(i, 1);
            redraw();
            return;
        }
        if (t.closest("[data-preview]")) { readInto(); preview(); return; }
        if (t.closest(".admin-cancel-btn")) {
            if (saving) return;
            if (dirty() && !await ask("Discard your changes to this article?", { danger: true })) return;
            if (saving || !editing) return;
            closeEditor();
        }
    });

    formEl.addEventListener("submit", async e => {
        e.preventDefault();
        if (!editing || saving) return;
        readInto();
        const a = editing;
        if (!a.title.trim()) { showError("An article needs a title."); return; }
        if (a.body.length > BODY_MAX) { showError(`The text is ${a.body.length.toLocaleString("en-GB")} characters: keep it under ${BODY_MAX.toLocaleString("en-GB")}.`); return; }
        if (uploading > 0) { showError(`${uploading === 1 ? "A picture is" : `${uploading} pictures are`} still uploading. Save again once it says it's done.`); return; }
        if (a.wn.badge === "custom" && !a.wn.badgeText.trim()) { showError("Type what the What's New label should say, or pick one from the list."); return; }
        const spot = window.AdminSpotlight ? window.AdminSpotlight.read(formEl) : { fields: {} };
        if (spot.error) { showError(spot.error); return; }
        const addressProblem = address && address.problem();
        if (addressProblem) { showError(addressProblem); return; }
        const body = {
            title: a.title.trim(), summary: a.summary, status: a.status, eventId: a.eventId,
            thumb: a.thumb, gallery: a.gallery.filter(g => g.image), body: a.body, justify: a.justify === true, embedData: a.embedData,
            wn: { ...a.wn, badgeText: a.wn.badge === "custom" ? a.wn.badgeText.trim() : "" },
            ...spot.fields
        };
        if (address) Object.assign(body, address.payload());
        const btn = formEl.querySelector('button[type="submit"]');
        btn.disabled = true;
        saving = true;
        showError("");
        try {
            let saved;
            if (stored) {
                body.id = stored.id;
                body._baseRev = Number(stored.rev) || 0;
                saved = await call(URL_, "PUT", body);
            } else {
                saved = await call(URL_, "POST", body);
            }
            const keep = keysIn(saved);
            forget([...new Set([...keysIn(stored), ...uploaded])].filter(k => !keep.has(k)));
            uploaded.clear();
            closeEditor(true);
            await load();
        } catch (err) {
            btn.disabled = false;
            if (sessionGone(err)) return;
            if (err.status === 409) {
                showError("Someone else saved this article since you opened it. Your edits are still here: copy anything you need, then Cancel and Edit it again to see their version.");
                saving = false;
                await load();
                return;
            }
            if (err.status === 404 && stored) {
                showError("This article was deleted after you opened it, so it can't be saved. Your text is still here: copy what you need, then Cancel.");
                saving = false;
                await load();
                return;
            }
            showError(err.message || "Could not save the article.");
        } finally {
            saving = false;
        }
    });

    addBtn.addEventListener("click", () => openEditor(null));

    // ------------------------------------------------------------ preview

    /* The article in the homepage's own window, drawn in a frame that loads
       the site's stylesheets (and the palette, dark mode and skin the Warren
       is wearing), so the workshop's own colours never touch it: what is
       seen here is what a visitor sees. */
    function preview() {
        const a = editing;
        if (!a) return;
        const root = document.documentElement;
        const theme = root.getAttribute("data-theme");
        const v = (sel) => { const l = document.querySelector(sel); return l ? l.getAttribute("href") || "" : ""; };
        /* The first prize draw goes at the top in the picture's place, with no
           thumbnail there, as on the site (THE DRAW AT THE TOP in js/articles.js). */
        const body = document.createElement("div");
        body.innerHTML = ArticleText.render(a.body, { level: 3, pictureAlt: "A picture in this article" });
        const wheel = body.querySelector("figure.art-embed[data-embed='wheel']");
        const topHtml = wheel ? wheel.outerHTML : "";
        if (wheel) wheel.remove();
        const gallery = a.gallery.filter(g => g.image);
        const pics = gallery.length || topHtml ? gallery : (a.thumb ? [{ image: a.thumb, caption: "" }] : []);
        const p0 = topHtml ? null : pics[0];
        const stripped = pics.length > 1 || (!!topHtml && pics.length > 0);
        const ev = events.find(e => e.id === a.eventId);
        const words = ArticleText.plain(a.body).split(/\s+/).filter(Boolean).length;
        const author = stored ? stored.author || "" : (typeof window.AdminUsername === "function" ? window.AdminUsername() : "");
        const day = stored && stored.publishedAt ? new Date(stored.publishedAt) : new Date();
        /* Updated (at the text's foot) and the meta line's Event dates, as js/articles.js gives
           them (editedDay, eventDays there): Updated from the saved copy, so
           it shows once a change after publishing has been saved. */
        const shortDay = (d, year, zone) => d.toLocaleDateString("en-GB", Object.assign({ day: "numeric", month: "short" }, year ? { year: "numeric" } : {}, zone ? { timeZone: zone } : {}));
        const editedAt = stored && stored.editedAt ? new Date(stored.editedAt) : null;
        const edited = editedAt && !isNaN(editedAt) && editedAt > day && editedAt.toDateString() !== day.toDateString() ? shortDay(editedAt, true) : "";
        let evDays = "";
        if (ev && !isNaN(new Date(ev.date))) {
            const s = new Date(ev.date), e = new Date(ev.endDate);
            const key = d => d.toISOString().slice(0, 10);
            evDays = isNaN(e) || key(e) <= key(s) ? shortDay(s, true, "UTC")
                : `${shortDay(s, s.getUTCFullYear() !== e.getUTCFullYear(), "UTC")} – ${shortDay(e, true, "UTC")}`;
        }
        const doc = `<!doctype html><html lang="en"${theme ? ` data-theme="${esc(theme)}"` : ""}${root.hasAttribute("data-dark") ? " data-dark" : ""}${root.hasAttribute("data-light") ? " data-light" : ""}><head>
            <meta charset="utf-8"><base href="${esc(location.origin)}/">
            <link rel="stylesheet" href="${esc(v('link[href*="css/style.css"]'))}">
            ${v("#theme-css") ? `<link rel="stylesheet" href="${esc(v("#theme-css"))}">` : ""}
            ${root.hasAttribute("data-dark") && v("#dark-css") ? `<link rel="stylesheet" href="${esc(v("#dark-css"))}">` : ""}
            ${root.hasAttribute("data-light") && v("#light-css") ? `<link rel="stylesheet" href="${esc(v("#light-css"))}">` : ""}
            <style>html,body{height:auto;min-height:0}body{margin:0;padding:18px 12px}.modal.art-window{max-height:none;animation:none;margin:0 auto}.art-window .room-desc-box{max-height:none !important;overflow:visible !important}.art-window *{flex-shrink:0 !important}</style>
            </head><body class="art-preview-doc">
            <div class="modal art-window is-reading" role="presentation">
                <div class="chrome-titlebar"><h2>${esc(a.title || "Untitled article")}</h2><span class="chrome-close" aria-hidden="true"><img src="assets/img/modal_topclose_x.png" alt=""></span></div>
                <div class="chrome-frame">
                    <div class="modal-thumb modal-thumb-full is-event art-reader${stripped ? " has-gallery" : ""}">
                        <div class="modal-thumb-frame"${p0 ? "" : " hidden"}>
                            ${p0 ? `<div class="gallery-viewport"><img class="modal-gallery-img" src="${esc(p0.image)}" alt="" style="display:block"></div>
                            ${pics.length > 1 ? `<span class="gallery-nav gallery-prev">&#10094;</span><span class="gallery-nav gallery-next">&#10095;</span><span class="gallery-counter gallery-position art-position">1 of ${pics.length}</span>` : ""}
                            ${p0.caption ? `<span class="gallery-counter art-caption-pill">${esc(p0.caption)}</span>` : ""}` : ""}
                        </div>
                        <div class="art-top"${topHtml ? "" : " hidden"}>${topHtml}</div>
                        <div class="modal-body">
                            <div class="modal-top-row">
                                <div class="builder-list art-byline">${author ? `<div class="builder-card art-writer"><div class="builder-text"><p class="builder-name">Article written by ${esc(author)}</p></div></div>` : ""}</div>
                                <div class="room-tags art-actions">${ev ? `<span class="tag tag-filter">See the event</span>` : ""}<span class="tag tag-filter art-copy">Copy link</span></div>
                            </div>
                            <div class="modal-meta">
                                <div class="modal-meta-items art-meta"><span class="status-badge art-badge">Article</span><span>Published: ${esc(shortDay(day, true))}</span>${evDays ? `<span>Event: ${esc(evDays)}</span>` : ""}${words ? `<span>Reading time: ${Math.max(1, Math.round(words / 200))} min</span>` : ""}${pics.length > 1 ? `<span>${pics.length} pictures</span>` : ""}</div>
                                <div class="room-desc-panel">
                                    <div class="room-desc-box"><div class="room-desc-full art-text${a.justify ? " is-justified" : ""}">${body.innerHTML}${edited ? `<p class="art-updated">Updated: ${esc(edited)}</p>` : ""}</div></div>
                                    ${stripped ? `<div class="gallery-strip">${topHtml ? '<span class="art-strip-draw active"></span>' : ""}${pics.map((g, i) => `<img src="${esc(g.image)}" alt=""${i === 0 && !topHtml ? ' class="active"' : ""}>`).join("")}</div>` : ""}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div></body></html>`;
        previewEl.innerHTML = `
            <div class="guides-preview-bar art-preview-bar">
                <span class="admin-subheading">Preview: the article as it opens on the site${a.status === "draft" ? " (a draft: only you can see it)" : ""}</span>
                <button type="button" class="admin-action-pill" data-close-preview>Close preview</button>
            </div>
            <iframe class="art-preview-frame" title="Preview of the article" loading="eager"></iframe>`;
        previewEl.hidden = false;
        const frame = previewEl.querySelector("iframe");
        const fit = () => {
            const d = frame.contentDocument;
            if (!d || !d.documentElement) return;
            frame.style.height = Math.max(240, d.documentElement.scrollHeight) + "px";
        };
        frame.addEventListener("load", () => {
            const d = frame.contentDocument;
            if (!d) return;
            if (window.ArticleEmbeds) {
                window.ArticleEmbeds.hydrate(d.querySelector(".art-text"), { article: a, embedData: a.embedData, preview: true });
                ArticleText.fitPictures(d.querySelector(".art-text"));
                window.ArticleEmbeds.hydrate(d.querySelector(".art-top"), { article: a, embedData: a.embedData, preview: true });
            }
            // Its pictures and fonts load after: fitted again as they do.
            d.querySelectorAll("img").forEach(i => i.addEventListener("load", fit));
            if (d.fonts && d.fonts.ready) d.fonts.ready.then(fit);
            // ...and the blocks drawn by scripts of their own, which grow once drawn (2 Nov 2026, the wheel's replay).
            if (d.defaultView && d.defaultView.ResizeObserver && d.body) new d.defaultView.ResizeObserver(fit).observe(d.body);
            d.addEventListener("click", ev2 => { if (ev2.target.closest("a")) ev2.preventDefault(); });
            // The writer's Habbo figure, as the site adds it (THE WRITER in js/articles.js).
            if (author && typeof Api !== "undefined" && typeof Api.getHabboProfile === "function") {
                Api.getHabboProfile(author).then(p => {
                    const card = d.querySelector(".art-writer");
                    if (!p || !p.avatar || !card) return;
                    const img = d.createElement("img");
                    img.className = "builder-avatar";
                    img.src = p.avatar;
                    img.alt = "";
                    img.addEventListener("error", () => img.remove());
                    card.prepend(img);
                }).catch(() => {});
            }
            fit();
            setTimeout(fit, 400);
        });
        frame.srcdoc = doc;
        previewEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    previewEl.addEventListener("click", e => {
        if (e.target.closest("[data-close-preview]")) { previewEl.hidden = true; previewEl.innerHTML = ""; }
    });

    window.addEventListener("beforeunload", e => {
        if (dirty()) { e.preventDefault(); e.returnValue = ""; }
    });

    // ------------------------------------------------------------ mount

    function maybeMount() {
        if (mounted || panel.hidden || !token()) return;
        mounted = true;
        // Every embed's script, for its button on the bar (THE EMBED CONTRACT).
        if (window.ArticleEmbeds) window.ArticleEmbeds.loadAll().then(() => { if (editing) redraw(); });
        load();
    }
    new MutationObserver(maybeMount).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    maybeMount();

    /* For js/admin-whats-new.js (the log's article entries) and, through its
       AdminWhatsNew, js/admin.js (log out, a new account). */
    window.AdminArticles = {
        list: () => articles.slice(),
        loaded: () => mounted && articles !== null,
        onChange(fn) { if (typeof fn === "function") listeners.push(fn); },
        edit(id) {
            const a = articles.find(x => x.id === id);
            if (a) openEditor(a);
        },
        /* Straight into one article's editor, the list read afresh first
           (2 Nov 2026: the prize wheel's Put in an article, js/admin-entries.js,
           which shows this panel before it asks). True once it is open. */
        async open(id) {
            if (panel.hidden || !token()) return false;
            maybeMount();
            await load();
            const a = articles.find(x => x.id === id);
            if (!a) return false;
            await openEditor(a);
            return !!(stored && stored.id === id);
        },
        // The log's Hide and Show: wn.hidden alone (articles.js's whatsNewHidden).
        async setHidden(id, hidden) {
            const saved = await call(URL_, "PUT", { id, whatsNewHidden: !!hidden });
            const i = articles.findIndex(x => x.id === id);
            if (i >= 0 && saved && saved.id) articles[i] = saved;
            if (stored && stored.id === id && saved && saved.wn) {
                stored = saved;
                if (editing) {
                    editing.wn.hidden = saved.wn.hidden === true;
                    const box = formEl.querySelector('[data-wn="hidden"]');
                    if (box) box.checked = editing.wn.hidden;
                }
            }
            renderList();
            notify();
            return saved;
        },
        isDirty: () => !!dirty(),
        isSaving: () => saving,
        close() { if (editing) closeEditor(); },
        reset() {
            loadGen++;
            uploaded.clear();
            if (editing) closeEditor(true);
            articles = [];
            retiredAddresses = [];
            listEl.innerHTML = "";
            mounted = false;
            notify();
            maybeMount();
        }
    };
})();

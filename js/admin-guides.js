/* ===========================================================
   Maze Rats — the Guides panel in /warren

   Writes the guides the homepage's Guides window reads (js/guides.js).
   Stored by netlify/functions/guides.js.

   A guide is edited as a form: title, category, summary, thumbnail,
   draft or published, and an ordered list of sections, each a heading,
   text in the small format js/guide-text.js renders (the format is spelt
   out under every section's text box), and an optional picture. Sections can be added, moved and removed. Preview draws the
   guide with the same renderer and the same styles the homepage uses.

   PICTURES are uploaded into the "guides/" image folder (upload.js) the
   moment they are picked, like the maze form's, but nothing is ever
   deleted before a save succeeds: a picture replaced or removed is only
   cleared from storage once the guide has been saved without it, and one
   uploaded during an edit that is then cancelled is cleared on cancel.
   Pictures shipped with the site (assets/img/guides/) are never touched.

   THE STARTER GUIDE (js/guides-starter.js) is offered at the top of the
   panel while it is missing, so the first guide can be put on the site
   with one press and then edited here like any other.

   A file of its own, like js/admin-dead-ends.js: it shares the session
   token (read from the same localStorage key), Api's authenticated fetch,
   and admin.js's upload (window.AdminUpload), and nothing else.
   =========================================================== */
(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="guides"]');
    if (!panel || typeof Api === "undefined" || typeof GuideText === "undefined") return;

    const TOKEN_KEY = "mazerats_admin_token";
    const URL_ = "/.netlify/functions/guides";
    const listEl = panel.querySelector("#guides-list");
    const formEl = panel.querySelector("#guides-form");
    const starterEl = panel.querySelector("#guides-starter");
    const previewEl = panel.querySelector("#guides-preview");
    const addBtn = panel.querySelector("#guides-add-btn");

    const SUGGESTED_CATEGORIES = ["Getting Started", "Techniques", "Building", "Events"];
    const IMAGE_PREFIX = "/.netlify/functions/image?key=";

    let mounted = false;
    let guides = [];
    let editing = null;         // the guide in the form, or null
    let stored = null;          // the same guide as last saved (null for a new one)
    let snapshot = "";          // editing as it was opened, for "unsaved changes?"
    const uploaded = new Set(); // image keys uploaded during this edit
    /* Which edit is open, counted. An upload is slow and the form can move on
       while it runs: saved, cancelled, the guide deleted, or another guide
       opened. Each upload remembers the session it started in and, if that
       session has ended by the time the picture arrives, deletes the picture
       instead of putting it on whatever is open now. */
    let session = 0;
    let uploading = 0;          // uploads still running in this session
    /* A save in flight. Until it answers, the form stays put: cancelling or
       opening another guide would delete this edit's uploads while the save
       may be storing them, and a picture picked now would miss the save. */
    let saving = false;

    const esc = GuideText.esc;
    const token = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } };
    const call = (url, method, body) => Api._write(url, method, token(), body);

    function sessionGone(err) {
        if (!err || err.status !== 401) return false;
        listEl.innerHTML = '<p class="admin-empty">Your session has expired. <button type="button" class="ctl-btn" data-g-reload>Sign in again</button></p>';
        const b = listEl.querySelector("[data-g-reload]");
        if (b) b.addEventListener("click", () => location.reload());
        return true;
    }

    const keyOf = src => (typeof src === "string" && src.startsWith(IMAGE_PREFIX + "guides/")) ? src.slice(IMAGE_PREFIX.length) : null;

    // Every uploaded picture a guide points at.
    function keysIn(g) {
        if (!g) return new Set();
        return new Set([keyOf(g.thumb), ...(g.sections || []).map(s => keyOf(s.image))].filter(Boolean));
    }

    function forget(keys) {
        keys.forEach(k => { Api.deleteImage(token(), k).catch(() => {}); });
    }

    function when(iso) {
        const d = new Date(iso);
        return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    // ------------------------------------------------------------ loading

    async function load() {
        listEl.innerHTML = '<p class="admin-empty">Loading…</p>';
        try {
            const data = await call(`${URL_}?full=1`, "GET");
            guides = Array.isArray(data) ? data : [];
            renderList();
            renderStarter();
        } catch (err) {
            if (sessionGone(err)) return;
            listEl.innerHTML = `<p class="admin-empty">Could not load the guides: ${esc(err.message)}</p>`;
        }
    }

    // ------------------------------------------------------------ the list

    function renderStarter() {
        const s = window.GUIDES_STARTER;
        if (!s || guides.some(g => g.id === s.id)) { starterEl.innerHTML = ""; return; }
        starterEl.innerHTML = `
            <div class="guides-starter">
                <p><strong>${esc(s.title)}</strong> is ready to add: ${s.sections.length} sections on the basic tricks, written from markeh's Tutorial Maze, with its room pictures.</p>
                <div class="admin-row-actions">
                    <button type="button" class="admin-action-pill admin-pill-solid" data-starter="published">Add and publish</button>
                    <button type="button" class="admin-action-pill" data-starter="draft">Add as a draft</button>
                </div>
            </div>`;
    }

    starterEl.addEventListener("click", async e => {
        const b = e.target.closest("[data-starter]");
        if (!b || !window.GUIDES_STARTER) return;
        starterEl.querySelectorAll("button").forEach(x => { x.disabled = true; });
        try {
            await call(URL_, "POST", { ...window.GUIDES_STARTER, status: b.dataset.starter });
            await load();
        } catch (err) {
            if (sessionGone(err)) return;
            starterEl.querySelectorAll("button").forEach(x => { x.disabled = false; });
            alert(`Could not add the starter guide: ${err.message}`);
        }
    });

    function renderList() {
        if (!guides.length) {
            listEl.innerHTML = '<p class="admin-empty">No guides yet. Add the starter guide above, or write one with + New Guide.</p>';
            return;
        }
        listEl.innerHTML = guides.map(g => `
            <div class="chrome-list-row admin-row guides-admin-row" data-id="${esc(g.id)}">
                <div class="row-info">
                    <h3>${esc(g.title)}</h3>
                    <p class="row-creator">
                        <span class="guides-admin-status is-${g.status === "published" ? "live" : "draft"}">${g.status === "published" ? "Published" : "Draft"}</span>
                        ${g.category ? esc(g.category) + " · " : ""}${(g.sections || []).length} sections
                        ${g.updatedAt ? " · edited " + esc(when(g.updatedAt)) + (g.updatedBy ? " by " + esc(g.updatedBy) : "") : ""}
                    </p>
                    <p class="row-creator">/guides?g=${esc(g.id)}</p>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="btn" data-g-edit>Edit</button>
                    ${g.status === "published" ? `<a class="btn" href="/guides?g=${esc(encodeURIComponent(g.id))}&amp;fresh=1" target="_blank" rel="noopener">View</a>` : ""}
                    <button type="button" class="btn" data-g-delete>Delete</button>
                </div>
            </div>`).join("");
    }

    listEl.addEventListener("click", e => {
        const row = e.target.closest("[data-id]");
        if (!row) return;
        const g = guides.find(x => x.id === row.dataset.id);
        if (!g) return;
        if (e.target.closest("[data-g-edit]")) openEditor(g);
        else if (e.target.closest("[data-g-delete]")) removeGuide(g);
    });

    async function removeGuide(g) {
        if (!confirm(`Delete the guide "${g.title}"? It comes off the site at once, and its uploaded pictures are deleted. This can't be undone.`)) return;
        try {
            await call(`${URL_}?id=${encodeURIComponent(g.id)}`, "DELETE");
            /* The server deletes only the record; its pictures are cleared
               here (see netlify/functions/guides.js). If the guide was open
               in the form, that includes the pictures uploaded in this edit
               and not yet saved: nothing will ever point at them now. Any
               still uploading are deleted as they arrive (see upload). */
            const doomed = keysIn(g);
            if (editing && editing.id === g.id) {
                uploaded.forEach(k => doomed.add(k));
                closeEditor(true);
            }
            forget(doomed);
            await load();
        } catch (err) {
            if (!sessionGone(err)) alert(`Could not delete it: ${err.message}`);
        }
    }

    // ------------------------------------------------------------ the form

    const blankSection = () => ({ heading: "", body: "", image: "" });

    function copyOf(g) {
        return {
            id: g ? g.id : "",
            title: g ? g.title || "" : "",
            category: g ? g.category || "" : "",
            summary: g ? g.summary || "" : "",
            thumb: g ? g.thumb || "" : "",
            status: g ? g.status || "draft" : "draft",
            order: g ? g.order || 0 : 0,
            sections: g && Array.isArray(g.sections) && g.sections.length
                ? g.sections.map(s => ({ heading: s.heading || "", body: s.body || "", image: s.image || "" }))
                : [blankSection()]
        };
    }

    const dirty = () => editing && JSON.stringify(editing) !== snapshot;

    function openEditor(g) {
        if (saving) return;
        if (editing && dirty() && !confirm("You have unsaved changes to this guide. Discard them?")) return;
        // Every way out of an edit clears `uploaded` only after deleting what
        // it holds (or after a save has kept it), so it is empty here.
        if (editing) discardUploads();
        newSession();
        stored = g || null;
        editing = copyOf(g);
        snapshot = JSON.stringify(editing);
        renderForm();
        formEl.classList.add("is-open");
        addBtn.style.display = "none";
        previewEl.hidden = true;
        formEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Pictures uploaded during an edit that is being thrown away.
    function discardUploads() {
        const keep = keysIn(stored);
        forget([...uploaded].filter(k => !keep.has(k)));
        uploaded.clear();
    }

    // An upload still running from the edit being left deletes its picture
    // when it lands, and no longer counts against the next edit's Save.
    function newSession() {
        session++;
        uploading = 0;
    }

    /* skipUploads: the caller has already dealt with this edit's uploads
       (kept by a save, or deleted along with the guide). */
    function closeEditor(skipUploads) {
        if (!skipUploads) discardUploads();
        uploaded.clear();
        newSession();
        editing = null;
        stored = null;
        formEl.classList.remove("is-open");
        formEl.innerHTML = "";
        previewEl.hidden = true;
        addBtn.style.display = "";
    }

    function picHtml(which, src) {
        return `
            <div class="guides-pic" data-pic="${which}">
                ${src ? `<img src="${esc(src)}" alt="">` : `<span class="guides-pic-empty">No picture</span>`}
                <div class="guides-pic-actions">
                    <label class="admin-action-pill guides-pic-upload">${src ? "Replace" : "Upload picture"}
                        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-upload="${which}" hidden>
                    </label>
                    ${src ? `<button type="button" class="admin-action-pill" data-unpic="${which}">Remove</button>` : ""}
                    <span class="guides-pic-status" data-pic-status="${which}"></span>
                </div>
            </div>`;
    }

    const FORMAT_HELP = `Text format: a blank line starts a new paragraph · **bold** · *italic* · "- " starts a bullet · "1. " a numbered list · "> " a tip box · [words](https://...) links out (https addresses only) · [words](maze:maze-id), [words](event:event-id) or [words](guide:guide-id) link inside the site.`;

    function sectionHtml(s, i, n) {
        return `
            <div class="guides-edit-section" data-section="${i}">
                <div class="guides-edit-section-head">
                    <span class="guides-edit-section-num">Section ${i + 1}</span>
                    <span class="guides-edit-section-tools">
                        <button type="button" class="btn" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Move section up">&#9650; Up</button>
                        <button type="button" class="btn" data-move="1" ${i === n - 1 ? "disabled" : ""} aria-label="Move section down">&#9660; Down</button>
                        <button type="button" class="btn" data-remove-section>Remove</button>
                    </span>
                </div>
                <label class="admin-field"><span>Heading</span>
                    <input type="text" maxlength="120" data-f="heading" value="${esc(s.heading)}"></label>
                <label class="admin-field"><span>Text</span>
                    <textarea rows="7" maxlength="8000" data-f="body">${esc(s.body)}</textarea></label>
                <div class="admin-field"><span>Picture (shown beside the text)</span>${picHtml(`s${i}`, s.image)}</div>
            </div>`;
    }

    function renderForm() {
        const g = editing;
        const cats = [...new Set([...guides.map(x => x.category).filter(Boolean), ...SUGGESTED_CATEGORIES])];
        formEl.innerHTML = `
            <h3 class="admin-form-title">${g.id ? `Edit "${esc(stored ? stored.title : g.title)}"` : "New Guide"}</h3>
            <label class="admin-field"><span>Title</span>
                <input type="text" maxlength="120" data-g="title" value="${esc(g.title)}" required></label>
            <label class="admin-field"><span>Category</span>
                <input type="text" maxlength="40" data-g="category" value="${esc(g.category)}" list="guides-cat-list" placeholder="e.g. Getting Started">
                <datalist id="guides-cat-list">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
            <label class="admin-field"><span>Status</span>
                <select data-g="status">
                    <option value="draft"${g.status === "draft" ? " selected" : ""}>Draft (only visible here)</option>
                    <option value="published"${g.status === "published" ? " selected" : ""}>Published (on the site)</option>
                </select></label>
            <label class="admin-field"><span>List position (lower comes first)</span>
                <input type="number" step="1" data-g="order" value="${esc(g.order)}"></label>
            <label class="admin-field guides-wide"><span>Summary (shown on the guide's card and at the top of the guide)</span>
                <textarea rows="3" maxlength="600" data-g="summary">${esc(g.summary)}</textarea></label>
            <div class="admin-field guides-wide"><span>Thumbnail (on the guide's card and beside its summary; leave empty to use the first section picture)</span>${picHtml("thumb", g.thumb)}</div>
            <div class="guides-wide guides-edit-sections">
                <p class="admin-subheading">Sections</p>
                <p class="admin-hint">${esc(FORMAT_HELP)}</p>
                <div data-sections>${g.sections.map((s, i) => sectionHtml(s, i, g.sections.length)).join("")}</div>
                <button type="button" class="admin-action-pill" data-add-section>+ Add a section</button>
            </div>
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill" data-preview>Preview</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>`;
    }

    function showError(msg) {
        const el = formEl.querySelector(".admin-form-error");
        if (!el) return;
        el.textContent = msg || "";
        el.style.display = msg ? "block" : "none";
    }

    // Typing updates the guide in memory without redrawing the form, so the
    // caret stays where it is.
    formEl.addEventListener("input", e => {
        if (!editing) return;
        const t = e.target;
        if (t.dataset.g) editing[t.dataset.g] = t.dataset.g === "order" ? Number(t.value) || 0 : t.value;
        const sec = t.closest("[data-section]");
        if (sec && t.dataset.f) editing.sections[Number(sec.dataset.section)][t.dataset.f] = t.value;
    });
    formEl.addEventListener("change", e => {
        const t = e.target;
        if (t.dataset.g === "status" && editing) editing.status = t.value;
        if (t.dataset.upload && t.files && t.files[0]) {
            upload(t.dataset.upload, t.files[0]);
            // So picking the same file again (after a refused try) still counts.
            t.value = "";
        }
    });

    const setPic = (which, src) => {
        if (which === "thumb") editing.thumb = src;
        else editing.sections[Number(which.slice(1))].image = src;
    };

    /* The picture goes to the slot it was picked for, found again by the
       section itself rather than by its number, since sections can be moved
       or removed while the upload runs. */
    async function upload(which, file) {
        if (!editing) return;
        if (saving) {
            const s = formEl.querySelector(`[data-pic-status="${which}"]`);
            if (s) s.textContent = "Saving - pick it again once the save is done.";
            return;
        }
        const mine = session;
        const section = which === "thumb" ? null : editing.sections[Number(which.slice(1))];
        // Where the picture belongs now, or null if nowhere any more.
        const slotNow = () => {
            if (mine !== session || !editing) return null;
            if (which === "thumb") return "thumb";
            const i = editing.sections.indexOf(section);
            return i >= 0 ? `s${i}` : null;
        };
        const status = formEl.querySelector(`[data-pic-status="${which}"]`);
        if (status) status.textContent = "Uploading…";
        uploading++;
        try {
            if (typeof window.AdminUpload !== "function") throw new Error("the uploader is not ready - reload the page");
            const result = await window.AdminUpload(editing.id || editing.title || "guide", file, "guides");
            const slot = slotNow();
            if (!slot) {
                // The edit it was for has ended (saved, cancelled, deleted,
                // or another guide opened), or its section was removed:
                // nothing will ever point at this picture, so it goes now.
                forget([result.key]);
                return;
            }
            uploaded.add(result.key);
            setPic(slot, result.url);
            redrawKeepingScroll();
            const after = formEl.querySelector(`[data-pic-status="${slot}"]`);
            if (after && result.notice) after.textContent = result.notice;
        } catch (err) {
            if (mine !== session) return; // that form is gone; nothing to tell it
            if (sessionGone(err)) return;
            const slot = slotNow();
            const now = slot && formEl.querySelector(`[data-pic-status="${slot}"]`);
            if (now) now.textContent = `Couldn't upload: ${err.message}`;
        } finally {
            if (mine === session) uploading--;
        }
    }

    function redrawKeepingScroll() {
        const y = window.scrollY;
        renderForm();
        window.scrollTo(0, y);
    }

    formEl.addEventListener("click", e => {
        if (!editing) return;
        const t = e.target;
        const sec = t.closest("[data-section]");
        const i = sec ? Number(sec.dataset.section) : -1;
        if (t.closest("[data-add-section]")) {
            editing.sections.push(blankSection());
            redrawKeepingScroll();
            const last = formEl.querySelector(`[data-section="${editing.sections.length - 1}"] [data-f="heading"]`);
            if (last) last.focus();
        } else if (t.closest("[data-move]") && i >= 0) {
            const j = i + Number(t.closest("[data-move]").dataset.move);
            if (j < 0 || j >= editing.sections.length) return;
            const list = editing.sections;
            [list[i], list[j]] = [list[j], list[i]];
            redrawKeepingScroll();
        } else if (t.closest("[data-remove-section]") && i >= 0) {
            const s = editing.sections[i];
            if ((s.heading || s.body || s.image) && !confirm(`Remove section ${i + 1}${s.heading ? ` ("${s.heading}")` : ""}? Its picture is deleted when you save.`)) return;
            editing.sections.splice(i, 1);
            if (!editing.sections.length) editing.sections.push(blankSection());
            redrawKeepingScroll();
        } else if (t.closest("[data-unpic]")) {
            setPic(t.closest("[data-unpic]").dataset.unpic, "");
            redrawKeepingScroll();
        } else if (t.closest("[data-preview]")) {
            preview();
        } else if (t.closest(".admin-cancel-btn")) {
            if (saving) return;
            if (dirty() && !confirm("Discard your changes to this guide?")) return;
            closeEditor();
        }
    });

    formEl.addEventListener("submit", async e => {
        e.preventDefault();
        if (!editing) return;
        if (!editing.title.trim()) { showError("A guide needs a title."); return; }
        /* A picture still on its way would miss this save, and then be
           deleted as belonging to an edit that had ended. */
        if (uploading > 0) {
            showError(`${uploading === 1 ? "A picture is" : `${uploading} pictures are`} still uploading. Save again once it says it's done.`);
            return;
        }
        const btn = formEl.querySelector('button[type="submit"]');
        btn.disabled = true;
        saving = true;
        showError("");
        const body = { ...editing, sections: editing.sections.filter(s => s.heading.trim() || s.body.trim() || s.image) };
        try {
            let saved;
            if (stored) {
                body.id = stored.id;
                // The save count the form was opened at (see the conflict
                // check in netlify/functions/guides.js). A guide from before
                // rev existed has none, which the server counts as 0. The
                // updatedAt goes too, for a server that predates rev.
                body._baseRev = Number(stored.rev) || 0;
                body._baseUpdatedAt = stored.updatedAt || "";
                saved = await call(URL_, "PUT", body);
            } else {
                delete body.id;
                saved = await call(URL_, "POST", body);
            }
            // Pictures the guide no longer uses: the ones it had before and
            // the ones uploaded this time, less whatever the saved copy keeps.
            const keep = keysIn(saved);
            forget([...new Set([...keysIn(stored), ...uploaded])].filter(k => !keep.has(k)));
            uploaded.clear();
            closeEditor(true);
            await load();
        } catch (err) {
            btn.disabled = false;
            if (sessionGone(err)) return;
            showError(err.message || "Could not save the guide.");
        } finally {
            saving = false;
        }
    });

    addBtn.addEventListener("click", () => openEditor(null));

    // ------------------------------------------------------------ preview

    /* The guide as the homepage will draw it: the same text renderer and the
       same classes (css/style.css, "guides"), in a box under the form. */
    function preview() {
        const g = editing;
        const sections = g.sections.filter(s => s.heading || s.body || s.image);
        const thumb = GuideText.thumbOf({ thumb: g.thumb, sections });
        previewEl.innerHTML = `
            <div class="guides-preview-bar">
                <span class="admin-subheading">Preview</span>
                <button type="button" class="admin-action-pill" data-close-preview>Close preview</button>
            </div>
            <div class="guides-body">
                <header class="guide-head${thumb ? " has-thumb" : ""}">
                    <div class="guide-head-text">
                        ${g.category ? `<span class="guides-pill">${esc(g.category)}</span>` : ""}
                        <h3 class="guide-title">${esc(g.title || "Untitled guide")}</h3>
                        ${g.summary ? `<div class="guide-summary">${GuideText.render(g.summary)}</div>` : ""}
                    </div>
                    ${thumb ? `<span class="guide-thumb guide-head-thumb"><img src="${esc(thumb)}" alt=""></span>` : ""}
                </header>
                ${sections.map(s => `
                    <section class="guide-section">
                        ${s.heading ? `<h4 class="guide-section-title">${esc(s.heading)}</h4>` : ""}
                        ${s.image ? `<figure class="guide-figure"><img class="guide-img" src="${esc(s.image)}" alt=""></figure>` : ""}
                        <div class="guide-body">${GuideText.render(s.body)}</div>
                    </section>`).join("")}
            </div>`;
        previewEl.hidden = false;
        previewEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    previewEl.addEventListener("click", e => {
        if (e.target.closest("[data-close-preview]")) previewEl.hidden = true;
        // Links in a preview are for reading, not following.
        if (e.target.closest("a")) e.preventDefault();
    });

    // Leaving /warren with a guide half-written.
    window.addEventListener("beforeunload", e => {
        if (dirty()) { e.preventDefault(); e.returnValue = ""; }
    });

    // ------------------------------------------------------------ mount

    function maybeMount() {
        if (mounted || panel.hidden || !token()) return;
        mounted = true;
        load();
    }
    new MutationObserver(maybeMount).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    maybeMount();
})();

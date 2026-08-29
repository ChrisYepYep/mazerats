/* Admin panel logic for admin.html — add/edit/delete mazes and events.
   Everything here writes live to MongoDB via the Netlify Functions in
   netlify/functions/ (see js/api.js) — no local-only staging anymore.
   Write requests are gated by a session token from logging in with a
   username/password (see netlify/functions/auth.js and _auth.js); sessions
   expire automatically after 12 hours. Image uploads (thumbnails,
   room-by-room gallery shots) go through netlify/functions/upload.js into
   Netlify Blobs — see js/api.js's uploadImage/deleteImage. */
document.addEventListener("DOMContentLoaded", () => {

    // Rooms/events/admins/contributors are all admin-entered (a single
    // trusted operator), so the risk here is low — but every list below
    // still renders its fields via innerHTML, so escaping keeps a stray
    // "<"/"&" in a title or description from breaking the row's own markup,
    // and stops a bad paste or a compromised admin account (see
    // netlify/functions/auth.js's owner/admin role split) from running in
    // the admin's own authenticated session next time the list renders.
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // localStorage, not sessionStorage — an admin checking the live site
    // (home.html, see the pre-load Coming Soon/Maintenance gate in its own
    // <head>) in a second tab or window needs this same token there too;
    // sessionStorage is scoped per-tab and wouldn't be visible outside the
    // tab actually used to log in.
    const TOKEN_KEY = "mazerats_admin_token";
    const loginModal = document.getElementById("login-modal");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    const adminContent = document.getElementById("admin-content");
    const logoutBtn = document.getElementById("logout-btn");
    const furniScanAllBtn = document.getElementById("furni-scan-all-btn");
    const furniScanStatus = document.getElementById("furni-scan-status");
    const furniScanNewBtn = document.getElementById("furni-scan-new-btn");
    const furniProgress = document.getElementById("furni-progress");
    const furniProgressFill = document.getElementById("furni-progress-fill");
    const furniProgressLabel = document.getElementById("furni-progress-label");
    const adminsListEl = document.getElementById("admins-list");
    const adminsFormEl = document.getElementById("admins-form");
    const adminsAddBtn = document.getElementById("admins-add-btn");
    const contributorsListEl = document.getElementById("contributors-list");
    const contributorsFormEl = document.getElementById("contributors-form");
    const contributorsAddBtn = document.getElementById("contributors-add-btn");
    const aboutTextInput = document.getElementById("about-text-input");
    const aboutSaveBtn = document.getElementById("about-save-btn");
    const aboutSaveStatus = document.getElementById("about-save-status");
    const contactMessagesListEl = document.getElementById("contact-messages-list");
    const bansListEl = document.getElementById("bans-list");
    const landingToggleEl = document.getElementById("landing-toggle");
    const landingToggleBtns = document.querySelectorAll(".btn-enter-mini");
    const landingToggleStatus = document.getElementById("landing-toggle-status");
    const floatingActionsEl = document.getElementById("floating-actions");
    const floatingSaveBtn = document.getElementById("floating-save-btn");
    const floatingCancelBtn = document.getElementById("floating-cancel-btn");

    let adminToken = localStorage.getItem(TOKEN_KEY) || "";
    let currentUsername = "";
    let currentUserRole = "admin";
    let workingRooms = [];
    let workingEvents = [];
    let workingAdmins = [];
    let workingContributors = [];
    let workingContactMessages = [];
    let workingBans = [];
    let roomsQuery = "";
    let roomsSortBy = "name";
    let eventsSortBy = "date-desc";
    const roomsSearchInput = document.getElementById("rooms-search");
    const roomsSortSelect = document.getElementById("rooms-sort");
    const eventsSortSelect = document.getElementById("events-sort");
    // Which of "rooms"/"events" the floating Save/Cancel currently act on —
    // null whenever neither form is open (they're hidden then too).
    let activeFormKey = null;

    // Kept in this exact order everywhere (easiest → hardest) — js/home.js
    // has its own copy of the value/label pairs for rendering the pill.
    // Same order used by the rooms-sort dropdown's difficulty options and by
    // the public site's own room-sort (js/home.js) — kept in sync manually
    // since each file already has its own small copy of the difficulty list.
    const DIFFICULTY_ORDER = ["easy", "medium", "hard", "very-hard", "extreme"];

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // A maze's opening date is stored as "YYYY-MM-DD", or "YYYY-MM" when the
    // exact day isn't known (the admin form's Day dropdown left on "—") —
    // js/home.js's formatMazeDate shows the day-less form as just "Month
    // Year" on the public site instead of guessing a day.
    function parseMazeDate(dateStr) {
        const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
        if (full) return { year: full[1], month: full[2], day: full[3] };
        const monthOnly = /^(\d{4})-(\d{2})$/.exec(dateStr || "");
        if (monthOnly) return { year: monthOnly[1], month: monthOnly[2], day: "" };
        return { year: "", month: "", day: "" };
    }

    const DIFFICULTY_OPTIONS = [
        ["", "Not rated"],
        ["easy", "Easy"],
        ["medium", "Medium"],
        ["hard", "Hard"],
        ["very-hard", "Very Hard"],
        ["extreme", "Extreme"]
    ];

    // The hotels this archive covers, as a fixed list rather than the free
    // text field this used to be — the values are matched exactly
    // elsewhere (netlify/functions/habbo.js maps them to the Origins hotel
    // to look a builder up on), so a typo or an old spelling like
    // "Origins" silently cost that maze its builder cards.
    const HOTEL_OPTIONS = [
        ["", "Unknown"],
        ["COM", "COM"],
        ["ES", "ES"],
        ["BR", "BR"]
    ];

    const COLLECTIONS = {
        rooms: {
            singular: "Maze",
            plural: "Mazes",
            fieldMap: { title: "name", subtitle: "creator", date: "added" },
            titleLabel: "Maze Name",
            subtitleLabel: "Creator (Habbo username)",
            dateLabel: "Date opened",
            statusOptions: [["open", "Open"], ["closed", "Closed"], ["collab", "Collab"], ["unknown", "Unknown"]],
            getAll: () => workingRooms,
            create: item => Api.createRoom(adminToken, item),
            update: item => Api.updateRoom(adminToken, item),
            remove: id => Api.deleteRoom(adminToken, id),
            listEl: document.getElementById("rooms-list"),
            formEl: document.getElementById("rooms-form"),
            addBtn: document.getElementById("rooms-add-btn")
        },
        events: {
            singular: "Event",
            plural: "Events",
            fieldMap: { title: "title", subtitle: "host", date: "date" },
            titleLabel: "Event title",
            subtitleLabel: "Host (Habbo username)",
            statusOptions: [["upcoming", "Upcoming"], ["past", "Past"], ["archive", "Archive"]],
            getAll: () => workingEvents,
            create: item => Api.createEvent(adminToken, item),
            update: item => Api.updateEvent(adminToken, item),
            remove: id => Api.deleteEvent(adminToken, id),
            listEl: document.getElementById("events-list"),
            formEl: document.getElementById("events-form"),
            addBtn: document.getElementById("events-add-btn")
        }
    };

    // ---------- login ----------

    loginForm.addEventListener("submit", async e => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        const username = (formData.get("username") || "").trim();
        const password = formData.get("password");
        loginError.style.display = "none";
        const submitBtn = loginForm.querySelector("button[type=submit]");
        submitBtn.disabled = true;
        submitBtn.textContent = "Checking…";

        try {
            const result = await Api.login(username, password);
            adminToken = result.token;
            currentUsername = result.username;
            currentUserRole = result.role || "admin";
            localStorage.setItem(TOKEN_KEY, adminToken);
            await enterAdmin();
        } catch (err) {
            loginError.textContent = err.message || "Wrong username or password — try again.";
            loginError.style.display = "block";
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Unlock";
        }
    });

    function lockOut() {
        localStorage.removeItem(TOKEN_KEY);
        adminToken = "";
        currentUsername = "";
        currentUserRole = "admin";
        adminContent.style.display = "none";
        landingToggleEl.style.display = "none";
        loginModal.classList.add("open");
        loginError.textContent = "Session expired — log in again.";
        loginError.style.display = "block";
    }

    function doLogout() {
        localStorage.removeItem(TOKEN_KEY);
        adminToken = "";
        currentUsername = "";
        currentUserRole = "admin";
        workingRooms = [];
        workingEvents = [];
        workingAdmins = [];
        workingContributors = [];
        workingContactMessages = [];
        Object.keys(COLLECTIONS).forEach(key => closeForm(key));
        closeAdminsForm();
        closeContributorsForm();
        adminContent.style.display = "none";
        landingToggleEl.style.display = "none";
        loginModal.classList.add("open");
        loginError.style.display = "none";
        loginForm.reset();
    }

    async function enterAdmin() {
        loginModal.classList.remove("open");
        adminContent.style.display = "block";
        landingToggleEl.style.display = "flex";
        // Same gate as the sidebar — nothing on this page shows until the
        // login modal is unlocked.
        const glyphPalette = document.getElementById("glyph-palette");
        if (glyphPalette) glyphPalette.style.display = "flex";
        const [rooms, events] = await Promise.all([Api.getRooms(), Api.getEvents()]);
        workingRooms = rooms;
        workingEvents = events;
        renderList("rooms");
        renderList("events");
        loadAdmins();
        loadLandingState();
        loadContributors();
        loadAboutText();
        loadContactMessages();
        loadBans();
    }

    // ---------- image uploads ----------

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Couldn't read that file."));
            reader.readAsDataURL(file);
        });
    }

    async function uploadImageFile(prefix, file) {
        const dataUrl = await readFileAsDataUrl(file);
        return Api.uploadImage(adminToken, prefix, file.name, dataUrl);
    }

    function blobKeyFromUrl(url) {
        const m = /\/\.netlify\/functions\/image\?key=([^&]+)/.exec(url || "");
        return m ? decodeURIComponent(m[1]) : null;
    }

    // Fire-and-forget cleanup delete, used everywhere an image is being
    // discarded/replaced (bookend removal, gallery row removal, old-version
    // pruning, room/event deletion). Unlike every other admin-gated call in
    // this file, these used to swallow every error including a 401 — a
    // session expiring mid-edit would fail the delete silently, leaving the
    // orphaned blob in storage with no indication anything went wrong.
    // Routed through the same lockOut() the rest of the file uses instead.
    function deleteImageSafe(key) {
        Api.deleteImage(adminToken, key).catch(err => {
            if (err.status === 401) lockOut();
        });
    }

    // Wraps a file input in a much larger drag-and-drop target instead of
    // leaving it as the browser's own tiny "Choose File" control — used for
    // every image upload on the page (thumbnail, entrance/finish, gallery
    // rooms, older versions). Wrapping in a <label> means clicking anywhere
    // in it still opens the native picker with zero extra JS; dropping a
    // file sets the input's own .files (via a real DataTransfer, the only
    // way to do that from script) and fires "change", so every existing
    // upload flow keyed off that input needs no changes at all.
    //
    // Dropping (or picking) a file only ever selects it — it never uploads
    // on its own. Flows with their own explicit Add/Upload button (the
    // gallery "+ Add" flows, bookend upload, older versions) upload only
    // once that button is actually pressed; wireThumbUpload's own change
    // handler is the one exception (it has no separate button to press),
    // unaffected either way by drag vs. click-to-browse.
    // Puts a dropzone's label back to its "drop something here" prompt.
    // wireDropzone swaps that for the chosen file's name on selection, which
    // is right while a file is waiting to be acted on — but wrong once it
    // has been uploaded and the zone is free again.
    function resetDropzoneText(fileInput) {
        const text = fileInput && fileInput.closest(".admin-dropzone")
            ? fileInput.closest(".admin-dropzone").querySelector(".admin-dropzone-text")
            : null;
        if (text) text.textContent = DROPZONE_PLACEHOLDER;
    }

    const DROPZONE_PLACEHOLDER = "Drag & drop an image here, or click to browse";

    function wireDropzone(fileInput) {
        if (!fileInput || fileInput.closest(".admin-dropzone")) return;
        const label = document.createElement("label");
        label.className = "admin-dropzone";
        const text = document.createElement("span");
        text.className = "admin-dropzone-text";
        const placeholder = DROPZONE_PLACEHOLDER;
        text.textContent = placeholder;

        fileInput.insertAdjacentElement("beforebegin", label);
        label.appendChild(fileInput);
        label.appendChild(text);

        fileInput.addEventListener("change", () => {
            const n = fileInput.files.length;
            text.textContent = n > 1 ? `${n} files selected` : n === 1 ? fileInput.files[0].name : placeholder;
        });

        ["dragenter", "dragover"].forEach(evt => label.addEventListener(evt, e => {
            e.preventDefault();
            label.classList.add("dragover");
        }));
        ["dragleave", "drop"].forEach(evt => label.addEventListener(evt, e => {
            e.preventDefault();
            label.classList.remove("dragover");
        }));
        label.addEventListener("drop", e => {
            const files = e.dataTransfer.files;
            if (!files.length) return;
            // A single-file input just takes the first file dropped even if
            // several were dragged in together; a multi-file one (the
            // gallery's own batch-upload input) keeps them all.
            const dt = new DataTransfer();
            if (fileInput.multiple) {
                Array.from(files).forEach(f => dt.items.add(f));
            } else {
                dt.items.add(files[0]);
            }
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        });
    }

    // A room's older-version images are simpler than the room itself —
    // just an image + optional label, no bonus/run-through/entrance-finish
    // promotion — so they get their own lightweight normalizer, nested
    // inside normalizeGalleryEntry below rather than a full second copy of
    // normalizeGalleryEntry's shape.
    function normalizeOldVersionEntry(entry) {
        if (typeof entry === "string") return { image: entry, label: "" };
        return { image: entry.image, label: entry.label || "" };
    }

    // Gallery entries used to be plain image path strings; the editor below
    // stores {image, label} objects instead so labels aren't tied to a
    // filename. Normalize both shapes so older seeded rooms keep working.
    function normalizeGalleryEntry(entry) {
        if (typeof entry === "string") return { image: entry, label: deriveGalleryLabel(entry), bonus: false, runThrough: false, oldVersions: [] };
        return {
            image: entry.image,
            label: entry.label || deriveGalleryLabel(entry.image),
            bonus: !!entry.bonus,
            runThrough: !!entry.runThrough,
            oldVersions: (entry.oldVersions || []).map(normalizeOldVersionEntry)
        };
    }

    // Related Images are a flat {image, name} list — no ordering rules, no
    // bonus/run-through flags, no older versions. Deliberately a much
    // smaller thing than the room-by-room gallery above, since these are
    // extra pictures hung off a maze/event rather than part of its sequence.
    function normalizeRelatedEntry(entry) {
        if (typeof entry === "string") return { image: entry, name: "" };
        return { image: entry.image || "", name: entry.name || "" };
    }

    // Mirrors wireGalleryEditor's shape (draft array on the form element,
    // re-render on every change) and reuses its row classes for styling, but
    // without the reordering, promotion and sub-panel machinery none of
    // which applies here.
    function wireRelatedEditor(formEl, uploadPrefix) {
        const listEl = formEl.querySelector(".admin-related-list");
        if (!listEl) return;
        const fileInput = formEl.querySelector(".admin-related-new-file");
        const status = formEl.querySelector(".admin-related-status");
        wireDropzone(fileInput);

        function renderRelatedList() {
            const draft = formEl._relatedDraft;
            if (!draft.length) {
                listEl.innerHTML = `<p class="admin-empty">No related images added yet.</p>`;
                return;
            }
            listEl.innerHTML = draft.map((r, i) => `
                <div class="admin-gallery-row" data-index="${i}">
                    <div class="admin-gallery-row-top">
                        <span class="admin-gallery-drag-handle admin-related-drag-handle" draggable="true" title="Drag to reorder">&#9776;</span>
                        <label class="admin-gallery-thumb admin-gallery-thumb-filled" style="background-image:url('${imgCdn(r.image, 100, 100, 55)}');">
                            <!-- Carries .admin-gallery-thumb-file too: that
                                 class is what hides the native control so
                                 the thumbnail itself is the click target. -->
                            <input type="file" class="admin-gallery-thumb-file admin-related-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp">
                            <span class="admin-gallery-thumb-replace-text">Replace Image</span>
                        </label>
                        <input type="text" class="admin-gallery-label admin-related-name" value="${r.name || ""}" placeholder="Image name">
                    </div>
                    <div class="admin-gallery-actions-secondary">
                        <button type="button" class="admin-pill-btn admin-related-up" ${i === 0 ? "disabled" : ""} title="Move up">&#9650; Up</button>
                        <button type="button" class="admin-pill-btn admin-related-down" ${i === draft.length - 1 ? "disabled" : ""} title="Move down">&#9660; Down</button>
                        <button type="button" class="admin-pill-btn admin-pill-danger admin-related-remove" title="Remove">Remove</button>
                    </div>
                </div>
            `).join("");

            listEl.querySelectorAll(".admin-gallery-row").forEach(row => {
                const i = Number(row.dataset.index);
                row.querySelector(".admin-related-name").addEventListener("input", e => {
                    draft[i].name = e.target.value;
                });
                row.querySelector(".admin-related-remove").addEventListener("click", () => {
                    const key = blobKeyFromUrl(draft[i].image);
                    if (key) deleteImageSafe(key);
                    draft.splice(i, 1);
                    renderRelatedList();
                });

                // The order here is the order the photo icons appear in on
                // the public site, left to right.
                row.querySelector(".admin-related-up").addEventListener("click", () => {
                    if (i === 0) return;
                    [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]];
                    renderRelatedList();
                });
                row.querySelector(".admin-related-down").addEventListener("click", () => {
                    if (i === draft.length - 1) return;
                    [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]];
                    renderRelatedList();
                });

                // Drag to reorder, same handle-and-row arrangement the
                // room gallery uses. The Files guard matters for the same
                // reason it does there: dragging an image from the desktop
                // onto a row bubbles dragover/drop up here too, and without
                // it that would be read as a reorder from index 0 — the
                // getData call returns "" for a file drag, and Number("")
                // is 0 rather than NaN.
                const dragHandle = row.querySelector(".admin-related-drag-handle");
                dragHandle.addEventListener("dragstart", e => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                    row.classList.add("dragging");
                });
                dragHandle.addEventListener("dragend", () => row.classList.remove("dragging"));

                row.addEventListener("dragover", e => {
                    if (e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                    row.classList.toggle("drag-over-top", before);
                    row.classList.toggle("drag-over-bottom", !before);
                });
                row.addEventListener("dragleave", () => {
                    row.classList.remove("drag-over-top", "drag-over-bottom");
                });
                row.addEventListener("drop", e => {
                    if (e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    row.classList.remove("drag-over-top", "drag-over-bottom");
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (Number.isNaN(from) || from === i) return;
                    const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                    let to = before ? i : i + 1;
                    if (from < to) to--;
                    const [moved] = draft.splice(from, 1);
                    draft.splice(to, 0, moved);
                    renderRelatedList();
                });
                row.querySelector(".admin-related-thumb-file").addEventListener("change", async e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    status.textContent = "Uploading…";
                    status.style.display = "block";
                    try {
                        const { url } = await uploadImageFile(uploadPrefix, file);
                        const oldKey = blobKeyFromUrl(draft[i].image);
                        if (oldKey) deleteImageSafe(oldKey);
                        draft[i].image = url;
                        status.style.display = "none";
                        renderRelatedList();
                    } catch (err) {
                        if (err.status === 401) { lockOut(); return; }
                        status.textContent = err.message || "Upload failed.";
                    }
                });
            });
        }

        // Uploads the moment files land, rather than staging them behind an
        // "Add" button. The two-step version read as broken: choosing a file
        // changed nothing on screen except the dropzone's own label, so there
        // was no sign anything had happened until you found the separate
        // button below it. This is the same auto-upload the entrance/finish
        // fields already use — drop images, rows appear, name them in place.
        fileInput.addEventListener("change", async () => {
            const files = Array.from(fileInput.files).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
            );
            if (!files.length) return;

            status.style.display = "block";
            try {
                for (let f = 0; f < files.length; f++) {
                    status.textContent = files.length > 1
                        ? `Uploading ${f + 1} of ${files.length}…`
                        : "Uploading…";
                    const { url } = await uploadImageFile(uploadPrefix, files[f]);
                    // Named after the file to start with — a real name beats
                    // an empty box, and it's editable in the row right away.
                    formEl._relatedDraft.push({
                        image: url,
                        name: files[f].name.replace(/\.[a-z0-9]+$/i, "")
                    });
                    // Rendered per file, so a batch fills in visibly as it
                    // goes instead of sitting still until the last one lands.
                    renderRelatedList();
                }
                status.style.display = "none";
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Upload failed.";
            } finally {
                // Cleared so re-picking the same file fires "change" again,
                // and the dropzone goes back to inviting the next drop
                // rather than naming the file it has already dealt with.
                fileInput.value = "";
                resetDropzoneText(fileInput);
            }
        });

        renderRelatedList();
    }

    /* What the furni scan found, per room image, with a way to correct it.
       Scanning is confident but not infallible — a sprite that shares enough
       pixels with whatever is behind it can land a false hit — so each
       detection can be hidden (kept in the record but not shown on the site)
       or removed outright. Hiding is the safer of the two: a rescan will
       find a false positive again, and a hidden one stays hidden with its
       reasoning visible, where a removed one silently comes back. */
    function wireFurniEditor(formEl, item) {
        const wrap = formEl.querySelector(".admin-furni-field");
        if (!wrap) return;
        const listEl = wrap.querySelector(".admin-furni-list");
        formEl._furniDraft = JSON.parse(JSON.stringify(item.furni || {}));
        // Which rooms are expanded. Every room starts collapsed to a single
        // tab: a scanned maze can run to a hundred-odd detections, which
        // buries the rest of the form. Kept out here because Hide and Remove
        // both re-render, and rebuilding from scratch would otherwise close
        // the room being worked on after every click.
        const openRooms = new Set();

        // Room images in the order they appear on the site, so this reads in
        // the same order as the gallery above rather than by object key.
        function imagesInOrder() {
            const out = [];
            if (item.entrance && item.entrance.image) out.push({ image: item.entrance.image, label: "Entrance" });
            (formEl._galleryDraft || item.gallery || []).forEach((g, i) => {
                if (g.image) out.push({ image: g.image, label: g.label || ("Room " + (i + 1)) });
            });
            if (item.finish && item.finish.image) out.push({ image: item.finish.image, label: "Finish" });
            return out;
        }

        function render() {
            const draft = formEl._furniDraft;
            const rooms = imagesInOrder().filter(r => draft[r.image]);
            if (!rooms.length) {
                listEl.innerHTML = '<p class="admin-empty">No furni recorded yet — run a scan on this maze.</p>';
                return;
            }
            listEl.innerHTML = rooms.map(({ image, label }) => {
                const rec = draft[image] || {};
                const items = rec.items || [];
                const shown = items.filter(i => !i.hidden).length;
                let note = "";
                if (rec.skipped === "lighting-effects") {
                    note = '<p class="admin-hint">Skipped: this screenshot has lighting effects on it (' + rec.roomColours + ' colours), which shifts every pixel and makes exact matching impossible.</p>';
                } else if (rec.error) {
                    note = '<p class="admin-hint">Failed: ' + escapeHtml(rec.error) + '</p>';
                }
                const rows = items.map((f, i) => '' +
                    '<div class="admin-furni-item ' + (f.hidden ? "is-hidden" : "") + '" data-image="' + escapeHtml(image) + '" data-index="' + i + '">' +
                        '<img src="' + escapeHtml(f.icon || "") + '" alt="">' +
                        '<span class="admin-furni-name">' + escapeHtml(f.name || "") + '</span>' +
                        '<span class="admin-furni-score">' + Math.round((f.coverage || 0) * 100) + '%</span>' +
                        '<button type="button" class="admin-pill-btn admin-furni-hide">' + (f.hidden ? "Show" : "Hide") + '</button>' +
                        '<button type="button" class="admin-pill-btn admin-pill-danger admin-furni-remove">Remove</button>' +
                    '</div>').join("");
                const open = openRooms.has(image);
                return '' +
                    '<div class="admin-furni-room' + (open ? " is-open" : "") + '">' +
                        '<div class="admin-furni-room-head">' +
                            // The whole head is the toggle, with the buttons
                            // inside it stopping the click so "Remove all"
                            // never doubles as a collapse.
                            '<button type="button" class="admin-furni-toggle" data-image="' + escapeHtml(image) + '" aria-expanded="' + open + '">' +
                                '<span class="admin-furni-caret" aria-hidden="true"></span>' +
                                '<strong>' + escapeHtml(label) + '</strong>' +
                                '<span class="admin-hint">' + shown + ' shown of ' + items.length + '</span>' +
                            '</button>' +
                            '<button type="button" class="admin-pill-btn admin-pill-danger admin-furni-clear" data-image="' + escapeHtml(image) + '">Remove all</button>' +
                        '</div>' +
                        '<div class="admin-furni-panel">' + note +
                            '<div class="admin-furni-items">' + rows + '</div>' +
                        '</div>' +
                    '</div>';
            }).join("");

            listEl.querySelectorAll(".admin-furni-toggle").forEach(btn => {
                btn.addEventListener("click", () => {
                    const image = btn.dataset.image;
                    if (openRooms.has(image)) openRooms.delete(image);
                    else openRooms.add(image);
                    render();
                });
            });
            listEl.querySelectorAll(".admin-furni-item").forEach(row => {
                const image = row.dataset.image;
                const idx = Number(row.dataset.index);
                row.querySelector(".admin-furni-hide").addEventListener("click", () => {
                    const f = draft[image].items[idx];
                    f.hidden = !f.hidden;
                    render();
                });
                row.querySelector(".admin-furni-remove").addEventListener("click", () => {
                    draft[image].items.splice(idx, 1);
                    render();
                });
            });
            listEl.querySelectorAll(".admin-furni-clear").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const image = btn.dataset.image;
                    if (!await showConfirmDialog("Remove every furni recorded for this room image? A rescan would find them again.")) return;
                    draft[image].items = [];
                    render();
                });
            });
        }

        render();
    }

    function wireThumbUpload(formEl, uploadPrefix) {
        const fileInput = formEl.querySelector(".admin-thumb-file");
        const textInput = formEl.querySelector('input[name="thumb"]');
        const status = formEl.querySelector(".admin-thumb-status");
        if (!fileInput) return;
        wireDropzone(fileInput);
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files[0];
            if (!file) return;
            status.textContent = "Uploading…";
            try {
                const { url } = await uploadImageFile(uploadPrefix, file);
                textInput.value = url;
                status.textContent = "Uploaded";
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Upload failed.";
            }
        });
    }

    // Entrance/Finish upload — the thumb itself is the upload/replace
    // target (click or drop a file directly onto it), auto-uploading the
    // instant a file lands rather than needing a separate explicit button —
    // same pattern as a gallery room's own thumb, see wireGalleryEditor's
    // per-row wiring, which this closely mirrors.
    function wireBookendUpload(formEl, kind, uploadPrefix) {
        const fileInput = formEl.querySelector(`.admin-${kind}-file`);
        const removeBtn = formEl.querySelector(`.admin-${kind}-remove`);
        const textInput = formEl.querySelector(`input[name="${kind}Image"]`);
        const status = formEl.querySelector(`.admin-${kind}-status`);
        const previewEl = formEl.querySelector(`.admin-${kind}-field .admin-gallery-thumb`);
        if (!fileInput) return;
        const thumbLabel = fileInput.closest(".admin-gallery-thumb");

        ["dragenter", "dragover"].forEach(evt => thumbLabel.addEventListener(evt, e => {
            e.preventDefault();
            thumbLabel.classList.add("dragover");
        }));
        ["dragleave", "drop"].forEach(evt => thumbLabel.addEventListener(evt, e => {
            e.preventDefault();
            thumbLabel.classList.remove("dragover");
        }));
        thumbLabel.addEventListener("drop", e => {
            const file = e.dataTransfer.files[0];
            if (!file) return;
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        });

        fileInput.addEventListener("change", async () => {
            const file = fileInput.files[0];
            if (!file) return;
            status.style.display = "block";
            status.textContent = "Uploading…";
            try {
                const { url } = await uploadImageFile(uploadPrefix, file);
                textInput.value = url;
                if (previewEl) {
                    previewEl.style.backgroundImage = `url('${imgCdn(url, 100, 100, 55)}')`;
                    previewEl.classList.add("admin-gallery-thumb-filled");
                    previewEl.classList.remove("admin-gallery-thumb-empty");
                    const uploadText = previewEl.querySelector(".admin-gallery-thumb-upload-text");
                    if (uploadText) {
                        uploadText.className = "admin-gallery-thumb-replace-text";
                        uploadText.textContent = "Replace Image";
                    }
                }
                if (removeBtn) removeBtn.disabled = false;
                status.style.display = "none";
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Upload failed.";
            }
        });

        if (removeBtn) {
            removeBtn.addEventListener("click", async () => {
                if (!await showConfirmDialog(`Remove the ${kind === "entrance" ? "Entrance" : "Finish"} image? This can't be undone.`)) return;
                const key = blobKeyFromUrl(textInput.value);
                if (key) deleteImageSafe(key);
                textInput.value = "";
                if (previewEl) {
                    previewEl.style.backgroundImage = "";
                    previewEl.classList.add("admin-gallery-thumb-empty");
                    previewEl.classList.remove("admin-gallery-thumb-filled");
                    const replaceText = previewEl.querySelector(".admin-gallery-thumb-replace-text");
                    if (replaceText) {
                        replaceText.className = "admin-gallery-thumb-upload-text";
                        replaceText.textContent = "Drag or click to upload image";
                    }
                }
                removeBtn.disabled = true;

                // The image's own older-version history goes with it — an
                // empty slot with old versions attached doesn't mean anything.
                (formEl[`_${kind}OldVersions`] || []).forEach(v => {
                    const vKey = blobKeyFromUrl(v.image);
                    if (vKey) deleteImageSafe(vKey);
                });
                formEl[`_${kind}OldVersions`] = [];
                formEl[`_${kind}OldVersionsExpanded`] = false;
                const refresh = formEl[`_render${kind}OldVersions`];
                if (refresh) refresh();
            });
        }
    }

    // Promotes an image (either uploaded fresh or an existing gallery room,
    // see wireGalleryEditor's Entrance/End buttons) into the entrance or
    // finish bookend slot, updating that field's text input + label + live
    // preview thumbnail in place.
    function setBookendImage(formEl, kind, image, label) {
        const textInput = formEl.querySelector(`input[name="${kind}Image"]`);
        const labelInput = formEl.querySelector(`input[name="${kind}Label"]`);
        const previewEl = formEl.querySelector(`.admin-${kind}-field .admin-gallery-thumb`);
        const removeBtn = formEl.querySelector(`.admin-${kind}-remove`);
        if (textInput) textInput.value = image || "";
        if (labelInput) labelInput.value = label || (kind === "entrance" ? "Entrance" : "Finish");
        if (previewEl) {
            previewEl.style.backgroundImage = image ? `url('${imgCdn(image, 100, 100, 55)}')` : "";
            previewEl.classList.toggle("admin-gallery-thumb-filled", !!image);
            previewEl.classList.toggle("admin-gallery-thumb-empty", !image);
            const textEl = previewEl.querySelector(".admin-gallery-thumb-replace-text, .admin-gallery-thumb-upload-text");
            if (textEl) {
                textEl.className = image ? "admin-gallery-thumb-replace-text" : "admin-gallery-thumb-upload-text";
                textEl.textContent = image ? "Replace Image" : "Drag or click to upload image";
            }
        }
        if (removeBtn) removeBtn.disabled = !image;
    }

    // Older-version images for the Entrance/Finish bookend slots — same
    // idea as a gallery room's own Old Version toggle (see wireGalleryEditor)
    // but there's only ever one entrance and one finish, so the draft and
    // expanded-state live directly on formEl (`_entranceOldVersions` /
    // `_finishOldVersions`, `_entranceOldVersionsExpanded` / ...Expanded)
    // instead of a per-index Set. The render function is also stashed on
    // formEl (`_render${kind}OldVersions`) so promoteToBookend and the
    // bookend's own Remove button can refresh this panel after they change
    // formEl[`_${kind}OldVersions`] out from under it.
    function wireBookendOldVersions(formEl, kind, uploadPrefix) {
        const toggleBtn = formEl.querySelector(`.admin-${kind}-oldversions-toggle`);
        const container = formEl.querySelector(`.admin-${kind}-oldversions-container`);
        if (!toggleBtn || !container) return;

        function render() {
            const items = formEl[`_${kind}OldVersions`] || (formEl[`_${kind}OldVersions`] = []);
            const expanded = !!formEl[`_${kind}OldVersionsExpanded`];
            toggleBtn.classList.toggle("active", expanded);
            toggleBtn.textContent = items.length ? `Old Versions (${items.length})` : "Old Version";

            if (!expanded) {
                container.innerHTML = "";
                return;
            }

            const rows = items.map((v, vi) => `
                <div class="admin-gallery-row" data-sub-index="${vi}">
                    <div class="admin-gallery-row-top">
                        <div class="admin-gallery-thumb" style="${v.image ? `background-image:url('${imgCdn(v.image, 100, 100, 55)}');` : ""}"></div>
                        <input type="text" class="admin-gallery-label admin-${kind}-oldversions-sublabel" value="${v.label || ""}" placeholder="Label (optional)">
                    </div>
                    <div class="admin-gallery-actions-secondary">
                        <button type="button" class="admin-pill-btn admin-pill-danger admin-${kind}-oldversions-subremove" title="Remove">Remove</button>
                    </div>
                </div>
            `).join("");

            container.innerHTML = `
                <div class="admin-oldversions-subpanel">
                    <p class="admin-hint">Older screenshots of this ${kind === "entrance" ? "entrance" : "finish"} image — shown behind a "See older version(s)" pill on the site.</p>
                    <div class="admin-gallery-list">${rows || `<p class="admin-empty">No older versions added yet.</p>`}</div>
                    <div class="admin-gallery-add">
                        <input type="text" class="admin-gallery-new-label admin-${kind}-oldversions-new-label" placeholder="Label (optional)">
                        <input type="file" class="admin-${kind}-oldversions-new-file" accept="image/png,image/jpeg,image/gif,image/webp">
                        <button type="button" class="admin-pill-btn admin-${kind}-oldversions-add-btn">+ Add Older Version</button>
                    </div>
                    <p class="admin-${kind}-oldversions-status" style="display:none;"></p>
                </div>
            `;

            container.querySelectorAll("[data-sub-index]").forEach(row => {
                const vi = Number(row.dataset.subIndex);
                row.querySelector(`.admin-${kind}-oldversions-sublabel`).addEventListener("input", e => {
                    items[vi].label = e.target.value;
                });
                row.querySelector(`.admin-${kind}-oldversions-subremove`).addEventListener("click", async () => {
                    if (!await showConfirmDialog("Remove this older version image?")) return;
                    const [removed] = items.splice(vi, 1);
                    render();
                    const key = blobKeyFromUrl(removed.image);
                    if (key) deleteImageSafe(key);
                });
            });

            const subLabelInput = container.querySelector(`.admin-${kind}-oldversions-new-label`);
            const subFileInput = container.querySelector(`.admin-${kind}-oldversions-new-file`);
            const subAddBtn = container.querySelector(`.admin-${kind}-oldversions-add-btn`);
            const subStatus = container.querySelector(`.admin-${kind}-oldversions-status`);
            wireDropzone(subFileInput);
            subAddBtn.addEventListener("click", async () => {
                const file = subFileInput.files[0];
                if (!file) {
                    subStatus.textContent = "Choose an image first.";
                    subStatus.style.display = "block";
                    return;
                }
                const label = subLabelInput.value.trim();
                subAddBtn.disabled = true;
                subStatus.style.display = "block";
                subStatus.textContent = "Uploading…";
                try {
                    const { url } = await uploadImageFile(uploadPrefix, file);
                    items.push({ image: url, label });
                    render();
                } catch (err) {
                    if (err.status === 401) { lockOut(); return; }
                    subStatus.textContent = err.message || "Upload failed.";
                } finally {
                    subAddBtn.disabled = false;
                }
            });
        }

        formEl[`_render${kind}OldVersions`] = render;
        toggleBtn.addEventListener("click", () => {
            formEl[`_${kind}OldVersionsExpanded`] = !formEl[`_${kind}OldVersionsExpanded`];
            render();
        });

        render();
    }

    // Pop-up shown when promoting a room image over an entrance/finish slot
    // that's already occupied — asks whether the bumped image should be
    // deleted outright or moved back into the room-by-room list. Built as a
    // one-off modal-overlay (reusing the same classes as the room/login
    // modals) instead of a native confirm() so it can offer three real
    // choices, and it blocks the rest of the form while open so the row
    // index the caller is acting on can't go stale underneath it.
    function showBookendConflictDialog(kind, existingLabel) {
        return new Promise(resolve => {
            const kindLabel = kind === "entrance" ? "Entrance" : "Finish";
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open";
            overlay.innerHTML = `
                <div class="modal">
                    <div class="chrome-titlebar">
                        <h2>Replace the ${kindLabel} image?</h2>
                        <button type="button" class="chrome-close" aria-label="Cancel">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="room-desc-full">This maze already has a ${kindLabel.toLowerCase()} image ("${existingLabel}"). What should happen to it?</p>
                        <div class="admin-form-actions" style="flex-direction:column; align-items:stretch; gap:8px; margin-top:10px;">
                            <button type="button" class="admin-action-pill admin-pill-solid" data-choice="keep">Move it into the room list</button>
                            <button type="button" class="admin-action-pill admin-pill-danger" data-choice="discard">Delete it</button>
                            <button type="button" class="admin-action-pill" data-choice="cancel">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            function finish(choice) {
                overlay.remove();
                resolve(choice);
            }

            overlay.querySelectorAll("[data-choice]").forEach(btn => {
                btn.addEventListener("click", () => finish(btn.dataset.choice));
            });
            overlay.querySelector(".chrome-close").addEventListener("click", () => finish("cancel"));
            overlay.addEventListener("click", e => {
                if (e.target === overlay) finish("cancel");
            });
        });
    }

    // Generic Yes/No pop-up (same modal-overlay treatment as the dialogs
    // above) — resolves true only if "Yes" was actually clicked; closing
    // any other way (the × button, clicking outside) counts as "No".
    function showConfirmDialog(message) {
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open";
            overlay.innerHTML = `
                <div class="modal confirm-modal">
                    <div class="chrome-titlebar">
                        <h2>Are You Sure?</h2>
                        <button type="button" class="chrome-close" aria-label="No">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="room-desc-full confirm-message">${message}</p>
                        <div class="admin-form-actions confirm-actions">
                            <button type="button" class="admin-action-pill admin-pill-solid" data-choice="yes">Yes</button>
                            <button type="button" class="admin-action-pill" data-choice="no">No</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            function finish(choice) {
                overlay.remove();
                resolve(choice === "yes");
            }

            overlay.querySelectorAll("[data-choice]").forEach(btn => {
                btn.addEventListener("click", () => finish(btn.dataset.choice));
            });
            overlay.querySelector(".chrome-close").addEventListener("click", () => finish("no"));
            overlay.addEventListener("click", e => {
                if (e.target === overlay) finish("no");
            });
        });
    }

    // Plain acknowledgement pop-up — a single OK button, no other choice.
    function showInfoDialog(message) {
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open";
            overlay.innerHTML = `
                <div class="modal confirm-modal">
                    <div class="chrome-titlebar">
                        <h2>Landing Page Updated</h2>
                        <button type="button" class="chrome-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="room-desc-full confirm-message">${message}</p>
                        <div class="admin-form-actions confirm-actions">
                            <button type="button" class="btn btn-solid" data-choice="ok">OK</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            function finish() {
                overlay.remove();
                resolve();
            }

            overlay.querySelector("[data-choice]").addEventListener("click", finish);
            overlay.querySelector(".chrome-close").addEventListener("click", finish);
            overlay.addEventListener("click", e => {
                if (e.target === overlay) finish();
            });
        });
    }

    // Shared by the gallery editor's Entrance/End buttons — pulls room[index]
    // out of the draft and into the given bookend slot, prompting first if
    // that slot is already occupied (see showBookendConflictDialog).
    async function promoteToBookend(formEl, draft, index, kind, renderGalleryList) {
        const textInput = formEl.querySelector(`input[name="${kind}Image"]`);
        const labelInput = formEl.querySelector(`input[name="${kind}Label"]`);
        const existingImage = textInput ? textInput.value.trim() : "";
        const existingLabel = (labelInput && labelInput.value.trim()) || (kind === "entrance" ? "Entrance" : "Finish");
        const existingOldVersions = formEl[`_${kind}OldVersions`] || [];

        let choice = "discard";
        if (existingImage) {
            choice = await showBookendConflictDialog(kind, existingLabel);
            if (choice === "cancel") return;
        }

        const [promoted] = draft.splice(index, 1);

        if (existingImage) {
            if (choice === "keep") {
                // The bumped bookend's own older versions travel with it
                // back into the room list, same as its image and label.
                draft.push({ image: existingImage, label: existingLabel, bonus: false, runThrough: false, oldVersions: existingOldVersions });
            } else {
                const key = blobKeyFromUrl(existingImage);
                if (key) deleteImageSafe(key);
                existingOldVersions.forEach(v => {
                    const vKey = blobKeyFromUrl(v.image);
                    if (vKey) deleteImageSafe(vKey);
                });
            }
        }

        // The promoted room's own older versions become this slot's, not
        // discarded — same principle in reverse.
        formEl[`_${kind}OldVersions`] = promoted.oldVersions || [];
        formEl[`_${kind}OldVersionsExpanded`] = false;
        const refreshOldVersions = formEl[`_render${kind}OldVersions`];
        if (refreshOldVersions) refreshOldVersions();

        setBookendImage(formEl, kind, promoted.image, promoted.label);
        renderGalleryList();
    }

    function wireGalleryEditor(formEl, uploadPrefix, allowMissingImage) {
        const listEl = formEl.querySelector(".admin-gallery-list");
        const labelInput = formEl.querySelector(".admin-gallery-new-label");
        const fileInput = formEl.querySelector(".admin-gallery-new-file");
        const addBtn = formEl.querySelector(".admin-gallery-add-btn");
        const status = formEl.querySelector(".admin-gallery-status");
        wireDropzone(fileInput);

        // Which rows currently have their older-versions sub-panel open,
        // keyed by room index — persisted on the form element (not a local
        // var) so it survives across renderGalleryList() re-renders, which
        // happen on every state change including ones in unrelated rows.
        // Cleared on remove/reorder below since either shifts every index
        // after the affected row, which would otherwise leave the wrong
        // row's panel open.
        const expandedOldVersions = formEl._expandedOldVersions || (formEl._expandedOldVersions = new Set());

        function oldVersionsSubpanelHtml(g) {
            const rows = g.oldVersions.map((v, vi) => `
                <div class="admin-gallery-row" data-sub-index="${vi}">
                    <div class="admin-gallery-row-top">
                        <div class="admin-gallery-thumb" style="${v.image ? `background-image:url('${imgCdn(v.image, 100, 100, 55)}');` : ""}"></div>
                        <input type="text" class="admin-gallery-label admin-oldversions-sublabel" value="${v.label || ""}" placeholder="Label (optional)">
                    </div>
                    <div class="admin-gallery-actions-secondary">
                        <button type="button" class="admin-pill-btn admin-pill-danger admin-oldversions-subremove" title="Remove">Remove</button>
                    </div>
                </div>
            `).join("");
            return `
                <div class="admin-oldversions-subpanel">
                    <p class="admin-hint">Older screenshots of this room (e.g. before a rebuild) — shown behind a "See older version(s)" pill on the site, kept separate from the main image above.</p>
                    <div class="admin-gallery-list">${rows || `<p class="admin-empty">No older versions added yet.</p>`}</div>
                    <div class="admin-gallery-add">
                        <input type="text" class="admin-gallery-new-label admin-oldversions-new-label" placeholder="Label (optional)">
                        <input type="file" class="admin-oldversions-new-file" accept="image/png,image/jpeg,image/gif,image/webp">
                        <button type="button" class="admin-pill-btn admin-oldversions-add-btn">+ Add Older Version</button>
                    </div>
                    <p class="admin-oldversions-status" style="display:none;"></p>
                </div>
            `;
        }

        // Every row's buttons sit on two lines under the name field, rather
        // than crowding a 48px thumbnail with seven-plus buttons on one —
        // Old Version/Bonus/Run-Through/Entrance/End on the first, reorder
        // + Remove on the second. Shares .admin-pill-btn (the same rounded,
        // mostly-transparent pill look used for tags elsewhere), solid-
        // filled only while .active — Bonus/Run-Through carry a real on/off
        // data state; Old Version's .active just mirrors whether its
        // sub-panel is currently expanded.
        function renderGalleryList() {
            const draft = formEl._galleryDraft;

            // Mirrors js/home.js's own roomIndex logic exactly (bonus and
            // run-through rooms are excluded from the count/number there
            // too) so the number shown here is the same one a visitor will
            // actually see on the public site, not just this row's raw
            // position in the list.
            let roomCounter = 0;
            const roomNumbers = draft.map(g => (g.bonus || g.runThrough) ? null : ++roomCounter);

            listEl.innerHTML = draft.map((g, i) => {
                const expanded = expandedOldVersions.has(i);
                const oldVersionsLabel = g.oldVersions.length ? `Old Versions (${g.oldVersions.length})` : "Old Version";
                const roomNumber = roomNumbers[i];
                return `
                    <div class="admin-gallery-row" data-index="${i}">
                        ${roomNumber ? `<span class="admin-gallery-room-number" title="Room number on the public site">${roomNumber}</span>` : ""}
                        <div class="admin-gallery-row-top">
                            <span class="admin-gallery-drag-handle" draggable="true" title="Drag to reorder">&#9776;</span>
                            ${g.image
                                ? `<label class="admin-gallery-thumb admin-gallery-thumb-filled" style="background-image:url('${imgCdn(g.image, 100, 100, 55)}');">
                                       <input type="file" class="admin-gallery-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp">
                                       <span class="admin-gallery-thumb-replace-text">Replace Image</span>
                                   </label>`
                                : `<label class="admin-gallery-thumb admin-gallery-thumb-empty">
                                       <input type="file" class="admin-gallery-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp">
                                       <span class="admin-gallery-thumb-upload-text">Drag or click to upload image</span>
                                   </label>`}
                            <input type="text" class="admin-gallery-label" value="${g.label || ""}" placeholder="Room label">
                        </div>
                        <div class="admin-gallery-actions">
                            <button type="button" class="admin-pill-btn admin-gallery-oldversions-toggle ${expanded ? "active" : ""}" title="Add or view older versions of this room">${oldVersionsLabel}</button>
                            <button type="button" class="admin-pill-btn admin-gallery-bonus ${g.bonus ? "active" : ""}" title="Mark as Bonus Room">Bonus</button>
                            <button type="button" class="admin-pill-btn admin-gallery-run-through ${g.runThrough ? "active" : ""}" title="Mark as a run-through room — excluded from the room count and number">Run-Through</button>
                            <button type="button" class="admin-pill-btn admin-gallery-make-entrance" ${g.image ? "" : "disabled"} title="${g.image ? "Make this the Entrance image" : "Add an image to this room first"}">Entrance</button>
                            <button type="button" class="admin-pill-btn admin-gallery-make-finish" ${g.image ? "" : "disabled"} title="${g.image ? "Make this the Finish image" : "Add an image to this room first"}">End</button>
                        </div>
                        <div class="admin-gallery-actions-secondary">
                            <button type="button" class="admin-pill-btn admin-gallery-top" ${i === 0 ? "disabled" : ""} title="Send to top (Room 1)">Top</button>
                            <button type="button" class="admin-pill-btn admin-gallery-up" ${i === 0 ? "disabled" : ""} title="Move up">&#9650; Up</button>
                            <button type="button" class="admin-pill-btn admin-gallery-down" ${i === draft.length - 1 ? "disabled" : ""} title="Move down">&#9660; Down</button>
                            <button type="button" class="admin-pill-btn admin-gallery-bottom" ${i === draft.length - 1 ? "disabled" : ""} title="Send to bottom (last room)">Bottom</button>
                            <button type="button" class="admin-pill-btn admin-pill-danger admin-gallery-remove" title="Remove">Remove</button>
                        </div>
                        ${expanded ? oldVersionsSubpanelHtml(g) : ""}
                    </div>
                `;
            }).join("");

            // :scope > so this only matches the top-level room rows — an
            // expanded row's old-versions subpanel nests its own
            // .admin-gallery-row elements (data-sub-index, not data-index)
            // several levels down, and a plain descendant query would catch
            // those too, then throw wiring a toggle button that isn't there.
            listEl.querySelectorAll(":scope > .admin-gallery-row").forEach(row => {
                const i = Number(row.dataset.index);
                row.querySelector(".admin-gallery-oldversions-toggle").addEventListener("click", () => {
                    if (expandedOldVersions.has(i)) expandedOldVersions.delete(i);
                    else expandedOldVersions.add(i);
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-bonus").addEventListener("click", () => {
                    draft[i].bonus = !draft[i].bonus;
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-run-through").addEventListener("click", () => {
                    draft[i].runThrough = !draft[i].runThrough;
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-make-entrance").addEventListener("click", () => {
                    promoteToBookend(formEl, draft, i, "entrance", renderGalleryList);
                });
                row.querySelector(".admin-gallery-make-finish").addEventListener("click", () => {
                    promoteToBookend(formEl, draft, i, "finish", renderGalleryList);
                });
                row.querySelector(".admin-gallery-label").addEventListener("input", e => {
                    draft[i].label = e.target.value;
                });

                // Every room's thumb is a live upload target now, not just
                // an image-less one (see addBtn below for how those start
                // out) — same drag/drop + click-to-browse pattern as
                // wireDropzone, just built directly onto the thumb itself
                // (already the right shape/size) rather than wrapping the
                // input in a whole separate dropzone element. Dropping or
                // picking a file here always just overwrites draft[i].image
                // below, whether that's setting it for the first time or
                // replacing whatever was already there.
                const thumbFileInput = row.querySelector(".admin-gallery-thumb-file");
                if (thumbFileInput) {
                    const thumbLabel = thumbFileInput.closest(".admin-gallery-thumb");
                    ["dragenter", "dragover"].forEach(evt => thumbLabel.addEventListener(evt, e => {
                        e.preventDefault();
                        thumbLabel.classList.add("dragover");
                    }));
                    ["dragleave", "drop"].forEach(evt => thumbLabel.addEventListener(evt, e => {
                        e.preventDefault();
                        thumbLabel.classList.remove("dragover");
                    }));
                    thumbLabel.addEventListener("drop", e => {
                        const file = e.dataTransfer.files[0];
                        if (!file) return;
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        thumbFileInput.files = dt.files;
                        thumbFileInput.dispatchEvent(new Event("change", { bubbles: true }));
                    });
                    thumbFileInput.addEventListener("change", async () => {
                        const file = thumbFileInput.files[0];
                        if (!file) return;
                        status.style.display = "block";
                        status.textContent = "Uploading…";
                        try {
                            const { url } = await uploadImageFile(uploadPrefix, file);
                            draft[i].image = url;
                            status.style.display = "none";
                            renderGalleryList();
                        } catch (err) {
                            if (err.status === 401) { lockOut(); return; }
                            status.textContent = err.message || "Upload failed.";
                        }
                    });
                }
                row.querySelector(".admin-gallery-top").addEventListener("click", () => {
                    if (i === 0) return;
                    expandedOldVersions.clear();
                    const [moved] = draft.splice(i, 1);
                    draft.unshift(moved);
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-up").addEventListener("click", () => {
                    if (i === 0) return;
                    expandedOldVersions.clear();
                    [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]];
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-down").addEventListener("click", () => {
                    if (i === draft.length - 1) return;
                    expandedOldVersions.clear();
                    [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]];
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-bottom").addEventListener("click", () => {
                    if (i === draft.length - 1) return;
                    expandedOldVersions.clear();
                    const [moved] = draft.splice(i, 1);
                    draft.push(moved);
                    renderGalleryList();
                });

                // Drag-to-reorder, alongside the Up/Down buttons above rather
                // than replacing them. Only the handle itself is draggable —
                // not the whole row — so dragging inside the label input
                // still just selects text instead of picking the row up.
                // Drop position is whichever half of the target row the
                // cursor is over (top half = insert before, bottom = after).
                const dragHandle = row.querySelector(".admin-gallery-drag-handle");
                dragHandle.addEventListener("dragstart", e => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                    row.classList.add("dragging");
                });
                dragHandle.addEventListener("dragend", () => {
                    row.classList.remove("dragging");
                });
                // A file dragged from the OS into this row's own nested
                // Old Version dropzone (see oldVersionsSubpanelHtml) bubbles
                // its dragover/drop events up through the row too — without
                // this guard, that also triggered the reorder logic below:
                // e.dataTransfer.getData("text/plain") is "" for a file
                // drag (no setData call ever set it), and Number("") is 0,
                // not NaN, so the "not a real reorder" check silently failed
                // and spliced room 0 out to wherever the file landed,
                // scrambling the room order and re-rendering the list out
                // from under the upload that was actually in progress.
                row.addEventListener("dragover", e => {
                    if (e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                    row.classList.toggle("drag-over-top", before);
                    row.classList.toggle("drag-over-bottom", !before);
                });
                row.addEventListener("dragleave", () => {
                    row.classList.remove("drag-over-top", "drag-over-bottom");
                });
                row.addEventListener("drop", e => {
                    if (e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    row.classList.remove("drag-over-top", "drag-over-bottom");
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (Number.isNaN(from) || from === i) return;
                    const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                    let to = before ? i : i + 1;
                    if (from < to) to--;
                    expandedOldVersions.clear();
                    const [moved] = draft.splice(from, 1);
                    draft.splice(to, 0, moved);
                    renderGalleryList();
                });

                row.querySelector(".admin-gallery-remove").addEventListener("click", async () => {
                    if (!await showConfirmDialog(`Remove "${draft[i].label || "this room"}"? This can't be undone.`)) return;
                    expandedOldVersions.clear();
                    const [removed] = draft.splice(i, 1);
                    renderGalleryList();
                    const key = blobKeyFromUrl(removed.image);
                    if (key) deleteImageSafe(key);
                    removed.oldVersions.forEach(v => {
                        const vKey = blobKeyFromUrl(v.image);
                        if (vKey) deleteImageSafe(vKey);
                    });
                });

                if (!expandedOldVersions.has(i)) return;

                row.querySelectorAll("[data-sub-index]").forEach(subRow => {
                    const vi = Number(subRow.dataset.subIndex);
                    subRow.querySelector(".admin-oldversions-sublabel").addEventListener("input", e => {
                        draft[i].oldVersions[vi].label = e.target.value;
                    });
                    subRow.querySelector(".admin-oldversions-subremove").addEventListener("click", async () => {
                        if (!await showConfirmDialog("Remove this older version image?")) return;
                        const [removed] = draft[i].oldVersions.splice(vi, 1);
                        renderGalleryList();
                        const key = blobKeyFromUrl(removed.image);
                        if (key) deleteImageSafe(key);
                    });
                });

                const subLabelInput = row.querySelector(".admin-oldversions-new-label");
                const subFileInput = row.querySelector(".admin-oldversions-new-file");
                const subAddBtn = row.querySelector(".admin-oldversions-add-btn");
                const subStatus = row.querySelector(".admin-oldversions-status");
                wireDropzone(subFileInput);
                subAddBtn.addEventListener("click", async () => {
                    const file = subFileInput.files[0];
                    if (!file) {
                        subStatus.textContent = "Choose an image first.";
                        subStatus.style.display = "block";
                        return;
                    }
                    const label = subLabelInput.value.trim();
                    subAddBtn.disabled = true;
                    subStatus.style.display = "block";
                    subStatus.textContent = "Uploading…";
                    try {
                        const { url } = await uploadImageFile(uploadPrefix, file);
                        draft[i].oldVersions.push({ image: url, label });
                        renderGalleryList();
                    } catch (err) {
                        if (err.status === 401) { lockOut(); return; }
                        subStatus.textContent = err.message || "Upload failed.";
                    } finally {
                        subAddBtn.disabled = false;
                    }
                });
            });
        }

        addBtn.addEventListener("click", async () => {
            // Sorted by file name (numeric-aware, so "Room 2" sorts before
            // "Room 10") rather than left in whatever order the OS's file
            // picker or drag-drop happened to hand them over in.
            const files = Array.from(fileInput.files).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
            );
            const draft = formEl._galleryDraft;
            // The typed label only makes sense for a single image — a batch
            // of several instead names each one after its own file (same
            // "Room 12.png" -> "Room 12" logic normalizeGalleryEntry already
            // falls back to for legacy string-only entries).
            const explicitLabel = files.length <= 1 ? labelInput.value.trim() : "";

            // No file chosen isn't an error for rooms any more — one can be
            // added with just a title, e.g. built but not screenshotted
            // yet. The public site shows an "Awaiting Room Image" pill in
            // its place (see showGalleryImage in home.js) until it's edited
            // in later with a real upload. Events' photo gallery has no
            // equivalent identity without the image itself, so that side
            // keeps the original requirement.
            if (!files.length && allowMissingImage) {
                draft.push({ image: "", label: explicitLabel || `Room ${draft.length + 1}`, bonus: false, runThrough: false, oldVersions: [] });
                labelInput.value = "";
                renderGalleryList();
                return;
            }
            if (!files.length) {
                status.textContent = "Choose an image first.";
                status.style.display = "block";
                return;
            }

            addBtn.disabled = true;
            status.style.display = "block";
            try {
                for (let n = 0; n < files.length; n++) {
                    const file = files[n];
                    status.textContent = files.length > 1 ? `Uploading ${n + 1} of ${files.length}…` : "Uploading…";
                    const { url } = await uploadImageFile(uploadPrefix, file);
                    const label = explicitLabel || deriveGalleryLabel(file.name);
                    draft.push({ image: url, label, bonus: false, runThrough: false, oldVersions: [] });
                    renderGalleryList();
                }
                fileInput.value = "";
                labelInput.value = "";
                status.style.display = "none";
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Upload failed.";
            } finally {
                addBtn.disabled = false;
            }
        });

        renderGalleryList();
    }

    function cleanupItemImages(item) {
        const keys = [];
        const thumbKey = blobKeyFromUrl(item.thumb);
        if (thumbKey) keys.push(thumbKey);
        const entranceKey = blobKeyFromUrl(item.entrance && item.entrance.image);
        if (entranceKey) keys.push(entranceKey);
        (item.entrance && item.entrance.oldVersions || []).forEach(v => {
            const key = blobKeyFromUrl(v.image);
            if (key) keys.push(key);
        });
        const finishKey = blobKeyFromUrl(item.finish && item.finish.image);
        if (finishKey) keys.push(finishKey);
        (item.finish && item.finish.oldVersions || []).forEach(v => {
            const key = blobKeyFromUrl(v.image);
            if (key) keys.push(key);
        });
        (item.gallery || []).forEach(entry => {
            const key = blobKeyFromUrl(typeof entry === "string" ? entry : entry.image);
            if (key) keys.push(key);
            (entry.oldVersions || []).forEach(v => {
                const vKey = blobKeyFromUrl(v.image);
                if (vKey) keys.push(vKey);
            });
        });
        keys.forEach(key => deleteImageSafe(key));
    }

    // ---------- list rendering ----------

    // Same index-pairing reasoning as visibleRoomEntries below — sorting
    // reorders what's shown, but openForm/deleteItem still need each
    // item's real index into workingEvents. No search box for events (only
    // sort was asked for), so there's no filtering step here.
    function visibleEventEntries() {
        const entries = workingEvents.map((item, index) => ({ item, index }));
        if (eventsSortBy === "name") {
            entries.sort((a, b) => compareNames(a.item.title, b.item.title));
        } else if (eventsSortBy === "date-asc") {
            entries.sort((a, b) => (a.item.date || "").localeCompare(b.item.date || ""));
        } else {
            entries.sort((a, b) => (b.item.date || "").localeCompare(a.item.date || ""));
        }
        return entries;
    }

    // Search/sort filters and reorders what's shown, but openForm/
    // deleteItem still need the item's real index into workingRooms — so
    // this pairs each item with that original index *before* filtering/
    // sorting, and the row's click handlers close over that paired index
    // rather than its position in the display list.
    function visibleRoomEntries() {
        const q = roomsQuery.trim().toLowerCase();
        let entries = workingRooms.map((item, index) => ({ item, index }));
        if (q) {
            entries = entries.filter(({ item }) => {
                const haystack = [item.name, item.creator, ...(item.tags || [])].join(" ").toLowerCase();
                return haystack.includes(q);
            });
        }
        if (roomsSortBy === "date") {
            entries.sort((a, b) => (b.item.added || "").localeCompare(a.item.added || ""));
        } else if (roomsSortBy === "difficulty-asc" || roomsSortBy === "difficulty-desc") {
            const dir = roomsSortBy === "difficulty-asc" ? 1 : -1;
            entries.sort((a, b) => {
                const ai = DIFFICULTY_ORDER.indexOf(a.item.difficulty);
                const bi = DIFFICULTY_ORDER.indexOf(b.item.difficulty);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return (ai - bi) * dir;
            });
        } else {
            entries.sort((a, b) => compareNames(a.item.name, b.item.name));
        }
        return entries;
    }

    function renderList(key) {
        const cfg = COLLECTIONS[key];
        const entries = key === "rooms" ? visibleRoomEntries()
            : key === "events" ? visibleEventEntries()
            : cfg.getAll().map((item, index) => ({ item, index }));
        cfg.listEl.innerHTML = "";

        if (!entries.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = cfg.getAll().length
                ? `No ${cfg.plural.toLowerCase()} match that search.`
                : `No ${cfg.plural.toLowerCase()} yet — add the first one below.`;
            cfg.listEl.appendChild(empty);
            return;
        }

        entries.forEach(({ item, index }) => {
            const title = item[cfg.fieldMap.title] || "(untitled)";
            const subtitle = item[cfg.fieldMap.subtitle] || "";
            // Same fallback chain as the public site: no thumbnail set falls
            // back to the entrance shot, then the first room-by-room
            // gallery image, rather than showing an empty square.
            const thumbSrc = item.thumb || (item.entrance && item.entrance.image) || (item.gallery && item.gallery[0] && item.gallery[0].image) || "";
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row";
            row.innerHTML = `
                <div class="row-thumb">
                    ${thumbSrc ? `<div class="row-thumb-crop"><img class="row-thumb-img" src="${imgCdn(thumbSrc, 160, 160, 65)}" alt="" loading="lazy"></div>` : ""}
                </div>
                <div class="row-info">
                    <h3>${escapeHtml(title)}</h3>
                    <p class="row-creator">${subtitle ? "by " + escapeHtml(subtitle) : ""}</p>
                    <p class="row-desc">${escapeHtml(item.description || "")}</p>
                </div>
                <div class="row-side">
                    <span class="status-badge status-${item.status}">${item.status}</span>
                    <div class="admin-row-actions">
                        <button type="button" class="btn admin-edit-btn">Edit</button>
                        <button type="button" class="btn admin-scan-btn">Scan</button>
                        <button type="button" class="btn admin-delete-btn">Delete</button>
                    </div>
                </div>
            `;
            // By id, not the array index captured here at render time — an
            // edit form left open while a different row gets deleted (or
            // the list otherwise re-orders) would otherwise keep pointing
            // at whatever now sits at that same index instead of the item
            // actually being edited.
            row.querySelector(".admin-edit-btn").addEventListener("click", () => openForm(key, item.id));
            row.querySelector(".admin-delete-btn").addEventListener("click", () => deleteItem(key, item.id));
            row.querySelector(".admin-scan-btn").addEventListener("click", () => scanOneItem(key, item.id));
            const rowImg = row.querySelector(".row-thumb-img");
            if (rowImg) {
                if (rowImg.complete) rowImg.classList.add("is-loaded");
                else rowImg.addEventListener("load", () => rowImg.classList.add("is-loaded"), { once: true });
            }
            cfg.listEl.appendChild(row);
        });
    }

    if (roomsSearchInput) {
        roomsSearchInput.addEventListener("input", e => {
            roomsQuery = e.target.value;
            renderList("rooms");
        });
    }
    if (roomsSortSelect) {
        roomsSortSelect.value = roomsSortBy;
        roomsSortSelect.addEventListener("change", e => {
            roomsSortBy = e.target.value;
            renderList("rooms");
        });
    }
    if (eventsSortSelect) {
        eventsSortSelect.value = eventsSortBy;
        eventsSortSelect.addEventListener("change", e => {
            eventsSortBy = e.target.value;
            renderList("events");
        });
    }

    // Type-to-jump now lives in js/letter-jump.js (loaded site-wide, see
    // admin.html) — it generalizes this same behaviour to every .chrome-list
    // on the page instead of just this one.

    // ---------- form ----------

    function fieldRow(labelText, inputHtml) {
        return `<label class="admin-field"><span>${labelText}</span>${inputHtml}</label>`;
    }

    // Keeps the events form's read-only Status in step with whatever is
    // currently in its four date/time boxes, so it answers the question
    // while the event is still being written rather than only once it has
    // been saved and re-listed. Same derivation the public site uses, off
    // the same module, so what's shown here is what visitors will get.
    function wireDerivedStatus(formEl) {
        const wrap = formEl.querySelector(".admin-derived-status");
        if (!wrap) return;

        const badge = wrap.querySelector(".status-badge");
        const hidden = wrap.querySelector('input[name="status"]');
        const valueOf = name => {
            const field = formEl.querySelector(`[name="${name}"]`);
            return field ? field.value : "";
        };

        function update() {
            const startDate = valueOf("startDate");
            const startTime = valueOf("startTime");
            const endDate = valueOf("endDate");
            const endTime = valueOf("endTime");
            const startIso = startDate && startTime ? `${startDate}T${startTime}:00Z` : "";
            const endIso = endDate && endTime ? `${endDate}T${endTime}:00Z` : "";

            if (!startIso) {
                // Nothing to derive from yet — say so rather than showing a
                // confident status that's really just the default.
                badge.textContent = "Awaiting dates";
                badge.className = "status-badge status-unknown";
                // Left at a sane value regardless: the four date fields are
                // required, so a save can't actually reach here empty.
                hidden.value = "upcoming";
                return;
            }

            const status = EventStatus.fromDates(startIso, endIso, "upcoming");
            badge.textContent = EventStatus.LABELS[status] || status;
            badge.className = `status-badge status-${status}`;
            hidden.value = status;
        }

        ["startDate", "startTime", "endDate", "endTime"].forEach(name => {
            const field = formEl.querySelector(`[name="${name}"]`);
            if (field) field.addEventListener("input", update);
        });

        update();
    }

    function openForm(key, editId) {
        // The sidebar quick-add buttons work from whichever tab is showing,
        // and Edit can be reached the same way — so bring the owning panel
        // up first, or the form would open inside a hidden panel and appear
        // to do nothing at all.
        showPanel(PANEL_FOR_COLLECTION[key] || key);
        const cfg = COLLECTIONS[key];
        const isEdit = editId !== undefined && editId !== null;
        const item = isEdit ? (cfg.getAll().find(i => i.id === editId) || {}) : {};
        const isEvents = key === "events";
        const isRooms = key === "rooms";

        // _galleryDraft/_selectedTags/_entranceOldVersions/_finishOldVersions
        // all get freshly reassigned further down for whichever item is
        // being edited — these 3 "which old-versions panel is expanded"
        // flags don't, so without resetting them here too, opening Edit on
        // item A (expanding its panel), then Edit on item B without hitting
        // Cancel first, carried A's expanded state into B's freshly-loaded
        // form (closeForm already resets these on the way out, but not on
        // the way back in for a direct Edit-to-Edit switch).
        cfg.formEl._expandedOldVersions = null;
        cfg.formEl._entranceOldVersionsExpanded = null;
        cfg.formEl._finishOldVersionsExpanded = null;

        const statusOptionsHtml = cfg.statusOptions.map(([value, label]) =>
            `<option value="${value}" ${item.status === value ? "selected" : ""}>${label}</option>`
        ).join("");

        // Mazes still pick their own status. Events don't get the dropdown:
        // the site works an event's status out from its start/end dates
        // (js/event-status.js), so a control here would only be a second,
        // disagreeing answer that quietly did nothing. It's shown read-only
        // instead — and further down the form, directly under the date
        // fields it's derived from, where it reads as a consequence of them
        // rather than something to fill in.
        const statusFieldHtml = isEvents
            ? ""
            : fieldRow("Status", `<select name="status">${statusOptionsHtml}</select>`);

        // The hidden input keeps `status` in the submitted form data (the
        // save handler reads data.status for both kinds), so the stored
        // field is written in step with what's derived rather than left to
        // drift. wireDerivedStatus keeps both it and the badge current as
        // the dates are edited.
        const derivedStatusFieldHtml = isEvents
            ? `
                <div class="admin-field admin-derived-status">
                    <span>Status</span>
                    <p class="admin-derived-status-value"><span class="status-badge"></span></p>
                    <input type="hidden" name="status" value="${item.status || "upcoming"}">
                    <p class="admin-hint">Set automatically from the dates above: LIVE once the start passes, Past once the end does, Archived after ${EventStatus.ARCHIVE_YEARS} year${EventStatus.ARCHIVE_YEARS === 1 ? "" : "s"}.</p>
                </div>
              `
            : "";

        const difficultyOptionsHtml = DIFFICULTY_OPTIONS.map(([value, label]) =>
            `<option value="${value}" ${(item.difficulty || "") === value ? "selected" : ""}>${label}</option>`
        ).join("");
        const difficultyFieldHtml = isRooms
            ? fieldRow("Difficulty", `<select name="difficulty">${difficultyOptionsHtml}</select>`)
            : "";

        function splitIso(iso) {
            const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso || "");
            return m ? { date: m[1], time: m[2] } : { date: "", time: "" };
        }
        const start = isEvents ? splitIso(item.date) : { date: "", time: "" };
        const end = isEvents ? splitIso(item.endDate) : { date: "", time: "" };

        const openedDate = isRooms ? parseMazeDate(item[cfg.fieldMap.date]) : { day: "", month: "", year: "" };
        const dayOptionsHtml = ["<option value=\"\">—</option>"].concat(
            Array.from({ length: 31 }, (_, i) => {
                const v = String(i + 1).padStart(2, "0");
                return `<option value="${v}" ${openedDate.day === v ? "selected" : ""}>${i + 1}</option>`;
            })
        ).join("");
        const monthOptionsHtml = ["<option value=\"\">Month</option>"].concat(
            MONTH_NAMES.map((name, i) => {
                const v = String(i + 1).padStart(2, "0");
                return `<option value="${v}" ${openedDate.month === v ? "selected" : ""}>${name}</option>`;
            })
        ).join("");

        const dateFieldHtml = isEvents
            ? `
                ${fieldRow("Event start date (UTC)", `<input type="date" name="startDate" required value="${start.date}">`)}
                ${fieldRow("Event start time (UTC, 24-hour)", `<input type="time" name="startTime" required value="${start.time}">`)}
                ${fieldRow("Event end date (UTC)", `<input type="date" name="endDate" required value="${end.date}">`)}
                ${fieldRow("Event end time (UTC, 24-hour)", `<input type="time" name="endTime" required value="${end.time}">`)}
                <p class="admin-hint">All four fields are UTC. The site shows this as-is — it does not convert to a visitor's local timezone.</p>
              `
            : `
                <div class="admin-field admin-date-field">
                    <span>${cfg.dateLabel}</span>
                    <div class="admin-date-parts">
                        <select name="dateDay" aria-label="Day">${dayOptionsHtml}</select>
                        <select name="dateMonth" aria-label="Month">${monthOptionsHtml}</select>
                        <input type="number" name="dateYear" aria-label="Year" placeholder="Year" min="2000" max="2100" value="${openedDate.year}">
                    </div>
                    <p class="admin-hint">Leave Day on "—" if the exact day it opened isn't known — the site will just show the month and year.</p>
                </div>
              `;

        const tagsFieldHtml = isRooms
            ? `
                <div class="admin-field admin-tags-field">
                    <span>Tags</span>
                    <div class="tag-chip-list" id="tag-chip-list"><p class="admin-empty">Loading tags…</p></div>
                    <div class="admin-tag-add">
                        <input type="text" class="admin-tag-new-input" placeholder="Add a new tag...">
                        <button type="button" class="admin-action-pill admin-tag-add-btn">+ Add Tag</button>
                    </div>
                    <p class="admin-tag-status" style="display:none;"></p>
                </div>
              `
            : fieldRow("Tags (comma-separated)", `<input type="text" name="tags" value="${(item.tags || []).join(", ")}">`);

        // Entrance/Finish share this layout: a live preview + label input
        // (identical row markup to a gallery room). The thumb itself is the
        // whole upload/replace target — click or drop a file directly onto
        // it — same pattern as a gallery room's own thumb (see
        // wireGalleryEditor); no separate "choose file, then click Upload"
        // control needed. See wireBookendUpload.
        function bookendSectionHtml(kind, title, hint, entry) {
            const kindLabel = kind === "entrance" ? "Entrance" : "Finish";
            const thumbHtml = entry.image
                ? `<label class="admin-gallery-thumb admin-gallery-thumb-filled" style="background-image:url('${imgCdn(entry.image, 100, 100, 55)}');">
                       <input type="file" class="admin-gallery-thumb-file admin-${kind}-file" accept="image/png,image/jpeg,image/gif,image/webp">
                       <span class="admin-gallery-thumb-replace-text">Replace Image</span>
                   </label>`
                : `<label class="admin-gallery-thumb admin-gallery-thumb-empty">
                       <input type="file" class="admin-gallery-thumb-file admin-${kind}-file" accept="image/png,image/jpeg,image/gif,image/webp">
                       <span class="admin-gallery-thumb-upload-text">Drag or click to upload image</span>
                   </label>`;
            return `
                <div class="admin-field admin-${kind}-field">
                    <span>${title}</span>
                    <p class="admin-hint">${hint}</p>
                    <div class="admin-gallery-row">
                        <div class="admin-gallery-row-top">
                            ${thumbHtml}
                            <input type="text" name="${kind}Label" class="admin-gallery-label" placeholder="Label (e.g. ${kindLabel})" value="${entry.label || kindLabel}">
                        </div>
                        <div class="admin-gallery-actions">
                            <button type="button" class="admin-pill-btn admin-${kind}-oldversions-toggle" title="Add or view older versions of this image">Old Version</button>
                            <button type="button" class="admin-pill-btn admin-pill-danger admin-${kind}-remove" title="Remove" ${entry.image ? "" : "disabled"}>Remove</button>
                        </div>
                        <div class="admin-${kind}-oldversions-container"></div>
                    </div>
                    <input type="hidden" name="${kind}Image" value="${entry.image || ""}">
                    <p class="admin-${kind}-status" style="display:none;"></p>
                </div>
            `;
        }

        // Rooms and events share the exact same gallery mechanism (entrance
        // bookend, ordered image list, finish bookend) and the exact same
        // public-facing viewer — only the wording below adapts per
        // collection so an event's form doesn't talk about "rooms".
        const hasGallery = isRooms || isEvents;
        const galleryItemNoun = isRooms ? "room" : "photo";

        const entrance = item.entrance || {};
        const entranceSectionHtml = hasGallery
            ? bookendSectionHtml("entrance", "<strong>ENTRANCE IMAGE</strong>", "Use for stand-alone entrance rooms; if an entrance is part of the total room-count, add it as room 1", entrance)
            : "";

        const gallerySectionHtml = hasGallery ? `
            <div class="admin-field admin-gallery-field">
                <span>${isRooms ? "<strong>ROOM-BY-ROOM GALLERY</strong>" : "Photo gallery (optional)"}</span>
                <p class="admin-hint">Upload a screenshot for each ${galleryItemNoun}, in order — drag the &#9776; handle or use the arrows to reorder them.${isRooms ? ' A room can be added with just a label and no image yet — the site shows an "Awaiting Room Image" placeholder until you edit one in.' : ""} Select several files at once to add them all in one go, sorted by file name — the label field below only applies when adding a single image.</p>
                <div class="admin-gallery-list"></div>
                <div class="admin-gallery-add">
                    <input type="text" class="admin-gallery-new-label" placeholder="${isRooms ? "Room label (e.g. Room 12)" : "Photo label"}">
                    <input type="file" class="admin-gallery-new-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple>
                    <button type="button" class="admin-action-pill admin-gallery-add-btn">+ Add ${isRooms ? "Room" : "Photo"} Image</button>
                </div>
                <p class="admin-gallery-status" style="display:none;"></p>
            </div>
        ` : "";

        // Only rendered once a scan has recorded something against this
        // maze; there is nothing to correct before that.
        const furniSectionHtml = Object.keys(item.furni || {}).length ? `
            <div class="admin-field admin-furni-field">
                <span>Furni found in these rooms</span>
                <p class="admin-hint">What the scan detected in each room image. Hide keeps a detection in the record but stops the site showing it &mdash; better than Remove for a false positive, since a rescan would find it again either way.</p>
                <div class="admin-furni-list"></div>
            </div>
        ` : "";

        // Shown for both mazes and events. These don't join the gallery
        // sequence — each one gets a photo-wall icon on the corner of the
        // gallery viewport on the public site, opening a draggable photo
        // frame with the picture and the name given here.
        const relatedSectionHtml = `
            <div class="admin-field admin-related-field">
                <span>Related images (optional)</span>
                <p class="admin-hint">Extra pictures attached to this ${cfg.singular.toLowerCase()} — press cuttings, posters, before-and-afters. Each one appears as a small photo icon on the bottom-right of the image viewer, opening a draggable photo frame with its name underneath. Drop images here (several at once is fine) and they upload straight away; name each one in the row it adds. Drag the &#9776; handle or use the arrows to reorder them — that order is the order their icons appear in, left to right.</p>
                <div class="admin-related-list"></div>
                <input type="file" class="admin-related-new-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple>
                <p class="admin-related-status" style="display:none;"></p>
            </div>
        `;

        const finish = item.finish || {};
        const finishSectionHtml = hasGallery
            ? bookendSectionHtml("finish", "Finish image (optional)", `Always shown last in the gallery, after every other image — use it for the ${cfg.singular.toLowerCase()}'s finish or closing screenshot.`, finish)
            : "";


        cfg.formEl.innerHTML = `
            <h3 class="admin-form-title">${isEdit ? "Edit " + cfg.singular : "Add a New " + cfg.singular}</h3>
            ${fieldRow(cfg.titleLabel, `<input type="text" name="title" required value="${item[cfg.fieldMap.title] || ""}">`)}
            ${fieldRow(cfg.subtitleLabel, `<input type="text" name="subtitle" value="${item[cfg.fieldMap.subtitle] || ""}">`)}
            ${statusFieldHtml}
            ${difficultyFieldHtml}
            ${fieldRow("Hotel", `<select name="hotel">${HOTEL_OPTIONS.map(([value, label]) =>
                // An existing maze whose stored hotel is not in the list
                // (older free-text entries) would otherwise silently show as
                // the first option and get rewritten to it on the next save,
                // so its own value is carried as an extra selected option.
                `<option value="${value}" ${(item.hotel || "") === value ? "selected" : ""}>${label}</option>`
            ).join("")}${HOTEL_OPTIONS.some(([value]) => value === (item.hotel || "")) ? "" :
                `<option value="${item.hotel}" selected>${item.hotel} (unrecognised)</option>`}</select>`)}
            ${dateFieldHtml}
            ${derivedStatusFieldHtml}
            ${tagsFieldHtml}
            ${fieldRow("Thumbnail image", `
                <div class="admin-thumb-upload">
                    <input type="text" name="thumb" value="${item.thumb || ""}" placeholder="assets/... or https://...">
                    <input type="file" class="admin-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp">
                    <span class="admin-thumb-status"></span>
                </div>
            `)}
            ${fieldRow("Short description (shown on the card)", `<textarea name="description" rows="2">${item.description || ""}</textarea>`)}
            ${fieldRow("Full details (shown in the popup, optional)", `<textarea name="details" rows="4">${item.details || ""}</textarea>`)}
            ${fieldRow("Links &amp; References (optional, shown directly beneath the description)", `<textarea name="linksReferences" rows="3">${item.linksReferences || ""}</textarea>`)}
            ${fieldRow("Habbo link (optional)", `<input type="text" name="habboLink" value="${item.habboLink || ""}" placeholder="https://...">`)}
            ${entranceSectionHtml}
            ${gallerySectionHtml}
            ${finishSectionHtml}
            ${relatedSectionHtml}
            ${furniSectionHtml}
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>
        `;

        cfg.formEl.dataset.editId = isEdit ? editId : "";
        cfg.formEl.style.display = "flex";
        cfg.addBtn.style.display = "none";
        cfg.formEl.querySelector(".admin-cancel-btn").addEventListener("click", () => closeForm(key));

        // Every upload made while this form is open (thumbnail, room images)
        // is namespaced under this prefix — the real room id once saved, or
        // a throwaway draft id for a maze that doesn't exist yet. Either way
        // the resulting image URL is stored directly in the field, so it
        // doesn't matter that the prefix isn't the "final" id.
        const uploadPrefix = item.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        wireThumbUpload(cfg.formEl, uploadPrefix);
        if (isEvents) wireDerivedStatus(cfg.formEl);
        cfg.formEl._relatedDraft = (item.relatedImages || []).map(normalizeRelatedEntry);
        wireRelatedEditor(cfg.formEl, uploadPrefix);
        wireFurniEditor(cfg.formEl, item);
        if (hasGallery) {
            wireBookendUpload(cfg.formEl, "entrance", uploadPrefix);
            wireBookendUpload(cfg.formEl, "finish", uploadPrefix);
            cfg.formEl._entranceOldVersions = ((item.entrance && item.entrance.oldVersions) || []).map(normalizeOldVersionEntry);
            cfg.formEl._finishOldVersions = ((item.finish && item.finish.oldVersions) || []).map(normalizeOldVersionEntry);
            wireBookendOldVersions(cfg.formEl, "entrance", uploadPrefix);
            wireBookendOldVersions(cfg.formEl, "finish", uploadPrefix);
            cfg.formEl._galleryDraft = (item.gallery || []).map(normalizeGalleryEntry);
            wireGalleryEditor(cfg.formEl, uploadPrefix, isRooms);
        }
        if (isRooms) {
            cfg.formEl._selectedTags = new Set((item.tags || []).map(t => t.trim()).filter(Boolean));
            wireTagPicker(cfg.formEl);
        }

        cfg.formEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

        activeFormKey = key;
        floatingActionsEl.classList.add("open");
    }

    function closeForm(key) {
        const cfg = COLLECTIONS[key];
        cfg.formEl.style.display = "none";
        cfg.formEl.innerHTML = "";
        cfg.formEl._galleryDraft = null;
        cfg.formEl._relatedDraft = null;
        cfg.formEl._furniDraft = null;
        cfg.formEl._selectedTags = null;
        cfg.formEl._expandedOldVersions = null;
        cfg.formEl._entranceOldVersions = null;
        cfg.formEl._finishOldVersions = null;
        cfg.formEl._entranceOldVersionsExpanded = null;
        cfg.formEl._finishOldVersionsExpanded = null;
        cfg.addBtn.style.display = "inline-block";

        if (activeFormKey === key) {
            activeFormKey = null;
            floatingActionsEl.classList.remove("open");
        }
    }

    // Renders the shared tag vocabulary (plus any tags already on this room
    // that aren't in it yet, so nothing gets silently dropped) as clickable
    // chips, and wires up adding a brand new tag to the shared list.
    async function wireTagPicker(formEl) {
        const listEl = formEl.querySelector("#tag-chip-list");
        const newInput = formEl.querySelector(".admin-tag-new-input");
        const addBtn = formEl.querySelector(".admin-tag-add-btn");
        const status = formEl.querySelector(".admin-tag-status");

        let tagPool = [];
        try {
            tagPool = await Api.getTags();
        } catch (e) {
            tagPool = [];
        }

        function renderChips() {
            const selected = formEl._selectedTags;
            const allTags = Array.from(new Set([...tagPool, ...selected]));
            listEl.innerHTML = allTags.map(tag => `
                <button type="button" class="tag-chip${selected.has(tag) ? " selected" : ""}" data-tag="${tag}">${tag}</button>
            `).join("");
            listEl.querySelectorAll(".tag-chip").forEach(chip => {
                chip.addEventListener("click", () => {
                    const tag = chip.dataset.tag;
                    if (selected.has(tag)) selected.delete(tag);
                    else selected.add(tag);
                    renderChips();
                });
            });
        }

        async function addNewTag() {
            const label = newInput.value.trim();
            if (!label) return;
            addBtn.disabled = true;
            status.style.display = "none";
            try {
                const result = await Api.createTag(adminToken, label);
                if (!tagPool.some(t => t.toLowerCase() === result.label.toLowerCase())) {
                    tagPool.push(result.label);
                }
                formEl._selectedTags.add(result.label);
                newInput.value = "";
                renderChips();
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Couldn't add that tag.";
                status.style.display = "block";
            } finally {
                addBtn.disabled = false;
            }
        }

        addBtn.addEventListener("click", addNewTag);
        newInput.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); addNewTag(); }
        });

        renderChips();
    }

    async function submitForm(key, e) {
        e.preventDefault();
        const cfg = COLLECTIONS[key];
        const form = cfg.formEl;
        const data = Object.fromEntries(new FormData(form).entries());
        const items = cfg.getAll();
        const editId = form.dataset.editId || null;
        const existing = editId !== null ? (items.find(i => i.id === editId) || {}) : {};

        const payload = {
            ...existing,
            status: data.status,
            hotel: data.hotel,
            tags: key === "rooms"
                ? Array.from(form._selectedTags || [])
                : (data.tags || "").split(",").map(t => t.trim()).filter(Boolean),
            thumb: data.thumb,
            description: data.description,
            details: data.details,
            habboLink: data.habboLink
        };
        payload[cfg.fieldMap.title] = data.title;
        payload[cfg.fieldMap.subtitle] = data.subtitle;

        if (key === "events") {
            payload.date = data.startDate && data.startTime ? `${data.startDate}T${data.startTime}:00Z` : "";
            payload.endDate = data.endDate && data.endTime ? `${data.endDate}T${data.endTime}:00Z` : "";
        } else {
            // Day is optional — a maze whose exact opening day isn't known
            // saves as "YYYY-MM" instead of guessing a day, and
            // js/home.js's formatMazeDate shows that as just "Month Year".
            const year = (data.dateYear || "").trim();
            const month = data.dateMonth || "";
            const day = data.dateDay || "";
            payload[cfg.fieldMap.date] = year && month ? `${year.padStart(4, "0")}-${month}${day ? `-${day}` : ""}` : "";
        }

        if (key === "rooms") {
            payload.difficulty = data.difficulty || "";
        }
        payload.linksReferences = data.linksReferences || "";

        // Rooms and events both get the gallery/entrance/finish fields —
        // same mechanism, same fields, just optional for events too.
        payload.gallery = form._galleryDraft || [];
        // Dropped if an upload left a row without an image — a related
        // image with nothing to show has no meaning on the public side.
        payload.relatedImages = (form._relatedDraft || []).filter(r => r.image);
        // Only written when the form actually rendered the furni editor —
        // otherwise saving a maze that has never been scanned would write
        // an empty object over results a scan added in the meantime.
        if (form._furniDraft) payload.furni = form._furniDraft;
        const entranceImage = (data.entranceImage || "").trim();
        payload.entrance = entranceImage ? { image: entranceImage, label: (data.entranceLabel || "").trim() || "Entrance", oldVersions: form._entranceOldVersions || [] } : null;
        const finishImage = (data.finishImage || "").trim();
        payload.finish = finishImage ? { image: finishImage, label: (data.finishLabel || "").trim() || "Finish", oldVersions: form._finishOldVersions || [] } : null;

        const submitBtn = form.querySelector("button[type=submit]");
        const errorEl = form.querySelector(".admin-form-error");

        if (key === "events" && payload.date && payload.endDate && payload.endDate <= payload.date) {
            errorEl.textContent = "The event's end must be after its start.";
            errorEl.style.display = "block";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";

        try {
            if (editId !== null) {
                const updated = await cfg.update(payload);
                // Looked up fresh rather than reusing an index captured
                // before this await — the list could have changed (another
                // item added/removed/reordered) while this save was in
                // flight. Falls back to pushing it on if the original item
                // is somehow gone by now, so the save is never silently lost.
                const idx = items.findIndex(i => i.id === updated.id);
                if (idx !== -1) items[idx] = updated;
                else items.push(updated);
            } else {
                const created = await cfg.create(payload);
                items.push(created);
            }
            closeForm(key);
            renderList(key);
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            errorEl.textContent = err.message || "Something went wrong saving this.";
            errorEl.style.display = "block";
            submitBtn.disabled = false;
            submitBtn.textContent = "Save";
        }
    }

    async function deleteItem(key, id) {
        const cfg = COLLECTIONS[key];
        const items = cfg.getAll();
        const item = items.find(i => i.id === id);
        if (!item) return; // already gone (e.g. deleted from another click before this one's confirm dialog closed)
        const title = item[cfg.fieldMap.title] || "this entry";
        if (!confirm(`Delete "${title}"? This is permanent and affects the live site immediately.`)) return;
        try {
            await cfg.remove(item.id);
            // Re-found rather than reusing an index from before this await —
            // the list could have changed while the confirm dialog was open
            // or the request was in flight.
            const idx = items.findIndex(i => i.id === id);
            if (idx !== -1) items.splice(idx, 1);
            renderList(key);
            cleanupItemImages(item);
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            alert(err.message || "Couldn't delete that — try again.");
        }
    }

    // ---------- admin accounts ----------

    async function loadAdmins() {
        try {
            workingAdmins = await Api.getAdmins(adminToken);
            renderAdminsList();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
        }
    }

    function renderAdminsList() {
        adminsListEl.innerHTML = "";
        if (!workingAdmins.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "No admin accounts found.";
            adminsListEl.appendChild(empty);
            return;
        }
        const canDelete = currentUserRole === "owner";
        workingAdmins.forEach(admin => {
            const isSelf = admin.username === currentUsername;
            const role = admin.role || "admin";
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row admin-account-row";
            row.innerHTML = `
                <div class="row-info">
                    <h3>${escapeHtml(admin.username)}${isSelf ? ' <span class="admin-you-tag">(you)</span>' : ""}</h3>
                    <p class="row-creator">${role === "owner" ? "Owner" : "Admin"} · ${admin.createdAt ? "Added " + admin.createdAt.slice(0, 10) : ""}</p>
                </div>
                <div class="admin-row-actions">
                    ${(isSelf || canDelete) ? `<button type="button" class="btn admin-reset-btn">Reset Password</button>` : ""}
                    ${canDelete ? `<button type="button" class="btn admin-delete-btn" ${workingAdmins.length <= 1 ? "disabled" : ""}>Delete</button>` : ""}
                </div>
            `;
            // Only an owner can reset someone else's password (also enforced
            // server-side, see netlify/functions/auth.js's PUT handler) — a
            // standard admin only ever sees this button on their own row.
            const resetBtn = row.querySelector(".admin-reset-btn");
            if (resetBtn) resetBtn.addEventListener("click", () => openResetForm(admin.username));
            const deleteBtn = row.querySelector(".admin-delete-btn");
            if (deleteBtn) deleteBtn.addEventListener("click", () => deleteAdmin(admin.username));
            adminsListEl.appendChild(row);
        });
    }

    function openCreateAdminForm() {
        // Only an owner can grant owner privileges (also enforced server-side) —
        // everyone else just creates standard admins, no selector shown.
        const roleFieldHtml = currentUserRole === "owner"
            ? fieldRow("Privileges", `
                <select name="role">
                    <option value="admin">Standard Admin</option>
                    <option value="owner">Owner (can delete other admins)</option>
                </select>
              `)
            : "";

        adminsFormEl.innerHTML = `
            <h3 class="admin-form-title">Add a New Admin</h3>
            ${fieldRow("Username", `<input type="text" name="username" required autocomplete="off">`)}
            ${fieldRow("Password (8+ characters)", `<input type="password" name="password" required minlength="8" autocomplete="new-password">`)}
            ${fieldRow("Confirm password", `<input type="password" name="confirm" required minlength="8" autocomplete="new-password">`)}
            ${roleFieldHtml}
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>
        `;
        adminsFormEl.dataset.mode = "create";
        adminsFormEl.dataset.username = "";
        openAdminsForm();
    }

    function openResetForm(username) {
        adminsFormEl.innerHTML = `
            <h3 class="admin-form-title">Reset Password — ${username}</h3>
            ${fieldRow("New password (8+ characters)", `<input type="password" name="password" required minlength="8" autocomplete="new-password">`)}
            ${fieldRow("Confirm new password", `<input type="password" name="confirm" required minlength="8" autocomplete="new-password">`)}
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>
        `;
        adminsFormEl.dataset.mode = "reset";
        adminsFormEl.dataset.username = username;
        openAdminsForm();
    }

    function openAdminsForm() {
        adminsFormEl.style.display = "flex";
        adminsAddBtn.style.display = "none";
        adminsFormEl.querySelector(".admin-cancel-btn").addEventListener("click", closeAdminsForm);
        adminsFormEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function closeAdminsForm() {
        adminsFormEl.style.display = "none";
        adminsFormEl.innerHTML = "";
        adminsAddBtn.style.display = "inline-block";
    }

    adminsFormEl.addEventListener("submit", async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(adminsFormEl).entries());
        const errorEl = adminsFormEl.querySelector(".admin-form-error");
        const submitBtn = adminsFormEl.querySelector("button[type=submit]");

        if (data.password !== data.confirm) {
            errorEl.textContent = "Passwords don't match.";
            errorEl.style.display = "block";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";
        try {
            if (adminsFormEl.dataset.mode === "create") {
                await Api.createAdmin(adminToken, data.username.trim(), data.password, data.role);
            } else {
                await Api.resetAdminPassword(adminToken, adminsFormEl.dataset.username, data.password);
            }
            closeAdminsForm();
            await loadAdmins();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            errorEl.textContent = err.message || "Something went wrong saving this.";
            errorEl.style.display = "block";
            submitBtn.disabled = false;
            submitBtn.textContent = "Save";
        }
    });

    async function deleteAdmin(username) {
        if (!confirm(`Delete admin account "${username}"? They'll no longer be able to log in.`)) return;
        try {
            await Api.deleteAdmin(adminToken, username);
            await loadAdmins();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            alert(err.message || "Couldn't delete that account.");
        }
    }

    // ---------- console: contributors ----------

    // Same 5 options js/home.js's console modal renders on its People page —
    // kept in sync manually, same pattern as DIFFICULTY_ORDER elsewhere.
    const CONTRIBUTION_TYPES = ["Room Images", "Event Images", "Collab Images", "Historical Data", "Web Development"];

    async function loadContributors() {
        workingContributors = await Api.getContributors();
        renderContributorsList();
    }

    function renderContributorsList() {
        contributorsListEl.innerHTML = "";
        if (!workingContributors.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "No contributors added yet.";
            contributorsListEl.appendChild(empty);
            return;
        }
        workingContributors.forEach((contributor, index) => {
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row";
            row.innerHTML = `
                <div class="row-info">
                    <h3>${escapeHtml(contributor.username)} <span class="admin-contributor-count">- ${escapeHtml(contributor.count || 0)}</span></h3>
                    <p class="row-creator">${escapeHtml((contributor.types || []).join(", "))}</p>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="btn admin-edit-btn">Edit</button>
                    <button type="button" class="btn admin-delete-btn">Delete</button>
                </div>
            `;
            row.querySelector(".admin-edit-btn").addEventListener("click", () => openContributorForm(index));
            row.querySelector(".admin-delete-btn").addEventListener("click", () => deleteContributor(contributor.id));
            contributorsListEl.appendChild(row);
        });
    }

    function openContributorForm(editIndex) {
        const isEdit = editIndex !== undefined && editIndex !== null;
        const contributor = isEdit ? workingContributors[editIndex] : {};
        const existingTypes = contributor.types || [];

        const typesHtml = CONTRIBUTION_TYPES.map(type => `
            <label class="admin-checkbox-option">
                <input type="checkbox" name="types" value="${type}" ${existingTypes.includes(type) ? "checked" : ""}>
                <span>${type}</span>
            </label>
        `).join("");

        contributorsFormEl.innerHTML = `
            <h3 class="admin-form-title">${isEdit ? "Edit Contributor" : "Add a New Contributor"}</h3>
            ${fieldRow("Username (Habbo)", `<input type="text" name="username" value="${contributor.username || ""}" required autocomplete="off">`)}
            ${fieldRow("Number of contributions", `<input type="number" name="count" min="0" step="1" value="${contributor.count || 0}" required>`)}
            <label class="admin-field">
                <span>Contribution type(s)</span>
                <div class="admin-checkbox-group">${typesHtml}</div>
            </label>
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>
        `;
        contributorsFormEl.dataset.id = isEdit ? contributor.id : "";
        openContributorsForm();
    }

    function openContributorsForm() {
        contributorsFormEl.style.display = "flex";
        contributorsAddBtn.style.display = "none";
        contributorsFormEl.querySelector(".admin-cancel-btn").addEventListener("click", closeContributorsForm);
        contributorsFormEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function closeContributorsForm() {
        contributorsFormEl.style.display = "none";
        contributorsFormEl.innerHTML = "";
        contributorsAddBtn.style.display = "inline-block";
    }

    contributorsFormEl.addEventListener("submit", async e => {
        e.preventDefault();
        const formData = new FormData(contributorsFormEl);
        const username = (formData.get("username") || "").trim();
        const count = parseInt(formData.get("count"), 10) || 0;
        const types = formData.getAll("types");
        const errorEl = contributorsFormEl.querySelector(".admin-form-error");
        const submitBtn = contributorsFormEl.querySelector("button[type=submit]");

        if (!username) {
            errorEl.textContent = "A username is required.";
            errorEl.style.display = "block";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";
        try {
            const id = contributorsFormEl.dataset.id;
            if (id) {
                await Api.updateContributor(adminToken, { id, username, count, types });
            } else {
                await Api.createContributor(adminToken, { username, count, types });
            }
            closeContributorsForm();
            await loadContributors();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            errorEl.textContent = err.message || "Something went wrong saving this.";
            errorEl.style.display = "block";
            submitBtn.disabled = false;
            submitBtn.textContent = "Save";
        }
    });

    async function deleteContributor(id) {
        if (!confirm("Delete this contributor?")) return;
        try {
            await Api.deleteContributor(adminToken, id);
            await loadContributors();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            alert(err.message || "Couldn't delete that — try again.");
        }
    }

    contributorsAddBtn.addEventListener("click", () => openContributorForm());

    // ---------- console: about text ----------

    async function loadAboutText() {
        try {
            const { aboutText } = await Api.getSiteSettings();
            aboutTextInput.value = aboutText || "";
        } catch (e) {
            // best-effort — the field just stays empty
        }
    }

    aboutSaveBtn.addEventListener("click", async () => {
        aboutSaveBtn.disabled = true;
        aboutSaveBtn.textContent = "Saving…";
        aboutSaveStatus.style.display = "none";
        try {
            await Api.updateSiteSettings(adminToken, { aboutText: aboutTextInput.value });
            aboutSaveStatus.textContent = "Saved.";
            aboutSaveStatus.style.display = "block";
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            aboutSaveStatus.textContent = err.message || "Couldn't save the About text.";
            aboutSaveStatus.style.display = "block";
        } finally {
            aboutSaveBtn.disabled = false;
            aboutSaveBtn.textContent = "Save About Text";
        }
    });

    // ---------- console: contact messages ----------

    async function loadContactMessages() {
        try {
            workingContactMessages = await Api.getContactMessages(adminToken);
            renderContactMessagesList();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
        }
    }

    function renderContactMessagesList() {
        contactMessagesListEl.innerHTML = "";
        if (!workingContactMessages.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "No messages yet.";
            contactMessagesListEl.appendChild(empty);
            return;
        }
        workingContactMessages.forEach(msg => {
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row";

            const info = document.createElement("div");
            info.className = "row-info";

            const heading = document.createElement("h3");
            // Built with real DOM nodes rather than innerHTML — unlike
            // contributors (admin-entered), this text comes straight from
            // anonymous public visitors, so it can't be trusted not to
            // contain markup.
            heading.appendChild(document.createTextNode(msg.username || "Anonymous"));
            const when = document.createElement("span");
            when.className = "admin-contributor-count";
            when.textContent = ` - ${new Date(msg.createdAt).toLocaleString()}`;
            heading.appendChild(when);
            if (msg.discord) {
                const discordTag = document.createElement("span");
                discordTag.className = "admin-contributor-count";
                discordTag.textContent = ` · Discord: ${msg.discord}`;
                heading.appendChild(discordTag);
            }

            const body = document.createElement("p");
            body.className = "row-creator";
            body.textContent = msg.message;

            info.appendChild(heading);
            info.appendChild(body);

            const actions = document.createElement("div");
            actions.className = "admin-row-actions";
            actions.innerHTML = '<button type="button" class="btn admin-delete-btn">Delete</button>';
            actions.querySelector(".admin-delete-btn").addEventListener("click", () => deleteContactMessage(msg.id));

            // Ban/unban the address this message came from. Messages
            // predating IP logging (and any submitted while Netlify did not
            // supply the header — see clientIp in contact.js) have no address
            // to act on, so they get no button rather than a dead one.
            if (msg.ip) {
                const banned = isBanned(msg.ip);
                const banBtn = document.createElement("button");
                banBtn.type = "button";
                banBtn.className = "btn admin-ban-btn";
                banBtn.textContent = banned ? "Unban IP" : "Ban IP";
                banBtn.title = msg.ip;
                banBtn.addEventListener("click", () => (banned ? unbanIp(msg.ip) : banIp(msg.ip)));
                actions.insertBefore(banBtn, actions.firstChild);
            }

            row.appendChild(info);
            row.appendChild(actions);
            contactMessagesListEl.appendChild(row);
        });
    }

    async function deleteContactMessage(id) {
        if (!confirm("Delete this message?")) return;
        try {
            await Api.deleteContactMessage(adminToken, id);
            await loadContactMessages();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            alert(err.message || "Couldn't delete that — try again.");
        }
    }

    // ---------- landing page state ----------

    // Mirrors the Dev Mode pill in home.html's own pre-load gate (shown
    // there while a logged-in admin roams during Coming Soon/Maintenance)
    // — same pill here in the admin header, plus a link back to home.html
    // so getting to the gated public site is one click either
    // direction. Idempotent (clears any pill it previously added first) so
    // it can just be re-called on every state check/change instead of
    // needing to track whether it's already showing.
    function renderDevModeLink(landingState) {
        const brandGroup = document.querySelector(".brand-group");
        if (!brandGroup) return;
        brandGroup.querySelectorAll(".header-state-pill").forEach(el => el.remove());
        if (landingState === "enter") return;

        const pill = document.createElement("span");
        pill.className = "header-badge header-state-pill";
        pill.textContent = "Dev Mode";

        const homeLink = document.createElement("a");
        homeLink.className = "header-badge header-state-pill header-state-link";
        homeLink.href = "home.html";
        homeLink.textContent = "Home";

        brandGroup.appendChild(pill);
        brandGroup.appendChild(homeLink);
    }

    async function loadLandingState() {
        try {
            const { landingState } = await Api.getSiteSettings();
            landingToggleBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.state === landingState));
            renderDevModeLink(landingState);
        } catch (e) {
            // best-effort — the toggle just won't show anything highlighted
        }
    }

    // Returns whether the update actually went through, so callers that
    // show a follow-up success message (see the offline-confirmation flow
    // below) know not to show one after a failed save.
    async function setLandingState(state, clickedBtn) {
        landingToggleBtns.forEach(b => b.disabled = true);
        landingToggleStatus.style.display = "none";
        try {
            await Api.updateSiteSettings(adminToken, { landingState: state });
            landingToggleBtns.forEach(b => b.classList.toggle("active", b === clickedBtn));
            renderDevModeLink(state);
            return true;
        } catch (err) {
            if (err.status === 401) { lockOut(); return false; }
            landingToggleStatus.textContent = err.message || "Couldn't update the landing page.";
            landingToggleStatus.style.display = "block";
            return false;
        } finally {
            landingToggleBtns.forEach(b => b.disabled = false);
        }
    }

    // Coming Soon / Maintenance take the live site offline for every
    // visitor, so they get a two-step "are you sure" before actually
    // switching. Enter (Live) only needs one — it's the safe/undo
    // direction, but still worth a single check since it re-opens the site.
    // Each ends with a confirmation once the switch has actually happened.
    const LANDING_STATE_MESSAGES = {
        "coming-soon": {
            confirmSteps: ["You're about to take Maze Rats offline! Are you sure?", "Sure you're sure?"],
            success: "Coming soon mode activated. Website closed to visitors."
        },
        "maintenance": {
            confirmSteps: ["You're about to take Maze Rats offline! Are you sure?", "Sure you're sure?"],
            success: "Maintenance mode activated. Website closed to visitors."
        },
        "enter": {
            confirmSteps: ["You're about to bring Maze Rats back online! Are you sure?"],
            success: "Live mode activated. Website open to visitors."
        }
    };

    landingToggleBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
            const state = btn.dataset.state;
            const config = LANDING_STATE_MESSAGES[state];
            if (!config) {
                setLandingState(state, btn);
                return;
            }
            for (const message of config.confirmSteps) {
                const ok = await showConfirmDialog(message);
                if (!ok) return;
            }
            const succeeded = await setLandingState(state, btn);
            if (succeeded) await showInfoDialog(config.success);
        });
    });

    // ---------- wire up ----------

    logoutBtn.addEventListener("click", doLogout);

    // The scan runs as a background job, so nothing comes back on the
    // request that starts it — progress is polled from furni-scan-status
    // and drawn into the bar until the run reports itself finished.
    let furniPollTimer = null;
    // Polls that came back with nothing at all, in a row. A background
    // function takes a few seconds to cold-start and write its first
    // progress record, during which the status endpoint honestly reports
    // nothing running — so give it a window before concluding there is no
    // job, rather than stopping on the first empty answer.
    let furniEmptyPolls = 0;
    const FURNI_EMPTY_POLL_LIMIT = 48; // ~2 minutes at 2.5s

    function renderFurniProgress(p) {
        furniProgress.hidden = false;
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        furniProgressFill.style.width = pct + "%";
        if (p.current && !p.total) {
            // Still setting up — the catalogue and sprite library load
            // before there is any denominator to show.
            furniProgressLabel.textContent = p.current;
        } else {
            const name = p.current ? String(p.current).split("/").pop() : "";
            furniProgressLabel.textContent = p.done + " of " + p.total + " room images (" + pct + "%)" +
                (name ? " — " + name : "") + (p.errors ? " · " + p.errors + " failed" : "");
        }
    }

    async function pollFurniProgress() {
        try {
            const p = await Api.furniScanStatus(adminToken);
            if (!p || (!p.running && !p.total)) {
                if (++furniEmptyPolls >= FURNI_EMPTY_POLL_LIMIT) {
                    stopFurniPolling();
                    furniScanStatus.style.display = "block";
                    furniScanStatus.textContent = "No scan reported in after two minutes. " +
                        "Check the furni-scan-background function log in Netlify — background " +
                        "functions need a paid plan, and 404 there is the usual cause.";
                    furniProgress.hidden = true;
                }
                return;
            }
            furniEmptyPolls = 0;
            renderFurniProgress(p);
            if (!p.running) {
                stopFurniPolling();
                furniScanStatus.style.display = "block";
                if (p.error) {
                    // The run recorded a failure rather than finishing — say
                    // so, instead of reporting a crash as a completed scan.
                    furniProgress.hidden = true;
                    furniScanStatus.textContent = "Scan failed: " + p.error;
                } else {
                    furniScanStatus.textContent = "Scan finished — " + p.done + " room images" +
                        (p.errors ? ", " + p.errors + " failed" : "") + ". Reopen a maze to see what it found.";
                }
            }
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            stopFurniPolling();
        }
    }

    function startFurniPolling() {
        clearInterval(furniPollTimer);
        furniEmptyPolls = 0;
        pollFurniProgress();
        furniPollTimer = setInterval(pollFurniProgress, 2500);
    }

    function stopFurniPolling() {
        clearInterval(furniPollTimer);
        furniPollTimer = null;
    }

    function roomsWithImages() {
        return workingRooms.filter(r => (r.gallery || []).length || (r.entrance && r.entrance.image));
    }

    function countImages(rooms, onlyUnscanned) {
        return rooms.reduce((n, r) => {
            const imgs = [
                ...(r.entrance && r.entrance.image ? [r.entrance.image] : []),
                ...(r.gallery || []).map(g => g.image).filter(Boolean)
            ];
            const already = r.furni || {};
            return n + (onlyUnscanned ? imgs.filter(i => !already[i]).length : imgs.length);
        }, 0);
    }

    // Both buttons run the same job; they differ only in whether images that
    // already carry a result are skipped. Confirmed either way — it is long,
    // and the full version replaces what previous runs recorded.
    async function startFurniScan(onlyUnscanned) {
        const rooms = roomsWithImages();
        const images = countImages(rooms, onlyUnscanned);
        if (!images) {
            furniScanStatus.style.display = "block";
            furniScanStatus.textContent = onlyUnscanned
                ? "Every room image has already been scanned."
                : "No mazes have room images to scan yet.";
            return;
        }
        const ok = await showConfirmDialog(onlyUnscanned
            ? "Scan " + images + " room images that have no furni recorded yet? This runs in the background."
            : "Scan all " + rooms.length + " mazes (" + images + " room images) for furni? " +
              "This runs in the background and replaces any furni already recorded against them.");
        if (!ok) return;
        furniScanStatus.style.display = "none";
        furniProgress.hidden = false;
        furniProgressFill.style.width = "0%";
        furniProgressLabel.textContent = "Starting…";
        try {
            await Api.scanFurni(adminToken, {
                collection: "rooms",
                ids: rooms.map(r => r.id),
                onlyUnscanned
            });
            startFurniPolling();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            furniProgress.hidden = true;
            furniScanStatus.style.display = "block";
            furniScanStatus.textContent = err.message || "Couldn't start the scan.";
        }
    }

    // Scans one maze/event on its own. Same background job and the same
    // progress bar as the full scan — it just hands it a single id, which is
    // how you try this on one maze without committing to every image on the
    // site.
    async function scanOneItem(key, id) {
        const collection = key === "events" ? "events" : "rooms";
        const item = COLLECTIONS[key].getAll().find(i => i.id === id);
        if (!item) return;
        const imgs = [
            ...(item.entrance && item.entrance.image ? [item.entrance.image] : []),
            ...(item.gallery || []).map(g => g.image).filter(Boolean),
            ...(item.finish && item.finish.image ? [item.finish.image] : [])
        ];
        const title = item[COLLECTIONS[key].fieldMap.title] || "this one";
        if (!imgs.length) {
            furniScanStatus.style.display = "block";
            furniScanStatus.textContent = "\u201c" + title + "\u201d has no room images to scan.";
            return;
        }
        const already = Object.keys(item.furni || {}).length;
        const ok = await showConfirmDialog(
            "Scan \u201c" + title + "\u201d for furni? " + imgs.length + " room image" +
            (imgs.length === 1 ? "" : "s") + ", roughly " + Math.ceil(imgs.length * 20 / 60) +
            " minute" + (Math.ceil(imgs.length * 20 / 60) === 1 ? "" : "s") + "." +
            (already ? " This replaces the furni already recorded against it." : ""));
        if (!ok) return;
        furniScanStatus.style.display = "none";
        furniProgress.hidden = false;
        furniProgressFill.style.width = "0%";
        furniProgressLabel.textContent = "Starting \u201c" + title + "\u201d\u2026";
        try {
            await Api.scanFurni(adminToken, { collection, ids: [id] });
            startFurniPolling();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            furniProgress.hidden = true;
            furniScanStatus.style.display = "block";
            furniScanStatus.textContent = err.message || "Couldn't start the scan.";
        }
    }

    if (furniScanAllBtn) furniScanAllBtn.addEventListener("click", () => startFurniScan(false));
    if (furniScanNewBtn) furniScanNewBtn.addEventListener("click", () => startFurniScan(true));

    // Picks a scan back up if the admin page is reloaded while one is still
    // going — otherwise the bar would vanish and it would look stalled.
    if (furniScanAllBtn) startFurniPolling();

    adminsAddBtn.addEventListener("click", openCreateAdminForm);

    Object.keys(COLLECTIONS).forEach(key => {
        const cfg = COLLECTIONS[key];
        cfg.addBtn.addEventListener("click", () => openForm(key));
        cfg.formEl.addEventListener("submit", e => submitForm(key, e));
    });

    // Sidebar shortcuts to the same two forms — openForm's own
    // scrollIntoView already brings the form into view within .admin-main's
    // internal scroll, so these just save hunting down the page for them.
    const sidebarAddRoomBtn = document.getElementById("sidebar-add-room-btn");
    const sidebarAddEventBtn = document.getElementById("sidebar-add-event-btn");
    if (sidebarAddRoomBtn) sidebarAddRoomBtn.addEventListener("click", () => openForm("rooms"));
    if (sidebarAddEventBtn) sidebarAddEventBtn.addEventListener("click", () => openForm("events"));

    // Floating Save/Cancel just proxy to whichever maze/event form is
    // currently open — requestSubmit() runs the same validation + submit
    // event as clicking that form's own (still-present) Save button.
    floatingSaveBtn.addEventListener("click", () => {
        if (!activeFormKey) return;
        COLLECTIONS[activeFormKey].formEl.requestSubmit();
    });
    floatingCancelBtn.addEventListener("click", () => {
        if (!activeFormKey) return;
        closeForm(activeFormKey);
    });

    // ---------- tab panels ----------

    // Which panel each editable collection lives in. Contributors share
    // the Console panel with the About text; the rest map to a tab of
    // their own name.
    const PANEL_FOR_COLLECTION = {
        rooms: "rooms",
        events: "events",
        admins: "admins",
        contributors: "console"
    };

    const adminNavEl = document.getElementById("admin-nav");
    const adminPanelEls = Array.from(document.querySelectorAll(".admin-panel"));

    function showPanel(name) {
        if (!adminNavEl) return;
        adminPanelEls.forEach(panel => {
            panel.hidden = panel.dataset.panel !== name;
        });
        adminNavEl.querySelectorAll(".chrome-nav-btn").forEach(btn => {
            const on = btn.dataset.panel === name;
            btn.classList.toggle("active", on);
            btn.setAttribute("aria-selected", on ? "true" : "false");
        });
    }

    if (adminNavEl) {
        adminNavEl.addEventListener("click", e => {
            const btn = e.target.closest(".chrome-nav-btn");
            if (btn) showPanel(btn.dataset.panel);
        });
    }

    // ---------- bans ----------

    async function loadBans() {
        try {
            workingBans = await Api.getBans(adminToken);
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            workingBans = [];
        }
        renderBansList();
        // Each message row shows Ban or Unban depending on whether its own
        // address is on this list, so those have to be redrawn too.
        renderContactMessagesList();
    }

    function isBanned(ip) {
        return Boolean(ip) && workingBans.some(ban => ban.ip === ip);
    }

    function renderBansList() {
        bansListEl.innerHTML = "";
        if (!workingBans.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "No bans yet.";
            bansListEl.appendChild(empty);
            return;
        }
        workingBans.forEach(ban => {
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row";

            const info = document.createElement("div");
            info.className = "row-info";

            // Same reasoning as the contact message rows: the reason is
            // admin-entered but the address is not, so both go in as text
            // nodes rather than through innerHTML.
            const heading = document.createElement("h3");
            const ipEl = document.createElement("span");
            ipEl.className = "admin-ban-ip";
            ipEl.textContent = ban.ip;
            heading.appendChild(ipEl);

            const when = document.createElement("span");
            when.className = "admin-contributor-count";
            const bannedBy = ban.createdBy ? (" by " + ban.createdBy) : "";
            when.textContent = " - " + new Date(ban.createdAt).toLocaleString() + bannedBy;
            heading.appendChild(when);

            info.appendChild(heading);

            if (ban.reason) {
                const reason = document.createElement("p");
                reason.className = "row-creator";
                reason.textContent = ban.reason;
                info.appendChild(reason);
            }

            const actions = document.createElement("div");
            actions.className = "admin-row-actions";
            const unbanBtn = document.createElement("button");
            unbanBtn.type = "button";
            unbanBtn.className = "btn admin-delete-btn";
            unbanBtn.textContent = "Unban";
            unbanBtn.addEventListener("click", () => removeBan(ban));
            actions.appendChild(unbanBtn);

            row.appendChild(info);
            row.appendChild(actions);
            bansListEl.appendChild(row);
        });
    }

    async function removeBan(ban) {
        if (!confirm("Unban " + ban.ip + "? They will be able to use the contact form again.")) return;
        try {
            await Api.deleteBan(adminToken, ban.id);
            await loadBans();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            alert(err.message || "Could not unban that address — try again.");
        }
    }

    async function banIp(ip) {
        const reason = prompt("Ban " + ip + " from the contact form?\n\nOptional note about why (leave blank to skip):");
        // prompt() returns null on Cancel and "" on an empty OK — only the
        // first of those should abort the ban.
        if (reason === null) return;
        try {
            await Api.createBan(adminToken, ip, reason);
            await loadBans();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            alert(err.message || "Could not ban that address — try again.");
        }
    }

    async function unbanIp(ip) {
        try {
            await Api.deleteBanByIp(adminToken, ip);
            await loadBans();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            alert(err.message || "Could not unban that address — try again.");
        }
    }

    if (adminToken) {
        // Re-check the stored token is still valid (and not expired) before
        // trusting it, and recover the username it belongs to.
        Api.verifySession(adminToken).then(result => {
            if (!result) { lockOut(); return; }
            currentUsername = result.username;
            currentUserRole = result.role || "admin";
            enterAdmin();
        });
    }
});

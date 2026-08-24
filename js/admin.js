/* Admin panel logic for admin.html — add/edit/delete mazes and events.
   Everything here writes live to MongoDB via the Netlify Functions in
   netlify/functions/ (see js/api.js) — no local-only staging anymore.
   Write requests are gated by a session token from logging in with a
   username/password (see netlify/functions/auth.js and _auth.js); sessions
   expire automatically after 12 hours. Image uploads (thumbnails,
   room-by-room gallery shots) go through netlify/functions/upload.js into
   Netlify Blobs — see js/api.js's uploadImage/deleteImage. */
document.addEventListener("DOMContentLoaded", () => {

    const TOKEN_KEY = "mazerats_admin_token";
    const loginModal = document.getElementById("login-modal");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    const adminContent = document.getElementById("admin-content");
    const logoutBtn = document.getElementById("logout-btn");
    const adminsListEl = document.getElementById("admins-list");
    const adminsFormEl = document.getElementById("admins-form");
    const adminsAddBtn = document.getElementById("admins-add-btn");
    const landingToggleEl = document.getElementById("landing-toggle");
    const landingToggleBtns = document.querySelectorAll(".btn-enter-mini");
    const landingToggleStatus = document.getElementById("landing-toggle-status");
    const floatingActionsEl = document.getElementById("floating-actions");
    const floatingSaveBtn = document.getElementById("floating-save-btn");
    const floatingCancelBtn = document.getElementById("floating-cancel-btn");

    let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
    let currentUsername = "";
    let currentUserRole = "admin";
    let workingRooms = [];
    let workingEvents = [];
    let workingAdmins = [];
    // Which of "rooms"/"events" the floating Save/Cancel currently act on —
    // null whenever neither form is open (they're hidden then too).
    let activeFormKey = null;

    // Kept in this exact order everywhere (easiest → hardest) — js/home.js
    // has its own copy of the value/label pairs for rendering the pill.
    const DIFFICULTY_OPTIONS = [
        ["", "Not rated"],
        ["easy", "Easy"],
        ["medium", "Medium"],
        ["hard", "Hard"],
        ["very-hard", "Very Hard"],
        ["extreme", "Extreme"]
    ];

    const COLLECTIONS = {
        rooms: {
            singular: "Maze",
            plural: "Mazes",
            fieldMap: { title: "name", subtitle: "creator", date: "added" },
            titleLabel: "Maze Name",
            subtitleLabel: "Creator (Habbo username)",
            dateLabel: "Date opened (YYYY-MM-DD)",
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
            sessionStorage.setItem(TOKEN_KEY, adminToken);
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
        sessionStorage.removeItem(TOKEN_KEY);
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
        sessionStorage.removeItem(TOKEN_KEY);
        adminToken = "";
        currentUsername = "";
        currentUserRole = "admin";
        workingRooms = [];
        workingEvents = [];
        workingAdmins = [];
        Object.keys(COLLECTIONS).forEach(key => closeForm(key));
        closeAdminsForm();
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
        const [rooms, events] = await Promise.all([Api.getRooms(), Api.getEvents()]);
        workingRooms = rooms;
        workingEvents = events;
        renderList("rooms");
        renderList("events");
        loadAdmins();
        loadLandingState();
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

    // Gallery entries used to be plain image path strings; the editor below
    // stores {image, label} objects instead so labels aren't tied to a
    // filename. Normalize both shapes so older seeded rooms keep working.
    function normalizeGalleryEntry(entry) {
        if (typeof entry === "string") return { image: entry, label: deriveGalleryLabel(entry), bonus: false };
        return { image: entry.image, label: entry.label || deriveGalleryLabel(entry.image), bonus: !!entry.bonus };
    }

    function wireThumbUpload(formEl, uploadPrefix) {
        const fileInput = formEl.querySelector(".admin-thumb-file");
        const textInput = formEl.querySelector('input[name="thumb"]');
        const status = formEl.querySelector(".admin-thumb-status");
        if (!fileInput) return;
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

    // Entrance/Finish upload — mirrors the room-by-room gallery's explicit
    // "choose a file, then click Add" flow (see wireGalleryEditor's addBtn)
    // rather than auto-uploading the instant a file is picked, so the two
    // slot editors behave identically to the numbered room rows.
    function wireBookendUpload(formEl, kind, uploadPrefix) {
        const fileInput = formEl.querySelector(`.admin-${kind}-file`);
        const uploadBtn = formEl.querySelector(`.admin-${kind}-upload-btn`);
        const removeBtn = formEl.querySelector(`.admin-${kind}-remove`);
        const textInput = formEl.querySelector(`input[name="${kind}Image"]`);
        const status = formEl.querySelector(`.admin-${kind}-status`);
        const previewEl = formEl.querySelector(`.admin-${kind}-field .admin-gallery-thumb`);
        if (!uploadBtn) return;

        uploadBtn.addEventListener("click", async () => {
            const file = fileInput.files[0];
            if (!file) {
                status.textContent = "Choose an image first.";
                status.style.display = "block";
                return;
            }
            uploadBtn.disabled = true;
            status.style.display = "block";
            status.textContent = "Uploading…";
            try {
                const { url } = await uploadImageFile(uploadPrefix, file);
                textInput.value = url;
                if (previewEl) previewEl.style.backgroundImage = `url('${imgCdn(url, 100, 100, 55)}')`;
                if (removeBtn) removeBtn.disabled = false;
                fileInput.value = "";
                status.style.display = "none";
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Upload failed.";
            } finally {
                uploadBtn.disabled = false;
            }
        });

        if (removeBtn) {
            removeBtn.addEventListener("click", () => {
                const key = blobKeyFromUrl(textInput.value);
                if (key) Api.deleteImage(adminToken, key).catch(() => {});
                textInput.value = "";
                if (previewEl) previewEl.style.backgroundImage = "";
                removeBtn.disabled = true;
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
        if (previewEl) previewEl.style.backgroundImage = image ? `url('${imgCdn(image, 100, 100, 55)}')` : "";
        if (removeBtn) removeBtn.disabled = !image;
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
                            <button type="button" class="btn btn-solid" data-choice="keep">Move it into the room list</button>
                            <button type="button" class="btn admin-delete-btn" data-choice="discard">Delete it</button>
                            <button type="button" class="btn" data-choice="cancel">Cancel</button>
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
                            <button type="button" class="btn btn-solid" data-choice="yes">Yes</button>
                            <button type="button" class="btn" data-choice="no">No</button>
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

        let choice = "discard";
        if (existingImage) {
            choice = await showBookendConflictDialog(kind, existingLabel);
            if (choice === "cancel") return;
        }

        const [promoted] = draft.splice(index, 1);

        if (existingImage) {
            if (choice === "keep") {
                draft.push({ image: existingImage, label: existingLabel });
            } else {
                const key = blobKeyFromUrl(existingImage);
                if (key) Api.deleteImage(adminToken, key).catch(() => {});
            }
        }

        setBookendImage(formEl, kind, promoted.image, promoted.label);
        renderGalleryList();
    }

    function wireGalleryEditor(formEl, uploadPrefix) {
        const listEl = formEl.querySelector(".admin-gallery-list");
        const labelInput = formEl.querySelector(".admin-gallery-new-label");
        const fileInput = formEl.querySelector(".admin-gallery-new-file");
        const addBtn = formEl.querySelector(".admin-gallery-add-btn");
        const status = formEl.querySelector(".admin-gallery-status");

        function renderGalleryList() {
            const draft = formEl._galleryDraft;
            listEl.innerHTML = draft.map((g, i) => `
                <div class="admin-gallery-row" data-index="${i}">
                    <div class="admin-gallery-thumb" style="${g.image ? `background-image:url('${imgCdn(g.image, 100, 100, 55)}');` : ""}"></div>
                    <input type="text" class="admin-gallery-label" value="${g.label || ""}" placeholder="Room label">
                    <div class="admin-gallery-actions">
                        <button type="button" class="btn admin-gallery-bonus ${g.bonus ? "active" : ""}" title="Mark as Bonus Room">Bonus</button>
                        <button type="button" class="btn admin-gallery-make-entrance" title="Make this the Entrance image">Entrance</button>
                        <button type="button" class="btn admin-gallery-make-finish" title="Make this the Finish image">End</button>
                        <button type="button" class="btn admin-gallery-up" ${i === 0 ? "disabled" : ""} title="Move up">&#9650;</button>
                        <button type="button" class="btn admin-gallery-down" ${i === draft.length - 1 ? "disabled" : ""} title="Move down">&#9660;</button>
                        <button type="button" class="btn admin-delete-btn admin-gallery-remove" title="Remove">Remove</button>
                    </div>
                </div>
            `).join("");

            listEl.querySelectorAll(".admin-gallery-row").forEach(row => {
                const i = Number(row.dataset.index);
                row.querySelector(".admin-gallery-bonus").addEventListener("click", () => {
                    draft[i].bonus = !draft[i].bonus;
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
                row.querySelector(".admin-gallery-up").addEventListener("click", () => {
                    if (i === 0) return;
                    [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]];
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-down").addEventListener("click", () => {
                    if (i === draft.length - 1) return;
                    [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]];
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-remove").addEventListener("click", () => {
                    const [removed] = draft.splice(i, 1);
                    renderGalleryList();
                    const key = blobKeyFromUrl(removed.image);
                    if (key) Api.deleteImage(adminToken, key).catch(() => {});
                });
            });
        }

        addBtn.addEventListener("click", async () => {
            const file = fileInput.files[0];
            if (!file) {
                status.textContent = "Choose an image first.";
                status.style.display = "block";
                return;
            }
            const draft = formEl._galleryDraft;
            const label = labelInput.value.trim() || `Room ${draft.length + 1}`;
            addBtn.disabled = true;
            status.style.display = "block";
            status.textContent = "Uploading…";
            try {
                const { url } = await uploadImageFile(uploadPrefix, file);
                draft.push({ image: url, label, bonus: false });
                fileInput.value = "";
                labelInput.value = "";
                status.style.display = "none";
                renderGalleryList();
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
        const finishKey = blobKeyFromUrl(item.finish && item.finish.image);
        if (finishKey) keys.push(finishKey);
        (item.gallery || []).forEach(entry => {
            const key = blobKeyFromUrl(typeof entry === "string" ? entry : entry.image);
            if (key) keys.push(key);
        });
        keys.forEach(key => Api.deleteImage(adminToken, key).catch(() => {}));
    }

    // ---------- list rendering ----------

    function renderList(key) {
        const cfg = COLLECTIONS[key];
        const items = cfg.getAll();
        cfg.listEl.innerHTML = "";

        if (!items.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = `No ${cfg.plural.toLowerCase()} yet — add the first one below.`;
            cfg.listEl.appendChild(empty);
            return;
        }

        items.forEach((item, index) => {
            const title = item[cfg.fieldMap.title] || "(untitled)";
            const subtitle = item[cfg.fieldMap.subtitle] || "";
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row";
            row.innerHTML = `
                <div class="row-thumb" style="${item.thumb ? `background-image:url('${imgCdn(item.thumb, 160, 160, 65)}');` : ""}">
                    <span class="status-badge status-${item.status}">${item.status}</span>
                </div>
                <div class="row-info">
                    <h3>${title}</h3>
                    <p class="row-creator">${subtitle ? "by " + subtitle : ""}</p>
                    <p class="row-desc">${item.description || ""}</p>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="btn admin-edit-btn">Edit</button>
                    <button type="button" class="btn admin-delete-btn">Delete</button>
                </div>
            `;
            row.querySelector(".admin-edit-btn").addEventListener("click", () => openForm(key, index));
            row.querySelector(".admin-delete-btn").addEventListener("click", () => deleteItem(key, index));
            cfg.listEl.appendChild(row);
        });
    }

    // ---------- form ----------

    function fieldRow(labelText, inputHtml) {
        return `<label class="admin-field"><span>${labelText}</span>${inputHtml}</label>`;
    }

    function openForm(key, editIndex) {
        const cfg = COLLECTIONS[key];
        const isEdit = editIndex !== undefined && editIndex !== null;
        const item = isEdit ? cfg.getAll()[editIndex] : {};
        const isEvents = key === "events";
        const isRooms = key === "rooms";

        const statusOptionsHtml = cfg.statusOptions.map(([value, label]) =>
            `<option value="${value}" ${item.status === value ? "selected" : ""}>${label}</option>`
        ).join("");

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

        const dateFieldHtml = isEvents
            ? `
                ${fieldRow("Event start date (UTC)", `<input type="date" name="startDate" required value="${start.date}">`)}
                ${fieldRow("Event start time (UTC, 24-hour)", `<input type="time" name="startTime" required value="${start.time}">`)}
                ${fieldRow("Event end date (UTC)", `<input type="date" name="endDate" required value="${end.date}">`)}
                ${fieldRow("Event end time (UTC, 24-hour)", `<input type="time" name="endTime" required value="${end.time}">`)}
                <p class="admin-hint">All four fields are UTC. The site shows this as-is — it does not convert to a visitor's local timezone.</p>
              `
            : fieldRow(cfg.dateLabel, `<input type="text" name="date" value="${item[cfg.fieldMap.date] || ""}">`);

        const tagsFieldHtml = isRooms
            ? `
                <div class="admin-field admin-tags-field">
                    <span>Tags</span>
                    <div class="tag-chip-list" id="tag-chip-list"><p class="admin-empty">Loading tags…</p></div>
                    <div class="admin-tag-add">
                        <input type="text" class="admin-tag-new-input" placeholder="Add a new tag...">
                        <button type="button" class="btn admin-tag-add-btn">+ Add Tag</button>
                    </div>
                    <p class="admin-tag-status" style="display:none;"></p>
                </div>
              `
            : fieldRow("Tags (comma-separated)", `<input type="text" name="tags" value="${(item.tags || []).join(", ")}">`);

        // Entrance/Finish share this layout: a live preview + label input
        // (identical row markup to a gallery room), a hidden field carrying
        // the actual image URL, and an explicit choose-file-then-upload
        // control matching the room-by-room gallery's "+ Add" flow — see
        // wireBookendUpload.
        function bookendSectionHtml(kind, title, hint, entry) {
            const kindLabel = kind === "entrance" ? "Entrance" : "Finish";
            return `
                <div class="admin-field admin-${kind}-field">
                    <span>${title}</span>
                    <p class="admin-hint">${hint}</p>
                    <div class="admin-gallery-row">
                        <div class="admin-gallery-thumb" style="${entry.image ? `background-image:url('${imgCdn(entry.image, 100, 100, 55)}');` : ""}"></div>
                        <input type="text" name="${kind}Label" class="admin-gallery-label" placeholder="Label (e.g. ${kindLabel})" value="${entry.label || kindLabel}">
                        <div class="admin-gallery-actions">
                            <button type="button" class="btn admin-delete-btn admin-${kind}-remove" title="Remove" ${entry.image ? "" : "disabled"}>Remove</button>
                        </div>
                    </div>
                    <input type="hidden" name="${kind}Image" value="${entry.image || ""}">
                    <div class="admin-gallery-add">
                        <input type="file" class="admin-${kind}-file" accept="image/png,image/jpeg,image/gif,image/webp">
                        <button type="button" class="btn admin-${kind}-upload-btn">+ Upload ${kindLabel} Image</button>
                    </div>
                    <p class="admin-${kind}-status" style="display:none;"></p>
                </div>
            `;
        }

        const entrance = item.entrance || {};
        const entranceSectionHtml = isRooms
            ? bookendSectionHtml("entrance", "Entrance image (optional)", "Always shown first in the gallery, before every room-by-room image — use it for the maze's entrance or lobby screenshot.", entrance)
            : "";

        const gallerySectionHtml = isRooms ? `
            <div class="admin-field admin-gallery-field">
                <span>Room-by-room gallery (optional)</span>
                <p class="admin-hint">Upload a screenshot for each room in the maze, in order — use the arrows to reorder them.</p>
                <div class="admin-gallery-list"></div>
                <div class="admin-gallery-add">
                    <input type="text" class="admin-gallery-new-label" placeholder="Room label (e.g. Room 12)">
                    <input type="file" class="admin-gallery-new-file" accept="image/png,image/jpeg,image/gif,image/webp">
                    <button type="button" class="btn admin-gallery-add-btn">+ Add Room Image</button>
                </div>
                <p class="admin-gallery-status" style="display:none;"></p>
            </div>
        ` : "";

        const finish = item.finish || {};
        const finishSectionHtml = isRooms
            ? bookendSectionHtml("finish", "Finish image (optional)", "Always shown last in the gallery, after every room-by-room image — use it for the maze's finish or prize room screenshot.", finish)
            : "";

        cfg.formEl.innerHTML = `
            <h3 class="admin-form-title">${isEdit ? "Edit " + cfg.singular : "Add a New " + cfg.singular}</h3>
            ${fieldRow(cfg.titleLabel, `<input type="text" name="title" required value="${item[cfg.fieldMap.title] || ""}">`)}
            ${fieldRow(cfg.subtitleLabel, `<input type="text" name="subtitle" value="${item[cfg.fieldMap.subtitle] || ""}">`)}
            ${fieldRow("Status", `<select name="status">${statusOptionsHtml}</select>`)}
            ${difficultyFieldHtml}
            ${fieldRow("Hotel", `<input type="text" name="hotel" value="${item.hotel || ""}" placeholder="e.g. Origins, US, NL">`)}
            ${dateFieldHtml}
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
            ${fieldRow("Habbo link (optional)", `<input type="text" name="habboLink" value="${item.habboLink || ""}" placeholder="https://...">`)}
            ${entranceSectionHtml}
            ${gallerySectionHtml}
            ${finishSectionHtml}
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="btn btn-solid">Save</button>
                <button type="button" class="btn admin-cancel-btn">Cancel</button>
            </div>
        `;

        cfg.formEl.dataset.editIndex = isEdit ? String(editIndex) : "";
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
        if (isRooms) {
            wireBookendUpload(cfg.formEl, "entrance", uploadPrefix);
            wireBookendUpload(cfg.formEl, "finish", uploadPrefix);
            cfg.formEl._galleryDraft = (item.gallery || []).map(normalizeGalleryEntry);
            wireGalleryEditor(cfg.formEl, uploadPrefix);
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
        cfg.formEl._selectedTags = null;
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
        const editIndex = form.dataset.editIndex !== "" ? Number(form.dataset.editIndex) : null;
        const existing = editIndex !== null ? items[editIndex] : {};

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
            payload[cfg.fieldMap.date] = data.date;
        }

        if (key === "rooms") {
            payload.difficulty = data.difficulty || "";
            payload.gallery = form._galleryDraft || [];
            const entranceImage = (data.entranceImage || "").trim();
            payload.entrance = entranceImage ? { image: entranceImage, label: (data.entranceLabel || "").trim() || "Entrance" } : null;
            const finishImage = (data.finishImage || "").trim();
            payload.finish = finishImage ? { image: finishImage, label: (data.finishLabel || "").trim() || "Finish" } : null;
        }

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
            if (editIndex !== null) {
                const updated = await cfg.update(payload);
                items[editIndex] = updated;
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

    async function deleteItem(key, index) {
        const cfg = COLLECTIONS[key];
        const items = cfg.getAll();
        const item = items[index];
        const title = item[cfg.fieldMap.title] || "this entry";
        if (!confirm(`Delete "${title}"? This is permanent and affects the live site immediately.`)) return;
        try {
            await cfg.remove(item.id);
            items.splice(index, 1);
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
                    <h3>${admin.username}${isSelf ? ' <span class="admin-you-tag">(you)</span>' : ""}</h3>
                    <p class="row-creator">${role === "owner" ? "Owner" : "Admin"} · ${admin.createdAt ? "Added " + admin.createdAt.slice(0, 10) : ""}</p>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="btn admin-reset-btn">Reset Password</button>
                    ${canDelete ? `<button type="button" class="btn admin-delete-btn" ${workingAdmins.length <= 1 ? "disabled" : ""}>Delete</button>` : ""}
                </div>
            `;
            row.querySelector(".admin-reset-btn").addEventListener("click", () => openResetForm(admin.username));
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
                <button type="submit" class="btn btn-solid">Save</button>
                <button type="button" class="btn admin-cancel-btn">Cancel</button>
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
                <button type="submit" class="btn btn-solid">Save</button>
                <button type="button" class="btn admin-cancel-btn">Cancel</button>
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

    // ---------- landing page state ----------

    async function loadLandingState() {
        try {
            const { landingState } = await Api.getSiteSettings();
            landingToggleBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.state === landingState));
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
            await Api.updateSiteSettings(adminToken, state);
            landingToggleBtns.forEach(b => b.classList.toggle("active", b === clickedBtn));
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
    adminsAddBtn.addEventListener("click", openCreateAdminForm);

    Object.keys(COLLECTIONS).forEach(key => {
        const cfg = COLLECTIONS[key];
        cfg.addBtn.addEventListener("click", () => openForm(key));
        cfg.formEl.addEventListener("submit", e => submitForm(key, e));
    });

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

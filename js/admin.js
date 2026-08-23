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

    let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
    let currentUsername = "";
    let workingRooms = [];
    let workingEvents = [];
    let workingAdmins = [];

    const COLLECTIONS = {
        rooms: {
            singular: "Maze",
            plural: "Mazes",
            fieldMap: { title: "name", subtitle: "creator", date: "added" },
            titleLabel: "Room name",
            subtitleLabel: "Creator (Habbo username)",
            dateLabel: "Date added (YYYY-MM-DD)",
            statusOptions: [["open", "Open"], ["closed", "Closed"], ["unknown", "Unknown"]],
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
            statusOptions: [["upcoming", "Upcoming"], ["past", "Past"]],
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
        adminContent.style.display = "none";
        loginModal.classList.add("open");
        loginError.textContent = "Session expired — log in again.";
        loginError.style.display = "block";
    }

    function doLogout() {
        sessionStorage.removeItem(TOKEN_KEY);
        adminToken = "";
        currentUsername = "";
        workingRooms = [];
        workingEvents = [];
        workingAdmins = [];
        Object.keys(COLLECTIONS).forEach(key => closeForm(key));
        closeAdminsForm();
        adminContent.style.display = "none";
        loginModal.classList.add("open");
        loginError.style.display = "none";
        loginForm.reset();
    }

    async function enterAdmin() {
        loginModal.classList.remove("open");
        adminContent.style.display = "block";
        const [rooms, events] = await Promise.all([Api.getRooms(), Api.getEvents()]);
        workingRooms = rooms;
        workingEvents = events;
        renderList("rooms");
        renderList("events");
        loadAdmins();
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
        if (typeof entry === "string") return { image: entry, label: deriveGalleryLabel(entry) };
        return { image: entry.image, label: entry.label || deriveGalleryLabel(entry.image) };
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
                        <button type="button" class="btn admin-gallery-up" ${i === 0 ? "disabled" : ""} title="Move up">&#9650;</button>
                        <button type="button" class="btn admin-gallery-down" ${i === draft.length - 1 ? "disabled" : ""} title="Move down">&#9660;</button>
                        <button type="button" class="btn admin-delete-btn admin-gallery-remove" title="Remove">Remove</button>
                    </div>
                </div>
            `).join("");

            listEl.querySelectorAll(".admin-gallery-row").forEach(row => {
                const i = Number(row.dataset.index);
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
                draft.push({ image: url, label });
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

        cfg.formEl.innerHTML = `
            <h3 class="admin-form-title">${isEdit ? "Edit " + cfg.singular : "Add a New " + cfg.singular}</h3>
            ${fieldRow(cfg.titleLabel, `<input type="text" name="title" required value="${item[cfg.fieldMap.title] || ""}">`)}
            ${fieldRow(cfg.subtitleLabel, `<input type="text" name="subtitle" value="${item[cfg.fieldMap.subtitle] || ""}">`)}
            ${fieldRow("Status", `<select name="status">${statusOptionsHtml}</select>`)}
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
            ${gallerySectionHtml}
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
            cfg.formEl._galleryDraft = (item.gallery || []).map(normalizeGalleryEntry);
            wireGalleryEditor(cfg.formEl, uploadPrefix);
            cfg.formEl._selectedTags = new Set((item.tags || []).map(t => t.trim()).filter(Boolean));
            wireTagPicker(cfg.formEl);
        }

        cfg.formEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function closeForm(key) {
        const cfg = COLLECTIONS[key];
        cfg.formEl.style.display = "none";
        cfg.formEl.innerHTML = "";
        cfg.formEl._galleryDraft = null;
        cfg.formEl._selectedTags = null;
        cfg.addBtn.style.display = "inline-block";
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
            payload.gallery = form._galleryDraft || [];
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
        workingAdmins.forEach(admin => {
            const isSelf = admin.username === currentUsername;
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row admin-account-row";
            row.innerHTML = `
                <div class="row-info">
                    <h3>${admin.username}${isSelf ? ' <span class="admin-you-tag">(you)</span>' : ""}</h3>
                    <p class="row-creator">${admin.createdAt ? "Added " + admin.createdAt.slice(0, 10) : ""}</p>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="btn admin-reset-btn">Reset Password</button>
                    <button type="button" class="btn admin-delete-btn" ${workingAdmins.length <= 1 ? "disabled" : ""}>Delete</button>
                </div>
            `;
            row.querySelector(".admin-reset-btn").addEventListener("click", () => openResetForm(admin.username));
            row.querySelector(".admin-delete-btn").addEventListener("click", () => deleteAdmin(admin.username));
            adminsListEl.appendChild(row);
        });
    }

    function openCreateAdminForm() {
        adminsFormEl.innerHTML = `
            <h3 class="admin-form-title">Add a New Admin</h3>
            ${fieldRow("Username", `<input type="text" name="username" required autocomplete="off">`)}
            ${fieldRow("Password (8+ characters)", `<input type="password" name="password" required minlength="8" autocomplete="new-password">`)}
            ${fieldRow("Confirm password", `<input type="password" name="confirm" required minlength="8" autocomplete="new-password">`)}
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
        adminsFormEl.scrollIntoView({ behavior: "smooth", block: "center" });
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
                await Api.createAdmin(adminToken, data.username.trim(), data.password);
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

    // ---------- wire up ----------

    logoutBtn.addEventListener("click", doLogout);
    adminsAddBtn.addEventListener("click", openCreateAdminForm);

    Object.keys(COLLECTIONS).forEach(key => {
        const cfg = COLLECTIONS[key];
        cfg.addBtn.addEventListener("click", () => openForm(key));
        cfg.formEl.addEventListener("submit", e => submitForm(key, e));
    });

    if (adminToken) {
        // Re-check the stored token is still valid (and not expired) before
        // trusting it, and recover the username it belongs to.
        Api.verifySession(adminToken).then(result => {
            if (!result) { lockOut(); return; }
            currentUsername = result.username;
            enterAdmin();
        });
    }
});

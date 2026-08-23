/* Admin panel logic for admin.html — add/edit/delete mazes and events.
   Everything here writes live to MongoDB via the Netlify Functions in
   netlify/functions/ (see js/api.js) — no local-only staging anymore.
   Write requests are gated by a password checked server-side against the
   ADMIN_PASSWORD environment variable (see netlify/functions/_auth.js).
   Image uploads (thumbnails, room-by-room gallery shots) go through
   netlify/functions/upload.js into Netlify Blobs — see js/api.js's
   uploadImage/deleteImage. */
document.addEventListener("DOMContentLoaded", () => {

    const TOKEN_KEY = "mazerats_admin_token";
    const loginModal = document.getElementById("login-modal");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    const adminContent = document.getElementById("admin-content");
    const logoutBtn = document.getElementById("logout-btn");

    let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
    let workingRooms = [];
    let workingEvents = [];

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

    async function tryUnlock(password) {
        // No dedicated "verify password" endpoint — instead send a PUT with
        // no id, which is invalid either way, but only gets past the auth
        // check (and returns 400, not 401) if the password is correct.
        try {
            const res = await fetch("/.netlify/functions/rooms", {
                method: "PUT",
                headers: { "Content-Type": "application/json", "x-admin-token": password },
                body: JSON.stringify({})
            });
            return res.status !== 401;
        } catch (e) {
            return false;
        }
    }

    loginForm.addEventListener("submit", async e => {
        e.preventDefault();
        const password = new FormData(loginForm).get("password");
        loginError.style.display = "none";
        const submitBtn = loginForm.querySelector("button[type=submit]");
        submitBtn.disabled = true;
        submitBtn.textContent = "Checking…";

        const ok = await tryUnlock(password);
        submitBtn.disabled = false;
        submitBtn.textContent = "Unlock";

        if (!ok) {
            loginError.style.display = "block";
            return;
        }
        adminToken = password;
        sessionStorage.setItem(TOKEN_KEY, adminToken);
        enterAdmin();
    });

    function lockOut() {
        sessionStorage.removeItem(TOKEN_KEY);
        adminToken = "";
        adminContent.style.display = "none";
        loginModal.classList.add("open");
        loginError.textContent = "Session expired — enter the password again.";
        loginError.style.display = "block";
    }

    function doLogout() {
        sessionStorage.removeItem(TOKEN_KEY);
        adminToken = "";
        workingRooms = [];
        workingEvents = [];
        Object.keys(COLLECTIONS).forEach(key => closeForm(key));
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
                    <div class="admin-gallery-thumb" style="${g.image ? `background-image:url('${encodeURI(g.image)}');` : ""}"></div>
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
                <div class="row-thumb" style="${item.thumb ? `background-image:url('${encodeURI(item.thumb)}');` : ""}">
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

        let eventDatePart = "", eventTimePart = "";
        if (isEvents && item.date) {
            const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(item.date);
            if (m) { eventDatePart = m[1]; eventTimePart = m[2]; }
        }

        const dateFieldHtml = isEvents
            ? `
                ${fieldRow("Event date (UTC)", `<input type="date" name="eventDate" required value="${eventDatePart}">`)}
                ${fieldRow("Event time (UTC, 24-hour)", `<input type="time" name="eventTime" required value="${eventTimePart}">`)}
                <p class="admin-hint">Both fields are UTC. The site shows this time as-is — it does not convert it to a visitor's local timezone.</p>
              `
            : fieldRow(cfg.dateLabel, `<input type="text" name="date" value="${item[cfg.fieldMap.date] || ""}">`);

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
            ${fieldRow("Tags (comma-separated)", `<input type="text" name="tags" value="${(item.tags || []).join(", ")}">`)}
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
        }

        cfg.formEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function closeForm(key) {
        const cfg = COLLECTIONS[key];
        cfg.formEl.style.display = "none";
        cfg.formEl.innerHTML = "";
        cfg.formEl._galleryDraft = null;
        cfg.addBtn.style.display = "inline-block";
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
            tags: data.tags.split(",").map(t => t.trim()).filter(Boolean),
            thumb: data.thumb,
            description: data.description,
            details: data.details,
            habboLink: data.habboLink
        };
        payload[cfg.fieldMap.title] = data.title;
        payload[cfg.fieldMap.subtitle] = data.subtitle;

        if (key === "events") {
            payload.date = data.eventDate && data.eventTime ? `${data.eventDate}T${data.eventTime}:00Z` : "";
        } else {
            payload[cfg.fieldMap.date] = data.date;
        }

        if (key === "rooms") {
            payload.gallery = form._galleryDraft || [];
        }

        const submitBtn = form.querySelector("button[type=submit]");
        const errorEl = form.querySelector(".admin-form-error");
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

    // ---------- wire up ----------

    logoutBtn.addEventListener("click", doLogout);

    Object.keys(COLLECTIONS).forEach(key => {
        const cfg = COLLECTIONS[key];
        cfg.addBtn.addEventListener("click", () => openForm(key));
        cfg.formEl.addEventListener("submit", e => submitForm(key, e));
    });

    if (adminToken) {
        // Re-check the stored token is still valid before trusting it.
        tryUnlock(adminToken).then(ok => ok ? enterAdmin() : lockOut());
    }
});

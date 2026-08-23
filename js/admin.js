/* Admin panel logic for admin.html — add/edit/delete mazes and events.
   Persists to this browser's localStorage only (see js/admin-store.js for
   why) and provides an Export panel to turn that into real source code. */
document.addEventListener("DOMContentLoaded", () => {

    // Working copies. ROOMS/EVENTS already reflect any stored override by
    // the time this runs (rooms-data.js / events-data.js apply it on load),
    // so these clones start from "whatever this browser currently sees".
    let workingRooms = ROOMS.map(r => ({ ...r }));
    let workingEvents = EVENTS.map(e => ({ ...e }));

    const COLLECTIONS = {
        rooms: {
            singular: "Maze",
            plural: "Mazes",
            fieldMap: { title: "name", subtitle: "creator", date: "added" },
            titleLabel: "Room name",
            subtitleLabel: "Creator (Habbo username)",
            dateLabel: "Date added (YYYY-MM-DD)",
            statusOptions: [["active", "Active"], ["closed", "Closed"], ["unknown", "Unknown"]],
            getAll: () => workingRooms,
            setAll: arr => { workingRooms = arr; AdminStore.setRooms(workingRooms); },
            listEl: document.getElementById("rooms-list"),
            formEl: document.getElementById("rooms-form"),
            addBtn: document.getElementById("rooms-add-btn"),
            exportEl: document.getElementById("rooms-export"),
            varName: "ROOMS"
        },
        events: {
            singular: "Event",
            plural: "Events",
            fieldMap: { title: "title", subtitle: "host", date: "date" },
            titleLabel: "Event title",
            subtitleLabel: "Host (Habbo username)",
            dateLabel: "Event date",
            statusOptions: [["upcoming", "Upcoming"], ["past", "Past"]],
            getAll: () => workingEvents,
            setAll: arr => { workingEvents = arr; AdminStore.setEvents(workingEvents); },
            listEl: document.getElementById("events-list"),
            formEl: document.getElementById("events-form"),
            addBtn: document.getElementById("events-add-btn"),
            exportEl: document.getElementById("events-export"),
            varName: "EVENTS"
        }
    };

    function slugify(text) {
        return text.toLowerCase().trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") || "item";
    }

    function uniqueSlug(base, items, skipId) {
        let slug = slugify(base);
        let n = 2;
        while (items.some(i => i.id === slug && i.id !== skipId)) {
            slug = `${slugify(base)}-${n++}`;
        }
        return slug;
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

        const statusOptionsHtml = cfg.statusOptions.map(([value, label]) =>
            `<option value="${value}" ${item.status === value ? "selected" : ""}>${label}</option>`
        ).join("");

        cfg.formEl.innerHTML = `
            <h3 class="admin-form-title">${isEdit ? "Edit " + cfg.singular : "Add a New " + cfg.singular}</h3>
            ${fieldRow(cfg.titleLabel, `<input type="text" name="title" required value="${item[cfg.fieldMap.title] || ""}">`)}
            ${fieldRow(cfg.subtitleLabel, `<input type="text" name="subtitle" value="${item[cfg.fieldMap.subtitle] || ""}">`)}
            ${fieldRow("Status", `<select name="status">${statusOptionsHtml}</select>`)}
            ${fieldRow("Hotel", `<input type="text" name="hotel" value="${item.hotel || ""}" placeholder="e.g. Origins, US, NL">`)}
            ${fieldRow(cfg.dateLabel, `<input type="text" name="date" value="${item[cfg.fieldMap.date] || ""}">`)}
            ${fieldRow("Tags (comma-separated)", `<input type="text" name="tags" value="${(item.tags || []).join(", ")}">`)}
            ${fieldRow("Thumbnail image URL", `<input type="text" name="thumb" value="${item.thumb || ""}" placeholder="assets/... or https://...">`)}
            ${fieldRow("Short description (shown on the card)", `<textarea name="description" rows="2">${item.description || ""}</textarea>`)}
            ${fieldRow("Full details (shown in the popup, optional)", `<textarea name="details" rows="4">${item.details || ""}</textarea>`)}
            ${fieldRow("Habbo link (optional)", `<input type="text" name="habboLink" value="${item.habboLink || ""}" placeholder="https://...">`)}
            <div class="admin-form-actions">
                <button type="submit" class="btn btn-solid">Save</button>
                <button type="button" class="btn admin-cancel-btn">Cancel</button>
            </div>
        `;

        cfg.formEl.dataset.editIndex = isEdit ? String(editIndex) : "";
        cfg.formEl.style.display = "flex";
        cfg.addBtn.style.display = "none";
        cfg.formEl.querySelector(".admin-cancel-btn").addEventListener("click", () => closeForm(key));
        cfg.formEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function closeForm(key) {
        const cfg = COLLECTIONS[key];
        cfg.formEl.style.display = "none";
        cfg.formEl.innerHTML = "";
        cfg.addBtn.style.display = "inline-block";
    }

    function submitForm(key, e) {
        e.preventDefault();
        const cfg = COLLECTIONS[key];
        const form = cfg.formEl;
        const data = Object.fromEntries(new FormData(form).entries());
        const items = cfg.getAll();
        const editIndex = form.dataset.editIndex !== "" ? Number(form.dataset.editIndex) : null;
        const existing = editIndex !== null ? items[editIndex] : {};

        const updated = {
            ...existing,
            id: existing.id || uniqueSlug(data.title, items, undefined),
            status: data.status,
            hotel: data.hotel,
            tags: data.tags.split(",").map(t => t.trim()).filter(Boolean),
            thumb: data.thumb,
            description: data.description,
            details: data.details,
            habboLink: data.habboLink
        };
        updated[cfg.fieldMap.title] = data.title;
        updated[cfg.fieldMap.subtitle] = data.subtitle;
        updated[cfg.fieldMap.date] = data.date;

        if (editIndex !== null) {
            items[editIndex] = updated;
        } else {
            items.push(updated);
        }
        cfg.setAll(items);
        closeForm(key);
        renderList(key);
        renderExport(key);
    }

    function deleteItem(key, index) {
        const cfg = COLLECTIONS[key];
        const items = cfg.getAll();
        const title = items[index][cfg.fieldMap.title] || "this entry";
        if (!confirm(`Delete "${title}"? This only removes it from this browser's draft — it won't affect the live site until you re-export.`)) return;
        items.splice(index, 1);
        cfg.setAll(items);
        renderList(key);
        renderExport(key);
    }

    // ---------- export ----------

    function renderExport(key) {
        const cfg = COLLECTIONS[key];
        cfg.exportEl.value = `const ${cfg.varName} = ${JSON.stringify(cfg.getAll(), null, 4)};`;
    }

    // ---------- wire up ----------

    Object.keys(COLLECTIONS).forEach(key => {
        const cfg = COLLECTIONS[key];
        cfg.addBtn.addEventListener("click", () => openForm(key));
        cfg.formEl.addEventListener("submit", e => submitForm(key, e));
        renderList(key);
        renderExport(key);
    });

    document.querySelectorAll(".admin-copy-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const target = document.getElementById(btn.dataset.target);
            target.select();
            try {
                await navigator.clipboard.writeText(target.value);
                const original = btn.textContent;
                btn.textContent = "Copied!";
                setTimeout(() => { btn.textContent = original; }, 1500);
            } catch (e) {
                // Clipboard API unavailable — the textarea is already selected as a fallback.
            }
        });
    });

    document.getElementById("reset-btn").addEventListener("click", () => {
        if (!confirm("Clear this browser's draft and go back to the site's built-in defaults? This can't be undone.")) return;
        AdminStore.clearRooms();
        AdminStore.clearEvents();
        location.reload();
    });
});

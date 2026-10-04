/* ===========================================================
   Maze Rats — the What's New panel in /warren  (4 Oct 2026, the owner's)

   What's New on the homepage is drawn from the archive itself (js/home.js,
   whatsNewItems): every maze, event and published guide on the day it was
   added or last edited, with a line of what changed. This panel shows that
   same log and lets an admin

     ADD   site news (a title, a few lines, an optional picture and link)
           and notes about a maze or event (a line that opens it);
     AMEND any automatic entry: take it off the log, file it under another
           day, label it Added or Updated whatever the dates say, or give it
           its own line instead of the automatic one.

   Both are kept by netlify/functions/whats-new.js, and js/home.js applies
   them when it builds the log (WHAT'S NEW, BY HAND there). The days here
   are worked out as the homepage works them out, near enough: the
   homepage files by the reader's own day, this by the UTC one, so an edit
   made around midnight can sit a day apart in the two.

   A file of its own, like js/admin-guides.js: it shares the session token,
   Api's authenticated fetch, admin.js's upload (window.AdminUpload) and its
   question and sign-in boxes, and nothing else.
   =========================================================== */
(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="whatsnew"]');
    if (!panel || typeof Api === "undefined") return;

    const TOKEN_KEY = "mazerats_admin_token";
    const URL_ = "/.netlify/functions/whats-new";
    // The day every record catalogued before createdAt existed shares
    // (ARCHIVE_BACKFILL_DATE in js/home.js).
    const BACKFILL = "2026-08-21";

    const listEl = panel.querySelector("#wn-list");
    const formEl = panel.querySelector("#wn-form");
    const searchEl = panel.querySelector("#wn-search");
    const hiddenEl = panel.querySelector("#wn-show-hidden");

    /* The automatic change lines, as the homepage words them (CHANGE_WORDS
       in js/home.js), so an override's placeholder shows what it replaces. */
    const CHANGE_WORDS = {
        "imagery-added": "Added room imagery", "imagery": "Room imagery updated", "thumb": "Thumbnail updated",
        "furni": "Updated furni listing", "markers": "Entrance or finish updated", "status": "Status changed",
        "difficulty": "Difficulty re-rated", "tags": "Tags updated", "dates": "Dates updated", "links": "Links updated",
        "text": "Changes made to texts", "details": "Details updated", "sections": "Sections rewritten", "images": "Pictures updated"
    };
    const VERBS = { added: "Added", updated: "Updated", news: "News", note: "Note" };

    let mounted = false;
    let rooms = [], events = [], guides = [], posts = [], overrides = new Map();
    let openOverride = null;    // the target whose override editor is open
    let editing = null;         // the post in the form ({} for a new one)
    let opened = "";            // editing as it was opened, for "unsaved changes?"
    const uploaded = new Set(); // news/ picture keys uploaded during this edit
    let busy = false;

    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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

    const dayOf = v => String(v || "").slice(0, 10);
    const today = () => new Date().toISOString().slice(0, 10);
    function dayLabel(day) {
        const d = new Date(day + "T12:00:00Z");
        return isNaN(d) ? day : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    }

    // ------------------------------------------------------------ the log

    // One automatic entry, before anything here changes it.
    function autoEntry(item, kind) {
        const isGuide = kind === "guide";
        const archived = String((isGuide ? item.publishedAt : item.createdAt) || BACKFILL);
        const updated = item.updatedAt ? String(item.updatedAt) : "";
        const activity = updated && dayOf(updated) > dayOf(archived) ? "updated" : "added";
        const words = (Array.isArray(item.changes) ? item.changes : []).map(k => CHANGE_WORDS[k]).filter(Boolean).join(" · ");
        return {
            target: `${kind}:${item.id}`,
            kind,
            name: kind === "event" ? item.title : isGuide ? item.title : item.name,
            meta: kind === "event" ? `Event${item.host ? " · " + item.host : ""}`
                : isGuide ? `Guide${item.category ? " · " + item.category : ""}`
                : `Maze${item.creator ? " · " + item.creator : ""}`,
            autoDay: dayOf(activity === "updated" ? updated : archived),
            autoActivity: activity,
            autoText: activity === "updated" ? words : ""
        };
    }

    // Everything on the log, as it will read, newest first.
    function entries() {
        const auto = [
            ...rooms.map(r => autoEntry(r, "maze")),
            ...events.map(e => autoEntry(e, "event")),
            ...guides.filter(g => g && g.status === "published" && g.publishedAt).map(g => autoEntry(g, "guide"))
        ].map(e => {
            const o = overrides.get(e.target) || null;
            return {
                ...e, o,
                day: (o && o.day) || e.autoDay,
                activity: (o && o.activity) || e.autoActivity,
                line: (o && o.text) || e.autoText,
                hidden: !!(o && o.hidden)
            };
        });
        const byTarget = new Map(auto.map(e => [e.target, e]));
        const own = posts.map(p => ({
            post: p,
            target: "",
            name: p.kind === "news" ? p.title : (byTarget.get(p.target) || {}).name || p.target,
            meta: p.kind === "news" ? "Site news" : (byTarget.get(p.target) || {}).meta || "Gone from the archive",
            day: p.day,
            activity: p.kind,
            line: p.text,
            hidden: p.hidden === true
        }));
        return auto.concat(own).sort((a, b) => b.day.localeCompare(a.day) || String(a.name).localeCompare(String(b.name)));
    }

    function render() {
        const q = (searchEl.value || "").trim().toLowerCase();
        const showHidden = hiddenEl.checked;
        const list = entries().filter(e => (showHidden || !e.hidden)
            && (!q || `${e.name} ${e.meta} ${e.line}`.toLowerCase().includes(q)));
        if (!list.length) {
            listEl.innerHTML = `<p class="admin-empty">${q ? "Nothing matches that." : "Nothing on What's New yet."}</p>`;
            return;
        }
        const days = [];
        list.forEach(e => {
            const last = days[days.length - 1];
            if (!last || last.day !== e.day) days.push({ day: e.day, items: [e] });
            else last.items.push(e);
        });
        listEl.innerHTML = days.map(g => `
            <h4 class="wn-day">${esc(dayLabel(g.day))}</h4>
            ${g.items.map(rowHtml).join("")}`).join("");
    }

    function rowHtml(e) {
        const flags = [];
        if (e.o) {
            if (e.o.hidden) flags.push("hidden");
            if (e.o.day) flags.push("date moved");
            if (e.o.activity) flags.push("label set");
            if (e.o.text) flags.push("own text");
        }
        const key = e.post ? `post:${e.post.id}` : e.target;
        return `
            <div class="chrome-list-row admin-row wn-row${e.hidden ? " is-hidden" : ""}" data-key="${esc(key)}">
                <div class="row-info">
                    <h3><span class="wn-verb is-${esc(e.activity)}">${esc(VERBS[e.activity] || "Added")}</span> ${esc(e.name || "(untitled)")}</h3>
                    <p class="row-creator">${esc(e.meta)}${flags.length ? ` <span class="wn-flags">Changed here: ${esc(flags.join(", "))}</span>` : ""}</p>
                    ${e.line ? `<p class="row-creator wn-line">${esc(e.line)}</p>` : ""}
                </div>
                <div class="admin-row-actions">
                    ${e.post
                        ? `<button type="button" class="btn admin-edit-btn" data-wn="edit-post">Edit</button>
                           <button type="button" class="btn admin-edit-btn" data-wn="toggle-post">${e.hidden ? "Show" : "Hide"}</button>
                           <button type="button" class="btn admin-delete-btn" data-wn="delete-post">Delete</button>`
                        : `<button type="button" class="btn admin-edit-btn" data-wn="amend">${openOverride === e.target ? "Close" : "Amend"}</button>
                           <button type="button" class="btn admin-edit-btn" data-wn="toggle-hide">${e.hidden ? "Show" : "Hide"}</button>`}
                </div>
            </div>
            ${!e.post && openOverride === e.target ? overrideHtml(e) : ""}`;
    }

    // The editor for one automatic entry's override, under its row.
    function overrideHtml(e) {
        const o = e.o || {};
        return `
            <div class="wn-override" data-for="${esc(e.target)}">
                <label class="admin-field"><span>Date (empty: automatic, ${esc(e.autoDay)})</span>
                    <input type="date" data-ov="day" value="${esc(o.day || "")}"></label>
                <label class="admin-field"><span>Label</span>
                    <select data-ov="activity">
                        <option value=""${!o.activity ? " selected" : ""}>Automatic (${esc(VERBS[e.autoActivity])})</option>
                        <option value="added"${o.activity === "added" ? " selected" : ""}>Added</option>
                        <option value="updated"${o.activity === "updated" ? " selected" : ""}>Updated</option>
                    </select></label>
                <label class="admin-field wn-wide"><span>Line under it (empty: automatic)</span>
                    <input type="text" maxlength="600" data-ov="text" value="${esc(o.text || "")}" placeholder="${esc(e.autoText || "Nothing, automatically")}"></label>
                <label class="admin-field wn-check"><input type="checkbox" data-ov="hidden"${o.hidden ? " checked" : ""}> Hidden from What's New</label>
                <p class="admin-form-error" data-ov-error style="display:none;"></p>
                <div class="admin-form-actions">
                    <button type="button" class="admin-action-pill admin-pill-solid" data-wn="save-override">Save</button>
                    ${e.o ? `<button type="button" class="admin-action-pill" data-wn="reset-override">Back to automatic</button>` : ""}
                    <button type="button" class="admin-action-pill admin-cancel-btn" data-wn="amend">Cancel</button>
                </div>
            </div>`;
    }

    // ------------------------------------------------------------ loading

    let loadGen = 0;
    async function load() {
        const gen = ++loadGen;
        listEl.innerHTML = '<p class="admin-empty">Loading…</p>';
        try {
            const [r, ev, g, wn] = await Promise.all([
                Api.getRoomsFull(token()),
                Api.getEventsFull(token()),
                call("/.netlify/functions/guides?full=1", "GET").catch(() => []),
                call(`${URL_}?full=1`, "GET")
            ]);
            if (gen !== loadGen) return;
            rooms = Array.isArray(r) ? r : [];
            events = Array.isArray(ev) ? ev : [];
            guides = Array.isArray(g) ? g : (g && Array.isArray(g.records) ? g.records : []);
            posts = Array.isArray(wn && wn.posts) ? wn.posts : [];
            overrides = new Map((Array.isArray(wn && wn.overrides) ? wn.overrides : []).map(o => [o.target, o]));
            render();
        } catch (err) {
            if (gen !== loadGen) return;
            if (sessionGone(err)) { listEl.innerHTML = '<p class="admin-empty">Sign in again to see What\'s New.</p>'; return; }
            listEl.innerHTML = `<p class="admin-empty">Could not load What's New: ${esc(err.message)} <button type="button" class="ctl-btn" data-wn-retry>Try again</button></p>`;
            const retry = listEl.querySelector("[data-wn-retry]");
            if (retry) retry.addEventListener("click", load);
        }
    }

    // ------------------------------------------------------------ overrides

    async function saveOverride(target, fields) {
        if (busy) return;
        busy = true;
        try {
            const res = await call(URL_, "PUT", { override: { target, ...fields } });
            if (res && res.override) overrides.set(target, res.override);
            else overrides.delete(target);
            return true;
        } catch (err) {
            if (!sessionGone(err)) await tell(err.message || "That couldn't be saved.");
            return false;
        } finally {
            busy = false;
        }
    }

    function overrideFields(box) {
        const val = k => box.querySelector(`[data-ov="${k}"]`);
        return {
            day: val("day").value || "",
            activity: val("activity").value || "",
            text: val("text").value.trim(),
            hidden: val("hidden").checked
        };
    }

    // ------------------------------------------------------------ posts

    function openPost(p, kind) {
        if (editing) closePost();
        editing = p ? { ...p } : { kind: kind === "note" ? "note" : "news", day: today(), title: "", text: "", image: "", link: "", target: "" };
        opened = JSON.stringify(editing);
        if (openOverride) { openOverride = null; render(); }
        renderForm();
        formEl.classList.add("is-open");
        formEl.scrollIntoView({ behavior: "smooth", block: "start" });
        const first = formEl.querySelector("[data-p]");
        if (first) first.focus({ preventScroll: true });
    }
    /* Pictures uploaded during the edit and not kept by a save go: never
       one a saved post still points at (the server refuses to delete a
       picture any record or post uses, and that refusal is left alone). */
    function forget(keys) {
        keys.forEach(k => {
            Api.deleteImage(token(), k).catch(() => { /* in use, or gone: leave it */ });
        });
    }
    const keyOf = src => (typeof src === "string" && src.startsWith("/.netlify/functions/image?key=news/"))
        ? decodeURIComponent(src.slice("/.netlify/functions/image?key=".length)) : null;

    function closePost(keep) {
        if (editing) forget([...uploaded].filter(k => k !== keep));
        uploaded.clear();
        opened = "";
        editing = null;
        formEl.classList.remove("is-open");
        formEl.innerHTML = "";
    }

    function targetOptions(sel) {
        const opt = (kind, item, label) => {
            const v = `${kind}:${item.id}`;
            return `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(label)}</option>`;
        };
        const byName = (a, b) => String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""));
        const known = [...rooms.map(r => `maze:${r.id}`), ...events.map(e => `event:${e.id}`)];
        const gone = sel && !known.includes(sel)
            ? `<option value="${esc(sel)}" selected>${esc(sel)} (gone from the archive)</option>` : "";
        return `<option value="">Choose…</option>${gone}
            <optgroup label="Mazes">${rooms.slice().sort(byName).map(r => opt("maze", r, r.name || r.id)).join("")}</optgroup>
            <optgroup label="Events">${events.slice().sort(byName).map(e => opt("event", e, e.title || e.id)).join("")}</optgroup>`;
    }

    function renderForm() {
        const p = editing;
        const news = p.kind === "news";
        formEl.innerHTML = `
            <h3 class="admin-form-title">${p.id ? "Edit post" : news ? "New news post" : "New note"}</h3>
            <label class="admin-field"><span>Kind</span>
                <select data-p="kind">
                    <option value="news"${news ? " selected" : ""}>Site news</option>
                    <option value="note"${!news ? " selected" : ""}>A note about a maze or event</option>
                </select></label>
            <label class="admin-field"><span>Date (the day it's filed under)</span>
                <input type="date" data-p="day" value="${esc(p.day)}" required></label>
            ${news ? `
                <label class="admin-field wn-wide"><span>Title</span>
                    <input type="text" maxlength="120" data-p="title" value="${esc(p.title)}" required></label>
                <label class="admin-field wn-wide"><span>Text (optional, a few lines)</span>
                    <textarea rows="3" maxlength="600" data-p="text">${esc(p.text)}</textarea></label>
                <div class="admin-field"><span>Picture (optional)</span>
                    <div class="guides-pic">
                        ${p.image ? `<img src="${esc(p.image)}" alt="">` : `<span class="guides-pic-empty">No picture</span>`}
                        <div class="guides-pic-actions">
                            <label class="admin-action-pill guides-pic-upload">${p.image ? "Replace" : "Upload picture"}
                                <input type="file" class="admin-gallery-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp" data-p-upload></label>
                            ${p.image ? `<button type="button" class="admin-action-pill admin-pill-danger" data-wn="unpic">Remove</button>` : ""}
                            <span class="guides-pic-status" data-p-status></span>
                        </div>
                    </div></div>
                <label class="admin-field"><span>Link (optional: /profile, /guides, /maze/…, or https://…)</span>
                    <input type="text" maxlength="400" data-p="link" value="${esc(p.link)}" placeholder="/profile"></label>`
            : `
                <label class="admin-field wn-wide"><span>Maze or event</span>
                    <select data-p="target" required>${targetOptions(p.target)}</select></label>
                <label class="admin-field wn-wide"><span>Note</span>
                    <textarea rows="3" maxlength="600" data-p="text" required>${esc(p.text)}</textarea></label>`}
            <p class="admin-form-error" data-p-error style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="button" class="admin-action-pill admin-pill-solid" data-wn="save-post">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn" data-wn="cancel-post">Cancel</button>
            </div>`;
    }

    // What's typed, kept on `editing` so a redraw (kind changed, picture
    // uploaded) keeps it.
    function readForm() {
        formEl.querySelectorAll("[data-p]").forEach(el => { editing[el.dataset.p] = el.value; });
    }

    function formError(text) {
        const out = formEl.querySelector("[data-p-error]");
        if (!out) return;
        out.textContent = text || "";
        out.style.display = text ? "" : "none";
    }

    async function savePost() {
        if (busy) return;
        readForm();
        const p = editing;
        const body = { kind: p.kind, day: p.day, text: p.text || "", title: p.title || "", image: p.image || "", link: (p.link || "").trim(), target: p.target || "", hidden: p.hidden === true };
        if (p.id) body.id = p.id;
        busy = true;
        formError("");
        try {
            const before = p.id ? posts.find(x => x.id === p.id) : null;
            const saved = await call(URL_, p.id ? "PUT" : "POST", body);
            posts = posts.filter(x => x.id !== saved.id).concat(saved);
            // The picture this post had before, if the save replaced it.
            const old = before && keyOf(before.image);
            closePost(keyOf(saved.image));
            if (old && old !== keyOf(saved.image)) forget([old]);
            render();
        } catch (err) {
            if (!sessionGone(err)) formError(err.message || "That couldn't be saved.");
        } finally {
            busy = false;
        }
    }

    async function upload(file) {
        const status = formEl.querySelector("[data-p-status]");
        if (status) status.textContent = "Uploading…";
        const forEdit = editing;
        try {
            if (typeof window.AdminUpload !== "function") throw new Error("the uploader is not ready - reload the page");
            const result = await window.AdminUpload(editing.title || "news", file, "news");
            // The edit it was for has ended or another opened: nothing will
            // point at this picture, so it goes now.
            if (editing !== forEdit) { forget([result.key]); return; }
            uploaded.add(result.key);
            readForm();
            editing.image = result.url;
            renderForm();
        } catch (err) {
            if (sessionGone(err)) return;
            const s = formEl.querySelector("[data-p-status]");
            if (s) s.textContent = `Upload failed: ${err.message}`;
        }
    }

    // ------------------------------------------------------------ events

    listEl.addEventListener("click", async e => {
        const btn = e.target.closest("[data-wn]");
        if (!btn) return;
        const act = btn.dataset.wn;
        const row = btn.closest("[data-key]") || btn.closest("[data-for]");
        const key = row ? (row.dataset.key || row.dataset.for) : "";

        if (act === "amend") {
            openOverride = openOverride === key ? null : key;
            render();
            return;
        }
        if (act === "toggle-hide") {
            const o = overrides.get(key) || {};
            const ok = await saveOverride(key, { day: o.day || "", activity: o.activity || "", text: o.text || "", hidden: !o.hidden });
            if (ok) render();
            return;
        }
        if (act === "save-override" || act === "reset-override") {
            const box = btn.closest("[data-for]");
            const fields = act === "reset-override" ? { day: "", activity: "", text: "", hidden: false } : overrideFields(box);
            const ok = await saveOverride(key, fields);
            if (ok) { openOverride = null; render(); }
            return;
        }
        if (act === "toggle-post") {
            // Hide or show one post on its own, as the automatic entries can be.
            const p = posts.find(x => x.id === key.replace(/^post:/, ""));
            if (!p || busy) return;
            busy = true;
            try {
                const saved = await call(URL_, "PUT", { ...p, hidden: !p.hidden });
                posts = posts.filter(x => x.id !== saved.id).concat(saved);
                render();
            } catch (err) {
                if (!sessionGone(err)) await tell(err.message || "That couldn't be saved.");
            } finally {
                busy = false;
            }
            return;
        }
        if (act === "edit-post" || act === "delete-post") {
            const id = key.replace(/^post:/, "");
            const p = posts.find(x => x.id === id);
            if (!p) return;
            if (act === "edit-post") { openPost(p); return; }
            const what = p.kind === "news" ? `the news post "${esc(p.title)}"` : "this note";
            if (!await ask(`Delete ${what}? It comes off What's New at once.`, { danger: true })) return;
            try {
                await call(`${URL_}?id=${encodeURIComponent(p.id)}`, "DELETE");
                posts = posts.filter(x => x.id !== p.id);
                if (keyOf(p.image)) forget([keyOf(p.image)]);
                render();
            } catch (err) {
                if (!sessionGone(err)) await tell(err.message || "That couldn't be deleted.");
            }
        }
    });

    formEl.addEventListener("click", e => {
        const btn = e.target.closest("[data-wn]");
        if (!btn) return;
        if (btn.dataset.wn === "save-post") savePost();
        else if (btn.dataset.wn === "cancel-post") closePost();
        else if (btn.dataset.wn === "unpic") { readForm(); editing.image = ""; renderForm(); }
    });
    formEl.addEventListener("submit", e => { e.preventDefault(); savePost(); });
    formEl.addEventListener("change", e => {
        if (e.target.matches('[data-p="kind"]')) { readForm(); renderForm(); }
        else if (e.target.matches("[data-p-upload]") && e.target.files && e.target.files[0]) upload(e.target.files[0]);
    });

    panel.querySelector("#wn-add-news").addEventListener("click", () => openPost(null));
    panel.querySelector("#wn-add-note").addEventListener("click", () => openPost(null, "note"));
    searchEl.addEventListener("input", render);
    hiddenEl.addEventListener("change", render);

    // ------------------------------------------------------------ mount

    function maybeMount() {
        if (mounted || panel.hidden || !token()) return;
        mounted = true;
        load();
    }
    new MutationObserver(maybeMount).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    maybeMount();

    /* For admin.js, as js/admin-guides.js offers: reset() forgets the last
       account's list and edit, and loads again when next shown. */
    window.AdminWhatsNew = {
        isDirty() {
            if (!editing) return false;
            readForm();
            return JSON.stringify(editing) !== opened;
        },
        close() { if (editing) closePost(); },
        reset() {
            loadGen++;
            // Another account's uploads are left, not deleted with this
            // one's token (as js/admin-guides.js leaves them).
            uploaded.clear();
            closePost();
            openOverride = null;
            rooms = []; events = []; guides = []; posts = []; overrides = new Map();
            listEl.innerHTML = "";
            mounted = false;
            maybeMount();
        }
    };
})();

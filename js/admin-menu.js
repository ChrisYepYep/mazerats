/* The Warren's homepage menu card (warren.html, Controls › Website and games,
   #menu-layout-card).

   30 Oct 2026, the owner's: "give me the ability to reorder the menu tab on
   the homepage, and hide menu options too", then "i need the ability to move
   things out of folds, and a drag to reorder function". The homepage's side
   menu, top to bottom, is a list of folds (ARCHIVE, GAMES) and rows standing
   on their own; this card lays it out:

     · drag a row by its handle (☰) anywhere: before or after another row,
       inside a fold or out on its own, or onto a fold's title to put it at
       the top of that fold;
     · drag a fold by its handle to move it, its rows with it;
     · or the arrows, for the keyboard: a row steps up and down, out of its
       fold at the fold's edge and into a fold it meets;
     · each row is Shown, Admins only (seen once a signed-in admin's token is
       vouched for, as Scout's Trail is shown while Hidden: for trying a row
       before it goes public) or Hidden;
     · each fold can start open on a page load (they start shut).

   Nothing is live until Save, as the spotlight's order is; Discard drops the
   draft, and Reset puts the menu back as js/home.js writes it (menuLayout
   null). Stored as the site setting menuLayout { top, folds, hidden, admins,
   open }, checked by netlify/functions/settings.js (MENU_ROWS there names
   the same ids as ROWS here) and worn by applyMenuLayout in js/home.js. */
(function () {
    "use strict";

    const FOLDS = { archive: "ARCHIVE", games: "GAMES" };
    // Each row: its id, its words on the homepage, and where js/home.js writes it.
    const ROWS = [
        ["home", "Home", "archive"], ["mazes", "Mazes (with its sections)", "archive"], ["events", "Events (with its sections)", "archive"],
        ["timeline", "Timeline", "archive"], ["furni", "Furni", "archive"], ["whats-new", "What's New", "archive"],
        ["guides", "Guides", "archive"], ["missing-pieces", "Missing Pieces", "archive"],
        ["guess", "Guess the Maze", "games"], ["odd", "Odd One Out", "games"], ["fallin-furni", "Fallin' Furni", "games"],
        ["pura", "Pura Panic", "games"], ["scout", "Scout's Trail", "games"], ["leaderboards", "Leaderboards", "games"],
        ["profile", "Your Profile", "loose"], ["alt-codes", "Alt Codes (never on a phone)", "loose"]
    ].map(([id, name, home]) => ({ id, name, home }));
    const NAME = Object.fromEntries(ROWS.map(r => [r.id, r.name]));
    const isFold = id => Object.prototype.hasOwnProperty.call(FOLDS, id);

    const $ = id => document.getElementById(id);
    const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const token = () => (typeof window.AdminToken === "function" ? window.AdminToken() : "") || get("mazerats_admin_token");
    function canWrite() {
        let r = "";
        try { r = typeof window.AdminRole === "function" ? String(window.AdminRole() || "") : ""; } catch (e) { r = ""; }
        if (r) return r === "owner" || r === "admin";
        return !document.body.classList.contains("is-viewer");
    }

    let saved = null;      // the layout as stored (null: the menu as written)
    let savedAt = "";      // its menuLayoutAt, sent back on Save as menuLayoutBase (31 Oct 2026)
    let draft = null;      // the layout being edited, always whole
    let loaded = false;
    let saving = false;
    let dragging = null;   // { kind: "row" | "fold", id } while a drag is on

    // A layout, whole: both folds and every row placed exactly once.
    function whole(layout) {
        const l = layout && typeof layout === "object" && Array.isArray(layout.top) ? layout : null;
        const placed = new Set();
        const top = [];
        const folds = { archive: [], games: [] };
        if (l) {
            l.top.forEach(id => {
                if (isFold(id) ? top.includes(id) : (!NAME[id] || placed.has(id))) return;
                top.push(id);
                if (!isFold(id)) placed.add(id);
            });
            Object.keys(FOLDS).forEach(f => {
                (l.folds && Array.isArray(l.folds[f]) ? l.folds[f] : []).forEach(id => {
                    if (NAME[id] && !placed.has(id)) { folds[f].push(id); placed.add(id); }
                });
            });
        }
        Object.keys(FOLDS).forEach(f => { if (!top.includes(f)) top.push(f); });
        // A row placed nowhere goes back where it is written.
        if (!l) { top.length = 0; top.push("archive", "games"); }
        ROWS.forEach(r => {
            if (placed.has(r.id)) return;
            if (r.home === "loose") top.push(r.id); else folds[r.home].push(r.id);
            placed.add(r.id);
        });
        const hidden = (l && Array.isArray(l.hidden) ? l.hidden : []).filter(id => NAME[id]);
        const admins = (l && Array.isArray(l.admins) ? l.admins : []).filter(id => NAME[id] && !hidden.includes(id));
        const open = (l && Array.isArray(l.open) ? l.open : []).filter(isFold);
        return { top, folds, hidden, admins, open };
    }
    const key = l => JSON.stringify(whole(l));
    const changed = () => loaded && key(draft) !== key(saved);
    const isDefault = l => key(l) === key(null);

    function say(text, bad) {
        const s = $("menu-layout-status");
        if (!s) return;
        s.textContent = text;
        s.classList.toggle("is-bad", !!bad);
        s.style.display = text ? "block" : "none";
    }

    function seen(id) {
        if (draft.hidden.includes(id)) return "hidden";
        if (draft.admins.includes(id)) return "admins";
        return "shown";
    }
    function setSeen(id, how) {
        draft.hidden = draft.hidden.filter(x => x !== id);
        draft.admins = draft.admins.filter(x => x !== id);
        if (how === "hidden") draft.hidden.push(id);
        if (how === "admins") draft.admins.push(id);
    }

    // Where a row is: { list, at, fold } (fold null when it stands on its own).
    function where(id) {
        for (const f of Object.keys(FOLDS)) {
            const at = draft.folds[f].indexOf(id);
            if (at >= 0) return { list: draft.folds[f], at, fold: f };
        }
        return { list: draft.top, at: draft.top.indexOf(id), fold: null };
    }
    function take(id) { const w = where(id); if (w.at >= 0) w.list.splice(w.at, 1); }

    /* The arrows. A row in a fold steps within it, and past its top or bottom
       out of the fold, just above or below it. A row on its own steps past its
       neighbour, and into a fold it meets (at the fold's near end). */
    function moveRow(id, step) {
        const w = where(id);
        if (w.fold) {
            const to = w.at + step;
            if (to >= 0 && to < w.list.length) { [w.list[w.at], w.list[to]] = [w.list[to], w.list[w.at]]; return; }
            w.list.splice(w.at, 1);
            const fi = draft.top.indexOf(w.fold);
            draft.top.splice(step < 0 ? fi : fi + 1, 0, id);
            return;
        }
        const to = w.at + step;
        if (to < 0 || to >= draft.top.length) return;
        const next = draft.top[to];
        if (isFold(next)) {
            draft.top.splice(w.at, 1);
            if (step > 0) draft.folds[next].unshift(id); else draft.folds[next].push(id);
            return;
        }
        [draft.top[w.at], draft.top[to]] = [draft.top[to], draft.top[w.at]];
    }
    function moveFold(f, step) {
        const at = draft.top.indexOf(f), to = at + step;
        if (to < 0 || to >= draft.top.length) return;
        [draft.top[at], draft.top[to]] = [draft.top[to], draft.top[at]];
    }

    /* A drop. `target` is { kind: "row" | "fold" | "into", id, after }:
       before or after a row (in whichever list it is in), before or after a
       fold (on the top level), or into a fold at its top. */
    function drop(target) {
        if (!dragging || !target) return;
        const { kind, id } = dragging;
        if (target.id === id) return;
        if (target.kind === "end") {
            if (kind === "fold") draft.top.splice(draft.top.indexOf(id), 1); else take(id);
            draft.top.push(id);
            return;
        }
        if (kind === "fold") {
            const anchor = target.kind === "row" ? (where(target.id).fold || target.id) : target.id;
            if (anchor === id) return;
            draft.top.splice(draft.top.indexOf(id), 1);
            const at = draft.top.indexOf(anchor);
            draft.top.splice(target.after ? at + 1 : at, 0, id);
            return;
        }
        take(id);
        if (target.kind === "into") { draft.folds[target.id].unshift(id); return; }
        if (target.kind === "fold") {
            const at = draft.top.indexOf(target.id);
            draft.top.splice(target.after ? at + 1 : at, 0, id);
            return;
        }
        const w = where(target.id);
        w.list.splice(target.after ? w.at + 1 : w.at, 0, id);
    }

    function el(tag, props, kids) {
        const n = document.createElement(tag);
        Object.assign(n, props || {});
        (kids || []).forEach(k => n.appendChild(typeof k === "string" ? document.createTextNode(k) : k));
        return n;
    }
    function arrow(dir, label, disabled, focusKey, run) {
        const b = el("button", { type: "button", className: "ctl-btn", innerHTML: dir < 0 ? "&#9650;" : "&#9660;", disabled });
        b.setAttribute("aria-label", label);
        b.title = label;
        b.dataset.focus = focusKey;
        b.addEventListener("click", () => { run(); say(""); paint(focusKey); });
        return b;
    }
    function handle(kind, id, write) {
        const h = el("span", { className: "menu-lay-grip", innerHTML: "&#9776;", title: write ? "Drag to move" : "" });
        h.setAttribute("aria-hidden", "true");
        if (!write) return h;
        h.draggable = true;
        h.addEventListener("dragstart", e => {
            dragging = { kind, id };
            const all = h.closest(".menu-lay-list");
            if (all) all.classList.add("is-dragging");
            try { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; } catch (err) { /* old browser */ }
            const li = h.closest("li");
            if (li) requestAnimationFrame(() => li.classList.add("is-dragging"));
        });
        h.addEventListener("dragend", () => { dragging = null; clearMarks(); const all = $("menu-layout-list"); if (all) all.classList.remove("is-dragging"); paint(); });
        return h;
    }

    function rowLi(id, write, upOff, downOff, inFold) {
        const how = seen(id);
        const li = el("li", { className: "menu-lay-row is-" + how + (inFold ? "" : " is-loose") });
        li.dataset.row = id;
        li.appendChild(handle("row", id, write));
        li.appendChild(el("span", { className: "menu-lay-name", textContent: NAME[id] }));
        if (!inFold) li.appendChild(el("span", { className: "menu-lay-loose", textContent: "on its own" }));
        const pick = el("select", { className: "ctl-input menu-lay-seen", disabled: !write });
        pick.setAttribute("aria-label", `Who sees ${NAME[id]}`);
        [["shown", "Shown"], ["admins", "Admins only"], ["hidden", "Hidden"]].forEach(([v, t]) => {
            pick.appendChild(el("option", { value: v, textContent: t, selected: v === how }));
        });
        pick.addEventListener("change", () => { setSeen(id, pick.value); say(""); paint(); });
        li.append(pick,
            arrow(-1, `Move ${NAME[id]} up`, !write || upOff, "r-up-" + id, () => moveRow(id, -1)),
            arrow(1, `Move ${NAME[id]} down`, !write || downOff, "r-down-" + id, () => moveRow(id, 1)));
        return li;
    }

    function paint(focus) {
        const list = $("menu-layout-list");
        if (!list || !draft) return;
        const write = loaded && canWrite() && !saving;
        list.replaceChildren();
        draft.top.forEach((item, ti) => {
            if (!isFold(item)) {
                list.appendChild(rowLi(item, write, ti === 0, ti === draft.top.length - 1, false));
                return;
            }
            const box = el("li", { className: "menu-lay-block" });
            box.dataset.fold = item;
            const head = el("div", { className: "menu-lay-head" });
            head.appendChild(handle("fold", item, write));
            head.appendChild(el("span", { className: "menu-lay-block-name", textContent: FOLDS[item] + " fold" }));
            const lab = el("label", { className: "menu-lay-open" });
            const tick = el("input", { type: "checkbox", checked: draft.open.includes(item), disabled: !write });
            tick.addEventListener("change", () => {
                draft.open = draft.open.filter(x => x !== item);
                if (tick.checked) draft.open.push(item);
                say(""); paint();
            });
            lab.append(tick, " Starts open");
            head.append(lab,
                arrow(-1, `Move the ${FOLDS[item]} fold up`, !write || ti === 0, "f-up-" + item, () => moveFold(item, -1)),
                arrow(1, `Move the ${FOLDS[item]} fold down`, !write || ti === draft.top.length - 1, "f-down-" + item, () => moveFold(item, 1)));
            box.appendChild(head);
            const rows = el("ol", { className: "menu-lay-rows" });
            const ids = draft.folds[item];
            if (!ids.length) {
                const empty = el("li", { className: "menu-lay-empty", textContent: "Empty, so not shown. Drag a row here." });
                empty.dataset.into = item;
                rows.appendChild(empty);
            }
            ids.forEach(id => rows.appendChild(rowLi(id, write, false, false, true)));
            box.appendChild(rows);
            list.appendChild(box);
        });
        // The foot of the list, a place to drop while a drag is on (css/warren.css shows it then).
        const end = el("li", { className: "menu-lay-end", textContent: "Drop here to put it at the bottom, on its own" });
        end.dataset.end = "1";
        list.appendChild(end);
        const dirty = changed();
        const saveBtn = $("menu-layout-save"), discard = $("menu-layout-discard"), reset = $("menu-layout-reset");
        if (saveBtn) saveBtn.disabled = !write || !dirty;
        if (discard) discard.disabled = !dirty || saving;
        if (reset) reset.disabled = !write || isDefault(draft);
        const now = $("menu-layout-now");
        if (now) now.textContent = isDefault(saved) ? "The homepage menu is as it was built." : "The homepage menu is laid out as saved here.";
        // Focus follows the button pressed, so pressing again keeps moving the same thing.
        if (focus) {
            const again = list.querySelector(`[data-focus="${focus}"]:not(:disabled)`);
            if (again) again.focus();
            else { const sb = $("menu-layout-save"); if (sb && !sb.disabled) sb.focus(); }
        }
    }

    // ---------------- dragging: where a drop would land, shown as it moves ----------------
    function clearMarks() {
        const list = $("menu-layout-list");
        if (list) list.querySelectorAll(".drop-before, .drop-after, .drop-into").forEach(n => n.classList.remove("drop-before", "drop-after", "drop-into"));
    }
    function targetAt(e) {
        const node = e.target instanceof Element ? e.target : null;
        if (!node || !dragging) return null;
        const into = node.closest("[data-into]");
        if (into && dragging.kind === "row") return { kind: "into", id: into.dataset.into, mark: into, cls: "drop-into" };
        // The strip at the foot of the list: the very bottom, on its own.
        if (node.closest("[data-end]")) return { kind: "end", id: "", mark: node.closest("[data-end]"), cls: "drop-into" };
        /* A fold's title bar: its top third is just above the fold (the way
           to put a row over the first fold), the rest is into the fold. */
        const head = node.closest(".menu-lay-head");
        if (head && dragging.kind === "row") {
            const fold = head.closest("[data-fold]"), f = fold.dataset.fold, hb = head.getBoundingClientRect();
            if (e.clientY < hb.top + hb.height / 3) return { kind: "fold", id: f, after: false, mark: fold, cls: "drop-before" };
            return { kind: "into", id: f, mark: fold, cls: "drop-into" };
        }
        let li = node.closest("[data-row], [data-fold]");
        if (!li) return null;
        // A fold being dragged lands beside top-level things only: a row in a fold counts as its fold.
        if (dragging.kind === "fold" && li.dataset.row && li.closest("[data-fold]")) li = li.closest("[data-fold]");
        const box = li.getBoundingClientRect();
        const after = e.clientY > box.top + box.height / 2;
        if (li.dataset.row) return { kind: "row", id: li.dataset.row, after, mark: li, cls: after ? "drop-after" : "drop-before" };
        return { kind: "fold", id: li.dataset.fold, after, mark: li, cls: after ? "drop-after" : "drop-before" };
    }
    function wireDrops(list) {
        list.addEventListener("dragover", e => {
            const t = targetAt(e);
            clearMarks();
            if (!t || t.id === dragging.id) return;
            e.preventDefault();
            try { e.dataTransfer.dropEffect = "move"; } catch (err) { /* old browser */ }
            t.mark.classList.add(t.cls);
        });
        list.addEventListener("dragleave", e => { if (!list.contains(e.relatedTarget)) clearMarks(); });
        list.addEventListener("drop", e => {
            const t = targetAt(e);
            e.preventDefault();
            clearMarks();
            if (t && t.id !== (dragging && dragging.id)) { drop(t); say(""); }
            dragging = null;
            list.classList.remove("is-dragging");
            paint();
        });
    }

    async function load() {
        try {
            const res = await fetch("/.netlify/functions/settings?fresh=" + Date.now(), { cache: "no-store" });
            if (!res.ok) throw new Error("settings " + res.status);
            const s = await res.json();
            saved = s.menuLayout || null;
            savedAt = typeof s.menuLayoutAt === "string" ? s.menuLayoutAt : "";
            draft = whole(saved);
            loaded = true;
            say("");
        } catch (e) {
            draft = whole(saved);
            say("Couldn't read the settings. Reload to try again.", true);
        }
        paint();
    }

    async function save(layout, done) {
        const t = token();
        if (!t) { say("Sign in first.", true); return; }
        saving = true;
        paint();
        say("Saving…");
        try {
            const s = await Api.updateSiteSettings(t, { menuLayout: layout, menuLayoutBase: savedAt });
            saved = s && "menuLayout" in s ? s.menuLayout : layout;
            if (s && typeof s.menuLayoutAt === "string") savedAt = s.menuLayoutAt;
            draft = whole(saved);
            saving = false;
            say(done);
        } catch (e) {
            saving = false;
            if (e && e.status === 409 && e.data && typeof e.data === "object") {
                await conflict(e.data);
                return;
            }
            if (e && e.status === 401) {
                say("Not saved: your session had expired. Sign in, then try again.", true);
                if (typeof window.AdminLockOut === "function") window.AdminLockOut();
            } else {
                say((e && e.message) || "Couldn't save the menu. Try again.", true);
            }
        }
        paint();
    }

    /* SOMEONE ELSE SAVED FIRST (31 Oct 2026, the bug scan): another admin,
       or this one in another tab, saved the menu after this page read it,
       and settings.js refused to save over it unseen (409, with the layout
       now stored). Yes takes theirs and drops this draft; No keeps the draft
       and takes their stamp, so pressing Save again puts this one live over
       theirs, knowingly. Either way the stored layout is what `saved` is. */
    async function conflict(data) {
        saved = data.menuLayout || null;
        savedAt = typeof data.menuLayoutAt === "string" ? data.menuLayoutAt : "";
        paint();
        const ask = window.AdminConfirm
            ? window.AdminConfirm("Someone else (or you, in another tab) has saved the homepage menu since you opened this page, so yours was not saved.<br><br>Load their menu instead? Your changes here will be thrown away. Press No to keep your changes; Save then puts yours live over theirs.")
            : Promise.resolve(false);
        if (await ask) {
            draft = whole(saved);
            say("Their menu is loaded. This is what visitors see now.");
        } else {
            say(changed()
                ? "Not saved: someone else changed the menu first. Press Save again to put yours live over theirs, or Discard to take theirs."
                : "Someone else had already saved the same layout as yours, so there is nothing to save.", changed());
        }
        paint();
    }

    // For js/admin.js: a layout moved and not saved, for the log out and leave-page questions.
    window.AdminMenu = {
        isDirty: () => changed(),
        reset() { if (!loaded) return; draft = whole(saved); say(""); paint(); }
    };

    document.addEventListener("DOMContentLoaded", () => {
        if (!$("menu-layout-card")) return;
        draft = whole(null);
        wireDrops($("menu-layout-list"));
        paint();
        $("menu-layout-save").addEventListener("click", () => {
            if (!changed() || saving) return;
            // The menu as written is stored as null, so a layout put back by hand needs no record.
            const layout = isDefault(draft) ? null : whole(draft);
            save(layout, "Saved. Visitors see the new menu on their next page load.");
        });
        $("menu-layout-discard").addEventListener("click", () => {
            draft = whole(saved);
            say("");
            paint();
        });
        $("menu-layout-reset").addEventListener("click", async () => {
            /* The Warren's own Yes/No box (31 Oct 2026, the bug scan), as
               everywhere else since the native ones went on 30 Sept; the
               browser's confirm() only if js/admin.js hasn't given it. */
            const msg = "Put the homepage menu back as it was built? Every row shown, in its own place, and both folds shut. You can still Discard before saving.";
            if (!(await (window.AdminConfirm ? window.AdminConfirm(msg) : Promise.resolve(window.confirm(msg))))) return;
            draft = whole(null);
            say("Back as built. Press Save to put it live.");
            paint();
        });
        /* The role is known only once someone has signed in (30 Oct 2026, the
           bug scan): the settings read usually lands first, and the card was
           painted for the page's default role, so a view-only account found
           every select, arrow and handle live (the Save then refused). Painted
           again when js/admin.js puts body.is-viewer on or takes it off, as
           js/admin-skin.js does. */
        let viewer = document.body.classList.contains("is-viewer");
        new MutationObserver(() => {
            const now = document.body.classList.contains("is-viewer");
            if (now === viewer) return;
            viewer = now;
            paint();
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
        load();
    });
})();

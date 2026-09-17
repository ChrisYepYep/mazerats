/* The recolour editor: the admin panel's front end for js/recolour.js.

   Self-contained on purpose. admin.js is five thousand lines and every panel
   in it shares one render pass; this one owns a container, keeps its own
   state and talks to the engine and the palettes endpoint, so it can be read
   and changed without reading anything else.

   ----------------------------------------------------------------------
   WHAT THE EDITOR IS ACTUALLY EDITING

   Not a stylesheet. A DIFF — the colours that are not what style.css says,
   and nothing else. Everything on screen is drawn from a live scan of the
   running stylesheet, so the list is whatever the site is painted with today
   rather than a list somebody kept up to date by hand.

   THE PREVIEW IS THE ADMIN PAGE ITSELF, which is the whole reason this is
   usable. A palette applied to a swatch grid tells you nothing; applied to
   the page you are standing on, it tells you immediately that the disabled
   button has vanished and the table stripes have stopped being visible. The
   panel is deliberately not exempted from its own preview.

   ----------------------------------------------------------------------
   283 SWATCHES IS NOT A USER INTERFACE

   The engine finds every colour, which is the point, but a flat list of them
   is useless. Three things make it navigable, in order of how much they
   help: the colours are grouped by WHAT THEY PAINT (scrollbars, windows,
   buttons) rather than by their hex; every swatch says how many rules use it,
   so the one that changes half the site sorts above the one that changes a
   single border; and a search box filters on the colour, the selector and the
   area at once, because people look for "that brown on the tabs" by all three
   depending on what they remember. */

window.AdminRecolour = (function () {
    "use strict";

    const API = "/.netlify/functions/palettes";

    /* The starting point for a new palette, and the thing "Revert" reverts
       to: the site with nothing overridden at all. */
    const EMPTY = () => ({ vars: {}, decls: {}, sprites: {} });

    const state = {
        catalogue: null,
        palette: EMPTY(),
        saved: [],              // presets from the database
        current: null,          // the preset being edited, or null for unsaved
        name: "",
        live: true,             // preview on the panel as you go
        filter: "",
        group: "all",
        dirty: false,
        history: []             // for undo, newest first
    };

    /* `shell` is the container admin.js hands over; `root` is the part this
       redraws. They are kept apart so the status line is not wiped by the
       render that happens one line after something is said into it. */
    let shell = null, root = null, statusEl = null, token = null;

    let sayTimer = null;
    function say(msg, kind) {
        if (!statusEl) return;
        statusEl.textContent = msg || "";
        statusEl.className = "rc-status" + (kind ? " is-" + kind : "");
        clearTimeout(sayTimer);
        if (msg) sayTimer = setTimeout(() => { statusEl.textContent = ""; statusEl.className = "rc-status"; }, 6000);
    }
    const esc = (s) => String(s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    /* ---------------------------------------------------------- the model */

    const keyOf = (item) => item.kind === "var" ? item.name : item.key;

    /* One flat list of everything editable, variables first. A variable is
       worth more than a literal — it is the colour the site was designed
       around and moving it moves everything downstream — so it leads its
       group rather than sorting in among the one-offs by usage count. */
    function items() {
        const cat = state.catalogue;
        const out = [];
        for (const v of cat.vars) {
            if (!v.rgba) continue;
            out.push({
                kind: "var", name: v.name, label: v.name.replace(/^--/, "").replace(/-/g, " "),
                original: v.value, rgba: v.rgba,
                role: Recolour.roleOf(v.rgba), area: "Core tokens", count: null,
                where: "Used everywhere the stylesheet says var(" + v.name + ")"
            });
        }
        for (const d of cat.decls) {
            out.push({
                kind: "decl", key: d.key, label: d.prop,
                original: d.colour, rgba: d.rgba, role: d.role, area: d.area, count: d.count,
                where: d.uses.slice(0, 6).map(u => u.sel).join(",  ")
            });
        }
        return out;
    }

    const valueOf = (item) => {
        const p = item.kind === "var" ? state.palette.vars : state.palette.decls;
        return p[keyOf(item)] || item.original;
    };

    const isChanged = (item) => {
        const p = item.kind === "var" ? state.palette.vars : state.palette.decls;
        return Object.prototype.hasOwnProperty.call(p, keyOf(item));
    };

    function setColour(item, value, record) {
        const p = item.kind === "var" ? state.palette.vars : state.palette.decls;
        const k = keyOf(item);
        if (record !== false) state.history.unshift({ kind: item.kind, key: k, was: p[k] });
        if (state.history.length > 200) state.history.pop();
        if (!value || value === item.original) delete p[k]; else p[k] = value;
        state.dirty = true;
        if (state.live) applyLive();
    }

    function undo() {
        const h = state.history.shift();
        if (!h) { say("Nothing left to undo.", ""); return; }
        const p = h.kind === "var" ? state.palette.vars : state.palette.decls;
        if (h.was === undefined) delete p[h.key]; else p[h.key] = h.was;
        state.dirty = true;
        if (state.live) applyLive();
        render();
    }

    let applyTimer = null;
    function applyLive() {
        /* Coalesced. A colour input fires on every movement of the picker and
           each apply rebuilds 30KB of CSS and up to 27 sprites; without this
           the panel stutters while you are dragging, which is exactly when it
           needs to feel immediate. */
        clearTimeout(applyTimer);
        applyTimer = setTimeout(() => Recolour.apply(state.palette), 40);
    }

    /* ------------------------------------------------------------ sprites

       Two colours per group and the art is re-lit between them. Expressed as
       "darkest" and "lightest" rather than as the nine numbers tools/themes.js
       takes, because those numbers are a transform and these are a picture:
       you can see what you are choosing. */
    const SPRITE_GROUPS = [
        { id: "buttons", label: "Buttons", hint: "Every pushable thing: the tabs, the console keys, the maze list's Go." },
        { id: "frames", label: "Windows & frames", hint: "The carved surround, the titlebar pattern and the close cross." },
        { id: "scrollbars", label: "Scrollbars", hint: "Track, thumb and both arrows, in all three states." },
        { id: "icons", label: "Tab icons", hint: "The Mazes and Events pictograms." },
        { id: "background", label: "Page background", hint: "The tiled maze pattern behind everything." }
    ];

    /* --------------------------------------------------------------- draw */

    function swatchRow(item, i) {
        const value = valueOf(item);
        const rgba = Recolour.parse(value) || item.rgba;
        const changed = isChanged(item);
        const hex = "#" + [0, 1, 2].map(n => Math.round(rgba[n]).toString(16).padStart(2, "0")).join("");
        const hasAlpha = item.rgba[3] < 1;
        /* Contrast against the page's own background, which is what almost
           everything here sits on. Only shown once it is actually bad, or the
           row turns into a wall of green ticks nobody reads. */
        const bg = Recolour.parse(state.palette.vars["--bg-black"] || "#120c07");
        const ratio = Recolour.contrast(rgba, bg);
        const warn = (item.role === "bright" || item.label === "color") && ratio < 4.5;

        return '<div class="rc-row' + (changed ? " is-changed" : "") + '" data-i="' + i + '">' +
            '<label class="rc-chip" style="background:' + esc(value) + '">' +
                '<input type="color" value="' + esc(hex) + '" data-role="picker" aria-label="Pick a colour">' +
            '</label>' +
            '<div class="rc-meta">' +
                '<div class="rc-name">' + esc(item.label) +
                    (item.count ? ' <span class="rc-count">' + item.count + ' rule' + (item.count === 1 ? "" : "s") + '</span>' : "") +
                    (changed ? ' <span class="rc-dot" title="Changed from the site\'s own colour"></span>' : "") +
                '</div>' +
                '<div class="rc-where" title="' + esc(item.where) + '">' + esc(item.area) + ' &middot; ' + esc(item.where.slice(0, 80)) + '</div>' +
            '</div>' +
            '<input type="text" class="rc-hex" value="' + esc(value) + '" data-role="hex" spellcheck="false" aria-label="Colour value">' +
            (hasAlpha
                ? '<input type="range" class="rc-alpha" min="0" max="100" value="' + Math.round(rgba[3] * 100) + '" data-role="alpha" title="Opacity">'
                : '<span class="rc-alpha-none"></span>') +
            (warn ? '<span class="rc-warn" title="Contrast against the page background is ' + ratio.toFixed(1) + ':1, below the 4.5:1 that small text needs">low contrast</span>' : "") +
            '<button type="button" class="rc-revert" data-role="revert"' + (changed ? "" : " disabled") + ' title="Back to the site\'s own colour">&#8630;</button>' +
        '</div>';
    }

    function render() {
        if (!root) return;
        const all = items();
        const q = state.filter.toLowerCase().trim();
        const shown = all.filter(it => {
            if (state.group !== "all" && it.role !== state.group && it.area !== state.group) return false;
            if (!q) return true;
            return (it.label + " " + it.area + " " + it.original + " " + it.where).toLowerCase().includes(q);
        });

        const groups = new Map();
        for (const it of shown) {
            if (!groups.has(it.area)) groups.set(it.area, []);
            groups.get(it.area).push(it);
        }

        const changedCount = Object.keys(state.palette.vars).length + Object.keys(state.palette.decls).length;
        const areas = ["all", ...new Set(all.map(i => i.area))];

        root.innerHTML =
            '<div class="rc-bar">' +
                '<select class="rc-preset" data-role="preset">' +
                    '<option value="">Unsaved palette</option>' +
                    state.saved.map(p => '<option value="' + esc(p.id) + '"' +
                        (state.current === p.id ? " selected" : "") + '>' + esc(p.name) + '</option>').join("") +
                '</select>' +
                '<input type="text" class="rc-nameinput" data-role="name" placeholder="Name this palette" value="' + esc(state.name) + '" maxlength="60">' +
                '<button type="button" class="btn" data-role="save">Save</button>' +
                '<button type="button" class="btn" data-role="duplicate"' + (state.current ? "" : " disabled") + '>Duplicate</button>' +
                '<button type="button" class="btn" data-role="delete"' + (state.current ? "" : " disabled") + '>Delete</button>' +
                '<span class="rc-sep"></span>' +
                '<label class="rc-toggle"><input type="checkbox" data-role="live"' + (state.live ? " checked" : "") + '> Live preview</label>' +
                '<button type="button" class="btn" data-role="site">Preview on the site</button>' +
                '<button type="button" class="btn" data-role="undo">Undo</button>' +
                '<button type="button" class="btn" data-role="reset">Reset all</button>' +
                '<span class="rc-sep"></span>' +
                '<button type="button" class="btn" data-role="export">Export</button>' +
                '<button type="button" class="btn" data-role="import">Import</button>' +
                '<span class="rc-changed">' + changedCount + ' changed</span>' +
            '</div>' +

            '<div class="rc-sprites">' +
                '<h4>The pixel art</h4>' +
                '<p class="admin-hint">Buttons, scrollbars and the window surround are pictures, not CSS, so they are recoloured pixel by pixel. Pick the darkest and lightest tone each one should use — the shading in between is kept, which is what stops them going flat.</p>' +
                '<div class="rc-sprite-grid">' +
                SPRITE_GROUPS.map(g => {
                    const a = state.palette.sprites[g.id] || {};
                    return '<div class="rc-sprite" data-group="' + g.id + '">' +
                        '<div class="rc-sprite-head">' + esc(g.label) +
                            (a.dark ? ' <span class="rc-dot"></span>' : "") + '</div>' +
                        '<div class="rc-sprite-pair">' +
                            '<input type="color" data-role="sp-dark" value="' + esc(a.dark || "#2b1d12") + '" title="Darkest tone">' +
                            '<input type="color" data-role="sp-light" value="' + esc(a.light || "#c7a679") + '" title="Lightest tone">' +
                            (a.dark ? '<button type="button" class="rc-revert" data-role="sp-clear" title="Leave this art alone">&#8630;</button>' : "") +
                        '</div>' +
                        '<div class="rc-where">' + esc(g.hint) + '</div>' +
                    '</div>';
                }).join("") +
                '</div>' +
            '</div>' +

            '<div class="rc-filters">' +
                '<input type="search" class="rc-search" data-role="search" placeholder="Search colours, areas or selectors…" value="' + esc(state.filter) + '">' +
                '<select data-role="group">' +
                    areas.map(a => '<option value="' + esc(a) + '"' + (state.group === a ? " selected" : "") + '>' +
                        (a === "all" ? "Everything" : esc(a)) + '</option>').join("") +
                '</select>' +
                '<span class="admin-hint">' + shown.length + ' of ' + all.length + '</span>' +
            '</div>' +

            (shown.length
                ? [...groups.entries()].map(([area, list]) =>
                    '<section class="rc-group"><h4>' + esc(area) + ' <span class="rc-count">' + list.length + '</span></h4>' +
                    list.map(it => swatchRow(it, all.indexOf(it))).join("") + '</section>').join("")
                : '<p class="admin-empty">Nothing matches that.</p>');

        wire(all);
    }

    /* --------------------------------------------------------------- wire */

    function wire(all) {
        const $ = (sel) => root.querySelector(sel);
        const on = (role, ev, fn) => root.querySelectorAll('[data-role="' + role + '"]').forEach(el => el.addEventListener(ev, fn));

        root.querySelectorAll(".rc-row").forEach(row => {
            const item = all[Number(row.dataset.i)];
            const picker = row.querySelector('[data-role="picker"]');
            const hex = row.querySelector('[data-role="hex"]');
            const alpha = row.querySelector('[data-role="alpha"]');

            const push = (value, redraw) => {
                setColour(item, value);
                row.querySelector(".rc-chip").style.background = value;
                hex.value = value;
                row.classList.add("is-changed");
                row.querySelector('[data-role="revert"]').disabled = false;
                if (redraw) render();
            };
            /* `input` not `change`, so the page recolours while the picker is
               open and moving. That is the entire feel of the thing. */
            picker.addEventListener("input", () => {
                const a = alpha ? Number(alpha.value) / 100 : (Recolour.parse(valueOf(item)) || item.rgba)[3];
                const p = Recolour.parse(picker.value);
                push(Recolour.format([p[0], p[1], p[2], a]));
            });
            if (alpha) alpha.addEventListener("input", () => {
                const p = Recolour.parse(hex.value) || item.rgba;
                push(Recolour.format([p[0], p[1], p[2], Number(alpha.value) / 100]));
            });
            hex.addEventListener("change", () => {
                const p = Recolour.parse(hex.value.trim());
                if (!p) { hex.value = valueOf(item); say("That is not a colour this understands.", "bad"); return; }
                push(Recolour.format(p), true);
            });
            row.querySelector('[data-role="revert"]').addEventListener("click", () => {
                setColour(item, null); render();
            });
        });

        root.querySelectorAll(".rc-sprite").forEach(box => {
            const g = box.dataset.group;
            const read = () => ({
                dark: box.querySelector('[data-role="sp-dark"]').value,
                light: box.querySelector('[data-role="sp-light"]').value
            });
            box.querySelectorAll('[data-role="sp-dark"],[data-role="sp-light"]').forEach(inp =>
                inp.addEventListener("input", () => {
                    state.palette.sprites[g] = read();
                    state.dirty = true;
                    if (state.live) applyLive();
                }));
            const clear = box.querySelector('[data-role="sp-clear"]');
            if (clear) clear.addEventListener("click", () => {
                delete state.palette.sprites[g];
                state.dirty = true;
                if (state.live) applyLive();
                render();
            });
        });

        on("search", "input", e => { state.filter = e.target.value; render(); });
        on("group", "change", e => { state.group = e.target.value; render(); });
        on("name", "input", e => { state.name = e.target.value; });
        on("live", "change", e => {
            state.live = e.target.checked;
            if (state.live) applyLive(); else Recolour.clear();
        });
        on("preset", "change", e => loadPreset(e.target.value));
        on("save", "click", save);
        on("duplicate", "click", duplicate);
        on("delete", "click", remove);
        on("undo", "click", undo);
        on("reset", "click", () => {
            if (!confirm("Put every colour back to the site's own? This does not touch anything already saved.")) return;
            state.palette = EMPTY(); state.history = []; state.dirty = true;
            Recolour.clear(); if (state.live) applyLive(); render();
            say("Back to the site's own colours.", "good");
        });
        on("site", "click", previewOnSite);
        on("export", "click", exportJson);
        on("import", "click", importJson);
    }

    /* ------------------------------------------------------------- saving */

    async function api(method, body, q) {
        const r = await fetch(API + (q || ""), {
            method,
            headers: { "Content-Type": "application/json", "x-admin-token": token },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || ("Save failed (" + r.status + ")"));
        return data;
    }

    async function refresh() {
        const d = await api("GET");
        state.saved = d.palettes || [];
    }

    async function save() {
        const name = state.name.trim();
        if (!name) { say("Give it a name first.", "bad"); return; }
        try {
            /* PUT when this palette already exists, POST when it is new. The
               endpoint refuses a POST onto a taken name rather than silently
               overwriting, so the distinction has to be made here. */
            const exists = state.current && state.saved.some(p => p.id === state.current);
            const payload = { name, palette: state.palette };
            if (exists) payload.id = state.current;
            const saved = await api(exists ? "PUT" : "POST", payload);
            state.current = saved.id;
            state.dirty = false;
            await refresh();
            render();
            say('Saved "' + saved.name + '".', "good");
        } catch (e) { say(e.message, "bad"); }
    }

    async function duplicate() {
        const base = state.saved.find(p => p.id === state.current);
        if (!base) return;
        const name = prompt("Name for the copy", base.name + " copy");
        if (!name) return;
        try {
            const made = await api("POST", { name, palette: state.palette, basedOn: base.id });
            state.current = made.id;
            state.name = made.name;
            state.dirty = false;
            await refresh();
            render();
            say('Copied to "' + made.name + '". Editing the copy now.', "good");
        } catch (e) { say(e.message, "bad"); }
    }

    async function remove() {
        const p = state.saved.find(x => x.id === state.current);
        if (!p) return;
        if (!confirm('Delete "' + p.name + '"? This cannot be undone, and anybody wearing it goes back to the classic palette.')) return;
        try {
            await api("DELETE", null, "?id=" + encodeURIComponent(p.id));
            state.current = null; state.name = ""; state.palette = EMPTY();
            Recolour.clear();
            await refresh();
            render();
            say("Deleted.", "good");
        } catch (e) { say(e.message, "bad"); }
    }

    function loadPreset(id) {
        if (state.dirty && !confirm("You have unsaved changes. Load another palette anyway?")) { render(); return; }
        const p = state.saved.find(x => x.id === id);
        state.current = p ? p.id : null;
        state.name = p ? p.name : "";
        state.palette = p ? JSON.parse(JSON.stringify(p.palette)) : EMPTY();
        state.history = [];
        state.dirty = false;
        if (state.live) applyLive(); else Recolour.clear();
        render();
    }

    /* The panel is one page and a palette has to survive the other six, so
       the preview travels in sessionStorage and the site picks it up. */
    function previewOnSite() {
        try {
            sessionStorage.setItem("mazerats_palette_preview", JSON.stringify(state.palette));
            window.open("/home.html?palette=preview", "_blank", "noopener");
            say("Opened the site with this palette on. It lasts for that tab only.", "good");
        } catch (e) { say("Could not start a preview — private mode?", "bad"); }
    }

    function exportJson() {
        const blob = new Blob([JSON.stringify({ name: state.name || "palette", palette: state.palette }, null, 2)],
            { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (state.name || "palette").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }

    function importJson() {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "application/json";
        inp.addEventListener("change", () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
                try {
                    const d = JSON.parse(rd.result);
                    const p = d.palette || d;
                    state.palette = {
                        vars: p.vars || {}, decls: p.decls || {}, sprites: p.sprites || {}
                    };
                    state.name = d.name || state.name;
                    state.current = null;
                    state.dirty = true;
                    if (state.live) applyLive();
                    render();
                    say("Loaded. Save it to keep it.", "good");
                } catch (e) { say("That file is not a palette.", "bad"); }
            };
            rd.readAsText(f);
        });
        inp.click();
    }

    /* --------------------------------------------------------------- open */

    async function mount(container, adminToken) {
        shell = container;
        token = adminToken;
        shell.innerHTML = '<div class="rc-status"></div><div class="rc-body"></div>';
        statusEl = shell.querySelector(".rc-status");
        root = shell.querySelector(".rc-body");
        state.catalogue = Recolour.rescan();
        try { await refresh(); } catch (e) { say("Could not load saved palettes: " + e.message, "bad"); }
        render();
        return state.catalogue;
    }

    return { mount, state, render };
})();

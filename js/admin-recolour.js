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

    // A save, a save-as-new or a delete is out (see oneAtATime). Up here,
    // above anything render() can be called from.
    let writing = false;

    const state = {
        catalogue: null,
        palette: EMPTY(),
        saved: [],              // presets from the database
        current: null,          // the preset being edited, or null for unsaved
        /* What was LOADED, as opposed to what will be saved (28 Sept 2026).
           { kind: "theme", id, label } for a copy of one of the site's
           built-in themes, { kind: "saved", id } for a palette from the
           database, null for a palette started here. The "Editing:" line,
           the loader's selection and where Save sends it all read this. */
        origin: null,
        loadedAt: null,         // the saved palette's updatedAt, for the stale-write check
        loading: 0,             // bumped per load, so a slow theme read cannot land on a newer choice
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
    let shell = null, root = null, statusEl = null, token = null, signedOut = null;

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
                prop: "var", original: v.value, rgba: v.rgba,
                role: Recolour.roleOf(v.rgba), area: "Core tokens", count: null,
                where: "Used everywhere the stylesheet says var(" + v.name + ")"
            });
        }
        for (const d of cat.decls) {
            out.push({
                kind: "decl", key: d.key, label: d.prop, prop: d.prop,
                original: d.colour, rgba: d.rgba, role: d.role, area: d.area, count: d.count,
                uses: d.uses,
                where: d.uses.slice(0, 6).map(u => u.sel).join(",  ")
            });
        }
        return out;
    }

    /* ======================================================================
       THE SECTIONS (28 Sept 2026)

       Three hundred swatches grouped by recolour.js's AREAS was complete and
       unusable: "Windows & frames" held the maze window's share button and
       the Guess the Room buttons, and a row was called "background-image".
       So the list is now organised by the PARTS OF THE SITE a person points
       at, each control is named for what it paints, and the technical name
       drops to a small second line for anybody who wants it.

       THIS IS PRESENTATION ONLY. Every control still edits the same variable
       or the same "property|colour" key through the same setColour, so a
       palette saved from here is byte-for-byte what the flat list would have
       saved. Nothing is removed: a colour no section claims lands in
       "Everything else" rather than disappearing.

       HOW A COLOUR FINDS ITS SECTION. A catalogued colour is used by one or
       more rules; each rule's selector is asked, most specific part of the
       site first (CLASSIFY), which section it belongs to, and the colour
       goes where most of its rules are. The rest become its "also used for"
       note — one control with a note, never two controls that could
       disagree. Shadows and glows are the exception: they are sorted by what
       they ARE, because nobody looks for a drop shadow under "buttons".

       The core variables are named by hand (VAR_INFO), because a variable is
       a design decision and deserves a sentence; their "also used for" is
       read live from the stylesheet, like everything else here. */

    const SECTIONS = [
        { id: "page", title: "Page & backgrounds", open: true,
          blurb: "The page behind everything: the dark base, panel and wood tones, and the shading over the tiled maze pattern." },
        { id: "rows", title: "Maze & event list rows", open: true,
          blurb: "The rows in the Mazes and Events lists: background, title, builder line, description, and the featured strip." },
        { id: "windows", title: "Windows & title bars", open: true,
          blurb: "The framed windows everything sits in: the surround, the title bar and its title, the close button." },
        { id: "buttons", title: "Buttons, tabs & menus", open: true,
          blurb: "Everything you press: buttons, the Mazes/Events tabs and sub-tabs, the side menu, the list/grid switch." },
        { id: "text", title: "Text & links", open: false,
          blurb: "Body copy, headings, dim notes and links, wherever they are on the site." },
        { id: "header", title: "Header & footer", open: false,
          blurb: "The bar across the top — sign-in, the site-state pill, notices — and the footer's links." },
        { id: "maze", title: "The maze window", open: false,
          blurb: "What opens when you click a maze: photos and gallery, share / saved / walked, old versions, furni cards, the lightbox." },
        { id: "status", title: "Status, difficulty & progress", open: false,
          blurb: "Colours that mean something: easy to extreme, live and online, tags and badges, success and danger, progress bars." },
        { id: "forms", title: "Search, sorting & inputs", open: false,
          blurb: "The search box, the sort menu, text fields and their placeholder text." },
        { id: "daily", title: "Daily games", open: false,
          blurb: "Guess the Room and the other dailies: answer options, result pips, the results board, game buttons." },
        { id: "guides", title: "Guides", open: false,
          blurb: "The guides pages: cards, categories, tips, pictures and bold text." },
        { id: "console", title: "The Console", open: false,
          blurb: "The Habbo-style console window: its yellow frame, the screen, tabs, buttons and profile." },
        { id: "atlas", title: "The Atlas", open: false,
          blurb: "The wizard's map: paper, ink, rooms, the glow, and the overlays on top of it." },
        { id: "ff", title: "Fallin' Furni", open: false,
          blurb: "The Fallin' Furni game." },
        { id: "scroll", title: "Scrollbars", open: false,
          blurb: "The CSS side of the scrollbars. The scrollbar art itself is under The pixel art, above." },
        { id: "shadows", title: "Shadows & glows", open: false,
          blurb: "Drop shadows, inset shading and hover glows, wherever they are. Mostly black at low opacity: depth rather than colour." },
        { id: "admin", title: "This admin panel", open: false,
          blurb: "Colours only the Warren uses — its forms, pills and editors. Visitors never see these, but the preview here does." },
        { id: "other", title: "Everything else", open: false,
          blurb: "Colours no section above claims, kept here so nothing is out of reach." }
    ];
    const SECTION_BY_ID = new Map(SECTIONS.map(s => [s.id, s]));

    // Most specific part of the site first; the first match wins per rule.
    const CLASSIFY = [
        ["admin",   /\.admin|-admin-|\.rc-|data-page="admin"|\.ctl-|\.glyph|\.de-|\.ff-table|\.ff-run|\.updatelog|\.theme-dot/],
        ["console", /\.console|\.cnsl/],
        ["atlas",   /\.wiz-|wizard|atlas/],
        ["ff",      /fallinfurni|\.ff-/],
        ["daily",   /\.guess|\.odd-|\.daily|\.qz-|quiz|\.furni-tile|\.lost-code/],
        ["guides",  /\.guide/],
        ["scroll",  /scroll/],
        // The side menu is a menu wherever it opens, the maze window included.
        ["buttons", /\.side-(menu|spine|drawer)|\.modal-actions-(panel|drawer)/],
        ["maze",    /\.modal|\.gallery|\.photo-frame|\.old-version|\.walked-toggle|\.saved-(toggle|note)|\.room-(desc|links)|\.lightbox|\.furni-(strip|card|icon)|\.incomplete/],
        ["status",  /\.difficulty|\[data-difficulty|\.status-|\.status\b|\.builder-status|\.tag\b|\.tag-|\.progress/],
        ["header",  /\.site-header|\.header-|\.site-footer|\.fellow-fansites|\.brand|\.data-degraded/],
        ["forms",   /\.search-box|\.sort-box|input|select|textarea|placeholder|\.password-/],
        ["buttons", /\.btn|button|\.chrome-nav|\.chrome-tab|\.side-(menu|spine|drawer)|\.view-switch|\.clear-filter|\.featured-refresh|toggle/],
        ["rows",    /\.chrome-list|\.row-|\.ec-|featured-frame|\.featured-|\.archive-|\.timeline-/],
        ["windows", /\.chrome-(window|frame|titlebar|title|close|body)|#browse-window|\.skip-link/],
        ["page",    /(^|[\s,>+~])(html|body)(?=$|[\s,.:#[>+~])|:root|\.site-loader/],
        ["text",    /(^|[\s,>+~])(h[1-6]|p|a|strong|em|li)(?=$|[\s,.:#[>+~])|link|-text\b|-title\b|-note\b|-hint\b|-desc\b|-name\b/]
    ];
    const sectionOfSel = (sel) => { for (const [id, re] of CLASSIFY) if (re.test(sel)) return id; return "other"; };

    /* What each rule's selector is, in words. First match wins, so the
       specific ones come before the general ones they sit inside. */
    const PARTS = [
        [/data-difficulty="easy"/, "Featured row, easy"], [/data-difficulty="medium"/, "Featured row, medium"],
        [/data-difficulty="hard"/, "Featured row, hard"], [/data-difficulty="very-hard"/, "Featured row, very hard"],
        [/data-difficulty="extreme"/, "Featured row, extreme"], [/#featured-frame-list/, "Featured row text"],
        [/\.ec-title-name|\.chrome-list-row h3|\.row-title/, "Row title"], [/\.row-creator/, "Builder line"],
        [/\.row-desc/, "Row description"], [/\.row-date/, "Row date"], [/\.row-thumb/, "Row picture"],
        [/\.furni-card-name/, "Furni card name"], [/\.furni-card-motto/, "Furni card motto"],
        [/\.furni-card-(also|link)/, "Furni card link"], [/\.furni-card-(class|date)/, "Furni card details"],
        [/\.furni-card-foot/, "Furni card footer"], [/\.photo-frame-name/, "Photo caption"], [/\.photo-frame-hint/, "Photo hint"],
        [/\.photo-frame-(zoom|photo-box)/, "Photo zoom marker"],
        [/\.console-(note|missing-note|profile-since)/, "Console note"], [/\.console-form-status/, "Console error"],
        [/\.console-contributor-tag/, "Console contributor tag"], [/\.console-info/, "Console info list"],
        [/\.chrome-nav-btn-recommended/, "Recommended tab"], [/\.featured-frame/, "Featured strip"],
        [/\.chrome-list-row/, "List row"], [/\.archive-empty/, "Empty-list message"], [/\.archive-stat/, "Archive count"],
        [/\.timeline-entry/, "Timeline note"],
        [/\.chrome-titlebar/, "Title bar"], [/\.chrome-close/, "Close button"], [/\.chrome-frame-minimize/, "Minimise toggle"],
        [/\.chrome-frame/, "Window frame"], [/\.chrome-window/, "Window"], [/\.chrome-body/, "Window body"],
        [/\.chrome-nav-top .chrome-nav-btn\.active/, "Selected Mazes/Events tab"],
        [/\.chrome-nav-sub .chrome-nav-btn\.active/, "Selected sub-tab"], [/\.chrome-nav-sub/, "Sub-tab"],
        [/\.chrome-nav-btn/, "Tab"], [/\.btn-enter-mini/, "Small pill button"], [/\.btn-enter/, "Enter button"],
        [/\.btn-solid/, "Solid button"], [/\.view-switch-btn/, "List/grid switch"],
        [/\.side-spine/, "Side menu handle"], [/\.side-menu-tag/, "Side menu tag"], [/\.side-menu-badge/, "Side menu badge"],
        [/\.side-menu-heading/, "Side menu heading"], [/\.side-menu-(item|group|fold)/, "Side menu item"],
        [/\.side-menu|\.modal-actions-panel/, "Side menu"], [/\.clear-filter/, "Clear-filter button"],
        [/\.featured-refresh/, "Refresh button"], [/\.btn\b/, "Button"],
        [/\.site-header-notice/, "Header notice bar"], [/\.site-header/, "Header bar"], [/\.header-state-pill/, "Site-state pill"],
        [/a\.header-badge/, "Header link badge"], [/\.header-signin/, "Sign-in button"], [/\.header-events-title/, "Header events link"],
        [/\.site-footer/, "Footer links"], [/\.fellow-fansites/, "Fansite links"], [/\.data-degraded/, "Out-of-date data notice"],
        [/\.walked-toggle/, "Walked button"], [/\.saved-toggle/, "Saved button"], [/\.saved-note/, "Saved note"],
        [/\.modal-share/, "Share button"], [/\.modal-meta/, "Maze info panel"], [/\.modal-thumb/, "Maze picture"],
        [/\.modal-overlay/, "Dimmed backdrop"], [/\.modal-actions/, "Maze actions bar"], [/\.modal-body|\.modal-top-row/, "Maze window body"],
        [/\.modal/, "Maze window"], [/\.gallery-strip/, "Photo strip"], [/\.gallery-nav/, "Gallery arrows"],
        [/\.gallery-(counter|bonus)/, "Gallery counter"], [/\.gallery-photos/, "Gallery photos"], [/\.gallery-pause/, "Gallery pause"],
        [/\.gallery-missing/, "Missing-photo pill"], [/\.gallery-viewport/, "Gallery viewport"], [/\.gallery/, "Gallery"],
        [/\.photo-frame/, "Photo frame"], [/\.old-version/, "Old versions"], [/\.lightbox/, "Lightbox"],
        [/\.room-desc/, "Room description"], [/\.room-links/, "Room links"],
        [/\.furni-card/, "Furni card"], [/\.furni-strip/, "Furni strip"], [/\.furni-icon/, "Furni icon button"],
        [/\.incomplete/, "Incomplete-maze help"],
        [/\.difficulty-easy|"easy"/, "Easy"], [/\.difficulty-medium|"medium"/, "Medium"], [/\.difficulty-hard|"hard"/, "Hard"],
        [/very-hard/, "Very hard"], [/extreme/, "Extreme"], [/\.status-live/, "Live"], [/\.builder-status/, "Builder online"],
        [/\.status-badge/, "Status badge"], [/\.tag-chip/, "Tag chip"], [/\.tag\b/, "Tag"], [/\.progress/, "Progress"],
        [/\.search-box/, "Search box"], [/\.sort-box/, "Sort menu"], [/\.password-toggle/, "Show-password eye"],
        [/\.guess-option/, "Answer option"], [/\.guess-pip/, "Result pip"], [/\.guess-board/, "Results board"],
        [/\.guess-btn/, "Game button"], [/\.guess-sheet/, "Game tab"], [/\.guess-picture/, "Game picture"],
        [/\.guess-rules/, "Rules"], [/\.guess-splash/, "Splash title"], [/\.guess/, "Guess the Room"],
        [/\.furni-tile/, "Furni tile"], [/\.lost-code/, "Lost code"], [/\.daily/, "Daily header"],
        [/\.guide-tip/, "Guide tip"], [/\.guides-card/, "Guide card"], [/\.guides-cat/, "Guide category"],
        [/\.guide-figure|\.guides-pic|\.guide-thumb/, "Guide picture"], [/\.guide-body|\.guide-summary/, "Guide text"],
        [/\.guide-contents|\.guide-more/, "Guide contents"], [/\.guides-starter/, "Starter guides"], [/\.guide/, "Guides"],
        [/\.console-frame/, "Console frame"], [/\.console-screen/, "Console screen"], [/\.console-tab/, "Console tab"],
        [/\.console-input/, "Console input"], [/\.console-btn|\.console-link-btn/, "Console button"],
        [/\.console-profile/, "Console profile"], [/\.console-title/, "Console title"], [/\.console-select/, "Console menu"],
        [/\.console/, "Console text"],
        [/\.admin-wiz/, "Atlas editor"], [/\.wiz-room/, "Atlas room"], [/\.wiz-paper/, "Atlas paper"],
        [/\.wiz-(status|reveal|whisper)/, "Atlas overlay"], [/\.wiz-/, "Atlas"],
        [/admin-pill-danger/, "Danger pill"], [/\.admin-action-pill|\.admin-pill-btn/, "Admin pill"],
        [/\.admin-field|\.admin-furni-search/, "Admin field"], [/\.admin-address/, "Address field"],
        [/\.admin-notice/, "Admin notice"], [/\.admin-gallery|\.admin-dropzone|\.admin-drop\b/, "Photo uploader"],
        [/\.admin-furni/, "Furni picker"], [/\.rc-/, "Recolour editor"], [/\.ctl-/, "Settings card"],
        [/\.ff-/, "Fallin' Furni table"], [/\.updatelog/, "Change log"], [/\.de-/, "Missing Pieces"],
        [/\.glyph/, "Alt Codes"], [/\.theme-dot/, "Theme dot"], [/data-page="admin"/, "Admin buttons"], [/\.admin/, "Admin panel"],
        [/\.site-loader/, "Loading screen"], [/(^|[\s,])(html|body)\b/, "Page background"],
        [/(^|[\s,>])h[1-6]\b/, "Headings"], [/(^|[\s,>])a\b/, "Links"], [/scroll/, "Scrollbar"]
    ];

    /* The core variables, in words. `section` is where each one is listed;
       the "also used for" note is worked out from the stylesheet. */
    const VAR_INFO = {
        "--bg-black":          ["page", "Page base, the darkest colour"],
        "--bg-panel":          ["page", "Panel background"],
        "--bg-panel-light":    ["page", "Lighter panel background"],
        "--wood-dark":         ["page", "Dark wood"],
        "--wood-mid":          ["page", "Mid wood (hovered tiles and options)"],
        "--chrome-row":        ["rows", "Row background"],
        "--chrome-row-featured": ["rows", "Featured and hovered row background"],
        "--chrome-fill":       ["windows", "Window fill"],
        "--chrome-highlight":  ["windows", "Window highlight (raised edges)"],
        "--chrome-border":     ["windows", "Window outline"],
        "--frame-bg":          ["windows", "Frame and scrollbar-track fill"],
        "--frame-bg-light":    ["windows", "Frame fill, lighter"],
        "--border":            ["windows", "Soft amber border"],
        "--parchment":         ["text", "Body text"],
        "--parchment-dim":     ["text", "Dim text and notes"],
        "--amber-bright":      ["text", "Bright amber: titles, highlights, links"],
        "--amber":             ["text", "Amber accent: borders and fills"],
        "--amber-text":        ["text", "Amber text on rows"],
        "--unknown-text":      ["text", "Muted label text"],
        "--danger":            ["status", "Danger / closed: borders and fills"],
        "--danger-text":       ["status", "Danger text"],
        "--ok":                ["status", "Success / open"],
        "--unknown":           ["status", "Unknown / past: borders and fills"],
        "--wiz-ink":           ["atlas", "Atlas ink"],
        "--wiz-ink-soft":      ["atlas", "Atlas ink, soft"],
        "--wiz-paper":         ["atlas", "Atlas paper"],
        "--wiz-paper-deep":    ["atlas", "Atlas paper, deep"],
        "--wiz-paper-lit":     ["atlas", "Atlas paper, lit"],
        "--wiz-glow":          ["atlas", "Atlas glow"],
        "--wiz-surround":      ["atlas", "Atlas surround"]
    };

    const SHADOW_PROPS = /^(box-shadow|text-shadow|filter)$/;
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    function partOf(sel) {
        for (const [re, name] of PARTS) if (re.test(sel)) return name;
        /* Nothing on the list: the last compound of the first selector, in
           words — ".guess-board-face.is-blank" becomes "guess board face". */
        const first = String(sel).split(",")[0].trim().split(/[\s>+~]+/).pop() || sel;
        const cls = (first.match(/[.#][a-z0-9_-]+/gi) || [first]).filter(c => !/^\.is-/.test(c))[0] || first;
        return cap(cls.replace(/^[.#]/, "").replace(/::?[a-z-]+(\(.*\))?/g, "").replace(/[-_]+/g, " ").trim() || "Rule");
    }

    function statesOf(sel) {
        // ":hover:not(:disabled)" is a hover, not a disabled state.
        sel = String(sel).replace(/:not\([^)]*\)/g, "");
        const out = [];
        if (/\.active\b|\.is-on\b|\.is-open\b|:checked|\.is-saved\b|\.is-walked\b|\.is-picked\b|\.is-showing|\.is-paused|\.is-copied|\.is-unlocked/.test(sel)) out.push("when on");
        if (/\.is-won|\.is-answer/.test(sel)) out.push("right answer");
        if (/\.is-wrong|\.is-lost/.test(sel)) out.push("wrong answer");
        if (/:hover|:focus/.test(sel)) out.push("hover");
        if (/::placeholder/.test(sel)) out.push("placeholder");
        if (/:disabled|\.is-disabled/.test(sel)) out.push("disabled");
        return out;
    }

    function propWord(prop, rgba) {
        const light = Recolour.luminance(rgba) > 0.3;
        if (prop === "color") return "text";
        if (prop === "background-color") return "fill";
        if (prop === "background-image") return "gradient";
        let m = /^border-(top|right|bottom|left)-color$/.exec(prop);
        if (m) return "border (" + m[1] + ")";
        if (prop === "outline-color") return "focus ring";
        if (prop === "box-shadow") return light ? "glow" : "shadow";
        if (prop === "text-shadow") return light ? "text glow" : "text shadow";
        if (prop === "filter") return light ? "glow" : "drop shadow";
        if (prop === "stroke") return "line";
        return prop.replace(/-/g, " ");
    }

    /* Which sections a var() is read in, from the live stylesheet — the scan
       in recolour.js skips var() on purpose, so this is its own small walk.
       Once per catalogue. */
    function varSections() {
        const out = new Map();              // --name -> Map(section -> rules)
        const walk = (rules) => {
            for (const rule of rules) {
                if (rule.cssRules && (rule.media || rule.conditionText !== undefined)) { walk(rule.cssRules); continue; }
                if (!rule.style || !rule.selectorText || /\[data-theme=/.test(rule.selectorText)) continue;
                let sec = null;
                for (let i = 0; i < rule.style.length; i++) {
                    const v = rule.style.getPropertyValue(rule.style[i]);
                    if (!v.includes("var(")) continue;
                    for (const m of v.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
                        sec = sec || sectionOfSel(rule.selectorText);
                        if (!out.has(m[1])) out.set(m[1], new Map());
                        const s = out.get(m[1]);
                        s.set(sec, (s.get(sec) || 0) + (sec === "admin" ? 0.2 : 1));   // see dress()
                    }
                }
            }
        };
        for (const sheet of document.styleSheets) {
            if (sheet.ownerNode && (sheet.ownerNode.id === Recolour.SHEET_ID || sheet.ownerNode.id === Recolour.SPRITE_ID)) continue;
            let rules = null;
            try { rules = sheet.cssRules; } catch (e) { continue; }
            if (rules) walk(rules);
        }
        return out;
    }

    const alsoText = (counts, main) => [...counts.entries()]
        .filter(([s]) => s !== main && s !== "other")
        .sort((a, b) => b[1] - a[1])
        .map(([s]) => SECTION_BY_ID.get(s).title);

    /* Every item, dressed: its section, its plain name, what else it paints.
       Worked out once per catalogue — none of it depends on the colours. */
    let dressedFor = null, dressed = null;
    function dress() {
        if (dressedFor === state.catalogue && dressed) return dressed;
        const list = items();
        const vs = varSections();
        for (const it of list) {
            if (it.kind === "var") {
                const info = VAR_INFO[it.name];
                it.section = info ? info[0] : (/^--wiz-/.test(it.name) ? "atlas" : "other");
                it.plain = info ? info[1] : cap(it.label);
                it.tech = "var(" + it.name + ")";
                it.also = alsoText(vs.get(it.name) || new Map(), it.section);
                continue;
            }
            /* An admin rule counts for a fifth of a visitor-facing one. The
               warm white is in 31 rules and a good few are the Warren's own;
               a colour the whole site wears should be listed where visitors
               see it, with "also: This admin panel", not the other way. */
            const votes = new Map(), firstSel = new Map();
            for (const u of it.uses) {
                const s = sectionOfSel(u.sel);
                votes.set(s, (votes.get(s) || 0) + (s === "admin" ? 0.2 : 1));
                if (!firstSel.has(s)) firstSel.set(s, u.sel);
            }
            let main = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
            const sel = firstSel.get(main);
            if (SHADOW_PROPS.test(it.prop)) {
                it.section = "shadows";
                it.also = alsoText(votes, "shadows");
            } else {
                it.section = main;
                it.also = alsoText(votes, main);
            }
            /* A colour three or more different parts share is named as
               shared, with the first two it paints. Naming it after its first
               rule alone called the site's plain white "Walked button text",
               which is true of one rule in eleven and a lie about the rest. */
            const visitorUses = it.uses.filter(u => sectionOfSel(u.sel) !== "admin");
            const parts = [...new Set((visitorUses.length ? visitorUses : it.uses).map(u => partOf(u.sel)))];
            if (parts.length >= 3) {
                it.plain = "Shared " + propWord(it.prop, it.rgba) + " — " + parts.slice(0, 2).join(", ") +
                    " +" + (parts.length - 2) + " more";
            } else {
                const states = statesOf(sel);
                it.plain = partOf(sel) + " — " + propWord(it.prop, it.rgba) + (states.length ? ", " + states.join(", ") : "");
            }
            it.tech = it.prop + " · " + it.original;
        }
        /* Same name twice in a section — the two stops of one gradient, the
           twelve steps of the page shading — are told apart by how dark they
           are rather than left looking like duplicates. */
        const byName = new Map();
        for (const it of list) {
            const k = it.section + "\n" + it.plain;
            if (!byName.has(k)) byName.set(k, []);
            byName.get(k).push(it);
        }
        for (const same of byName.values()) {
            if (same.length < 2) continue;
            same.sort((a, b) => (a.rgba[3] - b.rgba[3]) || (Recolour.luminance(b.rgba) - Recolour.luminance(a.rgba)));
            if (same.length === 2 && same[0].rgba[3] === same[1].rgba[3]) {
                same[0].plain += ", lighter"; same[1].plain += ", darker";
            } else {
                same.forEach((it, n) => { it.plain += " " + (n + 1) + "/" + same.length; });
            }
        }
        dressedFor = state.catalogue;
        dressed = list;
        return list;
    }

    /* CONTROLS, NOT ITEMS. A box of one colour on all four sides is four
       catalogue keys — border-top-color, -right, -bottom, -left — and was
       four swatches that had to be moved one at a time and could drift
       apart. Where the four (or however many) share a colour and the same
       rules, they are one "border" control that writes all of them. If a
       loaded palette has them set differently, they come apart again as
       separate controls, so nothing is ever hidden behind a value it does
       not show. The keys written are exactly the keys the four swatches
       would have written. */
    function controls() {
        const list = dress();
        const out = [];
        const sides = new Map();
        for (const it of list) {
            const m = it.kind === "decl" && /^border-(top|right|bottom|left)-color$/.exec(it.prop);
            if (!m) { out.push({ items: [it] }); continue; }
            const sig = it.key.split("|")[1] + "\n" + it.uses.map(u => u.sel + "@" + u.media).sort().join("\n");
            if (!sides.has(sig)) { const c = { items: [], sides: true }; sides.set(sig, c); out.push(c); }
            sides.get(sig).items.push(it);
        }
        const final = [];
        for (const c of out) {
            if (!c.sides) { final.push(c); continue; }
            const same = c.items.length > 1 && c.items.every(it => valueOf(it) === valueOf(c.items[0]));
            if (same) final.push({ items: c.items, linked: true });
            else c.items.forEach(it => final.push({ items: [it] }));
        }
        for (const c of final) {
            const it = c.items[0];
            c.section = it.section;
            c.plain = c.linked ? it.plain.replace(/border \((top|right|bottom|left)\)/, "border") : it.plain;
            c.tech = c.linked ? "border-color (" + c.items.length + " sides) · " + it.original : it.tech;
            c.count = it.count;
            c.also = it.also;
            c.key = c.items.map(keyOf).join(" ");
        }
        return final;
    }

    const OPEN_KEY = "mazerats_recolour_sections";
    let openState = null;
    function isOpen(id) {
        if (!openState) {
            try { openState = JSON.parse(localStorage.getItem(OPEN_KEY) || "{}") || {}; } catch (e) { openState = {}; }
        }
        return Object.prototype.hasOwnProperty.call(openState, id) ? !!openState[id] : !!SECTION_BY_ID.get(id).open;
    }
    function setOpen(id, open) {
        isOpen(id);
        openState[id] = open;
        try { localStorage.setItem(OPEN_KEY, JSON.stringify(openState)); } catch (e) { /* private mode */ }
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
        updateEditing();
        if (state.live) applyLive();
    }

    /* One control can be several keys (a linked border's four sides), and
       one move of its picker is one step of undo, not four. The keys and
       values written are exactly what setColour writes one at a time. */
    function setControl(ctl, value) {
        if (ctl.items.length === 1) return setColour(ctl.items[0], value);
        const batch = ctl.items.map(it => {
            const p = it.kind === "var" ? state.palette.vars : state.palette.decls;
            return { kind: it.kind, key: keyOf(it), was: p[keyOf(it)] };
        });
        ctl.items.forEach(it => setColour(it, value, false));
        state.history.unshift({ batch });
        if (state.history.length > 200) state.history.pop();
    }

    function undo() {
        const h = state.history.shift();
        if (!h) { say("Nothing left to undo.", ""); return; }
        for (const one of (h.batch || [h])) {
            const p = one.kind === "var" ? state.palette.vars : state.palette.decls;
            if (one.was === undefined) delete p[one.key]; else p[one.key] = one.was;
        }
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

    function swatchRow(ctl, i) {
        const item = ctl.items[0];
        const value = valueOf(item);
        const rgba = Recolour.parse(value) || item.rgba;
        const changed = ctl.items.some(isChanged);
        const hex = "#" + [0, 1, 2].map(n => Math.round(rgba[n]).toString(16).padStart(2, "0")).join("");
        const hasAlpha = item.rgba[3] < 1;
        /* Contrast against the page's own background, which is what almost
           everything here sits on. Only shown once it is actually bad, or the
           row turns into a wall of green ticks nobody reads. */
        const bg = Recolour.parse(state.palette.vars["--bg-black"] || "#120c07");
        const ratio = Recolour.contrast(rgba, bg);
        const warn = (item.role === "bright" || item.prop === "color") && ratio < 4.5;
        /* The plain name leads; the technical one is the second line, and the
           tooltip has every rule it paints, for anybody hunting a selector. */
        const tip = ctl.items.map(keyOf).join("\n") + "\n\n" + item.where;
        const also = ctl.also && ctl.also.length
            ? ' &middot; <span class="rc-also">also ' + esc(ctl.also.slice(0, 3).join(", ")) +
                (ctl.also.length > 3 ? " +" + (ctl.also.length - 3) : "") + '</span>'
            : "";

        return '<div class="rc-row' + (changed ? " is-changed" : "") + '" data-i="' + i + '">' +
            '<label class="rc-chip" style="background:' + esc(value) + '">' +
                '<input type="color" value="' + esc(hex) + '" data-role="picker" aria-label="' + esc(ctl.plain) + '">' +
            '</label>' +
            '<div class="rc-meta">' +
                '<div class="rc-name">' + esc(ctl.plain) +
                    (ctl.count ? ' <span class="rc-count">' + ctl.count + ' rule' + (ctl.count === 1 ? "" : "s") + '</span>' : "") +
                    (changed ? ' <span class="rc-dot" title="Changed from the site\'s own colour"></span>' : "") +
                '</div>' +
                '<div class="rc-where" title="' + esc(tip) + '"><span class="rc-tech">' + esc(ctl.tech) + '</span>' + also + '</div>' +
            '</div>' +
            '<input type="text" class="rc-hex" value="' + esc(value) + '" data-role="hex" spellcheck="false" aria-label="' + esc(ctl.plain) + ', colour value">' +
            (hasAlpha
                ? '<input type="range" class="rc-alpha" min="0" max="100" value="' + Math.round(rgba[3] * 100) + '" data-role="alpha" title="Opacity">'
                : '<span class="rc-alpha-none"></span>') +
            (warn ? '<span class="rc-warn" title="Contrast against the page background is ' + ratio.toFixed(1) + ':1, below the 4.5:1 that small text needs">low contrast</span>' : "") +
            '<button type="button" class="rc-revert" data-role="revert"' + (changed ? "" : " disabled") + ' title="Back to the site\'s own colour">&#8630;</button>' +
        '</div>';
    }

    /* The sections, drawn into their own container so that typing in the
       search box redraws the list and NOT the box itself — the whole-panel
       redraw it used to do replaced the input under the cursor, and focus
       went with it after the first letter.

       A folded section draws its header only. That is most of them by
       default, which is also most of why this is quicker than the flat list
       was: a hundred-odd rows on the page instead of three hundred. */
    let ctls = [];
    function renderSections() {
        const box = root && root.querySelector('[data-role="sections"]');
        if (!box) return;
        ctls = controls();
        const q = state.filter.toLowerCase().trim();
        const changedOnly = state.group === "changed";
        const bySection = new Map(SECTIONS.map(s => [s.id, { all: [], shown: [] }]));
        ctls.forEach((c, i) => {
            const bucket = bySection.get(c.section) || bySection.get("other");
            bucket.all.push(i);
            if (changedOnly && !c.items.some(isChanged)) return;
            if (q) {
                const hay = (c.plain + " " + c.tech + " " + c.key + " " + SECTION_BY_ID.get(c.section).title + " " +
                    (c.also || []).join(" ") + " " + c.items[0].where + " " + valueOf(c.items[0])).toLowerCase();
                if (!hay.includes(q)) return;
            }
            bucket.shown.push(i);
        });

        /* Within a section: the variables first (a design decision outranks
           a one-off), then the colours that paint the most, then by name —
           so "gradient 3/14" comes after "2/14" rather than wherever usage
           happened to put it. */
        // Numbered siblings ("gradient 3/14") sort as one block, by the
        // busiest of them, and in number order inside it.
        const base = (c) => c.section + "\n" + c.plain.replace(/ \d+\/\d+$/, "");
        const blockCount = new Map();
        for (const c of ctls) blockCount.set(base(c), Math.max(blockCount.get(base(c)) || 0, c.count || 0));
        const order = (x, y) => {
            const a = ctls[x], b = ctls[y];
            const va = a.items[0].kind === "var" ? 0 : 1, vb = b.items[0].kind === "var" ? 0 : 1;
            if (!va && !vb) return x - y;               // as :root declares them
            if (va !== vb) return va - vb;
            const ba = base(a), bb = base(b);
            return (blockCount.get(bb) - blockCount.get(ba)) || ba.localeCompare(bb) ||
                a.plain.localeCompare(b.plain, undefined, { numeric: true });
        };
        for (const b of bySection.values()) { b.all.sort(order); b.shown.sort(order); }

        const filtering = !!q || changedOnly;
        let shownTotal = 0;
        const html = SECTIONS.map(s => {
            const b = bySection.get(s.id);
            if (!b.all.length) return "";                   // e.g. Fallin' Furni, on a page without its stylesheet
            if (filtering && !b.shown.length) return "";
            shownTotal += b.shown.length;
            /* A search opens every section it found something in, without
               remembering that — clearing the search puts them back. */
            const open = filtering ? true : isOpen(s.id);
            const changedHere = b.all.filter(i => ctls[i].items.some(isChanged)).length;
            // The section's own colours, most-used first: a glance at the
            // strip says whether this is the part you are looking for.
            const strip = b.all.slice()
                .sort((x, y) => (ctls[y].count || 999) - (ctls[x].count || 999)).slice(0, 8)
                .map(i => '<i style="background:' + esc(valueOf(ctls[i].items[0])) + '"></i>').join("");
            return '<section class="rc-sec' + (open ? " is-open" : "") + '" data-sec="' + s.id + '">' +
                '<h4 class="rc-sec-head"><button type="button" class="rc-sec-toggle" data-role="sec-toggle" aria-expanded="' + open +
                    '" aria-controls="rc-sec-' + s.id + '">' +
                    '<span class="rc-sec-caret" aria-hidden="true"></span>' +
                    '<span class="rc-sec-title">' + esc(s.title) + '</span>' +
                    '<span class="rc-count">' + (filtering ? b.shown.length + " of " : "") + b.all.length + '</span>' +
                    (changedHere ? '<span class="rc-sec-changed">' + changedHere + ' changed</span>' : "") +
                    '<span class="rc-sec-strip" aria-hidden="true">' + strip + '</span>' +
                '</button></h4>' +
                '<p class="rc-sec-blurb">' + esc(s.blurb) + '</p>' +
                '<div class="rc-sec-body" id="rc-sec-' + s.id + '"' + (open ? "" : " hidden") + '>' +
                    (open ? (filtering ? b.shown : b.all).map(i => swatchRow(ctls[i], i)).join("") : "") +
                '</div>' +
            '</section>';
        }).join("");

        box.innerHTML = html || '<p class="admin-empty">Nothing matches that.</p>';
        const count = root.querySelector('[data-role="shown"]');
        if (count) count.textContent = filtering ? shownTotal + " of " + ctls.length + " controls" : ctls.length + " controls";
        wireSections(box);
    }

    function render() {
        if (!root) return;
        const changedCount = Object.keys(state.palette.vars).length + Object.keys(state.palette.decls).length;

        root.innerHTML =
            '<div class="rc-bar">' +
                loaderHtml() +
                '<input type="text" class="rc-nameinput" data-role="name" placeholder="Name this palette" value="' + esc(state.name) + '" maxlength="60">' +
                '<button type="button" class="btn" data-role="save" title="' + esc(saveTitle()) + '"' + (writing ? " disabled" : "") + '>Save</button>' +
                /* Was "Duplicate", enabled only for a saved palette. It is the
                   same request either way — a POST under a new name — and
                   with built-in themes loadable it is the button a copy of
                   Pumpkin needs as much as a copy of a saved one. The role
                   stays "duplicate" so the view-only greying in style.css
                   still covers it. (28 Sept 2026) */
                '<button type="button" class="btn" data-role="duplicate" title="Save these colours as a new palette, leaving whatever was loaded as it was"' + (writing ? " disabled" : "") + '>Save as new</button>' +
                '<button type="button" class="btn" data-role="delete"' + (state.current && !writing ? "" : " disabled") + '>Delete</button>' +
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
            '<p class="rc-editing" data-role="editing">' + editingHtml() + '</p>' +

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
                '<input type="search" class="rc-search" data-role="search" placeholder="Find a colour: “row title”, “header”, --parchment, #c7a679…" value="' + esc(state.filter) + '" aria-label="Find a colour control">' +
                '<select data-role="group" aria-label="Which controls to show">' +
                    '<option value="all"' + (state.group !== "changed" ? " selected" : "") + '>All controls</option>' +
                    '<option value="changed"' + (state.group === "changed" ? " selected" : "") + '>Changed only</option>' +
                '</select>' +
                '<button type="button" class="btn" data-role="fold-all" title="Fold every section">Fold all</button>' +
                '<span class="admin-hint" data-role="shown"></span>' +
            '</div>' +
            '<div class="rc-sections" data-role="sections"></div>';

        wire();
        renderSections();
    }

    /* --------------------------------------------------------------- wire */

    function wireSections(box) {
        box.querySelectorAll('[data-role="sec-toggle"]').forEach(btn => btn.addEventListener("click", () => {
            const id = btn.closest(".rc-sec").dataset.sec;
            const open = btn.getAttribute("aria-expanded") !== "true";
            /* Only remembered when it is the person's own choice — a section
               a search opened is not one they asked to keep open. */
            if (!state.filter.trim() && state.group !== "changed") setOpen(id, open);
            else if (!open) setOpen(id, false);
            renderSections();
            const again = root.querySelector('.rc-sec[data-sec="' + id + '"] [data-role="sec-toggle"]');
            if (again) again.focus();
        }));

        box.querySelectorAll(".rc-row").forEach(row => {
            const ctl = ctls[Number(row.dataset.i)];
            const item = ctl.items[0];
            const picker = row.querySelector('[data-role="picker"]');
            const hex = row.querySelector('[data-role="hex"]');
            const alpha = row.querySelector('[data-role="alpha"]');

            const push = (value, redraw) => {
                setControl(ctl, value);
                row.querySelector(".rc-chip").style.background = value;
                hex.value = value;
                row.classList.add("is-changed");
                row.querySelector('[data-role="revert"]').disabled = false;
                if (redraw) renderSections();
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
                setControl(ctl, null); renderSections();
            });
        });
    }

    function wire() {
        const on = (role, ev, fn) => root.querySelectorAll('[data-role="' + role + '"]').forEach(el => el.addEventListener(ev, fn));

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
                    updateEditing();
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

        // A frame's worth of coalescing, so fast typing is one redraw.
        let searchTimer = null;
        on("search", "input", e => {
            state.filter = e.target.value;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(renderSections, 60);
        });
        on("group", "change", e => { state.group = e.target.value; renderSections(); });
        on("fold-all", "click", () => {
            SECTIONS.forEach(s => setOpen(s.id, false));
            renderSections();
        });
        /* A rename is an unsaved change like any other: Save sends it, and
           loading something else would throw it away. */
        on("name", "input", e => { state.name = e.target.value; state.dirty = true; updateEditing(); });
        on("live", "change", e => {
            state.live = e.target.checked;
            if (state.live) applyLive(); else Recolour.clear();
        });
        on("preset", "change", e => loadChoice(e.target.value));
        on("save", "click", () => oneAtATime(save));
        on("duplicate", "click", () => oneAtATime(duplicate));
        on("delete", "click", () => oneAtATime(remove));
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
            headers: { "Content-Type": "application/json", "x-admin-token": currentToken() },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            const err = new Error(data.error || ("Save failed (" + r.status + ")"));
            err.status = r.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    /* Every failed request lands here. A 401 is the twelve-hour session
       running out, and used to show as a bare "Unauthorized" in the status
       line with nothing to do about it; it goes to admin.js's lockOut
       instead (handed over at mount), which puts the sign-in box up. The
       palette stays in memory, so a sign-in and a second Save keeps it. */
    function failed(e) {
        if (e && e.status === 401 && typeof signedOut === "function") {
            say("Your session has expired — sign in again, then save.", "bad");
            signedOut();
            return;
        }
        say(e.message, "bad");
    }

    async function refresh() {
        const d = await api("GET");
        state.saved = d.palettes || [];
    }

    /* Tells the Controls panel's Palette card (js/admin.js) that the list
       has changed — saved, renamed or deleted — and hands it the fresh list,
       so it redraws without a read of its own. An event rather than a call,
       so neither file has to know the other is on the page. `extra` carries
       clearedLive from a delete that took the live palette off. Passes no
       list when the re-read failed, and the card then reads its own.
       (28 Sept 2026) */
    function announce(extra, listFresh) {
        try {
            window.dispatchEvent(new CustomEvent("mazerats:palettes-changed", {
                detail: Object.assign(listFresh === false ? {} : { palettes: state.saved.slice() }, extra || {})
            }));
        } catch (e) { /* the card is a convenience; a save that happened stands */ }
    }

    /* The theme this page is wearing, which is the theme under the preview
       and so the one a palette saved from here was judged against. Stored
       on the palette as baseTheme and worn under it when it goes live — see
       baseThemeOf in js/admin.js for the whole reasoning. Classic is the
       ABSENCE of data-theme (applyTheme in js/api.js). */
    function baseThemeNow() {
        const t = document.documentElement.getAttribute("data-theme");
        return t && /^[a-z]+$/.test(t) ? t : "classic";
    }

    /* What a successful save or create hands back becomes what is loaded:
       the "Editing:" line names it, the loader selects it, and the next
       Save is a PUT carrying ITS updatedAt for the stale-write check. */
    function adopt(doc) {
        state.current = doc.id;
        state.name = doc.name;
        state.origin = { kind: "saved", id: doc.id };
        state.loadedAt = doc.updatedAt || doc.at || null;
        state.dirty = false;
    }

    /* A saved palette that came from somewhere records it in basedOn — a
       palette's id, or "theme-<name>" for a copy of a built-in theme. Only
       ever informational: nothing reads it back to decide anything. */
    function basedOnOf() {
        const o = state.origin;
        if (o && o.kind === "saved") return o.id;
        if (o && o.kind === "theme" && o.id !== "classic") return "theme-" + o.id;
        return null;
    }

    async function create(name, how) {
        try {
            // basedOn only when there is one, so a plain new palette sends
            // exactly the request it always did.
            const body = { name, palette: state.palette, baseTheme: baseThemeNow() };
            const from = basedOnOf();
            if (from) body.basedOn = from;
            const made = await api("POST", body);
            adopt(made);
            // The list is only for the loader; a failed re-read must not
            // turn a save that happened into a red "failed".
            let fresh = true;
            try { await refresh(); } catch (e) { fresh = false; /* keeps the old list */ }
            announce(null, fresh);
            render();
            say((how || "Saved") + ' "' + made.name + '". Editing it now.', "good");
        } catch (e) {
            if (e.status === 409) say(e.message + " Pick another name, or load that one to edit it.", "bad");
            else failed(e);
        }
    }

    /* SAVE, BY WHAT IS LOADED (28 Sept 2026):

         a saved palette      PUT over it, carrying the updatedAt it was
                              loaded at; palettes.js refuses it with a 409 if
                              somebody saved it in between, and the colours
                              stay here for a Save as new
         a built-in theme     never touches the theme. The themes are files
                              generated by tools/themes.js and committed; the
                              editor cannot write them and does not pretend
                              to. A copy of one is saved as a NEW palette
         anything else        a new palette, as it always was

       The endpoint refuses a POST onto a taken name rather than silently
       overwriting, so the distinction has to be made here. */
    /* ONE WRITE AT A TIME (29 Sept 2026). Save, Save as new and Delete had
       no guard, so a double-click sent two POSTs — two new palettes, or a
       PUT and then a second PUT refused with a 409 because the first had
       just moved updatedAt on. While a request is out the three buttons are
       disabled (render() draws them so too, since it redraws the bar mid-
       request), a press that gets through anyway is dropped, and `finally`
       gives them back whatever the answer was. The prompt and confirm the
       handlers open are synchronous, so nothing can be pressed while they
       are up either. `writing` is declared at the top of the file. */
    function syncWriteButtons() {
        if (!root) return;
        ["save", "duplicate", "delete"].forEach(r => {
            const b = root.querySelector('[data-role="' + r + '"]');
            if (b) b.disabled = writing || (r === "delete" && !state.current);
        });
    }

    async function oneAtATime(fn) {
        if (writing) return;
        writing = true;
        syncWriteButtons();
        try { return await fn(); }
        finally { writing = false; syncWriteButtons(); }
    }

    async function save() {
        const name = state.name.trim();
        if (!name) { say("Give it a name first.", "bad"); return; }
        const exists = state.current && state.saved.some(p => p.id === state.current);
        if (!exists) return create(name);
        try {
            // baseTheme is what the preview was over just now, which is
            // what this save was judged against — even if the palette was
            // made over another (the "Editing:" line warns when they differ).
            const payload = { id: state.current, name, palette: state.palette, baseTheme: baseThemeNow() };
            if (state.loadedAt) payload.expectUpdatedAt = state.loadedAt;
            const saved = await api("PUT", payload);
            adopt(saved);
            let fresh = true;
            try { await refresh(); } catch (e) { fresh = false; /* keeps the old list */ }
            announce(null, fresh);
            render();
            say('Saved "' + saved.name + '".', "good");
        } catch (e) { failed(e); }
    }

    // "Save as new": a POST under a name asked for, whatever is loaded.
    async function duplicate() {
        const o = state.origin;
        const suggest = o && o.kind === "saved" ? (state.name.trim() || "Palette") + " copy" : state.name.trim();
        const name = prompt("Name for the new palette", suggest);
        if (!name || !name.trim()) return;
        return create(name.trim(), "Saved a new palette,");
    }

    async function remove() {
        const p = state.saved.find(x => x.id === state.current);
        if (!p) return;
        if (!confirm('Delete "' + p.name + '"? This cannot be undone, and anybody wearing it goes back to the classic palette.')) return;
        try {
            const gone = await api("DELETE", null, "?id=" + encodeURIComponent(p.id));
            state.current = null; state.name = ""; state.palette = EMPTY();
            state.origin = null; state.loadedAt = null; state.dirty = false;
            Recolour.clear();
            /* The delete happened whatever the re-read does, so the card is
               told either way — and told if the site was wearing it, which
               palettes.js reports as clearedLive once it has unset it. */
            const extra = gone && gone.clearedLive ? { clearedLive: true } : null;
            let fresh = true;
            try { await refresh(); } catch (e) { fresh = false; state.saved = state.saved.filter(x => x.id !== p.id); }
            announce(extra, fresh);
            render();
            say(extra ? "Deleted. It was live, so the site is back on its theme alone." : "Deleted.", "good");
        } catch (e) { failed(e); }
    }

    /* ------------------------------------------------ loading what exists

       "Load existing" (28 Sept 2026). The loader lists two kinds of skin,
       grouped, because they are two different things that happen to look
       alike on screen:

         BUILT-IN THEMES — Purple, Pumpkin, Witching Hour, Crimson. Not rows
         in the database: css/theme-<name>.css plus recoloured PNGs under
         assets/img/<name>/, generated by tools/themes.js from a set of HSL
         numbers (a hue for the surfaces, a hue for the light end, curves),
         and committed. There is no colour list anywhere to load — so one is
         READ BACK out of the theme's generated stylesheet, below.

         SAVED PALETTES — rows in the palettes collection, made here. These
         load exactly as they were saved.

       The list of themes is read from the Settings card's own theme buttons
       rather than kept here as a second copy, so a theme added there (and
       to VALID_THEMES in settings.js, and to THEMES in tools/themes.js)
       turns up in the loader by itself. The fallback is only for a page
       without that card. */
    const THEME_FALLBACK = [
        { id: "classic", label: "Classic" }, { id: "purple", label: "Purple" },
        { id: "pumpkin", label: "Pumpkin" }, { id: "witch", label: "Witching Hour" },
        { id: "crimson", label: "Crimson" }
    ];
    function builtInThemes() {
        const seen = new Set();
        const found = [...document.querySelectorAll(".theme-btn[data-theme-state]")]
            .map(b => ({ id: b.dataset.themeState, label: b.textContent.trim() || b.dataset.themeState }))
            .filter(t => /^[a-z]+$/.test(t.id) && !seen.has(t.id) && seen.add(t.id));
        const list = found.length ? found : THEME_FALLBACK.slice();
        // Classic first: it is the starting point every other one departs from.
        list.sort((a, b) => (b.id === "classic") - (a.id === "classic"));
        return list;
    }

    const clone = (p) => JSON.parse(JSON.stringify({
        vars: (p && p.vars) || {}, decls: (p && p.decls) || {}, sprites: (p && p.sprites) || {}
    }));

    /* READING A THEME BACK INTO A PALETTE.

       tools/themes.js writes its stylesheet as a mirror of style.css: every
       rule that paints, with the SAME selector scoped under
       [data-theme="<name>"] and the same declarations, colours transformed.
       The editor's palette is keyed the other way round — "every
       background-color that style.css paints #6b5327 becomes X" — so each
       catalogued colour is looked up at every rule it is used in, the
       theme's value for that same rule and property is read, and the answer
       it gives most often is the one loaded.

       "Most often" because the two models are not the same shape, and this
       is the one place that shows. The theme can treat one colour two ways
       — the same tan as neutral window furniture on the tabs and as the
       accent in a heading — where a palette has one answer per colour. The
       majority is what the palette gets; the minority rules take it too
       once the copy is saved. The glows, filters and markup-sprite swaps in
       the theme's corrections block have no palette equivalent at all.

       The pixel art is the same story in pictures. The theme's PNGs were
       recoloured per pixel by the transform; a palette stores two anchor
       colours per sprite group and re-lights the art between them. So the
       anchors are FITTED: every brown pixel in the original art is paired
       with the same pixel in the theme's copy, and a straight line through
       lightness and saturation gives the darkest and lightest tones. Close,
       not identical, and the note in the "Editing:" line says so.

       Parsed with a constructed CSSStyleSheet so the values come back in
       exactly the serialisation the live scan in recolour.js saw — both are
       the browser's own CSSOM, so "rgb(107, 83, 39)" on one side is
       "rgb(107, 83, 39)" on the other, and the keys line up. */
    const SCOPED = /\[data-theme=(["']?)[a-z]+\1\]\s?/g;
    const normSel = (sel) => String(sel).replace(SCOPED, "").replace(/\s+/g, " ").trim();
    const COLOURS = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
    // The art's brown test, as recolour.js's recolourImage has it.
    const isBrownPx = (h, s) => s >= 0.06 && h >= 12 && h <= 62;

    function readSheet(text) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(text);
        const vars = {};
        const rules = new Map();
        const walk = (list, media) => {
            for (const rule of list) {
                if (rule.cssRules && (rule.media || rule.conditionText !== undefined)) {
                    walk(rule.cssRules, rule.conditionText || (rule.media && rule.media.mediaText) || "");
                    continue;
                }
                if (!rule.style || !rule.selectorText) continue;
                const sel = normSel(rule.selectorText);
                const k = sel + "\n" + media;
                let props = rules.get(k);
                if (!props) rules.set(k, props = {});
                for (let i = 0; i < rule.style.length; i++) {
                    const prop = rule.style[i];
                    const value = rule.style.getPropertyValue(prop).trim();
                    // Later rules win, as they would in the cascade — which is
                    // how the corrections block at the end gets its say.
                    if (prop.startsWith("--")) { if (sel === ":root") vars[prop] = value; continue; }
                    props[prop] = value;
                }
            }
        };
        walk(sheet.cssRules, "");
        return { vars, rules };
    }

    const imgCache = new Map();
    function loadImg(src) {
        if (!imgCache.has(src)) {
            imgCache.set(src, new Promise((ok, fail) => {
                const i = new Image();
                i.onload = () => ok(i);
                i.onerror = () => { imgCache.delete(src); fail(new Error("no " + src)); };
                i.src = src;
            }));
        }
        return imgCache.get(src);
    }
    function pixelsOf(img) {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, c.width, c.height).data;
    }

    async function fitAnchors(themeId, files) {
        const pts = [];
        for (const f of files) {
            let a, b;
            try { [a, b] = await Promise.all([loadImg("/assets/img/" + f), loadImg("/assets/img/" + themeId + "/" + f)]); }
            catch (e) { continue; }              // a sprite the theme has no copy of
            if (a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight) continue;
            const pa = pixelsOf(a), pb = pixelsOf(b);
            for (let i = 0; i < pa.length; i += 4) {
                if (!pa[i + 3] || !pb[i + 3]) continue;
                const [h, s, l] = Recolour.toHsl(pa[i], pa[i + 1], pa[i + 2]);
                if (!isBrownPx(h, s)) continue;
                // Where recolourImage would place this pixel between the anchors.
                const t = Math.max(0, Math.min(1, (l - 0.05) / 0.75));
                pts.push([t, Recolour.toHsl(pb[i], pb[i + 1], pb[i + 2])]);
            }
        }
        if (pts.length < 8) return null;
        const n = pts.length;
        /* The engine places a pixel at  anchor0·(1−t) + anchor1·t, so the
           anchors are the least-squares fit of exactly that — BOXED to 0..1.
           An unboxed straight line was the first version and it was wrong in
           a way worth remembering: the buttons only use two tones, close
           together, so the line through them was steep, ran off both ends
           and was clamped to black and white. Pure black and white anchors
           have no saturation to give, and the Pumpkin buttons came back
           grey. Solving inside the box instead (the unconstrained answer if
           it fits, otherwise the best one along an edge) keeps them amber. */
        const fit = (k, lo, hi) => {
            let s11 = 0, s12 = 0, s22 = 0, r1 = 0, r2 = 0;
            for (const [t, c] of pts) {
                const u = 1 - t, v = c[k];
                s11 += u * u; s12 += u * t; s22 += t * t; r1 += u * v; r2 += t * v;
            }
            const box = (x) => Math.max(lo, Math.min(hi, x));
            const sse = ([a, b]) => pts.reduce((m, [t, c]) => { const e = a * (1 - t) + b * t - c[k]; return m + e * e; }, 0);
            const det = s11 * s22 - s12 * s12;
            if (Math.abs(det) > 1e-9) {
                const a = (r1 * s22 - r2 * s12) / det, b = (s11 * r2 - s12 * r1) / det;
                if (a >= lo && a <= hi && b >= lo && b <= hi) return [a, b];
            }
            const tries = [];
            for (const a of [lo, hi]) tries.push([a, s22 > 1e-9 ? box((r2 - a * s12) / s22) : a]);
            for (const b of [lo, hi]) tries.push([s11 > 1e-9 ? box((r1 - b * s12) / s11) : b, b]);
            return tries.reduce((best, c) => sse(c) < sse(best) ? c : best);
        };
        /* Lightness is kept off the very ends. The anchors travel as hex, and
           a hex at lightness 0 is black with no hue and no saturation left in
           it — the engine then blends hue up from 0 degrees (red) across the
           whole sprite, which put a red cast through the Purple buttons. A
           few percent in from each end, the hex still carries its colour. */
        const [s0, s1] = fit(1, 0, 1), [l0, l1] = fit(2, 0.04, 0.96);
        /* Hue is averaged round the wheel, weighted by saturation so a
           near-grey pixel's meaningless hue does not pull it — separately
           for the darker and lighter halves, since the themes use one hue
           for surfaces and another for the lit end. */
        pts.sort((p, q) => p[0] - q[0]);
        const hueOf = (list) => {
            let x = 0, y = 0;
            for (const [, [h, s]] of list) { x += s * Math.cos(h * Math.PI / 180); y += s * Math.sin(h * Math.PI / 180); }
            return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
        };
        const half = n >> 1;
        const hex = (h, s, l) => Recolour.format([...Recolour.toRgb(h, s, l), 1]);
        return { dark: hex(hueOf(pts.slice(0, half)), s0, l0), light: hex(hueOf(pts.slice(half)), s1, l1) };
    }

    const themeCache = new Map();
    async function convertTheme(id) {
        const res = await fetch("/css/theme-" + id + ".css", { cache: "no-cache" });
        if (!res.ok) throw new Error("css/theme-" + id + ".css answered " + res.status);
        const theme = readSheet(await res.text());
        const cat = state.catalogue;
        const palette = EMPTY();

        for (const v of cat.vars) {
            if (!v.rgba || theme.vars[v.name] === undefined) continue;
            const to = Recolour.parse(theme.vars[v.name]);
            if (!to) continue;                   // a var() or a keyword: nothing to put in a swatch
            const f = Recolour.format(to);
            if (f !== Recolour.format(v.rgba)) palette.vars[v.name] = f;
        }

        let unread = 0;
        for (const d of cat.decls) {
            const votes = new Map();
            for (const u of d.uses) {
                // The theme's OWN rules, catalogued when this page is wearing
                // it: they are the answer, not a question.
                if (/\[data-theme=/.test(u.sel)) continue;
                const props = theme.rules.get(normSel(u.sel) + "\n" + (u.media || ""));
                if (!props) continue;
                const tv = props[d.prop];
                let to;
                // A paint the theme did not restate is one it left alone.
                if (tv === undefined) to = d.colour;
                else {
                    if (tv.includes("var(")) continue;
                    const from = String(u.whole || "").match(COLOURS) || [];
                    const into = tv.match(COLOURS) || [];
                    const at = from.indexOf(d.colour);
                    if (at < 0 || from.length !== into.length) continue;
                    to = into[at];
                }
                const rgba = Recolour.parse(to);
                if (!rgba) continue;
                const f = Recolour.format(rgba);
                votes.set(f, (votes.get(f) || 0) + 1);
            }
            if (!votes.size) { unread++; continue; }
            const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
            if (best !== Recolour.format(d.rgba)) palette.decls[d.key] = best;
        }

        for (const g of SPRITE_GROUPS) {
            const files = Recolour.SPRITES.filter(s => s.group === g.id).map(s => s.file);
            const anchors = await fitAnchors(id, files);
            if (anchors) palette.sprites[g.id] = anchors;
        }
        return { palette, unread };
    }
    function themePalette(id) {
        if (!themeCache.has(id)) {
            themeCache.set(id, convertTheme(id).catch(e => { themeCache.delete(id); throw e; }));
        }
        return themeCache.get(id).then(r => ({ palette: clone(r.palette), unread: r.unread }));
    }

    function applyLoaded(o) {
        state.palette = o.palette;
        state.origin = o.origin;
        state.current = o.current;
        state.name = o.name;
        state.loadedAt = o.loadedAt || null;
        state.history = [];
        state.dirty = false;
        if (state.live) applyLive(); else Recolour.clear();
        render();
    }

    // The loader's value: "", "theme:<id>" or "saved:<id>".
    async function loadChoice(value) {
        if (state.dirty && !confirm("You have unsaved changes to " + describe() + ". Load another anyway? Your changes will be lost.")) { render(); return; }
        const seq = ++state.loading;
        const cut = String(value || "").indexOf(":");
        const kind = cut > 0 ? value.slice(0, cut) : "";
        const id = cut > 0 ? value.slice(cut + 1) : "";

        if (kind === "saved") {
            /* Re-read first. The list was fetched when the panel opened,
               perhaps hours ago; loading from it would start an edit from
               colours somebody has since changed — and then the stale-write
               check would refuse the save, which is right but late. The
               plain list read is not edge-cached (only ?id= is), so this is
               the current row. */
            try { await refresh(); } catch (e) { if (e.status === 401) { failed(e); return; } }
            if (seq !== state.loading) return;
            const p = state.saved.find(x => x.id === id);
            if (!p) { render(); say("That palette is not there any more — deleted since the list was loaded?", "bad"); return; }
            applyLoaded({ palette: clone(p.palette), origin: { kind: "saved", id: p.id }, current: p.id, name: p.name, loadedAt: p.updatedAt || p.at });
            say('Loaded "' + p.name + '".', "good");
            return;
        }

        if (kind === "theme") {
            const t = builtInThemes().find(x => x.id === id);
            if (!t) { render(); return; }
            const origin = { kind: "theme", id: t.id, label: t.label };
            if (t.id === "classic") {
                applyLoaded({ palette: EMPTY(), origin, current: null, name: "" });
                say("Classic is the site's own colours — nothing overridden. Change anything and save it as a new palette.", "good");
                return;
            }
            say("Reading the " + t.label + " theme…", "");
            let got;
            try { got = await themePalette(t.id); }
            catch (e) {
                if (seq === state.loading) { render(); say("Could not read the " + t.label + " theme: " + e.message, "bad"); }
                return;
            }
            if (seq !== state.loading) return;       // something else was picked meanwhile
            applyLoaded({ palette: got.palette, origin, current: null, name: t.label + " (edited)" });
            const p = got.palette;
            say("Loaded a copy of " + t.label + ": " + Object.keys(p.vars).length + " tokens, " +
                Object.keys(p.decls).length + " colours and " + Object.keys(p.sprites).length +
                " sets of art. Save makes it a new palette.", "good");
            return;
        }

        applyLoaded({ palette: EMPTY(), origin: null, current: null, name: "" });
        say("A new palette, starting from the site's own colours.", "");
    }

    /* ---------------------------------------------- the loader and its label */

    function loadedValue() {
        const o = state.origin;
        if (o && o.kind === "theme") return "theme:" + o.id;
        if (state.current && state.saved.some(p => p.id === state.current)) return "saved:" + state.current;
        return "";
    }

    function savedOn(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        const opts = { day: "numeric", month: "short" };
        if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
        return d.toLocaleDateString("en-GB", opts);
    }

    function loaderHtml() {
        const v = loadedValue();
        const opt = (val, label) => '<option value="' + esc(val) + '"' + (v === val ? " selected" : "") + '>' + esc(label) + '</option>';
        return '<label class="rc-load"><span class="rc-load-label">Load</span>' +
            '<select class="rc-preset" data-role="preset" title="Load an existing skin into the editor to change it">' +
                opt("", v === "" ? "New palette (not saved)" : "Start a new palette") +
                '<optgroup label="Built-in site themes">' +
                    builtInThemes().map(t => opt("theme:" + t.id, t.label + (t.id === "classic" ? " (the site's own)" : ""))).join("") +
                '</optgroup>' +
                '<optgroup label="Saved palettes">' +
                    (state.saved.length
                        ? state.saved.map(p => opt("saved:" + p.id, p.name + (savedOn(p.updatedAt || p.at) ? " · " + savedOn(p.updatedAt || p.at) : ""))).join("")
                        : '<option disabled>None saved yet</option>') +
                '</optgroup>' +
            '</select></label>';
    }

    function describe() {
        const o = state.origin;
        if (o && o.kind === "theme") return "your copy of " + o.label;
        if (o && o.kind === "saved") return '"' + (state.name.trim() || o.id) + '"';
        return "this palette";
    }

    function saveTitle() {
        const exists = state.current && state.saved.some(p => p.id === state.current);
        return exists ? "Save over this palette" : "Save as a new palette";
    }

    function editingHtml() {
        const o = state.origin;
        let s;
        if (o && o.kind === "theme" && o.id === "classic") {
            s = 'Editing: <strong>Classic</strong> <span class="rc-kind">built-in</span> — the site\'s own colours, nothing overridden. Save makes a new palette.';
        } else if (o && o.kind === "theme") {
            s = 'Editing: <strong>' + esc(o.label) + '</strong> <span class="rc-kind">built-in</span> — a copy, read back from the theme. ' +
                'Save makes a new palette; the theme itself only changes when tools/themes.js is re-run. ' +
                'Close rather than exact: a few rules the theme treats specially, and the art, are approximated.';
        } else if (o && o.kind === "saved") {
            const p = state.saved.find(x => x.id === o.id);
            const when = p ? savedOn(p.updatedAt || p.at) : "";
            s = 'Editing: <strong>' + esc(p ? p.name : state.name) + '</strong>' +
                (when ? ', saved ' + esc(when) : "") + (p && p.by ? ' by ' + esc(p.by) : "");
        } else {
            s = 'Editing: <strong>a new palette</strong>, not saved yet';
        }
        if (state.dirty) s += ' <span class="rc-unsaved">· unsaved changes</span>';
        /* WHICH THEME IS UNDER THE PREVIEW (28 Sept 2026). This used to warn
           that a worn theme outranked the preview — its rules are scoped
           [data-theme=…], one attribute more specific than the palette's —
           and to switch the site to Classic first. recolour.js now scopes
           the palette the same way and comes later, so the palette wins and
           the warning is gone.

           What is left worth saying is WHICH theme the palette sits on,
           because that is what it will be worn over when it goes live: a
           save records this page's theme as the palette's baseTheme, and the
           Controls panel puts the two live together. The one case that
           needs a warning is a saved palette made over a different theme
           from the one this page is wearing now — the preview is not what
           the site shows, and saving would move it onto this one. */
        const now = baseThemeNow();
        const nameOf = (id) => (builtInThemes().find(t => t.id === id) || { label: id }).label;
        const saved = o && o.kind === "saved" ? state.saved.find(x => x.id === o.id) : null;
        const madeOver = saved ? (saved.baseTheme || "classic") : null;
        if (madeOver && madeOver !== now) {
            s += '<br><span class="rc-kind-warn">Made over ' + esc(nameOf(madeOver)) + ', and worn over it when live — but this page is wearing ' +
                esc(nameOf(now)) + ', so the preview here is not what the site shows. Saving records ' + esc(nameOf(now)) +
                ' as its theme; to keep ' + esc(nameOf(madeOver)) + ', switch the site to it in Controls first.</span>';
        } else if (now !== "classic") {
            s += '<br>Previewing over the ' + esc(nameOf(now)) + ' theme, which is what it is worn over when live.';
        }
        return s;
    }

    function updateEditing() {
        const el = root && root.querySelector('[data-role="editing"]');
        if (el) el.innerHTML = editingHtml();
    }

    /* The panel is one page and a palette has to survive the other six, so
       the preview is handed to a new tab, which keeps it for itself.

       It used to be written to sessionStorage here and the tab opened
       "noopener" — but a noopener tab starts with an EMPTY sessionStorage,
       so the preview never arrived; and the key stayed in THIS tab, where
       every page opened afterwards wore the unsaved palette until the tab was
       closed. Now it goes through localStorage (the one store the new tab
       can see) as a one-shot handoff: a token that only the opened address
       carries, and an expiry a few seconds out. js/palette-wear.js takes it,
       deletes it, and moves it into the preview tab's own sessionStorage.
       Nothing is written to this tab's storage at all.

       "noopener" is kept: the preview has no business holding a handle back
       to the signed-in admin panel. */
    const HANDOFF_KEY = "mazerats_palette_preview_handoff";
    function previewToken() {
        try {
            const bytes = crypto.getRandomValues(new Uint8Array(12));
            return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
        } catch (e) {
            return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 24);
        }
    }
    function previewOnSite() {
        try {
            // Sweeps up after the old sessionStorage preview in this tab, if
            // it is still carrying one from before this change.
            try { sessionStorage.removeItem("mazerats_palette_preview"); } catch (e) {}
            // Not `token`: that name is the session token, one scope up.
            const handoff = previewToken();
            localStorage.setItem(HANDOFF_KEY, JSON.stringify({
                token: handoff,
                // Long enough for a cold function start behind the page's own
                // gate; short enough that a blocked pop-up does not leave a
                // palette waiting for some later tab. palette-wear.js also
                // sweeps an expired one whenever any page loads.
                expires: Date.now() + 30000,
                palette: state.palette
            }));
            // /home, not /home.html: the .html address is a 301 to /home now
            // (see netlify.toml), and there is no reason to spend a hop.
            window.open("/home?palette=preview#palette-preview=" + handoff, "_blank", "noopener");
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
                    // An import is a new palette, whatever was loaded before it.
                    state.origin = null;
                    state.loadedAt = null;
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

    /* The session token, read at the moment of each request. js/admin.js
       now hands over a function (as it does for the atlas) rather than the
       token itself: the editor is mounted once for the life of the page, so
       a copy taken at mount was the OLD token after signing back in, and
       every save failed until the page was reloaded. A plain string is
       still accepted, for any caller that has one. */
    function currentToken() {
        return typeof token === "function" ? (token() || "") : (token || "");
    }

    /* The Controls panel's Palette card can switch this page's theme while
       the editor is open (28 Sept 2026 — it now also puts palettes live, and
       wears their theme here). The catalogue is a scan of the sheets the
       page had loaded, so it would go on listing the old theme's colours and
       miss the new one's; and the "Editing:" line names the theme under the
       preview. So a change of data-theme rescans — once the new theme's
       sheet has actually arrived, or the scan would miss it — re-applies
       the preview and redraws. The palette being edited is untouched: it is
       keyed by colour, not by theme. The theme copies are dropped because
       they were read against the old catalogue. */
    let themeWatched = false;
    function watchTheme() {
        if (themeWatched || typeof MutationObserver === "undefined") return;
        themeWatched = true;
        new MutationObserver(() => {
            updateEditing();
            const again = () => {
                state.catalogue = Recolour.rescan();
                themeCache.clear();
                if (state.live) applyLive(); else Recolour.clear();
                render();
            };
            /* Now, and again when the new sheet lands: a link whose href has
               just changed can still report the old sheet, so "has it
               loaded?" cannot be asked. A load that already happened never
               fires, and the listener is inert. */
            again();
            const link = document.getElementById("theme-css");
            if (link && link.getAttribute("href")) link.addEventListener("load", again, { once: true });
        }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }

    // onSignedOut is admin.js's lockOut — see failed().
    async function mount(container, adminToken, onSignedOut) {
        shell = container;
        token = adminToken;
        signedOut = onSignedOut || null;
        shell.innerHTML = '<div class="rc-status"></div><div class="rc-body"></div>';
        statusEl = shell.querySelector(".rc-status");
        root = shell.querySelector(".rc-body");
        state.catalogue = Recolour.rescan();
        watchTheme();
        try { await refresh(); } catch (e) {
            if (e.status === 401) failed(e);
            else say("Could not load saved palettes: " + e.message, "bad");
        }
        render();
        return state.catalogue;
    }

    /* The browser's "leave site?" prompt for a palette with unsaved edits —
       the same guard the maze form and the guide editor have. A palette is
       a long job of small colour changes, and closing the tab, a Back, or
       the reload a dev server does on every save used to throw the lot
       away without a word. Only "Load another palette" asked first. */
    window.addEventListener("beforeunload", e => {
        if (!state.dirty) return;
        e.preventDefault();
        e.returnValue = "";
    });

    return { mount, state, render };
})();

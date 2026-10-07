/* ===========================================================
   Maze Rats — the Alt Codes window

   Every character Volter Goldfish draws, with the Alt code that types it,
   in a window over the archive. The pictures come first: the stars,
   skulls and hearts in names like "ª Funky Maze ª" are ordinary
   characters that this one font happens to draw as pictures, and nobody
   can guess which ones from a keyboard. Clicking a tile copies it.

   It used to be a page of its own, glyphs.html, opened in a new tab. It
   is a window now for the same reason the guides are: it is looked at
   while doing something else on the site, and a tab of its own made the
   way back the browser's job instead of this page's.

   ADDRESS. /glyphs is a rewrite to this page (netlify.toml), so a link to
   it still works, and loading it opens the window. Opening it from the
   menu pushes one history entry, so Back closes it, as it does for a maze
   or a guide. The history handling is js/guides.js's, line for line, for
   the same races; see there for why each piece exists.

   THE DATA. Read from the font's own cmap table when the sheet was first
   made, and named by eye from the rendering. The three lists below are the
   old page's grid, cell for cell and in its order; they are not the same
   as js/glyph-palette.js's (the /warren palette names a few of the
   pictures differently), so neither is derived from the other.
   =========================================================== */
(function () {
    "use strict";

    const overlay = document.getElementById("glyphs-overlay");
    const body = document.getElementById("glyphs-body");
    const win = document.getElementById("glyphs-window");
    const closeBtn = document.getElementById("glyphs-close");
    if (!overlay || !body || !win) return;

    /* [codepoint, Alt code (null where none reaches it), name (pictures
       only)]. The standard and beyond-range lists are written without the
       parts they never have, and filled out by cellsOf() below. */
    /* The wording is kept to a few words on purpose (28 Sept 2026): the
       window is a sheet to pick from, not an article about the font, and
       the old paragraphs of explanation buried the tiles under them. */
    const GROUPS = [
        {
            title: "Pictures",
            pic: true,
            items: [
                [0x0192, 131, "Heart"],
                [0x2020, 134, "Sparkle"],
                [0x2021, 135, "Crossed circle"],
                [0x2018, 145, "Padlock"],
                [0x2022, 149, "Splash"],
                [0x2014, 151, "Double note"],
                [0x00A5, 165, "Star"],
                [0x00AA, 170, "Skull"],
                [0x00AC, 172, "Fish"],
                [0x00B1, 177, "Phone"],
                [0x00B5, 181, "Mug"],
                [0x00B6, 182, "Lightbulb"],
                [0x00BA, 186, "Lightning"],
                [0x00BB, 187, "Clover"],
                [0x00CC, 204, "Padlock"],
                [0x00CD, 205, "Note"],
                [0x00CE, 206, "Upright object"],
                [0x00D5, 213, "Flower"],
                [0x00E6, 230, "Linked bars"],
                [0x00EC, 236, "Spiral"],
                [0x00ED, 237, "Note"],
                [0x00EE, 238, "Candle"],
                [0x00F5, 245, "Clover"],
                [0x00F7, 247, "Sprout"]
            ]
        },
        {
            title: "Letters & symbols",
            items: [
                [0x20AC, 128], [0x0081, 129], [0x201A, 130], [0x201E, 132], [0x2026, 133], [0x02C6, 136],
                [0x2039, 139], [0x0152, 140], [0x008D, 141], [0x008F, 143], [0x0090, 144], [0x2019, 146],
                [0x201C, 147], [0x201D, 148], [0x2013, 150], [0x2122, 153], [0x203A, 155], [0x0153, 156],
                [0x009D, 157], [0x0178, 159], [0x00A0, 160], [0x00A1, 161], [0x00A2, 162], [0x00A3, 163],
                [0x00A4, 164], [0x00A6, 166], [0x00A7, 167], [0x00A8, 168], [0x00A9, 169], [0x00AB, 171],
                [0x00AD, 173], [0x00AE, 174], [0x00AF, 175], [0x00B0, 176], [0x00B2, 178], [0x00B3, 179],
                [0x00B4, 180], [0x00B7, 183], [0x00B8, 184], [0x00B9, 185], [0x00BC, 188], [0x00BD, 189],
                [0x00BE, 190], [0x00BF, 191], [0x00C0, 192], [0x00C1, 193], [0x00C2, 194], [0x00C3, 195],
                [0x00C4, 196], [0x00C5, 197], [0x00C6, 198], [0x00C7, 199], [0x00C8, 200], [0x00C9, 201],
                [0x00CA, 202], [0x00CB, 203], [0x00CF, 207], [0x00D0, 208], [0x00D1, 209], [0x00D2, 210],
                [0x00D3, 211], [0x00D4, 212], [0x00D6, 214], [0x00D7, 215], [0x00D8, 216], [0x00D9, 217],
                [0x00DA, 218], [0x00DB, 219], [0x00DC, 220], [0x00DD, 221], [0x00DF, 223], [0x00E0, 224],
                [0x00E1, 225], [0x00E2, 226], [0x00E3, 227], [0x00E4, 228], [0x00E5, 229], [0x00E7, 231],
                [0x00E8, 232], [0x00E9, 233], [0x00EA, 234], [0x00EB, 235], [0x00EF, 239], [0x00F1, 241],
                [0x00F2, 242], [0x00F3, 243], [0x00F4, 244], [0x00F6, 246], [0x00F8, 248], [0x00F9, 249],
                [0x00FA, 250], [0x00FB, 251], [0x00FC, 252], [0x00FD, 253], [0x00FE, 254], [0x00FF, 255]
            ]
        },
        {
            // Above U+00FF, where no Alt code reaches: copy only.
            title: "Copy only",
            note: "No Alt code for these.",
            items: [
                0x0131, 0x0152, 0x0153, 0x0178, 0x0192, 0x02C6, 0x02C7, 0x02D6,
                0x02D8, 0x02D9, 0x02DA, 0x02DB, 0x02DD, 0x03C0, 0x1030, 0x2013,
                0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2020,
                0x2021, 0x2022, 0x2026, 0x2039, 0x203A, 0x20AC, 0x2122, 0x2126,
                0x2202, 0x2206, 0x220F, 0x2211, 0x2215, 0x221A, 0x221E, 0x222B,
                0x2248, 0x2260, 0x2264, 0x2265, 0x25CA, 0xF000, 0xF001, 0xF002
            ]
        }
    ];

    const cellsOf = group => group.items.map(it => Array.isArray(it)
        ? { cp: it[0], alt: it[1] === undefined ? null : it[1], name: it[2] || null }
        : { cp: it, alt: null, name: null });

    const altLabel = alt => "Alt+" + String(alt).padStart(4, "0");
    const uniLabel = cp => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");

    let built = false;
    let ownsEntry = false;      // this window pushed the history entry it is on
    let pendingBack = false;    // a Back of our own is in flight
    let pendingPush = null;     // an address waiting for that Back to land
    let basePath = "/home";     // where closing returns the address to
    let triggerEl = null;

    const ADDRESS = "/glyphs";
    const isOpen = () => overlay.classList.contains("open");
    const onGlyphsPath = () => /^\/glyphs\/?$/.test(location.pathname);
    /* The marker is this document's own token, not `true` (1 Oct 2026), as
       the maze window's is (PAGE_TOKEN in js/home.js). history.state
       outlives the document that wrote it: after a reload at /glyphs the
       entry still says glyphs:true, so a later Back onto it counted it as
       ours, and closing then stepped back onto an entry of a document that
       no longer exists — a whole reload of the archive. */
    const TOKEN = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const isOurEntry = () => !!(history.state && history.state.glyphs === TOKEN);

    // ------------------------------------------------------------ drawing

    /* Built once, on first open, and kept: nothing in it changes, and 168
       tiles is not worth drawing for a visit that never opens the window.
       The tiles are made as elements rather than a string of HTML because
       each one's text is a single raw character, some of them controls and
       non-breaking spaces that would need escaping case by case. */
    function build() {
        if (built) return;
        built = true;

        body.innerHTML = `
            <div class="glyphs-intro">
                <p>These symbols only draw as pictures in Volter Goldfish, the font Habbo uses. Anywhere else they
                    show up as ordinary letters, so they're really only useful in Habbo Origins, like in room names.</p>
                <p>Click one to copy it, or hold <kbd>Alt</kbd> and type its code on the number pad.</p>
            </div>
            ${GROUPS.map((g, i) => `
                <section class="glyphs-group" aria-labelledby="glyphs-group-${i}">
                    <h3 class="glyphs-group-title" id="glyphs-group-${i}">${g.title}</h3>
                    ${g.note ? `<p class="glyphs-note">${g.note}</p>` : ""}
                    <div class="glyphs-grid${g.pic ? " is-pics" : ""}" data-group="${i}"></div>
                </section>`).join("")}
            <p class="visually-hidden" id="glyphs-status" role="status" aria-live="polite"></p>`;

        GROUPS.forEach((g, i) => {
            const grid = body.querySelector(`.glyphs-grid[data-group="${i}"]`);
            const frag = document.createDocumentFragment();
            cellsOf(g).forEach(c => frag.appendChild(tile(c, !!g.pic)));
            grid.appendChild(frag);
        });

        flagBlanks();
    }

    function tile(c, pic) {
        const ch = String.fromCodePoint(c.cp);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "glyphs-cell" + (pic ? " is-pic" : "");
        btn.dataset.ch = ch;
        btn.title = "Click to copy";
        // Read out as what it is, not as the character: a screen reader
        // would announce U+00AA as "feminine ordinal", which is the one
        // thing this tile is here to say it is not.
        btn.setAttribute("aria-label",
            `${c.name ? c.name + ", " : ""}${c.alt !== null ? altLabel(c.alt) : uniLabel(c.cp) + ", no Alt code"}. Copy`);

        const add = (cls, text) => {
            const s = document.createElement("span");
            s.className = cls;
            s.textContent = text;
            s.setAttribute("aria-hidden", "true");
            btn.appendChild(s);
            return s;
        };
        add("glyphs-glyph", ch);
        // The picture's name stays in the aria-label above, for a screen
        // reader, but is not printed: the tile is just the glyph and its code.
        /* The one line of small print under the glyph: its Alt code, or
           "Copy" where none reaches it. It is also where "Copied!" shows
           for a moment after a press (see copied), so the tile says what
           happened right where it was pressed. */
        const code = add("glyphs-alt", c.alt !== null ? altLabel(c.alt) : "Copy");
        code.dataset.label = code.textContent;
        return btn;
    }

    /* Flag any tile whose glyph draws nothing, measured rather than
       assumed — as the old page did, and as js/glyph-palette.js does for
       /warren. The font claims these codepoints, so the browser never falls
       back to one that would draw them, and the tile is a blank square. */
    function flagBlanks() {
        if (!document.fonts || !document.fonts.load) return;
        /* Measured in the REGULAR cut, although the tiles draw bold first.
           Where the regular cut draws nothing (U+0081 and its like), the
           bold cut draws a placeholder box instead — so measured bold, those
           slots looked like real glyphs and showed as a row of little boxes.
           They are blanks either way; the regular cut is the one that says
           so. (Nothing the regular cut draws becomes a box in bold: the
           characters the bold cut lacks fall back to regular.) */
        document.fonts.load('36px "Volter Goldfish"').then(() => {
            const cv = document.createElement("canvas");
            cv.width = 64; cv.height = 64;
            const ctx = cv.getContext("2d", { willReadFrequently: true });
            if (!ctx) return;
            body.querySelectorAll(".glyphs-cell").forEach(btn => {
                ctx.clearRect(0, 0, 64, 64);
                ctx.fillStyle = "#fff";
                ctx.font = '40px "Volter Goldfish", monospace';
                ctx.textBaseline = "middle";
                ctx.fillText(btn.dataset.ch, 8, 32);
                const d = ctx.getImageData(0, 0, 64, 64).data;
                for (let i = 3; i < d.length; i += 4) if (d[i] > 20) return;
                // Faded and left empty (see .glyphs-cell.is-blank).
                btn.classList.add("is-blank");
                btn.querySelector(".glyphs-glyph").textContent = "";
            });
        }, () => { /* no font, no flags: the tiles still copy */ });
    }

    // ------------------------------------------------------------ copying

    function copied(btn, ok) {
        const status = document.getElementById("glyphs-status");
        if (!ok) {
            if (status) status.textContent = "Couldn't copy. Select the character and press Ctrl+C.";
            return;
        }
        const code = btn.querySelector(".glyphs-alt");
        btn.classList.add("is-copied");
        if (code) code.textContent = "Copied!";
        clearTimeout(btn._copiedTimer);
        btn._copiedTimer = setTimeout(() => {
            btn.classList.remove("is-copied");
            if (code) code.textContent = code.dataset.label;
        }, 900);
        /* Emptied first and refilled a frame later: a screen reader does not
           announce a live region whose text has not changed, so a second copy
           of the same tile was silent. */
        if (status) {
            const said = `Copied. ${btn.getAttribute("aria-label").replace(/\. Copy$/, "")}`;
            status.textContent = "";
            requestAnimationFrame(() => { status.textContent = said; });
        }
    }

    /* The clipboard API first; the old textarea route where there is none
       (an http:// preview, an older browser), which needs the selection to
       be somewhere, and so briefly takes focus. It goes back to the tile. */
    function copy(btn) {
        const ch = btn.dataset.ch;
        const fallback = () => {
            const ta = document.createElement("textarea");
            ta.value = ch;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            win.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            ta.remove();
            btn.focus({ preventScroll: true });
            copied(btn, ok);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(ch).then(() => copied(btn, true), fallback);
        } else {
            fallback();
        }
    }

    body.addEventListener("click", e => {
        const btn = e.target.closest(".glyphs-cell");
        if (btn) copy(btn);
    });

    // ------------------------------------------------------------ page meta

    /* As js/guides.js: while the window is open, the page's title,
       canonical and og:url name /glyphs rather than /home, and the page's
       own are put back on close.

       Through PageMeta in js/site.js, like the maze window and the Guides.
       This used to keep its own copy of "what was there before", which is
       the same one-slot bookkeeping PageMeta had and the same bug: opened
       over a maze it saved the MAZE's title as the page's own, and a maze
       closed underneath it put the archive's back while this window still
       named /glyphs in its title. One stack for every window keeps them in
       step. */
    const SITE = "https://mazerats.net";

    function setMeta() {
        if (window.PageMeta) window.PageMeta.set("glyphs", "Alt Codes — Maze Rats", SITE + ADDRESS);
    }

    function restoreMeta() {
        if (window.PageMeta) window.PageMeta.restore("glyphs");
    }

    // ------------------------------------------------------------ open/close

    /* opts.fromAddress: opened because the address says so (a pasted link,
       or Forward), so there is nothing of ours to push; opts.owned says
       whether that entry is one this window pushed earlier. See open() in
       js/guides.js for the whole reasoning. */
    function open(opts) {
        const o = opts || {};
        if (isOpen()) { win.focus(); return; }
        if (window.Track && typeof Track.event === "function") Track.event("glyphs-open");
        triggerEl = document.activeElement;
        if (!o.fromAddress) {
            if (pendingBack) {
                // Closed and reopened before our history.back() has landed:
                // the push waits for its popstate instead.
                pendingPush = ADDRESS;
                ownsEntry = false;
            } else {
                basePath = location.pathname + location.search + location.hash;
                try {
                    history.pushState({ glyphs: TOKEN }, "", ADDRESS);
                    ownsEntry = true;
                } catch (e) { ownsEntry = false; }
            }
        } else {
            basePath = "/home";
            ownsEntry = !!o.owned;
        }
        build();
        overlay.classList.add("open");
        document.body.classList.add("modal-open");
        setMeta();
        body.scrollTop = 0;
        win.focus();
    }

    /* opts.fromHistory: the address has already moved on (Back), so only
       the window closes. opts.keepFocus: something else is opening in its
       place and will take focus itself. */
    function close(opts) {
        const o = opts || {};
        if (!isOpen()) return;
        overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
        restoreMeta();
        if (!o.fromHistory) {
            if (pendingBack) {
                pendingPush = null;
            } else if (ownsEntry && !o.replace) {
                pendingBack = true;
                history.back();
            } else {
                try { history.replaceState(null, "", basePath || "/home"); } catch (e) { /* fine */ }
            }
        }
        ownsEntry = false;
        const back = triggerEl;
        triggerEl = null;
        if (o.keepFocus || !back || !document.body.contains(back)) return;
        // Opened from the side menu, which has closed behind it: focus goes
        // to the spine that opens the menu, as it does for the guides.
        const landing = back.closest && back.closest("#side-menu") ? document.getElementById("side-spine") : back;
        if (landing && typeof landing.focus === "function") landing.focus({ preventScroll: true });
    }

    window.addEventListener("popstate", () => {
        if (pendingBack) {
            pendingBack = false;
            if (pendingPush !== null && isOpen()) {
                basePath = location.pathname + location.search + location.hash;
                try {
                    history.pushState({ glyphs: TOKEN }, "", pendingPush);
                    ownsEntry = true;
                } catch (e) { ownsEntry = false; }
            }
            pendingPush = null;
            return;
        }
        if (onGlyphsPath()) {
            if (!isOpen()) open({ fromAddress: true, owned: isOurEntry() });
        } else if (isOpen()) {
            close({ fromHistory: true });
        }
    });

    if (closeBtn) closeBtn.addEventListener("click", () => close());
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    if (window.EscapeLayers) {
        window.EscapeLayers.register({
            elements: () => isOpen() ? [overlay] : [],
            close: () => close()
        });
    }

    // ------------------------------------------------------------ start

    // A pasted /glyphs link opens straight onto the sheet.
    if (onGlyphsPath()) open({ fromAddress: true });

    window.Glyphs = { open: () => open(), close };
})();

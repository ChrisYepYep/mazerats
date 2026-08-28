/* Volter Goldfish glyph palette for the admin page.

   The full set the font actually draws, read from its own cmap table — the
   same data as the standalone reference sheet, at a scale that fits a
   sidebar. Nothing is left out: the picture glyphs come first because they
   are the ones you cannot guess from a keyboard, then everything else the
   font maps, then the codepoints no Alt code can reach.

   Clicking inserts at the caret of whichever text field was last focused,
   which is why the buttons cancel their own mousedown: taking focus would
   destroy the very selection the insert needs. If no field has been touched
   yet the character goes to the clipboard instead, so the palette is never
   a dead end. */
document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("glyph-palette-list");
    const status = document.getElementById("glyph-palette-status");
    if (!root) return;

    // [codepoint, Alt code (null where none reaches it), name (pictures only)]
    const GROUPS = [
        {
            title: "Pictures",
            note: "Drawn instead of the letter Unicode assigns",
            items: [
                [0x0192, 131, "Heart"],
                [0x2020, 134, "Sparkle"],
                [0x2021, 135, "No entry"],
                [0x2018, 145, "Padlock"],
                [0x2022, 149, "Splash"],
                [0x2014, 151, "Notes"],
                [0x00A5, 165, "Star"],
                [0x00AA, 170, "Skull"],
                [0x00AC, 172, "Fish"],
                [0x00B1, 177, "Phone"],
                [0x00B5, 181, "Mug"],
                [0x00B6, 182, "Bulb"],
                [0x00BA, 186, "Bolt"],
                [0x00BB, 187, "Clover"],
                [0x00CC, 204, "Lock"],
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
            title: "Standard",
            note: "Accents, currency, punctuation",
            items: [
                [0x20AC, 128, null],
                [0x0081, 129, null],
                [0x201A, 130, null],
                [0x201E, 132, null],
                [0x2026, 133, null],
                [0x02C6, 136, null],
                [0x2039, 139, null],
                [0x0152, 140, null],
                [0x008D, 141, null],
                [0x008F, 143, null],
                [0x0090, 144, null],
                [0x2019, 146, null],
                [0x201C, 147, null],
                [0x201D, 148, null],
                [0x2013, 150, null],
                [0x2122, 153, null],
                [0x203A, 155, null],
                [0x0153, 156, null],
                [0x009D, 157, null],
                [0x0178, 159, null],
                [0x00A0, 160, null],
                [0x00A1, 161, null],
                [0x00A2, 162, null],
                [0x00A3, 163, null],
                [0x00A4, 164, null],
                [0x00A6, 166, null],
                [0x00A7, 167, null],
                [0x00A8, 168, null],
                [0x00A9, 169, null],
                [0x00AB, 171, null],
                [0x00AD, 173, null],
                [0x00AE, 174, null],
                [0x00AF, 175, null],
                [0x00B0, 176, null],
                [0x00B2, 178, null],
                [0x00B3, 179, null],
                [0x00B4, 180, null],
                [0x00B7, 183, null],
                [0x00B8, 184, null],
                [0x00B9, 185, null],
                [0x00BC, 188, null],
                [0x00BD, 189, null],
                [0x00BE, 190, null],
                [0x00BF, 191, null],
                [0x00C0, 192, null],
                [0x00C1, 193, null],
                [0x00C2, 194, null],
                [0x00C3, 195, null],
                [0x00C4, 196, null],
                [0x00C5, 197, null],
                [0x00C6, 198, null],
                [0x00C7, 199, null],
                [0x00C8, 200, null],
                [0x00C9, 201, null],
                [0x00CA, 202, null],
                [0x00CB, 203, null],
                [0x00CF, 207, null],
                [0x00D0, 208, null],
                [0x00D1, 209, null],
                [0x00D2, 210, null],
                [0x00D3, 211, null],
                [0x00D4, 212, null],
                [0x00D6, 214, null],
                [0x00D7, 215, null],
                [0x00D8, 216, null],
                [0x00D9, 217, null],
                [0x00DA, 218, null],
                [0x00DB, 219, null],
                [0x00DC, 220, null],
                [0x00DD, 221, null],
                [0x00DF, 223, null],
                [0x00E0, 224, null],
                [0x00E1, 225, null],
                [0x00E2, 226, null],
                [0x00E3, 227, null],
                [0x00E4, 228, null],
                [0x00E5, 229, null],
                [0x00E7, 231, null],
                [0x00E8, 232, null],
                [0x00E9, 233, null],
                [0x00EA, 234, null],
                [0x00EB, 235, null],
                [0x00EF, 239, null],
                [0x00F1, 241, null],
                [0x00F2, 242, null],
                [0x00F3, 243, null],
                [0x00F4, 244, null],
                [0x00F6, 246, null],
                [0x00F8, 248, null],
                [0x00F9, 249, null],
                [0x00FA, 250, null],
                [0x00FB, 251, null],
                [0x00FC, 252, null],
                [0x00FD, 253, null],
                [0x00FE, 254, null],
                [0x00FF, 255, null]
            ]
        },
        {
            title: "No Alt code",
            note: "Above U+00FF — click to insert or copy",
            items: [
                [0x0131, null, null],
                [0x02C7, null, null],
                [0x02D6, null, null],
                [0x02D8, null, null],
                [0x02D9, null, null],
                [0x02DA, null, null],
                [0x02DB, null, null],
                [0x02DD, null, null],
                [0x03C0, null, null],
                [0x1030, null, null],
                [0x2126, null, null],
                [0x2202, null, null],
                [0x2206, null, null],
                [0x220F, null, null],
                [0x2211, null, null],
                [0x2215, null, null],
                [0x221A, null, null],
                [0x221E, null, null],
                [0x222B, null, null],
                [0x2248, null, null],
                [0x2260, null, null],
                [0x2264, null, null],
                [0x2265, null, null],
                [0x25CA, null, null],
                [0xF000, null, null],
                [0xF001, null, null],
                [0xF002, null, null]
            ]
        }
    ];

    // Only fields worth typing a glyph into — the maze/event text inputs and
    // the About blurb, not file pickers, dates or numbers.
    const FIELD = 'input[type="text"], input:not([type]), textarea';
    let lastField = null;

    document.addEventListener("focusin", (e) => {
        if (e.target.matches && e.target.matches(FIELD)) lastField = e.target;
    });

    let statusTimer;
    function say(message) {
        status.textContent = message;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { status.textContent = ""; }, 1800);
    }

    function copy(ch) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(ch).then(
                () => say("Copied — paste it in"),
                () => say("Click a text field first")
            );
        } else {
            say("Click a text field first");
        }
    }

    function insert(ch) {
        const el = lastField;
        // A field from a form that has since been closed and re-rendered is
        // detached from the page; writing into it would go nowhere visible.
        if (!el || !document.body.contains(el)) {
            copy(ch);
            return;
        }
        const start = el.selectionStart != null ? el.selectionStart : el.value.length;
        const end = el.selectionEnd != null ? el.selectionEnd : start;
        el.value = el.value.slice(0, start) + ch + el.value.slice(end);
        const caret = start + ch.length;
        el.focus();
        el.setSelectionRange(caret, caret);
        // js/admin.js keeps its own working copy of gallery labels in sync
        // through "input" handlers — setting .value directly does not fire
        // that, so a glyph typed this way would be lost on save without it.
        el.dispatchEvent(new Event("input", { bubbles: true }));
        say("Inserted");
    }

    const buttons = [];

    GROUPS.forEach((g) => {
        const head = document.createElement("p");
        head.className = "glyph-group-title";
        head.textContent = g.title;
        head.title = g.note;
        root.appendChild(head);

        const grid = document.createElement("div");
        grid.className = "glyph-grid";

        g.items.forEach(([code, alt, name]) => {
            const ch = String.fromCodePoint(code);
            const hex = "U+" + code.toString(16).toUpperCase().padStart(4, "0");
            const label = (name ? name + " — " : "") + (alt !== null ? "Alt+0" + alt : hex);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "glyph-btn";
            btn.title = label + (alt !== null && name ? "  (" + hex + ")" : "");
            btn.setAttribute("aria-label", "Insert " + label);
            btn.textContent = ch;
            // Keeps the caret (and the selection) in the field being typed into.
            btn.addEventListener("mousedown", (e) => e.preventDefault());
            btn.addEventListener("click", () => insert(ch));
            grid.appendChild(btn);
            buttons.push(btn);
        });

        root.appendChild(grid);
    });

    // Some codepoints are mapped but draw nothing. Measured rather than
    // assumed, so the palette stays honest if the font is ever swapped.
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            const cv = document.createElement("canvas");
            cv.width = 48;
            cv.height = 48;
            const ctx = cv.getContext("2d", { willReadFrequently: true });
            buttons.forEach((btn) => {
                ctx.clearRect(0, 0, 48, 48);
                ctx.fillStyle = "#fff";
                ctx.font = '30px "Volter Goldfish", monospace';
                ctx.textBaseline = "middle";
                ctx.fillText(btn.textContent, 6, 24);
                const d = ctx.getImageData(0, 0, 48, 48).data;
                let ink = false;
                for (let i = 3; i < d.length; i += 4) {
                    if (d[i] > 20) { ink = true; break; }
                }
                if (!ink) {
                    btn.classList.add("is-blank");
                    btn.title = btn.title + " — draws nothing";
                }
            });
        });
    }
});

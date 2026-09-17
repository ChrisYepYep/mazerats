/* The recolour engine: every colour this site paints with, found by reading
   the stylesheet it is actually running, and overridable one at a time.

   Used by two callers that must not disagree — the admin panel's editor,
   where a preset is built, and the site itself, where a saved one is worn.
   Both go through apply() so a preview cannot drift from the real thing.

   ----------------------------------------------------------------------
   WHY THE CATALOGUE IS SCANNED AND NOT WRITTEN DOWN

   Only 22 of the site's colours are variables. Another 463 declarations
   carry a literal of their own across 187 distinct values, because
   style.css was written before there was any theme to serve and the browns
   were simply typed where they were needed. tools/themes.js exists for the
   same reason and says so at length: converting those by hand would mean
   editing 463 live declarations in a 13,000-line file whose narrow-layout
   block deliberately restates earlier rules, and every one of those edits is
   a chance to change the look the site has today.

   So nothing here edits style.css either. The engine reads the rules the
   browser has already parsed, remembers where each colour came from, and
   paints over it later with a rule carrying the SAME SELECTOR and the same
   property. Same selector means the same specificity, and a later sheet wins
   a specificity tie — so the override lands without having to out-shout
   anything, and removing it puts the original back untouched.

   The practical dividend: this file never goes stale. Add a colour to
   style.css tomorrow and it appears in the editor by itself.

   ----------------------------------------------------------------------
   THE ART IS NOT CSS

   Buttons, scrollbars, the window surround and the tab icons are PNGs, so a
   preset that only moved CSS values would recolour the page around a set of
   stubbornly brown controls. Those sprites are recoloured per pixel on a
   canvas and handed back as blob URLs.

   A saved preset stores no images. The anchors it stores are two colours per
   sprite group, and the art is rebuilt from them on load — 32 small PNGs,
   a few milliseconds, and nothing to keep in sync or invalidate. */

window.Recolour = (function () {
    "use strict";

    /* ------------------------------------------------------------ colour */

    const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

    /* Every form style.css actually uses: #abc, #aabbcc, #aabbccdd, rgb() and
       rgba(). Returns [r, g, b, a] or null, and null is how a value that is
       not a colour at all — `transparent`, `currentColor`, a gradient's
       keyword — stays out of the catalogue instead of being mangled. */
    function parse(input) {
        const c = String(input || "").trim();
        let m = /^#([0-9a-f]{3,8})$/i.exec(c);
        if (m) {
            let h = m[1];
            if (h.length === 3 || h.length === 4) h = h.split("").map(x => x + x).join("");
            if (h.length !== 6 && h.length !== 8) return null;
            const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
        }
        m = /^rgba?\(([^)]+)\)$/i.exec(c);
        if (m) {
            const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
            if (p.length < 3 || p.some(isNaN)) return null;
            return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
        }
        return null;
    }

    /* Printed back the way it arrived. A shadow written rgba(0,0,0,0.35) that
       came back #000000 would still be the right colour and would still lose
       its transparency, so alpha decides the form rather than taste. */
    const format = ([r, g, b, a]) => a >= 1
        ? "#" + hex2(r) + hex2(g) + hex2(b)
        : "rgba(" + Math.round(r) + ", " + Math.round(g) + ", " + Math.round(b) + ", " + (+a.toFixed(3)) + ")";

    function toHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        let h = 0, s = 0;
        if (mx !== mn) {
            const d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
            h *= 60;
        }
        return [h, s, l];
    }

    function toRgb(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        if (s <= 0) { const v = l * 255; return [v, v, v]; }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        const ch = (t) => {
            t = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return [ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255];
    }

    /* WCAG relative luminance, for the contrast warnings. Worth having in the
       editor because the palette is dark and a cheerful mid-tone on a dark
       panel is the easiest mistake to make here — it looks fine to whoever
       picked it and is unreadable to everybody else. */
    function luminance([r, g, b]) {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }

    function contrast(a, b) {
        const x = luminance(a), y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }

    /* ---------------------------------------------------------- grouping

       The same buckets tools/themes.js sorts by, because they are the ones
       that behave differently when recoloured rather than the ones that look
       tidy in a list. A brown is the site's own palette and wants moving
       together; a black at 35% is a shadow and wants leaving alone; a green
       means "this went well" and means nothing at all once it is purple. */

    const BROWN_HUE = [12, 62];
    const MIN_SAT = 0.06;

    /* LIGHTNESS IS ASKED FIRST, and that ordering is the whole subtlety here.
       #fff8ec is the site's warm white — the colour of a heading — and it is
       a fully saturated 34deg, so a hue test alone calls it a brown and files
       it with the window frames. It came back in "Palette" on the first run
       for exactly that reason. Anything this light is read as text however
       warm it is, because that is what somebody hunting for it will call it. */
    function roleOf(rgba) {
        const [h, s, l] = toHsl(rgba[0], rgba[1], rgba[2]);
        if (l >= 0.85) return "bright";
        if (l <= 0.15 && s < 0.25) return "depth";
        if (s >= MIN_SAT && h >= BROWN_HUE[0] && h <= BROWN_HUE[1]) return "palette";
        if (s < MIN_SAT) return "grey";
        return "semantic";
    }

    const GROUPS = {
        palette:  { label: "Palette", hint: "The browns and ambers the site is painted in. Moving these is what makes a theme." },
        depth:    { label: "Shadows & depth", hint: "Blacks, mostly at low opacity. These read as depth rather than as colour — recolour them and edges start to look coloured rather than recessed." },
        bright:   { label: "Bright text", hint: "The near-whites used for headings and hovered links." },
        semantic: { label: "Meaning colours", hint: "Colours that say something: cleared, failed, warning. Changing the hue changes the meaning, so these are left out of a palette sweep by default." },
        grey:     { label: "Greys", hint: "Neutral tones that belong to neither the palette nor the shadows." }
    };

    /* Which part of the site a selector paints, so the editor can offer
       "window frames" rather than 126 unlabelled swatches. First match wins
       and the order is deliberate: .chrome-nav-btn is a button before it is
       chrome, because that is what somebody looking for it would call it. */
    const AREAS = [
        [/scroll|scrollbar/i,                         "Scrollbars"],
        [/\.btn\b|button|\.chrome-nav|\.chrome-tab/i, "Buttons & tabs"],
        [/\.modal|\.chrome-window|\.chrome-frame|\.chrome-titlebar|window/i, "Windows & frames"],
        [/\.admin/i,                                  "Admin panel"],
        [/\.ff-|fallinfurni|\.room-/i,                "Fallin' Furni"],
        [/\.wiz-|wizard|atlas/i,                      "The Atlas"],
        [/\.qz-|quiz/i,                               "Quiz"],
        [/\.guess|\.odd-|\.ratro|daily/i,             "Daily games"],
        [/\.console|\.header|\.site-header|\.brand/i, "Header & console"],
        [/\.tag\b|\.badge|pill/i,                     "Tags & badges"],
        [/table|\bth\b|\btd\b|\btr\b|row/i,           "Tables & rows"],
        [/h1|h2|h3|h4|\ba\b|link|text|\bp\b/i,        "Text & links"],
        [/body|html|:root/i,                          "Page background"]
    ];

    const areaOf = sel => (AREAS.find(a => a[0].test(sel)) || [null, "Everything else"])[1];

    /* ------------------------------------------------------------- scan

       Walks the sheets the browser has parsed. Only this origin's own — a
       cross-origin sheet throws on .cssRules and there are none here anyway,
       but the guard keeps a future CDN font from taking the editor down.

       The engine's own override sheet is skipped, or a second scan would
       catalogue the overrides as if they were the site's own colours and the
       defaults would quietly become whatever was last previewed. */
    const SHEET_ID = "recolour-overrides";
    const SPRITE_ID = "recolour-sprites";

    function scan() {
        const vars = new Map();      // --token -> { value, rgba }
        const decls = new Map();     // key -> { colour, rgba, role, uses[] }
        const images = [];           // every rule that paints with a sprite

        /* `whole` is the declaration the colour was found inside, kept because
           a colour is often only part of one: a box-shadow is offsets, a blur
           and a spread as well, and a gradient is two colours and an angle.
           Re-emitting just the colour would throw the geometry away and flatten
           every shadow on the site. The override swaps the colour INSIDE the
           original value and leaves the rest of it alone. */
        const addDecl = (sel, prop, raw, media, whole) => {
            const rgba = parse(raw);
            if (!rgba) return;
            const key = prop + "|" + raw.toLowerCase().replace(/\s+/g, "");
            if (!decls.has(key)) {
                decls.set(key, {
                    key, prop, colour: raw.trim(), rgba,
                    role: roleOf(rgba), uses: []
                });
            }
            decls.get(key).uses.push({ sel, media: media || "", whole: whole });
        };

        const walk = (rules, media) => {
            for (const rule of rules) {
                if (rule.cssRules && (rule.media || rule.conditionText !== undefined)) {
                    walk(rule.cssRules, rule.conditionText || (rule.media && rule.media.mediaText) || "");
                    continue;
                }
                if (!rule.style || !rule.selectorText) continue;
                for (let i = 0; i < rule.style.length; i++) {
                    const prop = rule.style[i];
                    const value = rule.style.getPropertyValue(prop);
                    if (prop.startsWith("--")) {
                        if (/^:root$/.test(rule.selectorText.trim()) && !vars.has(prop)) {
                            vars.set(prop, { name: prop, value: value.trim(), rgba: parse(value) });
                        }
                        continue;
                    }
                    /* var() references are not colours to catalogue — the
                       variable itself is already one entry and cataloguing
                       every rule that reads it would list the same colour a
                       hundred times under a hundred names. */
                    if (value.includes("var(")) continue;
                    /* The art, catalogued separately: a declaration pointing at
                       one of the sprite PNGs is what a recoloured sprite has to
                       paint over, and it is found here rather than guessed at
                       because only the stylesheet knows which rules use which
                       file. */
                    const png = /url\(\s*["']?[^"')]*\/([a-z0-9_]+\.png)["']?\s*\)/i.exec(value);
                    if (png) images.push({ sel: rule.selectorText, prop, value, file: png[1], media: media || "" });

                    const found = value.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g);
                    if (found) for (const f of found) addDecl(rule.selectorText, prop, f, media, value);
                }
            }
        };

        for (const sheet of document.styleSheets) {
            if (sheet.ownerNode && (sheet.ownerNode.id === SHEET_ID || sheet.ownerNode.id === SPRITE_ID)) continue;
            let rules = null;
            try { rules = sheet.cssRules; } catch (e) { continue; }   // cross-origin
            if (rules) walk(rules, "");
        }

        /* Sorted by how much of the site each one paints. Somebody opening
           this wants the colour that changes the most first, not the one
           that happens to sort first alphabetically. */
        const list = [...decls.values()].sort((a, b) => b.uses.length - a.uses.length);
        for (const d of list) {
            d.area = areaOf(d.uses.map(u => u.sel).join(" "));
            d.count = d.uses.length;
        }
        return { vars: [...vars.values()], decls: list, images };
    }

    /* ------------------------------------------------------------- apply

       A preset is two flat maps of what changed and nothing else:

           vars   { "--amber": "#ab8b64", ... }
           decls  { "color|#fff8ec": "#ffffff", ... }

       Anything absent keeps the site's own value, which is what makes a
       preset small, readable, and forward-compatible with a stylesheet that
       has gained colours since it was saved. */
    function buildCss(preset, cat) {
        const out = [];
        const vars = preset.vars || {};
        const varLines = Object.keys(vars).map(k => "    " + k + ": " + vars[k] + ";");
        if (varLines.length) out.push(":root {\n" + varLines.join("\n") + "\n}");

        const byKey = new Map(cat.decls.map(d => [d.key, d]));
        const media = new Map();
        for (const key of Object.keys(preset.decls || {})) {
            const d = byKey.get(key);
            if (!d) continue;                       // a colour that has since left the stylesheet
            const to = preset.decls[key];
            for (const use of d.uses) {
                /* Swapped INSIDE the declaration it came from, so a shadow
                   keeps its offsets and a gradient keeps its other stop. */
                const line = "    " + d.prop + ": " +
                    (use.whole ? use.whole.split(d.colour).join(to) : to) + ";";
                const rule = use.sel + " {\n" + line + "\n}";
                const bucket = use.media || "";
                if (!media.has(bucket)) media.set(bucket, []);
                media.get(bucket).push(rule);
            }
        }
        for (const [q, rules] of media) {
            const body = [...new Set(rules)].join("\n");
            out.push(q ? "@media " + q + " {\n" + body + "\n}" : body);
        }
        return out.join("\n\n");
    }

    function styleTag(id) {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement("style");
            el.id = id;
            document.head.appendChild(el);          // last, so a tie goes to us
        }
        return el;
    }

    /* --------------------------------------------------------- the sprites

       LIGHTNESS IS KEPT, HUE IS REPLACED. The art is shaded, so mapping every
       pixel to one flat colour would hand back a silhouette. Each pixel keeps
       its place along the sprite's own light-to-dark ramp and is re-lit
       between the two anchors the preset names, which preserves the bevels,
       the dither and the one-pixel highlight that make the frame read as
       carved rather than drawn.

       Only browns are touched, on the same test the CSS side uses — the black
       outline stays black, and the white glint stays white. Without that the
       outlines take the tint and every control turns to mush. */
    function recolourImage(img, darkHex, lightHex) {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const x = c.getContext("2d");
        x.imageSmoothingEnabled = false;
        x.drawImage(img, 0, 0);
        const data = x.getImageData(0, 0, c.width, c.height);
        const d = data.data;
        const dark = parse(darkHex) || [0, 0, 0, 1];
        const light = parse(lightHex) || [255, 255, 255, 1];
        const [dh, ds] = toHsl(dark[0], dark[1], dark[2]);
        const [lh, ls] = toHsl(light[0], light[1], light[2]);
        const dl = toHsl(dark[0], dark[1], dark[2])[2];
        const ll = toHsl(light[0], light[1], light[2])[2];
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue;
            const [h, s, l] = toHsl(d[i], d[i + 1], d[i + 2]);
            if (!(s >= MIN_SAT && h >= BROWN_HUE[0] && h <= BROWN_HUE[1])) continue;
            /* Where this pixel sat between the darkest and lightest brown the
               art uses. Measured against the sprite's own range rather than
               0..1, or a sprite that only uses mid-browns would come back
               using only mid-tones of the new colour and lose its contrast. */
            const t = Math.max(0, Math.min(1, (l - 0.05) / 0.75));
            const [r2, g2, b2] = toRgb(dh + (lh - dh) * t, ds + (ls - ds) * t, dl + (ll - dl) * t);
            d[i] = r2; d[i + 1] = g2; d[i + 2] = b2;
        }
        x.putImageData(data, 0, 0);
        return c;
    }

    /* The art a preset can reach. Everything else on the page is CSS. */
    const SPRITES = [
        { file: "btn_inactive.png", group: "buttons" },
        { file: "btn_active.png", group: "buttons" },
        { file: "window_frame.png", group: "frames" },
        { file: "title_pattern.png", group: "frames" },
        { file: "modal_topclose_x.png", group: "frames" },
        { file: "scrollbar_track_inactive.png", group: "scrollbars" },
        { file: "scrollbar_thumb_inactive.png", group: "scrollbars" },
        { file: "scrollbar_arrow_up_inactive.png", group: "scrollbars" },
        { file: "scrollbar_arrow_down_inactive.png", group: "scrollbars" },
        { file: "scrollbar_arrow_up_active.png", group: "scrollbars" },
        { file: "scrollbar_arrow_down_active.png", group: "scrollbars" },
        { file: "scrollbar_arrow_up_disabled.png", group: "scrollbars" },
        { file: "scrollbar_arrow_down_disabled.png", group: "scrollbars" },
        { file: "mazes_icon.png", group: "icons" },
        { file: "mazes_icon_active.png", group: "icons" },
        { file: "events_icon.png", group: "icons" },
        { file: "MazeBG.png", group: "background" }
    ];

    const spriteCache = new Map();
    const load = (src) => new Promise((ok, fail) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = fail;
        i.src = src;
    });

    /* Blob URLs are revoked on the next run. Left alone they accumulate one
       set of 17 images per keystroke in the editor, which is a slow leak the
       page never recovers from while it is open. */
    let liveUrls = [];

    /* THE OVERRIDE IS THE SAME TRICK THE COLOURS USE. The scan already noted
       every rule that paints with a sprite and the exact declaration it used,
       so each one is re-emitted with the same selector and the same property,
       the file's url swapped for the recoloured blob. Same selector, later
       sheet, so it lands — and nothing here has to know in advance which
       rules referenced which PNG. */
    async function applySprites(preset, base) {
        const groups = preset.sprites || {};
        const cat = catalogueOf();
        const byFile = new Map(SPRITES.map(s => [s.file, s.group]));
        const urls = new Map();
        const made = [];

        for (const s of SPRITES) {
            const anchors = groups[s.group];
            if (!anchors || !anchors.dark || !anchors.light) continue;
            const src = (base || "") + "assets/img/" + s.file;
            let img = spriteCache.get(src);
            if (!img) {
                try { img = await load(src); spriteCache.set(src, img); }
                catch (e) { continue; }             // a missing sprite is not worth failing over
            }
            const blob = await new Promise(r =>
                recolourImage(img, anchors.dark, anchors.light).toBlob(r, "image/png"));
            const url = URL.createObjectURL(blob);
            urls.set(s.file, url);
            made.push(url);
        }

        const media = new Map();
        for (const use of cat.images) {
            if (!byFile.has(use.file) || !urls.has(use.file)) continue;
            const value = use.value.replace(
                /url\(\s*["']?[^"')]*\/([a-z0-9_]+\.png)["']?\s*\)/ig,
                (m, f) => urls.has(f) ? "url(" + urls.get(f) + ")" : m);
            const rule = use.sel + " {\n    " + use.prop + ": " + value + ";\n}";
            const q = use.media || "";
            if (!media.has(q)) media.set(q, []);
            media.get(q).push(rule);
        }
        const out = [];
        for (const [q, rules] of media) {
            const body = [...new Set(rules)].join("\n");
            out.push(q ? "@media " + q + " {\n" + body + "\n}" : body);
        }
        styleTag(SPRITE_ID).textContent = out.join("\n\n");
        liveUrls.forEach(u => URL.revokeObjectURL(u));
        liveUrls = made;
        return made.length;
    }

    /* ------------------------------------------------------------ public */

    let catalogue = null;

    function catalogueOf() {
        if (!catalogue) catalogue = scan();
        return catalogue;
    }

    function apply(preset, opts) {
        const cat = catalogueOf();
        styleTag(SHEET_ID).textContent = buildCss(preset || {}, cat);
        if (preset && preset.sprites && !(opts && opts.skipSprites)) applySprites(preset, opts && opts.base);
        return true;
    }

    function clear() {
        const a = document.getElementById(SHEET_ID);
        const b = document.getElementById(SPRITE_ID);
        if (a) a.textContent = "";
        if (b) b.textContent = "";
        liveUrls.forEach(u => URL.revokeObjectURL(u));
        liveUrls = [];
    }

    return {
        scan: catalogueOf,
        rescan: () => { catalogue = null; return catalogueOf(); },
        apply, clear, buildCss,
        parse, format, toHsl, toRgb, contrast, luminance, roleOf,
        GROUPS, SPRITES, SHEET_ID, SPRITE_ID
    };
})();

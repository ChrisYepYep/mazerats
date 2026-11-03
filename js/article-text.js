/* ===========================================================
   Maze Rats: an article's text, and the blocks set inside it
   (2 Nov 2026, the owner's Articles)

   An article's body is written in the guides' own text format
   (js/guide-text.js: **bold**, *italic*, __underline__, ~~crossed out~~,
   "## " headings, "### " subheadings, "> " tips, "---" dividers, "- " and
   "1. " lists, [words](address) links), so the site still has one way of
   writing and NO HTML IS EVER STORED. On top of that format, three kinds of
   line of its own, each a block cut out before the rest is rendered:

     >> words                a quote (a run of these lines is one quote)
     ![caption](picture)     a picture with its caption under it; the
                             picture is one uploaded to this site's
                             "articles/" image folder, written as its
                             address: /.netlify/functions/image?key=articles/...
                             The caption may be empty, and takes bold,
                             italic and links like any line. {left} or
                             {right} straight after it sets the picture to
                             that side with the text running beside it
                             (3 Nov 2026); without, it takes the width. A
                             side picture may start its paragraph's first
                             line, the words straight after it, as the
                             Align buttons write it.
     {{type name=value ...}} an EMBED: a block drawn by a script of its own
                             (a video, a replay of a prize-wheel draw)

   Everything else is GuideText's, rendered exactly as a guide's or a maze
   description's text is. Shared by the article window on the homepage
   (js/articles.js), the Warren's editor and preview (js/admin-articles.js)
   and, in node, netlify/functions/articles.js, which reads the same lines
   to check every picture and embed before it stores anything; so what the
   server accepted is what the page draws.

   ----------------------------------------------------------------------
   THE EMBED CONTRACT (for the scripts that draw a block of their own)

   1. STORED FORM. One line of the body, on its own:

          {{video key=articles/abc/1700000000000-clip.mp4 poster=articles/abc/1700000000000-clip.png}}
          {{wheel ref=draw-1 draw=a1b2c3}}

      type   [a-z][a-z0-9-]{0,23}
      names  [a-z][a-z0-9]{0,23}, each at most once, never "embed" or "done"
      values [A-Za-z0-9._/:-]{1,240}: no spaces, quotes, < or >, so a value
             can never leave its attribute however it is written out

      `ref` is special: it names an entry in the article's `embedData`
      (below). Any other name is the type's own.

      THE SERVER'S ALLOW-LIST decides which types and names may be stored:
      EMBEDS in netlify/functions/_article-embeds.js, one entry per type
      with a test for each name and the names it must have. A body with an
      embed line of an unknown type, an unknown name or a value that fails
      its test is refused with a message saying which block. A new type is
      added THERE first.

   2. DATA. Anything bigger than an attribute (a prize-wheel draw's
      snapshot: its entrants, slice order, winner and prize line) is kept on
      the article record as embedData: { "<ref>": { ...object... } }, never
      in the body. Each entry must be named by a `ref=` in the body, and its
      type's `data` cleaner in _article-embeds.js must accept it; one with no
      cleaner is refused. The public read sends embedData with the article.

   3. DRAWN FORM. render() below writes each embed line as

          <figure class="art-embed" data-embed="video" data-key="..." data-poster="...">
              <p class="art-embed-wait">Loading...</p>
          </figure>

      with every attribute escaped. Nothing runs until ArticleEmbeds.hydrate
      is called on the container once it is in the page.

   4. THE REGISTRY (window.ArticleEmbeds, in the browser only):

          ArticleEmbeds.register(type, {
              render(el, data),     // required: draw into el (the <figure>)
              label: "Video",       // optional: a word for the block
              editorButton: {       // optional: a button on the Warren's
                  label: "Video",   //   formatting bar for this article
                  title: "...",     //   (its tooltip and accessible name)
                  insert(ctx)       //   see below
              }
          });

      render(el, data) is given the <figure> (emptied first) and
          data = { type, attrs: { name: value, ... }, data: embedData[ref]
                   or null, article: { id, slug, title } or null,
                   preview: true in the Warren's preview }
      It may draw asynchronously. It must never autoplay sound.

      editorButton.insert(ctx) is called when the button is pressed, with
          ctx = { article (the record being edited), token() (the Warren
                  session), upload(file, folder) (js/admin.js's uploader,
                  -> { key, url }), insert(line) (puts a line on its own at
                  the caret), track(key) (an upload the block made by
                  other means, a video's, counted as the edit's own so a
                  cancel or a save that drops it deletes it), setData(ref,
                  object) (the embedData entry,
                  saved with the article), embedLine(type, attrs) (a line
                  built and checked as this file reads them), ask, tell
                  (the Warren's own question and message boxes) }
      and inserts what it makes through ctx.insert.

   5. LAZY LOADING. ArticleEmbeds.SCRIPTS maps a type to the script that
      registers it. The public page loads a type's script only when an
      article it is drawing contains that type, once per page; the Warren's
      editor loads them all (for their buttons). A type with no script, a
      script that fails to load, a type still unregistered after its script
      ran, or a render() that throws: the block says "This part of the
      article couldn't be shown." and the rest of the article stands.
   =========================================================== */
(function (root) {
    "use strict";

    const guide = () => (root && root.GuideText) || (typeof require === "function" ? require("./guide-text.js") : null);
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    const IMAGE_PREFIX = "/.netlify/functions/image?key=";
    // A picture line: the caption (one line, no "]"), then this site's own upload in "articles/".
    const PICTURE = /^!\[([^\]\n]{0,300})\]\((\/\.netlify\/functions\/image\?key=(articles\/[A-Za-z0-9._/-]{1,240}))\)(?:\{(left|right)\})?$/;
    /* A {left} or {right} picture at the start of its paragraph's first
       line, the words straight after it (3 Nov 2026, the owner's: the
       picture sits on the line of the text it goes beside). */
    const PICTURE_LEAD = /^!\[([^\]\n]{0,300})\]\((\/\.netlify\/functions\/image\?key=(articles\/[A-Za-z0-9._/-]{1,240}))\)\{(left|right)\}[ \t]+(\S.*)$/;
    // An embed line, whole. Each value is spaces-free, so a run cannot backtrack into the next.
    const EMBED = /^\{\{([a-z][a-z0-9-]{0,23})((?:[ \t]+[a-z][a-z0-9]{0,23}=[A-Za-z0-9._/:-]{1,240})*)[ \t]*\}\}$/;
    const ATTR = /([a-z][a-z0-9]{0,23})=([A-Za-z0-9._/:-]{1,240})/g;
    const QUOTE = /^\s*>>\s?/;
    const RESERVED = new Set(["embed", "done"]);
    const CAPTION_MAX = 300;

    function parsePicture(line) {
        const m = PICTURE.exec(line);
        if (!m || m[3].includes("..")) return null;
        return { kind: "picture", caption: m[1].trim(), src: m[2], key: m[3], align: m[4] || "" };
    }
    // { pic, rest } for a line led by a side picture (PICTURE_LEAD), else null.
    function parseLeadPicture(line) {
        const m = PICTURE_LEAD.exec(line);
        if (!m || m[3].includes("..")) return null;
        return { pic: { kind: "picture", caption: m[1].trim(), src: m[2], key: m[3], align: m[4] }, rest: m[5] };
    }
    function parseEmbed(line) {
        const m = EMBED.exec(line);
        if (!m) return null;
        const attrs = {};
        let a;
        ATTR.lastIndex = 0;
        while ((a = ATTR.exec(m[2]))) {
            // A name twice, or a reserved one, is not an embed: it stays text.
            if (RESERVED.has(a[1]) || Object.prototype.hasOwnProperty.call(attrs, a[1])) return null;
            attrs[a[1]] = a[2];
        }
        return { kind: "embed", type: m[1], attrs, ref: attrs.ref || "" };
    }

    /* The body as a list of blocks, in order:
         { kind: "text", text }      GuideText's, rendered as it is
         { kind: "quote", text }     the quote's lines, its ">>" marks off
         { kind: "picture", caption, src, key, align }   align "", "left" or "right"
         { kind: "embed", type, attrs, ref } */
    function blocks(text) {
        const lines = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
        const out = [];
        let buf = [];
        const flush = () => {
            if (buf.join("").trim()) out.push({ kind: "text", text: buf.join("\n") });
            buf = [];
        };
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const t = line.trim();
            const pic = t.startsWith("![") ? parsePicture(t) : null;
            if (pic) { flush(); out.push(pic); continue; }
            // A side picture leading a paragraph: the picture, then the paragraph from its words.
            const lead = t.startsWith("![") ? parseLeadPicture(t) : null;
            if (lead) { flush(); out.push(lead.pic); buf.push(lead.rest); continue; }
            const emb = t.startsWith("{{") ? parseEmbed(t) : null;
            if (emb) { flush(); out.push(emb); continue; }
            if (QUOTE.test(line)) {
                flush();
                const q = [];
                while (i < lines.length && QUOTE.test(lines[i])) q.push(lines[i++].replace(QUOTE, ""));
                i--;
                if (q.join("").trim()) out.push({ kind: "quote", text: q.join("\n") });
                continue;
            }
            buf.push(line);
        }
        flush();
        return out;
    }

    function figureHtml(b, opts) {
        const G = guide();
        const alt = (opts && opts.pictureAlt) || "A picture from this article";
        const caption = b.caption ? `<figcaption class="art-caption">${G.inline(b.caption)}</figcaption>` : "";
        // opts.pictureSrc: the page's own sizing of the picture (the image CDN), given the stored address.
        const src = opts && typeof opts.pictureSrc === "function" ? opts.pictureSrc(b.src) : b.src;
        /* The picture fills its frame, which carries the edge and its light
           and dark lines over the picture (3 Nov 2026, the owner's). */
        const side = b.align === "left" || b.align === "right" ? ` art-figure--${b.align}` : "";
        return `<figure class="art-figure${side}"><span class="art-figure-frame"><img class="art-figure-img" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"></span>${caption}</figure>`;
    }
    function embedHtml(b) {
        const data = Object.keys(b.attrs).map(k => ` data-${k}="${esc(b.attrs[k])}"`).join("");
        return `<figure class="art-embed" data-embed="${esc(b.type)}"${data}><p class="art-embed-wait">Loading this part of the article…</p></figure>`;
    }

    /* The whole body as HTML. opts.level: the tag a "## " heading is written
       as (GuideText's own option; 3 by default, under the window's h2).
       opts.pictureAlt: the pictures' alternative text. opts.pictureSrc: see
       figureHtml. */
    function render(text, opts) {
        const G = guide();
        const level = (opts && opts.level) || 3;
        return blocks(text).map(b => {
            if (b.kind === "text") return G.render(b.text, { level });
            if (b.kind === "quote") return `<blockquote class="art-quote">${G.render(b.text, { level })}</blockquote>`;
            if (b.kind === "picture") return figureHtml(b, opts);
            return embedHtml(b);
        }).join("");
    }

    // The words, for search and a summary: captions kept, embeds and marks gone.
    function plain(text) {
        const G = guide();
        return G.plain(blocks(text).map(b => b.kind === "picture" ? b.caption : b.kind === "embed" ? "" : b.text).join("\n\n"));
    }

    /* SIDE PICTURES END ON A LINE (3 Nov 2026, the owner's: "slightly
       smaller, not bigger"). A {left} or {right} picture's height is cut to
       a whole number of the text's lines, caption and gap included, so the
       text beside it wraps under it with no empty band; the picture is
       cropped to the frame (object-fit: cover), never stretched past its
       own shape. Its top meets the paragraph beside it (the css gives it the
       paragraphs' own 1.6em), and a paragraph's gap is one line, so the
       lines run on a grid from there. Called once a block of text is in the
       page, and again by itself as its pictures load, its width changes or
       the fonts arrive. */
    function fitPictures(container) {
        if (!container || typeof container.querySelectorAll !== "function") return;
        const doc = container.ownerDocument, win = doc && doc.defaultView;
        if (!win) return;
        const fit = () => {
            const lh = parseFloat(win.getComputedStyle(container).lineHeight);
            if (!(lh > 0)) return;
            container.querySelectorAll(".art-figure--left, .art-figure--right").forEach(fig => {
                const img = fig.querySelector(".art-figure-img");
                const frame = fig.querySelector(".art-figure-frame");
                /* Only a picture the text wraps beside (3 Nov 2026, the bug
                   scan): on a phone the css sets side pictures full width,
                   unfloated, and one fitted while the window was wider gets
                   its own height and gap back. */
                const fcs = win.getComputedStyle(fig);
                if ((fcs.float || fcs.cssFloat) === "none") {
                    if (img) img.style.height = "";
                    fig.style.marginBottom = "";
                    return;
                }
                if (!img || !frame || !img.naturalWidth || !frame.clientWidth) return;
                const edges = frame.offsetHeight - frame.clientHeight;     // its two 1px borders
                const ideal = frame.clientWidth * img.naturalHeight / img.naturalWidth + edges;
                const cap = fig.querySelector(".art-caption");
                const capOuter = cap ? cap.getBoundingClientRect().height + (parseFloat(win.getComputedStyle(cap).marginTop) || 0) : 0;
                const gap = lh * 0.35;
                const lines = Math.max(2, Math.floor((ideal + capOuter + gap) / lh));
                const frameH = Math.max(lh, Math.min(ideal, lines * lh - capOuter - gap));
                img.style.height = (frameH - edges) + "px";
                fig.style.marginBottom = Math.max(0, lines * lh - frameH - capOuter - 0.5) + "px";
            });
        };
        fit();
        container.querySelectorAll(".art-figure--left .art-figure-img, .art-figure--right .art-figure-img").forEach(img => {
            if (!img.complete) img.addEventListener("load", fit, { once: true });
        });
        if (!container.__artFit) {
            container.__artFit = true;
            if (win.ResizeObserver) new win.ResizeObserver(() => fit()).observe(container);
            if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fit, () => {});
        }
    }

    const pictures = text => blocks(text).filter(b => b.kind === "picture");
    const embeds = text => blocks(text).filter(b => b.kind === "embed");

    /* ---------- for the Warren's formatting bar ---------- */

    // A picture's line, its caption made safe to sit between [ and ], and its side if it has one.
    function pictureLine(src, caption, align) {
        const c = String(caption || "").replace(/[\]\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX);
        return `![${c}](${src})${align === "left" || align === "right" ? `{${align}}` : ""}`;
    }
    /* The Align left and Align right buttons: the picture line the caret is
       on set to that side, or back to the full width if it is there
       already. null when the caret is not on a picture's line. */
    function alignPicture(text, start, align) {
        const t = String(text == null ? "" : text);
        const s = Math.max(0, Math.min(t.length, start | 0));
        const lineStart = t.lastIndexOf("\n", s - 1) + 1;
        let lineEnd = t.indexOf("\n", s);
        if (lineEnd === -1) lineEnd = t.length;
        const line = t.slice(lineStart, lineEnd).trim();
        let pic = parsePicture(line), rest = "";
        if (!pic) {
            const lead = parseLeadPicture(line);
            if (!lead) return null;
            pic = lead.pic;
            rest = lead.rest;
        }
        const to = pic.align === align ? "" : align;
        const code = pictureLine(pic.src, pic.caption, to);
        let after = t.slice(lineEnd), joined = code;
        if (to && rest) joined = code + " " + rest;
        else if (to) {
            /* To a side: the paragraph after it, when what comes next is
               words (not a heading, list, quote, picture or block), joined
               onto its line, so the picture sits on the line of the text it
               goes beside. */
            /* Only across one blank line or none (3 Nov 2026, the bug
               scan): more is the writer's own spacing, left as it is. */
            const m = /^\n(?:[ \t]*\n)?([^\n]*)/.exec(after);
            if (m && isWords(m[1])) { joined = code + " " + m[1].trim(); after = after.slice(m[0].length); }
        } else if (rest) {
            // Back to the full width: the picture on a line of its own again, its paragraph under it.
            joined = code + "\n\n" + rest;
        }
        const caret = lineStart + code.length;
        return { text: t.slice(0, lineStart) + joined + after, start: caret, end: caret, align: to };
    }
    // A line of ordinary words: not blank, a heading, a list, a quote or tip, a divider, a picture or a block.
    const isWords = line => !!String(line || "").trim() &&
        !/^\s*(#{2,3}\s|-\s|\d+\.\s|>|!\[|\{\{|-{3,}\s*$)/.test(line);
    /* An embed's line from its type and attributes, or "" for one this file
       would not read back as an embed (a bad name or value). */
    function embedLine(type, attrs) {
        const parts = Object.keys(attrs || {}).filter(k => attrs[k] !== "" && attrs[k] != null).map(k => `${k}=${attrs[k]}`);
        const line = `{{${type}${parts.length ? " " + parts.join(" ") : ""}}}`;
        const back = parseEmbed(line);
        return back && back.type === type && Object.keys(back.attrs).length === parts.length ? line : "";
    }

    /* A block's line put in on a line of its own at the caret, with a blank
       line either side where there was text, so it never joins a paragraph.
       The selection is left in the text, before it. Returns the new text and
       where the caret goes: `select` is [from, to] inside the inserted line
       (a picture's caption, to type straight in), else after it. */
    function insertBlock(text, start, end, line, select) {
        const t = String(text == null ? "" : text);
        let at = Math.max(0, Math.min(t.length, Math.max(start | 0, end | 0)));
        /* NEVER INSIDE ANOTHER BLOCK'S LINE (3 Nov 2026, the bug scan): a
           picture leaves the caret in its caption's [ ], so the next one (a
           second dropped file, or Picture pressed again) went in between the
           brackets and broke both. A caret inside a picture's or an embed's
           line, or inside the picture code leading a paragraph, puts the
           block in after that line; at the very start of the line it still
           goes in before it. In a side picture's words it splits the
           paragraph there, as in any other. */
        const lineStart = t.lastIndexOf("\n", at - 1) + 1;
        if (at > lineStart) {
            let lineEnd = t.indexOf("\n", at);
            if (lineEnd === -1) lineEnd = t.length;
            const raw = t.slice(lineStart, lineEnd), cur = raw.trim();
            const lead = cur.startsWith("![") ? PICTURE_LEAD.exec(cur) : null;
            const wordsAt = lead ? lineStart + raw.indexOf(cur) + cur.length - lead[5].length : -1;
            if ((cur.startsWith("![") && parsePicture(cur)) || (cur.startsWith("{{") && parseEmbed(cur)) || (lead && at < wordsAt)) at = lineEnd;
        }
        const before = t.slice(0, at), after = t.slice(at);
        const pre = !before.trim() ? "" : /\n[ \t]*\n$/.test(before) ? "" : before.endsWith("\n") ? "\n" : "\n\n";
        const post = !after.trim() ? "" : /^[ \t]*\n[ \t]*\n/.test(after) ? "" : after.startsWith("\n") ? "\n" : "\n\n";
        const lineAt = before.length + pre.length;
        const next = before + pre + line + post + after;
        if (select) return { text: next, start: lineAt + select[0], end: lineAt + select[1] };
        const caret = lineAt + line.length + post.length;
        return { text: next, start: caret, end: caret };
    }

    /* The Quote button: ">> " at the start of every line the selection
       touches, or taken off when every one has it. A tip's "> " becomes a
       quote's ">> " rather than doubling up. (The Tip button on a quote turns
       it into a tip: GuideText's own toggle reads ">> " as a tip's "> "
       with a ">" in its words, and takes the first off.) */
    function toggleQuote(text, start, end) {
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        const endAt = end > start && text[end - 1] === "\n" ? end - 1 : end;
        let lineEnd = text.indexOf("\n", endAt);
        if (lineEnd === -1) lineEnd = text.length;
        const lines = text.slice(lineStart, lineEnd).split("\n");
        const filled = lines.filter(l => l.trim());
        if (!filled.length) {
            const out = ">> Quote";
            return { text: text.slice(0, lineStart) + out + text.slice(lineEnd), start: lineStart + 3, end: lineStart + out.length };
        }
        const has = filled.every(l => QUOTE.test(l));
        const out = lines.map(l => !l.trim() ? l : has ? l.replace(QUOTE, "") : ">> " + l.replace(/^\s*>{1,2}\s?/, "")).join("\n");
        return { text: text.slice(0, lineStart) + out + text.slice(lineEnd), start: lineStart, end: lineStart + out.length };
    }

    // GuideText.format, with the article's own Quote.
    function format(text, start, end, kind) {
        const t = String(text == null ? "" : text);
        let s = Math.max(0, Math.min(t.length, start | 0)), e = Math.max(0, Math.min(t.length, end | 0));
        if (e < s) [s, e] = [e, s];
        if (kind === "blockquote") return toggleQuote(t, s, e);
        return guide().format(t, s, e, kind);
    }

    const ArticleText = {
        blocks, render, plain, pictures, embeds, format, pictureLine, alignPicture, fitPictures, embedLine, insertBlock,
        parsePicture, parseEmbed, esc, IMAGE_PREFIX, CAPTION_MAX
    };
    if (typeof module !== "undefined" && module.exports) { module.exports = ArticleText; return; }
    root.ArticleText = ArticleText;

    /* ---------- the embed registry (see THE EMBED CONTRACT above) ---------- */

    const registry = new Map();
    const loading = new Map();      // type -> Promise of its script having run
    const MISSING = "This part of the article couldn't be shown.";

    function placeholder(el) {
        el.classList.add("is-missing");
        el.innerHTML = `<p class="art-embed-missing">${MISSING}</p>`;
    }

    // The type's definition, loading its script first if it has one and is not here yet.
    function ensure(type) {
        if (registry.has(type)) return Promise.resolve(registry.get(type));
        const src = Object.prototype.hasOwnProperty.call(ArticleEmbeds.SCRIPTS, type) ? ArticleEmbeds.SCRIPTS[type] : "";
        if (!src) return Promise.resolve(null);
        if (!loading.has(type)) {
            loading.set(type, new Promise(resolve => {
                const s = document.createElement("script");
                s.src = src;
                s.async = true;
                s.onload = () => resolve();
                // Asked again next time: a blip is not a missing script.
                s.onerror = () => { loading.delete(type); resolve(); };
                document.head.appendChild(s);
            }));
        }
        return loading.get(type).then(() => registry.get(type) || null);
    }

    const ArticleEmbeds = {
        /* type -> the script that registers it, loaded on first need. The
           video and wheel agents add theirs here. */
        SCRIPTS: {
            video: "js/article-video.js?v=1",
            // A prize-wheel draw's replay (it loads js/wheel-draw.js and its stylesheet itself).
            wheel: "js/article-wheel.js?v=4"
        },
        register(type, def) {
            if (typeof type !== "string" || !/^[a-z][a-z0-9-]{0,23}$/.test(type)) return;
            if (!def || typeof def.render !== "function") return;
            registry.set(type, def);
        },
        has: type => registry.has(type),
        get: type => registry.get(type) || null,
        // Every registered type with a button for the Warren's bar: [{ type, button }].
        buttons() {
            return [...registry.entries()].filter(([, d]) => d.editorButton && typeof d.editorButton.insert === "function")
                .map(([type, d]) => ({ type, button: d.editorButton }));
        },
        // Every known type's script, for the Warren's editor (their buttons).
        loadAll() {
            return Promise.all(Object.keys(ArticleEmbeds.SCRIPTS).map(ensure));
        },
        /* Draws every embed inside `container` not drawn yet. ctx: { article,
           embedData, preview }. Safe to call again after more is added. */
        hydrate(container, ctx) {
            if (!container || typeof container.querySelectorAll !== "function") return;
            const c = ctx || {};
            container.querySelectorAll("figure.art-embed[data-embed]:not([data-done])").forEach(el => {
                el.setAttribute("data-done", "");
                const type = el.getAttribute("data-embed");
                const attrs = {};
                Array.from(el.attributes).forEach(a => {
                    const m = /^data-([a-z][a-z0-9]{0,23})$/.exec(a.name);
                    if (m && !RESERVED.has(m[1])) attrs[m[1]] = a.value;
                });
                const store = c.embedData && typeof c.embedData === "object" ? c.embedData : null;
                const data = {
                    type, attrs,
                    data: store && attrs.ref && Object.prototype.hasOwnProperty.call(store, attrs.ref) ? store[attrs.ref] : null,
                    article: c.article ? { id: c.article.id || "", slug: c.article.slug || "", title: c.article.title || "" } : null,
                    preview: !!c.preview
                };
                ensure(type).then(def => {
                    if (!el.isConnected) return;
                    if (!def) { placeholder(el); return; }
                    try {
                        el.replaceChildren();
                        el.classList.remove("is-missing");
                        def.render(el, data);
                    } catch (e) {
                        if (window.console) console.warn("An article block could not be drawn", type, e);
                        placeholder(el);
                    }
                });
            });
        },
        MISSING
    };
    root.ArticleEmbeds = ArticleEmbeds;
})(typeof window !== "undefined" ? window : this);

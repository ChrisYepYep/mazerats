/* ===========================================================
   Maze Rats — the little text format guides are written in

   A guide section's text is typed into a plain textarea in /warren, so it
   needs a format that is quick to write and impossible to get wrong in a
   way that breaks the page. This is deliberately small:

     A blank line          starts a new paragraph
     **bold**  *italic*    emphasis
     __underline__         underlined, and ~~crossed out~~
     ## Heading            a heading, and ### a subheading (own line)
     ---                   a divider (a line of dashes, own line)
     - item                a bulleted list (one item per line)
     1. item               a numbered list
     > Tip text            a tip, set apart in a box
     [words](address)      a link, where the address is one of:
                             https://...        another website (new tab);
                                                https only, and one level
                                                of brackets is fine, as in
                                                a Wikipedia address
                             maze:tutorial-maze a maze in the archive
                             event:some-event   an event in the archive
                             guide:some-guide   another guide
                             console:entry      the console's Event
                                                Submission form

   LINKS ARE LIFTED OUT FIRST, from the text as typed: each is built on its
   own (its words escaped and emphasised by themselves, its address checked
   and then escaped) and parked behind a placeholder. Only then is the rest
   escaped and given its bold and italics, and the links put back last. So
   an address is never read after escaping has mangled its quotes or
   brackets, emphasis can never reach inside an href, and a link sitting
   inside *italics* cannot leave a tag unclosed. Nothing typed into a guide
   can become markup the format did not make itself. A link whose address
   is anything else is left as its words.

   Shared by the reader on the homepage (js/guides.js) and the editor's
   preview in /warren (js/admin-guides.js), so what an admin previews is
   exactly what a visitor reads.

   And, since 30 Sept 2026, the one format for a maze's or an event's
   description and full details too, so the site has a single way of
   writing bold or a link: the room window (js/home.js) and the front
   page's event window (js/welcome.js) render them with it, the cards and
   the share preview take it off with plain(), and the /warren form's
   buttons write it with format() below.
   =========================================================== */
(function (root) {
    "use strict";

    function esc(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // An archive id or a guide id: what the site's own ids look like.
    const ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

    /* [words](address). The address has no spaces and may hold one level
       of balanced brackets — https://en.wikipedia.org/wiki/Maze_(disambiguation)
       — so the bracket that closes the link is the first one left unmatched. */
    const LINK = /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

    /* LINK, found by a scan rather than by LINK.replace (30 Sept 2026), with
       exactly the same matches. As a /g pattern it was tried from every
       "[", and each try ran on to the line's first "]": a 100KB line of
       "[" took two and a half seconds to render, and again in plain() and
       in share.js. Every "[" before the same "]" gets the same answer, so
       the scan tries only the first and then moves past that "]". The
       address is read with LINK's own address pattern, from just after the
       "]". fn is given (whole, words, address), as replace's would be. */
    const LINK_ADDR = /\(((?:[^()\s]|\([^()\s]*\))+)\)/y;
    function replaceLinks(str, fn) {
        let out = "", from = 0, i = 0;
        for (;;) {
            const p = str.indexOf("[", i);
            if (p < 0) break;
            let q = p + 1;
            while (q < str.length && str[q] !== "]" && str[q] !== "\n") q++;
            if (q >= str.length) break;
            if (str[q] === "]" && q > p + 1) {
                LINK_ADDR.lastIndex = q + 1;
                const m = LINK_ADDR.exec(str);
                if (m) {
                    out += str.slice(from, p) + fn(str.slice(p, LINK_ADDR.lastIndex), str.slice(p + 1, q), m[1]);
                    from = i = LINK_ADDR.lastIndex;
                    continue;
                }
            }
            i = q + 1;
        }
        return out + str.slice(from);
    }

    // Bold and italics, on text that has already been escaped. Every
    // replacement writes an opening tag and its closing tag together, so
    // what comes out is always balanced.
    //
    // Bold runs again after italics (30 Sept 2026), for the /warren
    // toolbar: "**a *b* c**" — italics inside bold — could not be read by
    // one bold pass, because a bold run may not contain a star, and came
    // out with its outer stars showing. The tags written by the first two
    // passes hold no stars, so the second bold pass finds it; "***x***" and
    // "*a **b** c*" were already read by the first two.
    const BOLD = /\*\*([^*\n]+)\*\*/g;
    const ITALIC = /(^|[^*])\*([^*\n]+)\*(?!\*)/g;
    /* Underline and strikethrough (30 Sept 2026, for the fuller /warren
       toolbar): __words__ and ~~words~~. Neither character is touched by
       esc(), and each run is one line, like bold. They go first, so bold and
       italics can sit inside them and they inside bold. */
    /* ONLY MARKS THAT HUG THEIR WORDS (30 Sept 2026, the owner's). As
       /__([^_\n]+)__/, decoration and code turned into marks: "~~ Welcome
       ~~" was struck through, "~~~ Title ~~~" came out half struck, and
       "a__b__c" was underlined. A mark now needs no word character and no
       mark character touching it on the outside, and something other than
       a space just inside it. (A lone "__init__" still underlines: it
       cannot be told apart from underlining "init".) No lookbehind, which
       older Safari cannot parse: the words are "[^\s_]" alone, or that and
       then anything up to a last "[^\s_]". share.js's plainText and
       clearFormat below use the same two patterns. */
    const UNDER = /(^|[^\w_])__([^\s_](?:[^_\n]*[^\s_])?)__(?![\w_])/g;
    const STRIKE = /(^|[^\w~])~~([^\s~](?:[^~\n]*[^\s~])?)~~(?![\w~])/g;
    /* NEVER MISNESTED (30 Sept 2026). Each pass wrote its own tags
       balanced, but a later pass could match across a tag an earlier one
       wrote: "__a **b__ c**" became <u>a <strong>b</u> c</strong>. A run
       whose words hold the earlier passes' tags out of balance is now left
       as typed, marks showing. Normal nesting and marks side by side are
       balanced, so they come out exactly as before. */
    function balanced(html) {
        const open = [], tag = /<(\/?)(u|s|strong|em)>/g;
        let m;
        while ((m = tag.exec(html))) {
            if (!m[1]) open.push(m[2]);
            else if (open.pop() !== m[2]) return false;
        }
        return open.length === 0;
    }
    const wrap = name => (m, words) => balanced(words) ? `<${name}>${words}</${name}>` : m;
    const wrapAfter = name => (m, lead, words) => balanced(words) ? `${lead}<${name}>${words}</${name}>` : m;
    function emphasis(escaped) {
        return escaped
            .replace(UNDER, wrapAfter("u"))
            .replace(STRIKE, wrapAfter("s"))
            .replace(BOLD, wrap("strong"))
            .replace(ITALIC, wrapAfter("em"))
            .replace(BOLD, wrap("strong"));
    }

    /* One link, from its finished words (HTML) and its address as typed.
       The address is checked, not escaped-and-hoped: only the four shapes
       above ever produce a link, and what goes into the href is escaped
       after the check. */
    /* Links into the console (30 Sept 2026, the owner's): console:entry
       opens its Event Submission page. The href is a real address,
       /home#submit-entry, so it works from any page and in a new tab; on
       the archive itself js/console.js catches the click by
       data-console-page and opens the page without reloading. Only the
       names listed here make a link. */
    const CONSOLE_PAGES = { entry: "/home#submit-entry" };

    function link(words, address) {
        const a = String(address || "").trim();
        const toConsole = /^console:([a-z]+)$/.exec(a);
        if (toConsole && Object.prototype.hasOwnProperty.call(CONSOLE_PAGES, toConsole[1])) {
            return `<a class="guide-link" href="${CONSOLE_PAGES[toConsole[1]]}" data-console-page="${toConsole[1]}">${words}</a>`;
        }
        const internal = /^(maze|event|guide):(.+)$/.exec(a);
        if (internal && ID.test(internal[2])) {
            const [, kind, id] = internal;
            // Real addresses, so opening one in a new tab or copying it works
            // too; js/guides.js takes over an ordinary click. By id, which
            // the share function sends on to the record's current address.
            const href = `/${kind === "guide" ? "guides" : kind}/${id}`;
            return `<a class="guide-link" href="${href}" data-guide-${kind}="${id}">${words}</a>`;
        }
        try {
            // https only, as the format says and the /warren help repeats:
            // a plain-http page would be the one link on the site a network
            // in between could rewrite.
            const u = new URL(a);
            if (u.protocol === "https:" && /^https:\/\//i.test(a)) {
                return `<a class="guide-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${words}</a>`;
            }
        } catch (e) { /* not a URL: the words stand on their own */ }
        return words;
    }

    // Inline formatting inside one run of text, as typed (not yet escaped).
    function inline(raw) {
        const links = [];
        // \u0000 marks a parked link, so any typed into the text goes first:
        // nothing typed can pose as a placeholder.
        const parked = replaceLinks(String(raw == null ? "" : raw).replace(/\u0000/g, ""), (m, words, addr) => {
            links.push(link(emphasis(esc(words)), addr));
            return `\u0000${links.length - 1}\u0000`;
        });
        return emphasis(esc(parked))
            .replace(/\u0000(\d+)\u0000/g, (m, i) => links[Number(i)]);
    }

    /* The whole text, as HTML. Blocks are separated by blank lines; within a
       block, lines that all start "- " (or "1. ") are a list, lines starting
       "> " are a tip, and anything else is a paragraph whose single line
       breaks are kept. */
    /* Headings and dividers (30 Sept 2026): "## Heading", "### Subheading"
       and a line of three or more dashes, "---". Each is a block of its own
       whether or not blank lines surround it, so a heading written straight
       above its paragraph still reads as one — they are cut out into their
       own blocks before the text is split. */
    /* ONE LINE AT A TIME, AND NO NESTED STARS (30 Sept 2026). The heading
       pattern was /^\s*(#{2,3})\s+(.+?)\s*#*\s*$/, whose lazy words and
       two \s* either side of #* took cubic time on a heading with a run of
       spaces before a stray "#": 3,000 characters of "## a    ...    #x"
       froze the page (and share.js, through plain()) for eight seconds.
       The words are now everything after the marks, and headingText()
       takes a closing run of #s off with a loop. A closing run needs a
       space before it, as in "## Rules ##", so "## Learn C#" keeps its #. */
    const HEADING = /^\s*(#{2,3})\s+(\S[^\n]*)$/;
    const DIVIDER = /^\s*-{3,}\s*$/;
    function headingText(words) {
        let s = String(words).trimEnd(), j = s.length;
        while (j > 0 && s[j - 1] === "#") j--;
        if (j < s.length && j > 0 && /\s/.test(s[j - 1])) s = s.slice(0, j).trimEnd();
        return s;
    }
    /* BLANK LINES ARE KEPT (30 Sept 2026, the owner's). One blank line
       between two blocks shows as one line's worth of space (the margin in
       css/style.css), and every blank line beyond the first adds another,
       as an empty .fmt-blank — before this, three blank lines looked
       exactly like one. They are counted from the text as TYPED, before the
       headings and dividers are cut out into blocks of their own below,
       which adds no space of its own. */
    function render(text) {
        const src = String(text || "").replace(/\r\n?/g, "\n").trim();
        // Chunks, with the runs of blank lines between them kept (odd indices).
        const parts = src.split(/(\n(?:[ \t]*\n)+)/);
        const out = [];
        for (let i = 0; i < parts.length; i += 2) {
            const sep = i > 0 ? parts[i - 1] : "";
            const blanks = sep ? sep.split("\n").length - 2 : 0;
            for (let k = 1; k < blanks; k++) out.push(`<p class="fmt-blank" aria-hidden="true"></p>`);
            parts[i].split("\n")
                .map(l => (HEADING.test(l) || DIVIDER.test(l)) ? `\n${l}\n` : l)
                .join("\n")
                .split(/\n\s*\n/)
                .forEach(b => { const html = block(b); if (html) out.push(html); });
        }
        return out.join("");
    }

    function block(chunk) {
        {
            const lines = chunk.split("\n").map(l => l.trimEnd());
            // A heading cut out above can leave an empty line at a block's edge.
            while (lines.length && !lines[0].trim()) lines.shift();
            while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
            if (!lines.join("").trim()) return "";
            const only = lines.filter(l => l.trim());
            if (only.length === 1 && DIVIDER.test(only[0])) return `<hr class="fmt-rule">`;
            const h = only.length === 1 && HEADING.exec(only[0]);
            if (h) {
                return h[1].length === 2
                    ? `<h3 class="fmt-heading">${inline(headingText(h[2]))}</h3>`
                    : `<h4 class="fmt-subheading">${inline(headingText(h[2]))}</h4>`;
            }
            if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
                return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
            }
            if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) {
                return `<ol>${lines.map(l => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`;
            }
            if (lines.every(l => /^\s*>/.test(l))) {
                const body = lines.map(l => l.replace(/^\s*>\s?/, "")).join("\n");
                return `<aside class="guide-tip">${inline(body).replace(/\n/g, "<br>")}</aside>`;
            }
            return `<p>${inline(lines.join("\n")).replace(/\n/g, "<br>")}</p>`;
        }
    }

    // The text with the format taken off, for a card's summary or a search.
    // List and tip markers first, as render() reads them before anything
    // inside a line; then the stars, by the same three passes that render
    // them, so a star that would show on the page stays in the summary too.
    /* Line by line (30 Sept 2026), as render() reads them. As /gm patterns
       over the whole text, the leading \s* ran on through every blank line
       below each line start, so 100,000 blank lines took eight seconds
       here and in share.js; and a "##" or "-" alone on its line lost its
       mark to the words on the next, which the page shows with it. A
       heading's words keep any "- " they start with, as the page does.
       share.js's plainText is this, step for step. */
    function plainLine(l) {
        if (DIVIDER.test(l)) return "";
        const h = HEADING.exec(l);
        if (h) return headingText(h[2]);
        return l.replace(/^\s*(?:[-*]\s+|\d+[.)]\s+|>\s?)/, "");
    }
    function plain(text) {
        return replaceLinks(String(text || "").replace(/\r\n?/g, "\n"), (m, words) => words)
            .split("\n").map(plainLine).join("\n")
            // An underline leaves a \u0001 where render() leaves its tags,
            // so "__a__~~b~~" loses both marks here as it does on the page.
            .replace(UNDER, "$1\u0001$2\u0001")
            .replace(STRIKE, "$1$2")
            .replace(BOLD, "$1")
            .replace(ITALIC, "$1$2")
            .replace(BOLD, "$1")
            .replace(/\u0001/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    /* ---------- the /warren formatting buttons (30 Sept 2026) ----------

       What the Bold, Italic, Link and list buttons over a maze's or an
       event's description do to the text, kept here beside the renderer
       that reads it so the two cannot drift apart. Pure: given the text and
       the selection, format() returns the new text and the new selection,
       and js/admin.js puts them into the textarea. Nothing here touches the
       page, so it can be tested in node.

       Each button toggles. Bold on text that is already bold (the stars
       just outside the selection, or selected with it) takes the stars off
       again, and a list button on a list takes the markers off. With
       nothing selected, a placeholder goes in, selected, to type over. */
    function starsBefore(s, i) { let n = 0; while (i - n - 1 >= 0 && s[i - n - 1] === "*") n++; return n; }
    function starsAfter(s, i) { let n = 0; while (s[i + n] === "*") n++; return n; }
    function starsFrom(s, i, end) { let n = 0; while (i + n < end && s[i + n] === "*") n++; return n; }
    function starsTo(s, i, start) { let n = 0; while (i - n - 1 >= start && s[i - n - 1] === "*") n++; return n; }

    // The selection with any spaces at either end left outside it: "**word **"
    // is not bold in this format, so the stars have to hug the words.
    function trimSel(text, start, end) {
        let s = start, e = end;
        while (s < e && /\s/.test(text[s])) s++;
        while (e > s && /\s/.test(text[e - 1])) e--;
        return [s, e];
    }

    /* LINE BY LINE, BOTH WAYS (30 Sept 2026). A mark cannot cross a line
       break, so several lines selected are each wrapped on their own — and
       pressed again they must each be unwrapped on their own. Before, the
       second press tested the selection as one run: "**one**\n**two**" has
       stars at both ends, so only the outer two pairs came off and it left
       "one**\n**two". And a list's, tip's or heading's marker ("- ", "1. ",
       "> ", "## ") selected with its line stayed outside the stars on the
       way in but not on the way out: "- item" became "- **item**" with the
       caret two places early, so the next press doubled the stars instead
       of taking them off. Each line is now split into its marker, the
       spaces, and its words (by trim(), not by /^(\s*)([\s\S]*?)(\s*)$/,
       whose lazy middle took three seconds on a 100KB line ending in
       spaces); the mark comes off when every line's words carry it, and
       goes on otherwise. The marks just OUTSIDE the selection are only
       looked for on one line with no marker selected, the one case where
       what sits either side is the same run of words. */
    function toggleLines(text, s, e, mark, isWrapped, outside) {
        const size = mark.length;
        const sel = text.slice(s, e);
        const atLineStart = s === 0 || text[s - 1] === "\n";
        const parts = sel.split("\n").map((line, i) => {
            const lead = (i > 0 || atLineStart) ? LEAD.exec(line)[0] : "";
            const rest = line.slice(lead.length);
            const core = rest.trim();
            const at = rest.length - rest.trimStart().length;
            return { line, lead, pre: rest.slice(0, at), core, post: core ? rest.slice(at + core.length) : "" };
        });
        const filled = parts.filter(p => p.core);
        const one = parts.length === 1 ? parts[0] : null;
        // A marker alone (">" selected by itself): no words to mark.
        if (!filled.length) return { text, start: s, end: e };
        if (one && !one.lead && !isWrapped(one.core) && outside()) {
            const next = text.slice(0, s - size) + sel + text.slice(e + size);
            return { text: next, start: s - size, end: e - size };
        }
        const off = filled.length > 0 && filled.every(p => isWrapped(p.core));
        const out = parts.map(p => {
            if (!p.core) return p.line;
            const core = off ? p.core.slice(size, p.core.length - size) : mark + p.core + mark;
            return p.lead + p.pre + core + p.post;
        }).join("\n");
        const next = text.slice(0, s) + out + text.slice(e);
        if (!one) return { text: next, start: s, end: s + out.length };
        // One line: the words are left selected, without their marks.
        const at = s + one.lead.length + one.pre.length + (off ? 0 : size);
        return { text: next, start: at, end: at + one.core.length - (off ? 2 * size : 0) };
    }

    function toggleMark(text, start, end, mark, placeholder) {
        const size = mark.length;
        // Two stars are bold and one italic, so a run of three is both: bold
        // is there when both sides have two or more, italic when both sides
        // have an odd number.
        const has = (b, a) => size === 2 ? (b >= 2 && a >= 2) : (b % 2 === 1 && a % 2 === 1);
        const [s, e] = trimSel(text, start, end);
        if (s === e) {
            const at = end;
            return { text: text.slice(0, at) + mark + placeholder + mark + text.slice(at),
                start: at + size, end: at + size + placeholder.length };
        }
        // The markers selected along with the words, on a line's words.
        const isWrapped = core => {
            const b = starsFrom(core, 0, core.length), a = starsTo(core, core.length, 0);
            return core.length > b + a && has(b, a);
        };
        // The markers just outside the selection.
        const outside = () => has(starsBefore(text, s), starsAfter(text, e));
        return toggleLines(text, s, e, mark, isWrapped, outside);
    }

    // What starts a line and must stay outside any inline marks: a list
    // item's marker, a tip's "> ", a heading's "## " or "### ".
    const LEAD = /^\s*(?:[-*]\s+|\d+[.)]\s+|>\s?|#{2,3}\s+)?/;

    /* Underline and strikethrough: a two-character mark on each side, and
       unlike the stars no mark is ever part of another, so the test is only
       "is it there". Same toggling and line-by-line wrapping as toggleMark. */
    function toggleWrap(text, start, end, mark, placeholder) {
        const size = mark.length;
        const [s, e] = trimSel(text, start, end);
        if (s === e) {
            const at = end;
            return { text: text.slice(0, at) + mark + placeholder + mark + text.slice(at),
                start: at + size, end: at + size + placeholder.length };
        }
        const isWrapped = core => core.length > 2 * size && core.startsWith(mark) && core.endsWith(mark);
        const outside = () => s >= size && text.slice(s - size, s) === mark && text.slice(e, e + size) === mark;
        return toggleLines(text, s, e, mark, isWrapped, outside);
    }

    // The whole lines the selection touches, as [lineStart, lineEnd].
    function lineSpan(text, start, end) {
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        const endAt = end > start && text[end - 1] === "\n" ? end - 1 : end;
        let lineEnd = text.indexOf("\n", endAt);
        if (lineEnd === -1) lineEnd = text.length;
        return [lineStart, lineEnd];
    }

    /* A heading, a subheading or a tip: a marker at the start of each line
       the selection touches. Pressed again on lines that already carry it,
       it comes off; a heading pressed on a subheading (or the other way
       round) swaps one for the other. With nothing on the line yet, the
       placeholder goes in, selected, to type over. */
    function togglePrefix(text, start, end, prefix, placeholder) {
        const [a, b] = lineSpan(text, start, end);
        const lines = text.slice(a, b).split("\n");
        const filled = lines.filter(l => l.trim());
        const own = prefix.startsWith("#") ? new RegExp(`^\\s*${prefix.trim()}\\s+`) : /^\s*>\s?/;
        const any = prefix.startsWith("#") ? /^\s*#{2,3}\s+/ : /^\s*>\s?/;
        const has = filled.length > 0 && filled.every(l => own.test(l) && !(prefix === "## " && /^\s*###/.test(l)));
        let out;
        if (!filled.length) {
            out = prefix + placeholder;
            const next = text.slice(0, a) + out + text.slice(b);
            return { text: next, start: a + prefix.length, end: a + out.length };
        }
        out = lines.map(l => {
            if (!l.trim()) return l;
            const bare = l.replace(any, "");
            return has ? bare : prefix + bare.trimStart();
        }).join("\n");
        return { text: text.slice(0, a) + out + text.slice(b), start: a, end: a + out.length };
    }

    // A divider on a line of its own, after the line the caret is on.
    function insertDivider(text, start, end) {
        const [, b] = lineSpan(text, start, end);
        const before = text.slice(0, b), after = text.slice(b);
        const ins = (before.trim() ? "\n" : "") + "---" + (after.startsWith("\n") ? "" : "\n");
        const at = b + ins.length;
        return { text: before + ins + after, start: at, end: at };
    }

    /* Clear formatting: the marks taken off the selection, or off the
       caret's whole line when nothing is selected, leaving the words. */
    function clearFormat(text, start, end) {
        let [a, b] = start === end ? lineSpan(text, start, end) : [start, end];
        const sel = text.slice(a, b);
        const out = sel.split("\n").map(l => replaceLinks(l, (m, words) => words)
            .replace(/^\s*-{3,}\s*$/, "")
            .replace(/^(\s*)(?:[-*]\s+|\d+[.)]\s+|>\s?|#{2,3}\s+)/, "$1")
            .replace(UNDER, "$1$2").replace(STRIKE, "$1$2")
            .replace(BOLD, "$1").replace(ITALIC, "$1$2").replace(BOLD, "$1")
            .replace(/\*\*|__|~~/g, "")).join("\n");
        return { text: text.slice(0, a) + out + text.slice(b), start: a, end: a + out.length };
    }

    function toggleLink(text, start, end) {
        const [s, e] = trimSel(text, start, end);
        const sel = text.slice(s, e);
        const existing = /^\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)$/.exec(sel);
        if (existing) {
            return { text: text.slice(0, s) + existing[1] + text.slice(e), start: s, end: s + existing[1].length };
        }
        const words = "link text";
        if (!sel) {
            const ins = `[${words}](https://)`;
            return { text: text.slice(0, end) + ins + text.slice(end), start: end + 1, end: end + 1 + words.length };
        }
        // An address selected: it becomes the link, and its words are the
        // part left to type.
        if (/^(?:https:\/\/\S+|(?:maze|event|guide):[a-z0-9][a-z0-9-]*|console:[a-z]+)$/.test(sel)) {
            const ins = `[${words}](${sel})`;
            return { text: text.slice(0, s) + ins + text.slice(e), start: s + 1, end: s + 1 + words.length };
        }
        // Words selected: they become the link's words (on one line, and
        // without square brackets, which would end them early), and the
        // address is selected so a paste replaces it.
        const clean = sel.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim() || words;
        const ins = `[${clean}](https://)`;
        const at = s + clean.length + 3;
        return { text: text.slice(0, s) + ins + text.slice(e), start: at, end: at + "https://".length };
    }

    function toggleList(text, start, end, numbered) {
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        // A selection that ends just after a line break ends on the line
        // before it, as it looks on screen.
        const endAt = end > start && text[end - 1] === "\n" ? end - 1 : end;
        let lineEnd = text.indexOf("\n", endAt);
        if (lineEnd === -1) lineEnd = text.length;
        const lines = text.slice(lineStart, lineEnd).split("\n");
        const marker = numbered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
        const filled = lines.filter(l => l.trim());
        const isList = filled.length > 0 && filled.every(l => marker.test(l));
        let before = text.slice(0, lineStart), after = text.slice(lineEnd);
        let out;
        if (isList) {
            out = lines.map(l => l.replace(marker, "")).join("\n");
        } else {
            // A list in this format is a block of its own, every line an
            // item, so blank lines inside the selection go and a blank line
            // is put between the list and any text right beside it.
            let n = 0;
            out = filled.length
                ? filled.map(l => (numbered ? `${++n}. ` : "- ") + l.replace(/^\s*(?:[-*]\s+|\d+[.)]\s+)/, "").trim()).join("\n")
                : (numbered ? "1. " : "- ");
            if (before.trim() && !/\n[ \t]*\n$/.test(before)) before += "\n";
            if (after.trim() && !/^\n[ \t]*\n/.test(after)) after = "\n" + after;
        }
        const at = before.length;
        const next = before + out + after;
        return filled.length || isList
            ? { text: next, start: at, end: at + out.length }
            : { text: next, start: at + out.length, end: at + out.length };
    }

    function format(text, start, end, kind) {
        const t = String(text == null ? "" : text);
        let s = Math.max(0, Math.min(t.length, start | 0)), e = Math.max(0, Math.min(t.length, end | 0));
        if (e < s) [s, e] = [e, s];
        if (kind === "bold") return toggleMark(t, s, e, "**", "bold text");
        if (kind === "italic") return toggleMark(t, s, e, "*", "italic text");
        if (kind === "link") return toggleLink(t, s, e);
        if (kind === "underline") return toggleWrap(t, s, e, "__", "underlined text");
        if (kind === "strike") return toggleWrap(t, s, e, "~~", "crossed-out text");
        if (kind === "heading") return togglePrefix(t, s, e, "## ", "Heading");
        if (kind === "subheading") return togglePrefix(t, s, e, "### ", "Subheading");
        if (kind === "quote") return togglePrefix(t, s, e, "> ", "Tip");
        if (kind === "divider") return insertDivider(t, s, e);
        if (kind === "clear") return clearFormat(t, s, e);
        if (kind === "bullets") return toggleList(t, s, e, false);
        if (kind === "numbers") return toggleList(t, s, e, true);
        return { text: t, start: s, end: e };
    }

    /* A guide's thumbnail: the one uploaded for it, or else the first
       picture in any of its sections, or else none at all. One rule, used
       by the card on the Guides list, the top of the guide, What's New and
       the /warren preview, so they can never show different pictures. */
    function thumbOf(guide) {
        if (!guide) return "";
        if (guide.thumb) return guide.thumb;
        const withPic = (guide.sections || []).find(s => s && s.image);
        return withPic ? withPic.image : "";
    }

    /* A guide thumbnail at the size a card or a What's New entry draws it
       (30 Sept 2026). Drawn from the original, every card downloaded the
       whole upload — 450KB for a 600px picture shown at 150px. This asks
       the image service for a smaller copy instead, but only ever a
       WHOLE-NUMBER scale-down, so pixel art shrinks by an exact 2x or 4x
       and stays crisp, and as a PNG (fm=png) so it is never recompressed
       into a blurred WebP or JPEG. cssPx is the widest the picture is ever
       drawn; the device pixel ratio is rounded up to 1, 2 or 4 so a 150px
       card asks for 150, 300 or 600, all clean divisors of the usual 600px
       upload. When the original's width is known (originalPx), the width
       asked for is the nearest exact divisor of it at or above that size.
       The reader's own full picture is not sent through here. */
    function thumbSrc(src, cssPx, originalPx) {
        if (!src) return "";
        const ratio = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
        const want = Math.ceil(cssPx * (ratio <= 1 ? 1 : ratio <= 2 ? 2 : 4));
        let w = want;
        if (originalPx > 0) {
            if (want >= originalPx) return src;
            let k = Math.floor(originalPx / want);
            while (k > 1 && originalPx % k) k--;
            if (k <= 1) return src;
            w = originalPx / k;
        }
        const q = new URLSearchParams({ url: src, w: String(w), fm: "png" });
        return `/.netlify/images?${q.toString()}`;
    }

    /* Whether a guide was edited on a later day than it was published —
       "Updated" rather than "Added" (30 Sept 2026). The day is the
       READER'S, which is how What's New groups its log (localDayKey in
       js/home.js, the same rule): the Guides window compared UTC days, so
       an edit late one evening could be "Updated" in the window and
       "Added" in the log, or the other way round. One rule, used by both. */
    function localDay(value) {
        const s = String(value || "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d = new Date(s);
        if (isNaN(d)) return s.slice(0, 10);
        const pad = x => String(x).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    function wasUpdated(guide) {
        if (!guide || !guide.publishedAt || !guide.updatedAt) return false;
        return localDay(guide.updatedAt) > localDay(guide.publishedAt);
    }

    const GuideText = { render, plain, format, esc, thumbOf, thumbSrc, wasUpdated };
    if (typeof module !== "undefined" && module.exports) module.exports = GuideText;
    else root.GuideText = GuideText;
})(typeof window !== "undefined" ? window : this);

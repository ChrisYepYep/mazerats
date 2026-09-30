/* ===========================================================
   Maze Rats — the little text format guides are written in

   A guide section's text is typed into a plain textarea in /warren, so it
   needs a format that is quick to write and impossible to get wrong in a
   way that breaks the page. This is deliberately small:

     A blank line          starts a new paragraph
     **bold**  *italic*    emphasis
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

    // Bold and italics, on text that has already been escaped. Every
    // replacement writes an opening tag and its closing tag together, so
    // what comes out is always balanced.
    function emphasis(escaped) {
        return escaped
            .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    }

    /* One link, from its finished words (HTML) and its address as typed.
       The address is checked, not escaped-and-hoped: only the four shapes
       above ever produce a link, and what goes into the href is escaped
       after the check. */
    function link(words, address) {
        const a = String(address || "").trim();
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
        const parked = String(raw == null ? "" : raw).replace(/\u0000/g, "")
            .replace(LINK, (m, words, addr) => {
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
    function render(text) {
        const blocks = String(text || "").replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/);
        return blocks.map(block => {
            const lines = block.split("\n").map(l => l.trimEnd());
            if (!lines.join("").trim()) return "";
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
        }).join("");
    }

    // The text with the format taken off, for a card's summary or a search.
    function plain(text) {
        return String(text || "")
            .replace(LINK, "$1")
            .replace(/\*\*([^*\n]+)\*\*/g, "$1")
            .replace(/\*([^*\n]+)\*/g, "$1")
            .replace(/^\s*(?:[-*]|\d+[.)]|>)\s?/gm, "")
            .replace(/\s+/g, " ")
            .trim();
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

    const GuideText = { render, plain, esc, thumbOf, wasUpdated };
    if (typeof module !== "undefined" && module.exports) module.exports = GuideText;
    else root.GuideText = GuideText;
})(typeof window !== "undefined" ? window : this);

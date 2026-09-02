/* /.netlify/functions/article — reads a Habbo Origins article and hands back
   the parts of it this site shows.

   Why it exists: an event's write-up usually already exists, on Habbo's own
   site, and linking out to it means the visitor leaves. This fetches the
   article once, when an admin asks for it, and the result is stored on the
   event like any other field — so the site serves it from its own database
   afterwards, does not depend on Habbo being reachable, and fetches nothing
   per visitor.

   Admin-only and write-gated: it takes a URL and fetches it, which is the
   shape of an open proxy if left standing in the road. The allowlist below
   is the real guard; the auth check is the fence around it. */
const { isAuthorized, canWrite, UNAUTHORIZED, READ_ONLY } = require("./_auth");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

/* The only shape of URL this will fetch. Host and path both, and the path
   matters most: origins.habbo.com serves an API and a game client under the
   same host, and "any URL on that host" would still be a proxy into
   endpoints this has no business reaching. */
const ARTICLE_URL = /^https:\/\/origins\.habbo\.com\/community\/article\/(\d+)(?:\/[A-Za-z0-9-]*)?\/?$/;

/* Habbo's article pages are an Angular shell — the HTML a plain fetch gets
   back has no article in it at all. The content comes from a prerender in
   front of the app, which decides what to send by user agent, and it only
   sends the rendered page to a link-preview crawler.

   Which is what this is: it expands one link, once, into a preview the site
   then holds. So it says who it is first and what it is doing second, and
   the "like Twitterbot" is the part the prerender matches on — the same
   convention as "like Gecko", and there for the same reason. */
const UA = "Mozilla/5.0 (compatible; MazeRatsBot/1.0; +https://mazerats.net; link-preview like Twitterbot)";

const FETCH_TIMEOUT_MS = 12000;

/* ---------- pulling the article out of the page ----------

   By pattern rather than by parser: there is no HTML parser in this repo,
   the page is one known shape, and everything below either matches that
   shape or gives up and says so. Nothing here trusts what it finds — see
   sanitiseHtml, which rebuilds the body rather than passing it through. */

function firstMatch(html, re) {
    const m = re.exec(html);
    return m ? m[1] : "";
}

// Tags stripped, whitespace collapsed. For the short fields (title, date,
// category) that are plain text on the page anyway.
function plain(html) {
    return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'", apos: "'", nbsp: " " };

function decodeEntities(text) {
    return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
        const key = name.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(ENTITIES, key)) return ENTITIES[key];
        if (key[0] === "#") {
            const code = key[1] === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
        }
        return whole;
    });
}

const escapeHtml = str => String(str).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

/* Absolute, and http(s) only. A relative path on the article resolves
   against Habbo; anything carrying a scheme this does not know —
   javascript:, data:, vbscript: — is dropped rather than corrected. */
function safeUrl(raw, base) {
    if (!raw) return "";
    let resolved;
    try {
        resolved = new URL(decodeEntities(raw).trim(), base);
    } catch (e) {
        return "";
    }
    return (resolved.protocol === "http:" || resolved.protocol === "https:") ? resolved.href : "";
}

/* What an article body is allowed to be, once it is in our page.

   The list is short on purpose. It is what Habbo's own articles actually
   use — headings, paragraphs, emphasis, lists, links, images — and nothing
   else, because everything else is either a styling hazard in a 500px
   modal or a security one. */
const ALLOWED = {
    p: [], h3: [], h4: [], h5: [], h6: [],
    strong: [], b: [], em: [], i: [], u: [], s: [],
    br: [], hr: [], ul: [], ol: [], li: [], blockquote: [],
    a: ["href"],
    img: ["src", "alt", "width", "height"]
};
const VOID_TAGS = new Set(["br", "hr", "img"]);
// Dropped along with everything inside them, rather than unwrapped.
const DROP_WHOLE = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "noscript", "template", "head"]);

/* Rebuilds the body from scratch against ALLOWED.

   Rebuilding is the point, and it is what makes a regex safe to reach for
   here. Nothing from the source is echoed into the output as markup: tags
   are re-emitted from their names, attributes only if they are on the list
   and only after their values have been through safeUrl or escapeHtml, and
   text is escaped. An attribute this does not recognise cannot survive, so
   there is nothing for a crafted one to survive as. */
function sanitiseHtml(html, base) {
    const out = [];
    const open = [];          // tags emitted and still owed a close
    let dropDepth = 0;        // inside a DROP_WHOLE element
    let dropTag = "";
    let i = 0;

    const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    let m;
    while ((m = TAG.exec(html)) !== null) {
        const text = html.slice(i, m.index);
        i = TAG.lastIndex;
        if (!dropDepth && text) out.push(escapeHtml(decodeEntities(text)));

        const closing = m[0][1] === "/";
        const name = m[1].toLowerCase();
        const attrSrc = m[2] || "";

        if (dropDepth) {
            if (name === dropTag) dropDepth += closing ? -1 : 1;
            continue;
        }
        if (DROP_WHOLE.has(name)) {
            if (!closing && !m[0].endsWith("/>")) { dropDepth = 1; dropTag = name; }
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(ALLOWED, name)) continue;   // unwrap

        if (closing) {
            // Only close what was actually opened, and only in order.
            const at = open.lastIndexOf(name);
            if (at === -1) continue;
            while (open.length > at) out.push("</" + open.pop() + ">");
            continue;
        }

        const attrs = [];
        const ATTR = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
        let a;
        while ((a = ATTR.exec(attrSrc)) !== null) {
            const key = a[1].toLowerCase();
            if (!ALLOWED[name].includes(key)) continue;
            const value = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4];
            if (key === "href" || key === "src") {
                const url = safeUrl(value, base);
                if (url) attrs.push(key + "=\"" + escapeHtml(url) + "\"");
            } else if (key === "width" || key === "height") {
                const n = parseInt(value, 10);
                if (Number.isFinite(n) && n > 0 && n <= 4000) attrs.push(key + "=\"" + n + "\"");
            } else {
                attrs.push(key + "=\"" + escapeHtml(decodeEntities(value)) + "\"");
            }
        }
        // Every link in here leaves the site, so every link says so.
        if (name === "a") {
            if (!attrs.some(x => x.startsWith("href="))) continue;   // an anchor to nowhere is just text
            attrs.push("target=\"_blank\"", "rel=\"noopener noreferrer\"");
        }
        // And an image whose source did not survive safeUrl is not an image.
        // Left in, it renders as a broken-picture icon in the middle of the
        // article — worse than the nothing it actually is.
        if (name === "img" && !attrs.some(x => x.startsWith("src="))) continue;

        const tag = "<" + name + (attrs.length ? " " + attrs.join(" ") : "") + ">";
        out.push(tag);
        if (!VOID_TAGS.has(name)) open.push(name);
    }
    const tail = html.slice(i);
    if (!dropDepth && tail) out.push(escapeHtml(decodeEntities(tail)));
    while (open.length) out.push("</" + open.pop() + ">");

    return out.join("")
        // Empty paragraphs are how the source spaces itself out; they are
        // noise once this is set in our own type.
        .replace(/<p>\s*(?:<br>\s*)*<\/p>/g, "")
        .replace(/(?:<br>\s*){3,}/g, "<br><br>")
        .trim();
}

/* What is inside the <div> that `opener` matches, up to ITS closing tag and
   no further.

   Counting the nesting rather than reading to the end of the <article>,
   because the article element holds more than the article: Habbo's own
   "Related news" and "Latest news" lists sit in a .news-footer after the
   body, and a capture that ran to the end swept both of them in — the piece
   ended with a menu of five other articles set in our own type. */
function innerHtmlOfDiv(html, opener) {
    const start = opener.exec(html);
    if (!start) return "";
    const from = start.index + start[0].length;
    const DIV = /<(\/?)div\b[^>]*>/gi;
    DIV.lastIndex = from;
    let depth = 1;
    let m;
    while ((m = DIV.exec(html)) !== null) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) return html.slice(from, m.index);
    }
    // Unbalanced. Everything that is left is still the body's best guess.
    return html.slice(from);
}

function extract(html, base) {
    const article = firstMatch(html, /<article[^>]*>([\s\S]*?)<\/article>/i);
    if (!article) return null;

    const bodyHtml = innerHtmlOfDiv(article, /<div[^>]+class="[^"]*\bnews-article\b[^"]*"[^>]*>/i);

    /* The banner. Found by picking out the <img> whose attributes mention
       news-header__image and then reading its src, rather than matching the
       two in one pattern — the source writes them in either order, and a
       regex that assumes one is a regex that quietly returns nothing on the
       day it meets the other. */
    const heroTag = (article.match(/<img\b[^>]*>/gi) || [])
        .find(tag => /\bnews-header__image\b/.test(tag)) || "";
    const heroSrc = firstMatch(heroTag, /\ssrc="([^"]+)"/i);

    return {
        title: decodeEntities(plain(firstMatch(article, /<h1[^>]+class="[^"]*\bnews-header__title\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i))),
        date: plain(firstMatch(article, /<time[^>]*>([\s\S]*?)<\/time>/i)),
        category: decodeEntities(plain(firstMatch(article, /<a[^>]+class="[^"]*\bnews-header__category__link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i))),
        summary: decodeEntities(plain(firstMatch(article, /<p[^>]+class="[^"]*\bnews-header__summary\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i))),
        image: safeUrl(heroSrc, base),
        body: sanitiseHtml(bodyHtml, base)
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!isAuthorized(event)) return UNAUTHORIZED;
    if (!(await canWrite(event))) return READ_ONLY;

    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }

    const url = String(body.url || "").trim();
    if (!ARTICLE_URL.test(url)) {
        return json(400, { error: "That is not a Habbo Origins article link. It should look like https://origins.habbo.com/community/article/1234/its-title" });
    }

    let html;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, {
            headers: { "user-agent": UA, "accept": "text/html" },
            signal: controller.signal,
            redirect: "follow"
        });
        clearTimeout(timer);
        if (!res.ok) return json(502, { error: "Habbo answered " + res.status + " for that article." });
        html = await res.text();
    } catch (e) {
        return json(502, {
            error: e.name === "AbortError"
                ? "Habbo took too long to answer."
                : "Could not reach Habbo to read that article."
        });
    }

    const parsed = extract(html, url);
    /* No <article> means the shell came back rather than the rendered page,
       which is what a changed prerender would look like. Worth saying
       plainly: it is the one failure here that needs a person rather than a
       retry. */
    if (!parsed || !parsed.title) {
        return json(502, { error: "That page came back without an article in it. Habbo may have changed how these pages are served." });
    }

    return json(200, Object.assign({}, parsed, { url, fetchedAt: new Date().toISOString() }));
};

/* Exported so both halves can be run over a saved page rather than over the
   network, which is how the sanitiser was checked against the things it is
   there to stop — script and style blocks, event handlers, javascript: and
   data: URLs, broken-out attribute quotes, mis-nested tags:

     node -e "const {sanitiseHtml} = require('./netlify/functions/article');
              console.log(sanitiseHtml('<p onclick=alert(1)>hi</p>', 'https://origins.habbo.com/'))"
*/
module.exports.extract = extract;
module.exports.sanitiseHtml = sanitiseHtml;

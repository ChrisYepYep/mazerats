/* /.netlify/functions/share — the archive page, at a maze's, event's or
   guide's own address.

   Reached as /maze/<slug>, /event/<slug> or /guides/<slug> (see the
   rewrites in netlify.toml, which are 200s rather than redirects so the page
   is served at the address that was pasted). And, since 1 Oct 2026, as
   /guess, /odd and /guides, the windows' own addresses — see FIXED_PAGES.

   ONE ADDRESS FOR PEOPLE AND FOR PREVIEWS. This used to answer with a small
   stand-in page carrying the record's preview tags and a redirect on to
   /home#maze-<id>, so the address a visitor ended up looking at was never
   the one they had been sent. Now it answers with home.html itself, with
   that record's title, description, picture and canonical written into its
   <head>. A chat client's preview crawler reads the tags and stops; a
   browser runs the page, which reads the address and opens the window (see
   "addresses" in js/home.js and js/guides.js). The page carries
   <base href="/"> so it works at any depth.

   The address is the record's SLUG, which follows its name (_slugs.js). An
   older address — its id, or a slug from before a rename — answers with a
   301 to the current one, so a link shared before either change keeps
   working and search engines move their entry across.

   The image is asked for at 1200x630 through Netlify's image CDN: that is
   the size every chat client and social preview crops to, and asking for it
   here means the 3MB original is never what gets sent to a preview bot. */
const fs = require("fs");
const path = require("path");
const { getDb } = require("./_db");
// Who may read past the address book with ?fresh (3 Oct 2026; see FRESH_ADDRESSES_MS).
const { hasAccount } = require("./_auth");
const { resolveSlug, isRetired, loadRetired, PROJECTION: SLUG_FIELDS } = require("./_slugs");

/* How long a page may be reused. Chat clients cache aggressively on their
   own; this mostly keeps a link pasted twenty times in one channel from
   hitting the database twenty times. The browser revalidates every time, as
   it does for home.html served as a file. */
const CACHE = "public, max-age=0, must-revalidate, s-maxage=600, stale-while-revalidate=86400";
/* And the same life in the DURABLE cache (1 Oct 2026), which is opt-in and
   was never asked for: production answered a record's page with
   `"Netlify Durable"; fwd=bypass`, so every edge node that had not seen the
   page ran this function and read the whole collection for itself — the
   same trap CDN_CACHE in _cache.js describes for /rooms. A link pasted into
   a busy channel on launch day is exactly that crowd. Only on a real
   record's page; the not-found and fresh answers keep their own. Netlify
   reads this in place of Cache-Control at the edge and never passes it on,
   so the browser still revalidates every time. */
const CDN_CACHE = "public, durable, s-maxage=600, stale-while-revalidate=86400";

const PATH_KINDS = { maze: "maze", event: "event", guides: "guide" };
const PREFIX = { maze: "maze", event: "event", guide: "guides" };

/* Which record was asked for, read off the request path.

   netlify.toml rewrites /maze/:id to this function, and in production the
   deployed rewrite hands it the ORIGINAL request's query string — which for
   a pasted /maze/<slug> link is empty. The path is the one thing that
   survives a rewrite intact, so it is what the slug is taken from. (Reading
   a ?maze= query once left every shared link on the not-found page.)

   The query string is read only when the path names nothing, so a direct
   call to the function (/.netlify/functions/share?maze=x) still works as a
   way to test it. It used to be read FIRST, which let
   /maze/hallway?maze=<another> serve another maze's title, picture and
   canonical at Hallway's address — and cache that at the edge for whoever
   pasted the link next. */
function requestedSlug(event) {
    const fromPath = slugFromPath(event);
    if (fromPath !== undefined) return fromPath;
    const params = event.queryStringParameters || {};
    if (params.maze) return { slug: params.maze, kind: "maze" };
    if (params.event) return { slug: params.event, kind: "event" };
    if (params.guide) return { slug: params.guide, kind: "guide" };
    return null;
}

// { slug, kind } for a record address, null for one that cannot be decoded,
// undefined for a path that is not a record address at all.
function slugFromPath(event) {
    // event.rawUrl is the address as it was requested; event.path is the
    // same path on its own. Either can be absent depending on how the
    // function is invoked, so both are tried before giving up.
    let pathname = event.path || "";
    if (event.rawUrl) {
        try { pathname = new URL(event.rawUrl).pathname; } catch (e) { /* keep event.path */ }
    }
    // A window's own address (1 Oct 2026): see FIXED_PAGES below.
    const page = /^\/(guess|odd|guides|profiles?|purapanic)\/?$/.exec(pathname);
    // /profiles is /profile by another name (4 Oct 2026).
    if (page) return { page: page[1] === "profiles" ? "profile" : page[1] };
    const m = /^\/(maze|event|guides)\/([^/]+)\/?$/.exec(pathname);
    if (!m) return undefined;
    /* A stray % in a pasted link ("/maze/100%-maze") makes decodeURIComponent
       throw, and uncaught that was a bare 502 from the function. A link that
       cannot be decoded names nothing in the archive, so it gets the same
       not-found page as any other unknown address. */
    try {
        return { slug: decodeURIComponent(m[2]), kind: PATH_KINDS[m[1]] };
    } catch (e) {
        return null;
    }
}

// The request's query string for a redirect, without maze/event/guide.
function carriedQuery(event) {
    const params = new URLSearchParams();
    const q = event.queryStringParameters || {};
    Object.keys(q).forEach(k => {
        if (k !== "maze" && k !== "event" && k !== "guide" && q[k] != null) params.append(k, q[k]);
    });
    const s = params.toString();
    return s ? "?" + s : "";
}

function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

/* Where this site is, for the absolute addresses a preview needs (an
   og:image has to be absolute — a relative one is simply dropped by every
   client that reads it).

   From the deploy's own configuration, NOT from the request. Host and
   x-forwarded-host are whatever the caller sends: a request crafted with a
   different host would get a page whose canonical, og:url and og:image all
   pointed at a site of the attacker's choosing — and this page is cached at
   the edge, so the poisoned copy would go out to whoever pasted the link
   next. The literal is for the one place URL is not set, a local run. */
const SITE_FALLBACK = "https://mazerats.net";
function originOf() {
    return String(process.env.URL || SITE_FALLBACK).replace(/\/+$/, "");
}

/* ---------- the page itself ----------

   home.html as deployed, read once per warm function. netlify.toml lists it
   under included_files, which bundles it beside the function; where exactly
   depends on the bundler, so the likely places are all tried. Failing all of
   them, the deploy's own copy is fetched over HTTP — DEPLOY_URL rather than
   URL, so a deploy preview serves its own page and not production's. */
let pageCache = null;
async function archivePage() {
    // Under `netlify dev` the file is the working copy, being edited: read
    // it fresh each time rather than serving whatever it said at start-up.
    if (pageCache && !process.env.NETLIFY_DEV) return pageCache;
    const places = [
        path.resolve(__dirname, "..", "..", "home.html"),
        path.resolve(process.cwd(), "home.html"),
        process.env.LAMBDA_TASK_ROOT ? path.resolve(process.env.LAMBDA_TASK_ROOT, "home.html") : ""
    ].filter(Boolean);
    for (const p of places) {
        try {
            pageCache = fs.readFileSync(p, "utf8");
            return pageCache;
        } catch (e) { /* the next place */ }
    }
    const site = String(process.env.DEPLOY_URL || originOf()).replace(/\/+$/, "");
    const res = await fetch(`${site}/home`, { headers: { "User-Agent": "mazerats-share" } });
    if (!res.ok) throw new Error(`share: home.html fetch answered ${res.status}`);
    pageCache = await res.text();
    return pageCache;
}

/* The page's head, rewritten to be about one record.

   The archive's own tags are removed and a set about the record goes in
   their place, right after <base>. The title, canonical and og:url keep the
   archive's values in data-archive: the page puts those back when the
   window is closed (PageMeta in js/site.js), since after that the page IS
   the archive again. */
const ARCHIVE_TAGS = [
    /<title>[\s\S]*?<\/title>\s*/i,
    /<meta\s+name="description"[^>]*>\s*/gi,
    /<link\s+rel="canonical"[^>]*>\s*/gi,
    /<meta\s+property="og:[^"]*"[^>]*>\s*/gi,
    /<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi
];

function tagOf(html, re) {
    const m = re.exec(html);
    return m ? m[1] : "";
}

function withTags(html, t) {
    const archive = {
        title: tagOf(html, /<title>([\s\S]*?)<\/title>/i),
        canonical: tagOf(html, /<link\s+rel="canonical"\s+href="([^"]*)"/i),
        ogUrl: tagOf(html, /<meta\s+property="og:url"\s+content="([^"]*)"/i)
    };
    // Already escaped as page text; only a quote could break the attribute.
    Object.keys(archive).forEach(k => { archive[k] = archive[k].replace(/"/g, "&quot;"); });
    let out = html;
    ARCHIVE_TAGS.forEach(re => { out = out.replace(re, ""); });
    const e = escapeHtml;
    const block = [
        `<title data-archive="${archive.title}">${e(t.title)} — Maze Rats</title>`,
        `<meta name="description" content="${e(t.description)}">`,
        `<link rel="canonical" href="${e(t.canonical)}" data-archive="${archive.canonical}">`,
        `<meta property="og:site_name" content="Maze Rats">`,
        `<meta property="og:type" content="${t.type === "website" ? "website" : "article"}">`,
        `<meta property="og:title" content="${e(t.title)}">`,
        `<meta property="og:description" content="${e(t.description)}">`,
        `<meta property="og:image" content="${e(t.image)}">`,
        ...(t.sized ? [`<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`] : []),
        `<meta property="og:url" content="${e(t.canonical)}" data-archive="${archive.ogUrl}">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${e(t.title)}">`,
        `<meta name="twitter:description" content="${e(t.description)}">`,
        `<meta name="twitter:image" content="${e(t.image)}">`,
        /* Which record this page is about, by id. The page opens the window
           from the address, matching it against the archive it loads — but
           that list is edge-cached for a minute and the offline copy has no
           addresses at all, so a maze renamed a moment ago (or any maze, on
           the offline copy) could not be found by its new address and the
           visitor was left on the plain archive. The id never changes, so
           the page falls back to it (see openFromAddress in js/home.js). */
        ...(t.record ? [`<meta name="mazerats:record" content="${e(t.record)}">`] : [])
    ].map(line => "    " + line).join("\n");
    const at = /<base\s[^>]*>/i.exec(out) || /<head[^>]*>/i.exec(out);
    if (!at) return out;
    const cut = at.index + at[0].length;
    return out.slice(0, cut) + "\n" + block + out.slice(cut);
}

/* home.html is served as a file with the headers netlify.toml gives every
   path, but custom headers are not applied to a function's response — so
   this carries them itself. The policy is the site's own, word for word:
   the page is the same page and needs exactly what it always has.
   tools/check-share-headers.js fails the build if the two drift apart. */
const PAGE_HEADERS = {
    "Content-Type": "text/html; charset=utf-8",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cloud.umami.is; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://www.habbo.com https://images.habbo.com https://origins.habbo.com https://api.furniindex.com https://cdn.discordapp.com; connect-src 'self' https://cloud.umami.is https://gateway.umami.is; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
};

/* ---------- what a record's preview says ---------- */

/* The preview image, at the size previews are cropped to.

   Stored thumbs come in two shapes — an uploaded key routed through the
   image function, and a plain path under /assets for the seeded rooms — and
   both go through the image CDN the same way the site's own thumbnails do
   (see imgCdn in js/site.js). fit=cover because 1200x630 is a fixed frame:
   a letterboxed room screenshot with bars down the sides reads as a broken
   image in a chat client. */
function previewImage(origin, thumb) {
    if (!thumb) return `${origin}/assets/img/og-thumbnail.png`;
    /* fm=jpg: without it the CDN answers a client that does not ask for
       WebP — which is most preview bots — with a PNG, and a room screenshot
       at 1200x630 came back at 1.8MB. Chat apps drop preview images much
       over half a megabyte, so shared links unfurled with no picture. As a
       JPEG the same image is about 245KB. */
    const params = new URLSearchParams({ url: thumb, w: "1200", h: "630", fit: "cover", fm: "jpg", q: "80" });
    return `${origin}/.netlify/images?${params.toString()}`;
}

/* A guide's preview image: its own thumbnail at its own shape.

   Not the 1200x630 crop a room gets. A guide's thumbnail is drawn for the
   guide, often square, and cover-cropping a square to 1200x630 cuts away
   most of it. So it is only capped in width, and the preview shows it
   whole; with no size stated, clients read the shape off the image.

   The address is built from the thumbnail's own address, and an uploaded
   picture's key carries the moment it was uploaded. So a new thumbnail is a
   new image address, and nothing that cached the old picture can stand in
   for the new one. */
function guideImage(origin, thumb) {
    if (!thumb) return `${origin}/assets/img/og-thumbnail.png`;
    // As a JPEG, for the same reason as previewImage above.
    const params = new URLSearchParams({ url: thumb, w: "1200", fm: "jpg", q: "85" });
    return `${origin}/.netlify/images?${params.toString()}`;
}

/* A stored field as text, or "" for anything that is not text.

   The fields below come from the database as whatever was stored, and the
   API that stores them checks their shape only loosely. `.trim()` on a
   description that was a number or an object threw, and a throw here is
   not the "not found" page: it is Netlify's bare 502, at a record's own
   address, cached by nobody but seen by everyone who clicks the link. A
   number is kept (it is somebody's text that happened to parse); an object
   or a list says nothing a preview could show. */
function textOf(v) {
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return "";
}

/* A name as a link preview shows it (2 Oct 2026, the owner's): Discord and
   the rest have no Volter to draw the picture characters, so
   "*ÕMaze EmpireÕ*" unfurled as its raw letters. They go, with the stars
   or bars framing them — "Maze Empire". The em dash and curly quote stay:
   titles use them as themselves. Keep in step with plainTitle and
   PICTURE_GLYPHS in js/site.js. */
const TITLE_PICTURES = new RegExp("[" + [
    0x0192, 0x2020, 0x2021, 0x2022, 0x00A5, 0x00AA, 0x00AC, 0x00B1,
    0x00B5, 0x00B6, 0x00BA, 0x00BB, 0x00CC, 0x00CD, 0x00CE, 0x00D5,
    0x00E6, 0x00EC, 0x00ED, 0x00EE, 0x00F5, 0x00F7
].map(c => String.fromCodePoint(c)).join("") + "]", "gu");
function plainTitle(text) {
    const raw = String(text || "");
    const s = raw.replace(TITLE_PICTURES, " ")
        .replace(/[[({]\s*[\])}]/g, " ")      // "[ ª ]" leaves an empty pair
        .replace(/\s{2,}/g, " ")
        .replace(/^[\s*~_|]+/, "")
        .replace(/(?:\s*[*~_|]+)+(?=\s+—|\s*$)/g, "")
        .trim();
    return s || raw;
}

// The same rule the site uses (GuideText.thumbOf in js/guide-text.js): the
// guide's own thumbnail, else its first section picture, else none.
// Sections that are not a list count as none — see textOf.
function guideThumb(guide) {
    if (textOf(guide.thumb)) return textOf(guide.thumb);
    const withPic = (Array.isArray(guide.sections) ? guide.sections : []).find(s => s && textOf(s.image));
    return withPic ? textOf(withPic.image) : "";
}

/* A description with its formatting taken off (30 Sept 2026). They are
   written in the guides' text format now — **bold**, *italic*,
   [words](address), "- " lists — and a link preview is plain text, where
   the stars and brackets would only be noise. The same steps as
   GuideText.plain in js/guide-text.js, kept here rather than required so
   this function carries nothing new into its bundle. */
function plainText(text) {
    const BOLD = /\*\*([^*\n]+)\*\*/g;
    // Headings, dividers, underline and strikethrough too, since the fuller
    // /warren toolbar (30 Sept 2026) — the same order GuideText.plain uses,
    // and like it line by line, with the heading's closing #s taken off by
    // a loop: see plainLine and headingText there for the eight-second
    // patterns this replaced.
    const line = l => {
        if (/^\s*-{3,}\s*$/.test(l)) return "";
        const h = /^\s*(#{2,3})\s+(\S[^\n]*)$/.exec(l);
        if (!h) return l.replace(/^\s*(?:[-*]\s+|\d+[.)]\s+|>\s?)/, "");
        let s = h[2].trimEnd(), j = s.length;
        while (j > 0 && s[j - 1] === "#") j--;
        if (j < s.length && j > 0 && /\s/.test(s[j - 1])) s = s.slice(0, j).trimEnd();
        return s;
    };
    // A link's words for the link: replaceLinks in GuideText, the same scan
    // with the same matches as /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g
    // but trying only the first "[" before each "]" (see there).
    const ADDR = /\(((?:[^()\s]|\([^()\s]*\))+)\)/y;
    const unlink = str => {
        let out = "", from = 0, i = 0;
        for (;;) {
            const p = str.indexOf("[", i);
            if (p < 0) break;
            let q = p + 1;
            while (q < str.length && str[q] !== "]" && str[q] !== "\n") q++;
            if (q >= str.length) break;
            if (str[q] === "]" && q > p + 1) {
                ADDR.lastIndex = q + 1;
                if (ADDR.exec(str)) {
                    out += str.slice(from, p) + str.slice(p + 1, q);
                    from = i = ADDR.lastIndex;
                    continue;
                }
            }
            i = q + 1;
        }
        return out + str.slice(from);
    };
    return unlink(String(text || "").replace(/\r\n?/g, "\n"))
        .split("\n").map(line).join("\n")
        // Only marks that hug their words, with nothing wordy or another
        // mark touching them outside (30 Sept 2026): GuideText's UNDER and
        // STRIKE, so "~~ Welcome ~~" and "a__b__c" keep their marks. The
        // \u0001 stands in for the page's <u> tags until the end, as there.
        .replace(/(^|[^\w_])__([^\s_](?:[^_\n]*[^\s_])?)__(?![\w_])/g, "$1\u0001$2\u0001")
        .replace(/(^|[^\w~])~~([^\s~](?:[^~\n]*[^\s~])?)~~(?![\w~])/g, "$1$2")
        .replace(BOLD, "$1")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
        .replace(BOLD, "$1")
        .replace(/\u0001/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// Long enough to say something, short enough that no client truncates it
// mid-word in a way that changes the meaning.
function clip(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > 200 ? t.slice(0, 197).replace(/\s+\S*$/, "") + "…" : t;
}

// One line of prose about the thing, for the preview's body text. Falls
// back through what a record actually tends to have.
function describe(record, isEvent) {
    // Through textOf: a stored value that is not text threw on .trim() —
    // see textOf above.
    const host = textOf(record.host).trim(), creator = textOf(record.creator).trim();
    const who = isEvent
        ? (host ? `Hosted by ${host}.` : "")
        : (creator ? `Built by ${creator}.` : "");
    const what = plainText(textOf(record.description) || textOf(record.details));
    const tail = isEvent
        ? "An event in the Maze Rats archive of Habbo Origins."
        : "A maze in the Maze Rats archive of Habbo Origins.";
    return clip([who, what || tail].filter(Boolean).join(" "));
}

function tagsFor(kind, record, origin, slug) {
    const canonical = `${origin}/${PREFIX[kind]}/${encodeURIComponent(slug)}`;
    const recordRef = `${kind}:${record.id}`;
    if (kind === "guide") {
        return {
            title: plainTitle(textOf(record.title)) || "Guides",
            // With its format taken off (30 Sept 2026), as the Guides
            // list's cards show it: a summary is written in the same
            // format as a guide's sections, and its stars and [words](...)
            // went into the preview as typed.
            description: clip(plainText(textOf(record.summary))) || "A guide in the Maze Rats archive of Habbo Origins.",
            image: guideImage(origin, guideThumb(record)),
            sized: false,
            canonical,
            record: recordRef
        };
    }
    const isEvent = kind === "event";
    // The same fallback chain the site's own cards use (see normalize in
    // js/home.js): the thumbnail, then the entrance shot, then the first
    // room in the gallery. Each through textOf, so an odd stored value is
    // skipped rather than sent to the image CDN as "[object Object]". A
    // gallery room stored as a bare path string counts too (30 Sept 2026):
    // reading .image off it skipped it.
    const first = Array.isArray(record.gallery) ? record.gallery[0] : null;
    const thumb = textOf(record.thumb)
        || textOf(record.entrance && record.entrance.image)
        || textOf(typeof first === "string" ? first : first && first.image)
        || "";
    return {
        title: plainTitle(textOf(isEvent ? record.title : record.name)) || "Maze Rats",
        description: describe(record, isEvent),
        image: previewImage(origin, thumb),
        sized: true,
        canonical,
        record: recordRef
    };
}

/* THE WINDOWS' OWN ADDRESSES (1 Oct 2026). /guess, /odd and /guides are
   the archive with a window open, and they were served as home.html as it
   stands — the archive's title, description and canonical /home — so a
   daily result or the Guides pasted into Discord unfurled as the homepage,
   and a crawler that runs no script read /guess and /odd (both in the
   sitemap) as duplicates of /home. They come through here now with a fixed
   set of tags each, no database needed. The page's script still sets the
   same title and canonical when the window opens, and PageMeta (js/site.js)
   puts the archive's back from data-archive when it closes, as for a
   record's page. */
const FIXED_PAGES = {
    guess: {
        title: "Guess the Maze",
        description: "A daily game from the Maze Rats archive: five rooms a day, cropped from real Habbo Origins mazes. Name the maze each one came from."
    },
    odd: {
        title: "Odd One Out",
        description: "A daily game from the Maze Rats archive: four rooms, three from one Habbo Origins maze and one that wandered in. Spot the odd one out."
    },
    guides: {
        title: "Guides",
        description: "Guides to Habbo Origins mazes from the Maze Rats archive: the tricks they are built from, and how to get through them."
    },
    /* The Profiles window, with a picture of its own: the Habbo Console,
       with Cabbage of Habbo Origins ES waving from its screen. */
    profile: {
        title: "Profiles",
        description: "Find any Maze Rat: the Habbo Origins mazes they have completed, the badges they have earned and their daily game streaks.",
        image: "og-profiles.png"
    },
    /* Pura Panic (6 Oct 2026), the archive's iso-Tetris of Pura seats. */
    purapanic: {
        title: "Pura Panic",
        // One snappy line (the owner's, 6 Oct 2026); the card's picture carries the tagline.
        description: "Turn them, drop them, clear the floor.",
        image: "og-purapanic.png"
    }
};
function fixedTags(page, origin) {
    const f = FIXED_PAGES[page];
    return {
        title: f.title,
        description: f.description,
        image: `${origin}/assets/img/${f.image || "og-thumbnail.png"}`,
        sized: true,
        canonical: `${origin}/${page}`,
        type: "website"
    };
}

/* ---------- answering ---------- */

/* WHICH QUERY STRINGS MAKE A DIFFERENT PAGE. By default the edge keys its
   cache on the whole address, query string and all, so /maze/x?utm_source=…
   (or any junk a link picked up on its travels) was a fresh copy, fetched
   from the database, for every variation. Only these change the answer:
   `fresh` (/warren's View link, which must never be handed a cached copy —
   see the redirect below; its answers are no-store) and the direct-call test
   parameters read by requestedSlug. Everything else now shares one copy. */
const VARY = { "Netlify-Vary": "query=fresh|maze|event|guide" };

// `extra` is any header this one answer needs on top (the DB-down page's
// noindex, below).
async function pageResponse(statusCode, tags, cache, extra) {
    let html;
    try {
        html = await archivePage();
    } catch (e) {
        // No page to serve at all: the archive at its own address is the
        // best that can be done, and it handles an unknown record itself.
        console.error("share: archive page unavailable", e);
        return { statusCode: 302, headers: { Location: "/home", "Cache-Control": "no-store" }, body: "" };
    }
    return {
        statusCode,
        headers: { ...PAGE_HEADERS, ...VARY, "Cache-Control": cache, ...(extra || {}) },
        body: tags ? withTags(html, tags) : html
    };
}

/* The database lookup, given this long before the page goes out without it.
   A cluster that is slow rather than down (a cold connection, a failover)
   could hold the lookup past the function's own 10-second limit, and then
   the visitor got Netlify's bare timeout page instead of the archive. Well
   inside that, the plain-archive fallback below is the better answer. */
const LOOKUP_MS = 4000;
function withinTime(promise, ms) {
    let timer;
    const late = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`share: lookup took over ${ms}ms`)), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const COLLECTION = { maze: "rooms", event: "events", guide: "guides" };
// A draft guide is not public anywhere else, so it has no page here. Its
// address still counts when the addresses are worked out, as it does in
// the API, or the two could name a guide differently.
const isPublic = (kind, r) => kind !== "guide" || (r && r.status === "published");

/* THE ADDRESS BOOK, KEPT FOR A FEW SECONDS (2 Oct 2026).

   Every address is its own page at the edge, so /maze/<anything made up>
   is a miss every time, and each miss read every maze's address and the
   retired ones — a free whole-collection read per request for anybody
   inventing slugs. Each warm instance now keeps that list for ADDRESSES_MS,
   so a flood of made-up addresses is answered from memory and a real one
   costs one findOne. Never for ?fresh (/warren's View link, which must see
   the save it was clicked after; but see FRESH_ADDRESSES_MS below), and a
   failed read is not kept. A record
   added a moment ago can 404 for those few seconds on an instance that
   read the list just before — the edge's own copy of the archive is a
   minute behind anyway. */
const ADDRESSES_MS = 10 * 1000;
/* ?FRESH WITHOUT AN ACCOUNT (3 Oct 2026). Anybody could add ?fresh, and
   every one was a whole-collection read: past the edge (it is never
   stored) and past the book above. Only a caller with an admin account now
   skips the book outright. The View link cannot be one — it is a plain
   link opened in a new tab, which carries no token — so a ?fresh without
   one still skips the edge, but takes a book read in the last second
   rather than none: one read a second per instance however hard it is
   asked, and a View clicked after a save still finds the saved address.
   The record itself is always read fresh. */
const FRESH_ADDRESSES_MS = 1000;
const addressBook = new Map();
async function addressesOf(db, kind, maxAge) {
    const kept = addressBook.get(kind);
    if (kept && Date.now() - kept.at < maxAge) return kept;
    const [all, retired] = await Promise.all([
        db.collection(COLLECTION[kind]).find({}, { projection: { ...SLUG_FIELDS, status: 1 } }).toArray(),
        loadRetired(db, kind).catch(e => {
            console.error("share: retired addresses unreadable", e);
            return null;
        })
    ]);
    const book = { at: Date.now(), all, retired: retired || [] };
    // Unreadable retired addresses are none for this answer, as before, but
    // are asked for again next time rather than remembered as none.
    if (retired) addressBook.set(kind, book);
    return book;
}

exports.handler = async (event) => {
    const origin = originOf();
    const asked = requestedSlug(event);
    const notFound = {
        title: "Not in the archive",
        description: "That isn't in the Maze Rats archive — it may have been removed.",
        image: `${origin}/assets/img/og-thumbnail.png`,
        sized: true,
        canonical: `${origin}/home`
    };
    // Short-cached: a record that is being added right now should not sit
    // behind a cached not-found for ten minutes.
    /* ?fresh=1 is /warren's View link, asking for the page as just saved.
       It used to be cached like any other answer — under its own key, but
       cached all the same, so a second View within ten minutes showed the
       first save's copy. Never stored now. */
    const fresh = Object.prototype.hasOwnProperty.call(event.queryStringParameters || {}, "fresh");
    const MISS_CACHE = fresh ? "no-store" : "public, max-age=0, must-revalidate, s-maxage=60";
    const HIT_CACHE = fresh ? "no-store" : CACHE;
    if (!asked) return pageResponse(404, notFound, MISS_CACHE);
    if (asked.page) {
        return pageResponse(200, fixedTags(asked.page, origin), HIT_CACHE,
            fresh ? undefined : { "Netlify-CDN-Cache-Control": CDN_CACHE });
    }
    const { slug, kind } = asked;

    let found, record, gone;
    try {
        ({ found, record, gone } = await withinTime((async () => {
            const db = await getDb();
            const coll = db.collection(COLLECTION[kind]);
            /* The deleted records' addresses, read alongside: the addresses
               are worked out around them exactly as the API does, and one
               that names nothing live may be one of them. Unreadable is
               none, as it is for the API (see loadRetired). */
            // See FRESH_ADDRESSES_MS. A lookup that fails is no account.
            const admin = fresh && await hasAccount(event).catch(() => false);
            const { all, retired } = await addressesOf(db, kind, !fresh ? ADDRESSES_MS : admin ? 0 : FRESH_ADDRESSES_MS);
            let hit = resolveSlug(all, kind, slug, retired);
            if (hit && !isPublic(kind, hit.record)) hit = null;
            const doc = hit && hit.current
                ? await coll.findOne({ id: hit.record.id }, { projection: { _id: 0 } })
                : null;
            return { found: hit, record: doc, gone: !hit && isRetired(retired, slug) };
        })(), LOOKUP_MS));
    } catch (e) {
        /* The database being down (or too slow — see withinTime) is not a
           reason to turn the visitor away: the page itself works from its
           own offline copy, and opens the record from the address if it
           can. Served as the plain archive, and not cached, so the tags
           come back as soon as the database does.

           noindex, because to a crawler this is the archive's own page at a
           record's address, with the archive's title and canonical: indexed
           during an outage, it would sit in the results as a duplicate of
           /home under the maze's URL. The next crawl gets the real page. */
        console.error("share: lookup failed", e);
        return pageResponse(200, null, "no-store", { "X-Robots-Tag": "noindex" });
    }
    /* A DELETED RECORD'S ADDRESS: 410 Gone, not 404. It was here and has
       been removed on purpose, which is worth saying to a search engine —
       a 410 drops the entry for good, where a 404 is retried for weeks in
       case it was a mistake. The address stays reserved (_slugs.js), so
       this answer never changes into somebody else's page.

       The plain archive, as the database-down answer serves it: the page
       itself says the record is not there when it cannot open it from the
       address. noindex, because to a crawler it is /home under a dead
       address. */
    if (!found && gone) return pageResponse(410, null, MISS_CACHE, { "X-Robots-Tag": "noindex" });
    if (!found) return pageResponse(404, notFound, MISS_CACHE);

    // An older address — the id, or a slug from before a rename.
    if (!found.current) {
        return {
            statusCode: 301,
            /* NOT cached at the edge. A cached redirect outlives the rename
               it describes: rename A to B and back inside the cache's life
               and the edge still sends /maze/a to /maze/b while /maze/b now
               sends to /maze/a — a redirect loop for everyone until it
               expires. The lookup behind this is one small read.

               The query string goes along (less the function's own test
               parameters): /warren's View link carries ?fresh=1, and a
               redirect that dropped it showed the admin the CDN's stale copy
               of the guide they had just saved. */
            headers: { Location: `/${PREFIX[kind]}/${encodeURIComponent(found.slug)}${carriedQuery(event)}`, "Cache-Control": "no-store" },
            body: ""
        };
    }
    if (!record) return pageResponse(404, notFound, MISS_CACHE);
    return pageResponse(200, tagsFor(kind, record, origin, found.slug), HIT_CACHE,
        fresh ? undefined : { "Netlify-CDN-Cache-Control": CDN_CACHE });
};

// For tools/check-share-headers.js and the local tests.
exports._test = { withTags, PAGE_HEADERS, requestedSlug, tagsFor, fixedTags };

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above. The page it answers with — body, headers and all — comes
   back as the very same object; only a 5xx or a throw is noted on the way. */
exports.handler = require("./_errors").withErrorReporting("share", exports.handler);

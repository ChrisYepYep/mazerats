/* /.netlify/functions/share — the archive page, at a maze's, event's or
   guide's own address.

   Reached as /maze/<slug>, /event/<slug> or /guides/<slug> (see the
   rewrites in netlify.toml, which are 200s rather than redirects so the page
   is served at the address that was pasted).

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
const { resolveSlug, PROJECTION: SLUG_FIELDS } = require("./_slugs");

/* How long a page may be reused. Chat clients cache aggressively on their
   own; this mostly keeps a link pasted twenty times in one channel from
   hitting the database twenty times. The browser revalidates every time, as
   it does for home.html served as a file. */
const CACHE = "public, max-age=0, must-revalidate, s-maxage=600, stale-while-revalidate=86400";

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
        `<meta property="og:type" content="article">`,
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
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cloud.umami.is; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://www.habbo.com https://images.habbo.com https://origins.habbo.com https://furniindex.com https://cdn.discordapp.com; connect-src 'self' https://cloud.umami.is https://gateway.umami.is; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
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

// The same rule the site uses (GuideText.thumbOf in js/guide-text.js): the
// guide's own thumbnail, else its first section picture, else none.
function guideThumb(guide) {
    if (guide.thumb) return guide.thumb;
    const withPic = (guide.sections || []).find(s => s && s.image);
    return withPic ? withPic.image : "";
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
    const who = isEvent
        ? (record.host ? `Hosted by ${record.host}.` : "")
        : (record.creator ? `Built by ${record.creator}.` : "");
    const what = (record.description || record.details || "").trim();
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
            title: record.title || "Guides",
            description: clip(record.summary) || "A guide in the Maze Rats archive of Habbo Origins.",
            image: guideImage(origin, guideThumb(record)),
            sized: false,
            canonical,
            record: recordRef
        };
    }
    const isEvent = kind === "event";
    // The same fallback chain the site's own cards use (see normalize in
    // js/home.js): the thumbnail, then the entrance shot, then the first
    // room in the gallery.
    const thumb = record.thumb
        || (record.entrance && record.entrance.image)
        || (record.gallery && record.gallery[0] && record.gallery[0].image)
        || "";
    return {
        title: (isEvent ? record.title : record.name) || "Maze Rats",
        description: describe(record, isEvent),
        image: previewImage(origin, thumb),
        sized: true,
        canonical,
        record: recordRef
    };
}

/* ---------- answering ---------- */

async function pageResponse(statusCode, tags, cache) {
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
        headers: { ...PAGE_HEADERS, "Cache-Control": cache },
        body: tags ? withTags(html, tags) : html
    };
}

const COLLECTION = { maze: "rooms", event: "events", guide: "guides" };
// A draft guide is not public anywhere else, so it has no page here. Its
// address still counts when the addresses are worked out, as it does in
// the API, or the two could name a guide differently.
const isPublic = (kind, r) => kind !== "guide" || (r && r.status === "published");

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
    const MISS_CACHE = "public, max-age=0, must-revalidate, s-maxage=60";
    if (!asked) return pageResponse(404, notFound, MISS_CACHE);
    const { slug, kind } = asked;

    let found, record;
    try {
        const coll = (await getDb()).collection(COLLECTION[kind]);
        const all = await coll.find({}, { projection: { ...SLUG_FIELDS, status: 1 } }).toArray();
        found = resolveSlug(all, kind, slug);
        if (found && !isPublic(kind, found.record)) found = null;
        if (found && found.current) {
            record = await coll.findOne({ id: found.record.id }, { projection: { _id: 0 } });
        }
    } catch (e) {
        /* The database being down is not a reason to turn the visitor away:
           the page itself works from its own offline copy, and opens the
           record from the address if it can. Served as the plain archive,
           and not cached, so the tags come back as soon as the database
           does. */
        console.error("share: lookup failed", e);
        return pageResponse(200, null, "no-store");
    }
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
    return pageResponse(200, tagsFor(kind, record, origin, found.slug), CACHE);
};

// For tools/check-share-headers.js and the local tests.
exports._test = { withTags, PAGE_HEADERS, requestedSlug };

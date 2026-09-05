/* /.netlify/functions/share — the page a shared link actually points at.

   Reached as /maze/<id> or /event/<id> (see the rewrites in netlify.toml,
   which are 200s rather than redirects so the tags below are served at the
   URL that was pasted).

   The problem it solves: this archive is shared in Discord, and every link
   into it unfurled with the same site-wide thumbnail and the same site-wide
   title, because home.html is one page and its <meta> tags are written once
   at build time. A maze has no URL of its own to hang tags on, and the
   crawler that reads them does not run the JavaScript that would open the
   maze anyway.

   So this hands the crawler a small, complete document about ONE maze —
   its name, its builder, its own screenshot — and hands a real browser
   straight on to the archive with that maze open. Both get what they came
   for, and neither pays for the other.

   The image is asked for at 1200x630 through Netlify's image CDN: that is
   the size every chat client and social preview crops to, and asking for it
   here means the 3MB original is never what gets sent to a preview bot. */
const { getDb } = require("./_db");

// How long a preview may be reused. Chat clients cache aggressively on
// their own; this mostly keeps a link pasted twenty times in one channel
// from hitting the database twenty times.
const CACHE = "public, s-maxage=600, stale-while-revalidate=86400";

/* Which maze or event was asked for, read off the request path.

   netlify.toml rewrites /maze/:id to "…/share?maze=:id", and under
   `netlify dev` that placeholder arrives exactly as written. In production
   it does not: the deployed rewrite hands the function the ORIGINAL
   request's query string — which for a pasted /maze/<id> link is empty —
   so every shared link reached this file with no id at all and was answered
   with the "Not in the archive" page. A link into the archive therefore
   unfurled with the site-wide thumbnail and dropped the visitor on the
   homepage, which is the whole thing the share function exists to stop.
   (Verified against the live site: /.netlify/functions/share?maze=alt-maze
   answered 200 with the maze's own tags, while /maze/alt-maze answered the
   not-found page from the same deploy.)

   The path is the one thing that survives a rewrite intact, so it is what
   the id is taken from now. The query string is still read first, so a
   direct call to the function keeps working — that is the form the local
   dev proxy produces, and it is a useful way to test the function. */
function requestedId(event) {
    const params = event.queryStringParameters || {};
    if (params.maze) return { id: params.maze, isEvent: false };
    if (params.event) return { id: params.event, isEvent: true };

    // event.rawUrl is the address as it was requested; event.path is the
    // same path on its own. Either can be absent depending on how the
    // function is invoked, so both are tried before giving up.
    let pathname = event.path || "";
    if (event.rawUrl) {
        try { pathname = new URL(event.rawUrl).pathname; } catch (e) { /* keep event.path */ }
    }
    const m = /^\/(maze|event)\/([^/]+)\/?$/.exec(pathname);
    if (!m) return null;
    return { id: decodeURIComponent(m[2]), isEvent: m[1] === "event" };
}

function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

/* Where this site is, from the request itself.

   process.env.URL is the deploy's own address and is right in production,
   but it is absent under `netlify dev` and wrong on a branch deploy, and an
   og:image has to be absolute — a relative one is simply dropped by every
   client that reads it. The Host header is what the visitor actually typed,
   which is the address the preview should point back at. */
function originOf(event) {
    const headers = event.headers || {};
    const host = headers["x-forwarded-host"] || headers.host;
    if (!host) return process.env.URL || "";
    const proto = /^localhost|^127\./.test(host) ? "http" : "https";
    return `${proto}://${host}`;
}

/* The preview image, at the size previews are cropped to.

   Stored thumbs come in two shapes — an uploaded key routed through the
   image function, and a plain path under /assets for the seeded rooms — and
   both go through the image CDN the same way the site's own thumbnails do
   (see imgCdn in js/site.js). fit=cover because 1200x630 is a fixed frame:
   a letterboxed room screenshot with bars down the sides reads as a broken
   image in a chat client. */
function previewImage(origin, thumb) {
    if (!thumb) return `${origin}/assets/img/og-thumbnail.png`;
    const params = new URLSearchParams({ url: thumb, w: "1200", h: "630", fit: "cover", q: "80" });
    return `${origin}/.netlify/images?${params.toString()}`;
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
    const parts = [who, what || tail].filter(Boolean);
    const text = parts.join(" ").replace(/\s+/g, " ");
    // Long enough to say something, short enough that no client truncates
    // it mid-word in a way that changes the meaning.
    return text.length > 200 ? text.slice(0, 197).replace(/\s+\S*$/, "") + "…" : text;
}

/* The document itself.

   A real browser never reads any of this: the redirect below fires first.
   It is written as a proper page regardless — with the name and the picture
   in the body — because a client that follows the link without running
   script (a preview bot that renders, a text browser, a reader mode) should
   still land on something that makes sense rather than a blank page with
   tags in its head. */
function page({ title, description, image, canonical, target }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Maze Rats</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:site_name" content="Maze Rats">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
<style>
body{margin:0;background:#120c07;color:#e6d9c2;font-family:system-ui,sans-serif;
     display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}
main{padding:32px;max-width:640px}
img{max-width:100%;height:auto;border-radius:4px}
a{color:#e6b866}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(target)}">Open it in the Maze Rats archive</a></p>
<img src="${escapeHtml(image)}" alt="">
</main>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;
}

function notFound(origin) {
    return {
        statusCode: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: page({
            title: "Not in the archive",
            description: "That maze or event isn’t in the Maze Rats archive — it may have been renamed since the link was made.",
            image: `${origin}/assets/img/og-thumbnail.png`,
            canonical: `${origin}/home.html`,
            target: "/home.html"
        })
    };
}

exports.handler = async (event) => {
    const origin = originOf(event);
    const asked = requestedId(event);
    if (!asked) return notFound(origin);
    const { id, isEvent } = asked;

    let db;
    try {
        db = await getDb();
    } catch (e) {
        // The database being down is not a reason to hand back a broken
        // preview: send the sharer's link on to the archive, which has its
        // own offline copy to fall back to.
        return {
            statusCode: 302,
            headers: { Location: "/home.html" },
            body: ""
        };
    }

    const record = await db.collection(isEvent ? "events" : "rooms")
        .findOne({ id }, { projection: { _id: 0 } });
    if (!record) return notFound(origin);

    const title = (isEvent ? record.title : record.name) || "Maze Rats";
    // The same fallback chain the site's own cards use (see normalize in
    // js/home.js): the thumbnail, then the entrance shot, then the first
    // room in the gallery.
    const thumb = record.thumb
        || (record.entrance && record.entrance.image)
        || (record.gallery && record.gallery[0] && record.gallery[0].image)
        || "";

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": CACHE
        },
        body: page({
            title,
            description: describe(record, isEvent),
            image: previewImage(origin, thumb),
            canonical: `${origin}/${isEvent ? "event" : "maze"}/${encodeURIComponent(id)}`,
            target: `/home.html#${isEvent ? "event" : "maze"}-${encodeURIComponent(id)}`
        })
    };
};

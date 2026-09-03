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
    const params = event.queryStringParameters || {};
    const mazeId = params.maze;
    const eventId = params.event;
    if (!mazeId && !eventId) return notFound(origin);

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

    const isEvent = !!eventId;
    const id = isEvent ? eventId : mazeId;
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

/* /.netlify/functions/sitemap — served at /sitemap.xml (see netlify.toml).

   Generated rather than kept as a file, because the thing worth indexing is
   the archive's contents, and those change whenever an admin adds a maze. A
   hand-written sitemap listing two pages would be a formality; this lists
   every maze and event at the share URL that carries its own title and
   picture (see share.js), which is the address worth having in an index.

   Archived and past records are included on purpose. Someone searching for
   a maze that closed two years ago is exactly the visitor this archive
   exists for — leaving them out would index only the part of the site that
   is already easy to find. */
const { getDb } = require("./_db");
const { headersFor } = require("./_headers");

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

function originOf(event) {
    const headers = event.headers || {};
    const host = headers["x-forwarded-host"] || headers.host;
    if (!host) return process.env.URL || "https://mazerats.net";
    const proto = /^localhost|^127\./.test(host) ? "http" : "https";
    return `${proto}://${host}`;
}

function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
    }[c]));
}

// <lastmod> wants a date, and only a real one is worth sending — a made-up
// value teaches a crawler to ignore the field. Records carry "YYYY-MM-DD"
// (a maze's opening) or a full ISO timestamp (an event's start).
function lastmod(value) {
    const text = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function url(loc, when, priority) {
    return "  <url>\n" +
        `    <loc>${esc(loc)}</loc>\n` +
        (when ? `    <lastmod>${when}</lastmod>\n` : "") +
        `    <priority>${priority}</priority>\n` +
        "  </url>";
}

exports.handler = async (event) => {
    const origin = originOf(event);

    // The pages themselves, which exist whether or not the database answers.
    const entries = [
        url(`${origin}/`, "", "1.0"),
        /* The archive, at the clean address rather than /home.html. A
           sitemap entry that is not the page's own canonical is a sitemap
           entry asking to be ignored, and home.html names /home — see the
           note beside its <link rel="canonical">. */
        url(`${origin}/home`, "", "0.9"),
        /* The game, at its pretty address — the one it names as canonical and
           the one people actually paste. It was noindex while it was being
           built and so had no business here; all fifty rooms are finished now.
           Below home because the archive is what the site is for. */
        url(`${origin}/fallinfurni`, "", "0.7"),
        /* The privacy policy, last and lowest, because nobody searches for
           it — but it belongs here.

           It is a real page with a real address, it is not noindex, and it
           is now what every footer on the site links to: js/site.js sends
           the atlas, the game and the 404 page here rather than to
           home.html#privacy, which a Coming Soon gate turns into a bounce
           to the landing page with the hash dropped. A page that every
           footer points at and no sitemap mentions is a page search engines
           reach last and by accident.

           Priority 0.3 says what it is: something that should be findable
           and is not what anyone came for. */
        url(`${origin}/privacy`, "", "0.3")
    ];

    try {
        const db = await getDb();
        const [rooms, events] = await Promise.all([
            db.collection("rooms").find({}, { projection: { id: 1, added: 1, _id: 0 } }).toArray(),
            db.collection("events").find({}, { projection: { id: 1, date: 1, _id: 0 } }).toArray()
        ]);
        rooms.forEach(r => {
            if (r.id) entries.push(url(`${origin}/maze/${encodeURIComponent(r.id)}`, lastmod(r.added), "0.8"));
        });
        events.forEach(e => {
            if (e.id) entries.push(url(`${origin}/event/${encodeURIComponent(e.id)}`, lastmod(e.date), "0.5"));
        });
    } catch (e) {
        // A sitemap listing the pages is worth more than a 500. The archive's
        // own entries come back on the next crawl.
        console.warn("sitemap.js: database unavailable, serving pages only", e.message);
    }

    return {
        statusCode: 200,
        headers: headersFor("application/xml; charset=utf-8", { "Cache-Control": CACHE }),
        body: '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            entries.join("\n") + "\n</urlset>\n"
    };
};

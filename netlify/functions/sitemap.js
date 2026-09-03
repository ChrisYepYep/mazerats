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
        url(`${origin}/home.html`, "", "0.9")
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
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": CACHE
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            entries.join("\n") + "\n</urlset>\n"
    };
};

/* /.netlify/functions/sitemap — served at /sitemap.xml (see netlify.toml).

   Generated rather than kept as a file, because the thing worth indexing is
   the archive's contents, and those change whenever an admin adds a maze. A
   hand-written sitemap listing two pages would be a formality; this lists
   every maze, event and guide at its own address (/maze/<slug>), which
   carries its own title and picture (see share.js) and is the address worth
   having in an index.

   Archived and past records are included on purpose. Someone searching for
   a maze that closed two years ago is exactly the visitor this archive
   exists for — leaving them out would index only the part of the site that
   is already easy to find. */
const { getDb } = require("./_db");
const { headersFor } = require("./_headers");
const { assignSlugs, PROJECTION: SLUG_FIELDS } = require("./_slugs");

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
/* What the pages-only fallback goes out with when the database could not be
   read. It used to take CACHE like a full answer, so one bad minute at the
   cluster was stored at the edge for an hour and then served stale for a
   day on top — a sitemap with no mazes in it, handed to every crawler that
   asked, long after the database was back. A minute, and no stale serving,
   so the next crawl after recovery gets the whole archive. */
const FALLBACK_CACHE = "public, max-age=60, s-maxage=60";

/* The site's address from the deploy's configuration, never from the
   request's Host or x-forwarded-host — those are the caller's to set, and
   this answer is cached at the edge for an hour, so one crafted request
   could have published a sitemap full of somebody else's domain. See the
   same function in share.js. */
function originOf() {
    return String(process.env.URL || "https://mazerats.net").replace(/\/+$/, "");
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
    // Never a day that has not happened: a modification date in the future
    // is exactly the made-up value that teaches a crawler to ignore the field.
    return text <= new Date().toISOString().slice(0, 10) ? text : "";
}

function url(loc, when, priority) {
    return "  <url>\n" +
        `    <loc>${esc(loc)}</loc>\n` +
        (when ? `    <lastmod>${when}</lastmod>\n` : "") +
        `    <priority>${priority}</priority>\n` +
        "  </url>";
}

exports.handler = async (event) => {
    const origin = originOf();

    // The pages themselves, which exist whether or not the database answers.
    const entries = [
        url(`${origin}/`, "", "1.0"),
        /* The archive, at the clean address rather than /home.html. A
           sitemap entry that is not the page's own canonical is a sitemap
           entry asking to be ignored, and home.html names /home — see the
           note beside its <link rel="canonical">. */
        url(`${origin}/home`, "", "0.9"),
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

    let cache = CACHE;
    try {
        const db = await getDb();
        const [rooms, events, settings] = await Promise.all([
            db.collection("rooms").find({}, { projection: { ...SLUG_FIELDS, added: 1 } }).toArray(),
            db.collection("events").find({}, { projection: { ...SLUG_FIELDS, updatedAt: 1, createdAt: 1 } }).toArray(),
            db.collection("settings").findOne({ _id: "site" }, { projection: { fallinFurniState: 1 } }).catch(() => null)
        ]);
        /* The game, at its pretty address — the one it names as canonical and
           the one people actually paste. Only while it is open: it launches
           after the site, on its own switch (fallinFurniState, whose default
           is live — see settings.js), and a sitemap that offered the Coming
           Soon placeholder would get the placeholder indexed in the game's
           place. Below home because the archive is what the site is for. */
        const ffState = (settings && settings.fallinFurniState) || "live";
        if (ffState === "live") entries.splice(2, 0, url(`${origin}/fallinfurni`, "", "0.7"));
        /* Each at its own address, /maze/<slug> — the canonical the page
           names there, worked out by the same rule (see _slugs.js). Listing
           an id that 301s to the slug would be listing a redirect. */
        const roomSlugs = assignSlugs(rooms, "maze");
        const eventSlugs = assignSlugs(events, "event");
        rooms.forEach(r => {
            if (r.id) entries.push(url(`${origin}/maze/${encodeURIComponent(roomSlugs.get(r.id))}`, lastmod(r.added), "0.8"));
        });
        events.forEach(e => {
            // When the RECORD last changed, not when the event is: an
            // upcoming event's date is in the future, which is no kind of
            // modification date.
            if (e.id) entries.push(url(`${origin}/event/${encodeURIComponent(eventSlugs.get(e.id))}`, lastmod(e.updatedAt || e.createdAt), "0.5"));
        });
        /* The Guides window and each published guide. Read on their own so a guides
           collection that does not exist yet costs the archive's entries
           nothing. */
        const guides = await db.collection("guides")
            .find({}, { projection: { ...SLUG_FIELDS, status: 1, updatedAt: 1 } }).toArray()
            .catch(() => []);
        // Addresses over every guide, drafts too, as the API works them out;
        // only the published ones are listed.
        const guideSlugs = assignSlugs(guides, "guide");
        const published = guides.filter(g => g.status === "published");
        /* No entry for /guides itself. It is home.html with the window open,
           and home.html names /home as its canonical, so listing /guides
           would be a sitemap entry asking to be ignored. The guides are
           listed at their own addresses, which do carry their own. */
        published.forEach(g => {
            if (g.id) entries.push(url(`${origin}/guides/${encodeURIComponent(guideSlugs.get(g.id))}`, lastmod(g.updatedAt), "0.6"));
        });
    } catch (e) {
        // A sitemap listing the pages is worth more than a 500. The archive's
        // own entries come back on the next crawl.
        console.warn("sitemap.js: database unavailable, serving pages only", e.message);
        cache = FALLBACK_CACHE;
    }

    return {
        statusCode: 200,
        headers: headersFor("application/xml; charset=utf-8", { "Cache-Control": cache }),
        body: '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            entries.join("\n") + "\n</urlset>\n"
    };
};

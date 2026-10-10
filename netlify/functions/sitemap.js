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
const { assignSlugs, loadRetired, PROJECTION: SLUG_FIELDS } = require("./_slugs");

/* The deleted records' addresses, which the API works addresses out
   around (see _slugs.js); the same here so the two cannot disagree. None
   when they cannot be read, as the API does: every record's address is
   stored, and a stored one does not depend on them. */
const retiredOf = (db, kind) => loadRetired(db, kind).catch(() => []);

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
/* What the pages-only fallback goes out with when the database could not be
   read. It used to take CACHE like a full answer, so one bad minute at the
   cluster was stored at the edge for an hour and then served stale for a
   day on top — a sitemap with no mazes in it, handed to every crawler that
   asked, long after the database was back. A minute, and no stale serving,
   so the next crawl after recovery gets the whole archive. */
const FALLBACK_CACHE = "public, max-age=60, s-maxage=60";
// What a failed settings read comes back as, told apart from "no document".
const SETTINGS_UNREAD = Symbol("settings unread");

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
    // A stamp some other tool stored as a Date reads as its instant, not as
    // "Mon Sep 28…", which the check below would throw away.
    const at = value instanceof Date && !isNaN(value.getTime()) ? value.toISOString() : value;
    const text = String(at || "").slice(0, 10);
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
        /* The two daily games (30 Sept 2026). Each is a public page at its
           own address — robots.txt allows /guess on purpose — and each
           names that address as its canonical while it is open (PageMeta in
           js/guess.js and js/oddoneout.js), so neither is the /home entry
           again. Listed always, as /home is: neither has a switch of its
           own, and the site's Coming Soon gate covers them exactly as it
           covers the archive. No lastmod: the page is the same every day;
           only the deal changes, and that is never in it. */
        url(`${origin}/guess`, "", "0.6"),
        url(`${origin}/odd`, "", "0.6"),
        /* The Guides window's own address (1 Oct 2026). It used to be left
           out, as home.html naming /home; since share.js serves /guides
           with its own title, description and canonical (FIXED_PAGES there),
           it is a page of its own like the two above. */
        url(`${origin}/guides`, "", "0.6"),
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
        const [rooms, events, settings, retiredRooms, retiredEvents, retiredGuides] = await Promise.all([
            db.collection("rooms").find({}, { projection: { ...SLUG_FIELDS, updatedAt: 1, createdAt: 1 } }).toArray(),
            db.collection("events").find({}, { projection: { ...SLUG_FIELDS, updatedAt: 1, createdAt: 1 } }).toArray(),
            db.collection("settings").findOne({ _id: "site" }, { projection: { fallinFurniState: 1, puraPanicState: 1 } }).catch(() => SETTINGS_UNREAD),
            retiredOf(db, "maze"), retiredOf(db, "event"), retiredOf(db, "guide")
        ]);
        /* A settings read that FAILED is not a settings document that is
           not there (28 Sept 2026). No document means nobody has touched the
           switches, and the defaults apply; a failed read means the switch
           is unknown. It used to come back as null and so read as "live",
           listing /fallinfurni — possibly the Coming Soon placeholder — for
           a full hour. Now unknown is treated as not live, and the answer
           goes out on the one-minute FALLBACK_CACHE so the next crawl gets
           the real state. */
        const settingsUnread = settings === SETTINGS_UNREAD;
        if (settingsUnread) cache = FALLBACK_CACHE;
        /* The game, at its pretty address — the one it names as canonical and
           the one people actually paste. Only while it is open: it launches
           after the site, on its own switch (fallinFurniState, whose default
           is live — see settings.js), and a sitemap that offered the Coming
           Soon placeholder would get the placeholder indexed in the game's
           place. Below home because the archive is what the site is for. */
        const ffState = settingsUnread ? "unknown" : (settings && settings.fallinFurniState) || "live";
        if (ffState === "live") entries.splice(2, 0, url(`${origin}/fallinfurni`, "", "0.7"));
        /* Pura Panic (10 Oct 2026), at /purapanic: the window's own address,
           served by share.js with its own title, description and canonical.
           On its own switch as Fallin' Furni is, but the other way round:
           puraPanicState is "maintenance" until the owner sets it live (see
           settings.js), so only an explicit "live" lists it, and an unread
           settings document never does. With the games, after /guides; no
           lastmod, for the same reason as theirs. */
        if (!settingsUnread && settings && settings.puraPanicState === "live") {
            const after = entries.findIndex(e => e.includes(`<loc>${esc(`${origin}/guides`)}</loc>`));
            entries.splice(after === -1 ? entries.length : after + 1, 0, url(`${origin}/purapanic`, "", "0.6"));
        }
        /* Each at its own address, /maze/<slug> — the canonical the page
           names there, worked out by the same rule (see _slugs.js). Listing
           an id that 301s to the slug would be listing a redirect. */
        const roomSlugs = assignSlugs(rooms, "maze", retiredRooms);
        const eventSlugs = assignSlugs(events, "event", retiredEvents);
        /* When the RECORD last changed, as for events below. It was `added`,
           which is when the maze opened in the hotel — often years before
           the page existed — so a maze that gained forty room shots last
           week told crawlers its page had not changed since 2024, and they
           had no reason to come back for them. A maze saved before either
           stamp existed sends no lastmod, which is the honest answer. */
        rooms.forEach(r => {
            if (r.id) entries.push(url(`${origin}/maze/${encodeURIComponent(roomSlugs.get(r.id))}`, lastmod(r.updatedAt || r.createdAt), "0.8"));
        });
        events.forEach(e => {
            // When the RECORD last changed, not when the event is: an
            // upcoming event's date is in the future, which is no kind of
            // modification date.
            if (e.id) entries.push(url(`${origin}/event/${encodeURIComponent(eventSlugs.get(e.id))}`, lastmod(e.updatedAt || e.createdAt), "0.5"));
        });
        /* The Guides window and each published guide. Read on their own so a guides
           collection that does not exist yet costs the archive's entries
           nothing. A read that fails still sends the rest, but on the
           one-minute FALLBACK_CACHE (28 Sept 2026): it used to go out for
           the full hour, a sitemap with every guide missing. (A collection
           that does not exist reads as empty, not as a failure, so that
           case keeps the full cache.) */
        const guides = await db.collection("guides")
            .find({}, { projection: { ...SLUG_FIELDS, status: 1, updatedAt: 1 } }).toArray()
            .catch(() => { cache = FALLBACK_CACHE; return []; });
        // Addresses over every guide, drafts too, as the API works them out;
        // only the published ones are listed.
        const guideSlugs = assignSlugs(guides, "guide", retiredGuides);
        const published = guides.filter(g => g.status === "published");
        /* /guides itself is listed with the pages above, whether or not
           this read works. The guides are listed at their own addresses,
           which carry their own canonicals. */
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
        /* Netlify-Vary (2 Oct 2026): the sitemap reads no parameter at all,
           and the edge keyed it on the whole query string, so
           /sitemap.xml?x=<random> skipped the hour's copy every time and
           cost a read of every room, event and guide. Naming one parameter
           that nothing sends keys every spelling on that one (empty) value,
           so all of them share the one cached copy. See `vary` in _cache.js. */
        headers: headersFor("application/xml; charset=utf-8", { "Cache-Control": cache, "Netlify-Vary": "query=v" }),
        body: '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            entries.join("\n") + "\n</urlset>\n"
    };
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("sitemap", exports.handler);

/* /.netlify/functions/habbo — looks up a maze builder's live Habbo Origins
   profile, so a maze's modal can show the people who built it as their
   actual avatars rather than just a line of usernames.

   Public GET, like rooms.js/events.js: this only exposes data already
   public on the Origins hotels, and it's read by ordinary visitors viewing
   a maze.

   Origins has no published API. Everything here was established by probing
   the live hotel, and it can change without notice, so this fails soft
   everywhere: any problem returns "no profile" and the maze modal falls
   back to the plain creator line it always showed. */
const { getDb } = require("./_db");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

// This archive's own "hotel" field mapped to the Origins hotel it means.
// The values stored in the database are COM/ES/BR (see HOTEL_OPTIONS in
// js/admin.js, which is the fixed list the admin form offers) — every maze
// here is an Origins maze, so these are the origins.* hosts rather than the
// main hotels of the same name. All three were confirmed live and serving
// this API; origins.habbo.de does not resolve at all, so there is no DE.
const ORIGINS_HOSTS = {
    COM: "origins.habbo.com",
    ES: "origins.habbo.es",
    BR: "origins.habbo.com.br"
};
const DEFAULT_HOST = ORIGINS_HOSTS.COM;

// Origins sits behind DOSarrest. With no User-Agent it answers some paths
// with a 502 HTML error page instead of the app's own JSON — the same path
// returns a normal response once a browser-shaped UA is sent. This is not
// an attempt to evade anything (the endpoint is public and unauthenticated);
// it is the difference between getting the documented response and getting
// the WAF's error page.
const USER_AGENT = "Mozilla/5.0 (compatible; MazeRats/1.0; +https://mazerats.net)";

const FETCH_TIMEOUT_MS = 6000;

// Long enough that a popular maze does not hammer Origins on every view,
// short enough that "online" and the avatar stay roughly current. Anything
// older is refetched; if that refetch fails the stale copy is served anyway
// rather than dropping the profile entirely.
const CACHE_TTL_MS = 30 * 60 * 1000;

// Origins' own imaging service 404s — avatarimage only exists on the main
// hotel. The figure string format is shared between them, so an Origins
// figure renders correctly through www.habbo.com. Built here rather than in
// the browser so this piece of knowledge lives with the rest of it.
function avatarUrl(figureString, size) {
    const params = new URLSearchParams({
        figure: figureString,
        size: size === "s" ? "s" : "l",
        direction: "2",
        head_direction: "3",
        action: "std",
        gesture: "sml"
    });
    return `https://www.habbo.com/habbo-imaging/avatarimage?${params.toString()}`;
}

// A maze's creator field can name several people ("Vincent, LanceS,
// ChrisYepYep"), so an exact match on the whole field would miss everyone
// on a collab. This matches the name as one comma-separated entry within
// it, anchored at either a string boundary or a comma. An event's host
// field is written the same way, and is matched with the same thing.
function creatorMatcher(name) {
    // Usernames can legitimately contain regex metacharacters.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|,)\\s*${escaped}\\s*(,|$)`, "i");
}

/* Only names actually credited in this archive are looked up. Without this
   the function is an open proxy to Habbo's API that anyone could point at
   any username at any rate, with this site's name on the traffic. Returns
   the archive's hotel code for that person, so the lookup goes to the hotel
   they are actually on.

   Both places a person can be credited, not just the first. It read only
   rooms.creator to begin with, which quietly meant an event's host got a
   card only if they had also built a maze — every host who had was fine, so
   the gap looked like Habbo withholding that one person's profile rather
   than this archive never asking for it. Origins answers for them perfectly
   well; nobody was asking. */
async function archivedCreditHotel(db, name) {
    const matcher = creatorMatcher(name);
    const room = await db.collection("rooms").findOne(
        { creator: matcher },
        { projection: { _id: 0, hotel: 1 } }
    );
    if (room) return (room.hotel || "").toUpperCase();

    const event = await db.collection("events").findOne(
        { host: matcher },
        { projection: { _id: 0, hotel: 1 } }
    );
    if (event) return (event.hotel || "").toUpperCase();

    return null;
}

async function fetchOriginsProfile(host, name) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(
            `https://${host}/api/public/users?name=${encodeURIComponent(name)}`,
            { signal: controller.signal, headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } }
        );

        // A 404 is a real answer — no such user on that hotel — and gets
        // cached as such below, so a builder who is not on Origins does not
        // retry upstream on every single view.
        if (res.status === 404) return { found: false };

        // Never parse on status alone. The WAF's 502 is an HTML page, and
        // JSON.parse on it throws — which would turn a passing upstream
        // hiccup into a 500 from this function.
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok || !contentType.includes("json")) {
            throw new Error(`${host} returned ${res.status} (${contentType || "no content-type"})`);
        }

        const user = await res.json();
        if (!user || !user.name) return { found: false };

        return {
            found: true,
            profile: {
                name: user.name,
                motto: user.motto || "",
                online: Boolean(user.online),
                lastAccessTime: user.lastAccessTime || null,
                memberSince: user.memberSince || null,
                // profileVisible false means the person has hidden their
                // profile on Origins; the name and figure are still public
                // but nothing further should be inferred from it.
                profileVisible: user.profileVisible !== false,
                avatar: user.figureString ? avatarUrl(user.figureString, "l") : "",
                hotel: host
            }
        };
    } finally {
        clearTimeout(timer);
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

    const name = ((event.queryStringParameters || {}).name || "").trim();
    if (!name) return json(400, { error: "Missing name" });
    if (name.length > 60) return json(400, { error: "Name is too long" });

    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }

    const hotelCode = await archivedCreditHotel(db, name);
    if (hotelCode === null) return json(404, { error: "Not credited in this archive" });

    const host = ORIGINS_HOSTS[hotelCode] || DEFAULT_HOST;

    // Keyed by hotel as well as name: the same username on origins.habbo.com
    // and origins.habbo.es is not necessarily the same person.
    const cache = db.collection("habbo_cache");
    const key = `${host}:${name.toLowerCase()}`;
    const cached = await cache.findOne({ key }, { projection: { _id: 0 } });
    const fresh = cached && (Date.now() - new Date(cached.fetchedAt).getTime()) < CACHE_TTL_MS;

    if (fresh) {
        if (!cached.found) return json(404, { error: "No Origins profile for that name" });
        return json(200, { ...cached.profile, cachedAt: cached.fetchedAt, stale: false });
    }

    let result;
    try {
        result = await fetchOriginsProfile(host, name);
    } catch (e) {
        // Origins unreachable, slow, or answering with the WAF's error page.
        // A stale cached copy is far more useful to a visitor than nothing,
        // so serve it and say so; only a cold miss actually fails.
        if (cached && cached.found) {
            return json(200, { ...cached.profile, cachedAt: cached.fetchedAt, stale: true });
        }
        console.warn("habbo.js: lookup failed for", name, "on", host, "-", e.message);
        return json(503, { error: "Origins profile lookup is unavailable right now" });
    }

    const fetchedAt = new Date().toISOString();
    await cache.updateOne(
        { key },
        { $set: { key, name, host, found: result.found, profile: result.profile || null, fetchedAt } },
        { upsert: true }
    );

    if (!result.found) return json(404, { error: "No Origins profile for that name" });
    return json(200, { ...result.profile, cachedAt: fetchedAt, stale: false });
};

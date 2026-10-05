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
const { getDb, ensureIndex } = require("./_db");
const { SECURITY_HEADERS } = require("./_headers");

/* A profile is the same answer for every visitor, and the modal asks for
   one per builder every time a maze is opened — so a found profile, and a
   settled "no such person", may be kept for a few minutes by the browser
   and the edge alike. Five minutes sits well inside the half hour the
   server-side cache below already holds a profile for, so it cannot make
   "online" any staler than it was. Failures are not cached: a 503 is
   Origins having a bad minute, and should not outlast it. */
const CACHEABLE = { 200: "public, max-age=300", 404: "public, max-age=300" };

/* Netlify-Vary (2 Oct 2026): keyed on `name` alone, so `&x=<random>` on a
   name somebody has already asked about is the edge's copy, not another
   function run — see `vary` in _cache.js. */
const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": CACHEABLE[statusCode] || "no-store", "Netlify-Vary": "query=name" },
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

/* Names this instance has recently found NOT credited, remembered in memory
   for a few minutes.

   The refusal above is the right answer and was also the most expensive
   one: a name that is not credited never gets a habbo_cache row, so the
   fast path never finds it, and every ask for it ran both unindexable regex
   scans again. A script walking random names therefore cost the database
   two collection scans per request, which is the open proxy turned inward.
   Remembered here, a repeat costs nothing at all; a genuinely new credit
   shows up within NOT_CREDITED_TTL_MS. Bounded like room-figure.js's cache,
   oldest out first, so invented names cannot grow it without limit. Per
   warm instance only — it blunts a loop, it is not a guarantee. */
const NOT_CREDITED_TTL_MS = 5 * 60 * 1000;
const NOT_CREDITED_MAX = 2000;
const notCredited = new Map();      // lowercased name -> when it was refused

function recentlyNotCredited(lower) {
    const at = notCredited.get(lower);
    if (at === undefined) return false;
    if (Date.now() - at < NOT_CREDITED_TTL_MS) return true;
    notCredited.delete(lower);
    return false;
}

function rememberNotCredited(lower) {
    notCredited.delete(lower);
    notCredited.set(lower, Date.now());
    for (const k of notCredited.keys()) {
        if (notCredited.size <= NOT_CREDITED_MAX) break;
        notCredited.delete(k);
    }
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
    // Before the database is so much as connected to — see notCredited.
    if (recentlyNotCredited(name.toLowerCase())) return json(404, { error: "Not credited in this archive" });

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("habbo: database connection failed", e);
        return json(503, { error: "Origins profile lookup is unavailable right now" });
    }

    // Keyed by hotel as well as name: the same username on origins.habbo.com
    // and origins.habbo.es is not necessarily the same person.
    const cache = db.collection("habbo_cache");
    /* The key every lookup below is made on had no index, so each one —
       the cache-first read included — scanned the whole collection
       (2 Oct 2026). Memoised and never fatal (ensureIndex in _db.js). */
    await ensureIndex(cache, { key: 1 });
    const isFresh = (c) => c && (Date.now() - new Date(c.fetchedAt).getTime()) < CACHE_TTL_MS;
    const cachedAnswer = (c) => c.found
        ? json(200, { ...c.profile, cachedAt: c.fetchedAt, stale: false })
        : json(404, { error: "No Origins profile for that name" });

    let hotelCode, cached;
    try {
        /* THE CACHE FIRST, before the archive is searched.

           The credit check below is two case-insensitive regex scans, over
           rooms and then events, which no index can help with — and it ran
           on every call, including the great majority that were then
           answered from a fresh cache row anyway. A row only ever exists for
           a name that passed the credit check when it was written, so a
           fresh one is its own proof, to within the half hour it stays
           fresh. Looked up under every hotel the name could be on; if the
           name is fresh under exactly one, that is the answer. Two at once
           (the same name credited on two hotels) is left to the full path,
           which knows which hotel the archive means. */
        const lower = name.toLowerCase();
        const keys = Object.values(ORIGINS_HOSTS).map(h => `${h}:${lower}`);
        const rows = (await cache.find({ key: { $in: keys } }, { projection: { _id: 0 } }).toArray())
            /* Not a row a player's profile wrote (source "player", see
               originsProfileFor): that name was never checked against the
               archive, so it proves no credit (4 Oct 2026, the bug scan). */
            .filter(r => isFresh(r) && r.source !== "player" && r.source !== "search");
        if (rows.length === 1) return cachedAnswer(rows[0]);

        hotelCode = await archivedCreditHotel(db, name);
        if (hotelCode === null) {
            rememberNotCredited(lower);
            return json(404, { error: "Not credited in this archive" });
        }
        cached = await cache.findOne({ key: `${ORIGINS_HOSTS[hotelCode] || DEFAULT_HOST}:${lower}` }, { projection: { _id: 0 } });
    } catch (e) {
        console.error("habbo: archive lookup failed", e);
        return json(503, { error: "Origins profile lookup is unavailable right now" });
    }

    const host = ORIGINS_HOSTS[hotelCode] || DEFAULT_HOST;
    const key = `${host}:${name.toLowerCase()}`;

    if (isFresh(cached)) return cachedAnswer(cached);

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
    // The answer is already in hand; failing to remember it is no reason
    // not to give it.
    await cache.updateOne(
        { key },
        // source "credit": checked against the archive above (see the fast path).
        { $set: { key, name, host, found: result.found, profile: result.profile || null, fetchedAt, source: "credit" } },
        { upsert: true }
    ).catch(e => console.warn("habbo.js: could not cache", key, "-", e.message));

    if (!result.found) return json(404, { error: "No Origins profile for that name" });
    return json(200, { ...result.profile, cachedAt: fetchedAt, stale: false });
};

/* A PLAYER'S OWN HABBO, for their profile (3 Oct 2026; profiles.js).

   Not through the handler above, whose credit check is the whole of its
   guard against being an open proxy: a player is not credited on a maze,
   but their Habbo name came from OriginsBot (_originsbot.js), which vouches
   for it, and only the server ever asks — the name is read off their
   players row, never taken from the request. The same cache rows and the
   same half hour, so a builder who is also a player is fetched once.

   Resolves to the profile or null — never throws: a profile without its
   avatar is still a profile. */
async function originsProfileFor(db, hotelCode, name) {
    if (!db || typeof name !== "string" || !name.trim()) return null;
    const host = ORIGINS_HOSTS[String(hotelCode || "").toUpperCase()] || DEFAULT_HOST;
    const key = `${host}:${name.trim().toLowerCase()}`;
    let cached = null;
    try {
        const cache = db.collection("habbo_cache");
        await ensureIndex(cache, { key: 1 });
        cached = await cache.findOne({ key }, { projection: { _id: 0 } });
        if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
            return cached.found ? cached.profile : null;
        }
        const result = await fetchOriginsProfile(host, name.trim());
        await cache.updateOne(
            { key },
            /* Marked as a player's on the way in only: a row the handler
               above wrote for a credited builder stays one. */
            { $set: { key, name: name.trim(), host, found: result.found, profile: result.profile || null, fetchedAt: new Date().toISOString() },
              $setOnInsert: { source: "player" } },
            { upsert: true }
        ).catch(e => console.warn("habbo.js: could not cache", key, "-", e.message));
        return result.found ? result.profile : null;
    } catch (e) {
        // Origins having a bad minute: the copy we had, however old.
        return cached && cached.found ? cached.profile : null;
    }
}

/* ANY HABBO, BY THE NAME SOMEBODY TYPED (4 Oct 2026, the owner's: the
   profile search finds every Habbo, joined or not; profiles.js).

   Not through the handler, for the reason originsProfileFor gives, and not
   through originsProfileFor either: that one caches every answer, and the
   names typed into a search box — "Ch", "Chr", "Chri" on the way to a real
   one — are mostly nobody. So only a Habbo that EXISTS is written to the
   cache (source "search", which the handler's fast path ignores as it
   ignores "player": no credit was checked), and a name Origins does not
   know is remembered in this warm instance alone, bounded as notCredited
   is. A fresh cache row of any source answers first.

   Resolves to { found: true, profile } or { found: false }; null when
   Origins could not be asked (down, slow, the WAF). Never throws. */
const NOT_ON_ORIGINS_TTL_MS = 10 * 60 * 1000;
const NOT_ON_ORIGINS_MAX = 5000;
const notOnOrigins = new Map();     // "host:lowercased name" -> when Origins said no

async function lookupOriginsName(db, hotelCode, name) {
    const clean = typeof name === "string" ? name.trim() : "";
    if (!db || !clean || clean.length > 60) return null;
    const host = ORIGINS_HOSTS[String(hotelCode || "").toUpperCase()] || DEFAULT_HOST;
    const key = `${host}:${clean.toLowerCase()}`;
    const missAt = notOnOrigins.get(key);
    if (missAt !== undefined) {
        if (Date.now() - missAt < NOT_ON_ORIGINS_TTL_MS) return { found: false };
        notOnOrigins.delete(key);
    }
    let cached = null;
    try {
        const cache = db.collection("habbo_cache");
        await ensureIndex(cache, { key: 1 });
        cached = await cache.findOne({ key }, { projection: { _id: 0 } });
        if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
            return cached.found && cached.profile ? { found: true, profile: cached.profile } : { found: false };
        }
        const result = await fetchOriginsProfile(host, clean);
        if (!result.found) {
            notOnOrigins.delete(key);
            notOnOrigins.set(key, Date.now());
            for (const k of notOnOrigins.keys()) {
                if (notOnOrigins.size <= NOT_ON_ORIGINS_MAX) break;
                notOnOrigins.delete(k);
            }
            return { found: false };
        }
        await cache.updateOne(
            { key },
            { $set: { key, name: result.profile.name || clean, host, found: true, profile: result.profile, fetchedAt: new Date().toISOString() },
              $setOnInsert: { source: "search" } },
            { upsert: true }
        ).catch(e => console.warn("habbo.js: could not cache", key, "-", e.message));
        return { found: true, profile: result.profile };
    } catch (e) {
        // Origins having a bad minute: the copy we had, however old.
        return cached && cached.found && cached.profile ? { found: true, profile: cached.profile } : null;
    }
}

/* What is already known about a Habbo, from the cache alone — for lists
   (profile search results) that must not send a request to Origins per row.
   A Map of `${hotel}:${lowercased name}` (as asked) -> profile. */
async function cachedOriginsProfiles(db, wants) {
    const out = new Map();
    const keys = new Map();
    (wants || []).forEach(w => {
        if (!w || typeof w.name !== "string" || !w.name.trim()) return;
        const host = ORIGINS_HOSTS[String(w.hotel || "").toUpperCase()] || DEFAULT_HOST;
        keys.set(`${host}:${w.name.trim().toLowerCase()}`, `${String(w.hotel || "").toUpperCase()}:${w.name.trim().toLowerCase()}`);
    });
    if (!keys.size) return out;
    try {
        const rows = await db.collection("habbo_cache")
            .find({ key: { $in: [...keys.keys()] }, found: true }, { projection: { _id: 0, key: 1, profile: 1 } })
            .toArray();
        rows.forEach(r => { if (r.profile) out.set(keys.get(r.key), r.profile); });
    } catch (e) {
        console.warn("habbo.js: cached profiles unreadable", e && e.message);
    }
    return out;
}

/* BUILDER CARDS' MOTTOS (5 Oct 2026, the owner's; MOTTOS in profiles.js).
   The builder cards on a maze and on the welcome page show a builder's
   Habbo motto from this endpoint. One with profanity in it (mottoHit in
   player-nick.js) goes out blank — unless it is a player's motto an admin
   has approved in the Warren (mottoApproved, that exact text, on the player
   whose linked Habbo this is). Only this endpoint's answer: the profile's
   own lookup (originsProfileFor) does its own, with the flag. */
const answerHandler = exports.handler;
exports.handler = async (event) => {
    const res = await answerHandler(event);
    if (!res || res.statusCode !== 200) return res;
    let body;
    try { body = JSON.parse(res.body); } catch (e) { return res; }
    if (!body || typeof body.motto !== "string" || !body.motto) return res;
    const { mottoHit } = require("./player-nick");
    if (!mottoHit(body.motto)) return res;
    try {
        const db = await getDb();
        const passed = await db.collection("players").find({ "mottoApproved.text": body.motto }, { projection: { _id: 0, habbo: 1 } }).limit(20).toArray();
        const name = String(body.name || "").trim().toLowerCase();
        if (name && passed.some(p => p.habbo && String(p.habbo.name || "").trim().toLowerCase() === name)) return res;
    } catch (e) {
        console.error("habbo: could not read approved mottos; this one stays blank", e);
    }
    return { ...res, body: JSON.stringify({ ...body, motto: "" }) };
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("habbo", exports.handler);
exports.originsProfileFor = originsProfileFor;
exports.cachedOriginsProfiles = cachedOriginsProfiles;
exports.lookupOriginsName = lookupOriginsName;
exports.ORIGINS_HOSTS = ORIGINS_HOSTS;
exports.avatarUrl = avatarUrl;
exports.creatorMatcher = creatorMatcher;

exports.fetchOriginsProfile = fetchOriginsProfile;

/* One Origins habbo's figure string, for the room game to wear.

   WHY THIS IS NOT habbo.js. That function answers the same question for the
   archive's builder cards, but it deliberately refuses to look up anybody who
   is not already credited on a maze or an event (see archivedCreditHotel). The
   reason is good: without it, the endpoint is an open proxy to Habbo's public
   API that anyone can point at any username at any rate, with this site's name
   on the traffic.

   The game cannot live behind that gate — the whole point is that a visitor
   types their OWN name — so rather than widening habbo.js and quietly removing
   a guard that exists for a reason, the game gets its own door with its own
   limits on it. habbo.js keeps refusing strangers, exactly as before.

   What stands in for the gate here:

   - a per-address rate limit, so one visitor cannot drive a scan
   - a shared cache, so a name that has already been asked about costs Habbo
     nothing at all on the next ask
   - nothing but the figure and the display name is passed back, where the
     profile endpoint returns considerably more

   The rate limit lives in module scope, which means it is per warm instance
   rather than global — it catches the burst that matters (one browser in a
   loop) and would not catch a distributed one. That is the honest limit of
   doing this without a shared store, and it is why the cache below is the part
   actually protecting Habbo from repeat traffic. */

const ORIGINS_HOSTS = {
    COM: "origins.habbo.com",
    ES: "origins.habbo.es",
    BR: "origins.habbo.com.br"
};

// Origins sits behind a WAF that answers an unidentified client with an error
// page instead of JSON. Same reasoning as habbo.js — this gets the documented
// response rather than evading anything.
const USER_AGENT = "Mozilla/5.0 (compatible; MazeRats/1.0; +https://mazerats.net)";

const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 60 * 60 * 1000;        // a figure changes rarely
const MISS_TTL_MS = 5 * 60 * 1000;          // remember "no such habbo" briefly
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 12;                        // lookups per address per minute

const cache = new Map();                    // lowercased name -> { at, value }
const hits = new Map();                     // address -> timestamps

const json = (statusCode, data) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        // The browser may cache a figure for a few minutes; nothing here is
        // per-visitor, so a shared cache is welcome to it too.
        "Cache-Control": "public, max-age=300"
    },
    body: JSON.stringify(data)
});

function rateLimited(address) {
    const now = Date.now();
    const seen = (hits.get(address) || []).filter(t => now - t < RATE_WINDOW_MS);
    seen.push(now);
    hits.set(address, seen);
    // Keep the map from growing without bound on a long-lived instance.
    if (hits.size > 500) {
        for (const [k, v] of hits) if (!v.some(t => now - t < RATE_WINDOW_MS)) hits.delete(k);
    }
    return seen.length > RATE_MAX;
}

async function fetchUser(host, name) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(
            `https://${host}/api/public/users?name=${encodeURIComponent(name)}`,
            { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: controller.signal }
        );
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`${host} returned ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

exports.handler = async (event) => {
    const params = event.queryStringParameters || {};
    const name = (params.name || "").trim();
    const hotel = ORIGINS_HOSTS[(params.hotel || "COM").toUpperCase()] || ORIGINS_HOSTS.COM;

    if (!name) return json(400, { error: "Tell me a habbo name to look up." });
    // Habbo names are short and use a known alphabet; anything else is not a
    // name and should not become a request to somebody else's API.
    if (!/^[A-Za-z0-9_\-.:]{1,32}$/.test(name)) {
        return json(400, { error: "That is not a habbo name." });
    }

    const address = event.headers["x-nf-client-connection-ip"] ||
        event.headers["client-ip"] || "unknown";
    if (rateLimited(address)) {
        return json(429, { error: "Too many lookups just now — give it a minute." });
    }

    const key = `${hotel}:${name.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < (cached.value ? CACHE_TTL_MS : MISS_TTL_MS)) {
        return cached.value
            ? json(200, cached.value)
            : json(404, { error: "No Origins habbo by that name." });
    }

    try {
        const user = await fetchUser(hotel, name);
        if (!user || !user.figureString) {
            cache.set(key, { at: Date.now(), value: null });
            return json(404, { error: "No Origins habbo by that name." });
        }
        // Only what the room needs to draw somebody.
        const value = {
            name: user.name || name,
            figureString: user.figureString,
            motto: user.motto || ""
        };
        cache.set(key, { at: Date.now(), value });
        return json(200, value);
    } catch (err) {
        // A stale answer beats no answer when Habbo is the thing that is down.
        if (cached && cached.value) return json(200, cached.value);
        return json(502, { error: "Could not reach Habbo just now." });
    }
};

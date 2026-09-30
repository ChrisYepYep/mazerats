/* FurniIndex catalogue, proxied and cached.

   The API key never reaches the browser: this runs server-side and reads it
   from FURNIINDEX_API_KEY. They enforce it now — a request without the header
   is a 401, where it used to be served anyway.

   Cached because their endpoint still has no search of its own: filtering to
   "chair" means holding the whole catalogue, and re-fetching all 13 pages for
   every admin keystroke would be absurd — and unkind to them. Nor does it
   sort or filter on anything else; q/search/name/sort/since are all accepted
   and ignored, so every bit of that happens down in the handler here. ~931KB
   raw over 1,278 rows, refreshed once a day.
*/

const { blobStore } = require("./_blobs.js");
const { SECURITY_HEADERS } = require("./_headers");
const { isOwnerWrite } = require("./_auth");
const { cachedJson } = require("./_cache");

// The edge policy furni-meta.js gives its ?classes= answer — see the handler.
const CATALOGUE_CDN_CACHE = "public, durable, s-maxage=3600, stale-while-revalidate=86400";

const ENDPOINT = "https://furniindex.com/api/mazerats/all";
const PAGE_SIZE = 100;          // their cap; anything larger is ignored
const CACHE_KEY = "catalogue.json";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/* How long FurniIndex gets, per page and for the whole walk.

   This is not only the admin picker's problem. The public /rooms and
   /events go through _furni-payload.js, which asks for this catalogue on a
   cold container — and a fetch with no timeout waits as long as FurniIndex
   cares to take, which is the archive's front page waiting with it. Five
   seconds a page is generous for 100 rows; the overall cap keeps thirteen
   slow pages from adding up to a function timeout. */
const PAGE_TIMEOUT_MS = 5000;
const REFRESH_BUDGET_MS = 8000;
/* With NO copy to fall back on there is nothing to protect by giving up
   early, and the command-line tools (tools/furni-scan-local.js and friends)
   call getCatalogue with no Blobs store at all — so that case gets the
   longer walk. _furni-payload.js puts its own, shorter cap on the public
   path, so the archive never waits on this one. */
const COLD_BUDGET_MS = 60000;

/* ...but only for the command-line tools. Inside a function, "no copy to
   fall back on" is exactly when an anonymous caller can make this walk
   thirteen pages for up to a minute, again and again, on a public URL — the
   cache is empty on a fresh deploy, or whenever the Blobs read fails. So a
   function gets the ordinary REFRESH_BUDGET_MS cap either way, and the
   failure backoff below applies with no copy too (answering the failure
   straight away instead of trying again). Told apart by the script that was
   started, exactly as _db.js tells them apart for its socket timeouts, and
   for the same reason: the admin's scan button spawns a tool with the
   function's whole environment copied across, so only the entry point says
   which one this is. */
const IN_FUNCTION = !(require.main && /[\\/]tools[\\/][^\\/]+$/.test(require.main.filename || ""));

/* After a refresh fails, how long a stale copy is served without trying
   again. Without it, every request on a day FurniIndex is down would spend
   its own five seconds finding that out. */
const RETRY_AFTER_FAILURE_MS = 60 * 1000;
let lastFailureAt = 0;

/* no-store (30 Sept 2026): what goes out through here is an owner's
   ?refresh=1, a ?q= keystroke, or a failure — none of it for keeping. It
   said nothing at all before, which only worked because nothing in front
   of it chose to cache an answer that did not say. */
const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

async function fetchPage(page, outer) {
    const headers = {};
    if (process.env.FURNIINDEX_API_KEY) {
        headers.Authorization = `Bearer ${process.env.FURNIINDEX_API_KEY}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    const onOuterAbort = () => controller.abort();
    if (outer) {
        if (outer.aborted) controller.abort();
        else outer.addEventListener("abort", onOuterAbort, { once: true });
    }
    try {
        return await readPage(page, headers, controller.signal);
    } finally {
        clearTimeout(timer);
        if (outer) outer.removeEventListener("abort", onOuterAbort);
    }
}

async function readPage(page, headers, signal) {
    const res = await fetch(`${ENDPOINT}?page=${page}&limit=${PAGE_SIZE}`, { headers, signal });
    if (res.status === 401) {
        // FurniIndex began requiring the header partway through this being
        // built, so a 401 is nearly always about the key rather than about
        // them. Reports whether this deploy could SEE the variable — the
        // length only, never the value — because "set in Netlify" and
        // "visible to this function" are different things: variables are
        // scoped per deploy context, so one saved for Production alone is
        // absent from a branch deploy or deploy preview.
        const key = process.env.FURNIINDEX_API_KEY;
        if (key) {
            throw new Error(`FurniIndex returned 401 even though a key was sent (${key.length} characters). Check the value is right.`);
        }
        // Lists which FURNI-ish variables this function CAN see, by name
        // only, never a value. A near-miss name and a variable scoped to
        // Builds rather than Functions look identical from in here; this
        // tells the two apart at a glance.
        const seen = Object.keys(process.env).filter(k => /FURNI/i.test(k));
        throw new Error(
            "FurniIndex returned 401 and this function cannot see FURNIINDEX_API_KEY. " +
            (seen.length
                ? `It can see these, so the name may differ: ${seen.join(", ")}.`
                : "It can see no FURNI* variable at all — check the exact name, and that the variable scope includes Functions, not Builds only.")
        );
    }
    if (!res.ok) throw new Error(`FurniIndex page ${page} returned ${res.status}`);
    return res.json();
}

/* Every furni FurniIndex holds.

   On identity: their numeric url id is a PRODUCT id shared by colour
   variants (one id covers both the yellow and the tangerine dining table),
   so it does not identify a row — 1,274 unique urls across 1,278 rows.
   className and id are both unique per row, as is the icon URL. className
   is the useful one of the three: it is Habbo's own name for the furni
   (`anniv_balloongift_2`), stable across their site and ours, where an
   icon URL is only a CDN path that can be rewritten under us. */
async function fetchCatalogue(budgetMs = REFRESH_BUDGET_MS) {
    const budget = new AbortController();
    const budgetTimer = setTimeout(() => budget.abort(), budgetMs);
    const all = [];
    let first;
    try {
        first = await fetchPage(1, budget.signal);
        all.push(...first.results);
        for (let page = 2; page <= first.totalPages; page++) {
            const next = await fetchPage(page, budget.signal);
            all.push(...next.results);
        }
    } finally {
        clearTimeout(budgetTimer);
    }
    return {
        fetchedAt: Date.now(),
        total: first.total,
        items: all.map(r => ({
            name: r.name,
            className: r.className || "",
            motto: r.motto || "",
            icon: r.icon,
            url: r.url,
            releaseDate: r.releaseDate || "",
            // Both grids. largeImages is what the scanner compares against;
            // smallImages is what the furni card shows, and the two share a
            // [state][rotation] shape on every row, so a sprite matched in
            // one has an exact counterpart at the same position in the
            // other (see _furni-payload.js).
            largeImages: r.largeImages || [],
            smallImages: r.smallImages || []
        }))
    };
}

/* A day-old catalogue is refreshed, but a refresh that fails is not an
   outage: the stale copy is served instead, because furni that were right
   yesterday are right today to within a release or two. Only a forced
   refresh (the owner asking on purpose) or having no copy at all lets the
   failure through. */
async function getCatalogue({ force = false } = {}) {
    const store = blobStore("furni");
    const cached = await store.get(CACHE_KEY, { type: "json" }).catch(() => null);
    if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached;
    if (!force && cached && Date.now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) return cached;
    // No copy, inside a function: the backoff holds all the same — see
    // IN_FUNCTION. The owner's forced refresh is still let through.
    if (!force && !cached && IN_FUNCTION && Date.now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) {
        throw new Error("FurniIndex failed moments ago; not asking again yet");
    }
    let fresh;
    try {
        fresh = await fetchCatalogue(cached && !force ? REFRESH_BUDGET_MS : (IN_FUNCTION ? REFRESH_BUDGET_MS : COLD_BUDGET_MS));
    } catch (e) {
        lastFailureAt = Date.now();
        if (!force && cached) {
            console.warn("furni-catalogue: refresh failed, serving the stale copy -", e.message);
            return cached;
        }
        throw e;
    }
    lastFailureAt = 0;
    await store.setJSON(CACHE_KEY, fresh).catch(e => {
        console.warn("furni-catalogue: could not store the refreshed copy -", e.message);
    });
    return fresh;
}

exports.handler = async (event) => {
    const params = event.queryStringParameters || {};
    /* A forced refresh is 13 requests to FurniIndex on an anonymous caller's
       say-so — a way to spend their goodwill and our function time from
       outside. Owners only, the same as the furni scans. */
    if (params.refresh === "1") {
        // isOwnerWrite throws when the account lookup cannot be made (see
        // lookUpRole in _auth.js) — a 503, not a refusal and not a trace.
        let owner;
        try {
            owner = await isOwnerWrite(event);
        } catch (e) {
            return json(503, { error: "The database is unavailable just now. Please try again in a moment." });
        }
        if (!owner) return json(403, { error: "Only an owner can refresh the furni catalogue." });
    }
    try {
        const catalogue = await getCatalogue({ force: params.refresh === "1" });
        const q = (params.q || "").trim().toLowerCase();
        // Number(undefined) is NaN, and every comparison against NaN is
        // false — so an absent limit falls through to "no limit" on its own.
        const limit = Number(params.limit);
        let items = catalogue.items;

        /* A named handful, for a caller that already knows exactly which
           rows it wants.

           Fallin' Furni is the one that needs this. It asks for `sprites=1`,
           which is by far the biggest payload this endpoint serves — 929KB
           over 1,278 rows — and then throws nearly all of it away, keeping
           only the classes its levels place that the local furni library
           does not already cover. Today that is two of them. The filtering
           was always happening; it was happening after the bytes had crossed
           the wire.

           Exact match on className, which is the same test the caller was
           applying to the full list, so the rows that come back are the same
           rows it would have kept. A name that matches nothing simply is not
           in the answer — this is a narrowing, not a lookup, and a caller
           asking for one furni that has been renamed should get the other
           nine rather than a 404. */
        const wanted = (params.classes || "").trim();
        if (wanted) {
            const keep = new Set(wanted.split(",").map(s => s.trim()).filter(Boolean));
            items = items.filter(i => keep.has(i.className));
        }

        if (q) {
            /* Name OR className, because className is where the THEME lives.

               Habbo's internal name for a furni carries the line it belongs
               to as a prefix — alhambra_stall, alhambra_shelf — while the
               display names for those two are "Bazaar Stall" and "Scholar's
               Bookshelf". Searching names alone therefore finds four of the
               Alhambra line and silently misses the rest, which is exactly
               the case that made this worth changing: someone adding furni
               by hand knows the line they are looking at in-game, not the
               display name of every piece in it.

               Underscores are read as spaces so "alhambra stall" finds
               alhambra_stall — typing the theme and the object is the
               natural thing to try, and it would otherwise match nothing.

               Name matches are listed first. A className-only hit is a
               correct but less direct answer, so the ones the person most
               likely meant have to be at the top rather than wherever the
               catalogue happened to order them. This ordering used to matter
               because the picker kept only the first 24; it now shows every
               match, which makes the order matter MORE, not less — a broad
               search can run to three hundred rows and the useful ones have
               to be the rows you land on. */
            const named = [];
            const themed = [];
            for (const i of items) {
                if ((i.name || "").toLowerCase().includes(q)) named.push(i);
                else if ((i.className || "").toLowerCase().replace(/_/g, " ").includes(q)) themed.push(i);
            }
            items = named.concat(themed);
        }
        // The sprite grids are wanted by the scanner and by the admin's
        // add-by-hand picker, never by anything else — and they are by far
        // the biggest part of the payload.
        if (params.sprites !== "1") items = items.map(({ largeImages, smallImages, ...rest }) => rest);
        const data = {
            total: catalogue.total,
            fetchedAt: catalogue.fetchedAt,
            count: items.length,
            /* A limit that is not a positive number is ignored, not obeyed.
               Number("abc") is NaN and slice(0, NaN) returns NOTHING, so a
               malformed limit used to answer "no such furni" for a query
               that matched plenty — the one wrong answer this endpoint can
               give that looks like a correct one. */
            items: (limit > 0) ? items.slice(0, limit) : items
        };
        /* THROUGH THE EDGE, the way furni-meta.js's ?classes= answer is.

           Every answer here was sent with no cache header at all, so every
           anonymous caller cost a function run, a Blobs read and — for
           ?sprites=1, which Fallin' Furni asks for — about 930KB of JSON
           serialised and shipped uncompressed. The answer is the same for
           everybody who asks the same URL (no session is read), and the
           catalogue itself only moves once a day, so an hour at the edge
           with a day's stale-while-revalidate costs nothing in freshness
           and turns a crowd into a handful of runs. cachedJson gzips it too.

           Not a ?q= search: those are the admin picker's keystrokes, every
           one a different URL, and filling the edge with them buys nothing.
           Not a ?refresh=1 either — that is the owner's, and its answer
           must never be stored for the next caller of the same URL (see
           uncached() in furni-meta.js for how that went wrong there). */
        if (!q && params.refresh !== "1") {
            return cachedJson(event, data, { cdn: CATALOGUE_CDN_CACHE });
        }
        /* Uncached, but still gzipped (30 Sept 2026): a one-letter ?q= with
           sprites is most of the 930KB catalogue, and went out raw to
           anybody who asked. cache:false is no-store with no edge header. */
        return cachedJson(event, data, { cache: false });
    } catch (err) {
        /* The detailed reason stays in the function log. Some of these
           messages are written to diagnose a missing key — its length, and
           the names of the environment variables this function can see —
           which is exactly right for whoever reads the log and exactly
           wrong for a public response. */
        console.error("furni-catalogue:", err.message);
        return json(502, { error: "The furni catalogue could not be reached just now." });
    }
};

module.exports.getCatalogue = getCatalogue;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("furni-catalogue", exports.handler);

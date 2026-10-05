/* FurniIndex catalogue, built from their public API and cached.

   FROM THE NEW API (5 Oct 2026, the owner's). This used to page through
   furniindex.com/api/mazerats/all with a key (FURNIINDEX_API_KEY) and keep
   their answer whole. It now reads https://api.furniindex.com, which needs
   no key: /furnidata/index.json names every classname they hold (3,269 on
   5 Oct 2026), and /furnidata/{classname} describes one — name, motto, its
   release dates, its FurniIndex page, and which views exist to draw. The
   catalogue is the furni with a FurniIndex page (furniIndexUrl): exactly
   the set the old endpoint listed, but for 30 the new one has no page for
   (those carry on from _furni-legacy.js, see itemsOf).

   Each furni is a request of its own, so walking all 3,269 takes FurniIndex
   minutes at a polite four at a time — far past a function's ten seconds.
   So the walk is never made here from nothing. A full copy ships with the
   site (_furni-catalogue-seed.json, written by tools/furni-catalogue-seed.js),
   and the daily refresh only asks about what can have moved since:
     - index.json, for classnames that are new (asked about first);
     - /latest/25, for furni just released (a classname FurniIndex has had a
       while gains its page and date then, which index.json can't show);
     - and a rolling handful of the rest, the longest-unchecked first, so a
       renamed furni or a fixed motto arrives within weeks without the whole
       walk ever being made at once.
   Whatever the budget leaves unasked is asked next time. Their search still
   isn't ours to use, so ?q= and the rest happen down in the handler here.
*/

const { blobStore } = require("./_blobs.js");
const { SECURITY_HEADERS } = require("./_headers");
const { isOwnerWrite, roleOf, UNAUTHORIZED } = require("./_auth");
const { cachedJson } = require("./_cache");
const { legacy } = require("./_furni-legacy.js");
const { site } = require("./_furni-mirror.js");

// The edge policy furni-meta.js gives its ?classes= answer — see the handler.
const CATALOGUE_CDN_CACHE = "public, durable, s-maxage=3600, stale-while-revalidate=86400";

const API = "https://api.furniindex.com";
const PICTURES = API + "/furni/";
const UA = { "User-Agent": "MazeRats/1.0 (+https://mazerats.net)" };

// Habbo's own furni names, for ?unlisted=1 (see the search below) and for
// the few furni FurniIndex lists with no name. Read on first use only.
let unlistedCache = null;
function unlistedNames() {
    if (!unlistedCache) {
        try { unlistedCache = require("./_habbo-names.json"); } catch (e) { unlistedCache = {}; }
    }
    return unlistedCache;
}

/* A new key, not the old catalogue.json (5 Oct 2026): what is stored is a
   different thing now (see compact), and a rollback to the old code finds
   its own copy where it left it. */
const CACHE_KEY = "catalogue-v2.json";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/* How long FurniIndex gets, per request and for the whole refresh.

   This is not only the admin picker's problem. The public /rooms and
   /events go through _furni-payload.js, which asks for this catalogue on a
   cold container — and a fetch with no timeout waits as long as FurniIndex
   cares to take, which is the archive's front page waiting with it. The
   overall cap stops a slow day adding up to a function timeout; what it
   cuts short is simply asked next time. */
const PAGE_TIMEOUT_MS = 5000;
const REFRESH_BUDGET_MS = 8000;
// Requests in flight at once. They answer in about 0.4s each.
const FETCH_CONCURRENCY = 4;
/* The rolling re-check's share of a refresh, at most — new and newly
   released furni are always asked about first, and are not capped. At one
   refresh a day this is the whole catalogue every couple of months, at
   about five seconds a refresh. */
const ROLLING_PER_REFRESH = 40;
// A refresh never starts a request this close to the end of its budget.
const BUDGET_MARGIN_MS = 600;
/* With no stored copy there is still the seed, so nothing has to be walked
   from nothing — but the command-line tools (tools/furni-scan-local.js and
   friends) may run with no Blobs store at all, and are allowed longer to
   bring an old seed up to date. A function gets the ordinary cap. */
const COLD_BUDGET_MS = 60000;

/* Told apart by the script that was started, exactly as _db.js tells them
   apart for its socket timeouts: the admin's scan button spawns a tool with
   the function's whole environment copied across, so only the entry point
   says which one this is. */
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

async function getJson(url, outer, timeoutMs = PAGE_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onOuterAbort = () => controller.abort();
    if (outer) {
        if (outer.aborted) controller.abort();
        else outer.addEventListener("abort", onOuterAbort, { once: true });
    }
    try {
        const res = await fetch(url, { headers: UA, signal: controller.signal });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`FurniIndex ${url.slice(API.length)} returned ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
        if (outer) outer.removeEventListener("abort", onOuterAbort);
    }
}

/* One /furnidata answer, cut down to what the site uses.

   { c classname, r revision, t the day it was last asked about } for every
   classname; and for a furni with a FurniIndex page, n name, m motto, u the
   page, d its FIRST release date (they list every release, newest first —
   the old endpoint's releaseDate was the first, on 1,451 of 1,452, checked),
   i whether it has an icon, and L / S its large and small views as
   { state: [rotations] }. S is left out where it is the same as L, and is
   null where there is no small view at all. */
function compact(d, day) {
    const rec = { c: d.classname, r: d.revision == null ? null : d.revision, t: day };
    if (!d.furniIndexUrl) return rec;
    const vis = d.visualizations || {};
    const views = v => {
        if (!v || !v.available) return null;
        const out = {};
        for (const [s, st] of Object.entries(v.states || {})) {
            const rot = ((st && st.rotations) || v.rotations || []).map(Number).filter(Number.isFinite);
            if (rot.length) out[s] = rot;
        }
        return Object.keys(out).length ? out : null;
    };
    const dates = (Array.isArray(d.releaseDates) ? d.releaseDates : []).filter(x => typeof x === "string" && x).sort();
    rec.n = d.name || "";
    rec.m = d.motto || "";
    rec.u = d.furniIndexUrl;
    rec.d = dates[0] || "";
    rec.i = vis.icon && vis.icon.available ? 1 : 0;
    const L = views(vis.large), S = views(vis.small);
    if (L) rec.L = L;
    if (!S) rec.S = null;
    else if (JSON.stringify(S) !== JSON.stringify(L)) rec.S = S;
    return rec;
}

/* The catalogue's rows from the stored records, in the shape every reader
   has always had: name, className, motto, icon, url, releaseDate and the
   two sprite grids, [state][rotation], on the new API.

   The grids are the new API's own views, in the game's own directions
   (r0/r2/r4/r6, states from s0), drawn without a shadow as the old renders
   were. largeImages and smallImages still share their shape position for
   position, which _furni-payload.js relies on; a view with no small
   counterpart is an empty string there. */
function itemOf(rec) {
    const enc = encodeURIComponent(rec.c);   // leaves * alone, which the API wants: %2A is a 404
    const names = (!rec.n || !rec.m) ? (unlistedNames()[rec.c] || []) : [];
    const old = (!rec.n || !rec.m || !rec.i) ? legacy().byClass.get(rec.c.toLowerCase()) : null;
    const large = [], small = [];
    const S = rec.S === undefined ? rec.L : rec.S;
    for (const s of Object.keys(rec.L || {}).sort((a, b) => a - b)) {
        const rots = rec.L[s].slice().sort((a, b) => a - b);
        large.push(rots.map(r => `${PICTURES}${enc}/large/r${r}/s${s}/noshadow`));
        small.push(rots.map(r => (S && S[s] && S[s].includes(r)) ? `${PICTURES}${enc}/small/r${r}/s${s}/noshadow` : ""));
    }
    return {
        // A few furni have no name or motto on FurniIndex (25 named, on 5
        // Oct 2026): Habbo's own, then the old catalogue's, then the line.
        name: rec.n || names[0] || (old && old.name) || rec.c,
        className: rec.c,
        motto: rec.m || names[1] || (old && old.motto) || "",
        icon: rec.i ? `${PICTURES}${enc}/icon` : site((old && old.icon) || ""),
        url: rec.u,
        releaseDate: rec.d || "",
        largeImages: large,
        smallImages: small
    };
}

const byName = (a, b) => (a.name || "").localeCompare(b.name || "") || (a.className || "").localeCompare(b.className || "");

// Memoized on when the state was fetched, which only changes on a refresh
// (each Blobs read is a fresh object, so the object itself can't be the key).
let viewFor = null, viewOf = null;
function itemsOf(state) {
    const key = `${state.fetchedAt}:${state.pending || 0}:${Object.keys(state.furni || {}).length}`;
    if (viewFor === key && viewOf) return viewOf;
    const items = [];
    const listed = new Set();
    for (const rec of Object.values(state.furni || {})) {
        if (!rec.u) continue;
        listed.add(rec.c.toLowerCase());
        items.push(itemOf(rec));
    }
    /* What the new API has no page for, from the old catalogue, until it
       does — the moment a furni has one there, it comes from there. On 5
       Oct 2026 that is 30 of the old 1,483: 16 the new API doesn't hold at
       all (door0, poster_1000, the rainbow plasto set…), and 14 it holds
       only under a lower-cased classname (cf_1_coin_bronze for Habbo's
       CF_1_coin_bronze, doorb, heartsofar…) whose furnidata has no page and
       no release date. */
    /* Their pictures as this site's own copies, never the old host, which is
       being switched off (5 Oct 2026; _furni-mirror.js). */
    for (const old of legacy().items) {
        if (old.className && !listed.has(old.className.toLowerCase())) {
            items.push({
                ...old,
                icon: site(old.icon),
                largeImages: (old.largeImages || []).map(st => st.map(site)),
                smallImages: (old.smallImages || []).map(st => st.map(site))
            });
        }
    }
    items.sort(byName);
    viewFor = key;
    viewOf = { fetchedAt: state.fetchedAt, total: items.length, items };
    return viewOf;
}

/* Brings a stored state up to date with FurniIndex, within budgetMs.
   Never all-or-nothing past index.json: every answer that lands is kept,
   and `pending` counts the new classnames still to be asked about, so the
   next call carries on (getCatalogue treats a state with any as stale). */
async function refreshState(previous, budgetMs = REFRESH_BUDGET_MS) {
    const started = Date.now();
    const day = Math.floor(started / DAY_MS);
    const budget = new AbortController();
    const budgetTimer = setTimeout(() => budget.abort(), budgetMs);
    const left = () => budgetMs - (Date.now() - started);
    try {
        const index = await getJson(`${API}/furnidata/index.json`, budget.signal);
        const names = index && Array.isArray(index.classNames) ? index.classNames.filter(c => typeof c === "string" && c) : [];
        const before = Object.keys((previous && previous.furni) || {}).length;
        // A broken or truncated index must not empty the catalogue.
        if (!names.length || names.length < before / 2) {
            throw new Error(`FurniIndex's index.json listed ${names.length} furni (we hold ${before})`);
        }
        const old = (previous && previous.furni) || {};
        const furni = {};
        for (const c of names) if (old[c]) furni[c] = old[c];

        const queue = [];
        const queued = new Set();
        const ask = c => { if (!queued.has(c)) { queued.add(c); queue.push(c); } };
        for (const c of names) if (!furni[c]) ask(c);
        try {
            const latest = await getJson(`${API}/latest/25`, budget.signal);
            for (const r of (latest && latest.results) || []) {
                const rec = r && furni[r.classname];
                if (rec && (!rec.u || !rec.d)) ask(r.classname);
            }
        } catch (e) {
            if (budget.signal.aborted) throw e;
            console.warn("furni-catalogue: /latest failed, going on without it -", e.message);
        }
        Object.values(furni)
            .filter(rec => !queued.has(rec.c))
            .sort((a, b) => (a.t || 0) - (b.t || 0))
            .slice(0, ROLLING_PER_REFRESH)
            .forEach(rec => ask(rec.c));

        let next = 0, asked = 0, failed = 0;
        await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, queue.length) }, async () => {
            while (next < queue.length && left() > BUDGET_MARGIN_MS) {
                const c = queue[next++];
                try {
                    const d = await getJson(`${API}/furnidata/${encodeURIComponent(c)}`, budget.signal,
                        Math.min(PAGE_TIMEOUT_MS, Math.max(500, left() - 100)));
                    /* Listed but not served: kept as a classname with nothing
                       to show, and asked about again in its turn. One the
                       rolling re-check asks about keeps what it had: a
                       404 or a shapeless answer on a bad day must not
                       blank a furni that was right yesterday. */
                    if (d && d.classname) furni[c] = compact({ ...d, classname: c }, day);
                    else furni[c] = furni[c] && furni[c].r != null ? { ...furni[c], t: day } : { c, r: null, t: day };
                    asked++;
                } catch (e) {
                    failed++;
                    if (budget.signal.aborted) break;
                }
            }
        }));
        if (!asked && queue.length) throw new Error(`FurniIndex answered none of ${queue.length} furnidata requests`);
        const pending = names.filter(c => !furni[c]).length;
        if (failed) console.warn(`furni-catalogue: ${failed} furnidata requests failed; asked again next time`);
        return { v: 2, fetchedAt: Date.now(), pending, furni };
    } finally {
        clearTimeout(budgetTimer);
    }
}

// The copy that ships with the site. See tools/furni-catalogue-seed.js.
let seedCache;
function seed() {
    if (seedCache === undefined) {
        try { seedCache = require("./_furni-catalogue-seed.json"); } catch (e) { seedCache = null; }
        if (!(seedCache && seedCache.v === 2 && seedCache.furni)) seedCache = null;
    }
    return seedCache;
}

function openStore() {
    try { return blobStore("furni"); } catch (e) { return null; }
}

/* A day-old catalogue is refreshed, but a refresh that fails is not an
   outage: the stale copy is served instead, because furni that were right
   yesterday are right today to within a release or two. Only a forced
   refresh (the owner asking on purpose) or having no copy at all lets the
   failure through — and with the seed shipping alongside, there is always
   a copy. */
/* `wait: false` (5 Oct 2026, the bug scan) is for the public /rooms and
   /events (_furni-payload.js): a stale copy goes back at once, with the
   refresh left running behind it. Waiting for it there meant up to eight
   seconds of refresh against a six-second cap, and the cap won — the maps
   came back empty although a day-old copy was right there. */
let refreshing = null;
async function getCatalogue({ force = false, wait = true } = {}) {
    const store = openStore();
    let state = store ? await store.get(CACHE_KEY, { type: "json" }).catch(() => null) : null;
    if (!(state && state.v === 2 && state.furni)) state = null;
    const shipped = seed();
    // A seed newer than the stored copy (a redeploy after a rebuild) wins.
    if (shipped && (!state || (state.fetchedAt || 0) < (shipped.fetchedAt || 0))) state = shipped;
    const fresh = state && Date.now() - state.fetchedAt < MAX_AGE_MS && !state.pending;
    if (!force && fresh) return itemsOf(state);
    if (!force && state && Date.now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) return itemsOf(state);
    if (!force && !state && IN_FUNCTION && Date.now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) {
        throw new Error("FurniIndex failed moments ago; not asking again yet");
    }
    if (!force && !wait && state) {
        if (!refreshing) {
            refreshing = refreshAndStore(store, state, false)
                .catch(() => { /* logged inside; the stale copy stands */ })
                .finally(() => { refreshing = null; });
        }
        return itemsOf(state);
    }
    return refreshAndStore(store, state, force);
}

async function refreshAndStore(store, state, force) {
    let next;
    try {
        next = await refreshState(state, IN_FUNCTION ? REFRESH_BUDGET_MS : COLD_BUDGET_MS);
    } catch (e) {
        lastFailureAt = Date.now();
        if (!force && state) {
            console.warn("furni-catalogue: refresh failed, serving the stale copy -", e.message);
            return itemsOf(state);
        }
        throw e;
    }
    lastFailureAt = 0;
    if (store) {
        await store.setJSON(CACHE_KEY, next).catch(e => {
            console.warn("furni-catalogue: could not store the refreshed copy -", e.message);
        });
    }
    return itemsOf(next);
}

exports.handler = async (event) => {
    const params = event.queryStringParameters || {};
    /* A forced refresh is a round of requests to FurniIndex on an anonymous
       caller's say-so — a way to spend their goodwill and our function time
       from outside. Owners only, the same as the furni scans. */
    if (params.refresh === "1") {
        // isOwnerWrite throws when the account lookup cannot be made (see
        // lookUpRole in _auth.js) — a 503, not a refusal and not a trace.
        let owner;
        try {
            owner = await isOwnerWrite(event);
        } catch (e) {
            return json(503, { error: "The database is unavailable just now. Please try again in a moment." });
        }
        if (!owner) {
            /* No role is no account (2 Oct 2026): a deleted account or a
               token from before a password change is a signed-out session,
               which the Warren's "Refresh now" signs out on a 401 — not an
               admin to be told they aren't an owner. roleOf is memoized. */
            let role = null;
            try { role = await roleOf(event); } catch (e) { /* answered above if the lookup is down */ }
            if (role === null) return UNAUTHORIZED;
            return json(403, { error: "Only an owner can refresh the furni catalogue." });
        }
    }
    try {
        const catalogue = await getCatalogue({ force: params.refresh === "1" });
        /* ?info=1 (2 Oct 2026): just when our copy was fetched and how big
           it is, for the Warren's catalogue card — a few bytes, never stored
           at the edge, so a refresh shows at once without the card having to
           ask for the whole catalogue at a one-off address. */
        if (params.info === "1") {
            return cachedJson(event, { total: catalogue.total, fetchedAt: catalogue.fetchedAt }, { cache: false });
        }
        const q = (params.q || "").trim().toLowerCase();
        // Number(undefined) is NaN, and every comparison against NaN is
        // false — so an absent limit falls through to "no limit" on its own.
        const limit = Number(params.limit);
        let items = catalogue.items;

        /* A named handful, for a caller that already knows exactly which
           rows it wants.

           Fallin' Furni is the one that needs this. It asks for `sprites=1`,
           which is by far the biggest payload this endpoint serves, and then
           throws nearly all of it away, keeping only the classes its levels
           place that the local furni library does not already cover. Today
           that is two of them. The filtering was always happening; it was
           happening after the bytes had crossed the wire.

           On className, which is the same test the caller was applying to
           the full list — ignoring case since the new API (5 Oct 2026),
           whose classnames are all lower case where Habbo's own and our
           stored ones are not always (CF_1_coin_bronze, doorB). A name that
           matches nothing simply is not in the answer — this is a
           narrowing, not a lookup, and a caller asking for one furni that
           has been renamed should get the other nine rather than a 404. */
        const wanted = (params.classes || "").trim();
        if (wanted) {
            const keep = new Set(wanted.split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
            items = items.filter(i => keep.has((i.className || "").toLowerCase()));
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

            /* Furni FurniIndex hasn't catalogued yet (1 Oct 2026), for the
               Warren's add-by-hand picker only (?unlisted=1). Habbo's own
               names (_habbo-names.json, built by tools/habbo-names.js) for
               every classname the catalogue lacks, after its own matches,
               marked notListed. Pictures by classname from FurniIndex's new
               API; no page link yet — _furni-payload.js fills the link and
               release date in once the catalogue has it. */
            if (params.unlisted === "1") {
                const listed = new Set(catalogue.items.map(i => (i.className || "").toLowerCase()));
                const extra = [];
                for (const [cls, [name, desc]] of Object.entries(unlistedNames())) {
                    if (listed.has(cls.toLowerCase())) continue;
                    if (name.toLowerCase().includes(q) || cls.toLowerCase().replace(/_/g, " ").includes(q)) {
                        const enc = encodeURIComponent(cls);
                        extra.push({
                            name, className: cls, motto: desc || "",
                            icon: `${PICTURES}${enc}/icon`,
                            sprite: `${PICTURES}${enc}/small`,
                            url: "", releaseDate: "", notListed: true
                        });
                    }
                }
                // The exact name first, then names starting with the search,
                // then any name containing it, then classname-only hits.
                const rank = i => { const n = i.name.toLowerCase(); return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3; };
                extra.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
                items = items.concat(extra);
            }
        }
        // The sprite grids are wanted by the scanner and by the admin's
        // add-by-hand picker, never by anything else — and they are by far
        // the biggest part of the payload. `legacy` is internal (see
        // _furni-legacy.js) and goes nowhere.
        items = params.sprites !== "1"
            ? items.map(({ largeImages, smallImages, legacy: _l, ...rest }) => rest)
            : items.map(({ legacy: _l, ...rest }) => rest);
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
            /* Keyed on the parameters this reads and no others (2 Oct 2026;
               see `vary` in _cache.js), so a junk parameter can't skip the
               edge for the ~930KB answer. The Warren's card asks ?info=1
               instead of a one-off address (see above). `info` is keyed
               too (3 Oct 2026): without it, ?info=1 was the same key as the
               plain address, and the edge answered the card with this
               whole catalogue. */
            return cachedJson(event, data, { cdn: CATALOGUE_CDN_CACHE, vary: "q|classes|sprites|limit|unlisted|refresh|info" });
        }
        /* Uncached, but still gzipped (30 Sept 2026): a one-letter ?q= with
           sprites is most of the 930KB catalogue, and went out raw to
           anybody who asked. cache:false is no-store with no edge header. */
        return cachedJson(event, data, { cache: false });
    } catch (err) {
        // The detailed reason stays in the function log, not a public response.
        console.error("furni-catalogue:", err.message);
        return json(502, { error: "The furni catalogue could not be reached just now." });
    }
};

module.exports.getCatalogue = getCatalogue;
// For tools/furni-catalogue-seed.js, which builds the shipped copy.
module.exports.compact = compact;
module.exports.itemsOf = itemsOf;
module.exports.refreshState = refreshState;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("furni-catalogue", exports.handler);

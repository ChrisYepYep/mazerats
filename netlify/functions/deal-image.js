/* /.netlify/functions/deal-image — the daily games' pictures, at addresses
   that do not give the answer away.

   GET ?g=<game>&d=<day>&r=<round>&t=<tile>&s=<sig>

   A deal used to hand the page each picture's stored reference, and a
   stored reference says which maze a picture belongs to (see "the picture
   addresses" in _deal.js, which signs the addresses this answers). Now the
   page is handed one of these instead, and this function:

     1. checks the day is one whose pictures may be shown (servable, below),
        before anything else is read;
     2. reads the day's STORED deal — the same document and the same memo
        _deal.js's dealFor uses, and never deals a day that is not stored;
     3. finds the picture the address names, and checks the signature was
        made for exactly that picture;
     4. fetches the picture's bytes itself, server side, from wherever the
        reference points (the image function, a relative assets/ path on
        the site, or an http(s) address), and answers with them.

   Every refusal is a 404 with no-store, whichever check failed: a caller
   probing addresses learns nothing about which part was wrong, and a
   refusal is never cached where a later, genuine request would meet it.

   ----------------------------------------------------------------------
   SAME ORIGIN, SO NOTHING CHANGES FOR THE GAMES

   The answer comes from the site's own origin, so an <img> of it is
   same-origin and Guess the Maze's canvas is never tainted: its crop pass
   reads pixels with getImageData exactly as it did when the picture came
   through /.netlify/images from the image function. Guess still asks for
   the picture through the image CDN (imgCdn in js/site.js), with this
   address as the source, as it did with the image function's; Odd One Out
   still uses the address as a plain src.

   ----------------------------------------------------------------------
   CACHED HARD, AND WHY THAT IS SAFE HERE

   The address is per game, day, round and tile, signed over the stored
   picture reference, so the bytes behind one address can never change: a
   corrected deal gives the corrected tile a new address (see _deal.js).
   So it is public and immutable, for the browser and for the edge — every
   player of the day is asking for the same twenty-five addresses, and the
   edge answering them is what keeps this from being a function run and a
   picture fetch per tile per player.

   Three days rather than a year. The address is only ever handed out while
   its day is open, and only asked for while that day can still be played or
   looked back on (servable, below); three days covers that with room to
   spare, and a shorter life means a picture taken down from the archive does
   not live on at the edge behind an address nobody is using any more. The
   image function keeps its own, shorter edge life for the same reason (see
   PUBLIC_IMAGE_HEADERS in image.js).

   ----------------------------------------------------------------------
   THE SIZE LIMIT

   A function's answer can be at most 6MB, and base64 makes bytes a third
   bigger, so a picture over MAX_DIRECT_BYTES is fetched again through the
   site's image CDN at a bounded width (CDN_WIDTH) and that is served
   instead. The archive's pictures are 100–750KB and the largest uploads
   about 3MB, so this is a guard, not a path anybody normally takes. An
   http(s) picture that big from somewhere else has no CDN route (the image
   CDN only takes remote sources it has been told about) and is refused. */
const { getDb } = require("./_db");
const { headersFor } = require("./_headers");
const { imageUrl } = require("./_url");
const { dayClosesAt } = require("./_daily");
const deals = require("./_deal");

// The games with pictures, and how many a round has: four tiles, or one.
const GAMES = { odd: 4, guess: 1 };
const DAY_MS = 24 * 60 * 60 * 1000;

/* How long after a day has closed its pictures are still served: two days,
   the same span a finished day can still be filed in (LATE FILING in
   daily-scores.js, Daily.fileable in js/daily.js — both bounded by the
   daily_starts row living two days, _speed.js). A results card reopened
   the morning after still has its pictures behind it, and a day nobody can
   do anything with any more is not served at all. */
const AFTER_CLOSE_MS = 2 * DAY_MS;

/* The picture's cache life, browser and edge: see CACHED HARD above. */
const LIFE_S = 3 * 24 * 60 * 60;
const IMAGE_HEADERS = {
    "Cache-Control": `public, max-age=${LIFE_S}, immutable`,
    "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${LIFE_S}, immutable`
};

/* A picture this big or smaller is served as it is; bigger goes through the
   image CDN (see THE SIZE LIMIT). 4MB is 5.33MB in base64, leaving room for
   the headers under the 6MB ceiling. */
const MAX_DIRECT_BYTES = 4 * 1024 * 1024;
const CDN_WIDTH = 1200;
const FETCH_TIMEOUT_MS = 8000;

const refuse = (statusCode, text) => ({
    statusCode,
    headers: headersFor("text/plain; charset=utf-8", { "Cache-Control": "no-store" }),
    body: text
});

/* Whether a day's pictures may be served at `now`: never before the day
   has begun — so tomorrow's pictures cannot be had early, whatever address
   is presented — and not once AFTER_CLOSE_MS has passed since the day
   closed (dayClosesAt: its midnight plus the grace). Pure. */
function servable(day, now) {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const begins = Date.parse(day + "T00:00:00Z");
    const closes = dayClosesAt(day);
    if (!Number.isFinite(begins) || !Number.isFinite(closes)) return false;
    // A real calendar day, not only the shape: "2026-02-31" parses as March.
    if (new Date(begins).toISOString().slice(0, 10) !== day) return false;
    return now >= begins && now <= closes + AFTER_CLOSE_MS;
}

/* The address's fields, checked for shape, or null. Numbers as the deal
   wrote them: plain non-negative integers, nothing Number() would stretch
   a string into. */
function readAddress(q) {
    const p = q || {};
    const game = String(p.g || "");
    if (!Object.prototype.hasOwnProperty.call(GAMES, game)) return null;
    const day = String(p.d || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const int = v => (typeof v === "string" && /^\d{1,2}$/.test(v) ? Number(v) : NaN);
    const round = int(p.r), tile = int(p.t);
    if (!Number.isInteger(round) || !Number.isInteger(tile) || tile >= GAMES[game]) return null;
    const sig = String(p.s || "");
    if (!/^[A-Za-z0-9_-]{22}$/.test(sig)) return null;
    return { game, day, round, tile, sig };
}

/* Where the site is, for fetching a picture off it. From the deploy's own
   configuration, never from the request (whose Host a caller writes — see
   originOf in share.js). The production site's own address in production,
   so the fetch meets the same edge cache visitors fill; the deploy's own
   address anywhere else, so a deploy preview reads its own assets. */
const SITE_FALLBACK = "https://mazerats.net";
function siteBase() {
    const env = process.env;
    const base = env.CONTEXT === "production" ? env.URL : (env.DEPLOY_URL || env.URL);
    return String(base || SITE_FALLBACK).replace(/\/+$/, "");
}

/* One GET with a timeout, answering { bytes, type } for an image, or null
   for anything else — a failure, a non-image, nothing at all — or "big"
   for an image over `limit`, without downloading the body when the
   header already says so. */
async function grab(url, fetchImpl, limit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetchImpl(url, {
            headers: { "User-Agent": "mazerats-deal-image", Accept: "image/*" },
            signal: controller.signal
        });
        if (!res || !res.ok) return null;
        const type = String((res.headers && res.headers.get && res.headers.get("content-type")) || "").split(";")[0].trim().toLowerCase();
        // Only ever an image: whatever else a reference might one day point
        // at is not this function's to pass on under the site's own origin.
        if (!/^image\/[a-z0-9.+-]+$/.test(type)) return null;
        const declared = Number(res.headers.get("content-length"));
        if (limit && Number.isFinite(declared) && declared > limit) return "big";
        const bytes = Buffer.from(await res.arrayBuffer());
        if (limit && bytes.length > limit) return "big";
        return { bytes, type };
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/* The picture behind a stored reference: as it is when it fits, through
   the image CDN at CDN_WIDTH when it does not (see THE SIZE LIMIT). null
   when it cannot be had. `fetchImpl` is the global fetch except in the
   tests. */
async function fetchPicture(ref, fetchImpl) {
    const base = siteBase();
    const url = imageUrl(base, ref);
    if (!/^https?:\/\//i.test(url)) return null;
    const direct = await grab(url, fetchImpl, MAX_DIRECT_BYTES);
    if (direct && direct !== "big") return direct;
    if (direct !== "big") return null;
    // Too big to send as it is. Only a picture on this site can go through
    // the site's image CDN; somebody else's cannot.
    if (/^https?:/i.test(ref)) return null;
    const qs = new URLSearchParams({ url: ref, w: String(CDN_WIDTH), q: "85" });
    const smaller = await grab(`${base}/.netlify/images?${qs.toString()}`, fetchImpl, MAX_DIRECT_BYTES);
    return smaller && smaller !== "big" ? smaller : null;
}

/* The whole request, with its collaborators passed in so the tests can run
   it against a fake database, a stub fetch and a fixed clock. */
async function serve(event, { db, fetchImpl, now }) {
    if (event.httpMethod !== "GET") return refuse(405, "Method not allowed");
    const addr = readAddress(event.queryStringParameters);
    if (!addr) return refuse(404, "Not found");
    // The clock first, before the database: a day outside the window costs
    // nothing to refuse, and tomorrow is never looked up at all.
    if (!servable(addr.day, now)) return refuse(404, "Not found");

    let database = db;
    try {
        if (!database) database = await getDb();
    } catch (e) {
        return refuse(503, "Picture unavailable");
    }
    let deal;
    try {
        deal = await deals.storedDeal(database, addr.game, addr.day);
    } catch (e) {
        console.error("deal-image: could not read the day's deal", e);
        return refuse(503, "Picture unavailable");
    }
    const ref = deal ? deals.imageRefAt(deal, addr.game, addr.round, addr.tile) : null;
    if (!ref || !deals.imageSigMatches(addr.game, addr.day, addr.round, addr.tile, ref, addr.sig)) {
        return refuse(404, "Not found");
    }

    const picture = await fetchPicture(ref, fetchImpl);
    /* 502, no-store: the address was right and the picture behind it would
       not come. The games already try a failed picture again by themselves
       (watchTiles in js/oddoneout.js, prepareRound in js/guess.js), and a
       refusal left uncached is what lets that retry find it once it is
       back. */
    if (!picture) return refuse(502, "Picture unavailable");

    return {
        statusCode: 200,
        headers: headersFor(picture.type, IMAGE_HEADERS),
        body: picture.bytes.toString("base64"),
        isBase64Encoded: true
    };
}

exports.handler = async (event) => serve(event, { fetchImpl: fetch, now: Date.now() });

// For the tests.
exports.serve = serve;
exports.servable = servable;
exports.readAddress = readAddress;
exports.fetchPicture = fetchPicture;
exports.MAX_DIRECT_BYTES = MAX_DIRECT_BYTES;
exports.AFTER_CLOSE_MS = AFTER_CLOSE_MS;

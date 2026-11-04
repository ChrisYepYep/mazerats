/* /.netlify/functions/deal-image — the daily games' pictures, at addresses
   that do not give the answer away.

   GET ?g=<game>&d=<day>&r=<round>&t=<tile>[&v=<view>]&s=<sig>

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
     4. fetches the picture itself, server side, through the site's image
        CDN at the ONE fixed size, shape and format its game uses (see ONE
        SIZE PER GAME, below), and answers with that — never the archive's
        original bytes.

   Every refusal is a 404 with no-store, whichever check failed: a caller
   probing addresses learns nothing about which part was wrong, and a
   refusal is never cached where a later, genuine request would meet it.

   ----------------------------------------------------------------------
   SAME ORIGIN, SO NOTHING CHANGES FOR THE GAMES

   The answer comes from the site's own origin, so an <img> of it is
   same-origin and Guess the Maze's canvas is never tainted. Both games now use the
   address as a plain src (28 Sept 2026): Guess used to wrap it in the image
   CDN again (imgCdn at w=900, aspect kept), and that second pass could only
   re-encode a picture already sized here — the CDN never enlarges — so it
   was dropped rather than left as a second place a size is decided.

   ----------------------------------------------------------------------
   ONE SIZE PER GAME (28 Sept 2026)

   This used to pass the archive's original bytes straight through, and a
   picture's pixel size is an answer too. Most mazes' screenshots were taken
   in one client window, so they share one size per maze: in about 59% of
   Odd One Out rounds the imposter was the only tile whose naturalWidth and
   naturalHeight differed from the other three — invisible on the page, which
   crops every tile square, and one line in the console. Guess the Maze went
   through the image CDN at w=900 with the aspect kept, and the aspect alone
   matched only the right name of the five in about 47% of rounds
   (scratchpad scan3/leak-sim.js, the real dealers over the live archive).

   So every picture now comes through the image CDN at one fixed output per
   game — width, height, fit=cover, format and quality all fixed (PICTURE,
   below) — whatever it was uploaded as. Every tile of a round, and every
   round of a day, is the same number of pixels on each side, so size and
   shape carry nothing; and the re-encode means the bytes are no longer the
   archive file's own, so a byte count cannot be matched against it either.

     Odd One Out  ODD_SIDE square, a centre crop. The page shows the tile
                  as a square (object-fit: cover, centred, then zoomed
                  towards its top right — .odd-tile img in style.css), so
                  serving the centre square leaves what is on screen exactly
                  as it was; the zoom is applied to the same pixels.
     Guess        GUESS_W x GUESS_H, 16:10, a centre crop. The archive's
                  screenshots run 1.47-1.98 wide to one high (median 1.57),
                  so 16:10 trims the least from most of them. The views are
                  cut from this frame (THE CROP, below); the room shown whole
                  at the end of a round is this 16:10 frame of it, a little
                  trimmed at the sides of the widest shots.

   WHY THESE NUMBERS. The image CDN never enlarges: asked for more pixels
   than the source has, it answers with the source's own size (checked on
   `netlify dev`, 28 Sept 2026: a 746x481 picture asked for 1200x750 cover
   came back 746x466, and fit=fill and fit=contain do no better). A size
   bigger than the archive's smallest picture would therefore put that
   picture — and every other picture from its maze, all the same size — back
   out on its own. The smallest dealable screenshots today are 707 wide and
   472 high, so the square is 450 and Guess's frame 704x440: every one of
   the archive's 541 room pictures makes both exactly (scan3/byimg.json).
   What that costs is resolution — a tile is still at least 1.4 source
   pixels per CSS pixel at its largest, and Guess's tightest crop is ~70
   source pixels blown up, where it was ~90 — which pixel art bears better
   than most pictures do.

   A picture uploaded later that is smaller than this still comes back
   smaller, and so would still stand out. That is checked (sizeOf, below)
   and said in the function log so it can be replaced, but the picture is
   served anyway: one round where a console could tell is a smaller harm
   than a round nobody can play all day.

   WHAT IS STILL NOT HIDDEN is what the picture shows. A served picture can
   be compared by eye, or pixel by pixel after the same CDN pass, with the
   public archive — see "the picture addresses" in _deal.js, which has
   always accepted that.

   ----------------------------------------------------------------------
   THE CROP (4 Nov 2026)

   Guess the Maze's views are cut here now, not in the browser, so a room
   still being guessed has nothing but its crop on the player's machine (ONLY
   THE CROP in _deal.js says when each address is handed out). An address with
   `v` (0, 1 or 2) answers that view: the square REVEAL says, around the centre
   chooseCentre finds, as a PNG holding those pixels and nothing else, not a
   picture with the rest hidden. Without `v` it is the whole picture, as above.

   NO PIXEL SOFTER. The source is the same fixed 704x440 frame through the
   image CDN, asked for as a PNG (fm=png), so the crop's pixels are exactly the
   CDN's and not the JPEG's approximation of them. It is sent as a lossless
   PNG, one pixel for one pixel, and js/guess.js blows it up with smoothing
   off, as it did the JPEG. Only the CDN's PNG can be read here (_png.js; the
   site has no JPEG decoder or image dependency), and it comes back 8-bit RGBA
   and not interlaced, checked against the live CDN on 4 Nov. Anything else is
   a 502, never the whole picture instead.

   WHAT IT COSTS. For a real room's 704x440 PNG, decoding, choosing the centre,
   cutting and encoding took 12ms all told on the dev machine, so the
   ten-second limit is spent on the CDN fetch (FETCH_TIMEOUT_MS, as for a whole
   picture) and not on this. Each address is the same for every player of the
   day and cached like any other (below), so a busy day runs three crops a
   room, twenty addresses a day with the whole pictures, not one per player.
   That room's views were 14KB, 40KB and 98KB, against 80KB for its whole JPEG:
   a first-view win costs less than it did, three views a little more.

   WHAT AN ADDRESS SAYS. The day, the round and the view, none of them news,
   and a signature that cannot be worked back to the picture or forward to a
   wider view. Where the crop falls is decided here and appears nowhere in it.

   ----------------------------------------------------------------------
   CACHED HARD, AND WHY THAT IS SAFE HERE

   The address is per game, day, round, tile and view, signed over the stored
   picture reference, so the bytes behind one address can never change: a
   corrected deal gives the corrected tile a new address (see _deal.js).
   So it is public and immutable, for the browser and for the edge — every
   player of the day is asking for the same addresses, and the edge answering
   them is what keeps this from being a function run and a picture fetch per
   tile per player.

   Three days rather than a year. The address is only ever handed out while
   its day is open, and only asked for while that day can still be played or
   looked back on (servable, below); three days covers that with room to
   spare, and a shorter life means a picture taken down from the archive does
   not live on at the edge behind an address nobody is using any more. The
   image function keeps its own, shorter edge life for the same reason (see
   PUBLIC_IMAGE_HEADERS in image.js).

   ----------------------------------------------------------------------
   THE SIZE LIMIT, AND PICTURES FROM ELSEWHERE

   A function's answer can be at most 6MB, and base64 makes bytes a third
   bigger, so anything the CDN answers over MAX_BYTES is refused. At the
   fixed sizes above a JPEG is well under 200KB, so this is a guard, not a
   path anybody takes; the CDN fetches the original itself, so however big
   the upload was never matters here.

   An http(s) reference to somebody else's site has no route through the
   image CDN (it only takes remote sources netlify.toml names, and this site
   names none), and passing its bytes through as they are is exactly the
   leak above, so it is refused (502). No room picture in the archive is one
   today: uploads live behind the image function and the originals under
   assets/. */
const { getDb } = require("./_db");
const { headersFor } = require("./_headers");
const { dayClosesAt, seededRandom } = require("./_daily");
const deals = require("./_deal");
const { decodePng, encodePng } = require("./_png");

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
    "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${LIFE_S}, immutable`,
    /* Keyed on the parameters readAddress reads and no others (2 Oct 2026,
       final scan; see `vary` in _cache.js), so `&x=<random>` on a signed
       address is the cached picture, not a deal read and a fresh fetch
       through the image CDN every time. */
    "Netlify-Vary": "query=g|d|r|t|v|s"
};

/* The one output each game's pictures are served at (see ONE SIZE PER
   GAME). JPEG always: fm fixes the format, where without it the CDN picks
   one from the browser's Accept header (share.js's previewImage met the
   same thing), and one format for everybody is one set of bytes per tile
   at the edge. */
const ODD_SIDE = 450;
const GUESS_W = 704, GUESS_H = 440;
const PICTURE = {
    odd: { w: ODD_SIDE, h: ODD_SIDE, q: 80 },
    guess: { w: GUESS_W, h: GUESS_H, q: 85 }
};

/* Nothing bigger than this is sent (see THE SIZE LIMIT). 4MB is 5.33MB in
   base64, leaving room for the headers under the 6MB ceiling. */
const MAX_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 7000;

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
    // A view is Guess the Maze's alone; no `v` is the whole picture.
    let view = null;
    if (p.v !== undefined) {
        view = int(p.v);
        if (game !== "guess" || !Number.isInteger(view) || view >= deals.CROP_VIEWS) return null;
    }
    return { game, day, round, tile, sig, view };
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

/* A JPEG's pixel size, read from its first frame header (SOF0-SOF15, less
   the three markers in that range that are not frames), or null for
   anything that is not a readable JPEG. Only the header is read: this is a
   check on what the CDN sent, not a decoder. Pure. */
function sizeOf(bytes) {
    const b = bytes;
    if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1];
        // Fill bytes, and the markers that carry no length.
        if (m === 0xff) { i++; continue; }
        if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        const len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
            return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        }
        if (len < 2) return null;
        i += 2 + len;
    }
    return null;
}

/* The picture behind a stored reference, for `game`: through the site's
   image CDN at that game's one fixed output (see ONE SIZE PER GAME), never
   as it is stored. null when it cannot be had — including a reference to
   somebody else's site, which has no CDN route (THE SIZE LIMIT). `fetchImpl`
   is the global fetch except in the tests. */
async function fetchPicture(ref, fetchImpl, game) {
    const out = PICTURE[game];
    if (!out || typeof ref !== "string" || !ref) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith("//")) {
        console.error("deal-image: a dealt picture is not on this site, so it cannot be served at a fixed size:", ref);
        return null;
    }
    const base = siteBase();
    const qs = new URLSearchParams({
        url: ref, w: String(out.w), h: String(out.h), fit: "cover", fm: "jpg", q: String(out.q)
    });
    const picture = await grab(`${base}/.netlify/images?${qs.toString()}`, fetchImpl, MAX_BYTES);
    if (!picture || picture === "big") return null;
    /* The CDN never enlarges (WHY THESE NUMBERS), so a picture smaller than
       the fixed output comes back smaller, and would stand out from the
       rest of its round. Served anyway — a round that will not load is the
       worse failure — but said, with the reference, so it can be replaced. */
    const got = sizeOf(picture.bytes);
    if (!got || got.w !== out.w || got.h !== out.h) {
        console.warn(`deal-image: ${ref} came back ${got ? got.w + "x" + got.h : "at an unreadable size"}, not ${out.w}x${out.h}; it is smaller than the ${game} pictures are served at, so its size stands out`);
    }
    return picture;
}

/* ---------- choosing where to cut ----------

   Moved from js/guess.js, which still explains the game; the reasoning is
   here now. Habbo room screenshots are a small isometric room floating on a
   large flat background, so a crop taken at random is very often a square of
   nothing. A candidate is scored on how much of it is not background (a
   floor: below 85% it scores nothing), how many distinct colours it holds and
   how much its brightness varies, and the best of forty is taken. Pure, and
   the same for the same pixels and seed, so all three views of a room share
   one centre whichever container cuts them. */

/* Each wrong guess widens the view around the same centre, so the reveal reads
   as stepping back from one spot rather than as being shown a different
   picture each time. The last is still about half the image, which is usually
   enough to place a room without simply giving it away. */
const REVEAL = [0.16, 0.28, 0.44];

// Generous, because Habbo's backgrounds are flat but its PNG edges are not: a
// pixel within this distance of the ground colour is ground.
const BG_TOLERANCE = 26;

/* The colour the picture sits on, learned rather than assumed: the most
   common of the four corners. */
function backgroundOf(data, w, h) {
    const at = (x, y) => {
        const i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
    };
    const corners = [at(2, 2), at(w - 3, 2), at(2, h - 3), at(w - 3, h - 3)];
    const tally = new Map();
    corners.forEach(c => {
        const k = c.join(",");
        tally.set(k, (tally.get(k) || 0) + 1);
    });
    let best = corners[0], bestN = 0;
    tally.forEach((n, k) => {
        if (n > bestN) { bestN = n; best = k.split(",").map(Number); }
    });
    return best;
}

function scoreCrop(data, w, bg, x0, y0, size) {
    const step = Math.max(1, Math.floor(size / 40));   // ~1600 samples at any size
    let samples = 0, solid = 0, sum = 0;
    const colours = new Set();
    const lums = [];
    for (let y = y0; y < y0 + size; y += step) {
        for (let x = x0; x < x0 + size; x += step) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            samples++;
            if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > BG_TOLERANCE) solid++;
            // Quantised, so two shades a hair apart are not two colours.
            colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
            const l = 0.299 * r + 0.587 * g + 0.114 * b;
            lums.push(l);
            sum += l;
        }
    }
    if (!samples) return 0;
    const solidFrac = solid / samples;
    if (solidFrac < 0.85) return 0;
    if (colours.size < 12) return 0;
    const mean = sum / lums.length;
    let dev = 0;
    for (const l of lums) dev += Math.abs(l - mean);
    const variance = (dev / lums.length) / 128;   // 0..~1
    return solidFrac * 0.3
        + Math.min(1, colours.size / 90) * 0.35
        + Math.min(1, variance) * 0.35;
}

/* Where to cut, in pixels: the centre of the best square, scored at the size
   the room OPENS at, since that is what most players make their first guess
   from. The picture's middle if it has nothing worth cropping, a room shot
   that is almost all background, which does happen. */
function chooseCentre(data, w, h, seed) {
    const middle = { x: w / 2, y: h / 2 };
    const size = Math.round(Math.min(w, h) * REVEAL[0]);
    if (size < 24) return middle;
    const bg = backgroundOf(data, w, h);
    const rand = seededRandom(seed >>> 0);
    let best = middle, bestScore = 0;
    for (let i = 0; i < 40; i++) {
        const x0 = Math.floor(rand() * (w - size));
        const y0 = Math.floor(rand() * (h - size));
        const s = scoreCrop(data, w, bg, x0, y0, size);
        if (s > bestScore) { bestScore = s; best = { x: x0 + size / 2, y: y0 + size / 2 }; }
    }
    return best;
}

/* One view's square out of a picture, as a PNG of those pixels alone. A view
   near an edge slides inward rather than running off the picture. See through
   pixels are laid on black first, as the CDN's JPEG of the whole picture does,
   so a view and the whole room agree. Pure: `png` is the CDN's PNG. */
function cutView(png, seed, view) {
    const { width: w, height: h, data } = decodePng(png);
    for (let i = 3; i < data.length; i += 4) {
        const a = data[i];
        if (a === 255) continue;
        data[i - 3] = Math.round(data[i - 3] * a / 255);
        data[i - 2] = Math.round(data[i - 2] * a / 255);
        data[i - 1] = Math.round(data[i - 1] * a / 255);
        data[i] = 255;
    }
    const centre = chooseCentre(data, w, h, seed);
    const size = Math.max(1, Math.round(Math.min(w, h) * REVEAL[view]));
    const x0 = Math.max(0, Math.min(w - size, Math.round(centre.x - size / 2)));
    const y0 = Math.max(0, Math.min(h - size, Math.round(centre.y - size / 2)));
    const out = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        const from = (y0 + y) * w * 4;
        data.copy(out, y * size * 4, from + x0 * 4, from + (x0 + size) * 4);
    }
    return encodePng(size, size, out);
}

/* One view of a stored picture, cut from the CDN's lossless copy of the frame
   the whole picture is served at (THE CROP). null when it cannot be had, and
   never the whole picture in its place. */
async function fetchView(ref, fetchImpl, seed, view) {
    const out = PICTURE.guess;
    if (typeof ref !== "string" || !ref || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith("//")) return null;
    const qs = new URLSearchParams({ url: ref, w: String(out.w), h: String(out.h), fit: "cover", fm: "png" });
    const source = await grab(`${siteBase()}/.netlify/images?${qs.toString()}`, fetchImpl, MAX_BYTES);
    if (!source || source === "big") return null;
    try {
        return { bytes: cutView(source.bytes, seed, view), type: "image/png" };
    } catch (e) {
        console.error("deal-image: could not cut a view of", ref, e);
        return null;
    }
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
    if (!ref || !deals.imageSigMatches(addr.game, addr.day, addr.round, addr.tile, ref, addr.sig, addr.view)) {
        return refuse(404, "Not found");
    }

    const picture = addr.view === null
        ? await fetchPicture(ref, fetchImpl, addr.game)
        : await fetchView(ref, fetchImpl, deal.rounds[addr.round].crop, addr.view);
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
exports.fetchView = fetchView;
exports.cutView = cutView;
exports.chooseCentre = chooseCentre;
exports.REVEAL = REVEAL;
exports.sizeOf = sizeOf;
exports.PICTURE = PICTURE;
exports.MAX_BYTES = MAX_BYTES;
exports.AFTER_CLOSE_MS = AFTER_CLOSE_MS;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("deal-image", exports.handler);

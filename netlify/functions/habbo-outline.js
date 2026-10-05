/* /.netlify/functions/habbo-outline — a Habbo avatar drawn as the console
   screen draws everything: its outline alone, in the screen's text colour,
   on nothing. (4 Oct 2026, the owner's: the profile became a console, and a
   full-colour Habbo stood on its screen like a sticker.)

   GET ?figure=<figure string>&kind=body|head

   Fetches the figure from Habbo's imaging service, keeps every pure black
   pixel — the outline, and the eyes and mouth, which Habbo draws in the
   same black — turned to SCREEN_TEXT, and makes every other pixel
   transparent. Measured on real figures before it was written: the outline
   is exactly #000000, and black clothing is shaded #111111 to #1b1b1b, so a
   test for exact black separates the two cleanly; a threshold would have
   started eating dark trousers.

   WHY THE SERVER DOES IT. A browser may not read the pixels of an image
   from another site unless that site allows it, and Habbo's imaging service
   does not (no Access-Control-Allow-Origin) — so a canvas in the page could
   draw the figure but never recolour it. From here it is an ordinary fetch.

   WHAT IT WILL FETCH. Only Habbo figures, only in the two shapes the
   profile uses, and only a figure string that looks like one (FIGURE
   below): the rest of the address is fixed here, so this cannot be pointed
   anywhere else. The same figure is always the same picture, so the
   answer is kept by the browser for a day and by Netlify's edge for a
   month; Habbo sees one request per figure per month, not one per view.

   kind=body  the whole figure at Habbo's small size, 33x56, shown at
              exactly that size
   kind=head  the head alone at the small size, 27x30, for lists

   v          ignored here, but part of the cache key: the page raises it
              (OUTLINE_V; see below) when the drawing changes. */
const { decodePng, encodePng } = require("./_png");
const { SECURITY_HEADERS } = require("./_headers");

// The console screen's text colour (.console-screen in css/style.css), the
// same in every theme.
const SCREEN_TEXT = [0xee, 0xee, 0xee];

// "hr-828-1050.hd-180-1014..." — a set-type, a part id and up to two
// colours per item. Generous on lengths; strict on the alphabet.
const FIGURE = /^[a-z]{2}-\d{1,6}(?:-\d{1,6}){0,2}(?:\.[a-z]{2}-\d{1,6}(?:-\d{1,6}){0,2}){0,24}$/;

/* Both at Habbo's SMALL size (4 Oct 2026, the owner's): the figure as a
   room draws it, 33x56, shown at its own size (.profile-avatar). It was the
   normal 64x110. */
// What the pages ask with: OUTLINE_V in js/home.js and in
// netlify/functions/_publicid.js (the boards' heads), and the v=2 written
// out in js/console-profile.js. Raise all four together when the drawing
// changes.
const OUTLINE_V = "2";

const KINDS = {
    body: { size: "s" },
    head: { size: "s", headonly: "1" }
};

// As habbo.js asks Origins: a browser-shaped agent, or the WAF in front of
// it answers with an error page instead of the image.
const USER_AGENT = "Mozilla/5.0 (compatible; MazeRats/1.0; +https://mazerats.net)";
const FETCH_TIMEOUT_MS = 6000;

const fail = (statusCode, error) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ error })
});

// Every pure black pixel in the screen's colour; everything else clear.
function outline(png) {
    const { width, height, data } = decodePng(png);
    const out = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] && !data[i] && !data[i + 1] && !data[i + 2]) {
            out[i] = SCREEN_TEXT[0];
            out[i + 1] = SCREEN_TEXT[1];
            out[i + 2] = SCREEN_TEXT[2];
            out[i + 3] = 255;
        }
    }
    return encodePng(width, height, out);
}

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return fail(405, "Method not allowed");
    const q = event.queryStringParameters || {};
    /* ONE ADDRESS PER PICTURE (4 Oct 2026, the bug scan). Each distinct
       address is a function run and a request to Habbo, and the edge keys
       on the raw parameters — so a figure in another case, with a space on
       it, an unknown `v` or an inherited `kind` ("constructor" passed a
       plain-object lookup) were all fresh fetches of the same picture. Only
       the exact form the page asks for is answered: the figure as Habbo
       writes it, `kind` one of the two, `v` the current one. */
    const figure = String(q.figure || "");
    const kind = q.kind === "head" || q.kind === "body" ? q.kind : null;
    if (!kind) return fail(400, "Unknown kind");
    if (String(q.v || "") !== OUTLINE_V) return fail(400, "Unknown version");
    if (!figure || figure.length > 400 || !FIGURE.test(figure)) return fail(400, "Not a figure");

    const params = new URLSearchParams({
        // The head faces the way the body does (4 Oct 2026; it was turned
        // a step, head_direction 3, as the builder cards still draw it).
        figure, direction: "2", head_direction: "2", action: "std", gesture: "sml", ...KINDS[kind]
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let png;
    try {
        const res = await fetch(`https://www.habbo.com/habbo-imaging/avatarimage?${params}`, {
            signal: controller.signal,
            headers: { "User-Agent": USER_AGENT, Accept: "image/png" }
        });
        const type = res.headers.get("content-type") || "";
        if (!res.ok || !/png/i.test(type)) throw new Error(`habbo-imaging answered ${res.status} (${type || "no type"})`);
        png = outline(Buffer.from(await res.arrayBuffer()));
    } catch (e) {
        // Habbo having a bad minute: the page falls back to its blank face.
        console.warn("habbo-outline:", e && e.name === "AbortError" ? "timed out" : e && e.message);
        return fail(502, "Habbo's avatar could not be fetched just now");
    } finally {
        clearTimeout(timer);
    }

    return {
        statusCode: 200,
        headers: {
            ...SECURITY_HEADERS,
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
            "Netlify-CDN-Cache-Control": "public, durable, max-age=2592000",
            // Keyed on the two parameters that make the picture, so a
            // cache-busting extra is the edge's copy, not another fetch.
            "Netlify-Vary": "query=figure|kind|v"
        },
        body: png.toString("base64"),
        isBase64Encoded: true
    };
};

/* Failures reported to /warren's Errors tab: see withErrorReporting in
   _errors.js. Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("habbo-outline", exports.handler);

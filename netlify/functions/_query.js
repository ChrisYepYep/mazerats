/* Query strings on the addresses that reach a function through a rewrite
   (4 Nov 2026, the bug scan): the share pages and the sitemap. On those Netlify
   ignores Netlify-Vary and keys its copies on the whole address, so a function
   has to deal with a parameter nobody reads itself: see junkFree in share.js.

   KEPT_QUERY is every parameter the pages served by share.js read. The function
   itself reads fresh and the four direct-call names; the rest are read in the
   browser, and a link must arrive with them. */
const KEPT_QUERY = new Set([
    "fresh", "maze", "event", "guide", "article",                     // share.js
    "q",                                                              // the archive's search (js/home.js)
    "g",                                                              // one guide (js/guides.js)
    "p",                                                              // one profile (js/home.js)
    "level",                                                          // js/pura-panic.js
    "signin",                                                         // what became of a sign-in (js/account.js)
    "profile-intro",                                                  // js/account.js
    "skin-preview",                                                   // the Warren's skin switch (js/skin-wear.js)
    "landing",                                                        // js/welcome.js
    "edit", "debug", "embed"                                          // Fallin' Furni, when it reaches this function
]);

// Name and value pairs as they were asked: rawUrl keeps repeats and the order.
function pairsOf(event) {
    if (event.rawUrl) {
        try { return [...new URL(event.rawUrl).searchParams.entries()]; } catch (e) { /* the parsed form below */ }
    }
    return Object.entries(event.queryStringParameters || {}).map(([k, v]) => [k, v == null ? "" : v]);
}

/* null when nothing needs taking off; otherwise { search }, what is left, with
   its "?" when there is any. */
function withoutJunk(event, keep) {
    const pairs = pairsOf(event);
    const kept = pairs.filter(([k]) => keep.has(k));
    if (kept.length === pairs.length) return null;
    const s = new URLSearchParams(kept).toString();
    return { search: s ? `?${s}` : "" };
}

/* A temporary redirect, because the list above can grow: a browser that kept a
   permanent one would go on dropping a parameter after it became real. Never
   kept by the browser, and kept by the edge, whose key is the junk address.
   Nothing about a caller is in it. */
function junkRedirect(location) {
    return {
        statusCode: 302,
        headers: {
            Location: location,
            "Cache-Control": "no-store",
            "Netlify-CDN-Cache-Control": "public, s-maxage=3600"
        },
        body: ""
    };
}

module.exports = { KEPT_QUERY, withoutJunk, junkRedirect };

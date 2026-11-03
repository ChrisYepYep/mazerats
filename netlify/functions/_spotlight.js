/* The spotlight's fields, checked: shared by events.js and articles.js
   (2 Nov 2026, moved here from events.js unchanged when articles could be
   spotlighted too).

   SPOTLIGHT (30 Sept 2026, the owner's): an event on the landing page's
   spotlight: see spotlightFieldsHtml in js/admin.js and showSpotlight in
   js/welcome.js. Six fields, each checked and put in its one shape here,
   in place on the body, so what is stored is always something the page can
   read: `spotlight` a boolean, `spotlightFrom` / `spotlightUntil` a UTC
   instant or "", the end after the start, `spotlightCaption` plain text of
   80 characters at most (^…^ raised text, its marks not counted), `spotlightColour` "#rrggbb" or "",
   `spotlightCaptionAt` "top" or "bottom" (4 Oct 2026) on the landing page,
   and `spotlightCaptionAtHome` the same on the homepage (28 Oct 2026; an
   event without one uses the landing page's). A body that leaves them out
   (an older editor, the bulk tools) leaves them alone. */
const SPOTLIGHT_CAPTION_MAX = 80;
const SPOTLIGHT_FIELDS = ["spotlight", "spotlightFrom", "spotlightUntil", "spotlightCaption", "spotlightColour", "spotlightCaptionAt", "spotlightCaptionAtHome"];
/* An instant, spelled as one (30 Sept 2026): a date, a time, and a zone.
   Date.parse alone took "2026", "Oct 3" and a zoneless "2026-10-03T08:00",
   and read the last two in the SERVER's own zone (UTC on Netlify, but an
   hour out under `netlify dev` on a machine in BST). The form always sends
   "…T08:00:00Z" (pairIso in js/admin.js), which this passes. */
const SPOTLIGHT_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
function checkSpotlight(body) {
    const has = k => Object.prototype.hasOwnProperty.call(body, k);
    if (has("spotlight")) body.spotlight = body.spotlight === true || body.spotlight === "1" || body.spotlight === 1;
    for (const k of ["spotlightFrom", "spotlightUntil"]) {
        if (!has(k)) continue;
        const v = body[k];
        if (v === null || v === "") { body[k] = ""; continue; }
        if (typeof v !== "string" || !SPOTLIGHT_INSTANT.test(v.trim()) || isNaN(Date.parse(v.trim()))) {
            return "A spotlight date isn't a date the site can read.";
        }
        body[k] = new Date(v.trim()).toISOString();
    }
    if (body.spotlightFrom && body.spotlightUntil && body.spotlightUntil <= body.spotlightFrom) {
        return "The spotlight's end must be after its start.";
    }
    if (has("spotlightCaption")) {
        const c = typeof body.spotlightCaption === "string" ? body.spotlightCaption.replace(/\s+/g, " ").trim() : "";
        /* ^…^ marks raised text, like the "st" of 1st (28 Oct 2026): the
           marks are not counted, but cannot pad the caption out forever. */
        if (c.replace(/\^/g, "").length > SPOTLIGHT_CAPTION_MAX || c.length > SPOTLIGHT_CAPTION_MAX + 40) return `The spotlight caption is too long. Please keep it to ${SPOTLIGHT_CAPTION_MAX} characters or fewer.`;
        body.spotlightCaption = c;
    }
    if (has("spotlightColour")) {
        const c = typeof body.spotlightColour === "string" ? body.spotlightColour.trim().toLowerCase() : "";
        if (c && !/^#[0-9a-f]{6}$/.test(c)) return "The spotlight caption colour should be a colour like #ebe8ff.";
        body.spotlightColour = c;
    }
    /* Where the caption sits on the picture (4 Oct 2026, the owner's):
       "top" or "bottom", and anything else is bottom, where it always was. */
    if (has("spotlightCaptionAt")) body.spotlightCaptionAt = body.spotlightCaptionAt === "top" ? "top" : "bottom";
    if (has("spotlightCaptionAtHome")) body.spotlightCaptionAtHome = body.spotlightCaptionAtHome === "top" ? "top" : "bottom";
    return "";
}

module.exports = { checkSpotlight, SPOTLIGHT_FIELDS, SPOTLIGHT_INSTANT, SPOTLIGHT_CAPTION_MAX };

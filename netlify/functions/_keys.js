/* What a blob key in the images store is allowed to look like.

   This used to be a blacklist in image.js — no "..", no leading slash, no
   backslash — on the reasoning that blob keys are flat strings and the
   store attaches no meaning to dots. That reasoning was wrong in the one
   place it mattered. @netlify/blobs builds `/${key}` into a URL, and
   `new URL()` normalises it: "./tips/x.png", "%2e/tips/x.png" and
   "a/%2e%2e/tips/x.png" all FETCH "tips/x.png" while none of them starts
   with "tips/", so the admin check on unreviewed public uploads could be
   walked round with two characters. upload.js had the twin of it: its
   DELETE reads the folder off the text before the first "/", so a wizard
   account could delete "wizard/../rooms/<maze>/<file>.png".

   So this is a whitelist instead. Every key the site has ever written is
   slash-separated segments of letters, digits, ".", "_" and "-" (slugify()
   in upload.js, the uuid-and-day keys in dead-end-leads.js), and that is
   all a key may be. No segment may be "." or "..", there is no "%" to
   decode, no empty segment, no leading slash.

   The URL comparison at the end is a backstop, not the rule: if the
   pattern above ever lets through something the URL parser would rewrite,
   the key is refused rather than trusted. It is the exact transformation
   the store performs, so it is the one worth checking against. */
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const MAX_KEY_LENGTH = 512;

function isSafeKey(key) {
    if (typeof key !== "string" || !key || key.length > MAX_KEY_LENGTH) return false;
    const segments = key.split("/");
    for (const seg of segments) {
        if (!SEGMENT.test(seg) || seg === "." || seg === "..") return false;
    }
    try {
        return new URL(key, "http://x/").pathname === "/" + key;
    } catch (e) {
        return false;
    }
}

module.exports = { isSafeKey };

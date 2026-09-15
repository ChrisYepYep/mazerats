/* The security headers every function response carries.

   netlify.toml has a [[headers]] block for "/*" that sets all of this on the
   site itself — but it does NOT reach /.netlify/functions/*. Checked against
   production: a page comes back with CSP, nosniff, X-Frame-Options and HSTS
   on it, and a function response comes back with none of them. So the edge
   cannot be where this is said for the API, and it has to be said here.

   Why it matters most for image.js: that one serves bytes out of Netlify
   Blobs with a Content-Type taken from the stored metadata. upload.js only
   ever admits PNG/JPEG/GIF/WebP, so there is nothing to sniff INTO today —
   this is the belt to that braces. A Content-Type that is wrong (or one day
   reachable) stops being a rendering decision the browser gets to make.

   `default-src 'none'` rather than the site's own policy: an API response has
   no business loading anything at all, so the strictest thing that can be
   said is also the correct one. */
const SECURITY_HEADERS = {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};

/* For the handful of responses that are not JSON — image.js's blob bytes,
   share.js's Open Graph page. Takes the content type it is actually serving
   and keeps every protective header around it. */
function headersFor(contentType, extra) {
    return { ...SECURITY_HEADERS, "Content-Type": contentType, ...(extra || {}) };
}

module.exports = { SECURITY_HEADERS, headersFor };

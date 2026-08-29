/* Opening a Netlify Blobs store, with the credential fallback this site
   needs.

   Netlify is supposed to inject siteID/token automatically inside a deployed
   Function, but that injection is unreliable here — which is why the image
   store has carried a fallback for a while. Bare getStore() THROWS when the
   injection doesn't happen, so anything calling it without this dies on its
   first blob access; the furni scanner did exactly that, stopping dead after
   its first progress write with no error anywhere.

   One copy, used by every store on the site, so the next thing to reach for
   Blobs can't rediscover the same trap. */

const { getStore } = require("@netlify/blobs");

function blobStore(name) {
    const { NETLIFY_BLOBS_SITE_ID, NETLIFY_BLOBS_TOKEN } = process.env;
    if (NETLIFY_BLOBS_SITE_ID && NETLIFY_BLOBS_TOKEN) {
        return getStore({ name, siteID: NETLIFY_BLOBS_SITE_ID, token: NETLIFY_BLOBS_TOKEN });
    }
    return getStore(name);
}

module.exports = { blobStore };

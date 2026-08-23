/* Shared Netlify Blobs store for uploaded images (upload.js writes,
   image.js reads). Netlify is supposed to auto-inject siteID/token for
   Blobs inside a deployed Function, but that injection is unreliable on
   some sites — if that happens, this falls back to explicit credentials
   from NETLIFY_BLOBS_SITE_ID / NETLIFY_BLOBS_TOKEN env vars instead. */
const { getStore } = require("@netlify/blobs");

function imagesStore() {
    const { NETLIFY_BLOBS_SITE_ID, NETLIFY_BLOBS_TOKEN } = process.env;
    if (NETLIFY_BLOBS_SITE_ID && NETLIFY_BLOBS_TOKEN) {
        return getStore({
            name: "mazerats-images",
            siteID: NETLIFY_BLOBS_SITE_ID,
            token: NETLIFY_BLOBS_TOKEN
        });
    }
    return getStore("mazerats-images");
}

module.exports = { imagesStore };

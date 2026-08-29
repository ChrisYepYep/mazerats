/* Shared Netlify Blobs store for uploaded images (upload.js writes,
   image.js reads). The siteID/token fallback this needs now lives in
   _blobs.js, shared with every other store on the site. */
const { blobStore } = require("./_blobs.js");

function imagesStore() {
    return blobStore("mazerats-images");
}

module.exports = { imagesStore };

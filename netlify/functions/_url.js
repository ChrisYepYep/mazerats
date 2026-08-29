/* Turning a stored image path into something fetchable.

   Image paths in the database come in two shapes, and the difference is
   invisible until something concatenates them: most start with a slash
   ("/.netlify/functions/image?key=…"), but The Little Maze's 101 images are
   plain relative paths ("assets/rooms/the-little-maze/tlm_entrance.png").
   Gluing a site origin onto the second kind without a separator produces
   "https://mazerats.netassets/…", which fails to resolve — every one of that
   maze's images, and only that maze's.

   One copy, so the next thing that needs to fetch a room image cannot
   reintroduce it. */

function imageUrl(siteUrl, imagePath) {
    if (/^https?:/i.test(imagePath)) return imagePath;
    return `${String(siteUrl).replace(/\/+$/, "")}/${String(imagePath).replace(/^\/+/, "")}`;
}

module.exports = { imageUrl };

/* The sprite library both scanners compare rooms against, and the cache key
   that decides which artwork ends up under which furni's name.

   THIS FILE EXISTS BECAUSE OF A BUG WORTH REMEMBERING. Both scanners used to
   name their cached sprites after the furni's position in the catalogue
   array — `${itemIndex}_${state}_${rotation}.png`. That position is not an
   identity. The catalogue is whatever FurniIndex's paginated API hands back,
   refreshed every 24 hours, with no sort of our own imposed on it; when they
   add, remove or reorder a row, every index after it shifts by one.

   The caches did not shift with it. A cache filled under one ordering was
   read back under another, so the scanner loaded one furni's artwork,
   matched it against a room, and recorded the hit under a DIFFERENT furni's
   name. Measured on the local cache before the fix: of 26 sampled sprites,
   21 had different pixel dimensions from the sprite they were named for —
   not a re-encode, a different object entirely. That is what put a Double
   Bed in 40% of the archive's maze rooms and a Fireplace in a room with no
   fireplace in it.

   So the cache key is now the sprite's own URL, hashed. A URL identifies one
   piece of artwork forever: if the catalogue reorders, the key is unchanged
   and still correct; if FurniIndex repoints a furni at new art, the URL
   changes and the entry is simply a miss that refetches. There is no
   ordering left for the cache to disagree with.

   The old index-named entries are unsalvageable — nothing records which
   ordering they were written under — so they are ignored, not migrated.
*/

const crypto = require("crypto");

/* Content-addressed by URL. Hashed rather than used raw because these are
   filenames on Windows and blob keys on Netlify, and a CDN URL is neither
   short nor free of characters both dislike. */
function spriteCacheKey(url) {
    return crypto.createHash("sha1").update(url).digest("hex") + ".png";
}

/* Every state/rotation of every furni. All of them matter: a chair placed
   facing away matches only its own rotation's sprite, and an early test that
   used just the first sprite of each furni found nothing at all.

   `key` is still the catalogue index, and still correct — it is resolved
   against the same in-memory catalogue within a single run, and never
   written anywhere that outlives it. Only the CACHE key had to become
   stable, because that is the one thing that survives to the next run. */
function spriteList(catalogue) {
    const wanted = [];
    catalogue.items.forEach((item, itemIndex) => {
        (item.largeImages || []).forEach((state, si) => state.forEach((url) => {
            if (url) wanted.push({ key: itemIndex, url, blobKey: spriteCacheKey(url) });
        }));
    });
    return wanted;
}

/* True for the index-named files written before the fix above. They cannot
   be trusted and cannot be mapped back, so callers delete them rather than
   leaving 16MB of misleading artwork on disk. */
function isLegacySpriteKey(name) {
    return /^\d+_\d+_\d+\.png$/.test(name);
}

module.exports = { spriteCacheKey, spriteList, isLegacySpriteKey };

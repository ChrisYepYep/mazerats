/* Shared site chrome: mobile nav toggle + active link highlighting */

// Routes an image path through Netlify's built-in Image CDN so the browser
// downloads a resized/compressed version instead of the full original —
// the room screenshots this site archives run 100-750KB each, but most
// places on the site only ever display them as small thumbnails. Pass the
// raw, un-encoded path/URL (this does its own encoding — don't wrap the
// result in encodeURI() too, or it'll double-encode and 404, same bug as
// upload.js previously had). Omit h for a fixed-width, aspect-preserving
// resize; pass both w and h for a cropped-to-fill thumbnail.
function imgCdn(path, w, h, q) {
    if (!path) return path;
    const params = new URLSearchParams({ url: path, w: String(w), q: String(q || 70) });
    if (h) {
        params.set("h", String(h));
        params.set("fit", "cover");
    }
    return `/.netlify/images?${params.toString()}`;
}

document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.querySelector("nav.site-nav");
    if (toggle && nav) {
        toggle.addEventListener("click", () => nav.classList.toggle("open"));
    }

    const current = document.body.dataset.page;
    document.querySelectorAll("nav.site-nav a[data-page]").forEach(link => {
        if (link.dataset.page === current) link.classList.add("active");
    });
});

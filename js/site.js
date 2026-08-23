/* Shared site chrome: mobile nav toggle + active link highlighting */
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

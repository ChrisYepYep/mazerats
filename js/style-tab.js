/* THE STYLE TAB (20 Nov 2026, the owner's): "a function for users on the
   home page that allows them to change the skin of the website, ... a new
   tab underneath MENU and SPOTLIGHT". He named it STYLE.

   A third drawer on the archive window (#style-drawer in home.html, its
   look in css/style.css "the style tab"), built as the spotlight's is: a
   spine, and a panel of the menu's own rows. Each row is a look: Classic
   (no skin) and each skin the Warren lets visitors pick now.

   The rules are js/skin-wear.js's, not this file's:
     SkinWear.offered()   the looks to list now ([] while there is no choice:
                          the tab is hidden then)
     SkinWear.wearing()   the one being worn, lit here
     SkinWear.setPick(n)  wear n, kept on this device and the account
   A scheduled skin starting takes over every pick (the owner's: "they'll
   need to set Classic manually again if they want that"); skin-wear drops
   the pick then and this redraws on its mazerats:skin-changed. */
(function () {
    "use strict";
    const drawer = document.getElementById("style-drawer");
    const spine = document.getElementById("style-spine");
    const menu = document.getElementById("style-menu");
    const stack = drawer && drawer.parentElement;
    if (!drawer || !spine || !menu || !window.SkinWear || !SkinWear.setPick) return;

    const BLURB = {
        // The owner's words (20 Nov 2026).
        classic: "The archive's OG colours",
        gta: "Neon sunset vibes",
        halloween: "Bats, a ghost and goo",
        xmas: "Snow, lights and hats"
    };
    const label = (n) => (SkinWear.LABELS && SkinWear.LABELS[n]) || n;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    const isOpen = () => drawer.classList.contains("is-open");
    function setOpen(open) {
        drawer.classList.toggle("is-open", open);
        spine.setAttribute("aria-expanded", open ? "true" : "false");
        // Out of the tab order while it is behind the window, as the menu is.
        menu.toggleAttribute("inert", !open);
    }
    menu.setAttribute("inert", "");

    let drawn = "";
    function draw() {
        // An admin previewing a skin sees the preview, not their own pick: the tab steps aside.
        const list = SkinWear.previewing && SkinWear.previewing() ? [] : SkinWear.offered();
        const on = SkinWear.wearing();
        const key = JSON.stringify([list, on]);
        if (key === drawn) return;
        drawn = key;
        drawer.hidden = list.length < 2;
        if (drawer.hidden) { if (isOpen()) setOpen(false); return; }
        // One plain line over the rows (20 Nov 2026, the owner's words; it replaced a note under them).
        menu.innerHTML = `<p class="side-menu-state style-menu-note">Select an archive skin.</p>` + list.map((n) => `
            <button type="button" class="side-menu-item${n === on ? " is-on" : ""}" data-pick="${esc(n)}" aria-pressed="${n === on}">
                <span class="side-menu-name"><span>${esc(label(n))}</span></span>
                <span class="side-menu-state">${esc(BLURB[n] || "")}</span>
            </button>`).join("");
        place();
    }

    /* Under the spotlight's tab while it shows (its height is the word
       SPOTLIGHT's, so measured), else in its place under MENU. Desktop only:
       on a phone the CSS puts this on the titlebar. */
    const spot = document.getElementById("spotlight-drawer");
    function place() {
        if (!stack) return;
        if (spot && !spot.hidden) {
            const s = document.getElementById("spotlight-spine");
            const h = s ? s.offsetHeight : 0;
            if (h) { stack.style.setProperty("--style-top", `calc(var(--spot-top) + ${h + 8}px)`); return; }
        }
        stack.style.removeProperty("--style-top");
    }
    if (spot && "MutationObserver" in window) new MutationObserver(place).observe(spot, { attributes: true, attributeFilter: ["hidden"] });
    // The spine's word is drawn in a web font: measured again once it has loaded.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place, () => {});

    /* 20 Nov 2026, the scan: opening moves focus to the first look, as MENU
       does. The rows come before the spine in the page, so without this Tab
       from the spine went out to the footer. */
    spine.addEventListener("click", () => {
        const open = !isOpen();
        setOpen(open);
        if (open) {
            const first = menu.querySelector("[data-pick]");
            if (first) first.focus({ preventScroll: true });
        }
    });
    menu.addEventListener("click", (e) => {
        const b = e.target.closest("[data-pick]");
        if (!b) return;
        const n = b.dataset.pick;
        if (n === SkinWear.wearing()) return;
        if (SkinWear.setPick(n) && window.Track && typeof Track.event === "function") Track.event("style", n);
        draw();
        // 20 Nov 2026, the scan: draw() rebuilds the rows, which dropped focus to the body; back onto the one picked.
        const again = Array.from(menu.querySelectorAll("[data-pick]")).find((x) => x.dataset.pick === n);
        if (again) again.focus({ preventScroll: true });
    });
    // A press anywhere else closes it, as the menu and the spotlight do.
    document.addEventListener("pointerdown", (e) => {
        if (isOpen() && !drawer.contains(e.target)) setOpen(false);
    });
    /* 20 Nov 2026, the scan: a keyboard user could open a maze (Enter on a
       row) with this still out, and it stayed open behind the window. Focus
       or a click landing anywhere outside it closes it now, as MENU's click
       rule does. */
    document.addEventListener("click", (e) => {
        // Not the pick itself: draw() has already taken that row out of the page.
        if (isOpen() && e.target.isConnected && !drawer.contains(e.target)) setOpen(false);
    });
    document.addEventListener("focusin", (e) => {
        if (isOpen() && !drawer.contains(e.target)) setOpen(false);
    });
    // Escape through the shared front-most-layer rule (js/site.js), back to the spine.
    const shut = () => { setOpen(false); spine.focus({ preventScroll: true }); };
    if (window.EscapeLayers && EscapeLayers.register) {
        EscapeLayers.register({ elements: () => (isOpen() ? [drawer] : []), close: shut });
    } else {
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && isOpen()) shut();
        });
    }

    document.addEventListener("mazerats:skin-changed", draw);
    draw();
})();

/* The Warren's Controls: its large cards folded shut, opened by their title
   (30 Oct 2026, the owner's: "make it so the larger parts are collapsed and
   open up when clicked, like the homepage menu controls, spotlight order,
   and seasonal controls").

   Every wide card in the Controls panel (.ctl-card-wide) gets a title bar
   of its own, a button, that opens and shuts the rest of the card; shut is
   how they start. The card's own top label becomes that title, so it is not
   said twice. Which are open is remembered in this browser only — a
   convenience, nothing the site keeps. The small switch cards (the landing
   page, each game's state) stay as they are: they are one press each. */
(function () {
    "use strict";
    const KEY = "mazerats_ctl_open";
    // A card with no label of its own of the right kind gets its title here.
    const TITLES = { "skin-preview-card": "Seasonal skins and palette" };
    const readOpen = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
    const writeOpen = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* private mode */ } };

    function foldable(card) {
        if (!card.id || card.querySelector(":scope > .ctl-fold-head")) return;
        const label = card.querySelector(":scope > .ctl-label");
        const title = TITLES[card.id] || (label ? label.textContent.trim() : "");
        if (!title) return;
        if (label) label.classList.add("ctl-fold-label");
        const head = document.createElement("button");
        head.type = "button";
        head.className = "ctl-fold-head";
        head.innerHTML = '<span class="ctl-fold-arrow" aria-hidden="true"></span><span class="ctl-fold-title"></span>';
        head.querySelector(".ctl-fold-title").textContent = title;
        card.insertBefore(head, card.firstChild);
        const set = (open, keep) => {
            card.classList.toggle("is-folded", !open);
            head.setAttribute("aria-expanded", String(open));
            if (!keep) return;
            const list = readOpen().filter(id => id !== card.id);
            if (open) list.push(card.id);
            writeOpen(list);
        };
        set(readOpen().includes(card.id), false);
        head.addEventListener("click", () => set(card.classList.contains("is-folded"), true));
    }

    document.addEventListener("DOMContentLoaded", () => {
        const panel = document.querySelector('section[data-panel="control"]');
        if (!panel) return;
        panel.querySelectorAll(".ctl-card-wide").forEach(foldable);
    });
})();

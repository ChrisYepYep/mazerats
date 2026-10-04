/* The open list of a dropdown, drawn by the site instead of the browser
   (4 Oct 2026, the owner's: Edit Profile's menus opened as the operating
   system's white list in its own font, in the middle of the Habbo console).

   A <select>'s closed box takes CSS; its open list does not — each browser
   draws that itself, and no rule reaches its font, border or highlight. So
   for the selects named in SELECTOR the browser's list is never opened:
   pressing the select (or Space, Enter, Alt+Down, F4, Up or Down on it)
   opens this one instead, styled to sit where the select does.

   THE SELECT STAYS THE CONTROL. Nothing replaces it: it keeps its label, its
   focus, its value and its `change` event, and the code that rebuilds its
   options (js/console-info.js swaps a row's kinds when the record changes)
   or focuses it carries on as before. The list is read from the select's
   options each time it opens, and choosing from it sets the select's value
   and fires `input` and `change` exactly as the browser's list does. Focus
   stays on the select throughout, and the option in reach is announced
   through aria-activedescendant.

   The list is made when it opens and removed when it closes, at the top
   level of <body> and fixed against the window, so it changes no layout (a
   flex row with the select in it is untouched) and is not cut off by the
   console's small scrolling screen. It is marked data-trap-keep, so the
   focus trap (js/site.js) never makes it inert. It opens downwards, or
   upwards when the window has more room above. It closes on a choice,
   Escape (through EscapeLayers, so Escape closes the list and not the
   console behind it), Tab, a press anywhere else (dragging the console
   included), the window resizing, or anything scrolling.

   Two looks: the console's (scanline screen, white hairline, Volter) for
   .console-select, and the archive's parchment for the sort menu. */
(function () {
    "use strict";

    const SELECTOR = "select.console-select, .sort-box select";
    // Tall enough for the archive's six sorts without a scrollbar.
    const MAX_HEIGHT = 240;

    let open = null;      // { select, list, items, active }
    let uid = 0;

    const isOurs = el => el instanceof HTMLSelectElement && !el.multiple && el.matches(SELECTOR);

    function variantOf(select) {
        return select.classList.contains("console-select") ? "is-console" : "is-parchment";
    }

    function build(select) {
        const list = document.createElement("ul");
        list.className = "select-list " + variantOf(select);
        list.id = "select-list-" + (++uid);
        list.setAttribute("role", "listbox");
        // Never made inert by the focus trap in js/site.js (NEVER_INERT).
        list.setAttribute("data-trap-keep", "");
        const label = select.getAttribute("aria-label") ||
            (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`) || {}).textContent || "";
        if (label) list.setAttribute("aria-label", label.trim());

        const items = [];
        const add = (opt, inGroup) => {
            const li = document.createElement("li");
            li.className = "select-list-opt" + (inGroup ? " is-grouped" : "");
            li.id = `${list.id}-${items.length}`;
            li.setAttribute("role", "option");
            li.textContent = opt.label || opt.textContent;
            const disabled = opt.disabled || (opt.parentElement && opt.parentElement.disabled);
            if (disabled) {
                li.classList.add("is-disabled");
                li.setAttribute("aria-disabled", "true");
            }
            if (opt.selected) {
                li.classList.add("is-selected");
                li.setAttribute("aria-selected", "true");
            } else {
                li.setAttribute("aria-selected", "false");
            }
            li._option = opt;
            items.push(li);
            list.appendChild(li);
        };
        for (const child of select.children) {
            if (child.tagName === "OPTGROUP") {
                const head = document.createElement("li");
                head.className = "select-list-group";
                head.setAttribute("role", "presentation");
                head.textContent = child.label;
                list.appendChild(head);
                for (const opt of child.children) if (opt.tagName === "OPTION" && !opt.hidden) add(opt, true);
            } else if (child.tagName === "OPTION" && !child.hidden) {
                add(child, false);
            }
        }
        return { list, items };
    }

    // Placed against the window, under the select or over it, whichever has room.
    function place(select, list) {
        const sr = select.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const width = Math.max(sr.width, 0);
        list.style.minWidth = width + "px";
        list.style.maxWidth = Math.max(width, Math.min(220, vw - 16)) + "px";
        const roomBelow = vh - sr.bottom - 8;
        const roomAbove = sr.top - 8;
        // Its whole height, borders included (border-box), so a list that fits has no scrollbar.
        const want = Math.min(MAX_HEIGHT, Math.ceil(list.getBoundingClientRect().height));
        const up = roomBelow < want && roomAbove > roomBelow;
        const height = Math.max(40, Math.min(want, up ? roomAbove : roomBelow));
        list.style.maxHeight = height + "px";
        const left = Math.min(sr.left, vw - list.offsetWidth - 8);
        list.style.left = Math.max(8, left) + "px";
        if (up) {
            list.style.top = (sr.top - Math.min(want, height) - 2) + "px";
            list.classList.add("is-up");
        } else {
            list.style.top = (sr.bottom + 2) + "px";
        }
    }

    function setActive(i, scroll) {
        if (!open) return;
        const { items, select } = open;
        if (open.active >= 0 && items[open.active]) items[open.active].classList.remove("is-active");
        open.active = i;
        const li = items[i];
        if (!li) {
            select.removeAttribute("aria-activedescendant");
            return;
        }
        li.classList.add("is-active");
        select.setAttribute("aria-activedescendant", li.id);
        if (scroll) {
            const l = open.list;
            if (li.offsetTop < l.scrollTop) l.scrollTop = li.offsetTop;
            else if (li.offsetTop + li.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = li.offsetTop + li.offsetHeight - l.clientHeight;
        }
    }

    // The next pickable option from i in direction d, or i if there is none.
    function step(i, d) {
        const items = open.items;
        for (let j = i + d; j >= 0 && j < items.length; j += d) {
            if (!items[j].classList.contains("is-disabled")) return j;
        }
        return i;
    }

    function openFor(select) {
        if (select.disabled) return;
        if (open) close(open.select === select);
        if (open) return;
        const { list, items } = build(select);
        if (!items.length) return;
        document.body.appendChild(list);
        open = { select, list, items, active: -1 };
        select.setAttribute("aria-expanded", "true");
        select.setAttribute("aria-controls", list.id);
        place(select, list);
        const current = items.findIndex(li => li._option.selected);
        setActive(current >= 0 ? current : step(-1, 1), true);
        if (document.activeElement !== select) select.focus({ preventScroll: true });
    }

    function close(keepFocus) {
        if (!open) return;
        const { select, list } = open;
        open = null;
        list.remove();
        select.removeAttribute("aria-activedescendant");
        select.removeAttribute("aria-controls");
        select.setAttribute("aria-expanded", "false");
        if (keepFocus && select.isConnected) select.focus({ preventScroll: true });
    }

    function choose(i) {
        if (!open) return;
        const li = open.items[i];
        if (!li || li.classList.contains("is-disabled")) return;
        const select = open.select;
        const changed = !li._option.selected;
        close(true);
        if (!changed) return;
        li._option.selected = true;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Typing a letter while the list is open jumps to the next option starting with it.
    let typed = "", typedAt = 0;
    function typeahead(ch) {
        const now = Date.now();
        typed = now - typedAt > 700 ? ch : typed + ch;
        typedAt = now;
        const items = open.items;
        const from = typed.length === 1 ? open.active + 1 : open.active;
        for (let k = 0; k < items.length; k++) {
            const j = (from + k) % items.length;
            const li = items[j];
            if (!li.classList.contains("is-disabled") && li.textContent.trim().toLowerCase().startsWith(typed)) {
                setActive(j, true);
                return;
            }
        }
    }

    /* ---- the select's own events, delegated: selects are drawn and redrawn
       with innerHTML, so nothing is bound to any one of them. ---- */

    // A press on the select opens ours, never the browser's.
    function onPress(e) {
        const select = e.target;
        if (!isOurs(select)) return;
        if (e.type === "mousedown" && e.button !== 0) return;
        e.preventDefault();
        if (open && open.select === select) close(true);
        else openFor(select);
    }
    document.addEventListener("mousedown", onPress, true);
    // A touch would open the phone's own picker on its way to a click.
    document.addEventListener("touchend", e => {
        if (!isOurs(e.target)) return;
        onPress(e);
    }, { capture: true, passive: false });
    document.addEventListener("touchstart", e => {
        if (isOurs(e.target)) e.preventDefault();
    }, { capture: true, passive: false });

    document.addEventListener("keydown", e => {
        const select = e.target;
        if (!isOurs(select)) return;
        const k = e.key;
        if (open && open.select === select) {
            if (k === "ArrowDown" || k === "ArrowUp") {
                e.preventDefault();
                if (e.altKey) { choose(open.active); return; }
                setActive(step(open.active, k === "ArrowDown" ? 1 : -1), true);
            } else if (k === "Home" || k === "PageUp") {
                e.preventDefault();
                setActive(step(-1, 1), true);
            } else if (k === "End" || k === "PageDown") {
                e.preventDefault();
                setActive(step(open.items.length, -1), true);
            } else if (k === "Enter" || k === " ") {
                e.preventDefault();
                choose(open.active);
            } else if (k === "Tab") {
                close(false);
            } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                typeahead(k.toLowerCase());
            }
            // Escape is EscapeLayers', below.
            return;
        }
        if (k === "Enter" || k === " " || k === "F4" || k === "ArrowDown" || k === "ArrowUp" ||
            (e.altKey && (k === "ArrowDown" || k === "ArrowUp"))) {
            e.preventDefault();
            openFor(select);
        }
    }, true);

    // The list itself: pointing picks, a press chooses.
    document.addEventListener("mousemove", e => {
        if (!open) return;
        const li = e.target.closest && e.target.closest(".select-list-opt");
        if (!li || !open.list.contains(li) || li.classList.contains("is-disabled")) return;
        const i = open.items.indexOf(li);
        if (i !== open.active) setActive(i, false);
    });
    document.addEventListener("mousedown", e => {
        if (!open) return;
        if (open.list.contains(e.target)) {
            // Keeps focus on the select.
            e.preventDefault();
            return;
        }
        if (e.target !== open.select) close(false);
    });
    document.addEventListener("click", e => {
        if (!open) return;
        const li = e.target.closest && e.target.closest(".select-list-opt");
        if (li && open.list.contains(li)) choose(open.items.indexOf(li));
    });
    document.addEventListener("touchstart", e => {
        if (open && !open.list.contains(e.target) && e.target !== open.select) close(false);
    }, { capture: true, passive: true });

    document.addEventListener("focusout", e => {
        if (open && e.target === open.select) {
            // Focus moving into the list is kept from happening above; anything else closes it.
            setTimeout(() => { if (open && document.activeElement !== open.select) close(false); }, 0);
        }
    });
    document.addEventListener("scroll", e => {
        if (open && e.target !== open.list && !(e.target instanceof Node && open.list.contains(e.target))) close(false);
    }, true);
    window.addEventListener("resize", () => close(false));

    // A select taken away or switched off while its list is open.
    new MutationObserver(() => {
        if (open && (!open.select.isConnected || open.select.disabled)) close(false);
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden"] });

    function register() {
        if (!window.EscapeLayers) return false;
        window.EscapeLayers.register({
            elements: () => (open ? [open.list] : []),
            close: () => close(true)
        });
        return true;
    }
    if (!register()) document.addEventListener("DOMContentLoaded", register, { once: true });

    window.SelectList = { close: () => close(false), isOpen: () => !!open };
})();

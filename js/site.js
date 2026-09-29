/* Shared site chrome */

// The old Coming Soon/Maintenance gate (redirecting a non-admin visitor to
// index.html, plus the "Dev Mode" pill for one who's allowed to stay) used
// to live here, running on DOMContentLoaded — but that's well after the
// page had already painted, so a gated visitor briefly saw the real page
// before being bounced. It only ever ran on home.html anyway (admin.html
// and index.html/welcome were both excluded), so it's since moved to an
// early, render-blocking inline script in home.html's own <head> instead —
// see the comment there for why it has to run that early.

// A whole-site ban this browser has been told about (js/account.js,
// BLOCK_KEY; 29 Sept 2026): every page but the landing page, the privacy
// policy and the Warren sends the visitor back to the landing page, which
// shows it as Maintenance (js/welcome.js). home.html makes the same check
// earlier, in its <head>; this catches the pages that have no such gate.
(function () {
    if (/^\/(?:$|index(?:\.html)?$|privacy|warren)/.test(location.pathname)) return;
    try {
        const blocked = JSON.parse(localStorage.getItem("mazerats_blocked") || "null");
        if (blocked && typeof blocked === "object" && (!blocked.until || Date.parse(blocked.until) > Date.now())) {
            location.replace("/");
        }
    } catch (e) { /* unreadable: nothing to act on */ }
})();

// Alphabetical sorting starts at the first real letter or number in a name,
// ignoring anything before it. Maze names can open with one of Volter
// Goldfish's picture glyphs (a star, a skull — see the palette on the admin
// page), which sort by codepoint and dumped every decorated name into a
// clump of its own instead of filing it under its actual name.
//
// A plain /\p{L}/ test is not enough to spot them: the font draws several of
// its pictures on codepoints Unicode classifies as letters — U+00AA and
// U+00BA are ordinal indicators, U+00B5 is micro, U+00CC-CE and U+00E6 are
// accented Latin — so those have to be named explicitly. Accented letters
// the font draws as actual letters (É, Ñ, ü and the rest) are deliberately
// absent, since a name starting with one should file under that letter.
//
// Keep this list in step with the picture group in js/glyph-palette.js.
const PICTURE_GLYPHS = new Set([
    0x0192, 0x2020, 0x2021, 0x2018, 0x2022, 0x2014, 0x00A5, 0x00AA,
    0x00AC, 0x00B1, 0x00B5, 0x00B6, 0x00BA, 0x00BB, 0x00CC, 0x00CD,
    0x00CE, 0x00D5, 0x00E6, 0x00EC, 0x00ED, 0x00EE, 0x00F5, 0x00F7
]);

// A leading article is skipped too, the way a library or a record shop
// files things: "A Horrible Maze" belongs under H, and "The Little Maze"
// under L, because those are the words someone actually looks them up by.
// Otherwise a third of the archive piles up under A and T.
//
// The trailing \s+ is what keeps this honest — it only fires on the article
// as a whole word, so "Anniversary Maze" is not read as "An niversary" and
// a hyphenated "A-Maze" keeps its A.
const LEADING_ARTICLE = /^(?:a|an|the)\s+/i;

// Digits count as real, so a name like "100% CONFUSED MAZE" still files
// under 1 rather than jumping to C.
function sortableName(name) {
    const text = String(name || "");
    let i = 0;
    // for...of walks codepoints, not UTF-16 units, so a surrogate pair is
    // never split in half.
    for (const ch of text) {
        if (!PICTURE_GLYPHS.has(ch.codePointAt(0)) && /[\p{L}\p{N}]/u.test(ch)) {
            const rest = text.slice(i);
            // Applied after the glyphs are gone, so a decorated name like
            // "★ The Little Maze" still reaches the article and files
            // under L rather than under T.
            const dropped = rest.replace(LEADING_ARTICLE, "");
            // A name that is nothing BUT an article ("The") keeps it —
            // sorting it as an empty string would float it above
            // everything for no reason a reader could see.
            return dropped || rest;
        }
        i += ch.length;
    }
    // Nothing but glyphs and punctuation — sort on what it has.
    return text;
}

// Used by the maze and event sorts on both the homepage and the admin page,
// so the two always agree on the order. Falls back to the raw strings so two
// names differing only in their leading glyph still order predictably rather
// than comparing equal.
function compareNames(a, b) {
    const byLetter = sortableName(a).localeCompare(sortableName(b));
    return byLetter !== 0 ? byLetter : String(a || "").localeCompare(String(b || ""));
}

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

/* ---------- Escape closes the top-most layer, and only that ----------

   The archive stacks things: the side menu, the room modal, the actions tab
   pulled out of it, the lightbox over that, the console, photo frames and
   furni cards over everything, and the daily games and Your Progress in
   windows of their own. Each used to bind its own Escape listener and
   decide for itself whether to act, so one press could close two or three
   of them at once — the progress window and the modal both went; the
   console and the room modal argued about which was in front and the
   console guessed wrong (it sits at z-index 200, the modal's overlay at
   100, so it IS in front).

   Now there is one listener. Each layer registers how to tell whether it
   is open, which element it is, and how to close it; on Escape the open
   ones are compared by where they actually paint and the front one alone
   is closed. The listener sits on window in the CAPTURE phase and stops the
   event once it has acted, so any older per-layer listener still bound
   further down (js/guess.js and js/oddoneout.js keep their own) never sees
   the same press and closes a second window behind the first.

   "Where it actually paints": every layer here is either a direct child of
   <body> or inside one, so the body-level ancestor's z-index decides
   between layers in different subtrees (DOM order breaks a tie, as it does
   for the browser), and within one subtree the more deeply nested layer —
   the actions tab inside the room modal — is the one in front. */
const EscapeLayers = (() => {
    const layers = [];

    function topAncestor(el) {
        let node = el;
        while (node && node.parentElement && node.parentElement !== document.body) node = node.parentElement;
        return node;
    }

    function zOf(el) {
        const z = parseInt(getComputedStyle(el).zIndex, 10);
        return isNaN(z) ? 0 : z;
    }

    /* The child of `ancestor` that holds `el` (or el itself). */
    function childUnder(ancestor, el) {
        let node = el;
        while (node && node.parentElement !== ancestor) node = node.parentElement;
        return node;
    }

    // True when a paints in front of b.
    function inFront(a, b) {
        if (a.contains(b)) return false;
        if (b.contains(a)) return true;
        const ta = topAncestor(a), tb = topAncestor(b);
        if (ta !== tb) {
            const za = zOf(ta), zb = zOf(tb);
            if (za !== zb) return za > zb;
        } else {
            /* Under the same top-level element — the maze window's photo
               frames (z 300s) and furni cards (z 320s) both live inside its
               overlay — so compare where they part ways, or Escape closed a
               frame sitting underneath a card simply because the frame came
               later in the markup. */
            let common = a.parentElement;
            while (common && !common.contains(b)) common = common.parentElement;
            if (common) {
                const za = zOf(childUnder(common, a)), zb = zOf(childUnder(common, b));
                if (za !== zb) return za > zb;
            }
        }
        return !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    }

    /* layer.elements() returns the element(s) currently open for it — an
       empty list when it is shut. Several for the photo frames and furni
       cards, which can be open many at a time and close one per press.
       layer.close(el) closes that one. */
    function register(layer) {
        layers.push(layer);
    }

    window.addEventListener("keydown", e => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        let best = null;
        for (const layer of layers) {
            let open;
            try { open = layer.elements() || []; } catch (err) { continue; }
            for (const el of open) {
                if (!el || !el.isConnected) continue;
                if (!best || inFront(el, best.el)) best = { el, layer };
            }
        }
        if (!best) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        best.layer.close(best.el);
    }, true);

    // inFront is shared with FocusTrap below, so Tab and Escape agree on
    // which window is the front one.
    return { register, inFront };
})();
window.EscapeLayers = EscapeLayers;

/* ---------- Tab stays inside the front window ----------

   Every aria-modal window on the site says to a screen reader "nothing
   outside me exists", and until now only the room modal did anything to
   make that true for the keyboard — with its own trap, which leaked: it
   picked "first" and "last" from a selector that still matched hidden and
   tabindex=-1 controls, so Tab from the real last control was never seen
   as the end and walked out behind the overlay. The Guides and Alt Codes
   windows, the landing page's event and privacy windows and the daily games
   had nothing at all; Tab went straight through them into the page behind.

   One trap now, for every VISIBLE element with aria-modal="true" (markup
   can leave the attribute on permanently — a shut window is display:none
   and does not count):

   - The front one wins, by where it paints: EscapeLayers.inFront, the same
     comparison Escape uses, so the window Tab is kept in is the window
     Escape would close.
   - The trap region is the dialog's .modal-overlay when it has one, not
     the dialog alone. The room modal's photo frames, furni cards and actions
     tab live in the overlay beside the .modal, and they have to stay
     reachable.
   - Tab and Shift+Tab are moved by hand, around a list of what is REALLY
     tabbable: tabIndex >= 0, not disabled, not inert, not aria-hidden, and
     actually rendered. Moving by hand rather than letting the browser go
     and correcting at the ends is what the old trap got wrong — any
     disagreement between the list and the browser about what comes next
     was a way out.
   - Focus outside the front window when Tab is pressed goes to its first
     control.
   - Everything else at the top level of <body> is made inert while a
     window is up, so a pointer or a screen reader's virtual cursor cannot
     reach it either, and handed back when it shuts. Only what this set is
     ever unset: something another script made inert is left alone.

   The Habbo Console is the exception. It is a draggable, NON-modal window
   that sits over everything (z 200), and it can be open over the room
   modal — so it is never a candidate, never made inert, and a Tab pressed
   inside it is none of this code's business. The same goes for a photo
   frame or furni card that ends up at the top level of <body>.

   ---- THE FOCUS PATCH, AND THE BUG IT PREVENTS.

   Every window here puts focus back on its opener in the same breath as it
   closes: classList.remove("open"), then back.focus(). The inert wrapper
   around that opener is only lifted when the MutationObserver below next
   runs, which is after that script has finished — and focus() on an inert
   element silently does nothing. So every close dropped focus on <body>,
   and every window opened from another (Progress from the room modal's
   saved note) could not focus itself either, since until then it sat in an
   inert sibling. HTMLElement.prototype.focus is therefore wrapped: a
   focus() aimed inside something this trap made inert brings the trap up
   to date first, synchronously, and then focuses. It costs a Set lookup on
   every focus() call and nothing at all while no window is open. A window
   on its way out (.closing, the room modal's fade) is counted as shut for
   the same reason: it restores focus while it is still fading. */
const FocusTrap = (() => {
    // Non-modal floating windows: never trapped in, never made inert.
    const FLOATING = "#console-modal, .console-modal, .photo-frame, .furni-card";
    // Top-level things that are not page content, or that must go on being
    // heard while a window is up (the "Saved" note is a live region).
    //
    // .ff-rotate is Fallin' Furni's "turn your screen sideways" gate. It is a
    // top-level cover over the whole page, and with the game's pause dialog
    // open it was made inert along with everything else — so a phone turned
    // upright mid-pause showed a gate whose "Back to Maze Rats" could not be
    // pressed, over a dialog that could not be seen. Named here as well as by
    // the data-trap-keep the page puts on it, so neither alone is load-bearing.
    const NEVER_INERT = "script, style, link, template, noscript, [role='status'], [role='alert'], [aria-live], .saved-note, .ff-rotate, [data-trap-keep]";
    const CANDIDATES = [
        "a[href]", "area[href]", "button", "input", "select", "textarea", "iframe",
        "summary", "audio[controls]", "video[controls]", "[tabindex]",
        "[contenteditable]:not([contenteditable='false'])"
    ].join(",");

    const managed = new Set();      // what THIS trap made inert

    function isShown(el) {
        if (!el || !el.isConnected) return false;
        // display:none on it or any ancestor leaves no boxes at all.
        if (!el.getClientRects().length) return false;
        // Computed, so an inherited visibility:hidden counts too.
        if (getComputedStyle(el).visibility === "hidden") return false;
        if (el.closest("[hidden]")) return false;
        return true;
    }

    const regionOf = dialog => dialog.closest(".modal-overlay") || dialog;

    function topDialog() {
        let best = null;
        document.querySelectorAll('[aria-modal="true"]').forEach(dialog => {
            if (dialog.closest(FLOATING)) return;
            if (!isShown(dialog)) return;
            const region = regionOf(dialog);
            if (region.classList.contains("closing")) return;
            if (!best || EscapeLayers.inFront(region, best.region)) best = { dialog, region };
        });
        return best;
    }

    // Attributes, not the property: in a browser without inert the property
    // is a plain expando that would lie about what is set.
    function sync(top) {
        const want = new Set();
        if (top && document.body) {
            for (const child of Array.from(document.body.children)) {
                if (child.contains(top.region)) continue;
                if (child.matches(FLOATING) || child.matches(NEVER_INERT)) continue;
                want.add(child);
            }
        }
        managed.forEach(el => {
            if (want.has(el) && el.isConnected) return;
            el.removeAttribute("inert");
            managed.delete(el);
        });
        want.forEach(el => {
            if (managed.has(el) || el.hasAttribute("inert")) return;
            el.setAttribute("inert", "");
            managed.add(el);
        });
        /* The page behind stops scrolling while any dialog is open (see
           html.has-open-dialog in style.css). Held here rather than by each
           window's own body.modal-open, because the maze window never set
           that class, and with several windows sharing one class, closing
           any of them unlocked the page under the others. This knows
           whether ANY dialog is open. */
        document.documentElement.classList.toggle("has-open-dialog", !!top);
    }

    function refresh() {
        try { sync(topDialog()); } catch (e) {
            // Never strand the page: whatever went wrong, hand back
            // everything this trap took.
            managed.forEach(el => el.removeAttribute("inert"));
            managed.clear();
            document.documentElement.classList.remove("has-open-dialog");
        }
    }

    function isTabbable(el) {
        if (el.tabIndex < 0) return false;
        if (el.matches(":disabled")) return false;
        if (el.closest("[inert], [aria-hidden='true']")) return false;
        // Only a <details>' own first summary is a control.
        if (el.tagName === "SUMMARY" && !(el.parentElement && el.parentElement.tagName === "DETAILS"
            && el.parentElement.querySelector(":scope > summary") === el)) return false;
        return isShown(el);
    }

    // In tab order: positive tabindex first (in order, DOM order breaking
    // ties — sort is stable), then everything at 0 in DOM order. A radio
    // group is one stop, as the browser makes it: the checked one, or the
    // first when none is.
    function tabbables(region) {
        const found = Array.from(region.querySelectorAll(CANDIDATES)).filter(isTabbable);
        const groupStop = new Map();
        found.forEach(el => {
            if (el.type !== "radio" || !el.name) return;
            const key = (el.form ? "f:" : "r:") + el.name;
            const cur = groupStop.get(key);
            if (!cur || (el.checked && !cur.checked)) groupStop.set(key, el);
        });
        const list = found.filter(el => el.type !== "radio" || !el.name
            || groupStop.get((el.form ? "f:" : "r:") + el.name) === el);
        const positive = list.filter(el => el.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
        return positive.concat(list.filter(el => el.tabIndex === 0));
    }

    function moveTo(el) {
        el.focus();
        // What a real Tab does to a text field: the whole value selected,
        // ready to be typed over.
        if (el.tagName === "INPUT" && /^(text|search|url|tel|email|password|number)$/.test(el.type)) {
            try { el.select(); } catch (e) { /* number inputs in some browsers */ }
        }
    }

    /* What else is open beside the front window and stays in its Tab cycle,
       after the window's own controls.

       The "Saved" note and the Habbo Console are never made inert (see
       NEVER_INERT and FLOATING), so a pointer could always reach them — but
       the cycle below is moved by hand around the dialog's region alone, so
       from the keyboard they were simply unreachable while the maze window
       was open: Tab went round the window and never came out. The note's
       "Take me there" is the one thing it offers, and the console is a whole
       window. They are appended to the END of the cycle rather than skipped,
       so Tab past the window's last control visits them and then wraps. */
    const KEPT_IN_CYCLE = ".saved-note, #console-modal";

    function extrasFor(top) {
        /* The forced "Pick a new nickname" window is answer-only: Tab must
           not walk out of it into the console behind (29 Sept 2026). */
        if (top.region.matches && top.region.matches(".nick-overlay.is-forced")) return [];
        return Array.from(document.querySelectorAll(KEPT_IN_CYCLE)).filter(el =>
            !top.region.contains(el) && !el.classList.contains("is-out") && isShown(el));
    }

    document.addEventListener("keydown", e => {
        if (e.key !== "Tab" || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
        /* Through the same safety net refresh() has. The mutation observer's
           refresh() was wrapped, but this handler called topDialog() and
           sync() bare, so anything that threw in them (a getComputedStyle
           on a node mid-removal, a comparison against a window being torn
           down) threw on EVERY Tab for as long as the condition lasted, and
           left whatever sync() had half-done — inert set on the page, the
           scroll lock on — with nothing to undo it. Now a failure hands the
           page back (refresh's own catch) and Tab is left to the browser,
           before anything is prevented. The list is built inside the same
           net, for the same reason. */
        let top, extras, list, inExtra;
        const active = document.activeElement;
        try {
            top = topDialog();
            sync(top);
            if (!top) return;
            extras = extrasFor(top);
            inExtra = el => extras.some(x => x.contains(el));
            // A floating window OUTSIDE the dialog keeps the browser's own
            // Tab order — unless it is one of the extras above, which are
            // part of the cycle. The maze window's photo frames and furni
            // cards live inside its overlay now, so they are part of the
            // region and Tab cycles through them with everything else.
            const floating = active && active !== document.body && active.closest && active.closest(FLOATING);
            if (floating && !top.region.contains(floating) && !inExtra(floating)) return;
            list = tabbables(top.region);
            extras.forEach(x => { list.push(...tabbables(x)); });
        } catch (err) {
            refresh();
            return;
        }
        e.preventDefault();
        if (!list.length) {
            // Nothing to move between: hold focus on the window itself.
            if (top.dialog.tabIndex < 0 && !top.dialog.hasAttribute("tabindex")) top.dialog.setAttribute("tabindex", "-1");
            top.dialog.focus();
            return;
        }
        const idx = list.indexOf(active);
        if (idx !== -1) {
            moveTo(list[(idx + (e.shiftKey ? list.length - 1 : 1)) % list.length]);
            return;
        }
        if (!active || (!top.region.contains(active) && !inExtra(active))) {
            moveTo(list[0]);
            return;
        }
        /* Inside the window but on something not in the cycle — the dialog
           itself (every window focuses that on open), a heading, a control
           that has just been hidden. Go to the next or previous one after it
           in the document, wrapping, which is what the browser would do if
           it could be trusted to stay inside. Descendants count as "after":
           Tab from the dialog lands on its first control. */
        const inOrder = list.slice().sort((a, b) =>
            (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
        if (e.shiftKey) {
            let prev = null;
            for (const el of inOrder) {
                const pos = active.compareDocumentPosition(el);
                if ((pos & Node.DOCUMENT_POSITION_PRECEDING) && !(pos & Node.DOCUMENT_POSITION_CONTAINS)) prev = el;
            }
            moveTo(prev || inOrder[inOrder.length - 1]);
        } else {
            const next = inOrder.find(el => active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
            moveTo(next || inOrder[0]);
        }
    });

    // See THE FOCUS PATCH above.
    const nativeFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function () {
        if (managed.size) {
            for (const el of managed) {
                if (el.contains(this)) { refresh(); break; }
            }
        }
        return nativeFocus.apply(this, arguments);
    };

    /* Whether a batch of mutations could have opened or shut a window.
       refresh() measures (getClientRects forces layout), and pages like
       Fallin' Furni and the room gallery rewrite styles many times a
       second, so it only runs when a change touched a dialog or one of its
       ancestors, or the top level of <body>. Deciding that is containment
       checks only — no layout. */
    function relevant(records) {
        const dialogs = Array.from(document.querySelectorAll('[aria-modal="true"]'));
        const hasDialog = node => node.nodeType === 1
            && (node.matches('[aria-modal="true"]') || !!node.querySelector('[aria-modal="true"]'));
        for (const r of records) {
            if (r.type === "childList") {
                if (r.target === document.body) return true;
                for (const n of r.addedNodes) if (hasDialog(n)) return true;
                for (const n of r.removedNodes) if (hasDialog(n)) return true;
            } else if (dialogs.some(d => r.target === d || r.target.contains(d))) {
                return true;
            }
        }
        return false;
    }

    // Kept up to date as windows open and shut. "inert" is deliberately not
    // in the filter: sync() writes it, and must not wake itself up.
    function observe() {
        new MutationObserver(records => { if (relevant(records)) refresh(); }).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["class", "style", "hidden", "open", "aria-modal"]
        });
        refresh();
    }
    if (document.body) observe();
    else document.addEventListener("DOMContentLoaded", observe);

    /* AND WHEN home.html's GATE REVEALS THE PAGE.

       <html> ships visibility:hidden until the gate in home.html's <head>
       has decided, and isShown() rightly counts everything under it as not
       shown. A window opened in that time — a pasted /maze/<slug> link opens
       the room modal as soon as the data lands, which can be before the gate
       answers — was therefore not a dialog as far as this trap knew, and
       nothing told it otherwise when the page appeared: the reveal is a
       style change on <html>, and the observer above watches <body>. Tab
       walked straight out of the window behind it until something else
       happened to touch a dialog.

       So <html>'s own style and the gate's peek flag are watched too (not
       its class: sync() writes has-open-dialog there, and must not wake
       itself up), the gate's reveal() calls refresh() itself when this has
       loaded, and one more refresh at DOMContentLoaded covers a reveal that
       happened while this file was still on its way. */
    try {
        new MutationObserver(refresh).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style", "data-gate-peek"]
        });
    } catch (e) { /* no observer: the gate's own call below still reaches it */ }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh);

    return { refresh };
})();
window.FocusTrap = FocusTrap;

/* ---------- a maze's, event's or guide's own address ----------

   /maze/<slug>, /event/<slug>, /guides/<slug>. The slug follows the
   record's name and comes from the API (see netlify/functions/_slugs.js);
   the id stands in for a record that has none, such as one from the offline
   copy, and the share function sends an id on to the right address. */
const RecordAddress = (() => {
    const PREFIX = { maze: "maze", event: "event", guide: "guides" };
    const PATH = /^\/(maze|event|guides)\/([^/?#]+)\/?$/;
    return {
        of(kind, record) {
            const key = record && (record.slug || record.id);
            return key ? `/${PREFIX[kind]}/${encodeURIComponent(key)}` : "";
        },
        // { kind, key } for an address naming a record, else null.
        parse(pathname) {
            const m = PATH.exec(pathname || "");
            if (!m) return null;
            let key;
            try { key = decodeURIComponent(m[2]); } catch (e) { return null; }
            return { kind: m[1] === "guides" ? "guide" : m[1], key };
        },
        // Whether a record answers to `key`: its address, or its id.
        matches(record, key) {
            if (!record || !key) return false;
            const k = String(key).toLowerCase();
            return (record.slug && record.slug === k) || record.id === key || String(record.id || "").toLowerCase() === k;
        }
    };
})();
window.RecordAddress = RecordAddress;

/* ---------- the page's title, canonical and og:url ----------

   A window that has an address of its own (a maze, a guide, the Alt Codes)
   names it in the title, canonical and og:url while it is open, and puts
   the page's back on close. What "the page's" means is not always what the
   <head> said at load: at /maze/<slug> the share function wrote the maze's
   tags there, and keeps the archive's in data-archive (see
   netlify/functions/share.js). Closing the window leaves the archive, so the
   archive's are the ones put back.

   ---- A STACK OF HOLDERS, NOT ONE (28 Sept 2026).

   It used to remember a single owner. Open a maze, open the Guides over it,
   close the Guides: restore("guides") put the ARCHIVE's title back, under a
   maze window that was still open and still naming its maze in the address
   bar. And the other order — close the maze first — did nothing at all,
   because "modal" was no longer the owner, so the guide's title outlived its
   window. Now every holder is kept in the order it arrived, restore(who)
   takes out that one wherever it sits, and what shows is whoever is left on
   top — or the archive's, once nobody is. A holder that names itself again
   (the Guides moving from one guide to the next) is updated where it
   stands rather than moved to the top, so it cannot jump in front of a
   window opened after it. */
const PageMeta = (() => {
    const titleEl = () => document.querySelector("title");
    const canonicalEl = () => document.querySelector('link[rel="canonical"]');
    const ogUrlEl = () => document.querySelector('meta[property="og:url"]');
    const archive = (el, attr) => (el ? (el.hasAttribute("data-archive") ? el.getAttribute("data-archive") : el.getAttribute(attr)) : null);
    let saved = null;
    const holders = [];         // { who, title, url }, oldest first

    // Whoever is on top, or the archive's own when nobody is.
    function apply() {
        const top = holders[holders.length - 1];
        const title = top && top.title ? top.title : saved.title;
        document.title = title;
        const c = canonicalEl(), o = ogUrlEl();
        if (top && top.url) {
            if (c) c.setAttribute("href", top.url);
            if (o) o.setAttribute("content", top.url);
        } else {
            if (c && saved.canonical !== null) c.setAttribute("href", saved.canonical);
            if (o && saved.ogUrl !== null) o.setAttribute("content", saved.ogUrl);
        }
    }

    return {
        /* Names `url` and `title` for as long as `who` holds it. A second
           window taking over keeps the page's originals rather than saving
           the first window's as them. */
        set(who, title, url) {
            if (!saved) {
                const t = titleEl();
                saved = {
                    title: t && t.hasAttribute("data-archive") ? t.getAttribute("data-archive") : document.title,
                    canonical: archive(canonicalEl(), "href"),
                    ogUrl: archive(ogUrlEl(), "content")
                };
                // Decoded once, here: data-archive holds page text, entities and all.
                const d = document.createElement("textarea");
                d.innerHTML = saved.title;
                saved.title = d.value;
            }
            const entry = holders.find(h => h.who === who);
            if (entry) {
                entry.title = title;
                entry.url = url;
            } else {
                holders.push({ who, title, url });
            }
            apply();
        },
        /* Lets go of `who`'s hold, and shows whoever is left — the page's
           own once nobody is. No `who` lets go of everything. */
        restore(who) {
            if (!saved) return;
            if (who) {
                const at = holders.findIndex(h => h.who === who);
                if (at === -1) return;
                holders.splice(at, 1);
            } else {
                holders.length = 0;
            }
            apply();
            if (!holders.length) saved = null;
        }
    };
})();
window.PageMeta = PageMeta;

/* A fragment-only link on a page with <base href="/"> (home.html) resolves
   to "/#x" — the landing page — rather than to "#x" on this one. home.html
   has one because it is served at /maze/<slug> and the other record
   addresses (see the note beside its <base>); its skip link and the
   footer's #privacy link are fragment links. So they are followed here, on
   this page, exactly as a browser follows one without a base: the hash
   changes and the hashchange handlers do the rest. */
document.addEventListener("click", e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!document.querySelector("base[href]")) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.target === "_blank") return;
    e.preventDefault();
    const frag = a.getAttribute("href").slice(1);
    if (!frag) return;
    if (location.hash === "#" + frag) {
        // The same hash fires no hashchange, and a browser only scrolls.
        const el = document.getElementById(frag);
        if (el) el.scrollIntoView();
        return;
    }
    /* At a record's own address the hash REPLACES the entry rather than
       pushing one. Pushed, it stacked /maze/a#privacy on top of /maze/a —
       and when the window opened from a pasted link was then closed, only
       the top entry was rewritten to /home, leaving /maze/a underneath for
       the next Back to reopen. The hashchange a browser would fire is fired
       by hand, since replaceState fires none. */
    if (window.RecordAddress && RecordAddress.parse(location.pathname)) {
        const oldURL = location.href;
        try {
            // The whole path, not "#frag" alone: a relative URL here
            // resolves against <base href="/">, which made it "/#frag" —
            // the landing page's address, not this one.
            history.replaceState(history.state, "", location.pathname + location.search + "#" + frag);
            window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL: location.href }));
            const el = document.getElementById(frag);
            if (el) el.scrollIntoView();
            return;
        } catch (err) { /* fall through to an ordinary hash change */ }
    }
    location.hash = frag;
});

// Small "what's coming up" readout in the header — shown on every page that
// has the #header-events markup (a no-op elsewhere). Rotates through every
// upcoming event every 10s with the same clone-and-slide technique the maze
// modal's image carousel uses (see slideGalleryImage in home.js), so a
// second event's title/time slides in from the right while the first
// slides out to the left.
document.addEventListener("DOMContentLoaded", async () => {
    const widget = document.getElementById("header-events");
    const viewport = document.getElementById("header-events-viewport");
    const slideEl = document.getElementById("header-events-slide");
    if (!widget || !viewport || !slideEl || typeof Api === "undefined") return;

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // An event can be announced before it is scheduled, so this line has to
    // carry its own label: everywhere else "TBC" sits after a "Date:" the
    // caller supplied, but here it is the whole line and a bare "TBC" under
    // a title says nothing about what is to be confirmed.
    function formatEventWhen(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "Date TBC";
        const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
        const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
        return `${date}, ${time} UTC`;
    }

    function slideMarkup(event) {
        if (!event) {
            return `<p class="header-events-title">No upcoming events.</p><p class="header-events-when">Check back later!</p>`;
        }
        // On the welcome page (index.html) this is a same-page hash only —
        // js/welcome.js listens for it and opens its own lightweight event
        // modal right there, since home.html itself is off-limits to
        // regular visitors during Coming Soon/Maintenance and would just
        // bounce them straight back here anyway (see the pre-load gate in
        // home.html's own <head>). Everywhere else it points at the event's
        // own address, /event/<slug> — a normal navigation from any other
        // page, and opened in place by js/home.js on the archive itself.
        const isWelcome = document.body.dataset.page === "welcome";
        const href = isWelcome
            ? `#event-${encodeURIComponent(event.id || "")}`
            : RecordAddress.of("event", event);
        return `<a class="header-events-title" href="${href}">${escapeHtml(event.title || "")}</a><p class="header-events-when">${formatEventWhen(event.date)}</p>`;
    }

    let events = [];
    try {
        events = await Api.getEvents();
    } catch (e) {
        events = [];
    }

    // Date-derived, same as the listings on home.html (see
    // js/event-status.js) — reading the stored status here meant the ticker
    // went on advertising an event that had already finished, and a live one
    // dropped out of it entirely. A live event sorts to the front: it's the
    // one someone can act on right now.
    //
    // WORKED OUT AFRESH ON EVERY TURN of the ticker, not once at load. The
    // list used to be built when the page opened and kept, so a tab left
    // open across an event's end went on advertising it for as long as the
    // tab lived — the status logic was right, it just was never asked again.
    // Re-deriving it every ten seconds costs a filter and a sort over a
    // few dozen events.
    function currentUpcoming() {
        return events
            // No longer requires a date. An event with none is upcoming (see
            // js/event-status.js) and belongs in the ticker — being announced
            // before it is scheduled is the normal way round.
            .filter(e => EventStatus.isUpcomingish(e))
            // Soonest first, with the undated ones after everything scheduled:
            // they can't be placed on the calendar, and they are the least
            // urgent thing in the list precisely because no date is set. The
            // empty string this leans on also can't throw the way a missing
            // .date would have.
            .sort((a, b) => {
                const ad = a.date || "", bd = b.date || "";
                if (!ad !== !bd) return ad ? -1 : 1;
                return ad.localeCompare(bd);
            })
            .sort((a, b) => (EventStatus.derive(b) === "live" ? 1 : 0) - (EventStatus.derive(a) === "live" ? 1 : 0));
    }

    widget.style.display = "block";
    let upcoming = currentUpcoming();
    let index = 0;
    // What is on screen, by identity rather than by position: when the list
    // is rebuilt and an event has dropped out of it, "the one after the
    // current one" has to be found again rather than assumed to be index+1.
    let showing = upcoming[0] || null;

    /* Every write of the slide goes through here, for two things the bare
       innerHTML did not do.

       FOCUS FOLLOWS THE LINK. The hold below keeps the ticker still while it
       has focus, but an event that ENDS under that focus is still replaced —
       and innerHTML throws the focused <a> away, dropping a keyboard user on
       <body> at the top of the page. So when focus was inside the widget it
       is put on the new link, without scrolling. ("No upcoming events" has
       no link to take it; that one case still lets focus go.)

       THE GATED REWRITE. The link points at /event/<slug>, which on a gated
       site bounces a visitor through home.html's gate to the landing page.
       The rewrite at the foot of this file runs once at DOMContentLoaded,
       before this slide exists, so it is run again on every slide written. */
    function writeSlide(event) {
        const hadFocus = widget.contains(document.activeElement);
        slideEl.innerHTML = slideMarkup(event);
        if (typeof pointGatedLinksHome === "function") pointGatedLinksHome(slideEl);
        if (hadFocus && !widget.contains(document.activeElement)) {
            const link = slideEl.querySelector("a[href]");
            if (link) link.focus({ preventScroll: true });
        }
    }
    writeSlide(showing);

    /* HELD STILL while somebody is pointing at it or has tabbed into it.
       It used to turn over every ten seconds regardless, so a reader halfway
       through a title lost it, and a keyboard user who had tabbed onto the
       link had it replaced under them — innerHTML swaps the <a> out, and
       focus fell back to <body>. Hover and focus both hold it; leaving
       releases it, and the next tick moves on as usual. */
    let hovered = false, focused = false;
    widget.addEventListener("pointerenter", () => { hovered = true; });
    widget.addEventListener("pointerleave", () => { hovered = false; });
    widget.addEventListener("focusin", () => { focused = true; });
    widget.addEventListener("focusout", e => {
        if (!widget.contains(e.relatedTarget)) focused = false;
    });

    /* prefers-reduced-motion: it still turns over, but in place, with no
       slide. The slide is the motion somebody has asked not to be shown; the
       other events are information, and not rotating at all would leave the
       second and later ones unreachable from the header. Read on every tick,
       not once, so changing the setting takes effect without a reload. */
    const reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

    // Always armed, even for a list of one or none. A single event that
    // ends has to be taken down, and one that goes live later has to appear,
    // and neither happens if the timer only exists when there was already
    // something to rotate.
    setInterval(() => {
        upcoming = currentUpcoming();
        const at = showing ? upcoming.indexOf(showing) : -1;
        // Nothing to rotate through: settle on whatever is true now
        // without an animation, and only touch the DOM if it changed.
        if (upcoming.length <= 1) {
            const only = upcoming[0] || null;
            if (only !== showing) {
                showing = only;
                index = 0;
                writeSlide(showing);
            }
            return;
        }
        // Held, and what it holds is still true: leave it be. An event that
        // has ENDED under the pointer is still replaced (below) — holding a
        // finished event up as "coming up" is the bug currentUpcoming exists
        // to prevent.
        if ((hovered || focused) && at !== -1) return;
        // The current one gone (it ended) means the next is whatever
        // now sits where it was, which is the start if it was last.
        const nextIndex = at === -1 ? (index % upcoming.length) : (at + 1) % upcoming.length;

        if (hovered || focused || (reducedMotion && reducedMotion.matches)) {
            writeSlide(upcoming[nextIndex]);
            index = nextIndex;
            showing = upcoming[nextIndex];
            return;
        }

        // Rolling-ticker style — both slides travel upward together (the
        // outgoing one exits off the top, the incoming one enters from
        // below) rather than sliding sideways.
        const outgoing = slideEl.cloneNode(true);
        outgoing.removeAttribute("id");
        outgoing.classList.add("header-events-slide-outgoing");
        outgoing.style.transition = "none";
        outgoing.style.transform = "translateY(0)";
        viewport.appendChild(outgoing);

        slideEl.style.transition = "none";
        slideEl.style.transform = "translateY(100%)";
        writeSlide(upcoming[nextIndex]);

        // Commits the "start" transforms above before the transition to
        // their end state is requested below — otherwise both style
        // writes get coalesced into one paint and neither one visibly
        // moves (same reflow trick as slideGalleryImage in home.js).
        void slideEl.offsetWidth;

        outgoing.style.transition = "";
        slideEl.style.transition = "";
        outgoing.style.transform = "translateY(-100%)";
        slideEl.style.transform = "translateY(0)";

        outgoing.addEventListener("transitionend", () => outgoing.remove(), { once: true });

        index = nextIndex;
        showing = upcoming[nextIndex];
    }, 10000);
});

// "Fellow Fansites" strip, injected right before .site-footer on every page
// that has one — kept in one shared place rather than pasted into each
// HTML file by hand, so the list only ever needs updating here.
document.addEventListener("DOMContentLoaded", () => {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;

    const SITES = [
        ["Bobba.me", "https://bobba.me/"],
        ["DuckieWorld", "https://duckieworld.com/"],
        ["FranklyOrigins", "https://franklyorigins.net/"],
        ["FurniIndex", "https://furniindex.com/"],
        ["HabboBase", "https://habbobase.com/"],
        ["HabboFishing", "https://habbofishing.com/"],
        ["HabboGardening", "https://habbogardening.com/"],
        ["Leet.show", "https://leet.show/"],
        ["Liminal Labyrinth", "https://liminallabyrinth.quest/"],
        ["RockHabbo", "https://rockhabbo.com/"],
        ["solochef.io", "https://solochef.io/"]
    ];

    const section = document.createElement("div");
    section.className = "fellow-fansites";
    section.innerHTML = `
        <p class="fellow-fansites-title">Fellow Fansites</p>
        <p class="fellow-fansites-links">
            ${SITES.map(([label, url]) =>
                // Each link and the dot that follows it are one wrapping unit.
                // The list is a centred flex row (see .fellow-fansites-links),
                // so the separators are laid out as real boxes with real gaps
                // rather than as inline text: every wrapped line then centres on
                // its own items instead of being pushed off-centre by a dangling
                // dot and its surrounding spaces. The last item's dot is hidden
                // in CSS rather than skipped here.
                `<span class="fellow-fansites-item"><a href="${url}" target="_blank" rel="noopener">${label}</a><span class="fellow-fansites-dot" aria-hidden="true">&bull;</span></span>`
            ).join("")}
        </p>
    `;
    footer.parentNode.insertBefore(section, footer);
});

/* Links to the archive, pointed at the landing page for a visitor who
   cannot get into the archive.

   While the site is in Coming Soon or Maintenance, the pre-load gate in
   home.html's <head> bounces every non-admin to index.html. Four pages a
   gated visitor can reach — the atlas, the 404 page, the policy, and the
   admin login — carry a link to home.html in the brand, and the 404 page
   offers "The archive" as the one way out of it. All of them worked, in the
   sense that the reader ended up somewhere sensible; what they did was go
   to a page, wait on a settings request, and get sent somewhere else, with
   a blank screen in the middle because the gate keeps the body hidden until
   it has decided. One round trip to arrive where the first link could have
   pointed.

   Only rewritten when the answer is already certain: the last landing state
   this browser saw says gated, AND there is no admin token to try. An admin
   session CAN pass the gate, so its links are left alone — sending a signed
   in admin to the landing page would cost them a click every time to save a
   moment they never spend. No cached state, which is a first-ever visit,
   also leaves them alone: the bounce is the current behaviour and one visit
   of it is not worth guessing over.

   Written against the cached value rather than site.js's own settings fetch
   on purpose. That fetch resolves some time after the page is usable, and a
   link that changes where it points while somebody is reaching for it is a
   worse thing than the round trip this avoids.

   A FUNCTION NOW, taking the part of the page to look in, because not every
   such link exists at DOMContentLoaded: the header ticker writes its
   /event/<slug> link later, and again on every turn, and calls this on
   each new slide (see writeSlide). */
function pointGatedLinksHome(root) {
    let state = null, token = null;
    try {
        state = localStorage.getItem("mazerats_landing_state");
        token = localStorage.getItem("mazerats_admin_token");
    } catch (e) { return; }      // private mode: nothing known, change nothing
    if (token) return;
    if (state !== "coming-soon" && state !== "maintenance") return;
    /* Never on the archive itself. A visitor looking at home.html has been
       let in by its gate — and this can run BEFORE that gate has written its
       answer (the page parses while it is still hidden, and the ticker can
       land first), so a cached "coming-soon" from last week would otherwise
       point the ticker's and the archive's own links at the landing page on
       the very visit the site opened to them. */
    if (document.body && document.body.dataset.page === "home") return;

    /* Every spelling of the archive's address, not just the bare filename.
       The page answers to /home and /home.html alike, links to it are
       written both ways, and some carry a #maze-… or #event-… fragment
       (js/guess.js's "See it in the archive", the share pages) — all of
       which land on the same gate and get the same bounce. Matching only
       the exact string href="home.html" quietly missed every one of them,
       which is the whole bug this block exists to avoid.

       The fragment is dropped rather than carried over: it names a maze in
       an archive this visitor cannot open, and the landing page has nothing
       to do with it.

       AND THE RECORD ADDRESSES. /maze/<slug>, /event/<slug> and
       /guides/<slug> are home.html too (served by netlify/functions/share.js)
       behind the same gate, and they are what the ticker, js/guess.js and
       the share pages link to now. Matching only the "home" spellings missed
       every one of them — the same bug, one rename later. */
    const ARCHIVE = /^(?:\/)?(?:home(?:\.html)?|(?:maze|event|guides)\/[^?#]*)(?:[#?].*)?$/;
    (root || document).querySelectorAll("a[href]").forEach(a => {
        if (ARCHIVE.test(a.getAttribute("href") || "")) a.href = "/";
    });
}
document.addEventListener("DOMContentLoaded", () => pointGatedLinksHome(document));

// Privacy Policy link, appended onto the end of .site-footer's own
// copyright line (its last <p>) rather than as a separate line of its
// own. Where it points depends on whether the page it is sitting on can
// show the policy itself: home.html and index.html both can, in a modal,
// so they get a same-page hash and no navigation at all. Everywhere else
// goes to /privacy, which is the policy with an address of its own.
document.addEventListener("DOMContentLoaded", () => {
    const footer = document.querySelector(".site-footer");
    const copyrightLine = footer ? footer.querySelector("p:last-child") : null;
    if (!copyrightLine) return;

    // index.html gets a same-page hash too, not a link to home.html:
    // during Coming Soon/Maintenance that page bounces every non-admin
    // straight back here (see its own pre-load gate), which made the
    // policy unreachable for precisely the visitors who can only see
    // the landing page. js/welcome.js opens its own modal off this hash.
    const page = document.body.dataset.page;
    // The policy page does not need a link to itself in its own footer.
    if (page === "legal") return;
    /* And /privacy rather than home.html#privacy for every other page, for
       the same reason index.html does not link there either. The atlas, the
       game and the 404 page are all reachable while the site is in Coming
       Soon — the 404 page especially, since that is where a stale link
       lands — and from any of them "Privacy Policy" went to home.html,
       whose gate bounced the reader to the landing page and dropped the
       hash on the way. The link was not broken so much as quietly
       pointless: it navigated somewhere, just never to the policy.

       This is also simply the better target now that it exists. The note
       above used to say the policy was not a standalone page; privacy.html
       has been one for a while, it is the version that can be linked,
       printed and read without a 204px porthole, and it is served at
       /privacy — see the rewrite in netlify.toml. */
    const href = (page === "home" || page === "welcome") ? "#privacy" : "/privacy";
    copyrightLine.insertAdjacentHTML(
        "beforeend",
        ` <span class="footer-dot" aria-hidden="true">&middot;</span> <a href="${href}">Privacy Policy</a>`
    );
});


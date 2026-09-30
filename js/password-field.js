/* ===========================================================
   Maze Rats — password fields

   Upgrades every <input type="password"> on the admin page into a field
   that carries an eye button on the right to show/hide what's typed.

       .password-field
           input  (type=password while hidden, type=text while shown)
           button (the eye)

   A real password field, and only a password field while hidden
   (30 Sept 2026). This used to be a type="text" field drawing "••••" over
   a value the module kept to itself, with a hidden partner input carrying
   the real value under the field's name and every keystroke routed by
   hand. Browsers and password managers decide what a password is by the
   field's type, so Chrome offered to save the visible field — the row of
   bullets — as the password, and IMEs and Android keyboards had to be
   reconciled after the fact. Now the field stays type="password" whenever
   it is masked, so the browser draws the mask, holds the real value and
   treats it as a password in every way; the eye just swaps it to
   type="text" while you look, and back. The name stays on the field
   itself, so FormData (the Warren's login and reset forms) reads it as it
   always did.
   =========================================================== */

(function () {
    "use strict";

    // Set on each enhanced field as data-password-field, which
    // js/glyph-palette.js reads to keep glyphs out of passwords.
    const ENHANCED_FLAG = "passwordField";

    const EYE_SHOW = `
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
            <path d="M1 8s2.6-4.4 7-4.4S15 8 15 8s-2.6 4.4-7 4.4S1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.4"/>
            <circle cx="8" cy="8" r="1.9" fill="currentColor"/>
        </svg>`;

    // Same eye struck through. The slash is drawn twice — once thick in the
    // field's own background colour, then again in the icon colour — so it
    // reads as a clean break across the eye rather than merging into it.
    const EYE_HIDE = `
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
            <path d="M1 8s2.6-4.4 7-4.4S15 8 15 8s-2.6 4.4-7 4.4S1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.4"/>
            <circle cx="8" cy="8" r="1.9" fill="currentColor"/>
            <line class="pw-slash-bg" x1="2.6" y1="13.4" x2="13.4" y2="2.6" stroke-width="3.2"/>
            <line x1="2.6" y1="13.4" x2="13.4" y2="2.6" stroke="currentColor" stroke-width="1.4"/>
        </svg>`;

    const LINE_BREAKS = /[\r\n]+/g;

    /* Each enhanced field's clear, keyed by the input. The field's own
       .value is now the real password, so reading it needs nothing from
       here; PasswordField.value stays for the callers that already use it.
       Clearing does need the module, to put the mask back as well. */
    const controllers = new WeakMap();

    function enhance(input) {
        if (!input || input.dataset[ENHANCED_FLAG]) return;
        input.dataset[ENHANCED_FLAG] = "true";

        const parent = input.parentNode;
        if (!parent) return;

        let revealed = false;

        // Only matters while revealed, when the field is plain text: a
        // spellchecker or autocapitaliser has no business in a password.
        input.setAttribute("spellcheck", "false");
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("autocorrect", "off");

        const wrap = document.createElement("div");
        wrap.className = "password-field";
        parent.insertBefore(wrap, input);
        wrap.appendChild(input);

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "password-toggle";
        wrap.appendChild(toggle);

        function render() {
            // Swapping the type keeps the value; the selection is kept by
            // hand, since some browsers reset it when the type changes.
            const focused = document.activeElement === input;
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.type = revealed ? "text" : "password";
            // Kept for the stylesheet's letter-spacing on the mask.
            input.dataset.masked = revealed ? "false" : "true";
            if (focused && start != null) {
                try { input.setSelectionRange(start, end); } catch (e) { /* not selectable */ }
            }

            toggle.innerHTML = revealed ? EYE_HIDE : EYE_SHOW;
            const label = revealed ? "Hide password" : "Show password";
            toggle.setAttribute("aria-label", label);
            toggle.setAttribute("title", label);
            toggle.setAttribute("aria-pressed", String(revealed));
        }

        /* No line breaks (30 Sept 2026). A password copied with its line
           ending — a triple-click in a document, a line from a terminal —
           has to arrive without it, or it is refused as wrong. Browsers
           differ on what a one-line field does with a pasted "\n" (drop it,
           or turn it into a space), so a paste or drop carrying one is
           applied here with the breaks taken out. */
        function insertStripped(e, text) {
            if (!text || !/[\r\n]/.test(text)) return;
            e.preventDefault();
            const clean = text.replace(LINE_BREAKS, "");
            const start = input.selectionStart != null ? input.selectionStart : input.value.length;
            const end = input.selectionEnd != null ? input.selectionEnd : start;
            input.value = input.value.slice(0, start) + clean + input.value.slice(end);
            const caret = start + clean.length;
            try { input.setSelectionRange(caret, caret); } catch (err) { /* not selectable */ }
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }

        input.addEventListener("paste", e => {
            const data = e.clipboardData || window.clipboardData;
            insertStripped(e, data ? data.getData("text") : "");
        });
        input.addEventListener("beforeinput", e => {
            if (e.inputType !== "insertFromDrop" || e.cancelable === false) return;
            insertStripped(e, e.data || (e.dataTransfer && e.dataTransfer.getData("text")) || "");
        });

        toggle.addEventListener("click", () => {
            revealed = !revealed;
            // Focus goes back to the field (the click took it), so revealing
            // to check a password doesn't cost you your place in it.
            input.focus();
            render();
        });

        // Back to empty and masked.
        function clear() {
            input.value = "";
            revealed = false;
            render();
        }

        const form = input.closest("form");
        if (form) {
            // A form reset empties the field itself; this puts the mask back.
            form.addEventListener("reset", () => { revealed = false; render(); });
            /* Masked again on the way out, so a password submitted while
               showing is still a password field when the browser looks at
               the form to offer saving it. Capture phase, so it happens
               before any submit handler replaces or empties the form. */
            form.addEventListener("submit", () => {
                if (revealed) { revealed = false; render(); }
            }, true);
        }

        controllers.set(input, { clear });

        render();
    }

    /* The public half. Both accept a field that was never enhanced
       (password-field.js failed to load, or the field is a plain one), so a
       caller never has to ask which kind it has. */
    window.PasswordField = {
        value(input) {
            return input ? (input.value || "") : "";
        },
        clear(input) {
            if (!input) return;
            const c = controllers.get(input);
            if (c) c.clear();
            else input.value = "";
        }
    };

    function enhanceWithin(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.matches && root.matches('input[type="password"]')) enhance(root);
        const nested = root.querySelectorAll ? root.querySelectorAll('input[type="password"]') : [];
        nested.forEach(enhance);
    }

    function init() {
        enhanceWithin(document.body);

        // The admin panel builds its Add Admin / Reset Password forms at
        // runtime, so their password fields don't exist at load — this picks
        // them up whenever they're rendered, with no call needed from
        // admin.js.
        new MutationObserver(mutations => {
            mutations.forEach(m => m.addedNodes.forEach(enhanceWithin));
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

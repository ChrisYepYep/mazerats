/* ===========================================================
   Maze Rats — password fields

   Upgrades every <input type="password"> on the admin page into a field
   that masks with a bullet and carries an eye button on the right to
   show/hide what's typed.

   Why this is more than a CSS rule: the mask has to be able to turn OFF.
   A real type="password" draws its own mask and nothing in CSS can lift it
   (-webkit-text-security only swaps one shape for another), so a field
   whose contents can be revealed has to be a type="text" that never
   actually holds the password — each one is rewired as:

       .password-field
           input  (type=text, shows "••••" or the real value, no name)
           button (the eye)
       input (type=hidden, carries the real value under the original name)

   The real value lives in this module and is mirrored into the hidden
   input, so FormData still returns the password under the same name it
   always did and nothing that reads these forms had to change. Keeping
   the name on a hidden partner rather than writing the value back into
   the visible field on submit also means it can't matter which submit
   handler happens to run first.

   Edits are applied by hand from "beforeinput" rather than read back off
   the field afterwards: once the field is showing mask characters, its
   value is no longer the password, so a typed character has to be routed
   into the real string ourselves. Anything that sets the value without a
   beforeinput to intercept — a password manager filling the form — is
   caught by the "input" listener at the end as a plain adoption.
   =========================================================== */

(function () {
    "use strict";

    // U+2022 BULLET — the ordinary password dot. Deliberately a character
    // every font on the fallback stack actually has: this is drawn in
    // whatever face the field is set in, and the login fields are Arial
    // (see #login-form in css/style.css), where the pixel font's old
    // Alt+0213 "Õ" would have rendered as a row of capital O-tildes rather
    // than as a mask.
    const MASK_CHAR = "•";
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

    // Start of the word before `pos`, for the word-delete shortcuts. Always
    // computed against the real value, so it means the same thing whether
    // the field is currently showing that value or a row of mask glyphs.
    function wordStart(text, pos) {
        let i = pos;
        while (i > 0 && /\s/.test(text[i - 1])) i--;
        while (i > 0 && !/\s/.test(text[i - 1])) i--;
        return i;
    }

    function enhance(input) {
        if (!input || input.dataset[ENHANCED_FLAG]) return;
        input.dataset[ENHANCED_FLAG] = "true";

        const parent = input.parentNode;
        if (!parent) return;

        let real = input.value || "";
        let revealed = false;

        // The password moves to a hidden partner under the original name;
        // the visible field keeps required/minlength (a mask is the same
        // length as what it stands for, so both still validate correctly)
        // but stops being the thing that gets submitted.
        const hidden = document.createElement("input");
        hidden.type = "hidden";
        if (input.name) hidden.name = input.name;
        input.removeAttribute("name");

        input.type = "text";
        // A masked field's contents are meaningless to a spellchecker or an
        // autocapitaliser, and correcting them would corrupt the mask.
        input.setAttribute("spellcheck", "false");
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("autocorrect", "off");

        const wrap = document.createElement("div");
        wrap.className = "password-field";
        parent.insertBefore(wrap, input);
        wrap.appendChild(input);
        wrap.appendChild(hidden);

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "password-toggle";
        wrap.appendChild(toggle);

        function render(caret) {
            input.value = revealed ? real : MASK_CHAR.repeat(real.length);
            hidden.value = real;
            input.dataset.masked = revealed ? "false" : "true";
            if (caret != null && document.activeElement === input) {
                input.setSelectionRange(caret, caret);
            }
        }

        function renderToggle() {
            toggle.innerHTML = revealed ? EYE_HIDE : EYE_SHOW;
            const label = revealed ? "Hide password" : "Show password";
            toggle.setAttribute("aria-label", label);
            toggle.setAttribute("title", label);
            toggle.setAttribute("aria-pressed", String(revealed));
        }

        input.addEventListener("beforeinput", e => {
            const selStart = input.selectionStart;
            const selEnd = input.selectionEnd;
            let from = selStart;
            let to = selEnd;
            let inserted = "";

            switch (e.inputType) {
                case "insertText":
                case "insertCompositionText":
                    inserted = e.data || "";
                    break;
                case "insertFromPaste":
                case "insertFromDrop":
                case "insertReplacementText":
                    inserted = (e.dataTransfer && e.dataTransfer.getData("text")) || e.data || "";
                    break;
                case "deleteWordBackward":
                    if (selStart === selEnd) from = wordStart(real, selStart);
                    break;
                case "deleteSoftLineBackward":
                case "deleteHardLineBackward":
                    if (selStart === selEnd) from = 0;
                    break;
                case "deleteWordForward":
                case "deleteSoftLineForward":
                case "deleteHardLineForward":
                    if (selStart === selEnd) to = real.length;
                    break;
                case "deleteContentForward":
                    if (selStart === selEnd) to = Math.min(real.length, selEnd + 1);
                    break;
                // deleteContentBackward, deleteByCut, deleteByDrag and
                // anything else fall through to the default below: remove
                // the selection, or one character back when there isn't one.
                default:
                    if (selStart === selEnd) from = Math.max(0, selStart - 1);
                    break;
            }

            // The browser's own edit would write mask characters into the
            // value, so it never runs — this applies the same edit to the
            // real string and redraws instead.
            e.preventDefault();
            real = real.slice(0, from) + inserted + real.slice(to);
            render(from + inserted.length);
        });

        input.addEventListener("input", () => {
            // Only reached when something changed the value without a
            // beforeinput to intercept — in practice, a password manager
            // filling the field. Whatever it put there is the real value.
            const expected = revealed ? real : MASK_CHAR.repeat(real.length);
            if (input.value === expected) return;
            real = input.value;
            render(real.length);
        });

        toggle.addEventListener("click", () => {
            revealed = !revealed;
            renderToggle();
            // Focus goes back to the field (the click took it) at the end of
            // whatever was typed, so revealing to check a password doesn't
            // cost you your place in it.
            input.focus();
            render(real.length);
        });

        const form = input.closest("form");
        if (form) {
            // A form reset blanks the visible field but would otherwise
            // leave the real value sitting behind it.
            form.addEventListener("reset", () => {
                real = "";
                revealed = false;
                renderToggle();
                render(0);
            });
        }

        renderToggle();
        render(null);
    }

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

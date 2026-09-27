/* ===========================================================
   Maze Rats — the Address field in /warren's maze, event and guide editors

   A record's address is /maze/<slug>, /event/<slug> or /guides/<slug>, and
   the slug follows its name (netlify/functions/_slugs.js). This is the
   field that shows it and lets it be set by hand when the automatic one
   isn't right.

   While the field FOLLOWS THE NAME, typing a new name rewrites it, and the
   save asks the server for the name's slug (_slugAuto), which adds -2, -3…
   if another record already has that address. Typing in the field itself
   sets it by hand: it stays put through later renames, and a save is
   refused if another record has it. "Follow the name" puts it back.

   Either way the old address keeps working — the server keeps it as an
   alias and sends it on to the new one.

   slugify and isAutomatic are the server's rules (netlify/functions/
   _slugs.js), repeated so the field can show what will be saved as it is
   typed. Keep them in step.
   =========================================================== */
(function () {
    "use strict";

    const MAX = 80;

    function slugify(text) {
        return String(text || "").toLowerCase().trim()
            .replace(/['’]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, MAX)
            .replace(/-$/, "");
    }

    function isAutomatic(slug, title) {
        const base = slugify(title);
        if (!slug || !base) return !slug;
        const stem = base.slice(0, MAX - 4).replace(/-+$/, "") + "-";
        return slug === base || (slug.startsWith(stem) && /^\d+$/.test(slug.slice(stem.length)));
    }

    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

    /* The field's markup. `prefix` is "maze", "event" or "guides". The
       input is deliberately NOT named: a form read with FormData would
       otherwise pick it up as a stray field, and what is saved comes from
       the handle wire() returns. */
    function html(prefix, slug) {
        return `
            <div class="admin-field admin-address-field" data-address>
                <span>Address</span>
                <div class="admin-address-row">
                    <span class="admin-address-prefix">mazerats.net/${esc(prefix)}/</span>
                    <input type="text" data-address-input maxlength="${MAX}" value="${esc(slug || "")}"
                        spellcheck="false" autocomplete="off" autocapitalize="off">
                </div>
                <p class="admin-hint admin-address-note" data-address-note></p>
            </div>`;
    }

    /* Brings a field rendered by html() to life.

       root         the element holding it (the form)
       prefix       "maze", "event" or "guides", as given to html()
       titleInput   the name/title input it follows
       current      the record's address now ("" for a new one)
       manual       the record's slugManual (true: typed by hand), if stored
       taken(slug)  the title of ANOTHER record answering to that address,
                    or "" — checked as the field is typed, so a clash shows
                    before Save rather than after it

       Returns { payload() } — { slug, _slugAuto } for the save body. */
    function wire(root, { titleInput, current, manual, taken, prefix, state }) {
        const box = root.querySelector("[data-address]");
        const input = root.querySelector("[data-address-input]");
        const note = root.querySelector("[data-address-note]");
        if (!box || !input || !note || !titleInput) return { payload: () => ({}) };
        const noteId = `address-note-${Math.random().toString(36).slice(2, 8)}`;
        note.id = noteId;
        input.setAttribute("aria-describedby", noteId);

        /* Kept in `state` when the caller passes one, so a form that
           redraws itself (the guide editor does, for every section added)
           carries the field's state across. nameMoved: until the name
           changes, a following field shows the address the record has now,
           which may carry a -2 the name's slug does not. */
        const st = state || {};
        if (!st.ready) {
            st.ready = true;
            st.startTitle = titleInput.value;
            // The record says whether its address was typed by hand (slugManual);
            // records from before that flag are judged by the shape of the address.
            st.following = !current || (typeof manual === "boolean" ? !manual : isAutomatic(current, st.startTitle));
            st.startFollowing = st.following;
            st.nameMoved = false;
        } else if (typeof st.value === "string") {
            input.value = st.value;
        }
        const keep = () => { st.value = input.value; };

        const wanted = () => (st.following ? slugify(titleInput.value) : slugify(input.value));

        function say() {
            keep();
            const slug = wanted();
            const holder = slug && typeof taken === "function" ? taken(slug) : "";
            const bits = [];
            if (st.following) {
                bits.push("Follows the name.");
                if (holder) bits.push(`"${esc(holder)}" has that address, so this gets a number on the end.`);
            } else {
                bits.push("Set by hand, so it stays when the name changes.");
                if (!slug) bits.push("<strong>It needs at least one letter or number.</strong>");
                else if (holder) bits.push(`<strong>"${esc(holder)}" already has this address. Choose another.</strong>`);
            }
            if (current && slug && slug !== current && !(st.following && !st.nameMoved)) {
                bits.push(`The old address, /${esc(prefix)}/${esc(current)}, will keep working.`);
            }
            if (!st.following) bits.push(`<button type="button" class="admin-address-follow" data-address-follow>Follow the name instead</button>`);
            note.innerHTML = bits.join(" ");
            box.classList.toggle("is-following", st.following);
            box.classList.toggle("is-clash", !st.following && !!holder);
        }

        titleInput.addEventListener("input", () => {
            st.nameMoved = true;
            if (st.following) input.value = slugify(titleInput.value);
            say();
        });
        input.addEventListener("input", () => {
            const typed = slugify(input.value);
            st.following = !input.value.trim() || typed === slugify(titleInput.value) || (!st.nameMoved && typed === current && st.startFollowing);
            say();
        });
        // Tidied into what will actually be saved once the typing is done,
        // so what the field shows is the address.
        input.addEventListener("blur", () => {
            if (st.following) input.value = st.nameMoved || !current ? slugify(titleInput.value) : current;
            else input.value = slugify(input.value);
            say();
        });
        note.addEventListener("click", e => {
            if (!e.target.closest("[data-address-follow]")) return;
            st.following = true;
            st.nameMoved = true;
            input.value = slugify(titleInput.value);
            say();
            input.focus();
        });
        say();

        return {
            payload() {
                // Left following and the name never changed: the address
                // stays exactly as it is, -2 and all.
                if (st.following && !st.nameMoved && current) return { slug: current, _slugAuto: false };
                return st.following ? { slug: slugify(titleInput.value), _slugAuto: true } : { slug: slugify(input.value), _slugAuto: false };
            },
            // A clash typed by hand, for a form that wants to stop the save
            // before the server refuses it.
            problem() {
                if (st.following) return "";
                const slug = slugify(input.value);
                if (!slug) return "The address needs at least one letter or number.";
                const holder = typeof taken === "function" ? taken(slug) : "";
                return holder ? `"${holder}" already has the address "${slug}". Choose another.` : "";
            }
        };
    }

    window.AddressField = { html, wire, slugify };
})();

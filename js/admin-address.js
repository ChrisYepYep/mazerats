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

   slugify, isAutomatic and numbered are the server's rules (netlify/
   functions/_slugs.js), repeated so the field can show what will be saved
   as it is typed. Keep them in step.

   A DELETED RECORD'S ADDRESSES are reserved too (retired_addresses on the
   server; see the header of _slugs.js). Until 28 Sept 2026 this field did
   not know them: an address typed by hand that a deleted maze once had
   passed the check here and was refused by Save, and a new maze following
   a deleted one's name was quietly given "-2" while the note said only
   "Follows the name." The caller now passes `retired` (the kind's retired
   addresses, read with ?full=1&retired=1), and the note shows the address
   the save will really give — number and all.
   =========================================================== */
(function () {
    "use strict";

    const MAX = 80;

    // Accents folded first ("São" is sao), as the server now does — see
    // slugify in _slugs.js for why no stored address moved when it began,
    // and for the picture glyphs (Ì Í Î Õ ì í î õ, which Habbo's font
    // draws as pictures) that are left out of the folding.
    const PICTURE_GLYPHS = new RegExp("[" + [0xCC, 0xCD, 0xCE, 0xD5, 0xEC, 0xED, 0xEE, 0xF5]
        .map(c => String.fromCharCode(c)).join("") + "]", "g");
    function slugify(text) {
        return slugifyWith(String(text || "").replace(PICTURE_GLYPHS, " ")
            .normalize("NFD").replace(/\p{M}/gu, ""));
    }

    // The rule before folding, for isAutomatic below.
    function slugifyUnfolded(text) {
        return slugifyWith(String(text || ""));
    }

    function slugifyWith(text) {
        return text.toLowerCase().trim()
            .replace(/['’]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, MAX)
            .replace(/-$/, "");
    }

    // Folded or not: an address worked out before folding is still the
    // automatic one (isAutomatic in _slugs.js).
    function isAutomatic(slug, title) {
        const bases = [...new Set([slugify(title), slugifyUnfolded(title)].filter(Boolean))];
        if (!slug || !bases.length) return !slug;
        return bases.some(base => {
            const stem = base.slice(0, MAX - 4).replace(/-+$/, "") + "-";
            return slug === base || (slug.startsWith(stem) && /^\d+$/.test(slug.slice(stem.length)));
        });
    }

    // A slug with -N on the end, for a clash: numbered in _slugs.js, which
    // cuts the stem short enough for the number and drops a hyphen the cut
    // leaves behind.
    function numbered(base, n) {
        return `${base.slice(0, MAX - 4).replace(/-+$/, "")}-${n}`;
    }

    // What a deleted record of each kind is called in the notes.
    const NOUNS = { maze: "maze", event: "event", guides: "guide" };

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
       retired(slug) true when a DELETED record of this kind had that
                    address (28 Sept 2026). Never asked about the record's
                    own current address, which the server lets it keep
                    even if it is on the list (holder in settleSlug).

       Returns { payload() } — { slug, _slugAuto } for the save body. */
    function wire(root, { titleInput, current, manual, taken, retired, prefix, state }) {
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
        const noun = NOUNS[prefix] || "record";

        /* Who holds an address: { title } for another live record,
           { retired: true } for a deleted one, or null. The record's own
           current address is never "retired" to itself — the server lets a
           record keep an address that is also on the list (see holder in
           settleSlug), so saying otherwise here would be a false alarm. */
        function holderOf(slug) {
            if (!slug) return null;
            const title = typeof taken === "function" ? taken(slug) : "";
            if (title) return { title };
            if (slug !== current && typeof retired === "function" && retired(slug)) return { retired: true };
            return null;
        }

        /* The address a following field will really be saved at: the name's
           slug, or -2, -3… past every one somebody holds — the same walk
           settleSlug does on the server. */
        function projected(base) {
            if (!base || !holderOf(base)) return base;
            let n = 2;
            while (holderOf(numbered(base, n))) n++;
            return numbered(base, n);
        }

        // Following and the name has moved (or the record is new): the
        // address is worked out afresh from the name. Otherwise a following
        // field keeps the address the record has now.
        const moving = () => st.nameMoved || !current;
        const following = () => (moving() ? projected(slugify(titleInput.value)) : current);

        function say() {
            keep();
            const slug = wanted();
            const bits = [];
            let holder = null;
            let actual = slug;
            if (st.following) {
                bits.push("Follows the name.");
                if (moving() && slug) {
                    holder = holderOf(slug);
                    actual = projected(slug);
                    if (holder) {
                        const who = holder.retired
                            ? `A deleted ${noun} had /${esc(prefix)}/${esc(slug)}`
                            : `"${esc(holder.title)}" has /${esc(prefix)}/${esc(slug)}`;
                        bits.push(`${who}, so this one will be /${esc(prefix)}/<strong>${esc(actual)}</strong>.`);
                    }
                } else {
                    actual = current;
                }
            } else {
                holder = holderOf(slug);
                bits.push("Set by hand, so it stays when the name changes.");
                if (!slug) bits.push("<strong>It needs at least one letter or number.</strong>");
                else if (holder && holder.retired) bits.push(`<strong>That address belonged to a deleted ${noun} and can't be reused. Choose another.</strong>`);
                else if (holder) bits.push(`<strong>"${esc(holder.title)}" already has this address. Choose another.</strong>`);
            }
            if (current && actual && actual !== current) {
                bits.push(`The old address, /${esc(prefix)}/${esc(current)}, will keep working.`);
            }
            if (!st.following) bits.push(`<button type="button" class="admin-address-follow" data-address-follow>Follow the name instead</button>`);
            note.innerHTML = bits.join(" ");
            box.classList.toggle("is-following", st.following);
            box.classList.toggle("is-clash", !st.following && !!holder);
        }

        titleInput.addEventListener("input", () => {
            st.nameMoved = true;
            if (st.following) input.value = following();
            say();
        });
        input.addEventListener("input", () => {
            const typed = slugify(input.value);
            const named = slugify(titleInput.value);
            const toName = !input.value.trim() || typed === named || (!!typed && typed === projected(named));
            st.following = toName || (!st.nameMoved && typed === current && st.startFollowing);
            /* Emptied, or typed as the name, on a record whose address was
               set by hand (5 Oct 2026, the bug scan): it is meant to follow
               the name from now on, so it is worked out from the name, as
               "Follow the name instead" does. Without this the field snapped
               back to the hand-set address on blur and saved it unchanged. */
            if (toName && !(st.startFollowing && typed === current)) st.nameMoved = true;
            say();
        });
        // Tidied into what will actually be saved once the typing is done,
        // so what the field shows is the address — the -2 included, when
        // somebody (or a deleted record) already has the name's own.
        input.addEventListener("blur", () => {
            if (st.following) input.value = following();
            else input.value = slugify(input.value);
            say();
        });
        note.addEventListener("click", e => {
            if (!e.target.closest("[data-address-follow]")) return;
            st.following = true;
            st.nameMoved = true;
            input.value = following();
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
                const holder = holderOf(slug);
                if (holder && holder.retired) return `The address "${slug}" belonged to a deleted ${noun} and can't be reused. Choose another.`;
                return holder ? `"${holder.title}" already has the address "${slug}". Choose another.` : "";
            }
        };
    }

    /* A kind's retired addresses (the `retired` list ?full=1&retired=1
       sends) as the retired(slug) wire() takes. Lower-cased both sides, as
       retiredSet in _slugs.js does: an id kept on the list may have
       capitals, and an address is always matched lower-cased. */
    function retiredCheck(list) {
        const set = new Set((Array.isArray(list) ? list : [])
            .filter(s => typeof s === "string" && s).map(s => s.toLowerCase()));
        return slug => !!slug && set.has(String(slug).toLowerCase());
    }

    window.AddressField = { html, wire, slugify, retiredCheck };
})();

/* The clean addresses: /maze/<slug>, /event/<slug>, /guides/<slug>.

   A record's ID is fixed when it is created and never changes — it is what
   the walked ticks, the daily games and every other stored reference name.
   Its SLUG is the address, and it follows the name: rename a maze and its
   address becomes the new name. So the two are kept apart.

   - `slug` is stored once it has been settled by a save (settleSlug below),
     or by tools/backfill-slugs.js for records from before addresses
     existed. A record with none stored gets one worked out from its name
     (assignSlugs) — but a worked-out address can MOVE when another record
     changes (two mazes called "Foo" share foo and foo-2, and renaming one
     hands the other the plain foo), which is why the backfill exists.
   - `slugAliases` are the addresses a record used to have. Renaming pushes
     the old one on, and an old address answers with a 301 to the new one,
     so a link somebody already shared keeps working.
   - `slugManual` says the address was typed by hand in /warren and should
     stay put when the name changes. Without it, "was this typed?" had to be
     guessed from the shape of the address, and a hand-typed
     "halloween-2024" on a maze called "Halloween" looked automatic.
   - The ID always answers too, as an alias. Every link made before clean
     addresses existed (/maze/<id>, /home#maze-<id>, /guides?g=<id>) named
     the ID.

   Mazes, events and guides are three separate namespaces: /maze/x and
   /event/x are different pages, so they may share a slug.

   Resolution order is slug, then ID, then alias. A slug may not be another
   record's ID or alias (settleSlug refuses it), and a new record's ID may
   not be another record's slug or alias (idFor), so the order only decides
   anything for records that predate those checks. */

const MAX = 80;

function slugify(text) {
    return String(text || "").toLowerCase().trim()
        .replace(/['’]/g, "")          // "Chris's Maze" -> chriss-maze, not chris-s-maze
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, MAX)
        .replace(/-$/, "");
}

/* A slug with -N on the end, for a clash. The stem is cut short enough to
   leave room for the number, and any hyphen the cut leaves at its end is
   dropped: a name whose slug had a hyphen at character 76 used to produce
   "…--2", which `valid` below refuses — so the stored address was ignored on
   every read and quietly worked out again, and could move. */
function numbered(base, n) {
    return `${base.slice(0, MAX - 4).replace(/-+$/, "")}-${n}`;
}

const titleOf = (kind, r) => (kind === "maze" ? r.name : r.title) || "";

// What a stored slug may look like. Anything else is ignored and the record
// gets one worked out from its name instead.
const VALID = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const valid = s => typeof s === "string" && VALID.test(s) && !s.includes("--");

// The projection every caller needs to work slugs out for a collection.
const PROJECTION = { _id: 0, id: 1, name: 1, title: 1, slug: 1, slugAliases: 1, slugManual: 1 };

const aliasesOf = r => (Array.isArray(r.slugAliases) ? r.slugAliases.filter(valid) : []);

/* Every record's address, as a Map of id -> slug.

   Stored slugs are claimed first, then everything else gets its name's slug,
   with -2, -3… on a clash. IDs and old addresses (aliases) are reserved to
   their own records, so a worked-out address can never land on one an old
   link still points at: a new maze called "Foo" cannot take the address of
   the maze whose id is "foo", nor of the maze that was called "Foo" last
   month. Ordered by id, so the answer is the same on every call and in
   every function. */
function assignSlugs(records, kind) {
    const list = (records || []).filter(r => r && r.id).slice()
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const owner = new Map();
    list.forEach(r => owner.set(r.id, r.id));
    const out = new Map();
    const free = (s, id) => !owner.has(s) || owner.get(s) === id;
    list.forEach(r => {
        if (valid(r.slug) && free(r.slug, r.id)) {
            owner.set(r.slug, r.id);
            out.set(r.id, r.slug);
        }
    });
    // After the stored slugs, so an alias never outranks somebody's current
    // address; before the worked-out ones, so it is never handed out anew.
    list.forEach(r => aliasesOf(r).forEach(a => { if (!owner.has(a)) owner.set(a, r.id); }));
    list.forEach(r => {
        if (out.has(r.id)) return;
        const base = slugify(titleOf(kind, r)) || r.id;
        let s = base;
        for (let n = 2; !free(s, r.id); n++) s = numbered(base, n);
        owner.set(s, r.id);
        out.set(r.id, s);
    });
    return out;
}

/* Which record an address names, and whether it is that record's current
   address. Returns { record, slug, current } or null. */
function resolveSlug(records, kind, asked) {
    const want = String(asked || "").trim();
    if (!want) return null;
    const lower = want.toLowerCase();
    const slugs = assignSlugs(records, kind);
    const list = (records || []).filter(r => r && r.id);
    const hit = (record, current) => ({ record, slug: slugs.get(record.id), current });
    let r = list.find(x => slugs.get(x.id) === lower);
    if (r) return hit(r, slugs.get(r.id) === want);
    r = list.find(x => x.id === want) || list.find(x => x.id.toLowerCase() === lower);
    if (r) return hit(r, false);
    r = list.find(x => aliasesOf(x).includes(lower));
    return r ? hit(r, false) : null;
}

/* Whether `slug` is what the record would be given automatically from
   `title` — the name's own slug, or that with a -N a clash added. Only the
   fallback for records saved before slugManual existed; see the header. */
function isAutomatic(slug, title) {
    const base = slugify(title);
    if (!slug || !base) return !slug;
    const stem = base.slice(0, MAX - 4).replace(/-+$/, "") + "-";
    return slug === base || (slug.startsWith(stem) && /^\d+$/.test(slug.slice(stem.length)));
}

/* The address a save leaves a record with, written into `update`.

   `all` is the collection as PROJECTION reads it, `before` the stored record
   (null for a new one), `update` the body about to be stored (its title
   already cleaned). Sets update.slug, update.slugAliases and
   update.slugManual, or returns an error message for a 400.

   - `_slugAuto: true` (the editor's address field, left following the
     name) gives it the name's slug, with -2, -3… if another record has it.
   - An address typed in the editor is used as typed (tidied into a slug),
     and refused if another record has it, had it, or is called it.
   - A body with neither (any other caller) keeps the address following the
     name if it already did, and leaves a typed one where it is.
   - A changed address keeps the old one as an alias.

   slugAliases is always taken from the stored record, never from the body:
   the editor sends back the record it read, and a stale copy must not be
   able to drop an alias somebody's link depends on.

   Clashes are judged against every other record's address AS THE WHOLE
   COLLECTION WORKS IT OUT — not as the others would work it out without
   this record. Those two can differ (two mazes called "Foo" are foo and
   foo-2; leave one out and the other becomes foo), and judging by the
   second let a save take foo-2 from a maze that was using it. */
function settleSlug(all, kind, before, update) {
    const id = before ? before.id : update.id;
    const everyone = (all || []).filter(r => r && r.id);
    const others = everyone.filter(r => r.id !== id);
    const slugsNow = assignSlugs(everyone, kind);
    const current = before ? slugsNow.get(before.id) || "" : "";
    const oldTitle = before ? titleOf(kind, before) : "";
    const newTitle = titleOf(kind, update) || oldTitle;
    const wasFollowing = !before
        || (typeof before.slugManual === "boolean" ? !before.slugManual : isAutomatic(current, oldTitle));

    const sent = typeof update.slug === "string" ? update.slug.trim() : "";
    // The editor's "follows the name" (js/admin-address.js). Never stored.
    const follow = update._slugAuto === true;
    delete update._slugAuto;
    let slug;
    let typed = false;
    if (follow) {
        slug = slugify(newTitle) || current || id || kind;
    } else if (sent && sent !== current) {
        slug = slugify(sent);
        if (!slug) return "The address needs at least one letter or number.";
        typed = true;
    } else if (wasFollowing) {
        slug = newTitle === oldTitle && current ? current : (slugify(newTitle) || id || kind);
    } else {
        slug = current;
    }

    // Who holds what, among the other records.
    const holder = s => others.find(r => slugsNow.get(r.id) === s || r.id === s || aliasesOf(r).includes(s));
    if (typed) {
        const h = holder(slug);
        if (h) return `The address "${slug}" is already used by "${titleOf(kind, h) || h.id}". Choose another.`;
    } else if (holder(slug)) {
        const base = slug;
        let n = 2;
        while (holder(numbered(base, n))) n++;
        slug = numbered(base, n);
    }

    const aliases = new Set(before ? aliasesOf(before) : []);
    // The id always answers on its own, so it is never worth storing.
    if (current && current !== slug && current !== id) aliases.add(current);
    aliases.delete(slug);
    update.slug = slug;
    update.slugAliases = [...aliases];
    // Typed by hand stays put through renames; anything else follows the
    // name. A save that kept the address as it was keeps the old answer.
    update.slugManual = typed ? true : follow ? false : !wasFollowing;
    return null;
}

/* The id for a NEW record: its settled slug, unless something already
   answers to that — another record's id, current address or old address.

   The id is permanent and resolves as an address of its own (see the
   header), so it must not be anything a link might already mean. Picking it
   from the name alone, as the create routes used to, let a new maze called
   "Hallway" take the id "hallway" while an older maze was AT /maze/hallway:
   the new id then outranked nothing, but it reserved "hallway" in
   assignSlugs, the older maze's worked-out address moved to hallway-3, and
   every link already shared to it opened the new one. */
function idFor(all, kind, slug) {
    const everyone = (all || []).filter(r => r && r.id);
    const slugs = assignSlugs(everyone, kind);
    const taken = new Set();
    everyone.forEach(r => {
        taken.add(r.id);
        if (slugs.get(r.id)) taken.add(slugs.get(r.id));
        aliasesOf(r).forEach(a => taken.add(a));
    });
    const base = slug || kind;
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(numbered(base, n))) n++;
    return numbered(base, n);
}

module.exports = { slugify, assignSlugs, resolveSlug, settleSlug, idFor, isAutomatic, PROJECTION };

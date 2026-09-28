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
   anything for records that predate those checks.

   A DELETED RECORD'S ADDRESSES STAY RESERVED. Deleting a maze used to free
   its slug, its aliases and its id at once, so the next maze given the same
   name took the address — and every link shared to the old one quietly
   opened a different maze. The delete now writes each of them to
   `retired_addresses` ({ kind, slug, at }; retireAddresses below), and
   assignSlugs, settleSlug and idFor treat them as taken: a new "Foo" gets
   foo-2, and /maze/foo answers 410 Gone (share.js). Callers read them with
   loadRetired and pass them in, so the API, the share function and the
   sitemap all work addresses out from the same inputs. */

const MAX = 80;

/* The name's address. Accents are folded first — "São Paulo" is sao-paulo,
   not s-o-paulo — by splitting each letter from its accent (NFD) and
   dropping the accents (the combining marks, U+0300 to U+036F).

   Folding arrived after every record already had its address stored, and a
   stored address is never worked out again, so no existing address moved:
   only new records and later renames get folded ones. An old automatic
   address made without folding still reads as automatic — see isAutomatic,
   which accepts both.

   EXCEPT THE PICTURE GLYPHS. Habbo's font (Volter Goldfish) draws a
   handful of accented letters as pictures, and names use them as pictures:
   "*ÕMaze EmpireÕ*" is a maze with flowers either side of its name, not
   one called "OMaze EmpireO". Folded, it would become omaze-empireo; left
   out, it is maze-empire, as it always was. These are the eight in the
   Alt Codes window's picture list (js/glyphs.js) that NFD would otherwise
   turn into a letter — Ì Í Î Õ ì í î õ — and they are treated as the
   pictures they are: a gap, like any other symbol. The cost is a real
   word spelt with one ("Camões") losing that letter, which on this site
   is the rarer of the two by far. js/admin-address.js has the same list. */
/* Built from code points rather than typed, so the list is readable in any
   editor. \p{M} is every combining mark: what NFD splits the accents into. */
const PICTURE_GLYPHS = new RegExp("[" + [0xCC, 0xCD, 0xCE, 0xD5, 0xEC, 0xED, 0xEE, 0xF5]
    .map(c => String.fromCharCode(c)).join("") + "]", "g");
function slugify(text) {
    return slugifyWith(String(text || "").replace(PICTURE_GLYPHS, " ")
        .normalize("NFD").replace(/\p{M}/gu, ""));
}

// The rule as it was before folding, for isAutomatic's older answer.
function slugifyUnfolded(text) {
    return slugifyWith(String(text || ""));
}

function slugifyWith(text) {
    return text.toLowerCase().trim()
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

/* ---- retired addresses (see the header) ---- */

const RETIRED = "retired_addresses";

/* The retired addresses as a Set, whatever the caller had them as: a list
   from loadRetired, a Set, or nothing (a caller that has none to give, and
   the tests). Lower-cased, because an address is matched lower-cased
   everywhere else (resolveSlug), and an id kept here may have capitals. */
function retiredSet(retired) {
    const out = new Set();
    if (retired && typeof retired[Symbol.iterator] === "function" && typeof retired !== "string") {
        for (const s of retired) if (typeof s === "string" && s) out.add(s.toLowerCase());
    }
    return out;
}

/* Every retired address of one kind, as a list of strings.

   Throws when the read fails. A save must not go ahead without them — it
   could hand a new record the address a deleted one's links still name —
   so the write routes let it fail the save. The read-only callers (the
   API's GET, share.js, the sitemap) catch it and carry on with none: every
   record has its address stored now, and a stored address does not depend
   on this list, so all an outage costs them is a 404 where a 410 belonged. */
async function loadRetired(db, kind) {
    const rows = await db.collection(RETIRED).find({ kind }, { projection: { _id: 0, slug: 1 } }).toArray();
    return [...new Set(rows.map(r => r && r.slug).filter(s => typeof s === "string" && s))];
}

/* Reserves a record's addresses before it is deleted: the address it is
   served at, its stored slug if that differs, every old address (alias) and
   its id — everything a link to it might name.

   Called BEFORE the delete, by rooms.js, events.js and guides.js. The other
   way round, a failure here would leave the record gone and its addresses
   free; this way round the worst case is a reserved address on a record
   that is still there, which changes nothing — its own stored slug still
   outranks the reservation (assignSlugs), and every lookup finds the live
   record before it would ever look here.

   One upsert per address, so reserving the same one twice (a delete that
   is retried) leaves one row, with the date it was first retired. */
async function retireAddresses(db, kind, record, served) {
    const addresses = new Set();
    [served, valid(record && record.slug) ? record.slug : "", ...aliasesOf(record || {}), record && record.id]
        .forEach(s => { if (typeof s === "string" && s) addresses.add(s); });
    const at = new Date().toISOString();
    const coll = db.collection(RETIRED);
    for (const slug of addresses) {
        await coll.updateOne({ kind, slug }, { $setOnInsert: { kind, slug, at } }, { upsert: true });
    }
    return [...addresses];
}

/* Every record's address, as a Map of id -> slug.

   Stored slugs are claimed first, then everything else gets its name's slug,
   with -2, -3… on a clash. IDs and old addresses (aliases) are reserved to
   their own records, so a worked-out address can never land on one an old
   link still points at: a new maze called "Foo" cannot take the address of
   the maze whose id is "foo", nor of the maze that was called "Foo" last
   month. Ordered by id, so the answer is the same on every call and in
   every function.

   `retired` is the kind's retired addresses (loadRetired). They are
   reserved to nobody, alongside the aliases: after the stored slugs, so a
   record whose stored address happens to be one keeps it, and before the
   worked-out ones, so none is ever handed out again. */
const NOBODY = Symbol("retired");
function assignSlugs(records, kind, retired) {
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
    retiredSet(retired).forEach(s => { if (!owner.has(s)) owner.set(s, NOBODY); });
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
   address. Returns { record, slug, current } or null. `retired` goes to
   assignSlugs, so the addresses are the ones the API hands out; whether a
   miss was a retired address is the caller's question (isRetired). */
function resolveSlug(records, kind, asked, retired) {
    const want = String(asked || "").trim();
    if (!want) return null;
    const lower = want.toLowerCase();
    const slugs = assignSlugs(records, kind, retired);
    const list = (records || []).filter(r => r && r.id);
    const hit = (record, current) => ({ record, slug: slugs.get(record.id), current });
    let r = list.find(x => slugs.get(x.id) === lower);
    if (r) return hit(r, slugs.get(r.id) === want);
    r = list.find(x => x.id === want) || list.find(x => x.id.toLowerCase() === lower);
    if (r) return hit(r, false);
    r = list.find(x => aliasesOf(x).includes(lower));
    return r ? hit(r, false) : null;
}

// Whether an address belonged to a deleted record.
function isRetired(retired, asked) {
    const want = String(asked || "").trim().toLowerCase();
    return !!want && retiredSet(retired).has(want);
}

/* Whether `slug` is what the record would be given automatically from
   `title` — the name's own slug, or that with a -N a clash added. Only the
   fallback for records saved before slugManual existed; see the header.

   Against the name's address both with accents folded and without: an
   address worked out before folding existed ("s-o-paulo" for "São Paulo")
   was automatic then and is still automatic now, and reading it as typed
   by hand would pin it through every later rename. */
function isAutomatic(slug, title) {
    const bases = [...new Set([slugify(title), slugifyUnfolded(title)].filter(Boolean))];
    if (!slug || !bases.length) return !slug;
    return bases.some(base => {
        const stem = base.slice(0, MAX - 4).replace(/-+$/, "") + "-";
        return slug === base || (slug.startsWith(stem) && /^\d+$/.test(slug.slice(stem.length)));
    });
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
   second let a save take foo-2 from a maze that was using it.

   `retired` is the kind's retired addresses (loadRetired), which count as
   held by somebody: typed, one is refused; followed, it gets a number. The
   record's own current address is the one exception — see `holder`. */
function settleSlug(all, kind, before, update, retired) {
    const id = before ? before.id : update.id;
    const everyone = (all || []).filter(r => r && r.id);
    const others = everyone.filter(r => r.id !== id);
    const gone = retiredSet(retired);
    const slugsNow = assignSlugs(everyone, kind, gone);
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

    /* Who holds what, among the other records — or a deleted one, whose
       retired address answers 410 and must stay that way. Not this record's
       own current address, though retired: that can only be a record from
       before the checks that shared an address with one since deleted, and
       every save of it would otherwise move it off the address it is at. */
    const holder = s => others.find(r => slugsNow.get(r.id) === s || r.id === s || aliasesOf(r).includes(s))
        || (s !== current && gone.has(s) ? { retired: true } : null);
    if (typed) {
        const h = holder(slug);
        if (h && h.retired) return `The address "${slug}" belonged to a deleted ${kind}, and stays reserved so old links to it say so. Choose another.`;
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
   every link already shared to it opened the new one.

   A retired address is taken too (`retired`, from loadRetired): the id
   answers as an address, so a new record given a deleted one's id would
   answer every link to the deleted one. */
function idFor(all, kind, slug, retired) {
    const everyone = (all || []).filter(r => r && r.id);
    const gone = retiredSet(retired);
    const slugs = assignSlugs(everyone, kind, gone);
    const taken = new Set(gone);
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

/* After a save: did another save store the same address at the same moment?

   settleSlug judges clashes against the collection as it was READ, and the
   write comes after. Two saves settling in that gap (two new mazes called
   "Foo", or two admins typing the same address into two records) each saw
   the address free and both stored it. Nothing broke outright —
   assignSlugs gives a stored slug to the record with the lower id and works
   the other one out from its name — but the loser's stored address was a
   lie, and the address it was really served at was a worked-out one that
   could move the next time anything else changed: exactly what storing
   slugs was meant to end.

   So each save looks again once its write has landed. If another record now
   stores the same slug, the one assignSlugs does not give it to (the loser,
   by the same rule every reader uses, so both racing saves agree on which
   it is) is settled again, following its name, and written with a
   condition that it still holds the contested slug. The winner does nothing.

   A re-check rather than a unique index on slug: the index would have to be
   built on the live collection, where a record with a blank or duplicate
   stored slug from some older tool would make the build fail, and a failure
   there would fail saves. This costs one read of the slug fields per save.

   Returns the loser's record as it now stands, or null when there was
   nothing to do. Never throws: the save it follows has already landed, and
   a stored address the reader still works out correctly is not worth
   turning that save into an error.

   `retired` is what the save itself settled against, passed on so the
   re-settle cannot land on a retired address either. */
async function recheckSlug(coll, kind, id, retired) {
    try {
        const all = await coll.find({}, { projection: PROJECTION }).toArray();
        const mine = all.find(r => r && r.id === id);
        if (!mine || !valid(mine.slug)) return null;
        if (!all.some(r => r && r.id !== id && r.slug === mine.slug)) return null;
        if (assignSlugs(all, kind, retired).get(id) === mine.slug) return null;
        const fix = { _slugAuto: true };
        if (settleSlug(all, kind, mine, fix, retired)) return null;
        return await coll.findOneAndUpdate(
            { id, slug: mine.slug },
            { $set: { slug: fix.slug, slugAliases: fix.slugAliases, slugManual: fix.slugManual } },
            { returnDocument: "after", projection: { _id: 0 } }
        );
    } catch (e) {
        console.error(`slugs: re-check after saving ${kind} ${id} failed`, e);
        return null;
    }
}

module.exports = {
    slugify, assignSlugs, resolveSlug, settleSlug, idFor, isAutomatic, recheckSlug, PROJECTION,
    loadRetired, retireAddresses, isRetired
};

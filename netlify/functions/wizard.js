/* /.netlify/functions/wizard — The Sorcerer's Atlas at /wizard.

   One endpoint and one collection for the whole map, rather than the
   four the pieces would otherwise want. The public page needs every part
   of it on the first paint — the background, the artwork, the room names
   and the footprint trails between them all arrive together or the map
   draws itself wrong — so splitting them across four URLs would only buy
   four cold starts and a flash of a half-drawn castle.

   Documents are told apart by `kind`:

     map    a single document, id "map": the background, its natural size,
            the zoom range the viewer allows, and the footprint sprite the
            trails are drawn from.
     layer  a picture placed on the map — the castle, the forest, the
            title block. Has a zoom band, so the forest can be a painting
            from far off and fade out as you come down into the trees.
     room   a named place: a label drawn on the map, a hotspot to hover,
            and the sheet that opens when it is clicked.
     path   a footprint trail. A list of points the trail runs through;
            js/wizard.js smooths them and steps footprints along the curve.
     reveal a secret passage, and the code that opens it. Names rooms and
            trails that are NOT in the public payload at all until somebody
            types the code — see the split in the GET below, which is the
            whole security model of the thing.

   Everything positioned on the map is stored in PER CENT of the map's own
   width and height, never in pixels. The background can be re-exported at
   a different size — and it will be, this map is still being drawn — and a
   pixel would silently mean somewhere else afterwards.

   Writes need the "wizard" scope rather than the "site" one every other
   endpoint here asks for, which is what lets an atlas-only account exist
   at all. See WRITE_SCOPES in _auth.js. */
const crypto = require("crypto");
const { getDb } = require("./_db");
const { isAuthorized, hasAccount, canWrite, refuseWrite, UNAUTHORIZED, isAuthUnavailable, AUTH_UNAVAILABLE } = require("./_auth");
const { cachedJson } = require("./_cache");
const { SECURITY_HEADERS } = require("./_headers");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

const KINDS = ["map", "layer", "room", "path", "reveal"];
const MAP_ID = "map";

/* ---------- unlocking a secret ----------

   How many codes one address may try in a minute. A puzzle code is short and
   guessable by machine in a way a password is not, so this is the only thing
   standing between a secret passage and a script working through a word
   list. Twelve is generous for somebody typing and hopeless for somebody
   iterating.

   Per warm instance rather than in the database, which is the same bargain
   room-figure.js makes: an attacker who lands on a cold instance gets a
   fresh allowance, and the cost of being exact about it is a database round
   trip on every guess. Slowing the attack down by two orders of magnitude is
   the goal, not making it impossible. */
const UNLOCK_WINDOW_MS = 60 * 1000;
const UNLOCK_MAX = 12;
const unlockHits = new Map();               // address -> timestamps

/* CHARGED FOR WRONG CODES, NOT FOR EVERY CODE.

   It used to be charged per code sent, right ones included. A returning
   visitor's browser replays every code they have found (see keptCodes in
   js/wizard.js), so anybody with more than twelve found was refused on
   every load before typing anything — and the more of the puzzle they had
   solved, the more certainly they were locked out of it.

   A code that opens something is not a guess anybody needs slowing down:
   whoever sent it has the answer already. So the allowance is spent on the
   codes that open nothing, which is exactly the word-list attack this is
   for, one miss at a time as before. `unlockSpent` reads what is left
   without spending it, so a request can be refused before it costs a
   database read; `unlockCharge` spends. */
function unlockSpent(address) {
    const now = Date.now();
    const seen = (unlockHits.get(address) || []).filter(t => now - t < UNLOCK_WINDOW_MS);
    unlockHits.set(address, seen);
    return seen.length;
}

function unlockCharge(address, n) {
    const now = Date.now();
    const seen = (unlockHits.get(address) || []).filter(t => now - t < UNLOCK_WINDOW_MS);
    for (let i = 0; i < n; i++) seen.push(now);
    unlockHits.set(address, seen);
    if (unlockHits.size > 500) {
        for (const [k, v] of unlockHits) {
            if (!v.some(t => now - t < UNLOCK_WINDOW_MS)) unlockHits.delete(k);
        }
    }
    return seen.length;
}

/* Codes are compared with the case and the spacing taken out of them, so
   "Dissendium", "dissendium" and "  DISSENDIUM " are the same code. Somebody
   typing a password they were told in a Habbo room should not be beaten by
   the shift key.

   Stored normalised too — see pick() — so the comparison is a plain string
   equality rather than a regex over whatever the admin happened to paste. */
function normaliseCode(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/\s+/g, " ");
}

/* Every room and trail id that some enabled secret is holding back.

   This is the set the public GET subtracts, and it is the reason the feature
   is worth anything: a secret whose rooms are in the payload with a
   `hidden` flag is a secret that is one devtools tab away from being read,
   and `hidden` has never meant anything stronger than "do not draw this" —
   the editor turns it off wholesale with revealHidden.

   A disabled secret holds nothing back. Turning one off is how an admin puts
   a passage on the public map for everybody, which is what you want when the
   puzzle is over and the answer has been posted. */
function heldBack(reveals) {
    const rooms = new Set();
    const paths = new Set();
    for (const reveal of reveals) {
        if (reveal.enabled === false) continue;
        for (const id of reveal.rooms || []) rooms.add(id);
        for (const id of reveal.paths || []) paths.add(id);
    }
    return { rooms, paths };
}

/* Whether a typed buffer opens a code: it does when it ENDS WITH one.

   The page collects letters typed at the map and sends the lot after a
   pause (see the keydown handler in js/wizard.js), and its comment has
   always promised that a passage opens "every time the buffer ends with
   something that is a code". The query here was an exact $in, so one stray
   key before the word — an arrow-key miss, a "w" from somebody who thought
   the map scrolled with WASD — made the buffer "wdissendium" and the right
   answer never matched again for as long as the page was open.

   Not a weakening of the limiter worth worrying about: a buffer tests one
   candidate per LENGTH (its own last n letters), so somebody walking a word
   list still gets one word per request, and somebody enumerating every
   three-letter code still needs every three-letter request. */
function opens(buffer, code) {
    return !!code && (buffer === code || buffer.endsWith(code));
}

/* What a visitor may call a secret by.

   The public payload has to give each secret SOME id, so the page can tick
   off the one just found against the hints it was given. It used to be the
   record's own id — and that is slugify(name), so the list of secrets said
   "one-eyed-witch" in plain text, right beside the comment below promising
   never to send the name because it answers most of the riddle.

   A secret made from now on carries a random `publicId` (see the POST). One
   made before that has none, and gets a keyed hash of its stored id instead:
   stable across instances and cold starts, so the GET the edge cached and
   the unlock answered live agree on it, and not reversible into the name
   without the key. No migration, and nothing an admin has to re-save. The
   key is the session secret the tokens are already signed with; the prefix
   keeps these hashes from being useful as anything else signed with it. */
function publicSecretId(reveal) {
    if (typeof reveal.publicId === "string" && reveal.publicId) return reveal.publicId;
    return "s" + crypto.createHmac("sha256", process.env.SESSION_SECRET || "mazerats-wizard")
        .update("wizard-reveal:" + String(reveal.id))
        .digest("hex").slice(0, 16);
}

function slugify(text) {
    return (text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "place";
}

/* Ids are unique WITHIN a kind, not across the collection, so the index is
   compound. Everything in here shares one collection, and a room called
   "Map" slugifies to exactly the id the map document holds — with a
   single-field index that room could not be created at all, and the map
   could not be created after it.

   Memoized the same way _db.js's own ensureUniqueIndex is, and for the same
   reason: createIndex is a no-op once the index exists, but there is no
   reason to pay the round trip on every warm invocation. That helper takes
   one field, which is why this is here rather than there. */
let ensuredIndex = false;

async function ensureIdIndex(collection) {
    if (ensuredIndex) return;
    await collection.createIndex({ kind: 1, id: 1 }, { unique: true });
    ensuredIndex = true;
}

/* The map document as the page should read it, whether or not one has ever
   been saved. An empty database is a real state here and will be the state
   for a while — the admin has to be able to open the editor and upload a
   background INTO it, which it cannot do if the page refuses to draw
   without one.

   The zoom numbers are multiples of "the whole map fitted to the window",
   so 1 is the view you land on and 6 is close enough to read a name
   written among the trees. */
const MAP_DEFAULTS = {
    kind: "map",
    id: MAP_ID,
    title: "The Sorcerer's Atlas",
    intro: "",
    background: "",
    /* The same sheet of parchment photographed larger, and the zoom it is
       worth fetching at. Empty means there is only the one sheet, which is
       what every map had before this and what a map without a big scan
       still wants: a second copy that is never sharper than the first is
       half a megabyte spent on nothing. */
    backgroundDetail: "",
    backgroundDetailZoom: 2.5,
    width: 2000,
    height: 1125,
    minZoom: 1,
    maxZoom: 6,
    footprint: "",
    footprintSpacing: 2.2,
    footprintSize: 1,
    credit: ""
};

/* A zoom band, kept as its own shape because rooms, paths and layers all
   carry one and all three have to mean the same thing by it.

   from/to are the zoom levels between which the thing is drawn, and null at
   either end means "no limit that way" — which is what almost everything on
   the map wants, and what every record written before zoom bands existed
   reads as. js/wizard.js fades across a small margin either side rather
   than switching, so a name does not pop into existence mid-pinch. */
function readBand(body) {
    const num = v => (v === null || v === undefined || v === "" ? null : Number(v));
    return { fromZoom: num(body.fromZoom), toZoom: num(body.toZoom) };
}

/* What each kind is allowed to store. An allowlist rather than taking the
   body as it comes: this collection is written by the least-privileged
   account on the site, and an unlisted field is the easy way for one to
   quietly grow a `kind` of "map" and take the background over. Nothing here
   is expensive to maintain — a new field on a room is a word in a list. */
const FIELDS = {
    /* `footprints` is the bank of shoes cut out of the original drawing —
       left feet and right feet at a range of sizes, so a trail is a walk
       rather than one sprite stamped ninety times. See the footprint bank
       in tools/slice-map.js for where they come from, and layTrail in
       js/wizard-map.js for how they are dealt out. `footprint` is the single
       older sprite, kept as the fallback for a map with no bank. */
    map: ["title", "intro", "background", "backgroundDetail", "backgroundDetailZoom",
        "width", "height", "minZoom", "maxZoom",
        "footprint", "footprints", "footprintSpacing", "footprintSize", "credit",
        // Where the map opens — a point and a zoom, rather than the whole
        // sheet fitted. Set from the editor by looking at what you want
        // people to see and pressing a button.
        "startX", "startY", "startZoom", "texture",
        /* How near a trail may come to a room's name, for every trail that
           has not been given its own — see gapFor in js/wizard-map.js. On
           the map rather than baked into the script because it is the one
           number that decides whether the sheet reads as tidy or cramped,
           and the right value is a matter of looking at it. */
        "labelGap"],
    /* A picture placed on the map, and how it sits in the paper. `blend` is
       a CSS blend mode — multiply is what makes an illustration read as
       drawn onto the parchment rather than pasted over it — and the rest
       are the ordinary adjustments: turn it, flip it, age it, fade it. See
       applyLayerVisual in js/wizard-map.js, which is the only thing that
       reads them. */
    /* `locked` is the editor's own, and the public page never reads it: it
       decides whether this one thing can be dragged. ABSENT MEANS LOCKED —
       see isLocked in js/admin-wizard.js — so every record written before
       this existed is locked, which is what you want on a map that is
       finished enough to be published. Only an explicit false unlocks. */
    layer: ["name", "image", "x", "y", "w", "h", "opacity", "z", "hidden", "locked",
        "blend", "rotation", "flipX", "flipY",
        "grayscale", "sepia", "brightness", "contrast", "saturate", "blur", "ink",
        "fromZoom", "toZoom"],
    /* `note` is what tells two rooms with the same name apart — there are
       three Grand Staircases on this map and two 6th Floor Corridors, and
       they are different places. Shown only where it has to be, so the
       common case reads as the name alone. */
    room: ["name", "note", "fullName", "x", "y", "size", "rotation", "align",
        "labelImage", "floor", "status", "thumb", "image", "description",
        "exits", "hidden", "locked", "fromZoom", "toZoom"],
    /* `exit`, `linkType` and `secret` come from the connection sheet — which
       door this is, whether it is a teleport or a real doorway, and whether
       it is meant to be found. The map draws a secret trail differently and
       a room's sheet names the exit, so all three are the page's business,
       not just the editor's. */
    /* `style` is whether this connection is walked or ruled — footprints
       for a route between junctions, a pen stroke for a door into a dead
       end. The builder sets it from the two rooms; the editor can overrule
       it for any single one. */
    /* `gap` is this one trail's own clearance from the room names,
       overriding the map's. Most trails never set it; the ones that do are
       the ones running between two names close together, where the map-wide
       figure either strikes through the writing or trims the trail to
       nothing. */
    path: ["from", "to", "points", "spacing", "size", "opacity", "secret",
        "style", "exit", "linkType", "notes", "hidden", "locked", "gap",
        "fromZoom", "toZoom"],
    /* A secret passage and the word that opens it.

       `rooms` and `paths` are the ids this secret is keeping off the public
       map; `code` is what has to be typed. `hint` is the only part of a
       locked secret a visitor ever sees, so it is written to be read by
       somebody who has not solved it — "whispered at the foot of a statue"
       rather than "type dissendium".

       `name` and `message` arrive only on a correct answer: a name is a
       spoiler, and the message is the line the map says back.

       focusX/focusY/focusZoom are where the map flies afterwards. All three
       may be null, in which case js/wizard.js frames whatever was revealed —
       which is the right answer nearly always, and the reason the editor
       offers "use the current view" rather than requiring it. */
    /* `sequence` is the running order: the same ids as `rooms` and `paths`,
       written as "room:r062" / "path:c065", in the order they are drawn when
       the passage opens. Membership stays in the two arrays — that is what
       decides what is held back, and it is a set, order meaningless. This is
       only the order of the performance, which is why it is allowed to be
       absent: a reveal written before it existed simply plays trails first
       and names afterwards, which is what they all did. */
    /* `landing` is the room the camera comes to rest on. The reveal is
       followed along its own footprints rather than flown to in one go, and
       this says where that following stops — anything the secret reveals
       after it is still drawn, but the map stays put and lets it arrive. */
    /* `followZoom` is how close the camera sits while it walks the passage,
       and `stepMs` how long it dwells on each footfall. Both per-secret,
       because the right answer depends on the passage: a short hop across
       two rooms wants to be nearer and slower than a corridor crossing half
       the castle. Absent means the page's own default. */
    reveal: ["name", "code", "hint", "message", "rooms", "paths", "sequence",
        "landing", "followZoom", "stepMs",
        "focusX", "focusY", "focusZoom", "enabled", "order"]
};

function pick(kind, body) {
    const out = {};
    for (const field of FIELDS[kind] || []) {
        if (body[field] !== undefined) out[field] = body[field];
    }
    const band = readBand(body);
    if (FIELDS[kind].includes("fromZoom")) {
        out.fromZoom = band.fromZoom;
        out.toZoom = band.toZoom;
    }
    /* A secret's own tidying. The code is stored in the form it will be
       compared in, so unlocking is a string equality and there is one
       definition of "the same code" rather than one per caller. The two id
       lists are forced to arrays of strings because they end up in a Set
       that decides what the public may see, and a malformed one there fails
       open — an id that is a number never matches a room id that is a
       string, and the room quietly appears on the public map. */
    if (kind === "reveal") {
        if (out.code !== undefined) out.code = normaliseCode(out.code);
        /* Entries are "kind:id" and nothing else gets stored. It decides the
           order records are drawn in, not which ones exist, so a malformed
           entry can only ever mean "play nothing here" — but a tidy list is
           what lets the editor and the page agree without either having to
           be defensive about it. */
        if (out.sequence !== undefined) {
            out.sequence = Array.isArray(out.sequence)
                ? [...new Set(out.sequence.map(e => String(e || ""))
                    .filter(e => /^(room|path):.+/.test(e)))].slice(0, 400)
                : [];
        }
        for (const list of ["rooms", "paths"]) {
            if (out[list] === undefined) continue;
            out[list] = Array.isArray(out[list])
                ? [...new Set(out[list].map(id => String(id || "")).filter(Boolean))].slice(0, 200)
                : [];
        }
        if (out.enabled !== undefined) out.enabled = out.enabled !== false;
        for (const num of ["focusX", "focusY", "focusZoom", "followZoom", "stepMs"]) {
            if (out[num] === undefined) continue;
            out[num] = out[num] === null || out[num] === "" ? null : Number(out[num]);
            if (Number.isNaN(out[num])) out[num] = null;
        }
        /* Held inside what the map can actually do. A follow zoom past the
           map's own limit would simply be clamped on the way in and read back
           as a number that does not match what happens; a step of five
           seconds is a reveal nobody waits out. */
        if (out.followZoom != null) out.followZoom = Math.max(1, Math.min(8, out.followZoom));
        if (out.stepMs != null) out.stepMs = Math.max(60, Math.min(1500, Math.round(out.stepMs)));
    }
    return out;
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("wizard: database connection failed", e);
        return json(500, { error: "Database connection failed" });
    }
    const wizard = db.collection("wizard");

    /* Everything past the connect in one catch. Only the connect was
       guarded, so a read that failed — the public map, an unlock, the
       editor's copy — or a write was an unhandled rejection and Netlify's
       bare 502, which the atlas page cannot read. The reason goes to the
       log, not into the reply. */
    try {
        return await route(event, wizard);
    } catch (e) {
        /* The tagged "could not look the account up" error has to get out of
           here as the 503 it is. This catch sits INSIDE the outer wrapper at
           the bottom of the file, so it saw that error first and turned it
           into a 500 — and the wrapper's isAuthUnavailable check never had
           anything left to catch. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("wizard: request failed", e);
        return json(500, { error: "The atlas could not be reached just now" });
    }
};

async function route(event, wizard) {
    if (event.httpMethod === "GET") {
        const all = await wizard.find({}, { projection: { _id: 0 } }).toArray();
        const of = kind => all.filter(d => d.kind === kind);
        const reveals = of("reveal");

        /* ?fresh=1 is the admin editor's route: the same payload, never
           cached, so a save is read back as it was written rather than as
           the edge remembers it from a minute ago. It needs a token and
           401s rather than falling back to the public body — a cacheable
           fallback on this URL would let one unauthenticated request pin a
           stale copy in front of the editor. Same reasoning as ?full=1 on
           rooms.js, and the same trap.

           The editor sees everything: every room, every trail, and every
           secret with its code on it. It has to — it is where the codes are
           written. Handled before the public payload is built so there is no
           chance of the filtered version being served to it by accident. */
        if ((event.queryStringParameters || {}).fresh === "1") {
            // A live account, not only a signed token: this copy carries
            // every secret's code. See hasAccount in _auth.js.
            if (!(await hasAccount(event))) return UNAUTHORIZED;
            return cachedJson(event, {
                map: { ...MAP_DEFAULTS, ...(all.find(d => d.kind === "map") || {}) },
                layers: of("layer").sort((a, b) => (a.z || 0) - (b.z || 0)),
                rooms: of("room"),
                paths: of("path"),
                reveals: reveals.sort((a, b) => (a.order || 0) - (b.order || 0))
            }, { cache: false });
        }

        /* The public payload, with every locked secret subtracted from it.

           This is a real subtraction, not a flag: the rooms and trails a
           secret holds back are not in the JSON the page downloads, so
           "view source" turns up nothing to find. They arrive one secret at a
           time, from the unlock route below, and only in exchange for the
           code.

           A trail is dropped when either end is held back as well as when it
           is named directly. A trail whose far end is not on the map draws
           footprints walking into blank parchment, which is a fairly loud
           advertisement that there is something there — and the shape of it
           would give away where. */
        /* HIDDEN IS SUBTRACTED TOO, not just flagged. Only rooms a secret
           held were ever dropped here; a room an admin had simply marked
           `hidden` went out with its name, its position and every trail to
           it, and the page was trusted not to draw it. The live map had
           "Restricted Library (Maze) (Secret)", "Hidden Passage (Secret)"
           and the Privet Drive rooms sitting in the JSON that way. A hidden
           thing is one the public should not have, and the page never draws
           one anyway (drawRooms, trailHidden and the layer loop in
           js/wizard-map.js all skip it), so leaving it out costs the public
           map nothing. The one road back is the unlock below, which already
           hands a revealed room over with `hidden` cleared.
           The editor's ?fresh=1 copy above is untouched and still has all of
           it. */
        const held = heldBack(reveals);
        const publicRooms = of("room").filter(r => !held.rooms.has(r.id) && !r.hidden);
        const onMap = new Set(publicRooms.map(r => r.id));
        /* A trail goes when either named end is not on the public map, for
           the reason given above: footprints walking into blank parchment
           point at what is missing. A trail with a null end is a real
           unfinished trail and stays. */
        const paths = of("path").filter(p => !held.paths.has(p.id) && !p.hidden &&
            (!p.from || onMap.has(p.from)) && (!p.to || onMap.has(p.to)));
        /* A room's hand-written exits can name a room too, and the id of a
           room is the slug of its name — "hidden-passage-secret" is as much a
           spoiler as the name. Exits to anything not on the map come off;
           the page skipped them anyway (see openRoom's exits in
           js/wizard.js). */
        const rooms = publicRooms.map(r => Array.isArray(r.exits)
            ? { ...r, exits: r.exits.filter(e => onMap.has(e && typeof e === "object" ? e.to : e)) }
            : r);
        const payload = {
            map: { ...MAP_DEFAULTS, ...(all.find(d => d.kind === "map") || {}) },
            layers: of("layer").filter(l => !l.hidden).sort((a, b) => (a.z || 0) - (b.z || 0)),
            rooms,
            paths,
            /* What a visitor is told about the secrets they have not found:
               that they exist, how many, and whatever hint each carries. Not
               the name — "The One-Eyed Witch Passage" answers most of the
               riddle on its own — and obviously not the code. Nor the stored
               id, which is the name slugified; see publicSecretId. */
            secrets: reveals
                .filter(r => r.enabled !== false)
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(r => ({ id: publicSecretId(r), hint: r.hint || "" }))
        };
        return cachedJson(event, payload);
    }

    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }

    /* Typing a code into the map.

       The one request on this endpoint a signed-out visitor is allowed to
       make, and it is handled before the authorization check below because
       the entire point is that the person making it is nobody. It writes
       nothing; it trades a correct code for the records that code was
       holding back.

       A wrong code gets { ok: false } and nothing else — not which secrets
       exist, not how close the guess was, not whether the code matched a
       secret that happens to be disabled. */
    if (event.httpMethod === "POST" && body.action === "unlock") {
        /* One code when somebody guesses, a whole list when a returning
           visitor's browser replays what they found last time.

           The list form is why this takes an array at all: a reader with
           seven passages already open would otherwise spend seven requests
           re-opening them on every page load, which is both slow and enough
           to leave them rate-limited before they have typed anything. The
           limiter is charged per WRONG code either way (see unlockCharge),
           so batching buys a round trip and not a larger allowance. */
        const asked = Array.isArray(body.codes) ? body.codes
            : body.code === undefined ? [] : [body.code];
        const codes = [...new Set(asked.map(normaliseCode))]
            // An empty box is not a guess, and a code long enough to be an
            // attack is not one either.
            .filter(code => code && code.length <= 120)
            .slice(0, 40);

        const address = event.headers["x-nf-client-connection-ip"] ||
            event.headers["client-ip"] || "unknown";
        const tooMany = () => json(429, { error: "Too many tries just now — wait a minute and think again." });
        // Already out of allowance: refused before it costs a database read.
        if (unlockSpent(address) >= UNLOCK_MAX) return tooMany();
        if (!codes.length) {
            // Not a guess, but still a request; charged one, as it always was.
            unlockCharge(address, 1);
            return json(200, { ok: false, found: [] });
        }

        /* Every enabled secret, then matched here by opens() rather than by an
           exact $in in the query: "ends with" is not something an index can
           answer, and there are a handful of secrets, not thousands. */
        const enabledReveals = (await wizard.find(
            { kind: "reveal", enabled: { $ne: false } },
            { projection: { _id: 0 } }
        ).toArray()).filter(r => typeof r.code === "string");
        const reveals = enabledReveals.filter(r => codes.some(buffer => opens(buffer, r.code)));

        /* THE MISSES are what is charged — see unlockCharge. And if they are
           more than the allowance had left, NOTHING is answered, found or
           not: otherwise one request of forty codes would test forty words
           against an allowance of twelve, and hand back whichever hit. All
           of them are charged, so a batch that tries it is locked out for the
           window like anybody else who guessed too much. */
        const misses = codes.filter(buffer => !enabledReveals.some(r => opens(buffer, r.code))).length;
        if (misses) {
            const before = unlockSpent(address);
            unlockCharge(address, misses);
            if (before + misses > UNLOCK_MAX) return tooMany();
        }

        /* What was behind them. Fetched by id rather than trusted from the
           reveal records, so a room that has since been deleted simply is not
           in the answer instead of arriving as a hole the map has to cope
           with. One query for all of them, then dealt back out. */
        const roomIds = [...new Set(reveals.flatMap(r => r.rooms || []))];
        const pathIds = [...new Set(reveals.flatMap(r => r.paths || []))];
        const [rooms, paths] = await Promise.all([
            roomIds.length
                ? wizard.find({ kind: "room", id: { $in: roomIds } }, { projection: { _id: 0 } }).toArray()
                : [],
            pathIds.length
                ? wizard.find({ kind: "path", id: { $in: pathIds } }, { projection: { _id: 0 } }).toArray()
                : []
        ]);
        const roomById = new Map(rooms.map(r => [r.id, r]));
        const pathById = new Map(paths.map(p => [p.id, p]));

        /* The trails that LINK what was just revealed to the rest of the map,
           which have to come back with it.

           The public GET drops a trail when either of its rooms is held back,
           not only when the trail is named by a secret — otherwise footprints
           would walk off into blank parchment and advertise the thing they
           are hiding. The consequence is that the trails joining a secret
           area to the ordinary map are missing too, and they are the most
           important ones there: the One-Eyed Witch passage's whole meaning is
           that it runs from a statue on the third floor to the cellar of
           Honeydukes, and without those two trails it unlocks as three rooms
           floating on their own with no way in or out.

           So the two halves are made symmetrical. Subtracted by endpoint,
           given back by endpoint. An admin selects the ROOMS and the trails
           look after themselves, which is also the only version of this that
           stays correct when somebody adds a new door to a secret room later
           and does not think to add it to the secret. */
        const revealedRoomIds = [...new Set(reveals.flatMap(r => r.rooms || []))];

        /* Everything OTHER enabled secrets are still holding. A linking trail
           whose far end is behind a different, unopened secret must stay
           behind: returning it would draw a trail to a room that is not on
           the map, which is the exact tell this is all avoiding. */
        const matched = new Set(reveals.map(r => r.id));
        const others = await wizard.find(
            { kind: "reveal", enabled: { $ne: false }, id: { $nin: [...matched] } },
            { projection: { _id: 0, rooms: 1, paths: 1, enabled: 1 } }
        ).toArray();
        const stillHeld = heldBack(others);

        /* And every room merely marked hidden that this answer does not
           reveal. The public GET subtracts those now too, so a linking trail
           to one would be footprints to a room the page does not have — and
           the page cannot catch it, because trailHidden in js/wizard-map.js
           only drops a trail whose room it can find and see is hidden. */
        const revealedSet = new Set(revealedRoomIds);
        const hiddenRooms = revealedRoomIds.length
            ? new Set((await wizard.find(
                { kind: "room", hidden: true },
                { projection: { _id: 0, id: 1 } }
            ).toArray()).map(r => r.id).filter(id => !revealedSet.has(id)))
            : new Set();
        const offMap = id => !!id && (stillHeld.rooms.has(id) || hiddenRooms.has(id));

        /* AND NOT A TRAIL THAT IS HIDDEN ITSELF. The ends were checked and
           the trail's own `hidden` flag was not: a trail an admin had hidden
           on purpose — a route kept back for a later secret, a dead end drawn
           and parked — that happened to touch a revealed room came back
           through here with `hidden` cleared by shown() below, and was drawn.
           The public GET never sends a hidden trail; this is the one way one
           gets out, and only when a reveal names it in its own `paths`
           (those come through pathById, not through here), which is the
           admin saying in so many words that this trail is part of it. */
        const linking = revealedRoomIds.length
            ? (await wizard.find({
                kind: "path",
                $or: [{ from: { $in: revealedRoomIds } }, { to: { $in: revealedRoomIds } }]
            }, { projection: { _id: 0 } }).toArray()).filter(p =>
                !p.hidden && !stillHeld.paths.has(p.id) && !offMap(p.from) && !offMap(p.to))
            : [];

        // Which reveal each linking trail belongs to — the one that owns a
        // room at either end of it.
        const linksFor = reveal => {
            const mine = new Set(reveal.rooms || []);
            return linking.filter(p => mine.has(p.from) || mine.has(p.to));
        };

        /* Handed over with `hidden` cleared, and that is not a liberty — it
           is the difference between the feature working and doing nothing at
           all on a map anybody has already used.

           `hidden` predates secrets and was the only way there had ever been
           to keep something off the public map, so the rooms most likely to
           be put behind a code are exactly the ones already carrying it. A
           hidden room is skipped by drawRooms, and a trail with a hidden room
           at either end is dropped by trailHidden — so an unlock would return
           the right records, the page would add them, and nothing whatsoever
           would appear. Which is what it did.

           This is the one place that can settle it, because it is the only
           point at which the answer is known: a record being sent through
           here has had its code typed, and the entire purpose of sending it
           is for it to be seen. The stored record is untouched — switch the
           secret off and the room goes back to being hidden exactly as it
           was. */
        const shown = record => ({ ...record, hidden: false });

        const found = reveals.map(reveal => ({
            secret: {
                // The same opaque id the public list carries, so the page can
                // tick this one off against its hint.
                id: publicSecretId(reveal),
                code: reveal.code,
                name: reveal.name || "",
                message: reveal.message || "",
                focusX: reveal.focusX ?? null,
                focusY: reveal.focusY ?? null,
                focusZoom: reveal.focusZoom ?? null,
                /* The running order, so the page can draw the passage in the
                   order somebody arranged rather than in whatever order the
                   arrays happen to be in. Absent for a reveal made before
                   this existed, and markFound falls back to the old
                   behaviour — every trail, then every name. */
                sequence: reveal.sequence || null,
                // Where the camera stops following. Null means "the last room
                // in the order", which is the sensible reading of an unset one.
                landing: reveal.landing || null,
                // How close it follows, and how long each footfall holds.
                // Null for either means the page's default.
                followZoom: reveal.followZoom ?? null,
                stepMs: reveal.stepMs ?? null
            },
            rooms: (reveal.rooms || []).map(id => roomById.get(id)).filter(Boolean).map(shown),
            /* The trails it names, then the ones that join it to the map,
               deduplicated by id — a trail running between two of this
               secret's own rooms is in both lists. */
            paths: [...new Map(
                (reveal.paths || []).map(id => pathById.get(id)).filter(Boolean)
                    .concat(linksFor(reveal))
                    .map(p => [p.id, shown(p)])
            ).values()]
        }));

        /* Never cached, at the edge or in the browser. The response is a
           function of a secret the URL does not carry, and a cache keyed on
           the URL alone would hand the next visitor somebody else's
           answer. */
        return {
            statusCode: 200,
            headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
            body: JSON.stringify({ ok: found.length > 0, found })
        };
    }

    if (!isAuthorized(event)) return UNAUTHORIZED;
    if (!(await canWrite(event, "wizard"))) return await refuseWrite(event);

    /* Moving things is the whole job of the editor, and a drag session
       touches a lot of them: nudging a dozen names into place and shaping
       the trail between them is one thought, not twenty-five saves. So the
       editor collects what changed and sends it in one request.

       Positions only — the list of fields is deliberately short. A bulk
       write is the one call here with no per-record confirmation behind it,
       so it can move and reshape things but never rename one, repoint its
       picture, or change what kind of thing it is. */
    if (event.httpMethod === "PUT" && body.action === "bulk") {
        const items = Array.isArray(body.items) ? body.items : [];
        if (!items.length) return json(400, { error: "Nothing to save" });
        if (items.length > 500) return json(400, { error: "Too many records in one save" });
        /* What a bulk write may touch: where a thing sits, how big it is,
           and how it looks. NOT what it is — no name, no picture, no
           endpoints, no kind. That is the line worth holding, because this
           is the one call here with no per-record confirmation behind it. */
        const MOVABLE = ["x", "y", "w", "h", "size", "rotation", "align", "points", "z",
            "opacity", "spacing", "gap", "blend", "flipX", "flipY",
            "grayscale", "sepia", "brightness", "contrast", "saturate", "blur", "ink",
            "fromZoom", "toZoom"];
        const writes = [];
        for (const item of items) {
            /* A STRING, checked per item. `{"id":{"$ne":""}}` is truthy, and
               as a filter it is a Mongo operator — "any id but the empty
               one" — so it moved whichever record the database found first.
               Same check as the single PUT below. */
            if (!item || typeof item.id !== "string" || !item.id || !KINDS.includes(item.kind)) {
                return json(400, { error: "Every record in a bulk save needs an id and a kind" });
            }
            const $set = { updatedAt: new Date().toISOString() };
            for (const field of MOVABLE) {
                if (item[field] !== undefined && FIELDS[item.kind].includes(field)) {
                    $set[field] = item[field];
                }
            }
            writes.push({
                updateOne: { filter: { id: item.id, kind: item.kind }, update: { $set } }
            });
        }
        const result = await wizard.bulkWrite(writes, { ordered: false });
        return json(200, { updated: result.modifiedCount });
    }

    const kind = body.kind || (event.queryStringParameters || {}).kind;
    if (!KINDS.includes(kind)) {
        return json(400, { error: "kind must be one of: " + KINDS.join(", ") });
    }

    if (event.httpMethod === "POST") {
        // There is only ever one map document, so creating it is an upsert
        // rather than an insert — the editor saving map settings for the
        // first time and the hundredth time is the same action.
        if (kind === "map") {
            const update = { ...pick("map", body), kind: "map", id: MAP_ID, updatedAt: new Date().toISOString() };
            await wizard.updateOne({ kind: "map" }, { $set: update }, { upsert: true });
            const doc = await wizard.findOne({ kind: "map" }, { projection: { _id: 0 } });
            return json(200, { ...MAP_DEFAULTS, ...doc });
        }

        await ensureIdIndex(wizard);

        // Attempt-and-retry-on-collision rather than check-then-insert — see
        // the same loop in rooms.js for why a findOne() check beforehand
        // cannot stop two near-simultaneous requests both seeing "id free".
        const createdAt = new Date().toISOString();
        const base = kind === "room" ? slugify(body.name)
            : kind === "layer" ? slugify(body.name || "layer")
                : kind === "reveal" ? slugify(body.name || "secret")
                    : `trail-${Date.now().toString(36)}`;
        let id = base;
        let suffix = 2;
        /* A new secret's public name for itself: random, and nothing to do
           with what it is called. Not in FIELDS, so no save can overwrite
           it. See publicSecretId. */
        const extra = kind === "reveal" ? { publicId: "s" + crypto.randomBytes(8).toString("hex") } : {};
        for (let attempt = 0; ; attempt++) {
            const doc = { createdAt, ...pick(kind, body), ...extra, kind, id };
            try {
                await wizard.insertOne(doc);
                const { _id, ...clean } = doc;
                return json(201, clean);
            } catch (e) {
                if (e.code === 11000 && attempt < 50) {
                    id = `${base}-${suffix++}`;
                    continue;
                }
                throw e;
            }
        }
    }

    if (event.httpMethod === "PUT") {
        if (kind === "map") {
            const update = { ...pick("map", body), kind: "map", id: MAP_ID, updatedAt: new Date().toISOString() };
            await wizard.updateOne({ kind: "map" }, { $set: update }, { upsert: true });
            const doc = await wizard.findOne({ kind: "map" }, { projection: { _id: 0 } });
            return json(200, { ...MAP_DEFAULTS, ...doc });
        }
        /* typeof, not truthiness: an object here is a query operator once it
           lands in the filter below, and {"$ne": ""} would update whatever
           record of this kind Mongo happened to find first. */
        if (typeof body.id !== "string" || !body.id) return json(400, { error: "Missing id" });
        // After the spread, so a form that sat open and saved late cannot
        // write the clock backwards. Same as rooms.js.
        const update = { ...pick(kind, body), updatedAt: new Date().toISOString() };
        const result = await wizard.findOneAndUpdate(
            { id: body.id, kind },
            { $set: update },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result) return json(404, { error: "Not found" });
        return json(200, result);
    }

    if (event.httpMethod === "DELETE") {
        const id = (event.queryStringParameters || {}).id;
        if (!id) return json(400, { error: "Missing id" });
        if (kind === "map") return json(400, { error: "The map itself can't be deleted" });
        const result = await wizard.deleteOne({ id, kind });
        if (result.deletedCount === 0) return json(404, { error: "Not found" });
        /* A room that is deleted takes its trails with it. Left behind, a
           trail would keep drawing footprints to a place that is no longer
           on the map — and because a trail's endpoints are what the editor
           uses to redraw it when a room moves, it would also be
           unrepairable from the editor. Only trails that actually named it;
           a free-standing trail (both ends null) is nobody's to remove. */
        /* Read BEFORE the delete below, which is the whole reason this is
           two statements rather than one: after deleteMany there is nothing
           left to ask which trails named the room. */
        const orphans = kind === "room"
            ? (await wizard.find(
                { kind: "path", $or: [{ from: id }, { to: id }] },
                { projection: { _id: 0, id: 1 } }
            ).toArray()).map(p => p.id)
            : [];
        if (kind === "room") {
            await wizard.deleteMany({ kind: "path", $or: [{ from: id }, { to: id }] });
        }
        /* And it comes out of any secret that was holding it back, along with
           the trails that went with it. A dead id left in a reveal's list is
           not dangerous — the unlock route fetches by id and simply finds
           nothing — but it makes the editor's count of what a secret reveals
           a lie, and that count is how an admin checks they have selected the
           right things. */
        if (kind === "room") {
            await wizard.updateMany({ kind: "reveal" }, { $pull: { rooms: id } });
            if (orphans.length) {
                await wizard.updateMany({ kind: "reveal" },
                    { $pull: { paths: { $in: orphans } } });
            }
        } else if (kind === "path") {
            await wizard.updateMany({ kind: "reveal" }, { $pull: { paths: id } });
        }
        return json(200, { deleted: id });
    }

    return json(405, { error: "Method not allowed" });
}

/* The account checks above (hasAccount, canWrite and the rest) throw when
   the database cannot say who is asking, rather than answering "nobody" —
   answering nobody signed admins out over a blip (see _auth.js). Caught
   here, so that moment is a readable "try again" instead of the platform's
   own error page and stack trace. Anything else still fails as it did. */
const handleRequest = exports.handler;
exports.handler = async (event) => {
    try {
        return await handleRequest(event);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        throw e;
    }
};

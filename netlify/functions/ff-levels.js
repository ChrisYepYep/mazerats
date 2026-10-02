/* /.netlify/functions/ff-levels — the Fallin' Furni levels. Like rooms.js and
   events.js, the public GET is open; unlike them, every other route is
   restricted to OWNER accounts rather than to admins (see NOT_OWNER below).

   ----------------------------------------------------------------------
   What a level is

   One round: its room (floor and wallpaper), the furni standing in it, what
   falls from the ceiling, and the rules of the clock. The shape is defined in
   js/room-levels.js and is stored here verbatim — this endpoint does not
   understand the game, it stores and orders levels.

   `order` is the only field this file cares about beyond identity. Levels are
   played in that order, and the difficulty curve is expressed by the levels
   themselves rather than by anything computed here: a later level simply has a
   shorter dropDelayMs and a longer minDropDistance. Keeping the curve in the
   data rather than in code means a builder can break it deliberately — a
   breather round in the middle of a run — without arguing with a formula.

   ----------------------------------------------------------------------
   Why GET is deliberately thin

   The game asks for the levels on load, and a player should download the
   levels and nothing else. Furni artwork is resolved in the browser from the
   catalogue, and level documents carry class names rather than sprite URLs, so
   this payload stays small however large the catalogue grows. */

const { getDb, ensureUniqueIndex } = require("./_db");
const {
    isAuthorized, isOwner, isOwnerWrite, UNAUTHORIZED, forbidden,
    isAuthUnavailable, AUTH_UNAVAILABLE
} = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson } = require("./_cache");

/* Levels are OWNER-ONLY, which is stricter than the rest of the archive.
   Everywhere else an "admin" may write; here they may not. The level editor
   is the one tool that publishes something players load and run, so the
   circle of people who can change it is deliberately the smallest one.

   This is the real gate. The editor page also checks, but that check is a
   courtesy so the page can say why rather than loading a tool that will refuse
   to save — anyone can put ?edit=1 in an address bar, and nothing they do
   there matters unless it gets past this. */
const NOT_OWNER = forbidden("Only an owner account can change Fallin' Furni levels.");

/* no-store (30 Sept 2026): everything through here is either an owner's
   answer — ?all=1 is every draft, on the same URL path the public list is
   edge-cached under — or a write's, and none of it is anybody else's to keep.
   The cacheable public list goes through cachedJson instead. */
const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

/* A LEVEL ID IS AT MOST 64 CHARACTERS. The run log (ff-runs.js) and the
   leaderboard (ff-scores.js) both refuse longer ids now, so they cannot be
   used to stuff the log — and an id this file let through at any length
   would be a level whose runs could never be logged or scored. Every id
   published so far is eight characters. */
const MAX_ID = 64;

function slugify(text) {
    return ((text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, MAX_ID)
        .replace(/(^-|-$)/g, "")) || "level";
}

/* Stored levels are trusted no more than any other request body. Only the
   fields a level is made of survive; anything else a caller sends is dropped
   rather than written, so the collection cannot be used as free storage and a
   stray _id or updatedAt in the body cannot overwrite the real one. */
function cleanLevel(body) {
    const pick = (o, keys) => {
        const out = {};
        for (const k of keys) if (o && o[k] !== undefined) out[k] = o[k];
        return out;
    };
    return {
        id: String(body.id || "").trim().slice(0, MAX_ID),
        name: String(body.name || "").trim(),
        order: Number.isFinite(Number(body.order)) ? Number(body.order) : 0,
        published: body.published === true,
        /* The room's SHAPE, one of the Origins models by its letter — see
           js/room-layouts.js. Whitelisted like everything else here, and the
           note below on `zones` is exactly why it has to be added to this list
           and not just to the schema: a field this pick misses is dropped on
           every save, silently, and the level comes back in the wrong room. */
        /* THIRTY-TWO, not four. The cap was written when every layout was a
           single letter out of the Origins models — a..s, with slack — and a
           public room's id is a word. "library" saved as "libr", which matches
           no layout, so every save of a Library level came back as the plain
           8x13 room and the editor's view snapped to it. */
        model: typeof body.model === "string" ? body.model.slice(0, 32) : "a",
        floor: pick(body.floor || {}, ["pattern", "colour"]),
        wall: pick(body.wall || {}, ["pattern", "colour"]),
        start: pick(body.start || {}, ["x", "y"]),
        // Which way the player faces when the level opens. Whitelisted like
        // everything else — a field this list misses is dropped on every save.
        startDir: Number.isFinite(Number(body.startDir)) ? Number(body.startDir) : 2,
        /* `z` is the decorative height from the editor's Advanced panel and
           `state` the on/off switch; both were authored, sanitised by
           js/room-levels.js and then dropped here, which is the exact failure
           the note below describes happening to `zones`. */
        decor: Array.isArray(body.decor) ? body.decor.slice(0, 200).map(d =>
            pick(d, ["className", "x", "y", "rotation", "state", "z"])) : [],
        /* A zone is an AREA and, separately, the items that rain into it (see
           js/room-levels.js). Whitelisting is what keeps this collection from
           being used as free storage, but it also means a field the schema
           gained and this list never heard of is silently thrown away — which
           is what happened to `zones` while this still read the flat `drops`
           list it replaced. Every save quietly emptied the level. */
        zones: Array.isArray(body.zones) ? body.zones.slice(0, 50).map(z => ({
            ...pick(z, ["id", "name"]),
            area: pick(z.area || {}, ["x", "y", "w", "h"]),
            items: Array.isArray(z.items) ? z.items.slice(0, 50).map(i =>
                pick(i, ["className", "rotation", "count", "role"])) : []
        })) : [],
        rules: pick(body.rules || {}, [
            "seconds", "dropDelayMs", "dropSpeedMs", "minDropDistance", "replayOrder"
        ])
    };
}

/* ---------------------------------------------------------------- VERSIONS

   Every save is a new VERSION of the level, and the numbers the leaderboard
   judges a run by are kept for each one.

   WHY. ff-scores.js holds each round of a run to its level's clock, drop
   delay and seats — and it used to read those as they stood when the run
   was SUBMITTED. Edit a level while somebody is half an hour into a run
   (a shorter clock, a slower drop, a seat taken out) or unpublish it, and
   their honest run came back refused, for numbers they never played
   against. During launch week, with the levels being tuned live, that is
   the one refusal the board cannot afford.

   So: a level carries `rev`, bumped by every save, and the public GET hands
   it out with the level. The page sends back, with its run, the rev of each
   level it was dealt, and ff-scores judges each round by the snapshot of
   THAT version — provided the version existed before the run's token was
   issued, so nobody can play one version and claim a friendlier one written
   later. See levelsAsPlayed in ff-scores.js.

   ONLY WHAT THE CHECKS READ is kept: the id, name, order and published flag,
   the three rules the clock and floor use, and each zone's items reduced to
   their role and count (dropsIn in ff-scores.js). Not the room, not the
   decor — a snapshot is a scorecard, not a backup, and this way it is a few
   hundred bytes.

   A LEVEL WITH NO `rev` is at version 0: every level published before this
   existed. Nothing migrates them — the first save through here snapshots the
   level as it WAS, as version 0, stamped with its old updatedAt, and then
   the new version as 1. Until that first save the level document itself is
   version 0, and ff-scores reads it as such.

   KEPT FOR A WEEK AFTER BEING REPLACED. A version is only interesting to a
   page that loaded it and has not been reloaded since; tokens last three
   hours, but a tab can sit open far longer before Play is pressed, and an
   old version is honoured for as long as it predates the token. So a
   version gets `supersededAt` when the next one is written, and a TTL index
   deletes it seven days after that; the CURRENT version never has the field
   and never expires. On top of the week, at most KEEP_VERSIONS per level, so
   an afternoon of the editor's Save button cannot grow it without bound —
   a version that far back is one nobody's page is still holding. Past
   either limit, a run naming a version that is gone is judged against the
   level as it is now, which is exactly how every run was judged before. */
const VERSIONS = "ff_level_versions";
const VERSION_LIFE_S = 7 * 24 * 60 * 60;
const KEEP_VERSIONS = 100;

const revOf = (level) => (Number.isInteger(level && level.rev) && level.rev >= 0 ? level.rev : 0);

function snapshotOf(level, rev, at) {
    const rules = level.rules || {};
    return {
        _id: `${level.id}:${rev}`,
        id: level.id,
        rev,
        at,
        name: level.name,
        order: level.order,
        published: level.published === true,
        rules: {
            seconds: rules.seconds,
            dropDelayMs: rules.dropDelayMs,
            dropSpeedMs: rules.dropSpeedMs
        },
        zones: (level.zones || []).map(z => ({
            items: (z.items || []).map(i => ({ role: i.role, count: i.count }))
        }))
    };
}

// A stored timestamp as a Date, or the epoch for a level that never had one:
// "older than every stamp", the same reading ff-scores gives a missing one.
function stampOf(level) {
    const ms = Date.parse((level && (level.updatedAt || level.createdAt)) || "");
    return new Date(Number.isFinite(ms) ? ms : 0);
}

let versionsIndexed = false;
/* Writes one version and retires the ones before it. NEVER FAILS THE SAVE:
   the level is already written by the time this runs, and a missing
   snapshot costs only that runs on the version before are judged against
   the new one — the old behaviour, not a new failure. The insert is by
   `${id}:${rev}`, so two writes of the same version are one row. */
async function recordVersion(versions, level, rev, at) {
    try {
        if (!versionsIndexed) {
            versionsIndexed = true;
            // Built here rather than through _db.js, which cannot make a TTL
            // index; see spendRun in ff-scores.js for the same arrangement.
            await versions.createIndex({ supersededAt: 1 }, { expireAfterSeconds: VERSION_LIFE_S })
                .catch(() => {});
            await versions.createIndex({ id: 1, rev: 1 }).catch(() => {});
        }
        try {
            await versions.insertOne(snapshotOf(level, rev, at));
        } catch (e) {
            if (!(e && e.code === 11000)) throw e;
        }
        await versions.updateMany(
            { id: level.id, rev: { $lt: rev }, supersededAt: null },
            { $set: { supersededAt: new Date() } }
        );
        await versions.deleteMany({ id: level.id, rev: { $lte: rev - KEEP_VERSIONS } });
    } catch (e) {
        console.error("ff-levels: could not record a level version", e);
    }
}

/* ---- A WRITE FROM OUTSIDE THIS FILE, versioned like one from inside it
   (30 Sept 2026).

   tools/ff-levels-build.js and tools/ff-levels-restore.js write ff_levels
   straight through the driver, and did it with a bare $set: no `rev` bump
   and no snapshot. A retune of the clocks mid-launch-week then changed the
   numbers under a version the pages already held, and ff-scores judged
   those pages' runs by rules they never played — the refusal VERSIONS
   exists to prevent. So they come through here, which does what the PUT
   does: a level from before versions is snapshotted as version 0 first,
   the write bumps `rev`, and the new version is recorded. A new id carries
   on after any versions an old level of that id left, as the POST does.

   `set` must not carry `rev` (it would collide with the $inc) or `_id`;
   both are dropped. Returns the level as written, or null when `id` is not
   there and `upsert` was not asked for. */
async function writeLevel(db, id, set, { upsert = false, setOnInsert = null } = {}) {
    const levels = db.collection("ff_levels");
    const versions = db.collection(VERSIONS);
    const { rev: _rev, _id, ...fields } = set || {};
    const before = await levels.findOne({ id }, { projection: { _id: 0 } });
    if (!before && !upsert) return null;
    let update;
    if (before) {
        if (!Number.isInteger(before.rev)) await recordVersion(versions, before, 0, stampOf(before));
        update = { $set: fields, $inc: { rev: 1 } };
    } else {
        let lastRev = -1;
        try {
            const last = await versions.find({ id }).sort({ rev: -1 }).limit(1).toArray();
            if (last[0] && Number.isInteger(last[0].rev)) lastRev = last[0].rev;
        } catch (e) { /* a fresh id, as far as anyone can tell */ }
        update = { $set: { ...fields, rev: lastRev + 1 } };
        if (setOnInsert) update.$setOnInsert = setOnInsert;
    }
    const result = await levels.findOneAndUpdate({ id }, update,
        { upsert: !before && upsert, returnDocument: "after", projection: { _id: 0 } });
    if (!result) return null;
    await recordVersion(versions, result, revOf(result), stampOf(result));
    return result;
}

/* THE OWNER CHECKS THROW when the accounts cannot be read (see
   authUnavailableError in _auth.js), rather than answering "not an owner" —
   which the editor would have shown as a refusal and the admin page as a
   dead session. Caught once, here, around every guard in the handler: a
   503 the editor retries, never a 403 or a 401 it would act on. */
exports.handler = async (event) => {
    try {
        return await handle(event);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        throw e;
    }
};

async function handle(event) {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("ff-levels: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const levels = db.collection("ff_levels");
    const versions = db.collection(VERSIONS);

    if (event.httpMethod === "GET") {
        const params = event.queryStringParameters || {};
        /* ?all=1 is the admin's route: unpublished levels included, and it
           needs a token. It 401s rather than falling back to the public list —
           a cacheable fallback on this URL would let one unauthenticated
           request poison what an admin reads next. Same reasoning as
           events.js. */
        if (params.all === "1") {
            if (!isAuthorized(event)) return UNAUTHORIZED;
            if (!(await isOwner(event))) return NOT_OWNER;
            const all = await levels.find({}, { projection: { _id: 0 } })
                .sort({ order: 1 }).toArray();
            return json(200, { count: all.length, levels: all });
        }
        let published;
        try {
            published = await levels.find({ published: true }, { projection: { _id: 0 } })
                .sort({ order: 1 }).toArray();
        } catch (e) {
            console.error("ff-levels: read failed", e);
            return json(503, { error: "The levels could not be read just now." });
        }
        /* Cached at the edge like the archive is, and for the same reason:
           this is read on every single load of the game page, it is the
           same answer for everybody, and it changes only when the owner
           publishes a level. It was going all the way to Mongo every time.

           The ?all=1 branch above returns through json() and stays
           uncached, which is what keeps an admin reading the truth. */
        /* `rev` on every level, 0 where it has never been saved through
           here — the page sends it back with its run (see VERSIONS). */
        /* Keyed on `all` alone (2 Oct 2026; see `vary` in _cache.js): the
           list reads no other parameter, so ?x=<random> is the cached copy
           rather than a fresh read of every level. */
        return cachedJson(event, {
            count: published.length,
            levels: published.map(l => ({ ...l, rev: revOf(l) }))
        }, { vary: "all" });
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Body is not JSON" }); }
    // `null` parses cleanly and then has nothing to read a field off.
    if (!body || typeof body !== "object") return json(400, { error: "Body is not JSON" });

    /* isOwnerWrite on the three writes below, rather than isOwner: these
       never pass through canWrite, so without it the level editor's saves
       were the only archive writes missing from the activity log. */
    if (event.httpMethod === "POST") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await isOwnerWrite(event))) return NOT_OWNER;

        const level = cleanLevel(body);
        if (!level.name) return json(400, { error: "A level needs a name" });
        if (!level.id) level.id = slugify(level.name);
        level.createdAt = new Date().toISOString();
        level.updatedAt = level.createdAt;
        /* A new level starts at version 0, like one from before VERSIONS —
           unless its id has been used before. A level deleted and made again
           under the same name (the editor does exactly that when a save finds
           it gone) still has the old one's versions for a week, and starting
           at 0 would collide with those and leave the OLD level's numbers
           answering for the new one. So it carries on after them. */
        let lastRev = -1;
        try {
            const last = await versions.find({ id: level.id }).sort({ rev: -1 }).limit(1).toArray();
            if (last[0] && Number.isInteger(last[0].rev)) lastRev = last[0].rev;
        } catch (e) { /* a fresh id, as far as anyone can tell */ }
        level.rev = lastRev + 1;

        await ensureUniqueIndex(levels, "id");
        try {
            await levels.insertOne({ ...level });
        } catch (e) {
            // Insert-and-catch rather than check-then-insert: two near
            // simultaneous requests can both pass a findOne.
            if (e && e.code === 11000) return json(409, { error: "A level with that id already exists" });
            throw e;
        }
        await recordVersion(versions, level, level.rev, new Date(level.updatedAt));
        return json(201, level);
    }

    if (event.httpMethod === "PUT") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await isOwnerWrite(event))) return NOT_OWNER;
        if (!body.id) return json(400, { error: "Missing level id" });

        const update = cleanLevel(body);
        // Server-stamped, and after the clean so a stale value in the body
        // cannot wind the clock back.
        update.updatedAt = new Date().toISOString();

        /* A LEVEL FROM BEFORE VERSIONS is snapshotted as it stood, as
           version 0, before this save replaces it — so a run already under
           way on it is judged by what it was playing. Read first; if a
           second save races this one, the version-0 row is the same row
           either way (see recordVersion). */
        const before = await levels.findOne({ id: update.id }, { projection: { _id: 0 } });
        if (!before) return json(404, { error: "Level not found" });
        if (!Number.isInteger(before.rev)) {
            await recordVersion(versions, before, 0, stampOf(before));
        }

        /* ONLY OVER THE VERSION THE EDITOR OPENED (28 Sept 2026). A PUT
           replaces the whole level, and the editor restores its own local
           draft when it opens — so a draft days old on a second device, or a
           second tab, saved straight over a newer clock, a newer order, or an
           unpublish, and put a pulled level back into every player's run.
           The editor now sends the rev it opened (`baseRev`); a level that has
           moved on since is refused with a 409 and nothing is written. Rev 0
           is also a level from before versions, which has no rev at all. A
           body with no baseRev (a page loaded before this) is let through as
           it always was. */
        const base = Number.isInteger(body.baseRev) ? body.baseRev : null;
        if (base !== null) {
            const current = Number.isInteger(before.rev) ? before.rev : 0;
            if (current !== base) {
                return json(409, {
                    error: "This level has been changed somewhere else since you opened it. Load it again from the server, then make your change.",
                    changed: true,
                    rev: current
                });
            }
        }
        const revFilter = base === null ? {}
            : base === 0 ? { $or: [{ rev: 0 }, { rev: { $exists: false } }] }
            : { rev: base };

        /* `$inc` rather than before.rev + 1, so two saves racing get two
           numbers and never share one. cleanLevel never passes `rev`
           through, so the body cannot set it either. The rev filter makes
           the check above hold at the moment of writing too: of two saves
           from the same opened version, only the first lands. */
        const result = await levels.findOneAndUpdate(
            { id: update.id, ...revFilter },
            { $set: update, $inc: { rev: 1 } },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result && base !== null) {
            return json(409, {
                error: "This level has been changed somewhere else since you opened it. Load it again from the server, then make your change.",
                changed: true
            });
        }
        if (!result) return json(404, { error: "Level not found" });
        await recordVersion(versions, result, revOf(result), new Date(update.updatedAt));
        return json(200, result);
    }

    if (event.httpMethod === "DELETE") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await isOwnerWrite(event))) return NOT_OWNER;
        const id = (event.queryStringParameters || {}).id;
        if (!id) return json(400, { error: "Missing level id" });
        /* Read as it is deleted: a level from before versions has no snapshot
           yet, and without one a run under way on it could not be judged at
           all once it is gone (the same version-0 snapshot PUT takes). */
        const gone = await levels.findOneAndDelete({ id }, { projection: { _id: 0 } });
        if (!gone) return json(404, { error: "Level not found" });
        if (!Number.isInteger(gone.rev)) {
            try { await recordVersion(versions, gone, 0, stampOf(gone)); }
            catch (e) { /* judged against nothing, as before; the delete has happened */ }
        }
        /* Its versions are left to expire rather than deleted with it: a run
           dealt this level before it went is still judged by its snapshot for
           the week the others last. The current one is retired too, or it
           would never expire at all. */
        try {
            await versions.updateMany({ id, supersededAt: null }, { $set: { supersededAt: new Date() } });
        } catch (e) { /* the TTL is tidiness; the delete has happened */ }
        return json(200, { deleted: id });
    }

    return json(405, { error: "Method not allowed" });
}

// For the tools that write levels directly; see writeLevel.
module.exports.writeLevel = writeLevel;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("ff-levels", exports.handler);

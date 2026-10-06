/* /.netlify/functions/profiles — players' profiles, and finding them.
   (3 Oct 2026, the owner's: Your Progress became Your Profile.)

   GET ?q=<text>   players whose name has <text> in it, for the search
                   field on the Your Profile window. Up to ten.
   GET ?p=<id>     one player's profile, by their PUBLIC id (_publicid.js).
   GET ?me=1       the signed-in player's own, whatever they have hidden.
   GET ?h=<name>&hotel=<COM|ES|BR>
                   a Habbo the search found that has no public profile here:
                   its avatar and motto, and whether its player has joined
                   (see ANY HABBO below). The search lists Habbos too.

   Public, signed in or not: the owner's decision was that anybody may look
   a player up, as anybody may read the boards. What a profile shows is what
   the boards already show (name, points, places), what they have completed
   in the archive, the choices they made in Edit Profile, and — for a player
   whose Habbo is linked through OriginsBot — that Habbo's avatar and motto,
   which Origins publishes anyway. Never the Discord avatar, and never the
   To do list: those stay the player's own.

   WHO IS LEFT OUT. A player who has not yet been shown profiles (the
   owner's, 4 Oct 2026: "keep profiles hidden until they've seen the
   prompt"): public only once players.profileIntroAt is set (player-nick.js,
   when js/account.js shows them the introduction), unless they switched it
   on themselves in Edit Profile first. A player who switched their profile off in Edit Profile
   (player_state.profile.hidden; see player-data.js), and any account with
   an active ban, as the boards leave them out. Both answer exactly as a
   player who does not exist answers, so a hidden profile cannot be told
   from no profile at all.

   NAMES, AND WHAT A SEARCH MAY MATCH. A player with a nickname is found by
   the nickname only. Matching their Discord display name as well would let
   anybody type a Discord name in and get the nicknamed player back — the
   very link the nickname is for breaking (see _publicid.js). A player with
   no nickname (5 Oct 2026, the owner's: "nicknames apply to the whole
   website") is never shown or found by their Discord name: their profile
   says NO_NICK, and the name search passes them by. Their linked Habbo
   still finds them, as it finds anybody.

   THE PUBLIC ID is an HMAC of the Discord id and cannot be turned back, so
   finding the player behind one means working out everybody's and seeing
   which matches. That is a scan of the players' ids, kept in this warm
   instance as a Map and done again at most once a minute, so a stream of
   made-up ids costs one scan a minute rather than one each. A player who
   signed in for the first time a moment ago is found on the next scan. */
const { getDb } = require("./_db");
const { playerFrom, sessionRevoked, clearCookie } = require("./_player");
const { publicIdOf } = require("./_publicid");
const { accountBans } = require("./_bans");
const { SECURITY_HEADERS } = require("./_headers");
const { figuresFor } = require("./player-profile");
const { originsProfileFor, cachedOriginsProfiles, creatorMatcher, lookupOriginsName } = require("./habbo");
const { mottoHit } = require("./player-nick");
const { guessFor } = require("./_habbo-guess");

// The Origins hotels a typed name is looked for on (habbo.js, ORIGINS_HOSTS).
const HOTELS = ["COM", "ES", "BR"];
// What Origins allows in a name, near enough: letters, digits and a few marks.
const HABBO_NAME = /^[A-Za-z0-9\-=?!@:.,_]{2,24}$/;

const SEARCH_MIN = 2;
const SEARCH_MAX = 24;
const SEARCH_LIMIT = 10;
// How long a search waits on Origins for Habbo heads it has not cached.
const SEARCH_HABBO_MS = 2500;
const SCAN_EVERY_MS = 60 * 1000;
// "Early Rat": signed in for the first time within this long of the launch.
const EARLY_MS = 7 * 24 * 60 * 60 * 1000;

const json = (statusCode, data, headers) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store", ...(headers || {}) },
    body: JSON.stringify(data)
});
const NOT_FOUND = () => json(404, { error: "No such profile" });

/* ---- public id -> Discord id ---- */
const byPid = new Map();
let scannedAt = 0;
let scanning = null;

async function scan(db) {
    if (scanning) return scanning;
    /* Stamped as it STARTS (4 Oct 2026, the bug scan): stamped on success
       only, a players read that kept failing let every made-up id start a
       whole-collection read of its own. */
    scannedAt = Date.now();
    scanning = db.collection("players").find({}, { projection: { _id: 0, id: 1 } }).toArray()
        .then(rows => {
            rows.forEach(r => {
                const pid = r && r.id != null ? publicIdOf(r.id) : null;
                if (pid) byPid.set(pid, String(r.id));
            });
        })
        .finally(() => { scanning = null; });
    return scanning;
}

async function idForPid(db, pid) {
    if (byPid.has(pid)) return byPid.get(pid);
    if (Date.now() - scannedAt < SCAN_EVERY_MS) return null;
    await scan(db);
    return byPid.get(pid) || null;
}

/* Every active account ban's player id. Fails OPEN, as the boards and
   player-profile.js do: a bans collection that cannot be read shows a
   profile rather than none. */
async function bannedSet(db) {
    try {
        return new Set([...(await accountBans(db)).byPlayer.keys()].map(String));
    } catch (e) {
        console.error("profiles: could not read account bans; nobody left out", e);
        return new Set();
    }
}

/* Whether others may see a player's profile: their own choice in Edit
   Profile if they have made one, and otherwise only once they have been
   shown what a profile is (profileIntroAt; see WHO IS LEFT OUT). */
const isPublic = (row, prefs) => (prefs && typeof prefs.hidden === "boolean")
    ? !prefs.hidden
    : !!(row && row.profileIntroAt);

const hasNick = row => typeof row.nick === "string" && !!row.nick;
// What a profile is called without a nickname — never the Discord name.
const NO_NICK = "A Maze Rat";
const shown = row => (hasNick(row) ? row.nick : NO_NICK);
// A Habbo OriginsBot vouched for: a name on the row, whether or not it
// could be made their nickname (a clash or an unusable name is still theirs).
// The key cachedOriginsProfiles answers under: hotel and the trimmed name.
const habboKey = h => `${String(h.hotel || "").toUpperCase()}:${h.name.trim().toLowerCase()}`;
const habboOf = row => (row && row.habbo && typeof row.habbo.name === "string" && row.habbo.name ? row.habbo : null);

/* ---- any Habbo, joined or not (4 Oct 2026, the owner's) ----

   The search finds every Habbo on Origins by its exact name, not only the
   players here. What a Habbo found that way shows depends on who has it:

     public     a player here whose Habbo it is (OriginsBot's link) and whose
                profile others may see: their profile, as any search finds it
     inactive   a player here who has not been shown profiles yet (isPublic):
                the Habbo, and "this maze rat hasn't activated their profile"
     unjoined   nobody here: the Habbo, and "hasn't joined Maze Rats yet"

   A player who HID their profile, or whose account is banned, is
   "unjoined": WHO IS LEFT OUT promises that cannot be told from no profile
   at all, and "inactive" would tell it. Only the linked Habbo name is
   matched, never a nickname or Discord name, for the reason
   onContributorsList gives. */
async function habboStanding(db, hotel, name, banned) {
    const escaped = String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rows = await db.collection("players").find(
        { "habbo.name": { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } },
        { projection: { _id: 0, id: 1, name: 1, nick: 1, habbo: 1, joinedAt: 1, profileIntroAt: 1 } }
    ).limit(5).toArray();
    // A link made before OriginsBot said which hotel is the main one's.
    const row = rows.find(r => r.id != null && String((r.habbo && r.habbo.hotel) || "COM").toUpperCase() === hotel);
    if (!row || banned.has(String(row.id))) return { standing: "unjoined", row: null };
    const state = await db.collection("player_state").findOne({ playerId: String(row.id) }, { projection: { _id: 0, profile: 1 } });
    const prefs = (state && state.profile) || {};
    if (prefs.hidden === true) return { standing: "unjoined", row: null };
    return { standing: isPublic(row, prefs) ? "public" : "inactive", row };
}

// Origins asked on every hotel at once, each waited on for SEARCH_HABBO_MS at most.
async function habbosNamed(db, name) {
    const late = () => new Promise(r => setTimeout(() => r(null), SEARCH_HABBO_MS));
    const answers = await Promise.all(HOTELS.map(hotel =>
        Promise.race([lookupOriginsName(db, hotel, name), late()]).then(r => ({ hotel, r }))));
    return answers.filter(a => a.r && a.r.found && a.r.profile);
}

// The search's Habbo results: one per hotel that has the name.
async function habboResults(db, text, banned) {
    if (!HABBO_NAME.test(text)) return [];
    const found = await habbosNamed(db, text);
    const out = [];
    for (const { hotel, r } of found) {
        const { standing, row } = await habboStanding(db, hotel, r.profile.name || text, banned);
        out.push({ hotel, profile: r.profile, standing, row });
    }
    return out;
}

/* ---- search ---- */
async function search(db, q) {
    const text = String(q || "").trim();
    if (text.length < SEARCH_MIN) return json(200, { players: [] });
    if (text.length > SEARCH_MAX) return json(400, { error: "Too long" });
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    /* WHO IS LEFT OUT is left out IN the query (4 Oct 2026, the bug scan):
       the hidden and the banned were filtered after a .limit(60) taken in
       no order, so sixty matching hidden players hid a visible one, and
       seventy "Zed00".."Zed69" pushed an exact "Zed" off the end. The hidden
       are few — a list of ids — as are the banned. */
    const [banned, choiceRows] = await Promise.all([
        bannedSet(db),
        // Everyone who has chosen either way in Edit Profile (isPublic).
        db.collection("player_state").find({ "profile.hidden": { $in: [true, false] } }, { projection: { _id: 0, playerId: 1, "profile.hidden": 1 } }).toArray()
    ]);
    const hiddenByChoice = choiceRows.filter(r => r.profile && r.profile.hidden === true).map(r => String(r.playerId));
    const publicByChoice = choiceRows.filter(r => r.profile && r.profile.hidden === false).map(r => String(r.playerId));
    const excluded = [...banned, ...hiddenByChoice];
    // Not shown profiles yet, and not switched on by hand: left out (isPublic).
    const introduced = { $or: [{ profileIntroAt: { $exists: true, $ne: null } }, { id: { $in: publicByChoice } }] };
    // The Habbo with exactly this name, on any hotel, asked alongside.
    const habbosAsked = habboResults(db, text, banned).catch(e => {
        console.error("profiles: Habbo search failed", e);
        return [];
    });
    let exactCount = 0;

    /* Best matches first, each tier asked for in its own right: the name
       exactly, then names that start with it, then any that contain it,
       alphabetically within each, until SEARCH_LIMIT. A nicknamed player is
       matched on the nickname alone, and a player without one is not
       matched by name at all (see the header). */
    const named = rx => ({ nick: rx });
    const tiers = [new RegExp(`^${escaped}$`, "i"), new RegExp(`^${escaped}`, "i"), new RegExp(escaped, "i")];
    const playersCol = db.collection("players");
    const kept = [];
    const taken = new Set();
    for (const rx of tiers) {
        if (kept.length >= SEARCH_LIMIT) break;
        const skip = [...excluded, ...taken];
        const found = await playersCol.find({ $and: [named(rx), introduced], ...(skip.length ? { id: { $nin: skip } } : {}) },
            { projection: { _id: 0, id: 1, name: 1, nick: 1, habbo: 1 } }).limit(SEARCH_LIMIT * 3).toArray();
        found.filter(r => r.id != null)
            .map(r => ({ row: r, name: shown(r) }))
            .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
            .forEach(k => {
                if (kept.length >= SEARCH_LIMIT || taken.has(String(k.row.id))) return;
                taken.add(String(k.row.id));
                kept.push(k);
            });
        if (rx === tiers[0]) exactCount = kept.length;
    }

    /* Habbo heads: from the cache first, and any linked Habbo not in it is
       asked of Origins (4 Oct 2026). Cache-only, a player nobody had opened
       the profile of — so nobody had looked their Habbo up — came back as a
       blank circle, however long they had been linked. At most ten asks
       (the results are capped at SEARCH_LIMIT), all at once, and the answer
       does not wait on them past SEARCH_HABBO_MS: one still out is a blank
       circle this time and cached for the next. originsProfileFor never
       throws. */
    const wants = kept.map(k => habboOf(k.row)).filter(Boolean);
    const habbos = await cachedOriginsProfiles(db, wants);
    const missing = wants.filter(h => !habbos.has(`${habboKey(h)}`));
    if (missing.length) {
        const asks = Promise.all(missing.map(h => originsProfileFor(db, h.hotel, h.name).then(p => {
            if (p) habbos.set(`${habboKey(h)}`, p);
        })));
        await Promise.race([asks, new Promise(r => setTimeout(r, SEARCH_HABBO_MS))]);
    }
    const players = kept.map(({ row, name }) => {
        const h = habboOf(row);
        const p = h ? habbos.get(`${habboKey(h)}`) : null;
        const pid = publicIdOf(row.id);
        if (pid) byPid.set(pid, String(row.id));
        return { id: pid, name, avatar: (p && p.avatar) || null };
    }).filter(p => p.id);

    /* The Habbos by that exact name, after the players whose own name is
       exactly it: a player here whose Habbo it is, as their profile (unless
       already listed); anybody else, as the Habbo alone, with `status`
       saying what the window is to say about them. */
    const extra = [];
    for (const h of await habbosAsked) {
        if (h.standing === "public") {
            if (taken.has(String(h.row.id))) continue;
            const pid = publicIdOf(h.row.id);
            if (!pid) continue;
            byPid.set(pid, String(h.row.id));
            taken.add(String(h.row.id));
            extra.push({ id: pid, name: shown(h.row), avatar: h.profile.avatar || null });
        } else {
            extra.push({ habbo: h.profile.name || text, hotel: h.hotel, avatar: h.profile.avatar || null, status: h.standing });
        }
    }
    players.splice(Math.min(exactCount, players.length), 0, ...extra);
    return json(200, { players });
}

/* ---- a Habbo, by name (?h=<name>&hotel=<COM|ES|BR>) ----
   What the window shows for a search result that is a Habbo rather than a
   profile (see habboStanding). A Habbo whose player's profile is public
   answers with that profile's public id instead, for the window to open. */
async function habboView(db, rawName, rawHotel) {
    const name = String(rawName || "").trim();
    const hotel = String(rawHotel || "COM").toUpperCase();
    if (!HOTELS.includes(hotel) || !HABBO_NAME.test(name)) return NOT_FOUND();
    const banned = await bannedSet(db);
    const { standing, row } = await habboStanding(db, hotel, name, banned);
    if (standing === "public") {
        const pid = publicIdOf(row.id);
        if (pid) {
            byPid.set(pid, String(row.id));
            return json(200, { pid });
        }
    }
    const look = await lookupOriginsName(db, hotel, name);
    if (!look) return json(503, { error: "Habbo Origins can't be reached just now." });
    if (!look.found || !look.profile) return NOT_FOUND();
    const p = look.profile;
    const joined = standing === "inactive" && row && row.joinedAt ? Date.parse(row.joinedAt) : NaN;
    return json(200, {
        kind: "habbo",
        status: standing,
        hotel,
        // Not shown with profanity in it (MOTTOS below); nobody here to flag.
        habbo: { name: p.name || name, motto: mottoHit(p.motto || "") ? "" : (p.motto || ""), avatar: p.avatar || null, online: !!p.online },
        // "Rat since" for a player here who has not activated their profile.
        since: Number.isFinite(joined) ? new Date(joined).toISOString().slice(0, 7) : null
    });
}

/* ---- MOTTOS (5 Oct 2026, the owner's) ----

   A Habbo motto with profanity in it (mottoHit in player-nick.js: the
   nickname filter's lists, word by word) is not shown on a profile, and so
   never reaches a Mazer Card, unless an admin has approved that exact
   motto in the Warren (`mottoApproved.text`; players-admin.js). The motto
   is the hotel's and can change at any moment, so it is checked as it is
   read rather than when it was set, and the player's row carries a flag
   for the Warren (`mottoFlag`: the motto, the word, when) while it stands —
   written only when it changes: a new hit, or the motto cleaned up (the
   flag goes). An admin who keeps it hidden marks the flag `reviewed`, and
   the same motto is not raised again. A Habbo with no player here (the
   search's "not joined") just has it hidden: there is nobody to flag. */
async function shownMotto(db, row, motto) {
    const text = typeof motto === "string" ? motto : "";
    const word = text ? mottoHit(text) : null;
    const approved = !!(row && row.mottoApproved && row.mottoApproved.text === text);
    if (row && row.id != null) {
        const f = row.mottoFlag;
        const want = word && !approved;
        try {
            if (want && !(f && f.text === text)) {
                await db.collection("players").updateOne({ id: row.id },
                    { $set: { mottoFlag: { text, word, at: new Date().toISOString() } } });
            } else if (!want && f) {
                await db.collection("players").updateOne({ id: row.id }, { $unset: { mottoFlag: "" } });
            }
        } catch (e) {
            console.error("profiles: could not note a motto flag", e);
        }
    }
    return word && !approved ? { motto: "", hidden: true } : { motto: text, hidden: false };
}

/* ---- one profile ---- */
async function profile(db, id, self) {
    const [figures, state] = await Promise.all([
        figuresFor(db, id),
        db.collection("player_state").findOne({ playerId: id }, { projection: { _id: 0, walked: 1, profile: 1 } })
    ]);
    const row = figures.profile;
    if (!row) return null;
    const prefs = (state && state.profile) || {};
    const hidden = !isPublic(row, prefs);
    if (!self && (hidden || figures.banned.has(String(id)))) return null;

    const h = habboOf(row);
    /* No link: the Habbo of their nickname's name, if Origins has one
       (_habbo-guess.js, 5 Oct 2026, the owner's), shown unverified — its
       avatar and motto, never the badges a Habbo name earns below. Bounded
       as the Origins wait is. */
    const guess = h ? null : await Promise.race([guessFor(db, row), new Promise(r => setTimeout(() => r(null), SEARCH_HABBO_MS))]);
    const shownHabbo = h || guess;
    /* Origins is waited on for SEARCH_HABBO_MS at most, as a search waits
       (4 Oct 2026): an Origins outage added its whole 6s timeout to every
       profile of a linked player. Past it, the profile is drawn without the
       Habbo this once; the lookup finishes and is cached for the next. */
    const habbo = shownHabbo
        ? Promise.race([originsProfileFor(db, shownHabbo.hotel, shownHabbo.name), new Promise(r => setTimeout(() => r(null), SEARCH_HABBO_MS))])
        : null;
    const [origins, listed, credits] = await Promise.all([
        habbo,
        h ? onContributorsList(db, h.name) : false,
        h ? archiveCredits(db, h.name) : { mazeOwner: false, eventHost: false }
    ]);

    // Not shown if it has profanity in it and no admin has passed it (MOTTOS above).
    const motto = origins ? await shownMotto(db, row, origins.motto) : { motto: "", hidden: false };

    const joined = row.joinedAt ? Date.parse(row.joinedAt) : NaN;
    const launch = figures.launch ? Date.parse(figures.launch) : NaN;

    // Only what a board would show of each game: no "played today".
    const game = g => ({ days: g.days, points: g.points, streak: g.streak, best: g.best, place: g.place });

    return {
        id: publicIdOf(id),
        self: !!self,
        name: shown(row),
        // Month and year only — "Rat since October 2026" is all it says.
        since: Number.isFinite(joined) ? new Date(joined).toISOString().slice(0, 7) : null,
        earlyRat: Number.isFinite(joined) && Number.isFinite(launch) && joined <= launch + EARLY_MS,
        /* Whether a Habbo is linked at all, apart from whether Origins
           answered in time (4 Oct 2026, the bug scan): with Origins slow,
           `habbo` is null and a linked player was told to link one. */
        habboLinked: !!h,
        // A guessed Habbo, not yet shown to be theirs (see above).
        habboUnverified: !h && !!guess,
        /* Their own: the guess and where it stands, for Edit Profile's
           "Is this your Habbo?" (js/console-profile.js). "declined" is
           told to them as "new" was not — they are only offered to verify. */
        ...(self && !h && guess ? { habboGuess: { name: guess.name, hotel: guess.hotel, asked: guess.state === "declined" } } : {}),
        habbo: origins ? {
            name: origins.name,
            motto: motto.motto,
            avatar: origins.avatar || null,
            online: !!origins.online
        } : null,
        walked: (state && Array.isArray(state.walked)) ? state.walked : [],
        favourite: prefs.favourite || null,
        badge: prefs.badge || null,
        // Their own: whether their motto is being kept off (MOTTOS above).
        ...(self ? { hidden, mottoHidden: motto.hidden } : {}),
        games: { guess: game(figures.games.guess), odd: game(figures.games.odd) },
        combined: figures.combined,
        ff: figures.ff ? { points: figures.ff.points, levels: figures.ff.levels, rank: figures.ff.rank, of: figures.ff.of } : null,
        pura: figures.pura || null,
        contributions: { accepted: (figures.leads && figures.leads.accepted) || 0 },
        // The Contributor badge (js/home.js, BADGES): see onContributorsList.
        contributor: listed || !!(figures.leads && figures.leads.accepted > 0),
        // The Maze Owner and Event Host badges: see archiveCredits.
        mazeOwner: credits.mazeOwner,
        eventHost: credits.eventHost
    };
}

/* CREDITED IN THE ARCHIVE (4 Oct 2026, the owner's: the Maze Owner and
   Event Host badges). A maze's `creator` and an event's `host` name the
   people who built or ran it, comma-separated ("Vincent, LanceS"), and are
   matched as habbo.js matches a builder for their card (creatorMatcher):
   the name as one whole entry in the list, ignoring case. Against the Habbo
   name OriginsBot vouched for, never a nickname or Discord name, for the
   reason onContributorsList gives. Any maze or event in the archive counts,
   closed ones included: it is credit for having built it. Fails closed. */
async function archiveCredits(db, habboName) {
    try {
        const match = creatorMatcher(String(habboName).trim());
        const [room, ev] = await Promise.all([
            db.collection("rooms").findOne({ creator: match }, { projection: { _id: 0, id: 1 } }),
            db.collection("events").findOne({ host: match }, { projection: { _id: 0, id: 1 } })
        ]);
        return { mazeOwner: !!room, eventHost: !!ev };
    } catch (e) {
        console.error("profiles: archive credits unreadable", e);
        return { mazeOwner: false, eventHost: false };
    }
}

/* ON THE CONTRIBUTORS LIST (4 Oct 2026, the owner's: the Contributor badge
   goes to everyone the console's People page credits, including the ones
   an admin added by hand). The list is kept by Habbo name, so it is matched
   against the player's Habbo name as OriginsBot vouched for it — never their
   nickname or their Discord name, which they choose themselves, and either
   of which could be set to a contributor's name to take the badge. Matched
   as contributors.js matches a name: whole, ignoring case and the spaces
   round it. A player with an accepted Add Maze Info lead counts as well
   (see the caller), since accepting one is what credits them. Fails closed:
   no badge, rather than no profile. */
async function onContributorsList(db, habboName) {
    try {
        const escaped = String(habboName).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!escaped) return false;
        const row = await db.collection("contributors").findOne(
            { username: { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } },
            { projection: { _id: 0, id: 1 } }
        );
        return !!row;
    } catch (e) {
        console.error("profiles: contributors unreadable", e);
        return false;
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
    const q = event.queryStringParameters || {};

    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(503, { error: "Database connection failed" });
    }

    try {
        if (q.q !== undefined) return await search(db, q.q);
        if (q.h !== undefined) return await habboView(db, q.h, q.hotel);

        if (q.me !== undefined) {
            const player = playerFrom(event);
            if (!player) return json(401, { error: "Not signed in" });
            const id = String(player.id);
            // The revocation check needs the session versions off the row.
            const row = await db.collection("players").findOne({ id }, { projection: { _id: 0, sv: 1, svStrict: 1 } });
            if (sessionRevoked(player, row)) return json(401, { error: "Not signed in" }, { "Set-Cookie": clearCookie() });
            const out = await profile(db, id, true);
            return out ? json(200, out) : NOT_FOUND();
        }

        const pid = typeof q.p === "string" ? q.p.trim() : "";
        if (!/^[A-Za-z0-9_-]{16}$/.test(pid)) return NOT_FOUND();
        const id = await idForPid(db, pid);
        if (!id) return NOT_FOUND();
        /* Your own profile, reached by its public id, is still yours — but
           only for a session that has not been revoked (4 Oct 2026, the bug
           scan): a cookie signed out "on every device" was still let in to
           its own hidden profile here, while ?me=1 refused it. */
        const me = playerFrom(event);
        let self = false;
        if (me && String(me.id) === id) {
            const row = await db.collection("players").findOne({ id }, { projection: { _id: 0, sv: 1, svStrict: 1 } });
            self = !sessionRevoked(me, row);
        }
        const out = await profile(db, id, self);
        return out ? json(200, out) : NOT_FOUND();
    } catch (e) {
        console.error("profiles: read failed", e);
        return json(500, { error: "Could not read profiles just now" });
    }
};

/* Failures reported to /warren's Errors tab: see withErrorReporting in
   _errors.js. Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("profiles", exports.handler);

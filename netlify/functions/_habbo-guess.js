/* A HABBO GUESSED FROM A NICKNAME (5 Oct 2026, the owner's).

   OriginsBot (_originsbot.js) is the one way a Habbo is linked for certain.
   A player it has no link for — Sars, whose Habbo is Sars on .com — had no
   Habbo on the site at all. So a player with a nickname and no link has
   the Habbo of that exact name looked up on Origins, hotel by hotel, and
   kept on their row as a GUESS:

     players.habboGuess = { name, hotel, forNick, at, state }
       name null when no hotel has that Habbo (looked at again later)
       state  "new"       shown, and the player is offered to verify it
              "declined"  shown; the player said Not now, and it waits in
                          the Warren's Players tab for an admin to approve
                          (the player is not told that, the owner's call)
              "rejected"  not shown: the player said it is not them, or an
                          admin turned it down. Not guessed again for this
                          nickname.
       not    Habbos never guessed for this player (NOT GUESSED below,
              10 Oct 2026)

   A guess is SHOWN, not trusted. Its avatar and motto go on the profile,
   marked unverified (habboUnverified), and the player has NO badges at all
   until it is verified (the owner's; earnedBadges in js/home.js). The
   three that rest on a Habbo name (Contributor, Maze Owner, Event Host;
   profiles.js) are never worked out from a guess either, because a
   nickname is chosen and a guess would let anybody wear a builder's
   credits by choosing theirs. It becomes a real link — `habbo`, OriginsBot's own
   shape — when the player puts a code in their Origins motto
   (habbo-verify.js) or an admin approves it (players-admin.js). */
const { lookupOriginsName } = require("./habbo");

const HOTELS = ["COM", "ES", "BR"];
// A guess is looked at again after a week, and a miss after a day.
const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_RECHECK_MS = 24 * 60 * 60 * 1000;
// habbo-verify.js's CODE_TTL_MS: how long a motto code is kept (see guessFor).
const VERIFY_TTL_MS = 30 * 60 * 1000;

const linked = row => !!(row && row.habbo && typeof row.habbo.name === "string" && row.habbo.name);

/* Every players row holding a link to this Habbo, as a filter: the name
   whole, ignoring case and the spaces round it, on that hotel — and a link
   OriginsBot made without a hotel (its lookup keeps none when it names
   none) is the main one's, as profiles.js reads it, so it holds a .com name
   too (10 Oct 2026, the bug scan). Here since 10 Oct 2026 so a guess is
   held to it as well as players-admin.js's links. */
function linkedFilter(name, hotel) {
    const escaped = String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const h = String(hotel || "COM").toUpperCase();
    return { "habbo.name": { $regex: "^\\s*" + escaped + "\\s*$", $options: "i" },
        ...(h === "COM" ? { "habbo.hotel": { $in: ["COM", null, ""] } } : { "habbo.hotel": h }) };
}

/* NOT GUESSED (10 Oct 2026, the owner's). A guess was drawn as a verified
   Habbo is, so two kinds of guess are never made:
     - a Habbo linked to ANOTHER player already. The likeliest way to have
       one is a nickname clash, and the nickname's holder was shown wearing
       the real owner's Habbo, outline, motto and all.
     - a Habbo an admin UNLINKED from this player (players-admin.js). The
       guess was made afresh from the nickname on their next profile view,
       and the Habbo just taken off came straight back. Kept on the guess as
       habboGuess.not = [{ name, hotel }] (at most NOT_MAX), carried over
       every guess after, whatever the nickname. */
const NOT_MAX = 10;
const sameHabbo = (a, b) => String(a.name || "").trim().toLowerCase() === String(b.name || "").trim().toLowerCase()
    && String(a.hotel || "COM").toUpperCase() === String(b.hotel || "COM").toUpperCase();
const notList = g => (g && Array.isArray(g.not) ? g.not.filter(x => x && typeof x.name === "string" && x.name) : []);
async function barred(db, row, not, name, hotel) {
    if (not.some(x => sameHabbo(x, { name, hotel }))) return true;
    const other = await db.collection("players").findOne({ id: { $ne: row.id }, ...linkedFilter(name, hotel) }, { projection: { _id: 0, id: 1 } });
    return !!other;
}

/* The guess to show for a players row, looking it up when it is due and
   writing what it finds back. Null when there is nothing to show. Never
   throws: a profile is drawn without it rather than not at all. */
async function guessFor(db, row) {
    try {
        if (!db || !row || !row.id || linked(row)) return null;
        const nick = typeof row.nick === "string" ? row.nick.trim() : "";
        if (!nick) return null;
        const g = row.habboGuess && typeof row.habboGuess === "object" ? row.habboGuess : null;
        /* A motto code past its half hour (habbo-verify.js's CODE_TTL_MS),
           taken off the row as the profile is drawn (10 Oct 2026, the
           privacy check): the policy keeps it half an hour, and a player who
           started a check and never came back kept it for good. Only where
           a guess stands, the one time a code can; one indexed write that
           matches nothing almost always. */
        if (g) {
            await db.collection("players").updateOne(
                { id: row.id, "habboVerify.at": { $lt: new Date(Date.now() - VERIFY_TTL_MS).toISOString() } },
                { $unset: { habboVerify: "" } }).catch(() => {});
        }
        const same = g && g.forNick === nick;
        if (same && g.state === "rejected") return null;
        const not = notList(g);
        const age = same ? Date.now() - Date.parse(g.at) : Infinity;
        /* A kept guess is checked against NOT GUESSED above each time: a
           Habbo linked to somebody else since it was made is looked past,
           and looked up afresh (10 Oct 2026). */
        const fresh = same && Number.isFinite(age) && age < (g.name ? RECHECK_MS : MISS_RECHECK_MS);
        if (fresh && !g.name) return null;
        const keptOk = same && g.name ? !(await barred(db, row, not, g.name, g.hotel)) : false;
        if (fresh && keptOk) return g;

        let found = null;
        for (const hotel of HOTELS) {
            const r = await lookupOriginsName(db, hotel, nick);
            // Origins could not be asked: whatever was known stands, unwritten.
            if (r === null) return keptOk ? g : null;
            if (r.found && r.profile) {
                const name = r.profile.name || nick;
                // NOT GUESSED above: that hotel's is passed over.
                if (await barred(db, row, not, name, hotel)) continue;
                found = { name, hotel };
                break;
            }
        }
        const keepState = same && g.name && found && g.name === found.name && g.hotel === found.hotel;
        const next = found
            ? { name: found.name, hotel: found.hotel, forNick: nick, at: new Date().toISOString(), state: keepState ? g.state : "new" }
            : { name: null, hotel: null, forNick: nick, at: new Date().toISOString(), state: "none" };
        if (not.length) next.not = not.slice(-NOT_MAX);
        /* Never over a real link made meanwhile — nor over an answer given
           meanwhile (10 Oct 2026, the bug scan): the lookups above take
           seconds, and a "That's not me", a Not now or an admin's reject
           landing in them was overwritten by the guess as it was read,
           state and all, so a rejected Habbo came back. Written only if the
           guess is still the one read (its `at` and `state`), or there was
           none; a lost write is simply looked up again next time. */
        const unchanged = g
            ? { "habboGuess.at": g.at === undefined ? { $exists: false } : g.at, "habboGuess.state": g.state === undefined ? { $exists: false } : g.state }
            : { $or: [{ habboGuess: { $exists: false } }, { habboGuess: null }] };
        const res = await db.collection("players").updateOne({ id: row.id, "habbo.name": { $in: [null, ""] }, ...unchanged },
            { $set: { habboGuess: next } }).catch(() => null);
        // Somebody answered meanwhile: what they answered stands.
        if (res && res.matchedCount === 0 && g) return null;
        return next.name ? next : null;
    } catch (e) {
        console.error("habbo-guess: could not guess", e);
        return null;
    }
}

/* Makes a Habbo the player's own: OriginsBot's record shape, `applied` set
   so OriginsBot does not overwrite a Habbo shown to be theirs (its due()),
   and the guess and any half-done verification cleared. `via` says how
   ("motto" or "admin:<username>"). */
async function linkHabbo(db, playerId, name, hotel, via) {
    const now = new Date().toISOString();
    await db.collection("players").updateOne({ id: String(playerId) }, {
        $set: { habbo: { name, hotel, applied: name, checkedAt: now, via } },
        $unset: { habboGuess: "", habboVerify: "" }
    });
}

module.exports = { guessFor, linkHabbo, linked, linkedFilter, barred, sameHabbo, notList, NOT_MAX, HOTELS };

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

const linked = row => !!(row && row.habbo && typeof row.habbo.name === "string" && row.habbo.name);

/* The guess to show for a players row, looking it up when it is due and
   writing what it finds back. Null when there is nothing to show. Never
   throws: a profile is drawn without it rather than not at all. */
async function guessFor(db, row) {
    try {
        if (!db || !row || !row.id || linked(row)) return null;
        const nick = typeof row.nick === "string" ? row.nick.trim() : "";
        if (!nick) return null;
        const g = row.habboGuess && typeof row.habboGuess === "object" ? row.habboGuess : null;
        const same = g && g.forNick === nick;
        if (same && g.state === "rejected") return null;
        const age = same ? Date.now() - Date.parse(g.at) : Infinity;
        if (same && Number.isFinite(age) && age < (g.name ? RECHECK_MS : MISS_RECHECK_MS)) return g.name ? g : null;

        let found = null;
        for (const hotel of HOTELS) {
            const r = await lookupOriginsName(db, hotel, nick);
            // Origins could not be asked: whatever was known stands, unwritten.
            if (r === null) return same && g.name ? g : null;
            if (r.found && r.profile) { found = { name: r.profile.name || nick, hotel }; break; }
        }
        const keepState = same && g.name && found && g.name === found.name && g.hotel === found.hotel;
        const next = found
            ? { name: found.name, hotel: found.hotel, forNick: nick, at: new Date().toISOString(), state: keepState ? g.state : "new" }
            : { name: null, hotel: null, forNick: nick, at: new Date().toISOString(), state: "none" };
        // Never over a real link made meanwhile.
        await db.collection("players").updateOne({ id: row.id, "habbo.name": { $in: [null, ""] } },
            { $set: { habboGuess: next } }).catch(() => {});
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

module.exports = { guessFor, linkHabbo, linked, HOTELS };

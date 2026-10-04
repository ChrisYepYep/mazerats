/* What a PUBLIC board may say about who a row belongs to (29 Sept 2026).

   Every public board row used to carry `id: playerId` — the player's raw
   Discord snowflake — so the page could pick out the caller's own row. That
   id is enough, on its own, to open anybody's Discord profile, which made a
   nickname (player-nick.js) a costume anyone could lift: read the board's
   JSON, take the id, and the nicknamed player is their Discord account
   again. The avatar did the same thing a second way, because Discord's CDN
   address for one is cdn.discordapp.com/avatars/<the same id>/<hash>.

   So a public row now carries:

     id      publicIdOf(playerId) below, not the snowflake. Stable for a
             player, different between players, and not reversible without
             SESSION_SECRET — so the page can still find "you" (the `me`
             answer in discord-auth.js carries the caller's own publicId) and
             the board can still key rows, but nobody can walk it back.

     avatar  NEVER, since 4 Oct 2026 (see publicAvatar). Before that:
             the Discord avatar only for a player WITHOUT a nickname. A
             player who has chosen one gets null, and the page draws its
             blank face. That is the owner's decision: a nickname is the
             player saying "not as my Discord self", and the avatar is their
             Discord self. A player with no nickname is listed under their
             Discord display name anyway, so their avatar tells nobody
             anything the name did not — and the privacy policy says so (see
             "What's public" in js/privacy-content.js).

   WHY LOOK THE NICKNAME UP ON EVERY READ rather than trust the rows. The
   rows carry the avatar they were written with, and a rename rewrites
   their names (renameRows in player-nick.js) but not their avatars — so
   "does this player have a nick" has to be asked of the players row, which
   is the record. One $in read per board response, over the few dozen ids
   the page will show, is cheap beside the aggregations that built it, and
   the boards sit behind a fifteen-second edge cache besides
   (BOARD_CDN_CACHE in _cache.js). Comparing a row's name with the Discord
   name was the other way to tell, and it is wrong for a nickname that
   happens to equal the Discord name.

   FAILS CLOSED. If the players collection cannot be read, nobody on that
   response gets an avatar: a board of blank faces for fifteen seconds is a
   small thing, a nicknamed player's Discord face on it is the thing this
   file exists to stop. */
const crypto = require("crypto");

/* The domain tag keeps this HMAC from ever equalling any other thing the
   site signs or hashes under SESSION_SECRET — a public id must not double
   as anything that secret vouches for elsewhere. */
const DOMAIN = "mazerats-public-id:v1";

/* Sixteen characters of base64url is 96 bits: no collision among the
   site's players this side of the heat death, and short enough to sit in
   every row without fattening the board. No secret, no id — null rather
   than an unkeyed hash, because an unkeyed hash of a snowflake can be
   searched for (the timestamp half of one is guessable), which would put
   the raw id straight back. The page simply finds no row as "you". */
function publicIdOf(playerId) {
    const secret = process.env.SESSION_SECRET;
    if (!secret || playerId === undefined || playerId === null || playerId === "") return null;
    return crypto.createHmac("sha256", secret).update(DOMAIN + "\0" + String(playerId)).digest("base64url").slice(0, 16);
}

/* The ids among `ids` whose players row has a nickname, as a Set of
   strings — or null when the players collection could not be read, which
   every caller treats as "all of them" (FAILS CLOSED, above). Read as
   id + nick only and filtered here: a cleared nick is $unset
   (player-nick.js), but a row written with nick: null or "" by anything
   older must count as no nick too, and that is plainer in JavaScript than
   in a query. */
async function nickedAmong(db, ids) {
    const want = [...new Set((ids || []).filter(x => x !== undefined && x !== null && x !== "").map(String))];
    if (!want.length) return new Set();
    try {
        const rows = await db.collection("players")
            .find({ id: { $in: want } }, { projection: { _id: 0, id: 1, nick: 1 } })
            .toArray();
        return new Set(rows.filter(r => typeof r.nick === "string" && r.nick).map(r => String(r.id)));
    } catch (e) {
        console.error("publicid: could not read nicknames; hiding every avatar on this response", e);
        return null;
    }
}

/* NO DISCORD AVATAR ON ANY PUBLIC ROW, nicknamed or not (4 Oct 2026, the
   owner's: "we can't show discord avatars at all"). Discord's address for
   one carries the player's Discord id (cdn.discordapp.com/avatars/<id>/…),
   and the privacy policy says the boards never show it — which was untrue
   for every player without a nickname. Every row gets the page's blank
   face. The arguments stay, so the callers need not change. */
function publicAvatar(avatar, playerId, nicked) {   // eslint-disable-line no-unused-vars
    return null;
}

/* Several board lists at once, each row carrying its RAW player id as `id`
   (as board(), dayRow and fold() build them): one nickname read for the
   lot, then every row's id swapped for its public one and its avatar kept
   only if the player has no nickname. New objects; the lists passed in are
   left alone. */
async function publicLists(db, lists) {
    // No nickname read any more: no row keeps an avatar (publicAvatar).
    return lists.map(list => (list || []).map(r => ({
        ...r,
        id: publicIdOf(r.id),
        avatar: null
    })));
}

module.exports = { publicIdOf, nickedAmong, publicAvatar, publicLists };

/* /.netlify/functions/player-nick — a signed-in player's nickname for the
   site. (28 Sept 2026)

   Signing in with Discord put a player's Discord display name on every board
   they played, and some people would rather not be known on a public
   leaderboard by the name their friends message them under. So a player may
   choose a nickname, and the site shows that instead, everywhere the public
   can see: every board row, the Profile, the Fallin' Furni title screen. It
   is optional, can be changed or cleared, and a player is offered it once,
   on their first sign-in (the console's prompt, js/account.js).

   POST only, the player's own cookie, no admin token:

     { nick: "Rat King" }     sets it
     { nick: "" } / null      clears it — back to the Discord name
     { asked: true }          only records that the prompt has been seen
     { refuse: true }         refuses the admins' request for a new
                              nickname (29 Sept 2026; see REFUSED below)
     { profileIntro: true }   records that the profile introduction has
                              been shown (4 Oct 2026; profileIntroOf in
                              discord-auth.js), and answers `asked` with it

   Answers 200 { player } in the shape `me` answers with (playerView in
   _player.js) and a FRESH SESSION COOKIE, so the page's next request already
   carries the new name. Refusals are 400 { error, field: "nick" } for a
   nickname that cannot be had, 409 when somebody else has it, 401 signed
   out, 403 { error, locked: true } when the admins have locked it (below),
   429 past the day's changes, 503 when the database is not answering.

   LOCKED (29 Sept 2026). The Warren's Players panel (players-admin.js) can
   set, change or clear a player's nickname for them, and can LOCK it
   (`nickLocked` on the players row). While it is locked the player's own
   set or clear is refused with 403 and a sentence saying who to ask; the
   Profile and the first-sign-in prompt read `nickLocked` from `me` and do
   not offer the field in the first place. `asked` still works, since it
   changes nothing anybody sees. The admin side shares this file's rules,
   renameRows and the history below rather than keeping copies — see the
   exports at the bottom.

   HISTORY (29 Sept 2026). Every set and clear, from here or from the
   Warren, is pushed onto `nickHistory` on the players row as { nick, at,
   by }, `by` being "player" or "admin:<username>", and only the last ten
   are kept. It is for the admins, so a name that caused trouble and was
   then changed can still be found; it is never sent to the player or the
   public (playerView does not carry it), and it goes with the row when a
   player is forgotten. The Warren's review adds entries of its own, with
   an `action` of "allowed" or "rejected" (see FLAGGED, below).

   FLAGGED, NOT REFUSED (29 Sept 2026). The word filter — the reserved
   words and the profanity list below — used to refuse a nickname outright.
   The owner's decision: "have it so filtered nicknames get flagged
   somewhere in the warren page, but don't stop the user setting it — if
   rejected by an admin, the user will receive a prompt to change their
   nickname on their next visit to the site. If no action is taken, nothing
   happens and the user keeps their nickname." So a nickname that trips the
   filter is SAVED like any other, and the players row gets
       nickFlag: { reason: "profanity" | "reserved", word, at }
   `word` being the list's own word that matched (so the admin can judge
   whether "Mod Squad" is a mod or a band). A clean nickname, or a clear,
   takes the flag off again, so a player who fixes it themselves leaves
   nothing behind to review. The Warren's Players tab lists the flagged,
   and an admin either ALLOWS the name (the flag goes) or REJECTS it
   (`nickRejected: { at, by }`, the flag goes, the name stays): the player
   is then asked, once a visit, to choose another (js/account.js), until
   they do. Saving a new, different nickname here — or clearing it back to
   the Discord name — is acting on that, and takes `nickRejected` off. The
   shape rules and "taken" still refuse, as before: those are about what the
   boards can draw and who a name belongs to, not about taste. Neither field
   is ever sent to the public; playerView gives the player only the boolean
   `nickRejected`, never who rejected it.

   AND SAID (29 Sept 2026): a set whose nickname tripped the filter answers
   with `flagged: { reason, word }` beside `player`, and the page shows a
   pop-up naming the word. A clean set, a clear and the other modes carry no
   `flagged` at all.

   REJECTED NOW MEANS "CHANGE IT TO PLAY" (29 Sept 2026, the owner's
   decision). The page's window asking for a new nickname can no longer be
   closed: the player either saves a new one or presses "Refuse". Refusing
   is { refuse: true } here, and sets `nickRefused: true` on the row — the
   nickname stays, so does nickRejected, and so does the lock it now brings:
   while nickRejected stands, every game write (the daily games' moves,
   starts and finished days, Fallin' Furni's run token and finished run) is
   refused with 403 { error: "Set a new nickname to play.", nickRequired:
   true } — writeRefusal in _bans.js, the server's half of the lock. The
   archive stays theirs to browse. A later new nickname, or a clear, takes
   off nickRejected and nickRefused together and the games open again;
   playerView carries both booleans to the page.

   TURNED DOWN (30 Sept 2026). A rejected name used to be free again the
   moment the rejection came off — clear it, then set it back. So the
   players row keeps `nickTurnedDown`, the nameKeys of the names the admins
   have rejected (the Warren's Reject adds one; a player's change or clear
   away from a rejected name adds it too, for rejections made before this),
   the last TURNED_DOWN_MAX of them. A set whose nameKey is on it is refused
   with 400 and TURNED_DOWN_MESSAGE. The admins take a name back off it by
   choosing it: Allow on it, Lock on it, or setting it for the player
   (players-admin.js). Forgetting the player deletes the row, list and all.
   Never sent to the player or the public.

   BANNED (29 Sept 2026). A banned player — soft or full, by account or by
   network (see _bans.js) — is refused every mode here with 403 { error,
   banned: { level, until } }.

   ----------------------------------------------------------------------
   What a nickname may be, and why

   TWO TO TWENTY CHARACTERS after trimming and closing up the spaces: long
   enough to be a name, short enough for a board row on a phone.

   LETTERS, DIGITS, spaces and - _ . ' ! ? only. The letters are ASCII plus
   the accented Latin letters Volter Goldfish can draw — the pixel font the
   boards are set in (assets/fonts/VolterGoldfish.ttf; its cmap has
   ASCII and most of Latin-1, and nothing past it but a handful of symbols).
   A letter it cannot draw falls back to a system font in the middle of a
   pixel-font row, which looks broken; Unicode letters generally were the
   ask, and this is as much of them as the boards can actually show. The
   Latin-1 letters it LACKS are left out too (Ð Ý Þ ð ý þ).

   It must start with a letter or digit and end with one, or with ! or ?,
   so a name cannot be dressed in punctuation ("...Chris...").

   NOT ANOTHER PLAYER'S NICKNAME, compared as a reader would compare them
   (nameKey in _player.js: case, accents, spaces and punctuation ignored) —
   409 "That nickname is taken." Looked up first so the answer is quick and
   plain, and settled for good by the unique index on nickKey, which is what
   decides two players racing for the same one.

   That is the only clash rule (29 Sept 2026). There used to be two more:
   no other player's Discord display name or username, and no admin
   account's username. The owner took both out. The admins' one refused the
   admins themselves — somebody who runs the site and wants their own login
   name on the board was told it was "reserved" — and the Discord one
   refused names nobody had chosen for the site at all: Discord display
   names are not unique, so a player called Chris could not be "Chris"
   because another Chris had once signed in. A player's OWN Discord name
   was always allowed and still is. What stops a nickname passing itself off
   as somebody is now the admins, who can see every nickname beside the
   Discord account that holds it in the Warren and change or lock it.

   THE RESERVED WORDS below, and A MODEST PROFANITY LIST — FLAGGED for the
   admins rather than refused (see FLAGGED above). Only the obvious: the
   point is to put a slur in front of an admin before launch week's boards
   carry it for long, not to police spelling. Most words are matched only
   as whole words, because matched anywhere they catch innocent names
   ("Cassidy", "Hancock"). The handful matched anywhere are ones that are
   never an accident inside another word — which "cunt", "wank", "shit" and
   "fuk" turned out not to be: "Scunthorpe", "Swanky", "Shitake" and
   "Fukuoka" were all refused by them, so they moved to whole words (with
   their common compounds, "wanker", "shithead"...) on 29 Sept 2026. An
   admin can still reject anything that slips through, from the Warren.

   FIVE CHANGES A DAY per player (UTC day), counting sets and clears but not
   `asked`. Enough to fix a typo or two; not enough to use the boards as a
   message board by renaming every minute. The one change that answers an
   admin's rejection is free once the five are spent (30 Sept 2026; see
   PAST THE DAY'S CAP in the handler).

   ----------------------------------------------------------------------
   The boards

   Board rows store the name they were filed under, so a change RENAMES the
   player's existing rows everywhere the public reads names from — the three
   boards (guess_scores, daily_scores, ff_scores), Fallin' Furni's tournament
   board (ff_tournament), and the admin's reset tickets (daily_resets), which
   the Warren lists beside the boards' own names. New rows take the name
   from the players row at the time they are filed (publicName in
   _player.js).

   How soon it shows: the daily boards are cached for fifteen seconds at the
   edge (BOARD_CDN_CACHE in _cache.js) and thirty in the browser, and
   Fallin' Furni's is never cached. So within about half a minute, a minute
   at the very outside for a visitor whose browser fetched a board just
   before the change. player-profile.js keeps everybody's totals warm for
   five minutes, but that is numbers for ranking, never names. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom, playerView, signPlayer, setCookie, clearCookie, nameKey, sessionRevoked, svFor, newSv } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
// See BANNED in the header.
const { writeRefusal } = require("./_bans");

const NICK_MIN = 2;
const NICK_MAX = 20;
const CHANGES_PER_DAY = 5;
const MAX_BODY = 1024;
// See HISTORY in the header.
const HISTORY_MAX = 10;
// See LOCKED in the header. The Profile shows the same sentence.
const LOCKED_MESSAGE = "Your nickname was set by the site's admins. Ask them if you'd like it changed.";
const TAKEN_MESSAGE = "That nickname is taken.";
// See TURNED DOWN in the header.
const TURNED_DOWN_MESSAGE = "That's the nickname the admins turned down. Choose a different one.";
const TURNED_DOWN_MAX = 10;

/* The letters the boards' font can draw — see the header. As a character
   class body, so it can be used in the three patterns below. */
const LETTERS = "A-Za-zÀ-ÏÑ-ÖØ-Üß-ïñ-öø-üÿŒœŸ";
const ALLOWED = new RegExp(`^[${LETTERS}0-9 _.'!?-]+$`, "u");
const STARTS = new RegExp(`^[${LETTERS}0-9]`, "u");
const ENDS = new RegExp(`[${LETTERS}0-9!?]$`, "u");
const WORD_BREAK = /[ _.'!?-]+/;

/* Names that would read as speaking for the site (or for Habbo). Flagged
   (see FLAGGED in the header) whole or as any one word of a name; the four
   that impersonate staff most directly also at either end ("ChrisAdmin",
   "MazeRatsOfficial") — only the ENDS, since "badminton" is somebody's
   hobby. */
const RESERVED = new Set(["admin", "administrator", "mod", "moderator", "mazerats", "staff", "owner", "system", "habbo"].map(nameKey));
const RESERVED_ENDS = ["admin", "moderator", "mazerats", "mazerat"];

/* See A MODEST PROFANITY LIST in the header. Compared after folding the
   usual digit-for-letter swaps back (0 for o, 1 for i and so on). "cunt",
   "wank", "shit" and "fuk" are whole words now, not ANYWHERE (29 Sept
   2026: "Scunthorpe", "Swanky", "Shitake", "Fukuoka"), with the compounds
   people actually type spelled out beside them. */
const ANYWHERE = ["fuck", "nigger", "nigga", "faggot", "whore", "dildo", "porn"];
const WHOLE_WORD = new Set([
    "ass", "arse", "asshole", "arsehole", "bitch", "bastard", "dick", "dickhead", "cock", "prick", "penis", "vagina",
    "pussy", "slut", "tits", "boobs", "rape", "rapist", "nazi", "hitler", "sex", "cum", "jizz", "kys", "piss",
    "bollocks", "twat", "fag", "retard",
    "cunt", "cunts", "wank", "wanker", "wankers", "wanking", "fuk", "fuks",
    "shit", "shits", "shite", "shitty", "shithead", "shitface", "bullshit", "horseshit", "dipshit"
]);
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b" };
const unLeet = s => nameKey(String(s).replace(/[0134578]/g, d => LEET[d]));

/* The unique rule, as a PARTIAL index: only rows that have a nickname are
   in it, so the thousands of players without one are not all colliding on
   "no nickname". Partial on the string type rather than sparse, so that even
   a stray `nickKey: null` could never count as taken. A clear $unsets the
   field, which takes the row out of the index entirely — so forgetting a
   player (player-forget.js deletes the whole row) or clearing a nickname
   frees the name at once, and a fresh sign-in after a forget writes a row
   with no nickKey at all, which the index does not look at.

   Built here and not through ensureUniqueIndex in _db.js, because that one
   cannot say "partial". Memoised per warm instance like it. Throws on
   failure: without the index two players could hold one nickname. */
let nickIndexReady = false;
async function ensureNickIndex(players) {
    if (nickIndexReady) return;
    await players.createIndex(
        { nickKey: 1 },
        { unique: true, name: "nickKey_unique", partialFilterExpression: { nickKey: { $type: "string" } } }
    );
    nickIndexReady = true;
}

/* Every collection that keeps a player's name for the public to read, with
   the field it is in. Found by following every write that takes a name from
   the session (see publicName in _player.js). NOT here, on purpose:
     - ff_runs: the admins' run log, never shown publicly; it records the
       session's Discord name as a log line about what happened.
     - dead_end_leads.from and contact_messages.from/discord: who SENT
       something, for the admins — the Discord identity is the point.
       Crediting a lead's sender reads the nickname live instead (see the
       credit in dead-end-leads.js).
     - contributors: an accepted lead's credit is a curated row the admins
       own and may have merged with a Habbo name; it is not renamed behind
       their backs. */
const NAMED = ["guess_scores", "daily_scores", "ff_scores", "ff_tournament", "daily_resets"];

const json = (statusCode, data, extra) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store", ...(extra || {}) },
    body: JSON.stringify(data)
});

const refuse = (error) => json(400, { error, field: "nick" });
const UNAVAILABLE = () => json(503, { error: "Nicknames can't be changed just now. Try again in a minute." });

const today = () => new Date().toISOString().slice(0, 10);

/* What a nickname IS once the typing is tidied away: composed characters,
   curly apostrophes made straight (phones type those), every run of
   whitespace one space, and no space at either end. */
function normalise(raw) {
    return String(raw)
        .normalize("NFC")
        .replace(/[‘’ʼ]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

/* The rules that need nothing but the name itself, and REFUSE: length,
   characters, the ends. Returns the reason in words a player can act on, or
   null. The word filter is not here any more (29 Sept 2026) — it flags
   instead of refusing; see filterHit. Exported for the tests. */
function shapeProblem(nick) {
    const length = [...nick].length;
    if (length < NICK_MIN) return `Nicknames need at least ${NICK_MIN} characters.`;
    if (length > NICK_MAX) return `Nicknames can be at most ${NICK_MAX} characters.`;
    if (!ALLOWED.test(nick)) return "Nicknames can use letters, numbers, spaces and - _ . ' ! ? only.";
    if (!STARTS.test(nick)) return "Start your nickname with a letter or a number.";
    if (!ENDS.test(nick)) return "End your nickname with a letter, a number, ! or ?.";
    if (nameKey(nick).length < NICK_MIN) return `Nicknames need at least ${NICK_MIN} letters or numbers.`;
    return null;
}

/* The word filter (see FLAGGED and THE RESERVED WORDS in the header): what
   a nickname that has passed shapeProblem trips, as { reason, word } —
   `reason` "reserved" or "profanity", `word` the list's own word that
   matched, which is what the Warren shows the admin — or null for a clean
   one. Reserved is checked first: "Admin" is more usefully reviewed as an
   impersonation than as anything else. */
function filterHit(nick) {
    const key = nameKey(nick);
    const words = nick.split(WORD_BREAK).map(nameKey).filter(Boolean);
    if (RESERVED.has(key)) return { reason: "reserved", word: key };
    const reservedWord = words.find(w => RESERVED.has(w));
    if (reservedWord) return { reason: "reserved", word: reservedWord };
    const reservedEnd = RESERVED_ENDS.find(r => key.startsWith(r) || key.endsWith(r));
    if (reservedEnd) return { reason: "reserved", word: reservedEnd };
    const folded = unLeet(nick);
    const foldedWords = nick.split(WORD_BREAK).map(unLeet).filter(Boolean);
    const anywhere = ANYWHERE.find(w => folded.includes(w));
    if (anywhere) return { reason: "profanity", word: anywhere };
    if (WHOLE_WORD.has(folded)) return { reason: "profanity", word: folded };
    const whole = foldedWords.find(w => WHOLE_WORD.has(w));
    if (whole) return { reason: "profanity", word: whole };
    return null;
}

/* The one clash rule left (29 Sept 2026; see NOT ANOTHER PLAYER'S NICKNAME
   in the header): somebody OTHER than `id` already holds this nickname, by
   nameKey. True or false. A quick, friendly answer ahead of the write; the
   unique index still has the last word, for the race this cannot see.
   Shared with the Warren's override (players-admin.js), which is held to
   exactly the same rule. */
async function takenBy(players, id, key) {
    const other = await players.findOne({ nickKey: key, id: { $ne: id } }, { projection: { _id: 0, id: 1 } });
    return !!other;
}

/* One entry on the players row's nickname history (see HISTORY in the
   header), as the update operator that adds it and drops all but the last
   HISTORY_MAX. `nick` null is a clear. `by` is "player" or
   "admin:<username>". `action` (29 Sept 2026) is only for the Warren's
   review — "allowed" or "rejected", `nick` then being the name reviewed —
   and is left off an ordinary set or clear, so the entries written before
   it existed read the same as the ones after. */
function historyPush(nick, at, by, action) {
    const entry = { nick: nick || null, at, by };
    if (action) entry.action = action;
    return { nickHistory: { $each: [entry], $slice: -HISTORY_MAX } };
}

/* The turned-down list (see TURNED DOWN in the header) with `key` added —
   once, newest last, the last TURNED_DOWN_MAX kept — or taken off. New
   arrays; a list that is not one reads as empty. Shared with the Warren. */
function turnedDownWith(list, key) {
    const rest = (Array.isArray(list) ? list : []).filter(k => k !== key);
    return key ? [...rest, key].slice(-TURNED_DOWN_MAX) : rest;
}
function turnedDownWithout(list, key) {
    return (Array.isArray(list) ? list : []).filter(k => k !== key);
}

/* The request came from this site. The session cookie is SameSite=Lax, so
   a cross-site POST does not carry it in the first place, and the JSON
   content type means a cross-site page would need a CORS preflight this
   endpoint never answers. This is the belt to those braces: a browser
   always sends Origin on a POST, and one naming another site is refused. */
function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try {
        return new URL(origin).host === host;
    } catch (e) {
        return false;
    }
}

/* Puts the player's current name on every row they have on a board. Best
   effort: the nickname is already saved when this runs, a failure is
   logged, and each row still shows the right name the next time that player
   files one (the combined and all-time boards take a player's newest row's
   name).

   THE NAME COMES FROM THE PLAYERS ROW, NOT THE CALLER (29 Sept 2026).
   `shown` and `nick` used to be written as given. Two renames can be in
   flight for one player at once — their own change here and an admin's
   override in players-admin.js — and each wrote the name IT had set, so
   when the player's board writes happened to land after the admin's, the
   boards kept the player's pick while the players row (and the lock) said
   the admin's: a nickname the admins had just taken away, still on every
   board, with nothing left to put it right.

   So each pass reads the players row as it is NOW and renames to that,
   with the displayName rule playerView uses (nick, else the Discord name),
   and then reads it again: if the row changed while the pass was writing,
   another rename crossed this one and this one's writes may have landed on
   top of it, so it goes round once more. Whichever rename finishes last
   has therefore written the stored truth — the rows converge on the
   players row whatever the interleaving. Three passes is slack, not a
   target: settling needs a second rename to cross this one on every pass.
   The caller's `shown` and `nick` are only the fallback for a row that
   cannot be read (a player forgotten mid-request), which is what they
   always were. */
async function renameRows(db, id, shown, nick) {
    const players = db.collection("players");
    const truth = async () => {
        let row = null;
        try {
            row = await players.findOne({ id }, { projection: { _id: 0, nick: 1, name: 1 } });
        } catch (e) {
            console.error("player-nick: could not read the players row to rename from", e);
        }
        if (!row) return { shown, nick: nick || null };
        const n = (typeof row.nick === "string" && row.nick) || null;
        return { shown: n || row.name || shown || "Someone", nick: n };
    };
    let now = await truth();
    for (let pass = 0; pass < 3; pass++) {
        const want = now;
        const done = await Promise.allSettled([
            ...NAMED.map(c => db.collection(c).updateMany({ playerId: id, name: { $ne: want.shown } }, { $set: { name: want.shown } })),
            /* And the nickname beside the Discord name on each Add Maze Info
               lead they sent, which is what the Warren offers to credit them
               as (dead-end-leads.js). `from.name` stays the Discord name:
               that is who sent it, for the admins. */
            db.collection("dead_end_leads").updateMany({ "from.id": id }, want.nick ? { $set: { "from.nick": want.nick } } : { $unset: { "from.nick": "" } })
        ]);
        done.forEach((r, i) => {
            if (r.status === "rejected") console.error(`player-nick: could not rename ${NAMED[i] || "dead_end_leads"}`, r.reason);
        });
        now = await truth();
        if (now.shown === want.shown && now.nick === want.nick) return;
    }
}

async function handler(event) {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!sameOrigin(event)) return json(403, { error: "Not from this site" });
    const player = playerFrom(event);
    if (!player) return json(401, { error: "Not signed in" });

    if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    let body;
    try {
        body = JSON.parse(event.body || "");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });

    /* Which of the three this is. `nick` present at all means a set or a
       clear (and either one also answers the prompt); otherwise it has to
       be exactly `asked: true`. */
    let mode, nick = null;
    if (Object.prototype.hasOwnProperty.call(body, "nick")) {
        if (body.nick !== null && typeof body.nick !== "string") return refuse("A nickname has to be text.");
        nick = body.nick === null ? "" : normalise(body.nick);
        mode = nick ? "set" : "clear";
        if (mode === "set") {
            const wrong = shapeProblem(nick);
            if (wrong) return refuse(wrong);
        }
    } else if (body.refuse === true) {
        // See REFUSED in the header.
        mode = "refuse";
    } else if (body.asked === true) {
        mode = "asked";
    } else if (body.profileIntro === true) {
        // The profile introduction has been shown (4 Oct 2026; see
        // profileIntroOf in discord-auth.js).
        mode = "profileIntro";
    } else {
        return json(400, { error: "Nothing to change." });
    }

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("player-nick: database connection failed", e);
        return UNAVAILABLE();
    }
    const players = db.collection("players");

    /* A banned player — soft or full, by account or by network — cannot set,
       clear or refuse a nickname (29 Sept 2026; see _bans.js): 403 { error,
       banned }. Every mode, `asked` too: a banned account is not being
       offered anything. A bans lookup that fails is a 503, as below. */
    const refusal = await writeRefusal(db, event, player.id);
    if (refusal) return refusal;

    try {
        await ensureUniqueIndex(players, "id");
        await ensureNickIndex(players);
    } catch (e) {
        console.error("player-nick: index unavailable", e);
        return UNAVAILABLE();
    }

    try {
        /* The row, made if it is missing — a sign-in whose profile write
           failed (discord-auth.js lets it), or a player forgotten while
           their session lived on (player-forget.js). Built from the session
           the same way the sign-in builds it, and as a player who has now
           been asked. */
        const now = new Date().toISOString();
        let made = false;
        try {
            const res = await players.updateOne(
                { id: player.id },
                { $setOnInsert: {
                    id: player.id, name: player.name, username: player.username || null, avatar: player.avatar || null,
                    nameKey: nameKey(player.name), usernameKey: nameKey(player.username), joinedAt: now, seenAt: now,
                    sv: newSv()
                } },
                { upsert: true }
            );
            made = !!(res && res.upsertedCount);
        } catch (e) {
            // Two first requests racing: the other one made it. Anything
            // else is a real failure.
            if (!(e && e.code === 11000)) throw e;
        }

        /* A REVOKED SESSION (30 Sept 2026; see SESSION VERSIONS in
           _player.js). A session carrying a session version whose row had to
           be made just now is one whose row was deleted — a forgotten
           player — so the row it made is taken away again and the session
           is refused. A row that is there but has moved on to another
           version is caught where the row is read: below, before a nickname
           is written, and in reply(). 401 with the cookie cleared, which the
           page (js/account.js) answers by asking `me` and showing the player
           signed out. */
        const revoked = () => json(401, { error: "Not signed in" }, { "Set-Cookie": clearCookie() });
        if (made && sessionRevoked(player, null)) {
            await players.deleteOne({ id: player.id }).catch(e => console.error("player-nick: could not remove a revoked session's row", e));
            return revoked();
        }

        /* `extra` rides beside `player` in the answer — `flagged`, below. */
        const reply = async (extra) => {
            const row = await players.findOne({ id: player.id }, { projection: { _id: 0 } });
            if (sessionRevoked(player, row)) return revoked();
            const view = playerView(player, row);
            return json(200, { player: view, ...(extra || {}) }, { "Set-Cookie": setCookie(signPlayer({ ...view, sv: svFor(player, row) })) });
        };

        /* Checked BEFORE the three small writes below, not only in reply()
           after them (4 Oct 2026, the bug scan): a session signed out
           everywhere could still mark the profile intro seen — which makes
           the profile public — and only then be refused. */
        if (mode === "asked" || mode === "profileIntro" || mode === "refuse") {
            const row = await players.findOne({ id: player.id }, { projection: { _id: 0, sv: 1, svStrict: 1 } });
            if (sessionRevoked(player, row)) return revoked();
        }

        if (mode === "asked") {
            await players.updateOne({ id: player.id }, { $set: { nickAsked: true } });
            return await reply();
        }

        /* The profile introduction shown, once and for good. It answers the
           first-sign-in nickname question too: a new player is taken to
           Edit Profile, where the nickname is the first thing on the page,
           instead of being asked in a window of its own. */
        if (mode === "profileIntro") {
            await players.updateOne({ id: player.id }, { $set: { profileIntroAt: now, nickAsked: true } });
            return await reply();
        }

        /* REFUSED (see the header). Only a rejected nickname can be
           refused; with no rejection standing — an admin allowed it a
           moment ago, say — this changes nothing and simply answers with
           the player as they are, so the page's window closes on the truth. */
        if (mode === "refuse") {
            await players.updateOne(
                { id: player.id, nickRejected: { $exists: true } },
                { $set: { nickRefused: true, nickAsked: true } }
            );
            return await reply();
        }

        const found = await players.findOne({ id: player.id }, { projection: { _id: 0, nick: 1, name: 1, nickLocked: 1, nickRejected: 1, nickTurnedDown: 1, sv: 1, svStrict: 1 } });
        if (sessionRevoked(player, found)) return revoked();
        const current = found || {};
        const had = (typeof current.nick === "string" && current.nick) || "";
        const rejected = !!(current.nickRejected && typeof current.nickRejected === "object");
        const turnedDown = Array.isArray(current.nickTurnedDown) ? current.nickTurnedDown : [];

        /* THE REJECTED NAME, RESPELT (30 Sept 2026). While a rejection
           stands, the nickname on the row IS the one the admins turned down
           (a set or a clear takes nickRejected off; so does the Warren's
           override). "H1tlerFan" saved again as "h1tlerfan" was a change by
           the test below and not taken (takenBy skips the player's own row),
           so it went through, took the rejection off and opened the games
           with no flag. Compared as "taken" compares — nameKey — it is the
           same name, and is refused as one. 400, so the window keeps the
           field and says why.

           AND LATER, TOO (30 Sept 2026): clearing the rejected name took
           the rejection off, and the same name could then simply be set
           again. So every name the admins reject stays turned down on the
           row (nickTurnedDown; see TURNED DOWN above), and a set whose
           nameKey is on it is refused the same way, rejection or not. */
        if (mode === "set" && ((rejected && had && nameKey(nick) === nameKey(had)) || turnedDown.includes(nameKey(nick)))) {
            return refuse(TURNED_DOWN_MESSAGE);
        }

        /* Asking for what is already there is not a change and does not
           count against the day — a double-pressed Save, or the prompt's
           "keep it" — but it does answer the prompt. Ahead of the lock, as
           it changes nothing the lock is protecting. */
        if (nick === had) {
            await players.updateOne({ id: player.id }, { $set: { nickAsked: true } });
            return await reply();
        }

        // Locked by the admins (see LOCKED in the header).
        if (current.nickLocked === true) return json(403, { error: LOCKED_MESSAGE, locked: true });

        const key = mode === "set" ? nameKey(nick) : null;
        if (mode === "set" && await takenBy(players, player.id, key)) return json(409, { error: TAKEN_MESSAGE });

        /* THE CHANGE AND THE DAY'S COUNT, IN ONE WRITE. Two shapes, because
           the count is either today's and under the cap (add one) or from
           another day (start again at one) — and whichever matches does the
           whole thing, so there is no moment when the count has been spent
           and the nickname not written, or the other way round. Neither
           matching means today's count is used up.

           The unique index is the last word on "taken": two players who both
           passed the checks above race here, and the second write is refused
           whole with 11000 — its count is not spent either.

           Both shapes also require the row not to be locked, so a lock the
           admins set between the read above and this write still wins; the
           history entry rides in the same write (29 Sept 2026).

           And so does the review (29 Sept 2026; see FLAGGED in the header):
           a nickname the filter trips gets its nickFlag, a clean one or a
           clear loses any flag left from before, and either way the admins'
           nickRejected goes — a new, different name (or the Discord name
           back) is the player acting on it. If the new name is flagged too,
           it simply goes back into the Warren's list for another look. */
        const hit = mode === "set" ? filterHit(nick) : null;
        // nickRefused goes with nickRejected (29 Sept 2026; see REFUSED).
        const fields = mode === "set"
            ? { $set: { nick, nickKey: key, nickAsked: true, nickAt: now }, $unset: { nickRejected: "", nickRefused: "" } }
            : { $set: { nickAsked: true, nickAt: now }, $unset: { nick: "", nickKey: "", nickRejected: "", nickRefused: "", nickFlag: "" } };
        if (hit) fields.$set.nickFlag = { reason: hit.reason, word: hit.word, at: now };
        else fields.$unset.nickFlag = "";
        // The name leaving under a rejection stays turned down (see TURNED
        // DOWN) — the Warren's reject records it too; this is for one
        // rejected before that existed.
        if (rejected && had) fields.$set.nickTurnedDown = turnedDownWith(turnedDown, nameKey(had));
        fields.$push = historyPush(mode === "set" ? nick : null, now, "player");
        const unlocked = { nickLocked: { $ne: true } };
        const day = today();
        let changed;
        try {
            const sameDay = await players.updateOne(
                { id: player.id, ...unlocked, nickDay: day, nickCount: { $lt: CHANGES_PER_DAY } },
                { ...fields, $inc: { nickCount: 1 } }
            );
            changed = sameDay.matchedCount > 0;
            if (!changed) {
                const newDay = await players.updateOne(
                    { id: player.id, ...unlocked, nickDay: { $ne: day } },
                    { ...fields, $set: { ...fields.$set, nickDay: day, nickCount: 1 } }
                );
                changed = newDay.matchedCount > 0;
            }
            /* PAST THE DAY'S CAP, ONCE, FOR A REJECTED NAME (30 Sept 2026). A
               player who had spent the day's five changes when the admins
               rejected their nickname got 429 on every save and clear, and
               every game stayed shut until UTC midnight — the admins'
               decision, charged to the player. So while nickRejected stands,
               the change goes through uncounted. Once only: `fields` takes
               nickRejected off in this same write, and the filter needs it
               there, so two saves racing get one free change between them
               and the next one is counted (and refused) as usual. */
            if (!changed && rejected) {
                const free = await players.updateOne(
                    { id: player.id, ...unlocked, nickRejected: { $exists: true } },
                    fields
                );
                changed = free.matchedCount > 0;
            }
        } catch (e) {
            if (e && e.code === 11000) return json(409, { error: TAKEN_MESSAGE });
            throw e;
        }
        if (!changed) {
            // Neither matched: the day's count is spent, or it was locked
            // in the meantime. Asked, so the answer is the true one.
            const now2 = await players.findOne({ id: player.id }, { projection: { _id: 0, nickLocked: 1 } });
            if (now2 && now2.nickLocked === true) return json(403, { error: LOCKED_MESSAGE, locked: true });
            return json(429, { error: `That's ${CHANGES_PER_DAY} nickname changes today. Try again tomorrow.` });
        }

        const shown = mode === "set" ? nick : (current.name || player.name || "Someone");
        await renameRows(db, player.id, shown, mode === "set" ? nick : null);
        /* WHAT TRIPPED THE FILTER, when something did (29 Sept 2026): the
           nickname is saved all the same, and the page shows a pop-up
           naming the word, so the player knows why the admins may ask them
           to change it. `word` is the list's own word that matched, as the
           Warren shows it. */
        return await reply(hit ? { flagged: { reason: hit.reason, word: hit.word } } : null);
    } catch (e) {
        console.error("player-nick: request failed", e);
        return UNAVAILABLE();
    }
}

exports.handler = handler;

/* For the tests, and for the Warren's override (players-admin.js, 29 Sept
   2026), which sets a nickname by the same rules and renames the same rows:
   one copy of each rule, so the two can never disagree about what a
   nickname may be. */
exports.normalise = normalise;
exports.shapeProblem = shapeProblem;
exports.filterHit = filterHit;
exports.takenBy = takenBy;
exports.historyPush = historyPush;
exports.renameRows = renameRows;
exports.ensureNickIndex = ensureNickIndex;
exports.NAMED = NAMED;
exports.CHANGES_PER_DAY = CHANGES_PER_DAY;
exports.HISTORY_MAX = HISTORY_MAX;
exports.LOCKED_MESSAGE = LOCKED_MESSAGE;
exports.TAKEN_MESSAGE = TAKEN_MESSAGE;
exports.TURNED_DOWN_MESSAGE = TURNED_DOWN_MESSAGE;
exports.turnedDownWith = turnedDownWith;
exports.turnedDownWithout = turnedDownWithout;
exports._resetForTests = () => { nickIndexReady = false; };

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("player-nick", exports.handler);

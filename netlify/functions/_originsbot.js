/* OriginsBot SSO — a signed-in player's Habbo Origins name, looked up by
   their Discord id, and made their nickname. (3 Oct 2026, the owner's)

   OriginsBot (api.originsbot.online) links Discord accounts to Habbo Origins
   accounts. Asked with a Discord id, it answers with the Habbo name and the
   hotel (COM, ES or BR) that account has linked, if it has. The owner's
   decisions:

     SET AND LOCKED. A name it finds becomes the player's nickname and is
     locked, as an admin's lock is (nickLockedBy "OriginsBot"), so the boards
     carry the name the player is actually known by in the hotel. The
     first-sign-in nickname prompt is skipped. The admins can still unlock,
     change or reject it from the Warren.

     SET ONCE. Once a name has been applied (`habbo.applied`), the player is
     never looked up again: the lock is the end of it, and whatever the
     admins do with the nickname afterwards stands. A Habbo rename is for the
     admins to put right by hand.

     LOOKED UP AT SIGN-IN AND ON THE NEXT VISIT, UNTIL FOUND. The sign-in
     asks, and so does `me` for anybody already signed in (discord-auth.js).
     A player OriginsBot has no link for (or whose name could not be used)
     is asked again once a week — RECHECK_MS — so somebody who links
     OriginsBot later catches up. A lookup that fails (OriginsBot down,
     slow, or answering nonsense) is tried again an hour later, not on every
     page load: RETRY_MS, claimed by `habboTriedAt` before the call, which
     also stops two tabs asking at once.

     THE HABBO OWNER WINS A CLASH. If somebody else already has the name as
     their nickname, theirs is cleared (and unlocked) and they are offered
     the nickname prompt again on their next visit (nickAsked: false), with
     a history entry saying why. Two exceptions, both left alone and
     recorded on this player's row as `habbo.clash`, for the admins: a name
     that is ALSO a verified Habbo name (the same name on another hotel),
     and a nickname that only folds to the same key ("W.i.l.f" against
     "Wilf"), which may be somebody's own Habbo name, not yet linked.

   THE KEY is ORIGINSBOT_SSO_KEY, set in Netlify's environment variables
   (and .env for `netlify dev`), never in the repo. Without it, nothing here
   runs and sign-in works as it always has.

   WHAT IS SENT: the Discord id, and nothing else. What is kept, on the
   players row: `habbo: { name, hotel, applied, checkedAt }` (name null when
   OriginsBot has no link), and `habboTriedAt`. Both go with the row when a
   player is forgotten. The privacy policy names OriginsBot (privacy-content.js). */
const { nameKey } = require("./_player");
const nickRules = require("./player-nick");

const API = "https://api.originsbot.online/api/sso/lookup";
const TIMEOUT_MS = 2500;
const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
// What nickLockedBy says, and what the Profile looks for (playerView).
const LOCKED_BY = "OriginsBot";
const HOTELS = new Set(["COM", "ES", "BR"]);

const enabled = () => !!process.env.ORIGINSBOT_SSO_KEY;

/* OriginsBot's answer for one Discord id:
     { found: true, name, hotel }   linked
     { found: false }               asked, and not linked
     null                           could not tell — down, slow, refused us,
                                    or an answer in a shape we don't know
   Never throws. */
async function lookup(discordId) {
    if (!enabled()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(API, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-API-Key": process.env.ORIGINSBOT_SSO_KEY
            },
            body: JSON.stringify({ discord_id: String(discordId) })
        });
        /* Not linked may come back as a 404 rather than Success: false —
           but only a 404 that SAYS so (3 Oct 2026). A bare one is as likely
           a moved path or a proxy's page, and reading that as "not linked"
           would hold every player off for a week; it is a failure instead,
           tried again in an hour. */
        if (res.status === 404) {
            const said = await res.json().catch(() => null);
            return said && said.Success === false ? { found: false } : null;
        }
        if (!res.ok) {
            console.warn(`originsbot: lookup answered ${res.status}`);
            return null;
        }
        const body = await res.json();
        if (!body || typeof body !== "object") return null;
        const data = body.Data;
        const name = data && typeof data.HabboName === "string" ? nickRules.normalise(data.HabboName) : "";
        if (body.Success !== true || !name) return body.Success === false || body.Success === true ? { found: false } : null;
        // It must be about the player we asked about.
        if (data.DiscordId !== undefined && String(data.DiscordId) !== String(discordId)) return null;
        const hotel = typeof data.Hotel === "string" ? data.Hotel.trim().toUpperCase() : "";
        return { found: true, name, hotel: HOTELS.has(hotel) ? hotel : (hotel.slice(0, 8) || null) };
    } catch (e) {
        console.warn("originsbot: lookup failed", e && e.name === "AbortError" ? "timed out" : e && e.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/* What a Habbo name has to be to go on the boards. Looser than a chosen
   nickname's shapeProblem — a Habbo name is a fact, not a choice, and
   Origins allows punctuation a nickname may not start or end with
   ("-=Wilf=-") — but held to what the boards' font can draw and the
   nickname length, so it cannot break a board row. */
const DRAWABLE = /^[A-Za-zÀ-ÏÑ-ÖØ-Üß-ïñ-öø-üÿŒœŸ0-9 !-/:-@[-`{-~]+$/u;
function habboShapeProblem(name) {
    const length = [...name].length;
    if (length < 1 || length > 20) return "length";
    if (!DRAWABLE.test(name)) return "characters";
    if (!nameKey(name)) return "no letters";
    return null;
}

/* Whether this players row is due a lookup now. Never once a name has been
   applied: see SET ONCE in the header. */
function due(row, now = Date.now()) {
    if (!enabled() || !row || !row.id) return false;
    if (row.habbo && typeof row.habbo.applied === "string" && row.habbo.applied) return false;
    const tried = Date.parse(row.habboTriedAt);
    if (Number.isFinite(tried) && now - tried < RETRY_MS) return false;
    const checked = Date.parse(row.habbo && row.habbo.checkedAt);
    return !(Number.isFinite(checked) && now - checked < RECHECK_MS);
}

/* Looks the player up and applies the answer to their row and the boards.
   Returns true when their nickname changed (the caller re-reads the row and
   re-signs the session). Never throws: a sign-in or a `me` must not fail
   because of this. */
async function refresh(db, row) {
    if (!due(row)) return false;
    try {
        const players = db.collection("players");
        const nowIso = new Date().toISOString();
        const before = new Date(Date.now() - RETRY_MS).toISOString();
        /* The claim: only one request asks for this player per RETRY_MS. */
        const claim = await players.updateOne(
            { id: row.id, $or: [{ habboTriedAt: { $exists: false } }, { habboTriedAt: { $lt: before } }] },
            { $set: { habboTriedAt: nowIso } }
        );
        if (!claim || !claim.matchedCount) return false;

        const answer = await lookup(row.id);
        if (!answer) return false;     // habboTriedAt stands: tried again in an hour
        return await apply(db, row, answer);
    } catch (e) {
        console.error("originsbot: refresh failed", e);
        return false;
    }
}

/* The answer, written. Separate from refresh so the tests can drive it. */
async function apply(db, row, answer) {
    const players = db.collection("players");
    const now = new Date().toISOString();
    const done = (habbo) => players.updateOne({ id: row.id }, { $set: { habbo }, $unset: { habboTriedAt: "" } });
    const prior = row.habbo && typeof row.habbo === "object" ? row.habbo : {};

    if (!answer.found) {
        // Not linked. Whatever nickname they have stays as it is.
        await done({ name: null, hotel: null, applied: prior.applied || null, checkedAt: now });
        return false;
    }
    const { name, hotel } = answer;
    const record = { name, hotel, applied: prior.applied || null, checkedAt: now };

    if (habboShapeProblem(name)) {
        await done({ ...record, unusable: habboShapeProblem(name) });
        return false;
    }
    const key = nameKey(name);
    await nickRules.ensureNickIndex(players);
    const holder = await players.findOne({ nickKey: key, id: { $ne: row.id } }, { projection: { _id: 0 } });
    if (holder) {
        /* THE SAME NAME, NOT ONE THAT FOLDS TO IT (3 Oct 2026). nickKey
           drops case, accents and punctuation, so "-=Wilf=-", "W.i.l.f" and
           "Wilf" are one key — but three different Habbo accounts. Only a
           holder whose nickname IS this Habbo name (letter case aside, as
           Habbo itself ignores it) gives way; one that merely folds to it
           could be the real owner of their own name, not linked yet, and is
           left alone. So is another verified owner (the same name on
           another hotel). Either way the key cannot be shared, so this
           player is recorded with `clash` for the admins and not applied. */
        const same = typeof holder.nick === "string" && holder.nick.toLowerCase() === name.toLowerCase();
        const holderVerified = holder.habbo && typeof holder.habbo.applied === "string" && holder.habbo.applied === holder.nick;
        if (!same || holderVerified) {
            await done({ ...record, clash: true });
            return false;
        }
        /* THE HABBO OWNER WINS: the other player's nickname goes, lock and
           review with it, and they are offered the prompt again. Only if
           they still hold it — matched on nickKey — so a change of their
           own in between is left alone. The history says why without
           saying who: another player's Discord id on this row would outlive
           that player being forgotten, and reach the Warren's viewers. */
        const evicted = await players.updateOne(
            { id: holder.id, nickKey: key },
            {
                $set: { nickAsked: false, nickAt: now },
                $unset: { nick: "", nickKey: "", nickLocked: "", nickLockedBy: "", nickLockedAt: "", nickFlag: "", nickRejected: "", nickRefused: "" },
                $push: nickRules.historyPush(null, now, "originsbot:habbo-owner")
            }
        );
        if (evicted && evicted.matchedCount) {
            await nickRules.renameRows(db, holder.id, holder.name || "Someone", null);
        }
    }

    const hit = nickRules.filterHit(name);
    const turnedDown = Array.isArray(row.nickTurnedDown) ? row.nickTurnedDown : [];
    const $set = {
        nick: name, nickKey: key, nickAt: now, nickAsked: true,
        nickLocked: true, nickLockedBy: LOCKED_BY, nickLockedAt: now,
        habbo: { ...record, applied: name }
    };
    const $unset = { nickRejected: "", nickRefused: "", habboTriedAt: "" };
    // Flagged for a look like any nickname, not refused: it is their name.
    if (hit) $set.nickFlag = { reason: hit.reason, word: hit.word, at: now };
    else $unset.nickFlag = "";
    if (turnedDown.includes(key)) $set.nickTurnedDown = nickRules.turnedDownWithout(turnedDown, key);
    try {
        await players.updateOne({ id: row.id }, { $set, $unset, $push: nickRules.historyPush(name, now, "originsbot") });
    } catch (e) {
        /* Somebody took the name between the look and the write. Recorded
           unapplied, and asked again in an hour: habboTriedAt set, and the
           checkedAt from before kept rather than stamped now, which would
           have held the next ask off for a week (3 Oct 2026). */
        if (e && e.code === 11000) {
            await players.updateOne({ id: row.id }, { $set: { habbo: { ...record, checkedAt: prior.checkedAt || null }, habboTriedAt: now } });
            return false;
        }
        throw e;
    }
    await nickRules.renameRows(db, row.id, name, name);
    return true;
}

module.exports = { enabled, lookup, due, refresh, apply, habboShapeProblem, LOCKED_BY, RECHECK_MS, RETRY_MS };

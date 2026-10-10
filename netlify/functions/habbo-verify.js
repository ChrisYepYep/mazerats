/* /.netlify/functions/habbo-verify — A PLAYER'S ANSWER TO THEIR GUESSED
   HABBO (5 Oct 2026, the owner's; see _habbo-guess.js).

   POST, signed in, { action }:
     "start"    a code to put in their Origins motto: { code, name, hotel }.
                The same code again for half an hour, so a second press does
                not change what they are typing.
     "check"    their Habbo's motto read fresh from Origins: the code in it
                links the Habbo (linkHabbo) — { linked: true } — or not yet:
                { linked: false, wait }. One look every CHECK_GAP_MS at most;
                sooner is a 429 with `wait`, the ms left.
     "decline"  Not now: the guess stays on their profile, unverified, and
                waits in the Warren's Players tab for an admin to approve.
                The answer says nothing of that (the owner's call).
     "notme"    Not their Habbo: the guess goes, and is not made again for
                this nickname. */
const crypto = require("crypto");
const { getDb } = require("./_db");
const { livePlayerFrom } = require("./_player");
const { writeRefusal } = require("./_bans");
const { SECURITY_HEADERS } = require("./_headers");
const { fetchOriginsProfile, ORIGINS_HOSTS } = require("./habbo");
const { linkHabbo, linked, barred, notList } = require("./_habbo-guess");

const CODE_TTL_MS = 30 * 60 * 1000;
/* Between two looks at their motto (the owner's: Origins can take a few
   minutes to show a new motto, so the page offers Check again, and it must
   not be a button that can be leant on). The page counts it down. */
const CHECK_GAP_MS = 30 * 1000;
// No 0/O or 1/I: a code read off a screen and typed into a motto.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// As player-nick.js: a POST naming another site is refused.
function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try { return new URL(origin).host === host; } catch (e) { return false; }
}

function newCode() {
    const bytes = crypto.randomBytes(5);
    let out = "MR-";
    for (let i = 0; i < 5; i++) out += CODE_LETTERS[bytes[i] % CODE_LETTERS.length];
    return out;
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!sameOrigin(event)) return json(403, { error: "Forbidden" });
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    const action = body && typeof body.action === "string" ? body.action : "";
    if (!["start", "check", "decline", "notme"].includes(action)) return json(400, { error: "Unknown action" });

    /* A database that cannot be reached is the 503 the page already words
       (10 Oct 2026, the bug scan): it was thrown, and reached the console as
       the platform's bare 500. */
    let db;
    try { db = await getDb(); } catch (e) {
        console.error("habbo-verify: database connection failed", e);
        return json(503, { error: "That can't be done just now. Try again in a moment." });
    }
    const player = await livePlayerFrom(db, event);
    if (!player) return json(401, { error: "Sign in first." });
    const refusal = await writeRefusal(db, event, player.id);
    if (refusal) return refusal;

    const players = db.collection("players");
    const who = { id: String(player.id) };
    const row = await players.findOne(who, { projection: { _id: 0, id: 1, nick: 1, habbo: 1, habboGuess: 1, habboVerify: 1 } });
    if (!row) return json(404, { error: "No profile yet." });
    /* A code past its half hour is taken off the row on the next look
       (10 Oct 2026, the privacy check): it was only ever ignored, and the
       policy says the code is kept for half an hour. Conditional on the
       code read, so a fresh one started meanwhile stays. _habbo-guess.js
       sweeps it as well, when the profile is drawn. */
    const v0 = row.habboVerify;
    if (v0 && typeof v0 === "object" && !(Date.now() - Date.parse(v0.at) < CODE_TTL_MS)) {
        await players.updateOne({ ...who, "habboVerify.code": v0.code === undefined ? { $exists: false } : v0.code }, { $unset: { habboVerify: "" } }).catch(() => {});
        delete row.habboVerify;
    }
    if (linked(row)) return json(200, { linked: true });
    const g = row.habboGuess;
    if (!g || !g.name || g.state === "rejected") return json(409, { error: "There's no Habbo to check any more." });
    /* A guess linked to another player since it was made, or unlinked from
       this one by an admin (NOT GUESSED in _habbo-guess.js, 10 Oct 2026),
       is not offered on the profile, so it is not verified here either. */
    if (action === "start" || action === "check") {
        if (await barred(db, row, notList(g), g.name, g.hotel)) return json(409, { error: "There's no Habbo to check any more." });
    }

    if (action === "decline") {
        await players.updateOne(who, { $set: { "habboGuess.state": "declined", "habboGuess.declinedAt": new Date().toISOString() } });
        return json(200, { ok: true });
    }
    if (action === "notme") {
        await players.updateOne(who, { $set: { "habboGuess.state": "rejected", "habboGuess.rejectedBy": "player" }, $unset: { habboVerify: "" } });
        return json(200, { ok: true });
    }

    const v = row.habboVerify;
    const current = v && v.name === g.name && v.hotel === g.hotel && Date.now() - Date.parse(v.at) < CODE_TTL_MS ? v : null;

    if (action === "start") {
        if (current) return json(200, { code: current.code, name: g.name, hotel: g.hotel });
        const fresh = { code: newCode(), name: g.name, hotel: g.hotel, at: new Date().toISOString() };
        await players.updateOne(who, { $set: { habboVerify: fresh } });
        return json(200, { code: fresh.code, name: g.name, hotel: g.hotel });
    }

    // check
    /* `expired` (10 Oct 2026): Edit Profile goes back to its Verify it
       button on it (js/console-profile.js, hvAct), which the words name;
       it offered only Check and Cancel, and Check could only say this. */
    if (!current) return json(409, { error: "That code has run out. Press Verify it for a new one.", expired: true });
    const last = Date.parse(current.checkedAt);
    const tooSoon = () => {
        const wait = Math.max(0, CHECK_GAP_MS - (Date.now() - last));
        return json(429, { error: "Give it a moment, then check again.", wait: Number.isFinite(wait) ? wait : CHECK_GAP_MS });
    };
    if (Number.isFinite(last) && Date.now() - last < CHECK_GAP_MS) return tooSoon();
    /* THE LOOK IS CLAIMED, not just noted (10 Oct 2026, the bug scan): the
       gap was read above and stamped here as two steps, so two Checks sent
       together (two tabs, a double tap) both passed and both asked Origins.
       The stamp is now conditional on the checkedAt that was read — the
       same code, and no newer look — so of a burst only one goes on. */
    const claimed = await players.updateOne(
        { ...who, "habboVerify.code": current.code, "habboVerify.checkedAt": current.checkedAt === undefined ? { $exists: false } : current.checkedAt },
        { $set: { "habboVerify.checkedAt": new Date().toISOString() } }
    );
    if (!claimed || !claimed.matchedCount) return tooSoon();
    let result;
    try {
        result = await fetchOriginsProfile(ORIGINS_HOSTS[g.hotel] || ORIGINS_HOSTS.COM, g.name);
    } catch (e) {
        return json(503, { error: "Habbo Origins isn't answering just now. Try again in a moment." });
    }
    const motto = result && result.found && result.profile ? String(result.profile.motto || "") : "";
    // Not there yet: the page may ask again in CHECK_GAP_MS.
    if (!motto.toUpperCase().includes(current.code)) return json(200, { linked: false, wait: CHECK_GAP_MS });
    await linkHabbo(db, player.id, g.name, g.hotel, "motto");
    return json(200, { linked: true });
};

exports.handler = require("./_errors").withErrorReporting("habbo-verify", exports.handler);

/* /.netlify/functions/ff-beta — may this player into Fallin' Furni while it
   is in BETA? (27 Oct 2026, the owner's: "when the game is in its beta
   state, it shows as coming soon to normal users still, but selected users
   can access it by a secret code … In the players section of the warren add
   functionality for me to mark signed up users as beta testers - without
   that, the code won't work".)

   GET, answered from the session cookie:

       { beta, tester }

   `beta` is whether the game's switch is on Beta (stored and said as
   fallinFurniState "coming-soon" with fallinFurniBeta beside it — see
   settings.js). `tester` is whether this
   player is marked a beta tester in the Warren's Players tab (`ffBeta` on
   their players row; players-admin.js). The game page lets them in only
   when both are true.

   THE CODE IS NOT CHECKED HERE. Typing it on the Coming Soon screen is
   what makes the page ask (js/fallinfurni.js keeps only its hash), and
   the answer depends on the tester mark alone: somebody who reads the
   code out of the page learns nothing they can use, and a tester who
   never typed it could only ask this for themselves. Not signed in, or a
   session that has been ended, is a 401: the page says to sign in.

   A beta tester plays as an admin does on a closed game: no run token
   (ff-scores.js counts Beta as closed), so nothing goes on the boards. */
const { getDb } = require("./_db");
const { playerFrom, sessionRevoked } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

async function handler(event) {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
    const player = playerFrom(event);
    if (!player) return json(401, { error: "Not signed in" });

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("ff-beta: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    let row, settings;
    try {
        [row, settings] = await Promise.all([
            db.collection("players").findOne({ id: String(player.id) }, { projection: { _id: 0, sv: 1, svStrict: 1, ffBeta: 1 } }),
            db.collection("settings").findOne({ _id: "site" }, { projection: { _id: 0, fallinFurniState: 1, fallinFurniBeta: 1 } })
        ]);
    } catch (e) {
        console.error("ff-beta: read failed", e);
        return json(503, { error: "That could not be checked just now" });
    }
    if (sessionRevoked(player, row)) return json(401, { error: "Not signed in" });
    return json(200, {
        // As settings.js stores it: Coming Soon with fallinFurniBeta (or a bare "beta").
        beta: Boolean(settings && (settings.fallinFurniState === "beta"
            || (settings.fallinFurniState === "coming-soon" && settings.fallinFurniBeta === true))),
        tester: Boolean(row && row.ffBeta === true)
    });
}

exports.handler = handler;

/* Failures reported to /warren's Errors tab, and the site-wide rate limit:
   see withErrorReporting in _errors.js. */
exports.handler = require("./_errors").withErrorReporting("ff-beta", exports.handler);

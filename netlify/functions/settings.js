/* /.netlify/functions/settings — site-wide settings: which state the
   welcome page's button is in (enter | coming-soon | maintenance), and the
   About blurb shown on the console modal's About page. GET is public; PUT
   requires an admin session and updates whichever fields are present in
   the request body, leaving the other untouched. Stored as a single
   document with a fixed _id, since there's only ever one. */
const { getDb } = require("./_db");
const { isAuthorized, canWrite, UNAUTHORIZED, READ_ONLY } = require("./_auth");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

const VALID_STATES = ["enter", "coming-soon", "maintenance"];
const DEFAULT_STATE = "enter";
const DEFAULT_ABOUT_TEXT = "";

/* Which furni falls past Fallin' Furni's title screen. A site-wide choice
   rather than a per-level one — the title screen is not a level — so it
   lives here with the other two settings rather than in a level document.

   An EMPTY list means "whatever the game ships with", which is how it
   behaves before anyone has ever set it. Ten is the cap the builder is given;
   it is enforced here as well as in the page, because the page is not where
   trust lives.

   Class names only, checked against the same shape the furni casts use, so a
   stored value can never be anything but a name the game could look up. */
const MAX_LOBBY_FURNI = 10;
const CLASS_NAME = /^[A-Za-z0-9_]{1,64}$/;

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const settings = db.collection("settings");

    if (event.httpMethod === "GET") {
        const doc = await settings.findOne({ _id: "site" });
        return json(200, {
            landingState: (doc && doc.landingState) || DEFAULT_STATE,
            aboutText: (doc && doc.aboutText) || DEFAULT_ABOUT_TEXT,
            lobbyFurni: (doc && Array.isArray(doc.lobbyFurni)) ? doc.lobbyFurni : []
        });
    }

    if (!isAuthorized(event)) return UNAUTHORIZED;
    // canWrite, not isAuthorized: a viewer is a real logged-in account and
    // passes isAuthorized quite correctly — it just isn't allowed to change
    // anything. See _auth.js.
    if (!(await canWrite(event))) return READ_ONLY;

    if (event.httpMethod === "PUT") {
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }
        const update = {};
        if (body.landingState !== undefined) {
            if (!VALID_STATES.includes(body.landingState)) {
                return json(400, { error: "landingState must be one of: " + VALID_STATES.join(", ") });
            }
            update.landingState = body.landingState;
        }
        if (body.aboutText !== undefined) {
            update.aboutText = String(body.aboutText);
        }
        if (body.lobbyFurni !== undefined) {
            if (!Array.isArray(body.lobbyFurni)) {
                return json(400, { error: "lobbyFurni must be an array of furni class names" });
            }
            // De-duplicated, because the title screen draws one of each and a
            // name listed twice would only bias which one turns up.
            const seen = [];
            for (const raw of body.lobbyFurni) {
                const name = String(raw || "").trim();
                if (!CLASS_NAME.test(name)) {
                    return json(400, { error: `Not a furni class name: ${name.slice(0, 40)}` });
                }
                if (!seen.includes(name)) seen.push(name);
            }
            if (seen.length > MAX_LOBBY_FURNI) {
                return json(400, { error: `At most ${MAX_LOBBY_FURNI} furni on the title screen` });
            }
            update.lobbyFurni = seen;
        }
        if (Object.keys(update).length === 0) {
            return json(400, { error: "Nothing to update" });
        }
        await settings.updateOne(
            { _id: "site" },
            { $set: update },
            { upsert: true }
        );
        const doc = await settings.findOne({ _id: "site" });
        return json(200, {
            landingState: (doc && doc.landingState) || DEFAULT_STATE,
            aboutText: (doc && doc.aboutText) || DEFAULT_ABOUT_TEXT,
            lobbyFurni: (doc && Array.isArray(doc.lobbyFurni)) ? doc.lobbyFurni : []
        });
    }

    return json(405, { error: "Method not allowed" });
};

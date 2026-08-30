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
            aboutText: (doc && doc.aboutText) || DEFAULT_ABOUT_TEXT
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
            aboutText: (doc && doc.aboutText) || DEFAULT_ABOUT_TEXT
        });
    }

    return json(405, { error: "Method not allowed" });
};

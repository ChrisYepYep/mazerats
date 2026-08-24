/* /.netlify/functions/settings — site-wide settings. Currently just one:
   which state the welcome page's button is in (enter | coming-soon |
   maintenance). GET is public; PUT requires an admin session. Stored as a
   single document with a fixed _id, since there's only ever one. */
const { getDb } = require("./_db");
const { isAuthorized, UNAUTHORIZED } = require("./_auth");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

const VALID_STATES = ["enter", "coming-soon", "maintenance"];
const DEFAULT_STATE = "enter";

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
        return json(200, { landingState: (doc && doc.landingState) || DEFAULT_STATE });
    }

    if (!isAuthorized(event)) return UNAUTHORIZED;

    if (event.httpMethod === "PUT") {
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }
        if (!VALID_STATES.includes(body.landingState)) {
            return json(400, { error: "landingState must be one of: " + VALID_STATES.join(", ") });
        }
        await settings.updateOne(
            { _id: "site" },
            { $set: { landingState: body.landingState } },
            { upsert: true }
        );
        return json(200, { landingState: body.landingState });
    }

    return json(405, { error: "Method not allowed" });
};

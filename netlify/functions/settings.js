/* /.netlify/functions/settings — site-wide settings: which state the
   welcome page's button is in (enter | coming-soon | maintenance), whether
   Fallin' Furni is playable or under maintenance, and the About blurb shown
   on the console modal's About page. GET is public; PUT
   requires an admin session and updates whichever fields are present in
   the request body, leaving the other untouched. Stored as a single
   document with a fixed _id, since there's only ever one. */
const { getDb } = require("./_db");
const { isAuthorized, canWrite, UNAUTHORIZED, READ_ONLY } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson, GATE_CDN_CACHE } = require("./_cache");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

const VALID_STATES = ["enter", "coming-soon", "maintenance"];
const DEFAULT_STATE = "enter";
const DEFAULT_ABOUT_TEXT = "";

/* FALLIN' FURNI'S OWN STATE, separate from the site's.

   The game page is public whatever the rest of the site is doing, so the
   landing state cannot speak for it — closing the site does not close the
   game, and closing the game should not close the site.

   THREE VALUES NOW. This said two, on the reasoning that a game page has
   nothing to be "coming soon" about: it is either playable or it is being
   worked on. That turned out to be wrong in the one case that matters, which
   is a game that has not launched yet — "Maintenance, back soon!" tells a
   first-time visitor that something they have never seen is temporarily
   broken, which is both untrue and a worse first impression than saying it
   is not open yet.

   The two closed states are identical in every mechanical respect: the way
   in is taken away, an admin still plays, the editor is untouched. They
   differ only in what the notice says, which is the whole point of having
   both.

   Defaults to live, so a site that has never touched this setting behaves
   exactly as it did before the setting existed. */
const VALID_FF_STATES = ["live", "coming-soon", "maintenance"];
const DEFAULT_FF_STATE = "live";

/* WHICH PALETTE THE SITE WEARS.

   "classic" is the brown the archive has always been, and is what everyone
   gets unless this is deliberately changed. Every other name is a palette in
   css/theme-<name>.css, generated from that same stylesheet and the same
   pixel art by tools/themes.js — purple, and the three Halloween ones.

   This list is the gate: a name that is not on it is refused, so a typo or a
   stale bookmark cannot put the site into a theme whose stylesheet does not
   exist. Adding a palette means adding it here, in THEMES in tools/themes.js,
   and as a button in warren.html.

   Site-wide and stored here, rather than a per-visitor preference kept in
   the browser, because it is a decision about how the archive LOOKS to
   everybody — the same kind of setting as the landing state. A visitor
   cannot choose it and nothing is remembered about them for it.

   Defaults to classic, so a database that has never heard of this setting
   renders exactly the site it rendered before it existed. */
const VALID_THEMES = ["classic", "purple", "pumpkin", "witch", "crimson"];
const DEFAULT_THEME = "classic";

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

/* When the site opens, as an instant in time, for the countdown on the
   landing page (see js/welcome.js).

   A SETTING RATHER THAN THE LAUNCH EVENT'S OWN DATE, which was the obvious
   alternative and is worse. The events collection is the archive's record
   of things that happened in the hotel; "when does this website open" is
   not one of those, and reading it from whichever upcoming event happens
   to be soonest would put a countdown to somebody's maze night on the
   front door. It is also a thing that gets nudged by an hour the evening
   before, which should not mean editing an archive record.

   Stored as an ISO instant and always in UTC, like every other date on the
   site — the countdown is to a moment, not to a wall clock, and everyone
   watching it is in a different place.

   An empty string is a real value meaning "no date yet": the gate then
   says Coming Soon exactly as it always did. That is the default, and it
   is what the landing page falls back to whenever the stored value cannot
   be parsed — a countdown is a decoration on the gate, and a broken one
   must never be able to take the gate down with it. */
function cleanLaunchAt(value) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    const when = new Date(raw);
    if (isNaN(when.getTime())) return null;      // null means "reject this"
    return when.toISOString();
}

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
        /* Through the edge, on the short gate policy — see GATE_CDN_CACHE in
           _cache.js for why this one is twenty seconds and not sixty. This
           is the most-requested endpoint on the site by a wide margin (every
           page asks once, and before this every page asked three times), and
           it was the only hot public read with no cache header at all. */
        return cachedJson(event, {
            landingState: (doc && doc.landingState) || DEFAULT_STATE,
            aboutText: (doc && doc.aboutText) || DEFAULT_ABOUT_TEXT,
            lobbyFurni: (doc && Array.isArray(doc.lobbyFurni)) ? doc.lobbyFurni : [],
            fallinFurniState: (doc && doc.fallinFurniState) || DEFAULT_FF_STATE,
            theme: (doc && doc.theme) || DEFAULT_THEME,
            palette: (doc && doc.palette) || null,
            launchAt: (doc && doc.launchAt) || ""
        }, { cdn: GATE_CDN_CACHE });
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
        if (body.fallinFurniState !== undefined) {
            if (!VALID_FF_STATES.includes(body.fallinFurniState)) {
                return json(400, { error: "fallinFurniState must be one of: " + VALID_FF_STATES.join(", ") });
            }
            update.fallinFurniState = body.fallinFurniState;
        }
        if (body.theme !== undefined) {
            if (!VALID_THEMES.includes(body.theme)) {
                return json(400, { error: "theme must be one of: " + VALID_THEMES.join(", ") });
            }
            update.theme = body.theme;
        }
        /* A CUSTOM PALETTE IS ITS OWN FIELD rather than another value of
           `theme`, and the separation is doing real work: a theme is a
           generated stylesheet that ships with the site and can be named in
           advance, while a palette is a row in a database that did not exist
           when this list was written. Overloading one field would mean either
           validating `theme` against the database on every save, or not
           validating it at all. They also stack — a palette is painted over
           whichever theme is on, so "purple, but with my own amber" needs
           both to be sayable at once. Empty string clears it. */
        if (body.palette !== undefined) {
            const p = String(body.palette || "").trim().toLowerCase();
            if (p && !/^[a-z0-9-]{1,40}$/.test(p)) {
                return json(400, { error: "That is not a palette name." });
            }
            update.palette = p || null;
        }
        if (body.launchAt !== undefined) {
            const when = cleanLaunchAt(body.launchAt);
            if (when === null) {
                return json(400, { error: "launchAt must be a date, or empty to clear it" });
            }
            update.launchAt = when;
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
            lobbyFurni: (doc && Array.isArray(doc.lobbyFurni)) ? doc.lobbyFurni : [],
            fallinFurniState: (doc && doc.fallinFurniState) || DEFAULT_FF_STATE,
            theme: (doc && doc.theme) || DEFAULT_THEME
        });
    }

    return json(405, { error: "Method not allowed" });
};

/* Checks the session token sent by the admin page on every write request
   (see auth.js for how that token gets issued via username/password login,
   and _db.js's "admins" collection for where accounts are stored). The
   token is a JWT signed with SESSION_SECRET, so verifying it here needs no
   database round-trip and naturally rejects once it expires. */
const jwt = require("jsonwebtoken");
const { getDb } = require("./_db.js");
const { recordWrite } = require("./_audit.js");

function isAuthorized(event) {
    return Boolean(usernameFromToken(event));
}

function tokenPayload(event) {
    const token = event.headers["x-admin-token"] || "";
    if (!token || !process.env.SESSION_SECRET) return null;
    try {
        return jwt.verify(token, process.env.SESSION_SECRET);
    } catch (e) {
        return null;
    }
}

function usernameFromToken(event) {
    const payload = tokenPayload(event);
    return (payload && payload.sub) || null;
}

/* Which sign-in a request belongs to. The JWT's issued-at claim is minted
   once per login and never changes for the life of that token, so it
   identifies a session without anything having to store one. */
function sessionOf(event) {
    const payload = tokenPayload(event);
    return (payload && payload.iat) || null;
}

/* The four roles. Lives here rather than in auth.js because it is no
   longer only auth.js that cares: any function that restricts something
   needs the same answer, and two copies of "who counts as what" is exactly
   the sort of thing that drifts apart. auth.js imports these.

     owner   — everything, including managing accounts and running scans.
     admin   — everything except account deletion, granting owner, and scans.
     viewer  — read-only. Can log in and look at the admin page and the site,
               and nothing else: every write endpoint refuses them (see
               canWrite below, which is what actually enforces it — the admin
               page hiding its buttons is only a courtesy).
     wizard  — the Hogwarts map, and nothing else. Reads everything a viewer
               reads; writes only through netlify/functions/wizard.js. See
               WRITE_SCOPES below for how that line is actually drawn.

   An unrecognised stored role reads as "admin" rather than as itself, so a
   typo in the database can never invent a role with undefined powers. */
const PERMANENT_OWNER = "ChrisYepYep";
const ROLES = ["owner", "admin", "viewer", "wizard"];

function resolveRole(admin) {
    if (admin && admin.username === PERMANENT_OWNER) return "owner";
    const role = admin && admin.role;
    return ROLES.includes(role) ? role : "admin";
}

/* What each role may CHANGE, by area of the site. Read access is not in
   here at all — every role that can log in can read everything, which is
   what a viewer is for.

   Three scopes today: "site" is the archive and everything around it
   (mazes, events, contributors, settings, bans, other people's accounts),
   "wizard" is the Hogwarts map at /wizard and nothing else, and "self" is
   the caller's own password. A guard with no scope means "site", so every
   endpoint written before this existed keeps exactly the rule it had — an
   owner or admin, nobody else.

   Owners and admins carry every scope by being listed with every scope
   rather than a "*": a wildcard makes adding a fourth area a silent grant
   to every existing account, and the whole point of the list is that
   widening someone's powers has to be typed out on purpose. */
const WRITE_SCOPES = {
    owner: ["site", "wizard", "self"],
    admin: ["site", "wizard", "self"],
    wizard: ["wizard", "self"],
    viewer: []
};

/* Unlike isAuthorized, these can't be answered from the token alone: the
   JWT carries only the username, and roles can change after it was issued
   (an account demoted mid-session would otherwise keep its old powers for
   up to 12 hours). One indexed lookup per call, on actions that are rare
   and slow anyway.

   Memoized on the request object, because a single request can now ask more
   than once: canWrite asks to decide, and refuseWrite asks again to word the
   refusal. The cache lives on `event`, which Netlify builds fresh per
   invocation, so it cannot outlive the request it belongs to the way a
   module-level cache on a warm container would. */
const ROLE_CACHE = Symbol("role");

async function roleOf(event) {
    if (event && Object.prototype.hasOwnProperty.call(event, ROLE_CACHE)) {
        return event[ROLE_CACHE];
    }
    const role = await lookUpRole(event);
    if (event) event[ROLE_CACHE] = role;
    return role;
}

async function lookUpRole(event) {
    const username = usernameFromToken(event);
    if (!username) return null;
    try {
        const db = await getDb();
        const admin = await db.collection("admins").findOne({ username });
        return resolveRole(admin || { username });
    } catch (e) {
        // A database that can't be reached is not permission to proceed.
        return null;
    }
}

async function isOwner(event) {
    return (await roleOf(event)) === "owner";
}

/* The guard every mutating endpoint uses in place of isAuthorized. Reads
   still go through isAuthorized, because a viewer is allowed to read — that
   is the entire point of the role.

   The scope defaults to "site", so a call written as canWrite(event) means
   what it has always meant. netlify/functions/wizard.js passes "wizard". */
async function canWrite(event, scope = "site") {
    const role = await roleOf(event);
    const allowed = (WRITE_SCOPES[role] || []).includes(scope);
    /* Every mutating endpoint on the site passes through here, which makes it
       the one place an action log can be kept without threading a call
       through ten handlers — and the one place that cannot be forgotten when
       an eleventh is added. Not awaited: the log must never hold up a save,
       or take one down with it. */
    if (allowed) recordWrite(event, usernameFromToken(event), sessionOf(event));
    return allowed;
}

const UNAUTHORIZED = {
    statusCode: 401,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Unauthorized" })
};

// 403, not 401: the caller IS logged in and their token is fine — the
// account simply isn't allowed this action. A 401 would send the admin page
// into its "session expired, log in again" path, which would be a lie and
// would log a working session out.
const forbidden = (message) => ({
    statusCode: 403,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: message })
});

// What a write endpoint returns to a viewer. Its own constant because a
// dozen call sites would otherwise each word it slightly differently.
const READ_ONLY = forbidden("This account is view-only and cannot make changes.");

// And what one returns to an account that CAN write, just not here — a
// Hogwarts account reaching an archive endpoint. Told apart from the above
// because "view-only" would be a plain untruth to somebody who has just
// finished saving a room on the map.
const OUT_OF_SCOPE = forbidden("This account can only make changes to the Hogwarts map.");

/* The refusal that fits the caller, for endpoints that care to be accurate
   about it. Free of charge after canWrite: roleOf is memoized per request,
   so this is a property read rather than a second trip to the database.

   Endpoints written before scopes existed keep returning READ_ONLY, which
   stays correct for them in the case that actually happens — a viewer. A
   Hogwarts account is refused by those too, just with a slightly blunt
   message, and only ever by hand-crafting the request: the admin page never
   shows it a control that would send one. */
async function refuseWrite(event) {
    return (await roleOf(event)) === "viewer" ? READ_ONLY : OUT_OF_SCOPE;
}

module.exports = {
    isAuthorized, usernameFromToken, sessionOf, UNAUTHORIZED,
    PERMANENT_OWNER, ROLES, resolveRole, roleOf, isOwner, canWrite,
    forbidden, READ_ONLY, OUT_OF_SCOPE, refuseWrite, WRITE_SCOPES
};

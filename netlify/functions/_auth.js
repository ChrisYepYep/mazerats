/* Checks the session token sent by the admin page on every write request
   (see auth.js for how that token gets issued via username/password login,
   and _db.js's "admins" collection for where accounts are stored). The
   token is a JWT signed with SESSION_SECRET, so verifying it here needs no
   database round-trip and naturally rejects once it expires. */
const jwt = require("jsonwebtoken");
const { getDb } = require("./_db.js");

function isAuthorized(event) {
    return Boolean(usernameFromToken(event));
}

function usernameFromToken(event) {
    const token = event.headers["x-admin-token"] || "";
    if (!token || !process.env.SESSION_SECRET) return null;
    try {
        return jwt.verify(token, process.env.SESSION_SECRET).sub || null;
    } catch (e) {
        return null;
    }
}

/* The three roles. Lives here rather than in auth.js because it is no
   longer only auth.js that cares: any function that restricts something
   needs the same answer, and two copies of "who counts as what" is exactly
   the sort of thing that drifts apart. auth.js imports these.

     owner   — everything, including managing accounts and running scans.
     admin   — everything except account deletion, granting owner, and scans.
     viewer  — read-only. Can log in and look at the admin page and the site,
               and nothing else: every write endpoint refuses them (see
               canWrite below, which is what actually enforces it — the admin
               page hiding its buttons is only a courtesy).

   An unrecognised stored role reads as "admin" rather than as itself, so a
   typo in the database can never invent a role with undefined powers. */
const PERMANENT_OWNER = "ChrisYepYep";
const ROLES = ["owner", "admin", "viewer"];

function resolveRole(admin) {
    if (admin && admin.username === PERMANENT_OWNER) return "owner";
    const role = admin && admin.role;
    return ROLES.includes(role) ? role : "admin";
}

/* Unlike isAuthorized, these can't be answered from the token alone: the
   JWT carries only the username, and roles can change after it was issued
   (an account demoted mid-session would otherwise keep its old powers for
   up to 12 hours). One indexed lookup per call, on actions that are rare
   and slow anyway. */
async function roleOf(event) {
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
   is the entire point of the role. */
async function canWrite(event) {
    const role = await roleOf(event);
    return role === "owner" || role === "admin";
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

module.exports = {
    isAuthorized, usernameFromToken, UNAUTHORIZED,
    PERMANENT_OWNER, ROLES, resolveRole, roleOf, isOwner, canWrite,
    forbidden, READ_ONLY
};

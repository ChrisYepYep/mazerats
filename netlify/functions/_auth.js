/* Checks the session token sent by the admin page on every write request
   (see auth.js for how that token gets issued via username/password login,
   and _db.js's "admins" collection for where accounts are stored). The
   token is a JWT signed with SESSION_SECRET, so verifying it here needs no
   database round-trip and naturally rejects once it expires. */
const jwt = require("jsonwebtoken");

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

const UNAUTHORIZED = {
    statusCode: 401,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Unauthorized" })
};

module.exports = { isAuthorized, usernameFromToken, UNAUTHORIZED };

/* /.netlify/functions/auth — real username/password admin login, backed by
   an "admins" collection in MongoDB (username + bcrypt password hash), plus
   account management (create/list/delete/reset password) for logged-in
   admins. Issues a JWT session token (see _auth.js) that expires after 12
   hours, so a stolen token stops working on its own.

   Roles: every account is "owner", "admin", "viewer" or "wizard" (see
   _auth.js). Only owners can delete accounts or create new owner accounts —
   a standard admin can still create accounts, but only as "admin",
   "viewer" or "wizard", and can't remove anyone. A viewer can do none of
   it, and cannot change anything anywhere else on the site either. A wizard
   is the same as a viewer everywhere except the Hogwarts map at /wizard,
   which it owns outright; the one thing it may change in HERE is its own
   password.
   The username ChrisYepYep is always treated as owner regardless of what's
   stored (see resolveRole in _auth.js, shared with every other owner-only
   endpoint) — that account predates the role field, and this
   guarantees it can never end up locked out of owner-only actions just
   because its stored document doesn't have role: "owner" set.

   Bootstrapping: the very first login (when the admins collection is still
   empty) is checked against the legacy shared ADMIN_PASSWORD env var
   instead of a stored account, and on success creates that username as the
   first real admin, with the "owner" role. This path only ever fires once
   the collection has zero admins, so it also doubles as a recovery route
   if every admin account is ever deleted. */
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDb } = require("./_db");
const { isAuthorized, canWrite, refuseWrite, usernameFromToken, sessionOf, UNAUTHORIZED, READ_ONLY, ROLES, resolveRole } = require("./_auth");
const { record } = require("./_audit");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

function signToken(username) {
    return jwt.sign({ sub: username }, process.env.SESSION_SECRET, { expiresIn: "12h" });
}

function validPassword(password) {
    return typeof password === "string" && password.length >= 8;
}

exports.handler = async (event) => {
    if (!process.env.SESSION_SECRET) {
        return json(500, { error: "SESSION_SECRET environment variable is not set" });
    }

    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const admins = db.collection("admins");

    if (event.httpMethod === "POST") {
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }

        if (body.action === "login") {
            const username = (body.username || "").trim();
            const password = body.password || "";
            if (!username || !password) return json(400, { error: "Username and password are required" });

            const count = await admins.countDocuments();
            if (count === 0) {
                if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
                    record(event, "login-failed", { username, reason: "bootstrap password" });
                    return json(401, { error: "Invalid username or password" });
                }
                const passwordHash = await bcrypt.hash(password, 10);
                const newAdmin = { username, passwordHash, role: "owner", createdAt: new Date().toISOString() };
                await admins.insertOne(newAdmin);
                record(event, "login", { username, role: "owner", note: "first account, bootstrapped" });
                return json(200, { token: signToken(username), username, role: resolveRole(newAdmin) });
            }

            const admin = await admins.findOne({ username });
            if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
                /* Logged with the username that was TRIED, which is the point:
                   a run of failures against a real account is the thing worth
                   noticing. The password itself is never recorded. */
                record(event, "login-failed", { username, reason: admin ? "wrong password" : "no such account" });
                return json(401, { error: "Invalid username or password" });
            }
            const token = signToken(username);
            record(event, "login", { username, role: resolveRole(admin), session: sessionOf({ headers: { "x-admin-token": token } }) });
            return json(200, { token, username, role: resolveRole(admin) });
        }

        if (body.action === "verify") {
            const username = usernameFromToken(event);
            if (!username) return UNAUTHORIZED;
            const admin = await admins.findOne({ username });
            /* Every admin page load verifies its token, so this is a free
               heartbeat: the gap between a session's first and last record is
               how long that person had the admin open. */
            record(event, "session", { username, session: sessionOf(event) });
            return json(200, { username, role: resolveRole(admin || { username }) });
        }

        if (body.action === "create") {
            if (!isAuthorized(event)) return UNAUTHORIZED;
            if (!(await canWrite(event))) return READ_ONLY;
            const username = (body.username || "").trim();
            const password = body.password || "";
            // Anything unrecognised lands on "admin" rather than being taken
            // at face value, so a bad value can't create an account whose
            // powers nothing has defined.
            const role = ROLES.includes(body.role) ? body.role : "admin";
            if (!username || !validPassword(password)) {
                return json(400, { error: "Username and an 8+ character password are required" });
            }
            if (role === "owner") {
                const requester = await admins.findOne({ username: usernameFromToken(event) });
                if (resolveRole(requester) !== "owner") {
                    return json(403, { error: "Only an owner can grant owner privileges" });
                }
            }
            if (await admins.findOne({ username })) return json(409, { error: "That username already exists" });
            const passwordHash = await bcrypt.hash(password, 10);
            await admins.insertOne({ username, passwordHash, role, createdAt: new Date().toISOString() });
            return json(201, { username, role });
        }

        return json(400, { error: "Unknown action" });
    }

    if (event.httpMethod === "GET") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        const all = await admins.find({}, { projection: { _id: 0, passwordHash: 0 } }).toArray();
        return json(200, all.map(a => ({ ...a, role: resolveRole(a) })));
    }

    if (event.httpMethod === "PUT") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }
        const username = (body.username || "").trim();
        const password = body.password || "";
        if (!username || !validPassword(password)) {
            return json(400, { error: "Username and an 8+ character password are required" });
        }
        /* Only an owner can reset someone else's password — a standard admin
           can still reset their own (self-service), same distinction the
           DELETE handler below already draws for removing accounts.

           Changing your own password is the "self" scope rather than "site",
           so a Hogwarts account — which has no business anywhere else in
           here — can still do this one thing to its own row. Resetting
           SOMEBODY ELSE'S is a site action and stays owner-only, checked
           below. See WRITE_SCOPES in _auth.js. */
        const requesterUsername = usernameFromToken(event);
        const scope = username === requesterUsername ? "self" : "site";
        if (!(await canWrite(event, scope))) return await refuseWrite(event);
        if (username !== requesterUsername) {
            const requester = await admins.findOne({ username: requesterUsername });
            if (resolveRole(requester) !== "owner") {
                return json(403, { error: "Only an owner can reset another admin's password" });
            }
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const result = await admins.findOneAndUpdate(
            { username },
            { $set: { passwordHash } },
            { returnDocument: "after", projection: { _id: 0, passwordHash: 0 } }
        );
        if (!result) return json(404, { error: "Admin not found" });
        return json(200, { ...result, role: resolveRole(result) });
    }

    if (event.httpMethod === "DELETE") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await canWrite(event))) return READ_ONLY;
        const requester = await admins.findOne({ username: usernameFromToken(event) });
        if (resolveRole(requester) !== "owner") {
            return json(403, { error: "Only an owner can delete admin accounts" });
        }
        const username = (event.queryStringParameters || {}).username;
        if (!username) return json(400, { error: "Missing username" });
        const count = await admins.countDocuments();
        if (count <= 1) return json(400, { error: "Can't delete the last remaining admin account" });
        const result = await admins.deleteOne({ username });
        if (result.deletedCount === 0) return json(404, { error: "Admin not found" });
        return json(200, { deleted: username });
    }

    return json(405, { error: "Method not allowed" });
};

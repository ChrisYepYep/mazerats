/* /.netlify/functions/auth — real username/password admin login, backed by
   an "admins" collection in MongoDB (username + bcrypt password hash), plus
   account management (create/list/delete/reset password) for logged-in
   admins. Issues a JWT session token (see _auth.js) that expires after 12
   hours, so a stolen token stops working on its own.

   Bootstrapping: the very first login (when the admins collection is still
   empty) is checked against the legacy shared ADMIN_PASSWORD env var
   instead of a stored account, and on success creates that username as the
   first real admin. This path only ever fires once the collection has zero
   admins, so it also doubles as a recovery route if every admin account is
   ever deleted. */
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDb } = require("./_db");
const { isAuthorized, usernameFromToken, UNAUTHORIZED } = require("./_auth");

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
                    return json(401, { error: "Invalid username or password" });
                }
                const passwordHash = await bcrypt.hash(password, 10);
                await admins.insertOne({ username, passwordHash, createdAt: new Date().toISOString() });
                return json(200, { token: signToken(username), username });
            }

            const admin = await admins.findOne({ username });
            if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
                return json(401, { error: "Invalid username or password" });
            }
            return json(200, { token: signToken(username), username });
        }

        if (body.action === "verify") {
            const username = usernameFromToken(event);
            if (!username) return UNAUTHORIZED;
            return json(200, { username });
        }

        if (body.action === "create") {
            if (!isAuthorized(event)) return UNAUTHORIZED;
            const username = (body.username || "").trim();
            const password = body.password || "";
            if (!username || !validPassword(password)) {
                return json(400, { error: "Username and an 8+ character password are required" });
            }
            if (await admins.findOne({ username })) return json(409, { error: "That username already exists" });
            const passwordHash = await bcrypt.hash(password, 10);
            await admins.insertOne({ username, passwordHash, createdAt: new Date().toISOString() });
            return json(201, { username });
        }

        return json(400, { error: "Unknown action" });
    }

    if (event.httpMethod === "GET") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        const all = await admins.find({}, { projection: { _id: 0, passwordHash: 0 } }).toArray();
        return json(200, all);
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
        const passwordHash = await bcrypt.hash(password, 10);
        const result = await admins.findOneAndUpdate(
            { username },
            { $set: { passwordHash } },
            { returnDocument: "after", projection: { _id: 0, passwordHash: 0 } }
        );
        if (!result) return json(404, { error: "Admin not found" });
        return json(200, result);
    }

    if (event.httpMethod === "DELETE") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
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

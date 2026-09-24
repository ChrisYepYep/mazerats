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
   is the same as a viewer everywhere except the atlas at /wizard,
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
const { getDb } = require("./_db");
const { isAuthorized, hasAccount, canWrite, refuseWrite, usernameFromToken, sessionOf, UNAUTHORIZED, READ_ONLY, ROLES, PERMANENT_OWNER, resolveRole, signAdminToken } = require("./_auth");
const { record, COLLECTION: ACTIVITY } = require("./_audit");
const { SECURITY_HEADERS } = require("./_headers");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

// Minted in _auth.js, beside the verifier that has to agree with it about
// the audience — see ADMIN_AUDIENCE there.
const signToken = signAdminToken;

function validPassword(password) {
    return typeof password === "string" && password.length >= 8;
}

/* Anything off the wire is text or it is nothing. `(body.x || "").trim()`
   throws outright on an object or an array, which turned a one-line crafted
   request into an unhandled 500 with a stack trace in the body — and on a
   handler that anyone on the internet can reach without signing in. Coerced
   first, so a non-string arrives here as the nonsense it is and gets refused
   by the ordinary checks below rather than taking the function down.

   Not stringified — emptied. `String({})` is "[object Object]", which is a
   perfectly usable username as far as every length check here is concerned,
   and there is no reason to let a malformed request invent one. A field of
   the wrong type is a field with nothing in it. */
const text = (v) => (typeof v === "string" ? v : "");

/* ---- HOW MANY TIMES YOU MAY GET IT WRONG.

   Every failure is already written to admin_activity by _audit.js, with the
   IP and the time on it, so the counter this needs is a query rather than a
   new store — which matters on Netlify, where nothing in memory survives
   between invocations and there is no shared cache to lean on. Same shape as
   the per-IP cap contact.js has always had.

   Counted per IP AND per username, whichever trips first. The IP cap stops
   one host working through a password list; the username cap stops the same
   account being worked on from a botnet, which the IP cap alone would miss
   entirely.

   bcrypt is the reason this matters twice over. A cost-10 hash is ~45ms of
   CPU that an anonymous caller can ask for as often as they like, so an
   unthrottled login is not only a guessing game left running, it is a way to
   spend the site's compute budget from outside. The check below happens
   BEFORE any hashing, so a refused attempt costs one indexed count. */
const LOGIN_MAX_PER_IP = 10;
const LOGIN_MAX_PER_USER = 15;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGGED_NAME_MAX = 60;

function clientIp(event) {
    /* Only the value Netlify computes. x-forwarded-for is client-settable,
       so honouring it would let an attacker rotate the header and walk
       straight past the cap. Same reasoning, and the same single source, as
       contact.js. */
    return (event.headers || {})["x-nf-client-connection-ip"] || null;
}

/* Null when the request is under the cap; otherwise the 429 to return.

   A missing IP skips only the IP half — the username half still applies, so
   an unidentifiable caller is throttled per account rather than not at all.
   Failing open on the whole check would make the header its own bypass. */
async function loginThrottle(db, event, username) {
    const since = new Date(Date.now() - LOGIN_WINDOW_MS);
    const ip = clientIp(event);
    const activity = db.collection(ACTIVITY);

    const [byIp, byUser] = await Promise.all([
        ip ? activity.countDocuments({ type: "login-failed", ip, at: { $gte: since } },
            { limit: LOGIN_MAX_PER_IP }) : Promise.resolve(0),
        activity.countDocuments({ type: "login-failed", username, at: { $gte: since } },
            { limit: LOGIN_MAX_PER_USER })
    ]);

    if (byIp < LOGIN_MAX_PER_IP && byUser < LOGIN_MAX_PER_USER) return null;
    return {
        statusCode: 429,
        headers: { ...SECURITY_HEADERS, "Retry-After": String(Math.ceil(LOGIN_WINDOW_MS / 1000)) },
        body: JSON.stringify({ error: "Too many sign-in attempts. Try again in a few minutes." })
    };
}

/* A bcrypt hash of nothing in particular, compared against when the account
   does not exist.

   Without it the two outcomes take visibly different times — measured on
   this site, 80ms for a real username against 35ms for one that has never
   existed, because only the real one reaches bcrypt. That gap is a free
   directory of valid admin names, which is exactly the thing the identical
   "Invalid username or password" wording above is trying not to give away.
   So the miss does the same work the hit does and throws the answer away. */
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

async function passwordMatches(password, admin) {
    const hash = (admin && admin.passwordHash) || DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash);
    return Boolean(admin) && ok;
}

exports.handler = async (event) => {
    if (!process.env.SESSION_SECRET) {
        return json(500, { error: "SESSION_SECRET environment variable is not set" });
    }

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("auth: database connection failed", e);
        return json(500, { error: "Database connection failed" });
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
            const username = text(body.username).trim();
            const password = text(body.password);
            if (!username || !password) return json(400, { error: "Username and password are required" });
            /* The name as it is counted and logged: cut to LOGGED_NAME_MAX.
               A failed attempt writes whatever was typed into admin_activity,
               and nothing bounded it, so anybody could park megabytes of
               "username" in the log, one refused login at a time. The real
               lookup below still uses the whole name. */
            const tried = username.slice(0, LOGGED_NAME_MAX);

            /* Before the database is asked anything and before bcrypt runs,
               so a throttled attempt is the cheapest response this function
               has rather than its most expensive one. */
            const throttled = await loginThrottle(db, event, tried);
            if (throttled) return throttled;

            const count = await admins.countDocuments();
            if (count === 0) {
                if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
                    /* AWAITED, unlike every other call to record(). The audit
                       log is fire-and-forget everywhere else because nothing
                       should be able to hold up a save — but here the record
                       IS the counter loginThrottle reads, and a burst fired
                       faster than the writes land would count nothing and be
                       throttled at nothing. Paid only on a failure. */
                    await record(event, "login-failed", { username: tried, reason: "bootstrap password" });
                    return json(401, { error: "Invalid username or password" });
                }
                const passwordHash = await bcrypt.hash(password, 10);
                const newAdmin = { username, passwordHash, role: "owner", createdAt: new Date().toISOString() };
                await admins.insertOne(newAdmin);
                record(event, "login", { username, role: "owner", note: "first account, bootstrapped" });
                return json(200, { token: signToken(username), username, role: resolveRole(newAdmin) });
            }

            const admin = await admins.findOne({ username });
            // Runs a hash either way — see DUMMY_HASH above for why.
            if (!(await passwordMatches(password, admin))) {
                /* Logged with the username that was TRIED, which is the point:
                   a run of failures against a real account is the thing worth
                   noticing. The password itself is never recorded.

                   Awaited for the same reason the bootstrap failure above is:
                   this row is what the next attempt will be counted against. */
                await record(event, "login-failed", { username: tried, reason: admin ? "wrong password" : "no such account" });
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
            // A token for an account that has since been deleted is a
            // signed-out session, not an admin one — see lookUpRole in _auth.js.
            if (!admin) return UNAUTHORIZED;
            /* Every admin page load verifies its token, so this is a free
               heartbeat: the gap between a session's first and last record is
               how long that person had the admin open. */
            record(event, "session", { username, session: sessionOf(event) });
            return json(200, { username, role: resolveRole(admin) });
        }

        if (body.action === "create") {
            if (!isAuthorized(event)) return UNAUTHORIZED;
            if (!(await canWrite(event))) return READ_ONLY;
            const username = text(body.username).trim();
            const password = text(body.password);
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
        if (!(await hasAccount(event))) return UNAUTHORIZED;
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
        const username = text(body.username).trim();
        const password = text(body.password);
        if (!username || !validPassword(password)) {
            return json(400, { error: "Username and an 8+ character password are required" });
        }
        /* Only an owner can reset someone else's password — a standard admin
           can still reset their own (self-service), same distinction the
           DELETE handler below already draws for removing accounts.

           Changing your own password is the "self" scope rather than "site",
           so an atlas account — which has no business anywhere else in
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
        /* The permanent owner is owner by name (resolveRole in _auth.js), so
           deleting the row does not demote it — it removes the one account
           the whole role system is built never to lose, and any other owner
           could do it. The bootstrap route only comes back when EVERY admin
           is gone, so this would not have been recoverable from the site. */
        if (username === PERMANENT_OWNER) return json(403, { error: "That account can't be deleted" });
        const count = await admins.countDocuments();
        if (count <= 1) return json(400, { error: "Can't delete the last remaining admin account" });
        const result = await admins.deleteOne({ username });
        if (result.deletedCount === 0) return json(404, { error: "Admin not found" });
        return json(200, { deleted: username });
    }

    return json(405, { error: "Method not allowed" });
};

/* /.netlify/functions/auth — real username/password admin login, backed by
   an "admins" collection in MongoDB (username + bcrypt password hash), plus
   account management (create/list/delete/reset password) for logged-in
   admins. Issues a JWT session token (see _auth.js) that expires after 12
   hours, so a stolen token stops working on its own.

   Roles: every account is "owner", "admin", "viewer" or "wizard" (see
   _auth.js). Only owners can delete accounts or create new owner accounts —
   a standard admin can still create accounts, but only as "admin",
   "viewer" or "wizard", and can't remove anyone. A viewer can do none of
   it bar changing its own password, and cannot change anything anywhere
   else on the site either. A wizard
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
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, hasAccount, canWrite, refuseWrite, usernameFromToken, sessionOf, tokenPayload, tokenIsCurrent, UNAUTHORIZED, READ_ONLY, ROLES, PERMANENT_OWNER, resolveRole, signAdminToken, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
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

   Counted per IP AND per (username, IP) pair, whichever trips first, with a
   third, much higher per-username ceiling across every IP that SLOWS rather
   than refuses.

   The username cap used to be per username alone, and refused outright,
   BEFORE the password was looked at. That made it a lockout anybody could
   hold: fifteen junk attempts at "ChrisYepYep" every fifteen minutes, from
   anywhere, and the owner's own correct password was answered with a 429
   for as long as they cared to keep it up. A throttle that refuses the
   right password is a denial of service with a nicer error message.

   So the refusing caps are now only ever about the host asking. The IP cap
   stops one host working through a password list; the pair cap is the same
   thing for a caller whose address is missing or shared (see clientIp), and
   keeps one noisy host from spending an account's whole allowance. Neither
   can touch the real owner signing in from their own machine.

   What the username cap was for — the same account worked on from a
   botnet, which no per-host cap sees — is the ceiling's job now. Over it,
   every answer for that username (right or wrong, so the delay tells a
   guesser nothing) waits LOGIN_SLOW_MS first. It cannot stop a botnet, and
   nothing that still lets the right password in could; what it does is cut
   what each bot gets through per minute, and make the run loud in the
   activity log, while the owner still gets in — slowly.

   bcrypt is the reason this matters twice over. A cost-10 hash is ~45ms of
   CPU that an anonymous caller can ask for as often as they like, so an
   unthrottled login is not only a guessing game left running, it is a way to
   spend the site's compute budget from outside. The check below happens
   BEFORE any hashing, so a refused attempt costs an insert, two indexed
   counts and a delete — and no bcrypt. */
const LOGIN_MAX_PER_IP = 10;
const LOGIN_MAX_PER_USER_IP = 15;
const LOGIN_SLOW_PER_USER = 100;
const LOGIN_SLOW_MS = 2500;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGGED_NAME_MAX = 60;

function clientIp(event) {
    /* Only the value Netlify computes. x-forwarded-for is client-settable,
       so honouring it would let an attacker rotate the header and walk
       straight past the cap. Same reasoning, and the same single source, as
       contact.js. */
    return (event.headers || {})["x-nf-client-connection-ip"] || null;
}

/* Claims a place under the cap, or returns the 429 to send instead.

   INSERT FIRST, THEN COUNT — the contact.js pattern. This used to count the
   failures and write its own row only after bcrypt had answered, which is a
   check-then-act race with a 45ms gap in the middle: a burst of attempts
   fired together all counted the same nine earlier failures, all saw room
   for one more, and all got their guess. The cap held for a patient
   attacker and not at all for a parallel one.

   Now every attempt writes its row BEFORE it counts, presumed a failure, so
   each request's row is already visible to every other request's count. The
   k-th row to land counts at least k, so however a burst interleaves no more
   than the cap get past this point. The caller then settles the row: a
   success deletes it (a correct password never counted against anybody, and
   still does not), a failure fills in the reason. A refused attempt takes
   its row straight back out, so hammering a locked account does not keep
   extending its own lockout — the same as before, when a refusal wrote
   nothing. Under a real race this can refuse one more than it strictly had
   to, which is the direction to be wrong in.

   A missing IP skips only the IP half — the pair half still applies (as
   username + no-address), so an unidentifiable caller is throttled per
   account rather than not at all. Failing open on the whole check would
   make the header its own bypass.

   Returns { refused } or { settle(reason), slow }: settle(null) is a
   success and removes the row, settle("…") records the failure; `slow` is
   true when the username is over its all-hosts ceiling and the caller
   should wait LOGIN_SLOW_MS before answering, whatever the answer. Throws
   if the database does — the caller answers 503 rather than letting an
   attempt through unthrottled.

   The current-password check on a password change (the PUT below) goes
   through here too, filed as the same "login-failed" with its own reason.
   It is the same guessing game — a stolen session trying passwords against
   its own account — so it shares the same caps, and the activity page
   already shows it without being taught a new kind of row. */
async function loginThrottle(db, event, username) {
    const type = "login-failed";
    const since = new Date(Date.now() - LOGIN_WINDOW_MS);
    const ip = clientIp(event);
    const activity = db.collection(ACTIVITY);

    // The same shape _audit.js's record() writes, so the activity page reads
    // it as any other failed sign-in.
    const { insertedId } = await activity.insertOne({
        at: new Date(),
        type,
        ip,
        agent: ((event.headers || {})["user-agent"] || "").slice(0, 180),
        username,
        reason: "checking"
    });

    /* `ip` is null for an unidentified caller, and { ip: null } matches
       exactly the rows written without one — so the pair count is
       "this username, from nowhere in particular" in that case. */
    const [byIp, byPair, byUser] = await Promise.all([
        ip ? activity.countDocuments({ type, ip, at: { $gte: since } },
            { limit: LOGIN_MAX_PER_IP + 1 }) : Promise.resolve(0),
        activity.countDocuments({ type, username, ip, at: { $gte: since } },
            { limit: LOGIN_MAX_PER_USER_IP + 1 }),
        activity.countDocuments({ type, username, at: { $gte: since } },
            { limit: LOGIN_SLOW_PER_USER + 1 })
    ]);

    // Strictly more than the cap, because the count includes this attempt's
    // own row: ten earlier failures plus this one is eleven, and refused.
    // byUser is deliberately NOT here — see the top of this section.
    if (byIp > LOGIN_MAX_PER_IP || byPair > LOGIN_MAX_PER_USER_IP) {
        await activity.deleteOne({ _id: insertedId }).catch(() => {});
        return {
            refused: {
                statusCode: 429,
                headers: { ...SECURITY_HEADERS, "Retry-After": String(Math.ceil(LOGIN_WINDOW_MS / 1000)) },
                body: JSON.stringify({ error: "Too many sign-in attempts. Try again in a few minutes." })
            }
        };
    }

    /* Settling cannot fail the sign-in. If it does not land, the row simply
       stays as a failure marked "checking" — which still counts, so the
       throttle errs towards stricter rather than looser. */
    return {
        slow: byUser > LOGIN_SLOW_PER_USER,
        settle: (reason) => (reason
            ? activity.updateOne({ _id: insertedId }, { $set: { reason } })
            : activity.deleteOne({ _id: insertedId })).catch(() => {})
    };
}

const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

/* A fresh tokenVersion for an account row — see tokenIsCurrent in _auth.js.
   Random rather than a counter, so an account deleted and then created again
   under the same name can never land back on a version its old tokens
   carry. */
const newTokenVersion = () => crypto.randomUUID();

/* One username, one row — enforced by Mongo rather than by the findOne
   check in front of the insert, which two creates arriving together could
   both pass. Via ensureUniqueIndex, memoised per warm instance.

   If the index cannot be built (duplicates already stored would stop it)
   the create carries on under the findOne check alone, as it always has,
   rather than leaving nobody able to add an account; the log says why. */
async function ensureUsernameIndex(admins) {
    try {
        await ensureUniqueIndex(admins, "username");
    } catch (e) {
        console.error("auth: unique index on admins.username unavailable", e);
    }
}

const TAKEN = () => json(409, { error: "That username already exists" });

async function handlePost(event, body, db, admins) {
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

        /* Before the accounts are asked anything and before bcrypt runs,
           so a throttled attempt is the cheapest response this function
           has rather than its most expensive one. */
        const attempt = await loginThrottle(db, event, tried);
        if (attempt.refused) return attempt.refused;
        /* The all-hosts ceiling: slowed, never refused. Before the password
           is looked at, so a right answer and a wrong one wait the same. */
        if (attempt.slow) await pause(LOGIN_SLOW_MS);

        const count = await admins.countDocuments();
        if (count === 0) {
            if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
                /* AWAITED. The row IS the counter loginThrottle reads; see
                   there. Paid only on a failure. */
                await attempt.settle("bootstrap password");
                return json(401, { error: "Invalid username or password" });
            }
            await attempt.settle(null);
            await ensureUsernameIndex(admins);
            const passwordHash = await bcrypt.hash(password, 10);
            const newAdmin = { username, passwordHash, role: "owner", tokenVersion: newTokenVersion(), createdAt: new Date().toISOString() };
            try {
                await admins.insertOne(newAdmin);
            } catch (e) {
                if (e && e.code === 11000) return TAKEN();
                throw e;
            }
            record(event, "login", { username, role: "owner", note: "first account, bootstrapped" });
            return json(200, { token: signToken(username, newAdmin.tokenVersion), username, role: resolveRole(newAdmin) });
        }

        const admin = await admins.findOne({ username });
        // Runs a hash either way — see DUMMY_HASH above for why.
        if (!(await passwordMatches(password, admin))) {
            /* Logged with the username that was TRIED, which is the point:
               a run of failures against a real account is the thing worth
               noticing. The password itself is never recorded.

               Awaited: this row is what the next attempt is counted
               against, and the reason is what the activity page shows. */
            await attempt.settle(admin ? "wrong password" : "no such account");
            return json(401, { error: "Invalid username or password" });
        }
        // A correct password never counts towards anybody's cap.
        await attempt.settle(null);
        const token = signToken(username, admin.tokenVersion);
        record(event, "login", { username, role: resolveRole(admin), session: sessionOf({ headers: { "x-admin-token": token } }) });
        return json(200, { token, username, role: resolveRole(admin) });
    }

    if (body.action === "verify") {
        const payload = tokenPayload(event);
        const username = payload && payload.sub;
        if (!username) return UNAUTHORIZED;
        const admin = await admins.findOne({ username });
        // A token for an account that has since been deleted, or minted
        // before its password last changed, is a signed-out session, not an
        // admin one — see lookUpRole and tokenIsCurrent in _auth.js.
        if (!admin || !tokenIsCurrent(admin, payload)) return UNAUTHORIZED;
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
        await ensureUsernameIndex(admins);
        // The quick answer for the ordinary case; the index is the real one.
        if (await admins.findOne({ username })) return TAKEN();
        const passwordHash = await bcrypt.hash(password, 10);
        try {
            await admins.insertOne({ username, passwordHash, role, tokenVersion: newTokenVersion(), createdAt: new Date().toISOString() });
        } catch (e) {
            // Duplicate key: another create for the same name landed first.
            if (e && e.code === 11000) return TAKEN();
            throw e;
        }
        return json(201, { username, role });
    }

    return json(400, { error: "Unknown action" });
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

        /* The whole of the POST inside one try. This is the one handler here
           anybody on the internet can reach without signing in, and a
           database that failed mid-login (the throttle insert, the account
           read) used to throw straight out as an unhandled rejection —
           Netlify's bare 502, or a stack trace. A plain 503 in JSON is what
           the login form knows how to show. */
        try {
            return await handlePost(event, body, db, admins);
        } catch (e) {
            console.error("auth: POST failed", e);
            // "create" goes through canWrite; its failure is worded for
            // what it is rather than as a failed sign-in.
            if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
            return json(503, { error: "Sign-in is unavailable just now. Please try again in a minute." });
        }
    }

    /* The rest inside one try too, for the reason the POST is. GET, PUT and
       DELETE each read or write the accounts with nothing around them, so a
       database that dropped mid-request answered with Lambda's errorType
       and stack trace in the body; and since the guards now THROW when the
       account lookup cannot be made (see lookUpRole in _auth.js), this is
       also what turns that into a 503 the admin page retries, instead of
       the 401 that used to sign everybody out. */
    try {
        return await handleRest(event, db, admins);
    } catch (e) {
        console.error(`auth: ${event.httpMethod} failed`, e);
        return AUTH_UNAVAILABLE;
    }
};

async function handleRest(event, db, admins) {
    if (event.httpMethod === "GET") {
        if (!(await hasAccount(event))) return UNAUTHORIZED;
        // tokenVersion stays server-side with the hash: it is nothing a
        // viewer needs, and half of what a forged session would.
        const all = await admins.find({}, { projection: { _id: 0, passwordHash: 0, tokenVersion: 0 } }).toArray();
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
        // An array or a bare string parses fine and has no fields; read
        // as an empty request rather than as a crash on body.username.
        if (!body || typeof body !== "object") body = {};
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
        /* The permanent owner's password is theirs alone. "Only an owner can
           reset another admin's password" let any other owner set it, sign in
           as ChrisYepYep, and hold the one account the role system is built
           never to lose — the same reason DELETE below refuses to remove it. */
        if (username === PERMANENT_OWNER && requesterUsername !== PERMANENT_OWNER) {
            return json(403, { error: "Only that account can change its own password" });
        }
        if (username !== requesterUsername) {
            const requester = await admins.findOne({ username: requesterUsername });
            if (resolveRole(requester) !== "owner") {
                return json(403, { error: "Only an owner can reset another admin's password" });
            }
        }
        /* Your OWN password needs your current one. Without this, a token
           was enough on its own: whoever lifted one (a shared machine, a
           leaked localStorage) could set a password of their choosing, get
           a fresh token back in the same reply, and — because the new
           tokenVersion signs every other session out — lock the real owner
           of the account out of it, all without ever having known the
           password. Now the token lets you ASK, and the password decides.

           403, never 401: the session is perfectly good, and js/admin.js
           treats any 401 as signed out and wipes the token, which would
           punish a typo by throwing the user out of the page.

           Through the sign-in throttle, since this is a password check an
           attacker holding a token can repeat at will — the same caps and
           the same bcrypt-before-or-not bookkeeping as a login.

           An owner resetting SOMEBODY ELSE'S password does not need that
           person's; that is what an owner reset is for. */
        if (username === requesterUsername) {
            const current = text(body.currentPassword);
            const WRONG_CURRENT = json(403, { error: "Your current password is wrong." });
            if (!current) return WRONG_CURRENT;
            const attempt = await loginThrottle(db, event, username.slice(0, LOGGED_NAME_MAX));
            if (attempt.refused) return attempt.refused;
            if (attempt.slow) await pause(LOGIN_SLOW_MS);
            const self = await admins.findOne({ username });
            if (!(await passwordMatches(current, self))) {
                await attempt.settle("wrong current password");
                return WRONG_CURRENT;
            }
            await attempt.settle(null);
        }
        const passwordHash = await bcrypt.hash(password, 10);
        /* A new tokenVersion with the new password, which signs out every
           session the account had — see tokenIsCurrent in _auth.js. A reset
           is usually BECAUSE somebody else has the old password, and a reset
           that left their session running for twelve hours reset nothing. */
        const tokenVersion = newTokenVersion();
        const result = await admins.findOneAndUpdate(
            { username },
            { $set: { passwordHash, tokenVersion } },
            { returnDocument: "after", projection: { _id: 0, passwordHash: 0, tokenVersion: 0 } }
        );
        if (!result) return json(404, { error: "Admin not found" });
        /* Changing your OWN password signs out the session you did it from
           too, so the reply carries a replacement token minted under the new
           version. A page that does not pick it up simply asks its user to
           sign in again with the password they have just chosen. */
        const fresh = username === requesterUsername ? { token: signToken(username, tokenVersion) } : {};
        return json(200, { ...result, role: resolveRole(result), ...fresh });
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
}

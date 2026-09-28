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
   instead of a stored account, and on success creates the first real admin,
   with the "owner" role. Only for the PERMANENT_OWNER username, and only one
   request at a time (see the login below). This path only ever fires once
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
   third, per-username lock across every network the account has NOT signed
   in from before (see "THE USERNAME LOCK" below).

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
   botnet, which no per-host cap sees — is the username lock's job now, and
   it can afford to refuse outright because it never applies to a network
   the account has already signed in from. See below.

   bcrypt is the reason this matters twice over. A cost-10 hash is ~45ms of
   CPU that an anonymous caller can ask for as often as they like, so an
   unthrottled login is not only a guessing game left running, it is a way to
   spend the site's compute budget from outside. The check below happens
   BEFORE any hashing, so a refused attempt costs an insert, two indexed
   counts and a delete — and no bcrypt. */
const LOGIN_MAX_PER_IP = 10;
const LOGIN_MAX_PER_USER_IP = 15;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGGED_NAME_MAX = 60;

/* ---- THE USERNAME LOCK, and why it cannot lock the owner out.

   The per-host caps above cannot see a botnet: a thousand networks each
   making nine guesses at "ChrisYepYep" is nine thousand guesses and not one
   of them over a cap. The old answer was a ceiling that only SLOWED every
   answer for the name by 2.5s past a hundred failures, because a ceiling
   that refused would refuse the owner too — whoever held the lock would
   hold it against the real password as well.

   The way out is that the owner is not signing in from nowhere. Every
   account now remembers the networks (clientNet — the /64 for IPv6, the
   address for IPv4) it has signed in from successfully, most recent first,
   KNOWN_NETS_MAX of them. A request from one of those is never touched by
   the username lock at all; only the per-host caps above apply to it. So
   the lock can be a real one for everybody else:

     - every attempt from an UNKNOWN network claims a place on one
       per-username document in USER_THROTTLE, shared by every unknown
       network at once, BEFORE bcrypt — the insert-first idea again, done as
       one atomic findOneAndUpdate so a parallel burst cannot all see room;
     - past USER_LOCK_AFTER failures inside USER_WINDOW_MS the name is
       locked until `nextAllowedAt`, refused with a 429 for everyone who is
       not on a known network — the right password included, which is the
       point: the lock is only worth having if a guess that happens to be
       right is refused along with the rest;
     - each lock is twice the last (1 minute, 2, 4 … capped at an hour),
       and the doubling is forgotten after a quiet USER_LOCK_MEMORY_MS.

   A correct password takes its claim back, as it takes its activity row
   back, so a first sign-in from a new phone — no recent failures — is one
   claim in and one out and goes straight through; and that network is
   known from then on.

   A name that is not an account has no known networks, so every attempt at
   it is "unknown" and is locked exactly as a real account's would be. The
   answers are the same either way, so the lock tells nobody which names
   exist. The document is keyed by a hash of the name, never the name, for
   the reason maskedName gives. */
const USER_THROTTLE = "admin_login_throttle";
const USER_LOCK_AFTER = 20;
const USER_WINDOW_MS = 60 * 60 * 1000;
const USER_LOCK_BASE_MS = 60 * 1000;
const USER_LOCK_MAX_MS = 60 * 60 * 1000;
const USER_LOCK_MEMORY_MS = 24 * 60 * 60 * 1000;
const KNOWN_NETS_MAX = 20;

/* The address, and the unit it is COUNTED by, both from _net.js.

   Only the value Netlify computes (x-forwarded-for is client-settable, so
   honouring it would let an attacker rotate the header and walk straight
   past the cap). And counted by subscriber rather than by exact address:
   the caps below used to count the raw address, and an IPv6 caller holds a
   whole /64 of them, so ten guesses per address was ten guesses per address
   for as many addresses as they cared to use — no cap at all. Each row keeps
   the real `ip` for the activity page and gains `net`, which is what the
   counts read. */
const { clientIp, clientNet } = require("./_net");

/* What a failed sign-in against a name that is NOT an account keeps of
   that name. The typed username went into admin_activity verbatim, and the
   wrong box is exactly where people type their password — so the log kept a
   ninety-day list of passwords that were one field out. A keyed hash still
   lets the activity page group a run of attempts at the same name, and lets
   the pair count below keep counting them, without the name itself being
   readable by anyone. Real account names are kept as they are: a run of
   failures against one of those is the thing worth seeing. */
function maskedName(name) {
    const h = crypto.createHmac("sha256", process.env.SESSION_SECRET || "maze-rats-auth")
        .update(String(name)).digest("hex").slice(0, 10);
    return `unknown #${h}`;
}

/* The username lock's document id: a keyed hash of the name as typed, for
   the same reason maskedName exists — the lock is kept for names that are
   not accounts too, and those are so often a password. Longer than
   maskedName's, since here two names sharing an id would share a lock. */
function lockIdOf(name) {
    return "u:" + crypto.createHmac("sha256", process.env.SESSION_SECRET || "maze-rats-auth")
        .update("login-lock:" + String(name)).digest("hex").slice(0, 32);
}

// Whether this caller's network is one the account has signed in from.
function isKnownNet(admin, net) {
    return Boolean(net && admin && Array.isArray(admin.knownNets) && admin.knownNets.includes(net));
}

/* Puts `net` at the front of the account's known networks, trimmed to
   KNOWN_NETS_MAX. Two updates rather than one because Mongo will not $pull
   and $push the same field in a single one; a sign-in racing another can
   at worst leave the same network listed twice, which the cap then trims.
   Skipped when it is already first, which is every ordinary sign-in.
   Never allowed to fail the sign-in it follows. */
async function rememberNet(admins, admin, net) {
    if (!net || !admin) return;
    if (Array.isArray(admin.knownNets) && admin.knownNets[0] === net) return;
    try {
        await admins.updateOne({ username: admin.username }, { $pull: { knownNets: net } });
        await admins.updateOne({ username: admin.username },
            { $push: { knownNets: { $each: [net], $position: 0, $slice: KNOWN_NETS_MAX } } });
    } catch (e) {
        console.warn("auth: could not remember a sign-in network", e.message);
    }
}

/* The lock's documents sweep themselves two days after they were last
   touched — past USER_LOCK_MEMORY_MS, so a lock's doubling is never
   forgotten early. Memoised per warm instance and never allowed to fail a
   sign-in; without it the documents simply stay. */
let lockIndexing = null;
function ensureLockIndex(col) {
    if (!lockIndexing) {
        lockIndexing = col.createIndex({ touchedAt: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 })
            .catch(e => console.error("auth: TTL index on the login lock unavailable", e));
    }
    return lockIndexing;
}

const lockLength = (level) => Math.min(USER_LOCK_MAX_MS, USER_LOCK_BASE_MS * Math.pow(2, Math.min(level, 20)));

// Either driver shape: the document, or { value: document }.
const docOf = (res) => (res && res.value !== undefined ? res.value : res);

/* One claim on the username lock, for an attempt from an unknown network.
   Returns { release } when the attempt may go on (release() takes the
   claim back after a correct password), or { lockedUntil, justLocked }
   when it must be refused.

   "Not locked" is part of the claim's own filter, so a locked name matches
   nothing and the upsert then collides with the existing _id — a duplicate
   key, which is the answer "locked" arriving atomically, the same trick the
   bootstrap claim below uses. Nothing is written for a refused attempt, so
   hammering a locked name does not lengthen its lock; only the attempt that
   crosses USER_LOCK_AFTER sets one.

   The window is a fixed one, restarted by the first claim after it lapses.
   That reset is its own conditional update, so two requests arriving
   together cannot both restart it; at worst one claim lands just before a
   restart and is forgotten, which errs by one in the looser direction on a
   window of twenty. */
async function claimUserAttempt(db, name) {
    const col = db.collection(USER_THROTTLE);
    await ensureLockIndex(col);
    const _id = lockIdOf(name);
    const now = new Date();
    const open = [{ nextAllowedAt: null }, { nextAllowedAt: { $lte: now } }];
    const heldUntil = async (fallback) => {
        const held = await col.findOne({ _id }, { projection: { nextAllowedAt: 1 } });
        return (held && held.nextAllowedAt) || fallback;
    };

    await col.updateOne(
        { _id, windowStart: { $lt: new Date(now.getTime() - USER_WINDOW_MS) }, $or: open },
        { $set: { windowStart: now, fails: 0 } }
    );

    let doc;
    try {
        doc = docOf(await col.findOneAndUpdate(
            { _id, $or: open },
            { $inc: { fails: 1 }, $set: { touchedAt: now }, $setOnInsert: { windowStart: now } },
            { upsert: true, returnDocument: "after" }
        ));
    } catch (e) {
        if (!(e && e.code === 11000)) throw e;
        return { lockedUntil: await heldUntil(new Date(now.getTime() + USER_LOCK_BASE_MS)) };
    }

    const fails = (doc && doc.fails) || 1;
    if (fails <= USER_LOCK_AFTER) {
        return {
            release: () => col.updateOne({ _id }, { $inc: { fails: -1 } }).catch(() => {})
        };
    }

    /* Over. Lock it — once: the same "not locked" filter means only the
       first request of a burst to get here sets the lock and doubles the
       level, and the rest are refused under the lock it set. */
    const remembered = doc.lastLockAt && now.getTime() - new Date(doc.lastLockAt).getTime() < USER_LOCK_MEMORY_MS;
    const level = remembered ? (Number(doc.level) || 0) : 0;
    const until = new Date(now.getTime() + lockLength(level));
    const set = await col.updateOne(
        { _id, $or: open },
        { $set: { nextAllowedAt: until, level: level + 1, lastLockAt: now, fails: 0, windowStart: now, touchedAt: now } }
    );
    if (!set.modifiedCount) return { lockedUntil: await heldUntil(until) };
    return { lockedUntil: until, justLocked: true };
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

   Then the username lock (see THE USERNAME LOCK above), for a caller whose
   network the account does not know. `findAccount` is how this finds out:
   the account row, or null, looked up only once the per-host caps have let
   the attempt through, so a throttled attempt still never reaches the
   accounts. It is looked up whether or not the name is real, and the lock
   treats "no account" and "not a known network" alike, so neither the
   answer nor its timing says which names exist.

   Returns { refused } or { settle(reason), account }: `account` is what
   findAccount found, so the caller need not ask again; settle(null) is a
   success, and removes the row and hands back the lock claim; settle("…")
   records the failure, and the claim stays counted. Throws if the database
   does — the caller answers 503 rather than letting an attempt through
   unthrottled.

   The current-password check on a password change (the PUT below) goes
   through here too, filed as the same "login-failed" with its own reason.
   It is the same guessing game — a stolen session trying passwords against
   its own account — so it shares the same caps, and the activity page
   already shows it without being taught a new kind of row. */
async function loginThrottle(db, event, username, findAccount) {
    const type = "login-failed";
    const since = new Date(Date.now() - LOGIN_WINDOW_MS);
    const ip = clientIp(event);
    const net = clientNet(event);
    const activity = db.collection(ACTIVITY);

    // The same shape _audit.js's record() writes, so the activity page reads
    // it as any other failed sign-in.
    const { insertedId } = await activity.insertOne({
        at: new Date(),
        type,
        ip,
        net,
        agent: ((event.headers || {})["user-agent"] || "").slice(0, 180),
        username,
        reason: "checking"
    });

    /* `net` is null for an unidentified caller, and { net: null } matches
       exactly the rows written without one — so the pair count is
       "this username, from nowhere in particular" in that case.

       The name is matched as typed OR as maskedName leaves it, because a
       settled "no such account" row no longer holds the typed name (see
       settle below) and would otherwise drop out of its own count. */
    const names = { $in: [username, maskedName(username)] };
    const [byIp, byPair] = await Promise.all([
        net ? activity.countDocuments({ type, net, at: { $gte: since } },
            { limit: LOGIN_MAX_PER_IP + 1 }) : Promise.resolve(0),
        activity.countDocuments({ type, username: names, net, at: { $gte: since } },
            { limit: LOGIN_MAX_PER_USER_IP + 1 })
    ]);

    const refuse = (seconds) => ({
        refused: {
            statusCode: 429,
            headers: { ...SECURITY_HEADERS, "Retry-After": String(Math.max(1, Math.ceil(seconds))) },
            body: JSON.stringify({ error: "Too many sign-in attempts. Try again in a few minutes." })
        }
    });

    // Strictly more than the cap, because the count includes this attempt's
    // own row: ten earlier failures plus this one is eleven, and refused.
    if (byIp > LOGIN_MAX_PER_IP || byPair > LOGIN_MAX_PER_USER_IP) {
        await activity.deleteOne({ _id: insertedId }).catch(() => {});
        return refuse(LOGIN_WINDOW_MS / 1000);
    }

    /* The username lock, for a network the account has not signed in from.
       If the account lookup or the claim throws, the row is taken back out
       and the error goes up to the caller's 503 — an attempt is never let
       through with the lock unasked. */
    let account = null;
    let claim = null;
    try {
        account = findAccount ? await findAccount() : null;
        if (!isKnownNet(account, net)) claim = await claimUserAttempt(db, username);
    } catch (e) {
        await activity.deleteOne({ _id: insertedId }).catch(() => {});
        throw e;
    }
    if (claim && claim.lockedUntil) {
        /* The attempt that SET the lock stays in the log, filed as what it
           was, so a lock never happens without a trace on the activity page;
           every refusal under it takes its row back, as the per-host
           refusals do. Masked for a name that is not an account. */
        if (claim.justLocked) {
            await activity.updateOne({ _id: insertedId }, {
                $set: { reason: "username locked", ...(account ? {} : { username: maskedName(username) }) }
            }).catch(() => {});
        } else {
            await activity.deleteOne({ _id: insertedId }).catch(() => {});
        }
        return refuse((new Date(claim.lockedUntil).getTime() - Date.now()) / 1000);
    }

    /* Settling cannot fail the sign-in. If it does not land, the row simply
       stays as a failure marked "checking" — which still counts, so the
       throttle errs towards stricter rather than looser. */
    /* `noAccount` swaps the typed name for maskedName's hash as the failure
       is filed — see maskedName. The row carries the typed name only for
       the moment between the insert above and this. */
    return {
        account,
        settle: (reason, { noAccount = false } = {}) => Promise.all([
            (reason
                ? activity.updateOne({ _id: insertedId }, { $set: { reason, ...(noAccount ? { username: maskedName(username) } : {}) } })
                : activity.deleteOne({ _id: insertedId })).catch(() => {}),
            !reason && claim && claim.release ? claim.release() : null
        ])
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

// The bootstrap's one-at-a-time claim — see the login below. The lease is
// longer than any function may run, so a live bootstrap is never overtaken.
const BOOTSTRAP_CLAIMS = "admin_bootstrap";
const BOOTSTRAP_LEASE_MS = 60 * 1000;
const BOOTSTRAP_BUSY = () => json(409, { error: "The first account is already being set up. Try signing in again in a moment." });

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

        /* Before bcrypt runs, so a throttled attempt is the cheapest
           response this function has rather than its most expensive one.
           The account is looked up inside, after the per-host caps, to ask
           whether this network is one it knows (see THE USERNAME LOCK). */
        const attempt = await loginThrottle(db, event, tried, () => admins.findOne({ username }));
        if (attempt.refused) return attempt.refused;

        const count = await admins.countDocuments();
        if (count === 0) {
            /* BOOTSTRAP IS FOR THE PERMANENT OWNER ONLY. It used to take any
               username at all, so whoever reached an empty admins collection
               first with the shared password — after an accidental wipe, say
               — got to name the site's first owner, and it need not have
               been the person the whole role system is built around. */
            if (username !== PERMANENT_OWNER || !process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
                /* AWAITED. The row IS the counter loginThrottle reads; see
                   there. Paid only on a failure. With no accounts at all,
                   any other name is by definition not one. */
                await attempt.settle("bootstrap password", { noAccount: username !== PERMANENT_OWNER });
                return json(401, { error: "Invalid username or password" });
            }
            await attempt.settle(null);
            /* AND IT HAPPENS ONCE. Two bootstraps fired together both saw
               zero admins above, and both went on to insert — with the
               unique index as the only thing between them and two owners
               (or, had the index failed to build, nothing at all). Now each
               must first win a claim on one sentinel document, whose `_id` is
               unique in every collection whatever else fails to build: an
               upsert that only matches a claim older than the lease, so
               exactly one request of a burst updates or inserts it, and
               every other gets a match on nothing and a duplicate key.
               A lease rather than a permanent marker so that this stays
               the recovery route it has always been, should every account
               ever be deleted again. The winner counts again after winning,
               so a bootstrap that finished just before is not repeated. */
            try {
                await db.collection(BOOTSTRAP_CLAIMS).updateOne(
                    { _id: "bootstrap", at: { $lt: new Date(Date.now() - BOOTSTRAP_LEASE_MS) } },
                    { $set: { at: new Date() } },
                    { upsert: true }
                );
            } catch (e) {
                if (e && e.code === 11000) return BOOTSTRAP_BUSY();
                throw e;
            }
            if (await admins.countDocuments() !== 0) return BOOTSTRAP_BUSY();
            await ensureUsernameIndex(admins);
            const passwordHash = await bcrypt.hash(password, 10);
            // The network it was set up from is its first known one.
            const firstNet = clientNet(event);
            const newAdmin = { username, passwordHash, role: "owner", tokenVersion: newTokenVersion(), knownNets: firstNet ? [firstNet] : [], createdAt: new Date().toISOString() };
            try {
                await admins.insertOne(newAdmin);
            } catch (e) {
                if (e && e.code === 11000) return TAKEN();
                throw e;
            }
            await record(event, "login", { username, role: "owner", note: "first account, bootstrapped" });
            return json(200, { token: signToken(username, newAdmin.tokenVersion), username, role: resolveRole(newAdmin) });
        }

        // Found by the throttle already; the same row, not a second read.
        const admin = attempt.account;
        // Runs a hash either way — see DUMMY_HASH above for why.
        if (!(await passwordMatches(password, admin))) {
            /* Logged with the username that was TRIED, which is the point:
               a run of failures against a real account is the thing worth
               noticing. The password itself is never recorded — and a name
               that is not an account is filed as a hash (see maskedName),
               since that is so often a password typed one box early.

               Awaited: this row is what the next attempt is counted
               against, and the reason is what the activity page shows. */
            await attempt.settle(admin ? "wrong password" : "no such account", { noAccount: !admin });
            return json(401, { error: "Invalid username or password" });
        }
        // A correct password never counts towards anybody's cap.
        await attempt.settle(null);
        // And from now on this network is one the account knows.
        await rememberNet(admins, admin, clientNet(event));
        const token = signToken(username, admin.tokenVersion);
        // Awaited, briefly — see record() in _audit.js.
        await record(event, "login", { username, role: resolveRole(admin), session: sessionOf({ headers: { "x-admin-token": token } }) });
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
        await record(event, "session", { username, session: sessionOf(event) });
        return json(200, { username, role: resolveRole(admin) });
    }

    if (body.action === "create") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        // refuseWrite: a deleted or signed-out account is a 401, not
        // "view-only" — see there in _auth.js.
        if (!(await canWrite(event))) return await refuseWrite(event);
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
        // "null" parses too, and body.action then threw — answered as an
        // outage below when it is only a malformed request.
        if (!body || typeof body !== "object") body = {};

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
        /* Only the tagged lookup failure is "the database is unavailable".
           Every exception used to be answered that way, so a plain bug read
           as an outage to retry, forever, and hid itself doing it. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return json(500, { error: "Something went wrong with that request." });
    }
};

async function handleRest(event, db, admins) {
    if (event.httpMethod === "GET") {
        if (!(await hasAccount(event))) return UNAUTHORIZED;
        // tokenVersion stays server-side with the hash: it is nothing a
        // viewer needs, and half of what a forged session would. knownNets
        // too — it is where each admin signs in from, which is nobody
        // else's business, and the list of networks the lock never touches.
        const all = await admins.find({}, { projection: { _id: 0, passwordHash: 0, tokenVersion: 0, knownNets: 0 } }).toArray();
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
        const isSelf = username === requesterUsername;
        let requester = null;
        if (!isSelf) {
            requester = await admins.findOne({ username: requesterUsername });
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
        if (isSelf) {
            const current = text(body.currentPassword);
            const WRONG_CURRENT = json(403, { error: "Your current password is wrong." });
            if (!current) return WRONG_CURRENT;
            const attempt = await loginThrottle(db, event, username.slice(0, LOGGED_NAME_MAX), () => admins.findOne({ username }));
            if (attempt.refused) return attempt.refused;
            if (!(await passwordMatches(current, attempt.account))) {
                await attempt.settle("wrong current password");
                return WRONG_CURRENT;
            }
            await attempt.settle(null);
        } else {
            /* ...but it does need the OWNER'S. A lifted owner token was
               otherwise enough to set any other account's password to one
               of the thief's choosing and sign in as it — a second account
               to come back through after the first session is shut. So the
               owner re-enters their own password, checked against THEIR row
               (the requester's, never the target's), through the same
               throttle and filed against their name, exactly as the
               self-service check above is.

               `requesterPassword` is the field; `currentPassword` is taken in
               its place when it is absent, because both mean the same thing
               — the caller's own password — and js/api.js's
               resetAdminPassword already sends its fourth argument under that
               name. One argument, one meaning, whoever the target is.

               403 for missing and wrong alike, never 401, for the reason
               given above: the session is fine, and a 401 signs it out. */
            const own = text(body.requesterPassword) || text(body.currentPassword);
            const NEED_OWN = json(403, { error: "Your own password is needed to reset someone else's." });
            if (!own) return NEED_OWN;
            const attempt = await loginThrottle(db, event, requesterUsername.slice(0, LOGGED_NAME_MAX), async () => requester);
            if (attempt.refused) return attempt.refused;
            if (!(await passwordMatches(own, attempt.account))) {
                await attempt.settle("wrong own password (resetting another account)");
                return NEED_OWN;
            }
            await attempt.settle(null);
        }
        const passwordHash = await bcrypt.hash(password, 10);
        /* A new tokenVersion with the new password, which signs out every
           session the account had — see tokenIsCurrent in _auth.js. A reset
           is usually BECAUSE somebody else has the old password, and a reset
           that left their session running for twelve hours reset nothing.

           For the same reason an owner's reset of another account forgets
           that account's known networks: if somebody else had the password,
           the networks they signed in from are "known" too, and would be
           spared the username lock while they guessed the new one. Changing
           your OWN password keeps them — it is the owner being locked out
           that the list exists to prevent, and nothing about a change made
           by the account's own holder says those networks are not theirs. */
        const tokenVersion = newTokenVersion();
        const result = await admins.findOneAndUpdate(
            { username },
            { $set: { passwordHash, tokenVersion, ...(isSelf ? {} : { knownNets: [] }) } },
            { returnDocument: "after", projection: { _id: 0, passwordHash: 0, tokenVersion: 0, knownNets: 0 } }
        );
        if (!result) return json(404, { error: "Admin not found" });
        /* Changing your OWN password signs out the session you did it from
           too, so the reply carries a replacement token minted under the new
           version. A page that does not pick it up simply asks its user to
           sign in again with the password they have just chosen. */
        const fresh = isSelf ? { token: signToken(username, tokenVersion) } : {};
        return json(200, { ...result, role: resolveRole(result), ...fresh });
    }

    if (event.httpMethod === "DELETE") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await canWrite(event))) return await refuseWrite(event);
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

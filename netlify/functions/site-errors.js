/* /.netlify/functions/site-errors — the errors visitors hit, in and out
   (28 Sept 2026).

   POST   public. js/error-report.js sends a batch of what went wrong in the
          visitor's browser: { session, reports: [...], ignored: n }. Always
          answered 202 { ok: true } — stored, dropped by a cap, or thrown away
          as malformed, the answer is the same, because a beacon has nobody to
          read an error and a stranger has no business learning which of those
          happened. Validated hard: a size limit before anything is parsed, and
          every field typed and cut by cleanReport in _errors.js.

   GET    any signed-in admin role, as every other admin read.
            ?status=open|resolved|ignored|all   (default open)
            ?kind=error|rejection|resource|fetch|console|handled|function
            ?q=<text>          message or source contains it, any case
            ?sort=last|count|first|visitors     (default last; "first" is the
                               most recently FIRST-seen, i.e. the newest bugs)
            ?limit=<n>         default 100, at most 500
          → { groups: [...], totals: { open, resolved, ignored, last24h,
              last7d }, dropped: { last24h }, ignored: { last24h }, now }
          No samples in the list; they are what makes a group heavy.
          `last24h` and `last7d` are OCCURRENCES (not groups) outside the
          ignored ones: the last 24 hourly buckets, and the last 7 UTC days.
          A group's `status` is its triage state; the HTTP status of a
          function or fetch failure is `statusCode`. `days` and `hours` are
          UTC buckets, "YYYY-MM-DD" and "YYYY-MM-DDTHH".
          ?id=<fingerprint>  → { group: {...everything, every breakdown map
                               (browsers, os, devices, pages, countries,
                               builds, themes) and samples newest first} }
                               or 404. The hashed visit ids are never sent.

   PUT    an owner or an admin (the "site" write scope).
            { id, status?, note? }   → { group }   (note: 1000 characters)
            { ids: [...], status }   → { ok, updated }
          Sets statusBy/statusAt and noteBy/noteAt to the admin and the time.
          Audit-logged.

   DELETE the owner alone. ?id=<fingerprint>, or ?status=resolved to clear
          every resolved group → { deleted: n }. Audit-logged.

   This function is NOT wrapped in withErrorReporting, unlike every other one
   in this folder: a failure here reported to itself is a loop, and on a bad
   day a loop that writes to the database. Its own failures go to the
   function log, which is where Netlify already puts them. */
const { getDb } = require("./_db");
const {
    isAuthorized, hasAccount, roleOf, usernameFromToken, sessionOf, WRITE_SCOPES,
    UNAUTHORIZED, forbidden, refuseWrite, AUTH_UNAVAILABLE, isAuthUnavailable
} = require("./_auth");
const { record } = require("./_audit");
const { SECURITY_HEADERS } = require("./_headers");
const E = require("./_errors");
const { refusedSince } = require("./_ratelimit");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data),
});

// The one answer a browser ever gets.
const ACCEPTED = () => json(202, { ok: true });
const UNAVAILABLE = () => json(503, { error: "The database is unavailable just now. Please try again in a moment." });

/* About 32KB. The browser packs its batches to stay under 30,000 bytes (see
   packBatches in js/error-report.js); a report is a few kilobytes at most,
   stack and breadcrumbs included, so anything bigger is not from the page. */
const MAX_BODY = 32 * 1024;
/* More than the page sends (ten distinct reports a page, plus the repeat
   counts that go out when it closes), and fewer than would let one POST
   spend a caller's whole minute. */
const MAX_REPORTS = 20;
// The most one batch may add to the "ignored" tally (see receive).
const IGNORED_MAX = 50;
// How many recently seen groups the totals are added up from (see read).
const RECENT_MAX = 2000;
const NOTE_MAX = 1000;
const ID_SHAPE = /^[0-9a-f]{20}$/;
const SORTS = {
    last: { lastSeen: -1 },
    count: { count: -1, lastSeen: -1 },
    first: { firstSeen: -1 },
    visitors: { visitors: -1, lastSeen: -1 },
};

exports.handler = async (event, context) => {
    const method = event.httpMethod;
    if (method === "POST") return receive(event, context);
    if (!["GET", "PUT", "DELETE"].includes(method)) return json(405, { error: "Method not allowed" });
    if (!isAuthorized(event)) return UNAUTHORIZED;
    try {
        if (method === "GET") return await read(event);
        if (method === "PUT") return await update(event);
        return await remove(event);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("site-errors: request failed", e);
        // Only a database fault is an outage; anything else is a bug.
        if (e && /^Mongo/.test(e.name || "")) return UNAVAILABLE();
        return json(500, { error: "Something went wrong with that request." });
    }
};

/* ------------------------------------------------------------ RECEIVING */

async function receive(event, context) {
    /* Local dev talks to the PRODUCTION database (see _db.js), and a page
       being worked on throws on purpose all day. Dropped there unless
       ERRORS_IN_DEV=1 asks for them — which is for testing this, and writes
       to production when it does. */
    if (process.env.NETLIFY_DEV === "true" && process.env.ERRORS_IN_DEV !== "1") return ACCEPTED();

    // Measured before parsing, so an oversized body costs nothing to refuse.
    const raw = event.body || "";
    const size = event.isBase64Encoded ? Math.floor(raw.length * 3 / 4) : Buffer.byteLength(raw);
    if (!raw || size > MAX_BODY) return ACCEPTED();

    let body;
    try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw);
    } catch (e) {
        return ACCEPTED();
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return ACCEPTED();

    const reports = Array.isArray(body.reports)
        ? body.reports.slice(0, MAX_REPORTS).map(r => E.cleanReport(r, { fromClient: true })).filter(Boolean)
        : [];
    /* THE IGNORED COUNT, BOUNDED AND CAPPED (29 Sept 2026). A batch holding
       nothing but `ignored` used to go straight to countMeta, past every cap,
       at up to a thousand a POST — so five hundred POSTs from one address
       said half a million errors had been filtered out, and the tab's
       "ignored" figure was whatever a stranger wanted it to be. It is now
       clamped to IGNORED_MAX a batch (the page filters a handful at a time;
       an extension that throws in a loop is still visibly "a lot"), and the
       batch spends one unit of its network's per-minute allowance — or one
       per report, when it carries reports too — BEFORE anything is counted,
       so a network over its cap has its ignored count dropped with the rest. */
    const ignored = typeof body.ignored === "number" && body.ignored > 0 ? Math.min(IGNORED_MAX, Math.floor(body.ignored)) : 0;
    if (!reports.length && !ignored) return ACCEPTED();

    try {
        const db = await getDb();
        E.ensureIndexes(db);
        // Per network first, so a sender over its own cap does not also
        // spend the allowance everybody else shares (track.js's order).
        if (await E.overNetCap(db, event, Math.max(1, reports.length))) {
            await E.countMeta(db, "dropped", reports.length);
            return ACCEPTED();
        }
        if (reports.length) {
            if (await E.overGlobalCap(db, reports.length)) {
                await E.countMeta(db, "dropped", reports.length);
                return ACCEPTED();
            }
            await E.recordReports(db, reports, {
                ua: (event.headers || {})["user-agent"],
                session: typeof body.session === "string" ? body.session : null,
                country: E.countryOf(event, context),
                // The network, for the new-group budget (_errors.js).
                net: E.limiterKey(event),
            });
        }
        await E.countMeta(db, "ignored", ignored);
    } catch (e) {
        // Logged for the function log, never told to the caller.
        console.error("site-errors: could not record a batch", e && e.message);
    }
    return ACCEPTED();
}

/* ------------------------------------------------------------ READING */

// A breakdown map as the tab wants it: real dots back, biggest first.
function mapOut(m) {
    const out = {};
    for (const [k, n] of Object.entries(m || {})) out[E.readKey(k)] = n;
    return out;
}
function top(m, n = 3) {
    return Object.entries(m || {}).map(([k, v]) => [E.readKey(k), v]).sort((a, b) => b[1] - a[1]).slice(0, n);
}

// The histograms trimmed to their windows, whatever tidy has or has not got to.
function windowed(m, oldest) {
    const out = {};
    for (const [k, n] of Object.entries(m || {})) if (k >= oldest) out[k] = n;
    return out;
}

function summary(doc, now) {
    const oldestDay = E.dayKey(new Date(now - (E.DAYS_KEPT - 1) * 86400000));
    const oldestHour = E.hourKey(new Date(now - (E.HOURS_KEPT - 1) * 3600000));
    return {
        id: doc._id,
        kind: doc.kind,
        message: doc.message,
        source: doc.source || "",
        line: doc.line || 0,
        col: doc.col || 0,
        fn: doc.fn || null,
        status: doc.status || "open",
        // The HTTP status of a function or fetch failure; `status` above is triage.
        statusCode: typeof doc.statusCode === "number" ? doc.statusCode : null,
        statusBy: doc.statusBy || null,
        statusAt: doc.statusAt || null,
        note: doc.note || "",
        noteBy: doc.noteBy || null,
        noteAt: doc.noteAt || null,
        firstSeen: doc.firstSeen || null,
        lastSeen: doc.lastSeen || null,
        count: doc.count || 0,
        visitors: doc.visitors || 0,
        visitorsApprox: Boolean(doc.visitorsApprox),
        regressed: Boolean(doc.regressed),
        regressedAt: doc.regressedAt || null,
        resolvedAt: doc.resolvedAt || null,
        days: windowed(doc.days, oldestDay),
        hours: windowed(doc.hours, oldestHour),
        top: {
            browsers: top(doc.browsers),
            os: top(doc.os),
            devices: top(doc.devices),
            pages: top(doc.pages),
        },
    };
}

function full(doc, now) {
    const out = summary(doc, now);
    for (const map of E.BREAKDOWNS) out[map] = mapOut(doc[map]);
    out.samples = Array.isArray(doc.samples) ? doc.samples.slice().reverse() : [];
    return out;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function read(event) {
    // hasAccount rather than isAuthorized alone: a deleted account's leftover
    // token should not keep reading. Throws when the accounts cannot be read.
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    const q = event.queryStringParameters || {};
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("site-errors: database connection failed", e);
        return UNAVAILABLE();
    }
    const col = db.collection(E.COLLECTION);
    const now = Date.now();
    // The lastSeen index the totals' read leans on; memoised, never awaited.
    E.ensureIndexes(db);

    if (q.id !== undefined) {
        if (typeof q.id !== "string" || !ID_SHAPE.test(q.id)) return json(400, { error: "That is not an error id." });
        const doc = await col.findOne({ _id: q.id }, { projection: { sessions: 0 } });
        if (!doc) return json(404, { error: "No such error. It may have been cleared, or aged out." });
        return json(200, { group: full(doc, now) });
    }

    const status = ["open", "resolved", "ignored", "all"].includes(q.status) ? q.status : "open";
    const filter = status === "all" ? {} : { status };
    if (q.kind && E.KINDS.includes(q.kind)) filter.kind = q.kind;
    const text = typeof q.q === "string" ? q.q.trim().slice(0, 100) : "";
    if (text) {
        const re = { $regex: escapeRegex(text), $options: "i" };
        filter.$or = [{ message: re }, { source: re }];
    }
    const sort = Object.prototype.hasOwnProperty.call(SORTS, q.sort) ? SORTS[q.sort] : SORTS.last;
    const limit = Math.min(500, Math.max(1, parseInt(q.limit, 10) || 100));

    const since24h = new Date(now - 24 * 3600000);
    const since7d = new Date(now - 7 * 86400000);
    const [rows, open, resolved, ignored, recent, dropped, ignoredByBrowser, limited] = await Promise.all([
        col.find(filter, { projection: { samples: 0, sessions: 0 } }).sort(sort).limit(limit).toArray(),
        col.countDocuments({ status: "open" }),
        col.countDocuments({ status: "resolved" }),
        col.countDocuments({ status: "ignored" }),
        /* BOUNDED (29 Sept 2026). This read every group seen in the last
           week, whole histograms and all, with no limit — on the day a flood
           had made tens of thousands of groups, the tab would have pulled
           them all into one function to add them up, and timed out exactly
           when it was needed. Now: only the two histograms (no samples, no
           maps, not even the message), the most recently seen RECENT_MAX
           groups, newest first, which the lastSeen TTL index serves (read
           backwards; ensureIndexes below makes sure it exists). Past that
           many groups in a week the two totals are a floor rather than
           exact — and the dropped count beside them will already be saying
           why. */
        col.find({ status: { $ne: "ignored" }, lastSeen: { $gte: since7d } }, { projection: { _id: 0, days: 1, hours: 1 } })
            .sort({ lastSeen: -1 }).limit(RECENT_MAX).toArray(),
        E.metaSince(db, "dropped", since24h),
        E.metaSince(db, "ignored", since24h),
        // What the site-wide rate limit turned away (_ratelimit.js, 4 Oct 2026).
        refusedSince(db, since24h).catch(() => ({ last24h: 0, byFn: {} })),
    ]);

    /* OCCURRENCES, not groups: how many times anything (not ignored) went
       wrong in the last 24 hours — the 24 hourly buckets up to and including
       this one — and in the last seven UTC days, today included. */
    const firstHour = E.hourKey(new Date(now - 23 * 3600000));
    const firstDay = E.dayKey(new Date(now - 6 * 86400000));
    let last24h = 0, last7d = 0;
    for (const r of recent) {
        for (const [k, n] of Object.entries(r.hours || {})) if (k >= firstHour) last24h += n;
        for (const [k, n] of Object.entries(r.days || {})) if (k >= firstDay) last7d += n;
    }

    return json(200, {
        groups: rows.map(d => summary(d, now)),
        totals: { open, resolved, ignored, last24h, last7d },
        dropped: { last24h: dropped },
        ignored: { last24h: ignoredByBrowser },
        limited,
        now: new Date(now).toISOString(),
    });
}

/* ------------------------------------------------------------ CHANGING

   The canWrite rule, made by hand as player-forget.js makes it: canWrite
   records the attempt with its target taken from the query string, and this
   one's target is in the body — so the role is checked here and the one audit
   record written below names which groups were changed and to what. */
async function writeRole(event) {
    const role = await roleOf(event);
    if (role === null) return { refusal: UNAUTHORIZED };
    return { role };
}

function audit(event, method, target) {
    return record(event, "write", {
        username: usernameFromToken(event),
        session: sessionOf(event),
        method,
        endpoint: "site-errors",
        target: String(target).slice(0, 200),
    });
}

async function update(event) {
    const { role, refusal } = await writeRole(event);
    if (refusal) return refusal;
    if (!(WRITE_SCOPES[role] || []).includes("site")) return refuseWrite(event);

    let body;
    try {
        body = JSON.parse(event.body || "");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });

    const bulk = Array.isArray(body.ids);
    const ids = bulk ? body.ids : [body.id];
    if (!ids.length || ids.length > 500 || !ids.every(id => typeof id === "string" && ID_SHAPE.test(id))) {
        return json(400, { error: "Which errors? Send an id, or ids." });
    }
    if (body.status !== undefined && !E.STATUSES.includes(body.status)) {
        return json(400, { error: "Status must be open, resolved or ignored." });
    }
    if (body.note !== undefined && typeof body.note !== "string") return json(400, { error: "A note is text." });
    if (typeof body.note === "string" && body.note.length > NOTE_MAX) {
        return json(400, { error: `A note is ${NOTE_MAX} characters at most.` });
    }
    if (bulk && body.status === undefined) return json(400, { error: "A change to several errors needs a status." });
    if (body.status === undefined && body.note === undefined) return json(400, { error: "Nothing to change." });

    const now = new Date();
    const who = usernameFromToken(event);
    const set = {};
    const unset = {};
    if (body.status !== undefined) {
        set.status = body.status;
        set.statusAt = now;
        set.statusBy = who;
        // Set by hand is looked at: the regression flag has done its job.
        set.regressed = false;
        if (body.status === "resolved") set.resolvedAt = now;
        else unset.resolvedAt = "";
    }
    if (body.note !== undefined && !bulk) {
        set.note = body.note.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
        set.noteAt = now;
        set.noteBy = who;
    }
    const change = { $set: set };
    if (Object.keys(unset).length) change.$unset = unset;

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("site-errors: database connection failed", e);
        return UNAVAILABLE();
    }
    const col = db.collection(E.COLLECTION);
    await audit(event, "PUT", `${bulk ? ids.length + " errors" : ids[0]}${body.status ? " -> " + body.status : ""}${body.note !== undefined ? " (note)" : ""}`);

    if (bulk) {
        const res = await col.updateMany({ _id: { $in: ids } }, change);
        return json(200, { ok: true, updated: (res && (res.matchedCount ?? res.modifiedCount)) || 0 });
    }
    const res = await col.findOneAndUpdate({ _id: ids[0] }, change, { returnDocument: "after", projection: { sessions: 0 } });
    const doc = res && res.value !== undefined ? res.value : res;
    if (!doc) return json(404, { error: "No such error. It may have been cleared, or aged out." });
    return json(200, { group: full(doc, Date.now()) });
}

async function remove(event) {
    const { role, refusal } = await writeRole(event);
    if (refusal) return refusal;
    if (role !== "owner") return forbidden("Only an owner can delete error reports.");

    const q = event.queryStringParameters || {};
    let filter, target;
    if (typeof q.id === "string" && q.id) {
        if (!ID_SHAPE.test(q.id)) return json(400, { error: "That is not an error id." });
        filter = { _id: q.id };
        target = q.id;
    } else if (q.status === "resolved") {
        filter = { status: "resolved" };
        target = "every resolved error";
    } else {
        return json(400, { error: "Delete which? Send ?id=, or ?status=resolved." });
    }

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("site-errors: database connection failed", e);
        return UNAVAILABLE();
    }
    await audit(event, "DELETE", target);
    const res = await db.collection(E.COLLECTION).deleteMany(filter);
    const deleted = (res && res.deletedCount) || 0;
    if (filter._id && !deleted) return json(404, { error: "No such error. It may have been cleared, or aged out." });
    return json(200, { deleted });
}

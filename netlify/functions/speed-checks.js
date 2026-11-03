/* /.netlify/functions/speed-checks: how fast the live site loads on a
   phone, for the Warren's Speed card (js/admin-speed.js).  (2 Nov 2026, the
   owner's: a weekly measure of the live site on a typical phone, with a
   trend.)

   WHO MEASURES. Netlify cannot run a browser, so Google does: its
   PageSpeed Insights API (runPagespeed, strategy=mobile) loads the page in
   Lighthouse on an emulated mid-range phone over a throttled 4G line and
   answers with the timings. No key is needed at this volume (two pages a
   week and the odd button press); a PSI_API_KEY in the environment is sent
   if there is one, which only raises Google's allowance.

   WHEN. speed-measure.js, a scheduled function (netlify.toml), does every
   measuring. It wakes every five minutes and nearly always finds nothing to
   do: a page is due once a week, from Monday 06:00 UTC (SLOT below), and
   the Warren's Measure now button leaves a request here that the next wake
   picks up. Why not measure on the button's own request: a PageSpeed run
   takes Google ten to twenty-five seconds and a function answering a page
   is cut off at ten, while a scheduled one is allowed thirty. So the
   button asks, and the card watches for the answer.

   THIS FUNCTION. GET: the runs of the last twelve weeks and any request
   standing, for any signed-in Warren account (viewers too: it is a read).
   POST { action: "measure" }: an admin's request for a run now. Nothing
   reaches Google from here.

   THE RECORDS, in speed_runs:
     { type: "run", page, url, at, source: "weekly" | "asked", ok: true,
       score, lcp, fcp, tbt, cls, si, bytes, requests, lighthouse,
       field? }                                       (a measurement)
     { type: "run", page, url, at, source, ok: false, error }  (a failure)
     { _id: "request", type: "request", at, by, claimedAt, tries }
   Times in milliseconds, cls as Lighthouse gives it, bytes as transferred,
   score 0 to 100. `field` is Chrome's own figures from real visitors
   (CrUX) when Google has enough of them for the site, which a small site
   may never have. Runs are kept 400 days, failures 30. */
const { getDb, ensureIndex } = require("./_db");
const {
    isAuthorized, roleOf, canWrite, refuseWrite, usernameFromToken,
    UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable, forbidden
} = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");

const COLLECTION = "speed_runs";
const PAGES = [
    { id: "landing", name: "Landing page", url: "https://mazerats.net/" },
    { id: "home", name: "Home", url: "https://mazerats.net/home" }
];
const PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

// The weekly slot: Mondays from 06:00 UTC, before anyone in the UK is up.
const SLOT_DAY = 1;
const SLOT_HOUR = 6;
// A failed weekly run is tried again an hour later, at most six times a week.
const RETRY_MS = 60 * 60 * 1000;
const MAX_TRIES = 6;
// Inside the scheduled function's thirty seconds, with room to save.
const PSI_BUDGET_MS = 25000;
// A claimed request older than this was cut off mid-run; it may be claimed again, once.
const CLAIM_STALE_MS = 2 * 60 * 1000;
const MAX_CLAIMS = 2;
// Measure now, at most once in three minutes: Google's allowance is shared by every run.
const ASK_GAP_MS = 3 * 60 * 1000;
const SHOW_DAYS = 84;
const KEEP_DAYS = 400;
const FAIL_KEEP_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// The start of the weekly slot `now` falls in: the last Monday 06:00 UTC at or before it.
function slotStart(now) {
    const d = new Date(now);
    d.setUTCHours(SLOT_HOUR, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - SLOT_DAY + 7) % 7));
    if (d.getTime() > now) d.setUTCDate(d.getUTCDate() - 7);
    return d.getTime();
}

const round = (v, places) => {
    if (typeof v !== "number" || !isFinite(v)) return null;
    const k = Math.pow(10, places || 0);
    return Math.round(v * k) / k;
};

/* The numbers out of one PageSpeed answer. Throws, with words for the card,
   when the answer is not a measurement: Google's own error, or Lighthouse
   failing to load the page (runtimeError). */
function readPsi(j) {
    if (!j || typeof j !== "object") throw new Error("Google sent back something that wasn't a result.");
    if (j.error) throw new Error("Google couldn't measure it: " + String(j.error.message || j.error.status || "an error").slice(0, 160));
    const lh = j.lighthouseResult;
    if (!lh || typeof lh !== "object") throw new Error("Google sent back no measurement.");
    if (lh.runtimeError && lh.runtimeError.code && lh.runtimeError.code !== "NO_ERROR") {
        throw new Error("Google couldn't load the page: " + String(lh.runtimeError.message || lh.runtimeError.code).slice(0, 160));
    }
    const a = lh.audits || {};
    const num = k => (a[k] && typeof a[k].numericValue === "number" && isFinite(a[k].numericValue)) ? a[k].numericValue : null;
    const perf = lh.categories && lh.categories.performance && lh.categories.performance.score;
    const items = a["network-requests"] && a["network-requests"].details && a["network-requests"].details.items;
    const out = {
        score: typeof perf === "number" ? Math.round(perf * 100) : null,
        lcp: round(num("largest-contentful-paint")),
        fcp: round(num("first-contentful-paint")),
        tbt: round(num("total-blocking-time")),
        cls: round(num("cumulative-layout-shift"), 3),
        si: round(num("speed-index")),
        bytes: round(num("total-byte-weight")),
        requests: Array.isArray(items) ? items.length : null,
        lighthouse: typeof lh.lighthouseVersion === "string" ? lh.lighthouseVersion.slice(0, 20) : null
    };
    if (out.lcp === null && out.fcp === null && out.score === null) throw new Error("Google's answer had no timings in it.");
    // Real visitors' figures (CrUX), the page's own or else the whole site's, when Google has them.
    const field = (j.loadingExperience && j.loadingExperience.metrics) || (j.originLoadingExperience && j.originLoadingExperience.metrics);
    if (field) {
        const p = k => field[k] && typeof field[k].percentile === "number" ? field[k].percentile : null;
        const f = { lcp: p("LARGEST_CONTENTFUL_PAINT_MS"), inp: p("INTERACTION_TO_NEXT_PAINT"), cls: p("CUMULATIVE_LAYOUT_SHIFT_SCORE") };
        if (f.cls !== null) f.cls = round(f.cls / 100, 3);    // CrUX gives layout shift times 100
        if (f.lcp !== null || f.inp !== null || f.cls !== null) out.field = f;
    }
    return out;
}

// One page measured: a run row, ok or not. Never throws.
async function measurePage(page, now, source) {
    const row = { type: "run", page: page.id, url: page.url, at: new Date(now), source };
    const q = new URLSearchParams({ url: page.url, strategy: "mobile", category: "performance" });
    if (process.env.PSI_API_KEY) q.set("key", process.env.PSI_API_KEY);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PSI_BUDGET_MS);
    try {
        const res = await fetch(PSI + "?" + q.toString(), { signal: ctl.signal, headers: { Accept: "application/json" } });
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        if (res.status === 429) throw new Error("Google's free allowance for today was used up.");
        if (!res.ok && !(body && body.error)) throw new Error("Google answered " + res.status + ".");
        return Object.assign(row, { ok: true }, readPsi(body));
    } catch (e) {
        const error = e && e.name === "AbortError" ? "Google took longer than " + Math.round(PSI_BUDGET_MS / 1000) + " seconds to answer."
            : String((e && e.message) || "It couldn't be measured.").slice(0, 200);
        return Object.assign(row, { ok: false, error });
    } finally {
        clearTimeout(timer);
    }
}

/* The standing request, claimed by this wake: claimed once (or again when a
   claim has gone stale), so two wakes never both run it. Returns the claimed
   request, or null. A request claimed MAX_CLAIMS times already is dropped. */
async function claimRequest(col, now) {
    const req = await col.findOneAndUpdate(
        { _id: "request", $or: [{ claimedAt: null }, { claimedAt: { $lt: new Date(now - CLAIM_STALE_MS) } }] },
        { $set: { claimedAt: new Date(now) }, $inc: { tries: 1 } },
        { returnDocument: "after" }
    );
    // Driver 6 answers with the document; older ones wrapped it in { value }.
    const doc = req && req.value !== undefined && req.ok !== undefined ? req.value : req;
    if (!doc) return null;
    if ((doc.tries || 0) > MAX_CLAIMS) {
        await col.deleteOne({ _id: "request" });
        return null;
    }
    return doc;
}

/* Whether a page's weekly run is due: nothing measured since this week's
   slot began, and the failures since then neither too recent nor too many. */
async function weeklyDue(col, page, now) {
    const slot = slotStart(now);
    const since = await col.find({ type: "run", page: page.id, at: { $gte: new Date(slot) } })
        .sort({ at: -1 }).limit(MAX_TRIES + 1).toArray();
    if (since.some(r => r.ok)) return false;
    if (since.length >= MAX_TRIES) return false;
    if (since.length && now - new Date(since[0].at).getTime() < RETRY_MS) return false;
    return true;
}

/* What the scheduled function does on every wake (speed-measure.js): a
   standing request measures both pages; otherwise each page whose week is
   due. Both pages at once, so a wake fits in the scheduled thirty seconds.
   Returns what it did, for the function log. */
async function runDue(db, now) {
    const col = db.collection(COLLECTION);
    await ensureIndex(col, { type: 1, page: 1, at: -1 });
    const asked = await claimRequest(col, now);
    const due = [];
    for (const page of PAGES) if (asked || await weeklyDue(col, page, now)) due.push(page);
    if (!due.length) return { measured: [] };
    const rows = await Promise.all(due.map(p => measurePage(p, now, asked ? "asked" : "weekly")));
    if (asked) rows.forEach(r => { if (asked.by) r.by = String(asked.by).slice(0, 60); });
    await col.insertMany(rows);
    if (asked) await col.deleteOne({ _id: "request", claimedAt: asked.claimedAt });
    await col.deleteMany({ type: "run", at: { $lt: new Date(now - KEEP_DAYS * DAY) } });
    await col.deleteMany({ type: "run", ok: false, at: { $lt: new Date(now - FAIL_KEEP_DAYS * DAY) } });
    return { measured: rows.map(r => r.page + (r.ok ? " ok" : " failed: " + r.error)) };
}

// A run as the card reads it.
function shown(r) {
    const out = { at: new Date(r.at).toISOString(), ok: !!r.ok, source: r.source || "weekly" };
    if (r.ok) {
        for (const k of ["score", "lcp", "fcp", "tbt", "cls", "si", "bytes", "requests"]) out[k] = typeof r[k] === "number" ? r[k] : null;
        if (r.field && typeof r.field === "object") out.field = r.field;
    } else {
        out.error = String(r.error || "It couldn't be measured.");
    }
    return out;
}

async function read(col, now) {
    const [rows, req] = await Promise.all([
        col.find({ type: "run", at: { $gte: new Date(now - SHOW_DAYS * DAY) } }, { projection: { _id: 0 } })
            .sort({ at: -1 }).limit(400).toArray(),
        col.findOne({ _id: "request" })
    ]);
    return {
        pages: PAGES.map(p => ({ id: p.id, name: p.name, url: p.url, runs: rows.filter(r => r.page === p.id).slice(0, 60).map(shown) })),
        request: req ? { at: new Date(req.at).toISOString(), by: req.by || "", measuring: !!req.claimedAt } : null,
        nextWeekly: new Date(slotStart(now) + 7 * DAY).toISOString(),
        now: new Date(now).toISOString()
    };
}

async function ask(event, col, now) {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    if (!body || body.action !== "measure") return json(400, { error: "Unknown action" });
    const standing = await col.findOne({ _id: "request" });
    if (standing) return json(200, await read(col, now));
    const last = await col.find({ type: "run", source: "asked" }).sort({ at: -1 }).limit(1).toArray();
    const since = last.length ? now - new Date(last[0].at).getTime() : Infinity;
    if (since < ASK_GAP_MS) {
        const wait = Math.ceil((ASK_GAP_MS - since) / 60000);
        return json(429, { error: `It was measured a moment ago. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` });
    }
    try {
        await col.insertOne({ _id: "request", type: "request", at: new Date(now), by: usernameFromToken(event) || "", claimedAt: null, tries: 0 });
    } catch (e) {
        // Two presses at once: the other one's request stands, which is the same thing.
        if (!(e && e.code === 11000)) throw e;
    }
    return json(202, await read(col, now));
}

exports.handler = async (event) => {
    const method = event.httpMethod;
    if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed" });
    if (!isAuthorized(event)) return UNAUTHORIZED;
    try {
        const role = await roleOf(event);
        if (role === null) return UNAUTHORIZED;
        if (!["owner", "admin", "viewer"].includes(role)) return forbidden("This account can't see the speed checks.");
        if (method === "POST" && !(await canWrite(event, "site"))) return refuseWrite(event);
        let db;
        try {
            db = await getDb();
        } catch (e) {
            console.error("speed-checks: database connection failed", e);
            return json(503, { error: "The database isn't answering. Try again in a minute." });
        }
        const col = db.collection(COLLECTION);
        const now = Date.now();
        if (method === "POST") return await ask(event, col, now);
        return json(200, await read(col, now));
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        console.error("speed-checks: request failed", e);
        return json(500, { error: "Something went wrong reading the speed checks." });
    }
};

exports.runDue = runDue;
exports.readPsi = readPsi;
exports.slotStart = slotStart;
exports.PAGES = PAGES;
exports.COLLECTION = COLLECTION;

/* Failures reported to /warren's Errors tab: see withErrorReporting in
   _errors.js. Last, so it wraps the handler as finally defined above. */
exports.handler = require("./_errors").withErrorReporting("speed-checks", exports.handler);

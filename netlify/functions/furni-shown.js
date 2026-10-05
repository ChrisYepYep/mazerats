/* /.netlify/functions/furni-shown?u=<old address>[&c=<classname>] — one of
   the furni pictures the archive stored on FurniIndex's OLD host, as the
   site shows it now (5 Oct 2026, the owner's: the old host is being
   switched off, and the site's security policy no longer lets a page load
   from it). The Warren edits records exactly as stored, so its furni rows
   and scan reviews still hold old addresses; it draws each through here
   instead (shownFurni in js/admin.js). A redirect to the new API's picture,
   or to this site's own copy (_furni-mirror.js) — worked out exactly as
   the public payload does (shownPicture in _furni-payload.js). Public and
   read-only: it only ever points at pictures. */
const { shownPicture } = require("./_furni-payload");
const { SECURITY_HEADERS } = require("./_headers");

const OLD = /^https:\/\/furniindex\.com\/image\/[A-Za-z0-9._%*()'!~-]+(\/[A-Za-z0-9._%*()'!~-]+)*$/;
const CLASS = /^[A-Za-z0-9_*.\-]{1,80}$/;

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return { statusCode: 405, headers: SECURITY_HEADERS, body: "" };
    const q = event.queryStringParameters || {};
    const u = String(q.u || "");
    const c = CLASS.test(String(q.c || "")) ? String(q.c) : "";
    if (!OLD.test(u)) return { statusCode: 400, headers: SECURITY_HEADERS, body: "" };
    let to = "";
    let failed = false;
    try { to = await shownPicture(u, c); } catch (e) { failed = true; console.error("furni-shown: could not work it out", e); }
    // A failure to work it out is not a "no picture" to keep for an hour
    // (5 Oct 2026, the bug scan): asked again next time.
    if (!to) return { statusCode: 404, headers: { ...SECURITY_HEADERS, "Cache-Control": failed ? "no-store" : "public, max-age=3600" }, body: "" };
    return {
        statusCode: 302,
        headers: { ...SECURITY_HEADERS, Location: to, "Cache-Control": "public, max-age=86400" },
        body: ""
    };
};

exports.handler = require("./_errors").withErrorReporting("furni-shown", exports.handler);

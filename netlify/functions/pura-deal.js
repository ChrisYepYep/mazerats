/* /.netlify/functions/pura-deal: Pura Panic's pieces, a few at a time
   (31 Oct 2026, the bug scan; the owner's yes). See _pura-run.js for why
   the page is no longer given the seed.

     POST { run, log, from, stamp }
       run    the game's run token (pura-scores.js ?action=start or continue)
       log    every placement so far, [rot, x, y, lane] each, as the board
              takes them
       from   the first piece the page wants (the ones it already has are
              not sent again)
       stamp  the last answer's stamp, if any

     { kinds, from, stamp }  pieces `from` up to WINDOW past the last
                             placement, and the stamp to send next time
     { wait }                not yet: no piece is dealt sooner than
                             PIECE_MIN_MS a placement since the start; ask
                             again in `wait` ms (never seen in a person's
                             game, whose pieces take far longer)
     { refused }             this run can have no more pieces: run out
                             ("stale-run") or an old page's token ("old-run")
     400                     the placements are not a game the rules allow

   Nothing is read or written here but the request: no database, so a
   deal costs a replay and nothing else. Bans, Maintenance and the board's
   rules are all asked where they always were, when the game is saved. */
const { playerFrom } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
const { PIECE_MIN_MS, MAX_PIECES, MAX_BODY, WINDOW, readRun, checkLog, stampFor, dealOf } = require("./_pura-run");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// As pura-scores.js: a POST naming another site is refused.
function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try { return new URL(origin).host === host; } catch (e) { return false; }
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!sameOrigin(event)) return json(403, { error: "Forbidden" });
    if ((event.body || "").length > MAX_BODY) return json(413, { error: "That game is too long to send" });
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Body is not JSON" }); }
    if (!body || typeof body !== "object") return json(400, { error: "Body is not JSON" });

    const claims = readRun(body.run, playerFrom(event));
    if (!claims) return json(200, { refused: "stale-run" });
    if (claims.legacy) return json(200, { refused: "old-run" });

    const log = body.log;
    if (!Array.isArray(log)) return json(400, { error: "No placements" });
    if (log.length > MAX_PIECES) return json(400, { error: "Too many pieces" });

    // No piece sooner than the floor allows: held, not refused.
    const early = log.length * PIECE_MIN_MS - (Date.now() - claims.t);
    if (early > 0) return json(200, { wait: Math.min(early, 60 * 1000) });

    const checked = checkLog(claims, log, body.stamp);
    if (checked.error) return json(400, { error: checked.error });

    const upTo = checked.result.over ? log.length : log.length + WINDOW;
    const from = Math.min(Math.max(0, Number.isInteger(body.from) ? body.from : 0), upTo);
    return json(200, { kinds: dealOf(claims, upTo).slice(from), from, stamp: stampFor(claims.rid, log) });
};

exports.handler = require("./_errors").withErrorReporting("pura-deal", exports.handler);

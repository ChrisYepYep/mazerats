/* How this site asks Habbo for anything (4 Nov 2026, the bug scan; the retry
   and the cause began in room-figure.js on 3 Nov).

   Habbo Origins has maintenance breaks in which it is simply away for a while.
   Two things follow on every path that asks it: a stale copy beats a failure,
   which each caller sees to, and nobody should go on knocking during a break,
   which is `resting` here.

   ONE MORE ASK, ONCE. A single lookup that failed for a moment should not
   reach a player. Only for a failure that a second try could fix and that left
   room for one: a dropped connection, a 5xx, or a body that was not JSON or not
   a picture. Not after a timeout (six seconds spent already, and Habbo is
   plainly not answering), and not after a 403 or a 429, which is the WAF saying
   no, and asking again at once is exactly the wrong reply to that.

   RESTING. After two asks in a row have failed, or one the WAF refused, this
   warm instance leaves that host alone for a minute: callers are told at once,
   and answer from their copy or with their usual failure. The first ask after
   the minute decides: one more failure rests it again. In memory, per instance,
   so a crowd of instances each still tries a little, which is all a break
   needs; nothing is stored. */
const RETRY_WAIT_MS = 300;
const REST_MS = 60 * 1000;
const FAILS_TO_REST = 2;

const hosts = new Map();   // host -> { fails, until }

function resting(host) {
    const h = hosts.get(host);
    return Boolean(h && Date.now() < h.until);
}

function noteSuccess(host) {
    hosts.delete(host);
}

function noteFailure(host, err) {
    const h = hosts.get(host) || { fails: 0, until: 0 };
    h.fails++;
    const refused = err && (err.status === 403 || err.status === 429);
    if (refused || h.fails >= FAILS_TO_REST) h.until = Date.now() + REST_MS;
    hosts.set(host, h);
}

/* An error for a host that is being left alone, for a caller's own catch. */
function restingError(host) {
    const err = new Error(`${host} is resting after failures`);
    err.resting = true;
    return err;
}

/* `ask(timeoutMs)` is one try: it answers, or throws an Error with `status`
   set when Habbo answered with a refusal. Tried once more if that could help,
   within `totalMs` for both. A failure that survives counts towards a rest. */
async function askTwice(host, ask, { timeoutMs, totalMs }) {
    if (resting(host)) throw restingError(host);
    const started = Date.now();
    try {
        let answer;
        try {
            answer = await ask(timeoutMs);
        } catch (first) {
            const left = totalMs - (Date.now() - started) - RETRY_WAIT_MS;
            const hopeless = first.name === "AbortError" || (first.status && first.status < 500) || left < 1000;
            if (hopeless) throw first;
            await new Promise(resolve => setTimeout(resolve, RETRY_WAIT_MS));
            answer = await ask(Math.min(left, timeoutMs));
        }
        noteSuccess(host);
        return answer;
    } catch (err) {
        // A 404 or 400 is Habbo answering about this one request, not a host in trouble.
        const answered = err.status >= 400 && err.status < 500 && err.status !== 403 && err.status !== 429;
        if (!answered) noteFailure(host, err);
        throw err;
    }
}

/* What went wrong, in a few words, for the Warren's report and the log: whether
   Habbo answered 503 or the connection dropped. Nothing a visitor typed is in
   it, and the name of a public host is no secret. */
function causeOf(err) {
    if (err.status || err.resting) return err.message;
    if (err.name === "AbortError") return "timed out";
    const code = err.cause && (err.cause.code || err.cause.message);
    return String(code || err.message || "failed").slice(0, 100);
}

function _forget() { hosts.clear(); }

module.exports = { askTwice, resting, restingError, noteSuccess, noteFailure, causeOf, REST_MS, _forget };

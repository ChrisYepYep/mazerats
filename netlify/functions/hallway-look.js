/* /.netlify/functions/hallway-look — a signed-in player's own Habbo look, as it was the last time they walked the Hallway (16 Nov 2026, his
   ask: "always store their most recent avatar appearance, based on when they last visited the hallways. The stored look should only be used
   if the latest avatar data can't be pulled").

     GET              the stored look { look: { figure, name, hotel, at } }, or { look: null }. Only while it is still the look of the Habbo
                      the player has linked now: a relinked player's old Habbo isn't theirs to walk as.
     POST { figure }  the look the page just had from Habbo for the player's linked Habbo. Kept on their players row, and its 48 frames
                      (_hallway-av.js CORE_FRAMES) kept in the "hallway" store, because when Habbo is offline its imaging is down with it and
                      a figure string alone draws nothing. hallway.js ?av= serves those frames only when Habbo can't.

   Only for a player with a linked Habbo (players.habbo, not a guess). The figure is the page's word for it: whoever sends one can only set
   their own fallback, which nobody else ever sees, so it's checked for shape and not asked of Habbo again. What it can cost is Habbo's
   imaging, 48 asks a new look, so a look's frames are fetched only when it changes, and at most LOOKS_PER_DAY new looks a day. */
const { getDb } = require("./_db");
const { livePlayerFrom } = require("./_player");
const { blobStore } = require("./_blobs.js");
const { SECURITY_HEADERS } = require("./_headers");
const av = require("./_hallway-av");
const { writeRefusal } = require("./_bans");

const STORE = "hallway";
const LOOKS_PER_DAY = 10;
const FETCH_BUDGET_MS = 8000, AT_ONCE = 4;

const reply = (statusCode, body) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
    body: JSON.stringify(body)
});

/* From this site (player-nick.js has the same belt: the cookie is SameSite=Lax and the body JSON, so a cross-site page can't get here anyway) */
function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try { return new URL(origin).host === host; } catch (e) { return false; }
}

const linkedHabbo = row => (row && row.habbo && typeof row.habbo.name === "string" && row.habbo.name ? row.habbo : null);
const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const hotelOf = h => String((h && h.hotel) || "COM").toUpperCase();

/* The frames of a look that aren't kept yet, fetched from Habbo a few at a time until the budget runs out; the rest are tried next visit */
async function keepFrames(store, figure) {
    const prefix = "look/" + av.figureHash(figure) + "/";
    let have;
    try { have = new Set((await store.list({ prefix })).blobs.map(b => b.key)); } catch (e) { have = new Set(); }
    const missing = av.CORE_FRAMES.filter(x => !have.has(av.lookKey(figure, x.d, x.a, x.f, "")));
    const until = Date.now() + FETCH_BUDGET_MS, ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), FETCH_BUDGET_MS);
    let saved = 0, i = 0;
    const worker = async () => {
        while (i < missing.length && Date.now() < until) {
            const x = missing[i++];
            let b = null;
            try { b = await av.fetchFrame(av.frameUrl(figure, x.d, x.a, x.f, ""), ctl.signal); } catch (e) { b = null; }
            if (!b) continue;
            try { await store.set(av.lookKey(figure, x.d, x.a, x.f, ""), b.buffer.slice(b.byteOffset, b.byteOffset + b.length), { metadata: { at: Date.now() } }); saved++; } catch (e) { /* next visit */ }
        }
    };
    try { await Promise.all(Array.from({ length: AT_ONCE }, worker)); } finally { clearTimeout(timer); }
    return { kept: have.size + saved, of: av.CORE_FRAMES.length };
}

/* A look nobody keeps any more takes its frames with it */
async function dropFrames(store, players, figure) {
    if (!av.okFigure(figure)) return;
    if (await players.countDocuments({ "hallwayLook.figure": figure }, { limit: 1 })) return;
    const { blobs } = await store.list({ prefix: "look/" + av.figureHash(figure) + "/" });
    await Promise.all(blobs.map(b => store.delete(b.key).catch(() => {})));
}

exports.handler = async (event) => {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });
    let db;
    try { db = await getDb(); } catch (e) { return reply(503, { error: "Can't reach the database just now" }); }
    const player = await livePlayerFrom(db, event);
    if (!player) return reply(401, { error: "Not signed in" });
    const players = db.collection("players");
    const row = await players.findOne({ id: String(player.id) }, { projection: { _id: 0, habbo: 1, hallwayLook: 1 } });
    const habbo = linkedHabbo(row), was = row && row.hallwayLook;

    if (event.httpMethod === "GET") {
        const look = habbo && was && av.okFigure(was.figure) && sameName(was.name, habbo.name) && hotelOf(was) === hotelOf(habbo)
            ? { figure: was.figure, name: habbo.name, hotel: hotelOf(habbo), at: was.at || null } : null;
        return reply(200, { look });
    }

    if (!sameOrigin(event)) return reply(403, { error: "Not from this site" });
    /* Bans and the Hallway's switch first (scan 18 Nov evening): a banned
       account could still save looks, each up to 48 asks of Habbo's imaging.
       Only while the Hallway is live, or for an admin walking it before then
       (the page sends its x-admin-token, as Lost Property does), as
       _hallway-open.js rules for the Hallway's other writes. */
    const open = await require("./_hallway-open").hallwayOpen(db, event);
    if (open === null) return reply(503, { error: "Couldn't save just now" });
    if (!open) return reply(403, { error: "The Hallway isn't open yet" });
    const refusal = await writeRefusal(db, event, player.id);
    if (refusal) return refusal;
    let body; try { body = JSON.parse(event.body || "{}"); } catch (e) { return reply(400, { error: "Not JSON" }); }
    const figure = body && body.figure;
    if (!av.okFigure(figure)) return reply(400, { error: "Not a figure" });
    if (!habbo) return reply(409, { error: "No Habbo linked" });

    const now = new Date(), today = now.toISOString().slice(0, 10);
    const changed = !was || was.figure !== figure;
    const changes = was && was.day === today ? Number(was.changes) || 0 : 0;
    if (changed && changes >= LOOKS_PER_DAY) return reply(429, { error: "That's enough new looks for today" });
    await players.updateOne({ id: String(player.id) }, { $set: { hallwayLook: {
        figure, name: habbo.name, hotel: hotelOf(habbo), at: now.toISOString(),
        day: changed ? today : (was.day || today), changes: changed ? changes + 1 : changes
    } } });

    const store = blobStore(STORE);
    const frames = await keepFrames(store, figure);
    if (changed && was && was.figure) { try { await dropFrames(store, players, was.figure); } catch (e) { console.error("hallway-look: old frames", e.message); } }
    return reply(200, { saved: true, frames });
};

exports.handler = require("./_errors").withErrorReporting("hallway-look", exports.handler);
// For player-forget.js: a forgotten player's look takes its frames with it.
exports.dropFrames = dropFrames;
exports.STORE = STORE;

/* Whether the Hallway takes writes from this request (10 Nov 2026 scan, server finding 7). The Warren's switch, settings.hallwayState, was only
   checked on the homepage, so anyone opening /assets/hallway/app/play.html before launch could start Lost Property searches, get onto the
   weekly board and save hunt places. Now Lost Property and hunt progress take writes only while the Hallway is live, or from an admin with a
   live Warren session (the page sends the x-admin-token it has), who can walk it in every state. The state is read once a minute.
   Answers true, false, or null when the setting can't be read just now. */
const ADMIN_HEADER = "x-admin-token";
let memo = null;
async function stateOf(db) {
    if (memo && Date.now() - memo.at < 60e3) return memo.state;
    try {
        const doc = await db.collection("settings").findOne({ _id: "site" }, { projection: { _id: 0, hallwayState: 1 } });
        const state = doc && ["hidden", "coming-soon", "maintenance", "live"].includes(doc.hallwayState) ? doc.hallwayState : "hidden";      // settings.js's default
        memo = { at: Date.now(), state };
        return state;
    } catch (e) { console.error("hallway: couldn't read the Hallway's state", e); return null; }
}
async function hallwayOpen(db, event) {
    const state = await stateOf(db);
    if (state === "live") return true;
    const h = (event && event.headers) || {};
    if (!h[ADMIN_HEADER] && !h["X-Admin-Token"]) return state === null ? null : false;
    try { return await require("./_auth.js").hasLiveSession({ ...event, headers: { ...h, [ADMIN_HEADER]: h[ADMIN_HEADER] || h["X-Admin-Token"] } }); }
    catch (e) { console.error("hallway: couldn't check the admin session", e); return null; }
}
module.exports = { hallwayOpen, _reset: () => { memo = null; } };

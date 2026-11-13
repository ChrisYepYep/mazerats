/* The Hallway, as edited in the Warren (6 Nov 2026). tools/hallway-editor is where it was laid out; the same editor in the
   Warren (assets/hallway/app/edit.html) draws the pictures in the admin's own browser and keeps them here.

     GET  ?what=live     the published manifest, for the page that walks it. 404 until something's been published from the
                         Warren: the page then uses the copy in assets/hallway/, published from the local editor.
     GET  ?what=map      the published map
     GET  ?tile=<hash>   one picture. Named by its contents, so it can be kept for good
     GET  ?what=draft    the saved draft (admin)
     GET  ?what=known    which pictures are here already, so only new ones get sent (admin)
     GET  ?av=<figure>&d&a&h&f   one frame of a Habbo's small figure from Habbo's imaging, for the page to wear: it has to read
                         the pixels, and the imaging service doesn't allow that from a browser. Only figure strings, only that host.
     POST action: draft    { map }             save, for admins only (admin)
     POST action: tile     { hash, png }       one picture, base64 (admin)
     POST action: publish  { map, manifest }   what goes live, once every picture it names has arrived (admin)

   What's public here is what the live page needs, as with the static copy; the Warren's switch decides who's offered it. */
const crypto = require("crypto");
const { blobStore } = require("./_blobs.js");
const auth = require("./_auth.js");
const { SECURITY_HEADERS } = require("./_headers");
const { keyOf } = require("./_ratelimit");

const STORE = "hallway", MAX_MAP = 4 * 1024 * 1024, MAX_TILE = 3 * 1024 * 1024, HASH = /^[a-f0-9]{20}$/, FRESH_MS = 10 * 60e3;
const reply = (statusCode, body, extra) => ({ statusCode, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extra || {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });
const FIGURE = /^[a-z]{2}-\d+(-\d+)*(\.[a-z]{2}-\d+(-\d+)*)*$/;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const WATER = 1;      // the clear glass, as tools/hallway-editor/fetch-avatar.js
/* Held in (14 Nov 2026, the bug scan): each figure nobody had asked for before missed the edge's copy and was an ask of Habbo, limited
   only by the pictures' budget of 600 a minute, and too many of those could get the site's addresses blocked by Habbo's firewall, which
   habbo.js and habbo-outline.js depend on too. So a network gets AV_PER_NET frames a minute from Habbo on each warm instance (counted
   in memory by the rate limit's daily network code, nothing stored), the last AV_KEEP frames are kept here and answered without
   asking again, and a refusal from Habbo (a 403 from its firewall) is never asked twice: only a 5xx is tried again. */
const AV_PER_NET = 120, AV_KEEP = 300;
const avByNet = new Map(), avKept = new Map();
function avRoom(event) {
    const key = keyOf(event);
    if (!key) return true;
    const minute = Math.floor(Date.now() / 60000), seen = avByNet.get(key), n = seen && seen.minute === minute ? seen.n + 1 : 1;
    if (n > AV_PER_NET) return false;
    if (avByNet.size >= 5000) { for (const [k, v] of avByNet) if (v.minute !== minute) avByNet.delete(k); if (avByNet.size >= 5000) avByNet.clear(); }
    avByNet.set(key, { minute, n });
    return true;
}
const avReply = b => ({ statusCode: 200, isBase64Encoded: true, headers: { ...SECURITY_HEADERS, "Content-Type": "image/png", "Cache-Control": "public, max-age=604800", "Netlify-Vary": "query=av|d|a|h|f" }, body: b.toString("base64") });
async function avatarFrame(q, event) {
    const figure = String(q.av || ""), d = String(q.d), a = String(q.a), f = String(q.f || "0"), h = String(q.h || "");
    if (figure.length > 240 || !FIGURE.test(figure) || !/^[0-7]$/.test(d) || !/^(std|wlk|sit)$/.test(a) || !/^[0-3]$/.test(f) || !/^(|crr|drk)$/.test(h)) return reply(400, { error: "Bad figure" });
    const action = a === "wlk" ? "wlk" : a === "sit" ? "sit" : "std", item = h ? "," + h + "=" + WATER : "";
    const url = "https://www.habbo.com/habbo-imaging/avatarimage?" + new URLSearchParams({ figure, size: "s", direction: d, head_direction: d, action: action + item, frame: f, gesture: "sml" });
    const kept = avKept.get(url);
    if (kept) { avKept.delete(url); avKept.set(url, kept); return avReply(kept); }    // the newest at the end, so the oldest goes first
    if (!avRoom(event)) return reply(429, { error: "Too many figures just now. Wait a moment and try again.", reason: "rate-limit" }, { "Retry-After": "60" });
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
    try {
        /* As the site's other asks of Habbo: its firewall answers a bare request with an error page. One more try, on a 5xx only. */
        let r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT, Accept: "image/png,image/*" } }); if (r.status >= 500) r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT, Accept: "image/png,image/*" } });
        if (!r.ok) return reply(502, { error: "Habbo isn't answering" });
        const b = Buffer.from(await r.arrayBuffer()); if (b.length < 8 || b.length > 200000 || b.readUInt32BE(0) !== 0x89504e47) return reply(502, { error: "Habbo isn't answering" });
        // A small figure is a couple of kilobytes; anything far bigger isn't kept, so the memory stays small.
        if (b.length <= 20000) { avKept.set(url, b); if (avKept.size > AV_KEEP) avKept.delete(avKept.keys().next().value); }
        return avReply(b);
    } catch (e) { return reply(502, { error: "Habbo isn't answering" }); } finally { clearTimeout(t); }
}
const sha = t => crypto.createHash("sha1").update(t).digest("hex").slice(0, 20);
/* The draft is read back straight after a save, so it has to be the newest, not a copy from the edge */
const readDraft = async store => { try { return await store.get("draft", { type: "text", consistency: "strong" }); } catch (e) { return store.get("draft", { type: "text" }); } };
const looksLikeMap = m => m && typeof m === "object" && Array.isArray(m.levels) && m.levels.length > 0 && m.levels.length < 40;

async function handle(event) {
    const store = blobStore(STORE), q = event.queryStringParameters || {};
    if (event.httpMethod === "GET") {
        if (q.av !== undefined) return avatarFrame(q, event);
        if (q.tile !== undefined) {
            if (!HASH.test(q.tile)) return reply(400, { error: "Bad picture name" });
            const data = await store.get("tile/" + q.tile, { type: "arrayBuffer" });
            if (!data) return reply(404, { error: "No such picture" });
            return { statusCode: 200, isBase64Encoded: true, headers: { ...SECURITY_HEADERS, "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable", "Netlify-Vary": "query=tile" }, body: Buffer.from(data).toString("base64") };
        }
        if (q.what === "live" || q.what === "map") {
            let key = q.what === "live" ? "manifest" : "map";
            /* The map belonging to the version the page was told about, else to the version that's live. Maps from before they were kept by version are under "map". */
            /* (10 Nov scan, server findings 8 and 17) the version asked for, kept for good since it's named by its contents; one tidied away since
               then gives the version that's live rather than the pre-version "map", which is only for a store that has no manifest at all */
            if (q.what === "map") {
                const asked = /^[a-f0-9]{16}$/.test(q.v || "") ? q.v : null;
                if (asked) { const t = await store.get("map/" + asked, { type: "text" }); if (t) return reply(200, t, { "Cache-Control": "public, max-age=31536000, immutable", "Netlify-Vary": "query=what|v" }); }
                const man = await store.get("manifest", { type: "json" });
                if (man && man.mapVersion) { const t = await store.get("map/" + man.mapVersion, { type: "text" }); if (t) return reply(200, t, { "Cache-Control": "public, max-age=0, must-revalidate" }); }
                if (man) return reply(404, { error: "Nothing published here yet" });
            }
            const text = await store.get(key, { type: "text" });
            if (!text) return reply(404, { error: "Nothing published here yet" });
            return reply(200, text, { "Cache-Control": "public, max-age=0, must-revalidate" });
        }
        if (q.what === "draft" || q.what === "known") {
            if (!(await auth.hasLiveSession(event))) return auth.UNAUTHORIZED;
            if (q.what === "draft") { const text = await readDraft(store); return reply(200, text || "null"); }
            const { blobs } = await store.list({ prefix: "tile/" });
            return reply(200, { known: blobs.map(b => b.key.slice(5)) });
        }
        return reply(400, { error: "Ask for live, map, draft, known or a tile" });
    }
    if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });
    /* The owner and the admins, not a read-only role; and it goes in the Warren's action log, as every write does */
    let body; try { body = JSON.parse(event.body || "{}"); } catch (e) { body = null; }
    /* One line in the log for a publish, not one for each of its pictures */
    if (body && body.action === "tile") event.quietWrite = true;
    if (!(await auth.canWrite(event))) return await auth.refuseWrite(event);
    if (!body) return reply(400, { error: "Not JSON" });

    if (body.action === "draft") {
        if (!looksLikeMap(body.map)) return reply(400, { error: "Not a map" });
        const text = JSON.stringify(body.map); if (text.length > MAX_MAP) return reply(413, { error: "That map is too big" });
        /* Saved from somewhere else since this copy was opened: the editor asks before replacing it */
        if (body.base && !body.force) { const was = await readDraft(store); if (was && sha(was) !== body.base && was !== text) return reply(409, { error: "It's been saved from somewhere else" }); }
        await store.set("draft", text);
        return reply(200, { saved: true, at: Date.now() });
    }
    if (body.action === "tile") {
        if (!HASH.test(body.hash || "") || typeof body.png !== "string") return reply(400, { error: "Bad picture" });
        const png = Buffer.from(body.png, "base64");
        if (png.length > MAX_TILE || png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) return reply(400, { error: "Not a picture" });
        const hash = crypto.createHash("sha1").update(png).digest("hex").slice(0, 20);
        if (hash !== body.hash) return reply(400, { error: "That picture isn't what it says" });
        /* when it came, so a publish's tidy-up leaves alone the pictures another publish is still sending (9 Nov scan, finding 7) */
        await store.set("tile/" + hash, png.buffer.slice(png.byteOffset, png.byteOffset + png.length), { metadata: { at: Date.now() } });
        return reply(200, { ok: true });
    }
    if (body.action === "publish") {
        const m = body.manifest;
        /* null is an "object" too, and Object.values(null) throws: a 400, not a 500 (9 Nov scan, finding 8) */
        if (!looksLikeMap(body.map) || !m || !m.tiles || !m.lift || typeof m.tiles !== "object" || typeof m.lift !== "object") return reply(400, { error: "Not something to publish" });
        const mapText = JSON.stringify(body.map); if (mapText.length > MAX_MAP) return reply(413, { error: "That map is too big" });
        if (body.base) { const was = await readDraft(store); if (was && sha(was) !== body.base && was !== mapText) return reply(409, { error: "It's been saved from somewhere else" }); }
        /* Every picture it names has to be here, or visitors get holes */
        const { blobs } = await store.list({ prefix: "tile/" }), have = new Set(blobs.map(b => b.key.slice(5)));
        const named = [...Object.values(m.tiles), ...Object.values(m.lift)];
        for (const h of named) if (!HASH.test(String(h)) || !have.has(h)) return reply(400, { error: "A picture is missing: " + h });
        /* the lift's pictures are part of what's live too: a publish where only they changed is a new version, or `recent` (kept by version)
           would drop the old ones while pages open on the same version string still ask for them (9 Nov scan, finding 7) */
        const version = crypto.createHash("sha1").update(mapText + JSON.stringify(m.tiles) + JSON.stringify(m.lift)).digest("hex").slice(0, 16), publishedAt = new Date().toISOString();
        /* The map first under its own version, then the one write that makes both live: a failure in between changes nothing visitors see */
        await store.set("map/" + version, mapText);
        await store.set("manifest", JSON.stringify({ version, mapVersion: version, tile: m.tile || 512, moods: m.moods || [], publishedAt, online: true, tiles: m.tiles, lift: m.lift }));
        /* It's live, so nothing past here can make this a failure. Pages open on the last few publishes still ask for their pictures, so those stay; what's older goes, a few at a time, and anything left is tried again next time. */
        try {
            const recent = (await store.get("recent", { type: "json" }).catch(() => null)) || [], now = [{ version, tiles: named }, ...recent.filter(r => r && r.version !== version)].slice(0, 3);
            await store.set("recent", JSON.stringify(now));
            /* (10 Nov scan, server finding 9) another publish may have gone live while this one ran: whatever is live now, and every publish
               in `recent` as it stands now, keeps its pictures and its map, not only what this publish read at the start */
            const liveNow = await store.get("manifest", { type: "json" }).catch(() => null), recentNow = (await store.get("recent", { type: "json" }).catch(() => null)) || [];
            const keepAll = [...now, ...recentNow.filter(Boolean), ...(liveNow && liveNow.tiles ? [{ version: liveNow.mapVersion, tiles: [...Object.values(liveNow.tiles), ...Object.values(liveNow.lift || {})] }] : [])];
            const keep = new Set(keepAll.flatMap(r => r.tiles || [])), gone = [...have].filter(h => !keep.has(h)), until = Date.now() + 4000;
            /* ...except a picture that came in the last FRESH_MS: another tab or admin may be sending it for a publish of its own, not yet in `recent` */
            const fresh = async h => { try { const md = await store.getMetadata("tile/" + h); const at = md && md.metadata && Number(md.metadata.at); return !!at && Date.now() - at < FRESH_MS; } catch (e) { return true; } };
            for (let i = 0; i < gone.length && Date.now() < until; i += 12) await Promise.all(gone.slice(i, i + 12).map(async h => { if (!(await fresh(h))) await store.delete("tile/" + h); }));
            const { blobs: maps } = await store.list({ prefix: "map/" }), keepMaps = new Set(keepAll.filter(r => r.version).map(r => "map/" + r.version));
            await Promise.all(maps.filter(b => !keepMaps.has(b.key)).slice(0, 12).map(b => store.delete(b.key)));
        } catch (e) { console.error("hallway tidy-up", e); }
        return reply(200, { published: true, version, publishedAt });
    }
    return reply(400, { error: "No such action" });
}
/* A Blobs or database hiccup is a 503 to try again (14 Nov 2026, the bug scan), as every other admin function answers, not Netlify's
   bare 502 with its error text: the Warren editor gets JSON it can read, and the walking page falls back to the deployed copy. */
exports.handler = async (event) => {
    try {
        return await handle(event);
    } catch (e) {
        if (auth.isAuthUnavailable && auth.isAuthUnavailable(e)) return auth.AUTH_UNAVAILABLE;
        console.error("hallway", e);
        return reply(503, { error: "The Hallway's store can't be read just now" });
    }
};
exports.handler = require("./_errors").withErrorReporting("hallway", exports.handler);

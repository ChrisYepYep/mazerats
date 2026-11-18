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

const STORE = "hallway", MAX_MAP = 4 * 1024 * 1024, MAX_TILE = 3 * 1024 * 1024, HASH = /^[a-f0-9]{20}$/, FRESH_MS = 10 * 60e3;
const reply = (statusCode, body, extra) => ({ statusCode, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extra || {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });
/* What Netlify's cache may keep (15 Nov scan, server finding 2). A picture or a map by version is named by its contents, so the edge and
   the durable layer keep it for good; without `durable` each edge node kept its own copy and 9 in 10 asks ran the function (_cache.js:26).
   ONE Netlify-Vary for every answer this address gives, naming every parameter any of them reads, so the cache's key never depends on
   which kind of answer it saw first. Only answers that are the same for everybody are ever given a CDN policy: the draft, the picture
   list and every refusal are no-store, and so is anything an admin's token decides. */
const VARY = "query=tile|what|v|av|d|a|h|f";
const KEEP = { "Cache-Control": "public, max-age=31536000, immutable", "Netlify-CDN-Cache-Control": "public, durable, max-age=31536000, immutable", "Netlify-Vary": VARY };
const KEEP_WEEK = { "Cache-Control": "public, max-age=604800", "Netlify-CDN-Cache-Control": "public, durable, max-age=604800", "Netlify-Vary": VARY };
const ASK_EACH_TIME = { "Cache-Control": "public, max-age=0, must-revalidate", "Netlify-CDN-Cache-Control": "no-store", "Netlify-Vary": VARY };
/* the figure, its frames from Habbo, and the kept copy of a signed-in player's own look (16 Nov 2026): see _hallway-av.js */
const av = require("./_hallway-av");
/* Held in (14 Nov 2026, the bug scan): each figure nobody had asked for before missed the edge's copy and was an ask of Habbo, limited
   only by the pictures' budget of 600 a minute, and too many of those could get the site's addresses blocked by Habbo's firewall, which
   habbo.js and habbo-outline.js depend on too. So a network gets AV_PER_NET frames a minute from Habbo on each warm instance (counted
   in memory by the rate limit's daily network code, nothing stored), the last AV_KEEP frames are kept here and answered without
   asking again, and a refusal from Habbo (a 403 from its firewall) is never asked twice: only a 5xx is tried again. */
const AV_KEEP = 300;
const avKept = new Map();
// The count itself is _hallway-av.js's imagingRoom now (scan 18 Nov evening), shared with habbo-outline.js; AV_PER_NET is its IMAGING_PER_NET.
const avRoom = event => av.imagingRoom(event);
const avReply = b => ({ statusCode: 200, isBase64Encoded: true, headers: { ...SECURITY_HEADERS, "Content-Type": "image/png", ...KEEP_WEEK }, body: b.toString("base64") });
async function avatarFrame(q, event) {
    const figure = String(q.av || ""), d = String(q.d), a = String(q.a), f = String(q.f || "0"), h = String(q.h || "");
    if (!av.okFigure(figure) || !/^[0-7]$/.test(d) || !/^(std|wlk|sit)$/.test(a) || !/^[0-3]$/.test(f) || !/^(|crr|drk)$/.test(h)) return reply(400, { error: "Bad figure" });
    const url = av.frameUrl(figure, d, a, f, h);
    const kept = avKept.get(url);
    if (kept) { avKept.delete(url); avKept.set(url, kept); return avReply(kept); }    // the newest at the end, so the oldest goes first
    if (!avRoom(event)) return reply(429, { error: "Too many figures just now. Wait a moment and try again.", reason: "rate-limit" }, { "Retry-After": "60" });
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
    let b = null;
    try { b = await av.fetchFrame(url, ctl.signal); } catch (e) { b = null; } finally { clearTimeout(t); }
    if (b) {
        // A small figure is a couple of kilobytes; anything far bigger isn't kept, so the memory stays small.
        if (b.length <= 20000) { avKept.set(url, b); if (avKept.size > AV_KEEP) avKept.delete(avKept.keys().next().value); }
        return avReply(b);
    }
    /* Habbo down (16 Nov 2026): a signed-in player's own look was kept by hallway-look.js, so it's drawn from that copy, and only for a
       minute: the real one is asked for again as soon as Habbo is back. Anyone else's figure has no copy and gets the 502 as before. */
    const copy = await av.keptFrame(blobStore(STORE), figure, d, a, f, h);
    if (copy) return { ...avReply(copy), headers: { ...SECURITY_HEADERS, "Content-Type": "image/png", "Cache-Control": "public, max-age=60", "Netlify-CDN-Cache-Control": "no-store", "Netlify-Vary": VARY, "X-Hallway-Look": "kept" } };
    return reply(502, { error: "Habbo isn't answering" });
}
const sha = t => crypto.createHash("sha1").update(t).digest("hex").slice(0, 20);
/* The draft is read back straight after a save, so it has to be the newest, not a copy from the edge */
const readDraft = async store => { try { return await store.get("draft", { type: "text", consistency: "strong" }); } catch (e) { return store.get("draft", { type: "text" }); } };
/* A read that has to be the newest (15 Nov scan, finding 3: the tidy-up's "what's live now" read could be up to a minute old). `strong`
   says whether it was: where the store can't give one, the ordinary read, and the caller doesn't lean on it. */
const strongGet = async (store, key, type) => { try { return { v: await store.get(key, { type, consistency: "strong" }), strong: true }; } catch (e) { return { v: await store.get(key, { type }), strong: false }; } };
/* every floor an object with a string id (15 Nov scan, finding 9: `levels: [null]` was published, and Lost Property threw on every start) */
const looksLikeMap = m => m && typeof m === "object" && Array.isArray(m.levels) && m.levels.length > 0 && m.levels.length < 40 && m.levels.every(l => l && typeof l === "object" && !Array.isArray(l) && typeof l.id === "string" && l.id.length > 0 && l.id.length <= 60);
const MOOD = /^[a-z][a-z0-9-]{0,15}$/;

/* The tidy-up after a publish has gone live (15 Nov scan, server finding 3). Two publishes overlapping used to delete the live map and the
   older pictures the second one reused: the first one's tidy-up decided what to keep from reads made before the second went live, then spent
   seconds deleting. Now:
   - it stops as soon as another publish is under way (its `publishing/` mark), and leaves the rest for next time;
   - what's live and what's in `recent` are read again, strongly, after each batch's other checks and straight before its deletes, so the
     gap between "what's kept" and the delete is the delete itself;
   - a picture or map that came in the last FRESH_MS is never deleted, nor is the map the live manifest names. */
async function tidy(store, mark, version, named, have) {
    const metaAt = async key => { let md; try { md = await store.getMetadata(key, { consistency: "strong" }); } catch (e) { md = await store.getMetadata(key); } return md && md.metadata ? Number(md.metadata.at) || 0 : 0; };
    const fresh = async key => { try { const at = await metaAt(key); return !!at && Date.now() - at < FRESH_MS; } catch (e) { return true; } };
    /* another publish under way; a mark older than FRESH_MS is one that died part way, and goes */
    const others = async () => {
        const { blobs } = await store.list({ prefix: "publishing/" });
        for (const b of blobs) { if (b.key === mark) continue; let at; try { at = await metaAt(b.key); } catch (e) { return true; } if (at && Date.now() - at < FRESH_MS) return true; await store.delete(b.key).catch(() => {}); }
        return false;
    };
    const recent0 = (await strongGet(store, "recent", "json")).v, mine = [{ version, tiles: named }, ...(Array.isArray(recent0) ? recent0 : []).filter(r => r && r.version !== version)].slice(0, 3);
    await store.set("recent", JSON.stringify(mine));
    /* (10 Nov scan, server finding 9) whatever is live now, and every publish in `recent` as it stands now, keeps its pictures and its map */
    const keepNow = async () => {
        const live = (await strongGet(store, "manifest", "json")).v, rec = (await strongGet(store, "recent", "json")).v;
        const all = [...mine, ...(Array.isArray(rec) ? rec.filter(Boolean) : []), ...(live && live.tiles ? [{ version: live.mapVersion, tiles: [...Object.values(live.tiles), ...Object.values(live.lift || {})] }] : [])];
        return { tiles: new Set(all.flatMap(r => Array.isArray(r.tiles) ? r.tiles : [])), maps: new Set(all.filter(r => r.version).map(r => "map/" + r.version)) };
    };
    let keep = await keepNow();
    const gone = [...have].filter(h => !keep.tiles.has(h)), until = Date.now() + 4000;
    for (let i = 0; i < gone.length && Date.now() < until; i += 12) {
        /* ...except a picture that came in the last FRESH_MS: another tab or admin may be sending it for a publish of its own */
        const batch = (await Promise.all(gone.slice(i, i + 12).map(async h => (await fresh("tile/" + h)) ? null : h))).filter(Boolean);
        if (await others()) return;
        keep = await keepNow();
        await Promise.all(batch.filter(h => !keep.tiles.has(h)).map(h => store.delete("tile/" + h)));
    }
    const { blobs: maps } = await store.list({ prefix: "map/" });
    const old = (await Promise.all(maps.filter(b => !keep.maps.has(b.key)).slice(0, 12).map(async b => (await fresh(b.key)) ? null : b.key))).filter(Boolean);
    if (await others()) return;
    keep = await keepNow();
    await Promise.all(old.filter(k => !keep.maps.has(k)).map(k => store.delete(k)));
}

async function handle(event) {
    const store = blobStore(STORE), q = event.queryStringParameters || {};
    if (event.httpMethod === "GET") {
        if (q.av !== undefined) return avatarFrame(q, event);
        if (q.tile !== undefined) {
            if (!HASH.test(q.tile)) return reply(400, { error: "Bad picture name" });
            const data = await store.get("tile/" + q.tile, { type: "arrayBuffer" });
            if (!data) return reply(404, { error: "No such picture" });
            return { statusCode: 200, isBase64Encoded: true, headers: { ...SECURITY_HEADERS, "Content-Type": "image/png", ...KEEP }, body: Buffer.from(data).toString("base64") };
        }
        if (q.what === "live" || q.what === "map") {
            let key = q.what === "live" ? "manifest" : "map";
            /* The map belonging to the version the page was told about, else to the version that's live. Maps from before they were kept by version are under "map". */
            /* (10 Nov scan, server findings 8 and 17) the version asked for, kept for good since it's named by its contents; one tidied away since
               then gives the version that's live rather than the pre-version "map", which is only for a store that has no manifest at all */
            if (q.what === "map") {
                const asked = /^[a-f0-9]{16}$/.test(q.v || "") ? q.v : null;
                if (asked) { const t = await store.get("map/" + asked, { type: "text" }); if (t) return reply(200, t, KEEP); }
                const man = await store.get("manifest", { type: "json" });
                if (man && man.mapVersion) { const t = await store.get("map/" + man.mapVersion, { type: "text" }); if (t) return reply(200, t, ASK_EACH_TIME); }
                if (man) return reply(404, { error: "Nothing published here yet" });
            }
            const text = await store.get(key, { type: "text" });
            if (!text) return reply(404, { error: "Nothing published here yet" });
            return reply(200, text, ASK_EACH_TIME);
        }
        if (q.what === "draft" || q.what === "known") {
            /* no-store said outright, as every other answer here says it (15 Nov scan, finding 11) */
            if (!(await auth.hasLiveSession(event))) return { ...auth.UNAUTHORIZED, headers: { ...(auth.UNAUTHORIZED.headers || {}), "Cache-Control": "no-store" } };
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
        /* Saved from somewhere else since this copy was opened: the editor asks before replacing it. Every save says what it started from
           (or that it means to replace whatever's there): one with neither overwrote silently (15 Nov scan, finding 8). */
        if (typeof body.base !== "string" && !body.force) return reply(400, { error: "Say which save this started from" });
        if (!body.force) { const was = await readDraft(store); if (was && sha(was) !== body.base && was !== text) return reply(409, { error: "It's been saved from somewhere else" }); }
        await store.set("draft", text);
        /* Two saves from the same start can both pass the check above before either writes (finding 8): read it back, and the one whose
           text isn't there now was overwritten, so it's told, as a stale start is. Only on a read that's sure to be the newest. */
        if (!body.force) { const back = await strongGet(store, "draft", "text"); if (back.strong && back.v !== text) return reply(409, { error: "It's been saved from somewhere else" }); }
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
        /* (15 Nov scan, finding 9) the rest of the manifest checked as the map is: a picture name that isn't a string was a 503 where a 400 is
           meant, a publish naming no pictures at all went live as a black Hallway, and `tile` and `moods` went into the live manifest unread */
        const named = [...Object.values(m.tiles), ...Object.values(m.lift)];
        if (!Object.keys(m.tiles).length || !named.length) return reply(400, { error: "That names no pictures" });
        if (named.some(h => typeof h !== "string" || !HASH.test(h))) return reply(400, { error: "A picture's name isn't one" });
        if (m.tile !== undefined && m.tile !== 512) return reply(400, { error: "Pictures are 512 across" });
        if (m.moods !== undefined && (!Array.isArray(m.moods) || m.moods.length > 12 || !m.moods.every(s => typeof s === "string" && MOOD.test(s)))) return reply(400, { error: "Not a list of lights" });
        /* (15 Nov scan, finding 3) this publish is under way: another publish's tidy-up stops while it is, so it can't delete a picture this one
           has just found in the store and is about to name. Gone when this one's done; one that died part way counts for FRESH_MS at most. */
        const mark = "publishing/" + crypto.randomBytes(8).toString("hex");
        await store.set(mark, "1", { metadata: { at: Date.now() } });
        try {
            /* Every picture it names has to be here, or visitors get holes */
            const { blobs } = await store.list({ prefix: "tile/" }), have = new Set(blobs.map(b => b.key.slice(5)));
            for (const h of named) if (!have.has(h)) return reply(400, { error: "A picture is missing: " + h });
            /* the lift's pictures are part of what's live too: a publish where only they changed is a new version, or `recent` (kept by version)
               would drop the old ones while pages open on the same version string still ask for them (9 Nov scan, finding 7) */
            const version = crypto.createHash("sha1").update(mapText + JSON.stringify(m.tiles) + JSON.stringify(m.lift)).digest("hex").slice(0, 16), publishedAt = new Date().toISOString();
            /* The map first under its own version, then the one write that makes both live: a failure in between changes nothing visitors see.
               The map carries when it came, as pictures do, so another publish's tidy-up leaves a new one alone (finding 3) */
            await store.set("map/" + version, mapText, { metadata: { at: Date.now() } });
            await store.set("manifest", JSON.stringify({ version, mapVersion: version, tile: 512, moods: m.moods || [], publishedAt, online: true, tiles: m.tiles, lift: m.lift }));
            /* It's live, so nothing past here can make this a failure. Pages open on the last few publishes still ask for their pictures, so those stay; what's older goes, a few at a time, and anything left is tried again next time. */
            try { await tidy(store, mark, version, named, have); } catch (e) { console.error("hallway tidy-up", e); }
            return reply(200, { published: true, version, publishedAt });
        } finally { await store.delete(mark).catch(() => {}); }
    }
    return reply(400, { error: "No such action" });
}
/* A Blobs or database hiccup is a 503 to try again (14 Nov 2026, the bug scan), as every other admin function answers, not Netlify's
   bare 502 with its error text: the Warren editor gets JSON it can read, and the walking page falls back to the deployed copy. */
exports.handler = async (event) => {
    try {
        /* HEAD is GET without the body (15 Nov scan, finding 11: it was a 405) */
        if (event && event.httpMethod === "HEAD") { const r = await handle({ ...event, httpMethod: "GET" }); return { ...r, body: "", isBase64Encoded: false }; }
        return await handle(event);
    } catch (e) {
        if (auth.isAuthUnavailable && auth.isAuthUnavailable(e)) return auth.AUTH_UNAVAILABLE;
        console.error("hallway", e);
        return reply(503, { error: "The Hallway's store can't be read just now" });
    }
};
exports.handler = require("./_errors").withErrorReporting("hallway", exports.handler);

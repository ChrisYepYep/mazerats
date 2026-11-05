/* The Hallway, as edited in the Warren (6 Nov 2026). tools/hallway-editor is where it was laid out; the same editor in the
   Warren (assets/hallway/app/edit.html) draws the pictures in the admin's own browser and keeps them here.

     GET  ?what=live     the published manifest, for the page that walks it. 404 until something's been published from the
                         Warren: the page then uses the copy in assets/hallway/, published from the local editor.
     GET  ?what=map      the published map
     GET  ?tile=<hash>   one picture. Named by its contents, so it can be kept for good
     GET  ?what=draft    the saved draft (admin)
     GET  ?what=known    which pictures are here already, so only new ones get sent (admin)
     POST action: draft    { map }             save, for admins only (admin)
     POST action: tile     { hash, png }       one picture, base64 (admin)
     POST action: publish  { map, manifest }   what goes live, once every picture it names has arrived (admin)

   What's public here is what the live page needs, as with the static copy; the Warren's switch decides who's offered it. */
const crypto = require("crypto");
const { blobStore } = require("./_blobs.js");
const auth = require("./_auth.js");
const { SECURITY_HEADERS } = require("./_headers");

const STORE = "hallway", MAX_MAP = 4 * 1024 * 1024, MAX_TILE = 3 * 1024 * 1024, HASH = /^[a-f0-9]{20}$/;
const reply = (statusCode, body, extra) => ({ statusCode, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extra || {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });
const looksLikeMap = m => m && typeof m === "object" && Array.isArray(m.levels) && m.levels.length > 0 && m.levels.length < 40;

exports.handler = async (event) => {
    const store = blobStore(STORE), q = event.queryStringParameters || {};
    if (event.httpMethod === "GET") {
        if (q.tile !== undefined) {
            if (!HASH.test(q.tile)) return reply(400, { error: "Bad picture name" });
            const data = await store.get("tile/" + q.tile, { type: "arrayBuffer" });
            if (!data) return reply(404, { error: "No such picture" });
            return { statusCode: 200, isBase64Encoded: true, headers: { ...SECURITY_HEADERS, "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable", "Netlify-Vary": "query=tile" }, body: Buffer.from(data).toString("base64") };
        }
        if (q.what === "live" || q.what === "map") {
            const text = await store.get(q.what === "live" ? "manifest" : "map", { type: "text" });
            if (!text) return reply(404, { error: "Nothing published here yet" });
            return reply(200, text, { "Cache-Control": "public, max-age=0, must-revalidate" });
        }
        if (q.what === "draft" || q.what === "known") {
            if (!(await auth.hasLiveSession(event))) return auth.UNAUTHORIZED;
            if (q.what === "draft") { const text = await store.get("draft", { type: "text" }); return reply(200, text || "null"); }
            const { blobs } = await store.list({ prefix: "tile/" });
            return reply(200, { known: blobs.map(b => b.key.slice(5)) });
        }
        return reply(400, { error: "Ask for live, map, draft, known or a tile" });
    }
    if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });
    /* The owner and the admins, not a read-only role; and it goes in the Warren's action log, as every write does */
    if (!(await auth.canWrite(event))) return await auth.refuseWrite(event);
    let body; try { body = JSON.parse(event.body || "{}"); } catch (e) { return reply(400, { error: "Not JSON" }); }

    if (body.action === "draft") {
        if (!looksLikeMap(body.map)) return reply(400, { error: "Not a map" });
        const text = JSON.stringify(body.map); if (text.length > MAX_MAP) return reply(413, { error: "That map is too big" });
        await store.set("draft", text);
        return reply(200, { saved: true, at: Date.now() });
    }
    if (body.action === "tile") {
        if (!HASH.test(body.hash || "") || typeof body.png !== "string") return reply(400, { error: "Bad picture" });
        const png = Buffer.from(body.png, "base64");
        if (png.length > MAX_TILE || png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) return reply(400, { error: "Not a picture" });
        const hash = crypto.createHash("sha1").update(png).digest("hex").slice(0, 20);
        if (hash !== body.hash) return reply(400, { error: "That picture isn't what it says" });
        await store.set("tile/" + hash, png.buffer.slice(png.byteOffset, png.byteOffset + png.length));
        return reply(200, { ok: true });
    }
    if (body.action === "publish") {
        const m = body.manifest;
        if (!looksLikeMap(body.map) || !m || typeof m.tiles !== "object" || typeof m.lift !== "object") return reply(400, { error: "Not something to publish" });
        const mapText = JSON.stringify(body.map); if (mapText.length > MAX_MAP) return reply(413, { error: "That map is too big" });
        /* Every picture it names has to be here, or visitors get holes */
        const { blobs } = await store.list({ prefix: "tile/" }), have = new Set(blobs.map(b => b.key.slice(5)));
        const named = [...Object.values(m.tiles), ...Object.values(m.lift)];
        for (const h of named) if (!HASH.test(String(h)) || !have.has(h)) return reply(400, { error: "A picture is missing: " + h });
        const version = crypto.createHash("sha1").update(mapText + JSON.stringify(m.tiles)).digest("hex").slice(0, 16), publishedAt = new Date().toISOString();
        await store.set("map", mapText);
        await store.set("manifest", JSON.stringify({ version, tile: m.tile || 512, moods: m.moods || [], publishedAt, online: true, tiles: m.tiles, lift: m.lift }));
        /* Pictures nothing names any more go, keeping the store from growing for ever */
        const keep = new Set(named); for (const h of have) if (!keep.has(h)) await store.delete("tile/" + h);
        return reply(200, { published: true, version, publishedAt });
    }
    return reply(400, { error: "No such action" });
};
exports.handler = require("./_errors").withErrorReporting("hallway", exports.handler);

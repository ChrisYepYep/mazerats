/* The hallway editor in the Warren: the editor's own page and code (publish.js makes edit.html from them), with the
   renderer running in this browser (renderer-worker.js) and the site's function standing in for the local server.
   Saving keeps a draft for admins only. Publish draws every square of the map here, sends the new ones to the site,
   and then the live page shows them, straight away, with no deploy. */
(function () {
    "use strict";
    window.HALLWAY_EDIT = true;
    const realFetch = window.fetch.bind(window), FN = "/.netlify/functions/hallway";
    const token = () => { try { return localStorage.getItem("mazerats_admin_token") || ""; } catch (e) { return ""; } };
    const admin = (o = {}) => ({ ...o, headers: { ...(o.headers || {}), "x-admin-token": token(), "Content-Type": "application/json" } });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
    if (!token()) { location.replace("/warren"); return; }

    /* ---------- the renderers ---------- */
    const POOL = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 2)), workers = [], waiting = new Map();
    let nextId = 1, names = [], font = {}, difficulty = {}, started = null;
    const ask = (w, job) => new Promise((res, rej) => {
        const id = nextId++; waiting.set(id, { res, rej, w }); w.busy++; w.postMessage({ ...job, id });
    });
    function startWorkers() {
        if (started) return started;
        started = (async () => {
            try {
                const r = await realFetch("/.netlify/functions/rooms"), j = await r.json(), rooms = j.rooms || (Array.isArray(j) ? j : []);
                names = rooms.filter(q => q && q.name).map(q => String(q.name)).sort((a, c) => a.replace(/[^A-Za-z0-9]/g, "").toLowerCase().localeCompare(c.replace(/[^A-Za-z0-9]/g, "").toLowerCase()));
                for (const q of rooms) if (q && q.name && q.difficulty) difficulty[String(q.name)] = String(q.difficulty).toLowerCase().replace(/\s+/g, "-");
            } catch (e) { names = []; }
            const base = new URL(".", location.href).href;
            for (let i = 0; i < POOL; i++) {
                const w = new Worker("renderer-worker.js"); w.busy = 0; w.maps = new Set();
                w.onmessage = e => { const m = e.data, q = waiting.get(m.id); if (!q) return; waiting.delete(m.id); w.busy--; if (m.error) q.rej(new Error(m.error)); else q.res(m); };
                w.onerror = e => { console.error("renderer", e.message); };
                workers.push(w);
            }
            const answers = await Promise.all(workers.map(w => ask(w, { type: "start", base, names })));
            font = answers[0].font || {};
        })();
        return started;
    }
    const idle = () => workers.reduce((a, w) => (w.busy < a.busy ? w : a), workers[0]);
    const pngOf = (w, h, d) => { const c = new OffscreenCanvas(w, h); c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(d.buffer, d.byteOffset, d.length), w, h), 0, 0); return c.convertToBlob({ type: "image/png" }); };

    /* ---------- what the editor asks its server ---------- */
    const versions = new Map();
    async function sha(text) { const b = await crypto.subtle.digest("SHA-1", typeof text === "string" ? new TextEncoder().encode(text) : text); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 20); }
    let publishing = { running: false, at: 0, of: 0, error: null }, savedText = null;
    window.fetch = async function (url, opts) {
        const u = typeof url === "string" ? url : url.url;
        if (!u.startsWith("/api/")) return realFetch(url, opts);
        const q = new URL(u, location.href), p = q.pathname, method = (opts && opts.method) || "GET";
        if (p === "/api/map" && method === "GET") {
            for (const what of ["draft", "map"]) { const r = await realFetch(`${FN}?what=${what}`, admin()); if (r.ok) { const text = await r.text(); if (text && text !== "null") { savedText = text; return new Response(text, { status: 200 }); } } if (r.status === 401) { location.replace("/warren"); } }
            const r = await realFetch("../map.json", { cache: "no-cache" }); savedText = await r.clone().text(); return r;
        }
        if (p === "/api/map") {
            const r = await realFetch(FN, admin({ method: "POST", body: JSON.stringify({ action: "draft", map: JSON.parse(opts.body) }) }));
            if (r.ok) savedText = opts.body;
            return r;
        }
        if (p === "/api/names") { await startWorkers(); return json({ names, from: "live list", font, difficulty }); }
        if (p === "/api/art") return json({ at: 0 });
        if (p === "/api/version") {
            await startWorkers();
            const o = JSON.parse(opts.body), text = JSON.stringify(o.map), v = await sha(text + (o.liftOpen ? "1" : "0") + JSON.stringify(o.cut || 0));
            if (!versions.has(v)) { versions.set(v, { text, liftOpen: !!o.liftOpen, cut: o.cut || null }); while (versions.size > 14) versions.delete(versions.keys().next().value); }
            return json({ v, report: {}, tile: 512 });
        }
        if (p === "/api/tile") {
            await startWorkers();
            const v = q.searchParams.get("v"), ver = versions.get(v); if (!ver) return new Response("", { status: 404 });
            const m = q.searchParams.get("m") || undefined, tx = Number(q.searchParams.get("tx")), ty = Number(q.searchParams.get("ty")), w = idle();
            if (opts && opts.signal && opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
            if (!w.maps.has(v)) { w.maps.add(v); await ask(w, { type: "map", v, text: ver.text }); }
            const a = await ask(w, { type: "tile", v, x: tx * 512, y: ty * 512, w: 512, h: 512, light: m, liftOpen: ver.liftOpen, cut: ver.cut, names });
            if (a.needMap) { w.maps.delete(v); return new Response("", { status: 503 }); }
            return new Response(await pngOf(a.w, a.h, a.d), { status: 200, headers: { "Content-Type": "image/png" } });
        }
        if (p === "/api/lift") { await startWorkers(); const a = await ask(idle(), { type: "lift", way: q.searchParams.get("way") || "oxblood", slide: Number(q.searchParams.get("slide")) || 0 }); return new Response(await pngOf(a.w, a.h, a.d)); }
        if (p === "/api/sign") { await startWorkers(); const a = await ask(idle(), { type: "sign", q: Object.fromEntries(q.searchParams) }); return new Response(await pngOf(a.w, a.h, a.d)); }
        if (p === "/api/publish") {
            if (method === "GET") return json(publishing);
            if (publishing.running) return json({ error: "Already publishing." }, 409);
            publish();
            return json(publishing);
        }
        return new Response("", { status: 404 });
    };
    /* Pictures the editor gives an address to: asked for the same way */
    window.hallwayApiImage = (img, url) => { window.fetch(url).then(r => r.blob()).then(b => { const was = img.src; img.src = URL.createObjectURL(b); if (was.startsWith("blob:")) URL.revokeObjectURL(was); }).catch(() => {}); };

    /* ---------- Publish: draw it all here, send what's new, then say so ---------- */
    const MOODS = ["day", "dusk", "night", "dawn"];
    async function publish() {
        publishing = { running: true, at: 0, of: 0, error: null };
        try {
            await startWorkers();
            if (!savedText) throw new Error("Save it first");
            const map = JSON.parse(savedText);
            const ways = [...new Set(map.levels.map(l => l.colour ? "hex:" + l.colour : l.way))];
            const known = new Set(((await (await realFetch(`${FN}?what=known`, admin())).json()).known) || []);
            publishing.of = MOODS.length + ways.length + 1;
            const tiles = {}, lift = {};
            const send = async (blob) => {
                const buf = await blob.arrayBuffer(), hash = await sha(buf);
                if (!known.has(hash)) {
                    let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
                    const r = await realFetch(FN, admin({ method: "POST", body: JSON.stringify({ action: "tile", hash, png: btoa(s) }) }));
                    if (!r.ok) throw new Error("A picture wouldn't send: " + r.status);
                    known.add(hash);
                }
                return hash;
            };
            /* One time of day per thread at once: it's a lot of drawing */
            let i = 0;
            await Promise.all(workers.slice(0, MOODS.length).map(async w => {
                while (i < MOODS.length) {
                    const light = MOODS[i++], a = await ask(w, { type: "mood", text: savedText, light, names });
                    for (const t of a.tiles) tiles[light + "|" + t.tx + "," + t.ty] = await send(await pngOf(512, 512, t.d));
                    publishing.at++;
                }
            }));
            for (const way of ways) {
                for (let f = 0; f < 6; f++) { const a = await ask(idle(), { type: "lift", way, slide: f / 5 }); lift[encodeURIComponent(way).replace(/%/g, "_") + "-" + f + ".png"] = await send(await pngOf(a.w, a.h, a.d)); }
                publishing.at++;
            }
            const r = await realFetch(FN, admin({ method: "POST", body: JSON.stringify({ action: "publish", map, manifest: { tile: 512, moods: MOODS, tiles, lift } }) }));
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "The site wouldn't take it: " + r.status);
            publishing = { running: false, at: 0, of: 0, error: null };
        } catch (e) { console.error(e); publishing = { running: false, at: 0, of: 0, error: e.message || "It stopped." }; }
    }
})();

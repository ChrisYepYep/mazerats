/* What the renderer in a browser is asked to do: the same as render/worker.js and the local server's /api/lift and /api/sign. */
let W = null, ready = null;
const maps = new Map();
const TILE = 512;
const isBlank = d => { for (let i = 0; i < d.length; i += 4) if ((d[i] || d[i + 1] || d[i + 2]) && !(d[i] === 7 && d[i + 1] === 6 && d[i + 2] === 10)) return false; return true; };
const solidCopy = d => { const o = new Uint8Array(d.length); o.set(d); for (let i = 0; i < o.length; i += 4) { if (o[i] === 7 && o[i + 1] === 6 && o[i + 2] === 10) o[i] = o[i + 1] = o[i + 2] = 0; o[i + 3] = 255; } return o; };
function lift(way, slide) {
    const bw = 180, bh = 200, ax = 40, ay = 160, b = new W.Buf(bw, bh);
    for (let i = 0; i < b.d.length; i += 4) { b.d[i] = 255; b.d[i + 1] = 0; b.d[i + 2] = 255; b.d[i + 3] = 255; }
    const fake = { b, z: 0, ox: ax, oy: ay, lamps: [], sprites: [], S(x, y) { return [Math.round((x - y) * 16) + ax, Math.round((x + y) * 8) + ay]; }, WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; } };
    W.lift(fake, 0, 0, slide >= 1 ? { open: true } : { slide });
    W.recolour(b, way, [0, 0, bw, bh]);
    for (let i = 0; i < b.d.length; i += 4) if (b.d[i] === 255 && b.d[i + 1] === 0 && b.d[i + 2] === 255) b.d[i + 3] = 0;
    return { w: bw, h: bh, d: b.d };
}
function sign(q) {
    const sw = Number(q.w) || 0, sh = Number(q.h) || 0, name = q.name || "", bw = Math.max(sw, 240) + 40, bh = (bw >> 1) + Math.max(sh, 100) + 60, cx = bw >> 1, cy = bh - (bw >> 2) - 20, b = new W.Buf(bw, bh);
    for (let i = 0; i < b.d.length; i += 4) { b.d[i] = 255; b.d[i + 1] = 0; b.d[i + 2] = 255; b.d[i + 3] = 255; }
    if (q.stair) W.stairPlaque(b, cx, cy, name);
    else W.signIso(b, cx, cy, name, { alongY: q.y === "1", max: 14, w: sw || undefined, h: sh || undefined, way: q.way });
    for (let i = 0; i < b.d.length; i += 4) { if (b.d[i + 1] !== 0 || b.d[i] !== b.d[i + 2]) continue; if (b.d[i] === 255) b.d[i + 3] = 0; else { b.d[i] = 0; b.d[i + 2] = 0; b.d[i + 3] = 115; } }
    return { w: bw, h: bh, d: b.d, cx, cy };
}
const send = (id, o, buf) => postMessage({ id, ...o }, buf || []);
onmessage = async e => {
    const job = e.data;
    try {
        if (job.type === "start") {
            mazeList = job.names.map(n => "x\t" + n).join("\n");
            /* the art from the page when another thread has loaded it already, or fetched here; wantArt: send it back, for the others */
            if (!ready) ready = (job.art ? Promise.resolve(artIn(job.art)) : loadArt(job.base)).then(() => { W = requireFrom(ROOT)("hw3.js"); });
            await ready;
            const font = {}; for (const ch in W.H.VOL.vb) font[ch] = W.H.VOL.vb[ch].w;
            return send(job.id, job.wantArt ? { font, art: artOut() } : { font });
        }
        await ready;
        if (job.type === "report") { let report; try { report = W.fromMap(JSON.parse(job.text), job.names).report; } catch (err) { report = { error: String(err && err.message || err) }; } return send(job.id, { report }); }
        if (job.type === "map") { maps.set(job.v, JSON.parse(job.text)); while (maps.size > 4) maps.delete(maps.keys().next().value); return send(job.id, { ok: true }); }
        if (job.type === "tile") {
            const map = maps.get(job.v); if (!map) return send(job.id, { needMap: true });
            const { x, y, w, h } = job, cx = x + w / 2, cy = y + h / 2, MX = (cx + 2 * cy) / 32, MY = (2 * cy - cx) / 32;
            const pad = job.pad || 0, world = W.build({ map, names: job.names, liftOpen: job.liftOpen, cut: job.cut, light: job.light, clip: [MX, MY, 0, w + 2 * pad, h + 2 * pad] });      // pad: what stands just outside the square still gets its say on the square
            const c = world.at(MX, MY, 0), crop = world.b.crop(c[0] - w / 2, c[1] - h / 2, w, h), d = new Uint8Array(crop.d);
            return send(job.id, { w, h, d }, [d.buffer]);
        }
        /* A whole time of day, for publishing: every square with anything on it */
        if (job.type === "mood") {
            const world = W.build({ map: JSON.parse(job.text), names: job.names, light: job.light }), b = world.b, o = world.at(0, 0, 0), out = [];
            const tx0 = Math.floor(-o[0] / TILE), ty0 = Math.floor(-o[1] / TILE), tx1 = Math.ceil((b.w - o[0]) / TILE), ty1 = Math.ceil((b.h - o[1]) / TILE);
            for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
                const v = b.crop(o[0] + tx * TILE, o[1] + ty * TILE, TILE, TILE); if (isBlank(v.d)) continue;
                out.push({ tx, ty, d: solidCopy(v.d) });
            }
            return send(job.id, { tiles: out }, out.map(t => t.d.buffer));
        }
        if (job.type === "lift" || job.type === "sign") {
            const r = job.type === "lift" ? lift(job.way, job.slide) : sign(job.q), d = new Uint8Array(r.d);
            return send(job.id, { w: r.w, h: r.h, d, cx: r.cx, cy: r.cy }, [d.buffer]);
        }
        throw new Error("No such job: " + job.type);
    } catch (err) { send(job.id, { error: String(err && err.stack || err) }); }
};

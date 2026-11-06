/* The maze rooms: one small room floating in the dark, drawn live in the page from art/rooms/, walked as in the hallway, its
   ledger and albums opened by walking up to them. Used by the walk, by the Warren's editor and by the site's page. A room is
     { w, h, floor: "slate" | "wood", items: [...] }
   and a maze, what makes it this maze's: its name, its pictures and write-up. Nothing here is pre-drawn per maze, so an edit in
   the archive shows the next time you come in. */
(function () {
    "use strict";
    const ART = "art/rooms/", WALL_H = 112, SLAB = 12;
    const BOOK_ROTA = ["oxblood", "navy", "plum", "ochre", "teal", "green", "black"];
    let index = null, ready = null;
    const imgs = new Map();
    const img = n => { let i = imgs.get(n); if (!i) { i = new Image(); i.onload = () => RoomView.onArt && RoomView.onArt(); i.src = ART + n + ".png"; imgs.set(n, i); } return i; };
    const load = () => ready || (ready = fetch(ART + "index.json").then(r => r.json()).then(async j => {
        index = j;
        const names = [...Object.keys(j.sprites), "lamp", "lampglow", "rug-round", "slate", "window-l", "window-r"];
        for (const i of [1, 2, 3, 4, 5, 6, 19, 20, 21, 22, 23, 24, 25, 26, 27]) names.push("shelf" + i);
        RoomView.regs = await fetch("art/regs.json").then(q => q.json()).catch(() => null);
        await Promise.all(names.map(n => new Promise(res => { const i = img(n); if (i.complete && i.naturalWidth) res(); else { i.addEventListener("load", res, { once: true }); i.addEventListener("error", res, { once: true }); } })));
        slate = (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 32; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img("slate"), 0, 0); return x.getImageData(0, 0, 64, 32).data; })();
    }));
    let slate = null;

    /* ---------- the shell: floor, slab and walls, pixel for pixel, kept for each size and floor ---------- */
    const mod = (a, n) => ((a % n) + n) % n;
    const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
    function stoneAt(u, up) {
        const row = Math.floor(up / 9), j = mod(up, 9), uu = u + (row % 2 ? 9 : 0), n = Math.floor(uu / 18), i = mod(uu, 18);
        const t = (hash(n, row) % 9) - 4;
        if (j === 8 || i === 0) return [86, 101, 94];
        if (j === 7 || i === 1) return [41, 50, 47];
        const d = j === 0 && hash(n + 3, row) % 3 === 0 ? 5 : 0;
        return [62 + t - d, 75 + t - d, 71 + t - d];
    }
    const PLANK = [[52, 28, 22], [46, 24, 19], [58, 31, 24], [49, 26, 20], [43, 22, 18]];
    function plankAt(u, v) {
        const row = Math.floor(v * 2), off = mod(row, 2) ? 1.5 : 0, along = (u + off) / 3, n = Math.floor(along), fv = v * 2 - row, fu = along - n;
        if (fv < .09 || fu < .018) return [24, 12, 9];
        const t = PLANK[mod(n * 7 + row * 3, 5)], g = mod(Math.floor(u * 16) * 13 + row * 5, 11) === 0 ? -4 : 0;
        return [t[0] + g, t[1] + g, t[2] + g];
    }
    function slateAt(u, v) {
        const a = mod(u, 2), b = mod(v, 2), x = mod(Math.floor((a - b) * 16) + 32, 64), y = mod(Math.floor((a + b) * 8) + 16, 32), p = (y * 64 + x) * 4;
        return slate ? [slate[p], slate[p + 1], slate[p + 2]] : [70, 72, 72];
    }
    const floorAt = kind => kind === "wood" ? plankAt : slateAt;
    /* Screen place of a point on the floor, in a room's own picture */
    const MARGIN = 8;
    const originOf = r => ({ ox: r.h * 16 + MARGIN, oy: WALL_H + MARGIN + 24 });
    const sizeOf = r => ({ w: (r.w + r.h) * 16 + MARGIN * 2, h: WALL_H + (r.w + r.h) * 8 + SLAB + MARGIN * 2 + 24 });
    const scr = (r, x, y, z) => { const o = originOf(r); return [o.ox + Math.round((x - y) * 16), o.oy + Math.round((x + y) * 8 - (z || 0))]; };
    const shells = new Map();
    function shell(r) {
        const key = r.w + "x" + r.h + r.floor; let c = shells.get(key); if (c) return c;
        const s = sizeOf(r), o = originOf(r); c = document.createElement("canvas"); c.width = s.w; c.height = s.h;
        const x = c.getContext("2d"), im = x.createImageData(s.w, s.h), d = im.data, floor = floorAt(r.floor);
        const set = (X, Y, col) => { if (X < 0 || Y < 0 || X >= s.w || Y >= s.h) return; const p = (Y * s.w + X) * 4; d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255; };
        const has = (u, v) => u >= 0 && v >= 0 && u < r.w && v < r.h;
        for (let Y = 0; Y < s.h; Y++) for (let X = 0; X < s.w; X++) {
            const dx = (X + .5 - o.ox) / 16, dy = (Y + .5 - o.oy) / 8, u = (dx + dy) / 2, v = (dy - dx) / 2;
            if (has(u, v)) { set(X, Y, floor(u, v)); continue; }
            for (let k = 1; k <= SLAB; k++) {
                const d2 = (Y - k + .5 - o.oy) / 8, u2 = (dx + d2) / 2, v2 = (d2 - dx) / 2;
                if (has(u2, v2)) { const t = k === 1 ? 92 : k === 2 ? 66 : 40, right = dx > (r.w - r.h) / 2; set(X, Y, right ? [t * .62, t * .6, t * .6] : [t, t * .96, t * .94]); break; }
            }
        }
        const wallPx = (face, u, up, X, Y) => {
            let c0 = stoneAt(u, up); const k = face === "r" ? .74 : 1; c0 = [c0[0] * k, c0[1] * k, c0[2] * k];
            if (up < 2) c0 = [20, 16, 15]; else if (up < 7) c0 = [46, 42, 40]; else if (up < 8) c0 = [28, 24, 22];
            if (up >= WALL_H - 3) c0 = up >= WALL_H - 1 ? [120, 116, 108] : [86, 82, 76];
            set(X, Y, c0);
        };
        for (let i = 0; i < r.h * 16; i++) { const X = o.ox - 1 - i, b = o.oy + Math.floor((i + 1) / 2); for (let up = 0; up < WALL_H; up++) wallPx("l", r.h * 16 - i, up, X, b - up); }
        for (let i = 0; i < r.w * 16; i++) { const X = o.ox + i, b = o.oy + Math.floor((i + 1) / 2); for (let up = 0; up < WALL_H; up++) wallPx("r", i, up, X, b - up); }
        const eL = scr(r, 0, r.h), eR = scr(r, r.w, 0);
        for (let k = 0; k < 6; k++) { for (let up = 0; up < WALL_H; up++) { set(eL[0] - 1 - k, eL[1] + (k >> 1) - up, [30, 30, 30]); set(eR[0] + k, eR[1] - (k >> 1) + 1 - up, [24, 24, 24]); } set(eL[0] - 1 - k, eL[1] + (k >> 1) - WALL_H, [130, 126, 118]); set(eR[0] + k, eR[1] - (k >> 1) + 1 - WALL_H, [120, 116, 108]); }
        x.putImageData(im, 0, 0); shells.set(key, c); return c;
    }

    /* ---------- what's where ---------- */
    const FURNI = { globe: "globe", chair4: "chair4", chair6: "chair6", stool: "stool", crate: "crate", barrel: "barrel", cupboard: "cupboard", candelabra: "candelabra" };
    const isWall = it => it.k === "frame" || it.k === "window" || it.k === "painting" || it.k === "sconce";
    const isRug = it => it.k === "rug" || it.k === "rugRound";
    const Parts = () => window.FurniParts;
    const hallPiece = it => ({ k: it.p, x: it.x, y: it.y, rot: it.rot, len: it.len });
    function footprint(it) {
        if (it.k === "hall") { const t = Parts().tiles(hallPiece(it)), xs = t.map(q => q[0]), ys = t.map(q => q[1]), x0 = Math.min(...xs), y0 = Math.min(...ys); return [x0, y0, Math.max(...xs) - x0 + 1, Math.max(...ys) - y0 + 1]; }
        if (it.k === "shelf") return it.axis === "y" ? [it.x, it.y, 1, it.n] : [it.x, it.y, it.n, 1];
        if (it.k === "album" || it.k === "ledger") return [it.x, it.y, 2, 2];
        if (it.k === "lamp") return [it.x, it.y, 1, 1];
        const s = index && index.sprites[FURNI[it.k]]; if (s) return it.flip ? [it.x, it.y, s.fy, s.fx] : [it.x, it.y, s.fx, s.fy];
        return null;
    }
    const inFoot = (f, x, y) => f && x >= f[0] && y >= f[1] && x < f[0] + f[2] && y < f[1] + f[3];
    /* You come in and go out over the middle two tiles of a near edge, whichever faces the hallway door you used */
    const exitTiles = (r, edge) => { if (edge === "y") { const a = (r.w >> 1) - 1; return [[a, r.h - 1], [a + 1, r.h - 1]]; } const a = (r.h >> 1) - 1; return [[r.w - 1, a], [r.w - 1, a + 1]]; };
    /* the arrow's 2x2: the two you leave by, and the two inside them. Nothing may stand on it */
    const arrowTiles = (r, edge) => { const e = exitTiles(r, edge); return edge === "y" ? [...e, [e[0][0], e[0][1] - 1], [e[1][0], e[1][1] - 1]] : [...e, [e[0][0] - 1, e[0][1]], [e[1][0] - 1, e[1][1]]]; };
    const solidSet = r => { const s = new Set(); for (const it of r.items) { if (isWall(it) || isRug(it)) continue; const f = footprint(it); if (f) for (let x = f[0]; x < f[0] + f[2]; x++) for (let y = f[1]; y < f[1] + f[3]; y++) s.add(x + "," + y); } return s; };

    /* ---------- a maze's own things ---------- */
    const SITE = (window.HALLWAY_PLAY || window.HALLWAY_EDIT) ? "" : "https://mazerats.net";
    const picUrl = u => { if (!u) return null; if (/^https?:/.test(u)) return u; const p = u.startsWith("/") ? u : "/" + u.split("/").map(encodeURIComponent).join("/"); return SITE + p; };
    function mazeFacts(m) {
        const g = (m.gallery || []).filter(p => p && p.image && !p.oldVersion);
        const seen = new Set(), wall = [];
        const add = (p, label) => { if (p && p.image && !seen.has(p.image)) { seen.add(p.image); wall.push({ url: picUrl(p.image), label: p.label || label || "" }); } };
        add(m.entrance, "The entrance"); const ent = wall[0] || null; add(m.finish, "The finish"); const fin = m.finish && m.finish.image ? wall[wall.length - 1] : null;
        const all = [...g.map(p => ({ url: picUrl(p.image), label: p.label || "" })), ...(m.relatedImages || []).filter(p => p && p.image).map(p => ({ url: picUrl(p.image), label: p.label || "Related" }))];
        const rest = all.filter(p => !wall.some(w => w.url === p.url));
        /* wall slots: 0 the entrance, 1 the finish, then the gallery. Mazes without one fall back on the next picture */
        const slots = []; slots[0] = ent || rest[0] || null; slots[1] = fin || (ent ? rest[0] : rest[1]) || null; const used = new Set(slots.filter(Boolean).map(p => p.url)); let n = 2; for (const p of rest) if (!used.has(p.url)) slots[n++] = p;
        return { name: String(m.name || "").trim(), m, slots, pictures: [...wall.filter(w => !all.some(a => a.url === w.url)), ...all] };
    }
    const wallPics = new Map();
    function wallPic(url) { let i = wallPics.get(url); if (!i) { i = new Image(); i.onload = () => RoomView.onArt && RoomView.onArt(); i.src = url; wallPics.set(url, i); } return i; }
    /* The albums a maze needs: a stretch of pictures to each table it has */
    function albumsOf(r, facts) {
        const tables = r.items.filter(it => it.k === "album"); if (!facts || !tables.length) return new Map();
        const pics = facts.pictures, wanted = Math.min(tables.length, Math.max(1, Math.ceil(pics.length / 25))), each = Math.ceil(pics.length / wanted) || 1, out = new Map();
        for (let i = 0; i < wanted; i++) out.set(tables[i], { n: i, from: i * each, pics: pics.slice(i * each, (i + 1) * each), colour: BOOK_ROTA[(hash(facts.name.length, i) + i) % BOOK_ROTA.length] });
        return out;
    }

    /* ---------- drawing ---------- */
    function mirrored(ctx, im, x, y, flip) { if (!flip) { ctx.drawImage(im, x, y); return; } ctx.save(); ctx.translate(x + im.naturalWidth, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0); ctx.restore(); }
    /* a turned piece is the client's own mirrored about its tile, as the game does it */
    function spriteAt(ctx, name, r, x, y, z, flip) { const s = index.sprites[name], p = scr(r, x, y, z || 0), ax = flip ? s.w - s.ax - 32 : s.ax; mirrored(ctx, img(name), p[0] - 16 - ax, p[1] + 8 - s.ay, flip); }
    const hallImgs = new Map();
    const hallImg = n => { let i = hallImgs.get(n); if (!i) { i = new Image(); i.onload = () => RoomView.onArt && RoomView.onArt(); i.src = n; hallImgs.set(n, i); } return i; };
    const TALL_BY = 64;
    function drawHall(ctx, r, it) {
        if (it.p === "lamp") { const m = scr(r, it.x + .5, it.y + .5), i = hallImg("art/lamp-" + (it.style || "hotel") + ".png"); if (i.complete && i.naturalWidth) ctx.drawImage(i, m[0] - 40, m[1] - 96); return; }
        const regs = RoomView.regs; if (!regs) return;
        const list = Parts().parts(hallPiece(it)).sort((a, b) => (a.x + a.y) - (b.x + b.y));
        for (const q of list) for (const n of q.names) {
            const reg = regs.hall[n], i = hallImg("art/hall/hh_room_hallway/" + n + ".png"); if (!reg || !i.complete || !i.naturalWidth) continue;
            const a = scr(r, q.x, q.y), lx = a[0] - 16, ly = a[1] + 8, x0 = q.flip ? lx + 32 + reg[0] - i.naturalWidth : lx - reg[0], y0 = ly - reg[1];
            if (it.p === "pillartall") { const m = i.naturalHeight >> 1; ctx.drawImage(i, 0, 0, i.naturalWidth, m, x0, y0 - TALL_BY, i.naturalWidth, m); ctx.drawImage(i, 0, m, i.naturalWidth, 1, x0, y0 - TALL_BY + m, i.naturalWidth, TALL_BY); ctx.drawImage(i, 0, m, i.naturalWidth, i.naturalHeight - m, x0, y0 + m, i.naturalWidth, i.naturalHeight - m); continue; }
            mirrored(ctx, i, x0, y0, q.flip);
        }
    }
    function drawItem(ctx, r, it, albums) {
        if (it.z) { ctx.save(); ctx.translate(0, -it.z); drawFloorThing(ctx, r, it, albums); ctx.restore(); return; }
        drawFloorThing(ctx, r, it, albums);
    }
    function drawFloorThing(ctx, r, it, albums) {
        if (it.k === "hall") return drawHall(ctx, r, it);
        if (it.k === "shelf") {
            for (let i = 0; i < it.n; i++) {
                if (it.axis === "x") { const k = i === 0 ? 1 : i === it.n - 1 ? 6 : 2 + ((i - 1) % 4), s = scr(r, it.x + i, it.y); ctx.drawImage(img("shelf" + k), s[0] - 16, s[1] + 16 - 74); }
                else { const k = i === 0 ? 27 : i === it.n - 1 ? 19 : 26 - ((i - 1) % 7), s = scr(r, it.x, it.y + i); ctx.drawImage(img("shelf" + k), s[0] - 16 + (k === 19 ? -2 : 0), s[1] + 16 - 74); }
            }
            return;
        }
        if (it.k === "album" || it.k === "ledger") {
            spriteAt(ctx, "table", r, it.x, it.y, 0, it.flip);
            const a = albums && albums.get(it), book = it.k === "ledger" ? "ledger" : a ? "book-" + a.colour : albums ? null : "book-oxblood";
            if (book) { const sp = index.sprites[book], c = scr(r, it.x + 1, it.y + 1); mirrored(ctx, img(book), c[0] - (sp.w >> 1), c[1] - 13 - (sp.h >> 1) - 2, it.flip); }
            return;
        }
        if (it.k === "lamp") { const s = scr(r, it.x + .5, it.y + .5); ctx.drawImage(img("lamp"), s[0] - 7, s[1] - 40); return; }
        if (FURNI[it.k]) spriteAt(ctx, FURNI[it.k], r, it.x, it.y, 0, it.flip);
    }
    function lampGlows(ctx, r) { for (const it of r.items) if (it.k === "lamp") { const s = scr(r, it.x + .5, it.y + .5, it.z || 0); ctx.globalCompositeOperation = "lighter"; ctx.drawImage(img("lampglow"), s[0] - 32, s[1] - 61); ctx.globalCompositeOperation = "source-over"; } }
    function drawRugs(ctx, r) {
        for (const it of r.items) {
            if (it.k === "rugRound") { const s = scr(r, it.x + .5, it.y + .5); ctx.drawImage(img("rug-round"), s[0] - 53, s[1] - 27); continue; }
            if (it.k !== "rug") continue;
            const W = it.w, H = it.h, band = (d, col) => { const a = scr(r, it.x + d, it.y + d), b = scr(r, it.x + W - d, it.y + d), c = scr(r, it.x + W - d, it.y + H - d), e = scr(r, it.x + d, it.y + H - d); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill(); };
            band(0, "#400a0c"); band(.06, "#b08434"); band(.13, "#601012"); band(.28, "#b08434"); band(.34, "#7a1618");
        }
    }
    /* a picture on the wall stays a photograph: smooth, on the wall's own slant */
    const FRAME = 3;
    function drawFrame(ctx, r, it, facts, zoomNow) {
        const c = it.wall === "l" ? scr(r, 0, it.at) : scr(r, it.at, 0), W = it.w + FRAME * 2, Hh = it.h + FRAME * 2, sl = it.wall === "l" ? -.5 : .5;
        const entry = facts ? facts.slots[it.slot] : { none: true }; if (facts && !entry) return;
        ctx.save(); ctx.transform(1, sl, 0, 1, c[0] - W / 2, c[1] - it.up - Hh);
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(2, 2, W, Hh);
        ctx.fillStyle = "#1e1008"; ctx.fillRect(0, 0, W, Hh); ctx.fillStyle = "#3a2212"; ctx.fillRect(1, 1, W - 2, Hh - 2); ctx.fillStyle = "#bc9448"; ctx.fillRect(FRAME - 1, FRAME - 1, it.w + 2, it.h + 2); ctx.fillStyle = "#0b0a08"; ctx.fillRect(FRAME, FRAME, it.w, it.h);
        if (entry && entry.url) { const i = wallPic(entry.url); if (i.complete && i.naturalWidth) { const ar = it.w / it.h, sar = i.naturalWidth / i.naturalHeight, cw = sar > ar ? i.naturalHeight * ar : i.naturalWidth, ch = sar > ar ? i.naturalHeight : i.naturalWidth / ar; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(i, (i.naturalWidth - cw) / 2, (i.naturalHeight - ch) / 2, cw, ch, FRAME, FRAME, it.w, it.h); ctx.imageSmoothingEnabled = false; } }
        ctx.fillStyle = "#b08c46"; ctx.fillRect(W / 2 - 8, Hh + 2, 16, 3);
        ctx.restore();
    }
    function drawWallThing(ctx, r, it, facts, zoomNow) {
        if (it.k === "frame") return drawFrame(ctx, r, it, facts, zoomNow);
        const c = it.wall === "l" ? scr(r, 0, it.at) : scr(r, it.at, 0);
        if (it.k === "window") { const i = img("window-" + it.wall), w = index.window; ctx.drawImage(i, c[0] - (w.w >> 1), c[1] - 100); }
        if (it.k === "sconce") { const i = hallImg((it.style === "globe" ? "art/sconce-globe-" : "art/sconce-") + (it.wall === "r" ? "x" : "y") + ".png"); if (i.complete && i.naturalWidth) ctx.drawImage(i, c[0] - 20, c[1] - it.up - 25); }
        if (it.k === "painting") {
            const def = (window.WALL_ITEMS || []).find(q => q.id === it.id), box = def && (it.wall === "r" ? def.x : def.y); if (!box) return;
            for (const L of box.layers) { const i = hallImg("art/wall/" + L.f); if (i.complete && i.naturalWidth) mirrored(ctx, i, c[0] + L.x, c[1] - it.up + L.y, !!L.flip); }
        }
    }
    /* The dim of the room and its pools of light, one layer over everything but the lamps' own glow */
    const lightMaps = new Map();
    function lightMap(r) {
        const key = JSON.stringify([r.w, r.h, r.items.filter(i => i.k === "lamp" || i.k === "window" || i.k === "sconce" || (i.k === "hall" && i.p === "lamp")).map(i => [i.k, i.x, i.y, i.wall, i.at, i.up])]); let c = lightMaps.get(key); if (c) return c;
        if (lightMaps.size > 24) lightMaps.clear();
        const s = sizeOf(r); c = document.createElement("canvas"); c.width = s.w; c.height = s.h; const x = c.getContext("2d");
        x.fillStyle = "rgb(168,168,162)"; x.fillRect(0, 0, s.w, s.h); x.globalCompositeOperation = "lighter";
        const glow = (X, Y, R, col) => { x.save(); x.translate(X, Y); x.scale(1, .6); const g = x.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(-R, -R, R * 2, R * 2); x.restore(); };
        const mid = scr(r, r.w / 2, r.h / 2); glow(mid[0], mid[1], Math.max(r.w, r.h) * 22, "rgba(58,50,36,1)");
        for (const it of r.items) { if (it.k === "sconce") { const p = it.wall === "l" ? scr(r, .6, it.at) : scr(r, it.at, .6); glow(p[0], p[1], 60, "rgba(90,78,56,1)"); } if (it.k === "lamp" || (it.k === "hall" && it.p === "lamp")) { const p = scr(r, it.x + .5, it.y + .5); glow(p[0], p[1] - 6, 90, "rgba(96,84,60,1)"); } if (it.k === "window") { const p = it.wall === "l" ? scr(r, 1.6, it.at + 1) : scr(r, it.at + 1, 1.6); glow(p[0], p[1], 64, "rgba(30,62,56,1)"); } }
        lightMaps.set(key, c); return c;
    }
    const AVATAR = n => { const k = window.hallwayAvatarSrc ? window.hallwayAvatarSrc(n) : "art/av/" + n + ".png"; let i = imgs.get(k); if (!i) { i = new Image(); i.onload = () => RoomView.onArt && RoomView.onArt(); i.src = k; imgs.set(k, i); } return i; };
    /* behind-first: a thing is behind another when it ends before the other starts, on either axis */
    function ordered(list) {
        const n = list.length, after = list.map(() => []), need = new Array(n).fill(0);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (i === j) continue; const a = list[i].f, b = list[j].f; const za = (list[i].it && list[i].it.z) || 0, zb = (list[j].it && list[j].it.z) || 0, overlap = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; if (overlap ? za < zb : (a[0] + a[2] <= b[0] || a[1] + a[3] <= b[1]) && !(b[0] + b[2] <= a[0] || b[1] + b[3] <= a[1])) { after[i].push(j); need[j]++; } }
        const out = [], done = new Array(n).fill(false);
        for (let k = 0; k < n; k++) {
            let best = -1, key = 1e9; for (let i = 0; i < n; i++) if (!done[i] && need[i] === 0 && list[i].f[0] + list[i].f[1] < key) { best = i; key = list[i].f[0] + list[i].f[1]; }
            if (best < 0) for (let i = 0; i < n; i++) if (!done[i] && list[i].f[0] + list[i].f[1] < key) { best = i; key = list[i].f[0] + list[i].f[1]; }
            done[best] = true; out.push(list[best]); for (const j of after[best]) need[j]--;
        }
        return out;
    }
    /* One big arrow across the 2x2 tiles of the way out, painted into the floor as the Infobus's is: a solid block, the floor's own
       colour darkened, with a darker line round it. Pixel by pixel, on the slant, so its edges stay crisp. */
    const arrowPics = new Map();
    function arrowPicture(r, edge) {
        const key = r.w + "x" + r.h + edge; let c = arrowPics.get(key); if (c) return c;
        const s0 = sizeOf(r), o = originOf(r), ts = arrowTiles(r, edge), x0 = Math.min(...ts.map(t => t[0])), y0 = Math.min(...ts.map(t => t[1]));
        /* across: 0 to 2 over the two tiles' width. out: 0 to 2 towards the edge */
        const inside = (X, Y) => {
            const dx = (X + .5 - o.ox) / 16, dy = (Y + .5 - o.oy) / 8, u = (dx + dy) / 2 - x0, v = (dy - dx) / 2 - y0, across = edge === "y" ? u : v, out = edge === "y" ? v : u;
            if (across < 0 || across > 2 || out < 0 || out > 2) return false;
            const side = Math.abs(across - 1);
            if (out < .95) return out > .12 && side < .42;      // the stem
            return out < 1.9 && side < .86 * (1.9 - out) / .95;  // the head
        };
        c = document.createElement("canvas"); c.width = s0.w; c.height = s0.h; const g = c.getContext("2d");
        for (let Y = 0; Y < s0.h; Y++) for (let X = 0; X < s0.w; X++) {
            if (!inside(X, Y)) continue;
            const line = !inside(X - 1, Y) || !inside(X + 1, Y) || !inside(X, Y - 1) || !inside(X, Y + 1);
            g.fillStyle = line ? "rgba(0,0,0,.72)" : "rgba(0,0,0,.44)"; g.fillRect(X, Y, 1, 1);
        }
        arrowPics.set(key, c); return c;
    }
    /* Everything, on a canvas sized to the room, at 1:1 */
    function paintRoom(ctx, r, o) {
        o = o || {}; const facts = o.facts || null, albums = facts ? albumsOf(r, facts) : null;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);   // the dark it floats in
        ctx.drawImage(shell(r), 0, 0);
        drawRugs(ctx, r);
        for (const edge of (o.edges || [])) ctx.drawImage(arrowPicture(r, edge), 0, 0);
        if (o.hover) { const q = [scr(r, o.hover[0], o.hover[1]), scr(r, o.hover[0] + 1, o.hover[1]), scr(r, o.hover[0] + 1, o.hover[1] + 1), scr(r, o.hover[0], o.hover[1] + 1)]; ctx.strokeStyle = o.hoverBad ? "rgba(255,110,90,.9)" : "rgba(255,255,255,.85)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(a => ctx.lineTo(a[0], a[1])); ctx.closePath(); ctx.stroke(); }
        for (const it of r.items) if (isWall(it) && it.k === "window") drawWallThing(ctx, r, it, facts);
        for (const it of r.items) if (isWall(it) && it.k !== "window") drawWallThing(ctx, r, it, facts);
        const list = [];
        for (const it of r.items) { if (isWall(it) || isRug(it)) continue; const f = footprint(it); if (f) list.push({ f, it }); }
        const w = o.walker;
        if (w) list.push({ f: [Math.round(w.x), Math.round(w.y), 1, 1], walker: true });
        for (const e of ordered(list)) {
            if (e.walker) {
                const p = scr(r, w.x + .5, w.y + .5), n = w.walking ? `s-${w.dir}-wlk-${((Math.floor(w.frame) % 4) + 4) % 4}` : `s-${w.dir}-std-0`, i = AVATAR(n);
                ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(p[0] - 8, p[1] - 1, 16, 2); ctx.fillRect(p[0] - 5, p[1] - 2, 10, 4);
                if (i.complete && i.naturalWidth) ctx.drawImage(i, p[0] - 16, p[1] - 50);
            } else drawItem(ctx, r, e.it, albums);
            if (o.selected === e.it) { const f = e.f, q = [scr(r, f[0], f[1]), scr(r, f[0] + f[2], f[1]), scr(r, f[0] + f[2], f[1] + f[3]), scr(r, f[0], f[1] + f[3])]; ctx.strokeStyle = "#f2be70"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(a => ctx.lineTo(a[0], a[1])); ctx.closePath(); ctx.stroke(); }
        }
        ctx.globalCompositeOperation = "multiply"; ctx.drawImage(lightMap(r), 0, 0); ctx.globalCompositeOperation = "source-over";
        lampGlows(ctx, r);
    }
    function ghost(ctx, r, it, ok) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = ok ? .72 : .3; if (isWall(it)) drawWallThing(ctx, r, it, null); else if (it.k === "rug" || it.k === "rugRound") drawRugs(ctx, { ...r, items: [it] }); else drawItem(ctx, r, it, null); ctx.restore(); }
    /* Which tile a pixel is on */
    function tileAt(r, X, Y) { const o = originOf(r), dx = (X - o.ox) / 16, dy = (Y - o.oy) / 8, u = (dx + dy) / 2, v = (dy - dx) / 2; return [Math.floor(u), Math.floor(v)]; }
    const HALL_UP = { statue: 90, fountain: 60, pillar: 110, pillartall: 174, plant: 46, shelf: 70, cabinet: 70, water: 50, sofa: 34, table: 24, chair: 36, smtable: 24, ballpost: 34, lamp: 70 };
    /* What a pixel is on, nearest first, furniture by its painted box. Used for walking up to things and by the editor */
    function itemAt(r, X, Y) {
        const hit = it => {
            if (it.k === "frame") { const c = it.wall === "l" ? scr(r, 0, it.at) : scr(r, it.at, 0), u = X - c[0], sl = it.wall === "l" ? -.5 : .5, h = c[1] + u * sl - Y; return Math.abs(u) <= it.w / 2 + FRAME && h >= it.up && h <= it.up + it.h + FRAME * 2; }
            if (it.k === "window") { const c = it.wall === "l" ? scr(r, 0, it.at) : scr(r, it.at, 0), u = X - c[0], h = c[1] + (it.wall === "l" ? -u / 2 : u / 2) - Y; return Math.abs(u) < 12 && h > 16 && h < 100; }
            if (it.k === "painting" || it.k === "sconce") { const c = it.wall === "l" ? scr(r, 0, it.at) : scr(r, it.at, 0), u = X - c[0], h = c[1] + (it.wall === "l" ? -u / 2 : u / 2) - it.up - Y; return it.k === "sconce" ? Math.abs(u) < 12 && Math.abs(h) < 14 : Math.abs(u) < 28 && Math.abs(h) < 32; }
            if (it.k === "rugRound") { const s = scr(r, it.x + .5, it.y + .5), a = (X - s[0]) / 53, b = (Y - s[1]) / 27; return a * a + b * b <= 1; }
            if (it.k === "rug") { const t = tileAt(r, X, Y); return t[0] >= it.x && t[1] >= it.y && t[0] < it.x + it.w && t[1] < it.y + it.h; }
            const f = footprint(it); if (!f) return false;
            const up = it.k === "hall" ? (HALL_UP[it.p] || 30) : it.k === "shelf" ? 58 : it.k === "lamp" ? 40 : it.k === "album" || it.k === "ledger" ? 16 : 28, base = it.z || 0;
            for (let z = 0; z <= up; z += 2) { const t = tileAt(r, X, Y + base + z); if (inFoot(f, t[0], t[1])) return true; }
            return false;
        };
        const stand = r.items.filter(i => !isWall(i) && !isRug(i)).map(it => ({ f: footprint(it), it })).filter(e => e.f);
        for (const e of ordered(stand).reverse()) if (hit(e.it)) return e.it;
        for (const it of r.items) if (isWall(it) && hit(it)) return it;
        for (const it of r.items) if (isRug(it) && hit(it)) return it;
        return null;
    }
    /* A route: straight 10, diagonal 14; corners may be cut past one obstacle, not squeezed between two */
    const STEPS = [[1, -1], [1, 1], [-1, 1], [-1, -1], [0, -1], [1, 0], [0, 1], [-1, 0]];
    const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    function route(r, from, to) {
        const solid = solidSet(r), free = (x, y) => x >= 0 && y >= 0 && x < r.w && y < r.h && !solid.has(x + "," + y), key = (x, y) => x + "," + y;
        const dist = new Map([[key(from[0], from[1]), 0]]), prev = new Map(), open = [[from[0], from[1]]];
        while (open.length) {
            open.sort((a, b) => dist.get(key(a[0], a[1])) - dist.get(key(b[0], b[1])));
            const [x, y] = open.shift(); if (x === to[0] && y === to[1]) break;
            for (const [dx, dy] of STEPS) {
                const nx = x + dx, ny = y + dy; if (!free(nx, ny)) continue; if (dx && dy && !free(x + dx, y) && !free(x, y + dy)) continue;
                const d = dist.get(key(x, y)) + (dx && dy ? 14 : 10);
                if (d < (dist.has(key(nx, ny)) ? dist.get(key(nx, ny)) : 1e9)) { dist.set(key(nx, ny), d); prev.set(key(nx, ny), [x, y]); open.push([nx, ny]); }
            }
        }
        if (!dist.has(key(to[0], to[1]))) return null;
        const out = []; let c = to; while (c[0] !== from[0] || c[1] !== from[1]) { out.unshift(c); c = prev.get(key(c[0], c[1])); }
        return out;
    }
    /* The floor seen through a hallway door as it opens, for the hallway to lay in the doorway */
    function floorPixel(kind, u, v) { return floorAt(kind)(u, v); }

    /* ---------- which room a maze has ---------- */
    function layouts(map) { return (map && map.rooms && map.rooms.layouts) || window.RoomStarter.layouts; }
    function roomFor(map, maze) {
        const facts = mazeFacts(maze), slug = maze.slug || facts.name, a = map && map.rooms && map.rooms.assign && map.rooms.assign[slug], L = layouts(map);
        const size = (a && a.size) || window.RoomStarter.sizeFor(facts.pictures.length), list = L[size], n = a && a.layout !== undefined ? a.layout : hash(hashText(slug), 7) % list.length;
        const [w, h] = size.split("x").map(Number), base = list[n] || list[0];
        return { room: { w, h, floor: base.floor, items: base.items }, facts, size, layout: n };
    }
    const hashText = s => { let h = 0; for (const ch of String(s)) h = Math.imul(h, 31) + ch.charCodeAt(0) | 0; return h >>> 0; };
    let archive = null;
    const mazes = () => archive || (archive = fetch((window.HALLWAY_PLAY || window.HALLWAY_EDIT) ? "/.netlify/functions/rooms" : "/api/archive").then(r => r.json()).then(j => j.rooms || j).catch(() => { archive = null; return []; }));

    /* ---------- the book: what opens when you walk up to the ledger or an album ---------- */
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const PER_SPREAD = 8;
    function clean(t) { return String(t || "").replace(/\*\*/g, "").replace(/<[^>]*>/g, ""); }
    function openBook(host, facts, what, onClose) {
        const back = el("div", "rb-back"), book = el("div", "rb-book"), left = el("div", "rb-page"), right = el("div", "rb-page"); back.setAttribute("role", "dialog"); back.setAttribute("aria-label", what.kind === "ledger" ? "The ledger" : "An album");
        book.append(left, right); back.appendChild(book); const close = el("button", "rb-close", "Close"); close.type = "button"; back.appendChild(close); host.appendChild(back);
        const shut = () => { back.remove(); document.removeEventListener("keydown", key); if (onClose) onClose(); };
        close.addEventListener("click", shut); back.addEventListener("click", e => { if (e.target === back) shut(); });
        const key = e => { if (e.key === "Escape") shut(); if (e.key === "ArrowRight") turn(1); if (e.key === "ArrowLeft") turn(-1); }; document.addEventListener("keydown", key);
        let page = 0, turn = () => { };
        const figure = (p, big) => { const f = el("figure", "rb-pic" + (big ? " big" : "")), i = el("img"); i.src = p.url; i.alt = p.label || ""; i.loading = "lazy"; f.appendChild(i); if (p.label) f.appendChild(el("figcaption", "", p.label)); f.addEventListener("click", () => zoomPic(p)); return f; };
        const zoomPic = p => { const z = el("div", "rb-zoom"), i = el("img"); i.src = p.url; i.alt = p.label || ""; z.appendChild(i); if (p.label) z.appendChild(el("p", "", p.label)); z.addEventListener("click", () => z.remove()); back.appendChild(z); };
        if (what.kind === "picture") { left.remove(); right.remove(); book.classList.add("single"); const p = el("div", "rb-page"); p.appendChild(figure(what.pic, true)); book.appendChild(p); return shut; }
        if (what.kind === "ledger") {
            const m = facts.m, rows = [["Status", m.status], ["Difficulty", String(m.difficulty || "").replace(/-/g, " ")], ["Hotel", m.hotel], ["Archived", m.added], ["Pictures", (m.gallery || []).length], ["Type", (m.tags || []).map(t => String(t).toLowerCase()).join(", ")]];
            left.appendChild(el("h2", "", facts.name)); left.appendChild(el("p", "rb-by", "Built by " + (m.creator || "unknown")));
            const dl = el("dl"); for (const [k, v] of rows) if (v !== undefined && v !== "" && v !== null) { dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", String(v))); } left.appendChild(dl);
            const d = clean(m.details || m.description); if (d) left.appendChild(el("p", "rb-text", d));
            if (m.details && m.description && !clean(m.details).startsWith(clean(m.description).slice(0, 30))) left.insertBefore(el("p", "rb-text rb-lead", clean(m.description)), left.lastChild);
            if (m.entrance && m.entrance.image) right.appendChild(figure({ url: picUrl(m.entrance.image), label: "The entrance" }));
            if (m.finish && m.finish.image) right.appendChild(figure({ url: picUrl(m.finish.image), label: "The finish" }));
            if (!right.children.length && facts.pictures[0]) right.appendChild(figure(facts.pictures[0]));
            return shut;
        }
        const pics = what.album.pics, pages = Math.max(1, Math.ceil(pics.length / PER_SPREAD));
        const foot = (cell, n, prev) => { const b = el("div", "rb-foot"); const g = el("button", "rb-turn", prev ? "< previous" : "next >"); g.type = "button"; g.disabled = prev ? page === 0 : page === pages - 1; g.addEventListener("click", () => turn(prev ? -1 : 1)); b.append(prev ? g : el("span", "", String(n)), prev ? el("span", "", String(n)) : g); cell.appendChild(b); };
        const show = () => {
            left.textContent = ""; right.textContent = ""; const s = pics.slice(page * PER_SPREAD, (page + 1) * PER_SPREAD);
            const first = what.album.from + page * PER_SPREAD + 1, last = what.album.from + page * PER_SPREAD + s.length;
            left.appendChild(el("h2", "rb-album", `Pictures ${first} to ${last}`));
            const a = el("div", "rb-grid"), c = el("div", "rb-grid"); s.slice(0, 4).forEach(p => a.appendChild(figure(p))); s.slice(4).forEach(p => c.appendChild(figure(p))); left.appendChild(a); right.appendChild(c);
            foot(left, page * 2 + 1, true); foot(right, page * 2 + 2, false);
        };
        turn = d => { const n = page + d; if (n >= 0 && n < pages) { page = n; show(); } };
        show();
        return shut;
    }

    /* ---------- walking one room ---------- */
    const MS_PER_TILE = 500, FRAME_MS = 84;
    function enter(host, opts) {
        /* opts: { room, facts, edge, zoom(), onLeave, canLeave } */
        const r = opts.room, facts = opts.facts, edge = opts.edge, c = document.createElement("canvas"); c.className = "room-view"; host.appendChild(c);
        /* whose room this is, in the dark to its left */
        const label = el("div", "room-label"), nameLine = el("div", "", facts.name), ownerLine = el("div", "room-owner", String(facts.m.creator || "")); label.append(nameLine, ownerLine); host.appendChild(label);
        const placeLabel = v => { const room = v.x, room2 = v.y + s0h(v) / 2, roomy = room >= 150; label.classList.toggle("is-tight", !roomy); label.style.left = roomy ? (room - 16) + "px" : ""; label.style.top = roomy ? room2 + "px" : ""; };
        const s0h = v => sizeOf(r).h * v.z;
        const ctx = c.getContext("2d"), s = sizeOf(r), buf = document.createElement("canvas"); buf.width = s.w; buf.height = s.h; const bx = buf.getContext("2d");
        /* you come in over the arrow and stop just past it, or on it if something stands there */
        const ex = exitTiles(r, edge), start = ex[0], solidNow = solidSet(r), past = d => edge === "y" ? [start[0], start[1] - d] : [start[0] - d, start[1]], inward = !solidNow.has(past(2) + "") ? past(2) : past(1);
        const w = { x: start[0], y: start[1], dir: edge === "y" ? 0 : 6, frame: 0, walking: false, pts: [], then: null, last: 0 };
        let hover = null, dead = false, bookOpen = null, raf = 0, moved = false;
        const place = () => { const z = opts.zoom(), W = host.clientWidth, H = host.clientHeight; c.width = W; c.height = H; const v = { z, x: Math.round((W - s.w * z) / 2), y: Math.round((H - s.h * z) / 2) }; placeLabel(v); return v; };
        let view = place();
        const paint = now => { if (dead) return; view = (c.width !== host.clientWidth || c.height !== host.clientHeight || view.z !== opts.zoom()) ? place() : view; bx.clearRect(0, 0, s.w, s.h); paintRoom(bx, r, { facts, walker: w, hover, edges: [edge], now }); ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(buf, view.x, view.y, s.w * view.z, s.h * view.z); };
        const loop = now => { if (dead) return; if (w.walking) step(now); paint(now); raf = requestAnimationFrame(loop); };
        const step = now => {
            const dt = Math.min(200, now - w.last); w.last = now; let budget = dt / MS_PER_TILE;
            while (budget > 0 && w.pts.length) {
                const n = w.pts[0], dx = n[0] - w.x, dy = n[1] - w.y, d = Math.max(Math.abs(dx), Math.abs(dy));
                const face = DIRS.findIndex(q => q[0] === Math.sign(Math.round(dx * 100)) && q[1] === Math.sign(Math.round(dy * 100))); if (face >= 0) w.dir = face;
                if (d < 1e-6) { w.pts.shift(); continue; }
                const st = Math.min(budget, d); w.x += dx / d * st; w.y += dy / d * st; budget -= st;
                if (st >= d - 1e-6) { w.x = n[0]; w.y = n[1]; w.pts.shift(); moved = true; }
            }
            w.frame = (w.frame + dt / FRAME_MS) % 4;
            if (!w.pts.length) { w.walking = false; const t = w.then; w.then = null; if (t) t(); else arrived(); }
        };
        const arrived = () => { if (moved && ex.some(t => t[0] === w.x && t[1] === w.y) && opts.onLeave) { const f = opts.onLeave; opts.onLeave = null; f(); } };
        const go = (to, then) => { const from = [Math.round(w.x), Math.round(w.y)], p = route(r, from, to); if (!p) return false; w.pts = p; w.then = then || null; if (!p.length) { if (then) then(); else arrived(); return true; } if (!w.walking) { w.walking = true; w.last = performance.now(); } return true; };
        const toPx = e => { const b = c.getBoundingClientRect(); return [(e.clientX - b.left - view.x) / view.z, (e.clientY - b.top - view.y) / view.z]; };
        /* walk up to a thing: the nearest free tile touching it, then it opens */
        const spots = it => {
            const out = [], f = footprint(it);
            if (it.k === "frame") { const t = Math.floor(it.at); for (const a of [t, t - 1, t + 1]) for (const d of [0, 1]) out.push(it.wall === "l" ? [d, a] : [a, d]); return out; }
            for (let x = f[0] - 1; x <= f[0] + f[2]; x++) for (let y = f[1] - 1; y <= f[1] + f[3]; y++) if (!inFoot(f, x, y)) out.push([x, y]);
            return out;
        };
        const useIt = it => {
            const from = [Math.round(w.x), Math.round(w.y)]; let best = null;
            for (const q of spots(it)) { const p = (q[0] === from[0] && q[1] === from[1]) ? [] : route(r, from, q); if (p && (!best || p.length < best.p.length)) best = { q, p }; }
            if (!best) return;
            go(best.q, () => {
                const f = footprint(it); if (f) { const face = DIRS.findIndex(q => q[0] === Math.sign(Math.max(f[0], Math.min(f[0] + f[2] - 1, w.x)) - w.x) && q[1] === Math.sign(Math.max(f[1], Math.min(f[1] + f[3] - 1, w.y)) - w.y)); if (face >= 0) w.dir = face; }
                let what = null;
                if (it.k === "ledger") what = { kind: "ledger" };
                if (it.k === "album") { const a = albumsOf(r, facts).get(it); if (a) what = { kind: "album", album: a }; }
                if (it.k === "frame") { const p = facts.slots[it.slot]; if (p) what = { kind: "picture", pic: p }; }
                if (what) bookOpen = openBook(host, facts, what, () => { bookOpen = null; });
            });
        };
        const usable = it => it && (it.k === "ledger" || (it.k === "album" && albumsOf(r, facts).has(it)) || (it.k === "frame" && facts.slots[it.slot]));
        c.addEventListener("pointermove", e => { const p = toPx(e), t = tileAt(r, p[0], p[1]), it = itemAt(r, p[0], p[1]); c.style.cursor = usable(it) ? "pointer" : "default"; hover = !usable(it) && t[0] >= 0 && t[1] >= 0 && t[0] < r.w && t[1] < r.h && !solidSet(r).has(t[0] + "," + t[1]) ? t : null; });
        c.addEventListener("pointerleave", () => { hover = null; });
        c.addEventListener("wheel", e => { e.preventDefault(); if (opts.wheel) opts.wheel(e.deltaY); }, { passive: false });
        c.addEventListener("click", e => {
            if (bookOpen) return; const p = toPx(e), it = itemAt(r, p[0], p[1]);
            if (usable(it)) { useIt(it); return; }
            const t = tileAt(r, p[0], p[1]); if (t[0] < 0 || t[1] < 0 || t[0] >= r.w || t[1] >= r.h) return; go(t);
        });
        raf = requestAnimationFrame(loop);
        go(inward);
        return {
            canvas: c,
            close() { dead = true; cancelAnimationFrame(raf); if (bookOpen) bookOpen(); c.remove(); label.remove(); },
            state: () => ({ x: w.x, y: w.y, walking: w.walking, book: !!bookOpen, room: r, facts: { name: facts.name, pictures: facts.pictures.length }, view }),
            test: { go, useIt, toPx }
        };
    }
    const RoomView = window.RoomView = { load, layouts, roomFor, mazes, mazeFacts, enter, paintRoom, sizeOf, scr, tileAt, itemAt, footprint, exitTiles, arrowTiles, solidSet, isWall, isRug, floorPixel, FURNI, ghost, hallImg, indexOf: () => index, onArt: null, regs: null };
})();

/* Ariadne's Thread level editor: drawing the level (14 Oct 2026).

   The map is drawn with the game's own drawing (js/rat-race.js, through
   RatRace.dev), so what is seen here is what the game shows. The slow parts
   are kept in pictures the size of the map, worked out a room at a time:
     sky       the open sky, where the theme has one (the Quarry)
     backBase  the theme's back wall, once per level
     backdrop  backBase with the frame (uprights, rails, roots) over it, the
               sky cut out, in the level's Environment tone
     backwalls the background walls, in their tone
     terrain   walls, ladders, ropes, spikes, platforms, the shade under them
   After every change only the rooms it touched are drawn again (dirty), a
   few each frame, nearest the view first. Everything else (the objects,
   water, lights and the editor's own marks) is drawn fresh each frame. */
(function () {
    "use strict";
    const AE = window.AE, S = AE.S;
    const D = () => window.RatRace.dev;
    const TS = 16, RW = 20, RH = 14;

    const R = AE.R = { canvas: null, ctx: null, dpr: 1, layers: null, dirtyT: new Set(), dirtyB: new Set(), backdropDirty: false, need: true, shot: null, busy: 0 };
    const blank = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); const x = c.getContext("2d"); x.imageSmoothingEnabled = false; return c; };
    AE.redraw = () => { R.need = true; };

    /* ---------------------------------------------------------------- THE PICTURES OF THE MAP */
    function setup() {
        const a = S.act, W = a.w * TS, H = a.h * TS;
        D().theme(S.zone);
        const TH = D().theme(S.zone);
        R.layers = { W, H, sky: null, backBase: blank(W, H), backdrop: blank(W, H), backwalls: blank(W, H), terrain: blank(W, H) };
        // the theme's back wall (the slowest: some themes work it out pixel by pixel)
        D().drawBackdrop(R.layers.backBase.getContext("2d"), a);
        if (TH.sky) {
            R.layers.sky = blank(W, H);
            const x = R.layers.sky.getContext("2d");
            for (let ry = 0; ry * RH < a.h; ry++) for (let rx = 0; rx * RW < a.w; rx++) {
                x.save(); x.translate(rx * RW * TS, ry * RH * TS); x.beginPath(); x.rect(0, 0, RW * TS, RH * TS); x.clip();
                try { TH.sky(x, { x: rx * RW * TS, y: ry * RH * TS }, a, D().helpers()); } catch (e) { /* no sky here */ }
                x.restore();
            }
        }
        R.dirtyT = new Set(); R.dirtyB = new Set();
        for (let cy = 0; cy * RH < a.h; cy++) for (let cx = 0; cx * RW < a.w; cx++) { R.dirtyT.add(cx + "," + cy); R.dirtyB.add(cx + "," + cy); }
        R.backdropDirty = true;
        R.drawn = snapshot();
        R.total = R.dirtyT.size;
    }
    // What the pictures were drawn from, to tell what a change touched.
    function snapshot() {
        const a = S.act;
        return {
            w: a.w, h: a.h,
            tiles: a.tiles.map(r => r.join("")), back: S.spec.back.map(r => r.join("")),
            hidden: a.hidden ? a.hidden.slice() : null, sky: a.skyMask ? a.skyMask.slice() : null,
            runs: D().beamRuns(a).map(r => r.tx + "," + r.end + "," + r.ty + "," + r.held + "," + r.wallL + r.wallR),
            frame: JSON.stringify(S.spec.objects.filter(AE.isFrame).map(o => [o.type, o.x, o.y, o.w, o.h, o.braces, o.seed])),
            tones: JSON.stringify((S.spec.settings && S.spec.settings.tone) || {})
        };
    }
    // After a change: the rooms whose pictures it touched are marked to be drawn again.
    function invalidate(what) {
        if (!R.layers || !S.act) return;
        const a = S.act, old = R.drawn, now = snapshot();
        if (what && what.all || !old || old.w !== now.w || old.h !== now.h) { setup(); return; }
        const markT = (tx, ty, m) => { for (let y = ty - m; y <= ty + m; y++) for (let x = tx - m; x <= tx + m; x++) if (x >= 0 && y >= 0 && x < a.w && y < a.h) R.dirtyT.add(Math.floor(x / RW) + "," + Math.floor(y / RH)); };
        const markB = (tx, ty, m) => { for (let y = ty - m; y <= ty + m; y++) for (let x = tx - m; x <= tx + m; x++) if (x >= 0 && y >= 0 && x < a.w && y < a.h) R.dirtyB.add(Math.floor(x / RW) + "," + Math.floor(y / RH)); };
        for (let y = 0; y < a.h; y++) {
            if (old.tiles[y] !== now.tiles[y]) for (let x = 0; x < a.w; x++) if (old.tiles[y][x] !== now.tiles[y][x]) markT(x, y, 2);
            if (old.back[y] !== now.back[y]) for (let x = 0; x < a.w; x++) if (old.back[y][x] !== now.back[y][x]) markB(x, y, 2);
        }
        if (old.hidden && now.hidden) for (let i = 0; i < now.hidden.length; i++) if (old.hidden[i] !== now.hidden[i]) markT(i % a.w, Math.floor(i / a.w), 2);
        let skyChanged = false;
        if (old.sky && now.sky) for (let i = 0; i < now.sky.length; i++) if (old.sky[i] !== now.sky[i]) { skyChanged = true; markT(i % a.w, Math.floor(i / a.w), 2); markB(i % a.w, Math.floor(i / a.w), 2); }
        // a platform that grew, shrank, or came to hang from chains or stand on posts: all of it again
        const was = new Set(old.runs), is = new Set(now.runs);
        for (const r of [...old.runs.filter(k => !is.has(k)), ...now.runs.filter(k => !was.has(k))]) { const [x0, x1, ty] = r.split(",").map(Number); for (let x = x0; x <= x1; x++) markT(x, ty, 1); }
        const t0 = JSON.parse(old.tones), t1 = JSON.parse(now.tones), same = k => JSON.stringify(t0[k] || null) === JSON.stringify(t1[k] || null);
        if (!same("walls")) for (let cy = 0; cy * RH < a.h; cy++) for (let cx = 0; cx * RW < a.w; cx++) R.dirtyT.add(cx + "," + cy);
        if (!same("back")) for (let cy = 0; cy * RH < a.h; cy++) for (let cx = 0; cx * RW < a.w; cx++) R.dirtyB.add(cx + "," + cy);
        if (!same("env") || skyChanged || old.frame !== now.frame) R.backdropDirty = true;
        R.drawn = now;
        R.total = Math.max(R.dirtyT.size, 1);
        AE.redraw();
    }
    AE.on("load", () => { setup(); AE.redraw(); });
    AE.on("change", w => invalidate(w));

    const toneOf = k => (S.spec.settings.tone && S.spec.settings.tone[k]) || (k === "back" ? { l: -40, s: -15 } : null);
    function drawBackdrop() {
        const L = R.layers, x = L.backdrop.getContext("2d");
        x.clearRect(0, 0, L.W, L.H);
        x.drawImage(L.backBase, 0, 0);
        D().drawFrame(x, S.act, S.spec.objects.filter(AE.isFrame));
        D().clearSky(x, S.act);
        D().applyTone(L.backdrop, toneOf("env"));
        R.backdropDirty = false;
    }
    const chunkCv = blank(RW * TS, RH * TS);
    function drawChunk(key, which) {
        const [cx, cy] = key.split(",").map(Number), a = S.act;
        const X0 = cx * RW, Y0 = cy * RH, X1 = Math.min(a.w, X0 + RW), Y1 = Math.min(a.h, Y0 + RH);
        const c = chunkCv, x = c.getContext("2d");
        x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
        x.translate(-X0 * TS, -Y0 * TS);
        if (which === "t") D().drawTerrain(x, a, { x0: X0, y0: Y0, x1: X1, y1: Y1 });
        else {
            // the walls behind, as walls of their own (nothing hidden in them)
            const b = Object.create(a); b.tiles = S.spec.back; b.hidden = null; b.blocks = null; b.slick = new Set();
            x.save(); x.beginPath(); x.rect(X0 * TS, Y0 * TS, (X1 - X0) * TS, (Y1 - Y0) * TS); x.clip();
            for (let ty = Math.max(0, Y0 - 2); ty < Math.min(a.h, Y1 + 2); ty++) for (let tx = Math.max(0, X0 - 1); tx < Math.min(a.w, X1 + 1); tx++) if (S.spec.back[ty][tx] === "#") D().drawWall(x, b, tx, ty, 0, 0);
            x.restore();
        }
        x.setTransform(1, 0, 0, 1, 0, 0);
        D().applyTone(c, which === "t" ? toneOf("walls") : toneOf("back"));
        const L = which === "t" ? R.layers.terrain : R.layers.backwalls, lx = L.getContext("2d");
        lx.clearRect(X0 * TS, Y0 * TS, (X1 - X0) * TS, (Y1 - Y0) * TS);
        lx.drawImage(c, 0, 0, (X1 - X0) * TS, (Y1 - Y0) * TS, X0 * TS, Y0 * TS, (X1 - X0) * TS, (Y1 - Y0) * TS);
    }
    // Some of the waiting rooms, nearest the middle of the view first, for as long as a frame allows.
    function work(budget) {
        if (!R.layers) return false;
        const t0 = performance.now();
        if (R.backdropDirty) drawBackdrop();
        const v = S.view, cxv = (v.x + R.cw / 2 / v.z) / (RW * TS), cyv = (v.y + R.ch / 2 / v.z) / (RH * TS);
        const byNear = set => [...set].sort((p, q) => { const [ax, ay] = p.split(",").map(Number), [bx, by] = q.split(",").map(Number); return Math.hypot(ax + 0.5 - cxv, ay + 0.5 - cyv) - Math.hypot(bx + 0.5 - cxv, by + 0.5 - cyv); });
        for (const [set, which] of [[R.dirtyT, "t"], [R.dirtyB, "b"]]) {
            if (!set.size) continue;
            for (const k of byNear(set)) {
                drawChunk(k, which); set.delete(k);
                if (performance.now() - t0 > budget) return true;
            }
        }
        return R.dirtyT.size > 0 || R.dirtyB.size > 0;
    }

    /* ---------------------------------------------------------------- THE VIEW */
    AE.toWorld = (sx, sy) => ({ x: S.view.x + sx / S.view.z, y: S.view.y + sy / S.view.z });
    AE.toScreen = (wx, wy) => ({ x: (wx - S.view.x) * S.view.z, y: (wy - S.view.y) * S.view.z });
    AE.zoomAt = function (z, sx, sy) {
        const v = S.view, w = AE.toWorld(sx, sy);
        v.z = Math.max(0.25, Math.min(10, z));
        v.x = w.x - sx / v.z; v.y = w.y - sy / v.z;
        AE.redraw(); AE.emit("view");
    };
    AE.centerOn = function (wx, wy, z) { const v = S.view; if (z) v.z = z; v.x = wx - R.cw / 2 / v.z; v.y = wy - R.ch / 2 / v.z; AE.redraw(); AE.emit("view"); };
    AE.fitMap = function () {
        if (!S.act) return;
        const W = S.act.w * TS, H = S.act.h * TS, z = Math.max(0.25, Math.min(R.cw / (W + 32), R.ch / (H + 32)));
        AE.centerOn(W / 2, H / 2, z);
    };
    AE.ZOOMS = [0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10];

    function resize() {
        const c = R.canvas, box = c.parentElement.getBoundingClientRect();
        R.dpr = window.devicePixelRatio || 1;
        R.cw = Math.max(50, Math.floor(box.width)); R.ch = Math.max(50, Math.floor(box.height));
        c.width = Math.round(R.cw * R.dpr); c.height = Math.round(R.ch * R.dpr);
        c.style.width = R.cw + "px"; c.style.height = R.ch + "px";
        AE.redraw();
    }

    /* ---------------------------------------------------------------- THE FRAME */
    function frame() {
        requestAnimationFrame(frame);
        if (!S.act || !R.layers || AE.testing) return;
        const more = work(R.need ? 6 : 12);
        if (more) { R.need = true; R.busy = 1 - (R.dirtyT.size + R.dirtyB.size) / (2 * R.total || 1); } else if (R.busy) { R.busy = 0; R.need = true; }
        if (!R.need && !AE.animating) return;
        R.need = false;
        paint();
        AE.emit("painted");
    }
    function paint() {
        const g = R.ctx, v = S.view, L = R.layers, a = S.act, z = v.z * R.dpr;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = "#0b0c0f"; g.fillRect(0, 0, R.canvas.width, R.canvas.height);
        g.imageSmoothingEnabled = false;
        g.setTransform(z, 0, 0, z, -v.x * z, -v.y * z);
        // the map's own ground: a checker where nothing is drawn
        g.fillStyle = "#14161b"; g.fillRect(0, 0, L.W, L.H);
        const vis = viewRect();
        const blit = c => { const x0 = Math.max(0, Math.floor(vis.x)), y0 = Math.max(0, Math.floor(vis.y)), x1 = Math.min(L.W, Math.ceil(vis.x + vis.w)), y1 = Math.min(L.H, Math.ceil(vis.y + vis.h)); if (x1 > x0 && y1 > y0) g.drawImage(c, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0); };
        if (S.layers.backdrop) { if (L.sky) blit(L.sky); blit(L.backdrop); }
        if (S.layers.backwalls) blit(L.backwalls);
        const objs = S.spec.objects;
        if (S.layers.back) for (const o of objs) if (AE.layerOf(o) === "back" && near(o, vis)) D().drawBackObject(g, a, o);
        // (21 Oct 2026) the timber the support areas call for, as the game will draw it
        if (S.layers.back && a.autoSupport) for (const o of a.autoSupport) if (o.x < vis.x + vis.w && o.x + (o.w || 24) > vis.x - 24 && o.y < vis.y + vis.h && o.y + (o.h || 16) > vis.y) D().drawBackObject(g, a, o);
        if (S.layers.lights) for (const o of objs) if (o.type === "torch" && near(o, vis)) D().drawBackObject(g, a, o);   // its soot
        if (S.layers.terrain) blit(L.terrain);
        // (23 Oct 2026) the rails layer, as the game draws it
        if (S.layers.terrain && S.spec.rails) D().drawRails(g, a, S.spec.rails, Math.floor(vis.x / TS) - 1, Math.floor(vis.y / TS) - 1, Math.ceil((vis.x + vis.w) / TS) + 2, Math.ceil((vis.y + vis.h) / TS) + 2);
        AE.drawLive(g, vis);
        if (S.layers.front) for (const o of objs) if (o.type === "prop" && o.layer === "front" && near(o, vis)) { const img = D().propImg(o); if (img) g.drawImage(img, o.x, o.y); }
        if (S.layers.water) drawWater(g, vis);
        if (S.layers.lights) AE.drawLights(g, vis);
        AE.drawOverlays(g, vis);
    }
    const viewRect = () => ({ x: S.view.x, y: S.view.y, w: R.cw / S.view.z, h: R.ch / S.view.z });
    AE.viewRect = viewRect;
    function near(o, vis) { const b = AE.box(o); return b.x < vis.x + vis.w + 64 && b.x + b.w > vis.x - 64 && b.y < vis.y + vis.h + 64 && b.y + b.h > vis.y - 64; }
    AE.near = near;

    // THE WATER, as the game washes it (and the sea's lines are the overlay's)
    function drawWater(g, vis) {
        const a = S.act, x0 = Math.max(0, Math.floor(vis.x / TS)), y0 = Math.max(0, Math.floor(vis.y / TS)), x1 = Math.min(a.w - 1, Math.floor((vis.x + vis.w) / TS)), y1 = Math.min(a.h - 1, Math.floor((vis.y + vis.h) / TS));
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
            const w = S.spec.water[ty][tx]; if (w !== "~" && w !== "m") continue;
            const X = tx * TS, Y = ty * TS, top = !S.spec.water[ty - 1] || (S.spec.water[ty - 1][tx] !== "~" && S.spec.water[ty - 1][tx] !== "m" && !"#X89V".includes(S.spec.tiles[ty - 1][tx]));
            if (w === "m") { g.fillStyle = top ? "rgba(34,58,22,0.70)" : "rgba(22,40,15,0.80)"; g.fillRect(X, Y, TS, TS); if (top) { g.fillStyle = "#6f7a34"; g.fillRect(X, Y, TS, 1); } continue; }
            g.fillStyle = "rgba(30,110,150,0.42)"; g.fillRect(X, Y, TS, TS);
            if (top) { g.fillStyle = "rgba(200,240,255,0.7)"; g.fillRect(X, Y, TS, 1); }
        }
        const sea = S.spec.settings.sea;
        if (sea && typeof sea.low === "number" && S.overlays.sea) {
            const top = Math.max(vis.y, sea.low), bot = Math.min(vis.y + vis.h, a.h * TS);
            if (bot > top) { const gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, "rgba(30,110,150,0.30)"); gr.addColorStop(1, "rgba(10,50,90,0.42)"); g.fillStyle = gr; g.fillRect(Math.max(0, vis.x), top, Math.min(a.w * TS, vis.w), bot - top); }
        }
        // (17 Oct 2026) the painted dark: shaded, the turn to light hatched (lighter while the lighting is previewed)
        if (S.layers.lights !== false && S.spec.dark) {
            const x0 = Math.max(0, Math.floor(vis.x / TS)), y0 = Math.max(0, Math.floor(vis.y / TS)), x1 = Math.min(S.spec.w - 1, Math.floor((vis.x + vis.w) / TS)), y1 = Math.min(S.spec.h - 1, Math.floor((vis.y + vis.h) / TS)), k = S.overlays.lighting ? 0.4 : 1;
            for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
                const c = S.spec.dark[ty][tx]; if (c !== "d" && c !== "t") continue;
                const X = tx * TS, Y = ty * TS;
                if (c === "d") { g.fillStyle = `rgba(30,10,60,${0.42 * k})`; g.fillRect(X, Y, TS, TS); }
                else { g.fillStyle = `rgba(30,10,60,${0.16 * k})`; g.fillRect(X, Y, TS, TS); g.fillStyle = `rgba(190,150,255,${0.5 * k})`; for (let i = 0; i < TS; i += 4) for (let j = 0; j < TS - i; j++) if (j % 2 === 0) g.fillRect(X + i + j, Y + TS - 1 - j, 1, 1); }
            }
        }
        // (21 Oct 2026) the support areas: a dashed timber-coloured edge
        if (S.layers.back !== false) for (const o of S.spec.objects) {
            if (o.type !== "supportarea" || !near(o, vis)) continue;
            const px = 1 / S.view.z;
            g.save(); g.fillStyle = "rgba(200,140,60,0.07)"; g.fillRect(o.x, o.y, o.w || 160, o.h || 112);
            g.strokeStyle = "rgba(230,170,90,0.85)"; g.lineWidth = 1.5 * px; g.setLineDash([6 * px, 4 * px]); g.strokeRect(o.x, o.y, o.w || 160, o.h || 112); g.restore();
        }
        // (17 Oct 2026) the dark areas: shaded, a dashed edge, and where they start to fade
        if (S.layers.lights !== false) for (const o of S.spec.objects) {
            if (o.type !== "darkzone" || !near(o, vis)) continue;
            const w = o.w || 160, h = o.h || 112, f = Math.max(0, Math.min(o.fade >= 0 ? o.fade : 32, w / 2, h / 2)), px = 1 / S.view.z;
            g.fillStyle = "rgba(20,8,40,0.28)"; g.fillRect(o.x, o.y, w, h);
            g.save(); g.strokeStyle = "rgba(190,150,255,0.85)"; g.lineWidth = 1.5 * px; g.setLineDash([6 * px, 4 * px]); g.strokeRect(o.x, o.y, w, h);
            if (f > 0) { g.strokeStyle = "rgba(190,150,255,0.35)"; g.setLineDash([2 * px, 4 * px]); g.strokeRect(o.x + f, o.y + f, w - 2 * f, h - 2 * f); }
            g.restore();
        }
        for (const o of S.spec.objects) {
            if (o.type !== "current" || !near(o, vis)) continue;
            g.fillStyle = "rgba(60,150,255,0.16)"; g.fillRect(o.x, o.y, o.w, o.h);
            const dx = Math.sign(o.dx || 0), dy = Math.sign(o.dy || 0);
            g.fillStyle = "rgba(200,240,255,0.55)";
            for (let Y = o.y + 4; Y < o.y + o.h; Y += 8) for (let X = o.x + 4; X < o.x + o.w; X += 12) {
                if (dx) { g.fillRect(X, Y, 5, 1); g.fillRect(dx > 0 ? X + 4 : X, Y - 1, 1, 3); }
                if (dy) { g.fillRect(X + 2, Y - 2, 1, 5); g.fillRect(X + 1, dy > 0 ? Y + 2 : Y - 2, 3, 1); }
            }
        }
    }

    /* ---------------------------------------------------------------- THE MINIMAP */
    AE.drawMinimap = function (cv) {
        if (!R.layers) return;
        const x = cv.getContext("2d"), L = R.layers, k = Math.min(cv.width / L.W, cv.height / L.H);
        const w = L.W * k, h = L.H * k, ox = (cv.width - w) / 2, oy = (cv.height - h) / 2;
        x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
        x.imageSmoothingEnabled = true;
        x.globalAlpha = 0.55; x.drawImage(L.backdrop, ox, oy, w, h); x.globalAlpha = 1;
        x.drawImage(L.terrain, ox, oy, w, h);
        // the objects as dots: pickups gold, creatures red, Scout white
        for (const o of S.spec.objects) {
            const c = o.type === "start" ? "#ffffff" : o.type === "exit" ? "#7ee081" : o.type === "key" ? "#ffd84a" : o.type === "gem" ? "#ff5f7a" : window.RatRace.dev.FOES.has(o.type) ? "#ff6b4a" : null;
            if (!c) continue;
            x.fillStyle = c; x.fillRect(ox + o.x * k - 1, oy + o.y * k - 1, 3, 3);
        }
        const v = viewRect();
        x.strokeStyle = "#f2cc4e"; x.lineWidth = 1.5; x.strokeRect(ox + v.x * k, oy + v.y * k, v.w * k, v.h * k);
        return { ox, oy, k };
    };

    AE.initRender = function (canvas) {
        R.canvas = canvas; R.ctx = canvas.getContext("2d");
        new ResizeObserver(resize).observe(canvas.parentElement);
        resize();
        requestAnimationFrame(frame);
    };
    AE.renderBusy = () => R.busy;
    AE.paintNow = () => { if (R.layers && S.act) { while (work(1000)) { /* all of it */ } R.busy = 0; R.need = false; paint(); AE.emit("painted"); } };
})();

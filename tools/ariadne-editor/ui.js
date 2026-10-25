/* Ariadne's Thread level editor: the panels round the map (14 Oct 2026).
   The library on the left (terrain to paint, things to place), the
   inspector on the right (what is chosen, the level's own settings, the
   layers, problems), the toolbar along the top, the status bar along the
   foot, and the dialogs. */
(function () {
    "use strict";
    const AE = window.AE, S = AE.S, C = AE.CATALOG;
    const D = () => window.RatRace.dev;
    const TS = 16;
    const $ = (sel, root) => (root || document).querySelector(sel);
    const el = (tag, attrs, ...kids) => {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v === undefined || v === null || v === false) continue;
            if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k === "html") e.innerHTML = v;
            else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "style") e.style.cssText = v; else e.setAttribute(k, v === true ? "" : v);
        }
        for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
        return e;
    };
    AE.el = el;
    const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
    const title = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bOf\b/g, "of").replace(/\bThe\b(?!^)/g, "the").replace(/^the/, "The");

    /* ---------------------------------------------------------------- ICONS (24 x 24, drawn in lines) */
    const ICON = {
        select: '<path d="M6 3l12 9-5.5 1.2L15.5 20l-2.6 1.1-2.6-6.6L6 18z"/>',
        brush: '<path d="M14.5 4.5l5 5-8.5 8.5-5-5z"/><path d="M6 13l-2 7 7-2"/>',
        rect: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 12h16M12 5v14" opacity=".45"/>',
        fill: '<path d="M5 11l7-7 7 7-7 7z"/><path d="M19 15c1.2 1.6 1.8 2.7 1.8 3.4a1.8 1.8 0 01-3.6 0c0-.7.6-1.8 1.8-3.4z"/>',
        area: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path d="M9 9h6v6H9z" opacity=".55"/>',
        path: '<circle cx="5" cy="18" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="19" cy="15" r="2"/><path d="M6.4 16.4l4.3-7.8M13.6 8.4l4.2 5.2"/>',
        pick: '<path d="M14 4l6 6-2 2-6-6z"/><path d="M13 9l-8 8v3h3l8-8"/>',
        pan: '<path d="M8 13V6.5a1.5 1.5 0 013 0V12m0-6.5a1.5 1.5 0 013 0V12m0-4.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a5 5 0 01-4.2-2.3L4 15.5a1.6 1.6 0 012.6-1.8L8 15"/>',
        undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12" transform="translate(0 -6)"/>',
        redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 000 12" transform="translate(0 -6)"/>',
        grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
        play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
        stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
        save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
        eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6A17 17 0 002 12s3.6 7 10 7a9.6 9.6 0 005.4-1.6"/>',
        lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
        unlock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 017.7-1.5"/>',
        trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
        copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
        up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
        fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
        help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17.5v.1"/>',
        warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.1"/>', err: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.1"/>',
        history: '<path d="M4 12a8 8 0 108-8 8 8 0 00-6.3 3M4 4v4h4"/><path d="M12 8v4l3 2"/>',
        restart: '<path d="M4 12a8 8 0 108-8 8 8 0 00-6.3 3M4 4v4h4"/>', boxes: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/><path d="M13 3h8v8M3 13h8v8" stroke-dasharray="2 2"/>',
        shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>', mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
        flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>', mirror: '<path d="M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z"/>', chevron: '<path d="M7 10l5 5 5-5"/>'
    };
    const icon = (name, size) => `<svg class="ico" width="${size || 18}" height="${size || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ""}</svg>`;
    AE.icon = icon;

    /* ---------------------------------------------------------------- THUMBNAILS: each item drawn with the game's own pictures */
    const thumbCache = new Map();
    function thumbCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; c.className = "thumb"; return c; }
    function fitDraw(c, img, sx, sy, sw, sh) {
        const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
        const k = Math.max(1, Math.floor(Math.min((c.width - 4) / sw, (c.height - 4) / sh)));
        const kk = Math.min(k, 3), dw = sw * kk, dh = sh * kk;
        x.drawImage(img, sx, sy, sw, sh, Math.round((c.width - dw) / 2), Math.round((c.height - dh) / 2), dw, dh);
    }
    // a little map of the terrain, drawn by the game
    function terrainThumb(t) {
        const key = "t:" + S.zone.theme + ":" + t.id;
        if (thumbCache.has(key)) return thumbCache.get(key);
        const c = thumbCanvas(44, 44), ch = t.tile;
        const maps = {
            "#": ["....", ".##.", ".##.", "...."], "%": ["....", ".%%.", ".%%.", "...."], "=": ["....", "....", ".==.", "...."], W: [".W..", ".W..", ".W..", ".W.."], B: [".B..", ".B..", ".B..", "...."], H: ["....", ".H..", ".H..", ".H.."],
            "|": [".#..", ".|..", ".|..", "...."], "^": ["....", "....", ".^^.", ".##."], i: ["....", "....", ".ii.", ".##."], "2": ["....", "....", ".2..", ".##."],
            "{": ["....", "....", "{}##", "####"], "}": ["....", "....", "{}##", "####"], "[": ["....", "....", "##[]", "####"], "]": ["....", "....", "##[]", "####"],
            "/": ["....", "../#", "./##", "####"], "\\": ["....", "#\\..", "##\\.", "####"],
            S: ["....", "../#", "./##", "####"], G: ["....", "....", "{}##", "####"],
            u: ["####", "u###", ".u##", "..u#"], n: ["####", "###n", "##n.", "#n.."], k: ["####", "kl##", "..kl", "...."], y: ["####", "##yz", "yz..", "...."],
            e: ["....", "....", "....", "...."], _: ["....", "....", "....", "...."], ",": ["....", "....", "....", "...."], h: ["....", ".H..", ".H..", "...."], j: [".#..", ".|..", ".|..", "...."], ".": ["....", "....", "....", "...."]
        };
        const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
        const map = maps[ch];
        if (t.layer === "dark") {
            const gr = x.createLinearGradient(6, 0, 38, 0);
            if (t.tile === "t") { gr.addColorStop(0, "rgba(6,4,12,1)"); gr.addColorStop(1, "rgba(120,90,60,0.9)"); } else { gr.addColorStop(0, "rgba(6,4,12,1)"); gr.addColorStop(1, "rgba(14,8,22,1)"); }
            x.fillStyle = gr; x.fillRect(6, 10, 32, 28); x.strokeStyle = "rgba(190,150,255,0.85)"; x.setLineDash([4, 3]); x.lineWidth = 1.5; x.strokeRect(6.5, 10.5, 31, 27); x.setLineDash([]);
        }
        else if (t.layer === "water" && t.tile === "m") { x.fillStyle = "#24381a"; x.fillRect(6, 12, 32, 26); x.fillStyle = "#6f7a34"; x.fillRect(6, 12, 32, 2); x.fillStyle = "#8e9a42"; x.fillRect(10, 11, 4, 1); x.fillRect(27, 11, 3, 1); x.fillStyle = "#7d8a3c"; x.fillRect(19, 10, 3, 2); x.fillStyle = "rgba(160,170,96,0.6)"; x.fillRect(13, 22, 1, 1); x.fillRect(29, 30, 1, 1); x.fillRect(20, 33, 1, 1); }
        else if (t.layer === "water") { x.fillStyle = "#1e6e96"; x.fillRect(6, 12, 32, 26); x.fillStyle = "#c8f0ff"; x.fillRect(6, 12, 32, 2); }
        else if (t.layer === "rails") {
            // (23 Oct 2026) a piece of rail on a floor, as the game draws it: buffers and a broken end at their right; hanging, over a ledge
            const hang = ch === "v", tiles = hang ? ["....", "....", "##..", "##.."] : ["....", "....", "####", "####"], rails = hang ? ["....", ".-v.", "....", "...."] : ["....", "-" + "-" + (ch === "-" ? "--" : ch + "."), "....", "...."];
            const mini = D().build({ w: 4, h: 4, tiles, objects: [{ type: "start", x: 3, y: 42 }] }, S.zone, { bare: true });
            const big = document.createElement("canvas"); big.width = 64; big.height = 64;
            const bx = big.getContext("2d"); D().drawTerrain(bx, mini); D().drawRails(bx, mini, rails, 0, 0, 4, 4);
            fitDraw(c, big, 8, 8, 48, 48);
        }
        else if (t.layer === "back" || map) {
            const tiles = t.layer === "back" ? ["....", ".##.", ".##.", "...."] : map;
            const mini = D().build({ w: 4, h: 4, tiles, objects: [{ type: "start", x: 3, y: 42 }] }, S.zone, { bare: true });
            const big = document.createElement("canvas"); big.width = 64; big.height = 64;
            const bx = big.getContext("2d");
            if (t.layer === "back") { const b = Object.create(mini); b.hidden = null; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) if (tiles[ty][tx] === "#") D().drawWall(bx, b, tx, ty, 0, 0); D().applyTone(big, { l: -40, s: -15 }); }
            else D().drawTerrain(bx, mini);
            fitDraw(c, big, 8, 8, 48, 48);
            if (ch === "%" || ch === "_" || ch === "," || ch === "h" || ch === "j") { x.strokeStyle = "#50d2ff"; x.setLineDash([3, 2]); x.strokeRect(7.5, 7.5, 29, 29); }
            if (ch === "e") { x.strokeStyle = "#ffffff"; x.setLineDash([2, 2]); x.strokeRect(12.5, 18.5, 19, 7); x.fillStyle = "#ffffff"; x.font = "700 9px system-ui"; x.textAlign = "center"; x.fillText("STOP", 22, 34); }
            if (ch === ".") { x.strokeStyle = "#ff6a6a"; x.lineWidth = 2; x.beginPath(); x.moveTo(12, 12); x.lineTo(32, 32); x.moveTo(32, 12); x.lineTo(12, 32); x.stroke(); }
        } else {
            // (21 Oct 2026) rubble as the zone draws it (the Mine's: fallen slabs), a pile two tiles square
            let slab = null;
            if ((ch === "X" || ch === "Q") && (D().theme(S.zone).slabRubble || D().theme(S.zone).pinballRubble)) { const mini = D().build({ w: 4, h: 4, tiles: ["....", "....", "....", "...."], objects: [{ type: "start", x: 3, y: 42 }] }, S.zone, { bare: true }); D().paint(x, mini, P => { slab = P.pileArt({ cells: [[0, 0], [1, 0], [0, 1], [1, 1]] }).c; }); }
            const img = slab || (ch === "c" ? D().spr("crumble", 0) : ch === "V" ? D().spr("roots", 0) : ch === "X" || ch === "Q" ? D().spr("rubble", 0) : null);
            if (img) fitDraw(c, img, 0, 0, img.width, img.height);
            if (ch === "Q") { x.strokeStyle = "#50d2ff"; x.setLineDash([3, 2]); x.strokeRect(5.5, 5.5, 33, 33); }
        }
        thumbCache.set(key, c);
        return c;
    }
    function objectThumb(type, over) {
        const key = "o:" + S.zone.theme + ":" + type + ":" + JSON.stringify(over || {});
        if (thumbCache.has(key)) return thumbCache.get(key);
        const c = thumbCanvas(44, 44), x = c.getContext("2d"); x.imageSmoothingEnabled = false;
        const o = AE.make(type, 0, 0, over);
        const b = AE.box(o), T = C.TYPES[type];
        if (type === "light" || type === "current" || type === "darkzone" || type === "supportarea" || !T) {
            glyphThumb(x, o);
        } else {
            // the object drawn as the editor draws it, at the map's scale, then fitted
            const pad = 1, big = document.createElement("canvas"), long = ["upright", "crossbeam", "root", "chain", "hangrope", "post", "shaftbeam"].includes(type);
            const bw = Math.max(4, Math.min(long ? 40 : 120, b.w)), bh = Math.max(4, Math.min(long ? 40 : 120, b.h));
            big.width = bw + pad * 2; big.height = bh + pad * 2;
            const bx = big.getContext("2d"); bx.imageSmoothingEnabled = false;
            bx.translate(pad - b.x, pad - b.y);
            AE.drawGhost(bx, o);
            fitDraw(c, big, 0, 0, big.width, big.height);
        }
        thumbCache.set(key, c);
        return c;
    }
    function glyphThumb(x, o) {
        x.save(); x.translate(22, 22);
        if (o.type === "light") {
            const col = o.color || "#ffb050";
            const gr = x.createRadialGradient(0, 0, 1, 0, 0, 18); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
            x.fillStyle = gr;
            if (o.kind === "spot") { x.beginPath(); x.moveTo(0, -12); x.arc(0, -12, 30, Math.PI / 2 - 0.4, Math.PI / 2 + 0.4); x.closePath(); x.fill(); }
            else if (o.kind === "shaft") { x.globalAlpha = 0.8; x.beginPath(); x.moveTo(-5, -18); x.lineTo(5, -18); x.lineTo(10, 18); x.lineTo(-10, 18); x.closePath(); x.fill(); }
            else { x.fillRect(-20, -20, 40, 40); }
            x.globalAlpha = 1;
            x.fillStyle = o.kind === "beacon" ? "#ff4030" : "#fff3c8"; x.beginPath(); x.arc(0, o.kind === "spot" || o.kind === "shaft" ? -14 : 0, 3, 0, Math.PI * 2); x.fill();
            if (o.scare === false) { x.fillStyle = "#8ef0b0"; x.beginPath(); x.arc(0, 0, 3, 0, Math.PI * 2); x.fill(); }
        } else if (o.type === "darkzone") {
            const gr = x.createRadialGradient(4, 2, 2, 0, 0, 22); gr.addColorStop(0, "rgba(255,190,90,0.9)"); gr.addColorStop(0.35, "rgba(120,70,30,0.6)"); gr.addColorStop(1, "rgba(6,4,12,1)");
            x.fillStyle = gr; x.fillRect(-18, -14, 36, 28); x.strokeStyle = "rgba(190,150,255,0.85)"; x.setLineDash([4, 3]); x.lineWidth = 1.5; x.strokeRect(-18, -14, 36, 28);
        } else if (o.type === "supportarea") {
            // a timber set inside a dashed box
            x.strokeStyle = "rgba(230,170,90,0.9)"; x.setLineDash([4, 3]); x.lineWidth = 1.5; x.strokeRect(-18, -14, 36, 28); x.setLineDash([]);
            x.fillStyle = "#3a2210"; x.fillRect(-12, -10, 24, 5); x.fillStyle = "#96633a"; x.fillRect(-11, -9, 22, 3);
            for (const px of [-11, 7]) { x.fillStyle = "#3a2210"; x.fillRect(px, -5, 5, 16); x.fillStyle = "#96633a"; x.fillRect(px + 1, -5, 3, 16); }
        } else if (o.type === "current") {
            x.fillStyle = "rgba(60,150,255,0.35)"; x.fillRect(-16, -12, 32, 24); x.strokeStyle = "#9fd0ff"; x.lineWidth = 2;
            const dx = Math.sign(o.dx || 0), dy = Math.sign(o.dy || 0);
            x.beginPath(); x.moveTo(-dx * 10, -dy * 8); x.lineTo(dx * 10, dy * 8); x.stroke();
            x.beginPath(); x.moveTo(dx * 10 + (dy ? -4 : -dx * 5), dy * 8 + (dx ? -4 : -dy * 5)); x.lineTo(dx * 10, dy * 8); x.lineTo(dx * 10 + (dy ? 4 : -dx * 5), dy * 8 + (dx ? 4 : -dy * 5)); x.stroke();
        } else { x.fillStyle = "#9aa0aa"; x.font = "700 13px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("?", 0, 0); }
        x.restore();
    }
    // An object drawn (for the ghost under the pointer, and thumbnails)
    AE.drawGhost = function (g, o) {
        const a = S.act;
        if (o.type === "prop") { const img = D().propImg(o); if (img) g.drawImage(img, o.x, o.y); return; }
        if (["post", "brace", "cleat", "chain", "hangrope", "ycap", "shaftbeam", "sign"].includes(o.type)) { D().drawBackObject(g, a, o); return; }
        if (AE.isFrame(o)) { D().drawFrame(g, a, [o]); return; }
        if (o.type === "light" || o.type === "current" || o.type === "darkzone" || o.type === "supportarea") { const b = AE.box(o); g.save(); g.fillStyle = o.type === "light" ? (o.color || "#ffb050") : o.type === "supportarea" ? "rgba(200,140,60,0.25)" : o.type === "darkzone" ? "rgba(20,8,40,0.45)" : "rgba(60,150,255,0.35)"; if (o.type === "light") { g.beginPath(); g.arc(o.x, o.y, 4, 0, Math.PI * 2); g.fill(); } else g.fillRect(b.x, b.y, b.w, b.h); g.restore(); return; }
        const list = [o], vis = { x: -1e9, y: -1e9, w: 2e9, h: 2e9 };
        const keep = S.spec.objects; S.spec.objects = list;
        try { AE.drawLive(g, vis); } finally { S.spec.objects = keep; }
    };

    /* ---------------------------------------------------------------- THE LIBRARY */
    function libraryItems() {
        const items = [];
        for (const t of C.TERRAIN) items.push({ cat: "Terrain", kind: "terrain", t, label: t.label, hint: t.hint });
        for (const [type, T] of Object.entries(C.TYPES)) {
            if (type === "light" || type === "current" || type === "prop" || type === "mover") continue;
            if (T.hidden) continue;   // (14 Oct 2026) kept for old passages, offered no more
            items.push({ cat: T.cat, kind: "object", type, label: T.label, hint: T.hint });
        }
        for (const p of C.PRESETS) items.push({ cat: C.TYPES[p.type].cat, kind: "object", type: p.type, over: p.over, label: p.label, hint: p.hint || C.TYPES[p.type].hint });
        // props: this zone's own pictures first, then everyone's
        const z = S.zone.theme, mine = s => (z === "wood" ? !s.includes("@") : s.endsWith("@" + z));
        const sprites = D().sprites(), list = C.PROP_SPRITES.filter(s => sprites[s] && sprites[s].r);
        for (const s of [...list.filter(mine), ...list.filter(s => !mine(s))]) items.push({ cat: "Scenery", kind: "object", type: "prop", over: { s }, label: AE.spriteName(s) + (s.includes("@") && !mine(s) ? " (" + AE.zoneName(s) + ")" : ""), hint: "A prop: scenery, or set it solid to climb over." });
        return items;
    }
    let libFilter = "", openCats = new Set(["Terrain", "Pickups", "Creatures"]);
    try { const v = JSON.parse(localStorage.getItem("ariadne-editor-cats") || "null"); if (Array.isArray(v)) openCats = new Set(v); } catch (e) { /* fine */ }
    function renderLibrary() {
        const box = $("#library");
        box.innerHTML = "";
        const items = libraryItems().filter(it => !libFilter || it.label.toLowerCase().includes(libFilter) || it.cat.toLowerCase().includes(libFilter));
        for (const cat of C.CATS) {
            const mine = items.filter(it => it.cat === cat);
            if (!mine.length) continue;
            const open = libFilter || openCats.has(cat);
            const head = el("button", { class: "cat-head" + (open ? " open" : ""), type: "button", onclick: () => { if (openCats.has(cat)) openCats.delete(cat); else openCats.add(cat); try { localStorage.setItem("ariadne-editor-cats", JSON.stringify([...openCats])); } catch (e) { /* fine */ } renderLibrary(); } },
                el("span", { html: icon("chevron", 14) }), el("span", { class: "cat-name", text: cat }), el("span", { class: "cat-count", text: String(mine.length) }));
            box.append(head);
            if (!open) continue;
            const grid = el("div", { class: "lib-grid" });
            for (const it of mine) {
                const active = it.kind === "terrain" ? (S.tool === "brush" || S.tool === "rect" || S.tool === "fill") && S.brush === it.t : S.tool === "place" && S.place && S.place.type === it.type && JSON.stringify(S.place.over || {}) === JSON.stringify(it.over || {});
                const b = el("button", { class: "lib-item" + (active ? " active" : ""), type: "button", title: it.label + (it.hint ? "\n" + it.hint : ""),
                    onclick: () => {
                        if (it.kind === "terrain") { S.brush = it.t; if (!["brush", "rect", "fill"].includes(S.tool)) AE.setTool("brush"); else AE.emit("tool"); }
                        else AE.startPlace({ type: it.type, over: it.over, label: it.label });
                    } });
                try { b.append(it.kind === "terrain" ? terrainThumb(it.t) : objectThumb(it.type, it.over)); } catch (e) { b.append(el("span", { class: "thumb", text: "?" })); }
                b.append(el("span", { class: "lib-label", text: it.label }));
                grid.append(b);
            }
            box.append(grid);
        }
    }

    /* ---------------------------------------------------------------- THE TOOLBAR */
    const TOOLS = [["select", "Select", "V"], ["brush", "Brush", "B"], ["rect", "Box of terrain", "R"], ["fill", "Fill", "G"], ["area", "Area: move, copy, flip walls", "M"], ["path", "Path: waypoints", "P"], ["pick", "Pick up", "I"], ["pan", "Hand", "H"]];
    function renderTools() {
        const box = $("#tools");
        box.innerHTML = "";
        for (const [id, label, key] of TOOLS) box.append(el("button", { class: "tool" + (S.tool === id || (id === "select" && S.tool === "place") ? " active" : ""), type: "button", title: label + " (" + key + ")", "aria-label": label, html: icon(id), onclick: () => AE.setTool(id) }));
        renderToolOptions();
    }
    function renderToolOptions() {
        const box = $("#toolopts");
        box.innerHTML = "";
        const head = (t, sub) => el("div", { class: "opt-head" }, el("strong", { text: t }), sub ? el("span", { text: sub }) : null);
        if (S.tool === "brush" || S.tool === "rect" || S.tool === "fill") {
            box.append(head(S.brush.label, ({ brush: "Brush", rect: "Box", fill: "Fill" })[S.tool]));
            box.append(el("p", { class: "hint", text: S.brush.hint || "" }));
            if (S.tool === "brush") {
                const row = el("label", { class: "row" }, el("span", { text: "Size" }), el("input", { type: "range", min: 1, max: 8, value: S.brushSize, oninput: e => { S.brushSize = Number(e.target.value); $("#bsz").textContent = S.brushSize; AE.redraw(); } }), el("span", { id: "bsz", class: "val", text: String(S.brushSize) }));
                box.append(row);
            }
            box.append(el("p", { class: "hint dim", text: "Right button erases. Shift-click draws a line from the last tile painted. [ and ] change the size." }));
        } else if (S.tool === "place" && S.place) {
            box.append(head("Placing", S.place.label));
            box.append(el("p", { class: "hint", text: (C.TYPES[S.place.type] && C.TYPES[S.place.type].paint ? "Click, or drag to lay a row. " : "Click to put one down. ") + "Snapping holds it by its tile's corner; S turns snapping off. Esc or the right button to stop." }));
        } else if (S.tool === "area") {
            box.append(head("Area", S.tileSel ? (S.tileSel.x1 - S.tileSel.x0 + 1) + " × " + (S.tileSel.y1 - S.tileSel.y0 + 1) + " tiles" : "drag a box on the map"));
            box.append(el("label", { class: "check" }, el("input", { type: "checkbox", checked: Boolean(AE.carry), onchange: e => { AE.carry = e.target.checked; } }), el("span", { text: "Carry objects with the walls" })));
            if (S.tileSel) {
                const r = el("div", { class: "btn-row" },
                    el("button", { class: "btn small", type: "button", text: "Flip ↔", onclick: () => AE.areaFlip(true) }),
                    el("button", { class: "btn small", type: "button", text: "Flip ↕", onclick: () => AE.areaFlip(false) }),
                    el("button", { class: "btn small", type: "button", text: "Fill with " + S.brush.label, onclick: () => AE.areaFill(S.brush.tile, S.brush.layer) }),
                    el("button", { class: "btn small danger", type: "button", text: "Clear", onclick: () => AE.areaDelete() }));
                box.append(r);
            }
            box.append(el("p", { class: "hint dim", text: "Drag inside the box to move it; Ctrl-drag copies. Ctrl+C / Ctrl+V copy and paste it at the pointer. Delete clears it." }));
        } else if (S.tool === "path") {
            const o = S.sel.length === 1 ? AE.byKey(S.sel[0]) : null;
            box.append(head("Path", o ? AE.label(o) : "nothing chosen"));
            box.append(el("p", { class: "hint", text: o && AE.canPath(o) ? "Click to add waypoints after where it starts. Drag a waypoint to move it; right-click one to remove it." : "Choose a creature or a moving platform first (Select, V)." }));
        } else if (S.tool === "pick") {
            box.append(head("Pick up", "")); box.append(el("p", { class: "hint", text: "Click a thing to place more like it, or terrain to paint with it." }));
        } else {
            box.append(head("Select", S.sel.length ? S.sel.length + " chosen" : ""));
            box.append(el("p", { class: "hint dim", text: "Click to choose, Shift-click to add, drag an empty spot to box-select. Alt-click picks what is under. Ctrl-drag copies. Arrows nudge a pixel, Shift+arrows a grid step. Double-click opens its settings." }));
        }
    }

    /* ---------------------------------------------------------------- THE INSPECTOR */
    function setField(objs, key, value, label) {
        AE.change(label || "Change " + key, () => { for (const o of objs) { if (value === undefined || value === null || value === "") delete o[key]; else o[key] = value; } }, { objects: true, merge: "f:" + key + ":" + objs.map(o => o._k).join(",") });
        AE.rebuildAct(); AE.emit("change", { objects: true });
    }
    const num = v => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v));
    function fieldRow(label, control, hint, unit) {
        return el("div", { class: "field" }, el("label", { class: "f-label", text: label, title: hint || "" }), el("div", { class: "f-ctl" }, control, unit ? el("span", { class: "unit", text: unit }) : null));
    }
    function control(f, objs) {
        const vals = objs.map(o => o[f.key]), first = vals[0], mixed = vals.some(v => JSON.stringify(v) !== JSON.stringify(first));
        const val = mixed ? undefined : first;
        const set = (v, l) => setField(objs, f.key, v, l || "Change " + f.label.toLowerCase());
        switch (f.kind) {
            case "int": case "num": {
                const i = el("input", { type: "number", step: f.step || (f.kind === "int" ? 1 : 0.1), min: f.min, max: f.max, value: val === undefined ? "" : val, placeholder: mixed ? "mixed" : (f.placeholder || (f.def !== undefined ? String(f.def) : "")), onchange: e => set(num(e.target.value) === undefined ? undefined : f.kind === "int" ? Math.round(num(e.target.value)) : num(e.target.value)) });
                return i;
            }
            case "range": {
                const v = val === undefined ? (f.def !== undefined ? f.def : f.min) : val;
                const out = el("input", { type: "number", class: "range-num", step: f.step, min: f.min, max: f.max, value: val === undefined ? "" : v, placeholder: mixed ? "mixed" : String(f.def !== undefined ? f.def : ""), onchange: e => set(num(e.target.value)) });
                const r = el("input", { type: "range", min: f.min, max: f.max, step: f.step, value: v, oninput: e => { out.value = e.target.value; set(Number(e.target.value)); } });
                return el("div", { class: "range-wrap" }, r, out, el("button", { class: "reset", type: "button", title: "Back to the default", text: "↺", onclick: () => set(undefined, "Reset " + f.label.toLowerCase()) }));
            }
            case "bool": {
                const on = val === undefined ? Boolean(f.def) : Boolean(val);
                return el("button", { class: "switch" + (on ? " on" : "") + (mixed ? " mixed" : ""), type: "button", role: "switch", "aria-checked": String(on), onclick: () => set(f.def && on ? false : !on ? true : f.def ? false : undefined) }, el("span"));
            }
            case "tri": {
                const opts = [[undefined, "Default"], [true, "Yes"], [false, "No"]];
                return el("div", { class: "seg" }, ...opts.map(([v, l]) => el("button", { type: "button", class: !mixed && (val === v || (v === undefined && (val === undefined || val === null))) ? "on" : "", text: l, onclick: () => set(v) })));
            }
            case "select": {
                const s = el("select", { onchange: e => { const opt = f.options.find(o => String(o[0]) === e.target.value); set(opt ? opt[0] : undefined); } });
                if (mixed) s.append(el("option", { value: "", text: "mixed" }));
                for (const [v, l] of f.options) s.append(el("option", { value: String(v), text: l, selected: !mixed && String(val === undefined ? f.def : val) === String(v) }));
                return s;
            }
            case "text": return el("input", { type: "text", value: val === undefined ? "" : val, placeholder: mixed ? "mixed" : (f.placeholder || ""), onchange: e => set(e.target.value || undefined) });
            case "area": return el("textarea", { rows: 3, placeholder: mixed ? "mixed" : "", onchange: e => set(e.target.value) }, val === undefined ? "" : val);
            case "color": {
                const has = typeof val === "string" && /^#[0-9a-f]{6}$/i.test(val);
                return colorPicker(has ? val : undefined, v => set(v), { def: f.def || "#ffb050", placeholder: mixed ? "mixed" : (f.placeholder || undefined), reset: f.def === undefined });
            }
            case "sprite": return spritePicker(objs, val);
            case "tone": return toneControls(val, t => set(t, "Tone"));
            case "hitbox": {
                const o = objs[0], auto = !o.hit;
                const wrap = el("div", { class: "hitbox" });
                wrap.append(el("div", { class: "seg" }, el("button", { type: "button", class: auto ? "on" : "", text: "Picture size", onclick: () => set(undefined, "Hitbox") }), el("button", { type: "button", class: auto ? "" : "on", text: "Custom", onclick: () => { const b = D().propBox(Object.assign({}, o, { hit: null })) || { x: o.x, y: o.y, w: 16, h: 16 }; set({ x: 0, y: 0, w: b.w, h: b.h }, "Hitbox"); } })));
                if (!auto) {
                    const g = el("div", { class: "quad" });
                    for (const k of ["x", "y", "w", "h"]) g.append(el("label", {}, el("span", { text: k.toUpperCase() }), el("input", { type: "number", value: o.hit[k], onchange: e => { const h = Object.assign({}, o.hit, { [k]: Math.round(num(e.target.value) || 0) }); set(h, "Hitbox"); } })));
                    wrap.append(g);
                }
                return wrap;
            }
            case "path": {
                const o = objs[0], n = Array.isArray(o.path) ? o.path.length : 0;
                return el("div", { class: "btn-row" }, el("span", { class: "dim", text: n ? n + (n === 1 ? " waypoint" : " waypoints") : "none" }),
                    el("button", { class: "btn small", type: "button", text: n ? "Edit (P)" : "Draw (P)", onclick: () => AE.setTool("path") }),
                    n ? el("button", { class: "btn small", type: "button", text: "Clear", onclick: () => setField(objs, "path", o.type === "mover" ? [] : undefined, "Clear path") }) : null);
            }
            case "flow": {
                const o = objs[0];
                const dirs = [[-1, 0, "←"], [1, 0, "→"], [0, -1, "↑"], [0, 1, "↓"]];
                return el("div", { class: "seg" }, ...dirs.map(([dx, dy, l]) => el("button", { type: "button", class: (o.dx || 0) === dx && (o.dy || 0) === dy ? "on" : "", text: l, onclick: () => AE.change("Current's flow", () => { for (const x of objs) { x.dx = dx; x.dy = dy; } }) })));
            }
        }
        return el("span", { text: "?" });
    }
    /* ---------------------------------------------------------------- THE COLOUR PICKER
       (14 Oct 2026, the owner's: "replace the colour picker with one that is more user friendly -
       currently the one it has doesn't let you fine tune the colour you're selecting as it keeps
       closing"). The browser's own closed because every change drew the panel again, and the input
       went with it. This one opens in a panel of its own over the page, which a redraw leaves alone:
       a square for how vivid and how light, a strip for the hue, the hex to type, the colours most
       wanted here (metal, brass, rust, fire, and the rest) and the last few picked. It stays open
       while you drag and try, and closes with Done, Escape or a click away. */
    const SWATCHES = [
        "#0a0808", "#1c1b20", "#2a292f", "#3c3b41", "#4a4652", "#6a6872", "#9a98a0", "#d8d6dc",
        "#3e3020", "#5e4c30", "#8a6c3c", "#b8945a", "#e0c070", "#64482e", "#86603a", "#4e8070",
        "#6a1a10", "#c4300a", "#ff8e24", "#ffd25a", "#3a6a22", "#2a6a8a", "#4060a0", "#8a3aa0",
        "#ff3ea8", "#3effe8", "#b6ff3e", "#ffffff"];
    const okHex = c => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
    function hexToHsv(hex) {
        const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [((h * 60) + 360) % 360, mx ? d / mx : 0, mx];
    }
    function hsvToHex(h, s, v) {
        const f = k => { const q = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(q, 4 - q, 1)); };
        return "#" + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
    }
    const recentColours = () => { try { const r = JSON.parse(localStorage.getItem("ae.recentColours") || "[]"); return Array.isArray(r) ? r.filter(okHex) : []; } catch (e) { return []; } };
    const pushRecent = c => { try { localStorage.setItem("ae.recentColours", JSON.stringify([c, ...recentColours().filter(x => x !== c)].slice(0, 9))); } catch (e) { /* no storage: no recents */ } };
    // the button in the panel: the colour, its hex (or what it is when unset)
    function colorPicker(val, onSet, opts) {
        opts = opts || {};
        const has = okHex(val), shown = has ? val : (opts.def || "#ffb050");
        const chip = el("span", { class: "cp-chip" + (has ? "" : " unset") }); chip.style.background = shown;
        const b = el("button", { class: "cp-btn", type: "button", title: "Pick a colour", onclick: () => openColorPop(b, shown, onSet, opts) }, chip, el("span", { class: "cp-hex" + (has ? "" : " dim"), text: has ? val.toUpperCase() : (opts.placeholder || shown.toUpperCase()) }));
        return opts.reset && has ? el("div", { class: "color-wrap" }, b, el("button", { class: "reset", type: "button", title: opts.resetTitle || "Back to the zone's own", text: "↺", onclick: () => onSet(undefined) })) : b;
    }
    function openColorPop(anchor, start, onSet, opts) {
        closePop();
        let [H, S, V] = hexToHsv(start), cur = start, pending = 0, changed = false;
        const pop = el("div", { class: "pop cpick", role: "dialog", "aria-label": "Colour" });
        const SW = 216, SH = 136;
        const sv = el("canvas", { class: "cp-sv", width: SW, height: SH }), hue = el("canvas", { class: "cp-hue", width: SW, height: 14 });
        const prevOld = el("span", { class: "cp-prev", title: "Before" }), prevNew = el("span", { class: "cp-prev", title: "Now" });
        prevOld.style.background = start;
        const hex = el("input", { type: "text", class: "cp-hexin", maxlength: 7, spellcheck: "false", "aria-label": "Hex" });
        const send = () => { pending = 0; changed = true; onSet(cur); };
        const commit = now => { cur = hsvToHex(H, S, V); paint(); if (now) { if (pending) cancelAnimationFrame(pending); send(); } else if (!pending) pending = requestAnimationFrame(send); };
        function paint() {
            const x = sv.getContext("2d");
            x.fillStyle = hsvToHex(H, 1, 1); x.fillRect(0, 0, SW, SH);
            let gr = x.createLinearGradient(0, 0, SW, 0); gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, SW, SH);
            gr = x.createLinearGradient(0, 0, 0, SH); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "#000000"); x.fillStyle = gr; x.fillRect(0, 0, SW, SH);
            const mx = S * (SW - 1), my = (1 - V) * (SH - 1);
            x.lineWidth = 2; x.strokeStyle = V > 0.55 && S < 0.5 ? "#000" : "#fff"; x.beginPath(); x.arc(mx, my, 6, 0, Math.PI * 2); x.stroke();
            const h = hue.getContext("2d"); gr = h.createLinearGradient(0, 0, SW, 0);
            for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, hsvToHex(i * 60 % 360, 1, 1));
            h.fillStyle = gr; h.fillRect(0, 0, SW, 14);
            const hx = H / 360 * (SW - 1); h.fillStyle = "#fff"; h.fillRect(hx - 2, 0, 4, 14); h.fillStyle = "#000"; h.fillRect(hx - 1, 1, 2, 12);
            prevNew.style.background = cur;
            if (document.activeElement !== hex) hex.value = cur.toUpperCase();
        }
        const drag = (cv, fn) => {
            const at = e => { const r = cv.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))); commit(false); };
            cv.addEventListener("pointerdown", e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); at(e); const mv = ev => at(ev), up = () => { cv.removeEventListener("pointermove", mv); cv.removeEventListener("pointerup", up); commit(true); }; cv.addEventListener("pointermove", mv); cv.addEventListener("pointerup", up); });
        };
        drag(sv, (fx, fy) => { S = fx; V = 1 - fy; });
        drag(hue, fx => { H = fx * 359.9; });
        // the arrow keys nudge it, for the last bit of fine tuning (shift: further)
        sv.tabIndex = 0; sv.addEventListener("keydown", e => { const st = e.shiftKey ? 0.05 : 0.01; if (e.key === "ArrowLeft") S = Math.max(0, S - st); else if (e.key === "ArrowRight") S = Math.min(1, S + st); else if (e.key === "ArrowUp") V = Math.min(1, V + st); else if (e.key === "ArrowDown") V = Math.max(0, V - st); else return; e.preventDefault(); e.stopPropagation(); commit(false); });
        hue.tabIndex = 0; hue.addEventListener("keydown", e => { const st = e.shiftKey ? 10 : 1; if (e.key === "ArrowLeft") H = (H - st + 360) % 360; else if (e.key === "ArrowRight") H = (H + st) % 360; else return; e.preventDefault(); e.stopPropagation(); commit(false); });
        hex.addEventListener("input", () => { let v = hex.value.trim(); if (!v.startsWith("#")) v = "#" + v; if (okHex(v)) { [H, S, V] = hexToHsv(v.toLowerCase()); commit(true); } });
        const pickSwatch = c => { [H, S, V] = hexToHsv(c); commit(true); };
        const sw = el("div", { class: "cp-swatches" }, ...SWATCHES.map(c => { const s = el("button", { type: "button", class: "cp-sw", title: c.toUpperCase(), onclick: () => pickSwatch(c) }); s.style.background = c; return s; }));
        const rec = recentColours();
        const recRow = rec.length ? el("div", { class: "cp-recent" }, el("span", { class: "dim small", text: "Recent" }), ...rec.map(c => { const s = el("button", { type: "button", class: "cp-sw", title: c.toUpperCase(), onclick: () => pickSwatch(c) }); s.style.background = c; return s; })) : null;
        const close = () => { if (pending) { cancelAnimationFrame(pending); send(); } if (changed) pushRecent(cur); document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", onKey, true); pop.remove(); };
        const outside = e => { if (!pop.isConnected) { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", onKey, true); return; } if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
        const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
        pop.append(...[sv, hue,
            el("div", { class: "cp-row" }, prevOld, prevNew, hex),
            sw, recRow,
            el("div", { class: "cp-foot" },
                opts.reset ? el("button", { class: "btn small ghost", type: "button", text: opts.resetLabel || "Zone's own", onclick: () => { if (pending) cancelAnimationFrame(pending); pending = 0; changed = false; onSet(undefined); close(); } }) : el("span"),
                el("button", { class: "btn small", type: "button", text: "Done", onclick: close }))].filter(Boolean));
        document.body.append(pop);
        paint();
        const r = anchor.getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + "px";
        const below = r.bottom + 6, above = r.top - pop.offsetHeight - 6;
        pop.style.top = (below + pop.offsetHeight < window.innerHeight - 8 || above < 8 ? Math.max(8, Math.min(window.innerHeight - pop.offsetHeight - 8, below)) : above) + "px";
        setTimeout(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", onKey, true); }, 0);
    }
    AE.colorPicker = colorPicker;

    function toneControls(t, onSet) {
        const tone = Object.assign({}, t || {});
        const wrap = el("div", { class: "tone" });
        const rows = [["l", "Light", -100, 100], ["s", "Colour", -100, 100], ["c", "Contrast", -100, 100], ["ta", "Tint", 0, 100]];
        for (const [k, label, mn, mx] of rows) {
            const out = el("span", { class: "val", text: String(tone[k] || 0) });
            const r = el("input", { type: "range", min: mn, max: mx, step: 1, value: tone[k] || 0, oninput: e => { tone[k] = Number(e.target.value) || 0; out.textContent = String(tone[k]); if (!tone[k]) delete tone[k]; onSet(Object.keys(tone).filter(x => x !== "tint").length ? Object.assign({}, tone) : undefined); } });
            const row = el("label", { class: "row" }, el("span", { text: label }), r, out);
            if (k === "ta") row.insertBefore(el("span", { class: "tint" }, colorPicker(tone.tint || "#4060a0", v => { if (!v) return; tone.tint = v; if (!tone.ta) { tone.ta = 25; r.value = 25; out.textContent = "25"; } onSet(Object.assign({}, tone)); }, { def: "#4060a0", placeholder: "" })), r);
            wrap.append(row);
        }
        wrap.append(el("button", { class: "btn small ghost", type: "button", text: "Reset tone", onclick: () => onSet(undefined) }));
        return wrap;
    }
    AE.toneControls = toneControls;
    function spritePicker(objs, val) {
        const b = el("button", { class: "sprite-pick", type: "button", onclick: () => openSpriteGrid(objs, b) });
        const sp = D().sprites()[val];
        if (sp) { const c = thumbCanvas(32, 32); fitDraw(c, sp.r[0], 0, 0, sp.r[0].width, sp.r[0].height); b.append(c); }
        b.append(el("span", { text: val ? AE.spriteName(val) + (val.includes("@") ? " · " + AE.zoneName(val) : "") : "mixed" }));
        return b;
    }
    function openSpriteGrid(objs, anchor) {
        closePop();
        const pop = el("div", { class: "pop sprite-grid" });
        const sprites = D().sprites();
        const all = [...new Set([...C.PROP_SPRITES, ...Object.keys(sprites).filter(k => !/^scout|^key|^coin|Icon$|^flame|^hflame|^htorch/.test(k))])].filter(k => sprites[k] && sprites[k].r);
        for (const k of all) {
            const c = thumbCanvas(36, 36); fitDraw(c, sprites[k].r[0], 0, 0, sprites[k].r[0].width, sprites[k].r[0].height);
            pop.append(el("button", { type: "button", title: AE.spriteName(k) + (k.includes("@") ? " (" + AE.zoneName(k) + ")" : ""), onclick: () => { setField(objs, "s", k, "Change picture"); closePop(); } }, c));
        }
        document.body.append(pop);
        const r = anchor.getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + "px"; pop.style.top = Math.max(8, Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 6)) + "px";
        setTimeout(() => document.addEventListener("pointerdown", outside), 0);
        function outside(e) { if (!pop.contains(e.target)) { closePop(); document.removeEventListener("pointerdown", outside); } }
    }
    function closePop() { document.querySelectorAll(".pop").forEach(p => p.remove()); }

    function renderInspector() {
        const box = $("#tab-inspect");
        box.innerHTML = "";
        const objs = AE.selected();
        if (!objs.length) {
            if (S.tileSel) { box.append(el("div", { class: "empty" }, el("strong", { text: "An area of the map" }), el("p", { text: (S.tileSel.x1 - S.tileSel.x0 + 1) + " × " + (S.tileSel.y1 - S.tileSel.y0 + 1) + " tiles from " + S.tileSel.x0 + ", " + S.tileSel.y0 + ". Its tools are on the left." }))); return; }
            box.append(el("div", { class: "empty" }, el("strong", { text: "Nothing chosen" }), el("p", { text: "Click something on the map to change it here. The passage's own settings are under Level." })));
            return;
        }
        const types = [...new Set(objs.map(o => o.type))];
        const one = objs.length === 1 ? objs[0] : null, T = C.TYPES[types[0]] || {};
        // the heading: what it is, its layer, and what can be done to it
        const head = el("div", { class: "insp-head" });
        if (one) { const th = thumbCanvas(40, 40); try { const t2 = one.type === "prop" ? objectThumb("prop", { s: one.s }) : objectThumb(one.type, one.type === "light" ? { kind: one.kind, color: one.color } : null); th.getContext("2d").drawImage(t2, -2, -2); } catch (e) { /* none */ } head.append(th); }
        head.append(el("div", { class: "insp-title" }, el("strong", { text: one ? AE.label(one) : objs.length + " objects" }), el("span", { class: "dim", text: one ? layerName(AE.layerOf(one)) : types.length === 1 ? (T.label || types[0]) + " ×" + objs.length : types.length + " kinds" })));
        box.append(head);
        box.append(el("div", { class: "btn-row actions" },
            el("button", { class: "btn small", type: "button", title: "Duplicate (Ctrl+D)", html: icon("copy", 15) + "<span>Duplicate</span>", onclick: () => AE.duplicate() }),
            el("button", { class: "btn small", type: "button", title: "Bring forward (Page Up; Shift: to the front)", html: icon("up", 15), onclick: ev => AE.order(ev.shiftKey ? "front" : "forward") }),
            el("button", { class: "btn small", type: "button", title: "Send back (Page Down; Shift: to the back)", html: icon("down", 15), onclick: ev => AE.order(ev.shiftKey ? "back" : "backward") }),
            el("button", { class: "btn small", type: "button", title: "Mirror (X)", html: icon("mirror", 15), onclick: () => AE.change("Mirror", () => { for (const o of objs) { if (o.type === "prop") o.flip = !o.flip; else o.dir = o.dir === 1 ? -1 : 1; } }) }),
            el("button", { class: "btn small danger", type: "button", title: "Delete (Del)", html: icon("trash", 15), onclick: () => AE.deleteSelected() })));
        if (T.hint && one) box.append(el("p", { class: "hint", text: T.hint }));
        // where
        const pos = el("div", { class: "section" }, el("h4", { text: "Position" }));
        if (one) {
            const g2 = el("div", { class: "quad" });
            for (const k of ["x", "y"]) g2.append(el("label", {}, el("span", { text: k.toUpperCase() }), el("input", { type: "number", value: one[k], onchange: e => { const v = Math.round(num(e.target.value) || 0); AE.change("Move", () => AE.shiftObj(one, k === "x" ? v - one.x : 0, k === "y" ? v - one.y : 0)); } })));
            const A = AE.anchor(one);
            g2.append(el("span", { class: "dim small", text: "tile " + Math.floor((one.x - A.ax) / TS) + ", " + Math.floor((one.y - A.ay) / TS) }));
            pos.append(g2);
        } else pos.append(el("p", { class: "dim small", text: "Drag them on the map, or nudge with the arrow keys." }));
        box.append(pos);
        // its own settings: every field the catalogue lists for its type (for many: the ones they share)
        const fieldsOf = t => (C.TYPES[t] && C.TYPES[t].fields) || [];
        let fields = fieldsOf(types[0]);
        if (types.length > 1) fields = fields.filter(f => types.every(t => fieldsOf(t).some(g => g.key === f.key && g.kind === f.kind)));
        fields = fields.filter(f => objs.every(o => !f.when || f.when(o)));
        if (fields.length) {
            const sec = el("div", { class: "section" }, el("h4", { text: one && D().FOES.has(one.type) ? "Behaviour" : "Settings" }));
            for (const f of fields) {
                if ((f.kind === "path" || f.kind === "hitbox" || f.kind === "flow") && !one) continue;
                if (f.kind === "tone") { sec.append(el("h5", { text: "Tone" })); sec.append(control(f, objs)); continue; }
                sec.append(fieldRow(f.label, control(f, objs), f.hint, f.unit));
                if (f.hint && (f.kind === "tri" || f.kind === "text" || f.kind === "area")) sec.lastChild.append(el("p", { class: "hint small", text: f.hint }));
            }
            box.append(sec);
        }
        if (one && one.type === "mover" && one.axis !== "path") box.append(el("p", { class: "hint", text: "Drag the yellow end handles on the map to set how far it goes." }));
        if (one && (one.type === "upright" || one.type === "crossbeam" || one.type === "root")) box.append(el("p", { class: "hint", text: "The frame is drawn behind everything (its layer is locked under Layers until you unlock it)." }));
    }
    const layerName = k => ({ backdrop: "Frame, behind everything", back: "Behind Scout", objects: "In play", lights: "Lights", front: "In front of Scout" })[k] || k;
    AE.on("focusInspector", o => { AE.select(o._k); showTab("inspect"); setTimeout(() => { const f = $("#tab-inspect input, #tab-inspect textarea"); if (f) f.focus(); }, 30); });

    /* ---------------------------------------------------------------- LEVEL SETTINGS */
    function renderLevel() {
        const box = $("#tab-level");
        box.innerHTML = "";
        const st = S.spec.settings, z = S.index.zones[S.zi];
        const setS = (path, v, label) => { AE.change(label || "Level setting", () => { let o = st; for (let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {}; const k = path[path.length - 1]; if (v === undefined || v === null || v === "") delete o[k]; else o[k] = v; }, { settings: true, merge: "s:" + path.join(".") }); AE.rebuildAct(); AE.emit("change", { settings: true }); };
        box.append(el("div", { class: "section" }, el("h4", { text: title(z.name) + " · Passage " + (ROMAN[S.ai] || S.ai + 1) }),
            el("p", { class: "dim", text: S.spec.w + " × " + S.spec.h + " tiles · " + (S.spec.w / 20).toFixed(1).replace(/\.0$/, "") + " × " + (S.spec.h / 14).toFixed(1).replace(/\.0$/, "") + " rooms · file assets/ariadne-levels/" + S.id + ".json" })));
        // SIZE
        const size = el("div", { class: "section" }, el("h4", { text: "Map size" }));
        const sides = [["top", "Top", 14], ["bottom", "Bottom", 14], ["left", "Left", 20], ["right", "Right", 20]];
        for (const [side, label, room] of sides) size.append(el("div", { class: "resize-row" }, el("span", { text: label }),
            el("button", { class: "btn small", type: "button", text: "−room", title: "Take away a room's worth (" + room + " tiles)", onclick: () => confirmShrink(side, room) }),
            el("button", { class: "btn small", type: "button", text: "−1", onclick: () => confirmShrink(side, 1) }),
            el("button", { class: "btn small", type: "button", text: "+1", onclick: () => AE.resize(side, 1) }),
            el("button", { class: "btn small", type: "button", text: "+room", title: "Add a room's worth (" + room + " tiles) of solid wall", onclick: () => AE.resize(side, room) })));
        size.append(el("p", { class: "hint small", text: "New rows and columns come as solid wall, to carve into. Everything moves with the map." }));
        box.append(size);
        // TONES
        const tones = el("div", { class: "section" }, el("h4", { text: "Tone" }), el("p", { class: "hint small", text: "How light, how colourful and how tinted each part of the scene is drawn. Props have tones of their own." }));
        for (const [k, label] of [["walls", "Walls (in front)"], ["back", "Background walls"], ["env", "Environment (back wall, frame, sky)"]]) {
            const det = el("details", { class: "tone-group", open: openTones.has(k), ontoggle: e => { if (e.target.open) openTones.add(k); else openTones.delete(k); } }, el("summary", { text: label + (st.tone && st.tone[k] ? " ●" : "") }));
            det.append(toneControls(st.tone && st.tone[k], t => setS(["tone", k], t, "Tone: " + label)));
            tones.append(det);
        }
        box.append(tones);
        /* COLOURS (14 Oct 2026, the owner's: "give me more colour options in the level editor"): a
           zone that offers them (the Steamworks: walls, their bands, the floor's edge, the pipes, the
           iron blocks, the gears), each from one colour, shaded and worn by the game; and how worn. */
        const THc = D().theme(S.zone);
        if (THc.colors || THc.wearable) {
            const cs = st.colors || {}, cols = el("div", { class: "section" }, el("h4", { text: "Colours" }), el("p", { class: "hint small", text: "Pick one colour for each; the game shades it, lights it and weathers it." }));
            for (const [k, label, def] of THc.colors || []) cols.append(fieldRow(label, colorPicker(cs[k], v => setS(["colors", k], v, label + " colour"), { def, placeholder: "zone's", reset: true })));
            if (THc.wearable) cols.append(fieldRow("Rust and wear", rangeFor(st.wear, 0, 1, 0.01, 0.5, v => setS(["wear"], v, "Rust and wear")), "None at 0; a half is the zone's own."));
            box.append(cols);
        }
        // DARK AND LIGHT
        const TH = D().theme(S.zone), SD = st.dark || {};
        const dark = el("div", { class: "section" }, el("h4", { text: "Darkness and light" }));
        dark.append(fieldRow("Darkness", el("select", { onchange: e => setS(["dark", "on"], e.target.value === "" ? undefined : e.target.value === "on", "Darkness") },
            el("option", { value: "", text: "Zone's (" + (TH.dark ? "dark" : "lit") + ")", selected: SD.on === undefined }), el("option", { value: "on", text: "Dark", selected: SD.on === true }), el("option", { value: "off", text: "Not dark", selected: SD.on === false }))));
        dark.append(fieldRow("How dark", rangeFor(SD.alpha, 0, 1, 0.01, TH.dark && TH.darkFill ? 0.5 : 0.965, v => setS(["dark", "alpha"], v, "How dark"))));
        dark.append(fieldRow("Dark's colour", colorPicker(SD.color, v => setS(["dark", "color"], v, "Dark's colour"), { def: "#030207", placeholder: "#030207", reset: true, resetLabel: "Default", resetTitle: "Back to the default" })));
        dark.append(fieldRow("Scout's light", rangeFor(st.heroLight, 0, 300, 1, TH.torch ? 34 : TH.heroLight || 64, v => setS(["heroLight"], v, "Scout's light")), "How far the light round him reaches in the dark (and in dark areas). 0: none at all.", "px"));
        dark.append(fieldRow("Its strength", rangeFor(st.heroLightK, 0, 1, 0.01, 1, v => setS(["heroLightK"], v, "Scout's light strength")), "How much it lifts the dark: 1 fully, lower only a glimmer, 0 not at all. His torch's light too."));
        dark.append(fieldRow("His torch's light", rangeFor(st.torchLight, 0, 400, 1, 112, v => setS(["torchLight"], v, "Torch light")), "", "px"));
        dark.append(fieldRow("Starts with a torch", el("div", { class: "seg" }, ...[[undefined, "Zone's"], [true, "Yes"], [false, "No"]].map(([v, l]) => el("button", { type: "button", class: st.torch === v || (v === undefined && (st.torch === undefined || st.torch === null)) ? "on" : "", text: l, onclick: () => setS(["torch"], v, "Torch") })))));
        // (17 Oct 2026) the painted dark's look
        const DP = st.darkPaint || {};
        dark.append(el("h5", { text: "Painted dark" }));
        dark.append(fieldRow("Soft edge", rangeFor(DP.fade, 0, 96, 1, 32, v => setS(["darkPaint", "fade"], v, "Painted dark: soft edge")), "Where it meets lit air (it stays dark right up to rock).", "px"));
        dark.append(fieldRow("Darkness", rangeFor(DP.alpha, 0.3, 1, 0.005, 0.965, v => setS(["darkPaint", "alpha"], v, "Painted dark: darkness"))));
        dark.append(fieldRow("Colour of the dark", colorPicker(DP.color, v => setS(["darkPaint", "color"], v, "Painted dark: colour"), { def: "#030207", placeholder: "#030207", reset: true, resetLabel: "Default", resetTitle: "Back to the default" })));
        dark.append(el("p", { class: "hint small", text: "Turn on Lighting under Layers (or press L) to see the dark here. Lanterns and lights have their own settings." }));
        box.append(dark);
        // THE SEA
        const sea = st.sea || {};
        const seaSec = el("div", { class: "section" }, el("h4", { text: "The sea" }), el("p", { class: "hint small", text: "Everything below the low-tide line is sea. Drag a line by its label on the map." }));
        for (const [k, label] of AE.SEA) {
            const has = typeof sea[k] === "number";
            seaSec.append(fieldRow(label, el("div", { class: "btn-row" },
                el("input", { type: "number", step: 16, value: has ? sea[k] : "", placeholder: "none", onchange: e => setS(["sea", k], num(e.target.value), label) }),
                has ? el("button", { class: "btn small ghost", type: "button", text: "Remove", onclick: () => setS(["sea", k], undefined, "Remove " + label) }) : el("button", { class: "btn small", type: "button", text: "Add", onclick: () => setS(["sea", k], Math.round((AE.viewRect().y + AE.viewRect().h / 2) / 16) * 16, "Add " + label) })), "", "px"));
        }
        box.append(seaSec);
        // DRESSING THE LEVEL the old way
        const auto = el("div", { class: "section" }, el("h4", { text: "Dress it the old way" }), el("p", { class: "hint small", text: "The rules the game once used to place timber and props by itself. Each adds objects you can then move or remove; Undo takes it back." }));
        auto.append(el("div", { class: "btn-col" },
            el("button", { class: "btn small", type: "button", text: "Supports for platforms that have none", onclick: () => autoSupports() }),
            el("button", { class: "btn small", type: "button", text: "Replace the frame with the zone's", onclick: () => autoFrame() }),
            el("button", { class: "btn small", type: "button", text: "Beams across shafts that have none", onclick: () => autoBeams() }),
            el("button", { class: "btn small", type: "button", text: "Scatter props on open floor", onclick: () => autoProps() })));
        box.append(auto);
        // COUNTS
        const O = S.spec.objects, n = t => O.filter(o => o.type === t).length;
        box.append(el("div", { class: "section" }, el("h4", { text: "In this passage" }), el("div", { class: "stats" },
            ...[["Coins", n("coin")], ["Rubies", n("gem")], ["Creatures", O.filter(o => D().FOES.has(o.type)).length], ["Lights", n("torch") + n("light")], ["Props", n("prop")], ["Objects", O.length]].map(([k, v]) => el("div", {}, el("strong", { text: String(v) }), el("span", { text: k }))))));
    }
    const openTones = new Set();   // (the tone groups left open stay open as the panel is drawn again)
    function rangeFor(val, mn, mx, step, def, onSet) {
        const v = typeof val === "number" ? val : def;
        const out = el("input", { type: "number", class: "range-num", step, min: mn, max: mx, value: typeof val === "number" ? val : "", placeholder: String(def), onchange: e => onSet(num(e.target.value)) });
        const r = el("input", { type: "range", min: mn, max: mx, step, value: v, oninput: e => { out.value = e.target.value; onSet(Number(e.target.value)); } });
        return el("div", { class: "range-wrap" }, r, out, el("button", { class: "reset", type: "button", title: "Back to the default", text: "↺", onclick: () => onSet(undefined) }));
    }
    function confirmShrink(side, n) {
        const s = S.spec, horiz = side === "left" || side === "right";
        if ((horiz ? s.w : s.h) - n < (horiz ? 20 : 14)) { AE.toast("A passage is at least one room in size", "error"); return; }
        const X0 = side === "left" ? 0 : side === "right" ? (s.w - n) * TS : -1e9, X1 = side === "left" ? n * TS : side === "right" ? 1e9 : 1e9, Y0 = side === "top" ? 0 : side === "bottom" ? (s.h - n) * TS : -1e9, Y1 = side === "top" ? n * TS : side === "bottom" ? 1e9 : 1e9;
        const lost = s.objects.filter(o => o.x >= X0 && o.x < X1 && o.y >= Y0 && o.y < Y1).length;
        if (lost && !window.confirm(lost + " object" + (lost === 1 ? " stands" : "s stand") + " in what would be taken away. They will be outside the map (shown under Problems). Go on?")) return;
        AE.resize(side, -n);
    }
    function autoSupports() {
        const a = S.act, D2 = D();
        const has = new Set(S.spec.objects.filter(o => ["post", "brace", "chain", "hangrope", "cleat", "ycap"].includes(o.type)).map(o => o.type + ":" + Math.round(o.x / 4) + ":" + Math.round(o.y / 4)));
        // a platform counts as held if a support piece is fixed to it: standing up to its underside, braced into it, or hanging down to its top
        const held = run => {
            const x0 = run.tx * TS, x1 = (run.end + 1) * TS, top = run.ty * TS, under = top + D2.PLAT_H;
            return S.spec.objects.some(o => {
                const b = AE.box(o), across = b.x < x1 + 2 && b.x + b.w > x0 - 2;
                if (o.type === "post" || o.type === "ycap") return across && o.y >= under - 1 && o.y <= under + 10;
                if (o.type === "brace") return across && Math.abs(o.y - under) <= 2;
                if (o.type === "chain" || o.type === "hangrope") return across && Math.abs(o.y + o.h - (top + 2)) <= 3;
                if (o.type === "cleat") return (Math.abs(o.x - x0) <= 4 || Math.abs(o.x + 3 - x1) <= 4) && o.y > under && o.y < under + 30;
                return false;
            });
        };
        const { out } = D2.autoSupports(a, run => !held(run));
        const fresh = out.filter(o => !has.has(o.type + ":" + Math.round(o.x / 4) + ":" + Math.round(o.y / 4)));
        if (!fresh.length) { AE.toast(D().theme(S.zone).supports === false ? "This zone's platforms need no supports" : "Every platform is held up already"); return; }
        AE.change("Supports for platforms", () => { for (const o of fresh) S.spec.objects.push(Object.assign(o, { _k: AE.newKey() })); });
        AE.toast("Added " + fresh.length + " support pieces");
    }
    function autoFrame() {
        if (!window.confirm("Take away this passage's frame (its uprights, rails or roots) and put the zone's usual one in its place?")) return;
        const parts = D().autoFrame(S.act);
        AE.change("Replace the frame", () => { S.spec.objects = [...parts.map(o => Object.assign(o, { _k: AE.newKey() })), ...S.spec.objects.filter(o => !AE.isFrame(o))]; });
        AE.toast("The frame: " + parts.length + " parts");
    }
    function autoBeams() {
        const have = new Set(S.spec.objects.filter(o => o.type === "shaftbeam").map(o => o.x + "," + o.y));
        const fresh = D().autoShaftBeams(S.act).filter(o => !have.has(o.x + "," + o.y));
        if (!fresh.length) { AE.toast("No shaft is missing its beams"); return; }
        AE.change("Shaft beams", () => { for (const o of fresh) S.spec.objects.push(Object.assign(o, { _k: AE.newKey() })); });
        AE.toast("Added " + fresh.length + " shaft beams");
    }
    function autoProps() {
        const props = D().autoProps(S.act, []);
        const near = (p, q) => Math.abs(p.x - q.x) < 24 && Math.abs(p.y - q.y) < 24;
        const fresh = props.filter(p => !S.spec.objects.some(o => (o.type === "prop" || o.type === "light") && near(o, p)));
        if (!fresh.length) { AE.toast("No open floor left for props by the old rules"); return; }
        AE.change("Scatter props", () => { for (const o of fresh) S.spec.objects.push(Object.assign(o, { _k: AE.newKey() })); });
        AE.toast("Scattered " + fresh.length + " props");
    }

    /* ---------------------------------------------------------------- LAYERS */
    const LAYERS = [["backdrop", "Frame and back wall", "Uprights, rails, roots, the back wall and sky"], ["backwalls", "Background walls", null], ["back", "Scenery behind", "Props, timber, signs"], ["terrain", "Terrain", "Walls, platforms, ladders, ropes, spikes"], ["water", "Water and currents", null], ["objects", "Things in play", "Pickups, creatures, doors, platforms…"], ["lights", "Lights", "Lanterns and lights"], ["front", "Scenery in front", "Props Scout passes behind"]];
    const LOCKABLE = { backdrop: "backdrop", back: "back", objects: "objects", lights: "lights", front: "front" };
    const OVERLAYS = [["grid", "Grid", "The snapping grid"], ["rooms", "Rooms", "Each screen of the map, 20 × 14 tiles"], ["secrets", "Hidden places", "What is hidden until found, and walk-behind walls"], ["covers", "Covers (as players see them)", "Hidden rooms covered over, as from outside"], ["collision", "Collision boxes (C)", "What the game tests against"], ["lighting", "Lighting (L)", "The dark of a dark passage, opened by its lights"], ["paths", "Paths and ranges", "Where creatures and platforms go"], ["labels", "Labels", "Doorway names, keys' locks, stomp settings"], ["sea", "The sea's lines", null]];
    function renderLayers() {
        const box = $("#tab-layers");
        box.innerHTML = "";
        const sec = el("div", { class: "section" }, el("h4", { text: "Layers" }));
        for (const [k, label, hint] of LAYERS) {
            const lk = LOCKABLE[k];
            sec.append(el("div", { class: "layer-row" + (S.layers[k] ? "" : " off") },
                el("button", { class: "icon-btn", type: "button", title: S.layers[k] ? "Hide" : "Show", html: icon(S.layers[k] ? "eye" : "eyeOff", 16), onclick: () => { S.layers[k] = !S.layers[k]; renderLayers(); AE.redraw(); } }),
                el("div", { class: "layer-name" }, el("span", { text: label }), hint ? el("small", { text: hint }) : null),
                lk ? el("button", { class: "icon-btn" + (S.locked[lk] ? " on" : ""), type: "button", title: S.locked[lk] ? "Unlock: let clicks choose these" : "Lock: clicks pass through these", html: icon(S.locked[lk] ? "lock" : "unlock", 16), onclick: () => { S.locked[lk] = !S.locked[lk]; renderLayers(); } }) : el("span", { class: "icon-btn ghost" })));
        }
        box.append(sec);
        const ov = el("div", { class: "section" }, el("h4", { text: "Show on the map" }));
        for (const [k, label, hint] of OVERLAYS) ov.append(el("label", { class: "check", title: hint || "" }, el("input", { type: "checkbox", checked: Boolean(S.overlays[k]), onchange: e => { S.overlays[k] = e.target.checked; AE.redraw(); AE.emit("overlays-changed"); } }), el("span", { text: label })));
        box.append(ov);
        box.append(el("div", { class: "section" }, el("h4", { text: "Collision key" }), el("div", { class: "legend" },
            ...[["#ff463c", "Solid: walls, rubble, roots, doors, solid props"], ["#50e6ff", "Walk-behind walls and secret openings"], ["#ffdc3c", "Stood on from above: platforms, tops of props, moving platforms"], ["#5af078", "Ladders and ropes"], ["#ff46dc", "Hurts: spikes, creatures that can't be stomped, steam, icicles"], ["#ff9628", "Stompable creatures (white edge on top), crates"], ["#ffe678", "Pickups"]].map(([c, t]) => el("div", {}, el("i", { style: "background:" + c }), el("span", { text: t }))))));
    }

    /* ---------------------------------------------------------------- PROBLEMS */
    function renderProblems() {
        const box = $("#tab-problems"), list = AE.problems();
        box.innerHTML = "";
        const tabBtn = $('[data-tab="problems"]');
        const errs = list.filter(p => p.level === "error").length;
        tabBtn.querySelector(".badge").textContent = list.length ? String(list.length) : "";
        tabBtn.querySelector(".badge").className = "badge" + (errs ? " err" : list.length ? " warn" : "");
        if (!list.length) { box.append(el("div", { class: "empty" }, el("strong", { text: "No problems" }), el("p", { text: "A start, an exit door and its key, and nothing out of place." }))); return; }
        for (const p of list) box.append(el("button", { class: "problem " + p.level, type: "button", disabled: p.k === undefined, onclick: () => { if (p.k !== undefined) { AE.select(p.k); AE.frameSelection(); } } }, el("span", { html: icon(p.level === "error" ? "err" : "warn", 16) }), el("span", { text: p.text })));
    }

    /* ---------------------------------------------------------------- TABS */
    function showTab(name) {
        document.querySelectorAll("#right .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
        document.querySelectorAll("#right .panel").forEach(p => p.hidden = p.id !== "tab-" + name);
        AE.tab = name;
        if (name === "level") renderLevel(); else if (name === "layers") renderLayers(); else if (name === "problems") renderProblems(); else renderInspector();
    }
    AE.showTab = showTab;

    /* ---------------------------------------------------------------- THE PASSAGE MENU, SAVING */
    function renderPassage() {
        const z = S.index.zones[S.zi];
        $("#passage-zone").textContent = title(z.name);
        $("#passage-name").textContent = "Passage " + (ROMAN[S.ai] || S.ai + 1);
        $("#dirty").hidden = !S.dirty;
        $("#save-btn").classList.toggle("attention", S.dirty);
        $("#save-btn").disabled = S.saving;
        $("#save-label").textContent = S.saving ? "Saving…" : S.dirty ? "Save" : "Saved";
        document.title = (S.dirty ? "● " : "") + title(z.name) + " " + (ROMAN[S.ai] || "") + " · Scout's Trail editor";
        $("#undo-btn").disabled = !S.undo.length; $("#redo-btn").disabled = !S.redo.length;
        $("#undo-btn").title = S.undo.length ? "Undo " + (S.undo[S.undo.length - 1].label || "") + " (Ctrl+Z)" : "Nothing to undo";
        $("#redo-btn").title = S.redo.length ? "Redo " + (S.redo[S.redo.length - 1].label || "") + " (Ctrl+Y)" : "Nothing to redo";
    }
    function openPassageMenu(anchor) {
        closePop();
        const pop = el("div", { class: "pop passage-menu" });
        S.index.zones.forEach((z, zi) => {
            pop.append(el("div", { class: "pm-zone", text: title(z.name) + (z.secret ? " (secret)" : "") }));
            z.passages.forEach((id, ai) => pop.append(el("button", { type: "button", class: id === S.id ? "on" : "", onclick: () => { closePop(); switchTo(id); } }, el("span", { text: "Passage " + (ROMAN[ai] || ai + 1) }), AE.draftOf(id) && id !== S.id ? el("span", { class: "dim small", text: "unsaved draft" }) : null)));
        });
        pop.append(el("hr"));
        pop.append(el("button", { type: "button", html: icon("history", 15) + "<span>Saved versions of this passage…</span>", onclick: () => { closePop(); openVersions(); } }));
        document.body.append(pop);
        const r = anchor.getBoundingClientRect();
        pop.style.left = r.left + "px"; pop.style.top = r.bottom + 6 + "px";
        setTimeout(() => document.addEventListener("pointerdown", function outside(e) { if (!pop.contains(e.target)) { closePop(); document.removeEventListener("pointerdown", outside); } }), 0);
    }
    async function switchTo(id) {
        if (id === S.id) return;
        if (S.dirty) {
            const choice = await ask("Save " + title(S.index.zones[S.zi].name) + " " + (ROMAN[S.ai] || "") + " first?", "You have changes that are not saved. They are kept in this browser as a draft either way.", [["save", "Save", "primary"], ["leave", "Don't save"], ["cancel", "Cancel"]]);
            if (choice === "cancel" || !choice) return;
            if (choice === "save" && !(await AE.save())) return;
        }
        await openLevel(id);
    }
    async function openLevel(id) {
        const draft = AE.draftOf(id);
        let spec = null;
        if (draft) {
            const when = new Date(draft.at).toLocaleString();
            const c = await ask("Unsaved changes found", "This passage has changes from " + when + " that were never saved. Carry on with them?", [["keep", "Carry on with them", "primary"], ["drop", "Throw them away"]]);
            if (c === "keep") spec = draft.spec; else AE.clearDraft(id);
        }
        $("#loading").hidden = false;
        await new Promise(r => setTimeout(r, 30));
        await AE.loadLevel(id, spec);
        thumbCache.clear();
        renderLibrary(); renderPassage(); showTab(AE.tab || "inspect");
        AE.fitMap();
        $("#loading").hidden = true;
        AE.redraw();
    }
    AE.openLevel = openLevel;
    async function openVersions() {
        const r = await (await fetch("/api/history?id=" + encodeURIComponent(S.id), { cache: "no-store" })).json();
        const body = el("div", { class: "versions" });
        if (!r.versions || !r.versions.length) body.append(el("p", { class: "dim", text: "No earlier versions yet: one is kept each time this passage is saved." }));
        for (const v of r.versions || []) {
            const when = v.name.replace(/\.json$/, "").replace(/^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d).*$/, "$1 $2:$3:$4");
            body.append(el("div", { class: "version" }, el("span", { text: when + " UTC" }), el("span", { class: "dim small", text: Math.round(v.size / 1024) + " KB" }),
                el("button", { class: "btn small", type: "button", text: "Open", onclick: async () => { const t = await (await fetch("/api/history?id=" + encodeURIComponent(S.id) + "&name=" + encodeURIComponent(v.name), { cache: "no-store" })).text(); closeModal(); await AE.loadLevel(S.id, JSON.parse(t)); renderPassage(); showTab(AE.tab || "inspect"); AE.toast("Opened the version from " + when + ": save to keep it"); } })));
        }
        modal("Saved versions", body, [["close", "Close"]]);
    }

    /* ---------------------------------------------------------------- DIALOGS */
    function modal(heading, body, buttons) {
        return new Promise(resolve => {
            closeModal();
            const m = el("div", { class: "modal open", role: "dialog", "aria-modal": "true" });
            const card = el("div", { class: "card" }, el("h3", { text: heading }));
            if (typeof body === "string") card.append(el("p", { text: body })); else card.append(body);
            const row = el("div", { class: "btn-row end" });
            for (const [v, l, kind] of buttons) row.append(el("button", { class: "btn" + (kind ? " " + kind : ""), type: "button", text: l, onclick: () => { closeModal(); resolve(v); } }));
            card.append(row);
            m.append(card);
            m.addEventListener("pointerdown", e => { if (e.target === m) { closeModal(); resolve(null); } });
            m.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); resolve(null); } });
            document.body.append(m);
            const first = row.querySelector(".primary") || row.querySelector("button");
            if (first) first.focus();
        });
    }
    const ask = (h, text, buttons) => modal(h, text, buttons);
    function closeModal() { document.querySelectorAll(".modal").forEach(m => m.remove()); }
    AE.modal = modal;
    AE.showHelp = function () {
        const keys = [
            ["Tools", [["V", "Select and move"], ["B", "Brush terrain"], ["R", "Box of terrain"], ["G", "Fill"], ["M", "Area: move, copy, flip walls"], ["P", "Path: waypoints"], ["I", "Pick up what's under the pointer"], ["H / Space", "Move the view"]]],
            ["Editing", [["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+C / X / V", "Copy / cut / paste at the pointer"], ["Ctrl+D", "Duplicate"], ["Ctrl-drag", "Drag a copy"], ["Delete", "Delete"], ["Arrows", "Nudge 1 px (Shift: a grid step)"], ["X", "Mirror"], ["Page Up / Down", "Draw over / under (Shift: to the front / back)"], ["Alt-click", "Choose what is underneath"], ["[ ]", "Brush size"]]],
            ["View", [["Wheel", "Zoom (Shift: scroll across)"], ["Shift+0", "The whole map"], ["Shift+1 · 2 · 3", "Zoom 100%, 200%, 400%"], ["F", "Frame what is chosen"], ["S", "Snap to the grid"], ["C", "Collision boxes"], ["L", "Lighting preview"]]],
            ["Testing", [["T", "Play from the pointer"], ["Shift+T", "Play from the start"], ["Esc", "Back to editing"], ["` (backquote)", "Collision boxes while playing"]]],
            ["Music", [["1", "The jukebox: any of the game's tunes while you edit"], ["0", "Its mixer: each layer of the music on or off"]]],
            ["Saving", [["Ctrl+S", "Save (the game's level file and its bundle)"]]]
        ];
        const body = el("div", { class: "help-grid" });
        for (const [h, rows] of keys) body.append(el("div", {}, el("h5", { text: h }), ...rows.map(([k, t]) => el("div", { class: "keyrow" }, el("kbd", { text: k }), el("span", { text: t })))));
        modal("Keys", body, [["ok", "Close"]]);
    };

    /* ---------------------------------------------------------------- STATUS BAR */
    function renderStatus() {
        const m = S.mouse, a = S.act;
        if (!a) return;
        const tx = Math.floor(m.x / TS), ty = Math.floor(m.y / TS);
        const inMap = m.inside && tx >= 0 && ty >= 0 && tx < a.w && ty < a.h;
        $("#st-pos").textContent = m.inside ? Math.round(m.x) + ", " + Math.round(m.y) + " px" : "—";
        $("#st-tile").textContent = inMap ? "tile " + tx + ", " + ty + " · " + (C.TILE_NAMES[S.spec.tiles[ty][tx]] || S.spec.tiles[ty][tx]) + (S.spec.water[ty][tx] === "~" ? " + water" : S.spec.water[ty][tx] === "m" ? " + murky water" : "") + (S.spec.back[ty][tx] === "#" ? " + wall behind" : "") + (S.spec.dark[ty][tx] === "d" ? " + dark" : S.spec.dark[ty][tx] === "t" ? " + dark transition" : "") + (a.hidden && a.hidden[ty * a.w + tx] ? " · hidden" : "") : "";
        $("#st-room").textContent = inMap ? "room " + Math.floor(tx / 20) + ", " + Math.floor(ty / 14) : "";
        $("#st-sel").textContent = S.sel.length ? S.sel.length + " chosen" : S.tileSel ? (S.tileSel.x1 - S.tileSel.x0 + 1) + " × " + (S.tileSel.y1 - S.tileSel.y0 + 1) + " tiles" : "";
        $("#st-hover").textContent = S.hover ? AE.label(S.hover) : "";
        $("#zoom-val").textContent = Math.round(S.view.z * 100) + "%";
        $("#st-snap").textContent = S.grid.on ? "Snap " + S.grid.size + " px" : "Free placement";
        const busy = AE.renderBusy();
        $("#busy").hidden = !busy;
        if (busy) $("#busy span").textContent = "Drawing the map " + Math.round(busy * 100) + "%";
    }
    let statusQueued = false;
    const queueStatus = () => { if (statusQueued) return; statusQueued = true; requestAnimationFrame(() => { statusQueued = false; renderStatus(); }); };

    /* ---------------------------------------------------------------- MINIMAP */
    let miniInfo = null;
    function renderMinimap() { const c = $("#minimap"); if (!c.hidden) miniInfo = AE.drawMinimap(c); }
    function miniJump(e) { if (!miniInfo) return; const r = e.target.getBoundingClientRect(), x = (e.clientX - r.left) * (e.target.width / r.width), y = (e.clientY - r.top) * (e.target.height / r.height); AE.centerOn((x - miniInfo.ox) / miniInfo.k, (y - miniInfo.oy) / miniInfo.k); }

    /* ---------------------------------------------------------------- WIRING */
    AE.initUI = async function () {
        renderTools();
        $("#lib-search").addEventListener("input", e => { libFilter = e.target.value.trim().toLowerCase(); renderLibrary(); });
        $("#passage-btn").addEventListener("click", e => openPassageMenu(e.currentTarget));
        $("#save-btn").addEventListener("click", () => AE.save().then(ok => ok && AE.toast("Saved " + S.id)));
        $("#undo-btn").addEventListener("click", () => AE.undo());
        $("#redo-btn").addEventListener("click", () => AE.redo());
        $("#snap-btn").addEventListener("click", () => { S.grid.on = !S.grid.on; AE.emit("grid"); AE.redraw(); });
        $("#grid-size").addEventListener("change", e => { S.grid.size = Number(e.target.value); S.grid.on = true; AE.emit("grid"); AE.redraw(); });
        $("#zoom-in").addEventListener("click", () => AE.zoomAt(S.view.z * 1.25, AE.R.cw / 2, AE.R.ch / 2));
        $("#zoom-out").addEventListener("click", () => AE.zoomAt(S.view.z / 1.25, AE.R.cw / 2, AE.R.ch / 2));
        $("#zoom-fit").addEventListener("click", () => AE.fitMap());
        $("#zoom-val").addEventListener("click", () => AE.centerOn(S.view.x + AE.R.cw / 2 / S.view.z, S.view.y + AE.R.ch / 2 / S.view.z, 2));
        $("#help-btn").addEventListener("click", () => AE.showHelp());
        $("#play-btn").addEventListener("click", () => AE.playtest("cursor"));
        $("#play-start").addEventListener("click", () => AE.playtest("start"));
        $("#view-collision").addEventListener("click", () => { S.overlays.collision = !S.overlays.collision; AE.emit("overlays-changed"); AE.redraw(); });
        $("#view-lighting").addEventListener("click", () => { S.overlays.lighting = !S.overlays.lighting; AE.emit("overlays-changed"); AE.redraw(); });
        document.querySelectorAll("#right .tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
        const mm = $("#minimap");
        mm.addEventListener("pointerdown", e => { mm.setPointerCapture(e.pointerId); miniJump(e); const mv = ev => miniJump(ev); mm.addEventListener("pointermove", mv); mm.addEventListener("pointerup", () => mm.removeEventListener("pointermove", mv), { once: true }); });
        $("#mini-toggle").addEventListener("click", () => { mm.hidden = !mm.hidden; $("#mini-toggle").classList.toggle("on", !mm.hidden); renderMinimap(); });
        window.addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

        AE.on("tool", () => { renderTools(); renderLibrary(); });
        AE.on("grid", () => { $("#snap-btn").classList.toggle("on", S.grid.on); $("#grid-size").value = String(S.grid.size); queueStatus(); });
        AE.on("overlays-changed", () => { $("#view-collision").classList.toggle("on", S.overlays.collision); $("#view-lighting").classList.toggle("on", S.overlays.lighting); if (AE.tab === "layers") renderLayers(); });
        AE.on("select", () => { if (AE.tab !== "inspect" && S.sel.length) showTab("inspect"); else if (AE.tab === "inspect") renderInspector(); renderToolOptions(); queueStatus(); AE.redraw(); });
        let panelTimer = 0;
        // (not while a field in the panel is being typed in or a slider dragged: that would pull it from under the pointer)
        let heldBack = false;
        const editing = root => { const a = document.activeElement; const yes = Boolean(a && a.closest && a.closest(root) && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type !== "checkbox" && a.type !== "color"))); if (yes) heldBack = true; return yes; };
        const refreshPanel = () => { if (AE.tab === "inspect") { if (!editing("#right")) renderInspector(); } else if (AE.tab === "problems") renderProblems(); else if (AE.tab === "level" && !editing("#tab-level")) renderLevel(); updateProblemBadge(); };
        AE.on("change", () => { renderPassage(); clearTimeout(panelTimer); panelTimer = setTimeout(refreshPanel, 120); });
        // and once the field is left, what was held back
        $("#right").addEventListener("focusout", e => { if (heldBack && !(e.relatedTarget && $("#right").contains(e.relatedTarget))) { heldBack = false; setTimeout(refreshPanel, 0); } });
        AE.on("dirty", renderPassage);
        AE.on("saving", renderPassage);
        AE.on("saved", j => { renderPassage(); if (j && j.bundleError) AE.toast("Saved, but the game's bundle could not be written: " + j.bundleError, "error"); });
        AE.on("saveError", e => AE.toast("Could not save: " + (e && e.message || e) + ". Is the editor's server still running?", "error"));
        AE.on("mouse", queueStatus); AE.on("view", queueStatus);
        let miniT = 0;
        AE.on("painted", () => { queueStatus(); const now = performance.now(); if (now - miniT > 250) { miniT = now; renderMinimap(); } });
        $("#snap-btn").classList.toggle("on", S.grid.on);
    };
    function updateProblemBadge() { const list = AE.problems(), b = $('[data-tab="problems"] .badge'), errs = list.filter(p => p.level === "error").length; b.textContent = list.length ? String(list.length) : ""; b.className = "badge" + (errs ? " err" : list.length ? " warn" : ""); }
    AE.renderAll = () => { renderLibrary(); renderPassage(); showTab(AE.tab || "inspect"); updateProblemBadge(); };
})();

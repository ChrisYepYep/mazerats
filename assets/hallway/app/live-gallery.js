/* The Events Gallery's exhibits (12 Nov 2026, his: each event's main picture in a frame, a placard in front of it; clicking the placard
   brings up the event; clicking a frame does nothing; new events wait in a list in the editor; hidden and admin-only events are left out).

   - An exhibit is a frame (a "g_frame_*" wall item) and a placard (a "gh_placard" piece), each with ev: the event's slug.
   - The frames and placards are drawn with a plain dark mount (make-gallery-art.js); here each event's own picture is painted into its mount,
     in the light that falls there (read back from the mount as drawn), and cut by whatever stands in front, as the arcade screens are.
   - The events are the site's public list, the one visitors see, so hidden and admin-only ones never appear.
   - Clicking a placard walks you up to it and opens the site's own event window (openSiteLinkInPlace("/event/<slug>")).
   - In the editor, the Exhibits tab lists the events not yet hung, newest first by year: pick one, its frame size and style, then put the
     frame on a wall with the usual wall tool; its picture light and placard are put in front of it for you. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const PLAY = !!window.HALLWAY_PLAY;
    /* the local editor (tools/hallway-editor/server.js) asks through its own read-only routes; the site and the Warren's editor ask the site */
    const LOCAL = !PLAY && !/\/assets\/hallway\//.test(location.pathname);
    const EV_URL = LOCAL ? "/api/events" : "/.netlify/functions/events";
    const picUrl = u => !u || !/^\//.test(u) ? "" : LOCAL ? "/api/eventimg?u=" + encodeURIComponent(u) : u;
    const MOUNT = [0x3a, 0x30, 0x28], CARD = [0x6a, 0x5a, 0x48];

    /* ---- the events ---- */
    let events = [], byKey = new Map(), asked = null;
    const unpack = d => Array.isArray(d) ? d : d && Array.isArray(d.rooms) ? d.rooms : [];
    function load() {
        if (asked) return asked;
        asked = fetch(EV_URL, { headers: { Accept: "application/json" } }).then(r => r.ok ? r.json() : []).then(d => {
            events = unpack(d).filter(e => e && (e.slug || e.id) && e.title).map(e => ({ key: e.slug || e.id, id: e.id, title: String(e.title), date: e.date || "", status: e.status || "", thumb: e.thumb || "" }))
                .sort((a, b) => String(b.date).localeCompare(String(a.date)));
            byKey = new Map(); for (const e of events) { byKey.set(e.key, e); if (e.id) byKey.set(e.id, e); }
            LIVE.wake(); if (Exhibits.onEvents) Exhibits.onEvents(); if (!PLAY && typeof window.checksSoon === "function") window.checksSoon();
            return events;
        }).catch(() => { asked = null; return []; });
        return asked;
    }
    const eventOf = k => k ? byKey.get(k) || null : null;

    /* ---- each event's picture, fitted to a size (the middle of it, as wide as the frame wants), as pixels ---- */
    const pics = new Map(), imgs = new Map();
    function picOf(ev, w, h) {
        const key = ev.key + "|" + w + "x" + h; if (pics.has(key)) return pics.get(key);
        const u = picUrl(ev.thumb); if (!u) { pics.set(key, null); return null; }
        let im = imgs.get(u); if (!im) { im = new Image(); im.onload = () => { for (const k of [...pics.keys()]) if (pics.get(k) === undefined) pics.delete(k); LIVE.wake(); }; im.onerror = () => { im.failed = true; }; im.src = u; imgs.set(u, im); }
        if (im.failed) { pics.set(key, null); return null; }
        if (!im.complete || !im.naturalWidth) return undefined;
        const sw = im.naturalWidth, sh = im.naturalHeight, ta = w / h; let cw = sw, ch = sh, x0 = 0, y0 = 0;
        if (sw / sh > ta) { cw = Math.round(sh * ta); x0 = Math.round((sw - cw) / 2); } else { ch = Math.round(sw / ta); y0 = Math.round((sh - ch) / 2); }
        /* down in two steps, so a small frame still shows the picture rather than a few stray pixels of it */
        const mid = document.createElement("canvas"); mid.width = w * 4; mid.height = h * 4; const mg = mid.getContext("2d"); mg.imageSmoothingQuality = "high"; mg.drawImage(im, x0, y0, cw, ch, 0, 0, mid.width, mid.height);
        const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true }); g.imageSmoothingQuality = "high"; g.drawImage(mid, 0, 0, w, h);
        let d = null; try { d = g.getImageData(0, 0, w, h).data; } catch (e) { d = null; }
        pics.set(key, d); return d;
    }

    /* ---- where each picture's pixels go: a frame's mount or a placard's card, found in its own drawing by colour ---- */
    const art = new Map();
    function artPixels(f) {
        if (art.has(f)) return art.get(f);
        const im = new Image(); art.set(f, null); im.onload = () => {
            const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0);
            art.set(f, { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data }); LIVE.wake();
        }; im.src = "art/wall/" + f; return null;
    }
    const isCol = (d, q, col) => d[q + 3] > 128 && d[q] === col[0] && d[q + 1] === col[1] && d[q + 2] === col[2];
    const mapMemo = new Map();
    /* a frame: the mount's pixels, each with its place in the picture. The frame's face was turned onto the wall a step every two columns
       (gallery-art/art.js hangFrame), so each column's rows are lifted by half its distance along, and the outline adds one all round */
    function frameMap(f, way, fr) {
        const key = f; if (mapMemo.has(key)) return mapMemo.get(key);
        const a = artPixels(f); if (!a) return null;
        const fw = fr.pw + 2 * fr.pad, fx = way === "x" ? 0 : 1, out = [];
        for (let j = 0; j < a.h; j++) for (let i = 0; i < a.w; i++) { if (!isCol(a.d, (j * a.w + i) * 4, MOUNT)) continue;
            const u = i - 1 - fx, lift = way === "x" ? Math.floor(u / 2) : Math.floor((fw - 1 - u) / 2), pu = u - fr.pad, pv = j - 1 - lift - fr.pad;
            if (pu >= 0 && pv >= 0 && pu < fr.pw && pv < fr.ph) out.push(i, j, pu, pv); }
        const m = { w: a.w, h: a.h, pts: out, pw: fr.pw, ph: fr.ph, base: MOUNT }; mapMemo.set(key, m); return m;
    }
    /* a placard: the card's pixels, back through the card's own plane (pic.at: its picture's corner, and one step along each way) */
    function cardMap(fp) {
        const key = fp.f; if (mapMemo.has(key)) return mapMemo.get(key);
        const a = artPixels(fp.f); if (!a || !fp.pic) return null;
        const pw = fp.pic.w, ph = fp.pic.h, [o, p1, p2] = fp.pic.at, U = [(p1[0] - o[0]) / pw, (p1[1] - o[1]) / pw], V = [(p2[0] - o[0]) / ph, (p2[1] - o[1]) / ph], det = U[0] * V[1] - U[1] * V[0], out = [];
        for (let j = 0; j < a.h; j++) for (let i = 0; i < a.w; i++) { if (!isCol(a.d, (j * a.w + i) * 4, CARD)) continue;
            const x = i + .5 - fp.ox - o[0], y = j + .5 - (fp.oy + 4) - o[1], s = (x * V[1] - y * V[0]) / det, t = (U[0] * y - U[1] * x) / det;
            out.push(i, j, Math.max(0, Math.min(pw - 1, Math.floor(s))), Math.max(0, Math.min(ph - 1, Math.floor(t)))); }
        const m = { w: a.w, h: a.h, pts: out, pw, ph, base: CARD }; mapMemo.set(key, m); return m;
    }

    /* ---- the exhibits on a floor: what to paint, where, and who stands where to see what's in front ---- */
    const defOf = k => (window.WALL_ITEMS || []).find(i => i.id === k) || null;
    function exhibits(l) {
        const out = [];
        for (const q of l.wallItems || []) {
            if (!q.ev || !/^g_frame_/.test(q.k)) continue; const def = defOf(q.k), box = def && (q.axis === "x" ? def.x : def.y), r = box && LIVE.wallItemRect(l, q); if (!r || !def.frame) continue;
            const at = Math.floor(q.at - (q.axis === "x" ? 0 : 1) - r.w / 32), who = q.axis === "x" ? { x: at, y: q.line } : { x: q.line, y: at };
            out.push({ ev: q.ev, kind: "frame", f: box.layers[0].f, map: () => frameMap(box.layers[0].f, q.axis, def.frame), x0: Math.round(r.x0), y0: Math.round(r.y0), who, l, key: "f|" + l.id + "|" + q.axis + q.line + "|" + q.at });
        }
        for (const p of l.props || []) {
            if (p.k !== "gh_placard" || !p.ev) continue; const pc = LIVE.pieceOf(p); if (!pc) continue;
            const z = LIVE.tileZ(l, p.x, p.y), a = LIVE.mapPoint(p.x + pc.dx, p.y + pc.dy, z), fp = pc.fp;
            out.push({ ev: p.ev, kind: "card", f: pc.f, p, map: () => cardMap(fp), x0: Math.round(a[0]) - fp.ox, y0: Math.round(a[1]) - fp.oy, w: fp.w, h: fp.h, who: { x: p.x, y: p.y }, l, z, key: "c|" + l.id + "|" + p.x + "," + p.y + "," + (p.rot || 0) });
        }
        return out;
    }

    /* ---- painting: the picture's colours in the mount's own light, cut by what stands in front ---- */
    const peek = document.createElement("canvas"), pk = peek.getContext("2d", { willReadFrequently: true });
    function readBack(view, X0, Y0, w, h) { if (peek.width < w || peek.height < h) { peek.width = Math.max(peek.width, w); peek.height = Math.max(peek.height, h); } pk.clearRect(0, 0, w, h); pk.drawImage(view, X0, Y0, w, h, 0, 0, w, h); return pk.getImageData(0, 0, w, h).data; }
    const made = new Map(); let madeFor = null; const AGAIN_MS = 1000;
    const median = a => { if (!a.length) return 1; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    function make(E, m, pic, c, ox, oy, z) {
        const W = c.canvas.width, H = c.canvas.height, X0 = Math.max(0, Math.floor(ox + E.x0 * z)), Y0 = Math.max(0, Math.floor(oy + E.y0 * z)), X1 = Math.min(W, Math.ceil(ox + (E.x0 + m.w) * z)), Y1 = Math.min(H, Math.ceil(oy + (E.y0 + m.h) * z));
        if (X1 <= X0 || Y1 <= Y0) return null;
        let d; try { d = readBack(c.canvas, X0, Y0, X1 - X0, Y1 - Y0); } catch (e) { return null; }
        const at = (i, j) => { const X = Math.floor(ox + (E.x0 + i + .5) * z) - X0, Y = Math.floor(oy + (E.y0 + j + .5) * z) - Y0; if (X < 0 || Y < 0 || X >= X1 - X0 || Y >= Y1 - Y0) return null; const q = (Y * (X1 - X0) + X) * 4; return [d[q], d[q + 1], d[q + 2]]; };
        /* the light on the mount: its colour as drawn over its colour as made, channel by channel; a pixel far from the usual light is
           something else in front, and takes the usual light (the cut below takes it away if it's furniture) */
        const lights = [], rs = [[], [], []];
        for (let n = 0; n < m.pts.length; n += 4) { const s = at(m.pts[n], m.pts[n + 1]); const L = s ? [s[0] / m.base[0], s[1] / m.base[1], s[2] / m.base[2]] : null; lights.push(L); if (L) for (let k = 0; k < 3; k++) rs[k].push(L[k]); }
        const med = rs.map(median);
        const cv = document.createElement("canvas"); cv.width = m.w; cv.height = m.h; const g = cv.getContext("2d", { willReadFrequently: true }), img = g.createImageData(m.w, m.h);
        for (let n = 0, i = 0; n < m.pts.length; n += 4, i++) {
            let L = lights[i]; if (!L || [0, 1, 2].some(k => Math.abs(L[k] - med[k]) > med[k] * .3 + .05)) L = med;
            const q = (m.pts[n + 3] * m.pw + m.pts[n + 2]) * 4, o = (m.pts[n + 1] * m.w + m.pts[n]) * 4;
            for (let k = 0; k < 3; k++) img.data[o + k] = Math.max(0, Math.min(255, Math.round(pic[q + k] * L[k])));
            img.data[o + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        /* what stands in front: a stand-in at the wall's foot (a frame) or on the placard's own tile */
        try { LIVE.as({ x: E.who.x, y: E.who.y, z: E.z || LIVE.nodeZ(E.l, E.who.x, E.who.y) || 0, l: E.l, dir: 2, frame: 0, st: null }, () => LIVE.cutInFront(g, E.x0, E.y0)); } catch (e) { /* no cut: drawn whole */ }
        return cv;
    }
    const allHere = () => { const m = LIVE.map; if (!m || LIVE.place !== "gallery") return []; const out = []; for (const l of m.levels) for (const E of exhibits(l)) out.push(E); return out; };
    LIVE.add({ still: true, under(c, ox, oy, now) {
        const list = allHere(); if (!list.length) return; load();
        const z = LIVE.zoom, v = LIVE.view(), md = LIVE.mood(), view = [ox, oy, z, c.canvas.width, c.canvas.height, md ? md.a + "|" + md.b + "|" + (+md.f || 0).toFixed(2) : "-", LIVE.tileGen, !!window.hallwayXmas].join(",");
        if (madeFor !== LIVE.map) { made.clear(); madeFor = LIVE.map; }
        for (const E of list) {
            const m = E.map(); if (!m || !m.pts.length) continue;
            if (E.x0 > v.x1 || E.x0 + m.w < v.x0 || E.y0 > v.y1 || E.y0 + m.h < v.y0) continue;
            const ev = eventOf(E.ev); if (!ev) continue; const pic = picOf(ev, m.pw, m.ph); if (!pic) continue;
            const sig = view + "|" + E.ev, was = made.get(E.key);
            let cv = was && was.sig === sig && now - was.at < AGAIN_MS ? was.cv : null;
            if (!cv) { cv = make(E, m, pic, c, ox, oy, z); made.set(E.key, { sig, at: now, cv }); if (made.size > 120) made.clear(); }
            if (!cv) continue;
            c.save(); c.imageSmoothingEnabled = false; c.translate(ox, oy); c.scale(z, z); c.drawImage(cv, E.x0, E.y0); c.restore();
        }
    } });
    setInterval(() => { if (!document.hidden && allHere().length) LIVE.wake(); }, 1500);

    /* ---- a placard's click: walk up to it, then the event's own window ---- */
    const fronts = p => (p.rot || 0) & 1 ? [[p.x + 1, p.y], [p.x, p.y + 1], [p.x, p.y - 1], [p.x - 1, p.y]] : [[p.x, p.y + 1], [p.x + 1, p.y], [p.x - 1, p.y], [p.x, p.y - 1]];
    function open(ev) {
        const path = "/event/" + encodeURIComponent(ev.key); if (window.hwTrack) window.hwTrack("hallway_gallery_placard");
        if (!PLAY) { if (window.HallwayWindow) HallwayWindow.open(ev.title, "On the site this placard opens the event's own window (" + path + ")."); return; }
        try { const host = window.parent !== window ? window.parent : null; if (host && typeof host.openSiteLinkInPlace === "function" && host.openSiteLinkInPlace(path)) return; if (host) { host.location.href = path; return; } } catch (e) { /* not the site around it */ }
        window.open(path, "_blank", "noopener");
    }
    LIVE.onClick((px, py) => {
        const l = LIVE.floor; if (!l) return false;
        const hit = exhibits(l).filter(E => E.kind === "card").sort((a, b) => (b.p.x + b.p.y) - (a.p.x + a.p.y)).find(E => px >= E.x0 + 1 && px <= E.x0 + E.w - 1 && py >= E.y0 && py <= E.y0 + E.h - 2);
        if (!hit) return false; const ev = eventOf(hit.ev); if (!ev) return false;
        const w = LIVE.walker, free = fronts(hit.p).find(([x, y]) => LIVE.tileFree(l)(x, y));
        if (!w || !free || (Math.round(w.x) === free[0] && Math.round(w.y) === free[1] && !w.walking)) { open(ev); return true; }
        return !!LIVE.walkTo(l, free[0], free[1], () => open(ev));
    });

    /* ---- the editor's Exhibits tab, and the event pick on a selected frame or placard ---- */
    const Exhibits = window.GalleryExhibits = { load, get events() { return events; }, eventOf, onEvents: null };
    if (PLAY) { load(); if (LIVE.onPlace) LIVE.onPlace(p => { if (p === "gallery" && window.hwTrack) window.hwTrack("hallway_gallery_enter"); }); return; }
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const btn = (t, fn, cls) => { const b = el("button", "btn small " + (cls || ""), t); b.type = "button"; b.addEventListener("click", fn); return b; };
    const api = () => LIVE.editorApi();
    const hung = () => { const root = LIVE.root, g = root && root.gallery, s = new Set(); if (!g) return s; for (const l of g.levels) { for (const q of l.wallItems || []) if (q.ev) s.add(q.ev); } return s; };
    const fieldSel = (label, opts, value, onChange) => { const f = el("label", "field"), n = el("span", "f-label", label), s = el("select", "f-ctl"); for (const [v, t] of opts) { const o = el("option", "", t); o.value = v; s.appendChild(o); } s.value = value; s.addEventListener("change", () => onChange(s.value)); f.append(n, s); return f; };
    const STYLES = [["gilt", "Gilt"], ["modern", "Modern"], ["walnut", "Walnut"]], SIZES = [["S", "Small"], ["M", "Medium"], ["L", "Large"]];
    let style = localStorage.getItem("gallery-frame") || "gilt", size = localStorage.getItem("gallery-size") || "M", withLight = localStorage.getItem("gallery-light") !== "0";
    let pending = null;      // { ev, k, before: Set of frames already there }
    const frameKey = (l, q) => l.id + "|" + q.axis + "|" + q.line + "|" + q.at;
    function framesNow() { const s = new Set(), m = LIVE.map; if (!m) return s; for (const l of m.levels) for (const q of l.wallItems || []) if (/^g_frame_/.test(q.k)) s.add(frameKey(l, q)); return s; }
    /* the frame he's just hung: its event, its light above it, its placard in front of it on the floor */
    function finish(l, q) {
        const def = defOf(q.k), fr = def && def.frame; q.ev = pending.ev;
        if (withLight && fr) { l.wallItems.push({ k: "g_piclight", axis: q.axis, line: q.line, at: q.at, h: (q.h || def.h || 80) + Math.ceil((fr.ph + 2 * fr.pad) / 2) + 8 }); }
        const px = q.axis === "x" ? Math.floor(q.at) : q.line + 1, py = q.axis === "x" ? q.line + 1 : Math.floor(q.at - .5), rot = q.axis === "x" ? 0 : 1;
        const taken = (l.props || []).some(p => window.FurniParts.tiles(p).some(t => t[0] === px && t[1] === py));
        if (!taken) (l.props = l.props || []).push({ k: "gh_placard", x: px, y: py, rot, ev: pending.ev });
        const ev = eventOf(pending.ev); pending = null; api().changed(); api().setTool("select"); render();
        api().flash(taken ? "Hung. No room for its placard in front: put one down with the Placard piece and pick the event on it." : "Hung" + (ev ? ": " + ev.title : "") + ".");
    }
    setInterval(() => {
        if (!pending) return; const m = LIVE.map; if (!m || LIVE.place !== "gallery") return;
        for (const l of m.levels) for (const q of l.wallItems || []) if (q.k === pending.k && !q.ev && !pending.before.has(frameKey(l, q))) return finish(l, q);
        if (api().tool !== "wi:" + pending.k) { pending = null; render(); }
    }, 200);
    function hang(ev) {
        if (LIVE.place !== "gallery") { LIVE.setPlace("gallery"); }
        const k = "g_frame_" + style + "_" + size; pending = { ev: ev.key, k, before: framesNow() };
        api().setTool("wi:" + k); api().flash("Now click a wall in the gallery to hang " + ev.title + ". Esc or another tool cancels."); render();
    }
    let box = null;
    function render() {
        if (!box) return; box.textContent = "";
        box.appendChild(el("p", "hint", "The site's events (the ones visitors see) not yet in the Events Gallery, newest first. Pick the frame, then Hang one and click a wall: its picture light and placard go in front of it. The picture is painted in live from the event's own."));
        box.append(fieldSel("Frame", STYLES, style, v => { style = v; localStorage.setItem("gallery-frame", v); }), fieldSel("Size", SIZES, size, v => { size = v; localStorage.setItem("gallery-size", v); }));
        { const f = el("label", "field"), n = el("span", "f-label", "Picture light"), c = el("span", "f-ctl"), t = el("input"); t.type = "checkbox"; t.checked = withLight; t.addEventListener("change", () => { withLight = t.checked; localStorage.setItem("gallery-light", withLight ? "1" : "0"); }); c.appendChild(t); f.append(n, c); box.appendChild(f); }
        if (!events.length) { box.appendChild(el("p", "hint", asked ? "Fetching the events…" : "Couldn't fetch the events.")); if (!asked) box.appendChild(btn("Try again", () => { load().then(render); })); return; }
        const done = hung(), left = events.filter(e => !done.has(e.key));
        if (pending) { const ev = eventOf(pending.ev); box.appendChild(el("p", "hint", "Hanging " + (ev ? ev.title : pending.ev) + ": click a wall.")); }
        if (!left.length) box.appendChild(el("p", "hint", "Every event is hung."));
        let year = null;
        for (const e of left) {
            const y = String(e.date).slice(0, 4) || "Undated"; if (y !== year) { year = y; box.appendChild(el("h4", "ex-year", y)); }
            const row = el("div", "ex-row"); row.style.cssText = "display:flex;align-items:center;gap:8px;margin:4px 0";
            const th = el("img"); th.width = 48; th.height = 26; th.style.cssText = "object-fit:cover;border-radius:3px;background:#3a3028;flex:none"; th.alt = ""; th.loading = "lazy"; const u = picUrl(e.thumb); if (u) th.src = u;
            const t = el("div", "", e.title); t.style.cssText = "flex:1;min-width:0;font-size:12px;line-height:1.25";
            if (e.status === "upcoming") { const s = el("span", "", " (upcoming)"); s.style.opacity = ".6"; t.appendChild(s); }
            row.append(th, t, btn(pending && pending.ev === e.key ? "Hanging…" : "Hang", () => hang(e))); box.appendChild(row);
        }
        const placed = events.filter(e => done.has(e.key)); if (placed.length) { box.appendChild(el("h4", "ex-year", "Hung (" + placed.length + ")")); const p = el("p", "hint", placed.map(e => e.title).join(" · ")); box.appendChild(p); }
    }
    Exhibits.onEvents = render;
    /* the tab itself, after Lost Property */
    function addTab() {
        const tabs = document.querySelector('.tab[data-tab="lost"]'), panels = document.getElementById("tab-lost"); if (!tabs || !panels || document.getElementById("tab-exhibits")) return;
        const b = el("button", "tab", "Exhibits"); b.type = "button"; b.dataset.tab = "exhibits"; b.setAttribute("role", "tab"); tabs.after(b);
        const p = el("div", "panel"); p.id = "tab-exhibits"; p.hidden = true; box = el("div"); box.id = "exhibitsBox"; p.appendChild(box); panels.after(p);
        b.addEventListener("click", () => { document.querySelectorAll(".tab").forEach(t => { const on = t === b; t.classList.toggle("active", on); t.setAttribute("aria-selected", String(on)); }); document.querySelectorAll(".panel").forEach(q => { if (q.id && q.id.startsWith("tab-")) q.hidden = q !== p; }); load().then(render); render(); });
    }
    addTab();
    /* a selected frame or placard: which event it shows */
    Exhibits.inspect = (hit, into) => {
        const isFrame = hit.type === "wallitem" && /^g_frame_/.test(hit.o.k), isCard = hit.type === "prop" && hit.o.k === "gh_placard"; if (!isFrame && !isCard) return;
        load(); const opts = [["", "None"]].concat(events.map(e => [e.key, (String(e.date).slice(0, 4) || "") + " · " + e.title]));
        if (hit.o.ev && !eventOf(hit.o.ev)) opts.push([hit.o.ev, hit.o.ev + " (not in the site's list)"]);
        into.appendChild(fieldSel("Event", opts, hit.o.ev || "", v => { api().snapshot(); if (v) hit.o.ev = v; else delete hit.o.ev; api().changed(); render(); }));
        if (!events.length) asked && asked.then(() => { if (into.isConnected) api().paint(); });
    };
    load();
})();

/* Ariadne's Thread level editor: the mouse and the keys (14 Oct 2026).

   Tools (their keys):
     V  Select    click to choose, drag to move, drag an empty spot to choose
                  everything in a box; the handles on what is chosen resize
                  it, set a platform's ends, a light's reach
     B  Brush     paint terrain; the right button erases
     R  Box       a box of terrain at once
     G  Fill      the whole patch of one kind of tile
     M  Area      choose a box of the map: drag it to move its walls (and,
                  with "Carry objects", what stands in it), copy, delete
     P  Path      waypoints for the chosen creature or platform
     I  Pick      take up whatever is under the pointer as the brush or the
                  thing to place
     H  Hand      move the view (the space bar or the middle button, any time)
   Arrows nudge what is chosen a pixel (Shift: a grid step). */
(function () {
    "use strict";
    const AE = window.AE, S = AE.S, C = AE.CATALOG;
    const D = () => window.RatRace.dev;
    const TS = 16;
    let drag = null, spaceDown = false, lastPaint = null, clip = null;
    const HANDLE = 5;   // screen pixels either side of a handle's middle

    /* ---------------------------------------------------------------- SNAPPING */
    const snapOn = ev => S.grid.on !== Boolean(ev && ev.altKey && ev.ctrlKey);
    const gs = () => S.grid.size;
    // an object's x, y with its anchor (its tile's corner) on the grid
    function snapObj(o, x, y, ev) {
        if (!snapOn(ev)) return { x: Math.round(x), y: Math.round(y) };
        const A = AE.anchor(o), g = gs();
        return { x: Math.round((x - A.ax) / g) * g + A.ax, y: Math.round((y - A.ay) / g) * g + A.ay };
    }
    const snapV = (v, ev) => (snapOn(ev) ? Math.round(v / gs()) * gs() : Math.round(v));
    /* (22 Oct 2026, the owner's: "multiple coins can be placed on the same tile when grid snap is toggled on") one of
       the same kind already where o would go: snapping, in the same grid square (where it would snap to, so one put
       down off the grid counts for its square too); not, within near px */
    function sameSpot(o, ev, near) {
        if (snapOn(ev)) {
            const A = AE.anchor(o), g = gs(), cell = q => Math.round((q.x - A.ax) / g) + "," + Math.round((q.y - A.ay) / g), mine = cell(o);
            return S.spec.objects.find(q => q !== o && q.type === o.type && cell(q) === mine) || null;
        }
        return S.spec.objects.find(q => q !== o && q.type === o.type && Math.abs(q.x - o.x) < near && Math.abs(q.y - o.y) < near) || null;
    }

    /* ---------------------------------------------------------------- PICKING */
    const PRI = { front: 4, lights: 3, objects: 3, back: 2, backdrop: 1 };
    const pickable = o => { const L = AE.layerOf(o); const shown = L === "front" ? S.layers.front : L === "back" ? S.layers.back : L === "lights" ? S.layers.lights : L === "backdrop" ? S.layers.backdrop : S.layers.objects; return shown && !S.locked[L]; };
    /* What is drawn as part of a thing but outside its box: a post's knee
       braces, flaring out under what it holds; a frame upright's braces, up
       under each rail it meets. A click on them chooses the thing. */
    function extras(o) {
        if (o.type === "post" && o.knees) return [{ x: o.x - 9, y: o.y, w: 26, h: 12 }];
        if (o.type === "upright" && o.braces !== false) {
            const W = D().frameWidth("post"), railH = D().frameWidth("rail"), out = [];
            for (const r of S.spec.objects) if (r.type === "crossbeam" && r.x <= o.x && r.x + r.w >= o.x + W && o.y <= r.y && o.y + o.h >= r.y + railH) out.push({ x: o.x - 40, y: r.y + railH, w: W + 80, h: 40 });
            return out;
        }
        return [];
    }
    // On a brace itself, not just near it: a post's knees are small enough to count whole; a frame brace climbs
    // from low beside the upright to the rail, one pixel up for each one out, so the click must be near that line.
    function onBrace(o, b, e, wx, wy) {
        if (o.type === "post") return true;
        const d = wx < b.x ? b.x - wx : wx - (b.x + b.w);
        return d >= 0 && d <= 40 && Math.abs((wy - e.y) - (33 - d)) < 7;
    }
    function candidates(wx, wy) {
        const pad = 2 / S.view.z, out = [];
        const inside = b => wx >= b.x - pad && wx < b.x + b.w + pad && wy >= b.y - pad && wy < b.y + b.h + pad;
        for (const o of S.spec.objects) {
            if (!pickable(o)) continue;
            const b = AE.box(o);
            if (inside(b) || (!inside(b) && extras(o).some(e => inside(e) && onBrace(o, b, e, wx, wy)))) out.push({ o, pri: PRI[AE.layerOf(o)] || 0, area: b.w * b.h });
        }
        out.sort((p, q) => q.pri - p.pri || p.area - q.area);
        return out.map(c => c.o);
    }
    AE.pick = (wx, wy) => candidates(wx, wy)[0] || null;

    /* HANDLES on the one thing chosen: where they are, and what dragging each does. */
    function handlesOf(o) {
        const H = [], b = AE.box(o);
        const add = (x, y, kind, set, cursor) => { const h = { x, y, kind, set, cursor }; H.push(h); return h; };
        switch (o.type) {
            // (22 Oct 2026) the other end of a zipline; the end of a rope, the ring of a chandelier
            case "zipline": add(o.x + 8 + (o.dx === undefined ? 160 : o.dx), o.y + 4 + (o.dy === undefined ? 48 : o.dy), "corner", (p, ev) => { o.dx = Math.round(snapV(p.x - o.x - 8, ev)); o.dy = Math.round(snapV(p.y - o.y - 4, ev)); }, "move"); break;
            case "swing": add(o.x + 8, o.y + (o.len > 0 ? o.len : (o.kind === "chandelier" ? 40 : 72)), "edge", (p, ev) => { o.len = Math.max(24, Math.round(snapV(p.y - o.y, ev))); }, "ns-resize"); break;
            case "rails": add(b.x + b.w, b.y + b.h / 2, "edge", (p, ev) => { o.w = Math.max(16, snapV(p.x - o.x, ev) || 16); }, "ew-resize"); break;
            case "current": case "darkzone": case "supportarea": case "scree": case "quicksand": case "pool":
                add(b.x + b.w, b.y + b.h, "corner", (p, ev) => { o.w = Math.max(16, snapV(p.x - o.x, ev) || 16); o.h = Math.max(16, snapV(p.y - o.y, ev) || 16); }, "nwse-resize");
                add(b.x + b.w, b.y + b.h / 2, "edge", (p, ev) => { o.w = Math.max(16, snapV(p.x - o.x, ev) || 16); }, "ew-resize");
                add(b.x + b.w / 2, b.y + b.h, "edge", (p, ev) => { o.h = Math.max(16, snapV(p.y - o.y, ev) || 16); }, "ns-resize");
                break;
            case "upright": case "root": case "post": case "chain": case "hangrope":
                add(b.x + b.w / 2, o.y + o.h, "edge", (p, ev) => { o.h = Math.max(3, snapV(p.y, ev) - o.y); }, "ns-resize");
                add(b.x + b.w / 2, o.y, "edge", (p, ev) => { const bot = o.y + o.h, ny = Math.min(bot - 3, snapV(p.y, ev)); o.h = bot - ny; o.y = ny; }, "ns-resize");
                break;
            case "crossbeam": case "shaftbeam":
                add(o.x + o.w, b.y + b.h / 2, "edge", (p, ev) => { o.w = Math.max(8, snapV(p.x, ev) - o.x); }, "ew-resize");
                add(o.x, b.y + b.h / 2, "edge", (p, ev) => { const r = o.x + o.w, nx = Math.min(r - 8, snapV(p.x, ev)); o.w = r - nx; o.x = nx; }, "ew-resize");
                break;
            // (21 Oct 2026) a waterfall: its bottom edge its length; its right edge the width of a curtain, a seep or a row of drips
            case "waterfall":
                add(b.x + b.w / 2, b.y + b.h, "edge", (p, ev) => { o.h = Math.max(16, Math.min(1600, snapV(p.y, ev) - o.y)); }, "ns-resize");
                if (["curtain", "seep", "drips"].includes(o.kind || "curtain")) add(b.x + b.w, b.y + Math.min(b.h / 2, 24), "edge", (p, ev) => { o.w = Math.max(4, Math.min(256, snapV(p.x, ev) - o.x)); }, "ew-resize");
                break;
            case "brace":
                add(o.x + o.dir * (o.len - 1), o.y + o.len - 1, "edge", p => { o.len = Math.max(2, Math.round(Math.max(Math.abs(p.x - o.x), p.y - o.y)) + 1); }, "nwse-resize");
                break;
            case "mover":
                if (o.axis === "h") { add(o.min, o.y + 5, "range", (p, ev) => { o.min = Math.min(snapV(p.x, ev), o.max); }, "ew-resize"); add(o.max + (o.w || 48), o.y + 5, "range", (p, ev) => { o.max = Math.max(snapV(p.x - (o.w || 48), ev), o.min); }, "ew-resize"); }
                else if (o.axis === "v") { add(o.x + (o.w || 48) / 2, o.min, "range", (p, ev) => { o.min = Math.min(snapV(p.y, ev), o.max); }, "ns-resize"); add(o.x + (o.w || 48) / 2, o.max + 11, "range", (p, ev) => { o.max = Math.max(snapV(p.y - 11, ev), o.min); }, "ns-resize"); }
                add(o.x + (o.w || 48), o.y + 5, "edge", (p, ev) => { o.w = Math.max(16, Math.round((p.x - o.x) / 16) * 16); }, "ew-resize");
                break;
            case "light": {
                const L = D().lightOf(o);
                if (L.kind === "shaft") {
                    const a = (L.angle - 90) * Math.PI / 180, ex = o.x - Math.sin(a) * L.h, ey = o.y + Math.cos(a) * L.h;
                    add(ex, ey, "light", p => { const dx = p.x - o.x, dy = p.y - o.y; o.h = Math.max(8, Math.round(Math.hypot(dx, dy))); o.angle = (Math.round(Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360; }, "crosshair");
                    add(o.x + Math.cos(a) * L.w / 2, o.y + Math.sin(a) * L.w / 2, "light", p => { o.w = Math.max(2, Math.round(Math.hypot(p.x - o.x, p.y - o.y) * 2)); }, "ew-resize");
                } else {
                    const ang = (L.kind === "spot" ? L.angle : 0) * Math.PI / 180, R = L.radius || 0;
                    add(o.x + Math.cos(ang) * R, o.y + Math.sin(ang) * R, "light", p => { const dx = p.x - o.x, dy = p.y - o.y; o.radius = Math.max(0, Math.round(Math.hypot(dx, dy))); if (L.kind === "spot") o.angle = (Math.round(Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360; }, "crosshair");
                    if (L.reveal > 0) add(o.x - L.reveal, o.y, "reveal", p => { o.reveal = Math.max(0, Math.round(Math.hypot(p.x - o.x, p.y - o.y))); }, "ew-resize");
                }
                break;
            }
            case "torch": { const TH = D().theme(S.zone), L = D().lampAt(D().lampStyle(o)), R = typeof o.radius === "number" ? o.radius : 70; add(o.x + L.gx + R, o.y + L.gy, "light", p => { o.radius = Math.max(0, Math.round(Math.hypot(p.x - o.x - L.gx, p.y - o.y - L.gy))); }, "ew-resize"); break; }
            case "prop": if (o.hit && (o.solid === "solid" || o.solid === "top")) add(o.x + o.hit.x + o.hit.w, o.y + o.hit.y + o.hit.h, "hit", (p, ev) => { o.hit.w = Math.max(1, Math.round(p.x - o.x - o.hit.x)); o.hit.h = Math.max(1, Math.round(p.y - o.y - o.hit.y)); }, "nwse-resize"); break;
        }
        // waypoints, for whatever keeps to a path
        if (Array.isArray(o.path)) {
            const T = D().TYPES[o.type] || { w: 16, h: 16 }, ox = o.type === "mover" ? (o.w || 48) / 2 : T.w / 2, oy = o.type === "mover" ? 5 : T.h / 2;
            o.path.forEach((pt, i) => add(pt.x + ox, pt.y + oy, "way", (p, ev) => { const s = snapObj(o, p.x - ox, p.y - oy, ev); pt.x = s.x; pt.y = s.y; }, "move").index = i);
        }
        return H;
    }
    AE.handlesOf = handlesOf;
    function handleAt(sx, sy) {
        if (S.sel.length !== 1 || S.tool !== "select" && S.tool !== "path") return null;
        const o = AE.byKey(S.sel[0]);
        if (!o) return null;
        for (const h of handlesOf(o)) { const p = AE.toScreen(h.x, h.y); if (Math.abs(p.x - sx) <= HANDLE + 1 && Math.abs(p.y - sy) <= HANDLE + 1) return { h, o }; }
        return null;
    }
    // the sea's lines, dragged by their labels
    function seaAt(sx, sy) {
        if (!S.overlays.sea) return null;
        const sea = S.spec.settings.sea;
        if (!sea) return null;
        for (const [k] of AE.SEA) { if (typeof sea[k] !== "number") continue; const p = AE.toScreen(Math.max(AE.viewRect().x, 0), sea[k]); if (sx >= p.x + 4 && sx <= p.x + 90 && sy >= p.y - 18 && sy <= p.y + 2) return k; }
        return null;
    }

    /* ---------------------------------------------------------------- TERRAIN */
    // as the brush goes over the map: changed now, drawn now, one step to undo when the button comes up
    function live() { AE.rebuildAct(); AE.emit("change", { tiles: true }); }
    function paintAt(tx, ty, ch, layer) {
        let n = 0;
        const r = S.brushSize, o = Math.floor((r - 1) / 2);
        for (let y = ty - o; y < ty - o + r; y++) for (let x = tx - o; x < tx - o + r; x++) if (AE.setTile(layer, x, y, ch)) n++;
        return n;
    }
    function paintLine(t0, t1, ch, layer) {
        let n = 0, x0 = t0.x, y0 = t0.y;
        const dx = Math.abs(t1.x - x0), dy = -Math.abs(t1.y - y0), sx = x0 < t1.x ? 1 : -1, sy = y0 < t1.y ? 1 : -1;
        let err = dx + dy;
        for (let i = 0; i < 4000; i++) {
            n += paintAt(x0, y0, ch, layer);
            if (x0 === t1.x && y0 === t1.y) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
        return n;
    }
    // the eraser takes away from the layer the brush paints on
    const eraseCh = layer => (layer === "tiles" ? "." : ".");
    function flood(tx, ty, ch, layer) {
        const R = AE.layerRows(layer), from = R[ty] && R[ty][tx];
        if (from === undefined || from === null || from === (layer === "water" ? (ch === "~" || ch === "m" ? ch : ".") : layer === "dark" ? (ch === "d" || ch === "t" ? ch : ".") : layer === "back" ? (ch === "#" ? "#" : ".") : ch)) return 0;
        const st = [[tx, ty]], seen = new Set();
        let n = 0;
        while (st.length && n < 40000) {
            const [x, y] = st.pop(), k = x + "," + y;
            if (seen.has(k) || x < 0 || y < 0 || x >= S.spec.w || y >= S.spec.h || R[y][x] !== from) continue;
            seen.add(k); AE.setTile(layer, x, y, ch); n++;
            st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        return n;
    }
    const tileOfPoint = p => ({ x: Math.floor(p.x / TS), y: Math.floor(p.y / TS) });

    /* AREAS (the M tool): a box of tiles, lifted with what stands in it */
    function areaContents(r, carry) {
        const grab = key => AE.layerRows(key).slice(r.y0, r.y1 + 1).map(row => row.slice(r.x0, r.x1 + 1));
        const objs = carry ? S.spec.objects.filter(o => { const b = AE.box(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx >= r.x0 * TS && cx < (r.x1 + 1) * TS && cy >= r.y0 * TS && cy < (r.y1 + 1) * TS && !AE.isFrame(o); }) : [];
        return { w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1, tiles: grab("tiles"), back: grab("back"), water: grab("water"), dark: grab("dark"), rails: grab("rails"), objs };
    }
    function clearArea(r) { for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { AE.setTile("tiles", x, y, "."); AE.setTile("back", x, y, "."); AE.setTile("water", x, y, "."); AE.setTile("dark", x, y, "."); AE.setTile("rails", x, y, "."); } }
    function stampArea(c, tx, ty) {
        for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { AE.setTile("tiles", tx + x, ty + y, c.tiles[y][x]); AE.setTile("back", tx + x, ty + y, c.back[y][x]); AE.setTile("water", tx + x, ty + y, c.water[y][x]); if (c.dark) AE.setTile("dark", tx + x, ty + y, c.dark[y][x]); if (c.rails) AE.setTile("rails", tx + x, ty + y, c.rails[y][x]); }
    }
    AE.areaDelete = function () {
        const r = S.tileSel;
        if (!r) return;
        AE.change("Clear area", () => { const c = areaContents(r, AE.carry); clearArea(r); if (AE.carry) { const ks = new Set(c.objs.map(o => o._k)); S.spec.objects = S.spec.objects.filter(o => !ks.has(o._k)); } }, { tiles: true, objects: true });
    };
    AE.areaFill = function (ch, layer) {
        const r = S.tileSel;
        if (!r) return;
        AE.change("Fill area", () => { for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) AE.setTile(layer, x, y, ch); }, { tiles: true });
    };
    AE.areaFlip = function (horiz) {
        const r = S.tileSel;
        if (!r) return;
        AE.change(horiz ? "Flip area across" : "Flip area up and down", () => {
            const c = areaContents(r, AE.carry);
            const f = rows => (horiz ? rows.map(row => row.slice().reverse()) : rows.slice().reverse());
            // (23 Oct 2026) a slope turned round with it: up to the right becomes up to the left
            const MIRROR = { "/": "\\", "\\": "/", "{": "]", "]": "{", "}": "[", "[": "}", u: "n", n: "u", k: "z", z: "k", l: "y", y: "l" };
            // (upside down, a floor's slope is a ceiling's and back)
            const FLIP = { "/": "u", u: "/", "\\": "n", n: "\\", "{": "k", k: "{", "}": "l", l: "}", "[": "y", y: "[", "]": "z", z: "]" };
            const turn = rows => rows.map(row => row.map(ch => (horiz ? MIRROR : FLIP)[ch] || ch));
            stampArea({ w: c.w, h: c.h, tiles: turn(f(c.tiles)), back: f(c.back), water: f(c.water), dark: f(c.dark), rails: f(c.rails) }, r.x0, r.y0);
            const X0 = r.x0 * TS, Y0 = r.y0 * TS, W = c.w * TS, H = c.h * TS;
            for (const o of c.objs) { const b = AE.box(o); if (horiz) { AE.shiftObj(o, (X0 + (X0 + W - (b.x + b.w))) - b.x, 0); if (o.type === "prop") o.flip = !o.flip; if (o.dir === 1 || o.dir === -1) o.dir = -o.dir; } else AE.shiftObj(o, 0, (Y0 + (Y0 + H - (b.y + b.h))) - b.y); }
        }, { tiles: true, objects: true });
    };

    /* ---------------------------------------------------------------- THE CLIPBOARD */
    AE.copy = function (cut) {
        if (S.tileSel) {
            const r = S.tileSel;
            clip = { area: areaContents(r, AE.carry), at: { x: r.x0 * TS, y: r.y0 * TS } };
            clip.area.objs = clip.area.objs.map(o => JSON.parse(JSON.stringify(AE.cleanObj(o))));
            if (cut) AE.areaDelete();
            AE.toast((cut ? "Cut " : "Copied ") + clip.area.w + " × " + clip.area.h + " tiles" + (clip.area.objs.length ? " and " + clip.area.objs.length + " objects" : ""));
            return;
        }
        const sel = AE.selected();
        if (!sel.length) return;
        const bx = Math.min(...sel.map(o => AE.box(o).x)), by = Math.min(...sel.map(o => AE.box(o).y));
        clip = { objs: sel.map(o => JSON.parse(JSON.stringify(AE.cleanObj(o)))), at: { x: bx, y: by } };
        if (cut) AE.deleteSelected("Cut");
        AE.toast((cut ? "Cut " : "Copied ") + sel.length + (sel.length === 1 ? " object" : " objects"));
    };
    AE.paste = function () {
        if (!clip) return;
        const m = S.mouse.inside ? AE.toWorld(S.mouse.sx, S.mouse.sy) : { x: AE.viewRect().x + AE.viewRect().w / 2, y: AE.viewRect().y + AE.viewRect().h / 2 };
        if (clip.area) {
            const A = clip.area, tx = Math.floor(m.x / TS), ty = Math.floor(m.y / TS);
            AE.change("Paste area", () => {
                stampArea(A, tx, ty);
                const dx = tx * TS - clip.at.x, dy = ty * TS - clip.at.y, keys = [];
                for (const src of A.objs) { const o = Object.assign(JSON.parse(JSON.stringify(src)), { _k: AE.newKey() }); AE.shiftObj(o, dx, dy); fixCopy(o); S.spec.objects.push(o); keys.push(o._k); }
                S.tileSel = { x0: tx, y0: ty, x1: tx + A.w - 1, y1: ty + A.h - 1 };
            }, { tiles: true, objects: true });
            return;
        }
        AE.change("Paste", () => {
            const first = clip.objs[0], s = snapObj(first, m.x, m.y, null), b0 = AE.box(first);
            const dx = s.x - first.x + (first.x - b0.x) - (b0.x - clip.at.x) * 0, dy = s.y - first.y;
            const keys = [];
            for (const src of clip.objs) { const o = Object.assign(JSON.parse(JSON.stringify(src)), { _k: AE.newKey() }); AE.shiftObj(o, dx, dy); fixCopy(o); S.spec.objects.push(o); keys.push(o._k); }
            S.sel = keys;
        });
        AE.emit("select");
    };
    // a copy is its own thing: a ruby gets a name of its own (a doorway keeps its own; the editor says if two share one)
    function fixCopy(o) { if (o.type === "gem") o.rid = S.zi + "-" + S.ai + "-new-" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
    AE.duplicate = function () {
        const sel = AE.selected();
        if (!sel.length) return;
        AE.change("Duplicate", () => {
            const keys = [], d = snapOn() ? gs() : 8;
            for (const src of sel) { const o = Object.assign(JSON.parse(JSON.stringify(AE.cleanObj(src))), { _k: AE.newKey() }); AE.shiftObj(o, d, 0); fixCopy(o); S.spec.objects.push(o); keys.push(o._k); }
            S.sel = keys;
        });
        AE.emit("select");
    };
    AE.deleteSelected = function (label) {
        if (!S.sel.length) return;
        const ks = new Set(S.sel), n = ks.size;
        AE.change(label || "Delete", () => { S.spec.objects = S.spec.objects.filter(o => !ks.has(o._k)); S.sel = []; });
        AE.emit("select");
        AE.toast((label || "Deleted") + " " + n + (n === 1 ? " object" : " objects"));
    };
    AE.nudge = function (dx, dy) {
        if (!S.sel.length) return false;
        AE.change("Nudge", () => { for (const o of AE.selected()) AE.shiftObj(o, dx, dy); }, { objects: true, merge: "nudge" });
        return true;
    };
    // the order things are drawn in: forward is over more of the others
    AE.order = function (how) {
        const ks = new Set(S.sel);
        if (!ks.size) return;
        AE.change("Reorder", () => {
            const O = S.spec.objects, picked = O.filter(o => ks.has(o._k)), rest = O.filter(o => !ks.has(o._k));
            if (how === "front") S.spec.objects = [...rest, ...picked];
            else if (how === "back") S.spec.objects = [...picked, ...rest];
            else {
                const step = how === "forward" ? 1 : -1, idx = O.map((o, i) => (ks.has(o._k) ? i : -1)).filter(i => i >= 0);
                const arr = O.slice();
                for (const i of step > 0 ? idx.reverse() : idx) { const j = i + step; if (j < 0 || j >= arr.length || ks.has(arr[j]._k)) continue; [arr[i], arr[j]] = [arr[j], arr[i]]; }
                S.spec.objects = arr;
            }
        });
    };

    /* ---------------------------------------------------------------- PLACING */
    AE.startPlace = function (entry) { S.place = entry; S.tool = "place"; AE.emit("tool"); };
    function ghostAt(w, ev) {
        const p = S.place;
        if (!p) return null;
        const o = AE.make(p.type, 0, 0, p.over);
        const b0 = AE.box(o), A = AE.anchor(o);
        // the pointer holds the object by its tile's corner when snapping, by its middle when not
        const s = snapOn(ev) ? snapObj(o, w.x - (w.x % gs() + gs()) % gs() + A.ax, w.y - (w.y % gs() + gs()) % gs() + A.ay, ev) : { x: Math.round(w.x - b0.w / 2 - (b0.x - o.x)), y: Math.round(w.y - b0.h / 2 - (b0.y - o.y)) };
        const dx = s.x - o.x, dy = s.y - o.y;
        AE.shiftObj(o, dx, dy);
        if (o.type === "mover" && o.axis !== "path") { const c = o.axis === "v" ? o.y : o.x; o.min = c - 48; o.max = c + 48; }
        return o;
    }
    function placeAt(w, ev, quiet) {
        const o = ghostAt(w, ev);
        if (!o) return null;
        const T = C.TYPES[o.type];
        // one there already: that one is taken up (chosen, and moved if dragged; a row of coins painted on from it), not another put on it
        const there = !(T && T.single) && !(T && T.sizable) && sameSpot(o, ev, 2);
        if (there) { AE.begin("Move " + AE.label(there)); if (!quiet) S.sel = [there._k]; return there; }
        AE.begin("Place " + (S.place.label || (T && T.label) || o.type));
        // put into a layer that is locked, it would be out of reach: the layer is unlocked
        const L = AE.layerOf(o);
        if (S.locked[L]) { S.locked[L] = false; AE.toast("Unlocked the " + ({ backdrop: "frame", back: "scenery behind", front: "scenery in front", lights: "lights", objects: "things in play" })[L] + " layer, so what you place can be chosen"); AE.emit("overlays-changed"); }
        if (T && T.single) S.spec.objects = S.spec.objects.filter(x => x.type !== o.type);
        S.spec.objects.push(o);
        if (!quiet) S.sel = [o._k];
        return o;
    }

    /* ---------------------------------------------------------------- THE POINTER */
    function onDown(ev) {
        const cv = AE.R.canvas, r = cv.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top, w = AE.toWorld(sx, sy);
        try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* a pointer the browser no longer has */ }
        cv.focus({ preventScroll: true });
        if (ev.button === 1 || spaceDown || S.tool === "pan") { drag = { kind: "pan", sx, sy, vx: S.view.x, vy: S.view.y }; setCursor("grabbing"); return; }
        if (ev.button === 2 && S.tool !== "brush" && S.tool !== "rect" && S.tool !== "path") { if (S.tool === "place") { AE.setTool("select"); } return; }
        const tool = S.tool;
        if (tool === "select" || tool === "path") {
            const hh = handleAt(sx, sy);
            if (hh) {
                if (ev.button === 2 && hh.h.kind === "way") { AE.change("Remove waypoint", () => { hh.o.path.splice(hh.h.index, 1); }); return; }
                AE.begin("Adjust " + AE.label(hh.o)); drag = { kind: "handle", h: hh.h, o: hh.o }; return;
            }
        }
        if (tool === "path") {
            const o = S.sel.length === 1 ? AE.byKey(S.sel[0]) : null;
            if (!o || !canPath(o)) { AE.toast("Choose a creature or a platform on a path first"); return; }
            if (ev.button !== 0) return;
            const T = D().TYPES[o.type] || { w: 16, h: 16 }, ox = o.type === "mover" ? (o.w || 48) / 2 : T.w / 2, oy = o.type === "mover" ? 5 : T.h / 2;
            const s = snapObj(o, w.x - ox, w.y - oy, ev);
            AE.change("Add waypoint", () => { if (!Array.isArray(o.path)) o.path = []; if (o.type === "mover") o.axis = "path"; o.path.push({ x: s.x, y: s.y }); });
            return;
        }
        if (tool === "select") {
            const sk = seaAt(sx, sy);
            if (sk) { AE.begin("Move the sea's line"); drag = { kind: "sea", key: sk }; return; }
            const all = candidates(w.x, w.y);
            let o = all[0] || null;
            // Alt cycles through what is stacked under the pointer
            if (ev.altKey && all.length > 1) { const i = all.findIndex(c => S.sel.includes(c._k)); o = all[(i + 1) % all.length]; }
            if (o) {
                if (ev.shiftKey) { AE.select(o._k, true); return; }
                if (!S.sel.includes(o._k)) AE.select(o._k);
                AE.begin(ev.ctrlKey ? "Duplicate" : "Move");
                if (ev.ctrlKey) {
                    // Ctrl-drag: drag copies away, leaving the originals
                    const keys = [];
                    for (const src of AE.selected()) { const c = Object.assign(JSON.parse(JSON.stringify(AE.cleanObj(src))), { _k: AE.newKey() }); fixCopy(c); S.spec.objects.push(c); keys.push(c._k); }
                    S.sel = keys; AE.emit("select");
                }
                const lead = AE.byKey(S.sel.includes(o._k) ? o._k : S.sel[0]) || o;
                drag = { kind: "move", w0: w, lead, start: AE.selected().map(x => ({ o: x, x: x.x, y: x.y, json: JSON.stringify(x) })), lx: lead.x, ly: lead.y, moved: false };
                return;
            }
            drag = { kind: "marquee", w0: w, w1: w, add: ev.shiftKey };
            return;
        }
        if (tool === "brush") {
            const t = tileOfPoint(w), b = S.brush, erase = ev.button === 2, ch = erase ? eraseCh(b.layer) : b.tile;
            AE.begin(erase ? "Erase" : "Paint " + b.label);
            let n = ev.shiftKey && lastPaint ? paintLine(lastPaint, t, ch, b.layer) : paintAt(t.x, t.y, ch, b.layer);
            lastPaint = t;
            if (n) live();
            drag = { kind: "paint", ch, layer: b.layer, last: t };
            return;
        }
        if (tool === "rect") { const t = tileOfPoint(w); drag = { kind: "rect", t0: t, t1: t, erase: ev.button === 2 }; return; }
        if (tool === "fill") { const t = tileOfPoint(w), b = S.brush; AE.change("Fill", () => flood(t.x, t.y, ev.button === 2 ? eraseCh(b.layer) : b.tile, b.layer), { tiles: true }); return; }
        if (tool === "area") {
            const t = tileOfPoint(w), r = S.tileSel;
            if (r && t.x >= r.x0 && t.x <= r.x1 && t.y >= r.y0 && t.y <= r.y1) {
                // lift it: everything in the box moves with the pointer
                AE.begin(ev.ctrlKey ? "Copy area" : "Move area");
                const c = areaContents(r, AE.carry);
                if (!ev.ctrlKey) clearArea(r);
                drag = { kind: "areaMove", c, r0: Object.assign({}, r), t0: t, dx: 0, dy: 0, copy: ev.ctrlKey, objStart: c.objs.map(o => ({ o, x: o.x, y: o.y, json: JSON.stringify(o) })) };
                if (ev.ctrlKey) drag.objStart = drag.objStart.map(s => { const o2 = Object.assign(JSON.parse(s.json), { _k: AE.newKey() }); fixCopy(o2); S.spec.objects.push(o2); return { o: o2, x: o2.x, y: o2.y, json: JSON.stringify(o2) }; });
                return;
            }
            S.sel = []; AE.emit("select");
            drag = { kind: "areaPick", t0: t, t1: t };
            S.tileSel = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
            return;
        }
        if (tool === "place") {
            const o = placeAt(w, ev, Boolean(S.place && C.TYPES[S.place.type] && C.TYPES[S.place.type].paint));
            if (o) { drag = { kind: "placeDrag", o, painted: new Set([o.x + "," + o.y]) }; AE.emit("change", { objects: true }); }
            return;
        }
        if (tool === "pick") {
            const o = AE.pick(w.x, w.y);
            if (o) { const over = JSON.parse(JSON.stringify(AE.cleanObj(o))); delete over.x; delete over.y; delete over.type; if (o.type === "gem") delete over.rid; AE.startPlace({ type: o.type, over, label: AE.label(o) }); AE.toast("Placing " + AE.label(o) + ": click to put one down"); return; }
            const t = tileOfPoint(w);
            const ch = AE.tileAt("tiles", t.x, t.y), water = AE.tileAt("water", t.x, t.y), back = AE.tileAt("back", t.x, t.y), dk = AE.tileAt("dark", t.x, t.y), rl = AE.tileAt("rails", t.x, t.y);
            const b = rl && rl !== "." ? C.TERRAIN.find(x => x.layer === "rails" && x.tile === rl) : ch && ch !== "." ? C.TERRAIN.find(x => x.layer === "tiles" && x.tile === ({ "}": "{", "[": "]", l: "k", z: "y" }[ch] || ch)) : water === "~" || water === "m" ? C.TERRAIN.find(x => x.layer === "water" && x.tile === water) : dk === "d" || dk === "t" ? C.TERRAIN.find(x => x.layer === "dark" && x.tile === dk) : back === "#" ? C.TERRAIN.find(x => x.layer === "back") : null;
            if (b) { S.brush = b; AE.setTool("brush"); AE.toast("Brush: " + b.label); }
        }
    }
    const canPath = o => D().FOES.has(o.type) && o.type !== "steam" && o.type !== "hammer" || o.type === "mover";
    AE.canPath = canPath;

    function onMove(ev) {
        const cv = AE.R.canvas, r = cv.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top, w = AE.toWorld(sx, sy);
        S.mouse = { sx, sy, x: w.x, y: w.y, inside: true, ev };
        AE.emit("mouse");
        if (!drag) {
            const hh = handleAt(sx, sy);
            setCursor(spaceDown || S.tool === "pan" ? "grab" : hh ? hh.h.cursor : seaAt(sx, sy) ? "ns-resize" : S.tool === "select" ? (AE.pick(w.x, w.y) ? "move" : "default") : S.tool === "pick" ? "copy" : "crosshair");
            const hov = S.tool === "select" || S.tool === "pick" ? AE.pick(w.x, w.y) : null;
            if ((hov && hov._k) !== (S.hover && S.hover._k)) S.hover = hov;
            AE.redraw();
            return;
        }
        if (drag.kind === "pan") { S.view.x = drag.vx - (sx - drag.sx) / S.view.z; S.view.y = drag.vy - (sy - drag.sy) / S.view.z; AE.redraw(); AE.emit("view"); return; }
        if (drag.kind === "handle") { drag.h.set(w, ev); live2(); return; }
        if (drag.kind === "sea") { const sea = S.spec.settings.sea; sea[drag.key] = snapV(w.y, ev); AE.emit("change", { settings: true }); AE.redraw(); return; }
        if (drag.kind === "move") {
            const lead = drag.lead, s0 = drag.start.find(s => s.o === lead) || drag.start[0];
            const want = snapObj(lead, s0.x + (w.x - drag.w0.x), s0.y + (w.y - drag.w0.y), ev);
            const dx = want.x - s0.x, dy = want.y - s0.y;
            if (!drag.moved && Math.hypot(w.x - drag.w0.x, w.y - drag.w0.y) * S.view.z < 3) return;
            drag.moved = true;
            for (const s of drag.start) { Object.assign(s.o, JSON.parse(s.json)); AE.shiftObj(s.o, dx, dy); }
            live2();
            return;
        }
        if (drag.kind === "marquee") { drag.w1 = w; AE.redraw(); return; }
        if (drag.kind === "paint") {
            const t = tileOfPoint(w);
            if (t.x === drag.last.x && t.y === drag.last.y) return;
            const n = paintLine(drag.last, t, drag.ch, drag.layer);
            drag.last = t; lastPaint = t;
            if (n) live();
            return;
        }
        if (drag.kind === "rect") { drag.t1 = tileOfPoint(w); AE.redraw(); return; }
        if (drag.kind === "areaPick") { const t = tileOfPoint(w); drag.t1 = t; S.tileSel = { x0: Math.min(drag.t0.x, t.x), y0: Math.min(drag.t0.y, t.y), x1: Math.max(drag.t0.x, t.x), y1: Math.max(drag.t0.y, t.y) }; AE.emit("select"); AE.redraw(); return; }
        if (drag.kind === "areaMove") {
            const t = tileOfPoint(w), dx = t.x - drag.t0.x, dy = t.y - drag.t0.y;
            if (dx === drag.dx && dy === drag.dy) return;
            drag.dx = dx; drag.dy = dy;
            S.tileSel = { x0: drag.r0.x0 + dx, y0: drag.r0.y0 + dy, x1: drag.r0.x1 + dx, y1: drag.r0.y1 + dy };
            for (const s of drag.objStart) { Object.assign(s.o, JSON.parse(s.json)); AE.shiftObj(s.o, dx * TS, dy * TS); }
            AE.redraw();
            return;
        }
        if (drag.kind === "placeDrag") {
            // dragging paints more of a thing that comes in rows (coins), a grid step apart
            const T = C.TYPES[drag.o.type];
            if (!(T && T.paint)) { const s = snapObj(drag.o, w.x - AE.box(drag.o).w / 2, w.y - AE.box(drag.o).h / 2, ev); const g0 = ghostAt(w, ev); AE.shiftObj(drag.o, g0.x - drag.o.x, g0.y - drag.o.y); void s; live2(); return; }
            // every step along the way from the last one laid, however fast the pointer went
            const g0 = ghostAt(w, ev), last = drag.last || drag.o, step = snapOn(ev) ? gs() : 16;
            const n = Math.max(1, Math.round(Math.max(Math.abs(g0.x - last.x), Math.abs(g0.y - last.y)) / step));
            let added = false;
            for (let i = 1; i <= n; i++) {
                const px = last.x + (g0.x - last.x) * i / n, py = last.y + (g0.y - last.y) * i / n;
                const o = AE.make(g0.type, 0, 0, S.place.over), s = snapOn(ev) ? snapObj(o, px, py, ev) : { x: Math.round(px), y: Math.round(py) };
                AE.shiftObj(o, s.x - o.x, s.y - o.y);
                const k = o.x + "," + o.y;
                if (drag.painted.has(k)) continue;
                drag.painted.add(k);
                if (sameSpot(o, ev, 12)) continue;
                S.spec.objects.push(o); added = true;
            }
            drag.last = g0;
            if (added) live2();
        }
    }
    // objects changed while dragging: the game's act again (for collision and the platforms' look), drawn now
    let liveT = 0;
    function live2() { const now = performance.now(); if (now - liveT > 60) { liveT = now; AE.rebuildAct(); AE.emit("change", { objects: true }); } AE.redraw(); }

    function onUp(ev) {
        const d = drag;
        drag = null;
        if (!d) return;
        if (d.kind === "pan") { setCursor(spaceDown ? "grab" : "default"); return; }
        if (d.kind === "handle" || d.kind === "sea") { AE.rebuildAct(); AE.commit({ objects: true, settings: true }); return; }
        if (d.kind === "move") { AE.rebuildAct(); if (d.moved) AE.commit({ objects: true }); else { AE.cancel(); if (!ev.shiftKey) { /* a click: chosen */ } } return; }
        if (d.kind === "marquee") {
            const x0 = Math.min(d.w0.x, d.w1.x), y0 = Math.min(d.w0.y, d.w1.y), x1 = Math.max(d.w0.x, d.w1.x), y1 = Math.max(d.w0.y, d.w1.y);
            if ((x1 - x0) * S.view.z < 3 && (y1 - y0) * S.view.z < 3) { if (!d.add) AE.select([]); return; }
            const keys = S.spec.objects.filter(o => { if (!pickable(o)) return false; const b = AE.box(o); return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0 && !(AE.isFrame(o) && (b.w > x1 - x0 + 64 || b.h > y1 - y0 + 64)); }).map(o => o._k);
            if (d.add) { const s = new Set(S.sel); keys.forEach(k => s.add(k)); AE.select([...s]); } else AE.select(keys);
            AE.redraw();
            return;
        }
        if (d.kind === "paint") { AE.commit({ tiles: true }); return; }
        if (d.kind === "rect") {
            const b = S.brush, ch = d.erase ? eraseCh(b.layer) : b.tile;
            AE.change(d.erase ? "Erase box" : "Box of " + b.label, () => { for (let y = Math.min(d.t0.y, d.t1.y); y <= Math.max(d.t0.y, d.t1.y); y++) for (let x = Math.min(d.t0.x, d.t1.x); x <= Math.max(d.t0.x, d.t1.x); x++) AE.setTile(b.layer, x, y, ch); }, { tiles: true });
            return;
        }
        if (d.kind === "areaPick") { if (S.tileSel && S.tileSel.x0 === S.tileSel.x1 && S.tileSel.y0 === S.tileSel.y1 && d.t0.x === d.t1.x && d.t0.y === d.t1.y) { /* one tile: still an area */ } AE.emit("select"); return; }
        if (d.kind === "areaMove") {
            stampArea(d.c, S.tileSel.x0, S.tileSel.y0);
            AE.rebuildAct(); AE.commit({ tiles: true, objects: true });
            AE.emit("select");
            return;
        }
        if (d.kind === "placeDrag") { AE.rebuildAct(); AE.commit({ objects: true }); AE.emit("select"); }
    }

    function onWheel(ev) {
        ev.preventDefault();
        const cv = AE.R.canvas, r = cv.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top;
        if (ev.ctrlKey || ev.metaKey || !ev.shiftKey && Math.abs(ev.deltaX) < 1 && !AE.trackpadPan) {
            const f = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0018));
            AE.zoomAt(S.view.z * f, sx, sy);
        } else {
            S.view.x += (ev.shiftKey ? ev.deltaY : ev.deltaX) / S.view.z; S.view.y += (ev.shiftKey ? 0 : ev.deltaY) / S.view.z;
            AE.redraw(); AE.emit("view");
        }
    }
    function setCursor(c) { if (AE.R.canvas.style.cursor !== c) AE.R.canvas.style.cursor = c; }

    /* ---------------------------------------------------------------- THE KEYS */
    const TOOLKEYS = { v: "select", b: "brush", r: "rect", g: "fill", m: "area", p: "path", i: "pick", h: "pan" };
    AE.setTool = function (t) {
        S.tool = t;
        if (t !== "place") S.place = null;
        if (t !== "area") { /* keeps its box till another is drawn */ }
        if (t === "path" && !(S.sel.length === 1 && canPath(AE.byKey(S.sel[0]) || {}))) AE.toast("Path: choose a creature or a platform first, then click to add its waypoints");
        AE.emit("tool"); AE.redraw();
    };
    function typing(ev) { const t = ev.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); }
    function onKey(ev) {
        if (AE.testing) return;
        if (ev.key === " " && !typing(ev)) { if (!spaceDown) { spaceDown = true; setCursor("grab"); } ev.preventDefault(); return; }
        const ctrl = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
        if (ctrl && k === "s") { ev.preventDefault(); AE.save().then(ok => ok && AE.toast("Saved " + S.id)); return; }
        if (typing(ev)) { if (ev.key === "Escape") ev.target.blur(); return; }
        if (document.querySelector(".modal.open")) return;
        if (ctrl && k === "z" && !ev.shiftKey) { ev.preventDefault(); AE.undo(); return; }
        if (ctrl && (k === "y" || (k === "z" && ev.shiftKey))) { ev.preventDefault(); AE.redo(); return; }
        if (ctrl && k === "c") { ev.preventDefault(); AE.copy(false); return; }
        if (ctrl && k === "x") { ev.preventDefault(); AE.copy(true); return; }
        if (ctrl && k === "v") { ev.preventDefault(); AE.paste(); return; }
        if (ctrl && k === "d") { ev.preventDefault(); AE.duplicate(); return; }
        if (ctrl && k === "a") { ev.preventDefault(); AE.select(S.spec.objects.filter(pickable).map(o => o._k)); return; }
        if (ctrl) return;
        if (ev.key === "Escape") {
            if (drag) { if (drag.kind !== "pan") AE.cancel(); drag = null; AE.redraw(); return; }
            if (S.tool === "place" || S.tool === "path") { AE.setTool("select"); return; }
            if (S.tileSel) { S.tileSel = null; AE.emit("select"); AE.redraw(); return; }
            AE.select([]); return;
        }
        if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); if (S.tileSel && !S.sel.length) AE.areaDelete(); else AE.deleteSelected(); return; }
        if (ev.key.startsWith("Arrow")) {
            ev.preventDefault();
            const step = ev.shiftKey ? (S.grid.on ? gs() : TS) : 1;
            const dx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0, dy = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
            if (!AE.nudge(dx, dy)) { S.view.x += dx * 8 / S.view.z * (ev.shiftKey ? 1 : 4); S.view.y += dy * 8 / S.view.z * (ev.shiftKey ? 1 : 4); AE.redraw(); AE.emit("view"); }
            return;
        }
        if (k === "t") { ev.preventDefault(); AE.playtest(ev.shiftKey ? "start" : "cursor"); return; }
        if (TOOLKEYS[k] && !ev.altKey) { AE.setTool(TOOLKEYS[k]); return; }
        if (k === "s") { S.grid.on = !S.grid.on; AE.emit("grid"); AE.toast("Snap to grid " + (S.grid.on ? "on" : "off")); AE.redraw(); return; }
        if (k === "c") { S.overlays.collision = !S.overlays.collision; AE.emit("overlays-changed"); AE.redraw(); return; }
        if (k === "l") { S.overlays.lighting = !S.overlays.lighting; AE.emit("overlays-changed"); AE.redraw(); return; }
        if (k === "f") { AE.frameSelection(); return; }
        // (17 Oct 2026) 1 the jukebox, 0 its mixer; the whole map and 100% moved to Shift+0 and Shift+1
        if (ev.shiftKey && ev.code === "Digit0") { AE.fitMap(); return; }
        if (ev.shiftKey && ev.code === "Digit1") { AE.centerOn(S.view.x + AE.R.cw / 2 / S.view.z, S.view.y + AE.R.ch / 2 / S.view.z, 1); return; }
        if (k === "0") { AE.jukebox.mixer(); return; }
        if (k === "1") { AE.jukebox.toggle(); return; }
        if (k === "2") { AE.centerOn(S.view.x + AE.R.cw / 2 / S.view.z, S.view.y + AE.R.ch / 2 / S.view.z, 2); return; }
        if (k === "3") { AE.centerOn(S.view.x + AE.R.cw / 2 / S.view.z, S.view.y + AE.R.ch / 2 / S.view.z, 4); return; }
        if (k === "=" || k === "+") { AE.zoomAt(S.view.z * 1.25, AE.R.cw / 2, AE.R.ch / 2); return; }
        if (k === "-" || k === "_") { AE.zoomAt(S.view.z / 1.25, AE.R.cw / 2, AE.R.ch / 2); return; }
        if (k === "[") { S.brushSize = Math.max(1, S.brushSize - 1); AE.emit("tool"); AE.redraw(); return; }
        if (k === "]") { S.brushSize = Math.min(8, S.brushSize + 1); AE.emit("tool"); AE.redraw(); return; }
        if (ev.key === "PageUp") { AE.order(ev.shiftKey ? "front" : "forward"); return; }
        if (ev.key === "PageDown") { AE.order(ev.shiftKey ? "back" : "backward"); return; }
        if (k === "x" && S.sel.length) { AE.change("Mirror", () => { for (const o of AE.selected()) { if (o.type === "prop") o.flip = !o.flip; else if (o.dir === 1 || o.dir === -1 || D().FOES.has(o.type)) o.dir = o.dir === 1 ? -1 : 1; } }); return; }
        if (ev.key === "?") { AE.showHelp(); return; }
    }
    function onKeyUp(ev) { if (ev.key === " ") { spaceDown = false; setCursor("default"); } }
    AE.frameSelection = function () {
        const sel = AE.selected();
        if (!sel.length && !S.tileSel) { AE.fitMap(); return; }
        let x0, y0, x1, y1;
        if (sel.length) { const bs = sel.map(AE.box); x0 = Math.min(...bs.map(b => b.x)); y0 = Math.min(...bs.map(b => b.y)); x1 = Math.max(...bs.map(b => b.x + b.w)); y1 = Math.max(...bs.map(b => b.y + b.h)); }
        else { x0 = S.tileSel.x0 * TS; y0 = S.tileSel.y0 * TS; x1 = (S.tileSel.x1 + 1) * TS; y1 = (S.tileSel.y1 + 1) * TS; }
        const z = Math.max(0.5, Math.min(6, Math.min(AE.R.cw / (x1 - x0 + 120), AE.R.ch / (y1 - y0 + 120))));
        AE.centerOn((x0 + x1) / 2, (y0 + y1) / 2, z);
    };

    /* ---------------------------------------------------------------- THE MARKS THE TOOLS DRAW */
    AE.on("overlays", ({ g }) => {
        const z = S.view.z, px = 1 / z;
        // the area chosen with M
        if (S.tileSel) {
            const r = S.tileSel;
            g.fillStyle = "rgba(242,204,78,0.10)"; g.fillRect(r.x0 * TS, r.y0 * TS, (r.x1 - r.x0 + 1) * TS, (r.y1 - r.y0 + 1) * TS);
            g.save(); g.strokeStyle = "#f2cc4e"; g.lineWidth = 1.5 * px; g.setLineDash([5 * px, 4 * px]); g.lineDashOffset = -(performance.now() / 60) % 9 * px;
            g.strokeRect(r.x0 * TS, r.y0 * TS, (r.x1 - r.x0 + 1) * TS, (r.y1 - r.y0 + 1) * TS); g.restore();
            AE.animating = true;
        } else AE.animating = false;
        if (drag && drag.kind === "areaMove") {
            // what is being carried, drawn where it would land
            const c = drag.c, X = S.tileSel.x0 * TS, Y = S.tileSel.y0 * TS;
            g.globalAlpha = 0.75;
            for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const ch = c.tiles[y][x]; if (ch !== ".") { g.fillStyle = tileColor(ch); g.fillRect(X + x * TS, Y + y * TS, TS, TS); } if (c.water[y][x] === "~" || c.water[y][x] === "m") { g.fillStyle = c.water[y][x] === "m" ? "rgba(70,110,40,0.5)" : "rgba(60,140,255,0.4)"; g.fillRect(X + x * TS, Y + y * TS, TS, TS); } }
            g.globalAlpha = 1;
        }
        // the brush's square, and the box being drawn
        const m = S.mouse;
        if (!AE.testing && m.inside && (S.tool === "brush" || S.tool === "fill" || S.tool === "rect") && !drag) {
            const t = tileOfPoint(m), r = S.tool === "brush" ? S.brushSize : 1, o = Math.floor((r - 1) / 2);
            g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = px; g.strokeRect((t.x - o) * TS + px / 2, (t.y - o) * TS + px / 2, r * TS - px, r * TS - px);
            g.fillStyle = tileColor(S.brush.tile, S.brush.layer, 0.35); g.fillRect((t.x - o) * TS, (t.y - o) * TS, r * TS, r * TS);
        }
        if (drag && drag.kind === "rect") {
            const x0 = Math.min(drag.t0.x, drag.t1.x), y0 = Math.min(drag.t0.y, drag.t1.y), x1 = Math.max(drag.t0.x, drag.t1.x), y1 = Math.max(drag.t0.y, drag.t1.y);
            g.fillStyle = drag.erase ? "rgba(255,90,90,0.25)" : tileColor(S.brush.tile, S.brush.layer, 0.4); g.fillRect(x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS);
            g.strokeStyle = "#ffffff"; g.lineWidth = px; g.strokeRect(x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS);
            AE.tag(g, (x0 + x1 + 1) * TS / 2, y0 * TS, (x1 - x0 + 1) + " × " + (y1 - y0 + 1), "#ffffff");
        }
        if (drag && drag.kind === "marquee") {
            const x0 = Math.min(drag.w0.x, drag.w1.x), y0 = Math.min(drag.w0.y, drag.w1.y);
            g.fillStyle = "rgba(90,180,255,0.12)"; g.fillRect(x0, y0, Math.abs(drag.w1.x - drag.w0.x), Math.abs(drag.w1.y - drag.w0.y));
            g.strokeStyle = "#5ab4ff"; g.lineWidth = px; g.strokeRect(x0, y0, Math.abs(drag.w1.x - drag.w0.x), Math.abs(drag.w1.y - drag.w0.y));
        }
        // the thing about to be placed, under the pointer
        if (S.tool === "place" && S.place && m.inside && !drag) {
            const o = ghostAt(m, m.ev);
            if (o) { g.globalAlpha = 0.6; AE.drawGhost(g, o); g.globalAlpha = 1; const b = AE.box(o); g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = px; g.setLineDash([3 * px, 2 * px]); g.strokeRect(b.x, b.y, b.w, b.h); g.setLineDash([]); }
        }
        // hover, and what is chosen
        if (S.hover && !S.sel.includes(S.hover._k) && (S.tool === "select" || S.tool === "pick")) { const b = AE.box(S.hover); g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = px; g.strokeRect(b.x - px, b.y - px, b.w + 2 * px, b.h + 2 * px); }
        for (const o of AE.selected()) {
            const b = AE.box(o);
            g.strokeStyle = "#4fd1ff"; g.lineWidth = 1.5 * px; g.strokeRect(b.x - 1.5 * px, b.y - 1.5 * px, b.w + 3 * px, b.h + 3 * px);
            if (o.type === "light") { const L = D().lightOf(o); g.save(); g.strokeStyle = "rgba(255,210,120,0.7)"; g.lineWidth = px; g.setLineDash([4 * px, 3 * px]); if (L.kind !== "shaft" && L.radius > 0) { g.beginPath(); g.arc(o.x, o.y, L.radius, 0, Math.PI * 2); g.stroke(); } if (L.reveal > 0) { g.strokeStyle = "rgba(160,200,255,0.7)"; g.beginPath(); g.arc(o.x, o.y, L.reveal, 0, Math.PI * 2); g.stroke(); } g.restore(); }
            if (o.type === "prop" && (o.solid === "solid" || o.solid === "top")) { const hb = D().propBox(o); if (hb) { g.strokeStyle = o.solid === "solid" ? "rgba(255,80,70,0.95)" : "rgba(255,220,60,0.95)"; g.lineWidth = px; g.strokeRect(hb.x, hb.y, hb.w, o.solid === "top" ? 2 * px : hb.h); } }
            if (o.type === "torch") { const TH = D().theme(S.zone), L = D().lampAt(D().lampStyle(o)), R = typeof o.radius === "number" ? o.radius : 70; g.save(); g.strokeStyle = "rgba(255,210,120,0.7)"; g.lineWidth = px; g.setLineDash([4 * px, 3 * px]); g.beginPath(); g.arc(o.x + L.gx, o.y + L.gy, R, 0, Math.PI * 2); g.stroke(); g.restore(); }
            if (Array.isArray(o.path) && o.type !== "mover") { const T = D().TYPES[o.type] || { w: 16, h: 16 }; g.save(); g.strokeStyle = "#ff9a3c"; g.lineWidth = 1.5 * px; AE.pathLine(g, o, T.w / 2, T.h / 2); g.restore(); }
        }
        if (S.sel.length === 1) {
            const o = AE.byKey(S.sel[0]);
            if (o) for (const h of handlesOf(o)) {
                const p = AE.toScreen(h.x, h.y), dpr = AE.R.dpr;
                g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
                g.fillStyle = h.kind === "way" ? "#ff9a3c" : h.kind === "light" ? "#ffd27a" : h.kind === "reveal" ? "#a0c8ff" : "#ffffff";
                g.strokeStyle = "#0b0c0f"; g.lineWidth = 1.5;
                if (h.kind === "way" || h.kind === "light" || h.kind === "reveal") { g.beginPath(); g.arc(p.x, p.y, HANDLE, 0, Math.PI * 2); g.fill(); g.stroke(); }
                else { g.fillRect(p.x - HANDLE + 1, p.y - HANDLE + 1, HANDLE * 2 - 2, HANDLE * 2 - 2); g.strokeRect(p.x - HANDLE + 1, p.y - HANDLE + 1, HANDLE * 2 - 2, HANDLE * 2 - 2); }
                if (h.kind === "way") { g.fillStyle = "#0b0c0f"; g.font = "700 9px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(h.index + 1), p.x, p.y + 0.5); }
                g.restore();
            }
        }
        // the path tool's next waypoint, joined to the last
        if (S.tool === "path" && m.inside && S.sel.length === 1) {
            const o = AE.byKey(S.sel[0]);
            if (o && canPath(o)) { const T = D().TYPES[o.type] || { w: 16, h: 16 }, ox = o.type === "mover" ? (o.w || 48) / 2 : T.w / 2, oy = o.type === "mover" ? 5 : T.h / 2, s = snapObj(o, m.x - ox, m.y - oy, m.ev), last = o.path && o.path.length ? o.path[o.path.length - 1] : o; g.save(); g.strokeStyle = "rgba(255,154,60,0.7)"; g.lineWidth = px; g.setLineDash([3 * px, 3 * px]); g.beginPath(); g.moveTo(last.x + ox, last.y + oy); g.lineTo(s.x + ox, s.y + oy); g.stroke(); g.restore(); }
        }
    });
    // a flat colour for each kind of tile, where a picture would be too slow (a carried area)
    function tileColor(ch, layer, a) {
        const al = a === undefined ? 1 : a;
        if (layer === "dark") return ch === "t" ? `rgba(170,130,240,${al * 0.6})` : `rgba(90,50,170,${al})`;
        if (ch === "m") return `rgba(70,110,40,${al})`;
        if (layer === "water" || ch === "~") return `rgba(60,140,255,${al})`;
        if (layer === "back") return `rgba(120,100,80,${al})`;
        if (layer === "rails") return `rgba(200,200,220,${al})`;
        const c = { "#": [150, 110, 70], "%": [80, 210, 255], "=": [230, 190, 90], H: [120, 220, 120], W: [120, 220, 120], B: [120, 220, 120], "|": [200, 170, 110], "^": [255, 80, 200], i: [180, 230, 255], "2": [170, 160, 140], c: [210, 160, 90], X: [140, 120, 100], Q: [140, 160, 200], V: [110, 80, 50], e: [255, 255, 255], _: [80, 210, 255], ",": [80, 210, 255], h: [80, 210, 255], j: [80, 210, 255], ".": [255, 90, 90] }[ch] || [200, 200, 200];
        return `rgba(${c[0]},${c[1]},${c[2]},${al})`;
    }
    AE.tileColor = tileColor;

    AE.initInput = function (cv) {
        cv.addEventListener("pointerdown", onDown);
        cv.addEventListener("pointermove", onMove);
        cv.addEventListener("pointerup", onUp);
        cv.addEventListener("pointercancel", onUp);
        cv.addEventListener("pointerleave", () => { S.mouse.inside = false; S.hover = null; AE.emit("mouse"); AE.redraw(); });
        cv.addEventListener("wheel", onWheel, { passive: false });
        cv.addEventListener("contextmenu", e => e.preventDefault());
        cv.addEventListener("dblclick", ev => { const r = cv.getBoundingClientRect(), w = AE.toWorld(ev.clientX - r.left, ev.clientY - r.top), o = AE.pick(w.x, w.y); if (o) AE.emit("focusInspector", o); });
        window.addEventListener("keydown", onKey);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", () => { spaceDown = false; });
    };
})();

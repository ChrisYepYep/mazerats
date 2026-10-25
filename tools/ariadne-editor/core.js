/* Ariadne's Thread level editor: the level being edited, and what can be
   done to it (14 Oct 2026). The level is the game's own data (see
   js/rat-race.js, THE LEVELS AS DATA): the map's rows of tiles, the walls
   behind, the water, the settings, and the list of objects. Here the rows
   are kept as arrays of letters to paint into, and each object carries a
   key of its own (_k) for picking it out; neither shows in what is saved.

   Every change is a step that can be undone: begin() before it, commit()
   after; between the two, change S.spec as you like. */
(function () {
    "use strict";
    const AE = window.AE, C = AE.CATALOG;
    const D = () => window.RatRace.dev;
    const TS = 16;

    const S = AE.S = {
        index: null, id: null, zi: 0, ai: 0, zone: null,
        spec: null, act: null, base: null,
        sel: [], tileSel: null,
        dirty: false, savedAt: null, saving: false,
        undo: [], redo: [], pending: null,
        view: { x: 0, y: 0, z: 2 },
        tool: "select", brush: C.TERRAIN[0], brushSize: 1, place: null,
        grid: { on: true, size: 16 },
        layers: { backdrop: true, backwalls: true, back: true, terrain: true, water: true, objects: true, front: true, lights: true },
        locked: { backdrop: true, back: false, objects: false, front: false, lights: false },
        overlays: { grid: true, rooms: true, collision: false, secrets: true, covers: false, lighting: false, paths: true, labels: true, sea: true },
        mouse: { x: 0, y: 0, inside: false, sx: 0, sy: 0 }, hover: null
    };
    let nextKey = 1;
    const listeners = {};
    AE.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
    AE.emit = (ev, data) => { for (const fn of listeners[ev] || []) { try { fn(data); } catch (e) { console.error(e); } } };

    /* ---------------------------------------------------------------- THE LEVEL */
    const rowsOf = (list, w, h, fill) => Array.from({ length: h }, (_, y) => { const r = (list && list[y]) || ""; return Array.from({ length: w }, (_, x) => r[x] || fill); });
    function adopt(spec) {
        const w = spec.w || Math.max(...spec.tiles.map(r => r.length)), h = spec.tiles.length;
        const s = {
            w, h,
            tiles: rowsOf(spec.tiles, w, h, "#"),
            back: rowsOf(spec.back, w, h, "."),
            water: rowsOf(spec.water, w, h, "."),
            dark: rowsOf(spec.dark, w, h, "."),
            rails: rowsOf(spec.rails, w, h, "."),
            settings: JSON.parse(JSON.stringify(spec.settings || {})),
            objects: (spec.objects || []).map(o => Object.assign({}, o, { _k: o._k || nextKey++ }))
        };
        for (const o of s.objects) if (o._k >= nextKey) nextKey = o._k + 1;
        return s;
    }
    // What is saved: rows as strings, nothing of the editor's own in the objects, empty layers left out.
    function toSpec(withKeys) {
        const s = S.spec;
        const out = { w: s.w, h: s.h, tiles: s.tiles.map(r => r.join("")) };
        if (s.back.some(r => r.includes("#"))) out.back = s.back.map(r => r.join(""));
        if (s.water.some(r => r.includes("~") || r.includes("m"))) out.water = s.water.map(r => r.join(""));
        if (s.dark.some(r => r.includes("d") || r.includes("t"))) out.dark = s.dark.map(r => r.join(""));
        if (s.rails.some(r => r.some(c => c !== "."))) out.rails = s.rails.map(r => r.join(""));
        out.settings = cleanSettings(s.settings);
        out.objects = s.objects.map(o => cleanObj(o, withKeys));
        return out;
    }
    function cleanObj(o, withKeys) {
        const c = {};
        for (const k of Object.keys(o)) {
            if (k[0] === "_" && !(withKeys && k === "_k")) continue;
            const v = o[k];
            if (v === undefined || v === null || v === "") continue;
            c[k] = v;
        }
        return c;
    }
    function cleanSettings(st) {
        const out = {};
        for (const [k, v] of Object.entries(st || {})) {
            if (v === undefined || v === null || v === "") continue;
            if (typeof v === "object" && !Array.isArray(v)) { const c = cleanSettings(v); if (Object.keys(c).length) out[k] = c; }
            else out[k] = v;
        }
        return out;
    }
    AE.toSpec = toSpec;
    AE.cleanObj = cleanObj;

    // The game's own act for this level: tiles as the game reads them, hidden rooms, sky, runs (nothing drawn).
    function rebuildAct() {
        const spec = toSpec(false);
        D().theme(S.zone);
        S.act = D().build(spec, S.zone, { bare: true });
        return S.act;
    }
    AE.rebuildAct = rebuildAct;

    async function loadIndex() {
        const r = await fetch("/assets/ariadne-levels/index.json", { cache: "no-store" });
        S.index = await r.json();
        return S.index;
    }
    async function loadLevel(id, specOverride) {
        let zi = -1, ai = -1;
        S.index.zones.forEach((z, i) => { const j = z.passages.indexOf(id); if (j >= 0) { zi = i; ai = j; } });
        if (zi < 0) throw new Error("No passage " + id);
        const spec = specOverride || await (await fetch("/assets/ariadne-levels/" + id + ".json", { cache: "no-store" })).json();
        const z = S.index.zones[zi];
        S.id = id; S.zi = zi; S.ai = ai; S.zone = { name: z.name, theme: z.theme, music: z.music, secret: z.secret };
        S.spec = adopt(spec);
        S.base = JSON.stringify(toSpec(false));
        S.sel = []; S.tileSel = null; S.undo = []; S.redo = []; S.pending = null;
        S.dirty = Boolean(specOverride);
        S.savedAt = null;
        rebuildAct();
        try { localStorage.setItem("ariadne-editor-last", id); } catch (e) { /* fine */ }
        AE.emit("load");
        AE.emit("change", { all: true });
        return S.spec;
    }
    AE.loadIndex = loadIndex;
    AE.loadLevel = loadLevel;

    async function save() {
        if (S.saving) return false;
        S.saving = true; AE.emit("saving");
        try {
            const spec = toSpec(false);
            const r = await fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: S.id, spec }) });
            const j = await r.json();
            if (!r.ok || !j.ok) throw new Error(j.error || "save failed");
            S.base = JSON.stringify(spec); S.dirty = false; S.savedAt = new Date();
            clearDraft();
            AE.emit("saved", j);
            return true;
        } catch (e) {
            AE.emit("saveError", e);
            return false;
        } finally { S.saving = false; AE.emit("dirty"); }
    }
    AE.save = save;

    /* DRAFTS: every change is kept in this browser too, so a closed tab or a
       crash loses nothing; opening the passage again offers it back. */
    const draftKey = id => "ariadne-editor-draft:" + id;
    let draftTimer = 0;
    function keepDraft() {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => { try { localStorage.setItem(draftKey(S.id), JSON.stringify({ at: Date.now(), spec: toSpec(false) })); } catch (e) { /* full */ } }, 400);
    }
    function clearDraft() { clearTimeout(draftTimer); try { localStorage.removeItem(draftKey(S.id)); } catch (e) { /* fine */ } }
    AE.draftOf = id => { try { const d = JSON.parse(localStorage.getItem(draftKey(id)) || "null"); return d && d.spec ? d : null; } catch (e) { return null; } };
    AE.clearDraft = id => { try { localStorage.removeItem(draftKey(id)); } catch (e) { /* fine */ } };

    /* ---------------------------------------------------------------- UNDO */
    const snap = () => JSON.stringify(toSpec(true));
    function restore(text) {
        const before = S.spec;
        S.spec = adopt(JSON.parse(text));
        const keys = new Set(S.spec.objects.map(o => o._k));
        S.sel = S.sel.filter(k => keys.has(k));
        const sized = before.w !== S.spec.w || before.h !== S.spec.h;
        rebuildAct();
        AE.emit("change", sized ? { all: true } : { tilesFrom: before, objects: true, settings: true });
    }
    AE.begin = function (label) { if (!S.pending) S.pending = { label, before: snap(), t: Date.now() }; };
    AE.commit = function (what) {
        const p = S.pending;
        S.pending = null;
        if (!p) return false;
        const after = snap();
        if (after === p.before) return false;
        // a run of small changes to one field (typing, a slider) is one step
        const top = S.undo[S.undo.length - 1];
        if (what && what.merge && top && top.merge === what.merge && Date.now() - top.t < 900) top.t = Date.now();
        else S.undo.push({ label: p.label, before: p.before, t: Date.now(), merge: what && what.merge });
        if (S.undo.length > 300) S.undo.shift();
        S.redo = [];
        rebuildAct();
        markDirty();
        AE.emit("change", what || { objects: true });
        return true;
    };
    AE.cancel = function () { if (S.pending) { restore(S.pending.before); S.pending = null; } };
    function markDirty() { S.dirty = snapSpecDiffers(); keepDraft(); AE.emit("dirty"); }
    const snapSpecDiffers = () => JSON.stringify(toSpec(false)) !== S.base;
    AE.undo = function () {
        const u = S.undo.pop();
        if (!u) return;
        S.redo.push({ label: u.label, before: snap(), t: Date.now() });
        restore(u.before);
        markDirty();
        AE.toast("Undid " + (u.label || "a change"));
    };
    AE.redo = function () {
        const r = S.redo.pop();
        if (!r) return;
        S.undo.push({ label: r.label, before: snap(), t: Date.now() });
        restore(r.before);
        markDirty();
        AE.toast("Redid " + (r.label || "a change"));
    };
    // a change made with begin/commit in one go
    AE.change = function (label, fn, what) { AE.begin(label); try { fn(); } finally { AE.commit(what); } };

    /* ---------------------------------------------------------------- OBJECTS */
    AE.byKey = k => S.spec.objects.find(o => o._k === k) || null;
    AE.selected = () => S.sel.map(AE.byKey).filter(Boolean);
    AE.select = function (keys, add) {
        const list = (Array.isArray(keys) ? keys : [keys]).filter(k => k !== null && k !== undefined);
        if (add) { for (const k of list) { const i = S.sel.indexOf(k); if (i >= 0) S.sel.splice(i, 1); else S.sel.push(k); } }
        else S.sel = list.slice();
        if (S.sel.length) S.tileSel = null;
        AE.emit("select");
    };
    AE.newKey = () => nextKey++;
    // A new object of a type (or a library preset) at x, y, made the way the catalogue says.
    AE.make = function (type, x, y, over) {
        const o = Object.assign({ type, x: Math.round(x), y: Math.round(y) }, JSON.parse(JSON.stringify(C.NEW[type] || {})), over ? JSON.parse(JSON.stringify(over)) : {});
        o._k = nextKey++;
        if (type === "gem" && !o.rid) o.rid = S.zi + "-" + S.ai + "-new-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        if (type === "mover" && o.axis !== "path") { const m = o.axis === "v" ? o.y : o.x; o.min = m + (o.min || -48); o.max = m + (o.max || 48); }
        return o;
    };
    // where its tile's corner would be (the game's TYPES ax, ay), for snapping to the grid
    AE.anchor = o => { const T = D().TYPES[o.type]; return T ? { ax: T.ax, ay: T.ay } : { ax: 0, ay: 0 }; };

    /* THE BOX each object takes up, in the map's pixels: what is picked by a
       click, outlined when chosen, and moved. */
    function frameW(kind) { return D().frameWidth(kind); }
    AE.box = function (o) {
        const T = D().TYPES[o.type];
        switch (o.type) {
            case "prop": { const s = D().sprites()[o.s]; if (!s) return { x: o.x, y: o.y, w: 16, h: 16 }; const img = s.r[0]; return { x: o.x, y: o.y, w: img.width, h: img.height }; }
            case "upright": return { x: o.x, y: o.y, w: frameW("post"), h: o.h };
            case "crossbeam": return { x: o.x, y: o.y, w: o.w, h: frameW("rail") + 2 };
            case "root": return { x: o.x - 6, y: o.y, w: 16, h: o.h };
            case "post": return { x: o.x, y: o.y, w: 8, h: o.h };
            case "brace": return { x: o.dir < 0 ? o.x - o.len + 1 : o.x, y: o.y - 1, w: o.len, h: o.len + 4 };
            case "cleat": return { x: o.x, y: o.y, w: 3, h: 9 };
            case "chain": return { x: o.x - 1, y: o.y, w: 3, h: o.h };
            case "hangrope": return { x: o.x - 1, y: o.y, w: 4, h: o.h };
            case "ycap": return { x: o.x, y: o.y, w: 8, h: 9 };
            case "shaftbeam": return { x: o.x, y: o.y, w: o.w, h: 9 };
            case "torch": {
                // (22 Oct 2026) a candle by its own picture: its flames over it, a hanging one from the ring its chains meet at
                const st = D().lampStyle(o), cd = window.RatArt && window.RatArt.candles[st];
                if (cd) { const L = D().lampAt(st), y0 = o.y + (cd.place === "hang" ? -3 : L.sy - 6), y1 = o.y + L.sy + cd.h; return { x: o.x + L.sx - 1, y: y0, w: cd.w + 2, h: y1 - y0 }; }
                return { x: o.x - 1, y: o.y - 10, w: 18, h: 30 };
            }
            case "light": return { x: o.x - 6, y: o.y - 6, w: 12, h: 12 };
            case "current": case "darkzone": case "supportarea": return { x: o.x, y: o.y, w: o.w || 16, h: o.h || 16 };
            case "mover": return { x: o.x, y: o.y, w: o.w || 48, h: 11 };
            case "float": return { x: o.x, y: o.y, w: 48, h: 13 };
            case "steam": return { x: o.x, y: o.y - 3, w: 16, h: 14 };
            case "hammer": return { x: o.x, y: o.y, w: 32, h: 22 };
            case "falls": return { x: o.x, y: o.y, w: 16, h: 6 };
            case "alarm": return { x: o.x, y: o.y, w: 16, h: 16 };
            case "vent": return { x: o.x, y: o.y - 5, w: 16, h: 6 };
            case "pump": return { x: o.x - 3, y: o.y - 8, w: 22, h: 24 };
            case "start": return { x: o.x - 3, y: o.y - 2, w: 16, h: 24 };
            case "sign": return { x: o.x, y: o.y, w: 16, h: 16 };
            case "machine": case "vine": case "neon": case "wreck": case "waterfall": return D().decoBox(o);
            case "gear": { const R = (o.r > 0 ? o.r : 40) + 3; return { x: o.x - R, y: o.y - R, w: R * 2, h: R * 2 }; }
            // (22 Oct 2026) the new mechanics'
            case "swing": { const L = o.len > 0 ? o.len : (o.kind === "chandelier" ? 40 : 72); return o.kind === "chandelier" ? { x: o.x - 9, y: o.y, w: 34, h: L + 41 } : { x: o.x + 4, y: o.y, w: 8, h: L + 2 }; }
            case "zipline": { const dx = o.dx === undefined ? 160 : o.dx, dy = o.dy === undefined ? 48 : o.dy; return { x: o.x + 4 + Math.min(0, dx), y: o.y + Math.min(0, dy), w: Math.abs(dx) + 8, h: Math.abs(dy) + 8 }; }
            case "scree": return { x: o.x, y: o.y, w: o.w || 64, h: (o.h || 64) + 4 };
            case "quicksand": case "pool": return { x: o.x, y: o.y, w: o.w || 64, h: o.h || 32 };
            case "rails": return { x: o.x, y: o.y + 10, w: o.w || 64, h: 6 };
            case "minecart": return { x: o.x, y: o.y, w: 24, h: 13 };
            case "firegate": return { x: o.x, y: o.y, w: 16, h: 48 };
            case "torchbracket": return { x: o.x, y: o.y - 6, w: 16, h: 22 };
            case "snake": return { x: o.x, y: o.y - 12, w: 16, h: 28 };
            case "mummy": return { x: o.x - 1, y: o.y, w: 16, h: 24 };
        }
        return T ? { x: o.x, y: o.y, w: T.w, h: T.h } : { x: o.x, y: o.y, w: 16, h: 16 };
    };
    // which of the editor's layers it belongs to (for showing, hiding and locking)
    const FRAME = new Set(["upright", "crossbeam", "root"]), TIMBER = new Set(["post", "brace", "cleat", "chain", "hangrope", "ycap", "shaftbeam"]);
    AE.layerOf = o => (o.type === "prop" || o.type === "machine" || o.type === "vine" || o.type === "neon" || o.type === "wreck" || o.type === "waterfall" ? (o.layer === "front" ? "front" : "back") : FRAME.has(o.type) ? "backdrop" : TIMBER.has(o.type) || o.type === "sign" || o.type === "supportarea" ? "back" : o.type === "light" || o.type === "torch" || o.type === "darkzone" ? "lights" : "objects");
    AE.isFrame = o => FRAME.has(o.type);
    AE.label = o => { const t = C.TYPES[o.type]; if (o.type === "prop") return "Prop: " + spriteName(o.s); if (o.type === "light") return ({ point: "Glow", spot: "Spotlight", shaft: "Light shaft", beacon: "Beacon" })[o.kind || "point"] || "Light"; return t ? t.label : o.type; };
    const spriteName = s => { const base = String(s || "").replace(/@.*/, ""); return C.PROP_NAMES[base] || base.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()); };
    AE.zoneName = s => { const z = String(s || "").split("@")[1]; return z ? C.ZONE_NAMES[z] || z : ""; };
    AE.spriteName = spriteName;

    /* ---------------------------------------------------------------- TILES */
    AE.layerRows = layer => (layer === "back" ? S.spec.back : layer === "water" ? S.spec.water : layer === "dark" ? S.spec.dark : layer === "rails" ? S.spec.rails : S.spec.tiles);
    AE.tileAt = (layer, tx, ty) => { const R = AE.layerRows(layer); return ty >= 0 && ty < S.spec.h && tx >= 0 && tx < S.spec.w ? R[ty][tx] : null; };
    // Set one tile; true if it changed. (Water and background walls have their own layers; erasing clears the one painted.)
    AE.setTile = function (layer, tx, ty, ch) {
        if (tx < 0 || ty < 0 || tx >= S.spec.w || ty >= S.spec.h) return false;
        const R = AE.layerRows(layer);
        const v = layer === "rails" ? ("-bxv".includes(ch) && ch ? ch : ".") : layer === "water" ? (ch === "~" || ch === "m" ? ch : ".") : layer === "dark" ? (ch === "d" || ch === "t" ? ch : ".") : layer === "back" ? (ch === "#" ? "#" : ".") : ch;
        if (R[ty][tx] === v) return false;
        R[ty][tx] = v;
        if (layer === "tiles" && (v === "S" || v === "G")) R[ty][tx] = autoSlope(R, tx, ty, v === "S");
        if (layer === "tiles") gentleRuns(R[ty]);
        return true;
    };
    /* GENTLE SLOPES SORT THEMSELVES (23 Oct 2026, the owner's: "gentle slopes can't be drawn properly, they don't all
       line up"). A gentle slope is two tiles to a row, its foot and its top; painted with the one brush, each run of
       them along a row is made foot, top, foot, top, counted from its low end (the left of one up to the right, the
       right of one up to the left). */
    // (each family's two halves, and the end its count starts from: floors' from their low end, ceilings' from the left)
    const PAIRS = [["{", "}", 1], ["]", "[", -1], ["k", "l", 1], ["y", "z", 1]];
    function gentleRuns(row) {
        for (let i = 0; i < row.length; i++) {
            const P = PAIRS.find(p => row[i] === p[0] || row[i] === p[1]);
            if (!P) continue;
            let j = i; while (j + 1 < row.length && (row[j + 1] === P[0] || row[j + 1] === P[1])) j++;
            for (let k = i; k <= j; k++) row[k] = (P[2] > 0 ? (k - i) % 2 : (j - k) % 2) ? P[1] : P[0];
            i = j;
        }
    }
    /* AN AUTO SLOPE (23 Oct 2026): what a painted slope is, from what is round it. A ceiling's if there is rock over it and
       none under, else a floor's. Which way: towards the wall beside it (a floor rises to it, a ceiling comes down to it);
       else carrying on from a slope beside it on the diagonal (or the row, for a gentle one); else up to the right. */
    const FLOORS = "/\\{}[]", CEILINGS = "unklyz";
    function autoSlope(R, tx, ty, steep) {
        const at = (x, y) => (R[y] && R[y][x]) || "#", rock = (x, y) => "#%X2iQV".includes(at(x, y)) || FLOORS.includes(at(x, y)) || CEILINGS.includes(at(x, y));
        const ceil = rock(tx, ty - 1) && !rock(tx, ty + 1);
        const L = rock(tx - 1, ty), Rr = rock(tx + 1, ty);
        const isF = (x, y, set) => set.includes(at(x, y));
        let right;   // floor: rises to the right; ceiling: comes down to the right
        if (Rr && !L) right = true; else if (L && !Rr) right = false;
        else if (!ceil) right = isF(tx - 1, ty + 1, "/{}") || isF(tx + 1, ty - 1, "/{}") || isF(tx - 1, ty, "{}") || isF(tx + 1, ty, "{}") ? true : isF(tx + 1, ty + 1, "\\[]") || isF(tx - 1, ty - 1, "\\[]") || isF(tx - 1, ty, "[]") || isF(tx + 1, ty, "[]") ? false : true;
        else right = isF(tx - 1, ty - 1, "ukl") || isF(tx + 1, ty + 1, "ukl") || isF(tx - 1, ty, "kl") || isF(tx + 1, ty, "kl") ? true : isF(tx + 1, ty - 1, "nyz") || isF(tx - 1, ty + 1, "nyz") || isF(tx - 1, ty, "yz") || isF(tx + 1, ty, "yz") ? false : true;
        if (ceil) return steep ? (right ? "u" : "n") : (right ? "k" : "y");
        return steep ? (right ? "/" : "\\") : (right ? "{" : "]");
    }

    /* RESIZE: add rows or columns at an edge (or take them away), the
       objects and the sea's lines moving with the map. */
    AE.resize = function (side, n) {
        AE.change((n > 0 ? "Add " : "Remove ") + Math.abs(n) + (side === "left" || side === "right" ? " columns" : " rows"), () => {
            const s = S.spec, horiz = side === "left" || side === "right";
            const fill = { tiles: "#", back: ".", water: ".", dark: ".", rails: "." };
            for (const key of ["tiles", "back", "water", "dark", "rails"]) {
                const R = s[key];
                if (horiz) for (const row of R) { if (n > 0) { const add = Array(n).fill(fill[key]); if (side === "left") row.unshift(...add); else row.push(...add); } else { if (side === "left") row.splice(0, -n); else row.splice(row.length + n, -n); } }
                else { if (n > 0) { const add = Array.from({ length: n }, () => Array(s.w).fill(fill[key])); if (side === "top") R.unshift(...add); else R.push(...add); } else { if (side === "top") R.splice(0, -n); else R.splice(R.length + n, -n); } }
            }
            if (horiz) s.w += n; else s.h += n;
            const dx = side === "left" ? n * TS : 0, dy = side === "top" ? n * TS : 0;
            if (dx || dy) {
                for (const o of s.objects) shiftObj(o, dx, dy);
                const sea = s.settings.sea;
                if (sea && dy) for (const k of ["low", "high", "drain", "cap"]) if (typeof sea[k] === "number") sea[k] += dy;
            }
        }, { all: true });
    };
    // Move an object, with whatever of it is in the map's own pixels (a path, a platform's range).
    function shiftObj(o, dx, dy) {
        o.x += dx; o.y += dy;
        if (Array.isArray(o.path)) for (const p of o.path) { p.x += dx; p.y += dy; }
        if (o.type === "mover" && o.axis !== "path") { const d = o.axis === "v" ? dy : dx; if (typeof o.min === "number") o.min += d; if (typeof o.max === "number") o.max += d; }
        if (o.type === "mover") { delete o.tx; delete o.ty; }
    }
    AE.shiftObj = shiftObj;

    /* ---------------------------------------------------------------- CHECKS
       What would trouble a player, or the game: listed in the Problems tab,
       each with where it is. */
    AE.problems = function () {
        const out = [], O = S.spec.objects, count = t => O.filter(o => o.type === t);
        const at = o => ({ x: o.x, y: o.y, k: o._k });
        const starts = count("start"), exits = count("exit"), keys = count("key").filter(k => !k.opens), flags = count("flag");
        if (!starts.length) out.push({ level: "error", text: "No start for Scout." });
        if (starts.length > 1) out.push({ level: "error", text: starts.length + " starts: the last one is used.", ...at(starts[1]) });
        if (!exits.length) out.push({ level: "error", text: "No exit door." });
        if (exits.length > 1) out.push({ level: "error", text: exits.length + " exit doors: only one opens.", ...at(exits[1]) });
        if (exits.length && !keys.length) out.push({ level: "error", text: "No key for the exit door." });
        if (flags.length > 1) out.push({ level: "warn", text: flags.length + " checkpoints: only the last counts.", ...at(flags[1]) });
        const ids = new Map();
        for (const d of count("doorway")) { if (d.id) ids.set(d.id, (ids.get(d.id) || 0) + 1); }
        for (const d of count("doorway")) {
            if (!d.to) out.push({ level: "warn", text: "A doorway leads nowhere (no To).", ...at(d) });
            else if (!ids.has(d.to)) out.push({ level: "error", text: `A doorway leads to "${d.to}", which is no doorway's name.`, ...at(d) });
            if (d.id && ids.get(d.id) > 1) out.push({ level: "warn", text: `Two doorways are both named "${d.id}".`, ...at(d) });
            if (d.lock && !count("key").some(k => k.opens === d.lock)) out.push({ level: "error", text: `A doorway locked "${d.lock}" has no key that opens it.`, ...at(d) });
        }
        for (const k of count("key")) if (k.opens && !count("doorway").some(d => d.lock === k.opens)) out.push({ level: "warn", text: `A key opens "${k.opens}", but no doorway has that lock.`, ...at(k) });
        const W = S.spec.w * TS, H = S.spec.h * TS;
        for (const o of O) { const b = AE.box(o); if (b.x + b.w < 0 || b.y + b.h < 0 || b.x > W || b.y > H) out.push({ level: "warn", text: AE.label(o) + " is outside the map.", ...at(o) }); }
        /* (18 Oct 2026) each blast spends a stick now: more rubble piles than sticks of dynamite, and one of them
           cannot be blasted (a pile that was only ever optional is fine, so a warning) */
        {
            const T = S.spec.tiles, seen = new Set(); let piles = 0;
            for (let y = 0; y < T.length; y++) for (let x = 0; x < T[y].length; x++) {
                const ch = T[y][x]; if ((ch !== "X" && ch !== "Q") || seen.has(x + "," + y)) continue;
                piles++; const st = [[x, y]]; seen.add(x + "," + y);
                while (st.length) { const [cx, cy] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, k = nx + "," + ny, c2 = T[ny] && T[ny][nx]; if ((c2 === "X" || c2 === "Q") && !seen.has(k)) { seen.add(k); st.push([nx, ny]); } } }
            }
            const sticks = count("dynamite").length;
            if (piles > sticks) out.push({ level: "warn", text: `${piles} rubble pile${piles === 1 ? "" : "s"} but ${sticks ? "only " + sticks : "no"} dynamite: each blast uses a stick.` });
        }
        /* a wall lantern over a ladder or rope Scout climbs (13 Oct 2026, the owner's rule; narrowed 17 Oct 2026,
           his choice: only the zone's own wall lantern, and only over what can be climbed, where a player might
           take it for part of the ladder; hanging, oil and floor lanterns, chains, posts and scenery ropes are fine) */
        for (const t of count("torch")) {
            if (t.style && t.style !== "wall") continue;
            const b = { x: t.x + 1, y: t.y - 8, w: 14, h: 26 };
            let hit = false;
            for (let ty = Math.floor(b.y / TS); ty <= Math.floor((b.y + b.h - 1) / TS) && !hit; ty++) for (let tx = Math.floor(b.x / TS); tx <= Math.floor((b.x + b.w - 1) / TS); tx++) { const c = AE.tileAt("tiles", tx, ty); if (c === "|" || c === "H" || c === "W" || c === "B" || c === "h" || c === "j") { hit = true; break; } }
            if (hit) out.push({ level: "warn", text: "A wall lantern is over a ladder or rope Scout climbs.", ...at(t) });
        }
        for (const g of count("gem")) if (count("gem").filter(o => o.rid === g.rid).length > 1) { out.push({ level: "error", text: "Two rubies share the ID " + g.rid + ".", ...at(g) }); break; }
        for (const f of O) if ((f.type === "steam") && AE.tileAt("tiles", Math.floor(f.x / TS) - 1, Math.floor((f.y - 4) / TS)) !== "#" && AE.tileAt("tiles", Math.floor(f.x / TS) + 1, Math.floor((f.y - 4) / TS)) !== "#") out.push({ level: "warn", text: "A steam valve is not against a wall.", ...at(f) });
        const hung = count("crate").filter(c => c.hang);
        if (hung.length && !count("knife").length) out.push({ level: "warn", text: "A crate hangs from a rope, but there is no knife in this passage to cut it.", ...at(hung[0]) });
        const sea = S.spec.settings.sea || {};
        if (count("pump").length && typeof sea.drain !== "number") out.push({ level: "warn", text: "A pump, but no Drain line for it to drain the sea to (Level settings).", ...at(count("pump")[0]) });
        if (count("float").length && typeof sea.low !== "number") out.push({ level: "warn", text: "A float, but no sea for it to ride (Level settings).", ...at(count("float")[0]) });
        return out;
    };

    /* ---------------------------------------------------------------- LITTLE THINGS */
    let toastTimer = 0;
    AE.toast = function (text, kind) {
        const el = document.getElementById("toast");
        if (!el) return;
        el.textContent = text; el.className = "toast show" + (kind ? " " + kind : "");
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = "toast"; }, kind === "error" ? 5000 : 1800);
    };
    AE.TS = TS;
})();

/* The rooms' own editor: three layouts for each room size, and which maze has which. A maze with nothing chosen for it gets
   its size from how many pictures it has and one of that size's three by chance, the same one every visit.
   Opened from the Rooms button in the hallway editor, here and in the Warren. The hands are the hallway's:
     click to place, with a ghost first; drag sofas, tables, planters, bookcases and rugs out to length
     Shift (on its own) or R turns what you're placing or carrying; Shift-click turns anything placed
     Alt-click carries a piece; Ctrl-click deletes it (or throws away what you carry); drag moves it; arrow keys nudge it
     hold Ctrl and move the mouse: the height of what you're placing or carrying; Ctrl-drag for one already placed
     the wheel or + and - zoom, a right or middle drag moves the view, G shows the tiles, Ctrl+S saves
   Undo is the hallway editor's own: one list of steps for both (10 Nov scan, rooms 9). */
(function () {
    "use strict";
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const SIZES = () => Object.keys(window.RoomStarter.layouts);
    /* the rooms behind doors you link by hand: never a maze's (10 Nov scan, rooms 11) */
    const SPECIAL = { "6x14": "Staff corridor (6 x 14)", "4x8": "Passage (4 x 8)", "8x6": "Finders' Lounge (8 x 6)" };
    const sizeName = s => SPECIAL[s] || s.replace("x", " x ");
    const MAZE_SIZES = () => SIZES().filter(s => !SPECIAL[s]);
    const R_ = "art/rooms/", H_ = "art/hall/hh_room_hallway/", T_ = "art/thumbs/";
    const hall = (p, extra) => ({ k: "hall", p, ...(extra || {}) });
    const LAMP_STYLES = { hotel: "Hotel drum", torch: "Uplighter", tiffany: "Stained glass", globe: "Globe" };
    const GROUPS = [
        ["The archive", [
            ["Oak table", { k: "table" }, R_ + "table.png"], ["Ledger on a table", { k: "ledger" }, R_ + "ledger.png"], ["Album on a table", { k: "album" }, R_ + "book-oxblood.png"], ["Bookcase", { k: "shelf", axis: "y", n: 4 }, R_ + "shelf20.png"],
            ["Lamp", { k: "lamp" }, R_ + "lamp.png"], ["Globe", { k: "globe" }, R_ + "globe.png"], ["Oak chair", { k: "chair4" }, R_ + "chair4.png"], ["Stool", { k: "stool" }, R_ + "stool.png"], ["Crate", { k: "crate" }, R_ + "crate.png"],
            ["Barrel", { k: "barrel" }, R_ + "barrel.png"], ["Cupboard", { k: "cupboard" }, R_ + "cupboard.png"], ["Candelabra", { k: "candelabra" }, R_ + "candelabra.png"],
            ["Red rug", { k: "rug", w: 4, h: 3 }, T_ + "rug.png"], ["Round rug", { k: "rugRound" }, R_ + "rug-round.png"]
        ]],
        ["Hallway furniture", [
            ["Sofa", hall("sofa"), T_ + "sofa.png"], ["Chair", hall("chair"), H_ + "hw_chair_a_0_2_0.png"], ["Table", hall("table"), T_ + "table.png"], ["Small round table", hall("smtable"), H_ + "hw_smtble_a_0_0_0.png"], ["Ball post", hall("ballpost"), H_ + "pillar0_a_0_0_0.png"],
            ["Hotel lamp", hall("lamp", { style: "hotel" }), "art/lamp-hotel.png"], ["Uplighter", hall("lamp", { style: "torch" }), "art/lamp-torch.png"], ["Stained glass lamp", hall("lamp", { style: "tiffany" }), "art/lamp-tiffany.png"], ["Globe lamp", hall("lamp", { style: "globe" }), "art/lamp-globe.png"],
            ["Plant", hall("plant"), H_ + "hw_plant_a_0_0_0.png"], ["Planter", hall("ero"), T_ + "planter.png"], ["Stone planter", hall("ero_stone"), T_ + "planter-stone.png"], ["Walnut planter", hall("ero_walnut"), T_ + "planter-walnut.png"], ["Evergreen planter", hall("ero_evergreen"), T_ + "planter-evergreen.png"], ["Flower planter", hall("ero_flower"), T_ + "planter-flower.png"],
            ["Pillar", hall("pillar"), H_ + "pillar1_a_0_0_0.png"], ["Tall pillar", hall("pillartall"), T_ + "pillartall.png"], ["Statue", hall("statue"), H_ + "hw_statue_a_0_0_0.png"], ["Fountain", hall("fountain"), H_ + "hw_fountain_a_0_0_0.png"], ["Hallway bookcase", hall("shelf"), H_ + "hw_shelf_a_0_4_0.png"], ["Cabinet", hall("cabinet"), H_ + "hw_closet1_a_0_2_0.png"], ["Water cooler", hall("water"), H_ + "hw_watermatic_a_0_4_0.png"]
        ]],
        ["Staff corridors", [["Pipes", { k: "st_pipes" }, R_ + "st_pipes.png"], ["Boiler", { k: "st_boiler" }, R_ + "st_boiler.png"], ["Duct", { k: "st_duct" }, R_ + "st_duct.png"], ["Vent", { k: "st_vent" }, R_ + "st_vent.png"], ["Vent, other wall", { k: "st_ventx" }, R_ + "st_ventx.png"], ["Fan unit", { k: "st_fan" }, R_ + "st_fan.png"], ["Fuse cabinet", { k: "st_cabinet" }, R_ + "st_cabinet.png"], ["Floor grate", { k: "st_grate" }, R_ + "st_grate.png"], ["Hazard stripes", { k: "st_hazard" }, R_ + "st_hazard.png"],
            ["Bulkhead light", { k: "st_light_bulkhead" }, R_ + "st_light_bulkhead.png"], ["Hanging lamp", { k: "st_light_pendant" }, R_ + "st_light_pendant.png"], ["Strip light", { k: "st_light_batten" }, R_ + "st_light_batten.png"], ["Caged lamp", { k: "st_light_caged" }, R_ + "st_light_caged.png"], ["Work lamp", { k: "st_light_work" }, R_ + "st_light_work.png"]]],
        ["On the walls", [
            ["Maze's picture", { k: "frame", w: 34, h: 26, up: 34, slot: 0 }, null], ["Window", { k: "window" }, R_ + "window-r.png"], ["Wall light", { k: "sconce", up: 70 }, "art/sconce-x.png"], ["Globe wall light", { k: "sconce", style: "globe", up: 70 }, "art/sconce-globe-x.png"],
            /* the staff door: walking up to it takes you back out, as the arrow does */
            ["Staff door (a way out)", { k: "painting", id: "i_staffdoor", up: ((window.WALL_ITEMS || []).find(i => i.id === "i_staffdoor") || { h: 40 }).h }, "art/wall/i_staffdoor.png"],
            ...(window.WALL_ITEMS || []).filter(i => !i.tell).map(i => [i.name, { k: "painting", id: i.id, up: i.locked ? i.h : 62 }, "art/wall/" + i.x.layers[0].f])
        ]]
    ];
    const Z_MAX = 120, KEEP = "hallway-rooms-view";
    /* one layout's problems. Out here, so the hallway's Problems tab can ask about every layout, not only the one on screen (10 Nov scan b, rooms 8) */
    function problemsOf(V, r, size) {
        const solid = V.solidSet(r), msgs = [];
        for (const e of ["x", "y"]) for (const t of V.arrowTiles(r, e)) if (solid.has(t[0] + "," + t[1])) msgs.push("Something stands on a way in.");
        if (!SPECIAL[size]) {
            if (!r.items.some(i => i.k === "ledger")) msgs.push("No ledger, so nowhere to read about the maze.");
            if (!r.items.some(i => i.k === "album")) msgs.push("No album, so the pictures can't all be seen.");
        }
        /* can you get to it? */
        const way = [...V.arrowTiles(r, "x"), ...V.arrowTiles(r, "y")].find(t => !solid.has(t[0] + "," + t[1]));
        if (way) {
            const reach = (x, y) => (x === way[0] && y === way[1]) || !!V.route(r, way, [x, y]), free = (x, y) => x >= 0 && y >= 0 && x < r.w && y < r.h && !solid.has(x + "," + y);
            for (const it of r.items) {
                if (it.k !== "ledger" && it.k !== "album" && it.k !== "frame") continue;
                const out = [], f = V.footprint(it);
                if (it.k === "frame") { const t = Math.floor(it.at); for (const a of [t, t - 1, t + 1]) for (const d of [0, 1]) out.push(it.wall === "l" ? [d, a] : [a, d]); }
                else if (f) for (let x = f[0] - 1; x <= f[0] + f[2]; x++) for (let y = f[1] - 1; y <= f[1] + f[3]; y++) out.push([x, y]);
                if (!out.some(q => free(q[0], q[1]) && reach(q[0], q[1]))) msgs.push(it.k === "frame" ? "A picture has nowhere to stand in front of it. It opens from across the room." : "The " + it.k + " can't be walked up to.");
            }
        }
        const slots = r.items.filter(q => q.k === "frame").map(q => q.slot); if (new Set(slots).size !== slots.length) msgs.push("Two pictures on the wall show the same picture.");
        return [...new Set(msgs)];
    }
    /* every layout's: [{ size, n, name, msgs }] */
    function allProblems(map) {
        const V = window.RoomView; if (!V || !window.RoomStarter) return []; const L = V.layouts(map), out = [];
        for (const size of Object.keys(L)) L[size].forEach((lay, n) => { const [w, h] = size.split("x").map(Number), msgs = problemsOf(V, { w, h, floor: lay.floor, walls: lay.walls, items: lay.items, exitAt: lay.exitAt }, size); if (msgs.length) out.push({ size, n, name: sizeName(size) + ", layout " + (n + 1), msgs }); });
        return out;
    }
    let host = null;
    function open(api) {
        if (host) return;
        const V = window.RoomView, P = window.FurniParts;
        host = el("div", "re-host"); document.body.appendChild(host);
        const bar = el("div", "re-bar"), left = el("div", "re-left"), right = el("div", "re-right"), stage = el("div", "re-stage"), c = el("canvas"), tip = el("div", "re-tip"), status = el("div", "re-status"), stWhere = el("span"), stWhat = el("span");
        status.append(stWhere, stWhat); stage.append(c, tip, status);
        c.tabIndex = -1;      // the room takes the keys once clicked (10 Nov scan, rooms 8)
        host.append(bar, left, stage, right);
        /* where he was last time: size, layout and tab (10 Nov scan, rooms 24) */
        const kept = (() => { try { return JSON.parse(localStorage.getItem(KEEP) || "{}"); } catch (e) { return {}; } })();
        let size = SIZES().includes(kept.size) ? kept.size : SIZES()[0], n = [0, 1, 2].includes(kept.n) ? kept.n : 0, tab = kept.tab === "mazes" ? "mazes" : "layout";
        let tool = null, sel = null, zoom = 2, preview = null, mazes = [], mazesState = "loading";
        let mouse = null, placeZ = 0, placeTurn = 0, carry = null, drag = null, ctrlY = null, ctrlSpare = 0, lockTile = null, heightBox = null, ctrlFrom = null, ctrlArmed = false;
        let userZoom = null, pan = { x: 0, y: 0 }, panning = null, grid = false, shiftAlone = false, panelFields = [];
        const keep = () => { try { localStorage.setItem(KEEP, JSON.stringify({ size, n, tab })); } catch (e) { /* not kept */ } };

        const own = () => { const m = api.map(); if (!m.rooms) m.rooms = {}; if (!m.rooms.layouts) m.rooms.layouts = JSON.parse(JSON.stringify(window.RoomStarter.layouts)); if (!m.rooms.assign) m.rooms.assign = {}; return m.rooms; };
        const layout = () => V.layouts(api.map())[size][n];
        const roomNow = () => { const [w, h] = size.split("x").map(Number), L = layout(); return { w, h, floor: L.floor, walls: L.walls, items: L.items, exitAt: L.exitAt }; };
        const commit = () => { api.changed(); paintSoon(); checks(); syncUndo(); };
        /* a step of undo, on the hallway editor's own list */
        const before = () => { if (api.snapshot) api.snapshot(); };
        /* the same item, in the map's own copy, after own() has cloned the starter */
        const editing = fn => { const L0 = layout(), idx = sel ? L0.items.indexOf(sel) : -1; before(); own(); const L = layout(); if (idx >= 0) sel = L.items[idx]; fn(L); commit(); };
        const editingNoCommit = () => { const L0 = layout(), idx = sel ? L0.items.indexOf(sel) : -1; before(); own(); if (idx >= 0) sel = layout().items[idx]; };
        const say = t => { tip.textContent = t || ""; tip.hidden = !t; };

        /* ---------- top bar ---------- */
        const sizeSel = el("select"); SIZES().forEach(s => { const o = el("option", "", sizeName(s)); o.value = s; sizeSel.appendChild(o); });
        const nums = el("div", "re-nums"), floorSel = el("select"); [["slate", "Grey squares"], ["wood", "Wood"]].forEach(([v, t]) => { const o = el("option", "", t); o.value = v; floorSel.appendChild(o); });
        const wallSel = el("select"); [["", "Stone"], ["staff", "Staff"]].forEach(([v, t]) => { const o = el("option", "", t); o.value = v; wallSel.appendChild(o); });
        const seeSel = el("select"), tabLayout = el("button", "btn", "Layouts"), tabMazes = el("button", "btn", "Which maze has which"), done = el("button", "btn primary", "Done"), undoB = el("button", "btn", "Undo"), redoB = el("button", "btn", "Redo"), saveB = el("button", "btn", "Save");
        [tabLayout, tabMazes, done, undoB, redoB, saveB].forEach(b => { b.type = "button"; });
        undoB.title = "Ctrl+Z"; redoB.title = "Ctrl+Y"; saveB.title = "Ctrl+S";
        const none = el("option", "", "No maze"); none.value = ""; seeSel.appendChild(none);
        const lab = (t, e) => { const l = el("label", "re-lab"); l.append(el("span", "", t), e); return l; };
        bar.append(el("strong", "", "Rooms"), tabLayout, tabMazes, lab("Size", sizeSel), lab("Layout", nums), lab("Floor", floorSel), lab("Walls", wallSel), lab("Show with", seeSel), undoB, redoB, el("span", "re-spacer"), saveB, done);
        const numBtns = [0, 1, 2].map(i => { const b = el("button", "re-num", String(i + 1)); b.type = "button"; b.addEventListener("click", () => { n = i; sel = null; carry = null; lockTile = null; sync(); }); nums.appendChild(b); return b; });
        sizeSel.addEventListener("change", () => { size = sizeSel.value; sel = null; carry = null; lockTile = null; userZoom = null; pan = { x: 0, y: 0 }; sync(); });
        floorSel.addEventListener("change", () => editing(L => { L.floor = floorSel.value; }));
        wallSel.addEventListener("change", () => editing(L => { L.walls = wallSel.value; }));
        seeSel.addEventListener("change", () => { const m = mazes.find(q => q.slug === seeSel.value); preview = m ? V.mazeFacts(m) : null; paintSoon(); });
        /* Undo and Redo: the hallway's steps, and whichever layout a step changed comes up, so nothing changes out of sight */
        function step(fn, can, word) {
            if (!fn || (can && !can())) { say("Nothing to " + word.toLowerCase() + "."); return; }
            const was = JSON.stringify(api.map().rooms || null); fn(); api.changed();
            sel = null; carry = null; drag = null; lockTile = null;
            const old = JSON.parse(was), now = api.map().rooms || null, layoutOf = (rooms, s, k) => JSON.stringify(((rooms && rooms.layouts && rooms.layouts[s]) || window.RoomStarter.layouts[s] || [])[k] || null);
            const moved = []; for (const s of SIZES()) for (let k = 0; k < 3; k++) if (layoutOf(old, s, k) !== layoutOf(now, s, k)) moved.push([s, k]);
            if (moved.length && !moved.some(([s, k]) => s === size && k === n)) { [size, n] = moved[0]; say(word + "ne on " + sizeName(size) + ", layout " + (n + 1) + "."); }
            else if (moved.length) say("");
            else if (JSON.stringify((old && old.assign) || {}) !== JSON.stringify((now && now.assign) || {})) say(word + "ne in Which maze has which.");
            else say(word + "ne in the hallway, not the rooms.");
            sync();
        }
        const doUndo = () => step(api.undo, api.canUndo, "Undo"), doRedo = () => step(api.redo, api.canRedo, "Redo");
        const syncUndo = () => { undoB.disabled = !!api.canUndo && !api.canUndo(); redoB.disabled = !!api.canRedo && !api.canRedo(); };
        const saveNow = () => { if (api.save) { api.save(); say("Saving."); setTimeout(() => say(""), 1200); } };
        undoB.addEventListener("click", doUndo); redoB.addEventListener("click", doRedo); saveB.addEventListener("click", saveNow); if (!api.save) saveB.hidden = true;
        tabLayout.addEventListener("click", () => { tab = "layout"; sync(); }); tabMazes.addEventListener("click", () => { tab = "mazes"; sync(); });
        const close = () => { endLift(); if (drag && drag.moved) commit(); drag = null; keep(); removeEventListener("keydown", keys, true); removeEventListener("keyup", keysUp, true); removeEventListener("resize", paintSoon); V.onArt = null; host.remove(); host = null; };
        done.addEventListener("click", close);

        /* ---------- the palette ---------- */
        const search = el("input", "re-search"); search.type = "search"; search.placeholder = "Find a thing to place"; left.appendChild(search);
        const tools = el("div", "re-tools"); left.appendChild(tools);
        const selectB = el("button", "re-tool wide", "Select and move"); selectB.type = "button"; selectB.addEventListener("click", () => { pick(null); });
        const toolBtns = [];
        function pick(it) { tool = it; sel = null; carry = null; placeTurn = 0; placeZ = 0; drag = null; say(""); sync(); }
        function buildPalette() {
            tools.textContent = ""; tools.appendChild(selectB); toolBtns.length = 0; const q = search.value.trim().toLowerCase();
            for (const [title, list] of GROUPS) {
                const shown = list.filter(x => !q || x[0].toLowerCase().includes(q)); if (!shown.length) continue;
                tools.appendChild(el("h4", "", title)); const grid = el("div", "re-grid"); tools.appendChild(grid);
                for (const [name, it, thumb] of shown) { const b = el("button", "re-tool"); b.type = "button"; b.title = name; if (thumb) { const i = el("img"); i.src = thumb; i.alt = ""; b.appendChild(i); } b.appendChild(el("span", "", name)); b.addEventListener("click", () => pick(it)); grid.appendChild(b); toolBtns.push([b, it]); }
            }
        }
        search.addEventListener("input", () => { buildPalette(); sync(); });
        const help = el("p", "re-help", "Click to place, or drag out sofas, planters, bookcases and rugs. Shift or R turns what you're placing. Hold Ctrl and move the mouse up or down for its height; Ctrl-drag raises one already placed. Alt-click carries, Ctrl-click deletes, arrows nudge. The wheel zooms, right-drag moves the view, G shows the tiles."); left.appendChild(help);
        const issues = el("div", "re-issues"); left.appendChild(issues);

        /* ---------- turning ---------- */
        const CHAIR_ROT = [["chair4", false], ["chair6", false], ["chair4", true], ["chair6", true]];
        function turned(it) {
            const q = { ...it };
            if (q.k === "hall") { const t = P.turns(q.p); if (t < 2) return null; q.rot = (P.rotOf({ k: q.p, rot: q.rot }) + 1) % t; return q; }
            if (q.k === "shelf") { q.axis = q.axis === "x" ? "y" : "x"; return q; }
            if (q.k === "rug") { const w = q.w; q.w = q.h; q.h = w; return q; }
            if (q.k === "chair4" || q.k === "chair6") { const i = CHAIR_ROT.findIndex(c => c[0] === q.k && c[1] === !!q.flip), nx = CHAIR_ROT[(i + 1) % 4]; q.k = nx[0]; q.flip = nx[1]; if (!q.flip) delete q.flip; return q; }
            if (V.isWall(q)) return null;      // a wall thing goes to the other wall by its own button, not by R (10 Nov scan, rooms 13)
            if (q.k === "rugRound" || q.k === "lamp") return null;
            q.flip = !q.flip; if (!q.flip) delete q.flip; return q;
        }
        const otherWall = q0 => { const q = { ...q0 }; q.wall = q.wall === "l" ? "r" : "l"; const r = roomNow(), len = q.wall === "l" ? r.h : r.w; if (q.at !== undefined) q.at = Math.min(len - .5, q.at); return q; };
        const turnCount = q => q.k === "hall" ? P.turns(q.p) : q.k === "chair4" || q.k === "chair6" ? 4 : (q.k === "rugRound" || q.k === "lamp" || V.isWall(q)) ? 1 : 2;
        const withTurns = q => { if (V.isWall(q)) return q; let o = q; for (let i = 0; i < placeTurn; i++) o = turned(o) || o; return o; };
        const applyTo = (it, q) => { for (const k of Object.keys(it)) delete it[k]; Object.assign(it, q); };
        const isDoor = it => it && it.k === "painting" && it.id === "i_staffdoor";

        /* ---------- what stands where ---------- */
        const lengthwise = it => it.k === "shelf" || (it.k === "hall" && P.ROWS[it.p]);
        const fits = (r, it, ignore) => {
            if (V.isWall(it)) return true;
            if (it.k === "rugRound") return it.x >= 0 && it.y >= 0 && it.x < r.w && it.y < r.h;
            if (it.k === "rug") return it.x >= 0 && it.y >= 0 && it.x + it.w <= r.w && it.y + it.h <= r.h;
            const f = V.footprint(it); if (!f) return false;
            if (f[0] < 0 || f[1] < 0 || f[0] + f[2] > r.w || f[1] + f[3] > r.h) return false;
            for (const t of [...V.arrowTiles(r, "x"), ...V.arrowTiles(r, "y")]) if (t[0] >= f[0] && t[1] >= f[1] && t[0] < f[0] + f[2] && t[1] < f[1] + f[3]) return false;
            /* raised, it can sit over something: that's what height is for */
            if (it.z) return true;
            for (const q of r.items) { if (q === ignore || V.isWall(q) || V.isRug(q) || q.z) continue; const g = V.footprint(q); if (g && f[0] < g[0] + g[2] && g[0] < f[0] + f[2] && f[1] < g[1] + g[3] && g[1] < f[1] + f[3]) return false; }
            return true;
        };
        /* where on a wall: the left wall is left of the back corner, the right wall right of it */
        function wallPoint(r, X, Y) {
            const o = V.scr(r, 0, 0), u = X - o[0], wall = u < 0 ? "l" : "r", at = Math.max(.5, Math.min((wall === "l" ? r.h : r.w) - .5, Math.abs(u) / 16));
            return { wall, at: Math.round(at * 10) / 10, up: Math.round((o[1] + at * 8 - Y) / 2) * 2 };
        }
        /* is the mouse over a wall face (behind the floor's back edges)? A wall thing's ghost shows only there (10 Nov scan, rooms 23) */
        const overWall = (r, p) => { const t = V.tileAt(r, p[0], p[1]); return !inRoom(r, t) && (t[0] < 0 || t[1] < 0) && t[0] < r.w && t[1] < r.h; };
        const clampUp = (it, up) => { const lo = it.k === "frame" ? 6 : 16, hi = it.k === "frame" ? 90 : 96; return Math.max(lo, Math.min(hi, up)); };
        /* a staff door stands on the floor whatever height the mouse is at */
        const doorUp = () => ((window.WALL_ITEMS || []).find(i => i.id === "i_staffdoor") || { h: 40 }).h;
        const hang = (it, w) => { it.wall = w.wall; it.at = w.at; if (isDoor(it)) { it.up = doorUp(); return; } if (it.k !== "window") it.up = clampUp(it, it.k === "frame" ? w.up - it.h / 2 : w.up); };
        /* what's being placed or carried, put where the mouse is */
        function heldAt(base, p, r) {
            const q = { ...base };
            if (V.isWall(q)) { if (!lockTile || q.wall === undefined) { hang(q, wallPoint(r, p[0], p[1])); if (carry && base === carry.item && carry.upKept !== undefined) q.up = carry.upKept; } return q; }
            const t = lockTile || V.tileAt(r, p[0], p[1]); q.x = t[0]; q.y = t[1]; return q;
        }
        /* dragged out to a length, as the hallway's sofas are */
        function runFrom(base, a, b) {
            const q = { ...base }, dx = b[0] - a[0], dy = b[1] - a[1];
            if (!dx && !dy) { q.x = a[0]; q.y = a[1]; return q; }
            const along = Math.abs(dy) > Math.abs(dx), len = Math.abs(along ? dy : dx) + 1;
            q.x = along || dx > 0 ? a[0] : b[0]; q.y = !along || dy > 0 ? a[1] : b[1];
            if (q.k === "shelf") { q.axis = along ? "y" : "x"; q.n = Math.max(2, len); } else { q.rot = along ? 1 : 0; q.len = Math.max(P.ROWS[q.p].min, len); }
            return q;
        }
        const rugFrom = (base, a, b) => ({ ...base, x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 });
        const inRoom = (r, t) => t[0] >= 0 && t[1] >= 0 && t[0] < r.w && t[1] < r.h;

        /* ---------- the selected panel, as the hallway editor's (10 Nov scan, rooms 13) ---------- */
        function entryOf(it) { for (const [, list] of GROUPS) for (const x of list) { const t = x[1]; if (t.k === it.k && t.p === it.p && t.id === it.id && (it.k !== "sconce" || (t.style || "") === (it.style || "")) && (!(it.k === "hall" && it.p === "lamp") || (t.style || "hotel") === (it.style || "hotel"))) return x; } if (it.k === "chair6") return entryOf({ k: "chair4" }); return null; }
        function nameOf(it) { const e = entryOf(it); return e ? e[0] : it.k === "hall" ? "Hallway piece" : "Thing"; }
        function panel() {
            right.textContent = ""; panelFields = [];
            if (tab === "mazes") return mazesPanel();
            if (!sel) { right.appendChild(el("p", "re-help", tool ? "Placing: " + nameOf(tool) + "." : "Nothing selected. Click anything in the room.")); return; }
            const e = entryOf(sel); right.appendChild(el("h3", "", nameOf(sel)));
            if (e && e[2]) { const i = el("img", "re-thumb"); i.src = e[2]; i.alt = ""; right.appendChild(i); }
            const turns = !V.isWall(sel) && turnCount(sel) > 1, long = sel.k === "shelf" || (sel.k === "hall" && P.ROWS[sel.p]);
            right.appendChild(el("p", "re-hint", V.isWall(sel) ? (isDoor(sel) ? "Drag it along the wall or onto the other wall." : "Drag it along the wall or onto the other wall. Ctrl-drag moves it up or down.") : "Drag it to move it, or use the arrow keys to nudge it." + (turns ? " R turns it." : "") + (V.isRug(sel) ? "" : " Ctrl-drag raises it.")));
            const num = (label, key, min, max, step, fallback) => {
                const row = el("label", "re-lab"), i = el("input"); i.type = "text"; i.inputMode = "numeric"; i.autocomplete = "off"; i.value = sel[key] === undefined ? fallback : sel[key]; let begun = false;
                const apply = () => { if (i.value.trim() === "" || !Number.isFinite(Number(i.value))) return; const v = Math.max(min, Math.min(max, Math.round(Number(i.value)))); if (key === "z" && !v && sel.z && !V.isWall(sel) && !fits(roomNow(), (({ z, ...o }) => o)(sel), sel)) { say("There's something under it, so it can't go down to the floor."); i.value = sel.z; return; } if (!V.isWall(sel) && (key === "n" || key === "len" || key === "w" || key === "h") && !fits(roomNow(), { ...sel, [key]: v }, sel)) { say("There isn't room for that here."); return; } say(""); if (!begun) { begun = true; editingNoCommit(); } if (key === "z" && !v) delete sel.z; else sel[key] = v; api.changed(); paintSoon(); syncUndo(); };
                i.addEventListener("change", apply);      // not every keystroke: typing 10 went through 1, clamped (10 Nov scan b, rooms 12)
                i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); i.blur(); } if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); i.value = Math.max(min, Math.min(max, (Number(i.value) || 0) + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : step || 1))); apply(); } });
                i.addEventListener("blur", () => { begun = false; i.value = sel && sel[key] !== undefined ? sel[key] : fallback === undefined ? "" : fallback; checks(); });
                row.append(el("span", "", label), i); right.appendChild(row); panelFields.push({ i, key, fallback }); if (key === "z") heightBox = i;
            };
            heightBox = null;
            if (sel.k === "shelf") num("Length", "n", 2, 16);
            if (sel.k === "hall" && P.ROWS[sel.p]) num("Length", "len", P.ROWS[sel.p].min, 16, 1, P.lengthOf({ k: sel.p, len: sel.len }));
            if (sel.k === "rug") { num("Across", "w", 2, 16); num("Down", "h", 2, 16); }
            if (sel.k === "frame") { num("Width", "w", 16, 72, 2); num("Height", "h", 12, 56, 2); num("Height on the wall", "up", 6, 90, 1); num("Which picture (0 entrance, 1 finish, then the gallery)", "slot", 0, 40); }
            if ((sel.k === "painting" && !isDoor(sel)) || sel.k === "sconce") num("Height on the wall", "up", 16, 96, 1);
            if (!V.isWall(sel) && !V.isRug(sel)) num("Height off the floor", "z", 0, Z_MAX, 1, 0);
            /* the hallway lamp's design, as on the hallway's own lamps */
            if (sel.k === "hall" && sel.p === "lamp") {
                const s = el("select"); for (const [k, v] of Object.entries(LAMP_STYLES)) { const o = el("option", "", v); o.value = k; s.appendChild(o); } s.value = sel.style || "hotel";
                s.addEventListener("change", () => editing(() => { sel.style = s.value; })); right.appendChild(lab("Design", s));
            }
            const row = el("div", "re-actions"), btn = (t, fn, cls) => { const b = el("button", cls || "btn", t); b.type = "button"; b.addEventListener("click", fn); row.appendChild(b); };
            if (turns) btn("Rotate", () => turnThing(sel));
            if (V.isWall(sel) && sel.k !== "window") btn("Other wall", () => { const it = sel; editing(() => applyTo(sel, otherWall(it))); panel(); });
            if (long) { btn("Shorter", () => resize(-1)); btn("Longer", () => resize(1)); }
            btn("Delete", removeSel, "btn ghost danger");
            right.appendChild(row);
        }
        /* the panel's numbers follow a drag or a lift, without being rebuilt under the mouse (10 Nov scan, rooms 22) */
        const panelValues = () => { for (const f of panelFields) if (document.activeElement !== f.i && sel) f.i.value = sel[f.key] === undefined ? (f.fallback === undefined ? "" : f.fallback) : sel[f.key]; };
        function resize(d) {
            const key = sel.k === "shelf" ? "n" : "len", min = sel.k === "shelf" ? 2 : P.ROWS[sel.p].min, now = sel.k === "shelf" ? sel.n : P.lengthOf({ k: sel.p, len: sel.len }), v = Math.max(min, Math.min(16, now + d));
            if (v === now) return; if (!fits(roomNow(), { ...sel, [key]: v }, sel)) { say("There isn't room for that here."); return; }
            editing(() => { sel[key] = v; }); say(""); panel();
        }
        const removeSel = () => { if (!sel) return; if (carry && carry.it === sel) { carry = null; lockTile = null; } if (layout().items.indexOf(sel) < 0) { sel = null; panel(); return; } editing(L => { L.items.splice(L.items.indexOf(sel), 1); }); sel = null; panel(); };
        function turnThing(it) {
            const q = turned(it); if (!q) { say(V.isWall(it) ? "Use Other wall to move it to the other wall." : "This one looks the same from every side."); return; }
            if (!fits(roomNow(), q, it)) { say("There isn't room to turn it there."); return; }
            sel = it; editing(() => applyTo(sel, q)); say(""); panel();
        }
        function mazesPanel() {
            right.appendChild(el("h3", "", "Which maze has which"));
            right.appendChild(el("p", "re-help", "Size goes by how many pictures a maze has, and the layout by chance, until you choose. Show puts a maze's room up."));
            const again = el("button", "btn", "Deal the layouts again"); again.type = "button";
            /* only the mazes you haven't chosen for (10 Nov scan, rooms 10) */
            again.addEventListener("click", () => {
                const R0 = api.map().rooms, chosen = mazes.filter(m => R0 && R0.assign && R0.assign[m.slug] && R0.assign[m.slug].chosen), rest = mazes.length - chosen.length;
                if (!rest) { say("You've chosen a layout for every maze."); return; }
                if (!window.confirm(`Deal a new layout to the ${rest} maze${rest === 1 ? "" : "s"} you haven't chosen one for?` + (chosen.length ? ` The ${chosen.length} you chose keep theirs.` : ""))) return;
                before(); const R = own(); for (const m of mazes) { const a = V.roomFor(api.map(), m), was = R.assign[m.slug]; if (was && was.chosen) continue; R.assign[m.slug] = { layout: Math.floor(Math.random() * 3) }; /* the layout only: the size goes on following its pictures (10 Nov scan b, rooms 5) */ } commit(); panel();
            });
            right.appendChild(again);
            if (mazesState !== "ready") { right.appendChild(el("p", "re-help", mazesState === "loading" ? "Loading the mazes…" : "No mazes came back. Is the archive reachable?")); return; }
            const list = el("div", "re-mazes");
            for (const m of mazes) {
                const a = V.roomFor(api.map(), m), row = el("div", "re-maze"), s = el("select"), l = el("select"), show = el("button", "btn", "Show"); show.type = "button";
                MAZE_SIZES().forEach(z => { const o = el("option", "", sizeName(z)); o.value = z; s.appendChild(o); }); if (!MAZE_SIZES().includes(a.size)) { const o = el("option", "", sizeName(a.size)); o.value = a.size; s.appendChild(o); }
                [0, 1, 2].forEach(i => { const o = el("option", "", "Layout " + (i + 1)); o.value = i; l.appendChild(o); });
                s.value = a.size; l.value = a.layout;
                const set = () => { before(); own().assign[m.slug] = { size: s.value, layout: Number(l.value), chosen: true }; commit(); };
                s.addEventListener("change", set); l.addEventListener("change", set);
                /* the maze's room, with its own pictures, on the stage (10 Nov scan, rooms 20) */
                show.addEventListener("click", () => { const b = V.roomFor(api.map(), m); size = b.size; n = b.layout; seeSel.value = m.slug; preview = V.mazeFacts(m); sel = null; carry = null; userZoom = null; pan = { x: 0, y: 0 }; sync(); });
                row.append(el("span", "", String(m.name).trim()), s, l, show); list.appendChild(row);
            }
            right.appendChild(list);
        }
        /* things in the layouts the rooms no longer draw (the retired plaques): not seen, so they can't be clicked away (10 Nov scan, rooms 18) */
        const strays = () => { const out = []; const L = V.layouts(api.map()); for (const s of Object.keys(L)) L[s].forEach((lay, k) => { for (const it of lay.items) if (!V.isWall(it) && !V.isRug(it) && !V.footprint(it)) out.push([s, k, it]); }); return out; };
        function checks() {
            issues.textContent = ""; const r = roomNow(), msgs = [];
            msgs.push(...problemsOf(V, r, size));
            for (const m of [...new Set(msgs)]) issues.appendChild(el("p", "", m));
            const st = V.indexOf && V.indexOf() ? strays() : [];
            if (st.length) {
                issues.appendChild(el("p", "", `${st.length} old thing${st.length === 1 ? "" : "s"} (${[...new Set(st.map(q => q[2].k))].join(", ")}) in the layouts that the rooms don't draw any more.`));
                const b = el("button", "btn", "Clear them out"); b.type = "button";
                b.addEventListener("click", () => { before(); const R = own(); for (const s of Object.keys(R.layouts)) for (const lay of R.layouts[s]) lay.items = lay.items.filter(it => V.isWall(it) || V.isRug(it) || V.footprint(it)); sel = null; commit(); panel(); });
                issues.appendChild(b);
            }
        }

        /* ---------- the view ---------- */
        const ctx = c.getContext("2d"), buf = document.createElement("canvas"), bx = buf.getContext("2d");
        let view = { x: 0, y: 0 }, queued = false;
        function paintSoon() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; paint(); }); }
        const placing = (r, p) => withTurns(heldAt({ ...tool, ...(placeZ ? { z: placeZ } : {}) }, p, r));
        function currentGhost(r) {
            if (drag && drag.kind === "new") return drag.item;
            if (carry) return mouse ? heldAt(carry.item, mouse, r) : null;
            if (tool && mouse && !drag) { if (V.isWall(tool) && !overWall(r, mouse)) return null; return placing(r, mouse); }
            return null;
        }
        const fitZoom = (W, H, s) => Math.max(1, Math.min(3, Math.floor(Math.min(W / s.w, H / s.h)) || 1));
        function paint() {
            if (!host) return;
            const r = roomNow(), s = V.sizeOf(r), W = stage.clientWidth, H = stage.clientHeight; if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
            buf.width = s.w; buf.height = s.h;
            const hidden = carry ? { ...r, items: r.items.filter(i => i !== carry.it) } : r;
            let hover = null; if (mouse && !tool && !carry && !drag) { const t = V.tileAt(r, mouse[0], mouse[1]); if (inRoom(r, t)) hover = t; }
            const g = currentGhost(r), ghost = g && (V.isWall(g) || V.isRug(g) || V.footprint(g)) ? { it: g, ok: fits(r, g, carry && carry.it) } : null;
            V.paintRoom(bx, hidden, { facts: preview, edges: ["x", "y"], hover, ghost, now: 0 });
            if (grid) { bx.save(); bx.strokeStyle = "rgba(255,255,255,.16)"; bx.lineWidth = 1; bx.beginPath(); for (let x = 0; x <= r.w; x++) { const a = V.scr(r, x, 0), b = V.scr(r, x, r.h); bx.moveTo(a[0] + .5, a[1] + .5); bx.lineTo(b[0] + .5, b[1] + .5); } for (let y = 0; y <= r.h; y++) { const a = V.scr(r, 0, y), b = V.scr(r, r.w, y); bx.moveTo(a[0] + .5, a[1] + .5); bx.lineTo(b[0] + .5, b[1] + .5); } bx.stroke(); bx.restore(); }
            ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
            zoom = userZoom || fitZoom(W, H, s);
            view = { x: Math.round((W - s.w * zoom) / 2) + pan.x, y: Math.round((H - s.h * zoom) / 2) + pan.y };
            ctx.drawImage(buf, view.x, view.y, s.w * zoom, s.h * zoom);
            drawSelection(r);
        }
        /* the selection, drawn last, over everything and unlit, as the hallway editor's drawSelection (10 Nov scan, rooms 2) */
        function drawSelection(r) {
            const it = sel; if (!it || (carry && carry.it === it) || layout().items.indexOf(it) < 0) return;
            const S = p => [view.x + p[0] * zoom, view.y + p[1] * zoom], white = "#ffffff", fill = "rgba(255,255,255,.22)";
            const quad = (x0, y0, x1, y1, z) => { const q = [V.scr(r, x0, y0, z), V.scr(r, x1, y0, z), V.scr(r, x1, y1, z), V.scr(r, x0, y1, z)].map(S); ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = white; ctx.lineWidth = 2; ctx.stroke(); };
            ctx.save();
            const hung = ["st_pipes", "st_duct", "st_vent", "st_ventx", "st_fan", "st_light_bulkhead", "st_light_pendant", "st_light_batten", "st_light_caged"].includes(it.k);      // the staff pieces up on the walls
            if (V.isWall(it) || hung) { const b = V.drawnBox(r, it); if (b) { const a = S([b[0] - 1, b[1] - 1]), e = S([b[0] + b[2] + 1, b[1] + b[3] + 1]); ctx.strokeStyle = "#4fd1ff"; ctx.lineWidth = 2; ctx.strokeRect(a[0], a[1], e[0] - a[0], e[1] - a[1]); } }
            else if (it.k === "rug") quad(it.x, it.y, it.x + it.w, it.y + it.h, 0);
            else if (it.k === "rugRound") { const m = S(V.scr(r, it.x + .5, it.y + .5)); ctx.beginPath(); ctx.ellipse(m[0], m[1], 53 * zoom, 27 * zoom, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = white; ctx.lineWidth = 2; ctx.stroke(); }
            else { const f = V.footprint(it); if (f) quad(f[0], f[1], f[0] + f[2], f[1] + f[3], it.z || 0); }
            ctx.restore();
        }
        const toPx = e => { const b = c.getBoundingClientRect(); return [(e.clientX - b.left - view.x) / zoom, (e.clientY - b.top - view.y) / zoom]; };
        /* zoom about a screen point (10 Nov scan, rooms 17) */
        function zoomTo(z, sx, sy) {
            const r = roomNow(), s = V.sizeOf(r), W = stage.clientWidth, H = stage.clientHeight; z = Math.max(1, Math.min(6, z)); if (z === zoom) return;
            if (sx === undefined) { sx = W / 2; sy = H / 2; }
            const px = (sx - view.x) / zoom, py = (sy - view.y) / zoom;
            userZoom = z; pan = { x: Math.round(sx - px * z - (W - s.w * z) / 2), y: Math.round(sy - py * z - (H - s.h * z) / 2) }; paintSoon();
        }
        c.addEventListener("wheel", e => { e.preventDefault(); const b = c.getBoundingClientRect(); zoomTo(zoom + (e.deltaY < 0 ? 1 : -1), e.clientX - b.left, e.clientY - b.top); }, { passive: false });

        /* ---------- Ctrl and the mouse: how high. Only what you're placing, carrying or dragging (10 Nov scan, rooms 3) ---------- */
        function ctrlMove(e) {
            if (!e.ctrlKey && !e.metaKey) { endLift(); ctrlY = null; ctrlSpare = 0; lockTile = null; ctrlArmed = false; return false; }
            const dragged = drag && drag.kind === "move" && !isDoor(drag.it) ? drag.it : null, held = carry && !isDoor(carry.item) ? carry.item : null, placing = tool && !drag && !V.isWall(tool);
            if (!dragged && !held && !placing) return false;
            if (ctrlY === null) { ctrlY = e.clientY; ctrlFrom = [e.clientX, e.clientY]; ctrlArmed = false; lockTile = mouse && !V.isWall((dragged || held || tool)) ? V.tileAt(roomNow(), mouse[0], mouse[1]) : null; return true; }
            if (!ctrlArmed) {
                const dx = Math.abs(e.clientX - ctrlFrom[0]), dy = Math.abs(e.clientY - ctrlFrom[1]);
                if (dx < 4 && dy < 4) return true;
                ctrlArmed = true; ctrlY = e.clientY;
            }
            /* the piece follows the mouse: a pixel of the room for each pixel moved on the screen */
            ctrlSpare += (ctrlY - e.clientY) / zoom; ctrlY = e.clientY;
            const steps = Math.trunc(ctrlSpare); if (!steps) return true;
            ctrlSpare -= steps;
            const it = dragged ? dragged : held;
            /* a window and a rug have no height: nothing to begin, so no empty undo step and no lost Redo (10 Nov scan b, rooms 7) */
            if (it && ((V.isWall(it) && it.k === "window") || V.isRug(it))) return true;
            if (dragged) beginDrag();
            let changedNow = false;
            if (it && V.isWall(it)) { const fromUp = held ? heldUpNow(it) : it.up || 0, to = clampUp(it, fromUp + steps); changedNow = to !== (it.up || 0); it.up = to; if (held) carry.upKept = it.up; say("Height on the wall: " + it.up); panelValues(); }
            else if (it) { const v = Math.max(0, Math.min(Z_MAX, (it.z || 0) + steps));
                /* not down onto something standing under it (10 Nov scan b, rooms 6) */
                if (!v && it.z && dragged && !fits(roomNow(), (({ z, ...o }) => o)(it), it)) { say("There's something under it, so it can't go down to the floor."); return true; }
                changedNow = v !== (it.z || 0); if (v) it.z = v; else delete it.z; say("Height: " + v); panelValues(); }
            else { placeZ = Math.max(0, Math.min(Z_MAX, placeZ + steps)); say("Height: " + placeZ); }
            if (dragged && changedNow) drag.moved = true;
            return true;
        }
        const heldUpNow = it => carry && carry.upKept !== undefined ? carry.upKept : it.up || 0;
        const endLift = () => { };

        /* ---------- the mouse ---------- */
        c.addEventListener("contextmenu", e => e.preventDefault());
        function place(it) {
            const r = roomNow(); if (!fits(r, it)) { say("There isn't room for that here."); paintSoon(); return; }
            if (it.k === "rug" && (it.w < 2 || it.h < 2)) { say("Rugs need to be at least 2 tiles each way."); paintSoon(); return; }
            if (it.k === "frame") { const used = new Set(r.items.filter(q => q.k === "frame").map(q => q.slot)); let k = 0; while (used.has(k)) k++; it.slot = k; }
            editing(L => { if (V.isRug(it)) L.items.unshift(it); else L.items.push(it); }); if (!placeZ) say("");
        }
        const turnPlacing = () => { if (!turnHeld()) return; };
        c.addEventListener("pointerdown", e => {
            c.focus({ preventScroll: true }); shiftAlone = false;
            /* right or middle: move the view */
            if (e.button === 1 || e.button === 2) { e.preventDefault(); panning = { x: e.clientX, y: e.clientY, pan: { ...pan } }; try { c.setPointerCapture(e.pointerId); } catch (err) { /* nothing */ } c.style.cursor = "grabbing"; return; }
            if (e.button !== 0) return; e.preventDefault();
            try { c.setPointerCapture(e.pointerId); } catch (err) { /* nothing to capture */ }
            const r = roomNow(), p = toPx(e), t = V.tileAt(r, p[0], p[1]); if (!lockTile) mouse = p;
            const ctl = e.ctrlKey || e.metaKey;
            /* carrying: Shift-click turns it, Ctrl-click throws it away, a click puts it down (10 Nov scan, rooms 14) */
            if (carry) {
                if (e.shiftKey) { turnPlacing(); return; }
                if (ctl && !ctrlArmed) { sel = carry.it; carry = null; lockTile = null; removeSel(); say("Thrown away. Ctrl+Z brings it back."); paintSoon(); return; }
                const q = heldAt(carry.item, mouse || p, r); if (!fits(r, q, carry.it)) { say("There isn't room for that here."); return; }
                sel = carry.it; carry = null; lockTile = null; editing(() => applyTo(sel, q)); say(""); panel(); return;
            }
            if (tool) {
                /* Shift-click while placing turns it, and places nothing (10 Nov scan, rooms 5) */
                if (e.shiftKey) { turnPlacing(); return; }
                const it = placing(r, mouse || p);
                if (V.isWall(it) && !overWall(r, mouse || p)) { say("Point at a wall to hang it there."); return; }
                if (!V.isWall(it) && (lengthwise(it) || it.k === "rug") && !lockTile) { if (!inRoom(r, t)) return; drag = { kind: "new", a: t, base: it, item: it.k === "rug" ? { ...it, x: t[0], y: t[1] } : { ...it, x: t[0], y: t[1] } }; paintSoon(); return; }
                place(it); return;
            }
            const it = V.itemAt(r, p[0], p[1]);
            /* an arrow, the way in and out: drag it along its edge. Only on the arrow's own shape, so a rug under it can still be picked (10 Nov scan, rooms 21) */
            if (!e.altKey && !ctl) for (const edge of ["x", "y"]) if (V.arrowTiles(r, edge).some(q => q[0] === t[0] && q[1] === t[1]) && (!it || V.onArrow(r, edge, p[0], p[1]))) { drag = { kind: "arrow", edge, began: false, moved: false }; say("Drag along the edge to move the way in and out."); paintSoon(); return; }
            if (e.shiftKey && it) { turnThing(it); return; }
            if (e.altKey && it) { sel = it; carry = { it, item: { ...it } }; say("Carrying. Click to put it down, Esc to cancel."); panel(); paintSoon(); return; }
            sel = it; panel(); paintSoon();
            if (it) {
                drag = { kind: "move", it, moved: false, began: false, from: t, x0: it.x, y0: it.y, ctrlAtStart: ctl, at: p };
                if (V.isWall(it)) { const cc = it.wall === "l" ? V.scr(r, 0, it.at) : V.scr(r, it.at, 0), o = V.scr(r, 0, 0), up = it.k === "frame" ? (it.up || 0) + it.h / 2 : it.k === "window" ? 58 : it.up || 0; drag.grip = [p[0] - cc[0], p[1] - (o[1] + it.at * 8 - up)]; }
            }
        });
        /* the first real change of a drag: a step of undo, and the map's own copy to change */
        const beginDrag = () => { if (drag.began) return; drag.began = true; const idx = layout().items.indexOf(drag.it); before(); own(); drag.it = layout().items[idx]; sel = drag.it; };
        function cursorFor(r, p) {
            if (drag) return drag.kind === "arrow" ? "ew-resize" : drag.kind === "move" ? "move" : "crosshair";
            if (tool || carry) return "crosshair";
            const it = V.itemAt(r, p[0], p[1]), t = V.tileAt(r, p[0], p[1]);
            if (["x", "y"].some(edge => V.arrowTiles(r, edge).some(q => q[0] === t[0] && q[1] === t[1]) && (!it || V.onArrow(r, edge, p[0], p[1])))) return "ew-resize";
            return it ? "move" : "default";
        }
        /* the status line: the tile, and what's under the mouse (10 Nov scan, rooms 16) */
        function statusFor(r, p) {
            const t = V.tileAt(r, p[0], p[1]); stWhere.textContent = inRoom(r, t) ? "Tile " + t[0] + ", " + t[1] : overWall(r, p) ? (V.scr(r, 0, 0)[0] > p[0] ? "Left wall" : "Right wall") : "";
            const it = carry ? carry.item : tool ? tool : drag && drag.kind === "move" ? drag.it : V.itemAt(r, p[0], p[1]);
            stWhat.textContent = it ? (carry ? "Carrying: " : tool ? "Placing: " : "") + nameOf(it) + (it.z ? ", raised " + it.z : "") : "";
        }
        c.addEventListener("pointermove", e => {
            if (panning) { pan = { x: panning.pan.x + e.clientX - panning.x, y: panning.pan.y + e.clientY - panning.y }; paintSoon(); return; }
            const r = roomNow(), p = toPx(e), t = V.tileAt(r, p[0], p[1]);
            const ctrl = ctrlMove(e);
            if (!ctrl) mouse = p;
            statusFor(r, p); c.style.cursor = cursorFor(r, p);
            if (drag && drag.kind === "arrow") { const along = drag.edge === "y" ? t[0] : t[1], len = drag.edge === "y" ? r.w : r.h, a = Math.max(0, Math.min(len - 2, along)), now = (layout().exitAt || {})[drag.edge];
                if (a !== (Number.isInteger(now) ? now : (len >> 1) - 1)) { const ts = drag.edge === "y" ? [[a, r.h - 1], [a + 1, r.h - 1], [a, r.h - 2], [a + 1, r.h - 2]] : [[r.w - 1, a], [r.w - 1, a + 1], [r.w - 2, a], [r.w - 2, a + 1]], solid = V.solidSet(r);
                    if (!ts.some(q => solid.has(q[0] + "," + q[1]))) { if (!drag.began) { drag.began = true; before(); own(); } const L = layout(); L.exitAt = { ...(L.exitAt || {}), [drag.edge]: a }; drag.moved = true; } }
                paintSoon(); return; }
            if (drag && drag.kind === "new") {
                const b = [Math.max(0, Math.min(r.w - 1, t[0])), Math.max(0, Math.min(r.h - 1, t[1]))];
                if (drag.base.k === "rug") drag.item = b[0] === drag.a[0] && b[1] === drag.a[1] && !drag.stretched ? { ...drag.base, x: drag.a[0], y: drag.a[1] } : (drag.stretched = true, rugFrom(drag.base, drag.a, b));
                else drag.item = runFrom(drag.base, drag.a, t);
            }
            else if (drag && !ctrl) {
                if (V.isWall(drag.it)) { if (!drag.moved && Math.hypot(p[0] - drag.at[0], p[1] - drag.at[1]) * zoom < 4) { paintSoon(); return; } beginDrag(); hang(drag.it, wallPoint(r, p[0] - drag.grip[0], p[1] - drag.grip[1])); drag.moved = true; panelValues(); }
                else if (t[0] !== drag.from[0] || t[1] !== drag.from[1]) {
                    const it = drag.it, q = { ...it, x: drag.x0 + t[0] - drag.from[0], y: drag.y0 + t[1] - drag.from[1] };
                    /* a step of undo only once it has really moved (10 Nov scan, rooms 9) */
                    if (fits(r, q, it)) { beginDrag(); drag.it.x = q.x; drag.it.y = q.y; drag.moved = true; }
                }
            }
            paintSoon();
        });
        c.addEventListener("pointermove", e => { if (!drag) return; if (drag.px0 === undefined) { drag.px0 = e.clientX; drag.py0 = e.clientY; } else if (Math.abs(e.clientX - drag.px0) + Math.abs(e.clientY - drag.py0) > 4) drag.far = true; });
        c.addEventListener("pointerup", e => {
            if (panning) { panning = null; c.style.cursor = "default"; return; }
            if (!drag) return; const d = drag; drag = null; ctrlY = null; ctrlSpare = 0; lockTile = null;
            if (d.kind === "arrow") { if (d.moved) commit(); say(""); return; }
            if (d.kind === "new") { place(d.item); return; }
            if (d.moved) { commit(); panel(); say(""); return; }
            if (d.began && api.unsnapshot) api.unsnapshot();      // begun, but nothing changed: no empty step left behind
            /* Ctrl-click, no movement: delete it, as in the hallway */
            if (d.ctrlAtStart && (e.ctrlKey || e.metaKey) && !d.far) { sel = d.it; removeSel(); }      // only a click: a Ctrl-drag that raised nothing deleted it (10 Nov scan b, rooms 3)
            syncUndo();
        });
        c.addEventListener("pointerleave", () => { if (!drag && !carry) { mouse = null; stWhere.textContent = ""; stWhat.textContent = ""; paintSoon(); } });

        /* ---------- keys. This window has them all: the hallway's editor underneath mustn't act on them ---------- */
        /* (the boxes in the panels get theirs: nothing here but keeping them from the hallway's editor) */
        function turnHeld() {
            if (carry) { if (V.isWall(carry.item)) return true; const q = turned(carry.item); if (!q) say("This one looks the same from every side."); else carry.item = q; paintSoon(); return true; }
            if (tool && !drag) { const t = turnCount(tool); if (t < 2) say("This one looks the same from every side."); else placeTurn = (placeTurn + 1) % t; paintSoon(); return true; }
            return false;
        }
        /* a box needs its own keys, so they can't be stopped on their way down to it: they're stopped on their way back up, before the hallway's editor hears them */
        const keepFromEditor = e => { const t = e.target; const stop = ev => { ev.stopPropagation(); t.removeEventListener(ev.type, stop); }; t.addEventListener(e.type, stop); };
        const keys = e => {
            if (!host) return; const typing = e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
            const k = e.key, ctl = e.ctrlKey || e.metaKey;
            if (ctl && (k === "s" || k === "S")) { e.preventDefault(); e.stopPropagation(); saveNow(); return; }      // never the browser's Save page (10 Nov scan, rooms 7)
            if (typing) { keepFromEditor(e); return; }
            e.stopPropagation();
            /* Shift turns when let go on its own, as in the hallway: not on its way to a capital or a Shift-click (10 Nov scan, rooms 5) */
            if (k === "Shift") { if (!e.repeat) shiftAlone = true; return; }
            shiftAlone = false;
            if (k === "Alt") { e.preventDefault(); return; }
            if (k === " " ) { e.preventDefault(); return; }
            if (ctl && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
            if (ctl && (k === "y" || k === "Y")) { e.preventDefault(); doRedo(); return; }
            if (ctl) return;
            if ((k === "Delete" || k === "Backspace") && sel) { e.preventDefault(); removeSel(); return; }
            if (k === "r" || k === "R") { if (e.repeat) return; e.preventDefault(); if (turnHeld()) return; if (sel) turnThing(sel); return; }
            if (k === "g" || k === "G") { grid = !grid; say(grid ? "Tiles shown." : ""); paintSoon(); return; }
            if (k === "+" || k === "=") { e.preventDefault(); zoomTo(zoom + 1); return; }
            if (k === "-" || k === "_") { e.preventDefault(); zoomTo(zoom - 1); return; }
            if (k === "0") { userZoom = null; pan = { x: 0, y: 0 }; paintSoon(); return; }
            if (k.startsWith("Arrow") && sel && !V.isWall(sel)) {
                e.preventDefault(); const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k], q = { ...sel, x: sel.x + d[0], y: sel.y + d[1] };
                if (fits(roomNow(), q, sel)) editing(() => { sel.x = q.x; sel.y = q.y; }); return;
            }
            /* Esc steps back, carry to tool to selection, and never shuts the window: Done does (10 Nov scan, rooms 12) */
            if (k === "Escape") { if (carry) { carry = null; lockTile = null; say(""); paintSoon(); } else if (tool) pick(null); else if (sel) { sel = null; panel(); paintSoon(); } }
        };
        const keysUp = e => {
            if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { keepFromEditor(e); return; }
            e.stopPropagation(); if (e.key === " " || e.key === "Alt") e.preventDefault();
            if (e.key === "Shift") { const was = shiftAlone; shiftAlone = false; if (was) turnHeld(); }
            if (e.key === "Control" || e.key === "Meta") { endLift(); ctrlY = null; ctrlSpare = 0; lockTile = null; ctrlArmed = false;      // (10 Nov scan b, rooms 15)
                if (!carry && !tool) say(""); if (sel) panel(); paintSoon(); }
        };
        addEventListener("keydown", keys, true); addEventListener("keyup", keysUp, true); addEventListener("resize", paintSoon);

        function sync() {
            keep();
            sizeSel.value = size; floorSel.value = layout().floor; wallSel.value = layout().walls || ""; numBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === n)));
            selectB.setAttribute("aria-pressed", String(!tool)); toolBtns.forEach(([b, it]) => b.setAttribute("aria-pressed", String(tool === it)));
            tabLayout.setAttribute("aria-pressed", String(tab === "layout")); tabMazes.setAttribute("aria-pressed", String(tab === "mazes"));
            panel(); checks(); syncUndo(); paintSoon();
        }
        V.onArt = paintSoon;
        say(""); syncUndo();
        V.load().then(() => { buildPalette(); sync(); return V.mazes(); }).then(list => {
            mazes = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name))); mazesState = mazes.length ? "ready" : "failed";
            for (const m of mazes) { const o = el("option", "", String(m.name).trim()); o.value = m.slug; seeSel.appendChild(o); }
            if (tab === "mazes") panel();
        });
        window.__rooms = { get sel() { return sel; }, get tool() { return tool; }, layout, get carry() { return carry; }, get placeZ() { return placeZ; }, get view() { return view; }, get zoom() { return zoom; }, roomNow, pick, GROUPS, get size() { return size; }, get n() { return n; } };
    }
    window.RoomsEditor = { open, allProblems };
})();

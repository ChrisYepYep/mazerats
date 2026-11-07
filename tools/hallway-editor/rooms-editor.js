/* The rooms' own editor: three layouts for each room size, and which maze has which. A maze with nothing chosen for it gets
   its size from how many pictures it has and one of that size's three by chance, the same one every visit.
   Opened from the Rooms button in the hallway editor, here and in the Warren. The hands are the hallway's:
     click to place, with a ghost first; drag sofas, tables, planters, bookcases and rugs out to length
     Shift or R turns what you're placing or carrying; Shift-click turns anything placed
     Alt-click carries a piece; Ctrl-click deletes it; drag moves it; arrow keys nudge it
     hold Ctrl and move the mouse: the height of what you're placing, carrying or dragging (Ctrl-drag for one already placed) */
(function () {
    "use strict";
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const SIZES = () => Object.keys(window.RoomStarter.layouts);
    const R_ = "art/rooms/", H_ = "art/hall/hh_room_hallway/", T_ = "art/thumbs/";
    const hall = (p, extra) => ({ k: "hall", p, ...(extra || {}) });
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
        ["On the walls", [
            ["Maze's picture", { k: "frame", w: 34, h: 26, up: 34, slot: 0 }, null], ["Window", { k: "window" }, R_ + "window-r.png"], ["Wall light", { k: "sconce", up: 70 }, "art/sconce-x.png"], ["Globe wall light", { k: "sconce", style: "globe", up: 70 }, "art/sconce-globe-x.png"],
            ...(window.WALL_ITEMS || []).filter(i => !i.tell).map(i => [i.name, { k: "painting", id: i.id, up: 62 }, "art/wall/" + i.x.layers[0].f])
        ]]
    ];
    const Z_MAX = 120;
    let host = null;
    function open(api) {
        if (host) return;
        const V = window.RoomView, P = window.FurniParts;
        host = el("div", "re-host"); document.body.appendChild(host);
        const bar = el("div", "re-bar"), left = el("div", "re-left"), right = el("div", "re-right"), stage = el("div", "re-stage"), c = el("canvas"), tip = el("div", "re-tip"); stage.append(c, tip);
        host.append(bar, left, stage, right);
        let size = SIZES()[0], n = 0, tool = null, sel = null, zoom = 2, preview = null, mazes = [], undo = [], redo = [], tab = "layout";
        let mouse = null, placeZ = 0, placeTurn = 0, carry = null, drag = null, ctrlY = null, ctrlSpare = 0, lockTile = null, lifting = false, heightBox = null, ctrlFrom = null, ctrlArmed = false;

        const own = () => { const m = api.map(); if (!m.rooms) m.rooms = {}; if (!m.rooms.layouts) m.rooms.layouts = JSON.parse(JSON.stringify(window.RoomStarter.layouts)); if (!m.rooms.assign) m.rooms.assign = {}; return m.rooms; };
        const layout = () => V.layouts(api.map())[size][n];
        const roomNow = () => { const [w, h] = size.split("x").map(Number), L = layout(); return { w, h, floor: L.floor, items: L.items }; };
        const commit = () => { api.changed(); paintSoon(); checks(); };
        const before = () => { undo.push(JSON.stringify(api.map().rooms || null)); if (undo.length > 60) undo.shift(); redo = []; if (api.snapshot) api.snapshot(); };
        /* the same item, in the map's own copy, after own() has cloned the starter */
        const editing = fn => { const L0 = layout(), idx = sel ? L0.items.indexOf(sel) : -1; before(); own(); const L = layout(); if (idx >= 0) sel = L.items[idx]; fn(L); commit(); };
        const editingNoCommit = () => { const L0 = layout(), idx = sel ? L0.items.indexOf(sel) : -1; before(); own(); if (idx >= 0) sel = layout().items[idx]; };
        const restore = t => { const m = api.map(); if (t === "null") delete m.rooms; else m.rooms = JSON.parse(t); sel = null; carry = null; drag = null; api.changed(); sync(); };
        const say = t => { tip.textContent = t || ""; tip.hidden = !t; };

        /* ---------- top bar ---------- */
        const sizeSel = el("select"); SIZES().forEach(s => { const o = el("option", "", s.replace("x", " x ")); o.value = s; sizeSel.appendChild(o); });
        const nums = el("div", "re-nums"), floorSel = el("select"); [["slate", "Grey squares"], ["wood", "Wood"]].forEach(([v, t]) => { const o = el("option", "", t); o.value = v; floorSel.appendChild(o); });
        const seeSel = el("select"), tabLayout = el("button", "btn", "Layouts"), tabMazes = el("button", "btn", "Which maze has which"), done = el("button", "btn primary", "Done"), undoB = el("button", "btn", "Undo");
        [tabLayout, tabMazes, done, undoB].forEach(b => { b.type = "button"; });
        const lab = (t, e) => { const l = el("label", "re-lab"); l.append(el("span", "", t), e); return l; };
        bar.append(el("strong", "", "Rooms"), tabLayout, tabMazes, lab("Size", sizeSel), lab("Layout", nums), lab("Floor", floorSel), lab("Show with", seeSel), undoB, el("span", "re-spacer"), done);
        const numBtns = [0, 1, 2].map(i => { const b = el("button", "re-num", String(i + 1)); b.type = "button"; b.addEventListener("click", () => { n = i; sel = null; carry = null; lockTile = null; sync(); }); nums.appendChild(b); return b; });
        sizeSel.addEventListener("change", () => { size = sizeSel.value; sel = null; carry = null; lockTile = null; sync(); });
        floorSel.addEventListener("change", () => editing(L => { L.floor = floorSel.value; }));
        seeSel.addEventListener("change", () => { const m = mazes.find(q => q.slug === seeSel.value); preview = m ? V.mazeFacts(m) : null; paintSoon(); });
        const doUndo = () => { if (!undo.length) return; redo.push(JSON.stringify(api.map().rooms || null)); restore(undo.pop()); };
        const doRedo = () => { if (!redo.length) return; undo.push(JSON.stringify(api.map().rooms || null)); restore(redo.pop()); };
        undoB.addEventListener("click", doUndo);
        tabLayout.addEventListener("click", () => { tab = "layout"; sync(); }); tabMazes.addEventListener("click", () => { tab = "mazes"; sync(); });
        const close = () => { endLift(); if (drag && drag.moved) commit(); drag = null; removeEventListener("keydown", keys, true); removeEventListener("keyup", keysUp, true); removeEventListener("resize", paintSoon); V.onArt = null; host.remove(); host = null; };
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
        const help = el("p", "re-help", "Click to place, or drag out sofas, planters, bookcases and rugs. Shift or R turns. Hold Ctrl and move the mouse up or down to raise or lower what's selected, held or being placed. Alt-click carries, Ctrl-click deletes, arrows nudge."); left.appendChild(help);
        const issues = el("div", "re-issues"); left.appendChild(issues);

        /* ---------- turning ---------- */
        const CHAIR_ROT = [["chair4", false], ["chair6", false], ["chair4", true], ["chair6", true]];
        function turned(it) {
            const q = { ...it };
            if (q.k === "hall") { const t = P.turns(q.p); if (t < 2) return null; q.rot = (P.rotOf({ k: q.p, rot: q.rot }) + 1) % t; return q; }
            if (q.k === "shelf") { q.axis = q.axis === "x" ? "y" : "x"; return q; }
            if (q.k === "rug") { const w = q.w; q.w = q.h; q.h = w; return q; }
            if (q.k === "chair4" || q.k === "chair6") { const i = CHAIR_ROT.findIndex(c => c[0] === q.k && c[1] === !!q.flip), nx = CHAIR_ROT[(i + 1) % 4]; q.k = nx[0]; q.flip = nx[1]; if (!q.flip) delete q.flip; return q; }
            if (V.isWall(q)) { q.wall = q.wall === "l" ? "r" : "l"; const r = roomNow(), len = q.wall === "l" ? r.h : r.w; if (q.at !== undefined) q.at = Math.min(len - .5, q.at); return q; }
            if (q.k === "rugRound" || q.k === "lamp") return null;
            q.flip = !q.flip; if (!q.flip) delete q.flip; return q;
        }
        const turnCount = q => q.k === "hall" ? P.turns(q.p) : q.k === "chair4" ? 4 : (q.k === "rugRound" || q.k === "lamp" || V.isWall(q)) ? 1 : 2;
        const withTurns = q => { if (V.isWall(q)) return q; let o = q; for (let i = 0; i < placeTurn; i++) o = turned(o) || o; return o; };
        const applyTo = (it, q) => { for (const k of Object.keys(it)) delete it[k]; Object.assign(it, q); };

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
        const clampUp = (it, up) => { const lo = it.k === "frame" ? 6 : 16, hi = it.k === "frame" ? 90 : 96; return Math.max(lo, Math.min(hi, up)); };
        const hang = (it, w) => { it.wall = w.wall; it.at = w.at; if (it.k !== "window") it.up = clampUp(it, it.k === "frame" ? w.up - it.h / 2 : w.up); };
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

        /* ---------- the selected panel ---------- */
        function nameOf(it) { for (const [, list] of GROUPS) for (const x of list) { const t = x[1]; if (t.k === it.k && t.p === it.p && t.id === it.id && (t.style || "") === (it.style || "")) return x[0]; } return it.k === "chair6" ? "Oak chair" : "Thing"; }
        function panel() {
            right.textContent = "";
            if (tab === "mazes") return mazesPanel();
            if (!sel) { right.appendChild(el("p", "re-help", tool ? "Placing: " + nameOf(tool) + "." : "Nothing selected. Click anything in the room.")); return; }
            right.appendChild(el("h3", "", nameOf(sel)));
            const num = (label, key, min, max, step, fallback) => {
                const row = el("label", "re-lab"), i = el("input"); i.type = "text"; i.inputMode = "numeric"; i.autocomplete = "off"; i.value = sel[key] === undefined ? fallback : sel[key]; let begun = false;
                const apply = () => { if (i.value.trim() === "" || !Number.isFinite(Number(i.value))) return; const v = Math.max(min, Math.min(max, Math.round(Number(i.value)))); if (!V.isWall(sel) && (key === "n" || key === "len" || key === "w" || key === "h") && !fits(roomNow(), { ...sel, [key]: v }, sel)) { say("There isn't room for that here."); return; } say(""); if (!begun) { begun = true; editingNoCommit(); } if (key === "z" && !v) delete sel.z; else sel[key] = v; api.changed(); paintSoon(); };
                i.addEventListener("input", apply);
                i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); i.blur(); } if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); i.value = Math.max(min, Math.min(max, (Number(i.value) || 0) + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : step || 1))); apply(); } });
                i.addEventListener("blur", () => { begun = false; i.value = sel && sel[key] !== undefined ? sel[key] : fallback === undefined ? "" : fallback; checks(); });
                row.append(el("span", "", label), i); right.appendChild(row); if (key === "z") heightBox = i;
            };
            heightBox = null;
            if (sel.k === "shelf") num("Length", "n", 2, 16);
            if (sel.k === "hall" && P.ROWS[sel.p]) num("Length", "len", P.ROWS[sel.p].min, 16, 1, P.lengthOf({ k: sel.p, len: sel.len }));
            if (sel.k === "rug") { num("Across", "w", 1, 16); num("Down", "h", 1, 16); }
            if (sel.k === "frame") { num("Width", "w", 16, 72, 2); num("Height", "h", 12, 56, 2); num("Height on the wall", "up", 6, 90, 1); num("Which picture (0 entrance, 1 finish, then the gallery)", "slot", 0, 40); }
            if (sel.k === "painting" || sel.k === "sconce") num("Height on the wall", "up", 16, 96, 1);
            if (!V.isWall(sel) && !V.isRug(sel)) num("Height off the floor", "z", 0, Z_MAX, 1, 0);
            const row = el("div", "re-actions"), t = el("button", "btn", "Turn"), del = el("button", "btn", "Remove"); t.type = del.type = "button"; t.addEventListener("click", () => turnThing(sel)); del.addEventListener("click", removeSel); row.append(t, del); right.appendChild(row);
        }
        const removeSel = () => { if (!sel) return; if (carry && carry.it === sel) { carry = null; lockTile = null; } if (layout().items.indexOf(sel) < 0) { sel = null; panel(); return; } editing(L => { L.items.splice(L.items.indexOf(sel), 1); }); sel = null; panel(); };
        function turnThing(it) {
            const q = turned(it); if (!q) { say("This one looks the same from every side."); return; }
            if (!fits(roomNow(), q, it)) { say("There isn't room to turn it there."); return; }
            sel = it; editing(() => applyTo(sel, q)); say(""); panel();
        }
        function mazesPanel() {
            right.appendChild(el("h3", "", "Which maze has which"));
            right.appendChild(el("p", "re-help", "Size goes by how many pictures a maze has, and the layout by chance, until you choose."));
            const again = el("button", "btn", "Deal every layout again"); again.type = "button"; again.addEventListener("click", () => { before(); const R = own(); for (const m of mazes) { const a = V.roomFor(api.map(), m); R.assign[m.slug] = { size: (R.assign[m.slug] && R.assign[m.slug].size) || a.size, layout: Math.floor(Math.random() * 3) }; } commit(); panel(); }); right.appendChild(again);
            const list = el("div", "re-mazes");
            for (const m of mazes) {
                const a = V.roomFor(api.map(), m), row = el("div", "re-maze"), s = el("select"), l = el("select");
                SIZES().forEach(z => { const o = el("option", "", z); o.value = z; s.appendChild(o); }); [0, 1, 2].forEach(i => { const o = el("option", "", "Layout " + (i + 1)); o.value = i; l.appendChild(o); });
                s.value = a.size; l.value = a.layout;
                const set = () => { before(); own().assign[m.slug] = { size: s.value, layout: Number(l.value) }; commit(); };
                s.addEventListener("change", set); l.addEventListener("change", set);
                row.append(el("span", "", String(m.name).trim()), s, l); list.appendChild(row);
            }
            right.appendChild(list);
        }
        function checks() {
            issues.textContent = ""; const r = roomNow(), solid = V.solidSet(r), msgs = [];
            for (const e of ["x", "y"]) for (const t of V.arrowTiles(r, e)) if (solid.has(t[0] + "," + t[1])) msgs.push("Something stands on a way in.");
            if (!r.items.some(i => i.k === "ledger")) msgs.push("No ledger, so nowhere to read about the maze.");
            if (!r.items.some(i => i.k === "album")) msgs.push("No album, so the pictures can't all be seen.");
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
            for (const m of [...new Set(msgs)]) issues.appendChild(el("p", "", m));
        }

        /* ---------- the view ---------- */
        const ctx = c.getContext("2d"), buf = document.createElement("canvas"), bx = buf.getContext("2d");
        let view = { x: 0, y: 0 }, queued = false;
        function paintSoon() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; paint(); }); }
        const placing = (r, p) => withTurns(heldAt({ ...tool, ...(placeZ ? { z: placeZ } : {}) }, p, r));
        function currentGhost(r) {
            if (drag && drag.kind === "new") return drag.item;
            if (carry) return mouse ? heldAt(carry.item, mouse, r) : null;
            if (tool && mouse && !drag) return placing(r, mouse);
            return null;
        }
        function paint() {
            if (!host) return;
            const r = roomNow(), s = V.sizeOf(r), W = stage.clientWidth, H = stage.clientHeight; if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
            buf.width = s.w; buf.height = s.h;
            const hidden = carry ? { ...r, items: r.items.filter(i => i !== carry.it) } : r;
            let hover = null; if (mouse && !tool && !carry && !drag) { const t = V.tileAt(r, mouse[0], mouse[1]); if (inRoom(r, t)) hover = t; }
            V.paintRoom(bx, hidden, { facts: preview, edges: ["x", "y"], hover, selected: sel, now: 0 });
            const g = currentGhost(r); if (g && (V.isWall(g) || V.isRug(g) || V.footprint(g))) V.ghost(bx, r, g, fits(r, g, carry && carry.it));
            ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
            zoom = Math.max(1, Math.min(3, Math.floor(Math.min(W / s.w, H / s.h)) || 1));
            view = { x: Math.round((W - s.w * zoom) / 2), y: Math.round((H - s.h * zoom) / 2) };
            ctx.drawImage(buf, view.x, view.y, s.w * zoom, s.h * zoom);
        }
        const toPx = e => { const b = c.getBoundingClientRect(); return [(e.clientX - b.left - view.x) / zoom, (e.clientY - b.top - view.y) / zoom]; };

        /* ---------- Ctrl and the mouse: how high. The piece stays on its tile while you do ---------- */
        function ctrlMove(e) {
            if (!e.ctrlKey && !e.metaKey) { endLift(); ctrlY = null; ctrlSpare = 0; lockTile = null; return false; }
            const dragged = drag && drag.kind === "move" ? drag.it : null, held = carry ? carry.item : null, placing = tool && !drag && !V.isWall(tool), selected = !dragged && !held && !placing && !drag && sel && !V.isRug(sel) ? sel : null;
            if (!dragged && !held && !placing && !selected) return false;
            if (ctrlY === null) { ctrlY = e.clientY; ctrlFrom = [e.clientX, e.clientY]; ctrlArmed = false; lockTile = mouse ? V.tileAt(roomNow(), mouse[0], mouse[1]) : null; return true; }
            if (!ctrlArmed) {
                const dx = Math.abs(e.clientX - ctrlFrom[0]), dy = Math.abs(e.clientY - ctrlFrom[1]);
                if (dx < 4 && dy < 4) return true;
                if (dx > dy && selected) { ctrlFrom = [e.clientX, e.clientY]; ctrlY = e.clientY; return false; }       // heading across, perhaps to Ctrl-click something else
                ctrlArmed = true; ctrlY = e.clientY;
            }
            /* the piece follows the mouse: a pixel of the room for each pixel moved on the screen */
            ctrlSpare += (ctrlY - e.clientY) / zoom; ctrlY = e.clientY;
            const steps = Math.trunc(ctrlSpare); if (!steps) return true;
            ctrlSpare -= steps;
            if (selected && !lifting) { lifting = true; editingNoCommit(); }
            const it = dragged || held || (selected ? sel : null);
            if (it && V.isWall(it)) { if (it.k !== "window") { const fromUp = held ? heldUpNow(it) : it.up || 0; it.up = clampUp(it, fromUp + steps); if (held) carry.upKept = it.up; say("Height on the wall: " + it.up); showHeight(it.up); } }
            else if (it) { if (V.isRug(it)) return true; const v = Math.max(0, Math.min(Z_MAX, (it.z || 0) + steps)); if (v) it.z = v; else delete it.z; say("Height: " + v); showHeight(v); }
            else { placeZ = Math.max(0, Math.min(Z_MAX, placeZ + steps)); say("Height: " + placeZ); }
            if (dragged) drag.moved = true;
            return true;
        }
        const heldUpNow = it => carry && carry.upKept !== undefined ? carry.upKept : it.up || 0;
        const showHeight = v => { if (heightBox && document.activeElement !== heightBox) heightBox.value = v; };
        const endLift = () => { if (!lifting) return; lifting = false; say(""); commit(); panel(); };

        /* ---------- the mouse ---------- */
        c.addEventListener("contextmenu", e => e.preventDefault());
        function place(it) {
            const r = roomNow(); if (!fits(r, it)) { say("There isn't room for that here."); paintSoon(); return; }
            if (it.k === "frame") { const used = new Set(r.items.filter(q => q.k === "frame").map(q => q.slot)); let n = 0; while (used.has(n)) n++; it.slot = n; }
            editing(L => { if (V.isRug(it)) L.items.unshift(it); else L.items.push(it); }); if (!placeZ) say("");
        }
        c.addEventListener("pointerdown", e => {
            if (e.button !== 0) return; e.preventDefault();
            try { c.setPointerCapture(e.pointerId); } catch (err) { /* nothing to capture */ }
            const r = roomNow(), p = toPx(e), t = V.tileAt(r, p[0], p[1]); if (!lockTile) mouse = p;
            /* carrying: this click puts it down */
            if (carry) {
                const q = heldAt(carry.item, mouse || p, r); if (!fits(r, q, carry.it)) { say("There isn't room for that here."); return; }
                sel = carry.it; carry = null; lockTile = null; editing(() => applyTo(sel, q)); say(""); panel(); return;
            }
            if (tool) {
                const it = placing(r, mouse || p);
                if (!V.isWall(it) && (lengthwise(it) || it.k === "rug") && !lockTile) { if (!inRoom(r, t)) return; drag = { kind: "new", a: t, base: it, item: it.k === "rug" ? rugFrom(it, t, t) : { ...it, x: t[0], y: t[1] } }; paintSoon(); return; }
                place(it); return;
            }
            const it = V.itemAt(r, p[0], p[1]);
            if (e.shiftKey && it) { turnThing(it); return; }
            if (e.altKey && it) { sel = it; carry = { it, item: { ...it } }; say("Carrying. Click to put it down, Esc to cancel."); panel(); paintSoon(); return; }
            sel = it; panel(); paintSoon();
            if (it) {
                drag = { kind: "move", it, moved: false, began: false, from: t, x0: it.x, y0: it.y, ctrlAtStart: e.ctrlKey || e.metaKey, at: p };
                if (V.isWall(it)) { const c = it.wall === "l" ? V.scr(r, 0, it.at) : V.scr(r, it.at, 0), o = V.scr(r, 0, 0), up = it.k === "frame" ? (it.up || 0) + it.h / 2 : it.k === "window" ? 58 : it.up || 0; drag.grip = [p[0] - c[0], p[1] - (o[1] + it.at * 8 - up)]; }
            }
        });
        /* the first real change of a drag: a step of undo, and the map's own copy to change */
        const beginDrag = () => { if (drag.began) return; drag.began = true; const idx = layout().items.indexOf(drag.it); before(); own(); drag.it = layout().items[idx]; sel = drag.it; };
        c.addEventListener("pointermove", e => {
            const r = roomNow(), p = toPx(e), t = V.tileAt(r, p[0], p[1]);
            if ((e.ctrlKey || e.metaKey) && drag && drag.kind === "move") beginDrag();
            const ctrl = ctrlMove(e);
            if (!ctrl) mouse = p;
            if (drag && drag.kind === "new") { drag.item = drag.base.k === "rug" ? rugFrom(drag.base, drag.a, [Math.max(0, Math.min(r.w - 1, t[0])), Math.max(0, Math.min(r.h - 1, t[1]))]) : runFrom(drag.base, drag.a, t); }
            else if (drag && !ctrl) {
                if (V.isWall(drag.it)) { if (!drag.moved && Math.hypot(p[0] - drag.at[0], p[1] - drag.at[1]) * zoom < 4) { paintSoon(); return; } beginDrag(); hang(drag.it, wallPoint(r, p[0] - drag.grip[0], p[1] - drag.grip[1])); drag.moved = true; }
                else if (t[0] !== drag.from[0] || t[1] !== drag.from[1]) {
                    beginDrag(); const it = drag.it, q = { ...it, x: drag.x0 + t[0] - drag.from[0], y: drag.y0 + t[1] - drag.from[1] };
                    if (fits(r, q, it)) { it.x = q.x; it.y = q.y; drag.moved = true; }
                }
            }
            paintSoon();
        });
        c.addEventListener("pointerup", e => {
            if (!drag) return; const d = drag; drag = null; ctrlY = null; ctrlSpare = 0; lockTile = null;
            if (d.kind === "new") { place(d.item); return; }
            if (d.moved) { commit(); panel(); say(""); return; }
            if (d.began) undo.pop();
            /* Ctrl-click, no movement: delete it, as in the hallway */
            if (d.ctrlAtStart && (e.ctrlKey || e.metaKey)) { sel = d.it; removeSel(); }
        });
        c.addEventListener("pointerleave", () => { if (!drag && !carry) { mouse = null; paintSoon(); } });

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
            if (typing) { keepFromEditor(e); return; }
            e.stopPropagation();
            const k = e.key, ctl = e.ctrlKey || e.metaKey;
            if (ctl && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
            if (ctl && (k === "y" || k === "Y")) { e.preventDefault(); doRedo(); return; }
            if ((k === "Delete" || k === "Backspace") && sel) { e.preventDefault(); removeSel(); return; }
            if (k === "r" || k === "R" || k === "Shift") { if (e.repeat) return; if (turnHeld()) { e.preventDefault(); return; } if (k !== "Shift" && sel) { e.preventDefault(); turnThing(sel); } return; }
            if (k.startsWith("Arrow") && sel && !V.isWall(sel)) {
                e.preventDefault(); const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k], q = { ...sel, x: sel.x + d[0], y: sel.y + d[1] };
                if (fits(roomNow(), q, sel)) editing(() => { sel.x = q.x; sel.y = q.y; }); return;
            }
            if (k === "Escape") { if (carry) { carry = null; lockTile = null; say(""); paintSoon(); } else if (tool) pick(null); else if (sel) { sel = null; panel(); paintSoon(); } else close(); }
        };
        const keysUp = e => { if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) keepFromEditor(e); else e.stopPropagation(); if (e.key === "Control" || e.key === "Meta") { endLift(); ctrlY = null; ctrlSpare = 0; lockTile = null; if (!carry && !tool) say(""); paintSoon(); } };
        addEventListener("keydown", keys, true); addEventListener("keyup", keysUp, true); addEventListener("resize", paintSoon);

        function sync() {
            sizeSel.value = size; floorSel.value = layout().floor; numBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === n)));
            selectB.setAttribute("aria-pressed", String(!tool)); toolBtns.forEach(([b, it]) => b.setAttribute("aria-pressed", String(tool === it)));
            tabLayout.setAttribute("aria-pressed", String(tab === "layout")); tabMazes.setAttribute("aria-pressed", String(tab === "mazes"));
            panel(); checks(); paintSoon();
        }
        V.onArt = paintSoon;
        say("");
        V.load().then(() => { buildPalette(); sync(); return V.mazes(); }).then(list => {
            mazes = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name)));
            const none = el("option", "", "No maze"); none.value = ""; seeSel.appendChild(none);
            for (const m of mazes) { const o = el("option", "", String(m.name).trim()); o.value = m.slug; seeSel.appendChild(o); }
            if (tab === "mazes") panel();
        });
        window.__rooms = { get sel() { return sel; }, get tool() { return tool; }, layout, get carry() { return carry; }, get placeZ() { return placeZ; }, get view() { return view; }, get zoom() { return zoom; }, roomNow, pick, GROUPS };
    }
    window.RoomsEditor = { open };
})();

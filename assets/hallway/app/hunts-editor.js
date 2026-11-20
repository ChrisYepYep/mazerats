/* The editor's Hunts tab (rebuilt 16 Nov 2026, his: "it feels like it's unfinished, broken, and doesn't seem to make sense to me").

   What it's for, said at the top of the tab:
   - A hunt is a chain of clues. A player picks one from the Hunts list on the walking page; each clue's card says where to look, and it's
     solved by clicking the right spot. Finishing any hunt gives the key, kept for good: it turns in the lift's B slot (the Basement) and
     opens the Finders' Lounge. With no hunt published nobody can get the key, and the tab says so.
   - Scraps are bits of paper on the floor to collect and read again from the Scraps menu. Nothing to do with the key.

   How it's used:
   - Every clue and scrap has a marker on the map while this tab is open (or the Hunt clue / Scrap tool is picked): numbered pins for the
     open hunt's clues, a paper mark for scraps. Click a marker to open its card.
   - Pick spot asks for a click on the map and says so until it gets one (Esc cancels). Show me takes the view there.
   - The left panel's Hunts group: Scrap drops a scrap where you click; Hunt clue adds a clue at the click to the hunt that's open here.
   They're saved in the map like everything else, so Publish in the Warren is what makes them live. The map's shape is unchanged:
     map.hunts  = [{ id, name, clues: [{ title, words, hint, level, px, py, art: "note"|"key"|"none", x, y, night }] }]
     map.scraps = [{ id, level, x, y, text }]                                                        (live-hunts.js reads them) */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE || window.HALLWAY_PLAY) return;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const api = () => LIVE.editorApi(), flash = t => api().flash(t), slug = s => String(s).replace(/[^\w ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "hunt";
    /* the hunts live in the file itself, whichever map is showing (12 Nov 2026): a hunt's clues can lead through a tunnel into the Events Gallery */
    const fileMap = () => LIVE.root || LIVE.map, allLevels = m => [...(m.levels || []), ...((m.gallery && m.gallery.levels) || [])];
    const levelById = id => allLevels(fileMap()).find(l => l.id === id) || null;
    const tabOpen = () => { const p = document.getElementById("tab-hunts"); return !!p && !p.hidden; };
    const toolOn = () => { const t = api().tool; return t === "hunt_clue" || t === "hunt_scrap"; };
    let box = null, openId = null, selKey = null, picking = null;      // the hunt whose card is open; the marker last picked ("c:<hunt>:<i>" or "s:<id>"); what Pick spot is waiting to place

    /* the tab is filled again a moment after an edit, once the focus has gone where the Tab key or the click was taking it, and fill() puts it
       back there (18 Nov scan: filling at once, inside the box's change, threw the focus away, so every next field had to be clicked twice) */
    let fillTimer = 0;
    const fillSoon = () => { clearTimeout(fillTimer); fillTimer = setTimeout(fill, 0); };
    const edit = fn => { const a = api(); a.snapshot(); fn(fileMap()); a.changed(); fillSoon(); };
    const hunts = () => fileMap().hunts || [], scraps = () => fileMap().scraps || [];
    const huntById = id => hunts().find(h => h.id === id) || null, scrapById = id => scraps().find(s => s.id === id) || null;
    const openHunt = () => huntById(openId) || hunts()[0] || null;

    const field = (label, val, on, big, ph, k) => { const f = el("label", "field"), i = el(big ? "textarea" : "input"); if (!big) i.type = "text"; else i.rows = 2; i.value = val || ""; if (ph) i.placeholder = ph; if (k) i.dataset.k = k; i.setAttribute("aria-label", label); i.addEventListener("change", () => on(i.value)); f.append(el("span", "f-label", label), i); return f; };
    const btn = (t, fn, cls, title) => { const b = el("button", "btn small " + (cls || ""), t); b.type = "button"; if (title) b.title = title; b.addEventListener("click", fn); return b; };
    const where = o => { const l = levelById(o.level); return l ? l.name + (o.x !== undefined ? ", tile " + o.x + ", " + o.y : ", a spot on the wall or furniture") : null; };

    /* ---------- placing ---------- */
    /* the next map click says where: its tile if it's floor (needed when a note or the key lies there), else just the point */
    function pickSpot(what, needTile, apply) {
        picking = what; fill(); LIVE.wake();
        api().pickOnce(hit => { picking = null; if (!hit) { fill(); return; } if (needTile && hit.x === undefined) { flash("That's not a floor tile. A note or the key has to lie on the floor."); fill(); return; } edit(m => apply(m, hit)); flash("Placed on " + (where(hit) || "the map") + "."); });
    }
    const spotOf = hit => { const s = { level: hit.level, px: hit.px, py: hit.py }; if (hit.x !== undefined) { s.x = hit.x; s.y = hit.y; } return s; };
    function setClueSpot(c, hit) { Object.assign(c, { level: hit.level, px: hit.px, py: hit.py }); if (hit.x !== undefined) { c.x = hit.x; c.y = hit.y; } else { delete c.x; delete c.y; if (c.art !== "none") c.art = "none"; } }
    /* the left panel's tools (editor.js act() calls this) */
    function placeTool(tool, hit) {
        if (tool === "hunt_scrap") {
            if (hit.x === undefined) { flash("A scrap lies on the floor: click a floor tile."); return; }
            let id = null; edit(m => { m.scraps = m.scraps || []; const s = { id: "s" + Date.now().toString(36), text: "", level: hit.level, x: hit.x, y: hit.y }; m.scraps.push(s); id = s.id; });
            selKey = "s:" + id; openTab(); fill(); focusCard(); flash("Scrap placed. Write what it says in the Hunts tab."); return;
        }
        if (tool === "hunt_clue") {
            let hid = null, n = 0; edit(m => { m.hunts = m.hunts || []; let h = m.hunts.find(q => q.id === openId); if (!h) { h = newHunt(m); }
                const c = { title: "", words: "", hint: "", art: hit.x !== undefined ? "note" : "none" }; setClueSpot(c, hit); h.clues.push(c); hid = h.id; n = h.clues.length; });
            openId = hid; selKey = "c:" + hid + ":" + (n - 1); openTab(); fill(); focusCard(); flash("Clue " + n + " added to " + (huntById(hid) || {}).name + ". Write it in the Hunts tab.");
        }
    }
    function newHunt(m) { const name = "New hunt " + (m.hunts.length + 1), h = { id: slug(name) + "-" + Date.now().toString(36), name, clues: [] }; m.hunts.push(h); return h; }
    function openTab() { const t = document.querySelector('.tab[data-tab="hunts"]'); if (t && !tabOpen()) t.click(); }
    function showMe(o) {
        const l = levelById(o.level); if (!l) { flash("It has no spot yet."); return; }
        if (!LIVE.map.levels.includes(l)) { flash("That's in the " + (fileMap().gallery && fileMap().gallery.levels.includes(l) ? "Events Gallery" : "other map") + ": switch Map at the top to see it."); return; }
        if (api().level !== l) api().setFloor(l);
        const p = o.x !== undefined ? LIVE.mapPoint(o.x + .5, o.y + .5, LIVE.nodeZ(l, o.x, o.y) || 0) : [o.px, o.py]; LIVE.camera(p[0], p[1] - 20); LIVE.wake();
    }
    function focusCard() { requestAnimationFrame(() => { const c = box && box.querySelector(".is-picked"); if (c) c.scrollIntoView({ block: "nearest" }); }); }

    /* ---------- the tab ---------- */
    function fill() {
        if (!box || !LIVE.map) return; clearTimeout(fillTimer); const keep = box.parentElement ? box.parentElement.scrollTop : 0, hs = hunts(), sc = scraps();
        /* the box being typed in, and where in it, to put back after (18 Nov scan) */
        const FOC = "input, textarea, select, button", was = document.activeElement, inBox = !!was && was !== box && box.contains(was), focusK = inBox && was.dataset ? was.dataset.k : null, focusAll = box.querySelectorAll(FOC).length, focusAt = inBox ? [...box.querySelectorAll(FOC)].indexOf(was) : -1, caret = focusK && typeof was.selectionStart === "number" ? [was.selectionStart, was.selectionEnd] : null;
        box.textContent = "";
        if (openId && !huntById(openId)) openId = null; if (!openId && hs.length) openId = hs[0].id;

        const intro = el("div", "hx-intro");
        intro.append(el("p", "", "A hunt is a chain of clues. On the walking page a player picks one from the Hunts list; each clue's card says where to look, and it's solved by clicking the right spot."),
            el("p", "", "Finishing any hunt gives the key, kept for good. It turns in the lift's B slot to reach the Basement, and opens the Finders' Lounge."),
            el("p", "", "Scraps are bits of paper on the floor to collect and read again from the Scraps menu. They're just for reading."));
        box.appendChild(intro);
        if (!hs.some(h => h.clues.length && h.clues.every(c => c.level))) box.appendChild(el("p", "hx-warn", "No finished hunt on this map yet, so nobody can get the key or reach the Basement. Add a hunt, give every clue a spot, then Publish."));
        if (picking) box.appendChild(el("p", "hx-picking", "Click the map for " + picking + ". Esc cancels."));

        /* hunts */
        box.appendChild(el("h4", "", "Hunts (" + hs.length + ")"));
        hs.forEach((h, hi) => {
            const open = h.id === openId, card = el("div", "hx-hunt" + (open ? " is-open" : "")), head = el("button", "hx-head"); head.type = "button";
            const done = h.clues.filter(c => c.level).length;
            head.append(el("b", "", h.name || "(no name)"), el("span", "", h.clues.length + (h.clues.length === 1 ? " clue" : " clues") + (done < h.clues.length ? ", " + (h.clues.length - done) + " without a spot" : "")));
            head.addEventListener("click", () => { openId = open ? null : h.id; fill(); LIVE.wake(); }); card.appendChild(head);
            if (open) {
                card.appendChild(field("Name", h.name, v => edit(() => { const H = huntById(h.id); if (H) H.name = v; }), false, "What players see in the Hunts list", "h:" + h.id + ":name"));
                h.clues.forEach((c, i) => card.appendChild(clueCard(h, c, i)));
                if (!h.clues.length) card.appendChild(el("p", "hint", "No clues yet. Add one below, or pick Hunt clue in the left panel and click the map."));
                const row = el("div", "btn-row"); row.append(
                    btn("Add a clue", () => pickSpot("clue " + (h.clues.length + 1) + " of " + h.name, false, (m, hit) => { const H = m.hunts.find(q => q.id === h.id); if (!H) return; const c = { title: "", words: "", hint: "", art: hit.x !== undefined ? "note" : "none" }; setClueSpot(c, hit); H.clues.push(c); selKey = "c:" + h.id + ":" + (H.clues.length - 1); }), "primary", "Then click where it's found"),
                    btn("Try it", () => { if (!h.clues.length) { flash("Add a clue first."); return; } api().setTool("walk"); if (window.HallwayHunts) HallwayHunts.start(h); }, "", "Walk it as a player, from the first clue"),
                    btn("Remove hunt", () => { if (!confirm("Remove " + (h.name || "this hunt") + " and its " + h.clues.length + " clues?")) return; edit(m => { const at = (m.hunts || []).findIndex(q => q.id === h.id); if (at < 0) return; m.hunts.splice(at, 1); if (!m.hunts.length) delete m.hunts; }); }, "ghost"));      // not found (an Undo just now): nothing goes, rather than the last hunt (18 Nov scan)
                card.appendChild(row);
            }
            box.appendChild(card);
        });
        box.appendChild(btn("New hunt", () => { let id = null; edit(m => { m.hunts = m.hunts || []; id = newHunt(m).id; }); openId = id; fill(); }, hs.length ? "" : "primary"));

        /* scraps */
        box.appendChild(el("h4", "", "Scraps (" + sc.length + ")"));
        box.appendChild(el("p", "hint", "A scrap lies on a floor tile and says a line or two. Pick Scrap in the left panel and click the floor, or add one here."));
        sc.forEach((s, i) => {
            const card = el("div", "hx-scrap" + (selKey === "s:" + s.id ? " is-picked" : ""));
            card.appendChild(field("It says", s.text, v => edit(() => { const S = scrapById(s.id); if (S) S.text = v; }), true, undefined, "s:" + s.id + ":text"));
            card.appendChild(el("p", "hint", where(s) || "No spot yet."));
            const row = el("div", "btn-row"); row.append(
                btn(s.level ? "Move it" : "Pick spot", () => pickSpot("scrap " + (i + 1), true, (m, hit) => { const S = (m.scraps || []).find(q => q.id === s.id); if (S) Object.assign(S, { level: hit.level, x: hit.x, y: hit.y }); selKey = "s:" + s.id; })),
                btn("Show me", () => showMe(s)), btn("Remove", () => edit(m => { const at = (m.scraps || []).findIndex(q => q.id === s.id); if (at < 0) return; m.scraps.splice(at, 1); if (!m.scraps.length) delete m.scraps; }), "ghost"));
            card.appendChild(row); box.appendChild(card);
        });
        box.appendChild(btn("New scrap", () => pickSpot("the new scrap", true, (m, hit) => { m.scraps = m.scraps || []; const s = { id: "s" + Date.now().toString(36), text: "", level: hit.level, x: hit.x, y: hit.y }; m.scraps.push(s); selKey = "s:" + s.id; })));
        if (box.parentElement) box.parentElement.scrollTop = keep;
        if (focusK || focusAt >= 0) { const again = (focusK && [...box.querySelectorAll("[data-k]")].find(e => e.dataset.k === focusK)) || (!focusK && box.querySelectorAll(FOC).length === focusAll && box.querySelectorAll(FOC)[focusAt]); /* by its place in the tab only while nothing came or went */ if (again) { again.focus({ preventScroll: true }); if (caret) try { again.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not a text box */ } } }
    }
    function clueCard(h, c, i) {
        const key = "c:" + h.id + ":" + i, last = i === h.clues.length - 1, q = el("div", "hx-clue" + (selKey === key ? " is-picked" : ""));
        const top = el("div", "hx-clue-top"); top.append(el("span", "hx-num", String(i + 1)), el("b", "", c.title || "Clue " + (i + 1)), el("span", "hint", where(c) || "No spot yet")); q.appendChild(top);
        const set = fn => edit(m => { const H = (m.hunts || []).find(x => x.id === h.id), C = H && H.clues[i]; if (C) fn(C, H); });
        /* players' progress is kept by a clue's number (c0, c1...), so moving or removing one in a hunt that may be live moves everyone's
           progress onto other clues: asked first (scan 18 Nov evening). A hunt with every clue placed is taken to be one that's published */
        const shifts = what => !(h.clues.length && h.clues.every(q => q.level)) || confirm(what + " changes the clue numbers after it. Players keep their progress by clue number, so if " + (h.name || "this hunt") + " is already published, anyone part-way through it will have their found clues moved onto other clues. Go ahead?");
        q.appendChild(field("Title", c.title, v => set(C => { C.title = v; }), false, "Shown on the clue card", key + ":title"));
        q.appendChild(field("Words", c.words, v => set(C => { C.words = v; }), true, "Where to look, in a riddle or plainly", key + ":words"));
        q.appendChild(field("Hint", c.hint, v => set(C => { C.hint = v; }), false, "Optional: costs the player 5 minutes", key + ":hint"));
        const art = el("select", "f-ctl"); art.dataset.k = key + ":art"; const opts = [["note", "A note on its tile"], ["none", "Click what's there"]];
        if (last) opts.splice(1, 0, ["key", "The key on its tile"]);
        for (const [v, t] of opts) { const o = el("option", "", t); o.value = v; art.appendChild(o); }
        art.value = c.art === "key" && !last ? "note" : (c.art || "note");
        art.addEventListener("change", () => { if (art.value !== "none" && c.x === undefined && c.level) { flash("Its spot isn't a floor tile: pick a floor tile first for a note or the key."); art.value = c.art || "none"; return; } set(C => { C.art = art.value; }); });
        const af = el("label", "field"); af.append(el("span", "f-label", "Found by"), art); q.appendChild(af);
        q.appendChild(el("p", "hint hx-small", art.value === "none" ? "Nothing is drawn: the player clicks whatever is at the spot (a bookcase, a painting, a torn corner)." : art.value === "key" ? "The key lies there: finding it finishes the hunt and gives the key." : "A folded note lies on the tile: clicking it solves the clue."));
        const nf = el("label", "field hx-check"), ni = el("input"); ni.type = "checkbox"; ni.dataset.k = key + ":night"; ni.checked = !!c.night; ni.addEventListener("change", () => set(C => { C.night = ni.checked; })); nf.append(ni, el("span", "", "Only after dark (the Hallway's own clock)")); q.appendChild(nf);
        const row = el("div", "btn-row"); row.append(
            btn(c.level ? "Move spot" : "Pick spot", () => pickSpot("clue " + (i + 1) + " of " + h.name, false, (m, hit) => { const H = m.hunts.find(x => x.id === h.id), C = H && H.clues[i]; if (C) setClueSpot(C, hit); selKey = key; }), c.level ? "" : "primary"),
            btn("Show me", () => showMe(c)),
            btn("↑", () => { if (i && shifts("Moving this clue earlier")) set((C, H) => { H.clues.splice(i - 1, 0, H.clues.splice(i, 1)[0]); }); }, "", "Earlier"),
            btn("↓", () => { if (!last && shifts("Moving this clue later")) set((C, H) => { H.clues.splice(i + 1, 0, H.clues.splice(i, 1)[0]); }); }, "", "Later"),
            btn("Remove", () => { if (last || shifts("Removing this clue")) set((C, H) => { H.clues.splice(i, 1); }); }, "ghost"));
        q.appendChild(row);
        q.addEventListener("focusin", () => { if (selKey !== key) { selKey = key; LIVE.wake(); } });
        return q;
    }

    /* ---------- markers on the map ---------- */
    /* every clue of every hunt on this floor (the open hunt's numbered and bright, the rest dim) and every scrap */
    function markers() {
        const lv = api().level; if (!lv) return []; const out = [];
        const at = o => o.x !== undefined ? LIVE.mapPoint(o.x + .5, o.y + .5, LIVE.nodeZ(lv, o.x, o.y) || 0) : [o.px, o.py];
        for (const h of hunts()) h.clues.forEach((c, i) => { if (c.level !== lv.id || (c.x === undefined && c.px === undefined)) return; const p = at(c); out.push({ key: "c:" + h.id + ":" + i, X: p[0], Y: p[1], n: i + 1, mine: h.id === openId, hunt: h, i, tile: c.x !== undefined }); });
        for (const s of scraps()) { if (s.level !== lv.id || s.x === undefined) continue; const p = at(s); out.push({ key: "s:" + s.id, X: p[0], Y: p[1], scrap: s, tile: true }); }
        return out;
    }
    const showing = () => !!LIVE.map && (tabOpen() || toolOn());
    LIVE.add({ still: true, over: (c, ox, oy) => {
        if (!showing()) return; const z = LIVE.zoom, ms = markers();
        /* the open hunt's path, clue to clue */
        const path = ms.filter(m => m.mine).sort((a, b) => a.n - b.n); if (path.length > 1) { c.save(); c.strokeStyle = "rgba(255,206,92,.55)"; c.lineWidth = Math.max(1.5, z); c.setLineDash([5 * z, 4 * z]); c.beginPath(); path.forEach((m, k) => { const X = ox + m.X * z, Y = oy + m.Y * z - 14 * z; if (k) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke(); c.restore(); }
        for (const m of ms) {
            const X = ox + m.X * z, Y = oy + m.Y * z, on = m.key === selKey; c.save();
            if (m.tile) { c.beginPath(); c.moveTo(X, Y - 8 * z); c.lineTo(X + 16 * z, Y); c.lineTo(X, Y + 8 * z); c.lineTo(X - 16 * z, Y); c.closePath(); c.lineWidth = Math.max(1, z) * (on ? 2 : 1); c.strokeStyle = m.scrap ? "#c8f0ff" : m.mine ? "#ffce5c" : "rgba(255,206,92,.45)"; c.fillStyle = m.scrap ? "rgba(200,240,255,.18)" : "rgba(255,206,92,.15)"; c.fill(); c.stroke(); }
            const r = Math.max(7, 6 * z), cy = Y - 16 * z;
            if (m.scrap) { c.fillStyle = on ? "#ffffff" : "#e8f6ff"; c.strokeStyle = "#1a1a1a"; c.lineWidth = 1.5; c.beginPath(); c.rect(X - r * .8, cy - r, r * 1.6, r * 1.8); c.fill(); c.stroke(); c.fillStyle = "#555"; for (let k = 0; k < 3; k++) c.fillRect(X - r * .5, cy - r * .55 + k * r * .45, r, 1.2); }
            else { c.beginPath(); c.arc(X, cy, r, 0, Math.PI * 2); c.fillStyle = on ? "#fff3c4" : m.mine ? "#ffce5c" : "rgba(160,160,160,.75)"; c.strokeStyle = "#1a1a1a"; c.lineWidth = 1.5; c.fill(); c.stroke(); c.fillStyle = "#1a1a1a"; c.font = "bold " + Math.round(r * 1.2) + "px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(m.n), X, cy + .5); }
            c.restore();
        }
    } });
    /* a marker's card opens when it's clicked (not while placing, and not with a placing tool, whose click places) */
    const view = document.getElementById("view");
    if (view) view.addEventListener("pointerdown", e => {
        if (!showing() || !tabOpen() || toolOn() || picking || e.button !== 0) return; const [px, py] = api().toPx(e.clientX, e.clientY), z = 1;
        const hit = markers().find(m => Math.hypot(px - m.X, py - (m.Y - 16 * z)) < 10 || (m.tile && Math.abs(px - m.X) / 16 + Math.abs(py - m.Y) / 8 <= 1)); if (!hit) return;
        e.stopImmediatePropagation(); e.preventDefault(); selKey = hit.key; if (hit.hunt) openId = hit.hunt.id; fill(); focusCard(); LIVE.wake();
    }, true);

    window.HallwayHuntsEditor = { fill, placeTool };
    /* an undo or redo swaps the whole map: the tab is filled again from the new one, or its next edit went into the old map and was lost (10 Nov scan b, rooms 1);
       Esc while picking clears the waiting line */
    let mapWas = null, toolWas = null; setInterval(() => { if (!box || !LIVE.map) return; if (LIVE.map !== mapWas) { const first = mapWas === null; mapWas = LIVE.map; if (!first) fill(); } const t = toolOn(); if (t !== toolWas) { toolWas = t; LIVE.wake(); } }, 300);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && picking) { picking = null; setTimeout(fill, 0); } });
    const wait = setInterval(() => { box = document.getElementById("huntsBox"); if (box && LIVE.map) { clearInterval(wait); fill(); } }, 400);
})();

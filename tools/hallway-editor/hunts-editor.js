/* The editor's Hunts tab: write a hunt and its clues, pick each spot on the map, write the scraps. They're saved in the map like everything else, so Publish in the Warren is what makes them live. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE || window.HALLWAY_PLAY) return;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const api = () => LIVE.editorApi(), slug = s => String(s).replace(/[^\w ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "hunt";
    let box = null;
    /* the hunts live in the file itself, whichever map is showing (12 Nov 2026): a hunt's clues can lead through a tunnel into the Events Gallery */
    const fileMap = () => LIVE.root || LIVE.map, allLevels = m => [...(m.levels || []), ...((m.gallery && m.gallery.levels) || [])];
    const edit = fn => { const a = api(); a.snapshot(); fn(fileMap()); a.changed(); fill(); };
    const text = (label, val, on, big) => { const f = el("label", "field"), i = el(big ? "textarea" : "input"); if (!big) i.type = "text"; else i.rows = 2; i.value = val || ""; i.setAttribute("aria-label", label); i.addEventListener("change", () => on(i.value)); f.append(el("span", "f-label", label), i); return f; };
    const btn = (t, fn, cls) => { const b = el("button", "btn small " + (cls || ""), t); b.type = "button"; b.addEventListener("click", fn); return b; };
    /* the next click on the map says where: its map pixel, and its tile if that's floor */
    /* find(m): what's being placed, looked up in the map that's showing at the click (an undo meanwhile swaps the whole map); ok(hit): whether
       the click will do, checked before the edit, so a miss is no undo step and leaves the map unchanged (14 Nov scan) */
    const pick = (find, ok, fn) => api().pickOnce(hit => { if (!hit) return; if (ok && !ok(hit)) { api().flash("That's not a floor tile."); return; } const it = find(fileMap()); if (!it) return; edit(() => fn(it, hit)); });
    const clueOf = (h, hi, i) => m => { const hs = m.hunts || [], H = (h.id && hs.find(q => q.id === h.id)) || hs[hi]; return (H && H.clues[i]) || null; };
    const scrapOf = (s, i) => m => { const ss = m.scraps || []; return (s.id && ss.find(q => q.id === s.id)) || ss[i] || null; };
    function fill() {
        if (!box || !LIVE.map) return; const map = fileMap(), hunts = map.hunts || [], scraps = map.scraps || []; box.textContent = "";
        box.appendChild(el("p", "hint", "Each clue is solved by clicking its spot. A note or the key lies on its tile; with no picture, click whatever's there: a bookcase, a torn corner."));
        hunts.forEach((h, hi) => { const d = el("div", "hunt"); d.appendChild(text("Name", h.name, v => edit(() => { h.name = v; })));
            h.clues.forEach((c, i) => { const q = el("div", "clue"); q.appendChild(el("h5", "", "Clue " + (i + 1))); q.appendChild(text("Title", c.title, v => edit(() => { c.title = v; }))); q.appendChild(text("Words", c.words, v => edit(() => { c.words = v; }), true)); q.appendChild(text("Hint", c.hint, v => edit(() => { c.hint = v; })));
                const art = el("select", "f-ctl"); for (const [v, t] of [["note", "A note on the floor"], ["key", "The key on the floor"], ["none", "Nothing: click what's there"]]) { const o = el("option", "", t); o.value = v; art.appendChild(o); } art.value = c.art || "note"; art.addEventListener("change", () => edit(() => { c.art = art.value; })); const f = el("label", "field"); f.append(el("span", "f-label", "Solved by"), art); q.appendChild(f);
                const nf = el("label", "field"), ni = el("input"); ni.type = "checkbox"; ni.checked = !!c.night; ni.addEventListener("change", () => edit(() => { c.night = ni.checked; })); nf.append(el("span", "f-label", "Only after dark"), ni); q.appendChild(nf);
                const lv = allLevels(map).find(l => l.id === c.level); q.appendChild(el("p", "hint", lv ? "On " + lv.name + (c.x !== undefined ? ", tile " + c.x + ", " + c.y : "") : "No spot yet."));
                const row = el("div", "btn-row"); row.append(btn("Pick on the map", () => pick(clueOf(h, hi, i), null, (c, s) => { c.level = s.level; c.px = s.px; c.py = s.py; if (s.x !== undefined) { c.x = s.x; c.y = s.y; } else { delete c.x; delete c.y; } })), btn("Remove clue", () => edit(() => { h.clues.splice(i, 1); }))); q.appendChild(row); d.appendChild(q); });
            const row = el("div", "btn-row"); row.append(btn("Add a clue", () => edit(() => { h.clues.push({ title: "", words: "", hint: "", art: "note" }); })), btn("Try it", () => { api().setTool("walk"); if (window.HallwayHunts) HallwayHunts.start(h); }), btn("Remove hunt", () => edit(m => { m.hunts.splice(hi, 1); if (!m.hunts.length) delete m.hunts; }))); d.appendChild(row); box.appendChild(d); });
        box.appendChild(btn("New hunt", () => edit(m => { m.hunts = m.hunts || []; const name = "New hunt " + (m.hunts.length + 1); m.hunts.push({ id: slug(name) + "-" + Date.now().toString(36), name, clues: [{ title: "", words: "", hint: "", art: "note" }] }); }), "primary"));
        box.appendChild(el("h4", "", "Scraps"));
        scraps.forEach((s, i) => { const lv = allLevels(map).find(l => l.id === s.level), d = el("div", "hunt"); d.appendChild(text("It says", s.text, v => edit(() => { s.text = v; }), true)); d.appendChild(el("p", "hint", lv ? "On " + lv.name + ", tile " + s.x + ", " + s.y : "No spot yet.")); const row = el("div", "btn-row"); row.append(btn("Pick on the map", () => pick(scrapOf(s, i), q => q.x !== undefined, (s, q) => { s.level = q.level; s.x = q.x; s.y = q.y; })), btn("Remove", () => edit(m => { m.scraps.splice(i, 1); if (!m.scraps.length) delete m.scraps; }))); d.appendChild(row); box.appendChild(d); });
        box.appendChild(btn("New scrap", () => edit(m => { m.scraps = m.scraps || []; m.scraps.push({ id: "s" + Date.now().toString(36), text: "", level: null }); })));
    }
    window.HallwayHuntsEditor = { fill };
    /* an undo or redo swaps the whole map: the tab is filled again from the new one, or its next edit went into the old map and was lost (10 Nov scan b, rooms 1) */
    let mapWas = null; setInterval(() => { if (box && LIVE.map && LIVE.map !== mapWas) { const first = mapWas === null; mapWas = LIVE.map; if (!first) fill(); } }, 300);
    const wait = setInterval(() => { box = document.getElementById("huntsBox"); if (box && LIVE.map) { clearInterval(wait); fill(); } }, 400);
})();

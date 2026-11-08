/* The editor's Lost Property tab (8 Nov 2026, the owner's: "lost property tool where i can pick spots, make sure it's easy to use and simple UI,
   and not laggy. I should be able to easily and smoothly test all possible lost items").

   - Sit hustle on any chair or sofa (map.hustle).
   - Add spots: click floor tiles one after another; click a spot again to take it away (map.lostSpots: { level, x, y, skip }).
   - Pick a spot from the list, or click its marker on the map: every lost thing in a strip with how much of it shows there; click one,
     or use the arrow keys, to see it on the map. Each is ticked if it can be hidden there. A new spot ticks the ones where between a fifth
     and four fifths shows; untick or tick any.
   The server picks only from ticked things at saved spots, so Publish in the Warren is what makes changes live.

   The tab is built once and only its parts change (8 Nov, his: "the menu for spots moves everytime i click something"): rebuilding the
   whole of it on every click threw the panel back to the top. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE || window.HALLWAY_PLAY) return;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const btn = (t, fn, cls) => { const b = el("button", "btn small " + (cls || ""), t); b.type = "button"; b.addEventListener("click", fn); return b; };
    const api = () => LIVE.editorApi(), LOST = () => window.HallwayLost, flash = t => api().flash(t);
    const LO = .2, HI = .85;
    let adding = false, selKey = null, at = 0, fits = new Map(), fitsFor = null;
    const tabOpen = () => { const p = document.getElementById("tab-lost"); return !!p && !p.hidden; };
    const edit = fn => { const a = api(); a.snapshot(); fn(LIVE.map); a.changed(); };
    const keyOf = s => s.level + "|" + s.x + "|" + s.y;
    /* the map's spots in the new shape; the first ones are converted the first time anything changes */
    const oldSpots = () => LOST().OLD_SPOTS.map(([name, x, y]) => { const l = LIVE.map.levels.find(q => q.name === name); return l ? { level: l.id, x, y, skip: [] } : null; }).filter(Boolean);
    function list() { const map = LIVE.map; if (!map.lostSpots) map.lostSpots = oldSpots(); return map.lostSpots; }
    const shown = () => LIVE.map.lostSpots || oldSpots();
    const sel = () => selKey ? shown().find(s => keyOf(s) === selKey) || null : null;       // found again each time, so undo can't leave it pointing at nothing
    const levelOf = s => LIVE.map.levels.find(q => q.id === s.level);
    const spotOf = s => ({ l: levelOf(s), x: s.x, y: s.y, skip: s.skip || [] });
    const things = () => (LOST() && LOST().things) || [];
    const name = s => { const l = levelOf(s); return (l ? l.name : "?") + ", " + s.x + ", " + s.y; };
    const suits = f => f !== undefined && f >= LO && f <= HI;

    /* how much of each thing shows at a spot: worked out once a spot is picked */
    async function measure(s) {
        const sp = spotOf(s); if (!sp.l) return new Map(); const out = new Map(), th = things();
        for (const t of th) LOST().thingImg(t.f);
        for (let tries = 0; tries < 20; tries++) { let missing = 0; for (const t of th) { const f = LOST().showsAt(sp, t); if (f === null) missing++; else out.set(t.k, f); } if (!missing) break; await new Promise(r => setTimeout(r, 150)); }
        return out;
    }
    async function autoSkip(s) { const f = await measure(s); s.skip = things().filter(t => f.has(t.k) && !suits(f.get(t.k))).map(t => t.k); if (keyOf(s) === selKey) { fits = f; fitsFor = selKey; detail(); } rows(); }

    /* ---------- the parts of the tab, made once ---------- */
    let box = null; const ui = {};
    function build() {
        box.textContent = "";
        const hs = el("div", "lp-sec"); ui.hustle = el("p", "hint"); const hr = el("div", "btn-row");
        hr.append(btn("Sit him on a seat", sitHustle), ui.showHustle = btn("Show me", () => { const h = LOST().hustleSeat(); if (h) go(h.l, h.x, h.y); }));
        hs.append(el("h4", "", "hustle"), ui.hustle, hr);
        const sp = el("div", "lp-sec"); ui.count = el("h4", ""); ui.mode = el("p", "hint");
        const ar = el("div", "btn-row"); ui.add = btn("Add or remove spots", () => setAdding(!adding)); ar.append(ui.add, btn("Re-tick them all", async () => { api().snapshot(); for (const s of list()) await autoSkip(s); api().changed(); rows(); detail(); }));
        ui.list = el("div", "lp-spots"); sp.append(ui.count, ui.mode, ar, ui.list);
        const dt = el("div", "lp-sec lp-detail"); ui.title = el("h4", ""); ui.empty = el("p", "hint", "Pick a spot in the list above, or click its marker on the map.");
        ui.body = el("div", "lp-body"); ui.now = el("div", "lp-now"); ui.nowImg = el("img"); ui.nowImg.alt = ""; const nw = el("div", "lp-now-words"); ui.nowName = el("b", ""); ui.nowPct = el("span", ""); const can = el("label", "lp-can"); ui.can = el("input"); ui.can.type = "checkbox"; ui.can.addEventListener("change", () => { const t = things()[at]; if (t) toggle(t); }); can.append(ui.can, document.createTextNode(" Can be hidden here")); nw.append(ui.nowName, ui.nowPct, can); ui.now.append(ui.nowImg, nw);
        const nav = el("div", "btn-row lp-nav"); ui.pos = el("span", "hint"); nav.append(btn("‹ Previous", () => step(-1)), ui.pos, btn("Next ›", () => step(1)), ui.remove = btn("Remove this spot", () => { const s = sel(); if (s) removeSpot(s); }, "ghost"));
        ui.strip = el("div", "lp-strip"); ui.thumbs = [];
        ui.body.append(ui.now, nav, el("p", "hint", "Arrow keys flick through them, Space ticks or unticks."), ui.strip);
        dt.append(ui.title, ui.empty, ui.body); box.append(hs, sp, dt);
        hustleLine(); modeLine(); rows(); detail();
    }
    function hustleLine() { const hs = LOST().hustleSeat(), placed = LIVE.map.hustle; ui.hustle.textContent = placed && hs ? "Sits on " + hs.l.name + ", tile " + hs.x + ", " + hs.y + "." : hs ? "Not placed yet, so he sits on the seat nearest the desk (" + hs.l.name + ", " + hs.x + ", " + hs.y + ")." : "Not placed yet, and there's no seat near the desk."; ui.showHustle.hidden = !hs; }
    function modeLine() { ui.add.textContent = adding ? "Done adding" : "Add or remove spots"; ui.add.classList.toggle("primary", adding); ui.mode.textContent = adding ? "Click free floor tiles beside furniture to add spots; click a spot again to take it away. Done or Esc stops." : "The server hides each thing at one of these, never where it's unticked. Click a marker on the map to pick its spot."; }
    /* the list: rebuilt only when spots come or go, its scroll kept; the picked one just lit */
    let rowsSig = "";
    function rows() {
        const all = shown(), n = things().length, sig = all.map(keyOf).join(",");
        ui.count.textContent = "Hiding spots (" + all.length + ")";
        if (sig !== rowsSig) { rowsSig = sig; const top = ui.list.scrollTop; ui.list.textContent = ""; ui.rowEls = new Map();
            for (const s of all) { const row = el("div", "lp-spot"), b = el("button", "lp-spot-name", name(s)); b.type = "button"; b.addEventListener("click", () => pick(keyOf(s)));
                const meta = el("span", "lp-spot-meta"); row.append(b, meta, btn("×", () => removeSpot(s), "ghost lp-x")); ui.list.appendChild(row); ui.rowEls.set(keyOf(s), { row, meta }); }
            ui.list.scrollTop = top; }
        for (const s of all) { const r = ui.rowEls.get(keyOf(s)); if (!r) continue; const l = levelOf(s); r.row.classList.toggle("on", keyOf(s) === selKey); r.meta.textContent = (l ? LOST().kindOf({ l, x: s.x, y: s.y }) : "?") + " · " + (n - (s.skip || []).length) + " of " + n; }
    }
    /* the picked spot: its strip made once per spot, then only lit and ticked */
    let stripFor = null;
    function detail() {
        const s = sel(); ui.empty.hidden = !!s; ui.body.hidden = !s; ui.remove.hidden = !s;
        if (!s) { ui.title.textContent = "No spot picked"; stripFor = null; return; }
        const l = levelOf(s), th = things(); ui.title.textContent = name(s) + (l ? " · " + LOST().kindOf({ l, x: s.x, y: s.y }) : "");
        if (stripFor !== selKey) { stripFor = selKey; ui.strip.textContent = ""; ui.thumbs = th.map((q, i) => { const b = el("button", "lp-thumb"); b.type = "button"; const im = el("img"); im.src = "art/ideas/lost/" + q.f; im.alt = q.name; const sm = el("small", "", "…"); b.append(im, sm); b.addEventListener("click", () => { at = i; show(); detail(); }); ui.strip.appendChild(b); return { b, sm }; }); }
        const skip = new Set(s.skip || []), ready = fitsFor === selKey;
        th.forEach((q, i) => { const u = ui.thumbs[i]; if (!u) return; const f = ready ? fits.get(q.k) : undefined; u.b.classList.toggle("on", i === at); u.b.classList.toggle("skip", skip.has(q.k)); u.sm.className = f === undefined ? "" : suits(f) ? "good" : "bad"; u.sm.textContent = f === undefined ? "…" : Math.round(f * 100) + "%"; u.b.title = q.name + (f === undefined ? "" : ": " + Math.round(f * 100) + "% shows") + (skip.has(q.k) ? " (not here)" : ""); });
        const t = th[at]; if (!t) return; const f = ready ? fits.get(t.k) : undefined;
        if (!ui.nowImg.src.endsWith(t.f)) ui.nowImg.src = "art/ideas/lost/" + t.f; ui.nowName.textContent = t.name;
        ui.nowPct.textContent = f === undefined ? "Measuring..." : Math.round(f * 100) + "% of it shows" + (suits(f) ? "" : f < LO ? ": too hidden" : ": too easy");
        ui.can.checked = !skip.has(t.k); ui.pos.textContent = (at + 1) + " of " + th.length;
    }

    /* ---------- doing things ---------- */
    function go(l, x, y) { if (api().level !== l) api().setFloor(l); const p = LIVE.mapPoint(x + .5, y + .5, LIVE.nodeZ(l, x, y) || 0); LIVE.camera(p[0], p[1] - 20); LIVE.wake(); }
    function pick(key) {
        selKey = key; const s = sel(); if (!s) { rows(); detail(); return; } const l = levelOf(s); if (l) go(l, s.x, s.y);
        if (fitsFor !== key) { fits = new Map(); fitsFor = null; measure(s).then(f => { if (selKey === key) { fits = f; fitsFor = key; detail(); } }); }
        show(); rows(); detail();
    }
    function show() { const L = LOST(); if (!L) return; const s = sel(), t = things()[at]; L.setPreview(s && t && tabOpen() ? { spot: spotOf(s), thing: t, hints: 0 } : null); }
    function step(d) { const n = things().length; if (!n || !sel()) return; at = (at + d + n) % n; show(); detail(); const u = ui.thumbs[at]; if (u) u.b.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    function toggle(t) { if (!sel()) return; edit(() => { const s = list().find(q => keyOf(q) === selKey); if (!s) return; const sk = s.skip = s.skip || [], i = sk.indexOf(t.k); if (i >= 0) sk.splice(i, 1); else sk.push(t.k); }); rows(); detail(); }
    function removeSpot(s) { const key = keyOf(s); edit(() => { const all = list(), i = all.findIndex(q => keyOf(q) === key); if (i >= 0) all.splice(i, 1); }); if (selKey === key) { selKey = null; show(); } rows(); detail(); LIVE.wake(); }
    function sitHustle() { setAdding(false); flash("Click a chair or a sofa."); api().pickOnce(hit => { const l = LIVE.map.levels.find(q => q.id === hit.level); const seat = l && hit.x !== undefined && (l.props || []).find(p => (p.k === "chair" || p.k === "sofa") && window.FurniParts.tiles(p).some(t => t[0] === hit.x && t[1] === hit.y)); if (!seat) { flash("That's not a chair or a sofa."); return; } edit(m => { m.hustle = { level: hit.level, x: hit.x, y: hit.y }; }); hustleLine(); LIVE.wake(); }); }
    function setAdding(on) { adding = on; if (on) arm(); else api().pickOnce(null); modeLine(); }
    /* adding: one click after another, until Done */
    function arm() { if (!adding) return; api().pickOnce(hit => { if (!adding) return;
        const l = hit && LIVE.map.levels.find(q => q.id === hit.level);
        if (!hit || hit.x === undefined) flash("That's not a floor tile.");
        else if (!l || l.k < 0) flash("Not in the Basement.");
        else { const key = keyOf(hit), had = shown().find(s => keyOf(s) === key);
            if (had) { removeSpot(had); flash("Spot taken away."); }
            else if (!LIVE.tileFree(l)(hit.x, hit.y)) flash("Something's standing there: pick a free tile beside the furniture.");
            else { const s = { level: hit.level, x: hit.x, y: hit.y, skip: [] }; edit(() => list().push(s)); selKey = key; fitsFor = null; fits = new Map(); show(); rows(); detail(); autoSkip(s).then(() => api().changed()); } }
        arm(); }); }
    document.addEventListener("keydown", e => {
        if (adding && e.key === "Escape") { setAdding(false); return; }
        if (!tabOpen() || !sel() || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "") || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); e.stopImmediatePropagation(); step(1); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); e.stopImmediatePropagation(); step(-1); }
        else if (e.key === " " && things()[at]) { e.preventDefault(); e.stopImmediatePropagation(); toggle(things()[at]); }
    }, true);
    /* a click on a spot's marker picks it, while the tab's open and you're not adding */
    const view = document.getElementById("view");
    if (view) view.addEventListener("pointerdown", e => { if (!tabOpen() || adding || e.button !== 0 || !LIVE.map) return; const h = api().tileAt(e.clientX, e.clientY); if (!h) return; const s = shown().find(q => keyOf(q) === keyOf(h)); if (!s) return; e.stopImmediatePropagation(); e.preventDefault(); pick(keyOf(s)); }, true);

    /* markers on the map for the spots on this floor while the tab's open */
    LIVE.add({ still: true, over: (c, ox, oy) => {
        if (!tabOpen() || !LIVE.map) return; const lv = api().level; if (!lv) return; const z = LIVE.zoom;
        for (const s of shown()) { if (s.level !== lv.id) continue; const p = LIVE.mapPoint(s.x + .5, s.y + .5, LIVE.nodeZ(lv, s.x, s.y) || 0), X = ox + p[0] * z, Y = oy + p[1] * z, on = keyOf(s) === selKey;
            c.save(); c.beginPath(); c.moveTo(X, Y - 8 * z); c.lineTo(X + 16 * z, Y); c.lineTo(X, Y + 8 * z); c.lineTo(X - 16 * z, Y); c.closePath(); c.lineWidth = Math.max(1, z) * (on ? 2 : 1); c.strokeStyle = on ? "#ffe066" : "rgba(242,190,112,.9)"; c.fillStyle = on ? "rgba(255,224,102,.18)" : "rgba(242,190,112,.12)"; c.fill(); c.stroke(); c.restore(); }
    } });
    /* the preview goes when the tab does; an undo or a reload of the map brings the list up to date */
    let wasOpen = false, mapWas = null; setInterval(() => { if (!box || !ui.list) return; const o = tabOpen(); if (o !== wasOpen) { wasOpen = o; if (!o) { setAdding(false); if (LOST()) LOST().setPreview(null); } else { hustleLine(); rows(); detail(); show(); } LIVE.wake(); } if (o && LIVE.map !== mapWas) { mapWas = LIVE.map; hustleLine(); rows(); detail(); show(); } }, 300);
    window.HallwayLostEditor = { pick, step, get selected() { return sel(); } };
    const wait = setInterval(() => { box = document.getElementById("lostBox"); if (box && LIVE.map && LOST() && LOST().things && LOST().things.length) { clearInterval(wait); build(); } }, 400);
})();

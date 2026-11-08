/* The editor's Lost Property tab (8 Nov 2026, the owner's: "lost property tool where i can pick spots, make sure it's easy to use and simple UI,
   and not laggy. I should be able to easily and smoothly test all possible lost items").

   - Sit hustle on any chair or sofa (map.hustle).
   - Add spots: click floor tiles one after another; click a spot again to take it away (map.lostSpots: { level, x, y, skip }).
   - Look at a spot: every lost thing in a strip with how much of it shows there; click one, or use the arrow keys, to see it on the map.
     Each is ticked if it can be hidden there. A new spot ticks the ones where between a fifth and four fifths shows; untick or tick any.
   The server picks only from ticked things at saved spots, so Publish in the Warren is what makes changes live. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE || window.HALLWAY_PLAY) return;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const btn = (t, fn, cls) => { const b = el("button", "btn small " + (cls || ""), t); b.type = "button"; b.addEventListener("click", fn); return b; };
    const api = () => LIVE.editorApi(), LOST = () => window.HallwayLost;
    const LO = .2, HI = .85;
    let box = null, adding = false, sel = null, at = 0, fits = new Map();
    const tabOpen = () => { const p = document.getElementById("tab-lost"); return !!p && !p.hidden; };
    const edit = fn => { const a = api(); a.snapshot(); fn(LIVE.map); a.changed(); };
    /* the map's spots in the new shape, the first ones converted the first time anything changes */
    function list() { const map = LIVE.map; if (!map.lostSpots) map.lostSpots = LOST().OLD_SPOTS.map(([name, x, y]) => { const l = map.levels.find(q => q.name === name); return l ? { level: l.id, x, y, skip: [] } : null; }).filter(Boolean); return map.lostSpots; }
    const levelOf = s => LIVE.map.levels.find(q => q.id === s.level);
    const spotOf = s => ({ l: levelOf(s), x: s.x, y: s.y, skip: s.skip || [] });
    const things = () => (LOST() && LOST().things) || [];
    const name = s => { const l = levelOf(s); return (l ? l.name : "?") + ", " + s.x + ", " + s.y; };

    /* how much of each thing shows at a spot: worked out once a spot is looked at, again only when asked */
    async function measure(s) {
        const sp = spotOf(s); if (!sp.l) return new Map(); const out = new Map(), th = things();
        for (const t of th) LOST().thingImg(t.f);
        for (let tries = 0; tries < 20; tries++) { let missing = 0; for (const t of th) { const f = LOST().showsAt(sp, t); if (f === null) missing++; else out.set(t.k, f); } if (!missing) break; await new Promise(r => setTimeout(r, 150)); }
        return out;
    }
    const suits = f => f !== undefined && f >= LO && f <= HI;
    async function autoSkip(s) { const f = await measure(s); s.skip = things().filter(t => f.has(t.k) && !suits(f.get(t.k))).map(t => t.k); if (s === sel) { fits = f; fill(); } }

    function lookAt(s) {
        sel = s; at = Math.min(at, Math.max(0, things().length - 1)); fits = new Map(); const l = levelOf(s);
        if (l) { api().setFloor(l); const p = LIVE.mapPoint(s.x + .5, s.y + .5, LIVE.nodeZ(l, s.x, s.y) || 0); LIVE.camera(p[0], p[1] - 20); }
        show(); fill(); measure(s).then(f => { if (sel === s) { fits = f; fill(); } });
    }
    function show() { const L = LOST(); if (!L) return; const t = things()[at]; L.setPreview(sel && t && tabOpen() ? { spot: spotOf(sel), thing: t, hints: 0 } : null); }
    function step(d) { const n = things().length; if (!n || !sel) return; at = (at + d + n) % n; show(); fill(); const cur = box && box.querySelector(".lp-thumb.on"); if (cur) cur.scrollIntoView({ block: "nearest", inline: "nearest" }); }

    /* clicking tiles, one after another */
    function arm() { if (!adding) return; api().pickOnce(hit => { if (!adding) return; if (hit.x === undefined) { flash("That's not a floor tile."); arm(); return; } const l = LIVE.map.levels.find(q => q.id === hit.level); if (!l || l.k < 0) { flash("Not in the Basement."); arm(); return; }
        const sp = list(), i = sp.findIndex(s => s.level === hit.level && s.x === hit.x && s.y === hit.y);
        if (i >= 0) { edit(() => { const [gone] = sp.splice(i, 1); if (sel === gone) sel = null; }); flash("Spot taken away."); }
        else if (!LIVE.tileFree(l)(hit.x, hit.y)) flash("Something's standing there: pick a free tile beside the furniture.");
        else { const s = { level: hit.level, x: hit.x, y: hit.y, skip: [] }; edit(() => sp.push(s)); lookAt(s); autoSkip(s).then(() => { api().changed(); }); }
        fill(); arm(); }); }
    const flash = t => api().flash(t);
    document.addEventListener("keydown", e => {
        if (adding && e.key === "Escape") { adding = false; fill(); return; }
        if (!tabOpen() || !sel || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); e.stopImmediatePropagation(); step(1); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); e.stopImmediatePropagation(); step(-1); }
        else if (e.key === " " && things()[at]) { e.preventDefault(); e.stopImmediatePropagation(); toggle(things()[at]); }
    }, true);
    function toggle(t) { if (!sel) return; edit(() => { const k = t.k, sk = sel.skip = sel.skip || []; const i = sk.indexOf(k); if (i >= 0) sk.splice(i, 1); else sk.push(k); }); fill(); }

    function fill() {
        if (!box || !LIVE.map || !LOST()) return; const map = LIVE.map, sp = map.lostSpots || null, shown = sp || LOST().OLD_SPOTS.map(([n, x, y]) => { const l = map.levels.find(q => q.name === n); return l ? { level: l.id, x, y, skip: [] } : null; }).filter(Boolean);
        box.textContent = "";
        /* hustle */
        const hs = LOST().hustleSeat();
        box.appendChild(el("h4", "", "hustle"));
        box.appendChild(el("p", "hint", map.hustle && hs ? "Sits on " + hs.l.name + ", tile " + hs.x + ", " + hs.y + "." : hs ? "Not placed yet, so he sits on the seat nearest the desk (" + hs.l.name + ", " + hs.x + ", " + hs.y + ")." : "Not placed yet, and there's no seat near the desk."));
        const hr = el("div", "btn-row"); hr.append(btn("Sit him on a seat", () => { adding = false; api().pickOnce(hit => { const l = LIVE.map.levels.find(q => q.id === hit.level); const seat = l && hit.x !== undefined && (l.props || []).find(p => (p.k === "chair" || p.k === "sofa") && window.FurniParts.tiles(p).some(t => t[0] === hit.x && t[1] === hit.y)); if (!seat) { flash("That's not a chair or a sofa."); return; } edit(m => { m.hustle = { level: hit.level, x: hit.x, y: hit.y }; }); fill(); LIVE.wake(); }); flash("Click a chair or a sofa."); }));
        if (hs) hr.append(btn("Show me", () => { api().setFloor(hs.l); const p = LIVE.mapPoint(hs.x + .5, hs.y + .5, LIVE.nodeZ(hs.l, hs.x, hs.y) || 0); LIVE.camera(p[0], p[1] - 20); LIVE.wake(); }));
        box.appendChild(hr);
        /* the spots */
        box.appendChild(el("h4", "", "Hiding spots (" + shown.length + ")"));
        box.appendChild(el("p", "hint", adding ? "Click free floor tiles beside furniture to add spots. Click a spot again to take it away. Esc or Done stops." : "The server hides each thing at one of these, never at a spot where it's unticked."));
        const ar = el("div", "btn-row"); ar.append(btn(adding ? "Done" : "Add or remove spots", () => { adding = !adding; if (adding) arm(); else api().pickOnce(() => {}); fill(); }, adding ? "primary" : ""), btn("Re-tick them all", async () => { const all = list(); api().snapshot(); for (const s of all) await autoSkip(s); api().changed(); fill(); }));
        box.appendChild(ar);
        const ul = el("div", "lp-spots");
        for (const s of shown) { const l = levelOf(s), row = el("div", "lp-spot" + (sel && sel.level === s.level && sel.x === s.x && sel.y === s.y ? " on" : "")), sk = (s.skip || []).length, n = things().length;
            const b = el("button", "lp-spot-name", name(s)); b.type = "button"; b.addEventListener("click", () => { const real = list().find(q => q.level === s.level && q.x === s.x && q.y === s.y); lookAt(real); });
            const kind = l ? LOST().kindOf({ l, x: s.x, y: s.y }) : "?";
            row.append(b, el("span", "lp-spot-meta", kind + " · " + (n - sk) + " of " + n), btn("×", () => edit(() => { const all = list(), i = all.findIndex(q => q.level === s.level && q.x === s.x && q.y === s.y); if (i >= 0) { if (sel === all[i]) { sel = null; show(); } all.splice(i, 1); } fill(); }), "ghost lp-x"));
            ul.appendChild(row); }
        box.appendChild(ul);
        /* the spot looked at: every thing there */
        if (sel && list().includes(sel)) {
            const th = things(), t = th[at], f = t && fits.get(t.k), on = t && !(sel.skip || []).includes(t.k);
            box.appendChild(el("h4", "", "At " + name(sel)));
            const now = el("div", "lp-now"); if (t) { const i = el("img"); i.src = "art/ideas/lost/" + t.f; i.alt = ""; now.append(i); const w = el("div", "lp-now-words"); w.append(el("b", "", t.name), el("span", "", f === undefined ? "Measuring..." : Math.round(f * 100) + "% of it shows" + (suits(f) ? "" : f < LO ? ": too hidden" : ": too easy"))); const c = el("label", "lp-can"), cb = el("input"); cb.type = "checkbox"; cb.checked = on; cb.addEventListener("change", () => toggle(t)); c.append(cb, document.createTextNode(" Can be hidden here")); w.append(c); now.append(w); }
            box.appendChild(now);
            const nav = el("div", "btn-row"); nav.append(btn("‹ Previous", () => step(-1)), el("span", "hint", (at + 1) + " of " + th.length), btn("Next ›", () => step(1))); box.appendChild(nav);
            box.appendChild(el("p", "hint", "Arrow keys flick through them, Space ticks or unticks."));
            const strip = el("div", "lp-strip");
            th.forEach((q, i) => { const fq = fits.get(q.k), ok = !(sel.skip || []).includes(q.k), b = el("button", "lp-thumb" + (i === at ? " on" : "") + (ok ? "" : " skip")); b.type = "button"; b.title = q.name + (fq === undefined ? "" : ": " + Math.round(fq * 100) + "% shows") + (ok ? "" : " (not here)"); const im = el("img"); im.src = "art/ideas/lost/" + q.f; im.alt = q.name; b.append(im, el("small", fq === undefined ? "" : suits(fq) ? "good" : "bad", fq === undefined ? "…" : Math.round(fq * 100) + "%")); b.addEventListener("click", () => { at = i; show(); fill(); }); strip.appendChild(b); });
            box.appendChild(strip);
        }
    }

    /* markers on the map for the spots on this floor while the tab's open */
    LIVE.add({ still: true, over: (c, ox, oy) => {
        if (!tabOpen() || !LIVE.map) return; const lv = api().level, sp = LIVE.map.lostSpots || []; if (!lv) return; const z = LIVE.zoom;
        for (const s of sp) { if (s.level !== lv.id) continue; const p = LIVE.mapPoint(s.x + .5, s.y + .5, LIVE.nodeZ(lv, s.x, s.y) || 0), X = ox + p[0] * z, Y = oy + p[1] * z, on = sel === s;
            c.save(); c.beginPath(); c.moveTo(X, Y - 8 * z); c.lineTo(X + 16 * z, Y); c.lineTo(X, Y + 8 * z); c.lineTo(X - 16 * z, Y); c.closePath(); c.lineWidth = Math.max(1, z); c.strokeStyle = on ? "#ffe066" : "rgba(242,190,112,.9)"; c.fillStyle = on ? "rgba(255,224,102,.18)" : "rgba(242,190,112,.12)"; c.fill(); c.stroke(); c.restore(); }
    } });
    /* the preview goes when the tab does */
    let wasOpen = false; setInterval(() => { const o = tabOpen(); if (o !== wasOpen) { wasOpen = o; if (!o) { adding = false; if (LOST()) LOST().setPreview(null); } else { show(); fill(); } LIVE.wake(); } }, 300);
    window.HallwayLostEditor = { fill, lookAt, step };
    const wait = setInterval(() => { box = document.getElementById("lostBox"); if (box && LIVE.map && LOST() && LOST().things) { clearInterval(wait); fill(); } }, 400);
})();

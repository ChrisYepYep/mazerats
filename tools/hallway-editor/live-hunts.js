/* The Hallway's hunts and scraps. Things to click on the map, written in the editor's Hunts tab and kept in the map:
     map.scraps = [{ id, level, x, y, text }]                 a scrap of paper on the floor
     map.hunts  = [{ id, name, clues: [{ title, words, hint, level, px, py, art: "note"|"key"|"none", x, y, night }] }]
   A clue is solved by clicking its spot. A note or key lies on its tile; nothing else is drawn. A torn-paper corner can hide a note or a door (q.behind), and a rope can be night-only.
   Finishing any hunt gives the key, which stays yours, and opens the Finders' Lounge. Progress is progress.js: the browser for guests, the account when signed in. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const prog = () => window.HallwayProgress, win = () => window.HallwayWindow;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const img = (() => { const m = new Map(); return src => { let i = m.get(src); if (!i) { i = new Image(); i.onload = () => LIVE.wake(); i.src = src; m.set(src, i); } return i; }; })();
    const NOTE = "art/ideas/scrap.png", KEY = "art/wall/i_key.png", KEY_ANCHOR = [8, 8], cv = document.createElement("canvas"); cv.width = 33; cv.height = 56; const g = cv.getContext("2d", { willReadFrequently: true });
    const scraps = () => (LIVE.map && LIVE.map.scraps) || [], hunts = () => (LIVE.map && LIVE.map.hunts) || [], levelOf = id => LIVE.map.levels.find(l => l.id === id);
    /* one hunt under way at a time; how long it's taken and how many hints, this browser's */
    const NOW_KEY = "hallway-hunt-now", localOf = id => { try { return JSON.parse(localStorage.getItem("hallway-hunt-" + id) || "null") || { start: Date.now(), hints: 0 }; } catch (e) { return { start: Date.now(), hints: 0 }; } }, keepLocal = (id, v) => { try { localStorage.setItem("hallway-hunt-" + id, JSON.stringify(v)); } catch (e) { /* only this visit */ } };
    let current = null, panel = null, hintShown = false; try { current = localStorage.getItem(NOW_KEY); } catch (e) { /* none */ }
    const huntNow = () => current && hunts().find(h => h.id === current), foundOf = h => { const p = prog(); return (p && p.get().hunts && p.get().hunts[h.id] && p.get().hunts[h.id].found) || []; }, doneOf = h => { const p = prog(); return !!(p && p.get().hunts && p.get().hunts[h.id] && p.get().hunts[h.id].done); };
    const clueNow = h => { const f = foundOf(h); return h.clues.findIndex((c, i) => !f.includes("c" + i)); };
    window.hallwayDoorTargets && (window.hallwayDoorTargets.lounge = () => {
        const p = prog(), st = p && p.get(); if (!st) return null; const done = Object.keys(st.hunts || {}).filter(k => st.hunts[k].done); if (!done.length && !st.key) return null;
        const t = window.RoomView && RoomView.special(LIVE.map, "8x6", 0); if (!t) return null; const items = [...t.room.items]; done.slice(0, 7).forEach((k, i) => items.push({ k: "hall", p: "trophy", x: i, y: 0, rot: 0, len: 3 })); return { room: { ...t.room, items }, facts: { ...t.facts, name: "Finders' Lounge" } };
    });

    /* ---------- on the floor ---------- */
    function flats() {
        const l = LIVE.floor, out = []; if (!l) return out;
        for (const s of scraps()) if (s.level === l.id) out.push({ src: NOTE, x: s.x, y: s.y, l, scrap: s });
        const h = huntNow(); if (h) { const i = clueNow(h), c = i >= 0 && h.clues[i]; if (c && c.level === l.id && c.art !== "none" && c.x !== undefined) out.push({ src: c.art === "key" ? KEY : NOTE, x: c.x, y: c.y, l, clue: c, hunt: h, idx: i }); }
        return out;
    }
    function drawFlat(c, ox, oy, nearer) {
        const w = LIVE.walker; if (!w) return;
        for (const f of flats()) { if ((f.x + f.y > w.x + w.y) !== nearer) continue; const im = img(f.src); if (!im.complete || !im.naturalWidth) continue; const z = LIVE.nodeZ(f.l, f.x, f.y) || 0, p = LIVE.mapPoint(f.x + .5, f.y + .5, z), X = Math.round(p[0]), Y = Math.round(p[1]), x0 = X - 16, y0 = Y - 50, W = im.naturalWidth, H = im.naturalHeight;
            g.clearRect(0, 0, 33, 56); g.imageSmoothingEnabled = false; g.drawImage(im, 16 - (W >> 1), 50 - (H >> 1)); LIVE.as({ x: f.x, y: f.y, z, l: f.l, dir: 2, frame: 0, st: null }, () => { LIVE.cutInFront(g, x0, y0); LIVE.tint(g); });
            c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; c.drawImage(cv, x0, y0); c.restore(); }
    }
    LIVE.add({ still: true, under: (c, ox, oy) => { drawFlat(c, ox, oy, false); drawRopes(c, ox, oy, false); }, over: (c, ox, oy) => { drawFlat(c, ox, oy, true); drawRopes(c, ox, oy, true); } });

    /* ---------- the night rope: the poles are in the picture, the rope is drawn here by the Hallway's own time; the Time list can't open it ---------- */
    function drawRopes(c, ox, oy, nearer) {
        const w = LIVE.walker, l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi().level); if (!l || !l.props) return; if (!w && nearer) return; const R = window.RopeBarrier; if (!R) return; const night = LIVE.realNight();
        for (const p of l.props) { if (p.k !== "rope" || !p.night) continue; if (w && (p.x + p.y > w.x + w.y) !== nearer) continue; const at = (fx, fy) => { const q = LIVE.mapPoint(fx, fy, LIVE.nodeZ(l, Math.floor(fx), Math.floor(fy)) || 0); return [Math.round(q[0]), Math.round(q[1])]; }, art = R.pixels({ x: p.x, y: p.y, len: p.len, rot: p.rot, noCard: p.noCard, part: night ? "hanging" : "rope" }, at);
            c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); for (const [X, Y, col] of art.list) { c.fillStyle = "rgb(" + col + ")"; c.fillRect(X, Y, 1, 1); } c.restore(); }
    }

    /* ---------- clicks ---------- */
    const paperSound = () => { try { if (localStorage.getItem("hallway-music") === "0") return; const C = window.AudioContext || window.webkitAudioContext, A = paperSound.a || (paperSound.a = new C()); if (A.state !== "running") A.resume().catch(() => {}); const n = A.createBufferSource(), b = A.createBuffer(1, A.sampleRate * .14, A.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2) * .16; n.buffer = b; const f = A.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2400; n.connect(f); f.connect(A.destination); n.start(); } catch (e) { /* silent */ } };
    function readScrap(s) { paperSound(); const p = prog(); if (p && !p.get().scraps.includes(s.id)) { p.save({ scraps: [...p.get().scraps, s.id] }); window.hwTrack("hallway_scrap"); } const b = el("div", "hw-paper"); b.appendChild(el("p", "", s.text)); win().open("Scrap", b); }
    function scrapList() { const p = prog(), got = (p ? p.get().scraps : []).map(id => scraps().find(s => s.id === id)).filter(Boolean), b = el("div", "hw-scraps"); if (!got.length) b.appendChild(el("p", "no", "Nothing yet. Keep your eyes on the floor.")); for (const s of got) b.appendChild(el("p", "got", s.text)); win().open("Scraps", b); }
    function solve(h, i) {
        paperSound(); const p = prog(), found = [...foundOf(h), "c" + i]; hintShown = false;
        /* a bookcase by the spot swings open */
        const c = h.clues[i], l = levelOf(c.level); if (l) for (const d of (l.doors || [])) { if (d.kind !== "book" || !c.px) continue; const a = d.axis === "x" ? LIVE.mapPoint(d.at + 1, d.line, LIVE.nodeZ(l, Math.floor(d.at), d.line) || 0) : LIVE.mapPoint(d.line, d.at - 1, LIVE.nodeZ(l, d.line, Math.floor(d.at) - 1) || 0); if (Math.abs(a[0] - c.px) < 34 && c.py < a[1] + 6 && c.py > a[1] - 96) window.__hallway && __hallway.setDoor && __hallway.setDoor(d, true, 15000); }
        const finished = found.filter(k => /^c\d+$/.test(k)).length >= h.clues.length;
        p.save({ hunts: { [h.id]: { found, done: finished } }, key: finished || p.get().key });
        window.hwTrack(finished ? "hallway_hunt_done" : "hallway_clue");
        if (finished) finish(h); else showPanel();
    }
    function finish(h) {
        closePanel(); try { localStorage.removeItem(NOW_KEY); } catch (e) { /* fine */ } current = null; const loc = localOf(h.id), mins = Math.max(1, Math.round((Date.now() - loc.start) / 60000)) + (loc.hints || 0) * 5, st = prog().get().hunts[h.id] || {}, b = el("div", "hw-won");
        b.appendChild(el("h4", "", h.name)); if (st.place) b.appendChild(el("div", "f", "Your place: " + st.place + (["th", "st", "nd", "rd"][st.place % 100 > 10 && st.place % 100 < 14 ? 0 : st.place % 10] || "th") + " to finish")); b.appendChild(el("div", "f", "Your time: " + mins + " mins" + (loc.hints ? ", " + loc.hints + (loc.hints === 1 ? " hint" : " hints") : "")));
        b.appendChild(el("h5", "", "What you get")); for (const t of ["The badge.", "A Finders' Lounge: a room only finishers can open, with a trophy per hunt.", "His key, on your Lost Property shelf and Mazer Card."]) b.appendChild(el("p", "", t)); win().open("Well found", b);
    }
    LIVE.onClick((px, py) => {
        const w = LIVE.walker;
        for (const f of flats()) { const z = LIVE.nodeZ(f.l, f.x, f.y) || 0, p = LIVE.mapPoint(f.x + .5, f.y + .5, z); if (Math.abs(px - p[0]) > 16 || Math.abs(py - p[1]) > 12) continue; const act = () => { if (f.scrap) readScrap(f.scrap); else solve(f.hunt, f.idx); }; if (Math.round(w.x) === f.x && Math.round(w.y) === f.y && !w.walking) { act(); return true; } if (LIVE.walkTo(f.l, f.x, f.y, act)) return true; act(); return true; }
        const h = huntNow(), i = h ? clueNow(h) : -1, c = i >= 0 && h.clues[i]; if (c && (c.art === "none" || c.x === undefined) && c.level === (LIVE.floor && LIVE.floor.id) && Math.hypot(px - c.px, py - c.py) < 18) { if (c.night && !LIVE.realNight()) { win().open(h.name, "<p>Not yet. It's not dark enough.</p>"); return true; } solve(h, i); return true; }
        /* a corner of paper with something behind it */
        const l = LIVE.floor; if (l) for (const q of (l.wallItems || [])) { if (!q.behind || !String(q.k).startsWith("i_peel")) continue; const t = q.axis === "y" ? [q.line, Math.floor(q.at)] : [Math.floor(q.at), q.line], z = LIVE.nodeZ(l, t[0], t[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, q.at, z + (q.h || 80)) : LIVE.mapPoint(q.at, q.line, z + (q.h || 80)); if (Math.abs(px - a[0]) > 20 || Math.abs(py - a[1]) > 26) continue; paperSound(); if (q.behind.kind === "note") { const b = el("div", "hw-paper"); b.appendChild(el("p", "", q.behind.text || "")); win().open("Behind the paper", b); return true; } if (q.behind.kind === "door" && LIVE.enterRoom) { const r = window.RoomView && RoomView.special(LIVE.map, q.behind.size, q.behind.n); if (r) LIVE.enterRoom(r, q.axis); return true; } return false; }
        /* the notice board */
        if (l) for (const q of (l.wallItems || [])) { if (q.k !== "i_board") continue; const t = q.axis === "y" ? [q.line, Math.floor(q.at)] : [Math.floor(q.at), q.line], z = LIVE.nodeZ(l, t[0], t[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, q.at, z + (q.h || 70)) : LIVE.mapPoint(q.at, q.line, z + (q.h || 70)); if (Math.abs(px - a[0]) < 30 && Math.abs(py - a[1]) < 30) { board(); return true; } }
        return false;
    });

    /* ---------- the clue on screen ---------- */
    function closePanel() { if (panel) { panel.remove(); panel = null; } }
    function showPanel() {
        closePanel(); const h = huntNow(); if (!h) return; const i = clueNow(h); if (i < 0) return; const c = h.clues[i], box = panel = el("div", "mr-window hw-clue"), bar = el("div", "mr-titlebar"), frame = el("div", "mr-frame hw-sheet-body"), x = el("button", "mr-close"), xi = el("img"); x.type = "button"; x.setAttribute("aria-label", "Close"); xi.src = "art/rooms/modal_topclose_x.png"; xi.alt = ""; x.appendChild(xi); x.addEventListener("click", closePanel); bar.append(el("h2", "", h.name), x); box.append(bar, frame);
        const lvl = levelOf(c.level); frame.appendChild(el("small", "", "Clue " + (i + 1) + " of " + h.clues.length + (lvl ? " - " + lvl.name : ""))); frame.appendChild(el("h4", "", c.title || "")); frame.appendChild(el("p", "", c.words || ""));
        if (hintShown && c.hint) frame.appendChild(el("p", "hint", c.hint)); else if (c.hint) { const b = el("button", "mr-btn", "Hint (+5 mins)"); b.type = "button"; b.addEventListener("click", () => { const l = localOf(h.id); l.hints = (l.hints || 0) + 1; keepLocal(h.id, l); hintShown = true; showPanel(); }); frame.appendChild(b); }
        box.addEventListener("pointerdown", e => e.stopPropagation()); (document.getElementById("stage") || document.body).appendChild(box);
    }
    function start(h) { current = h.id; try { localStorage.setItem(NOW_KEY, h.id); } catch (e) { /* only this visit */ } const l = localOf(h.id); keepLocal(h.id, l); hintShown = false; showPanel(); }
    function board() {
        const list = hunts(), b = el("div", "hunts"); if (!list.length) b.appendChild(el("p", "", "Nothing's pinned up just now.")); let w = null;
        for (const h of list) { const row = el("button", "h"); row.type = "button"; row.append(el("b", "", h.name), el("span", "", doneOf(h) ? "Found" : (h.clues || []).length + " clues")); row.addEventListener("click", () => { if (w) w.shut(); if (doneOf(h)) return; start(h); }); b.appendChild(row); }
        w = win().open("Hunts", b);
    }
    /* the page's buttons */
    function barButtons() { if (window.HallwayBar && !barButtons.done) { barButtons.done = true; HallwayBar.menuItem("Hunts", "Treasure hunts", board); HallwayBar.menuItem("Scraps", "What you've found", scrapList); return true; } if (barButtons.done) return true;
        const bar = document.getElementById("playBar"); if (!bar || bar.dataset.hunts) return !!bar; bar.dataset.hunts = "1"; const add = (t, title, fn) => { const b = el("button", "mr-btn", t); b.type = "button"; b.title = title; b.addEventListener("click", fn); bar.appendChild(b); return b; }; add("Hunts", "Treasure hunts", board); add("Scraps", "What you've found", scrapList); return true; }
    const wait = setInterval(() => { if (barButtons()) clearInterval(wait); }, 500);
    setTimeout(() => { if (huntNow()) showPanel(); }, 3000);
    window.HallwayHunts = { board, start, scrapList, solve, get current() { return huntNow(); } };
})();

/* Lost Property: one small thing goes missing each day, the same thing in the same place for everyone. Find it half hidden by the furniture, carry it to the desk, ring the bell.
   One hand-in a day; a missed day starts the run again. Kept in the browser, or on the account when signed in (progress.js). Also here: the site's own window for the things that open on the Hallway. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    /* the 23 spots Chris passed, by the tile next to the furniture that half hides them */
    const SPOTS = [["Ground", 58, 46], ["Ground", 75, 15], ["Ground", 83, 15], ["Ground", 91, 15], ["Floor 1", 71, -10], ["Floor 1", 151, -16], ["Floor 2", 60, -21], ["Ground", 94, -7], ["Ground", 73, 3], ["Ground", 86, 3], ["Floor 1", 36, -1], ["Floor 2", 20, 15], ["Floor 2", 26, 5], ["Floor 2", 26, 8], ["Ground", 96, -8], ["Ground", 78, 2], ["Ground", 67, 0], ["Floor 1", 83, -12], ["Ground", 71, 4], ["Ground", 74, 15], ["Ground", 82, 15], ["Ground", 84, 5], ["Ground", 58, 38]];
    const today = () => new Date().toISOString().slice(0, 10), yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const hashText = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const prog = () => window.HallwayProgress;
    let things = null, imgs = new Map(); const thingImg = f => { let i = imgs.get(f); if (!i) { i = new Image(); i.onload = () => LIVE.wake(); i.src = "art/ideas/lost/" + f; imgs.set(f, i); } return i; };
    fetch("art/ideas/lost.json").then(r => r.json()).then(j => { things = j; restoreCarry(); }).catch(() => { things = []; });
    /* today's: a spot that still works (tile still free, on a floor that's still there), and a thing, both from the date */
    function todays() {
        const map = LIVE.map; if (!map || !things || !things.length) return null; const day = today(), usable = [];
        for (const [floor, x, y] of (map.lostSpots || SPOTS)) { const l = map.levels.find(q => q.name === floor); if (!l) continue; if (!LIVE.tileFree(l)(x, y)) continue; usable.push({ l, x, y }); }
        if (!usable.length) return null; const h = hashText(day + "|lost");
        return { day, spot: usable[h % usable.length], thing: things[hashText(day + "|thing") % things.length] };
    }
    const handedToday = () => { const p = prog(); return !!(p && p.get() && p.get().lost && p.get().lost.day === today()); };
    const CARRY = "hallway-carrying";
    let carrying = null;
    function restoreCarry() { try { const c = JSON.parse(localStorage.getItem(CARRY) || "null"); if (c && c.day === today() && things.some(t => t.k === c.k)) setCarry(things.find(t => t.k === c.k)); else localStorage.removeItem(CARRY); } catch (e) { /* nothing carried */ } }
    function setCarry(t) { carrying = t; window.HallwayCarry.item = t ? thingImg(t.f) : null; try { if (t) localStorage.setItem(CARRY, JSON.stringify({ day: today(), k: t.k })); else localStorage.removeItem(CARRY); } catch (e) { /* only this visit */ } LIVE.wake(); }

    /* ---------- the thing on the floor: half hidden by whatever's in front of it ---------- */
    const cv = document.createElement("canvas"); cv.width = 33; cv.height = 56; const g = cv.getContext("2d", { willReadFrequently: true });
    function showing() { if (carrying || handedToday() || !LIVE.walker) return null; const t = todays(); if (!t || t.spot.l !== LIVE.floor) return null; return t; }
    function where(t) { const z = LIVE.nodeZ(t.spot.l, t.spot.x, t.spot.y) || 0, p = LIVE.mapPoint(t.spot.x + .5, t.spot.y + .5, z); return { z, X: Math.round(p[0]), Y: Math.round(p[1]) }; }
    function drawThing(c, ox, oy, nearer) {
        const t = showing(); if (!t) return; const im = thingImg(t.thing.f); if (!im.complete || !im.naturalWidth) return; const w = LIVE.walker, near = t.spot.x + t.spot.y > w.x + w.y; if (near !== nearer) return;
        const q = where(t), x0 = q.X - 16, y0 = q.Y - 50; g.clearRect(0, 0, 33, 56); g.imageSmoothingEnabled = false; g.drawImage(im, 16 - (im.naturalWidth >> 1), 50 - im.naturalHeight + 3);
        LIVE.as({ x: t.spot.x, y: t.spot.y, z: q.z, l: t.spot.l, dir: 2, frame: 0, st: null }, () => { LIVE.cutInFront(g, x0, y0); LIVE.tint(g); });
        c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; c.drawImage(cv, x0, y0);
    }
    LIVE.add({ under: (c, ox, oy) => drawThing(c, ox, oy, false), over: (c, ox, oy) => drawThing(c, ox, oy, true), still: true });
    /* drawn with the map's own paints, so it never needs a frame loop of its own */
    function pick() { const t = showing(); if (!t) return; setCarry(t.thing); if (window.Track && Track.event) Track.event("hallway_lost_found"); }
    LIVE.onClick((px, py) => {
        const t = showing(); if (t && t.thing) { const q = where(t), hw = (t.thing.w >> 1) + 3; if (Math.abs(px - q.X) <= hw && py <= q.Y + 5 && py >= q.Y - t.thing.h - 4) { const w = LIVE.walker; if (Math.round(w.x) === t.spot.x && Math.round(w.y) === t.spot.y && !w.walking) { pick(); return true; } if (LIVE.walkTo(t.spot.l, t.spot.x, t.spot.y, pick)) return true; return false; } }
        /* the bell, or anywhere on the counter: walk up to it */
        const desk = deskAt(px, py); if (desk) { const f = desk.front; if (LIVE.walkTo(desk.l, f[0], f[1], () => ringBell())) return true; ringBell(); return true; }
        return false;
    });
    function deskAt(px, py) {
        const l = LIVE.floor; if (!l) return null; for (const q of (l.wallItems || [])) { if (q.k !== "i_desk") continue; const def = (window.WALL_ITEMS || []).find(i => i.id === "i_desk"), o = Math.round(q.at - def.snapAt), z = LIVE.nodeZ(l, q.axis === "y" ? q.line : o + 1, q.axis === "y" ? o + 1 : q.line) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, o, z) : LIVE.mapPoint(o, q.line, z), b = q.axis === "y" ? LIVE.mapPoint(q.line, o + 5, z) : LIVE.mapPoint(o + 5, q.line, z); const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]); if (px < lo - 4 || px > hi + 4) continue; const t = (px - a[0]) / (b[0] - a[0]), y = a[1] + (b[1] - a[1]) * t; if (py > y + 4 || py < y - 44) continue; return { l, q, front: q.axis === "y" ? [q.line, o + 1] : [o + 1, q.line] }; }
        return null;
    }

    /* ---------- the bell and the ledger ---------- */
    function bellSound() { let A; try { if (localStorage.getItem("hallway-music") === "0") return; const C = window.AudioContext || window.webkitAudioContext; A = bellSound.a || (bellSound.a = new C()); if (A.state !== "running") A.resume().catch(() => {}); } catch (e) { return; } const t = A.currentTime + .01; for (const [f, v] of [[2093, .09], [3136, .05], [4186, .02]]) { const o = A.createOscillator(), h = A.createGain(); o.type = "sine"; o.frequency.value = f; h.gain.setValueAtTime(0, t); h.gain.linearRampToValueAtTime(v, t + .003); h.gain.exponentialRampToValueAtTime(.0005, t + 1.1); o.connect(h); h.connect(A.destination); o.start(t); o.stop(t + 1.15); } }
    function ringBell() {
        bellSound(); const p = prog(); if (!p) return; const st = p.get(), lost = st.lost || { day: "", streak: 0, shelf: [] }, day = today(); let justNow = null;
        if (carrying && lost.day !== day) { const streak = lost.day === yesterday() ? (lost.streak || 0) + 1 : 1, shelf = [...new Set([...(lost.shelf || []), carrying.k])]; justNow = carrying; p.save({ lost: { day, streak, shelf } }); setCarry(null); if (window.Track && Track.event) Track.event("hallway_lost_handed"); }
        ledger(justNow);
    }
    function ledger(justNow) {
        const st = prog().get(), lost = st.lost || { day: "", streak: 0, shelf: [] }, t = todays(), body = document.createElement("div"); body.className = "hw-ledger";
        const row = document.createElement("div"); row.className = "today"; const words = document.createElement("div"), head = document.createElement("b");
        const shownThing = justNow || (t && t.thing); if (shownThing) { const i = document.createElement("img"); i.src = "art/ideas/lost/" + shownThing.f; i.alt = ""; row.appendChild(i); }
        head.textContent = shownThing ? "Today: " + shownThing.name.toLowerCase() : "Nothing's gone missing today"; words.appendChild(head); words.appendChild(document.createElement("br"));
        words.appendChild(document.createTextNode(justNow || lost.day === today() ? "Handed in. Thank you." : carrying ? "You've got it. Ring the bell." : t ? "Last seen on " + t.spot.l.name + "." : "")); row.appendChild(words); body.appendChild(row);
        const run = lost.day === today() || lost.day === yesterday() ? (lost.streak || 0) : 0, s = document.createElement("div"); s.className = "streak"; s.textContent = "Days running: " + run; body.appendChild(s);
        const h5 = document.createElement("h5"); h5.textContent = "Your shelf"; body.appendChild(h5); const shelf = document.createElement("div"); shelf.className = "shelf"; for (const k of (lost.shelf || [])) { const th = (things || []).find(q => q.k === k); if (!th) continue; const i = document.createElement("img"); i.src = "art/ideas/lost/" + th.f; i.alt = th.name; i.title = th.name; shelf.appendChild(i); }
        if (st.key) { const i = document.createElement("img"); i.src = "art/wall/i_key.png"; i.alt = "The Caretaker's key"; i.title = "The Caretaker's key"; shelf.appendChild(i); }
        if (!shelf.children.length) { const em = document.createElement("span"); em.textContent = "Nothing yet."; shelf.appendChild(em); } body.appendChild(shelf);
        openWindow("Lost Property", body);
    }

    /* ---------- the site's window, on the Hallway; a bottom sheet on a phone ---------- */
    function openWindow(title, content) {
        const stage = document.getElementById("stage") || document.body, back = document.createElement("div"), win = document.createElement("div"), bar = document.createElement("div"), h = document.createElement("h2"), x = document.createElement("button"), xi = document.createElement("img"), frame = document.createElement("div");
        back.className = "mr-overlay hw-sheet"; back.setAttribute("role", "dialog"); back.setAttribute("aria-label", title); win.className = "mr-window"; bar.className = "mr-titlebar"; frame.className = "mr-frame hw-sheet-body"; h.textContent = title; x.className = "mr-close"; x.type = "button"; x.setAttribute("aria-label", "Close"); xi.src = "art/rooms/modal_topclose_x.png"; xi.alt = ""; x.appendChild(xi); bar.append(h, x);
        if (typeof content === "string") frame.innerHTML = content; else frame.appendChild(content); win.append(bar, frame); back.appendChild(win); stage.appendChild(back);
        const shut = () => { back.remove(); document.removeEventListener("keydown", key, true); }, key = e => { if (e.key === "Escape") { e.stopImmediatePropagation(); shut(); } };
        document.addEventListener("keydown", key, true); x.addEventListener("click", shut); back.addEventListener("pointerdown", e => e.stopPropagation()); back.addEventListener("click", e => { if (e.target === back) shut(); }); x.focus();
        return { shut, back };
    }
    window.HallwayWindow = { open: openWindow };

    /* ---------- carrying: the hand-item frames show the holding arm in bare skin; here it takes the sleeve's colours from the empty-handed frame, and the cup comes out ---------- */
    const lum = c => c[0] * .3 + c[1] * .59 + c[2] * .11, isSkin = c => c[0] > 150 && c[0] > c[1] + 15 && c[1] > c[2] + 8 && c[1] > 90 && c[2] < 170 && c[2] > 60, isCup = c => c[2] > c[0] + 12 && c[2] > 110;
    const fixed = new Map(), work = document.createElement("canvas"); work.width = 33; work.height = 56; const wx = work.getContext("2d", { willReadFrequently: true });
    const read = im => { wx.clearRect(0, 0, 33, 56); wx.drawImage(im, 0, 0); return wx.getImageData(0, 0, 33, 56); };
    function fixFrame(cur, ref) {
        const a = read(cur), r = read(ref).data, d = a.data, W = 33, H = 56, at = (b, x, y) => { const p = (y * W + x) * 4; return b[p + 3] > 128 ? [b[p], b[p + 1], b[p + 2]] : null; }, hist = new Map();
        for (let y = 20; y < 44; y++) for (let x = 0; x < W; x++) { const c = at(r, x, y); if (!c || isSkin(c) || lum(c) < 18 || lum(c) > 190) continue; const k = c.join(); hist.set(k, (hist.get(k) || 0) + 1); }
        const tones = [...hist.entries()].sort((p, q) => q[1] - p[1]).slice(0, 3).map(e => e[0].split(",").map(Number)).sort((p, q) => lum(p) - lum(q)); let cx = 0, cy = 0, n = 0; const cup = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = at(d, x, y); if (c && isCup(c)) { cx += x; cy += y; n++; cup.push([x, y]); } } if (n) { cx /= n; cy /= n; }
        if (tones.length) for (let y = 16; y < H; y++) for (let x = 0; x < W; x++) { const c = at(d, x, y); if (!c || !isSkin(c)) continue; const q = at(r, x, y); if (q && isSkin(q)) continue; if (n && Math.hypot(x - cx, y - cy) < 4.2) continue; const t = tones[lum(c) > 190 ? tones.length - 1 : lum(c) > 150 ? Math.min(1, tones.length - 1) : 0], p = (y * W + x) * 4; d[p] = t[0]; d[p + 1] = t[1]; d[p + 2] = t[2]; }
        const withCup = document.createElement("canvas"), empty = document.createElement("canvas"); withCup.width = empty.width = W; withCup.height = empty.height = H; withCup.getContext("2d").putImageData(a, 0, 0);
        for (const [x, y] of cup) d[(y * W + x) * 4 + 3] = 0;
        for (const [x, y] of cup) for (const [e, f] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + e, Y = y + f; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const p = (Y * W + X) * 4; if (d[p + 3] && lum([d[p], d[p + 1], d[p + 2]]) < 40 && !at(r, X, Y)) d[p + 3] = 0; }
        empty.getContext("2d").putImageData(a, 0, 0); return { withCup, empty, hand: n ? [Math.round(cx), Math.round(cy)] : null };
    }
    /* where the hand is when the frame doesn't say; facing away you partly hide what you carry */
    const HANDS = { 2: [24, 36], 3: [24, 36], 4: [9, 36], 5: [9, 36], 6: [10, 35], 7: [10, 35], 0: [23, 35], 1: [23, 35] };
    window.HallwayCarry = {
        item: null,
        draw(c, img, name, dir, avatarImg) {
            const base = name.replace("-crr", "").replace("-drk", ""), ref = avatarImg(base); if (!ref.complete || !ref.naturalWidth) { c.drawImage(img, 0, 0); return; }
            const key = img.src + "|" + ref.src; let f = fixed.get(key); if (!f) { try { f = fixFrame(img, ref); } catch (e) { f = { withCup: img, empty: img, hand: null }; } if (fixed.size > 200) fixed.clear(); fixed.set(key, f); }
            const it = this.item; if (!it || !name.includes("-crr-") || !it.complete || !it.naturalWidth) { c.drawImage(f.withCup, 0, 0); return; }
            const hd = f.hand || HANDS[dir] || HANDS[2], back = dir === 6 || dir === 0 || dir === 7 || dir === 1, put = () => c.drawImage(it, hd[0] - (it.naturalWidth >> 1), hd[1] - it.naturalHeight + 3);
            if (back) put(); c.drawImage(f.empty, 0, 0); if (!back) put();
        }
    };
    window.HallwayLost = { todays, ring: ringBell, get carrying() { return carrying; }, ledger: () => ledger(null), pick, SPOTS };
})();

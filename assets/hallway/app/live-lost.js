/* Lost Property: Hustle stands behind the desk. Walk up and he asks for help finding Furni Index items lost round the Hallway; bring them back one at a time, half hidden by the furniture, as many rounds as you like.
   What you bring back is kept in the browser, or on the account when signed in (progress.js). Also here: the site's own window for the things that open on the Hallway. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    /* the 23 spots Chris passed, by the tile next to the furniture that half hides them */
    const SPOTS = [["Ground", 58, 46], ["Ground", 75, 15], ["Ground", 83, 15], ["Ground", 91, 15], ["Floor 1", 71, -10], ["Floor 1", 151, -16], ["Floor 2", 60, -21], ["Ground", 94, -7], ["Ground", 73, 3], ["Ground", 86, 3], ["Floor 1", 36, -1], ["Floor 2", 20, 15], ["Floor 2", 26, 5], ["Floor 2", 26, 8], ["Ground", 96, -8], ["Ground", 78, 2], ["Ground", 67, 0], ["Floor 1", 83, -12], ["Ground", 71, 4], ["Ground", 74, 15], ["Ground", 82, 15], ["Ground", 84, 5], ["Ground", 58, 38]];
    const today = () => new Date().toISOString().slice(0, 10);
    const prog = () => window.HallwayProgress, ROUND_SIZE = 1, ROUND = "hallway-lost-round", CARRY = "hallway-carrying";
    let things = null, imgs = new Map(); const thingImg = f => { let i = imgs.get(f); if (!i) { i = new Image(); i.onload = () => LIVE.wake(); i.src = "art/ideas/lost/" + f; imgs.set(f, i); } return i; };
    fetch("art/ideas/lost.json").then(r => r.json()).then(j => { things = j; restore(); }).catch(() => { things = []; });
    /* a round: a handful of lost things, each with a spot that still works, brought back one at a time. Kept in this browser; what you've handed in goes in your progress */
    let round = null, carrying = null;
    const spots = () => { const map = LIVE.map, out = []; if (!map) return out; for (const [floor, x, y] of (map.lostSpots || SPOTS)) { const l = map.levels.find(q => q.name === floor); if (l && LIVE.tileFree(l)(x, y)) out.push({ l, x, y }); } return out; };
    const shuffled = list => { const o = [...list]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
    const saveRound = () => { try { if (round) localStorage.setItem(ROUND, JSON.stringify({ items: round.items.map(q => ({ k: q.thing.k, floor: q.spot.l.name, x: q.spot.x, y: q.spot.y })), at: round.at })); else localStorage.removeItem(ROUND); } catch (e) { /* this visit only */ } };
    function newRound() { const sp = shuffled(spots()), th = shuffled(things || []), n = Math.min(ROUND_SIZE, sp.length, th.length); if (!n) return false; round = { items: [], at: 0 }; for (let i = 0; i < n; i++) round.items.push({ thing: th[i], spot: sp[i] }); saveRound(); return true; }
    function restore() { try { const r = JSON.parse(localStorage.getItem(ROUND) || "null"); const wait = setInterval(() => { if (!LIVE.map) return; clearInterval(wait); if (r) { const items = r.items.map(q => { const l = LIVE.map.levels.find(v => v.name === q.floor), thing = things.find(t => t.k === q.k); return l && thing ? { thing, spot: { l, x: q.x, y: q.y } } : null; }).filter(Boolean); if (items.length) round = { items, at: Math.min(r.at, items.length) }; } const c = localStorage.getItem(CARRY), t = c && things.find(q => q.k === c); if (t) setCarry(t); }, 200); } catch (e) { /* start afresh */ } }
    function setCarry(t) { carrying = t; window.HallwayCarry.item = t ? thingImg(t.f) : null; try { if (t) localStorage.setItem(CARRY, t.k); else localStorage.removeItem(CARRY); } catch (e) { /* only this visit */ } LIVE.wake(); }
    const wanted = () => round && round.items[round.at] || null;

    /* ---------- the thing on the floor: half hidden by whatever's in front of it ---------- */
    const cv = document.createElement("canvas"); cv.width = 33; cv.height = 56; const g = cv.getContext("2d", { willReadFrequently: true });
    function showing() { if (carrying || !LIVE.walker) return null; const t = wanted(); if (!t || t.spot.l !== LIVE.floor) return null; return t; }
    function where(t) { const z = LIVE.nodeZ(t.spot.l, t.spot.x, t.spot.y) || 0, p = LIVE.mapPoint(t.spot.x + .5, t.spot.y + .5, z); return { z, X: Math.round(p[0]), Y: Math.round(p[1]) }; }
    function drawThing(c, ox, oy, nearer) {
        const t = showing(); if (!t) return; const im = thingImg(t.thing.f); if (!im.complete || !im.naturalWidth) return; const w = LIVE.walker, near = t.spot.x + t.spot.y > w.x + w.y; if (near !== nearer) return;
        const q = where(t), x0 = q.X - 16, y0 = q.Y - 50; g.clearRect(0, 0, 33, 56); g.imageSmoothingEnabled = false; g.drawImage(im, 16 - (im.naturalWidth >> 1), 50 - im.naturalHeight + 3);
        LIVE.as({ x: t.spot.x, y: t.spot.y, z: q.z, l: t.spot.l, dir: 2, frame: 0, st: null }, () => { LIVE.cutInFront(g, x0, y0); LIVE.tint(g); });
        c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; c.drawImage(cv, x0, y0); c.restore();
    }
    LIVE.add({ under: (c, ox, oy) => { drawThing(c, ox, oy, false); drawHustle(c, ox, oy); }, over: (c, ox, oy) => { drawThing(c, ox, oy, true); placeBubbles(); }, still: true });
    function pick() { const t = showing(); if (!t) return; setCarry(t.thing); window.hwTrack("hallway_lost_found"); say("You", "Got it! That's the " + t.thing.name.toLowerCase() + "."); }
    LIVE.onClick((px, py) => {
        const t = showing(); if (t && t.thing) { const q = where(t), hw = (t.thing.w >> 1) + 3; if (Math.abs(px - q.X) <= hw && py <= q.Y + 5 && py >= q.Y - t.thing.h - 4) { const w = LIVE.walker; if (Math.round(w.x) === t.spot.x && Math.round(w.y) === t.spot.y && !w.walking) { pick(); return true; } if (LIVE.walkTo(t.spot.l, t.spot.x, t.spot.y, pick)) return true; return false; } }
        /* the counter, the bell or Hustle: walk up to him */
        const desk = deskAt(px, py); if (desk && repliesBox) return true; if (desk) { talked = false; if (standingAt(desk)) { talk(desk); return true; } const f = desk.front; if (LIVE.walkTo(desk.l, f[0], f[1], () => talk(desk))) return true; return false; }
        return false;
    });
    function desks() { const l = LIVE.floor, out = []; if (!l) return out; const def = (window.WALL_ITEMS || []).find(i => i.id === "i_desk"); if (!def) return out; for (const q of (l.wallItems || [])) { if (q.k !== "i_desk") continue; const o = Math.round(q.at - def.snapAt), tile = (back, along) => q.axis === "y" ? [q.line - back, o + along] : [o + along, q.line - back]; out.push({ l, q, o, front: tile(-0, 1), fronts: [0, 1, 2, 3, 4].map(k => tile(0, k)), npc: tile(2, 1), dir: q.axis === "y" ? 2 : 4 }); } return out; }
    function deskAt(px, py) {
        for (const d of desks()) { const q = d.q, z = LIVE.nodeZ(d.l, d.front[0], d.front[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, d.o, z) : LIVE.mapPoint(d.o, q.line, z), b = q.axis === "y" ? LIVE.mapPoint(q.line, d.o + 5, z) : LIVE.mapPoint(d.o + 5, q.line, z), lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]); if (px < lo - 4 || px > hi + 4) continue; const t = (px - a[0]) / (b[0] - a[0]), y = a[1] + (b[1] - a[1]) * t; if (py > y + 4 || py < y - 72) continue; return d; }
        return null;
    }
    const standingAt = d => { const w = LIVE.walker; return !!w && !w.walking && d.fronts.some(t => t[0] === Math.round(w.x) && t[1] === Math.round(w.y)) && w.l === d.l; };

    /* ---------- Hustle, behind the counter. His look is saved in art/npc/hustle, so it never changes ---------- */
    const npcCv = document.createElement("canvas"); npcCv.width = 33; npcCv.height = 56; const ng = npcCv.getContext("2d", { willReadFrequently: true });
    const npcImg = dir => { const f = "art/npc/hustle/s-" + dir + "-std-0.png"; let i = imgs.get(f); if (!i) { i = new Image(); i.onload = () => LIVE.wake(); i.src = f; imgs.set(f, i); } return i; };
    function drawHustle(c, ox, oy) {
        if (!LIVE.walker) return; for (const d of desks()) { const im = npcImg(d.dir); if (!im.complete || !im.naturalWidth) continue; const S = LIVE.graphLevels.find(q => q.stair && q.stair.lost && q.stair.low === d.l && q.stair.lost.o === d.o), z = LIVE.nodeZ(d.l, d.front[0], d.front[1]) || 0, p = LIVE.mapPoint(d.npc[0] + .5, d.npc[1] + .5, z), X = Math.round(p[0]), Y = Math.round(p[1]), x0 = X - 16, y0 = Y - 50;
            ng.clearRect(0, 0, 33, 56); ng.drawImage(im, 0, 0); if (S) LIVE.as({ x: d.npc[0], y: d.npc[1], z, l: S, dir: d.dir, frame: 0, st: null }, () => { LIVE.cutInFront(ng, x0, y0); LIVE.tint(ng); });
            c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; c.drawImage(npcCv, x0, y0); c.restore(); d.head = [X, y0 + 6]; lastHead = d.head; lastHeadAt = d; }
    }
    let lastHead = null, lastHeadAt = null;

    /* ---------- speech bubbles, as the game's: white, rounded, the speaker's name first, the newest at the bottom, the old ones pushed up ---------- */
    let bubbleBox = null; const bubbles = [];
    function say(who, text) { const stage = document.getElementById("stage") || document.body; if (!bubbleBox) { bubbleBox = document.createElement("div"); bubbleBox.className = "hw-bubbles"; stage.appendChild(bubbleBox); } const b = document.createElement("div"); b.className = "hw-bubble"; const n = document.createElement("b"); n.textContent = who + ": "; b.append(n, document.createTextNode(text)); bubbleBox.appendChild(b); bubbles.push({ el: b, at: performance.now() }); while (bubbles.length > 4) bubbles.shift().el.remove(); placeBubbles(); LIVE.wake(); }
    function placeBubbles() { if (!bubbleBox) return; const now = performance.now(); while (bubbles.length && now - bubbles[0].at > 30000) bubbles.shift().el.remove(); if (!bubbles.length || !lastHead) { bubbleBox.hidden = !bubbles.length; if (!lastHead) return; } bubbleBox.hidden = false; const v = LIVE.view(), cvs = document.getElementById("view"), r = cvs.getBoundingClientRect(), hostR = bubbleBox.parentNode.getBoundingClientRect(), sx = r.width / v.w * LIVE.zoom, sy = r.height / v.h * LIVE.zoom; bubbleBox.style.transform = "translate(-50%, -100%) scale(" + (LIVE.zoom >= 2 ? 2 : 1) + ")"; { const sc = LIVE.zoom >= 2 ? 2 : 1, half = Math.min(bubbleBox.offsetWidth * sc, r.width) / 2, x = r.left - hostR.left + (lastHead[0] - v.x0) * sx, lo = r.left - hostR.left + half + 4, hi = r.left - hostR.left + r.width - half - 4; bubbleBox.style.left = Math.round(Math.max(lo, Math.min(hi, x))) + "px"; } bubbleBox.style.top = Math.round(r.top - hostR.top + (lastHead[1] - v.y0) * sy) + "px"; }
    let repliesBox = null;
    function replies(list) { closeReplies(); const stage = document.getElementById("stage") || document.body; repliesBox = document.createElement("div"); repliesBox.className = "hw-replies"; repliesBox.setAttribute("role", "group"); repliesBox.setAttribute("aria-label", "Reply to Hustle"); repliesBox.addEventListener("pointerdown", e => e.stopPropagation()); for (const [text, fn] of list) { const b = document.createElement("button"); b.type = "button"; b.className = "mr-btn btn small"; b.textContent = text; b.addEventListener("click", () => { closeReplies(); say("You", text); setTimeout(fn, 500); }); repliesBox.appendChild(b); } document.body.appendChild(repliesBox); }
    function closeReplies() { if (repliesBox) { repliesBox.remove(); repliesBox = null; } }
    const ding = () => { let A; try { if (localStorage.getItem("hallway-music") === "0") return; const C = window.AudioContext || window.webkitAudioContext; A = ding.a || (ding.a = new C()); if (A.state !== "running") A.resume().catch(() => {}); } catch (e) { return; } const t = A.currentTime + .01; for (const [f, v] of [[2093, .09], [3136, .05], [4186, .02]]) { const o = A.createOscillator(), h = A.createGain(); o.type = "sine"; o.frequency.value = f; h.gain.setValueAtTime(0, t); h.gain.linearRampToValueAtTime(v, t + .003); h.gain.exponentialRampToValueAtTime(.0005, t + 1.1); o.connect(h); h.connect(A.destination); o.start(t); o.stop(t + 1.15); } };
    const H = "Hustle", asking = t => "It's the " + t.thing.name.toLowerCase() + ". It's somewhere in the Hallway.";
    const totalIn = () => { const p = prog(), l = p && p.get().lost; return (l && l.streak) || 0; };
    function startRound() { if (!newRound()) { say(H, "Actually, I can't think of anything missing right now. Come back in a bit."); return; } const t = wanted(); say(H, "Thank you! " + asking(t)); chatMenu(); }
    function chatMenu() { const list = []; if (wanted() && !carrying) { list.push(["I'm on it", () => say(H, "Good luck. Mind the rats.")]); list.push(["What was it again?", () => { const t = wanted(); if (t) { say(H, asking(t)); chatMenu(); } }]); list.push(["Ask for a different one", () => { const t = round.items[round.at], sp = shuffled(spots()), th = shuffled(things).filter(q => !round.items.some(v => v.thing === q)); if (sp[0] && th[0]) { round.items[round.at] = { thing: th[0], spot: sp[0] }; saveRound(); say(H, "Fine, forget that one. " + asking(round.items[round.at])); } chatMenu(); }]); } list.push(["See my shelf", () => { ledger(); chatMenu(); }]); replies(list); }
    let talked = false;
    function talk(d) {
        talked = true; ding();
        if (carrying) { const p = prog(), st = p && p.get(), lost = (st && st.lost) || { shelf: [] }, total = (lost.streak || 0) + 1, got = carrying; if (p) p.save({ lost: { day: today(), streak: total, shelf: [...new Set([...(lost.shelf || []), got.k])] } }); setCarry(null); window.hwTrack("hallway_lost_handed"); if (round) { round.at++; saveRound(); } say(H, "The " + got.name.toLowerCase() + "! That's going straight back in the index. Thank you."); const t = wanted(); if (t) { setTimeout(() => { say(H, asking(t)); chatMenu(); }, 1100); } else { round = null; saveRound(); setTimeout(() => { say(H, "You've brought back " + total + " so far. Got time to find another?"); replies([["Go on then", startRound], ["See my shelf", () => { ledger(); replies([["Go on then", startRound], ["Not right now", () => say(H, "No problem. I'll be here.")]]); }], ["Not right now", () => say(H, "No problem. I'll be here.")]]); }, 1100); } return; }
        if (wanted()) { say(H, "Any luck? " + asking(wanted())); chatMenu(); return; }
        say(H, totalIn() ? "Back again? More of the Furni Index items have gone missing in the Maze Rats Hallway!" : "Can you help me? Some of the Furni Index items have been lost in the Maze Rats Hallway!");
        replies([["Of course, what's missing?", startRound], ["See my shelf", () => { ledger(); replies([["Of course, what's missing?", startRound], ["Not right now", () => say(H, "No problem. I'll be here.")]]); }], ["Not right now", () => say(H, "No problem. I'll be here.")]]);
    }
    /* walking up to the front of the desk starts it; walking off ends the chat */
    setInterval(() => { const w = LIVE.walker; if (!w || document.hidden) return; const near = desks().find(standingAt); if (near && !talked) talk(near); if (!near && !w.walking) { const anyClose = desks().some(d => Math.abs(d.front[0] - w.x) + Math.abs(d.front[1] - w.y) < 8); if (!anyClose) { talked = false; closeReplies(); } } if (!near && w.walking && repliesBox) closeReplies(); if (!near && !w.walking) talked = talked && desks().some(standingAt); }, 300);

    function ledger() {
        const st = prog().get(), lost = st.lost || { shelf: [] }, t = wanted(), body = document.createElement("div"); body.className = "hw-ledger";
        const row = document.createElement("div"); row.className = "today"; const words = document.createElement("div"), head = document.createElement("b"), shownThing = carrying || (t && t.thing); if (shownThing) { const i = document.createElement("img"); i.src = "art/ideas/lost/" + shownThing.f; i.alt = ""; row.appendChild(i); }
        head.textContent = shownThing ? "Now: " + shownThing.name.toLowerCase() : "Nothing to find just now"; words.appendChild(head); words.appendChild(document.createElement("br")); words.appendChild(document.createTextNode(carrying ? "You've got it. Take it to Hustle." : t ? "Somewhere in the Hallway." : "Ask Hustle at the desk.")); row.appendChild(words); body.appendChild(row);
        const s = document.createElement("div"); s.className = "streak"; s.textContent = "Brought back: " + (lost.streak || 0); body.appendChild(s);
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
    window.HallwayLost = { wanted, talk, newRound, get carrying() { return carrying; }, get round() { return round; }, desks, ledger, pick, SPOTS };
})();

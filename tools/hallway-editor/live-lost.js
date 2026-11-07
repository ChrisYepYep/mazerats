/* Lost Property: hustle stands behind the desk. Walk up and he asks for help finding Furni Index items lost round the Hallway; bring them back one at a time, half hidden by the furniture, as many rounds as you like.
   What you bring back is kept in the browser, or on the account when signed in (progress.js). Also here: the site's own window for the things that open on the Hallway. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    /* the 23 spots Chris passed, by the tile next to the furniture that half hides them */
    const SPOT_KIND = ["sofa", "sofa", "sofa", "sofa", "sofa", "sofa", "sofa", "chair", "chair", "chair", "chair", "chair", "chair", "chair", "table", "table", "table", "table", "planter", "planter", "planter", "planter", "steps"];
    const SPOTS = [["Ground", 58, 46], ["Ground", 75, 15], ["Ground", 83, 15], ["Ground", 91, 15], ["Floor 1", 71, -10], ["Floor 1", 151, -16], ["Floor 2", 60, -21], ["Ground", 94, -7], ["Ground", 73, 3], ["Ground", 86, 3], ["Floor 1", 36, -1], ["Floor 2", 20, 15], ["Floor 2", 26, 5], ["Floor 2", 26, 8], ["Ground", 96, -8], ["Ground", 78, 2], ["Ground", 67, 0], ["Floor 1", 83, -12], ["Ground", 71, 4], ["Ground", 74, 15], ["Ground", 82, 15], ["Ground", 84, 5], ["Ground", 58, 38]];
    const today = () => new Date().toISOString().slice(0, 10);
    const prog = () => window.HallwayProgress, ROUND_SIZE = 1, ROUND = "hallway-lost-round", CARRY = "hallway-carrying";
    /* the clock and the points (8 Nov 2026, the owner's: a 15-minute limit to find each one, and a score). The board's own points come from netlify/functions/hallway-lost.js, on its clock; these are what the page shows meanwhile, worked out the same way */
    const LIMIT_MS = 15 * 60e3, MIN_SECS = 20, LOSTFN = "/.netlify/functions/hallway-lost";
    const pointsFor = (secs, hints) => { const s = Math.max(MIN_SECS, secs); if (s * 1000 > LIMIT_MS + 20e3) return 0; return Math.round((100 + 900 * Math.max(0, 1 - Math.min(s * 1000, LIMIT_MS) / LIMIT_MS)) / 10) * 10 + 150 * Math.max(0, 3 - (hints | 0)); };
    const lostPost = body => { const p = prog(); if (!p || !p.signedIn) return Promise.resolve(null); return fetch(LOSTFN, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }).then(r => r.ok ? r.json() : null).catch(() => null); };
    let carryPts = 0;
    let things = null, imgs = new Map(); const thingImg = f => { let i = imgs.get(f); if (!i) { i = new Image(); let tries = 0; i.onload = () => LIVE.wake(); i.onerror = () => { if (++tries <= 6) setTimeout(() => { i.src = "art/ideas/lost/" + f + "?r=" + tries; }, 1500 * tries); }; i.src = "art/ideas/lost/" + f; imgs.set(f, i); } return i; };
    fetch("art/ideas/lost.json").then(r => r.json()).then(j => { things = j.filter(t => t && t.name && t.name.trim()); restore(); }).catch(() => { things = []; });
    /* a round: a handful of lost things, each with a spot that still works, brought back one at a time. Kept in this browser; what you've handed in goes in your progress */
    let round = null, carrying = null;
    const spots = () => { const map = LIVE.map, out = []; if (!map) return out; (map.lostSpots || SPOTS).forEach(([floor, x, y], i) => { const l = map.levels.find(q => q.name === floor); if (l && l.k >= 0 && LIVE.tileFree(l)(x, y)) out.push({ l, x, y, kind: SPOT_KIND[i] }); }); return out; };
    /* how much of a thing shows at a spot, with whatever stands in front of it cut away: null until the furniture's pictures are in */
    const vis = document.createElement("canvas"); vis.width = 33; vis.height = 56; const vg = vis.getContext("2d", { willReadFrequently: true });
    function showsAt(spot, thing) { const im = thingImg(thing.f); if (!im.complete || !im.naturalWidth) return null; const z = LIVE.nodeZ(spot.l, spot.x, spot.y) || 0, p = LIVE.mapPoint(spot.x + .5, spot.y + .5, z), x0 = Math.round(p[0]) - 16, y0 = Math.round(p[1]) - 50, count = () => { const d = vg.getImageData(0, 0, 33, 56).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n; };
        vg.clearRect(0, 0, 33, 56); vg.drawImage(im, 16 - (im.naturalWidth >> 1), 50 - im.naturalHeight + 3); const all = count(); if (!all) return null; LIVE.as({ x: spot.x, y: spot.y, z, l: spot.l, dir: 2, frame: 0, st: null }, () => LIVE.cutInFront(vg, x0, y0)); return count() / all; }
    const shuffled = list => { const o = [...list]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
    const saveRound = () => { try { if (round) localStorage.setItem(ROUND, JSON.stringify({ items: round.items.map(q => ({ k: q.thing.k, floor: q.spot.l.name, x: q.spot.x, y: q.spot.y, kind: q.spot.kind, hints: q.hints || 0, t0: q.t0 || Date.now() })), at: round.at })); else localStorage.removeItem(ROUND); } catch (e) { /* this visit only */ } };
    /* a spot where between a fifth and four fifths of the thing shows. If the pictures it's judged by aren't in yet, the first spot does for now and it's checked again once they are (recheck) */
    function choose(th, notSpot) { const sp = shuffled(spots()).filter(q => !notSpot || q.x !== notSpot.x || q.y !== notSpot.y || q.l !== notSpot.l); if (!sp.length || !th.length) return null;
        for (const spot of sp) for (const thing of th.slice(0, 6)) { const f = showsAt(spot, thing); if (f !== null && f >= .2 && f <= .85) return { thing, spot, hints: 0 }; }
        return { thing: th[0], spot: sp[0], hints: 0, check: true }; }
    function recheck(t) { if (!t || carrying || !t.check) return; const f = showsAt(t.spot, t.thing); if (f === null) return; t.check = false; if (f >= .2 && f <= .85 && LIVE.tileFree(t.spot.l)(t.spot.x, t.spot.y)) return; const again = choose([t.thing], t.spot); if (again && !again.check) { t.spot = again.spot; saveRound(); LIVE.wake(); } }
    function newRound() { const pick = choose(shuffled(things || [])); if (!pick) return false;
        pick.t0 = Date.now(); round = { items: [pick], at: 0 }; saveRound(); lostPost({ act: "start", k: pick.thing.k }); tick(); return true; }
    function restore() { try { const r = JSON.parse(localStorage.getItem(ROUND) || "null"); const wait = setInterval(() => { if (!LIVE.map) return; clearInterval(wait); if (r) { const items = r.items.map(q => { const l = LIVE.map.levels.find(v => v.name === q.floor), thing = things.find(t => t.k === q.k); return l && thing && l.k >= 0 ? { thing, spot: { l, x: q.x, y: q.y, kind: q.kind }, hints: q.hints || 0, t0: q.t0 || Date.now(), check: true } : null; }).filter(Boolean); if (items.length) round = { items, at: Math.min(r.at, items.length) }; } const c = localStorage.getItem(CARRY), t = c && things.find(q => q.k === c); if (t) { setCarry(t); carryPts = +localStorage.getItem(CARRY + "-pts") || 0; } tick(); }, 200); } catch (e) { /* start afresh */ } }
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
    function pick() { const t = showing(); if (!t) return; const secs = Math.round((Date.now() - (t.t0 || Date.now())) / 1000); carryPts = pointsFor(secs, t.hints); setCarry(t.thing); window.hwTrack("hallway_lost_found"); say("You", "Got it! That's the " + t.thing.name.toLowerCase() + ".", false); flash("+" + carryPts + " points", fmt(secs * 1000) + " to find" + (t.hints ? ", " + t.hints + (t.hints === 1 ? " clue" : " clues") : ", no clues")); lostPost({ act: "found", k: t.thing.k }).then(r => { if (r && typeof r.points === "number" && r.points) { carryPts = r.points; saveCarryPts(); } }); saveCarryPts(); tick(); }
    const saveCarryPts = () => { try { if (carrying) localStorage.setItem(CARRY + "-pts", String(carryPts)); else localStorage.removeItem(CARRY + "-pts"); } catch (e) { /* this visit */ } };
    LIVE.onClick((px, py) => {
        const t = showing(); if (t && t.thing) { const q = where(t), hw = (t.thing.w >> 1) + 3; if (Math.abs(px - q.X) <= hw && py <= q.Y + 5 && py >= q.Y - t.thing.h - 4) { const w = LIVE.walker; if (Math.round(w.x) === t.spot.x && Math.round(w.y) === t.spot.y && !w.walking) { pick(); return true; } if (LIVE.walkTo(t.spot.l, t.spot.x, t.spot.y, pick)) return true; return false; } }
        /* the counter, the bell or hustle: walk up to him */
        const desk = deskAt(px, py); if (desk && repliesBox) return true; if (desk) { talked = false; if (standingAt(desk)) { talk(desk); return true; } const f = desk.front; if (LIVE.walkTo(desk.l, f[0], f[1], () => talk(desk))) return true; return false; }
        return false;
    });
    function desks() { const l = LIVE.floor, out = []; if (!l) return out; const def = (window.WALL_ITEMS || []).find(i => i.id === "i_desk"); if (!def) return out; for (const q of (l.wallItems || [])) { if (q.k !== "i_desk") continue; const o = Math.round(q.at - def.snapAt), tile = (back, along) => q.axis === "y" ? [q.line - back, o + along] : [o + along, q.line - back]; out.push({ l, q, o, front: tile(-0, 1), fronts: [0, 1, 2, 3, 4].map(k => tile(0, k)), npc: tile(2, 1), dir: q.axis === "y" ? 2 : 4 }); } return out; }
    function deskAt(px, py) {
        for (const d of desks()) { const q = d.q, z = LIVE.nodeZ(d.l, d.front[0], d.front[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, d.o, z) : LIVE.mapPoint(d.o, q.line, z), b = q.axis === "y" ? LIVE.mapPoint(q.line, d.o + 5, z) : LIVE.mapPoint(d.o + 5, q.line, z), lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]); if (px < lo - 4 || px > hi + 4) continue; const t = (px - a[0]) / (b[0] - a[0]), y = a[1] + (b[1] - a[1]) * t; if (py > y + 4 || py < y - 72) continue; return d; }
        return null;
    }
    const standingAt = d => { const w = LIVE.walker; return !!w && !w.walking && d.fronts.some(t => t[0] === Math.round(w.x) && t[1] === Math.round(w.y)) && w.l === d.l; };

    /* ---------- hustle, behind the counter. His look is saved in art/npc/hustle, so it never changes ---------- */
    const npcCv = document.createElement("canvas"); npcCv.width = 33; npcCv.height = 56; const ng = npcCv.getContext("2d", { willReadFrequently: true });
    const npcImg = dir => { const f = "art/npc/hustle/s-" + dir + "-std-0.png"; let i = imgs.get(f); if (!i) { i = new Image(); i.onload = () => LIVE.wake(); i.src = f; imgs.set(f, i); } return i; };
    function drawHustle(c, ox, oy) {
        if (!LIVE.walker) return; for (const d of desks()) { const im = npcImg(d.dir); if (!im.complete || !im.naturalWidth) continue; const S = LIVE.graphLevels.find(q => q.stair && q.stair.lost && q.stair.low === d.l && q.stair.lost.o === d.o), z = LIVE.nodeZ(d.l, d.front[0], d.front[1]) || 0, p = LIVE.mapPoint(d.npc[0] + .5, d.npc[1] + .5, z), X = Math.round(p[0]), Y = Math.round(p[1]), x0 = X - 16, y0 = Y - 50;
            ng.clearRect(0, 0, 33, 56); ng.drawImage(im, 0, 0); if (S) LIVE.as({ x: d.npc[0], y: d.npc[1], z, l: S, dir: d.dir, frame: 0, st: null }, () => { LIVE.cutInFront(ng, x0, y0); LIVE.tint(ng); });
            c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; c.drawImage(npcCv, x0, y0); c.restore(); d.head = [X, y0 + 6]; lastHead = d.head; lastHeadAt = d; }
    }
    let lastHead = null, lastHeadAt = null;

    /* ---------- speech bubbles, as the game's: white, rounded, the speaker's name first, the newest at the bottom, the old ones pushed up.
       Each sits over its own speaker: yours over your Habbo, hustle's over hustle. What's said at the desk goes when you walk away from it ---------- */
    let bubbleBox = null; const bubbles = [];
    function say(who, text, atDesk) { const stage = document.getElementById("stage") || document.body; if (!bubbleBox) { bubbleBox = document.createElement("div"); bubbleBox.className = "hw-bubbles"; stage.appendChild(bubbleBox); } const b = document.createElement("div"); b.className = "hw-bubble"; const n = document.createElement("b"); n.textContent = who + ": "; b.append(n, document.createTextNode(text)); bubbleBox.appendChild(b); bubbles.push({ el: b, at: performance.now(), who: who === H ? "npc" : "you", desk: atDesk !== false }); while (bubbles.length > 3) bubbles.shift().el.remove(); placeBubbles(); LIVE.wake(); }
    function dropDeskBubbles() { for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].desk) { bubbles[i].el.remove(); bubbles.splice(i, 1); } if (bubbleBox && !bubbles.length) bubbleBox.hidden = true; }
    const youHead = () => { const w = LIVE.walker; if (!w || w.l !== LIVE.floor && !(w.l && w.l.stair)) return null; const p = LIVE.mapPoint(w.x + .5, w.y + .5, w.z); return [Math.round(p[0]), Math.round(p[1]) - 44 + (w.seat ? 8 : 0)]; };
    function placeBubbles() {
        if (!bubbleBox) return; const now = performance.now(); while (!repliesBox && bubbles.length && now - bubbles[0].at > 30000) bubbles.shift().el.remove();
        const heads = { npc: lastHead, you: youHead() }, last = bubbles[bubbles.length - 1], anchor = last ? heads[last.who] || heads.npc || heads.you : heads.npc;
        if (!bubbles.length && !repliesBox || !anchor) { bubbleBox.hidden = true; return; } bubbleBox.hidden = false;
        const v = LIVE.view(), cvs = document.getElementById("view"), r = cvs.getBoundingClientRect(), hostR = bubbleBox.parentNode.getBoundingClientRect(), sx = r.width / v.w * LIVE.zoom, sy = r.height / v.h * LIVE.zoom, sc = LIVE.zoom >= 2 && v.w >= 760 ? 2 : 1;
        const toX = h => r.left - hostR.left + (h[0] - v.x0) * sx, toY = h => r.top - hostR.top + (h[1] - v.y0) * sy, lo = r.left - hostR.left + 4, hi = r.left - hostR.left + r.width - 4;
        bubbleBox.style.transform = "translate(-50%, -100%) scale(" + sc + ")";
        const ax = Math.max(lo + 150 * sc, Math.min(hi - 150 * sc, toX(anchor))); bubbleBox.style.left = Math.round(ax) + "px";
        /* each bubble slides over to its own speaker, kept on screen */
        for (const q of bubbles) { const h = heads[q.who] || anchor, half = q.el.offsetWidth * sc / 2, x = Math.max(lo + half, Math.min(hi - half, toX(h))); q.el.style.transform = "translateX(" + Math.round((x - ax) / sc) + "px)"; }
        const rh = repliesBox ? repliesBox.offsetHeight + 6 : 0, bh = bubbleBox.offsetHeight * sc, bottom = Math.max(toY(anchor) - rh, r.top - hostR.top + bh + 6); bubbleBox.style.top = Math.round(bottom) + "px";
        if (repliesBox) { const half = repliesBox.offsetWidth / 2, x = Math.max(lo + half, Math.min(hi - half, toX(anchor))); repliesBox.style.left = Math.round(x) + "px"; repliesBox.style.top = Math.round(bottom + 4) + "px"; }
    }
    let repliesBox = null;
    function replies(list) { closeReplies(); const stage = document.getElementById("stage") || document.body; repliesBox = document.createElement("div"); repliesBox.className = "hw-replies hw-replies-under"; repliesBox.setAttribute("role", "group"); repliesBox.setAttribute("aria-label", "Reply to hustle"); repliesBox.addEventListener("pointerdown", e => e.stopPropagation()); for (const [text, fn] of list) { const b = document.createElement("button"); b.type = "button"; b.className = "mr-btn btn small"; b.textContent = text; b.addEventListener("click", () => { closeReplies(); say("You", text); setTimeout(fn, 500); }); repliesBox.appendChild(b); } (document.getElementById("stage") || document.body).appendChild(repliesBox); placeBubbles(); }
    function closeReplies() { if (repliesBox) { repliesBox.remove(); repliesBox = null; } }
    const ding = () => { let A; try { if (localStorage.getItem("hallway-music") === "0") return; const C = window.AudioContext || window.webkitAudioContext; A = ding.a || (ding.a = new C()); if (A.state !== "running") A.resume().catch(() => {}); } catch (e) { return; } const t = A.currentTime + .01; for (const [f, v] of [[2093, .09], [3136, .05], [4186, .02]]) { const o = A.createOscillator(), h = A.createGain(); o.type = "sine"; o.frequency.value = f; h.gain.setValueAtTime(0, t); h.gain.linearRampToValueAtTime(v, t + .003); h.gain.exponentialRampToValueAtTime(.0005, t + 1.1); o.connect(h); h.connect(A.destination); o.start(t); o.stop(t + 1.15); } };
    const H = "hustle", asking = t => "It's the " + t.thing.name.toLowerCase() + ". It's somewhere in the Hallway.";
    const totalIn = () => { const p = prog(), l = p && p.get().lost; return (l && l.streak) || 0; };
    function startRound() { if (!newRound()) { say(H, "Actually, I can't think of anything missing right now. Come back in a bit."); return; } const t = wanted(); say(H, "Thank you! " + asking(t)); chatMenu(); }
    const DOING = { sofa: "I was having a sit-down on one of the sofas before I made my way back here.", chair: "I sat down on a chair for a bit, to look at my notes.", table: "I put my things down on a table for a minute.", planter: "I stopped to look at the plants on the way.", steps: "I sat on some small steps to catch my breath." };
    const floorWords = l => l.k === 0 ? "the Ground floor" : l.name;
    function clue(t) {
        t.hints = (t.hints || 0) + 1; saveRound(); if (t.hints <= 3) lostPost({ act: "hint" }); const sp = t.spot;
        if (t.hints === 1) return "I'm fairly sure I was on " + floorWords(sp.l) + " when I lost it.";
        if (t.hints === 2) { const near = (sp.l.props || []).find(p => Math.abs(p.x - sp.x) <= 2 && Math.abs(p.y - sp.y) <= 2 && /^(sofa|chair|table|smtable|ero)/.test(p.k)), kind = sp.kind || (near ? (near.k === "sofa" ? "sofa" : near.k === "chair" ? "chair" : /table/.test(near.k) ? "table" : "planter") : "sofa"); return DOING[kind] || DOING.sofa; }
        if (t.hints === 3) { let best = null, bd = 1e9; for (const d of (sp.l.doors || [])) { const nm = d.name || (LIVE.doorName && LIVE.doorName(d)); if (!nm || d.spare) continue; d.__nm = nm; const dx = (d.axis === "x" ? d.at : d.line) - sp.x, dy = (d.axis === "x" ? d.line : d.at) - sp.y, dd = Math.hypot(dx, dy); if (dd < bd) { bd = dd; best = d; } } return best && bd < 30 ? "Oh, and I remember walking past the door to " + (best.__nm || best.name) + "." : "I didn't go far from there, I'm sure of that."; }
        return "That's honestly all I can remember. It's there somewhere!";
    }
    function chatMenu() { const list = []; if (wanted() && !carrying) { list.push(["I'm on it", () => say(H, "Good luck. Mind the rats.")]); list.push(["Any idea where it is?", () => { const t = wanted(); if (t) { say(H, clue(t)); chatMenu(); } }]); list.push(["What was it again?", () => { const t = wanted(); if (t) { say(H, asking(t)); chatMenu(); } }]); list.push(["Ask for a different one", () => { const th = shuffled(things).filter(q => !round.items.some(v => v.thing === q)); if (th[0]) { const again = choose(th); if (again) { again.t0 = Date.now(); round.items[round.at] = again; saveRound(); lostPost({ act: "start", k: again.thing.k }); tick(); } say(H, "Fine, forget that one. " + asking(round.items[round.at])); } chatMenu(); }]); } list.push(["See my shelf", () => { ledger(); chatMenu(); }]); replies(list); }
    let talked = false;
    function talk(d) {
        talked = true; ding();
        if (carrying) { const p = prog(), st = p && p.get(), lost = (st && st.lost) || { shelf: [] }, total = (lost.streak || 0) + 1, got = carrying; const pts = carryPts || 0, points = (lost.points || 0) + pts, best = Math.max(lost.best || 0, pts); if (p) p.save({ lost: { day: today(), streak: total, shelf: [...new Set([...(lost.shelf || []), got.k])], points, best, missed: lost.missed || 0 } }); carryPts = 0; saveCarryPts(); setCarry(null); window.hwTrack("hallway_lost_handed"); if (round) { round.at++; saveRound(); } say(H, "The " + got.name.toLowerCase() + "! That's going straight back in the index. Thank you." + (pts ? " That's " + pts + " points to you." : "")); const t = wanted(); if (t) { setTimeout(() => { say(H, asking(t)); chatMenu(); }, 1100); } else { round = null; saveRound(); setTimeout(() => { say(H, "You've brought back " + total + " so far. Got time to find another?"); replies([["Go on then", startRound], ["See my shelf", () => { ledger(); replies([["Go on then", startRound], ["Not right now", () => say(H, "No problem. I'll be here.")]]); }], ["Not right now", () => say(H, "No problem. I'll be here.")]]); }, 1100); } return; }
        if (wanted()) { say(H, "Any luck? " + asking(wanted())); chatMenu(); return; }
        say(H, totalIn() ? "Back again? More of the Furni Index items have gone missing in the Maze Rats Hallway!" : "Can you help me? Some of the Furni Index items have been lost in the Maze Rats Hallway!");
        replies([["Of course, what's missing?", startRound], ["See my shelf", () => { ledger(); replies([["Of course, what's missing?", startRound], ["Not right now", () => say(H, "No problem. I'll be here.")]]); }], ["Not right now", () => say(H, "No problem. I'll be here.")]]);
    }
    /* walking up to the front of the desk starts it; walking off ends the chat */
    setInterval(() => { const w = LIVE.walker; if (!w || document.hidden) return; const near = desks().find(standingAt); if (near && !talked) talk(near); if (!near && !w.walking) { const anyClose = desks().some(d => Math.abs(d.front[0] - w.x) + Math.abs(d.front[1] - w.y) < 8); if (!anyClose) { talked = false; closeReplies(); } } if (!near && w.walking && (repliesBox || bubbles.some(q => q.desk))) { closeReplies(); dropDeskBubbles(); } if (!near && !w.walking) talked = talked && desks().some(standingAt); }, 300);

    /* ---------- the clock on screen, and what happens when it runs out ---------- */
    const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    let hud = null, hudKey = "";
    let mapSeen = null;
    function tick() {
        const t = wanted(), stage = document.getElementById("stage") || document.body;
        if (t) { const l = t.spot.l, sig = (l.props || []).reduce((n, p) => n + p.x * 7 + p.y * 13 + p.k.length, 0) + "|" + (l.props || []).length + "|" + (l.wallItems || []).length; if (sig !== mapSeen) { mapSeen = sig; t.check = true; } }
        recheck(t);
        /* out of time: it's gone, a miss, and hustle will have another */
        if (t && !carrying && t.t0 && Date.now() - t.t0 > LIMIT_MS) { const name = t.thing.name.toLowerCase(), p = prog(), st = p && p.get(), lost = (st && st.lost) || {}; if (p) p.save({ lost: { ...lost, day: lost.day || today(), shelf: lost.shelf || [], missed: (lost.missed || 0) + 1 } }); round = null; saveRound(); window.hwTrack("hallway_lost_missed"); flash("Time's up", "Too slow: the " + name + " went missing for good. Ask hustle for another."); }
        const now = wanted(), show = !!(now || carrying) && !document.body.classList.contains("hw-screensaver");
        if (!show) { if (hud) hud.hidden = true; return; }
        if (!hud) { hud = document.createElement("button"); hud.type = "button"; hud.className = "hw-lost-hud"; hud.setAttribute("aria-label", "Lost Property: open your shelf"); hud.addEventListener("pointerdown", e => e.stopPropagation()); hud.addEventListener("click", () => ledger()); stage.appendChild(hud); }
        hud.hidden = false; const thing = carrying || now.thing, key = thing.k + (carrying ? "c" : "");
        if (key !== hudKey) { hudKey = key; hud.replaceChildren(); const i = document.createElement("img"); i.src = "art/ideas/lost/" + thing.f; i.alt = ""; const w = document.createElement("span"); w.className = "hw-lost-hud-words"; const a = document.createElement("small"), b = document.createElement("b"); w.append(a, b); hud.append(i, w); }
        const [small, big] = hud.querySelectorAll(".hw-lost-hud-words > *");
        if (carrying) { small.textContent = "Take it to hustle"; big.textContent = carryPts ? carryPts + " pts" : thing.name.toLowerCase(); hud.classList.remove("low", "very-low"); hud.classList.add("got"); return; }
        hud.classList.remove("got"); const left = LIMIT_MS - (Date.now() - now.t0); small.textContent = "Find the " + thing.name.toLowerCase(); big.textContent = fmt(left); hud.classList.toggle("low", left < 120e3); hud.classList.toggle("very-low", left < 30e3);
    }
    setInterval(() => { if (!document.hidden) tick(); }, 1000);
    /* a moment's note in the middle of the screen: the points for a find, or time running out */
    function flash(title, sub) { const stage = document.getElementById("stage") || document.body, f = document.createElement("div"); f.className = "hw-lost-flash"; f.setAttribute("role", "status"); const b = document.createElement("b"), s = document.createElement("span"); b.textContent = title; s.textContent = sub || ""; f.append(b, s); stage.appendChild(f); setTimeout(() => f.classList.add("out"), 3200); setTimeout(() => f.remove(), 3800); }

    /* ---------- the Lost Property window: the search on now, your record, every thing there is to find, and this week's best ---------- */
    function ledger() {
        const st = prog().get(), lost = st.lost || { shelf: [] }, body = document.createElement("div"); body.className = "hw-ledger hw-lp";
        const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
        const img = (th, scale) => { const i = el("img"); i.src = "art/ideas/lost/" + th.f; i.alt = th.name; if (th.w && th.h) { i.width = th.w * scale; i.height = th.h * scale; } return i; };
        /* the search on now */
        const now = el("div", "hw-lp-now"), t = wanted(), shown = carrying || (t && t.thing);
        const pic = el("div", "hw-lp-pic"); if (shown) pic.appendChild(img(shown, 2)); else pic.appendChild(el("span", "hw-lp-q", "?")); now.appendChild(pic);
        const words = el("div", "hw-lp-words"), live = el("div", "hw-lp-live"); now.appendChild(words);
        let timer = 0;
        if (carrying) words.append(el("small", "", "You've found it"), el("b", "", "The " + carrying.name.toLowerCase()), el("p", "", "Take it back to hustle at the desk to bank " + (carryPts || 0) + " points."));
        else if (t) { words.append(el("small", "", "Looking for"), el("b", "", "The " + t.thing.name.toLowerCase()), live); const upd = () => { const left = LIMIT_MS - (Date.now() - t.t0), secs = Math.round((Date.now() - t.t0) / 1000); live.replaceChildren(el("span", "hw-lp-clock" + (left < 120e3 ? " low" : ""), fmt(left) + " left"), el("span", "", "Clues " + Math.min(3, t.hints || 0) + " of 3"), el("span", "", "Worth " + pointsFor(secs, t.hints) + " points now")); }; upd(); timer = setInterval(upd, 1000); }
        else words.append(el("small", "", "Nothing to find just now"), el("b", "", "Ask hustle at the desk"), el("p", "", "Each thing has 15 minutes. Find it fast, without clues, for the most points."));
        body.appendChild(now);
        /* your record */
        const stats = el("div", "hw-lp-stats"); for (const [n, v] of [["Points", lost.points || 0], ["Best find", lost.best || 0], ["Brought back", lost.streak || 0], ["Missed", lost.missed || 0]]) { const s = el("div", "hw-lp-stat"); s.append(el("b", "", String(v)), el("small", "", n)); stats.appendChild(s); } body.appendChild(stats);
        /* two tabs: your shelf, and the week's board */
        const tabs = el("div", "hw-lp-tabs"), shelfTab = el("button", "on", "Your shelf"), boardTab = el("button", "", "This week's best"), pane = el("div", "hw-lp-pane"); shelfTab.type = boardTab.type = "button"; tabs.setAttribute("role", "tablist"); for (const b of [shelfTab, boardTab]) b.setAttribute("role", "tab"); tabs.append(shelfTab, boardTab); body.append(tabs, pane);
        const select = on => { for (const b of [shelfTab, boardTab]) { b.classList.toggle("on", b === on); b.setAttribute("aria-selected", String(b === on)); } };
        const showShelf = () => { select(shelfTab); pane.replaceChildren();
            const all = things || [], have = new Set(lost.shelf || []), count = all.filter(q => have.has(q.k)).length; pane.appendChild(el("p", "hw-lp-count", "Collected " + count + " of " + all.length));
            const shelf = el("div", "hw-lp-shelf"); for (const th of all) { const got = have.has(th.k), slot = el("div", "hw-lp-slot" + (got ? " got" : "")), i = img(th, 1); if (!got) i.alt = "Not found yet"; slot.title = got ? th.name : "Not found yet"; slot.appendChild(i); shelf.appendChild(slot); }
            if (st.key) { const slot = el("div", "hw-lp-slot got key"), i = el("img"); i.src = "art/wall/i_key.png"; i.alt = "The Caretaker's key"; slot.title = "The Caretaker's key"; slot.appendChild(i); shelf.appendChild(slot); }
            pane.appendChild(shelf); };
        const showBoard = () => { select(boardTab); pane.replaceChildren(el("p", "hw-lp-count", "Loading the board..."));
            fetch(LOSTFN, { credentials: "same-origin", headers: { Accept: "application/json" } }).then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))).then(b => {
                pane.replaceChildren(el("p", "hw-lp-count", "Monday to Sunday: points for everything found this week"));
                if (!b.rows.length) pane.appendChild(el("p", "hw-lp-empty", "Nobody's on the board yet this week. Be the first."));
                else { const tb = el("table", "hw-lp-board"), hd = el("tr"); for (const h of ["#", "Mazer", "Points", "Found", "Best"]) hd.appendChild(el("th", "", h)); tb.appendChild(hd); for (const r of b.rows) { const tr = el("tr"); for (const v of [r.rank, r.name || "A Mazer", r.points, r.finds, r.best]) tr.appendChild(el("td", "", String(v))); tb.appendChild(tr); } pane.appendChild(tb); }
                const p = prog(); pane.appendChild(el("p", "hw-lp-you", b.me ? "You: #" + b.me.rank + " with " + b.me.points + " points" : p && p.signedIn ? "Find something this week to get on the board. You need a nickname to appear." : "Sign in with a nickname to go on the board. Your points still count here, in this browser."));
            }).catch(() => pane.replaceChildren(el("p", "hw-lp-empty", "The board couldn't be reached just now."))); };
        shelfTab.addEventListener("click", showShelf); boardTab.addEventListener("click", showBoard); showShelf();
        const w = openWindow("Lost Property", body); w.back.classList.add("hw-lp-window");
        if (timer) { const stop = setInterval(() => { if (!w.back.isConnected) { clearInterval(timer); clearInterval(stop); } }, 1000); }
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

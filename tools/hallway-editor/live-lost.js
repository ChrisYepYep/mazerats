/* Lost Property (8 Nov 2026, the owner's, second round). hustle sits somewhere in the Hallway, wherever he's placed in the editor's Lost Property tab;
   walk up to him and he asks you to find a Furni Index item lost round the Hallway, half hidden by the furniture. The server picks what and where
   (netlify/functions/hallway-lost.js), keeps the clock and counts the clues. Pick it up, then hand it in at the Lost Property desk, whose book is
   your record of what you've turned in. Leave the Hallway mid-search and the search ends, no points and no miss: go back to hustle for another.
   What you've handed in is kept in the browser, or on the account when signed in (progress.js). Also here: the site's own window for the
   things that open on the Hallway, and the arm that carries things. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const PLAY = !!window.HALLWAY_PLAY;
    /* the first spots, by the tile next to the furniture that half hides them, kept for a map saved before the Lost Property tab */
    const OLD_SPOTS = [["Ground", 58, 46], ["Ground", 75, 15], ["Ground", 83, 15], ["Ground", 91, 15], ["Floor 1", 71, -10], ["Floor 1", 151, -16], ["Floor 2", 60, -21], ["Ground", 94, -7], ["Ground", 73, 3], ["Ground", 86, 3], ["Floor 1", 36, -1], ["Floor 2", 20, 15], ["Floor 2", 26, 5], ["Floor 2", 26, 8], ["Ground", 78, 2], ["Ground", 67, 0], ["Floor 1", 83, -12], ["Ground", 71, 4], ["Ground", 74, 15], ["Ground", 82, 15], ["Ground", 84, 5], ["Ground", 58, 38]];
    const today = () => new Date().toISOString().slice(0, 10);
    const prog = () => window.HallwayProgress, ROUND = "hallway-lost-round", CARRY = "hallway-carrying", VISITOR = "hallway-visitor";
    /* the clock and the points: the board's come from the server, on its clock; these are what the page shows meanwhile, worked out the same way */
    const LIMIT_MS = 15 * 60e3, MIN_SECS = 20, LOSTFN = "/.netlify/functions/hallway-lost";
    const pointsFor = (secs, hints) => { const s = Math.max(MIN_SECS, secs); if (s * 1000 > LIMIT_MS + 20e3) return 0; return Math.round((100 + 900 * Math.max(0, 1 - Math.min(s * 1000, LIMIT_MS) / LIMIT_MS)) / 10) * 10 + 150 * Math.max(0, 3 - (hints | 0)); };
    const visitor = () => { try { return localStorage.getItem(VISITOR) || undefined; } catch (e) { return undefined; } };
    /* every search goes through the server on the site, signed in or not; the editor on its own has no server, so it chooses for itself */
    const adminHeader = () => { try { const t = localStorage.getItem("mazerats_admin_token"); return t ? { "x-admin-token": t } : {}; } catch (e) { return {}; } };      // an admin walking it before it opens still saves (10 Nov scan, server finding 7)
    const lostPost = body => { if (!PLAY) return Promise.resolve(null); return fetch(LOSTFN, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json", ...adminHeader() }, body: JSON.stringify({ ...body, v: visitor() }) }).then(r => r.json().catch(() => ({})).then(j => r.ok ? j : { error: j.error || "status " + r.status, status: r.status, noSwaps: !!j.noSwaps })).catch(() => ({ error: "offline" })); };
    /* "ask for a different one": a few times a search, on the same clock, as the server allows (9 Nov scan, finding 2) */
    const MAX_SWAPS = 2;
    let carryPts = 0;
    let things = null, imgs = new Map(); const thingImg = f => { let i = imgs.get(f); if (!i) { i = new Image(); let tries = 0; i.onload = () => LIVE.wake(); i.onerror = () => { if (++tries <= 6) setTimeout(() => { i.src = "art/ideas/lost/" + f + "?r=" + tries; }, 1500 * tries); }; i.src = "art/ideas/lost/" + f; imgs.set(f, i); } return i; };
    if (PLAY && window.HallwayProgress) HallwayProgress.load();
    fetch("art/ideas/lost.json").then(r => r.json()).then(j => { things = j.filter(t => t && t.name && t.name.trim()); restore(); }).catch(() => { things = []; });
    let round = null, carrying = null;
    const KIND_OF = k => k === "sofa" || k === "ghsofa" ? "sofa" : k === "chair" || k === "ghchair" ? "chair" : /table/.test(k) ? "table" : /^ero/.test(k) ? "planter" : null;
    const tilesOf = p => window.FurniParts && FurniParts.tiles ? FurniParts.tiles(p) : [[p.x, p.y]];
    function kindAt(l, x, y) { let best = null, bd = 9; for (const p of (l.props || [])) { const kind = KIND_OF(p.k); if (!kind) continue; for (const [tx, ty] of tilesOf(p)) { const d = Math.max(Math.abs(tx - x), Math.abs(ty - y)); if (d <= 1 && (d < bd || (d === bd && best === "planter" && kind !== "planter"))) { bd = d; best = kind; } } } return best; }
    /* the spots, as the editor's Lost Property tab saves them in the map: { level, x, y, skip } (skip: the things that don't show well there) */
    /* both maps' floors and spots (12 Nov 2026, the Events Gallery): the server deals a spot from either, so a round may be in the other one */
    const rootOf = map => LIVE.root || map, allLevels = map => { const r = rootOf(map); return r ? [...(r.levels || []), ...((r.gallery && r.gallery.levels) || [])] : []; };
    const levelOf = (map, raw) => allLevels(map).find(q => raw.level !== undefined && raw.level !== null ? q.id === raw.level : q.name === raw.name);
    function mapSpots() { const map = LIVE.map; if (!map) return []; const r = rootOf(map); return [...(r.lostSpots || OLD_SPOTS), ...((r.gallery && r.gallery.lostSpots) || [])].map(s => { const raw = Array.isArray(s) ? { name: s[0], x: s[1], y: s[2] } : s, l = raw && levelOf(map, raw); if (!l || l.k < 0) return null; return { l, x: raw.x, y: raw.y, skip: raw.skip || [], raw }; }).filter(Boolean); }
    /* a spot can be under a table, a chair or a sofa (8 Nov 2026, his): you can't stand there, so it's picked up from a free tile beside it */
    const underFurni = spot => !LIVE.tileFree(spot.l)(spot.x, spot.y);
    const reachFrom = spot => { if (!underFurni(spot)) return [[spot.x, spot.y]]; const free = LIVE.tileFree(spot.l), out = []; for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (free(spot.x + i, spot.y + j)) out.push([spot.x + i, spot.y + j]); return out; };
    /* a spot nobody can pick up is never used (9 Nov scan, content finding 1: G 96,-8, under a table with a chair on every side). The server's
       spotsOf skips the same ones, worked out from the map (_hallway-map.js pickUpFrom); here the engine can also say whether the free tile is
       reached at all */
    const canPickUp = spot => { const r = LIVE.editorApi && LIVE.editorApi().lostSpotReachable; return r ? r(spot.l, spot.x, spot.y) : reachFrom(spot).length > 0; };
    /* small steps only where there are some (9 Nov scan, content finding 2: 11 spots with nothing near were told "I sat on some small steps"):
       a tile within 2 that a flight lifts. Anywhere else hint 2 says the neutral "I wandered about a bit" */
    const nearSteps = spot => { if (!(spot.l.steps || []).length || !LIVE.tileZ) return false; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const x = spot.x + i, y = spot.y + j, z = LIVE.nodeZ(spot.l, x, y); if (z !== undefined && z !== LIVE.tileZ(spot.l, x, y)) return true; } return false; };
    const kindOf = spot => kindAt(spot.l, spot.x, spot.y) || (nearSteps(spot) ? "steps" : null);
    /* how much of a thing shows at a spot, with whatever stands in front of it cut away: null until the pictures are in */
    const vis = document.createElement("canvas"); vis.width = 33; vis.height = 56; const vg = vis.getContext("2d", { willReadFrequently: true });
    function showsAt(spot, thing) { const im = thingImg(thing.f); if (!im.complete || !im.naturalWidth) return null; const z = LIVE.nodeZ(spot.l, spot.x, spot.y) || 0, p = LIVE.mapPoint(spot.x + .5, spot.y + .5, z), x0 = Math.round(p[0]) - 16, y0 = Math.round(p[1]) - 50, count = () => { const d = vg.getImageData(0, 0, 33, 56).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n; };
        vg.clearRect(0, 0, 33, 56); vg.drawImage(im, 16 - (im.naturalWidth >> 1), 50 - im.naturalHeight + 3); const all = count(); if (!all) return null; LIVE.as({ x: spot.x, y: spot.y, z, l: spot.l, dir: 2, frame: 0, st: null, under: underFurni(spot) }, () => LIVE.cutInFront(vg, x0, y0)); return count() / all; }
    const shuffled = list => { const o = [...list]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
    /* per tab (10 Nov scan, server finding 13): a second Hallway tab read it and cancelled the first tab's search */
    const saveRound = () => { try { if (round) sessionStorage.setItem(ROUND, "1"); else sessionStorage.removeItem(ROUND); } catch (e) { /* this visit only */ } };
    /* the editor on its own: a thing you haven't found, at a spot that suits it */
    function chooseHere(notK) { const sp = mapSpots().filter(s => LIVE.map.levels.includes(s.l)).filter(canPickUp), have = new Set(((prog() && prog().get().lost) || {}).shelf || []), all = (things || []).filter(t => t.k !== notK), fresh = all.filter(t => !have.has(t.k)); for (const t of shuffled(fresh.length ? fresh : all)) { const fit = sp.filter(s => !s.skip.includes(t.k)); if (fit.length) return { thing: t, spot: fit[Math.floor(Math.random() * fit.length)] }; } return null; }
    /* a search from the server's answer */
    function fromServer(r) { const map = LIVE.map, thing = things && things.find(t => t.k === r.k), l = map && levelOf(map, { level: r.spot.level, name: r.spot.name }); if (!thing || !l) return null; if (r.v) { try { localStorage.setItem(VISITOR, r.v); } catch (e) { /* only this visit */ } } if (r.name) myName = r.name; return { thing, spot: { l, x: r.spot.x, y: r.spot.y, skip: [] }, hints: r.hints | 0, t0: Date.now() - (LIMIT_MS - (typeof r.left === "number" ? r.left : LIMIT_MS)), swapsLeft: typeof r.swapsLeft === "number" ? r.swapsLeft : MAX_SWAPS, resumed: !!r.resumed }; }
    let myName = null;
    async function newSearch(swap) {
        let pick;
        if (PLAY) { const r = await lostPost({ act: swap ? "swap" : "start" }); if (!r || r.error) { if (r && r.noSwaps && round) { round.swapsLeft = 0; return "noswaps"; } return r && r.status === 429 ? "busy" : r && (r.error === "offline" || r.status >= 500) ? "offline" : null; } pick = fromServer(r);      // out of reach isn't "nothing missing" (15 Nov scan, live L7)
            /* a thing this page's list doesn't know (the two lists drifted apart): swapped for one it does, on the same clock (10 Nov scan, server finding 21) */
            if (!pick && r.swapsLeft > 0) { const r2 = await lostPost({ act: "swap" }); if (r2 && !r2.error) pick = fromServer(r2); } }
        else { const was = swap && wanted(); if (was && was.swapsLeft === 0) return "noswaps"; const c = chooseHere(was && was.thing.k); if (c) pick = { ...c, hints: 0, t0: was ? was.t0 : Date.now(), swapsLeft: was ? (was.swapsLeft === undefined ? MAX_SWAPS : was.swapsLeft) - 1 : MAX_SWAPS }; }
        if (!pick) return null; round = pick; saveRound(); window.hwTrack(swap ? "hallway_lost_swap" : "hallway_lost_start"); thingImg(pick.thing.f); tick(); LIVE.wake(); return pick;
    }
    /* coming back: a search you left has ended (his: go back to hustle). What you were carrying you still have. */
    function restore() { let polls = 0; const wait = setInterval(() => { if (!LIVE.map) { if (++polls > 600) clearInterval(wait); return; } clearInterval(wait);
        try { if (sessionStorage.getItem(ROUND)) { sessionStorage.removeItem(ROUND); lostPost({ act: "cancel" }); } try { localStorage.removeItem(ROUND); } catch (e) { /* the old shared flag */ } const c = localStorage.getItem(CARRY), t = c && things.find(q => q.k === c); if (t) { setCarry(t); carryPts = +localStorage.getItem(CARRY + "-pts") || 0; } } catch (e) { /* start afresh */ } tick(); }, 200); }
    /* leaving: the search ends on the server too */
    addEventListener("pagehide", () => { if (!round || !PLAY) return; try { const b = new Blob([JSON.stringify({ act: "cancel", v: visitor() })], { type: "application/json" }); navigator.sendBeacon(LOSTFN, b); } catch (e) { /* it ends when they next start one */ } });
    function setCarry(t) { carrying = t; window.HallwayCarry.item = t ? thingImg(t.f) : null; try { if (t) localStorage.setItem(CARRY, t.k); else localStorage.removeItem(CARRY); } catch (e) { /* only this visit */ } LIVE.wake(); }
    const wanted = () => round;

    /* ---------- what's in front of what: on your own floor, whatever's nearer the camera; across floors, the floor above is in front ---------- */
    function inFront(l, x, y) { const w = LIVE.walker; if (!w) return false; const wl = LIVE.floor || w.l; if (l === wl) return x + y > w.x + w.y; return (l.k || 0) > (wl.k || 0); }

    /* ---------- the thing on the floor: half hidden by whatever's in front of it, and seen from any floor (his: "it should always show") ---------- */
    const cv = document.createElement("canvas"); cv.width = 33; cv.height = 56; const g = cv.getContext("2d", { willReadFrequently: true });
    let preview = null, thingKey = "";          // the editor's Lost Property tab: { spot, thing } to look at
    function showing() { if (preview) return preview; if (carrying || !round) return null; return round; }
    function where(t) { const z = LIVE.nodeZ(t.spot.l, t.spot.x, t.spot.y) || 0, p = LIVE.mapPoint(t.spot.x + .5, t.spot.y + .5, z); return { z, X: Math.round(p[0]), Y: Math.round(p[1]) }; }
    function drawThing(c, ox, oy, nearer) {
        const t = showing(); if (!t) return; const im = thingImg(t.thing.f); if (!im.complete || !im.naturalWidth) return; if (inFront(t.spot.l, t.spot.x, t.spot.y) !== nearer) return;
        const q = where(t), x0 = q.X - 16, y0 = q.Y - 50, m = LIVE.mood(), key = [x0, y0, t.spot.l.id, im.src, LIVE.tileGen, m ? m.a + m.b + (Math.round((+m.f || 0) * 40) / 40) : "-", nearer].join("|");
        /* cut and tinted once for its spot, the map and the light as they are, not every frame (10 Nov scan) */
        if (key !== thingKey) { thingKey = key; g.clearRect(0, 0, 33, 56); g.imageSmoothingEnabled = false; g.drawImage(im, 16 - (im.naturalWidth >> 1), 50 - im.naturalHeight + 3);
            LIVE.as({ x: t.spot.x, y: t.spot.y, z: q.z, l: t.spot.l, dir: 2, frame: 0, st: null, under: underFurni(t.spot) }, () => { LIVE.cutInFront(g, x0, y0); LIVE.tint(g); }); }
        c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; c.drawImage(cv, x0, y0); c.restore();
    }

    /* ---------- hustle, sitting where he's been put (map.hustle: { level, x, y }, a chair or sofa tile). Before he's been put anywhere,
       the seat nearest the Lost Property desk. His look is saved in art/npc/hustle, so it never changes ---------- */
    const SEAT_LIFT = 3;
    const seatAt = (l, x, y) => (l.props || []).find(p => (p.k === "chair" || p.k === "sofa" || p.k === "barstool" || p.k === "ghsofa" || p.k === "ghchair") && tilesOf(p).some(t => t[0] === x && t[1] === y)) || null;
    const facing = p => { const r = window.FurniParts ? FurniParts.rotOf(p) : (p.rot || 0); return p.k === "sofa" || p.k === "ghsofa" || p.k === "ghchair" ? (r ? 2 : 4) : [2, 4, 6, 0][r & 3]; };
    let seatKey = "", seatWas = null;
    function hustleSeat() {
        const map = LIVE.map; if (!map) return null; const h = map.hustle, key = JSON.stringify(h || null) + map.levels.map(l => (l.props || []).length + "/" + (l.wallItems || []).length).join();
        if (key === seatKey && (!seatWas || map.levels.includes(seatWas.l))) return seatWas; seatKey = key; seatWas = null;
        if (h) { const l = map.levels.find(q => q.id === h.level), p = l && seatAt(l, h.x, h.y); if (p) return (seatWas = { l, x: h.x, y: h.y, p, dir: facing(p) }); }
        let best = null, bd = 1e9; for (const d of desks()) for (const p of (d.l.props || [])) { if (p.k !== "chair" && p.k !== "sofa") continue; for (const [x, y] of tilesOf(p)) { const dd = Math.hypot(x - d.front[0], y - d.front[1]); if (dd < bd) { bd = dd; best = { l: d.l, x, y, p, dir: facing(p) }; } } }
        return (seatWas = best);
    }
    const npcCv = document.createElement("canvas"); npcCv.width = 33; npcCv.height = 56; const ng = npcCv.getContext("2d", { willReadFrequently: true });
    const npcImg = (dir, act) => { const f = "art/npc/hustle/s-" + dir + "-" + act + "-0.png"; let i = imgs.get(f); if (!i) { i = new Image(); i.onload = () => LIVE.wake(); i.src = f; imgs.set(f, i); } return i; };
    let lastHead = null, hustleHit = null, npcKey = "";
    function drawHustle(c, ox, oy, nearer) {
        const s = hustleSeat(); if (!s) { lastHead = null; hustleHit = null; npcKey = ""; return; } if (inFront(s.l, s.x, s.y) !== nearer) return;
        let im = npcImg(s.dir, "sit"); if (!im.complete || !im.naturalWidth) im = npcImg(s.dir, "std"); if (!im.complete || !im.naturalWidth) return;
        const z = (LIVE.nodeZ(s.l, s.x, s.y) || 0) + SEAT_LIFT, p = LIVE.mapPoint(s.x + .5, s.y + .5, z), X = Math.round(p[0]), Y = Math.round(p[1]), x0 = X - 16, y0 = Y - 50;
        /* cut and tinted once for where he sits, the map as it is and the light as it is, not every frame (10 Nov scan: 2.5ms of every frame) */
        const m = LIVE.mood(), key = [x0, y0, s.l.id, im.src, LIVE.tileGen, m ? m.a + m.b + (Math.round((+m.f || 0) * 40) / 40) : "-", nearer].join("|");
        if (key !== npcKey) { npcKey = key; ng.clearRect(0, 0, 33, 56); ng.drawImage(im, 0, 0);
            LIVE.as({ x: s.x, y: s.y, z, l: s.l, dir: s.dir, frame: 0, st: null, seat: { x: s.x, y: s.y, l: s.l, dir: s.dir, p: s.p } }, () => { LIVE.cutInFront(ng, x0, y0); LIVE.tint(ng); });
            hustleHit = { x0, y0, a: ng.getImageData(0, 0, 33, 56).data, s }; }
        c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; c.drawImage(npcCv, x0, y0); c.restore();
        lastHead = [X, y0 + 14];
    }
    const onHustle = (px, py) => { const h = hustleHit; if (!h) return false; const x = Math.floor(px - h.x0), y = Math.floor(py - h.y0); if (x < 0 || y < 0 || x >= 33 || y >= 56) return false; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const X = x + i, Y = y + j; if (X >= 0 && Y >= 0 && X < 33 && Y < 56 && h.a[(Y * 33 + X) * 4 + 3] > 100) return true; } return false; };
    /* the tiles you can talk to him from: next to his seat, or the seat beside his */
    const nextTo = s => { const free = LIVE.tileFree(s.l), out = []; for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const x = s.x + i, y = s.y + j; if (free(x, y)) out.push([x, y]); } return out; };
    const byHustle = () => { const s = hustleSeat(), w = LIVE.walker; if (!s || !w || w.walking) return false; const wl = w.seat ? w.seat.l : w.l; if (wl !== s.l) return false; return Math.max(Math.abs(Math.round(w.x) - s.x), Math.abs(Math.round(w.y) - s.y)) <= 1; };

    let layerErrors = 0; const safe = fn => (c, ox, oy) => { try { fn(c, ox, oy); } catch (e) { if (++layerErrors <= 3) console.error("Lost Property:", e); } };
    LIVE.add({ under: safe((c, ox, oy) => { drawThing(c, ox, oy, false); drawHustle(c, ox, oy, false); }), over: safe((c, ox, oy) => { drawThing(c, ox, oy, true); drawHustle(c, ox, oy, true); placeBubbles(); }), still: true });

    /* ---------- picking it up: the server says what it's worth ---------- */
    function pick() {
        const t = showing(); if (!t || t === preview) return; const secs = Math.round((Date.now() - (t.t0 || Date.now())) / 1000); carryPts = pointsFor(secs, t.hints); round = null; saveRound(); setCarry(t.thing); window.hwTrack("hallway_lost_found");
        say("You", "Got it! That's the " + nice(t.thing.name) + ".", false); flash("+" + carryPts + " points", fmt(secs * 1000) + " to find" + (t.hints ? ", " + t.hints + (t.hints === 1 ? " clue" : " clues") : ", no clues"));
        lostPost({ act: "found", k: t.thing.k, at: { level: t.spot.l.id, x: t.spot.x, y: t.spot.y } }).then(r => {
            /* the server's word on it: counted, capped for today, or not counted at all (10 Nov scan, server finding 14: the page banked its own figure regardless) */
            if (!r) return;
            if (r.capped) { carryPts = 0; flash("Today's limit reached", "This one won't go on the board"); }
            else if (r.error && r.error !== "offline") { carryPts = 0; flash("Not counted", "The search had ended"); }
            else if (typeof r.points === "number") carryPts = r.points;
            saveCarryPts(); tick(); });
        saveCarryPts(); tick();
    }
    const saveCarryPts = () => { try { if (carrying) localStorage.setItem(CARRY + "-pts", String(carryPts)); else localStorage.removeItem(CARRY + "-pts"); } catch (e) { /* this visit */ } };

    LIVE.onClick((px, py) => {
        const t = showing(); if (t && t !== preview && t.thing) { const q = where(t), hw = (t.thing.w >> 1) + 3; if (Math.abs(px - q.X) <= hw && py <= q.Y + 5 && py >= q.Y - t.thing.h - 4) { const w = LIVE.walker, from = reachFrom(t.spot).sort((a, b) => Math.hypot(a[0] - w.x, a[1] - w.y) - Math.hypot(b[0] - w.x, b[1] - w.y)); if (!w.walking && w.l === t.spot.l && from.some(([x, y]) => Math.round(w.x) === x && Math.round(w.y) === y)) { pick(); return true; } for (const [x, y] of from) if (LIVE.walkTo(t.spot.l, x, y, pick)) return true;
            /* boxed in by furniture: from a seat beside it, sitting down (9 Nov 2026, his) */
            const api = LIVE.editorApi && LIVE.editorApi(), seats = api && api.lostSeatsBeside ? api.lostSeatsBeside(t.spot.l, t.spot.x, t.spot.y) : [];
            if (w.seat && !w.walking && seats.some(([x, y]) => w.seat.l === t.spot.l && w.seat.x === x && w.seat.y === y)) { pick(); return true; }
            for (const [x, y] of seats.sort((a, b) => Math.hypot(a[0] - w.x, a[1] - w.y) - Math.hypot(b[0] - w.x, b[1] - w.y))) if (LIVE.sitOn && LIVE.sitOn(t.spot.l, x, y, pick)) return true; } }
        /* hustle: walk up to him */
        if (onHustle(px, py)) { if (repliesBox || busy) return true; talked = false; if (byHustle()) { talk(); return true; } const s = hustleSeat(), w = LIVE.walker, near = nextTo(s).sort((a, b) => Math.hypot(a[0] - w.x, a[1] - w.y) - Math.hypot(b[0] - w.x, b[1] - w.y)); for (const [x, y] of near) if (LIVE.walkTo(s.l, x, y, () => talk())) return true; return true; }
        /* the desk: hand in what you're carrying; otherwise its book, your record */
        const desk = deskAt(px, py); if (desk) { if (!carrying) { ledger(); return true; } if (standingAt(desk)) { handIn(desk); return true; } const f = desk.front; if (LIVE.walkTo(desk.l, f[0], f[1], () => handIn(desk))) return true; return false; }
        return false;
    });
    function desks(only) { const map = LIVE.map, out = []; if (!map) return out; const def = (window.WALL_ITEMS || []).find(i => i.id === "i_desk"); if (!def) return out; for (const l of (only ? [only] : map.levels)) for (const q of (l.wallItems || [])) { if (q.k !== "i_desk") continue; const o = Math.round(q.at - def.snapAt), tile = (back, along) => q.axis === "y" ? [q.line - back, o + along] : [o + along, q.line - back]; out.push({ l, q, o, front: tile(-0, 1), fronts: [0, 1, 2, 3, 4].map(k => tile(0, k)) }); } return out; }
    function deskAt(px, py) {
        if (!LIVE.floor) return null;
        for (const d of desks(LIVE.floor)) { const q = d.q, z = LIVE.nodeZ(d.l, d.front[0], d.front[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, d.o, z) : LIVE.mapPoint(d.o, q.line, z), b = q.axis === "y" ? LIVE.mapPoint(q.line, d.o + 5, z) : LIVE.mapPoint(d.o + 5, q.line, z), lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]); if (px < lo - 4 || px > hi + 4) continue; const t = (px - a[0]) / (b[0] - a[0]), y = a[1] + (b[1] - a[1]) * t; if (py > y + 4 || py < y - 72) continue; return d; }
        return null;
    }
    const standingAt = d => { const w = LIVE.walker; return !!w && !w.walking && d.fronts.some(t => t[0] === Math.round(w.x) && t[1] === Math.round(w.y)) && w.l === d.l; };
    /* handing it in: the bell, the book, the points banked */
    function handIn() {
        if (!carrying) return; ding(); const p = prog(), st = p && p.get(), lost = (st && st.lost) || { shelf: [] }, total = (lost.streak || 0) + 1, got = carrying, pts = carryPts || 0;
        if (p) p.save({ lost: { day: today(), streak: total, shelf: [...new Set([...(lost.shelf || []), got.k])], points: (lost.points || 0) + pts, best: Math.max(lost.best || 0, pts), missed: lost.missed || 0 } });
        carryPts = 0; saveCarryPts(); setCarry(null); window.hwTrack("hallway_lost_handed");
        say("You", "Here's the " + nice(got.name) + ", for Lost Property.");
        flash(pts ? "+" + pts + " points" : "Handed in", "The " + nice(got.name) + " is back in Lost Property. That's " + total + " you've brought back."); tick();
    }

    /* ---------- speech bubbles, as the game's: white, rounded, the speaker's name first, the newest at the bottom, the old ones pushed up.
       Each sits over its own speaker: yours over your Habbo, hustle's over hustle. The chat goes when you walk away ---------- */
    let bubbleBox = null; const bubbles = [];
    function say(who, text, chat) { const stage = document.getElementById("stage") || document.body; if (!bubbleBox) { bubbleBox = document.createElement("div"); bubbleBox.className = "hw-bubbles"; bubbleBox.setAttribute("aria-live", "polite"); stage.appendChild(bubbleBox); } const b = document.createElement("div"); b.className = "hw-bubble"; const n = document.createElement("b"); n.textContent = who + ": "; b.append(n, document.createTextNode(text)); bubbleBox.appendChild(b); bubbles.push({ el: b, at: performance.now(), who: who === H ? "npc" : "you", chat: chat !== false }); while (bubbles.length > 3) bubbles.shift().el.remove(); placeBubbles(); LIVE.wake(); }
    function dropChat() { for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].chat) { bubbles[i].el.remove(); bubbles.splice(i, 1); } if (bubbleBox && !bubbles.length) bubbleBox.hidden = true; }
    const youHead = () => { const w = LIVE.walker; if (!w || w.l !== LIVE.floor && !(w.l && w.l.stair) && !w.seat) return null; const p = LIVE.mapPoint(w.x + .5, w.y + .5, w.z); return [Math.round(p[0]), Math.round(p[1]) - 44 + (w.seat ? 8 : 0)]; };
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
        const rh = repliesBox ? repliesBox.offsetHeight + 6 : 0, bh = bubbleBox.offsetHeight * sc, bottom = Math.min(Math.max(toY(anchor) - rh, r.top - hostR.top + bh + 6), hostR.height - rh - 8); bubbleBox.style.top = Math.round(bottom) + "px";
        if (repliesBox) { const half = repliesBox.offsetWidth / 2, x = Math.max(lo + half, Math.min(hi - half, toX(anchor))); repliesBox.style.left = Math.round(x) + "px"; repliesBox.style.top = Math.round(bottom + 4) + "px"; }
    }
    let repliesBox = null;
    function replies(list) { closeReplies(); repliesBox = document.createElement("div"); repliesBox.className = "hw-replies hw-replies-under"; repliesBox.setAttribute("role", "group"); repliesBox.setAttribute("aria-label", "Reply to hustle"); repliesBox.addEventListener("pointerdown", e => e.stopPropagation()); for (const [text, fn] of list) { const b = document.createElement("button"); b.type = "button"; b.className = "mr-btn btn small"; b.textContent = text; b.addEventListener("click", () => { if (busy) return; busy = true; closeReplies(); say("You", text); setTimeout(() => { busy = false; fn(); }, 500); }); repliesBox.appendChild(b); } (document.getElementById("stage") || document.body).appendChild(repliesBox); placeBubbles(); const first = repliesBox.querySelector("button"); if (first && !matchMedia("(pointer: coarse)").matches) first.focus({ preventScroll: true }); }
    function closeReplies() { if (repliesBox) { repliesBox.remove(); repliesBox = null; } }
    const ding = () => { let A; try { if (localStorage.getItem("hallway-music") === "0") return; const C = window.AudioContext || window.webkitAudioContext; A = ding.a || (ding.a = new C()); if (A.state !== "running") A.resume().catch(() => {}); } catch (e) { return; } const t = A.currentTime + .01; for (const [f, v] of [[2093, .09], [3136, .05], [4186, .02]]) { const o = A.createOscillator(), h = A.createGain(); o.type = "sine"; o.frequency.value = f; h.gain.setValueAtTime(0, t); h.gain.linearRampToValueAtTime(v, t + .003); h.gain.exponentialRampToValueAtTime(.0005, t + 1.1); o.connect(h); h.connect(A.destination); o.start(t); o.stop(t + 1.15); } };
    const PROPER = /^(christmas|xmas|valentine'?s?|easter|halloween|habbo|habbos|santa|rudolph|london|paris|egypt|egyptian|japanese|chinese|tiki|dragon's)$/i;
    function nice(name) { return String(name || "").split(" ").map(w => PROPER.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join(" "); }
    const H = "hustle", asking = t => "It's the " + nice(t.thing.name) + ". It's somewhere in the Hallway. Hand it in at the Lost Property desk when you find it.";
    const totalIn = () => { const p = prog(), l = p && p.get().lost; return (l && l.streak) || 0; };
    async function startSearch() { busy = true; try { const t = await newSearch(false); if (t === "busy") { say(H, "Lots of people asking just now. Try me again in a little while."); return; } if (t === "offline") { say(H, "I can't reach the Lost Property office just now. Try me again in a little while."); return; } if (!t) { say(H, "Actually, I can't think of anything missing right now. Come back in a bit."); return; } say(H, t.resumed ? "You're still looking for one, remember? " + asking(t) : "Thank you! " + asking(t)); chatMenu(); } finally { busy = false; } }
    const DOING = { sofa: "I was having a sit-down on one of the sofas before it went.", chair: "I sat down on a chair for a bit, to look at my notes.", table: "I put my things down on a table for a minute.", planter: "I stopped to look at the plants on the way.", steps: "I sat on some small steps to catch my breath." };
    const floorWords = l => l.k === 0 ? "the Ground floor" : l.name;
    async function clue(t) {
        const r = await lostPost({ act: "hint" }); t.hints = r && typeof r.hints === "number" ? r.hints : (t.hints || 0) + 1; if (t.hints <= 3) window.hwTrack("hallway_lost_clue"); const sp = t.spot;
        if (t.hints === 1) return "I'm fairly sure I was on " + floorWords(sp.l) + " when I lost it.";
        if (t.hints === 2) return DOING[kindOf(sp)] || "I wandered about a bit, I'll be honest.";
        if (t.hints === 3) { let best = null, bd = 1e9; for (const d of (sp.l.doors || [])) { const nm = d.name || (LIVE.doorName && LIVE.doorName(d)); if (!nm || d.spare) continue; const dx = (d.axis === "x" ? d.at : d.line) - sp.x, dy = (d.axis === "x" ? d.line : d.at) - sp.y, dd = Math.hypot(dx, dy); if (dd < bd) { bd = dd; best = nm; } } return best && bd <= 12 ? "Oh, and I remember walking past the door to " + best + "." : "I didn't go far from where I sat, I'm sure of that."; }
        return "That's honestly all I can remember. It's there somewhere!";
    }
    const NOT_NOW = ["Not right now", () => say(H, "No problem. I'll be sat here.")];
    function chatMenu() { const list = []; if (round && !carrying) { list.push(["I'm on it", () => say(H, "Good luck. Mind the rats.")]); list.push(["Any idea where it is?", async () => { const t = round; if (t) { busy = true; const w = await clue(t).finally(() => { busy = false; }); say(H, w); chatMenu(); } }]); list.push(["What was it again?", () => { if (round) { say(H, asking(round)); chatMenu(); } }]); if (round.swapsLeft !== 0) list.push(["Ask for a different one", async () => { busy = true; const again = await newSearch(true).finally(() => { busy = false; }); if (again === "noswaps") say(H, "No, that's the last one I can swap. Keep looking for that one, the clock's still going."); else if (again === "offline") say(H, "I can't reach the Lost Property office just now. Keep looking for that one."); else if (again && again !== "busy") say(H, "Fine, forget that one. " + asking(again) + (again.swapsLeft === 0 ? " That's the last swap, mind." : "")); else say(H, "I can't think of another just now. Keep looking for that one."); chatMenu(); }]); } list.push(["Lost Property record", () => { ledger(); chatMenu(); }]); replies(list); }
    let talked = false, busy = false;
    function talk() {
        if (busy) return; talked = true;
        /* you turn to him, unless you're sat down */
        { const s = hustleSeat(), w = LIVE.walker; if (s && w && !w.seat) { const dx = Math.sign(s.x - Math.round(w.x)), dy = Math.sign(s.y - Math.round(w.y)), D = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]].findIndex(([a, b]) => a === dx && b === dy); if (D >= 0) { w.dir = D; LIVE.wake(); } } }
        if (carrying) { say(H, "You found the " + nice(carrying.name) + "! Don't give it to me, it goes back to Lost Property. Hand it in at the desk."); replies([["Will do", () => say(H, "Thank you!")], ["Lost Property record", () => ledger()]]); return; }
        if (round) { say(H, "Any luck? " + asking(round)); chatMenu(); return; }
        say(H, totalIn() ? "Back again? More of the Furni Index items have gone missing in the Maze Rats Hallway!" : "Hello! Some of the Furni Index items have gone missing round the Maze Rats Hallway. Could you find one and hand it in at Lost Property?");
        replies([["Of course, what's missing?", startSearch], ["Lost Property record", () => { ledger(); replies([["Of course, what's missing?", startSearch], NOT_NOW]); }], NOT_NOW]);
    }
    /* walking up to hustle starts it; walking off ends the chat. Walking up to the desk with something hands it in */
    setInterval(() => { const w = LIVE.walker; if (!w || document.hidden || preview) return; const near = byHustle();
        if (near && !talked && !busy) talk();
        if (!near && w.walking && (repliesBox || bubbles.some(q => q.chat))) { closeReplies(); dropChat(); }
        if (!near && !w.walking) { const s = hustleSeat(); if (!s || Math.abs(s.x - w.x) + Math.abs(s.y - w.y) > 3 || s.l !== w.l) talked = false; }
        if (carrying && !w.walking) { const d = desks(w.l).find(standingAt); if (d) handIn(d); }
    }, 300);

    /* ---------- the clock on screen, and what happens when it runs out ---------- */
    const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    let hud = null, hudKey = "";
    function tick() {
        const t = round, stage = document.getElementById("stage") || document.body;
        /* out of time: it's gone, a miss, and hustle will have another */
        if (t && !carrying && t.t0 && Date.now() - t.t0 > LIMIT_MS) { const name = nice(t.thing.name), p = prog(), st = p && p.get(), lost = (st && st.lost) || {}; if (p) p.save({ lost: { ...lost, day: lost.day || today(), shelf: lost.shelf || [], missed: (lost.missed || 0) + 1 } }); round = null; saveRound(); window.hwTrack("hallway_lost_missed"); LIVE.wake(); flash("Time's up", "Too slow: the " + name + " went missing for good. Ask hustle for another."); }
        const now = round, show = !!(now || carrying) && !document.body.classList.contains("hw-screensaver");
        if (!show) { if (hud) hud.hidden = true; return; }
        if (!hud) { hud = document.createElement("button"); hud.type = "button"; hud.className = "hw-lost-hud"; hud.setAttribute("aria-label", "Lost Property: open your record"); hud.addEventListener("pointerdown", e => e.stopPropagation()); hud.addEventListener("click", () => ledger()); stage.appendChild(hud); }
        hud.hidden = false; const thing = carrying || now.thing, key = thing.k + (carrying ? "c" : "");
        if (key !== hudKey) { hudKey = key; hud.replaceChildren(); const i = document.createElement("img"); i.src = "art/ideas/lost/" + thing.f; i.alt = ""; const w = document.createElement("span"); w.className = "hw-lost-hud-words"; const a = document.createElement("small"), b = document.createElement("b"); w.append(a, b); hud.append(i, w); }
        const [small, big] = hud.querySelectorAll(".hw-lost-hud-words > *");
        if (carrying) { small.textContent = "Hand it in at Lost Property"; big.textContent = carryPts ? carryPts + " pts" : nice(thing.name); hud.classList.remove("low", "very-low"); hud.classList.add("got"); return; }
        hud.classList.remove("got"); const left = LIMIT_MS - (Date.now() - now.t0); small.textContent = "Find the " + nice(thing.name); big.textContent = fmt(left); hud.classList.toggle("low", left < 120e3); hud.classList.toggle("very-low", left < 30e3);
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
        if (carrying) words.append(el("small", "", "You've found it"), el("b", "", "The " + nice(carrying.name)), el("p", "", "Hand it in at the Lost Property desk for its " + (carryPts || 0) + " points."));
        else if (t) { words.append(el("small", "", "Looking for"), el("b", "", "The " + nice(t.thing.name)), live); const upd = () => { const left = LIMIT_MS - (Date.now() - t.t0), secs = Math.round((Date.now() - t.t0) / 1000); live.replaceChildren(el("span", "hw-lp-clock" + (left < 120e3 ? " low" : ""), fmt(left) + " left"), el("span", "", "Clues " + Math.min(3, t.hints || 0) + " of 3"), el("span", "", "Worth " + pointsFor(secs, t.hints) + " points now")); }; upd(); timer = setInterval(upd, 1000); }
        else words.append(el("small", "", "Nothing to find just now"), el("b", "", "Find hustle in the Hallway"), el("p", "", "Each thing has 15 minutes. Find it fast, without clues, for the most points."));
        body.appendChild(now);
        /* your record */
        const stats = el("div", "hw-lp-stats"); for (const [n, v] of [["Points", lost.points || 0], ["Best find", lost.best || 0], ["Brought back", lost.streak || 0], ["Missed", lost.missed || 0]]) { const s = el("div", "hw-lp-stat"); s.append(el("b", "", String(v)), el("small", "", n)); stats.appendChild(s); } body.appendChild(stats);
        /* two tabs: your shelf, and the week's board */
        const tabs = el("div", "hw-lp-tabs"), shelfTab = el("button", "on", "Handed in"), boardTab = el("button", "", "This week's best"), pane = el("div", "hw-lp-pane"); shelfTab.type = boardTab.type = "button"; tabs.setAttribute("role", "tablist"); for (const b of [shelfTab, boardTab]) b.setAttribute("role", "tab"); tabs.append(shelfTab, boardTab); body.append(tabs, pane);
        const select = on => { for (const b of [shelfTab, boardTab]) { b.classList.toggle("on", b === on); b.setAttribute("aria-selected", String(b === on)); } };
        const showShelf = () => { select(shelfTab); pane.replaceChildren();
            const all = things || [], have = new Set(lost.shelf || []), count = all.filter(q => have.has(q.k)).length; pane.appendChild(el("p", "hw-lp-count", "Collected " + count + " of " + all.length));
            const shelf = el("div", "hw-lp-shelf"); for (const th of all) { const got = have.has(th.k), slot = el("div", "hw-lp-slot" + (got ? " got" : "")), i = img(th, 1); if (!got) i.alt = "Not found yet"; slot.title = got ? th.name : "Not found yet"; slot.appendChild(i); shelf.appendChild(slot); }
            if (st.key) { const slot = el("div", "hw-lp-slot got key"), i = el("img"); i.src = "art/wall/i_key.png"; i.alt = "The Caretaker's key"; slot.title = "The Caretaker's key"; slot.appendChild(i); shelf.appendChild(slot); }
            pane.appendChild(shelf); };
        const showBoard = () => { select(boardTab); pane.replaceChildren(el("p", "hw-lp-count", "Loading the board..."));
            /* the Visitor's token in a header, out of the address and the logs (9 Nov scan, finding 11) */
            fetch(LOSTFN, { credentials: "same-origin", headers: { Accept: "application/json", ...(visitor() ? { "X-Hallway-Visitor": visitor() } : {}) } }).then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))).then(b => {
                pane.replaceChildren(el("p", "hw-lp-count", "Monday to Sunday: points for everything found this week"));
                if (!b.rows.length) pane.appendChild(el("p", "hw-lp-empty", "Nobody's on the board yet this week. Be the first."));
                else { const tb = el("table", "hw-lp-board"), hd = el("tr"); for (const h of ["#", "Mazer", "Points", "Found", "Best"]) hd.appendChild(el("th", "", h)); tb.appendChild(hd); for (const r of b.rows) { const tr = el("tr"); for (const v of [r.rank, r.name || "A Mazer", r.points, r.finds, r.best]) tr.appendChild(el("td", "", String(v))); tb.appendChild(tr); } pane.appendChild(tb); }
                const p = prog(); pane.appendChild(el("p", "hw-lp-you", b.me ? "You: #" + b.me.rank + " with " + b.me.points + " points, as " + b.me.name : "Find something this week to get on the board." + (p && p.signedIn ? "" : " Signed out, you go on it as a Visitor with a number of your own; sign in with a nickname to use your name.")));
            }).catch(() => pane.replaceChildren(el("p", "hw-lp-empty", "The board couldn't be reached just now."))); };
        shelfTab.addEventListener("click", showShelf); boardTab.addEventListener("click", showBoard); showShelf();
        const w = openWindow("Lost Property", body); w.back.classList.add("hw-lp-window");
        if (timer) { const stop = setInterval(() => { if (!w.back.isConnected) { clearInterval(timer); clearInterval(stop); } }, 1000); }
    }

    /* ---------- the site's window, on the Hallway; a bottom sheet on a phone ---------- */
    function openWindow(title, content) {
        const stage = document.getElementById("stage") || document.body, back = document.createElement("div"), win = document.createElement("div"), bar = document.createElement("div"), h = document.createElement("h2"), x = document.createElement("button"), xi = document.createElement("img"), frame = document.createElement("div");
        back.className = "mr-overlay hw-sheet"; back.setAttribute("role", "dialog"); back.setAttribute("aria-modal", "true"); back.setAttribute("aria-label", title); win.className = "mr-window"; bar.className = "mr-titlebar"; frame.className = "mr-frame hw-sheet-body"; h.textContent = title; x.className = "mr-close"; x.type = "button"; x.setAttribute("aria-label", "Close"); xi.src = "art/rooms/modal_topclose_x.png"; xi.alt = ""; x.appendChild(xi); bar.append(h, x);
        if (typeof content === "string") frame.innerHTML = content; else frame.appendChild(content); win.append(bar, frame); back.appendChild(win); stage.appendChild(back);
        const before = document.activeElement, shut = () => { back.remove(); document.removeEventListener("keydown", key, true); if (before && before.focus && before.isConnected) before.focus({ preventScroll: true }); }, key = e => { if (e.key === "Escape") { e.stopImmediatePropagation(); shut(); return; }
            /* Tab stays inside, as aria-modal says, as the picker's does (15 Nov scan, live L8); only the newest window's, when two are open */
            if (e.key !== "Tab" || [...document.querySelectorAll(".hw-sheet")].pop() !== back) return;
            const all = [...win.querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(q => !q.disabled && q.offsetParent !== null); if (!all.length) return; const i = all.indexOf(document.activeElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); } else if (!e.shiftKey && (i === all.length - 1 || i < 0)) { e.preventDefault(); all[0].focus(); } };
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
    window.HallwayLost = {
        wanted: () => round, talk, newSearch, get carrying() { return carrying; }, get round() { return round; }, desks, ledger, pick, handIn, hustleSeat, mapSpots, showsAt, thingImg, OLD_SPOTS, kindOf,
        get things() { return things; }, setPreview(p) { preview = p; LIVE.wake(); }, get preview() { return preview; }
    };
})();

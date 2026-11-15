/* The lift's panel and what's down in the Basement: the music that plays there, and, rarely, the lights failing.
   The panel takes over #liftPanel in the editor's page; editor.js still does the riding. */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const muted = () => { try { return localStorage.getItem("hallway-music") === "0"; } catch (e) { return false; } };
    let AC = null, acUsed = 0; const ac = () => { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); } acUsed = Math.max(acUsed, performance.now()); if (AC.state !== "running") AC.resume().catch(() => {}); return AC; };
    /* with nothing playing for a few seconds (no music down here, no scare, no click), the sound engine rests: it ran on for the rest of the
       visit after Mute or leaving the Basement (15 Nov scan, live L9) */
    setInterval(() => { if (AC && AC.state === "running" && !eerie && !B_.scoreOn && performance.now() - acUsed > 4000) AC.suspend().catch(() => {}); }, 2000);
    /* the panel's own small noises: a felt click on a button, a key in a lock */
    function tick(kind) {
        if (muted()) return; const A = ac(); if (!A) return; const t = A.currentTime + .005, g = A.createGain(), o = A.createOscillator(); g.connect(A.destination);
        if (kind === "key") { for (const [dt, f] of [[0, 900], [.11, 620], [.13, 1200]]) { const q = A.createOscillator(), h = A.createGain(); q.type = "square"; q.frequency.value = f; h.gain.setValueAtTime(0, t + dt); h.gain.linearRampToValueAtTime(.07, t + dt + .003); h.gain.exponentialRampToValueAtTime(.001, t + dt + .05); q.connect(h); h.connect(A.destination); q.start(t + dt); q.stop(t + dt + .06); } return; }
        o.type = "sine"; o.frequency.setValueAtTime(kind === "dead" ? 150 : 520, t); o.frequency.exponentialRampToValueAtTime(kind === "dead" ? 110 : 340, t + .05); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(kind === "dead" ? .1 : .08, t + .004); g.gain.exponentialRampToValueAtTime(.001, t + .08); o.connect(g); o.start(t); o.stop(t + .09);
    }

    /* ---------- 22 the panel: brushed plate, rounded square buttons, only the numeral lights, the display steps through the floors ---------- */
    const W = 119, H = 252, ORDER = [["3", 3], ["2", 2], ["1", 1], ["G", 0]], ALL = ["B", "G", "1", "2", "3"], YB = 208;
    const G5 = { "3": ["11110", "00001", "00110", "00001", "00001", "10001", "01110"], "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"], "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"], G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"], B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"] };
    const BUTTONS = ORDER.map(([ch, n], i) => ({ ch, n, x: 45, y: 58 + i * 27, w: 29, h: 25 })), B = { ch: "B", n: -1, x: 26, y: 58 + 4 * 27, w: 67, h: 25, split: 42 };
    const STEEL = ["#8d9298", "#d8dbdf", "#5c6167"], DARK = ["#34363b", "#5a5d63", "#1c1d20"];
    const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); }, px = (c, x, y, col) => rect(c, x, y, 1, 1, col);
    const glyph = (c, ch, cx, cy, col) => { const g = G5[ch]; for (let v = 0; v < 7; v++) for (let u = 0; u < 5; u++) if (g[v][u] === "1") px(c, cx - 2 + u, cy - 3 + v, col); };
    const rr = (c, x, y, w, h, col) => { rect(c, x + 1, y, w - 2, h, col); rect(c, x, y + 1, w, h - 2, col); };
    const screw = (c, X, Y) => { rect(c, X - 1, Y - 2, 3, 5, "#2a2c30"); rect(c, X - 2, Y - 1, 5, 3, "#2a2c30"); rect(c, X - 1, Y - 1, 3, 3, "#d4d8dc"); px(c, X - 1, Y - 1, "#f6f8fa"); rect(c, X - 1, Y, 3, 1, "#50555b"); };
    const inset = (c, x, y, w, h, face) => { rect(c, x, y, w, h, face); rect(c, x, y, w, 1, "#6c7278"); rect(c, x, y, 1, h, "#6c7278"); rect(c, x + 1, y + 1, w - 2, 1, "#878c92"); rect(c, x, y + h - 1, w, 1, "#e6e9ec"); rect(c, x + w - 1, y, 1, h, "#e6e9ec"); };
    const btn = (c, x, y, w, h, face, lit, shade, down) => { rr(c, x, y, w, h, "#111214"); rr(c, x + 1, y + 1, w - 2, h - 2, down ? shade : lit); rect(c, x + 2, y + h - 2, w - 3, 1, down ? lit : shade); rect(c, x + w - 2, y + 2, 1, h - 3, down ? lit : shade); rect(c, x + 2, y + 2, w - 4, h - 4, face); };
    const P = { on: false, here: null, floor: 0, target: 0, shown: 0, stepEvery: 750, next: 0, turned: false, tTurn: 0, doors: 0, api: null, raf: 0, cv: null, ctx: null, wrap: null };
    const hasKey = () => { const p = window.HallwayProgress; return !!(p && p.get() && p.get().key); };
    function liftOn(n) { const map = LIVE.map, l = map.levels.find(q => q.k === n); if (!l) return null; const here = P.here, list = map.lifts.filter(q => q.level === l.id); if (!list.length) return null; return list.slice().sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y))[0]; }
    function press(n) {
        if (P.target !== P.floor) return;
        if (n === -1 && !P.turned && P.floor !== -1) { tick("dead"); return; }
        if (n === P.floor) { tick("press"); return; }
        const q = liftOn(n); if (!q) { tick("dead"); return; }
        tick("press"); P.target = n; P.stepEvery = 3200 / Math.abs(n - P.floor); P.next = performance.now() + 500; P.api.ride(q);
    }
    function turnKey() { if (!hasKey()) { tick("dead"); return; } if (P.turned) return; P.turned = true; P.tTurn = performance.now(); tick("key"); }
    function doorBtn(open) { P.doors = open ? 1 : -1; tick("press"); P.api.doors(open); setTimeout(() => { P.doors = 0; }, 900); }
    function drawPlate(now) {
        const c = P.ctx; if (P.target !== P.shown && now > P.next) { P.shown += Math.sign(P.target - P.shown); P.next = now + P.stepEvery; }
        rect(c, 0, 0, W, H, "#111214"); rect(c, 1, 1, W - 2, H - 2, "#6c7278"); rect(c, 1, 1, W - 3, H - 3, "#f2f4f6"); rect(c, 2, 2, W - 4, H - 4, "#b8bcc1");
        for (let y = 3; y < H - 3; y++) { const n = ((y * 2654435761) >>> 0) % 7; rect(c, 3, y, W - 6, 1, n === 0 ? "#b2b6bb" : n === 3 ? "#bdc1c6" : "#b8bcc1"); }
        for (const [X, Y] of [[8, 8], [W - 9, 8], [8, H - 9], [W - 9, H - 9]]) screw(c, X, Y);
        inset(c, 18, 16, W - 36, 26, "#0a0b0d"); rect(c, 20, 18, W - 40, 1, "#22242a");
        ALL.forEach((ch, i) => { const cx = 31 + i * 14, n = ch === "B" ? -1 : ch === "G" ? 0 : +ch, on = n === P.shown; if (on) { c.fillStyle = "rgba(255,180,70,.2)"; c.fillRect(cx - 5, 21, 11, 16); } glyph(c, ch, cx, 29, on ? "#ffc65c" : "#2e3036"); });
        if (P.target !== P.shown) { const up = P.target > P.shown, X = W >> 1; for (let i = 0; i < 3; i++) rect(c, X - i, up ? 44 + i : 49 - i, i * 2 + 1, 1, "#ffc65c"); }
        inset(c, 22, 54, W - 44, 143, "#a6aab0");
        for (const b of BUTTONS) { const going = b.n === P.target && P.target !== P.shown, lit = going || b.n === P.shown; btn(c, b.x, b.y, b.w, b.h, STEEL[0], STEEL[1], STEEL[2], going); glyph(c, b.ch, b.x + 14, b.y + 12, lit ? "#ffd060" : "#26282c"); }
        const litB = P.shown === -1 || P.target === -1; btn(c, B.x, B.y, B.w, B.h, DARK[0], DARK[1], DARK[2], false); glyph(c, "B", B.x + 21, B.y + 12, litB ? "#ffd060" : P.turned ? "#c8ccd0" : "#74787e");
        rect(c, B.x + B.split, B.y + 3, 1, B.h - 6, "#111214"); rect(c, B.x + B.split + 1, B.y + 3, 1, B.h - 6, "#54575c");
        { const ex = B.x + B.split + 6, ey = B.y + 4, ew = 15, eh = 17; rr(c, ex, ey, ew, eh, "#0d0e10"); rr(c, ex + 1, ey + 1, ew - 2, eh - 2, "#1f2024"); rect(c, ex + 2, ey + eh - 2, ew - 4, 1, "#3e4046"); rect(c, ex + ew - 2, ey + 2, 1, eh - 4, "#3e4046"); const kx = ex + 7, ky = ey + 4;
            if (!P.turned) { [".XXX.", "XXXXX", "XXXXX", "XXXXX", ".XXX.", ".XXX.", "XXXXX", "XXXXX", "XXXXX"].forEach((r, j) => { for (let u = 0; u < 5; u++) if (r[u] === "X") px(c, kx - 2 + u, ky + j, "#000000"); }); }
            else if (now - P.tTurn > 250) { rect(c, kx - 5, ky + 3, 11, 3, "#000000"); rect(c, kx - 4, ky + 4, 9, 1, "#c8ccd0"); rect(c, kx + 4, ky + 2, 3, 5, "#000000"); rect(c, kx + 5, ky + 3, 1, 3, "#c8ccd0"); }
            else { rect(c, kx - 1, ky - 1, 3, 11, "#000000"); rect(c, kx, ky, 1, 9, "#c8ccd0"); rect(c, kx - 2, ky - 3, 5, 3, "#000000"); rect(c, kx - 1, ky - 2, 3, 1, "#c8ccd0"); } }
        inset(c, 22, YB - 5, W - 44, 33, "#a6aab0");
        for (const [X, o] of [[27, 1], [W - 56, -1]]) { btn(c, X, YB, 29, 23, STEEL[0], STEEL[1], STEEL[2], P.doors === o); const cx = X + 14, cy = YB + 11, col = P.doors === o ? "#ffd060" : "#26282c"; rect(c, cx, cy - 6, 1, 13, col); for (let i = 0; i < 4; i++) { const d = o > 0 ? 8 - i : 2 + i; rect(c, cx - d, cy - i, 1, i * 2 + 1, col); rect(c, cx + d, cy - i, 1, i * 2 + 1, col); } }
    }
    function loop(now) { if (!P.on) return; drawPlate(now); P.raf = requestAnimationFrame(loop); }
    /* a real button over each drawn one, so it can be tabbed to and read out, and a finger can't miss */
    function build() {
        if (P.wrap) return; const box = document.getElementById("liftPanel"), wrap = P.wrap = document.createElement("div"); wrap.id = "liftPlate"; const cv = P.cv = document.createElement("canvas"); cv.width = W; cv.height = H; P.ctx = cv.getContext("2d"); wrap.appendChild(cv);
        const hit = (x, y, w, h, label, fn) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", label); b.style.cssText = `left:${x / W * 100}%;top:${y / H * 100}%;width:${w / W * 100}%;height:${h / H * 100}%`; b.addEventListener("click", fn); wrap.appendChild(b); };
        for (const q of BUTTONS) hit(q.x, q.y, q.w, q.h, q.n === 0 ? "Ground" : "Floor " + q.n, () => press(q.n));
        hit(B.x, B.y, B.split, B.h, "Basement", () => press(-1)); hit(B.x + B.split + 1, B.y, B.w - B.split - 1, B.h, "Keyhole", turnKey);
        hit(27, YB, 29, 23, "Open the doors", () => doorBtn(true)); hit(W - 56, YB, 29, 23, "Close the doors", () => doorBtn(false));
        box.insertBefore(wrap, box.firstChild);
    }
    /* Escape is "Stay here" when no ride is under way, as everything else that opens goes on Escape (15 Nov scan, live L13); a window or
       drawer over it goes first */
    document.addEventListener("keydown", e => {
        if (e.key !== "Escape" || e.defaultPrevented || !P.on) return; const box = document.getElementById("liftPanel"), w = LIVE.walker;
        if (!box || box.hidden || (w && w.busy) || P.target !== P.floor || document.querySelector(".hw-sheet, #playPicker, .play-menu.is-open")) return;
        const stay = document.getElementById("liftStay"); if (stay) { e.preventDefault(); stay.click(); }
    });
    window.HallwayLiftPanel = {
        show(here, api) { build(); P.here = here; P.api = api; const l = LIVE.map.levels.find(q => q.id === here.level); P.floor = P.target = P.shown = l ? l.k : 0; P.turned = false; P.doors = 0; document.getElementById("liftPanel").classList.add("plate"); P.on = true; cancelAnimationFrame(P.raf); P.raf = requestAnimationFrame(loop); },
        hide() { P.on = false; cancelAnimationFrame(P.raf); },
        get state() { return { floor: P.floor, target: P.target, shown: P.shown, turned: P.turned }; }, turnKey, press
    };

    /* ---------- 30 the Basement's own music, built live, never in the Playlist ---------- */
    const EERIE = (A, out, base, secs, seed) => { let n = seed * 97 + 11; const R = () => { n = (n * 16807 + 11) % 2147483647; return (n % 10000) / 10000; }, T = s => base + s;
        const master = A.createGain(); master.gain.value = .6; master.connect(out); const rv = A.createConvolver(), len = A.sampleRate * 6 | 0, imp = A.createBuffer(2, len, A.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < 2000 ? i / 2000 : 1); } } rv.buffer = imp; const wet = A.createGain(); wet.gain.value = .9; rv.connect(wet); wet.connect(master);
        const nb = A.createBuffer(1, A.sampleRate * 3, A.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        const route = (node, dry, send) => { const d = A.createGain(); d.gain.value = dry; node.connect(d); d.connect(master); const w = A.createGain(); w.gain.value = send; node.connect(w); w.connect(rv); };
        const voice = (type, f, t0, t1, peak, atk, rel, dry, send, lp) => { const o = A.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, T(t0)); o.frequency.linearRampToValueAtTime(f * (1 - .006 + R() * .012), T(t1)); const g = A.createGain(); g.gain.setValueAtTime(0, T(t0)); g.gain.linearRampToValueAtTime(peak, T(t0 + atk)); g.gain.setValueAtTime(peak, T(Math.max(t0 + atk, t1 - rel))); g.gain.linearRampToValueAtTime(0, T(t1)); if (lp) { const fl = A.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = lp; o.connect(fl); fl.connect(g); } else o.connect(g); route(g, dry, send); o.start(T(t0)); o.stop(T(t1) + .05); };
        for (const f of [36.71, 55, 58.27]) voice("sawtooth", f, 0, secs + 2, .17, 2, 2, 1, .25, 240);
        const CH = [[220, 233.08, 329.63], [174.61, 185, 261.63], [207.65, 220, 311.13], [164.81, 174.61, 246.94]]; for (let t = 0; t < secs; t += 12) { const c = CH[(Math.floor(t / 12) + seed) % CH.length]; for (const f of c) voice("triangle", f, t, t + 13.5, .03, 5, 6, .35, .9, 900); }
        const BOX = [880, 1046.5, 932.33, 1318.5, 698.46, 1244.5, 830.61, 1174.66]; for (let t = 2 + R() * 3; t < secs - 1; t += 2.4 + R() * 4.4) { const f = BOX[Math.floor(R() * BOX.length)] * (1 - R() * .012), o = A.createOscillator(), o2 = A.createOscillator(), g = A.createGain(); o.type = "sine"; o2.type = "sine"; o.frequency.setValueAtTime(f, T(t)); o.frequency.linearRampToValueAtTime(f * .985, T(t + 2.4)); o2.frequency.setValueAtTime(f * 3.01, T(t)); const g2 = A.createGain(); g2.gain.value = .22; o2.connect(g2); g2.connect(g); o.connect(g); g.gain.setValueAtTime(0, T(t)); g.gain.linearRampToValueAtTime(.05 + R() * .03, T(t + .008)); g.gain.exponentialRampToValueAtTime(.0005, T(t + 2.4)); route(g, .25, 1); o.start(T(t)); o2.start(T(t)); o.stop(T(t + 2.5)); o2.stop(T(t + 2.5)); }
        { const w = A.createBufferSource(); w.buffer = nb; w.loop = true; const fl = A.createBiquadFilter(); fl.type = "bandpass"; fl.Q.value = 3; fl.frequency.setValueAtTime(420, T(0)); for (let t = 3; t < secs; t += 3 + R() * 3) fl.frequency.linearRampToValueAtTime(260 + R() * 500, T(t)); const g = A.createGain(); g.gain.setValueAtTime(0, T(0)); g.gain.linearRampToValueAtTime(.028, T(3)); g.gain.setValueAtTime(.028, T(secs - 1)); g.gain.linearRampToValueAtTime(0, T(secs + 2)); w.connect(fl); fl.connect(g); route(g, .6, .7); w.start(T(0)); w.stop(T(secs + 2.1)); }
        for (let t = 7 + R() * 6; t < secs - 3; t += 11 + R() * 10) { const o = A.createOscillator(), g = A.createGain(); o.type = "sine"; o.frequency.setValueAtTime(58, T(t)); o.frequency.exponentialRampToValueAtTime(26, T(t + 1.1)); g.gain.setValueAtTime(0, T(t)); g.gain.linearRampToValueAtTime(.24, T(t + .02)); g.gain.exponentialRampToValueAtTime(.001, T(t + 1.1)); route(g, .5, 1); o.start(T(t)); o.stop(T(t + 1.2)); }
    };
    let eerie = null;
    const eerieOn = volume => { if (eerie) return; const A = ac(); if (!A) return; const g = A.createGain(), v = volume === undefined ? .8 : volume; g.gain.setValueAtTime(0, A.currentTime); g.gain.linearRampToValueAtTime(v, A.currentTime + 4); g.connect(A.destination); const e = eerie = { g, n: 0, A, timer: 0 }, CHUNK = 36, go = at => { if (eerie !== e) return; EERIE(A, g, at, CHUNK, e.n++); e.timer = setTimeout(() => go(at + CHUNK), Math.max(100, (at + CHUNK - A.currentTime - 6) * 1000)); }; go(A.currentTime + .05); };
    const eerieOff = () => { if (!eerie) return; const e = eerie; eerie = null; clearTimeout(e.timer); acUsed = performance.now() + 4000; /* its fade out first */ e.g.gain.cancelScheduledValues(e.A.currentTime); e.g.gain.setTargetAtTime(0, e.A.currentTime, .6); setTimeout(() => e.g.disconnect(), 4000); };
    /* to the music player this is just another voice: it keeps the player's place, and takes the volume and Mute with it */
    let wantEerie = false, volumeNow = .8, resumeEerie = 0;
    const VOICE = { start(v) { wantEerie = true; volumeNow = v; if (!B_.scoreOn) eerieOn(v); }, stop() { wantEerie = false; clearTimeout(resumeEerie); eerieOff(); }, setVolume(v) { volumeNow = v; if (eerie) eerie.g.gain.setTargetAtTime(v, eerie.A.currentTime, .1); } };

    /* ---------- the scare: lights fizz and die, half a second of black and silence, the door slams, then dark with a heartbeat ---------- */
    const SCORE = (A, out, base) => {
        const T = s => base + s, comp = A.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = .004; comp.release.value = .25; const master = A.createGain(); master.gain.value = .5; comp.connect(master); master.connect(out);
        const rv = A.createConvolver(), len = A.sampleRate * 4.5 | 0, imp = A.createBuffer(2, len, A.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.4) * (i < 800 ? i / 800 : 1); } } rv.buffer = imp; const wet = A.createGain(); wet.gain.value = .55; rv.connect(wet); wet.connect(comp);
        const nb = A.createBuffer(1, A.sampleRate * 3, A.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        const env = (g, pts) => { g.gain.setValueAtTime(pts[0][1], T(pts[0][0])); for (const [t, v] of pts.slice(1)) g.gain.linearRampToValueAtTime(v, T(t)); };
        const send = (n, v) => { n.connect(comp); const w = A.createGain(); w.gain.value = v; n.connect(w); w.connect(rv); };
        const osc = (type, f0, f1, t0, t1, pts, filt, wetV = .2) => { const o = A.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, T(t0)); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, T(t1)); const g = A.createGain(); env(g, pts); if (filt) { const fl = A.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.setValueAtTime(filt[0], T(t0)); fl.frequency.exponentialRampToValueAtTime(filt[1], T(t1)); o.connect(fl); fl.connect(g); } else o.connect(g); send(g, wetV); o.start(T(t0)); o.stop(T(t1) + .05); };
        const noise = (t0, t1, pts, type, f0, f1, wetV = .2, q = 1) => { const n = A.createBufferSource(); n.buffer = nb; n.loop = true; const fl = A.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, T(t0)); fl.frequency.exponentialRampToValueAtTime(f1, T(t1)); const g = A.createGain(); env(g, pts); n.connect(fl); fl.connect(g); send(g, wetV); n.start(T(t0)); n.stop(T(t1) + .05); };
        const up = [[0, 0], [1.5, .14], [3.55, .34], [3.6, 0]];
        for (const f of [41.2, 43.7, 61.7]) osc("sawtooth", f, f * 1.06, 0, 3.6, up, [90, 1100], .25);
        noise(0, 3.6, [[0, 0], [2, .05], [3.55, .3], [3.6, 0]], "bandpass", 240, 5200, .3, 1.4);
        for (const f of [440, 466.2, 659.3]) osc("triangle", f, f * 1.5, .8, 3.6, [[.8, 0], [3.55, .055], [3.6, 0]], null, .4);
        for (const t of [.9, 1.3, 1.46, 2.05, 2.2, 2.65, 2.95, 3.08, 3.2, 3.32]) { osc("square", 110, 96, t, t + .07, [[t, 0], [t + .004, .13], [t + .06, .1], [t + .07, 0]], null, .1); noise(t, t + .07, [[t, 0], [t + .004, .16], [t + .07, 0]], "highpass", 3000, 3000, .1); }
        const S = 4.1;
        osc("sine", 96, 24, S, S + 1.7, [[S, 0], [S + .006, 1], [S + .5, .55], [S + 1.7, 0]], null, .12);
        noise(S, S + .5, [[S, 0], [S + .004, .9], [S + .5, 0]], "lowpass", 3400, 180, .9);
        for (const [f, v] of [[172, .3], [247, .26], [391, .2], [563, .15], [887, .1], [1421, .06]]) osc("square", f, f * .985, S, S + 2.2, [[S, 0], [S + .004, v], [S + .25, v * .4], [S + 2.2, 0]], [2600, 500], .95);
        const D = 4.9, E = 19, swell = [[D, 0], [D + 2.4, .2], [D + 5, .13], [E - 3, .17], [E, 0]];
        for (const f of [36.7, 55, 58.3, 82.4]) osc("sawtooth", f, f * 1.01, D, E, swell, [420, 300], .3);
        for (const f of [1318.5, 1396.9, 1480]) osc("sine", f, f * .99, D + 1.2, E, [[D + 1.2, 0], [D + 4.5, .018], [E - 3, .012], [E, 0]], null, .9);
        noise(D, E, [[D, 0], [D + 3, .05], [D + 6, .022], [E - 3, .04], [E, 0]], "bandpass", 900, 1500, .7, 2.2);
        for (let t = 5.5, gap = .92, n = 0; t < E - 1 && n < 16; t += gap, gap = Math.max(.74, gap * .985), n++) { const v = .85 * Math.min(1, n / 2 + .4); osc("sine", 70, 40, t, t + .2, [[t, 0], [t + .012, v], [t + .2, 0]], null, .05); osc("sine", 60, 36, t + .24, t + .42, [[t + .24, 0], [t + .252, v * .68], [t + .42, 0]], null, .05); }
        const G = 7.05;
        for (const f of [73.4, 77.8, 110, 116.5, 155.6, 164.8, 233]) osc("sawtooth", f, f * .97, G, G + 1.4, [[G, 0], [G + .03, .16], [G + .34, .09], [G + 1.4, 0]], [2400, 340], .85);
        noise(G + .2, G + 2.4, [[G + .2, 0], [G + .9, .1], [G + 2.4, 0]], "bandpass", 1600, 560, .8, 1.2);
    };
    const FLICK = [[0, 0], [.85, 0], [.9, .7], [1, .05], [1.28, 0], [1.32, .85], [1.42, .2], [1.48, .9], [1.7, .15], [2.03, .1], [2.08, .95], [2.18, .3], [2.24, 1], [2.5, .4], [2.65, .35], [2.7, 1], [2.92, .6], [2.97, 1], [3.05, .5], [3.1, 1], [3.18, .6], [3.22, 1], [3.3, .7], [3.34, 1], [3.6, 1]];
    const dimAt = T => { for (let i = 1; i < FLICK.length; i++) if (T <= FLICK[i][0]) { const [a, b] = FLICK[i - 1], [x, y] = FLICK[i]; return b + (y - b) * ((T - a) / (x - a)); } return 1; };
    const N = n => { const s = Math.sin(n * 91.7) * 43758.5; return s - Math.floor(s); };
    const B_ = { floor: null, t0: 0, scoreOn: false, timer: 0, dust: null, scareDue: 0, rolled: false };
    /* dust everywhere on this floor, with real height, so some passes behind you */
    function makeDust(l) { const out = []; l.cells.forEach((c, ci) => { const [cx, cy] = c.split(",").map(Number), z0 = LIVE.nodeZ(l, cx * 2, cy * 2) || 0; for (let k = 0; k < 2; k++) { const i = ci * 2 + k; out.push({ x: cx * 2 + N(i) * 2, y: cy * 2 + N(i + 500) * 2, z: z0 + N(i + 900) * 70, delay: N(i + 1300) * 5, sp: .35 + N(i + 1700) * .85, ph: N(i + 2100) * 6.28, big: i % 7 === 0, a: .62 + N(i + 2900) * .38 }); } }); return out; }
    function drawDust(c, ox, oy, now, nearer) {
        if (!B_.t0 || !B_.dust || !LIVE.walker) return; const T = (now - B_.t0) / 1000; if (T > 3.6 && T < 4.1) return; const t = now / 1000, w = LIVE.walker, wd = w.x + w.y + 1, v = LIVE.view();
        c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom);
        for (const d of B_.dust) { const on = Math.min(1, Math.max(0, (T - .9 - d.delay) / 3)); if (on <= 0) continue; const drift = (((t * .03 * d.sp + d.ph) % 6) + 6) % 6 - 3, X = d.x + Math.sin(t * .15 * d.sp + d.ph) * .7 + drift, Y = d.y + Math.cos(t * .12 * d.sp + d.ph) * .7 - drift * .6, Z = d.z + Math.sin(t * .2 * d.sp + d.ph) * 7; if ((X + Y >= wd) !== nearer) continue; const p = LIVE.mapPoint(X, Y, Z); if (p[0] < v.x0 - 4 || p[0] > v.x1 + 4 || p[1] < v.y0 - 4 || p[1] > v.y1 + 4) continue;
            const a = on * d.a * (.68 + Math.sin(t * .9 + d.ph) * .32) * Math.min(1, (3 - Math.abs(drift)) / .6); c.fillStyle = `rgba(226,218,238,${a})`; if (d.big) { c.fillRect(p[0], p[1], 2, 2); c.fillStyle = `rgba(226,218,238,${a * .35})`; c.fillRect(p[0] - 1, p[1], 4, 2); c.fillRect(p[0], p[1] - 1, 2, 4); } else c.fillRect(p[0], p[1], 1, 1); }
    }
    function figure(c, X, Y) { c.fillStyle = "#020104"; c.beginPath(); c.ellipse(X, Y - 62, 4, 5, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(X - 3.5, Y - 57); c.quadraticCurveTo(X - 10, Y - 53, X - 8.5, Y - 30); c.lineTo(X - 7.5, Y - 11); c.lineTo(X - 4.5, Y - 29); c.lineTo(X - 4, Y); c.lineTo(X - .5, Y); c.lineTo(X, Y - 26); c.lineTo(X + 1, Y); c.lineTo(X + 4.5, Y); c.lineTo(X + 4.5, Y - 29); c.lineTo(X + 8, Y - 10); c.lineTo(X + 9.5, Y - 31); c.quadraticCurveTo(X + 10, Y - 53, X + 3.5, Y - 57); c.closePath(); c.fill(); }
    /* it stands in the nearest doorway you can see, or the lift's */
    function figureSpot() { const l = B_.floor, v = LIVE.view(), list = []; for (const d of (l.doors || [])) { if (d.spare) continue; const z = LIVE.nodeZ(l, d.axis === "x" ? Math.floor(d.at) : d.line, d.axis === "x" ? d.line : Math.floor(d.at)) || 0; list.push(d.axis === "x" ? LIVE.mapPoint(d.at + 1, d.line, z) : LIVE.mapPoint(d.line, d.at + 1, z)); } for (const q of LIVE.map.lifts) if (q.level === l.id) list.push(q.axis === "y" ? LIVE.mapPoint(q.x, q.y + 1, l.k * 163) : LIVE.mapPoint(q.x + 1, q.y, l.k * 163)); const seen = list.filter(p => p[0] > v.x0 && p[0] < v.x1 && p[1] > v.y0 && p[1] < v.y1), cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2; seen.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy)); return seen[0] || null; }
    /* the moods the scare goes through, every frame until it's over; at the end of it the lights stay gone until you leave */
    function moodAt(T) { if (T < .85) return null; if (T < 3.6) { const d = dimAt(T); return d <= .5 ? { a: "dusk", b: "failing", f: Math.min(1, d * 1.5) } : { a: "failing", b: "night", f: (d - .5) * 2 }; } return { a: "night", b: "failing", f: T < 5 ? 0 : Math.min(.55, (T - 5) * .12) }; }
    const scaring = () => !!B_.t0;
    function scareStart() {
        const l = B_.floor; if (!l || B_.t0 || !LIVE.walker) return false; B_.t0 = performance.now(); B_.dust = B_.dust || makeDust(l); B_.spot = undefined; LIVE.wake();
        if (!muted()) { const A = ac(); if (A) { eerieOff(); B_.scoreOn = true; const g = A.createGain(); g.gain.value = 1; g.connect(A.destination); B_.scoreOut = g; SCORE(A, g, A.currentTime + .03); clearTimeout(resumeEerie); resumeEerie = setTimeout(() => { B_.scoreOn = false; if (wantEerie) eerieOn(volumeNow); }, 16500); } }
        return true;
    }
    function scareStop() { const was = B_.t0; B_.t0 = 0; B_.dust = null; LIVE.forceMood(null); const cv = document.querySelector("#liveCanvasShake"); if (cv) cv.removeAttribute("id"); if (B_.shook) { B_.shook.style.transform = ""; B_.shook = null; } clearTimeout(resumeEerie); if (B_.scoreOut && B_.scoreOn) { const A = ac(); B_.scoreOut.gain.setTargetAtTime(0, A.currentTime, .4); } B_.scoreOn = false; const w = LIVE.walker; if (w && B_.froze) letGo(w); B_.froze = false; return !!was; }
    const letGo = w => { if (B_.held && w && w.busy) w.busy = false; B_.held = false; };
    /* back to a tab that was hidden through the end of the scare: no shake left, and the light where the scare leaves it */
    document.addEventListener("visibilitychange", () => { if (document.hidden || !B_.t0) return; const T = (performance.now() - B_.t0) / 1000; if (T >= 5.1 && B_.shook) { B_.shook.style.transform = ""; B_.shook = null; } if (T >= 30) LIVE.forceMood(moodAt(30)); LIVE.wake(); });
    LIVE.add({ active: () => !!B_.t0 && performance.now() - B_.t0 < 30000 && !!LIVE.walker && !(window.HallwayScreensaver && HallwayScreensaver.on),
        under(c, ox, oy, now) { const T = (now - B_.t0) / 1000; c.save(); const m = moodAt(T); if (m) LIVE.forceMood(m); drawDust(c, ox, oy, now, false); c.restore();
            /* the Habbo stops dead when the door goes */
            /* only what the scare itself held is let go: a lift ride already under way keeps its own hold until its doors open (15 Nov scan,
               live L11: the scare's let-go walked you out through shut doors) */
            const w = LIVE.walker; if (T > 4.1 && T < 7.5 && !B_.froze && w) { B_.froze = true; B_.held = !w.busy; if (B_.held) { w.pts = (w.pts || []).slice(0, 1); w.then = null; w.busy = true; }
                /* and let go by a timer too: with the tab hidden through the rest of the scare this layer never draws again, and the Habbo stayed frozen (10 Nov scan b, live 8);
                   the shake and the light are put to their end there too, or they stayed a few pixels off and at the first "lights out" (15 Nov scan, live L10) */
                const t0 = B_.t0; setTimeout(() => { if (B_.t0 !== t0) return; letGo(w); if (B_.shook) { B_.shook.style.transform = ""; B_.shook = null; } if (document.hidden) LIVE.forceMood(moodAt(30)); }, Math.max(0, (7.5 - T) * 1000) + 50); } if (T >= 7.5 && B_.froze && w) letGo(w);
            const cv = c.canvas; if (T > 4.1 && T < 5.1) { const k = Math.pow(5.1 - T, 2) * 14; cv.style.transform = `translate(${Math.sin(T * 71) * k}px,${Math.cos(T * 93) * k}px)`; B_.shook = cv; } else if (B_.shook) { cv.style.transform = ""; B_.shook = null; } },
        over(c, ox, oy, now) { const T = (now - B_.t0) / 1000, W2 = c.canvas.width, H2 = c.canvas.height;
            if (T > 3.6 && T < 4.1) { c.fillStyle = "#000"; c.fillRect(0, 0, W2, H2); return; }
            c.save(); drawDust(c, ox, oy, now, true); c.restore();
            if ((T > 7.05 && T < 7.14) || (T > 7.22 && T < 7.3)) { c.save(); c.fillStyle = "rgba(255,200,150,.22)"; c.fillRect(0, 0, W2, H2); if (B_.spot === undefined) B_.spot = figureSpot(); if (B_.spot) { c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); figure(c, B_.spot[0], B_.spot[1]); } c.restore(); }
            if (T > 4.1 && T < 4.35) { c.fillStyle = `rgba(232,226,240,${(4.35 - T) * 3.4})`; c.fillRect(0, 0, W2, H2); }
            if (T > 4.1) { const beat = T > 5.5 && T < 19 ? Math.pow(Math.max(0, Math.cos((T - 5.5) * Math.PI * 2 / .86)), 8) : 0, R = Math.hypot(W2, H2) / 2, inner = R * .48 - beat * R * .065, g = c.createRadialGradient(W2 / 2, H2 * .48, inner, W2 / 2, H2 * .48, R); g.addColorStop(0, "rgba(6,0,10,0)"); g.addColorStop(.6, `rgba(14,0,12,${.16 + beat * .12})`); g.addColorStop(1, "rgba(4,0,4,.62)"); c.fillStyle = g; c.fillRect(0, 0, W2, H2); } } });
    /* going in and out */
    LIVE.onFloor(f => {
        const inB = !!f && f.k < 0, A = window.HallwayAudio;
        if (inB && B_.floor !== f) { B_.floor = f; B_.rolled = false; const odds = LIVE.map.scareOdds === undefined ? 25 : +LIVE.map.scareOdds; if (odds > 0 && Math.random() < 1 / odds) B_.scareDue = performance.now() + 8000 + Math.random() * 22000; else B_.scareDue = 0; if (A) A.takeOver(VOICE); }
        if (!inB && B_.floor) { B_.floor = null; B_.scareDue = 0; scareStop(); if (A) A.giveBack(VOICE); eerieOff(); }
    });
    setInterval(() => { if (!B_.floor || document.hidden) return; if (B_.scareDue && performance.now() > B_.scareDue && !LIVE.busy) { B_.scareDue = 0; scareStart(); }
        /* the failing lights' pictures ready ahead of time */
        const v = LIVE.view(); for (let y = v.y0; y <= v.y1 + 512; y += 512) for (let x = v.x0; x <= v.x1 + 512; x += 512) for (const m of ["failing", "night", "dusk"]) LIVE.loadMood(m, x, y); }, 1500);
    window.HallwayBasement = { scare: scareStart, stop: scareStop, get scaring() { return scaring(); }, voice: VOICE, _score: SCORE, _eerie: EERIE };
})();

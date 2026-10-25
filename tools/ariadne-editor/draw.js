/* Ariadne's Thread level editor: the objects, lights and the editor's own
   marks, drawn fresh each frame (14 Oct 2026). Each object is drawn as the
   game draws it at rest, with the game's own pictures. */
(function () {
    "use strict";
    const AE = window.AE, S = AE.S, C = AE.CATALOG;
    const D = () => window.RatRace.dev;
    const TS = 16;
    const spr = (n, f, l) => D().spr(n, f || 0, Boolean(l));

    /* ---------------------------------------------------------------- THE OBJECTS */
    // the order the game draws them in, so what overlaps here overlaps there
    const ORDER = ["rails", "scree", "pool", "sluice", "torchbracket", "firegate", "zipline", "swing", "torch", "blast", "hatch", "pump", "vent", "brazier", "doorway", "exit", "tank", "coin", "gem", "life", "dynamite", "knife", "key", "crate", "icicle", "mover", "float", "falls", "flag", "alarm", "rat", "bat", "spider", "beetle", "hammer", "lizard", "hare", "crawler", "grub", "wisp", "bot", "jelly", "steam", "piston", "switch", "lava", "spout", "conveyor", "hourglass", "pour", "gear", "burner", "ooze", "drip", "bumper", "spring", "machine", "vine", "neon", "wreck", "waterfall", "start", "quicksand", "minecart", "mummy", "snake"];
    const rank = Object.fromEntries(ORDER.map((t, i) => [t, i]));
    const lavaPics = new WeakMap();   // each lava box's picture, drawn by the game's own lava
    AE.drawLive = function (g, vis) {
        const a = S.act, TH = D().theme(S.zone);
        // the things the game draws over the still picture each frame: rubble, roots, crumbling ledges
        if (S.layers.terrain) {
            D().paint(g, a, P => { for (const pile of a.piles) { const art = P.pileArt(pile); if (art.x < vis.x + vis.w && art.x + art.c.width > vis.x && art.y < vis.y + vis.h && art.y + art.c.height > vis.y) g.drawImage(art.c, art.x, art.y); } });
            for (const r of a.roots) if (inView(r.x * TS, r.y * TS, TS, TS, vis)) g.drawImage(spr("roots", (r.x + r.y) % 2), r.x * TS, r.y * TS);
            for (const c of a.crumbles.values()) if (inView(c.tx * TS, c.ty * TS, TS, TS, vis)) g.drawImage(spr("crumble", (c.tx + c.ty) % 2), c.tx * TS, c.ty * TS);
        }
        if (!S.layers.objects && !S.layers.lights) return;
        const list = S.spec.objects.filter(o => rank[o.type] !== undefined && AE.near(o, vis) && (o.type === "torch" ? S.layers.lights : S.layers.objects));
        list.sort((p, q) => rank[p.type] - rank[q.type]);
        for (const o of list) drawObject(g, o, TH);
    };
    const inView = (x, y, w, h, v) => x < v.x + v.w && x + w > v.x && y < v.y + v.h && y + h > v.y;

    function drawObject(g, o, TH) {
        const a = S.act, x = o.x, y = o.y;
        switch (o.type) {
            case "torch": {
                const style = D().lampStyle(o), L = D().lampAt(style);
                if (o.radius !== 0 && o.intensity !== 0) {
                    const [lr, lg, lb] = o.color ? hexRgb(o.color) : TH.glow, I = typeof o.intensity === "number" ? o.intensity : 0.3, Rr = o.radius > 0 ? o.radius : 70;
                    const gr = g.createRadialGradient(x + L.gx, y + L.gy, 2, x + L.gx, y + L.gy, Rr);
                    gr.addColorStop(0, `rgba(${lr},${lg},${lb},${I})`); gr.addColorStop(0.5, `rgba(${lr},${Math.round(lg * 0.77)},${Math.round(lb * 0.6)},${I / 3})`); gr.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
                    g.fillStyle = gr; g.fillRect(x + L.gx - Rr, y + L.gy - Rr, Rr * 2, Rr * 2);
                }
                const rgb = o.color ? hexRgb(o.color) : null, ft = (Math.floor(x / 16) * 13 + Math.floor(y / 16) * 7) % 4;
                if (o.lamp !== false && style !== "wall") D().paint(g, a, () => D().drawLamp(g, style, x, y, ft, a, rgb));
                else if (o.lamp !== false) { const [base, fl] = D().wallLampArt(rgb, ft); g.drawImage(base, x + L.bx, y + L.by); g.drawImage(fl, x + L.fx, y + L.fy); }
                else mark(g, x + 8, y + 2, "#ffcf6a", "✶");
                break;
            }
            case "blast": g.drawImage(spr("blast"), x, y); wheels(g, o); break;
            case "hatch": g.drawImage(spr("hatch"), x, y + 2); wheels(g, o); break;
            case "pump": D().paint(g, a, P => P.drawPump({ open: false, spin: 0, prog: 0 }, x, y)); break;
            case "vent": { const X = x, Y = y - 4; g.fillStyle = "#0a0e14"; g.fillRect(X + 1, Y, 14, 4); g.fillRect(X + 3, Y - 1, 10, 1); g.fillStyle = "#6a7686"; g.fillRect(X + 2, Y + 1, 12, 3); g.fillRect(X + 4, Y, 8, 1); g.fillStyle = "#1a2028"; for (let i = 0; i < 4; i++) g.fillRect(X + 3 + i * 3, Y + 1, 1, 2); g.fillStyle = "#b8c4d2"; g.fillRect(X + 4, Y, 8, 1); bubbles(g, x + 8, y - 10); break; }
            case "brazier": g.drawImage(spr("brazier"), x, y); if (o.lit) g.drawImage(spr("fire"), x + 2, y + 1); break;
            case "doorway": g.drawImage(spr("door"), x, y); if (o.lock) g.drawImage(spr("padlock"), x + 11, y + 22); if (S.overlays.labels) tag(g, x + 16, y - 3, (o.id || "?") + " → " + (o.to || "?"), "#7fd8ff"); break;
            case "exit": g.drawImage(spr("door"), x, y); g.drawImage(spr("padlock"), x + 11, y + 22); break;
            case "tank": g.drawImage(spr("tank"), x - 2, y); break;
            case "coin": g.drawImage(spr("coin"), x, y); break;
            case "gem": g.drawImage(spr("gem"), x, y); break;
            case "life": g.drawImage(spr("hat"), x, y); break;
            case "dynamite": g.drawImage(spr("dynamite"), x, y); break;
            case "key": g.drawImage(spr("key"), x, y); if (o.opens && S.overlays.labels) tag(g, x + 6, y - 3, o.opens, "#ffd84a"); break;
            case "crate": D().paintCrate(g, { x, y, hang: Boolean(o.hang), hang0: Boolean(o.hang), cutY: null, tail: 0, vy: 0, ropeTop: o.hang ? D().ropeTopOf(S.act, x, y) : 0 }); break;
            case "knife": g.drawImage(spr("knife"), x, y); break;
            case "icicle": g.drawImage(spr("icicle"), x, y); break;
            case "mover": drawMover(g, o, TH); break;
            case "float": D().paint(g, a, P => P.drawFloat({ x, y, w: 48 })); break;
            case "falls": g.fillStyle = "#1a0f08"; g.fillRect(x + 5, y, 6, 2); g.fillRect(x + 7, y + 2, 2, 1); g.drawImage(spr("rock"), x + 2, y + 8); g.globalAlpha = 1; break;
            case "flag": g.drawImage(spr("flag"), x, y); break;
            case "alarm": { g.fillStyle = "#1a0606"; g.fillRect(x + 3, y + 3, 10, 10); g.fillStyle = "#d8322a"; g.fillRect(x + 4, y + 4, 8, 8); g.fillStyle = "#ff8a7a"; g.fillRect(x + 5, y + 5, 3, 2); g.fillStyle = "#ffffff"; g.fillRect(x + 7, y + 5, 2, 4); g.fillRect(x + 7, y + 10, 2, 1); break; }
            case "hammer": {
                // its rope up to the roof above it
                const tx = Math.floor((x + 8) / TS); let cy = Math.floor(y / TS); while (cy > 0 && AE.tileAt("tiles", tx, cy - 1) !== "#") cy--;
                const top = cy * TS, rx = x + 15;
                g.fillStyle = "#0e0e14"; g.fillRect(rx - 4, top, 10, 3); g.fillStyle = "#6e6e84"; g.fillRect(rx - 3, top, 8, 2);
                for (let yy = top + 3; yy < top + 3; yy++) { /* hangs at the roof */ }
                g.drawImage(spr("hammer"), x, top + 2);
                if (top + 2 !== y) { g.globalAlpha = 0.35; g.drawImage(spr("hammer"), x, y); g.globalAlpha = 1; }
                break;
            }
            case "spider": { const len = 18 + ((o.drop > 0 ? o.drop : 68) / 2); g.fillStyle = "rgba(220,220,230,0.7)"; g.fillRect(x + 7, y, 1, len); g.drawImage(spr("spider"), x, y + len); g.globalAlpha = 0.3; g.drawImage(spr("spider"), x, y); g.globalAlpha = 1; break; }
            case "steam": D().paint(g, a, P => P.drawSteam({ side: steamSide(o), tx: Math.floor(o.x / TS), y: o.y, t: 0, out: 0 })); break;
            case "lizard": { const tx = Math.floor(x / TS), ty = Math.floor(y / TS), side = AE.tileAt("tiles", tx - 1, ty) === "#" ? -1 : 1; g.drawImage(spr("lizard", 0, side > 0), side < 0 ? tx * TS : tx * TS + 8, y); break; }
            case "start": g.drawImage(spr("scoutIdle"), x - 3, y - 2); break;
            // (14 Oct 2026) the new zones'
            case "switch": { const k = o.kind || "beatA", c = k === "beatA" ? "#b07a28" : k === "beatB" ? "#7a8a9a" : k === "rain" ? "#7a5230" : "#3a6a22"; g.fillStyle = "#1a120a"; g.fillRect(x, y, 16, 16); g.fillStyle = c; g.fillRect(x + 1, y + 1, 14, 14); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x + 1, y + 1, 14, 2); if (S.overlays.labels) tag(g, x + 8, y - 3, { beatA: "beat A", beatB: "beat B", rain: "rain", sun: "sun" }[k], "#ffd84a"); break; }
            case "piston": { const side = AE.tileAt("tiles", Math.floor(x / TS) - 1, Math.floor((y - 3) / TS)) === "#" ? 1 : -1, wallX = side > 0 ? Math.floor(x / TS) * TS : Math.floor(x / TS) * TS + TS; g.fillStyle = "#7a8a9a"; g.fillRect(side > 0 ? wallX : wallX - 5, y - 4, 5, 18); g.fillStyle = "#c8962e"; g.fillRect(side > 0 ? wallX + 5 : wallX - 11, y - 1, 6, 12); g.globalAlpha = 0.35; g.fillStyle = "#c8d2de"; g.fillRect(side > 0 ? wallX + 5 : wallX - 41, y + 3, 36, 4); g.globalAlpha = 1; break; }
            case "lava": { const w = o.w || 16, h = o.h || 16; let B = lavaPics.get(o); if (!B || B.w !== w || B.h !== h || B.tx !== x / TS || B.ty !== y / TS) { B = { tx: x / TS, ty: y / TS, w, h, top: true, bubbles: [], rings: [] }; lavaPics.set(o, B); D().paint(g, a, P => P.paintLava(B)); } g.drawImage(B.c, x, y); break; }
            // (14 Oct 2026) the Steamworks': a gear wheel and its ledges (static ones marked), a fire jet (its flame, faint), a dripping pipe, a water drip
            case "gear": { const R = o.r > 0 ? o.r : 40, ang = (o.phase || 0) * Math.PI / 180; D().paint(g, a, P => P.drawGear({ cx: x, cy: y, R, ang })); if (o.static && S.overlays.labels) tag(g, x, y - R - 8, "static", "#ffd27a"); break; }
            case "burner": { const L = o.len > 0 ? o.len : 44, b = { x, y, dir: o.dir || "up", len: L }; D().paint(g, a, P => { P.drawNozzle(b, 0.6); const J = { up: [8, 7, -Math.PI / 2], down: [8, 9, Math.PI / 2], left: [7, 8, Math.PI], right: [9, 8, 0] }[b.dir] || [8, 7, -Math.PI / 2]; const img = P.jetImage(b, L); g.save(); g.globalAlpha = 0.45; g.translate(x + J[0], y + J[1]); g.rotate(J[2]); g.drawImage(img, 0, -8); g.restore(); }); break; }
            case "ooze": { const oz = { x, y, len: o.len > 0 ? o.len : 12, every: 170, t: 70 }; D().paint(g, a, P => { P.drawOozePipe(oz); P.drawGlob(x + 8, y + oz.len + 1, 2.4, 0.75); }); break; }
            case "bumper": case "spring": { const toy = o.type === "bumper" ? { bumpers: [{ x: x + 8, y: y + 8, r: o.r > 0 ? o.r : 9, ci: o.color >= 0 ? o.color : (Math.floor(x / TS) * 3 + Math.floor(y / TS)) % 5, k: 0, rings: [] }], springs: [] } : { bumpers: [], springs: [{ x, y, sq: 0 }] }; D().paint(g, Object.assign(Object.create(a), toy), P => P.drawToys({ x: x - 100, y: y - 100 })); break; }
            case "machine": case "vine": case "neon": case "wreck": case "waterfall": D().paint(g, a, P => P.drawDecoOne(o)); break;
            case "drip": g.fillStyle = "#3a6a8a"; g.fillRect(x + 6, y, 3, 1); g.fillStyle = "#9fd0ee"; g.fillRect(x + 7, y + 1, 1, 2); g.fillRect(x + 7, y + 6, 1, 3); break;
            case "spout": g.fillStyle = "#1a0806"; g.fillRect(x + 2, y + 6, 12, 10); g.fillStyle = "#ff8a30"; g.fillRect(x + 4, y + 8, 8, 6); g.fillStyle = "#ffd080"; g.fillRect(x + 4, y + 8, 8, 2); break;
            case "conveyor": { const w = o.w || 16; g.fillStyle = "#0e0e14"; g.fillRect(x, y, w, 5); for (let i = 0; i < w; i++) { if (((i - (o.dx < 0 ? -1 : 1) * 0) % 6 + 6) % 6 < 2) { g.fillStyle = "#5a5a68"; g.fillRect(x + i, y + 1, 1, 3); } } g.fillStyle = "#9a9aae"; g.fillRect(x + 1, y + 1, 3, 3); g.fillRect(x + w - 4, y + 1, 3, 3); if (S.overlays.labels) tag(g, x + w / 2, y - 3, o.dx < 0 ? "<<" : ">>", "#cfd8e8"); break; }
            case "hourglass": { const X = x + 2, Y = y - 6; g.fillStyle = "#1a120a"; g.fillRect(X - 1, Y, 14, 3); g.fillRect(X - 1, Y + 19, 14, 3); g.fillStyle = "#c8962e"; g.fillRect(X, Y + 1, 12, 1); g.fillRect(X, Y + 20, 12, 1); g.fillStyle = "#7a5418"; g.fillRect(X, Y + 3, 1, 16); g.fillRect(X + 11, Y + 3, 1, 16); g.fillStyle = "#e8c070"; g.fillRect(X + 3, Y + 13, 6, 5); g.fillStyle = "rgba(207,238,252,0.55)"; g.fillRect(X + 3, Y + 4, 6, 8); break; }
            case "pour": g.fillStyle = "#e8c070"; g.fillRect(x + 5, y, 6, 40); g.fillStyle = "#f8dc98"; g.fillRect(x + 6, y, 2, 40); break;
            // (22 Oct 2026) the new mechanics' and creatures', as the game draws them at rest
            case "swing": case "zipline": case "scree": case "quicksand": case "minecart": case "rails": case "pool": case "sluice": case "torchbracket": case "firegate": case "mummy": case "snake":
                D().paint(g, a, P => P.drawNewAtRest(o)); break;
            default:
                if (D().FOES.has(o.type)) g.drawImage(spr(o.type, 0, o.dir !== 1), x, y);
        }
        // a creature that cannot be stomped wears a small spiked mark; one that can, though usually not, a boot
        if (D().FOES.has(o.type) && S.overlays.labels && o.stomp !== undefined && o.stomp !== null && o.type !== "steam" && o.type !== "hammer") tag(g, x + 8, y - 3, o.stomp ? "stomp" : "no stomp", o.stomp ? "#9fe39f" : "#ff8a8a");
    }
    const steamSide = o => (AE.tileAt("tiles", Math.floor(o.x / TS) - 1, Math.floor((o.y - 4) / TS)) === "#" ? 1 : -1);
    function wheels(g, o) {
        const X = o.x, Y = o.y;
        const solid = (tx, ty) => { const c = AE.tileAt("tiles", tx, ty); return c === "#" || c === null; };
        const spots = o.type === "blast" ? [[X - 15, Y + 18], [X + TS + 1, Y + 18]].filter(([wx]) => !solid(Math.floor((wx + 7) / TS), Math.floor(Y / TS) + 1)) : [[X + 17, Y + TS + 1], [X + 17, Y - 15]].filter(([, wy]) => !solid(Math.floor(X / TS) + 1, Math.floor((wy + 7) / TS)));
        for (const [wx, wy] of spots) g.drawImage(spr("wheel"), wx, wy);
    }
    function bubbles(g, x, y) { g.strokeStyle = "rgba(220,245,255,0.7)"; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x + 3, y - 7, 2, 0, Math.PI * 2); g.stroke(); }
    function drawMover(g, o, TH) {
        const w = o.w || 48, tx = o.tx !== undefined ? o.tx : Math.floor(o.x / TS), ty = o.ty !== undefined ? o.ty : Math.floor(o.y / TS);
        // as the game draws it: the zone's own rigging (the Quarry's cable and trolley, its pulley) for one that goes across or up and down
        if (TH.mover && o.axis !== "path") {
            /* (23 Oct 2026) the act's own lift where it has one: it knows which lifts share its headframe, and a linked pair's
               second stands where the game starts it (as far down as the first is up); else this one alone, as it is */
            const am = o.axis === "v" && S.act && S.act.movers ? S.act.movers.find(q => q.kind === "v" && q.obj && q.obj.x === o.x && q.obj.y === o.y && (q.obj.w || 48) === w && q.y0 === Math.min(o.min, o.max) && q.y1 === Math.max(o.min, o.max)) : null;
            const m = am || { kind: o.axis === "v" ? "v" : "h", tx, ty, x: o.x, y: o.y, w, crane: o.crane || "auto", pair: o.pair === true };
            if (!am) { if (m.kind === "h") { m.x0 = Math.min(o.min, o.max); m.x1 = Math.max(o.min, o.max); } else { m.y0 = Math.min(o.min, o.max); m.y1 = Math.max(o.min, o.max); } }
            try { if (TH.mover.back) TH.mover.back(g, m, S.act, D().helpers()); TH.mover(g, m, S.act, D().helpers()); } catch (e) { D().platform(g, Math.round(o.x), Math.round(o.y), w, { seed: tx * 7 }); }
        } else D().platform(g, Math.round(o.x), Math.round(o.y), w, { seed: tx * 7 });
        if (!S.overlays.paths) return;
        g.save();
        g.strokeStyle = "rgba(255,220,90,0.75)"; g.fillStyle = "rgba(255,220,90,0.85)"; g.lineWidth = 1 / S.view.z;
        g.setLineDash([4 / S.view.z, 3 / S.view.z]);
        if (o.axis === "v") { const cx = o.x + w / 2; g.beginPath(); g.moveTo(cx, o.min); g.lineTo(cx, o.max + 11); g.stroke(); g.setLineDash([]); g.strokeRect(o.x, o.min, w, 11); g.strokeRect(o.x, o.max, w, 11); }
        else if (o.axis === "path") pathLine(g, o, w / 2, 5);
        else { const cy = o.y + 5; g.beginPath(); g.moveTo(o.min, cy); g.lineTo(o.max + w, cy); g.stroke(); g.setLineDash([]); g.strokeRect(o.min, o.y, w, 11); g.strokeRect(o.max, o.y, w, 11); }
        g.restore();
    }
    function pathLine(g, o, ox, oy) {
        const pts = [{ x: o.x, y: o.y }, ...(o.path || [])];
        if (pts.length < 2) return;
        g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x + ox, p.y + oy) : g.moveTo(p.x + ox, p.y + oy)));
        if (o.loop) g.closePath();
        g.stroke();
    }
    AE.pathLine = pathLine;
    function mark(g, x, y, col, ch) { g.save(); g.fillStyle = col; g.font = "bold 10px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ch, x, y); g.restore(); }
    // a little label over something, drawn crisp at any zoom
    function tag(g, wx, wy, text, col) {
        if (S.view.z < 1) return;
        const p = AE.toScreen(wx, wy), dpr = AE.R.dpr;
        g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.font = "600 10px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "bottom";
        const w = g.measureText(text).width + 8;
        g.fillStyle = "rgba(10,11,14,0.82)"; g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 15), Math.round(w), 14);
        g.fillStyle = col; g.fillText(text, Math.round(p.x), Math.round(p.y - 3));
        g.restore();
    }
    AE.tag = tag;
    const hexRgb = hx => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hx || "")); if (!m) return [255, 176, 80]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    AE.hexRgb = hexRgb;

    /* ---------------------------------------------------------------- THE LIGHTS
       The level's lights as the game adds them; with the lighting preview
       on, the dark too, where the passage is dark, opened round each light. */
    AE.drawLights = function (g, vis) {
        const lights = S.spec.objects.filter(o => o.type === "light" && AE.near(o, vis));
        g.save();
        g.globalCompositeOperation = "lighter";
        for (const o of lights) {
            const L = D().lightOf(o);
            if (L.kind === "beacon") { const R = L.radius || 70, [r, gg, b] = L.rgb; const gr = g.createRadialGradient(L.x, L.y, 1, L.x, L.y, R); gr.addColorStop(0, `rgba(${r},${gg},${b},${L.intensity * 0.8})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); g.fillStyle = gr; g.fillRect(L.x - R, L.y - R, R * 2, R * 2); continue; }
            if (!(L.intensity > 0)) continue;
            const [r, gg, b] = L.rgb, I = L.intensity;
            if (L.kind === "shaft") {
                g.save(); g.translate(L.x, L.y); g.rotate((L.angle - 90) * Math.PI / 180);
                const gr = g.createLinearGradient(0, 0, 0, L.h); gr.addColorStop(0, `rgba(${r},${gg},${b},${I})`); gr.addColorStop(0.7, `rgba(${r},${gg},${b},${I * 0.35})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
                g.fillStyle = gr; g.beginPath(); g.moveTo(-L.w / 2, 0); g.lineTo(L.w / 2, 0); g.lineTo(L.w * 0.8, L.h); g.lineTo(-L.w * 0.8, L.h); g.closePath(); g.fill();
                g.restore(); continue;
            }
            if (!(L.radius > 0)) continue;
            const gr = g.createRadialGradient(L.x, L.y, 1, L.x, L.y, L.radius);
            gr.addColorStop(0, `rgba(${r},${gg},${b},${I})`); gr.addColorStop(0.5, `rgba(${r},${gg},${b},${I / 3})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
            g.fillStyle = gr;
            if (L.kind === "spot") { const a0 = (L.angle - L.spread / 2) * Math.PI / 180, a1 = (L.angle + L.spread / 2) * Math.PI / 180; g.beginPath(); g.moveTo(L.x, L.y); g.arc(L.x, L.y, L.radius, a0, a1); g.closePath(); g.fill(); }
            else g.fillRect(L.x - L.radius, L.y - L.radius, L.radius * 2, L.radius * 2);
        }
        g.restore();
        if (S.overlays.lighting) drawDarkness(g, vis);
    };
    // the dark of a dark passage, opened round its lights (as js/rat-race.js's drawDark, over the whole view)
    let darkCv = null;
    function drawDarkness(g, vis) {
        const TH = D().theme(S.zone), SD = S.spec.settings.dark;
        const on = SD && (SD.on === true || SD.on === false) ? SD.on : Boolean(TH.dark);
        // (17 Oct 2026) or only its dark areas, where it has them
        const zones = on ? [] : S.spec.objects.filter(o => o.type === "darkzone").map(o => ({ x: o.x, y: o.y, w: Math.max(16, o.w || 160), h: Math.max(16, o.h || 112), fade: o.fade >= 0 ? o.fade : 32, depth: o.depth >= 0 ? o.depth : 3, rgb: hexRgb(o.color || "#030207"), a: o.alpha >= 0 && o.alpha <= 1 ? o.alpha : 0.965, fill: `rgba(${hexRgb(o.color || "#030207").join(",")},${o.alpha >= 0 && o.alpha <= 1 ? o.alpha : 0.965})`, clear: `rgba(${hexRgb(o.color || "#030207").join(",")},0)` }));
        const paint = on ? null : D().darkPaintArt(S.act);
        if (!on && !zones.length && !paint) return;
        const W = Math.ceil(vis.w), H = Math.ceil(vis.h);
        if (!darkCv || darkCv.width !== W || darkCv.height !== H) { darkCv = document.createElement("canvas"); darkCv.width = W; darkCv.height = H; }
        const x = darkCv.getContext("2d");
        x.globalCompositeOperation = "source-over"; x.clearRect(0, 0, W, H);
        if (zones.length || paint) { for (const z of zones) D().darkZoneFill(x, z, vis.x, vis.y, S.act); if (paint) x.drawImage(paint.c, paint.x - vis.x, paint.y - vis.y); }
        else { x.fillStyle = SD && typeof SD.alpha === "number" ? `rgba(${hexRgb(SD.color || "#030207").join(",")},${SD.alpha})` : TH.darkFill || "rgba(3,2,7,0.965)"; x.fillRect(0, 0, W, H); }
        x.globalCompositeOperation = "destination-out";
        const hole = (wx, wy, r, k) => { const K = k === undefined ? 1 : k, sx = wx - vis.x, sy = wy - vis.y; if (sx < -r || sy < -r || sx > W + r || sy > H + r || !(r > 0) || !(K > 0)) return; const gr = x.createRadialGradient(sx, sy, r * 0.3, sx, sy, r); gr.addColorStop(0, `rgba(0,0,0,${K})`); gr.addColorStop(0.6, `rgba(0,0,0,${0.9 * K})`); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(sx - r, sy - r, r * 2, r * 2); };
        const lampGy = TH.lampAt ? TH.lampAt.gy : 0;
        for (const o of S.spec.objects) {
            if (o.type === "torch") hole(o.x + 8, o.y + (o.style && o.style !== "wall" ? D().lampAt(D().lampStyle(o)).gy : lampGy), typeof o.reveal === "number" ? o.reveal : 86);
            else if (o.type === "light") hole(o.x, o.y, o.reveal || 0);
            else if (o.type === "brazier" && o.lit) hole(o.x + 8, o.y + 4, 92);
            else if (o.type === "flag") hole(o.x + 6, o.y + 8, 84);
            else if (o.type === "exit") hole(o.x + 16, o.y + 24, 54);
            else if (o.type === "key" && !o.opens) hole(o.x + 6, o.y + 10, 40);
            else if (o.type === "wisp") hole(o.x + 6, o.y + 6, 34);
            else if (o.type === "grub") hole(o.x + 10, o.y + 5, 30);
            else if (o.type === "start") { const t = S.spec.settings.torch, carry = t === true || ((t === undefined || t === null) && TH.dark && TH.torch); const ST = S.spec.settings, said = v => typeof v === "number" && v >= 0; hole(o.x + 5, o.y + 9, carry ? (said(ST.torchLight) ? ST.torchLight : 112) : (said(ST.heroLight) ? ST.heroLight : (TH.torch ? 34 : TH.heroLight || 64)), said(ST.heroLightK) ? Math.min(1, ST.heroLightK) : 1); }
        }
        g.drawImage(darkCv, vis.x, vis.y, W, H);
    }

    /* ---------------------------------------------------------------- THE EDITOR'S MARKS */
    AE.drawOverlays = function (g, vis) {
        const a = S.act, z = S.view.z, px = 1 / z;
        const x0 = Math.max(0, Math.floor(vis.x / TS)), y0 = Math.max(0, Math.floor(vis.y / TS)), x1 = Math.min(a.w, Math.ceil((vis.x + vis.w) / TS)), y1 = Math.min(a.h, Math.ceil((vis.y + vis.h) / TS));
        // what is hidden from the player until found: a faint hatch, the walk-behind walls outlined
        if (S.overlays.secrets && a.hidden) {
            g.fillStyle = "rgba(80,210,255,0.13)";
            for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) if (a.hidden[ty * a.w + tx]) g.fillRect(tx * TS, ty * TS, TS, TS);
            g.strokeStyle = "rgba(80,210,255,0.85)"; g.lineWidth = px;
            for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) if (S.spec.tiles[ty][tx] === "%") { g.setLineDash([3 * px, 2 * px]); g.strokeRect(tx * TS + px / 2, ty * TS + px / 2, TS - px, TS - px); }
            g.setLineDash([]);
        }
        if (S.overlays.covers && a.covers) {
            if (!a._coversDrawn) { D().theme(S.zone); D().renderCovers(a); a._coversDrawn = true; }
            for (const cv of a.covers) if (cv.canvas) g.drawImage(cv.canvas, cv.x, cv.y);
        }
        if (S.overlays.collision) drawCollision(g, vis, x0, y0, x1, y1);
        // the grid, and the rooms (a screen each)
        if (S.overlays.grid && z >= 0.75) {
            const step = S.grid.on && S.grid.size >= 4 && S.grid.size * z >= 6 ? S.grid.size : TS;
            g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = px;
            g.beginPath();
            for (let X = Math.floor(vis.x / step) * step; X <= vis.x + vis.w; X += step) { if (X < 0 || X > a.w * TS) continue; g.moveTo(X + px / 2, Math.max(0, vis.y)); g.lineTo(X + px / 2, Math.min(a.h * TS, vis.y + vis.h)); }
            for (let Y = Math.floor(vis.y / step) * step; Y <= vis.y + vis.h; Y += step) { if (Y < 0 || Y > a.h * TS) continue; g.moveTo(Math.max(0, vis.x), Y + px / 2); g.lineTo(Math.min(a.w * TS, vis.x + vis.w), Y + px / 2); }
            g.stroke();
        }
        if (S.overlays.rooms) {
            g.strokeStyle = "rgba(242,204,78,0.28)"; g.lineWidth = px * 1.5;
            g.beginPath();
            for (let X = 0; X <= a.w * TS; X += 20 * TS) { g.moveTo(X, 0); g.lineTo(X, a.h * TS); }
            for (let Y = 0; Y <= a.h * TS; Y += 14 * TS) { g.moveTo(0, Y); g.lineTo(a.w * TS, Y); }
            g.stroke();
        }
        // the edge of the map
        g.strokeStyle = "rgba(242,204,78,0.6)"; g.lineWidth = 2 * px; g.strokeRect(-px, -px, a.w * TS + 2 * px, a.h * TS + 2 * px);
        if (S.overlays.sea) drawSeaLines(g, vis);
        // every light marked where it is (a light can be faint, or only open the dark): a bulb in its own colour
        if (S.layers.lights) for (const o of S.spec.objects) {
            if (o.type !== "light" || !AE.near(o, vis)) continue;
            const p = AE.toScreen(o.x, o.y), dpr = AE.R.dpr;
            g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.fillStyle = "rgba(10,11,14,0.75)"; g.beginPath(); g.arc(p.x, p.y, 6.5, 0, Math.PI * 2); g.fill();
            g.fillStyle = o.color || "#ffb050"; g.beginPath(); g.arc(p.x, p.y, 3.5, 0, Math.PI * 2); g.fill();
            g.strokeStyle = o.scare === false ? "#8ef0b0" : "rgba(255,255,255,0.8)"; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, 6.5, 0, Math.PI * 2); g.stroke();
            g.restore();
        }
        if (S.overlays.paths) for (const o of S.spec.objects) if (o.path && o.path.length && o.type !== "mover") { const T = D().TYPES[o.type] || { w: 16, h: 16 }; g.save(); g.strokeStyle = "rgba(255,150,60,0.8)"; g.lineWidth = px; g.setLineDash([4 * px, 3 * px]); pathLine(g, o, T.w / 2, T.h / 2); g.restore(); }
        AE.emit("overlays", { g, vis });
    };
    // the sea's lines: low tide, high tide, where a pump drains it, how high a surge comes
    const SEA = [["low", "Low tide", "#57b8ff"], ["high", "High tide", "#8fd3ff"], ["drain", "Drained to", "#7ee081"], ["cap", "Surge stops", "#ff8a6a"]];
    function drawSeaLines(g, vis) {
        const sea = S.spec.settings.sea;
        if (!sea) return;
        const W = S.act.w * TS;
        for (const [k, label, col] of SEA) {
            if (typeof sea[k] !== "number") continue;
            g.save(); g.strokeStyle = col; g.lineWidth = 1.5 / S.view.z; g.setLineDash([6 / S.view.z, 4 / S.view.z]);
            g.beginPath(); g.moveTo(0, sea[k]); g.lineTo(W, sea[k]); g.stroke(); g.restore();
            const p = AE.toScreen(Math.max(vis.x, 0), sea[k]), dpr = AE.R.dpr;
            g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.font = "600 10px system-ui"; g.fillStyle = "rgba(10,11,14,0.8)";
            const w = g.measureText(label).width + 10; g.fillRect(p.x + 6, p.y - 16, w, 14); g.fillStyle = col; g.fillText(label, p.x + 11, p.y - 5); g.restore();
        }
    }
    AE.SEA = SEA;
    // THE COLLISION OVERLAY: what the game tests against (the same colours as the game's own, under the backquote key while testing)
    function drawCollision(g, vis, x0, y0, x1, y1) {
        const a = S.act, px = 1 / S.view.z;
        const box = (x, y, w, h, col, fill) => { if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); } g.strokeStyle = col; g.lineWidth = px; g.strokeRect(x + px / 2, y + px / 2, w - px, h - px); };
        for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
            const c = a.tiles[ty][tx], X = tx * TS, Y = ty * TS;
            if (c === "#" || c === "X" || c === "V" || c === "8" || c === "9") box(X, Y, TS, TS, "rgba(255,70,60,0.8)", "rgba(255,70,60,0.10)");
            else if (c === "%") box(X, Y, TS, TS, "rgba(80,230,255,0.9)", "rgba(80,230,255,0.15)");
            else if (c === "=" || c === "c") { g.fillStyle = "rgba(255,220,60,0.95)"; g.fillRect(X, Y, TS, 2 * px); }
            else if (c === "H" || c === "|") box(X + 4, Y, 8, TS, "rgba(90,240,120,0.8)");
            else if (c === "^") box(X, Y + 9, TS, 7, "rgba(255,70,220,0.95)", "rgba(255,70,220,0.25)");
            if (a.seams.has(tx + "," + ty)) box(X + 2, Y + 2, TS - 4, TS - 4, "rgba(80,230,255,0.6)");
        }
        for (const s of a.solids) box(s.x, s.y, s.w, s.h, "rgba(255,70,60,0.95)", "rgba(255,70,60,0.2)");
        for (const t of a.tops) { g.fillStyle = "rgba(255,220,60,0.95)"; g.fillRect(t.x, t.y, t.w, 2 * px); }
        for (const o of S.spec.objects) {
            if (!AE.near(o, vis)) continue;
            if (D().FOES.has(o.type)) {
                const T = D().TYPES[o.type], w = o.type === "steam" ? 32 : T.w, h = T.h;
                const stomp = o.stomp === undefined || o.stomp === null ? Boolean(D().STOMP[o.type]) : o.stomp;
                const b = o.type === "bat" ? { x: o.x + 5, y: o.y + 2, w: w - 10, h: h - 3 } : { x: o.x + 2, y: o.y + 2, w: w - 4, h: h - 3 };
                box(b.x, b.y, b.w, b.h, stomp && o.type !== "hammer" && o.type !== "steam" ? "rgba(255,150,40,0.95)" : "rgba(255,70,220,0.95)");
                if (stomp && o.type !== "hammer" && o.type !== "steam") { g.fillStyle = "#ffffff"; g.fillRect(b.x, b.y, b.w, px); }
            } else if (o.type === "crate") box(o.x, o.y, 16, 16, "rgba(255,150,40,0.9)");
            else if (o.type === "mover" || o.type === "float") { g.fillStyle = "rgba(255,220,60,0.95)"; g.fillRect(o.x, o.y, o.w || 48, 2 * px); }
            else if (o.type === "icicle") box(o.x + 2, o.y + 6, 4, 11, "rgba(255,70,220,0.9)");
            else if (o.type === "sign") box(o.x + 8 - 22, o.y + 16 - 26, 44, 52, "rgba(200,200,200,0.35)");
            else if (["coin", "gem", "life", "key", "dynamite", "knife"].includes(o.type)) { const T = D().TYPES[o.type]; box(o.x, o.y, T.w, T.h, "rgba(255,230,120,0.75)"); }
            else if (o.type === "start") box(o.x, o.y, 10, 22, "#ffffff");
        }
    }
})();

/* MAZER CARDS (4 Oct 2026, the owner's): a player's profile drawn as one
   picture to copy and paste anywhere, on the furni card's sticky note.

   Drawn here, in the browser, on a canvas: the page already has Volter and
   the profile's figures, and the picture never needs an address of its own
   (the owner's call: a link would be cached by Discord, a copied picture is
   not). The note is the furni card's sticky-furni.png redrawn at any height
   from its own parts: a 1px outline, the band across the top, the paper
   and the folded corner, in a theme's colours.

   Text is Volter at 9px, its native size, set glyph by glyph on whole
   pixels with the site's 1px letter-spacing (fillText's own advances ran
   the letters together on the Profiles link picture). Alpha is cut at a
   threshold, so every pixel is a solid one and the 3x copy stays sharp.

   window.MazerCard.render(data, theme) -> Promise<canvas> (1x)
   window.MazerCard.scaled(canvas, n)   -> canvas, n times, pixels kept square
   window.MazerCard.THEMES              -> { key: { name, ... } } */
(function () {
    "use strict";

    const W = 240;
    const PAD = 12;
    const BAND = 18;
    const LINE = 11;
    const FONT = '9px "Volter Goldfish"';
    const BOLD = 'bold 9px "Volter Goldfish"';

    const THEMES = {
        classic: {
            name: "Classic", band: "#e1cdb2", paper: "#ecd9be", foldLine: "#a98a6b", foldHi: "#c5ab88", foldLo: "#af9878",
            ink: "#703f20", text: "#5d5142", dim: "#8a7d6c", rule: "#a98a6b"
        },
        mint: {
            name: "Mint", band: "#bcd8b0", paper: "#d3e8c9", foldLine: "#7fa375", foldHi: "#a9c79c", foldLo: "#92b386",
            ink: "#2f5a2a", text: "#3f5a3a", dim: "#6f8a68", rule: "#8fb083"
        },
        sky: {
            name: "Sky", band: "#b5cbe6", paper: "#cfdff2", foldLine: "#6f8fb8", foldHi: "#a3bcdc", foldLo: "#8ea9cc",
            ink: "#1f3f6b", text: "#34507a", dim: "#6a82a3", rule: "#86a2c6"
        },
        rose: {
            name: "Rose", band: "#e6bcd6", paper: "#f2d3e5", foldLine: "#b8789f", foldHi: "#dca7c6", foldLo: "#c993b3",
            ink: "#6b2353", text: "#7a3a63", dim: "#a2708e", rule: "#c690b1"
        },
        gold: {
            name: "Gold", band: "#f5c400", paper: "#ffd94d", foldLine: "#b88a00", foldHi: "#e6b800", foldLo: "#cc9f00",
            ink: "#6b4200", text: "#5c3d0a", dim: "#8f6a1f", rule: "#c79a10"
        },
        console: {
            name: "Console", band: "#2c2c2c", paper: "#3d3d3d", foldLine: "#1e1e1e", foldHi: "#5a5a5a", foldLo: "#4a4a4a",
            ink: "#eeeeee", text: "#eeeeee", dim: "#eeeeee", rule: "#8a8a8a"
        }
    };

    /* The folded corner, as sticky-furni.png draws it: its bottom-right 14x14.
       # outline, 5 the fold's top edge, , band colour, c/a the fold's two
       shades, . paper, space clear. */
    const FOLD = [
        ".555555555555#",
        "#,,,,,,,,,ca# ",
        "#,,,,,,,,ca#  ",
        "#,,,,,,,ca#   ",
        "#,,,,,,ca#    ",
        "#,,,,,ca#     ",
        "#,,,,ca#      ",
        "#,,,ca#       ",
        "#,,ca#        ",
        "#,ca#         ",
        "#ca#          ",
        "#a#           ",
        "##            ",
        "#             "
    ];

    // ---- text ----
    const measure = document.createElement("canvas").getContext("2d");
    const advance = (font, ch, sp) => { measure.font = font; return Math.round(measure.measureText(ch).width) + (ch === " " ? 0 : sp); };
    function textWidth(str, bold, sp = 1) {
        const font = bold ? BOLD : FONT;
        let w = 0;
        for (const ch of str) w += advance(font, ch, sp);
        return Math.max(0, w - sp);
    }
    // `y` is the baseline.
    function text(ctx, str, x, y, colour, bold, sp = 1) {
        if (!str) return 0;
        const font = bold ? BOLD : FONT;
        const w = textWidth(str, bold, sp) + 4;
        const t = document.createElement("canvas");
        t.width = w; t.height = 16;
        const g = t.getContext("2d");
        g.font = font; g.fillStyle = colour;
        let cx = 0;
        for (const ch of str) { g.fillText(ch, cx, 11); cx += advance(font, ch, sp); }
        const d = g.getImageData(0, 0, w, 16);
        for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0;
        g.putImageData(d, 0, 0);
        ctx.drawImage(t, Math.round(x), Math.round(y) - 11);
        return w - 4;
    }
    // Cut to fit `max` pixels, with an ellipsis.
    function fit(str, max, bold) {
        if (textWidth(str, bold) <= max) return str;
        let s = str;
        while (s && textWidth(s + "...", bold) > max) s = s.slice(0, -1);
        return s.trimEnd() + "...";
    }
    // Words onto at most `lines` lines of `max` pixels; the last one cut.
    function wrap(str, max, lines) {
        const words = String(str).split(/\s+/).filter(Boolean);
        const out = [];
        let line = "";
        words.forEach(word => {
            const next = line ? line + " " + word : word;
            if (!line || textWidth(next) <= max) { line = next; return; }
            out.push(line);
            line = word;
        });
        if (line) out.push(line);
        if (out.length <= lines) return out.map(l => fit(l, max));
        return [...out.slice(0, lines - 1).map(l => fit(l, max)), fit(out.slice(lines - 1).join(" "), max)];
    }

    // ---- shapes ----
    const rect = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    function dashed(ctx, x, y, w, c) {
        ctx.fillStyle = c;
        for (let i = 0; i < w; i += 2) ctx.fillRect(x + i, y, 1, 1);
    }
    function box(ctx, x, y, w, h, c) {
        rect(ctx, x + 1, y, w - 2, 1, c); rect(ctx, x + 1, y + h - 1, w - 2, 1, c);
        rect(ctx, x, y + 1, 1, h - 2, c); rect(ctx, x + w - 1, y + 1, 1, h - 2, c);
    }

    // A tag as the profile's badges are: outlined, a square pip, the name.
    const pillWidth = label => textWidth(label) + 15;
    function pill(ctx, label, x, y, t) {
        const w = pillWidth(label);
        box(ctx, x, y, w, 13, t.ink);
        rect(ctx, x + 4, y + 5, 3, 3, t.ink);
        text(ctx, label, x + 11, y + 10, t.text);
        return w;
    }

    function note(ctx, H, t) {
        rect(ctx, 0, 0, W, H, t.paper);
        rect(ctx, 0, 0, W, BAND + 1, t.band);
        rect(ctx, 0, 0, W, 1, "#000"); rect(ctx, 0, H - 1, W, 1, "#000");
        rect(ctx, 0, 0, 1, H, "#000"); rect(ctx, W - 1, 0, 1, H, "#000");
        const colours = { "#": "#000", "5": t.foldLine, ",": t.band, c: t.foldHi, a: t.foldLo, ".": t.paper };
        FOLD.forEach((row, fy) => [...row].forEach((ch, fx) => {
            const x = W - 14 + fx, y = H - 14 + fy;
            if (ch === " ") ctx.clearRect(x, y, 1, 1);
            else rect(ctx, x, y, 1, 1, colours[ch]);
        }));
    }

    function loadImage(src) {
        return new Promise(resolve => {
            if (!src) return resolve(null);
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => resolve(null);
            i.src = src;
        });
    }
    // The outlined Habbo (habbo-outline.js draws its lines #eeeeee) in ink.
    function inked(img, colour) {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = "source-in";
        g.fillStyle = colour;
        g.fillRect(0, 0, c.width, c.height);
        return c;
    }

    const num = n => Number(n || 0).toLocaleString("en-GB");

    /* `data`:
         name, motto, featured (badge name), since ("Sept 2026"),
         avatar (an outline URL, or null),
         done, total (the open mazes), closed (closed ones completed),
         badges [names],
         games { guess: { streak, best, days }, odd: { ... } },
         printed (a date line) */
    async function render(data, themeKey) {
        const t = THEMES[themeKey] || THEMES.classic;
        if (document.fonts) {
            await Promise.all([document.fonts.load(FONT), document.fonts.load(BOLD)]).catch(() => {});
        }
        const avatarImg = await loadImage(data.avatar);

        // Laid out once to learn the height, then drawn.
        const plan = layout(data);
        const H = plan.height;
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        note(ctx, H, t);
        plan.draw(ctx, t, avatarImg);
        return c;
    }

    function layout(data) {
        const ops = [];
        const right = W - PAD;
        let y = BAND + 1;

        // The band: what it is, and where it is from.
        ops.push((ctx, t) => {
            text(ctx, "MAZER CARD", 8, 13, t.ink, true);
            const site = "mazerats.net";
            text(ctx, site, W - 8 - textWidth(site), 13, t.dim);
        });

        // ---- the player ----
        const ax = PAD, ay = y + 8, aw = 33, ah = 56;
        const tx = ax + aw + 9, tw = right - tx;
        let ty = y + 15;
        const nameLine = fit(String(data.name || "Someone"), tw, true);
        const nameY = ty;
        ty += 5;
        const ruleY = ty;
        ty += 11;
        const motto = data.motto ? wrap(`"${data.motto}"`, tw, 2) : [];
        const mottoYs = motto.map(() => { const at = ty; ty += LINE; return at; });
        let featuredY = null;
        if (data.featured) { featuredY = ty - 8; ty += 15; }
        const sinceY = data.since ? ty : null;
        if (data.since) ty += LINE;
        y = Math.max(ay + ah, ty - LINE + 4) + 7;
        ops.push((ctx, t, avatar) => {
            if (avatar) ctx.drawImage(inked(avatar, t.ink), ax, ay);
            else {
                // The boards' blank face: a plain disc where the Habbo goes.
                rect(ctx, ax + 8, ay + 14, 17, 17, t.rule);
            }
            text(ctx, nameLine, tx, nameY, t.ink, true);
            dashed(ctx, tx, ruleY, tw, t.rule);
            motto.forEach((l, i) => text(ctx, l, tx, mottoYs[i], t.text));
            if (featuredY !== null) pill(ctx, fit(data.featured, tw - 15), tx, featuredY, t);
            // "Maze Rat since" on the card only (the owner's); the profile says "Rat since".
            if (sinceY !== null) text(ctx, fit(`Maze Rat since ${data.since}`, tw), tx, sinceY, t.dim);
        });
        const rule = at => ops.push((ctx, t) => dashed(ctx, PAD, at, W - PAD * 2, t.rule));
        rule(y);
        y += 13;

        // ---- mazes ----
        const done = Number(data.done || 0), total = Number(data.total || 0);
        const mazesY = y;
        y += 6;
        const barY = y;
        // No Toughest line (the owner's, 4 Oct 2026): the bar, the closed
        // mazes completed if any (as the profile tallies them), the rule.
        y += 7 + 10;
        const closed = Number(data.closed || 0);
        const closedY = closed ? y + 1 : null;
        if (closed) y += LINE + 1;
        ops.push((ctx, t) => {
            const big = num(done);
            const w = text(ctx, big, PAD, mazesY, t.ink, true);
            text(ctx, `of ${num(total)} open mazes completed`, PAD + w + 5, mazesY, t.text);
            const bw = W - PAD * 2;
            box(ctx, PAD, barY, bw, 7, t.ink);
            const fill = total ? Math.round((bw - 4) * Math.min(1, done / total)) : 0;
            rect(ctx, PAD + 2, barY + 2, fill, 3, t.ink);
            if (closedY !== null) text(ctx, `+ ${num(closed)} closed ${closed === 1 ? "maze" : "mazes"} completed`, PAD, closedY, t.dim);
        });
        rule(y);
        y += 13;

        // ---- badges ----
        const badges = (data.badges || []).slice();
        const headY = y;
        y += 6;
        const pills = [];
        let px = PAD;
        badges.forEach(b => {
            const w = pillWidth(b);
            if (px > PAD && px + w > right) { px = PAD; y += 16; }
            pills.push({ b, x: px, y });
            px += w + 4;
        });
        y += badges.length ? 13 + 10 : 6;
        ops.push((ctx, t) => {
            const w = text(ctx, "Badges", PAD, headY, t.ink, true);
            if (badges.length) text(ctx, num(badges.length), PAD + w + 5, headY, t.dim);
            else text(ctx, "None yet.", PAD + w + 5, headY, t.dim);
            pills.forEach(p => pill(ctx, p.b, p.x, p.y, t));
        });
        rule(y);
        y += 13;

        // ---- daily games ----
        const g = data.games || {};
        const played = [["Guess the Maze", g.guess], ["Odd One Out", g.odd]].filter(([, s]) => s && s.days);
        const gamesHeadY = y;
        y += LINE + 2;
        const rows = played.map(([label, s]) => { const at = y; y += LINE; return { label, s, at }; });
        if (!played.length) y += 0;
        ops.push((ctx, t) => {
            const w = text(ctx, "Daily games", PAD, gamesHeadY, t.ink, true);
            if (!played.length) text(ctx, "Not played yet.", PAD + w + 5, gamesHeadY, t.dim);
            rows.forEach(r => {
                text(ctx, r.label, PAD, r.at, t.text);
                const right1 = `Best ${num(r.s.best)}`;
                const right2 = `Streak ${num(r.s.streak)}`;
                const w1 = textWidth(right1);
                text(ctx, right1, right - w1, r.at, t.text);
                text(ctx, right2, right - w1 - 12 - textWidth(right2), r.at, t.dim);
            });
        });
        y += played.length ? 0 : -LINE + 2;
        rule(y);
        y += 12;

        // ---- foot, clear of the fold ----
        const footY = y;
        ops.push((ctx, t) => text(ctx, data.printed ? `Printed ${data.printed}` : "", PAD, footY, t.dim));
        y += 10;

        return {
            height: Math.max(y, 120),
            draw(ctx, t, avatar) { ops.forEach(op => op(ctx, t, avatar)); }
        };
    }

    function scaled(src, n) {
        const c = document.createElement("canvas");
        c.width = src.width * n; c.height = src.height * n;
        const g = c.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.drawImage(src, 0, 0, c.width, c.height);
        return c;
    }

    /* ---- THE PRINTER ----
       Pixel art drawn here, like the note, in the site's own browns: the
       window chrome's fill and highlight, a dotted grille like the
       console's top, MAZE RATS on a plate, an amber knob and a green light.
       The paper loaded at the back is the colour picked. The card comes
       out of the slot foot first, as an old printer does: slowly where
       there is ink on the line, quicker over the blank paper between, with
       a stall or two and a judder (see schedule below). */
    const PW = W + 24;      // the printer, as wide as the card and a margin
    const TOP = 8;          // paper standing up out of the back
    const SLOT = 32;        // the slot's foot, from the printer's top
    const PRINT_MS = 9000;  // the whole print, stalls included
    /* A timer, not requestAnimationFrame: a tab in the background, or a
       throttled one, would otherwise hold the card in the printer. */
    const FRAME_MS = 40;
    const QUIET_ROWS = 16;
    const P = {
        line: "#000", lid: "#60462b", lidHi: "#7a5a38", face: "#39250f", grille: "#60462b",
        plate: "#2b1d12", plateText: "#c7a679", knob: "#ab8b64", knobHi: "#c7a679",
        ledOn: "#7fae6a", ledOff: "#2f3a26"
    };
    const sceneHeight = H => TOP + SLOT + H + 3;

    function printer(ctx, paper, led, shake) {
        const y0 = TOP + shake;
        // The paper loaded at the back, in the colour picked.
        box(ctx, 30, y0 - TOP, PW - 60, TOP + 3, P.line);
        rect(ctx, 31, y0 - TOP + 1, PW - 62, TOP + 2, paper);
        // Body, its corners cut a pixel.
        const BH = 38;
        rect(ctx, 1, y0, PW - 2, BH, P.line);
        rect(ctx, 0, y0 + 1, PW, BH - 2, P.line);
        // Lid, with its lit top edge, and the seam under it.
        rect(ctx, 2, y0 + 1, PW - 4, 9, P.lid);
        rect(ctx, 1, y0 + 2, PW - 2, 8, P.lid);
        rect(ctx, 2, y0 + 1, PW - 4, 1, P.lidHi);
        rect(ctx, 1, y0 + 10, PW - 2, 1, P.line);
        // Face.
        rect(ctx, 1, y0 + 11, PW - 2, BH - 13, P.face);
        /* The plate at the left (the owner's), and the grille as the
           console's grab bar has it filling the rest, on under the knob
           and the light. */
        const label = "MAZE RATS";
        const lw = textWidth(label, true) + 12;
        const lx = 9;
        rect(ctx, lx, y0 + 13, lw, 12, P.line);
        rect(ctx, lx + 1, y0 + 14, lw - 2, 10, P.plate);
        text(ctx, label, lx + 6, y0 + 22, P.plateText, true);
        for (let gx = lx + lw + 6; gx < PW - 9; gx += 2) for (let gy = y0 + 13; gy < y0 + 25; gy += 2) rect(ctx, gx, gy, 1, 1, P.grille);
        // Knob and light.
        rect(ctx, PW - 46, y0 + 15, 9, 6, P.line);
        rect(ctx, PW - 45, y0 + 16, 7, 4, P.knob);
        rect(ctx, PW - 45, y0 + 16, 7, 1, P.knobHi);
        rect(ctx, PW - 27, y0 + 14, 8, 8, P.line);
        rect(ctx, PW - 26, y0 + 15, 6, 6, led ? P.ledOn : P.ledOff);
        if (led) rect(ctx, PW - 25, y0 + 16, 2, 2, "#c4e6b0");
        // The base, a shade darker, then the slot and the lip under it.
        rect(ctx, 1, y0 + 27, PW - 2, BH - 28, P.plate);
        rect(ctx, 1, y0 + 27, PW - 2, 1, P.lid);
        rect(ctx, 8, y0 + 29, PW - 16, 3, P.line);
        rect(ctx, 8, y0 + 32, PW - 16, 1, P.lid);
        // Feet, out beyond the card.
        rect(ctx, 3, y0 + BH, 7, 2, P.line);
        rect(ctx, PW - 10, y0 + BH, 7, 2, P.line);
    }

    /* How the card comes out. Each of its rows (foot first) takes a time
       of its own: a little for blank paper, up to eight times that for a
       line full of ink. A few stalls go in at random, then the whole is
       stretched to PRINT_MS. `at[k]` is when k rows are out; `ink[k]` is
       how heavy the row coming out then is, 0 to 1. */
    function schedule(card, paper) {
        const H = card.height;
        const px = card.getContext("2d").getImageData(0, 0, W, H).data;
        const bg = [1, 2, 3].map(i => parseInt(paper.slice(i * 2 - 1, i * 2 + 1), 16));
        const rowInk = [];
        for (let y = 0; y < H; y++) {
            let n = 0;
            for (let x = 4; x < W - 4; x++) {
                const i = (y * W + x) * 4;
                if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 30) n++;
            }
            rowInk.push(n);
        }
        const most = Math.max(1, ...rowInk);
        const ink = [], cost = [];
        for (let k = 0; k < H; k++) {
            const v = Math.min(1, rowInk[H - 1 - k] / most);
            ink.push(v);
            cost.push(1 + 7 * v);
        }
        const stalls = new Map();
        const nStalls = 3 + Math.floor(Math.random() * 2);
        for (let s = 0; s < nStalls; s++) {
            const k = Math.floor(H * (0.12 + Math.random() * 0.78));
            stalls.set(k, 300 + Math.random() * 450);
        }
        const stallMs = [...stalls.values()].reduce((a, b) => a + b, 0);
        const per = (PRINT_MS - stallMs) / cost.reduce((a, b) => a + b, 0);
        const at = [0];
        let t = 0;
        for (let k = 0; k < H; k++) {
            if (stalls.has(k)) t += stalls.get(k);
            t += cost[k] * per;
            at.push(t);
        }
        return { at, ink, stalls };
    }

    /* ---- THE SOUND ----
       Made here, with Web Audio, and kept quiet: a soft motor hum under
       the print, and a short ticking burst each time the head lays down a
       line, louder (still quietly) where the line has more ink. Nothing to
       download. Started by the click that picks a colour, as browsers ask;
       a browser without Web Audio prints in silence. */
    function printSound() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        let ac;
        try { ac = new AC(); } catch (e) { return null; }
        const master = ac.createGain();
        /* Faded in over a second and a half (the owner's: the start was too
           sudden for anyone in headphones with the volume up). */
        master.gain.setValueAtTime(0, ac.currentTime);
        master.gain.linearRampToValueAtTime(0.55, ac.currentTime + 1.5);
        master.connect(ac.destination);
        const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const ch = noise.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

        let hum = null;
        function humOn() {
            if (hum) return;
            const osc = ac.createOscillator();
            osc.type = "sawtooth";
            osc.frequency.value = 64;
            const lp = ac.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = 180;
            const g = ac.createGain();
            g.gain.setValueAtTime(0, ac.currentTime);
            g.gain.linearRampToValueAtTime(0.018, ac.currentTime + 0.15);
            osc.connect(lp).connect(g).connect(master);
            osc.start();
            hum = { osc, g };
        }
        function humOff() {
            if (!hum) return;
            const { osc, g } = hum;
            hum = null;
            g.gain.setValueAtTime(g.gain.value, ac.currentTime);
            g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.12);
            osc.stop(ac.currentTime + 0.15);
        }
        // One line: three ticks of filtered noise, a few milliseconds apart.
        function line(weight) {
            const now = ac.currentTime;
            for (let i = 0; i < 3; i++) {
                const src = ac.createBufferSource();
                src.buffer = noise;
                const bp = ac.createBiquadFilter();
                bp.type = "bandpass";
                bp.frequency.value = 1800 + Math.random() * 900;
                bp.Q.value = 5;
                const g = ac.createGain();
                const at = now + i * 0.011;
                const peak = 0.012 + 0.03 * weight;
                g.gain.setValueAtTime(0, at);
                g.gain.linearRampToValueAtTime(peak, at + 0.002);
                g.gain.exponentialRampToValueAtTime(0.0005, at + 0.03);
                src.connect(bp).connect(g).connect(master);
                src.start(at, Math.random() * 0.9, 0.04);
            }
        }
        return {
            humOn, humOff, line,
            stop() { humOff(); setTimeout(() => { try { ac.close(); } catch (e) { /* gone */ } }, 300); }
        };
    }

    // ---- the window ----
    let showing = null;
    const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    function el(html) {
        const d = document.createElement("div");
        d.innerHTML = html.trim();
        return d.firstChild;
    }
    const escapeText = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    /* `getData` gives the card's figures (home.js, mazerCardData); asked
       once, as the window opens, and again for each print.

       THE WINDOW STAYS ONE SIZE (the owner's): the stage is sized for the
       printer with the whole card hanging out of it from the start, the
       colour picker sits in it, and the buttons' row is kept (invisible)
       until the card is out. What the window has to say goes in its one
       line at the top, rather than in a line of its own that would come
       and go. */
    async function open(getData) {
        if (showing) return;
        showing = { close() {} };
        const returnTo = document.activeElement;
        let data = null;
        try { data = getData(); } catch (e) { /* shown as a jam when printing */ }

        const overlay = el(`
            <div class="modal-overlay open mazer-overlay">
                <div class="modal confirm-modal mazer-window" role="dialog" aria-modal="true" aria-labelledby="mazer-title" tabindex="-1">
                    <div class="chrome-titlebar">
                        <h2 id="mazer-title">Mazer Card</h2>
                        <button type="button" class="chrome-close" aria-label="Close"><img src="/assets/img/modal_topclose_x.png" alt="" aria-hidden="true"></button>
                    </div>
                    <div class="chrome-frame">
                        <div class="modal-body mazer-body">
                            <p class="mazer-lead" role="status"></p>
                            <div class="mazer-stage">
                                <canvas class="mazer-scene" aria-hidden="true"></canvas>
                                <!-- Its heading travels with it, just above the squares (the owner's). -->
                                <div class="mazer-picker">
                                    <p class="mazer-lead mazer-pick-head" id="mazer-pick-head">Pick your colour</p>
                                    <div class="mazer-swatches" role="group" aria-labelledby="mazer-pick-head">
                                        ${Object.keys(THEMES).map(k => `
                                            <button type="button" class="mazer-swatch" data-theme="${k}" aria-label="${escapeText(THEMES[k].name)}" title="${escapeText(THEMES[k].name)}">
                                                <span style="background:${THEMES[k].paper}"></span>
                                            </button>`).join("")}
                                    </div>
                                    ${data && data.motto ? `
                                        <!-- The motto is theirs to leave off (4 Oct 2026, the owner's): off unless ticked. -->
                                        <label class="mazer-motto"><input type="checkbox" class="mazer-motto-box"> Include my motto</label>` : ""}
                                </div>
                            </div>
                            <div class="confirm-actions mazer-actions" data-ready="0">
                                <button type="button" class="guess-btn guess-btn--lead" data-mazer="copy">Copy Image</button>
                                <button type="button" class="guess-btn" data-mazer="save">Save</button>
                                <button type="button" class="guess-btn" data-mazer="again">Another colour</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`);
        const win = overlay.querySelector(".mazer-window");
        const lead = overlay.querySelector(".mazer-lead");
        const stage = overlay.querySelector(".mazer-stage");
        const scene = overlay.querySelector(".mazer-scene");
        const picker = overlay.querySelector(".mazer-picker");
        const actions = overlay.querySelector(".mazer-actions");
        const copyBtn = actions.querySelector('[data-mazer="copy"]');
        const saveBtn = actions.querySelector('[data-mazer="save"]');
        const againBtn = actions.querySelector('[data-mazer="again"]');
        const canCopy = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);

        // The card's height decides the stage's; the theme does not change it.
        if (document.fonts) await Promise.all([document.fonts.load(FONT), document.fonts.load(BOLD)]).catch(() => {});
        // With the motto or without, whichever is taller: ticking it must
        // not change the window.
        let H = 200;
        try { if (data) H = Math.max(layout(data).height, layout({ ...data, motto: "" }).height); } catch (e) { /* a jam later */ }
        const SH = sceneHeight(H);
        const z = window.innerWidth >= PW * 2 + 80 && window.innerHeight >= SH * 2 + 190 ? 2 : 1;
        scene.width = PW; scene.height = SH;
        stage.style.width = `${PW * z}px`;
        stage.style.height = `${SH * z}px`;
        scene.style.width = `${PW * z}px`;
        scene.style.height = `${SH * z}px`;
        const ctx = scene.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        /* The printer is there from the start (the owner's), with blank
           paper loaded; the picker sits in the space under it, where the
           card will come out. Pointing at a colour loads that paper. */
        const BLANK = "#f4efe4";
        const idle = paper => { ctx.clearRect(0, 0, PW, SH); printer(ctx, paper, false, 0); };
        idle(BLANK);
        picker.style.top = `${(TOP + 42) * z}px`;

        document.body.appendChild(overlay);
        document.body.classList.add("modal-open");

        let card = null;
        let theme = null;
        let gen = 0;
        let audio = null;

        function close() {
            if (!showing) return;
            showing = null;
            gen++;
            if (audio) { audio.stop(); audio = null; }
            document.removeEventListener("keydown", onKey, true);
            overlay.remove();
            if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
            if (returnTo && document.body.contains(returnTo) && typeof returnTo.focus === "function") returnTo.focus({ preventScroll: true });
        }
        function onKey(e) {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        }
        document.addEventListener("keydown", onKey, true);
        overlay.addEventListener("click", e => {
            if (e.target === overlay || e.target.closest(".chrome-close")) close();
        });

        const wait = ms => new Promise(r => setTimeout(r, ms));
        const slide = (node, transform, ms) => {
            node.style.transition = reduced() ? "none" : `transform ${ms}ms ease-in-out`;
            node.style.transform = transform;
        };
        function ready(on) {
            actions.dataset.ready = on ? "1" : "0";
            actions.querySelectorAll("button").forEach(b => { b.disabled = !on; });
        }

        // ---- 1. the colour ----
        function pick() {
            gen++;
            if (audio) { audio.stop(); audio = null; }
            ready(false);
            lead.textContent = "";
            // Any card drops away out of the bottom, and the picker rises
            // back into its place.
            const my = gen;
            const was = card, paper = theme && THEMES[theme] ? THEMES[theme].paper : BLANK;
            if (was && !reduced()) {
                const start = performance.now();
                const fall = () => {
                    if (my !== gen) return;
                    const t = Math.min(1, (performance.now() - start) / 380);
                    idle(paper);
                    const lip = TOP + SLOT;
                    ctx.save();
                    ctx.beginPath(); ctx.rect(0, lip, PW, SH - lip); ctx.clip();
                    ctx.drawImage(was, 12, lip + Math.round(t * t * (SH - lip)));
                    ctx.restore();
                    if (t < 1) setTimeout(fall, FRAME_MS);
                };
                fall();
            } else idle(paper);
            slide(picker, "translateY(0)", 450);
            picker.inert = false;
            const first = picker.querySelector(".mazer-swatch");
            if (first) first.focus({ preventScroll: true });
        }

        // ---- 2. printing ----
        async function print(key) {
            const my = ++gen;
            theme = key;
            const t = THEMES[key];
            ready(false);
            picker.inert = true;
            // No "Printing..." line (the owner's): the printer says it.
            lead.textContent = "";
            // The picker slides down out of the window, under the printer.
            ctx.clearRect(0, 0, PW, SH);
            printer(ctx, t.paper, true, 0);
            slide(picker, `translateY(${SH * z}px)`, 450);
            try { audio = printSound(); } catch (e) { audio = null; }

            let fresh = null;
            try { fresh = getData(); } catch (e) { /* a jam below */ }
            const withMotto = overlay.querySelector(".mazer-motto-box");
            if (fresh && !(withMotto && withMotto.checked)) fresh = { ...fresh, motto: "" };
            card = fresh ? await render(fresh, key).catch(() => null) : null;
            await wait(reduced() ? 0 : 500);
            if (my !== gen) return;
            if (!card) { jam(); return; }
            const CH = card.height;

            const plan = schedule(card, t.paper);
            const start = performance.now();
            let shown = 0;
            if (audio) audio.humOn();
            await new Promise(resolve => {
                const frame = () => {
                    if (my !== gen) return resolve();
                    const now = performance.now() - start;
                    let k = shown;
                    while (k < CH && plan.at[k + 1] <= now) k++;
                    // Out two rows at a time, as a print head steps.
                    const out = k >= CH ? CH : k - (k % 2);
                    const stalled = out === shown && out < CH;
                    const weight = out < CH ? plan.ink[out] : 0;
                    // A slip now and then on a heavy line: the paper drops back a row.
                    const slip = !reduced() && out > 4 && out < CH && weight > 0.35 && Math.random() < 0.08 ? 1 : 0;
                    const shake = !reduced() && !stalled && out < CH && weight > 0.2 && Math.floor(now / FRAME_MS) % 2 ? 1 : 0;
                    if (audio) {
                        /* No ticks for the card's foot: its outline and folded
                           corner are solid ink, and came out as the loudest
                           burst of the print, first thing. */
                        if (out > shown && out > QUIET_ROWS) audio.line(weight);
                        if (stalled) audio.humOff(); else if (out < CH) audio.humOn();
                    }
                    shown = out;
                    ctx.clearRect(0, 0, PW, SH);
                    printer(ctx, t.paper, out >= CH || Math.floor(now / (stalled ? 600 : 200)) % 2 === 0, shake);
                    if (out > 0) {
                        const lip = TOP + SLOT + shake;
                        ctx.save();
                        ctx.beginPath(); ctx.rect(0, lip, PW, SH - lip); ctx.clip();
                        ctx.drawImage(card, 12, lip - CH + out - slip);
                        ctx.restore();
                    }
                    if (out >= CH) return resolve();
                    setTimeout(frame, FRAME_MS);
                };
                frame();
            });
            if (my !== gen) return;
            if (audio) { audio.stop(); audio = null; }
            done();
        }

        function jam() {
            if (audio) { audio.stop(); audio = null; }
            lead.textContent = "The printer jammed! Try again in a moment.";
            card = null;
            ready(true);
            copyBtn.hidden = true;
            saveBtn.hidden = true;
            againBtn.focus({ preventScroll: true });
        }

        // ---- 3. the card, still hanging from the printer ----
        function done() {
            lead.textContent = "";
            ready(true);
            copyBtn.hidden = !canCopy;
            saveBtn.hidden = false;
            (canCopy ? copyBtn : saveBtn).focus({ preventScroll: true });
        }

        // What is copied and saved: the card alone, 3x, every pixel square.
        const blob = () => new Promise((resolve, reject) =>
            scaled(card, 3).toBlob(b => (b ? resolve(b) : reject(new Error("no picture"))), "image/png"));

        const hoverPaper = e => {
            const sw = e.target.closest && e.target.closest(".mazer-swatch");
            if (sw && !picker.inert && THEMES[sw.dataset.theme]) idle(THEMES[sw.dataset.theme].paper);
        };
        picker.addEventListener("mouseover", hoverPaper);
        picker.addEventListener("focusin", hoverPaper);
        picker.addEventListener("click", e => {
            const sw = e.target.closest(".mazer-swatch");
            if (sw && !picker.inert) print(sw.dataset.theme);
        });
        actions.addEventListener("click", async e => {
            const act = e.target.closest("[data-mazer]");
            if (!act || act.disabled) return;
            if (act.dataset.mazer === "again") { pick(); return; }
            if (!card) return;
            if (act.dataset.mazer === "copy") {
                try {
                    // A promise inside the item, so Safari keeps the click's permission.
                    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob() })]);
                    lead.textContent = "Copied! Paste it anywhere.";
                } catch (err) {
                    lead.textContent = "Couldn't copy it. Use Save instead.";
                }
            } else if (act.dataset.mazer === "save") {
                try {
                    const url = URL.createObjectURL(await blob());
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `mazer-card-${THEMES[theme] ? theme : "card"}.png`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                    lead.textContent = "Saved.";
                } catch (err) {
                    lead.textContent = "Couldn't save it just now.";
                }
            }
        });

        showing = { close };
        ready(false);
        win.focus({ preventScroll: true });
        const first = picker.querySelector(".mazer-swatch");
        if (first) first.focus({ preventScroll: true });
    }

    window.MazerCard = { render, scaled, open, THEMES, close: () => showing && showing.close() };
})();

/* The GTA VI launch skin (18 Nov 2026; the owner's picks from four mock-ups:
   "A and B, A being default, B the dark mode", with most of D's extras).

   Worn with the Vice palette (tools/themes.js, PAIRED in js/skin-wear.js).
   Everything here is original pixel art drawn at run time; nothing of the
   game's own art or logo is used.

     THE SKY      a pixel sunset over the sea, palms and a skyline (A), or the
                  same coast at night with a moon and lit windows when the
                  dark-mode bulb is on (B). Painted once per size into a
                  fixed layer behind the page, at a quarter of the screen's
                  pixels and scaled up crisp, so it costs nothing per frame.
     WANTED       five stars in the header: the visitor's daily-game streak
                  (the longer live one of Guess the Maze and Odd One Out, read
                  from this device's own records). One star a day, five max.
     CASH         the same records' all-time points, as dollars, top right.
     PHONE        texts in a pixel phone, bottom right: today's daily games
                  if they have not been played here, the next event. Closed
                  texts are not shown again that day.
     GPS          a radar, bottom left, that presses Surprise me: a waypoint
                  to a maze at random.
     MISSION      "Mission passed!" across the screen when a daily game's day
                  is finished (the mazerats:daily-done event from js/guess.js
                  and js/oddoneout.js), with the day's points as cash.

   The extras are the homepage's only (body[data-page="home"]); the other
   pages that wear skins get the sky and the lettering. Nothing at all
   inside the homepage's game window (html.ff-embed). Reduced motion keeps
   everything still. stop() takes every node, listener and observer away. */
(function () {
    "use strict";

    const NAME = "gta";
    const root = document.documentElement;
    const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
    const read = (k) => { try { return store ? store.getItem(k) : null; } catch (e) { return null; } };
    const write = (k, v) => { try { if (store) store.setItem(k, v); } catch (e) { /* private mode */ } };
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

    let nodes = [], offs = [], timers = [], observer = null, on = false;
    const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); offs.push(() => target.removeEventListener(type, fn, opts)); };
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const add = (el, parent) => { (parent || document.body).appendChild(el); nodes.push(el); return el; };
    const make = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; };

    /* ---------------------------------------------------------------
       THE SKY */
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const PAL = {
        sunset: { sky: ["#140a33", "#2a0d4f", "#4b1268", "#7a1a72", "#b02774", "#e2456c", "#ff7356", "#ffa04a", "#ffc861"],
            sea: ["#3a0f52", "#2b0b45", "#1d0836"], sun: ["#ffe27a", "#ffb14a", "#ff7a5a", "#ff4f7b"], silh: "#12061f", ring: "#2a0f3d",
            city: "#1e0a33", win: ["#ff5fa8", "#ffd27a", "#49e0ff"] },
        night: { sky: ["#05040f", "#08081d", "#0d0c2b", "#15103a", "#211447", "#331853", "#4a1c5e"],
            sea: ["#0b0820", "#080618", "#050412"], sun: null, silh: "#030208", ring: null,
            city: "#0b0a1d", win: ["#ff3fa4", "#2ee6ff", "#ffd45c", "#b44dff"] }
    };
    function paintSky(mode, vw, vh) {
        const S = 4, W = Math.ceil(vw / S), H = Math.ceil(vh / S);
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const g = cv.getContext("2d");
        const img = g.createImageData(W, H), d = img.data;
        const P = PAL[mode];
        let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const rgb = {};
        const hex = (c) => rgb[c] || (rgb[c] = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
        const px = (x, y, c, a) => {
            x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
            const i = (y * W + x) * 4, v = hex(c), k = a == null ? 1 : a;
            d[i] = d[i] * (1 - k) + v[0] * k; d[i + 1] = d[i + 1] * (1 - k) + v[1] * k; d[i + 2] = d[i + 2] * (1 - k) + v[2] * k; d[i + 3] = 255;
        };
        const rect = (x, y, w, h, c, a) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c, a); };
        const band = (list, y, y0, y1, x) => { const t = (y - y0) / Math.max(1, y1 - y0) * (list.length - 1), i = Math.floor(t), f = t - i;
            return list[Math.min(i + (f * 16 > BAYER[y & 3][x & 3] ? 1 : 0), list.length - 1)]; };

        const HZ = Math.round(H * 0.70);
        for (let y = 0; y < HZ; y++) for (let x = 0; x < W; x++) px(x, y, band(P.sky, y, 0, HZ, x));
        for (let k = 0; k < (mode === "night" ? Math.round(W * H / 400) : Math.round(W * H / 1600)); k++) {
            px(rnd() * W, rnd() * HZ * (mode === "night" ? 0.8 : 0.35), rnd() < 0.2 ? "#ffd6f0" : "#9a8cc8");
        }
        // The sun (striped as it sets) beside the window, or the moon.
        const narrow = vw < 760;
        const SX = Math.round(W * (narrow ? 0.72 : 0.79)), SY = HZ - 4, SR = Math.round(Math.min(H * 0.2, W * 0.16));
        if (P.sun) {
            for (let y = -SR; y <= 0; y++) for (let x = -SR; x <= SR; x++) {
                if (x * x + y * y > SR * SR) continue;
                const ty = (y + SR) / SR;
                if (ty > 0.45) { const b = Math.floor((ty - 0.45) * 22); if ((y + SR) % 6 < Math.min(1 + b * 0.5, 4)) continue; }
                const ci = Math.min(P.sun.length - 1, Math.floor(ty * P.sun.length * 0.999 + (BAYER[(y + 99) & 3][(x + 99) & 3] / 16 - 0.5)));
                px(SX + x, SY + y, P.sun[Math.max(0, ci)]);
            }
        } else {
            const mx = Math.round(W * 0.8), my = Math.round(H * 0.16), r = Math.max(6, Math.round(Math.min(W, H) * 0.045));
            for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
                if (x * x + y * y <= r * r && (x - r * 0.45) ** 2 + (y + r * 0.2) ** 2 > r * r * 0.7) px(mx + x, my + y, "#f4e9ff");
            }
        }
        // The skyline: taller towards the edges, low behind the window.
        for (let x = 0; x < W;) {
            const bw = 4 + Math.floor(rnd() * 9), dc = Math.abs(x - W / 2) / (W / 2);
            const bh = Math.floor(5 + rnd() * 17 * (0.3 + dc));
            rect(x, HZ - bh, bw, bh, P.city);
            if (rnd() < 0.25) rect(x + (bw >> 1), HZ - bh - 4, 1, 4, P.city);
            for (let wy = HZ - bh + 2; wy < HZ - 1; wy += 3) for (let wx = x + 1; wx < x + bw - 1; wx += 2) {
                if (rnd() < (mode === "night" ? 0.42 : 0.22)) px(wx, wy, P.win[Math.floor(rnd() * P.win.length)]);
            }
            x += bw + (rnd() < 0.3 ? 1 : 0);
        }
        // The sea, and the light on it.
        for (let y = HZ; y < H; y++) {
            for (let x = 0; x < W; x++) px(x, y, band(P.sea, y, HZ, H, x));
            const k = y - HZ, cx = P.sun ? SX : W * 0.8, half = (P.sun ? SR : 12) * (1 - k / (H - HZ) * 0.6);
            if (k % 2 === 0) for (let s = 0; s < 3; s++) {
                const len = Math.floor(half * (0.3 + rnd() * 0.8)), x0 = Math.floor(cx - len / 2 + (rnd() - 0.5) * half);
                rect(x0, y, len, 1, mode === "night" ? "#6b4aa8" : P.sun[Math.min(P.sun.length - 1, 1 + (k >> 3))], 0.85);
            }
            if (mode === "night" && k % 3 === 0) for (let s = 0; s < Math.round(W / 50); s++) {
                rect(Math.floor(rnd() * W), y, 2 + Math.floor(rnd() * 4), 1, P.win[Math.floor(rnd() * P.win.length)], 0.5);
            }
        }
        // Palms.
        const palm = (bx, h, lean, scale) => {
            const c = P.silh; let tx = bx, ty = H;
            for (let i = 0; i <= h; i++) {
                const t = i / h; tx = bx + lean * t * t; ty = H - i;
                const w = t < 0.3 ? 3 : 2; rect(Math.round(tx) - (w >> 1), Math.round(ty), w, 1, c);
                if (i % 4 === 0 && P.ring) px(Math.round(tx) - 1, Math.round(ty), P.ring);
            }
            for (const [a, lm] of [[-2.9, 1], [-2.5, 1.1], [-2.0, 0.9], [-1.2, 0.8], [-0.6, 1], [-0.2, 1.1], [0.25, 1], [-1.6, 0.7], [-3.3, 0.8]]) {
                const L = 26 * scale * lm;
                for (let s = 0; s < L; s++) {
                    const fx = tx + Math.cos(a) * s, fy = ty + Math.sin(a) * s + 0.022 * s * s / scale;
                    const th = s < L * 0.5 ? 2 : 1;
                    rect(Math.round(fx), Math.round(fy), th, th, c);
                    const prof = Math.sin(Math.PI * Math.min(1, s / L * 1.05)) * 6 * scale;
                    if (s > 2) {
                        const dir = Math.cos(a) > 0 ? 1 : -1;
                        for (let q = 1; q <= prof; q++) { px(fx - dir * q * 0.35, fy + q, c); if (q < prof * 0.45) px(fx + dir * q * 0.5, fy - q * 0.6, c); }
                    }
                }
            }
            rect(Math.round(tx) - 2, Math.round(ty) - 1, 4, 3, c);
        };
        const ps = Math.max(0.6, Math.min(1.3, W / 320));
        palm(Math.round(W * 0.06), Math.round(H * 0.78), 18 * ps, 1.25 * ps);
        palm(Math.round(W * 0.93), Math.round(H * 0.82), -20 * ps, 1.3 * ps);
        if (!narrow) {
            palm(Math.round(W * 0.15), Math.round(H * 0.55), -10, 0.95);
            palm(Math.round(W * 0.84), Math.round(H * 0.5), 9, 0.85);
        }
        if (mode !== "night") for (const [bx, by] of [[0.32, 0.18], [0.35, 0.2], [0.66, 0.12]]) {
            const x = W * bx, y = H * by;
            [[-2, 0], [-1, 1], [0, 0], [1, 1], [2, 0]].forEach(([i, j]) => px(x + i, y + j, P.silh));
        }
        g.putImageData(img, 0, 0);
        return { url: cv.toDataURL(), w: W * S, h: H * S };
    }

    let sky = null, painted = "", resizeTimer = 0;
    function drawSky() {
        if (!sky) return;
        const mode = root.hasAttribute("data-dark") ? "night" : "sunset";
        const w = innerWidth, h = Math.max(innerHeight, 320);
        // Only when something it depends on changed: the mode, or the size by more than a little.
        const key = mode + ":" + Math.round(w / 40) + ":" + Math.round(h / 40);
        if (key === painted) return;
        painted = key;
        const s = paintSky(mode, w, h);
        sky.style.backgroundImage = "url(" + s.url + ")";
        sky.style.backgroundSize = s.w + "px " + s.h + "px";
    }

    /* ---------------------------------------------------------------
       THE PLAYER'S RECORDS: this device's own, as the games keep them. */
    const GAMES = [
        { key: "guess", label: "Guess the Maze", stats: "mazerats_guess_stats_v4", open: () => window.openGuessGame },
        { key: "odd", label: "Odd One Out", stats: "mazerats_odd_stats_v2", open: () => window.openOddOneOut }
    ];
    const utcDay = (t) => new Date(t).toISOString().slice(0, 10);
    function who() { return window.Account && Account.current && Account.current.publicId ? String(Account.current.publicId) : ""; }
    function record(game) {
        let s = null;
        try { s = JSON.parse(read(game.stats) || "null"); } catch (e) { s = null; }
        // Only this person's: a record stamped by someone else on a shared computer is not theirs to show.
        if (!s || typeof s !== "object" || (s.who || "") !== who()) return null;
        return s;
    }
    function standing() {
        const today = utcDay(Date.now()), yesterday = utcDay(Date.now() - 864e5);
        let streak = 0, points = 0; const played = {};
        GAMES.forEach((g) => {
            const s = record(g);
            if (!s) return;
            const live = s.lastDay === today || s.lastDay === yesterday ? Number(s.streak) || 0 : 0;
            streak = Math.max(streak, live);
            points += Number(s.points) || 0;
            played[g.key] = s.lastDay === today;
        });
        return { streak, points, played };
    }

    /* ---------------------------------------------------------------
       WANTED (the streak) and CASH (the points) */
    let wanted = null, cash = null, shownCash = -1;
    function drawStanding() {
        const st = standing();
        if (wanted) {
            const n = Math.min(5, st.streak);
            wanted.innerHTML = `<span class="gx-wanted-lab">Wanted</span><span class="gx-stars">${
                [0, 1, 2, 3, 4].map((i) => `<i class="gx-star${i < n ? " is-on" : ""}${i === n - 1 && st.streak > 0 ? " is-new" : ""}"></i>`).join("")}</span>`;
            const say = st.streak > 0 ? `Wanted level ${n}: a ${st.streak}-day daily-game streak` : "Wanted level 0: play today's daily games to start a streak";
            wanted.setAttribute("title", say);
            wanted.setAttribute("aria-label", say);
        }
        if (cash && st.points !== shownCash) {
            countTo(cash.querySelector(".gx-cash-n"), shownCash < 0 ? st.points : shownCash, st.points);
            shownCash = st.points;
        }
    }
    function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
    function countTo(el, from, to) {
        if (!el) return;
        if (reduced() || from === to) { el.textContent = money(to); return; }
        const t0 = performance.now(), dur = 900;
        const step = (t) => {
            if (!on) return;
            const k = Math.min(1, (t - t0) / dur);
            el.textContent = money(from + (to - from) * (1 - Math.pow(1 - k, 3)));
            if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /* ---------------------------------------------------------------
       THE PHONE */
    const SEEN_KEY = "mazerats_gta_texts";        // { day, ids: [...] } closed today
    let phone = null, inbox = [], showing = null;
    function seen() {
        try { const s = JSON.parse(read(SEEN_KEY) || "null"); if (s && s.day === utcDay(Date.now()) && Array.isArray(s.ids)) return s.ids; } catch (e) { /* none */ }
        return [];
    }
    function markSeen(id) { const ids = seen(); if (!ids.includes(id)) ids.push(id); write(SEEN_KEY, JSON.stringify({ day: utcDay(Date.now()), ids })); }
    function texts() {
        const st = standing(), out = [];
        out.push({ id: "hello", from: "Maze Rats", text: "Welcome to Maze Rats. To celebrate the launch of GTA VI, the archive is running from Vice City until the end of the month." });
        GAMES.forEach((g) => {
            if (!st.played[g.key]) out.push({ id: "daily-" + g.key, from: g.label, text: `Today's ${g.label} just dropped. Don't keep me waiting.`, act: "Play", go: () => { const f = g.open(); if (typeof f === "function") f(); } });
        });
        const ev = document.querySelector(".header-events-title");
        const when = document.querySelector(".header-events-when");
        const evName = ev && ev.textContent.trim();
        if (evName && !/^no upcoming/i.test(evName)) out.push({ id: "event-" + evName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40), from: "Events", text: `Heads up: ${evName}${when && when.textContent.trim() ? ", " + when.textContent.trim() : ""}.` });
        const closed = seen();
        return out.filter((m) => !closed.includes(m.id));
    }
    function drawPhone() {
        if (!phone) return;
        inbox = texts();
        const badge = phone.querySelector(".gx-phone-badge");
        badge.textContent = inbox.length ? String(inbox.length) : "";
        badge.hidden = !inbox.length;
        phone.classList.toggle("has-texts", inbox.length > 0);
        if (showing && !inbox.find((m) => m.id === showing.id)) closeText(false);
    }
    function openText() {
        if (!phone || !inbox.length) return;
        showing = inbox[0];
        const card = phone.querySelector(".gx-phone-msg");
        card.innerHTML = `<b>${esc(showing.from)}</b><span>${esc(showing.text)}</span>` +
            `<span class="gx-phone-acts">${showing.go ? `<button type="button" class="gx-phone-go">${esc(showing.act || "Open")}</button>` : ""}` +
            `<button type="button" class="gx-phone-ok">${inbox.length > 1 ? "Next" : "OK"}</button></span>`;
        phone.classList.add("is-open");
        phone.querySelector(".gx-phone-btn").setAttribute("aria-expanded", "true");
    }
    function closeText(mark) {
        if (!phone) return;
        if (mark && showing) markSeen(showing.id);
        showing = null;
        phone.classList.remove("is-open");
        phone.querySelector(".gx-phone-btn").setAttribute("aria-expanded", "false");
        drawPhone();
    }

    /* ---------------------------------------------------------------
       THE GPS: a little maze with a waypoint, and Surprise me under it. */
    function drawRadar(cv) {
        const N = 9, C = 4, S = N * C + 1;
        cv.width = S; cv.height = S;
        const g = cv.getContext("2d");
        g.fillStyle = "#24453a"; g.fillRect(0, 0, S, S);
        // A maze, carved from a seed so it is the same all day.
        let seed = Number(utcDay(Date.now()).replace(/-/g, "")) % 2147483647 || 1;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const seenCell = new Set(["0,0"]), stack = [[0, 0]];
        g.fillStyle = "#79a58b";
        const open = (x, y) => g.fillRect(x * C + 1, y * C + 1, C - 1, C - 1);
        open(0, 0);
        while (stack.length) {
            const [x, y] = stack[stack.length - 1];
            const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy])
                .filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seenCell.has(a + "," + b));
            if (!next.length) { stack.pop(); continue; }
            const [a, b, dx, dy] = next[Math.floor(rnd() * next.length)];
            seenCell.add(a + "," + b);
            g.fillRect(x * C + 1 + (dx > 0 ? C - 1 : 0) + (dx < 0 ? -1 : 0), y * C + 1 + (dy > 0 ? C - 1 : 0) + (dy < 0 ? -1 : 0), dx ? 1 : C - 1, dy ? 1 : C - 1);
            open(a, b);
            stack.push([a, b]);
        }
        g.fillStyle = "#ffd166"; g.fillRect((N - 1) * C + 1, (N - 1) * C + 1, C - 1, C - 1);   // the waypoint
        g.fillStyle = "#ffffff"; g.fillRect(Math.floor(N / 2) * C + 1, Math.floor(N / 2) * C + 1, C - 1, C - 1);  // you
    }

    /* ---------------------------------------------------------------
       MISSION PASSED */
    let banner = null;
    function mission(detail) {
        if (!banner || !detail) return;
        const passed = (Number(detail.solved) || 0) > 0;
        const g = GAMES.find((x) => x.key === detail.game);
        banner.innerHTML = `<div class="gx-mission-bar"><h2>${passed ? "Mission passed!" : "Mission failed"}</h2>` +
            `<p>${esc(g ? g.label : "Daily game")}${passed ? ` · <b>+${esc(money(Number(detail.points) || 0))}</b>` : " · better luck tomorrow"}</p></div>`;
        banner.classList.remove("is-on");
        void banner.offsetWidth;
        banner.classList.add("is-on");
        later(() => banner && banner.classList.remove("is-on"), 3800);
        drawStanding();
        drawPhone();
    }

    /* ---------------------------------------------------------------
       START AND STOP */
    function start() {
        if (on) return;
        on = true;
        if (root.classList.contains("ff-embed")) return;
        sky = add(make("div", "gx-sky"));
        sky.setAttribute("aria-hidden", "true");
        drawSky();
        listen(window, "resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawSky, 250); });
        observer = new MutationObserver(drawSky);
        observer.observe(root, { attributes: true, attributeFilter: ["data-dark"] });

        if (!document.body || document.body.getAttribute("data-page") !== "home") return;

        const brand = document.querySelector(".site-header .brand-group");
        if (brand) {
            wanted = add(make("div", "gx-wanted"), brand);
            wanted.setAttribute("role", "img");
        }
        cash = add(make("div", "gx-cash", `<span class="gx-cash-n">$0</span><span class="gx-cash-lab">Maze points</span>`));
        cash.setAttribute("title", "Your all-time daily game points on this device");

        phone = add(make("div", "gx-phone",
            `<div class="gx-phone-msg" role="status" aria-live="polite"></div>` +
            `<button type="button" class="gx-phone-btn" aria-label="Texts" aria-expanded="false"><span class="gx-phone-screen"></span><span class="gx-phone-badge" hidden></span></button>`));
        listen(phone, "click", (e) => {
            const t = e.target.closest("button");
            if (!t) return;
            if (t.classList.contains("gx-phone-btn")) { if (phone.classList.contains("is-open")) closeText(false); else openText(); }
            else if (t.classList.contains("gx-phone-ok")) { closeText(true); if (inbox.length) later(openText, 220); }
            else if (t.classList.contains("gx-phone-go")) { const m = showing; closeText(true); if (m && m.go) m.go(); }
        });
        listen(document, "keydown", (e) => { if (e.key === "Escape" && phone && phone.classList.contains("is-open") && phone.contains(document.activeElement)) closeText(false); });

        const gps = add(make("button", "gx-gps", `<canvas class="gx-gps-map" aria-hidden="true"></canvas><span class="gx-gps-sweep" aria-hidden="true"></span><span class="gx-gps-lab">GPS · Surprise me</span>`));
        gps.type = "button";
        gps.setAttribute("aria-label", "GPS: open a maze at random");
        drawRadar(gps.querySelector("canvas"));
        listen(gps, "click", () => { const dice = document.getElementById("opening-dice"); if (dice) dice.click(); });

        banner = add(make("div", "gx-mission"));
        banner.setAttribute("aria-live", "polite");
        listen(document, "mazerats:daily-done", (e) => mission(e.detail));

        drawStanding();
        drawPhone();
        // Records and the sign-in change under us: another tab, a game, the account arriving.
        listen(window, "storage", (e) => { if (!e.key || /stats|gta_texts/.test(e.key)) { drawStanding(); drawPhone(); } });
        listen(document, "visibilitychange", () => { if (document.visibilityState === "visible") { drawStanding(); drawPhone(); } });
        timers.push(setInterval(() => { drawStanding(); drawPhone(); }, 20000));
        // The first text buzzes in a moment after the page settles.
        // Not on a phone, where an open text would sit over the archive: there it only buzzes.
        later(() => { if (inbox.length && innerWidth >= 760 && !document.querySelector(".modal-overlay.active, .modal-overlay.open, dialog[open]")) openText(); }, 4000);
    }

    function stop() {
        on = false;
        offs.forEach((f) => f()); offs = [];
        timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = [];
        clearTimeout(resizeTimer);
        if (observer) observer.disconnect(); observer = null;
        nodes.forEach((n) => n.remove()); nodes = [];
        sky = wanted = cash = phone = banner = null;
        painted = ""; shownCash = -1; inbox = []; showing = null;
    }

    (window.SiteSkins = window.SiteSkins || {})[NAME] = { start, stop };
})();

/* ===========================================================
   Maze Rats: a prize-wheel draw, replayed in an article
   (2 Nov 2026, the owner's: "announce the winner on the website")

   The `wheel` embed (THE EMBED CONTRACT, js/article-text.js). The block
   shows the still wheel exactly as it was drawn: the real names in their
   real slice order and colours, the event's title and the prize line, on
   the Warren wheel's own stage (js/wheel-draw.js draws both, so this is
   that wheel, not a likeness). WATCH THE DRAW replays the real spin to the
   real winner: the same curve, the same length, the pointer knocked by
   the same pegs; then the reveal, the winner's name and the prize, with
   Watch again.

     HIDDEN   Nothing names the winner before it is played: not the block's
              text, its labels, nor anything in the page but the slice
              number the spin needs (the article's own text may, which is
              its author's choice). The reveal is made when it is shown.
     SOUND    Only once Watch the draw is pressed, never on load, with a
              mute button beside it (remembered, apart from the Warren's).
     STILL    prefers-reduced-motion: no spin, a short fade to the landed
              wheel and the result, and no confetti.
     READ     The button says what it does; the winner is announced to a
              screen reader once the wheel has landed.

   Its data is the article's embedData[ref], a draw's snapshot (made by
   WheelDraw.snapshot in the Warren, checked by the `wheel` entry in
   netlify/functions/_article-embeds.js). Loaded only on a page drawing an
   article with a wheel in it (ArticleEmbeds.SCRIPTS), it loads
   js/wheel-draw.js and css/article-wheel.css itself. In the Warren it also
   gives the article editor its Wheel draw button.
   =========================================================== */
(function () {
    "use strict";

    if (!window.ArticleEmbeds) return;

    // Kept in step with the files, as a <script> tag's ?v= would be.
    const DRAW_SRC = "/js/wheel-draw.js?v=1";
    const CSS_SRC = "/css/article-wheel.css?v=4";
    const MUTE_KEY = "mazerats_replay_muted";
    const SVG_NS = "http://www.w3.org/2000/svg";
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // ------------------------------------------------------------ loading

    let drawing = null;
    function needDraw() {
        if (window.WheelDraw) return Promise.resolve(window.WheelDraw);
        if (!drawing) {
            drawing = new Promise((resolve, reject) => {
                const s = document.createElement("script");
                s.src = DRAW_SRC;
                s.async = true;
                s.onload = () => (window.WheelDraw ? resolve(window.WheelDraw) : reject(new Error("no WheelDraw")));
                s.onerror = () => { drawing = null; reject(new Error("wheel-draw.js didn't load")); };
                document.head.appendChild(s);
            });
        }
        return drawing;
    }
    // The stylesheet, once per document (the Warren's preview is a frame of its own).
    function needCss(doc) {
        if (doc.querySelector("link[data-awh-css]")) return;
        const l = doc.createElement("link");
        l.rel = "stylesheet";
        l.href = CSS_SRC;
        l.setAttribute("data-awh-css", "");
        (doc.head || doc.documentElement).appendChild(l);
    }

    let Sound = null;
    const sound = () => Sound || (Sound = window.WheelDraw.sound(MUTE_KEY));
    // Muted or not, before any sound exists.
    function mutedNow() {
        if (Sound) return Sound.muted;
        try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { return false; }
    }

    // "19:42 UTC on 2 Nov 2026", the site's UTC wording.
    function when(iso) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return "";
        const d = new Date(t);
        return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC on ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }

    const ICONS = {
        sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
        muted: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
    };
    // The live wheel's brass pointer (js/prize-wheel.js), its ids made this block's own.
    function pointerSvg(doc, n) {
        const s = doc.createElementNS(SVG_NS, "svg");
        s.setAttribute("viewBox", "0 0 64 80");
        s.setAttribute("class", "awh-pointer");
        s.setAttribute("aria-hidden", "true");
        s.setAttribute("focusable", "false");
        s.innerHTML = '<defs>' +
            `<linearGradient id="awh-brass-${n}" x1="0" x2="1"><stop offset="0" stop-color="#7a5a34"/><stop offset=".38" stop-color="#fff1c4"/><stop offset=".55" stop-color="#e8cb94"/><stop offset="1" stop-color="#8a6c48"/></linearGradient>` +
            `<radialGradient id="awh-pin-${n}" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#fff6dc"/><stop offset=".45" stop-color="#e3c48f"/><stop offset="1" stop-color="#7a5a34"/></radialGradient>` +
            '</defs>' +
            `<path d="M32 75 L21.5 24 Q32 17 42.5 24 Z" fill="url(#awh-brass-${n})" stroke="#0b0704" stroke-width="3.2" stroke-linejoin="round"/>` +
            '<path d="M31.4 66 L25.6 32" stroke="rgba(255,246,220,.6)" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
            '<circle cx="32" cy="22" r="13" fill="#2a1a0b" stroke="#0b0704" stroke-width="2.5"/>' +
            `<circle cx="32" cy="22" r="9.5" fill="url(#awh-pin-${n})"/>` +
            '<circle cx="32" cy="22" r="3.2" fill="#4a3018"/>' +
            '<circle cx="28.8" cy="18.8" r="2" fill="#fffaf0" opacity=".8"/>';
        return s;
    }

    // ------------------------------------------------------------ a block

    let blockNo = 0;
    /* The blocks playing just now. The sound engine sleeps once none is
       (as the Warren wheel's does on closing), so a page left open on a
       played draw doesn't keep the browser's audio thread awake. */
    const playing = new Set();
    function played(no) {
        playing.delete(no);
        if (!playing.size && Sound) Sound.sleep();
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function render(el, data) {
        const doc = el.ownerDocument || document;
        const snap = data && data.data;
        if (!snap || !Array.isArray(snap.names) || !snap.names.length) {
            el.innerHTML = '<p class="art-embed-missing">This prize draw couldn\'t be shown.</p>';
            return;
        }
        needCss(doc);
        el.classList.add("awh-host");
        el.innerHTML = '<p class="art-embed-wait">Loading the prize wheel…</p>';
        needDraw().then(WD => {
            if (!el.isConnected) return;
            el.replaceChildren();
            build(el, doc, snap, WD);
        }).catch(() => {
            if (el.isConnected) el.innerHTML = '<p class="art-embed-missing">This part of the article couldn\'t be shown.</p>';
        });
    }

    function build(el, doc, snap, WD) {
        const no = ++blockNo;
        const win = doc.defaultView || window;
        const mk = (tag, cls, text) => {
            const e = doc.createElement(tag);
            if (cls) e.className = cls;
            if (text != null) e.textContent = text;
            return e;
        };
        const n = snap.names.length;
        const eventTitle = snap.event || "Prize draw";
        const countWords = `${n} name${n === 1 ? "" : "s"} on the wheel`;

        const box = mk("div", "awh");
        box.setAttribute("role", "group");
        box.setAttribute("aria-label", `Prize draw for ${eventTitle}`);
        const stage = mk("div", "awh-stage");
        stage.append(mk("div", "awh-bg"), mk("div", "awh-vignette"));

        const head = mk("div", "awh-head");
        head.append(mk("div", "awh-eyebrow", "Prize draw"), mk("div", "awh-title", eventTitle));
        if (snap.prize) head.appendChild(mk("div", "awh-prize", snap.prize));
        head.appendChild(mk("div", "awh-count", countWords));

        const wheelBox = mk("div", "awh-wheelbox");
        const canvas = mk("canvas", "awh-wheel");
        canvas.setAttribute("aria-hidden", "true");
        const ptr = pointerSvg(doc, no);
        wheelBox.append(mk("div", "awh-glow"), canvas, ptr);

        const ctrl = mk("div", "awh-ctrl");
        const play = mk("button", "awh-play", "Watch the draw");
        play.type = "button";
        ctrl.appendChild(play);
        // In the stage's corner, over the reveal too.
        const mute = mk("button", "awh-sound");
        mute.type = "button";

        const conf = mk("canvas", "awh-confetti");
        conf.setAttribute("aria-hidden", "true");

        // The reveal: filled only when it is shown.
        const reveal = mk("div", "awh-reveal");
        reveal.hidden = true;

        stage.append(head, wheelBox, ctrl, conf, reveal, mute);
        const live = mk("p", "awh-live");
        live.setAttribute("aria-live", "polite");
        const note = mk("figcaption", "awh-note");
        // The count is on the stage already (.awh-count), so this is the when alone (3 Nov 2026).
        note.textContent = snap.drawnAt ? `Drawn at ${when(snap.drawnAt)}.` : "";
        if (snap.rebuilt) {
            note.appendChild(doc.createTextNode(" "));
            note.appendChild(mk("span", "awh-rebuilt", "The wheel's slice order wasn't recorded for this draw, so its names are set out afresh; the winner and the prize are the real ones."));
        }
        box.append(stage, live);
        el.append(box, note);

        // ---- the drawing

        /* AT REST IT TURNS SLOWLY (3 Nov 2026, the owner's, from the bug scan:
           resting where the live wheel did, the pointer sat on a name that
           readers took for the winner). It starts on a divider, between two
           names, and turns a full circle in IDLE_TURN seconds until Watch
           the draw is pressed; the spin then sets off from wherever it has
           got to and still lands on the real winner (WheelDraw.plan lands on
           `where` from any start). Only while it is on screen, and not at all
           for a reader who asks for reduced motion (it rests on the divider). */
        const IDLE_TURN = 90;
        let drifting = true;
        let px = 0, parts = null, rot = 0;
        // idle | spinning | landing | reveal | done (the reveal up, the bulbs at rest)
        let mode = "idle";
        const moving = () => mode === "spinning" || mode === "landing" || mode === "reveal";
        let spin = null, t0 = 0, lastT = 0, raf = 0, lastBoundary = null, lastTick = 0;
        let litFrom = 0, revealTimer = 0, restTimer = 0;
        let pointer = { a: 0, v: 0 };
        let confetti = [];
        const lit = WD.spans(snap.names.map(() => 1))[snap.win];

        function size() {
            const w = wheelBox.clientWidth;
            if (!w) return false;
            const dpr = win.devicePixelRatio || 1;
            const want = clamp(Math.round(w * dpr), 120, 1440);
            if (want !== px || !parts) {
                px = want;
                canvas.width = canvas.height = px;
                parts = { rim: WD.drawRim(px), gloss: WD.drawGloss(px), disk: WD.drawDisk(px, snap.names, { colours: snap.colours }) };
            }
            const sw = stage.clientWidth, sh = stage.clientHeight, cw = Math.round(sw * dpr);
            if (conf.width !== cw) { conf.width = cw; conf.height = Math.round(sh * dpr); }
            return true;
        }
        function frame(t) {
            if (!parts) return;
            const rest = !moving() || (mode === "spinning" && !spin) || (mode !== "spinning" && reduced());
            const bm = rest ? "idle" : mode;
            WD.render(canvas, parts, {
                rot, t,
                lit: mode === "landing" ? lit : null, litFrom,
                // At rest the bulbs hold one still moment of their breathing.
                bulb: i => WD.bulbState(bm, i, rest ? 400 : t, spin ? spin.chase : 0)
            });
            ptr.style.transform = `rotate(${pointer.a}rad)`;
        }
        function still() {
            if (size()) frame(win.performance.now());
        }

        function step(t) {
            raf = 0;
            if (!el.isConnected) { stop(); return; }
            const dt = Math.min(0.05, (t - (lastT || t)) / 1000);
            lastT = t;
            if (mode === "idle" && driftNow()) rot = WD.mod(rot + WD.TAU / IDLE_TURN * dt, WD.TAU);
            if (mode === "spinning" && spin) {
                const s = (t - t0) / 1000;
                const [r, v] = WD.at(spin, s);
                rot = r;
                spin.chase += Math.abs(v) * dt * 2.2 + dt * 2;
                if (!spin.whooshed && s >= spin.windUp) { spin.whooshed = true; if (Sound) Sound.whoosh(); }
                // the pegs, as the live wheel's
                const b = WD.boundary(rot, n);
                if (lastBoundary !== null && b !== lastBoundary) {
                    const speed = Math.abs(v);
                    const kick = clamp(0.07 + speed * 0.022, 0.07, 0.42) * Math.sign(v || 1);
                    pointer.v -= kick * 26;
                    if (t - lastTick > 28) { lastTick = t; if (Sound) Sound.tick(clamp(1.2 - speed / 14, 0.25, 1)); }
                }
                lastBoundary = b;
                if (s >= WD.length(spin)) land(t);
            }
            // the pointer's spring
            pointer.v += (-340 * pointer.a - 17 * pointer.v) * dt;
            pointer.a = clamp(pointer.a + pointer.v * dt, -0.5, 0.5);
            frame(t);
            if (confetti.length) stepConfetti(dt);
            if (moving() || driftNow() || confetti.length || Math.abs(pointer.a) > 0.001 || Math.abs(pointer.v) > 0.001) raf = win.requestAnimationFrame(step);
        }
        function go() {
            if (!raf) { lastT = 0; raf = win.requestAnimationFrame(step); }
        }
        function stop() {
            if (raf) win.cancelAnimationFrame(raf);
            raf = 0;
            clearTimeout(revealTimer);
            clearTimeout(restTimer);
            if (ro) ro.disconnect();
            if (io) io.disconnect();
            played(no);
        }

        const reduced = () => !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
        let onScreen = false, io = null;
        const driftNow = () => drifting && onScreen && !reduced();

        // ---- play

        function start() {
            if (mode === "spinning" || mode === "landing") return;
            const S = sound();
            playing.add(no);
            S.wake();
            paintMute();
            hideReveal();
            clearTimeout(restTimer);
            confetti = [];
            pointer = { a: 0, v: 0 };
            // From where the wheel is now (see AT REST IT TURNS SLOWLY): it lands on the draw's own spot.
            drifting = false;
            spin = Object.assign(WD.plan(rot, snap.where, n, snap.turns, snap.decel), { chase: 0, whooshed: false });
            box.classList.add("is-playing");
            // No "…": the pixel face has no such glyph.
            play.textContent = "Spinning";
            play.setAttribute("aria-disabled", "true");
            if (reduced()) {
                // A short fade to the landed wheel (no spin to watch).
                box.classList.add("is-fading");
                mode = "landing";
                rot = WD.mod(spin.from + spin.delta, WD.TAU);
                spin = null;
                litFrom = win.performance.now();
                setTimeout(() => {
                    if (!el.isConnected) return;
                    box.classList.remove("is-fading");
                    if (Sound) Sound.thunk();
                    still();
                    revealTimer = setTimeout(showReveal, 500);
                }, 260);
                return;
            }
            mode = "spinning";
            lastBoundary = null;
            t0 = win.performance.now();
            go();
        }
        function land(t) {
            rot = WD.mod(spin.from + spin.delta, WD.TAU);
            spin = null;
            mode = "landing";
            if (Sound) Sound.thunk();
            litFrom = t;
            revealTimer = setTimeout(showReveal, 1150);
        }

        // Shrinks the winner's name to the stage, on two lines past a floor.
        function fitName(node) {
            const room = node.parentNode.clientWidth;
            const max = clamp(Math.round(stage.clientWidth * 0.12), 26, 72);
            node.classList.remove("is-two");
            // One line down to half size, as the live wheel's reveal (fitReveal), then two.
            let s = max;
            for (; s >= Math.max(22, Math.round(max * 0.5)); s -= 2) {
                node.style.fontSize = s + "px";
                if (node.scrollWidth <= room) return;
            }
            node.classList.add("is-two");
            for (s = Math.round(max * 0.7); s > 14; s -= 2) {
                node.style.fontSize = s + "px";
                if (node.scrollWidth <= room && node.offsetHeight <= s * 2.3 + 12) return;
            }
            node.style.fontSize = "14px";
        }

        function showReveal() {
            if (!el.isConnected) return;
            mode = "reveal";
            const winner = snap.names[snap.win];
            const inner = mk("div", "awh-reveal-inner");
            const name = mk("div", "awh-reveal-name", winner);
            inner.append(mk("div", "awh-reveal-eyebrow", "The winner is"), name,
                mk("div", "awh-reveal-place", `Winner · ${eventTitle}`));
            if (snap.prize) inner.appendChild(mk("div", "awh-reveal-prize", snap.prize));
            const again = mk("button", "awh-again", "Watch again");
            again.type = "button";
            again.addEventListener("click", () => { const f = again === doc.activeElement; start(); if (f) play.focus(); });
            reveal.replaceChildren(inner, again);
            reveal.hidden = false;
            fitName(name);
            // Focus follows the button that was pressed, now under the reveal.
            const hadFocus = doc.activeElement === play;
            play.textContent = "Watch the draw";
            play.removeAttribute("aria-disabled");
            if (hadFocus) again.focus({ preventScroll: true });
            box.classList.add("is-revealed");
            box.classList.remove("is-playing");
            live.textContent = `The winner is ${winner}.${snap.prize ? ` Prize: ${snap.prize}.` : ""}`;
            if (Sound) Sound.fanfare();
            // The fanfare's last bell is gone within four seconds.
            if (reduced()) { mode = "done"; still(); restTimer = setTimeout(() => played(no), 4000); return; }
            burst();
            go();
            // The bulbs chase a while, then the block rests.
            restTimer = setTimeout(() => { if (mode === "reveal") mode = "done"; played(no); }, 6000);
        }
        function hideReveal() {
            reveal.hidden = true;
            reveal.replaceChildren();
            box.classList.remove("is-revealed");
            live.textContent = "";
        }

        // ---- confetti, the live wheel's, at the block's size

        function burst() {
            const cols = ["#f2c94c", "#fff1c4", "#e3c48f", "#c7a679", "#b8452f", "#6a4a9c", "#2f78a0", "#4f8a45"];
            const W = stage.clientWidth, H = stage.clientHeight, k = clamp(W / 1600 * 2.2, 0.35, 1);
            const make = (x, y, vx, vy) => ({
                x, y, vx, vy, k,
                s: (7 + Math.floor(Math.random() * 3) * 3) * k,
                tall: Math.random() < 0.5,
                rot: Math.random() * WD.TAU, vr: (Math.random() - 0.5) * 12,
                flip: Math.random() * WD.TAU, vf: 6 + Math.random() * 10,
                col: cols[Math.floor(Math.random() * cols.length)]
            });
            for (let i = 0; i < 40; i++) {
                const a = -Math.PI / 2 + 0.42 + (Math.random() - 0.5) * 0.6, v = (900 + Math.random() * 400) * H / 900 * 1.6;
                confetti.push(make(-6, H + 6, Math.cos(a) * v, Math.sin(a) * v));
                const b = -Math.PI / 2 - 0.42 + (Math.random() - 0.5) * 0.6;
                confetti.push(make(W + 6, H + 6, Math.cos(b) * v, Math.sin(b) * v));
            }
            for (let i = 0; i < 50; i++) confetti.push(make(Math.random() * W, -10 - Math.random() * H * 0.4, (Math.random() - 0.5) * 40, 60 + Math.random() * 80));
        }
        function stepConfetti(dt) {
            const ctx = conf.getContext("2d");
            const W = stage.clientWidth, H = stage.clientHeight, d = conf.width / (W || 1);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, conf.width, conf.height);
            ctx.setTransform(d, 0, 0, d, 0, 0);
            confetti = confetti.filter(p => {
                const drag = Math.pow(0.4, dt);
                p.vx *= drag;
                p.vy = p.vy * drag + 600 * dt;
                if (p.vy > 110) p.vy = 110 + (p.vy - 110) * Math.pow(0.001, dt);
                p.x += (p.vx + Math.sin(p.flip) * 20 * p.k) * dt;
                p.y += p.vy * dt;
                p.rot += p.vr * dt;
                p.flip += p.vf * dt;
                if (p.y > H + 30) return false;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.scale(1, Math.cos(p.flip));
                ctx.fillStyle = p.col;
                ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.tall ? p.s * 1.8 : p.s);
                ctx.restore();
                return true;
            });
            if (!confetti.length) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, conf.width, conf.height); }
        }

        // ---- the mute button

        function paintMute() {
            const off = mutedNow();
            mute.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${off ? ICONS.muted : ICONS.sound}</svg>`;
            mute.setAttribute("aria-pressed", String(off));
            mute.setAttribute("aria-label", "Mute the draw's sound");
            mute.title = off ? "Sound is off" : "Sound is on (it plays only when you watch)";
        }
        mute.addEventListener("click", () => {
            const off = !mutedNow();
            if (Sound) Sound.setMuted(off);
            else { try { localStorage.setItem(MUTE_KEY, off ? "1" : "0"); } catch (e) { /* this time only */ } }
            paintMute();
        });
        play.addEventListener("click", () => { if (play.getAttribute("aria-disabled") !== "true") start(); });
        paintMute();

        // ---- size and fonts

        let ro = null;
        if (win.ResizeObserver) {
            ro = new win.ResizeObserver(() => {
                if (!el.isConnected) { stop(); return; }
                if (size()) {
                    frame(win.performance.now());
                    const nm = reveal.querySelector(".awh-reveal-name");
                    if (nm && !reveal.hidden) fitName(nm);
                }
            });
            ro.observe(wheelBox);
            ro.observe(stage);
        }
        // The slow turn runs only while the wheel is on screen (AT REST IT TURNS SLOWLY).
        if (win.IntersectionObserver) {
            io = new win.IntersectionObserver(seen => {
                if (!el.isConnected) { stop(); return; }
                onScreen = seen.some(x => x.isIntersecting);
                if (driftNow()) go();
            });
            io.observe(stage);
        } else onScreen = true;
        still();
        if (driftNow()) go();
        // The names wait on Montserrat; drawn again once it is in.
        const fonts = doc.fonts;
        if (fonts && fonts.load) {
            Promise.all([fonts.load(WD.nameFont(24)), fonts.load("900 40px Montserrat")]).then(() => {
                if (!el.isConnected || !px) return;
                parts.disk = WD.drawDisk(px, snap.names, { colours: snap.colours });
                frame(win.performance.now());
            }).catch(() => {});
        }
    }

    // ------------------------------------------------- the Warren's button

    /* "Wheel draw" on the article editor's formatting bar (2 Nov 2026, the
       owner's): pick an event and one of its saved winners from the prize
       wheel's Draw log, and its replay goes in at the caret, with the
       draw's snapshot as the block's data. The draws are read through
       js/admin-entries.js (window.AdminEntries.draws), which the Warren
       always has. */
    async function insertDraw(ctx) {
        const D = window.AdminEntries && window.AdminEntries.draws;
        needCss(document);
        if (!D || !window.WheelDraw) {
            await needDraw().catch(() => {});
            if (!D || !window.WheelDraw) { await ctx.tell("The prize wheel's draws can't be read here. Reload the Warren and try again."); return; }
        }
        const pick = await pickDraw(D, ctx.article && ctx.article.eventId);
        if (!pick) return;
        if (ctx.article && typeof ctx.article.body === "string" && D.holding([ctx.article], pick.id)) {
            await ctx.tell("That draw is in this article already.");
            return;
        }
        const ref = D.ref(pick.id);
        const line = ctx.embedLine("wheel", { ref, draw: pick.id });
        if (!line) { await ctx.tell("That draw can't be put in an article."); return; }
        ctx.setData(ref, pick.snap);
        ctx.insert(line);
        if (pick.snap.rebuilt) {
            await ctx.tell("This draw is from before the wheel kept its slice order, so its replay is rebuilt: the real winner and prize, with the event's entrants as they are today in an order of their own. The article says so under the wheel.");
        }
    }

    /* The picker: an event, then a saved winner from its Draw log. Resolves
       { id, snap } or null. Dressed as the Warren's own dialogs. */
    function pickDraw(D, eventId) {
        return new Promise(resolve => {
            const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open wr-ui wr-dialog awh-pick-overlay";
            overlay.innerHTML = `
                <div class="modal confirm-modal awh-pick" role="dialog" aria-modal="true" aria-labelledby="awh-pick-title">
                    <div class="chrome-titlebar">
                        <h2 id="awh-pick-title">Put in a wheel draw</h2>
                        <button type="button" class="chrome-close" aria-label="Cancel">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="admin-hint">Pick an event, then a winner saved from the prize wheel's Draw log. The article shows the wheel with a Watch the draw button, and the winner stays hidden until it is played.</p>
                        <label class="admin-field"><span>Event</span><select data-awh-event><option value="">Loading the events…</option></select></label>
                        <div class="admin-field"><span id="awh-pick-label">Saved winners</span>
                            <div class="awh-pick-list" role="radiogroup" aria-labelledby="awh-pick-label"></div></div>
                        <p class="admin-hint awh-pick-status" role="status"></p>
                        <div class="admin-form-actions confirm-actions">
                            <button type="button" class="admin-action-pill admin-pill-solid" data-awh-ok disabled>Put it in</button>
                            <button type="button" class="admin-action-pill" data-awh-cancel>Cancel</button>
                        </div>
                    </div>
                </div>`;
            const returnTo = document.activeElement;
            const madeInert = Array.from(document.body.children).filter(x => !x.inert);
            document.body.appendChild(overlay);
            madeInert.forEach(x => { x.inert = true; });
            const sel = overlay.querySelector("[data-awh-event]");
            const list = overlay.querySelector(".awh-pick-list");
            const status = overlay.querySelector(".awh-pick-status");
            const ok = overlay.querySelector("[data-awh-ok]");
            let rows = [], gen = 0, done = false;
            function finish(val) {
                if (done) return;
                done = true;
                document.removeEventListener("keydown", onKey, true);
                madeInert.forEach(x => { x.inert = false; });
                overlay.remove();
                if (returnTo && returnTo.focus) returnTo.focus({ preventScroll: true });
                resolve(val);
            }
            function onKey(e) {
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); return; }
                if (e.key !== "Tab") return;
                const f = Array.from(overlay.querySelectorAll("button:not([disabled]), select, input:not([disabled])")).filter(x => x.offsetParent !== null);
                if (!f.length) return;
                const i = f.indexOf(document.activeElement);
                if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
                else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
            }
            document.addEventListener("keydown", onKey, true);
            overlay.addEventListener("click", e => { if (e.target === overlay) finish(null); });
            overlay.querySelector(".chrome-close").addEventListener("click", () => finish(null));
            overlay.querySelector("[data-awh-cancel]").addEventListener("click", () => finish(null));
            const chosen = () => { const r = list.querySelector("input:checked"); return r ? rows.find(x => x.id === r.value) : null; };
            list.addEventListener("change", () => { ok.disabled = !chosen(); });
            async function showDraws() {
                const mine = ++gen;
                rows = [];
                ok.disabled = true;
                list.innerHTML = "";
                status.textContent = "Reading the Draw log…";
                try {
                    rows = await D.saved(sel.value);
                    if (mine !== gen) return;
                    status.textContent = rows.length ? "" : "No winner saved for this event yet. Save one from the wheel's Draw log first.";
                    list.innerHTML = rows.map((d, i) => {
                        const bits = [when(d.drawnAt), d.onWheel ? `${d.onWheel} on the wheel` : "", d.prize ? `Prize: ${d.prize}` : ""].filter(Boolean).join(" · ");
                        return `<label class="awh-pick-row"><input type="radio" name="awh-pick" value="${esc(d.id)}"${i === 0 ? " checked" : ""}><span><b>${esc(d.name)}</b><small>${esc(bits)}</small></span></label>`;
                    }).join("");
                    ok.disabled = !chosen();
                } catch (err) {
                    if (mine !== gen) return;
                    status.textContent = err && err.status === 401 ? "Your Warren session has ended. Sign in again." : `Couldn't read the Draw log: ${(err && err.message) || "something went wrong"}`;
                }
            }
            sel.addEventListener("change", showDraws);
            ok.addEventListener("click", async () => {
                const d = chosen();
                if (!d) return;
                ok.disabled = true;
                status.textContent = "Getting the draw…";
                try {
                    const snap = await D.snapshot(sel.value, d.id, D.title(sel.value));
                    finish({ id: d.id, snap });
                } catch (err) {
                    ok.disabled = false;
                    status.textContent = `Couldn't put it in: ${(err && err.message) || "something went wrong"}`;
                }
            });
            D.events().then(evs => {
                if (done) return;
                const start = evs.some(e => e.id === eventId) ? eventId : (evs[1] || evs[0] || {}).id || "none";
                sel.innerHTML = evs.map(e => `<option value="${esc(e.id)}"${e.id === start ? " selected" : ""}>${esc(e.title || e.id)}</option>`).join("");
                sel.focus();
                showDraws();
            }).catch(err => {
                status.textContent = `Couldn't read the events: ${(err && err.message) || "something went wrong"}`;
            });
            sel.focus();
        });
    }

    window.ArticleEmbeds.register("wheel", {
        label: "Prize draw",
        render,
        editorButton: {
            label: "Wheel draw",
            title: "Wheel draw: a replay of a prize-wheel draw, the winner hidden until it is played",
            insert: insertDraw
        }
    });
})();

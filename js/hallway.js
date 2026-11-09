/* The Hallway on the homepage (6 Nov 2026).

   HOW IT OPENS. From the menu tab, with no new page: the archive slides up out
   of the way, the fellow fansites down, the footer settles at the foot of the
   screen, and the hallway fills the space between the top bar and the footer.
   The same again backwards when you leave, by the entrance, the Leave button
   or the browser's Back. Its address is /hallway, and arriving there straight
   away shows the hallway with nothing to watch slide.

   WHO GETS IN. The Warren's switch, settings.hallwayState:
     hidden        no menu row; the address goes back to the archive
     coming-soon   a screen saying so
     maintenance   a screen saying so
     live          everybody walks it
   An admin the server has vouched for walks it in EVERY state, with a small
   label saying what visitors get. This is the same front-door check as Scout's
   Trail's: it decides what the site offers, it isn't a lock on the art.

   THE WALK ITSELF is the hallway editor's own code on its own page, in a frame
   (assets/hallway/app/play.html, made by tools/hallway-editor/publish.js), with
   the pictures drawn ahead of time. So what's walked here is pixel for pixel
   what was laid out, and it only changes when a new version is published. As
   with Fallin' Furni, nothing of it is fetched until it's opened. */
(function () {
    "use strict";
    const PATH = /^\/hallway\/?$/;
    const PLAY = "/assets/hallway/app/play.html";
    const NOTES = {
        "coming-soon": ["Coming soon", "The hallway isn't open yet. Soon you'll be able to walk the archive, door by door."],
        maintenance: ["Being worked on", "The hallway is closed for a little while. Back soon."]
    };
    const LABELS = { hidden: "Hidden", "coming-soon": "Coming soon", maintenance: "Maintenance" };
    const root = document.documentElement;
    let stage = null, frame = null, opened = false, opening = false, pushed = false, headWatch = null, closing = 0, openGen = 0;

    const settings = () => (typeof Api !== "undefined" && Api.getSiteSettings) ? Api.getSiteSettings().catch(() => null) : Promise.resolve(null);
    const isAdmin = () => window.hallwayAdminCheck ? Promise.resolve(window.hallwayAdminCheck()).catch(() => false) : Promise.resolve(false);
    /* Only a real answer counts: the fallback settings don't know this switch, so they read as Hidden. */
    const stateOf = s => (s && !s.fromCache && ["coming-soon", "maintenance", "live"].includes(s.hallwayState)) ? s.hallwayState : "hidden";

    /* The hallway fills from the bottom of the top bar to the top of the footer, whatever size they are */
    /* Full screen, whether F11 (the window fills the screen) or the page asking for it: the footer goes (8 Nov 2026, his) */
    const fullNow = () => !!document.fullscreenElement || matchMedia("(display-mode: fullscreen)").matches || (Math.abs(innerHeight - screen.height) <= 1 && Math.abs(innerWidth - screen.width) <= 1);
    document.addEventListener("fullscreenchange", () => place());
    function place() {
        root.classList.toggle("hallway-full", fullNow());
        const head = document.querySelector(".site-header"), foot = document.querySelector("body > .site-footer");
        root.style.setProperty("--hallway-top", Math.max(0, head ? Math.round(head.getBoundingClientRect().bottom) : 0) + "px");
        if (!foot) return;
        /* Measured with its own transform taken out, so this doesn't chase itself */
        const was = getComputedStyle(foot).transform, m = was && was !== "none" ? new DOMMatrixReadOnly(was).m42 : 0, r = foot.getBoundingClientRect(), naturalTop = r.top - m, h = Math.round(r.height);
        root.style.setProperty("--hallway-footer-y", Math.round(innerHeight - h - naturalTop) + "px");
        root.style.setProperty("--hallway-bottom", (innerWidth <= 760 || innerHeight <= 500 ? 0 : h) + "px");
    }

    /* The site's own window (the same classes as every other, so it wears every palette, dark mode and skin) */
    function note(title, words) {
        const n = document.createElement("div"); n.className = "modal hallway-note"; n.setAttribute("role", "status");
        const bar = document.createElement("div"); bar.className = "chrome-titlebar";
        const h = document.createElement("h2"); h.textContent = title;
        const x = document.createElement("button"); x.type = "button"; x.className = "chrome-close"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", () => close());
        const xi = document.createElement("img"); xi.src = "/assets/img/modal_topclose_x.png"; xi.alt = ""; xi.setAttribute("aria-hidden", "true"); x.appendChild(xi);
        bar.append(h, x);
        const frame = document.createElement("div"); frame.className = "chrome-frame";
        const body = document.createElement("div"); body.className = "hallway-note-body";
        const p = document.createElement("p"); p.textContent = words; body.appendChild(p);
        const b = document.createElement("button"); b.type = "button"; b.className = "guess-btn guess-btn--lead"; b.textContent = "Back to the archive"; b.addEventListener("click", () => close()); body.appendChild(b);
        frame.appendChild(body); n.append(bar, frame);
        return n;
    }

    /* Behind a closed screen: the hallway as it's published now, whichever copy the walk would use, drawn from the same
       pictures at 3x on whole pixels and centred on the statue. So it can't go out of date, and it follows the statue if that moves. */
    const FN = "/.netlify/functions/hallway", PIC_W = 900, PIC_H = 520, TILE = 512, STOREY = 163;
    async function closedPicture(into, gen) {
        const read = url => fetch(url, { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
        const [here, there] = await Promise.all([read("/assets/hallway/manifest.json"), read(FN + "?what=live")]);
        const online = !!(there && there.online), man = online ? there : here; if (!man || !man.tiles) return;
        const map = await read(online ? FN + "?what=map&v=" + encodeURIComponent(man.version || "") : "/assets/hallway/map.json"); if (!map || !Array.isArray(map.levels)) return;
        let at = null;
        for (const l of map.levels) for (const p of l.props || []) if (p.k === "statue") at = { x: p.x + 1, y: p.y + 1, z: l.k * STOREY + 45 };      // on 2 x 2 tiles, about 110px tall: its middle, not its feet
        if (!at && map.entrance) { const e = map.entrance, l = map.levels.find(q => q.id === e.level); at = { x: e.axis === "x" ? e.at + 4 : e.line, y: e.axis === "x" ? e.line : e.at + 4, z: ((l && l.k) || 0) * STOREY + 45 }; }
        if (!at) return;
        const x0 = Math.round((at.x - at.y) * 16 - PIC_W / 2), y0 = Math.round((at.x + at.y) * 8 - at.z - PIC_H / 2);
        const c = document.createElement("canvas"); c.className = "hallway-closed-picture"; c.width = PIC_W; c.height = PIC_H; c.setAttribute("aria-hidden", "true");
        const g = c.getContext("2d"), jobs = [];
        for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + PIC_H) / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + PIC_W) / TILE); tx++) {
            const name = man.tiles["day|" + tx + "," + ty]; if (!name) continue;
            jobs.push(new Promise(done => { const i = new Image(); i.onload = () => { g.drawImage(i, tx * TILE - x0, ty * TILE - y0); done(); }; i.onerror = done; i.src = online ? FN + "?tile=" + name : "/assets/hallway/tiles/" + name; }));
        }
        await Promise.all(jobs);
        /* Only for the opening that asked: closed and opened again quickly, the same stage is reused, and a late picture
           from the first time stacked on the second's, the faded hallway showing through twice as strong (9 Nov scan, finding 3) */
        if (gen !== openGen || !into.isConnected) return;
        for (const old of into.querySelectorAll(".hallway-closed-picture")) old.remove();
        into.prepend(c); void c.offsetWidth; c.classList.add("is-in");
    }
    function closedScreen(title, words) { stage.classList.add("is-closed"); stage.appendChild(note(title, words)); closedPicture(stage, openGen).catch(() => { /* the plain dark is fine */ }); }

    function build(instant) {
        openGen++;
        clearTimeout(closing);
        if (!stage) { stage = document.createElement("div"); stage.id = "hallway-stage"; document.body.appendChild(stage); }
        stage.textContent = ""; stage.classList.remove("is-leaving", "is-in", "is-closed");
        root.classList.toggle("hallway-instant", !!instant);
        place();
        root.classList.add("hallway-open");
        /* What's slid away is out of the keyboard's way and a screen reader's too */
        for (const e of document.querySelectorAll("body > main, body > .fellow-fansites")) e.inert = true;
        void stage.offsetWidth;
        stage.classList.add("is-in");
        const head = document.querySelector(".site-header");
        if (head && window.ResizeObserver && !headWatch) { headWatch = new ResizeObserver(place); headWatch.observe(head); }
        addEventListener("resize", place);
    }

    function startWalk(state) {
        /* Fallin' Furni's loader: a box, its words, a bar that fills */
        const load = document.createElement("div"); load.className = "hallway-loader";
        const box = document.createElement("div"); box.className = "hallway-loader-box";
        const words = document.createElement("p"); words.className = "hallway-loader-text"; words.textContent = "Loading the hallway";
        const bar = document.createElement("div"); bar.className = "hallway-loader-bar"; const fill = document.createElement("i"); bar.appendChild(fill);
        box.append(words, bar); load.appendChild(box); stage.appendChild(load);
        /* It fills as the page says things have arrived, and still creeps on a slow line rather than looking stuck.
           The page can't say anything until its own scripts are in, which is 20 seconds on a slow phone line, so until
           then the bar counts what has arrived in the frame itself: the same count over the same 42 the page uses once
           it's running, so the two agree. Each new arrival is a sign of life for the stall timer below (9 Nov scan, finding 1) */
        const f = frame = document.createElement("iframe");
        let shown = 0, seen = 0; const creep = setInterval(() => {
            try { const n = f.contentWindow.performance.getEntriesByType("resource").length; if (n > seen) { seen = n; f._told = Math.max(f._told || 0, Math.min(.95, n / 42)); f._alive(); } } catch (e) { /* not there yet */ }
            const aim = Math.max(f._told ? f._told * 100 : 0, 24); shown += (aim - shown) * .12; fill.style.width = shown + "%";
        }, 120);
        /* not open to everyone yet: a DEV MODE pill in the site's top bar, not a note over the hallway (8 Nov, his) */
        if (state !== "live" && !document.querySelector(".hallway-dev-pill")) {
            const pill = document.createElement("span"); pill.className = "header-badge header-state-pill hallway-dev-pill"; pill.textContent = "DEV MODE | HALLWAY";
            pill.title = `${LABELS[state] || state}: only admins can walk it`;
            const after = document.querySelector(".site-header .brand-group .header-badge"), group = document.querySelector(".site-header .brand-group");
            if (after) after.after(pill); else if (group) group.appendChild(pill);
        }
        f.title = "The Hallway"; f.src = PLAY; f.allow = "autoplay; fullscreen";
        f.addEventListener("load", () => { f._alive(); try { f.contentWindow.focus(); } catch (e) { /* it asks for the keyboard itself on a click */ } });
        f.dataset.creep = String(creep);
        stage.appendChild(f);
        const turn = document.createElement("div"); turn.className = "hallway-turn"; turn.textContent = "Turn your phone sideways for more room"; stage.appendChild(turn);
        /* Never stuck: 30 seconds with no sign of life, three minutes in all without "ready", or the page saying it couldn't
           start, gets a note with a way back. The 30 seconds used to count from the start, which on a slow line killed it
           while it was still arriving, every time (9 Nov scan, finding 1) */
        const STALL = 30000, CAP = 180000;
        const trouble = () => { clearInterval(creep); clearTimeout(f._late); clearTimeout(f._cap); if (frame !== f || f.classList.contains("is-ready")) return; load.remove(); f.remove(); closedScreen("The hallway wouldn't open", "Something didn't load. Try again in a little while."); };
        f._alive = () => { clearTimeout(f._late); f._late = setTimeout(trouble, STALL); };
        f._late = setTimeout(trouble, STALL); f._cap = setTimeout(trouble, CAP); f._trouble = trouble;
        f._ready = () => { clearInterval(creep); clearTimeout(f._late); clearTimeout(f._cap); fill.style.width = "100%"; f.classList.add("is-ready"); setTimeout(() => load.remove(), 450); try { f.focus(); f.contentWindow.focus(); } catch (e) { /* as above */ } };
    }

    /* open: from the menu tab. arrived: already at /hallway, nothing to slide. */
    async function open(arrived) {
        if (opened || opening) return;
        opening = true;
        const s = await settings(), state = stateOf(s), admin = state === "live" ? false : await isAdmin();
        opening = false;
        if (state === "hidden" && !admin) {
            if (PATH.test(location.pathname)) { try { history.replaceState(history.state, "", "/home" + location.search + location.hash); } catch (e) { /* stays */ } }
            return;
        }
        opened = true;
        if (!arrived && !PATH.test(location.pathname)) { try { history.pushState({ hallway: 1 }, "", "/hallway"); pushed = true; } catch (e) { /* no address, still opens */ } }
        else if (history.state && history.state.hallway) pushed = true;      // come back to by Forward: the entry behind it is still the archive
        build(!!arrived);
        if (state === "live" || admin) startWalk(state);
        else { const [t, w] = NOTES[state]; closedScreen(t, w); }
        if (window.Track && Track.event) Track.event("hallway-open", state);
    }

    function close(fromHistory) {
        if (!opened) return;
        opened = false; openGen++;
        if (!fromHistory) {
            if (pushed) { pushed = false; try { history.back(); } catch (e) { /* stays */ } }
            else if (PATH.test(location.pathname)) { try { history.replaceState(history.state, "", "/home" + location.search + location.hash); } catch (e) { /* stays */ } }
        } else pushed = false;
        root.classList.remove("hallway-instant", "hallway-open");
        for (const e of document.querySelectorAll(".hallway-dev-pill")) e.remove();
        for (const e of document.querySelectorAll("body > main, body > .fellow-fansites")) e.inert = false;
        const spine = document.getElementById("side-spine"); if (spine) { try { spine.focus({ preventScroll: true }); } catch (e) { /* nowhere to put it */ } }
        if (frame) { clearInterval(+frame.dataset.creep); clearTimeout(frame._late); clearTimeout(frame._cap); }
        removeEventListener("resize", place);
        if (headWatch) { headWatch.disconnect(); headWatch = null; }
        if (stage) {
            stage.classList.add("is-leaving");
            const st = stage;
            closing = setTimeout(() => { st.textContent = ""; st.classList.remove("is-in", "is-leaving"); st.remove(); if (stage === st) stage = null; frame = null; }, 700);
        }
    }

    /* The Back button closes it, as it would a page; Forward brings it back */
    addEventListener("popstate", () => {
        if (opened && !PATH.test(location.pathname)) close(true);
        else if (!opened && PATH.test(location.pathname)) open(true);
    });
    /* What the page in the frame says. Only ours. */
    addEventListener("message", e => {
        if (e.origin !== location.origin || !frame || e.source !== frame.contentWindow || !e.data) return;
        if (e.data.hallway === "progress") { frame._told = Math.max(frame._told || 0, Number(e.data.progress) || 0); if (frame._alive) frame._alive(); }
        if (e.data.hallway === "ready" && frame._ready) frame._ready();
        if (e.data.hallway === "failed" && frame._trouble) frame._trouble();
        if (e.data.hallway === "leave") close();
    });

    window.Hallway = { open: () => open(false), close: () => close(), get isOpen() { return opened; } };
    if (PATH.test(location.pathname)) {
        /* home.js sets the admin check as it starts; this script comes after it */
        if (document.readyState === "loading") addEventListener("DOMContentLoaded", () => open(true)); else open(true);
    }
})();

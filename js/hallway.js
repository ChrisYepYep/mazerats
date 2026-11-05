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
    let stage = null, frame = null, opened = false, pushed = false, headWatch = null, closing = 0;

    const settings = () => (typeof Api !== "undefined" && Api.getSiteSettings) ? Api.getSiteSettings().catch(() => null) : Promise.resolve(null);
    const isAdmin = () => window.hallwayAdminCheck ? Promise.resolve(window.hallwayAdminCheck()).catch(() => false) : Promise.resolve(false);
    /* Only a real answer counts: the fallback settings don't know this switch, so they read as Hidden. */
    const stateOf = s => (s && !s.fromCache && ["coming-soon", "maintenance", "live"].includes(s.hallwayState)) ? s.hallwayState : "hidden";

    /* The hallway fills from the bottom of the top bar to the top of the footer, whatever size they are */
    function place() {
        const head = document.querySelector(".site-header"), foot = document.querySelector("body > .site-footer");
        root.style.setProperty("--hallway-top", Math.max(0, head ? Math.round(head.getBoundingClientRect().bottom) : 0) + "px");
        if (!foot) return;
        /* Measured with its own transform taken out, so this doesn't chase itself */
        const was = getComputedStyle(foot).transform, m = was && was !== "none" ? new DOMMatrixReadOnly(was).m42 : 0, r = foot.getBoundingClientRect(), naturalTop = r.top - m, h = Math.round(r.height);
        root.style.setProperty("--hallway-footer-y", Math.round(innerHeight - h - naturalTop) + "px");
        root.style.setProperty("--hallway-bottom", (innerWidth <= 760 ? 0 : h) + "px");
    }

    function note(title, words, button) {
        const n = document.createElement("div"); n.className = "hallway-note";
        const t = document.createElement("strong"); t.textContent = title; n.appendChild(t);
        if (words) { const p = document.createElement("p"); p.textContent = words; n.appendChild(p); }
        if (button) { const b = document.createElement("button"); b.type = "button"; b.className = "hallway-close"; b.textContent = "Back to the archive"; b.addEventListener("click", () => close()); n.appendChild(b); }
        return n;
    }

    function build(instant) {
        clearTimeout(closing);
        if (!stage) { stage = document.createElement("div"); stage.id = "hallway-stage"; document.body.appendChild(stage); }
        stage.textContent = ""; stage.classList.remove("is-leaving", "is-in");
        root.classList.toggle("hallway-instant", !!instant);
        place();
        root.classList.add("hallway-open");
        void stage.offsetWidth;
        stage.classList.add("is-in");
        const head = document.querySelector(".site-header");
        if (head && window.ResizeObserver && !headWatch) { headWatch = new ResizeObserver(place); headWatch.observe(head); }
        addEventListener("resize", place);
    }

    function startWalk(state) {
        const load = note("Loading...", "");
        const bar = document.createElement("div"); bar.className = "hallway-bar"; const fill = document.createElement("i"); bar.appendChild(fill); load.appendChild(bar);
        stage.appendChild(load);
        /* Moving on its own until the page says it's ready, so a slow line doesn't look stuck */
        let shown = 0; const creep = setInterval(() => { shown += (90 - shown) * .08; fill.style.width = shown + "%"; }, 120);
        if (state !== "live") { const pill = document.createElement("div"); pill.className = "hallway-pill"; pill.textContent = `${LABELS[state] || state}: only admins can walk it`; stage.appendChild(pill); }
        frame = document.createElement("iframe");
        frame.title = "The Hallway"; frame.src = PLAY; frame.allow = "autoplay; fullscreen";
        frame.addEventListener("load", () => { try { frame.contentWindow.focus(); } catch (e) { /* it asks for the keyboard itself on a click */ } });
        frame.dataset.creep = String(creep);
        stage.appendChild(frame);
        const turn = document.createElement("div"); turn.className = "hallway-turn"; turn.textContent = "Turn your phone sideways for more room"; stage.appendChild(turn);
        frame._ready = () => { clearInterval(creep); fill.style.width = "100%"; frame.classList.add("is-ready"); setTimeout(() => load.remove(), 450); try { frame.focus(); frame.contentWindow.focus(); } catch (e) { /* as above */ } };
    }

    /* open: from the menu tab. arrived: already at /hallway, nothing to slide. */
    async function open(arrived) {
        if (opened) return;
        const s = await settings(), state = stateOf(s), admin = state === "live" ? false : await isAdmin();
        if (state === "hidden" && !admin) {
            if (PATH.test(location.pathname)) { try { history.replaceState(history.state, "", "/home" + location.search + location.hash); } catch (e) { /* stays */ } }
            return;
        }
        opened = true;
        if (!arrived && !PATH.test(location.pathname)) { try { history.pushState({ hallway: 1 }, "", "/hallway"); pushed = true; } catch (e) { /* no address, still opens */ } }
        build(!!arrived);
        if (state === "live" || admin) startWalk(state);
        else { const [t, w] = NOTES[state]; stage.appendChild(note(t, w, true)); }
        if (window.Track && Track.event) Track.event("hallway-open", state);
    }

    function close(fromHistory) {
        if (!opened) return;
        opened = false;
        if (!fromHistory) {
            if (pushed) { pushed = false; try { history.back(); } catch (e) { /* stays */ } }
            else if (PATH.test(location.pathname)) { try { history.replaceState(history.state, "", "/home" + location.search + location.hash); } catch (e) { /* stays */ } }
        } else pushed = false;
        root.classList.remove("hallway-instant", "hallway-open");
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
        if (e.data.hallway === "ready" && frame._ready) frame._ready();
        if (e.data.hallway === "leave") close();
    });

    window.Hallway = { open: () => open(false), close: () => close(), get isOpen() { return opened; } };
    if (PATH.test(location.pathname)) {
        /* home.js sets the admin check as it starts; this script comes after it */
        if (document.readyState === "loading") addEventListener("DOMContentLoaded", () => open(true)); else open(true);
    }
})();

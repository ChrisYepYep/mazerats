/* THE JUKEBOX (17 Oct 2026, the owner's: "give me a player when i hit 1,
   which allows me to play any of the soundtracks whilst editing; existing 0
   menu should be available too"). 1 shows it, 0 shows its mixer (the game's
   secret mixer: the eight layers of the music, each on or off). Plays the
   game's own music (RatMusic) while you edit; testing a passage takes the
   music over, as the game does. */
(function () {
    const AE = window.AE, $ = s => document.querySelector(s);
    const M = () => window.RatMusic || null;
    // the tunes, by the zone number the music knows them by
    const TRACKS = [
        { n: 0, name: "Title" },
        { n: 1, name: "Mine Labyrinth" }, { n: 2, name: "Stone Quarry" }, { n: 3, name: "Ice Caverns" },
        { n: 4, name: "Dark Depths" }, { n: 5, name: "Sunken Station" }, { n: 6, name: "The Heart of the Labyrinth" },
        { n: 7, name: "Clockwork Vault" }, { n: 8, name: "Sandfall Tomb" }, { n: 9, name: "Steamworks Factory" },
        { n: 10, name: "Overgrown Ruins" }, { n: 11, name: "Neon Jungle Arcade" },
        // (23 Oct 2026, the owner's: "Keep the current quarry soundtrack as a backup") the machine, before the folk tune took its place
        { n: 12, name: "Stone Quarry: the machine (backup)", num: "B1" },
        // (21 Oct 2026, the owner's: "more bass heavy versions of the splash screen soundtrack and zone 1 soundtrack"): heavy, and deep (808s), here only
        { n: "heavy:0:1", name: "Title: bass heavy", num: "H1" }, { n: "heavy:0:2", name: "Title: deep (808s)", num: "H2" },
        { n: "heavy:1:1", name: "Mine Labyrinth: bass heavy", num: "H3" }, { n: "heavy:1:2", name: "Mine Labyrinth: deep (808s)", num: "H4" },
        // (22 Oct 2026, the owner's: "more versions of our mine zone soundtrack, in these genres") the Mine's tune in other styles, here only
        { n: "style:pop", name: "Mine Labyrinth: pop", num: "G1" }, { n: "style:house", name: "Mine Labyrinth: house", num: "G2" }, { n: "style:trance", name: "Mine Labyrinth: trance", num: "G3" },
        { n: "style:folk", name: "Mine Labyrinth: spooky folk", num: "G4" }, { n: "style:ambient", name: "Mine Labyrinth: ambient", num: "G5" },
        // (17 Oct 2026) the Mine's tune, epic, in three versions: not in any level, only here (js/rat-race-epic.js)
        { n: "epic:hybrid", name: "Mine Labyrinth: epic, hybrid", num: "E1" }, { n: "epic:orchestral", name: "Mine Labyrinth: epic, orchestral", num: "E2" }, { n: "epic:trailer", name: "Mine Labyrinth: epic, trailer", num: "E3" },
        { n: "epic:dark", name: "Dark Depths: epic", num: "E4" }, { n: "epic:steam", name: "Steamworks Factory: epic", num: "E5" },
        // (18 Oct 2026) the epics are played by recorded instruments now; each as it was, its orchestra made from oscillators
        { n: "epic:hybrid-made", name: "Mine: epic hybrid, made sounds", num: "S1" }, { n: "epic:orchestral-made", name: "Mine: epic orchestral, made sounds", num: "S2" }, { n: "epic:trailer-made", name: "Mine: epic trailer, made sounds", num: "S3" },
        { n: "epic:dark-made", name: "Dark Depths: epic, made sounds", num: "S4" }, { n: "epic:steam-made", name: "Steamworks: epic, made sounds", num: "S5" }
    ];
    const E = () => window.RatEpic || null;
    const isEpic = n => typeof n === "string" && n.startsWith("epic:");
    const LAYERS = [["kick", "Kick"], ["snare", "Snare + toms"], ["hats", "Hats + crash"], ["bass", "Bass"], ["stabs", "Chord stabs"], ["echo", "Echo"], ["parts", "Answer parts"], ["lead", "Lead"]];
    let box = null, now = null, timer = 0;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

    function build() {
        box = el("div", "jukebox"); box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Music");
        const head = el("div", "jb-head");
        head.append(el("strong", "", "Music"), el("span", "dim small", "1 hides · 0 mixer"));
        const close = el("button", "icon-btn jb-x"); close.type = "button"; close.title = "Close (1)"; close.textContent = "×"; close.onclick = () => show(false);
        head.append(close);
        const list = el("div", "jb-list");
        for (const t of TRACKS) {
            const b = el("button", "jb-track"); b.type = "button"; b.dataset.n = t.n;
            b.append(el("span", "jb-num", t.num || (t.n ? String(t.n) : "–")), el("span", "jb-name", t.name), el("span", "jb-tag"));
            b.onclick = () => (now === t.n && ((M() && M().playing) || (E() && (E().playing || E().preparing))) ? stop() : play(t.n));
            list.append(b);
        }
        const bar = el("div", "jb-bar");
        const stopB = el("button", "btn small"); stopB.type = "button"; stopB.textContent = "Stop"; stopB.onclick = stop; stopB.id = "jb-stop";
        const mixB = el("button", "toggle small"); mixB.type = "button"; mixB.textContent = "Mixer"; mixB.id = "jb-mixbtn"; mixB.title = "The game's secret mixer (0)"; mixB.onclick = () => mixer(!box.classList.contains("mixing"));
        bar.append(stopB, el("div", "spacer"), mixB);
        const mix = el("div", "jb-mix");
        LAYERS.forEach(([key, label], i) => {
            const b = el("button", "jb-layer"); b.type = "button"; b.dataset.k = key;
            b.append(el("span", "jb-num", String(i + 1)), el("span", "jb-name", label), el("span", "jb-on"));
            b.onclick = () => { if (M() && M().mix) M().mix(key); refresh(); };
            mix.append(b);
        });
        box.append(head, list, bar, mix);
        $("#stage").append(box);
    }
    function play(n) {
        if (isEpic(n)) {
            if (!E()) { AE.toast && AE.toast("The epic version did not load"); return; }
            if (M()) M().stop();
            // (started before refresh looks: it sets what is being made at once, and refresh lets go of a tune nothing is making)
            const p = E().play(n.slice(5));
            now = n; refresh();
            p.then(refresh, e => { AE.toast && AE.toast("Could not make it: " + e.message, "error"); now = null; refresh(); });
            return;
        }
        if (E()) E().stop();
        const m = M(); if (!m) { AE.toast && AE.toast("The music did not load"); return; }
        if (m.isMuted && m.isMuted()) m.setMuted(false);
        if (typeof n === "string" && n.startsWith("style:")) m.start(1, { zone: 1, style: n.slice(6) });
        else if (typeof n === "string" && n.startsWith("heavy:")) { const [, z, k] = n.split(":").map(Number); if (z === 0) m.start(1, { title: true, heavy: k }); else m.start(1, { zone: z, heavy: k }); }
        else if (n === 0) m.start(1, { title: true }); else m.start(1, { zone: n });
        now = n; refresh();
    }
    function stop() { const m = M(); if (m) m.stop(); if (E()) E().stop(); now = null; refresh(); }
    function refresh() {
        if (!box) return;
        const m = M(), e = E(), epicNow = e && (e.playing || e.preparing), on = (m && m.playing) || Boolean(epicNow), st = m && m.mixState ? m.mixState() : {};
        if (!on) now = null;
        box.querySelectorAll(".jb-track").forEach(b => { const me = now !== null && b.dataset.n === String(now); b.classList.toggle("on", me); b.querySelector(".jb-tag").textContent = me ? (isEpic(now) && e && e.preparing ? "Preparing " + Math.round((e.progress || 0) * 100) + "%" : "Playing") : (AE.S && AE.S.zone && String(AE.S.zone.music) === b.dataset.n ? "This zone" : ""); });
        box.querySelectorAll(".jb-layer").forEach(b => { const k = b.dataset.k, lit = st[k] !== false; b.classList.toggle("off", !lit); b.querySelector(".jb-on").textContent = lit ? "On" : "Off"; });
        $("#jb-stop").disabled = !on;
        $("#jb-mixbtn").classList.toggle("on", box.classList.contains("mixing"));
    }
    function show(yes) {
        if (!box) build();
        box.hidden = !yes;
        clearInterval(timer);
        if (yes) { refresh(); timer = setInterval(refresh, 500); }
    }
    function mixer(yes) { if (!box) build(); box.classList.toggle("mixing", yes); if (box.hidden) show(true); else refresh(); }
    // testing a passage takes the music over: the epic version stops for it, as the game's tunes do
    setInterval(() => { if (AE.testing && E() && (E().playing || E().preparing)) { E().stop(); now = null; refresh(); } }, 400);
    // (22 Oct 2026) the epic versions not kept yet, made quietly a few seconds in, so the first listen is quick (not while a passage is tested)
    setTimeout(() => { if (E() && E().warm) E().warm(() => Boolean(AE.testing)); }, 5000);
    AE.jukebox = {
        toggle: () => show(!box || box.hidden),
        mixer: () => { if (!box) build(); mixer(box.hidden || !box.classList.contains("mixing")); },
        get open() { return Boolean(box && !box.hidden); }
    };
})();

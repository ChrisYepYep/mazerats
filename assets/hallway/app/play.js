/* The Hallway for walking: the editor's own page and code (publish.js makes play.html from them), with its
   tools left off and the published pictures standing in for its server. Runs before everything else on the
   page, so the editor finds its server's answers without knowing the difference. */
(function () {
    "use strict";
    window.HALLWAY_PLAY = true;
    const realFetch = window.fetch.bind(window);
    const FN = "/.netlify/functions/hallway";
    let online = false;
    const manifest = Promise.all([
        realFetch("../manifest.json", { cache: "no-cache" }).then(r => r.json()),
        realFetch(FN + "?what=live").then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([here, there]) => { online = !!(there && there.online && there.publishedAt > (here.publishedAt || "")); if (online) window.hallwayOnlineLift = there.lift || {}; return online ? there : here; });
    const json = o => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
    /* A square with nothing on it: one black pixel, so the page doesn't keep asking */
    let blank = null;
    const blankTile = () => blank || (blank = new Promise(res => { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, 1, 1); c.toBlob(res, "image/png"); }));
    window.fetch = async function (url, opts) {
        const u = typeof url === "string" ? url : url.url;
        if (!u.startsWith("/api/")) return realFetch(url, opts);
        const m = await manifest, q = new URL(u, location.href), p = q.pathname;
        if (p === "/api/map") return online ? realFetch(FN + "?what=map") : realFetch("../map.json", { cache: "no-cache" });
        if (p === "/api/names") return json({ names: [], font: {}, difficulty: {} });
        if (p === "/api/art") return json({ at: 0 });
        if (p === "/api/version") return json({ v: m.version, report: {}, tile: m.tile });
        if (p === "/api/tile") {
            /* The editor's own light, when no time of day is asked for, is daylight here */
            const name = m.tiles[(q.searchParams.get("m") || "day") + "|" + q.searchParams.get("tx") + "," + q.searchParams.get("ty")];
            if (name) return realFetch(online ? FN + "?tile=" + name : "../tiles/" + name, opts);
            return new Response(await blankTile(), { status: 200, headers: { "Content-Type": "image/png" } });
        }
        return new Response("", { status: 404 });
    };
    window.hallwayLiftSrc = (way, f) => { const file = encodeURIComponent(way).replace(/%/g, "_") + "-" + f + ".png"; return online && window.hallwayOnlineLift[file] ? FN + "?tile=" + window.hallwayOnlineLift[file] : "../lift/" + file; };
    window.hallwayTell = what => { try { if (parent !== window) parent.postMessage(typeof what === "string" ? { hallway: what } : { hallway: "progress", ...what }, location.origin); } catch (e) { /* on its own, there's nobody to tell */ } };

    /* Its music is on unless it's been turned off; the first click brings it in, as browsers require */
    try { if (localStorage.getItem("hallway-music") === null) localStorage.setItem("hallway-music", "1"); if (localStorage.getItem("hallway-time") === null) localStorage.setItem("hallway-time", "cycle"); } catch (e) { /* private mode */ }

    /* ---------- whose Habbo walks ----------
       A signed-in player whose Habbo is linked walks as it. Anyone else types their Origins name and picks the hotel, as Fallin' Furni asks, or walks as a guest.
       The art comes through the site's function: the page needs to read its pixels, and Habbo's imaging service doesn't allow that from here. */
    const GUEST = "hr-145-1061.hd-180-1014.ch-220-1204.lg-280-1200.sh-300-1314", KEY = "hallway-avatar", HOTELS = ["COM", "ES", "BR"];
    let figure = GUEST;
    const remembered = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
    window.hallwayAvatarSrc = n => {
        const m = /^s-(\d)-(std|wlk|sit)(-crr|-drk)?-(\d)$/.exec(n); if (!m) return "art/av/" + n + ".png";
        return FN + "?" + new URLSearchParams({ av: figure, d: m[1], a: m[2], h: (m[3] || "").slice(1), f: m[4] }).toString();
    };
    function wear(f) { if (f === figure) return; figure = f; if (window.hallwayAvatarChanged) window.hallwayAvatarChanged(); }
    async function lookUp(name, hotel) {
        const r = await realFetch("/.netlify/functions/room-figure?name=" + encodeURIComponent(name) + "&hotel=" + encodeURIComponent(hotel)), d = await r.json().catch(() => ({}));
        if (r.ok && d.figureString) return { name: d.name || name, hotel, figure: d.figureString };
        if (r.status === 404 || r.status === 400 || r.ok) throw new Error("No Origins Habbo by that name on " + hotel + ".");
        throw new Error("Habbo isn't answering just now. Try again in a moment.");
    }
    async function signedInHabbo() {
        try {
            const r = await realFetch("/.netlify/functions/profiles?me=1", { credentials: "same-origin", headers: { Accept: "application/json" } }); if (!r.ok) return null;
            const d = await r.json(); if (!d || !d.habbo || d.habboUnverified || !d.habbo.name) return null;
            return await lookUp(d.habbo.name, d.habbo.hotel || "COM");
        } catch (e) { return null; }
    }
    function picker(onDone) {
        if (document.getElementById("playPicker")) return;
        const back = document.createElement("div"); back.id = "playPicker"; back.className = "mr-overlay"; back.setAttribute("role", "dialog"); back.setAttribute("aria-label", "Choose your Habbo");
        const win = document.createElement("div"); win.className = "mr-window"; const tbar = document.createElement("div"); tbar.className = "mr-titlebar"; const h2 = document.createElement("h2"); h2.textContent = "Choose your Habbo";
        const x = document.createElement("button"); x.type = "button"; x.className = "mr-close"; x.setAttribute("aria-label", "Close"); const xi = document.createElement("img"); xi.src = "art/rooms/modal_topclose_x.png"; xi.alt = ""; x.appendChild(xi); tbar.append(h2, x);
        const frame = document.createElement("div"); frame.className = "mr-frame";
        const form = document.createElement("form"); form.autocomplete = "off";
        const row = document.createElement("div"); row.className = "row";
        const input = document.createElement("input"); input.id = "playName"; input.type = "text"; input.maxLength = 32; input.placeholder = "Habbo Origins Username"; input.setAttribute("aria-label", "Habbo Origins Username"); input.spellcheck = false;
        const sel = document.createElement("select"); sel.setAttribute("aria-label", "Origins hotel"); sel.title = "Origins hotel"; for (const h of HOTELS) { const o = document.createElement("option"); o.value = o.textContent = h; sel.appendChild(o); }
        const go = document.createElement("button"); go.type = "submit"; go.className = "mr-btn"; go.textContent = "Go";
        row.append(input, sel, go);
        const say = document.createElement("p"); say.className = "say"; say.setAttribute("role", "status");
        const guest = document.createElement("button"); guest.type = "button"; guest.className = "mr-btn guest"; guest.textContent = "Walk in as a guest";
        const was = remembered(); if (was) { input.value = was.name || ""; if (HOTELS.includes(was.hotel)) sel.value = was.hotel; }
        form.append(row, say, guest); frame.appendChild(form); win.append(tbar, frame); back.appendChild(win); document.body.appendChild(back); input.focus();
        const done = () => { back.remove(); if (onDone) onDone(); };
        x.addEventListener("click", done); back.addEventListener("click", e => { if (e.target === back) done(); });
        guest.addEventListener("click", () => { try { localStorage.setItem(KEY, JSON.stringify({ guest: true })); } catch (e) { /* private mode */ } wear(GUEST); done(); });
        form.addEventListener("submit", async ev => {
            ev.preventDefault(); const name = input.value.trim(); if (!name) { say.textContent = "Type your Habbo Origins username, or walk in as a guest."; return; }
            go.disabled = true; say.textContent = "Looking up...";
            try { const f = await lookUp(name, sel.value); try { localStorage.setItem(KEY, JSON.stringify(f)); } catch (e) { /* private mode */ } wear(f.figure); done(); }
            catch (e) { say.textContent = e.message; go.disabled = false; }
        });
    }
    async function chooseAvatar() {
        const mine = await signedInHabbo(); if (mine) { wear(mine.figure); return; }
        const was = remembered(); if (was && was.figure) { wear(was.figure); return; } if (was && was.guest) return;
        picker();
    }

    /* ---------- the controls: the site's own buttons, floating on the hallway ---------- */
    function controls() {
        const bar = document.createElement("div"); bar.id = "playBar";
        const add = (label, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "mr-btn"; b.textContent = label; b.title = title; b.setAttribute("aria-label", title); b.addEventListener("click", fn); bar.appendChild(b); return b; };
        const click = id => { const e = document.getElementById(id); if (e) e.click(); };
        add("Leave", "Back to the archive", () => window.hallwayTell("leave"));
        add("-", "Zoom out", () => click("zoomOut"));
        add("+", "Zoom in", () => click("zoomIn"));
        const A = () => window.HallwayAudio;
        /* What you asked for counts, not whether it's started yet: a browser only lets it start on your first click */
        const wanted = () => { try { return localStorage.getItem("hallway-music") === "1"; } catch (e) { return false; } };
        const mute = add("Mute", "Music off or on (M)", () => { const a = A(); if (wanted() && !(a && a.playing)) { try { localStorage.setItem("hallway-music", "0"); } catch (e) { /* private mode */ } paint(); return; } click("musicBtn"); paint(); });
        /* a button with a drop-down under it */
        const menus = [];
        const dropdown = (label, title, fill) => {
            const menu = document.createElement("div"); menu.className = "play-menu"; menu.hidden = true; menu.setAttribute("role", "menu"); menus.push(menu);
            const btn = add(label, title, e => { e.stopPropagation(); const show = menu.hidden; shutMenus(); if (!show) return; fill(menu, () => { shutMenus(); }); const r = btn.getBoundingClientRect(); menu.style.left = r.left + "px"; menu.style.top = (r.bottom + 4) + "px"; menu.hidden = false; btn.setAttribute("aria-expanded", "true"); });
            btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false"); menu.btn = btn; document.body.appendChild(menu); return btn;
        };
        const shutMenus = () => { for (const m of menus) { m.hidden = true; m.btn.setAttribute("aria-expanded", "false"); } };
        const row = (menu, name, on, fn) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitemradio"); b.setAttribute("aria-checked", String(on)); b.textContent = name; b.addEventListener("click", fn); menu.appendChild(b); };
        dropdown("Playlist", "Choose a track", (menu, done) => {
            menu.textContent = ""; const a = A(); if (!a) return;
            a.tracks.forEach((t, i) => row(menu, t.name, a.playing && a.current === i, () => { const rows = document.querySelectorAll("#musicList .layer-row"); if (rows[i]) rows[i].click(); done(); }));
        });
        dropdown("Time of day", "Choose the time of day", (menu, done) => {
            menu.textContent = ""; const sel = document.getElementById("timeMode"); if (!sel) return;
            for (const [value, name] of [["cycle", "Day and night cycle"], ["day", "Day"], ["dusk", "Evening"], ["night", "Night"], ["dawn", "Dawn"]]) row(menu, name, sel.value === value, () => { sel.value = value; sel.dispatchEvent(new Event("change")); done(); });
        });
        add("Avatar", "Choose your Habbo", () => picker());
        document.addEventListener("click", e => { if (!menus.some(m => m.contains(e.target))) shutMenus(); });
        const paint = () => { const on = wanted(); mute.textContent = on ? "Mute" : "Unmute"; mute.classList.toggle("is-on", !on); };
        setInterval(paint, 500); paint();
        document.body.append(bar);
    }
    /* Ready once there's something to see, or after a few seconds whatever happens */
    function whenDrawn() {
        const started = performance.now(), v = document.getElementById("view"), told = () => { const n = performance.getEntriesByType("resource").length; window.hallwayTell({ progress: Math.min(.95, n / 42) }); };
        const look = () => {
            told();
            let seen = false;
            try { if (v && v.width > 2) { const d = v.getContext("2d").getImageData(v.width >> 1, v.height >> 1, 1, 1).data; seen = d[0] + d[1] + d[2] > 0 && !(d[0] === 11 && d[1] === 12 && d[2] === 15); } } catch (e) { seen = true; }
            if (seen || performance.now() - started > 8000) window.hallwayTell("ready"); else setTimeout(look, 120);
        };
        look();
    }
    addEventListener("DOMContentLoaded", () => { controls(); whenDrawn(); chooseAvatar(); });
})();

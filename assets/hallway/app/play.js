/* The Hallway for walking: the editor's own page and code (publish.js makes play.html from them), with its
   tools left off and the published pictures standing in for its server. Runs before everything else on the
   page, so the editor finds its server's answers without knowing the difference. */
(function () {
    "use strict";
    window.HALLWAY_PLAY = true;
    /* Site data blocked or full mustn't stop a visitor walking: settings just don't stick */
    try { window.localStorage.getItem("x"); const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { try { set.call(this, k, v); } catch (e) { /* full */ } }; }
    catch (e) { const mem = new Map(); try { Object.defineProperty(window, "localStorage", { value: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } } }); } catch (e2) { /* nothing more to try */ } }
    const realFetch = window.fetch.bind(window);
    const FN = "/.netlify/functions/hallway";
    let online = false;
    /* The copy published from the Warren is the map, once there is one: a local publish carries code, and never hides it */
    const readManifest = () => Promise.all([
        realFetch("../manifest.json", { cache: "no-cache" }).then(r => r.json()).catch(() => ({ tiles: {} })),
        realFetch(FN + "?what=live").then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([here, there]) => { online = !!(there && there.online); if (online) window.hallwayOnlineLift = there.lift || {}; return online ? there : here; });
    let manifest = readManifest();
    const json = o => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
    /* A square with nothing on it: one black pixel, so the page doesn't keep asking */
    let blank = null, tilesRead = 0;
    const blankTile = () => blank || (blank = new Promise(res => { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, 1, 1); c.toBlob(res, "image/png"); }));
    window.fetch = async function (url, opts) {
        const u = typeof url === "string" ? url : url.url;
        if (!u.startsWith("/api/")) return realFetch(url, opts);
        const m = await manifest, q = new URL(u, location.href), p = q.pathname;
        if (p === "/api/map") return online ? realFetch(FN + "?what=map&v=" + encodeURIComponent(m.version || "")) : realFetch("../map.json", { cache: "no-cache" });
        if (p === "/api/names") return json({ names: [], font: {}, difficulty: {} });
        if (p === "/api/art") return json({ at: 0 });
        if (p === "/api/version") return json({ v: m.version, report: {}, tile: m.tile });
        if (p === "/api/tile") {
            /* The editor's own light, when no time of day is asked for, is daylight here */
            const plainKey = String(q.searchParams.get("m") || "day").replace("+x", "") + "|" + q.searchParams.get("tx") + "," + q.searchParams.get("ty"), wantKey = (q.searchParams.get("m") || "day") + "|" + q.searchParams.get("tx") + "," + q.searchParams.get("ty"), key = m.tiles[wantKey] ? wantKey : plainKey, name = m.tiles[key];
            if (name) {
                const r = await realFetch(online ? FN + "?tile=" + name : "../tiles/" + name, opts); if (r.status !== 404) return r;
                /* A publish has replaced it while this page was open. The newest list says what's there now. */
                if (!tilesRead || Date.now() - tilesRead > 30000) { tilesRead = Date.now(); manifest = readManifest(); }
                const m2 = await manifest, name2 = m2.tiles[key];
                if (name2 && name2 !== name) return realFetch(online ? FN + "?tile=" + name2 : "../tiles/" + name2, opts);
                return r;
            }
            return new Response(await blankTile(), { status: 200, headers: { "Content-Type": "image/png" } });
        }
        return new Response("", { status: 404 });
    };
    window.hallwayLiftSrc = (way, f) => { const file = encodeURIComponent(way).replace(/%/g, "_") + "-" + f + ".png"; return online && window.hallwayOnlineLift[file] ? FN + "?tile=" + window.hallwayOnlineLift[file] : "../lift/" + file; };
    window.hallwayTell = what => { try { if (parent !== window) parent.postMessage(typeof what === "string" ? { hallway: what } : { hallway: "progress", ...what }, location.origin); else if (what === "leave") location.href = "/home"; } catch (e) { /* on its own, there's nobody to tell */ } };

    /* Its music is on unless it's been turned off; the first click brings it in, as browsers require */
    try { if (localStorage.getItem("hallway-music") === null) localStorage.setItem("hallway-music", "1"); if (localStorage.getItem("hallway-time") === null) localStorage.setItem("hallway-time", "cycle"); } catch (e) { /* private mode */ }

    /* ---------- whose Habbo walks ----------
       A signed-in player whose Habbo is linked walks as it. Anyone else types their Origins name and picks the hotel, as Fallin' Furni asks, or walks as a guest.
       The art comes through the site's function: the page needs to read its pixels, and Habbo's imaging service doesn't allow that from here. */
    const GUEST = "hr-145-1061.hd-180-1014.ch-220-1204.lg-280-1200.sh-300-1314", KEY = "hallway-avatar", HOTELS = ["COM", "ES", "BR"];
    let figure = GUEST, linkedName = null, pickedNow = false;
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
        const opener = document.activeElement;
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
        /* under it all, what the Hallway is (9 Nov 2026, his words) */
        const note = document.createElement("p"); note.className = "note"; note.textContent = "Maze Rats Hallway is a single player experience, any Habbos you see around the hallways are non-playable characters designed for ambient game mechanics.";
        form.append(row, say, guest, note); frame.appendChild(form); win.append(tbar, frame); back.appendChild(win); document.body.appendChild(back); input.focus();
        const done = () => { document.removeEventListener("keydown", keys, true); back.remove(); if (opener && opener.focus) opener.focus(); if (onDone) onDone(); };
        const keys = e => {
            if (e.key === "Escape") { e.stopPropagation(); done(); return; }
            if (e.key !== "Tab") return;
            const all = [...win.querySelectorAll("button, input, select")].filter(q => !q.disabled); if (!all.length) return; const i = all.indexOf(document.activeElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); } else if (!e.shiftKey && (i === all.length - 1 || i < 0)) { e.preventDefault(); all[0].focus(); }
        };
        document.addEventListener("keydown", keys, true);
        const keep = o => { pickedNow = true; try { localStorage.setItem(KEY, JSON.stringify(linkedName ? { ...o, overLinked: linkedName } : o)); } catch (e) { /* private mode */ } };
        x.addEventListener("click", done); back.addEventListener("click", e => { if (e.target === back) done(); });
        guest.addEventListener("click", () => { keep({ guest: true }); wear(GUEST); done(); });
        form.addEventListener("submit", async ev => {
            ev.preventDefault(); const name = input.value.trim(); if (!name) { say.textContent = "Type your Habbo Origins username, or walk in as a guest."; return; }
            go.disabled = true; say.textContent = "Looking up...";
            try { const f = await lookUp(name, sel.value); keep(f); wear(f.figure); done(); }
            catch (e) { say.textContent = e.message; go.disabled = false; }
        });
    }
    async function chooseAvatar() {
        const mine = await signedInHabbo(), was = remembered();
        if (mine) linkedName = mine.name;
        /* Picked while that was being looked up: the pick stands, and stands next time too */
        if (pickedNow) { if (mine && was) try { localStorage.setItem(KEY, JSON.stringify({ ...was, overLinked: mine.name })); } catch (e) { /* private mode */ } return; }
        if (mine) {
            /* Your linked Habbo, unless you chose someone else while signed in as it */
            if (was && was.overLinked === mine.name) { wear(was.figure || GUEST); return; }
            wear(mine.figure); return;
        }
        if (was && was.figure) { wear(was.figure); return; } if (was && was.guest) return;
        picker();
    }

    /* ---------- the controls: the site's own buttons, floating on the hallway ---------- */
    function controls() {
        const bar = document.createElement("div"); bar.id = "playBar";
        /* In groups (8 Nov 2026, his: "it's got quite a few buttons now, and feels very messy/unorganised"): Leave, then the view (zoom and full screen),
           then the music, and everything else under Menu. Hunts and Scraps join Menu through HallwayBar.menuItem (live-hunts.js). */
        let into = bar; const group = name => { const g = document.createElement("span"); g.className = "play-group"; g.setAttribute("role", "group"); g.setAttribute("aria-label", name); bar.appendChild(g); into = g; return g; };
        const add = (label, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "mr-btn"; b.textContent = label; b.title = title; b.setAttribute("aria-label", title); b.addEventListener("click", fn); into.appendChild(b); return b; };
        const click = id => { const e = document.getElementById(id); if (e) e.click(); };
        group("Leave"); add("Leave", "Back to the archive", () => window.hallwayTell("leave"));
        group("View"); add("-", "Zoom out", () => click("zoomOut")); add("+", "Zoom in", () => click("zoomIn"));
        /* full screen: the page asks for it itself (its frame allows it), and F does the same */
        const canFull = !!(document.documentElement.requestFullscreen && document.fullscreenEnabled !== false);
        const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {}); };
        const ICON_FULL = '<svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M0 0h4v1H1v3H0zM7 0h4v4h-1V1H7zM0 7h1v3h3v1H0zM10 7h1v4H7v-1h3z"/></svg>';
        const ICON_SHRINK = '<svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 0h1v4H0V3h3zM7 0h1v3h3v1H7zM0 7h4v4H3V8H0zM7 7h4v1H8v3H7z"/></svg>';
        if (canFull) {
            const full = add("", "Full screen (F)", toggleFull); full.classList.add("play-icon");
            const paintFull = () => { const on = !!document.fullscreenElement; full.innerHTML = on ? ICON_SHRINK : ICON_FULL; full.title = on ? "Leave full screen (F)" : "Full screen (F)"; full.setAttribute("aria-label", full.title); };
            document.addEventListener("fullscreenchange", paintFull); paintFull();
            document.addEventListener("keydown", e => { if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "f") return; const at = e.target; if (at && at.closest && at.closest("input, textarea, select, [contenteditable]")) return; toggleFull(); });
        }
        group("Music");
        const A = () => window.HallwayAudio;
        /* What you asked for counts, not whether it's started yet: a browser only lets it start on your first click */
        const wanted = () => { try { return localStorage.getItem("hallway-music") === "1"; } catch (e) { return false; } };
        const mute = add("Mute", "Music off or on (M)", () => { const a = A(); if (wanted() && !(a && a.playing)) { try { localStorage.setItem("hallway-music", "0"); } catch (e) { /* private mode */ } paint(); return; } click("musicBtn"); paint(); });
        /* a button with a drop-down under it */
        const menus = [];
        const dropdown = (label, title, fill) => {
            const menu = document.createElement("div"); menu.className = "play-menu"; menu.hidden = true; menu.setAttribute("role", "menu"); menus.push(menu);
            const btn = add(label, title, e => { e.stopPropagation(); const show = menu.hidden; shutMenus(); if (!show) return; fill(menu, () => { shutMenus(); }); const r = btn.getBoundingClientRect(); menu.style.top = (r.bottom + 4) + "px"; menu.hidden = false; menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + "px"; btn.setAttribute("aria-expanded", "true"); if (!e.detail) { const first = menu.querySelector("button"); if (first) first.focus(); } });
            btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false"); menu.btn = btn; document.body.appendChild(menu);
            menu.addEventListener("keydown", e => {
                const all = [...menu.querySelectorAll("button")], i = all.indexOf(document.activeElement);
                if (e.key === "Escape") { e.stopPropagation(); shutMenus(); btn.focus(); }
                else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length].focus(); }
            });
            return btn;
        };
        const shutMenus = () => { for (const m of menus) { m.hidden = true; m.btn.setAttribute("aria-expanded", "false"); } };
        const row = (menu, name, on, fn) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitemradio"); b.setAttribute("aria-checked", String(on)); b.textContent = name; b.addEventListener("click", fn); menu.appendChild(b); };
        dropdown("Playlist", "Choose a track", (menu, done) => {
            menu.textContent = ""; const a = A(); if (!a) return;
            a.tracks.forEach((t, i) => (!a.inSeason || a.inSeason(i)) && row(menu, t.name, a.playing && a.current === i, () => { const rows = document.querySelectorAll("#musicList .layer-row"); if (rows[i]) rows[i].click(); done(); }));
        });
        /* the editor's own Camera follows setting, whose button is hidden on this page; the editor doesn't take C here, so this does */
        const following = () => { const e = document.getElementById("follow"); return !!e && e.classList.contains("on"); };
        document.addEventListener("keydown", e => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "c") return;
            const at = e.target; if (at && at.closest && at.closest("input, textarea, select, [contenteditable]")) return;
            click("follow");
        });
        const extra = [];
        window.HallwayBar = { menuItem(label, title, fn) { extra.push({ label, title, fn }); } };
        const item = (menu, name, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitem"); b.textContent = name; if (title) b.title = title; b.addEventListener("click", fn); menu.appendChild(b); };
        const head = (menu, name) => { const h = document.createElement("div"); h.className = "play-menu-head"; h.textContent = name; menu.appendChild(h); };
        const sep = menu => { const h = document.createElement("div"); h.className = "play-menu-sep"; h.setAttribute("role", "separator"); menu.appendChild(h); };
        group("More");
        dropdown("Menu", "Time of day, screensaver, your Habbo and more", (menu, done) => {
            menu.textContent = "";
            const sel = document.getElementById("timeMode");
            if (sel) { head(menu, "Time of day"); for (const [value, name] of [["cycle", "Day and night cycle"], ["day", "Day"], ["dusk", "Evening"], ["night", "Night"], ["dawn", "Dawn"]]) row(menu, name, sel.value === value, () => { sel.value = value; sel.dispatchEvent(new Event("change")); done(); }); sep(menu); }
            { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitemcheckbox"); b.setAttribute("aria-checked", String(following())); b.textContent = "Camera follows you (C)"; b.addEventListener("click", () => { click("follow"); done(); }); menu.appendChild(b); }
            /* the screensaver whenever you like, not only after a minute's quiet (8 Nov 2026, his). Any click or key ends it, as ever */
            item(menu, "Screensaver", "Start the screensaver", () => { done(); const S = window.HallwayScreensaver; if (!S || S.on) return; if (!S.start() && window.HallwayWindow) HallwayWindow.open("Screensaver", "<p>Not from down here. Head back upstairs first.</p>"); });
            item(menu, "Your Habbo", "Choose your Habbo", () => { done(); picker(); });
            if (extra.length) { sep(menu); for (const x of extra) item(menu, x.label, x.title, () => { done(); x.fn(); }); }
        });
        document.addEventListener("click", e => { if (!menus.some(m => m.contains(e.target))) shutMenus(); });
        let shownOn = null; const paint = () => { const on = wanted(); if (on === shownOn) return; shownOn = on; mute.textContent = on ? "Mute" : "Unmute"; mute.classList.toggle("is-on", !on); };
        setInterval(paint, 500); paint();
        document.body.append(bar);
    }
    /* Ready once there's something to see, or after a few seconds whatever happens */
    function whenDrawn() {
        const peek = document.createElement("canvas"), px = peek.getContext("2d", { willReadFrequently: true }); peek.width = peek.height = 1;      // read from a copy: reading the view itself can slow it for the whole visit
        const started = performance.now(), v = document.getElementById("view"), told = () => { const n = performance.getEntriesByType("resource").length; window.hallwayTell({ progress: Math.min(.95, n / 42) }); };
        const look = () => {
            told();
            let seen = false;
            try { if (v && v.width > 2) { px.drawImage(v, v.width >> 1, v.height >> 1, 1, 1, 0, 0, 1, 1); const d = px.getImageData(0, 0, 1, 1).data; seen = d[0] + d[1] + d[2] > 0 && !(d[0] === 11 && d[1] === 12 && d[2] === 15); } } catch (e) { seen = true; }
            if (seen || performance.now() - started > 8000) window.hallwayTell("ready"); else setTimeout(look, 120);
        };
        look();
    }
    addEventListener("DOMContentLoaded", () => { controls(); whenDrawn(); chooseAvatar(); });
})();

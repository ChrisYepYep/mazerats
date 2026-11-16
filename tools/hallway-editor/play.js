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
    let online = false, fellBack = false;
    /* The copy published from the Warren is the map, once there is one: a local publish carries code, and never hides it */
    const readHere = () => realFetch("../manifest.json", { cache: "no-cache" }).then(r => r.json()).catch(() => ({ tiles: {} }));
    const readManifest = () => fellBack ? readHere() : Promise.all([
        readHere(),
        /* 5 s at most: a function that hangs is treated as down, and the deployed copy is walked (15 Nov scan, server 4) */
        realFetch(FN + "?what=live", AbortSignal.timeout ? { signal: AbortSignal.timeout(5000) } : undefined).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([here, there]) => { online = !!(there && there.online); if (online) window.hallwayOnlineLift = there.lift || {}; return online ? there : here; });
    let manifest = readManifest();
    /* The Warren's copy named a map that isn't there (two publishes overlapping can lose it) or the function's down: the deployed copy
       (assets/hallway: map.json, manifest.json, tiles/, lift/) is walked instead, its own pictures with it, rather than stopping at "The map
       wouldn't load" (15 Nov scan, server 3) */
    async function onlineMap(m) {
        try { const r = await realFetch(FN + "?what=map&v=" + encodeURIComponent(m.version || ""), AbortSignal.timeout ? { signal: AbortSignal.timeout(10000) } : undefined); if (r.ok) return r; } catch (e) { /* falls back */ }
        fellBack = true; online = false; manifest = readHere();
        return realFetch("../map.json", { cache: "no-cache" });
    }
    /* One back-off for all the pictures (15 Nov scan, live M1): a failure in a row of three, and every picture waits on one shared timer,
       doubling from 2 s to a minute, with one asked for when it runs out to see if they're back. Each square and time of day had backed
       off on its own, so a tab asked about twelve times a second for as long as they failed. Waiting here, not failing, keeps the page's
       few slots full, so it stops asking for more; and when they're back the waiting ones go at once. */
    let tileBad = 0, tileWait = 0, tileHold = 0, tileProbing = false, tilesOk = 0, toldNoTiles = false, noTilesWin = null;
    const pause = (ms, signal) => new Promise((res, rej) => { if (signal && signal.aborted) { rej(new DOMException("Aborted", "AbortError")); return; } const t = setTimeout(res, Math.max(50, ms)); if (signal) signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Aborted", "AbortError")); }, { once: true }); });
    const tileFail = () => { tileBad++; if (tileBad >= 3 && performance.now() >= tileHold) { tileWait = tileWait ? Math.min(60000, tileWait * 2) : 2000; tileHold = performance.now() + tileWait; noTiles(); } };
    /* While they're failing, a request that fails waits its turn and tries again, rather than handing the failure back: the page's own
       per-square back-off then never piles up, and the pictures come in as soon as one gets through */
    async function tileNet(url, opts) {
        const signal = opts && opts.signal;
        for (;;) {
            while (tileBad >= 3 && (tileProbing || performance.now() < tileHold)) await pause(tileProbing ? 250 : tileHold - performance.now(), signal);
            const probe = tileBad >= 3; if (probe) tileProbing = true;
            let r;
            try { r = await realFetch(url, opts); }
            catch (e) { if (probe) tileProbing = false; if (e.name === "AbortError") throw e; tileFail(); if (tileBad >= 3) continue; throw e; }
            if (probe) tileProbing = false;
            if (r.ok) { tileBad = 0; tileWait = 0; tilesOk++; toldNoTiles = false; if (noTilesWin) { if (noTilesWin.back.isConnected) noTilesWin.shut(); noTilesWin = null; } return r; }      // back: the notice goes
            tileFail(); if (r.status === 404 || tileBad < 3) return r;      // a 404 is the caller's to look into (a newer publish)
        }
    }
    window.hallwayTilesHeld = () => tileBad >= 3;
    /* and the visitor is told, once each time it happens, in the Hallway's own window; on the site, if not one picture has come at all,
       the site says the hallway wouldn't open (whenDrawn) */
    function noTiles() {
        if (toldNoTiles || !tilesOk) return; toldNoTiles = true;
        setTimeout(() => { if (tileBad >= 3 && window.HallwayWindow) noTilesWin = HallwayWindow.open("The Hallway", "<p>The Hallway's pictures aren't loading just now. It keeps trying, and they'll come in as soon as they can.</p>"); }, 0);
    }
    const json = o => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
    /* A square with nothing on it: one black pixel, so the page doesn't keep asking */
    let blank = null, tilesRead = 0;
    const blankTile = () => blank || (blank = new Promise(res => { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, 1, 1); c.toBlob(res, "image/png"); }));
    window.fetch = async function (url, opts) {
        const u = typeof url === "string" ? url : url.url;
        if (!u.startsWith("/api/")) return realFetch(url, opts);
        const m = await manifest, q = new URL(u, location.href), p = q.pathname;
        if (p === "/api/map") return online ? onlineMap(m) : realFetch("../map.json", { cache: "no-cache" });
        if (p === "/api/names") return json({ names: [], font: {}, difficulty: {} });
        if (p === "/api/art") return json({ at: 0 });
        /* the Events Gallery has its own pictures, under "g:" (12 Nov 2026): the version says which map is asked for, and the tile asks follow it */
        if (p === "/api/version") { const g = !!(opts && typeof opts.body === "string" && opts.body.slice(0, 40).includes('"place":"gallery"')); return json({ v: (m.version || "") + (g ? "~g" : ""), report: {}, tile: m.tile }); }
        if (p === "/api/tile") {
            /* The editor's own light, when no time of day is asked for, is daylight here */
            const pre = String(q.searchParams.get("v") || "").endsWith("~g") ? "g:" : "";
            const plainKey = pre + String(q.searchParams.get("m") || "day").replace("+x", "") + "|" + q.searchParams.get("tx") + "," + q.searchParams.get("ty"), wantKey = pre + (q.searchParams.get("m") || "day") + "|" + q.searchParams.get("tx") + "," + q.searchParams.get("ty"), key = m.tiles[wantKey] ? wantKey : plainKey, name = m.tiles[key];
            if (name) {
                let r = await tileNet(online ? FN + "?tile=" + name : "../tiles/" + name, opts); if (r.status !== 404) return r;
                /* the deployed copy's 404 may be a cached one from before a deploy: asked once more past the cache (15 Nov scan, server 5) */
                if (!online) { r = await tileNet("../tiles/" + name, { ...(opts || {}), cache: "reload" }); if (r.status !== 404) return r; }
                /* A publish has replaced it while this page was open. The newest list says what's there now. */
                if (!tilesRead || Date.now() - tilesRead > 30000) { tilesRead = Date.now(); manifest = readManifest(); }
                const m2 = await manifest, name2 = m2.tiles[key];
                if (name2 && name2 !== name) return tileNet(online ? FN + "?tile=" + name2 : "../tiles/" + name2, opts);
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
    /* the guest: the classic standard Habbo, black hair and a long-sleeved yellow top (14 Nov 2026, his pick: the Origins Habbo Figma's look) */
    const GUEST = "hr-105-1035.hd-180-1026.ch-210-1301.lg-285-1223.sh-290-1247", KEY = "hallway-avatar", HOTELS = ["COM", "ES", "BR"];
    let figure = GUEST, linkedName = null, linkedHotel = null, pickedNow = false;
    /* the linked Habbo itself (by name, any case, and hotel), not someone else */
    const sameHabbo = o => !!o && !o.guest && !!linkedName && String(o.name || "").toLowerCase() === linkedName.toLowerCase() && (!linkedHotel || !o.hotel || o.hotel === linkedHotel);
    const remembered = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
    /* the guest is drawn from our own frames (art/guest, 14 Nov 2026): his pick, the Origins Habbo Figma. habbo.com's imaging draws its plain
       long-sleeved top (ch-210) with no body at this size, so the frames were made once with the body of the plain T-shirt (ch-3030) */
    window.hallwayAvatarSrc = n => {
        if (figure === GUEST && /^s-\d-(std|wlk|sit)(-crr|-drk)?-\d$/.test(n)) return "art/guest/" + n + ".png";
        const m = /^s-(\d)-(std|wlk|sit)(-crr|-drk)?-(\d)$/.exec(n); if (!m) return "art/av/" + n + ".png";
        return FN + "?" + new URLSearchParams({ av: figure, d: m[1], a: m[2], h: (m[3] || "").slice(1), f: m[4] }).toString();
    };
    /* nobody walks in from the entrance until the picker is done with: Go, a guest, or closing it (14 Nov 2026, his: "don't have the avatar walk in until Go has been pressed") */
    const gate = window.hallwayArrivalGate = window.hallwayArrivalGate || { held: true, go: null };
    function letIn() { if (!gate.held) return; gate.held = false; const go = gate.go; gate.go = null; if (go) setTimeout(go, 200); }
    function wear(f) { if (f === figure) return; figure = f; if (window.hallwayAvatarChanged) window.hallwayAvatarChanged(); }
    async function lookUp(name, hotel) {
        const r = await realFetch("/.netlify/functions/room-figure?name=" + encodeURIComponent(name) + "&hotel=" + encodeURIComponent(hotel)), d = await r.json().catch(() => ({}));
        if (r.ok && d.figureString) return { name: d.name || name, hotel, figure: d.figureString };
        if (r.status === 404 || r.status === 400 || r.ok) throw new Error("No Origins Habbo by that name on " + hotel + ".");
        /* the site asking you to slow down isn't Habbo being down: its own words (15 Nov scan, rooms 9) */
        if (r.status === 429) throw new Error(typeof d.error === "string" && d.error ? d.error : "Too many lookups just now - give it a minute.");
        const down = new Error(OFFLINE); down.offline = true; throw down;
    }
    /* ---------- the stored look (16 Nov 2026, his ask) ----------
       Every visit a signed-in player's linked Habbo answers, its look is kept on the server (netlify/functions/hallway-look.js), frames and
       all. Only when Habbo can't be reached is that kept look worn, and the server draws it from its copy; with no look kept (a new
       player), they're told, and walk as the guest. */
    const LOOK_FN = "/.netlify/functions/hallway-look";
    const OFFLINE = "Habbo is offline at the moment. You can still explore the Hallway as a guest, and your own Habbo will be back next time.";
    function saveLook(figure) { try { realFetch(LOOK_FN, { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ figure }) }).catch(() => {}); } catch (e) { /* nothing to lose: it's kept next visit */ } }
    async function storedLook() {
        try { const r = await realFetch(LOOK_FN, { credentials: "same-origin", headers: { Accept: "application/json" } }); if (!r.ok) return null; const d = await r.json(); return d && d.look && d.look.figure ? d.look : null; } catch (e) { return null; }
    }
    /* the linked Habbo, fresh from Habbo; when Habbo is down, the look stored last visit (`stored`), or no look at all (`offline`) */
    async function signedInHabbo() {
        let d;
        try {
            const r = await realFetch("/.netlify/functions/profiles?me=1", { credentials: "same-origin", headers: { Accept: "application/json" } }); if (!r.ok) return null;
            d = await r.json(); if (!d || !d.habbo || d.habboUnverified || !d.habbo.name) return null;
        } catch (e) { return null; }
        const name = d.habbo.name, hotel = d.habbo.hotel || "COM";
        try { const mine = await lookUp(name, hotel); saveLook(mine.figure); return mine; }
        catch (e) {
            if (!e.offline) return null;
            const look = await storedLook();
            return look ? { name: look.name || name, hotel: look.hotel || hotel, figure: look.figure, stored: true } : { name, hotel, figure: null, offline: true };
        }
    }
    function picker(onDone, pre, note) {
        if (document.getElementById("playPicker")) return;
        const opener = document.activeElement;
        const back = document.createElement("div"); back.id = "playPicker"; back.className = "mr-overlay"; back.setAttribute("role", "dialog"); back.setAttribute("aria-label", "Choose your Habbo");
        const win = document.createElement("div"); win.className = "mr-window"; const tbar = document.createElement("div"); tbar.className = "mr-titlebar"; const h2 = document.createElement("h2"); h2.textContent = "Choose your Habbo";
        const x = document.createElement("button"); x.type = "button"; x.className = "mr-close"; x.setAttribute("aria-label", "Close"); const xi = document.createElement("img"); xi.src = "art/rooms/modal_topclose_x.png"; xi.alt = ""; x.appendChild(xi); tbar.append(h2, x);
        const frame = document.createElement("div"); frame.className = "mr-frame";
        const form = document.createElement("form"); form.autocomplete = "off";
        const row = document.createElement("div"); row.className = "row";
        const input = document.createElement("input"); input.id = "playName"; input.type = "text"; input.maxLength = 32; input.placeholder = "Habbo Origins Username"; if (matchMedia("(pointer: coarse)").matches) input.placeholder = "Origins username"; /* fits a phone's box (10 Nov scan, live 16) */ input.setAttribute("aria-label", "Habbo Origins Username"); input.spellcheck = false;
        const sel = document.createElement("select"); sel.setAttribute("aria-label", "Origins hotel"); sel.title = "Origins hotel"; for (const h of HOTELS) { const o = document.createElement("option"); o.value = o.textContent = h; sel.appendChild(o); }
        const go = document.createElement("button"); go.type = "submit"; go.className = "mr-btn"; go.textContent = "Go";
        row.append(input, sel, go);
        const say = document.createElement("p"); say.className = "say"; say.setAttribute("role", "status");
        const guest = document.createElement("button"); guest.type = "button"; guest.className = "mr-btn guest"; guest.textContent = "Walk in as a guest";
        const was = pre || remembered(); if (was) { input.value = was.name || ""; if (HOTELS.includes(was.hotel)) sel.value = was.hotel; }
        /* signed in as one Habbo, walking as another: both said (15 Nov scan, live L4: it read "Signed in as" the other one) */
        if (pre) say.textContent = linkedName && !sameHabbo(pre) ? "Signed in as " + linkedName + ". Walking as " + pre.name + "." : "Signed in as " + pre.name + ". Go, or pick someone else.";
        if (note) say.textContent = note;
        /* under it all, set apart below a rule and quieter than the picker: what the Hallway is, what the username is for, and the fan-site line (9 Nov 2026, his words) */
        const notes = document.createElement("div"); notes.className = "notes";
        for (const [t, cls] of [["Maze Rats Hallway is a single player experience, any Habbos you see around the hallways are non-playable characters designed for ambient game mechanics.", ""], ["Your Habbo Origins username is only used to show your Habbo's look, and is only remembered on this device.", ""], ["Maze Rats is independent and not affiliated with, sponsored, supported, or endorsed by Sulake Oy or its affiliates. Any Habbo trademarks or intellectual property used here are done so in accordance with the Habbo Fan Site Policy.", "legal"]]) { const p = document.createElement("p"); p.textContent = t; if (cls) p.className = cls; notes.appendChild(p); }
        /* the Hallway's mark on a wooden card of its own, above the window (9 Nov 2026, his: "in that wooden card thing you had it on in your mock ups") */
        const card = document.createElement("div"); card.className = "hw-logo-card";
        /* the whole card as one picture (his pick, 9 Nov 2026: dark oak, brass borders, the round rat crest, raised brass letters) */
        const mark = document.createElement("img"); mark.src = "/assets/img/hallway-plaque-420.png"; mark.srcset = "/assets/img/hallway-plaque-420.png 1x, /assets/img/hallway-plaque-420@2x.png 2x"; mark.width = 420; mark.height = 248; mark.alt = "Maze Rats Hallway"; mark.addEventListener("error", () => card.remove()); card.appendChild(mark);
        form.append(row, say, guest, notes); frame.appendChild(form); win.append(tbar, frame); back.append(card, win); document.body.appendChild(back); input.focus();
        const done = () => { document.removeEventListener("keydown", keys, true); back.remove(); if (opener && opener.focus) opener.focus(); letIn(); if (onDone) onDone(); };
        const keys = e => {
            if (e.key === "Escape") { e.stopPropagation(); done(); return; }
            if (e.key !== "Tab") return;
            const all = [...win.querySelectorAll("button, input, select")].filter(q => !q.disabled); if (!all.length) return; const i = all.indexOf(document.activeElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); } else if (!e.shiftKey && (i === all.length - 1 || i < 0)) { e.preventDefault(); all[0].focus(); }
        };
        document.addEventListener("keydown", keys, true);
        /* "chosen over the linked Habbo" only when it is someone else: Go on your own linked Habbo had pinned that day's look over the fresh one
           from Habbo on every later visit (15 Nov scan, live L5) */
        const keep = o => { pickedNow = true; try { localStorage.setItem(KEY, JSON.stringify(linkedName && !sameHabbo(o) ? { ...o, overLinked: linkedName } : o)); } catch (e) { /* private mode */ } };
        x.addEventListener("click", done); back.addEventListener("click", e => { if (e.target === back) done(); });
        guest.addEventListener("click", () => { keep({ guest: true }); wear(GUEST); done(); });
        form.addEventListener("submit", async ev => {
            ev.preventDefault(); const name = input.value.trim(); if (!name) { say.textContent = "Type your Habbo Origins username, or walk in as a guest."; return; }
            go.disabled = true; say.textContent = "Looking up...";
            /* an answer arriving after the picker was shut, or a guest chosen, changes nothing (15 Nov scan, rooms 10) */
            try { const f = await lookUp(name, sel.value); if (!back.isConnected) return; keep(f); wear(f.figure); done(); }
            catch (e) {
                if (!back.isConnected) return;
                /* Habbo down, and this is the look already in hand (the stored one, or the one this device remembers): Go walks as it */
                const had = was && was.figure && String(was.name || "").toLowerCase() === name.toLowerCase() && (!was.hotel || was.hotel === sel.value) ? was : null;
                if (e.offline && had) { keep({ name: had.name, hotel: had.hotel || sel.value, figure: had.figure }); wear(had.figure); done(); return; }
                say.textContent = e.message; go.disabled = false;
            }
        });
    }
    async function chooseAvatar() {
        /* Habbo's lookup gets 4 seconds; after that nobody waits on it with an empty hallway: the visitor carries on as if signed out (the
           remembered Habbo, or the picker), and the linked Habbo is filled in when it does answer (14 Nov scan) */
        const asking = signedInHabbo(), SLOW = {}, first = await Promise.race([asking, new Promise(r => setTimeout(() => r(SLOW), 4000))]);
        if (first === SLOW) { lateAvatar(asking); return; }
        const mine = first, was = remembered();
        if (mine) { linkedName = mine.name; linkedHotel = mine.hotel || null; }
        /* Picked while that was being looked up: the pick stands, and stands next time too (marked as chosen over the linked one only if it's someone else) */
        if (pickedNow) { if (mine && was && !sameHabbo(was)) try { localStorage.setItem(KEY, JSON.stringify({ ...was, overLinked: mine.name })); } catch (e) { /* private mode */ } if (!document.getElementById("playPicker")) letIn(); return; }
        if (mine) {
            /* Your linked Habbo, unless you chose someone else while signed in as it */
            /* and the splash still shows, your Habbo filled in, so you see what the Hallway is before walking in (9 Nov 2026, his) */
            if (was && was.overLinked === mine.name && !sameHabbo(was)) { wear(was.figure || GUEST); picker(null, was.guest ? null : was); return; }
            /* Habbo down and no look stored yet: the guest, and they're told why */
            if (!mine.figure) {
                if (was && was.figure && sameHabbo(was)) { wear(was.figure); picker(null, { ...mine, figure: was.figure }); return; }      // this device remembers it
                wear(GUEST); picker(null, mine, OFFLINE); return;
            }
            wear(mine.figure); picker(null, mine); return;
        }
        if (was && was.figure) { wear(was.figure); letIn(); return; } if (was && was.guest) { letIn(); return; }
        picker();
    }
    async function lateAvatar(asking) {
        const was = remembered();
        if (!pickedNow) { if (was && was.figure) { wear(was.figure); letIn(); } else if (was && was.guest) letIn(); else picker(); }
        const mine = await asking; if (!mine) return;
        linkedName = mine.name; linkedHotel = mine.hotel || null;
        if (pickedNow || (was && was.overLinked === mine.name && !sameHabbo(was))) return;      // chosen meanwhile, or chosen over this Habbo before: that stands
        const box = document.getElementById("playPicker");
        if (box) {
            const input = box.querySelector("#playName"), sel = box.querySelector("select"), say = box.querySelector(".say");
            if (input && (!input.value.trim() || (was && input.value === was.name))) { input.value = mine.name; if (sel && HOTELS.includes(mine.hotel)) sel.value = mine.hotel; if (say) say.textContent = mine.figure ? "Signed in as " + mine.name + ". Go, or pick someone else." : OFFLINE; }
            else return;      // typing someone else: leave it be
        }
        if (mine.figure) wear(mine.figure);
    }

    /* ---------- the controls: the site's own buttons, floating on the hallway ---------- */
    function controls() {
        const bar = document.createElement("div"); bar.id = "playBar"; let fullSoon = 0;
        /* On a phone the card is a bar along the bottom, in reach of a thumb: Leave, the camera, the music and Menu; zooming is by pinching
           (10 Nov 2026, his pick of the mock-ups: "menu option D", the zoom buttons swapped for a camera toggle). play.css lays it out. */
        const phone = matchMedia("(max-width: 700px), (max-height: 520px)");
        /* In groups (8 Nov 2026, his: "it's got quite a few buttons now, and feels very messy/unorganised"): Leave, then the view (zoom and full screen),
           then the music, and everything else under Menu. Hunts and Scraps join Menu through HallwayBar.menuItem (live-hunts.js). */
        /* A wooden card in the top left, the Hallway's mark at its head and a labelled row for each kind of thing (9 Nov 2026, his: "the menu buttons in
           a wooden card in the top left, with the logo text at the top of it ... clear, and maze rats hallway themed") */
        bar.className = "hw-card";
        { const mark = document.createElement("img"); mark.className = "hw-card-logo"; mark.src = "/assets/img/hallway-logo-176.png"; mark.srcset = "/assets/img/hallway-logo-176.png 1x, /assets/img/hallway-logo-176@2x.png 2x"; mark.width = 176; mark.height = 103; mark.alt = "Maze Rats Hallway"; mark.addEventListener("error", () => mark.remove()); bar.appendChild(mark); }
        let into = bar; const group = (name, label) => { const r = document.createElement("div"); r.className = "play-row"; r.dataset.row = name; if (label) { const l = document.createElement("span"); l.className = "play-label"; l.textContent = label; r.appendChild(l); } const g = document.createElement("span"); g.className = "play-group"; g.setAttribute("role", "group"); g.setAttribute("aria-label", name); r.appendChild(g); bar.appendChild(r); into = g; return g; };
        const add = (label, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "mr-btn"; b.textContent = label; b.title = title; if (!label || label.length < 2) b.setAttribute("aria-label", title); /* the words on it are its name; only icon buttons need one (10 Nov scan, live 14) */ b.addEventListener("click", fn); into.appendChild(b); return b; };
        const click = id => { const e = document.getElementById(id); if (e) e.click(); };
        group("Leave"); const leaveBtn = add("Leave the Hallway", "Back to the archive", () => window.hallwayTell("leave")); leaveBtn.classList.add("play-wide");
        group("View", "View"); add("-", "Zoom out", () => click("zoomOut")); add("+", "Zoom in", () => click("zoomIn"));
        /* full screen: the page asks for it itself (its frame allows it), and F does the same */
        const canFull = !!(document.documentElement.requestFullscreen && document.fullscreenEnabled !== false);
        const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {}); };
        const ICON_FULL = '<svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M0 0h4v1H1v3H0zM7 0h4v4h-1V1H7zM0 7h1v3h3v1H0zM10 7h1v4H7v-1h3z"/></svg>';
        const ICON_SHRINK = '<svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 0h1v4H0V3h3zM7 0h1v3h3v1H7zM0 7h4v4H3V8H0zM7 7h4v1H8v3H7z"/></svg>';
        if (canFull) {
            const full = add("", "Full screen (F)", toggleFull); full.classList.add("play-icon");
            const paintFull = () => { const on = !!document.fullscreenElement; full.innerHTML = on ? ICON_SHRINK : ICON_FULL; full.title = on ? "Leave full screen (F)" : "Full screen (F)"; full.setAttribute("aria-label", full.title); };
            document.addEventListener("fullscreenchange", paintFull); paintFull();
            document.addEventListener("keydown", e => { if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "f") return; const at = e.target; if (at && at.closest && at.closest("input, textarea, select, [contenteditable]")) return;
                /* a moment's grace, so typing the "fast" cheat doesn't go full screen on its F (cheatTyping cancels it) */
                clearTimeout(fullSoon); fullSoon = setTimeout(toggleFull, 350); });
        }
        group("Music", "Music");
        const A = () => window.HallwayAudio;
        /* What you asked for counts, not whether it's started yet: a browser only lets it start on your first click */
        const wanted = () => { try { return localStorage.getItem("hallway-music") === "1"; } catch (e) { return false; } };
        const mute = add("Mute", "Music off or on (M)", () => { const a = A(); if (wanted() && !(a && a.playing)) { try { localStorage.setItem("hallway-music", "0"); } catch (e) { /* private mode */ } paint(); return; } click("musicBtn"); paint(); });
        /* a button with a drop-down under it */
        const menus = [];
        const dropdown = (label, title, fill) => {
            const menu = document.createElement("div"); menu.className = "play-menu"; menu.hidden = true; menu.setAttribute("role", "menu"); menus.push(menu);
            /* opens as a drawer from under the card's foot, the width of the card inside its border (9 Nov 2026, his: "a card that pops out from under the
               bottom of the menu card", as the archive's own Menu tab slides out from its window) */
            const btn = add(label, title, e => { e.stopPropagation(); const show = menu.hidden || !menu.classList.contains("is-open"); shutMenus(); if (!show) return; fill(menu, () => { shutMenus(); });
                const r = bar.getBoundingClientRect();
                if (phone.matches) { menu.classList.add("is-up"); menu.style.left = "8px"; menu.style.width = (innerWidth - 16) + "px"; menu.style.top = "auto"; menu.style.bottom = (innerHeight - r.top - 2) + "px"; menu.style.maxHeight = Math.max(120, r.top - 16) + "px"; }      // up from the bar
                else { menu.classList.remove("is-up"); menu.style.bottom = ""; menu.style.left = (r.left + 12) + "px"; menu.style.top = (r.bottom - 16) + "px"; menu.style.width = (r.width - 24) + "px"; menu.style.maxHeight = Math.max(120, innerHeight - r.bottom - 10) + "px"; }
                clearTimeout(menu.shutting); menu.hidden = false; void menu.offsetWidth; menu.classList.add("is-open"); btn.setAttribute("aria-expanded", "true"); if (!e.detail) { const first = menu.querySelector("button"); if (first) first.focus(); } });
            btn.classList.add("play-drop");
            btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false"); menu.btn = btn; document.body.appendChild(menu);
            menu.addEventListener("keydown", e => {
                const all = [...menu.querySelectorAll("button")], i = all.indexOf(document.activeElement);
                if (e.key === "Escape") { e.stopPropagation(); shutMenus(); btn.focus(); }
                else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length].focus(); }
            });
            return btn;
        };
        const shutMenus = () => { for (const m of menus) { if (m.hidden) continue; m.classList.remove("is-open"); m.btn.setAttribute("aria-expanded", "false"); clearTimeout(m.shutting); m.shutting = setTimeout(() => { if (!m.classList.contains("is-open")) m.hidden = true; }, 220); } };
        const row = (menu, name, on, fn) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitemradio"); b.setAttribute("aria-checked", String(on)); b.textContent = name; b.addEventListener("click", fn); menu.appendChild(b); };
        dropdown("Playlist", "Choose a track", (menu, done) => {
            menu.textContent = ""; const a = A(); if (!a) return; head(menu, "Playlist");
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
        const head = (menu, name) => { const h = document.createElement("div"); h.className = "play-menu-head"; h.setAttribute("role", "presentation"); h.textContent = name; menu.appendChild(h); };
        const sep = menu => { const h = document.createElement("div"); h.className = "play-menu-sep"; h.setAttribute("role", "separator"); menu.appendChild(h); };
        /* the camera following you, in the card itself, not inside Menu (9 Nov 2026, his) */
        group("Camera", "Camera");
        /* two words, the one in use lit (9 Nov 2026, his: "Follow" and "Manual"); C still swaps them */
        const camFollow = add("Follow", "The camera follows you (C)", () => { if (!following()) click("follow"); paintCam(); }), camManual = add("Manual", "You move the camera yourself (C)", () => { if (following()) click("follow"); paintCam(); });
        /* on a phone one button says which it is and swaps it */
        const camToggle = add("Follow", "Camera: follows you, or you move it yourself (C)", () => { click("follow"); paintCam(); }); camToggle.classList.add("play-camtoggle");
        const paintCam = () => { const on = following(); for (const [b, lit] of [[camFollow, on], [camManual, !on]]) { b.setAttribute("aria-pressed", String(lit)); b.classList.toggle("is-on", lit); } camToggle.textContent = on ? "Follow" : "Manual"; camToggle.title = on ? "The camera follows you: tap to move it yourself" : "You move the camera: tap to have it follow you"; };
        paintCam(); setInterval(paintCam, 500);
        group("More");
        dropdown("Menu", "Time of day, screensaver, your Habbo and more", (menu, done) => {
            menu.textContent = "";
            const sel = document.getElementById("timeMode");
            if (sel) { head(menu, "Time of day"); for (const [value, name] of [["cycle", "Day and night cycle"], ["day", "Day"], ["dusk", "Evening"], ["night", "Night"], ["dawn", "Dawn"]]) row(menu, name, sel.value === value, () => { sel.value = value; sel.dispatchEvent(new Event("change")); done(); }); sep(menu); }
            /* the screensaver whenever you like, not only after a minute's quiet (8 Nov 2026, his). Any click or key ends it, as ever */
            item(menu, "Screensaver", "Start the screensaver", () => { done(); const S = window.HallwayScreensaver; if (!S || S.on) return;
                /* not over the lift's plate, which stayed on top of it (15 Nov scan, live L3) */
                const lift = document.getElementById("liftPanel"); if (lift && !lift.hidden) { if (window.HallwayWindow) HallwayWindow.open("Screensaver", "<p>Not just now. Step out of the lift first.</p>"); return; }
                /* not over a maze room: it bounced round the hidden hallway and covered the room (15 Nov scan, rooms 5) */
                if (window.__hallway && window.__hallway.roomSession) { if (window.HallwayWindow) HallwayWindow.open("Screensaver", "<p>Not while you're in a room.</p>"); return; }
                if (!S.start() && window.HallwayWindow) HallwayWindow.open("Screensaver", "<p>Not from down here. Head back upstairs first.</p>"); });
            item(menu, "Your Habbo", "Choose your Habbo", () => { done(); picker(); });
            if (extra.length) { sep(menu); for (const x of extra) item(menu, x.label, x.title, () => { done(); x.fn(); }); }
        });
        /* the bar's own words: "Leave" for "Leave the Hallway", and any drawer open shuts when it turns from card to bar or back */
        const phoneWords = () => { leaveBtn.textContent = phone.matches ? "Leave" : "Leave the Hallway"; bar.classList.toggle("is-phone", phone.matches); };
        phoneWords(); phone.addEventListener("change", () => { phoneWords(); shutMenus(); });
        document.addEventListener("click", e => { if (!menus.some(m => m.contains(e.target))) shutMenus(); });
        /* Escape shuts a drawer however it was opened, and gives the focus back to its button (10 Nov scan, live 10) */
        document.addEventListener("keydown", e => { if (e.key !== "Escape") return; const open = menus.find(m => m.classList.contains("is-open")); if (!open) return; e.preventDefault(); shutMenus(); if (open.btn) open.btn.focus(); });
        let shownOn = null; const paint = () => { const on = wanted(); if (on === shownOn) return; shownOn = on; mute.textContent = on ? "Mute" : "Unmute"; mute.classList.toggle("is-on", !on); };
        setInterval(paint, 500); paint();
        document.body.prepend(bar);      /* first in the Tab order, before the map (10 Nov scan, live 21) */
        /* Cheats, typed anywhere on the map (9 Nov 2026, his): "fast" walks five times quicker, "travel" makes a click jump you to the tile. Typing the
           word again turns it off. Nothing shows but a plate to the right of the card, one line per cheat, in the card's own button look. */
        const CHEATS = { fast: ["Fast Walking", on => { cheatApi().speed = on ? 5 : 1; }], travel: ["Fast Travel", on => { cheatApi().travel = on; }] };
        const cheatApi = () => (window.HallwayLive && HallwayLive.cheats ? HallwayLive.cheats() : {});
        const cheatBox = document.createElement("div"); cheatBox.id = "playCheats"; cheatBox.setAttribute("aria-live", "polite"); document.body.append(cheatBox);
        const cheatOn = {}; let typed = "";
        const paintCheats = () => { cheatBox.textContent = ""; for (const w in CHEATS) if (cheatOn[w]) { const s = document.createElement("button"); s.type = "button"; s.className = "mr-btn"; s.textContent = "Cheat Activated: " + CHEATS[w][0]; s.title = "Click to turn this cheat off";
                /* clicking the plate turns the cheat off (9 Nov 2026, his) */
                s.addEventListener("click", e => { e.stopPropagation(); cheatOn[w] = false; CHEATS[w][1](false); typed = ""; paintCheats(); }); cheatBox.appendChild(s); }
            const r = bar.getBoundingClientRect(); cheatBox.style.left = (phone.matches ? 10 : Math.round(r.right + 8)) + "px"; cheatBox.hidden = !cheatBox.childElementCount; };
        addEventListener("resize", () => { if (!cheatBox.hidden) paintCheats(); }); cheatBox.hidden = true;
        document.addEventListener("keydown", e => {
            if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
            const at = e.target; if (at && at.closest && at.closest("input, textarea, select, [contenteditable]")) return;
            typed = (typed + e.key.toLowerCase()).slice(-12);
            /* still on the way to a cheat word past its first letter: the F of "fast" mustn't go full screen */
            if (Object.keys(CHEATS).some(w => { for (let n = 2; n <= w.length; n++) if (typed.endsWith(w.slice(0, n))) return true; return false; })) clearTimeout(fullSoon);
            for (const w in CHEATS) if (typed.endsWith(w)) { typed = ""; cheatOn[w] = !cheatOn[w]; CHEATS[w][1](cheatOn[w]); paintCheats(); }
        });
    }
    /* Ready once there's something to see, or after a few seconds whatever happens */
    function whenDrawn() {
        const peek = document.createElement("canvas"), px = peek.getContext("2d", { willReadFrequently: true }); peek.width = peek.height = 1;      // read from a copy: reading the view itself can slow it for the whole visit
        const started = performance.now(), v = document.getElementById("view"), told = () => { const n = performance.getEntriesByType("resource").length; window.hallwayTell({ progress: Math.min(.95, n / 42) }); };
        const look = () => {
            told();
            let seen = false;
            try { if (v && v.width > 2) { px.drawImage(v, v.width >> 1, v.height >> 1, 1, 1, 0, 0, 1, 1); const d = px.getImageData(0, 0, 1, 1).data; seen = d[0] + d[1] + d[2] > 0 && !(d[0] === 11 && d[1] === 12 && d[2] === 15); } } catch (e) { seen = true; }
            /* after 8 s it's ready whatever, unless the pictures are failing and not one has come: then up to 15 s, and if still none the
               site says the hallway wouldn't open; on its own page the Hallway's window says so (15 Nov scan, live M1: a black map, no word) */
            const late = performance.now() - started, failing = !tilesOk && tileBad > 0;
            if (seen || (late > 8000 && !failing)) window.hallwayTell("ready");
            else if (late > 15000) { if (parent !== window) window.hallwayTell("failed"); else { toldNoTiles = true; if (window.HallwayWindow) noTilesWin = HallwayWindow.open("The Hallway", "<p>The Hallway's pictures aren't loading just now. It keeps trying, and they'll come in as soon as they can.</p>"); } }
            else setTimeout(look, 120);
        };
        look();
    }
    addEventListener("DOMContentLoaded", () => { controls(); whenDrawn(); chooseAvatar(); });
})();

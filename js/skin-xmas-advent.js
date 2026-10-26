/* THE ADVENT CALENDAR (26 Oct 2026, the owner's: "Build the advent
   calender. For now, behind each door have a christmas furni or christmas
   related rare - only use furni from habbo origins of course."; "make the
   doors feel more consistent in design including the numbers, making sure
   all the numbers are cleanly aligned. Door opening will be tracked per
   account, and the calendar will only be openable by users who are signed
   in with discord."; and, after three illustrated scenes, "I'd prefer our
   advent calendar to be styled closer to the rest of the maze rats
   website, so in a window styled like the rest of the website" — mock-up
   A, picked from four: "the door grid with the selected door's row
   underneath").

   A SITE WINDOW, LIKE EVERY OTHER: the same .modal frame, title bar, close
   X and list row the archive's windows use, so it wears whatever palette
   the page does and the Christmas skin's snow lands on it as on any other
   window. Inside: a line saying what it is, the 24 doors as a grid of
   tiles in a shuffled order (as a printed calendar's numbers are), and
   under them one archive row for the door in hand.

   THE DOORS ARE ALL ONE DOOR: the same tile, the number in the site's
   pixel face in the middle of it. Their state is the only difference: a
   door whose day has not come is dim; one whose day has come is lit; today's
   is ringed in gold and breathes; an opened one has swung open (its face
   turns away on its left edge) onto the furni inside, its number kept small
   in the corner.

   SIGNED IN WITH DISCORD, AND KEPT WITH THE ACCOUNT. The "Advent" button
   asks a signed-out visitor to sign in (and brings them back to the
   calendar, #advent) instead of opening it. The doors a player has opened
   are kept by netlify/functions/advent.js, which also holds each door to
   its day. An admin's preview (the Warren's "Pretend it's") opens doors
   for that page only and never writes them. What is counted for the
   Warren's Activity page: "advent-open" (signed in or not) and
   "advent-door" (which door), never who.

   Worn with the Christmas skin: js/skin-wear.js loads this beside
   js/skin-xmas.js (EXTRAS) and calls start() and stop(). The button shows
   through December; SiteSkins["xmas-advent"].open() opens it in any month,
   for trying it out. The window is built on opening and thrown away on
   closing. */
(function () {
    "use strict";
    if (window.SiteSkins && window.SiteSkins["xmas-advent"]) return;

    const reduceMq = matchMedia("(prefers-reduced-motion: reduce)");
    const ENDPOINT = "/.netlify/functions/advent";
    const PICTURES = "https://api.furniindex.com/furni/";
    const SEEN_KEY = "mazerats_advent_seen";          // { who, year, opened }: for the button's flame only
    const PREVIEW_KEY = "mazerats_advent_preview";    // sessionStorage: a preview's opened doors

    /* Behind the doors, day by day: small things first, the rares saved for
       the last week, and Lappland Greetings on Christmas Eve. Every one a
       released Origins furni (a FurniIndex page and a release date in the
       archive's catalogue). c is the classname, v the view (rotation and
       state: the lit ones are lit), and n, m and d the name, motto and
       release date as FurniIndex has them. */
    const DOORS = [
        { c: "poster_30", v: "r0/s0", n: "Mistletoe", m: "Pucker up", d: "2024-12-03" },
        { c: "reinduck", v: "r2/s0", n: "Reindeer Duck", m: "Quacks like Rudolph, waddles like a pro", d: "2025-12-19" },
        { c: "poster_5016", v: "r0/s0", n: "Stocking", m: "Hung yours up yet?", d: "2024-12-13" },
        { c: "xmas_drinks", v: "r0/s0", n: "Festive Fizzy Stack", m: "The cans insisted on joining the party too, hats and all.", d: "2025-12-12" },
        { c: "poster_27", v: "r0/s0", n: "Holly Garland", m: "Deck the halls!", d: "2024-12-03" },
        // St Nicholas' Day: a present.
        { c: "wrapped_duck", v: "r2/s0", n: "Funky Gift", m: "What's inside?", d: "2024-12-20" },
        { c: "small_xmastree", v: "r0/s0", n: "Small Christmas Tree", m: "Small tree, big festive spirit", d: "2025-12-19" },
        { c: "poster_5043", v: "r0/s0", n: "Snowy Garland", m: "Wrap your room in winter cheer.", d: "2025-12-19" },
        { c: "xmas_plant_small_cactus", v: "r0/s0", n: "Jolly Cactus", m: "Prickly, proud, and dressed for the season with its tiny cap.", d: "2025-12-12" },
        { c: "np_snowegg", v: "r2/s0", n: "Snow Negg", m: "Powdery white and perfectly chilled, straight from a winter wonderland.", d: "2025-12-24" },
        { c: "snowy_bonsai", v: "r0/s1", n: "Snowy Bonsai Tree", m: "Trimmed, twinkling, and winter-ready", d: "2025-12-19" },
        { c: "poster_22", v: "r0/s0", n: "Winter Wonderland", m: "A chilly snowy scene", d: "2024-12-03" },
        { c: "samovar", v: "r2/s0", n: "Russian Samovar", m: "Click for a refreshing cuppa", d: "2024-12-18" },
        { c: "duck_globe", v: "r0/s0", n: "Rubber Duck Globe", m: "It's all white..", d: "2024-12-27" },
        { c: "poster_25", v: "r0/s0", n: "Reindeer Poster", m: "Doing a hard night's work", d: "2024-12-03" },
        { c: "tree2", v: "r0/s0", n: "Old Christmas Tree", m: "Old Christmas Tree", d: "2024-12-03" },
        { c: "snowy_pineapple", v: "r0/s1", n: "Snowy Pineapple Plant", m: "Loving glances, now with fairy lights", d: "2025-12-19" },
        { c: "xmas_shelves_norja", v: "r0/s0", n: "Merry Shelf", m: "Not wanting to feel left out, the shelf grabbed a hat and joined the celebration.", d: "2025-12-12" },
        { c: "door_gingerbread", v: "r2/s0", n: "Santa's Portaloo", m: "Sweet relief in a crisp winter breeze.", d: "2025-12-12" },
        { c: "rare_dragonlamp*5", v: "r2/s1", n: "Elf Green Dragon Lamp", m: "Roast your chestnuts here!", d: "2025-06-24", rare: true },
        { c: "tree3", v: "r0/s0", n: "Christmas Tree 1", m: "Any presents under it yet?", d: "2024-12-03" },
        { c: "rare_snowrug", v: "r0/s0", n: "Snow Rug", m: "Chilled Elegance", d: "2024-12-03", rare: true },
        { c: "rare_globe", v: "r0/s0", n: "Snow Globe", m: "It's all white..", d: "2024-12-10", rare: true },
        { c: "rare_xmas_screen", v: "r2/s0", n: "Lappland Greetings", m: "Ho Ho Ho!", d: "2024-12-17", rare: true }
    ];
    const pictureOf = (door) => PICTURES + encodeURIComponent(door.c) + "/large/" + door.v + "/noshadow";
    const iconOf = (door) => PICTURES + encodeURIComponent(door.c) + "/icon";

    // ---------- seeded randomness (as js/skin-xmas.js) ----------
    function prng(seed) {
        return function () {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    /* The order the doors stand in: shuffled once, the same for everyone, as
       the numbers on a printed calendar are; 24 low in the middle. */
    const ORDER = (() => {
        const r = prng(1224), a = [];
        for (let i = 1; i <= 23; i++) a.push(i);
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        a.splice(20, 0, 24);
        return a;
    })();

    // ---------- the date ----------
    const today = () => (window.SkinWear && SkinWear.today ? SkinWear.today() : new Date());
    const adventDay = (d) => (d.getMonth() === 11 ? d.getDate() : 0);
    const isPreview = () => !!(window.SkinWear && SkinWear.source && SkinWear.source() === "preview");

    // ---------- storage, for the little that is kept in the browser ----------
    const get = (st, k) => { try { return st.getItem(k); } catch (e) { return null; } };
    const put = (st, k, v) => { try { st.setItem(k, v); } catch (e) { /* private mode */ } };
    const whoNow = () => (window.Account && Account.current ? String(Account.current.publicId || "me") : "");
    function seenOpened() {
        try {
            const s = JSON.parse(get(localStorage, SEEN_KEY) || "null");
            return s && s.who === whoNow() && s.year === today().getFullYear() && Array.isArray(s.opened) ? new Set(s.opened) : null;
        } catch (e) { return null; }
    }
    const rememberSeen = (opened) => put(localStorage, SEEN_KEY, JSON.stringify({ who: whoNow(), year: today().getFullYear(), opened: [...opened] }));
    const track = (name, label) => { try { if (window.Track) Track.event(name, label); } catch (e) { /* counting is never worth a fault */ } };

    // =====================================================================
    // THE WINDOW
    // =====================================================================
    let on = false, ui = null, btn = null, lastFocus = null, dayTimer = 0, accountOff = null;

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const releasedText = (d) => { const m = /^(\d{4})-(\d{2})/.exec(d || ""); return m ? MONTHS[Number(m[2]) - 1] + " " + m[1] : ""; };

    function stateOf(n) {
        if (ui.opened.has(n)) return "open";
        if (n > ui.day) return "locked";
        return n === Math.min(ui.day, 24) ? "today" : "ready";
    }

    function build() {
        const overlay = el("div", "modal-overlay open xa-overlay");
        const win = el("div", "modal xa-window");
        win.setAttribute("role", "dialog"); win.setAttribute("aria-modal", "true"); win.setAttribute("aria-labelledby", "xa-title"); win.tabIndex = -1;
        const bar = el("div", "chrome-titlebar");
        const title = el("h2", null, "Advent Calendar"); title.id = "xa-title";
        const close = el("button", "chrome-close"); close.type = "button"; close.setAttribute("aria-label", "Close");
        const x = el("img"); x.src = "/assets/img/modal_topclose_x.png"; x.alt = ""; x.setAttribute("aria-hidden", "true");
        close.appendChild(x);
        bar.append(title, close);
        const frame = el("div", "chrome-frame xa-frame");
        const intro = el("p", "chrome-intro xa-intro", "A festive Origins furni behind every door, one a day until Christmas Eve.");
        const grid = el("div", "xa-grid"); grid.setAttribute("role", "group"); grid.setAttribute("aria-label", "The doors");
        const detail = el("div", "chrome-list xa-detail"); detail.setAttribute("aria-live", "polite");
        frame.append(intro, grid, detail);
        win.append(bar, frame);
        overlay.appendChild(win);
        ui = {
            overlay, win, close, grid, detail,
            day: adventDay(today()),
            opened: new Set(), loaded: false, failed: false, preview: isPreview(),
            tiles: new Map(), busy: new Set(), selected: null
        };
        ORDER.forEach((n) => {
            const t = el("button", "xa-tile");
            t.type = "button"; t.dataset.day = n;
            const inside = el("span", "xa-tile-in");                  // what is behind the door
            const door = el("span", "xa-tile-door");                  // the door itself, its number on it
            door.appendChild(el("span", "xa-tile-n", String(n)));
            t.append(inside, door, el("span", "xa-tile-corner", String(n)));
            grid.appendChild(t);
            ui.tiles.set(n, t);
        });
        return ui;
    }

    // Each tile's state and label, and the furni in the open ones.
    function refresh() {
        for (const [n, t] of ui.tiles) {
            const st = stateOf(n), door = DOORS[n - 1];
            for (const s of ["open", "locked", "ready", "today"]) t.classList.toggle("is-" + s, st === s);
            t.classList.toggle("is-selected", ui.selected === n);
            t.setAttribute("aria-label", st === "open" ? `Door ${n}, open: ${door.n}` : st === "locked" ? `Door ${n}, opens on ${n} December` : `Door ${n}, ready to open`);
            const inside = t.querySelector(".xa-tile-in");
            if (st === "open" && !inside.firstChild) inside.appendChild(picture(door, "icon", 0.78));
            if (st !== "open" && inside.firstChild) inside.textContent = "";
        }
    }

    /* A furni picture, fitted to its box at twice its own pixels when that
       fits, at its own when that does, and smoothly smaller only when it
       must, so a small icon is never smeared across a fractional scale. */
    function picture(door, kind, fill) {
        const img = new Image();
        img.alt = ""; img.decoding = "async"; img.referrerPolicy = "no-referrer";
        img.className = "xa-pic";
        img.onload = () => {
            const box = img.parentElement;
            if (!box) return;
            const a = Math.min(box.clientWidth, box.clientHeight) * fill, w = img.naturalWidth, h = img.naturalHeight;
            const s = 2 * w <= a && 2 * h <= a ? 2 : w <= a && h <= a ? 1 : Math.min(a / w, a / h);
            img.style.width = Math.round(w * s) + "px"; img.style.height = Math.round(h * s) + "px";
            img.style.imageRendering = s >= 1 ? "pixelated" : "auto";
            img.classList.add("is-in");
        };
        img.src = kind === "icon" ? iconOf(door) : pictureOf(door);
        return img;
    }

    /* The row under the grid: the archive's own list row, for the door in
       hand, or saying what to do next. */
    function showRow(kind, n) {
        const { detail } = ui;
        detail.textContent = "";
        const row = el("div", "chrome-list-row featured xa-row");
        const thumb = el("div", "row-thumb xa-row-thumb");
        const info = el("div", "row-info");
        const side = el("div", "row-side");
        const pill = (cls, label) => { const p = el("span", "row-pills"); p.appendChild(el("span", "status-badge " + cls, label)); side.appendChild(p); };
        const count = `${ui.opened.size} of 24 opened` + (ui.preview ? " · preview: not saved" : "");
        const who = window.Account && Account.current && Account.nameOf ? Account.nameOf(Account.current) : "";
        if (kind === "door") {
            const door = DOORS[n - 1];
            thumb.appendChild(picture(door, "large", 0.9));
            info.appendChild(el("h3", null, door.n));
            const since = releasedText(door.d);
            info.appendChild(el("p", "row-creator", `Door ${n}` + (n === 24 ? " · Christmas Eve" : n === 6 ? " · St Nicholas' Day" : "") + (since ? ` · In Origins since ${since}` : "")));
            info.appendChild(el("p", "row-desc", "“" + door.m + "”"));
            const tags = el("div", "row-tags");
            tags.appendChild(el("span", "tag", "Christmas"));
            if (door.rare) tags.appendChild(el("span", "tag difficulty-hard", "Rare"));
            info.appendChild(tags);
            pill("status-open", "Opened");
        } else {
            const big = el("span", "xa-row-n", n ? String(n) : "");
            thumb.appendChild(big);
            let head, line, sub = count;
            if (kind === "loading") { head = who ? `${who}'s calendar` : "Your calendar"; line = "Opening your calendar…"; sub = ""; }
            else if (kind === "failed") { head = "Couldn't fetch your calendar"; line = "Check your connection, then click a door to try again."; }
            else if (kind === "notsaved") { head = `Door ${n} stuck`; line = "It couldn't be opened just now. Try it again in a moment."; }
            else if (kind === "locked") { head = `Door ${n}`; line = `Opens on ${n} December. No peeking!`; pill("status-unknown", "Locked"); }
            else if (!ui.day) { head = "The doors open from 1 December"; line = "One a day, all the way to Christmas Eve."; }
            else {
                const next = [...Array(Math.min(ui.day, 24)).keys()].map((i) => i + 1).find((d) => !ui.opened.has(d));
                if (next) {
                    big.textContent = String(next);
                    head = next === Math.min(ui.day, 24) ? `Door ${next} is ready` : `Door ${next} is still waiting`;
                    line = "Click it to see what's behind it.";
                    pill("status-collab", next === Math.min(ui.day, 24) ? "Today" : "Waiting");
                } else if (ui.day < 24) { head = `Door ${ui.day + 1} opens tomorrow`; line = "Click any open door to look at it again."; }
                else { head = "Merry Christmas, Maze Rats!"; line = "Every door is open. Click any of them to look again."; }
            }
            info.appendChild(el("h3", null, head));
            info.appendChild(el("p", "row-creator", line));
            if (sub) info.appendChild(el("p", "row-desc", sub));
        }
        if (kind === "door") info.appendChild(el("p", "row-desc xa-row-count", count));
        row.append(thumb, info, side);
        detail.appendChild(row);
    }

    function select(n) {
        ui.selected = n;
        for (const [d, t] of ui.tiles) t.classList.toggle("is-selected", d === n);
        if (n) showRow("door", n); else showRow("idle");
    }

    // ---------- opening a door ----------
    async function openDoor(n) {
        if (!ui || ui.busy.has(n)) return;
        const st = stateOf(n), tile = ui.tiles.get(n);
        if (st === "open") { select(n); return; }
        if (st === "locked") {
            tile.classList.remove("is-shaking"); void tile.offsetWidth; tile.classList.add("is-shaking");
            select(null); showRow("locked", n);
            return;
        }
        if (!ui.loaded) { if (ui.failed) load(); return; }
        ui.busy.add(n);
        ui.opened.add(n);
        tile.classList.add("is-opening");
        refresh();
        select(n);
        sparkle(tile);
        if (ui.preview) {
            put(sessionStorage, PREVIEW_KEY, JSON.stringify([...ui.opened]));
            ui.busy.delete(n);
            return;
        }
        let res = null, body = null;
        try {
            res = await timedFetch(ENDPOINT, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ day: n }) });
            body = await res.json().catch(() => null);
        } catch (e) { res = null; }
        if (!ui) return;
        ui.busy.delete(n);
        if (res && res.ok && body && Array.isArray(body.opened)) {
            ui.opened = new Set(body.opened);
            ui.opened.add(n);
            rememberSeen(ui.opened);
            track("advent-door", String(n));
            updateButton();
            refresh();
            return;
        }
        // Not kept: the door shuts again, and says why.
        ui.opened.delete(n);
        tile.classList.remove("is-opening");
        refresh();
        if (res && res.status === 401) { if (Account.sessionEnded) Account.sessionEnded(); shut(); askToSignIn(); return; }
        if (res && window.Account && Account.writeRefused && Account.writeRefused(res.status, body, "play")) { shut(); return; }
        select(null);
        showRow(res && body && body.notYet ? "locked" : "notsaved", n);
    }
    // A puff of gold pixels from a door as it opens.
    function sparkle(tile) {
        if (reduceMq.matches) return;
        for (let i = 0; i < 12; i++) {
            const s = el("span", "xa-spark" + (i % 3 === 0 ? " xa-spark-w" : ""));
            const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 26;
            s.style.setProperty("--dx", Math.round(Math.cos(a) * r / 2) * 2 + "px");
            s.style.setProperty("--dy", Math.round((Math.sin(a) * r - 8) / 2) * 2 + "px");
            s.style.left = 30 + Math.random() * 40 + "%"; s.style.top = 30 + Math.random() * 40 + "%";
            s.style.animationDelay = Math.round(Math.random() * 160) + "ms";
            tile.appendChild(s);
            setTimeout(() => s.remove(), 1300);
        }
    }

    // ---------- the account's doors ----------
    function timedFetch(url, opts, ms) {
        if (typeof AbortController === "undefined") return fetch(url, opts);
        const c = new AbortController();
        setTimeout(() => c.abort(), ms || 10000);
        return fetch(url, Object.assign({}, opts, { signal: c.signal }));
    }
    async function load() {
        ui.failed = false;
        if (ui.preview) {
            try { (JSON.parse(get(sessionStorage, PREVIEW_KEY) || "[]") || []).forEach((d) => { if (Number.isInteger(d)) ui.opened.add(d); }); } catch (e) { /* none */ }
            ui.loaded = true;
            refresh(); showRow("idle");
            return;
        }
        showRow("loading");
        let res = null, body = null;
        try {
            res = await timedFetch(ENDPOINT, { credentials: "same-origin", headers: { Accept: "application/json" } });
            body = await res.json().catch(() => null);
        } catch (e) { res = null; }
        if (!ui) return;
        if (res && res.status === 401) { if (Account.sessionEnded) Account.sessionEnded(); shut(); askToSignIn(); return; }
        if (!res || !res.ok || !body || !Array.isArray(body.opened)) { ui.failed = true; showRow("failed"); return; }
        ui.opened = new Set(body.opened);
        ui.loaded = true;
        rememberSeen(ui.opened);
        updateButton();
        refresh();
        showRow("idle");
    }

    function askToSignIn() {
        if (!window.Account || !Account.notice) return;
        Account.notice({
            // Short: a notice's title bar has room for about sixteen characters.
            title: "Advent Calendar",
            html: `<p class="notice-head">Sign in with Discord to open the advent calendar.</p><p>Your doors are kept with your account, so they follow you from your phone to your desk.</p>`,
            actions: [
                { label: "Sign in with Discord", value: "signin", lead: true },
                { label: "Not now", value: null }
            ]
        }).then((v) => { if (v === "signin") Account.signIn(location.pathname + location.search + "#advent"); });
    }

    // ---------- opening and shutting ----------
    function onKey(e) {
        if (!ui) return;
        if (e.key === "Escape") { e.preventDefault(); shut(); return; }
        if (e.key !== "Tab") return;
        const f = [...ui.win.querySelectorAll("button")].filter((b) => b.offsetParent);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    let wasModalOpen = false;
    async function open() {
        if (ui || !on) return;
        const A = window.Account;
        if (A && !A.known && A.ready) { try { await A.ready(); } catch (e) { /* asked below */ } }
        if (ui || !on) return;
        if (A && A.ban && A.mayPlay && !A.mayPlay()) return;
        if (!A || !A.current) { track("advent-open", "signed-out"); askToSignIn(); return; }
        track("advent-open", "signed-in");
        lastFocus = document.activeElement;
        build();
        document.body.appendChild(ui.overlay);
        wasModalOpen = document.body.classList.contains("modal-open");
        document.body.classList.add("modal-open");
        refresh();
        ui.grid.addEventListener("click", (e) => { const t = e.target.closest(".xa-tile"); if (t) openDoor(Number(t.dataset.day)); });
        ui.close.addEventListener("click", shut);
        ui.overlay.addEventListener("mousedown", (e) => { if (e.target === ui.overlay) shut(); });
        addEventListener("keydown", onKey, true);
        const first = [...ui.tiles].find(([n]) => stateOf(n) === "today");
        (first ? first[1] : ui.win).focus({ preventScroll: true });
        load();
    }
    // Shut as the site's windows shut: played out (.closing), then gone.
    function shut() {
        if (!ui) return;
        const gone = ui;
        ui = null;
        removeEventListener("keydown", onKey, true);
        if (!wasModalOpen) document.body.classList.remove("modal-open");
        const done = () => gone.overlay.remove();
        if (reduceMq.matches) done(); else { gone.overlay.classList.add("closing"); setTimeout(done, 200); }
        updateButton();
        if (lastFocus && lastFocus.focus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
        lastFocus = null;
    }

    // ---------- the top bar's button ----------
    function updateButton() {
        if (!btn) return;
        const day = adventDay(today());
        btn.hidden = !day;
        // Its flame is lit while a door is waiting (as far as this browser last heard).
        const seen = seenOpened();
        let waiting = !!day;
        if (seen) { waiting = false; for (let n = 1; n <= Math.min(day, 24); n++) if (!seen.has(n)) { waiting = true; break; } }
        btn.classList.toggle("has-ready", waiting);
    }
    function addButton() {
        const group = document.querySelector(".site-header .brand-group");
        if (!group || btn) return;
        btn = el("button", "header-badge xa-open-btn");
        btn.type = "button";
        btn.appendChild(el("span", "xa-open-flame"));
        btn.appendChild(document.createTextNode("Advent"));
        btn.setAttribute("aria-label", "Open the advent calendar");
        btn.addEventListener("click", open);
        group.appendChild(btn);
        updateButton();
    }

    function start() {
        if (on) return;
        on = true;
        if (document.documentElement.classList.contains("ff-embed")) return;
        addButton();
        // A page left open past midnight: the next door and the button catch up.
        dayTimer = setInterval(() => {
            updateButton();
            if (ui && adventDay(today()) !== ui.day) { ui.day = adventDay(today()); refresh(); }
        }, 60000);
        // Signed out elsewhere: the calendar is theirs no longer.
        if (window.Account && Account.onChange) accountOff = Account.onChange(() => { updateButton(); if (ui && !Account.current) shut(); });
        // Back from signing in (or a shared link): the calendar opens itself.
        if (location.hash === "#advent" && adventDay(today())) {
            history.replaceState(history.state, "", location.pathname + location.search);
            open();
        }
    }
    function stop() {
        if (!on) return;
        on = false;
        shut();
        clearInterval(dayTimer);
        if (accountOff) { accountOff(); accountOff = null; }
        if (btn) { btn.remove(); btn = null; }
    }

    (window.SiteSkins = window.SiteSkins || {})["xmas-advent"] = {
        start, stop,
        // For trying it out in any month (the console: SiteSkins["xmas-advent"].open()).
        open, shut,
        doors: DOORS
    };
})();

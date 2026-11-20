/* Wears a seasonal SKIN, if there is one (25 Oct 2026). The skins' half of
   what js/palette-wear.js is to the recolours.

   A skin is decorations, not colours: snow, icicles, lights, hats. It is a
   second axis beside the palette, so it can be worn over Classic or any
   theme. Each skin is two files, loaded only while it is on:

       css/skin-<name>.css   every rule scoped to html[data-skin="<name>"]
       js/skin-<name>.js     registers SiteSkins[<name>] = { start, stop }

   Putting one on sets <html data-skin>, adds the sheet and the script, and
   calls start(). Taking it off calls stop() (which removes every node,
   timer and observer the skin made), then takes the attribute, the sheet
   and the script away. So no page pays for a skin it is not wearing.

   ----------------------------------------------------------------------
   WHICH SKIN, IN ORDER

   1. An ADMIN'S PREVIEW in this browser (the Warren's skins card writes
      PREVIEW_KEY; or ?skin-preview=<name> / ?skin-preview=off on any page).
      Worn only while this browser holds an admin session, and verified: the
      token is checked with the auth function the Warren uses, once per tab
      per ten minutes, and a refused one drops the preview at once. It goes
      on before that answer, from the token being there, so the page does
      not paint bare and then fill with snow.

   2. THE SITE'S MANUAL OVERRIDE, settings `skin`: "off" is no skin
      whatever the dates say; a skin's name is that skin, now, for everyone;
      "auto" (the default) hands over to the schedule.

   3. THE SCHEDULE, settings `skinSchedule`: date windows, each
          { skin, from: "YYYY-MM-DDTHH:mm", to: "YYYY-MM-DDTHH:mm",
            zone: "local" | "utc", yearly: true | false, theme?: <palette> | null }
      The first window that holds the moment wins. "local" starts it at each
      visitor's own midnight (Christmas Day is Christmas Day where you are);
      "utc" flips the whole world at one instant. A yearly window ignores the
      years and comes back every year, and may run across New Year (1 Dec to
      6 Jan). netlify/functions/settings.js validates the same shape.

   A PALETTE CAN COME WITH IT: a window's theme is worn while the window is
   on and the site's own palette is given back after, through
   Api.applyTheme, so it is remembered for first paint exactly as a palette
   switched in the Warren is. A window that does not say takes its skin's
   default from PAIRED below (Halloween wears Witching Hour); null keeps the
   site's palette. The override and the preview take the palette of the
   skin's first window, or PAIRED.

   The settings answer arrives after the page has painted, so the last one
   is kept (CACHE_KEY) and worked out against the clock synchronously on the
   next load, exactly as the palette is; the fresh answer corrects it. A page
   left open also sets a timer for the schedule's next boundary, so it puts
   the skin on, or takes it off, at the moment the window opens or closes.

   ----------------------------------------------------------------------
   HOW A SKIN PLUGS IN (the same for every skin)

   1. Its name goes in SKINS below, in VALID_SKINS in
      netlify/functions/settings.js, and in the Warren card's list
      (js/admin-skin.js). The name is its data-skin value.
   2. css/skin-<name>.css: every rule under html[data-skin="<name>"].
   3. js/skin-<name>.js registers
          (window.SiteSkins = window.SiteSkins || {})[name] = { start, stop };
      start() is called once the DOM and the fonts are ready; stop() must
      remove every node, listener, timer and observer start() made, and give
      back any inline style it set.
   4. While it is on, it may use:
          SkinWear.today()     the date to use (the preview's "Pretend it's")
          SkinWear.current()   the skin being worn, or null
          window.HeaderTickerExtras.push(fn)   a slide in the top bar's
              ticker (js/site.js): fn() answers { key, title, when } or null,
              and is asked afresh every turn, so answer null once stopped.
              Dispatch "mazerats:ticker-extras" on document on starting and
              stopping, and the ticker shows (or drops) it at once.
   One skin at a time: putting one on takes the other off.

   "Pretend it's" (DATE_KEY, "MM-DD"): the date the skin's own calendar
   things use while PREVIEWING — the Christmas countdown starts on 1 Dec, so
   in October there would be nothing to look at. Never used for the public.

   PASSIVE MODE: a page that sets window.__skinWearPassive before loading
   this (the Warren, via js/admin-skin.js) gets SkinWear.resolve and friends
   for showing what visitors see, and wears nothing. */
(function () {
    "use strict";

    /* Blocked storage (a browser set to refuse site data) throws on merely
       reading window.localStorage, before get() and put() below can catch it.
       These names stand in for the globals through this whole file; null is
       a store get() and put() already treat as empty. */
    const openStore = (name) => { try { return window[name]; } catch (e) { return null; } };
    const localStorage = openStore("localStorage");
    const sessionStorage = openStore("sessionStorage");

    const PREVIEW_KEY = "mazerats_skin_preview";            // "xmas", in localStorage
    const DATE_KEY = "mazerats_skin_preview_date";          // "12-12", in localStorage
    const CACHE_KEY = "mazerats_skin_cache";                // the last { skin, skinSchedule, theme, halloweenGoo } served
    const SKIN_THEME_KEY = "mazerats_skin_theme";           // { theme, until }: a skin's palette, for first paint
    const TOKEN_KEY = "mazerats_admin_token";
    const VERIFIED_KEY = "mazerats_skin_preview_verified";  // sessionStorage: { tail, at }
    const REFUSED_KEY = "mazerats_skin_preview_refused";    // localStorage: the refused token's tail
    const SKINS = ["xmas", "halloween", "gta"];
    // The palette a skin brings when nothing else says: Witching Hour (the Halloween one Chris signed off), and Frost for Christmas.
    const PAIRED = { halloween: "witch", xmas: "frost", gta: "vice" };
    /* Things worn WITH a skin, in files of their own (26 Oct 2026): the
       advent calendar beside the Christmas skin. Each is a pair like a skin's,
       css/skin-<extra>.css and js/skin-<extra>.js registering
       SiteSkins[<extra>] = { start, stop }, loaded once the skin has started
       and taken off with it. A failed one is left out; the skin stays on. */
    const EXTRAS = { xmas: ["xmas-advent"] };
    /* An extra worn only while its switch in the settings is on (18 Nov 2026:
       the advent calendar hidden "for now", xmasAdvent, off unless the
       Warren's skins card ticks it). */
    const EXTRA_SWITCH = { "xmas-advent": "xmasAdvent" };
    const extrasOf = (name) => (EXTRAS[name] || []).filter((x) => !EXTRA_SWITCH[x] || option(EXTRA_SWITCH[x]));
    const RECHECK_MS = 10 * 60 * 1000;
    const passive = !!window.__skinWearPassive;

    const get = (store, k) => { try { return store.getItem(k); } catch (e) { return null; } };
    const put = (store, k, v) => { try { if (v == null) store.removeItem(k); else store.setItem(k, v); } catch (e) { /* private mode */ } };

    // ---------- the schedule, worked out ----------
    const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
    function instant(stamp, zone, year) {
        const m = STAMP.exec(stamp || "");
        if (!m) return NaN;
        const y = year != null ? year : Number(m[1]);
        const args = [y, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])];
        return zone === "utc" ? Date.UTC(...args) : new Date(...args).getTime();
    }
    // The stretches of time a window covers near `t`: one, or for a yearly one last year's, this year's and next.
    function spans(w, t) {
        if (!w.yearly) return [[instant(w.from, w.zone), instant(w.to, w.zone)]];
        const y = new Date(t).getFullYear(), out = [];
        for (const Y of [y - 1, y, y + 1]) {
            const s = instant(w.from, w.zone, Y);
            let e = instant(w.to, w.zone, Y);
            if (e <= s) e = instant(w.to, w.zone, Y + 1);          // across New Year
            out.push([s, e]);
        }
        return out;
    }
    /* What the PUBLIC sees at time t, from a settings answer: { skin, why, until }.
       why is "off", "override", "schedule" or "none". */
    function resolve(site, t) {
        t = t == null ? Date.now() : +t;
        const mode = (site && site.skin) || "auto";
        if (mode === "off") return { skin: null, why: "off" };
        if (SKINS.includes(mode)) return { skin: mode, why: "override", theme: pairedTheme(site, mode) };
        for (const w of (site && Array.isArray(site.skinSchedule) ? site.skinSchedule : [])) {
            if (!w || !SKINS.includes(w.skin)) continue;
            for (const [s, e] of spans(w, t)) if (s <= t && t < e) return { skin: w.skin, why: "schedule", since: s, until: e, theme: themeOf(w) };
        }
        return { skin: null, why: "none" };
    }

    /* ---------- the visitors' own pick (the Style tab, 20 Nov 2026) ----------
       The owner's: "a function for users on the home page that allows them
       to change the skin of the website", and "when a skin takes over the
       site at a set date/time, it should override all users saved preference
       of skin". So a pick is { skin, at }: "classic" (no skin) or a skin's
       name, and the moment it was made. It is worn while
         - the site is following its dates (an override in the Warren, a
           skin forced on for everybody, beats it; "off" does not),
         - that skin may be picked now (skinPicks in the settings: users, and
           anyDate or its own dates on now), and
         - no scheduled window has started since it was made. One that has
           is the takeover: the pick is dropped, and the visitor picks again
           if they still want theirs.
       Kept in PICK_KEY, and on the account when signed in (player-data's
       style, the later pick winning), so it follows them between devices. */
    const PICKS = ["classic"].concat(SKINS);
    const LABELS = { classic: "Classic", gta: "Vice City", halloween: "Halloween", xmas: "Christmas" };
    // The order the Style tab lists them in.
    const PICK_ORDER = ["classic", "gta", "halloween", "xmas"];
    const PICK_DEFAULTS = { gta: { users: true, anyDate: true }, halloween: { users: true, anyDate: false }, xmas: { users: true, anyDate: false } };
    function picksOf(site, skin) {
        const saved = site && site.skinPicks && site.skinPicks[skin];
        return saved && typeof saved === "object" ? saved : (PICK_DEFAULTS[skin] || { users: false, anyDate: false });
    }
    // Whether one of the skin's own windows holds the moment, whichever skin the site is wearing.
    function inItsDates(site, skin, t) {
        for (const w of (site && Array.isArray(site.skinSchedule) ? site.skinSchedule : [])) {
            if (!w || w.skin !== skin) continue;
            for (const [s, e] of spans(w, t)) if (s <= t && t < e) return true;
        }
        return false;
    }
    function pickable(site, skin, t) {
        if (!SKINS.includes(skin)) return false;
        const p = picksOf(site, skin);
        return p.users === true && (p.anyDate === true || inItsDates(site, skin, t == null ? Date.now() : +t));
    }
    /* What the Style tab offers at t: Classic and every skin that may be
       picked now, or nothing while the Warren forces a skin on everybody,
       or when there is no skin to offer beside Classic. */
    function choices(site, t) {
        t = t == null ? Date.now() : +t;
        if (SKINS.includes((site && site.skin) || "auto")) return [];
        const skins = PICK_ORDER.filter((s) => s !== "classic" && pickable(site, s, t));
        return skins.length ? ["classic"].concat(skins) : [];
    }
    /* A stored pick, if it stands at t: null when it is stale (a window began
       after it), not allowed now, or the Warren is forcing a skin. */
    function pickStands(site, pick, t) {
        if (!pick || !PICKS.includes(pick.skin) || !(pick.at > 0)) return false;
        t = t == null ? Date.now() : +t;
        const pub = resolve(site, t);
        if (pub.why === "override") return false;
        if (pub.why === "schedule" && pub.since > pick.at) return false;
        return pick.skin === "classic" ? choices(site, t).length > 0 : pickable(site, pick.skin, t);
    }
    // A window's palette: its own if it names one (null meaning the site's), else its skin's default.
    const themeOf = (w) => ("theme" in w ? (w.theme || null) : (PAIRED[w.skin] || null));
    // The palette a skin wears outside its own window: its first window's, else PAIRED.
    function pairedTheme(site, skin) {
        const w = (site && Array.isArray(site.skinSchedule) ? site.skinSchedule : []).find((x) => x && x.skin === skin);
        return w ? themeOf(w) : (PAIRED[skin] || null);
    }
    // The next moment the schedule changes its mind, or null.
    function nextChange(site, t) {
        if (((site && site.skin) || "auto") !== "auto") return null;
        let best = null;
        for (const w of (site && Array.isArray(site.skinSchedule) ? site.skinSchedule : [])) {
            if (!w || !SKINS.includes(w.skin)) continue;
            for (const [s, e] of spans(w, t)) for (const edge of [s, e]) if (edge > t && (best == null || edge < best)) best = edge;
        }
        return best;
    }

    window.SkinWear = { resolve, nextChange, spans, pairedTheme, SKINS, PAIRED, choices, pickable, pickStands, picksOf, LABELS, PICK_DEFAULTS };
    if (passive) return;

    // ---------- the preview ----------
    /* "none": the normal site previewed (27 Oct 2026, the owner's) — no
       skin and the site's own palette in this browser, whatever the
       visitors are wearing. The Warren's "Normal site" button. */
    const NO_SKIN = "none";
    // The URL switch, for an admin: read, remembered, and taken out of the address.
    try {
        const q = new URLSearchParams(location.search);
        const asked = q.get("skin-preview");
        if (asked && get(localStorage, TOKEN_KEY)) {
            put(localStorage, PREVIEW_KEY, SKINS.includes(asked) || asked === NO_SKIN ? asked : null);
            q.delete("skin-preview");
            const rest = q.toString();
            history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
        }
    } catch (e) { /* an address it cannot rewrite: harmless */ }

    let refused = false;                // the session check said no
    function preview() {
        const p = get(localStorage, PREVIEW_KEY);
        const token = get(localStorage, TOKEN_KEY);
        // A session the check refused (expired) stays refused on the next page too, not a flash per page.
        /* In localStorage, not sessionStorage (26 Oct 2026): a 401 is final
           for that token, and per tab it was a flash of the preview's skin
           (and its palette, remembered for first paint) in every new tab an
           expired admin session, or a shared computer, ever opened. A new
           sign-in is a new token, so its tail no longer matches. */
        const no = token ? get(localStorage, REFUSED_KEY) : null;
        if (token && no === token.slice(-12)) return null;
        return !refused && p && (SKINS.includes(p) || p === NO_SKIN) && token ? p : null;
    }

    let site = null;
    try { site = JSON.parse(get(localStorage, CACHE_KEY) || "null"); } catch (e) { site = null; }

    let current = null, source = null;

    function today() {
        const real = new Date();
        const mmdd = source === "preview" && get(localStorage, DATE_KEY);
        const m = /^(\d{2})-(\d{2})$/.exec(mmdd || "");
        if (!m) return real;
        return new Date(real.getFullYear(), Number(m[1]) - 1, Number(m[2]), 12);
    }

    function whenReady(fn) {
        const go = () => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fn, fn);
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true }); else go();
    }

    /* THE TOP BAR ONLY (20 Nov 2026, the owner's: "if a user overrides a
       seasonal or event skin with the Classic skin, the top bar stays as the
       seasonal or event skin"). mode "bar" wears the skin on the top bar
       alone: html[data-skin-bar] in place of html[data-skin] (each skin's
       sheet has a short "top bar only" block for it), the bar given the
       skin's palette by its own data-theme (the palettes' rules are written
       [data-theme="x"] .thing, so they reach into it and no further), and
       the skin started with { bar: true }, so it draws its bar pieces only
       (Christmas: the lights, holly and countdown; Vice City: the neon tubes;
       Halloween: the ghost). Everything else is Classic. */
    let currentMode = "full";
    function apply(name, mode) {
        mode = mode === "bar" ? "bar" : "full";
        if (!SKINS.includes(name) || (current === name && currentMode === mode)) return;
        if (current) remove();
        current = name;
        currentMode = mode;
        if (mode === "bar") {
            document.documentElement.setAttribute("data-skin-bar", name);
            const bar = document.querySelector(".site-header");
            const pal = pairedTheme(site, name);
            if (bar && pal && /^[a-z]+$/.test(pal)) {
                bar.setAttribute("data-theme", pal); bar.__mrBarTheme = true;
                /* The palette's own sheet, which the page (in Classic) has not
                   loaded: every rule in it is [data-theme="x"] …, so with only
                   the bar carrying the attribute it reaches the bar and nothing
                   else. Before the dark layer, as the page's own palette sits. */
                const pl = document.createElement("link");
                pl.rel = "stylesheet"; pl.id = "skin-bar-theme"; pl.href = "/css/theme-" + pal + ".css";
                const layer = document.getElementById("dark-css");
                if (layer && layer.parentNode === document.head) document.head.insertBefore(pl, layer); else document.head.appendChild(pl);
            }
        } else document.documentElement.setAttribute("data-skin", name);
        // Absolute, for the same reason as the theme's: the 404 page answers at any depth.
        const link = document.createElement("link");
        link.rel = "stylesheet"; link.id = "skin-css"; link.href = "/css/skin-" + name + ".css?v=1";
        // The pieces are placed by this sheet: started without it, they land in the page's flow and measure wrong.
        /* So a sheet that fails to load means no skin on this page (26 Oct
           2026): it used to start anyway, and every piece, the bats' and the
           ghost's screen-sized canvases among them, went into the page's flow
           at the foot of the page. The next page asks again. */
        const styled = new Promise((ok) => { link.onload = () => ok(true); link.onerror = () => ok(false); });
        document.head.appendChild(link);
        Promise.all([styled, new Promise((ok) => {
            if (window.SiteSkins && window.SiteSkins[name]) return ok();
            const s = document.createElement("script");
            s.id = "skin-js"; s.src = "/js/skin-" + name + ".js?v=1";
            s.onload = ok;
            s.onerror = () => { remove(); ok(); };
            document.head.appendChild(s);
        })]).then(([sheet]) => whenReady(() => {
            if (current !== name || currentMode !== mode) return;
            if (!sheet) { remove(); return; }
            const skin = window.SiteSkins && window.SiteSkins[name];
            if (skin) try { skin.start({ bar: mode === "bar" }); } catch (e) { remove(); setTimeout(() => { throw e; }); return; }   // off, and still reported
            if (mode === "bar") return;   // no extras (the advent calendar) on the bar alone
            /* Not inside the homepage's game window (html.ff-embed, 27 Oct
               2026): the skins draw nothing there and the advent calendar
               starts as nothing, so its sheet and script were two requests
               for no use on every window opened. */
            if (!document.documentElement.classList.contains("ff-embed")) extrasOf(name).forEach((x) => wearExtra(name, x));
        }));
    }

    function wearExtra(name, x) {
        const link = document.createElement("link");
        link.rel = "stylesheet"; link.className = "skin-extra-css"; link.href = "/css/skin-" + x + ".css?v=1";
        const styled = new Promise((ok) => { link.onload = () => ok(true); link.onerror = () => ok(false); });
        document.head.appendChild(link);
        const loaded = new Promise((ok) => {
            if (window.SiteSkins && window.SiteSkins[x]) return ok(true);
            const s = document.createElement("script");
            s.className = "skin-extra-js"; s.src = "/js/skin-" + x + ".js?v=1";
            s.onload = () => ok(true); s.onerror = () => ok(false);
            document.head.appendChild(s);
        });
        Promise.all([styled, loaded]).then(([sheet, script]) => {
            const extra = window.SiteSkins && window.SiteSkins[x];
            if (current !== name || !sheet || !script || !extra) { if (current !== name || !sheet) link.remove(); return; }
            try { extra.start(); } catch (e) { setTimeout(() => { throw e; }); }
        });
    }
    function removeExtras(name) {
        (EXTRAS[name] || []).forEach((x) => {
            const extra = window.SiteSkins && window.SiteSkins[x];
            if (extra) try { extra.stop(); } catch (e) { setTimeout(() => { throw e; }); }
        });
        document.querySelectorAll("link.skin-extra-css, script.skin-extra-js").forEach((n) => n.remove());
    }

    function remove() {
        if (!current) return;
        removeExtras(current);
        const skin = window.SiteSkins && window.SiteSkins[current];
        // A skin that throws on the way out is still taken off.
        if (skin) try { skin.stop(); } catch (e) { setTimeout(() => { throw e; }); }   // reported, and the rest below still runs
        document.documentElement.removeAttribute("data-skin");
        document.documentElement.removeAttribute("data-skin-bar");
        const bar = document.querySelector(".site-header");
        if (bar && bar.__mrBarTheme) { bar.removeAttribute("data-theme"); delete bar.__mrBarTheme; }
        const barSheet = document.getElementById("skin-bar-theme"); if (barSheet) barSheet.remove();
        currentMode = "full";
        const link = document.getElementById("skin-css"); if (link) link.remove();
        const s = document.getElementById("skin-js"); if (s) s.remove();
        current = null;
    }

    // ---------- the visitor's pick, kept ----------
    const PICK_KEY = "mazerats_skin_pick";                  // { skin: "classic" | <skin>, at: ms }
    function storedPick() {
        try {
            const v = JSON.parse(get(localStorage, PICK_KEY) || "null");
            return v && PICKS.includes(v.skin) && Number(v.at) > 0 ? { skin: v.skin, at: Number(v.at) } : null;
        } catch (e) { return null; }
    }
    /* The pick worn now, or null. A pick a window has started since is the
       takeover: dropped for good here (and on the account, by the same rule,
       wherever it is read), so the visitor sees the new skin and picks again. */
    function pickNow() {
        const pick = storedPick();
        if (!pick) return null;
        const pub = resolve(site, Date.now());
        if (pub.why === "schedule" && pub.since > pick.at) { put(localStorage, PICK_KEY, null); return null; }
        return pickStands(site, pick, Date.now()) ? pick : null;
    }

    let boundary = 0;
    function refresh() {
        const p = preview();
        const pub = resolve(site, Date.now());
        // A preview beats the visitor's own pick; the pick beats the dates.
        const mine = p ? null : pickNow();
        const own = mine ? (mine.skin === "classic" ? null : mine.skin) : undefined;
        const want = p === NO_SKIN ? null : p || (mine ? own : pub.skin);
        const was = source;
        source = p ? "preview" : mine ? (own ? "pick" : null) : pub.skin ? "site" : null;
        // A change of pretend date or of source restarts the skin, so its calendar things re-read.
        // (Only into or out of a preview: picking the skin already worn by its dates is no change.)
        if (want && want === current && (was === "preview") !== (source === "preview")) remove();
        /* Classic picked while a seasonal window is on: that skin on the top
           bar alone (see apply's "bar" mode). Another skin picked wears whole. */
        const barOnly = !p && mine && !own && pub.why === "schedule" && pub.skin ? pub.skin : null;
        if (want) apply(want); else if (barOnly) apply(barOnly, "bar"); else remove();
        unstick();
        if (p === NO_SKIN) wearTheme(null, null, true);
        else if (mine) {
            const next = nextChange(site, Date.now());
            wearTheme(own ? pairedTheme(site, own) : null, Math.min(next == null ? Infinity : next, Date.now() + 30 * 864e5), false, true);
        }
        else wearTheme(p ? pairedTheme(site, p) : pub.theme, p ? null : pub.until);
        // The Style tab (js/style-tab.js) redraws from this.
        try { document.dispatchEvent(new CustomEvent("mazerats:skin-changed", { detail: { skin: current, source } })); } catch (e) { /* an old browser */ }
        // Wake at the schedule's next boundary. setTimeout holds about 24 days; a longer wait re-arms.
        clearTimeout(boundary);
        const next = nextChange(site, Date.now());
        if (next != null) boundary = setTimeout(refresh, Math.min(next - Date.now() + 500, 2 ** 31 - 1));
    }

    /* THE PAIRED PALETTE IS NEVER REMEMBERED AS THE SITE'S (the owner's:
       "Witching hour should be strictly linked to the halloween skin").

       It used to go on through Api.applyTheme, which also writes
       mazerats_theme, the palette every page's <head> paints first. So once
       Halloween had been worn, Witching Hour was remembered as THE palette:
       pages without the skin (Fallin' Furni, the Warren) painted it, and so
       did a Christmas preview until the settings answered.

       Now the page's palette is set directly (data-theme and the theme-css
       link, which is all applyTheme does to the page) and mazerats_theme is
       left as the site's own. For a first paint without a flash, the pages
       that wear skins (home, index, privacy, wizard, 404) also read
       SKIN_THEME_KEY in their <head>: { theme, until }, written here while a
       paired palette is on and wiped the moment it is not. `until` is the
       window's end (a day out for a preview or the override, renewed on
       every page), so even a browser that never comes back to a skin page
       cannot carry it past its window. Pages without a skin never read it. */
    function setPalette(name) {
        const root = document.documentElement;
        const now = root.getAttribute("data-theme") || "classic";
        if (name === now) return;
        let link = document.getElementById("theme-css");
        if (name === "classic") { root.removeAttribute("data-theme"); if (link) link.remove(); return; }
        root.setAttribute("data-theme", name);
        /* Put back where the page had it, before the dark and light layers
           (30 Oct 2026, the bug scan). Api.applyTheme takes the link away for
           Classic, and on a first visit it does that before this runs, so the
           new one went at the end of <head>: its :root colours then beat the
           layer's equal-ranked :root ones, and dark mode (or Frost's light
           mode) wore the palette's variables wherever a rule used one. */
        if (!link) {
            link = document.createElement("link"); link.id = "theme-css"; link.rel = "stylesheet";
            const layer = document.getElementById("dark-css");
            if (layer && layer.parentNode === document.head) document.head.insertBefore(link, layer); else document.head.appendChild(link);
        }
        const href = "/css/theme-" + name + ".css";
        if ((link.getAttribute("href") ? link.href.split("?")[0] : "") !== new URL(href, location.href).href) link.href = href;
    }
    /* Said when the skin's palette comes on, changes or goes off (26 Oct
       2026), after the page's palette has been switched: js/palette-wear.js
       takes a live custom palette off while a skin wears its own, and puts
       it back after. */
    function told(was) {
        if ((window.__mrSkinPalette || null) === (was || null)) return;
        try { document.dispatchEvent(new CustomEvent("mazerats:skin-palette", { detail: { palette: window.__mrSkinPalette || null } })); } catch (e) { /* an old browser: the palette stays as it was */ }
    }
    /* `hold` (the "none" preview): the site's own palette is remembered in
       SKIN_THEME_KEY as a skin's would be, so the pages' <head> paints it
       first rather than the visitors' skin palette from the settings, and
       nothing changes colour once this runs. */
    /* `pick` (the visitor's own, from the Style tab): remembered with
       pick: true, which home.html's gate lets stand as it does a preview,
       and only until the dates next change, when a window starting may take
       it over; Classic picked is the site's own palette held (as `hold`). */
    function wearTheme(paired, until, hold, pick) {
        const was = window.__mrSkinPalette;
        const mark = pick ? { pick: true } : {};
        if (paired && /^[a-z]+$/.test(paired)) {
            window.__mrSkinPalette = paired;   // Api.applyTheme leaves the page alone meanwhile
            setPalette(paired);
            put(localStorage, SKIN_THEME_KEY, JSON.stringify({ theme: paired, until: until || Date.now() + 864e5, ...mark }));
            told(was);
            return;
        }
        put(localStorage, SKIN_THEME_KEY, null);
        window.__mrSkinPalette = null;
        // Back to the site's own: the settings' answer if known, else what this browser remembers.
        const own = (site && site.theme) || get(localStorage, "mazerats_theme") || "classic";
        if (/^[a-z]+$/.test(own)) setPalette(own);
        if ((hold || pick) && /^[a-z]+$/.test(own)) put(localStorage, SKIN_THEME_KEY, JSON.stringify({ theme: own, until: until || Date.now() + 864e5, ...mark }));
        told(was);
    }
    /* A browser left remembering a paired palette by the old code (Witching
       Hour as its own, while the site's is something else) is put right. */
    function unstick() {
        const remembered = get(localStorage, "mazerats_theme");
        const paired = Object.values(PAIRED);
        if (site && site.theme && remembered && remembered !== site.theme && paired.includes(remembered)) {
            put(localStorage, "mazerats_theme", site.theme);
        }
    }

    /* The session check, for a preview only. Kept off the critical path:
       the preview is already on by the time this asks. */
    function verify() {
        const token = get(localStorage, TOKEN_KEY);
        if (!token || !get(localStorage, PREVIEW_KEY)) return;
        const tail = token.slice(-12);
        try {
            const v = JSON.parse(get(sessionStorage, VERIFIED_KEY) || "null");
            if (v && v.tail === tail && Date.now() - v.at < RECHECK_MS) return;
        } catch (e) { /* unreadable: ask again */ }
        if (typeof Api === "undefined" || !Api.verifySession) return;
        Api.verifySession(token).then((who) => {
            if (who) { put(sessionStorage, VERIFIED_KEY, JSON.stringify({ tail, at: Date.now() })); return; }
            put(sessionStorage, VERIFIED_KEY, null);
            put(localStorage, REFUSED_KEY, tail);
            refused = true;
            refresh();
        }, () => { /* a blip, not a refusal: keep it on, ask on the next page */ });
    }

    refresh();
    verify();

    // The fresh answer: the page's one shared settings request.
    if (typeof Api !== "undefined" && Api.getSiteSettings) {
        Api.getSiteSettings().then((s) => {
            if (!s || s.fromCache) return;          // an outage: keep what was remembered
            const was = option("halloweenGoo"), wasAdvent = option("xmasAdvent");
            site = { skin: s.skin || "auto", skinSchedule: Array.isArray(s.skinSchedule) ? s.skinSchedule : [], theme: s.theme || "classic",
                halloweenGoo: s.halloweenGoo !== false, xmasAdvent: s.xmasAdvent === true,
                skinPicks: s.skinPicks && typeof s.skinPicks === "object" ? s.skinPicks : null };
            put(localStorage, CACHE_KEY, JSON.stringify(site));
            // The goo switched in the Warren since this browser last looked: worn again, with or without it.
            if (current === "halloween" && was !== option("halloweenGoo")) remove();
            // Likewise the advent calendar: the Christmas skin worn again, with or without it.
            if (current === "xmas" && wasAdvent !== option("xmasAdvent")) remove();
            refresh();
        }, () => { /* unreadable: the remembered answer stands */ });
    }

    /* THE PICK, MADE (the Style tab calls this). Kept here and on the
       account, and worn at once. */
    function setPick(name) {
        if (!PICKS.includes(name)) return false;
        const pick = { skin: name, at: Date.now() };
        put(localStorage, PICK_KEY, JSON.stringify(pick));
        if (window.Account && Account.current && typeof Account.saveState === "function") Account.saveState({ style: pick });
        refresh();
        return true;
    }
    /* What is being worn as the Style tab sees it: the pick if one stands,
       else what the site is wearing by its dates ("classic" for none). */
    function wearing() {
        const mine = pickNow();
        if (mine) return mine.skin;
        return resolve(site, Date.now()).skin || "classic";
    }

    /* THE ACCOUNT'S PICK. Signed in, the later of this device's pick and the
       account's wins: the account's is taken here, or this one sent there.
       Asked once the account is known, and again on signing in. */
    function takeAccount(d) {
        const theirs = d && d.style && PICKS.includes(d.style.skin) && Number(d.style.at) > 0 ? { skin: d.style.skin, at: Number(d.style.at) } : null;
        const mine = storedPick();
        if (theirs && (!mine || theirs.at > mine.at)) { put(localStorage, PICK_KEY, JSON.stringify(theirs)); refresh(); }
        else if (mine && (!theirs || mine.at > theirs.at) && Account.current && typeof Account.saveState === "function") Account.saveState({ style: mine });
    }
    let accountHooked = false;
    function hookAccount() {
        if (accountHooked || !window.Account || typeof Account.onChange !== "function") return;
        accountHooked = true;
        const pull = () => {
            if (!Account.current || typeof Account.fetchState !== "function") return;
            // Someone else on the page may have asked already.
            if (Account.stored) takeAccount(Account.stored);
            else Account.fetchState().then(takeAccount, () => { /* a blip: the device's own pick stands */ });
        };
        Account.onChange(pull);
        if (typeof Account.onStored === "function") Account.onStored(takeAccount);
        if (Account.known) pull();
    }
    hookAccount();
    if (!accountHooked) document.addEventListener("DOMContentLoaded", hookAccount, { once: true });

    // Another tab (the Warren) switched the preview or the date: follow along without a reload.
    addEventListener("storage", (e) => {
        // The visitor picked in another tab: worn here too.
        if (e.key === PICK_KEY) { refresh(); return; }
        if (e.key !== PREVIEW_KEY && e.key !== TOKEN_KEY && e.key !== DATE_KEY) return;
        if (e.key === DATE_KEY && source === "preview") { remove(); source = null; }
        refused = false;
        refresh();
        verify();
    });

    /* A page coming back into view looks at the clock again (26 Oct 2026).
       The boundary timer above is a setTimeout, and a computer asleep or a
       page held in the back-forward cache does not count down: a tab left
       open on 1 Nov and woken on the 3rd still wore Halloween until its
       late timer fired. Cheap when nothing has changed: apply() and the
       palette both see they already have what is wanted. */
    addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
    addEventListener("pageshow", (e) => { if (e.persisted) refresh(); });

    /* A skin's own switches in the settings (28 Oct 2026): halloweenGoo, false
       for the Halloween skin without its goo. A setting the answer has not
       carried yet is on. */
    function option(name) {
        if (name === "halloweenGoo") return !(site && site.halloweenGoo === false);
        // The advent calendar, by contrast, is OFF until the answer says it is on.
        if (name === "xmasAdvent") return !!(site && site.xmasAdvent === true);
        return undefined;
    }

    Object.assign(window.SkinWear, { apply, remove, today, option, current: () => current, source: () => source,
        setPick, wearing, site: () => site, mode: () => (current ? currentMode : null), offered: () => choices(site, Date.now()), previewing: () => !!preview() });
})();

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

    const PREVIEW_KEY = "mazerats_skin_preview";            // "xmas", in localStorage
    const DATE_KEY = "mazerats_skin_preview_date";          // "12-12", in localStorage
    const CACHE_KEY = "mazerats_skin_cache";                // the last { skin, skinSchedule, theme, halloweenGoo } served
    const SKIN_THEME_KEY = "mazerats_skin_theme";           // { theme, until }: a skin's palette, for first paint
    const TOKEN_KEY = "mazerats_admin_token";
    const VERIFIED_KEY = "mazerats_skin_preview_verified";  // sessionStorage: { tail, at }
    const REFUSED_KEY = "mazerats_skin_preview_refused";    // localStorage: the refused token's tail
    const SKINS = ["xmas", "halloween"];
    // The palette a skin brings when nothing else says: Witching Hour (the Halloween one Chris signed off), and Frost for Christmas.
    const PAIRED = { halloween: "witch", xmas: "frost" };
    /* Things worn WITH a skin, in files of their own (26 Oct 2026): the
       advent calendar beside the Christmas skin. Each is a pair like a skin's,
       css/skin-<extra>.css and js/skin-<extra>.js registering
       SiteSkins[<extra>] = { start, stop }, loaded once the skin has started
       and taken off with it. A failed one is left out; the skin stays on. */
    const EXTRAS = { xmas: ["xmas-advent"] };
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
            for (const [s, e] of spans(w, t)) if (s <= t && t < e) return { skin: w.skin, why: "schedule", until: e, theme: themeOf(w) };
        }
        return { skin: null, why: "none" };
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

    window.SkinWear = { resolve, nextChange, spans, pairedTheme, SKINS, PAIRED };
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

    function apply(name) {
        if (!SKINS.includes(name) || current === name) return;
        if (current) remove();
        current = name;
        document.documentElement.setAttribute("data-skin", name);
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
            if (current !== name) return;
            if (!sheet) { remove(); return; }
            const skin = window.SiteSkins && window.SiteSkins[name];
            if (skin) try { skin.start(); } catch (e) { remove(); setTimeout(() => { throw e; }); return; }   // off, and still reported
            /* Not inside the homepage's game window (html.ff-embed, 27 Oct
               2026): the skins draw nothing there and the advent calendar
               starts as nothing, so its sheet and script were two requests
               for no use on every window opened. */
            if (!document.documentElement.classList.contains("ff-embed")) (EXTRAS[name] || []).forEach((x) => wearExtra(name, x));
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
        const link = document.getElementById("skin-css"); if (link) link.remove();
        const s = document.getElementById("skin-js"); if (s) s.remove();
        current = null;
    }

    let boundary = 0;
    function refresh() {
        const p = preview();
        const pub = resolve(site, Date.now());
        const want = p === NO_SKIN ? null : p || pub.skin;
        const was = source;
        source = p ? "preview" : pub.skin ? "site" : null;
        // A change of pretend date or of source restarts the skin, so its calendar things re-read.
        if (want && want === current && was !== source) remove();
        if (want) apply(want); else remove();
        unstick();
        if (p === NO_SKIN) wearTheme(null, null, true);
        else wearTheme(p ? pairedTheme(site, p) : pub.theme, p ? null : pub.until);
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
    function wearTheme(paired, until, hold) {
        const was = window.__mrSkinPalette;
        if (paired && /^[a-z]+$/.test(paired)) {
            window.__mrSkinPalette = paired;   // Api.applyTheme leaves the page alone meanwhile
            setPalette(paired);
            put(localStorage, SKIN_THEME_KEY, JSON.stringify({ theme: paired, until: until || Date.now() + 864e5 }));
            told(was);
            return;
        }
        put(localStorage, SKIN_THEME_KEY, null);
        window.__mrSkinPalette = null;
        // Back to the site's own: the settings' answer if known, else what this browser remembers.
        const own = (site && site.theme) || get(localStorage, "mazerats_theme") || "classic";
        if (/^[a-z]+$/.test(own)) setPalette(own);
        if (hold && /^[a-z]+$/.test(own)) put(localStorage, SKIN_THEME_KEY, JSON.stringify({ theme: own, until: Date.now() + 864e5 }));
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
            const was = option("halloweenGoo");
            site = { skin: s.skin || "auto", skinSchedule: Array.isArray(s.skinSchedule) ? s.skinSchedule : [], theme: s.theme || "classic",
                halloweenGoo: s.halloweenGoo !== false };
            put(localStorage, CACHE_KEY, JSON.stringify(site));
            // The goo switched in the Warren since this browser last looked: worn again, with or without it.
            if (current === "halloween" && was !== option("halloweenGoo")) remove();
            refresh();
        }, () => { /* unreadable: the remembered answer stands */ });
    }

    // Another tab (the Warren) switched the preview or the date: follow along without a reload.
    addEventListener("storage", (e) => {
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
        return undefined;
    }

    Object.assign(window.SkinWear, { apply, remove, today, option, current: () => current, source: () => source });
})();

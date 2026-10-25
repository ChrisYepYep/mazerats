/* Ariadne's Thread level editor: TESTING (14 Oct 2026). The level as it
   stands, unsaved changes and all, played in the game itself (js/rat-race.js
   through RatRace.dev.play), in a canvas over the map: Scout dropped where
   the pointer was (T) or at the start (Shift+T), endless lives, nothing kept.
   Esc comes back to editing, with the view where Scout got to. */
(function () {
    "use strict";
    const AE = window.AE, S = AE.S;
    const D = () => window.RatRace.dev;
    const TS = 16;
    const $ = s => document.querySelector(s);
    let lastMode = "cursor", lastAt = null;

    // where to drop him: his feet on the pointer (or the middle of the view), up out of any wall he would be in
    function dropPoint(mode) {
        const a = S.act, starts = S.spec.objects.filter(o => o.type === "start");
        if (mode === "start" || !a) return null;
        const p = S.mouse.inside ? { x: S.mouse.x, y: S.mouse.y } : { x: AE.viewRect().x + AE.viewRect().w / 2, y: AE.viewRect().y + AE.viewRect().h / 2 };
        let x = Math.round(p.x - D().BODY_W / 2), y = Math.round(p.y - D().STAND_H);
        x = Math.max(0, Math.min(a.w * TS - D().BODY_W, x)); y = Math.max(0, Math.min(a.h * TS - D().STAND_H - 1, y));
        const solid = (px, py) => { const c = a.tiles[Math.floor(py / TS)] && a.tiles[Math.floor(py / TS)][Math.floor(px / TS)]; return c === "#" || c === "X" || c === "V" || c === "8" || c === "9" || c === undefined; };
        const inWall = () => solid(x + 1, y + 1) || solid(x + D().BODY_W - 1, y + 1) || solid(x + 1, y + D().STAND_H - 1) || solid(x + D().BODY_W - 1, y + D().STAND_H - 1);
        for (let i = 0; i < 64 && inWall(); i++) y -= 4;
        if (inWall()) return starts.length ? null : { x, y };
        return { x, y };
    }

    /* THE PASSAGES AFTER THIS ONE (18 Oct 2026, the owner's: "When playing the game in the editor from passage 1
       of mine labyrinth, it doesn't then load the most recently saved version of passage 2?"). Reaching the end
       goes on to the next passage from window.RatLevels, which is js/rat-race-levels.js as it was when this page
       loaded: saves since then (here or in another tab) were missing. So every test fills it afresh from the
       saved files, in the background (the next passage is not wanted until the end of this one), and puts this
       passage in as it stands, unsaved changes and all. */
    async function freshLevels(spec) {
        const L = window.RatLevels; if (!L) return;
        try {
            const idx = await (await fetch("/assets/ariadne-levels/index.json", { cache: "no-store" })).json();
            const zones = await Promise.all(idx.zones.map(async z => {
                const acts = await Promise.all(z.passages.map(async id => {
                    if (id === S.id) return Object.assign({}, spec, { id });
                    const r = await fetch("/assets/ariadne-levels/" + id + ".json", { cache: "no-store" });
                    if (!r.ok) throw new Error(id + ": " + r.status);
                    return Object.assign(await r.json(), { id });
                }));
                const zone = { name: z.name, music: z.music, theme: z.theme, acts };
                if (z.secret) zone.secret = true;
                if (z.lab) zone.lab = true;
                return zone;
            }));
            L.zones.length = 0; L.zones.push(...zones);   // in place: the game holds this very object
        } catch (e) { AE.toast("Could not read the saved passages; the next passage may be an older one", "error"); }
    }

    AE.playtest = function (mode, again) {
        if (AE.testing) { stop(); return; }
        if (!S.spec.objects.some(o => o.type === "start")) { AE.toast("Put Scout's start in first (Mechanics)", "error"); return; }
        lastMode = mode || "cursor";
        const at = again ? lastAt : dropPoint(lastMode);
        lastAt = at;
        AE.testing = true;
        document.body.classList.add("testing");
        $("#test").hidden = false;
        fit();
        const spec = AE.toSpec(false);
        freshLevels(spec);
        D().debug.boxes = $("#t-boxes").classList.contains("on");
        D().debug.invincible = $("#t-god").classList.contains("on");
        D().play($("#game"), spec, S.zone, { at, zi: S.zi, ai: S.ai, music: !$("#t-sound").classList.contains("off") });
        $("#t-where").textContent = at ? "Dropped in at " + Math.round(at.x) + ", " + Math.round(at.y) : "From the start";
        $("#game").focus();
    };
    function stop() {
        if (!AE.testing) return;
        const where = D().stop();
        AE.testing = false;
        document.body.classList.remove("testing");
        $("#test").hidden = true;
        if (where) AE.centerOn(where.x + 5, where.y + 11);
        AE.R.canvas.focus();
        AE.redraw();
    }
    AE.stopTest = stop;
    function fit() {
        const box = $("#test").getBoundingClientRect(), bar = $("#test-bar").getBoundingClientRect().height;
        const k = Math.max(1, Math.floor(Math.min((box.width - 24) / D().VW, (box.height - bar - 24) / D().VH)));
        const c = $("#game");
        c.style.width = D().VW * k + "px"; c.style.height = D().VH * k + "px";
        $("#t-scale").textContent = k + "×";
    }

    AE.initTest = function () {
        const tog = (sel, fn) => $(sel).addEventListener("click", e => { const b = e.currentTarget; b.classList.toggle("on"); fn(b.classList.contains("on")); b.blur(); $("#game").focus(); });
        $("#t-stop").addEventListener("click", stop);
        $("#t-again").addEventListener("click", () => { D().stop(); AE.testing = false; AE.playtest(lastMode, true); });
        $("#t-start").addEventListener("click", () => { D().stop(); AE.testing = false; AE.playtest("start"); });
        tog("#t-boxes", on => { D().debug.boxes = on; });
        tog("#t-god", on => { D().debug.invincible = on; });
        $("#t-sound").addEventListener("click", e => { const b = e.currentTarget; b.classList.toggle("off"); D().mute(b.classList.contains("off")); b.innerHTML = AE.icon(b.classList.contains("off") ? "mute" : "sound", 16); b.blur(); $("#game").focus(); });
        // Esc, before the game sees it; the backquote's overlay kept in step with the button
        window.addEventListener("keydown", e => {
            if (!AE.testing) return;
            if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); stop(); }
            else if (e.key === "`") setTimeout(() => $("#t-boxes").classList.toggle("on", D().debug.boxes), 0);
        }, true);
        window.addEventListener("resize", () => { if (AE.testing) fit(); });
        $("#game").addEventListener("pointerdown", () => $("#game").focus());
    };
})();

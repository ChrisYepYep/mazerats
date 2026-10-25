/* Ariadne's Thread level editor: starting up (14 Oct 2026). */
(function () {
    "use strict";
    const AE = window.AE;
    async function boot() {
        const D = window.RatRace && window.RatRace.dev;
        if (!D) { document.getElementById("loading").innerHTML = "<span>The game did not load. Open this from the editor's own server (Ariadne Level Editor.bat).</span>"; return; }
        D.sprites();
        AE.CATALOG.setFramesOf(s => { const sp = D.sprites()[s]; return sp ? sp.r.length : 1; });
        const cv = document.getElementById("view");
        AE.initRender(cv);
        AE.initInput(cv);
        await AE.initUI();
        AE.initTest();
        try {
            await AE.loadIndex();
        } catch (e) {
            document.getElementById("loading").innerHTML = "<span>Could not read the levels (assets/ariadne-levels/index.json).</span>";
            return;
        }
        const ids = AE.S.index.zones.flatMap(z => z.passages);
        let first = ids[0];
        try { const last = localStorage.getItem("ariadne-editor-last"); if (last && ids.includes(last)) first = last; } catch (e) { /* fine */ }
        const want = new URLSearchParams(location.search).get("level");
        if (want && ids.includes(want)) first = want;
        await AE.openLevel(first);
        cv.focus();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();

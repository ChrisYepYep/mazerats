/* The Hallway for walking: the editor's own page and code (publish.js makes play.html from them), with its
   tools left off and the published pictures standing in for its server. Runs before everything else on the
   page, so the editor finds its server's answers without knowing the difference. */
(function () {
    "use strict";
    window.HALLWAY_PLAY = true;
    const realFetch = window.fetch.bind(window);
    const manifest = realFetch("../manifest.json", { cache: "no-cache" }).then(r => r.json());
    const json = o => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
    /* A square with nothing on it: one black pixel, so the page doesn't keep asking */
    let blank = null;
    const blankTile = () => blank || (blank = new Promise(res => { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, 1, 1); c.toBlob(res, "image/png"); }));
    window.fetch = async function (url, opts) {
        const u = typeof url === "string" ? url : url.url;
        if (!u.startsWith("/api/")) return realFetch(url, opts);
        const m = await manifest, q = new URL(u, location.href), p = q.pathname;
        if (p === "/api/map") return realFetch("../map.json", { cache: "no-cache" });
        if (p === "/api/names") return json({ names: [], font: {}, difficulty: {} });
        if (p === "/api/art") return json({ at: 0 });
        if (p === "/api/version") return json({ v: m.version, report: {}, tile: m.tile });
        if (p === "/api/tile") {
            /* The editor's own light, when no time of day is asked for, is daylight here */
            const name = m.tiles[(q.searchParams.get("m") || "day") + "|" + q.searchParams.get("tx") + "," + q.searchParams.get("ty")];
            if (name) return realFetch("../tiles/" + name, opts);
            return new Response(await blankTile(), { status: 200, headers: { "Content-Type": "image/png" } });
        }
        return new Response("", { status: 404 });
    };
    window.hallwayLiftSrc = (way, f) => "../lift/" + encodeURIComponent(way).replace(/%/g, "_") + "-" + f + ".png";
    window.hallwayTell = what => { try { if (parent !== window) parent.postMessage({ hallway: what }, location.origin); } catch (e) { /* on its own, there's nobody to tell */ } };

    /* Its music is on unless it's been turned off; the first click brings it in, as browsers require */
    try { if (localStorage.getItem("hallway-music") === null) localStorage.setItem("hallway-music", "1"); localStorage.setItem("hallway-time", "cycle"); } catch (e) { /* private mode */ }

    /* A few controls of its own, since the editor's are gone */
    function controls() {
        const bar = document.createElement("div"); bar.id = "playBar";
        const add = (label, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.setAttribute("aria-label", title); b.addEventListener("click", fn); bar.appendChild(b); return b; };
        const click = id => { const e = document.getElementById(id); if (e) e.click(); };
        add("Leave", "Back to the archive", () => window.hallwayTell("leave"));
        add("-", "Zoom out", () => click("zoomOut"));
        add("+", "Zoom in", () => click("zoomIn"));
        const music = add("Music", "Music on or off (M)", () => { click("musicBtn"); paintMusic(); });
        const paintMusic = () => { const on = document.getElementById("musicBtn"); music.classList.toggle("is-on", !!on && on.getAttribute("aria-pressed") === "true"); };
        setInterval(paintMusic, 800);
        document.body.appendChild(bar);
    }
    /* Ready once there's something to see, or after a few seconds whatever happens */
    function whenDrawn() {
        const started = performance.now(), v = document.getElementById("view");
        const look = () => {
            let seen = false;
            try { if (v && v.width > 2) { const d = v.getContext("2d").getImageData(v.width >> 1, v.height >> 1, 1, 1).data; seen = d[0] + d[1] + d[2] > 0 && !(d[0] === 11 && d[1] === 12 && d[2] === 15); } } catch (e) { seen = true; }
            if (seen || performance.now() - started > 8000) window.hallwayTell("ready"); else setTimeout(look, 120);
        };
        look();
    }
    addEventListener("DOMContentLoaded", () => { controls(); whenDrawn(); });
})();

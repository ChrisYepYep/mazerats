/* The views tools/sweep.js opens inside a loaded page, one after another,
   each checked (tools/sweep/check.js) and photographed before the next.

   `open` and `close` are the bodies of async functions run in the page, with
   sleep(ms) given; what `open` returns is kept, and a string starting "no "
   is reported as a view that could not be opened (a button renamed, say).
   `keys` are pressed after opening; `settle` is the wait before the check.
   `walk` marks a keyboard walk: Tab pressed through the view, recording
   whether each stop looks any different while it has focus. `needs` names
   the view that has to be open first, for --only. After each view every
   window is shut again (Escape until none is left, and the Console's X),
   except after a view marked `keep`, which the next view builds on. A view
   marked `optional` opens a row the menu may not show (a game switched
   off, Alt Codes on a phone): not finding it is not a fault. Written against the
   archive's own ids (home.html, js/home.js); when one changes, the view
   says "no …" in the summary rather than failing quietly. */
const MENU = name => `
    const sp = document.getElementById("side-spine");
    if (sp && sp.getAttribute("aria-expanded") !== "true") { sp.click(); await sleep(500); }
    const row = [...document.querySelectorAll("#side-menu .side-menu-item")].find(b => b.textContent.trim().startsWith(${JSON.stringify(name)}));
    if (!row) { if (sp && sp.getAttribute("aria-expanded") === "true") sp.click(); return "no menu row ${name}"; }
    row.click(); await sleep(400);
    if (sp && sp.getAttribute("aria-expanded") === "true") sp.click();
    return "ok";`;
const HOME = `const h = document.getElementById("archive-home-btn"); if (h) h.click();`;
const ESC = [["Escape", "Escape", 27]];
const TABS = n => Array(n).fill(["Tab", "Tab", 9]);
/* A top tab, pressed only when it isn't on already: pressing the tab already
   showing its list goes back to the opening view (js/home.js). Then the
   list's first row, waited for. */
const TAB = kind => `const t = document.querySelector('[data-top="${kind}"]'); if (!t) return "no ${kind} tab"; if (t.getAttribute("aria-pressed") !== "true") t.click(); await sleep(300);`;
const FIRST_ROW = `let r = null; for (let i = 0; i < 25 && !r; i++) { r = document.querySelector('#featured-grid .chrome-list-row'); if (!r) await sleep(200); }`;

/* A keyboard walk. Each element Tab lands on is looked at a quarter of a
   second after it gains focus (past short transitions) and again once it has
   lost it; the same look both times is a focus you cannot see. `within` is
   the window the walk should stay inside (a focus trap), or "". */
const WALK_START = within => `window.__sw = []; const W = ${JSON.stringify(within || "")};
    const look = t => { const c = getComputedStyle(t); return [c.outlineStyle === "none" ? "none" : c.outlineStyle + " " + c.outlineWidth + " " + c.outlineColor, c.boxShadow, c.borderColor, c.backgroundColor, c.color, c.textDecorationLine, c.filter, c.transform].join("|"); };
    window.__swLook = look;
    document.addEventListener("focusin", e => { const t = e.target; setTimeout(() => { if (document.activeElement !== t) return; const r = t.getBoundingClientRect(); window.__sw.push({ t, f: look(t), r: [r.x, r.y, r.width, r.height].map(Math.round), inside: W ? !!t.closest(W) : null }); }, 250); }, true);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    return "ok";`;
const WALK_END = `await sleep(300); if (document.activeElement) document.activeElement.blur(); await sleep(300);
    const sel = el => { const p = []; for (let e = el; e && e !== document.body && p.length < 3; e = e.parentElement) { let s = e.tagName.toLowerCase(); if (e.id) { s += "#" + e.id; p.unshift(s); break; } if (e.classList.length) s += "." + [...e.classList].slice(0, 2).join("."); p.unshift(s); } return p.join(">"); };
    const seen = new Set(); const noRing = [], outside = [];
    for (const x of window.__sw || []) { if (seen.has(x.t)) continue; seen.add(x.t);
        if (window.__swLook(x.t) === x.f) noRing.push(sel(x.t) + " '" + (x.t.textContent || x.t.getAttribute("aria-label") || "").trim().slice(0, 24) + "'");
        if (x.inside === false) outside.push(sel(x.t)); }
    return { stops: (window.__sw || []).length, distinct: seen.size, noRing: noRing.slice(0, 20), outside: outside.slice(0, 10) };`;
// `probe` is read after the keys: what the walk found.
const walk = (open, within, n) => ({ open: (open || "") + WALK_START(within), keys: TABS(n), keyGap: 260, walk: true, probe: WALK_END, settle: 400 });

module.exports = {
    load: {},
    /* Run once before every sweep (tools/sweep.js): a write and a beacon from
       inside the page, which must both be stopped. If either reaches the
       server the sweep stops there, before it has loaded anything else. */
    selftest: { noCheck: true, noShot: true, open: `
        let sent = "stopped";
        try { const r = await fetch("/.netlify/functions/sweep-selftest", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); sent = "sent, answered " + r.status; } catch (e) { /* stopped, as it should be */ }
        let beacon = "";
        try { beacon = navigator.sendBeacon("/.netlify/functions/sweep-selftest", "{}") ? "queued" : "refused"; } catch (e) { beacon = "refused"; }
        await sleep(800);
        return { post: sent, beacon };` },
    menu: { open: `document.getElementById("side-spine").click(); return "ok";`, close: `const sp=document.getElementById("side-spine"); if (sp.getAttribute("aria-expanded")==="true") sp.click();` },
    menuFolds: { open: `document.getElementById("side-spine").click(); await sleep(400); document.querySelectorAll("#side-menu .side-menu-group, #side-menu .side-menu-branch-toggle").forEach(b => { if (b.getAttribute("aria-expanded") !== "true") b.click(); }); return document.querySelectorAll("#side-menu .side-menu-item").length;`, close: `const sp=document.getElementById("side-spine"); if (sp.getAttribute("aria-expanded")==="true") sp.click();` },
    mazes: { keep: true, open: `${TAB("mazes")} return "ok";` },
    sortList: { needs: "mazes", open: `const s=document.getElementById("room-sort"); if(!s) return "no sort menu"; s.scrollIntoView({block:"center"}); await sleep(200); s.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0})); await sleep(300); return document.querySelector(".select-list") ? "ok" : "no sort list";`, closeKeys: ESC },
    maze: { keep: true, open: `${TAB("mazes")} ${FIRST_ROW} if (!r) return "no maze row"; r.click(); return r.textContent.trim().slice(0,40);`, settle: 2500 },
    mazeScrolled: { needs: "maze", keep: true, open: `const sc=[...document.querySelectorAll('#room-modal *')].filter(e=>e.scrollHeight>e.clientHeight+5 && /auto|scroll/.test(getComputedStyle(e).overflowY)); sc.forEach(e=>e.scrollTop=99999); const m=document.getElementById('room-modal'); if (m) m.scrollTop=99999; return sc.length;`, settle: 1200 },
    mazeClose: { needs: "maze", closeKeys: ESC, noCheck: true, noShot: true },
    events: { open: `${TAB("events")} return "ok";` },
    event: { open: `${TAB("events")} ${FIRST_ROW} if (!r) return "no event row"; r.click(); return r.textContent.trim().slice(0,40);`, settle: 2500, closeKeys: ESC },
    search: { open: `${HOME} await sleep(400); const i = document.getElementById("opening-search-input"); if (!i) return "no search box"; i.value = "maze"; i.dispatchEvent(new Event("input",{bubbles:true})); const g = document.getElementById("opening-go"); if (g) g.click(); return "ok";`, settle: 1800 },
    searchNone: { open: `${HOME} await sleep(400); const i = document.getElementById("opening-search-input"); if (!i) return "no search box"; i.value = "zzqqxx"; i.dispatchEvent(new Event("input",{bubbles:true})); const g = document.getElementById("opening-go"); if (g) g.click(); return "ok";`, settle: 1800 },
    timeline: { open: `${TAB("mazes")} const b = document.getElementById("timeline-btn"); if (!b) return "no Timeline button"; b.click(); return "ok";`, settle: 1800 },
    furni: { open: `${TAB("mazes")} const b = document.getElementById("furni-btn"); if (!b) return "no Furni button"; b.click(); return "ok";`, settle: 2500 },
    whatsnew: { open: MENU("What's New"), settle: 2000 },
    guides: { open: MENU("Guides"), settle: 2000, closeKeys: ESC },
    /* The Articles window (2 Nov 2026, js/articles.js): its list, and the
       newest article. Opened directly, as the menu's row is for admins only;
       with no article published yet the reader is skipped, not a fault. */
    articles: { open: `if (!window.Articles) return "no Articles window"; Articles.open(); return "ok";`, settle: 1800, closeKeys: ESC },
    article: { optional: true, open: `if (!window.Articles) return "no Articles window"; for (let i = 0; i < 20 && !Articles.loaded(); i++) await sleep(250); const a = Articles.list()[0]; if (!a) return "no published article"; Articles.open(a.id); return String(a.title).slice(0, 40);`, settle: 2200, closeKeys: ESC },
    missing: { open: MENU("Missing Pieces"), settle: 2000 },
    boards: { open: MENU("Leaderboards"), settle: 2000, closeKeys: ESC },
    profile: { open: MENU("Your Profile"), settle: 2000, closeKeys: ESC },
    guess: { open: MENU("Guess the Maze"), settle: 2500, closeKeys: ESC },
    odd: { open: MENU("Odd One Out"), settle: 2500, closeKeys: ESC },
    pura: { optional: true, open: MENU("Pura Panic"), settle: 2500, closeKeys: ESC },
    altcodes: { optional: true, open: MENU("Alt Codes"), settle: 1500, closeKeys: ESC },
    console: { keep: true, open: `const b = document.getElementById("header-console-btn"); if (!b) return "no Console button"; b.click(); return "ok";`, settle: 1500 },
    cProfile: { needs: "console", keep: true, open: `document.getElementById("profile-btn").click(); return "ok";`, settle: 1500 },
    cEdit: { needs: "console", keep: true, open: `document.getElementById("profile-btn").click(); await sleep(600); const b=[...document.querySelectorAll('#console-modal button')].find(b=>/edit profile/i.test(b.textContent)); if(!b) return 'no Edit Profile button'; b.click(); return 'ok';`, settle: 1800 },
    cContact: { needs: "console", keep: true, open: `document.getElementById("contact-btn").click(); return "ok";`, settle: 1500 },
    cContactForm: { needs: "console", keep: true, open: `document.getElementById("contact-btn").click(); await sleep(500); const b=[...document.querySelectorAll('#console-modal button')].find(b=>/add maze info|add info|tell us/i.test(b.textContent)); if(!b) return 'no Add Maze Info button'; b.click(); return 'ok';`, settle: 1200 },
    cPeople: { needs: "console", keep: true, open: `document.getElementById("people-btn").click(); return "ok";`, settle: 1500 },
    cPrivacy: { needs: "console", keep: true, open: `document.getElementById("privacy-btn").click(); return "ok";`, settle: 1500 },
    cClose: { needs: "console", open: `const b=document.getElementById("console-close-btn"); if (b) b.click(); return "ok";`, noCheck: true, noShot: true },
    advent: { keep: true, open: `const b=document.querySelector('.xa-open-btn'); if(!b) return 'no advent button'; b.click(); await sleep(1500); return document.querySelectorAll('.xa-tile').length;`, settle: 1500 },
    adventDoor: { needs: "advent", open: `const t=document.querySelector('.xa-tile:not(.is-locked)'); if(!t) return 'no open door'; t.click(); return 'ok';`, settle: 1500, closeKeys: ESC },
    // The maintenance drop-down: settings answered inside the page and a poll set off. Nothing is sent.
    mw: { open: `const kickAt = new Date(Date.now() + 100000).toISOString(); const real = window.fetch; window.fetch = function (url, init) { const u = String(url); const ok = b => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } })); if (u.includes("functions/settings")) return ok({ landingState: "maintenance", maintenanceKickAt: kickAt }); if (u.includes("functions/presence")) return ok({ ok: true, kickAt }); return real.apply(this, arguments); }; navigator.sendBeacon = () => true; document.dispatchEvent(new Event("visibilitychange")); return "ok";`, settle: 3500 },
    pagebottom: { open: `window.scrollTo(0, 99999); return "ok";`, close: `window.scrollTo(0, 0);` },
    tabHome: walk("", "", 60),
    tabMenu: walk(`const sp = document.getElementById("side-spine"); if (!sp) return "no menu"; sp.focus(); sp.click(); await sleep(600); `, "", 25),
    tabMaze: Object.assign(walk(`${TAB("mazes")} ${FIRST_ROW} if (!r) return "no maze row"; r.click(); await sleep(2500); `, "#room-modal", 40), { closeKeys: ESC }),
    tabConsole: Object.assign(walk(`document.getElementById("header-console-btn").click(); await sleep(1200); document.getElementById("contact-btn").click(); await sleep(800); `, "#console-modal", 30), { close: `const b=document.getElementById("console-close-btn"); if (b) b.click();` }),
    tabGuides: Object.assign(walk(MENU("Guides").replace('return "ok";', "") + `await sleep(1500); `, "#guides-window", 25), { closeKeys: ESC })
};

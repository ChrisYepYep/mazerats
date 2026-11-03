#!/usr/bin/env node
/* The pre-deploy visual sweep, as one command (2 Nov 2026, the owner's).

   Opens every page of the site in a hidden Edge, at every size and in every
   look, opens each window and view on /home in turn, and checks each one for
   the faults that have reached the live site before:
     - the page wider than the screen (sideways scrolling);
     - text cut off by its box;
     - text under 4.5:1 against what is actually behind it, measured from
       the pixels (3:1 for large text);
     - drop-downs whose closed text or options can't be read;
     - pictures with no alt, controls with no name;
     - keyboard focus you cannot see, or that escapes an open window;
     - script errors, and views that would not open.
   It writes a contact sheet (PNG) and a short summary to a folder outside
   the site, and prints the summary.

   HOW TO RUN IT, in PowerShell, with the dev server running (the Maze Rats
   Dev Server shortcut, http://localhost:8888):

       cd C:\Users\cjboy\Pictures\Screenshots\Habbo\MazeRatsWebsite; node tools\sweep.js --quick

   About ten minutes; the whole sweep (no --quick), every look at every
   size, takes an hour or more. Options:
       --quick           a computer and a phone, in the looks most visitors see
       --only=<names>    one page or view, or several with commas: home,
                         landing, maintenance, wizard, privacy, notfound,
                         deepmaze, deepevent, keys, signed, advent, or a view
                         such as maze, console, guides, whatsnew
       --sizes=1440,390  only these sizes (1440, 1024, 768, 414, 390, 360, 844x390)
       --url=<address>   another copy of the site (default http://localhost:8888)
       --out=<folder>    where the results go (default a new folder under %TEMP%\mazerats-sweep)
       --workers=<n>     pages measured at once (default 3)
       --port=<n>        Edge's debugging port (default 9410)
   Exits 0 when nothing was found, 1 when something was, 2 when it couldn't run.

   SAFE AGAINST THE LIVE DATABASE. `netlify dev` at :8888 talks to the live
   MongoDB, so every request that is not a read (POST, PUT, PATCH, DELETE,
   beacons: presence, tracking, error reports, game moves) is failed in the
   browser before it is sent, and counted in the summary. The functions'
   reads are made once per run and shared between pages; the analytics
   script is not loaded at all. Signed-in views (Edit Profile, the advent
   calendar) are faked inside the browser: no account is used.

   ITS OWN BROWSER. A fresh Edge profile in %TEMP% for each run, deleted
   after, and only the Edge processes started with that profile are closed
   at the end (never by name: the owner's own Edge stays as it is).

   NOT PUBLISHED: tools/ is not in tools/build-dist.js's PUBLIC list, and the
   results never go inside this folder (anything at the root would be in the
   next deploy's reach). Built from the 1 Nov night scan's harness. */
"use strict";
const { spawn, execFileSync } = require("child_process");
const path = require("path"), fs = require("fs"), os = require("os");
const { decodePng } = require("./png-decode.js");
const STEPS = require("./sweep/steps.js");
const JOBS = require("./sweep/jobs.js");

const ROOT = path.resolve(__dirname, "..");
const CHECK = fs.readFileSync(path.join(__dirname, "sweep", "check.js"), "utf8");

// ---- The command line.
const args = {};
for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) { console.error(`sweep: don't know "${a}". Try --quick, --only=maze, --sizes=1440,390, --url=, --out=.`); process.exit(2); }
    args[m[1]] = m[2] === undefined ? true : m[2];
}
if (args.help || args.h) { console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n\/\* ?/, "")); process.exit(0); }
const BASE = String(args.url || "http://localhost:8888").replace(/\/+$/, "");
const ORIGIN = new URL(BASE).origin;
const PORT = +(args.port || 9410);
const WORKERS = Math.max(1, Math.min(6, +(args.workers || 3)));
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const OUT = path.resolve(args.out || path.join(os.tmpdir(), "mazerats-sweep", stamp));
const rel = path.relative(ROOT, OUT);
if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    console.error(`sweep: the results can't go inside the site's folder (${OUT}). Leave out --out, or choose a folder elsewhere.`);
    process.exit(2);
}
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const EDGE = args.edge || ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(p => fs.existsSync(p));
if (!EDGE) { console.error("sweep: Microsoft Edge wasn't found. Give its msedge.exe with --edge=<path>."); process.exit(2); }

let jobs = JOBS.build({ quick: !!args.quick, sizes: args.sizes ? String(args.sizes).split(",") : null });
try { jobs = JOBS.only(jobs, args.only ? String(args.only).split(",").map(s => s.trim()).filter(Boolean) : null, STEPS); }
catch (e) { console.error("sweep: " + e.message); process.exit(2); }
if (!jobs.length) { console.error("sweep: nothing to do with those options."); process.exit(2); }

// ---- Its own Edge, and closing only that one.
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "mazerats-sweep-edge-"));
let edge = null;
function closeEdge() {
    try { if (edge) edge.kill(); } catch (e) { /* gone */ }
    /* Every Edge process whose command line names this run's profile, and no
       other. $PID is the PowerShell doing the closing (its own command line
       holds the profile's name too), and this node is left out as well. */
    const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${path.basename(PROFILE)}') -and $_.ProcessId -ne $PID -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    try { execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "ignore", timeout: 30000 }); } catch (e) { /* nothing left */ }
    for (let i = 0; i < 5; i++) { try { fs.rmSync(PROFILE, { recursive: true, force: true }); break; } catch (e) { /* still closing */ } }
}
let stopping = false;
process.on("SIGINT", () => { if (stopping) return; stopping = true; console.log("\nsweep: stopped. Closing its Edge."); closeEdge(); process.exit(2); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lumOf = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const A = lumOf(a), B = lumOf(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };

// ---- The browser connection: one socket, a session per page (flattened).
let ws = null, nextId = 0;
const waiting = new Map();
const listeners = new Map();     // sessionId -> handler(method, params)
function send(method, params = {}, sessionId) {
    return new Promise((resolve) => {
        const id = ++nextId;
        waiting.set(id, resolve);
        ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
}
async function connect() {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch (e) { await sleep(250); } }
    if (!ver) throw new Error(`Edge didn't open its debugging port ${PORT}. Is another sweep running? Try --port=9411.`);
    ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
    ws.addEventListener("message", m => {
        const d = JSON.parse(m.data);
        if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); return; }
        if (d.sessionId && listeners.has(d.sessionId)) listeners.get(d.sessionId)(d.method, d.params);
    });
}

// ---- The functions' reads: once per run, shared. Never anything but a GET.
const fnCache = new Map();
const keyOf = u => u.replace(/([?&])(fresh|_)=\d+&?/g, "$1").replace(/[?&]$/, "");
function fnRead(url) {
    const k = keyOf(url);
    if (!fnCache.has(k)) {
        fnCache.set(k, (async () => {
            const r = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
            return { status: r.status, type: r.headers.get("content-type") || "application/json", body: Buffer.from(await r.arrayBuffer()) };
        })().catch(e => { fnCache.delete(k); throw e; }));
    }
    return fnCache.get(k);
}
const FAKE_ME = { player: { id: "100000000000000001", name: "Sweep", username: "sweep", avatar: null, nick: "Sweep Rat", displayName: "Sweep Rat", nickAsked: true, nickLocked: false, nickHabbo: false, nickRejected: false, nickRefused: false }, ban: null, publicId: "sweep1" };
const blocked = new Map();       // "METHOD url" -> count

// ---- One job: a fresh browser context, its page, its views.
async function runJob(job) {
    const res = { name: job.name, kind: job.kind, size: job.size, mode: job.mode, dark: job.dark, views: [], errors: [] };
    const { result: ctx } = await send("Target.createBrowserContext", { disposeOnDetach: true });
    const contextId = ctx.browserContextId;
    let sessionId = null;
    try {
        const { result: tgt } = await send("Target.createTarget", { url: "about:blank", browserContextId: contextId });
        const { result: att } = await send("Target.attachToTarget", { targetId: tgt.targetId, flatten: true });
        sessionId = att.sessionId;
        const S = (m, p) => send(m, p, sessionId);
        const errors = [];
        listeners.set(sessionId, async (method, p) => {
            if (method === "Fetch.requestPaused") {
                const req = p.request, rid = p.requestId;
                try {
                    if (!/^(GET|HEAD)$/.test(req.method)) {
                        const k = req.method + " " + req.url.split("?")[0].replace(ORIGIN, "");
                        blocked.set(k, (blocked.get(k) || 0) + 1);
                        return await S("Fetch.failRequest", { requestId: rid, errorReason: "BlockedByClient" });
                    }
                    if (/umami\.is/.test(req.url)) return await S("Fetch.failRequest", { requestId: rid, errorReason: "BlockedByClient" });
                    if (req.url.startsWith(ORIGIN + "/.netlify/functions/")) {
                        const fulfil = (status, type, body) => S("Fetch.fulfillRequest", { requestId: rid, responseCode: status, responseHeaders: [{ name: "Content-Type", value: type }, { name: "Cache-Control", value: "no-store" }], body: Buffer.from(body).toString("base64") });
                        const fk = job.fakes && Object.keys(job.fakes).find(k => req.url.includes(k));
                        if (fk) return await fulfil(200, "application/json", JSON.stringify(job.fakes[fk]));
                        if (job.signedIn) {
                            if (/discord-auth\?action=me/.test(req.url)) return await fulfil(200, "application/json", JSON.stringify(FAKE_ME));
                            if (/functions\/player-data(\?|$)/.test(req.url)) return await fulfil(200, "application/json", JSON.stringify({ walked: ["the-little-maze"], saved: [] }));
                            if (/profiles\?me=1/.test(req.url)) return await fulfil(200, "application/json", JSON.stringify({ since: "2026-10", hidden: false, favourite: "", badge: "", habboLinked: true, nick: "Sweep Rat", walked: 1 }));
                        }
                        const c = await fnRead(req.url);
                        let body = c.body;
                        if (/functions\/settings/.test(req.url) && job.patch && Object.keys(job.patch).length) {
                            try { body = Buffer.from(JSON.stringify(Object.assign(JSON.parse(body.toString()), job.patch))); } catch (e) { /* not JSON: as it came */ }
                        }
                        return await fulfil(c.status, c.type, body);
                    }
                    await S("Fetch.continueRequest", { requestId: rid });
                } catch (e) {
                    S("Fetch.failRequest", { requestId: rid, errorReason: "Failed" }).catch(() => {});
                }
            }
            if (method === "Runtime.exceptionThrown") errors.push(p.exceptionDetails.exception && p.exceptionDetails.exception.description ? p.exceptionDetails.exception.description.split("\n")[0] : p.exceptionDetails.text);
            if (method === "Runtime.consoleAPICalled" && p.type === "error") {
                const line = p.args.map(a => a.value || a.description || "").join(" ").slice(0, 200);
                if (!/ERR_BLOCKED_BY_CLIENT|Failed to fetch|NetworkError|BlockedByClient|sendBeacon/i.test(line)) errors.push("console: " + line);
            }
        });
        await S("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
        await S("Network.enable");
        // The offline archive's service worker would answer requests out of sight of the check above.
        await S("Network.setBypassServiceWorker", { bypass: true });
        await S("Runtime.enable");
        await S("Page.enable");
        await S("Emulation.setFocusEmulationEnabled", { enabled: true });
        await S("Emulation.setDeviceMetricsOverride", { width: job.w, height: job.h, deviceScaleFactor: 1, mobile: !!job.mobile });
        await S("Emulation.setTouchEmulationEnabled", { enabled: !!job.mobile, maxTouchPoints: job.mobile ? 5 : 1 });
        let pre = `try{localStorage.setItem('mazerats_landing_state','enter');localStorage.setItem('mazerats_dark',${job.dark ? "'1'" : "'0'"});}catch(e){}`;
        if (job.date) {
            const off = Date.parse(job.date) - Date.now();
            pre += `;(function(){var O=${off},D=Date;function N(){if(!(this instanceof N))return new D(D.now()+O).toString();var a=[].slice.call(arguments);return a.length?new (Function.prototype.bind.apply(D,[null].concat(a)))():new D(D.now()+O);}N.prototype=D.prototype;N.now=function(){return D.now()+O};N.UTC=D.UTC;N.parse=D.parse;window.Date=N;})();`;
        }
        await S("Page.addScriptToEvaluateOnNewDocument", { source: pre });
        const evalIn = async (expr) => {
            const r = await S("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, timeout: 60000 });
            if (!r.result) return "no answer";
            return r.result.exceptionDetails ? "no: " + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text).split("\n")[0] : r.result.result.value;
        };
        const key = async (k, code, kc) => { await S("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: code || k, windowsVirtualKeyCode: kc }); await S("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: code || k, windowsVirtualKeyCode: kc }); };
        await S("Page.navigate", { url: BASE + job.path });
        await sleep(job.wait || 6000);
        for (const name of job.views) {
            const st = STEPS[name];
            const v = { view: name, problems: [] };
            const flag = (type, msg, extra) => v.problems.push(Object.assign({ type, msg }, extra));
            if (st.open) {
                v.open = await evalIn(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); ${st.open} })()`);
                if (typeof v.open === "string" && /^no[ :]/.test(v.open)) {
                    // A row the menu doesn't show today (a game switched off): nothing to look at, nothing wrong.
                    // Or no article published yet (2 Nov 2026, the article view).
                    if (st.optional && /^no (menu row|published article)/.test(v.open)) { v.skipped = true; res.views.push(v); continue; }
                    flag("VIEW", `${name} didn't open: ${v.open.replace(/^no:? ?/, "").slice(0, 120)}`);
                }
            }
            for (const k of st.keys || []) { await key(k[0], k[1], k[2]); if (st.keyGap) await sleep(st.keyGap); }
            await sleep(st.settle || 1200);
            if (!st.noCheck && !st.walk) {
                const c = await evalIn(`(() => { ${CHECK} })()`);
                if (c && typeof c === "object") {
                    if (c.scrollW > c.W + 1) flag("OVERFLOW", `page ${c.scrollW - c.W}px wider than the screen` + (c.wide.length ? ": " + c.wide.slice(0, 3).join("; ") : ""));
                    for (const x of c.clipped) flag("CLIPPED", x);
                    for (const s of c.selects) {
                        if (s.closed !== null && s.closed < 4.5) flag("SELECT", `${s.sel} closed ${s.closed}:1 (${s.colours})`);
                        if (s.opt !== null && s.opt < 4.5) flag("OPTION", `${s.sel} options ${s.opt}:1 (${s.optColours})`);
                    }
                    for (const x of c.noAlt) flag("NO-ALT", x);
                    for (const x of c.unlabelled) flag("UNLABELLED", x);
                    // Contrast from the pixels: the texts made see-through, one shot, the ground under each.
                    if (c.texts.length) {
                        await evalIn(`(() => { const s = document.createElement("style"); s.id = "sweep-hide"; s.textContent = "[data-sweep-c], [data-sweep-c] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; caret-color: transparent !important; } *, *::before, *::after { transition: none !important; animation-play-state: paused !important; }"; document.head.appendChild(s); return 1; })()`);
                        await sleep(120);
                        const shot = await S("Page.captureScreenshot", { format: "png" });
                        await evalIn(`(() => { const s = document.getElementById("sweep-hide"); if (s) s.remove(); return 1; })()`);
                        if (shot.result) {
                            const img = decodePng(Buffer.from(shot.result.data, "base64"));
                            const sc = img.w / job.w;
                            for (const t of c.texts) {
                                const [x, y, w, h] = t.box; if (w < 2 || h < 2) continue;
                                const X0 = Math.max(0, Math.floor(x * sc)), Y0 = Math.max(0, Math.floor(y * sc)), X1 = Math.min(img.w, Math.ceil((x + w) * sc)), Y1 = Math.min(img.h, Math.ceil((y + h) * sc));
                                if (X1 <= X0 || Y1 <= Y0) continue;
                                const step = Math.max(1, Math.floor(Math.sqrt((X1 - X0) * (Y1 - Y0) / 400)));
                                const px = [], buckets = new Map();
                                for (let yy = Y0; yy < Y1; yy += step) for (let xx = X0; xx < X1; xx += step) {
                                    const o = (yy * img.w + xx) * 4, p = [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]];
                                    px.push(p);
                                    const bk = (p[0] >> 4) + "," + (p[1] >> 4) + "," + (p[2] >> 4);
                                    const b = buckets.get(bk); if (b) b.n++; else buckets.set(bk, { n: 1, p });
                                }
                                px.sort((a, b) => lumOf(a) - lumOf(b));
                                const median = px[px.length >> 1];
                                let mode = null; for (const b of buckets.values()) if (!mode || b.n > mode.n) mode = b;
                                const big = t.size >= 24 || (t.size >= 18.66 && t.weight >= 700);
                                const need = big ? 3 : 4.5;
                                // Both the commonest colour behind it and the middle one: one alone is fooled by a picture.
                                const r = Math.max(ratio(t.fg, median), ratio(t.fg, mode.p));
                                if (r < need) flag("CONTRAST", `${t.sel} '${t.text}' ${r.toFixed(2)}:1, needs ${need} (text rgb(${t.fg}) on about rgb(${mode.p}), ${t.size}px${t.shadow ? ", has a text shadow that may help" : ""})`,
                                    { ratio: +r.toFixed(2), fg: t.fg.join(","), bg: mode.p.map(x => x >> 3 << 3).join(","), text: t.text, sel: t.sel });
                            }
                        }
                    }
                } else if (c) flag("VIEW", `${name}: the check didn't run (${String(c).slice(0, 100)})`);
            }
            if (st.walk) {
                const w = await evalIn(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); ${st.probe} })()`);
                if (w && typeof w === "object") {
                    for (const x of w.noRing) flag("FOCUS", `no visible focus on ${x}`);
                    for (const x of w.outside) flag("FOCUS-TRAP", `Tab left the open window for ${x}`);
                    if (!w.stops) flag("FOCUS", `${name}: Tab reached nothing`);
                    v.walk = { stops: w.stops, distinct: w.distinct };
                }
            }
            if (!st.noShot) {
                const shot = await S("Page.captureScreenshot", { format: "jpeg", quality: 70 });
                if (shot.result) { v.shot = `${job.name}--${name}.jpg`; fs.writeFileSync(path.join(SHOTS, v.shot), Buffer.from(shot.result.data, "base64")); }
            }
            if (st.close) await evalIn(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); ${st.close} })()`);
            for (const k of st.closeKeys || []) { await key(k[0], k[1], k[2]); await sleep(300); }
            if (st.close || st.closeKeys) await sleep(700);
            /* Every window shut before the next view, unless the next one builds
               on this (steps.js, keep): Escape closes the top one at a time
               (the archive's Escape layers, js/site.js), and the Console has
               its own X. A layer that acts on Escape stops it at the window, so
               an Escape that reaches the document found nothing left to shut. */
            if (!st.keep && name !== "load") {
                for (let i = 0; i < 6; i++) {
                    await evalIn(`(() => { if (!window.__swEsc) { window.__swEsc = 1; document.addEventListener("keydown", e => { if (e.key === "Escape") window.__swEscSeen = true; }, true); } window.__swEscSeen = false; return 1; })()`);
                    await key("Escape", "Escape", 27);
                    await sleep(350);
                    if (await evalIn(`window.__swEscSeen === true`) === true) break;
                }
                await evalIn(`(() => { const c = document.getElementById("console-close-btn"); const m = document.getElementById("console-modal"); if (c && m && m.getBoundingClientRect().width && getComputedStyle(m).display !== "none" && getComputedStyle(m).visibility !== "hidden") c.click(); return 1; })()`);
                await sleep(300);
            }
            res.views.push(v);
        }
        res.errors = [...new Set(errors)].slice(0, 8);
    } finally {
        if (sessionId) listeners.delete(sessionId);
        await send("Target.disposeBrowserContext", { browserContextId: contextId }).catch(() => {});
    }
    return res;
}
// ---- The contact sheet: each page as it loads, then every view something was found in.
async function contactSheet(results) {
    const cells = [];
    const seen = new Set();
    for (const r of results) {
        const first = r.views.find(v => v.shot);
        if (first) { cells.push({ label: r.name, sub: first.view, n: r.views.reduce((s, v) => s + v.problems.length, 0) + r.errors.length, file: first.shot, w: r.size }); seen.add(first.shot); }
    }
    for (const r of results) for (const v of r.views) {
        if (!v.shot || seen.has(v.shot) || !v.problems.length) continue;
        if (cells.length >= 160) break;
        cells.push({ label: r.name, sub: v.view + ": " + v.problems[0].type.toLowerCase() + " " + v.problems[0].msg.slice(0, 60), n: v.problems.length, file: v.shot, bad: true });
        seen.add(v.shot);
    }
    const CW = 240, COLS = 7, PER = 42;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const files = [];
    for (let p = 0; p * PER < cells.length; p++) {
        const part = cells.slice(p * PER, (p + 1) * PER);
        const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#16181c;font:12px/1.35 Segoe UI,sans-serif;color:#ddd">
<div style="padding:10px 12px;font-size:14px;color:#f2cc4e">Maze Rats sweep ${esc(stamp)} &middot; ${esc(BASE)} &middot; sheet ${p + 1} of ${Math.ceil(cells.length / PER)}</div>
<div style="display:grid;grid-template-columns:repeat(${COLS},${CW}px);gap:10px;padding:0 12px 12px;align-items:start">${part.map(c => `<figure style="margin:0;background:#1f2228;border:1px solid ${c.n ? "#ff6a5f" : "#363b44"};border-radius:6px;overflow:hidden">
<img src="shots/${esc(c.file)}" style="display:block;width:${CW}px;max-height:${CW * 1.6}px;object-fit:cover;object-position:top">
<figcaption style="padding:5px 7px"><b>${esc(c.label)}</b><br><span style="color:${c.bad ? "#ffb347" : "#9a968c"}">${esc(c.sub)}</span>${c.n ? `<br><span style="color:#ff6a5f">${c.n} found</span>` : ""}</figcaption></figure>`).join("")}</div></body>`;
        const page = path.join(OUT, `contact-${p + 1}.html`);
        fs.writeFileSync(page, html);
        const { result: ctx } = await send("Target.createBrowserContext", { disposeOnDetach: true });
        const { result: tgt } = await send("Target.createTarget", { url: "about:blank", browserContextId: ctx.browserContextId });
        const { result: att } = await send("Target.attachToTarget", { targetId: tgt.targetId, flatten: true });
        const S = (m, q) => send(m, q, att.sessionId);
        const PW = COLS * (CW + 10) + 14;
        await S("Page.enable");
        await S("Emulation.setDeviceMetricsOverride", { width: PW, height: 800, deviceScaleFactor: 1, mobile: false });
        await S("Page.navigate", { url: "file:///" + page.replace(/\\/g, "/") });
        await sleep(1500);
        const r = await S("Runtime.evaluate", { expression: "document.body.scrollHeight", returnByValue: true });
        const H = Math.min(16000, r.result.result.value);
        const shot = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: PW, height: H, scale: 1 } });
        const file = path.join(OUT, cells.length > PER ? `contact-${p + 1}.png` : "contact.png");
        fs.writeFileSync(file, Buffer.from(shot.result.data, "base64"));
        fs.unlinkSync(page);
        files.push(file);
        await send("Target.disposeBrowserContext", { browserContextId: ctx.browserContextId }).catch(() => {});
    }
    return files;
}

/* ---- The summary: each fault once, with how often and where. Faint text is
   grouped by its colours rather than by element: one pale grey on one panel
   is one thing to fix, however many labels wear it. The first SHORT groups
   go in summary.txt; every one is in found.txt. */
const SHORT = 30;
function summarise(results, minutes, sheets, selftest) {
    const groups = new Map();
    const note = (p, where) => {
        let k, msg = p.msg;
        if (p.type === "CONTRAST" && p.fg) k = `CONTRAST ${p.fg}|${p.bg}|${p.ratio.toFixed(1)}`;
        // Pictures by where they sit, not one by one: an article's pictures are one fix.
        else if (p.type === "NO-ALT") { k = "NO-ALT " + msg.split(" ")[0]; p = Object.assign({}, p, { text: msg.split(" ").slice(1).join(" ") }); }
        else k = p.type + " " + msg;
        const g = groups.get(k) || { type: p.type, msg, where: [], worst: null, texts: new Set(), sels: new Set(), p };
        if (!g.where.includes(where)) g.where.push(where);
        if (p.text) g.texts.add(p.text);
        if (p.sel) g.sels.add(p.sel.split(">").pop());
        if (typeof p.ratio === "number" && (g.worst === null || p.ratio < g.worst)) { g.worst = p.ratio; g.p = p; }
        groups.set(k, g);
    };
    let views = 0;
    for (const r of results) {
        for (const e of r.errors) note({ type: "SCRIPT", msg: e.slice(0, 160) }, r.name);
        for (const v of r.views) { if (!v.skipped) views++; for (const p of v.problems) note(p, r.name + " › " + v.view); }
    }
    for (const g of groups.values()) {
        if (g.type === "NO-ALT") { g.msg = `${g.msg.split(" ")[0]}: ${g.texts.size} picture${g.texts.size === 1 ? "" : "s"} with no alt, such as ${[...g.texts].slice(0, 3).join(", ")}`; continue; }
        if (g.type !== "CONTRAST" || !g.p.fg) continue;
        const texts = [...g.texts].slice(0, 4).map(t => `'${t}'`).join(", ");
        g.msg = `${g.worst}:1, needs ${g.p.msg.match(/needs ([\d.]+)/)[1]}: text rgb(${g.p.fg}) on about rgb(${g.p.bg}), ${g.texts.size} text${g.texts.size === 1 ? "" : "s"} such as ${texts} (${[...g.sels].slice(0, 3).join(", ")})`;
    }
    const ORDER = ["VIEW", "SCRIPT", "OVERFLOW", "CLIPPED", "CONTRAST", "SELECT", "OPTION", "FOCUS", "FOCUS-TRAP", "NO-ALT", "UNLABELLED"];
    const WORDS = { VIEW: "views that didn't open", SCRIPT: "script errors", OVERFLOW: "sideways scrolling", CLIPPED: "text cut off", CONTRAST: "text too faint (from the pixels)", SELECT: "drop-downs hard to read", OPTION: "drop-down options hard to read", FOCUS: "keyboard focus you can't see", "FOCUS-TRAP": "focus escaping an open window", "NO-ALT": "pictures with no alt", UNLABELLED: "controls with no name" };
    // Faults that stop a view first, then by how widespread.
    const sorted = [...groups.values()].sort((a, b) => (a.type === "VIEW" || a.type === "SCRIPT" ? 0 : 1) - (b.type === "VIEW" || b.type === "SCRIPT" ? 0 : 1)
        || b.where.length - a.where.length || ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
    const writes = [...blocked.entries()].filter(([k]) => !k.includes("sweep-selftest")).reduce((s, [, n]) => s + n, 0);
    const head = [
        `Maze Rats visual sweep, ${new Date().toLocaleString("en-GB")}, ${BASE}${args.quick ? " (quick)" : ""}${args.only ? ", only " + args.only : ""}${args.sizes ? ", sizes " + args.sizes : ""}`,
        `${results.length} page loads, ${views} views, ${minutes} minute${minutes === 1 ? "" : "s"}. Writes: ${writes} stopped in the browser, none sent (the self-test's ${selftest} were stopped too).`,
        ""
    ];
    const block = g => {
        const jobsHit = new Set(g.where.map(w => w.split(" › ")[0])).size;
        return [`  ${g.type.padEnd(10)} ${g.msg}`, `  ${"".padEnd(10)} in ${g.where.length} view${g.where.length === 1 ? "" : "s"} on ${jobsHit} page load${jobsHit === 1 ? "" : "s"}, e.g. ${g.where.slice(0, 3).join(", ")}`];
    };
    const tail = [];
    const clean = ORDER.filter(t => !sorted.some(g => g.type === t)).map(t => WORDS[t]);
    if (clean.length) tail.push("", "CLEAN: " + clean.join(", ") + ".");
    tail.push("", "Contact sheet: " + sheets.join(", "), "Everything found: " + path.join(OUT, "found.txt"), "Every view's numbers: " + path.join(OUT, "results.json") + "; every picture in " + SHOTS);
    if (writes) {
        tail.push("", "Writes stopped (times, method and address):");
        for (const [k, n] of [...blocked.entries()].filter(([k]) => !k.includes("sweep-selftest")).sort((a, b) => b[1] - a[1]).slice(0, 12)) tail.push(`  ${n}x ${k}`);
    }
    const found = sorted.length ? [`FOUND (${sorted.length}):`].concat(...sorted.map(block)) : ["NOTHING FOUND."];
    const short = sorted.length > SHORT ? [`FOUND (${sorted.length}; the ${SHORT} most widespread here, the rest in found.txt):`].concat(...sorted.slice(0, SHORT).map(block)) : found;
    return { text: head.concat(short, tail).join("\n") + "\n", full: head.concat(found, tail).join("\n") + "\n", found: sorted.length };
}

(async () => {
    // The dev server has to be there first.
    try { const r = await fetch(BASE + "/home", { method: "GET" }); if (!r.ok) throw new Error(String(r.status)); }
    catch (e) { console.error(`sweep: nothing answered at ${BASE}. Start the dev server first (the Maze Rats Dev Server shortcut), or give --url=.`); fs.rmSync(PROFILE, { recursive: true, force: true }); process.exit(2); }
    edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
        "--force-color-profile=srgb", "--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--disable-extensions", "about:blank"], { stdio: "ignore" });
    const t0 = Date.now();
    console.log(`sweep: ${jobs.length} page loads, ${WORKERS} at a time, against ${BASE}. Results in ${OUT}`);
    await connect();
    /* The self-test (steps.js, selftest): a POST and a beacon from inside a
       page must both be stopped here, or nothing else is loaded. */
    const st = await runJob({ name: "selftest", kind: "selftest", size: "1440", w: 1440, h: 900, mobile: false, dark: false, patch: {}, path: "/privacy", views: ["selftest"], wait: 3000 });
    const said = st.views[0] && st.views[0].open;
    const caught = blocked.get("POST /.netlify/functions/sweep-selftest") || 0;
    if (!said || said.post !== "stopped" || caught < 2) {
        console.error(`sweep: the self-test's write was not stopped (page says ${JSON.stringify(said)}, ${caught} of 2 caught). Nothing else was loaded.`);
        closeEdge();
        process.exit(2);
    }
    console.log("  self-test: a write and a beacon from the page were both stopped.");
    const results = new Array(jobs.length);
    let next = 0, done = 0;
    const worker = async () => {
        while (!stopping) {
            const i = next++;
            if (i >= jobs.length) return;
            const job = jobs[i];
            let r;
            try { r = await runJob(job); }
            catch (e) { r = { name: job.name, kind: job.kind, size: job.size, views: [], errors: ["the sweep itself failed here: " + (e && e.message || e)] }; }
            results[i] = r;
            done++;
            const n = r.views.reduce((s, v) => s + v.problems.length, 0) + r.errors.length;
            console.log(`  ${String(done).padStart(3)}/${jobs.length} ${job.name.padEnd(36)} ${n ? n + " found" : "ok"}`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(WORKERS, jobs.length) }, worker));
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), options: args, blocked: Object.fromEntries(blocked), results }, null, 1));
    let sheets = [];
    try { sheets = await contactSheet(results); } catch (e) { console.error("sweep: the contact sheet failed: " + e.message); }
    const sum = summarise(results, Math.round((Date.now() - t0) / 60000), sheets, caught);
    fs.writeFileSync(path.join(OUT, "summary.txt"), sum.text);
    fs.writeFileSync(path.join(OUT, "found.txt"), sum.full);
    try { ws.close(); } catch (e) { /* closed */ }
    closeEdge();
    console.log("\n" + sum.text);
    console.log("Summary: " + path.join(OUT, "summary.txt"));
    process.exit(sum.found ? 1 : 0);
})().catch(e => { console.error("sweep: " + (e && e.stack || e)); closeEdge(); process.exit(2); });

/* The Warren's Speed card (warren.html, Controls › Tools, #speed-card).

   2 Nov 2026, the owner's: how fast the live site loads on a typical phone,
   measured weekly, with a trend. Google's PageSpeed Insights loads the
   landing page and /home on an emulated mid-range phone over slow 4G every
   Monday morning (netlify/functions/speed-measure.js, on a schedule) and
   the numbers are kept in speed_runs; this card reads them from
   /.netlify/functions/speed-checks and says them in plain words, coloured
   against Google's own lines for good and poor, with the last twelve weeks
   drawn small underneath.

   Measure now leaves a request the scheduled function picks up within five
   minutes (a PageSpeed run outlasts a page request's ten seconds; see
   speed-checks.js), and the card asks again every twenty seconds until the
   numbers are in. Viewers see the numbers and no button. */
(function () {
    "use strict";

    const URL_ = "/.netlify/functions/speed-checks";
    const POLL_MS = 20000;
    const POLL_FOR_MS = 15 * 60 * 1000;
    const WEEKS = 12;

    /* Google's lines (web.dev's Core Web Vitals, and Lighthouse's own for the
       rest): at or under the first is good, over the second is poor. The
       score is the other way up. */
    const METRICS = [
        { k: "lcp", name: "Main content shown", what: "When the biggest picture or block of words has appeared: the moment the page looks ready. Google calls it Largest Contentful Paint.", good: 2500, poor: 4000, fmt: "s" },
        { k: "fcp", name: "First thing on screen", what: "When anything at all first appears. First Contentful Paint.", good: 1800, poor: 3000, fmt: "s" },
        { k: "si", name: "Looks complete", what: "How quickly the screen fills in, on average. Speed Index.", good: 3400, poor: 5800, fmt: "s" },
        { k: "tbt", name: "Frozen while loading", what: "How long the phone is too busy running scripts to answer a tap, in total. Total Blocking Time.", good: 200, poor: 600, fmt: "ms" },
        { k: "cls", name: "Jumps as it loads", what: "How much the page shifts about under your finger as it loads; 0 is none. Cumulative Layout Shift.", good: 0.1, poor: 0.25, fmt: "cls" }
    ];
    const BY_KEY = Object.fromEntries(METRICS.map(m => [m.k, m]));
    const WORDS = { good: "good", mid: "needs work", poor: "slow" };
    const NAMES = { landing: "Landing page", home: "Home" };

    const $ = id => document.getElementById(id);
    const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const token = () => (typeof window.AdminToken === "function" ? window.AdminToken() : "") || get("mazerats_admin_token");
    function canWrite() {
        let r = "";
        try { r = typeof window.AdminRole === "function" ? String(window.AdminRole() || "") : ""; } catch (e) { r = ""; }
        if (r) return r === "owner" || r === "admin";
        return !document.body.classList.contains("is-viewer");
    }

    let data = null;
    let busy = false;
    let pollUntil = 0;
    let pollTimer = 0;
    let lastError = "";

    function rate(k, v) {
        if (typeof v !== "number") return "";
        if (k === "score") return v >= 90 ? "good" : v >= 50 ? "mid" : "poor";
        const m = BY_KEY[k];
        return v <= m.good ? "good" : v <= m.poor ? "mid" : "poor";
    }
    function fmt(k, v) {
        if (typeof v !== "number") return "?";
        const f = BY_KEY[k] ? BY_KEY[k].fmt : "";
        if (f === "s") return (v / 1000).toFixed(1) + "s";
        if (f === "ms") return Math.round(v) + "ms";
        if (f === "cls") return v.toFixed(2);
        return String(v);
    }
    const mb = b => typeof b === "number" ? (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB") : "?";
    const when = iso => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const day = iso => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }
    function say(text, bad) {
        const s = $("speed-status");
        if (!s) return;
        s.textContent = text || "";
        s.hidden = !text;
        s.classList.toggle("is-error", !!bad);
    }

    /* The last twelve weeks of one page's "Main content shown", as a line:
       each run a dot at its date, coloured by Google's lines, the good and
       poor zones shaded behind. In percentages of the box, so it stretches
       to any width: the zones and line in an SVG drawn without keeping its
       shape (the line's width kept by non-scaling-stroke), the dots as
       round spans laid over it, which a stretched SVG would have made ovals. */
    function trend(runs, now) {
        const ok = runs.filter(r => r.ok && typeof r.lcp === "number").slice().reverse();
        const wrap = el("figure", "spd-trend");
        if (ok.length < 2) {
            wrap.appendChild(el("figcaption", "spd-trend-cap", ok.length ? "The trend starts with the next measurement." : ""));
            return wrap;
        }
        const end = Date.parse(now), start = end - WEEKS * 7 * 864e5;
        const top = Math.max(5000, Math.ceil(Math.max(...ok.map(r => r.lcp)) / 1000) * 1000);
        // 3% in from each side and 8% from top and foot, so an edge dot is whole.
        const x = t => 3 + 94 * Math.min(1, Math.max(0, (Date.parse(t) - start) / (end - start)));
        const y = v => 8 + 84 * (1 - Math.min(v, top) / top);
        const first = ok[0], last = ok[ok.length - 1];
        const plot = el("div", "spd-plot");
        plot.setAttribute("role", "img");
        plot.setAttribute("aria-label", `Main content shown over the last ${WEEKS} weeks: ${ok.length} measurements, from ${fmt("lcp", first.lcp)} on ${when(first.at)} to ${fmt("lcp", last.lcp)} on ${when(last.at)}.`);
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("class", "spd-spark");
        svg.setAttribute("aria-hidden", "true");
        const rect = (y1, y2, cls) => { const r = document.createElementNS(NS, "rect"); r.setAttribute("x", 0); r.setAttribute("width", 100); r.setAttribute("y", y1); r.setAttribute("height", Math.max(0, y2 - y1)); r.setAttribute("class", cls); svg.appendChild(r); };
        rect(0, y(4000), "spd-zone-poor");
        rect(y(2500), 100, "spd-zone-good");
        const line = document.createElementNS(NS, "polyline");
        line.setAttribute("points", ok.map(r => x(r.at).toFixed(2) + "," + y(r.lcp).toFixed(2)).join(" "));
        line.setAttribute("class", "spd-line");
        svg.appendChild(line);
        plot.appendChild(svg);
        ok.forEach(r => {
            const d = el("span", "spd-dot is-" + rate("lcp", r.lcp));
            d.style.left = x(r.at).toFixed(2) + "%";
            d.style.top = y(r.lcp).toFixed(2) + "%";
            d.title = `${when(r.at)}: ${fmt("lcp", r.lcp)}, score ${r.score}${r.source === "asked" ? " (Measure now)" : ""}`;
            plot.appendChild(d);
        });
        wrap.appendChild(plot);
        const cap = el("figcaption", "spd-trend-cap");
        const ends = el("span", "spd-trend-ends");
        ends.append(el("span", "", WEEKS + " weeks ago"), el("span", "", "now"));
        const diff = last.lcp - first.lcp;
        const how = Math.abs(diff) < 150 ? "about the same" : diff < 0 ? (fmt("lcp", -diff) + " quicker") : (fmt("lcp", diff) + " slower");
        cap.append(ends, el("span", "spd-trend-words", `Main content shown: ${fmt("lcp", first.lcp)} then, ${fmt("lcp", last.lcp)} now (${how}). Score ${first.score} then, ${last.score} now.`));
        wrap.appendChild(cap);
        return wrap;
    }

    function pageBlock(p, now) {
        const box = el("section", "spd-page");
        box.setAttribute("aria-label", (NAMES[p.id] || p.name) + " on a phone");
        const latest = p.runs.find(r => r.ok);
        const lastTry = p.runs[0];
        const head = el("h4", "spd-head");
        head.appendChild(el("span", "spd-name", (NAMES[p.id] || p.name) + " on a phone: "));
        if (!latest) {
            head.appendChild(el("span", "spd-big", "not measured yet"));
            box.appendChild(head);
        } else {
            const r = rate("lcp", latest.lcp);
            const big = el("span", "spd-big is-" + r, "ready in " + fmt("lcp", latest.lcp));
            head.appendChild(big);
            head.appendChild(el("span", "spd-word is-" + r, WORDS[r]));
            box.appendChild(head);
            const sr = rate("score", latest.score);
            const meta = el("p", "spd-when");
            meta.append(el("span", "", "Measured " + when(latest.at) + (latest.source === "asked" ? " (Measure now)" : "") + " · "),
                el("span", "spd-score is-" + sr, "score " + latest.score + " of 100 (" + WORDS[sr] + ")"));
            box.appendChild(meta);
            const grid = el("dl", "spd-grid");
            const cell = (cls, title, name, value, word, wcls) => {
                const c = el("div", "spd-m " + cls);
                c.title = title;
                const dd = el("dd");
                dd.append(el("b", "", value));
                if (word) dd.append(el("span", "spd-word " + wcls, word));
                c.append(el("dt", "", name), dd);
                grid.appendChild(c);
            };
            METRICS.forEach(m => {
                const v = latest[m.k], rr = rate(m.k, v);
                cell("is-" + (rr || "none"), m.what, m.name, fmt(m.k, v), WORDS[rr] || "", "is-" + rr);
            });
            // What a phone downloads for it: no line of Google's to colour it by.
            cell("is-none", "Everything the phone downloads to show the page, and in how many files.", "Downloaded", mb(latest.bytes), typeof latest.requests === "number" ? latest.requests + " files" : "", "spd-files");
            box.appendChild(grid);
            if (latest.field && typeof latest.field.lcp === "number") {
                box.appendChild(el("p", "spd-field", `Real visitors on Chrome, last 28 days: main content shown by ${fmt("lcp", latest.field.lcp)} for most.`));
            }
            box.appendChild(trend(p.runs, now));
        }
        if (lastTry && !lastTry.ok && (!latest || Date.parse(lastTry.at) > Date.parse(latest.at))) {
            box.appendChild(el("p", "spd-fail", `The last try, ${when(lastTry.at)}, didn't work: ${lastTry.error}${lastTry.source === "weekly" ? " It tries again within the hour." : ""}`));
        }
        return box;
    }

    function headline() {
        const home = data && data.pages.find(p => p.id === "home");
        const latest = home && home.runs.find(r => r.ok);
        return latest ? { text: "Home ready in " + fmt("lcp", latest.lcp), r: rate("lcp", latest.lcp) } : null;
    }

    function paint() {
        const body = $("speed-body");
        if (!body) return;
        body.textContent = "";
        if (!data) return;
        const wrap = el("div", "spd-pages");
        data.pages.forEach(p => wrap.appendChild(pageBlock(p, data.now)));
        body.appendChild(wrap);
        const next = $("speed-next");
        if (next) next.textContent = "Measured by Google on an emulated mid-range phone over slow 4G. Next weekly check: " + day(data.nextWeekly) + ", " + new Date(data.nextWeekly).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + ". Hover a number for what it means. One run can be a few tenths off the last, so watch the trend.";
        const btn = $("speed-measure");
        if (btn) {
            const may = canWrite();
            btn.hidden = !may;
            btn.disabled = busy || !!data.request;
            btn.textContent = data.request ? (data.request.measuring ? "Measuring…" : "Asked") : "Measure now";
        }
        // The fold's title bar (js/admin-ctl-folds.js) carries the headline, so it reads shut.
        const fold = document.querySelector("#speed-card > .ctl-fold-head");
        if (fold) {
            let s = fold.querySelector(".spd-fold-sum");
            const h = headline();
            if (!s) { s = el("span", "spd-fold-sum"); s.setAttribute("aria-hidden", "true"); fold.appendChild(s); }
            s.className = "spd-fold-sum" + (h ? " is-" + h.r : "");
            s.textContent = h ? h.text : "";
        }
    }

    async function load(quiet) {
        const t = token();
        if (!t) return;
        if (!quiet) say("Reading the speed checks…");
        try {
            const res = await fetch(URL_ + "?fresh=" + Date.now(), { cache: "no-store", headers: { "x-admin-token": t } });
            const j = await res.json().catch(() => null);
            if (res.status === 401) { say("Your session has expired. Sign in again to see the speed checks.", true); return; }
            if (!res.ok || !j || !Array.isArray(j.pages)) throw new Error((j && j.error) || "speed-checks " + res.status);
            const had = data && data.request;
            data = j;
            if (data.request) {
                say(data.request.measuring ? "Google is measuring both pages now. The numbers appear here by themselves." : "Asked. Google measures both pages within five minutes; the numbers appear here by themselves.");
                watch();
            } else if (had) {
                say("Measured just now.");
                stopWatching();
            } else if (lastError) {
                say(lastError, true);
            } else {
                say("");
            }
        } catch (e) {
            if (!quiet || !data) say("Couldn't read the speed checks. Reload to try again.", true);
        }
        paint();
    }

    function watch() {
        if (!pollUntil) pollUntil = Date.now() + POLL_FOR_MS;
        clearTimeout(pollTimer);
        if (Date.now() > pollUntil) { stopWatching(); say("Still waiting for Google. Reload later to see the numbers."); return; }
        pollTimer = setTimeout(() => { if (!document.hidden) load(true); else watch(); }, POLL_MS);
    }
    function stopWatching() { clearTimeout(pollTimer); pollUntil = 0; }

    async function measure() {
        const t = token();
        if (!t || busy) return;
        busy = true;
        lastError = "";
        paint();
        say("Asking…");
        try {
            const res = await fetch(URL_, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "x-admin-token": t }, body: JSON.stringify({ action: "measure" }) });
            const j = await res.json().catch(() => null);
            busy = false;
            if (res.status === 401) {
                say("Not asked: your session had expired. Sign in, then try again.", true);
                if (typeof window.AdminLockOut === "function") window.AdminLockOut();
            } else if (!res.ok || !j || !Array.isArray(j.pages)) {
                lastError = (j && j.error) || "Couldn't ask for a measurement. Try again.";
                say(lastError, true);
            } else {
                data = j;
                pollUntil = 0;
                say("Asked. Google measures both pages within five minutes; the numbers appear here by themselves.");
                watch();
            }
        } catch (e) {
            busy = false;
            say("Couldn't ask for a measurement. Check the connection and try again.", true);
        }
        paint();
    }

    document.addEventListener("DOMContentLoaded", () => {
        const card = $("speed-card");
        if (!card) return;
        $("speed-measure").addEventListener("click", measure);
        let viewer = document.body.classList.contains("is-viewer");
        new MutationObserver(() => {
            const now = document.body.classList.contains("is-viewer");
            if (now === viewer) return;
            viewer = now;
            paint();
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
        // Read when the Controls are first shown, as the menu card is (js/admin-menu.js).
        const panel = card.closest(".admin-panel");
        if (!panel || !panel.hidden) load();
        else {
            const seen = new MutationObserver(() => { if (!panel.hidden) { seen.disconnect(); load(); } });
            seen.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
        }
    });
})();

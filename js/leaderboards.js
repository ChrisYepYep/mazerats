/* The Leaderboards window: every board on the site, in one place.

   Until this, a board was only ever seen at the end of a game — finish
   today's Guess the Maze and there it was, under your result. Somebody who
   wanted to know who was leading without playing first had nowhere to look,
   and a signed-in player had no way to find their own name again once the
   results had closed. This is that place.

   It reads the same endpoints the games' own boards do (guess-scores.js,
   daily-scores.js, ff-scores.js), and draws rows in the same markup and
   classes (.guess-board-* in css/style.css), so a board here and the board
   under a finished game are the same board and cannot disagree.

   Fallin' Furni gets a tab only once the game is open. Its board is a
   single all-time ranking of best runs, so the span switch is hidden for it.

   Opened from the side menu and from the console's Profile page, through
   window.Leaderboards.open(game). */
(function () {
    "use strict";

    const overlay = document.getElementById("boards-overlay");
    const body = document.getElementById("boards-body");
    const closeBtn = document.getElementById("boards-close");
    if (!overlay || !body) return;

    const GAMES = [
        { key: "all", label: "All dailies", url: "/.netlify/functions/daily-scores?game=all",
          span: "Guess the Maze and Odd One Out added together." },
        { key: "guess", label: "Guess the Maze", url: "/.netlify/functions/guess-scores?",
          play: () => window.openGuessGame },
        { key: "odd", label: "Odd One Out", url: "/.netlify/functions/daily-scores?game=odd",
          play: () => window.openOddOneOut },
        { key: "ff", label: "Fallin' Furni", url: "/.netlify/functions/ff-scores", ff: true,
          span: "Everyone's best run. Points first, then the faster time." }
    ];

    const RANGES = [
        { key: "day", label: "Today", empty: "Nobody has finished today yet." },
        { key: "week", label: "This week", empty: "No scores this week yet." },
        { key: "month", label: "This month", empty: "No scores this month yet." },
        { key: "allTime", label: "All time", empty: "No scores recorded yet." }
    ];

    let game = "all";
    let range = "day";
    let ffOpen = false;
    const cache = {};   // game key -> data, "failed", or a pending promise
    let triggerEl = null;

    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // Fallin' Furni's tab waits on the site's own word that the game is
    // open. Unlike the game's gate this fails CLOSED: a tab with an empty
    // board for a game nobody can play is worse than no tab.
    if (typeof Api !== "undefined" && Api.getSiteSettings) {
        Api.getSiteSettings()
            .then(s => {
                const state = s && s.fallinFurniState;
                ffOpen = !!s && !s.fromCache && state !== "coming-soon" && state !== "maintenance";
                if (overlay.classList.contains("open")) draw();
            })
            .catch(() => {});
    }

    function me() { return window.Account && Account.current ? Account.current : null; }

    // "Monday 22 September", for saying what a week or a month starts from.
    function niceDay(iso) {
        if (!iso) return "";
        const d = new Date(iso + "T00:00:00Z");
        return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    }

    /* Fetches only a board that has never been asked for. A "failed" board
       is left alone here on purpose: draw() calls this, and the failure
       path calls draw(), so retrying from here re-fetched a dead board in a
       tight loop and the error note was overwritten before anyone saw it.
       A failed board is retried only by retry() below: on open(), or when
       its game tab is picked. */
    function fetchGame(key) {
        const g = GAMES.find(x => x.key === key);
        if (cache[key]) return;
        cache[key] = fetch(g.url, { headers: { Accept: "application/json" }, credentials: "same-origin" })
            .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then(data => { cache[key] = data; })
            .catch(() => { cache[key] = "failed"; })
            .then(() => { if (overlay.classList.contains("open") && game === key) draw(); });
    }

    // Clears a failed board so the next draw() asks again. Called only on
    // a deliberate act (picking the tab), never from draw() itself.
    function retry(key) {
        if (cache[key] === "failed") delete cache[key];
    }

    function place(list) {
        return window.Daily && Daily.ranks ? Daily.ranks(list)
            : list.map((r, i) => i + 1);
    }

    function rowsHtml(list, isMe, empty, extra) {
        if (!list || !list.length) return `<li class="guess-board-empty">${esc(empty)}</li>`;
        const at = place(list);
        return list.map((row, i) => `
            <li class="guess-board-row${isMe(row) ? " is-me" : ""}">
                <span class="guess-board-rank" aria-hidden="true">${at[i]}</span>
                ${row.avatar
                    ? `<img class="guess-board-face" src="${esc(row.avatar)}" alt="" aria-hidden="true" loading="lazy">`
                    : `<span class="guess-board-face is-blank" aria-hidden="true"></span>`}
                <span class="guess-board-name">${esc(row.name || "Someone")}</span>
                ${extra(row)}
                <span class="guess-board-score">${esc(row.points)}${timeOf(row)}</span>
            </li>`).join("");
    }

    /* The time a day took, small, beside its total — only on a single day's
       board, where the daily endpoints send `ms` (a week's or a month's rows
       carry none, so they show the total alone). Fallin' Furni's rows carry
       an `ms` of their own, a run's length, which this board has never
       shown and does not start to here. Written as Daily.clock writes it
       when that is on the page; the copy below is for when it is not, since
       js/daily.js only arrives with a game. */
    function timeOf(row) {
        const g = GAMES.find(x => x.key === game);
        if (!g || g.ff || range !== "day" || !Number.isFinite(row.ms) || row.ms < 0) return "";
        let t;
        if (window.Daily && Daily.clock) t = Daily.clock(row.ms);
        else {
            const s = Math.floor(row.ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
            const ss = String(s % 60).padStart(2, "0");
            t = h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
        }
        return ` <span class="guess-board-time" title="Time taken">${esc(t)}</span>`;
    }

    // Out of the daily games in GAMES (the ones with a play button), so it
    // follows the list rather than a number that goes stale beside it.
    const DAILY_COUNT = GAMES.filter(g => g.play).length;
    function gamesPill(n) {
        return n ? `<span class="guess-board-games" title="${n} of ${DAILY_COUNT} games played">${n}<span aria-hidden="true">/${DAILY_COUNT}</span></span>` : "<span></span>";
    }

    function daysPill(n) {
        return n ? `<span class="guess-board-games" title="Days played">${n} <span>${n === 1 ? "day" : "days"}</span></span>` : "<span></span>";
    }

    function ffPill(row) {
        return row.levels ? `<span class="guess-board-games" title="Levels cleared">Lv ${esc(row.levels)}</span>` : "<span></span>";
    }

    function spanLine(g, data) {
        if (g.ff) return g.span;
        const base = g.span ? g.span + " " : "";
        if (range === "week" && data.weekFrom) return `${base}Since ${niceDay(data.weekFrom)}.`;
        if (range === "month" && data.monthFrom) return `${base}Since ${niceDay(data.monthFrom)}.`;
        if (range === "day" && data.date) return `${base}${niceDay(data.date)}.`;
        return base.trim() || "Every day since the game began.";
    }

    function boardHtml(g) {
        const data = cache[g.key];
        if (!data || typeof data.then === "function") return `<p class="guess-board-note">Fetching the scores…</p>`;
        if (data === "failed") return `<p class="guess-board-note">This board could not be reached just now. Try again in a moment.</p>`;

        const who = me();
        let list, isMe, extra, empty;
        if (g.ff) {
            list = data.top || [];
            // ff-scores returns no ids on its rows, so the player's own row is
            // found by the run it reports as theirs.
            const you = data.you;
            isMe = row => !!(you && who && row.name === you.name && row.points === you.points && row.ms === you.ms);
            extra = ffPill;
            empty = "No runs recorded yet.";
        } else {
            list = data[range] || [];
            isMe = row => !!(who && row.id === who.id);
            extra = g.key === "all" ? (row => gamesPill(row.games))
                : range === "day" ? (() => "<span></span>")
                    : (row => daysPill(row.days));
            empty = (RANGES.find(r => r.key === range) || RANGES[0]).empty;
        }

        let foot = "";
        if (!who) {
            foot = `<div class="guess-board-note guess-board-invite">
                        Scores are listed under your Discord name.
                        <button type="button" class="guess-btn" data-boards-signin>Sign in with Discord</button>
                    </div>`;
        } else if (!list.some(isMe)) {
            // A board shorter than ten is everybody who scored, so being off
            // it means not having played, not having been beaten.
            foot = `<p class="guess-board-note boards-you">${list.length >= 10
                ? "You're not in the top 10 here yet."
                : "You're not on this board yet."}</p>`;
        }

        const play = g.play && typeof g.play() === "function"
            ? `<button type="button" class="guess-btn boards-play" data-boards-play>Play ${esc(g.label)}</button>` : "";

        return `
            <p class="guess-board-span">${esc(spanLine(g, data))}</p>
            <ol class="guess-board-list">${rowsHtml(list, isMe, empty, extra)}</ol>
            ${foot}
            ${play}`;
    }

    function draw() {
        const games = GAMES.filter(g => !g.ff || ffOpen);
        if (!games.some(g => g.key === game)) game = "all";
        const g = GAMES.find(x => x.key === game);
        fetchGame(game);

        const gameTabs = games.map(x => `
            <button type="button" class="guess-board-range${x.key === game ? " is-on" : ""}"
                    data-game="${x.key}" aria-pressed="${x.key === game}">${esc(x.label)}</button>`).join("");
        const rangeTabs = g.ff ? "" : `
            <div class="guess-board-ranges" role="group" aria-label="Which span the board covers">
                ${RANGES.map(r => `
                    <button type="button" class="guess-board-range${r.key === range ? " is-on" : ""}"
                            data-range="${r.key}" aria-pressed="${r.key === range}">${esc(r.label)}</button>`).join("")}
            </div>`;

        body.innerHTML = `
            <div class="guess-board boards-board">
                <div class="guess-board-ranges boards-games" role="group" aria-label="Which game">${gameTabs}</div>
                ${rangeTabs}
                ${boardHtml(g)}
            </div>`;
    }

    body.addEventListener("click", e => {
        const gBtn = e.target.closest("[data-game]");
        if (gBtn) { game = gBtn.dataset.game; retry(game); draw(); return; }
        const rBtn = e.target.closest("[data-range]");
        if (rBtn) { range = rBtn.dataset.range; draw(); return; }
        if (e.target.closest("[data-boards-signin]")) { if (window.Account) Account.signIn(); return; }
        if (e.target.closest("[data-boards-play]")) {
            const g = GAMES.find(x => x.key === game);
            const open = g && g.play && g.play();
            close({ keepFocus: true });
            if (typeof open === "function") open();
        }
    });

    function open(which) {
        if (which && GAMES.some(g => g.key === which)) game = which;
        if (!overlay.classList.contains("open")) triggerEl = document.activeElement;
        // A board a few minutes old is still worth a fresh look on reopening.
        Object.keys(cache).forEach(k => { if (cache[k] && typeof cache[k].then !== "function") delete cache[k]; });
        draw();
        overlay.classList.add("open");
        document.body.classList.add("modal-open");
        document.getElementById("boards-window").focus();
    }

    function close(opts) {
        overlay.classList.remove("open");
        document.body.classList.remove("modal-open");
        const back = triggerEl;
        triggerEl = null;
        if ((opts && opts.keepFocus) || !back || !document.body.contains(back)) return;
        const landing = back.closest && back.closest("#side-menu") ? document.getElementById("side-spine") : back;
        if (landing && typeof landing.focus === "function") landing.focus({ preventScroll: true });
    }

    if (closeBtn) closeBtn.addEventListener("click", () => close());
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    if (window.EscapeLayers) {
        window.EscapeLayers.register({
            elements: () => overlay.classList.contains("open") ? [overlay] : [],
            close: () => close()
        });
    }
    // Signing in or out changes whose row is picked out.
    if (window.Account) Account.onChange(() => { if (overlay.classList.contains("open")) draw(); });

    window.Leaderboards = { open, close };
})();

/* ===========================================================
   Maze Rats — the console's Profile page

   What signing in with Discord is FOR, gathered in one place. Signing in
   already carried completed mazes between devices and put a name on the
   daily boards, but nothing on the site ever showed a player the sum of it;
   this page does.

   Signed in, it shows:
     - the archive: how many mazes completed, how many saved to do, with the
       Your Progress window a press away (figures from js/home.js through
       window.ArchiveProgress, so the two cannot disagree);
     - the daily games: today, the streak, days played and place, for each
       game and for both added together;
     - Fallin' Furni: the best run and where it ranks, once there is one;
     - Add Maze Info: what they have sent and what came of it.
   Everything but the archive comes from netlify/functions/player-profile.js,
   which counts it from rows the games and forms already keep.

   Signed out, it says what the page would hold, and offers the sign-in.

   Built each time the page is shown (console.js announces that with a
   console:page event), because every figure on it can change while the
   console is closed. Set in Volter Goldfish like the rest of the console,
   so no em dashes, bullets or curly quotes (PICTURE_GLYPHS in js/site.js).
   =========================================================== */
document.addEventListener("DOMContentLoaded", () => {
    const host = document.getElementById("console-profile-body");
    const Console = window.MazeConsole;
    if (!host || !Console) return;

    const PROFILE_URL = "/.netlify/functions/player-profile";
    const FRESH_MS = 30 * 1000;

    let data = null;        // the last profile read, or null
    let readAt = 0;
    let reading = null;
    let failed = false;
    let showing = false;

    function esc(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    const num = n => Number(n || 0).toLocaleString("en-GB");
    const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

    function since(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (isNaN(d)) return "";
        return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    }

    // One "label ...... value" line, the shape the contributors list uses.
    const line = (label, value) => `
        <p class="console-profile-line">
            <span>${esc(label)}</span><span class="console-profile-value">${value}</span>
        </p>`;

    const head = text => `<p class="console-profile-head">${esc(text)}</p>`;
    const rule = '<div class="console-dotline console-profile-rule"></div>';

    function placeText(p) {
        return p ? `#${num(p.rank)} of ${num(p.of)}` : "Not ranked yet";
    }

    function gameBlock(name, g) {
        if (!g || !g.days) {
            return `${head(name)}${line("Today", g && g.playedToday ? "Done" : "Not played")}
                <p class="console-note console-profile-note">Finish a day to start a streak.</p>`;
        }
        const streak = g.streak ? plural(g.streak, "day", "days") : "None";
        return `
            ${head(name)}
            ${line("Today", g.playedToday ? "Done" : "Not played")}
            ${line("Streak", esc(streak))}
            ${line("Best streak", esc(plural(g.best, "day", "days")))}
            ${line("Days played", esc(num(g.days)))}
            ${line("Points", esc(num(g.points)))}
            ${line("Place", esc(placeText(g.place)))}`;
    }

    function archiveBlock() {
        const ap = window.ArchiveProgress;
        const f = ap ? ap.figures() : null;
        if (!f || !f.total) {
            return `${head("The archive")}<p class="console-blurb">Loading...</p>`;
        }
        const pct = Math.round((f.done / f.total) * 100);
        return `
            ${head("The archive")}
            ${line("Completed", `${esc(num(f.done))} / ${esc(num(f.total))}`)}
            <div class="console-profile-bar" role="img" aria-label="${pct}% completed"><span style="width:${pct}%"></span></div>
            ${line("Saved to do", esc(num(f.toWalk)))}
            <button type="button" class="console-btn console-profile-btn" data-act="progress">Your Progress</button>`;
    }

    function signedOutHtml() {
        return `
            <p class="console-blurb">Sign in with Discord and this page becomes yours.</p>
            <ul class="console-profile-list">
                <li>Your completed mazes, on every device</li>
                <li>Your streaks and places in the daily games</li>
                <li>Your name on the leaderboards</li>
                <li>Credit for what you send in</li>
            </ul>
            <button type="button" class="console-btn console-profile-btn" data-act="signin">Sign in with Discord</button>
            <p class="console-note console-profile-note">We only see your Discord name, picture and account ID. Nothing else.</p>
            ${rule}
            ${archiveBlock()}
            ${rule}
            ${head("Leaderboards")}
            <p class="console-blurb">See who is on top without playing first.</p>
            <button type="button" class="console-btn console-profile-btn" data-act="boards">Leaderboards</button>`;
    }

    function signedInHtml(me) {
        const d = data;
        const who = `
            <div class="console-profile-who">
                ${me.avatar ? `<img class="console-profile-face" src="${esc(me.avatar)}" alt="" aria-hidden="true">` : ""}
                <div>
                    <p class="console-profile-name">${esc(me.name)}</p>
                    ${d && d.player && d.player.joinedAt ? `<p class="console-profile-since">Rat since ${esc(since(d.player.joinedAt))}</p>` : ""}
                </div>
            </div>`;

        if (!d) {
            return `${who}${rule}${archiveBlock()}${rule}
                <p class="console-blurb">${failed ? "Your game figures could not be read just now. Try again in a moment." : "Loading..."}</p>`;
        }

        const both = d.combined;
        const games = `
            ${head("Daily games")}
            ${line("Total points", esc(num(both ? both.points : 0)))}
            ${line("Place", esc(placeText(both)))}
            <div class="console-profile-sub">${gameBlock("Guess the Maze", d.games && d.games.guess)}</div>
            <div class="console-profile-sub">${gameBlock("Odd One Out", d.games && d.games.odd)}</div>
            <button type="button" class="console-btn console-profile-btn" data-act="boards">Leaderboards</button>`;

        const ff = d.ff ? `
            ${rule}
            ${head("Fallin' Furni")}
            ${line("Best run", `${esc(num(d.ff.points))} pts`)}
            ${line("Levels", esc(num(d.ff.levels)))}
            ${line("Place", esc(placeText(d.ff)))}` : "";

        const l = d.leads || { sent: 0 };
        const leads = l.sent ? `
            ${head("Add Maze Info")}
            ${line("Sent", esc(num(l.sent)))}
            ${line("Accepted", esc(num(l.accepted)))}
            ${l.waiting ? line("Waiting", esc(num(l.waiting))) : ""}` : `
            ${head("Add Maze Info")}
            <p class="console-blurb">Nothing sent yet. Know something about a maze? It all counts.</p>
            <button type="button" class="console-btn console-profile-btn" data-act="info">Add Maze Info</button>`;

        return `
            ${who}
            ${rule}
            ${archiveBlock()}
            ${rule}
            ${games}
            ${ff}
            ${rule}
            ${leads}
            ${rule}
            <button type="button" class="console-link-btn console-profile-signout" data-act="signout">Sign out</button>`;
    }

    function render() {
        if (!showing) return;
        const me = window.Account ? Account.current : null;
        host.innerHTML = me ? signedInHtml(me) : signedOutHtml();
    }

    async function load(force) {
        const me = window.Account ? Account.current : null;
        if (!me) { data = null; return; }
        if (!force && data && Date.now() - readAt < FRESH_MS) return;
        if (reading) return reading;
        failed = false;
        reading = fetch(PROFILE_URL, { credentials: "same-origin", headers: { Accept: "application/json" } })
            .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then(body => { data = body; readAt = Date.now(); })
            .catch(() => { failed = true; })
            .then(() => { reading = null; render(); });
        return reading;
    }

    async function show() {
        showing = true;
        if (window.Account) {
            host.innerHTML = '<p class="console-blurb">Loading...</p>';
            await Account.ready();
        }
        render();
        load();
    }

    document.addEventListener("console:page", e => {
        if (e.detail && e.detail.name === "profile") show();
        else showing = false;
    });

    // Signing in or out while the page is open redraws it for the new answer.
    if (window.Account) {
        Account.onChange(() => {
            data = null;
            if (showing) { render(); load(true); }
        });
    }

    host.addEventListener("click", e => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "signin" && window.Account) Account.signIn();
        else if (act === "signout" && window.Account) Account.signOut();
        /* Both windows sit at z-index 100 under the console's 200, so they
           opened BEHIND it. The console closes first (handing focus back to
           whatever opened it), then the window opens and takes focus. */
        else if (act === "progress" && window.ArchiveProgress) { Console.close(); window.ArchiveProgress.open(); }
        else if (act === "boards" && window.Leaderboards) { Console.close(); window.Leaderboards.open(); }
        else if (act === "info") Console.openInfo(null);
    });
});

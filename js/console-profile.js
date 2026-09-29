/* ===========================================================
   Maze Rats — the console's Profile page

   What signing in with Discord is FOR, gathered in one place. Signing in
   already carried completed mazes between devices and put a name on the
   daily boards, but nothing on the site ever showed a player the sum of it;
   this page does.

   Signed in, it shows:
     - who they are, and the nickname the boards show instead of their
       Discord name (see THE NICKNAME below);
     - Mazes: how many completed, how many saved, with the Your Progress
       window a press away (figures from js/home.js through
       window.ArchiveProgress, so the two cannot disagree);
     - the daily games: today, the streak, days played and place, for each
       game and for both added together — and each game can be picked, which
       brings up a Play button (see PICK A GAME below);
     - Fallin' Furni: the best run and where it ranks, once there is one;
     - Add Maze Info: what they have sent and what came of it.
   Everything but the mazes comes from netlify/functions/player-profile.js,
   which counts it from rows the games and forms already keep.

   Signed out, it says what the page would hold, and offers the sign-in.

   Built each time the page is shown (console.js announces that with a
   console:page event), because every figure on it can change while the
   console is closed. Set in Volter Goldfish like the rest of the console,
   so no em dashes, bullets or curly quotes (PICTURE_GLYPHS in js/site.js);
   the two dashes the nickname's wording asks for are set in Roboto through
   .console-dash, as the privacy text does.
   =========================================================== */
document.addEventListener("DOMContentLoaded", () => {
    const host = document.getElementById("console-profile-body");
    const Console = window.MazeConsole;
    if (!host || !Console) return;

    const PROFILE_URL = "/.netlify/functions/player-profile";
    const FRESH_MS = 30 * 1000;

    let data = null;        // the last profile read, or null
    let dataFor = null;     // whose it is: the player id it was read for
    let readAt = 0;
    let reading = null;
    let failed = false;
    let showing = false;

    function esc(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    const num = n => Number(n || 0).toLocaleString("en-GB");
    const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
    const DASH = '<span class="console-dash">&mdash;</span>';

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

    /* ---------- PICK A GAME (28 Sept 2026) ----------

       Guess the Maze and Odd One Out's figures can be picked. A pick draws a
       1px border round that game's block, in the console frame's own yellow,
       and brings up a Play button in the bottom-right corner of the console
       screen; Play closes the console and opens the game, exactly as the
       side menu and the Leaderboards window's play buttons do (the same
       window.openGuessGame / window.openOddOneOut; see js/daily-loader.js).
       Picking the picked one again lets go of it, and moving to another
       console page, or reopening the console, lets go too.

       Off the archive (Fallin' Furni's page carries the console but not the
       games) Play goes to /guess or /odd, the games' own addresses, which
       open them on arrival.

       A real control rather than a painted div: role="button", in the tab
       order, answering Enter and Space, and aria-pressed saying which is
       picked. Not a <button> because it holds a column of paragraphs, which
       a <button> may not. */
    const PLAYABLE = {
        guess: { label: "Guess the Maze", open: "openGuessGame", path: "/guess" },
        odd: { label: "Odd One Out", open: "openOddOneOut", path: "/odd" }
    };
    let picked = null;

    const screen = document.getElementById("console-screen");
    let playBtn = null;
    if (screen) {
        playBtn = document.createElement("button");
        playBtn.type = "button";
        playBtn.className = "console-btn console-play-btn";
        playBtn.textContent = "Play";
        playBtn.hidden = true;
        playBtn.addEventListener("click", playPicked);
        screen.appendChild(playBtn);
    }

    function syncPick() {
        host.querySelectorAll("[data-game-pick]").forEach(el => {
            const on = el.dataset.gamePick === picked;
            el.classList.toggle("is-picked", on);
            el.setAttribute("aria-pressed", on ? "true" : "false");
        });
        // A pick whose block is not on the page (signed out, still loading)
        // is no pick at all.
        if (picked && !host.querySelector(`[data-game-pick="${picked}"]`)) picked = null;
        const page = document.getElementById("console-page-profile");
        if (page) page.classList.toggle("has-play", !!picked);
        if (!playBtn) return;
        playBtn.hidden = !picked || !showing;
        if (picked) playBtn.setAttribute("aria-label", `Play ${PLAYABLE[picked].label}`);
    }

    function pick(key) {
        picked = picked === key || !PLAYABLE[key] ? null : key;
        syncPick();
    }

    function clearPick() {
        picked = null;
        syncPick();
    }

    /* A press anywhere that is not a game block or Play lets go of the pick
       (29 Sept 2026), so Play goes away the way a selection does: click off
       it and it is gone. On the capture phase, so it sees the press before
       whatever it lands on acts; a press ON a block is left to pick(), which
       moves or toggles the pick itself.

       On `click`, not `pointerdown` (29 Sept 2026). A finger that lands on
       the console screen to scroll it sends pointerdown before anyone knows
       it is a swipe, so on a phone every scroll dropped the pick and Play
       with it. A scroll never becomes a click; a tap anywhere else still
       does, and a keyboard press on another button (Enter or Space) is a
       click too. Still on the capture phase, so it has run before the
       block's own click handler or Play's decide anything. */
    document.addEventListener("click", e => {
        if (!picked) return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-game-pick]") || (playBtn && playBtn.contains(t))) return;
        clearPick();
    }, true);

    function playPicked() {
        const g = picked && PLAYABLE[picked];
        if (!g) return;
        clearPick();
        /* Locked out — a ban, or a nickname the admins asked to change (29
           Sept 2026; Account.mayPlay in js/account.js). Asked here, before
           the console closes, so the window saying why opens over the
           Profile (it sits at 260, over the console's 200) rather than
           over an empty game window. */
        if (window.Account && typeof Account.mayPlay === "function" && !Account.mayPlay()) return;
        const open = window[g.open];
        if (typeof open === "function") {
            // The console sits at z-index 200, over the games' windows (100),
            // so it goes first; keepFocus, because the game takes focus.
            Console.close({ keepFocus: true });
            open();
        } else {
            location.href = g.path;
        }
    }

    function gameBlock(key, name, g) {
        const inner = !g || !g.days
            ? `${head(name)}${line("Today", g && g.playedToday ? "Done" : "Not played")}
                <p class="console-note console-profile-note">Finish a day to start a streak.</p>`
            : `
            ${head(name)}
            ${line("Today", g.playedToday ? "Done" : "Not played")}
            ${line("Streak", esc(g.streak ? plural(g.streak, "day", "days") : "None"))}
            ${line("Best streak", esc(plural(g.best, "day", "days")))}
            ${line("Days played", esc(num(g.days)))}
            ${line("Points", esc(num(g.points)))}
            ${line("Place", esc(placeText(g.place)))}`;
        return `<div class="console-profile-sub console-profile-game" data-game-pick="${esc(key)}"
                     role="button" tabindex="0" aria-pressed="false"
                     title="Select to play ${esc(name)}">${inner}</div>`;
    }

    function archiveBlock() {
        const ap = window.ArchiveProgress;
        /* "Mazes", not "The archive" (28 Sept 2026): what this block counts
           is the mazes a player has completed and saved, and the site calls
           them that everywhere else.

           Only the homepage has the archive (js/home.js). Elsewhere, such as
           Fallin' Furni's page, "Loading..." would never end, so the block
           just points there. */
        if (!ap) {
            return `
            ${head("Mazes")}
            <p class="console-blurb">Your progress is kept on the archive page.</p>
            <button type="button" class="console-btn console-profile-btn" data-act="progress">Your Progress</button>`;
        }
        const f = ap.figures();
        if (!f || !f.total) {
            return `${head("Mazes")}<p class="console-blurb">Loading...</p>`;
        }
        const pct = Math.round((f.done / f.total) * 100);
        /* "Saved", counted as the Saved list counts it (f.saved: closed
           mazes included), so it matches the Your Progress heading and the
           side menu's "· N saved" a press away. It read "Saved to do" off
           f.toWalk, which leaves closed mazes out, and the same player saw
           two different saved counts on two screens. toWalk stays as the
           fallback for a home.js that does not export `saved` yet. */
        return `
            ${head("Mazes")}
            ${line("Completed", `${esc(num(f.done))} / ${esc(num(f.total))}`)}
            <div class="console-profile-bar" role="img" aria-label="${pct}% completed"><span style="width:${pct}%"></span></div>
            ${line("Saved", esc(num(typeof f.saved === "number" ? f.saved : f.toWalk)))}
            <button type="button" class="console-btn console-profile-btn" data-act="progress">Your Progress</button>`;
    }

    function signedOutHtml() {
        return `
            <p class="console-blurb">Sign in with Discord and this page becomes yours.</p>
            <ul class="console-profile-list">
                <li>Your completed mazes, on every device</li>
                <li>Your streaks and places in the daily games</li>
                <li>Your name on the leaderboards, or a nickname</li>
                <li>Credit for what you send in</li>
            </ul>
            <button type="button" class="console-btn console-profile-btn" data-act="signin">Sign in with Discord</button>
            <p class="console-note console-profile-note">We only see your Discord username, display name, picture and account ID. Nothing else.</p>
            ${rule}
            ${archiveBlock()}
            ${rule}
            ${head("Leaderboards")}
            <p class="console-blurb">See who is on top without playing first.</p>
            <button type="button" class="console-btn console-profile-btn" data-act="boards">Leaderboards</button>`;
    }

    /* ---------- THE NICKNAME (28 Sept 2026) ----------

       Near the top, under who they are: the name the scoreboards show in
       place of their Discord one. Read and written through js/account.js
       (Account.setNickname, which calls the server and announces the new
       player to every page listener, so the header, the boards and the "Set
       a nickname" lines under the games' results all follow at once).

       ONE ELEMENT, KEPT. The rest of this page is redrawn with innerHTML
       whenever anything changes — the profile read landing a moment after
       the page opens, a sign-in elsewhere — and a redraw that rebuilt the
       field would throw away what someone was halfway through typing and
       drop their focus on the floor. So the section is built once and
       MOVED into each new drawing (the slot below), the way js/guess.js
       keeps its board element; a focused field is focused again after the
       move, with its caret where it was.

       Enter saves and Escape cancels. Escape goes through EscapeLayers
       (js/site.js) as a layer of its own: the field sits inside the console,
       and the shared rule treats the inner layer as the front one, so the
       first Escape shuts the editor and only a second closes the console.
       Enter needs nothing special: there is no form here to submit. */
    const nick = { editing: false, busy: false, msg: "", tone: "", draft: null, fromServer: false };
    let wantNickEdit = false;
    // What the section was last drawn for (see render), so a redraw of the
    // page only rebuilds it when the player or their nickname has changed.
    let drawnFor = null;

    const nickEl = document.createElement("div");
    nickEl.className = "console-nick";
    /* The nickname's buttons ("Change <name>"…) and the name itself are the
       player's name; js/error-report.js's click breadcrumbs say only
       "button" inside anything marked so (29 Sept 2026). */
    nickEl.setAttribute("data-crumb-private", "");

    function nickNote() {
        return `<p class="console-note console-profile-note console-nick-note">Shown on the scoreboards instead of your Discord name. Optional ${DASH} change it any time.</p>`;
    }

    function drawNick() {
        const me = window.Account ? Account.current : null;
        if (!me) { nickEl.innerHTML = ""; return; }
        const current = me.nick || "";
        const status = `<p class="console-form-status console-nick-status${nick.tone ? " is-" + nick.tone : ""}"
                           id="console-nick-status" role="status" aria-live="polite"${nick.msg ? "" : " hidden"}>${esc(nick.msg)}</p>`;

        if (!Account.canNick || !Account.canNick()) {
            nickEl.innerHTML = `
                ${line("Nickname", current ? esc(current) : "None set")}
                <p class="console-note console-profile-note">Nicknames can't be set from this page just now. Reload it to try again.</p>`;
            return;
        }

        /* LOCKED by the site's admins from the Warren (29 Sept 2026; see
           LOCKED in netlify/functions/player-nick.js). The name is shown
           and the controls are not: the server would refuse them anyway,
           and a Change button that can only ever say no is worse than a
           sentence saying who to ask. A save refused because the lock
           arrived while the field was open lands here too (Account.
           setNickname marks the player locked), and this sentence is the
           message, so nothing else is shown under it. */
        if (me.nickLocked) {
            nick.editing = false;
            nick.msg = "";
            nickEl.innerHTML = `
                ${current
                    ? line("Nickname", esc(current))
                    : `${head("Nickname")}
                       <p class="console-blurb console-nick-none">None set ${DASH} the boards show your Discord name (${esc(me.name || "")}).</p>`}
                <p class="console-note console-profile-note console-nick-locked">Your nickname was set by the site's admins. Ask them if you'd like it changed.</p>`;
            return;
        }

        /* REJECTED by the admins from the Warren (29 Sept 2026; see
           FLAGGED in netlify/functions/player-nick.js): the name still
           stands and the controls are the usual ones — changing it is
           exactly what is being asked — with one line saying why. It goes
           when the player saves a different name or removes it, since the
           server takes nickRejected off then and the reply says so. Only
           with a nickname: a rejection cannot outlive one. */
        /* And once the player has refused the forced rename (nickRefused,
           29 Sept 2026), a second line saying what that costs: the games
           stay locked until a new name is saved here. */
        const rejectedLine = me.nickRejected && current
            ? `<p class="console-note console-profile-note console-nick-rejected">The admins have asked you to choose a different nickname.</p>${me.nickRefused
                ? `<p class="console-note console-profile-note console-nick-rejected">Games are locked until you choose a new nickname.</p>` : ""}`
            : "";

        if (!nick.editing) {
            nickEl.innerHTML = `
                ${current
                    ? line("Nickname", esc(current))
                    : `${head("Nickname")}
                       <p class="console-blurb console-nick-none">None set ${DASH} the boards show your Discord name (${esc(me.name || "")}).</p>`}
                ${rejectedLine}
                <button type="button" class="console-btn console-profile-btn" data-nick="edit">${current ? "Change" : "Set a nickname"}</button>
                ${status}
                ${nickNote()}`;
            return;
        }

        const value = nick.draft != null ? nick.draft : current;
        nickEl.innerHTML = `
            ${head("Nickname")}
            ${rejectedLine}
            <label class="visually-hidden" for="console-nick-input">Nickname</label>
            <input type="text" class="console-input console-input-line console-nick-input" id="console-nick-input"
                   maxlength="${Account.NICK_MAX || 20}" autocomplete="off" autocapitalize="off" spellcheck="false"
                   placeholder="${esc(me.name || "")}" value="${esc(value)}"
                   aria-describedby="console-nick-status"${nick.busy ? " disabled" : ""}>
            <div class="console-nick-actions">
                <button type="button" class="console-btn" data-nick="save"${nick.busy ? " disabled" : ""}>Save</button>
                <button type="button" class="console-btn" data-nick="cancel"${nick.busy ? " disabled" : ""}>Cancel</button>
                ${current ? `<button type="button" class="console-link-btn console-nick-remove" data-nick="remove"${nick.busy ? " disabled" : ""}>Remove</button>` : ""}
            </div>
            ${status}
            ${nickNote()}`;
        syncNickValidity();
    }

    // What the field says as it is typed into. Only the message line and
    // Save change, so the caret is never disturbed.
    function syncNickValidity() {
        const input = nickEl.querySelector("#console-nick-input");
        const save = nickEl.querySelector('[data-nick="save"]');
        const out = nickEl.querySelector("#console-nick-status");
        if (!input || !out || nick.busy) return;
        const typed = input.value.trim();
        const problem = typed ? Account.checkNickname(typed) : "";
        if (problem) { setNickMsg(problem, "error"); }
        else if (nick.tone === "error" && !nick.fromServer) { setNickMsg("", ""); }
        if (save) save.disabled = !!problem || !typed;
    }

    function setNickMsg(text, tone, fromServer) {
        nick.msg = text || "";
        nick.tone = tone || "";
        nick.fromServer = !!fromServer;
        const out = nickEl.querySelector("#console-nick-status");
        if (!out) return;
        out.textContent = nick.msg;
        out.hidden = !nick.msg;
        out.classList.toggle("is-error", nick.tone === "error");
        out.classList.toggle("is-ok", nick.tone === "ok");
    }

    function focusNick(sel) {
        const el = nickEl.querySelector(sel);
        if (el && !el.disabled) el.focus({ preventScroll: true });
        return el;
    }

    function startNickEdit() {
        nick.editing = true;
        nick.draft = null;
        setNickMsg("", "");
        drawNick();
        const input = focusNick("#console-nick-input");
        if (input) {
            input.select();
            // Near the top of the page, but on a phone the page may have
            // been scrolled; bring the field into the screen.
            if (typeof input.scrollIntoView === "function") input.scrollIntoView({ block: "nearest" });
        }
    }

    function cancelNickEdit() {
        if (nick.busy) return;
        nick.editing = false;
        nick.draft = null;
        setNickMsg("", "");
        drawNick();
        focusNick('[data-nick="edit"]');
    }

    async function saveNick(remove) {
        if (nick.busy || !window.Account || !Account.current) return;
        const input = nickEl.querySelector("#console-nick-input");
        const tidy = Account.tidyNickname || (s => String(s).trim());
        const typed = remove ? "" : (input ? tidy(input.value) : "");
        const current = Account.current.nick || "";
        if (!remove) {
            const problem = Account.checkNickname(typed);
            if (problem) { setNickMsg(problem, "error"); if (input) input.focus(); return; }
            if (typed === current) { cancelNickEdit(); return; }
        }
        nick.busy = true;
        nick.draft = typed;
        setNickMsg(remove ? "Removing..." : "Saving...", "");
        drawNick();
        try {
            await Account.setNickname(remove ? null : typed);
            nick.busy = false;
            nick.editing = false;
            nick.draft = null;
            nick.msg = remove ? "Removed. The boards show your Discord name again."
                : `Saved. The boards now show ${typed}.`;
            nick.tone = "ok";
            nick.fromServer = false;
            drawNick();
            focusNick('[data-nick="edit"]');
        } catch (e) {
            nick.busy = false;
            nick.msg = (e && e.message) || "Nicknames can't be saved just now. Try again in a moment.";
            nick.tone = "error";
            nick.fromServer = true;
            // Signed out underneath it: the page is about to redraw as
            // signed out, and there is nothing left to edit.
            if (e && e.status === 401) nick.editing = false;
            drawNick();
            focusNick("#console-nick-input");
        }
    }

    nickEl.addEventListener("click", e => {
        const btn = e.target.closest("[data-nick]");
        if (!btn || btn.disabled) return;
        const act = btn.dataset.nick;
        if (act === "edit") startNickEdit();
        else if (act === "cancel") cancelNickEdit();
        else if (act === "save") saveNick(false);
        else if (act === "remove") saveNick(true);
    });
    nickEl.addEventListener("input", e => {
        if (e.target.id !== "console-nick-input") return;
        nick.draft = e.target.value;
        nick.fromServer = false;
        syncNickValidity();
    });
    nickEl.addEventListener("keydown", e => {
        if (e.target.id !== "console-nick-input" || e.key !== "Enter") return;
        e.preventDefault();
        saveNick(false);
    });

    if (window.EscapeLayers) {
        window.EscapeLayers.register({
            elements: () => (nick.editing && showing && nickEl.isConnected && nickEl.getClientRects().length ? [nickEl] : []),
            close: () => cancelNickEdit()
        });
    }

    /* Opens the console on this page with the field open and focused — for
       the "Set a nickname" lines under the games' results (Account.
       editNickname in js/account.js). Over a game window is fine: the
       console is a floating window that sits above them (z-index 200 to
       their 100), and the result card is still there underneath once it is
       closed again. */
    Console.editNickname = () => {
        wantNickEdit = true;
        Console.open("profile");
    };

    function signedInHtml(me) {
        const d = data;
        const who = `
            <div class="console-profile-who" data-crumb-private>
                ${me.avatar ? `<img class="console-profile-face" src="${esc(me.avatar)}" alt="" aria-hidden="true">` : ""}
                <div>
                    <p class="console-profile-name">${esc(Account.nameOf ? Account.nameOf(me) : me.name)}</p>
                    ${d && d.player && d.player.joinedAt ? `<p class="console-profile-since">Rat since ${esc(since(d.player.joinedAt))}</p>` : ""}
                </div>
            </div>
            <div data-nick-slot></div>`;

        if (!d) {
            return `${who}${rule}${archiveBlock()}${rule}
                <p class="console-blurb">${failed ? "Your game figures could not be read just now. Try again in a moment." : "Loading..."}</p>`;
        }

        const both = d.combined;
        const games = `
            ${head("Daily games")}
            ${line("Total points", esc(num(both ? both.points : 0)))}
            ${line("Place", esc(placeText(both)))}
            <p class="console-note console-profile-note console-pick-note">Select a game to play it.</p>
            ${gameBlock("guess", "Guess the Maze", d.games && d.games.guess)}
            ${gameBlock("odd", "Odd One Out", d.games && d.games.odd)}
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

        /* What had focus, so a redraw can hand it back: the nickname field
           (moved, not rebuilt, so only focus and caret need restoring) or a
           picked game block (rebuilt, so found again by its key). */
        const active = document.activeElement;
        const inNick = active && nickEl.contains(active) ? active : null;
        const nickFocusSel = inNick ? (inNick.id ? `#${inNick.id}` : inNick.dataset.nick ? `[data-nick="${inNick.dataset.nick}"]` : null) : null;
        const caret = inNick && typeof inNick.selectionStart === "number"
            ? [inNick.selectionStart, inNick.selectionEnd] : null;
        const gameKey = active && host.contains(active) && active.dataset ? active.dataset.gamePick : null;

        if (!me) {
            nick.editing = false;
            nick.msg = "";
            drawnFor = null;
            host.innerHTML = signedOutHtml();
            syncPick();
            return;
        }

        let openedNow = false;
        if (wantNickEdit) {
            wantNickEdit = false;
            // Not over a locked nickname: the page says why instead.
            if (Account.canNick && Account.canNick() && !me.nickLocked) {
                nick.editing = true;
                nick.draft = null;
                nick.msg = "";
                nick.tone = "";
                drawnFor = null;
                openedNow = true;
            }
        }

        host.innerHTML = signedInHtml(me);
        /* Redrawn only when what it shows has moved on (a different player
           or nickname, or it has just been asked to open); otherwise the
           same element, field and all, is simply moved into the new page. */
        // nickRejected and nickRefused too (29 Sept 2026), so the admins'
        // lines come and go.
        const key = JSON.stringify([me.id, me.nick || "", me.name || "", !!(Account.canNick && Account.canNick()), !!me.nickLocked, !!me.nickRejected, !!me.nickRefused]);
        if (key !== drawnFor || !nickEl.childElementCount) {
            drawnFor = key;
            drawNick();
        }
        const slot = host.querySelector("[data-nick-slot]");
        if (slot) slot.replaceWith(nickEl);
        syncPick();

        if (openedNow) {
            const input = focusNick("#console-nick-input");
            if (input) input.select();
        } else if (nickFocusSel) {
            const again = nickEl.querySelector(nickFocusSel);
            if (again && !again.disabled) {
                again.focus({ preventScroll: true });
                if (caret) { try { again.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not a text field */ } }
            }
        } else if (gameKey) {
            const again = host.querySelector(`[data-game-pick="${gameKey}"]`);
            if (again) again.focus({ preventScroll: true });
        }
    }


    async function load(force) {
        const me = window.Account ? Account.current : null;
        if (!me) { data = null; dataFor = null; return; }
        if (!force && data && dataFor === me.id && Date.now() - readAt < FRESH_MS) return;
        if (reading) return reading;
        // Whose figures this read is, so an answer for the player signed in
        // BEFORE a switch is never drawn as the new one's (29 Sept 2026).
        const forId = me.id;
        failed = false;
        /* On a 10s leash, as js/api.js's _getWithFallback puts the public
           reads. A request that hung never settled, so `reading` stayed set
           and every later open returned the same dead promise above — the
           page could not even try again. An abort lands in the catch like
           any other failure and draws the existing "couldn't load" state.
           The timer is left to run out rather than cleared on the headers,
           so a stalled body is covered too. */
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        if (controller) setTimeout(() => controller.abort(), 10000);
        reading = fetch(PROFILE_URL, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: controller ? controller.signal : undefined
        })
            .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then(body => {
                const now = window.Account && Account.current ? Account.current.id : null;
                if (now !== forId) return;
                data = body;
                dataFor = forId;
                readAt = Date.now();
            })
            .catch(() => { failed = true; })
            .then(() => {
                reading = null;
                // Somebody else signed in while it was out: read theirs.
                const now = window.Account && Account.current ? Account.current.id : null;
                if (showing && now && now !== forId) { load(true); return; }
                render();
            });
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
        // Any page change — or the console reopening, which shows a page
        // afresh — lets go of a picked game.
        picked = null;
        /* And the nickname field starts closed each time the page is shown:
           coming back to a half-typed name you had walked away from is worse
           than starting again (the Contact form empties itself for the same
           reason). Console.editNickname opens it again straight after. */
        nick.editing = false;
        nick.draft = null;
        nick.msg = "";
        nick.tone = "";
        drawnFor = null;
        if (e.detail && e.detail.name === "profile") show();
        else showing = false;
        syncPick();
    });

    /* The console shutting is the page no longer showing (29 Sept 2026; the
       event is new in js/console.js's closeConsole). Without it `showing`
       stayed true from the first look at the Profile for the rest of the
       visit, and every Account announcement after — a nickname saved from
       Fallin' Furni, the sign-in check — fetched player-profile again for a
       page that was not on screen. Play, and the page's own Leaderboards
       and Your Progress buttons, all close the console, so they land here. */
    document.addEventListener("console:close", () => {
        showing = false;
        picked = null;
        syncPick();
    });

    /* Signing in or out while the page is open redraws it for the new
       answer. Only a DIFFERENT player (or none) throws the figures away
       (29 Sept 2026): Account also announces a nickname saved, a lock
       lifted, a sign-in check that changed nothing — and nulling `data` on
       each of those put "Loading..." over every figure for the length of a
       round trip, straight after pressing Save on the name. The same
       player keeps what is drawn and is refreshed quietly underneath. */
    if (window.Account) {
        Account.onChange(() => {
            const me = Account.current;
            const id = me && me.id != null ? me.id : null;
            if (id === null || id !== dataFor) { data = null; dataFor = null; readAt = 0; }
            if (showing) { render(); if (id) load(true); }
        });
    }

    /* Sign out ASKS first here too (28 Sept 2026), through the same "Sign
       out?" window the header's name now opens (Account.confirmSignOut in
       js/account.js). This button signed out on the spot, so the one page
       whose whole subject is "what your account holds" was the one place a
       stray press could drop it.

       That window sits at z-index 210, above the console's 200, and is the
       modal one — the console is a floating window FocusTrap leaves alone —
       so Tab and Escape stay with the question. "No" puts focus back on this
       button itself. "Yes" leaves it on the button while the sign-out runs
       (it can take a few seconds), then, because Account.onChange redraws
       this page and the button goes with it, hands focus to the fresh "Sign
       in with Discord" in its place rather than letting it fall to <body>. */
    async function signOutAsked(btn) {
        if (!Account.confirmSignOut) { Account.signOut(); return; }
        if (!(await Account.confirmSignOut())) return;
        if (btn.isConnected) btn.focus({ preventScroll: true });
        await Account.signOut();
        const again = host.querySelector('[data-act="signin"]');
        const lost = !document.activeElement || document.activeElement === document.body || !btn.isConnected;
        if (again && lost) again.focus({ preventScroll: true });
    }

    host.addEventListener("click", e => {
        const game = e.target.closest("[data-game-pick]");
        if (game && host.contains(game)) { pick(game.dataset.gamePick); return; }
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "signin" && window.Account) Account.signIn();
        else if (act === "signout" && window.Account) signOutAsked(btn);
        /* Both windows sit at z-index 100 under the console's 200, so they
           opened BEHIND it. The console closes first (handing focus back to
           whatever opened it), then the window opens and takes focus. */
        else if (act === "progress" && window.ArchiveProgress) { Console.close(); window.ArchiveProgress.open(); }
        else if (act === "boards" && window.Leaderboards) { Console.close(); window.Leaderboards.open(); }
        // Off the homepage neither window exists, so both buttons go there.
        else if (act === "progress" || act === "boards") location.href = "/home";
        else if (act === "info") Console.openInfo(null);
    });

    // Enter and Space on a game block, as on a button. Space is kept from
    // scrolling the screen.
    host.addEventListener("keydown", e => {
        const game = e.target.closest ? e.target.closest("[data-game-pick]") : null;
        if (!game || e.target !== game) return;
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            pick(game.dataset.gamePick);
        }
    });

    /* /home#nickname — where the "Set a nickname" line sends someone from a
       page without the console (Account.editNickname). Opens the console on
       the field once the sign-in answer is in; signed out, it opens on the
       Profile page, which offers the sign-in. The hash is taken off the
       address, as #privacy is, so a refresh does not open it again. */
    if (location.hash === "#nickname") {
        history.replaceState(null, "", location.pathname + location.search);
        const go = () => (window.Account && Account.current ? Console.editNickname() : Console.open("profile"));
        if (window.Account) Account.ready().then(go);
        else go();
    }
});

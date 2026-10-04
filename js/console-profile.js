/* ===========================================================
   Maze Rats — the console's Profile page: Edit Profile

   Where a player changes what their profile shows. Until 3 Oct 2026 this
   page WAS the profile — mazes, the daily games, Fallin' Furni and Add
   Maze Info, counted up — but those moved into the Your Profile window
   (js/home.js, where other players can look them up too), and this page
   became the place to edit it. The console's button still says Profile.

   Signed in, it shows:
     - who they are: their Habbo's head when OriginsBot has linked one,
       never the Discord picture (the owner's call), and the nickname the
       boards show instead of their Discord name (THE NICKNAME below);
     - Favourite maze, chosen from the mazes they have completed;
     - Featured badge, chosen from the badges they have earned;
     - Visibility: whether other players can find and open the profile;
     - the way to the profile itself, and to the Leaderboards.
   The choices are saved to player-data.js (PUT { profile }) and read back
   from profiles.js (?me=1), with the badges worked out by js/home.js
   (ArchiveProgress.badges) so this page and the window cannot disagree.

   Only the archive page has the archive. Elsewhere (Fallin' Furni's page
   carries the console but not the mazes) the favourite and the badge can
   only be read, and a button goes to the archive to change them.

   Signed out, it says what signing in gives, and offers the sign-in.

   Built each time the page is shown (console.js announces that with a
   console:page event), because what it shows can change while the
   console is closed. Set in Volter Goldfish like the rest of the console,
   so no em dashes, bullets or curly quotes (PICTURE_GLYPHS in js/site.js);
   the two dashes the nickname's wording asks for are set in Roboto through
   .console-dash, as the privacy text does.
   =========================================================== */
document.addEventListener("DOMContentLoaded", () => {
    const host = document.getElementById("console-profile-body");
    const Console = window.MazeConsole;
    if (!host || !Console) return;

    const PROFILE_URL = "/.netlify/functions/profiles?me=1";
    const SAVE_URL = "/.netlify/functions/player-data";
    const FRESH_MS = 30 * 1000;

    let data = null;        // the last profile read, or null
    let dataFor = null;     // whose it is: the player id it was read for
    let readAt = 0;
    let reading = null;
    let failed = false;
    let showing = false;
    // When a 401 from the profile last made `me` be asked again (see load).
    let askedMeAt = 0;

    function esc(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    const DASH = '<span class="console-dash">&mdash;</span>';

    function since(ym) {
        if (!ym) return "";
        const d = new Date(`${ym}-01T00:00:00Z`);
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

    /* Text for the console's font. Maze names and badge names are written
       by people, and the screen's face draws only what PICTURE_GLYPHS in
       js/site.js lists, so the marks it has no picture for are swapped for
       the plain ones it does. */
    const plain = s => String(s == null ? "" : s)
        .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-").replace(/…/g, "...");

    /* The signed-out page: what signing in is for. */
    function signedOutHtml() {
        return `
            <p class="console-blurb">Sign in with Discord and you get a profile of your own.</p>
            <ul class="console-profile-list">
                <li>Your completed mazes, on every device</li>
                <li>A profile other players can find</li>
                <li>Your streaks and places in the daily games</li>
                <li>Your name on the leaderboards, or a nickname</li>
                <li>Credit for what you send in</li>
            </ul>
            <button type="button" class="console-btn console-profile-btn" data-act="signin">Sign in with Discord</button>
            <p class="console-note console-profile-note">From Discord we only get your username, display name, picture and account ID.</p>
            ${rule}
            ${head("Your Profile")}
            <p class="console-blurb">Your completed mazes and badges, kept in this browser until you sign in.</p>
            <button type="button" class="console-btn console-profile-btn" data-act="progress">Your Profile</button>
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

    /* WHAT A SCREEN READER HEARS (1 Oct 2026). The status line under the
       field was the live region, but drawNick rebuilds nickEl whole — on
       Save, and again when the save answers — so "Saving...", "Saved. The
       boards now show ..." and every refusal arrived in a region that had
       only just been put on the page with its words already in it, which
       screen readers mostly do not read out. So one region that is never
       rebuilt says them instead: kept beside the page body (not inside it,
       which render() also rebuilds), emptied and then worded a frame later
       so a repeat of the same sentence is still a change, as liveSay does
       for the Contact form in js/console.js. The visible line keeps its id
       for the field's aria-describedby, and is no longer a region itself,
       so nothing is said twice. */
    const nickSpoken = document.createElement("p");
    nickSpoken.className = "visually-hidden";
    nickSpoken.setAttribute("role", "status");
    nickSpoken.setAttribute("aria-live", "polite");
    (host.parentNode || host).appendChild(nickSpoken);
    let nickSaid = "";
    let nickSayFrame = 0;
    function sayNick(text) {
        const words = text || "";
        if (words === nickSaid) return;
        nickSaid = words;
        if (nickSayFrame) cancelAnimationFrame(nickSayFrame);
        nickSayFrame = 0;
        nickSpoken.textContent = "";
        if (!words) return;
        if (document.hidden || typeof requestAnimationFrame !== "function") { nickSpoken.textContent = words; return; }
        nickSayFrame = requestAnimationFrame(() => { nickSayFrame = 0; nickSpoken.textContent = words; });
    }

    function nickNote() {
        return `<p class="console-note console-profile-note console-nick-note">Shown on the scoreboards instead of your Discord name. Optional ${DASH} change it any time.</p>`;
    }

    function drawNick() {
        const me = window.Account ? Account.current : null;
        if (!me) { nickEl.innerHTML = ""; return; }
        const current = me.nick || "";
        // Said aloud by sayNick, not by this line (see WHAT A SCREEN READER HEARS).
        sayNick(nick.msg);
        const status = `<p class="console-form-status console-nick-status${nick.tone ? " is-" + nick.tone : ""}"
                           id="console-nick-status"${nick.msg ? "" : " hidden"}>${esc(nick.msg)}</p>`;

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
                <p class="console-note console-profile-note console-nick-locked">${me.nickHabbo
                    // From OriginsBot (3 Oct 2026; see _originsbot.js).
                    ? "This is your Habbo name, linked to your Discord through OriginsBot. Ask the site's admins if it's wrong."
                    : "Your nickname was set by the site's admins. Ask them if you'd like it changed."}</p>`;
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
        sayNick(nick.msg);
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

    /* A new player's first look (4 Oct 2026; PROFILE INTRO in
       js/account.js): Edit Profile with a welcome line at the top, the
       nickname's "Set a nickname" straight under it. Not with the field
       already open: the console's screen is short, and the open field sat
       below the welcome, out of sight but holding the focus, so the first
       keys pressed went somewhere nobody could see. `welcome` false is the
       returning player's "Edit my profile": the page, no welcome. The line
       goes when the console moves to another page or closes. */
    let welcome = false;
    Console.openProfileWelcome = (withWelcome) => {
        welcome = !!withWelcome;
        Console.open("profile");
    };
    const welcomeHtml = () => (welcome ? `
        <p class="console-blurb console-profile-welcome">Welcome to Maze Rats! This is your profile. Choose a nickname, a favourite maze and a badge to show, and other players can find you by name.</p>
        <p class="console-note console-profile-note">You can come back here any time from Profile.</p>
        ${rule}` : "");

    /* ---------- THE PROFILE'S CHOICES (3 Oct 2026) ----------

       Favourite maze, featured badge and visibility. Each saves the moment
       it is changed — a select's change, the visibility button's press —
       through one PUT of just that field, so two quick changes cannot undo
       each other. A save in flight disables all three. What came of it is
       said on one line under the control that was changed, and aloud
       through the same live region the nickname uses (sayNick). */
    const pref = { busy: false, where: "", msg: "", tone: "" };

    function prefStatus(where) {
        if (pref.where !== where || !pref.msg) return "";
        return `<p class="console-form-status${pref.tone ? " is-" + pref.tone : ""}">${esc(pref.msg)}</p>`;
    }

    async function savePref(where, patch) {
        if (pref.busy || !data) return;
        /* The control is disabled while the save runs, and a disabled one
           cannot hold focus, so it drops to <body>; whether it had focus is
           noted now and handed back once the save settles. */
        const hadFocus = !!(document.activeElement && host.contains(document.activeElement));
        pref.busy = true;
        pref.where = where;
        pref.msg = "Saving...";
        pref.tone = "";
        sayNick(pref.msg);
        render();
        try {
            const res = await fetch(SAVE_URL, {
                method: "PUT",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ profile: patch })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body && body.error ? body.error : "");
            const p = body && body.profile;
            if (p) {
                data.favourite = p.favourite;
                data.badge = p.badge;
                data.hidden = p.hidden;
            }
            // The favourite is only kept if it is completed (player-data.js).
            pref.msg = "favourite" in patch && patch.favourite && p && p.favourite !== patch.favourite
                ? "That maze isn't on your completed list yet, so it wasn't saved."
                : "Saved.";
            pref.tone = pref.msg === "Saved." ? "ok" : "error";
            // The window behind the console draws it again.
            if (window.ArchiveProgress && typeof ArchiveProgress.changed === "function") ArchiveProgress.changed();
        } catch (e) {
            pref.msg = (e && e.message) || "That couldn't be saved just now. Try again in a moment.";
            pref.tone = "error";
        }
        pref.busy = false;
        sayNick(pref.msg);
        render();
        const again = hadFocus && showing ? host.querySelector(`[data-pref="${where}"]`) : null;
        if (again) again.focus({ preventScroll: true });
    }

    function favouriteHtml() {
        const ap = window.ArchiveProgress;
        const off = pref.busy ? " disabled" : "";
        if (!ap || typeof ap.completed !== "function") {
            return `
                ${head("Favourite maze")}
                <p class="console-blurb">${data.favourite ? "Chosen. " : ""}Choose it on the archive page, from the mazes you have completed.</p>
                <button type="button" class="console-btn console-profile-btn" data-act="progress">Go to the archive</button>`;
        }
        const done = ap.completed();
        if (!done.length) {
            return `
                ${head("Favourite maze")}
                <p class="console-blurb">Complete a maze and you can pick a favourite from them here.</p>`;
        }
        const chosen = done.some(m => m.id === data.favourite) ? data.favourite : "";
        return `
            ${head("Favourite maze")}
            <label class="visually-hidden" for="console-fav-select">Favourite maze</label>
            <select class="console-input console-select console-pref-select" id="console-fav-select" data-pref="favourite"${off}>
                <option value=""${chosen ? "" : " selected"}>None</option>
                ${done.map(m => `<option value="${esc(m.id)}"${m.id === chosen ? " selected" : ""}>${esc(plain(m.name))}</option>`).join("")}
            </select>
            ${prefStatus("favourite")}
            <p class="console-note console-profile-note">Shown at the top of your profile. Only mazes you have completed can be chosen.</p>`;
    }

    function badgeHtml() {
        const ap = window.ArchiveProgress;
        const off = pref.busy ? " disabled" : "";
        if (!ap || typeof ap.badges !== "function") {
            return `
                ${head("Featured badge")}
                <p class="console-blurb">Choose it on the archive page, from the badges you have earned.</p>`;
        }
        const earned = ap.badges(data);
        if (!earned.length) {
            return `
                ${head("Featured badge")}
                <p class="console-blurb">No badges yet. The first comes with your first completed maze.</p>`;
        }
        const chosen = earned.some(b => b.key === data.badge) ? data.badge : "";
        return `
            ${head("Featured badge")}
            <label class="visually-hidden" for="console-badge-select">Featured badge</label>
            <select class="console-input console-select console-pref-select" id="console-badge-select" data-pref="badge"${off}>
                <option value=""${chosen ? "" : " selected"}>None</option>
                ${earned.map(b => `<option value="${esc(b.key)}"${b.key === chosen ? " selected" : ""}>${esc(plain(b.name))}</option>`).join("")}
            </select>
            ${prefStatus("badge")}
            <p class="console-note console-profile-note">Shown beside your name on your profile.</p>`;
    }

    function visibilityHtml() {
        const hidden = !!data.hidden;
        return `
            ${head("Visibility")}
            ${line("Profile", hidden ? "Hidden" : "Public")}
            <button type="button" class="console-btn console-profile-btn" data-pref="hidden" aria-pressed="${hidden ? "true" : "false"}"${pref.busy ? " disabled" : ""}>${hidden ? "Show my profile" : "Hide my profile"}</button>
            ${prefStatus("hidden")}
            <p class="console-note console-profile-note">${hidden
                ? `Hidden ${DASH} nobody else can find or open it. You still can.`
                : "Anyone can find it by your name in the search on Profiles."}</p>`;
    }

    function signedInHtml(me) {
        const d = data;
        const habbo = d && d.habbo;
        /* The Habbo's head, outlined in the screen's colour as the Your
           Profile window draws it (netlify/functions/habbo-outline.js; 4 Oct
           2026); the Discord picture is never shown here. Without a linked
           Habbo, nothing: the name stands on its own. */
        let figure = "";
        try { figure = habbo && habbo.avatar ? new URL(habbo.avatar).searchParams.get("figure") || "" : ""; } catch (e) { /* not an address */ }
        const face = figure
            ? `<img class="console-profile-habbo" src="/.netlify/functions/habbo-outline?figure=${esc(encodeURIComponent(figure))}&amp;kind=head&amp;v=2" alt="" aria-hidden="true">`
            : "";
        const who = `
            <div class="console-profile-who" data-crumb-private>
                ${face}
                <div>
                    <p class="console-profile-name">${esc(Account.nameOf ? Account.nameOf(me) : me.name)}</p>
                    ${d && d.since ? `<p class="console-profile-since">Rat since ${esc(since(d.since))}</p>` : ""}
                </div>
            </div>
            ${d && !habbo ? `<p class="console-note console-profile-note">Link your Habbo through OriginsBot to show your avatar and motto on your profile.</p>` : ""}
            <div data-nick-slot></div>`;

        const view = `
            <button type="button" class="console-btn console-profile-btn" data-act="progress">View my profile</button>
            <button type="button" class="console-btn console-profile-btn" data-act="boards">Leaderboards</button>`;

        if (!d) {
            return `${who}${rule}
                <p class="console-blurb">${failed ? "Your profile could not be read just now. Try again in a moment." : "Loading..."}</p>
                ${rule}${view}`;
        }

        return `
            ${who}
            ${rule}
            ${favouriteHtml()}
            ${rule}
            ${badgeHtml()}
            ${rule}
            ${visibilityHtml()}
            ${rule}
            ${view}
            ${rule}
            <button type="button" class="console-link-btn console-profile-signout" data-act="signout">Sign out</button>`;
    }

    function render() {
        if (!showing) return;
        const me = window.Account ? Account.current : null;

        /* What had focus, so a redraw can hand it back: the nickname field
           (moved, not rebuilt, so only focus and caret need restoring), or
           one of the choices (rebuilt, so found again by its id or data-pref). */
        const active = document.activeElement;
        const inNick = active && nickEl.contains(active) ? active : null;
        const nickFocusSel = inNick ? (inNick.id ? `#${inNick.id}` : inNick.dataset.nick ? `[data-nick="${inNick.dataset.nick}"]` : null) : null;
        const caret = inNick && typeof inNick.selectionStart === "number"
            ? [inNick.selectionStart, inNick.selectionEnd] : null;
        const prefKey = !inNick && active && host.contains(active) && active.dataset ? active.dataset.pref : null;

        if (!me) {
            nick.editing = false;
            nick.msg = "";
            drawnFor = null;
            host.innerHTML = welcomeHtml() + signedOutHtml();
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

        host.innerHTML = welcomeHtml() + signedInHtml(me);
        /* Redrawn only when what it shows has moved on (a different player
           or nickname, or it has just been asked to open); otherwise the
           same element, field and all, is simply moved into the new page. */
        // nickRejected and nickRefused too (29 Sept 2026), so the admins'
        // lines come and go.
        const key = JSON.stringify([me.id, me.nick || "", me.name || "", !!(Account.canNick && Account.canNick()), !!me.nickLocked, !!me.nickHabbo, !!me.nickRejected, !!me.nickRefused]);
        if (key !== drawnFor || !nickEl.childElementCount) {
            drawnFor = key;
            drawNick();
        }
        const slot = host.querySelector("[data-nick-slot]");
        if (slot) slot.replaceWith(nickEl);

        if (openedNow) {
            const input = focusNick("#console-nick-input");
            if (input) input.select();
        } else if (nickFocusSel) {
            const again = nickEl.querySelector(nickFocusSel);
            if (again && !again.disabled) {
                again.focus({ preventScroll: true });
                if (caret) { try { again.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not a text field */ } }
            }
        } else if (prefKey) {
            // (A save in flight disables it; savePref hands focus back after.)
            const again = host.querySelector(`[data-pref="${prefKey}"]`);
            if (again && !again.disabled) again.focus({ preventScroll: true });
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
            .then(res => {
                if (res.ok) return res.json();
                /* A session the server has revoked (a forgotten player's old
                   tab; 30 Sept 2026): the answer cleared the cookie, and `me`
                   is asked again so the page — this one, and the header —
                   redraws signed out rather than "could not be read". */
                // Once a minute at most, so a `me` that still says signed in
                // (its own read of the row failing) cannot set up a loop.
                if (res.status === 401 && window.Account && typeof Account.refresh === "function" && Date.now() - askedMeAt > 60000) {
                    askedMeAt = Date.now();
                    Account.refresh();
                }
                return Promise.reject(new Error(String(res.status)));
            })
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
        /* load() before render() (30 Sept 2026). load() clears `failed`
           synchronously as it starts a read, so drawing first showed the
           LAST read's "could not be read just now" for the whole of the
           retry that was already on its way. Called first, the page draws
           "Loading..." while it is out; load() still draws again when it
           settles. */
        load();
        render();
    }

    document.addEventListener("console:page", e => {
        /* The nickname field starts closed each time the page is shown:
           coming back to a half-typed name you had walked away from is worse
           than starting again (the Contact form empties itself for the same
           reason). Console.editNickname opens it again straight after. And
           the last save's message goes, as the nickname's does. */
        nick.editing = false;
        nick.draft = null;
        nick.msg = "";
        nick.tone = "";
        drawnFor = null;
        if (!pref.busy) { pref.msg = ""; pref.where = ""; }
        if (e.detail && e.detail.name === "profile") show();
        else { showing = false; welcome = false; }
    });

    /* The console shutting is the page no longer showing (29 Sept 2026; the
       event is new in js/console.js's closeConsole). Without it `showing`
       stayed true from the first look at the Profile for the rest of the
       visit, and every Account announcement after — a nickname saved from
       Fallin' Furni, the sign-in check — fetched the profile again for a
       page that was not on screen. The page's own View my profile and
       Leaderboards buttons both close the console, so they land here. */
    document.addEventListener("console:close", () => {
        showing = false;
        welcome = false;
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
        const answer = await Account.confirmSignOut();
        if (!answer) return;
        if (btn.isConnected) btn.focus({ preventScroll: true });
        // "everywhere" is the window's quieter third answer (1 Oct 2026).
        await Account.signOut({ everywhere: answer === "everywhere" });
        const again = host.querySelector('[data-act="signin"]');
        const lost = !document.activeElement || document.activeElement === document.body || !btn.isConnected;
        if (again && lost) again.focus({ preventScroll: true });
    }

    host.addEventListener("click", e => {
        const toggle = e.target.closest('button[data-pref="hidden"]');
        if (toggle && !toggle.disabled && data) { savePref("hidden", { hidden: !data.hidden }); return; }
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
        // Off the homepage neither window exists: /profile opens Your Profile
        // there (4 Oct 2026), and the Leaderboards are on the archive page.
        else if (act === "progress") location.href = "/profile";
        else if (act === "boards") location.href = "/home";
        else if (act === "info") Console.openInfo(null);
    });

    host.addEventListener("change", e => {
        const sel = e.target.closest("select[data-pref]");
        if (!sel || !data) return;
        const value = sel.value || null;
        savePref(sel.dataset.pref, { [sel.dataset.pref]: value });
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

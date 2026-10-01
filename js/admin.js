/* Admin panel logic for warren.html (served at /warren) — add/edit/delete mazes and events.
   Everything here writes live to MongoDB via the Netlify Functions in
   netlify/functions/ (see js/api.js) — no local-only staging anymore.
   Write requests are gated by a session token from logging in with a
   username/password (see netlify/functions/auth.js and _auth.js); sessions
   expire automatically after 12 hours. Image uploads (thumbnails,
   room-by-room gallery shots) go through netlify/functions/upload.js into
   Netlify Blobs — see js/api.js's uploadImage/deleteImage. */
document.addEventListener("DOMContentLoaded", () => {

    // Rooms/events/admins/contributors are all admin-entered (a single
    // trusted operator), so the risk here is low — but every list below
    // still renders its fields via innerHTML, so escaping keeps a stray
    // "<"/"&" in a title or description from breaking the row's own markup,
    // and stops a bad paste or a compromised admin account (see
    // netlify/functions/auth.js's owner/admin role split) from running in
    // the admin's own authenticated session next time the list renders.
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    /* For a stored address about to become a src or an href. Escaping stops
       it breaking out of the attribute, but says nothing about what the
       attribute then points at — "javascript:" or "data:" survive escaping
       untouched. So only the two shapes this panel ever legitimately stores
       are let through: an absolute http(s) address (FurniIndex icons, Blob
       URLs) and a path on this site ("/assets/…", "assets/…"). Anything else
       becomes "", which draws as a missing picture rather than running. */
    function safeUrl(url) {
        const s = String(url || "").trim();
        if (!s) return "";
        if (/^https?:\/\//i.test(s)) return s;
        // Protocol-relative ("//evil.example") would be another host, and a
        // colon before the first slash is a scheme of some kind.
        if (s.startsWith("//")) return "";
        const firstSlash = s.indexOf("/");
        const colon = s.indexOf(":");
        if (colon !== -1 && (firstSlash === -1 || colon < firstSlash)) return "";
        return s;
    }

    // localStorage, not sessionStorage — an admin checking the live site
    // (home.html, see the pre-load Coming Soon/Maintenance gate in its own
    // <head>) in a second tab or window needs this same token there too;
    // sessionStorage is scoped per-tab and wouldn't be visible outside the
    // tab actually used to log in.
    const TOKEN_KEY = "mazerats_admin_token";
    const loginModal = document.getElementById("login-modal");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    const adminContent = document.getElementById("admin-content");
    const logoutBtn = document.getElementById("logout-btn");
    const furniSidebar = document.getElementById("furni-sidebar");
    const furniScanAllBtn = document.getElementById("furni-scan-all-btn");
    const furniScanStatus = document.getElementById("furni-scan-status");
    const furniScanNewBtn = document.getElementById("furni-scan-new-btn");
    const furniScanAddBtn = document.getElementById("furni-scan-add-btn");
    const furniScanLocalEl = document.getElementById("furni-scan-local");
    const furniScanRemoteEl = document.getElementById("furni-scan-remote");
    const furniProgress = document.getElementById("furni-progress");
    const furniProgressFill = document.getElementById("furni-progress-fill");
    const furniProgressLabel = document.getElementById("furni-progress-label");
    const adminsListEl = document.getElementById("admins-list");
    const adminsFormEl = document.getElementById("admins-form");
    const adminsAddBtn = document.getElementById("admins-add-btn");
    /* Forget a player lived here, under the Admins list, until 29 Sept
       2026. It is an action on each player in the Players tab now
       (js/admin-players.js), which is told about sign-outs and role changes
       through window.AdminPlayers below. */
    const contributorsListEl = document.getElementById("contributors-list");
    const contributorsFormEl = document.getElementById("contributors-form");
    const contributorsAddBtn = document.getElementById("contributors-add-btn");
    const contactMessagesListEl = document.getElementById("contact-messages-list");
    const bansListEl = document.getElementById("bans-list");
    const adminRailEl = document.getElementById("admin-rail");
    const adminSessionUserEl = document.getElementById("admin-session-user");
    const landingToggleEl = document.getElementById("landing-toggle");
    /* The landing buttons only — NOT every .btn-enter-mini on the page. The
       Fallin' Furni switch below borrows the same class for the same look, and
       a bare class selector would have swept it into the landing toggle's
       "which one is active" bookkeeping and disabled it on every save. */
    const landingToggleBtns = document.querySelectorAll("#landing-toggle .btn-enter-mini");
    const landingToggleStatus = document.getElementById("landing-toggle-status");
    const launchAtEl = document.getElementById("launch-at");
    const launchAtInput = document.getElementById("launch-at-input");
    const launchAtSave = document.getElementById("launch-at-save");
    const launchAtClear = document.getElementById("launch-at-clear");
    const launchAtStatus = document.getElementById("launch-at-status");
    // Fallin' Furni's own launch date, beside its switch. The same controls
    // as the site countdown above, saving settings.ffLaunchAt instead.
    const ffLaunchAtEl = document.getElementById("ff-launch-at");
    const ffLaunchAtInput = document.getElementById("ff-launch-at-input");
    const ffLaunchAtSave = document.getElementById("ff-launch-at-save");
    const ffLaunchAtClear = document.getElementById("ff-launch-at-clear");
    const ffLaunchAtStatus = document.getElementById("ff-launch-at-status");

    // Fallin' Furni's own live/maintenance switch, in the game's rail group.
    const ffToggleEl = document.getElementById("ff-state-toggle");
    const ffToggleBtns = document.querySelectorAll(".ff-state-btn");
    const ffToggleStatus = document.getElementById("ff-state-status");
    // The switch-against-launch-date warning — its own line, see
    // sayFfMismatch and the note in warren.html.
    const ffMismatchEl = document.getElementById("ff-state-warning");
    // And the landing switch's against the site's launch date (1 Oct 2026)
    // — see sayLandingMismatch.
    const landingMismatchEl = document.getElementById("landing-state-warning");
    // The site-wide palette switch, beneath the landing one.
    const themeToggleEl = document.getElementById("theme-toggle");
    const themeToggleBtns = document.querySelectorAll(".theme-btn");
    const themeToggleStatus = document.getElementById("theme-toggle-status");
    // Its second row: the palettes saved in Recolour (28 Sept 2026).
    const paletteToggleRow = document.getElementById("palette-toggle-saved");
    const paletteToggleEmpty = document.getElementById("palette-toggle-empty");

    /* ---- the Nav and Control tabs.

       They open on hover, which is a CSS job and stays one — see .admin-tab
       in style.css. This is only what hover cannot do:

         · TOUCH has no hover. A tap toggles the panel open and locked, so
           the bar works on a tablet at all.
         · A tap or click anywhere else closes it again, which is what
           every menu on every platform does and what a finger expects.
         · Escape closes it and puts focus back on the tab, so a keyboard
           user is never left inside a panel they cannot leave.

       Choosing a section closes the Nav panel too: the whole point of
       pressing Mazes is to look at the mazes, not at the menu in front of
       them. The Control panel deliberately does NOT close on use — setting
       the palette and then the landing state is one visit, not two. */
    const adminTabs = Array.from(document.querySelectorAll(".admin-tab"));

    function closeAdminTabs(except) {
        adminTabs.forEach(tab => {
            if (tab === except) return;
            tab.classList.remove("is-open");
            const btn = tab.querySelector(".admin-tab-btn");
            if (btn) btn.setAttribute("aria-expanded", "false");
        });
    }

    adminTabs.forEach(tab => {
        const btn = tab.querySelector(".admin-tab-btn");
        if (!btn) return;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const open = !tab.classList.contains("is-open");
            closeAdminTabs(tab);
            tab.classList.remove("is-dismissed");
            tab.classList.toggle("is-open", open);
            btn.setAttribute("aria-expanded", open ? "true" : "false");
        });
        // An Escape dismissal (see the keydown below) lasts until focus
        // leaves the tab altogether; coming back to it opens it as usual.
        tab.addEventListener("focusout", (e) => {
            if (!tab.contains(e.relatedTarget)) tab.classList.remove("is-dismissed");
        });
        // Leaving with the pointer drops the lock as well, so a tab opened by
        // tapping does not stay stuck open for a mouse user afterwards.
        tab.addEventListener("mouseleave", () => {
            tab.classList.remove("is-open");
            btn.setAttribute("aria-expanded", "false");
        });
    });

    /* Looked up here rather than reusing adminNavEl, which is declared with
       const several thousand lines below this — reading it from up here is a
       temporal dead zone crash at load, and one that `node --check` cannot
       see because the syntax is perfectly valid. */
    const navForTabs = document.getElementById("admin-nav");
    if (navForTabs) navForTabs.addEventListener("click", () => closeAdminTabs(null));

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".admin-tab")) closeAdminTabs(null);
    });

    /* Escape, for a panel open by either route: locked open by a tap
       (.is-open), or open only because focus is inside it — the CSS opens a
       tab on :focus-within too, and that one Escape used to ignore, so a
       keyboard user tabbing through the Nav could not shut it at all.

       Putting focus back on the tab button would leave focus within the
       tab and so leave it open, which is what .is-dismissed is for: it
       overrides :focus-within (see .admin-tab.is-dismissed in style.css)
       until focus leaves the tab or the button is pressed again. */
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const focused = document.activeElement && document.activeElement.closest
            ? document.activeElement.closest(".admin-tab") : null;
        const open = document.querySelector(".admin-tab.is-open") || focused;
        if (!open) return;
        // A dialog is open over the page — its own Escape handles that.
        if (document.querySelector(".modal-overlay.open")) return;
        closeAdminTabs(null);
        open.classList.add("is-dismissed");
        const btn = open.querySelector(".admin-tab-btn");
        if (btn) btn.focus();
    });

    /* ---- your own account.

       Log out, and change your own password. Both are about the PERSON using
       the page rather than about the site, which is why they live behind the
       username rather than among the controls.

       Changing your own password needs no special powers: the endpoint reads
       a PUT whose username matches the caller's as the "self" scope, so even
       a view-only account can do it (see netlify/functions/auth.js). That is
       also why the field is not in the Admins tab — that tab is for resetting
       OTHER people's, which is a different permission entirely. */
    const selfPasswordInput = document.getElementById("self-password");
    const selfPasswordCurrentInput = document.getElementById("self-password-current");
    // The new one typed a second time — see the note in warren.html.
    const selfPasswordConfirmInput = document.getElementById("self-password-confirm");
    const selfPasswordBtn = document.getElementById("self-password-btn");
    const selfPasswordStatus = document.getElementById("self-password-status");

    /* A password field's REAL value. js/password-field.js used to turn every
       password input into a text field that drew "••••" and kept the real
       string to itself, so .value gave back the mask. Since 30 Sept 2026 the
       field stays a real password input and .value is the password; these
       two stay so a clear also puts the mask back. */
    function passwordValue(input) {
        return window.PasswordField ? window.PasswordField.value(input) : (input ? input.value : "");
    }
    function clearPassword(input) {
        if (window.PasswordField) window.PasswordField.clear(input);
        else if (input) input.value = "";
    }

    function sayPassword(message, ok) {
        if (!selfPasswordStatus) return;
        selfPasswordStatus.textContent = message;
        selfPasswordStatus.style.display = message ? "block" : "none";
        selfPasswordStatus.classList.toggle("is-bad", !ok);
    }

    async function saveOwnPassword() {
        if (!selfPasswordInput) return;
        // Enter in either field reaches here too, and does not care that the
        // button is disabled mid-save.
        if (selfPasswordBtn.disabled) return;
        const next = passwordValue(selfPasswordInput);
        const current = passwordValue(selfPasswordCurrentInput);
        // The server refuses a change to your own password without the
        // current one (see auth.js); asked for here first so the answer is
        // immediate rather than a round trip away.
        if (selfPasswordCurrentInput && !current) { sayPassword("Type your current password first.", false); return; }
        // Checked here only to save a round trip and give a faster answer;
        // the endpoint enforces its own rules regardless of what this says.
        if (next.length < 8) { sayPassword("At least 8 characters.", false); return; }
        /* Typed twice, and the two must agree. The field shows only bullets,
           so a slip could not be seen — and the change retires every session
           this account has, this one included, so a mistyped new password
           was a lock-out with no signed-in screen left to fix it from. The
           Admins tab's reset form has always asked for a confirmation; this
           one never did. Skipped only if the page has no confirm field. */
        if (selfPasswordConfirmInput && passwordValue(selfPasswordConfirmInput) !== next) {
            sayPassword("The new passwords don't match — type it the same both times.", false);
            return;
        }
        selfPasswordBtn.disabled = true;
        sayPassword("Saving…", true);
        try {
            const changed = await Api.resetAdminPassword(adminToken, currentUsername, next, current);
            // A password change retires every session this account had,
            // this one included, so the reply carries a replacement.
            if (changed && changed.token) {
                adminToken = changed.token;
                writeToken(adminToken);
            }
            // Cleared on success, so a new password is never left sitting in
            // a field on an unattended screen — through the module, so its
            // own copy of the value goes too (see passwordValue).
            clearSelfPasswordFields();
            sayPassword("Password changed.", true);
        } catch (err) {
            // A wrong current password is a 403 with its own message, and
            // falls through to be said here; only 401 means the session.
            // So does the server's throttle on repeated tries (429).
            if (err.status === 401) { lockOut(); return; }
            if (err.status === 429) {
                sayPassword(err.message || "Too many tries — wait a minute, then try again.", false);
                return;
            }
            sayPassword(err.message || "Couldn't change it.", false);
        } finally {
            selfPasswordBtn.disabled = false;
        }
    }

    // All three, through the module (see passwordValue) — used on success,
    // and by lockOut and doLogout so a password is never left typed into a
    // tab the next person to sit down can open.
    function clearSelfPasswordFields() {
        clearPassword(selfPasswordInput);
        clearPassword(selfPasswordCurrentInput);
        clearPassword(selfPasswordConfirmInput);
    }

    if (selfPasswordBtn) selfPasswordBtn.addEventListener("click", saveOwnPassword);
    [selfPasswordCurrentInput, selfPasswordInput, selfPasswordConfirmInput].forEach(input => {
        if (!input) return;
        // Enter saves, and must not reach anything else — see the furni
        // search for the same trap, though there is no form around this one.
        input.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            saveOwnPassword();
        });
    });

    const floatingActionsEl = document.getElementById("floating-actions");
    const floatingSaveBtn = document.getElementById("floating-save-btn");
    const floatingCancelBtn = document.getElementById("floating-cancel-btn");

    /* The token, read and written behind a guard.

       Every other store on the site is wrapped (see loadWalked in js/home.js,
       the session id in js/track.js, the landing state in js/api.js); this
       one was bare, and a browser set to block site data throws on the very
       first line rather than returning null. That took the whole admin panel
       down before it had drawn anything — with no message, because the
       script that would have shown one had already stopped. Signing in
       simply will not persist in that browser, which is a far smaller
       problem than the page not loading. */
    function readToken() {
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    }
    function writeToken(value) {
        try {
            if (value) localStorage.setItem(TOKEN_KEY, value);
            else localStorage.removeItem(TOKEN_KEY);
        } catch (e) { /* blocked or full: the session lasts this page only */ }
    }

    let adminToken = readToken();
    let currentUsername = "";
    let currentUserRole = "admin";
    let workingRooms = [];
    let workingEvents = [];
    let workingAdmins = [];
    let workingContributors = [];
    let workingContactMessages = [];
    let workingBans = [];
    // Whether workingRooms/workingEvents are the real archive or the empty
    // stand-in a failed load leaves behind — see openContributorForm.
    let archiveLoadedOk = false;
    let roomsQuery = "";
    let roomsSortBy = "name";
    let eventsSortBy = "date-desc";
    const roomsSearchInput = document.getElementById("rooms-search");
    const roomsSortSelect = document.getElementById("rooms-sort");
    const eventsSortSelect = document.getElementById("events-sort");
    // Which of "rooms"/"events" the floating Save/Cancel currently act on —
    // null whenever neither form is open (they're hidden then too).
    let activeFormKey = null;

    // Kept in this exact order everywhere (easiest → hardest) — js/home.js
    // has its own copy of the value/label pairs for rendering the pill.
    // Same order used by the rooms-sort dropdown's difficulty options and by
    // the public site's own room-sort (js/home.js) — kept in sync manually
    // since each file already has its own small copy of the difficulty list.
    const DIFFICULTY_ORDER = ["easy", "medium", "hard", "very-hard", "extreme"];

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // A maze's opening date is stored as "YYYY-MM-DD", or "YYYY-MM" when the
    // exact day isn't known (the admin form's Day dropdown left on "—") —
    // js/home.js's formatMazeDate shows the day-less form as just "Month
    // Year" on the public site instead of guessing a day.
    function parseMazeDate(dateStr) {
        const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
        if (full) return { year: full[1], month: full[2], day: full[3] };
        const monthOnly = /^(\d{4})-(\d{2})$/.exec(dateStr || "");
        if (monthOnly) return { year: monthOnly[1], month: monthOnly[2], day: "" };
        return { year: "", month: "", day: "" };
    }

    const DIFFICULTY_OPTIONS = [
        ["", "Not rated"],
        ["easy", "Easy"],
        ["medium", "Medium"],
        ["hard", "Hard"],
        ["very-hard", "Very Hard"],
        ["extreme", "Extreme"]
    ];

    // The hotels this archive covers, as a fixed list rather than the free
    // text field this used to be — the values are matched exactly
    // elsewhere (netlify/functions/habbo.js maps them to the Origins hotel
    // to look a builder up on), so a typo or an old spelling like
    // "Origins" silently cost that maze its builder cards.
    const HOTEL_OPTIONS = [
        ["", "Unknown"],
        ["COM", "COM"],
        ["ES", "ES"],
        ["BR", "BR"]
    ];

    /* Which kind of event this is. Absence is Regular — every event that
       existed before this was added has no field at all, and reads as one
       without a migration.

       Only the EC seasons change anything: they give the event its badge
       and name plate in a list row, and its badge and a wash of the
       badge's own green in the modal (see .ec-title / .modal.is-ec in
       css/style.css). Regular events are untouched. */
    const EC_SEASON_OPTIONS = [["", "Regular"], ["s1", "EC S1"], ["s2", "EC S2"]];

    const COLLECTIONS = {
        rooms: {
            singular: "Maze",
            plural: "Mazes",
            fieldMap: { title: "name", subtitle: "creator", date: "added" },
            titleLabel: "Maze Name",
            subtitleLabel: "Creator (Habbo username)",
            dateLabel: "Date opened",
            statusOptions: [["open", "Open"], ["closed", "Closed"], ["collab", "Collab"], ["unknown", "Unknown"]],
            getAll: () => workingRooms,
            // The stored records as they are now — see refreshAfterConflict.
            // With the deleted mazes' addresses (readFullWithRetired).
            getFull: () => readFullWithRetired("rooms"),
            create: item => Api.createRoom(adminToken, item),
            update: item => Api.updateRoom(adminToken, item),
            remove: id => Api.deleteRoom(adminToken, id),
            listEl: document.getElementById("rooms-list"),
            formEl: document.getElementById("rooms-form"),
            addBtn: document.getElementById("rooms-add-btn")
        },
        events: {
            singular: "Event",
            plural: "Events",
            fieldMap: { title: "title", subtitle: "host", date: "date" },
            titleLabel: "Event title",
            subtitleLabel: "Host (Habbo username)",
            statusOptions: [["upcoming", "Upcoming"], ["past", "Past"], ["archive", "Archive"]],
            getAll: () => workingEvents,
            getFull: () => readFullWithRetired("events"),
            create: item => Api.createEvent(adminToken, item),
            update: item => Api.updateEvent(adminToken, item),
            remove: id => Api.deleteEvent(adminToken, id),
            listEl: document.getElementById("events-list"),
            formEl: document.getElementById("events-form"),
            addBtn: document.getElementById("events-add-btn")
        }
    };

    /* The deleted records' addresses, per collection (28 Sept 2026).

       Deleting a maze or event reserves every address it answered to
       (retired_addresses; see _slugs.js), and the server refuses a save
       that would hand one out again. The Address field did not know them,
       so an address a deleted maze once had passed the check as it was
       typed and failed on Save, and a new maze following a deleted one's
       name was silently given "-2". The admin read now asks for them
       (?full=1&retired=1 answers { records, retired }) and the field treats
       them as taken — see js/admin-address.js.

       Through Api._write with the URL spelt out, as js/admin-guides.js and
       js/admin-dead-ends.js already read their own endpoints: Api's
       getRoomsFull / getEventsFull keep answering a bare list, which the
       image clean-up (freshReferencedKeys) and the Missing Pieces panel
       still read. A bare list from a server without &retired=1 is taken
       as it is, with no retired addresses known, which is how the page
       behaved before: the save still checks. */
    const retiredAddresses = { rooms: [], events: [] };
    const RETIRED_URLS = {
        rooms: "/.netlify/functions/rooms?full=1&retired=1",
        events: "/.netlify/functions/events?full=1&retired=1"
    };
    async function readFullWithRetired(key) {
        const data = await Api._write(RETIRED_URLS[key], "GET", adminToken);
        if (Array.isArray(data)) return data;
        retiredAddresses[key] = Array.isArray(data && data.retired) ? data.retired : [];
        return Array.isArray(data && data.records) ? data.records : [];
    }

    /* A record just deleted from this page: its addresses go on the local
       list at once, as retireAddresses put them on the server's — the one
       it was at, its stored slug, every old one and its id — so a new
       record given the same name straight afterwards already shows the -2
       it will get, without waiting for the next full read. */
    function retireLocally(key, item) {
        if (!item || !retiredAddresses[key]) return;
        const add = [item.slug, ...(Array.isArray(item.slugAliases) ? item.slugAliases : []), item.id]
            .filter(s => typeof s === "string" && s);
        retiredAddresses[key] = [...new Set(retiredAddresses[key].concat(add))];
    }

    // ---------- login ----------

    loginForm.addEventListener("submit", async e => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        const username = (formData.get("username") || "").trim();
        const password = formData.get("password");
        loginError.style.display = "none";
        const submitBtn = loginForm.querySelector("button[type=submit]");
        submitBtn.disabled = true;
        submitBtn.textContent = "Checking…";

        try {
            const result = await Api.login(username, password);
            /* A different person signing in over a session that ran out —
               see lastSignedInAs. Worked out before the new account is
               installed, and acted on after, so the panels reload as it. */
            const switched = !!lastSignedInAs && lastSignedInAs !== result.username;
            adminToken = result.token;
            currentUsername = result.username;
            currentUserRole = result.role || "admin";
            lastSignedInAs = result.username;
            writeToken(adminToken);
            /* Emptied the moment it has done its job. It used to keep the
               password, so the next "Session expired" box — twelve hours
               later, on a screen that may have been left unattended — opened
               already filled in, one press of Unlock from signed in. The
               reset empties the field, and js/password-field.js's reset
               listener puts its mask back. */
            loginForm.reset();
            if (switched) resetAccountPanels();
            await enterAdmin();
        } catch (err) {
            /* Only a failure of the login itself belongs in the login box.
               Once enterAdmin has run, the modal is closed and anything
               written into it is invisible — so a later failure is said in
               the panel instead. (enterAdmin catches its own loading errors;
               this is the backstop for anything it did not foresee.) */
            if (!loginModal.classList.contains("open")) {
                showLoadBanner("Something went wrong opening the panel: " +
                    (err.message || "unknown error") + ". Reload the page to try again.");
                return;
            }
            loginError.textContent = err.message || "Wrong username or password — try again.";
            loginError.style.display = "block";
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Unlock";
        }
    });

    function lockOut() {
        /* The furni scan's poll stops here. It kept firing every 2.5s with
           the dead token, and each 401 came back through this function and
           rewrote the login box — clearing whatever error it was showing and
           re-opening a modal the admin was part-way through typing into.
           applyRoleVisibility starts it again on the next sign-in. */
        stopFurniPolling();
        /* Any Are You Sure? still up is answered No and taken down first
           (30 Sept 2026): while it was open everything else on the page was
           inert, the sign-in box included, so the admin could neither see
           nor type into it. Its caller then does nothing, as for any No. */
        if (cancelOpenDialog) cancelOpenDialog();
        // And an Event Entries picture open full size, whose lightbox sits
        // over the sign-in box (30 Sept 2026) — see closeViewer there.
        if (window.AdminEntries && typeof window.AdminEntries.closeViewer === "function") window.AdminEntries.closeViewer();
        writeToken("");
        adminToken = "";
        currentUsername = "";
        currentUserRole = "admin";
        /* The role's classes come off with the role. Left on, a view-only
           or Albus account's own sign-in box was greyed out — the Unlock
           button matches `body.is-viewer .admin-form-actions button` — and
           the keyboard click-blocker below cancelled its submit, so that
           account could not sign back in at all. applyRoleVisibility puts
           them back for whoever signs in. */
        document.body.classList.remove("is-viewer", "is-albus");
        adminContent.style.display = "none";
        if (adminRailEl) adminRailEl.style.display = "none";
        landingToggleEl.style.display = "none";
        if (launchAtEl) launchAtEl.style.display = "none";
        if (ffLaunchAtEl) ffLaunchAtEl.style.display = "none";
        if (ffToggleEl) ffToggleEl.style.display = "none";
        if (themeToggleEl) themeToggleEl.style.display = "none";
        /* Passwords out of every field, and the run log out of its tables
           (ffClear) — the next person to sign in on this tab may not be
           this one. The open edits are deliberately KEPT: the point of
           this box over a reload is that the same admin signs back in and
           carries on. If somebody else signs in instead, the login handler
           clears those as well (resetAccountPanels).

           The sign-in box is only emptied when it is not already up: a
           second 401 arriving from a request that was already in flight
           must not wipe what the admin is part-way through typing into it. */
        if (!loginModal.classList.contains("open")) loginForm.reset();
        clearSelfPasswordFields();
        sayPassword("", true);
        ffClear();
        // A player looked up to be forgotten: personal details, cleared for
        // the same reason as the run log (28 Sept 2026). In the Players tab
        // since 29 Sept 2026 (js/admin-players.js).
        if (window.AdminPlayers) window.AdminPlayers.clearPrivate();
        const wasOpen = loginModal.classList.contains("open");
        loginModal.classList.add("open");
        loginError.textContent = "Session expired — log in again.";
        loginError.style.display = "block";
        // Straight into the username box — but only as the box goes up, so
        // a second 401 does not pull focus out of the password mid-typing.
        const userBox = loginForm.querySelector('input[name="username"]');
        if (!wasOpen && userBox) userBox.focus();
    }

    /* Who was signed in on this tab last, kept through a lockOut (which
       clears currentUsername) and cleared by a log out. It is how the login
       handler tells "the same admin, back after the session ran out" — whose
       open edits are waiting under the sign-in box — from somebody else
       sitting down at it, for whom they are not. */
    let lastSignedInAs = "";

    /* Everything a different account must not inherit from the last one:
       the run log, the Missing Pieces and Guides panels (each reloads as the
       new account the next time it is shown), and any form left open by the
       last person — which the new one would otherwise be able to save under
       their own name. The forms are closed without deleting their uploads:
       those were the other account's, and a view-only successor could not
       delete them anyway, so they are left rather than half-cleaned. */
    function resetAccountPanels() {
        ffClear();
        refusedUploads.clear();
        furniRescue.clear();
        Object.keys(COLLECTIONS).forEach(key => closeForm(key));
        closeAdminsForm();
        closeContributorsForm();
        if (window.AdminDeadEnds) window.AdminDeadEnds.reset();
        if (window.AdminGuides) window.AdminGuides.reset();
        if (window.AdminErrors) window.AdminErrors.reset();
        if (window.AdminPlayers) window.AdminPlayers.reset();
        // The Event Entries panel (js/admin-entries.js, 30 Sept 2026).
        if (window.AdminEntries) window.AdminEntries.reset();
        // The Bans tab's Add a ban and open Change forms (29 Sept 2026).
        resetBanForms();
        // The Recolour editor's palette and preview (1 Oct 2026) — the same
        // inheritance, after a lock-out with somebody else signing in.
        if (typeof AdminRecolour !== "undefined" && AdminRecolour && typeof AdminRecolour.reset === "function") AdminRecolour.reset();
    }

    /* The panels that live in files of their own (js/admin-guides.js,
       js/admin-dead-ends.js) hand a 401 back here, so an expired session
       gets the same sign-in box — over the page, with the edit still in it
       underneath — rather than a "reload" button that threw the edit away.
       Recolour already had this, passed to it in showPanel. */
    window.AdminLockOut = () => lockOut();

    /* The Errors panel (js/admin-errors.js, 28 Sept 2026) needs two more
       things from here: who is signed in — its Resolve and Ignore are for
       admins and owners, its Delete for the owner alone, and body.is-viewer
       only says the first — and the page's own Yes/No dialog, rather than
       the browser's confirm(), for its deletes. Read-only; neither lets the
       panel change anything here. */
    window.AdminRole = () => currentUserRole;
    window.AdminConfirm = (message, opts) => showConfirmDialog(message, opts);
    /* And the rest of the page's own boxes (30 Sept 2026), so the panels in
       files of their own (guides, Missing Pieces, Recolour, the Wizard) stop
       using the browser's alert() and prompt(): AdminAlert(markup, title)
       is the one-button box, AdminPrompt(markup, opts) the one with a text
       box, resolving the text or null. AdminBanIp(ip, opts) is a message's
       Ban IP — level, length and reason — for a Missing Pieces lead, and
       resolves true once the ban is saved. */
    window.AdminAlert = (message, title) => showInfoDialog(message, title || "Something Went Wrong");
    window.AdminPrompt = (message, opts) => showPromptDialog(message, opts);
    window.AdminBanIp = (ip, opts) => banIp(ip, opts);
    /* And the other half (30 Sept 2026): a lead's button said Ban IP even
       for an address already banned. AdminIsBanned(ip) is the very check a
       contact message's button uses, and AdminUnbanIp(ip) its Unban IP,
       resolving true once the bans are lifted. "mazerats:bans-changed" is
       sent whenever the ban list is re-read, so the label can follow. */
    window.AdminIsBanned = ip => isBanned(ip);
    window.AdminUnbanIp = ip => unbanIp(ip);

    /* Logging out used to close every form on the spot: unsaved work gone
       without a question, and every picture uploaded during the edit left
       in storage for good, because closeForm only forgets the list of them.
       Now it asks first, as Cancel does, refuses while a save is still in
       flight (see refuseWhileSaving), and discards the uploads properly —
       awaited, because the discard's deletes need the token this is about
       to throw away. */
    let loggingOut = false;

    /* While the discards below are out (a full read of the archive, then
       the deletes), the page is held still: the button says so, and every
       click, key and submit is swallowed before it reaches anything. It
       used to stay live — so a + Add Maze pressed in those seconds opened a
       fresh form, the admin typed into it, and the log out then closed it
       without a word when the awaits came back. body.is-logging-out is
       there for the stylesheet to dim the page by. */
    function setLoggingOut(on) {
        loggingOut = on;
        if (logoutBtn) {
            logoutBtn.disabled = on;
            logoutBtn.textContent = on ? "Logging out…" : "Log out";
        }
        document.body.classList.toggle("is-logging-out", on);
        if (on) document.body.setAttribute("aria-busy", "true");
        else document.body.removeAttribute("aria-busy");
        document.body.style.cursor = on ? "progress" : "";
    }
    ["click", "dblclick", "auxclick", "keydown", "beforeinput", "submit", "paste", "drop", "dragstart"].forEach(type => {
        document.addEventListener(type, e => {
            if (!loggingOut) return;
            e.preventDefault();
            e.stopPropagation();
        }, true);
    });

    async function doLogout() {
        if (loggingOut) return;
        const keys = Object.keys(COLLECTIONS);
        /* The Guides editor lives in js/admin-guides.js and has its own
           unsaved-changes check, which logging out never asked: a guide
           half-written was simply lost. It is asked here beside the maze
           and event forms (window.AdminGuides). */
        const guides = window.AdminGuides || null;
        const refused = () => keys.some(refuseWhileSaving) || !!(guides && guides.refuseWhileSaving());
        /* The contributor form too, and a Missing Pieces record editor
           (30 Sept 2026) — see isContributorFormDirty and isEditorDirty in
           js/admin-dead-ends.js. */
        const deadEnds = window.AdminDeadEnds && typeof window.AdminDeadEnds.isDirty === "function" ? window.AdminDeadEnds : null;
        const dirty = () => keys.some(isFormDirty) || isContributorFormDirty() ||
            !!(deadEnds && deadEnds.isDirty()) || !!(guides && guides.isDirty());
        const saving = () => keys.some(key => COLLECTIONS[key].formEl._saving) || !!(guides && guides.isSaving());
        /* A Recolour palette with unsaved edits (30 Sept 2026) is asked
           about too — its own beforeunload guards a reload, and a log out
           dropped the lot without a word. Asked once and not in the loop's
           dirty(): nothing here closes the palette editor, so its flag
           would still be up after the awaits and the loop would never end. */
        const recolour = typeof AdminRecolour !== "undefined" && AdminRecolour && AdminRecolour.state ? AdminRecolour : null;
        let paletteAsked = false;
        const paletteDirty = () => !paletteAsked && !!(recolour && recolour.state.dirty);
        let loggedOut = false;
        try {
            /* Round again if, once the awaits are back, something is open
               and changed after all. Nothing should be — the page is held
               still meanwhile — but closing a form is the one thing here
               that loses work, so the question is asked again rather than
               assumed, with the page released for the dialog. Declining it
               leaves this admin signed in: nothing has been dropped yet. */
            for (;;) {
                if (refused()) return;
                if (dirty() || paletteDirty()) {
                    const ok = await showConfirmDialog("Log out and discard your unsaved changes? Anything you have added or edited in the open form will be lost.");
                    if (!ok) return;
                    paletteAsked = true;
                    if (refused()) return;
                }
                setLoggingOut(true);
                // Each discard takes its list off the form synchronously; the
                // forms are then closed BEFORE the awaits, or the check inside
                // would find the pictures still in use by the very form being
                // thrown away and spare every one of them.
                const discards = keys.map(key => discardFormUploads(key));
                keys.forEach(key => closeForm(key));
                // Closed here, not only below: left open, dirty() would
                // still be true after the awaits and this would go round
                // for ever. It has no uploads to discard.
                closeContributorsForm();
                if (deadEnds) deadEnds.dropEditor();
                // Its deletes go out at once, with the token still valid.
                if (guides) guides.close();
                // A refused save's parked pictures, and its rescued furni.
                discards.push(forgetRefusedEdits());
                await Promise.all(discards);
                if (!dirty() && !saving()) break;
                setLoggingOut(false);
            }
            loggedOut = true;
        } finally {
            if (!loggedOut) setLoggingOut(false);
        }
        stopFurniPolling();
        writeToken("");
        adminToken = "";
        currentUsername = "";
        currentUserRole = "admin";
        workingRooms = [];
        workingEvents = [];
        archiveLoadedOk = false;
        workingAdmins = [];
        workingContributors = [];
        workingContactMessages = [];
        Object.keys(COLLECTIONS).forEach(key => closeForm(key));
        closeAdminsForm();
        closeContributorsForm();
        adminContent.style.display = "none";
        if (adminRailEl) adminRailEl.style.display = "none";
        landingToggleEl.style.display = "none";
        if (launchAtEl) launchAtEl.style.display = "none";
        if (ffLaunchAtEl) ffLaunchAtEl.style.display = "none";
        if (ffToggleEl) ffToggleEl.style.display = "none";
        if (themeToggleEl) themeToggleEl.style.display = "none";
        // The role's classes too — see lockOut for what they did to the
        // sign-in box of a view-only account.
        document.body.classList.remove("is-viewer", "is-albus");
        // Nothing of this account's is left for the next one: the run log,
        // and the panels in their own files (both reload when next shown,
        // as whoever is signed in by then).
        lastSignedInAs = "";
        ffClear();
        if (window.AdminDeadEnds) window.AdminDeadEnds.reset();
        if (window.AdminGuides) window.AdminGuides.reset();
        if (window.AdminErrors) window.AdminErrors.reset();
        if (window.AdminPlayers) window.AdminPlayers.reset();
        if (window.AdminEntries) window.AdminEntries.reset();
        // The palette editor, asked about above (1 Oct 2026): its edits and
        // its preview were still there for whoever signed in next.
        if (recolour && typeof recolour.reset === "function") recolour.reset();
        loginModal.classList.add("open");
        loginError.style.display = "none";
        loginForm.reset();
        // Not in a form, so the reset above does not reach them.
        clearSelfPasswordFields();
        sayPassword("", true);
        setLoggingOut(false);
    }

    /* ---------- activity log (owner only) ----------

       Admin accounts only: sign-ins, sessions and changes. The server refuses
       a non-owner outright (see netlify/functions/admin-activity.js), so this
       is presentation; the tab is hidden for anyone else by
       applyRoleVisibility rather than showing a panel that would only 403. */
    const activityNavBtn = document.getElementById("activity-nav-btn");
    const activitySummaryEl = document.getElementById("activity-summary");
    const activityVisitorsEl = document.getElementById("activity-visitors");
    const activitySessionsEl = document.getElementById("activity-sessions");
    const activityEventsEl = document.getElementById("activity-events");
    const activityRefreshBtn = document.getElementById("activity-refresh-btn");
    const activityRangeEl = document.getElementById("activity-range");

    /* UTC, and labelled so (1 Oct 2026). Activity was the one panel giving
       the reader's own local time with no zone beside it, while Errors,
       Players, Bans and Entries all say UTC — so two admins in different
       zones read the same row as two different times. The local time is
       on hover, as it is in those panels (formatWhenLocal, for title=). */
    function formatWhen(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "—";
        return d.toLocaleString("en-GB", {
            timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false
        }).replace(",", "") + " UTC";
    }
    function formatWhenLocal(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        return d.toLocaleString("en-GB", {
            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short"
        }) + " (your time)";
    }

    // Reads as a duration rather than a number of seconds — "under a minute"
    // is the honest answer for most single-action sessions.
    function formatDuration(seconds) {
        if (!seconds || seconds < 60) return "under a minute";
        const m = Math.round(seconds / 60);
        if (m < 60) return m + " min";
        const h = Math.floor(m / 60);
        return h + "h " + (m % 60) + "m";
    }

    // The browser family is the useful part of a user-agent string; the rest
    // is noise, and storing more of it than this would be a fingerprint.
    function browserOf(agent) {
        if (!agent) return "";
        if (/Edg\//.test(agent)) return "Edge";
        if (/OPR\//.test(agent)) return "Opera";
        if (/Firefox\//.test(agent)) return "Firefox";
        if (/Chrome\//.test(agent)) return "Chrome";
        if (/Safari\//.test(agent)) return "Safari";
        return "other";
    }

    const ACTIVITY_LABELS = {
        "login": "Signed in",
        "login-failed": "Failed sign-in",
        "session": "Opened the admin",
        "write": "Changed something",
    };

    // A bar per row, sized against the biggest count, so the shape of the
    // list is readable at a glance without a charting library.
    function activityBars(rows, empty) {
        if (!rows || !rows.length) return '<p class="admin-empty">' + empty + '</p>';
        const max = Math.max.apply(null, rows.map(r => r.n)) || 1;
        return rows.map(r => '' +
            '<div class="admin-visitor-row">' +
                '<span class="admin-visitor-label">' + escapeHtml(r.label || r.name || r.day || "—") + '</span>' +
                '<span class="admin-visitor-bar"><i style="width:' + Math.round((r.n / max) * 100) + '%"></i></span>' +
                '<span class="admin-visitor-count">' + r.n + '</span>' +
            '</div>').join("");
    }

    let activityRangeLabel = "";

    function renderVisitors(v) {
        if (!v) { activityVisitorsEl.innerHTML = ""; return; }
        activityVisitorsEl.innerHTML = "" +
            '<div class="admin-activity-summary">' +
                '<span class="admin-activity-stat"><strong>' + v.sessions + '</strong> ' + (v.sessions === 1 ? "visit" : "visits") + '</span>' +
                '<span class="admin-activity-stat"><strong>' + v.events + '</strong> ' + (v.events === 1 ? "interaction" : "interactions") + '</span>' +
                '<span class="admin-hint">' + escapeHtml(activityRangeLabel) + '</span>' +
            '</div>' +
            '<div class="admin-visitor-grid">' +
                '<div><h4 class="admin-visitor-head">By day</h4>' + activityBars(v.byDay, "Nothing yet.") + '</div>' +
                '<div><h4 class="admin-visitor-head">What happened</h4>' + activityBars(v.byName, "Nothing yet.") + '</div>' +
                '<div><h4 class="admin-visitor-head">Most opened mazes</h4>' + activityBars(v.topMazes, "No mazes opened yet.") + '</div>' +
                '<div><h4 class="admin-visitor-head">Most opened furni</h4>' + activityBars(v.topFurni, "No furni opened yet.") + '</div>' +
            '</div>';
    }

    const RANGE_WORDS = {
        "24h": "in the past 24 hours",
        "today": "today",
        "week": "this week",
        "7d": "in the past 7 days",
        "30d": "in the past 30 days",
        "all": "in everything still kept",
    };

    function renderActivity(data) {
        activityRangeLabel = RANGE_WORDS[data.range] || "";
        renderVisitors(data.visitors);
        const c = data.counts || {};
        activitySummaryEl.innerHTML = "" +
            '<span class="admin-activity-stat"><strong>' + c.sessions + '</strong> ' + (c.sessions === 1 ? "session" : "sessions") + '</span>' +
            '<span class="admin-activity-stat"><strong>' + c.logins + '</strong> ' + (c.logins === 1 ? "sign-in" : "sign-ins") + '</span>' +
            '<span class="admin-activity-stat' + (c.failedLogins ? " is-warn" : "") + '"><strong>' +
                c.failedLogins + '</strong> failed</span>' +
            '<span class="admin-activity-stat"><strong>' + c.writes + '</strong> ' + (c.writes === 1 ? "change" : "changes") + '</span>' +
            '<span class="admin-hint">' + escapeHtml(activityRangeLabel) + '</span>' +
            (data.truncated ? '<span class="admin-hint">showing the most recent ' + c.events + '</span>' : "");

        if (!data.sessions.length) {
            activitySessionsEl.innerHTML = '<p class="admin-empty">No sessions recorded yet.</p>';
        } else {
            activitySessionsEl.innerHTML = data.sessions.map(s => '' +
                '<div class="chrome-list-row admin-row admin-activity-row">' +
                    '<div class="row-info">' +
                        '<h3>' + escapeHtml(s.username) + '</h3>' +
                        '<p class="row-creator"><span title="' + escapeHtml(formatWhenLocal(s.startedAt)) + '">' + escapeHtml(formatWhen(s.startedAt)) + '</span>' +
                            ' &middot; active for ' + escapeHtml(formatDuration(s.activeSeconds)) + '</p>' +
                    '</div>' +
                    '<div class="row-side">' +
                        '<span class="admin-activity-meta">' + s.writes + ' change' + (s.writes === 1 ? "" : "s") + '</span>' +
                        '<span class="admin-activity-meta">' + escapeHtml(s.ip || "no address") + '</span>' +
                        '<span class="admin-activity-meta">' + escapeHtml(browserOf(s.agent)) + '</span>' +
                    '</div>' +
                '</div>').join("");
        }

        if (!data.events.length) {
            activityEventsEl.innerHTML = '<p class="admin-empty">Nothing logged yet.</p>';
        } else {
            activityEventsEl.innerHTML = data.events.map(e => {
                const what = e.type === "write"
                    ? e.method + " " + (e.endpoint || "") + (e.target ? " → " + e.target : "")
                    : (e.reason || e.note || "");
                return '' +
                    '<div class="chrome-list-row admin-row admin-activity-row' +
                        (e.type === "login-failed" ? " is-warn" : "") + '">' +
                        '<div class="row-info">' +
                            '<h3>' + escapeHtml(ACTIVITY_LABELS[e.type] || e.type) +
                                (e.username ? ' <span class="admin-you-tag">' + escapeHtml(e.username) + '</span>' : "") + '</h3>' +
                            (what ? '<p class="row-creator">' + escapeHtml(what) + '</p>' : "") +
                        '</div>' +
                        '<div class="row-side">' +
                            '<span class="admin-activity-meta" title="' + escapeHtml(formatWhenLocal(e.at)) + '">' + escapeHtml(formatWhen(e.at)) + '</span>' +
                            '<span class="admin-activity-meta">' + escapeHtml(e.ip || "") + '</span>' +
                        '</div>' +
                    '</div>';
            }).join("");
        }
    }

    async function loadActivity() {
        if (!canReadActivity()) return;
        activitySummaryEl.innerHTML = '<span class="admin-hint">Loading…</span>';
        try {
            renderActivity(await Api.getAdminActivity(adminToken, activityRangeEl && activityRangeEl.value));
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            activitySummaryEl.innerHTML = '<span class="admin-hint">' +
                escapeHtml(err.message || "Couldn't load the activity log.") + '</span>';
            activitySessionsEl.innerHTML = "";
            activityEventsEl.innerHTML = "";
        }
    }

    if (activityRefreshBtn) activityRefreshBtn.addEventListener("click", loadActivity);
    if (activityRangeEl) activityRangeEl.addEventListener("change", loadActivity);

    /* ---------- Fallin' Furni: the run log ----------

       Everything on this panel comes from ff-runs.js in one request, already
       aggregated. The page formats; it does not calculate. That split is on
       purpose — a percentage worked out here and again in the endpoint is a
       percentage that will eventually disagree with itself.

       Loaded when the panel is first opened rather than on sign-in: it is the
       heaviest read on the page and most visits to the admin never look at
       it. */
    const ffRangeEl = document.getElementById("ff-range");
    const ffRefreshBtn = document.getElementById("ff-refresh-btn");
    const ffSummaryEl = document.getElementById("ff-summary");
    const ffChartsEl = document.getElementById("ff-charts");
    const ffLevelsEl = document.getElementById("ff-levels-table");
    const ffPlayersEl = document.getElementById("ff-players-table");
    const ffAddressesEl = document.getElementById("ff-addresses-table");
    const ffRunsEl = document.getElementById("ff-runs");
    const ffKeepEl = document.getElementById("ff-keep-days");

    // mm:ss, and h:mm:ss only once there is an hour to show.
    function ffClock(ms) {
        const total = Math.max(0, Math.round((ms || 0) / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = n => String(n).padStart(2, "0");
        return h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
    }

    function ffDate(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "—";
        return d.toLocaleString(undefined, {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
        });
    }

    /* The game's own words for how a round ended, said in English. An
       unrecognised token is shown as-is rather than hidden: a new ending
       added to the game should appear here as something odd to look up, not
       vanish into a blank cell. */
    /* Two generations of words. "time", "poi" and "quit" are what the game
       sends today — see endedBecause in js/room-game.js, and the "quit" that
       js/fallinfurni.js stamps on the round a player walks out of. The older
       four (seated/timeout/wrong/decoy) are from before the rules settled:
       nothing sends them now, but rows recorded then still carry them, and a
       range reaching back that far should read the same as one that does
       not. "poi" is the original's auto-kick chair — the one seat that ends
       the round the moment it is sat on — so it is named for what the
       player did, not for the internal role name. */
    const FF_WHY = {
        time: "Ran out of time",
        poi: "Sat on the auto-kick chair",
        quit: "Walked away",
        complete: "Finished",
        seated: "All seats taken",
        timeout: "Ran out of time",
        wrong: "Sat in the wrong seat",
        decoy: "Sat on a decoy"
    };
    const ffWhy = w => FF_WHY[w] || w || "—";

    // "Anonymous" is a real row, not a missing one: how many runs were NOT
    // signed in is the first thing anybody asks of a leaderboard game.
    const ffName = n => n || "Anonymous";

    function ffStat(n, one, many, warn) {
        return '<span class="admin-activity-stat' + (warn && n ? " is-warn" : "") + '">' +
            '<strong>' + n + '</strong> ' + (n === 1 ? one : many) + '</span>';
    }

    function ffRenderSummary(d) {
        const t = d.totals;
        const pct = t.finished ? Math.round((t.won / t.finished) * 100) : 0;
        ffSummaryEl.innerHTML =
            ffStat(t.runs, "run", "runs") +
            ffStat(t.players, "signed-in player", "signed-in players") +
            /* Only when there are any. A site where nobody plays signed out
               should not carry a permanent "0 named without signing in". */
            ((t.namedAnon || 0) ? ffStat(t.namedAnon, "named without signing in",
                "named without signing in") : "") +
            ffStat(t.levelsPlayed, "round played", "rounds played") +
            '<span class="admin-activity-stat"><strong>' + pct + '%</strong> of finished runs won</span>' +
            '<span class="admin-activity-stat"><strong>' + t.medianCleared + '</strong> levels cleared, typically</span>' +
            '<span class="admin-activity-stat"><strong>' + ffClock(t.medianMs) + '</strong> median run</span>' +
            '<span class="admin-activity-stat"><strong>' + t.bestCleared + '</strong> best run</span>' +
            ffStat(t.touch, "run on a touchscreen", "runs on a touchscreen") +
            ffStat(t.addresses || 0, "address", "addresses") +
            /* Warned, because it is the only figure here that is ever a
               reason to go and look at something. Zero shows nothing at all
               rather than "0 shared", which would read as a finding. */
            ((t.sharedAddresses || 0)
                ? ffStat(t.sharedAddresses, "address with several accounts",
                    "addresses with several accounts", true)
                : "") +
            ((t.noAddress || 0)
                ? ffStat(t.noAddress, "run with no address", "runs with no address")
                : "") +
            (d.truncated ? '<span class="admin-activity-stat is-warn"><strong>!</strong> only the newest runs are shown</span>' : "");
    }

    function ffRenderCharts(d) {
        const t = d.totals;
        const signedOut = t.runs - t.signedIn;
        /* Wrapped in .admin-visitor-grid, which is what makes the four of
           them sit side by side — the class on the container is only a
           margin. Without it they stack, and a month of daily bars pushes
           everything else off the bottom of the panel. */
        ffChartsEl.innerHTML = '<div class="admin-visitor-grid">' +
            '<div><h4 class="admin-visitor-head">Runs per day</h4>' +
                activityBars(d.byDay, "Nothing played yet.") + '</div>' +
            '<div><h4 class="admin-visitor-head">How runs ended</h4>' +
                activityBars(d.byOutcome.map(r => ({ label: ffOutcome(r.label), n: r.n })), "Nothing yet.") + '</div>' +
            '<div><h4 class="admin-visitor-head">Why rounds were lost</h4>' +
                activityBars(d.byWhy.map(r => ({ label: ffWhy(r.label), n: r.n })), "No rounds lost yet.") + '</div>' +
            '<div><h4 class="admin-visitor-head">Signed in?</h4>' +
                activityBars([
                    { label: "Signed in", n: t.signedIn },
                    { label: "Anonymous", n: signedOut }
                ], "Nothing yet.") + '</div>' +
            '</div>';
    }

    const FF_OUTCOME = { won: "Cleared every level", lost: "Out of lives", abandoned: "Walked away" };
    const ffOutcome = o => FF_OUTCOME[o] || o;

    function ffRenderLevels(d) {
        const body = ffLevelsEl.querySelector("tbody");
        if (!d.byLevel.length) {
            body.innerHTML = '<tr><td colspan="7" class="admin-empty">No rounds played yet.</td></tr>';
            return;
        }
        body.innerHTML = d.byLevel.map(l => {
            /* The clear rate is the number this table exists for, so it is
               also the one thing coloured: under half is a level most people
               do not get past. */
            const cls = l.clearPct < 50 ? " ff-bad" : (l.clearPct > 90 ? " ff-good" : "");
            return '<tr>' +
                /* The id under the name, quietly. Two rows can legitimately
                   show the same name now — a level renamed to something a
                   deleted one used to be called — and without the id there
                   would be no way to tell which was which. */
                '<td>' + escapeHtml(l.name) +
                    (l.id ? '<br><span class="admin-hint">' + escapeHtml(l.id) + '</span>' : "") + '</td>' +
                '<td class="ff-num">' + l.plays + '</td>' +
                '<td class="ff-num' + cls + '">' + l.clearPct + '%</td>' +
                '<td class="ff-num">' + ffClock(l.medianSeconds * 1000) + '</td>' +
                '<td class="ff-num">' + l.seatPct + '%</td>' +
                '<td class="ff-num">' + l.retries + '</td>' +
                '<td>' + (l.why.length
                    ? l.why.map(w => escapeHtml(ffWhy(w.label)) + " \u00d7" + w.n).join(", ")
                    : '<span class="admin-hint">Never lost</span>') + '</td>' +
            '</tr>';
        }).join("");
    }

    function ffRenderPlayers(d) {
        const body = ffPlayersEl.querySelector("tbody");
        if (!d.byPlayer.length) {
            body.innerHTML = '<tr><td colspan="7" class="admin-empty">Nobody has played yet.</td></tr>';
            return;
        }
        /* WHO THE ROW IS, in the three flavours ff-runs.js can tell apart.

           The distinction is the point of the column, so it is carried in the
           label rather than left to be inferred from a name: a checked Discord
           account, a habbo name somebody typed about themselves, and the rest.
           "said in the game" is doing real work — it is the difference between
           a name the site established and a name it was handed. */
        /* The Origins hotel, when it isn't the English one (30 Sept 2026):
           the same name on two hotels is two players, and without this they
           showed as two identical lines. */
        const hotelOf = (h) => (h && h !== "COM" ? " (" + escapeHtml(h) + ")" : "");
        const whoCell = (p) => {
            if (p.kind === "player") {
                return escapeHtml(p.name) +
                    (p.habbo ? ' <span class="admin-hint">as ' + escapeHtml(p.habbo) + hotelOf(p.hotel) + ' in the game</span>' : "");
            }
            if (p.kind === "habbo") {
                return escapeHtml(p.habbo) + hotelOf(p.hotel) +
                    ' <span class="admin-hint">said in the game, not signed in</span>';
            }
            return 'Anonymous <span class="admin-hint">(no name given)</span>';
        };
        body.innerHTML = d.byPlayer.map(p => '<tr>' +
            '<td>' + whoCell(p) + '</td>' +
            '<td class="ff-num">' + p.runs + '</td>' +
            '<td class="ff-num">' + p.best + '</td>' +
            '<td class="ff-num">' + Number(p.bestPoints || 0).toLocaleString() + '</td>' +
            '<td class="ff-num">' + ffClock(p.totalMs) + '</td>' +
            '<td>' + escapeHtml(ffDate(p.first)) + '</td>' +
            '<td>' + escapeHtml(ffDate(p.last)) + '</td>' +
        '</tr>').join("");
    }

    /* ---- ADDRESSES.

       Every other table here groups by what the run SAYS about who played it.
       This one groups by where it came from, which is the only grouping that
       survives somebody signing in under a second name.

       The row that matters is the one with two or more accounts on it, so
       those are marked and sorted to the top by the endpoint. The marking is
       deliberately "worth a look" rather than "caught": everything in the
       hint above this table about families, halls and mobile networks is
       true, and a red flag on an office wifi point would be a false
       accusation the panel had no way to withdraw.

       Runs from before addresses were recorded have no address at all. They
       are shown as their own row and labelled, rather than dropped — a table
       that silently omitted them would read as "nobody played" for every
       range that reaches back past this change. */
    function ffRenderAddresses(d) {
        if (!ffAddressesEl) return;
        const body = ffAddressesEl.querySelector("tbody");
        const rows = d.byIp || [];
        /* The server sends addresses only to accounts that may see them
           (personal: false for the rest — see ff-runs.js), and an empty
           table would otherwise read as "nobody played". */
        if (d.personal === false) {
            body.innerHTML = '<tr><td colspan="7" class="admin-empty">Addresses are shown to owners and admins only.</td></tr>';
            return;
        }
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="7" class="admin-empty">No runs in this range.</td></tr>';
            return;
        }
        body.innerHTML = rows.map(a => {
            /* Two lists, kept apart. Accounts are what the site checked;
               habbo names are what people said. Merging them into one column
               of names would make an address look like it had six identities
               on it when it has one account and that account's own habbo name
               written underneath — the opposite of what this table is for. */
            const accounts = a.players.length
                ? a.players.map(p => escapeHtml(p.label) + ' <span class="admin-hint">×' + p.n + '</span>').join(", ")
                : '<span class="admin-hint">Nobody signed in</span>';
            const habbos = (a.habbos || []).length
                ? '<div class="admin-hint">In the game: ' +
                  a.habbos.map(h => escapeHtml(h.label) + ' ×' + h.n).join(", ") + '</div>'
                : "";
            const who = accounts + habbos;
            return '<tr>' +
                '<td>' + (a.ip
                    ? '<code>' + escapeHtml(a.ip) + '</code>' +
                      (a.shared ? ' <span class="admin-activity-stat is-warn"><strong>' + a.named + '</strong> accounts</span>' : "")
                    : '<span class="admin-hint">Not recorded</span>') + '</td>' +
                '<td>' + who + '</td>' +
                '<td class="ff-num">' + a.runs + '</td>' +
                '<td class="ff-num">' + a.anon + '</td>' +
                '<td class="ff-num">' + a.bestCleared + '</td>' +
                '<td>' + escapeHtml(ffDate(a.first)) + '</td>' +
                '<td>' + escapeHtml(ffDate(a.last)) + '</td>' +
            '</tr>';
        }).join("");
    }

    /* One run, with its rounds folded away inside a <details>. Everything is
       in the markup from the start rather than fetched when it opens: the
       rounds came down with the run, and sixty collapsed lists cost less than
       sixty requests would. */
    function ffRenderRuns(d) {
        if (!d.recent.length) {
            ffRunsEl.innerHTML = '<p class="admin-empty">No runs in this range.</p>';
            return;
        }
        ffRunsEl.innerHTML = d.recent.map(r => {
            const rounds = (r.levels || []).map((lv, i) =>
                '<tr>' +
                    '<td class="ff-num">' + (i + 1) + '</td>' +
                    '<td>' + escapeHtml(lv.name) + (lv.retried ? ' <span class="admin-hint">(retry)</span>' : "") + '</td>' +
                    '<td>' + (lv.won ? '<span class="ff-good">Cleared</span>' : '<span class="ff-bad">' + escapeHtml(ffWhy(lv.why)) + '</span>') + '</td>' +
                    '<td class="ff-num">' + lv.seats + '/' + lv.seatsOf + '</td>' +
                    '<td class="ff-num">' + lv.seconds + 's of ' + lv.allowed + 's</td>' +
                    '<td class="ff-num">' + (lv.penalty ? "+" + lv.penalty + "s" : "—") + '</td>' +
                    '<td class="ff-num">' + Number(lv.points || 0).toLocaleString() + '</td>' +
                '</tr>').join("");

            return '<details class="ff-run">' +
                '<summary>' +
                    /* Signed in shows the account; signed out shows the name
                       given in the game, marked with a question mark so the
                       row never reads as a checked identity. Neither means
                       "Anonymous" any more unless nothing was given at all. */
                    '<span class="ff-run-who">' +
                        (r.player ? escapeHtml(r.player)
                            : r.habbo ? escapeHtml(r.habbo) + (r.hotel && r.hotel !== "COM" ? " (" + escapeHtml(r.hotel) + ")" : "") + '<span class="admin-hint" title="Typed into the game, not signed in">?</span>'
                            : "Anonymous") +
                    '</span>' +
                    '<span class="ff-run-tag ff-' + escapeHtml(r.outcome) + '">' + escapeHtml(ffOutcome(r.outcome)) + '</span>' +
                    '<span class="ff-run-meta">' + r.cleared + ' cleared</span>' +
                    '<span class="ff-run-meta">' + Number(r.points || 0).toLocaleString() + ' pts</span>' +
                    '<span class="ff-run-meta">' + ffClock(r.ms) + '</span>' +
                    '<span class="ff-run-meta">' + escapeHtml(ffDate(r.at)) + '</span>' +
                '</summary>' +
                '<div class="ff-run-body">' +
                    '<p class="admin-hint">' +
                        'Lives: ' + (r.lives ? r.lives.spent : 0) + ' spent, ' +
                        (r.lives ? r.lives.won : 0) + ' earned, ' +
                        (r.lives ? r.lives.left : 0) + ' left. ' +
                        (r.client && r.client.w ? r.client.w + "\u00d7" + r.client.h + " window" : "Window size not recorded") +
                        (r.client && r.client.touch ? ", touchscreen." : ".") +
                    '</p>' +
                    '<div class="ff-table-wrap"><table class="ff-table">' +
                        '<thead><tr><th class="ff-num">#</th><th>Level</th><th>How it ended</th>' +
                        '<th class="ff-num">Seats</th><th class="ff-num">Time</th>' +
                        '<th class="ff-num">Penalty</th><th class="ff-num">Points</th></tr></thead>' +
                        '<tbody>' + rounds + '</tbody>' +
                    '</table></div>' +
                '</div>' +
            '</details>';
        }).join("");
    }

    function ffRender(d) {
        if (ffKeepEl) ffKeepEl.textContent = String(d.keepDays || 180);
        ffRenderSummary(d);
        ffRenderCharts(d);
        ffRenderLevels(d);
        ffRenderPlayers(d);
        ffRenderAddresses(d);
        ffRenderRuns(d);
    }

    let ffLoaded = false;
    let recolourMounted = false;

    /* Counted, like the Missing Pieces panel's loads: a read still out when
       the session ends (see ffClear) must not draw the last account's run
       log — addresses and all — over the next one's panel. */
    let ffLoadGen = 0;

    async function loadFallinFurni() {
        if (!adminToken) return;
        const gen = ++ffLoadGen;
        ffSummaryEl.innerHTML = '<span class="admin-hint">Loading…</span>';
        try {
            const data = await Api.getFallinFurniRuns(adminToken, ffRangeEl && ffRangeEl.value);
            if (gen !== ffLoadGen) return;
            ffRender(data);
            ffLoaded = true;
        } catch (err) {
            if (gen !== ffLoadGen) return;
            if (err.status === 401) { lockOut(); return; }
            ffSummaryEl.innerHTML = '<span class="admin-hint">' +
                escapeHtml(err.message || "Couldn't load the run log.") + '</span>';
        }
    }

    /* The run log, emptied and marked unloaded. It was loaded once per page
       (ffLoaded), so after a log out, or a session running out, the tables
       stayed filled for whoever signed in next on the same tab: an owner's
       view of every player's address, read by a view-only account that the
       server would never have sent them to. Called by lockOut and doLogout;
       the next showing of the panel reads it again as the new account. */
    function ffClear() {
        ffLoadGen++;
        ffLoaded = false;
        if (ffSummaryEl) ffSummaryEl.innerHTML = "";
        if (ffChartsEl) ffChartsEl.innerHTML = "";
        [ffLevelsEl, ffPlayersEl, ffAddressesEl].forEach(table => {
            const body = table && table.querySelector("tbody");
            if (body) body.innerHTML = "";
        });
        if (ffRunsEl) ffRunsEl.innerHTML = "";
    }

    if (ffRefreshBtn) ffRefreshBtn.addEventListener("click", loadFallinFurni);
    if (ffRangeEl) ffRangeEl.addEventListener("change", loadFallinFurni);

    /* Running a furni scan is owner-only — see the handler in
       netlify/functions/furni-scan-local.js, which is where the rule
       actually lives. Everything here is presentation: a standard admin
       never sees a scan control rather than seeing one that 403s. They keep
       full use of the furni EDITOR (hide/remove/add by hand) — it is only
       starting a scan that is restricted. */
    function canScanFurni() {
        return currentUserRole === "owner";
    }

    /* A scan runs on the machine serving this page, so it can only be
       started from a page this machine is serving. Judged by hostname
       rather than by asking the server: the answer never changes for the
       life of the page, and a button that appears and then explains itself
       away after a round trip is worse than one that was never there.

       The server refuses regardless (netlify/functions/furni-scan-local.js
       returns 501 when NETLIFY_DEV is unset) — this only decides which of
       the two explanations the owner sees. */
    function isLocalSite() {
        return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname);
    }

    function updateFurniLocality() {
        const local = isLocalSite();
        if (furniScanLocalEl) furniScanLocalEl.hidden = !local;
        if (furniScanRemoteEl) furniScanRemoteEl.hidden = local;
    }

    // The activity log answers "what have my admins been doing", which is an
    // owner's question about their colleagues, not an admin's about
    // themselves. Same rule as the scan, named separately so the reason each
    // one is restricted stays legible.
    function canReadActivity() {
        return currentUserRole === "owner";
    }

    /* A view-only account can read every screen here and change nothing. The
       rule is enforced server-side — every write endpoint refuses them, see
       canWrite in netlify/functions/_auth.js — so everything below is about
       not showing somebody a page full of buttons that would only fail.

       Done with a class on <body> rather than by editing each of the dozen
       renderers that emit an Edit or Delete button: a blanket rule cannot be
       forgotten when the next list is added, whereas a per-renderer check
       silently isn't there.

       An Albus account reads as view-only HERE, which is exactly right —
       the archive, the events, the accounts and the settings are all
       read-only to it. The one place it is not is the atlas panel, and
       that exception is made in the stylesheet (body.is-albus, see
       css/wizard.css) rather than by weakening this: the blanket rule stays
       blanket, and the exception is one selector naming one panel. */
    function canWrite() {
        return currentUserRole === "owner" || currentUserRole === "admin";
    }

    // And the other half of that line: who may change the atlas.
    // Mirrors WRITE_SCOPES in netlify/functions/_auth.js, which is where the
    // rule is actually enforced.
    function canWriteWizard() {
        return canWrite() || currentUserRole === "wizard";
    }

    /* The greying-out in the CSS uses pointer-events: none, which stops a
       mouse but says nothing about tabbing to a button and pressing Enter —
       that still fires a click, on the button itself.

       So rather than keep a second copy of the list of disabled controls in
       here (two lists that would drift apart the first time either was
       edited), this asks the CSS: if the element the click landed on is
       pointer-inert, the stylesheet has already decided it is off, and the
       click is dropped. A mouse click can never reach such an element in the
       first place, so in practice this only ever fires for the keyboard. */
    document.addEventListener("click", e => {
        if (!document.body.classList.contains("is-viewer")) return;
        /* Never the sign-in box. Its Unlock button sits in an
           .admin-form-actions like any other form's, so the view-only
           greying caught it, and this then cancelled the one press a
           view-only account needed to sign back in after its session ran
           out. lockOut and doLogout now take the class off as well; this
           is the backstop for anything that puts the box up without them. */
        if (e.target.closest("#login-form")) return;
        const control = e.target.closest("button, a");
        if (!control || getComputedStyle(control).pointerEvents !== "none") return;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    function applyRoleVisibility() {
        const owner = canScanFurni();
        document.body.classList.toggle("is-viewer", !canWrite());
        // Lifts the blanket greying back off the atlas panel alone. See
        // canWrite above for why the exception lives in a class rather than
        // in the rule.
        document.body.classList.toggle("is-albus", currentUserRole === "wizard");
        if (activityNavBtn) activityNavBtn.hidden = !canReadActivity();
        if (furniSidebar) furniSidebar.hidden = !owner;
        /* The Players tab (js/admin-players.js, 29 Sept 2026) draws its
           write buttons and the owner's Forget from the role, so it is
           told when that is known or has changed; it empties anything an
           owner looked up there when the account is not one. */
        if (window.AdminPlayers) window.AdminPlayers.roleChanged();
        /* The account tab's change-password box stays for EVERY role, view
           only included: changing your own password is the "self" scope,
           which WRITE_SCOPES in _auth.js gives to all of them. Nothing here
           hides or greys it, and #self-password-btn is deliberately not in
           the is-viewer list in style.css. */
        if (owner) updateFurniLocality();
        // Only an owner has anything to poll for, and furni-scan-status
        // would just be an authenticated request answering "nothing" every
        // 2.5s for everyone else.
        if (owner) startFurniPolling();
        else stopFurniPolling();
        /* An Albus account opens on the one panel it came here to use.
           Landing on Mazes — a list it can read and not touch — would say
           the account was mostly broken rather than mostly elsewhere.
           Otherwise, whatever was open last time. */
        const opening = currentUserRole === "wizard" ? "wizard" : rememberedPanel();
        if (opening) showPanel(opening);
    }

    /* A load that failed has to look different from a load that found
       nothing. Every list below has an empty state ("No messages yet.", "No
       contributors added yet.") and, before this, a failed read left either
       that or a blank box — both of which say something untrue about the
       data. These two write the failure where the list would have been, and
       one line across the top of the panel for the failure that matters
       most (the archive itself). Built with textContent: an error message
       can quote the server, and is not markup. */
    function showLoadFailure(listEl, message) {
        if (!listEl) return;
        listEl.innerHTML = "";
        const line = document.createElement("p");
        line.className = "admin-empty admin-form-error";
        line.setAttribute("role", "alert");
        line.textContent = message;
        listEl.appendChild(line);
    }

    let loadBannerEl = null;
    function showLoadBanner(message) {
        if (!adminContent) return;
        if (!loadBannerEl) {
            loadBannerEl = document.createElement("p");
            loadBannerEl.className = "admin-form-error admin-load-banner";
            loadBannerEl.setAttribute("role", "alert");
            loadBannerEl.style.padding = "10px 14px";
            loadBannerEl.style.margin = "0 0 12px";
            loadBannerEl.style.border = "1px solid currentColor";
        }
        loadBannerEl.textContent = message;
        adminContent.prepend(loadBannerEl);
    }
    function clearLoadBanner() {
        if (loadBannerEl) loadBannerEl.remove();
    }

    async function enterAdmin() {
        loginModal.classList.remove("open");
        adminContent.style.display = "block";
        if (adminRailEl) adminRailEl.style.display = "flex";
        if (adminSessionUserEl) {
            adminSessionUserEl.textContent = currentUsername || "";
            // Every role by its own name (1 Oct 2026): this said "Admin" for
            // View only and Albus accounts, which can't change anything.
            adminSessionUserEl.title = ROLE_LABELS[currentUserRole] || "Admin";
        }
        landingToggleEl.style.display = "flex";
        if (launchAtEl) launchAtEl.style.display = "flex";
        if (ffLaunchAtEl) ffLaunchAtEl.style.display = "flex";
        if (ffToggleEl) ffToggleEl.style.display = "block";
        if (themeToggleEl) themeToggleEl.style.display = "flex";
        /* The glyph palette used to be shown here, when it was a docked
           column of its own. It is a tab panel now: the strip is what login
           reveals (#admin-rail above) and the panel opens with its tab. */
        // The full records, not the packed public ones — the furni editor
        // works on coverage, hidden flags and the rest, none of which the
        // site's own payload carries.
        /* Caught here, and not left to the caller. By this line the login
           modal is already closed, so an error thrown out of here landed in
           the login form's catch and wrote itself into a modal nobody could
           see — and, because the loaders below never ran, left every other
           panel blank as well. From the stored-token path at the bottom of
           the file it was worse: an unhandled rejection and a silent, empty
           panel.

           A 401 is the session having gone between the token check and this
           read, and gets the same "Session expired" login as everywhere
           else. Anything else is the archive failing to load, which is said
           plainly in the panel and in the two lists it would have filled
           (an empty list would otherwise read as "No mazes yet — add the
           first one below", which is precisely the wrong thing to believe
           with the database briefly unreachable). Everything else still
           loads: the messages, bans and settings have nothing to do with
           whether the maze list came back. */
        clearLoadBanner();
        let archiveLoaded = false;
        try {
            // With the deleted records' addresses — see readFullWithRetired.
            const [rooms, events] = await Promise.all([
                readFullWithRetired("rooms"),
                readFullWithRetired("events")
            ]);
            workingRooms = rooms;
            workingEvents = events;
            archiveLoaded = true;
            archiveLoadedOk = true;
        } catch (err) {
            if (err && err.status === 401) { lockOut(); return; }
            workingRooms = [];
            workingEvents = [];
            archiveLoadedOk = false;
            showLoadBanner("Couldn't load the mazes and events" +
                (err && err.message ? " (" + err.message + ")" : "") +
                ". Nothing has been changed — reload the page to try again.");
        }
        if (archiveLoaded) {
            renderList("rooms");
            renderList("events");
        } else {
            ["rooms", "events"].forEach(key => {
                showLoadFailure(COLLECTIONS[key].listEl,
                    "Couldn't load the " + COLLECTIONS[key].plural.toLowerCase() + ". Reload the page to try again.");
            });
        }
        applyRoleVisibility();
        startWizardPanel();
        loadActivity();
        loadAdmins();
        loadLandingState();
        loadContributors();
        loadContactMessages();
        loadBans();
        loadDaily();
    }

    /* ---------- the atlas panel ----------

       js/admin-wizard.js is a separate file with its own state, and this is
       the whole of the join between them: it gets the session, the role and
       the shared furniture, and nothing else in this file knows it exists.
       Written as one handover rather than as a pile of globals so there is
       exactly one place to look when the two have to agree about something.

       The token is passed as a function, not a value. A session can be
       renewed or dropped while the panel is open, and a copy taken at
       start-up would be the old one for the rest of the sitting.

       Called on every enterAdmin, which includes signing back in after the
       session ran out. AdminWizard.init is safe to call twice: the second
       call swaps in this context and reloads, rather than building a second
       map engine with a second set of listeners (which is what it did, and
       every drag and keypress then ran twice). */
    function startWizardPanel() {
        if (typeof AdminWizard === "undefined") return;
        AdminWizard.init({
            api: Api,
            token: () => adminToken,
            canWrite: canWriteWizard,
            escapeHtml,
            lockOut,
            wireDropzone,
            confirm: showConfirmDialog,
            // Bound to the wizard folder here rather than at each of the
            // half-dozen call sites inside the panel: everything that panel
            // uploads belongs there, and a forgotten argument would be an
            // upload an Albus account is refused for reasons that would take
            // an afternoon to work out.
            uploadImage: (prefix, file) => uploadImageFile(prefix, file, "wizard")
        });
    }

    // ---------- image uploads ----------

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Couldn't read that file."));
            reader.readAsDataURL(file);
        });
    }

    /* folder decides where the image is filed and, with it, who is allowed
       to put it there: "rooms" (the default — the archive) needs a full
       admin, "wizard" needs only the atlas scope, which is what lets an
       Albus account upload a room picture without gaining the run of the
       maze archive's storage. See FOLDER_SCOPES in
       netlify/functions/upload.js. */
    /* The most an upload may be, and it is the browser's job to know it.

       This has to match MAX_BYTES in netlify/functions/upload.js, and that
       limit is itself set by what Netlify will carry: a function's request
       payload caps at 6MB, and an image travels as base64 inside JSON, which
       is four bytes on the wire for every three of picture. So 4MB of image
       is about 5.5MB of request — the most that fits with room to spare.

       The check belongs HERE rather than only on the server because of what
       happens without it. Nothing stopped a thirty-megabyte PNG being read
       into a data URL, turned into a forty-megabyte string and posted in one
       piece; the server has to buffer the whole thing before it can reach
       the line that would have rejected it, and locally that is enough to
       take the dev server down with it. A limit you can only discover by
       exceeding it is not a limit, it is a trap. */
    const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

    // What a picture is allowed to grow to before it is scaled down. Wide
    // enough for an illustration across the whole atlas sheet, and for a
    // room screenshot at more than life size.
    const MAX_UPLOAD_EDGE = 3000;

    const readableSize = bytes => bytes >= 1024 * 1024
        ? (bytes / 1024 / 1024).toFixed(1) + "MB"
        : Math.max(1, Math.round(bytes / 1024)) + "KB";

    /* Brings an oversized picture under the limit by making it smaller, and
       says so, rather than refusing it.

       Refusing was the other option and it is worse for what this is for:
       the pictures being uploaded are illustrations and screenshots, they
       come off a camera or a canvas at whatever size that tool used, and
       "make it smaller yourself and come back" is a task nobody wants in
       the middle of laying out a map.

       The FORMAT is kept — a PNG stays a PNG — because the map's art is
       flat colour and pixel edges, and quietly re-encoding that as JPEG
       would soften every one of them. Only the dimensions come down, in
       steps, until it fits. */
    async function shrinkForUpload(file) {
        const bitmap = await createImageBitmap(file).catch(() => null);
        if (!bitmap) return null;

        const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
        let scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(bitmap.width, bitmap.height));

        for (let attempt = 0; attempt < 6; attempt++) {
            const w = Math.max(1, Math.round(bitmap.width * scale));
            const h = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx2d = canvas.getContext("2d");
            ctx2d.imageSmoothingQuality = "high";
            ctx2d.drawImage(bitmap, 0, 0, w, h);

            const blob = await new Promise(res => canvas.toBlob(res, type, 0.92));
            if (!blob) return null;
            if (blob.size <= MAX_UPLOAD_BYTES) {
                bitmap.close && bitmap.close();
                return { blob, width: w, height: h };
            }
            // Still too big: take another 25% off and try again.
            scale *= 0.75;
        }
        bitmap.close && bitmap.close();
        return null;
    }

    async function uploadImageFile(prefix, file, folder) {
        let toSend = file;
        let notice = "";

        if (file.size > MAX_UPLOAD_BYTES) {
            const original = readableSize(file.size);
            const smaller = await shrinkForUpload(file);
            if (!smaller) {
                throw new Error(`That image is ${original}, and the most that can be uploaded is `
                    + `${readableSize(MAX_UPLOAD_BYTES)}. It could not be scaled down automatically — `
                    + `save it smaller and try again.`);
            }
            toSend = new File([smaller.blob], file.name, { type: smaller.blob.type });
            notice = `That image was ${original}, over the ${readableSize(MAX_UPLOAD_BYTES)} limit — `
                + `uploaded at ${smaller.width}×${smaller.height} (${readableSize(toSend.size)}) instead.`;
        }

        const dataUrl = await readFileAsDataUrl(toSend);
        const result = await Api.uploadImage(adminToken, prefix, toSend.name, dataUrl, folder);
        /* Handed back rather than announced from in here. Every caller shows
           its own progress in its own place — a little "Uploading…" beside
           the field being filled — and there is no one banner for this to
           put a message in. Callers that have somewhere to say it, say it;
           the rest ignore it and the upload simply works. */
        if (notice) result.notice = notice;
        return result;
    }

    /* For the panels that live in files of their own (js/admin-guides.js):
       the same upload, shrinking included, so a guide picture that is too
       big is handled exactly as a maze picture is. */
    window.AdminUpload = (prefix, file, folder) => uploadImageFile(prefix, file, folder);

    function blobKeyFromUrl(url) {
        const m = /\/\.netlify\/functions\/image\?key=([^&]+)/.exec(url || "");
        return m ? decodeURIComponent(m[1]) : null;
    }

    // Fire-and-forget cleanup delete, used everywhere an image is being
    // discarded/replaced (bookend removal, gallery row removal, old-version
    // pruning, room/event deletion). Unlike every other admin-gated call in
    // this file, these used to swallow every error including a 401 — a
    // session expiring mid-edit would fail the delete silently, leaving the
    // orphaned blob in storage with no indication anything went wrong.
    // Routed through the same lockOut() the rest of the file uses instead.
    //
    // …and then taken back out of it. Every caller is a BACKGROUND job that
    // nobody is waiting on (a save's clean-up, a discarded edit, an orphaned
    // upload), and each can finish after the session it started in has
    // ended: a delete sent after a log out, or with a token that a change of
    // password had just retired, came back 401 and threw the sign-in box up
    // over a perfectly good session — or over the login screen itself. So a
    // failure here is never a lockOut. A session that really has expired is
    // found by the next thing the admin does, which does lock out. The
    // callers that wait on the database first (freshReferencedKeys) check
    // that the same person is still signed in before they get here.
    //
    // A 409 is the server refusing to delete a picture a record still uses
    // (upload.js answers { inUse: true }: another maze, event or guide took
    // it on after this page last looked). That is not a failure at all —
    // the picture is meant to stay — so it is left, silently, and above all
    // never read as a signed-out session. Api._write surfaces it as
    // err.status 409 (and err.data.inUse, where js/api.js passes the body
    // on); either is enough. A 503 is upload.js unable to ask the database
    // whether anything uses the picture, so it keeps it: the same outcome,
    // left the same way.
    function deleteImageSafe(key) {
        if (!adminToken) return;
        Api.deleteImage(adminToken, key).catch(err => {
            if (err && (err.status === 409 || err.status === 503 || (err.data && err.data.inUse))) return; // kept: leave it
            /* anything else: see above */
        });
    }

    /* ---------- deleting pictures only once the record agrees ----------

       Removing a picture in the maze/event form used to delete it from
       storage THERE AND THEN — a gallery row, an older version, the
       entrance or finish, a related image, the bookend bumped by "Delete
       it". The record still pointed at it until Save. So pressing Cancel, a
       failed save, or simply closing the tab left the stored record naming a
       picture that no longer existed: a broken image on the live site, for
       an edit that was never made.

       Now the form keeps a list instead. Every removal (and every
       replacement) QUEUES the old key on the form, and nothing is deleted
       until a save has actually succeeded — and even then only the keys that
       no longer appear anywhere in the saved record, nor in any other loaded
       maze or event (a thumbnail field can be pointed at another record's
       picture by hand, and deleting that would break the other one).

       Only keys this form is entitled to delete are ever deleted: ones the
       stored record held when the form opened, and ones uploaded while it
       was open. A picture added by address ("Add from URL", e.g. a Missing
       Pieces copy) and then removed again before saving belongs to nobody
       yet, and is left alone. */
    function imageKeysOf(record) {
        const keys = new Set();
        if (!record) return keys;
        const add = url => { const k = blobKeyFromUrl(url); if (k) keys.add(k); };
        const withOld = entry => {
            if (!entry) return;
            add(typeof entry === "string" ? entry : entry.image);
            if (typeof entry === "object") (entry.oldVersions || []).forEach(v => add(v && (typeof v === "string" ? v : v.image)));
        };
        add(record.thumb);
        withOld(record.entrance);
        withOld(record.finish);
        (record.gallery || []).forEach(withOld);
        (record.relatedImages || []).forEach(r => add(r && (typeof r === "string" ? r : r.image)));
        return keys;
    }

    // Every picture key any loaded maze or event still points at.
    function allReferencedKeys() {
        const keys = new Set();
        workingRooms.concat(workingEvents).forEach(item => imageKeysOf(item).forEach(k => keys.add(k)));
        return keys;
    }

    /* The same, but asked of the database at the moment of deciding.

       workingRooms/workingEvents are the lists read at sign-in. Another
       admin (or this one, in a second tab) can have pointed a record at a
       picture since — a thumbnail aimed at somebody else's room, a Missing
       Pieces copy added by URL — and "not in my copy of the archive" is not
       "not used". Deleting a blob is the one thing here that cannot be
       undone, so it is checked against the stored records as they are now,
       the same full read the panel loads with, just before any delete.

       The loaded lists are counted too, which can only make it more
       careful. If the read fails, the answer is null and the caller deletes
       NOTHING: an orphan left in storage costs a few kilobytes, a picture
       deleted from under a live record is a broken maze. */
    /* Only ever called from background clean-up (see deleteImageSafe), so a
       401 is not a lockOut here either, and the answer is null — delete
       nothing — if the account signed in has changed while the read was
       out: logged out, or somebody else signed in on this tab. The same
       person with a new token (their own password change, or signing back
       in after the session ran out) carries on; the deletes that follow are
       synchronous, so they go with that person's current token. */
    async function freshReferencedKeys() {
        const who = currentUsername;
        if (!adminToken || !who) return null;
        let rooms, events;
        try {
            [rooms, events] = await Promise.all([Api.getRoomsFull(adminToken), Api.getEventsFull(adminToken)]);
        } catch (err) {
            return null;
        }
        if (!adminToken || currentUsername !== who) return null;
        const keys = allReferencedKeys();
        (rooms || []).concat(events || []).forEach(item => imageKeysOf(item).forEach(k => keys.add(k)));
        return keys;
    }

    // What an open form currently points at, drafts included.
    function formImageKeys(formEl) {
        if (!formEl || !formEl.classList.contains("is-open")) return new Set();
        const value = name => {
            const el = formEl.querySelector(`[name="${name}"]`);
            return el ? el.value : "";
        };
        return imageKeysOf({
            thumb: value("thumb"),
            entrance: { image: value("entranceImage"), oldVersions: formEl._entranceOldVersions || [] },
            finish: { image: value("finishImage"), oldVersions: formEl._finishOldVersions || [] },
            gallery: formEl._galleryDraft || [],
            relatedImages: formEl._relatedDraft || []
        });
    }

    function queueImageDelete(formEl, url) {
        const key = blobKeyFromUrl(url);
        if (key && formEl && formEl._pendingDeletes) formEl._pendingDeletes.add(key);
    }

    function noteUpload(formEl, url) {
        const key = blobKeyFromUrl(url);
        if (key && formEl && formEl._sessionUploads) formEl._sessionUploads.add(key);
    }

    /* An upload that finished after the row it was for went away — removed,
       or promoted to the entrance/finish — while it was on its way up. The
       picture belongs to nothing and never will, so it is deleted at once
       rather than being written into whichever row now sits at the index it
       started from (which is what used to happen: the upload captured `i`,
       and by the time it landed draft[i] was a different room). */
    function dropOrphanUpload(url) {
        const key = blobKeyFromUrl(url);
        if (key && adminToken) deleteImageSafe(key);
    }

    /* A room picture replaced in place keeps that room's furni.

       Furni is recorded against the picture's ADDRESS, so a new upload in
       the same slot is, as far as the record is concerned, a different room
       with nothing in it — and the save's orphan pruning then dropped the
       old address's furni as belonging to no picture. Every hand-added
       piece in that room went with it. The entry moves to the new address
       instead; submitForm's furniPatch then sends the new key set and the
       old one null.

       The move is remembered too (_furniMoves: new address -> the address
       the record was opened at), so the save can say where it came from:
       the patch entry for the new address carries `from`, and rooms.js
       applies the admin's changes to whatever is stored at the old address
       NOW — a scan that finished that room while the form was open moves
       across with it rather than being lost. A record moved twice still
       names the address it was opened at. */
    function moveFurniKey(formEl, oldUrl, newUrl) {
        const draft = formEl && formEl._furniDraft;
        if (!draft || !oldUrl || !newUrl || oldUrl === newUrl || !draft[oldUrl]) return;
        const moves = formEl._furniMoves || (formEl._furniMoves = new Map());
        if (!draft[newUrl]) {
            draft[newUrl] = draft[oldUrl];
            moves.set(newUrl, moves.get(oldUrl) || oldUrl);
        }
        moves.delete(oldUrl);
        delete draft[oldUrl];
        if (formEl._renderFurni) formEl._renderFurni();
    }

    /* ---------- furni, saved piece by piece ----------

       A save sends each room it changed as { base, draft }: the room's
       record as this form opened it, and as the admin left it. rooms.js
       applies only the difference to the record stored at that moment
       (netlify/functions/_furni-merge.js), so a furni scan that rewrote the
       room while the form was open keeps what it found, and the admin's
       adds, removals and Hide/Show land on top.

       It used to send the room's whole record, which replaced the stored
       one: hide one false positive in a room the scan had just redone, and
       every new detection in that room went.

       mergeFurniRecord and furniPieceKey are _furni-merge.js's mergeRecord
       and pieceKey, repeated here for putting a refused save's changes
       back on top of the newer record (applyFurniRescue). Keep them in
       step; see that file for why a piece is keyed by its furni, its icon
       and where it stands. */
    const furniOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
    const furniIsObj = v => !!v && typeof v === "object" && !Array.isArray(v);
    const FURNI_UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

    function furniPieceKey(f) {
        if (!furniIsObj(f)) return "";
        const what = f.url || f.className || f.name || "";
        const at = Array.isArray(f.at) ? f.at.join(",") : "";
        return what + "|" + (f.icon || "") + "|" + at;
    }

    function furniKeyed(items) {
        const seen = new Map();
        return (Array.isArray(items) ? items : []).map(f => {
            const k = furniPieceKey(f);
            const n = (seen.get(k) || 0) + 1;
            seen.set(k, n);
            return [n === 1 ? k : k + "#" + n, f];
        });
    }

    function furniWithChanges(target, base, draft, skip) {
        const out = { ...(furniIsObj(target) ? target : {}) };
        const b = furniIsObj(base) ? base : {};
        const d = furniIsObj(draft) ? draft : {};
        new Set([...Object.keys(b), ...Object.keys(d)]).forEach(k => {
            if (FURNI_UNSAFE.has(k) || (skip && k === skip)) return;
            if (JSON.stringify(b[k]) === JSON.stringify(d[k])) return;
            if (furniOwn(d, k)) out[k] = d[k];
            else delete out[k];
        });
        return out;
    }

    function mergeFurniRecord(current, base, draft) {
        const cur = furniIsObj(current) ? current : null;
        const b = furniIsObj(base) ? base : {};
        const d = furniIsObj(draft) ? draft : {};
        const out = furniWithChanges(cur || {}, b, d, "items");
        const baseItems = new Map(furniKeyed(b.items));
        const draftItems = new Map(furniKeyed(d.items));
        const items = [];
        const kept = new Set();
        for (const [k, f] of furniKeyed(cur ? cur.items : [])) {
            if (baseItems.has(k) && !draftItems.has(k)) continue;
            items.push(baseItems.has(k) && furniIsObj(f) ? furniWithChanges(f, baseItems.get(k), draftItems.get(k)) : f);
            kept.add(k);
        }
        for (const [k, f] of draftItems) {
            if (!baseItems.has(k) && !kept.has(k)) items.push(f);
        }
        out.items = items;
        return out;
    }

    /* The furniPatch for a save. `original` is the furni as the form opened
       it, `draft` as the editor has it now, `keep` every picture address
       the saved record will still have (old versions included), `moves`
       the form's _furniMoves. Returns { patch, dropped }.

         - a room whose record changed: { base, draft }, with `from` when it
           was moved from another address (see moveFurniKey),
         - a record for a picture the maze no longer has (an orphan), or one
           removed from the draft: null, which rooms.js reads as "remove
           this picture's record". `dropped` counts the orphans. */
    function buildFurniPatch(original, draft, keep, moves) {
        const patch = {};
        let dropped = 0;
        for (const [image, record] of Object.entries(draft || {})) {
            if (!keep.has(image)) continue;
            if (JSON.stringify(record) === JSON.stringify(original[image])) continue;
            const from = moves && moves.get(image);
            const movedFrom = !furniOwn(original, image) && from && furniOwn(original, from) ? from : null;
            const entry = {
                base: movedFrom ? original[movedFrom] : (furniOwn(original, image) ? original[image] : null),
                draft: record
            };
            if (movedFrom) entry.from = movedFrom;
            patch[image] = entry;
        }
        for (const image of new Set([...Object.keys(original || {}), ...Object.keys(draft || {})])) {
            if (!keep.has(image)) {
                patch[image] = null;
                dropped++;
            } else if (!furniOwn(draft, image) && furniOwn(original, image)) {
                patch[image] = null;
            }
        }
        return { patch, dropped };
    }

    /* Every upload the maze/event form makes goes through here, for two
       reasons that both come down to an upload outliving the moment it was
       started in.

       Counted, so Save can refuse while one is still in flight (see
       uploadsPending). Pressed half-way through a batch of gallery files,
       Save used to write the record with the pictures that had landed so
       far and close the form — and the rest kept arriving, into a draft
       that no longer belonged to anything, and sat in storage for good.

       Tied to the form's opening, so an upload that lands after the form
       was closed, or reopened on a different record, is not written into
       whatever the form now holds. openForm gives every opening a fresh
       _openSession object; if the one this upload started under is not
       the one there now, the picture belongs to an edit that has gone —
       it is deleted again and the caller told to stop (a batch loop stops
       at the first such file rather than uploading the rest). */
    async function formUpload(formEl, prefix, file) {
        const session = formEl && formEl._openSession;
        if (!session) return uploadImageFile(prefix, file);
        session.uploads++;
        let result;
        try {
            result = await uploadImageFile(prefix, file);
        } finally {
            session.uploads--;
        }
        if (formEl._openSession !== session) {
            const key = blobKeyFromUrl(result && result.url);
            if (key && adminToken) deleteImageSafe(key);
            throw Object.assign(new Error("The form was closed before this upload finished, so it was not kept."), { stale: true });
        }
        /* Every caller writes the picture into its draft straight after
           this resolves, before a timer can run, so the floating bar's
           label is re-measured then (1 Oct 2026, final fixes): it stayed
           "Editing" after a gallery or bookend upload landed. */
        setTimeout(syncFloatingLabel, 0);
        return result;
    }

    function uploadsPending(formEl) {
        return !!(formEl && formEl._openSession && formEl._openSession.uploads > 0);
    }

    /* After a successful save: the queued keys this form may delete, plus
       anything uploaded during the edit that the saved record does not use
       (uploaded, then replaced again before saving), minus everything still
       referenced anywhere. Called with the sets captured before closeForm
       wipes them. "Anywhere" is asked of the database — see
       freshReferencedKeys — so this is async, and nothing waits on it. */
    async function flushPendingDeletes(pendingDeletes, sessionUploads, storedKeys) {
        const doomed = new Set();
        pendingDeletes.forEach(k => {
            if (storedKeys.has(k) || sessionUploads.has(k)) doomed.add(k);
        });
        sessionUploads.forEach(k => doomed.add(k));
        if (!doomed.size) return;
        const referenced = await freshReferencedKeys();
        if (!referenced) return;
        // Whatever an open form now points at is spared as well: the read
        // above took a moment, and a picture can be added by URL meanwhile.
        Object.keys(COLLECTIONS).forEach(other => formImageKeys(COLLECTIONS[other].formEl).forEach(k => referenced.add(k)));
        doomed.forEach(k => { if (!referenced.has(k)) deleteImageSafe(k); });
    }

    /* Throwing an edit away. Pictures uploaded during it were never saved
       into any record, so they would otherwise sit in storage for good —
       they are deleted here, as long as that is plainly safe: nothing loaded
       points at them, the other collection's open form is not using one, and
       no save of this form failed in a way that leaves it unknown whether
       the server stored it (a dropped connection or a server error can land
       AFTER the write — deleting then would break a saved record). The
       queued removals are simply forgotten: the stored record still uses
       those pictures.

       The bookkeeping is taken off the form at once, so the caller can
       close or reopen it straight away; the deciding and deleting happen
       after the database has been asked (freshReferencedKeys). Returns that
       promise, which only logout waits for — its deletes need the token. */
    async function discardFormUploads(key) {
        const formEl = COLLECTIONS[key] && COLLECTIONS[key].formEl;
        if (!formEl || !formEl._sessionUploads) return;
        const uploads = formEl._sessionUploads;
        formEl._sessionUploads = new Set();
        if (formEl._pendingDeletes) formEl._pendingDeletes.clear();
        if (formEl._saveAmbiguous || !adminToken || !uploads.size) return;
        const referenced = await freshReferencedKeys();
        if (!referenced) return;
        // Read after the await: by now this form may have been reopened and
        // be using one of these again (added back by URL), which spares it.
        Object.keys(COLLECTIONS).forEach(other => formImageKeys(COLLECTIONS[other].formEl).forEach(k => referenced.add(k)));
        uploads.forEach(k => { if (!referenced.has(k)) deleteImageSafe(k); });
    }

    /* ---------- what a refused (409) save leaves behind ----------

       See the 409 branch in submitForm for why. Both are keyed by
       "rooms:<id>" / "events:<id>", held for this page only, and dropped
       when the account changes (forgetRefusedEdits). */
    const refusedUploads = new Map();   // record -> Set of image keys
    const furniRescue = new Map();      // record -> { patch }
    const rescueKeyOf = (key, id) => key + ":" + id;

    function parkRefusedUploads(key, id, uploads) {
        if (!uploads || !uploads.size) return;
        const k = rescueKeyOf(key, id);
        const parked = refusedUploads.get(k) || new Set();
        uploads.forEach(u => parked.add(u));
        refusedUploads.set(k, parked);
    }

    // The next opening of the record takes them on as its own uploads, so
    // its Save or Cancel clears whatever it does not end up using.
    function takeParkedUploads(formEl, key, id) {
        const k = rescueKeyOf(key, id);
        const parked = refusedUploads.get(k);
        if (!parked || !formEl._sessionUploads) return;
        parked.forEach(u => formEl._sessionUploads.add(u));
        refusedUploads.delete(k);
    }

    /* The refused furni changes, laid back over the record as it is stored
       now — merged piece by piece, as rooms.js merges a save
       (mergeFurniRecord), not room by room. A room the other person ALSO
       changed keeps their changes and gains this admin's: it used to be
       replaced whole by this admin's copy, which undid theirs there. A
       room this admin's save removed is removed. Applied after the form's
       opening snapshot, so the form reads as changed and Cancel asks
       before throwing them away a second time.

       Every entry reads the draft as it was before any of them, so a
       moved room's null for its old address cannot remove the record the
       new address is built from; and the move is remembered, so the next
       save sends `from` as the refused one did.

       A null in the refused patch is NOT restored (28 Sept 2026). Those
       nulls only ever come from GALLERY changes in the refused save — a
       room removed, or a picture replaced in place — and the rescue does
       not bring gallery changes back: the form reopens on the other
       admin's record, with that room still in it. Deleting its furni
       from the draft anyway left the room on screen with its furni gone,
       and the next save sent `room: null`, so the server dropped the
       room's whole furni record — data loss the admin never saw. If the
       admin redoes the removal, the next save's orphan pruning
       (buildFurniPatch) works the nulls out from the gallery they
       actually have. The notice likewise counts only rooms the reopened
       record shows: a room restored under an address it does not show
       (a replacement the other save never had) is pruned on Save, so
       telling the admin it is "back" would be untrue. */
    function applyFurniRescue(formEl, key, id) {
        const k = rescueKeyOf(key, id);
        const rescue = furniRescue.get(k);
        const draft = formEl._furniDraft;
        if (!rescue || !draft) return;
        furniRescue.delete(k);
        const fresh = JSON.parse(JSON.stringify(draft));
        const moves = formEl._furniMoves || (formEl._furniMoves = new Map());
        const shown = rescueShownRooms(formEl);
        let restored = 0;
        for (const [image, entry] of Object.entries(rescue.patch)) {
            if (FURNI_UNSAFE.has(image)) continue;
            if (entry === null) continue;
            const here = furniOwn(fresh, image);
            const from = !here && entry.from && furniOwn(fresh, entry.from) ? entry.from : null;
            draft[image] = mergeFurniRecord(here ? fresh[image] : from ? fresh[from] : undefined, entry.base, entry.draft);
            if (from) moves.set(image, from);
            if (shown.has(image)) restored++;
        }
        if (formEl._renderFurni) formEl._renderFurni();
        if (!restored) return;
        formNotice(formEl, "Your furni changes from the refused save are back on " + restored +
            (restored === 1 ? " room" : " rooms") + ", on top of the other save's. Check them, then Save.");
    }

    // The room pictures the reopened form shows: the same set a Save keeps
    // furni for (entrance, finish, gallery, and their older versions), read
    // from the form as it stands, so it is the other admin's record.
    function rescueShownRooms(formEl) {
        const shown = new Set();
        const note = img => { if (img) shown.add(String(img).trim()); };
        const field = name => {
            const el = formEl.querySelector ? formEl.querySelector(`[name="${name}"]`) : null;
            return el ? el.value : "";
        };
        const withOld = (image, olds) => {
            note(image);
            (olds || []).forEach(v => note(v && v.image));
        };
        withOld(field("entranceImage"), formEl._entranceOldVersions);
        withOld(field("finishImage"), formEl._finishOldVersions);
        (formEl._galleryDraft || []).forEach(g => g && withOld(g.image, g.oldVersions));
        return shown;
    }

    /* On a log out or a change of account. The parked pictures are
       discarded as a Cancel would (only what nothing points at), with the
       token that uploaded them — so this is awaited by doLogout before it
       drops the token. */
    async function forgetRefusedEdits() {
        const parked = new Set();
        refusedUploads.forEach(set => set.forEach(u => parked.add(u)));
        refusedUploads.clear();
        furniRescue.clear();
        if (!parked.size || !adminToken) return;
        const referenced = await freshReferencedKeys();
        if (!referenced) return;
        Object.keys(COLLECTIONS).forEach(other => formImageKeys(COLLECTIONS[other].formEl).forEach(k => referenced.add(k)));
        parked.forEach(k => { if (!referenced.has(k)) deleteImageSafe(k); });
    }

    // Wraps a file input in a much larger drag-and-drop target instead of
    // leaving it as the browser's own tiny "Choose File" control — used for
    // every image upload on the page (thumbnail, entrance/finish, gallery
    // rooms, older versions). Wrapping in a <label> means clicking anywhere
    // in it still opens the native picker with zero extra JS; dropping a
    // file sets the input's own .files (via a real DataTransfer, the only
    // way to do that from script) and fires "change", so every existing
    // upload flow keyed off that input needs no changes at all.
    //
    // Dropping (or picking) a file only ever selects it — it never uploads
    // on its own. Flows with their own explicit Add/Upload button (the
    // gallery "+ Add" flows, bookend upload, older versions) upload only
    // once that button is actually pressed; wireThumbUpload's own change
    // handler is the one exception (it has no separate button to press),
    // unaffected either way by drag vs. click-to-browse.
    // Puts a dropzone's label back to its "drop something here" prompt.
    // wireDropzone swaps that for the chosen file's name on selection, which
    // is right while a file is waiting to be acted on — but wrong once it
    // has been uploaded and the zone is free again.
    function resetDropzoneText(fileInput) {
        const text = fileInput && fileInput.closest(".admin-dropzone")
            ? fileInput.closest(".admin-dropzone").querySelector(".admin-dropzone-text")
            : null;
        if (text) text.textContent = DROPZONE_PLACEHOLDER;
    }

    const DROPZONE_PLACEHOLDER = "Drag & drop an image here, or click to browse";

    function wireDropzone(fileInput) {
        if (!fileInput || fileInput.closest(".admin-dropzone")) return;
        const label = document.createElement("label");
        label.className = "admin-dropzone";
        const text = document.createElement("span");
        text.className = "admin-dropzone-text";
        const placeholder = DROPZONE_PLACEHOLDER;
        text.textContent = placeholder;

        fileInput.insertAdjacentElement("beforebegin", label);
        label.appendChild(fileInput);
        label.appendChild(text);

        fileInput.addEventListener("change", () => {
            const n = fileInput.files.length;
            text.textContent = n > 1 ? `${n} files selected` : n === 1 ? fileInput.files[0].name : placeholder;
        });

        ["dragenter", "dragover"].forEach(evt => label.addEventListener(evt, e => {
            e.preventDefault();
            label.classList.add("dragover");
        }));
        ["dragleave", "drop"].forEach(evt => label.addEventListener(evt, e => {
            e.preventDefault();
            label.classList.remove("dragover");
        }));
        label.addEventListener("drop", e => {
            const files = e.dataTransfer.files;
            if (!files.length) return;
            // A single-file input just takes the first file dropped even if
            // several were dragged in together; a multi-file one (the
            // gallery's own batch-upload input) keeps them all.
            const dt = new DataTransfer();
            if (fileInput.multiple) {
                Array.from(files).forEach(f => dt.items.add(f));
            } else {
                dt.items.add(files[0]);
            }
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        });
    }

    // A room's older-version images are simpler than the room itself —
    // just an image + optional label, no bonus/run-through/entrance-finish
    // promotion — so they get their own lightweight normalizer, nested
    // inside normalizeGalleryEntry below rather than a full second copy of
    // normalizeGalleryEntry's shape.
    /* The three normalisers below spread the stored entry FIRST and then
       set the fields the editor understands. They used to build a fresh
       object from only those fields, so any other sub-key on an entry — one
       a later feature adds, or one written by a script — was silently
       dropped the next time anybody pressed Save on the record. */
    function normalizeOldVersionEntry(entry) {
        if (typeof entry === "string") return { image: entry, label: "" };
        return { ...entry, image: entry.image, label: entry.label || "" };
    }

    // Gallery entries used to be plain image path strings; the editor below
    // stores {image, label} objects instead so labels aren't tied to a
    // filename. Normalize both shapes so older seeded rooms keep working.
    //
    // Only the legacy STRING shape gets a label made up from its filename.
    // An object entry keeps the label it has, empty included: `label ||
    // derive(...)` turned a deliberately blank label back into "Room 12"
    // every time the maze was opened, so an untouched save quietly changed
    // the record.
    function normalizeGalleryEntry(entry) {
        if (typeof entry === "string") return { image: entry, label: deriveGalleryLabel(entry), bonus: false, runThrough: false, oldVersions: [] };
        return {
            ...entry,
            image: entry.image,
            label: entry.label == null ? "" : String(entry.label),
            bonus: !!entry.bonus,
            runThrough: !!entry.runThrough,
            oldVersions: (entry.oldVersions || []).map(normalizeOldVersionEntry)
        };
    }

    // Related Images are a flat {image, name} list — no ordering rules, no
    // bonus/run-through flags, no older versions. Deliberately a much
    // smaller thing than the room-by-room gallery above, since these are
    // extra pictures hung off a maze/event rather than part of its sequence.
    function normalizeRelatedEntry(entry) {
        if (typeof entry === "string") return { image: entry, name: "" };
        return { ...entry, image: entry.image || "", name: entry.name || "" };
    }

    /* "Add from URL" — for a picture that is already in the archive's own
       storage but in no record yet. The Missing Pieces panel copies a lead's
       screenshots into storage when it is accepted and lists the addresses,
       but the gallery and related images only took uploads, so there was
       nowhere to paste them. Only this site's own image address is accepted
       (/.netlify/functions/image?key=rooms/…), absolute or relative, and it
       is stored in exactly the relative shape an upload produces. Returns
       the address, or null with a reason. */
    function archiveImageFromUrl(raw) {
        const text = String(raw || "").trim();
        if (!text) return { error: "Paste an image address first." };
        let u;
        try { u = new URL(text, location.origin); } catch (e) { return { error: "That isn't an address." }; }
        const ours = u.origin === location.origin || /^(www\.)?mazerats\.net$/i.test(u.hostname);
        const key = u.searchParams.get("key") || "";
        if (!ours || u.pathname !== "/.netlify/functions/image" ||
            !/^rooms\/[A-Za-z0-9._\/ -]+$/.test(key) || key.includes("..")) {
            return { error: "Only this site's own archive images can be added by address — one starting /.netlify/functions/image?key=rooms/" };
        }
        return { url: `/.netlify/functions/image?key=${key}` };
    }

    // Mirrors wireGalleryEditor's shape (draft array on the form element,
    // re-render on every change) and reuses its row classes for styling, but
    // without the reordering, promotion and sub-panel machinery none of
    // which applies here.
    function wireRelatedEditor(formEl, uploadPrefix) {
        const listEl = formEl.querySelector(".admin-related-list");
        if (!listEl) return;
        const fileInput = formEl.querySelector(".admin-related-new-file");
        const status = formEl.querySelector(".admin-related-status");
        wireDropzone(fileInput);

        function renderRelatedList() {
            const draft = formEl._relatedDraft;
            if (!draft.length) {
                listEl.innerHTML = `<p class="admin-empty">No related images added yet.</p>`;
                return;
            }
            listEl.innerHTML = draft.map((r, i) => `
                <div class="admin-gallery-row" data-index="${i}">
                    <div class="admin-gallery-row-top">
                        <span class="admin-gallery-drag-handle admin-related-drag-handle" draggable="true" title="Drag to reorder">&#9776;</span>
                        <label class="admin-gallery-thumb admin-gallery-thumb-filled" style="background-image:url('${imgCdn(r.image, 100, 100, 55)}');">
                            <!-- Carries .admin-gallery-thumb-file too: that
                                 class is what hides the native control so
                                 the thumbnail itself is the click target. -->
                            <input type="file" class="admin-gallery-thumb-file admin-related-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp">
                            <span class="admin-gallery-thumb-replace-text">Replace Image</span>
                        </label>
                        <input type="text" class="admin-gallery-label admin-related-name" value="${escapeHtml(r.name || "")}" placeholder="Image name">
                    </div>
                    <div class="admin-gallery-actions-secondary">
                        <button type="button" class="admin-pill-btn admin-related-up" ${i === 0 ? "disabled" : ""} title="Move up">&#9650; Up</button>
                        <button type="button" class="admin-pill-btn admin-related-down" ${i === draft.length - 1 ? "disabled" : ""} title="Move down">&#9660; Down</button>
                        <button type="button" class="admin-pill-btn admin-pill-danger admin-related-remove" title="Remove">Remove</button>
                    </div>
                </div>
            `).join("");

            listEl.querySelectorAll(".admin-gallery-row").forEach(row => {
                const i = Number(row.dataset.index);
                row.querySelector(".admin-related-name").addEventListener("input", e => {
                    draft[i].name = e.target.value;
                });
                row.querySelector(".admin-related-remove").addEventListener("click", () => {
                    // Queued, not deleted: the saved record still uses it
                    // until Save — see imageKeysOf.
                    queueImageDelete(formEl, draft[i].image);
                    draft.splice(i, 1);
                    renderRelatedList();
                });

                // The order here is the order the photo icons appear in on
                // the public site, left to right.
                row.querySelector(".admin-related-up").addEventListener("click", () => {
                    if (i === 0) return;
                    [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]];
                    renderRelatedList();
                });
                row.querySelector(".admin-related-down").addEventListener("click", () => {
                    if (i === draft.length - 1) return;
                    [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]];
                    renderRelatedList();
                });

                // Drag to reorder, same handle-and-row arrangement the
                // room gallery uses. The Files guard matters for the same
                // reason it does there: dragging an image from the desktop
                // onto a row bubbles dragover/drop up here too, and without
                // it that would be read as a reorder from index 0 — the
                // getData call returns "" for a file drag, and Number("")
                // is 0 rather than NaN.
                const dragHandle = row.querySelector(".admin-related-drag-handle");
                dragHandle.addEventListener("dragstart", e => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                    row.classList.add("dragging");
                });
                dragHandle.addEventListener("dragend", () => row.classList.remove("dragging"));

                row.addEventListener("dragover", e => {
                    if (e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                    row.classList.toggle("drag-over-top", before);
                    row.classList.toggle("drag-over-bottom", !before);
                });
                row.addEventListener("dragleave", () => {
                    row.classList.remove("drag-over-top", "drag-over-bottom");
                });
                row.addEventListener("drop", e => {
                    if (e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    row.classList.remove("drag-over-top", "drag-over-bottom");
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (Number.isNaN(from) || from === i) return;
                    const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                    let to = before ? i : i + 1;
                    if (from < to) to--;
                    const [moved] = draft.splice(from, 1);
                    draft.splice(to, 0, moved);
                    renderRelatedList();
                });
                row.querySelector(".admin-related-thumb-file").addEventListener("change", async e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    // The entry itself, not its index: the list can be
                    // reordered or have rows removed while this uploads.
                    const entry = draft[i];
                    status.textContent = "Uploading…";
                    status.style.display = "block";
                    try {
                        const { url } = await formUpload(formEl, uploadPrefix, file);
                        const current = formEl._relatedDraft || [];
                        if (!current.includes(entry)) {
                            dropOrphanUpload(url);
                            status.textContent = "That image was removed while its new picture uploaded, so the upload was not kept.";
                            return;
                        }
                        noteUpload(formEl, url);
                        queueImageDelete(formEl, entry.image);
                        entry.image = url;
                        status.style.display = "none";
                        renderRelatedList();
                    } catch (err) {
                        if (err.status === 401) { lockOut(); return; }
                        status.textContent = err.message || "Upload failed.";
                    }
                });
            });
        }

        // Uploads the moment files land, rather than staging them behind an
        // "Add" button. The two-step version read as broken: choosing a file
        // changed nothing on screen except the dropzone's own label, so there
        // was no sign anything had happened until you found the separate
        // button below it. This is the same auto-upload the entrance/finish
        // fields already use — drop images, rows appear, name them in place.
        fileInput.addEventListener("change", async () => {
            const files = Array.from(fileInput.files).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
            );
            if (!files.length) return;

            status.style.display = "block";
            try {
                for (let f = 0; f < files.length; f++) {
                    status.textContent = files.length > 1
                        ? `Uploading ${f + 1} of ${files.length}…`
                        : "Uploading…";
                    const { url } = await formUpload(formEl, uploadPrefix, files[f]);
                    noteUpload(formEl, url);
                    // Named after the file to start with — a real name beats
                    // an empty box, and it's editable in the row right away.
                    formEl._relatedDraft.push({
                        image: url,
                        name: files[f].name.replace(/\.[a-z0-9]+$/i, "")
                    });
                    // Rendered per file, so a batch fills in visibly as it
                    // goes instead of sitting still until the last one lands.
                    renderRelatedList();
                }
                status.style.display = "none";
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Upload failed.";
            } finally {
                // Cleared so re-picking the same file fires "change" again,
                // and the dropzone goes back to inviting the next drop
                // rather than naming the file it has already dealt with.
                fileInput.value = "";
                resetDropzoneText(fileInput);
            }
        });

        // A picture already in the archive's storage, by address — see
        // archiveImageFromUrl. Named from the last part of its key.
        const urlInput = formEl.querySelector(".admin-related-url");
        const urlBtn = formEl.querySelector(".admin-related-url-btn");
        if (urlInput && urlBtn) {
            const addFromUrl = () => {
                const got = archiveImageFromUrl(urlInput.value);
                status.style.display = "block";
                if (got.error) { status.textContent = got.error; return; }
                const draft = formEl._relatedDraft;
                if (draft.some(r => r.image === got.url)) { status.textContent = "That picture is already in the list."; return; }
                draft.push({ image: got.url, name: deriveGalleryLabel(got.url.split("/").pop()) });
                urlInput.value = "";
                status.style.display = "none";
                renderRelatedList();
            };
            urlBtn.addEventListener("click", addFromUrl);
            // Enter adds, and must not submit the maze — the same trap as
            // the gallery's own label field.
            urlInput.addEventListener("keydown", e => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                addFromUrl();
            });
        }

        renderRelatedList();
    }

    /* What the furni scan found, per room image, with a way to correct it —
       and to add furni the scan will never find.

       Scanning is confident but not infallible — a sprite that shares enough
       pixels with whatever is behind it can land a false hit — so each
       detection can be hidden (kept in the record but not shown on the site)
       or removed outright. Hiding is the safer of the two: a rescan will
       find a false positive again, and a hidden one stays hidden with its
       reasoning visible, where a removed one silently comes back.

       The other direction is adding by hand, which is the only way to record
       furni the scan cannot see: anything under a lighting effect (those
       images are skipped wholesale), anything mostly hidden behind something
       else, and every room in a maze nobody has scanned yet. Hand-added
       entries carry manual: true, which is what keeps them alive through a
       rescan — see tools/furni-scan-local.js, which merges
       them back over its own results rather than replacing them. */
    /* What makes one furni one furni.

       NOT the name. Habbo gives every colourway in a family the same one —
       four Armchairs, seven Heart Sofas, two Telephone Boxes, seventeen such
       names in the archive as it stands — and keying on it meant adding any
       one of them marked the whole family as already added, greyed the rest
       out, and had addFurni refuse them for good measure. The other colours
       simply could not be recorded.

       The catalogue tells them apart perfectly well: every variant has its
       own FurniIndex page and its own furni line. This is the same key
       furniKeyOf uses in js/home.js, which is what the reverse index and the
       archive's furni browser are built on, so the admin and the public site
       agree about what counts as one piece. */
    const furniKey = f => (f && (f.url || f.name)) || "";

    function wireFurniEditor(formEl, item) {
        const wrap = formEl.querySelector(".admin-furni-field");
        if (!wrap) return;
        const listEl = wrap.querySelector(".admin-furni-list");
        formEl._furniDraft = JSON.parse(JSON.stringify(item.furni || {}));
        // Which rooms are expanded. Every room starts collapsed to a single
        // tab: a scanned maze can run to a hundred-odd detections, which
        // buries the rest of the form. Kept out here because Hide and Remove
        // both re-render, and rebuilding from scratch would otherwise close
        // the room being worked on after every click.
        const openRooms = new Set();
        // Which room's "add by hand" picker is open, if any. Only ever one:
        // two open search boxes in a column of rooms is more noise than help,
        // and the results list is tall.
        let pickerFor = null;

        /* The picker's own search survives a re-render.

           Adding a furni calls render(), which rebuilds this whole list —
           and that used to throw the search box and its results away, so
           adding one item out of a set closed the results and the query had
           to be typed again for the next. A furni line is exactly the case
           where several get added at once, so that was the wrong default.

           Holding the query and the last result set here lets wirePicker
           put both back after every render. Deliberately NOT the picker's
           own DOM state read back out: the elements are destroyed by the
           rebuild, so the only place this can live is outside them. */
        let pickerQuery = "";
        let pickerResults = [];
        // Set by the two buttons that open the picker, so the render they
        // cause brings it into view — see revealPicker.
        let revealPickerNext = false;

        // Room images in the order they appear on the site, so this reads in
        // the same order as the gallery above rather than by object key.
        //
        // The entrance and finish come from the FORM's fields, as the
        // gallery already came from its draft. They were read from the
        // stored record, so a replaced entrance still listed the old
        // picture's furni here, and the new one had no tab to add furni to
        // until the maze had been saved and reopened.
        function imagesInOrder() {
            const out = [];
            const field = name => {
                const el = formEl.querySelector(`input[name="${name}"]`);
                return el ? el.value.trim() : "";
            };
            const bookendImage = kind => formEl.querySelector(`input[name="${kind}Image"]`)
                ? field(kind + "Image")
                : ((item[kind] && item[kind].image) || "");
            const entranceImage = bookendImage("entrance");
            const finishImage = bookendImage("finish");
            if (entranceImage) out.push({ image: entranceImage, label: "Entrance" });
            (formEl._galleryDraft || item.gallery || []).forEach((g, i) => {
                if (g.image) out.push({ image: g.image, label: g.label || ("Room " + (i + 1)) });
            });
            if (finishImage) out.push({ image: finishImage, label: "Finish" });
            return out;
        }

        // A room with no record at all is a normal state now rather than an
        // absence — you can add furni to a room nothing has ever scanned —
        // so every write goes through this instead of assuming a record.
        function recordFor(image) {
            const draft = formEl._furniDraft;
            if (!draft[image]) draft[image] = { items: [] };
            if (!draft[image].items) draft[image].items = [];
            return draft[image];
        }

        function render() {
            const draft = formEl._furniDraft;
            // Every room image, not only the ones carrying a record: an
            // unscanned room still needs somewhere to add furni by hand.
            const rooms = imagesInOrder();
            if (!rooms.length) {
                listEl.innerHTML = '<p class="admin-empty">Add some room images first — furni is recorded against them.</p>';
                return;
            }
            listEl.innerHTML = rooms.map(({ image, label }) => {
                const rec = draft[image] || {};
                const items = rec.items || [];
                const shown = items.filter(i => !i.hidden).length;
                let note = "";
                if (rec.skipped === "lighting-effects") {
                    note = '<p class="admin-hint">Skipped: this screenshot has lighting effects on it (' + rec.roomColours + ' colours), which shifts every pixel and makes exact matching impossible. Anything in it has to be added by hand.</p>';
                } else if (rec.error) {
                    note = '<p class="admin-hint">Failed: ' + escapeHtml(rec.error) + '</p>';
                } else if (!rec.scannedAt && !items.length) {
                    note = '<p class="admin-hint">Not scanned yet — you can still add furni by hand.</p>';
                }
                const rows = items.map((f, i) => '' +
                    '<div class="admin-furni-item ' + (f.hidden ? "is-hidden" : "") + (f.manual ? " is-manual" : "") + '" data-image="' + escapeHtml(image) + '" data-index="' + i + '">' +
                        '<img src="' + escapeHtml(safeUrl(f.sprite || f.icon)) + '" alt="">' +
                        '<span class="admin-furni-name">' + escapeHtml(f.name || "") + '</span>' +
                        // A hand-added entry has no coverage to report, and
                        // showing it as "0%" read as a failed match rather
                        // than as something deliberately put there.
                        '<span class="admin-furni-score">' + (f.manual ? "by hand" : Math.round((f.coverage || 0) * 100) + "%") + '</span>' +
                        '<button type="button" class="admin-pill-btn admin-furni-hide">' + (f.hidden ? "Show" : "Hide") + '</button>' +
                        '<button type="button" class="admin-pill-btn admin-pill-danger admin-furni-remove">Remove</button>' +
                    '</div>').join("");
                const open = openRooms.has(image);
                const picking = pickerFor === image;
                const summary = items.length ? shown + ' shown of ' + items.length : 'nothing yet';
                return '' +
                    '<div class="admin-furni-room' + (open ? " is-open" : "") + '">' +
                        '<div class="admin-furni-room-head">' +
                            // The whole head is the toggle, with the buttons
                            // inside it stopping the click so "Remove all"
                            // never doubles as a collapse.
                            '<button type="button" class="admin-furni-toggle" data-image="' + escapeHtml(image) + '" aria-expanded="' + open + '">' +
                                '<span class="admin-furni-caret" aria-hidden="true"></span>' +
                                /* The room this furni list belongs to, as a
                                   picture. The label is a filename, which
                                   says which room only if you happen to
                                   remember what that file looks like —
                                   whereas the whole job here is deciding
                                   whether a piece really is in THIS room.

                                   Fetched at the size it grows to on hover
                                   rather than at thumbnail size, so the
                                   enlarged look is the real picture and not
                                   a 40px one blown up. aria-hidden because
                                   the label beside it already names the
                                   room; a screen reader gains nothing from
                                   a second copy. */
                                (image
                                    ? '<img class="admin-furni-thumb" src="' + escapeHtml(imgCdn(image, 200, null, 60)) + '" alt="" aria-hidden="true" loading="lazy" decoding="async">'
                                    : '') +
                                '<strong>' + escapeHtml(label) + '</strong>' +
                                '<span class="admin-hint">' + summary + '</span>' +
                            '</button>' +
                            // On the head, not in the panel: a room tab is
                            // collapsed until you click it, so a control that
                            // only appears once it is open cannot tell you it
                            // is there in the first place. This opens the room
                            // and its picker in one go.
                            '<button type="button" class="admin-pill-btn admin-furni-add-head" data-image="' + escapeHtml(image) + '" title="Add furni to this room by hand">+ Add Furni</button>' +
                            (items.length ? '<button type="button" class="admin-pill-btn admin-pill-danger admin-furni-clear" data-image="' + escapeHtml(image) + '">Remove all</button>' : '') +
                        '</div>' +
                        '<div class="admin-furni-panel">' + note +
                            '<div class="admin-furni-items">' + rows + '</div>' +
                            '<div class="admin-furni-add">' +
                                '<button type="button" class="admin-pill-btn admin-furni-add-toggle" data-image="' + escapeHtml(image) + '">' + (picking ? "Done adding" : "+ Add furni by hand") + '</button>' +
                                (picking ? '' +
                                    '<div class="admin-furni-picker">' +
                                        '<input type="text" class="admin-furni-search" placeholder="Search by name or furni line…" autocomplete="off">' +
                                        '<p class="admin-hint admin-furni-picker-status">Type at least two letters — a furni line works too, like "alhambra".</p>' +
                                        '<div class="admin-furni-results"></div>' +
                                    '</div>' : '') +
                            '</div>' +
                        '</div>' +
                    '</div>';
            }).join("");

            listEl.querySelectorAll(".admin-furni-toggle").forEach(btn => {
                btn.addEventListener("click", () => {
                    const image = btn.dataset.image;
                    if (openRooms.has(image)) openRooms.delete(image);
                    else openRooms.add(image);
                    // Collapsing the room the picker is in closes the picker
                    // too, rather than leaving it live inside a shut panel.
                    if (!openRooms.has(image) && pickerFor === image) pickerFor = null;
                    render();
                });
            });
            listEl.querySelectorAll(".admin-furni-item").forEach(row => {
                const image = row.dataset.image;
                const idx = Number(row.dataset.index);
                row.querySelector(".admin-furni-hide").addEventListener("click", () => {
                    const f = draft[image].items[idx];
                    f.hidden = !f.hidden;
                    render();
                });
                row.querySelector(".admin-furni-remove").addEventListener("click", () => {
                    draft[image].items.splice(idx, 1);
                    render();
                });
            });
            listEl.querySelectorAll(".admin-furni-clear").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const image = btn.dataset.image;
                    if (!await showConfirmDialog("Remove every furni recorded for this room image? A rescan would find the detected ones again, but anything added by hand would be gone for good.")) return;
                    draft[image].items = [];
                    render();
                });
            });
            listEl.querySelectorAll(".admin-furni-add-head").forEach(btn => {
                btn.addEventListener("click", () => {
                    const image = btn.dataset.image;
                    openRooms.add(image);
                    pickerFor = image;
                    pickerQuery = "";
                    pickerResults = [];
                    revealPickerNext = true;
                    render();
                });
            });
            listEl.querySelectorAll(".admin-furni-add-toggle").forEach(btn => {
                btn.addEventListener("click", () => {
                    const image = btn.dataset.image;
                    pickerFor = pickerFor === image ? null : image;
                    pickerQuery = "";
                    pickerResults = [];
                    // Opening the picker on a collapsed room would put it
                    // somewhere nobody can see.
                    if (pickerFor) openRooms.add(image);
                    revealPickerNext = !!pickerFor;
                    render();
                });
            });

            if (pickerFor) wirePicker(pickerFor);
            if (revealPickerNext) {
                revealPickerNext = false;
                revealPicker(true);
            }
        }

        /* Bring the search into view when it opens (30 Sept 2026).

           The picker opens at the foot of its room's panel, under every furni
           the room already has — so on the last few rooms of a long maze it
           opened below the bottom of the stage, behind the floating Save bar,
           and every search began with scrolling down to find the box. The
           focus call in wirePicker cannot help: it has to use preventScroll
           (see there), and the browser's own "scroll into view" would only
           bring the input to the very edge anyway, with the results that
           arrive a moment later landing out of sight beneath it.

           So this scrolls the stage by hand, and only as far as it must: far
           enough that the box AND the room its results will need (the 220px
           scroller, .admin-furni-results) sit above the Save bar, but never so
           far that the box itself goes off the top. Called on opening
           (reserve=true: the results are not there yet, so their room is
           kept for them) and again whenever results are drawn. Smooth on
           opening, so the page is seen to move to the box rather than jump. */
        const RESULTS_ROOM = 260;
        function revealPicker(reserve) {
            const picker = listEl.querySelector(".admin-furni-picker");
            const stage = wrap.closest(".admin-stage");
            if (!picker || !stage) return;
            /* Under 860px the stage is overflow: visible and the PAGE scrolls
               (see the narrow block in css/style.css), so scrolling the stage
               did nothing there and the box opened out of sight as before.
               The window is scrolled instead, measured against the viewport
               less whatever stays pinned at its top (30 Sept 2026). */
            const ownScroll = /auto|scroll/.test(getComputedStyle(stage).overflowY);
            const scroller = ownScroll ? stage : window;
            let pinned = 0;
            if (!ownScroll) {
                const head = document.querySelector(".site-header");
                const pos = head ? getComputedStyle(head).position : "";
                if (pos === "sticky" || pos === "fixed") pinned = Math.max(0, head.getBoundingClientRect().bottom);
            }
            const view = ownScroll ? stage.getBoundingClientRect() : { top: pinned, bottom: window.innerHeight };
            const bar = document.querySelector(".admin-floating-actions.open");
            const floor = Math.min(view.bottom, bar ? bar.getBoundingClientRect().top : Infinity) - 12;
            const ceiling = view.top + 12;
            const input = picker.querySelector(".admin-furni-search");
            const box = picker.getBoundingClientRect();
            const top = (input || picker).getBoundingClientRect().top;
            const bottom = Math.max(box.bottom, reserve ? top + RESULTS_ROOM : box.bottom);
            let by = 0;
            if (bottom > floor) by = bottom - floor;
            if (top - by < ceiling) by = top - ceiling;
            if (Math.abs(by) < 1) return;
            const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            scroller.scrollBy({ top: by, behavior: reserve && !reduce ? "smooth" : "auto" });
        }

        /* The search box inside one room's panel. Deliberately does NOT go
           through render() on each keystroke — that rebuilds the whole list
           and would take the focus (and the half-typed word) with it. Only
           the results container is redrawn. */
        function wirePicker(image) {
            const picker = listEl.querySelector(".admin-furni-picker");
            if (!picker) return;
            const input = picker.querySelector(".admin-furni-search");
            const status = picker.querySelector(".admin-furni-picker-status");
            const results = picker.querySelector(".admin-furni-results");

            /* Put the search back exactly as it was before the re-render,
               so adding one furni from a set of results leaves the rest
               sitting there to be added too. setSelectionRange keeps the
               caret at the end rather than selecting the whole query, which
               would make the next keystroke wipe it. */
            input.value = pickerQuery;
            /* preventScroll, because this input is brand new every render and
               focusing a new element makes the browser scroll it into view —
               which is a second, competing opinion about where the page
               should sit, fighting the one addFurni below is enforcing. */
            input.focus({ preventScroll: true });
            input.setSelectionRange(input.value.length, input.value.length);

            let timer = null;
            // Rises with every search started, and a response is only drawn
            // if it is still the newest — otherwise a slow "ch" landing after
            // a fast "chair" would replace the right results with stale ones.
            let seq = 0;

            function drawResults(items) {
                if (!items.length) {
                    results.innerHTML = "";
                    status.textContent = "Nothing matches that.";
                    return;
                }
                // Read, not recordFor: opening the picker on a room must
                // not leave an empty record behind on a room nobody added to.
                const already = new Set(((formEl._furniDraft[image] || {}).items || []).map(furniKey));

                /* Which of these results share a display name, so only those
                   have to carry their furni line as well.

                   Habbo gives a whole colourway family one name: four
                   Armchairs, seven Heart Sofas, two Gates (lockable). Left
                   as bare names they are four identical rows, and picking
                   the right one is guesswork — so the ones that clash say
                   which they are, and the rest stay as they were. */
                const nameCount = {};
                items.forEach(f => { nameCount[f.name] = (nameCount[f.name] || 0) + 1; });

                results.innerHTML = items.map((f, i) => {
                    const key = furniKey(f);
                    const isAdded = already.has(key);
                    const line = nameCount[f.name] > 1 && f.className
                        ? '<span class="admin-furni-result-class">' + escapeHtml(f.className) + '</span>'
                        : '';
                    return '' +
                    '<button type="button" class="admin-furni-result' + (isAdded ? " is-added" : "") + '" data-index="' + i + '"' + (isAdded ? " disabled" : "") + '>' +
                        /* Lazy, because the result list is no longer capped —
                           a broad search draws three hundred rows, and every
                           icon is a request to furniindex.com. The pane is a
                           220px scroller (.admin-furni-results), so all but
                           the first handful are genuinely off screen and the
                           rest arrive as they are scrolled to. */
                        '<img src="' + escapeHtml(safeUrl(f.icon)) + '" alt="" loading="lazy" decoding="async">' +
                        '<span class="admin-furni-result-name">' + escapeHtml(f.name || "") + line + '</span>' +
                        '<span class="admin-hint">' + (isAdded ? "added" : escapeHtml((f.releaseDate || "").slice(0, 4))) + '</span>' +
                    '</button>';
                }).join("");
                results.querySelectorAll(".admin-furni-result").forEach(btn => {
                    btn.addEventListener("click", () => addFurni(image, items[Number(btn.dataset.index)]));
                });
                const added = items.filter(f => already.has(furniKey(f))).length;
                status.textContent = items.length + " match" + (items.length === 1 ? "" : "es")
                    + (added ? ` — ${added} added` : "")
                    + " — click to add, and keep clicking for more.";
                revealPicker(false);
            }

            // Redraw whatever the last search found, so the results are
            // still there after adding one of them.
            if (pickerResults.length) drawResults(pickerResults);

            /* The request itself, lifted out of the debounce so that Enter
               below can run it immediately instead of duplicating it. */
            async function runSearch(q) {
                const mine = ++seq;
                status.textContent = "Searching…";
                try {
                    const data = await Api.getFurniCatalogue(q);
                    if (mine !== seq) return;
                    pickerResults = data.items || [];
                    drawResults(pickerResults);
                } catch (err) {
                    if (mine !== seq) return;
                    pickerResults = [];
                    results.innerHTML = "";
                    status.textContent = err.message || "Couldn't reach the furni catalogue.";
                }
            }

            input.addEventListener("input", () => {
                const q = input.value.trim();
                pickerQuery = input.value;
                clearTimeout(timer);
                if (q.length < 2) {
                    pickerResults = [];
                    results.innerHTML = "";
                    status.textContent = "Type at least two letters.";
                    return;
                }
                // Waits for a pause in typing: the catalogue is proxied and
                // cached, but it is still a request per keystroke otherwise.
                timer = setTimeout(() => runSearch(q), 250);
            });

            /* Enter searches, and must never reach the form.

               This input is rendered inside #rooms-form, and a form with a
               submit button in it submits when Enter is pressed in any text
               field. So typing a furni name and pressing Enter — the most
               natural thing there is to do in a search box — saved the maze
               and closed the editor, before the search had even run.

               preventDefault stops that. Running the search on the spot is
               what the keypress plainly meant, and it skips the 250ms
               debounce rather than swallowing the key and doing nothing,
               which would look just as broken from the outside. */
            input.addEventListener("keydown", e => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const q = input.value.trim();
                clearTimeout(timer);
                if (q.length < 2) {
                    status.textContent = "Type at least two letters.";
                    return;
                }
                runSearch(q);
            });
        }

        /* Records one catalogue entry against a room image, in the same shape
           the scan writes, so the site needs to know nothing about where an
           entry came from (see renderFurniStrip in js/home.js). sprite is the
           first state/rotation's room-scale art — the scan uses whichever
           rotation it actually matched, and that is not a choice anyone can
           make for a furni that was never detected. */
        function addFurni(image, f) {
            const rec = recordFor(image);
            if ((rec.items || []).some(x => furniKey(x) === furniKey(f))) return;
            rec.items.push({
                name: f.name,
                motto: f.motto || "",
                icon: f.icon,
                sprite: (f.largeImages && f.largeImages[0] && f.largeImages[0][0]) || null,
                url: f.url,
                releaseDate: f.releaseDate || "",
                className: f.className || "",
                manual: true,
                addedAt: new Date().toISOString()
            });

            /* Keep the picker where it is on screen.

               Adding a furni puts a chip in the list ABOVE the search box, so
               the box and the results underneath it move down by exactly that
               chip's height — 25 to 32px, measured. The page never scrolls;
               the content grows and shoves the thing you are aiming at out
               from under the pointer, so the next furni you meant to click has
               moved by the time you click it. On a maze with a hundred rooms
               that happens on every single add.

               Nothing here can know the chip's height in advance — it depends
               on how long the furni's name is and whether it wraps — so it is
               measured rather than assumed: where the box was before the
               rebuild, where it is after, and the difference handed to the
               scroller. Which is what the browser's own scroll anchoring
               would do, if the whole list were not being replaced out from
               under it on every add. */
            const anchor = () => {
                const el = listEl.querySelector(".admin-furni-search");
                return el ? el.getBoundingClientRect().top : null;
            };
            // The admin's scroll container is .admin-stage, not the document —
            // body is overflow: hidden here. Falls back to the page for any
            // future layout that does not have one.
            const scroller = wrap.closest(".admin-stage") || document.scrollingElement;
            const was = anchor();

            render();

            const now = anchor();
            if (scroller && was != null && now != null) {
                const drift = now - was;
                if (drift) scroller.scrollTop += drift;
            }
        }

        // So a picture replaced elsewhere in the form can redraw this list
        // once its furni has moved to the new address — see moveFurniKey.
        formEl._renderFurni = render;
        render();
    }

    function wireThumbUpload(formEl, uploadPrefix) {
        const fileInput = formEl.querySelector(".admin-thumb-file");
        const textInput = formEl.querySelector('input[name="thumb"]');
        const status = formEl.querySelector(".admin-thumb-status");
        if (!fileInput) return;
        wireDropzone(fileInput);
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files[0];
            if (!file) return;
            status.textContent = "Uploading…";
            try {
                const { url } = await formUpload(formEl, uploadPrefix, file);
                noteUpload(formEl, url);
                // The thumbnail it replaces goes on the after-save list.
                queueImageDelete(formEl, textInput.value);
                textInput.value = url;
                status.textContent = "Uploaded";
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Upload failed.";
            }
        });
    }

    // Entrance/Finish upload — the thumb itself is the upload/replace
    // target (click or drop a file directly onto it), auto-uploading the
    // instant a file lands rather than needing a separate explicit button —
    // same pattern as a gallery room's own thumb, see wireGalleryEditor's
    // per-row wiring, which this closely mirrors.
    function wireBookendUpload(formEl, kind, uploadPrefix) {
        const fileInput = formEl.querySelector(`.admin-${kind}-file`);
        const removeBtn = formEl.querySelector(`.admin-${kind}-remove`);
        const textInput = formEl.querySelector(`input[name="${kind}Image"]`);
        const status = formEl.querySelector(`.admin-${kind}-status`);
        const previewEl = formEl.querySelector(`.admin-${kind}-field .admin-gallery-thumb`);
        if (!fileInput) return;
        const thumbLabel = fileInput.closest(".admin-gallery-thumb");

        ["dragenter", "dragover"].forEach(evt => thumbLabel.addEventListener(evt, e => {
            e.preventDefault();
            thumbLabel.classList.add("dragover");
        }));
        ["dragleave", "drop"].forEach(evt => thumbLabel.addEventListener(evt, e => {
            e.preventDefault();
            thumbLabel.classList.remove("dragover");
        }));
        thumbLabel.addEventListener("drop", e => {
            const file = e.dataTransfer.files[0];
            if (!file) return;
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        });

        fileInput.addEventListener("change", async () => {
            const file = fileInput.files[0];
            if (!file) return;
            status.style.display = "block";
            status.textContent = "Uploading…";
            try {
                const { url } = await formUpload(formEl, uploadPrefix, file);
                noteUpload(formEl, url);
                // Read now, after the upload: whatever is in the slot at
                // this moment is what is being replaced, furni and all.
                const was = textInput.value;
                queueImageDelete(formEl, was);
                textInput.value = url;
                moveFurniKey(formEl, was, url);
                if (previewEl) {
                    previewEl.style.backgroundImage = `url('${imgCdn(url, 100, 100, 55)}')`;
                    previewEl.classList.add("admin-gallery-thumb-filled");
                    previewEl.classList.remove("admin-gallery-thumb-empty");
                    const uploadText = previewEl.querySelector(".admin-gallery-thumb-upload-text");
                    if (uploadText) {
                        uploadText.className = "admin-gallery-thumb-replace-text";
                        uploadText.textContent = "Replace Image";
                    }
                }
                if (removeBtn) removeBtn.disabled = false;
                status.style.display = "none";
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Upload failed.";
            }
        });

        if (removeBtn) {
            removeBtn.addEventListener("click", async () => {
                if (!await showConfirmDialog(`Remove the ${kind === "entrance" ? "Entrance" : "Finish"} image? It is deleted for good when you save.`)) return;
                queueImageDelete(formEl, textInput.value);
                textInput.value = "";
                if (previewEl) {
                    previewEl.style.backgroundImage = "";
                    previewEl.classList.add("admin-gallery-thumb-empty");
                    previewEl.classList.remove("admin-gallery-thumb-filled");
                    const replaceText = previewEl.querySelector(".admin-gallery-thumb-replace-text");
                    if (replaceText) {
                        replaceText.className = "admin-gallery-thumb-upload-text";
                        replaceText.textContent = "Drag or click to upload image";
                    }
                }
                removeBtn.disabled = true;

                // The image's own older-version history goes with it — an
                // empty slot with old versions attached doesn't mean anything.
                (formEl[`_${kind}OldVersions`] || []).forEach(v => queueImageDelete(formEl, v.image));
                formEl[`_${kind}OldVersions`] = [];
                formEl[`_${kind}OldVersionsExpanded`] = false;
                const refresh = formEl[`_render${kind}OldVersions`];
                if (refresh) refresh();
            });
        }
    }

    // Promotes an image (either uploaded fresh or an existing gallery room,
    // see wireGalleryEditor's Entrance/End buttons) into the entrance or
    // finish bookend slot, updating that field's text input + label + live
    // preview thumbnail in place.
    function setBookendImage(formEl, kind, image, label) {
        const textInput = formEl.querySelector(`input[name="${kind}Image"]`);
        const labelInput = formEl.querySelector(`input[name="${kind}Label"]`);
        const previewEl = formEl.querySelector(`.admin-${kind}-field .admin-gallery-thumb`);
        const removeBtn = formEl.querySelector(`.admin-${kind}-remove`);
        if (textInput) textInput.value = image || "";
        if (labelInput) labelInput.value = label || (kind === "entrance" ? "Entrance" : "Finish");
        if (previewEl) {
            previewEl.style.backgroundImage = image ? `url('${imgCdn(image, 100, 100, 55)}')` : "";
            previewEl.classList.toggle("admin-gallery-thumb-filled", !!image);
            previewEl.classList.toggle("admin-gallery-thumb-empty", !image);
            const textEl = previewEl.querySelector(".admin-gallery-thumb-replace-text, .admin-gallery-thumb-upload-text");
            if (textEl) {
                textEl.className = image ? "admin-gallery-thumb-replace-text" : "admin-gallery-thumb-upload-text";
                textEl.textContent = image ? "Replace Image" : "Drag or click to upload image";
            }
        }
        if (removeBtn) removeBtn.disabled = !image;
    }

    // Older-version images for the Entrance/Finish bookend slots — same
    // idea as a gallery room's own Old Version toggle (see wireGalleryEditor)
    // but there's only ever one entrance and one finish, so the draft and
    // expanded-state live directly on formEl (`_entranceOldVersions` /
    // `_finishOldVersions`, `_entranceOldVersionsExpanded` / ...Expanded)
    // instead of a per-index Set. The render function is also stashed on
    // formEl (`_render${kind}OldVersions`) so promoteToBookend and the
    // bookend's own Remove button can refresh this panel after they change
    // formEl[`_${kind}OldVersions`] out from under it.
    /* Reordering a list of older versions. Two panels need this — the
       gallery rooms' and the entrance/finish bookends' — and they address
       their rows by different class prefixes so that one panel's buttons
       can't be picked up by the other's querySelectorAll while both are
       open on screen at once. Hence the prefix parameter rather than one
       fixed class.

       Up/Down only, no Top/Bottom: a room's older versions run to two or
       three, where the main gallery they sit inside runs to a hundred and
       earns the extra pair. */
    function oldVersionMoveButtonsHtml(prefix, index, total) {
        return `
            <button type="button" class="admin-pill-btn ${prefix}-subup" ${index === 0 ? "disabled" : ""} title="Move up">&#9650; Up</button>
            <button type="button" class="admin-pill-btn ${prefix}-subdown" ${index === total - 1 ? "disabled" : ""} title="Move down">&#9660; Down</button>
        `;
    }

    // The order here is the order the site steps through them behind the
    // "See older versions of this room" pill (see js/home.js), so this is
    // the whole feature — no other bookkeeping travels with a version.
    function moveOldVersion(list, from, to) {
        if (to < 0 || to >= list.length) return false;
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        return true;
    }

    function wireBookendOldVersions(formEl, kind, uploadPrefix) {
        const toggleBtn = formEl.querySelector(`.admin-${kind}-oldversions-toggle`);
        const container = formEl.querySelector(`.admin-${kind}-oldversions-container`);
        if (!toggleBtn || !container) return;

        function render() {
            const items = formEl[`_${kind}OldVersions`] || (formEl[`_${kind}OldVersions`] = []);
            const expanded = !!formEl[`_${kind}OldVersionsExpanded`];
            toggleBtn.classList.toggle("active", expanded);
            toggleBtn.textContent = items.length ? `Old Versions (${items.length})` : "Old Version";

            if (!expanded) {
                container.innerHTML = "";
                return;
            }

            const rows = items.map((v, vi) => `
                <div class="admin-gallery-row" data-sub-index="${vi}">
                    <div class="admin-gallery-row-top">
                        <div class="admin-gallery-thumb" style="${v.image ? `background-image:url('${imgCdn(v.image, 100, 100, 55)}');` : ""}"></div>
                        <input type="text" class="admin-gallery-label admin-${kind}-oldversions-sublabel" value="${escapeHtml(v.label || "")}" placeholder="Label (optional)">
                    </div>
                    <div class="admin-gallery-actions-secondary">
                        ${oldVersionMoveButtonsHtml(`admin-${kind}-oldversions`, vi, items.length)}
                        <button type="button" class="admin-pill-btn admin-pill-danger admin-${kind}-oldversions-subremove" title="Remove">Remove</button>
                    </div>
                </div>
            `).join("");

            container.innerHTML = `
                <div class="admin-oldversions-subpanel">
                    <p class="admin-hint">Older screenshots of this ${kind === "entrance" ? "entrance" : "finish"} image — shown behind a "See older version(s)" pill on the site.</p>
                    <div class="admin-gallery-list">${rows || `<p class="admin-empty">No older versions added yet.</p>`}</div>
                    <div class="admin-gallery-add">
                        <input type="text" class="admin-gallery-new-label admin-${kind}-oldversions-new-label" placeholder="Label (optional)">
                        <input type="file" class="admin-${kind}-oldversions-new-file" accept="image/png,image/jpeg,image/gif,image/webp">
                        <button type="button" class="admin-pill-btn admin-${kind}-oldversions-add-btn">+ Add Older Version</button>
                    </div>
                    <p class="admin-${kind}-oldversions-status" style="display:none;"></p>
                </div>
            `;

            container.querySelectorAll("[data-sub-index]").forEach(row => {
                const vi = Number(row.dataset.subIndex);
                row.querySelector(`.admin-${kind}-oldversions-sublabel`).addEventListener("input", e => {
                    items[vi].label = e.target.value;
                });
                row.querySelector(`.admin-${kind}-oldversions-subup`).addEventListener("click", () => {
                    if (moveOldVersion(items, vi, vi - 1)) render();
                });
                row.querySelector(`.admin-${kind}-oldversions-subdown`).addEventListener("click", () => {
                    if (moveOldVersion(items, vi, vi + 1)) render();
                });
                row.querySelector(`.admin-${kind}-oldversions-subremove`).addEventListener("click", async () => {
                    if (!await showConfirmDialog("Remove this older version image?")) return;
                    const [removed] = items.splice(vi, 1);
                    render();
                    queueImageDelete(formEl, removed.image);
                });
            });

            const subLabelInput = container.querySelector(`.admin-${kind}-oldversions-new-label`);
            const subFileInput = container.querySelector(`.admin-${kind}-oldversions-new-file`);
            const subAddBtn = container.querySelector(`.admin-${kind}-oldversions-add-btn`);
            const subStatus = container.querySelector(`.admin-${kind}-oldversions-status`);
            wireDropzone(subFileInput);
            subAddBtn.addEventListener("click", async () => {
                const file = subFileInput.files[0];
                if (!file) {
                    subStatus.textContent = "Choose an image first.";
                    subStatus.style.display = "block";
                    return;
                }
                const label = subLabelInput.value.trim();
                subAddBtn.disabled = true;
                subStatus.style.display = "block";
                subStatus.textContent = "Uploading…";
                try {
                    const { url } = await formUpload(formEl, uploadPrefix, file);
                    /* Re-read, not the `items` this render captured: while
                       the file was uploading, promoting a room to this slot
                       or removing the slot's picture REPLACES the list, and
                       a push onto the old one vanished — the picture was in
                       storage and in no record. With no picture in the slot
                       any more, an older version of it means nothing (see
                       the Remove button), so the upload goes too. */
                    const slotImage = formEl.querySelector(`input[name="${kind}Image"]`);
                    if (!slotImage || !slotImage.value.trim()) {
                        dropOrphanUpload(url);
                        subStatus.textContent = "The picture was removed while this uploaded, so the older version was not kept.";
                        return;
                    }
                    noteUpload(formEl, url);
                    const list = formEl[`_${kind}OldVersions`] || (formEl[`_${kind}OldVersions`] = []);
                    list.push({ image: url, label });
                    render();
                } catch (err) {
                    if (err.status === 401) { lockOut(); return; }
                    subStatus.textContent = err.message || "Upload failed.";
                } finally {
                    subAddBtn.disabled = false;
                }
            });
        }

        formEl[`_render${kind}OldVersions`] = render;
        toggleBtn.addEventListener("click", () => {
            formEl[`_${kind}OldVersionsExpanded`] = !formEl[`_${kind}OldVersionsExpanded`];
            render();
        });

        render();
    }

    /* ---------- the pop-ups, made safe for a keyboard ----------

       The three dialogs below block the page for a MOUSE — the overlay sits
       over everything — but did nothing about focus. It stayed on the
       button that opened the dialog, behind it, so a second Enter pressed
       that button again: two "Remove this room?" dialogs stacked, two Yeses,
       and two rooms gone, the second one never asked about.

       So while one is open: focus is inside it (on the safe answer, so a
       stray or repeated Enter declines rather than confirms), Tab cycles
       within it, Escape closes it the way × does, everything else on the
       page is inert — unfocusable and unclickable — and a second dialog
       asked for meanwhile is refused outright, answering as if declined.
       Focus goes back where it came from on close.

       Returns null when a dialog is already showing; otherwise a function
       that tears this one down. */
    let dialogShowing = false;
    /* How the dialog that is up right now is answered "No" from outside it
       (30 Sept 2026): lockOut calls this, so a session that runs out with
       an Are You Sure? open closes it as declined and the page is given
       back before the sign-in box goes up — it used to stay on top, with
       the sign-in box inert underneath it. */
    let cancelOpenDialog = null;
    let dialogIds = 0;

    function holdDialog(overlay, initialFocus, onEscape) {
        if (dialogShowing) return null;
        dialogShowing = true;
        cancelOpenDialog = onEscape;
        const returnTo = document.activeElement;
        /* Said as a dialog to a screen reader (30 Sept 2026): every box
           built here is a .modal with its heading in the titlebar, so the
           roles are set once, here, rather than in each builder. */
        const box = overlay.querySelector(".modal");
        const heading = overlay.querySelector(".chrome-titlebar h2");
        if (box) {
            box.setAttribute("role", "dialog");
            box.setAttribute("aria-modal", "true");
            if (heading) {
                if (!heading.id) heading.id = "admin-dialog-title-" + (++dialogIds);
                box.setAttribute("aria-labelledby", heading.id);
            }
        }
        /* A double-click on a button that opens a dialog: the second click
           landed on the fresh overlay, which counts as No, and the dialog
           shut before it was seen (30 Sept 2026). Clicks on the overlay
           itself are ignored for its first 300ms. Registered before the
           builders' own listeners, so stopImmediatePropagation beats them. */
        const openedAt = Date.now();
        overlay.addEventListener("click", e => {
            if (e.target === overlay && Date.now() - openedAt < 300) e.stopImmediatePropagation();
        }, true);
        // Only what this made inert is given back — anything already inert
        // for its own reasons stays so.
        const madeInert = Array.from(document.body.children).filter(el => el !== overlay && !el.inert);
        madeInert.forEach(el => { el.inert = true; });

        const focusables = () => Array.from(overlay.querySelectorAll("button:not([disabled]), [href], input, select, textarea"));
        const onKey = e => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onEscape();
                return;
            }
            if (e.key !== "Tab") return;
            const list = focusables();
            if (!list.length) return;
            const first = list[0];
            const last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            else if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener("keydown", onKey, true);
        if (initialFocus) initialFocus.focus();

        return () => {
            document.removeEventListener("keydown", onKey, true);
            madeInert.forEach(el => { el.inert = false; });
            overlay.remove();
            dialogShowing = false;
            cancelOpenDialog = null;
            if (returnTo && typeof returnTo.focus === "function" && document.body.contains(returnTo)) {
                returnTo.focus({ preventScroll: true });
            }
        };
    }

    // Pop-up shown when promoting a room image over an entrance/finish slot
    // that's already occupied — asks whether the bumped image should be
    // deleted outright or moved back into the room-by-room list. Built as a
    // one-off modal-overlay (reusing the same classes as the room/login
    // modals) instead of a native confirm() so it can offer three real
    // choices, and it blocks the rest of the form while open so the row
    // index the caller is acting on can't go stale underneath it.
    function showBookendConflictDialog(kind, existingLabel) {
        return new Promise(resolve => {
            const kindLabel = kind === "entrance" ? "Entrance" : "Finish";
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open";
            overlay.innerHTML = `
                <div class="modal">
                    <div class="chrome-titlebar">
                        <h2>Replace the ${kindLabel} image?</h2>
                        <button type="button" class="chrome-close" aria-label="Cancel">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="room-desc-full">This maze already has a ${kindLabel.toLowerCase()} image ("${escapeHtml(existingLabel)}"). What should happen to it?</p>
                        <div class="admin-form-actions" style="flex-direction:column; align-items:stretch; gap:8px; margin-top:10px;">
                            <button type="button" class="admin-action-pill admin-pill-solid" data-choice="keep">Move it into the room list</button>
                            <button type="button" class="admin-action-pill admin-pill-danger" data-choice="discard">Delete it when I save</button>
                            <button type="button" class="admin-action-pill" data-choice="cancel">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            if (dialogShowing) { resolve("cancel"); return; }
            document.body.appendChild(overlay);

            // Opens on Cancel, the answer that changes nothing.
            const release = holdDialog(overlay, overlay.querySelector('[data-choice="cancel"]'), () => finish("cancel"));
            if (!release) { overlay.remove(); resolve("cancel"); return; }

            function finish(choice) {
                release();
                resolve(choice);
            }

            overlay.querySelectorAll("[data-choice]").forEach(btn => {
                btn.addEventListener("click", () => finish(btn.dataset.choice));
            });
            overlay.querySelector(".chrome-close").addEventListener("click", () => finish("cancel"));
            overlay.addEventListener("click", e => {
                if (e.target === overlay) finish("cancel");
            });
        });
    }

    // Generic Yes/No pop-up (same modal-overlay treatment as the dialogs
    // above) — resolves true only if "Yes" was actually clicked; closing
    // any other way (the × button, clicking outside, Escape) counts as "No".
    /* opts.danger (30 Sept 2026): the Yes of a delete wears the red
       admin-pill-danger, as the bookend dialog's "Delete it" does. Added
       when the last native confirm()s in the Warren were brought in here;
       the message is still markup, so callers escape what they put in it. */
    function showConfirmDialog(message, opts) {
        const danger = !!(opts && opts.danger);
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open";
            overlay.innerHTML = `
                <div class="modal confirm-modal">
                    <div class="chrome-titlebar">
                        <h2>Are You Sure?</h2>
                        <button type="button" class="chrome-close" aria-label="No">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="room-desc-full confirm-message">${message}</p>
                        <div class="admin-form-actions confirm-actions">
                            <button type="button" class="admin-action-pill ${danger ? "admin-pill-danger" : "admin-pill-solid"}" data-choice="yes">Yes</button>
                            <button type="button" class="admin-action-pill" data-choice="no">No</button>
                        </div>
                    </div>
                </div>
            `;
            // Refused while another is showing — see holdDialog. Answered
            // as "No", which is what every caller treats as "do nothing".
            if (dialogShowing) { resolve(false); return; }
            document.body.appendChild(overlay);

            // Opens on No: Enter pressed again by accident declines.
            const release = holdDialog(overlay, overlay.querySelector('[data-choice="no"]'), () => finish("no"));
            if (!release) { overlay.remove(); resolve(false); return; }

            function finish(choice) {
                release();
                resolve(choice === "yes");
            }

            overlay.querySelectorAll("[data-choice]").forEach(btn => {
                btn.addEventListener("click", () => finish(btn.dataset.choice));
            });
            overlay.querySelector(".chrome-close").addEventListener("click", () => finish("no"));
            overlay.addEventListener("click", e => {
                if (e.target === overlay) finish("no");
            });
        });
    }

    // Plain acknowledgement pop-up — a single OK button, no other choice.
    /* `title` (30 Sept 2026) so the same box can stand in for alert():
       the landing page's callers leave it out and keep their old heading.
       The message is markup, like the confirm's. */
    function showInfoDialog(message, title) {
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open";
            overlay.innerHTML = `
                <div class="modal confirm-modal">
                    <div class="chrome-titlebar">
                        <h2>${escapeHtml(title || "Landing Page Updated")}</h2>
                        <button type="button" class="chrome-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="room-desc-full confirm-message">${message}</p>
                        <div class="admin-form-actions confirm-actions">
                            <button type="button" class="btn btn-solid" data-choice="ok">OK</button>
                        </div>
                    </div>
                </div>
            `;
            if (dialogShowing) { resolve(); return; }
            document.body.appendChild(overlay);

            const release = holdDialog(overlay, overlay.querySelector('[data-choice="ok"]'), () => finish());
            if (!release) { overlay.remove(); resolve(); return; }

            function finish() {
                release();
                resolve();
            }

            overlay.querySelector("[data-choice]").addEventListener("click", finish);
            overlay.querySelector(".chrome-close").addEventListener("click", finish);
            overlay.addEventListener("click", e => {
                if (e.target === overlay) finish();
            });
        });
    }

    // alert(), the page's way: plain text, escaped here (30 Sept 2026).
    function sayProblem(text, title) {
        return showInfoDialog(escapeHtml(text), title || "Something Went Wrong");
    }

    /* The page's own prompt() (30 Sept 2026): the Are You Sure? with one
       text box in it. Resolves the text typed (maybe "") on Yes or Enter in
       the box, and null on No, ×, a click outside or Escape — prompt()'s
       own answers, so a caller's `if (x === null) return` reads the same.
       opts: { label, value, placeholder, maxlength, title, danger }. Opens
       with the box focused, since typing is what it is there for. */
    function showPromptDialog(message, opts) {
        const o = opts || {};
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open";
            overlay.innerHTML = `
                <div class="modal confirm-modal">
                    <div class="chrome-titlebar">
                        <h2>${escapeHtml(o.title || "Are You Sure?")}</h2>
                        <button type="button" class="chrome-close" aria-label="No">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="room-desc-full confirm-message">${message}</p>
                        <label class="confirm-prompt" style="display:flex; flex-direction:column; gap:4px; margin-top:10px;">
                            ${o.label ? `<span class="ctl-label">${escapeHtml(o.label)}</span>` : ""}
                            <input type="text" class="ctl-input" data-prompt-box autocomplete="off"${o.maxlength ? ` maxlength="${Number(o.maxlength) || 200}"` : ""} placeholder="${escapeHtml(o.placeholder || "")}" value="${escapeHtml(o.value || "")}">
                        </label>
                        <div class="admin-form-actions confirm-actions">
                            <button type="button" class="admin-action-pill ${o.danger ? "admin-pill-danger" : "admin-pill-solid"}" data-choice="yes">Yes</button>
                            <button type="button" class="admin-action-pill" data-choice="no">No</button>
                        </div>
                    </div>
                </div>
            `;
            if (dialogShowing) { resolve(null); return; }
            document.body.appendChild(overlay);

            const box = overlay.querySelector("[data-prompt-box]");
            const release = holdDialog(overlay, box, () => finish("no"));
            if (!release) { overlay.remove(); resolve(null); return; }
            box.select();

            let done = false;
            function finish(choice) {
                // Once: an Enter held down repeats, and must not tear down
                // a second time whatever dialog opens next.
                if (done) return;
                done = true;
                const text = box.value;
                release();
                resolve(choice === "yes" ? text : null);
            }

            box.addEventListener("keydown", e => {
                // Not the Enter that ends an IME composition — the same
                // guard as the forms' own Enter handling in this file.
                if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish("yes"); }
            });
            overlay.querySelectorAll("[data-choice]").forEach(btn => {
                btn.addEventListener("click", () => finish(btn.dataset.choice));
            });
            overlay.querySelector(".chrome-close").addEventListener("click", () => finish("no"));
            overlay.addEventListener("click", e => {
                if (e.target === overlay) finish("no");
            });
        });
    }

    // Shared by the gallery editor's Entrance/End buttons — pulls room[index]
    // out of the draft and into the given bookend slot, prompting first if
    // that slot is already occupied (see showBookendConflictDialog).
    async function promoteToBookend(formEl, draft, index, kind, renderGalleryList) {
        const textInput = formEl.querySelector(`input[name="${kind}Image"]`);
        const labelInput = formEl.querySelector(`input[name="${kind}Label"]`);
        const existingImage = textInput ? textInput.value.trim() : "";
        const existingLabel = (labelInput && labelInput.value.trim()) || (kind === "entrance" ? "Entrance" : "Finish");
        const existingOldVersions = formEl[`_${kind}OldVersions`] || [];

        let choice = "discard";
        if (existingImage) {
            choice = await showBookendConflictDialog(kind, existingLabel);
            if (choice === "cancel") return;
        }

        const [promoted] = draft.splice(index, 1);

        if (existingImage) {
            if (choice === "keep") {
                // The bumped bookend's own older versions travel with it
                // back into the room list, same as its image and label.
                draft.push({ image: existingImage, label: existingLabel, bonus: false, runThrough: false, oldVersions: existingOldVersions });
            } else {
                // "Delete it" — queued like every other removal, so a
                // Cancel afterwards leaves the saved maze's picture intact.
                queueImageDelete(formEl, existingImage);
                existingOldVersions.forEach(v => queueImageDelete(formEl, v.image));
            }
        }

        // The promoted room's own older versions become this slot's, not
        // discarded — same principle in reverse.
        formEl[`_${kind}OldVersions`] = promoted.oldVersions || [];
        formEl[`_${kind}OldVersionsExpanded`] = false;
        const refreshOldVersions = formEl[`_render${kind}OldVersions`];
        if (refreshOldVersions) refreshOldVersions();

        setBookendImage(formEl, kind, promoted.image, promoted.label);
        renderGalleryList();
    }

    function wireGalleryEditor(formEl, uploadPrefix, allowMissingImage) {
        const listEl = formEl.querySelector(".admin-gallery-list");
        const labelInput = formEl.querySelector(".admin-gallery-new-label");
        const fileInput = formEl.querySelector(".admin-gallery-new-file");
        const addBtn = formEl.querySelector(".admin-gallery-add-btn");
        const status = formEl.querySelector(".admin-gallery-status");
        wireDropzone(fileInput);

        /* Enter on the new room's label adds the room, and does not submit.

           The same trap as the furni search above it: this sits inside
           #rooms-form, so Enter here used to save the maze and shut the
           editor rather than add the row being typed. It goes to the Add
           button because that is what the key means next to a field with an
           Add button beside it — and that handler already copes with there
           being no file chosen, which for a room is a normal way to add
           one (label now, screenshot later). */
        labelInput.addEventListener("keydown", e => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            addBtn.click();
        });

        // Which rows currently have their older-versions sub-panel open,
        // keyed by room index — persisted on the form element (not a local
        // var) so it survives across renderGalleryList() re-renders, which
        // happen on every state change including ones in unrelated rows.
        // Cleared on remove/reorder below since either shifts every index
        // after the affected row, which would otherwise leave the wrong
        // row's panel open.
        const expandedOldVersions = formEl._expandedOldVersions || (formEl._expandedOldVersions = new Set());

        function oldVersionsSubpanelHtml(g) {
            const rows = g.oldVersions.map((v, vi) => `
                <div class="admin-gallery-row" data-sub-index="${vi}">
                    <div class="admin-gallery-row-top">
                        <div class="admin-gallery-thumb" style="${v.image ? `background-image:url('${imgCdn(v.image, 100, 100, 55)}');` : ""}"></div>
                        <input type="text" class="admin-gallery-label admin-oldversions-sublabel" value="${escapeHtml(v.label || "")}" placeholder="Label (optional)">
                    </div>
                    <div class="admin-gallery-actions-secondary">
                        ${oldVersionMoveButtonsHtml("admin-oldversions", vi, g.oldVersions.length)}
                        <button type="button" class="admin-pill-btn admin-pill-danger admin-oldversions-subremove" title="Remove">Remove</button>
                    </div>
                </div>
            `).join("");
            return `
                <div class="admin-oldversions-subpanel">
                    <p class="admin-hint">Older screenshots of this room (e.g. before a rebuild) — shown behind a "See older version(s)" pill on the site, kept separate from the main image above.</p>
                    <div class="admin-gallery-list">${rows || `<p class="admin-empty">No older versions added yet.</p>`}</div>
                    <div class="admin-gallery-add">
                        <input type="text" class="admin-gallery-new-label admin-oldversions-new-label" placeholder="Label (optional)">
                        <input type="file" class="admin-oldversions-new-file" accept="image/png,image/jpeg,image/gif,image/webp">
                        <button type="button" class="admin-pill-btn admin-oldversions-add-btn">+ Add Older Version</button>
                    </div>
                    <p class="admin-oldversions-status" style="display:none;"></p>
                </div>
            `;
        }

        // Every row's buttons sit on two lines under the name field, rather
        // than crowding a 48px thumbnail with seven-plus buttons on one —
        // Old Version/Bonus/Run-Through/Entrance/End on the first, reorder
        // + Remove on the second. Shares .admin-pill-btn (the same rounded,
        // mostly-transparent pill look used for tags elsewhere), solid-
        // filled only while .active — Bonus/Run-Through carry a real on/off
        // data state; Old Version's .active just mirrors whether its
        // sub-panel is currently expanded.
        function renderGalleryList() {
            const draft = formEl._galleryDraft;

            // Mirrors js/home.js's own roomIndex logic exactly (bonus and
            // run-through rooms are excluded from the count/number there
            // too) so the number shown here is the same one a visitor will
            // actually see on the public site, not just this row's raw
            // position in the list.
            let roomCounter = 0;
            const roomNumbers = draft.map(g => (g.bonus || g.runThrough) ? null : ++roomCounter);

            listEl.innerHTML = draft.map((g, i) => {
                const expanded = expandedOldVersions.has(i);
                const oldVersionsLabel = g.oldVersions.length ? `Old Versions (${g.oldVersions.length})` : "Old Version";
                const roomNumber = roomNumbers[i];
                return `
                    <div class="admin-gallery-row" data-index="${i}">
                        ${roomNumber ? `<span class="admin-gallery-room-number" title="Room number on the public site">${roomNumber}</span>` : ""}
                        <div class="admin-gallery-row-top">
                            <span class="admin-gallery-drag-handle" draggable="true" title="Drag to reorder">&#9776;</span>
                            ${g.image
                                ? `<label class="admin-gallery-thumb admin-gallery-thumb-filled" style="background-image:url('${imgCdn(g.image, 100, 100, 55)}');">
                                       <input type="file" class="admin-gallery-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp">
                                       <span class="admin-gallery-thumb-replace-text">Replace Image</span>
                                   </label>`
                                : `<label class="admin-gallery-thumb admin-gallery-thumb-empty">
                                       <input type="file" class="admin-gallery-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp">
                                       <span class="admin-gallery-thumb-upload-text">Drag or click to upload image</span>
                                   </label>`}
                            <input type="text" class="admin-gallery-label" value="${escapeHtml(g.label || "")}" placeholder="Room label">
                        </div>
                        <div class="admin-gallery-actions">
                            <button type="button" class="admin-pill-btn admin-gallery-oldversions-toggle ${expanded ? "active" : ""}" title="Add or view older versions of this room">${oldVersionsLabel}</button>
                            <button type="button" class="admin-pill-btn admin-gallery-bonus ${g.bonus ? "active" : ""}" title="Mark as Bonus Room">Bonus</button>
                            <button type="button" class="admin-pill-btn admin-gallery-run-through ${g.runThrough ? "active" : ""}" title="Mark as a run-through room — excluded from the room count and number">Run-Through</button>
                            <button type="button" class="admin-pill-btn admin-gallery-make-entrance" ${g.image ? "" : "disabled"} title="${g.image ? "Make this the Entrance image" : "Add an image to this room first"}">Entrance</button>
                            <button type="button" class="admin-pill-btn admin-gallery-make-finish" ${g.image ? "" : "disabled"} title="${g.image ? "Make this the Finish image" : "Add an image to this room first"}">End</button>
                        </div>
                        <div class="admin-gallery-actions-secondary">
                            <button type="button" class="admin-pill-btn admin-gallery-top" ${i === 0 ? "disabled" : ""} title="Send to top (Room 1)">Top</button>
                            <button type="button" class="admin-pill-btn admin-gallery-up" ${i === 0 ? "disabled" : ""} title="Move up">&#9650; Up</button>
                            <button type="button" class="admin-pill-btn admin-gallery-down" ${i === draft.length - 1 ? "disabled" : ""} title="Move down">&#9660; Down</button>
                            <button type="button" class="admin-pill-btn admin-gallery-bottom" ${i === draft.length - 1 ? "disabled" : ""} title="Send to bottom (last room)">Bottom</button>
                            <button type="button" class="admin-pill-btn admin-pill-danger admin-gallery-remove" title="Remove">Remove</button>
                        </div>
                        ${expanded ? oldVersionsSubpanelHtml(g) : ""}
                    </div>
                `;
            }).join("");

            // :scope > so this only matches the top-level room rows — an
            // expanded row's old-versions subpanel nests its own
            // .admin-gallery-row elements (data-sub-index, not data-index)
            // several levels down, and a plain descendant query would catch
            // those too, then throw wiring a toggle button that isn't there.
            listEl.querySelectorAll(":scope > .admin-gallery-row").forEach(row => {
                const i = Number(row.dataset.index);
                row.querySelector(".admin-gallery-oldversions-toggle").addEventListener("click", () => {
                    if (expandedOldVersions.has(i)) expandedOldVersions.delete(i);
                    else expandedOldVersions.add(i);
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-bonus").addEventListener("click", () => {
                    draft[i].bonus = !draft[i].bonus;
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-run-through").addEventListener("click", () => {
                    draft[i].runThrough = !draft[i].runThrough;
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-make-entrance").addEventListener("click", () => {
                    promoteToBookend(formEl, draft, i, "entrance", renderGalleryList);
                });
                row.querySelector(".admin-gallery-make-finish").addEventListener("click", () => {
                    promoteToBookend(formEl, draft, i, "finish", renderGalleryList);
                });
                row.querySelector(".admin-gallery-label").addEventListener("input", e => {
                    draft[i].label = e.target.value;
                });

                // Every room's thumb is a live upload target now, not just
                // an image-less one (see addBtn below for how those start
                // out) — same drag/drop + click-to-browse pattern as
                // wireDropzone, just built directly onto the thumb itself
                // (already the right shape/size) rather than wrapping the
                // input in a whole separate dropzone element. Dropping or
                // picking a file here always just overwrites draft[i].image
                // below, whether that's setting it for the first time or
                // replacing whatever was already there.
                const thumbFileInput = row.querySelector(".admin-gallery-thumb-file");
                if (thumbFileInput) {
                    const thumbLabel = thumbFileInput.closest(".admin-gallery-thumb");
                    ["dragenter", "dragover"].forEach(evt => thumbLabel.addEventListener(evt, e => {
                        e.preventDefault();
                        thumbLabel.classList.add("dragover");
                    }));
                    ["dragleave", "drop"].forEach(evt => thumbLabel.addEventListener(evt, e => {
                        e.preventDefault();
                        thumbLabel.classList.remove("dragover");
                    }));
                    thumbLabel.addEventListener("drop", e => {
                        const file = e.dataTransfer.files[0];
                        if (!file) return;
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        thumbFileInput.files = dt.files;
                        thumbFileInput.dispatchEvent(new Event("change", { bubbles: true }));
                    });
                    thumbFileInput.addEventListener("change", async () => {
                        const file = thumbFileInput.files[0];
                        if (!file) return;
                        /* The room itself, not its index. `i` is where the
                           row was when this render drew it; by the time the
                           upload lands the list can have been reordered, or
                           this room removed or promoted to entrance/finish —
                           and draft[i] was then a different room, which had
                           its picture silently swapped for this one. */
                        const entry = draft[i];
                        status.style.display = "block";
                        status.textContent = "Uploading…";
                        try {
                            const { url } = await formUpload(formEl, uploadPrefix, file);
                            if (!(formEl._galleryDraft || []).includes(entry)) {
                                dropOrphanUpload(url);
                                status.textContent = "That room left the list while its picture uploaded, so the upload was not kept.";
                                return;
                            }
                            noteUpload(formEl, url);
                            // Replacing used to leave the old picture in
                            // storage for good; it goes on the after-save
                            // list now, like a removal.
                            const was = entry.image;
                            queueImageDelete(formEl, was);
                            entry.image = url;
                            moveFurniKey(formEl, was, url);
                            status.style.display = "none";
                            renderGalleryList();
                        } catch (err) {
                            if (err.status === 401) { lockOut(); return; }
                            status.textContent = err.message || "Upload failed.";
                        }
                    });
                }
                row.querySelector(".admin-gallery-top").addEventListener("click", () => {
                    if (i === 0) return;
                    expandedOldVersions.clear();
                    const [moved] = draft.splice(i, 1);
                    draft.unshift(moved);
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-up").addEventListener("click", () => {
                    if (i === 0) return;
                    expandedOldVersions.clear();
                    [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]];
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-down").addEventListener("click", () => {
                    if (i === draft.length - 1) return;
                    expandedOldVersions.clear();
                    [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]];
                    renderGalleryList();
                });
                row.querySelector(".admin-gallery-bottom").addEventListener("click", () => {
                    if (i === draft.length - 1) return;
                    expandedOldVersions.clear();
                    const [moved] = draft.splice(i, 1);
                    draft.push(moved);
                    renderGalleryList();
                });

                // Drag-to-reorder, alongside the Up/Down buttons above rather
                // than replacing them. Only the handle itself is draggable —
                // not the whole row — so dragging inside the label input
                // still just selects text instead of picking the row up.
                // Drop position is whichever half of the target row the
                // cursor is over (top half = insert before, bottom = after).
                const dragHandle = row.querySelector(".admin-gallery-drag-handle");
                dragHandle.addEventListener("dragstart", e => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                    row.classList.add("dragging");
                });
                dragHandle.addEventListener("dragend", () => {
                    row.classList.remove("dragging");
                });
                // A file dragged from the OS into this row's own nested
                // Old Version dropzone (see oldVersionsSubpanelHtml) bubbles
                // its dragover/drop events up through the row too — without
                // this guard, that also triggered the reorder logic below:
                // e.dataTransfer.getData("text/plain") is "" for a file
                // drag (no setData call ever set it), and Number("") is 0,
                // not NaN, so the "not a real reorder" check silently failed
                // and spliced room 0 out to wherever the file landed,
                // scrambling the room order and re-rendering the list out
                // from under the upload that was actually in progress.
                row.addEventListener("dragover", e => {
                    if (e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                    row.classList.toggle("drag-over-top", before);
                    row.classList.toggle("drag-over-bottom", !before);
                });
                row.addEventListener("dragleave", () => {
                    row.classList.remove("drag-over-top", "drag-over-bottom");
                });
                row.addEventListener("drop", e => {
                    if (e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    row.classList.remove("drag-over-top", "drag-over-bottom");
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (Number.isNaN(from) || from === i) return;
                    const before = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
                    let to = before ? i : i + 1;
                    if (from < to) to--;
                    expandedOldVersions.clear();
                    const [moved] = draft.splice(from, 1);
                    draft.splice(to, 0, moved);
                    renderGalleryList();
                });

                row.querySelector(".admin-gallery-remove").addEventListener("click", async () => {
                    if (!await showConfirmDialog(`Remove "${escapeHtml(draft[i].label || "this room")}"? Its pictures are deleted for good when you save.`)) return;
                    expandedOldVersions.clear();
                    const [removed] = draft.splice(i, 1);
                    renderGalleryList();
                    // Queued — see imageKeysOf. Deleting here broke the live
                    // maze whenever the edit was then cancelled.
                    queueImageDelete(formEl, removed.image);
                    removed.oldVersions.forEach(v => queueImageDelete(formEl, v.image));
                });

                if (!expandedOldVersions.has(i)) return;

                row.querySelectorAll("[data-sub-index]").forEach(subRow => {
                    const vi = Number(subRow.dataset.subIndex);
                    subRow.querySelector(".admin-oldversions-sublabel").addEventListener("input", e => {
                        draft[i].oldVersions[vi].label = e.target.value;
                    });
                    subRow.querySelector(".admin-oldversions-subup").addEventListener("click", () => {
                        if (moveOldVersion(draft[i].oldVersions, vi, vi - 1)) renderGalleryList();
                    });
                    subRow.querySelector(".admin-oldversions-subdown").addEventListener("click", () => {
                        if (moveOldVersion(draft[i].oldVersions, vi, vi + 1)) renderGalleryList();
                    });
                    subRow.querySelector(".admin-oldversions-subremove").addEventListener("click", async () => {
                        if (!await showConfirmDialog("Remove this older version image?")) return;
                        const [removed] = draft[i].oldVersions.splice(vi, 1);
                        renderGalleryList();
                        queueImageDelete(formEl, removed.image);
                    });
                });

                const subLabelInput = row.querySelector(".admin-oldversions-new-label");
                const subFileInput = row.querySelector(".admin-oldversions-new-file");
                const subAddBtn = row.querySelector(".admin-oldversions-add-btn");
                const subStatus = row.querySelector(".admin-oldversions-status");
                wireDropzone(subFileInput);
                subAddBtn.addEventListener("click", async () => {
                    const file = subFileInput.files[0];
                    if (!file) {
                        subStatus.textContent = "Choose an image first.";
                        subStatus.style.display = "block";
                        return;
                    }
                    const label = subLabelInput.value.trim();
                    subAddBtn.disabled = true;
                    subStatus.style.display = "block";
                    subStatus.textContent = "Uploading…";
                    // The room, not its index — see the thumbnail upload
                    // above for what the index went wrong with.
                    const entry = draft[i];
                    try {
                        const { url } = await formUpload(formEl, uploadPrefix, file);
                        if (!(formEl._galleryDraft || []).includes(entry)) {
                            dropOrphanUpload(url);
                            subStatus.textContent = "That room left the list while this uploaded, so the older version was not kept.";
                            return;
                        }
                        noteUpload(formEl, url);
                        entry.oldVersions.push({ image: url, label });
                        renderGalleryList();
                    } catch (err) {
                        if (err.status === 401) { lockOut(); return; }
                        subStatus.textContent = err.message || "Upload failed.";
                    } finally {
                        subAddBtn.disabled = false;
                    }
                });
            });
        }

        addBtn.addEventListener("click", async () => {
            // Sorted by file name (numeric-aware, so "Room 2" sorts before
            // "Room 10") rather than left in whatever order the OS's file
            // picker or drag-drop happened to hand them over in.
            const files = Array.from(fileInput.files).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
            );
            const draft = formEl._galleryDraft;
            // The typed label only makes sense for a single image — a batch
            // of several instead names each one after its own file (same
            // "Room 12.png" -> "Room 12" logic normalizeGalleryEntry already
            // falls back to for legacy string-only entries).
            const explicitLabel = files.length <= 1 ? labelInput.value.trim() : "";

            // No file chosen isn't an error for rooms any more — one can be
            // added with just a title, e.g. built but not screenshotted
            // yet. The public site shows an "Awaiting Room Image" pill in
            // its place (see showGalleryImage in home.js) until it's edited
            // in later with a real upload. Events' photo gallery has no
            // equivalent identity without the image itself, so that side
            // keeps the original requirement.
            if (!files.length && allowMissingImage) {
                draft.push({ image: "", label: explicitLabel || `Room ${draft.length + 1}`, bonus: false, runThrough: false, oldVersions: [] });
                labelInput.value = "";
                renderGalleryList();
                return;
            }
            if (!files.length) {
                status.textContent = "Choose an image first.";
                status.style.display = "block";
                return;
            }

            addBtn.disabled = true;
            status.style.display = "block";
            try {
                for (let n = 0; n < files.length; n++) {
                    const file = files[n];
                    status.textContent = files.length > 1 ? `Uploading ${n + 1} of ${files.length}…` : "Uploading…";
                    const { url } = await formUpload(formEl, uploadPrefix, file);
                    noteUpload(formEl, url);
                    const label = explicitLabel || deriveGalleryLabel(file.name);
                    draft.push({ image: url, label, bonus: false, runThrough: false, oldVersions: [] });
                    renderGalleryList();
                }
                fileInput.value = "";
                labelInput.value = "";
                status.style.display = "none";
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Upload failed.";
            } finally {
                addBtn.disabled = false;
            }
        });

        // A picture already in the archive's storage, by address — the
        // Missing Pieces panel's copied screenshots land here. See
        // archiveImageFromUrl for what is accepted.
        const urlInput = formEl.querySelector(".admin-gallery-url");
        const urlBtn = formEl.querySelector(".admin-gallery-url-btn");
        if (urlInput && urlBtn) {
            const addFromUrl = () => {
                const got = archiveImageFromUrl(urlInput.value);
                status.style.display = "block";
                if (got.error) { status.textContent = got.error; return; }
                const draft = formEl._galleryDraft;
                if (draft.some(g => g.image === got.url)) { status.textContent = "That picture is already in the list."; return; }
                const label = labelInput.value.trim() || deriveGalleryLabel(got.url.split("/").pop());
                draft.push({ image: got.url, label, bonus: false, runThrough: false, oldVersions: [] });
                urlInput.value = "";
                labelInput.value = "";
                status.style.display = "none";
                renderGalleryList();
            };
            urlBtn.addEventListener("click", addFromUrl);
            urlInput.addEventListener("keydown", e => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                addFromUrl();
            });
        }

        renderGalleryList();
    }

    /* Every picture a deleted record owned. Built on imageKeysOf, which is
       the one list of where a record keeps pictures — the hand-written copy
       this replaced had forgotten relatedImages, so deleting a maze left its
       related pictures in storage for good. Called after the record is gone
       from the working list, so a picture another record still points at
       (a thumbnail aimed at somebody else's room by hand) is spared. */
    async function cleanupItemImages(item) {
        const keys = imageKeysOf(item);
        if (!keys.size) return;
        // Asked of the database, not the list loaded at sign-in — see
        // freshReferencedKeys. Nothing is deleted if that read fails.
        const referenced = await freshReferencedKeys();
        if (!referenced) return;
        Object.keys(COLLECTIONS).forEach(other => formImageKeys(COLLECTIONS[other].formEl).forEach(k => referenced.add(k)));
        keys.forEach(key => {
            if (!referenced.has(key)) deleteImageSafe(key);
        });
    }

    // ---------- list rendering ----------

    // Same index-pairing reasoning as visibleRoomEntries below — sorting
    // reorders what's shown, but openForm/deleteItem still need each
    // item's real index into workingEvents. No search box for events (only
    // sort was asked for), so there's no filtering step here.
    function visibleEventEntries() {
        const entries = workingEvents.map((item, index) => ({ item, index }));
        if (eventsSortBy === "name") {
            entries.sort((a, b) => compareNames(a.item.title, b.item.title));
        } else if (eventsSortBy === "date-asc") {
            entries.sort((a, b) => (a.item.date || "").localeCompare(b.item.date || ""));
        } else {
            entries.sort((a, b) => (b.item.date || "").localeCompare(a.item.date || ""));
        }
        return entries;
    }

    // Search/sort filters and reorders what's shown, but openForm/
    // deleteItem still need the item's real index into workingRooms — so
    // this pairs each item with that original index *before* filtering/
    // sorting, and the row's click handlers close over that paired index
    // rather than its position in the display list.
    function visibleRoomEntries() {
        const q = roomsQuery.trim().toLowerCase();
        let entries = workingRooms.map((item, index) => ({ item, index }));
        if (q) {
            entries = entries.filter(({ item }) => {
                const haystack = [item.name, item.creator, ...(item.tags || [])].join(" ").toLowerCase();
                return haystack.includes(q);
            });
        }
        if (roomsSortBy === "date") {
            entries.sort((a, b) => (b.item.added || "").localeCompare(a.item.added || ""));
        } else if (roomsSortBy === "difficulty-asc" || roomsSortBy === "difficulty-desc") {
            const dir = roomsSortBy === "difficulty-asc" ? 1 : -1;
            entries.sort((a, b) => {
                const ai = DIFFICULTY_ORDER.indexOf(a.item.difficulty);
                const bi = DIFFICULTY_ORDER.indexOf(b.item.difficulty);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return (ai - bi) * dir;
            });
        } else {
            entries.sort((a, b) => compareNames(a.item.name, b.item.name));
        }
        return entries;
    }

    function renderList(key) {
        const cfg = COLLECTIONS[key];
        const entries = key === "rooms" ? visibleRoomEntries()
            : key === "events" ? visibleEventEntries()
            : cfg.getAll().map((item, index) => ({ item, index }));
        cfg.listEl.innerHTML = "";

        if (!entries.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = cfg.getAll().length
                ? `No ${cfg.plural.toLowerCase()} match that search.`
                : `No ${cfg.plural.toLowerCase()} yet — add the first one below.`;
            cfg.listEl.appendChild(empty);
            return;
        }

        /* An EC event wears its season's name plate here too — the same
           plate the public list rows use, so an admin scanning this list
           sees what a visitor sees. Only the two seasons the form offers
           are recognised, because the value lands in a class name. */
        function ecTitleHtml(item, title) {
            const season = ["s1", "s2"].includes(item.ecSeason) ? item.ecSeason : "";
            if (key !== "events" || !season) return `<h3>${escapeHtml(title)}</h3>`;
            return `<h3 class="ec-title ec-title-${season}"><span class="ec-title-name">${escapeHtml(title)}</span></h3>`;
        }

        entries.forEach(({ item, index }) => {
            const title = item[cfg.fieldMap.title] || "(untitled)";
            const subtitle = item[cfg.fieldMap.subtitle] || "";
            // Same fallback chain as the public site: no thumbnail set falls
            // back to the entrance shot, then the first room-by-room
            // gallery image, rather than showing an empty square.
            const thumbSrc = item.thumb || (item.entrance && item.entrance.image) || (item.gallery && item.gallery[0] && item.gallery[0].image) || "";
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row";
            row.innerHTML = `
                <div class="row-thumb">
                    ${thumbSrc ? `<div class="row-thumb-crop"><img class="row-thumb-img" src="${imgCdn(thumbSrc, 160, 160, 65)}" alt="" loading="lazy"></div>` : ""}
                </div>
                <div class="row-info">
                    ${ecTitleHtml(item, title)}
                    <p class="row-creator">${subtitle ? "by " + escapeHtml(subtitle) : ""}</p>
                    <p class="row-desc">${escapeHtml(window.GuideText && GuideText.plain ? GuideText.plain(item.description || "") : (item.description || ""))}</p>
                </div>
                <div class="row-side">
                    <span class="status-badge status-${escapeHtml(item.status || "")}">${escapeHtml(item.status || "")}</span>
                    <div class="admin-row-actions">
                        <button type="button" class="btn admin-edit-btn">Edit</button>
                        ${key === "rooms" && canScanFurni() && isLocalSite() ? '<button type="button" class="btn admin-scan-btn">Scan</button>' : ""}
                        <button type="button" class="btn admin-delete-btn">Delete</button>
                    </div>
                </div>
            `;
            // By id, not the array index captured here at render time — an
            // edit form left open while a different row gets deleted (or
            // the list otherwise re-orders) would otherwise keep pointing
            // at whatever now sits at that same index instead of the item
            // actually being edited.
            row.querySelector(".admin-edit-btn").addEventListener("click", () => requestOpenForm(key, item.id));
            row.querySelector(".admin-delete-btn").addEventListener("click", () => deleteItem(key, item.id));
            const scanBtn = row.querySelector(".admin-scan-btn");
            if (scanBtn) scanBtn.addEventListener("click", () => scanOneItem(key, item.id));
            const rowImg = row.querySelector(".row-thumb-img");
            if (rowImg) {
                if (rowImg.complete) rowImg.classList.add("is-loaded");
                else rowImg.addEventListener("load", () => rowImg.classList.add("is-loaded"), { once: true });
            }
            cfg.listEl.appendChild(row);
        });
    }

    if (roomsSearchInput) {
        roomsSearchInput.addEventListener("input", e => {
            roomsQuery = e.target.value;
            renderList("rooms");
        });
    }
    if (roomsSortSelect) {
        roomsSortSelect.value = roomsSortBy;
        roomsSortSelect.addEventListener("change", e => {
            roomsSortBy = e.target.value;
            renderList("rooms");
        });
    }
    if (eventsSortSelect) {
        eventsSortSelect.value = eventsSortBy;
        eventsSortSelect.addEventListener("change", e => {
            eventsSortBy = e.target.value;
            renderList("events");
        });
    }

    // Type-to-jump now lives in js/letter-jump.js (loaded site-wide, see
    // admin.html) — it generalizes this same behaviour to every .chrome-list
    // on the page instead of just this one.

    // ---------- form ----------

    function fieldRow(labelText, inputHtml) {
        return `<label class="admin-field"><span>${labelText}</span>${inputHtml}</label>`;
    }

    /* ---------- formatting buttons on the descriptions (30 Sept 2026) ----------

       Bold, Italic, Link and the two lists over a maze's or an event's
       short description and full details. They write the guides' own text
       format (js/guide-text.js — **bold**, *italic*, [words](https://…),
       "- " and "1. " lists), which the room window and the front page's
       event window render and the cards show with the format taken off, so
       the site keeps one way of writing these and no HTML is ever stored.
       What each button does to the text is GuideText.format; this is only
       the wiring. Ctrl+B, Ctrl+I and Ctrl+K (Cmd on a Mac) do the same.

       A <div>, not fieldRow's <label>: a label's control is the first
       button or field inside it, so clicking the words "Full details" would
       have pressed Bold. The preview underneath uses the same renderer the
       site does, and shows only once the text holds some formatting — for
       plain words it would just say them twice. */
    /* The full set (30 Sept 2026, the owner's: "full formatting tools").
       Bold is weight alone now — the text keeps its own colour — and the
       Heading and Subheading buttons are what make a line stand out as a
       title: bold and a shade lighter (see .fmt-heading in css/style.css).
       "|" in a field's list is a gap between groups: how the text looks,
       what kind of block a line is, links and lists, then Clear. */
    const FORMAT_BUTTONS = {
        bold: ['<strong>B</strong>', "Bold (Ctrl+B)"],
        italic: ['<em>I</em>', "Italic (Ctrl+I)"],
        underline: ['<u>U</u>', "Underline (Ctrl+U)"],
        strike: ['<s>S</s>', "Strikethrough"],
        heading: ["Heading", "Heading: bold and lighter, on a line of its own"],
        subheading: ["Subheading", "Subheading: a smaller heading, on a line of its own"],
        quote: ["Tip", "Tip: sets the line apart in a box"],
        // Words, not symbols: the buttons are set in Volter, whose em dash
        // and bullet are Habbo picture glyphs (a music note and a flower).
        divider: ["Divider", "Divider: a line across, under the current line"],
        link: ["Link", "Link (Ctrl+K): https:// addresses, maze:, event: and guide: followed by an id, or console:entry for the Event Submission form"],
        bullets: ["Bullets", "Bulleted list"],
        numbers: ["Numbers", "Numbered list"],
        clear: ["Clear", "Clear formatting from the selection, or from the current line"]
    };
    const FULL_FORMATTING = ["bold", "italic", "underline", "strike", "|", "heading", "subheading", "quote", "divider",
        "|", "link", "bullets", "numbers", "|", "clear"];
    function formattedFieldRow(labelText, name, value, rows, kinds, hint) {
        return `<div class="admin-field admin-fmt-field">
                <span>${labelText}</span>
                <div class="admin-fmt-bar" role="toolbar" aria-label="Formatting for ${escapeHtml(labelText.replace(/&amp;/g, "&"))}">${kinds.map((k, i) => k === "|"
                    ? `<span class="admin-fmt-gap" aria-hidden="true"></span>`
                    : `<button type="button" class="admin-pill-btn admin-fmt-btn" data-fmt="${k}" tabindex="${i === kinds.findIndex(x => x !== "|") ? 0 : -1}" title="${FORMAT_BUTTONS[k][1]}" aria-label="${FORMAT_BUTTONS[k][1]}">${FORMAT_BUTTONS[k][0]}</button>`).join("")}</div>
                <textarea name="${name}" rows="${rows}" aria-label="${escapeHtml(labelText.replace(/&amp;/g, "&"))}">${escapeHtml(value || "")}</textarea>
                ${hint ? `<p class="admin-hint">${hint}</p>` : ""}
                <div class="admin-fmt-preview-wrap" hidden>
                    <span class="admin-fmt-preview-label">Preview</span>
                    <div class="admin-fmt-preview room-desc-full"></div>
                </div>
            </div>`;
    }

    function applyFormat(ta, kind) {
        if (!ta || ta.readOnly || ta.disabled || typeof GuideText === "undefined" || !GuideText.format) return;
        const before = ta.value;
        const r = GuideText.format(before, ta.selectionStart, ta.selectionEnd, kind);
        ta.focus();
        if (r.text !== before) {
            /* Only the stretch that changed is replaced, and through
               insertText where the browser still has it, so Ctrl+Z takes a
               button press back the way it takes back typing. Setting
               .value instead wipes the textarea's undo history. */
            let a = 0;
            while (a < before.length && a < r.text.length && before[a] === r.text[a]) a++;
            let b = 0;
            while (b < before.length - a && b < r.text.length - a
                && before[before.length - 1 - b] === r.text[r.text.length - 1 - b]) b++;
            ta.setSelectionRange(a, before.length - b);
            let done = false;
            try { done = document.execCommand("insertText", false, r.text.slice(a, r.text.length - b)); } catch (e) { /* fall through */ }
            if (!done || ta.value !== r.text) {
                ta.value = r.text;
                ta.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }
        ta.setSelectionRange(r.start, r.end);
    }

    const IS_MAC = /Mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "");
    function wireFormatting(formEl) {
        formEl.querySelectorAll(".admin-fmt-field").forEach(field => {
            const ta = field.querySelector("textarea");
            const wrap = field.querySelector(".admin-fmt-preview-wrap");
            const preview = field.querySelector(".admin-fmt-preview");
            if (!ta) return;
            const refresh = () => {
                if (!wrap || !preview || typeof GuideText === "undefined") return;
                const text = ta.value.trim();
                const html = text ? GuideText.render(text) : "";
                /* Plain words come out as paragraphs of themselves. The old
                   test compared against one <p> of the text with its "\n"s
                   kept, but render() writes a line break as <br> and a blank
                   line as a new paragraph, so any plain text of two lines
                   or more was "formatted" and got said twice (30 Sept 2026).
                   Now: plain means render() wrote nothing but paragraphs,
                   line breaks and blank-line spacers, and the words inside
                   are the text's own, escaped, whitespace aside. A link that
                   does not take (say an http:// one) loses its brackets, so
                   it still shows the preview, which is the point. */
                const bare = html.replace(/<p class="fmt-blank" aria-hidden="true"><\/p>|<\/?p>|<br>/g, "");
                const plain = !bare.includes("<")
                    && bare.replace(/\s+/g, "") === GuideText.esc(text).replace(/\s+/g, "");
                wrap.hidden = !text || plain;
                preview.innerHTML = wrap.hidden ? "" : html;
            };
            // The preview's links are for looking at: a click on one would
            // leave the form, and whatever was typed into it, behind.
            if (preview) {
                preview.addEventListener("click", e => {
                    if (e.target.closest && e.target.closest("a")) e.preventDefault();
                });
            }
            /* One Tab stop for the whole toolbar (30 Sept 2026): fifteen
               buttons between one field and the next was fifteen presses of
               Tab. The roving-tabindex pattern — the arrows move along the
               bar and wrap round, Home and End go to its ends, and the
               button last focused is the one Tab comes back to. */
            const fmtBtns = Array.from(field.querySelectorAll(".admin-fmt-btn"));
            const rove = (btn) => fmtBtns.forEach(b => { b.tabIndex = b === btn ? 0 : -1; });
            fmtBtns.forEach((btn, i) => {
                // Pressing a button would take the focus, and the caret with it.
                btn.addEventListener("mousedown", e => e.preventDefault());
                btn.addEventListener("click", () => { rove(btn); applyFormat(ta, btn.dataset.fmt); });
                btn.addEventListener("focus", () => rove(btn));
                btn.addEventListener("keydown", e => {
                    let to = -1;
                    if (e.key === "ArrowRight") to = (i + 1) % fmtBtns.length;
                    else if (e.key === "ArrowLeft") to = (i - 1 + fmtBtns.length) % fmtBtns.length;
                    else if (e.key === "Home") to = 0;
                    else if (e.key === "End") to = fmtBtns.length - 1;
                    if (to < 0) return;
                    e.preventDefault();
                    rove(fmtBtns[to]);
                    fmtBtns[to].focus();
                });
            });
            ta.addEventListener("keydown", e => {
                /* Cmd on a Mac, Ctrl elsewhere; Alt is still refused, as
                   AltGr arrives as Ctrl+Alt and types letters on many
                   layouts. The letter is the key's own where it is a Latin
                   one, and otherwise the physical key's (e.code), so B, I,
                   U and K still work on a Cyrillic or Greek layout
                   (30 Sept 2026). */
                const mod = IS_MAC ? e.metaKey : e.ctrlKey;
                if (!mod || e.altKey || e.shiftKey) return;
                if (e.getModifierState && e.getModifierState("AltGraph")) return;
                const key = String(e.key).toLowerCase();
                const letter = /^[a-z]$/.test(key) ? key
                    : (/^Key[A-Z]$/.test(e.code || "") ? e.code.slice(3).toLowerCase() : "");
                const kind = { b: "bold", i: "italic", u: "underline", k: "link" }[letter];
                if (!kind || !field.querySelector(`.admin-fmt-btn[data-fmt="${kind}"]`)) return;
                e.preventDefault();
                applyFormat(ta, kind);
            });
            ta.addEventListener("input", refresh);
            refresh();
        });
    }

    // Keeps the events form's read-only Status in step with whatever is
    // currently in its four date/time boxes, so it answers the question
    // while the event is still being written rather than only once it has
    // been saved and re-listed. Same derivation the public site uses, off
    // the same module, so what's shown here is what visitors will get.
    /* ---------- the article field ----------

       An event can carry a Habbo Origins article instead of its own full
       details: the link goes in, Add Article reads it once, and the copy is
       stored on the event and shown in the modal. See
       netlify/functions/article.js for the reading, and .modal-article in
       css/style.css for the showing.

       The two long-form fields are mutually exclusive. Whichever is in use
       disables the other outright, rather than letting both be filled and
       one of them silently win — which is how an admin loses an evening's
       writing to a field they had forgotten was set. */
    function wireArticle(formEl) {
        const urlInput = formEl.querySelector(".admin-article-url");
        const button = formEl.querySelector(".admin-article-btn");
        const statusEl = formEl.querySelector(".admin-article-status");
        const detailsEl = formEl.querySelector("textarea[name=details]");
        if (!urlInput || !button || !statusEl) return;

        const detailsField = detailsEl && detailsEl.closest(".admin-field");

        function say(kind, html) {
            statusEl.className = "admin-article-status admin-article-status--" + kind;
            statusEl.innerHTML = html;
            statusEl.hidden = false;
        }

        /* What the form shows about the article it is holding. Three states,
           and the difference between the last two matters: a link with no
           copy behind it saves nothing, so it has to look unfinished rather
           than done. */
        function refresh() {
            const url = urlInput.value.trim();
            const draft = formEl._articleDraft;
            const hasDetails = !!(detailsEl && detailsEl.value.trim());

            /* Full details wins only while the link is empty; the moment
               there is a link, the article is the event's write-up. And the
               other way about: filled-in Full details locks the link field,
               so the two can never both be set.

               readOnly rather than disabled, which matters more than it
               looks: a DISABLED field is left out of FormData entirely, so
               submitForm would read undefined for it and write that over
               whatever the event already had. Read-only fields are still
               submitted, so what is saved is always what is on screen. The
               greying is .is-disabled's job either way. */
            const lockDetails = !!url;
            const lockUrl = !url && hasDetails;
            if (detailsEl) {
                detailsEl.readOnly = lockDetails;
                if (detailsField) detailsField.classList.toggle("is-disabled", lockDetails);
            }
            urlInput.readOnly = lockUrl;
            button.disabled = lockUrl;
            if (urlInput.closest(".admin-field")) {
                urlInput.closest(".admin-field").classList.toggle("is-disabled", lockUrl);
            }

            if (!url) {
                statusEl.hidden = true;
                return;
            }
            if (draft && draft.url === url && draft.body) {
                say("ok",
                    '<p class="admin-article-title">' + escapeHtml(draft.title) + "</p>" +
                    '<p class="admin-article-meta">' +
                    escapeHtml([draft.date, draft.category].filter(Boolean).join("  —  ")) +
                    "</p>" +
                    '<p class="admin-article-meta">Stored, and shown on the event in place of its full details. Press Add Article again to re-read it.</p>');
                return;
            }
            say("todo", "<p>Press <strong>Add Article</strong> to read this one in. Nothing is stored until you do.</p>");
        }

        button.addEventListener("click", async () => {
            const url = urlInput.value.trim();
            if (!url) { say("bad", "<p>Paste the article's link first.</p>"); return; }
            // Read-only means Full details is in use; the button is disabled
            // then, but a stray click should still do nothing.
            if (urlInput.readOnly) return;
            button.disabled = true;
            const label = button.textContent;
            button.textContent = "Reading…";
            say("todo", "<p>Reading the article from Habbo…</p>");
            // Kept so a failed re-read can put it back. This used to be set
            // to null on failure while the link stayed in the field — and
            // Save then wrote article: null, deleting the stored copy
            // because Habbo's site happened to be slow for a moment.
            const previous = formEl._articleDraft;
            let failed = "";
            try {
                const article = await Api.readArticle(adminToken, url);
                formEl._articleDraft = article;
                // Whatever was typed is replaced by the URL actually read,
                // so the field and the stored copy cannot disagree.
                urlInput.value = article.url;
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                formEl._articleDraft = previous;
                failed = err.message || "That article could not be read.";
            } finally {
                button.textContent = label;
                button.disabled = false;
                refresh();
                // After refresh, which would otherwise paint "press Add
                // Article" straight over the reason it failed.
                if (failed) {
                    say("bad", "<p>" + escapeHtml(failed) + "</p>" +
                        (previous && previous.body ? "<p>The article already stored is kept unless you clear the link.</p>" : ""));
                }
            }
        });

        /* Enter in the link reads it, as the button beside it does. It used
           to save the event and close the form, with the link unread — the
           field's own note says an unread link stores nothing, so the
           article the admin had just pasted was quietly not kept. */
        urlInput.addEventListener("keydown", e => {
            if (e.key !== "Enter" || e.isComposing) return;
            e.preventDefault();
            if (!button.disabled) button.click();
        });

        // Editing the link away from what was stored puts the field back to
        // "not read yet", so it cannot look saved when it is not.
        urlInput.addEventListener("input", refresh);
        if (detailsEl) detailsEl.addEventListener("input", refresh);
        refresh();
    }

    function wireDerivedStatus(formEl) {
        const wrap = formEl.querySelector(".admin-derived-status");
        if (!wrap) return;

        const badge = wrap.querySelector(".status-badge");
        const hidden = wrap.querySelector('input[name="status"]');
        const valueOf = name => {
            const field = formEl.querySelector(`[name="${name}"]`);
            return field ? field.value : "";
        };

        function update() {
            const startDate = valueOf("startDate");
            const startTime = valueOf("startTime");
            const endDate = valueOf("endDate");
            const endTime = valueOf("endTime");
            const startIso = startDate && startTime ? `${startDate}T${startTime}:00Z` : "";
            const endIso = endDate && endTime ? `${endDate}T${endTime}:00Z` : "";

            if (!startIso) {
                // A date is no longer required, and an event without one is
                // genuinely upcoming rather than in an unknown state — it has
                // been announced, it just isn't scheduled. This says exactly
                // what the site will say about it (see js/event-status.js).
                badge.textContent = EventStatus.LABELS.upcoming;
                badge.className = "status-badge status-upcoming";
                hidden.value = "upcoming";
                return;
            }

            const status = EventStatus.fromDates(startIso, endIso, "upcoming");
            badge.textContent = EventStatus.LABELS[status] || status;
            badge.className = `status-badge status-${status}`;
            hidden.value = status;
        }

        ["startDate", "startTime", "endDate", "endTime"].forEach(name => {
            const field = formEl.querySelector(`[name="${name}"]`);
            if (field) field.addEventListener("input", update);
        });

        update();
    }

    /* The way into openForm from a button. Edit, "Add maze"/"Add event" and
       the sidebar shortcuts all called openForm directly, which rebuilt the
       form over whatever was in it — so pressing Edit on the next maze
       while half-way through this one threw the unsaved work away without
       a word. Cancel already asked first (requestCloseForm); this asks the
       same question on the way in. */
    async function requestOpenForm(key, editId) {
        if (refuseWhileSaving(key)) return;
        if (isFormDirty(key)) {
            const ok = await showConfirmDialog("Discard your unsaved changes to the entry you have open? Anything you have added or edited since opening it will be lost.");
            if (!ok) return;
            if (refuseWhileSaving(key)) return;
        }
        // Whatever the form being replaced uploaded and never saved.
        discardFormUploads(key);
        openForm(key, editId);
    }

    function openForm(key, editId) {
        // The sidebar quick-add buttons work from whichever tab is showing,
        // and Edit can be reached the same way — so bring the owning panel
        // up first, or the form would open inside a hidden panel and appear
        // to do nothing at all.
        showPanel(PANEL_FOR_COLLECTION[key] || key);
        const cfg = COLLECTIONS[key];
        const isEdit = editId !== undefined && editId !== null;
        const item = isEdit ? (cfg.getAll().find(i => i.id === editId) || {}) : {};
        const isEvents = key === "events";
        const isRooms = key === "rooms";

        /* Reset before anything else. wireFurniEditor only assigns a new
           draft when the form HAS a furni section — a maze with no room
           images yet has none — so without this, Edit on maze A and then
           Edit on imageless maze B carried A's furni draft into B, and
           Save wrote A's furni onto B. */
        cfg.formEl._furniDraft = null;
        cfg.formEl._renderFurni = null;
        // Rooms moved to a new picture address in this opening — see
        // moveFurniKey. Another record's moves mean nothing here.
        cfg.formEl._furniMoves = new Map();

        /* The after-save bookkeeping — see imageKeysOf and
           discardFormUploads. What the stored record held when this form
           opened is what the form may delete after a save. */
        cfg.formEl._pendingDeletes = new Set();
        cfg.formEl._sessionUploads = new Set();
        // A refused save's pictures, if this record had one — see the 409
        // branch in submitForm.
        if (isEdit) takeParkedUploads(cfg.formEl, key, editId);
        cfg.formEl._storedKeys = imageKeysOf(item);
        cfg.formEl._saveAmbiguous = false;
        // This opening, as distinct from the last one on the same element:
        // an upload still in flight from before is recognised as stale by
        // it, and it counts this opening's uploads — see formUpload.
        cfg.formEl._openSession = { uploads: 0 };
        cfg.formEl._saving = false;

        /* When the record was last saved, as this form first saw it. Sent
           back with the save so the server can refuse it (409) if somebody
           else has saved the record since — see _baseUpdatedAt in
           netlify/functions/rooms.js. "" for a record that has never been
           edited since the field existed. */
        cfg.formEl._baseUpdatedAt = item.updatedAt || "";
        // The stored furni as it was, to tell at save time whether the
        // furni editor changed anything — see submitForm.
        cfg.formEl._furniOriginal = JSON.stringify(item.furni || {});

        // _galleryDraft/_selectedTags/_entranceOldVersions/_finishOldVersions
        // all get freshly reassigned further down for whichever item is
        // being edited — these 3 "which old-versions panel is expanded"
        // flags don't, so without resetting them here too, opening Edit on
        // item A (expanding its panel), then Edit on item B without hitting
        // Cancel first, carried A's expanded state into B's freshly-loaded
        // form (closeForm already resets these on the way out, but not on
        // the way back in for a direct Edit-to-Edit switch).
        cfg.formEl._expandedOldVersions = null;
        cfg.formEl._entranceOldVersionsExpanded = null;
        cfg.formEl._finishOldVersionsExpanded = null;

        /* A stored status not in the list is carried as an extra selected
           option, exactly as the Hotel field below does it. Without it the
           <select> fell back to its first option and an untouched save
           rewrote the maze to "Open". (rooms.js refuses an unrecognised
           status, so such a save now says so instead of changing it.) */
        const statusKnown = !item.status || cfg.statusOptions.some(([value]) => value === item.status);
        const statusOptionsHtml = cfg.statusOptions.map(([value, label]) =>
            `<option value="${value}" ${item.status === value ? "selected" : ""}>${label}</option>`
        ).join("") + (statusKnown ? "" :
            `<option value="${escapeHtml(item.status)}" selected>${escapeHtml(item.status)} (unrecognised)</option>`);

        // Mazes still pick their own status. Events don't get the dropdown:
        // the site works an event's status out from its start/end dates
        // (js/event-status.js), so a control here would only be a second,
        // disagreeing answer that quietly did nothing. It's shown read-only
        // instead — and further down the form, directly under the date
        // fields it's derived from, where it reads as a consequence of them
        // rather than something to fill in.
        const statusFieldHtml = isEvents
            ? ""
            : fieldRow("Status", `<select name="status">${statusOptionsHtml}</select>`);

        // The hidden input keeps `status` in the submitted form data (the
        // save handler reads data.status for both kinds), so the stored
        // field is written in step with what's derived rather than left to
        // drift. wireDerivedStatus keeps both it and the badge current as
        // the dates are edited.
        const derivedStatusFieldHtml = isEvents
            ? `
                <div class="admin-field admin-derived-status">
                    <span>Status</span>
                    <p class="admin-derived-status-value"><span class="status-badge"></span></p>
                    <input type="hidden" name="status" value="${escapeHtml(item.status || "upcoming")}">
                    <p class="admin-hint">Set automatically from the dates above: LIVE once the start passes, Past once the end does, Archived after ${EventStatus.ARCHIVE_YEARS} year${EventStatus.ARCHIVE_YEARS === 1 ? "" : "s"}.</p>
                </div>
              `
            : "";

        // Events only. Sits with Host rather than down by the dates,
        // because it says what the event IS rather than when it runs.
        const ecSeasonFieldHtml = isEvents
            ? fieldRow("Event type", `<select name="ecSeason">${EC_SEASON_OPTIONS.map(([value, label]) =>
                `<option value="${value}" ${(item.ecSeason || "") === value ? "selected" : ""}>${label}</option>`
              ).join("")}</select>`) +
              `<p class="admin-hint">An EC event carries its season badge and name plate wherever it is listed. Regular events look exactly as they always have.</p>`
            : "";

        /* Events only. An event's write-up usually already exists on Habbo's
           own site; pasting the link here and pressing Add Article reads it
           once and stores it on the event, so the site shows the piece
           itself rather than sending the reader away to it.

           It stands in for Full details rather than sitting beside it: two
           long-form fields, one of them silently winning, is a way to lose
           work. Whichever is filled disables the other (see wireArticle). */
        const article = item.article && item.article.body ? item.article : null;
        const articleFieldHtml = isEvents
            ? `
                <div class="admin-field admin-article-field">
                    <span>Article link</span>
                    <div class="admin-article-row">
                        <input type="text" name="articleUrl" class="admin-article-url" placeholder="https://origins.habbo.com/community/article/..." value="${escapeHtml((article && article.url) || "")}">
                        <button type="button" class="admin-action-pill admin-article-btn">Add Article</button>
                    </div>
                    <p class="admin-hint">A Habbo Origins article link. Add Article reads it and keeps a copy, which is what the event then shows in place of its full details.</p>
                    <div class="admin-article-status" hidden></div>
                </div>
              `
            : "";

        const difficultyOptionsHtml = DIFFICULTY_OPTIONS.map(([value, label]) =>
            `<option value="${value}" ${(item.difficulty || "") === value ? "selected" : ""}>${label}</option>`
        ).join("");
        const difficultyFieldHtml = isRooms
            ? fieldRow("Difficulty", `<select name="difficulty">${difficultyOptionsHtml}</select>`)
            : "";

        function splitIso(iso) {
            const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso || "");
            return m ? { date: m[1], time: m[2] } : { date: "", time: "" };
        }
        const start = isEvents ? splitIso(item.date) : { date: "", time: "" };
        const end = isEvents ? splitIso(item.endDate) : { date: "", time: "" };

        const openedDate = isRooms ? parseMazeDate(item[cfg.fieldMap.date]) : { day: "", month: "", year: "" };
        /* A stored opening date this form cannot show (not YYYY-MM or
           YYYY-MM-DD — "Summer 2004", say) used to read back as three blank
           boxes and save as "", erasing it. It is kept aside instead and
           written back as it was unless a date is picked. */
        const rawDate = isRooms ? String(item[cfg.fieldMap.date] || "") : "";
        cfg.formEl._rawDate = rawDate && !openedDate.year ? rawDate : "";
        const dayOptionsHtml = ["<option value=\"\">—</option>"].concat(
            Array.from({ length: 31 }, (_, i) => {
                const v = String(i + 1).padStart(2, "0");
                return `<option value="${v}" ${openedDate.day === v ? "selected" : ""}>${i + 1}</option>`;
            })
        ).join("");
        const monthOptionsHtml = ["<option value=\"\">Month</option>"].concat(
            MONTH_NAMES.map((name, i) => {
                const v = String(i + 1).padStart(2, "0");
                return `<option value="${v}" ${openedDate.month === v ? "selected" : ""}>${name}</option>`;
            })
        ).join("");

        const dateFieldHtml = isEvents
            ? `
                ${fieldRow("Event start date (UTC)", `<input type="date" name="startDate" value="${start.date}">`)}
                ${fieldRow("Event start time (UTC, 24-hour)", `<input type="time" name="startTime" value="${start.time}">`)}
                ${fieldRow("Event end date (UTC)", `<input type="date" name="endDate" value="${end.date}">`)}
                ${fieldRow("Event end time (UTC, 24-hour)", `<input type="time" name="endTime" value="${end.time}">`)}
                <p class="admin-hint">All four fields are UTC. The site shows this as-is — it does not convert to a visitor's local timezone.</p>
                <p class="admin-hint">Leave them blank for an event that has no date set yet. It counts as upcoming and shows on the site with its date reading "TBC", so it can be announced before it is scheduled.</p>
                ${spotlightFieldsHtml(item, splitIso)}
              `
            : `
                <div class="admin-field admin-date-field">
                    <span>${cfg.dateLabel}</span>
                    <div class="admin-date-parts">
                        <select name="dateDay" aria-label="Day">${dayOptionsHtml}</select>
                        <select name="dateMonth" aria-label="Month">${monthOptionsHtml}</select>
                        <input type="number" name="dateYear" aria-label="Year" placeholder="Year" min="2000" max="2100" value="${openedDate.year}">
                    </div>
                    <p class="admin-hint">Leave Day on "—" if the exact day it opened isn't known — the site will just show the month and year.</p>
                    ${cfg.formEl._rawDate ? `<p class="admin-hint">Stored as "${escapeHtml(cfg.formEl._rawDate)}", which isn't a date these boxes can show. It is kept exactly as it is unless you pick a month and year.</p>` : ""}
                </div>
              `;

        const tagsFieldHtml = isRooms
            ? `
                <div class="admin-field admin-tags-field">
                    <span>Tags</span>
                    <div class="tag-chip-list" id="tag-chip-list"><p class="admin-empty">Loading tags…</p></div>
                    <div class="admin-tag-add">
                        <input type="text" class="admin-tag-new-input" placeholder="Add a new tag...">
                        <button type="button" class="admin-action-pill admin-tag-add-btn">+ Add Tag</button>
                    </div>
                    <p class="admin-tag-status" style="display:none;"></p>
                </div>
              `
            : fieldRow("Tags (comma-separated)", `<input type="text" name="tags" value="${escapeHtml((item.tags || []).join(", "))}">`);

        // Entrance/Finish share this layout: a live preview + label input
        // (identical row markup to a gallery room). The thumb itself is the
        // whole upload/replace target — click or drop a file directly onto
        // it — same pattern as a gallery room's own thumb (see
        // wireGalleryEditor); no separate "choose file, then click Upload"
        // control needed. See wireBookendUpload.
        function bookendSectionHtml(kind, title, hint, entry) {
            const kindLabel = kind === "entrance" ? "Entrance" : "Finish";
            const thumbHtml = entry.image
                ? `<label class="admin-gallery-thumb admin-gallery-thumb-filled" style="background-image:url('${imgCdn(entry.image, 100, 100, 55)}');">
                       <input type="file" class="admin-gallery-thumb-file admin-${kind}-file" accept="image/png,image/jpeg,image/gif,image/webp">
                       <span class="admin-gallery-thumb-replace-text">Replace Image</span>
                   </label>`
                : `<label class="admin-gallery-thumb admin-gallery-thumb-empty">
                       <input type="file" class="admin-gallery-thumb-file admin-${kind}-file" accept="image/png,image/jpeg,image/gif,image/webp">
                       <span class="admin-gallery-thumb-upload-text">Drag or click to upload image</span>
                   </label>`;
            return `
                <div class="admin-field admin-${kind}-field">
                    <span>${title}</span>
                    <p class="admin-hint">${hint}</p>
                    <div class="admin-gallery-row">
                        <div class="admin-gallery-row-top">
                            ${thumbHtml}
                            <input type="text" name="${kind}Label" class="admin-gallery-label" placeholder="Label (e.g. ${kindLabel})" value="${escapeHtml(entry.label || kindLabel)}">
                        </div>
                        <div class="admin-gallery-actions">
                            <button type="button" class="admin-pill-btn admin-${kind}-oldversions-toggle" title="Add or view older versions of this image">Old Version</button>
                            <button type="button" class="admin-pill-btn admin-pill-danger admin-${kind}-remove" title="Remove" ${entry.image ? "" : "disabled"}>Remove</button>
                        </div>
                        <div class="admin-${kind}-oldversions-container"></div>
                    </div>
                    <input type="hidden" name="${kind}Image" value="${escapeHtml(entry.image || "")}">
                    <p class="admin-${kind}-status" style="display:none;"></p>
                </div>
            `;
        }

        // Rooms and events share the exact same gallery mechanism (entrance
        // bookend, ordered image list, finish bookend) and the exact same
        // public-facing viewer — only the wording below adapts per
        // collection so an event's form doesn't talk about "rooms".
        const hasGallery = isRooms || isEvents;
        const galleryItemNoun = isRooms ? "room" : "photo";

        const entrance = item.entrance || {};
        const entranceSectionHtml = hasGallery
            ? bookendSectionHtml("entrance", "<strong>ENTRANCE IMAGE</strong>", "Use for stand-alone entrance rooms; if an entrance is part of the total room-count, add it as room 1", entrance)
            : "";

        const gallerySectionHtml = hasGallery ? `
            <div class="admin-field admin-gallery-field">
                <span>${isRooms ? "<strong>ROOM-BY-ROOM GALLERY</strong>" : "Photo gallery (optional)"}</span>
                <p class="admin-hint">Upload a screenshot for each ${galleryItemNoun}, in order — drag the &#9776; handle or use the arrows to reorder them.${isRooms ? ' A room can be added with just a label and no image yet — the site shows an "Awaiting Room Image" placeholder until you edit one in.' : ""} Select several files at once to add them all in one go, sorted by file name — the label field below only applies when adding a single image.</p>
                <div class="admin-gallery-list"></div>
                <div class="admin-gallery-add">
                    <input type="text" class="admin-gallery-new-label" placeholder="${isRooms ? "Room label (e.g. Room 12)" : "Photo label"}">
                    <input type="file" class="admin-gallery-new-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple>
                    <button type="button" class="admin-action-pill admin-gallery-add-btn">+ Add ${isRooms ? "Room" : "Photo"} Image</button>
                </div>
                <div class="admin-gallery-add admin-url-add">
                    <input type="text" class="admin-gallery-url" placeholder="…or paste an archive image address (/.netlify/functions/image?key=rooms/…)">
                    <button type="button" class="admin-pill-btn admin-gallery-url-btn">+ Add from URL</button>
                </div>
                <p class="admin-gallery-status" style="display:none;"></p>
            </div>
        ` : "";

        // Rendered whenever the maze has room images at all, not just once
        // a scan has recorded something: furni can now be added by hand, and
        // an unscanned maze is precisely where you would want to. Rooms with
        // nothing against them show as empty tabs with an Add button.
        const hasRoomImages = Boolean(
            (item.entrance && item.entrance.image) ||
            (item.gallery || []).some(g => g && g.image) ||
            (item.finish && item.finish.image)
        );
        /* Mazes only. Furni is what an archive of MAZES is for — what was in
           the room, so it can be found again — and an event is a happening
           rather than a room: its images are posters and promos, and a scan
           of one records the furni in somebody's advert.

           No event has ever carried any, so nothing is being thrown away by
           this. Nor could it be: submitForm only writes payload.furni when
           _furniDraft exists, and that is set by the editor below — so an
           event saved from here leaves whatever is stored exactly as it is. */
        const furniSectionHtml = isRooms && hasRoomImages ? `
            <div class="admin-field admin-furni-field">
                <span>Furni in these rooms</span>
                <p class="admin-hint">What the scan detected in each room image, plus anything added by hand. Hide keeps a detection in the record but stops the site showing it &mdash; better than Remove for a false positive, since a rescan would find it again either way. Hand-added furni is kept through a rescan; detections are not.</p>
                <div class="admin-furni-list"></div>
            </div>
        ` : "";

        // Shown for both mazes and events. These don't join the gallery
        // sequence — each one gets a photo-wall icon on the corner of the
        // gallery viewport on the public site, opening a draggable photo
        // frame with the picture and the name given here.
        const relatedSectionHtml = `
            <div class="admin-field admin-related-field">
                <span>Related images (optional)</span>
                <p class="admin-hint">Extra pictures attached to this ${cfg.singular.toLowerCase()} — press cuttings, posters, before-and-afters. Each one appears as a small photo icon on the bottom-right of the image viewer, opening a draggable photo frame with its name underneath. Drop images here (several at once is fine) and they upload straight away; name each one in the row it adds. Drag the &#9776; handle or use the arrows to reorder them — that order is the order their icons appear in, left to right.</p>
                <div class="admin-related-list"></div>
                <input type="file" class="admin-related-new-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple>
                <div class="admin-gallery-add admin-url-add">
                    <input type="text" class="admin-related-url" placeholder="…or paste an archive image address (/.netlify/functions/image?key=rooms/…)">
                    <button type="button" class="admin-pill-btn admin-related-url-btn">+ Add from URL</button>
                </div>
                <p class="admin-related-status" style="display:none;"></p>
            </div>
        `;

        const finish = item.finish || {};
        const finishSectionHtml = hasGallery
            ? bookendSectionHtml("finish", "Finish image (optional)", `Always shown last in the gallery, after every other image — use it for the ${cfg.singular.toLowerCase()}'s finish or closing screenshot.`, finish)
            : "";


        cfg.formEl.innerHTML = `
            <h3 class="admin-form-title">${isEdit ? "Edit " + cfg.singular : "Add a New " + cfg.singular}</h3>
            ${fieldRow(cfg.titleLabel, `<input type="text" name="title" required value="${escapeHtml(item[cfg.fieldMap.title] || "")}">`)}
            ${window.AddressField ? window.AddressField.html(isRooms ? "maze" : "event", isEdit ? item.slug || "" : "") : ""}
            ${fieldRow(cfg.subtitleLabel, `<input type="text" name="subtitle" value="${escapeHtml(item[cfg.fieldMap.subtitle] || "")}">`)}
            ${ecSeasonFieldHtml}
            ${statusFieldHtml}
            ${difficultyFieldHtml}
            ${fieldRow("Hotel", `<select name="hotel">${HOTEL_OPTIONS.map(([value, label]) =>
                // An existing maze whose stored hotel is not in the list
                // (older free-text entries) would otherwise silently show as
                // the first option and get rewritten to it on the next save,
                // so its own value is carried as an extra selected option.
                `<option value="${value}" ${(item.hotel || "") === value ? "selected" : ""}>${label}</option>`
            ).join("")}${HOTEL_OPTIONS.some(([value]) => value === (item.hotel || "")) ? "" :
                // Escaped in the attribute as well as the label: the value
                // attribute is what the form submits, and the parser decodes
                // &amp;/&quot; back to the stored characters, so escaping is
                // what makes open-then-save give back exactly what was stored
                // (unescaped, a `"` cut the value short and an "&amp;" typed
                // as text came back as a bare "&").
                `<option value="${escapeHtml(item.hotel)}" selected>${escapeHtml(item.hotel)} (unrecognised)</option>`}</select>`)}
            ${dateFieldHtml}
            ${derivedStatusFieldHtml}
            ${tagsFieldHtml}
            ${fieldRow("Thumbnail image", `
                <div class="admin-thumb-upload">
                    <input type="text" name="thumb" value="${escapeHtml(item.thumb || "")}" placeholder="assets/... or https://...">
                    <input type="file" class="admin-thumb-file" accept="image/png,image/jpeg,image/gif,image/webp">
                    <span class="admin-thumb-status"></span>
                </div>
            `)}
            ${formattedFieldRow("Short description (shown on the card)", "description", item.description, 2, FULL_FORMATTING,
                "Cards show this as plain text. Its formatting shows in the popup when there are no full details.")}
            ${articleFieldHtml}
            ${formattedFieldRow("Full details (shown in the popup, optional)", "details", item.details, 6, FULL_FORMATTING,
                "A blank line starts a new paragraph. Links go to https:// addresses, or inside the site as maze:maze-id, event:event-id or guide:guide-id — and console:entry opens the Event Submission form.")}
            ${fieldRow("Links &amp; References (optional, shown directly beneath the description)", `<textarea name="linksReferences" rows="3">${escapeHtml(item.linksReferences || "")}</textarea>`)}
            ${fieldRow("Habbo link (optional)", `<input type="text" name="habboLink" value="${escapeHtml(item.habboLink || "")}" placeholder="https://...">`)}
            ${entranceSectionHtml}
            ${gallerySectionHtml}
            ${finishSectionHtml}
            ${relatedSectionHtml}
            ${furniSectionHtml}
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>
        `;

        cfg.formEl.dataset.editId = isEdit ? editId : "";
        /* The address (/maze/<slug>), which follows the name unless it is set
           by hand — see js/admin-address.js. A clash is looked for among the
           other records' addresses, ids and old addresses, the same three
           the server refuses. */
        cfg.formEl._address = window.AddressField ? window.AddressField.wire(cfg.formEl, {
            titleInput: cfg.formEl.querySelector('input[name="title"]'),
            current: isEdit ? item.slug || "" : "",
            manual: isEdit ? item.slugManual : undefined,
            prefix: isRooms ? "maze" : "event",
            taken: slug => {
                const other = cfg.getAll().find(r => r.id !== editId
                    && (r.slug === slug || r.id === slug || (Array.isArray(r.slugAliases) && r.slugAliases.includes(slug))));
                return other ? other[cfg.fieldMap.title] || other.id : "";
            },
            // …and a deleted one's (28 Sept 2026), which the server refuses
            // just the same — see readFullWithRetired. Read live, so a
            // record deleted while this form is open counts at once.
            retired: slug => window.AddressField.retiredCheck(retiredAddresses[key])(slug)
        }) : null;
        cfg.formEl.classList.add("is-open");
        cfg.addBtn.style.display = "none";
        cfg.formEl.querySelector(".admin-cancel-btn").addEventListener("click", () => requestCloseForm(key));

        // Every upload made while this form is open (thumbnail, room images)
        // is namespaced under this prefix — the real room id once saved, or
        // a throwaway draft id for a maze that doesn't exist yet. Either way
        // the resulting image URL is stored directly in the field, so it
        // doesn't matter that the prefix isn't the "final" id.
        const uploadPrefix = item.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        wireThumbUpload(cfg.formEl, uploadPrefix);
        wireFormatting(cfg.formEl);
        if (isEvents) wireDerivedStatus(cfg.formEl);
        // The stored copy travels on the form, not in the field — the field
        // only holds the link it came from.
        cfg.formEl._articleDraft = article;
        if (isEvents) wireArticle(cfg.formEl);
        cfg.formEl._relatedDraft = (item.relatedImages || []).map(normalizeRelatedEntry);
        wireRelatedEditor(cfg.formEl, uploadPrefix);
        wireFurniEditor(cfg.formEl, item);
        if (hasGallery) {
            wireBookendUpload(cfg.formEl, "entrance", uploadPrefix);
            wireBookendUpload(cfg.formEl, "finish", uploadPrefix);
            cfg.formEl._entranceOldVersions = ((item.entrance && item.entrance.oldVersions) || []).map(normalizeOldVersionEntry);
            cfg.formEl._finishOldVersions = ((item.finish && item.finish.oldVersions) || []).map(normalizeOldVersionEntry);
            wireBookendOldVersions(cfg.formEl, "entrance", uploadPrefix);
            wireBookendOldVersions(cfg.formEl, "finish", uploadPrefix);
            cfg.formEl._galleryDraft = (item.gallery || []).map(normalizeGalleryEntry);
            wireGalleryEditor(cfg.formEl, uploadPrefix, isRooms);
        }
        if (isRooms) {
            cfg.formEl._selectedTags = new Set((item.tags || []).map(t => t.trim()).filter(Boolean));
            wireTagPicker(cfg.formEl);
        }

        if (isEvents) wireSpotlightColour(cfg.formEl);

        cfg.formEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

        // Taken last, once every draft and field above has been assigned,
        // so it records the form exactly as the admin first sees it.
        cfg.formEl._openSnapshot = formSnapshot(cfg.formEl);
        // After the snapshot, on purpose: rescued furni is a change the
        // admin still has to save — see applyFurniRescue.
        if (isEdit) applyFurniRescue(cfg.formEl, key, editId);

        activeFormKey = key;
        syncFloatingBar();
        syncFloatingBusy();
    }

    /* The floating bar belongs to the form's own panel (1 Oct 2026). It sits
       in .admin-stage, outside every panel, so with a maze open it stayed
       pinned over Players, Bans and the rest, and its Save there submitted
       a form nobody could see — a refusal was written into that hidden
       form, so the press seemed to do nothing. Now it shows only while the
       panel holding the active form is the one on screen, and comes back
       with it. Its label says "Unsaved changes" only when there are some;
       it said so the moment a form opened. */
    let shownPanel = null;
    const floatingLabelEl = floatingActionsEl ? floatingActionsEl.querySelector(".admin-floating-actions-label") : null;
    function syncFloatingBar() {
        if (!floatingActionsEl) return;
        /* Mazes and Events each have a form of their own, and both can be
           open at once (1 Oct 2026, final scan). With a maze open, opening
           an event made Events the active form; back on Mazes the bar then
           stayed away from the maze form still open there, since it was
           not the active one. The form open on the panel being shown is
           the one the bar acts for. */
        const panelOf = key => PANEL_FOR_COLLECTION[key] || key;
        if (shownPanel && (!activeFormKey || panelOf(activeFormKey) !== shownPanel)) {
            const here = Object.keys(COLLECTIONS).find(k => panelOf(k) === shownPanel &&
                COLLECTIONS[k].formEl && COLLECTIONS[k].formEl.classList.contains("is-open"));
            if (here) { activeFormKey = here; syncFloatingBusy(); }
        }
        const on = !!activeFormKey && panelOf(activeFormKey) === shownPanel;
        floatingActionsEl.classList.toggle("open", on);
        if (on) syncFloatingLabel();
    }
    function syncFloatingLabel() {
        if (!floatingLabelEl || !activeFormKey) return;
        floatingLabelEl.textContent = isFormDirty(activeFormKey) ? "Unsaved changes" : "Editing";
    }
    // Typing, picking and the chip/gallery buttons all land here. Deferred,
    // so a click handler that changes a draft has run before it is measured.
    /* A dialog's buttons sit outside the form (1 Oct 2026, final fixes):
       answering a confirm the form asked ("Remove this room?") changes
       the draft once it resolves, so a press in an overlay re-measures
       too. Uploads re-measure from formUpload once they land. */
    ["input", "change", "click"].forEach(type => document.addEventListener(type, e => {
        if (!activeFormKey || !floatingActionsEl.classList.contains("open")) return;
        const formEl = COLLECTIONS[activeFormKey].formEl;
        const t = e.target;
        if (!formEl || !t) return;
        if (formEl.contains(t) || (t.closest && t.closest(".modal-overlay"))) setTimeout(syncFloatingLabel, 0);
    }, true));

    /* The floating Save/Cancel, greyed while the form they act on is
       saving. submitForm and refuseWhileSaving already refuse a second
       press; this is so the buttons look it, rather than appearing to do
       nothing. Follows whichever form is active — the other collection's
       form can be mid-save while this one is open. */
    function syncFloatingBusy() {
        const busy = !!(activeFormKey && COLLECTIONS[activeFormKey].formEl._saving);
        floatingSaveBtn.disabled = busy;
        floatingCancelBtn.disabled = busy;
    }

    /* ---------- losing work by accident ----------

       Every destructive SUB-action in here already asks first ("Remove this
       older version image?"), but abandoning the whole edit did not — Cancel
       threw the form away silently, and closing the tab took it with no
       word at all. Adding furni by hand is minutes of work that exists
       nowhere else until Save is pressed.

       Dirtiness is measured by comparing a snapshot taken when the form
       opened against one taken now, rather than by watching for changes.
       Most of what can change in here is not a form field at all — the
       furni, gallery, related-image and old-version drafts are plain
       objects mutated by their own editors, which fire no input event — so
       a listener-based approach would have to be wired into every one of
       those call sites and would silently miss any added later. */
    function formSnapshot(formEl) {
        const fields = {};
        try {
            new FormData(formEl).forEach((value, name) => {
                // File objects do not serialise; their filename is enough to
                // notice a change, and an upload writes its result into a
                // text field here anyway.
                const v = (value instanceof File) ? value.name : value;
                fields[name] = (fields[name] === undefined) ? v : [].concat(fields[name], v);
            });
        } catch (e) { /* a form mid-teardown has nothing worth comparing */ }
        return JSON.stringify({
            fields,
            gallery: formEl._galleryDraft || null,
            related: formEl._relatedDraft || null,
            furni: formEl._furniDraft || null,
            tags: formEl._selectedTags ? [...formEl._selectedTags].sort() : null,
            entranceOld: formEl._entranceOldVersions || null,
            finishOld: formEl._finishOldVersions || null,
            /* The Address field is deliberately unnamed (see html() in
               js/admin-address.js), so FormData above never sees it — and
               an edit that only changed the address read as clean: Cancel
               threw it away without asking, and so did logging out. What
               the save would send is compared instead of the input's text,
               so a field tidied on blur is not a change by itself. */
            address: formEl._address ? JSON.stringify(formEl._address.payload()) : null
        });
    }

    function isFormDirty(key) {
        const formEl = COLLECTIONS[key] && COLLECTIONS[key].formEl;
        if (!formEl || !formEl.classList.contains("is-open")) return false;
        if (formEl._openSnapshot === undefined || formEl._openSnapshot === null) return false;
        return formSnapshot(formEl) !== formEl._openSnapshot;
    }

    /* The form's own error line, scrolled into view — Save and Cancel are
       pressed from a floating bar, often far below where it sits. */
    function formNotice(formEl, message) {
        const errorEl = formEl && formEl.querySelector(".admin-form-error");
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.style.display = "block";
        errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    /* No closing (or swapping) a form while its save is in flight.

       Cancel pressed mid-save threw the form away — deleting everything it
       had uploaded, as a discard should — and then the save landed, and the
       record it had just written pointed at pictures that were gone. The
       save is left to finish; it closes the form itself when it lands, or
       leaves it open with the reason if it does not. */
    function refuseWhileSaving(key) {
        const formEl = COLLECTIONS[key] && COLLECTIONS[key].formEl;
        if (!formEl || !formEl._saving) return false;
        formNotice(formEl, "Still saving — wait for it to finish.");
        return true;
    }

    // Cancel, from the form's own button or the floating one. The prompt is
    // skipped entirely when nothing has been touched, so the ordinary
    // "opened it to look, closing it again" path is unchanged.
    async function requestCloseForm(key) {
        if (refuseWhileSaving(key)) return;
        if (isFormDirty(key)) {
            const ok = await showConfirmDialog("Discard your unsaved changes to this entry? Anything you have added or edited since opening it will be lost.");
            if (!ok) return;
            // The dialog is awaited: a Save pressed behind it is possible.
            if (refuseWhileSaving(key)) return;
        }
        // Asked even when the form reads as clean: an image uploaded and
        // then removed again leaves the drafts as they were, but the upload
        // itself is still sitting in storage.
        discardFormUploads(key);
        closeForm(key);
    }

    function closeForm(key) {
        const cfg = COLLECTIONS[key];
        // Cleared before anything else: closeForm also runs on logout and on
        // panel switches, and a stale snapshot would make the next
        // beforeunload think there were changes in a form that is gone.
        cfg.formEl._openSnapshot = null;
        cfg.formEl.classList.remove("is-open");
        cfg.formEl.innerHTML = "";
        cfg.formEl._galleryDraft = null;
        cfg.formEl._relatedDraft = null;
        cfg.formEl._furniDraft = null;
        cfg.formEl._furniMoves = null;
        cfg.formEl._renderFurni = null;
        cfg.formEl._selectedTags = null;
        cfg.formEl._expandedOldVersions = null;
        cfg.formEl._entranceOldVersions = null;
        cfg.formEl._finishOldVersions = null;
        cfg.formEl._entranceOldVersionsExpanded = null;
        cfg.formEl._finishOldVersionsExpanded = null;
        // Dropped, not acted on: a close after a successful save has
        // already flushed these (submitForm), and any other close is the
        // edit being abandoned — the stored record still uses every picture
        // that was queued for deletion.
        cfg.formEl._pendingDeletes = null;
        cfg.formEl._sessionUploads = null;
        cfg.formEl._storedKeys = null;
        cfg.formEl._openSession = null;
        cfg.formEl._rawDate = "";
        cfg.addBtn.style.display = "inline-block";

        if (activeFormKey === key) {
            activeFormKey = null;
            floatingActionsEl.classList.remove("open");
            syncFloatingBusy();
        }
    }

    // Renders the shared tag vocabulary (plus any tags already on this room
    // that aren't in it yet, so nothing gets silently dropped) as clickable
    // chips, and wires up adding a brand new tag to the shared list.
    async function wireTagPicker(formEl) {
        const listEl = formEl.querySelector("#tag-chip-list");
        const newInput = formEl.querySelector(".admin-tag-new-input");
        const addBtn = formEl.querySelector(".admin-tag-add-btn");
        const status = formEl.querySelector(".admin-tag-status");
        /* The opening this picker belongs to, and ITS set of ticked tags,
           held from here on rather than read off the form each time. The
           form element outlives any one maze: after an await below it can
           have been closed (and its set nulled) or reopened on another maze
           (and given a new set), and reading formEl._selectedTags then
           ticked a tag created for maze A on maze B. */
        const session = formEl._openSession;
        const selected = formEl._selectedTags;
        const stillOpen = () => formEl._openSession === session && formEl._selectedTags === selected;

        let tagPool = [];
        let tagPoolFailed = false;

        /* Add and Enter are wired BEFORE the tag list is fetched, not after.
           They used to be attached at the end of this function, behind the
           await — so for as long as the list took to arrive, a new tag typed
           and Added did nothing at all, and Enter in the box did nothing
           either, with no sign that anything had been ignored. Pressed
           early, the add now waits for the list and then happens by itself
           (it needs the list to know whether the tag is already in it). */
        let tagsLoaded = false;
        let addQueued = false;
        addBtn.addEventListener("click", addNewTag);
        newInput.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); addNewTag(); }
        });

        try {
            tagPool = await Api.getTags();
        } catch (e) {
            tagPool = [];
            tagPoolFailed = true;
        }
        // The form moved on while the list loaded; the new opening has its
        // own picker.
        if (!stillOpen()) return;
        tagsLoaded = true;

        /* Built as elements rather than a joined string of markup. A tag is
           free text anyone with write access can create (see addNewTag
           below), and it went into both the data-tag attribute and the
           button's label unescaped — a `"` ended the attribute early and a
           tag spelled as markup ran as markup in this session. textContent
           and dataset cannot be read as HTML at all, and the tag also comes
           back out of dataset exactly as it went in, which is what the
           selected set is keyed on. */
        function renderChips() {
            const allTags = Array.from(new Set([...tagPool, ...selected]));
            listEl.innerHTML = "";
            if (!allTags.length && tagPoolFailed) {
                // Said out loud rather than left as an empty box, which reads
                // as "there are no tags" rather than "the list didn't load".
                const note = document.createElement("p");
                note.className = "admin-empty";
                note.textContent = "Couldn't load the tag list. Reopen this form to try again.";
                listEl.appendChild(note);
                return;
            }
            allTags.forEach(tag => {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "tag-chip" + (selected.has(tag) ? " selected" : "");
                chip.dataset.tag = tag;
                chip.textContent = tag;
                chip.addEventListener("click", () => {
                    if (selected.has(tag)) selected.delete(tag);
                    else selected.add(tag);
                    renderChips();
                });
                listEl.appendChild(chip);
            });
        }

        async function addNewTag() {
            const label = newInput.value.trim();
            if (!label) return;
            if (!tagsLoaded) {
                // Held until the list is in — see the handlers above.
                addQueued = true;
                status.textContent = "Adding it once the tag list has loaded…";
                status.style.display = "block";
                return;
            }
            addBtn.disabled = true;
            status.style.display = "none";
            try {
                const result = await Api.createTag(adminToken, label);
                // The tag exists now either way (it is shared vocabulary),
                // but it is only ticked on the maze it was typed for.
                if (!stillOpen()) return;
                if (!tagPool.some(t => t.toLowerCase() === result.label.toLowerCase())) {
                    tagPool.push(result.label);
                }
                selected.add(result.label);
                newInput.value = "";
                renderChips();
            } catch (err) {
                if (err.status === 401) { lockOut(); return; }
                status.textContent = err.message || "Couldn't add that tag.";
                status.style.display = "block";
            } finally {
                addBtn.disabled = false;
            }
        }

        renderChips();
        if (addQueued) {
            addQueued = false;
            status.style.display = "none";
            addNewTag();
        }
    }

    /* What is wrong with an event's four date fields, or "" if nothing is.

       They come in two all-or-nothing pairs. Both blank is a real answer —
       an event can be announced before it is scheduled, and the site says
       "Date TBC" for one — but half a pair is not: it is somebody partway
       through typing, and the only honest thing to do with it is say so.

       The time is not optional and cannot be defaulted. Every place the site
       prints an event's date prints a time beside it, so a missing one would
       have to be invented — and "00:00 UTC" shown as though it were the real
       start is a worse answer than asking. */
    /* ---------- the landing page spotlight (30 Sept 2026, the owner's) ----------

       An event can be put in the landing page's spotlight: its thumbnail
       under the Enter button, captioned, opening the event when pressed.
       Off unless ticked. The start and end are optional and each is a date
       AND a time, in UTC like the event's own: no start means straight
       away, no end means until it is unticked. Several events live at once
       take turns. See showSpotlight in js/welcome.js for the page's side
       and SPOTLIGHT in netlify/functions/events.js for what is accepted. */
    // The caption's colour when none is stored: .welcome-promo-cta's own
    // in css/style.css. The form shows it, and saves "" while it is left.
    const SPOTLIGHT_DEFAULT_COLOUR = "#ebe8ff";
    function spotlightFieldsHtml(item, splitIso) {
        const from = splitIso(item.spotlightFrom), until = splitIso(item.spotlightUntil);
        const stored = spotlightHex(item.spotlightColour) || "";
        const colour = stored || SPOTLIGHT_DEFAULT_COLOUR;
        return `
            <div class="admin-spotlight">
                <h4 class="admin-subheading">Landing page spotlight</h4>
                <label class="admin-check"><input type="checkbox" name="spotlight" value="1" ${item.spotlight ? "checked" : ""}> Show this event in the spotlight on the landing page</label>
                <p class="admin-hint">Its thumbnail goes under the Enter button, with the caption below across its foot, and opens the event when pressed. Several spotlighted events at once take turns.</p>
                ${fieldRow("Spotlight from (UTC, optional)", `<input type="date" name="spotlightFromDate" value="${from.date}">`)}
                ${fieldRow("Spotlight from time (UTC, 24-hour)", `<input type="time" name="spotlightFromTime" value="${from.time}">`)}
                ${fieldRow("Spotlight until (UTC, optional)", `<input type="date" name="spotlightUntilDate" value="${until.date}">`)}
                ${fieldRow("Spotlight until time (UTC, 24-hour)", `<input type="time" name="spotlightUntilTime" value="${until.time}">`)}
                <p class="admin-hint">Leave both blank to spotlight it from now until you untick it. It comes off the landing page by itself the moment the end passes.</p>
                ${fieldRow("Spotlight caption (optional)", `<input type="text" name="spotlightCaption" maxlength="80" placeholder="Click for more details." value="${escapeHtml(item.spotlightCaption || "")}">`)}
                ${fieldRow("Caption colour (hex, optional)", `<span class="admin-colour-pair"><input type="color" class="admin-colour-swatch" value="${colour}" aria-label="Pick the caption colour"><input type="text" name="spotlightColour" maxlength="7" spellcheck="false" autocomplete="off" placeholder="${SPOTLIGHT_DEFAULT_COLOUR}" value="${stored}"></span>`)}
                <p class="admin-hint">Blank caption reads "Click for more details." Type a hex code such as #ebe8ff, or pick one from the swatch, to match the lettering in the event's thumbnail. Blank colour is ${SPOTLIGHT_DEFAULT_COLOUR}.</p>
            </div>`;
    }

    /* "#abc", "abc", "#AABBCC", "aabbcc" → "#aabbcc"; anything else → null,
       and "" for a blank box (the page's own default). */
    function spotlightHex(v) {
        const s = String(v || "").trim().replace(/^#/, "").toLowerCase();
        if (!s) return "";
        if (/^[0-9a-f]{3}$/.test(s)) return "#" + s.split("").map(c => c + c).join("");
        return /^[0-9a-f]{6}$/.test(s) ? "#" + s : null;
    }

    /* The hex box is what saves; the swatch is only a way to fill it (30 Sept
       2026 — a bare colour input takes no typed code in most browsers). Each
       follows the other, and the box is tidied to #rrggbb when it is left. */
    function wireSpotlightColour(formEl) {
        const swatch = formEl.querySelector(".admin-colour-swatch");
        const box = formEl.querySelector('input[name="spotlightColour"]');
        if (!swatch || !box) return;
        swatch.addEventListener("input", () => {
            box.value = swatch.value.toLowerCase();
            box.classList.remove("is-invalid");
            box.dispatchEvent(new Event("input", { bubbles: true }));
        });
        box.addEventListener("input", () => {
            const hex = spotlightHex(box.value);
            box.classList.toggle("is-invalid", hex === null);
            if (hex !== null) swatch.value = hex || SPOTLIGHT_DEFAULT_COLOUR;
        });
        box.addEventListener("blur", () => {
            const hex = spotlightHex(box.value);
            if (hex !== null && hex !== box.value) box.value = hex;
        });
    }

    function spotlightFault(d) {
        const pairs = [["from", d.spotlightFromDate, d.spotlightFromTime], ["until", d.spotlightUntilDate, d.spotlightUntilTime]];
        for (const [which, date, time] of pairs) {
            if (date && !time) return `The spotlight ${which} date needs a time as well.`;
            if (time && !date) return `The spotlight ${which} time needs a date as well.`;
        }
        return "";
    }

    function dateFault(startDate, startTime, endDate, endTime) {
        if (startDate && !startTime) return "The event's start date needs a start time as well — the site always shows both.";
        if (startTime && !startDate) return "The event's start time needs a start date as well.";
        if (endDate && !endTime) return "The event's end date needs an end time as well — the site always shows both.";
        if (endTime && !endDate) return "The event's end time needs an end date as well.";
        // An end on its own has nothing to be the end of: the site reads the
        // start to decide whether an event is upcoming, live or past.
        if (endDate && !startDate) return "An event with an end needs a start as well.";
        return "";
    }

    /* The same question for a maze's opening date: Day, Month and Year.

       A month and a year is a whole answer (the site says "March 2005"), and
       so is nothing at all. Anything else used to be treated as nothing: a
       year typed with the month left on "Month" saved as "", which ERASED
       the date the maze already had, silently. And a day the month does not
       have — 31 February — was stored as it was typed. Both are refused now,
       with the reason, as dateFault does for events. */
    function mazeDateFault(year, month, day) {
        if (!year && !month && !day) return "";
        if (!year || !month) {
            return "The opening date needs both a month and a year. Pick both, or clear all three boxes to leave it unset.";
        }
        if (!/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2100) {
            return "The opening year should be four digits, between 2000 and 2100.";
        }
        if (day) {
            const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
            if (d.getUTCMonth() !== Number(month) - 1 || d.getUTCDate() !== Number(day)) {
                return `${MONTH_NAMES[Number(month) - 1]} ${year} has no day ${Number(day)}.`;
            }
        }
        return "";
    }

    async function submitForm(key, e) {
        e.preventDefault();
        const cfg = COLLECTIONS[key];
        const form = cfg.formEl;
        /* One save at a time. The form's own Save is disabled while one is
           in flight, but the floating Save calls requestSubmit(), which does
           not care that the submit button is disabled — so a second press
           sent a second POST, and a new maze was created twice ("foo" and
           "foo-2"). Everything from here to the flag being set below is
           synchronous, so nothing can slip in between. */
        if (form._saving) return;
        const data = Object.fromEntries(new FormData(form).entries());
        const items = cfg.getAll();
        const editId = form.dataset.editId || null;
        const existing = editId !== null ? (items.find(i => i.id === editId) || {}) : {};

        const payload = {
            ...existing,
            status: data.status,
            hotel: data.hotel,
            tags: key === "rooms"
                ? Array.from(form._selectedTags || [])
                : (data.tags || "").split(",").map(t => t.trim()).filter(Boolean),
            thumb: data.thumb,
            description: data.description,
            details: data.details,
            habboLink: data.habboLink
        };
        payload[cfg.fieldMap.title] = data.title;
        payload[cfg.fieldMap.subtitle] = data.subtitle;
        // The address, and whether it follows the name (js/admin-address.js).
        // The old addresses are the server's to keep, never the form's.
        delete payload.slugAliases;
        if (form._address) Object.assign(payload, form._address.payload());

        /* The server's own bookkeeping, taken back out of the spread above.
           `...existing` sent the stored change list and both timestamps
           straight back — and rooms.js/events.js kept a client-sent
           `changes` whenever it could not describe the save itself, so the
           What's New line could be whatever the browser last read. They
           are the server's facts; it writes them. */
        delete payload.changes;
        delete payload.updatedAt;
        delete payload.createdAt;
        // Which version this edit started from — the server refuses the
        // save if the record has moved on since (see openForm).
        if (editId !== null) payload._baseUpdatedAt = form._baseUpdatedAt || "";

        if (key === "events") {
            /* An event's start and end are each a date field and a time
               field, and each pair is all-or-nothing: both blank means no
               date yet, both filled makes a timestamp.

               Half of a pair used to make nothing at all. Typing a date and
               leaving the time on --:-- discarded the date silently — the
               save went through, the form closed, everything looked right,
               and the date was simply not there. It is caught below instead
               (see dateFault), because losing what someone typed without
               telling them is the worst of the three possible answers. */
            const startDate = (data.startDate || "").trim();
            const startTime = (data.startTime || "").trim();
            const endDate = (data.endDate || "").trim();
            const endTime = (data.endTime || "").trim();
            payload.date = startDate && startTime ? `${startDate}T${startTime}:00Z` : "";
            payload.endDate = endDate && endTime ? `${endDate}T${endTime}:00Z` : "";
            payload._dateFault = dateFault(startDate, startTime, endDate, endTime) || spotlightFault(data) ||
                (spotlightHex(data.spotlightColour) === null ? "The caption colour needs to be a hex code like #ebe8ff, or left blank." : "");
            // The spotlight — see spotlightFieldsHtml. Every field written,
            // so unticking or clearing one actually clears it.
            const pairIso = (d, t) => (d || "").trim() && (t || "").trim() ? `${d.trim()}T${t.trim()}:00Z` : "";
            payload.spotlight = data.spotlight === "1";
            payload.spotlightFrom = pairIso(data.spotlightFromDate, data.spotlightFromTime);
            payload.spotlightUntil = pairIso(data.spotlightUntilDate, data.spotlightUntilTime);
            payload.spotlightCaption = (data.spotlightCaption || "").trim().slice(0, 80);
            /* The hex box, not the swatch, is what saves (wireSpotlightColour):
               left blank it stays "", the landing page's own default, so an
               old event never gains a colour nobody chose (30 Sept 2026). */
            payload.spotlightColour = spotlightHex(data.spotlightColour) || "";
            /* "live" is never sent. The status box works it out from the
               dates and can say LIVE (see wireDerivedStatus), but it is not
               a status the events endpoint stores — a live event is an
               upcoming one whose start has passed, and the site derives the
               rest from its dates. Sending it made every save of an event
               that was running at the time fail. */
            if (payload.status === "live") payload.status = "upcoming";
            // "" for Regular, which is also what an event that predates the
            // field reads as. Written either way so switching an event back
            // to Regular actually clears it.
            payload.ecSeason = data.ecSeason || "";
            /* The stored article, or nothing. Clearing the link field is how
               an article is removed, so an empty field has to write null
               rather than leave the old copy sitting on the record.

               With a link in the field, the article saved is the one that
               was READ FROM THAT LINK: the draft when its url matches, else
               the stored copy when that matches. If neither does — the link
               was edited and never re-read, or the re-read failed — the
               stored article is kept as it is rather than deleted. Losing a
               stored article to a slow response from Habbo was the bug;
               the cost of this way round is only that an unread new link is
               not saved until Add Article succeeds, which the field already
               says ("Nothing is stored until you do"). */
            const link = (data.articleUrl || "").trim();
            const draft = form._articleDraft;
            const stored = existing.article && existing.article.body ? existing.article : null;
            if (!link) payload.article = null;
            else if (draft && draft.body && draft.url === link) payload.article = draft;
            else payload.article = stored;
            // A saved article is what the event shows; details would be
            // dead text underneath it.
            if (payload.article) payload.details = "";
        } else {
            // Day is optional — a maze whose exact opening day isn't known
            // saves as "YYYY-MM" instead of guessing a day, and
            // js/home.js's formatMazeDate shows that as just "Month Year".
            const year = (data.dateYear || "").trim();
            const month = data.dateMonth || "";
            const day = data.dateDay || "";
            payload[cfg.fieldMap.date] = year && month ? `${year.padStart(4, "0")}-${month}${day ? `-${day}` : ""}`
                // An unrecognised stored value stays unless a date was
                // picked — see _rawDate in openForm.
                : (form._rawDate || "");
            // Half a date, or one that does not exist, is refused below
            // rather than saved as nothing — see mazeDateFault.
            payload._dateFault = mazeDateFault(year, month, day);
        }

        if (key === "rooms") {
            payload.difficulty = data.difficulty || "";
        }
        payload.linksReferences = data.linksReferences || "";

        // Rooms and events both get the gallery/entrance/finish fields —
        // same mechanism, same fields, just optional for events too.
        payload.gallery = form._galleryDraft || [];
        // Dropped if an upload left a row without an image — a related
        // image with nothing to show has no meaning on the public side.
        payload.relatedImages = (form._relatedDraft || []).filter(r => r.image);
        /* Furni goes as a PATCH, never as the whole object.

           A scan writes a maze's furni straight into the database without
           touching updatedAt (tools/furni-scan-local.js), so the conflict
           check below cannot see it. A form opened before the scan finished
           and saved after it used to send its own, pre-scan copy — both the
           draft and, through `...existing`, the stored furni as it was when
           the page loaded — and silently wiped out the scan's results. The
           step before this sent furni only when the editor had changed it,
           which still sent the WHOLE object then, and so still wiped every
           room the scan had just done whenever one room was edited.

           So `furni` is never sent now. furniPatch carries only the picture
           addresses this form changed: { "<image url>": { base, draft } }
           for a room edited here, null for one to delete. rooms.js applies
           it to the furni AS STORED, under its own furniRev compare-and-set,
           so a room nobody touched here keeps whatever the scan wrote into
           it — and a room edited here keeps the scan's new pieces too, since
           only what the admin changed between base and draft is applied
           (see buildFurniPatch).
           furniRev is the server's counter and goes back out of the spread
           along with furni itself. Built just below, after the entrance and
           finish are known, because the orphan pruning needs them. */
        delete payload.furni;
        delete payload.furniRev;
        delete payload.furniPatch;
        /* The entrance and finish keep any sub-fields the editor does not
           know about, as the gallery entries now do — but only while the
           slot still holds the same picture: details belonging to the old
           image should not ride along onto a new one. */
        const bookend = (kind, image, label, fallback) => {
            if (!image) return null;
            const was = existing[kind] && typeof existing[kind] === "object" && existing[kind].image === image ? existing[kind] : {};
            return { ...was, image, label: label || fallback, oldVersions: form[`_${kind}OldVersions`] || [] };
        };
        payload.entrance = bookend("entrance", (data.entranceImage || "").trim(), (data.entranceLabel || "").trim(), "Entrance");
        payload.finish = bookend("finish", (data.finishImage || "").trim(), (data.finishLabel || "").trim(), "Finish");

        /* Drop furni belonging to pictures this maze no longer has.

           room.furni is keyed by the image it was scanned from, and nothing
           was removing a key when its picture was taken out of the gallery —
           so the record simply stayed, for good. Found three in the live
           archive, one of them carrying 19 pieces against an Illusion Maze
           screenshot that is not in the maze any more. Invisible on the site,
           because the modal only ever looks furni up by a picture it is
           actually showing, but it rides along in every copy of the archive
           the homepage downloads — and furni is already 58% of that payload,
           so this is the part that must not be allowed to silently accrete.

           Built AFTER entrance and finish are decided just above, so it uses
           what is about to be saved rather than what was loaded. Old versions
           count as kept: a furni record against one is not something this
           screen created and not something it should quietly discard.

           Conservative on purpose — it only ever removes a key that matches
           no picture at all. An existing orphan is cleared the next time its
           maze is saved, so this cleans up behind itself without a migration
           and without touching the database directly.

           The pruning is part of the patch now: a dropped key is a null
           entry in furniPatch, not a key missing from a whole object. */
        if (form._furniDraft) {
            const keep = new Set();
            const note = img => { if (img) keep.add(img); };
            const withOld = entry => {
                if (!entry) return;
                note(entry.image);
                (entry.oldVersions || []).forEach(v => note(v && v.image));
            };
            withOld(payload.entrance);
            withOld(payload.finish);
            (payload.gallery || []).forEach(withOld);

            let original = {};
            try { original = JSON.parse(form._furniOriginal || "{}") || {}; } catch (e) { original = {}; }
            // Changed rooms as { base, draft }, so rooms.js merges piece by
            // piece; deleted and orphaned ones as null. See buildFurniPatch.
            const { patch, dropped } = buildFurniPatch(original, form._furniDraft, keep, form._furniMoves);
            if (dropped) console.info(`Dropping ${dropped} furni record${dropped === 1 ? "" : "s"} with no matching picture.`);
            if (Object.keys(patch).length) payload.furniPatch = patch;
        }

        const submitBtn = form.querySelector("button[type=submit]");
        const errorEl = form.querySelector(".admin-form-error");

        /* Says why, and makes sure it is seen. Save is a floating bar pinned
           to the bottom of the window, so it is pressed from wherever the
           form happens to be scrolled to — and this message lives near the
           form's own foot. Measured at 870px below the fold on the event
           that prompted all this, which from the reader's side is
           indistinguishable from the button doing nothing at all. */
        function refuse(message) {
            errorEl.textContent = message;
            errorEl.style.display = "block";
            errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        const fault = payload._dateFault;
        delete payload._dateFault;
        if (fault) { refuse(fault); return; }

        const addressProblem = form._address && form._address.problem();
        if (addressProblem) { refuse(addressProblem); return; }

        if (key === "events" && payload.date && payload.endDate && payload.endDate <= payload.date) {
            refuse("The event's end must be after its start.");
            return;
        }
        if (key === "events" && payload.spotlightFrom && payload.spotlightUntil && payload.spotlightUntil <= payload.spotlightFrom) {
            refuse("The spotlight's end must be after its start.");
            return;
        }
        if (key === "events" && payload.spotlight && !payload.thumb) {
            refuse("The spotlight shows the event's thumbnail, so it needs one — add a thumbnail, or untick the spotlight.");
            return;
        }

        // Not while a picture is still on its way up — see formUpload.
        if (uploadsPending(form)) {
            refuse("A picture is still uploading — wait for it to finish, then save.");
            return;
        }

        const saving = on => {
            form._saving = on;
            submitBtn.disabled = on;
            submitBtn.textContent = on ? "Saving…" : "Save";
            syncFloatingBusy();
        };
        saving(true);

        try {
            if (editId !== null) {
                const updated = await cfg.update(payload);
                // Looked up fresh rather than reusing an index captured
                // before this await — the list could have changed (another
                // item added/removed/reordered) while this save was in
                // flight. Falls back to pushing it on if the original item
                // is somehow gone by now, so the save is never silently lost.
                const idx = items.findIndex(i => i.id === updated.id);
                if (idx !== -1) items[idx] = updated;
                else items.push(updated);
            } else {
                const created = await cfg.create(payload);
                items.push(created);
            }
            // Captured before closeForm clears them, then acted on only now
            // that the save has landed — see imageKeysOf.
            const pendingDeletes = form._pendingDeletes || new Set();
            const sessionUploads = form._sessionUploads || new Set();
            const storedKeys = form._storedKeys || new Set();
            closeForm(key);
            renderList(key);
            flushPendingDeletes(pendingDeletes, sessionUploads, storedKeys);
        } catch (err) {
            // Save usable again BEFORE the login goes up: signing back in
            // returns to this same form, and a button still reading
            // "Saving…" and disabled left it with no way to save at all.
            if (err.status === 401) { saving(false); lockOut(); return; }
            /* Somebody else saved this record after this form opened. Said
               plainly and the form kept open, so nothing typed is lost —
               but not saved over their work either. */
            if (err.status === 409) {
                /* Two things the refused edit made are kept past the form
                   closing, because "copy anything you need" could not cover
                   them: they are not text.

                   The PICTURES it uploaded. Reopening the record discards
                   the form, and a discard deletes the edit's uploads — so
                   the picture the admin was told to copy was gone by the
                   time they went to use it. They are parked against the
                   record instead (parkRefusedUploads): the next opening of
                   it takes them on as its own, so Add from URL can put one
                   back, and that edit's Save or Cancel clears whatever it
                   does not use, exactly as for its own uploads.

                   The FURNI changes. A furni-only save that failed used to
                   leave the record moved on, and every retry was then a 409
                   (rooms.js now writes the two together, so it should not
                   recur — but a 409 from somebody else's save is the same
                   story). Reopening threw the draft away with the form, with
                   nothing to say so. The changed rooms are kept, and put
                   back on top of the stored version when the record is next
                   opened — see applyFurniRescue in openForm. */
                if (editId !== null) {
                    parkRefusedUploads(key, editId, form._sessionUploads);
                    form._sessionUploads = new Set();
                    // Each entry carries its own base, which is what the
                    // rescue merges against — see applyFurniRescue.
                    if (payload.furniPatch) furniRescue.set(rescueKeyOf(key, editId), { patch: payload.furniPatch });
                }
                /* Not every 409 is somebody else's save. rooms.js answers a
                   save from a page older than furniPatch — one that sends
                   the whole furni object — with "This page is out of date.
                   Reload /warren…", and the fixed wording below hid that,
                   sending the admin round Reopen for ever when the only fix
                   was a reload. The server's own words are shown whenever
                   they are not its usual "Someone else saved" line. */
                const serverSays = String(err.message || "");
                const outOfDate = /out of date/i.test(serverSays);
                if (outOfDate || (serverSays && !/^Someone else saved/i.test(serverSays))) {
                    refuse(serverSays + (outOfDate
                        ? " Copy anything you need from this form first: a reload closes it."
                        : " Your edits are still here: copy anything you need before reopening it."));
                } else {
                    refuse("Someone else saved this record since you opened it. Your edits are still here: copy any text you need before reopening it." +
                        (payload.furniPatch ? " Your furni changes are kept, and put back on top of their version when you reopen it, for you to check and save." : "") +
                        " Pictures you uploaded are kept as well: right-click one and copy its address, then add it again with Add from URL once reopened.");
                }
                await refreshAfterConflict(key, editId);
            } else {
                // A dropped connection or a server error can arrive AFTER
                // the write landed, so from here on nothing this form
                // uploaded is safe to delete on Cancel.
                if (!err.status || err.status >= 500) form._saveAmbiguous = true;
                refuse(err.message || "Something went wrong saving this.");
            }
        } finally {
            saving(false);
        }
    }

    /* After a 409, the loaded copy of the record is the stale one — and
       openForm reads the loaded copy. Reopening used to fetch nothing, so
       the form came back with the same old updatedAt and every retry was
       refused again, for good, until the whole page was reloaded. The
       archive is re-read here (the same full read the panel loads with)
       and the one record swapped in place, so the next opening starts from
       the version that is actually stored. Best effort: if the read fails
       the message already said what happened, and a page reload still
       works. */
    async function refreshAfterConflict(key, editId) {
        const cfg = COLLECTIONS[key];
        let fresh;
        try {
            fresh = await cfg.getFull();
        } catch (err) {
            if (err.status === 401) lockOut();
            return;
        }
        const record = (fresh || []).find(i => i.id === editId);
        const items = cfg.getAll();
        const idx = items.findIndex(i => i.id === editId);
        if (record && idx !== -1) items[idx] = record;
        else if (record) items.push(record);
        else if (idx !== -1) items.splice(idx, 1);
        renderList(key);
        const errorEl = cfg.formEl.querySelector(".admin-form-error");
        // Not after "out of date" (see submitForm): there are no "their
        // changes" to see, only a reload to do.
        if (record && errorEl && cfg.formEl.dataset.editId === editId && !/out of date/i.test(errorEl.textContent)) {
            errorEl.textContent += " Reopening it now will show their changes.";
        }
    }

    async function deleteItem(key, id) {
        const cfg = COLLECTIONS[key];
        const items = cfg.getAll();
        const item = items.find(i => i.id === id);
        if (!item) return; // already gone (e.g. deleted from another click before this one's confirm dialog closed)
        const title = item[cfg.fieldMap.title] || "this entry";
        /* Refused while this record is open in the form, rather than
           closing the form for it. Deleting underneath an open edit left a
           form whose Save could only fail (the record is gone) holding
           uploads nobody would ever clean up — and if a save was in flight,
           it could land after the delete had already swept the record's
           pictures. Closing it first is one click, and it is the admin who
           decides whether what they had typed there is worth keeping. */
        if (cfg.formEl.classList.contains("is-open") && cfg.formEl.dataset.editId === id) {
            await sayProblem(`"${title}" is open for editing. Save or cancel that first, then delete it.`, "Still Open");
            return;
        }
        // The page's own box, not confirm() (30 Sept 2026). It blocks the
        // page as confirm() did, so nothing can open the form meanwhile.
        if (!await showConfirmDialog(`Delete "${escapeHtml(title)}"? This is permanent and affects the live site immediately.`, { danger: true })) return;
        try {
            await cfg.remove(item.id);
            // Re-found rather than reusing an index from before this await —
            // the list could have changed while the confirm dialog was open
            // or the request was in flight.
            const idx = items.findIndex(i => i.id === id);
            if (idx !== -1) items.splice(idx, 1);
            retireLocally(key, item);
            renderList(key);
            cleanupItemImages(item);
            /* The server has just taken this record off every contributor
               who was credited with it (uncreditRecord in rooms.js and
               events.js, 30 Sept 2026), stamping their updatedAt as it did.
               The Console panel's copy was the old one: its counts were
               wrong, and Edit then Save on any of those people was refused
               as "someone else changed this contributor". Re-read the way a
               credited lead has it re-read — skipped while that form is
               open (see the listener in "console: contributors"). */
            document.dispatchEvent(new CustomEvent("mazerats:contributors-changed"));
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            await sayProblem(err.message || "Couldn't delete that — try again.");
        }
    }

    // ---------- admin accounts ----------

    async function loadAdmins() {
        try {
            workingAdmins = await Api.getAdmins(adminToken);
            renderAdminsList();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            // Said, not swallowed — see showLoadFailure.
            showLoadFailure(adminsListEl, err.message || "Couldn't load the admin accounts.");
        }
    }

    /* What each stored role is called on screen. The two differ on purpose
       and already did — "viewer" has always shown as "View only" — so the
       stored value can stay the flat, scope-shaped word every server-side
       check is written against while the list says something a person would
       say. "wizard" is the scope that names the /wizard page, its endpoint
       and its corner of blob storage; "Albus" is who holds it. */
    const ROLE_LABELS = { owner: "Owner", admin: "Admin", viewer: "View only", wizard: "Albus" };

    /* The account the server will never delete (PERMANENT_OWNER in
       netlify/functions/_auth.js; auth.js answers 403 for it). Its row
       offered Delete anyway, which could only ever fail — so it is not
       offered. Kept in step with the server by hand. */
    const PERMANENT_OWNER = "ChrisYepYep";

    function renderAdminsList() {
        adminsListEl.innerHTML = "";
        if (!workingAdmins.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "No admin accounts found.";
            adminsListEl.appendChild(empty);
            return;
        }
        const canDelete = currentUserRole === "owner";
        workingAdmins.forEach(admin => {
            const isSelf = admin.username === currentUsername;
            const role = admin.role || "admin";
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row admin-account-row";
            row.innerHTML = `
                <div class="row-info">
                    <h3>${escapeHtml(admin.username)}${isSelf ? ' <span class="admin-you-tag">(you)</span>' : ""}</h3>
                    <p class="row-creator">${ROLE_LABELS[role] || "Admin"} · ${admin.createdAt ? "Added " + escapeHtml(String(admin.createdAt).slice(0, 10)) : ""}</p>
                </div>
                <div class="admin-row-actions">
                    ${(isSelf || canDelete) ? `<button type="button" class="btn ${isSelf ? "admin-self-reset-btn" : "admin-reset-btn"}">Reset Password</button>` : ""}
                    ${canDelete && admin.username !== PERMANENT_OWNER ? `<button type="button" class="btn admin-delete-btn" ${workingAdmins.length <= 1 ? "disabled" : ""}>Delete</button>` : ""}
                </div>
            `;
            // Only an owner can reset someone else's password (also enforced
            // server-side, see netlify/functions/auth.js's PUT handler) — a
            // standard admin only ever sees this button on their own row.
            /* Your own row's button carries a class of its own. The
               view-only greying (body.is-viewer .admin-reset-btn in
               style.css) is right for resetting SOMEBODY ELSE, which only an
               owner may do — but changing your own password is the "self"
               scope, which every role has (WRITE_SCOPES in _auth.js, viewer
               included), and a greyed button said a viewer could not. */
            const resetBtn = row.querySelector(".admin-reset-btn, .admin-self-reset-btn");
            if (resetBtn) resetBtn.addEventListener("click", () => openResetForm(admin.username));
            const deleteBtn = row.querySelector(".admin-delete-btn");
            if (deleteBtn) deleteBtn.addEventListener("click", () => deleteAdmin(admin.username));
            adminsListEl.appendChild(row);
        });
    }

    function openCreateAdminForm() {
        // Owner is owner-only to grant (also enforced server-side); the rest
        // are open to anyone who can create an account at all, so the
        // selector is shown to every admin rather than to owners alone — a
        // standard admin having no way to make a read-only account would
        // defeat the point of having the role.
        const roleFieldHtml = fieldRow("Privileges", `
                <select name="role">
                    <option value="admin">Standard Admin</option>
                    <option value="viewer">View Only (read-only)</option>
                    <option value="wizard">Albus (the atlas only)</option>
                    ${currentUserRole === "owner" ? '<option value="owner">Owner (can delete other admins)</option>' : ""}
                </select>
              `);

        adminsFormEl.innerHTML = `
            <h3 class="admin-form-title">Add a New Admin</h3>
            ${fieldRow("Username", `<input type="text" name="username" required autocomplete="off">`)}
            ${fieldRow("Password (8+ characters)", `<input type="password" name="password" required minlength="8" autocomplete="new-password">`)}
            ${fieldRow("Confirm password", `<input type="password" name="confirm" required minlength="8" autocomplete="new-password">`)}
            ${roleFieldHtml}
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>
        `;
        adminsFormEl.dataset.mode = "create";
        adminsFormEl.dataset.username = "";
        adminsFormEl.dataset.self = "";
        openAdminsForm();
    }

    function openResetForm(username) {
        /* Your own row asks for your current password too. The server treats
           a change to the caller's own password as the "self" case and
           refuses it without one (auth.js) — the same rule as the account
           tab's box, which this is just another way into.

           Somebody else's row, reset by an owner, asks for the OWNER'S own
           password (requesterPassword). A reset hands whoever does it a
           working login to that account, so a session token alone — one
           left open on a shared machine, or lifted from one — was enough to
           take over every other account on the site. auth.js now refuses
           such a reset (403) unless the password of the account asking for
           it comes with it. The field is an ordinary password input, so
           js/password-field.js enhances it like the others. */
        const isSelf = username === currentUsername;
        adminsFormEl.innerHTML = `
            <h3 class="admin-form-title">Reset Password — ${escapeHtml(username)}</h3>
            ${isSelf ? fieldRow("Your current password", `<input type="password" name="currentPassword" required autocomplete="current-password">`) : ""}
            ${fieldRow("New password (8+ characters)", `<input type="password" name="password" required minlength="8" autocomplete="new-password">`)}
            ${fieldRow("Confirm new password", `<input type="password" name="confirm" required minlength="8" autocomplete="new-password">`)}
            ${isSelf ? "" : fieldRow("Your password (to confirm it's you)", `<input type="password" name="requesterPassword" required autocomplete="current-password">`)}
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>
        `;
        adminsFormEl.dataset.mode = "reset";
        adminsFormEl.dataset.username = username;
        // Marks the one form in this panel a view-only account may submit,
        // so the stylesheet can lift its greying (#admins-form[data-self]).
        adminsFormEl.dataset.self = isSelf ? "true" : "";
        openAdminsForm();
    }

    function openAdminsForm() {
        adminsFormEl.classList.add("is-open");
        adminsAddBtn.style.display = "none";
        adminsFormEl.querySelector(".admin-cancel-btn").addEventListener("click", closeAdminsForm);
        adminsFormEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function closeAdminsForm() {
        adminsFormEl.classList.remove("is-open");
        adminsFormEl.innerHTML = "";
        adminsAddBtn.style.display = "inline-block";
    }

    adminsFormEl.addEventListener("submit", async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(adminsFormEl).entries());
        const errorEl = adminsFormEl.querySelector(".admin-form-error");
        const submitBtn = adminsFormEl.querySelector("button[type=submit]");

        if (data.password !== data.confirm) {
            errorEl.textContent = "Passwords don't match.";
            errorEl.style.display = "block";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";
        try {
            if (adminsFormEl.dataset.mode === "create") {
                await Api.createAdmin(adminToken, data.username.trim(), data.password, data.role);
            } else {
                /* The fourth argument is YOUR password in both cases — on
                   your own row the current one (currentPassword), on
                   somebody else's the one that proves it is you asking
                   (requesterPassword; see openResetForm). auth.js reads
                   either as the caller's own password, so it goes as
                   currentPassword whichever field it came from. */
                const changed = await Api.resetAdminPassword(adminToken, adminsFormEl.dataset.username, data.password,
                    data.currentPassword || data.requesterPassword || undefined);
                // An owner resetting their own row from this list: keep them
                // signed in with the replacement token (see saveOwnPassword).
                if (changed && changed.token) {
                    adminToken = changed.token;
                    writeToken(adminToken);
                }
            }
            closeAdminsForm();
            await loadAdmins();
        } catch (err) {
            // Save usable again BEFORE the login goes up, as the maze form
            // does: signing back in returns to this same form, and it used
            // to be left disabled on "Saving…" with no way to try again.
            submitBtn.disabled = false;
            submitBtn.textContent = "Save";
            if (err.status === 401) { lockOut(); return; }
            /* 403 on a reset is the server's own words about the password
               it was given — yours, missing or wrong (auth.js). Said here,
               in the form, with the field emptied and focused for another
               go; it is not a signed-out session, so never a lockOut. */
            // The named input is the field itself (js/password-field.js no
            // longer keeps a hidden partner, 30 Sept 2026).
            const own = adminsFormEl.querySelector('[name="requesterPassword"], [name="currentPassword"]');
            if (err.status === 403 && adminsFormEl.dataset.mode === "reset" && own) {
                clearPassword(own);
                own.focus();
            }
            // Password attempts are rate-limited (auth.js): 429 is that,
            // said plainly rather than as the server's status line.
            errorEl.textContent = err.status === 429
                ? "Too many attempts. Try again later."
                : err.message || "Something went wrong saving this.";
            errorEl.style.display = "block";
        }
    });

    async function deleteAdmin(username) {
        if (!await showConfirmDialog(`Delete admin account "${escapeHtml(username)}"? They'll no longer be able to log in.`, { danger: true })) return;
        try {
            await Api.deleteAdmin(adminToken, username);
            await loadAdmins();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            await sayProblem(err.message || "Couldn't delete that account.");
        }
    }

    /* ---------- forget a player ----------
       Moved to the Players tab on 29 Sept 2026 — js/admin-players.js, which
       carries the look-up, the labels for player-forget.js's counts and
       the confirm, as an action on each player. */

    // ---------- console: contributors ----------

    // Same 5 options js/home.js's console modal renders on its People page —
    // kept in sync manually, same pattern as DIFFICULTY_ORDER elsewhere.
    const CONTRIBUTION_TYPES = ["Room Images", "Event Images", "Collab Images", "Historical Data", "Web Development"];

    /* Had no catch at all: a failed read was an unhandled rejection from
       enterAdmin (which does not await it) and an empty box where the list
       should be. The read is public, so there is no 401 to handle. */
    async function loadContributors() {
        try {
            workingContributors = await Api.getContributors();
            /* Api.getContributors never throws (30 Sept 2026): after its
               retries it answers [] and marks the read as degraded, so the
               catch below never ran and a failed read drew "No contributors
               added yet." Asked of the mark instead. */
            if (Api._degraded && Api._degraded.has("contributor data")) {
                throw new Error("Couldn't load the contributors. Reload the page to try again.");
            }
        } catch (err) {
            showLoadFailure(contributorsListEl, err.message || "Couldn't load the contributors.");
            return;
        }
        renderContributorsList();
    }

    function renderContributorsList() {
        contributorsListEl.innerHTML = "";
        if (!workingContributors.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "No contributors added yet.";
            contributorsListEl.appendChild(empty);
            return;
        }
        workingContributors.forEach(contributor => {
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row";
            // What they are credited with, in the same terms the console
            // states it: the ticks first, anything untied to a record after.
            const mazeCount = (contributor.mazes || []).length;
            const eventCount = (contributor.events || []).length;
            const extra = contributor.extra != null
                ? contributor.extra
                : Math.max(0, (contributor.count || 0) - mazeCount - eventCount);
            const breakdown = [
                mazeCount ? `${mazeCount} maze${mazeCount === 1 ? "" : "s"}` : "",
                eventCount ? `${eventCount} event${eventCount === 1 ? "" : "s"}` : "",
                extra ? `${extra} other` : ""
            ].filter(Boolean).join(", ") || "nothing credited yet";
            row.innerHTML = `
                <div class="row-info">
                    <h3>${escapeHtml(contributor.username)} <span class="admin-contributor-count">${escapeHtml(contributor.count || 0)}</span></h3>
                    <p class="row-creator">${escapeHtml(breakdown)}</p>
                    <p class="row-desc">${escapeHtml((contributor.types || []).join(", "))}</p>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="btn admin-edit-btn">Edit</button>
                    <button type="button" class="btn admin-delete-btn">Delete</button>
                </div>
            `;
            // By id rather than list position: the list is re-read whenever
            // the panel is shown (see showPanel), and an index taken from
            // the old copy could point at somebody else in the new one.
            row.querySelector(".admin-edit-btn").addEventListener("click", () => requestOpenContributorForm(contributor.id));
            row.querySelector(".admin-delete-btn").addEventListener("click", () => deleteContributor(contributor.id));
            contributorsListEl.appendChild(row);
        });
    }

    /* Which mazes and events a contributor worked on.

       The count used to be a number typed in by hand, which meant it was
       bookkeeping rather than a fact: nothing tied it to the archive, and it
       drifted the moment anything was added. These two lists are the actual
       attribution — tick the mazes and the events someone contributed to and
       the count follows from them.

       Sorted the way the archive sorts, so finding a maze in the list works
       the same way finding it anywhere else does. */
    function recordPickerHtml(name, records, chosen, labelOf) {
        if (!records.length) {
            return `<p class="admin-picker-empty">Nothing to pick from yet.</p>`;
        }
        return `<div class="admin-checkbox-group admin-picker">` + records.map(rec => `
            <label class="admin-checkbox-option">
                <input type="checkbox" name="${name}" value="${escapeHtml(rec.id)}" ${chosen.includes(rec.id) ? "checked" : ""}>
                <span>${escapeHtml(labelOf(rec))}</span>
            </label>
        `).join("") + `</div>`;
    }

    function openContributorForm(editId) {
        const found = editId != null ? workingContributors.find(c => c.id === editId) : null;
        const isEdit = !!found;
        const contributor = found || {};
        const existingTypes = contributor.types || [];
        const chosenMazes = contributor.mazes || [];
        const chosenEvents = contributor.events || [];

        /* Credits the pickers below cannot show. When the archive failed to
           load, both pickers are empty, and saving sent mazes: [] and
           events: [] — wiping every attribution this person had. Whatever
           was chosen and is not on offer is carried through the save
           untouched instead (see contributorCounts).

           And when it DID load, too (30 Sept 2026). The pickers are the
           archive as it was read at sign-in, so a maze added since — by
           another admin, or by a Missing Pieces lead accepted with credit —
           is missing from them without having been deleted, and used to be
           dropped from this person's credits on the next save with no word
           said. An id is only let go now when it is KNOWN to be deleted:
           on the retired list, which carries every deleted record's id
           (retireAddresses on the server, retireLocally here). */
        const knownDeleted = (key, id) => (retiredAddresses[key] || []).includes(id);
        contributorsFormEl._keptMazes = chosenMazes.filter(id => !workingRooms.some(r => r.id === id) && !knownDeleted("rooms", id));
        contributorsFormEl._keptEvents = chosenEvents.filter(id => !workingEvents.some(e => e.id === id) && !knownDeleted("events", id));

        const typesHtml = CONTRIBUTION_TYPES.map(type => `
            <label class="admin-checkbox-option">
                <input type="checkbox" name="types" value="${type}" ${existingTypes.includes(type) ? "checked" : ""}>
                <span>${type}</span>
            </label>
        `).join("");

        const mazes = workingRooms.slice().sort((a, b) => compareNames(a.name, b.name));
        const events = workingEvents.slice()
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

        contributorsFormEl.innerHTML = `
            <h3 class="admin-form-title">${isEdit ? "Edit Contributor" : "Add a New Contributor"}</h3>
            ${fieldRow("Username (Habbo)", `<input type="text" name="username" value="${escapeHtml(contributor.username || "")}" required autocomplete="off">`)}
            <!-- Divs, not labels. A <label> wrapping a group of checkboxes
                 belongs to the FIRST one, so clicking the heading "Mazes
                 contributed to" would tick whichever maze happened to sort
                 first. Each checkbox already carries its own label. -->
            <div class="admin-field">
                <span>Mazes contributed to</span>
                ${recordPickerHtml("mazes", mazes, chosenMazes, r => r.name || r.id)}
            </div>
            <div class="admin-field">
                <span>Events contributed to</span>
                ${recordPickerHtml("events", events, chosenEvents, e => e.title || e.id)}
            </div>
            ${contributorsFormEl._keptMazes.length || contributorsFormEl._keptEvents.length
                ? `<p class="admin-field-note">${archiveLoadedOk ? "This page's copy of the archive is older than" : "The archive didn't load, so"} ${contributorsFormEl._keptMazes.length + contributorsFormEl._keptEvents.length} earlier credit(s)${archiveLoadedOk ? ", so they" : ""} can't be shown here. They are kept as they are when you save.</p>`
                : ""}
            ${fieldRow("Other contributions", `<input type="number" name="extra" min="0" step="1" value="${escapeHtml(contributor.extra != null ? contributor.extra : legacyExtra(contributor))}">`)}
            <p class="admin-field-note">Anything not tied to a maze or an event — site work, research, and so on. Added to the ticks above.</p>
            <p class="admin-field-note admin-contributor-total" id="contributor-total"></p>
            <div class="admin-field">
                <span>Contribution type(s)</span>
                <div class="admin-checkbox-group">${typesHtml}</div>
            </div>
            <p class="admin-form-error" style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="submit" class="admin-action-pill admin-pill-solid">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn">Cancel</button>
            </div>
        `;
        contributorsFormEl.dataset.id = isEdit ? contributor.id : "";
        /* The version this form started from, sent back with the save so
           the server can refuse it if the row has moved on since — as the
           maze form does (see openForm). Accepting a Missing Pieces lead
           with "credit" writes to these rows too, and used to be saved
           straight over by a form opened before it. */
        contributorsFormEl._baseUpdatedAt = contributor.updatedAt || "";

        paintContributorTotal();

        openContributorsForm();
        // What it opened with, for the unsaved-changes question — see
        // isContributorFormDirty.
        contributorsFormEl._openSnapshot = formSnapshot(contributorsFormEl);
    }

    /* Unsaved ticks in the contributor form (30 Sept 2026). Cancel, Edit on
       another row, logging out and closing the tab all threw them away
       without a word; the maze form has asked since it was written. The
       same snapshot is compared (formSnapshot), taken once the form is
       drawn. */
    function isContributorFormDirty() {
        if (!contributorsFormEl.classList.contains("is-open")) return false;
        if (contributorsFormEl._openSnapshot == null) return false;
        return formSnapshot(contributorsFormEl) !== contributorsFormEl._openSnapshot;
    }

    // Resolves true when the open form may go: nothing changed, or Yes.
    async function mayDropContributorForm() {
        if (!isContributorFormDirty()) return true;
        return showConfirmDialog("Discard your unsaved changes to this contributor? Anything you have ticked or edited since opening the form will be lost.");
    }

    async function requestOpenContributorForm(editId) {
        if (!(await mayDropContributorForm())) return;
        openContributorForm(editId);
    }

    async function requestCloseContributorsForm() {
        if (!(await mayDropContributorForm())) return;
        closeContributorsForm();
    }

    /* The total, kept live as the boxes are ticked, so the number the
       console will show is visible while the picking is being done rather
       than only after saving.

       Wired ONCE, here, rather than inside openContributorForm: that added
       another pair of listeners to the same form element every time it was
       opened, so after a dozen edits each tick repainted the total a dozen
       times over. */
    function paintContributorTotal() {
        const totalEl = contributorsFormEl.querySelector("#contributor-total");
        if (!totalEl) return;
        const counts = contributorCounts(new FormData(contributorsFormEl));
        totalEl.textContent =
            `Counts as ${counts.count} contribution${counts.count === 1 ? "" : "s"}` +
            ` (${counts.mazes.length} maze${counts.mazes.length === 1 ? "" : "s"},` +
            ` ${counts.events.length} event${counts.events.length === 1 ? "" : "s"},` +
            ` ${counts.extra} other).`;
    }
    contributorsFormEl.addEventListener("change", paintContributorTotal);
    contributorsFormEl.addEventListener("input", paintContributorTotal);

    /* A contributor saved before the pickers existed has a hand-typed count
       and nothing to attribute it to. That number is real work someone did,
       so it becomes their "other" total rather than being thrown away — and
       once mazes are ticked for them, the admin can bring it down by hand. */
    function legacyExtra(contributor) {
        if (!contributor || contributor.count == null) return 0;
        return contributor.count;
    }

    // The three numbers the form produces, in one place so the live total
    // and the save can never disagree about the arithmetic.
    function contributorCounts(formData) {
        // Plus any credits the pickers could not show — see _keptMazes.
        const mazes = formData.getAll("mazes").concat(contributorsFormEl._keptMazes || []);
        const events = formData.getAll("events").concat(contributorsFormEl._keptEvents || []);
        const extra = Math.max(0, parseInt(formData.get("extra"), 10) || 0);
        return { mazes, events, extra, count: mazes.length + events.length + extra };
    }

    function openContributorsForm() {
        contributorsFormEl.classList.add("is-open");
        contributorsAddBtn.style.display = "none";
        contributorsFormEl.querySelector(".admin-cancel-btn").addEventListener("click", requestCloseContributorsForm);
        contributorsFormEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function closeContributorsForm() {
        contributorsFormEl._openSnapshot = null;
        contributorsFormEl.classList.remove("is-open");
        contributorsFormEl.innerHTML = "";
        contributorsFormEl._keptMazes = [];
        contributorsFormEl._keptEvents = [];
        contributorsAddBtn.style.display = "inline-block";
    }

    contributorsFormEl.addEventListener("submit", async e => {
        e.preventDefault();
        const formData = new FormData(contributorsFormEl);
        const username = (formData.get("username") || "").trim();
        // count is derived, never typed — see contributorCounts.
        const { mazes, events, extra, count } = contributorCounts(formData);
        const types = formData.getAll("types");
        const errorEl = contributorsFormEl.querySelector(".admin-form-error");
        const submitBtn = contributorsFormEl.querySelector("button[type=submit]");

        if (!username) {
            errorEl.textContent = "A username is required.";
            errorEl.style.display = "block";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";
        try {
            const id = contributorsFormEl.dataset.id;
            const record = { username, count, types, mazes, events, extra };
            if (id) {
                await Api.updateContributor(adminToken, { id, ...record, _baseUpdatedAt: contributorsFormEl._baseUpdatedAt || "" });
            } else {
                await Api.createContributor(adminToken, record);
            }
            closeContributorsForm();
            await loadContributors();
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Save";
            if (err.status === 401) { lockOut(); return; }
            /* A name already taken (30 Sept 2026): contributors.js refuses
               a username that matches another contributor's, ignoring case
               and spaces at the ends, with its own 409. That is not the
               stale-row 409 below, so its own words are shown instead. */
            if (err.status === 409 && err.data && err.data.duplicate) {
                errorEl.textContent = err.message || "There is already a contributor called that.";
                errorEl.style.display = "block";
                return;
            }
            if (err.status === 409) {
                /* The list is re-read so the next Edit starts from the row
                   as it now is — otherwise it would open the same stale
                   copy and be refused again. The form stays open, so
                   nothing ticked here is lost before it has been seen. */
                errorEl.textContent = "Someone else changed this contributor since you opened it (a credited Missing Pieces lead does this too). Your ticks are still here: note anything you need, then Cancel and Edit again to see the current version.";
                errorEl.style.display = "block";
                await loadContributors();
                return;
            }
            errorEl.textContent = err.message || "Something went wrong saving this.";
            errorEl.style.display = "block";
        }
    });

    async function deleteContributor(id) {
        // Named, so the Yes is to someone in particular (30 Sept 2026).
        const who = workingContributors.find(c => c.id === id);
        const name = who && who.username ? `<strong>${escapeHtml(who.username)}</strong>` : "this contributor";
        if (!await showConfirmDialog(`Delete ${name} from the contributors?`, { danger: true })) return;
        try {
            await Api.deleteContributor(adminToken, id);
            await loadContributors();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            await sayProblem(err.message || "Couldn't delete that — try again.");
        }
    }

    contributorsAddBtn.addEventListener("click", () => requestOpenContributorForm());

    /* js/admin-dead-ends.js announces a lead review that credited somebody,
       so the list here is re-read at once rather than at the next visit to
       the Console panel. Not while the form is open — see showPanel. */
    document.addEventListener("mazerats:contributors-changed", () => {
        if (adminToken && !contributorsFormEl.classList.contains("is-open")) loadContributors();
    });

    // ---------- console: contact messages ----------

    async function loadContactMessages() {
        try {
            workingContactMessages = await Api.getContactMessages(adminToken);
            contactMessagesFailed = "";
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            contactMessagesFailed = err.message || "Couldn't load the messages.";
        }
        renderContactMessagesList();
    }

    /* Kept as state rather than written once, because loadBans redraws this
       list too (for the Ban/Unban buttons) and would otherwise paint "No
       messages yet." straight over the failure a moment after it appeared. */
    let contactMessagesFailed = "";

    function renderContactMessagesList() {
        if (contactMessagesFailed) {
            showLoadFailure(contactMessagesListEl, contactMessagesFailed);
            return;
        }
        contactMessagesListEl.innerHTML = "";
        if (!workingContactMessages.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "No messages yet.";
            contactMessagesListEl.appendChild(empty);
            return;
        }
        workingContactMessages.forEach(msg => {
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row";

            const info = document.createElement("div");
            info.className = "row-info";

            const heading = document.createElement("h3");
            // Built with real DOM nodes rather than innerHTML — unlike
            // contributors (admin-entered), this text comes straight from
            // anonymous public visitors, so it can't be trusted not to
            // contain markup.
            heading.appendChild(document.createTextNode(msg.username || "Anonymous"));
            const when = document.createElement("span");
            when.className = "admin-contributor-count";
            /* UTC with the label, local time on hover, as Activity does
               (1 Oct 2026). It was the reader's own zone with no label. */
            when.textContent = ` - ${formatWhen(msg.createdAt)}`;
            when.title = formatWhenLocal(msg.createdAt);
            heading.appendChild(when);
            if (msg.discord) {
                const discordTag = document.createElement("span");
                discordTag.className = "admin-contributor-count";
                discordTag.textContent = ` · Discord: ${msg.discord}`;
                heading.appendChild(discordTag);
            }
            /* The account the message was SENT from, when the sender was
               signed in — the unique Discord handle, which the server
               checked. msg.discord above is only what they typed, and can
               be anybody's name. */
            if (msg.from && msg.from.username) {
                const fromTag = document.createElement("span");
                fromTag.className = "admin-contributor-count";
                fromTag.textContent = ` · signed in as @${msg.from.username}`;
                heading.appendChild(fromTag);
            }

            const body = document.createElement("p");
            body.className = "row-creator";
            body.textContent = msg.message;

            info.appendChild(heading);
            info.appendChild(body);

            const actions = document.createElement("div");
            actions.className = "admin-row-actions";
            actions.innerHTML = '<button type="button" class="btn admin-delete-btn">Delete</button>';
            actions.querySelector(".admin-delete-btn").addEventListener("click", () => deleteContactMessage(msg.id));

            // Ban/unban the address this message came from. Messages
            // predating IP logging (and any submitted while Netlify did not
            // supply the header — see clientIp in contact.js) have no address
            // to act on, so they get no button rather than a dead one.
            if (msg.ip) {
                const banned = isBanned(msg.ip);
                const banBtn = document.createElement("button");
                banBtn.type = "button";
                banBtn.className = "btn admin-ban-btn";
                banBtn.textContent = banned ? "Unban IP" : "Ban IP";
                banBtn.title = msg.ip;
                banBtn.addEventListener("click", () => (banned ? unbanIp(msg.ip) : banIp(msg.ip)));
                actions.insertBefore(banBtn, actions.firstChild);
            }

            row.appendChild(info);
            row.appendChild(actions);
            contactMessagesListEl.appendChild(row);
        });
    }

    async function deleteContactMessage(id) {
        if (!await showConfirmDialog("Delete this message?", { danger: true })) return;
        try {
            await Api.deleteContactMessage(adminToken, id);
            await loadContactMessages();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            await sayProblem(err.message || "Couldn't delete that — try again.");
        }
    }

    // ---------- landing page state ----------

    // Mirrors the Dev Mode pill in home.html's own pre-load gate (shown
    // there while a logged-in admin roams during Coming Soon/Maintenance)
    // — same pill here in the admin header, plus a link back to home.html
    // so getting to the gated public site is one click either
    // direction. Idempotent (clears any pill it previously added first) so
    // it can just be re-called on every state check/change instead of
    // needing to track whether it's already showing.
    function renderDevModeLink(landingState) {
        const brandGroup = document.querySelector(".brand-group");
        if (!brandGroup) return;
        brandGroup.querySelectorAll(".header-state-pill").forEach(el => el.remove());
        if (landingState === "enter") return;

        const pill = document.createElement("span");
        pill.className = "header-badge header-state-pill";
        pill.textContent = "Dev Mode";

        const homeLink = document.createElement("a");
        homeLink.className = "header-badge header-state-pill header-state-link";
        homeLink.href = "/home";
        homeLink.textContent = "Home";

        brandGroup.appendChild(pill);
        brandGroup.appendChild(homeLink);
    }

    /* ---------- the launch countdown's date ----------

       <input type="datetime-local"> has no timezone. Its value is a bare
       wall-clock string, read and written in whatever the browser's local
       zone is, and the stored setting is an ISO instant in UTC (see
       cleanLaunchAt in netlify/functions/settings.js). These two do the
       conversion explicitly rather than letting Date() guess, because
       letting it guess is how a launch ends up an hour out in March.

       toUtcFields formats the UTC parts by hand for the same reason:
       toISOString().slice(0, 16) would be correct today and is the kind of
       line that gets "tidied up" into toLocaleString later. */
    function isoToLocalField(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        const pad = n => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
               `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }

    // The field holds UTC (the label says so), so the string is read back as
    // UTC rather than through the local-time parse a bare Date() would do.
    function localFieldToIso(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        const d = new Date(raw + ":00Z");
        return isNaN(d.getTime()) ? null : d.toISOString();
    }

    function showLaunchAtStatus(text) {
        if (!launchAtStatus) return;
        launchAtStatus.textContent = text;
        launchAtStatus.style.display = text ? "block" : "none";
    }

    /* Whether the two launch fields hold what is actually stored.

       They are filled by loadLandingState. If that read failed, or came from
       the outage stand-in, they were left EMPTY — and an empty field saved
       is a clear. So pressing Save on a panel whose settings had not loaded
       switched the site's countdown off without anybody having asked for
       that. Until a real read has filled them, neither can be saved. */
    let launchFieldsLoaded = false;
    const LAUNCH_NOT_LOADED = "The current settings didn't load, so this can't be saved safely — reload the page first.";

    /* The saved moment in both zones. The field is UTC and says so, but the
       person reading the confirmation lives in one zone and thinks in it, and
       "08:00 UTC" read as local time is how a launch is announced for the
       wrong hour. */
    function bothZones(iso) {
        const d = new Date(iso);
        const utc = d.toUTCString().replace(" GMT", " UTC");
        const local = d.toLocaleString(undefined, {
            weekday: "short", day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", timeZoneName: "short"
        });
        return utc + " (" + local + " your time)";
    }

    /* clearing: the Clear button, which asks first. Save with the field
       empty is NOT a clear any more — it used to be, silently, which made
       an accidental Save on a blank field the same as deciding there was no
       launch date. */
    /* The launch date is where the boards start, not only the countdown's
       target (1 Oct 2026). daily-scores (launchCut), guess-scores,
       player-profile, players-admin and — with no ffLaunchAt — ff-scores
       all cut there. So once it has passed, Clear puts every pre-launch
       test and practice score back onto the boards, and a move shifts
       where they start; both now say so and ask. A date still ahead is
       moved without a question, as before: nothing counts from it yet.
       currentLaunchAt is what is STORED, kept by loadLandingState,
       relightSwitches and a save here — not what the field holds. */
    let currentLaunchAt = "";
    async function saveLaunchAt(value, clearing) {
        if (!launchFieldsLoaded) { showLaunchAtStatus(LAUNCH_NOT_LOADED); return; }
        if (!clearing && !String(value || "").trim()) {
            showLaunchAtStatus("Pick a date and time first. To remove the launch date, use Clear.");
            return;
        }
        const iso = clearing ? "" : localFieldToIso(value);
        if (iso === null) { showLaunchAtStatus("That is not a date I can read."); return; }
        const storedAt = currentLaunchAt ? Date.parse(currentLaunchAt) : NaN;
        const storedPassed = !isNaN(storedAt) && storedAt <= Date.now();
        /* Clear says what it does to the boards whether or not the date has
           passed (1 Oct 2026, final scan). With no launchAt there is no cut
           at all — launchCut returns null — so clearing a date still AHEAD
           puts the test runs already in the collections onto the boards
           just the same, from the moment the site opens, and ends launch-day
           practice (practiceOf in daily-scores.js). Only the gentle
           wording was shown for that case. */
        if (clearing) {
            const question = "Clear the launch date? The landing page goes back to just saying Coming Soon, and the boards stop cutting at launch, so every test and practice score from before it comes back onto them.";
            if (!await showConfirmDialog(question, { danger: true })) return;
        } else if (storedPassed && Date.parse(iso) !== storedAt) {
            if (!await showConfirmDialog("The launch date (" + escapeHtml(bothZones(currentLaunchAt)) +
                ") has already passed, and every leaderboard counts from it. Move it to " + escapeHtml(bothZones(iso)) +
                "? The boards count from the new moment, so scores between the two drop off them or come back onto them.", { danger: true })) return;
        } else if (!isNaN(storedAt) && !storedPassed && Date.parse(iso) <= Date.now()) {
            /* A date still ahead moved to a moment already gone (1 Oct 2026,
               final fixes) starts the boards counting straight away, from
               that past moment — so it asks, like the two above. */
            if (!await showConfirmDialog("The launch date (" + escapeHtml(bothZones(currentLaunchAt)) +
                ") is still ahead. " + escapeHtml(bothZones(iso)) +
                " has already passed, so the boards will count from it straight away: every score since then goes onto them. Save it?", { danger: true })) return;
        }
        const controls = [launchAtInput, launchAtSave, launchAtClear].filter(Boolean);
        controls.forEach(c => c.disabled = true);
        showLaunchAtStatus("");
        switchSaves++;   // see relightSwitches
        try {
            await Api.updateSiteSettings(adminToken, { launchAt: iso });
            launchAtInput.value = isoToLocalField(iso);
            currentLaunchAt = iso;
            /* A moment already gone has no countdown to it (1 Oct 2026):
               this said "Counting down to …" for a past date, when what the
               save actually did was move where the boards start. */
            showLaunchAtStatus(!iso
                ? "No launch date — the gate just says Coming Soon, and the boards don't cut at launch."
                : Date.parse(iso) <= Date.now()
                    ? "Saved: " + bothZones(iso) + ". That moment has passed, so there's no countdown. The boards count from it."
                    : "Counting down to " + bothZones(iso) + ". The boards will count from then.");
            sayLandingMismatch();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            showLaunchAtStatus(err.message || "Couldn't save the launch date.");
        } finally {
            controls.forEach(c => c.disabled = false);
        }
    }

    if (launchAtSave) launchAtSave.addEventListener("click", () => saveLaunchAt(launchAtInput.value, false));
    // The field is emptied by saveLaunchAt once the clear has saved, not
    // before: blanked up front, a refused clear (a viewer's 403, a dropped
    // connection) left the field reading "no launch date" while the stored
    // one was still counting down.
    if (launchAtClear) launchAtClear.addEventListener("click", () => saveLaunchAt("", true));

    /* ---------- Fallin' Furni's own launch date ----------

       The same field, the same UTC conversion and the same save-then-show
       order as the site countdown above, writing settings.ffLaunchAt. Kept
       as its own function rather than a flag on saveLaunchAt because the
       two say different things once saved: this one does not open anything,
       and the status line says so, since "Fallin' Furni launches at 08:00"
       is exactly the sentence that gets read as "it will open itself". */
    function showFfLaunchAtStatus(text) {
        if (!ffLaunchAtStatus) return;
        ffLaunchAtStatus.textContent = text;
        ffLaunchAtStatus.style.display = text ? "block" : "none";
    }

    // Same rules as saveLaunchAt: no saving fields that never loaded, an
    // empty Save is an error, and Clear asks.
    async function saveFfLaunchAt(value, clearing) {
        if (!launchFieldsLoaded) { showFfLaunchAtStatus(LAUNCH_NOT_LOADED); return; }
        if (!clearing && !String(value || "").trim()) {
            showFfLaunchAtStatus("Pick a date and time first. To remove the launch date, use Clear.");
            return;
        }
        const iso = clearing ? "" : localFieldToIso(value);
        if (iso === null) { showFfLaunchAtStatus("That is not a date I can read."); return; }
        if (clearing && !await showConfirmDialog("Clear Fallin' Furni's launch date? There is then no Launch Week, and its boards count from the site's launch.")) return;
        const controls = [ffLaunchAtInput, ffLaunchAtSave, ffLaunchAtClear].filter(Boolean);
        controls.forEach(c => c.disabled = true);
        showFfLaunchAtStatus("");
        switchSaves++;   // see relightSwitches
        try {
            await Api.updateSiteSettings(adminToken, { ffLaunchAt: iso });
            ffLaunchAtInput.value = isoToLocalField(iso);
            currentFfLaunchAt = iso;
            showFfLaunchAtStatus(iso
                ? "Boards count and Launch Week starts from " + bothZones(iso) +
                  ". The game still opens only when its switch is on Live."
                : "No date — no Launch Week, and the boards count from the site's launch.");
            sayFfMismatch();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            showFfLaunchAtStatus(err.message || "Couldn't save the Fallin' Furni launch date.");
        } finally {
            controls.forEach(c => c.disabled = false);
        }
    }

    if (ffLaunchAtSave) ffLaunchAtSave.addEventListener("click", () => saveFfLaunchAt(ffLaunchAtInput.value, false));
    // Emptied by saveFfLaunchAt once the clear has saved, not before — the
    // same reason as the site countdown's Clear above.
    if (ffLaunchAtClear) ffLaunchAtClear.addEventListener("click", () => saveFfLaunchAt("", true));

    /* The Fallin' Furni switch and its launch date, checked against each
       other.

       They are separate on purpose — the date does not open the game (see
       the note in warren.html) — which means they can disagree, and each
       disagreement is a mistake that looks fine from either control alone:
       Live with the launch still ahead lets people play before the boards
       count, so the first days' runs vanish from them; closed with the
       launch passed means Launch Week is running on a game nobody can
       reach. Said under the switch whenever either changes, and on load. */
    let currentFfState = "";
    let currentFfLaunchAt = "";

    /* Written to #ff-state-warning, not to the switch's status line. The two
       shared #ff-state-status, so a failed save's error was blanked by the
       next recompute and the warning vanished whenever a save cleared the
       line for its own answer. */
    function sayFfMismatch() {
        if (!ffMismatchEl || !currentFfState) return;
        const at = currentFfLaunchAt ? new Date(currentFfLaunchAt).getTime() : NaN;
        let warning = "";
        if (!isNaN(at)) {
            if (currentFfState === "live" && at > Date.now()) {
                warning = "Heads up: Fallin' Furni is Live, but its launch date is still ahead (" +
                    bothZones(currentFfLaunchAt) + "). Players can play now, and their runs won't count on the boards until then.";
            } else if (currentFfState !== "live" && at <= Date.now()) {
                warning = "Heads up: Fallin' Furni's launch date has passed, but its switch isn't on Live — Launch Week is running on a game players can't open.";
            }
        }
        ffMismatchEl.textContent = warning;
        ffMismatchEl.style.display = warning ? "block" : "none";
    }

    /* The site's switch against its launch date (1 Oct 2026), the same idea
       as sayFfMismatch. The boards follow launchAt, not the switch, so:
       Live with the date still ahead lets everyone in while every game they
       play is practice and never reaches a board; Coming Soon with the date
       passed leaves the landing page on a plain Coming Soon — its countdown
       goes at zero now (countdownGone in js/welcome.js; this said "any
       moment", which it no longer does) — and nothing in this panel saying
       the switch is the thing still to do. Maintenance is not warned about: after launch it is the normal
       way to close for a while, and the gate shows no countdown in it (see
       showCountdownFor in js/welcome.js). Kept in step by loadLandingState,
       relightSwitches, both saves, and the tab and minute timer below. */
    let currentLandingState = "";
    function sayLandingMismatch() {
        if (!landingMismatchEl) return;
        const at = currentLaunchAt ? Date.parse(currentLaunchAt) : NaN;
        let warning = "";
        if (currentLandingState && !isNaN(at)) {
            if (currentLandingState === "enter" && at > Date.now()) {
                warning = "Heads up: the site is Live, but its launch date is still ahead (" +
                    bothZones(currentLaunchAt) + "). Games played before then are practice and won't reach the boards.";
            } else if (currentLandingState === "coming-soon" && at <= Date.now()) {
                warning = "Heads up: the launch date has passed, but the site is still closed. Visitors see Coming Soon, with no countdown, until you press Live.";
            }
        }
        landingMismatchEl.textContent = warning;
        landingMismatchEl.style.display = warning ? "block" : "none";
    }
    if (landingMismatchEl) {
        const landingWarningTab = landingMismatchEl.closest(".admin-tab");
        if (landingWarningTab) {
            ["mouseenter", "focusin", "click"].forEach(type =>
                landingWarningTab.addEventListener(type, sayLandingMismatch));
        }
        setInterval(() => {
            if (landingMismatchEl.getClientRects().length || (landingWarningTab && landingWarningTab.matches(".is-open, :hover, :focus-within"))) {
                sayLandingMismatch();
            }
        }, 60000);
    }

    /* The warning depends on the clock as well as on the two settings: a
       panel left open across the launch moment went on saying "still ahead"
       about a date that had passed, because it was only worked out on load
       and on a save. So it is worked out again whenever the tab holding it
       is shown (hover, focus or a tap — see the Nav and Control tabs near
       the top), and once a minute while it is on screen. A hidden panel is
       skipped; showing it recomputes anyway. */
    if (ffMismatchEl) {
        const ffWarningTab = ffMismatchEl.closest(".admin-tab");
        if (ffWarningTab) {
            ["mouseenter", "focusin", "click"].forEach(type =>
                ffWarningTab.addEventListener(type, sayFfMismatch));
        }
        setInterval(() => {
            if (ffMismatchEl.getClientRects().length || (ffWarningTab && ffWarningTab.matches(".is-open, :hover, :focus-within"))) {
                sayFfMismatch();
            }
        }, 60000);
    }

    /* The switches are lit from a read PAST the edge (30 Sept 2026).
       Api.getSiteSettings goes through the plain /settings address, which
       the CDN holds for twenty seconds (GATE_CDN_CACHE in _cache.js), so a
       reload straight after throwing a switch could light the state it had
       just left. This asks the way js/welcome.js's poll does — a ?fresh=
       the function ignores and the CDN keys on, and cache: "no-store" for
       the browser's own copy — with the time to the millisecond rather
       than a ten-second bucket: there are only ever a few admins, and a
       ten-second-old answer is the very thing being avoided. A read that
       fails falls back to getSiteSettings, stand-in and all, as before. */
    /* Bounded (30 Sept 2026): a bare fetch has no time limit of its own,
       and one that hung (a cold function stuck behind a slow database)
       left the switches unlit and the launch fields unsavable with nothing
       said, where Api's own reads give up and fall back. Aborted, it falls
       back to getSiteSettings below like any other failure. */
    const FRESH_SETTINGS_TIMEOUT_MS = 8000;
    async function freshSiteSettings() {
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), FRESH_SETTINGS_TIMEOUT_MS) : null;
        try {
            const res = await fetch(`/.netlify/functions/settings?fresh=${Date.now()}`,
                controller ? { cache: "no-store", signal: controller.signal } : { cache: "no-store" });
            if (res.ok) {
                const body = await res.json();
                if (body && typeof body.landingState === "string" && body.landingState) {
                    // What getSiteSettings would have done with a real answer.
                    if (typeof Api.rememberLandingState === "function") Api.rememberLandingState(body.landingState);
                    /* Only when it is a different theme (1 Oct 2026, final
                       scan). This read now also runs on opening Control
                       (relightSwitches), and applyTheme sets data-theme
                       even to the value it already has — which the Recolour
                       editor's observer (watchTheme) takes as a theme
                       change: a full stylesheet rescan and a redraw of the
                       editor under whoever was working in it, every time
                       the pointer crossed the Control tab. */
                    const shown = document.documentElement.getAttribute("data-theme") || "classic";
                    if (body.theme && body.theme !== shown && typeof Api.applyTheme === "function") Api.applyTheme(body.theme);
                    return body;
                }
            }
        } catch (e) { /* falls back below */ } finally {
            if (timer) clearTimeout(timer);
        }
        return Api.getSiteSettings();
    }

    const SETTINGS_UNREAD = "Couldn't read the current site settings — reload to see which mode is on.";
    let settingsTriedAt = 0;   // when loadLandingState last set off — see the Control tab
    async function loadLandingState() {
        /* switchSaves, as relightSwitches uses it (1 Oct 2026, final scan):
           this read can now also be set off by opening Control after a
           failed first read (see the Control tab below), and a switch
           pressed while it was out must not be relit by its older answer. */
        const saves = switchSaves;
        settingsTriedAt = Date.now();
        try {
            // One read, every switch: they all live in the same settings document.
            const { landingState, fallinFurniState, theme, palette: livePalette, launchAt, ffLaunchAt, fromCache } = await freshSiteSettings();
            /* The stand-in getSiteSettings answers with during an outage
               (fromCache, see js/api.js) has a GUESSED landing state and no
               Fallin' Furni state or palette at all. Lighting buttons from it
               would show this admin a site state that may not be the real
               one — "Live" highlighted on a site that is actually closed —
               so nothing is lit and the reason is said instead. */
            if (fromCache) {
                launchFieldsLoaded = false;
                landingToggleStatus.textContent = SETTINGS_UNREAD;
                landingToggleStatus.style.display = "block";
                return;
            }
            const raced = saves !== switchSaves;
            // A launch-date save can only have raced this once the fields
            // were loaded (see saveLaunchAt), so unloaded ones are filled.
            if (!raced || !launchFieldsLoaded) {
                if (launchAtInput) launchAtInput.value = isoToLocalField(launchAt);
                if (ffLaunchAtInput) ffLaunchAtInput.value = isoToLocalField(ffLaunchAt);
                currentLaunchAt = launchAt || "";
                currentFfLaunchAt = ffLaunchAt || "";
            }
            // Only now do the two fields say what is stored — see
            // launchFieldsLoaded.
            launchFieldsLoaded = true;
            switchesReadAt = Date.now();
            // The failed first read's "Couldn't read…" line, now untrue.
            if (landingToggleStatus.textContent === SETTINGS_UNREAD) landingToggleStatus.style.display = "none";
            if (!raced) {
                landingToggleBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.state === landingState));
                renderDevModeLink(landingState);
                currentLandingState = landingState || "";
                const ff = fallinFurniState || "live";
                ffToggleBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.ffState === ff));
                currentFfState = ff;
            }
            sayLandingMismatch();
            sayFfMismatch();
            // getSiteSettings has already applied the palette to this page —
            // this only lights the button that matches what is stored.
            // Whatever is stored, if a button offers it. This used to know
            // only purple, so with Pumpkin, Witching Hour or Crimson on the
            // site the panel lit Classic — the one palette that was not on.
            // Now one of two rows (28 Sept 2026): a live saved palette is
            // lit instead of its theme — see lightPaletteCard.
            siteTheme = offeredTheme(theme);
            sitePalette = livePalette || null;
            lightPaletteCard();
            loadSavedPalettes();
        } catch (e) {
            // best-effort — the toggles just won't show anything highlighted.
            // The launch fields are empty, not loaded, so they stay unsavable.
            launchFieldsLoaded = false;
        }
    }

    /* After a switch save that failed WITHOUT an answer (30 Sept 2026) — a
       timeout, a dropped connection, a 5xx — the write may still have
       landed: a slow cold function answers after the page has given up. The
       buttons kept lighting the state it had left, so on launch morning a
       Live that had in fact gone through read as "still Soon" beside an
       error, and there was nothing to say which was true. The two switches
       are re-read and lit from what is stored. Only the switches: the
       launch-date fields may hold a date being typed, and are left alone.
       A read that fails, or gets the outage stand-in, lights nothing. */
    /* Also used when the Control tab is opened (1 Oct 2026): the switches
       were read once, at sign-in, so with two admins one could flip Live
       and the other's panel went on lighting Soon — and its Live confirm
       then offered to open a site that was already open. The stored dates
       are taken too, for the warnings and the launch date's questions, but
       never written into the fields.

       switchSaves is bumped by every switch save, so a read that set off
       before one and lands after it cannot light the state it replaced. */
    let switchesReadAt = 0;
    let switchSaves = 0;
    async function relightSwitches() {
        const saves = switchSaves;
        try {
            const s = await freshSiteSettings();
            if (!s || s.fromCache || typeof s.landingState !== "string") return;
            if (saves !== switchSaves) return;
            switchesReadAt = Date.now();
            landingToggleBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.state === s.landingState));
            renderDevModeLink(s.landingState);
            currentLandingState = s.landingState;
            if (launchFieldsLoaded) currentLaunchAt = s.launchAt || "";
            sayLandingMismatch();
            const ff = s.fallinFurniState || "live";
            ffToggleBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.ffState === ff));
            currentFfState = ff;
            if (launchFieldsLoaded) currentFfLaunchAt = s.ffLaunchAt || "";
            sayFfMismatch();
        } catch (e) { /* the error already said is all there is to say */ }
    }
    const answerless = err => !err || !err.status || err.status >= 500;

    // The Control tab: re-read on opening, at most every 30 seconds, and not
    // while a switch is mid-save (its buttons are disabled then).
    const SWITCH_REREAD_MS = 30000;
    const controlTabEl = document.querySelector('.admin-tab[data-menu="control"]');
    if (controlTabEl) {
        ["mouseenter", "focusin", "click"].forEach(type => controlTabEl.addEventListener(type, () => {
            if (!adminToken) return;
            /* A sign-in whose settings read failed (1 Oct 2026, final scan):
               a cold function or the outage stand-in left the switches
               unlit, the launch fields unsavable and switchesReadAt at 0,
               which this check used to read as "never re-read" — so the one
               panel most in need of a fresh look never got one, short of a
               reload, on launch morning of all times. The whole first read
               is tried again instead, at most every 30 seconds. */
            if (!launchFieldsLoaded) {
                if (Date.now() - settingsTriedAt < SWITCH_REREAD_MS) return;
                loadLandingState();
                return;
            }
            if (!switchesReadAt || Date.now() - switchesReadAt < SWITCH_REREAD_MS) return;
            if (Array.from(landingToggleBtns).concat(Array.from(ffToggleBtns)).some(b => b.disabled)) return;
            switchesReadAt = Date.now();   // one read per opening, not one per event
            relightSwitches();
        }));
    }

    // Returns whether the update actually went through, so callers that
    // show a follow-up success message (see the offline-confirmation flow
    // below) know not to show one after a failed save.
    async function setLandingState(state, clickedBtn) {
        landingToggleBtns.forEach(b => b.disabled = true);
        landingToggleStatus.style.display = "none";
        switchSaves++;
        try {
            await Api.updateSiteSettings(adminToken, { landingState: state });
            landingToggleBtns.forEach(b => b.classList.toggle("active", b === clickedBtn));
            renderDevModeLink(state);
            currentLandingState = state;
            sayLandingMismatch();
            return true;
        } catch (err) {
            if (err.status === 401) { lockOut(); return false; }
            landingToggleStatus.textContent = err.message || "Couldn't update the landing page.";
            landingToggleStatus.style.display = "block";
            if (answerless(err)) relightSwitches();
            return false;
        } finally {
            landingToggleBtns.forEach(b => b.disabled = false);
        }
    }

    // Coming Soon / Maintenance take the live site offline for every
    // visitor, so they get a two-step "are you sure" before actually
    // switching. Enter (Live) only needs one — it's the safe/undo
    // direction, but still worth a single check since it re-opens the site.
    // Each ends with a confirmation once the switch has actually happened.
    const LANDING_STATE_MESSAGES = {
        "coming-soon": {
            confirmSteps: ["You're about to take Maze Rats offline! Are you sure?", "Sure you're sure?"],
            success: "Coming soon mode activated. Website closed to visitors."
        },
        "maintenance": {
            confirmSteps: ["You're about to take Maze Rats offline! Are you sure?", "Sure you're sure?"],
            success: "Maintenance mode activated. Website closed to visitors."
        },
        "enter": {
            confirmSteps: ["You're about to bring Maze Rats back online! Are you sure?"],
            /* "Within a minute" (1 Oct 2026), not "open": the public settings
               read is edge-cached, so for up to about a minute some visitors
               are still told Coming Soon. Nobody is stranded — the landing
               page's own poll lets them in — but "open" read as instant. */
            success: "Live mode activated. The site opens for every visitor within a minute; anyone on the landing page is let in by itself."
        }
    };
    /* "Back online" is for Maint. → Live. From Coming Soon — the first
       opening, launch morning — it has never been online to come back
       (1 Oct 2026). Unknown (the read failed) keeps the old wording. */
    const FIRST_OPENING_CONFIRM = "You're about to open Maze Rats to everyone! Are you sure?";
    function landingConfirmSteps(state, config) {
        if (state === "enter" && currentLandingState === "coming-soon") return [FIRST_OPENING_CONFIRM];
        return config.confirmSteps;
    }

    /* ---- Fallin' Furni: live or under maintenance

       Deliberately lighter than the landing switch above. That one takes the
       whole site off the internet and asks twice; this one closes one game
       page, is reversible in a click, and does not close the site — so it
       confirms once on the way down and not at all on the way back up. */
    async function setFallinFurniState(state, clickedBtn) {
        ffToggleBtns.forEach(b => b.disabled = true);
        ffToggleStatus.style.display = "none";
        switchSaves++;
        try {
            await Api.updateSiteSettings(adminToken, { fallinFurniState: state });
            ffToggleBtns.forEach(b => b.classList.toggle("active", b === clickedBtn));
            currentFfState = state;
            sayFfMismatch();
            return true;
        } catch (err) {
            // The same expired-session handling as the landing switch above.
            // Without it an expired token showed as "Couldn't update" under
            // the buttons, with nothing to say that logging in again was the
            // whole of the fix.
            if (err.status === 401) { lockOut(); return false; }
            ffToggleStatus.textContent = err.message || "Couldn't update Fallin' Furni.";
            ffToggleStatus.style.display = "block";
            if (answerless(err)) relightSwitches();
            return false;
        } finally {
            ffToggleBtns.forEach(b => b.disabled = false);
        }
    }

    /* ---- The site's palette: classic brown or deep purple.

       Lighter again than the Fallin' Furni switch above, and deliberately so.
       That one closes a page; this one changes a colour. Nothing goes
       offline, nothing becomes unreachable, and the way back is the button
       next to it — so there is no confirmation at all.

       Applied to THIS page the moment it saves, rather than only on the next
       load, because the person pressing it is the one person who needs to see
       what they just chose. Everyone else picks it up on their next page
       load, which is when every page reads the palette in its <head>.

       ------------------------------------------------------------------
       AND THE SAVED PALETTES (28 Sept 2026)

       The card has a second row: every palette saved in the Recolour
       panel, one button each. Before this nothing on the Warren could set
       settings.palette at all, so a palette could be made, saved and
       previewed, and never go live.

       ONE THING IS LIT. The site wears a built-in theme and, optionally, a
       palette on top of it. With no palette the theme's button is lit; with
       one, the palette's button is — and its theme is not, because that is
       not a choice anybody made separately: it comes with the palette (see
       baseThemeOf). Pressing a theme takes any palette off; pressing a
       palette sets both. Either way it is ONE settings PUT carrying both
       fields, so a visitor can never load the page between the two halves.

       No confirmation, the same as the theme buttons: it changes a colour,
       and the way back is the button next to it. */
    let siteTheme = "classic";        // settings.theme, as a button offers it
    let sitePalette = null;           // settings.palette: a saved palette's id, or null
    let savedPalettes = [];           // the Recolour panel's list, as palettes.js answers it
    let savedPalettesRead = false;    // false until a read has succeeded
    let savedPalettesSeq = 0;
    const PALETTES_EMPTY_TEXT = paletteToggleEmpty ? paletteToggleEmpty.textContent : "";

    // Whatever is stored, if a button offers it; Classic otherwise.
    function offeredTheme(theme) {
        return Array.from(themeToggleBtns).some(btn => btn.dataset.themeState === theme) ? theme : "classic";
    }
    function themeLabel(theme) {
        const btn = Array.from(themeToggleBtns).find(b => b.dataset.themeState === theme);
        return btn ? btn.textContent.trim() : theme;
    }

    /* WHICH THEME A PALETTE IS WORN OVER.

       A palette stores only what differs from the stylesheet that was
       running while it was edited — and the Recolour editor previews on
       this very page, so that is style.css plus whichever built-in theme
       this page was wearing. The editor records that theme on the palette
       as baseTheme when it saves (see baseThemeNow in js/admin-recolour.js,
       and palettes.js), and wearing it over the same theme reproduces what
       the editor showed. Anything else would not: every colour the palette
       leaves alone would be a different theme's, and a colour it changed
       that only exists in that theme's sheet would find nothing to paint.

       NOT basedOn. That field says where the COLOURS came from — a copy of
       Pumpkin loaded into the editor is "theme-pumpkin" — but the loader
       builds that copy as overrides on CLASSIC (convertTheme reads the
       theme back into Classic's colours), so its right base is whatever
       the editor was wearing, usually Classic, not Pumpkin.

       Palettes saved before baseTheme existed come back as "classic" from
       palettes.js. That is what they were judged against: until today the
       editor told anybody working over a theme to switch to Classic first,
       because the theme painted over the preview. A name no button offers
       falls back to Classic too, so a stale one can never block going live
       (settings.js would refuse it). */
    function baseThemeOf(p) {
        return offeredTheme(p && p.baseTheme);
    }

    /* The swatch: the palette's own accent if it set one — the amber token
       first, as the colour the site's accents are drawn in, then the
       buttons' light anchor — and otherwise its base theme's dot, since an
       untouched accent IS that theme's. Checked as a colour before it goes
       anywhere near a style. */
    const SWATCH_COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$/i;
    function accentOf(p) {
        const pal = (p && p.palette) || {};
        const vars = pal.vars || {};
        const art = (pal.sprites && pal.sprites.buttons) || {};
        const own = [vars["--amber"], vars["--amber-bright"], art.light].find(c => c && SWATCH_COLOUR.test(String(c).trim()));
        if (own) return String(own).trim();
        const btn = Array.from(themeToggleBtns).find(b => b.dataset.themeState === baseThemeOf(p));
        const dot = btn && btn.querySelector(".theme-dot");
        return dot ? dot.style.background : "";
    }

    function paletteButtons() {
        return paletteToggleRow ? Array.from(paletteToggleRow.querySelectorAll(".palette-btn")) : [];
    }
    function paletteCardButtons() {
        return Array.from(themeToggleBtns).concat(paletteButtons());
    }

    /* A live palette that is not in the list (deleted since, by a delete
       that did not report clearing it) counts as none: the card shows the
       theme the site has fallen back to rather than lighting nothing. Until
       the list has been read at all there is no telling, and nothing in the
       palette row is lit. */
    function lightPaletteCard() {
        const known = savedPalettesRead ? savedPalettes.some(p => p.id === sitePalette) : !!sitePalette;
        const live = sitePalette && known ? sitePalette : null;
        themeToggleBtns.forEach(btn => btn.classList.toggle("active", !live && btn.dataset.themeState === siteTheme));
        paletteButtons().forEach(btn => btn.classList.toggle("active", btn.dataset.paletteId === live));
    }

    // Built with the DOM rather than a string: a palette's name is typed by
    // an admin and is not markup.
    function renderSavedPalettes() {
        if (!paletteToggleRow) return;
        paletteToggleRow.textContent = "";
        for (const p of savedPalettes) {
            if (!p || !p.id) continue;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn-enter-mini palette-btn";
            btn.dataset.paletteId = p.id;
            btn.title = "Put “" + p.name + "” live, over the " + themeLabel(baseThemeOf(p)) +
                " theme it was made on. Reaches visitors on their next page load.";
            const dot = document.createElement("i");
            dot.className = "theme-dot";
            dot.style.background = accentOf(p);
            btn.append(dot, document.createTextNode(p.name || p.id));
            btn.addEventListener("click", () => setSkin(baseThemeOf(p), p));
            paletteToggleRow.appendChild(btn);
        }
        const any = paletteButtons().length > 0;
        paletteToggleRow.style.display = any ? "" : "none";
        if (paletteToggleEmpty) paletteToggleEmpty.style.display = any ? "none" : "";
        lightPaletteCard();
    }

    // The same list the Recolour panel reads, through Api.getPalettes.
    async function loadSavedPalettes() {
        const seq = ++savedPalettesSeq;
        try {
            const list = await Api.getPalettes(adminToken);
            if (seq !== savedPalettesSeq) return;
            savedPalettes = list;
            savedPalettesRead = true;
            if (paletteToggleEmpty) paletteToggleEmpty.textContent = PALETTES_EMPTY_TEXT;
        } catch (e) {
            if (seq !== savedPalettesSeq) return;
            savedPalettesRead = false;
            savedPalettes = [];
            if (paletteToggleEmpty) paletteToggleEmpty.textContent = "Couldn't read the saved palettes — reload to try again.";
        }
        renderSavedPalettes();
    }

    /* The one write behind every button on the card: a theme, and a palette
       or none. Returns whether it went through. */
    async function setSkin(theme, palette) {
        const buttons = paletteCardButtons();
        buttons.forEach(b => b.disabled = true);
        themeToggleStatus.style.display = "none";
        try {
            await Api.updateSiteSettings(adminToken, { theme, palette: palette ? palette.id : "" });
            siteTheme = theme;
            sitePalette = palette ? palette.id : null;
            lightPaletteCard();
            Api.applyTheme(theme);
            /* This page shows the THEME only. The Warren does not wear the
               live palette — it is where palettes are edited, and the
               Recolour panel's live preview paints this page with the one
               being worked on — so it says where to look instead. */
            if (palette) {
                themeToggleStatus.textContent = "“" + (palette.name || palette.id) + "” is live, over " +
                    themeLabel(theme) + ". This panel shows " + themeLabel(theme) +
                    " alone; open the site to see the palette.";
                themeToggleStatus.style.display = "block";
            }
            return true;
        } catch (err) {
            if (err.status === 401) { lockOut(); return false; }
            // Deleted in another tab since the list was read: re-read it,
            // so the button goes away along with the palette.
            if (err.status === 404 && palette) loadSavedPalettes();
            themeToggleStatus.textContent = err.message || "Couldn't change the palette.";
            themeToggleStatus.style.display = "block";
            return false;
        } finally {
            paletteCardButtons().forEach(b => b.disabled = false);
        }
    }

    themeToggleBtns.forEach(btn => {
        btn.addEventListener("click", () => setSkin(btn.dataset.themeState, null));
    });

    /* Saved, renamed or deleted in the Recolour panel: js/admin-recolour.js
       announces its fresh list, and the card redraws from it without a
       second read. A delete that took the live palette off says so
       (clearedLive, from palettes.js), and the card falls back to the theme
       the site is now wearing alone. */
    window.addEventListener("mazerats:palettes-changed", e => {
        const d = (e && e.detail) || {};
        if (d.clearedLive) {
            sitePalette = null;
            Api.forgetSiteSettings();
            themeToggleStatus.textContent = "The live palette was deleted, so the site is back on " + themeLabel(siteTheme) + " alone.";
            themeToggleStatus.style.display = "block";
        }
        if (Array.isArray(d.palettes)) {
            savedPalettesSeq++;          // a read still in flight is older than this
            savedPalettes = d.palettes;
            savedPalettesRead = true;
            if (paletteToggleEmpty) paletteToggleEmpty.textContent = PALETTES_EMPTY_TEXT;
            renderSavedPalettes();
        } else if (adminToken) {
            loadSavedPalettes();
        }
    });

    /* What each closed state says on the way in and once it is set. Keyed
       rather than branched, so adding a fourth wording is a row here instead
       of another arm of an if — which is what this was before "coming soon"
       turned the one closed state into two. "live" is absent on purpose: it
       opens the game, it is reversible in a click, and it asks nothing. */
    const FF_STATE_MESSAGES = {
        "coming-soon": {
            confirm: "Set Fallin' Furni to coming soon? Players will see a “Coming soon!” notice instead of the game.",
            done: "Fallin' Furni is marked coming soon. You can still play and edit it while signed in."
        },
        "maintenance": {
            confirm: "Put Fallin' Furni into maintenance? Players will see a notice instead of the game.",
            done: "Fallin' Furni is under maintenance. You can still play and edit it while signed in."
        }
    };

    ffToggleBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
            const state = btn.dataset.ffState;
            const messages = FF_STATE_MESSAGES[state];
            if (messages) {
                const ok = await showConfirmDialog(messages.confirm);
                if (!ok) return;
            }
            const ok = await setFallinFurniState(state, btn);
            // Its own heading: showInfoDialog's default is the landing page's.
            if (ok && messages) await showInfoDialog(messages.done, "Fallin' Furni Updated");
        });
    });

    landingToggleBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
            const state = btn.dataset.state;
            const config = LANDING_STATE_MESSAGES[state];
            if (!config) {
                setLandingState(state, btn);
                return;
            }
            for (const message of landingConfirmSteps(state, config)) {
                const ok = await showConfirmDialog(message);
                if (!ok) return;
            }
            const succeeded = await setLandingState(state, btn);
            if (succeeded) await showInfoDialog(config.success);
        });
    });

    // ---------- wire up ----------

    logoutBtn.addEventListener("click", doLogout);

    // The scan runs as a background job, so nothing comes back on the
    // request that starts it — progress is polled from furni-scan-status
    // and drawn into the bar until the run reports itself finished.
    let furniPollTimer = null;
    // Polls that came back with nothing at all, in a row. A background
    // function takes a few seconds to cold-start and write its first
    // progress record, during which the status endpoint honestly reports
    // nothing running — so give it a window before concluding there is no
    // job, rather than stopping on the first empty answer.
    let furniEmptyPolls = 0;
    const FURNI_EMPTY_POLL_LIMIT = 48; // ~2 minutes at 2.5s
    // Which run the bar is currently following. Progress lives in ONE record
    // that every run overwrites, so until the new background function has
    // cold-started and stamped its own id on it, that record still describes
    // the PREVIOUS run — finished, and possibly failed. Without this the
    // first poll after clicking Scan read the old record, saw a finished run
    // with an error on it, and announced "Scan failed" a second after a
    // perfectly healthy scan had been started. null means "adopt whatever is
    // genuinely running", used when the page is reloaded mid-scan.
    let furniRunId = null;

    function renderFurniProgress(p) {
        furniProgress.hidden = false;
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        furniProgressFill.style.width = pct + "%";
        if (p.current && !p.total) {
            // Still setting up — the catalogue and sprite library load
            // before there is any denominator to show.
            furniProgressLabel.textContent = p.current;
        } else {
            const name = p.current ? String(p.current).split("/").pop() : "";
            furniProgressLabel.textContent = p.done + " of " + p.total + " room images (" + pct + "%)" +
                (name ? " — " + name : "") + (p.errors ? " · " + p.errors + " failed" : "");
        }
    }

    async function pollFurniProgress() {
        // Signed out (or locked out) since the timer was set: nothing to
        // ask, and asking with no token is just a 401 — see lockOut.
        if (!adminToken) { stopFurniPolling(); return; }
        const askedWith = adminToken;
        try {
            const p = await Api.furniScanStatus(adminToken);
            // The session ended while this was in flight; its answer is
            // for a page that is no longer signed in.
            if (adminToken !== askedWith) return;
            // Someone else's record — the run we started hasn't written yet.
            // Treated as nothing reported in, so the cold-start grace below
            // applies rather than the previous run's outcome being shown.
            const foreign = furniRunId && p && p.runId !== furniRunId;
            // On a page reload there is no run to match against, so only a
            // record that is actually still going is worth picking up; a
            // finished or failed one is last time's news and stays quiet.
            if (!furniRunId && p && !p.running) {
                stopFurniPolling();
                furniProgress.hidden = true;
                return;
            }
            if (!p || foreign || (!p.running && !p.total)) {
                if (++furniEmptyPolls >= FURNI_EMPTY_POLL_LIMIT) {
                    stopFurniPolling();
                    furniScanStatus.style.display = "block";
                    furniScanStatus.textContent = "No scan reported in after two minutes. " +
                        "The scan runs on your own machine — check the dev server window for an " +
                        "error, and that the sprite cache finished downloading.";
                    furniProgress.hidden = true;
                }
                return;
            }
            furniEmptyPolls = 0;
            renderFurniProgress(p);
            if (!p.running) {
                stopFurniPolling();
                furniScanStatus.style.display = "block";
                if (p.error) {
                    // The run recorded a failure rather than finishing — say
                    // so, instead of reporting a crash as a completed scan.
                    furniProgress.hidden = true;
                    furniScanStatus.textContent = "Scan failed: " + p.error;
                } else {
                    /* "0 new furni" is a real and useful answer for an
                       additive run — it means FurniIndex has nothing to add
                       yet — so the count is always stated rather than being
                       left to "reopen a maze and look". ("furni" is already
                       plural, hence not going through plural().) */
                    const parts = [plural(p.done, "room image")];
                    if (typeof p.found === "number") {
                        parts.push(p.found + (p.additive ? " new furni" : " furni"));
                    }
                    if (p.errors) parts.push(p.errors + " failed");
                    furniScanStatus.textContent = "Scan finished — " + parts.join(", ") +
                        ". Reopen a maze to see what it found.";
                }
            }
        } catch (err) {
            // Only the session this poll was asked under can be expired by
            // it — a 401 landing after a logout must not put "Session
            // expired" into a login box nobody's session ran out in.
            /* And a 401 for a token that has since been REPLACED is not the
               end of anything: changing your own password retires every
               session, this poll's included, and hands the page a new
               token. Stopping here froze the progress bar half-way through a
               healthy scan. That stale answer is skipped; the next tick asks
               with the new token. Only no token at all stops the polling. */
            if (err.status === 401) {
                if (adminToken === askedWith) lockOut();
                else if (!adminToken) stopFurniPolling();
                return;
            }
            // 503: the database could not be asked who this is (_auth.js's
            // AUTH_UNAVAILABLE). A blip, not an answer — keep polling.
            if (err.status === 503) return;
            stopFurniPolling();
        }
    }

    function startFurniPolling(runId = null) {
        clearInterval(furniPollTimer);
        furniRunId = runId;
        furniEmptyPolls = 0;
        pollFurniProgress();
        furniPollTimer = setInterval(pollFurniProgress, 2500);
    }

    // Unique per click, so two admins scanning at once can each tell whether
    // the record belongs to their run.
    function newFurniRunId() {
        return Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    }

    function stopFurniPolling() {
        clearInterval(furniPollTimer);
        furniPollTimer = null;
    }

    function roomsWithImages() {
        return workingRooms.filter(r => (r.gallery || []).length || (r.entrance && r.entrance.image));
    }

    function countImages(rooms, onlyUnscanned) {
        return rooms.reduce((n, r) => {
            const imgs = [
                ...(r.entrance && r.entrance.image ? [r.entrance.image] : []),
                ...(r.gallery || []).map(g => g.image).filter(Boolean)
            ];
            const already = r.furni || {};
            return n + (onlyUnscanned ? imgs.filter(i => !already[i]).length : imgs.length);
        }, 0);
    }

    /* Roughly how long a scan of N images takes on this machine, in whole
       minutes. Measured, not guessed: a full 562-image run took 15 minutes
       across 16 workers, which is about 1.6 seconds per image once the
       sprite library is already cached. The first run after the catalogue
       changes is slower, because it refills that library first. */
    function scanMinutes(images) {
        return Math.max(1, Math.round((images * 1.6) / 60));
    }

    function plural(n, word) {
        return n + " " + word + (n === 1 ? "" : "s");
    }

    /* One shape for every scan confirmation: the question, then how long it
       takes, then what happens to the furni already recorded. That last line
       is the one that matters — the three scans differ almost entirely in
       what they do to existing data, and a dialog that buried it left the
       destructive option looking the same as the safe one. */
    function scanConfirm(question, images, consequence) {
        const mins = scanMinutes(images);
        return `<strong>${question}</strong><br><br>` +
               `${plural(images, "room image")}, about ${plural(mins, "minute")} on this PC.<br>` +
               `${consequence}`;
    }

    /* The three sidebar scans. They run the same job over the same images and
       differ only in what they do with what is already there:

         full       replace every scanned entry with this run's findings
         additive   change nothing; add only furni not already listed
         unscanned  skip any image that already has a result at all

       "additive" exists because FurniIndex's catalogue is still being filled
       in: furni that was always in a room becomes findable months later, and
       there needs to be a way to pick it up without discarding results that
       have since been corrected by hand. */
    const SCAN_MODES = {
        full: {
            onlyUnscanned: false, additive: false,
            question: "Rescan every room image for furni?",
            consequence: "Everything currently listed is replaced by what this run finds. " +
                         "Furni you added by hand is kept.",
            empty: "No mazes have room images to scan yet."
        },
        additive: {
            onlyUnscanned: false, additive: true,
            question: "Look for furni that isn't listed yet?",
            consequence: "Nothing already listed is changed or removed — this only adds furni " +
                         "FurniIndex can match now but couldn't before.",
            empty: "No mazes have room images to scan yet."
        },
        unscanned: {
            onlyUnscanned: true, additive: false,
            question: "Scan the room images that have never been scanned?",
            consequence: "Images that already have a result are left alone.",
            empty: "Every room image has already been scanned."
        }
    };

    async function startFurniScan(modeName) {
        const mode = SCAN_MODES[modeName];
        const rooms = roomsWithImages();
        const images = countImages(rooms, mode.onlyUnscanned);
        if (!images) {
            furniScanStatus.style.display = "block";
            furniScanStatus.textContent = mode.empty;
            return;
        }
        const ok = await showConfirmDialog(scanConfirm(mode.question, images, mode.consequence));
        if (!ok) return;
        furniScanStatus.style.display = "none";
        furniProgress.hidden = false;
        furniProgressFill.style.width = "0%";
        furniProgressLabel.textContent = "Starting…";
        try {
            const runId = newFurniRunId();
            await Api.scanFurni(adminToken, {
                ids: rooms.map(r => r.id),
                onlyUnscanned: mode.onlyUnscanned,
                additive: mode.additive,
                runId
            });
            startFurniPolling(runId);
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            furniProgress.hidden = true;
            furniScanStatus.style.display = "block";
            furniScanStatus.textContent = err.message || "Couldn't start the scan.";
        }
    }

    // Scans one maze/event on its own. Same background job and the same
    // progress bar as the full scan — it just hands it a single id, which is
    // how you try this on one maze without committing to every image on the
    // site.
    async function scanOneItem(key, id) {
        const collection = key === "events" ? "events" : "rooms";
        const item = COLLECTIONS[key].getAll().find(i => i.id === id);
        if (!item) return;
        const imgs = [
            ...(item.entrance && item.entrance.image ? [item.entrance.image] : []),
            ...(item.gallery || []).map(g => g.image).filter(Boolean),
            ...(item.finish && item.finish.image ? [item.finish.image] : [])
        ];
        const title = item[COLLECTIONS[key].fieldMap.title] || "this one";
        if (!imgs.length) {
            furniScanStatus.style.display = "block";
            furniScanStatus.textContent = "\u201c" + title + "\u201d has no room images to scan.";
            return;
        }
        const already = Object.keys(item.furni || {}).length;
        // escapeHtml because showConfirmDialog sets the message as innerHTML
        // and this one carries a maze title straight from the record.
        const ok = await showConfirmDialog(scanConfirm(
            "Rescan \u201c" + escapeHtml(title) + "\u201d for furni?",
            imgs.length,
            already
                ? "Everything currently listed against it is replaced by what this run finds. " +
                  "Furni you added by hand is kept."
                : "Nothing is recorded against it yet, so nothing can be lost."
        ));
        if (!ok) return;
        furniScanStatus.style.display = "none";
        furniProgress.hidden = false;
        furniProgressFill.style.width = "0%";
        furniProgressLabel.textContent = "Starting \u201c" + title + "\u201d\u2026";
        try {
            const runId = newFurniRunId();
            await Api.scanFurni(adminToken, { collection, ids: [id], runId });
            startFurniPolling(runId);
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            furniProgress.hidden = true;
            furniScanStatus.style.display = "block";
            furniScanStatus.textContent = err.message || "Couldn't start the scan.";
        }
    }

    if (furniScanAllBtn) furniScanAllBtn.addEventListener("click", () => startFurniScan("full"));
    if (furniScanAddBtn) furniScanAddBtn.addEventListener("click", () => startFurniScan("additive"));
    if (furniScanNewBtn) furniScanNewBtn.addEventListener("click", () => startFurniScan("unscanned"));

    // Picking a scan back up after a page reload (so the bar doesn't
    // vanish mid-run and look stalled) is handled by applyRoleVisibility,
    // which runs once the session's role is known — starting the poll here
    // would fire it before that, for admins who can't scan at all.

    adminsAddBtn.addEventListener("click", openCreateAdminForm);

    /* Enter in a one-line field never saves the maze or event form.

       A form with a submit button submits when Enter is pressed in any of
       its single-line inputs, and these forms are long: the title, a room's
       label, an older version's label, the Habbo link, the year. Each one
       was a way to save half an edit and close the form mid-sentence.
       Several fields had grown their own guard (the furni search, the new
       room's label, the Add-from-URL boxes, the tag box); this is the one
       guard for all of them, including every field added later. Fields
       that give Enter a meaning of their own still do — they handle it on
       the field first, and this only stops the submission behind it.
       Save is the Save button (or the floating one); a textarea's Enter is
       a new line and is left alone. */
    function blockImplicitSubmit(formEl) {
        formEl.addEventListener("keydown", e => {
            if (e.key !== "Enter" || e.isComposing) return;
            const t = e.target;
            if (!t || t.tagName !== "INPUT") return;
            // Nor a file input, where Enter opens the picker.
            if (/^(submit|button|reset|image|file)$/i.test(t.type)) return;
            e.preventDefault();
        });
    }

    Object.keys(COLLECTIONS).forEach(key => {
        const cfg = COLLECTIONS[key];
        cfg.addBtn.addEventListener("click", () => requestOpenForm(key));
        cfg.formEl.addEventListener("submit", e => submitForm(key, e));
        blockImplicitSubmit(cfg.formEl);
    });

    // Sidebar shortcuts to the same two forms — openForm's own
    // scrollIntoView already brings the form into view within .admin-main's
    // internal scroll, so these just save hunting down the page for them.
    const sidebarAddRoomBtn = document.getElementById("sidebar-add-room-btn");
    const sidebarAddEventBtn = document.getElementById("sidebar-add-event-btn");
    if (sidebarAddRoomBtn) sidebarAddRoomBtn.addEventListener("click", () => requestOpenForm("rooms"));
    if (sidebarAddEventBtn) sidebarAddEventBtn.addEventListener("click", () => requestOpenForm("events"));

    // Floating Save/Cancel just proxy to whichever maze/event form is
    // currently open — requestSubmit() runs the same validation + submit
    // event as clicking that form's own (still-present) Save button.
    // requestSubmit() ignores that button being disabled mid-save, which
    // is why submitForm keeps its own _saving flag (and syncFloatingBusy
    // greys these two meanwhile).
    floatingSaveBtn.addEventListener("click", () => {
        if (!activeFormKey) return;
        COLLECTIONS[activeFormKey].formEl.requestSubmit();
    });
    floatingCancelBtn.addEventListener("click", () => {
        if (!activeFormKey) return;
        requestCloseForm(activeFormKey);
    });

    /* The browser's own "leave site?" prompt, for the exits this page does
       not control — closing the tab, hitting Back, following a link. Cancel
       is covered by requestCloseForm above; this covers everything else.

       Every open form is checked, not just the active one: two collections
       each have their own form element, and only one of them is ever the
       "active" one even when both hold changes.

       preventDefault is what modern browsers act on; returnValue is kept for
       the older ones that still require it. Neither lets us choose the
       wording — the browser shows its own. */
    window.addEventListener("beforeunload", e => {
        // The contributor form as well (30 Sept 2026).
        if (!Object.keys(COLLECTIONS).some(isFormDirty) && !isContributorFormDirty()) return;
        e.preventDefault();
        e.returnValue = "";
    });

    // ---------- tab panels ----------

    // Which panel each editable collection lives in. Contributors have the
    // Console panel to themselves (the About text that used to share it is
    // gone); the rest map to a tab of their own name.
    const PANEL_FOR_COLLECTION = {
        rooms: "rooms",
        events: "events",
        admins: "admins",
        contributors: "console"
    };

    const adminNavEl = document.getElementById("admin-nav");
    const adminPanelEls = Array.from(document.querySelectorAll(".admin-panel"));

    function showPanel(name) {
        if (!adminNavEl) return;
        adminPanelEls.forEach(panel => {
            panel.hidden = panel.dataset.panel !== name;
        });
        shownPanel = name;
        // The floating Save/Cancel follows its form's panel — see syncFloatingBar.
        syncFloatingBar();
        adminNavEl.querySelectorAll(".chrome-nav-btn").forEach(btn => {
            const on = btn.dataset.panel === name;
            btn.classList.toggle("active", on);
            btn.setAttribute("aria-selected", on ? "true" : "false");
        });
        /* Where you are, on the tab itself (30 Sept 2026). The sections
           live in a drop-down, so with it closed nothing on the page said
           which one was showing except the panel's own heading, which
           scrolls away. The NAV tab now reads "Nav · Mazes". */
        const navTab = document.querySelector('.admin-tab[data-menu="nav"] > .admin-tab-btn');
        const picked = adminNavEl.querySelector(".chrome-nav-btn.active .chrome-nav-btn-label");
        if (navTab) {
            const where = picked ? picked.textContent.trim() : "";
            navTab.textContent = "Nav";
            if (where) {
                const span = document.createElement("span");
                span.className = "admin-tab-where";
                span.textContent = " · " + where;
                navTab.appendChild(span);
            }
            navTab.setAttribute("aria-label", where ? `Sections, showing ${where}` : "Sections");
        }
        /* The map has to be measured to be drawn, and a hidden element
           measures zero — so the atlas panel's first view is only
           correct once it is actually on screen. Every other panel here is
           a list and does not care. */
        if (name === "wizard" && typeof AdminWizard !== "undefined") AdminWizard.onShown();
        /* The run log is the heaviest read on this page and most visits to
           the admin never open it, so it is fetched when the panel is first
           shown rather than on sign-in. Refresh re-reads it after that. */
        if (name === "ffdata" && !ffLoaded) loadFallinFurni();
        /* The ban list is re-read each time it is shown (29 Sept 2026):
           cool-downs end on their own, and the Players tab bans too. */
        if (name === "bans" && adminToken) loadBans();
        /* The contributor list is re-read every time its panel is shown,
           not only at sign-in. Accepting a lead in Missing Pieces can credit
           somebody server-side, and editing that person from a list loaded
           an hour earlier saved the old copy straight back over the credit.
           Skipped while the contributor form is open, so a re-read never
           shifts the list out from under an edit in progress. */
        if (name === PANEL_FOR_COLLECTION.contributors && adminToken &&
            !contributorsFormEl.classList.contains("is-open")) {
            loadContributors();
        }
        /* Mounted on first open, for the same reason as the run log and one
           more: the editor SCANS THE STYLESHEET, and doing that before the
           panel's own rules are in the document would build a catalogue
           missing the colours this very panel paints with. */
        if (name === "recolour" && !recolourMounted && typeof AdminRecolour !== "undefined") {
            recolourMounted = true;
            AdminRecolour.mount(
                document.getElementById("recolour-editor"),
                // A function, not the value — the same handover the atlas
                // gets (see startWizardPanel). The editor is mounted once and
                // lives for the page, so a copy of the token taken here went
                // stale the moment the session was renewed, and every save
                // after signing back in failed.
                () => adminToken,
                // And the same way back to the sign-in box on a 401, rather
                // than a bare "Unauthorized" in the editor's status line.
                lockOut
            ).catch(e => {
                recolourMounted = false;
                document.getElementById("recolour-editor").innerHTML =
                    '<p class="admin-empty">The palette editor could not start: ' + escapeHtml(e.message) + '</p>';
            });
        }
        /* Remembered, so a reload comes back to what you were doing.
           Editing the map is a long job done over many sittings, and being
           put back on the maze list every time the page reloads — which it
           does on every save to a function, and every time the dev server
           restarts — means finding your way back to the atlas tab a
           hundred times an afternoon. */
        try { localStorage.setItem(PANEL_KEY, name); } catch (e) { /* private mode */ }
    }

    const PANEL_KEY = "mazerats_admin_panel";

    /* The panel to open on. What was last open, if that panel still exists
       and this account is allowed to see it — a stored "activity" would
       otherwise put a standard admin on a tab that is hidden for them, and
       they would arrive at a page with nothing on it. */
    function rememberedPanel() {
        let saved = null;
        try { saved = localStorage.getItem(PANEL_KEY); } catch (e) { /* private mode */ }
        if (!saved) return null;
        const btn = adminNavEl && adminNavEl.querySelector(`.chrome-nav-btn[data-panel="${saved}"]`);
        return btn && !btn.hidden ? saved : null;
    }

    if (adminNavEl) {
        adminNavEl.addEventListener("click", e => {
            const btn = e.target.closest(".chrome-nav-btn");
            if (!btn) return;
            showPanel(btn.dataset.panel);
            /* Focus follows the choice into the panel. Left on the nav
               button, it kept the Nav tab open by :focus-within after the
               click had closed its .is-open — the menu sat over the very
               panel it had just brought up until you clicked somewhere
               else. The panel is made focusable for this alone (-1: never
               a Tab stop), and preventScroll because the stage is already
               where it should be. */
            const panel = adminPanelEls.find(p => p.dataset.panel === btn.dataset.panel);
            if (panel) {
                if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
                panel.focus({ preventScroll: true });
            } else {
                btn.blur();
            }
        });
    }

    /* ---------- the daily games ----------

       Three games, one puzzle each a day, and one thing an administrator
       actually needs to do with them: give somebody their day back when
       something has gone wrong with it.

       The panel is deliberately two columns and not a table. A table would
       be every player against every game, which is a report — and the
       decision being made here is never "how is everyone doing", it is
       "this person, this game". So: pick a player, see where they stand,
       act on one game.

       What a reset means differs by game and the panel says so rather than
       showing identical buttons that do different amounts. Guess the Maze
       keeps a scored row per player per day, so its row is deleted and the
       day can be submitted again. Odd One Out keeps its day in the player's
       own browser, which nothing here can reach — for it, and for the
       browser half of Guess the Maze, a ticket is left for the game to
       collect the next time that player opens it. See
       netlify/functions/daily-games.js. */

    const dailySearchEl = document.getElementById("daily-search");
    const dailyPlayersEl = document.getElementById("daily-players");
    const dailyDetailEl = document.getElementById("daily-detail");
    let dailyPlayers = [];
    let dailyPicked = null;
    let dailyDetail = null;
    let dailyToday = "";
    let dailyNote = "";

    async function loadDaily(playerId) {
        if (!dailyPlayersEl) return;
        try {
            const data = await Api.getDailyPlayers(adminToken, dailySearchEl ? dailySearchEl.value.trim() : "", playerId || "");
            dailyPlayers = data.players || [];
            dailyDetail = data.detail || null;
            dailyToday = data.today || "";
            dailyFailed = "";
        } catch (err) {
            /* Every error used to land here and draw "Nobody has played a
               daily game yet." — an expired session and a database outage
               both reported as an empty game. The first now gets the
               session-expired login like every other panel; the second says
               it failed, in the list, instead of saying nobody played. */
            if (err && err.status === 401) { lockOut(); return; }
            dailyPlayers = [];
            dailyDetail = null;
            dailyFailed = (err && err.message) || "Couldn't load the daily games.";
        }
        renderDailyPlayers();
        renderDailyDetail();
    }

    let dailyFailed = "";

    function renderDailyPlayers() {
        if (!dailyPlayersEl) return;
        if (dailyFailed) {
            showLoadFailure(dailyPlayersEl, dailyFailed);
            return;
        }
        dailyPlayersEl.innerHTML = "";

        if (!dailyPlayers.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = dailySearchEl && dailySearchEl.value.trim()
                ? "Nobody by that name has played."
                : "Nobody has played a daily game yet.";
            dailyPlayersEl.appendChild(empty);
            return;
        }

        dailyPlayers.forEach(player => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "chrome-list-row admin-row admin-daily-player";
            if (dailyPicked === player.id) row.classList.add("is-on");

            /* A Discord display name is somebody else's text, so it goes in
               as a text node. Every name on this panel arrives the same way
               and is treated the same way. */
            const info = document.createElement("div");
            info.className = "row-info";

            const heading = document.createElement("h3");
            heading.textContent = player.name;
            info.appendChild(heading);

            const meta = document.createElement("p");
            meta.className = "row-creator";
            const bits = [];
            if (player.days) bits.push(player.days + (player.days === 1 ? " day" : " days") + " scored");
            if (player.lastDay) bits.push("last played " + player.lastDay);
            if (player.pending.length) bits.push(player.pending.length + " reset waiting");
            meta.textContent = bits.join(" · ") || "No scored days";
            info.appendChild(meta);

            row.appendChild(info);

            if (player.pending.length) {
                const flag = document.createElement("span");
                flag.className = "admin-daily-flag";
                flag.textContent = "RESET WAITING";
                row.appendChild(flag);
            }

            row.addEventListener("click", () => {
                dailyPicked = player.id;
                loadDaily(player.id);
            });
            dailyPlayersEl.appendChild(row);
        });
    }

    function renderDailyDetail() {
        if (!dailyDetailEl) return;
        dailyDetailEl.innerHTML = "";

        if (!dailyDetail) {
            const hint = document.createElement("p");
            hint.className = "admin-empty";
            hint.textContent = "Pick a player to see their games.";
            dailyDetailEl.appendChild(hint);
            return;
        }

        const player = dailyPlayers.find(p => p.id === dailyDetail.id);
        const head = document.createElement("div");
        head.className = "admin-daily-head";

        const name = document.createElement("h3");
        name.className = "admin-subheading";
        name.textContent = player ? player.name : "This player";
        head.appendChild(name);

        const when = document.createElement("p");
        when.className = "admin-hint";
        when.textContent = "Today is " + dailyToday + ", counted in UTC — the same day boundary the games use.";
        head.appendChild(when);

        /* What the last action actually did, said where the action was
           taken. A reset has two halves and only one of them has happened
           by the time this appears — a line that says so is the difference
           between a control you trust and one you press twice. */
        if (dailyNote) {
            const note = document.createElement("p");
            note.className = "admin-daily-note";
            note.textContent = dailyNote;
            head.appendChild(note);
        }
        dailyDetailEl.appendChild(head);

        dailyDetail.games.forEach(game => {
            const card = document.createElement("div");
            card.className = "admin-daily-game";

            const title = document.createElement("h4");
            title.className = "admin-daily-game-name";
            title.textContent = game.name;
            card.appendChild(title);

            const state = document.createElement("p");
            state.className = "admin-hint";
            if (game.resetWaiting) {
                state.textContent = "A reset is waiting. It takes effect the next time they open this game.";
            } else if (!game.scored) {
                state.textContent = "Kept in the player's browser — this page cannot see whether they have played today.";
            } else if (game.playedToday) {
                state.textContent = "Played today, " + game.todayPoints + " points" +
                    (game.days ? " · " + game.days + " scored " + (game.days === 1 ? "day" : "days") + " in all" : "");
            } else {
                state.textContent = "Nothing scored today" +
                    (game.days ? " · " + game.days + " scored " + (game.days === 1 ? "day" : "days") + " in all" : "");
            }
            card.appendChild(state);

            const actions = document.createElement("div");
            actions.className = "admin-daily-actions";

            if (game.resetWaiting) {
                const cancel = document.createElement("button");
                cancel.type = "button";
                cancel.className = "admin-action-pill";
                cancel.textContent = "Call it off";
                cancel.addEventListener("click", async () => {
                    cancel.disabled = true;
                    try {
                        await Api.cancelDailyReset(adminToken, dailyDetail.id, game.key);
                        dailyNote = "Reset called off — they keep today as it stands.";
                    } catch (err) {
                        if (err.status === 401) { lockOut(); return; }
                        await sayProblem(err.message || "Could not call that off — try again.");
                    }
                    loadDaily(dailyDetail.id);
                });
                actions.appendChild(cancel);
            } else {
                const reset = document.createElement("button");
                reset.type = "button";
                reset.className = "admin-action-pill admin-pill-solid";
                reset.textContent = "Reset today";
                reset.addEventListener("click", async () => {
                    /* Asked plainly, and the question says which game and
                       whose. A reset is not destructive in the way deleting
                       a maze is, but it does take somebody's score off a
                       board, and that is worth one press of confirmation. */
                    const who = player ? player.name : "this player";
                    /* Written as two whole sentences rather than one glued
                       together from a conditional half: the version that
                       built it up out of clauses read "back? their saved day
                       is cleared" whenever the game had no scored row, which
                       is two of the three. */
                    const what = game.scored
                        ? "Their scored row for today is deleted, and their saved day is cleared the next time they open the game."
                        : "Their saved day is cleared the next time they open the game.";
                    /* The page's own box (30 Sept 2026). The player is
                       held here, not read from dailyDetail after the answer:
                       the box waits, and the reset is for the player it
                       named. */
                    const playerId = dailyDetail.id;
                    if (!await showConfirmDialog(escapeHtml("Give " + who + " today's " + game.name + " back?") + "<br><br>" + escapeHtml(what), { danger: true })) return;
                    reset.disabled = true;
                    try {
                        const out = await Api.resetDailyGame(adminToken, playerId, game.key);
                        dailyNote = out.scoreRowsDeleted
                            ? "Scored row for today deleted. Their saved day clears the next time they open the game."
                            : "Waiting: their saved day clears the next time they open the game.";
                    } catch (err) {
                        if (err.status === 401) { lockOut(); return; }
                        await sayProblem(err.message || "Could not reset that — try again.");
                    }
                    loadDaily(playerId);
                });
                actions.appendChild(reset);
            }

            card.appendChild(actions);
            dailyDetailEl.appendChild(card);
        });

        if (dailyDetail.recent && dailyDetail.recent.length) {
            const head2 = document.createElement("h4");
            head2.className = "admin-daily-game-name";
            head2.textContent = "Recent scored days";
            dailyDetailEl.appendChild(head2);

            const list = document.createElement("ul");
            list.className = "admin-daily-recent";
            dailyDetail.recent.forEach(row => {
                const li = document.createElement("li");
                li.textContent = row.day + " — " + row.points + " points, " + row.solved + " of 5 found";
                list.appendChild(li);
            });
            dailyDetailEl.appendChild(list);
        }
    }

    if (dailySearchEl) {
        let dailyTimer = null;
        dailySearchEl.addEventListener("input", () => {
            clearTimeout(dailyTimer);
            // A keystroke is not a query: waited out, the way the archive's
            // own search box does it.
            dailyTimer = setTimeout(() => loadDaily(dailyPicked), 220);
        });
    }

    // ---------- bans ----------
    /* The Bans tab (rebuilt 29 Sept 2026). It was a list of addresses
       blocked from the contact form. Bans are site-wide now, with two
       levels and an optional end (see window.AdminBanKit at the top of
       js/admin-players.js for the owner's words for each), and on three
       kinds of target: a Discord account ("player"), an address or IPv6
       /64 typed in or taken from a message ("ip" / "net"), and the network
       a signed-in player last came from, which the server keeps only as a
       hash ("nethash"). This tab lists every one of them, filters them,
       lifts and changes them, and adds a ban on anything; the Players tab
       bans from a player's own row. The two share AdminBanKit for their
       choices and wording, so the sentence an admin says Yes to reads the
       same from either.

       The old bans are still in the list the old way ({ ip, net, reason,
       createdAt, createdBy }, no kind or level); AdminBanKit.normalise
       reads both shapes. */

    const bansFiltersEl = document.getElementById("bans-filters");
    const bansAddEl = document.getElementById("bans-add");
    const bansAddBtn = document.getElementById("bans-add-btn");
    const bansRefreshBtn = document.getElementById("bans-refresh-btn");
    let bansShow = "active";            // active | ended | all
    let bansKind = "all";               // all | player | address | nethash
    const bansEdits = new Map();        // ban id -> the Change form's state
    let bansMsg = null;                 // { text, bad } under the filters
    let bansBusy = false;
    let bansGen = 0;
    let bansAdd = null;                 // the Add a ban form's state, while open
    let bansAddFound = null;            // what the player search found, or a message
    let bansAddGen = 0;
    let bansAddMsg = null;

    const BAN_KINDS = [["all", "All kinds"], ["player", "Accounts"], ["address", "Addresses"], ["nethash", "Players' networks"]];
    const BAN_SHOWS = [["active", "Active"], ["ended", "Expired"], ["all", "All"]];

    const banKit = () => window.AdminBanKit || null;
    const banApiReady = () => typeof Api.createBan === "function" && typeof Api.updateBan === "function" && typeof Api.liftBan === "function";

    async function loadBans() {
        const gen = ++bansGen;
        if (bansRefreshBtn) bansRefreshBtn.disabled = true;
        try {
            const data = await Api.getBans(adminToken);
            if (gen !== bansGen) return;
            workingBans = Array.isArray(data) ? data : (data && Array.isArray(data.bans) ? data.bans : []);
            bansFailed = "";
        } catch (err) {
            if (gen !== bansGen) return;
            if (err.status === 401) { lockOut(); return; }
            workingBans = [];
            // "No bans yet." after a failed read would tell an admin the
            // address they banned last week is free to post again.
            bansFailed = err.message || "Couldn't load the ban list.";
        } finally {
            if (gen === bansGen && bansRefreshBtn) bansRefreshBtn.disabled = false;
        }
        renderBansList();
        // Each message row shows Ban or Unban depending on whether its own
        // address is on this list, so those have to be redrawn too.
        renderContactMessagesList();
        // And a Missing Pieces lead's (js/admin-dead-ends.js).
        document.dispatchEvent(new CustomEvent("mazerats:bans-changed"));
    }
    // For the Players tab, after it bans or lifts (js/admin-players.js).
    window.AdminBansReload = () => (adminToken ? loadBans() : null);

    function normalisedBans() {
        const kit = banKit();
        if (!kit) return [];
        return workingBans.map(kit.normalise).filter(Boolean);
    }

    /* Whether a message's sender is caught: an active address ban on the
       address itself, or on the /64 it sits in — the same two things
       "Unban IP" (DELETE ?ip=) lifts. */
    function isBanned(ip) {
        const kit = banKit();
        if (!ip) return false;
        if (!kit) return workingBans.some(ban => ban.ip === ip);
        const now = Date.now();
        return normalisedBans().some(n => kit.catchesIp(n, ip, now));
    }

    let bansFailed = "";

    function bansSay(text, bad) {
        bansMsg = text ? { text, bad: !!bad } : null;
        const el = document.getElementById("bans-status");
        if (el) {
            el.textContent = text || "";
            el.classList.toggle("is-bad", !!bad);
        }
    }

    function renderBanFilters(list) {
        if (!bansFiltersEl) return;
        const kit = banKit();
        const now = Date.now();
        const kindOf = n => (n.kind === "ip" || n.kind === "net" ? "address" : n.kind);
        const inKind = list.filter(n => bansKind === "all" || kindOf(n) === bansKind);
        const counts = {
            active: inKind.filter(n => kit.isActive(n, now)).length,
            ended: inKind.filter(n => !kit.isActive(n, now)).length,
            all: inKind.length
        };
        const seg = (name, options, current, label, n) => `<div class="ctl-seg bn-filter-tabs" role="group" aria-label="${escapeHtml(label)}" data-bans-f="${name}">${options.map(([v, l]) =>
            `<button type="button" class="btn-enter-mini${v === current ? " active" : ""}" data-v="${v}" aria-pressed="${v === current}">${escapeHtml(l)}${n && n[v] ? ` (${n[v]})` : ""}</button>`).join("")}</div>`;
        bansFiltersEl.innerHTML =
            seg("show", BAN_SHOWS, bansShow, "Which bans", counts) +
            seg("kind", BAN_KINDS, bansKind, "What kind") +
            `<p class="ctl-status" id="bans-status" role="status">${bansMsg ? escapeHtml(bansMsg.text) : ""}</p>`;
        const status = document.getElementById("bans-status");
        if (status && bansMsg) status.classList.toggle("is-bad", bansMsg.bad);
    }

    if (bansFiltersEl) {
        bansFiltersEl.addEventListener("click", e => {
            const b = e.target.closest("[data-v]");
            const seg = b && b.closest("[data-bans-f]");
            if (!seg) return;
            if (seg.dataset.bansF === "show") bansShow = b.dataset.v;
            else bansKind = b.dataset.v;
            renderBansList();
        });
    }

    function banRowHtml(n, now) {
        const kit = banKit();
        const active = kit.isActive(n, now);
        const editing = bansEdits.has(n.id);
        const levelChip = n.level
            ? `<span class="de-chip bn-chip-level bn-level-${n.level}" title="${escapeHtml(kit.levelLong(n.level))}">${escapeHtml(kit.levelShort(n.level))}</span>`
            : `<span class="de-chip bn-chip-level" title="${escapeHtml(kit.levelLong(""))}">${escapeHtml(kit.levelShort(""))}</span>`;
        const timeChip = !active
            ? `<span class="de-chip bn-chip-ended">Expired</span>`
            : n.until != null
                ? `<span class="de-chip bn-chip-cooling" title="${escapeHtml(kit.fmtUtc(n.until))}">Cool-down · ${escapeHtml(kit.leftText(n.until - now))}</span>`
                : `<span class="de-chip bn-chip-perm">Permanent</span>`;
        let title = escapeHtml(kit.targetText(n));
        if (n.kind === "player" && n.value) title = `${escapeHtml(n.name || "A player")} <span class="se-mono bn-id" title="${escapeHtml("Discord ID " + n.value)}">${escapeHtml(kit.shortId(n.value))}</span>`;
        else if ((n.kind === "ip" || n.kind === "net") && n.value) title = `<span class="se-mono admin-ban-ip">${escapeHtml(n.value)}</span>`;
        /* The address a network ban was made from (a message's Ban IP
           stores both), or the network an old address ban also caught. */
        const netNote = n.kind === "net" && n.raw.ip && n.raw.ip !== n.value
            ? `<p class="se-when">From the address <span class="se-mono">${escapeHtml(n.raw.ip)}</span></p>`
            : n.kind === "ip" && n.net && n.net !== n.value ? `<p class="se-when" title="An address ban catches the whole network it sits in">Also catches <span class="se-mono">${escapeHtml(n.net)}</span></p>` : "";
        const actions = canWrite() && !editing ? `
                <button type="button" class="btn admin-edit-btn" data-ban-act="change" data-ban-id="${escapeHtml(n.id)}"${active ? "" : ' title="Set a new level or length — it comes back into force"'}>Change</button>
                <button type="button" class="btn admin-delete-btn" data-ban-act="lift" data-ban-id="${escapeHtml(n.id)}">${active ? "Lift" : "Remove"}</button>` : "";
        const form = editing ? `
                ${kit.formHtml(bansEdits.get(n.id), { change: true, ended: !kit.isActive(n, now), now, uid: "bans-edit-" + n.id })}
                <div class="ctl-actions bn-edit-actions">
                    <button type="button" class="ctl-btn bn-write" data-ban-act="change-save" data-ban-id="${escapeHtml(n.id)}"${bansBusy ? " disabled" : ""}>Save change</button>
                    <button type="button" class="ctl-btn" data-ban-act="change-cancel" data-ban-id="${escapeHtml(n.id)}">Cancel</button>
                </div>` : "";
        return `
            <div class="row-info">
                <div class="se-row-head">
                    <h3 class="bn-target">${title}</h3>
                    <span class="de-chip bn-chip-kind">${escapeHtml(kit.kindText(n.kind))}</span>
                    ${levelChip}
                    ${timeChip}
                </div>
                ${netNote}
                ${n.reason ? `<p class="row-creator bn-reason">${escapeHtml(n.reason)}</p>` : ""}
                <p class="se-when">${escapeHtml(kit.untilText(n, now))} <span class="se-sep">·</span> by ${escapeHtml(n.by || "—")}, ${escapeHtml(kit.fmtUtc(n.at))}</p>
                ${form}
            </div>
            ${actions ? `<div class="admin-row-actions">${actions}</div>` : ""}`;
    }

    function renderBansList() {
        renderBansAdd();
        if (bansFailed) {
            if (bansFiltersEl) bansFiltersEl.innerHTML = "";
            showLoadFailure(bansListEl, bansFailed);
            return;
        }
        const kit = banKit();
        if (!kit) {
            bansListEl.innerHTML = '<p class="admin-empty admin-form-error">This copy of the page is out of date. Reload it to see the bans.</p>';
            return;
        }
        const all = normalisedBans();
        renderBanFilters(all);
        const now = Date.now();
        const kindOf = n => (n.kind === "ip" || n.kind === "net" ? "address" : n.kind);
        const shown = all.filter(n =>
            (bansKind === "all" || kindOf(n) === bansKind) &&
            (bansShow === "all" || (bansShow === "active") === kit.isActive(n, now)));
        // What is being typed in a Change form survives the redraw.
        const active = document.activeElement;
        const typing = active && bansListEl.contains(active) && active.dataset.bn
            ? { id: (active.closest("[data-ban-row]") || { dataset: {} }).dataset.banRow, bn: active.dataset.bn } : null;
        bansListEl.innerHTML = "";
        if (!shown.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = !all.length ? "No bans yet."
                : bansShow === "active" ? "Nothing in force that matches." : "No bans match that.";
            bansListEl.appendChild(empty);
            return;
        }
        shown.forEach(n => {
            const row = document.createElement("div");
            row.className = "chrome-list-row admin-row bn-row" + (kit.isActive(n, now) ? "" : " is-ended");
            row.dataset.banRow = n.id;
            // Names and addresses: the click breadcrumb says only "button".
            row.setAttribute("data-crumb-private", "");
            row.innerHTML = banRowHtml(n, now);
            const form = row.querySelector("[data-bn-form]");
            if (form) kit.wire(form, bansEdits.get(n.id), null, Date.now);
            bansListEl.appendChild(row);
        });
        if (typing && typing.id) {
            const row = Array.from(bansListEl.querySelectorAll("[data-ban-row]")).find(r => r.dataset.banRow === typing.id);
            const box = row && row.querySelector(`[data-bn="${typing.bn}"]`);
            if (box) box.focus({ preventScroll: true });
        }
    }

    if (bansListEl) {
        bansListEl.addEventListener("click", e => {
            const b = e.target.closest("[data-ban-act]");
            if (!b || b.disabled) return;
            const n = normalisedBans().find(x => x.id === b.dataset.banId);
            if (!n) return;
            const act = b.dataset.banAct;
            if (act === "lift") liftBan(n);
            else if (act === "change") {
                bansEdits.set(n.id, banKit().fresh({ level: n.level || "soft", length: banKit().isActive(n, Date.now()) ? "keep" : "24h", reason: n.reason || "" }));
                renderBansList();
            }
            else if (act === "change-cancel") { bansEdits.delete(n.id); renderBansList(); }
            else if (act === "change-save") changeBan(n);
        });
    }

    // Everything the Players tab shows about bans is now out of date too.
    function bansWritten() {
        if (window.AdminPlayers && typeof window.AdminPlayers.bansChanged === "function") window.AdminPlayers.bansChanged();
        return loadBans();
    }

    async function liftBan(n) {
        const kit = banKit();
        if (bansBusy || !canWrite()) return;
        if (!banApiReady()) { bansSay("Not available yet — reload the page.", true); return; }
        if (!(await showConfirmDialog(kit.liftHtml(n, Date.now())))) return;
        bansBusy = true;
        try {
            await Api.liftBan(adminToken, n.id);
            bansEdits.delete(n.id);
            bansSay((kit.isActive(n, Date.now()) ? "Lifted: " : "Removed: ") + kit.targetText(n) + ".");
            await bansWritten();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            bansSay("Not lifted: " + (err.status === 404 ? "it was already gone." : (err.message || "try again.")), true);
            if (err.status === 404) bansWritten();
        } finally {
            bansBusy = false;
        }
    }

    async function changeBan(n) {
        const kit = banKit();
        const state = bansEdits.get(n.id);
        if (!state || bansBusy || !canWrite()) return;
        if (!banApiReady()) { bansSay("Not available yet — reload the page.", true); return; }
        const choice = kit.read(state, Date.now());
        if (choice.error) { bansSay(choice.error, true); return; }
        if (!(await showConfirmDialog(kit.changeHtml(kit.targetText(n), choice, n)))) return;
        if (bansEdits.get(n.id) !== state) return;
        bansBusy = true;
        try {
            await Api.updateBan(adminToken, kit.putBody(choice, n.id));
            bansEdits.delete(n.id);
            bansSay("Changed: " + kit.targetText(n) + ".");
            await bansWritten();
        } catch (err) {
            if (err.status === 401) { lockOut(); return; }
            bansSay("Not saved: " + (err.message || "try again."), true);
        } finally {
            bansBusy = false;
        }
    }

    // ---- Add a ban

    function renderBansAdd() {
        if (!bansAddEl) return;
        const kit = banKit();
        const open = !!(bansAdd && kit && canWrite());
        bansAddEl.hidden = !open;
        if (bansAddBtn) {
            bansAddBtn.hidden = !canWrite() || !kit;
            bansAddBtn.setAttribute("aria-expanded", String(open));
        }
        if (!open) { bansAddEl.innerHTML = ""; return; }
        const s = bansAdd;
        const now = Date.now();
        const typeSeg = `<div class="ctl-seg bn-seg" role="group" aria-label="What to ban" data-add-type>${[["address", "An address (IP or /64)"], ["player", "A player"]].map(([v, l]) =>
            `<button type="button" class="btn-enter-mini${v === s.type ? " active" : ""}" data-v="${v}" aria-pressed="${v === s.type}">${escapeHtml(l)}</button>`).join("")}</div>`;
        let targetPart;
        if (s.type === "address") {
            targetPart = `
                <div class="bn-field">
                    <label class="ctl-label" for="bans-add-ip">Address</label>
                    <input type="text" class="ctl-input" id="bans-add-ip" data-add="ip" maxlength="64" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="203.0.113.7, or 2001:db8:1:2::/64" value="${escapeHtml(s.ip || "")}">
                    <p class="admin-hint bn-note">An IPv6 address is widened to its /64 by the server, the way a message's ban is: the next address along is the same household.</p>
                </div>`;
        } else if (s.pick) {
            const p = s.pick;
            targetPart = `
                <div class="bn-field">
                    <span class="ctl-label">Player</span>
                    <p class="bn-picked"><strong>${escapeHtml(p.shown)}</strong> <span class="se-mono admin-hint">${escapeHtml(p.id)}</span>
                        <button type="button" class="ctl-btn" data-add-act="unpick">Choose someone else</button></p>
                </div>`;
        } else {
            const found = bansAddFound;
            let results = "";
            if (found && found.message) results = `<p class="admin-hint">${escapeHtml(found.message)}</p>`;
            else if (found && found.list) {
                results = found.list.length ? `<div class="bn-results">${found.list.map(p => `
                    <div class="bn-result">
                        <span><strong>${escapeHtml(p.shown)}</strong> <span class="admin-hint">${p.username ? "@" + escapeHtml(p.username) + " · " : ""}<span class="se-mono">${escapeHtml(p.id)}</span>${p.banned ? " · already banned" : ""}</span></span>
                        <button type="button" class="ctl-btn" data-add-act="pick" data-id="${escapeHtml(p.id)}">Choose</button>
                    </div>`).join("")}</div>` : `<p class="admin-hint">Nobody who has signed in matches that.</p>`;
            }
            targetPart = `
                <div class="bn-field">
                    <label class="ctl-label" for="bans-add-q">Player</label>
                    <div class="ctl-row bn-find-row">
                        <input type="search" class="ctl-input" id="bans-add-q" data-add="q" maxlength="64" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="A Discord ID, nickname, name or @username" value="${escapeHtml(s.q || "")}">
                        <button type="button" class="ctl-btn" data-add-act="find">Find</button>
                    </div>
                    ${results}
                </div>`;
        }
        const ready = s.type === "address" || !!s.pick;
        bansAddEl.innerHTML = `
            <h4 class="admin-subheading se-sub">Add a ban</h4>
            <div class="bn-field"><span class="ctl-label">Ban</span>${typeSeg}</div>
            ${targetPart}
            ${ready ? kit.formHtml(s.choice, { now, targets: s.type === "player" ? { net: !!(s.pick && s.pick.hasNetHash) } : null, uid: "bans-add" }) : ""}
            <div class="ctl-actions">
                ${ready ? `<button type="button" class="ctl-btn admin-delete-btn bn-write bn-go" data-add-act="go"${bansBusy ? " disabled" : ""}>Ban…</button>` : ""}
                <button type="button" class="ctl-btn" data-add-act="close">Cancel</button>
            </div>
            <p class="ctl-status${bansAddMsg && bansAddMsg.bad ? " is-bad" : ""}" data-add-status role="status">${bansAddMsg ? escapeHtml(bansAddMsg.text) : ""}</p>`;
        const form = bansAddEl.querySelector("[data-bn-form]");
        if (form) kit.wire(form, s.choice, null, Date.now);
    }

    function addSay(text, bad) {
        bansAddMsg = text ? { text, bad: !!bad } : null;
        const el = bansAddEl && bansAddEl.querySelector("[data-add-status]");
        if (el) {
            el.textContent = text || "";
            el.classList.toggle("is-bad", !!bad);
        }
    }

    function openBansAdd(prefill) {
        const kit = banKit();
        if (!kit || !canWrite()) return;
        bansAdd = Object.assign({ type: "address", ip: "", q: "", pick: null, choice: kit.fresh() }, prefill || {});
        bansAddFound = null;
        bansAddMsg = null;
        renderBansAdd();
        const first = bansAddEl.querySelector("[data-add]");
        if (first) first.focus({ preventScroll: true });
    }

    async function findPlayers() {
        const q = String(bansAdd && bansAdd.q || "").trim();
        if (!q) { bansAddFound = { message: "Type a Discord ID or a name first." }; renderBansAdd(); return; }
        if (typeof Api.getPlayers !== "function") { bansAddFound = { message: "This page is out of date. Reload it to use this." }; renderBansAdd(); return; }
        const gen = ++bansAddGen;
        bansAddFound = { message: "Looking…" };
        renderBansAdd();
        try {
            const data = await Api.getPlayers(adminToken, { q, limit: 8 });
            if (gen !== bansAddGen || !bansAdd) return;
            const list = (Array.isArray(data && data.players) ? data.players : []).filter(p => p && p.id).map(p => ({
                id: String(p.id),
                shown: String(p.displayName || p.nick || p.name || p.username || "Someone"),
                username: p.username ? String(p.username) : "",
                hasNetHash: !!p.hasNetHash,
                banned: !!(p.ban && banKit().chip(p.ban, Date.now()))
            }));
            bansAddFound = { list };
        } catch (err) {
            if (gen !== bansAddGen) return;
            if (err.status === 401) { lockOut(); return; }
            bansAddFound = { message: "Couldn't search: " + (err.message || "try again.") };
        }
        renderBansAdd();
    }

    async function addBanGo() {
        const kit = banKit();
        const s = bansAdd;
        if (!s || bansBusy || !canWrite()) return;
        if (!banApiReady()) { addSay("Not available yet — reload the page.", true); return; }
        const choice = kit.read(s.choice, Date.now());
        if (choice.error) { addSay(choice.error, true); return; }
        let bodies;
        let who;
        let extra = "";
        if (s.type === "address") {
            const value = String(s.ip || "").trim().toLowerCase();
            if (!kit.looksLikeAddress(value)) { addSay("That doesn't look like an IP address or an IPv6 /64.", true); return; }
            /* IPv6 as "net": the server bans that address's /64, as the
               hint above says and as the old message ban did. IPv4 is one
               address either way. */
            const kind = value.includes(":") ? "net" : "ip";
            bodies = [Object.assign({ kind, value }, kit.postBody(choice))];
            who = value;
            // IPv4 is one address; an IPv6 one is widened to its /64.
            if (value.includes(":")) extra = " Everyone on that /64 is caught, not only one address.";
        } else {
            const p = s.pick;
            if (!p) { addSay("Choose a player first.", true); return; }
            const t = s.choice.target;
            const wantNet = t === "net" || t === "both";
            if (wantNet && !p.hasNetHash) { addSay(kit.NO_NET, true); return; }
            const kinds = t === "both" ? ["player", "nethash"] : [wantNet ? "nethash" : "player"];
            bodies = kinds.map(kind => Object.assign({ kind, playerId: p.id }, kind === "player" ? { value: p.id } : {}, kit.postBody(choice)));
            who = t === "both" ? `${p.shown}'s account and their network` : wantNet ? `${p.shown}'s network` : `${p.shown}'s account`;
            if (t === "both") extra = " That's two bans, lifted separately.";
        }
        if (!(await showConfirmDialog(kit.summaryHtml(who, choice) + escapeHtml(extra)))) return;
        if (bansAdd !== s || bansBusy) return;
        bansBusy = true;
        addSay("Banning…");
        let done = 0;
        let failed = null;
        for (const body of bodies) {
            try {
                await Api.createBan(adminToken, body);
                done++;
            } catch (err) {
                failed = { body, err };
                break;
            }
        }
        bansBusy = false;
        if (failed && failed.err.status === 401) { lockOut(); return; }
        if (!failed) {
            bansAdd = null;
            bansSay("Banned: " + who + ".");
        } else {
            // 409 is either "no network on file" (noNetHash) or "already banned".
            const why = failed.err.status === 409 && failed.err.data && failed.err.data.noNetHash ? kit.NO_NET
                : failed.err.status === 409 ? (failed.err.message || "that's already banned.") : (failed.err.message || "try again.");
            addSay(done ? `Their account is banned, but not their network: ${why}` : `Not banned: ${why}`, true);
        }
        if (done) await bansWritten();
        else renderBansAdd();
    }

    if (bansAddBtn) {
        bansAddBtn.addEventListener("click", () => {
            if (bansAdd) { bansAdd = null; renderBansAdd(); }
            else openBansAdd();
        });
    }
    if (bansRefreshBtn) bansRefreshBtn.addEventListener("click", () => { if (adminToken) loadBans(); });
    if (bansAddEl) {
        bansAddEl.addEventListener("input", e => {
            const f = e.target.closest("[data-add]");
            if (f && bansAdd) bansAdd[f.dataset.add] = f.value;
        });
        bansAddEl.addEventListener("keydown", e => {
            if (e.key === "Enter" && e.target.closest('[data-add="q"]')) { e.preventDefault(); findPlayers(); }
        });
        bansAddEl.addEventListener("click", e => {
            if (!bansAdd) return;
            const type = e.target.closest("[data-add-type] [data-v]");
            if (type) {
                if (bansAdd.type !== type.dataset.v) {
                    bansAdd.type = type.dataset.v;
                    bansAdd.choice.target = "account";
                    bansAddMsg = null;
                    renderBansAdd();
                }
                return;
            }
            const b = e.target.closest("[data-add-act]");
            if (!b || b.disabled) return;
            const act = b.dataset.addAct;
            if (act === "find") findPlayers();
            else if (act === "pick") {
                const p = bansAddFound && bansAddFound.list && bansAddFound.list.find(x => x.id === b.dataset.id);
                if (p) { bansAdd.pick = p; bansAdd.choice.target = "account"; bansAddMsg = null; renderBansAdd(); }
            } else if (act === "unpick") { bansAdd.pick = null; renderBansAdd(); }
            else if (act === "close") { bansAdd = null; bansAddFound = null; renderBansAdd(); }
            else if (act === "go") addBanGo();
        });
    }

    /* "Ban IP" on a contact message (29 Sept 2026). It was a prompt() for
       a reason and a ban on the contact form. Now that a ban has a level
       and a length, the Are You Sure? carries the three choices itself, as
       plain selects — the dialog's markup is one paragraph, and selects and
       a text box are allowed in one — read back as they change, since the
       dialog is gone by the time it answers. Permanent and "everything but
       reading" are chosen to begin with: the nearest to what the button
       used to do. */
    let quickBan = null;
    document.addEventListener("input", e => {
        const f = e.target.closest && e.target.closest("[data-quick-ban]");
        if (f && quickBan) quickBan[f.dataset.quickBan] = f.value;
    });
    document.addEventListener("change", e => {
        const f = e.target.closest && e.target.closest("[data-quick-ban]");
        if (f && quickBan) quickBan[f.dataset.quickBan] = f.value;
    });

    /* Also a Missing Pieces lead's Ban IP (30 Sept 2026, through
       window.AdminBanIp). That one was a prompt() promising a ban on "the
       contact form and sending leads" while it posted the old { ip,
       reason }, which bans.js turns into a permanent everything-but-reading
       ban on the whole network — so it borrows this instead, and the admin
       sees and picks what really happens. opts.reason fills the reason box.
       Resolves true once the ban is saved, false otherwise.

       The question names the /64 only for IPv6: an IPv4 ban is on that one
       address (bans.js createNew), and "and its network" promised more. */
    async function banIp(ip, opts) {
        const kit = banKit();
        if (!kit || !banApiReady()) { await sayProblem("This copy of the page is out of date. Reload it to ban."); return false; }
        const mine = { level: "soft", length: "perm", reason: String((opts && opts.reason) || "").slice(0, kit.REASON_MAX) };
        quickBan = mine;
        const lengths = kit.LENGTHS.filter(([v]) => v !== "custom");
        const v6 = ip.includes(":");
        const ok = await showConfirmDialog(
            `Ban <strong>${escapeHtml(ip)}</strong>${v6 ? " (and the rest of its /64 network)" : ""}?` +
            `<span class="bn-quick">` +
            `<label><span class="ctl-label">Level</span><select data-quick-ban="level">${kit.LEVELS.map(([v, l]) => `<option value="${v}"${v === mine.level ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select></label>` +
            `<label><span class="ctl-label">Length</span><select data-quick-ban="length">${lengths.map(([v, l]) => `<option value="${v}"${v === mine.length ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select></label>` +
            `<label><span class="ctl-label">Reason (optional)</span><input type="text" data-quick-ban="reason" maxlength="${kit.REASON_MAX}" autocomplete="off" value="${escapeHtml(mine.reason)}"></label>` +
            `</span>` +
            `<span class="admin-hint bn-quick-note">Everything but reading: they can read the site but not sign in, play or send anything. Whole site: a banned screen on every page but the privacy policy. For a date and time, use Add a ban on the Bans tab.</span>`,
            { danger: true });
        quickBan = null;
        if (!ok) return false;
        const choice = kit.read({ level: mine.level, length: mine.length, reason: mine.reason }, Date.now());
        if (choice.error) { await sayProblem(choice.error); return false; }
        try {
            // "net" for IPv6: its /64, as this button always banned.
            await Api.createBan(adminToken, Object.assign({ kind: v6 ? "net" : "ip", value: ip }, kit.postBody(choice)));
        } catch (err) {
            if (err.status === 401) { lockOut(); return false; }
            await sayProblem(err.message || "Could not ban that address — try again.");
            return false;
        }
        // Saved; a list that fails to re-read is not a failed ban.
        try { await bansWritten(); } catch (e) { /* the Bans tab says its own */ }
        return true;
    }

    // A different account signing in on this tab does not inherit these.
    function resetBanForms() {
        bansAdd = null;
        bansAddFound = null;
        bansAddMsg = null;
        bansEdits.clear();
        bansMsg = null;
        renderBansAdd();
    }

    /* "Unban IP" on a message lifts EVERY ban on that address and its
       network — a whole-site ban or a cool-down made from the Bans tab
       included — so it names what it will lift and asks first (29 Sept
       2026). */
    /* Resolves true once the bans are lifted (30 Sept 2026, for a
       Missing Pieces lead's Unban IP — see window.AdminUnbanIp). */
    async function unbanIp(ip) {
        if (bansBusy) return false;
        const kit = banKit();
        const now = Date.now();
        const caught = kit ? normalisedBans().filter(n => kit.catchesIp(n, ip, now)) : [];
        const describe = n => {
            const level = n.level === "full" ? "Whole site" : n.level === "soft" ? "Everything but reading" : "Messages only";
            const end = n.until != null ? `until ${new Date(n.until).toUTCString().replace(/:\d\d GMT$/, " UTC")}` : "permanent";
            const target = n.kind === "net" ? "network" : "address";
            return `<br>· ${escapeHtml(level)}, ${escapeHtml(end)} (on the ${target}${n.reason ? ` — “${escapeHtml(n.reason)}”` : ""})`;
        };
        const message = caught.length
            ? `This lifts ${caught.length === 1 ? "this ban" : `all ${caught.length} of these bans`} on <b>${escapeHtml(ip)}</b> and its network:${caught.map(describe).join("")}`
            : `Lift every ban on <b>${escapeHtml(ip)}</b> and its network?`;
        if (!(await showConfirmDialog(message))) return false;
        bansBusy = true;
        let lifted = false;
        try {
            await Api.deleteBanByIp(adminToken, ip);
            lifted = true;
            await bansWritten();
        } catch (err) {
            if (err.status === 401) { lockOut(); return lifted; }
            await sayProblem(err.message || "Could not unban that address — try again.");
        } finally {
            bansBusy = false;
        }
        return lifted;
    }

    if (adminToken) {
        // Re-check the stored token is still valid (and not expired) before
        // trusting it, and recover the username it belongs to.
        Api.verifySession(adminToken).then(result => {
            if (!result) { lockOut(); return; }
            currentUsername = result.username;
            currentUserRole = result.role || "admin";
            // Who this tab belongs to, for the login handler's "is this
            // somebody else?" when the session later runs out.
            lastSignedInAs = result.username;
            // The same backstop as the login form's: said in the panel, not
            // left as an unhandled rejection behind a half-drawn page.
            enterAdmin().catch(err => showLoadBanner("Something went wrong opening the panel: " +
                ((err && err.message) || "unknown error") + ". Reload the page to try again."));
        }, () => {
            /* The check itself failed — the server was unreachable or
               erroring, which says nothing about the session. The token is
               KEPT (lockOut would wipe it) and the login box, which is
               already up, says to reload; signing in again works too. */
            loginError.textContent = "Couldn't reach the server to check your session. Reload the page to try again — you are still signed in.";
            loginError.style.display = "block";
        });
    }
});

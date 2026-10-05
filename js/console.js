/* Draggable Habbo-style "console" modal — opened via the header's console
   button (see home.html/style.css's .header-console-btn), built from the
   cnsl-* sprite set in assets/img/console/. Self-contained (own file, not
   folded into home.js) since it's a fairly independent feature: its own
   open/close, drag, tab pages, and the contributors read; the Add Maze Info,
   Missing Pieces and Profile pages are built by their own files
   (js/console-info.js, js/console-profile.js). */
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("console-modal");
    const openBtn = document.getElementById("header-console-btn");
    if (!modal || !openBtn) return; // page doesn't have the console (e.g. warren.html)

    const frame = document.getElementById("console-frame");
    const closeBtn = document.getElementById("console-close-btn");
    const tabButtons = document.querySelectorAll(".console-tab-btn");
    const screenScroll = document.getElementById("console-screen-scroll");
    const pages = {
        // What the CONTACT tab lands on: the choice between the two reasons
        // anyone opens it.
        contact: document.getElementById("console-page-contact"),
        people: document.getElementById("console-page-people"),
        privacy: document.getElementById("console-page-privacy"),
        // The signed-in player's page, built by js/console-profile.js
        // whenever it is shown (see the console:page event below).
        profile: document.getElementById("console-page-profile"),
        // Not tab-reachable — only ever shown by the Send button on
        // success, and left out of the tabButtons active-state match
        // below since no tab's data-page is "thanks".
        thanks: document.getElementById("console-page-thanks"),
        // The pages behind that choice. None is a tab of its own; CONTACT
        // stays lit while any shows, because all of them are still that tab
        // (see CONTACT_PAGES below). info and missing are built by
        // js/console-info.js.
        message: document.getElementById("console-page-message"),
        info: document.getElementById("console-page-info"),
        missing: document.getElementById("console-page-missing"),
        // Event Submission (30 Sept 2026), wired further down this file.
        entry: document.getElementById("console-page-entry"),
        // A notification waiting to be read (5 Oct 2026; NOTIFICATIONS
        // below). Not a tab, like thanks.
        notice: document.getElementById("console-page-notice"),
        // The PROFILE tab's own page, a choice of Notifications or Edit
        // Profile (5 Oct 2026, the owner's), and the Notifications list.
        me: document.getElementById("console-page-me"),
        notices: document.getElementById("console-page-notices")
    };

    // Notifications waiting, oldest first (NOTIFICATIONS, near the end).
    // Declared up here because openConsole reads it.
    let notices = [];

    // Which pages belong to the CONTACT tab, so the row of tab lights keeps
    // saying where you are rather than going blank on a sub-page.
    const CONTACT_PAGES = ["contact", "message", "info", "missing", "entry"];
    // And the PROFILE tab's: its landing page, Edit Profile and the list.
    const PROFILE_PAGES = ["me", "profile", "notices", "notice"];
    /* Where the console lands: the Profile tab's page of two choices, or,
       on a page that has no such page (fallinfurni.html loads this file
       too, with the console as it was), Edit Profile as it always did —
       a missing page would leave the screen blank (the bug scan, 5 Oct
       2026). */
    const landingPage = () => (pages.me ? "me" : "profile");

    function clearPrivacyHash() {
        if (location.hash === "#privacy") {
            history.replaceState(null, "", location.pathname + location.search);
        }
    }

    function showPage(name) {
        // The footer's Privacy Policy link parks a "#privacy" hash in the
        // URL to trigger opening straight to this page (see
        // openPrivacyFromHash below) — once the console-screen moves on to
        // a different page, that hash no longer describes what's showing,
        // so clear it. Left alone while name is still "privacy" itself,
        // including the very showPage("privacy") call that hash triggers.
        if (name !== "privacy") clearPrivacyHash();
        Object.entries(pages).forEach(([key, el]) => {
            // A page missing from this page's HTML is skipped rather than
            // thrown on, which would stop every tab from switching at all.
            if (!el) return;
            // The thanks page uses a flex column (see .console-page-thanks)
            // so its OK button can be pinned to the bottom — an inline
            // style here would otherwise beat that rule outright regardless
            // of specificity, forcing it back to a plain block.
            el.style.display = key !== name ? "none" : (key === "thanks" || key === "notice" || key === "notices" ? "flex" : "block");
        });
        const litTab = CONTACT_PAGES.includes(name) ? "contact" : PROFILE_PAGES.includes(name) ? "me" : name;
        tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.page === litTab));
        // All four pages share one scrollable container (#console-screen-
        // scroll) — its scrollTop otherwise carries over from whichever
        // page was showing before, and the browser clamps that straight to
        // the new page's own max scroll, landing it scrolled to the bottom
        // instead of a fresh page starting at the top.
        if (screenScroll) screenScroll.scrollTop = 0;
        // For the pages other files build, which want to fill themselves
        // each time they are shown rather than once at load.
        document.dispatchEvent(new CustomEvent("console:page", { detail: { name } }));
    }

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => showPage(btn.dataset.page));
    });

    // ---------- default position ----------

    // Anchored to #browse-window (the main chrome window) rather than a
    // fixed spot in the viewport — sits just off its right edge, vertically
    // centered to it. Computed fresh (via getBoundingClientRect, so it
    // accounts for the window's actual responsive position) every time the
    // console opens, right up until the user drags it somewhere themselves
    // — from then on their placement sticks across closes/reopens, same as
    // before, instead of snapping back to this default. Declared here,
    // ahead of openConsole below, since openPrivacyFromHash can call
    // openConsole synchronously during this same setup pass (a page loaded
    // straight at #privacy) — any later and hasBeenDragged would still be
    // in its temporal dead zone at that point.
    let hasBeenDragged = false;

    // Below this the browse window is nearly the full width of the screen,
    // so there is no "beside it" to sit in. Matches the phone breakpoint
    // css/style.css uses throughout.
    const CONSOLE_PHONE_MAX = 640;

    function positionConsoleDefault() {
        const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);

        /* On a phone the console is centred on the screen instead of
           anchored beside the browse window. Anchoring put its right edge
           exactly on the viewport boundary with 118px of page beside it on
           a 375px screen — and until it could be dragged by touch at all
           (see the drag below) there was no way to move it off there. */
        if (window.innerWidth <= CONSOLE_PHONE_MAX) {
            modal.style.left = Math.round(Math.min(maxLeft, Math.max(0, (window.innerWidth - modal.offsetWidth) / 2))) + "px";
            // Held nearer the top than the middle: a phone keyboard opening
            // for the Contact form takes the bottom half of the screen.
            modal.style.top = Math.round(Math.min(maxTop, Math.max(0, window.innerHeight * 0.16))) + "px";
            modal.style.transform = "none";
            return;
        }

        const chromeWindow = document.getElementById("browse-window");
        if (!chromeWindow) return;
        const winRect = chromeWindow.getBoundingClientRect();
        // Nudged 128px left and 40px up from dead-flush-and-centered on the
        // window's right edge, purely by eye/preference.
        const left = winRect.right - 128;
        const top = winRect.top + winRect.height / 2 - modal.offsetHeight / 2 - 40;
        modal.style.left = Math.min(maxLeft, Math.max(0, left)) + "px";
        modal.style.top = Math.min(maxTop, Math.max(0, top)) + "px";
        modal.style.transform = "none";
    }

    // Nothing used to reclamp the console's position on a browser window
    // resize — open it at a wide viewport, then shrink the window without
    // closing it, and it stayed exactly where it was, potentially entirely
    // outside the new (smaller) viewport with no way to drag it back short
    // of reloading the page. Reuses the exact same clamping math the drag
    // handler below already applies on every mousemove.
    function clampConsoleToViewport() {
        if (modal.style.display !== "block") return; // closed — nothing to reposition
        const rect = modal.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
        const left = Math.min(maxLeft, Math.max(0, rect.left));
        const top = Math.min(maxTop, Math.max(0, rect.top));
        if (left === rect.left && top === rect.top) return; // already fully on-screen
        modal.style.left = left + "px";
        modal.style.top = top + "px";
        modal.style.transform = "none";
    }
    window.addEventListener("resize", clampConsoleToViewport);

    // ---------- open/close ----------

    let dataLoaded = false;

    /* Where focus goes back to on closing. Closing (X or Escape) used to
       leave focus on a button that had just been hidden, which drops a
       keyboard user at the top of the page. Recorded only on a real open,
       not on a page change inside an open console. */
    let opener = null;

    function openConsole(defaultPage) {
        if (modal.style.display !== "block") {
            const active = document.activeElement;
            opener = active && active !== document.body && !modal.contains(active) ? active : null;
        }
        modal.style.display = "block";
        // Lands on Profile by default, the first tab — otherwise the tab buttons' own
        // .active state (only ever changed by clicking one) could disagree
        // with which page is actually showing after a close/reopen that
        // happened to follow a click on a different tab. openPrivacyFromHash
        // below passes "privacy" instead, landing there directly rather
        // than flashing through Profile first (which would also clear the
        // #privacy hash immediately via showPage's own cleanup, before the
        // privacy page ever actually showed).
        // A notification waiting goes first, unless the console was opened
        // for something particular (privacy, an entry link).
        showPage(!defaultPage && notices.length && pages.notice ? "notice" : (defaultPage || landingPage()));
        if (!defaultPage && notices.length && pages.notice) showNotice();
        if (!hasBeenDragged) positionConsoleDefault();
        // loadContributors sets dataLoaded itself, and only on a list that
        // actually arrived — so a failed read is asked again on the next open.
        if (!dataLoaded) loadContributors();
    }

    // Something the opener can no longer take: gone from the page, hidden,
    // or inside an inert region (the closed side menu, see wireSideMenu in
    // js/home.js). focus() on any of those silently does nothing.
    function canTakeFocus(el) {
        return !!(el && document.body.contains(el) && typeof el.focus === "function"
            && el.getClientRects().length && !(el.closest && el.closest("[inert]")));
    }

    /* opts.keepFocus is for a caller closing the console in order to open
       another window, which takes focus itself; handing it back to the
       opener would pull it out from under that window. And even without
       it, focus is only restored if it is still in the console (or lost to
       the body): anything that has already taken it elsewhere keeps it. */
    function closeConsole(opts) {
        const active = document.activeElement;
        const hadFocus = !active || active === document.body || modal.contains(active);
        modal.style.display = "none";
        clearPrivacyHash();
        const back = opener;
        opener = null;
        /* Said aloud, as console:page is (29 Sept 2026): a page that works
           while it is shown needs to know it no longer is. The Profile
           (js/console-profile.js) kept `showing` true after the console
           shut, and refetched player-profile at every later sign-in
           announcement for a window nobody could see. Before the focus
           return below, which may end the function early. */
        try { document.dispatchEvent(new CustomEvent("console:close")); } catch (e) { /* no listeners, no loss */ }
        if ((opts && opts.keepFocus) || !hadFocus) return;
        let landing = canTakeFocus(back) ? back : null;
        if (!landing && back && back.closest && back.closest("#side-menu")) {
            landing = document.getElementById("side-spine");
        }
        if (!canTakeFocus(landing)) landing = document.getElementById("header-console-btn");
        if (canTakeFocus(landing)) landing.focus({ preventScroll: true });
    }

    openBtn.addEventListener("click", () => openConsole());
    // Wrapped, so the click event is not read as closeConsole's options.
    closeBtn.addEventListener("click", () => closeConsole());

    /* Escape closes it, like every other modal on the site — the room modal,
       the lightbox and both of the landing page's own modals all do, and
       this was the one that only answered its X.

       Through the shared top-most-layer rule (EscapeLayers, js/site.js)
       rather than a listener of its own. This used to step aside whenever
       the room modal was open, on the belief that the modal was in front —
       but the console sits at z-index 200 against the overlay's 100, so it
       is the one in front, and Escape was closing the window BEHIND it.
       The shared rule compares where each actually paints. */
    if (window.EscapeLayers) {
        window.EscapeLayers.register({
            elements: () => modal.style.display === "block" ? [modal] : [],
            close: () => closeConsole()
        });
    }

    // The footer's Privacy Policy link (js/site.js) points at
    // "#privacy" on this page — a same-page hash change if already here,
    // a normal navigation otherwise — so this needs to run both at load
    // and on hashchange, same pattern as js/home.js's own openEventFromHash.
    function openPrivacyFromHash() {
        if (location.hash === "#submit-entry") return openEntryFromHash();
        if (location.hash !== "#privacy") return;
        openConsole("privacy");
    }
    window.addEventListener("hashchange", openPrivacyFromHash);

    /* /home#submit-entry opens the console on its Event Submission page
       (30 Sept 2026, the owner's) — what a description's
       [words](console:entry) link points at (see js/guide-text.js), so an
       event can say "Submit your entry" and mean it. Taken back off the
       address once it has opened, as #nickname is, so a refresh does not
       open it again. */
    function openEntryFromHash() {
        if (location.hash !== "#submit-entry") return;
        // Only home.html has the page. Fallin' Furni's console has none, and
        // opening it there showed an empty screen with no tab lit.
        if (!pages.entry) return;
        openConsole("entry");
        try { history.replaceState(history.state, "", location.pathname + location.search); } catch (e) { /* a sandboxed frame */ }
    }

    // The same link clicked on this page: straight to the page, with no
    // navigation — from inside a maze or event window the address is that
    // record's, so a plain link would reload the archive to get here. The
    // window it was pressed in is left open underneath.
    document.addEventListener("click", e => {
        const a = e.target && e.target.closest ? e.target.closest("a[data-console-page]") : null;
        if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        // A page this console lacks: the link's own address takes them there.
        const name = a.dataset.consolePage;
        if (!Object.prototype.hasOwnProperty.call(pages, name) || !pages[name]) return;
        e.preventDefault();
        openConsole(name);
    });
    // The first look is at the END of this handler (30 Sept 2026), not here.
    // From here, a page loaded at #privacy opened the console before
    // loadContributors' own consts (contributorsListEl, contributorsAsking)
    // existed: a ReferenceError inside it (an unhandled rejection, and an
    // error report) and a People page stuck on its placeholder until the
    // console was shut and opened again.

    // ---------- drag ----------

    /* Anywhere on the yellow chrome drags the console — everything that
       shouldn't (buttons, form fields, the screen itself, its own
       scrollbar) is excluded by the closest() check below, rather than
       requiring the drag to start on one specific narrow handle.

       Pointer events, not mouse events. A touch drag emits touchmove and no
       mousemove at all, so on a phone the chrome could be pressed and the
       console would simply never move — it was undraggable on every
       touchscreen, which is the same bug the photo frames and furni cards
       already had and were fixed for (see startFrameDrag in js/home.js).
       The pointer is captured on the frame so the moves and the release
       still arrive after the finger leaves it, and .console-frame carries
       touch-action: none in the CSS, without which the browser claims the
       gesture as a page scroll and cancels the stream mid-drag. */
    let dragging = false;
    let dragPointerId = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    frame.addEventListener("pointerdown", (e) => {
        // Touch and pen report button 0 like a left click; this only rejects
        // a genuine middle or right mouse button.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target.closest("button, input, textarea, .console-screen")) return;
        dragging = true;
        dragPointerId = e.pointerId;
        hasBeenDragged = true;
        frame.classList.add("is-dragging");
        const rect = modal.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        // Switches from the initial centered transform to an explicit
        // left/top the first time it's dragged, anchored at the exact
        // spot it already visually occupied so there's no jump.
        modal.style.left = rect.left + "px";
        modal.style.top = rect.top + "px";
        modal.style.transform = "none";
        document.body.style.userSelect = "none";
        if (frame.setPointerCapture) {
            try { frame.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
        }
        e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
        if (!dragging || e.pointerId !== dragPointerId) return;
        const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
        const left = Math.min(maxLeft, Math.max(0, e.clientX - dragOffsetX));
        const top = Math.min(maxTop, Math.max(0, e.clientY - dragOffsetY));
        modal.style.left = left + "px";
        modal.style.top = top + "px";
    });

    function endDrag(e) {
        if (!dragging || (e && e.pointerId !== dragPointerId)) return;
        dragging = false;
        dragPointerId = null;
        frame.classList.remove("is-dragging");
        document.body.style.userSelect = "";
    }

    window.addEventListener("pointerup", endDrag);
    // A cancelled pointer (the browser taking the gesture, a call arriving)
    // must not leave the console stuck to the finger.
    window.addEventListener("pointercancel", endDrag);

    // ---------- contact page ----------

    const messageInput = document.getElementById("console-contact-message");
    const usernameInput = document.getElementById("console-contact-username");
    const discordInput = document.getElementById("console-contact-discord");
    const hpInput = document.getElementById("console-contact-hp");
    const cancelBtn = document.getElementById("console-contact-cancel");
    const sendBtn = document.getElementById("console-contact-send");
    const statusEl = document.getElementById("console-contact-status");
    const thanksOkBtn = document.getElementById("console-thanks-ok");
    // The message page's form, whole. A page without it (or with half of
    // it) skips wiring the form rather than throwing here — which would
    // stop this handler before MazeConsole below is ever assigned, and take
    // the Add Maze Info and Missing Pieces pages down with it.
    const contactFormReady = !!(messageInput && usernameInput && discordInput && hpInput
        && cancelBtn && sendBtn && statusEl);

    /* The two forms' status lines are role="status" live regions, hidden
       (display:none) until there is something to say — and a screen reader
       often skips a region that enters the page with its words already in
       it. So (1 Oct 2026) the line is shown FIRST and its words set a frame
       later, as a change it will announce. Text the same as what is there
       is cleared at once, or the repeat (a second identical error) would
       be no change at all. A newer say, or a hide, cancels a pending one;
       liveText is what the line is about to say, for whoever asks before
       the frame. A hidden tab gets no frames, so it is set straight away. */
    const liveFrames = new WeakMap();
    const liveText = new WeakMap();
    function liveSay(el, text, isError) {
        if (liveFrames.has(el)) cancelAnimationFrame(liveFrames.get(el));
        liveFrames.delete(el);
        liveText.set(el, text || "");
        if (!text) {
            el.textContent = "";
            el.classList.toggle("is-error", Boolean(isError));
            el.style.display = "none";
            return;
        }
        el.style.display = "block";
        const put = () => {
            liveFrames.delete(el);
            el.textContent = text;
            el.classList.toggle("is-error", Boolean(isError));
        };
        if (document.hidden || typeof requestAnimationFrame !== "function") { put(); return; }
        if (el.textContent === text) el.textContent = "";
        liveFrames.set(el, requestAnimationFrame(put));
    }

    function showStatus(text, isError) {
        liveSay(statusEl, text, isError);
    }
    function hideStatus() {
        liveSay(statusEl, "");
    }

    /* Signed in, the Discord field has nothing left to ask. The name is
       already known, and the copy the server records is taken from the
       session rather than from this box — so leaving an editable field
       here would be inviting someone to type a name that would then be
       ignored.

       Swapped rather than prefilled, for that reason: a filled-in field
       looks editable, and this one is not. */
    const discordField = document.getElementById("console-contact-discord-field");
    const signedAsEl = document.getElementById("console-contact-signed-as");

    function paintContactIdentity(player) {
        if (!discordField || !signedAsEl) return;
        if (player) {
            discordField.hidden = true;
            signedAsEl.hidden = false;
            // A comma, not a dash: this line is set in Volter Goldfish, which
            // draws U+2014 as a musical note (see PICTURE_GLYPHS in js/site.js).
            signedAsEl.textContent = `Sending as ${player.name}, signed in with Discord.`;
        } else {
            discordField.hidden = false;
            signedAsEl.hidden = true;
            signedAsEl.textContent = "";
        }
    }

    if (window.Account) {
        paintContactIdentity(Account.current);
        Account.onChange(paintContactIdentity);
        Account.ready();
    }

    // Back to the choice screen, and empties the form on the way — coming
    // back to a half-written message you had already abandoned is worse
    // than starting again.
    if (contactFormReady) cancelBtn.addEventListener("click", () => {
        messageInput.value = "";
        usernameInput.value = "";
        discordInput.value = "";
        hideStatus();
        showPage("contact");
    });

    // The ways out of the choice screen. The two Missing Pieces pages are
    // js/console-info.js's; it fills them before they are shown.
    const choiceContactBtn = document.getElementById("console-choice-contact");
    const choiceInfoBtn = document.getElementById("console-choice-info");
    const choiceMissingBtn = document.getElementById("console-choice-missing");
    if (choiceContactBtn) choiceContactBtn.addEventListener("click", () => showPage("message"));
    if (choiceInfoBtn) choiceInfoBtn.addEventListener("click", () => MazeConsole.openInfo(null));
    if (choiceMissingBtn) choiceMissingBtn.addEventListener("click", () => MazeConsole.openMissing());

    // Saved server-side (netlify/functions/contact.js -> MongoDB, visible
    // on the admin page) and, if the function has RESEND_API_KEY/
    // CONTACT_NOTIFY_EMAIL configured, forwarded on as an email — that
    // recipient address lives only in Netlify's own environment variables,
    // never in this file or anywhere else client-side.
    if (contactFormReady) sendBtn.addEventListener("click", async () => {
        const message = messageInput.value.trim();
        if (!message) {
            messageInput.focus();
            return;
        }
        sendBtn.disabled = true;
        // Said, as the entry form and Add Maze Info say it (1 Oct 2026): a
        // cold function can take seconds, and a greyed-out button alone
        // looked like nothing was happening. Success leaves for Thanks.
        showStatus("Sending...", false);
        try {
            await Api.submitContactMessage(message, usernameInput.value.trim(), discordInput.value.trim(), hpInput.value);
            messageInput.value = "";
            usernameInput.value = "";
            discordInput.value = "";
            hideStatus();
            // The thanks page's own sentence: an Add Maze Info send before
            // this one may have left its wording there.
            MazeConsole.showThanks();
        } catch (e) {
            // A blocked sender (403 { banned }) gets the site's own "Can't
            // Send" notice instead of the raw words (29 Sept 2026).
            if (window.Account && Account.writeRefused && Account.writeRefused(e.status, e.data, "send")) {
                hideStatus();
            } else if (e.status === 401) {
                /* A session the server has revoked (30 Sept 2026; see
                   writeRefusal in _bans.js), which answered with the cookie
                   cleared: the page is told, as the Event Submission page
                   tells it, and the message stays in its box. */
                if (window.Account && typeof Account.refresh === "function") Account.refresh();
                showStatus("You were signed out. Press Send again to send it without an account.", true);
            } else {
                showStatus(e.message || "Something went wrong. Try again in a moment.", true);
            }
        } finally {
            sendBtn.disabled = false;
        }
    });

    const thanksMessageEl = document.getElementById("console-thanks-message");
    const THANKS_DEFAULT = thanksMessageEl ? thanksMessageEl.textContent : "";
    const thanksNoteEl = document.getElementById("console-thanks-note");
    if (thanksOkBtn) thanksOkBtn.addEventListener("click", () => showPage("contact"));

    /* The console, for the rest of the page. js/console-info.js fills the
       Add Maze Info and Missing Pieces pages and assigns openInfo and
       openMissing below; js/home.js calls them from a maze's INCOMPLETE tab
       and from the side menu. Those two are stubs until console-info.js has
       run, which is at DOMContentLoaded like this file — nothing can press
       a button before then. */
    /* THE CONSOLE'S SOUNDS (5 Oct 2026, the owner's): Habbo's own console
       sounds, cut from his clip — "sent" when a console form goes through
       (showThanks, below: Contact Us, Add Maze Info, an event entry), and
       "notice" when a notification arrives (checkNotices). Both are loud as
       recorded, so they play well down. A browser lets a page make no sound
       until the visitor has clicked, tapped or typed on it: one refused is
       kept and played at the first of those instead (a notification that
       came while they were away, met on their way back in). */
    const SOUND_VOLUME = 0.3;
    const SOUNDS = { sent: "assets/sounds/console-sent.wav", notice: "assets/sounds/console-notice.wav" };
    const soundEls = {};
    let soundWaiting = null;
    function playSound(name) {
        if (!SOUNDS[name] || typeof Audio !== "function") return;
        const el = soundEls[name] || (soundEls[name] = new Audio(SOUNDS[name]));
        el.volume = SOUND_VOLUME;
        try { el.currentTime = 0; } catch (e) { /* not loaded yet */ }
        const played = el.play();
        if (played && typeof played.catch === "function") {
            played.catch(err => { if (err && err.name === "NotAllowedError") waitForGesture(name); });
        }
    }
    function waitForGesture(name) {
        if (soundWaiting) { soundWaiting = name; return; }
        soundWaiting = name;
        const go = () => {
            ["pointerdown", "keydown", "touchend"].forEach(t => document.removeEventListener(t, go, true));
            const n = soundWaiting;
            soundWaiting = null;
            playSound(n);
        };
        ["pointerdown", "keydown", "touchend"].forEach(t => document.addEventListener(t, go, true));
    }

    const MazeConsole = window.MazeConsole = {
        open(page) {
            if (modal.style.display === "block") showPage(page || "contact");
            else openConsole(page);
        },
        showPage,
        // The thanks page with its own sentence, then its default again for
        // the next time the Contact form uses it.
        // `note`: a second line under it, in the screen's ordinary weight.
        showThanks(text, note) {
            if (thanksMessageEl) thanksMessageEl.textContent = text || THANKS_DEFAULT;
            if (thanksNoteEl) { thanksNoteEl.textContent = note || ""; thanksNoteEl.hidden = !note; }
            showPage("thanks");
            // Only ever reached once a form has gone through, so a failed
            // send makes no sound.
            playSound("sent");
        },
        resetThanks() {
            if (thanksMessageEl) thanksMessageEl.textContent = THANKS_DEFAULT;
            if (thanksNoteEl) { thanksNoteEl.textContent = ""; thanksNoteEl.hidden = true; }
        },
        openInfo() { MazeConsole.open("info"); },
        openMissing() { MazeConsole.open("missing"); },
        openProfile() { MazeConsole.open("profile"); },
        // close({ keepFocus: true }) when closing to open another window.
        close: (opts) => closeConsole(opts)
    };

    // ---------- event submission (30 Sept 2026) ----------

    /* A Habbo Origins username and one picture, sent to
       netlify/functions/event-entries.js — signed in or not. The server
       decides which event it is for (the one the admins have opened in the
       Warren, or the one event running right now); this page only asks, to
       say "Entering: ..." above the form, and says nothing when there is no
       such event. The picture is sent in the same request as the name: a
       single 4MB picture fits a function's body, and anything bigger that
       is shrunk here first (shrinkToFit). */
    const entryUsername = document.getElementById("console-entry-username");
    const entryImage = document.getElementById("console-entry-image");
    const entryHp = document.getElementById("console-entry-hp");
    const entryCancel = document.getElementById("console-entry-cancel");
    const entrySend = document.getElementById("console-entry-send");
    const entryStatus = document.getElementById("console-entry-status");
    const entryEventEl = document.getElementById("console-entry-event");
    const entrySignedAs = document.getElementById("console-entry-signed-as");
    const entryFormReady = !!(entryUsername && entryImage && entryHp && entryCancel && entrySend && entryStatus);

    const ENTRY_IMAGE_MAX = 4 * 1024 * 1024;
    // PNG and JPG only (30 Sept 2026, the owner's) — the server holds the
    // same line by the file's own bytes; see SIGNATURES in event-entries.js.
    const ENTRY_TYPES = ["image/png", "image/jpeg"];
    const ENTRY_EXTENSION = /\.(png|jpe?g)$/i;

    function entrySay(text, isError) {
        if (!entryStatus) return;
        // Shown first, worded a frame later: see liveSay above.
        liveSay(entryStatus, text, isError);
    }

    function paintEntryIdentity(player) {
        if (!entrySignedAs) return;
        entrySignedAs.hidden = !player;
        // A comma, not a dash: Volter draws U+2014 as a picture.
        entrySignedAs.textContent = player ? `Sending as ${player.name}, signed in with Discord.` : "";
    }
    if (window.Account) {
        paintEntryIdentity(Account.current);
        Account.onChange(paintEntryIdentity);
    }

    /* CLOSED (30 Sept 2026, the owner's): the Warren can shut entries
       altogether. The page then says so and its form is disabled, rather
       than letting somebody fill it in to be refused at Send. Learnt from
       ?action=open each time the page is shown, and from a POST refused
       with { closed: true } (closed while the page sat open). */
    /* The server's own words when it gives them (2 Oct 2026): a picked
       event opens and closes with its dates, so "closed" can be "Entries
       for Vermin's Vault open at 19:05 UTC on 3 October." */
    let ENTRY_CLOSED = "Entries are closed just now.";
    let entryClosed = false;
    function setEntryClosed(closed, message) {
        const was = entryClosed;
        const wasSaying = ENTRY_CLOSED;
        entryClosed = Boolean(closed);
        if (entryClosed && typeof message === "string" && message.trim()) ENTRY_CLOSED = message.trim();
        if (!entryFormReady) return;
        entryUsername.disabled = entryClosed;
        entryImage.disabled = entryClosed;
        entrySend.disabled = entryClosed || entrySending;
        if (entryClosed) entrySay(ENTRY_CLOSED, true);
        else if (was && liveText.get(entryStatus) === wasSaying) entrySay("");
    }

    /* Whether the Event Submission page is what the console shows now —
       see console:page and console:close below. A send that answers after
       the visitor has gone Back, or to another page, or shut the console,
       leaves the page quietly (30 Sept 2026): no jump to Entry Submitted,
       no error written onto a form nobody is reading. */
    let entryShowing = false;

    /* Asked each time the page is shown: the event can change while the
       site is open. A failed ask hides the line rather than guessing, and
       leaves the form open — the server still refuses a closed entry.
       Fetched here rather than through Api.getEventEntryOpen, which hands
       back only the event and not `closed`. */
    let entryAsk = 0;
    async function askEntryOpen() {
        const ctrl = typeof AbortController === "function" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
        try {
            const res = await fetch("/.netlify/functions/event-entries?action=open", {
                headers: { Accept: "application/json" },
                credentials: "same-origin",
                cache: "no-store",
                ...(ctrl ? { signal: ctrl.signal } : {})
            });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            // The server's clock, from its Date header, when it gives one.
            let serverNow = NaN;
            try { serverNow = Date.parse(res.headers && res.headers.get ? res.headers.get("date") || "" : ""); } catch (e) { serverNow = NaN; }
            return {
                serverNow,
                event: data && data.event && typeof data.event === "object" ? data.event : null,
                closed: Boolean(data && data.closed === true),
                message: data && typeof data.message === "string" ? data.message : "",
                changesAt: data && typeof data.changesAt === "string" ? Date.parse(data.changesAt) : NaN
            };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }
    async function paintEntryEvent() {
        if (!entryEventEl && !entryFormReady) return;
        const mine = ++entryAsk;
        let answer = null;
        try { answer = await askEntryOpen(); } catch (e) { answer = null; }
        if (mine !== entryAsk) return;
        const ev = answer && answer.event;
        const title = ev && typeof ev.title === "string" ? ev.title.trim() : "";
        if (entryEventEl) {
            entryEventEl.hidden = !title;
            entryEventEl.textContent = title ? `Entering: ${title}` : "";
        }
        if (answer) setEntryClosed(answer.closed, answer.message);
        /* A picked event opens and shuts at its own times (2 Oct 2026): a
           form left showing asks again just after, so 19:05 opens it without
           a reopen. Only while the page shows, and within a day. */
        /* Timed by the server's clock, not this device's (2 Oct 2026): a
           device running fast asked again before 19:05, was told "not yet"
           with a changesAt already behind it, and re-asked every 1.5s until
           the server agreed — all evening, for a clock hours out. A time
           already past by the server's clock is asked again in 10s. Up to
           3s more at random, so every form left open doesn't ask in the
           same second. */
        clearTimeout(entryRecheck);
        const now = answer && Number.isFinite(answer.serverNow) ? answer.serverNow : Date.now();
        const wait = answer ? answer.changesAt - now : NaN;
        if (entryShowing && Number.isFinite(wait) && wait < 24 * 60 * 60 * 1000) {
            entryRecheck = setTimeout(() => { if (entryShowing) paintEntryEvent(); }, (wait > 0 ? wait + 1500 : 10000) + Math.floor(Math.random() * 3000));
        }
    }
    let entryRecheck = 0;

    function readFileAsDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error("Couldn't read that file."));
            r.readAsDataURL(blob);
        });
    }

    // Decoded bytes of a base64 data: URL, near enough.
    function dataUrlBytes(dataUrl) {
        const comma = dataUrl.indexOf(",");
        return Math.floor((dataUrl.length - comma - 1) * 3 / 4);
    }

    /* A picture over the cap, redrawn smaller as a JPEG until it fits.
       Anything the browser cannot draw is refused in words. */
    async function shrinkToFit(file) {
        const url = URL.createObjectURL(file);
        try {
            const img = await new Promise((resolve, reject) => {
                const im = new Image();
                im.onload = () => resolve(im);
                im.onerror = () => reject(new Error("That picture couldn't be read. Try a PNG or JPG."));
                im.src = url;
            });
            let scale = Math.min(1, 2560 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
            for (let attempt = 0; attempt < 6; attempt++) {
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#ffffff";          // a JPEG has no transparency
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
                if (dataUrlBytes(dataUrl) <= ENTRY_IMAGE_MAX) return dataUrl;
                scale *= 0.75;
            }
        } finally {
            URL.revokeObjectURL(url);
        }
        throw new Error("That picture is too big. Keep it under 4MB.");
    }

    /* The same entry sent twice — a timeout whose request had landed, a
       double press — is one entry: entryRef names this submission, is kept
       through retries, and is dropped by any change to the form or a
       success, as Add Maze Info's clientRef is (js/console-info.js). */
    let entryRef = null;
    let entrySending = false;
    function newEntryRef() {
        try {
            if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
        } catch (e) { /* fall through */ }
        return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    }

    function clearEntryForm() {
        entryUsername.value = "";
        try { entryImage.value = ""; } catch (e) { /* some browsers refuse; harmless */ }
        entryHp.value = "";
        entryRef = null;
        entrySay(entryClosed ? ENTRY_CLOSED : "", entryClosed);
    }

    /* A change made while a send is in flight is held until it answers, as
       editedSubmission does in js/console-info.js (30 Sept 2026): it used to
       be ignored, so after a failed send the fixed name went out under the
       old ref, and the server answered with the first entry as it was. */
    let entryEditedWhileSending = false;
    function entryEdited() {
        if (entrySending) entryEditedWhileSending = true;
        else entryRef = null;
    }

    if (entryFormReady) {
        entryUsername.addEventListener("input", entryEdited);
        entryImage.addEventListener("change", () => { entryEdited(); if (!entryClosed) entrySay(""); });
        entryCancel.addEventListener("click", () => {
            clearEntryForm();
            showPage("contact");
        });

        entrySend.addEventListener("click", async () => {
            if (entrySending) return;
            if (entryClosed) { entrySay(ENTRY_CLOSED, true); return; }
            const habboName = entryUsername.value.trim();
            if (!habboName) {
                entrySay("What's your Habbo Origins username?", true);
                entryUsername.focus();
                return;
            }
            const file = entryImage.files && entryImage.files[0];
            if (!file) {
                entrySay("Add a picture of your entry.", true);
                return;
            }
            // A 0-byte file: said here, not sent to be refused.
            if (!file.size) {
                entrySay("That file is empty.", true);
                return;
            }
            // A type the browser gives is taken at its word; with none (some
            // Windows set-ups), the file's own extension decides.
            if (file.type ? ENTRY_TYPES.indexOf(file.type) === -1 : !ENTRY_EXTENSION.test(file.name || "")) {
                entrySay("Pictures only: PNG or JPG.", true);
                return;
            }
            entrySending = true;
            entrySend.disabled = true;
            if (!entryRef) entryRef = newEntryRef();
            try {
                entrySay("Sending...");
                const dataUrl = file.size > ENTRY_IMAGE_MAX ? await shrinkToFit(file) : await readFileAsDataUrl(file);
                const sent = await Api.submitEventEntry({ habboName, dataUrl, website: entryHp.value, clientRef: entryRef });
                // Cleared either way, so a return visit starts fresh.
                clearEntryForm();
                /* Two entries an event (2 Oct 2026): the first says one more
                   can follow to correct it, the correction that it's the last. */
                const forEvent = sent && sent.event && typeof sent.correction === "boolean";
                /* The approval comes as a console notification (5 Oct 2026,
                   the owner's; notifications.js) — to whoever was signed in
                   to send it, so only they are promised one. */
                const willNotify = !!(window.Account && Account.current);
                if (entryShowing) MazeConsole.showThanks(!forEvent ? "Entry Submitted"
                    : sent.correction ? "Correction Submitted. That's both of your entries for this event."
                    : "Entry Submitted. If you need to correct it, you can send one more.",
                    willNotify ? "We'll notify you when your entry has been approved." : "");
            } catch (e) {
                // Changed on its way: the retry is a new entry (entryEdited).
                if (entryEditedWhileSending) entryRef = null;
                const status = e && e.status;
                const closedNow = status === 403 && e.data && e.data.closed === true;
                // A session revoked or forgotten while the tab sat open: the
                // page is told who it is now, whether or not it is showing.
                if (status === 401 && window.Account && typeof Account.refresh === "function") Account.refresh();
                if (closedNow) setEntryClosed(true, e.message);
                if (!entryShowing) {
                    // Left mid-send: nothing written onto the form.
                    if (!entryClosed) entrySay("");
                } else if (closedNow) {
                    // setEntryClosed has said so.
                } else if (status === 401) {
                    entrySay("You were signed out. Press Send again to enter without an account.", true);
                } else if (window.Account && Account.writeRefused && Account.writeRefused(e.status, e.data, "send")) {
                    // A blocked sender gets the site's own "Can't Send" window.
                    entrySay("");
                } else {
                    entrySay((e && e.message) || "Something went wrong. Try again in a moment.", true);
                }
            } finally {
                entrySending = false;
                entryEditedWhileSending = false;
                entrySend.disabled = entryClosed;
            }
        });
    }

    const choiceEntryBtn = document.getElementById("console-choice-entry");
    if (choiceEntryBtn) choiceEntryBtn.addEventListener("click", () => showPage("entry"));
    document.addEventListener("console:page", e => {
        entryShowing = Boolean(e.detail && e.detail.name === "entry");
        if (entryShowing) paintEntryEvent();
    });
    document.addEventListener("console:close", () => { entryShowing = false; clearTimeout(entryRecheck); });

    // ---------- contributors page ----------

    const contributorsListEl = document.getElementById("console-contributors-list");

    // Contributors are admin-entered, not visitor-submitted, but this page
    // is public (every visitor can open it, unlike the admin-only list this
    // same data also renders into) — escaping here keeps a bad paste or a
    // compromised admin account from running in every visitor's browser
    // instead of just the admin's own session.
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    /* What a contributor's total is a total OF, from the kinds of work they
       are credited with.

       The page used to call every total "Mazes" regardless — someone
       credited only for event images still read as "9 Mazes". A collab is a
       maze, so Collab Images counts on that side too; Historical Data and
       Web Development belong to neither, and get the neutral word rather
       than being forced onto one. */
    const MAZE_TYPES = ["Room Images", "Collab Images"];
    const EVENT_TYPES = ["Event Images"];

    function contributionUnit(types, total) {
        const list = types || [];
        const mazes = list.some(t => MAZE_TYPES.includes(t));
        const events = list.some(t => EVENT_TYPES.includes(t));
        if (mazes && events) return "Mazes / Events";
        if (mazes) return total === 1 ? "Maze" : "Mazes";
        if (events) return total === 1 ? "Event" : "Events";
        return total === 1 ? "Contribution" : "Contributions";
    }

    /* One contributor: who and how much on the first line, what kind of
       work underneath.

       It used to be a name with "- 22 Mazes" hyphenated onto the end of it,
       reading as part of the name, and then the types as a comma sentence
       that wrapped to three lines in a 183px column and swamped the entry.
       The number behind it was hand-typed with nothing to back it; the admin
       page now records which mazes and which events a person actually
       worked on (see js/admin.js) and the total follows from those. */
    function contributorHtml(contributor) {
        const total = contributor.count || 0;
        const unit = contributionUnit(contributor.types, total);

        // Types as chips rather than a comma run: they are labels, not prose.
        const types = (contributor.types || [])
            .map(t => `<span class="console-contributor-tag">${escapeHtml(t)}</span>`)
            .join("");

        return `
            <div class="console-contributor">
                <p class="console-contributor-head">
                    <span class="console-contributor-name">${escapeHtml(contributor.username)}</span>
                    <span class="console-contributor-count">${escapeHtml(total)} <span class="console-contributor-unit">${escapeHtml(unit)}</span></span>
                </p>
                ${types ? `<p class="console-contributor-types">${types}</p>` : ""}
            </div>
        `;
    }

    /* A failed read is not an empty list. Api.getContributors falls back to
       [] and records "contributor data" in Api._degraded, and this used to
       take that [] at its word: "No contributors listed yet." for the rest
       of the visit, with dataLoaded already set so nothing ever asked
       again. Now a failure says so, in the Missing Pieces page's words
       (js/console-info.js), with a Retry — and dataLoaded stays unset, so
       reopening the console asks again too. */
    let contributorsAsking = false;

    async function loadContributors() {
        if (!contributorsListEl || contributorsAsking) return;
        contributorsAsking = true;
        let contributors;
        try {
            contributors = await Api.getContributors();
        } finally {
            contributorsAsking = false;
        }
        const failed = !Array.isArray(contributors)
            || (Api._degraded && Api._degraded.has("contributor data"));
        if (failed) {
            contributorsListEl.innerHTML = `
                <p class="console-blurb">The list couldn't be reached just now.</p>
                <button type="button" class="console-btn" data-contributors-retry>Retry</button>`;
            return;
        }
        dataLoaded = true;
        if (!contributors.length) {
            contributorsListEl.innerHTML = '<p class="console-empty-page" style="height:auto;padding:14px 0;">No contributors listed yet.</p>';
            return;
        }
        // Most contributions first; ties broken alphabetically by username
        // so the order stays stable/predictable rather than falling back
        // to whatever order the API happened to return them in.
        const sorted = contributors.slice().sort((a, b) =>
            (b.count || 0) - (a.count || 0) || (a.username || "").localeCompare(b.username || "")
        );
        // .console-dotline between each contributor, not after the last one.
        contributorsListEl.innerHTML = sorted
            .map(contributorHtml)
            .join('<div class="console-dotline"></div>');
    }

    if (contributorsListEl) {
        contributorsListEl.addEventListener("click", e => {
            if (!e.target.closest("[data-contributors-retry]")) return;
            contributorsListEl.innerHTML = '<p class="console-blurb">Loading...</p>';
            loadContributors();
        });
    }

// ---------- privacy page ----------

// Text and markup both come from js/privacy-content.js, shared with the
// landing page's own privacy modal (js/welcome.js) so the two can never
// drift apart. Rendered once at load rather than on each open — it never
// changes between opens.
if (typeof renderPrivacySections === "function") {
    renderPrivacySections(document.getElementById("console-privacy-body"));
}

    // ---------- NOTIFICATIONS (5 Oct 2026, the owner's) ----------
    /* What netlify/functions/notifications.js has waiting for this visitor:
       an event entry approved, or a notice sent from the Warren. While one
       is unread the header's console button wears its alert picture, and
       opening the console shows it first, centred on the screen, with an
       OK. One at a time; OK marks it seen, on the account when signed in
       and in this browser always (a notice for everyone reaches somebody
       signed out too, and only the browser can remember them). Asked on
       load, on signing in or out, and when the tab comes back after a
       while. */
    const NOTICE_URL = "/.netlify/functions/notifications";
    const NOTICE_SEEN_KEY = "mazerats_notices_seen";
    // Asked every minute while the tab is in view; on coming back to the
    // tab, at once if the last answer is over 15 seconds old (see LIVE below).
    const NOTICE_POLL_MS = 60 * 1000;
    const NOTICE_RECHECK_MS = 15 * 1000;
    const ICON = "assets/img/console-icon.png";
    const ICON_ALERT = "assets/img/console-icon-alert.gif";
    const noticeTextEl = document.getElementById("console-notice-text");
    const noticeCountEl = document.getElementById("console-notice-count");
    const noticeOkBtn = document.getElementById("console-notice-ok");
    const openImg = openBtn.querySelector("img");

    function localSeen() {
        try { return JSON.parse(localStorage.getItem(NOTICE_SEEN_KEY) || "[]") || []; } catch (e) { return []; }
    }
    function rememberSeen(nid) {
        try {
            const list = localSeen().filter(x => x !== nid);
            list.push(nid);
            localStorage.setItem(NOTICE_SEEN_KEY, JSON.stringify(list.slice(-100)));
        } catch (e) { /* private mode: the account still has it, if signed in */ }
    }
    /* Deleted from the Notifications list (5 Oct 2026, the owner's): for
       this visitor only. Signed in, the account keeps it (noticesDeleted);
       the browser keeps it as well, which is all a signed-out visitor has. */
    // The notices the arrival sound has already played for (checkNotices).
    const NOTICE_CHIMED_KEY = "mazerats_notices_chimed";
    function localChimed() {
        try { return JSON.parse(localStorage.getItem(NOTICE_CHIMED_KEY) || "[]") || []; } catch (e) { return []; }
    }
    function rememberChimed(nids) {
        try {
            const list = localChimed().filter(x => !nids.includes(x)).concat(nids);
            localStorage.setItem(NOTICE_CHIMED_KEY, JSON.stringify(list.slice(-100)));
        } catch (e) { /* private mode: it may play again on the next visit */ }
    }
    const NOTICE_DELETED_KEY = "mazerats_notices_deleted";
    function localDeleted() {
        try { return JSON.parse(localStorage.getItem(NOTICE_DELETED_KEY) || "[]") || []; } catch (e) { return []; }
    }
    function rememberDeleted(nid) {
        try {
            const list = localDeleted().filter(x => x !== nid);
            list.push(nid);
            localStorage.setItem(NOTICE_DELETED_KEY, JSON.stringify(list.slice(-100)));
        } catch (e) { /* private mode: the account still has it, if signed in */ }
    }

    /* A notice's words as markup: escaped, then **this** in the bold cut
       (5 Oct 2026, the owner's: the Warren's Bold button writes the
       asterisks; js/admin-notifications.js previews with the same rule). In
       one span, because the line is a flex box that would otherwise make
       each bold run an item of its own. */
    function noticeHtml(text) {
        const safe = String(text || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
        return `<span class="console-notice-inner">${safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</span>`;
    }

    function paintNoticeIcon() {
        const n = notices.length;
        if (openImg) openImg.src = n ? ICON_ALERT : ICON;
        openBtn.classList.toggle("has-notice", n > 0);
        openBtn.setAttribute("aria-label", n ? `Console: ${n} new ${n === 1 ? "notification" : "notifications"}` : "Console");
    }

    // The nid on screen, so OK marks THAT one read even if a check has
    // changed the queue under it since (the bug scan, 5 Oct 2026).
    let shownNid = null;
    function showNotice() {
        const n = notices[0];
        shownNid = n ? n.nid : null;
        if (!n) { leaveNotices(); return; }
        if (noticeTextEl) noticeTextEl.innerHTML = noticeHtml(n.text);
        if (noticeCountEl) {
            noticeCountEl.hidden = notices.length < 2;
            noticeCountEl.textContent = `${notices.length - 1} more after this`;
        }
        if (noticeOkBtn && modal.style.display === "block") noticeOkBtn.focus({ preventScroll: true });
    }
    // Off the notice page to the Profile tab's page, with focus on its first
    // button rather than lost with the OK it hid.
    function leaveNotices() {
        showPage(landingPage());
        if (modal.style.display !== "block") return;
        const first = pages.me && pages.me.querySelector("button");
        if (first) first.focus({ preventScroll: true });
    }
    const noticePageShowing = () => !!(pages.notice && pages.notice.style.display !== "none" && modal.style.display === "block");

    /* Each check is its own: one started after a sign-in or sign-out is
       never answered with one that left before it (checkGen), and the
       queue is emptied the moment who is signed in changes, so the last
       player's own notices are not left on a shared computer while the
       new answer is on its way (the bug scan, 5 Oct 2026). */
    let noticeCheckedAt = 0;
    let checkGen = 0;
    function checkNotices() {
        // A page without the notice pages (fallinfurni.html) has nowhere to show one.
        if (!pages.notice || !noticeOkBtn) return Promise.resolve();
        const mine = ++checkGen;
        noticeCheckedAt = Date.now();
        return fetch(NOTICE_URL, { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" })
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (mine !== checkGen || !data || !Array.isArray(data.notices)) return;
                const seen = new Set([...localSeen(), ...localDeleted()]);
                notices = data.notices.filter(n => n && n.nid && !seen.has(n.nid));
                paintNoticeIcon();
                // The sound, once for each notice however often it is asked
                // about: a reload or another tab does not play it again.
                const chimed = new Set(localChimed());
                const fresh = notices.filter(n => !chimed.has(n.nid));
                if (fresh.length) {
                    rememberChimed(fresh.map(n => n.nid));
                    playSound("notice");
                }
                // On the notice page: what it shows follows the new queue.
                if (noticePageShowing() && (!notices.length || notices[0].nid !== shownNid)) showNotice();
            })
            .catch(() => { /* asked again later; nothing to show meanwhile */ });
    }

    if (noticeOkBtn) {
        noticeOkBtn.addEventListener("click", () => {
            const i = notices.findIndex(x => x.nid === shownNid);
            const n = i >= 0 ? notices.splice(i, 1)[0] : null;
            if (n) {
                rememberSeen(n.nid);
                fetch(NOTICE_URL, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ seen: [n.nid] })
                }).catch(() => { /* the browser has it; the account learns next time */ });
            }
            paintNoticeIcon();
            if (notices.length) showNotice(); else leaveNotices();
        });
    }

    /* THE PROFILE TAB'S PAGE and THE NOTIFICATIONS LIST (5 Oct 2026, the
       owner's): Profile lands on a choice of two, as Contact does —
       Notifications, every notice this visitor has been sent, newest first
       (read ones too), and Edit Profile. Each has a Back to the choice. */
    const noticesListEl = document.getElementById("console-notices-list");
    const fmtNoticeDay = iso => {
        const t = Date.parse(iso);
        return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
    };
    const noticesDeleteBtn = document.getElementById("console-notices-delete");
    const NO_NOTICES = `<p class="console-blurb console-notices-empty">No notifications yet.</p>`;
    let historyGen = 0;
    /* One notice picked at a time (5 Oct 2026, the owner's): a click draws a
       border round it and brings up Delete; a second click on it, or Back,
       lets it go. */
    let pickedNid = null;
    function pickNotice(nid) {
        pickedNid = nid;
        if (noticesListEl) noticesListEl.querySelectorAll(".console-notices-item").forEach(el => {
            const on = el.dataset.nid === nid;
            el.classList.toggle("is-picked", on);
            el.setAttribute("aria-pressed", String(on));
        });
        if (noticesDeleteBtn) noticesDeleteBtn.hidden = !nid;
    }
    function showNoticeHistory() {
        showPage("notices");
        pickNotice(null);
        if (!noticesListEl) return;
        const mine = ++historyGen;
        noticesListEl.innerHTML = `<p class="console-blurb">Loading...</p>`;
        fetch(NOTICE_URL + "?all=1", { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" })
            .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then(data => {
                if (mine !== historyGen) return;
                const gone = new Set(localDeleted());
                const list = ((data && Array.isArray(data.notices)) ? data.notices : []).filter(n => n && n.nid && !gone.has(n.nid));
                noticesListEl.innerHTML = list.length
                    ? list.map(n => `
                        <button type="button" class="console-notices-item" data-nid="${n.nid}" aria-pressed="false">
                            <span class="console-notices-day">${fmtNoticeDay(n.at)}</span>
                            <span class="console-notices-text">${noticeHtml(n.text)}</span>
                        </button>`).join('<div class="console-dotline"></div>')
                    : NO_NOTICES;
            })
            .catch(() => {
                if (mine !== historyGen) return;
                noticesListEl.innerHTML = `<p class="console-blurb">Your notifications couldn't be loaded just now. Try again in a moment.</p>`;
            });
    }
    if (noticesListEl) {
        noticesListEl.addEventListener("click", e => {
            const item = e.target.closest(".console-notices-item");
            if (item) pickNotice(item.dataset.nid === pickedNid ? null : item.dataset.nid);
        });
    }
    if (noticesDeleteBtn) {
        noticesDeleteBtn.addEventListener("click", () => {
            const nid = pickedNid;
            const item = nid && noticesListEl && noticesListEl.querySelector(`.console-notices-item[data-nid="${nid}"]`);
            if (!item) { pickNotice(null); return; }
            // The dotted line that went with it: the one before, or for the
            // first notice, the one after.
            const line = item.previousElementSibling || item.nextElementSibling;
            if (line && line.classList.contains("console-dotline")) line.remove();
            item.remove();
            if (!noticesListEl.querySelector(".console-notices-item")) noticesListEl.innerHTML = NO_NOTICES;
            pickNotice(null);
            rememberDeleted(nid);
            rememberSeen(nid);
            // Out of the unread queue too, so the console icon settles.
            const i = notices.findIndex(x => x.nid === nid);
            if (i >= 0) { notices.splice(i, 1); paintNoticeIcon(); }
            fetch(NOTICE_URL, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deleted: [nid] })
            }).catch(() => { /* the browser has it; the account learns next time */ });
            const back = document.getElementById("console-notices-back");
            if (back) back.focus({ preventScroll: true });
        });
    }
    const onClick = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    onClick("console-choice-notices", showNoticeHistory);
    onClick("console-choice-edit", () => showPage("profile"));
    onClick("console-notices-back", () => { pickNotice(null); showPage(landingPage()); });
    onClick("console-profile-back", () => showPage(landingPage()));

    // After the page has settled, then whenever who is signed in changes —
    // the old queue dropped at once (see checkGen).
    setTimeout(checkNotices, 1500);
    if (window.Account && typeof Account.onChange === "function") {
        Account.onChange(() => {
            notices = [];
            paintNoticeIcon();
            if (noticePageShowing()) leaveNotices();
            checkNotices();
        });
    }
    /* LIVE (5 Oct 2026, the owner's): asked again every NOTICE_POLL_MS while
       the tab is in view, so a notification sent from the Warren turns up
       within a minute without a reload. Nothing is asked while the tab is
       hidden; coming back to it asks at once, if the last answer is more
       than NOTICE_RECHECK_MS old. */
    // A short tick rather than one of NOTICE_POLL_MS: the checks made on
    // load and on signing in set the clock, and a tick a whole interval
    // long fell just short of it each time and waited a second interval.
    setInterval(() => {
        if (document.visibilityState === "visible" && Date.now() - noticeCheckedAt >= NOTICE_POLL_MS) checkNotices();
    }, 10 * 1000);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - noticeCheckedAt > NOTICE_RECHECK_MS) checkNotices();
    });

    // A page loaded straight at #privacy — see the note by the hashchange
    // listener above for why this waits until everything is set up.
    openPrivacyFromHash();
});

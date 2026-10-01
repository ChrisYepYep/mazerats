/* Who is signed in, for every page that cares.

   Groundwork. Today one thing reads this — the daily game, to decide
   whether a finished day gets a name on the leaderboard — and nothing on
   the site is gated behind it. It is written as a small shared object
   rather than as part of the game so that the next thing to want an
   identity (mazes marked walked, following a builder, submitting a maze)
   has somewhere to ask.

   The session itself is an HttpOnly cookie set by
   netlify/functions/discord-auth.js, which means this file cannot read it
   and neither can anything else that runs on the page. So "who am I" is a
   question for the server, asked once on load, and the answer is cached
   here for the rest of the visit. */
(function () {
    "use strict";

    const ENDPOINT = "/.netlify/functions/discord-auth";

    /* Every request in this file is on a leash, the same way js/api.js's
       _getWithFallback puts the public reads on one. None of them was, and a
       fetch that HANGS — a cold function on flaky mobile data — resolves
       neither way: ready() never settled, so everything awaiting it (the
       Profile page's "Checking…", the daily game's leaderboard decision)
       sat on its loading state for as long as the tab was open, and a
       stalled save held up every un-tick queued behind it (see forget).
       An abort lands in the callers' existing catch blocks, which already
       say the right thing: signed out-but-unsure, nothing stored, try again. */
    const TIMEOUT_MS = 10000;
    function timedFetch(url, opts, ms) {
        if (typeof AbortController === "undefined") return fetch(url, opts);
        const controller = new AbortController();
        // Not cleared when the headers arrive: the leash has to cover the
        // body too (res.json() on a stalled stream hangs just the same), and
        // an abort after the body has been read is a no-op.
        setTimeout(() => controller.abort(), ms || TIMEOUT_MS);
        return fetch(url, Object.assign({}, opts, { signal: controller.signal }));
    }

    const listeners = [];
    let ready = null;

    // A failed "who am I" is asked again — see refresh's catch.
    const ME_RETRY_MS = 4000;
    let meRetried = false;
    window.addEventListener("online", () => {
        if (Account.unsure) Account.refresh();
    });

    const Account = {
        // The signed-in player, or null. Synchronous, so a render can read
        // it without awaiting — null until `ready` resolves, which is the
        // honest answer at that point (nobody is known to be signed in yet).
        current: null,

        // This visitor's ban — { level: "soft" | "full", until, reason } —
        // or null, from the same `me` answer (29 Sept 2026; see BANS).
        ban: null,

        // Resolves once the first "who am I" has come back. A caller that
        // needs certainty rather than a snapshot awaits this.
        ready() {
            if (!ready) ready = Account.refresh();
            return ready;
        },

        async refresh() {
            try {
                const res = await timedFetch(`${ENDPOINT}?action=me`, {
                    credentials: "same-origin",
                    headers: { Accept: "application/json" }
                });
                if (!res.ok) throw new Error(String(res.status));
                const data = await res.json();
                Account.current = data && data.player ? data.player : null;
                Account.unsure = false;
                /* A ban rides on the same answer, beside the player rather
                   than inside it, because it is given to signed-out
                   visitors too (a blocked network). Null for nearly
                   everybody, and then nothing below does anything; see
                   BANS further down (29 Sept 2026). */
                Account.ban = readBan(data && data.ban);
                rememberBlock();
                applyBan();
                noticeWhoChanged();
            } catch (e) {
                // No session, no network, or the function is not deployed.
                // All three mean the same thing to every caller: signed out.
                Account.current = null;
                // ...except to one that would act on a sign-out: home.js
                // takes the account's ticks off the browser on "nobody",
                // and should not do that because the network blinked.
                Account.unsure = true;
                /* ...and asked again (30 Sept 2026). One failed `me` used to
                   leave a signed-in player shown signed out for the rest of
                   the visit — a cold function or a tunnel was enough. So a
                   failure is retried once, four seconds on, and again
                   whenever the browser says it is back online (below). The
                   retry is an ordinary refresh, so when it lands, the real
                   answer is announced to every listener like the first. */
                if (!meRetried) {
                    meRetried = true;
                    setTimeout(() => { if (Account.unsure) Account.refresh(); }, ME_RETRY_MS);
                }
            }
            // The first answer is in, one way or the other: Account.mayPlay
            // now means something (see the games' open()).
            Account.known = true;
            announce();
            return Account.current;
        },

        /* A full page navigation, not a popup or a fetch: the OAuth round
           trip has to happen in the address bar for the cookie to come back
           with it, and a popup is the version that gets blocked. Where to
           come back to rides along and is validated server-side. */
        signIn(returnTo) {
            /* A soft ban keeps the site readable but not the sign-in: the
               server would only send Discord's answer back refused, so the
               trip is not started and a small notice says why instead
               (29 Sept 2026). Every Sign in on the site comes through here
               — the header, the Profile's, Fallin' Furni's. */
            if (activeBan()) { showBlocked("signin"); return; }
            const to = returnTo || (location.pathname + location.search + location.hash);
            // The clean path, matching what is registered with Discord (see
            // netlify.toml). "me" and "signout" below are only ever called
            // by this file, so they stay on the function's own URL.
            location.href = `/auth/discord/start?to=${encodeURIComponent(to)}`;
        },

        /* Resolves true once signed out, false if the server could not be
           reached (30 Sept 2026). The cookie is HttpOnly, so only the
           server's answer clears it: showing "Sign in" after a failed
           request left the session alive behind a header that said
           otherwise, and the next page load signed them straight back in.
           So a failure keeps the signed-in state and says so. A POST, which
           discord-auth.js now insists on. */
        /* { everywhere: true } (1 Oct 2026) signs out every other device as
           well: the server gives the account a new session version, so every
           other session it has issued is revoked (see the sign-out in
           discord-auth.js). Offered, quietly, from the "Sign out?" window. */
        async signOut(opts) {
            const everywhere = !!(opts && opts.everywhere);
            // Whatever is still queued for this account goes first, while
            // the session cookie is still good; after, it would be dropped.
            try { await flushState(); } catch (e) { /* nothing to undo */ }
            try {
                // Leashed: the header button is disabled until this returns.
                const res = await timedFetch(`${ENDPOINT}?action=signout${everywhere ? "&everywhere=1" : ""}`, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { Accept: "application/json" }
                });
                if (!res.ok) throw new Error(String(res.status));
            } catch (e) {
                /* Timed out (1 Oct 2026): the server may well have bumped the
                   session version before the leash ran out — a cold function
                   — so "still signed in everywhere" could be untrue. Say only
                   what is known, and ask `me` again: if it did work, this
                   device's own cookie is now revoked and the header follows. */
                if (everywhere && e && e.name === "AbortError") {
                    notice({
                        title: "Couldn't Confirm",
                        html: `<p class="notice-lines">Couldn't confirm — if you're still signed in on another device, try again.</p>`
                    });
                    try { Account.refresh(); } catch (e2) { /* the notice stands */ }
                    return false;
                }
                notice({
                    title: "Couldn't Sign Out",
                    html: `<p class="notice-lines">${everywhere
                        ? "Couldn't sign you out of your other devices — you're still signed in everywhere. Try again in a minute."
                        : "Couldn't sign you out — check your connection and try again."}</p>`
                });
                return false;
            }
            Account.current = null;
            Account.unsure = false;
            rememberWho("");
            /* The account's own ticks are taken back off this browser by
               home.js's dropAccountTicks, on the announce below; that is
               what stops the next person to sign in here uploading them. */
            announce();
            tellOtherTabs();
            /* A plain sign-out and "every device" looked the same — the header
               just said "Sign in" — so the second says it worked (1 Oct 2026).
               A tick later, so the caller has already moved focus to the fresh
               "Sign in" and the window hands it back there when closed. */
            if (everywhere) {
                setTimeout(() => notice({
                    title: "Signed Out Everywhere",
                    html: `<p class="notice-lines">Signed out on every device: here now, and anywhere else the next time it loads a page.</p>`
                }), 0);
            }
            return true;
        },

        onChange(fn) {
            if (typeof fn === "function") listeners.push(fn);
            return () => {
                const i = listeners.indexOf(fn);
                if (i >= 0) listeners.splice(i, 1);
            };
        },

        /* ---------- what the account remembers ----------

           Walked mazes and the day's game, kept against the account so they
           follow someone between their phone and their desk. Signed out
           every one of these is a no-op returning null, and the callers'
           own localStorage stays exactly as it was — which is what keeps
           the site fully usable without an account.

           Deliberately thin. This knows how to fetch, merge and push a
           blob; it does not know what walked mazes or a guess state ARE.
           The two files that do own their own shapes. */

        // The last state the server gave us, so a render can read it
        // without awaiting. Null until the first fetch lands.
        stored: null,

        async fetchState() {
            if (!Account.current) return null;
            try {
                const res = await timedFetch(STATE_ENDPOINT, {
                    credentials: "same-origin",
                    headers: { Accept: "application/json" }
                });
                if (!res.ok) throw new Error(String(res.status));
                Account.stored = await res.json();
            } catch (e) {
                Account.stored = null;
            }
            return Account.stored;
        },

        /* Pushes a patch and keeps whatever comes back, which is the merged
           truth rather than what we just sent — the server unions walked
           lists, so the reply can hold ticks this device had never seen.

           Coalesced: ticking four mazes quickly is one request, not four.
           Fire and forget by design; nothing on screen should wait on it,
           and the local copy is already correct. */
        saveState(patch) {
            if (!Account.current || !patch) return;
            Object.assign(pendingPatch, patch);
            clearTimeout(saveTimer);
            saveTimer = setTimeout(flushState, 600);
        },

        // For the one case that cannot wait 600ms: the page is going away.
        flushState,

        /* Called with the server's merged state after every save it
           accepted. home.js uses it to know which ticks the account now
           holds, so it stops sending them (see noteTick there). */
        onStored(fn) { if (typeof fn === "function") storedListeners.push(fn); }
    };
    const storedListeners = [];

    /* Signed out in every tab (30 Sept 2026). The cookie is shared, so a
       sign-out in one tab ends the session in all of them — but the others
       went on showing the player signed in, and kept queueing saves that
       the server then refused, until they were reloaded. So a sign-out is
       said to the other tabs, which ask the server again (Account.refresh)
       rather than taking the message's word for it. BroadcastChannel where
       there is one; otherwise a localStorage write, whose "storage" event
       fires in every other tab of the site. */
    const SIGNOUT_CHANNEL = "mazerats-account";
    const SIGNOUT_KEY = "mazerats_signed_out";
    let signOutChannel = null;
    try {
        if (typeof BroadcastChannel === "function") {
            signOutChannel = new BroadcastChannel(SIGNOUT_CHANNEL);
            signOutChannel.onmessage = e => {
                if (e && e.data && (e.data.type === "signout" || e.data.type === "change")) Account.refresh();
            };
        }
    } catch (e) { signOutChannel = null; }
    if (!signOutChannel) {
        window.addEventListener("storage", e => {
            if ((e.key === SIGNOUT_KEY && e.newValue) || e.key === WHO_KEY) Account.refresh();
        });
    }

    /* And signed IN in every tab (1 Oct 2026). Signing in happens in one
       tab's address bar, so the others went on saying "Sign in" until they
       were reloaded — while the shared cookie quietly filed their game
       writes under the account. So the last answer `me` gave is kept in
       WHO_KEY (the player's public board id, or "" for nobody; never the
       Discord id), and a tab whose answer DIFFERS from it writes the new
       one and says "change"; the others ask `me` for themselves. That
       settles at once: their answers now match WHO_KEY, so they say
       nothing. A failed `me` changes nothing (see refresh). Without
       BroadcastChannel, the WHO_KEY write is the signal itself. */
    const WHO_KEY = "mazerats_account_who";
    function rememberWho(who) {
        try { localStorage.setItem(WHO_KEY, who); } catch (e) { /* blocked: no broadcast either */ }
    }
    function noticeWhoChanged() {
        const p = Account.current;
        const who = p ? String(p.publicId || "signed-in") : "";
        let was;
        try { was = localStorage.getItem(WHO_KEY); } catch (e) { return; }
        if ((was || "") === who) return;
        rememberWho(who);
        // A first visit, or a first since this shipped, says nothing for
        // a signed-out answer: there is nobody to tell about.
        if (was === null && !who) return;
        try { if (signOutChannel) signOutChannel.postMessage({ type: "change" }); } catch (e) { /* the WHO_KEY write stands */ }
    }
    function tellOtherTabs() {
        try {
            if (signOutChannel) signOutChannel.postMessage({ type: "signout" });
            // A fresh value every time, or a second sign-out fires no event.
            else localStorage.setItem(SIGNOUT_KEY, String(Date.now()));
        } catch (e) { /* storage blocked: the other tabs catch up on reload */ }
    }

    const STATE_ENDPOINT = "/.netlify/functions/player-data";
    let pendingPatch = {};
    let saveTimer = null;
    // The PUT currently on the wire, if any — see forget() for who waits on it.
    let inFlight = null;

    async function flushState() {
        clearTimeout(saveTimer);
        if (!Account.current) { pendingPatch = {}; return; }
        const patch = pendingPatch;
        pendingPatch = {};
        if (!Object.keys(patch).length) return;
        const send = (async () => {
            try {
                // 15s, a little longer than the reads: it carries a body,
                // and forget() waits on it, so it must end one way or the
                // other. Harmless on pagehide — the page is gone before
                // the timer could fire, and keepalive carries it on.
                const res = await timedFetch(STATE_ENDPOINT, {
                    method: "PUT",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patch),
                    /* Without this the pagehide flush below was usually
                       cancelled with the page, so the last ticks before
                       closing the tab never arrived. The body is a few ids
                       and at most one day's game, far under keepalive's
                       64KB limit. */
                    keepalive: true
                }, 15000);
                if (res.ok) {
                    Account.stored = await res.json();
                    storedListeners.forEach(fn => { try { fn(Account.stored); } catch (e) { /* its own problem */ } });
                } else if (res.status === 401) {
                    /* The session is over on the server — revoked, or its
                       cookie cleared in another tab (30 Sept 2026; see
                       writeRefusal in _bans.js). Asked, so the page stops
                       showing a player whose saves are all refused. */
                    signedOutUnderneath();
                }
            } catch (e) { /* the local copy is already right; nothing to undo */ }
        })();
        inFlight = send;
        await send;
        if (inFlight === send) inFlight = null;
    }

    /* Un-ticking has to be said out loud. The save above unions the list
       so two devices cannot delete each other's entries, which means a
       shorter list is not a removal — this is. The parameter name is which
       list to take it out of.

       AND IT HAS TO WIN AGAINST A SAVE STILL WAITING TO GO. A tick queues a
       snapshot of the WHOLE list for 600ms; untick the same maze inside that
       window and this DELETE went out at once while the snapshot, still
       holding the id, followed it — and the server's union put the maze
       straight back. Tick-then-change-your-mind is the commonest way this is
       ever used, so it was the commonest way it broke. Two things close it:

       - the id is taken out of the queued snapshot, so the PUT that follows
         no longer carries it;
       - a PUT already on the wire is waited for, so the DELETE lands after
         it rather than racing it (the server applies whichever arrives
         last, and that must be the removal).

       IT SAYS WHETHER IT WORKED (28 Sept 2026). It used to resolve nothing
       either way, so js/home.js could not tell a removal the account had
       taken from one lost to a dropped connection, and had to keep every
       un-tick in its book until a later fetch happened to show the id gone
       (see sendForget there). Now it resolves true on a 2xx and false on
       anything else — signed out, a refusal, a timeout, no network. It
       still never rejects, so a caller that ignored the result before is
       unaffected.

       keepalive, as the PUT above has: an un-tick made just before the tab
       closes is the same case as a tick made then, and without it the
       DELETE was usually cancelled with the page. */
    async function forget(list, id) {
        if (!Account.current || !id) return false;
        if (Array.isArray(pendingPatch[list])) {
            pendingPatch[list] = pendingPatch[list].filter(x => x !== id);
        }
        if (inFlight) { try { await inFlight; } catch (e) { /* settled either way */ } }
        try {
            const res = await timedFetch(`${STATE_ENDPOINT}?${list}=${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "same-origin",
                keepalive: true
            });
            if (res && res.status === 401) signedOutUnderneath();
            return !!(res && res.ok);
        } catch (e) { return false; }
    }

    /* A 401 from a save: `me` is asked again, once a minute at most, so a
       `me` that still says signed in (its own read failing) cannot loop. */
    let askedAfter401 = 0;
    function signedOutUnderneath() {
        if (!Account.current || Date.now() - askedAfter401 < 60000) return;
        askedAfter401 = Date.now();
        Account.refresh();
    }
    // For any other page's write that gets the same 401 (the daily games;
    // 1 Oct 2026), so they share the one-a-minute leash.
    Account.sessionEnded = signedOutUnderneath;
    Account.forgetWalked = id => forget("walked", id);
    Account.forgetSaved = id => forget("saved", id);

    /* ---------- the nickname (28 Sept 2026) ----------

       A player can choose the name the scoreboards show instead of their
       Discord one. The server keeps it (netlify/functions, through
       Api.setNickname / Api.markNickAsked in js/api.js) and adds three
       fields to the player object this file already holds:

         nick         the chosen nickname, or null
         displayName  nick when there is one, else the Discord display name.
                      THIS is what the site shows wherever it names the
                      signed-in player: the header, the Sign out? window, the
                      console's Profile, "On the board as".
         nickAsked    whether the one-time "Choose a nickname?" window (see
                      nickPrompt below) has been shown and answered
         nickLocked   the site's admins have set or locked the nickname from
                      the Warren (29 Sept 2026): the player cannot change it
                      themselves, so the Profile shows it without the field,
                      and neither the prompt nor the "Set a nickname" line is
                      offered
         nickRejected the admins have reviewed the nickname in the Warren
                      and asked for a different one (29 Sept 2026; see
                      FLAGGED in netlify/functions/player-nick.js). The name
                      still stands, but the games are locked until the
                      player saves a different one or clears it: the "Pick a
                      new nickname" window (nickPrompt below) opens on every
                      page load and cannot be dismissed, only answered, and
                      the Profile says so under the name
         nickRefused  the player answered that window with "Refuse" (29
                      Sept 2026): it stops opening, and the games stay
                      locked (see GAMES LOCKED below)

       `name` stays the Discord display name. It is still the right word in
       the two places that say what is RECORDED against a message or a lead
       ("We've noted your Discord name", "Sending as"), because that is what
       the server writes there.

       Every piece of this is optional on the server's side: a page served
       before the Api methods existed, or a player object without the new
       fields, simply behaves as it did before — no prompt, no hint, the
       Discord name everywhere. */
    Account.nameOf = p => (p ? String(p.displayName || p.nick || p.name || "") : "");

    // Whether this page can set a nickname at all. The other half of the
    // feature ships separately, and a stale page may be missing it.
    Account.canNick = () => typeof Api !== "undefined" && !!Api
        && typeof Api.setNickname === "function" && typeof Api.markNickAsked === "function";

    /* The server's rules, repeated for instant feedback while typing. The
       server is the authority and says no in its own words (a 400 with a
       message, or a 409 for a taken name), which the callers show just as
       they show these. Reserved names are left to it: the list is its own.
       Returns "" for a name worth sending, else what is wrong with it. */
    const NICK_MIN = 2;
    const NICK_MAX = 20;
    Account.NICK_MAX = NICK_MAX;
    /* The same letters netlify/functions/player-nick.js allows: the ones the
       boards' pixel font can draw (Volter Goldfish draws a handful of
       accented capitals as pictures; see PICTURE_GLYPHS in js/site.js). Kept
       in step with that file by hand; if they drift, the server's answer is
       the one shown. */
    const NICK_LETTERS = "A-Za-zÀ-ÏÑ-ÖØ-Üß-ïñ-öø-üÿŒœŸ";
    const NICK_ALLOWED = new RegExp(`^[${NICK_LETTERS}0-9 _.'!?-]+$`);
    const NICK_STARTS = new RegExp(`^[${NICK_LETTERS}0-9]`);
    const NICK_ENDS = new RegExp(`[${NICK_LETTERS}0-9!?]$`);
    // As the server tidies a name before judging it: curly apostrophes made
    // straight, runs of spaces made one, and none at either end.
    Account.tidyNickname = raw => String(raw == null ? "" : raw)
        .normalize("NFC").replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
    Account.checkNickname = raw => {
        const nick = Account.tidyNickname(raw);
        const length = [...nick].length;
        if (length < NICK_MIN) return `Nicknames need at least ${NICK_MIN} characters.`;
        if (length > NICK_MAX) return `Nicknames can be at most ${NICK_MAX} characters.`;
        if (!NICK_ALLOWED.test(nick)) return "Nicknames can use letters, numbers, spaces and - _ . ' ! ? only.";
        if (!NICK_STARTS.test(nick)) return "Start your nickname with a letter or a number.";
        if (!NICK_ENDS.test(nick)) return "End your nickname with a letter, a number, ! or ?.";
        return "";
    };

    // Takes whatever the server answered with — the player itself, or a
    // body carrying it — and folds it into the one we hold.
    function takePlayer(res) {
        const p = res && res.player ? res.player : res;
        if (p && typeof p === "object" && Account.current && (!p.id || p.id === Account.current.id)) {
            Account.current = Object.assign({}, Account.current, p);
        }
    }

    /* What a refusal means, in words for the player. The server's own
       `error` wins wherever it sent one; these are for when it did not. */
    function nickErrorText(e) {
        const status = e && e.status;
        const said = e && e.data && typeof e.data.error === "string" ? e.data.error : "";
        if (status === 401) return "You've been signed out. Sign in again to set a nickname.";
        if (said && (status === 400 || status === 403 || status === 409 || status === 429)) return said;
        if (status === 403) return "Your nickname was set by the site's admins. Ask them if you'd like it changed.";
        if (status === 409) return "That nickname is taken.";
        if (status === 429) return "Too many changes just now. Try again later.";
        return "Nicknames can't be saved just now. Try again in a moment.";
    }
    Account.nickErrorText = nickErrorText;

    /* Sets the nickname (a string) or clears it ("" or null). Resolves with
       the updated player; rejects with an Error whose message is ready to
       show, keeping the server's .status and .data. A 401 also drops the
       player, since the session it was acting for is gone. */
    Account.setNickname = async nick => {
        if (!Account.current) {
            const err = new Error("Sign in to set a nickname.");
            err.status = 401;
            throw err;
        }
        if (!Account.canNick()) {
            const err = new Error("Nicknames aren't available on this page yet. Reload it and try again.");
            err.status = 0;
            throw err;
        }
        const value = Account.tidyNickname(nick);
        let flagged = null;
        try {
            const res = await Api.setNickname(value || null);
            /* The word filter's note, when the name tripped it (29 Sept
               2026). Api hangs it on the player NON-enumerably, so the
               Object.assign in takePlayer never copies it into
               Account.current — it is about this save, not the player. */
            flagged = res && res.flagged ? res.flagged : null;
            takePlayer(res);
            // A save answers the first-sign-in question too (the server
            // marks it); held here as well so a reply without the field
            // does not leave the window due to open again.
            if (Account.current) Account.current.nickAsked = true;
        } catch (e) {
            const err = new Error(nickErrorText(e));
            err.status = e && e.status;
            err.data = e && e.data;
            err.field = e && e.data && e.data.field;
            // The session this was acting for is gone. Asked again rather
            // than assumed, so the header and every other listener hear it
            // the way they hear any other "who am I".
            if (err.status === 401) Account.refresh();
            /* Locked by the admins while this page was open (29 Sept
               2026): held here so the Profile redraws without the field
               and nothing offers it again. */
            if (err.status === 403 && err.data && err.data.locked && Account.current) {
                Account.current = Object.assign({}, Account.current, { nickLocked: true });
                announce();
            }
            throw err;
        }
        announce();
        /* Saved, but the filter caught something in it: "Nickname Saved"
           says so (see showFlagged). A turn later, so that whichever window
           asked for the save — the Profile, which puts focus back on its
           Change button, or a nickname prompt closing — has finished with
           the focus first, and this one takes it and hands it back. Every
           nickname save on the site comes through here, which is why the
           window is opened here and not by the callers. */
        if (flagged) setTimeout(() => showFlagged(flagged), 0);
        return Account.current;
    };

    /* "Refuse" on the forced rename window (29 Sept 2026): the player keeps
       the name the admins rejected and is told the games stay locked until
       they choose another. The server marks nickRefused, which stops the
       window opening on each visit; the lock itself (nickRejected) stays.
       Never rejects: if the server could not be told, the refusal is held
       for this page and the window simply asks again on the next load. */
    Account.refuseNickname = async () => {
        if (!Account.current) return null;
        try {
            if (typeof Api !== "undefined" && Api && typeof Api.refuseNickname === "function") {
                takePlayer(await Api.refuseNickname());
            }
        } catch (e) {
            if (e && e.status === 401) { Account.refresh(); return null; }
        }
        if (Account.current) Account.current = Object.assign({}, Account.current, { nickRefused: true });
        announce();
        return Account.current;
    };

    /* Records that the first-sign-in window has been answered, so it is only
       ever asked once. Never rejects: if the server could not be told, the
       worst case is being asked again on a later visit. */
    Account.markNickAsked = async () => {
        if (!Account.current) return null;
        Account.current.nickAsked = true;
        if (!Account.canNick()) return Account.current;
        try {
            takePlayer(await Api.markNickAsked());
            if (Account.current) Account.current.nickAsked = true;
            announce();
        } catch (e) { /* asked again next visit, at worst */ }
        return Account.current;
    };

    /* Somewhere to set it. The console's Profile page, with the field open
       and focused, when this page has the console (js/console-profile.js
       adds MazeConsole.editNickname); otherwise the archive, whose console
       opens on the same field from the #nickname hash. */
    Account.editNickname = () => {
        const C = window.MazeConsole;
        if (C && typeof C.editNickname === "function") C.editNickname();
        else location.href = "/home#nickname";
    };

    /* The line the games put under a filed score (28 Sept 2026): "On the
       board as <Discord name>. Set a nickname", shown only to a signed-in
       player with no nickname. It is returned as markup because the boards
       it sits in are drawn as markup (js/guess.js renderBoards, js/daily.js
       boards); the button is answered by the one delegated listener below,
       and every copy of the line is taken off the page the moment a
       nickname exists (see the onChange at the bottom of this file), so a
       results card left open does not go on offering it. */
    Account.nickHintHtml = () => {
        const me = Account.current;
        if (!me || me.nick || me.nickLocked || !Account.canNick()) return "";
        return `<p class="guess-board-note nick-hint" data-nick-hint-line>
                    On the board as ${escapeHtml(Account.nameOf(me))}.
                    <button type="button" class="guess-btn nick-hint-btn" data-nick-hint>Set a nickname</button>
                </p>`;
    };
    document.addEventListener("click", e => {
        const btn = e.target && e.target.closest ? e.target.closest("[data-nick-hint]") : null;
        if (btn) Account.editNickname();
    });
    function dropNickHints() {
        const me = Account.current;
        if (me && !me.nick && !me.nickLocked) return;
        document.querySelectorAll("[data-nick-hint-line]").forEach(el => el.remove());
    }

    // A tick made in the last moments before the tab closes still counts.
    window.addEventListener("pagehide", () => {
        if (Object.keys(pendingPatch).length) flushState();
    });

    function announce() {
        listeners.forEach(fn => {
            try { fn(Account.current); } catch (e) { /* one bad listener is not the others' problem */ }
        });
    }

    // ---------- the button in the header ----------

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function renderButton() {
        const host = document.getElementById("account-slot");
        if (!host) return;
        const me = Account.current;

        if (!me) {
            host.innerHTML = `<button type="button" class="header-signin" id="account-signin">Sign in</button>`;
            const btn = document.getElementById("account-signin");
            if (btn) btn.addEventListener("click", () => Account.signIn());
            return;
        }

        /* Signed in, the button becomes the person: their avatar and name.
           One control rather than a name plus a separate "sign out" link,
           because the header has room for one thing and the name is what
           people look for to check they are signed in as themselves.

           Pressing it ASKS first (28 Sept 2026). It used to sign out on the
           spot, and the name is exactly what people press to check whose
           account this is — so checking signed them out. See
           confirmSignOut below.

           The aria-label says what pressing does, and still contains the
           visible name, so voice control ("click <name>") finds it. */
        /* The name shown is the nickname when there is one (28 Sept 2026),
           since that is who the boards say they are; the tooltip keeps the
           Discord name beside it, so the account is still recognisable. */
        const shown = Account.nameOf(me);
        const tip = me.nick && me.name && me.name !== shown
            ? `Signed in as ${shown} (Discord: ${me.name})` : `Signed in as ${shown}`;
        /* data-crumb (29 Sept 2026): js/error-report.js's click breadcrumb
           reads a button's aria-label, and this one's is the player's name;
           the privacy policy promises no names in error reports, so the
           crumb says "Account button" instead. */
        host.innerHTML = `
            <button type="button" class="header-signin is-signed-in" id="account-signout"
                    data-crumb="Account button"
                    aria-haspopup="dialog"
                    aria-label="Signed in as ${escapeHtml(shown)}: sign out…"
                    title="${escapeHtml(tip)}">
                ${me.avatar ? `<img class="header-signin-face" src="${escapeHtml(me.avatar)}" alt="" aria-hidden="true">` : ""}
                <span class="header-signin-name">${escapeHtml(shown)}</span>
            </button>`;
        const btn = document.getElementById("account-signout");
        if (btn) btn.addEventListener("click", async () => {
            const answer = await confirmSignOut();
            if (!answer) return;
            /* Focus kept somewhere real for the length of the sign-out (it
               can take a few seconds: queued ticks are flushed first). A
               disabled button cannot hold focus, so it waits on the name
               before being disabled, and lands on the fresh "Sign in"
               button once the header has been redrawn — rather than on
               <body>, which leaves a keyboard or screen-reader user at the
               top of the page. */
            btn.focus({ preventScroll: true });
            btn.disabled = true;
            // Still signed in (the request failed, and a window says so):
            // the name goes back to being pressable.
            if (!(await Account.signOut({ everywhere: answer === "everywhere" }))) { btn.disabled = false; return; }
            const again = document.getElementById("account-signin");
            if (again && (!document.activeElement || document.activeElement === document.body || !btn.isConnected)) {
                again.focus({ preventScroll: true });
            }
        });
    }

    /* "Sign out?" — a small window in the site's own frame, the same
       .modal-overlay / .modal / chrome titlebar every other window wears.

       Resolves true only for the Sign out button, and "everywhere" (also
       truthy) for the quieter "Sign out on every device" line under the
       pair (1 Oct 2026): the caller passes that on to Account.signOut as
       { everywhere: true }. The ×, Escape, a press on
       the dimmed page around it and "Stay signed in" all answer no, and the
       window opens with focus on "Stay signed in", so a second Enter from
       the press that opened it cannot sign anyone out by accident.

       Built on demand rather than written into the pages, because two pages
       carry the header (home.html and fallinfurni.html) and this is the one
       file both load. Tab is kept inside it by js/site.js's FocusTrap, which
       holds every visible aria-modal window, and Escape goes through
       EscapeLayers so it closes this and not the window behind it. Only one
       can be open: a second press while it is up is answered no. */
    let signOutShowing = null;
    let escapeRegistered = false;

    function confirmSignOut() {
        if (signOutShowing) return Promise.resolve(false);
        const me = Account.current;
        if (!me) return Promise.resolve(false);

        return new Promise(resolve => {
            const returnTo = document.activeElement;
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open signout-overlay";
            overlay.innerHTML = `
                <div class="modal confirm-modal signout-window" role="dialog" aria-modal="true"
                     aria-labelledby="signout-title" aria-describedby="signout-message" tabindex="-1">
                    <div class="chrome-titlebar">
                        <h2 id="signout-title">Sign Out?</h2>
                        <button type="button" class="chrome-close" aria-label="Stay signed in"><img src="/assets/img/modal_topclose_x.png" alt="" aria-hidden="true"></button>
                    </div>
                    <div class="chrome-frame">
                        <div class="modal-body signout-body">
                            ${me.avatar ? `<img class="signout-face" src="${escapeHtml(me.avatar)}" alt="" aria-hidden="true">` : ""}
                            <div class="confirm-message signout-message" id="signout-message" data-crumb-private>
                                <p class="signout-who">Signed in as ${escapeHtml(Account.nameOf(me))}</p>
                                <p class="signout-ask">Do you want to sign out?</p>
                            </div>
                            <div class="confirm-actions signout-actions">
                                <button type="button" class="guess-btn guess-btn--lead" data-choice="yes">Sign out</button>
                                <button type="button" class="guess-btn" data-choice="no">Stay signed in</button>
                            </div>
                            <button type="button" class="signout-everywhere" data-choice="everywhere">Sign out on every device</button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            document.body.classList.add("modal-open");

            function finish(yes) {
                if (signOutShowing !== overlay) return;
                signOutShowing = null;
                overlay.remove();
                if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
                // Back to the name on "no". On "yes" the header is about to be
                // redrawn, and the caller's own disabled button holds the spot.
                if (!yes && returnTo && document.body.contains(returnTo) && typeof returnTo.focus === "function") {
                    returnTo.focus({ preventScroll: true });
                }
                resolve(yes);
            }
            signOutShowing = overlay;
            overlay.finish = finish;

            overlay.querySelectorAll("[data-choice]").forEach(b => {
                const c = b.dataset.choice;
                b.addEventListener("click", () => finish(c === "everywhere" ? "everywhere" : c === "yes"));
            });
            overlay.querySelector(".chrome-close").addEventListener("click", () => finish(false));
            /* A press on the dimmed page closes it — but only a press that
               STARTED there. Otherwise the second click of a double-click on
               the name (which lands on this overlay, added by the first) shut
               the window the moment it opened, and selecting the text and
               letting go outside the card did the same. */
            let downOnBackdrop = false;
            overlay.addEventListener("pointerdown", e => { downOnBackdrop = e.target === overlay; });
            overlay.addEventListener("click", e => {
                if (e.target === overlay && downOnBackdrop) finish(false);
                downOnBackdrop = false;
            });

            if (!escapeRegistered && window.EscapeLayers) {
                escapeRegistered = true;
                window.EscapeLayers.register({
                    elements: () => signOutShowing ? [signOutShowing] : [],
                    close: el => el.finish(false)
                });
            } else if (!window.EscapeLayers) {
                // No site.js on this page: Escape still has to mean no.
                const onKey = e => {
                    if (e.key !== "Escape" || signOutShowing !== overlay) return;
                    document.removeEventListener("keydown", onKey, true);
                    finish(false);
                };
                document.addEventListener("keydown", onKey, true);
            }

            overlay.querySelector('[data-choice="no"]').focus();
        });
    }
    Account.confirmSignOut = confirmSignOut;

    /* "Choose a nickname?" (28 Sept 2026) — asked ONCE, the first time a
       player is signed in, in the same frame as "Sign out?" above: the
       .modal-overlay / .modal / chrome titlebar every window wears, over the
       console (z-index 260 like that one; see .nick-overlay in the css).

       Either answer is final. "Save nickname" sets it (the server marks the
       question answered as part of that); "Not now", the ×, Escape and a
       press on the dimmed page all call markNickAsked. The wording says
       plainly that it is optional and can be changed later from the Profile,
       because the window arrives uninvited straight after signing in.

       WHEN IT OPENS. Only for a player object that says nickAsked: false (a
       server without the feature sends no such field, and is never asked
       for), only once per page load, and only while nothing else is in the
       way. It waits — checking every second and a half — while any window
       is open (a daily game, the room window a pasted maze link opened,
       Your Progress, the leaderboards: all .modal-overlay.open), while a
       Fallin' Furni round is being played, and while the tab is hidden; it
       opens as soon as the page is clear. /warren never loads this file,
       and is excluded here as well.

       "PICK A NEW NICKNAME" is the same window, for a player whose
       nickname the admins have rejected from the Warren (`nickRejected`;
       see FLAGGED in netlify/functions/player-nick.js). It began as a
       once-a-visit ask that "Not now" put off. The owner's revised
       decision (29 Sept 2026): the games are locked until the name is
       changed, and the ask cannot be put off, only answered. So it waits
       for the page to be clear by exactly the rules above, and then:
         - opens on EVERY page load until it is answered;
         - has no ×, ignores Escape and the dimmed page, and keeps Tab
           inside it (js/site.js's FocusTrap, as every aria-modal window);
         - "Save nickname" saves a different name, which takes nickRejected
           off on the server (player-nick.js) and unlocks the games;
         - "Refuse" (Account.refuseNickname) keeps the name. The server
           marks nickRefused and the window stops opening; the player can
           browse as before, but the games stay locked, and pressing Play
           offers this window again — dismissible that time, since they
           came to it themselves (kind "rename"; see GAMES LOCKED).
       The two never both want to open: the first needs no nickname, this
       one needs one. */
    let nickPromptShowing = null;
    let nickPromptDone = false;
    let renamePromptDone = false;
    let nickPromptTimer = null;
    let nickEscapeRegistered = false;

    /* Which window, if either, this player is owed right now: "first" (the
       first-sign-in "Choose a nickname?"), "rejected" (the forced "Pick a
       new nickname") or null. Pure given its arguments, so the tests can
       run it without a page: `me` the player, `s` what this page knows —
       canNick, firstDone / renameDone (already shown this page load). Never
       over a nickname the admins have locked: then there is nothing the
       player could do about it. */
    function promptKind(me, s) {
        if (!me || me.nickLocked || !s.canNick) return null;
        if (me.nickAsked === false && !me.nick && !s.firstDone) return "first";
        if (me.nickRejected === true && me.nick && !me.nickRefused && !s.renameDone) return "rejected";
        return null;
    }
    Account._promptKind = promptKind;

    function pageIsBusy() {
        if (/^\/warren/.test(location.pathname)) return true;
        if (document.hidden || document.readyState !== "complete") return true;
        if (document.querySelector(".modal-overlay.open")) return true;
        if (document.body.classList.contains("modal-open")) return true;
        // Any other window that has made itself modal — the lightbox,
        // Fallin' Furni's pause — except inside the console, which is not.
        for (const d of document.querySelectorAll('[aria-modal="true"]')) {
            if (d.closest("#console-modal")) continue;
            if (d.getClientRects().length) return true;
        }
        const ff = document.getElementById("ff-title");
        if (ff && ff.dataset.state === "playing") return true;
        /* Three more waits (29 Sept 2026). The loading screen: home.js
           marks it data-done / .is-done and removes it 300ms later, and
           until then the prompt would open behind the "LOADING" bar.
           Somebody typing — a search, a room code, the Profile's own name
           box: opening now would take the focus out from under the next
           keystroke. And Fallin' Furni's "turn your screen sideways" gate
           (body.ff-rotate-shut, set in js/fallinfurni.js), which sits over
           everything and would hide the prompt until the phone turned. */
        const loader = document.getElementById("site-loader");
        if (loader && !loader.dataset.done && !loader.classList.contains("is-done")) return true;
        const typing = document.activeElement;
        if (typing && typing !== document.body
            && (/^(?:INPUT|TEXTAREA|SELECT)$/.test(typing.tagName) || typing.isContentEditable)) return true;
        if (document.body.classList.contains("ff-rotate-shut")) return true;
        return false;
    }

    // Which window is wanted now, if any (see promptKind); null while one is up.
    function wantsNickPrompt() {
        const me = Account.current;
        if (nickPromptShowing || !me) return null;
        /* Not while banned: the server refuses every nickname answer from a
           banned player, so the window could never be answered and would
           come back on every page load. */
        if (activeBan()) return null;
        return promptKind(me, {
            canNick: Account.canNick(),
            firstDone: nickPromptDone,
            renameDone: renamePromptDone
        });
    }

    function scheduleNickPrompt() {
        if (nickPromptTimer || !wantsNickPrompt()) return;
        const tick = () => {
            nickPromptTimer = null;
            const kind = wantsNickPrompt();
            if (!kind) return;
            if (pageIsBusy()) { nickPromptTimer = setTimeout(tick, 1500); return; }
            openNickPrompt(kind);
        };
        // A moment's grace first, so a window the page opens on its own at
        // load (a pasted maze link's room) is up before the check.
        nickPromptTimer = setTimeout(tick, 1200);
    }

    /* The window's words, by which of the three it is (see above). The
       rejected ones name the nickname, so their text is marked
       data-crumb-private for js/error-report.js's breadcrumb, as the
       input already is. */
    function nickPromptWords(kind, me) {
        /* "Pick a new nickname", not "Please choose a new nickname": the
           titlebar keeps 84px each side clear for the ×, which leaves 144px
           of Volter, and the longer one was cut to "Please choose a ne…"
           (measured, 29 Sept 2026). */
        const asked = `The site's admins have asked you to pick a different nickname <span class="nick-dash">&mdash;</span> '${escapeHtml(me.nick || "")}' isn't one they can show on the boards.`;
        if (kind === "rejected") {
            return {
                title: "Pick a new nickname",
                text: `${asked} If you refuse, you can still browse the site, but you can't play any of the games until you choose one.`
            };
        }
        if (kind === "rename") {
            return {
                title: "Pick a new nickname",
                text: `${asked} Choose a new one to play the games again.`
            };
        }
        return {
            title: "Choose a nickname?",
            text: `This is how you'll appear on the scoreboards. It's optional <span class="nick-dash">&mdash;</span> you can skip this and set or change it any time from your Profile in the Console.`
        };
    }

    function openNickPrompt(kind) {
        const me = Account.current;
        if (!me || nickPromptShowing) return;
        // Either rejected kind: the name they were asked to change.
        const rejected = kind === "rejected" || kind === "rename";
        // Only the one that opens by itself is forced (see above).
        const forced = kind === "rejected";
        if (rejected) renamePromptDone = true;
        else nickPromptDone = true;
        const words = nickPromptWords(kind, me);
        const returnTo = document.activeElement;
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay open nick-overlay" + (forced ? " is-forced" : "");
        overlay.innerHTML = `
            <div class="modal confirm-modal nick-window" role="dialog" aria-modal="true"
                 aria-labelledby="nick-prompt-title" aria-describedby="nick-prompt-text" tabindex="-1">
                <div class="chrome-titlebar">
                    <h2 id="nick-prompt-title">${escapeHtml(words.title)}</h2>
                    ${forced ? "" : `<button type="button" class="chrome-close" aria-label="Not now"><img src="/assets/img/modal_topclose_x.png" alt="" aria-hidden="true"></button>`}
                </div>
                <div class="chrome-frame">
                    <div class="modal-body nick-prompt-body">
                        <p class="nick-prompt-text" id="nick-prompt-text"${rejected ? " data-crumb-private" : ""}>${words.text}</p>
                        <label class="nick-prompt-label" for="nick-prompt-input">${rejected ? "New nickname" : "Nickname"}</label>
                        <input type="text" class="nick-prompt-input" id="nick-prompt-input" data-crumb-private
                               maxlength="${NICK_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false"
                               placeholder="${escapeHtml(me.name || "")}" aria-describedby="nick-prompt-msg">
                        <p class="nick-prompt-msg" id="nick-prompt-msg" role="status" aria-live="polite"></p>
                        <div class="confirm-actions signout-actions nick-prompt-actions">
                            <button type="button" class="guess-btn guess-btn--lead" data-nick-choice="save">Save nickname</button>
                            <button type="button" class="guess-btn" data-nick-choice="skip">${forced ? "Refuse" : "Not now"}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.body.classList.add("modal-open");

        const input = overlay.querySelector("#nick-prompt-input");
        const msg = overlay.querySelector("#nick-prompt-msg");
        const saveBtn = overlay.querySelector('[data-nick-choice="save"]');
        const skipBtn = overlay.querySelector('[data-nick-choice="skip"]');
        let busy = false;

        function say(text, bad) {
            msg.textContent = text || "";
            msg.classList.toggle("is-error", !!bad);
        }

        function finish() {
            if (nickPromptShowing !== overlay) return;
            nickPromptShowing = null;
            overlay.remove();
            if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
            if (returnTo && document.body.contains(returnTo) && typeof returnTo.focus === "function") {
                returnTo.focus({ preventScroll: true });
            }
        }

        // "Not now": for the rejected name, nothing is sent (see above).
        function skip() {
            if (busy) return;
            if (!rejected) Account.markNickAsked();
            finish();
        }

        /* "Refuse", the forced window's only other answer. Held busy while
           the server is told, then closed whatever it said: refuseNickname
           never rejects, and a refusal it could not deliver is simply asked
           again on the next page load. */
        async function refuse() {
            if (busy) return;
            busy = true;
            saveBtn.disabled = skipBtn.disabled = true;
            say("One moment...");
            try { await Account.refuseNickname(); } finally {
                busy = false;
                finish();
            }
        }

        async function save() {
            if (busy) return;
            const problem = Account.checkNickname(input.value);
            if (problem) { say(problem, true); input.focus(); return; }
            /* The same name again is refused, so say so here without a
               round trip. Only the exact name: the server also refuses the
               rejected name re-cased or re-punctuated ("H1tlerFan" as
               "h1tlerfan", compared as "taken" compares — 30 Sept 2026; it
               used to let that through and unlock the games), and that
               comes back as a 400 whose sentence the catch below shows,
               with the field kept for another try. */
            if (rejected && Account.tidyNickname(input.value) === (me.nick || "")) {
                say("That's the nickname they asked you to change. Choose a different one.", true);
                input.focus();
                return;
            }
            busy = true;
            saveBtn.disabled = skipBtn.disabled = true;
            say("Saving...");
            try {
                await Account.setNickname(input.value);
                finish();
            } catch (e) {
                say(e.message, true);
                // Signed out underneath it, or the admins locked the
                // nickname meanwhile: nothing left to save for.
                if (e.status === 401 || e.status === 403) setTimeout(finish, 2500);
                else input.focus();
            } finally {
                busy = false;
                saveBtn.disabled = skipBtn.disabled = false;
            }
        }
        nickPromptShowing = overlay;
        /* What Escape does. The forced window answers it with nothing — but
           it is still registered as the front layer, so the press stops
           there instead of closing the console or a game behind it. */
        overlay.finish = forced ? () => {} : skip;

        // Said while typing, once there is something to judge; the server
        // still has the last word when it is sent.
        input.addEventListener("input", () => {
            say(input.value.trim() ? Account.checkNickname(input.value) : "", true);
        });
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
        });
        saveBtn.addEventListener("click", save);
        skipBtn.addEventListener("click", forced ? refuse : skip);
        const closeBtn = overlay.querySelector(".chrome-close");
        if (closeBtn) closeBtn.addEventListener("click", skip);
        // Only a press that STARTED on the dimmed page, as "Sign out?" does.
        let downOnBackdrop = false;
        overlay.addEventListener("pointerdown", e => { downOnBackdrop = e.target === overlay; });
        overlay.addEventListener("click", e => {
            if (!forced && e.target === overlay && downOnBackdrop) skip();
            downOnBackdrop = false;
        });

        if (!nickEscapeRegistered && window.EscapeLayers) {
            nickEscapeRegistered = true;
            window.EscapeLayers.register({
                elements: () => nickPromptShowing ? [nickPromptShowing] : [],
                close: el => el.finish()
            });
        } else if (!window.EscapeLayers && !forced) {
            const onKey = e => {
                if (e.key !== "Escape" || nickPromptShowing !== overlay) return;
                document.removeEventListener("keydown", onKey, true);
                skip();
            };
            document.addEventListener("keydown", onKey, true);
        }

        input.focus();
    }

    /* ---------- small windows that say one thing (29 Sept 2026) ----------

       "Nickname Saved", "Can't Play", "Set a New Nickname" and the like: the
       frame "Sign out?" wears, over the console at z-index 260 (it carries
       .nick-overlay for that), with a line or two of text and one or two
       buttons. Resolves with the pressed button's value; the ×, Escape and
       a press that STARTED on the dimmed page resolve null. Only one at a
       time: asked again while one is up (a game's two refused writes in a
       row), the second resolves null at once rather than stacking.

       o.title    the titlebar, kept to ~19 characters (144px of Volter; see
                  nickPromptWords)
       o.html     the body, ALREADY ESCAPED by the caller
       o.image    a picture shown above the text at its own size
       o.wide     a wider window, for text whose lines should not wrap
       o.actions  [{ label, value, lead }]; without it, one "OK" in the
                  site's small .view-switch-btn, as the owner chose for
                  "Nickname Saved" */
    let noticeShowing = null;
    let noticeEscapeRegistered = false;

    function notice(o) {
        if (noticeShowing) return Promise.resolve(null);
        return new Promise(resolve => {
            const returnTo = document.activeElement;
            const actions = Array.isArray(o.actions) && o.actions.length ? o.actions : null;
            const buttons = actions
                ? actions.map((a, i) => `<button type="button" class="guess-btn${a.lead ? " guess-btn--lead" : ""}" data-notice="${i}">${escapeHtml(a.label)}</button>`).join("")
                : `<button type="button" class="view-switch-btn notice-ok" data-notice="ok">OK</button>`;
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay open nick-overlay notice-overlay";
            overlay.innerHTML = `
                <div class="modal confirm-modal notice-window${o.wide ? " notice-wide" : ""}" role="dialog" aria-modal="true"
                     aria-labelledby="notice-title" aria-describedby="notice-text" tabindex="-1">
                    <div class="chrome-titlebar">
                        <h2 id="notice-title">${escapeHtml(o.title)}</h2>
                        <button type="button" class="chrome-close" aria-label="Close"><img src="/assets/img/modal_topclose_x.png" alt="" aria-hidden="true"></button>
                    </div>
                    <div class="chrome-frame">
                        <div class="modal-body notice-body">
                            ${o.image ? `<img class="notice-image" src="${escapeHtml(o.image)}" width="26" height="26" alt="" aria-hidden="true">` : ""}
                            <div class="notice-text" id="notice-text"${o.private ? " data-crumb-private" : ""}>${o.html}</div>
                            <div class="notice-actions${actions ? " signout-actions" : ""}">${buttons}</div>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            document.body.classList.add("modal-open");

            function finish(value) {
                if (noticeShowing !== overlay) return;
                noticeShowing = null;
                overlay.remove();
                if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
                if (returnTo && document.body.contains(returnTo) && typeof returnTo.focus === "function") {
                    returnTo.focus({ preventScroll: true });
                }
                resolve(value);
            }
            noticeShowing = overlay;
            overlay.finish = finish;

            overlay.querySelectorAll("[data-notice]").forEach(b => {
                b.addEventListener("click", () => {
                    const i = b.dataset.notice;
                    finish(i === "ok" ? "ok" : (actions[Number(i)] ? actions[Number(i)].value : null));
                });
            });
            overlay.querySelector(".chrome-close").addEventListener("click", () => finish(null));
            let downOnBackdrop = false;
            overlay.addEventListener("pointerdown", e => { downOnBackdrop = e.target === overlay; });
            overlay.addEventListener("click", e => {
                if (e.target === overlay && downOnBackdrop) finish(null);
                downOnBackdrop = false;
            });

            if (!noticeEscapeRegistered && window.EscapeLayers) {
                noticeEscapeRegistered = true;
                window.EscapeLayers.register({
                    elements: () => noticeShowing ? [noticeShowing] : [],
                    close: el => el.finish(null)
                });
            } else if (!window.EscapeLayers) {
                const onKey = e => {
                    if (e.key !== "Escape" || noticeShowing !== overlay) return;
                    document.removeEventListener("keydown", onKey, true);
                    finish(null);
                };
                document.addEventListener("keydown", onKey, true);
            }

            const first = overlay.querySelector("[data-notice]");
            if (first) first.focus({ preventScroll: true });
        });
    }

    /* "Nickname Saved" — a nickname the server took, but whose word filter
       caught something in it (player-nick.js answers `flagged: { reason,
       word }` beside the player). The name stands and the admins look at
       it in the Warren; this says so without alarming anybody. Worded and
       laid out by the owner (29 Sept 2026): the red button at its own
       26×26, three centred lines with only the word in amber, one OK. */
    function showFlagged(flagged) {
        const word = flagged && typeof flagged.word === "string" && flagged.word.trim() ? flagged.word.trim() : "";
        const first = word
            ? `'<span class="notice-word">${escapeHtml(word)}</span>' tripped a wire that made the rats crazy.`
            : "Your nickname tripped a wire that made the rats crazy.";
        return notice({
            title: "Nickname Saved",
            image: "/assets/img/red-button.png",
            private: true,
            // Wide enough that each of the three lines is one line (see
            // .notice-wide), where there is the room.
            wide: true,
            html: `<p class="notice-lines">${first}<br>If the site Admin doesn't approve of this in your nickname, we'll let you know.<br>For the time being, continue as usual.</p>`
        });
    }
    Account._showFlagged = showFlagged;

    /* ---------- BANS (29 Sept 2026) ----------

       `me` answers `ban: { level, until, reason } | null` beside the player,
       for signed-out visitors too, since a ban can be on a network rather
       than an account. For nearly everyone it is null and nothing here
       runs: no request is added, `me` is asked once a page as it always was.

         "full"  the visitor is sent to the landing page, which shows a
                 Maintenance page — with a cool-down's time left and reason
                 in a pop-up (applyBan, and js/welcome.js).
         "soft"  everything stays readable, but signing in, playing and
                 sending (Contact, Add Maze Info) each answer with a small
                 "Can't …" window with the time left and the reason.

       The server is the authority either way: a write it refuses answers
       403 { error, banned: { level, until } }, and writeRefused below turns
       that into the same windows for whichever caller got it. `until` is
       null for a ban without an end; a ban whose end has passed is treated
       as none, so a page left open past it does not go on refusing. */
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // "3 Oct 2026, 14:00 UTC". Spelt out rather than toLocaleString, whose
    // short months differ between browsers ("Sep" / "Sept").
    function untilText(iso) {
        const d = new Date(Date.parse(iso));
        if (isNaN(d.getTime())) return "";
        const two = n => String(n).padStart(2, "0");
        return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
    }
    Account.untilText = untilText;

    function readBan(raw) {
        if (!raw || typeof raw !== "object") return null;
        const level = raw.level === "full" || raw.level === "soft" ? raw.level : null;
        if (!level) return null;
        const until = typeof raw.until === "string" && !isNaN(Date.parse(raw.until)) ? raw.until : null;
        const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
        return { level, until, reason };
    }

    function activeBan() {
        const b = Account.ban;
        if (!b) return null;
        if (b.until && Date.parse(b.until) <= Date.now()) return null;
        return b;
    }
    Account.activeBan = activeBan;

    /* A WHOLE-SITE BAN (reworked 29 Sept 2026, as the owner asked).

       The visitor is sent to the landing page, and every page sends them
       back there while it lasts:
         permanent   the landing page shows "Maintenance, Back Soon!", as a
                     real maintenance window does. Nothing says it is a ban.
         cool-down   the same, with a pop-up saying how long is left and
                     the reason given (js/welcome.js).
       The browser keeps a note of it under BLOCK_KEY — { until, reason } —
       so that the landing page, and pages that never ask `me` (js/site.js,
       home.html's gate), know without a request of their own. The landing
       page checks `me` again whenever the note is there, so a ban that is
       lifted clears it at the next visit. The privacy policy and /warren
       stay reachable. */
    const BLOCK_KEY = "mazerats_blocked";
    function rememberBlock() {
        const b = activeBan();
        try {
            if (b && b.level === "full") localStorage.setItem(BLOCK_KEY, JSON.stringify({ until: b.until || null, reason: b.reason || "" }));
            else localStorage.removeItem(BLOCK_KEY);
        } catch (e) { /* private mode: every page asks `me` and lands here again */ }
    }
    function applyBan() {
        const b = activeBan();
        if (!b || b.level !== "full") return;
        if (/^\/(?:warren|privacy)/.test(location.pathname)) return;
        rememberBlock();
        location.replace("/");
    }

    // "23h 14m", "2d 5h", "12m": what is left of a cool-down.
    function timeLeft(iso) {
        const ms = Date.parse(iso) - Date.now();
        if (!(ms > 0)) return "";
        const m = Math.ceil(ms / 60000);
        const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
        return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
    }

    /* "Can't Play" / "Can't Send" / "Can't Sign In", for an
       "everything but reading" ban (a whole-site one sends the visitor to the
       landing page instead). `what` is which was tried. Laid out as the
       owner approved for the cool-down pop-up: the red button, then one line
       each for what happened, the time left and the reason — the last two
       only when there is one. */
    const BLOCKED = {
        play: { title: "Can't Play", head: "You can't play right now." },
        send: { title: "Can't Send", head: "You can't send this right now." },
        signin: { title: "Can't Sign In", head: "You can't sign in right now." }
    };
    function showBlocked(what, ban) {
        const b = ban || activeBan() || Account.ban;
        if (b && b.level === "full") { applyBan(); return Promise.resolve(null); }
        const w = BLOCKED[what] || BLOCKED.play;
        const lines = [escapeHtml(w.head)];
        const left = b && b.until ? timeLeft(b.until) : "";
        if (left) lines.push(`Time left: <span class="notice-word">${escapeHtml(left)}</span> (until ${escapeHtml(untilText(b.until))}).`);
        if (b && b.reason) lines.push(`Reason: ${escapeHtml(b.reason)}`);
        return notice({
            title: w.title,
            image: "/assets/img/red-button.png",
            wide: true,
            html: `<p class="notice-lines">${lines.join("<br>")}</p>`
        });
    }
    Account.showBlocked = showBlocked;

    /* The Contact and Add Maze Info sends, under a soft ban. Caught on the
       way down (capture phase) so neither form's own handler — in
       js/console.js and js/console-info.js — runs at all: the message is
       kept in its box, and the window says why nothing went. The server
       refuses the write regardless; this is only the kinder answer. The
       first check is the cheap one, since Account.ban is null for nearly
       every visitor and this sees every click on the page. */
    document.addEventListener("click", e => {
        if (!Account.ban) return;
        const send = e.target && e.target.closest ? e.target.closest("#console-contact-send, #ci-send, #console-entry-send") : null;
        if (!send || !activeBan()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        showBlocked("send");
    }, true);

    /* ---------- GAMES LOCKED (29 Sept 2026) ----------

       A player whose nickname the admins rejected cannot play until they
       choose another (nickRejected; refusing the forced window changes
       nothing here). Every Play on the site asks Account.mayPlay() first —
       Guess the Maze and Odd One Out as their windows open, the Profile's
       Play, Fallin' Furni's title Play and "Play again" — and a game write
       the server refuses (403 nickRequired, or 403 banned) comes through
       writeRefused, so a page that did not know yet still answers well.

       "Set a New Nickname" offers the rename window, dismissible this time
       (kind "rename"), and "Not now". */
    function showNickRequired() {
        return notice({
            title: "Set a New Nickname",
            html: `<p class="notice-head">Set a new nickname to play.</p><p>The site's admins asked you to change it.</p>`,
            actions: [
                { label: "Choose a nickname", value: "choose", lead: true },
                { label: "Not now", value: null }
            ]
        }).then(v => {
            if (v !== "choose") return;
            const me = Account.current;
            if (!me) return;
            if (!Account.canNick() || me.nickLocked) { Account.editNickname(); return; }
            openNickPrompt("rename");
        });
    }
    Account.showNickRequired = showNickRequired;

    /* Whether Play may go ahead. True, and nothing else happens, for anyone
       signed out and unbanned or signed in in good standing — which is
       everyone but a handful. Otherwise the right window is shown and it
       answers false, and the caller does nothing more. */
    Account.mayPlay = () => {
        if (activeBan()) { showBlocked("play"); return false; }
        const me = Account.current;
        if (me && me.nickRejected === true) { showNickRequired(); return false; }
        return true;
    };

    /* For any write the server refused: pass its status and parsed body,
       and `what` was being done ("play" or "send"). Answers true when it
       was a ban or the nickname lock, and the right window has been shown,
       so the caller can skip its own error; false for anything else. */
    Account.writeRefused = (status, body, what) => {
        if (status !== 403 || !body || typeof body !== "object") return false;
        if (body.banned && typeof body.banned === "object") {
            const was = Account.ban;
            const now = readBan(Object.assign({ reason: was ? was.reason : "" }, body.banned));
            if (now) Account.ban = now;
            showBlocked(what === "send" ? "send" : "play", now || was);
            return true;
        }
        if (body.nickRequired) {
            const me = Account.current;
            if (me && me.nickRejected !== true) {
                /* The page had not heard. Held now, so the next Play asks
                   first; and the forced window is marked shown, since the
                   window below already offers the same thing. */
                renamePromptDone = true;
                Account.current = Object.assign({}, me, { nickRejected: true });
                announce();
            }
            showNickRequired();
            return true;
        }
        return false;
    };

    /* What came back from a sign-in attempt, if anything. discord-auth
       redirects here with ?signin=<why> when it did not work, and the
       parameter is dropped from the address bar once read so a refresh
       does not show the message again. */
    function reportSignInResult() {
        const params = new URLSearchParams(location.search);
        const why = params.get("signin");
        if (!why) return;

        const said = {
            cancelled: "Sign-in cancelled.",
            expired: "That sign-in took too long — try again.",
            failed: "Discord sign-in did not work. Try again in a moment.",
            // discord-auth refused a banned account or network (29 Sept 2026).
            banned: "This account or network has been blocked from signing in."
        }[why] || "Discord sign-in did not work.";

        const note = document.createElement("p");
        note.className = "header-signin-note";
        note.setAttribute("role", "status");
        note.textContent = said;
        const host = document.getElementById("account-slot");
        if (host) {
            host.appendChild(note);
            // The longest of them, and not a retry-now: a little longer to read.
            setTimeout(() => note.remove(), why === "banned" ? 10000 : 6000);
        }

        params.delete("signin");
        const rest = params.toString();
        history.replaceState({}, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
    }

    Account.onChange(renderButton);
    // A nickname set anywhere takes every "Set a nickname" line off the
    // page; a first sign-in queues the one-time question.
    Account.onChange(dropNickHints);
    Account.onChange(scheduleNickPrompt);

    document.addEventListener("DOMContentLoaded", () => {
        renderButton();          // the signed-out state, immediately
        reportSignInResult();
        Account.ready();         // then the real answer, when it arrives
    });

    window.Account = Account;
})();

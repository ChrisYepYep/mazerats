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

    const listeners = [];
    let ready = null;

    const Account = {
        // The signed-in player, or null. Synchronous, so a render can read
        // it without awaiting — null until `ready` resolves, which is the
        // honest answer at that point (nobody is known to be signed in yet).
        current: null,

        // Resolves once the first "who am I" has come back. A caller that
        // needs certainty rather than a snapshot awaits this.
        ready() {
            if (!ready) ready = Account.refresh();
            return ready;
        },

        async refresh() {
            try {
                const res = await fetch(`${ENDPOINT}?action=me`, {
                    credentials: "same-origin",
                    headers: { Accept: "application/json" }
                });
                if (!res.ok) throw new Error(String(res.status));
                const data = await res.json();
                Account.current = data && data.player ? data.player : null;
                Account.unsure = false;
            } catch (e) {
                // No session, no network, or the function is not deployed.
                // All three mean the same thing to every caller: signed out.
                Account.current = null;
                // ...except to one that would act on a sign-out: home.js
                // takes the account's ticks off the browser on "nobody",
                // and should not do that because the network blinked.
                Account.unsure = true;
            }
            announce();
            return Account.current;
        },

        /* A full page navigation, not a popup or a fetch: the OAuth round
           trip has to happen in the address bar for the cookie to come back
           with it, and a popup is the version that gets blocked. Where to
           come back to rides along and is validated server-side. */
        signIn(returnTo) {
            const to = returnTo || (location.pathname + location.search + location.hash);
            // The clean path, matching what is registered with Discord (see
            // netlify.toml). "me" and "signout" below are only ever called
            // by this file, so they stay on the function's own URL.
            location.href = `/auth/discord/start?to=${encodeURIComponent(to)}`;
        },

        async signOut() {
            // Whatever is still queued for this account goes first, while
            // the session cookie is still good; after, it would be dropped.
            try { await flushState(); } catch (e) { /* nothing to undo */ }
            try {
                await fetch(`${ENDPOINT}?action=signout`, { credentials: "same-origin" });
            } catch (e) { /* the cookie is the server's to clear; nothing local to undo */ }
            Account.current = null;
            Account.unsure = false;
            /* The account's own ticks are taken back off this browser by
               home.js's dropAccountTicks, on the announce below; that is
               what stops the next person to sign in here uploading them. */
            announce();
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
                const res = await fetch(STATE_ENDPOINT, {
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
                const res = await fetch(STATE_ENDPOINT, {
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
                });
                if (res.ok) {
                    Account.stored = await res.json();
                    storedListeners.forEach(fn => { try { fn(Account.stored); } catch (e) { /* its own problem */ } });
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
         last, and that must be the removal). */
    async function forget(list, id) {
        if (!Account.current || !id) return;
        if (Array.isArray(pendingPatch[list])) {
            pendingPatch[list] = pendingPatch[list].filter(x => x !== id);
        }
        if (inFlight) { try { await inFlight; } catch (e) { /* settled either way */ } }
        try {
            await fetch(`${STATE_ENDPOINT}?${list}=${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "same-origin"
            });
        } catch (e) { /* as above */ }
    }
    Account.forgetWalked = id => forget("walked", id);
    Account.forgetSaved = id => forget("saved", id);

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

        /* Signed in, the button becomes the person: their avatar and name,
           and pressing it signs out. One control rather than a name plus a
           separate "sign out" link, because the header has room for one
           thing and the name is what people look for to check they are
           signed in as themselves.

           The aria-label says what pressing does: announced as just the
           name, a screen reader user had no way to know it signs out. It
           still contains the visible name, so voice control ("click
           <name>") finds it. */
        host.innerHTML = `
            <button type="button" class="header-signin is-signed-in" id="account-signout"
                    aria-label="Sign out ${escapeHtml(me.name)}"
                    title="Signed in as ${escapeHtml(me.name)} — press to sign out">
                ${me.avatar ? `<img class="header-signin-face" src="${escapeHtml(me.avatar)}" alt="" aria-hidden="true">` : ""}
                <span class="header-signin-name">${escapeHtml(me.name)}</span>
            </button>`;
        const btn = document.getElementById("account-signout");
        if (btn) btn.addEventListener("click", async () => {
            btn.disabled = true;
            await Account.signOut();
        });
    }

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
            failed: "Discord sign-in did not work. Try again in a moment."
        }[why] || "Discord sign-in did not work.";

        const note = document.createElement("p");
        note.className = "header-signin-note";
        note.setAttribute("role", "status");
        note.textContent = said;
        const host = document.getElementById("account-slot");
        if (host) {
            host.appendChild(note);
            setTimeout(() => note.remove(), 6000);
        }

        params.delete("signin");
        const rest = params.toString();
        history.replaceState({}, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
    }

    Account.onChange(renderButton);

    document.addEventListener("DOMContentLoaded", () => {
        renderButton();          // the signed-out state, immediately
        reportSignInResult();
        Account.ready();         // then the real answer, when it arrives
    });

    window.Account = Account;
})();

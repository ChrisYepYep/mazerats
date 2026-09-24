/* Fetches a daily game the first time somebody wants one.

   ----------------------------------------------------------------------
   WHY

   The daily games were about 39KB gzipped between them, and home.html loaded
   every one on every visit — including the large majority of visits that are
   somebody looking at mazes and never opening a game at all. The archive is
   what the site is for; the games are a thing you can also do. They should
   not be on the critical path of the page that is.

   THE ROSTER IS TWO, AND THIS TABLE IS THE ROSTER — a game missing from
   here is a game the page cannot open.

   It has been three twice. Ratrospect — the archive dealt as cards to be put
   in date order — was dropped, and One Wall, which replaced it, was dropped
   in turn: the puzzle was sound and the round was over in seconds, which is
   a thing you only find out by playing it. Each time, everything the game
   owned went with it — the file, the window in home.html, the rewrite, the
   row in the side menu, its half of the score endpoint and its CSS.

   That this is a flat table of six fields is why those removals were an
   afternoon each rather than a week.

   js/daily.js STILL LOADS EAGERLY and is not part of this. It is the shared
   day/seed/leaderboard layer both games are built on, it is small, and the
   side menu needs Daily.today() to say anything at all.

   ----------------------------------------------------------------------
   AND WHY NOTHING POPS

   Three things had to be true before this was worth doing.

   THE WINDOW IS THE RIGHT SIZE BEFORE THE GAME ARRIVES. It is, and not by
   luck: both windows are already in home.html's markup, and both size
   themselves from CSS rather than from content — .daily-sheet stands at
   clamp(430px, 66vh, 560px) and .guess-deck has a fixed height of its own.
   So the overlay opens at exactly the size it will be, empty, and the game
   fills it in. Nothing resizes under the pointer.

   THE MENU STILL KNOWS THE SCORE. The side menu says "3 of 5 rooms done"
   and it reads that from window.GuessStatus, which lives in the game file.
   Rather than duplicate the scoring here — two copies of that arithmetic
   would drift within a month — the games are PRELOADED IN THE BACKGROUND
   for anyone who has played before: any daily save in localStorage means
   this visitor is a player, and their menu should be live. Somebody who has
   never played has nothing for those functions to report anyway, and the
   menu's own fallback wording ("Today's five rooms") is what they see
   either way.

   A SLOW LOAD SAYS SO. The window opens immediately and shows a quiet line
   after 400ms, which is long enough that a normal load never shows it at
   all and short enough that a bad connection is never left looking broken.

   ----------------------------------------------------------------------
   THE DEEP LINKS

   /guess and /odd are rewrites to home.html (see netlify.toml) and each game
   opens itself when it sees its own path. That check is inside the game
   file, which now might never load — so the path is read here too, and the
   matching game is loaded at once rather than at idle. Both addresses get
   the old behaviour exactly: the game is on its way before anything else is
   asked for. */
(function () {
    "use strict";

    const GAMES = {
        guess: {
            src: "js/guess.js?v=2",
            open: "openGuessGame",
            overlay: "guess-overlay",
            win: "guess-window",
            close: "guess-close",
            path: "/guess",
            // Where a "still loading" line can be put without disturbing
            // anything the game will later render into.
            body: "guess-deck"
        },
        odd: {
            src: "js/oddoneout.js?v=2",
            open: "openOddOneOut",
            overlay: "odd-overlay",
            win: "odd-window",
            close: "odd-close",
            path: "/odd",
            body: "odd-body"
        }
    };

    const SLOW_AFTER = 400;

    const inFlight = {};

    /* One promise per game, kept so a second ask never starts a second
       download. A FAILED load forgets itself, so a game that could not be
       fetched on a dropped connection can be asked for again rather than
       being permanently broken for the rest of the visit. */
    function load(name) {
        const game = GAMES[name];
        if (!game) return Promise.reject(new Error("no such daily game: " + name));
        if (inFlight[name]) return inFlight[name];

        inFlight[name] = new Promise((resolve, reject) => {
            const tag = document.createElement("script");
            tag.src = game.src;
            tag.async = true;
            tag.onload = resolve;
            tag.onerror = () => reject(new Error("could not load " + game.src));
            document.head.appendChild(tag);
        }).catch(err => {
            inFlight[name] = null;
            throw err;
        });

        return inFlight[name];
    }

    // Whether the real game has published its opener yet — which is also
    // how the stubs below know to step aside.
    function ready(name) {
        return typeof window[GAMES[name].open] === "function" && !window[GAMES[name].open].isStub;
    }

    /* The window, opened before the game exists.

       Straight onto the same overlay the game itself opens, with the same
       two classes, so what appears is the finished window standing empty
       rather than anything of this file's invention. The game's own open()
       runs a moment later and adds the class again, which is harmless. */
    function openShell(name) {
        const game = GAMES[name];
        const overlay = document.getElementById(game.overlay);
        const win = document.getElementById(game.win);
        if (!overlay) return null;
        overlay.classList.add("open");
        document.body.classList.add("modal-open");
        if (win) win.focus();
        armClose(name, overlay);
        return overlay;
    }

    /* A way back out of the empty window.

       The close button, the backdrop and Escape are all wired by the GAME'S
       mount(), which runs only once the game file has arrived — so the
       shell opened above had no way out at all until then. On a slow
       connection that was a window you could not close for however long
       the download took, and on a failed one it was a window you could not
       close ever: "Could not load the game" over a dimmed page, and nothing
       that responded but a reload.

       These are the shell's own, and they step aside the moment the game
       has loaded (disarm), because from then on the game's own handlers are
       the ones that know how to close it properly — Guess the Maze puts the
       focus back on the side menu and tidies the address bar, which this
       has no business knowing about. Until then they only do what openShell
       did, in reverse. Even if both sets were ever live at once, both
       closing the same overlay is harmless: removing a class twice is
       removing it once. */
    const armed = {};

    function armClose(name, overlay) {
        if (armed[name]) return;
        const closeBtn = document.getElementById(GAMES[name].close);
        const shut = () => {
            overlay.classList.remove("open");
            document.body.classList.remove("modal-open");
        };
        const onBackdrop = e => { if (e.target === overlay) shut(); };
        const onKey = e => { if (e.key === "Escape" && overlay.classList.contains("open")) shut(); };
        if (closeBtn) closeBtn.addEventListener("click", shut);
        overlay.addEventListener("click", onBackdrop);
        document.addEventListener("keydown", onKey);
        armed[name] = () => {
            if (closeBtn) closeBtn.removeEventListener("click", shut);
            overlay.removeEventListener("click", onBackdrop);
            document.removeEventListener("keydown", onKey);
            armed[name] = null;
        };
    }

    function disarm(name) {
        if (armed[name]) armed[name]();
    }

    function sayLoading(name) {
        const body = document.getElementById(GAMES[name].body);
        if (!body || body.querySelector(".daily-loading")) return;
        const p = document.createElement("p");
        p.className = "daily-loading";
        p.textContent = "Dealing today's round…";
        body.appendChild(p);
    }

    // Every one, not the first: a failed line and a "still loading" line
    // can both be present after a retry.
    function clearLoading(name) {
        const body = document.getElementById(GAMES[name].body);
        if (!body) return;
        body.querySelectorAll(".daily-loading").forEach(p => p.remove());
    }

    /* The failure, with a way to try again in it. It used to be a sentence
       saying "try again" and nothing to try again WITH — the only retry was
       closing the window (which could not be done either; see armClose)
       and asking for the game from the menu. load() already forgets a
       failed attempt, so pressing this is simply asking again. */
    function sayFailed(name) {
        const body = document.getElementById(GAMES[name].body);
        if (!body) return;
        clearLoading(name);
        const p = document.createElement("p");
        p.className = "daily-loading daily-loading--failed";
        p.setAttribute("role", "alert");
        p.textContent = "Could not load the game. Check your connection and try again. ";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "guess-btn";
        retry.textContent = "Try again";
        retry.addEventListener("click", () => {
            clearLoading(name);
            window[GAMES[name].open]();
        });
        p.appendChild(retry);
        body.appendChild(p);
        retry.focus({ preventScroll: true });
    }

    /* The stub each game's opener is replaced by until the real one exists.

       Marked isStub so `ready` above can tell the two apart — the game file
       overwrites window.openGuessGame with its own on load, and without a
       marker there is no way to know whose function is currently there. */
    function makeOpener(name) {
        const stub = function () {
            if (ready(name)) return window[GAMES[name].open]();

            const overlay = openShell(name);
            const slow = setTimeout(() => sayLoading(name), SLOW_AFTER);

            load(name).then(() => {
                clearTimeout(slow);
                clearLoading(name);
                // The game's mount() has wired its own close by now.
                disarm(name);
                /* The game has published its own opener by now; this call is
                   the real one, and it finds its window already open — unless
                   the player gave up and closed the empty window while it was
                   downloading, which they now can. Opening it again behind
                   their back would be a window they had already dismissed
                   springing back. */
                if (ready(name) && (!overlay || overlay.classList.contains("open"))) {
                    window[GAMES[name].open]();
                }
            }).catch(() => {
                clearTimeout(slow);
                sayFailed(name);
            });
        };
        stub.isStub = true;
        return stub;
    }

    Object.keys(GAMES).forEach(name => {
        window[GAMES[name].open] = makeOpener(name);
    });

    /* Has this visitor played a daily game before?

       Any save under any game the site has ever run, whatever day it is
       from — the question is "is this someone who plays", not "have they
       played today". Somebody who played last week should still find the
       menu telling them the truth the moment they open it.

       MATCHED BY PREFIX, NOT BY EXACT KEY, and that is the important part.
       Each game versions its own storage key and bumps it when the shape of
       a saved day changes — Guess the Maze is on mazerats_guess_v4 and
       mazerats_guess_stats_v3 already. A list of exact key names here would
       be correct today and silently wrong after the next bump: no error,
       no failing test, just returning players quietly losing their live
       menu. A prefix cannot go stale that way.

       Stats keys count as much as state keys, and matter more — a state key
       holds one day and a stats key holds the fact that there have been
       days at all. */
    /* The two retired games are deliberately still in this list. It only
       answers "has this browser played a daily before", and somebody who
       played Ratrospect or One Wall last week is exactly such a person:
       dropping their prefixes would quietly demote them to a first-timer and
       leave their side menu dead until they opened a game by hand. Two
       string comparisons, and they can come out once nobody is carrying
       those keys any more. */
    const SAVE_PREFIXES = ["mazerats_guess", "mazerats_ratrospect", "mazerats_odd", "mazerats_onewall"];

    function hasPlayedBefore() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i) || "";
                if (SAVE_PREFIXES.some(p => key.indexOf(p) === 0)) return true;
            }
            return false;
        } catch (e) {
            // Private mode. Nothing can be remembered, so there is nothing
            // for a preloaded status function to report.
            return false;
        }
    }

    function preloadAll() {
        Object.keys(GAMES).forEach(name => { load(name).catch(() => {}); });
    }

    // Published so the side menu can ask for the games the moment it is
    // opened — by then somebody is looking at a list of them, which is a
    // better signal than anything this file can guess at.
    window.DailyGames = { load, preloadAll, isReady: ready };

    /* A deep link is not a guess. Load it now. */
    const deepLinked = Object.keys(GAMES).find(name => location.pathname === GAMES[name].path);
    if (deepLinked) {
        load(deepLinked).catch(() => {});
    } else if (hasPlayedBefore()) {
        /* A returning player, at idle — after the archive has painted and
           its thumbnails have landed, so this never competes with the thing
           the visitor actually came for. requestIdleCallback where it
           exists; Safari does not have it, and a 2s timer is close enough
           for something with no deadline. */
        const soon = () => preloadAll();
        if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(soon, { timeout: 4000 });
        } else {
            setTimeout(soon, 2000);
        }
    }
})();

/* Drives the welcome/splash screen (index.html) — swaps the Enter button's
   label and behavior based on the landing state set from the admin page
   (see netlify/functions/settings.js). If the check fails the door stays
   SHUT (Maintenance or Coming Soon — see unreadableLandingState in
   js/api.js): nobody is let in on a guess, and the watcher below opens it
   the moment a real answer says the site is open. */
/* ---------------------------------------------------- THE COUNTDOWN

   Above the wordmark (see its markup in index.html for why there) while
   the site is in Coming Soon and a launch date is set.
   The markup is in index.html; this fills it and ticks it.

   TWO CONDITIONS, both required: the site is in Coming Soon (not merely
   gated — see showCountdownFor) and a readable launchAt exists. (It used
   to be three — the date also had to be still ahead — and
   that third condition is what stranded launch-morning arrivals; see the
   note on the poll below. The clock itself still goes at zero — see
   countdownGone, 1 Oct 2026 — but the poll no longer goes with it.)
   Either failing and there is no clock, and the
   landing page is what it always was. That is deliberate — the gate is the
   only thing on this page that has to work, and a countdown is decoration
   on top of it.

   WHAT HAPPENS AT ZERO. Not the obvious thing. Reaching zero does NOT open
   the site: the gate is the landingState setting and only an admin flips
   it, which is right — a date typed a fortnight ago should not be able to
   publish the archive on its own while nobody is watching. So at zero the
   clock goes, and the page keeps asking the settings endpoint whether the
   switch has been thrown yet; the moment it has, it goes into the open
   site. Somebody who left the tab open overnight walks in without touching
   anything, and nobody has to sit refreshing on launch morning.

   The poll is every 20–40 seconds near and after zero, and every few
   minutes before that, or while Coming Soon has no date at all (see
   FAR_POLL_MS and watchForOpening).

   ---- AND IT IS JITTERED, WHICH IS THE WHOLE POINT OF THE NUMBERS BELOW.

   Every tab counting down reaches zero at the same instant — that is what
   a countdown to a fixed moment does. A plain setInterval would then have
   all of them ask the settings endpoint in the same second, and again
   twenty seconds later, and again: a thundering herd, arriving at exactly
   the minute the site is least able to absorb one, made entirely of
   people who are already waiting patiently.

   So each tab waits a random 0–20s on top of the base interval. The same
   number of requests still arrive, spread over a window instead of
   stacked on an instant, and nobody waits meaningfully longer for it.

   ---- THE POLL NO LONGER BELONGS TO THE COUNTDOWN (27 Sept 2026).

   It used to live inside startCountdown, and startCountdown only ran when
   launchAt was still in the FUTURE when the page loaded. So anybody who
   arrived after 08:00 UTC on launch day — before an admin had flipped the
   switch — got a page with no countdown and, worse, nothing asking whether
   the site had opened. They sat on "Coming Soon" until they thought to
   refresh. The same for a Maintenance window, or a gated site with no date
   set at all. That is watchForOpening below: it runs whenever the page is
   gated, whatever launchAt says, and the countdown is decoration again.

   AND IT ASKS PAST THE EDGE. /settings is cached at the CDN for twenty
   seconds and served stale for sixty more (GATE_CDN_CACHE in
   netlify/functions/_cache.js), so a poll through the plain address could
   be told "coming-soon" for up to a minute and a half after the switch was
   thrown — and the old location.reload() on a good answer then fetched the
   page's settings through that same stale copy and came back up gated. The
   poll now adds ?fresh=<bucket>, a query the function ignores and the CDN
   keys on, the way js/guides.js asks past its own cache. The bucket is ten
   seconds wide rather than Date.now(): every waiting tab in the same ten
   seconds shares ONE edge entry, so the launch-morning crowd still costs a
   handful of function runs rather than one each, and no answer it gets can
   be older than the bucket.

   On an open answer it goes straight to /home rather than reloading this
   page — see goInside for the one wrinkle that leaves. */
const COUNTDOWN_POLL_MS = 20000;
const COUNTDOWN_POLL_JITTER_MS = 20000;
/* More than ten minutes out, a tab asks every two to four minutes instead.
   Somebody can leave this page open for a fortnight, and an admin opening
   the site early is the only thing a poll that far out is for — a couple of
   minutes' notice of that is plenty. Inside the last ten minutes it is back
   to the 20–40s above, so every tab is on the fast cadence by zero. */
const FAR_POLL_MS = 120000;
const FAR_POLL_JITTER_MS = 120000;
const FAR_THRESHOLD_MS = 10 * 60 * 1000;
const POLL_BUCKET_MS = 10000;
// Same leash as js/api.js's first attempt in _getWithFallback. A poll that
// hangs must not stop the next one being scheduled.
const POLL_TIMEOUT_MS = 10000;
// The first ask's jitter once the launch time has passed, and the return-
// to-the-tab ask's (both 1 Oct 2026; see watchForOpening).
const DUE_FIRST_JITTER_MS = 5000;
const RETURN_JITTER_MS = 2000;

const isGatedState = s => s === "coming-soon" || s === "maintenance";

/* The settings, straight from the function (or a ten-second-old edge copy at
   worst). null for anything that is not a clear answer — a failed, timed-out
   or malformed read is "ask again later", never "open".

   The whole answer, not just landingState (30 Sept 2026): the poll takes
   launchAt from it too. A page whose first read failed got the stand-in,
   which has no date, and so never showed the clock however many real
   answers the poll heard after — and, with no date to go on, polled at the
   20–40s launch-morning pace for days. A date the admins set or moved while
   the page was open was missed the same way. */
async function freshSettings() {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), POLL_TIMEOUT_MS) : null;
    try {
        const bucket = Math.floor(Date.now() / POLL_BUCKET_MS);
        const res = await fetch(`/.netlify/functions/settings?fresh=${bucket}`, {
            // And past the browser's own copy, for the same reason.
            cache: "no-store",
            signal: controller ? controller.signal : undefined
        });
        if (!res.ok) return null;
        const body = await res.json();
        return body && typeof body.landingState === "string" && body.landingState ? body : null;
    } catch (e) {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/* Into the archive, once a fresh answer has said it is open.

   home.html's own gate reads /settings through the PLAIN address — the one
   the edge may still be holding "coming-soon" for — and bounces anybody it
   is told is gated straight back here. So before leaving, the plain address
   is asked too (the browser's copy skipped, the edge's not). A stale edge
   answer is served and revalidated in the background, which is exactly what
   is wanted: a couple of seconds later that address says "enter" as well,
   and the gate on the other side will hear the same. Three tries at most;
   after that it goes anyway, because a visitor waiting on an optimisation is
   worse than the one bounce it guards against — and a bounce only lands
   them back on this page, polling again.

   The answer is also written where home.html's gate looks for its early
   "peek" (mazerats_landing_state), so the loading screen shows at once
   instead of a blank window. */
let handedOff = false;

/* THE DOOR SAYS IT IS OPEN THE MOMENT IT IS (1 Oct 2026). The hand-off
   below can take a few seconds — the plain-address wait, or a window the
   visitor is reading — and the button used to say "Coming Soon" all the
   while over a site that had opened. It becomes the Enter link the open
   page draws (see the DOMContentLoaded handler), so a click meanwhile just
   goes in, and the countdown goes if it is still up (an admin who opened
   the site before its date). */
function showDoorOpen() {
    const btn = document.getElementById("welcome-btn");
    const label = document.getElementById("welcome-btn-label");
    if (label) label.textContent = "Enter";
    if (btn) {
        btn.setAttribute("href", "/home");
        btn.classList.remove("is-disabled");
        btn.removeAttribute("aria-disabled");
        btn.removeAttribute("role");
        btn.removeAttribute("tabindex");
        warmTheArchive(btn);
    }
    const box = document.getElementById("welcome-countdown");
    if (box && !box.hidden) countdownGone(box, true);
}

/* NOT OUT OF AN OPEN WINDOW (1 Oct 2026). Somebody reading an event (from
   the spotlight or the ticker) or the privacy policy when the site opened
   was taken to /home mid-sentence. With a window open, the hand-off waits
   for it to close — the button already says Enter, so they can go sooner
   by pressing it. Checked twice a second: cheap, and it needs no hook in
   each window's own close code. */
const WINDOW_CHECK_MS = 500;
function windowsClosed() {
    if (!document.querySelector(".modal-overlay.open")) return Promise.resolve();
    return new Promise(resolve => {
        const check = setInterval(() => {
            if (document.querySelector(".modal-overlay.open")) return;
            clearInterval(check);
            resolve();
        }, WINDOW_CHECK_MS);
    });
}

async function goInside(state) {
    handedOff = true;
    showDoorOpen();
    try { Api.rememberLandingState(state); } catch (e) { /* private mode */ }
    /* And the archive links on this page go back to the archive (1 Oct
       2026). pointGatedLinksHome (js/site.js) pointed them here while the
       site was shut — an open event's maze: and guide: links among them —
       and the wait just below leaves that window open to be read, so a
       click on one meant a trip back to this page. With the note now
       "enter", nothing written later is rewritten either. */
    try {
        document.querySelectorAll("a[data-archive-href]").forEach(a => {
            a.setAttribute("href", a.getAttribute("data-archive-href"));
            a.removeAttribute("data-archive-href");
        });
    } catch (e) { /* never worth holding the hand-off up for */ }
    await windowsClosed();
    /* STRAIGHT IN WHEN THAT NOTE STUCK (1 Oct 2026). home.html's gate has,
       since 28 Sept, asked past the edge itself for anybody whose note says
       "enter" (its "one more ask"), so for them the wait below only held
       the hand-off up — up to six seconds on launch morning, with the page
       still reading Coming Soon. It is kept for a browser that would not
       keep the note (private mode, storage refused), where the gate has no
       way to know this visitor was just let in. */
    let noted = false;
    try { noted = localStorage.getItem("mazerats_landing_state") === state; } catch (e) { /* not kept */ }
    if (noted) {
        location.assign("/home");
        return;
    }
    for (let i = 0; i < 3; i++) {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
        try {
            const res = await fetch("/.netlify/functions/settings", {
                cache: "no-cache",
                signal: controller ? controller.signal : undefined
            });
            const body = res.ok ? await res.json() : null;
            if (body && body.landingState && !isGatedState(body.landingState)) break;
        } catch (e) {
            break;      // unreachable: the gate will not do better, so just go
        } finally {
            if (timer) clearTimeout(timer);
        }
        if (i < 2) await new Promise(r => setTimeout(r, 3000));
    }
    location.assign("/home");
}

/* BACK, AFTER THE HAND-OFF.

   The browser keeps this page whole in its back/forward cache, and Back
   from the archive restores it exactly as it was left: the button
   relabelled by the hand-off rather than by an answer (see showDoorOpen),
   and the poll finished for good — it stopped asking the moment it saw
   the site open, and set `leaving` so it would never go twice. A door
   nothing on the page would ever check again, whatever the site does next.

   So a page restored from that cache after it handed the visitor inside is
   loaded afresh, which asks the settings again and draws whichever door is
   true now. Only then: a gated page restored after the visitor merely
   looked at another site is still polling (its timers resume with it), and
   an open one is already an Enter link. */
window.addEventListener("pageshow", e => {
    if (e.persisted && handedOff) location.reload();
});

/* Asks, jittered, until the site opens — then goes in. Runs for as long as
   this page is gated, from load, whether launchAt is ahead, behind or unset.

   getTarget() is the launch Date, or null, asked afresh each time (the poll
   itself can change it — see freshSettings). It only sets the cadence (see
   FAR_POLL_MS); it never decides anything, because zero on the clock does
   not open the site — only the admin's switch does.

   onStillGated(state, settings) hears each gated answer, so a site that
   moves from Coming Soon to Maintenance (or back) relabels the button
   without a reload.

   COMING SOON WITH NO DATE IS FAR (30 Sept 2026). No date used to mean the
   fast 20–40s cadence, on the reasoning that a missing date might be a
   launch about to happen. But Coming Soon with no date set is the page
   before anybody has picked one, and it can sit like that for weeks with
   every open tab asking three times a minute. So it takes the far cadence:
   an admin opening the site early is still heard within a few minutes, and
   a date set in the meantime is picked up by the next answer and moves the
   pace on from there. Maintenance stays fast whatever the date says — the
   date is the launch's, not the end of the work, and a Maintenance window
   is short and ends at the switch. lastState is the last gated state heard,
   seeded with initialState, the one the page loaded with. */
function watchForOpening(getTarget, onStillGated, initialState) {
    let lastState = initialState || null;
    const far = () => {
        if (lastState === "maintenance") return false;
        const target = getTarget();
        if (!target) return lastState === "coming-soon";
        return target.getTime() - Date.now() > FAR_THRESHOLD_MS;
    };
    const nextDelay = () => far()
        ? FAR_POLL_MS + Math.floor(Math.random() * FAR_POLL_JITTER_MS)
        : COUNTDOWN_POLL_MS + Math.floor(Math.random() * COUNTDOWN_POLL_JITTER_MS);
    // Coming Soon with its launch time already gone: the switch is due.
    const due = () => {
        const target = getTarget();
        return lastState === "coming-soon" && !!target && target.getTime() <= Date.now();
    };

    /* ONE TIMER, AND ONE ASK AT A TIME (1 Oct 2026). The poll used to chain
       bare setTimeouts, which was fine while nothing but the chain itself
       ever started one. The return-to-the-tab ask below starts one too, so
       the pending timer is kept and replaced rather than a second chain
       being set running beside the first. */
    let leaving = false;
    let timer = null;
    let asking = false;
    let lastAsk = 0;
    function schedule(ms) {
        clearTimeout(timer);
        timer = setTimeout(poll, ms);
    }
    async function poll() {
        timer = null;
        if (leaving || asking) return;      // the ask in flight schedules the next
        asking = true;
        lastAsk = Date.now();
        let settings = null;
        try { settings = await freshSettings(); } finally { asking = false; }
        const state = settings ? settings.landingState : null;
        if (state && !isGatedState(state)) {
            if (leaving) return;
            leaving = true;
            clearTimeout(timer);
            goInside(state);
            return;
        }
        if (state) {
            lastState = state;
            try { onStillGated(state, settings); } catch (e) { /* the poll outlives a bad label */ }
        }
        schedule(nextDelay());
    }

    /* BACK ON THE TAB (1 Oct 2026). A hidden tab's timers are held back —
       Chrome runs a hidden page's chained timers at most once a minute
       after five minutes, and a phone's browser freezes the page outright —
       so somebody who opened this before 08:00, went off to Discord and
       came back once the site had opened could look at "Opening any moment
       now" for another half a minute or more before the held-back ask came
       round. So coming back to the tab asks at once (within two seconds),
       but only when at least the cadence's own base interval has gone by
       since the last ask: that is the tab that was held back, and flicking
       between tabs costs nothing extra. Arrivals are spread by when each
       person looks, so this is no herd. */
    document.addEventListener("visibilitychange", () => {
        if (document.hidden || leaving || asking) return;
        const gap = far() ? FAR_POLL_MS : COUNTDOWN_POLL_MS;
        if (Date.now() - lastAsk < gap) return;
        schedule(Math.floor(Math.random() * RETURN_JITTER_MS));
    });

    /* The FIRST check is jittered too, and that one matters most: a crowd
       that arrived together (or a page reloaded by the thousand) would
       otherwise all ask in the same second.

       Except when the launch time has already passed (1 Oct 2026). The
       answer this page loaded with came through the plain address, which
       the edge may hold for up to a minute and a half (see the note at the
       top of this file), so arriving just after the switch was thrown can
       mean a gated page over an open site — and it used to wait up to
       twenty seconds for its first fresh ask. Five, now: a reload by the
       thousand at 08:00 still spreads over five seconds, and every tab in
       one ten-second bucket shares one edge entry anyway (POLL_BUCKET_MS). */
    const first = far() ? FAR_POLL_MS : due() ? DUE_FIRST_JITTER_MS : COUNTDOWN_POLL_JITTER_MS;
    schedule(Math.floor(Math.random() * first));
}

/* GONE AT ZERO (1 Oct 2026, the owner's). When the clock runs out, the
   whole block goes — label, digits and date — rather than standing over the
   title as "Opening any moment now" with a row of noughts. The poll is not
   the countdown's (see watchForOpening), so it goes on asking regardless.

   VISIBILITY, NOT `hidden`, so the space it held is kept: on a narrow screen
   the block is in the flow above the title (see .welcome-countdown in
   css/style.css), and taking it out of the layout would jump the wordmark
   and the button up the page at 08:00. It fades out first where the CSS has
   the fade (.is-gone); the visibility is set from here as well, after the
   fade's length, so it is gone even where that rule is missing.

   A page that loads after the launch time never shows it at all — it stays
   as it ships, hidden, so there is nothing to jump there either. And it can
   come back: a launch date moved into the future again draws a fresh clock
   (see showCountdownFor). */
const COUNTDOWN_FADE_MS = 600;
let countdownFade = null;

function countdownGone(box, fade) {
    clearTimeout(countdownFade);
    box.classList.add("is-gone");
    box.setAttribute("aria-hidden", "true");
    if (fade) countdownFade = setTimeout(() => { box.style.visibility = "hidden"; }, COUNTDOWN_FADE_MS);
    else box.style.visibility = "hidden";
}

function countdownBack(box) {
    clearTimeout(countdownFade);
    box.classList.remove("is-gone");
    box.removeAttribute("aria-hidden");
    box.style.visibility = "";
}

function startCountdown(target) {
    const box = document.getElementById("welcome-countdown");
    if (!box) return;

    const label = document.getElementById("welcome-countdown-label");
    const when = document.getElementById("welcome-countdown-when");
    const parts = {
        days: document.getElementById("wc-days"),
        hours: document.getElementById("wc-hours"),
        mins: document.getElementById("wc-mins"),
        secs: document.getElementById("wc-secs")
    };
    if (!label || !when || Object.values(parts).some(el => !el)) return;

    // Already past: nothing to draw. A block still on show from an earlier
    // date (moved to another past one) goes at once, its space kept.
    const idle = { stop(keepSpace) { if (!keepSpace) { countdownBack(box); box.hidden = true; } } };
    if (target.getTime() <= Date.now()) {
        if (!box.hidden) countdownGone(box, false);
        return idle;
    }

    label.textContent = "The archive opens in";
    /* The date said twice over: the clock says how long, this says when.

       IN THE READER'S OWN TIMEZONE, unlike everything else on the site,
       which is UTC. "Saturday 3 October at 10:00" is what somebody sets an
       alarm for; UTC is a sum they have to do first. The clock above is
       the same instant either way. Said out loud on the end, because a
       time with no zone on a site whose every other time is UTC is a time
       somebody will get wrong by an hour.

       "en-GB" for the FORMAT, though — the local zone is the point here,
       the local date order is not. Left as undefined this printed
       "October 3 at 10:00 AM" on an American machine, which is the same
       split the daily games had until it was fixed (see longDate in
       js/oddoneout.js). The site writes dates one way. */
    when.textContent = target.toLocaleString("en-GB", {
        weekday: "long", day: "numeric", month: "long",
        hour: "2-digit", minute: "2-digit"
    }) + " your time";

    const pad = n => String(n).padStart(2, "0");
    let ticker = 0;
    let atZero = 0;

    // The asking is watchForOpening's, which the caller starts alongside
    // this. All the clock does at zero is stop and go (see countdownGone).
    function tick() {
        const left = target.getTime() - Date.now();
        if (left <= 0) {
            clearInterval(ticker);
            clearTimeout(atZero);
            countdownGone(box, true);
            return;
        }
        /* Rounded UP (1 Oct 2026), so the last second reads 1 and the
           block goes at zero: rounded down, the final second showed
           "0 days 00 : 00 : 00" for up to a second first. */
        const secs = Math.ceil(left / 1000);
        parts.days.textContent = String(Math.floor(secs / 86400));
        parts.hours.textContent = pad(Math.floor(secs / 3600) % 24);
        parts.mins.textContent = pad(Math.floor(secs / 60) % 60);
        parts.secs.textContent = pad(secs % 60);
    }

    // Digits first, then shown, so it never appears with the zeros it ships with.
    tick();
    countdownBack(box);
    box.hidden = false;
    ticker = setInterval(tick, 1000);
    // Zero itself, to the moment, rather than at whichever second the
    // interval happens to land on after it.
    const untilZero = target.getTime() - Date.now();
    atZero = untilZero < 2147483647 ? setTimeout(tick, untilZero + 20) : 0;

    // Taken down again when the site moves out of Coming Soon without
    // opening (see showCountdownFor) — out of the layout altogether — or
    // when its date changes, keeping its space (keepSpace), since the
    // next date may well draw it again in the same place.
    return {
        stop(keepSpace) {
            clearInterval(ticker);
            clearTimeout(atZero);
            if (keepSpace) {
                if (!box.hidden) countdownGone(box, true);
                return;
            }
            countdownBack(box);
            box.hidden = true;
        }
    };
}

/* ------------------------------------------- FETCHING IT BEFORE IT IS ASKED

   The archive's slow part is one 460KB response (73KB over the wire) that
   home.html cannot start asking for until home.html has loaded. So the
   landing page starts asking the moment somebody looks like they are about
   to press Enter, and the archive lands on a browser that already has it.

   ON INTENT, NOT ON ARRIVAL. Pointing at a button, tabbing onto it or
   putting a finger down on it are all a few hundred milliseconds of warning
   before the click, and all of them mean this visitor is going. Fetching on
   page load instead would pull 73KB for everybody who reads the front door
   and leaves, which on a launch day is a great many people.

   THE FETCH IS THROWN AWAY, and that is fine — the point is the copy the
   browser keeps. /rooms answers with `public, max-age=0, must-revalidate`
   (see netlify/functions/_cache.js), so the body is stored and the real
   request a second later revalidates into a 304 with no body at all. It
   also warms the CDN's own copy for whoever is next through the door in
   the same region, which is worth having on the one day everybody arrives
   at once.

   ONCE. `{ once: true }` on all three listeners, and a flag besides, because
   pointerenter and focus both fire for somebody navigating by keyboard. */
let warmed = false;

function warmTheArchive(btn) {
    if (!btn) return;

    const warm = () => {
        if (warmed) return;
        warmed = true;

        // The page itself, and everything its <head> pulls in.
        try {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.href = "/home";
            link.as = "document";
            document.head.appendChild(link);
        } catch (e) { /* an old browser without rel=prefetch; the fetch below still helps */ }

        // And the archive, which is the part that actually takes the time.
        // Failures are silent on purpose: this is an optimisation, and the
        // real request on the next page handles its own errors as it always
        // did.
        fetch("/.netlify/functions/rooms", { credentials: "same-origin" }).catch(() => {});
    };

    ["pointerenter", "focus", "touchstart"].forEach(type => {
        btn.addEventListener(type, warm, { once: true, passive: true });
    });
}

/* ---------- A WHOLE-SITE BAN (29 Sept 2026) ----------

   js/account.js keeps a note in this browser when `me` says the visitor has
   a whole-site ban — { until, reason } under BLOCK_KEY — and every other
   page sends them here. As the owner asked:
     permanent   this page shows "Maintenance, Back Soon!", as a real
                 maintenance window does, and nothing more. It does not say
                 it is a ban.
     cool-down   the same, with a pop-up (the red button, as the flagged-
                 nickname one has) saying how long is left and the reason.
   Whenever the note is there, `me` is asked again, so a ban that has been
   lifted, or turned into a lighter one, clears the note and the page goes
   on as normal. Nobody without the note pays for that request. */
const BLOCK_KEY = "mazerats_blocked";

function forgetBlock() {
    try { localStorage.removeItem(BLOCK_KEY); } catch (e) { /* nothing to forget */ }
}

function blockIsLive(b) {
    return !!b && typeof b === "object" && (!b.until || Date.parse(b.until) > Date.now());
}

async function blockedHere() {
    let note = null;
    try { note = JSON.parse(localStorage.getItem(BLOCK_KEY) || "null"); } catch (e) { return null; }
    if (!note) return null;
    if (!blockIsLive(note)) { forgetBlock(); return null; }
    try {
        const ctl = typeof AbortController === "function" ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : 0;
        const res = await fetch("/.netlify/functions/discord-auth?action=me", {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: ctl ? ctl.signal : undefined
        }).finally(() => clearTimeout(timer));
        if (res.ok) {
            const data = await res.json();
            const b = data && data.ban;
            if (!b || b.level !== "full" || !blockIsLive(b)) { forgetBlock(); return null; }
            const fresh = {
                until: typeof b.until === "string" && !isNaN(Date.parse(b.until)) ? b.until : null,
                reason: typeof b.reason === "string" ? b.reason.trim() : ""
            };
            try { localStorage.setItem(BLOCK_KEY, JSON.stringify(fresh)); } catch (e) { /* the note stays as it was */ }
            return fresh;
        }
    } catch (e) { /* unreachable: the note stands until it can be checked */ }
    return note;
}

const BLOCK_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function blockUntilText(iso) {
    const d = new Date(Date.parse(iso));
    const two = n => String(n).padStart(2, "0");
    return `${d.getUTCDate()} ${BLOCK_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
}
function blockTimeLeft(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return "";
    const m = Math.ceil(ms / 60000);
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}
function blockEsc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* The cool-down pop-up, laid out as the owner approved: the red button at
   its own 26x26, then one line each for what happened, the time left and
   the reason (the last only when one was given), and one OK. The time left
   counts down while the page is open; when it runs out the note goes and
   the page reloads as normal. */
function showCoolDown(block, returnTo) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open nick-overlay notice-overlay";
    overlay.innerHTML = `
        <div class="modal confirm-modal notice-window notice-wide" role="dialog" aria-modal="true"
             aria-labelledby="cooldown-title" aria-describedby="cooldown-text" tabindex="-1">
            <div class="chrome-titlebar">
                <h2 id="cooldown-title">Cool-Down</h2>
                <button type="button" class="chrome-close" aria-label="Close"><img src="/assets/img/modal_topclose_x.png" alt="" aria-hidden="true"></button>
            </div>
            <div class="chrome-frame">
                <div class="modal-body notice-body">
                    <img class="notice-image" src="/assets/img/red-button.png" width="26" height="26" alt="" aria-hidden="true">
                    <div class="notice-text" id="cooldown-text"><p class="notice-lines">You've been put on a cool-down, so the site is closed to you for now.<br>Time left: <span class="notice-word" data-left></span> (until ${blockEsc(blockUntilText(block.until))}).${block.reason ? `<br>Reason: ${blockEsc(block.reason)}` : ""}</p></div>
                    <div class="notice-actions"><button type="button" class="view-switch-btn notice-ok">OK</button></div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    const left = overlay.querySelector("[data-left]");
    const tick = () => {
        const text = blockTimeLeft(block.until);
        if (!text) { forgetBlock(); location.reload(); return; }
        left.textContent = text;
    };
    tick();
    const timer = setInterval(tick, 15000);
    // The end itself, to the second, rather than up to 15s late.
    const endIn = Date.parse(block.until) - Date.now();
    const ender = endIn < 2147483647 ? setTimeout(tick, endIn + 500) : 0;
    function close() {
        if (!overlay.isConnected) return;
        overlay.remove();
        if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
        if (returnTo && typeof returnTo.focus === "function") returnTo.focus({ preventScroll: true });
    }
    // The count and the reload keep running after OK: the page still lets
    // them in the moment it is over.
    void timer; void ender;
    overlay.querySelector(".notice-ok").addEventListener("click", close);
    overlay.querySelector(".chrome-close").addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    if (window.EscapeLayers) EscapeLayers.register({ elements: () => (overlay.isConnected ? [overlay] : []), close });
    overlay.querySelector(".notice-ok").focus({ preventScroll: true });
}

/* THE SPOTLIGHT under the button (30 Sept 2026, the owner's).

   Every state of the landing page, and no event hard-coded: whichever
   events the Warren has ticked for it (spotlight: true), with a thumbnail,
   whose spotlight window holds the present moment. No start means straight
   away, no end means until it is unticked — see spotlightFieldsHtml in
   js/admin.js. With none, nothing is here at all.

   Each is a slide: the thumbnail, its caption (the event's own, or "Click
   for more details.") in the event's chosen colour, and a link to its
   #event- address, which opens the full event window. Several take turns,
   ordered by when their spotlight began; a turn holds while the pointer is
   over it or focus is in it, and while the tab is hidden. The window is
   checked again every 20 seconds, so a spotlight comes off the page (and
   the next one on) the moment its dates say, without a reload. */
const SPOTLIGHT_TURN_MS = 7000;
const SPOTLIGHT_RECHECK_MS = 20000;
const DEFAULT_SPOTLIGHT_CAPTION = "Click for more details.";
let spotlightEvents = null;
let spotlightKey = "";
let spotlightIndex = 0;
let spotlightTurnTimer = null;
let spotlightRecheck = null;
/* Held by the pointer and by focus apart (30 Sept 2026), so a rebuild can
   put the focus half right on its own: a focused slide that is replaced
   takes the focus with it, and no browser promises a focusout for that —
   the one flag was left true and the turns stopped for good. */
let spotlightPointer = false;
let spotlightFocus = false;
/* Events whose picture would not load (30 Sept 2026). "Only events with a
   thumbnail" meant only a thumbnail that was set: one that 404s, or that
   the image CDN turned away, was a dark empty frame with a caption over it,
   in its turn like any other. Dropped for this page load instead. */
const spotlightBroken = new Set();

const spotlightTime = v => {
    const t = typeof v === "string" && v ? Date.parse(v) : NaN;
    return isNaN(t) ? null : t;
};
function spotlightThumb(ev) {
    return [ev.thumb, ev.thumbnail, ev.image].find(v => typeof v === "string" && v) || "";
}
function spotlightLive(ev, now) {
    if (!ev || ev.spotlight !== true || !ev.id || !spotlightThumb(ev) || spotlightBroken.has(ev.id)) return false;
    const from = spotlightTime(ev.spotlightFrom), until = spotlightTime(ev.spotlightUntil);
    return (from === null || from <= now) && (until === null || now < until);
}

function spotlightSlide(ev) {
    const a = document.createElement("a");
    a.className = "welcome-promo-slide";
    a.href = `#event-${encodeURIComponent(ev.id)}`;
    const caption = (typeof ev.spotlightCaption === "string" && ev.spotlightCaption.trim()) || DEFAULT_SPOTLIGHT_CAPTION;
    a.setAttribute("aria-label", `${ev.title || "Event"}: ${caption}`);
    const img = document.createElement("img");
    img.className = "welcome-promo-img";
    img.alt = "";
    img.decoding = "async";
    /* Marked as a failure this page expects and handles (3 Oct 2026): a
       slide whose picture fails is dropped (spotlightBroken), so
       js/error-report.js counts it rather than filing "A picture failed to
       load" for every visitor who saw the spotlight. */
    img.setAttribute("data-fallback", "drop");
    img.addEventListener("error", () => {
        spotlightBroken.add(ev.id);
        showSpotlight();
    }, { once: true });
    img.src = imgCdn(spotlightThumb(ev), 960, null, 80);
    const cta = document.createElement("span");
    cta.className = "welcome-promo-cta";
    cta.textContent = caption;
    if (/^#[0-9a-f]{6}$/i.test(ev.spotlightColour || "")) cta.style.color = ev.spotlightColour;
    a.append(img, cta);
    return a;
}

function spotlightShow(index) {
    const el = document.getElementById("welcome-promo");
    const slides = el ? [...el.querySelectorAll(".welcome-promo-slide")] : [];
    if (!slides.length) return;
    spotlightIndex = ((index % slides.length) + slides.length) % slides.length;
    slides.forEach((s, i) => {
        const on = i === spotlightIndex;
        s.classList.toggle("is-shown", on);
        // Only the slide on show is a link anybody can reach.
        s.tabIndex = on ? 0 : -1;
        s.setAttribute("aria-hidden", on ? "false" : "true");
    });
    const dots = el.querySelectorAll(".welcome-promo-dot");
    dots.forEach((d, i) => {
        d.classList.toggle("is-on", i === spotlightIndex);
        if (i === spotlightIndex) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
    });
}

/* NO TURNS UNDER REDUCED MOTION, AND NONE AFTER A DOT (30 Sept 2026, the
   owner's). With "reduce motion" set, the slides never move by themselves
   and the dots are how to change them. A dot pressed shows its slide and
   stops the turns for the rest of this page load: somebody who picked a
   slide wants to read that one, not have it taken away seven seconds on. */
const spotlightReducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
let spotlightPaused = false;

function spotlightSchedule() {
    clearTimeout(spotlightTurnTimer);
    const el = document.getElementById("welcome-promo");
    if (!el || el.querySelectorAll(".welcome-promo-slide").length < 2) return;
    if (spotlightPaused || (spotlightReducedMotion && spotlightReducedMotion.matches)) return;
    spotlightTurnTimer = setTimeout(() => {
        /* And held while a window is open over the page (30 Sept 2026):
           the event window opened FROM a slide hands focus back to that
           slide when it closes, and a slide that had meanwhile taken its
           turn off is hidden and out of the tab order, so focus fell to
           the top of the page instead. */
        const covered = !!document.querySelector(".modal-overlay.open");
        if (!spotlightPointer && !spotlightFocus && !covered && !document.hidden) spotlightShow(spotlightIndex + 1);
        spotlightSchedule();
    }, SPOTLIGHT_TURN_MS);
}

async function showSpotlight() {
    const el = document.getElementById("welcome-promo");
    if (!el) return;
    if (!spotlightEvents) spotlightEvents = Api.getEvents().catch(() => []);
    const events = await spotlightEvents;
    const now = Date.now();
    const live = (Array.isArray(events) ? events : [])
        .filter(ev => spotlightLive(ev, now))
        .sort((a, b) => (spotlightTime(a.spotlightFrom) || 0) - (spotlightTime(b.spotlightFrom) || 0)
            || String(a.title || "").localeCompare(String(b.title || "")));
    /* What a slide is drawn from, not only which events (1 Oct 2026): keyed
       on the ids alone, a caption, colour or picture changed in the Warren
       was fetched by the three-minute refresh and then never drawn, because
       the same events were still on. */
    const key = JSON.stringify(live.map(ev => [ev.id, spotlightThumb(ev), ev.spotlightCaption || "", ev.spotlightColour || "", ev.title || ""]));
    if (!live.length) {
        el.hidden = true;
        el.replaceChildren();
        spotlightKey = "";
        spotlightFocus = false;
        clearTimeout(spotlightTurnTimer);
        return;
    }
    if (key !== spotlightKey) {
        // The one on show stays on show when others come or go around it.
        const was = el.querySelector(".welcome-promo-slide.is-shown");
        const wasId = was ? decodeURIComponent(was.getAttribute("href").replace(/^#event-/, "")) : "";
        const hadFocus = el.contains(document.activeElement);
        el.replaceChildren(...live.map(spotlightSlide));
        if (live.length > 1) {
            // Real buttons (30 Sept 2026): see spotlightPaused above. Beside
            // the slides, not in them, so a press is never the slide's.
            const dots = document.createElement("span");
            dots.className = "welcome-promo-dots";
            live.forEach((ev, i) => {
                const d = document.createElement("button");
                d.type = "button";
                d.className = "welcome-promo-dot";
                d.setAttribute("aria-label", `Show spotlight ${i + 1} of ${live.length}`);
                d.addEventListener("click", () => {
                    spotlightPaused = true;
                    clearTimeout(spotlightTurnTimer);
                    spotlightShow(i);
                });
                dots.appendChild(d);
            });
            el.appendChild(dots);
        }
        spotlightKey = key;
        const keep = live.findIndex(ev => ev.id === wasId);
        spotlightShow(keep >= 0 ? keep : 0);
        // Focus that was on the one kept stays on it; otherwise it went
        // with the old slides, and so does the hold it made.
        if (hadFocus && keep >= 0) {
            const shown = el.querySelector(".welcome-promo-slide.is-shown");
            if (shown) shown.focus({ preventScroll: true });
        }
        spotlightFocus = el.contains(document.activeElement);
        spotlightSchedule();
    }
    el.hidden = false;
}

function startSpotlight() {
    const el = document.getElementById("welcome-promo");
    if (!el) return;
    el.addEventListener("pointerenter", () => { spotlightPointer = true; });
    el.addEventListener("pointerleave", () => { spotlightPointer = false; });
    el.addEventListener("focusin", () => { spotlightFocus = true; });
    el.addEventListener("focusout", e => { if (!el.contains(e.relatedTarget)) spotlightFocus = false; });
    // The setting changed while the page is open: the turns stop or start.
    if (spotlightReducedMotion && typeof spotlightReducedMotion.addEventListener === "function") {
        spotlightReducedMotion.addEventListener("change", spotlightSchedule);
    }
    showSpotlight();
    clearInterval(spotlightRecheck);
    spotlightRecheck = setInterval(showSpotlight, SPOTLIGHT_RECHECK_MS);
    clearInterval(spotlightRefresh);
    spotlightRefresh = setInterval(refreshSpotlightEvents, SPOTLIGHT_REFRESH_MS);
}

/* FROM THE SERVER AGAIN, EVERY THREE MINUTES (30 Sept 2026, the owner's).
   The 20-second recheck only re-reads the events this page loaded with, so
   a spotlight ticked or unticked in the Warren never reached a landing page
   left open. Api.getEvents keeps one request per page load (its _inflight
   memo, in js/api.js), so that memo is dropped and the events asked for
   again — one GET per three minutes, none while the tab is hidden — and the
   spotlight redrawn from the answer. The event window and the ticker read
   the same memo, so they see it too. A failed ask (Api's offline stand-in)
   keeps what the page already had rather than emptying the spotlight. */
const SPOTLIGHT_REFRESH_MS = 3 * 60 * 1000;
let spotlightRefresh = null;

async function refreshSpotlightEvents() {
    if (document.hidden || typeof Api === "undefined" || !Api._inflight) return;
    const before = Api._inflight.events;
    const kept = spotlightEvents;
    delete Api._inflight.events;
    const asked = Api.getEvents();
    const memo = Api._inflight.events;
    spotlightEvents = asked.then(events => {
        if (Api._degraded && Api._degraded.has("event data")) {
            // The stand-in, not an answer: put the last real one back.
            if (before && Api._inflight.events === memo) Api._inflight.events = before;
            return kept || [];
        }
        return events;
    }, () => kept || []);
    await spotlightEvents;
    showSpotlight();
}

document.addEventListener("DOMContentLoaded", async () => {
    const btn = document.getElementById("welcome-btn");
    const label = document.getElementById("welcome-btn-label");

    /* Banned from the whole site: the Maintenance page, and a cool-down's
       pop-up, instead of anything below — no countdown, and no poll, which
       would send them into the archive the moment the site opened. */
    const block = await blockedHere();
    if (block) {
        labelGated("maintenance");
        if (block.until) showCoolDown(block, btn);
        return;
    }

    /* Every state, and before the settings are read (30 Sept 2026): the
       spotlight doesn't depend on them, and a cold settings function kept it
       waiting. After the ban check on purpose — a banned visitor never gets
       it, and without a ban note that check answers at once. */
    startSpotlight();

    let { landingState, launchAt, fromCache } = (await Api.getSiteSettings()) || {};
    /* An answer with no state in it is no answer (1 Oct 2026), exactly as
       home.html's gate reads one: it used to fall to the else below and
       make the button a live Enter link. Shut, as for any unreadable read,
       and the poll corrects it. */
    if (typeof landingState !== "string" || !landingState) {
        landingState = typeof Api.unreadableLandingState === "function" ? Api.unreadableLandingState() : "coming-soon";
        launchAt = "";
        fromCache = true;
    }

    // aria-disabled moves with the label: the button is focusable in every
    // state (see its markup in index.html), so the state has to be spoken
    // rather than left to the visual treatment alone. A function so the
    // poll can relabel a site that moves between the two gated states.
    function labelGated(state) {
        const text = state === "maintenance" ? "Maintenance, Back Soon!" : "Coming Soon";
        if (label.textContent !== text) label.textContent = text;
        btn.removeAttribute("href");
        btn.classList.add("is-disabled");
        btn.setAttribute("aria-disabled", "true");
    }

    if (landingState === "coming-soon" || landingState === "maintenance") {
        labelGated(landingState);
    } else {
        label.textContent = "Enter";
        /* The clean address, not the filename. This is the one link on the
           site that every first-time visitor presses, so whatever it says is
           what ends up in the address bar — and, from there, in whatever they
           paste into Discord. The prefetch above was pointed at the same
           spelling for the same reason: two spellings would be two cache
           entries and the warm one would be the address nobody arrives at. */
        btn.setAttribute("href", "/home");
        btn.classList.remove("is-disabled");
        btn.removeAttribute("aria-disabled");
        // A real link again, so it takes its place in the tab order on its
        // own terms rather than through the stand-in role.
        btn.removeAttribute("role");
        btn.removeAttribute("tabindex");
        warmTheArchive(btn);
    }

    /* The countdown, once the button above has said its piece.

       Only while gated: on a live site the door is open and how long it
       took to get here is nobody's business. Parsed defensively because
       this value came over the wire — an unreadable date leaves the gate
       exactly as the block above left it. */
    const gated = isGatedState(landingState);
    if (!gated) return;
    // Past as well as future: a date already gone is still the date the
    // poll paces itself by, though startCountdown draws nothing for it.
    const launchDate = v => {
        if (!v || typeof v !== "string") return null;
        const parsed = new Date(v);
        return isNaN(parsed.getTime()) ? null : parsed;
    };
    let target = launchDate(launchAt);
    /* COMING SOON ONLY, not every gated state (28 Sept 2026).

       launchAt is the date the archive OPENS, and it is not cleared once it
       has. So a Maintenance window after launch — or any later gated
       period — came up under a clock reading "Opening any moment now" and
       "No need to refresh: this page will let you in", about a launch that
       happened weeks ago, beside a button saying "Maintenance, Back Soon!".
       The countdown and its wording now belong to Coming Soon alone;
       Maintenance keeps its plain button and nothing under it. And it
       follows the poll: a site moved from Coming Soon to Maintenance while
       the page is open loses its clock, and one moved back gets it again.

       The poll itself is NOT narrowed — watchForOpening still runs in every
       gated state, which is what lets a Maintenance visitor in the moment
       it is over. */
    let countdown = null;
    function showCountdownFor(state) {
        if (state === "coming-soon") {
            if (!countdown && target) countdown = startCountdown(target) || null;
        } else if (countdown) {
            countdown.stop();
            countdown = null;
        }
    }
    showCountdownFor(landingState);
    // Always, while gated — see the note on watchForOpening. The answer
    // above may itself have been a stale edge copy, and this is what
    // corrects it.
    watchForOpening(() => target, (state, settings) => {
        labelGated(state);
        // A real answer's date replaces the one this page started with —
        // arrived late, moved, or cleared — and the clock is redrawn for it.
        const fresh = launchDate(settings && settings.launchAt);
        if ((fresh ? fresh.getTime() : null) !== (target ? target.getTime() : null)) {
            target = fresh;
            // Its space kept (1 Oct 2026): a moved date redraws it in the
            // same place, and a cleared or past one leaves no jump behind.
            if (countdown) { countdown.stop(true); countdown = null; }
        }
        showCountdownFor(state);
    /* Not the stand-in's state (30 Sept 2026). A read that failed comes
       back as "coming-soon" with no date because nothing is known, not
       because no date is set — and that took the far cadence, so a visitor
       whose first read failed on launch morning, when the endpoint is
       busiest, waited two to four minutes between asks. Seeded with nothing,
       the poll stays on the fast pace until a real answer says otherwise. */
    }, fromCache ? null : landingState);
});

// Upcoming Events widget on this page (see js/site.js) opens the event
// right here instead of navigating to home.html — home.html is off-limits
// to regular visitors during Coming Soon/Maintenance (see js/site.js's own
// gate) and would just bounce them straight back to this page. Deliberately
// simpler than home.html's full room/event modal: a single image + a
// click-through thumbnail strip, no auto-advance carousel or old-versions
// view — just enough to preview the event without porting all of that
// machinery, which only home.html actually needs.
document.addEventListener("DOMContentLoaded", async () => {
    const modal = document.getElementById("event-modal");
    if (!modal || typeof Api === "undefined") return;

    const nameEl = document.getElementById("event-modal-name");
    const closeBtn = document.getElementById("event-modal-close");
    const thumbEl = document.getElementById("event-modal-thumb");
    const frameEl = document.getElementById("event-modal-frame");
    const imgEl = document.getElementById("event-modal-img");
    const hostEl = document.getElementById("event-modal-host");
    const builderEl = document.getElementById("event-modal-builder");
    const tagsEl = document.getElementById("event-modal-tags");
    const ecBadgeEl = document.getElementById("event-modal-ec-badge");
    const ecLabelEl = document.getElementById("event-modal-ec-label");
    // Worded exactly as js/home.js words it — the same badge on the same row.
    const EC_SEASON_NAMES = { s1: "Event Creators Season One", s2: "Event Creators Season Two" };

    // Built exactly as js/home.js builds it, for the same row under the same
    // CSS: the phrase and its "EC / S2" short form, one shown at each width.
    // See js/home.js for why both are written rather than one chosen here.
    function ecLabelForms(season) {
        const full = document.createElement("span");
        full.className = "ec-label-full";
        full.textContent = EC_SEASON_NAMES[season].replace(" Season", "\nSeason");
        const short = document.createElement("span");
        short.className = "ec-label-short";
        short.textContent = `EC\n${season.toUpperCase()}`;
        return [full, short];
    }
    const articleEl = document.getElementById("event-modal-article");
    const articleTitleEl = document.getElementById("event-modal-article-title");
    const articleMetaEl = document.getElementById("event-modal-article-meta");
    const articleBodyEl = document.getElementById("event-modal-article-body");
    const articleLinkEl = document.getElementById("event-modal-article-link");
    const metaEl = document.getElementById("event-modal-meta");
    const descEl = document.getElementById("event-modal-desc");
    const visitWrap = document.getElementById("event-modal-visit-wrap");
    const visitLink = document.getElementById("event-modal-link");
    const stripEl = document.getElementById("event-modal-strip");
    const linksWrap = document.getElementById("event-modal-links-wrap");
    const linksEl = document.getElementById("event-modal-links");

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // A stored address about to become a clickable link: http(s) only, ""
    // for anything else, and every caller hides its link on "". The same
    // rule, and the same reasons, as safeHttpUrl in js/home.js — a
    // "javascript:" address is a perfectly valid attribute value.
    function safeHttpUrl(str) {
        const raw = String(str == null ? "" : str).trim();
        if (!raw) return "";
        try {
            const url = new URL(raw, location.href);
            return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
        } catch (e) {
            return "";
        }
    }

    /* The event's details in the guides' text format (30 Sept 2026) — bold,
       italics, links and lists, from the /warren form's buttons — read by
       js/guide-text.js, as the room window in js/home.js reads them, so an
       event looks the same from either page. It escapes everything first:
       nothing typed reaches the page as markup the format did not make.

       This page does not load guide-text.js for anything else, so it is
       fetched here, once, and only when an event window first opens. Until
       it has arrived the text goes in as plain text, as it always did, and
       is redrawn formatted the moment it lands if the same event is still
       showing. Absolute, for the reason palette-wear.js gives. */
    let guideTextLoad = null;
    function loadGuideText() {
        if (typeof GuideText !== "undefined") return Promise.resolve();
        if (!guideTextLoad) {
            guideTextLoad = new Promise((ok, fail) => {
                const s = document.createElement("script");
                s.src = "/js/guide-text.js?v=2";
                s.onload = ok;
                s.onerror = () => { guideTextLoad = null; fail(); };
                document.head.appendChild(s);
            });
        }
        return guideTextLoad;
    }
    let descShowing = 0;
    /* The formatted details, with their links to the archive pointed here
       while the site is gated (30 Sept 2026, the owner's): a maze: or
       guide: link went to home.html, whose gate bounced the visitor straight
       back. pointGatedLinksHome (js/site.js) does for them what it does for
       the rest of this page. An event: link keeps its data-guide-event and
       opens in this window instead — see the click handler below. */
    function renderDesc(el, s) {
        el.innerHTML = GuideText.render(s);
        if (typeof pointGatedLinksHome === "function") pointGatedLinksHome(el);
    }
    function showDesc(el, text) {
        const s = String(text == null ? "" : text);
        const turn = ++descShowing;
        if (typeof GuideText !== "undefined") { renderDesc(el, s); return; }
        el.textContent = s;
        loadGuideText().then(() => {
            // Still this event's text: another may have opened meanwhile.
            if (turn === descShowing && typeof GuideText !== "undefined") renderDesc(el, s);
        }, () => {});
    }

    // Escapes first, then links what's left — same order and same trailing-
    // punctuation handling as home.js's linkifyText, so an event's Links &
    // References reads identically on both pages.
    function linkifyText(str) {
        return escapeHtml(str).replace(/((?:https?:\/\/|www\.)[^\s<]+)/gi, match => {
            let core = match;
            let trailing = "";
            while (core.length) {
                const last = core[core.length - 1];
                if (".,!?;:".includes(last)) {
                    trailing = last + trailing;
                    core = core.slice(0, -1);
                    continue;
                }
                if (last === ")" && (core.match(/\)/g) || []).length > (core.match(/\(/g) || []).length) {
                    trailing = last + trailing;
                    core = core.slice(0, -1);
                    continue;
                }
                break;
            }
            if (!core) return match;
            const href = /^https?:\/\//i.test(core) ? core : `https://${core}`;
            return `<a href="${href}" target="_blank" rel="noopener" class="ref-link">${core}</a>${trailing}`;
        });
    }

    /* ---- the host's Habbo card ----

       The same avatar / online-or-last-seen / motto card home.html builds
       for a maze's builders, for the event's host. It is the last thing
       that made this modal look like a different, plainer component than
       the one it mirrors: everything else matched and the host was still a
       bare "by ChrisYepYep".

       Kept as its own small copy rather than shared with js/home.js, for
       the same reason the rest of this file is a copy — home.js is 157KB of
       grid, carousel and lightbox machinery this page must never load, and
       it is not written to be imported. What is duplicated here is the
       markup contract with css/style.css (.builder-list / .builder-card /
       .builder-avatar / .builder-name / .builder-status / .builder-motto),
       which is where the styling actually lives. */
    function creatorNames(host) {
        return String(host || "").split(",").map(s => s.trim()).filter(Boolean);
    }

    function relativeLastSeen(iso) {
        const then = new Date(iso);
        if (isNaN(then)) return "";
        const mins = Math.floor((Date.now() - then.getTime()) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
        const days = Math.floor(hours / 24);
        if (days < 30) return days + (days === 1 ? " day ago" : " days ago");
        return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    function builderCard(profile, mirrored) {
        const card = document.createElement("div");
        card.className = mirrored ? "builder-card builder-card--mirrored" : "builder-card";

        if (profile.avatar) {
            const avatar = document.createElement("img");
            avatar.className = "builder-avatar";
            avatar.src = profile.avatar;
            avatar.alt = "";
            avatar.loading = "lazy";
            // habbo.com's imaging service is outside this site's control —
            // if it fails, drop just the image rather than leaving a broken
            // icon next to a perfectly good name and motto.
            avatar.addEventListener("error", () => avatar.remove());
            card.appendChild(avatar);
        }

        const text = document.createElement("div");
        text.className = "builder-text";

        const nameLine = document.createElement("p");
        nameLine.className = "builder-name";
        // Text nodes throughout: names and mottos are written by Habbo
        // users, not by an admin here.
        nameLine.appendChild(document.createTextNode(profile.name));

        const status = document.createElement("span");
        status.className = profile.online ? "builder-status is-online" : "builder-status";
        status.textContent = profile.online
            ? "Online"
            : (profile.lastAccessTime ? "Last seen " + relativeLastSeen(profile.lastAccessTime) : "");
        if (status.textContent) nameLine.appendChild(status);
        text.appendChild(nameLine);

        if (profile.motto) {
            const motto = document.createElement("p");
            motto.className = "builder-motto";
            motto.textContent = profile.motto;
            text.appendChild(motto);
        }

        card.appendChild(text);
        return card;
    }

    // Guards against a slow profile lookup landing after the visitor has
    // opened a different event — the same token pattern home.js uses.
    /* Several hosts in one card, rather than a card each.

       The same shape js/home.js builds when a maze credits three or more
       builders — avatars in a row, names on one line under them — and it is
       here for the same reason it is there: past a pair, a column of full
       cards is taller than the modal wants to be and says the same thing
       less clearly. The Valentines and Anniversary collabs have four hosts
       apiece, which was four stacked cards on this page against one combined
       card two clicks away.

       Markup contract with css/style.css, exactly as the rest of this file's
       copy is: .builder-card--collab / .builder-avatars / .builder-avatar /
       .builder-text / .builder-name. Nothing new is styled for it. */
    function collabCard(profiles) {
        const card = document.createElement("div");
        card.className = "builder-card builder-card--collab";

        const avatars = document.createElement("div");
        avatars.className = "builder-avatars";
        profiles.forEach(profile => {
            if (!profile.avatar) return;
            const avatar = document.createElement("img");
            avatar.className = "builder-avatar";
            avatar.src = profile.avatar;
            avatar.alt = "";
            avatar.loading = "lazy";
            // A host whose figure will not load drops out rather than
            // leaving a broken image in the row.
            avatar.addEventListener("error", () => avatar.remove());
            avatars.appendChild(avatar);
        });
        if (avatars.children.length) card.appendChild(avatars);

        const text = document.createElement("div");
        text.className = "builder-text";
        const nameLine = document.createElement("p");
        nameLine.className = "builder-name";
        // Text node, not innerHTML — these names come from Habbo.
        nameLine.appendChild(document.createTextNode(profiles.map(p => p.name).join(", ")));
        text.appendChild(nameLine);
        card.appendChild(text);

        return card;
    }

    let builderToken = 0;

    async function showHostCard(event) {
        const token = ++builderToken;
        builderEl.hidden = true;
        builderEl.innerHTML = "";
        hostEl.hidden = false;

        const names = creatorNames(event.host);
        if (!names.length) return;

        // In parallel and individually tolerant: a co-host who is not on the
        // hotel does not cost the others their card.
        const profiles = (await Promise.all(names.map(n => Api.getHabboProfile(n)))).filter(Boolean);
        if (token !== builderToken || !profiles.length) return;

        /* MORE THAN ONE HOST AND THEY SHARE A CARD. Only a solo host gets the
           full treatment with their motto and last-seen under them.

           The same single rule js/home.js now uses for a maze's builders —
           see showBuilderCard there. Two people who ran something together
           are one credit, and the same event opened in either modal says so
           the same way. */
        if (profiles.length > 1) {
            builderEl.appendChild(collabCard(profiles));
        } else {
            profiles.forEach((p, i) => builderEl.appendChild(builderCard(p, i % 2 === 1)));
        }
        // The cards carry the names themselves, so "by <host>" would only
        // repeat them.
        hostEl.hidden = true;
        builderEl.hidden = false;
    }

    function formatUtcParts(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return null;
        return {
            date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
            time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })
        };
    }

    /* An event with no date yet reads "TBC" rather than going blank. A date
       is often the last thing settled about an event, and an empty field
       looks like the page failed to load it rather than like nobody has
       picked one — which is the actual state of affairs and worth saying. */
    function formatEventDuration(startIso, endIso) {
        // Bare "TBC", matching home.js's own formatEventDuration. It used to
        // return "Date TBC" because this string was the whole meta line and
        // had to say what it was about; it is now rendered behind a "Date:"
        // label like the homepage's, where that read "Date: Date TBC".
        if (!startIso) return "TBC";
        const start = formatUtcParts(startIso);
        if (!start) return startIso;
        const end = endIso ? formatUtcParts(endIso) : null;
        if (!end) return `${start.date}, ${start.time} UTC`;
        if (start.date === end.date) return `${start.date}, ${start.time}–${end.time} UTC`;
        return `${start.date} ${start.time} UTC – ${end.date} ${end.time} UTC`;
    }

    // Same {image, label} vs. plain-string shape home.js's own
    // normalizeGalleryItem handles — its own small copy here since this
    // modal only ever needs the image/label pair out of it, in entrance →
    // gallery → finish order, falling back to the plain thumb if none of
    // those are set.
    function galleryImages(event) {
        const images = [];
        if (event.entrance && event.entrance.image) images.push({ image: event.entrance.image, label: event.entrance.label || "Entrance" });
        (event.gallery || []).forEach(g => {
            const item = typeof g === "string" ? { image: g, label: "" } : g;
            if (item.image) images.push({ image: item.image, label: item.label || "" });
        });
        if (event.finish && event.finish.image) images.push({ image: event.finish.image, label: event.finish.label || "Complete" });
        if (!images.length && event.thumb) images.push({ image: event.thumb, label: "" });
        return images;
    }

    function showImage(images, index) {
        const item = images[index];
        imgEl.src = imgCdn(item.image, 900, null, 75);
        imgEl.alt = item.label || "";
        stripEl.querySelectorAll("img").forEach((el, i) => el.classList.toggle("active", i === index));
    }

    /* Asked of Api each time (30 Sept 2026) — its memo makes that free —
       rather than kept here from the first open, so an event the spotlight
       has picked up since (see refreshSpotlightEvents) opens when its slide
       is clicked instead of doing nothing. */
    /* The last GOOD list when the ask fails (3 Oct 2026). Api answers a
       failure with its offline stand-in, and this page has no
       events-data.js, so that is [] — and a click landing while
       refreshSpotlightEvents had dropped the memo opened nothing. The
       window's own last list, or the spotlight's (which keeps what it had
       on a failed refresh), is used instead. */
    let cachedEvents = null;
    async function ensureEvents() {
        let events = null;
        try { events = await Api.getEvents(); } catch (e) { /* below */ }
        const standIn = !Array.isArray(events) || (Api._degraded && Api._degraded.has("event data"));
        if (standIn) {
            let held = cachedEvents;
            if (!Array.isArray(held) || !held.length) {
                try { held = spotlightEvents ? await spotlightEvents : null; } catch (e) { held = null; }
            }
            if (Array.isArray(held) && held.length) events = held;
        }
        cachedEvents = Array.isArray(events) ? events : (cachedEvents || []);
        return cachedEvents;
    }

    /* "Couldn't load that event" (3 Oct 2026): what a click on a spotlight
       or ticker event says when no list this page has holds it, rather than
       nothing at all. The cool-down's small window, with one OK. */
    let missingOverlay = null;
    let missingEscape = false;
    function showEventMissing() {
        if (missingOverlay && missingOverlay.isConnected) return;
        const returnTo = document.activeElement;
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay open nick-overlay notice-overlay event-missing-overlay";
        overlay.innerHTML = `
            <div class="modal confirm-modal notice-window" role="dialog" aria-modal="true"
                 aria-labelledby="event-missing-title" aria-describedby="event-missing-text" tabindex="-1">
                <div class="chrome-titlebar">
                    <h2 id="event-missing-title">Event</h2>
                    <button type="button" class="chrome-close" aria-label="Close"><img src="/assets/img/modal_topclose_x.png" alt="" aria-hidden="true"></button>
                </div>
                <div class="chrome-frame">
                    <div class="modal-body notice-body">
                        <div class="notice-text" id="event-missing-text"><p class="notice-lines">Couldn't load that event just now. Please try again in a moment.</p></div>
                        <div class="notice-actions"><button type="button" class="view-switch-btn notice-ok">OK</button></div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.body.classList.add("modal-open");
        missingOverlay = overlay;
        function close() {
            if (!overlay.isConnected) return;
            overlay.remove();
            document.removeEventListener("keydown", onKey, true);
            if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open");
            if (returnTo && document.contains(returnTo) && typeof returnTo.focus === "function") returnTo.focus({ preventScroll: true });
        }
        overlay.closeNotice = close;
        function onKey(e) { if (e.key === "Escape") close(); }
        overlay.querySelector(".notice-ok").addEventListener("click", close);
        overlay.querySelector(".chrome-close").addEventListener("click", close);
        overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
        // Registered once for the page, not once a notice.
        if (window.EscapeLayers) {
            if (!missingEscape) {
                missingEscape = true;
                EscapeLayers.register({
                    elements: () => (missingOverlay && missingOverlay.isConnected ? [missingOverlay] : []),
                    close: el => el.closeNotice()
                });
            }
        } else {
            document.addEventListener("keydown", onKey, true);
        }
        overlay.querySelector(".notice-ok").focus({ preventScroll: true });
    }

    /* Where focus was when the modal opened, so closing it can put focus
       back there. Without this a keyboard or screen-reader user who opened
       an event from the header ticker was dropped at the top of the page on
       close, with no idea where the thing they had been reading went. */
    let eventTrigger = null;

    /* ONE BACK, ONE THING (3 Oct 2026). A spotlight or ticker link PUSHES
       its #event- entry (js/site.js follows fragment links with
       location.hash), so Back went to "/" with the window still open, and
       the next Back left the site; and closing with × rewrote the pushed
       entry to "/", leaving two "/" entries for Back to step through with
       nothing happening. Now every entry this page's own hash links pushed
       is numbered in history.state (eventDepth: how many #event- entries
       above the plain page it is), Back to an address without #event-
       closes the window, and × or Escape steps back over the pushed ones
       instead of rewriting them. An address that arrived with the hash
       (a shared link, nothing pushed) still has it dropped in place. */
    const EVENT_DEPTH_KEY = "welcomeEventDepth";
    let eventDepth = 0;
    function depthOfEntry() {
        const s = history.state;
        return s && typeof s === "object" && Number.isInteger(s[EVENT_DEPTH_KEY]) ? s[EVENT_DEPTH_KEY] : null;
    }
    function markEntry(depth) {
        const s = history.state && typeof history.state === "object" ? history.state : {};
        try { history.replaceState({ ...s, [EVENT_DEPTH_KEY]: depth }, ""); } catch (e) { /* unmarked: × drops it in place */ }
    }
    // Off the #event- address: back over what was pushed, or dropped in place.
    function leaveEventHash(all) {
        if (!/^#event-/.test(location.hash)) return;
        if (eventDepth > 0) {
            history.go(all ? -eventDepth : -1);
            return;
        }
        history.replaceState(history.state, "", location.pathname + location.search);
    }

    function closeEventModal(fromHistory) {
        modal.classList.remove("open");
        const back = eventTrigger;
        eventTrigger = null;
        if (back && document.contains(back) && typeof back.focus === "function") {
            back.focus({ preventScroll: true });
        }
        // History already moved (Back): nothing more to do to it.
        if (fromHistory === true) return;
        leaveEventHash(true);
    }

    async function openEventModalById(id, fromHash) {
        const events = await ensureEvents();
        // Back pressed while the list was being asked for: that hash is gone.
        if (fromHash === true && hashEventId() !== id) return;
        const event = events.find(e => e.id === id);
        if (!event) {
            /* Not found (3 Oct 2026): the hash is taken off again, or it
               stays set and a second click on the same link — the same
               hash, so no hashchange — does nothing at all. */
            if (hashEventId() === id) {
                leaveEventHash(false);
                // Said only when the list itself is in doubt; a link to an
                // event since deleted is dropped quietly, as before.
                if (!events.length || (Api._degraded && Api._degraded.has("event data"))) showEventMissing();
            }
            return;
        }
        // Only on a fresh open: a second event opened over the first (the
        // ticker moves on underneath) must not replace the real opener with
        // something inside the modal.
        if (!modal.classList.contains("open")) eventTrigger = document.activeElement;

        nameEl.textContent = event.title || "";
        hostEl.textContent = event.host ? `by ${event.host}` : "";
        showHostCard(event);
        tagsEl.innerHTML = (event.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");

        /* An EC event's season medal, at the right of the builder row, and a
           wash of the badge's own green over the modal with it (see
           .modal.is-ec). Off the event's own season, so a regular event —
           which is every event with no ecSeason at all — is left exactly as
           it was. Only the two seasons the admin page offers are recognised;
           the value reaches a filename, so it is not taken on trust. */
        const ecSeason = ["s1", "s2"].includes(event.ecSeason) ? event.ecSeason : "";
        if (ecSeason) {
            ecBadgeEl.src = `assets/img/ec/ec-badge-${ecSeason}.png`;
            // Spelled out and abbreviated, exactly as js/home.js sets them —
            // see there for why both are written and the CSS chooses.
            ecBadgeEl.alt = EC_SEASON_NAMES[ecSeason];
            ecLabelEl.replaceChildren(...ecLabelForms(ecSeason));
        }
        ecBadgeEl.hidden = !ecSeason;
        ecLabelEl.hidden = !ecSeason;
        modal.querySelector(".modal").classList.toggle("is-ec", !!ecSeason);
        /* The same status / hotel / date line home.html's modal writes, in
           the same order and markup. This was a bare date string before,
           which was the visible half of this modal having drifted from the
           one it is meant to mirror. EventStatus is the shared derivation
           the header ticker and the admin form already use, so the badge
           here cannot disagree with the one next to it on the page. */
        const statusKey = (typeof EventStatus !== "undefined")
            ? EventStatus.derive(event) : (event.status || "upcoming");
        const statusLabel = (typeof EventStatus !== "undefined")
            ? EventStatus.labelFor(event) : statusKey;
        metaEl.innerHTML =
            `<span class="status-badge status-${escapeHtml(statusKey)}">${escapeHtml(statusLabel)}</span>` +
            `<span>Hotel: ${escapeHtml(event.hotel || "Unknown")}</span>` +
            `<span>Date: ${escapeHtml(formatEventDuration(event.date, event.endDate))}</span>`;
        /* The FULL details (30 Sept 2026), as home.js's modal shows them —
           `description` is the short line the header ticker and the cards
           use, and on its own here it cut every event opened from the
           ticker down to its teaser. */
        showDesc(descEl, event.details || event.description || "");

        /* The stored Habbo article, if this event has one.
        
           body goes in as markup, which is the one place on this site that
           happens. It is safe because of where it comes from: it was rebuilt
           tag by tag against a whitelist by netlify/functions/article.js
           before it was ever stored, so what is held is already only the
           handful of elements an article is allowed to be. Nothing is fetched
           or parsed here. It is sanitised again on SAVE by
           netlify/functions/events.js, since an event save carries the
           article back and could otherwise store anything — see the fuller
           note at the same line in js/home.js.

           An article stands in for the event's full details — the admin form
           will not let both be set — so the description above it is the short
           one, and this reads as the piece itself below it. */
        const article = event.article;
        if (article && article.body) {
            articleTitleEl.textContent = article.title || "";
            articleMetaEl.textContent = [article.date, article.category].filter(Boolean).join("  —  ");
            articleBodyEl.innerHTML = article.body;
            /* The source line goes when there is nowhere for it to point,
               exactly as home.js does it: an article can be stored without a
               URL, and "Read it on Habbo Origins" leading to "#" jumped the
               reader to the top of the page. The paragraph goes too, not just
               the anchor, or its empty margin stays under the article. */
            const source = safeHttpUrl(article.url);
            articleLinkEl.href = source || "#";
            const sourceLine = articleLinkEl.closest(".modal-article-source");
            if (sourceLine) sourceLine.hidden = !source;
            articleEl.hidden = false;
        } else {
            // Emptied, not just hidden: an article left in the DOM is a
            // screenful of the last event's text one class away from showing.
            articleBodyEl.innerHTML = "";
            articleEl.hidden = true;
        }
        // Same Links & References block home.html shows for an event.
        if (event.linksReferences) {
            linksEl.innerHTML = linkifyText(event.linksReferences);
            linksWrap.style.display = "block";
        } else {
            linksEl.innerHTML = "";
            linksWrap.style.display = "none";
        }

        const habboLink = safeHttpUrl(event.habboLink);
        if (habboLink) {
            visitLink.href = habboLink;
            visitWrap.style.display = "block";
        } else {
            visitWrap.style.display = "none";
        }

        const images = galleryImages(event);
        // .has-gallery goes on the thumb either way — it is what picks the
        // taller frame height for a multi-image event, and leaving it set
        // from a previous open would size a single image against it.
        thumbEl.classList.toggle("has-gallery", images.length > 1);
        if (images.length) {
            frameEl.style.display = "";
            showImage(images, 0);
            if (images.length > 1) {
                stripEl.style.display = "flex";
                // Reachable by keyboard as well as by pointer, the same way
                // js/home.js's own strip is: tabindex and role="button", with
                // Enter and Space doing what a click does.
                stripEl.innerHTML = images.map((img, i) => `<img src="${imgCdn(img.image, 110, 110, 55)}" loading="lazy" alt="${escapeHtml(img.label || `Image ${i + 1}`)}" class="${i === 0 ? "active" : ""}" tabindex="0" role="button">`).join("");
                stripEl.querySelectorAll("img").forEach((thumb, i) => {
                    thumb.addEventListener("click", () => showImage(images, i));
                    thumb.addEventListener("keydown", e => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        showImage(images, i);
                    });
                });
            } else {
                stripEl.style.display = "none";
                stripEl.innerHTML = "";
            }
        } else {
            frameEl.style.display = "none";
            imgEl.removeAttribute("src");
            stripEl.style.display = "none";
            stripEl.innerHTML = "";
        }

        modal.classList.add("open");
        // Onto the window itself, so a screen reader announces the dialog by
        // its title and Tab starts from inside it rather than from the link
        // that opened it.
        const win = modal.querySelector(".modal");
        if (win && !win.contains(document.activeElement)) win.focus({ preventScroll: true });
    }

    // A same-page <a href="#event-...">  (see js/site.js's slideMarkup)
    // updates location.hash on its own with no reload — no click handler
    // needed, just react to the hashchange it causes, the same as a
    // shared/bookmarked "index.html#event-..." link landing here directly.
    // A hand-typed or mangled address can carry a bare "%" that is not
    // an escape, and decodeURIComponent throws on it — which, here at the
    // top of a listener, took the whole handler down. A hash that does not
    // decode names no event, so it is ignored like any other unknown one.
    function hashEventId() {
        const m = /^#event-(.+)$/.exec(location.hash);
        if (!m) return null;
        try { return decodeURIComponent(m[1]); } catch (e) { return null; }
    }

    // `pushed`: from a hashchange, where an unmarked #event- entry is one
    // just pushed on top of the entry we were on (see ONE BACK, ONE THING).
    function checkHash(pushed) {
        const onEvent = /^#event-/.test(location.hash);
        const marked = depthOfEntry();
        if (!onEvent) {
            eventDepth = 0;
            // Back (or any move) to an address without an event: the window goes.
            if (pushed === true && modal.classList.contains("open")) closeEventModal(true);
            return;
        }
        if (marked !== null) eventDepth = marked;
        else {
            // Arrived with the page (a shared link) is 0, so Back onto it later reads right.
            eventDepth = pushed === true ? eventDepth + 1 : 0;
            markEntry(eventDepth);
        }
        const id = hashEventId();
        if (id === null) return;
        openEventModalById(id, true);
    }

    /* An event: link in the details (30 Sept 2026, the owner's) opens that
       event in this window, in place, rather than loading its address —
       which, while the site is gated, was home.html bouncing back here. A
       maze: or guide: link has no window on this page, so it is left to the
       browser (and pointed at this page while gated: see renderDesc), as is
       an event this page's list does not have, and a new tab. */
    descEl.addEventListener("click", e => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest && e.target.closest("[data-guide-event]");
        if (!a) return;
        const key = a.dataset.guideEvent;
        const known = cachedEvents && cachedEvents.find(ev => window.RecordAddress
            ? window.RecordAddress.matches(ev, key) : ev && ev.id === key);
        if (!known) return;
        e.preventDefault();
        openEventModalById(known.id);
    });

    window.addEventListener("hashchange", () => checkHash(true));
    closeBtn.addEventListener("click", () => closeEventModal());
    modal.addEventListener("click", e => { if (e.target === modal) closeEventModal(); });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && modal.classList.contains("open")) closeEventModal();
    });

    checkHash();
});

// Privacy policy modal for this page. The footer link js/site.js injects
// points at "#privacy" here (rather than home.html#privacy) because
// home.html turns regular visitors away during Coming Soon/Maintenance —
// exactly the states in which the landing page is all anyone can see. The
// policy text and its markup are shared with the homepage console modal;
// see js/privacy-content.js.
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("privacy-modal");
    if (!modal || typeof renderPrivacySections !== "function") return;

    const closeBtn = document.getElementById("privacy-modal-close");

    renderPrivacySections(document.getElementById("welcome-privacy-body"));

    // Focus in on open and back out on close, for the same reasons as the
    // event modal above.
    let privacyTrigger = null;

    function openPrivacyModal() {
        if (!modal.classList.contains("open")) privacyTrigger = document.activeElement;
        modal.classList.add("open");
        const win = modal.querySelector(".modal");
        if (win && !win.contains(document.activeElement)) win.focus({ preventScroll: true });
    }

    function closePrivacyModal() {
        modal.classList.remove("open");
        const back = privacyTrigger;
        privacyTrigger = null;
        if (back && document.contains(back) && typeof back.focus === "function") {
            back.focus({ preventScroll: true });
        }
        // Drop the hash without a history entry or a re-fired hashchange,
        // same as closeEventModal above.
        if (location.hash === "#privacy") {
            history.replaceState(null, "", location.pathname + location.search);
        }
    }

    function checkPrivacyHash() {
        if (location.hash === "#privacy") openPrivacyModal();
    }

    // The footer link is a same-page hash, so clicking it while the modal
    // is already closed-but-hash-still-set fires no hashchange — hence the
    // direct click handler as well as the hashchange listener.
    /* Capture phase, so this runs before js/site.js's own fragment-link
       handler, which index.html's <base href="/"> now switches on: that one
       would push a second #privacy entry. It stands aside for a click
       already handled (defaultPrevented). */
    document.addEventListener("click", e => {
        const link = e.target.closest && e.target.closest('a[href="#privacy"]');
        if (!link) return;
        e.preventDefault();
        if (location.hash !== "#privacy") {
            history.replaceState(null, "", location.pathname + location.search + "#privacy");
        }
        openPrivacyModal();
    }, true);

    window.addEventListener("hashchange", checkPrivacyHash);
    closeBtn.addEventListener("click", closePrivacyModal);
    modal.addEventListener("click", e => { if (e.target === modal) closePrivacyModal(); });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && modal.classList.contains("open")) closePrivacyModal();
    });

    checkPrivacyHash();
});

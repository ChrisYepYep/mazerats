/* Drives the welcome/splash screen (index.html) — swaps the Enter button's
   label and behavior based on the landing state set from the admin page
   (see netlify/functions/settings.js). If the check fails the door stays
   SHUT (Maintenance or Coming Soon — see unreadableLandingState in
   js/api.js): nobody is let in on a guess, and the watcher below opens it
   the moment a real answer says the site is open. */
/* ---------------------------------------------------- THE COUNTDOWN

   Under the Enter button while the site is gated and a launch date is set.
   The markup is in index.html; this fills it and ticks it.

   TWO CONDITIONS, both required: the site is in Coming Soon (not merely
   gated — see showCountdownFor) and a readable launchAt exists. (It used
   to be three — the date also had to be still ahead — and
   that third condition is what stranded launch-morning arrivals; see the
   note on the poll below. A date already past now shows the "any moment"
   state from the first tick.) Either failing and there is no clock, and the
   landing page is what it always was. That is deliberate — the gate is the
   only thing on this page that has to work, and a countdown is decoration
   on top of it.

   WHAT HAPPENS AT ZERO. Not the obvious thing. Reaching zero does NOT open
   the site: the gate is the landingState setting and only an admin flips
   it, which is right — a date typed a fortnight ago should not be able to
   publish the archive on its own while nobody is watching. So at zero the
   clock stops, and the page keeps asking the settings endpoint whether the
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

async function goInside(state) {
    handedOff = true;
    try { Api.rememberLandingState(state); } catch (e) { /* private mode */ }
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
   from the archive restores it exactly as it was left: the button still
   reading "Coming Soon", the countdown still saying "any moment", and the
   poll finished for good — it stopped asking the moment it saw the site
   open, and set `leaving` so it would never go twice. A dead gate over an
   open site, with nothing on it that would ever change.

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

    let leaving = false;
    async function poll() {
        const settings = await freshSettings();
        const state = settings ? settings.landingState : null;
        if (state && !isGatedState(state)) {
            if (leaving) return;
            leaving = true;
            goInside(state);
            return;
        }
        if (state) {
            lastState = state;
            try { onStillGated(state, settings); } catch (e) { /* the poll outlives a bad label */ }
        }
        setTimeout(poll, nextDelay());
    }

    /* The FIRST check is jittered too, and that one matters most: a crowd
       that arrived together (or a page reloaded by the thousand) would
       otherwise all ask in the same second. */
    setTimeout(poll, Math.floor(Math.random() * (far() ? FAR_POLL_MS : COUNTDOWN_POLL_JITTER_MS)));
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
    box.hidden = false;

    const pad = n => String(n).padStart(2, "0");

    // The asking is watchForOpening's, which the caller starts alongside
    // this. All the clock does at zero is stop and say so.
    function tick() {
        const left = target.getTime() - Date.now();
        if (left <= 0) {
            // Stop counting and start watching. The wording is honest about
            // what it knows: the moment has arrived, the switch has not
            // necessarily been thrown. Also what somebody arriving AFTER
            // the launch time sees from the first tick — a clock counting
            // down to a moment already past would be nonsense.
            label.textContent = "Opening any moment now";
            box.classList.add("is-due");
            parts.days.textContent = "0";
            parts.hours.textContent = "00";
            parts.mins.textContent = "00";
            parts.secs.textContent = "00";
            // The one thing worth knowing while waiting: there is nothing
            // to do. The page lets them in by itself.
            when.textContent = "No need to refresh: this page will let you in";
            clearInterval(ticker);
            return;
        }
        const secs = Math.floor(left / 1000);
        parts.days.textContent = String(Math.floor(secs / 86400));
        parts.hours.textContent = pad(Math.floor(secs / 3600) % 24);
        parts.mins.textContent = pad(Math.floor(secs / 60) % 60);
        parts.secs.textContent = pad(secs % 60);
    }

    const ticker = setInterval(tick, 1000);
    tick();

    // Taken down again when the site moves out of Coming Soon without
    // opening (see showCountdownFor).
    return {
        stop() {
            clearInterval(ticker);
            box.hidden = true;
            box.classList.remove("is-due");
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

    const { landingState, launchAt } = await Api.getSiteSettings();

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
    // Past as well as future: startCountdown shows the "any moment" state
    // for a date already gone rather than nothing at all.
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
            if (countdown) { countdown.stop(); countdown = null; }
        }
        showCountdownFor(state);
    }, landingState);
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

    let cachedEvents = null;
    async function ensureEvents() {
        if (!cachedEvents) {
            try { cachedEvents = await Api.getEvents(); }
            catch (e) { cachedEvents = []; }
        }
        return cachedEvents;
    }

    /* Where focus was when the modal opened, so closing it can put focus
       back there. Without this a keyboard or screen-reader user who opened
       an event from the header ticker was dropped at the top of the page on
       close, with no idea where the thing they had been reading went. */
    let eventTrigger = null;

    function closeEventModal() {
        modal.classList.remove("open");
        const back = eventTrigger;
        eventTrigger = null;
        if (back && document.contains(back) && typeof back.focus === "function") {
            back.focus({ preventScroll: true });
        }
        // Same replaceState-not-clear approach as home.js's closeModal —
        // drops the hash without adding a back-button entry or re-firing
        // hashchange.
        if (/^#event-/.test(location.hash)) {
            history.replaceState(null, "", location.pathname + location.search);
        }
    }

    async function openEventModalById(id) {
        const events = await ensureEvents();
        const event = events.find(e => e.id === id);
        if (!event) return;
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
        descEl.textContent = event.description || "";

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
    function checkHash() {
        const m = /^#event-(.+)$/.exec(location.hash);
        if (!m) return;
        // A hand-typed or mangled address can carry a bare "%" that is not
        // an escape, and decodeURIComponent throws on it — which, here at the
        // top of a listener, took the whole handler down. A hash that does not
        // decode names no event, so it is ignored like any other unknown one.
        let id;
        try { id = decodeURIComponent(m[1]); } catch (e) { return; }
        openEventModalById(id);
    }

    window.addEventListener("hashchange", checkHash);
    closeBtn.addEventListener("click", closeEventModal);
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
